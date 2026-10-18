// test/编排/liaison-handoff.test.ts
// 四角色 W6-A（2026-10-18）：意图交接机械校验（评审 §5.2）与澄清轮次统计（§5.4）。
//
// 覆盖：slug/四要素/summary、文件权威（入参与文件逐项一致、文件 handoffKind/flowId 一致性）、
// 文件缺失/不可读、去重、initial 一次性、clarification/revision 引用既有交接、每轮一次、
// 账本不可读 fail-closed、模型/角色防御性校验、澄清两轮计数。
// 全部临时目录；不读 `.env`、不跑真实模型/凭据/网络。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLARIFICATION_MAX_ROUNDS,
  countClarificationRounds,
  intentHandoffDedupeKey,
  parseIntentFrontmatter,
  validateIntentHandoff,
  type IntentHandoffValidationInput,
} from "../../src/common/编排/governance-handoff.ts";
import {
  appendGovernanceLedger,
  flushGovernanceLedger,
  governanceLedgerPath,
  type GovernanceLedgerEntry,
} from "../../src/common/编排/governance-ledger.ts";

function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-liaison-handoff-"));
  return fn(root).finally(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  });
}

const INTENT_ID = "intent-a";
const FLOW_ID = "flow-a";

/** 写意图文件（frontmatter 简单 key: value；四要素与入参默认一致）。 */
function writeIntent(
  root: string,
  over: Record<string, string | undefined> = {},
  body = "客户原话：做一个受治理的提案流程。\n",
): string {
  const fields: Record<string, string | undefined> = {
    intentId: INTENT_ID,
    handoffKind: "initial",
    goal: "让客户能接受一份提案",
    scope: "只读分析，不改代码",
    acceptance: "客户接受提案且流程可验收",
    flowId: FLOW_ID,
    ...over,
  };
  const fm = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  mkdirSync(join(root, "docs", "intents"), { recursive: true });
  const abs = join(root, "docs", "intents", `${INTENT_ID}.md`);
  writeFileSync(abs, `---\n${fm}\n---\n${body}`);
  return abs;
}

function baseInput(root: string, over: Partial<IntentHandoffValidationInput> = {}): IntentHandoffValidationInput {
  return {
    projectRoot: root,
    intentId: INTENT_ID,
    handoffKind: "initial",
    goal: "让客户能接受一份提案",
    scope: "只读分析，不改代码",
    acceptance: "客户接受提案且流程可验收",
    summary: "客户想做提案流程",
    flowId: FLOW_ID,
    ...over,
  };
}

function handoffEntry(over: Partial<GovernanceLedgerEntry> = {}): GovernanceLedgerEntry {
  return {
    at: new Date().toISOString(),
    kind: "intent.handed-off",
    actorRoleId: "liaison",
    power: "liaison",
    intentId: INTENT_ID,
    handoffKind: "initial",
    targetRoleId: "rapporteur",
    artifactPath: `docs/intents/${INTENT_ID}.md`,
    artifactSha256: "0".repeat(64),
    messageSummary: "一次交接",
    ...over,
  };
}

test("合法 initial：返回路径/文件哈希；dedupe key 稳定", async () => {
  await withRoot(async (root) => {
    writeIntent(root);
    const validation = await validateIntentHandoff(baseInput(root), {
      governanceModel: "trio",
      governanceFunction: "liaison",
      turnId: "turn-1",
      sessionId: "s-1",
    });
    assert.equal(validation.ok, true);
    if (!validation.ok) return;
    assert.equal(validation.artifactPath, `docs/intents/${INTENT_ID}.md`);
    assert.match(validation.artifactSha256, /^[0-9a-f]{64}$/);
    assert.equal(validation.flowId, FLOW_ID);
    assert.equal(validation.warnings, undefined);

    const key = intentHandoffDedupeKey({ intentId: INTENT_ID, handoffKind: "initial", sha256: validation.artifactSha256 });
    assert.equal(
      key,
      intentHandoffDedupeKey({ intentId: INTENT_ID, handoffKind: "initial", sha256: validation.artifactSha256 }),
    );
    assert.notEqual(
      key,
      intentHandoffDedupeKey({ intentId: INTENT_ID, handoffKind: "clarification", sha256: validation.artifactSha256 }),
    );
  });
});

