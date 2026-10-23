// test/测试/governance-e2e-auto/o-slug-trailing-hyphen.test.ts
// 2026-10-22 共享治理 slug 收紧（禁止尾连字符）——测试角色 S5 跨角色独立验证。
//
// 覆盖（设计 §6.1 S5、验收标准 S10/E6/E7）：
//   S5-1a：rapporteur 的 request_confirmation/request_choice/request_clarification 传
//          flowId "flow-"/"a-" 或 stepId "impl-" 或 intentId "intent-" ⇒ 工具 ok:false、
//          点名字段与新正则；raw 通道/呈现/判断/账本全零。
//   S5-1b：liaison 的 hand_off_intent 传 intentId "intent-" / flowId "flow-" ⇒ 同上，且不派发。
//   S5-1c：convener 的 dispatch_task 传 flowId "flow-" / stepId "impl-" ⇒ 同上，且不派发。
//   S5-2：确认卡声明 docs/flows/flow-.yaml / docs/flows/a-.yml ⇒ Flow YAML 闸显式拒绝
//          （不得静默跳过 YAML 校验）；raw 0、文件不落盘。
//   S5-3a/3b：旧账本 `intent.handed-off` 或提案 frontmatter 的非空非法 intentId "intent-" ⇒
//          判断证据 fail-closed（不调用模型、无 approve 行、无客户决定账本），不静默回落。
//   S5-4：合法 slug（flow-a、a--b、ab、64 位）经真实 run-role/gate/issuer/channel/判断链全链路可用。
//
// 纪律：真实产品公开面 + 脚本化模型/判断桩；不 import 实施方单元测试；不读 .env、不跑真实模型/网络。

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  FLOW,
  PROPOSAL_REL,
  approveReport,
  exists,
  makeHarness,
  makeRoot,
  proposalDoc,
  seedLedger,
  seedTrioProject,
  write,
  type ScriptContext,
} from "./fixture.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../../src/model/runtime.ts";
import { configureDiagnostics, createDiagnosticLogger } from "../../../src/common/shared/diagnostics.ts";

// —————————————— 诊断直接捕获（governance-judge.started 零断言用） ——————————————
// 与 n-invalid-governance-card.test.ts 同口径：诊断存储指向本文件专用临时目录，追加每次唯一的
// `test.barrier.<seq>` 行并等待其落盘（FIFO），再计数。

let diagTemp: { root: string; cleanup(): void } | undefined;

before(() => {
  diagTemp = makeRoot("slug-diag");
  configureDiagnostics({ directory: diagTemp.root });
});

after(async () => {
  if (diagTemp === undefined) return;
  try {
    await diagnosticBarrier();
  } catch {
    /* 尽力排空；不改变测试结论 */
  }
  // 不删除目录：产品诊断队列可能有滞后写入；目录位于系统临时区，交由 OS 清理。
});

interface DiagnosticRow {
  event?: unknown;
  component?: unknown;
  reasonCode?: unknown;
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
        /* 坏行忽略 */
      }
    }
  }
  return rows;
}

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

function judgeStartedRows(rows: DiagnosticRow[], component: string): DiagnosticRow[] {
  return rows.filter((row) => row.event === "governance-judge.started" && row.component === component);
}

/** 当前已落盘的 started 行数（用于「本轮增量」断言；同一文件内多个用例共享诊断存储）。 */
function startedCountNow(component: string): number {
  if (diagTemp === undefined) return 0;
  return judgeStartedRows(readDiagnosticRows(diagTemp.root), component).length;
}

/** 驱动以 `intent-unconfirmed` 归因 manual 的诊断行（直接证据，不靠回执文案推断）。 */
function intentUnconfirmedRows(rows: DiagnosticRow[]): DiagnosticRow[] {
  return rows.filter((row) => row.event === "governance-judge.manual" && row.reasonCode === "intent-unconfirmed");
}

function intentUnconfirmedCountNow(): number {
  if (diagTemp === undefined) return 0;
  return intentUnconfirmedRows(readDiagnosticRows(diagTemp.root)).length;
}

function assertSlugMessage(message: string, field: string): void {
  assert.match(message, new RegExp(`参数 ${field} 非法`), `回执须点名非法字段 ${field}：${message}`);
  assert.ok(
    message.includes(GOVERNANCE_SLUG_PATTERN),
    `回执须展示现行正则 ${GOVERNANCE_SLUG_PATTERN}：${message}`,
  );
}

