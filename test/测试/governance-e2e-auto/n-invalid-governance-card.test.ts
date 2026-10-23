// test/测试/governance-e2e-auto/n-invalid-governance-card.test.ts
// 2026-10-22 无效治理确认卡守卫（客户已确认设计 §7.3 T15–T17）——测试角色的**独立跨角色验证**。
//
// 覆盖：
//   T15：脚本化 convener 发缺 flowId 的 confirm（双开关全开）⇒
//        raw 客户通道 0 次、无 request id / pending / queued / judging、无 presenter 呈现/镜像行、
//        无判断启动（judge 0 次、无结果行）、工具回执 ok:false 且可操作（缺什么、本角色允许什么、
//        未写账本/未发行路径），账本无 customer.decision，写集未发行（后续 write_file 仍被 F4 拒）。
//   T16：同一轮补齐 flowId+cardKind 重发 ⇒ 合法卡到达通道；判断启动并自动代批；恰一条结果行；
//        账本 decisionEvidence.kind="judge"；不因前一次拒绝被去重拦截。
//   T17（零回归）：合法 write / schedule-write / appointment-write 卡仍可用；liaison 的 confirm 被拒；
//        项目角色的 confirm 原样到达通道（无 judgeContext）；single/su 旧卡路径不变；
//        choice 卡缺 cardKind 的角色兜底不变（O1 未授权，逐字保留）。
//
// 纪律：只经产品公开面（真实 run-role/gate/issuer/客户通道/桌面 Interface + 脚本化模型/判断桩）；
// 不 import 任何实施方单元测试。不读 .env、不跑真实模型/凭据/网络。

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  ANS_REL,
  FLOW,
  FLOW_REL,
  GOV_REL,
  GOV_YAML,
  NOMINATION_REL,
  PROPOSAL_REL,
  approveReport,
  exists,
  flowDoc,
  intentDoc,
  makeHarness,
  makeRoot,
  nominationDoc,
  proposalDoc,
  scriptedAdapterFactory,
  seedLedger,
  seedTrioProject,
  sha256,
  write,
  type ScriptContext,
  type ToolResultRecord,
} from "./fixture.ts";
import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { flushGovernanceLedger, readGovernanceLedger } from "../../../src/common/编排/governance-ledger.ts";
import { configureDiagnostics, createDiagnosticLogger } from "../../../src/common/shared/diagnostics.ts";
import type {
  CustomerInputFn,
  CustomerInputMetadata,
  CustomerInputRequest,
} from "../../../src/model/runtime.ts";
import type { ProjectConfig } from "../../../src/model/role.ts";

const INTENT_REL = "docs/intents/intent-a.md";
const WORKFLOW_REL = "docs/workflow.md";
const WORKFLOW_BODY = "工作流：实现 → 验证 → 验收。\n";

// —————————————— 直接捕获 `governance-judge.started`（E2 验收证据） ——————————————
// 客户通道的 `runJudge` 在调用判断驱动前经共享诊断存储记录 `governance-judge.started`。
// 这里把诊断存储指向本文件专用的临时目录，并用「写入屏障」保证此前诊断已按序落盘，
// 从而**直接**断言该事件计数（而不是只靠 raw 通道 0 次的结构性推理）。

let diagTemp: { root: string; cleanup(): void } | undefined;

before(() => {
  diagTemp = makeRoot("governance-diag");
  configureDiagnostics({ directory: diagTemp.root });
});

after(async () => {
  if (diagTemp === undefined) return;
  try {
    // 最后一次屏障：确保已入队的诊断已落盘（供人工复查时目录内容完整）。
    await diagnosticBarrier();
  } catch {
    /* 尽力排空；失败不改变测试结论 */
  }
  // 不删除诊断临时目录：产品诊断队列在会话收尾后仍可能有滞后写入，删除会制造
  // ENOENT 噪声且不影响断言。目录位于系统临时区（ans-governance-e2e-governance-diag-*），
  // 由操作系统临时目录清理机制回收。
});

interface DiagnosticRow {
  event?: unknown;
  component?: unknown;
  requestId?: unknown;
  toolCallId?: unknown;
}

function readDiagnosticRows(directory: string): DiagnosticRow[] {
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }
  const rows: DiagnosticRow[] = [];
  for (const name of names) {
    if (!name.startsWith("ans-diagnostics-")) continue;
    let text: string;
    try {
      text = readFileSync(path.join(directory, name), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      try {
        rows.push(JSON.parse(line) as DiagnosticRow);
      } catch {
        /* 坏行忽略（不影响计数断言） */
      }
    }
  }
  return rows;
}

