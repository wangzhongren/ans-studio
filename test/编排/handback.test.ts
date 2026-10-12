// test/编排/handback.test.ts
// 编排角色自测：`TaskHandback`（角色完成回交 su，设计 §10.8 / C-1）。
// 覆盖：形状（buildTaskHandback）；`withHandback` 在 settled 时**先**发 handback 再透传 settled；
//       经 `openRoleSession` 端到端——普通角色 settle → 发出 handback；**内置治理角色（su）不自我回交**；
//       **C-1**：交报告 → 回交内容=报告值 / 未交→回退推导 / 报告形状非法→回退；证据只取**写类**事件
//       （读事件不进证据，反向断言）；`reportHandback` 只注入项目角色（su 不注入）。
// 全程桩/假适配器，不触网、不落盘（writeRoot 缺省）。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSession, RuntimeAdapter, SessionEvent, WriteGate } from "../../src/provider/pi/session.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import type { AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import {
  buildReportHandback,
  buildTaskHandback,
  formatDispatchReceipt,
  handbackKey,
  isDispatchableRoleId,
  normalizeTaskReport,
  renderDispatchPrompt,
  renderHandbackPrompt,
  withHandback,
  type OrchestrationEvent,
  type HandbackEvent,
  type TaskReport,
} from "../../src/common/编排/handback.ts";
import type { DispatchTaskFn } from "../../src/provider/pi/session.ts";

// —— 夹具：临时项目（角色 X + 边界条目 src/thing.ts）——
function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-handback-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/thing.ts\n    purpose: 测试条目\n",
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:fixture" } },
  };
}
const cleanup = (p: ProjectConfig): void => fs.rmSync(p.projectRoot, { recursive: true, force: true });

function isHandback(ev: OrchestrationEvent): ev is HandbackEvent {
  return ev.kind === "handback";
}

// —— 形状：buildTaskHandback ——

test("buildTaskHandback：形状正确（roleId/taskId/status/summary/evidence/at）", () => {
  const events: SessionEvent[] = [
    { kind: "tool_call", summary: "请求 write_file -> src/thing.ts" },
    { kind: "accepted", summary: "write_file 已获准（写入）：src/thing.ts" },
    { kind: "settled", summary: "会话结束" },
  ];
  const hb = buildTaskHandback(events, { roleId: "X", taskId: "T-9", now: () => new Date("2026-10-11T00:00:00.000Z") });
  assert.equal(hb.roleId, "X");
  assert.equal(hb.taskId, "T-9");
  assert.equal(hb.status, "completed");
  assert.equal(hb.summary, "会话结束");
  assert.deepEqual(hb.evidence, ["write_file 已获准（写入）：src/thing.ts"]);
  assert.equal(hb.at, "2026-10-11T00:00:00.000Z");
});

test("buildTaskHandback：无写入被接受且有拒绝 → blocked；无 taskId 时省略该字段", () => {
  const blocked = buildTaskHandback(
    [{ kind: "denied", summary: "拒绝写入 src/evil.ts" }, { kind: "settled", summary: "会话结束" }],
    { roleId: "X" },
  );
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.taskId, undefined, "无 taskId 时不应带该字段");
  assert.deepEqual(blocked.evidence, []);

  // 显式覆盖 status。
  const forced = buildTaskHandback([{ kind: "settled", summary: "完成" }], { roleId: "X", status: "completed" });
  assert.equal(forced.status, "completed");
});

// —— withHandback：透传 + settled 前发 handback ——