function assertZeroSideEffects(h: Awaited<ReturnType<typeof makeHarness>>): void {
  assert.equal(h.rawCustomerInputs.length, 0, "原始客户通道 0 次");
  assert.equal(h.presented.length, 0, "presenter/镜像面 0 次");
  assert.equal(h.nextIdCalls, 0, "不得生成 request id");
  assert.equal(h.channel.pendingCount(), 0, "pending 0");
  assert.equal(h.channel.queuedCount(), 0, "queued 0");
  assert.equal(h.channel.judgingCount(), 0, "judging 0");
}

// —————————————— S5-1a：rapporteur 的 confirm / choice / clarification ——————————————

test("S5-1a：rapporteur 五工具中的 confirm/choice/clarification 传尾连字符 slug ⇒ 工具失败、零通道/零判断/零账本", async () => {
  let judgeCalls = 0;
  const h = await makeHarness({
    tag: "slug-negative-rapporteur",
    approval: true,
    decision: true,
    judge: {
      reportFor: (parsed) => {
        judgeCalls += 1;
        return approveReport(parsed);
      },
    },
    scriptForRole: (ctx: ScriptContext) =>
      ctx.roleId === "rapporteur" && ctx.prompt.includes("S5NEG-RAPPORTEUR")
        ? [
            {
              name: "request_confirmation",
              toolCallId: "tc-neg-confirm-flow",
              args: {
                title: "写提案（非法 flowId）",
                preview: "将写入 docs/proposals/x.md\n\n## docs/proposals/x.md\n\n正文：x\n",
                flowId: "flow-",
                cardKind: "write",
              },
            },
            {
              name: "request_confirmation",
              toolCallId: "tc-neg-confirm-step",
              args: {
                title: "写提案（非法 stepId）",
                preview: "将写入 docs/proposals/x.md\n\n## docs/proposals/x.md\n\n正文：x\n",
                flowId: "flow-a",
                stepId: "impl-",
                cardKind: "write",
              },
            },
            {
              name: "request_choice",
              toolCallId: "tc-neg-choice-flow",
              args: {
                title: "提案选择（非法 flowId）",
                question: "接受吗？",
                flowId: "a-",
                options: [
                  { id: "accept", label: "接受" },
                  { id: "revise", label: "修改" },
                ],
              },
            },
            {
              name: "request_choice",
              toolCallId: "tc-neg-choice-step",
              args: {
                title: "提案选择（非法 stepId）",
                question: "接受吗？",
                flowId: "flow-a",
                stepId: "impl-",
                options: [
                  { id: "accept", label: "接受" },
                  { id: "revise", label: "修改" },
                ],
              },
            },
            {
              name: "request_clarification",
              toolCallId: "tc-neg-clarify-flow",
              args: {
                question: "请澄清验收口径。",
                flowId: "a-",
              },
            },
            {
              name: "request_clarification",
              toolCallId: "tc-neg-clarify-intent",
              args: {
                question: "请澄清验收口径。",
                flowId: "flow-a",
                intentId: "intent-",
              },
            },
          ]
        : [],
  });
  try {
    await h.open("rapporteur");
    const channelStartedBefore = startedCountNow("desktop.customer-input");
    const driverStartedBefore = startedCountNow("orchestration.governance-judge");
    const sent = await h.send("rapporteur", "S5NEG-RAPPORTEUR：请按脚本调用。");
    assert.equal(sent.ok, true, sent.error ?? "");
    await h.waitFor(() => h.results.length >= 6, 5000);

    const confirmations = h.results.filter((result) => result.name === "request_confirmation");
    const choices = h.results.filter((result) => result.name === "request_choice");
    const clarifications = h.results.filter((result) => result.name === "request_clarification");
    assert.equal(confirmations.length, 2);
    assert.equal(choices.length, 2);
    assert.equal(clarifications.length, 2);
    for (const result of [...confirmations, ...choices, ...clarifications]) {
      assert.equal(result.ok, false, `${result.name} 必须拒绝：${result.message}`);
    }
    assertSlugMessage(confirmations[0]!.message, "flowId");
    assertSlugMessage(confirmations[1]!.message, "stepId");
    assertSlugMessage(choices[0]!.message, "flowId");
    assertSlugMessage(choices[1]!.message, "stepId");
    assertSlugMessage(clarifications[0]!.message, "flowId");
    assertSlugMessage(clarifications[1]!.message, "intentId");

    assertZeroSideEffects(h);
    assert.equal(judgeCalls, 0, "判断会话 0 次");
    assert.equal(h.judgeRows.length, 0, "无 judge 结果行");
    const diagRows = await diagnosticBarrier();
    assert.equal(
      judgeStartedRows(diagRows, "desktop.customer-input").length - channelStartedBefore,
      0,
      "通道不得记录 governance-judge.started",
    );
    assert.equal(
      judgeStartedRows(diagRows, "orchestration.governance-judge").length - driverStartedBefore,
      0,
      "驱动不得记录 governance-judge.started",
    );
    const ledger = await h.waitForLedger(() => true);
    assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision"), false, "无客户决定账本");
  } finally {
    await h.stop();
    h.cleanup();
  }
});

