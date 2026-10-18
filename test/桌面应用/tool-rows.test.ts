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

// ————— G-4/I7（2026-10-16 客户批准；设计 `2026-10-16_design_role-capability-install` §5.4/§九 I7）—————
// I7＝行样式：安装/卸载（`install_skill`/`uninstall_skill`）工具行与 `[系统·安装]` 定格系统行的**如实标注**——
// 复用既有工具行口径与 `[系统·<子类>]` 先例，不新造行体系。渲染平面对两工具名与子类标记**零引用**
// （`renderer.test.ts` 同批钉「零特判」）——下述用例把「通用链确有覆盖」钉在纯函数层。系统行正文措辞
// 属产出方（桌面窗口 handler / 文案单一来源）；本段只依赖**标记形态**与 classifier 契约字段，不钉全文。

test('G-4/I7：`[系统·安装]` 定格系统行走既有 system 归类——判据只依赖 `[系统·<子类>] ` 标记形态（不逐子类登记）', () => {
  // 实时回显路径（适配器回显为 `用户指令：<正文>`）。
  const echo = tools.classifyInjectedMessage('用户指令：[系统·安装] 技能「t-plan」已安装 → 角色「实现者」（docs/skills/t-plan/SKILL.md）。');
  assert.equal(echo?.kind, 'system', '安装系统行应归类为 system（沿 [系统·看护] 同族）');
  assert.equal(echo?.label, '系统消息 · 安装', 'chip 标签=「系统消息 · <子类原文>」');
  assert.equal(echo?.sourceRoleId, '', '来源=系统（非角色）——无角色来源可提取');
  assert.ok(String(echo?.body).startsWith('[系统·安装] '), 'body 保持投递原文（判据来源不变）');
  assert.equal(echo?.displayBody, '技能「t-plan」已安装 → 角色「实现者」（docs/skills/t-plan/SKILL.md）。', 'W6b 口径：正文展示剥离文首标记（chip 已承载）');
  // 回放路径（无「用户指令：」前缀）同解；卸载完成行同用该子类（子类集合=文案单一来源，渲染侧不登记枚举）。
  const replay = tools.classifyInjectedMessage('[系统·安装] 技能「t-plan」已卸载（效果已撤；文件保留于 docs/skills/t-plan/SKILL.md，sha256 0123456789ab）。');
  assert.equal(replay?.kind, 'system', '回放原始投递文本同样归类（安装/卸载完成行同族）');
  assert.equal(replay?.label, '系统消息 · 安装');
  assert.ok(String(replay?.displayBody).startsWith('技能「t-plan」已卸载'), 'displayBody 剥离仅去标记与空白，不动正文');
  // 仅标记无正文：displayBody 为空串（chip 已承载「安装」子类信息）。
  assert.equal(tools.classifyInjectedMessage('[系统·安装]')?.displayBody, '');
  // 「看起来像」仍不归类（沿 G-2 防误伤口径回归——行内提及不冒充投递）。
  assert.equal(tools.classifyInjectedMessage('用户指令：我让你用 [系统·安装] 这种方式装'), null, '行内提及不算（标记必须在行首）');
});

test('G-4/I7：install_skill/uninstall_skill 工具行按事件事实通用渲染——结构化与 legacy 两路径零特判', () => {
  // 调用发起（结构化事件，无 display）：工具名原样进事实；非屏障 ⇒ 属轮内工具组（折叠口径按工具名计数适用）。
  const start = tools.activityOf({ kind: 'tool_call', turnId: 't-g4', detail: { toolName: 'install_skill', toolCallId: 'g4-call', phase: 'start' } });
  assert.equal(start.toolName, 'install_skill', '工具名=事件事实（下划线命名不截断/不改写）');
  assert.equal(start.status, 'call');
  assert.equal(start.label, '调用发起');
  assert.equal(start.barrier, false, '非 SPECIAL_TOOLS/无 display ⇒ 走轮内工具组（不发明卡片/屏障语义）');
  // 结果（结构化、带 display——真实投影路径恒带）：状态/目标走既有点位（display.target 安全目标）。
  const done = tools.activityOf({ kind: 'accepted', turnId: 't-g4', detail: { toolName: 'uninstall_skill', toolCallId: 'g4-call', phase: 'result', ok: true, status: 'completed', display: { version: 1, omissions: [], target: { kind: 'path', value: { text: 'docs/skills/t-plan/install.md' } } } } });
  assert.equal(done.toolName, 'uninstall_skill');
  assert.equal(done.status, 'completed');
  assert.equal(done.label, '执行完成');
  assert.equal(done.fullTarget, 'docs/skills/t-plan/install.md', '目标取 display 单点（不读原始参数）');
  // 回执失败（ok:false＝未执行、零副作用）：走既有 failed 口径；护栏原因在可见首行如实保留（不吞因、不美化）。
  const refused = tools.activityOf({ kind: 'denied', turnId: 't-g4', summary: 'install_skill：技能安装**未执行**（reason: not-customer-turn；回执：仅客户消息发起的轮次可执行）——零副作用；**不要当它已安装**，如实告知客户。', detail: { toolName: 'install_skill', toolCallId: 'g4-call2', phase: 'result', ok: false, status: 'failed' } });
  assert.equal(refused.status, 'failed', 'ok:false 走既有失败口径（行分类单点）');
  assert.equal(refused.exceptional, true);
  assert.ok(refused.visibleSummary.includes('not-customer-turn'), '失败原因（护栏 reason）在可见首行如实保留');
  // legacy 文本路径：`调用工具 install_skill` 可被既有正则识别（`[\w.-]+` 含下划线——命名不因字符集失配）。
  const legacyCall = tools.activityOf({ kind: 'tool', text: '调用工具 install_skill' });
  assert.equal(legacyCall.toolName, 'install_skill');
  assert.equal(legacyCall.status, 'call');
  // 瘦身映射（真实回执文本形状，tools.ts 单一来源）：冒号口径含下划线零漂移、含路径不折叠、硬上限照旧。
  const slimmed = tools.slimToolRow('install_skill：技能「t-plan」已安装 → 角色「实现者」。内容：docs/skills/t-plan/SKILL.md（sha256 0123456789ab）；生效：已重建该角色会话、即刻生效。注意：本次安装**未改变任何角色的写边界**——技能是必读资料，不是权限。');
  assert.ok(slimmed.startsWith('install_skill：'), '「工具名：」口径解析零漂移');
  assert.ok(slimmed.includes('docs/skills/t-plan/SKILL.md'), '含路径样内容不折叠为「…」（既有「无路径才折叠」口径）');
  assert.ok(slimmed.length <= tools.LIMIT + 1, '硬上限 140（超限截断加「…」——既有口径）');
  assert.equal(tools.slimToolRow('uninstall_skill：uninstall_skill: docs/skills/t-plan/install.md'), 'uninstall_skill：docs/skills/t-plan/install.md', '重复工具名段去重沿既有口径');
});

test('G-4/I7：折叠分解按工具名计数——新工具名进「本轮 N 个调用：a / b ×k」摘要数据面（无白名单/特判）', () => {
  const items = [
    { callId: 'g1', turnId: 't', status: 'call', toolName: 'install_skill' },
    { callId: 'g1', turnId: 't', status: 'completed', toolName: 'install_skill' },
    { callId: 'g2', turnId: 't', status: 'call', toolName: 'uninstall_skill' },
    { callId: 'g2', turnId: 't', status: 'completed', toolName: 'uninstall_skill' },
    { callId: 'g3', turnId: 't', status: 'call', toolName: 'read_file' },
  ];
  // 同一 toolCallId 的发起+结果并一行（S1 口径对新工具名同解）；分解=首现序逐名计数。
  assert.deepEqual(tools.callSummary(items), {
    calls: 3, denied: 0, failed: 0, unknown: false,
    tools: [ { name: 'install_skill', count: 1 }, { name: 'uninstall_skill', count: 1 }, { name: 'read_file', count: 1 } ],
  }, '安装/卸载调用行与既有工具走同一条计数路径（装-看-用-撤链的折叠摘要可读）');
  // ×k：同一工具多次调用 ⇒ ×2（装→撤复盘场景）；名字逐字为工具名（大小写/下划线原样，不美化不改写）。
  assert.deepEqual(tools.callSummary([
    { callId: 'x1', turnId: 't', status: 'completed', toolName: 'install_skill' },
    { callId: 'x2', turnId: 't', status: 'completed', toolName: 'install_skill' },
  ]).tools, [ { name: 'install_skill', count: 2 } ]);
  // 折叠行文案形制「本轮 N 个调用：…」的通用性（t.name 直出）由 renderer.test.ts 同批守卫（本段钉数据面）。
});

