// Public Service composition entry. Pipeline selects runtime and injects policy; Providers execute it.
import { randomUUID, createHash } from "node:crypto";
import { RuntimeDeliveryError } from "../../model/runtime.ts";
import type { ResolvedRole } from "../../model/role.ts";
import type {
  GovernedToolsOptions, PromptInputEventDetail, PromptOptions, RoleSession, RuntimeAdapter, RuntimeKind, RuntimeProviderFactory,
  RuntimeProviderOptions, RuntimeReplayEntry, RuntimeSessionRecord, RuntimeTurnOutcome, SessionEvent, ToolCall, WriteGate,
  RuntimeLegacyHistoryProjectionInputV1, RuntimeLegacyHistoryProjectionV1, RuntimeSessionStorage,
  RuntimeSessionPersistence, RuntimeReportDraftV1, RuntimeReportSnapshotV1, RuntimeLiveReportDraftV1, RuntimeLiveReportViewV1,
  RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1, RuntimeInputTextProjectionV1, RuntimeDeliveryReceiptV1,
  RuntimeReplayCheckpoint, RuntimePersistenceChangeV1, ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1,
  DeliveryReceiptQueryV1, RuntimePersistenceErrorCode, RuntimeDeliveryProgressV1,
  RuntimeReasoningEventDetailV1,
} from "../../model/runtime.ts";
import { RUNTIME_KINDS } from "../../common/shared/runtime-shared.ts";
import { buildGovernedTools, createDemoRuntimeAdapter } from "../../provider/runtime/tools.ts";
import { createRuntimeSessionStore, readRuntimeSessionHistory as readStoredRuntimeSessionHistory } from "../../provider/runtime/session-store.ts";
import { createToolDisplayContext, jsonBytes } from "../../common/runtime-core/tool-display.ts";
import { listInstalledMcpServers } from "../../common/runtime-core/mcp-declarations.ts";
import { REPORT_LIMITS, makeReportSnapshot, canonicalJson, reportIdFor, validateProvenance, validateLivePresentation, projectLiveReport, projectHandbackInput, validAttemptId } from "../../common/runtime-core/report-provenance.ts";
import { createEventQueue } from "../../common/runtime-core/event-queue.ts";
import { DEFAULT_TURN_LAST_RESORT_MS, createInteractionGate, isAbortError, isTimeoutError, raceAbort, resolveRuntimeTimeouts, withPausableTimeout, withTimeout } from "../../common/runtime-core/timeout.ts";
import { REASONING_DIAGNOSTIC_SUMMARY, REASONING_EVENT_SUMMARY, resolveReasoningEffort } from "../../common/runtime-core/reasoning.ts";

export interface RuntimeSessionOptions extends Omit<GovernedToolsOptions, "currentTurnId" | "roleId" | "runtime" | "interactionGate"> {
  runtime: RuntimeKind;
  gate: WriteGate;
  projectRoot: string;
  skillRoot: string;
  /** No persistence unless explicitly enabled; no eager .ans creation. */
  persistSession?: boolean;
  providerFactories?: Partial<Record<RuntimeKind, RuntimeProviderFactory>>;
  modelId?: string;
  baseUrl?: string;
  providerId?: string;
  apiKeyEnvVar?: string;
  /** 到点检查时限（历史字段名）：看护到点检查用，**不中止整轮**。 */
  promptTimeoutMs?: number;
  /** 整轮最后兜底（毫秒；缺省 1 小时）；测试/宿主可注入小值。 */
  turnLastResortMs?: number;
  constructTimeoutMs?: number;
  /** Demo-only script; no SDK and no fallback for another runtime. */
  script?: ToolCall[];
}

/** Tool kind alone is insufficient for generic accepted/denied engine facts. */
function routeRuntimeDisplayEvent(event:SessionEvent,display:ReturnType<typeof createToolDisplayContext>,origin:"legacy-event"|"projected-event"):SessionEvent {
  const detail=event.detail&&typeof event.detail==='object'&&!Array.isArray(event.detail)?event.detail as Record<string,unknown>:{};
  const call=detail.call&&typeof detail.call==='object'&&!Array.isArray(detail.call)?detail.call as Record<string,unknown>:{};
  const namedTool=[detail.toolName,call.name].some(value=>typeof value==='string'&&value.trim().length>0);
  if(event.kind==='tool_call'||namedTool)return display.projectToolEvent({origin,event});
  const turnId=event.turnId??(typeof detail.turnId==='string'?detail.turnId:undefined);
  const safeDetail={...(turnId!==undefined?{turnId}:{}),...(['completed','failed','aborted','timed_out'].includes(String(detail.outcome))?{outcome:detail.outcome}:{})};
  return {kind:event.kind,summary:display.protectText(event.summary,16384).text,...(event.runtime!==undefined?{runtime:event.runtime}:{}),...(event.roleId!==undefined?{roleId:event.roleId}:{}),...(turnId!==undefined?{turnId}:{}),...(Object.keys(safeDetail).length?{detail:safeDetail}:{})};
}

/** Pipeline-facing history operation. ANS replay never establishes native model restoration. */
export async function readRuntimeSessionHistory(options: {
  projectRoot: string; roleId: string; runtime: RuntimeKind; credentialEnvNames?: readonly string[];
}): Promise<{ record?: RuntimeSessionRecord; entries: RuntimeReplayEntry[];reports?:RuntimeReportSnapshotV1[];reportErrors?:{reportId?:string;code:string}[] }> {
  const history = await readStoredRuntimeSessionHistory(options);
  const display = createToolDisplayContext({credentialEnvNames:options.credentialEnvNames});
  const reportHistory=await createRuntimeSessionStore(options).readReports!();
  const reports=reportHistory.reports.map(report=>({...report,summary:display.protectText(report.summary.text,16384,report.summary),evidence:report.evidence.map(item=>display.protectText(item.text,2048,item))}));
  return {...history,...(reports.length?{reports}:{}),...(reportHistory.reportErrors.length?{reportErrors:reportHistory.reportErrors}:{}), ...(history.record ? {record:{...history.record,...(history.record.contextWarning?{contextWarning:display.protectText(history.record.contextWarning,4096).text}:{})}} : {}), entries:history.entries.map(entry=>{
    if(entry.kind === "user") return {...entry,text:display.protectText(entry.text ?? "",16384).text};
    const event=entry.event!;
    if(event.kind === "tool_call" || event.kind === "accepted" || event.kind === "denied") return {...entry,event:routeRuntimeDisplayEvent(event,display,"legacy-event")};
    const detail=event.detail && typeof event.detail === "object" ? event.detail as Record<string,unknown> : {};
    // G-5：历史读取对 `detail.source==="reasoning"` 过**同一投影单点**（存量投影形＝幂等归一；
    // 手编/旧版原始事实＝同管道脱敏＋预算——回放面与实时面形状唯一）。
    const safeDetail = detail.source === "prompt-input" && typeof detail.text === "string" ? {...detail,text:display.protectText(detail.text,16384).text}
      : detail.source === "reasoning" ? {...display.projectReasoningDetail(detail as unknown as RuntimeReasoningEventDetailV1), ...(typeof detail.turnId === "string" ? {turnId: detail.turnId} : {})}
      : detail;
    return {...entry,event:{...event,summary:display.protectText(event.summary,16384).text,detail:safeDetail}};
  })};
}

