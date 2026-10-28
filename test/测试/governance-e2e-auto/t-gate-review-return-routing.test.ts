// test/测试/governance-e2e-auto/t-gate-review-return-routing.test.ts
// 2026-10-27 S6 集成/回归（团队计划 S6；验收标准 P1–P20 的跨角色 e2e 面；方案 v3.2 §3–§6）：
// **gate 复核退回补正 / 不可读提醒 / 稳定身份 / 历史退回 / 路由 fail-closed / 部分失败重试与耗尽 /
// 通过转交 / flow-busy 正交** 的独立端到端链路。
//
// 纪律：全部在系统临时根内；走真实桌面 `createDesktopInterface` + 真实 `openRoleSession` + 真实账本/flow/
// 工具面（脚本化假适配器只代替模型回合）；不读真实 .env/凭据/在线模型；不写目标项目；不覆盖既有用例。
// 本文件只新增用例；对共享夹具仅加 opt-in `forwardRequestGateReview`（默认关闭，既有用例零变化）。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  makeHarness,
  makeRoot,
  seedLedger,
  seedTrioProject,
  sha256,
  wait,
  write,
  type Harness,
} from "./fixture.ts";
import type { ToolCall } from "../../../src/model/runtime.ts";
import { parseFlowStateYaml } from "../../../src/pipeline/orchestration/flow-state.ts";
import { readGovernanceLedger } from "../../../src/common/编排/governance-ledger.ts";
import type { DesktopDeps } from "../../../app/desktop/interface.ts";

// —————————————————————— 夹具（本文件私有；不 import 实施方测试） ——————————————————————

const FLOW = "flow-gate-routing";
const GATE_ID = "gate-vertical-slice";
const GATE_KIND = "vertical-slice";
const FLOW_REL = `docs/flows/${FLOW}.yaml`;
const CRITERIA_REL = `docs/acceptance/${FLOW}-criteria-v1.md`;
const EVIDENCE_REL = `docs/verification/${FLOW}-demo.md`;
const GATE_RECORD_REL = `.ans/governance/acceptance/${FLOW}/gates/${GATE_ID}.json`;
const ROUTING_REL = `.ans/governance/acceptance/${FLOW}/gates/${GATE_ID}-handoff-routing.json`;
const reportRel = (version: number): string => `docs/acceptance/${FLOW}-${GATE_ID}-report-v${version}.md`;

/** 固定引擎解析（gate 派发需要确定性 runtime；不触真实凭据）。 */
const RESOLVE_RUNTIME: DesktopDeps["resolveRuntimeFn"] = async () => ({
  ok: true,
  runtime: "claude",
  source: "credentials",
  skipped: [],
});

interface GateFlowOptions {
  /** 额外制造一个可派发的在途步骤（flow-busy 用例）。 */
  withBusyStep?: boolean;
  /** gate 步骤状态（缺省 pending）。 */
  gateStatus?: string;
}

/** 合法 gate 流程（YAML-only；gate 步骤 kind:artifact + gateKind，依赖 delivery-server）。 */
function gateFlowYaml(options: GateFlowOptions = {}): string {
  const lines = [
    `flowId: ${FLOW}`,
    "version: 1",
    "qualityTier: production",
    "steps:",
    "  - id: delivery-server",
    "    title: 服务交付",
    "    owner: executor",
    "    kind: dispatch",
    "    status: done",
    "    evidence:",
    "      kind: dispatch",
    "      ref: delivery-server",
    "  - id: verification-evidence",
    "    title: 真实运行证据",
    "    owner: executor",
    "    kind: artifact",
    "    status: done",
    "    evidence:",
    "      kind: artifact",
    `      ref: ${EVIDENCE_REL}`,
  ];
  if (options.withBusyStep === true) {
    lines.push(
      "  - id: impl",
      "    title: impl",
      "    owner: executor",
      "    kind: dispatch",
      "    status: pending",
    );
  }
  lines.push(
    `  - id: ${GATE_ID}`,
    "    title: 垂直切片 gate 复核",
    "    owner: verifier",
    "    kind: artifact",
    `    gateKind: ${GATE_KIND}`,
    `    status: ${options.gateStatus ?? "pending"}`,
    "    evidence:",
    "      kind: artifact",
    `      ref: ${reportRel(1)}`,
    "    dependsOn: [delivery-server]",
    "  - id: delivery-after-gate",
    "    title: gate 后交付",
    "    owner: executor",
    "    kind: dispatch",
    "    status: pending",
    `    dependsOn: [${GATE_ID}]`,
    "  - id: verification",
    "    title: 验收",
    "    owner: app",
    "    kind: acceptance",
    "    status: pending",
  );
  return lines.join("\n") + "\n";
}