// ————— G-4/V2-MCP（2026-10-16 客户批准 V2 分批实施；设计 `2026-10-16_design_role-capability-install` §5.4/§九-V2）————
// MCP 面的渲染最小确认面（沿 G-4/I7 体格）：①外来 MCP 工具名形态＝`mcp__<server>__<tool>`（探针定格——Claude
// `mcp__probe__echo`；Pi 清洗 `[^A-Za-z0-9_]`→`_`、超长 `_<hash8>` 缩短在后部、前缀完整；Codex server 名 `-`→`_`；
// 三平台到渲染侧的收口形态同款：kind tool_call/accepted/denied + detail.toolName——Claude＝hook start＋泵 result、
// Codex＝`mcpToolCall` item 映射〔适配器 wave B 落地〕、Pi＝既有工具管道行）；②安装工具行 `install_mcp`/`uninstall_mcp`
// （设计 §3.2 冻结名，V2 工具面）；③`[系统·安装]` 系统行＝既有子类路径复用（I7 已钉标记形态判据，此处以 MCP 语境复证——
// 无需新登记）。渲染平面对三个新名字组**零引用**（renderer.test.ts 同批钉「零特判」）——下述用例把「通用链确有
// 覆盖」钉在纯函数层；系统行正文措辞属产出方（文案单一来源），本段只钉标记形态与 classifier 契约字段。

test('G-4/V2-MCP：mcp__<server>__<tool> 形态工具名走通用工具行链——名称解析/瘦身零特判（下划线/清洗/缩短形态全收）', () => {
  // 结构化事件（三平台收口形态：Claude hook start/泵 result、Codex item 映射落点、Pi 管道行）：toolName 原样进事实。
  const start = tools.activityOf({ kind: 'tool_call', turnId: 'mcp-turn', detail: { toolName: 'mcp__probe__echo', toolCallId: 'mcp-call', phase: 'start' } });
  assert.equal(start.toolName, 'mcp__probe__echo', '双下划线工具名原样（不截断/不改写——名称=事件事实）');
  assert.equal(start.status, 'call');
  assert.equal(start.label, '调用发起');
  assert.equal(start.barrier, false, '非 SPECIAL_TOOLS/无 display ⇒ 轮内工具组（不发明卡片/屏障语义）');
  // 结果（带 display——真实投影路径恒带）：状态/目标走既有点位（display.target 安全目标单点）。
  const done = tools.activityOf({ kind: 'accepted', turnId: 'mcp-turn', detail: { toolName: 'mcp__probe__echo', toolCallId: 'mcp-call', phase: 'result', ok: true, status: 'completed', display: { version: 1, omissions: [], target: { kind: 'command', value: { text: 'echo probe-input', truncated: false, redacted: false } } } } });
  assert.equal(done.status, 'completed');
  assert.equal(done.fullTarget, 'echo probe-input', '目标取 display 单点（不读原始参数）');
  assert.equal(done.barrier, true, '真实投影事件恒带 display ⇒ 生命周期独立行（沿 I7 同款呈现路径）');
  // blocked（白名单放行分支就位前，探针观测形态＝denied/blocked/mcp__probe__echo；放行后就位后该相位对未白名单名照旧）：
  // 走既有治理信号口径——未放行如实、原因可见（行分类单点不在渲染侧）。
  const blocked = tools.activityOf({ kind: 'denied', turnId: 'mcp-turn', summary: '拒绝执行：非白名单 MCP 工具', detail: { toolName: 'mcp__probe__echo', toolCallId: 'mcp-call2', phase: 'blocked' } });
  assert.equal(blocked.status, 'denied');
  assert.equal(blocked.label, '已拒绝');
  assert.equal(blocked.exceptional, true);
  // legacy 文本路径：`调用工具 mcp__probe__echo` 被既有正则识别（`[\w.-]+` 含下划线——命名不因字符集失配）；
  // 结果行冒号口径同款（MCP 结果正文可含 JSON 花括号/内层冒号——首段解析不受影响）。
  const legacyCall = tools.activityOf({ kind: 'tool', text: '调用工具 mcp__probe__echo' });
  assert.equal(legacyCall.toolName, 'mcp__probe__echo');
  assert.equal(legacyCall.status, 'call');
  assert.equal(tools.activityOf({ kind: 'tool', text: 'mcp__probe__echo：{"echo":"probe-input"}' }).toolName, 'mcp__probe__echo');
  // 清洗/缩短形态（Pi 探针实测逐字：`-`/`.`→`_`；超长名 `_<hash8>` 缩短在后部）＋server 名含连字符的防御面——全部 `[\w.-]` 内。
  for (const name of ['mcp__probe_a__echo', 'mcp__probe_srv_v2__tool_name_that_is_quite_long_indeed__731aa8e9', 'mcp__probe-surface__echo']) {
    assert.equal(tools.activityOf({ kind: 'tool_call', detail: { toolName: name, toolCallId: 'c', phase: 'start' } }).toolName, name, '名称逐字保留：' + name);
  }
  // 瘦身映射：冒号口径 + 重复工具名段去重 + 长无路径折叠为「…」+ 含路径不折叠——全部既有规则，零漂移。
  assert.equal(tools.slimToolRow('mcp__probe__echo：mcp__probe__echo: {"echo":"probe-input"}'), 'mcp__probe__echo：{"echo":"probe-input"}', '重复工具名段去重沿既有口径');
  assert.ok(tools.slimToolRow('mcp__probe__echo：' + 'x'.repeat(80)).endsWith('echo：…'), '长无路径内容折叠为「…」（既有 >60 无路径口径）');
  assert.ok(tools.slimToolRow('mcp__probe__echo：结果已存：docs/mcp/probe-surface.md（原样）').includes('docs/mcp/probe-surface.md'), '含路径样内容不折叠（既有「无路径才折叠」口径）');
  assert.ok(tools.slimToolRow('mcp__probe__echo：' + 'y'.repeat(200)).length <= tools.LIMIT + 1, '硬上限 140（超限截断加「…」——既有口径）');
});

test('G-4/V2-MCP：折叠分解按工具名计数——mcp__<server>__<tool> 名进「本轮 N 个调用：a / b ×k」数据面（无白名单）', () => {
  const items = [
    { callId: 'mc1', turnId: 't', status: 'call', toolName: 'mcp__probe__echo' },
    { callId: 'mc1', turnId: 't', status: 'completed', toolName: 'mcp__probe__echo' },
    { callId: 'mc2', turnId: 't', status: 'call', toolName: 'mcp__probe__echo' },
    { callId: 'mc2', turnId: 't', status: 'completed', toolName: 'mcp__probe__echo' },
    { callId: 'mc3', turnId: 't', status: 'call', toolName: 'read_file' },
  ];
  // 同一 toolCallId 的发起+结果并一行（S1 口径对 MCP 名同解）；分解=首现序逐名计数、×k 原样（装进既有折叠摘要）。
  assert.deepEqual(tools.callSummary(items), {
    calls: 3, denied: 0, failed: 0, unknown: false,
    tools: [ { name: 'mcp__probe__echo', count: 2 }, { name: 'read_file', count: 1 } ],
  }, 'MCP 调用与既有工具走同一条计数路径（名逐字、含下划线，不美化不改写）');
  // 异常分桶照旧（未放行优先；timed-out 归失败）——MCP 名不改变任何分桶。
  const mixed = [
    { callId: 'md1', turnId: 't', status: 'call', toolName: 'mcp__probe__echo' },
    { callId: 'md1', turnId: 't', status: 'denied', toolName: 'mcp__probe__echo' },
    { callId: 'md2', turnId: 't', status: 'timed-out', toolName: 'mcp__probe__hang' },
  ];
  assert.deepEqual(tools.callSummary(mixed), {
    calls: 2, denied: 1, failed: 1, unknown: false,
    tools: [ { name: 'mcp__probe__echo', count: 1 }, { name: 'mcp__probe__hang', count: 1 } ],
  });
  // 折叠行文案形制（t.name 直出）的通用性由 renderer.test.ts 同批守卫（本段钉数据面）。
});

