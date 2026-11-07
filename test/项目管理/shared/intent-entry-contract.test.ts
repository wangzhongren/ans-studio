// test/项目管理/shared/intent-entry-contract.test.ts
// shared-code（2026-11-07，E1）：共享意图入口契约 `src/common/shared/intent-entry-contract.ts` 单测。
//
// 隶属：共享组件测试（`test/项目管理/shared/`，自项目管理移交 shared-code；路径保持历史名）。
//
// 覆盖既有共享组件（E0 §4.2 默认清单第 6 项）的公开入口行为：
//   · 唯一意图解析器 `resolveIntentEntryReference`（request → proposal → product → flow-id；
//     冲突/非法 slug 一律 fail-closed）；
//   · 契约文本 `intentEntryContractText` / 拒绝提示 `intentEntryRejectionHint`（角色卡、contract_check、
//     判断拒绝文案同源，禁止各写一份）；
//   · 纯文本校验 `isValidIntentId` / `intentIdFromFrontmatter`（不写盘、不判语义）；
//   · 只读事实解析 `readIntentEntryFacts`（注入 readdir/readFile 桩件，不触真实文件系统；
//     显式路径优先、否则 `docs/product/<flowId>-intent-vN.md` / `docs/proposals/<flowId>-proposal-vN.md`
//     取最新版本，再解析 `docs/intents/<intentId>.md`）。
//
// 本文件为补齐该组件在共享测试目录内的**专属单测**（E1 核对发现此前只有消费方间接覆盖）；
// 不修改组件实现；断言以现行实现与 §5A 契约（2026-10-30 意图入口契约可见性）为准。

import assert from "node:assert/strict";
import { test } from "node:test";
import type { readFile, readdir } from "node:fs/promises";

import {
  INTENT_ENTRY_DIR,
  INTENT_ENTRY_ID_RULE,
  INTENT_ENTRY_NAMING_RULE,
  INTENT_ENTRY_TEMPLATE,
  intentEntryContractText,
  intentEntryRejectionHint,
  intentIdFromFrontmatter,
  isValidIntentId,
  readIntentEntryFacts,
  resolveIntentEntryReference,
  type IntentContractRole,
} from "../../../src/common/shared/intent-entry-contract.ts";

// ---------------------------------------------------------------------------
// 唯一意图解析器：来源优先级与 fail-closed
// ---------------------------------------------------------------------------

test("解析优先级：请求显式 intentId 优先，与提案/产品一致 → source=request", () => {
  assert.deepEqual(
    resolveIntentEntryReference({
      flowId: "flow-1",
      requestIntentId: "intent-x",
      proposalIntentId: "intent-x",
      productIntentId: "intent-x",
    }),
    { ok: true, intentId: "intent-x", source: "request" },
  );
});

test("解析优先级：请求缺省、提案存在 → source=proposal（产品一致或缺省均可）", () => {
  assert.deepEqual(
    resolveIntentEntryReference({ flowId: "flow-1", proposalIntentId: "intent-x", productIntentId: "intent-x" }),
    { ok: true, intentId: "intent-x", source: "proposal" },
  );
  assert.deepEqual(
    resolveIntentEntryReference({ flowId: "flow-1", proposalIntentId: "intent-x" }),
    { ok: true, intentId: "intent-x", source: "proposal" },
  );
});

test("解析优先级：请求/提案缺省、产品存在 → source=product", () => {
  assert.deepEqual(
    resolveIntentEntryReference({ flowId: "flow-1", productIntentId: "intent-x" }),
    { ok: true, intentId: "intent-x", source: "product" },
  );
});

test("解析优先级：三者皆缺 → flowId 回落，source=flow-id（证据如实标注）", () => {
  assert.deepEqual(
    resolveIntentEntryReference({ flowId: "flow-1" }),
    { ok: true, intentId: "flow-1", source: "flow-id" },
  );
});

