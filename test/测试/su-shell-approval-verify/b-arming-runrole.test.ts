// test/测试/su-shell-approval-verify/b-arming-runrole.test.ts
// 测试角色：su 命令审批策略——**装配与 run-role 守卫**独立验证（2026-10-17）。
//
// 覆盖 PM 评审 §3.3/§3.4/§5.1：
//   · assembleOperatorShellGate：allow 0 卡；risky 出卡；审计落 sink；缺 classifier/rules fail-closed；
//     无通道 ⇒ 装配抛错（调用方不 arm）；
//   · openRoleSession：su + shellOperatorOnly ⇒ arm；项目角色误传 ⇒ 不 arm；
//     shellOperatorOnly + shellReadonly ⇒ 不 arm；装配失败 ⇒ 不 arm；
//   · 选项面 type 级守卫：AssembleOperatorShellGateOptions **没有** pmAsk/pmRoleId/openSession/
//     sessionDeps/routineShellPolicy（源码字面核对）。
//
// 独立构造：自建临时项目 + 能力捕获适配器；全部假件，不真跑命令。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../../src/model/role.ts";
import type {
  OperatorPrompt,
  RuntimeAdapter,
  RoleSession,
  SessionEvent,
  ShellGate,
  WriteGate,
} from "../../../src/model/runtime.ts";
import { createMemoryAuditSink } from "../../../src/common/编排/shell-audit.ts";
import {
  assembleOperatorShellGate,
  type AssembleOperatorShellGateOptions,
} from "../../../src/pipeline/orchestration/shell-arming.ts";
import { openRoleSession, type AdapterCapabilities } from "../../../src/pipeline/orchestration/run-role.ts";
import { EMPTY_RULES, classifier, makeTempProject, operatorStub } from "./fixture.ts";

function makeProject(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:fixture" } },
  };
}

function capsCapturingAdapter(): {
  createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
  caps: () => AdapterCapabilities | undefined;
} {
  let captured: AdapterCapabilities | undefined;
  return {
    caps: () => captured,
    createAdapter: (_gate, capabilities) => {
      captured = capabilities;
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
    },
  };
}

test("B1 assembleOperatorShellGate：allow 0 卡；risky 出卡；审计落 sink；缺件 fail-closed", async () => {
  const fx = makeTempProject();
  try {
    const project = makeProject(fx.root);
    const audit = createMemoryAuditSink();
    const prompts: OperatorPrompt[] = [];
    const gate = await assembleOperatorShellGate({
      project,
      classifyShell: (argv) =>
        argv[0] === "ls" ? { decision: "allow", ruleId: "readonly:ls" } : { decision: "risky", ruleId: "risky:delete" },
      rules: EMPTY_RULES,
      operatorChannel: operatorStub({ outcome: "allow", operatorId: "客户" }, prompts),
      auditSink: audit,
    });

    const allow = await gate({ command: "ls", argv: ["ls"], cwd: fx.root, toolCallId: "a" });
    assert.equal(allow.allow, true);
    assert.equal(prompts.length, 0);
    const risky = await gate({ command: "rm -rf x", argv: ["rm", "-rf", "x"], cwd: fx.root, toolCallId: "b" });
    assert.equal(risky.allow, true);
    assert.equal(prompts.length, 1);
    assert.deepEqual(
      audit.records.map((r) => r.branch),
      ["c-allow", "c-risky→a-allow"],
    );

    // 缺 classifier → no-classifier；缺 rules → ruleset-load-failed；均不得调用 operator。
    const noClassifier = await assembleOperatorShellGate({
      project,
      rules: EMPTY_RULES,
      operatorChannel: operatorStub({ outcome: "allow" }, prompts),
      auditSink: createMemoryAuditSink(),
    });
    assert.equal((await noClassifier({ command: "ls", argv: ["ls"], cwd: fx.root, toolCallId: "c" })).allow, false);

    const noRules = await assembleOperatorShellGate({
      project,
      classifyShell: classifier("allow"),
      operatorChannel: operatorStub({ outcome: "allow" }, prompts),
      auditSink: createMemoryAuditSink(),
    });
    assert.equal((await noRules({ command: "ls", argv: ["ls"], cwd: fx.root, toolCallId: "d" })).allow, false);
    assert.equal(prompts.length, 1, "fail-closed 分支不得弹卡");
  } finally {
    fx.cleanup();
  }
});