test('G-4/V2-MCP：install_mcp/uninstall_mcp 工具行通用渲染 + `[系统·安装]` 系统行＝既有子类复用（MCP 语境复证）', () => {
  // 安装工具行（V2 工具面，设计 §3.2 冻结名）：调用发起/结果/护栏拒绝沿 I7 同款口径（事件事实，零特判）。
  const start = tools.activityOf({ kind: 'tool_call', turnId: 'mcp-inst', detail: { toolName: 'install_mcp', toolCallId: 'im-1', phase: 'start' } });
  assert.equal(start.toolName, 'install_mcp');
  assert.equal(start.status, 'call');
  assert.equal(start.barrier, false, '非 SPECIAL_TOOLS/无 display ⇒ 轮内工具组');
  const done = tools.activityOf({ kind: 'accepted', turnId: 'mcp-inst', detail: { toolName: 'install_mcp', toolCallId: 'im-1', phase: 'result', ok: true, status: 'completed', display: { version: 1, omissions: [], target: { kind: 'path', value: { text: 'docs/mcp/probe-surface.md', truncated: false, redacted: false } } } } });
  assert.equal(done.status, 'completed');
  assert.equal(done.fullTarget, 'docs/mcp/probe-surface.md', '目标取 display 单点（声明文件路径）');
  const refused = tools.activityOf({ kind: 'denied', turnId: 'mcp-inst', summary: 'install_mcp：MCP 安装**未执行**（reason: not-customer-turn；回执：仅客户消息发起的轮次可执行）——零副作用；**不要当它已安装**，如实告知客户。', detail: { toolName: 'install_mcp', toolCallId: 'im-2', phase: 'result', ok: false, status: 'failed' } });
  assert.equal(refused.status, 'failed', 'ok:false 走既有失败口径（行分类单点）');
  assert.equal(refused.exceptional, true);
  assert.ok(refused.visibleSummary.includes('not-customer-turn'), '失败原因（护栏 reason）在可见首行如实保留');
  assert.equal(tools.activityOf({ kind: 'tool', text: '调用工具 uninstall_mcp' }).toolName, 'uninstall_mcp', 'legacy 文本路径同款');
  assert.equal(tools.slimToolRow('uninstall_mcp：uninstall_mcp: docs/mcp/probe-surface.md'), 'uninstall_mcp：docs/mcp/probe-surface.md', '瘦身/去重沿既有口径');
  // 系统行：MCP 安装完成行同用 `[系统·安装]` 子类（沿 I7 冻结面「安装/卸载完成后的定格系统行」）——
  // 判据只依赖 `[系统·<子类>] ` 标记形态 ⇒ **无需新登记**（渲染侧零改动达成「复用既有子类路径」）；
  // 正文措辞属产出方，本段只钉形态/标签/displayBody 契约字段，不钉全文。
  const echo = tools.classifyInjectedMessage('用户指令：[系统·安装] MCP server「probe-surface」已安装 → 角色「实现者」（docs/mcp/probe-surface.md）。');
  assert.equal(echo?.kind, 'system', 'MCP 安装系统行归类 system（沿 [系统·安装] 既有子类路径）');
  assert.equal(echo?.label, '系统消息 · 安装');
  assert.equal(echo?.sourceRoleId, '', '来源=系统（非角色）');
  assert.equal(echo?.displayBody, 'MCP server「probe-surface」已安装 → 角色「实现者」（docs/mcp/probe-surface.md）。', 'displayBody 剥离文首标记（W6b 口径）');
  const replay = tools.classifyInjectedMessage('[系统·安装] MCP server「probe-surface」已卸载（效果已撤；声明保留于 docs/mcp/probe-surface.md）。');
  assert.equal(replay?.kind, 'system', '回放原始投递文本同解（卸载完成行同族）');
  assert.equal(replay?.label, '系统消息 · 安装');
});

// ————— G-5 wave 2（2026-10-16 客户批准 G-5「按推荐批准，开始实施」；设计 `2026-10-16_design_reasoning-and-effort` §5.2）—————
// 推理折叠行文案/可展开性＝**纯函数单点**（`reasoningLabel`/`reasoningFoldable`，本模块唯一实现——renderer 只取用）。
// 文案纪律：有真实时长信号才显示秒数（无信号不发明时间）、平台省略内容时不假装有内容；消费输入＝核心投影冻结形
// `RuntimeReasoningDisplayDetailV1.reasoning`（脱敏/预算已在投影单点发生，本层不碰内容）。

test('G-5/wave2：reasoningLabel 文案边界——时长仅真实信号才显示、省略不假装内容、无时长不发明时间', () => {
  const t = (v: string) => ({ text: v, truncated: false, redacted: false });
  // complete ＋ durationMs ⇒ 「已思考 N 秒」（四舍五入到整秒）。
  assert.equal(tools.reasoningLabel({ text: t('想了一会儿'), status: 'complete', durationMs: 5200 }), '已思考 5 秒');
  assert.equal(tools.reasoningLabel({ text: t('…'), status: 'complete', durationMs: 1500 }), '已思考 2 秒');
  // complete 无时长 ⇒ 「推理内容」（不发明时间——没有真实起止就不显示秒数）。
  assert.equal(tools.reasoningLabel({ text: t('…'), status: 'complete' }), '推理内容');
  // omitted ⇒ 如实注明「内容由平台省略」（有真实时长则一并如实）；绝不拿「发生」冒充「内容」。
  assert.equal(tools.reasoningLabel({ text: t(''), status: 'omitted', durationMs: 30000 }), '已思考 30 秒（内容由平台省略）');
  assert.equal(tools.reasoningLabel({ text: t(''), status: 'omitted' }), '已思考（内容由平台省略）');
  // 亚秒真实信号 ⇒ 下限 1 秒（防「已思考 0 秒」措辞坏件；round(999/1000)=1 自然命中、round(200/1000)=0 被下限接住）。
  assert.equal(tools.reasoningLabel({ text: t('x'), status: 'complete', durationMs: 999 }), '已思考 1 秒');
  assert.equal(tools.reasoningLabel({ text: t('x'), status: 'complete', durationMs: 200 }), '已思考 1 秒', '亚秒下限 1 秒（不出现 0 秒）');
  // 非法时长（负/NaN/Infinity/非数字）按无信号——绝不猜测。
  assert.equal(tools.reasoningLabel({ text: t('x'), status: 'complete', durationMs: -5 }), '推理内容');
  assert.equal(tools.reasoningLabel({ text: t('x'), status: 'complete', durationMs: NaN }), '推理内容');
  assert.equal(tools.reasoningLabel({ text: t('x'), status: 'complete', durationMs: Infinity }), '推理内容');
  assert.equal(tools.reasoningLabel({ text: t('x'), status: 'complete', durationMs: '3000' as unknown as number }), '推理内容', '非数字不猜测');
  // 防御：缺对象/坏件不抛、按无内容和无时长形态。
  assert.equal(tools.reasoningLabel(null), '推理内容');
  assert.equal(tools.reasoningLabel('complete' as unknown as object), '推理内容');
});

test('G-5/wave2：reasoningFoldable——仅 complete 且正文非空可展开；omitted/空正文/坏件＝如实单行', () => {
  const t = (v: string) => ({ text: v, truncated: false, redacted: false });
  assert.equal(tools.reasoningFoldable({ text: t('有正文'), status: 'complete' }), true);
  assert.equal(tools.reasoningFoldable({ text: t('有正文'), status: 'complete', durationMs: 4000 }), true, '时长不影响可展开性');
  assert.equal(tools.reasoningFoldable({ text: t(''), status: 'omitted' }), false, 'omitted 无内容可展（不摆空展开器）');
  assert.equal(tools.reasoningFoldable({ text: t(''), status: 'complete' }), false, 'complete 但空正文（仅签名/零长）无内容可展');
  assert.equal(tools.reasoningFoldable(null), false);
  assert.equal(tools.reasoningFoldable({ status: 'complete' } as unknown as object), false, '缺 text 坏件防御');
});

// ————— D1：治理记录 pin 不符的重新接受（2026-10-17 评审 §5.4；文案单一来源 = ui-labels）—————
// 纯映射契约：动作谓词唯一入口 + 全部文案逐字 + 失败分支（phase=write 与 precheck 的差异）。

