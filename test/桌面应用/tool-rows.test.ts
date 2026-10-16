import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSessionJsonl } from '../../app/desktop/session-history.ts';
await import(new URL('../../app/renderer/tool-rows.js', import.meta.url).href);
await import(new URL('../../app/renderer/ui-labels.js', import.meta.url).href);
const tools = (globalThis as any).ANSToolRows;
const labels = (globalThis as any).ANSUiLabels;

test('activity facts: accepted alone is unknown; explicit result succeeds; old call remains call', () => {
  assert.equal(tools.activityOf({kind:'accepted',summary:'已获准'}).status, 'unknown');
  assert.equal(tools.activityOf({kind:'accepted',detail:{toolName:'read_file',path:'a.md',status:'completed',ok:true}}).status, 'completed');
  assert.equal(tools.activityOf({kind:'tool',text:'调用工具 read_file'}).status, 'call');
  assert.equal(tools.activityOf({kind:'tool',text:'read_file：a.md\n\n失败的正文'}).status, 'unknown');
});
test('known own tool first-line failures remain visible even with historical isError=false', () => {
  const entries = [
    {type:'session'},
    {type:'message',message:{role:'assistant',content:[{type:'toolCall',id:'r',name:'read_file',arguments:{path:'lost.md'}},{type:'toolCall',id:'s',name:'run_shell',arguments:{command:'ls missing'}}]}},
    {type:'message',message:{role:'toolResult',toolCallId:'r',toolName:'read_file',isError:false,content:[{type:'text',text:'read_file 失败：lost.md（ENOENT）'}]}},
    {type:'message',message:{role:'toolResult',toolCallId:'s',toolName:'run_shell',isError:false,content:[{type:'text',text:'run_shell 已执行：ls missing（exit 1）\nstdout:\nbody\nstderr:\nerror'}]}}
  ];
  const rows = parseSessionJsonl(entries.map(x=>JSON.stringify(x)).join('\n')).rows;
  assert.deepEqual(rows.map(x=>x.kind), ['tool','tool','denied','denied']);
  assert.equal(rows[0].activity?.target, 'lost.md');
  assert.equal(rows[3].activity?.target, 'ls missing');
  assert.equal(tools.activityOf(rows[3]).exceptional, true);
  assert.equal(tools.activityOf({kind:'tool',text:'run_shell：run_shell 已执行：ls missing（exit 1）\nstdout:\nsecret'}).exceptional,true);
  assert.equal(tools.activityOf({kind:'tool',text:'read_file：file.md\nread_file 失败：fake（ENOENT）'}).exceptional,false);
  assert.equal(tools.activityOf({kind:'tool',text:'run_shell：run_shell 已执行：ls（exit 0）\nstderr:\n失败'}).exceptional,false);
});
test('tool replay state changes invalidate equality without exposing body', () => {
  const row={kind:'tool',text:'read_file：secret body',at:'',activity:{toolName:'read_file',target:'a.md',phase:'result',status:'unknown'}};
  assert.equal(labels.replayPlan({rows:[row]},[{...row,activity:{...row.activity,status:'completed'}}]).action,'full');
  assert.equal(tools.activityOf(row).target,'a.md');
  assert.equal(tools.activityOf({kind:'tool_call',detail:{toolName:'request_confirmation'}}).barrier,true);
});

test('execution-before-denial never claims execution failed; known failures keep exact visible first line', () => {
  const denied=tools.activityOf({kind:'denied',summary:'拒绝写入：目标不在角色允许范围',detail:{toolName:'write_file',path:'outside.md'}});
  assert.equal(denied.exceptional,true);
  assert.equal(denied.label,'已拒绝');
  assert.equal(denied.visibleSummary,'拒绝写入：目标不在角色允许范围');
  const shell=tools.activityOf({kind:'tool',text:'run_shell：run_shell 已执行：ls missing（exit 2）\nstdout:\nSECRET'});
  assert.equal(shell.visibleSummary,'run_shell 已执行：ls missing（exit 2）');
  assert.equal(tools.activityOf({kind:'tool',text:'read_file：read_file 失败：lost.md（ENOENT）'}).visibleSummary,'read_file 失败：lost.md（ENOENT）');
});

test('full known target survives slim summary for default failure location', () => {
  const path='directory/'.repeat(30)+'missing.md';
  const failure=tools.activityOf({kind:'denied',summary:'read_file 执行失败',detail:{toolName:'read_file',path,status:'failed'}});
  assert.equal(failure.fullTarget,path);
  assert.ok(failure.target.length<path.length);
});

