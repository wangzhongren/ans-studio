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

// ————— G-2/U1（2026-10-16 客户批准；设计 2026-10-16_design_role-watchdog-and-closure §3.3/§7.3）—————
// `system` 类投递（看护告警 / 收束提示 / 恢复回执）的聊天流归类：文首定格标记 `[系统·<子类>] `
// （单一来源 = 编排 O1 的文案文件；判据只依赖标记形态，不逐子类登记——子类集合随 O1 落树扩充）。

test('G-2：system 投递归类——[系统·<子类>] 文首标记（回显/回放同解）；来源=系统（sourceRoleId 恒空）', () => {
  const alert = tools.classifyInjectedMessage('用户指令：[系统·看护] 投递排队积压：角色「实现者」队首任务已排队 12 分钟（深度 3）。\n事实：…\n建议：…');
  assert.equal(alert?.kind, 'system', '看护告警回显应归类为 system');
  assert.equal(alert?.label, '系统消息 · 看护', '标签=「系统消息 · <子类原文>」');
  assert.equal(alert?.sourceRoleId, '', '来源=系统（非角色）——无角色来源可提取');
  assert.ok(String(alert?.body).startsWith('[系统·看护] '), '正文原样（含标记）交给呈现层');
  const closure = tools.classifyInjectedMessage('[系统·收束] 已无进行中任务：全部角色空闲、投递队列为空、无待确认，已持续 5 分钟。');
  assert.equal(closure?.kind, 'system', '回放原始投递文本（无「用户指令：」前缀）同样归类');
  assert.equal(closure?.label, '系统消息 · 收束');
  assert.equal(tools.classifyInjectedMessage('用户指令：[系统·恢复] 已执行：abort-turn（目标角色 实现者）')?.kind, 'system', '恢复回执同族（子类集合随 O1 落树扩充——不逐子类登记）');
});

test('G-2：system 归类不误伤——行内提及 / 未闭合 / 空子类 / 无空白衔接一律 null；既有两类回归不变', () => {
  assert.equal(tools.classifyInjectedMessage('用户指令：帮我看下 [系统·看护] 这个词'), null, '行内提及不算（标记必须在行首）');
  assert.equal(tools.classifyInjectedMessage('[系统·未闭合 普通消息'), null, '未闭合的标记不算');
  assert.equal(tools.classifyInjectedMessage('[系统·] 空子类'), null, '空子类不算');
  assert.equal(tools.classifyInjectedMessage('[系统·看护]紧接着无空白'), null, '闭合后须为空白或文末（杜绝「看起来像」）');
  assert.equal(tools.classifyInjectedMessage('[系统·' + '长'.repeat(13) + '] x'), null, '子类长度有界（定格格式防御）');
  assert.equal(tools.classifyInjectedMessage('[系统·[嵌]套] x'), null, '子类内不得嵌括号');
  assert.equal(tools.classifyInjectedMessage('普通一句话'), null);
  // 既有角色投递归类不受影响（回归）。
  assert.equal(tools.classifyInjectedMessage('[回交] 来自 A 的报告')?.kind, 'handback');
  assert.equal(tools.classifyInjectedMessage('[派发] 来自 su 的任务：x')?.kind, 'dispatch');
});

// ————— 视觉收敛 v3（2026-10-16 客户批准：「按推荐批准，开始实施」）—————
// W6b：system 行正文去重复前缀（chip「系统消息 · <子类>」已承载）；分类判据仍在投递原文，不改判据。

test('W6b：system 展示正文剥离文首标记（displayBody）——判据/原文不变，仅呈现层取用', () => {
  const alert = tools.classifyInjectedMessage('用户指令：[系统·看护] 投递排队积压：角色「实现者」队首任务已排队 12 分钟（深度 3）。');
  assert.equal(alert?.body, '[系统·看护] 投递排队积压：角色「实现者」队首任务已排队 12 分钟（深度 3）。', 'body 仍为投递原文（判据来源不变）');
  assert.equal(alert?.displayBody, '投递排队积压：角色「实现者」队首任务已排队 12 分钟（深度 3）。', 'displayBody 去掉「[系统·<子类>] 」前缀');
  const closure = tools.classifyInjectedMessage('[系统·收束] 已无进行中任务：全部角色空闲。');
  assert.equal(closure?.displayBody, '已无进行中任务：全部角色空闲。', '回放路径同解');
  const bare = tools.classifyInjectedMessage('[系统·看护]');
  assert.equal(bare?.displayBody, '', '仅标记无正文 ⇒ 展示正文为空（chip 已承载信息）');
  const multi = tools.classifyInjectedMessage('[系统·看护]   多空白后接正文');
  assert.equal(multi?.displayBody, '多空白后接正文', '剥前缀后仅去掉空白，不动正文');
  // 非 system 类不带 displayBody（回交/派发正文含各自首行格式，按各自契约呈现）。
  assert.equal(tools.classifyInjectedMessage('[回交] 来自 A 的报告')?.displayBody, undefined);
});

// S1/S4：工具调用相位合并（同一 toolCallId 的「调用发起 + 结果」并一行；不折叠重复调用）与组摘要口径「N 个调用」。

