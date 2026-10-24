// test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts
// 2026-10-23 S7 集成/回归（团队计划 §3.6 / §4.1 S7；验收标准 P1–P9 的 e2e 面；方案 v1 §5.3–§5.8、§8.2）：
// **验收返工自动路由与 rejected 重新派发**的独立端到端链路。
//
// 覆盖（客户已确认 Q1–Q13 A；O1–O4 不做）：
//   · 客户 reject（真实验收卡 + 客户通道）→ 路由 Lead / 主理（报告 + acceptance-rework/v1 items + 决定记录）
//     → 不派 Proof → `.ans/governance/acceptance/<flowId>/rework-routing.json` → rework 完成/flow 更新
//     → 发布版本（release: true）恰好一次重派 Proof → accepted 收口；重复触发/同内容不重派；无热循环。
//   · judge auto-rework（真实验收卡 + 真实判断 driver deny）→ 路由 Lead、无 customer.decision、
//     回执/系统行写「自动决策未通过/未完成」且不把 judge 退回写成客户拒绝。
//   · 报告缺段/坏段 → 「报告不完整」兜底、不生成 items、不建 flow 步骤、不解析自由文本。
//   · 未知 owner 逐项 blocked、有效项先行；verifier/convener 特殊归属；无可 supersede 旧步骤 fail-closed（Q5 A）。
//   · verification dispatched/delivered → app-only 重开为 pending（清旧证据、保留 dependsOn）后恰一次重派；
//     accepted 不重开、按 accepted 收口。
//   · legacy Markdown 保持旧行为（Q6 A）；routing record 幂等/重启去重/审计失败可见/发送失败 failed 后重试。
//
// 纪律：全部在系统临时根内；用真实产品面（openRoleSession / 桌面 createDesktopInterface / 客户通道 /
// 账本 / flow 工具）；不读真实 .env/凭据/在线模型；不写目标项目；不覆盖既有用例。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { existsSync, readFileSync, utimesSync } from "node:fs";

import {
  FLOW,
  FLOW_REL,
  PROPOSAL_REL,
  REPORT_REL,
  exists,
  flowDoc,
  makeHarness,
  makeRoot,
  proposalDoc,
  read,
  seedAcceptanceArtifacts,
  seedConfirmedIntent,
  seedLedger,
  seedTrioProject,
  sha256,
  write,
  type FlowDocStep,
  type Harness,
} from "./fixture.ts";
import {
  appendGovernanceLedger,
  readGovernanceLedger,
  type GovernanceLedgerEntry,
} from "../../../src/common/编排/governance-ledger.ts";
import { parseFlowStateYaml } from "../../../src/pipeline/orchestration/flow-state.ts";
import type { DesktopDeps } from "../../../app/desktop/interface.ts";

// —————————————————————— 夹具（本文件私有；不 import 实施方测试） ——————————————————————

const ACCEPTANCE_CARD = {
  name: "request_choice",
  toolCallId: "tc-acceptance-rework",
  args: {
    title: `验收 ${FLOW}`,
    question: "是否验收通过？",
    flowId: FLOW,
    cardKind: "acceptance",
    options: [
      { id: "accept", label: "通过" },
      { id: "reject", label: "不通过" },
    ],
  },
};

const ROUTING_RECORD_REL = `.ans/governance/acceptance/${FLOW}/rework-routing.json`;

/** 固定引擎解析（返工路由/重派需要确定性 runtime；不触真实凭据）。 */
const RESOLVE_RUNTIME: DesktopDeps["resolveRuntimeFn"] = async () => ({
  ok: true,
  runtime: "claude",
  source: "credentials",
  skipped: [],
});

interface ReworkItem {
  id: string;
  owner: string;
  action: string;
  evidence?: string | string[];
}

/** 验收报告：首行五项 + 结论 + **恰好一个** fenced `acceptance-rework/v1` 段。 */
function reworkReport(items: readonly ReworkItem[], options: { conclusion?: string } = {}): string {
  const lines = [
    "风险档位：T1｜判定依据：夹具｜选定检查：夹具｜复用证据：无｜全量回归：已执行",
    "",
    `# 验收报告 ${FLOW}`,
    "",
    "## 结论",
    options.conclusion ?? "不通过。",
    "",
    "## 结构化返工段",
    "```yaml",
    "schema: acceptance-rework/v1",
    "coordinator: convener",
    "items:",
  ];
  for (const item of items) {
    lines.push(`  - id: ${item.id}`, `    owner: ${item.owner}`, `    action: ${item.action}`);
    if (typeof item.evidence === "string") {
      lines.push(`    evidence: ${item.evidence}`);
    } else if (Array.isArray(item.evidence)) {
      lines.push("    evidence:");
      for (const entry of item.evidence) lines.push(`      - ${entry}`);
    }
  }
  lines.push("```", "");
  return lines.join("\n");
}

/** 目标项目形态：只有人读 §8 表 / §9.1 编号列表，**没有**机器可读段（不得被解析）。 */
function plainReportWithTables(): string {
  return [
    "风险档位：T1｜判定依据：夹具｜选定检查：夹具｜复用证据：无｜全量回归：已执行",
    "",
    `# 验收报告 ${FLOW}`,
    "",
    "## 结论",
    "不通过。",
    "",
    "## 8 偏差、缺口与处置",
    "| 编号 | 问题 | 建议处置（owner） |",
    "| --- | --- | --- |",
    "| F1 | 交付缺少证据 | 修复（executor） |",
    "",
    "## 9.1 退回项与建议归属",
    "1. F2 补测试（executor）",
    "",
  ].join("\n");
}

/** 坏段：未知字段（整段不采信）。 */
function invalidReport(): string {
  return [
    "风险档位：T1｜判定依据：夹具｜选定检查：夹具｜复用证据：无｜全量回归：已执行",
    "",
    `# 验收报告 ${FLOW}`,
    "",
    "```yaml",
    "schema: acceptance-rework/v1",
    "items:",
    "  - id: F1",
    "    owner: executor",
    "    action: 修复",
    "    bogus: true",
    "```",
    "",
  ].join("\n");
}

function acceptanceFlowYaml(
  flowId = FLOW,
  steps: readonly { id: string; status: string; kind?: string; evidence?: { kind: string; ref: string }; dependsOn?: string[] }[],
  options: { release?: boolean } = {},
): string {
  const lines = [
    `flowId: ${flowId}`,
    "version: 1",
    "qualityTier: production",
    ...(options.release === true ? ["release: true"] : []),
    "steps:",
  ];
  for (const step of steps) {
    const kind = step.kind ?? (step.id === "verification" || step.id === "acceptance" ? "acceptance" : "dispatch");
    lines.push(
      `  - id: ${step.id}`,
      `    title: ${step.id}`,
      `    owner: ${kind === "acceptance" ? "verifier" : "executor"}`,
      `    kind: ${kind}`,
      `    status: ${step.status}`,
    );
    if (step.dependsOn !== undefined) lines.push(`    dependsOn: [${step.dependsOn.join(", ")}]`);
    if (step.evidence !== undefined) {
      lines.push("    evidence:", `      kind: ${step.evidence.kind}`, `      ref: ${step.evidence.ref}`);
    }
  }
  return lines.join("\n") + "\n";
}

