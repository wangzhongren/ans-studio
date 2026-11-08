// test/编排/shell-write-guard-injection.test.ts
// 编排角色自测（2026-11-08 W1b/W2b，设计 P1.3 §2.4.2/§2.4.4、AC-14/AC-30、R5）：
// **接 (a) 的装配路径必须注入 writeGuard**（项目三层链 / 内置角色审批档）——裸 Git 写的硬地板由
// writeGuard 程序名 deny 保证，不得把 classifier deny 当硬地板（advisory/operatorOnly 会把 deny 交 (a)）；
// 只读档不接 (a)、`c=deny` 即终结（不要求 writeGuard 注入）。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

import { assembleOperatorShellGate, assembleProjectShellGate } from "../../src/pipeline/orchestration/shell-arming.ts";
import { evaluateShellWriteTargets } from "../../src/common/门禁引擎/shell-write-guard.ts";
import { classifyShell, defaultShellRules } from "../../src/service/gate/shell-rules.ts";
import { BRANCH_WRITE_GUARD_DENY } from "../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { BoundarySection1 } from "../../src/model/boundary.ts";
import type { RuntimeAdapter, WriteGate } from "../../src/provider/pi/session.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";

/** 临时项目（角色 X + 边界文件 + 内置 su）——装配路径所需。 */
function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-writeguard-"));
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

const EMPTY_BOUNDARY: BoundarySection1 = {
  entries: [],
  boundarySource: "<test:no-boundary>",
  acceptance: { accepted: true, source: "test:fixture" },
};

const req = (command: string, argv: string[], extra: Record<string, unknown> = {}) => ({
  command,
  argv,
  cwd: "/proj",
  toolCallId: "call-1",
  ...extra,
});

function realWriteGuard(project: ProjectConfig) {
  return (r: { argv: readonly string[]; cwd: string; entry?: "run_shell" | "start_background_task" }) =>
    evaluateShellWriteTargets({
      argv: r.argv,
      cwd: r.cwd,
      entry: r.entry ?? "run_shell",
      projectRoot: project.projectRoot,
      skillRoot: project.skillRoot,
      boundary: EMPTY_BOUNDARY,
      checkWrite: () => ({ allowed: true }),
      forbiddenPrefixes: [],
    });
}

test("源码断言（AC-30/R5）：接 (a) 的项目链与审批档装配都携带 writeGuard；只读档不接 (a)、不要求注入", () => {
  const source = readFileSync(new URL("../../src/pipeline/orchestration/run-role.ts", import.meta.url), "utf8");

  const operatorStart = source.indexOf("assembleOperatorShellGate({");
  assert.ok(operatorStart > 0);
  const operatorBlock = source.slice(operatorStart, operatorStart + 800);
  assert.match(operatorBlock, /writeGuard: shellWriteGuard/, "审批档必须注入 writeGuard");

  const projectStart = source.indexOf("assembleProjectShellGate({");
  assert.ok(projectStart > 0);
  const projectBlock = source.slice(projectStart, projectStart + 1600);
  assert.match(projectBlock, /writeGuard: shellWriteGuard/, "项目三层链必须注入 writeGuard");

  const readonlyStart = source.indexOf("assembleReadonlyShellGate({");
  assert.ok(readonlyStart > 0);
  const readonlyBlock = source.slice(readonlyStart, readonlyStart + 800);
  assert.doesNotMatch(readonlyBlock, /writeGuard: shellWriteGuard/, "只读档不接 (a)（c=deny 即终结，不依赖 writeGuard）");
});

test("审批档（operatorOnly+approveDeny）下裸 Git 写被 writeGuard 硬拒，不因 (a) 被批准；只读 Git 前台放行、后台拒绝", async () => {
  const project = makeTempProject();
  try {
    let operatorCalls = 0;
    const audit = createMemoryAuditSink();
    const gate = await assembleOperatorShellGate({
      project,
      operatorChannel: () => {
        operatorCalls += 1;
        return { outcome: "allow", operatorId: "test-客户" };
      },
      classifyShell,
      rules: defaultShellRules(),
      writeGuard: realWriteGuard(project),
      auditSink: audit,
    });

    // advisory/operatorOnly 会把 classifier 的 deny 交 (a)；硬地板必须由 writeGuard 先行 deny。
    const commit = await gate(req("git commit -m x", ["git", "commit", "-m", "x"]));
    assert.equal(commit.allow, false, "裸 Git 写不得被审批放行");
    assert.equal(audit.records.at(-1)?.branch, BRANCH_WRITE_GUARD_DENY);
    assert.equal(operatorCalls, 0, "writeGuard deny 先于 (a)，不打扰审批通道");

    // 只读 Git（run_shell）⇒ writeGuard pass + (c) allow ⇒ 0 卡放行。
    const status = await gate(req("git status", ["git", "status"]));
    assert.equal(status.allow, true);

    // 后台入口不享受只读 Git 放行（AC-22）：writeGuard 以真实 entry 拒绝。
    const background = await gate(req("git status", ["git", "status"], { entry: "start_background_task" }));
    assert.equal(background.allow, false);
    assert.equal(audit.records.at(-1)?.branch, BRANCH_WRITE_GUARD_DENY);
    assert.equal(operatorCalls, 0);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("项目三层链（advisory 缺省）下裸 Git 写同样被 writeGuard 硬拒；只读 Git c-allow 0 卡", async () => {
  const project = makeTempProject();
  try {
    let operatorCalls = 0;
    const audit = createMemoryAuditSink();
    const gate = await assembleProjectShellGate({
      project,
      operatorChannel: () => {
        operatorCalls += 1;
        return { outcome: "allow", operatorId: "test-客户" };
      },
      classifyShell,
      rules: defaultShellRules(),
      writeGuard: realWriteGuard(project),
      auditSink: audit,
      // advisory 缺省 true：classifier deny 会交 (a)——硬地板只能由 writeGuard 保证。
      sessionDeps: {
        createAdapter: (g: WriteGate): RuntimeAdapter => createFakeRuntimeAdapter({ gate: g, script: [] }),
      },
      openSession: async (): Promise<RoleSessionHandle> => {
        throw new Error("本用例不需要 (b) 审读");
      },
    });

    const push = await gate(req("git push", ["git", "push"]));
    assert.equal(push.allow, false);
    assert.equal(audit.records.at(-1)?.branch, BRANCH_WRITE_GUARD_DENY);
    assert.equal(operatorCalls, 0, "writeGuard deny 不进入 (a)");

    const status = await gate(req("git status", ["git", "status"]));
    assert.equal(status.allow, true, "只读 Git 走 c-allow，0 卡");
    assert.equal(operatorCalls, 0);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});
