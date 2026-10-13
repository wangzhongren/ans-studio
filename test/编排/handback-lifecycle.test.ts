import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { SessionEvent, ReportHandbackFn, RuntimeAdapter } from "../../src/provider/pi/session.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { buildTaskHandback, handbackKey, renderHandbackBatchPrompt, withHandback, type TaskHandback, type TaskReport } from "../../src/common/编排/handback.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";

const ev = (kind: SessionEvent["kind"], turnId: string, detail: Record<string, unknown> = {}): SessionEvent =>
  ({ kind, summary: kind === "settled" ? "会话结束" : "工具事件", detail: { turnId, ...detail } });
async function collect(source: AsyncIterable<SessionEvent>, reports = new Map<string, TaskReport>()) {
  const hbs: TaskHandback[] = [];
  for await (const item of withHandback(source, { roleId: "X" }, { report: (id) => id ? reports.get(id) : undefined })) {
    if (item.kind === "handback") hbs.push(item.handback);
  }
  return hbs;
}
async function* stream(events: SessionEvent[]) { yield* events; }
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-report-lifecycle-"));
  const roleDir = path.join(root, "角色卡", "X");
  fs.mkdirSync(roleDir, { recursive: true });
  fs.writeFileSync(path.join(roleDir, "role-card.md"), "# X\n");
  fs.writeFileSync(path.join(roleDir, "boundary.yaml"), "role: X\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: fixture\n");
  const project: ProjectConfig = {
    projectRoot: root, skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test" } },
  };
  return { root, project, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("真实轮次事件交错仍分离文件证据；重复终局夹迟到事件也只回交一次", async () => {
  const hbs = await collect(stream([
    ev("accepted", "a", { toolName: "write_file", path: "src/a.ts", ok: true }),
    ev("accepted", "b", { toolName: "write_file", path: "src/b.ts", ok: true }),
    ev("accepted", "a", { toolName: "write_file", path: "src/a.ts", ok: true }),
    ev("settled", "a", { outcome: "completed" }),
    ev("accepted", "a", { toolName: "write_file", path: "src/late.ts", ok: true }),
    ev("settled", "a", { outcome: "completed" }),
    ev("settled", "b", { outcome: "completed" }),
  ]));
  assert.equal(hbs.length, 2);
  assert.deepEqual(hbs.map((hb) => [hb.turnId, hb.status, hb.evidence]), [
    ["a", "unreported", ["已写入：src/a.ts"]], ["b", "unreported", ["已写入：src/b.ts"]],
  ]);
  assert.ok(hbs.every((hb) => hb.summary.includes("未提交正式任务报告")));
});

for (const outcome of ["failed", "aborted", "timed_out"] as const) {
  test(`${outcome} 压过同轮较早 completed 报告，并保留中断前证据`, async () => {
    const report: TaskReport = { status: "completed", summary: "此前的完成声明", evidence: ["docs/result.md"] };
    const hbs = await collect(stream([ev("settled", "a", { outcome, errorCode: "runtime-error" })]), new Map([["a", report]]));
    assert.equal(hbs[0].status, outcome === "aborted" ? "aborted" : "failed");
    assert.deepEqual(hbs[0].evidence, report.evidence);
    assert.match(hbs[0].summary, /中断前报告：此前的完成声明/);
    if (outcome === "timed_out") assert.match(hbs[0].summary, /超时/);
  });
}

test("正常同轮正式报告原样优先，不混入工具事实；工具失败不形成fallback产物", async () => {
  const report: TaskReport = { status: "blocked", summary: "等已声明依赖", evidence: ["docs/dependency.md"] };
  const hbs = await collect(stream([
    ev("accepted", "a", { toolName: "write_file", path: "src/noise.ts", ok: true }),
    ev("settled", "a", { outcome: "completed" }),
    ev("accepted", "b", { toolName: "write_file", path: "src/failed.ts", ok: false }),
    ev("settled", "b", { outcome: "completed" }),
  ]), new Map([["a", report]]));
  assert.equal(hbs[0].summary, report.summary);
  assert.equal(hbs[0].status, "blocked");
  assert.deepEqual(hbs[0].evidence, report.evidence);
  assert.equal(hbs[1].status, "unreported");
  assert.deepEqual(hbs[1].evidence, []);
});

test("无metadata旧替身每轮证据也清空；泛化写入完成不能充当成果", async () => {
  const hbs = await collect(stream([
    { kind: "accepted", summary: "write_file 执行完成", detail: { call: { name: "write_file", args: { path: "src/first.ts" } } } },
    { kind: "settled", summary: "会话结束" },
    { kind: "message", summary: "第二轮" },
    { kind: "settled", summary: "会话结束" },
  ]));
  assert.deepEqual(hbs[0].evidence, ["已写入：src/first.ts"]);
  assert.deepEqual(hbs[1].evidence, []);
  const noPaths = buildTaskHandback(Array.from({ length: 8 }, () => ({ kind: "accepted", summary: "write_file 执行完成" })), { roleId: "X" });
  assert.equal(noPaths.status, "unreported");
  assert.deepEqual(noPaths.evidence, []);
  assert.match(noPaths.summary, /没有可定位的产物证据/);
});

test("events延迟至两次send结束后消费，报告仍按metadata关联且非法/迟到报告不覆盖", async () => {
  const f = fixture();
  let report: ReportHandbackFn | undefined;
  let sends = 0;
  const pending: SessionEvent[] = [];
  const adapter: RuntimeAdapter = {
    async composeContext() { return { systemPrompt: "" }; },
    async bindRole() {
      return {
        async prompt() {
          const id = String(++sends);
          if (id !== "3") await report!({ status: "completed", summary: `实际结果${id}`, evidence: [`src/${id}.ts`] }, { turnId: id });
          if (id === "1") await report!({ status: "invalid", summary: "错误报告" } as unknown as TaskReport, { turnId: id });
          pending.push(ev("settled", id, { outcome: "completed" }));
        },
        async *events() {
          while (pending.length > 0) {
            const item = pending.shift()!;
            yield item;
            if ((item.detail as { turnId: string }).turnId === "1") {
              await report!({ status: "completed", summary: "迟到旧报告" }, { turnId: "1" });
            }
          }
        },
        async dispose() {},
      };
    },
  };
  try {
    const handle = await openRoleSession({ roleId: "X", project: f.project }, { createAdapter: (_gate, caps) => { report = caps?.reportHandback; return adapter; } });
    await handle.send("first");
    await handle.send("second");
    await handle.send("third without report");
    const hbs: TaskHandback[] = [];
    for await (const item of handle.events()) if (item.kind === "handback") hbs.push(item.handback);
    assert.deepEqual(hbs.map((hb) => hb.turnId), ["1", "2", "3"]);
    assert.deepEqual(hbs.slice(0, 2).map((hb) => [hb.status, hb.summary, hb.evidence]), [
      ["completed", "实际结果1", ["src/1.ts"]], ["completed", "实际结果2", ["src/2.ts"]],
    ]);
    assert.equal(hbs[2].status, "unreported");
    assert.deepEqual(hbs[2].evidence, []);
    await handle.dispose();
  } finally { f.cleanup(); }
});

test("批次提示保留每份来源与完整证据，未知任务不冒充收齐；稳定key使用真实turnId", () => {
  const a: TaskHandback = { roleId: "dev", taskId: "task-a", status: "completed", summary: "实现运算", evidence: ["src/calc.ts", "测试4/4"], at: "t", turnId: "session1-turn1" };
  const b: TaskHandback = { roleId: "test", status: "failed", summary: "集成失败", evidence: ["test/integration.test.ts"], at: "t", turnId: "session2-turn1" };
  const text = renderHandbackBatchPrompt([a, b]);
  assert.match(text.split("\n")[0], /^\[回交\] /, "桌面按既有注入前缀识别并默认折叠");
  assert.match(renderHandbackBatchPrompt([a]).split("\n")[0], /^\[回交\] 来自 dev 的报告/);
  for (const hb of [a, b]) {
    assert.ok(text.includes(`来自 ${hb.roleId}`));
    assert.ok(text.includes(hb.summary));
    for (const evidence of hb.evidence) assert.ok(text.includes(evidence));
  }
  assert.ok(text.includes("任务关联未知"));
  assert.ok(text.includes("不宣称全部角色或整个任务已完成"));
  assert.notEqual(handbackKey(a), handbackKey({ ...a, turnId: "another-session-turn1" }));
  assert.equal(handbackKey(a), handbackKey({ ...a, round: 999, at: "later" }));
});

test("回交诊断记录真实来源/状态，不记录任务正文与证据内容", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-handback-log-"));
  try {
    configureDiagnostics({ directory: root });
    await collect(stream([ev("settled", "logged", { outcome: "completed" })]));
    await flushDiagnostics();
    const text = fs.readdirSync(root).map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("");
    assert.match(text, /handback.generated/);
    assert.match(text, /"turnId":"logged"/);
    assert.match(text, /"state":"unreported"/);
    assert.match(text, /"reportSource":"unreported"/);
    assert.ok(!text.includes("会话结束"));
  } finally { await disposeDiagnostics(); fs.rmSync(root, { recursive: true, force: true }); }
});