/** 验收标准：含该 gateId 的 Gate 复核标准节（gate 请求前置）。 */
function gateCriteriaDoc(): string {
  return [
    `flowId: ${FLOW}`,
    "version: 1",
    "riskTier: T2",
    "---",
    `# 验收标准：${FLOW}`,
    "| ID | 标准 | 需要的证据 | 判定 |",
    "| --- | --- | --- | --- |",
    "| A1 | 交付 | 测试输出 | pass / fail / insufficient evidence |",
    "风险档位：T2。判定规则：pass / fail / insufficient evidence。证据计划：单测。版本：v1 冻结。",
    `## Gate 复核标准：${GATE_ID}（${GATE_KIND}）`,
    "| ID | 标准 | 需要的证据 | 判定 |",
    "| --- | --- | --- | --- |",
    "| GV-1 | 脚手架可真实运行/最小测试通过 | 命令、日志、退出码 | pass / fail / insufficient evidence |",
    "",
  ].join("\n");
}

/** trio 项目 + gate 流程 + 标准 + 依赖账本（真实形状；临时根内）。 */
async function seedGateProject(root: string, options: GateFlowOptions = {}): Promise<void> {
  seedTrioProject(root, ["executor"]);
  write(root, FLOW_REL, gateFlowYaml(options));
  write(root, CRITERIA_REL, gateCriteriaDoc());
  write(root, EVIDENCE_REL, "# 真实运行/演示证据\n");
  await seedLedger(root, [
    {
      kind: "customer.decision",
      flowId: FLOW,
      decisionKind: "proposal-accept",
      customerDecision: "accepted",
      actorRoleId: "rapporteur",
      power: "proposal",
    },
    {
      kind: "customer.decision",
      flowId: FLOW,
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "nominator",
      power: "nomination",
      targetRoleIds: ["executor"],
    },
    {
      kind: "dispatch.accepted",
      flowId: FLOW,
      stepId: "delivery-server",
      actorRoleId: "convener",
      power: "schedule",
      targetRoleId: "executor",
    },
    {
      kind: "artifact.observed",
      flowId: FLOW,
      artifactPath: EVIDENCE_REL,
      actorRoleId: "executor",
      power: "project",
    },
  ]);
}

function flowRevision(root: string): string {
  return sha256(readFileSync(path.join(root, ...FLOW_REL.split("/"))));
}

/** 原子写 gate 记录（形状与产品一致；测试用不同状态/报告身份构造场景）。 */
function plantGateRecord(root: string, overrides: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  const record: Record<string, unknown> = {
    schema: "gate-review-record/v1",
    flowId: FLOW,
    gateId: GATE_ID,
    gateKind: GATE_KIND,
    flowRevision: flowRevision(root),
    reportPath: reportRel(1),
    reportVersion: 1,
    reportSha256: null,
    conclusion: null,
    severityCounts: { blocker: 0, major: 0, minor: 0, nit: 0 },
    itemCount: 0,
    itemsDigest: null,
    requestId: "gate-req-e2e",
    dispatchedAt: now,
    decidedAt: null,
    error: null,
    at: now,
    ...overrides,
  };
  write(root, GATE_RECORD_REL, JSON.stringify(record, null, 2) + "\n");
  return record;
}

function readGateRecord(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(root, ...GATE_RECORD_REL.split("/")), "utf8")) as Record<string, unknown>;
}

function readRouting(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(root, ...ROUTING_REL.split("/")), "utf8")) as Record<string, unknown>;
}

/** 路由记录由发送流程在任务投递后回写 ⇒ 读取字段前按条件有界等待。 */
async function waitRouting(
  root: string,
  predicate: (record: Record<string, unknown>) => boolean,
  timeoutMs = 10000,
): Promise<Record<string, unknown>> {
  const started = Date.now();
  for (;;) {
    try {
      const record = readRouting(root);
      if (predicate(record)) return record;
    } catch {
      /* 尚未落盘 */
    }
    if (Date.now() - started > timeoutMs) throw new Error("等待路由记录条件超时");
    await wait(50);
  }
}

function returnDeliveries(record: Record<string, unknown>): Array<Record<string, unknown>> {
  return ((record.latestReturn as Record<string, unknown> | null)?.deliveries ?? []) as Array<Record<string, unknown>>;
}

function writeReport(root: string, version: number, body: string): void {
  write(root, reportRel(version), body);
}

/** 结构坏但意图为 pass 的报告：YAML 普通标量以反引号开头 ⇒ 整段解析失败（line/column）。 */
function syntaxBadPassReport(): string {
  return [
    "# Gate 复核报告",
    "```yaml",
    "schema: acceptance-triage/v1",
    "conclusion: pass",
    "items:",
    "  - id: G1",
    "    severity: minor",
    "    owner: executor",
    "    reason: `反引号开头的普通标量",
    "    action: 保持记录",
    "```",
    "",
  ].join("\n");
}

