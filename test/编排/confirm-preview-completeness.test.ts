// test/编排/confirm-preview-completeness.test.ts
// 编排角色自测：**写盘类确认卡的呈现前 preview 完整性闸**（2026-10-19 真机 op-2 修复）。
//
// 机制（本文件钉死）：
//   · `request_confirmation` 声明了 ≥1 条写入路径（显式 `paths` 优先，未给时回退 preview 的
//     「一行一个路径」声明）⇒ preview 必须对**每一条**路径给出可核对正文/结构
//     （路径作为标题/围栏说明/声明行出现，且其后至少一行非空正文）；
//   · 不完整 ⇒ 编排**不向客户呈现卡片**、不发行任何写入路径，工具如实返回失败并列出缺正文的路径；
//   · 无路径确认与 choice 卡 ⇒ 旧行为逐字不变。
//
// 反例来源（真机 op-2）：`fixtures/op2-write-confirm-card.json` 逐字摘录自
// `ans-testbed/ticket-desk-live/.ans/sessions/rapporteur/pi/native/2026-10-19T01-24-24-825Z_*.jsonl`
// 的 `request_confirmation` 调用：paths 声明两条新建路径，但 preview 只有提案正文（两条路径名
// 甚至没有出现在 preview 里）；判断 agent 依 rubric「新文件必须用 preview 核对正文/结构」回落
// manual。安全上 fail-closed 正确，但产品不应把「证据完整性」留给模型自觉——本闸把它前移到发卡前。
//
// 全部用系统临时目录，用后清理；全程假适配器，不发任何模型请求。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runGovernSession } from "../../src/pipeline/orchestration/govern-session.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { EXIT_OK } from "../../src/common/编排/exit-codes.ts";
import {
  declaredConfirmPaths,
  validateConfirmPreviewCompleteness,
} from "../../src/common/编排/confirmed-writes.ts";
import type { AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  CustomerInputFn,
  CustomerInputRequest,
  ToolCall,
  WriteGate,
} from "../../src/provider/pi/session.ts";

const GENESIS_SOURCE = "cli:ans govern <目录> = 操作者发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）";

/** 创世态 project（= 装配 M1+O1 注入形态；同 confirmation-gated.test.ts）。 */
function genesisProject(target: string): ProjectConfig {
  return {
    projectRoot: target,
    skillRoot: target,
    roles: {},
    governanceModel: "single",
    governanceBoundary: { path: "", acceptance: { accepted: true, source: "test:OP2" } },
    genesisBootstrap: { source: GENESIS_SOURCE },
  };
}

