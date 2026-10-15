import test from 'node:test';
import assert from 'node:assert/strict';
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