/** 结构合格 pass 报告（空 items）。 */
function validPassReport(): string {
  return ["# Gate 复核报告", "", "```yaml", "schema: acceptance-triage/v1", "conclusion: pass", "items: []", "```", ""].join("\n");
}

function rolePrompts(h: Harness, roleId: string): string[] {
  return h.prompts.get(roleId) ?? [];
}

function tasksTo(h: Harness, roleId: string, marker: string): string[] {
  return rolePrompts(h, roleId).filter((prompt) => prompt.includes(marker));
}

async function waitTasks(h: Harness, roleId: string, prefix: string, count: number, timeoutMs = 10000): Promise<string[]> {
  await h.waitFor(() => tasksTo(h, roleId, prefix).length >= count, timeoutMs);
  return tasksTo(h, roleId, prefix);
}

/** 一次真实 settle（触发 40ms 有界 acceptance/gate 扫描）；等待该回合被记录。 */
async function poke(h: Harness, roleId = "convener", text = "巡检：继续（不动作）"): Promise<void> {
  if (!h.openRoles.includes(roleId) && !h.userOpened.includes(roleId)) await h.open(roleId);
  const before = rolePrompts(h, roleId).length;
  const sent = await h.send(roleId, text);
  assert.equal(sent.ok, true, sent.error ?? "");
  await h.waitFor(() => rolePrompts(h, roleId).length > before, 10000);
}

function deliveryNotes(h: Harness, roleId: string): string[] {
  return h.events
    .filter(
      (envelope) =>
        envelope.roleId === roleId &&
        envelope.event.kind === "message" &&
        (envelope.event as { detail?: { source?: string } }).detail?.source === "delivery-note",
    )
    .map((envelope) => String((envelope.event as { summary?: string }).summary));
}

async function flowStepStatus(root: string, stepId: string): Promise<string | undefined> {
  const parsed = parseFlowStateYaml(readFileSync(path.join(root, ...FLOW_REL.split("/")), "utf8"), FLOW);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.errors.map((entry) => `${entry.path}: ${entry.message}`).join("；"));
  if (!parsed.ok) return undefined;
  return parsed.flow.steps.find((step) => step.id === stepId)?.status;
}

// —————————————————————— 用例 ——————————————————————

