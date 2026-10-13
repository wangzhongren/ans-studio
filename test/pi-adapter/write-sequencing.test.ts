// W-1：写类工具「同轮丢写」修复的 A/B 双向实测 + 形状断言。
// 归属：Pi适配器角色测试目录。**不静态 import Pi 包**（未安装则整组跳过）。
//
// 背景（真机 su 上报）：`edit_file` 同轮丢写。根因假设：Pi **缺省同批并行**执行工具（A-6 已实测默认），
// `write_file`/`edit_file` 未钉 `executionMode:"sequential"` ⇒ 同批 write+edit（同一文件）并行抢跑：
// edit 的**读**发生在 write 落盘之前（或文件尚未创建）⇒ edit 失败或被 write 覆盖 = **丢写**。
//
// 用例断言（双向）：
//   A（对照组，抹掉两写类工具的 executionMode = 修复前状态）：**丢写复现**（edit 效果缺失）；
//   B（主组，按修复后 toPiTool 原样）：**顺序执行、无丢写**（edit 在 write 的产物上生效）。
// 场景刻意含大内容（write 落盘慢）+ 目标文件初始不存在（edit 的读要么 ENOENT 要么撞已落盘）⇒ 对照组
// 确定性丢写（探针 5/5；用例 3 连跑要求全中）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildGovernedTools } from "../../src/provider/pi/tools.ts";
import { describeTool, toPiTool } from "../../src/common/pi-adapter/real-adapter.ts";
import { ANS_SETTINGS_OVERRIDES } from "../../src/common/pi-adapter/settings.ts";
import type { WriteDecision } from "../../src/model/decision.ts";

async function piInstalled(): Promise<boolean> {
  try {
    await import("@earendil-works/pi-coding-agent");
    return true;
  } catch {
    return false;
  }
}

function allowGate(): (p: string) => WriteDecision {
  return () => ({
    allowed: true,
    matchedEntry: { root: "project", path: "<any>", kind: "file", purpose: "test" },
  });
}

/** write 的大内容（让 write_file 的落盘显著慢于 edit 的读，拉大并行抢跑窗口）。 */
const BIG = "行内容填充\n".repeat(400_000);

/**
 * 跑一批「同批 write_file + edit_file（同一文件）」并回传最终文件状态。
 * `stripSequential: true` = 对照组：从两写类工具上抹掉 `executionMode`（= 修复前行为）。
 */
async function runBatchOnce(opts: { stripSequential: boolean }): Promise<{ hasWrite: boolean; hasEditEffect: boolean }> {
  const dir = mkdtempSync(join(tmpdir(), "ans-w1-"));
  try {
    const target = join(dir, "t.txt"); // **初始不存在**（edit 的读在并行下要么 ENOENT、要么撞已落盘）
    const governed = buildGovernedTools(allowGate(), { readRoot: dir, writeRoot: dir });
    const customTools = governed.map((tool) => {
      const piTool = toPiTool(tool as never) as unknown as Record<string, unknown>;
      if (opts.stripSequential && (piTool["name"] === "write_file" || piTool["name"] === "edit_file")) {
        delete piTool["executionMode"];
      }
      return piTool;
    });

    const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } = await import(
      "@earendil-works/pi-coding-agent"
    );
    const { fauxProvider, fauxAssistantMessage, fauxToolCall, InMemoryCredentialStore } = await import(
      "@earendil-works/pi-ai"
    );

    const faux = fauxProvider();
    faux.setResponses([
      fauxAssistantMessage([
        fauxToolCall("write_file", { path: "t.txt", content: `MARK_WRITE\nBASE\n${BIG}` }),
        fauxToolCall("edit_file", { path: "t.txt", old_string: "BASE", new_string: "EDITED" }),
      ]),
      fauxAssistantMessage("完成"),
    ]);
    const runtime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      refreshOnCreate: false,
      allowModelNetwork: false,
    });
    runtime.registerNativeProvider(faux.provider);
    const model = runtime.getModel(faux.provider.id, faux.models[0].id);
    assert.ok(model != null);

    const settingsManager = SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES);
    const resourceLoader = new DefaultResourceLoader({
      cwd: dir,
      agentDir: dir,
      extensionFactories: [],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      settingsManager,
    });
    await resourceLoader.reload();
    const { session } = await createAgentSession({
      cwd: dir,
      noTools: "builtin",
      customTools: customTools as never,
      resourceLoader,
      model: model as never,
      modelRuntime: runtime,
      sessionManager: SessionManager.inMemory(dir),
      settingsManager,
    });
    try {
      await session.prompt("先写后改同一文件");
    } finally {
      session.dispose();
    }

    const final = readFileSync(target, "utf8");
    return {
      hasWrite: final.includes("MARK_WRITE"),
      // edit 生效的证据：BASE 被替换成 EDITED（且替换发生在 write 的产物上——否则 edit 只会失败）。
      hasEditEffect: final.includes("EDITED") && !final.includes("\nBASE\n"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// —————————————————————— 1. 形状断言 ——————————————————————

test("describeTool：write_file / edit_file 钉 executionMode:'sequential'；read_file / run_shell 不加", () => {
  for (const name of ["write_file", "edit_file"]) {
    assert.equal(describeTool(name).executionMode, "sequential", `${name} 必须钉 sequential（W-1：读改写竞态）`);
  }
  assert.equal(describeTool("read_file").executionMode, undefined, "read_file 纯读不加（结论见 real-adapter 注释）");
  assert.equal(describeTool("run_shell").executionMode, undefined);
  // 交互/交报告/派发/审读工具保持既有档位（本改动不扰它们）。
  assert.equal(describeTool("request_confirmation").executionMode, "sequential");
  assert.equal(describeTool("submit_report").executionMode, undefined);
});

// —————————————————————— 2. A/B 双向实测 ——————————————————————

test("A 对照组（抹掉 executionMode，= 修复前）：同批 write+edit 丢写复现（3 连跑全中）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  for (let i = 0; i < 3; i++) {
    const result = await runBatchOnce({ stripSequential: true });
    assert.equal(result.hasWrite, true, `第 ${i + 1} 轮：write 应已落盘（前提）`);
    assert.equal(result.hasEditEffect, false, `第 ${i + 1} 轮：**丢写应复现**（edit 效果缺失）——实测 ${JSON.stringify(result)}`);
    t.diagnostic(`A 对照组第 ${i + 1} 轮：丢写复现 ${JSON.stringify(result)}`);
  }
});

test("B 主组（修复后原样）：同批 write+edit 顺序执行、无丢写（3 连跑全中）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  for (let i = 0; i < 3; i++) {
    const result = await runBatchOnce({ stripSequential: false });
    assert.deepEqual(
      result,
      { hasWrite: true, hasEditEffect: true },
      `第 ${i + 1} 轮：edit 应在 write 的产物上生效（无丢写）——实测 ${JSON.stringify(result)}`,
    );
    t.diagnostic(`B 主组第 ${i + 1} 轮：顺序执行、无丢写 ${JSON.stringify(result)}`);
  }
});
