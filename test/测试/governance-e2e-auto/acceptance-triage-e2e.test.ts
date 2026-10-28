// test/测试/governance-e2e-auto/acceptance-triage-e2e.test.ts
// 2026-10-25 验收分诊 + 独立复核请求（`request_acceptance`）全流程 e2e（测试角色）。
//
// 覆盖客户要求与设计 `角色卡/项目管理/docs/design/2026-10-25_design_acceptance-triage.md` §4–§9：
//   · `request_acceptance`：临时项目上首次 dispatched、重复 already-dispatched；缺标准/变更包/风险档/
//     流程未完成/flow 不存在返回对应 code；`acceptance-criteria` pending 由应用收口为 done（artifact 证据）。
//   · 仅 nit/minor（判断代批 judge-rule）⇒ 不返工、记录 report-only、主理汇报、账本 `acceptance.triage`，
//     且不污染 `latestAcceptanceDecision`。
//   · 可执行 blocker ⇒ 返工任务含 id/severity/reason/action/criteria，minor/nit 标非阻断。
//   · 客户分诊卡（开关关）⇒ 稳定 id、卡面含结论/原因/改进方案/建议/两选项；选择「下发统筹修改」按
//     reject 结算并交统筹（triage-customer 来源）。
//   · 缺 `acceptance-triage/v1`（只有旧 `acceptance-rework/v1`）⇒ 退回 Proof 补报告：不弹卡、不返工、
//     不写 `customer.decision`、不调用判断。
//   · report-only 后同 sha 不再派 Proof；新 sha 允许新一轮。
//   · 角色边界写入：WriteGate 直调边界内 allowed / 边界外 denied / 他人写集 denied；工具层预授权目录
//     直接写且零 request_confirmation 卡，`.ans/` 与他人写区拒绝。
//
// 纪律：全部在系统临时目录内；用真实产品面（openRoleSession / 桌面 createDesktopInterface / 客户通道 /
// 账本 / flow-state 公共出口）；脚本化假适配器；不读真实 .env/凭据/网络；不写目标项目；不 import 实施方测试。
// 断言按**最终契约**编写；当前尚未落地的行为以 FAIL 暴露（不用 skip 伪装通过），报告见角色卡 changelog/memo。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import {
  CHANGE_PACKAGE_REL,
  CRITERIA_REL,
  FLOW,
  FLOW_REL,
  REPORT_REL,
  acceptanceCriteriaDoc,
  changePackageDoc,
  exists,
  flowDoc,
  makeHarness,
  makeRoot,
  read,
  roleBoundaryDoc,
  roleCardDoc,
  roleWorkDocs,
  seedLedger,
  seedTrioProject,
  sha256,
  write,
  type FlowDocStep,
  type Harness,
} from "./fixture.ts";
import {
  readGovernanceLedger,
  type GovernanceLedgerEntry,
} from "../../../src/common/编排/governance-ledger.ts";
import {
  acceptanceTriageRecordRelPath,
  latestAcceptanceDecision,
  parseFlowStateYaml,
  readAcceptanceTriageRecord,
  type AcceptanceTriageRecord,
} from "../../../src/pipeline/orchestration/flow-state.ts";
import { resolveWrite } from "../../../src/service/gate/resolve-write.ts";
import type { BoundarySection1 } from "../../../src/model/boundary.ts";
import type { WriteDecision } from "../../../src/model/decision.ts";

// —————————————————————— 夹具（本文件私有） ——————————————————————