test('orphan own read_file failure keeps explicit first-line target without inspecting body', () => {
  const input=[{type:'session'},{type:'message',message:{role:'toolResult',toolName:'read_file',isError:false,content:[{type:'text',text:'read_file 失败：lost.md（ENOENT）'}]}}];
  const row=parseSessionJsonl(input.map(x=>JSON.stringify(x)).join('\n')).rows[0];
  assert.equal(row.activity?.target,'');
  assert.equal(tools.activityOf(row).fullTarget,'lost.md');
  assert.equal(tools.activityOf({kind:'tool',text:'read_file：normal.md\nread_file 失败：invented.md（ENOENT）'}).fullTarget,'');
  assert.equal(tools.activityOf({kind:'tool',text:'arbitrary body lost.md ENOENT'}).fullTarget,'');
});

test('canonical start/result/blocked各自保留真实状态与实际工具名',()=>{
 for(const toolName of ['read_file','write_file','edit_file','run_shell','request_confirmation','request_choice','dispatch_task','submit_report','report_shell_verdict']){
  const input={kind:'tool_call',turnId:'real',detail:{toolName,toolCallId:'call',phase:'start'}};
  assert.equal(tools.activityOf(input).status,'call');
  assert.equal(tools.activityOf({...input,kind:'accepted',detail:{...input.detail,phase:'result',ok:true}}).status,'completed');
  assert.equal(tools.activityOf({...input,kind:'denied',detail:{...input.detail,phase:'blocked',ok:false}}).exceptional,true);
 }
});

test('A4 consumer only reads public safe display target and rejects unknown versions',()=>{
 const safe={version:1,target:{kind:'command',value:{text:'node -v',redacted:false,truncated:false}},omissions:[]};
 const event={kind:'tool_call',turnId:'actual',detail:{toolName:'run_shell',toolCallId:'call',phase:'start',args:{command:'RAW_ARG_NOT_PUBLIC'},path:'RAW_PATH',display:safe}};
 assert.equal(tools.activityOf(event).fullTarget,'node -v');
 assert.equal(tools.activityOf(event).display,safe);
 assert.equal(tools.activityOf({...event,detail:{...event.detail,display:{version:99}}}).fullTarget,'');
 assert.equal(tools.activityOf({...event,detail:{...event.detail,display:{version:1,omissions:['unsupported-input']}}}).fullTarget,'');
 assert.equal(tools.activityOf({...event,detail:{...event.detail,display:{version:99}}}).displayUnsupported,true);
});

test('tool identity never inferred for ordinary aborted terminal', () => {
 assert.equal(tools.isToolActivity({kind:'denied',summary:'本轮已中止',detail:{outcome:'aborted'}}),false);
 assert.equal(tools.isToolActivity({kind:'denied',summary:'read_file: text alone'}),false);
 assert.equal(tools.isToolActivity({kind:'denied',detail:{toolName:'read_file',phase:'blocked'}}),true);
 assert.equal(tools.isToolActivity({kind:'tool',text:'legacy recorded tool'}),true);
});

test('delivery notes are not tool activities; known legacy and trusted tool metadata stay tools', () => {
 const note='已接收来自 su 的派发任务——请按任务文本执行，完成后交回报告。';
 assert.equal(tools.isToolActivity({kind:'tool_call',summary:note}),false,'old anonymous delivery progress cannot manufacture a tool call');
 assert.equal(tools.isToolActivity({kind:'message',summary:note,detail:{source:'delivery-note'}}),false);
 assert.equal(tools.isToolActivity({kind:'tool',text:'旧版有类型工具记录'}),true);
 assert.equal(tools.isToolActivity({kind:'tool_call',detail:{name:'write_file',args:{path:'a.md'}}}),true);
 assert.equal(tools.isToolActivity({kind:'tool_call',turnId:'actual',detail:{toolCallId:'real-call',phase:'start'}}),true);
});
test('actual protected worker history retains all ten calls and failure result without adding a generic', () => {
 const history=JSON.parse(readFileSync(new URL('../../角色卡/桌面UI/docs/fix/2026-10-15-delivery-note-ui-evidence/real-protected-history.json',import.meta.url),'utf8'));
 const activities=history.rows.filter((r:any)=>r.kind==='tool'||r.kind==='denied').map((r:any)=>tools.activityOf(r));
 assert.equal(activities.length,20);
 assert.equal(new Set(activities.filter((a:any)=>a.identityPhase==='start').map((a:any)=>a.callId)).size,10);
 assert.equal(activities.some((a:any)=>a.toolName==='工具'),false);
 assert.deepEqual(activities.filter((a:any)=>a.identityPhase==='start').map((a:any)=>a.toolName).sort(),['read_file','read_file','read_file','read_file','run_shell','run_shell','run_shell','run_shell','submit_report','write_file'].sort());
 assert.ok(activities.some((a:any)=>a.identityPhase==='result'&&a.status==='failed'&&a.fullTarget.includes('v2-does-not-exist.md')));
});