/** Pure Model-value bridge for the existing native-only reader; no filesystem or SDK calls. */
export function projectRuntimeLegacyHistory(input: RuntimeLegacyHistoryProjectionInputV1): RuntimeLegacyHistoryProjectionV1 {
  return createToolDisplayContext({credentialEnvNames:input?.credentialEnvNames}).projectLegacyHistory(input);
}

/** Pure live report value: no store or SDK construction. */
export function projectRuntimeLiveHandback(draft:RuntimeLiveReportDraftV1,context?:{credentialEnvNames?:readonly string[]}):RuntimeLiveReportViewV1 {
  return projectLiveReport(draft,createToolDisplayContext({credentialEnvNames:context?.credentialEnvNames}).protectText);
}

async function defaultFactory(runtime: RuntimeKind): Promise<RuntimeProviderFactory> {
  if (runtime === "demo") return (options) => createDemoRuntimeAdapter(options);
  // Variable imports keep absent SDK adapters lazy during staged assembly.
  const modulePath = `../../provider/${runtime}/session.ts`;
  const module = await import(modulePath) as Record<string, unknown>;
  const name = runtime === "pi" ? "createPiRuntimeAdapter" : runtime === "codex" ? "createCodexRuntimeAdapter" : "createClaudeRuntimeAdapter";
  const factory = module[name];
  if (typeof factory !== "function") throw new Error(`${runtime} 提供方缺少公开工厂 ${name}`);
  return factory as RuntimeProviderFactory;
}


