// test/编排/run-role-admission.test.ts
// 编排角色自测（2026-11-08 W2b/W3b，设计 P1.3 §2.2.4 / §4.1）：
// - `bindPreparedRuntimeRole` 删除旧门 `runtime-protected-scope-unmediated-app-execution-planned`，
//   改为防御断言（受保护 + plan.native.appTools 含 shell + 无 approvalChain ⇒ unproven）；
// - 只读 Git 能力注入（`matchReadonlyGit` + `executeReadonlyGit`）与会话 roleId 进入适配器能力面。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { readGitHostProtectionRequirement } from "../../src/provider/trunk/public/trunk-store.ts";
import { matchReadonlyGit } from "../../src/service/gate/shell-rules.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RuntimeAdapter,
  RoleSession,
  SessionEvent,
  RuntimeCreationPlanFacts,
  RuntimePreparedRoleToken,
  RuntimeNativeFactoryPlanFacts,
  WriteGate,
} from "../../src/model/runtime.ts";

/** 临时项目（角色 X + 边界文件 + 内置 su）。 */
function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-runrole-adm-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/thing.ts\n    purpose: 测试条目\n",
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:fixture" } },
  };
}

function fakeSession(): RoleSession {
  return {
    async prompt(): Promise<void> {},
    events(): AsyncIterable<SessionEvent> {
      return (async function* () {
        yield { kind: "settled", summary: "完成" } as SessionEvent;
      })();
    },
    async dispose(): Promise<void> {},
  };
}

function nativePlan(projectRoot: string): RuntimeNativeFactoryPlanFacts {
  return {
    source: "native-factory-plan",
    planId: "native-test",
    configDigest: "",
    roleId: "X",
    runtime: "pi",
    status: "observed",
    factory: "unknown",
    transport: "unknown",
    wire: "unknown",
    appTools: ["run_shell"],
    foreignMcpServers: [],
    nativeBuiltinTools: [],
    plannedProcesses: [],
    reasons: [],
  };
}

/**
 * 让 `readGitHostProtectionRequirement` 达到 `required`：先制造合法证据观测一次（进程内
 * coordinator 的 `everRequired` 粘滞），再移除 `.ans`——避免 `.ans/trunk` 残缺影响角色/边界解析。
 */
async function markRequired(project: ProjectConfig): Promise<void> {
  const trunk = path.join(project.projectRoot, ".ans", "trunk");
  fs.mkdirSync(trunk, { recursive: true });
  fs.writeFileSync(path.join(trunk, "git-mode.json"), "{}\n");
  const requirement = await readGitHostProtectionRequirement({ projectRoot: project.projectRoot });
  assert.equal(requirement.state, "required", "夹具必须观测到 required");
  fs.rmSync(path.join(project.projectRoot, ".ans"), { recursive: true, force: true });
}

test("防御断言：受保护 + plan.native.appTools 含 shell 但无 approvalChain ⇒ unproven（旧门退役，不 bind）", async () => {
  const project = makeTempProject();
  try {
    await markRequired(project);
    let bound = false;
    const plan: RuntimeCreationPlanFacts = {
      source: "core-factory-plan",
      planId: "plan-test",
      configDigest: "",
      roleId: "X",
      runtime: "pi",
      projectRoot: project.projectRoot,
      factoryProvenance: "default-production",
      status: "observed",
      scopeProtection: { state: "required", revision: 1 },
      native: nativePlan(project.projectRoot),
      reasons: [],
    };
    const createAdapter = (_gate: WriteGate, _capabilities?: AdapterCapabilities): RuntimeAdapter => ({
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return fakeSession();
      },
      async prepareRole() {
        return { plan };
      },
      async bindPreparedRole(_token: RuntimePreparedRoleToken): Promise<RoleSession> {
        bound = true;
        return fakeSession();
      },
    });

    await assert.rejects(
      () => openRoleSession({ roleId: "X", project }, { createAdapter }),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        assert.match(message, /runtime-creation-admission-unproven:protected-scope-approval-chain-unproven/);
        assert.doesNotMatch(message, /runtime-protected-scope-unmediated-app-execution-planned/, "旧门已退役");
        return true;
      },
    );
    assert.equal(bound, false, "防御断言命中时不得 bind");
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("unmanaged 范围不误伤：无 approvalChain 的历史路径仍可 bind（旧行为保留）", async () => {
  const project = makeTempProject();
  try {
    let bound = false;
    const plan: RuntimeCreationPlanFacts = {
      source: "core-factory-plan",
      planId: "plan-legacy",
      configDigest: "",
      roleId: "X",
      runtime: "pi",
      projectRoot: project.projectRoot,
      factoryProvenance: "default-production",
      status: "observed",
      scopeProtection: { state: "unmanaged", revision: 1 },
      reasons: [],
    };
    const createAdapter = (_gate: WriteGate, _capabilities?: AdapterCapabilities): RuntimeAdapter => ({
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return fakeSession();
      },
      async prepareRole() {
        return { plan, token: {} as RuntimePreparedRoleToken };
      },
      async bindPreparedRole(_token: RuntimePreparedRoleToken): Promise<RoleSession> {
        bound = true;
        return fakeSession();
      },
    });
    const handle = await openRoleSession({ roleId: "X", project }, { createAdapter });
    assert.equal(bound, true, "unmanaged + observed + token ⇒ 正常 bind");
    await handle.dispose();
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("适配器能力面注入：readonlyGit（matchReadonlyGit + executeReadonlyGit）与会话 roleId", async () => {
  const project = makeTempProject();
  try {
    let captured: AdapterCapabilities | undefined;
    const createAdapter = (_gate: WriteGate, capabilities?: AdapterCapabilities): RuntimeAdapter => {
      captured = capabilities;
      return {
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole(): Promise<RoleSession> {
          return fakeSession();
        },
      };
    };
    const handle = await openRoleSession({ roleId: "X", project }, { createAdapter });
    try {
      assert.ok(captured?.readonlyGit, "readonlyGit 能力必须进入适配器能力面");
      assert.equal(typeof captured.readonlyGit?.match, "function");
      assert.equal(typeof captured.readonlyGit?.execute, "function");
      assert.deepEqual(
        captured.readonlyGit?.match(["git", "status"]),
        matchReadonlyGit(["git", "status"]),
        "match 必须是 Service 公共出口的同一 matcher",
      );
      assert.equal(captured.readonlyGit?.match(["git", "commit", "-m", "x"]), undefined, "写形态不命中");
      assert.equal(captured.roleId, "X", "会话 roleId 进入适配器能力面（审计/展示关联）");
    } finally {
      await handle.dispose();
    }
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});