test("冲突 fail-closed：请求显式与提案不一致 → intent-ambiguous", () => {
  const result = resolveIntentEntryReference({ flowId: "flow-1", requestIntentId: "intent-a", proposalIntentId: "intent-b" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "intent-ambiguous");
  assert.match(result.detail, /请求显式 intentId=intent-a/);
  assert.match(result.detail, /不一致/);
});

test("冲突 fail-closed：请求显式与产品不一致 → intent-ambiguous", () => {
  const result = resolveIntentEntryReference({ flowId: "flow-1", requestIntentId: "intent-a", productIntentId: "intent-b" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "intent-ambiguous");
  assert.match(result.detail, /产品意图/);
});

test("冲突 fail-closed：提案与产品不一致 → intent-ambiguous（不得任选其一）", () => {
  const result = resolveIntentEntryReference({ flowId: "flow-1", proposalIntentId: "intent-a", productIntentId: "intent-b" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "intent-ambiguous");
  assert.match(result.detail, /提案 frontmatter intentId=intent-a/);
  assert.match(result.detail, /产品意图 frontmatter intentId=intent-b/);
});

test("非法 slug fail-closed：请求/提案/产品任一处不符合规则 → intent-unconfirmed", () => {
  for (const input of [
    { flowId: "flow-1", requestIntentId: "Intent-X" },
    { flowId: "flow-1", proposalIntentId: "-bad-" },
    { flowId: "flow-1", productIntentId: "a" },
  ]) {
    const result = resolveIntentEntryReference(input);
    assert.equal(result.ok, false, `入参 ${JSON.stringify(input)} 应 fail-closed`);
    if (result.ok) continue;
    assert.equal(result.code, "intent-unconfirmed");
    assert.match(result.detail, /不符合现行 slug 规则/);
  }
});

test("空白裁剪：前后空白视为同一 intentId；全空白视为缺省", () => {
  assert.deepEqual(
    resolveIntentEntryReference({ flowId: "flow-1", requestIntentId: "  intent-x  " }),
    { ok: true, intentId: "intent-x", source: "request" },
  );
  assert.deepEqual(
    resolveIntentEntryReference({ flowId: "  ", requestIntentId: "   " }),
    { ok: false, code: "intent-unconfirmed", detail: "flowId 为空，无法回落定位意图入口" },
  );
});

test("flowId 为空且无意图 id → intent-unconfirmed（不猜）", () => {
  const result = resolveIntentEntryReference({ flowId: "" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "intent-unconfirmed");
});

// ---------------------------------------------------------------------------
// 纯文本校验
// ---------------------------------------------------------------------------

test("isValidIntentId：小写 slug 通过；大写/首尾连字符/单字符/非字符串拒绝", () => {
  for (const value of ["ab", "intent-x", "a1", "x".repeat(64)]) {
    assert.equal(isValidIntentId(value), true, `${value} 应为合法 slug`);
  }
  for (const value of ["a", "Intent-X", "-intent", "intent-", "intent_x", "intent x", "x".repeat(65), 42, null, undefined, {}]) {
    assert.equal(isValidIntentId(value), false, `${JSON.stringify(value)} 应为非法 slug`);
  }
});

test("intentIdFromFrontmatter：读取顶层 intentId；引号剥离、BOM、CRLF 容忍", () => {
  assert.equal(intentIdFromFrontmatter("---\nintentId: intent-x\nflowId: flow-1\n---\n正文"), "intent-x");
  assert.equal(intentIdFromFrontmatter("---\r\nintentId: intent-x\r\n---\r\n"), "intent-x");
  assert.equal(intentIdFromFrontmatter("---\nintentId: \"intent-x\"\n---\n"), "intent-x");
  assert.equal(intentIdFromFrontmatter("---\nintentId: 'intent-x'\n---\n"), "intent-x");
  assert.equal(intentIdFromFrontmatter("﻿---\nintentId: intent-x\n---\n"), "intent-x");
});

test("intentIdFromFrontmatter：无 frontmatter/空值/无值/非字符串 → undefined（不推断）", () => {
  assert.equal(intentIdFromFrontmatter(undefined), undefined);
  assert.equal(intentIdFromFrontmatter("intentId: intent-x"), undefined);
  assert.equal(intentIdFromFrontmatter("---\nflowId: flow-1\n---\n"), undefined);
  assert.equal(intentIdFromFrontmatter("---\nintentId:\n---\n"), undefined);
  assert.equal(intentIdFromFrontmatter(""), undefined);
});

test("契约文本：四角色共用同一命名规则与模板；角色职责各自不同且可定位", () => {
  const roles: readonly IntentContractRole[] = ["chief", "product", "rapporteur", "nominator"];
  const texts = roles.map((role) => intentEntryContractText(role));
  for (const [index, text] of texts.entries()) {
    const role = roles[index]!;
    assert.ok(text.includes(INTENT_ENTRY_NAMING_RULE), `${role} 契约文本须含共用命名规则`);
    assert.ok(text.includes(INTENT_ENTRY_TEMPLATE), `${role} 契约文本须含共用模板`);
  }
  assert.equal(new Set(texts).size, roles.length, "四角色职责文本不得互相复制");
  assert.ok(texts[0]!.startsWith("意图入口（你是唯一写者）"));
  assert.ok(texts[1]!.includes("docs/product/"));
  assert.ok(texts[2]!.includes("原样复制"));
  assert.ok(texts[3]!.includes("appointment"));
});

test("拒绝提示与角色卡同源：命名规则 + 模板（不含角色职责）", () => {
  assert.equal(intentEntryRejectionHint(), `${INTENT_ENTRY_NAMING_RULE}\n模板：\n${INTENT_ENTRY_TEMPLATE}`);
  assert.equal(INTENT_ENTRY_DIR, "docs/intents");
  assert.ok(INTENT_ENTRY_ID_RULE.includes("不得用 flowId 代替"));
});

// ---------------------------------------------------------------------------
// 只读事实解析（注入桩件，不触真实文件系统）
// ---------------------------------------------------------------------------

type Files = Readonly<Record<string, string>>;
type Dirs = Readonly<Record<string, readonly string[]>>;

/** 把 Windows/POSIX 分隔符统一成 `/`，便于用固定 key 断言。 */
function toKey(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function stubFs(files: Files, dirs: Dirs = {}) {
  const readFileFn = (async (file: unknown) => {
    const key = toKey(String(file));
    if (!(key in files)) throw Object.assign(new Error(`ENOENT: ${key}`), { code: "ENOENT" });
    return files[key];
  }) as unknown as typeof readFile;
  const readdirFn = (async (dir: unknown) => {
    const key = toKey(String(dir));
    const entries = dirs[key];
    if (entries === undefined) throw Object.assign(new Error(`ENOENT: ${key}`), { code: "ENOENT" });
    return [...entries];
  }) as unknown as typeof readdir;
  return { readFileFn, readdirFn };
}

const PRODUCT_V1 = "---\nintentId: intent-old\nflowId: flow-1\n---\n旧目标";
const PRODUCT_V2 = "---\nintentId: intent-x\nflowId: flow-1\n---\n新目标";
const PROPOSAL = "---\nintentId: intent-x\nflowId: flow-1\n---\n提案";
const ENTRY = "---\nintentId: intent-x\n---\n入口";

function happyFiles(): { files: Files; dirs: Dirs } {
  return {
    files: {
      "proj/docs/product/flow-1-intent-v1.md": PRODUCT_V1,
      "proj/docs/product/flow-1-intent-v2.md": PRODUCT_V2,
      "proj/docs/proposals/flow-1-proposal-v1.md": PROPOSAL,
      "proj/docs/intents/intent-x.md": ENTRY,
    },
    dirs: {
      "proj/docs/product": ["flow-1-intent-v1.md", "flow-1-intent-v2.md"],
      "proj/docs/proposals": ["flow-1-proposal-v1.md"],
    },
  };
}

test("readIntentEntryFacts：自动发现最新版本、注入解析器、核对入口文件", async () => {
  const { files, dirs } = happyFiles();
  const facts = await readIntentEntryFacts({ projectRoot: "proj", flowId: "flow-1", ...stubFs(files, dirs) });
  assert.deepEqual(facts, {
    productIntentPath: "docs/product/flow-1-intent-v2.md",
    productIntentId: "intent-x",
    proposalPath: "docs/proposals/flow-1-proposal-v1.md",
    proposalIntentId: "intent-x",
    resolvedIntentId: "intent-x",
    resolutionSource: "proposal",
    intentEntryPath: "docs/intents/intent-x.md",
    intentEntryExists: true,
    intentEntryIntentId: "intent-x",
    intentIdsMatch: true,
    entryMatches: true,
  });
});

test("readIntentEntryFacts：显式路径优先，不触发目录发现", async () => {
  const { files } = happyFiles();
  const facts = await readIntentEntryFacts({
    projectRoot: "proj",
    flowId: "flow-1",
    productIntentPath: "docs/product/flow-1-intent-v2.md",
    proposalPath: "docs/proposals/flow-1-proposal-v1.md",
    ...stubFs(files),
  });
  assert.equal(facts.productIntentPath, "docs/product/flow-1-intent-v2.md");
  assert.equal(facts.proposalPath, "docs/proposals/flow-1-proposal-v1.md");
  assert.equal(facts.resolvedIntentId, "intent-x");
});

test("readIntentEntryFacts：产品/提案冲突 → 记录 resolutionError，不拼入口路径、不读入口文件", async () => {
  const facts = await readIntentEntryFacts({
    projectRoot: "proj",
    flowId: "flow-1",
    productIntentPath: "docs/product/p.md",
    proposalPath: "docs/proposals/p.md",
    ...stubFs({
      "proj/docs/product/p.md": "---\nintentId: intent-a\n---\n",
      "proj/docs/proposals/p.md": "---\nintentId: intent-b\n---\n",
      "proj/docs/intents/intent-a.md": ENTRY,
    }),
  });
  assert.equal(facts.resolvedIntentId, undefined);
  assert.equal(facts.intentEntryPath, undefined);
  assert.equal(facts.intentEntryExists, undefined);
  assert.equal(facts.intentIdsMatch, false);
  assert.equal(facts.entryMatches, undefined);
  assert.equal(facts.resolutionError?.code, "intent-ambiguous");
});

test("readIntentEntryFacts：非法 slug → resolutionError=intent-unconfirmed", async () => {
  const facts = await readIntentEntryFacts({
    projectRoot: "proj",
    flowId: "flow-1",
    productIntentPath: "docs/product/p.md",
    ...stubFs({ "proj/docs/product/p.md": "---\nintentId: Bad_Slug\n---\n" }),
  });
  assert.equal(facts.resolutionError?.code, "intent-unconfirmed");
  assert.equal(facts.resolvedIntentId, undefined);
});

test("readIntentEntryFacts：无意图文档 → flowId 回落；入口文件缺失如实标注 false", async () => {
  const facts = await readIntentEntryFacts({ projectRoot: "proj", flowId: "flow-1", ...stubFs({}) });
  assert.deepEqual(facts, {
    resolvedIntentId: "flow-1",
    resolutionSource: "flow-id",
    intentEntryPath: "docs/intents/flow-1.md",
    intentEntryExists: false,
  });
});

test("readIntentEntryFacts：入口文件 intentId 与解析结果不一致 → entryMatches=false", async () => {
  const facts = await readIntentEntryFacts({
    projectRoot: "proj",
    flowId: "flow-1",
    productIntentPath: "docs/product/p.md",
    ...stubFs({
      "proj/docs/product/p.md": "---\nintentId: intent-x\n---\n",
      "proj/docs/intents/intent-x.md": "---\nintentId: intent-other\n---\n",
    }),
  });
  assert.equal(facts.entryMatches, false);
  assert.equal(facts.intentEntryIntentId, "intent-other");
});

test("readIntentEntryFacts：flowId 为空 → 空事实对象（不猜、不读盘）", async () => {
  const facts = await readIntentEntryFacts({ projectRoot: "proj", flowId: "   ", ...stubFs({}) });
  assert.deepEqual(facts, {});
});
