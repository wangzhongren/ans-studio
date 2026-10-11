// test/编排/govern-engine.test.ts
// 编排角色自测：**唯一治理会话引擎**收敛（设计 §10.5）——CLI `ans govern` 与桌面 su 走**同一入口**。
//
// 覆盖：
//   ① `openGovernanceSession`（桌面 su 的入口）产出句柄：治理角色 id 经 `listProject` 枚举（不硬编码）、
//      gate 求值**项目治理边界**（角色卡/… 可写、项目 src/ 写前被拒）、scope 按条件目录给出；
//   ② 驱动该句柄（`send` + 事件流）能真落盘建 `角色卡/X/`——证明桌面入口与 CLI 前端**同一引擎**；
//   ③ CLI 前端 `runGovernSession` 复用同一引擎（同一边界来源/scope）并以码返回；
//   ④ **不再预建骨架**（T32，设计 §12.4）：引擎无 pre-scaffold，空项目上仍能开会话（角色由 su 写）；
//   ⑤ 目标目录经 deps/会话输入透传（设计 §12.3）。
//
// T32：夹具改为自备「项目治理边界」文档（取代已退役的 `writeGovernanceSkeleton`），直接构造 project。
// 全部用系统临时目录，用后清理——不在仓库留文件。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openGovernanceSession, runGovernSession } from "../../src/pipeline/orchestration/govern-session.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { EXIT_OK } from "../../src/common/编排/exit-codes.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  ToolCall,
  WriteGate,
} from "../../src/provider/pi/session.ts";

/** 项目治理边界文档（§2.2 形状：3 个条件目录）——T32 起测试自备（旧夹具 writeGovernanceSkeleton 已退役）。 */
const GOV_BOUNDARY_REL = "角色卡/governance-boundary.yaml";
const GOV_BOUNDARY_YAML = [
  "role: 治理边界",
  "entries:",
  "  - kind: conditional-directory",
  "    path: 角色卡/",
  "    condition: role-restructuring",
  "    root: project",
  "    purpose: 项目治理产物：角色目录",
  "  - kind: conditional-directory",
  "    path: docs/",
  "    condition: docs-bootstrap",
  "    root: project",
  "    purpose: 项目级文档脚手架",
  "  - kind: conditional-directory",
  "    path: .ans/",
  "    condition: project-init",
  "    root: project",
  "    purpose: 项目初始化产物",
  "",
].join("\n");

const ROLE_X_BOUNDARY = "role: X\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: 测试角色条目\n";

