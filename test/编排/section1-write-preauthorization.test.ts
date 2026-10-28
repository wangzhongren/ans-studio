// test/编排/section1-write-preauthorization.test.ts
// 2026-10-25 客户规则（原文「写自己角色权限内的路径，直接放行。」）——编排层 WriteGate 语义：
//
//   角色会话在**没有任务级 writeSet 收窄**时，初始可写集覆盖该角色 Section 1 白名单：
//     · 内置治理五角色（trio）：无任务 scope 时按注册表 Section 1 预授权（含精确文件条目，如
//       Convener 的 `docs/workflow.md`，它不在旧 `preauthorizedDirs` 目录清单内）；
//       有任务 scope 时保留既有 `preauthorizedDirs` 子集（不并入 Section 1）；
//     · 项目角色：`scope === undefined`（桌面聊天形态）时按自己的边界条目预授权；
//     · 旧 su（single）：卡未声明该规则——保留 2026-10-16 四棵预授权目录与 A-3 确认制（另有测试钉死）。
//
//   边界与既有规则**全部不变**：有任务 writeSet 时仍按 F4 收窄（不因 Section 1 扩张）；边界外、他人
//   写集、禁写路径（forbiddenWritePaths）与三权治理门禁（角色卡 appointment-write、`docs/flows/**`
//   schedule-write）照旧先行拒绝/要求客户决定卡——预授权只免去「边界内逐次写盘确认」。
//
// 全程假适配器 + 临时目录；不触网、不发真实模型请求。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  CustomerInputFn,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
} from "../../src/provider/pi/session.ts";
import type { AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";

interface Captured {
  gate?: WriteGate;
  caps?: AdapterCapabilities;
}

/** 桩适配器：捕获 gate/能力面后立即 settled（不驱动任何工具）。 */
function capturingFactory(captured: Captured) {
  return (gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
    captured.gate = gate;
    captured.caps = caps;
    const session: RoleSession = {
      async prompt(): Promise<void> {},
      events(): AsyncIterable<SessionEvent> {
        return (async function* () {
          yield { kind: "settled" as const, summary: "完成" };
        })();
      },
      async dispose(): Promise<void> {},
    };
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return session;
      },
    };
  };
}

/** 恒拒客户通道（本组用例中**不应被调用**——预授权不经确认发行）；同时计数。 */
function decliningChannel(calls: { n: number }): CustomerInputFn {
  return () => {
    calls.n += 1;
    return { outcome: "declined" };
  };
}

async function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-section1-preauth-"));
  try {
    return await fn(root);
  } finally {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

function writeFile(root: string, rel: string, text: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, "utf8");
}

/** 项目角色夹具：按 roleId → 边界条目 YAML 写入角色卡与边界，并给出项目配置。 */
function projectWithRoles(
  root: string,
  roles: Record<string, { entries: string; cardText?: string }>,
): ProjectConfig {
  const mapping: ProjectConfig["roles"] = {};
  for (const [roleId, spec] of Object.entries(roles)) {
    writeFile(root, `角色卡/${roleId}/role-card.md`, spec.cardText ?? `# 角色 ${roleId}\n`);
    writeFile(root, `角色卡/${roleId}/boundary.yaml`, `role: ${roleId}\nentries:\n${spec.entries}`);
    mapping[roleId] = {
      card: `角色卡/${roleId}/role-card.md`,
      boundary: `角色卡/${roleId}/boundary.yaml`,
    };
  }
  return {
    projectRoot: root,
    skillRoot: root,
    roles: mapping,
    governanceBoundary: {
      path: "角色卡/X/boundary.yaml",
      acceptance: { accepted: true, source: "test:section1-preauth" },
    },
  };
}

/** trio 项目：`.ans` 显式 trio；注册表提供 Section 1，项目只提供接受证据。 */
function trioProject(root: string, roleId: string): ProjectConfig {
  writeFile(root, ".ans/project.json", JSON.stringify({ governanceModel: "trio" }));
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: [roleId],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:trio" },
    },
  };
}

// —————————————— ① 项目角色：无任务收窄 ⇒ Section 1 直接放行 ——————————————

test("项目角色（无任务收窄）：Section 1 精确文件/目录子树直接放行，边界外与非条目仍拒（零确认）", async () => {
  await withRoot(async (root) => {
    const project = projectWithRoles(root, {
      X: {
        entries:
          "  - kind: file\n    path: src/a.ts\n    purpose: 精确文件条目\n" +
          "  - kind: directory\n    path: docs/\n    purpose: 目录条目\n",
      },
    });
    const captured: Captured = {};
    const calls = { n: 0 };
    const handle = await openRoleSession(
      { roleId: "X", project, customerInput: decliningChannel(calls) },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.ok(captured.gate, "应构建出 gate");
      assert.equal(calls.n, 0, "Section 1 写入不发起任何客户确认（预授权）");
      assert.equal(captured.gate!("src/a.ts").allowed, true, "精确文件条目直接放行");
      assert.equal(
        captured.gate!(path.join(root, "src", "a.ts")).allowed,
        true,
        "绝对路径同口径（项目根内）",
      );
      assert.equal(captured.gate!("docs/notes.md").allowed, true, "目录条目直接放行");
      assert.equal(captured.gate!("docs/sub/deep.md").allowed, true, "目录条目含子路径");
      assert.equal(captured.gate!("src/b.ts").allowed, false, "边界外（未匹配条目）照拒");
      assert.equal(captured.gate!("test/x.ts").allowed, false, "边界外照拒");
      assert.equal(captured.gate!(".ans/project.json").allowed, false, "边界外治理记录照拒");
    } finally {
      await handle.dispose();
    }
  });
});