export function createRuntimeAdapter(options: RuntimeSessionOptions): RuntimeAdapter {
  if (!(RUNTIME_KINDS as readonly string[]).includes(options.runtime)) throw new Error(`未知运行时：${options.runtime}`);
  const providers = new Map<ResolvedRole, Promise<{
    adapter: RuntimeAdapter; options: RuntimeProviderOptions; display: ReturnType<typeof createToolDisplayContext>; setTurn(id?: string, controller?: AbortController): void;
  }>>();
  const providerFor = (role: ResolvedRole) => {
    let provider = providers.get(role);
    if (provider) return provider;
    provider = (async () => {
      let turnId: string | undefined;
      let controller: AbortController | undefined;
      const interactionGate = createInteractionGate();
      const display = createToolDisplayContext({credentialEnvNames:[...(options.extraCredentialEnvVars ?? []),...(options.apiKeyEnvVar ? [options.apiKeyEnvVar] : [])],requireProfile:true});
      const storage = options.persistSession ? createRuntimeSessionStore({ projectRoot: options.projectRoot, roleId: role.id, runtime: options.runtime }) : undefined;
      const tools = buildGovernedTools(options.gate, {
        ...options,
        readRoot: options.readRoot ?? options.projectRoot,
        writeRoot: options.writeRoot,
        shellCwd: options.shellCwd ?? options.projectRoot,
        extraCredentialEnvVars: [...(options.extraCredentialEnvVars ?? []), ...(options.apiKeyEnvVar ? [options.apiKeyEnvVar] : [])],
        roleId: role.id,
        currentTurnId: () => turnId,
        interactionGate,
      }).map((tool) => ({ ...tool, async handler(call: Parameters<typeof tool.handler>[0]) {
        const signal = controller?.signal;
        if (turnId === undefined || signal?.aborted) return { ok: false, message: `${tool.name}：本轮未运行或已中止，未执行` };
        return tool.handler({ ...call, signal: signal && call.signal ? AbortSignal.any([signal, call.signal]) : signal ?? call.signal });
      } }));
      // G-5：推理强度（wave 1 接线）——按运行时读 env（`ANS_CLAUDE/CODEX/PI_REASONING_EFFORT`）并
      // 归一（**纯读**，providerFor 每次重建即重读＝「改设置 ⇒ 下次开会话生效」沿既有语义）。非法值＝
      // **按未设处理**（零参数、零行为变化）＋诊断如实；**绝不因偏好值坏件拒开会话/毁轮次**（偏好不是
      // 承载件）。未设＝不注入字段（逐字现状；三平台原生消费属适配器批次＝wave 2）。
      const reasoningEffort = resolveReasoningEffort(options.runtime);
      if (reasoningEffort.state === "invalid") {
        try { options.diagnostics?.record("reasoning.effort.invalid", { mode: options.runtime, supported: false, reasonCode: "invalid-value" }); } catch { /* 诊断绝不能改变执行 */ }
      }
      const providerOptions: RuntimeProviderOptions = {
        runtime: options.runtime, projectRoot: options.projectRoot, skillRoot: options.skillRoot,
        tools, storage, interactionGate, currentTurnId: () => turnId,
        toolDisplayMode:"required-v1", projectToolEvent:display.projectToolEvent, registerToolDisplayProfile:display.registerToolDisplayProfile, toolDisplayCredentialEnvNames:display.credentialEnvNames,
        modelId: options.modelId, baseUrl: options.baseUrl, providerId: options.providerId, apiKeyEnvVar: options.apiKeyEnvVar,
        // G-4 V2（wave A）：按角色读取 `docs/mcp/**` 声明并随会话注入（**纯读**——绝不建目录；坏件由
        // 读取器跳过＋诊断，绝不影响开会话）。适配器对 `installedMcpServers` 纯消费（装配/放行/呈现
        // 属各平台批次 P1–P3）；providerFor 每次重建即重读——「安装/卸载 ⇒ 下次开会话生效」。
        installedMcpServers: listInstalledMcpServers(options.projectRoot, role.id),
        // G-5：仅 `set` 态注入字段；`unset`/`invalid` 保持**字段缺席**（逐字现状的机读形态）。
        ...(reasoningEffort.state === "set" ? { reasoningEffort: reasoningEffort.effort } : {}),
        ...resolveRuntimeTimeouts(options.runtime, options),
      };
      const factory = options.providerFactories?.[options.runtime] ?? (options.runtime === "demo"
        ? ((input: RuntimeProviderOptions) => createDemoRuntimeAdapter(input, options.script ?? [{ name: "write_file", args: { path: "src/evil.ts", content: "// 越界写入示例\n" } }]))
        : await defaultFactory(options.runtime));
      if (typeof providerOptions.projectToolEvent !== "function" || typeof providerOptions.registerToolDisplayProfile !== "function") throw new Error("Core tool display capability missing");
      const adapter = await factory(providerOptions);
      return { adapter, display, options: providerOptions, setTurn(id?: string, nextController?: AbortController) { turnId = id; controller = nextController; } };
    })();
    providers.set(role, provider);
    return provider;
  };
  return {
    async composeContext(role) { return (await providerFor(role)).adapter.composeContext(role); },
    async bindRole(role) {
      const provider = await providerFor(role);
      const storage = provider.options.storage;
      const previous = await storage?.readLatest();
      const inner = await withTimeout(provider.adapter.bindRole(role), provider.options.constructTimeoutMs ?? 120000, `${options.runtime} 建立角色会话`);
      try { provider.display.assertReady(); } catch (error) { await inner.dispose(); throw error; }
      providers.delete(role); // Each bound session owns its own turn/controller/tool closure.
      const queue = createEventQueue<SessionEvent>();
      const recordId = previous?.id ?? randomUUID();
      const createdAt = previous?.createdAt ?? new Date().toISOString();
      type Turn = { plan?:DeliveryPlan; id: string; controller: AbortController; outcome: RuntimeTurnOutcome; outcomeLocked?: boolean; terminal: () => void; terminalPromise: Promise<void>; abortPromise?: Promise<void>; cleanupFailed?: boolean };
      let active: Turn | undefined;
      let disposed = false;
      let quarantined = false;
      let streamEnded = false;
      let pendingPersist = Promise.resolve();
      let persistenceError: unknown;
      let deliveryPreflight=false;
      const endedTurns=new Set<string>();
      const persistence=createPersistenceState({scope:{roleId:role.id,runtime:options.runtime},projectRoot:options.projectRoot,storage,display:provider.display,diagnostics:options.diagnostics,ended:endedTurns,disposed:()=>disposed,active:()=>!!active||deliveryPreflight});
      const requestAbort = (turn: Turn): Promise<void> => {
        if (!turn.abortPromise) {
          turn.abortPromise = withTimeout(Promise.resolve().then(() => inner.abort?.()), 1000, "中止清理").catch((error) => {
            turn.cleanupFailed = true;
            quarantined = true;
            throw error;
          });
        }
        return turn.abortPromise;
      };
      const emit = (inputEvent: SessionEvent, plan:DeliveryPlan|undefined=active?.plan, visible=true) => {
        let event = inputEvent.kind === "tool_call" || inputEvent.kind === "accepted" || inputEvent.kind === "denied" ? routeRuntimeDisplayEvent(inputEvent,provider.display,"projected-event") : inputEvent;
        // G-5 推理事实通道**单点**：`detail.source==="reasoning"` 的原始事实在此恰一次过核心投影
        // （脱敏＋预算，实现＝display context 的 projectReasoningDetail）——队列/持久化/桌面所见一律为
        // 投影形（或如实诊断形）；原始正文绝不外流。summary 定格为常量（承载语义全在 detail；杜绝
        // 未脱敏的随载荷文本借 summary 外流）；`turnId` 由 pump 并入 detail，投影后原样保留。
        const reasoningCarrier = event.detail && typeof event.detail === "object" && !Array.isArray(event.detail) && (event.detail as { source?: unknown }).source === "reasoning" ? event.detail as Record<string, unknown> : undefined;
        if (reasoningCarrier) {
          const projected = provider.display.projectReasoningDetail(reasoningCarrier as unknown as RuntimeReasoningEventDetailV1);
          event = { ...event, summary: event.kind === "message" ? (projected.source === "reasoning" ? REASONING_EVENT_SUMMARY : REASONING_DIAGNOSTIC_SUMMARY) : event.summary, detail: { ...projected, ...(typeof reasoningCarrier.turnId === "string" ? { turnId: reasoningCarrier.turnId } : {}) } };
        }
        if(plan && event.kind==='message' && (event.detail as {source?:string}|undefined)?.source==='prompt-input' && jsonBytes(event)>REPORT_LIMITS.input)throw Error('PROVENANCE_TOO_LARGE');
        if(visible)queue.push(event);
        if(storage){
          let storedEvent=event;
          if(plan?.presentation && event.kind==='message' && (event.detail as {source?:string}|undefined)?.source==='prompt-input'){
            const {inputPresentation:_liveOnly,...detail}=event.detail as PromptInputEventDetail;
            storedEvent={...event,detail};
          }
          const entry=persistence.captureEntry(plan,{at:new Date().toISOString(),kind:'event',event:storedEvent,turnId:storedEvent.turnId});
          pendingPersist=pendingPersist.then(()=>{if(plan&&persistenceError)return;return storage.appendReplay([entry]);}).catch(error=>{persistenceError??=error;});
        }
      };
      const pump = (async () => {
        try {
          for await (const event of inner.events()) {
            const turn = active;
            if (!turn || (event.turnId && event.turnId !== turn.id)) continue;
            if (event.kind === "settled") {
              const outcome = (event.detail as { outcome?: unknown } | undefined)?.outcome;
              if (!turn.outcomeLocked && ["failed", "aborted", "timed_out"].includes(String(outcome))) turn.outcome = outcome as RuntimeTurnOutcome;
              turn.terminal();
            } else emit({ ...event, runtime: options.runtime, roleId: role.id, turnId: turn.id, detail: {
              ...(event.detail && typeof event.detail === "object" && !Array.isArray(event.detail) ? event.detail as Record<string, unknown> : event.detail === undefined ? {} : { value: event.detail }),
              turnId: turn.id,
            } });
          }
        } catch (error) {
          if (active) {
            if (!active.outcomeLocked) active.outcome = "failed";
            emit({ kind: "denied", summary: `事件流失败：${error instanceof Error ? error.message : String(error)}`, runtime: options.runtime, roleId: role.id, turnId: active.id });
          }
        } finally { streamEnded = true; active?.terminal(); }
      })();
      const wrapper: RoleSession = {
        runtime: options.runtime, roleId: role.id, persistence:persistence.capability,
        get contextSource() { return inner.contextSource ?? (storage ? "fresh" : "in-memory"); },
        get nativeSessionId() { return inner.nativeSessionId; },
        get contextWarning() { return inner.contextWarning; },
        async prompt(text: string, promptOptions?: PromptOptions) {
          if (disposed) throw new Error("会话已关闭");
          if (active || quarantined || deliveryPreflight) throw new Error("上一轮仍在运行或中止清理中");
          let plan:DeliveryPlan|undefined;
          if(promptOptions?.inputProvenance||promptOptions?.inputPresentation){
            deliveryPreflight=true;
            try{plan=await persistence.prepare(promptOptions,text);}catch(error){
              if(error instanceof RuntimeDeliveryError)throw error;
              const id=promptOptions.inputProvenance??promptOptions.inputPresentation;
              if(id&&validAttemptId(id.deliveryId)&&validAttemptId(id.attemptId))throw new RuntimeDeliveryError('投递来源或显示内容无效，未调用Provider',{version:1,deliveryId:id.deliveryId,attemptId:id.attemptId,inputSaved:false,providerMayHaveStarted:false,history:storage?'failed':'disabled',retryHistoryAvailable:false,retryDeliveryAllowed:false,code:error instanceof Error&&['PROVENANCE_TOO_LARGE','TEXT_PROJECTION_FAILED','UNSUPPORTED_VERSION'].includes(error.message)?error.message as RuntimePersistenceErrorCode:'INVALID'});
              throw Object.assign(new Error('投递来源无效，未调用Provider'),{code:'INVALID'});
            }finally{deliveryPreflight=false;}
            if(disposed){persistence.dispose();throw new Error("会话已关闭");}
          }
          let terminal!: () => void;
          const terminalPromise = new Promise<void>((resolve) => { terminal = resolve; });
          const turn: Turn = { id: randomUUID(), controller: new AbortController(), outcome: "completed", terminal, terminalPromise };
          turn.plan=plan;
          persistence.attachTurn(plan,turn.id);
          active = turn;
          provider.setTurn(turn.id, turn.controller);
          let underlyingFinished = false;
          let failure: unknown;
          let lastResortExpired = false;
          let underlying: Promise<void> | undefined;
          try {
            persistenceError=undefined;
            promptOptions?.onTurnStarted?.({ turnId: turn.id, roleId: role.id, runtime: options.runtime });
            persistence.progress(plan,"turn-created",promptOptions);
            persistenceError=undefined;
            if(storage){const entry=persistence.captureEntry(plan,{at:new Date().toISOString(),kind:"user",text:plan?.text??text,turnId:turn.id,...(plan?{inputTextProjection:plan.projection}:{}),...(plan?.provenance?{inputProvenance:plan.provenance}:{})});
              try{await storage.appendReplay([entry]);if(plan?.capture)plan.capture.receipt.inputSaved=true;}catch(error){if(plan)persistenceError=error;throw error;}
            }
            persistence.progress(plan,"input-saved",promptOptions);
            // A previously reported transient error is cleared after a real successful retry.
            persistenceError = undefined;
            if (turn.controller.signal.aborted) throw new Error("会话已中止");
            const imageCount = promptOptions?.images?.length ?? 0;
            const input: PromptInputEventDetail = { source: "prompt-input", text:plan?.text??text, ...(imageCount > 0 ? { imageCount } : {}), ...(plan?{inputTextProjection:plan.projection}:{}), ...(plan?.provenance?{inputProvenance:plan.provenance}:{}), ...(plan?.presentation?{inputPresentation:plan.presentation}:{}) };
            emit({ kind: "message", summary: plan?.summary ?? (imageCount > 0 ? `用户指令：${text}（附 ${imageCount} 张图片）` : `用户指令：${text}`), runtime: options.runtime, roleId: role.id, turnId: turn.id, detail: { ...input, turnId: turn.id } });
            if(plan?.capture){
              await pendingPersist;
              if(persistenceError)throw persistenceError;
              if(storage){const boundary=persistence.captureEntry(plan,{at:new Date().toISOString(),kind:'event',turnId:turn.id,event:{kind:'message',summary:'投递开始边界',runtime:options.runtime,roleId:role.id,turnId:turn.id,detail:{source:'delivery-boundary',version:1,deliveryId:plan.capture.receipt.deliveryId,attemptId:plan.capture.receipt.attemptId,turnId:turn.id,stage:'provider-may-start'}}});try{await storage.appendReplay([boundary]);}catch(error){persistenceError=error;throw error;}}
              if(turn.controller.signal.aborted)throw new Error('会话已中止');
              plan.capture.receipt.providerMayHaveStarted=true;
              persistence.progress(plan,'provider-may-start',promptOptions);
            }
            const nativeOptions=plan?(promptOptions?.images ? {images:promptOptions.images} : undefined):promptOptions;
            underlying = Promise.resolve().then(() => inner.prompt(text, nativeOptions));
            underlying.then(() => { underlyingFinished = true; if (!turn.cleanupFailed) quarantined = false; }, () => { underlyingFinished = true; if (!turn.cleanupFailed) quarantined = false; });
            const work = underlying.then(async () => { if (!streamEnded) await terminalPromise; });
            // 整轮上限＝最后兜底（客户裁定 2026-10-17）：promptTimeoutMs 仅属看护到点检查，**不再**用于 abort。
            // InteractionGate 暂停语义不变——确认卡等待期间按有效运行时间暂停计时。
            await withPausableTimeout(raceAbort(work, turn.controller.signal, "本轮运行"), provider.options.turnLastResortMs ?? DEFAULT_TURN_LAST_RESORT_MS, "本轮最后兜底", provider.options.interactionGate);
          } catch (error) {
            failure = error;
            // 只有本层「最后兜底」到点才用兜底文案；适配器自身的 timed_out 保持原摘要（不冒充兜底）。
            lastResortExpired = isTimeoutError(error) && (error as { label?: string }).label === "本轮最后兜底";
            if(plan?.capture && error instanceof Error && ["INVALID","PROVENANCE_TOO_LARGE","TEXT_PROJECTION_FAILED"].includes(error.message))plan.capture.receipt.code=error.message as RuntimePersistenceErrorCode;
            turn.outcome = isTimeoutError(error) ? "timed_out" : turn.controller.signal.aborted || isAbortError(error) ? "aborted" : "failed";
            turn.outcomeLocked = true;
            turn.controller.abort();
            if (inner.abort && underlying !== undefined && !underlyingFinished) {
              try { await requestAbort(turn); }
              catch (abortError) { emit({ kind: "denied", summary: `中止清理失败：${abortError instanceof Error ? abortError.message : String(abortError)}`, runtime: options.runtime, roleId: role.id, turnId: turn.id }); }
            }
            quarantined = turn.cleanupFailed === true || (underlying !== undefined && !underlyingFinished);
          } finally {
            if(plan)deliveryPreflight=true;
            active = undefined;
            endedTurns.add(turn.id);
            provider.setTurn();
            const event: SessionEvent = { kind: "settled", summary: turn.outcome === "completed" ? "会话结束" : turn.outcome === "aborted" ? "本轮已中止" : turn.outcome === "timed_out" ? (lastResortExpired ? "本轮超过最后兜底，已中止" : "本轮运行超时") : "本轮运行失败", runtime: options.runtime, roleId: role.id, turnId: turn.id, detail: { turnId: turn.id, outcome: turn.outcome } };
            emit(event,plan,!plan);
            await pendingPersist;
            const record: RuntimeSessionRecord = { version: 1, id: recordId, roleId: role.id, runtime: options.runtime, contextSource: wrapper.contextSource ?? "fresh", nativeSessionId: wrapper.nativeSessionId, contextWarning: plan&&wrapper.contextWarning?provider.display.protectText(wrapper.contextWarning,4096).text:wrapper.contextWarning, createdAt, updatedAt: new Date().toISOString() };
            if(storage&&!persistenceError)try{await storage.saveSession(record);}catch(error){persistenceError=error;}
            await persistence.complete(plan,turn.outcome,record,persistenceError);
            persistence.progress(plan,"settled",promptOptions);
            if(plan){deliveryPreflight=false;queue.push(event);}
          }
          if(plan?.capture && (persistenceError||failure||plan.capture.receipt.history==='failed'))throw new RuntimeDeliveryError("本次投递未完成或历史未保存",plan.capture.receipt);
          if (persistenceError) throw persistenceError;
          if (failure) throw failure;
        },
        events: () => queue.stream,
        ...(inner.abort ? { async abort() {
          if (!active) return;
          const turn = active;
          turn.controller.abort();
          await requestAbort(turn);
        } } : {}),
        async dispose() {
          if (disposed) return;
          disposed = true;
          persistence.dispose();
          active?.controller.abort();
          try { await withTimeout(inner.dispose(), 1000, "关闭会话"); }
          finally { queue.close(); }
          await pendingPersist;
          void pump;
        },
      };
      return wrapper;
    },
  };
}

