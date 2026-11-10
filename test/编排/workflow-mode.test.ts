// test/编排/workflow-mode.test.ts
// T3「两条固定工作流路径」B0：B1 AC-12/AC-15/T-05——per-flow 模式判定与 `.ans/project.json` 原子写回。
// 覆盖：空项目 fixed；显式 legacy/v1 强制 legacy；two-fixed-paths/v1 默认；legacy 在飞 run 与新 flow 并存；
// trunk 指向；配置损坏 fail-closed；写回保留既有键/幂等/explicit-legacy 不覆盖/坏文件不覆盖；
// `.gitignore` ans-managed 块（缺失创建/幂等/保留用户内容/畸形 fail-closed）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ANS_GITIGNORE_BLOCK_START,
  ansGitignoreBlockStatus,
  ensureProjectGitignore,
  workflowMode,
  writeProjectConfigWorkflowSchema,
} from "../../src/common/编排/workflow-service.ts";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-workflow-mode-"));
}

async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

async function writeJson(root: string, rel: string, value: unknown): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeRun(root: string, runId: string, flowId: string, state: string): Promise<void> {
  await writeJson(root, `.ans/runs/${runId}/manifest.json`, { schema: "ans-run/v1", runId, flowId, state });
}

test("per-flow 模式：空项目新 flow fixed；显式 legacy/v1 强制 legacy；two-fixed-paths/v1 默认 fixed", async () => {
  const root = await tempRoot();
  try {
    assert.equal(await workflowMode(root, "snake"), "fixed");
    await writeJson(root, ".ans/project.json", { workflowSchema: "legacy/v1" });
    assert.equal(await workflowMode(root, "snake"), "legacy");
    assert.equal(await workflowMode(root, "snake2"), "legacy");
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1" });
    assert.equal(await workflowMode(root, "snake3"), "fixed");
    // 不缓存：同一进程内切换配置后立即生效。
    await writeJson(root, ".ans/project.json", { workflowSchema: "legacy/v1" });
    assert.equal(await workflowMode(root, "snake3"), "legacy");
  } finally {
    await cleanup(root);
  }
});

test("legacy 在飞 run + 新 fixed flow 并存（draft/pinned ⇒ legacy；closed/cancelled ⇒ fixed）", async () => {
  const root = await tempRoot();
  try {
    await writeRun(root, "run-20261030-snake-abcdef12", "snake", "draft");
    assert.equal(await workflowMode(root, "snake"), "legacy");
    assert.equal(await workflowMode(root, "snake-new"), "fixed");
    // pinned 同样在飞。
    await writeRun(root, "run-20261030-snake2-abcdef12", "snake2", "pinned");
    assert.equal(await workflowMode(root, "snake2"), "legacy");
    // closed ⇒ 不再在飞（新 flow 判定 fixed）。
    await writeRun(root, "run-20261030-done-abcdef12", "done", "closed");
    assert.equal(await workflowMode(root, "done"), "fixed");
    // 其它 flow 的活动 run 不影响本 flow。
    assert.equal(await workflowMode(root, "other"), "fixed");
  } finally {
    await cleanup(root);
  }
});

test("有效 trunk 指向该 flow ⇒ legacy；trunk 引用的 run 已关闭 ⇒ 不强制 legacy", async () => {
  const root = await tempRoot();
  try {
    await writeJson(root, ".ans/trunk/manifest.json", { schema: "trunk/v1", trunkVersion: 1, flowId: "snake" });
    assert.equal(await workflowMode(root, "snake"), "legacy");
    assert.equal(await workflowMode(root, "snake-new"), "fixed");
    // 坏 trunk（schema 不符）不强制 legacy。
    await writeJson(root, ".ans/trunk/manifest.json", { schema: "trunk/v0", trunkVersion: 1, flowId: "snake" });
    assert.equal(await workflowMode(root, "snake"), "fixed");
    // 引用已关闭 run ⇒ 视为关闭。
    await writeRun(root, "run-20261030-snake-abcdef12", "snake", "closed");
    await writeJson(root, ".ans/trunk/manifest.json", {
      schema: "trunk/v1", trunkVersion: 2, flowId: "snake", runId: "run-20261030-snake-abcdef12",
    });
    assert.equal(await workflowMode(root, "snake"), "fixed");
  } finally {
    await cleanup(root);
  }
});

test("配置损坏/不可解析 ⇒ fail-closed 走 legacy（不猜 fixed）", async () => {
  const root = await tempRoot();
  try {
    const file = path.join(root, ".ans", "project.json");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "{oops", "utf8");
    assert.equal(await workflowMode(root, "snake"), "legacy");
    await fs.writeFile(file, JSON.stringify({ workflowSchema: "bogus" }), "utf8");
    assert.equal(await workflowMode(root, "snake"), "legacy");
  } finally {
    await cleanup(root);
  }
});