// —————————————— ② 任务 writeSet 收窄：不因 Section 1 预授权扩张 ——————————————

test("任务 writeSet 收窄：writeSet 内放行；边界内但不在 writeSet 的路径仍被 F4 拒（两种会话形态）", async () => {
  await withRoot(async (root) => {
    const project = projectWithRoles(root, {
      X: {
        entries:
          "  - kind: file\n    path: src/a.ts\n    purpose: 精确文件条目\n" +
          "  - kind: directory\n    path: docs/\n    purpose: 目录条目\n",
      },
    });
    const scope = { writeSet: ["src/a.ts"], conditions: [] };

    // (a) 确认制 + 任务 scope：任务 writeSet 就是收窄本身；Section 1 其余路径不扩张。
    const captured: Captured = {};
    const calls = { n: 0 };
    const handle = await openRoleSession(
      { roleId: "X", project, scope, customerInput: decliningChannel(calls) },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.equal(captured.gate!("src/a.ts").allowed, true, "任务 writeSet 内路径放行");
      const narrowed = captured.gate!("docs/notes.md");
      assert.equal(narrowed.allowed, false, "Section 1 预授权不得扩张任务 writeSet");
      assert.match(
        (narrowed as { reason: string }).reason,
        /不在任务 writeSet 内（F4）/,
        "仍走原有 F4 收窄拒绝",
      );
      assert.equal(captured.gate!("src/b.ts").allowed, false, "边界外照拒");
    } finally {
      await handle.dispose();
    }

    // (b) 静态 scope（无客户通道）：同一收窄语义。
    const staticCaptured: Captured = {};
    const staticHandle = await openRoleSession(
      { roleId: "X", project, scope },
      { createAdapter: capturingFactory(staticCaptured) },
    );
    try {
      assert.equal(staticCaptured.gate!("src/a.ts").allowed, true, "静态 scope 内路径放行");
      const narrowed = staticCaptured.gate!("docs/notes.md");
      assert.equal(narrowed.allowed, false, "静态 scope 外、边界内 → F4 收窄");
      assert.match((narrowed as { reason: string }).reason, /不在任务 writeSet 内（F4）/);
    } finally {
      await staticHandle.dispose();
    }
  });
});

// —————————————— ③ 运营：Section 1 docs/scheduling/ 预授权生效 ——————————————

test("运营（Convener）无任务收窄：docs/scheduling/ 直接放行；他人写集/禁写路径/旧 workflow 仍拒", async () => {
  await withRoot(async (root) => {
    const project = trioProject(root, "convener");
    const captured: Captured = {};
    const calls = { n: 0 };
    const handle = await openRoleSession(
      { roleId: "convener", project, customerInput: decliningChannel(calls), autoRepin: false },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.ok(captured.gate);
      assert.equal(calls.n, 0, "预授权写入不发起客户确认");
      assert.equal(captured.gate!("docs/scheduling/plan.md").allowed, true, "docs/scheduling/ 是 Section 1 预授权");
      assert.equal(captured.gate!("docs/governance/convener/notes.md").allowed, true, "治理工作记录目录同口径");
      assert.equal(captured.gate!("docs/workflow.md").allowed, false, "D 批旧精确文件 docs/workflow.md 不再在 Section 1");
      const ans = captured.gate!(".ans/project.json");
      assert.equal(ans.allowed, false);
      assert.match((ans as { reason: string }).reason, /只能由应用写/);
      assert.equal(captured.gate!("docs/proposals/flow-a-v1.md").allowed, false, "他人写集（策划）照拒");
    } finally {
      await handle.dispose();
    }
  });
});

test("有任务 writeSet 时 trio 不并入 Section 1：Nominator 角色卡条目仍被 F4 收窄拒", async () => {
  await withRoot(async (root) => {
    const project = trioProject(root, "nominator");
    const captured: Captured = {};
    const handle = await openRoleSession(
      {
        roleId: "nominator",
        project,
        scope: { writeSet: ["docs/skills/example.md"], conditions: [] },
        autoRepin: false,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.equal(captured.gate!("docs/skills/example.md").allowed, true, "任务 writeSet 内路径放行");
      const roleCard = captured.gate!("角色卡/A/role-card.md");
      assert.equal(roleCard.allowed, false, "有任务 writeSet 时不并入 Section 1（不扩大）");
      assert.match((roleCard as { reason: string }).reason, /不在任务 writeSet 内（F4）/);
      assert.equal(captured.gate!("docs/scheduling/plan.md").allowed, false, "他人写区照拒");
    } finally {
      await handle.dispose();
    }
  });
});

// —————————————— ④ 人事：D 最小系统 Section 1 预授权 / 禁写路径 ——————————————

test("人事（Nominator）：无任务收窄时 Section 1 条目直接放行；他人写区/应用目录仍拒", async () => {
  await withRoot(async (root) => {
    const project = trioProject(root, "nominator");
    const captured: Captured = {};
    const calls = { n: 0 };
    const handle = await openRoleSession(
      { roleId: "nominator", project, customerInput: decliningChannel(calls), autoRepin: false },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.equal(calls.n, 0, "预授权写入不发起客户确认");
      assert.equal(captured.gate!("角色卡/A/role-card.md").allowed, true, "D 最小系统：角色卡在 Section 1 内直接写（appointment-write 卡由应用呈现）");
      assert.equal(captured.gate!("docs/skills/example.md").allowed, true, "技能文档直接写");
      assert.equal(captured.gate!("docs/proposals/flow-a-v1.md").allowed, false, "他人写区照拒");
      assert.equal(captured.gate!(".ans/project.json").allowed, false, "应用目录照拒");
    } finally {
      await handle.dispose();
    }
  });
});
