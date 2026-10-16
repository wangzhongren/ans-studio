// Core-owned display projection. Adapters consume only the injected Model capability.
import { RUNTIME_CREDENTIAL_ENV_VARS } from '../shared/runtime-shared.ts';
import type {
  DisplayTextV1, ToolDisplayV1, ToolDisplayInputRuleV1, RuntimeToolEventSource,
  RuntimeToolEventProjector, ProjectedRuntimeToolEventV1, ToolEventDetailV1,
  RuntimeToolDisplayDiagnosticDetailV1, RuntimeToolDisplayProfileV1,
  RuntimeLegacyHistoryProjectionInputV1, RuntimeLegacyHistoryProjectionV1,
  RuntimeProtectedLegacyHistoryEntryV1, RuntimeLegacyHistoryEntryV1, SessionEvent,
  RuntimeReasoningDetailProjector, RuntimeReasoningDisplayDetailV1, RuntimeReasoningDisplayDiagnosticDetailV1,
} from '../../model/runtime.ts';

export const DISPLAY_LIMITS = Object.freeze({ target:4096, result:16384, error:4096, summary:1024, display:57344, event:65536, history:1048576, historyRows:4096 });
export const jsonBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');
export function utf8Prefix(text: string, limit: number): string {
  const bytes = Buffer.from(text, 'utf8');
  let end = Math.max(0, Math.floor(limit));
  if (bytes.length <= end) return bytes.toString('utf8');
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString('utf8');
}
export function coreToolTarget(rule: ToolDisplayInputRuleV1 | undefined, args: Readonly<Record<string,unknown>>): string | undefined {
  if (rule === 'core-path-v1') {
    const candidate = args.path ?? args.file_path ?? args.filePath;
    return typeof candidate === 'string' ? candidate : undefined;
  }
  if (rule === 'core-command-v1') {
    for (const key of ['command','cmd']) if (typeof args[key] === 'string') return args[key];
  }
  return undefined;
}
const record = (value: unknown): Record<string,unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
const string = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
function cleanPatterns(text: string): string {
  return text
    .replace(/\[ANS_INPUT_CONTEXT:[a-f0-9-]{36}\]\n?/gi, '')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:--)?\b(?:api[_-]?key|access_token|auth_token|oauth_token|password|secret|authorization|cookie)\b\s*(?:[=:]\s*|\s+))("[^"\r\n]*"|'[^'\r\n]*'|"[^\r\n]*|'[^\r\n]*|[^\s,;]+)/gi, '$1[REDACTED]')
    // A-base 收窄（2026-10-16 提案 core-cleanpatterns-url-boundary 实施）：排除集追加 CJK 标点块
    // `　-〿`（　。〈〉「」…）与全角形式块 `＀-￯`（；：，（）？！）——URL 紧贴此类
    // 标点（无 ASCII 空白）时不再把标点及其后文本一并吞入归一（旧行为＝丢文本 / percent-encode
    // mojibake）；匹配后的归一处理（剥 userinfo/query/hash）逐字不变，零泄漏口径不放松。ASCII `;`
    // （如路径参数 jsessionid）不在排除集内，行为保持。
    .replace(/https?:\/\/[^\s<>"'　-〿＀-￯]+/gi, value => {
      try { const url = new URL(value); url.username=''; url.password=''; url.search=''; url.hash=''; return url.toString(); }
      catch { return '[URL]'; }
    })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '\ufffd');
}
function texts(value: unknown, into: DisplayTextV1[] = []): DisplayTextV1[] {
  if (!value || typeof value !== 'object') return into;
  const item = value as Record<string,unknown>;
  if (typeof item.text === 'string' && typeof item.truncated === 'boolean' && typeof item.redacted === 'boolean') into.push(item as DisplayTextV1);
  else for (const child of Object.values(item)) texts(child, into);
  return into;
}
function fit(value: unknown, limit: number, candidates: DisplayTextV1[]): boolean {
  for (const field of candidates) {
    while (jsonBytes(value) > limit && field.text.length) {
      const length = Buffer.byteLength(field.text);
      field.text = utf8Prefix(field.text, Math.max(0, length - Math.max(256, jsonBytes(value)-limit)));
      field.truncated = true;
    }
    if (jsonBytes(value) <= limit) return true;
  }
  return jsonBytes(value) <= limit;
}