/** 新建临时根，用后清理。 */
async function withTarget<T>(fn: (target: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-preview-gate-"));
  const target = join(root, "proj");
  mkdirSync(target, { recursive: true });
  try {
    return await fn(target);
  } finally {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

/** 记录调用的客户通道（默认恒同意）。 */
function recordingChannel(calls: CustomerInputRequest[]): CustomerInputFn {
  return (req) => {
    calls.push(req);
    if (req.kind === "confirm") {
      return { outcome: "answered", value: { confirmed: true }, operatorId: "test-客户" };
    }
    return { outcome: "answered", value: { selected: [] }, operatorId: "test-客户" };
  };
}

/** 跑一次 su 创世会话（假适配器，脚本逐条执行）。 */
async function runScripted(target: string, script: ToolCall[], customerInput: CustomerInputFn) {
  return await runGovernSession(
    { taskId: "T-PREVIEW", project: genesisProject(target), customerInput },
    {
      createAdapter: (gate: WriteGate, caps?: AdapterCapabilities) =>
        createFakeRuntimeAdapter({ gate, script, writeRoot: target, customerInput: caps?.customerInput }),
    },
  );
}

// ————————— ③ 无路径确认 → 行为不变（正常呈现，不触完整性闸） —————————

test("无路径确认卡 → 完整性闸不介入，卡片照常呈现（旧行为不变）", async () => {
  await withTarget(async (target) => {
    const calls: CustomerInputRequest[] = [];
    const script: ToolCall[] = [
      { name: "request_confirmation", args: { title: "确认操作", preview: "这是一段不含任何写入路径的说明文字。" } },
    ];
    const result = await runScripted(target, script, recordingChannel(calls));
    assert.equal(result.code, EXIT_OK);
    assert.equal(calls.length, 1, "无路径确认必须照常呈现");
    const first = calls[0]!;
    assert.equal(first.kind, "confirm");
    if (first.kind === "confirm") assert.equal(first.paths, undefined, "无路径 ⇒ 不带 paths");
    const text = result.transcript.map((event) => event.summary).join("\n");
    assert.match(text, /客户已确认/);
  });
});

// ————————— ④ 真机 op-2 卡片原文 → 确定性判定 —————————

interface Op2Card {
  title: string;
  cardKind: string;
  flowId: string;
  paths: string[];
  preview: string;
}

test("真机 op-2 卡片（fixture 逐字摘录）：两条路径都缺正文 → 判定拒绝且列出两条路径", () => {
  const card = JSON.parse(
    readFileSync(new URL("./fixtures/op2-write-confirm-card.json", import.meta.url), "utf8"),
  ) as Op2Card;
  const req: CustomerInputRequest = {
    kind: "confirm",
    title: card.title,
    preview: card.preview,
    paths: card.paths,
    cardKind: card.cardKind as CustomerInputRequest["cardKind"],
    flowId: card.flowId,
  };
  const result = validateConfirmPreviewCompleteness(req);
  assert.equal(result.ok, false, "真机 preview 只有提案正文，没有任何路径标题/围栏/声明锚点");
  assert.deepEqual(result.declaredPaths, card.paths, "显式 paths 优先");
  assert.deepEqual(result.missingPaths, card.paths, "两条路径都没有可核对正文/结构");

  // 同一张真机卡：给第一条路径补上标题 + 正文 → 恰好只缺第二条（与客户描述一致）。
  const partial: CustomerInputRequest = {
    ...req,
    preview: `## ${card.paths[0]}\n${card.preview}`,
  };
  const partialResult = validateConfirmPreviewCompleteness(partial);
  assert.equal(partialResult.ok, false);
  assert.deepEqual(partialResult.missingPaths, [card.paths[1]!], "第二条路径仍无正文 ⇒ 拒绝，且精确列出它");
});

// ————————— ⑤ 解析与锚点口径（单元） —————————

test("declaredConfirmPaths：显式 paths 优先；空数组/未给回退 preview 一行一路径声明", () => {
  const preview = "将写出：\n- docs/a.md\n- docs/b.md\n";
  assert.deepEqual(declaredConfirmPaths({ kind: "confirm", title: "x", preview }), ["docs/a.md", "docs/b.md"]);
  assert.deepEqual(
    declaredConfirmPaths({ kind: "confirm", title: "x", preview, paths: ["docs/c.md"] } as CustomerInputRequest),
    ["docs/c.md"],
    "显式 paths 优先于 preview 声明",
  );
  assert.deepEqual(
    declaredConfirmPaths({ kind: "confirm", title: "x", preview, paths: [] } as CustomerInputRequest),
    ["docs/a.md", "docs/b.md"],
    "空数组视为未给（与发行器同口径）",
  );
  assert.deepEqual(declaredConfirmPaths({ kind: "choice", title: "x", options: [] }), []);
});

test("完整性锚点：标题/代码围栏说明/声明行均可；缺正文或只有路径名 → 拒绝", () => {
  // 标题锚点 + 正文 → 通过。
  assert.equal(
    validateConfirmPreviewCompleteness({
      kind: "confirm",
      title: "x",
      paths: ["docs/a.md"],
      preview: "## docs/a.md\n正文 A\n",
    }).ok,
    true,
  );
  // 围栏说明锚点 + 围栏正文 → 通过。
  assert.deepEqual(
    validateConfirmPreviewCompleteness({
      kind: "confirm",
      title: "x",
      paths: ["docs/a.md", "docs/b.md"],
      preview: "```md docs/a.md\n正文 A\n```\n\n```md docs/b.md\n正文 B\n```\n",
    }),
    { ok: true, declaredPaths: ["docs/a.md", "docs/b.md"], missingPaths: [] },
  );
  // 只有路径名、没有正文 → 拒绝。
  assert.deepEqual(
    validateConfirmPreviewCompleteness({
      kind: "confirm",
      title: "x",
      preview: "将写出：\n- docs/a.md\n\n## docs/a.md\n",
    }).missingPaths,
    ["docs/a.md"],
  );
  // 声明行后紧跟下一条路径声明（没有正文区间）→ 两条都拒绝。
  assert.deepEqual(
    validateConfirmPreviewCompleteness({
      kind: "confirm",
      title: "x",
      preview: "将写出：\n- docs/a.md\n- docs/b.md\n",
    }).missingPaths,
    ["docs/a.md", "docs/b.md"],
  );
  // choice 卡不进入写盘校验（旧行为不变）。
  assert.equal(
    validateConfirmPreviewCompleteness({ kind: "choice", title: "x", options: [{ id: "a", label: "A" }] }).ok,
    true,
  );
});