function flowFilePath(root: string, flowId = FLOW): string {
  return path.join(root, "docs", "flows", `${flowId}.yaml`);
}

/** 写 flow YAML（可选把 mtime 落到给定时刻；`release: true` = 发布版本，缺省 = 非发布）。 */
function writeFlowState(
  root: string,
  steps: readonly FlowDocStep[] | readonly { id: string; status: string; kind?: string; evidence?: { kind: string; ref: string }; dependsOn?: string[] }[],
  options: { mtime?: Date; release?: boolean } = {},
): string {
  const text =
    steps.length > 0 && "evidence" in steps[0]!
      ? acceptanceFlowYaml(
          FLOW,
          steps as readonly { id: string; status: string; kind?: string; evidence?: { kind: string; ref: string }; dependsOn?: string[] }[],
          options,
        )
      : flowDoc(FLOW, [...(steps as readonly FlowDocStep[])], { ...(options.release !== undefined ? { release: options.release } : {}) });
  write(root, FLOW_REL, text);
  if (options.mtime !== undefined) utimesSync(flowFilePath(root), options.mtime, options.mtime);
  return text;
}

function flowSha(root: string): string {
  return sha256(read(root, FLOW_REL));
}

function parseFlow(root: string, flowId = FLOW) {
  const parsed = parseFlowStateYaml(read(root, FLOW_REL), flowId);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  if (!parsed.ok) throw new Error("flow 不可解析");
  return parsed.flow;
}