export function createToolDisplayContext(options: { credentialEnvNames?: readonly string[]; env?: Readonly<Record<string,string|undefined>>; requireProfile?:boolean } = {}) {
  const names = [...new Set([...RUNTIME_CREDENTIAL_ENV_VARS, ...(options.credentialEnvNames ?? [])])];
  const env = options.env ?? process.env;
  const secrets = new Set(names.flatMap(name => env[name] ? [env[name]!] : []));
  let ready = options.requireProfile !== true;
  let profileFingerprint: string | undefined;
  const budgetCuts=new WeakSet<DisplayTextV1>();
  const protectText = (raw: string, limit: number, prior?: Partial<DisplayTextV1>, redactText?: (value:string)=>string): DisplayTextV1 => {
    let value = redactText ? redactText(raw) : raw;
    if (typeof value !== 'string') throw new Error('Display profile returned an invalid value');
    for (const secret of [...secrets].sort((a,b)=>b.length-a.length)) value = value.split(secret).join('[REDACTED]');
    value = cleanPatterns(value);
    const safe = utf8Prefix(value, limit);
    const protectedValue={text:safe,truncated:prior?.truncated===true||safe!==value,redacted:prior?.redacted===true||value!==raw};
    if(safe!==value)budgetCuts.add(protectedValue);return protectedValue;
  };
  const registerToolDisplayProfile = (profile: RuntimeToolDisplayProfileV1): void => {
    if (!profile || !Array.isArray(profile.credentials)) throw new Error('Invalid tool display profile');
    const allowed = new Set([...names, ...(profile.apiKeyEnvVar ? [profile.apiKeyEnvVar] : [])]);
    const selected = profile.credentials.filter(item => item && allowed.has(item.name) && typeof item.value === 'string' && item.value !== '');
    const fingerprint = JSON.stringify(selected.map(item=>[item.name,item.value]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
    if (profileFingerprint !== undefined && fingerprint !== profileFingerprint) throw new Error('Tool display profile cannot change within a bound session');
    for (const item of selected) secrets.add(item.value!);
    profileFingerprint = fingerprint;
    ready = true;
  };
  const diagnostic = (code: RuntimeToolDisplayDiagnosticDetailV1['code']): ProjectedRuntimeToolEventV1 => ({ kind:'message', summary:'工具详情无法安全显示', detail:{version:1,source:'tool-display-diagnostic',code} });
  const projectToolEvent: RuntimeToolEventProjector = (source, redactText) => {
    if (!ready) return diagnostic('DISPLAY_PROFILE_NOT_READY');
    try {
      if (source.origin === 'diagnostic') return diagnostic(source.code);
      if (source.origin === 'legacy-event' || source.origin === 'projected-event') {
        const event = source.event;
        const d = record(event.detail), call = record(d.call), result = record(d.result);
        if (d.source === 'tool-display-diagnostic') return diagnostic(['IDENTITY_TOO_LARGE','PROJECTION_FAILED','RESULT_OUTCOME_UNAVAILABLE','DISPLAY_PROFILE_NOT_READY','CALL_CONTEXT_UNATTRIBUTED'].includes(String(d.code)) ? d.code as RuntimeToolDisplayDiagnosticDetailV1['code'] : 'PROJECTION_FAILED');
        const toolName = string(d.toolName) ?? string(d.name) ?? string(call.name) ?? '';
        const phase = ['start','blocked','result'].includes(String(d.phase)) ? d.phase as 'start'|'blocked'|'result' : event.kind === 'tool_call' ? 'start' : event.kind === 'denied' ? 'blocked' : 'result';
        const display = record(d.display);
        const displayText = (field:unknown,max:number):DisplayTextV1|undefined => {
          const f=record(field);return typeof f.text==='string' ? protectText(f.text,max,{truncated:f.truncated===true,redacted:f.redacted===true},redactText) : undefined;
        };
        const target=record(display.target), process=record(display.process);
        const projected: ToolDisplayV1 = {version:1,omissions:[]};
        if (display.version === 1) {
          if (target.kind==='path'||target.kind==='command') {const value=displayText(target.value,DISPLAY_LIMITS.target);if(value) projected.target={kind:target.kind,value};}
          projected.resultText=displayText(display.resultText,DISPLAY_LIMITS.result);
          projected.error=displayText(display.error,DISPLAY_LIMITS.error);
          if (Object.keys(process).length) projected.process={...(finite(process.exitCode)&&Number.isInteger(process.exitCode)?{exitCode:process.exitCode}:{}),...(process.timedOut===true?{timedOut:true}:{}),...(typeof process.signal==='string'?{signal:protectText(process.signal,128,undefined,redactText).text}:{}),...(displayText(process.stdout,DISPLAY_LIMITS.result)?{stdout:displayText(process.stdout,DISPLAY_LIMITS.result)}:{}),...(displayText(process.stderr,DISPLAY_LIMITS.result)?{stderr:displayText(process.stderr,DISPLAY_LIMITS.result)}:{})};
          if(finite(display.durationMs)&&display.durationMs>=0)projected.durationMs=display.durationMs;
          projected.omissions=Array.isArray(display.omissions)?display.omissions.filter((x):x is ToolDisplayV1['omissions'][number]=>['budget','unsupported-input','unsupported-content'].includes(String(x))):[];
        } else {
          const args=record(call.args ?? d.args);
          const path=string(d.path)??string(args.path),command=string(d.command)??string(args.command);
          if(path!==undefined)projected.target={kind:'path',value:protectText(path,DISPLAY_LIMITS.target,undefined,redactText)};
          else if(command!==undefined)projected.target={kind:'command',value:protectText(command,DISPLAY_LIMITS.target,undefined,redactText)};
          if(phase!=='start')projected.resultText=protectText(string(result.message)??event.summary,DISPLAY_LIMITS.result,undefined,redactText);
          if(finite(d.durationMs)&&d.durationMs>=0)projected.durationMs=d.durationMs;
        }
        const ok=typeof d.ok==='boolean'?d.ok:typeof result.ok==='boolean'?result.ok:undefined;
        const detail:ToolEventDetailV1={toolName,phase,...(string(d.toolCallId??call.toolCallId)?{toolCallId:String(d.toolCallId??call.toolCallId)}:{}),...(string(event.turnId??d.turnId)?{turnId:String(event.turnId??d.turnId)}:{}),...(ok!==undefined?{ok,status:ok?'completed':'failed'}:{}),...(string(d.errorCode)?{errorCode:String(d.errorCode)}:{}),display:projected};
        const output:ProjectedRuntimeToolEventV1={...identity(event),kind:event.kind==='tool_call'?'tool_call':event.kind==='denied'?'denied':'accepted',summary:protectText(event.summary,DISPLAY_LIMITS.summary,undefined,redactText).text,detail};
        return finish(output);
      }
      const detail:ToolEventDetailV1={toolName:source.toolName,phase:source.phase,...(source.toolCallId!==undefined?{toolCallId:source.toolCallId}:{}),...(source.turnId!==undefined?{turnId:source.turnId}:{})};
      const display:ToolDisplayV1={version:1,omissions:[]};
      if(source.input){const target=coreToolTarget(source.input.rule,source.input.args);if(target!==undefined)display.target={kind:source.input.rule==='core-command-v1'?'command':'path',value:protectText(target,DISPLAY_LIMITS.target,undefined,redactText)};else if(!source.input.rule)display.omissions.push('unsupported-input');}
      if(finite(source.durationMs)&&source.durationMs>=0)display.durationMs=source.durationMs;
      let kind: 'tool_call'|'accepted'|'denied' = 'tool_call';
      // F-8-a / F-1 措辞分类：进程**跑完** + 退出码非零不再以「执行失败」呈现（grep 无匹配 exit 1 是合法结果）；
      // timedOut 独立措辞「超时终止」；ok/status/kind/errorCode 契约不动，spawn 失败（execution.error）仍如实「执行失败」。
      let outcomeWord = '调用发起';
      if(source.phase!=='start'){
        let ok:boolean|undefined;
        if(source.phase==='blocked')ok=false;
        else if(source.native)ok=!source.native.isError;
        else if(source.result)ok=source.result.ok;
        else if(source.error)ok=false;
        if(ok===undefined)return diagnostic('RESULT_OUTCOME_UNAVAILABLE');
        kind=ok?'accepted':'denied';detail.ok=ok;detail.status=ok?'completed':'failed';
        let message=source.result?.message;
        if(source.phase==='result'&&source.native){if(message===undefined){const parts=source.native.content.filter((x):x is {type:'text';text:string}=>x.type==='text');if(parts.length)message=parts.map(x=>x.text).join('\n');}if(source.native.content.some(x=>x.type==='unsupported'))display.omissions.push('unsupported-content');}
        if(message!==undefined)display.resultText=protectText(message,DISPLAY_LIMITS.result,undefined,redactText);
        const execution=source.phase==='result'?source.result?.execution:undefined;
        const error=source.error?.message??execution?.error??(!ok?message:undefined);
        if(error!==undefined)display.error=protectText(error,DISPLAY_LIMITS.error,undefined,redactText);
        if(source.error?.code!==undefined)detail.errorCode=source.error.code;
        if(execution) display.process={...(finite(execution.exitCode)&&Number.isInteger(execution.exitCode)?{exitCode:execution.exitCode}:{}),...(execution.timedOut===true?{timedOut:true}:{}),...(execution.signal!==undefined?{signal:protectText(execution.signal,128,undefined,redactText).text}:{}),...(execution.stdout!==undefined?{stdout:protectText(execution.stdout,DISPLAY_LIMITS.result,{truncated:execution.stdoutTruncated},redactText)}:{}),...(execution.stderr!==undefined?{stderr:protectText(execution.stderr,DISPLAY_LIMITS.result,{truncated:execution.stderrTruncated},redactText)}:{})};
        const exitCode=execution!==undefined&&finite(execution.exitCode)&&Number.isInteger(execution.exitCode)?execution.exitCode:undefined;
        const exitedWithNonzeroCode=exitCode!==undefined&&execution!==undefined&&execution.error===undefined&&execution.signal===undefined&&execution.timedOut!==true;
        outcomeWord=source.phase==='blocked'?'已阻断':ok?'执行完成':execution?.timedOut===true?'超时终止':exitedWithNonzeroCode?`已执行完成（退出码 ${exitCode}）`:'执行失败';
      }
      detail.display=display;
      const summary=protectText(`${source.toolName} ${outcomeWord}${display.target?`：${display.target.value.text}`:''}${display.error?`（${display.error.text}）`:''}`,DISPLAY_LIMITS.summary,undefined,redactText).text;
      return finish({...identity(source),kind,summary,detail});
    }catch{return diagnostic('PROJECTION_FAILED');}
  };
  function finish(event:ProjectedRuntimeToolEventV1):ProjectedRuntimeToolEventV1{
    const d=event.detail as ToolEventDetailV1, display=d.display;
    const candidates=display?[display.process?.stdout,display.process?.stderr,display.resultText,display.error,display.target?.value].filter((x):x is DisplayTextV1=>!!x):[];
    const budgetChanged=!!display&&(jsonBytes(display)>DISPLAY_LIMITS.display||jsonBytes(event)>DISPLAY_LIMITS.event||texts(display).some(x=>budgetCuts.has(x)));
    if(display&&!fit(display,DISPLAY_LIMITS.display,candidates))return diagnostic('IDENTITY_TOO_LARGE');
    if(!fit(event,DISPLAY_LIMITS.event,candidates))return diagnostic('IDENTITY_TOO_LARGE');
    if(display&&budgetChanged&&!display.omissions.includes('budget'))display.omissions.push('budget');
    if(display&&!fit(display,DISPLAY_LIMITS.display,candidates))return diagnostic('IDENTITY_TOO_LARGE');
    if(jsonBytes(event)>DISPLAY_LIMITS.event){if(!fit(event,DISPLAY_LIMITS.event,candidates))return diagnostic('IDENTITY_TOO_LARGE');}
    return event;
  }
  function projectLegacyHistory(input:RuntimeLegacyHistoryProjectionInputV1):RuntimeLegacyHistoryProjectionV1{
    const fail=(code:'INVALID_INPUT'|'PROJECTION_FAILED'):RuntimeLegacyHistoryProjectionV1=>({ok:false,version:1,code,message:{text:'历史显示保护未能完成',redacted:false,truncated:false},entries:[]});
    try{
      if(!input||input.scope?.runtime!=='pi'||typeof input.scope.roleId!=='string'||!input.scope.roleId||Buffer.byteLength(input.scope.roleId)>4096||!Array.isArray(input.entries)||typeof input.readOk!=='boolean'||!Number.isSafeInteger(input.skipped)||input.skipped<0)return fail('INVALID_INPUT');
      const entries:RuntimeProtectedLegacyHistoryEntryV1[]=[];let invalidEntries=0;
      for(const raw of input.readOk?input.entries:[]){
        const row=raw as RuntimeLegacyHistoryEntryV1;
        if(!row||!['user-text','assistant-text','tool-record'].includes(row.kind)||typeof row.text!=='string'){invalidEntries++;continue;}
        const metadataOmissions:RuntimeProtectedLegacyHistoryEntryV1['metadataOmissions'][number][]=[];
        const base:{at?:string;anchor?:RuntimeLegacyHistoryEntryV1['anchor'];metadataOmissions:typeof metadataOmissions}={metadataOmissions};
        if(row.at){const at=protectText(row.at,64);if(!at.redacted&&!at.truncated&&/^\d{4}-\d\d-\d\dT/.test(at.text)&&Number.isFinite(Date.parse(at.text)))base.at=at.text;else metadataOmissions.push('timestamp');}
        if(row.anchor){if(/^legacy-anchor-v1:[a-f0-9]{64}$/.test(row.anchor.token)&&['request','conclusion'].includes(row.anchor.position))base.anchor={token:row.anchor.token,position:row.anchor.position,...(typeof row.anchor.nativeCallId==='string'?{nativeCallId:row.anchor.nativeCallId}:{})};else metadataOmissions.push('anchor-token');}
        if(row.kind!=='tool-record')entries.push({...base,kind:row.kind,text:protectText(row.text,DISPLAY_LIMITS.result)});
        else{
          const f=row.tool;
          if(!f||typeof f.toolName!=='string'||!['start','result'].includes(f.phase)){invalidEntries++;continue;}
          const target=f.target&&['path','command'].includes(f.target.kind)&&['argument','tool-detail','same-call'].includes(f.target.source)&&typeof f.target.value==='string'?{kind:f.target.kind,source:f.target.source,value:protectText(f.target.value,DISPLAY_LIMITS.target)}:undefined;
          const display:ToolDisplayV1={version:1,omissions:[],...(target?{target:{kind:target.kind,value:target.value}}:{}),...(f.phase==='result'?{resultText:protectText(row.text,DISPLAY_LIMITS.result)}:{})};
          entries.push({...base,kind:'tool-record',text:protectText(row.text,DISPLAY_LIMITS.result),tool:{toolName:f.toolName,phase:f.phase,...(typeof f.toolCallId==='string'?{toolCallId:f.toolCallId}:{}),...(typeof f.turnId==='string'?{turnId:f.turnId}:{}),...(typeof f.ok==='boolean'?{ok:f.ok}:{}),...(['completed','returned','failed','unknown'].includes(String(f.reportedStatus))?{reportedStatus:f.reportedStatus}:{}),...(['native-result','tool-details','legacy-classifier'].includes(String(f.statusSource))?{statusSource:f.statusSource}:{}),...(target?{target}:{}),display}});
        }
        const entry=entries.at(-1)!;
        if(!fit(entry,DISPLAY_LIMITS.event,texts(entry)))entries[entries.length-1]={kind:'projection-diagnostic',code:'IDENTITY_TOO_LARGE',text:{text:'旧记录身份超出显示上限',truncated:false,redacted:false},metadataOmissions:['oversize-identity']};
      }
      const output:Extract<RuntimeLegacyHistoryProjectionV1,{ok:true}>={ok:true,version:1,scope:{roleId:input.scope.roleId,runtime:'pi'},origin:'legacy-native',entries:[],reader:{ok:input.readOk,skipped:input.skipped,...(typeof input.source==='string'?{source:protectText(input.source,1024)}:{}),...(typeof input.error==='string'?{error:protectText(input.error,DISPLAY_LIMITS.error)}:{})},projection:{invalidEntries,omittedEntries:0,truncated:false},protection:'current-known-values-and-patterns'};
      const chosen:RuntimeProtectedLegacyHistoryEntryV1[]=[];
      for(let index=entries.length-1;index>=0;index--){if(chosen.length>=DISPLAY_LIMITS.historyRows)break;chosen.unshift(entries[index]);output.entries=chosen;output.projection.omittedEntries=entries.length-chosen.length;if(jsonBytes(output)>DISPLAY_LIMITS.history){chosen.shift();break;}}
      output.entries=chosen;output.projection.omittedEntries=entries.length-chosen.length;
      output.projection.truncated=output.projection.omittedEntries>0||texts(output).some(x=>x.truncated);
      if(jsonBytes(output)>DISPLAY_LIMITS.history)return fail('INVALID_INPUT');
      return output;
    }catch{return fail('PROJECTION_FAILED');}
  }
  // —————————————— G-5 推理事实通道：**核心投影单点** ——————————————
  //
  // 唯一入口：原始事实（`text: string`）→ 脱敏＋预算（与工具面同管道：凭据值替换/cleanPatterns/
  // UTF-8 字节裁剪）→ 呈现详情（`text: DisplayTextV1`）。Service 在 emit/历史读取对
  // `detail.source==="reasoning"` 恰一次调用本函数；**重复投影幂等**（已投影形按 prior 标记再归一时
  // 形状不变）——历史读取路径对存量投影形再投影走的就是这条。坏件一律返回如实诊断形，**绝不抛**；
  // 不依赖 profile 就绪（历史读路径无 profile 注册；正文在 emit 时已全量脱敏，重投影只是同管道归一）。
  const reasoningDiagnostic: RuntimeReasoningDisplayDiagnosticDetailV1 = {version:1,source:'reasoning-diagnostic',code:'PROJECTION_FAILED'};
  const projectReasoningDetail: RuntimeReasoningDetailProjector = (detail, redactText) => {
    try {
      const d = record(detail);
      if (d.version !== 1 || d.source !== 'reasoning') return reasoningDiagnostic;
      const facts = record(d.reasoning);
      const status = facts.status === 'complete' ? 'complete' as const : facts.status === 'omitted' ? 'omitted' as const : undefined;
      if (status === undefined) return reasoningDiagnostic;
      let text: DisplayTextV1;
      if (typeof facts.text === 'string') text = protectText(facts.text, DISPLAY_LIMITS.result, undefined, redactText);
      else {
        const projected = record(facts.text);
        if (typeof projected.text !== 'string') return reasoningDiagnostic;
        text = protectText(projected.text, DISPLAY_LIMITS.result, { truncated: projected.truncated === true, redacted: projected.redacted === true }, redactText);
      }
      // omitted＝平台省略正文：正文一律不呈现（即便载荷违规带了正文——如实优先于保留违规内容）。
      if (status === 'omitted') text = { text: '', truncated: false, redacted: false };
      // 时长只透传**真实信号**：有限且非负；缺失/非法（含负数、NaN、非数字）一律不携带——绝不发明时间。
      const durationMs = typeof facts.durationMs === 'number' && Number.isFinite(facts.durationMs) && facts.durationMs >= 0 ? facts.durationMs : undefined;
      return { version: 1, source: 'reasoning', reasoning: { text, status, ...(durationMs !== undefined ? { durationMs } : {}) } };
    } catch { return reasoningDiagnostic; }
  };
  return {projectToolEvent,projectReasoningDetail,protectText,registerToolDisplayProfile,credentialEnvNames:names,assertReady(){if(!ready)throw new Error('Core-managed tool display profile was not registered');},projectLegacyHistory};
}
function identity(value:{runtime?:unknown;roleId?:unknown;turnId?:unknown}):Pick<SessionEvent,'runtime'|'roleId'|'turnId'>{return{...(typeof value.runtime==='string'?{runtime:value.runtime as SessionEvent['runtime']}:{}),...(typeof value.roleId==='string'?{roleId:value.roleId}:{}),...(typeof value.turnId==='string'?{turnId:value.turnId}:{})};}