test("守卫：非法 slug / 缺文件 / 四要素空 / summary 超长", async () => {
  await withRoot(async (root) => {
    const badSlug = await validateIntentHandoff(baseInput(root, { intentId: "../escape" }));
    assert.equal(badSlug.ok, false);
    if (!badSlug.ok) assert.equal(badSlug.code, "invalid-intent-id");

    const missingFile = await validateIntentHandoff(baseInput(root));
    assert.equal(missingFile.ok, false);
    if (!missingFile.ok) {
      assert.equal(missingFile.code, "missing-file");
      assert.match(missingFile.message, /未交接/);
    }

    writeIntent(root);
    for (const [field, over] of [
      ["goal", { goal: "  " }],
      ["scope", { scope: "" }],
      ["acceptance", { acceptance: " " }],
    ] as const) {
      const result = await validateIntentHandoff(baseInput(root, over));
      assert.equal(result.ok, false, field);
      if (!result.ok) assert.equal(result.code, "missing-field", field);
    }

    const longSummary = await validateIntentHandoff(baseInput(root, { summary: "字".repeat(201) }));
    assert.equal(longSummary.ok, false);
    if (!longSummary.ok) {
      assert.equal(longSummary.code, "summary-too-long");
      assert.match(longSummary.message, /不会静默截断/);
    }
    const emptySummary = await validateIntentHandoff(baseInput(root, { summary: "   " }));
    assert.equal(emptySummary.ok, false);
    if (!emptySummary.ok) assert.equal(emptySummary.code, "summary-invalid");
  });
});

test("文件是权威：入参与文件不一致/文件 handoffKind/flowId 不一致 → 拒绝", async () => {
  await withRoot(async (root) => {
    writeIntent(root);
    const mismatch = await validateIntentHandoff(baseInput(root, { goal: "聊天里改过的目标" }));
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) {
      assert.equal(mismatch.code, "input-file-mismatch");
      assert.match(mismatch.message, /文件是权威/);
    }

    const kindMismatch = await validateIntentHandoff(baseInput(root, { handoffKind: "revision" }));
    assert.equal(kindMismatch.ok, false);
    if (!kindMismatch.ok) assert.equal(kindMismatch.code, "handoff-kind-mismatch");

    const flowMismatch = await validateIntentHandoff(baseInput(root, { flowId: "flow-b" }));
    assert.equal(flowMismatch.ok, false);
    if (!flowMismatch.ok) assert.equal(flowMismatch.code, "flow-id-mismatch");

    // 入参缺 flowId 但文件给出 → 采用文件值（不猜测、不拒绝）。
    const adopted = await validateIntentHandoff(baseInput(root, { flowId: undefined }));
    assert.equal(adopted.ok, true);
    if (adopted.ok) assert.equal(adopted.flowId, FLOW_ID);
  });
});

test("frontmatter：缺失/未闭合/坏行 → 拒绝", async () => {
  await withRoot(async (root) => {
    mkdirSync(join(root, "docs", "intents"), { recursive: true });
    const abs = join(root, "docs", "intents", `${INTENT_ID}.md`);
    writeFileSync(abs, "# 没有 frontmatter\n");
    const missing = await validateIntentHandoff(baseInput(root));
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "missing-frontmatter");

    writeFileSync(abs, `---\nintentId: ${INTENT_ID}\ngoal: 目标\n`);
    const unclosed = await validateIntentHandoff(baseInput(root));
    assert.equal(unclosed.ok, false);
    if (!unclosed.ok) assert.equal(unclosed.code, "missing-frontmatter");

    writeFileSync(abs, `---\nintentId: ${INTENT_ID}\n坏行\n---\n`);
    const badLine = await validateIntentHandoff(baseInput(root));
    assert.equal(badLine.ok, false);
    if (!badLine.ok) assert.equal(badLine.code, "invalid-frontmatter");
  });
});

test("frontmatter 块标量：| 保留换行、> 折叠、chomping/缩进指示符、块后按键继续、# 属正文", () => {
  const text = [
    "---",
    "intentId: intent-a",
    "customerQuote: |",
    "  第一行原话",
    "    缩进更深的内容",
    "  # 这是正文不是注释",
    "goal: >",
    "  让客户能接受",
    "  一份提案",
    "scope: |-",
    "  只读分析",
    "  不改代码",
    "acceptance: >-",
    "  客户接受提案",
    "  且流程可验收",
    "summary: |2-",
    "    两格缩进",
    "      再深两格",
    "---",
    "",
  ].join("\n");
  const parsed = parseIntentFrontmatter(text);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.fields.intentId, "intent-a", "块结束后的顶层键照常解析");
  assert.equal(
    parsed.fields.customerQuote,
    "第一行原话\n  缩进更深的内容\n# 这是正文不是注释\n",
    "| 保留换行、块内 # 不是注释",
  );
  assert.equal(parsed.fields.goal, "让客户能接受 一份提案\n", "> 折叠为空格");
  assert.equal(parsed.fields.scope, "只读分析\n不改代码", "|- 去尾换行");
  assert.equal(parsed.fields.acceptance, "客户接受提案 且流程可验收", ">- 折叠且去尾换行");
  assert.equal(parsed.fields.summary, "  两格缩进\n    再深两格", "缩进指示符 2 生效");
});