test("withHandback：透传 SessionEvent；在 settled **之前**发 handback 事件", async () => {
  const src: SessionEvent[] = [
    { kind: "tool_call", summary: "t" },
    { kind: "accepted", summary: "a" },
    { kind: "settled", summary: "完成" },
  ];
  async function* gen(): AsyncIterable<SessionEvent> {
    for (const e of src) yield e;
  }
  const out: OrchestrationEvent[] = [];
  for await (const ev of withHandback(gen(), { roleId: "X", taskId: "T-1" })) out.push(ev);

  assert.equal(out.length, 4, "3 条会话事件 + 1 条 handback");
  const hbIndex = out.findIndex(isHandback);
  const settledIndex = out.findIndex((e) => e.kind === "settled");
  assert.ok(hbIndex >= 0, "应发出 handback 事件");
  assert.ok(hbIndex < settledIndex, "handback 应在 settled **之前**（以 settled 为终止信号的消费方才收得到）");
  const hb = (out[hbIndex] as HandbackEvent).handback;
  assert.equal(hb.roleId, "X");
  assert.equal(hb.status, "completed");
});

// —— 端到端：普通角色 settle → handback；治理角色不自我回交 ——

test("openRoleSession：普通角色 settle → 发出 handback（形状正确）", async () => {
  const project = makeTempProject();
  try {
    const handle = await openRoleSession(
      { roleId: "X", project, taskId: "T-1" },
      {
        createAdapter: (gate) =>
          createFakeRuntimeAdapter({
            gate,
            script: [{ name: "write_file", args: { path: "src/thing.ts", content: "// x\n" } }],
          }),
      },
    );
    await handle.send("做点事");
    const events: OrchestrationEvent[] = [];
    for await (const ev of handle.events()) events.push(ev);

    const hbs = events.filter(isHandback).map((e) => e.handback);
    assert.equal(hbs.length, 1, "普通角色会话应在 settle 时回交一次");
    assert.equal(hbs[0].roleId, "X");
    assert.equal(hbs[0].taskId, "T-1");
    assert.equal(hbs[0].status, "completed");
    assert.equal(typeof hbs[0].at, "string");
    assert.ok(Array.isArray(hbs[0].evidence));
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

test("openRoleSession：内置治理角色（su）→ **不**自我回交（事件流无 handback）", async () => {
  const project = makeTempProject();
  project.builtInRoles = ["su"];
  try {
    const handle = await openRoleSession(
      { roleId: "su", project },
      {
        createAdapter: (gate) =>
          createFakeRuntimeAdapter({ gate, script: [{ name: "write_file", args: { path: "src/thing.ts", content: "// x\n" } }] }),
      },
    );
    await handle.send("以治理身份工作");
    const events: OrchestrationEvent[] = [];
    for await (const ev of handle.events()) events.push(ev);
    assert.equal(events.filter(isHandback).length, 0, "治理角色不回交给自己");
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

// —— C-1：证据只取写类（读事件不进证据）——正反两向 ——

test("buildTaskHandback（C-1 噪音修正）：证据只取写类 accepted；读事件（三种实际形状）一律不进证据", () => {
  const events: SessionEvent[] = [
    // 假运行时适配器形状：detail = { call, result }
    { kind: "accepted", summary: "read_file 已获准（读取）：src/thing.ts", detail: { call: { name: "read_file" }, result: {} } },
    { kind: "accepted", summary: "write_file 已获准（写入）：src/thing.ts", detail: { call: { name: "write_file" }, result: {} } },
    // 真实适配器形状：summary = `${toolName} 执行完成`、无 call 明细
    { kind: "accepted", summary: "read_file 执行完成", detail: { content: "..." } },
    { kind: "accepted", summary: "edit_file 执行完成", detail: { ok: true } },
    // 装配演示假 runtime 形状：summary 以「写入被允许」开头，detail = WriteDecision
    { kind: "accepted", summary: "写入被允许：src/thing.ts（命中条目 project:src/thing.ts）", detail: { allowed: true } },
    { kind: "settled", summary: "会话结束" },
  ];
  const hb = buildTaskHandback(events, { roleId: "X" });
  assert.deepEqual(hb.evidence, [
    "write_file 已获准（写入）：src/thing.ts",
    "edit_file 执行完成",
    "写入被允许：src/thing.ts（命中条目 project:src/thing.ts）",
  ]);
  // 反向断言：任何读类摘要都不得混入（本修正钉死的噪音）。
  assert.ok(!hb.evidence.some((e) => /read_file|读取/.test(e)), "读事件不得进证据");
});

// —— C-1：报告形状归一 + 报告回交构造 ——

test("normalizeTaskReport / buildReportHandback：合法报告取报告值（evidence 缺省 []）；非法 → undefined（回退）", () => {
  assert.deepEqual(normalizeTaskReport({ status: "blocked", summary: "被依赖阻塞", evidence: ["a.md", "b.md"] }), {
    status: "blocked",
    summary: "被依赖阻塞",
    evidence: ["a.md", "b.md"],
  });
  assert.deepEqual(normalizeTaskReport({ status: "completed", summary: "做完了" }), { status: "completed", summary: "做完了" });

  // 非法输入 → undefined（withHandback 据此回退既有推导，不硬失败、不报错）。
  assert.equal(normalizeTaskReport(undefined), undefined);
  assert.equal(normalizeTaskReport(null), undefined);
  assert.equal(normalizeTaskReport("done"), undefined);
  assert.equal(normalizeTaskReport({ status: "weird", summary: "x" }), undefined, "非法 status → 回退");
  assert.equal(normalizeTaskReport({ status: "completed", summary: "   " }), undefined, "空 summary → 回退");
  assert.equal(normalizeTaskReport({ status: "completed", summary: 1 }), undefined);
  // evidence 类型不对 → 按缺失处理（不因一个坏字段丢掉整份合法报告）。
  assert.deepEqual(normalizeTaskReport({ status: "completed", summary: "x", evidence: [1, 2] }), {
    status: "completed",
    summary: "x",
  });

  const hb = buildReportHandback(
    { status: "blocked", summary: "报告：被阻塞", evidence: ["docs/evidence.md"] },
    { roleId: "X", taskId: "T-9", now: () => new Date("2026-10-12T00:00:00.000Z") },
  );
  assert.deepEqual(hb, {
    roleId: "X",
    taskId: "T-9",
    status: "blocked",
    summary: "报告：被阻塞",
    evidence: ["docs/evidence.md"],
    at: "2026-10-12T00:00:00.000Z",
  });
  const noEv = buildReportHandback({ status: "completed", summary: "x" }, { roleId: "X" });
  assert.deepEqual(noEv.evidence, [], "报告未给 evidence → []（报告是权威值，不混推导）");
  assert.equal(noEv.taskId, undefined);
});

// —— C-1：withHandback 报告优先 / 未见报告回退 ——

test("withHandback（C-1）：收到报告 → 回交内容=报告值（即使与推导结论相反）；未见报告 → 回退推导", async () => {
  const src: SessionEvent[] = [
    { kind: "accepted", summary: "read_file 执行完成" },
    { kind: "settled", summary: "会话结束" },
  ];
  async function* gen(): AsyncIterable<SessionEvent> {
    for (const e of src) yield e;
  }

  // 报告优先：推导会是 completed（无写、无拒绝），报告说 blocked → 取报告。
  const report: TaskReport = { status: "blocked", summary: "报告：等客户确认", evidence: ["角色卡/X/report.md"] };
  const withReport: OrchestrationEvent[] = [];
  for await (const ev of withHandback(gen(), { roleId: "X", taskId: "T-1" }, { report: () => report })) withReport.push(ev);
  const hb1 = (withReport.find(isHandback) as HandbackEvent).handback;
  assert.equal(hb1.status, "blocked", "取报告值");
  assert.equal(hb1.summary, "报告：等客户确认");
  assert.deepEqual(hb1.evidence, ["角色卡/X/report.md"]);
  assert.equal(hb1.taskId, "T-1");

  // 未见报告（report() 返回 undefined）→ 回退既有推导：summary=settled 摘要；读事件不进证据。
  const fallback: OrchestrationEvent[] = [];
  for await (const ev of withHandback(gen(), { roleId: "X" }, { report: () => undefined })) fallback.push(ev);
  const hb2 = (fallback.find(isHandback) as HandbackEvent).handback;
  assert.equal(hb2.summary, "会话结束");
  assert.deepEqual(hb2.evidence, [], "回退推导：只有读事件 → 证据为空");
});

// —— C-1：openRoleSession 端到端（注入 / 报告 / 回退 / su 不注入） ——

/** 捕获能力面 + 可脚本化事件流的桩适配器工厂。 */
function stubAdapter(events: SessionEvent[] = [{ kind: "settled", summary: "会话结束" }]): {
  createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
  caps: () => AdapterCapabilities | undefined;
} {
  let captured: AdapterCapabilities | undefined;
  return {
    caps: () => captured,
    createAdapter: (_gate, capabilities) => {
      captured = capabilities;
      return {
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole(): Promise<RoleSession> {
          return {
            async prompt(): Promise<void> {},
            events(): AsyncIterable<SessionEvent> {
              return (async function* () {
                for (const e of events) yield e;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      };
    },
  };
}

test("openRoleSession（C-1）：项目角色注入 reportHandback；交报告 → handback=报告值；未交 → 回退推导（读事件不进证据）", async () => {
  const project = makeTempProject();
  try {
    // ① 交报告 → 事件内容=报告值（status/summary/evidence 全取报告）。
    const stub1 = stubAdapter([
      { kind: "accepted", summary: "read_file 执行完成" },
      { kind: "accepted", summary: "write_file 执行完成" },
      { kind: "settled", summary: "会话结束" },
    ]);
    const h1 = await openRoleSession({ roleId: "X", project, taskId: "T-1" }, { createAdapter: stub1.createAdapter });
    assert.ok(stub1.caps()?.reportHandback, "项目角色会话应注入 reportHandback（submit_report 据此注册）");
    assert.equal(stub1.caps()?.customerInput, undefined, "未给客户通道 → customerInput 不注入");
    await h1.send("干活");
    await stub1.caps()!.reportHandback!({
      status: "blocked",
      summary: "报告：被外部依赖阻塞",
      evidence: ["角色卡/X/blocked.md"],
    });
    const ev1: OrchestrationEvent[] = [];
    for await (const ev of h1.events()) ev1.push(ev);
    const hb1 = (ev1.find(isHandback) as HandbackEvent).handback;
    assert.equal(hb1.status, "blocked", "取报告值（推导会是 completed——有写、无拒绝）");
    assert.equal(hb1.summary, "报告：被外部依赖阻塞");
    assert.deepEqual(hb1.evidence, ["角色卡/X/blocked.md"]);
    assert.equal(hb1.roleId, "X");
    assert.equal(hb1.taskId, "T-1");
    await h1.dispose();

    // ② 未交 → 回退推导；读事件不进证据、写事件进证据。
    const stub2 = stubAdapter([
      { kind: "accepted", summary: "read_file 执行完成" },
      { kind: "accepted", summary: "edit_file 执行完成" },
      { kind: "settled", summary: "会话结束" },
    ]);
    const h2 = await openRoleSession({ roleId: "X", project, taskId: "T-1" }, { createAdapter: stub2.createAdapter });
    await h2.send("干活");
    const ev2: OrchestrationEvent[] = [];
    for await (const ev of h2.events()) ev2.push(ev);
    const hb2 = (ev2.find(isHandback) as HandbackEvent).handback;
    assert.equal(hb2.summary, "会话结束", "回退推导：summary = settled 摘要");
    assert.equal(hb2.status, "completed");
    assert.deepEqual(hb2.evidence, ["edit_file 执行完成"], "只取写类；读事件不进证据");
    await h2.dispose();

    // ③ 报告形状非法 → 回退既有推导（不硬失败、不报错）。
    const stub3 = stubAdapter([{ kind: "settled", summary: "会话结束" }]);
    const h3 = await openRoleSession({ roleId: "X", project }, { createAdapter: stub3.createAdapter });
    await h3.send("干活");
    (stub3.caps()!.reportHandback as unknown as (r: unknown) => void)({ status: "weird", summary: "" });
    const ev3: OrchestrationEvent[] = [];
    for await (const ev of h3.events()) ev3.push(ev);
    const hb3 = (ev3.find(isHandback) as HandbackEvent).handback;
    assert.equal(hb3.summary, "会话结束", "非法报告 → 回退推导");
    assert.equal(hb3.status, "completed");
    await h3.dispose();
  } finally {
    cleanup(project);
  }
});

test("openRoleSession（C-1）：治理角色 su 不注入 reportHandback（能力面为空；事件流无 handback）", async () => {
  const project = makeTempProject();
  project.builtInRoles = ["su"];
  try {
    const stub = stubAdapter([{ kind: "settled", summary: "会话结束" }]);
    const handle = await openRoleSession({ roleId: "su", project }, { createAdapter: stub.createAdapter });
    assert.equal(stub.caps()?.reportHandback, undefined, "su 不注入 reportHandback（不自我回交）");
    await handle.send("以治理身份工作");
    const events: OrchestrationEvent[] = [];
    for await (const ev of handle.events()) events.push(ev);
    assert.equal(events.filter(isHandback).length, 0, "治理角色不回交");
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

// —— E-1：投递文案（单一来源）与去重键 ——

test("renderHandbackPrompt（E-1）：字段逐条 + 明示请验收；无任务号/无证据时如实呈现；不夹带权限语义", () => {
  const hb = {
    roleId: "编排",
    taskId: "T-9",
    status: "blocked" as const,
    summary: "写盘被门禁拒绝，等客户确认后继续",
    evidence: ["角色卡/编排/report.md", "node --test 全绿"],
    at: "2026-10-12T00:00:00.000Z",
  };
  const text = renderHandbackPrompt(hb);
  const lines = text.split("\n");
  assert.equal(lines[0], "[回交] 来自 编排 的报告（任务 T-9）");
  assert.equal(lines[1], "结论：blocked");
  assert.equal(lines[2], "摘要：写盘被门禁拒绝，等客户确认后继续");
  assert.equal(lines[3], "证据：");
  assert.equal(lines[4], "  - 角色卡/编排/report.md");
  assert.equal(lines[5], "  - node --test 全绿");
  assert.equal(lines[6], "请验收：确认通过 / 要求返工 / 上报客户。");
  assert.ok(text.includes("请验收"), "必须明示请 su 验收");
  assert.ok(!/授权|写权|权限|越权/.test(text), "不得夹带权限语义（回交只搬任务与证据）");

  // 无 taskId → 不出现「（任务 …）」；无证据 → 如实「（无）」。
  const bare = renderHandbackPrompt({
    roleId: "X",
    status: "completed",
    summary: "完成",
    evidence: [],
    at: "2026-10-12T00:00:00.000Z",
  });
  assert.equal(bare.split("\n")[0], "[回交] 来自 X 的报告");
  assert.ok(!bare.includes("（任务"), "无 taskId 不写任务段");
  assert.ok(bare.includes("证据：（无）"), "无证据如实呈现");
});

test("handbackKey（E-1）：同一回交恒等；角色/任务/时间任一不同即不同（投递去重用）", () => {
  const base = {
    roleId: "X",
    taskId: "T-1",
    status: "completed" as const,
    summary: "s",
    evidence: [],
    at: "2026-10-12T00:00:00.000Z",
  };
  assert.equal(handbackKey(base), handbackKey({ ...base }), "同一份回交 → 恒等键");
  assert.notEqual(handbackKey(base), handbackKey({ ...base, at: "2026-10-12T00:00:01.000Z" }));
  assert.notEqual(handbackKey(base), handbackKey({ ...base, roleId: "Y" }));
  assert.notEqual(handbackKey(base), handbackKey({ ...base, taskId: "T-2" }));
  const noTask = { ...base, taskId: undefined };
  assert.equal(handbackKey(noTask), handbackKey({ ...noTask }), "无 taskId 亦稳定");
  assert.notEqual(handbackKey(noTask), handbackKey(base));
});

// —— H-1：派发文案（单一来源）、roleId 判定口径、能力透传（只给 su） ——

test("renderDispatchPrompt（H-1）：逐行文案；task 原文逐字保留；无 reason 不写原因段；不夹带授权语义", () => {
  const req = {
    roleId: "编排",
    task: "把 src/x.ts 的校验补上（依据 docs/design/a.md；完成标准：测试绿）",
    reason: "返工：证据不足",
  };
  const text = renderDispatchPrompt(req);
  const lines = text.split("\n");
  assert.equal(lines[0], "[派发] 来自 su 的任务（原因：返工：证据不足）");
  assert.equal(lines[1], req.task, "task 原文逐字保留（契约要求任务文本自足）");
  assert.equal(lines[2], "完成后请交回报告（改了什么/结论/证据）。");
  assert.equal(lines.length, 3, "恰好三行");
  assert.ok(!/授权|写权|权限|越权|可写/.test(text), "不得夹带授权语义（派发 ≠ 授权）");
  assert.ok(!text.includes(req.roleId), "roleId 不进入文案（投递进目标角色自己的会话，自指冗余）");

  // 无 reason → 不写原因段；多行 task 原样保留（含空行）。
  const multi = renderDispatchPrompt({
    roleId: "X",
    task: "第一步：读 docs/a.md\n\n第二步：改 src/b.ts\n第三步：跑测试",
  });
  assert.equal(multi.split("\n")[0], "[派发] 来自 su 的任务", "无 reason → 首行不带原因段");
  assert.ok(multi.includes("第一步：读 docs/a.md\n\n第二步：改 src/b.ts\n第三步：跑测试"), "多行 task 原样保留");
  assert.ok(!multi.includes("（原因"), "无 reason 不写原因段");
});

test("isDispatchableRoleId（H-1）：登记项目角色 → true；su 自身/未登记/空 → false（fail-closed；快照语义如实）", () => {
  const project = makeTempProject(); // roles: { X }
  try {
    assert.equal(isDispatchableRoleId(project, "X"), true);
    assert.equal(isDispatchableRoleId(project, "su"), false, "指向 su 自身 → 拒（内置角色不进 roles 映射）");
    assert.equal(isDispatchableRoleId(project, "不存在的角色"), false);
    assert.equal(isDispatchableRoleId(project, ""), false);
    // 快照语义（文档已登记的注意）：会话里新建的角色不在开启时的 project 快照内 → false；
    // 权威判定在持有**实时**角色清单的前端（应以实时清单重建 project 后再判）。
    assert.equal(isDispatchableRoleId(project, "NewRole"), false, "快照外角色 → false");
  } finally {
    cleanup(project);
  }
});

test("openRoleSession（H-1）：dispatchTask **只给治理角色 su** 透传；项目角色会话不给；未给路由不注入", async () => {
  const project = makeTempProject();
  project.builtInRoles = ["su"];
  try {
    const router: DispatchTaskFn = () => ({ ok: true });

    // su 会话 → 透传（dispatch_task 据此注册）。
    const suStub = stubAdapter();
    const suHandle = await openRoleSession(
      { roleId: "su", project, dispatchTask: router },
      { createAdapter: suStub.createAdapter },
    );
    assert.equal(suStub.caps()?.dispatchTask, router, "su 会话应拿到前端路由能力");
    await suHandle.dispose();

    // 项目角色会话（即便调用方误给）→ 不注入。
    const xStub = stubAdapter();
    const xHandle = await openRoleSession(
      { roleId: "X", project, dispatchTask: router },
      { createAdapter: xStub.createAdapter },
    );
    assert.equal(xStub.caps()?.dispatchTask, undefined, "项目角色会话不得注入 dispatchTask（只给 su）");
    await xHandle.dispose();

    // su 会话未给路由（CLI 一次性前端不做同等路由，设计已登记）→ 不注入（工具不注册）。
    const bareStub = stubAdapter();
    const bareHandle = await openRoleSession({ roleId: "su", project }, { createAdapter: bareStub.createAdapter });
    assert.equal(bareStub.caps()?.dispatchTask, undefined, "未给路由 → 不注入");
    await bareHandle.dispose();
  } finally {
    cleanup(project);
  }
});

// —— L-1：派发受理回执（单一来源）与到达序约定 ——

test("formatDispatchReceipt（L-1）：目标忙 → 明写入队与位置（受理 ≠ 完成）；空闲 → 现状文案（未开则如实提示将自动开启）", () => {
  // 忙（已入队）：位置写清、受理≠完成必须在场。
  const busy = formatDispatchReceipt({ targetRoleId: "编排", sessionOpen: true, queuePosition: 2 });
  assert.equal(busy, "已受理：目标忙，已入队（第 2 位）；受理 ≠ 完成。");
  assert.ok(busy.includes("入队"), "明说入队");
  assert.ok(busy.includes("第 2 位"), "写明队列位置");
  assert.ok(busy.includes("受理 ≠ 完成"), "受理 ≠ 完成必须在场");

  // 空闲（未入队）：现状文案；会话未开 → 如实提示将自动开启。
  const idleClosed = formatDispatchReceipt({ targetRoleId: "编排", sessionOpen: false });
  assert.match(idleClosed, /^已受理：任务将投递给角色 编排 的会话（其会话未开——将自动开启）/);
  assert.match(idleClosed, /受理≠已完成/);
  const idleOpen = formatDispatchReceipt({ targetRoleId: "编排", sessionOpen: true });
  assert.ok(!idleOpen.includes("未开"), "会话已开 → 不带「未开/自动开启」提示");
  assert.ok(idleOpen.includes("投递结果/失败会在其聊天流与 su 的聊天流如实显示"), "如实外推渠道不变");
});

test("L-1（到达序，假件驱动）：两条派发经同一目标队列 → 位置 1、2；出队按到达序", () => {
  // 假件：**前端投递机**的替身（队列归属前端——L-1 结论；本测试只钉约定：FIFO + 位置口径 + 回执文案）。
  const queue: string[] = [];
  const dispatch = (task: string, busy: boolean): { receipt: string; task: string } => {
    queue.push(task); // 到达序入队（front 的 push；位置=入队后序号，1 起）
    return {
      task,
      receipt: formatDispatchReceipt({
        targetRoleId: "X",
        sessionOpen: true,
        ...(busy ? { queuePosition: queue.length } : {}),
      }),
    };
  };

  // 目标忙时两条连续派发：位置 1、2（到达序）。
  const first = dispatch("任务 A", true);
  const second = dispatch("任务 B", true);
  assert.match(first.receipt, /已入队（第 1 位）/, "第一条位置 1");
  assert.match(second.receipt, /已入队（第 2 位）/, "第二条位置 2（按到达序）");

  // 出队按到达序：A → B（settled 后逐条放行的顺序约定）。
  const drained: string[] = [];
  while (queue.length > 0) drained.push(queue.shift()!);
  assert.deepEqual(drained, ["任务 A", "任务 B"], "出队按到达序（FIFO）");

  // 忙→闲：队列清空后再次派发走「空闲」回执（不带位置）。
  const idle = dispatch("任务 C", false);
  assert.ok(!idle.receipt.includes("入队"), "空闲回执不带入队段");
  assert.match(idle.receipt, /已受理：任务将投递给角色 X 的会话/);
});
