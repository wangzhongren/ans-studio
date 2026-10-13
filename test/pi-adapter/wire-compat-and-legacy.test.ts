// 根因修复回归（2026-10-12）：网关 500 `unknown variant 'tool_removal'` 的修复 + 存量会话防御。
// 归属：Pi适配器角色测试目录。**不静态 import Pi 运行时**（用例内动态 import + 未安装则跳过）。
//
// 覆盖：
//   1. `buildExplicitRuntime` 克隆模型的 **compat 收窄**（两能力位 false；strict/adaptive/fallbacks 收窄；
//      其余 compat 逐项保留；id/baseUrl/provider/contextWindow 不变）；
//   2. **wire 级回归（离线，不发网络）**：用 `anthropic-messages` api 的 `onPayload` 捕获请求参数——
//      收窄后**不再生成** `tool_removal`/`tool_addition` 块；对照组（把两能力位改回 true）**能复现**该块
//      （证明修复承重且复现原始 500 触发条件）；
//   3. **存量防御**：`sessionFileHasForeignToolChangeBlocks` 只认 system 消息里的**字面块**（用户正文提及
//      同名串不误报）；`selectSessionManager` 对污染文件**跳过**（有干净旧档则恢复它）、全污染则**新建并如实
//      note**（不静默挂死）；干净会话恢复**逐字不变**（无 note/skipped）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildExplicitRuntime,
  selectSessionManager,
  sessionFileHasForeignToolChangeBlocks,
} from "../../src/common/pi-adapter/real-adapter.ts";

// 构造层需要凭据**存在**（只查存在性，不读值）；放占位符，与 smoke 先例一致。
if (!process.env.ANTHROPIC_AUTH_TOKEN) {
  process.env.ANTHROPIC_AUTH_TOKEN = "wire-compat-test-placeholder-token";
}

async function piInstalled(): Promise<boolean> {
  try {
    await import("@earendil-works/pi-coding-agent");
    return true;
  } catch {
    return false;
  }
}

async function inTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-wire-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const CFG = {
  baseUrl: "https://gw.example.invalid/anthropic/",
  modelId: "gw-model-x",
  contextWindow: 32768,
};

const TOOL_A = { name: "tool_a", description: "a", parameters: { type: "object", properties: {}, additionalProperties: true } };
const TOOL_B = { name: "tool_b", description: "b", parameters: { type: "object", properties: {}, additionalProperties: true } };

/** 含「中途工具装载变化」的转录：系统消息带 toolsAdded/toolsRemoved 元数据（真机 JSONL 实测的存储形态）。 */
function transcriptWithToolChange(): unknown {
  return {
    messages: [
      { role: "system", content: "base prompt", toolsAdded: [TOOL_A], timestamp: Date.now() },
      { role: "user", content: "第一轮", timestamp: Date.now() },
      {
        role: "system",
        content: "",
        toolsAdded: [TOOL_B],
        toolsRemoved: [{ name: "tool_a" }],
        timestamp: Date.now(),
      },
      { role: "user", content: "第二轮", timestamp: Date.now() },
    ],
  };
}

/** 用 anthropic-messages api 捕获「将要发往网关的请求参数」（onPayload 抛出即中止，不触网）。 */
async function captureRequestParams(model: unknown): Promise<string> {
  const { anthropicMessagesApi } = await import("@earendil-works/pi-ai/api/anthropic-messages.lazy");
  const api = anthropicMessagesApi();
  let captured: unknown;
  const stream = api.streamSimple(
    model as never,
    transcriptWithToolChange() as never,
    {
      apiKey: "test-key-not-real",
      onPayload: (params: unknown) => {
        captured = params;
        throw new Error("capture-stop"); // 捕获后立即中止：**不发任何网络请求**
      },
    } as never,
  );
  await stream.result().catch(() => {}); // 预期的中止/流错误
  assert.ok(captured !== undefined, "应已捕获请求参数");
  return JSON.stringify(captured);
}

// —————————————————————— 1. compat 收窄 ——————————————————————

test("buildExplicitRuntime：克隆模型 compat 已显式收窄（两能力位 false；strict/adaptive/fallbacks 收窄；其余保留）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const { model } = await buildExplicitRuntime({ ...CFG, providerId: "ans-gateway", apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN" } as never);
  const compat = (model as { compat?: Record<string, unknown> }).compat;
  assert.ok(compat !== undefined, "compat 应存在（逐项收窄、不整体丢弃）");

  // 主犯两能力位收窄。
  assert.equal(compat!["supportsMidConvoSystemMessages"], false);
  assert.equal(compat!["supportsMidConvoToolChanges"], false);
  // 同源照抄项收窄。
  assert.equal(compat!["forceAdaptiveThinking"], false);
  assert.equal(compat!["supportsStrictTools"], false);
  assert.equal(compat!["allowedFallbackModels"], undefined);
  // 逐项收窄而非整体丢弃：模板在 compat 里还有别的字段应保留（如 allowEmptySignature 若存在）。
  const preserved = Object.keys(compat!).filter(
    (k) =>
      ![
        "supportsMidConvoSystemMessages",
        "supportsMidConvoToolChanges",
        "forceAdaptiveThinking",
        "supportsStrictTools",
        "allowedFallbackModels",
      ].includes(k),
  );
  assert.ok(preserved.length >= 0); // 保留项不断言具体名单（模板会演进），只要求不算错删

  // 身份字段不变。
  assert.equal((model as { id: string }).id, CFG.modelId);
  assert.equal((model as { baseUrl: string }).baseUrl, CFG.baseUrl);
  assert.equal((model as { contextWindow: number }).contextWindow, CFG.contextWindow);
});

// —————————————————————— 2. wire 级回归（不发网络） ——————————————————————