/** 新建临时根 → 写治理边界文档 → 直接构造 project；结束即清理。 */
async function withProject<T>(
  fn: (ctx: { root: string; target: string; project: ProjectConfig }) => Promise<T>
): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-engine-"));
  try {
    const target = join(root, "proj");
    mkdirSync(join(target, "角色卡"), { recursive: true });
    writeFileSync(join(target, "角色卡", "governance-boundary.yaml"), GOV_BOUNDARY_YAML);
    const project: ProjectConfig = {
      projectRoot: target,
      skillRoot: target,
      roles: {},
      governanceBoundary: {
        path: GOV_BOUNDARY_REL,
        acceptance: { accepted: true, source: "test:fixture governance boundary" },
      },
    };
    return await fn({ root, target, project });
  } finally {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

/** 桩适配器：立即 settled、dispose 无事——用于只捕获 gate。 */
function okAdapter(): RuntimeAdapter {
  return {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole(): Promise<RoleSession> {
      return {
        async prompt(): Promise<void> {},
        events(): AsyncIterable<SessionEvent> {
          return (async function* () {
            yield { kind: "settled", summary: "完成" } as SessionEvent;
          })();
        },
        async dispose(): Promise<void> {},
      };
    },
  };
}

// —— ① openGovernanceSession：句柄元信息 + gate 求值项目治理边界 ——

test("openGovernanceSession：句柄含治理角色/边界来源/scope；gate 对项目治理边界求值", async () => {
  await withProject(async ({ project }) => {
    let gate: WriteGate | undefined;
    const handle = await openGovernanceSession(
      { taskId: "T-ENG-1", project, targetRoleIds: ["X"] },
      { createAdapter: (g) => ((gate = g), okAdapter()) },
    );
    try {
      // 治理角色 id 经枚举得到（不硬编码）；本项目治理边界即夹具写出的边界文档。
      assert.equal(handle.governanceRoleId, "su");
      assert.match(handle.boundarySource, /boundary\.yaml$/);
      assert.equal(handle.acceptance.accepted, true);
      assert.ok(handle.scope, "项目治理边界（条件目录）应声明 scope");
      assert.ok(handle.scope.conditions.length >= 3, "条件目录 slug 应被声明");
      assert.deepEqual(handle.scope.writeSet, [
        "角色卡/X/role-card.md",
        "角色卡/X/boundary.yaml",
        "角色卡/X/memo.md",
      ]);

      assert.ok(gate, "引擎应构造出 gate");
      assert.equal(gate!("角色卡/X/role-card.md").allowed, true, "治理边界内 + 可写集 → 允许");
      // 可写集外（角色 Y 未指定）→ F4 收窄拒绝。
      assert.equal(gate!("角色卡/Y/role-card.md").allowed, false);
      // 越界（项目 src/）→ 写前被拒。
      assert.equal(gate!("src/evil.ts").allowed, false);
    } finally {
      await handle.dispose();
    }
  });
});

// —— ② 驱动句柄（桌面 su 的用法）真落盘 ——

test("openGovernanceSession：驱动句柄（send + 事件流）能建出 角色卡/X/ 并落盘", async () => {
  await withProject(async ({ target, project }) => {
    const script: ToolCall[] = [
      { name: "write_file", args: { path: "角色卡/X/role-card.md", content: "# 角色：X\n\n由 su 治理会话创建。\n" } },
      { name: "write_file", args: { path: "角色卡/X/boundary.yaml", content: ROLE_X_BOUNDARY } },
      { name: "write_file", args: { path: "角色卡/X/memo.md", content: "# X 备忘录\n" } },
    ];
    const handle = await openGovernanceSession(
      { taskId: "T-ENG-1", project, targetRoleIds: ["X"] },
      { createAdapter: (gate) => createFakeRuntimeAdapter({ gate, script, writeRoot: target }) },
    );
    try {
      await handle.send("建角色 X");
      for await (const _ev of handle.events()) {
        /* 消费到结束 */
      }
      assert.ok(existsSync(join(target, "角色卡", "X", "role-card.md")), "桌面入口经同一引擎应能落盘");
      assert.ok(existsSync(join(target, "角色卡", "X", "boundary.yaml")));
    } finally {
      await handle.dispose();
    }
  });
});

// —— ③ CLI 前端 runGovernSession 复用同一引擎 ——

test("runGovernSession：CLI 前端复用同一引擎（同一边界来源/scope）并以码返回", async () => {
  await withProject(async ({ target, project }) => {
    let gate: WriteGate | undefined;
    const script: ToolCall[] = [{ name: "write_file", args: { path: "角色卡/X/role-card.md", content: "# 角色：X\n" } }];
    const result = await runGovernSession(
      { taskId: "T-ENG-1", project, targetRoleIds: ["X"] },
      { createAdapter: (g) => ((gate = g), createFakeRuntimeAdapter({ gate: g, script, writeRoot: target })) },
    );
    assert.equal(result.code, EXIT_OK);
    assert.ok(gate && gate!("角色卡/X/role-card.md").allowed === true, "CLI 前端 gate 同源（同一引擎）");
    assert.ok(existsSync(join(target, "角色卡", "X", "role-card.md")), "CLI 前端应驱动同一引擎落盘");
  });
});

// —— ④ 不再预建骨架：引擎无 pre-scaffold，空项目上仍能开会话 ——

test("openGovernanceSession：不预建骨架（无 bootstrap 选项）→ 空项目上仍能开会话（创世种子边界）", async () => {
  const root = mkdtempSync(join(tmpdir(), "ans-engine-noscaffold-"));
  try {
    const target = join(root, "fresh");
    mkdirSync(target, { recursive: true }); // 空文件夹（存在但无角色/无 .ans/无治理边界）
    // 全新空项目目录：无角色、无治理边界文档、无 .ans——纯空文件夹。
    const project: ProjectConfig = {
      projectRoot: target,
      skillRoot: target,
      roles: {},
      genesisBootstrap: { source: "desktop:导入空项目=发起 bootstrap（操作者指令）" },
    };
    const handle = await openGovernanceSession(
      { taskId: "T-ENG-NOSCAFFOLD", project },
      { createAdapter: () => okAdapter() },
    );
    try {
      // 引擎不再预建任何骨架：目标目录里不应凭空出现角色/`.ans`（角色由 su 在会话里写）。
      assert.equal(handle.governanceRoleId, "su");
      assert.equal(handle.acceptance.accepted, true, "创世种子边界应 accepted（source=操作者指令）");
      assert.equal(existsSync(join(target, "角色卡")), false, "不得预建角色骨架（T32 退役骨架）");
      assert.equal(existsSync(join(target, ".ans")), false, "不得预建 .ans");
      assert.equal(existsSync(join(target, "docs")), false, "不得预建 docs");
    } finally {
      await handle.dispose();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —— ⑤ 目标目录经 deps/会话输入透传（设计 §12.3）——

test("openGovernanceSession：targetDir 原样透传到句柄（供装配据它设 projectRoot / T33 finalize）", async () => {
  await withProject(async ({ project }) => {
    const handle = await openGovernanceSession(
      { taskId: "T-ENG-DIR", project, targetRoleIds: ["X"], targetDir: "./orders-service" },
      { createAdapter: () => okAdapter() },
    );
    try {
      assert.equal(handle.targetDir, "./orders-service");
    } finally {
      await handle.dispose();
    }
  });
});
