import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { PromptOptions, RuntimeAdapter, SessionEvent } from "../../src/model/runtime.ts";
import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { withHandback, type OrchestrationEvent, type TaskReport } from "../../src/common/编排/handback.ts";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-chat-intent-"));
  const role = path.join(root, "角色卡/X");
  fs.mkdirSync(role, { recursive: true });
  fs.writeFileSync(path.join(role, "role-card.md"), "# X\n");
  fs.writeFileSync(path.join(role, "boundary.yaml"), "role: X\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: fixture\n");
  const project: ProjectConfig = { projectRoot: root, skillRoot: root, roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } } };
  return { project, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
function probe({ ack = true, legacy = false } = {}) {
  let caps: AdapterCapabilities | undefined;
  let count = 0;
  const pending: SessionEvent[] = [];
  const options: (PromptOptions | undefined)[] = [];
  const adapter: RuntimeAdapter = {
    async composeContext() { return { systemPrompt: "" }; },
    async bindRole() {
      return {
        ...(!legacy ? { runtime: "pi" as const } : {}),
        async prompt(text, opts) {
          options.push(opts);
          if (text === "before-error") throw new Error("before opening");
          const turnId = String(++count);
          if (ack && !legacy) opts?.onTurnStarted?.({ turnId, roleId: "X", runtime: "pi" });
          let metadata: { turnId: string } | undefined;
          if (!legacy) metadata = { turnId };
          if (text === "report" || text === "reported-failed") await caps?.reportHandback?.({ status: "completed", summary: `report-${turnId}`, evidence: ["src/x.ts"] }, metadata);
          if (text === "invalid") await caps?.reportHandback?.({ status: "bad", summary: "" } as unknown as TaskReport, metadata);
          const detail: Record<string, unknown> = { outcome: "completed" };
          if (text === "failed" || text === "reported-failed") detail.outcome = "failed";
          if (text === "timed_out" || text === "aborted") detail.outcome = text;
          const settled: SessionEvent = { kind: "settled", summary: "done", detail };
          if (!legacy) settled.turnId = turnId;
          pending.push({ kind: "message", summary: text, ...(legacy ? {} : { turnId }) }, settled, settled);
        },
        async *events() { while (pending.length) yield pending.shift()!; },
        async dispose() {},
      };
    },
  };
  return { options, pending, report: () => caps?.reportHandback, createAdapter: (_gate: unknown, injected?: AdapterCapabilities) => { caps = injected; return adapter; } };
}
async function collect(events: AsyncIterable<OrchestrationEvent>) {
  const result: OrchestrationEvent[] = [];
  for await (const event of events) result.push(event);
  return { result, reports: result.filter(event => event.kind === "handback") };
}

test("real ACK binds task → Q1/Q2 chat → next task even with delayed consumption; chat report drops old taskId", async () => {
  const fixtureData = fixture(), runtime = probe();
  const handle = await openRoleSession({ roleId: "X", project: fixtureData.project, taskId: "OLD" }, { createAdapter: runtime.createAdapter });
  try {
    await handle.send("report", { handback: { required: true, taskId: "A" } });
    await handle.send("Q1", { handback: { required: false } });
    await handle.send("Q2", { handback: { required: false } });
    await handle.send("next", { handback: { required: true, taskId: "B" } });
    await handle.send("report", { handback: { required: false, taskId: "ignored" } });
    const { result, reports } = await collect(handle.events());
    assert.deepEqual(reports.map(event => [event.handback.turnId, event.handback.taskId, event.handback.status]), [["1", "A", "completed"], ["4", "B", "unreported"], ["5", undefined, "completed"]]);
    assert.equal(result.filter(event => event.kind === "settled").length, 10);
    for (const event of reports) assert.equal(result[result.indexOf(event) + 1].kind, "settled");
    // The skipped chat is also closed: late report cannot create a new result for turn 2.
    await runtime.report()?.({ status: "completed", summary: "late" }, { turnId: "2" });
    runtime.pending.push({ kind: "settled", turnId: "2", summary: "late", detail: { outcome: "completed" } });
    assert.equal((await collect(handle.events())).reports.length, 0);
  } finally { await handle.dispose(); fixtureData.cleanup(); }
});

for (const outcome of ["failed", "timed_out", "aborted"] as const) test(`task ${outcome} keeps handback; chat ${outcome} without report does not invent task`, async () => {
  const fixtureData = fixture(), runtime = probe();
  const handle = await openRoleSession({ roleId: "X", project: fixtureData.project }, { createAdapter: runtime.createAdapter });
  try {
    await handle.send(outcome, { handback: { required: true } });
    await handle.send(outcome, { handback: { required: false } });
    const { reports, result } = await collect(handle.events());
    assert.equal(reports.length, 1);
    assert.equal(reports[0].handback.status, outcome === "aborted" ? "aborted" : "failed");
    assert.equal(result.filter(event => event.kind === "settled").length, 4);
  } finally { await handle.dispose(); fixtureData.cleanup(); }
});

test("taskId compatibility, ordinary default chat, invalid chat report and explicit chat failed report", async () => {
  const fixtureData = fixture(), runtime = probe();
  const handle = await openRoleSession({ roleId: "X", project: fixtureData.project, taskId: "COMPAT" }, { createAdapter: runtime.createAdapter });
  try {
    await handle.send("missing-report");
    await handle.send("invalid", { handback: { required: false } });
    await handle.send("reported-failed", { handback: { required: false } });
    const { reports } = await collect(handle.events());
    assert.deepEqual(reports.map(event => [event.handback.taskId, event.handback.status]), [["COMPAT", "unreported"], [undefined, "failed"]]);
    assert.match(reports[1].handback.summary, /中断前报告：report-3/);
  } finally { await handle.dispose(); fixtureData.cleanup(); }
  const plainFixture = fixture(), plainRuntime = probe();
  const plain = await openRoleSession({ roleId: "X", project: plainFixture.project }, { createAdapter: plainRuntime.createAdapter });
  try { await plain.send("Q1"); assert.equal((await collect(plain.events())).reports.length, 0); }
  finally { await plain.dispose(); plainFixture.cleanup(); }
});

test("unknown real turn without ACK cannot borrow task intent; report is still explicit", async () => {
  const fixtureData = fixture(), runtime = probe({ ack: false });
  const handle = await openRoleSession({ roleId: "X", project: fixtureData.project, taskId: "OLD" }, { createAdapter: runtime.createAdapter });
  try {
    await handle.send("missing", { handback: { required: true, taskId: "A" } });
    await handle.send("report", { handback: { required: true, taskId: "B" } });
    const { reports } = await collect(handle.events());
    assert.equal(reports.length, 1);
    assert.equal(reports[0].handback.taskId, undefined);
    assert.equal(reports[0].handback.status, "completed");
  } finally { await handle.dispose(); fixtureData.cleanup(); }
});

test("pre-opening rejection clears legacy intent; serial legacy task/chat consumes once", async () => {
  const fixtureData = fixture(), runtime = probe({ legacy: true });
  const handle = await openRoleSession({ roleId: "X", project: fixtureData.project }, { createAdapter: runtime.createAdapter });
  try {
    await assert.rejects(handle.send("before-error", { handback: { required: true } }), /before opening/);
    runtime.pending.push({ kind: "settled", summary: "unknown" });
    assert.equal((await collect(handle.events())).reports.length, 0);
    await handle.send("task", { handback: { required: true } });
    assert.equal((await collect(handle.events())).reports.length, 1);
    await handle.send("chat", { handback: { required: false } });
    assert.equal((await collect(handle.events())).reports.length, 0);
    await handle.send("report", { handback: { required: false } });
    assert.equal((await collect(handle.events())).reports.length, 1);
  } finally { await handle.dispose(); fixtureData.cleanup(); }
});

test("chat writes and denials are passed through, not converted to fallback; next task keeps its own evidence", async () => {
  const events: SessionEvent[] = [
    { kind: "accepted", turnId: "chat", summary: "write", detail: { toolName: "write_file", path: "src/chat.ts", ok: true } },
    { kind: "denied", turnId: "chat", summary: "denied" },
    { kind: "settled", turnId: "chat", summary: "done" },
    { kind: "settled", turnId: "task", summary: "done" },
  ];
  const completed: string[] = [];
  const { result, reports } = await collect(withHandback((async function* () { yield* events; })(), { roleId: "X", taskId: "OLD" }, {
    intent: id => ({ required: id === "task" }), completed: id => { if (id) completed.push(id); },
  }));
  assert.deepEqual(completed, ["chat", "task"]);
  assert.equal(reports.length, 1); assert.deepEqual(reports[0].handback.evidence, []);
  assert.deepEqual(result.slice(0, 3), events.slice(0, 3));
});