/**
 * 诊断写入屏障：追加一条**本次调用独有**的 `test.barrier.<seq>` 记录并等它落盘。
 * 诊断队列是 FIFO，该标记出现即代表此前（含本轮）所有诊断记录已经写完——此时读取的计数才稳定。
 * 不能只等任意 `test.barrier`：同一文件内先前用例留下的旧屏障行会让轮询提前返回
 * （2026-10-22 全量并发运行暴露的测试缺陷）。
 */
let barrierSeq = 0;
async function diagnosticBarrier(): Promise<DiagnosticRow[]> {
  if (diagTemp === undefined) throw new Error("诊断存储未配置");
  barrierSeq += 1;
  const marker = `test.barrier.${barrierSeq}`;
  createDiagnosticLogger({ component: "test:barrier" }).record(marker, { count: barrierSeq });
  const startedAt = Date.now();
  for (;;) {
    const rows = readDiagnosticRows(diagTemp.root);
    if (rows.some((row) => row.event === marker)) return rows;
    if (Date.now() - startedAt > 5000) throw new Error(`诊断写入屏障超时（5s，等待 ${marker}）`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function judgeStartedCount(rows: DiagnosticRow[]): number {
  return rows.filter((row) => row.event === "governance-judge.started").length;
}

/** 按组件拆分的 started 行（产品在两处记录同名事件：桌面通道与编排判断驱动）。 */
function judgeStartedRowsOf(rows: DiagnosticRow[], component: string): DiagnosticRow[] {
  return rows.filter((row) => row.event === "governance-judge.started" && row.component === component);
}

/** 缺 flowId 的治理 confirm（cardKind 合法、preview 对声明路径给出正文）。 */
function missingFlowIdConfirm(toolCallId: string) {
  return {
    name: "request_confirmation",
    toolCallId,
    args: {
      title: `写盘确认 ${FLOW}`,
      preview: `将写入 ${WORKFLOW_REL}\n\n## ${WORKFLOW_REL}\n\n正文：${WORKFLOW_BODY}`,
      cardKind: "write",
    },
  };
}

/** 补齐 flowId+cardKind 的合法治理 confirm（同一张卡内容的修正版）。 */
function validWriteConfirm(toolCallId: string) {
  return {
    name: "request_confirmation",
    toolCallId,
    args: {
      title: `写盘确认 ${FLOW}`,
      preview: `将写入 ${WORKFLOW_REL}\n\n## ${WORKFLOW_REL}\n\n正文：${WORKFLOW_BODY}`,
      flowId: FLOW,
      cardKind: "write",
    },
  };
}

// —————————————————————— T15：无效卡零副作用 ——————————————————————

test("T15：convener 缺 flowId 的 confirm（双开关全开）⇒ 零通道/零呈现/零判断/零记账/写集未发行", async () => {
  let judgeCalls = 0;
  const h = await makeHarness({
    tag: "invalid-card-t15",
    approval: true,
    decision: true,
    judge: {
      reportFor: (parsed) => {
        judgeCalls += 1;
        return approveReport(parsed);
      },
    },
    scriptForRole: (ctx: ScriptContext) =>
      ctx.roleId === "convener" && ctx.prompt.includes("请据提案写出工作流")
        ? [
            missingFlowIdConfirm("tc-invalid-confirm"),
            { name: "write_file", args: { path: WORKFLOW_REL, content: WORKFLOW_BODY } },
          ]
        : [],
  });
  try {
    await h.open("convener");
    const sent = await h.send("convener", "请据提案写出工作流；先发写盘确认卡。");
    assert.equal(sent.ok, true, sent.error ?? "");
    await h.waitFor(() => h.results.filter((result) => result.name === "request_confirmation").length === 1, 5000);
    await h.waitFor(() => h.results.some((result) => result.name === "write_file"), 5000);

    // 工具回执：ok:false、明确「卡片未发出/未向客户呈现」且可操作；不得说成客户拒绝。
    const receipt = h.results.find((result) => result.name === "request_confirmation")!;
    assert.equal(receipt.ok, false, "无效治理卡必须被拒");
    assert.match(receipt.message, /治理确认卡未发出/, "回执须说明卡片未发出");
    assert.match(receipt.message, /未向客户呈现/, "回执须说明客户从未看到卡片");
    assert.match(receipt.message, /缺少合法的 flowId/, "回执须指出缺什么（flowId）");
    assert.match(receipt.message, /本角色允许：write \/ schedule-write/, "回执须给出本角色允许的确认卡种");
    assert.match(receipt.message, /本次未发行任何写入路径、未写入账本/, "回执须说明未发行/未记账");
    assert.match(receipt.message, /请补齐后重新调用/, "回执须给出补齐重发的可操作指引");
    assert.doesNotMatch(receipt.message, /未获客户同意/, "不得把应用拒绝说成「未获客户同意」");

    // 零副作用：raw 客户通道 / presenter / request id / pending / queued / judging / 镜像面。
    assert.equal(h.rawCustomerInputs.length, 0, "守卫必须在调用原始客户通道之前拒绝");
    assert.equal(h.presented.length, 0, "presenter 0 次（含镜像呈现）");
    assert.equal(h.nextIdCalls, 0, "不得生成 request id");
    assert.equal(h.channel.pendingCount(), 0, "不得占用 pending");
    assert.equal(h.channel.queuedCount(), 0, "不得占用 queued");
    assert.equal(h.channel.judgingCount(), 0, "不得进入判断");
    assert.equal(h.channel.replayPending(), 0);
    assert.equal(h.channel.pendingRoles().size, 0, "无按角色挂起");

    // 零判断：判断会话 0 次、无结果行。通道的 `governance-judge.started` 只在 runJudge 内记录，
    // 而 runJudge 仅对已到达通道的卡片运行——上述 pending/queued/judging/raw 全零即结构性证明。
    assert.equal(judgeCalls, 0, "判断会话 0 次");
    assert.equal(h.judgeRows.length, 0, "无 judge 结果行");
    // E2 直接断言（验收要求）：诊断存储中不得出现 `governance-judge.started`。
    // 写入屏障保证此前诊断已 FIFO 落盘；同时断言判断驱动函数 0 次调用
    // （通道在记录 started 后立即调用驱动，二者一一对应）。
    const diagRows = await diagnosticBarrier();
    assert.equal(judgeStartedCount(diagRows), 0, "诊断中不得出现 governance-judge.started");
    assert.equal(h.judgeInvocations, 0, "判断驱动 0 次调用（started 后立即调用）");

    // 写集未发行：同轮后续 write_file 仍被 F4 拒，文件不存在。
    const writeResult = h.results.find((result) => result.name === "write_file")!;
    assert.equal(writeResult.ok, false, "未确认路径必须被门禁拒绝");
    assert.match(writeResult.message, /写入被拒绝/, "须给出拒绝文案");
    assert.match(writeResult.message, /（F4）/, "拒绝须来自 F4（未发行写集）");
    assert.match(writeResult.message, /docs\/workflow\.md/, "拒绝须点名目标路径");
    assert.equal(exists(h.root, WORKFLOW_REL), false, "文件不得落盘");

    // 账本：无 customer.decision（未写入任何决定）。
    const ledger = await h.waitForLedger(() => true);
    assert.deepEqual(ledger.errors, [], "账本可读、无坏行");
    assert.equal(
      ledger.entries.some((entry) => entry.kind === "customer.decision"),
      false,
      "无效卡不得写客户决定账本",
    );
  } finally {
    await h.stop();
    h.cleanup();
  }
});

// —————————————————————— T16：补齐重发成功 ——————————————————————

test("T16：同一轮补齐 flowId+cardKind 重发 ⇒ 判断启动、自动代批、恰一条结果行、账本 judge", async () => {
  let judgeCalls = 0;
  const h = await makeHarness({
    tag: "invalid-card-t16",
    approval: true,
    decision: true,
    judge: {
      reportFor: (parsed) => {
        judgeCalls += 1;
        return approveReport(parsed);
      },
    },
    scriptForRole: (ctx: ScriptContext) =>
      ctx.roleId === "convener" && ctx.prompt.includes("第一次漏了 flowId")
        ? [
            missingFlowIdConfirm("tc-invalid-confirm"),
            validWriteConfirm("tc-valid-confirm"),
            { name: "write_file", args: { path: WORKFLOW_REL, content: WORKFLOW_BODY } },
          ]
        : [],
  });
  try {
    await h.open("convener");
    const sent = await h.send("convener", "第一次漏了 flowId；请补齐后重发同一张卡。");
    assert.equal(sent.ok, true, sent.error ?? "");
    await h.waitFor(() => h.results.filter((result) => result.name === "request_confirmation").length === 2, 5000);
    await h.waitFor(() => h.results.some((result) => result.name === "write_file"), 5000);

    const receipts = h.results.filter((result) => result.name === "request_confirmation");
    assert.equal(receipts.length, 2, "同一轮两次 request_confirmation");
    assert.equal(receipts[0]!.ok, false, "第一张（缺 flowId）必须被拒");
    assert.match(receipts[0]!.message, /治理确认卡未发出/);
    assert.equal(receipts[1]!.ok, true, "补齐后第二张必须被接受（不被前一次拒绝去重拦截）");

    // 合法卡到达通道并自动代批：0 手批卡、恰一条 judge 结果行。
    assert.equal(h.rawCustomerInputs.length, 1, "只有合法卡到达原始客户通道");
    assert.equal(h.nextIdCalls, 1, "只有合法卡生成 request id");
    assert.equal(h.presented.length, 0, "开关全开 + 判断 approve ⇒ 0 张客户卡");
    assert.equal(h.channel.pendingCount(), 0);
    assert.equal(h.channel.queuedCount(), 0);
    assert.equal(h.channel.judgingCount(), 0);
    assert.equal(judgeCalls, 1, "判断会话恰 1 次（无效卡不启动判断）");
    assert.equal(h.judgeRows.length, 1, "恰一条 judge 结果行");
    assert.equal(h.judgeRows[0]!.cardKind, "write");
    assert.equal(h.judgeRows[0]!.group, "approval");
    // 正对照：同一诊断存储中 `governance-judge.started` 恰在「桌面通道」与「编排判断驱动」各 1 行
    // （T15 两处均为 0 + 本用例合法卡真正启动 1 次），证明捕获机制有效，T15 的 0 计数不是测量失败。
    const diagRows = await diagnosticBarrier();
    assert.equal(
      judgeStartedRowsOf(diagRows, "desktop.customer-input").length,
      1,
      "桌面通道判断启动恰 1 次（governance-judge.started）",
    );
    assert.equal(
      judgeStartedRowsOf(diagRows, "orchestration.governance-judge").length,
      1,
      "编排判断驱动启动恰 1 次（governance-judge.started）",
    );
    assert.equal(h.judgeInvocations, 1, "判断驱动恰 1 次调用");

    assert.equal(exists(h.root, WORKFLOW_REL), true, "确认后 write_file 真正落盘");
    assert.equal(h.results.find((result) => result.name === "write_file")!.ok, true);

    // 账本：恰一条 customer.decision，代批证据 kind=judge，路径入账。
    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.decisionEvidence?.kind === "judge"),
      5000,
    );
    assert.deepEqual(ledger.errors, [], "账本可读、无坏行");
    const decisions = ledger.entries.filter((entry) => entry.kind === "customer.decision");
    assert.equal(decisions.length, 1, "恰一条客户决定账本（无效卡不记账）");
    const decision = decisions[0]!;
    // 普通 write 确认按既有语义只留痕「客户是否同意」，不产生 decisionKind（不解锁治理门禁）。
    assert.equal(decision.decisionKind, undefined);
    assert.equal(decision.actorRoleId, "convener");
    assert.equal(decision.customerDecision, "accepted");
    assert.equal(decision.decisionEvidence?.kind, "judge", "decisionEvidence.kind 必须是 judge");
    assert.deepEqual(decision.paths, [WORKFLOW_REL], "写盘确认逐路径入账");
  } finally {
    await h.stop();
    h.cleanup();
  }
});

// —————————————————————— T17：零回归 ——————————————————————

test("T17a：合法 write 卡（rapporteur）仍走判断链并自动代批", async () => {
  const h = await makeHarness({
    tag: "regression-legal-write",
    approval: true,
    decision: true,
    scriptForRole: (ctx: ScriptContext) => {
      if (ctx.roleId !== "rapporteur" || !ctx.prompt.includes("请把提案写入 docs/proposals")) return [];
      const content = proposalDoc(FLOW);
      return [
        {
          name: "request_confirmation",
          toolCallId: "tc-legal-write",
          args: {
            title: `写提案 ${FLOW} v1`,
            preview: `将写入 ${PROPOSAL_REL}\n\n## ${PROPOSAL_REL}\n\n正文：${content}`,
            flowId: FLOW,
            cardKind: "write",
          },
        },
        { name: "write_file", args: { path: PROPOSAL_REL, content } },
      ];
    },
  });
  try {
    await h.open("rapporteur");
    const sent = await h.send("rapporteur", "请把提案写入 docs/proposals。");
    assert.equal(sent.ok, true, sent.error ?? "");

    const ledger = await h.waitForLedger((entries) => entries.some((entry) => entry.decisionEvidence?.kind === "judge"));
    assert.equal(h.presented.length, 0, "合法卡仍自动代批（0 手批卡）");
    assert.equal(h.judgeRows.length, 1, "恰一条结果行");
    assert.equal(h.judgeRows[0]!.cardKind, "write");
    assert.equal(h.rawCustomerInputs.length, 1);
    assert.equal(exists(h.root, PROPOSAL_REL), true, "合法确认后文件落盘");
    const decision = ledger.entries.find((entry) => entry.kind === "customer.decision")!;
    assert.equal(decision.decisionEvidence?.kind, "judge");
  } finally {
    await h.stop();
    h.cleanup();
  }
});

test("T17b：合法 schedule-write 卡（convener）仍走判断链并自动代批", async () => {
  const temp = makeRoot("regression-schedule-write");
  seedTrioProject(temp.root);
  // 前置：提案已被客户接受（write-flow 门禁）。
  await seedLedger(temp.root, [
    { decisionKind: "proposal-accept", customerDecision: "accepted", actorRoleId: "rapporteur", power: "proposal" },
  ]);
  const flowContent = flowDoc(FLOW, [{ id: "impl", status: "pending" }]);
  const h = await makeHarness({
    tag: "regression-schedule-write",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx: ScriptContext) => {
      if (ctx.roleId !== "convener" || !ctx.prompt.includes("请把已接受提案排成流程")) return [];
      return [
        {
          name: "request_confirmation",
          toolCallId: "tc-legal-schedule-write",
          args: {
            title: `写流程 ${FLOW}`,
            preview: `将写入 ${FLOW_REL}\n\n## ${FLOW_REL}\n\n\`\`\`yaml\n${flowContent}\`\`\`\n`,
            flowId: FLOW,
            cardKind: "schedule-write",
          },
        },
        { name: "write_file", args: { path: FLOW_REL, content: flowContent } },
      ];
    },
  });
  try {
    await h.open("convener");
    const sent = await h.send("convener", "请把已接受提案排成流程 YAML。");
    assert.equal(sent.ok, true, sent.error ?? "");

    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.decisionKind === "schedule-write"),
      5000,
    );
    assert.equal(h.presented.length, 0, "合法 schedule-write 仍自动代批");
    assert.equal(h.judgeRows.length, 1);
    assert.equal(h.judgeRows[0]!.cardKind, "schedule-write");
    assert.equal(exists(h.root, FLOW_REL), true, "流程 YAML 落盘");
    const decision = ledger.entries.find((entry) => entry.decisionKind === "schedule-write")!;
    assert.equal(decision.decisionEvidence?.kind, "judge");
    assert.equal(decision.actorRoleId, "convener");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("T17c：合法 appointment-write 卡（nominator）仍走判断链并自动代批", async () => {
  const ROLE_CARD_REL = "角色卡/executor/role-card.md";
  const ROLE_BOUNDARY_REL = "角色卡/executor/boundary.yaml";
  const roleCardBody = "# 角色：executor\n\n由 Nominator 写出。\n";
  const boundaryBody = "role: executor\nentries:\n  - kind: directory\n    path: src/owned-executor/\n    purpose: 角色代码\n";
  // preview 正文不重复机器可读的 `path:` 行或含斜杠的散文（那会被产品当作额外声明写入路径做探测）。
  const boundaryPreviewBody = "边界正文：可写目录及其目的条目。\n";

  const temp = makeRoot("regression-appointment-write");
  seedTrioProject(temp.root);
  write(temp.root, NOMINATION_REL, nominationDoc(FLOW, ["executor"]));
  // 前置：提案接受 + 客户已任命 executor（写卡门禁）。
  await seedLedger(temp.root, [
    { decisionKind: "proposal-accept", customerDecision: "accepted", actorRoleId: "rapporteur", power: "proposal" },
    {
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "nominator",
      power: "nomination",
      targetRoleIds: ["executor"],
    },
  ]);
  const h = await makeHarness({
    tag: "regression-appointment-write",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx: ScriptContext) => {
      if (ctx.roleId !== "nominator" || !ctx.prompt.includes("客户已任命 executor")) return [];
      return [
        {
          name: "request_confirmation",
          toolCallId: "tc-legal-appointment-write",
          args: {
            title: `写角色卡 executor`,
            preview:
              `将写入：\n- ${ROLE_CARD_REL}\n\n## ${ROLE_CARD_REL}\n\n${roleCardBody}\n` +
              `- ${ROLE_BOUNDARY_REL}\n\n## ${ROLE_BOUNDARY_REL}\n\n${boundaryPreviewBody}\n`,
            flowId: FLOW,
            cardKind: "appointment-write",
          },
        },
        { name: "write_file", args: { path: ROLE_CARD_REL, content: roleCardBody } },
        { name: "write_file", args: { path: ROLE_BOUNDARY_REL, content: boundaryBody } },
      ];
    },
  });
  try {
    await h.open("nominator");
    const sent = await h.send("nominator", "客户已任命 executor，请写出角色卡与边界。");
    assert.equal(sent.ok, true, sent.error ?? "");

    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.decisionKind === "appointment-write"),
      5000,
    );
    assert.equal(h.presented.length, 0, "合法 appointment-write 仍自动代批");
    assert.equal(h.judgeRows.length, 1);
    assert.equal(h.judgeRows[0]!.cardKind, "appointment-write");
    assert.equal(exists(h.root, ROLE_CARD_REL), true, "角色卡落盘");
    assert.equal(exists(h.root, ROLE_BOUNDARY_REL), true, "角色边界落盘");
    const decision = ledger.entries.find((entry) => entry.decisionKind === "appointment-write")!;
    assert.equal(decision.decisionEvidence?.kind, "judge");
    assert.deepEqual(decision.paths?.slice().sort(), [ROLE_BOUNDARY_REL, ROLE_CARD_REL].sort());
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("T17d：liaison 的 confirm 一律被拒（缺 cardKind 与显式越权两种），raw 通道 0 次", async () => {
  const h = await makeHarness({
    tag: "regression-liaison-confirm",
    approval: true,
    decision: true,
    scriptForRole: (ctx: ScriptContext) => {
      if (ctx.roleId !== "liaison") return [];
      if (ctx.prompt.includes("补上 flowId")) {
        return [
          {
            name: "request_confirmation",
            toolCallId: "tc-liaison-explicit",
            args: {
              title: "写一条治理记录",
              preview: "将写入 docs/governance/liaison/notes.md。",
              flowId: FLOW,
              cardKind: "write",
            },
          },
        ];
      }
      if (ctx.prompt.includes("请发一张确认卡")) {
        return [
          {
            name: "request_confirmation",
            toolCallId: "tc-liaison-missing",
            args: {
              title: "写一条治理记录",
              preview: "将写入 docs/governance/liaison/notes.md。",
            },
          },
        ];
      }
      return [];
    },
  });
  try {
    await h.open("liaison");
    assert.equal((await h.send("liaison", "请发一张确认卡。")).ok, true);
    await h.waitFor(() => h.results.filter((result) => result.name === "request_confirmation").length === 1, 5000);
    assert.equal((await h.send("liaison", "补上 flowId 和 cardKind 再发。")).ok, true);
    await h.waitFor(() => h.results.filter((result) => result.name === "request_confirmation").length === 2, 5000);

    const receipts = h.results.filter((result) => result.name === "request_confirmation");
    assert.equal(receipts[0]!.ok, false, "缺 cardKind ⇒ 拒绝");
    assert.match(receipts[0]!.message, /治理确认卡未发出/);
    assert.match(receipts[0]!.message, /缺少 cardKind/);
    assert.match(receipts[0]!.message, /本角色允许：无/, "liaison 的确认卡允许集为空");
    assert.equal(receipts[1]!.ok, false, "显式越权 cardKind ⇒ 拒绝（既有文案，O4 未授权不改）");
    assert.match(receipts[1]!.message, /治理角色 liaison 不允许 cardKind=write/);
    assert.match(receipts[1]!.message, /允许：intent-confirm/);
    assert.match(receipts[1]!.message, /本次未向客户发卡/);

    assert.equal(h.rawCustomerInputs.length, 0, "liaison 的 confirm 不得到达客户通道");
    assert.equal(h.presented.length, 0);
    assert.equal(h.nextIdCalls, 0);
    assert.equal(h.judgeRows.length, 0);
    const ledger = await h.waitForLedger(() => true);
    assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision"), false);
  } finally {
    await h.stop();
    h.cleanup();
  }
});

test("T17e：项目角色 confirm（无治理字段）原样到达通道、无 judgeContext、手批后写盘成功", async () => {
  const temp = makeRoot("regression-project-role-confirm");
  const roleId = "executor";
  const roleCardRel = `角色卡/${roleId}/role-card.md`;
  const boundaryRel = `角色卡/${roleId}/boundary.yaml`;
  const boundaryText = "role: executor\nentries:\n  - kind: directory\n    path: src/owned-executor/\n    purpose: 角色代码\n";
  const noteRel = "src/owned-executor/note.md";
  write(temp.root, roleCardRel, "# 角色：executor\n");
  write(temp.root, boundaryRel, boundaryText);

  const project: ProjectConfig = {
    projectRoot: temp.root,
    skillRoot: temp.root,
    roles: { [roleId]: { card: roleCardRel, boundary: boundaryRel } },
    builtInRoles: ["su"],
    governanceModel: "trio",
    governanceBoundary: {
      path: boundaryRel,
      acceptance: {
        accepted: true,
        source: "test:t17-project-role",
        pin: [{ path: boundaryRel, sha256: sha256(boundaryText) }],
      },
    },
  };

  const captured: Array<{ req: CustomerInputRequest; metadata?: CustomerInputMetadata }> = [];
  const customerInput: CustomerInputFn = (req, metadata) => {
    captured.push({ req, ...(metadata !== undefined ? { metadata } : {}) });
    return { outcome: "answered", operatorId: "test:客户", value: { confirmed: true } };
  };
  const results: ToolResultRecord[] = [];
  const handle = await openRoleSession(
    { roleId, runtime: "claude", project, customerInput },
    {
      createAdapter: scriptedAdapterFactory({
        root: temp.root,
        scriptForRole: (ctx: ScriptContext) =>
          ctx.roleId === roleId && ctx.turn === 1
            ? [
                {
                  name: "request_confirmation",
                  toolCallId: "tc-project-role-confirm",
                  args: {
                    title: "写实现笔记",
                    preview: `将写入 ${noteRel}\n\n## ${noteRel}\n\n正文：实现笔记正文。\n`,
                    paths: [noteRel],
                  },
                },
                { name: "write_file", args: { path: noteRel, content: "实现笔记正文。\n" } },
              ]
            : [],
        onResult: (record) => results.push(record),
      }),
    },
  );
  try {
    await handle.send("请确认后写实现笔记。");

    assert.equal(captured.length, 1, "项目角色 confirm 应原样到达客户通道");
    const seen = captured[0]!;
    assert.equal(seen.req.kind, "confirm");
    assert.equal(seen.req.flowId, undefined, "不得凭空补 flowId");
    assert.equal(seen.req.cardKind, undefined, "不得凭空补 cardKind");
    assert.equal(seen.metadata?.judgeContext, undefined, "项目角色不得注入 judgeContext");
    assert.equal(seen.metadata?.cardKind, undefined);

    const confirmResult = results.find((result) => result.name === "request_confirmation")!;
    assert.equal(confirmResult.ok, true, "手批后确认回执应成功");
    assert.match(confirmResult.message, /客户已确认/);
    const writeResult = results.find((result) => result.name === "write_file")!;
    assert.equal(writeResult.ok, true, `手批后写盘应成功：${writeResult.message}`);
    assert.equal(exists(temp.root, noteRel), true);

    const ledger = await readLedgerSnapshot(temp.root);
    assert.equal(
      ledger.entries.some((entry) => entry.kind === "customer.decision"),
      false,
      "项目角色手批不写治理客户决定账本",
    );
  } finally {
    await handle.dispose();
    temp.cleanup();
  }
});

/** 读取一次账本快照（项目角色用例在桌面 Harness 之外，直接读产品账本）。 */
async function readLedgerSnapshot(root: string) {
  await flushGovernanceLedger(root);
  return readGovernanceLedger(root);
}

test("T17f：single/su 的 confirm（无治理字段）仍是旧卡：呈现客户、手批成功、判断零介入", async () => {
  const temp = makeRoot("regression-single-su");
  write(temp.root, GOV_REL, GOV_YAML);
  write(
    temp.root,
    ANS_REL,
    JSON.stringify(
      {
        projectRoot: temp.root.replace(/\\/g, "/"),
        skillRoot: temp.root.replace(/\\/g, "/"),
        governanceModel: "single",
        roles: {},
        governanceBoundary: {
          path: GOV_REL,
          acceptance: { accepted: true, source: "test:t17-single-su", pin: [{ path: GOV_REL, sha256: sha256(GOV_YAML) }] },
        },
      },
      null,
      2,
    ) + "\n",
  );
  const noteRel = "docs/notes/su-note.md";
  let judgeCalls = 0;
  const h = await makeHarness({
    tag: "regression-single-su",
    root: temp.root,
    approval: true,
    decision: true,
    judge: {
      reportFor: (parsed) => {
        judgeCalls += 1;
        return approveReport(parsed);
      },
    },
    scriptForRole: (ctx: ScriptContext) =>
      ctx.roleId === "su" && ctx.prompt.includes("请确认写一条笔记")
        ? [
            {
              name: "request_confirmation",
              toolCallId: "tc-su-confirm",
              args: {
                title: "写一条笔记",
                preview: `将写入 ${noteRel}\n\n## ${noteRel}\n\n正文：su 的笔记正文。\n`,
              },
            },
            { name: "write_file", args: { path: noteRel, content: "su 的笔记正文。\n" } },
          ]
        : [],
  });
  try {
    await h.open("su");
    const sending = h.send("su", "请确认写一条笔记。");
    await h.waitFor(() => h.presented.length === 1, 5000);
    const card = h.presented[0]!;
    assert.equal(card.request.cardKind, undefined, "single/su 旧卡不补 cardKind");
    assert.equal(h.judgeRows.length, 0, "single/su 不启用判断");
    assert.equal(judgeCalls, 0, "single/su 判断零调用");

    h.answer(card.id, { kind: "confirm", confirmed: true });
    const sent = await sending;
    assert.equal(sent.ok, true, sent.error ?? "");

    const receipt = h.results.find((result) => result.name === "request_confirmation")!;
    assert.equal(receipt.ok, true, "旧卡手批成功后回执应成功");
    assert.match(receipt.message, /客户已确认/);
    assert.doesNotMatch(receipt.message, /治理确认卡未发出/, "single/su 不受治理守卫影响");
    assert.equal(h.results.find((result) => result.name === "write_file")!.ok, true);
    assert.equal(exists(h.root, noteRel), true, "手批后写入照旧落盘");
    assert.equal(h.rawCustomerInputs.length, 1, "旧卡照常到达客户通道");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("T17g：choice 卡缺 cardKind 的角色兜底不变（liaison ⇒ intent-confirm 自动代批）", async () => {
  const temp = makeRoot("regression-choice-fallback");
  seedTrioProject(temp.root);
  let judgeCalls = 0;
  const h = await makeHarness({
    tag: "regression-choice-fallback",
    root: temp.root,
    approval: true,
    decision: true,
    judge: {
      reportFor: (parsed) => {
        judgeCalls += 1;
        return approveReport(parsed);
      },
    },
    scriptForRole: (ctx: ScriptContext) => {
      if (ctx.roleId !== "liaison" || ctx.prompt.includes("[系统·治理反馈]")) return [];
      if (!ctx.prompt.includes("请向客户确认需求")) return [];
      return [
        { name: "write_file", args: { path: INTENT_REL, content: intentDoc("intent-a") } },
        {
          name: "request_choice",
          toolCallId: "tc-choice-fallback",
          args: {
            title: "需求确认 intent-a",
            question: "请确认目标、范围与验收标准。",
            flowId: FLOW,
            // 2026-10-20 兜底：choice 缺 cardKind 时按角色推断（liaison ⇒ intent-confirm）。
            options: [
              { id: "confirm", label: "确认" },
              { id: "revise", label: "修改" },
            ],
          },
        },
      ];
    },
  });
  try {
    await h.open("liaison");
    const sent = await h.send("liaison", "请向客户确认需求。");
    assert.equal(sent.ok, true, sent.error ?? "");

    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.kind === "customer.decision" && entry.decisionKind === "intent-confirm"),
      5000,
    );
    assert.equal(h.presented.length, 0, "decision 开 ⇒ 兜底后判断代批，0 客户卡");
    assert.equal(judgeCalls, 1);
    assert.equal(h.judgeRows.length, 1);
    assert.equal(h.judgeRows[0]!.cardKind, "intent-confirm", "choice 兜底 cardKind 保持不变");
    const decision = ledger.entries.find(
      (entry) => entry.kind === "customer.decision" && entry.decisionKind === "intent-confirm",
    )!;
    assert.equal(decision.decisionEvidence?.kind, "judge");
    assert.equal(h.rawCustomerInputs.length, 1, "兜底后的 choice 卡到达客户通道");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