// —————————————— S5-1b：liaison 的 hand_off_intent ——————————————

test("S5-1b：liaison 的 hand_off_intent 传 intentId「intent-」/flowId「flow-」⇒ 工具失败、不交接", async () => {
  const baseArgs = {
    handoffKind: "initial",
    goal: "目标",
    scope: "范围",
    acceptance: "验收",
    summary: "摘要",
  };
  const h = await makeHarness({
    tag: "slug-negative-liaison",
    approval: true,
    decision: true,
    scriptForRole: (ctx: ScriptContext) =>
      ctx.roleId === "liaison" && ctx.prompt.includes("S5NEG-LIAISON")
        ? [
            {
              name: "hand_off_intent",
              toolCallId: "tc-neg-handoff-intent",
              args: { ...baseArgs, intentId: "intent-", flowId: "flow-a" },
            },
            {
              name: "hand_off_intent",
              toolCallId: "tc-neg-handoff-flow",
              args: { ...baseArgs, intentId: "intent-a", flowId: "flow-" },
            },
          ]
        : [],
  });
  try {
    await h.open("liaison");
    const sent = await h.send("liaison", "S5NEG-LIAISON：请按脚本调用。");
    assert.equal(sent.ok, true, sent.error ?? "");
    await h.waitFor(() => h.results.filter((result) => result.name === "hand_off_intent").length >= 2, 5000);

    const receipts = h.results.filter((result) => result.name === "hand_off_intent");
    assert.equal(receipts.length, 2);
    assert.equal(receipts[0]!.ok, false);
    assert.equal(receipts[1]!.ok, false);
    assertSlugMessage(receipts[0]!.message, "intentId");
    assertSlugMessage(receipts[1]!.message, "flowId");

    assert.equal(h.rawCustomerInputs.length, 0);
    assert.equal(h.presented.length, 0);
    assert.equal(h.prompts.get("rapporteur")?.length ?? 0, 0, "不得向 Rapporteur 投递任务");
    const ledger = await h.waitForLedger(() => true);
    assert.equal(ledger.entries.some((entry) => entry.kind === "intent.handed-off"), false, "不得写交接账本");
  } finally {
    await h.stop();
    h.cleanup();
  }
});

// —————————————— S5-1c：convener 的 dispatch_task ——————————————

test("S5-1c：convener 的 dispatch_task 传 flowId「flow-」/stepId「impl-」⇒ 工具失败、不派发", async () => {
  const h = await makeHarness({
    tag: "slug-negative-convener",
    approval: true,
    decision: true,
    scriptForRole: (ctx: ScriptContext) =>
      ctx.roleId === "convener" && ctx.prompt.includes("S5NEG-CONVENER")
        ? [
            {
              name: "dispatch_task",
              toolCallId: "tc-neg-dispatch-flow",
              args: { roleId: "executor", task: "执行 impl", flowId: "flow-" },
            },
            {
              name: "dispatch_task",
              toolCallId: "tc-neg-dispatch-step",
              args: { roleId: "executor", task: "执行 impl", flowId: "flow-a", stepId: "impl-" },
            },
          ]
        : [],
  });
  try {
    await h.open("convener");
    const sent = await h.send("convener", "S5NEG-CONVENER：请按脚本调用。");
    assert.equal(sent.ok, true, sent.error ?? "");
    await h.waitFor(() => h.results.filter((result) => result.name === "dispatch_task").length >= 2, 5000);

    const receipts = h.results.filter((result) => result.name === "dispatch_task");
    assert.equal(receipts.length, 2);
    assert.equal(receipts[0]!.ok, false);
    assert.equal(receipts[1]!.ok, false);
    assertSlugMessage(receipts[0]!.message, "flowId");
    assertSlugMessage(receipts[1]!.message, "stepId");

    assert.equal(h.prompts.has("executor"), false, "不得打开/派发 executor 会话");
    const ledger = await h.waitForLedger(() => true);
    assert.equal(ledger.entries.some((entry) => entry.kind === "dispatch.accepted"), false, "不得写派发账本");
  } finally {
    await h.stop();
    h.cleanup();
  }
});