test('D1：governanceActionFor 真值表——pin-mismatch ⇒ reaccept；missing ⇒ establish；其余 null', () => {
  assert.equal(labels.governanceActionFor(true, true, 'pin-mismatch'), 'reaccept');
  assert.equal(labels.governanceActionFor(true, false, 'pin-mismatch'), 'reaccept', 'pin-mismatch 不依赖 hasRoles（恢复入口优先）');
  assert.equal(labels.governanceActionFor(true, true, 'missing'), 'establish');
  assert.equal(labels.governanceActionFor(true, false, 'missing'), null, 'S0（无角色）不显示 establish');
  assert.equal(labels.governanceActionFor(false, true, 'pin-mismatch'), null, '无项目一律 null');
  assert.equal(labels.governanceActionFor(false, true, 'missing'), null, '无项目一律 null');
  assert.equal(labels.governanceActionFor('x', true, 'pin-mismatch'), null, '非布尔真值不当「有项目」');
  assert.equal(labels.governanceActionFor(true, true, 'present'), null);
  assert.equal(labels.governanceActionFor(true, true, 'invalid'), null);
  assert.equal(labels.governanceActionFor(true, true, 'unknown-state'), null, '未知状态 fail-closed');
  // 既有导出保留并委托单点：恰 establish 时为 true。
  assert.equal(labels.canEstablishGovernance(true, true, 'missing'), true);
  assert.equal(labels.canEstablishGovernance(true, true, 'pin-mismatch'), false, 'reaccept 不冒充 establish');
});

test('D1：governancePinMismatchText/EmptyState——只列非零类别、全零用「存在不一致」、逐字', () => {
  assert.equal(
    labels.governancePinMismatchText(9, [{ status: 'modified' }]),
    '治理记录与盘上边界不一致：共 9 条 pin，其中 1 个与记录不一致（1 个内容已变更）。未确认前，会话不能开启、写入会被拒绝。'
  );
  assert.equal(
    labels.governancePinMismatchText(9, [{ status: 'modified' }, { status: 'missing' }, { status: 'unreadable' }]),
    '治理记录与盘上边界不一致：共 9 条 pin，其中 3 个与记录不一致（1 个内容已变更、1 个缺失、1 个不可读）。未确认前，会话不能开启、写入会被拒绝。'
  );
  assert.equal(
    labels.governancePinMismatchText(9, [{ status: 'modified' }, { status: 'modified' }]),
    '治理记录与盘上边界不一致：共 9 条 pin，其中 2 个与记录不一致（2 个内容已变更）。未确认前，会话不能开启、写入会被拒绝。',
    '同类合并计数、只列非零类别'
  );
  assert.equal(
    labels.governancePinMismatchText(9, [{ status: 'weird' }]),
    '治理记录与盘上边界不一致：共 9 条 pin，其中 1 个与记录不一致（存在不一致）。未确认前，会话不能开启、写入会被拒绝。',
    '三类均零 ⇒「存在不一致」（不编类别）'
  );
  // 防御：缺参不崩、按 0 条展示。
  assert.ok(labels.governancePinMismatchText(undefined, undefined).startsWith('治理记录与盘上边界不一致：共 0 条 pin，其中 0 个与记录不一致（存在不一致）。'));

  const empty = labels.governancePinMismatchEmptyState(9, [{ status: 'modified' }]);
  assert.equal(empty.kind, 'governance');
  assert.equal(empty.title, '治理记录与盘上边界不一致');
  assert.equal(
    empty.sub,
    '治理记录与盘上边界不一致：共 9 条 pin，其中 1 个与记录不一致（1 个内容已变更）。未确认前，会话不能开启、写入会被拒绝。' +
      '确认接受后只会刷新 SHA-256 与留痕，不会修改任何边界文件内容。'
  );
  assert.equal(empty.hint, '也可在终端核对 git 历史后再处理。');
});

test('D1：governanceReacceptPreviewView——逐文件行/写入行/pin 行/警示/blockers 逐字', () => {
  const preview = {
    pinCount: 9,
    changed: [
      { path: '角色卡/assembly/boundary.yaml', pinned: 'a1b2c3d4e5f60718', actual: '9f8e7d6c5b4a0000', status: 'modified' },
      { path: '角色卡/x/boundary.yaml', pinned: 'ffffffffffffffff', actual: null, status: 'missing' },
      { path: '角色卡/y/boundary.yaml', pinned: 'eeeeeeeeeeeeeeee', actual: null, status: 'unreadable' },
    ],
    canConfirm: false,
    blockers: [
      { code: 'missing-file', paths: ['角色卡/x/boundary.yaml'], message: '有 pin 目标缺失：角色卡/x/boundary.yaml' },
    ],
  };
  const view = labels.governanceReacceptPreviewView(preview);
  assert.equal(view.title, '重新接受治理边界（预览）');
  assert.deepEqual(view.fileLines.map((x: { text: string }) => x.text), [
    '角色卡/assembly/boundary.yaml — 内容已变更（pin a1b2c3d4… → 现 9f8e7d6c…）',
    '角色卡/x/boundary.yaml — 文件缺失（无法重新 pin）',
    '角色卡/y/boundary.yaml — 文件不可读（无法重新 pin）',
  ]);
  assert.equal(view.writeLine, '将写入：.ans/project.json、docs/bootstrap-manifest.md');
  assert.equal(view.pinLine, '将重算这 9 条 pin；不新增、不删除 pin 条目，不修改任何边界文件内容。');
  assert.equal(view.warning, '如果不认识这些改动，请先通过 git 历史或备份核对，不要直接接受。');
  assert.equal(view.canConfirm, false, 'canConfirm 只认 true（fail-closed）');
  assert.deepEqual(view.blockerLines, ['有 pin 目标缺失：角色卡/x/boundary.yaml']);
  // 未知状态不编语义、不展示。
  const unknown = labels.governanceReacceptPreviewView({ pinCount: 1, changed: [{ path: 'a.yaml', status: 'weird' }], canConfirm: true });
  assert.deepEqual(unknown.fileLines, []);
  assert.equal(unknown.canConfirm, true);
});

test('D1：governanceReacceptSuccessText 逐字', () => {
  assert.equal(
    labels.governanceReacceptSuccessText(9, 1),
    '已重新接受：更新 1 条 pin（共 9 条），写入 .ans/project.json 与 docs/bootstrap-manifest.md。项目已恢复可用。'
  );
  assert.equal(
    labels.governanceReacceptSuccessText(9, 0),
    '已重新接受：更新 0 条 pin（共 9 条），写入 .ans/project.json 与 docs/bootstrap-manifest.md。项目已恢复可用。',
    '计数如实（不伪造变更数）'
  );
});

// ————— P5：「替我审批」/「替我决策」双开关（2026-10-18 评审 §三/§八/§九；文案单一来源 = ui-labels）—————
// 纯映射契约：两开关各自三态（桥缺失/驱动缺失不得假开启）、失败不改状态、警告按开启组列行、
// 治理结果行（代审批/代决策）、manual 不产生结果行、手动回落 judgeNotice 两类文案。

test('P5：approval 开关视图——未开启默认「替我审批」、开启琥珀标记、桥缺失禁用且不假开启', () => {
  const off = labels.shellJudgeToggleView(true, false, false);
  assert.equal(off.label, '替我审批');
  assert.equal(off.title, '手动逐条确认 shell 命令与 trio 写盘/写卡确认（默认）');
  assert.equal(off.checked, false);
  assert.equal(off.disabled, false);
  assert.equal(off.enabled, false, '未开启无琥珀紧凑标记');

  const on = labels.shellJudgeToggleView(true, true, false);
  assert.equal(on.label, '替我审批中 · 判断 agent');
  assert.equal(on.title, '判断 agent 先评估 shell 命令与 trio 写盘/写卡确认；可随时关闭');
  assert.equal(on.checked, true);
  assert.equal(on.enabled, true, '开启期间保留琥珀紧凑标记（长文警告只出现一次）');

  const busy = labels.shellJudgeToggleView(true, true, true);
  assert.equal(busy.disabled, true, 'IPC 在途只禁用，不改真实状态/文案');
  assert.equal(busy.checked, true);
  assert.equal(busy.label, on.label);

  // 桥缺失/未接线：禁用 + 固定文案；即使传入 enabled=true 也**绝不**显示开启态。
  const missing = labels.shellJudgeToggleView(false, true, false);
  assert.equal(missing.available, false);
  assert.equal(missing.enabled, false, '桥缺失不得假开启');
  assert.equal(missing.checked, false);
  assert.equal(missing.disabled, true);
  assert.equal(missing.label, '当前版本不支持自动判断，保持手动');
  assert.equal(missing.title, '当前版本不支持自动判断，保持手动');
});

