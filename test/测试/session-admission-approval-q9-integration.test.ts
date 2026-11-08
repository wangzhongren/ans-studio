// test/测试/session-admission-approval-q9-integration.test.ts
// D1 跨角色集成（Q9 / B1 AC-26）：受保护项目 + 真实 shell 会话（Codex 严格工厂）下，
// `git_candidate init` 仍被既有 `inspectInitializationProtection` 拒绝，且零 ref/journal/工作树副作用。
//
// 依据：设计 P1.3 §2.4.4/F3/Q9、B1 v1 AC-26；本变更**不放宽**注册表级初始化保护。
// 纪律：不运行真实模型/Electron/CDP；不写产品源码；不修改既有断言、不加 skip、不使用 --test-force-exit。
// 说明（如实）：本夹具构造真实 Core/managed 会话 + 真实 host inventory + 真实 trunk 账本/源，驱动
// `createGitRoleRuntime().gitCandidate(init)`；具体拒绝码以实际观测断言（AC-26 允许的两个既有码之一，
// 若更早的保护前置拒绝则如实记录代码族，见 D1 记录）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import {
  createGitRoleRuntime,
  recordTaskObservation,
  recordGitHostInventory,
} from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createFsTrunkStore } from "../../src/provider/trunk/public/trunk-store.ts";
import { classifyShell, defaultShellRules } from "../../src/service/gate/shell-rules.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { TaskCreatedEvent } from "../../src/model/runtime.ts";

const AT = "2026-11-08T00:00:00.000Z";

async function withCodexEnv<T>(fn: () => Promise<T>): Promise<T> {
  const keys = ["ANS_CODEX_WIRE_API", "ANS_CODEX_WEB_SEARCH", "ANS_D1_Q9_KEY"] as const;
  const previous = keys.map((key) => [key, process.env[key]] as const);
  process.env.ANS_CODEX_WIRE_API = "chat";
  process.env.ANS_CODEX_WEB_SEARCH = "off";
  process.env.ANS_D1_Q9_KEY = "fixture-not-a-real-key";
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

/** trio 项目（内置六角色）；治理接受证据 accepted ⇒ 内置角色边界与审计边界可用。 */
async function makeTrioProject(prefix: string): Promise<ProjectConfig> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    projectRoot: root,
    skillRoot: path.join(root, "skill-root"),
    roles: {},
    governanceModel: "trio",
    builtInRoles: ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
    governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:d1-q9" } },
  };
}

