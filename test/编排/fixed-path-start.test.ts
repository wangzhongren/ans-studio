// test/编排/fixed-path-start.test.ts
// T3「两条固定工作流路径」B2 编排：AC-12/T-05——per-flow 模式（不缓存）+ 首次 fixed 启动顺序
// （避免桌面 B1 启用闸的鸡生蛋死锁：B3 必须先 `writeProjectConfigWorkflowSchema`/`prepareFixedPathStart`
// 再派发首个 fixed workflow）。
//
// 只读/临时目录测试；不启动真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  prepareFixedPathStart,
  workflowMode,
} from "../../src/common/编排/workflow-service.ts";
import {
  isFixedPathEnabledForFlow,
  resolveFixedPathMode,
  workflowModeForFlowResolver,
} from "../../app/desktop/workflow.ts";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-fixed-start-"));
}

async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

async function writeJson(root: string, rel: string, value: unknown): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("首次 fixed 启动顺序：B1 启用闸在显式写 workflowSchema 前不启用（死锁点）→ 助手写回后 fixed 放行", async () => {
  const root = await tempRoot();
  try {
    // 编排 workflowMode 对新 flow 判 fixed；但桌面 B1 启用闸要求显式 schema 或既有 workflow.started
    // ⇒ 首次启动前直接派发会解析成 legacy（鸡生蛋死锁）。本测试把顺序钉死。
    assert.equal(await workflowMode(root, "snake"), "fixed", "编排层：空项目新 flow 判定 fixed");
    assert.equal(await isFixedPathEnabledForFlow(root, "snake"), false, "首次启动前 B1 启用闸不启用");
    assert.equal(await resolveFixedPathMode(root, "snake"), "legacy", "首次启动前桌面解析为 legacy");

    const started = await prepareFixedPathStart({ projectRoot: root, flowId: "snake" });
    assert.equal(started.ok, true);
    if (started.ok) {
      assert.equal(started.config.changed, true, "首次启动写回 workflowSchema");
      assert.equal(started.workflowMode, "fixed");
    }
    assert.equal(await isFixedPathEnabledForFlow(root, "snake"), true, "写回后 B1 启用闸放行");
    assert.equal(await resolveFixedPathMode(root, "snake"), "fixed");
    const text = await fs.readFile(path.join(root, ".ans", "project.json"), "utf8");
    assert.equal((JSON.parse(text) as Record<string, unknown>)["workflowSchema"], "two-fixed-paths/v1");

    // 幂等：第二次调用 changed:false，且模式仍 fixed。
    const again = await prepareFixedPathStart({ projectRoot: root, flowId: "snake" });
    assert.equal(again.ok, true);
    if (again.ok) {
      assert.equal(again.config.changed, false);
      assert.equal(again.workflowMode, "fixed");
    }
  } finally {
    await cleanup(root);
  }
});

test("显式 legacy/v1：助手不覆盖配置，返回 legacy（B3 不得按 fixed 派发）", async () => {
  const root = await tempRoot();
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "legacy/v1", governanceModel: "trio", custom: [1] });
    const started = await prepareFixedPathStart({ projectRoot: root, flowId: "snake" });
    assert.equal(started.ok, true);
    if (started.ok) {
      assert.equal(started.config.changed, false);
      assert.equal(started.config.skipped, "explicit-legacy");
      assert.equal(started.workflowMode, "legacy");
    }
    assert.equal(await isFixedPathEnabledForFlow(root, "snake"), false);
    assert.equal(await resolveFixedPathMode(root, "snake"), "legacy");
    // 既有键/值原样保留（未覆盖）。
    const parsed = JSON.parse(await fs.readFile(path.join(root, ".ans", "project.json"), "utf8")) as Record<string, unknown>;
    assert.equal(parsed["workflowSchema"], "legacy/v1");
    assert.deepEqual(parsed["custom"], [1]);
  } finally {
    await cleanup(root);
  }
});

test("project.json 坏文件：助手 fail-closed project-config-write-failed（不覆盖、不猜 fixed）", async () => {
  const root = await tempRoot();
  try {
    const file = path.join(root, ".ans", "project.json");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "{oops", "utf8");
    const started = await prepareFixedPathStart({ projectRoot: root, flowId: "snake" });
    assert.equal(started.ok, false);
    if (!started.ok) assert.equal(started.code, "project-config-write-failed");
    assert.equal(await fs.readFile(file, "utf8"), "{oops", "失败不得覆盖既有内容");
    assert.equal(await isFixedPathEnabledForFlow(root, "snake"), false);
  } finally {
    await cleanup(root);
  }
});

test("per-flow 不缓存：同一进程内按实际 flowId 逐次解析（legacy 在飞 flow 保持 legacy，新 flow fixed）", async () => {
  const root = await tempRoot();
  try {
    // 显式 fixed 项目：桌面启用闸放行后仍以编排 per-flow 判定为准。
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    await writeJson(root, ".ans/runs/run-20261030-snake-abcdef12/manifest.json", {
      schema: "ans-run/v1",
      runId: "run-20261030-snake-abcdef12",
      flowId: "snake",
      state: "draft",
    });
    const resolve = workflowModeForFlowResolver(root);
    assert.equal(await resolve("snake"), "legacy", "legacy 在飞 flow 走 legacy");
    assert.equal(await resolve("snake-new"), "fixed", "新 flow 走 fixed（与在飞 flow 并存）");
    // 不缓存：删掉在飞 run 后同一回调立即返回 fixed。
    await fs.rm(path.join(root, ".ans", "runs"), { recursive: true, force: true });
    assert.equal(await resolve("snake"), "fixed", "per-flow 解析不缓存项目级单值");
  } finally {
    await cleanup(root);
  }
});
