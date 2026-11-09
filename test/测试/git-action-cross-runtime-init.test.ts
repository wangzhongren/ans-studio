// test/测试/git-action-cross-runtime-init.test.ts
// W5 跨角色集成（2026-11-08「删除全部预知式门控」）：Codex native 创建期对照（P1.2-AC-27）与
// Claude actor 的结构化 Git 动作（`git_candidate init`）动作时授权、sidecar write-ahead、
// `policyInputDigests` 两键、optionalEvidence，以及多 active 会话不阻断 actor（AC-1/AC-6/AC-7）与
// F8 foreign MCP 只记录（P1.2-AC-28 披露项）。
//
// 依据：设计 P1.4 §3.3/§3.4.3/§3.5/§3.8、§6.1；B1 v1 AC-1/AC-6/AC-7、P1.2-AC-27/AC-28；I0-1/I0-2/I0-4。
// 夹具：`git-action-cross-runtime-fixture.ts`（真实 Core 包装层 + 桩件 provider + 真实 host/trunk/Git 效果）。
// 说明（如实）：真实模型/真实 SDK 不在本文件范围（B1 §6.2 真实运行为独立节点）；跨角色完整 commit/delivery
// 效果链不在本文件构造（见 W3b/W5 覆盖边界）。
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, after } from "node:test";

import { createRuntimeAdapter, discardRuntimeRolePreparation, inspectRuntimeCoreRegistry, type RuntimeSessionOptions } from "../../src/service/runtime/session.ts";
import { readGitActionAuthorizations, readGitInitializationRecord } from "../../src/provider/trunk/public/trunk-store.ts";
import {
  allowGate, disposeOpenedSessions, entryOf, fileGateOptions, fixtureRole, runInitScenario,
} from "./git-action-cross-runtime-fixture.ts";

after(disposeOpenedSessions);