test("frontmatter 块标量：|+ 保留尾部空行，缺省单个换行；空块为空串", () => {
  const kept = parseIntentFrontmatter("---\nkey: |+\n  a\n\n\nnext: b\n---\n");
  assert.equal(kept.ok, true);
  if (kept.ok) {
    assert.equal(kept.fields.key, "a\n\n\n", "+ 保留尾部空行");
    assert.equal(kept.fields.next, "b");
  }
  const clipped = parseIntentFrontmatter("---\nkey: >\n  a\n\n\nnext: b\n---\n");
  assert.equal(clipped.ok, true);
  if (clipped.ok) assert.equal(clipped.fields.key, "a\n", "缺省 clip 恰一个换行");
  const empty = parseIntentFrontmatter("---\nquote: |\nnext: b\n---\n");
  assert.equal(empty.ok, true);
  if (empty.ok) {
    assert.equal(empty.fields.quote, "", "空块 ⇒ 空串");
    assert.equal(empty.fields.next, "b", "空块不吞下一个顶层键");
  }
  // 解析失败文案保持原样（不支持嵌套/列表的口径不变）。
  const bad = parseIntentFrontmatter("---\nbad line\n---\n");
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.code, "invalid-frontmatter");
    assert.equal(bad.message, "意图文件 frontmatter 第 2 行无法解析（只支持顶层 key: value）。");
  }
});

test("validateIntentHandoff：块标量意图文件（customerQuote: |）成功交接", async () => {
  await withRoot(async (root) => {
    const fm = [
      "intentId: intent-a",
      "handoffKind: initial",
      "customerQuote: |",
      "  客户原话：做一个受治理的提案流程。",
      "  第二行也逐字保留。",
      "goal: >",
      "  让客户能接受",
      "  一份提案",
      "scope: |-",
      "  只读分析，",
      "  不改代码",
      "acceptance: >-",
      "  客户接受提案",
      "  且流程可验收",
      "flowId: flow-a",
    ].join("\n");
    mkdirSync(join(root, "docs", "intents"), { recursive: true });
    writeFileSync(
      join(root, "docs", "intents", `${INTENT_ID}.md`),
      `---\n${fm}\n---\n客户原话：做一个受治理的提案流程。\n`,
    );
    const validation = await validateIntentHandoff(baseInput(root, {
      goal: "让客户能接受 一份提案",
      scope: "只读分析，\n不改代码",
      acceptance: "客户接受提案 且流程可验收",
    }));
    assert.equal(validation.ok, true);
    if (!validation.ok) return;
    assert.equal(validation.artifactPath, `docs/intents/${INTENT_ID}.md`);
  });
});

test("去重 / initial 一次性 / clarification 需既有交接", async () => {
  await withRoot(async (root) => {
    writeIntent(root);
    const first = await validateIntentHandoff(baseInput(root));
    assert.equal(first.ok, true);
    if (!first.ok) return;

    // 成功交接后：同 hash+kind → duplicate；initial 第二次 → initial-exists（换 body 使 hash 不同）。
    await appendGovernanceLedger(root, handoffEntry({ artifactSha256: first.artifactSha256 }));
    await flushGovernanceLedger(root);

    const duplicate = await validateIntentHandoff(baseInput(root));
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) {
      assert.equal(duplicate.code, "duplicate");
      assert.match(duplicate.message, /不重复派发/);
    }

    writeIntent(root, {}, "客户原话：补充一句。\n");
    const secondInitial = await validateIntentHandoff(baseInput(root));
    assert.equal(secondInitial.ok, false);
    if (!secondInitial.ok) {
      assert.equal(secondInitial.code, "initial-exists");
      assert.match(secondInitial.message, /clarification\/revision/);
    }

    // clarification 引用既有 intent 成功交接 → 放行（hash 不同，不与 initial 去重冲突）。
    writeIntent(root, { handoffKind: "clarification" }, "客户原话：再补充一句。\n");
    const clarification = await validateIntentHandoff(baseInput(root, { handoffKind: "clarification" }));
    assert.equal(clarification.ok, true);
  });
});

test("clarification/revision 没有既有成功交接 → 拒绝", async () => {
  await withRoot(async (root) => {
    for (const handoffKind of ["clarification", "revision"] as const) {
      writeIntent(root, { handoffKind });
      const result = await validateIntentHandoff(baseInput(root, { handoffKind }));
      assert.equal(result.ok, false, handoffKind);
      if (!result.ok) assert.equal(result.code, "no-prior-handoff", handoffKind);
    }
  });
});