test('S1：mergePhases——同一 toolCallId 两相位并入一行（首相位定位，相位按到达序）；不同调用/无 callId 不并', () => {
  const items = [
    { callId: 'a', turnId: 't1', phase: 'call', toolName: 'run_shell' },
    { callId: 'a', turnId: 't1', phase: 'result', toolName: 'run_shell' },
    { callId: 'b', turnId: 't1', phase: 'call', toolName: 'read_file' },
    { callId: '', turnId: 't1', phase: 'call', toolName: 'legacy' },
    { callId: 'b', turnId: 't1', phase: 'result', toolName: 'read_file' },
  ];
  assert.deepEqual(tools.mergePhases(items), [
    { index: 0, phases: [0, 1] },
    { index: 2, phases: [2, 4] },
    { index: 3, phases: [3] },
  ], '行序=首相位位置；同调用相位按到达序；无 callId 独立成行');
  // 不折叠重复调用：同工具不同 callId 各占一行；同 callId 不同 turn 不并（身份=turn+call）。
  const dup = [
    { callId: 'c', turnId: 't1', phase: 'call' },
    { callId: 'c', turnId: 't2', phase: 'call' },
    { callId: 'd', turnId: 't1', phase: 'call' },
  ];
  assert.deepEqual(tools.mergePhases(dup).map((r: { phases: number[] }) => r.phases), [[0], [1], [2]]);
  // 缺 callId 的相位沿用「一次事件一行」（缺一不并——不发明身份）。
  const sparse = [{ toolName: 'x' }, { toolName: 'x' }];
  assert.deepEqual(tools.mergePhases(sparse).map((r: { phases: number[] }) => r.phases), [[0], [1]]);
  assert.deepEqual(tools.mergePhases([]), []);
  assert.deepEqual(tools.mergePhases(null), []);
});

// 折叠口径（2026-10-16 客户批准）修订：callSummary 增「未放行/失败」拆分与工具分解——旧「exceptional 计数」
// 按新口径拆为 denied/failed（客户格式「含 X 条未放行 / 含 Y 条失败」+「a / b ×k」分解）；断言强度不降：
// 调用数/未知照旧全等，异常事实拆类后**逐类全等**（非放松——字段替换按批准口径）。
test('S4/折叠口径：callSummary——「N 个调用」+ 工具分解（首现序、×k）+ 未放行/失败拆分（未放行优先）+ 未知照旧如实', () => {
  const items = [
    { callId: 'a', turnId: 't', status: 'call', toolName: 'read_file' },
    { callId: 'a', turnId: 't', status: 'completed', toolName: 'read_file' },
    { callId: 'b', turnId: 't', status: 'call', toolName: 'run_shell' },
    { callId: 'b', turnId: 't', status: 'unknown', toolName: 'run_shell' },
    { callId: 'c', turnId: 't', status: 'call', toolName: 'write_file' },
    { callId: 'c', turnId: 't', status: 'failed', toolName: 'write_file' },
  ];
  assert.deepEqual(tools.callSummary(items), {
    calls: 3, denied: 0, failed: 1, unknown: true,
    tools: [ { name: 'read_file', count: 1 }, { name: 'run_shell', count: 1 }, { name: 'write_file', count: 1 } ],
  }, '3 个调用、1 行失败、含未记录、分解按首现序');
  // 未放行/失败拆分：denied 相位记入未放行；timed-out 归失败；同一行既有未放行又有失败相位 ⇒ 未放行优先（一笔调用只进一类）。
  const mixed = [
    { callId: 'd', turnId: 't', status: 'call', toolName: 'run_shell' },
    { callId: 'd', turnId: 't', status: 'denied', toolName: 'run_shell' },
    { callId: 'e', turnId: 't', status: 'call', toolName: 'run_shell' },
    { callId: 'e', turnId: 't', status: 'timed-out', toolName: 'run_shell' },
    { callId: 'f', turnId: 't', status: 'call', toolName: 'run_shell' },
    { callId: 'f', turnId: 't', status: 'failed', toolName: 'run_shell' },
    { callId: 'g', turnId: 't', status: 'call', toolName: 'run_shell' },
    { callId: 'g', turnId: 't', status: 'denied', toolName: 'run_shell' },
    { callId: 'g', turnId: 't', status: 'failed', toolName: 'run_shell' },
  ];
  assert.deepEqual(tools.callSummary(mixed), { calls: 4, denied: 2, failed: 2, unknown: false, tools: [{ name: 'run_shell', count: 4 }] }, '未放行 2（含两相位行优先归未放行）、失败 2（failed 与 timed-out）、×4 分解');
  assert.deepEqual(tools.callSummary([{ callId: 'x', turnId: 't', status: 'completed', toolName: 'role_status' }]), { calls: 1, denied: 0, failed: 0, unknown: false, tools: [{ name: 'role_status', count: 1 }] });
  assert.deepEqual(tools.callSummary([]), { calls: 0, denied: 0, failed: 0, unknown: false, tools: [] });
});