async function markRequired(root: string): Promise<void> {
  const sourceId = `init-source-${createHash("sha256").update(root).digest("hex")}`;
  const dir = path.join(root, ".ans", "trunk", "initialization-sources");
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${sourceId}.json`), JSON.stringify({
    schema: "repository-work-source/v1",
    kind: "customer-turn",
    sourceId,
    projectRoot: root,
  }));
}

const exists = (target: string) => fs.existsSync(target);

test("D1-Q9 AC-26：受保护 + 真实 shell 会话（Codex）+ git_candidate init ⇒ 既有初始化保护拒绝、零副作用", async (t) => {
  await withCodexEnv(async () => {
    const project = await makeTrioProject("ans-d1-q9-");
    const root = project.projectRoot;
    await markRequired(root);
    const runtimeOptions = { baseUrl: "http://127.0.0.1:9/v1", modelId: "d1-q9", apiKeyEnvVar: "ANS_D1_Q9_KEY" };
    let chief: Awaited<ReturnType<typeof openRoleSession>> | undefined;
    let convener: Awaited<ReturnType<typeof openRoleSession>> | undefined;
    try {
      // 真实 Core/managed 会话：chief（父）+ convener（actor；审批档 arm shell）。
      chief = await openRoleSession({ roleId: "chief", runtime: "codex", project, autoRepin: false }, { runtimeOptions });
      convener = await openRoleSession({
        roleId: "convener",
        runtime: "codex",
        project,
        autoRepin: false,
        shellOperatorOnly: { operatorChannel: () => ({ outcome: "deny", operatorId: "d1-客户", reason: "d1-q9" }), classifyShell, rules: defaultShellRules() },
      }, { runtimeOptions });
      assert.equal(typeof chief.sessionId, "string");
      assert.equal(typeof convener.sessionId, "string");
      const convenerSurface = convener.inspectToolSurface!();
      assert.ok(convenerSurface.appTools.includes("run_shell"), "actor 会话必须真实 arm shell");
      assert.equal(convenerSurface.status, "unknown", "含 shell ⇒ strict surface unknown（Q9 边界前提）");

      // 真实 host inventory（desktop-session-manager 形状）：两会话 live，actor 带 taskId。
      const taskId = "d1-q9-init-child";
      const runId = "run-d1-q9";
      const store = createFsTrunkStore(root);
      const run = { schema: "ans-run/v1" as const, runId, flowId: "d1-q9", state: "draft" as const, documents: {}, createdAt: AT };
      const runSaved = await store.compareAndSwapRunRecord!(runId, null, run as never);
      assert.ok(runSaved.ok, JSON.stringify(runSaved));
      const sourceId = `init-source-${"a".repeat(64)}`;
      const source = await store.writeInitializationSource!(sourceId, Buffer.from(JSON.stringify({
        schema: "repository-work-source/v1", kind: "customer-turn", sourceId, projectRoot: root, flowId: "d1-q9",
        parent: { roleId: "chief", sessionId: chief.sessionId, turnId: "d1-q9-chief-turn" },
      })).toString("base64"));
      assert.ok(source.ok, JSON.stringify(source));
      if (!source.ok) return;
      const task: TaskCreatedEvent = {
        v: 1, at: AT, kind: "task.created", taskId, from: "chief", to: "convener",
        text: "D1 Q9 initialization fixture", sideEffect: "unknown", idempotencyKey: taskId,
        flowId: "d1-q9", runId, runState: "draft",
        workSourceRef: { kind: "chief-customer-turn", sourceId, path: source.value.path, sha256: source.value.sha256 },
      } as TaskCreatedEvent;
      const recorded = await recordTaskObservation({ projectRoot: root, event: task });
      assert.ok(recorded.ok, JSON.stringify(recorded));
      const inventory = {
        source: "desktop-session-manager" as const, projectRoot: root, observedAt: AT, revision: 1,
        sessions: [
          { hostHandleId: "d1-q9-chief", roleId: "chief", runtime: "codex", phase: "live" as const, coreSessionId: chief.sessionId, errors: [] },
          { hostHandleId: "d1-q9-convener", roleId: "convener", runtime: "codex", phase: "live" as const, coreSessionId: convener.sessionId, taskId, errors: [] },
        ],
        pendingOpens: [], queuedDispatches: [], activeDeliveries: [], coverage: "unknown" as const, reasons: [],
      };
      const published = recordGitHostInventory(inventory);
      assert.ok(published.ok, JSON.stringify(published));

      // 零副作用基线：.git / 操作 journal / trunk refs 均不存在。
      const operationHash = createHash("sha256").update("d1-q9-init-op").digest("hex");
      assert.equal(exists(path.join(root, ".git")), false);
      assert.equal(exists(path.join(root, ".ans", "trunk", "operations", operationHash)), false);
      assert.equal(exists(path.join(root, ".ans", "trunk", "refs")), false);

      const runtime = createGitRoleRuntime({ projectRoot: root, context: { actorRoleId: "convener", taskId, runId, readPaths: ["."] } });
      const result = await runtime.gitCandidate({ action: "init", operationId: "d1-q9-init-op", base: { ref: "refs/ans/trunk", oid: null }, message: "D1 Q9 fixture init" } as never);
      assert.equal(result.status, "blocked", JSON.stringify(result));
      assert.equal(typeof result.code, "string");
      t.diagnostic(JSON.stringify({ d1Q9RejectionCode: result.code, d1Q9Message: result.message }));
      // AC-26 的两个既有码之一（更早的保护前置拒绝以实际码断言；见本文件头注与 D1 记录）。
      // D1 实测：含 shell 的 Codex 会话 ⇒ 严格 native surface 不可证（AC-26 指定码之一）。
      assert.equal(result.code, "git-native-surface-unproven", `actual=${result.code} message=${result.message}`);
      // 零副作用：无 .git、无 journal、无 ref、无候选对象。
      assert.equal(exists(path.join(root, ".git")), false, "拒绝不得初始化仓库");
      assert.equal(exists(path.join(root, ".ans", "trunk", "operations", operationHash)), false, "拒绝不得写操作 journal");
      assert.equal(exists(path.join(root, ".ans", "trunk", "refs")), false, "拒绝不得写 trunk ref");
    } finally {
      await convener?.dispose().catch(() => undefined);
      await chief?.dispose().catch(() => undefined);
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
});