// —————————————— S5-2：Flow YAML 路径闸显式拒绝 ——————————————

test("S5-2：确认卡声明 docs/flows/flow-.yaml 或 docs/flows/a-.yml ⇒ Flow YAML 闸显式拒绝、raw 0、不落盘", async () => {
  const badYamlRel = "docs/flows/flow-.yaml";
  const badYmlRel = "docs/flows/a-.yml";
  const yamlBody = ["flowId: flow-a", "version: 1", "qualityTier: production", "steps:", "  - id: impl", "    title: impl", "    owner: executor", "    kind: dispatch", "    status: pending", ""].join("\n");
  const h = await makeHarness({
    tag: "slug-flow-yaml-path",
    approval: true,
    decision: true,
    scriptForRole: (ctx: ScriptContext) =>
      ctx.roleId === "convener" && ctx.prompt.includes("S5FLOWPATH")
        ? [
            {
              name: "request_confirmation",
              toolCallId: "tc-flow-bad-yaml",
              args: {
                title: "写流程（非法文件名 .yaml）",
                preview: `将写入 ${badYamlRel}\n\n## ${badYamlRel}\n\n\`\`\`yaml\n${yamlBody}\`\`\`\n`,
                flowId: "flow-a",
                cardKind: "schedule-write",
              },
            },
            {
              name: "request_confirmation",
              toolCallId: "tc-flow-bad-yml",
              args: {
                title: "写流程（非法文件名 .yml）",
                preview: `将写入 ${badYmlRel}\n\n## ${badYmlRel}\n\n\`\`\`yaml\n${yamlBody}\`\`\`\n`,
                flowId: "flow-a",
                cardKind: "schedule-write",
              },
            },
          ]
        : [],
  });
  try {
    await h.open("convener");
    const sent = await h.send("convener", "S5FLOWPATH：请按脚本调用。");
    assert.equal(sent.ok, true, sent.error ?? "");
    await h.waitFor(() => h.results.filter((result) => result.name === "request_confirmation").length >= 2, 5000);

    const receipts = h.results.filter((result) => result.name === "request_confirmation");
    assert.equal(receipts.length, 2);
    for (const receipt of receipts) assert.equal(receipt.ok, false, receipt.message);
    assert.match(receipts[0]!.message, /docs\/flows\/flow-\.yaml/);
    assert.match(receipts[0]!.message, /「flow-」不是合法 slug/);
    assert.match(receipts[0]!.message, /拒绝该卡（不得跳过 YAML 校验）/);
    assert.ok(receipts[0]!.message.includes(GOVERNANCE_SLUG_PATTERN), "拒绝文案须展示现行正则");
    assert.match(receipts[1]!.message, /docs\/flows\/a-\.yml/);
    assert.match(receipts[1]!.message, /「a-」不是合法 slug/);

    assert.equal(h.rawCustomerInputs.length, 0, "不得触达客户通道（显式拒绝发生在呈现前）");
    assert.equal(h.presented.length, 0);
    assert.equal(h.nextIdCalls, 0);
    assert.equal(exists(h.root, badYamlRel), false, "非法文件名流程文件不得落盘");
    assert.equal(exists(h.root, badYmlRel), false);
    const ledger = await h.waitForLedger(() => true);
    assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision"), false, "不得写客户决定账本");
  } finally {
    await h.stop();
    h.cleanup();
  }
});

// —————————————— S5-3a：旧账本非法 intentId ⇒ intent-unconfirmed fail-closed ——————————————