test('P5：decision 开关视图——默认「替我决策」、开启标记、single 禁用并说明、桥缺失不假开启', () => {
  const off = labels.judgeToggleView('decision', true, false, false, null);
  assert.equal(off.label, '替我决策');
  assert.equal(off.title, '手动逐张确认提案接受、任命与验收（默认）');
  assert.equal(off.checked, false);
  assert.equal(off.disabled, false);

  const on = labels.judgeToggleView('decision', true, true, false, null);
  assert.equal(on.label, '替我决策中 · 判断 agent');
  assert.equal(on.checked, true);
  assert.equal(on.enabled, true, '两个开启态各自保留紧凑标记');

  // single 项目：禁用 + 人话说明；即使主进程残留 enabled=true 也不勾选。
  const single = labels.judgeToggleView('decision', true, true, false, { singleDisabled: true });
  assert.equal(single.disabled, true);
  assert.equal(single.checked, false, 'single 下不得显示假开启态');
  assert.equal(single.note, '旧治理模型（single）不支持代决策');
  assert.equal(single.label, '替我决策', 'single 说明走状态位，不顶掉开关标签');
  assert.equal(single.enabled, false);

  // 桥缺失（含主进程 available:false）：与 approval 同一句禁用文案。
  const missing = labels.judgeToggleView('decision', false, true, false, null);
  assert.equal(missing.disabled, true);
  assert.equal(missing.checked, false);
  assert.equal(missing.label, '当前版本不支持自动判断，保持手动');

  // 两开关互不影响：approval 的开关视图不因 decision 状态变化。
  assert.equal(labels.shellJudgeToggleView(true, false, false).label, '替我审批');
  assert.equal(labels.judgeToggleView('approval', true, false, false, { singleDisabled: true }).label, '替我审批',
    'singleDisabled 只作用于 decision 组');
  assert.equal(labels.judgeToggleView('unknown', true, false, false, null).label, '替我审批');
});

test('P5：一次性开启警告——每组各自一次、关闭/重绘不重现、关开关再开启才再显示', () => {
  // 关闭态：不显示，并清掉「已提示」（客户关闭开关后再次开启要再提示一次）。
  assert.deepEqual(labels.judgeWarningStep(false, false), { shown: false, show: false });
  assert.deepEqual(labels.judgeWarningStep(false, true), { shown: false, show: false }, '关闭开关即复位「已提示」');
  // 首次开启：显示一次并记住。
  assert.deepEqual(labels.judgeWarningStep(true, false), { shown: true, show: true }, '首次开启显示一次');
  // 已提示后：重绘/收消息/切角色/重复推送都不再显示。
  assert.deepEqual(labels.judgeWarningStep(true, true), { shown: true, show: false }, '已关闭/已自动消失后不重复显示');
  // 关闭再开启：重新显示一次。
  const afterOff = labels.judgeWarningStep(false, true);
  assert.deepEqual(labels.judgeWarningStep(true, afterOff.shown), { shown: true, show: true }, '关闭再开启会再次显示');
  // 兼容别名仍是同一状态机（approval 组）。
  assert.deepEqual(labels.shellJudgeWarningStep(true, false), { shown: true, show: true });
  // 每组各自一份 shown：decision 首次开启（approval 已提示过）仍会再显示一次同一块警告。
  assert.deepEqual(labels.judgeWarningStep(true, false), { shown: true, show: true }, '另一组首次开启再显示一次');
  // 文案与时长单点。
  assert.equal(labels.SHELL_JUDGE_WARNING_CLOSE_LABEL, '知道了', '关闭按钮文案单一来源');
  assert.ok(
    labels.SHELL_JUDGE_WARNING_AUTO_DISMISS_MS >= 8000 && labels.SHELL_JUDGE_WARNING_AUTO_DISMISS_MS <= 10000,
    '自动收起时长在客户要求的 8–10 秒内'
  );
});

test('P5：开关 IPC 结果——成功采用主进程实际值；失败/坏件保持原状态并给错误', () => {
  assert.deepEqual(labels.shellJudgeToggleResult(false, { ok: true, enabled: true }), { enabled: true, error: '' });
  assert.deepEqual(labels.shellJudgeToggleResult(true, { ok: true, enabled: false }), { enabled: false, error: '' }, '主进程是权威（即便与点击意图相反）');
  const failed = labels.shellJudgeToggleResult(true, { ok: false, error: 'IPC 拒绝' });
  assert.equal(failed.enabled, true, '失败不改状态');
  assert.equal(failed.error, 'IPC 拒绝');
  const malformed = labels.shellJudgeToggleResult(false, { ok: true });
  assert.equal(malformed.enabled, false, '缺 enabled 视为未确认（保持原状态）');
  assert.ok(malformed.error.length > 0, '坏件给出可见错误');
  const thrown = labels.shellJudgeToggleResult(true, null);
  assert.equal(thrown.enabled, true);
  assert.ok(thrown.error.includes('通道异常'));
});

test('P5：开启警告——同一块按开启组列行（approval / decision / 两组同开）', () => {
  const approval = labels.judgeWarningLines(['approval']);
  assert.equal(approval.length, 4, '一段组说明 + 三段共享说明');
  assert.deepEqual(approval[0], {
    text: '替我审批中：shell 命令与写盘/写卡确认（write / appointment-write / schedule-write）将由判断 agent 代批。',
    strong: true,
  });
  assert.ok(approval[1].text.includes('只读项目内代码/文档/角色卡'), '共享只读范围说明');
  assert.ok(approval[1].text.includes('按所属开关回落逐张卡'), '共享回落说明');
  assert.equal(approval[1].strong, false);
  assert.ok(approval[2].text.includes('提案快捷路径（accept-quick）默认不代批'));
  assert.ok(approval[3].text.includes('judge 代批 · 代审批/代决策'));

  const decision = labels.judgeWarningLines(['decision']);
  assert.equal(decision.length, 4);
  assert.deepEqual(decision[0], {
    text: '替我决策中：提案接受、任命、验收将由判断 agent 代批。',
    strong: true,
  });

  const both = labels.judgeWarningLines(['approval', 'decision']);
  assert.equal(both.length, 5, '两个都开：两段组说明 + 三段共享说明（仍同一块）');
  assert.equal(both[0].strong, true);
  assert.equal(both[1].strong, true);

  const none = labels.judgeWarningLines([]);
  assert.equal(none.length, 3, '无开启组也返回共享说明（渲染侧不会展示）');
  // 返回新数组/对象：调用方不得改到单一来源。
  both[0].text = 'x';
  assert.notEqual(labels.judgeWarningLines(['approval'])[0].text, 'x');
  // 兼容旧调用方：approval 组文本（仅文字）与首行逐字。
  assert.equal(labels.shellJudgeWarningLines()[0], approval[0].text);
});

test('P5：结果行 allow——标题/摘要/档位/引擎/operator；摘要缺失不编命令意图', () => {
  const allow = labels.shellJudgeResultView({
    verdict: 'allow', engine: 'claude', operator: 'judge:claude', command: 'node -v', summary: '查看 Node 版本',
    tier: 'risky', reason: '只读版本信息', at: '2026-10-17T10:00:00Z', toolCallId: 'call-1',
  });
  assert.equal(allow.title, '已替你放行（判断 agent · 代审批）');
  assert.equal(allow.denyOverride, false);
  assert.equal(allow.label, '');
  assert.equal(allow.summary, '查看 Node 版本');
  assert.equal(allow.engineText, '判断引擎：Claude');
  assert.equal(allow.operatorText, 'operator:judge:claude');
  assert.equal(allow.tierText, '档位：risky');
  assert.deepEqual(allow.lines, []);
  assert.equal(allow.retryHint, '');
  assert.equal(allow.toolCallId, 'call-1');

  const noSummary = labels.shellJudgeResultView({ verdict: 'allow', engine: 'pi', operator: 'judge:pi', summary: null });
  assert.equal(noSummary.summary, '无法概括命令；展开查看原文', '不编命令意图');
  assert.equal(noSummary.tierText, '');
});

