import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const ROOT = "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment";
const { appendWorkflowEvent, readWorkflowLedger, requestStage } = await import(`file:///${ROOT}/src/common/编排/workflow-service.ts`);
const { deriveWorkflowView } = await import(`file:///${ROOT}/src/common/编排/workflow-state.ts`);
const { appendTaskEvent, readTaskState, taskEvent } = await import(`file:///${ROOT}/src/common/编排/task-state.ts`);

const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-probe-a12a-"));
const FLOW = "snake";
const WF = "wf-probe00000000000000000001";
const AT = "2026-11-10T10:00:00.000Z";
const base = { v: 1, at: AT, schema: "ans-workflow/v1", workflowId: WF, flowId: FLOW, path: "A" };
const started = { ...base, kind: "workflow.started", idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src" };
const evs = [started];
for (const stage of ["A1","A2","A3","A4","A5","A6","A7","A8","A9","A10"]) {
  evs.push({ ...base, kind: "stage.requested", idempotencyKey: `stage-request:${WF}:${stage}:1`, stage, requestTaskId: `t-req-${stage}`, requestDigest: "a".repeat(64), attempt: 1 });
  evs.push({ ...base, kind: "stage.completed", idempotencyKey: `stage-complete:${WF}:${stage}:seed`, stage, cause: { kind: "seed", ref: `seed-${stage}` }, artifacts: [] });
}
for (const e of evs) { const r = await appendWorkflowEvent(root, e); if (!r.ok) throw new Error(r.message); }
const t = taskEvent("task.created", { taskId: "t-a12a-probe", from: "chief", to: "verifier", text: "写 criteria", sideEffect: "read-only", idempotencyKey: "probe-a12a", flowId: FLOW, workflowId: WF, stage: "A12a" }, () => new Date(AT));
const app = await appendTaskEvent(root, t);
console.log("appendTaskEvent:", app.ok, app.ok === false ? app.message : "");
const state = await readTaskState(root);
const ledger = await readWorkflowLedger(root);
const view = deriveWorkflowView(ledger.events.filter((e) => e.workflowId === WF), state.events);
console.log("stage:", view.stage, "A12a status:", view.stages.A12a.status);
const req = await requestStage({ projectRoot: root, flowId: FLOW, workflowId: WF, stage: "A11", requestDigest: "b".repeat(64), sourceTaskId: "t-src", text: "推进 A11", now: () => new Date(AT) });
console.log("requestStage A11:", req.ok, req.ok === false ? `${req.code}: ${req.message}` : "");
await fs.rm(root, { recursive: true, force: true });