test("S5-3a：旧账本 intent.handed-off 的 intentId「intent-」⇒ 判断证据 fail-closed、不调用模型、不回落", async () => {
  const temp = makeRoot("slug-old-ledger-intent");
  seedTrioProject(temp.root);
  write(temp.root, PROPOSAL_REL, proposalDoc(FLOW));
  await seedLedger(temp.root, [
    {
      kind: "intent.handed-off",
      flowId: FLOW,
      intentId: "intent-",
      actorRoleId: "liaison",
      power: "liaison",
      targetRoleId: "rapporteur",
    },
  ]);
  let judgeCalls = 0;
  const h = await makeHarness({
    tag: "slug-old-ledger-intent",
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
      ctx.roleId === "rapporteur" && ctx.prompt.includes("S5OLDINTENT")
        ? [
            {
              name: "request_choice",
              toolCallId: "tc-old-intent-choice",
              args: {
                title: `提案 ${FLOW}`,
                question: "接受提案吗？",
                flowId: FLOW,
                cardKind: "proposal",
                options: [
                  { id: "accept", label: "接受" },
                  { id: "revise", label: "修改" },
                  { id: "reject", label: "拒绝" },
                ],
              },
            },
          ]
        : [],
  });
  try {
    await h.open("rapporteur");
    const channelStartedBefore = startedCountNow("desktop.customer-input");
    const unconfirmedBefore = intentUnconfirmedCountNow();
    const sent = await h.send("rapporteur", "S5OLDINTENT：请发提案决定卡。");
    assert.equal(sent.ok, true, sent.error ?? "");
    await h.waitFor(() => h.results.some((result) => result.name === "request_choice"), 5000);

    const receipt = h.results.find((result) => result.name === "request_choice")!;
    assert.equal(receipt.ok, false, "非法旧 intentId 必须 fail-closed");
    assert.match(receipt.message, /intentId（intent-）不符合现行 slug 规则/, "须点名旧值与规则");
    assert.ok(receipt.message.includes(GOVERNANCE_SLUG_PATTERN), "须展示现行正则");
    assert.match(receipt.message, /不得静默跳过或回落/, "须声明不静默回落");

    assert.equal(h.presented.length, 0, "manual 自动退回，不呈现客户卡");
    assert.equal(h.judgeRows.length, 0, "不得产生 approve 结果行");
    assert.equal(judgeCalls, 0, "证据 fail-closed 发生在模型调用之前");
    assert.equal(h.rawCustomerInputs.length, 1, "卡片已到达通道（判断链启动）");
    const diagRows = await diagnosticBarrier();
    assert.equal(
      judgeStartedRows(diagRows, "desktop.customer-input").length - channelStartedBefore,
      1,
      "通道判断恰启动 1 次",
    );
    assert.equal(
      intentUnconfirmedRows(diagRows).length - unconfirmedBefore,
      1,
      "驱动须以 reasonCode=intent-unconfirmed 归因 manual",
    );
    const ledger = await h.waitForLedger(() => true);
    assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision"), false, "不得写客户决定账本");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

// —————————————— S5-3b：提案 frontmatter 非法 intentId ⇒ fail-closed ——————————————

test("S5-3b：提案 frontmatter intentId「intent-」⇒ 判断证据 fail-closed、不回落 flow-id", async () => {
  const temp = makeRoot("slug-old-proposal-intent");
  seedTrioProject(temp.root);
  write(temp.root, PROPOSAL_REL, proposalDoc(FLOW, 1, "intent-"));
  let judgeCalls = 0;
  const h = await makeHarness({
    tag: "slug-old-proposal-intent",
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
      ctx.roleId === "rapporteur" && ctx.prompt.includes("S5OLDPROPOSAL")
        ? [
            {
              name: "request_choice",
              toolCallId: "tc-old-proposal-choice",
              args: {
                title: `提案 ${FLOW}`,
                question: "接受提案吗？",
                flowId: FLOW,
                cardKind: "proposal",
                options: [
                  { id: "accept", label: "接受" },
                  { id: "revise", label: "修改" },
                  { id: "reject", label: "拒绝" },
                ],
              },
            },
          ]
        : [],
  });
  try {
    await h.open("rapporteur");
    const unconfirmedBefore = intentUnconfirmedCountNow();
    const sent = await h.send("rapporteur", "S5OLDPROPOSAL：请发提案决定卡。");
    assert.equal(sent.ok, true, sent.error ?? "");
    await h.waitFor(() => h.results.some((result) => result.name === "request_choice"), 5000);

    const receipt = h.results.find((result) => result.name === "request_choice")!;
    assert.equal(receipt.ok, false);
    assert.match(receipt.message, /提案 frontmatter 的 intentId「intent-」不符合现行 slug 规则/);
    assert.ok(receipt.message.includes(GOVERNANCE_SLUG_PATTERN));
    assert.match(receipt.message, /不得静默回落/, "须声明不回落 docs/intents/<flowId>.md");

    assert.equal(h.presented.length, 0);
    assert.equal(h.judgeRows.length, 0);
    assert.equal(judgeCalls, 0, "证据 fail-closed 发生在模型调用之前");
    const diagRows = await diagnosticBarrier();
    assert.equal(
      intentUnconfirmedRows(diagRows).length - unconfirmedBefore,
      1,
      "驱动须以 reasonCode=intent-unconfirmed 归因 manual",
    );
    const ledger = await h.waitForLedger(() => true);
    assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision"), false);
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

// —————————————— S5-4：合法 slug 全链路可用 ——————————————

test("S5-4：合法 slug（flow-a、a--b、ab、64 位）经确认/判断/发行/写盘全链路可用", async () => {
  const WORKFLOW_REL = "docs/workflow.md";
  const WORKFLOW_BODY = "工作流：合法 slug 全链路。\n";
  const longSlug = "a".repeat(64);
  const slugs = ["flow-a", "a--b", "ab", longSlug];
  const cards = slugs.map((slug, index) => ({
    name: "request_confirmation",
    toolCallId: `tc-valid-slug-${index}`,
    args: {
      title: `写盘确认 ${slug}`,
      preview: `将写入 ${WORKFLOW_REL}\n\n## ${WORKFLOW_REL}\n\n正文：${WORKFLOW_BODY}`,
      flowId: slug,
      ...(index === 0 ? { stepId: "impl" } : {}),
      cardKind: "write",
    },
  }));
  const h = await makeHarness({
    tag: "slug-valid-full-chain",
    approval: true,
    decision: true,
    scriptForRole: (ctx: ScriptContext) =>
      ctx.roleId === "convener" && ctx.prompt.includes("S5VALID")
        ? [
            ...cards,
            { name: "write_file", args: { path: WORKFLOW_REL, content: WORKFLOW_BODY } },
          ]
        : [],
  });
  try {
    await h.open("convener");
    const channelStartedBefore = startedCountNow("desktop.customer-input");
    const sent = await h.send("convener", "S5VALID：请按脚本发四张合法卡。");
    assert.equal(sent.ok, true, sent.error ?? "");
    await h.waitFor(() => h.results.filter((result) => result.name === "request_confirmation").length >= slugs.length, 5000);
    await h.waitFor(() => h.results.some((result) => result.name === "write_file"), 5000);

    const receipts = h.results.filter((result) => result.name === "request_confirmation");
    assert.equal(receipts.length, slugs.length);
    for (const receipt of receipts) assert.equal(receipt.ok, true, `合法 slug 必须被接受：${receipt.message}`);
    assert.equal(h.presented.length, 0, "开关全开 + approve ⇒ 0 客户卡");
    assert.equal(h.judgeRows.length, 4, "四张合法卡各一条结果行");
    assert.deepEqual(new Set(h.judgeRows.map((row) => row.flowId)), new Set(slugs));
    assert.equal(h.rawCustomerInputs.length, 4);
    assert.equal(h.nextIdCalls, 4);
    assert.equal(exists(h.root, WORKFLOW_REL), true, "确认后写入落盘");
    const diagRows = await diagnosticBarrier();
    assert.equal(
      judgeStartedRows(diagRows, "desktop.customer-input").length - channelStartedBefore,
      4,
      "四张卡各启动判断 1 次",
    );

    const ledger = await h.waitForLedger(
      (entries) => entries.filter((entry) => entry.kind === "customer.decision").length >= slugs.length,
      5000,
    );
    const decisions = ledger.entries.filter((entry) => entry.kind === "customer.decision");
    assert.equal(decisions.length, slugs.length, "四张合法卡各写一条客户决定账本");
    assert.deepEqual(new Set(decisions.map((entry) => entry.flowId)), new Set(slugs), "账本 flowId 原样保留");
  } finally {
    await h.stop();
    h.cleanup();
  }
});
