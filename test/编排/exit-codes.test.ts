// test/编排/exit-codes.test.ts
// 命令级退出码测试：断言 `ans role run` 的**所有失败路径**都返回非 0（约定见 common/编排/exit-codes.ts）。
//
// 与 orchestration.test.ts 不同，本文件走真实链路的编排（Pipeline/Interface），故会加载
// 门禁引擎与 Pi 适配器模块；它们已落盘、加载不需安装 Pi（见 provider/pi/session.ts 的依赖隔离）。
// 角色卡与边界文件用临时夹具，隔离真实仓库内容。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { TaskScope } from "../../src/model/decision.ts";
import type { RuntimeAdapter, RoleSession, SessionEvent } from "../../src/provider/pi/session.ts";
import { runRole } from "../../src/pipeline/orchestration/run-role.ts";
import { runRoleCommand } from "../../src/interface/cli/run.ts";
import { EXIT_OK, EXIT_USAGE, EXIT_FAILURE } from "../../src/common/编排/exit-codes.ts";

// —— 夹具：临时项目（角色卡 + 可选边界文件）——
function makeTempProject(opts: { writeBoundary: boolean }): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-bianpai-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  if (opts.writeBoundary) {
    fs.writeFileSync(
      path.join(dir, "boundary.yaml"),
      "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: 测试条目\n"
    );
  }
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
function cleanup(project: ProjectConfig): void {
  fs.rmSync(project.projectRoot, { recursive: true, force: true });
}
const scopeX = (): TaskScope => ({ writeSet: ["src/a.ts"], conditions: [] });

// —— 假适配器 ——
const okAdapter = (): RuntimeAdapter => ({
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
});
const throwingAdapter = (): RuntimeAdapter => ({
  async composeContext() {
    return { systemPrompt: "" };
  },
  async bindRole(): Promise<RoleSession> {
    throw new Error("bindRole 故意失败");
  },
});

test("退出码约定：0 = 成功；EXIT_USAGE / EXIT_FAILURE 均为非 0", () => {
  assert.equal(EXIT_OK, 0);
  assert.notEqual(EXIT_USAGE, 0);
  assert.notEqual(EXIT_FAILURE, 0);
});

// —— Interface：用法/参数/配置层失败（不触盘）——

test("runRoleCommand 用法错误（空 argv：缺角色、缺 --task）→ 非 0", async () => {
  const code = await runRoleCommand([], { createAdapter: okAdapter });
  assert.equal(code, EXIT_USAGE);
});

test("runRoleCommand 未知参数 → 非 0", async () => {
  const code = await runRoleCommand(["编排", "--task", "T-1", "--bogus"], { createAdapter: okAdapter });
  assert.equal(code, EXIT_USAGE);
});

test("runRoleCommand 缺少注入 project → 非 0", async () => {
  const code = await runRoleCommand(["X", "--task", "T-1"], { createAdapter: okAdapter } as never);
  assert.equal(code, EXIT_USAGE);
});

test("runRoleCommand 缺少注入 scope → 非 0", async () => {
  const project = makeTempProject({ writeBoundary: true });
  try {
    const code = await runRoleCommand(["X", "--task", "T-1"], { createAdapter: okAdapter, project } as never);
    assert.equal(code, EXIT_USAGE);
  } finally {
    cleanup(project);
  }
});

test("runRoleCommand 未知角色 → 非 0", async () => {
  const project = makeTempProject({ writeBoundary: true });
  try {
    const code = await runRoleCommand(["不存在的角色", "--task", "T-1"], {
      createAdapter: okAdapter,
      project,
      scope: scopeX(),
    } as never);
    assert.equal(code, EXIT_USAGE);
  } finally {
    cleanup(project);
  }
});

// —— Pipeline：编排层失败 ——

test("runRole 未知角色（未登记 project.roles）→ 非 0", async () => {
  const project = makeTempProject({ writeBoundary: true });
  try {
    const r = await runRole(
      { roleId: "不存在的角色", taskId: "T-1", project, scope: scopeX() },
      { createAdapter: okAdapter }
    );
    assert.equal(r.code, EXIT_USAGE);
  } finally {
    cleanup(project);
  }
});

test("runRole 边界解析失败（boundary 文件缺失→parseError）→ 非 0", async () => {
  const project = makeTempProject({ writeBoundary: false }); // 不写 boundary.yaml
  try {
    const r = await runRole({ roleId: "X", taskId: "T-1", project, scope: scopeX() }, { createAdapter: okAdapter });
    assert.equal(r.code, EXIT_FAILURE);
  } finally {
    cleanup(project);
  }
});

test("runRole bindRole 失败 → 非 0", async () => {
  const project = makeTempProject({ writeBoundary: true });
  try {
    const r = await runRole({ roleId: "X", taskId: "T-1", project, scope: scopeX() }, { createAdapter: throwingAdapter });
    assert.equal(r.code, EXIT_FAILURE);
  } finally {
    cleanup(project);
  }
});

test("runRole 正常会话 → 0（对照基线）", async () => {
  const project = makeTempProject({ writeBoundary: true });
  try {
    const r = await runRole({ roleId: "X", taskId: "T-1", project, scope: scopeX() }, { createAdapter: okAdapter });
    assert.equal(r.code, EXIT_OK);
  } finally {
    cleanup(project);
  }
});