test("每轮一次：同会话同轮第二次 → turn-limit；缺 turnId → 降级并 warning", async () => {
  await withRoot(async (root) => {
    writeIntent(root);
    const first = await validateIntentHandoff(baseInput(root));
    assert.equal(first.ok, true);
    if (!first.ok) return;

    // 换 body（不同 hash）以绕过 dedupe，isolate 每轮守卫；kind=clarification 且已有交接。
    writeIntent(root, { handoffKind: "clarification" }, "客户原话：再补充一句。\n");
    await appendGovernanceLedger(
      root,
      handoffEntry({ handoffKind: "clarification", artifactSha256: first.artifactSha256, turnId: "turn-1", sessionId: "s-1" }),
    );
    await flushGovernanceLedger(root);

    const sameTurn = await validateIntentHandoff(baseInput(root, { handoffKind: "clarification" }), {
      governanceModel: "trio",
      governanceFunction: "liaison",
      turnId: "turn-1",
      sessionId: "s-1",
    });
    assert.equal(sameTurn.ok, false);
    if (!sameTurn.ok) assert.equal(sameTurn.code, "turn-limit");

    const otherTurn = await validateIntentHandoff(baseInput(root, { handoffKind: "clarification" }), {
      turnId: "turn-2",
      sessionId: "s-1",
    });
    assert.equal(otherTurn.ok, true);

    const noTurn = await validateIntentHandoff(baseInput(root, { handoffKind: "clarification" }));
    assert.equal(noTurn.ok, true);
    if (noTurn.ok) {
      assert.equal(noTurn.warnings?.length, 1);
      assert.match(noTurn.warnings![0], /turnId/);
    }
  });
});

test("账本不可读/坏行 → fail-closed；模型/角色防御性校验", async () => {
  await withRoot(async (root) => {
    writeIntent(root);
    mkdirSync(join(root, ".ans", "governance"), { recursive: true });
    writeFileSync(governanceLedgerPath(root), "{ bad json\n");
    const unreadable = await validateIntentHandoff(baseInput(root));
    assert.equal(unreadable.ok, false);
    if (!unreadable.ok) {
      assert.equal(unreadable.code, "ledger-unreadable");
      assert.match(unreadable.message, /ledger\.jsonl/);
    }

    const wrongModel = await validateIntentHandoff(baseInput(root), { governanceModel: "single" });
    assert.equal(wrongModel.ok, false);
    if (!wrongModel.ok) assert.equal(wrongModel.code, "wrong-model");

    const wrongRole = await validateIntentHandoff(baseInput(root), { governanceFunction: "proposal" });
    assert.equal(wrongRole.ok, false);
    if (!wrongRole.ok) assert.equal(wrongRole.code, "wrong-role");
  });
});

test("澄清轮次：按 flowId（无则 intentId）计数；账本坏 → fail-closed", async () => {
  await withRoot(async (root) => {
    const empty = await countClarificationRounds(root, { flowId: FLOW_ID });
    assert.deepEqual(empty, { ok: true, rounds: 0, scope: "flow" });

    const clarify = (flowId: string | undefined, intentId: string | undefined): GovernanceLedgerEntry => ({
      at: new Date().toISOString(),
      kind: "clarification.requested",
      actorRoleId: "rapporteur",
      power: "proposal",
      ...(flowId !== undefined ? { flowId } : {}),
      ...(intentId !== undefined ? { intentId } : {}),
      messageSummary: "问题",
    });
    await appendGovernanceLedger(root, clarify(FLOW_ID, INTENT_ID));
    await appendGovernanceLedger(root, clarify(FLOW_ID, INTENT_ID));
    await appendGovernanceLedger(root, clarify("flow-b", undefined));
    await flushGovernanceLedger(root);

    const byFlow = await countClarificationRounds(root, { flowId: FLOW_ID });
    assert.deepEqual(byFlow, { ok: true, rounds: CLARIFICATION_MAX_ROUNDS, scope: "flow" });
    const byIntent = await countClarificationRounds(root, { intentId: INTENT_ID });
    assert.deepEqual(byIntent, { ok: true, rounds: 2, scope: "intent" });

    mkdirSync(join(root, ".ans", "governance"), { recursive: true });
    writeFileSync(governanceLedgerPath(root), "{ bad json\n");
    const broken = await countClarificationRounds(root, { flowId: FLOW_ID });
    assert.equal(broken.ok, false);
    if (!broken.ok) assert.match(broken.message, /拒绝提交/);
  });
});