const TRIAGE_ACCEPTANCE_CARD = {
  name: "request_choice",
  toolCallId: "tc-acceptance-triage",
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

const RESOLVE_RUNTIME = async () => ({
  ok: true as const,
  runtime: "claude" as const,
  source: "credentials" as const,
  skipped: [],
});

interface TriageItemInput {
  id: string;
  severity: "blocker" | "major" | "minor" | "nit";
  owner: string;
  reason: string;
  action: string;
  targets?: string[];
  criteria?: string;
  evidence?: string[];
}

/** 验收报告：首行五项 + 恰好一个 fenced `acceptance-triage/v1` 段（设计 §4.2）。 */
function triageReport(conclusion: "fail" | "conditional", items: readonly TriageItemInput[]): string {
  const lines = [
    "风险档位：T2｜判定依据：夹具｜选定检查：受影响测试与全量回归｜复用证据：无｜全量回归：已执行",
    "",
    `# 验收报告 ${FLOW}`,
    "",
    "## 结论",
    conclusion === "fail" ? "不通过。" : "有条件通过（附条件）。",
    "",
    "## 分诊结构",
    "```yaml",
    "schema: acceptance-triage/v1",
    `conclusion: ${conclusion}`,
    "items:",
  ];
  for (const item of items) {
    lines.push(`  - id: ${item.id}`, `    severity: ${item.severity}`, `    owner: ${item.owner}`);
    lines.push(`    reason: ${item.reason}`, `    action: ${item.action}`);
    if (item.targets !== undefined && item.targets.length > 0) {
      lines.push(`    targets: [${item.targets.join(", ")}]`);
    }
    if (item.criteria !== undefined) lines.push(`    criteria: ${item.criteria}`);
    if (item.evidence !== undefined && item.evidence.length > 0) {
      lines.push(`    evidence: [${item.evidence.join(", ")}]`);
    }
  }
  lines.push("```", "");
  return lines.join("\n");
}

/** 旧报告：只有 `acceptance-rework/v1`（缺 triage 段 ⇒ 必须退回 Proof）。 */
function reworkOnlyReport(): string {
  return [
    "风险档位：T2｜判定依据：夹具｜选定检查：夹具｜复用证据：无｜全量回归：已执行",
    "",
    `# 验收报告 ${FLOW}`,
    "",
    "```yaml",
    "schema: acceptance-rework/v1",
    "items:",
    "  - id: F1",
    "    owner: executor",
    "    action: 修复交付并补证据",
    "    evidence: docs/verification/f1.log",
    "```",
    "",
  ].join("\n");
}

const NIT_ONLY_ITEMS: readonly TriageItemInput[] = [
  {
    id: "N1",
    severity: "nit",
    owner: "executor",
    reason: "注释措辞可更简洁",
    action: "调整注释措辞",
    targets: ["src/owned-executor/impl.ts"],
  },
  {
    id: "M1",
    severity: "minor",
    owner: "executor",
    reason: "命名一致性",
    action: "统一命名",
    criteria: `${CRITERIA_REL}#P1`,
  },
];

const BLOCKER_ITEMS: readonly TriageItemInput[] = [
  {
    id: "B1",
    severity: "blocker",
    owner: "executor",
    reason: "干净安装失败",
    action: "修复依赖锁定并保留完整日志",
    targets: ["package-lock.json"],
    criteria: `${CRITERIA_REL}#P1`,
  },
  {
    id: "M1",
    severity: "minor",
    owner: "executor",
    reason: "命名一致性",
    action: "统一命名",
    targets: ["src/owned-executor/impl.ts"],
  },
  {
    id: "N1",
    severity: "nit",
    owner: "executor",
    reason: "注释措辞",
    action: "调整注释",
    targets: ["src/owned-executor/impl.ts"],
  },
];

/** 流程：impl done + acceptance-criteria（app artifact）pending + verification（验收）pending。 */
function readyFlowSteps(implStatus: "done" | "pending"): FlowDocStep[] {
  return [
    { id: "impl", status: implStatus },
    { id: "acceptance-criteria", kind: "artifact", owner: "app", status: "pending" },
    { id: "verification", status: "pending" },
  ];
}

interface SeedOptions {
  report?: string;
  criteria?: boolean;
  changePackage?: "T2" | "no-risk" | "missing";
  implStatus?: "done" | "pending";
}

/** 临时项目：trio + executor 角色 + flow YAML + 标准/变更包 + 验收报告 + impl 派发账本。 */
async function seedProject(tag: string, options: SeedOptions = {}) {
  const temp = makeRoot(tag);
  const root = temp.root;
  seedTrioProject(root, ["executor"]);
  write(root, FLOW_REL, flowDoc(FLOW, readyFlowSteps(options.implStatus ?? "done")));
  if (options.criteria !== false) write(root, CRITERIA_REL, acceptanceCriteriaDoc(FLOW));
  const changeKind = options.changePackage ?? "T2";
  if (changeKind !== "missing") {
    const text = changePackageDoc(FLOW, "T2");
    write(root, CHANGE_PACKAGE_REL, changeKind === "no-risk" ? text.replace(/^riskTier:.*$/m, "") : text);
  }
  write(root, REPORT_REL, options.report ?? triageReport("fail", NIT_ONLY_ITEMS));
  await seedLedger(root, [
    { kind: "dispatch.accepted", actorRoleId: "convener", power: "schedule", stepId: "impl", targetRoleId: "executor" },
  ]);
  return temp;
}

function verifierCardScript(ctx: { roleId: string; prompt: string }) {
  return ctx.roleId === "verifier" && ctx.prompt.includes("【e2e 验收】") ? [TRIAGE_ACCEPTANCE_CARD] : [];
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

/** 投给主理（Lead / liaison）的返工任务（区别于 Proof settle 的治理反馈任务）。 */
function reworkPrompts(h: Harness, roleId = "chief"): string[] {
  return (h.prompts.get(roleId) ?? []).filter((prompt) => prompt.includes("验收未通过"));
}

function triageRecordPath(root: string): string {
  return path.join(root, ...acceptanceTriageRecordRelPath(FLOW).split("/"));
}

async function triageRecord(root: string): Promise<AcceptanceTriageRecord | undefined> {
  const result = await readAcceptanceTriageRecord(root, FLOW);
  assert.equal(result.corrupt, undefined, `分诊记录不应损坏：${result.corrupt ?? ""}`);
  return result.record;
}

async function waitForTriageLedger(
  h: Harness,
  disposition?: "rework" | "report-only",
): Promise<GovernanceLedgerEntry> {
  const waited = await h.waitForLedger(
    (entries) =>
      entries.some(
        (entry) =>
          entry.kind === "acceptance.triage" &&
          (disposition === undefined || entry.acceptanceTriage?.disposition === disposition),
      ),
    8000,
  );
  const entry = waited.entries.find(
    (candidate) =>
      candidate.kind === "acceptance.triage" &&
      (disposition === undefined || candidate.acceptanceTriage?.disposition === disposition),
  );
  assert.ok(entry, "账本应存在 acceptance.triage 条目");
  return entry;
}

function acceptanceDecisions(entries: readonly GovernanceLedgerEntry[]): GovernanceLedgerEntry[] {
  return entries.filter((entry) => entry.kind === "customer.decision" && entry.decisionKind === "acceptance");
}

function verificationDispatches(entries: readonly GovernanceLedgerEntry[]): GovernanceLedgerEntry[] {
  return entries.filter(
    (entry) =>
      entry.kind === "dispatch.accepted" && entry.flowId === FLOW && entry.stepId === "verification" && entry.targetRoleId === "verifier",
  );
}

async function sendVerifierCard(h: Harness): Promise<void> {
  await h.open("verifier");
  await h.send("verifier", "【e2e 验收】请写报告并发验收卡。");
}

/** `request_acceptance` 结果条数（脚本会话每次匹配到标记就调用一次）。 */
function requestAcceptanceResults(h: Harness) {
  return h.results.filter((record) => record.roleId === "convener" && record.name === "request_acceptance");
}

async function sendRequestAcceptance(h: Harness, prompt = "【e2e 请求复核】请提交独立复核。"): Promise<string> {
  const before = requestAcceptanceResults(h).length;
  await h.send("convener", prompt);
  await h.waitFor(() => requestAcceptanceResults(h).length > before, 10_000);
  const latest = requestAcceptanceResults(h).at(-1);
  assert.ok(latest, "convener 应收到 request_acceptance 工具结果");
  return latest.message;
}

function requestAcceptanceHarnessOptions(tag: string, root: string) {
  return {
    tag,
    root,
    forwardRequestAcceptance: true,
    resolveRuntime: RESOLVE_RUNTIME,
    scriptForRole: (ctx: { roleId: string; prompt: string }) => {
      if (ctx.roleId !== "convener") return [];
      if (ctx.prompt.includes("【e2e 请求复核-未知】")) {
        return [{ name: "request_acceptance", args: { flowId: "no-such-flow" } }];
      }
      if (ctx.prompt.includes("【e2e 请求复核】")) {
        return [{ name: "request_acceptance", args: { flowId: FLOW } }];
      }
      return [];
    },
  } as Parameters<typeof makeHarness>[0];
}

// —————————————————————— 一、request_acceptance ——————————————————————

test("R1 request_acceptance：缺标准/变更包/风险档/流程未完成/flow 不存在 ⇒ 如实 code，不派发", async () => {
  const temp = await seedProject("triage-request-codes", {
    criteria: false,
    changePackage: "missing",
    report: triageReport("fail", NIT_ONLY_ITEMS),
  });
  const root = temp.root;
  const h = await makeHarness(requestAcceptanceHarnessOptions("triage-request-codes", root));
  try {
    await h.open("convener");

    // ① 标准缺失
    const missingCriteria = await sendRequestAcceptance(h);
    assert.match(missingCriteria, /code=criteria-missing/, missingCriteria);
    assert.match(missingCriteria, /不要当已派发/, "未派发必须如实说明");

    // ② flow 不存在（显式未知 flowId）⇒ flow-not-found，不派发。
    const unknownFlow = await sendRequestAcceptance(h, "【e2e 请求复核-未知】未知流程。");
    assert.match(unknownFlow, /code=flow-not-found/, unknownFlow);

    // ③ 补标准但变更包缺失
    write(root, CRITERIA_REL, acceptanceCriteriaDoc(FLOW));
    const missingChange = await sendRequestAcceptance(h);
    assert.match(missingChange, /code=change-package-missing/, missingChange);

    // ④ 变更包存在但缺风险档位（正文也不得出现 T0–T3 token；解析器会扫描 frontmatter + 正文）。
    write(
      root,
      `docs/scheduling/${FLOW}-change-v2.md`,
      ["---", `flowId: ${FLOW}`, "version: 2", "---", "", `# 变更包 ${FLOW}`, "", "## 档位依据", "未声明档位。", ""].join("\n"),
    );
    const noRisk = await sendRequestAcceptance(h);
    assert.match(noRisk, /code=change-package-no-risk/, noRisk);

    // ⑤ 变更包齐备但执行步骤未完成（继续使用 v1 带档位的变更包：先删掉无档位 v2，避免版本扫描取到它）。
    rmSync(path.join(root, "docs", "scheduling", `${FLOW}-change-v2.md`));
    write(root, CHANGE_PACKAGE_REL, changePackageDoc(FLOW, "T2"));
    write(root, FLOW_REL, flowDoc(FLOW, readyFlowSteps("pending")));
    const incomplete = await sendRequestAcceptance(h);
    assert.match(incomplete, /code=flow-incomplete/, incomplete);

    // 全程零派发、零验收决定。
    const ledger = await readGovernanceLedger(root);
    assert.equal(verificationDispatches(ledger.entries).length, 0, "未达条件不得派发验收复核");
    assert.equal(acceptanceDecisions(ledger.entries).length, 0, "请求复核不写 customer.decision");
  } finally {
    await h.stop();
    temp.cleanup();
  }
});

test("R2 request_acceptance：pending 标准步骤收口为 done（artifact 证据）；首次 dispatched、重复 already-dispatched", async () => {
  const temp = await seedProject("triage-request-dispatch", { report: triageReport("fail", NIT_ONLY_ITEMS) });
  const root = temp.root;
  const h = await makeHarness(requestAcceptanceHarnessOptions("triage-request-dispatch", root));
  try {
    await h.open("convener");
    const first = await sendRequestAcceptance(h);
    assert.match(first, /code=dispatched/, first);
    assert.match(first, /请求复核 ≠ 客户批准/, "回执不得把请求复核说成客户批准");

    // 标准步骤被应用收口为 done，并写 artifact 证据（验收标准路径）。
    const parsed = parseFlowStateYaml(read(root, FLOW_REL), FLOW);
    assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
    if (!parsed.ok) throw new Error("flow YAML 不可解析");
    const criteriaStep = parsed.flow.steps.find((step) => step.id === "acceptance-criteria");
    assert.ok(criteriaStep, "流程应含 acceptance-criteria 步骤");
    assert.equal(criteriaStep!.status, "done", "pending 标准步骤应被收口为 done");
    assert.deepEqual(criteriaStep!.evidence, { kind: "artifact", ref: CRITERIA_REL }, "done 证据应指向最新验收标准");

    const ledger = await readGovernanceLedger(root);
    assert.equal(verificationDispatches(ledger.entries).length, 1, "首次请求恰一次 proof 派发");
    assert.equal((h.prompts.get("verifier") ?? []).length, 1, "verifier 应收到一条复核任务");

    // 重复调用：同 flow 同版本 ⇒ already-dispatched，不重复派发。
    const second = await sendRequestAcceptance(h);
    assert.match(second, /code=already-dispatched/, second);
    const after = await readGovernanceLedger(root);
    assert.equal(verificationDispatches(after.entries).length, 1, "重复请求不得重复派发");
    assert.equal((h.prompts.get("verifier") ?? []).length, 1, "重复请求不得再次投递 verifier");
  } finally {
    await h.stop();
    temp.cleanup();
  }
});

// —————————————————————— 二、验收分诊 ——————————————————————

test("T1 仅 nit/minor + 判断代批：不返工、记录 report-only、产品汇报；账本 acceptance.triage 不污染 latestAcceptanceDecision", async () => {
  const temp = await seedProject("triage-nit-report-only", { report: triageReport("fail", NIT_ONLY_ITEMS) });
  const root = temp.root;
  const h = await makeHarness({
    tag: "triage-nit-report-only",
    root,
    wireAcceptanceTriage: true,
    resolveRuntime: RESOLVE_RUNTIME,
    scriptForRole: verifierCardScript,
  });
  try {
    h.iface.setDecisionJudgeEnabled({ enabled: true });
    await sendVerifierCard(h);

    // 验收卡被前闸拦截、未呈现给客户（判断代批路径）。
    assert.equal(h.presented.length, 0, "仅汇报路径不应呈现验收卡或分诊卡");
    const receipt = h.results.find((record) => record.name === "request_choice");
    assert.ok(receipt, "verifier 应收到 request_choice 回执");
    // 应用侧结算必须说明「验收卡未向客户呈现」且不是客户拒绝（分诊回执措辞可随运行时核心演进，
    // 不断言单一逐字文案；钉住语义：未呈现 + 仅汇报 + 非客户拒绝）。
    assert.match(receipt!.message, /验收卡未向客户呈现|治理确认卡未发出/, receipt!.message);
    assert.match(receipt!.message, /仅汇报不返工/, receipt!.message);
    assert.doesNotMatch(receipt!.message, /客户拒绝（/, "不得以客户拒绝文案结算分诊");

    const triageEntry = await waitForTriageLedger(h, "report-only");
    assert.equal(triageEntry.flowId, FLOW);
    assert.equal(triageEntry.actorRoleId, "app");
    assert.equal(triageEntry.acceptanceTriage?.source, "judge");
    assert.equal(triageEntry.acceptanceTriage?.sourceDetail, "judge-rule");
    assert.equal(triageEntry.acceptanceTriage?.conclusion, "fail");

    const record = await triageRecord(root);
    assert.ok(record, "应写分诊记录");
    assert.equal(record!.status, "report-only");
    assert.equal(record!.disposition, "report-only");
    assert.equal(record!.source, "judge");
    assert.equal(record!.sourceDetail, "judge-rule");
    assert.equal(record!.recommendation, "report-only");
    assert.equal(record!.recommendationBasis, "minor-only");
    assert.equal(record!.conclusion, "fail");
    assert.deepEqual(record!.severityCounts, { blocker: 0, major: 0, minor: 1, nit: 1 });
    assert.equal(record!.itemCount, 2);
    assert.equal(record!.reportSha256, sha256(read(root, REPORT_REL)));
    assert.equal(record!.triageId, `triage-${FLOW}-${sha256(read(root, REPORT_REL)).slice(0, 8)}`);
    assert.equal(typeof record!.reportedAt, "string", "产品汇报后应置 reportedAt");

    // 主理确定性汇报：结论 + 逐项原因 + 改进建议 + 决定来源 + 报告路径。
    await h.waitFor(
      () => deliveryNotes(h, "chief").some((note) => note.includes("验收结论：不通过") && note.includes("本次不返工")),
      5000,
    );
    const reportNote = deliveryNotes(h, "chief").find((note) => note.includes("验收结论：不通过"))!;
    assert.match(reportNote, /N1 · 风格建议：注释措辞可更简洁/);
    assert.match(reportNote, /M1 · 次要：命名一致性/);
    assert.match(reportNote, /改进建议：调整注释措辞（src\/owned-executor\/impl\.ts）/);
    assert.match(reportNote, /改进建议：统一命名（docs\/acceptance\/flow-a-criteria-v1\.md#P1）/);
    assert.match(reportNote, /本次不返工（判断代批（替我决策））/);
    assert.ok(reportNote.includes(REPORT_REL), "汇报应带报告路径");

    // 零返工、零客户决定、零 Proof 重派；账本分诊条目不污染 latestAcceptanceDecision。
    assert.equal(reworkPrompts(h).length, 0, "仅汇报不得产生返工任务");
    assert.equal(exists(root, `.ans/governance/acceptance/${FLOW}/rework-routing.json`), false, "不得写返工路由");
    const ledger = await readGovernanceLedger(root);
    assert.equal(acceptanceDecisions(ledger.entries).length, 0, "判断代批不写 customer.decision");
    assert.equal(verificationDispatches(ledger.entries).length, 0, "仅汇报不得派 Proof");
    assert.equal(latestAcceptanceDecision(FLOW, ledger).kind, "none", "acceptance.triage 不是客户验收决定");
  } finally {
    await h.stop();
    temp.cleanup();
  }
});

test("T2 可执行 blocker + 判断代批：返工任务含 id/severity/reason/action/criteria；minor/nit 标非阻断；零 customer.decision", async () => {
  const temp = await seedProject("triage-blocker-rework", { report: triageReport("fail", BLOCKER_ITEMS) });
  const root = temp.root;
  const h = await makeHarness({
    tag: "triage-blocker-rework",
    root,
    wireAcceptanceTriage: true,
    resolveRuntime: RESOLVE_RUNTIME,
    scriptForRole: verifierCardScript,
  });
  try {
    h.iface.setDecisionJudgeEnabled({ enabled: true });
    await sendVerifierCard(h);
    assert.equal(h.presented.length, 0, "判断代批路径不弹客户卡");

    const triageEntry = await waitForTriageLedger(h, "rework");
    assert.equal(triageEntry.acceptanceTriage?.source, "judge");
    assert.equal(triageEntry.acceptanceTriage?.sourceDetail, "judge-rule");
    const record = await triageRecord(root);
    assert.equal(record!.status, "dispatched");
    assert.equal(record!.disposition, "rework");
    assert.equal(record!.recommendationBasis, "blocker-major-feasible");
    assert.deepEqual(record!.severityCounts, { blocker: 1, major: 0, minor: 1, nit: 1 });

    // 返工任务：唯一一条、来源=judge-rule、逐项带 severity/reason/action/指针、minor/nit 非阻断。
    await h.waitFor(() => reworkPrompts(h).length > 0, 8000);
    assert.equal(reworkPrompts(h).length, 1, "同一次分诊只发唯一一条返工任务");
    const task = reworkPrompts(h)[0]!;
    assert.match(task, /来源：验收分诊判断代批（确定性规则 judge-rule）/);
    assert.match(task, /结构化返工清单（acceptance-triage\/v1；/, "任务清单应声明来自 triage schema");
    assert.match(
      task,
      /id=B1 \| owner=executor \| action=修复依赖锁定并保留完整日志 \| severity=blocker \| reason=干净安装失败 \| criteria=docs\/acceptance\/flow-a-criteria-v1\.md#P1/,
      "blocker 项应携带 id/severity/reason/action/criteria",
    );
    assert.match(task, /id=M1 .*severity=minor（非阻断，可选后续）/, "minor 标非阻断");
    assert.match(task, /id=N1 .*severity=nit（非阻断，可选后续）/, "nit 标非阻断");
    assert.match(task, /minor\/nit 项为非阻断（可选后续）/, "任务应显式声明非阻断");
    assert.match(task, /实际接收方：幕僚（chief）/, "trio 实际接收方 = 幕僚");

    // routing record：结构化 triage 清单（不依赖旧 acceptance-rework 段）。
    // 说明：acceptance.triage 账本条目在「routing 记录 sent + 分诊记录 dispatched」之后追加，
    // 因此前面的 waitForTriageLedger 已保证记录写入完成；这里只读一次（不轮询该文件——Windows 下
    // 同步读句柄与原子 rename 竞争会诱发 EPERM，属测试自身干扰）。
    const routingPath = path.join(root, ".ans", "governance", "acceptance", FLOW, "rework-routing.json");
    assert.equal(existsSync(routingPath), true, "应写返工路由记录");
    const routing = JSON.parse(readFileSync(routingPath, "utf8")) as Record<string, unknown>;
    assert.equal(routing.schema, "acceptance-rework-routing/v1");
    assert.equal(routing.source, "judge");
    assert.equal(routing.sourceDetail, "judge-rule");
    // routing record 的 sent 回写是既有 S7 的 best-effort（`writeReworkRoutingRecord` rename 失败只诊断，
    // 任务已发 + 本进程内存去重兜底；Windows 下并发读句柄偶发 EPERM 属既有残余风险）。任务本身已在上方
    // 断言唯一且内容正确；这里接受 sent / pending 两态，不把既有记录写风险误报为分诊缺陷。
    assert.ok(routing.status === "sent" || routing.status === "pending", `routing status 非法：${String(routing.status)}`);
    if (routing.status === "sent") assert.equal(typeof routing.sentAt, "string");
    assert.equal(routing.structured, true);
    assert.equal(routing.itemCount, 3);
    assert.equal(routing.reportPath, REPORT_REL);
    assert.match(String(routing.reportSha256), /^[0-9a-f]{64}$/);
    assert.match(String(routing.itemsDigest), /^[0-9a-f]{64}$/);

    // 判断代批不写客户决定；latestAcceptanceDecision 仍 none。
    const ledger = await readGovernanceLedger(root);
    assert.equal(acceptanceDecisions(ledger.entries).length, 0, "判断代批返工不得写 customer.decision");
    assert.equal(latestAcceptanceDecision(FLOW, ledger).kind, "none");
  } finally {
    await h.stop();
    temp.cleanup();
  }
});

test("T3 客户分诊卡：稳定 id/卡面齐全；选择「下发运营修改」⇒ reject 结算 + triage-customer 唯一一条返工任务", async () => {
  const temp = await seedProject("triage-customer-card", { report: triageReport("fail", BLOCKER_ITEMS) });
  const root = temp.root;
  const h = await makeHarness({
    tag: "triage-customer-card",
    root,
    wireAcceptanceTriage: true,
    resolveRuntime: RESOLVE_RUNTIME,
    scriptForRole: verifierCardScript,
  });
  try {
    await h.open("verifier");
    const sending = h.send("verifier", "【e2e 验收】请写报告并发验收卡。");
    await h.waitFor(() => h.presented.length > 0, 8000);

    const reportSha = sha256(read(root, REPORT_REL));
    const expectedCardId = `triage-${FLOW}-${reportSha.slice(0, 8)}`;
    const card = h.presented.find((entry) => entry.id === expectedCardId);
    assert.ok(card, `分诊卡应使用稳定 id ${expectedCardId}（实际 ${h.presented.map((entry) => entry.id).join("、")}）`);
    assert.equal(card!.roleId, "chief", "分诊卡呈现面 = 主入口产品");
    const request = card!.request;
    if (request.kind !== "choice") throw new Error("分诊卡必须是 choice 卡");
    assert.deepEqual(
      request.options.map((option) => option.id),
      ["rework", "report-only"],
      "分诊卡恰两选项：下发运营修改 / 仅汇报不返工",
    );
    const preview = card!.request.preview ?? "";
    assert.match(preview, /验收结论：不通过/, "卡面含结论摘要");
    assert.match(preview, /B1 · 阻断：干净安装失败/, "卡面含逐项 severity + reason");
    assert.match(preview, /改进建议：修复依赖锁定并保留完整日志（package-lock\.json；docs\/acceptance\/flow-a-criteria-v1\.md#P1）/, "卡面含改进方案与指针");
    assert.match(preview, /建议下发运营修改（1 个阻断、0 个重要项，改进方案可执行）/, "卡面含默认建议与依据");
    assert.match(preview, /报告含阻断项，仅汇报将不修复/, "blocker 报告含覆盖警示");

    h.answer(card!.id, { kind: "choice", selected: ["rework"] });
    const sent = await sending;
    assert.equal(sent.ok, true, sent.error ?? "");
    const receipt = h.results.find((record) => record.name === "request_choice");
    assert.match(receipt!.message, /客户在验收分诊卡上的选择/, "回执应区分分诊卡选择与验收卡 accept/reject");
    assert.match(receipt!.message, /下发运营修改/);
    assert.doesNotMatch(receipt!.message, /客户已选择（.*accept/, "不得把分诊选择说成直接 accept");

    // 客户选择「下发统筹修改」按 reject 结算（customer-input 证据）+ triage 账本。
    const waited = await h.waitForLedger(
      (entries) =>
        entries.some((entry) => entry.kind === "acceptance.triage" && entry.acceptanceTriage?.disposition === "rework"),
      8000,
    );
    const decision = acceptanceDecisions(waited.entries).find((entry) => entry.customerDecision === "rejected");
    assert.ok(decision, "客户分诊选择应经既有结算写 acceptance rejected");
    assert.equal(decision!.decisionEvidence?.kind, "customer-input");
    const triageEntry = waited.entries.find((entry) => entry.kind === "acceptance.triage")!;
    assert.equal(triageEntry.acceptanceTriage?.source, "customer");
    assert.equal(triageEntry.acceptanceTriage?.sourceDetail, "triage-customer");

    // 分诊处置本身已执行（记录 dispatched / sourceDetail triage-customer）；下面的任务内容断言检查
    // 它是否真的把 triage 清单交给了统筹（当前缺陷：settle 的自动返工路由抢先，见任务断言）。
    const record = await triageRecord(root);
    assert.ok(record, "应写分诊记录");
    assert.equal(record!.status, "dispatched");
    assert.equal(record!.disposition, "rework");
    assert.equal(record!.source, "customer");
    assert.equal(record!.sourceDetail, "triage-customer");

    // 最终契约：唯一一条返工任务，且必须携带 triage 清单（severity/reason/action）与 triage-customer 来源。
    await h.waitFor(() => reworkPrompts(h).length > 0, 8000);
    assert.equal(reworkPrompts(h).length, 1, "客户分诊只发唯一一条返工任务（不得被 settle 自动路由抢先/重复）");
    const task = reworkPrompts(h)[0]!;
    assert.match(task, /来源：客户验收分诊选择（下发运营修改）/, "任务来源应为 triage-customer，而不是「客户拒绝（客户手拒）」");
    assert.match(task, /结构化返工清单（acceptance-triage\/v1；/);
    assert.match(task, /id=B1 .*severity=blocker .*reason=干净安装失败/, "任务必须携带 triage 的 severity/reason/action");
  } finally {
    await h.stop();
    temp.cleanup();
  }
});

test("T4 缺 triage 段（只有旧 acceptance-rework/v1）⇒ 退回 Proof 补报告：零卡、零返工、零 customer.decision、不调用判断", async () => {
  const temp = await seedProject("triage-missing-section", { report: reworkOnlyReport() });
  const root = temp.root;
  const h = await makeHarness({
    tag: "triage-missing-section",
    root,
    wireAcceptanceTriage: true,
    resolveRuntime: RESOLVE_RUNTIME,
    scriptForRole: verifierCardScript,
  });
  try {
    h.iface.setDecisionJudgeEnabled({ enabled: true });
    await sendVerifierCard(h);

    assert.equal(h.presented.length, 0, "缺结构不得呈现客户卡/分诊卡");
    assert.equal(h.judgeInvocations, 0, "缺结构不得调用判断 agent");
    const receipt = h.results.find((record) => record.name === "request_choice")!;
    assert.match(receipt.message, /治理确认卡未发出/);
    assert.match(receipt.message, /缺少分诊结构/);
    assert.doesNotMatch(receipt.message, /客户拒绝/);

    const record = await triageRecord(root);
    assert.ok(record, "退回也应写分诊记录（供审计/去重）");
    assert.equal(record!.status, "returned-to-verifier");
    assert.equal(record!.parseFailure, "missing");
    assert.equal(record!.reportSha256, null, "缺结构（无分诊段）不伪造报告 sha");
    assert.equal(record!.conclusion, null, "未解析出结构不得猜结论");
    assert.equal(record!.disposition, null);
    assert.equal(record!.source, null);

    // 主理如实系统行；零返工/零客户决定/零 Proof 重派。
    await h.waitFor(
      () => deliveryNotes(h, "chief").some((note) => note.includes("验收报告缺少分诊结构，已退回质检补充")),
      5000,
    );
    assert.equal(reworkPrompts(h).length, 0, "缺结构不得返工");
    assert.equal(exists(root, `.ans/governance/acceptance/${FLOW}/rework-routing.json`), false);
    const ledger = await readGovernanceLedger(root);
    assert.equal(acceptanceDecisions(ledger.entries).length, 0);
    assert.equal(verificationDispatches(ledger.entries).length, 0);
  } finally {
    await h.stop();
    temp.cleanup();
  }
});

test("T5 report-only 抑制重派：同 sha 请求复核 ⇒ already-dispatched；新 sha 允许新一轮（恰一次派发）", async () => {
  const temp = await seedProject("triage-report-only-suppress", { report: triageReport("fail", NIT_ONLY_ITEMS) });
  const root = temp.root;
  const h = await makeHarness({
    tag: "triage-report-only-suppress",
    root,
    wireAcceptanceTriage: true,
    forwardRequestAcceptance: true,
    resolveRuntime: RESOLVE_RUNTIME,
    scriptForRole: (ctx) => {
      if (ctx.roleId === "convener" && ctx.prompt.includes("【e2e 请求复核】")) {
        return [{ name: "request_acceptance", args: { flowId: FLOW } }];
      }
      if (ctx.roleId === "verifier" && ctx.prompt.includes("【e2e 验收】")) return [TRIAGE_ACCEPTANCE_CARD];
      return [];
    },
  });
  try {
    h.iface.setDecisionJudgeEnabled({ enabled: true });
    // 先让验收卡走分诊：仅 nit/minor ⇒ report-only（不返工）。
    await sendVerifierCard(h);
    await waitForTriageLedger(h, "report-only");

    // 同一报告 sha：request_acceptance 被分诊抑制 ⇒ already-dispatched，不派 Proof。
    await h.open("convener");
    const sameSha = await sendRequestAcceptance(h);
    assert.match(sameSha, /code=already-dispatched/, sameSha);
    assert.match(sameSha, /仅汇报不返工/, "回执应说明 report-only 抑制重派");
    const ledgerAfterSame = await readGovernanceLedger(root);
    assert.equal(verificationDispatches(ledgerAfterSame.entries).length, 0, "同 sha 不得派 Proof");

    // 标准步骤在抑制前已被应用收口（receiving request 的副作用），供后续新报告直接派发。
    const parsed = parseFlowStateYaml(read(root, FLOW_REL), FLOW);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) throw new Error("flow YAML 不可解析");
    assert.equal(parsed.flow.steps.find((step) => step.id === "acceptance-criteria")?.status, "done");

    // 排空该请求触发的异步验收检查（ledger tick）：否则它可能在写入新报告后先一步自动派发，
    // 使下面的显式 request_acceptance 命中运行期去重（测试时序，不是契约差异）。
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(
      verificationDispatches((await readGovernanceLedger(root)).entries).length,
      0,
      "排空后仍应零派发（同 sha 抑制生效）",
    );

    // 新报告（新 sha）⇒ 允许新一轮：dispatch 恰一次。
    write(root, `docs/acceptance/${FLOW}-report-v2.md`, triageReport("fail", NIT_ONLY_ITEMS).replace("注释措辞可更简洁", "注释措辞仍可更简洁"));
    const newSha = await sendRequestAcceptance(h);
    assert.match(newSha, /code=dispatched/, newSha);
    const ledgerAfterNew = await h.waitForLedger(
      (entries) => verificationDispatches(entries).length >= 1,
      8000,
    );
    assert.equal(verificationDispatches(ledgerAfterNew.entries).length, 1, "新 sha 恰一次 Proof 派发");
  } finally {
    await h.stop();
    temp.cleanup();
  }
});

// —————————————————————— 三、角色边界写入 ——————————————————————

test("B1 WriteGate 直调：边界内 allowed；边界外 denied；他人写集（即便在任务 writeSet 内）denied", () => {
  const temp = makeRoot("triage-boundary-gate");
  const root = temp.root;
  try {
    const boundary: BoundarySection1 = {
      entries: [
        { root: "project", kind: "directory", path: "src/owned-executor/", purpose: "执行角色代码写集" },
        { root: "project", kind: "directory", path: "test/owned-executor/", purpose: "执行角色测试写集" },
        { root: "project", kind: "file", path: "角色卡/executor/memo.md", purpose: "角色工作文档" },
      ],
      boundarySource: "角色卡/executor/boundary.yaml",
      acceptance: { accepted: true, source: "test:acceptance-triage-e2e" },
    };
    const ctx = { skillRoot: root, projectRoot: root };
    const allowed = (decision: WriteDecision, message: string): void => {
      if (!decision.allowed) throw new Error(`${message}（拒绝原因：${decision.reason}）`);
    };
    const denied = (decision: WriteDecision, message: string): string => {
      if (decision.allowed) throw new Error(`${message}（实际放行）`);
      return decision.reason;
    };

    // ① 边界内、无任务收窄（聊天会话）⇒ 边界即授权上界，直接放行。
    allowed(resolveWrite("src/owned-executor/impl.ts", boundary, undefined, ctx), "边界内应放行");
    allowed(resolveWrite("角色卡/executor/memo.md", boundary, undefined, ctx), "边界内精确文件应放行");

    // ② 边界外（他人写集）⇒ 放行一律拒绝，即便任务 writeSet 声明了它。
    const otherRoleReason = denied(
      resolveWrite("src/owned-other/impl.ts", boundary, { writeSet: ["src/owned-other/impl.ts"], conditions: [] }, ctx),
      "他人写集不得写入（边界外）",
    );
    assert.match(otherRoleReason, /未匹配任何边界条目|F4|边界/, otherRoleReason);

    // ③ 边界内但不在任务 writeSet（他人写集被塞进 writeSet 的对照）⇒ F4 拒绝。
    const notIssuedReason = denied(
      resolveWrite("src/owned-executor/impl.ts", boundary, { writeSet: ["src/owned-other/"], conditions: [] }, ctx),
      "任务收窄后 writeSet 外不得写",
    );
    assert.match(notIssuedReason, /F4/, notIssuedReason);

    // ④ 应用独占路径（禁写）在角色边界内也不放行（由编排 trio gate 前置判定；此处验证 resolveWrite 不覆盖它）。
    denied(resolveWrite(".ans/project.json", boundary, undefined, ctx), "应用独占路径不得被角色边界放行");

    // ⑤ 边界未被接受 ⇒ fail-closed 拒绝一切写入。
    const unaccepted: BoundarySection1 = { ...boundary, acceptance: { accepted: false, source: "" } };
    const deniedAllReason = denied(
      resolveWrite("src/owned-executor/impl.ts", unaccepted, undefined, ctx),
      "未接受边界必须拒绝一切写入",
    );
    assert.match(deniedAllReason, /F6|未被接受/, deniedAllReason);
  } finally {
    temp.cleanup();
  }
});

test("B2 工具层（convener）：Section 1 条目（含精确文件 docs/workflow.md）直接写、零 request_confirmation 卡；禁写 .ans/、他人写区 角色卡/、边界外 src/ 拒绝", async () => {
  const temp = makeRoot("triage-boundary-tools");
  const root = temp.root;
  seedTrioProject(root);
  const h = await makeHarness({
    tag: "triage-boundary-tools",
    root,
    scriptForRole: (ctx) =>
      ctx.roleId === "convener"
        ? [
            { name: "write_file", args: { path: "docs/governance/convener/triage-boundary-note.md", content: "# 边界内预授权\n" } },
            { name: "write_file", args: { path: "docs/workflow.md", content: "# workflow\n" } },
            { name: "write_file", args: { path: ".ans/project.json", content: "{}" } },
            { name: "write_file", args: { path: "src/owned-executor/probe.ts", content: "export const x = 1;\n" } },
            { name: "write_file", args: { path: "角色卡/executor/probe.md", content: "# probe\n" } },
          ]
        : [],
  });
  try {
    await h.open("convener");
    await h.send("convener", "边界写入探针。");

    const results = h.results.filter((record) => record.roleId === "convener" && record.name === "write_file");
    assert.equal(results.length, 5, "五个写入调用都应产生结果");
    // 客户 2026-10-25 规则：Section 1 边界内的写入是预授权（含精确文件条目），直接写、不逐次确认。
    assert.equal(results[0]!.ok, true, `边界内预授权目录应直接写：${results[0]!.message}`);
    assert.equal(exists(root, "docs/governance/convener/triage-boundary-note.md"), true, "边界内文件应落盘");
    assert.equal(results[1]!.ok, true, `Section 1 精确文件条目应直接写：${results[1]!.message}`);
    assert.equal(exists(root, "docs/workflow.md"), true, "Section 1 精确文件应落盘");
    // 预授权只影响 F4：禁写路径、他人写区与边界外照旧拒绝。
    assert.equal(results[2]!.ok, false, "禁止写应用独占 .ans/");
    assert.match(results[2]!.message, /只能由应用写/, results[2]!.message);
    assert.equal(results[3]!.ok, false, "边界外（src/）必须拒绝");
    assert.match(results[3]!.message, /未匹配任何边界条目/, results[3]!.message);
    assert.equal(results[4]!.ok, false, "他人写区（角色卡/）必须拒绝");
    assert.match(results[4]!.message, /Crew（Nominator）的写区/, results[4]!.message);

    // 边界内写入全程零客户卡：不触发 request_confirmation。
    assert.equal(h.presented.length, 0, "边界内写入不得触发 request_confirmation 呈现");
  } finally {
    await h.stop();
    temp.cleanup();
  }
});

test("B3 工具层（项目角色 executor）：无任务收窄时 Section 1 内直接写、零 request_confirmation；边界外/他人写集拒绝", async () => {
  const temp = makeRoot("triage-boundary-project-role");
  const root = temp.root;
  seedTrioProject(root, ["executor"]);
  // 项目角色边界须被治理记录 pin 覆盖（与真实任命写卡后的形状一致）。
  const boundaryText = roleBoundaryDoc("executor");
  write(root, "角色卡/executor/role-card.md", roleCardDoc("executor"));
  write(root, "角色卡/executor/boundary.yaml", boundaryText);
  for (const [file, content] of Object.entries(roleWorkDocs("executor"))) {
    write(root, `角色卡/executor/${file}`, content);
  }
  const ansPath = path.join(root, ".ans", "project.json");
  const ans = JSON.parse(readFileSync(ansPath, "utf8")) as {
    roles?: Record<string, { card: string; boundary: string }>;
    governanceBoundary: { acceptance: { pin: Array<{ path: string; sha256: string }> } };
  };
  ans.roles = { executor: { card: "角色卡/executor/role-card.md", boundary: "角色卡/executor/boundary.yaml" } };
  ans.governanceBoundary.acceptance.pin.push({
    path: "角色卡/executor/boundary.yaml",
    sha256: sha256(boundaryText),
  });
  write(root, ".ans/project.json", `${JSON.stringify(ans, null, 2)}\n`);

  const h = await makeHarness({
    tag: "triage-boundary-project-role",
    root,
    scriptForRole: (ctx) =>
      ctx.roleId === "executor"
        ? [
            { name: "write_file", args: { path: "src/owned-executor/a.ts", content: "export const a = 1;\n" } },
            { name: "write_file", args: { path: "角色卡/executor/feature-map.md", content: "# 更新\n" } },
            { name: "write_file", args: { path: "src/owned-other/a.ts", content: "x" } },
            { name: "write_file", args: { path: "角色卡/other/memo.md", content: "# 其他角色\n" } },
          ]
        : [],
  });
  try {
    await h.open("executor");
    await h.send("executor", "写自己的边界。");
    const results = h.results.filter((record) => record.roleId === "executor" && record.name === "write_file");
    assert.equal(results.length, 4);
    assert.equal(results[0]!.ok, true, `角色写集内应直接写：${results[0]!.message}`);
    assert.equal(exists(root, "src/owned-executor/a.ts"), true);
    assert.equal(results[1]!.ok, true, `Section 1 工作文档应直接写：${results[1]!.message}`);
    assert.equal(results[2]!.ok, false, "他人写集（src/owned-other/）必须拒绝");
    assert.equal(results[3]!.ok, false, "他人角色目录必须拒绝");
    assert.equal(h.presented.length, 0, "边界内写入不得触发 request_confirmation 呈现");
  } finally {
    await h.stop();
    temp.cleanup();
  }
});