// ————— F-8-b（2026-10-16 客户批准）：run_shell「进程跑完、退出码非零」行分类——结构化事实优先 —————
// 判据 = display.process 的结构化事实（exitCode 存在且无 error/signal；timedOut 独立一类），不再依赖消息文本正则；
// 旧 knownFailure 正则（「run_shell 已执行：…（exit N）」）保留作无结构化事实的旧文本行回退（过渡期兼容，事实优先）。

test('F-8-b：非零退出（结构化事实）→ 中性「已执行完成（退出码 N）」；事实优先于旧文本正则，旧文本行兼容不变', () => {
  const t=(v:string)=>({text:v,truncated:false,redacted:false});
  // 真机证据形状（kanban-live replay L89：grep -rn "http" src/public exit 1）：kind denied + ok/status/errorCode 失败三件套 + display.process 事实。
  const governed={kind:'denied',turnId:'shell-turn',
    summary:'run_shell 执行失败：grep -rn "http" src/public（run_shell 已执行：grep -rn "http" src/public（exit 1）\nstdout:\n\nstderr:\n）',
    detail:{toolName:'run_shell',toolCallId:'shell-call',phase:'result',ok:false,status:'failed',errorCode:'TOOL_FAILED',
      display:{version:1,omissions:[],target:{kind:'command',value:t('grep -rn "http" src/public')},
        resultText:t('run_shell 已执行：grep -rn "http" src/public（exit 1）\nstdout:\n\nstderr:\n'),
        error:t('run_shell 已执行：grep -rn "http" src/public（exit 1）\nstdout:\n\nstderr:\n'),
        process:{exitCode:1,stdout:t(''),stderr:t('')},durationMs:8}}};
  const a=tools.activityOf(governed);
  assert.equal(a.status,'exited-nonzero');
  assert.equal(a.label,'已执行完成（退出码 1）');
  assert.equal(a.exceptional,false,'红→中性：非零退出不再标为执行失败');
  assert.equal(a.fullTarget,'grep -rn "http" src/public');
  assert.equal(a.errorCode,'TOOL_FAILED','errorCode 契约原样（只改行分类，不动契约面）');
  const other=tools.activityOf({kind:'denied',detail:{toolName:'run_shell',phase:'result',ok:false,status:'failed',display:{version:1,omissions:[],process:{exitCode:127}}}});
  assert.equal(other.label,'已执行完成（退出码 127）','退出码如实进标签');
  // 结构化事实优先：同一输入同时命中旧正则（文本）且携带事实 ⇒ 事实胜出。
  const both=tools.activityOf({kind:'tool',text:'run_shell：run_shell 已执行：ls missing（exit 1）\nstdout:\nsecret',
    detail:{toolName:'run_shell',phase:'result',display:{version:1,omissions:[],process:{exitCode:1}}}});
  assert.equal(both.status,'exited-nonzero');
  assert.equal(both.exceptional,false);
  // 过渡期兼容：无结构化事实的旧文本行保持既有分类（红）——旧正则并存，不被新逻辑吞掉。
  assert.equal(tools.activityOf({kind:'tool',text:'run_shell：run_shell 已执行：ls missing（exit 1）\nstdout:\nsecret'}).status,'failed','旧文本行仍走 knownFailure 正则（过渡期兼容）');
});

test('F-8-b：timedOut 独立一类；signal/error 事实与 spawn 失败不落中性；exit 0 仍「执行完成」', () => {
  const withProcess=(process:unknown)=>({kind:'denied',detail:{toolName:'run_shell',phase:'result',ok:false,status:'failed',display:{version:1,omissions:[],process}}});
  const timedOut=tools.activityOf(withProcess({timedOut:true,timeoutMs:600000}));
  assert.equal(timedOut.status,'timed-out');
  assert.equal(timedOut.label,'超时终止','超时终止独立一类（不被非零退出中性化）');
  assert.equal(timedOut.exceptional,true,'超时终止仍是异常终止，保持显著');
  const killed=tools.activityOf(withProcess({exitCode:1,signal:'SIGTERM'}));
  assert.equal(killed.status,'failed','有 signal 的终止不落中性');
  assert.equal(killed.exceptional,true);
  const contaminated=tools.activityOf(withProcess({exitCode:1,error:'boom'}));
  assert.equal(contaminated.status,'failed','带 error 事实不得判中性（防御式，绝不吞异常）');
  const spawnFailed=tools.activityOf(withProcess({error:'spawn ENOENT'}));
  assert.equal(spawnFailed.status,'failed','spawn 失败（无 exitCode）仍是执行失败');
  assert.equal(spawnFailed.exceptional,true);
  const cleanZero=tools.activityOf({kind:'accepted',detail:{toolName:'run_shell',phase:'result',ok:true,status:'completed',display:{version:1,omissions:[],process:{exitCode:0}}}});
  assert.equal(cleanZero.status,'completed');
  assert.equal(cleanZero.label,'执行完成');
  assert.equal(cleanZero.exceptional,false);
});