test('P5：结果行 allow + deny 档放行——标题与徽标必须一眼可分（客户 D1）', () => {
  const denyTier = labels.shellJudgeResultView({
    verdict: 'allow', engine: 'codex', operator: 'judge:codex', command: 'rm -rf build', summary: '删除构建目录',
    tier: 'deny', hardDenyOverride: true, label: 'deny 档 · judge 放行', reason: '构建产物可重建',
  });
  assert.equal(denyTier.denyOverride, true);
  assert.equal(denyTier.title, '已替你放行（判断 agent · 代审批 · deny 档）');
  assert.equal(denyTier.label, 'deny 档 · judge 放行');
  assert.equal(denyTier.tierText, '档位：deny');
  assert.deepEqual(denyTier.lines, ['该命令属于硬拒类，判断 agent 判定必要后放行；请复核']);
  // 仅 tier=deny（未带 hardDenyOverride）同样按 deny 档标记（契约说二者同现，渲染侧仍保守识别）。
  const tierOnly = labels.shellJudgeResultView({ verdict: 'allow', tier: 'deny', engine: 'claude' });
  assert.equal(tierOnly.denyOverride, true);
  assert.equal(tierOnly.label, 'deny 档 · judge 放行');
});

test('P5：结果行 deny——理由/替代方案/客户说明/关闭开关后重试的出路', () => {
  const deny = labels.shellJudgeResultView({
    verdict: 'deny', engine: 'claude', operator: 'judge:claude', command: 'rm -rf src', summary: '删除源码目录',
    tier: 'risky', reason: '会删除未提交源码', customerMessage: '该命令会删除项目源码，风险过高。',
    alternative: { kind: 'command', value: 'rm -rf dist', rationale: '只清理构建产物' }, toolCallId: 'call-2',
  });
  assert.equal(deny.title, '未放行（判断 agent · 代审批）');
  assert.equal(deny.denyOverride, false);
  assert.deepEqual(deny.lines, [
    '判断理由：会删除未提交源码',
    '替代方案：rm -rf dist（只清理构建产物）',
    '该命令会删除项目源码，风险过高。',
  ]);
  assert.ok(deny.retryHint.includes('关闭「替我审批」后重试'), 'deny 必须给出关闭开关后重试的出路');
  assert.ok(deny.retryHint.includes('替代方案'));

  const noAlt = labels.shellJudgeResultView({
    verdict: 'deny', engine: 'pi', reason: '不必要', customerMessage: '没有可替代方案，已说明原因。',
  });
  assert.deepEqual(noAlt.lines, ['判断理由：不必要', '没有可替代方案，已说明原因。']);
  assert.ok(noAlt.retryHint.length > 0, '无替代方案仍给出路');
});

test('P5：manual 不产生结果行；未知/坏件返回 null（不编裁决）', () => {
  assert.equal(labels.shellJudgeResultView({ verdict: 'manual', reasonCode: 'timeout' }), null);
  assert.equal(labels.shellJudgeResultView({ verdict: 'unknown' }), null);
  assert.equal(labels.shellJudgeResultView(null), null);
  assert.equal(labels.shellJudgeResultView('allow' as unknown as object), null);
});

test('P5：手动回落卡 judgeNotice——一般 manual 与 row-failed 分开且逐字（§10.4）', () => {
  assert.equal(
    labels.shellJudgeNoticeText('row-failed'),
    '判断 agent 已完成判断，但结果无法在聊天中显示；已转你手动确认。',
    'row-failed 不得说成「判断没发生」'
  );
  assert.equal(
    labels.shellJudgeNoticeText('timeout'),
    '判断 agent 未能完成判断：判断超时。已转你手动确认。'
  );
  assert.equal(
    labels.shellJudgeNoticeText('unsupported-engine'),
    '判断 agent 未能完成判断：当前引擎不支持自动判断。已转你手动确认。'
  );
  assert.equal(
    labels.shellJudgeNoticeText('row-failed').includes('未能完成判断'),
    false,
    '判断已完成 ⇒ 不使用「未能完成判断」措辞'
  );
  assert.ok(labels.shellJudgeNoticeText(undefined).includes('判断未完成'), '未知 reasonCode 如实说明判断未完成');
});

test('P5：治理代批结果行——「judge 代批 · 代审批/代决策」+ 结论/理由/引擎/选中项或路径', () => {
  const proposal = labels.governanceJudgeResultView({
    version: 1, id: 'r1', group: 'decision', cardKind: 'proposal', flowId: 'flow-a',
    engine: 'claude', operator: 'judge:claude', at: '2026-10-18T10:00:00Z', reasonCode: 'sufficient',
    reason: '提案范围清晰', selected: ['accept'], paths: [], evidence: ['docs/proposals/flow-a-v1.md'],
    toolCallId: 'call-1', requestId: 'req-1',
  });
  assert.equal(proposal.title, 'judge 代批 · 代决策');
  assert.equal(proposal.badge, '代决策');
  assert.equal(proposal.headline, '接受提案（accept） · 流程 flow-a');
  assert.equal(proposal.engineText, '判断引擎：Claude');
  assert.equal(proposal.operatorText, 'operator:judge:claude');
  assert.equal(proposal.flowText, '流程：flow-a');
  assert.deepEqual(proposal.lines, ['判断理由：提案范围清晰']);
  assert.deepEqual(proposal.details.selected, ['accept']);
  assert.deepEqual(proposal.details.evidence, ['docs/proposals/flow-a-v1.md']);
  assert.equal(proposal.toolCallId, 'call-1');

  const appointment = labels.governanceJudgeResultView({
    group: 'decision', cardKind: 'appointment', flowId: 'flow-b', engine: 'pi',
    selected: ['designer', 'tester'], reason: '与推荐集一致',
  });
  assert.equal(appointment.headline, '任命 designer、tester · 流程 flow-b');
  assert.deepEqual(appointment.lines, ['判断理由：与推荐集一致'], '任命选中项在结论行，不重复');

  const acceptance = labels.governanceJudgeResultView({
    group: 'decision', cardKind: 'acceptance', flowId: 'flow-c', engine: 'codex', selected: ['accept'],
  });
  assert.equal(acceptance.headline, '验收通过（accept） · 流程 flow-c');

  // write 族（approval）：确认写入 N 个路径；超过 3 个显示前 3 个 +「等 N 个」。
  const write = labels.governanceJudgeResultView({
    group: 'approval', cardKind: 'write', flowId: 'flow-d', engine: 'claude',
    paths: ['a.md', 'b.md', 'c.md', 'd.md'], confirmed: true,
    pathDecisions: [{ path: 'a.md', ok: true }, { path: 'b.md', ok: false, reason: '越界' }],
    reason: '路径均在边界内', durationMs: 1200, readCalls: 2, readBytes: 4096,
  });
  assert.equal(write.title, 'judge 代批 · 代审批');
  assert.equal(write.headline, '确认写入 4 个路径（a.md、b.md、c.md 等 4 个） · 流程 flow-d');
  assert.equal(write.details.pathDecisions.length, 2);
  assert.equal(write.details.pathDecisions[1].ok, false);
  assert.equal(write.details.pathDecisions[1].reason, '越界');
  assert.equal(write.details.durationMs, 1200);
  assert.equal(write.details.readCalls, 2);
  assert.equal(write.details.readBytes, 4096);

  // 坏件/未知分组：不产生结果行（不编结论）。
  assert.equal(labels.governanceJudgeResultView({ group: 'other', cardKind: 'proposal' }), null);
  assert.equal(labels.governanceJudgeResultView({ cardKind: 'proposal' }), null);
  assert.equal(labels.governanceJudgeResultView(null), null);
  assert.equal(labels.governanceJudgeResultView('decision' as unknown as object), null);
});

test('P5：治理手动回落 notice——一般 manual 与 row-failed 分开（代审批/代决策）', () => {
  assert.equal(
    labels.governanceJudgeNoticeText('decision', 'path-unverified'),
    '判断 agent 未代批（代决策）：写入路径未经逐路径核对；已转你手动确认。'
  );
  assert.equal(
    labels.governanceJudgeNoticeText('approval', 'artifact-not-read'),
    '判断 agent 未代批（代审批）：判断 agent 未读取必需文件；已转你手动确认。'
  );
  assert.equal(
    labels.governanceJudgeNoticeText('decision', 'row-failed'),
    '判断 agent 已完成判断，但结果无法在聊天中显示（代决策）；已转你手动确认。'
  );
  assert.equal(
    labels.governanceJudgeNoticeText('approval', 'row-failed').includes('未能完成判断'),
    false,
    '判断已完成 ⇒ 不使用「未能完成判断」措辞'
  );
  assert.ok(labels.governanceJudgeNoticeText('decision', undefined).includes('判断未完成'), '未知 reasonCode 如实说明');
});