function routingRecord(root: string): Record<string, unknown> | undefined {
  const file = path.join(root, ...ROUTING_RECORD_REL.split("/"));
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
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

/** 投给 Lead 的返工任务（区别于 Proof settle 的「状态+指针」治理反馈任务）。 */
function reworkPrompts(h: Harness, roleId = "liaison"): string[] {
  return (h.prompts.get(roleId) ?? []).filter((prompt) => prompt.includes("验收未通过"));
}

async function appendEntries(root: string, entries: readonly Partial<GovernanceLedgerEntry>[]): Promise<void> {
  for (const partial of entries) {
    const entry: GovernanceLedgerEntry = {
      at: new Date().toISOString(),
      kind: "customer.decision",
      actorRoleId: "rapporteur",
      power: "proposal",
      flowId: FLOW,
      ...partial,
    };
    const appended = await appendGovernanceLedger(root, entry);
    assert.equal(appended.ok, true, appended.ok ? "" : appended.message);
  }
}

function rejectionEntry(at: string): Partial<GovernanceLedgerEntry> {
  return {
    at,
    kind: "customer.decision",
    flowId: FLOW,
    actorRoleId: "verifier",
    power: "acceptance",
    decisionKind: "acceptance",
    customerDecision: "rejected",
    decisionEvidence: { kind: "customer-input" },
  };
}

function acceptedEntry(at: string): Partial<GovernanceLedgerEntry> {
  return {
    at,
    kind: "customer.decision",
    flowId: FLOW,
    actorRoleId: "verifier",
    power: "acceptance",
    decisionKind: "acceptance",
    customerDecision: "accepted",
    decisionEvidence: { kind: "customer-input" },
  };
}

const ACCEPTED_PROPOSAL: Partial<GovernanceLedgerEntry> = {
  kind: "customer.decision",
  decisionKind: "proposal-accept",
  customerDecision: "accepted",
  actorRoleId: "rapporteur",
  power: "proposal",
  decisionEvidence: { kind: "customer-input" },
};

function dispatchEntry(stepId: string, targetRoleId = "executor"): Partial<GovernanceLedgerEntry> {
  return {
    kind: "dispatch.accepted",
    actorRoleId: "convener",
    power: "schedule",
    stepId,
    targetRoleId,
  };
}

/** 基础项目：flow（impl done + verification pending）、T1 验收三件套、结构化报告。 */
function seedBase(root: string, options: { flowMtime?: Date; report?: string; release?: boolean } = {}): void {
  seedTrioProject(root, ["executor"]);
  write(root, PROPOSAL_REL, proposalDoc(FLOW));
  writeFlowState(root, [{ id: "impl", status: "done" }, { id: "verification", status: "pending" }], {
    ...(options.flowMtime !== undefined ? { mtime: options.flowMtime } : {}),
    ...(options.release !== undefined ? { release: options.release } : {}),
  });
  seedAcceptanceArtifacts(root, FLOW, "T1");
  write(
    root,
    REPORT_REL,
    options.report ??
      reworkReport([{ id: "F1", owner: "executor", action: "修复交付并补证据", evidence: "docs/verification/f1.log" }]),
  );
}

function verificationDispatchCount(root: string): Promise<number> {
  return readGovernanceLedger(root).then(
    (ledger) =>
      ledger.entries.filter(
        (entry) =>
          entry.kind === "dispatch.accepted" &&
          entry.flowId === FLOW &&
          entry.stepId === "verification" &&
          entry.targetRoleId === "verifier",
      ).length,
  );
}

function acceptanceDecisionCount(root: string): Promise<number> {
  return readGovernanceLedger(root).then(
    (ledger) =>
      ledger.entries.filter(
        (entry) => entry.kind === "customer.decision" && entry.flowId === FLOW && entry.decisionKind === "acceptance",
      ).length,
  );
}

async function waitForRecordStatus(root: string, status: string, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  for (;;) {
    const record = routingRecord(root);
    if (record?.status === status) return;
    if (Date.now() - started > timeoutMs) throw new Error(`等待 routing record status=${status} 超时（当前 ${String(record?.status)}）`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForAsync(check: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - started > timeoutMs) throw new Error("等待异步条件超时");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForFlow(predicate: (flow: ReturnType<typeof parseFlow>, text: string) => boolean, root: string, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      const text = read(root, FLOW_REL);
      if (predicate(parseFlow(root), text)) return;
    } catch {
      /* 文件写入竞态：继续等 */
    }
    if (Date.now() - started > timeoutMs) throw new Error("等待 flow 条件超时");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function harnessOptions(tag: string, root: string, extra: Record<string, unknown> = {}) {
  return {
    tag,
    root,
    resolveRuntime: RESOLVE_RUNTIME,
    ...extra,
  } as Parameters<typeof makeHarness>[0];
}

// —————————————————————— S7-A 客户 reject 全链路 ——————————————————————

test("S7-A 客户 reject 全链路：路由 Lead（报告+清单+决定）→ 零 Proof 返工 → rework/flow 更新 → 恰一次重派（发布版本）→ accepted 收口；重复/同内容不重派", async () => {
  const temp = makeRoot("s7-rework-customer-chain");
  const root = temp.root;
  try {
    // 2026-10-24 P0-1：发布版本（flow.release: true）才在返工后自动重派 Proof；非发布见 S7-B 的等待断言。
    seedBase(root, { release: true });
    await seedLedger(root, [ACCEPTED_PROPOSAL, dispatchEntry("impl")]);
    await seedConfirmedIntent(root);
    const h = await makeHarness(
      harnessOptions("s7-rework-customer-chain", root, {
        decision: false,
        scriptForRole: (ctx: { roleId: string; prompt: string }) =>
          ctx.roleId === "verifier" && ctx.prompt.includes("请请客户验收") ? [ACCEPTANCE_CARD] : [],
      }),
    );
    try {
      // 发布版本在导入/启动补齐时会先自动派一条 verifier 复核任务（P0-1 正路径）；先等它落账本，
      // 再捕获 reject 后的基线，避免并行套件负载下把这条启动派发误算成「返工派发」。
      await waitForAsync(async () => (await verificationDispatchCount(root)) >= 1, 8000);
      await h.open("verifier");
      // decision 关：验收卡要等客户作答才结算——不能阻塞等待 send 完成后再作答。
      const sending = h.send("verifier", "请请客户验收。");
      await h.waitFor(() => h.presented.some((entry) => entry.request.cardKind === "acceptance"));
      const card = h.presented.find((entry) => entry.request.cardKind === "acceptance")!;
      h.answer(card.id, { kind: "choice", selected: ["reject"] });
      const sent = await sending;
      assert.equal(sent.ok, true, sent.error ?? "");

      const afterReject = await h.waitForLedger((entries) =>
        entries.some(
          (entry) =>
            entry.kind === "customer.decision" &&
            entry.flowId === FLOW &&
            entry.decisionKind === "acceptance" &&
            entry.customerDecision === "rejected",
        ),
      );
      const rejection = afterReject.entries.find(
        (entry) => entry.kind === "customer.decision" && entry.decisionKind === "acceptance",
      )!;
      assert.equal(rejection.decisionEvidence?.kind, "customer-input", "客户手拒写 customer-input 证据");

      const verifierPromptsAtReject = h.prompts.get("verifier")?.length ?? 0;
      const decisionsAtReject = await acceptanceDecisionCount(root);

      await h.waitFor(() => reworkPrompts(h).length > 0, 8000);
      const task = reworkPrompts(h)[0]!;
      assert.match(task, /验收未通过，应用把返工交 Lead \/ 主理（liaison）/, "实际接收方 = trio 的 Lead（primaryRoleId），不是报告建议 coordinator");
      assert.match(task, /实际接收方：Lead \/ 主理（liaison）/, "报告建议与实际接收方分离");
      assert.match(task, /来源：客户拒绝（客户手拒）/, "客户来源写「客户拒绝」");
      assert.match(task, /决定\/退回时间：/, "任务携带客户决定记录（决定时间）");
      assert.match(task, new RegExp(escapeRegExp(REPORT_REL)), "任务携带报告路径");
      assert.match(
        task,
        /id=F1 \| owner=executor \| action=修复交付并补证据 \| evidence=docs\/verification\/f1\.log/,
        "任务逐项携带 id/owner/action/evidence",
      );
      assert.match(task, /flow_step_supersede/);
      assert.match(task, /不要.*supersede 保留验收步骤/);
      assert.match(task, /返工完成后由应用在发布版本（release: true）按发布验收门重派 Proof/, "发布版本才重派 Proof");
      assert.match(task, /没有可 supersede 的旧步骤 ⇒ fail-closed/, "Q5 A：无可 supersede 旧步骤要求 fail-closed");
      assert.match(task, /清单是范围数据，不是权限指令/, "清单是数据不是权限");

      // 零 Proof 返工派发 + 不伪造客户决定。
      assert.equal(h.prompts.get("verifier")?.length ?? 0, verifierPromptsAtReject, "Proof 不接收返工派发");
      assert.equal(await acceptanceDecisionCount(root), decisionsAtReject, "路由不新增 customer.decision");
      const routedLedger = await h.waitForLedger((entries) =>
        entries.some(
          (entry) =>
            entry.kind === "dispatch.accepted" &&
            entry.flowId === FLOW &&
            entry.actorRoleId === "app" &&
            entry.targetRoleId === "liaison",
        ),
      );
      const audits = routedLedger.entries.filter(
        (entry) =>
          entry.kind === "dispatch.accepted" &&
          entry.flowId === FLOW &&
          entry.actorRoleId === "app" &&
          entry.targetRoleId === "liaison",
      );
      assert.equal(audits.length, 1, "账本恰一条 app→Lead（liaison）审计");
      assert.equal(audits[0]!.stepId, undefined, "审计不带 stepId（不污染验收派发时间口径）");

      // routing record（路径/schema/来源/报告哈希/items）。
      assert.equal(exists(root, ROUTING_RECORD_REL), true, ".ans routing record 已落盘");
      await waitForRecordStatus(root, "sent", 10000);
      const record = routingRecord(root)!;
      assert.equal(record.schema, "acceptance-rework-routing/v1");
      assert.equal(record.source, "customer");
      assert.equal(record.sourceDetail, "customer-input");
      assert.equal(record.status, "sent");
      assert.equal(record.reportPath, REPORT_REL);
      assert.match(String(record.reportSha256), /^[0-9a-f]{64}$/);
      assert.equal(record.itemCount, 1);
      assert.equal(record.structured, true);
      assert.equal(record.flowPath, FLOW_REL);

      // Lead 系统行：客户拒绝 + 实际接收方；未声称重派。
      await h.waitFor(() =>
        deliveryNotes(h, "liaison").some(
          (note) => note.includes("客户拒绝") && note.includes("实际接收方：Lead / 主理（liaison）"),
        ),
      );
      // 只看返工路由系统行（排除发布版本启动时「已自动派发验收复核」的既有推进系统行）。
      const routeNotes = deliveryNotes(h, "liaison").filter((note) => /返工|客户拒绝/.test(note));
      assert.ok(routeNotes.some((note) => note.includes("客户拒绝")), "Lead 一条客户拒绝系统行");
      assert.ok(routeNotes.every((note) => !note.includes("已自动派发验收复核")), "返工路由未重派 Proof");

      // 重复触发（import）：同决定/同报告 ⇒ 不重复任务/系统行、不重派。
      await h.iface.listProject({ projectRoot: root });
      await new Promise((resolve) => setTimeout(resolve, 350));
      assert.equal(reworkPrompts(h).length, 1, "同一决定/报告不重复路由");
      assert.equal(
        deliveryNotes(h, "liaison").filter((note) => note.includes("客户拒绝")).length,
        1,
        "不重复客户拒绝系统行",
      );
      assert.equal(h.prompts.get("verifier")?.length ?? 0, verifierPromptsAtReject, "无进展仍不派 Proof");

      // rework 完成：flow 有实质更新（新 rework-f1 done + 新内容/新 mtime）+ 账本 dispatch 证据。
      const verifierDispatchesBefore = await verificationDispatchCount(root);
      const future = new Date(Date.now() + 2000);
      await appendEntries(root, [dispatchEntry("rework-f1")]);
      const updatedText = writeFlowState(
        root,
        [
          { id: "impl", status: "done" },
          { id: "rework-f1", status: "done" },
          { id: "verification", status: "pending" },
        ],
        { mtime: future, release: true },
      );
      await h.iface.listProject({ projectRoot: root });
      await h.waitFor(() => (h.prompts.get("verifier")?.length ?? 0) > verifierPromptsAtReject, 8000);
      const redispatchSends = h.prompts.get("verifier")!.slice(verifierPromptsAtReject);
      assert.equal(redispatchSends.length, 1, "rework 后恰好重派一次 Proof");
      const redispatchTask = redispatchSends[0]!;
      assert.match(redispatchTask, /流程在上次验收复核后有更新/);
      assert.match(redispatchTask, new RegExp(`docs/acceptance/${FLOW}-report-v2\\.md`), "重派要求写 vN+1");
      assert.ok(redispatchTask.includes(REPORT_REL), "重派任务引用被拒报告（不覆盖）");
      assert.match(redispatchTask, /acceptance-rework\/v1/, "重派任务含结构化返工段硬要求");
      assert.match(redispatchTask, /不要覆盖被拒报告/);

      const started = Date.now();
      while ((await verificationDispatchCount(root)) < verifierDispatchesBefore + 1) {
        if (Date.now() - started > 5000) throw new Error("等待账本 verification 派发超时");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(await verificationDispatchCount(root), verifierDispatchesBefore + 1, "账本恰一条新 verification 派发");

      // record 记录已派 flow 内容；再触发同内容不重派（防 mtime 抖动/热循环）。
      const startedRecord = Date.now();
      while (routingRecord(root)?.lastDispatchedFlowSha256 !== sha256(updatedText)) {
        if (Date.now() - startedRecord > 5000) throw new Error("等待 record lastDispatchedFlowSha256 超时");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(typeof routingRecord(root)!.lastDispatchedAt, "string");
      await h.iface.listProject({ projectRoot: root });
      await new Promise((resolve) => setTimeout(resolve, 350));
      assert.equal(h.prompts.get("verifier")!.length, verifierPromptsAtReject + 1, "同内容不重派");

      // accepted 收口：最新 accepted ⇒ verification done + acceptance 证据；不路由/不重派。
      const verifierPromptsBeforeAccept = h.prompts.get("verifier")!.length;
      await appendEntries(root, [acceptedEntry(new Date().toISOString())]);
      await h.iface.listProject({ projectRoot: root });
      await waitForFlow((flow) => flow.steps.some((step) => step.kind === "acceptance" && step.status === "done"), root);
      const closed = parseFlow(root).steps.find((step) => step.kind === "acceptance")!;
      assert.equal(closed.status, "done");
      assert.deepEqual(closed.evidence, { kind: "acceptance", ref: "acceptance" });
      assert.equal(h.prompts.get("verifier")!.length, verifierPromptsBeforeAccept, "accepted 不重派");
      assert.equal(reworkPrompts(h).length, 1, "accepted 不再路由");
    } finally {
      await h.stop();
    }
  } finally {
    temp.cleanup();
  }
});

// —————————————————————— S7-B 无进展不重派 ——————————————————————

test("S7-B 客户 reject 后无 flow 进展 ⇒ 非发布不重派 Proof（等待发布验收系统行）；重复事件仍只一条路由、零热循环", async () => {
  const temp = makeRoot("s7-rework-no-progress");
  const root = temp.root;
  try {
    seedBase(root);
    // flow 先写，rejection 决定在其后（mtime <= decisionAt）⇒ 无进展。
    await seedLedger(root, [ACCEPTED_PROPOSAL, dispatchEntry("impl"), rejectionEntry(new Date().toISOString())]);
    const h = await makeHarness(harnessOptions("s7-rework-no-progress", root));
    try {
      await h.waitFor(() => (h.prompts.get("liaison")?.length ?? 0) > 0, 8000);
      await h.waitFor(() =>
        deliveryNotes(h, "liaison").some((note) =>
          /flow\.release 未标记为 true（非发布）⇒ 不自动重派 Proof/.test(note),
        ),
      );
      assert.equal(h.prompts.get("verifier")?.length ?? 0, 0, "非发布：不派 Proof");
      assert.equal(await verificationDispatchCount(root), 0);
      assert.equal(routingRecord(root)?.status, "sent");

      await h.iface.listProject({ projectRoot: root });
      await new Promise((resolve) => setTimeout(resolve, 350));
      assert.equal(h.prompts.get("liaison")!.length, 1, "重复 import 不重复路由");
      assert.equal(
        deliveryNotes(h, "liaison").filter((note) => /flow\.release 未标记为 true（非发布）⇒ 不自动重派 Proof/.test(note)).length,
        1,
        "等待发布验收系统行去重",
      );
      assert.equal(h.prompts.get("verifier")?.length ?? 0, 0, "仍不派 Proof");
    } finally {
      await h.stop();
    }
  } finally {
    temp.cleanup();
  }
});

// —————————————————————— S7-C judge auto-rework ——————————————————————

test("S7-C judge auto-rework（真实卡 + 判断未完成）：路由 Lead、自动决策系统行/回执不写「客户拒绝」、零 customer.decision、零 Proof 返工；flow 更新后恰一次重派（发布版本）", async () => {
  const temp = makeRoot("s7-rework-judge");
  const root = temp.root;
  try {
    // 发布版本：返工后自动重派 Proof 只在 release: true 时发生（P0-1）。
    seedBase(root, { release: true });
    await seedLedger(root, [ACCEPTED_PROPOSAL, dispatchEntry("impl")]);
    await seedConfirmedIntent(root);
    const h = await makeHarness(
      harnessOptions("s7-rework-judge", root, {
        decision: true,
        wireAutoRework: true,
        judge: {
          // decision 组不得由判断 agent deny（driver 会回落 manual）；用 allowlist 内的
          // manual 原因码（not-recommended）走真实通道 → onAutoRework → 桌面路由。
          reportFor: (parsed: { group: string; cardKind: string }) => ({
            verdict: "manual",
            group: parsed.group,
            cardKind: parsed.cardKind,
            reasonCode: "not-recommended",
            reason: "自动判断未完成：夹具证据不足。",
            evidence: ["应用事实：离线判断夹具"],
          }),
        },
        scriptForRole: (ctx: { roleId: string; prompt: string }) =>
          ctx.roleId === "verifier" && ctx.prompt.includes("请请客户验收") ? [ACCEPTANCE_CARD] : [],
      }),
    );
    try {
      await h.open("verifier");
      // 导入补齐检查会先自动派一条 verifier 复核任务（既有行为）；等它落账本，便于后面对照「零返工派发」。
      await waitForAsync(async () => (await verificationDispatchCount(root)) >= 1, 8000);
      const sent = await h.send("verifier", "请请客户验收。");
      assert.equal(sent.ok, true, sent.error ?? "");
      await h.waitFor(() => h.results.some((entry) => entry.name === "request_choice" && entry.roleId === "verifier"));
      const receipt = h.results.find((entry) => entry.name === "request_choice")!;
      assert.equal(receipt.ok, false, "judge 未通过 ⇒ 回执拒绝");
      assert.match(receipt.message, /自动决策未通过\/未完成/, "judge 回执写自动决策");
      assert.match(receipt.message, /这不是客户拒绝/, "judge 回执显式否定客户拒绝");
      assert.match(receipt.message, /Convener|统筹/, "回执说明接收方");
      assert.match(receipt.message, /重新提交验收/, "回执给出返工后重新提交指引");
      const receiptWithoutNegation = receipt.message.replaceAll("这不是客户拒绝", "");
      assert.doesNotMatch(receiptWithoutNegation, /客户拒绝/, "judge 回执不得正向写成客户拒绝");
      assert.equal(h.presented.length, 0, "judge 自动退回不呈现客户卡");
      assert.equal(h.judgeRows.length, 0, "manual/deny 不产生 approve 结果行");

      const decisionsBefore = await acceptanceDecisionCount(root);
      const verifierPromptsBeforeRoute = h.prompts.get("verifier")?.length ?? 0;
      await h.waitFor(() => reworkPrompts(h).length > 0, 8000);
      const task = reworkPrompts(h)[0]!;
      assert.match(task, /来源：自动决策未完成（自动退回）/, "judge 来源任务措辞");
      assert.doesNotMatch(task, /客户拒绝/, "judge 来源任务不得出现「客户拒绝」");
      assert.match(task, /原因码：not-recommended/, "任务携带判断原因码");
      assert.match(task, /验收未通过，应用把返工交 Lead \/ 主理（liaison）/, "实际接收方 = Lead");
      await h.waitFor(() => deliveryNotes(h, "liaison").some((note) => note.includes("自动决策未通过/未完成")));
      const judgeNotes = deliveryNotes(h, "liaison");
      assert.ok(
        judgeNotes.some((note) => note.includes("实际接收方：Lead / 主理（liaison）")),
        "系统行写明实际接收方",
      );
      assert.ok(judgeNotes.every((note) => !note.includes("客户拒绝")), "judge 来源系统行不得出现「客户拒绝」");
      assert.equal(await acceptanceDecisionCount(root), decisionsBefore, "judge auto-rework 不写 customer.decision");
      assert.equal(h.prompts.get("verifier")?.length ?? 0, verifierPromptsBeforeRoute, "Proof 零返工派发");
      assert.equal(await verificationDispatchCount(root), 1, "仅导入时既有 verification 派发");

      await waitForRecordStatus(root, "sent", 10000);
      const record = routingRecord(root)!;
      assert.equal(record.source, "judge");
      assert.equal(record.sourceDetail, "judge-manual");
      assert.equal(record.status, "sent");
      assert.equal(record.structured, true);

      // 路由后 flow 更新 ⇒ 重派恰一次。
      await appendEntries(root, [dispatchEntry("rework-f2")]);
      writeFlowState(
        root,
        [
          { id: "impl", status: "done" },
          { id: "rework-f2", status: "done" },
          { id: "verification", status: "pending" },
        ],
        { mtime: new Date(Date.now() + 2000), release: true },
      );
      await h.iface.listProject({ projectRoot: root });
      await h.waitFor(() => (h.prompts.get("verifier")?.length ?? 0) > verifierPromptsBeforeRoute, 8000);
      await waitForAsync(async () => (await verificationDispatchCount(root)) === 2);
      assert.equal(h.prompts.get("verifier")!.length, verifierPromptsBeforeRoute + 1, "flow 更新后恰一次重派");
      assert.equal(await verificationDispatchCount(root), 2);
      assert.match(h.prompts.get("verifier")![verifierPromptsBeforeRoute]!, /流程在上次验收复核后有更新/);
      await h.iface.listProject({ projectRoot: root });
      await new Promise((resolve) => setTimeout(resolve, 350));
      assert.equal(h.prompts.get("verifier")!.length, verifierPromptsBeforeRoute + 1, "同内容不再重派");
    } finally {
      await h.stop();
    }
  } finally {
    temp.cleanup();
  }
});

// —————————————————————— S7-D 报告缺段/坏段兜底 ——————————————————————

test("S7-D 报告缺段/坏段：只发「报告不完整」任务（无 items、不建 flow 步骤、不解析自由文本）；不伪造决定", async () => {
  const missingTemp = makeRoot("s7-rework-report-missing");
  const invalidTemp = makeRoot("s7-rework-report-invalid");
  try {
    // ① 缺段：目标项目形态（§8 表 / §9.1 列表）也不得被解析。
    seedBase(missingTemp.root, { report: plainReportWithTables() });
    await seedLedger(missingTemp.root, [ACCEPTED_PROPOSAL, dispatchEntry("impl"), rejectionEntry(new Date().toISOString())]);
    const missing = await makeHarness(harnessOptions("s7-rework-report-missing", missingTemp.root));
    try {
      const flowBefore = read(missing.root, FLOW_REL);
      await missing.waitFor(() => (missing.prompts.get("liaison")?.length ?? 0) > 0, 8000);
      await missing.waitFor(() =>
        deliveryNotes(missing, "liaison").some((note) => note.includes("缺少可解析的 acceptance-rework/v1")),
      );
      const task = missing.prompts.get("liaison")![0]!;
      assert.match(task, /结构化返工段缺失或不可解析/);
      assert.match(task, /未生成返工项、未创建流程步骤/);
      assert.doesNotMatch(task, /id=F1 \| owner/, "不解析 §8 表/编号列表生成 items");
      assert.match(task, /请阅读 .*report-v1\.md 的偏差\/缺口节/, "要求 Lead 读报告/补结构");
      assert.match(task, /实际接收方：Lead \/ 主理（liaison）/, "实际接收方 = Lead");
      const record = routingRecord(missing.root)!;
      assert.equal(record.structured, false);
      assert.equal(record.itemCount, 0);
      assert.equal(read(missing.root, FLOW_REL), flowBefore, "应用不创建 flow 步骤");
      assert.equal(missing.prompts.get("verifier")?.length ?? 0, 0, "不派 Proof");
      assert.equal(await acceptanceDecisionCount(missing.root), 1, "不伪造客户决定");
    } finally {
      await missing.stop();
    }

    // ② 坏段（未知字段）：整段不采信、错误具体可见。
    seedBase(invalidTemp.root, { report: invalidReport() });
    await seedLedger(invalidTemp.root, [ACCEPTED_PROPOSAL, dispatchEntry("impl"), rejectionEntry(new Date().toISOString())]);
    const invalid = await makeHarness(harnessOptions("s7-rework-report-invalid", invalidTemp.root));
    try {
      await invalid.waitFor(() => (invalid.prompts.get("liaison")?.length ?? 0) > 0, 8000);
      const task = invalid.prompts.get("liaison")![0]!;
      assert.match(task, /结构化返工段缺失或不可解析/);
      assert.match(task, /bogus/, "任务带具体错误 path/字段");
      assert.doesNotMatch(task, /id=F1 \| owner/, "坏段不部分采信");
      assert.equal(routingRecord(invalid.root)?.structured, false);
      assert.equal(routingRecord(invalid.root)?.itemCount, 0);
    } finally {
      await invalid.stop();
    }
  } finally {
    missingTemp.cleanup();
    invalidTemp.cleanup();
  }
});

// —————————————————————— S7-E owner 归属 ——————————————————————

test("S7-E owner 归属：未知/不可派发逐项 blocked、有效项先行；verifier=报告修正、convener=治理项，不向 Proof/内置角色派产品返工", async () => {
  const temp = makeRoot("s7-rework-owners");
  const root = temp.root;
  try {
    seedBase(root, {
      report: reworkReport([
        { id: "F1", owner: "executor", action: "有效项：修复交付" },
        { id: "F9", owner: "ghost-role", action: "未知 owner" },
        { id: "F10", owner: "verifier", action: "修正报告结构" },
        { id: "F11", owner: "convener", action: "更新变更包" },
        { id: "F12", owner: "app", action: "应用自己处理" },
      ]),
    });
    await seedLedger(root, [ACCEPTED_PROPOSAL, dispatchEntry("impl"), rejectionEntry(new Date().toISOString())]);
    const h = await makeHarness(harnessOptions("s7-rework-owners", root));
    try {
      await h.waitFor(() => (h.prompts.get("liaison")?.length ?? 0) > 0, 8000);
      const task = h.prompts.get("liaison")![0]!;
      assert.match(task, /可派发项（按 owner 分组/);
      assert.match(task, /owner=executor：F1（有效项：修复交付）/, "有效项先行");
      assert.match(task, /blocked 项/);
      assert.match(task, /id=F9 \| owner=ghost-role/, "未知 owner 逐项 blocked");
      assert.match(task, /id=F12 \| owner=app/, "app 不可派发");
      assert.match(task, /报告\/工具修正项（owner=verifier/);
      assert.match(task, /不要向 Proof 派产品返工/);
      assert.match(task, /治理文档\/变更包项/);
      assert.match(task, /不要向内置治理角色 dispatch_task/);
      assert.match(task, /实际接收方：Lead \/ 主理（liaison）/, "实际接收方 = Lead");
      assert.equal(h.prompts.get("verifier")?.length ?? 0, 0, "不向 Proof 派产品返工");
      assert.equal(h.prompts.get("liaison")!.length, 1, "Lead 恰一条");
      assert.equal(routingRecord(root)?.itemCount, 5);
      assert.equal(routingRecord(root)?.structured, true);
    } finally {
      await h.stop();
    }
  } finally {
    temp.cleanup();
  }
});

// —————————————————————— S7-F 无可 supersede 旧步骤 gap（Q5 A） ——————————————————————

test("S7-F 无可 supersede 旧步骤 gap（Q5 A）：任务要求 fail-closed，应用不凭空建步骤、flow 不变", async () => {
  const temp = makeRoot("s7-rework-gap");
  const root = temp.root;
  try {
    seedTrioProject(root, ["executor"]);
    // 只有保留验收步骤：executor 的 F-item 没有可 supersede 的旧活动步骤。
    writeFlowState(root, [{ id: "verification", status: "pending" }]);
    seedAcceptanceArtifacts(root, FLOW, "T1");
    write(root, REPORT_REL, reworkReport([{ id: "F1", owner: "executor", action: "新增交付项" }]));
    await seedLedger(root, [ACCEPTED_PROPOSAL, rejectionEntry(new Date().toISOString())]);
    const flowBefore = read(root, FLOW_REL);
    const h = await makeHarness(harnessOptions("s7-rework-gap", root));
    try {
      await h.waitFor(() => (h.prompts.get("liaison")?.length ?? 0) > 0, 8000);
      const task = h.prompts.get("liaison")![0]!;
      assert.match(task, /没有可 supersede 的旧步骤 ⇒ fail-closed/);
      assert.match(task, /记录 gap 并请 Lead\/Proof 补 flow 计划，不凭空造步骤/);
      assert.equal(read(root, FLOW_REL), flowBefore, "应用不创建/改写 flow 步骤（无 addFlowStep）");
      const flow = parseFlow(root);
      assert.deepEqual(flow.steps.map((step) => step.id), ["verification"], "不存在凭空新增的 rework-* 步骤");
      assert.equal(h.prompts.get("verifier")?.length ?? 0, 0);
    } finally {
      await h.stop();
    }
  } finally {
    temp.cleanup();
  }
});

// —————————————————————— S7-G verification dispatched/delivered 重开 ——————————————————————

test("S7-G verification dispatched/delivered：app-only 重开为 pending（清旧证据、保留 dependsOn）后恰一次重派 Proof（发布版本）", async () => {
  const dispatchedTemp = makeRoot("s7-rework-reopen-dispatched");
  const deliveredTemp = makeRoot("s7-rework-reopen-delivered");
  try {
    // ① dispatched：先重开，再按门重派（真实 Pipeline 出口；发布版本 release: true）。
    const past = new Date(Date.now() - 60_000).toISOString();
    seedTrioProject(dispatchedTemp.root, ["executor"]);
    seedAcceptanceArtifacts(dispatchedTemp.root, FLOW, "T1");
    write(
      dispatchedTemp.root,
      REPORT_REL,
      reworkReport([{ id: "F1", owner: "executor", action: "修复" }]),
    );
    await seedLedger(dispatchedTemp.root, [ACCEPTED_PROPOSAL, dispatchEntry("impl"), rejectionEntry(past)]);
    writeFlowState(
      dispatchedTemp.root,
      [
        { id: "impl", status: "done" },
        { id: "verification", status: "dispatched" },
      ],
      { mtime: new Date(), release: true },
    );
    const dispatched = await makeHarness(harnessOptions("s7-rework-reopen-dispatched", dispatchedTemp.root));
    try {
      await dispatched.waitFor(() => (dispatched.prompts.get("verifier")?.length ?? 0) > 0, 8000);
      await waitForAsync(async () => (await verificationDispatchCount(dispatched.root)) === 1);
      assert.equal(dispatched.prompts.get("verifier")!.length, 1, "重开成功后重派恰一次");
      const flow = parseFlow(dispatched.root).steps.find((step) => step.kind === "acceptance")!;
      assert.equal(flow.status, "pending", "dispatched 已重开为 pending");
      assert.equal(flow.evidence, undefined, "清空旧证据");
      assert.equal(await verificationDispatchCount(dispatched.root), 1);
      assert.equal(routingRecord(dispatched.root)?.status, "sent");
    } finally {
      await dispatched.stop();
    }

    // ② delivered + 旧 acceptance 证据 + dependsOn：重开清证据、保留 dependsOn、再重派。
    seedTrioProject(deliveredTemp.root, ["executor"]);
    seedAcceptanceArtifacts(deliveredTemp.root, FLOW, "T1");
    write(deliveredTemp.root, REPORT_REL, reworkReport([{ id: "F1", owner: "executor", action: "修复" }]));
    await seedLedger(deliveredTemp.root, [ACCEPTED_PROPOSAL, dispatchEntry("impl"), rejectionEntry(past)]);
    write(
      deliveredTemp.root,
      FLOW_REL,
      acceptanceFlowYaml(
        FLOW,
        [
          { id: "impl", status: "done", kind: "dispatch", evidence: { kind: "dispatch", ref: "impl" } },
          {
            id: "verification",
            status: "delivered",
            kind: "acceptance",
            dependsOn: ["impl"],
            evidence: { kind: "acceptance", ref: "acceptance" },
          },
        ],
        { release: true },
      ),
    );
    utimesSync(flowFilePath(deliveredTemp.root), new Date(), new Date());
    const delivered = await makeHarness(harnessOptions("s7-rework-reopen-delivered", deliveredTemp.root));
    try {
      await delivered.waitFor(() => (delivered.prompts.get("verifier")?.length ?? 0) > 0, 8000);
      await waitForAsync(async () => (await verificationDispatchCount(delivered.root)) === 1);
      assert.equal(delivered.prompts.get("verifier")!.length, 1, "delivered 重开后再派恰一次");
      const flow = parseFlow(delivered.root).steps.find((step) => step.kind === "acceptance")!;
      assert.equal(flow.status, "pending");
      assert.equal(flow.evidence, undefined, "清空旧 acceptance 证据（避免冒充新复核）");
      assert.deepEqual(flow.dependsOn, ["impl"], "保留 dependsOn");
      assert.equal(await verificationDispatchCount(delivered.root), 1);
    } finally {
      await delivered.stop();
    }
  } finally {
    dispatchedTemp.cleanup();
    deliveredTemp.cleanup();
  }
});

// —————————————————————— S7-H accepted 不重开/不收口回退 ——————————————————————

test("S7-H accepted 不重开：最新 accepted + verification dispatched ⇒ 按 accepted 收口（done + acceptance 证据）、不路由/不重派", async () => {
  const temp = makeRoot("s7-accepted-no-reopen");
  const root = temp.root;
  try {
    seedTrioProject(root, ["executor"]);
    seedAcceptanceArtifacts(root, FLOW, "T1");
    write(root, REPORT_REL, reworkReport([{ id: "F1", owner: "executor", action: "修复" }]));
    await seedLedger(root, [ACCEPTED_PROPOSAL, dispatchEntry("impl"), acceptedEntry(new Date().toISOString())]);
    writeFlowState(root, [
      { id: "impl", status: "done" },
      { id: "verification", status: "dispatched" },
    ]);
    const h = await makeHarness(harnessOptions("s7-accepted-no-reopen", root));
    try {
      await waitForFlow((flow) => flow.steps.some((step) => step.kind === "acceptance" && step.status === "done"), root);
      const step = parseFlow(root).steps.find((candidate) => candidate.kind === "acceptance")!;
      assert.equal(step.status, "done", "accepted ⇒ 收口为 done（不重开为 pending）");
      assert.deepEqual(step.evidence, { kind: "acceptance", ref: "acceptance" });
      assert.equal(routingRecord(root), undefined, "accepted 不写 routing record");
      assert.equal(h.prompts.get("liaison")?.length ?? 0, 0, "accepted 不路由 Lead");
      assert.equal(h.prompts.get("verifier")?.length ?? 0, 0, "accepted 不派 Proof");
    } finally {
      await h.stop();
    }
  } finally {
    temp.cleanup();
  }
});

// —————————————————————— S7-I legacy Markdown（Q6 A） ——————————————————————

function legacyFlowMarkdown(): string {
  return [
    "---",
    `flowId: ${FLOW}`,
    "---",
    "",
    "# 流程单",
    "",
    "| stepId | 步骤 | 状态 |",
    "| --- | --- | --- |",
    "| impl | 交付 | done |",
    "| verification | 验收 | pending |",
    "",
  ].join("\n");
}

test("S7-I legacy Markdown（Q6 A）：历史 rejected 保持旧行为（不路由/不重派/不写 record）；无决定且门通过按非发布停在发布验收前（不派 Proof）", async () => {
  const legacyTemp = makeRoot("s7-legacy-rejected");
  const readyTemp = makeRoot("s7-legacy-ready");
  try {
    // ① legacy Markdown + 历史 rejected ⇒ 旧终态（任意 acceptance 决定终结），不接返工路由。
    seedTrioProject(legacyTemp.root, ["executor"]);
    write(legacyTemp.root, `docs/flows/${FLOW}.md`, legacyFlowMarkdown());
    seedAcceptanceArtifacts(legacyTemp.root, FLOW, "T1");
    await seedLedger(legacyTemp.root, [ACCEPTED_PROPOSAL, dispatchEntry("impl"), rejectionEntry(new Date().toISOString())]);
    const legacy = await makeHarness(harnessOptions("s7-legacy-rejected", legacyTemp.root));
    try {
      await legacy.waitFor(() =>
        deliveryNotes(legacy, "liaison").some((note) => note.includes("该流程已有验收决定")),
      );
      assert.equal(legacy.prompts.get("liaison")?.length ?? 0, 0, "legacy 不路由 Lead");
      assert.equal(legacy.prompts.get("verifier")?.length ?? 0, 0, "legacy 不重派 Proof");
      assert.equal(exists(legacyTemp.root, ROUTING_RECORD_REL), false, "legacy 不写 routing record");
      assert.equal(exists(legacyTemp.root, FLOW_REL), false, "不重写/新增 YAML");
    } finally {
      await legacy.stop();
    }

    // ② legacy Markdown + 无 acceptance 决定 + 门通过 ⇒ 2026-10-24 P0-1：legacy 无 YAML/release
    //    视为非发布（awaiting-release-acceptance），不自动派 Proof；发布版本另由 YAML release: true 驱动。
    seedTrioProject(readyTemp.root, ["executor"]);
    write(readyTemp.root, `docs/flows/${FLOW}.md`, legacyFlowMarkdown());
    seedAcceptanceArtifacts(readyTemp.root, FLOW, "T1");
    await seedLedger(readyTemp.root, [ACCEPTED_PROPOSAL, dispatchEntry("impl")]);
    const ready = await makeHarness(harnessOptions("s7-legacy-ready", readyTemp.root));
    try {
      await ready.waitFor(() =>
        deliveryNotes(ready, "liaison").some(
          (note) => note.includes("legacy 流程无 flow YAML/release 标记（视为非发布）⇒ 停在发布验收前"),
        ),
      );
      assert.equal(ready.prompts.get("verifier")?.length ?? 0, 0, "legacy 非发布 ⇒ 不派 Proof");
      assert.equal(ready.prompts.get("liaison")?.length ?? 0, 0, "legacy 不向 Lead 发返工/协调任务");
      assert.equal(exists(readyTemp.root, ROUTING_RECORD_REL), false);
    } finally {
      await ready.stop();
    }
  } finally {
    legacyTemp.cleanup();
    readyTemp.cleanup();
  }
});

// —————————————————————— S7-J record 幂等/重启去重/审计失败/发送失败 ——————————————————————

test("S7-J routing record：审计失败可见且不伪造账本；发送失败 failed 后下一次事件重试成功；重启去重不重复路由", async () => {
  const auditTemp = makeRoot("s7-rework-audit-fail");
  const sendTemp = makeRoot("s7-rework-send-retry");
  const restartTemp = makeRoot("s7-rework-restart");
  try {
    // ① 审计失败：record=sent、任务已发、Lead 系统行可见、账本无 app→Lead、不伪造。
    seedBase(auditTemp.root);
    await seedLedger(auditTemp.root, [ACCEPTED_PROPOSAL, dispatchEntry("impl"), rejectionEntry(new Date().toISOString())]);
    const auditHarness = await makeHarness(
      harnessOptions("s7-rework-audit-fail", auditTemp.root, {
        appendGovernanceLedger: async (projectRoot: string, entry: GovernanceLedgerEntry) => {
          if (entry.kind === "dispatch.accepted" && entry.actorRoleId === "app" && entry.targetRoleId === "liaison") {
            return { ok: false as const, message: "模拟审计写入失败" };
          }
          return appendGovernanceLedger(projectRoot, entry);
        },
      }),
    );
    try {
      await auditHarness.waitFor(() => (auditHarness.prompts.get("liaison")?.length ?? 0) > 0, 8000);
      await waitForRecordStatus(auditTemp.root, "sent", 10000);
      await auditHarness.waitFor(() =>
        deliveryNotes(auditHarness, "liaison").some((note) => note.includes("审计记录写入失败")),
      );
      assert.match(
        deliveryNotes(auditHarness, "liaison").find((note) => note.includes("审计记录写入失败"))!,
        /不伪造账本|已发送事实不翻转/,
        "审计失败系统行如实说明不伪造",
      );
      const ledger = await readGovernanceLedger(auditTemp.root);
      assert.equal(
        ledger.entries.filter(
          (entry) =>
            entry.kind === "dispatch.accepted" && entry.actorRoleId === "app" && entry.targetRoleId === "liaison",
        ).length,
        0,
        "不伪造 app→Lead 审计",
      );
      assert.equal(auditHarness.prompts.get("verifier")?.length ?? 0, 0, "不派 Proof");
    } finally {
      await auditHarness.stop();
    }

    // ② 发送失败：record=failed、系统行可见、不派 Proof；故障移除后下一次事件重试成功（sent）。
    seedBase(sendTemp.root);
    await seedLedger(sendTemp.root, [ACCEPTED_PROPOSAL, dispatchEntry("impl"), rejectionEntry(new Date().toISOString())]);
    const failOpenRoles = new Set<string>(["liaison"]);
    const sendHarness = await makeHarness(
      harnessOptions("s7-rework-send-retry", sendTemp.root, { failOpenRoles }),
    );
    try {
      await waitForRecordStatus(sendTemp.root, "failed", 10000);
      await sendHarness.waitFor(() =>
        deliveryNotes(sendHarness, "liaison").some((note) => note.includes("返工路由失败")),
      );
      assert.equal(sendHarness.prompts.get("verifier")?.length ?? 0, 0, "发送失败不派 Proof");
      assert.equal(routingRecord(sendTemp.root)!.status, "failed");
      assert.equal(typeof routingRecord(sendTemp.root)!.error, "string");

      failOpenRoles.delete("liaison");
      await sendHarness.iface.listProject({ projectRoot: sendTemp.root });
      await sendHarness.waitFor(() => (sendHarness.prompts.get("liaison")?.length ?? 0) > 0, 8000);
      await waitForRecordStatus(sendTemp.root, "sent", 10000);
      assert.equal(sendHarness.prompts.get("liaison")!.length, 1, "下一次真实事件重试成功，恰一条任务");
      assert.equal(routingRecord(sendTemp.root)!.error, null);
    } finally {
      await sendHarness.stop();
    }

    // ③ 重启去重：同一项目根 + 已 sent 的 record ⇒ 新 Interface 不重复路由/系统行。
    seedBase(restartTemp.root, { flowMtime: new Date(Date.now() - 60_000) });
    await seedLedger(restartTemp.root, [
      ACCEPTED_PROPOSAL,
      dispatchEntry("impl"),
      rejectionEntry(new Date(Date.now() - 30_000).toISOString()),
    ]);
    const first = await makeHarness(harnessOptions("s7-rework-restart-1", restartTemp.root));
    let sentAt: unknown;
    try {
      await first.waitFor(() => (first.prompts.get("liaison")?.length ?? 0) > 0, 8000);
      await waitForRecordStatus(restartTemp.root, "sent", 10000);
      sentAt = routingRecord(restartTemp.root)!.sentAt;
      assert.equal(first.prompts.get("liaison")!.length, 1);
    } finally {
      await first.stop();
    }
    const second = await makeHarness(harnessOptions("s7-rework-restart-2", restartTemp.root));
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(second.prompts.get("liaison")?.length ?? 0, 0, "重启后不重复路由");
      assert.equal(
        deliveryNotes(second, "liaison").filter((note) => note.includes("客户拒绝")).length,
        0,
        "重启后不重复路由系统行",
      );
      assert.equal(routingRecord(restartTemp.root)!.sentAt, sentAt, "record 保持原 sentAt（幂等）");
      assert.equal(await verificationDispatchCount(restartTemp.root), 0, "仍不派 Proof");
    } finally {
      await second.stop();
    }
  } finally {
    auditTemp.cleanup();
    sendTemp.cleanup();
    restartTemp.cleanup();
  }
});
