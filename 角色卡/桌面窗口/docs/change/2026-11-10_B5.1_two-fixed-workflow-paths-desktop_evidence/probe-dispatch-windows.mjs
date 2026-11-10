import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const ROOT = "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment";
const { appendWorkflowEvent, readWorkflowLedger, requestStage, recordStageDispatch } = await import(`file:///${ROOT}/src/common/编排/workflow-service.ts`);
const { deriveWorkflowView, canDispatchStage } = await import(`file:///${ROOT}/src/common/编排/workflow-state.ts`);
const { appendTaskEvent, readTaskState, taskEvent } = await import(`file:///${ROOT}/src/common/编排/task-state.ts`);
const FLOW="snake", WF="wf-probe000000000000000001", AT="2026-11-10T10:00:00.000Z";
const base = { v:1, at:AT, schema:"ans-workflow/v1", workflowId:WF, flowId:FLOW, path:"A" };
async function fresh(){ return fs.mkdtemp(path.join(os.tmpdir(),"ans-probe-win-")); }
async function append(root, e){ const r = await appendWorkflowEvent(root,e); if(!r.ok) throw new Error(r.message); }
function req(stage, attempt=1){ return {...base, kind:"stage.requested", idempotencyKey:`stage-request:${WF}:${stage}:${attempt}`, stage, requestTaskId:`t-req-${stage}`, requestDigest:"a".repeat(64), attempt}; }
function disp(stage, task="seed"){ return {...base, kind:"stage.dispatched", idempotencyKey:`stage-dispatch:${WF}:${stage}:${task}`, stage, taskId:`t-${task}`, targetRoleId:"convener"}; }
function comp(stage){ return {...base, kind:"stage.completed", idempotencyKey:`stage-complete:${WF}:${stage}:seed`, stage, cause:{kind:"seed",ref:"s"}, artifacts:[]}; }
async function started(root){ await append(root,{...base, kind:"workflow.started", idempotencyKey:`workflow-start:${FLOW}:A:t-src`, trigger:{by:"chief",reason:"seed"}, sourceTaskId:"t-src"}); }
async function addTask(root, stage, to, from="convener"){ const t = taskEvent("task.created", { taskId:`t-prod-${stage}`, from, to, text:`${stage} task`, sideEffect:"docs", idempotencyKey:`k-${stage}`, flowId:FLOW, workflowId:WF, stage }, ()=>new Date(AT)); const a = await appendTaskEvent(root,t); if(!a.ok) throw new Error(a.message); }

// A8 window: A7 dispatched ⇒ completed, then A8 task
{
  const root = await fresh();
  await started(root);
  for (const s of ["A1","A2","A3","A4","A5","A6","A7"]) {
    await append(root, req(s));
    if (s==="A1"||s==="A4"||s==="A7") await append(root, disp(s)); else await append(root, comp(s));
  }
  await addTask(root, "A8", "nominator");
  const state = await readTaskState(root); const ledger = await readWorkflowLedger(root);
  const view = deriveWorkflowView(ledger.events.filter(e=>e.workflowId===WF), state.events);
  console.log("[A8] view:", view.stage, view.stages.A8.status, "canDispatch:", canDispatchStage(view,"A8"));
  const rec = await recordStageDispatch({projectRoot:root, workflowId:WF, stage:"A8", taskId:"t-prod-A8", targetRoleId:"nominator"});
  console.log("[A8] record:", rec.ok, rec.ok?`replay=${rec.replay}`:`${rec.code}: ${rec.message}`);
  await fs.rm(root,{recursive:true,force:true});
}
// A12a window: A10 completed, then A12a task
{
  const root = await fresh();
  await started(root);
  for (const s of ["A1","A2","A3","A4","A5","A6","A7","A8","A9","A10"]) {
    await append(root, req(s));
    if (s==="A1"||s==="A4"||s==="A7") await append(root, disp(s)); else await append(root, comp(s));
  }
  await addTask(root, "A12a", "verifier", "chief");
  const state = await readTaskState(root); const ledger = await readWorkflowLedger(root);
  const view = deriveWorkflowView(ledger.events.filter(e=>e.workflowId===WF), state.events);
  console.log("[A12a] view:", view.stage, view.stages.A12a.status, "canDispatch:", canDispatchStage(view,"A12a"));
  const rec = await recordStageDispatch({projectRoot:root, workflowId:WF, stage:"A12a", taskId:"t-prod-A12a", targetRoleId:"verifier"});
  console.log("[A12a] record:", rec.ok, rec.ok?`replay=${rec.replay}`:`${rec.code}: ${rec.message}`);
  const sr = await requestStage({projectRoot:root, flowId:FLOW, workflowId:WF, stage:"A11", requestDigest:"b".repeat(64), sourceTaskId:"t-src", text:"推进 A11", now:()=>new Date(AT)});
  console.log("[A11 after A12a] requestStage:", sr.ok, sr.ok?"ok":`${sr.code}: ${sr.message}`);
  await fs.rm(root,{recursive:true,force:true});
}
// A12a window WITHOUT recording: A11 stage-request blocked (gap reproduction)
{
  const root = await fresh();
  await started(root);
  for (const s of ["A1","A2","A3","A4","A5","A6","A7","A8","A9","A10"]) {
    await append(root, req(s));
    if (s==="A1"||s==="A4"||s==="A7") await append(root, disp(s)); else await append(root, comp(s));
  }
  await addTask(root, "A12a", "verifier", "chief");
  const sr = await requestStage({projectRoot:root, flowId:FLOW, workflowId:WF, stage:"A11", requestDigest:"b".repeat(64), sourceTaskId:"t-src", text:"推进 A11", now:()=>new Date(AT)});
  console.log("[A11 without record] requestStage:", sr.ok, sr.ok?"ok":`${sr.code}: ${sr.message}`);
  await fs.rm(root,{recursive:true,force:true});
}