test('D1：governanceReacceptFailureView——phase≠write 可声明零写入；phase=write 只逐字 message', () => {
  // precheck / 预览失效：message 逐字 + 追加零副作用 + status 提示。
  const stale = labels.governanceReacceptFailureView('precheck', 'preview-stale', '预览后边界文件又有变化。');
  assert.deepEqual(stale.lines, [
    '预览后边界文件又有变化。',
    '本次未写入任何文件。',
    '预览后边界文件又有变化，已取消本次写入；请重新检查。',
  ]);
  assert.equal(stale.noRetry, false, 'precheck 失败可重试');
  // message 已含「未写入任何文件」⇒ 不重复追加。
  const already = labels.governanceReacceptFailureView('guard', 'no-record', '没有治理记录；本次未写入任何文件。');
  assert.equal(already.lines.filter((x: string) => x === '本次未写入任何文件。').length, 0, '不重复追加零副作用');
  assert.ok(already.lines.includes('没有治理记录；请先建立治理记录。'));
  // 各 status 的追加提示（目录候选）。
  assert.ok(labels.governanceReacceptFailureView('guard', 'invalid-record', '坏记录').lines.includes('治理记录不可用；本版不提供修复。'));
  assert.ok(labels.governanceReacceptFailureView('guard', 'not-needed', '一致').lines.includes('边界与记录一致，无需重新接受。'));
  for (const status of ['missing-file', 'unreadable-file', 'unparseable-boundary']) {
    assert.ok(labels.governanceReacceptFailureView('precheck', status, '受阻').lines.includes('请先处理上述文件后重试。'), status);
  }
  assert.ok(
    labels.governanceReacceptFailureView('guard', 'busy', '忙').lines.includes('上一次操作仍在进行中；本次未写入任何文件。'),
    'busy 文案逐字'
  );
  // phase=write：**只**逐字 message（绝不追加零写入、绝不出现已恢复/已成功）。
  const writeFail = labels.governanceReacceptFailureView('write', 'write-failed', '写入中断：磁盘错误；可能已写入部分文件，请核对现场。');
  assert.deepEqual(writeFail.lines, ['写入中断：磁盘错误；可能已写入部分文件，请核对现场。']);
  assert.equal(writeFail.noRetry, true, '写入阶段失败不提供重试（可能已部分落盘）');
  const joined = writeFail.lines.join('\n');
  assert.ok(!joined.includes('未写入任何文件'), 'phase=write 绝不追加零副作用');
  assert.ok(!joined.includes('已恢复') && !joined.includes('已成功'), 'phase=write 绝不宣称已恢复/已成功');
});

// —————— W4 治理三权（2026-10-17 评审 §8）：左树/空态/状态行/决定卡文案单一来源 ——————
// 全部按接口事实（governanceFunction / cardKind / governanceModel / flowId）纯转写；未知值不显示、不猜。

test('W4/W6-C：治理角色文案——四角色中文名+英文名/权力副标题/内置标识（按 governanceFunction 派生，未知不猜）', () => {
  const l = labels.governanceRoleView('liaison');
  assert.equal(l.name, '联络官 Liaison', '四角色主入口＝联络官 Liaison');
  assert.equal(l.power, '客户沟通 · 不拥有最终批准权', 'Liaison 权力副标题逐字');
  assert.equal(l.primaryEntrance, true, 'Liaison 标记为客户默认入口');
  const p = labels.governanceRoleView('proposal');
  assert.equal(p.name, '报告员 Rapporteur', '提案职能＝报告员 Rapporteur');
  assert.equal(p.power, '提案权 · 不拥有最终批准权');
  assert.equal(p.primaryEntrance, false);
  const n = labels.governanceRoleView('nomination');
  assert.equal(n.name, '提名官 Nominator');
  assert.equal(n.power, '提名权 · 不拥有最终批准权');
  const s = labels.governanceRoleView('schedule');
  assert.equal(s.name, '召集人 Convener');
  assert.equal(s.power, '编排权 · 不拥有最终批准权');
  for (const v of [l, p, n, s]) assert.equal(v.builtinNote, '内置角色：随应用发布，无角色目录', '内置标识逐字');
  assert.equal(labels.GOVERNANCE_ROLE_BUILTIN_NOTE, '内置角色：随应用发布，无角色目录');
  assert.equal(labels.GOVERNANCE_GROUP_LABEL, '治理职能（内置）');
  for (const bad of ['su', 'Rapporteur', '', null, undefined, 1]) {
    assert.equal(labels.governanceRoleView(bad), null, '未知/缺失 function 不当治理角色（不按 id 猜）：' + String(bad));
  }
});

test('W4/W6-C：治理角色空态——四角色说明逐字（Liaison 客户入口/提案交接；提名编排既有）', () => {
  const l = labels.governanceRoleEmptyState('liaison');
  assert.equal(l.title, '联络官 Liaison');
  assert.equal(l.sub, '客户默认入口：你说要做什么，我先确认目标、范围与验收，再交给报告员形成提案。我不写提案、不批准。本版起默认入口为联络官；报告员与历史提案不变。');
  const p = labels.governanceRoleEmptyState('proposal');
  assert.equal(p.title, '报告员 Rapporteur');
  assert.equal(p.sub, '通常由联络官交接打开；客户也可以直接找我。我只写提案，不批准。');
  const n = labels.governanceRoleEmptyState('nomination');
  assert.equal(n.title, '提名官 Nominator');
  assert.equal(n.sub, '通常由流程单提名步骤打开；仅在客户明确要求时直接使用');
  const s = labels.governanceRoleEmptyState('schedule');
  assert.equal(s.title, '召集人 Convener');
  assert.equal(s.sub, '通常由已接受提案开启流程；只负责排步骤与派发，不批准方案');
  assert.equal(labels.governanceRoleEmptyState('su'), null, '未知职能不编空态');
});

test('W4/W6-C：状态行——三权显示四角色；当前流程/四态逐字；未知不猜', () => {
  assert.equal(labels.governanceStatusText('trio', '', ''), '治理模型：三权 · 四角色');
  assert.equal(labels.governanceStatusText('single', '', ''), '治理模型：旧模型（su）');
  assert.equal(labels.governanceStatusText('trio', 'flow-1', 'awaiting-customer'), '治理模型：三权 · 四角色 · 当前流程：flow-1 · 等待客户决定');
  assert.equal(labels.governanceStatusText('trio', '', 'in-progress'), '治理模型：三权 · 四角色 · 进行中');
  assert.equal(labels.governanceStatusText('trio', '', 'blocked'), '治理模型：三权 · 四角色 · 阻塞');
  assert.equal(labels.governanceStatusText('trio', '', 'escalated-to-customer'), '治理模型：三权 · 四角色 · 已升级客户');
  assert.equal(labels.governanceStatusText('trio', '', 'paused'), '治理模型：三权 · 四角色', '未知/不承诺状态不显示（不猜）');
  assert.equal(labels.governanceStatusText('', 'flow-1', ''), '当前流程：flow-1', '模型未知仍可如实显示接口给的流程 id');
  assert.equal(labels.governanceStatusText(undefined, '', 'blocked'), '阻塞');
  assert.equal(labels.governanceFlowStatusText('awaiting-customer'), '等待客户决定');
  assert.equal(labels.governanceFlowStatusText('nope'), '', '未知状态空串');
});