test("B2 assembleOperatorShellGate：无通道 ⇒ 装配抛错（不 arm）", async () => {
  const fx = makeTempProject();
  try {
    await assert.rejects(
      assembleOperatorShellGate({
        project: makeProject(fx.root),
        classifyShell: classifier("allow"),
        rules: EMPTY_RULES,
        operatorChannel: undefined as never,
      }),
      /operatorChannel/,
    );
  } finally {
    fx.cleanup();
  }
});

test("B3 openRoleSession：su arm；项目角色误传 / 与 shellReadonly 互斥 / 装配失败 ⇒ 不 arm", async () => {
  const fx = makeTempProject();
  try {
    const project = makeProject(fx.root);
    const suArm = capsCapturingAdapter();
    const h1 = await openRoleSession(
      {
        roleId: "su",
        project,
        shellOperatorOnly: {
          classifyShell: classifier("allow"),
          rules: EMPTY_RULES,
          operatorChannel: () => ({ outcome: "deny", operatorId: "客户" }),
          auditSink: createMemoryAuditSink(),
        },
      },
      { createAdapter: suArm.createAdapter },
    );
    const suGate = suArm.caps()?.shellGate as ShellGate | undefined;
    assert.equal(typeof suGate, "function", "su 应 arm 审批档");
    assert.equal((await suGate!({ command: "ls", argv: ["ls"], cwd: fx.root, toolCallId: "s" })).allow, true);
    await h1.dispose();

    // 项目角色误传 ⇒ 不 arm。
    const projArm = capsCapturingAdapter();
    const h2 = await openRoleSession(
      {
        roleId: "X",
        project,
        shellOperatorOnly: {
          classifyShell: classifier("allow"),
          rules: EMPTY_RULES,
          operatorChannel: () => ({ outcome: "allow" }),
        },
      },
      { createAdapter: projArm.createAdapter },
    );
    assert.equal(projArm.caps()?.shellGate, undefined, "项目角色不得被客户全权审批绕过三层链");
    await h2.dispose();

    // 与 shellReadonly 同时给出 ⇒ 不 arm。
    const bothArm = capsCapturingAdapter();
    const h3 = await openRoleSession(
      {
        roleId: "su",
        project,
        shellOperatorOnly: {
          classifyShell: classifier("allow"),
          rules: EMPTY_RULES,
          operatorChannel: () => ({ outcome: "allow" }),
        },
        shellReadonly: { classifyShell: classifier("allow"), rules: EMPTY_RULES },
      },
      { createAdapter: bothArm.createAdapter },
    );
    assert.equal(bothArm.caps()?.shellGate, undefined, "互斥 ⇒ 不 arm（不择一静默生效）");
    await h3.dispose();

    // 装配失败（无通道）⇒ 不 arm，且 open 仍成功（能力缺席 = fail-closed）。
    const badArm = capsCapturingAdapter();
    const h4 = await openRoleSession(
      {
        roleId: "su",
        project,
        shellOperatorOnly: {
          classifyShell: classifier("allow"),
          rules: EMPTY_RULES,
          operatorChannel: undefined as never,
        },
      },
      { createAdapter: badArm.createAdapter },
    );
    assert.equal(badArm.caps()?.shellGate, undefined, "装配失败 ⇒ 不 arm");
    await h4.dispose();
  } finally {
    fx.cleanup();
  }
});

test("B4 选项面 type 守卫：AssembleOperatorShellGateOptions 不含 pmAsk/pmRoleId/openSession/sessionDeps/routineShellPolicy", () => {
  const src = fs.readFileSync(
    new URL("../../../src/pipeline/orchestration/shell-arming.ts", import.meta.url),
    "utf8",
  );
  const start = src.indexOf("export interface AssembleOperatorShellGateOptions");
  assert.ok(start >= 0, "找得到 AssembleOperatorShellGateOptions");
  const end = src.indexOf("\n}", start);
  const block = src.slice(start, end);
  for (const forbidden of ["pmAsk", "pmRoleId", "openSession", "sessionDeps", "routineShellPolicy"]) {
    assert.equal(block.includes(forbidden), false, `type 面不得出现 ${forbidden}（su 不自审/不可被绕过）`);
  }
  // 选项与 `AssembleOperatorShellGateOptions` 的 type 检查（编译期）；运行期再钉 operatorChannel 必填。
  const opts: AssembleOperatorShellGateOptions = {
    project: { projectRoot: "/p", skillRoot: "/p", roles: {} },
    operatorChannel: async () => ({ outcome: "deny" }),
  };
  assert.equal(typeof opts.operatorChannel, "function");
});