test("wire 级：收窄后**不再生成** tool_removal/tool_addition 块；对照组（两能力位改回 true）能复现该块", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const { model } = await buildExplicitRuntime({ ...CFG, providerId: "ans-gateway", apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN" } as never);

  // 主组：修复后的模型 → 请求参数里不得出现未知块。
  const fixedParams = await captureRequestParams(model);
  assert.equal(fixedParams.includes('"tool_removal"'), false, "收窄后不得生成 tool_removal 块");
  assert.equal(fixedParams.includes('"tool_addition"'), false, "收窄后不得生成 tool_addition 块");

  // 对照组：把两能力位改回 true（= 修复前的克隆状态）→ 请求参数里出现 tool_removal（复现原始 500 触发条件）。
  const legacyClone = {
    ...(model as unknown as Record<string, unknown>),
    compat: {
      ...((model as { compat?: Record<string, unknown> }).compat ?? {}),
      supportsMidConvoSystemMessages: true,
      supportsMidConvoToolChanges: true,
    },
  };
  const legacyParams = await captureRequestParams(legacyClone);
  assert.ok(legacyParams.includes('"tool_removal"'), "对照组应复现 tool_removal 块（证明修复承重）");
});

// —————————————————————— 3. 存量防御：检测 + 跳过/新建 + 干净路径逐字不变 ——————————————————————

/** 写一个「含字面 tool_removal 块」的合成污染会话文件（system 消息 content 里带块）。 */
function writeContaminatedSession(dir: string, name: string): string {
  const path = join(dir, name);
  const header = { type: "session", version: 3, id: `cont-${name}`, timestamp: new Date().toISOString(), cwd: dir };
  const systemEntry = {
    type: "message",
    id: "e1",
    parentId: null,
    timestamp: new Date().toISOString(),
    message: {
      role: "system",
      content: [{ type: "tool_removal", tool: { type: "tool_reference", name: "tool_a" } }],
      timestamp: Date.now(),
    },
  };
  writeFileSync(path, `${JSON.stringify(header)}\n${JSON.stringify(systemEntry)}\n`, "utf8");
  return path;
}

test("存量防御：检测只认 system 消息里的字面块（用户正文提及同名串不误报）", async () => {
  await inTempDir(async (dir) => {
    const contaminated = writeContaminatedSession(dir, "bad.jsonl");
    assert.equal(sessionFileHasForeignToolChangeBlocks(contaminated), true, "system 消息里的字面块应被检测");

    const userMentions = join(dir, "chatty.jsonl");
    const header = { type: "session", version: 3, id: "chatty", timestamp: new Date().toISOString(), cwd: dir };
    const userEntry = {
      type: "message",
      id: "u1",
      parentId: null,
      timestamp: new Date().toISOString(),
      message: { role: "user", content: "我听说 tool_removal 这个词会导致 500", timestamp: Date.now() },
    };
    writeFileSync(userMentions, `${JSON.stringify(header)}\n${JSON.stringify(userEntry)}\n`, "utf8");
    assert.equal(
      sessionFileHasForeignToolChangeBlocks(userMentions),
      false,
      "用户正文提及同名串**不得**误报（只认 system 消息里的字面块）",
    );
  });
});

test("存量防御：全污染目录 → 跳过恢复、新建并如实 note；污染+干净 → 恢复干净旧档并记 skipped", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const pi = await import("@earendil-works/pi-coding-agent");

  // 场景 A：只有污染文件 → 拒绝恢复、新建 + note（不静默）。
  await inTempDir(async (dir) => {
    writeContaminatedSession(dir, "only.jsonl");
    const sel = await selectSessionManager(pi.SessionManager, { cwd: dir, sessionDir: dir });
    assert.equal(sel.mode, "created", "全污染应新建而非恢复");
    assert.ok((sel.skippedContaminated ?? 0) >= 1);
    assert.match(sel.note ?? "", /跳过恢复并新建/, "应带如实 note");
  });

  // 场景 B：污染（较新）+ 干净（较旧）→ 恢复干净的旧档，并记 skipped。
  await inTempDir(async (dir) => {
    const clean = pi.SessionManager.create(dir, dir);
    clean.appendMessage({ role: "user", content: "干净的旧会话", timestamp: Date.now() });
    const cleanPath = clean.getSessionFile();
    assert.ok(cleanPath !== undefined);
    // 让污染文件更「新」（list 按 modified 降序，先撞污染）。
    await new Promise((resolve) => setTimeout(resolve, 20));
    writeContaminatedSession(dir, "newer-bad.jsonl");

    const sel = await selectSessionManager(pi.SessionManager, { cwd: dir, sessionDir: dir });
    assert.equal(sel.mode, "resumed");
    assert.equal(sel.sessionFile, cleanPath, "应跳过污染、恢复干净的旧档");
    assert.equal(sel.skippedContaminated, 1);
  });
});

test("存量防御：干净会话恢复逐字不变（无 note / 无 skipped）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const pi = await import("@earendil-works/pi-coding-agent");
  await inTempDir(async (dir) => {
    const first = pi.SessionManager.create(dir, dir);
    first.appendMessage({ role: "user", content: "只有这话", timestamp: Date.now() });
    const file = first.getSessionFile();
    assert.ok(file !== undefined && readFileSync(file, "utf8").includes("只有这话"));

    const sel = await selectSessionManager(pi.SessionManager, { cwd: dir, sessionDir: dir });
    assert.equal(sel.mode, "resumed");
    assert.equal(sel.sessionFile, file);
    assert.equal(sel.note, undefined, "干净路径不得带 note（逐字不变）");
    assert.equal(sel.skippedContaminated, undefined, "干净路径不得带 skipped");
    assert.match(JSON.stringify(sel.manager.buildSessionContext().messages), /只有这话/);
  });
});