test("S6-1 gate 派发 → 结构坏 pass 报告 → 补正（可执行原因/下一版本）→ 修正新版本 → 机械复核通过 → 统筹恰一条 [Gate 通过]；应用不派 worker", async () => {
  const temp = makeRoot("gate-routing-core");
  await seedGateProject(temp.root);
  const h = await makeHarness({
    tag: "gate-routing-core",
    root: temp.root,
    approval: true,
    decision: true,
    resolveRuntime: RESOLVE_RUNTIME,
    forwardRequestGateReview: true,
    onPrompt: (ctx) => {
      if (ctx.roleId !== "verifier") return;
      if (ctx.prompt.includes("[Gate 复核]")) {
        writeReport(temp.root, 1, syntaxBadPassReport());
      } else if (ctx.prompt.includes("[Gate 报告补正]")) {
        writeReport(temp.root, 2, validPassReport());
      }
    },
    scriptForRole: (ctx): ToolCall[] =>
      ctx.roleId === "convener" && ctx.prompt.includes("发起 gate 复核")
        ? [{ name: "request_gate_review", args: { flowId: FLOW, gateId: GATE_ID } }]
        : [],
  });
  try {
    await h.open("convener");
    const sent = await h.send("convener", "请发起 gate 复核（S6 离线条目）");
    assert.equal(sent.ok, true, sent.error ?? "");
    await h.waitFor(() => existsSync(path.join(temp.root, ...GATE_RECORD_REL.split("/"))), 10000);
    assert.equal(readGateRecord(temp.root).status, "dispatched", "request_gate_review 落 gate 记录 dispatched");
    const requestReceipt = h.results.find((result) => result.name === "request_gate_review");
    assert.ok(requestReceipt, "应有 request_gate_review 回执");
    assert.equal(requestReceipt!.ok, true, requestReceipt!.message);
    assert.match(requestReceipt!.message, /gate 复核已派发/, "回执如实说明已派发 Proof");
    assert.match(requestReceipt!.message, /不代表 gate 已通过/, "回执不得宣称已通过");

    // 质检收到 [Gate 复核] 并在回合内写出结构坏报告；扫描后进入 returned-to-proof。
    await waitTasks(h, "verifier", "[Gate 复核]", 1);
    await h.waitFor(() => readGateRecord(temp.root).status === "returned-to-proof", 15000);
    const returned = readGateRecord(temp.root);
    assert.match(String(returned.reportSha256), /^[a-f0-9]{64}$/, "退回记录保存被拒报告真实 sha");
    assert.match(String(returned.error), /line \d+, column \d+/, "可执行原因保留 YAML 行列");

    const corrections = await waitTasks(h, "verifier", "[Gate 报告补正]", 1);
    const correction = corrections[0]!;
    assert.ok(correction.includes("[Gate 报告补正]"), "补正任务标题（会话重建通知可能前置）");
    assert.ok(correction.includes(FLOW) && correction.includes(GATE_ID), "补正任务自足含 flow/gate 身份");
    assert.ok(correction.includes(reportRel(2)), "补正任务给出下一版本 v2 路径");
    assert.ok(correction.includes("同一轮"), "声明是同一轮复核补正，不是统筹新请求");
    assert.ok(correction.includes("不要标任何 flow 步骤 done"), "边界要求明确");
    assert.match(correction, /line \d+, column \d+/, "补正任务含可执行行列原因");

    const returnNotices = await waitTasks(h, "convener", "[Gate 退回]", 1);
    assert.ok(returnNotices[0]!.includes("不需要重新派发质检"), "统筹退回任务说明无需重新派发质检");
    assert.equal(tasksTo(h, "convener", "[Gate 退回·需重新请求]").length, 0, "报告侧退回不是候选变化");

    assert.equal(await flowStepStatus(temp.root, GATE_ID), "pending", "退回不收口 gate 步骤");
    const routingAfterReturn = await waitRouting(temp.root, (record) => (record.latestReturn as Record<string, unknown> | null)?.cause === "report-invalid");
    assert.equal(routingAfterReturn.schema, "gate-handoff-routing/v1");
    assert.equal((routingAfterReturn.latestReturn as Record<string, unknown>).cause, "report-invalid");
    assert.equal(routingAfterReturn.consecutiveReturns, 1);
    const ledgerAfterReturn = await readGovernanceLedger(temp.root);
    assert.equal(ledgerAfterReturn.entries.some((entry) => entry.kind === "gate.review"), false, "退回不写 gate.review");
    assert.equal(ledgerAfterReturn.entries.some((entry) => entry.kind === "customer.decision" && entry.decisionKind === "acceptance"), false, "不写客户验收决定");
    assert.equal(
      ledgerAfterReturn.entries.some((entry) => entry.kind === "dispatch.accepted" && entry.stepId === "delivery-after-gate"),
      false,
      "应用不派下游步骤",
    );

    // 质检在补正回合写出 v2 pass ⇒ 机械复核通过 + 统筹恰一条 [Gate 通过]。
    await h.waitFor(() => readGateRecord(temp.root).status === "passed", 15000);
    const passTasks = await waitTasks(h, "convener", "[Gate 通过]", 1);
    const passTask = passTasks[0]!;
    assert.ok(passTask.includes("delivery-after-gate"), "通过转交含可派发 ready 列表");
    assert.ok(passTask.includes("应用未派发任何 worker"), "声明应用不派 worker");
    assert.ok(passTask.includes("gate 通过 ≠ 最终验收通过 ≠ 客户批准"), "gate 通过不等于验收/客户批准");
    assert.equal(await flowStepStatus(temp.root, GATE_ID), "done", "pass 收口 gate 步骤 done");
    assert.equal(await flowStepStatus(temp.root, "delivery-after-gate"), "pending", "下游仍 pending，等统筹派发");

    const ledgerAfterPass = await readGovernanceLedger(temp.root);
    const gateReviews = ledgerAfterPass.entries.filter((entry) => entry.kind === "gate.review");
    assert.equal(gateReviews.length, 1, "恰一条 gate.review(pass) 审计");
    assert.equal(gateReviews[0]!.flowId, FLOW);
    assert.equal(
      ledgerAfterPass.entries.some((entry) => entry.kind === "dispatch.accepted" && entry.stepId === "delivery-after-gate"),
      false,
      "应用未替统筹派发下游",
    );
    assert.equal(rolePrompts(h, "executor").some((prompt) => prompt.includes("delivery-after-gate")), false, "executor 未收到应用派单");

    // 重复扫描/再 settle：不重复补正、不重复通过转交。
    await poke(h);
    await wait(300);
    assert.equal(tasksTo(h, "verifier", "[Gate 报告补正]").length, 1, "同一报告不重复补正");
    assert.equal(tasksTo(h, "convener", "[Gate 通过]").length, 1, "通过转交恰一条");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("S6-2 R2b 报告不可读：一次性可执行提醒 + 统筹知情；记录保持 dispatched；重复扫描不重复", async () => {
  const temp = makeRoot("gate-routing-r2b");
  await seedGateProject(temp.root);
  plantGateRecord(temp.root, { status: "dispatched" });
  // 目录占住报告路径 ⇒ readFile EISDIR（不可读），不伪装成退回。
  mkdirSync(path.join(temp.root, ...reportRel(1).split("/")), { recursive: true });
  const h = await makeHarness({
    tag: "gate-routing-r2b",
    root: temp.root,
    approval: true,
    decision: true,
    resolveRuntime: RESOLVE_RUNTIME,
  });
  try {
    await poke(h);
    const reminders = await waitTasks(h, "verifier", "[Gate 报告不可读提醒]", 1);
    const reminder = reminders[0]!;
    assert.ok(reminder.includes("仍为 dispatched"), "提醒声明记录仍 dispatched");
    assert.ok(reminder.includes("未判退回"), "提醒不伪装成退回");
    assert.ok(reminder.includes("读取权限"), "提醒给出可执行检查项");
    await waitTasks(h, "convener", "[Gate 报告不可读提醒]", 1);
    assert.equal(readGateRecord(temp.root).status, "dispatched", "R2b 不转退回");
    const routing = await waitRouting(
      temp.root,
      (record) =>
        record.reminderCount === 1 &&
        (record.latestReminder as Record<string, unknown> | null)?.cause === "report-unreadable",
    );
    assert.equal(routing.consecutiveReturns, 0, "提醒不进入退回轮次计数");
    const ledger = await readGovernanceLedger(temp.root);
    assert.equal(ledger.entries.some((entry) => entry.kind === "gate.review"), false, "提醒不写 gate.review");

    await poke(h);
    await wait(500);
    assert.equal(tasksTo(h, "verifier", "[Gate 报告不可读提醒]").length, 1, "同身份不重复提醒");
    assert.equal(tasksTo(h, "convener", "[Gate 报告不可读提醒]").length, 1);
    assert.equal(readRouting(temp.root).reminderCount, 1);
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("S6-3 O1 缺报告提前提醒：质检空闲一次提醒 + 统筹知情；记录 dispatched；重复扫描去重", async () => {
  const temp = makeRoot("gate-routing-o1");
  await seedGateProject(temp.root);
  plantGateRecord(temp.root, { status: "dispatched" });
  const h = await makeHarness({
    tag: "gate-routing-o1",
    root: temp.root,
    approval: true,
    decision: true,
    resolveRuntime: RESOLVE_RUNTIME,
  });
  try {
    await poke(h);
    const reminders = await waitTasks(h, "verifier", "[Gate 报告提醒]", 1);
    assert.ok(reminders[0]!.includes("补交"), "O1 要求按请求版本补交");
    assert.equal(reminders[0]!.includes("读取权限"), false, "O1 不套用 R2b 不可读文案");
    await waitTasks(h, "convener", "[Gate 报告提醒]", 1);
    assert.equal(readGateRecord(temp.root).status, "dispatched");
    const routing = await waitRouting(
      temp.root,
      (record) => (record.latestReminder as Record<string, unknown> | null)?.cause === "report-missing-early",
    );
    assert.equal(readGateRecord(temp.root).status, "dispatched");
    assert.equal(routing.reminderCount, 1);

    await poke(h);
    await wait(500);
    assert.equal(tasksTo(h, "verifier", "[Gate 报告提醒]").length, 1, "重复扫描不重复提醒");
    assert.equal(tasksTo(h, "convener", "[Gate 报告提醒]").length, 1);
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("S6-4 R5 版本偏旧 + 同 sha 不同版本：按派发要求版本 v2 补正；v2 内容与 v1 相同也视为新报告并收口", async () => {
  const temp = makeRoot("gate-routing-r5");
  await seedGateProject(temp.root);
  // 派发要求 v2，但最新只有 v1 ⇒ version-older（不是“最新+1”）。
  plantGateRecord(temp.root, { status: "dispatched", reportPath: reportRel(2), reportVersion: 2 });
  const v1Body = validPassReport();
  writeReport(temp.root, 1, v1Body);
  const h = await makeHarness({
    tag: "gate-routing-r5",
    root: temp.root,
    approval: true,
    decision: true,
    resolveRuntime: RESOLVE_RUNTIME,
    scriptForRole: () => [],
  });
  try {
    await poke(h);
    await h.waitFor(() => readGateRecord(temp.root).status === "returned-to-proof", 10000);
    const corrections = await waitTasks(h, "verifier", "[Gate 报告补正]", 1);
    assert.ok(corrections[0]!.includes("派发要求版本：v2"), "R5 使用派发要求版本 v2");
    assert.ok(corrections[0]!.includes("不是“最新+1”"), "R5 明确不是最新+1");
    const routing = await waitRouting(
      temp.root,
      (record) => (record.latestReturn as Record<string, unknown> | null)?.cause === "version-older",
    );
    assert.equal((routing.latestReturn as Record<string, unknown>).expectedReportVersion, 2);
    assert.equal(readGateRecord(temp.root).reportVersion, 1, "退回记录保存最新被拒版本 v1");
    const rejected = (routing.latestReturn as Record<string, unknown>).rejectedIdentity as Record<string, unknown>;
    assert.equal(rejected.reportSha256, sha256(v1Body), "被拒报告稳定身份为真实 sha");

    // 同一被拒报告重复扫描：不转 dispatched、不重复补正。
    await poke(h);
    await wait(500);
    assert.equal(tasksTo(h, "verifier", "[Gate 报告补正]").length, 1, "同一旧报告不重开");
    assert.equal(readGateRecord(temp.root).status, "returned-to-proof");

    // v2 内容与 v1 相同（同 sha、不同版本）⇒ 视为新报告，按新版本机械复核通过。
    writeReport(temp.root, 2, v1Body);
    await poke(h);
    await h.waitFor(() => readGateRecord(temp.root).status === "passed", 15000);
    await waitTasks(h, "convener", "[Gate 通过]", 1);
    assert.equal(await flowStepStatus(temp.root, GATE_ID), "done");
    await waitRouting(temp.root, (record) => record.consecutiveReturns === 0);
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("S6-5 R6 候选变化：只通知统筹重新 request_gate_review；不向质检发送；新报告不自动放行", async () => {
  const temp = makeRoot("gate-routing-r6");
  await seedGateProject(temp.root);
  const staleRevision = flowRevision(temp.root);
  plantGateRecord(temp.root, { status: "dispatched", flowRevision: staleRevision });
  writeReport(temp.root, 1, validPassReport());
  // 派发后 flow 变化（候选不符）。
  write(temp.root, FLOW_REL, gateFlowYaml().replace("title: 垂直切片 gate 复核", "title: 垂直切片 gate 复核（候选已变）"));
  const h = await makeHarness({
    tag: "gate-routing-r6",
    root: temp.root,
    approval: true,
    decision: true,
    resolveRuntime: RESOLVE_RUNTIME,
    scriptForRole: () => [],
  });
  try {
    await poke(h);
    await h.waitFor(() => readGateRecord(temp.root).status === "returned-to-proof", 10000);
    const notices = await waitTasks(h, "convener", "[Gate 退回·需重新请求]", 1);
    assert.ok(notices[0]!.includes("本次未向质检发送任务"), "R6 不向质检发送");
    assert.equal(tasksTo(h, "verifier", "[Gate 报告补正]").length, 0);
    const routing = await waitRouting(
      temp.root,
      (record) => (record.latestReturn as Record<string, unknown> | null)?.cause === "candidate-changed",
    );
    assert.equal(readGateRecord(temp.root).status, "returned-to-proof", "R6 保持 returned-to-proof");

    // 即便出现新版本 pass 报告，也不自动开启新一轮；等统筹重新请求。
    writeReport(temp.root, 2, validPassReport());
    await poke(h);
    await wait(600);
    assert.equal(readGateRecord(temp.root).status, "returned-to-proof", "R6 不因新报告自动放行");
    assert.equal(tasksTo(h, "convener", "[Gate 通过]").length, 0);
    assert.equal(tasksTo(h, "convener", "[Gate 退回·需重新请求]").length, 1, "通知不重复");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("S6-6 R7 历史退回：一次统筹 [Gate 退回·历史记录]，不重派质检；跨重启不重复", async () => {
  const temp = makeRoot("gate-routing-r7");
  await seedGateProject(temp.root);
  plantGateRecord(temp.root, {
    status: "returned-to-proof",
    error: "历史坏报告（实现前退回）",
    decidedAt: new Date().toISOString(),
  });
  const h1 = await makeHarness({
    tag: "gate-routing-r7-a",
    root: temp.root,
    approval: true,
    decision: true,
    resolveRuntime: RESOLVE_RUNTIME,
  });
  try {
    await poke(h1);
    const notices = await waitTasks(h1, "convener", "[Gate 退回·历史记录]", 1);
    assert.ok(notices[0]!.includes("历史坏报告（实现前退回）"), "附记录中的 error 摘要");
    assert.equal(tasksTo(h1, "verifier", "[Gate 报告补正]").length, 0, "不重派质检");
    assert.equal(readGateRecord(temp.root).status, "returned-to-proof", "不改 gate 记录");
    await poke(h1);
    await wait(500);
    assert.equal(tasksTo(h1, "convener", "[Gate 退回·历史记录]").length, 1, "同记录不重复提示");
  } finally {
    await h1.stop();
  }

  // 跨重启：新实例同一项目目录，legacy 标记已持久化 ⇒ 不再提示。
  const h2 = await makeHarness({
    tag: "gate-routing-r7-b",
    root: temp.root,
    approval: true,
    decision: true,
    resolveRuntime: RESOLVE_RUNTIME,
  });
  try {
    await poke(h2);
    await wait(800);
    assert.equal(tasksTo(h2, "convener", "[Gate 退回·历史记录]").length, 0, "跨重启不重复历史提示");
    assert.equal(readGateRecord(temp.root).status, "returned-to-proof");
  } finally {
    await h2.stop();
    h2.cleanup();
    temp.cleanup();
  }
});

test("S6-7 路由记录损坏：fail-closed 零发送、不改 gate 记录、主理如实可见", async () => {
  const temp = makeRoot("gate-routing-corrupt");
  await seedGateProject(temp.root);
  plantGateRecord(temp.root, { status: "returned-to-proof", error: "坏报告", decidedAt: new Date().toISOString() });
  writeReport(temp.root, 1, syntaxBadPassReport());
  write(temp.root, ROUTING_REL, "{ not-json");
  const h = await makeHarness({
    tag: "gate-routing-corrupt",
    root: temp.root,
    approval: true,
    decision: true,
    resolveRuntime: RESOLVE_RUNTIME,
  });
  try {
    await poke(h);
    await h.waitFor(
      () =>
        [...deliveryNotes(h, "convener"), ...deliveryNotes(h, "chief")].some(
          (note) => note.includes("路由记录损坏") && note.includes("fail-closed"),
        ),
      10000,
    );
    assert.equal(readGateRecord(temp.root).status, "returned-to-proof", "不改 gate 记录");
    assert.equal(tasksTo(h, "verifier", "[Gate 报告补正]").length, 0, "零发送（质检）");
    assert.equal(tasksTo(h, "convener", "[Gate ").length, 0, "零发送（统筹）");
    const ledger = await readGovernanceLedger(temp.root);
    assert.equal(ledger.entries.some((entry) => entry.kind === "gate.review"), false);
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("S6-8 部分失败只重试失败方；R8 连续 3 轮报告侧退回后停止自动补正并转人工", async () => {
  const temp = makeRoot("gate-routing-partial-exhaust");
  await seedGateProject(temp.root);
  plantGateRecord(temp.root, { status: "dispatched" });
  writeReport(temp.root, 1, syntaxBadPassReport());
  const failOpen = new Set<string>(["verifier"]);
  const h = await makeHarness({
    tag: "gate-routing-partial-exhaust",
    root: temp.root,
    approval: true,
    decision: true,
    resolveRuntime: RESOLVE_RUNTIME,
    failOpenRoles: failOpen,
    scriptForRole: () => [],
  });
  try {
    await poke(h);
    await h.waitFor(() => readGateRecord(temp.root).status === "returned-to-proof", 10000);
    await waitTasks(h, "convener", "[Gate 退回]", 1);
    assert.equal(tasksTo(h, "verifier", "[Gate 报告补正]").length, 0, "质检会话打开失败 ⇒ 本轮未送达");
    let routing = await waitRouting(
      temp.root,
      (record) =>
        returnDeliveries(record).length === 2 && returnDeliveries(record).every((delivery) => delivery.status !== "pending"),
    );
    let deliveries = returnDeliveries(routing);
    assert.equal(deliveries.find((d) => d.kind === "verifier-correction")?.status, "failed");
    assert.equal(deliveries.find((d) => d.kind === "convener-notice")?.status, "sent");

    // 解除故障 ⇒ 下一次扫描只重试失败的质检侧，统筹知情不重复。
    failOpen.delete("verifier");
    await poke(h);
    await waitTasks(h, "verifier", "[Gate 报告补正]", 1);
    await wait(400);
    assert.equal(tasksTo(h, "convener", "[Gate 退回]").length, 1, "已送达的统筹知情不重复");
    routing = await waitRouting(
      temp.root,
      (record) => returnDeliveries(record).find((delivery) => delivery.kind === "verifier-correction")?.status === "sent",
    );
    deliveries = returnDeliveries(routing);
    assert.equal(deliveries.find((d) => d.kind === "verifier-correction")?.status, "sent");

    // 第 2 轮退回（v2 仍坏）。
    writeReport(temp.root, 2, syntaxBadPassReport());
    await poke(h);
    await h.waitFor(() => readRouting(temp.root).consecutiveReturns === 2, 10000);
    await waitTasks(h, "convener", "[Gate 退回]", 2);
    await waitTasks(h, "verifier", "[Gate 报告补正]", 2);

    // 第 3 轮退回 ⇒ 达到 R8 上限：停止自动补正，转统筹人工。
    writeReport(temp.root, 3, syntaxBadPassReport());
    await poke(h);
    await waitTasks(h, "convener", "[Gate 退回·需人工]", 1);
    await waitRouting(temp.root, (record) => record.consecutiveReturns === 3);
    assert.equal(tasksTo(h, "verifier", "[Gate 报告补正]").length, 2, "耗尽后不再向质检发送补正");
    assert.equal(readGateRecord(temp.root).status, "returned-to-proof", "不自动通过");
    const humanTask = tasksTo(h, "convener", "[Gate 退回·需人工]")[0]!;
    assert.ok(humanTask.includes("3"), "人工提示给出轮次");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("S6-9 flow-busy 与退回/通过路由正交：在途工作 ⇒ 可重试 flow-busy，零 gate 记录/零路由；结束后重试正常派发", async () => {
  const temp = makeRoot("gate-routing-flow-busy");
  await seedGateProject(temp.root, { withBusyStep: true });
  let releaseExecutor: (() => void) | undefined;
  let executorStarted = false;
  const executorGate = new Promise<void>((resolve) => {
    releaseExecutor = resolve;
  });
  const h = await makeHarness({
    tag: "gate-routing-flow-busy",
    root: temp.root,
    approval: true,
    decision: true,
    resolveRuntime: RESOLVE_RUNTIME,
    forwardRequestGateReview: true,
    onPrompt: async (ctx) => {
      if (ctx.roleId === "executor") {
        executorStarted = true;
        await executorGate;
      }
    },
    scriptForRole: (ctx): ToolCall[] => {
      if (ctx.roleId !== "convener") return [];
      if (ctx.prompt.includes("派发 impl")) {
        return [{ name: "dispatch_task", args: { roleId: "executor", task: "实现 impl 步骤", flowId: FLOW, stepId: "impl" } }];
      }
      if (ctx.prompt.includes("请求 gate 复核")) {
        return [{ name: "request_gate_review", args: { flowId: FLOW, gateId: GATE_ID } }];
      }
      return [];
    },
  });
  try {
    await h.open("convener");
    await h.send("convener", "请派发 impl");
    await h.waitFor(() => executorStarted, 10000);
    const dispatchReceipt = h.results.find((result) => result.name === "dispatch_task");
    assert.ok(dispatchReceipt, "应有 dispatch_task 回执");
    assert.equal(dispatchReceipt!.ok, true, dispatchReceipt!.message);

    await h.send("convener", "请请求 gate 复核（在途）");
    await h.waitFor(() => tasksTo(h, "convener", "[Gate ").length === 0 && h.results.some((r) => r.name === "request_gate_review"), 10000);
    const busyReceipt = h.results.filter((result) => result.name === "request_gate_review").at(-1)!;
    assert.equal(busyReceipt.ok, false, "在途不派发");
    assert.match(busyReceipt.message, /flow-busy/, "回执含 flow-busy 码");
    assert.match(busyReceipt.message, /可重试|稍后重试/, "flow-busy 明确可重试");
    assert.equal(existsSync(path.join(temp.root, ...GATE_RECORD_REL.split("/"))), false, "flow-busy 不写 gate 记录");
    assert.equal(tasksTo(h, "verifier", "[Gate 复核]").length, 0, "flow-busy 不派 gate 复核任务");
    assert.equal(existsSync(path.join(temp.root, ...ROUTING_REL.split("/"))), false, "flow-busy 不写退回路由记录");

    // 在途结束（真实 settle）后重试 ⇒ 正常派发。
    releaseExecutor!();
    await wait(600);
    await h.send("convener", "请再次请求 gate 复核（在途结束）");
    await h.waitFor(() => existsSync(path.join(temp.root, ...GATE_RECORD_REL.split("/"))), 10000);
    assert.equal(readGateRecord(temp.root).status, "dispatched");
    await waitTasks(h, "verifier", "[Gate 复核]", 1);
    const retried = h.results.filter((result) => result.name === "request_gate_review").at(-1)!;
    assert.equal(retried.ok, true, retried.message);
    assert.match(retried.message, /gate 复核已派发/);
  } finally {
    releaseExecutor?.();
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("S6-10 通过转交去重（S4 恢复）：重启后 passed 记录不重复 [Gate 通过]、不重复 gate.review", async () => {
  const temp = makeRoot("gate-routing-restart");
  await seedGateProject(temp.root);
  plantGateRecord(temp.root, { status: "dispatched" });
  writeReport(temp.root, 1, validPassReport());
  const h1 = await makeHarness({
    tag: "gate-routing-restart-a",
    root: temp.root,
    approval: true,
    decision: true,
    resolveRuntime: RESOLVE_RUNTIME,
  });
  try {
    await poke(h1);
    await h1.waitFor(() => readGateRecord(temp.root).status === "passed", 15000);
    await waitTasks(h1, "convener", "[Gate 通过]", 1);
  } finally {
    await h1.stop();
  }

  const h2 = await makeHarness({
    tag: "gate-routing-restart-b",
    root: temp.root,
    approval: true,
    decision: true,
    resolveRuntime: RESOLVE_RUNTIME,
  });
  try {
    await poke(h2);
    await wait(800);
    assert.equal(tasksTo(h2, "convener", "[Gate 通过]").length, 0, "重启不重复通过转交");
    const ledger = await readGovernanceLedger(temp.root);
    assert.equal(ledger.entries.filter((entry) => entry.kind === "gate.review").length, 1, "重启不重复 gate.review");
    assert.equal(await flowStepStatus(temp.root, GATE_ID), "done");
  } finally {
    await h2.stop();
    h2.cleanup();
    temp.cleanup();
  }
});
