// test/编排/session-handle.test.ts
// 会话句柄式接口（openRoleSession）测试：
//   - 多轮：同一会话 send 两次都生效，且底层会话**只建一次**（bindRole 调用 1 次）；
//   - 收口：结束时 dispose 被调用，且 dispose 幂等；
//   - scope 可选：无 scope = 只用角色边界（不做任务收窄），有 scope 才做 F4 收窄——原样透传 resolveWrite；
//   - 失败即抛错（未知角色）。
// 全程用桩适配器，不触网。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { TaskScope } from "../../src/model/decision.ts";
import type { RuntimeAdapter, RoleSession, SessionEvent, WriteGate } from "../../src/provider/pi/session.ts";
import { openRoleSession, runRole } from "../../src/pipeline/orchestration/run-role.ts";
import { EXIT_USAGE } from "../../src/common/编排/exit-codes.ts";

// —— 夹具：临时项目（角色 X + 边界条目 src/thing.ts）——
function makeTempProject(entryPath = "src/thing.ts"): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-handle-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    `role: X\nentries:\n  - kind: file\n    path: ${entryPath}\n    purpose: 测试条目\n`
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: {
      path: "角色卡/X/boundary.yaml",
      acceptance: { accepted: true, source: "test:fixture" },
    },
  };
}

// —— 桩：记录 bindRole/send/dispose 次数，并捕获 gate ——
interface ProbeState {
  binds: number;
  sends: number;
  disposes: number;
  gate?: WriteGate;
}
function makeDeps(): { deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter }; state: ProbeState } {
  const state: ProbeState = { binds: 0, sends: 0, disposes: 0 };
  const session: RoleSession = {
    async prompt(): Promise<void> {
      state.sends += 1;
    },
    events(): AsyncIterable<SessionEvent> {
      return (async function* () {
        /* 桩不产出事件 */
      })();
    },
    async dispose(): Promise<void> {
      state.disposes += 1;
    },
  };
  const adapter: RuntimeAdapter = {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole(): Promise<RoleSession> {
      state.binds += 1;
      return session; // 底层同一会话对象
    },
  };
  const createAdapter = (gate: WriteGate): RuntimeAdapter => {
    state.gate = gate;
    return adapter;
  };
  return { deps: { createAdapter }, state };
}

const scopeX = (): TaskScope => ({ writeSet: ["src/thing.ts"], conditions: [] });
const cleanup = (p: ProjectConfig): void => fs.rmSync(p.projectRoot, { recursive: true, force: true });

test("openRoleSession：send 两次都生效，底层会话只建一次，dispose 收口且幂等", async () => {
  const project = makeTempProject();
  const { deps, state } = makeDeps();
  try {
    const handle = await openRoleSession({ roleId: "X", project, taskId: "T-1", scope: scopeX() }, deps);
    await handle.send("第一轮");
    await handle.send("第二轮");
    assert.equal(state.sends, 2); // 两轮都送到同一会话
    assert.equal(state.binds, 1); // 会话只创建一次，不按轮重建

    await handle.dispose();
    assert.equal(state.disposes, 1);
    await handle.dispose(); // 幂等
    assert.equal(state.disposes, 1);
  } finally {
    cleanup(project);
  }
});

test("openRoleSession：未知角色 → 抛错（句柄式接口无退出码）", async () => {
  const project = makeTempProject();
  const { deps } = makeDeps();
  try {
    await assert.rejects(
      openRoleSession({ roleId: "不存在的角色", project, scope: scopeX() }, deps),
      /未知角色/
    );
  } finally {
    cleanup(project);
  }
});

test("openRoleSession：scope 可选——无 scope 仅按角色边界（允许），有 scope 才做 F4 收窄", async () => {
  const project = makeTempProject("src/thing.ts");
  try {
    // 无 scope：src/thing.ts 命中边界条目 → 允许（不做任务收窄）。
    const a = makeDeps();
    await openRoleSession({ roleId: "X", project }, a.deps);
    const noScope = a.state.gate!("src/thing.ts");
    assert.equal(noScope.allowed, true);

    // 有 scope 且不在 writeSet：同一边界内路径 → F4 收窄拒绝。
    const b = makeDeps();
    await openRoleSession(
      { roleId: "X", project, scope: { writeSet: ["src/other.ts"], conditions: [] } },
      b.deps
    );
    const withScope = b.state.gate!("src/thing.ts");
    assert.equal(withScope.allowed, false);
    assert.match((withScope as { reason: string }).reason, /不在任务 writeSet 内/);
  } finally {
    cleanup(project);
  }
});

// —— 内置治理角色（project.builtInRoles）入口意图约束 ——
// 会话式入口（openRoleSession）允许开启配置声明的内置治理角色；一次性 CLI（runRole）绝不放宽。

test("openRoleSession：project.builtInRoles 声明 su → 内置角色可开（不抛错，建会话一次）", async () => {
  const project = makeTempProject();
  project.builtInRoles = ["su"];
  const { deps, state } = makeDeps();
  try {
    await openRoleSession({ roleId: "su", project }, deps);
    assert.equal(state.binds, 1);
  } finally {
    cleanup(project);
  }
});

test("openRoleSession：未声明 builtInRoles → 同 roleId 被拒（未知角色）", async () => {
  const project = makeTempProject(); // 不设 builtInRoles
  const { deps } = makeDeps();
  try {
    await assert.rejects(openRoleSession({ roleId: "su", project }, deps), /未知角色/);
  } finally {
    cleanup(project);
  }
});

test("runRole：即便配置声明了 builtInRoles，CLI 一次性路径仍拒绝内置角色（EXIT_USAGE）", async () => {
  const project = makeTempProject();
  project.builtInRoles = ["su"];
  const { deps } = makeDeps();
  try {
    const res = await runRole({ roleId: "su", taskId: "T-1", project }, deps);
    assert.notEqual(res.code, 0);
    assert.equal(res.code, EXIT_USAGE);
  } finally {
    cleanup(project);
  }
});