test("P1.2-AC-27 Codex 创建期对照：responses（native 不可用）⇒ plan 省略 native 仍发 token；chat/off（observed）⇒ 记录可选强证明", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ans-w5-ac27-"));
  const keys = ["ANS_CODEX_WIRE_API", "ANS_CODEX_WEB_SEARCH", "ANS_W5_AC27_KEY"] as const;
  const previous = keys.map(key => [key, process.env[key]] as const);
  const options = (): RuntimeSessionOptions => ({ runtime: "codex", gate: allowGate, projectRoot: root, skillRoot: root,
    baseUrl: "http://127.0.0.1:9/v1", modelId: "w5-ac27", apiKeyEnvVar: "ANS_W5_AC27_KEY", ...fileGateOptions(root) });
  try {
    process.env.ANS_W5_AC27_KEY = "fixture-not-a-real-key";
    // native 不可用（responses wire）：创建准入仍 observed、plan.native 缺席、无 native-factory-* 拒绝。
    process.env.ANS_CODEX_WIRE_API = "responses";
    process.env.ANS_CODEX_WEB_SEARCH = "off";
    const unavailable = await createRuntimeAdapter(options()).prepareRole!(fixtureRole("w5-ac27-responses"));
    assert.equal(unavailable.plan.status, "observed", JSON.stringify(unavailable.plan.reasons));
    assert.ok(unavailable.token, "native 不可用不得阻断创建（P1.2-AC-27）");
    assert.equal("native" in unavailable.plan, false, "native 不可用 ⇒ plan 省略 native");
    for (const retired of ["native-factory-plan-unverified", "native-factory-plan-unavailable", "native-factory-plan-preparation-failed"])
      assert.equal(unavailable.plan.reasons.includes(retired), false, retired);
    discardRuntimeRolePreparation(unavailable, new Error("w5-ac27 responses revoke"));
    // native observed（chat/off）：plan 记录可选强证明；同样不是创建门（绑定核对由 W1 真实默认会话覆盖）。
    process.env.ANS_CODEX_WIRE_API = "chat";
    const observed = await createRuntimeAdapter(options()).prepareRole!(fixtureRole("w5-ac27-observed"));
    assert.equal(observed.plan.status, "observed", JSON.stringify(observed.plan.reasons));
    assert.ok(observed.token);
    assert.ok(observed.plan.native, "native observed ⇒ plan 记录可选强证明");
    assert.equal(observed.plan.native!.factory, "codex-chat");
    discardRuntimeRolePreparation(observed, new Error("w5-ac27 observed revoke"));
    // 撤销后均属 H13 never-started 豁免（真实边界，不是注册表级预知要求）。
    for (const roleId of ["w5-ac27-responses", "w5-ac27-observed"]) {
      const entry = inspectRuntimeCoreRegistry().entries.find(candidate => candidate.roleId === roleId);
      assert.equal(entry?.state, "prepared");
      assert.equal(entry?.construction?.preparedTokensRevoked, true);
    }
  } finally {
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await fsp.rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("AC-1/AC-6/AC-7/P1.2-AC-28 Claude actor：多 active 会话（Pi/Claude）与 foreign MCP 不阻断 init；sidecar 两键 digest、optionalEvidence 记录", async () => {
  const scenario = await runInitScenario({ runtime: "claude", operationId: "w5-cross-claude-init", prefix: "ans-w5-claude-", withOtherActiveSessions: true });
  const { root, canonical, taskId, runId, actor, result } = scenario;
  assert.equal(result.status, "prepared", JSON.stringify(result));
  // 真实效果：init.json（candidate-created）+ 仓库存在（效果在 sidecar 之后执行，顺序守卫见 W3b 证据）。
  const journal = await readGitInitializationRecord(root, "w5-cross-claude-init");
  assert.ok(journal, "init.json 存在");
  assert.equal(journal.stage, "candidate-created");
  assert.equal(fs.existsSync(path.join(root, ".git")), true, "仓库已真实创建");
  // sidecar：write-ahead 授权审计（actor/task/turn/lease/两键 digest/optionalEvidence）。
  const sidecar = await readGitActionAuthorizations(root, "w5-cross-claude-init");
  assert.equal(sidecar.ok, true);
  if (!sidecar.ok) return;
  assert.equal(sidecar.records.length, 1);
  const record = sidecar.records[0]!;
  assert.equal(record.template, "init");
  assert.equal(record.actorRoleId, "convener");
  assert.equal(record.coreSessionId, actor.sessionId);
  assert.equal(record.taskId, taskId);
  assert.equal(record.runId, runId);
  assert.equal(record.turnId, entryOf(actor.sessionId)?.lifecycle?.turnId);
  assert.equal(record.activeTool, "git_candidate");
  assert.equal(record.projectRoot.toLowerCase(), canonical.toLowerCase());
  assert.match(record.rootsDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(record.policyInputDigests), ["init", "candidate"], "R2：init 两键");
  assert.match(record.policyInputDigests.init!, /^[a-f0-9]{64}$/);
  assert.match(record.policyInputDigests.candidate!, /^[a-f0-9]{64}$/);
  assert.notEqual(record.policyInputDigests.init, record.policyInputDigests.candidate);
  assert.ok(record.leaseId.length > 0);
  assert.equal(Object.hasOwn(record.optionalEvidence, "applicationMediation"), false, "PR #72：sidecar 不写 applicationMediation");
  assert.equal(record.optionalEvidence.toolSurfaceStatus, "unknown", "桩件会话 strict surface unknown 仅作证据（不影响放行）");
  // AC-6：多 active 会话不阻断 actor（成功本身即证明）；optionalEvidence 记录 foreign MCP（F8 只记录不判定）。
  assert.ok((record.optionalEvidence.configuredForeignMcpServers ?? []).includes("foreign"),
    `F8：foreign MCP 只进 optionalEvidence（actual=${JSON.stringify(record.optionalEvidence)}）`);
});