test('W6-C：镜像卡来源标签与主入口排队聚合文案逐字（同一请求的第二呈现，不是第二张审批）', () => {
  assert.equal(labels.governanceMirrorSourceLabel('报告员 Rapporteur'), '来自 报告员 Rapporteur 的治理决定 · 客户最终批准');
  assert.equal(labels.governanceMirrorSourceLabel(''), '来自 发起角色 的治理决定 · 客户最终批准', '缺名不编角色，如实用兜底');
  assert.equal(labels.governanceQueueAggregateText(1), '还有 1 个决定等待前一个决定');
  assert.equal(labels.governanceQueueAggregateText(3), '还有 3 个决定等待前一个决定');
  assert.equal(labels.governanceQueueAggregateText(0), '', '无排队不显示');
  assert.equal(labels.governanceQueueAggregateText(-1), '', '坏值不显示');
  assert.equal(labels.governanceQueueAggregateText('2'), '', '只认数量，不猜');
  assert.equal(labels.GOVERNANCE_MIRROR_BADGE, '镜像 · 主入口');
});

test('W4/V1b：旧模型迁移按钮——未接线「升级入口待本版后续」禁用；桥齐备「查看差异 / 升级」启用；提示条文案逐字', () => {
  assert.equal(labels.GOVERNANCE_MIGRATION_TEXT, '本项目使用旧治理模型（su）。可升级为三权模型。');
  const pending = labels.governanceMigrationButtonView(false);
  assert.equal(pending.label, '升级入口待本版后续');
  assert.equal(pending.disabled, true, '未接线不假装迁移可用');
  assert.ok(pending.title.includes('尚未接线'));
  const wired = labels.governanceMigrationButtonView(true);
  assert.equal(wired.label, '查看差异 / 升级');
  assert.equal(wired.disabled, false, 'V1b：两个桥方法齐备 ⇒ 按钮可用（只打开零写入预览）');
  assert.ok(wired.title.includes('零写入'));
});

test('W4/V1b：迁移预览视图——旧模型→三权、写路径、modelField/manifestLine、pin 空、保留文件、摘要前 8 位', () => {
  const view = labels.governanceMigrationPreviewView({
    model: 'single', targetModel: 'trio',
    writePaths: ['.ans/project.json', 'docs/bootstrap-manifest.md'],
    modelField: null,
    manifestLine: '治理模型升级（su → trio）',
    pinChanges: [],
    retainedFiles: ['角色卡/实现者/role-card.md', 'docs/su/旧方案.md'],
    snapshotDigest: 'a'.repeat(64),
  });
  assert.equal(view.title, '升级为三权治理模型（预览）');
  assert.equal(view.modelLine, '模型：旧模型（su） → 三权');
  assert.deepEqual(view.writeLines, ['将写入：.ans/project.json', '将写入：docs/bootstrap-manifest.md']);
  assert.equal(view.modelFieldLine, '将写入 .ans 字段：（字段缺失，将新增 governanceModel: "trio"）');
  assert.equal(view.manifestLine, '将追加 manifest 记录：治理模型升级（su → trio）');
  assert.deepEqual(view.pinLines, ['pin 变更：无（不重算 pin）']);
  assert.deepEqual(view.retainedLines, ['保留文件：角色卡/实现者/role-card.md、docs/su/旧方案.md']);
  assert.equal(view.digestLine, '预览摘要（前 8 位）：aaaaaaaa');
  assert.equal(view.canConfirm, true);
  assert.equal(view.digest, 'a'.repeat(64), '摘要原样（确认时回传，不截断）');
  // 非空 pinChanges 也如实呈现（V1b 应为空；防御式）。
  const changed = labels.governanceMigrationPreviewView({ modelField: 'single', pinChanges: [{ path: '角色卡/a/boundary.yaml', oldSha256: 'b'.repeat(64), newSha256: 'c'.repeat(64) }] });
  assert.deepEqual(changed.pinLines, ['pin 变更：角色卡/a/boundary.yaml（bbbbbbbb… → cccccccc…）']);
  // 摘要缺失 ⇒ fail-closed（canConfirm=false），不编摘要。
  assert.equal(labels.governanceMigrationPreviewView({}).canConfirm, false);
  assert.equal(labels.governanceMigrationPreviewView({}).digestLine, '预览摘要（前 8 位）：（未报告）');
  assert.deepEqual(labels.governanceMigrationPreviewView({}).writeLines, ['将写入：（未报告）']);
});

test('W4/V1b：迁移成功文案逐字；失败按 status/phase 如实、绝不假成功', () => {
  assert.equal(labels.governanceMigrationSuccessText(), '已升级为三权治理模型（.ans governanceModel = "trio"）。旧角色卡/边界/pin/历史会话保留。');
  const stale = labels.governanceMigrationFailureView('guard', 'preview-stale', '预览已失效。');
  assert.deepEqual(stale.lines, ['预览已失效。', '预览后 .ans 又有变化，已取消本次写入；请重新检查。']);
  assert.equal(stale.noRetry, false, 'preview-stale 可重新检查');
  for (const [status, copy] of [
    ['already-trio', '已是三权治理模型，无需升级；本次未写入任何文件。'],
    ['no-record', '没有治理记录（.ans/project.json）；本次未写入任何文件。'],
    ['blocked', '升级被阻止；本次未写入任何文件。'],
    ['busy', '上一次升级仍在进行中；本次未写入任何文件。'],
    ['invalid-request', '升级请求无效；本次未写入任何文件。'],
  ] as const) {
    const v = labels.governanceMigrationFailureView('guard', status, '');
    assert.deepEqual(v.lines, [copy], status + ' 文案逐字');
    assert.equal(v.lines.join('').includes('已升级'), false, status + ' 不得出现假成功');
  }
  assert.equal(labels.governanceMigrationFailureView('guard', 'already-trio', '').noRetry, true);
  assert.equal(labels.governanceMigrationFailureView('guard', 'no-record', '').noRetry, true);
  const writeFail = labels.governanceMigrationFailureView('write', 'write-failed', '写入中断：磁盘错误。');
  assert.deepEqual(writeFail.lines, ['写入中断：磁盘错误。', '写入阶段失败，可能已写入部分文件，请核对现场。']);
  assert.equal(writeFail.lines.join('').includes('未写入任何文件'), false, 'phase=write 绝不宣称零写入');
  assert.equal(writeFail.lines.join('').includes('已升级'), false, 'phase=write 绝不宣称已升级');
  assert.equal(writeFail.noRetry, true, '写入阶段失败不提供重试');
});

test('W4：决定卡元信息——cardKind→权力类型、flowId/stepId/路径/摘要/哈希；普通 write 与缺失不冒充治理决定', () => {
  const proposal = labels.governanceCardMetaView({ cardKind: 'proposal', flowId: 'flow-1' });
  assert.equal(proposal.governance, true);
  assert.equal(proposal.badge, '治理决定 · 客户最终批准');
  assert.equal(proposal.power, '提案');
  assert.deepEqual(proposal.lines, ['流程：flow-1', '权力类型：提案']);
  assert.equal(labels.governanceCardMetaView({ cardKind: 'appointment' }).power, '提名');
  assert.equal(labels.governanceCardMetaView({ cardKind: 'appointment-write' }).power, '提名');
  assert.equal(labels.governanceCardMetaView({ cardKind: 'schedule-write' }).power, '编排');
  assert.equal(labels.governanceCardMetaView({ cardKind: 'acceptance' }).power, '验收');
  const full = labels.governanceCardMetaView({
    cardKind: 'appointment-write', flowId: 'f1', stepId: 's1',
    paths: ['角色卡/实现者/role-card.md', '角色卡/实现者/boundary.yaml'], summary: '任命 1 个角色', artifactSha256: 'a'.repeat(64),
  });
  assert.deepEqual(full.lines, [
    '流程：f1', '步骤：s1', '权力类型：提名',
    '将写路径：角色卡/实现者/role-card.md', '将写路径：角色卡/实现者/boundary.yaml',
    '摘要：任命 1 个角色', '哈希：' + 'a'.repeat(64),
  ]);
  // 普通 write 不是治理决定（无徽标/权力行）；缺字段不编。
  const plain = labels.governanceCardMetaView({ cardKind: 'write', flowId: 'f1' });
  assert.equal(plain.governance, false);
  assert.equal(plain.badge, '');
  assert.deepEqual(plain.lines, ['流程：f1']);
  const empty = labels.governanceCardMetaView({});
  assert.equal(empty.governance, false);
  assert.deepEqual(empty.lines, []);
  assert.deepEqual(labels.governanceCardMetaView(null).lines, [], '坏件不崩、不编');
  assert.equal(labels.GOVERNANCE_QUEUE_NOTE, '等待前一个决定');
  assert.equal(labels.GOVERNANCE_DECISION_BADGE, '治理决定 · 客户最终批准');
});