test("writeProjectConfigWorkflowSchema：保留既有键、原子写、幂等、explicit-legacy 不覆盖、坏文件 fail-closed", async () => {
  const root = await tempRoot();
  try {
    await writeJson(root, ".ans/project.json", {
      governanceModel: "trio",
      roles: { worker: { card: "角色卡/worker/role-card.md", boundary: "角色卡/worker/boundary.yaml" } },
      custom: { keep: [1, 2] },
    });
    const first = await writeProjectConfigWorkflowSchema(root);
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.changed, true);
    const text = await fs.readFile(path.join(root, ".ans", "project.json"), "utf8");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    assert.equal(parsed["workflowSchema"], "two-fixed-paths/v1");
    assert.equal(parsed["governanceModel"], "trio");
    assert.deepEqual(parsed["custom"], { keep: [1, 2] });
    assert.deepEqual(parsed["roles"], { worker: { card: "角色卡/worker/role-card.md", boundary: "角色卡/worker/boundary.yaml" } });
    // 幂等：值相同 ⇒ changed:false，不重写。
    const before = await fs.stat(path.join(root, ".ans", "project.json"));
    const second = await writeProjectConfigWorkflowSchema(root);
    assert.equal(second.ok, true);
    if (second.ok) assert.equal(second.changed, false);
    const after = await fs.stat(path.join(root, ".ans", "project.json"));
    assert.equal(after.mtimeMs, before.mtimeMs);

    // 显式 legacy/v1：不覆盖。
    const legacyRoot = await tempRoot();
    try {
      await writeJson(legacyRoot, ".ans/project.json", { workflowSchema: "legacy/v1", governanceModel: "single" });
      const skipped = await writeProjectConfigWorkflowSchema(legacyRoot);
      assert.equal(skipped.ok, true);
      if (skipped.ok) {
        assert.equal(skipped.changed, false);
        assert.equal(skipped.skipped, "explicit-legacy");
      }
      const legacyText = await fs.readFile(path.join(legacyRoot, ".ans", "project.json"), "utf8");
      assert.equal((JSON.parse(legacyText) as Record<string, unknown>)["workflowSchema"], "legacy/v1");
    } finally {
      await cleanup(legacyRoot);
    }

    // 坏 JSON / 非对象 / 非法既有值 ⇒ project-config-write-failed，不覆盖。
    for (const content of ["{oops", "[]", JSON.stringify({ workflowSchema: "bogus" })]) {
      const badRoot = await tempRoot();
      try {
        const file = path.join(badRoot, ".ans", "project.json");
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, content, "utf8");
        const failed = await writeProjectConfigWorkflowSchema(badRoot);
        assert.equal(failed.ok, false);
        if (!failed.ok) assert.equal(failed.code, "project-config-write-failed");
        assert.equal(await fs.readFile(file, "utf8"), content, "失败不得覆盖既有内容");
      } finally {
        await cleanup(badRoot);
      }
    }
  } finally {
    await cleanup(root);
  }
});

test("ensureProjectGitignore：缺失创建、幂等、保留用户内容、块畸形 fail-closed", async () => {
  const root = await tempRoot();
  try {
    const file = path.join(root, ".gitignore");
    const created = await ensureProjectGitignore(root);
    assert.equal(created.ok, true);
    if (created.ok) {
      assert.equal(created.changed, true);
      assert.match(created.sha256, /^[0-9a-f]{64}$/);
      const text = await fs.readFile(file, "utf8");
      assert.ok(text.includes(ANS_GITIGNORE_BLOCK_START));
      assert.match(text, /\.ans\//);
      assert.match(text, /角色卡\//);
      assert.match(text, /docs\/acceptance\//);
      assert.match(text, /node_modules\//);
      assert.equal(ansGitignoreBlockStatus(text), "present");
    }
    const again = await ensureProjectGitignore(root);
    assert.equal(again.ok, true);
    if (again.ok) assert.equal(again.changed, false);

    // 保留用户内容（追加到既有文件）。
    const userRoot = await tempRoot();
    try {
      const userFile = path.join(userRoot, ".gitignore");
      await fs.writeFile(userFile, ".env\nbuild/\n", "utf8");
      const added = await ensureProjectGitignore(userRoot);
      assert.equal(added.ok, true);
      if (added.ok) assert.equal(added.changed, true);
      const text = await fs.readFile(userFile, "utf8");
      assert.ok(text.startsWith(".env\nbuild/\n"));
      assert.equal(ansGitignoreBlockStatus(text), "present");
      // 用户内容不被覆盖：再次调用幂等。
      const userAgain = await ensureProjectGitignore(userRoot);
      if (userAgain.ok) assert.equal(userAgain.changed, false);
    } finally {
      await cleanup(userRoot);
    }

    // 只有起始标记（畸形）⇒ fail-closed，不覆盖用户内容。
    const badRoot = await tempRoot();
    try {
      const badFile = path.join(badRoot, ".gitignore");
      const malformed = `.env\n${ANS_GITIGNORE_BLOCK_START}\n.ans/\n`;
      await fs.writeFile(badFile, malformed, "utf8");
      const failed = await ensureProjectGitignore(badRoot);
      assert.equal(failed.ok, false);
      if (!failed.ok) assert.equal(failed.code, "baseline-gitignore-malformed");
      assert.equal(await fs.readFile(badFile, "utf8"), malformed);
    } finally {
      await cleanup(badRoot);
    }
  } finally {
    await cleanup(root);
  }
});