// C2 state remains bound to the actual Core session; no caller-selected persistence or paths.
interface DeliveryCapture {
  receipt: RuntimeDeliveryReceiptV1;
  entries: RuntimeReplayEntry[];
  checkpoint?:RuntimeReplayCheckpoint;
  record?:RuntimeSessionRecord;
  complete:boolean;
  retained:boolean;
  sequence:number;
  inFlight?:Promise<DeliverySaveResultV1>;
}
interface DeliveryPlan {
  capture?:DeliveryCapture;
  text:string;
  summary:string;
  projection:RuntimeInputTextProjectionV1;
  provenance?:RuntimeInputProvenanceV1;
  presentation?:RuntimeLiveHandbackPresentationV1;
}
function createPersistenceState(input:{
  scope:{roleId:string;runtime:RuntimeKind};projectRoot:string;storage?:RuntimeSessionStorage;
  display:ReturnType<typeof createToolDisplayContext>;diagnostics?:GovernedToolsOptions['diagnostics'];ended:Set<string>;disposed:()=>boolean;active:()=>boolean;
}) {
  const {storage,scope,display}=input;
  const reports=new Map<string,{snapshot:RuntimeReportSnapshotV1;draftFingerprint:string;state:ReportSaveStateV1;inFlight?:Promise<ReportSaveResultV1>}>();
  const deliveries=new Map<string,DeliveryCapture>();
  const seen=new Map<string,Pick<RuntimeDeliveryReceiptV1,'deliveryId'|'turnId'|'inputSaved'|'providerMayHaveStarted'|'outcome'>>();
  const listeners=new Set<(event:RuntimePersistenceChangeV1)=>void>();
  const retained=new Map<string,{bytes:number;busy:()=>boolean;expire:()=>void}>();
  let used=0;
  const observerFailed=()=>{try{input.diagnostics?.record('persistence.observer.failed',{roleId:scope.roleId,runtime:scope.runtime,errorCode:'OBSERVER_FAILED'});}catch{/* diagnostics cannot change execution */}};
  const notify=(event:RuntimePersistenceChangeV1)=>{if(!input.disposed())for(const listener of listeners)try{listener(structuredClone(event));}catch{observerFailed();}};
  const drop=(key:string)=>{const item=retained.get(key);if(item){used-=item.bytes;retained.delete(key);}};
  const keep=(key:string,value:unknown,busy:()=>boolean,expire:()=>void):boolean=>{
    drop(key);const bytes=jsonBytes(value);const identifiers=jsonBytes([...seen]);
    for(const [old,item] of retained){if(used+bytes+identifiers<=REPORT_LIMITS.retention)break;if(item.busy())continue;drop(old);item.expire();}
    if(bytes>REPORT_LIMITS.retention||used+bytes+identifiers>REPORT_LIMITS.retention){expire();return false;}
    retained.set(key,{bytes,busy,expire});used+=bytes;return true;
  };
  const reportChange=(id:string,state:ReportSaveStateV1)=>notify({kind:'report-save',scope,reportId:id,state});
  const expiredReport=(reportId?:string):ReportSaveResultV1=>({ok:false,state:'expired',code:'SNAPSHOT_EXPIRED',...(reportId?{reportId}:{}),retryAvailable:false,message:'待保存报告快照已失效'});
  const saveReport=(reportId:string):Promise<ReportSaveResultV1>=>{
    const holder=reports.get(reportId);
    if(!/^[a-f0-9]{64}$/.test(reportId))return Promise.resolve({ok:false,state:'failed',code:'INVALID',retryAvailable:false,message:'报告ID无效'});
    if(input.disposed())return Promise.resolve(expiredReport(reportId));
    if(!storage)return Promise.resolve({ok:false,state:'disabled',code:'PERSISTENCE_DISABLED',reportId,retryAvailable:false,message:'仅本次会话，报告未持久保存'});
    if(!holder)return Promise.resolve(expiredReport(reportId));
    if(holder.inFlight)return holder.inFlight;
    if(holder.state.state==='saved')return Promise.resolve({ok:true,state:'already-saved',report:structuredClone(holder.snapshot),retryAvailable:false});
    const work=(async():Promise<ReportSaveResultV1>=>{
      let result:ReportSaveResultV1;
      try{
        if(!storage?.saveReport)return {ok:false,state:'unsupported',code:'UNSUPPORTED',reportId,retryAvailable:false,message:'会话不支持报告保存'};
        const state=await storage.saveReport(holder.snapshot);
        holder.state={state:'saved',reportId,report:holder.snapshot,retryAvailable:false};
        result={ok:true,state,report:structuredClone(holder.snapshot),retryAvailable:false};
      }catch(error){
        const code=error instanceof Error&&error.message==='CONFLICT'?'CONFLICT':'PERSIST_FAILED';
        holder.state={state:'failed',code,reportId,report:holder.snapshot,retryAvailable:code==='PERSIST_FAILED'};
        result={ok:false,state:'failed',code,reportId,report:structuredClone(holder.snapshot),retryAvailable:code==='PERSIST_FAILED',message:code==='CONFLICT'?'已保存报告与本次最终快照冲突':'报告历史保存失败'};
      }
      reportChange(reportId,holder.state);return result;
    })();
    holder.inFlight=work;
    void work.finally(()=>{holder.inFlight=undefined;});return work;
  };
  const rememberIdentity=(capture:DeliveryCapture)=>seen.set(capture.receipt.attemptId,{deliveryId:capture.receipt.deliveryId,turnId:capture.receipt.turnId,inputSaved:capture.receipt.inputSaved,providerMayHaveStarted:capture.receipt.providerMayHaveStarted,...(capture.receipt.outcome?{outcome:capture.receipt.outcome}:{})});
  const trimReceipts=()=>{const finished=[...deliveries.values()].filter(x=>x.complete);while(finished.length>REPORT_LIMITS.receipts){const old=finished.shift()!;rememberIdentity(old);drop('delivery:'+old.receipt.attemptId);deliveries.delete(old.receipt.attemptId);}};
  const cloneReceipt=(capture:DeliveryCapture)=>structuredClone(capture.receipt);
  const deliveryChange=(capture:DeliveryCapture,state:'saved'|'failed'|'expired'|'disabled')=>notify({kind:'delivery-history-save',scope,attemptId:capture.receipt.attemptId,state,receipt:cloneReceipt(capture),retryAvailable:capture.receipt.retryHistoryAvailable,...(capture.receipt.code?{code:capture.receipt.code}:{})});
  const remember=(capture:DeliveryCapture)=>keep('delivery:'+capture.receipt.attemptId,{entries:capture.entries,checkpoint:capture.checkpoint,record:capture.record,receipt:capture.receipt},()=>!!capture.inFlight||!capture.complete,()=>{
    capture.retained=false;capture.entries=[];capture.checkpoint=undefined;capture.record=undefined;capture.receipt.retryHistoryAvailable=false;deliveryChange(capture,'expired');
  });
  const query=async(attemptId:string):Promise<DeliveryReceiptQueryV1>=>{
    if(input.disposed())return {state:'expired',code:'SNAPSHOT_EXPIRED',retryAvailable:false};
    const known=deliveries.get(attemptId);if(known)return {state:'known',receipt:cloneReceipt(known)};
    if(!storage)return {state:'expired',code:'SNAPSHOT_EXPIRED',retryAvailable:false};
    try{
      const entries=await storage.readReplay();
      const final=entries.filter(entry=>{const d=entry.event?.detail as Record<string,unknown>|undefined;return d?.source==='delivery-receipt'&&(d.receipt as RuntimeDeliveryReceiptV1|undefined)?.attemptId===attemptId;}).at(-1);
      if(final){const d=final.event!.detail as {version:number;receipt:RuntimeDeliveryReceiptV1};if(d.version!==1||!validReceipt(d.receipt)||d.receipt.turnId!==final.turnId||final.event?.runtime!==scope.runtime||final.event?.roleId!==scope.roleId)return {state:'unsupported',code:'UNSUPPORTED_VERSION',retryAvailable:false};return {state:'known',receipt:{...structuredClone(d.receipt),retryHistoryAvailable:false}};}
      const original=entries.find(entry=>entry.inputProvenance?.attemptId===attemptId);
      const boundary=entries.find(entry=>(entry.event?.detail as {source?:string;attemptId?:string}|undefined)?.source==='delivery-boundary'&&(entry.event?.detail as {attemptId?:string})?.attemptId===attemptId);
      if(original||boundary){const p=original?.inputProvenance??(boundary!.event!.detail as {deliveryId:string;version?:number});if(p.version!==1||!validAttemptId(p.deliveryId))return {state:'unsupported',code:'UNSUPPORTED_VERSION',retryAvailable:false};return {state:'known',receipt:{version:1,deliveryId:p.deliveryId,attemptId,turnId:original?.turnId??boundary?.turnId,inputSaved:!!original||!!boundary&&entries.some(entry=>entry.kind==='user'&&entry.turnId===boundary.turnId&&entry.inputTextProjection?.version===1),providerMayHaveStarted:true,history:'pending',retryHistoryAvailable:false,retryDeliveryAllowed:false,code:'RECEIPT_UNAVAILABLE'}};}
      return {state:'expired',code:'SNAPSHOT_EXPIRED',retryAvailable:false};
    }catch{return {state:'unsupported',code:'REPLAY_DAMAGED',retryAvailable:false};}
  };
  const capability:RuntimeSessionPersistence=Object.freeze({
    mode:storage?'enabled':'disabled',scope:Object.freeze({...scope}),
    async recordFinalReport(draft:RuntimeReportDraftV1):Promise<ReportSaveResultV1>{
      if(input.disposed())return expiredReport('');
      if(!storage)return {ok:false,state:'disabled',code:'PERSISTENCE_DISABLED',retryAvailable:false,message:'仅本次会话，报告未持久保存'};
      let snapshot:RuntimeReportSnapshotV1;
      try{if(draft?.source?.roleId!==scope.roleId||draft.source.runtime!==scope.runtime||!input.ended.has(draft.source.turnId))throw Error('INVALID');snapshot=makeReportSnapshot(draft,display.protectText);}
      catch{return {ok:false,state:'failed',code:'INVALID',retryAvailable:false,message:'报告来源或最终快照无效'};}
      const fingerprint=createHash('sha256').update(canonicalJson({source:{roleId:draft.source.roleId,runtime:draft.source.runtime,turnId:draft.source.turnId},taskId:draft.taskId,origin:draft.origin,status:draft.status,summary:draft.summary,evidence:draft.evidence,at:draft.at})).digest('hex');
      const existing=reports.get(snapshot.reportId);
      if(existing){if(existing.draftFingerprint!==fingerprint)return {ok:false,state:'failed',code:'CONFLICT',reportId:snapshot.reportId,retryAvailable:false,message:'同一源轮次最终报告冲突'};return saveReport(snapshot.reportId);}
      const holder={snapshot,draftFingerprint:fingerprint,state:{state:'failed' as const,reportId:snapshot.reportId,retryAvailable:true},inFlight:undefined as Promise<ReportSaveResultV1>|undefined};
      reports.set(snapshot.reportId,holder);
      const kept=keep('report:'+snapshot.reportId,snapshot,()=>!!holder.inFlight,()=>{reports.delete(snapshot.reportId);reportChange(snapshot.reportId,{state:'expired',code:'SNAPSHOT_EXPIRED',reportId:snapshot.reportId,retryAvailable:false});});
      if(!kept)return expiredReport(snapshot.reportId);return saveReport(snapshot.reportId);
    },
    retryReportPersistence(reportId:string){return saveReport(reportId);},
    async getReportPersistence(reportId:string):Promise<ReportSaveStateV1>{
      if(!/^[a-f0-9]{64}$/.test(reportId))return {state:'failed',code:'INVALID',retryAvailable:false};
      if(input.disposed())return {state:'expired',code:'SNAPSHOT_EXPIRED',reportId,retryAvailable:false};
      if(!storage)return {state:'disabled',code:'PERSISTENCE_DISABLED',reportId,retryAvailable:false};
      const holder=reports.get(reportId);if(holder)return structuredClone(holder.state);
      try{const saved=(await storage.readReports?.())?.reports.find(x=>x.reportId===reportId);if(saved)return {state:'saved',reportId,report:saved,retryAvailable:false};}catch{return {state:'failed',code:'PERSIST_FAILED',reportId,retryAvailable:false};}
      return {state:'expired',code:'SNAPSHOT_EXPIRED',reportId,retryAvailable:false};
    },
    getDeliveryReceipt:query,
    retryDeliveryHistoryPersistence(attemptId:string):Promise<DeliverySaveResultV1>{
      const capture=deliveries.get(attemptId);
      if(input.disposed()||!capture||!capture.retained)return Promise.resolve({ok:false,state:'expired',code:'SNAPSHOT_EXPIRED',retryAvailable:false,message:'待补保存历史材料已失效'});
      if(!storage)return Promise.resolve({ok:false,state:'disabled',code:'PERSISTENCE_DISABLED',receipt:cloneReceipt(capture),retryAvailable:false,message:'仅本次会话，历史未持久保存'});
      if(capture.inFlight)return capture.inFlight;
      if(capture.receipt.history==='saved')return Promise.resolve({ok:true,state:'already-saved',receipt:cloneReceipt(capture)});
      if(!capture.complete||input.active()||!capture.checkpoint||!capture.receipt.retryHistoryAvailable)return Promise.resolve({ok:false,state:'failed',code:capture.receipt.code??'UNSUPPORTED',receipt:cloneReceipt(capture),retryAvailable:false,message:'这次历史不能安全自动补存'});
      const work=(async():Promise<DeliverySaveResultV1>=>{
        try{
          const finalReceipt={...capture.receipt,inputSaved:capture.entries.some(x=>x.kind==='user'),history:'saved' as const,retryHistoryAvailable:false};delete finalReceipt.code;
          const finalEntry:RuntimeReplayEntry={at:new Date().toISOString(),kind:'event',turnId:finalReceipt.turnId,entryId:`${finalReceipt.turnId}:receipt`,event:{kind:'message',summary:'投递历史保存状态',runtime:scope.runtime,roleId:scope.roleId,turnId:finalReceipt.turnId,detail:{source:'delivery-receipt',version:1,receipt:finalReceipt}}};
          const previousFinal=capture.entries.find(entry=>entry.entryId===finalEntry.entryId);
          const intendedFinal=previousFinal??finalEntry;
          if(!previousFinal)capture.entries.push(intendedFinal);
          const intended=capture.entries;
          if(!storage.repairReplayTail)throw Error('UNSUPPORTED');
          await storage.repairReplayTail(capture.checkpoint!,intended,capture.record);
          capture.entries=intended;capture.receipt=structuredClone((intendedFinal.event!.detail as {receipt:RuntimeDeliveryReceiptV1}).receipt);rememberIdentity(capture);remember(capture);deliveryChange(capture,'saved');return {ok:true,state:'saved',receipt:cloneReceipt(capture)};
        }catch(error){
          const code=error instanceof Error&&['REPLAY_DAMAGED','REPLAY_CHANGED','UNSUPPORTED'].includes(error.message)?error.message as RuntimePersistenceErrorCode:'PERSIST_FAILED';
          capture.receipt.code=code;capture.receipt.history='failed';capture.receipt.retryHistoryAvailable=code==='PERSIST_FAILED'&&capture.retained;
          if(code!=='PERSIST_FAILED')capture.receipt.retryDeliveryAllowed=false;
          deliveryChange(capture,'failed');return {ok:false,state:'failed',code,receipt:cloneReceipt(capture),retryAvailable:capture.receipt.retryHistoryAvailable,message:'历史补存未完成；未重新调用模型'};
        }
      })();capture.inFlight=work;void work.finally(()=>{capture.inFlight=undefined;});return work;
    },
    onPersistenceChange(listener:(event:RuntimePersistenceChangeV1)=>void){if(!input.disposed())listeners.add(listener);return()=>{listeners.delete(listener);};},
  });
  return {
    capability,
    async prepare(promptOptions:PromptOptions|undefined,text:string):Promise<DeliveryPlan|undefined>{
      if(!promptOptions?.inputProvenance&&!promptOptions?.inputPresentation)return undefined;
      const supplied=promptOptions.inputProvenance??promptOptions.inputPresentation;
      if(supplied&&validAttemptId(supplied.attemptId)&&seen.has(supplied.attemptId)){
        const old=await query(supplied.attemptId);
        const duplicateCode=validAttemptId(supplied.deliveryId)&&supplied.target?.roleId===scope.roleId&&supplied.target?.runtime===scope.runtime?'ATTEMPT_ALREADY_STARTED' as const:'INVALID' as const;
        throw new RuntimeDeliveryError('同一投递尝试不可再次调用Provider',old.state==='known'?{...old.receipt,code:duplicateCode,retryDeliveryAllowed:false}:{version:1,...seen.get(supplied.attemptId)!,attemptId:supplied.attemptId,history:storage?'pending':'disabled',retryHistoryAvailable:false,retryDeliveryAllowed:false,code:duplicateCode});
      }
      let provenance:RuntimeInputProvenanceV1|undefined;let presentation:RuntimeLiveHandbackPresentationV1|undefined;
      if(promptOptions.inputProvenance){
        provenance=validateProvenance(promptOptions.inputProvenance,scope);
        for(const snapshot of provenance.reports){const sourceStore=createRuntimeSessionStore({projectRoot:input.projectRoot,...snapshot.source});const sourceReports=await sourceStore.readReports!();const saved=sourceReports.reports.find(x=>x.reportId===snapshot.reportId);if(!saved||canonicalJson(saved)!==canonicalJson(snapshot))throw Error('INVALID');}
      }else presentation=validateLivePresentation(promptOptions.inputPresentation!,display.protectText);
      let safe:ReturnType<typeof projectHandbackInput>;try{safe=projectHandbackInput(text,display.protectText);}catch{throw Error('TEXT_PROJECTION_FAILED');}
      if(presentation?.target&&(presentation.target.roleId!==scope.roleId||presentation.target.runtime!==scope.runtime))throw Error('INVALID');
      const plan:DeliveryPlan={...safe,...(provenance?{provenance}:{}),...(presentation?{presentation}:{})};
      const attemptIdentity=provenance??(presentation?.attemptId?{deliveryId:presentation.deliveryId!,attemptId:presentation.attemptId}:undefined);
      if(attemptIdentity){
        let entries:RuntimeReplayEntry[]=[];let checkpoint:RuntimeReplayCheckpoint|undefined;
        try{if(storage){entries=await storage.readReplay();checkpoint=await storage.checkpointReplay?.();}}
        catch{throw new RuntimeDeliveryError('目标历史损坏，未调用Provider',{version:1,deliveryId:attemptIdentity.deliveryId,attemptId:attemptIdentity.attemptId,inputSaved:false,providerMayHaveStarted:false,history:'failed',retryHistoryAvailable:false,retryDeliveryAllowed:false,code:'REPLAY_DAMAGED'});}
        if(entries.some(entry=>entry.inputProvenance&&entry.inputProvenance.version!==1||['delivery-boundary','delivery-receipt'].includes(String((entry.event?.detail as {source?:string}|undefined)?.source))&&(entry.event?.detail as {version?:number}).version!==1))throw Error('UNSUPPORTED_VERSION');
        if(seen.has(attemptIdentity.attemptId)||entries.some(x=>x.inputProvenance?.attemptId===attemptIdentity.attemptId||(x.event?.detail as {attemptId?:string;receipt?:RuntimeDeliveryReceiptV1}|undefined)?.attemptId===attemptIdentity.attemptId||(x.event?.detail as {receipt?:RuntimeDeliveryReceiptV1}|undefined)?.receipt?.attemptId===attemptIdentity.attemptId)){
          const old=await query(attemptIdentity.attemptId);throw new RuntimeDeliveryError('同一投递尝试不可再次调用Provider',old.state==='known'?{...old.receipt,code:'ATTEMPT_ALREADY_STARTED',retryDeliveryAllowed:false}:{version:1,deliveryId:attemptIdentity.deliveryId,attemptId:attemptIdentity.attemptId,inputSaved:false,providerMayHaveStarted:true,history:storage?'pending':'disabled',retryHistoryAvailable:false,retryDeliveryAllowed:false,code:'ATTEMPT_ALREADY_STARTED'});
        }
        const identity={deliveryId:attemptIdentity.deliveryId,inputSaved:false,providerMayHaveStarted:false};
        const identifiers=jsonBytes([...seen,[attemptIdentity.attemptId,identity]]);
        for(const [key,item] of retained){if(used+identifiers<=REPORT_LIMITS.retention)break;if(item.busy())continue;drop(key);item.expire();}
        if(used+identifiers>REPORT_LIMITS.retention)throw Error('PROVENANCE_TOO_LARGE');
        seen.set(attemptIdentity.attemptId,identity);
        const capture:DeliveryCapture={receipt:{version:1,deliveryId:attemptIdentity.deliveryId,attemptId:attemptIdentity.attemptId,inputSaved:false,providerMayHaveStarted:false,history:storage?'pending':'disabled',retryHistoryAvailable:false,retryDeliveryAllowed:false},entries:[],checkpoint,complete:false,retained:true,sequence:0};deliveries.set(attemptIdentity.attemptId,capture);plan.capture=capture;
      }
      return plan;
    },
    attachTurn(plan:DeliveryPlan|undefined,turnId:string){if(plan?.capture){plan.capture.receipt.turnId=turnId;rememberIdentity(plan.capture);}},
    captureEntry(plan:DeliveryPlan|undefined,entry:RuntimeReplayEntry):RuntimeReplayEntry{
      if(!plan?.capture)return entry;
      const capture=plan.capture;const safe=structuredClone({...entry,entryId:entry.entryId??`${capture.receipt.turnId}:${capture.sequence++}`});
      if(jsonBytes(safe)>REPORT_LIMITS.input){
        if(safe.kind==='user'||(safe.event?.detail as {source?:string}|undefined)?.source==='prompt-input')throw Error('PROVENANCE_TOO_LARGE');
        capture.retained=false;capture.entries=[];capture.checkpoint=undefined;capture.receipt.retryHistoryAvailable=false;drop('delivery:'+capture.receipt.attemptId);return safe;
      }
      if(capture.retained){capture.entries.push(safe);remember(capture);}return safe;
    },
    progress(plan:DeliveryPlan|undefined,stage:RuntimeDeliveryProgressV1['stage'],opts:PromptOptions|undefined){if(plan?.capture)try{opts?.onDeliveryProgress?.({stage,receipt:cloneReceipt(plan.capture)});}catch{observerFailed();}},
    async complete(plan:DeliveryPlan|undefined,outcome:RuntimeTurnOutcome,record:RuntimeSessionRecord,error:unknown){
      const capture=plan?.capture;if(!capture)return;
      capture.complete=true;capture.record=record;capture.receipt.outcome=outcome;rememberIdentity(capture);
      if(!storage){capture.receipt.history='disabled';capture.receipt.retryHistoryAvailable=false;trimReceipts();return;}
      if(error){
        capture.receipt.history='failed';capture.receipt.code=error instanceof Error&&error.message==='PROVENANCE_TOO_LARGE'?'PROVENANCE_TOO_LARGE':'PERSIST_FAILED';
        capture.receipt.retryHistoryAvailable=capture.retained&&!!capture.checkpoint&&capture.receipt.code==='PERSIST_FAILED';
        try{await storage.readReplay();capture.receipt.retryDeliveryAllowed=!capture.receipt.providerMayHaveStarted&&capture.receipt.code==='PERSIST_FAILED';}catch{capture.receipt.code='REPLAY_DAMAGED';capture.receipt.retryHistoryAvailable=false;capture.receipt.retryDeliveryAllowed=false;}
      }else{
        capture.receipt.history='saved';capture.receipt.retryHistoryAvailable=false;
        const finalEntry:RuntimeReplayEntry={at:new Date().toISOString(),kind:'event',turnId:capture.receipt.turnId,entryId:`${capture.receipt.turnId}:receipt`,event:{kind:'message',summary:'投递历史保存状态',runtime:scope.runtime,roleId:scope.roleId,turnId:capture.receipt.turnId,detail:{source:'delivery-receipt',version:1,receipt:cloneReceipt(capture)}}};
        if(capture.retained)capture.entries.push(finalEntry);
        try{await storage.appendReplay([finalEntry]);}catch{capture.receipt.history='failed';capture.receipt.code='PERSIST_FAILED';capture.receipt.retryHistoryAvailable=capture.retained;}
      }
      remember(capture);deliveryChange(capture,capture.receipt.history==='saved'?'saved':'failed');
      trimReceipts();
    },
    dispose(){listeners.clear();for(const holder of reports.values())if(!holder.inFlight)holder.state={state:'expired',code:'SNAPSHOT_EXPIRED',reportId:holder.snapshot.reportId,retryAvailable:false};for(const capture of deliveries.values()){capture.retained=false;capture.entries=[];capture.checkpoint=undefined;capture.receipt.retryHistoryAvailable=false;}retained.clear();used=0;},
  };
}
function validReceipt(value:unknown):value is RuntimeDeliveryReceiptV1{const r=value as RuntimeDeliveryReceiptV1;return !!r&&r.version===1&&validAttemptId(r.attemptId)&&validAttemptId(r.deliveryId)&&typeof r.turnId==='string'&&r.turnId.length>0&&Buffer.byteLength(r.turnId)<=4096&&typeof r.inputSaved==='boolean'&&typeof r.providerMayHaveStarted==='boolean'&&['pending','saved','failed','disabled'].includes(r.history)&&typeof r.retryHistoryAvailable==='boolean'&&typeof r.retryDeliveryAllowed==='boolean';}
