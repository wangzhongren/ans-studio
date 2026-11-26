import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendTaskEvent, taskEvent } from "../../src/common/编排/task-state.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import { inspectShellApproval } from "../../src/common/shared/shell-approval-binding.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { OperatorOutcome, OperatorPrompt, ShellReviewResult, WriteGate } from "../../src/model/runtime.ts";
import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { classifyShell, defaultShellRules } from "../../src/service/gate/shell-rules.ts";

test("前台命令经实际应用审批，持久任务继续隔离后台启动和越界写入", async t => {
  const projectRoot = await mkdtemp(join(tmpdir(), "ans-workflow-commands-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const roleRoot = join(projectRoot, "角色卡", "implementer");
  await mkdir(roleRoot, { recursive: true });
  await Promise.all([
    writeFile(join(roleRoot, "role-card.md"), "# 实现角色\n"),
    writeFile(join(roleRoot, "boundary.yaml"), [
      "role: implementer", "entries:", "  - root: project", "    kind: file",
      "    path: output.txt", "    purpose: 实现产物",
    ].join("\n")),
    writeFile(join(projectRoot, "check.cjs"), "console.log('command-receipt');\n"),
  ]);
  const project: ProjectConfig = {
    projectRoot, skillRoot: projectRoot, governanceModel: "trio",
    roles: { implementer: { card: "角色卡/implementer/role-card.md", boundary: "角色卡/implementer/boundary.yaml" } },
    builtInRoles: ["verifier"],
    governanceBoundary: { path: "", acceptance: { accepted: true, source: "fixture" } },
  };
  const command = "node check.cjs";
  for (const [roleId, stage, sideEffect, mode] of [
    ["implementer", "A11", "code", "rules-advisory"],
    ["verifier", "A12b", "docs", "operator-approve"],
  ] as const) await t.test(roleId, async sub => {
    const taskId = `current-${stage}`;
    assert.equal((await appendTaskEvent(projectRoot, taskEvent("task.created", {
      taskId, from: "convener", to: roleId, text: "执行当前检查", sideEffect, stage,
      idempotencyKey: taskId, workflowId: "current-workflow", flowId: "command-example",
    }))).ok, true);

    const prompts: OperatorPrompt[] = [];
    let choice: "allow" | "deny" = "deny";
    let onPrompt: (() => Promise<OperatorOutcome>) | undefined;
    const operatorChannel = (prompt: OperatorPrompt) => {
      prompts.push(prompt);
      return onPrompt?.() ?? { outcome: choice, operatorId: "fixture-operator" };
    };
    const audit = createMemoryAuditSink();
    const shellArming = { classifyShell, rules: defaultShellRules(), auditSink: audit };
    let gate: WriteGate | undefined;
    let capabilities: AdapterCapabilities | undefined;
    const handle = await openRoleSession({
      project, roleId, taskId, workflowMode: "fixed", durableFixedWorkflow: true, runtime: "claude",
      claimFileWrite: async () => { throw new Error("前台命令不经过文件认领端口"); },
      ...(roleId === "verifier" ? { shellOperatorOnly: { ...shellArming, operatorChannel } }
        : { shellArming, shellOperatorChannel: operatorChannel }),
    }, { createAdapter: (writeGate, supplied) => {
      gate = writeGate;
      capabilities = supplied;
      return {
        async composeContext() { return { systemPrompt: "" }; },
        async bindRole() { return { async prompt() {}, async *events() {}, async dispose() {} }; },
      };
    } });
    sub.after(() => handle.dispose());

    assert.ok(capabilities && gate);
    const shellGate = capabilities.shellGate;
    assert.ok(shellGate);
    assert.equal(inspectShellApproval(shellGate)?.mode, mode, "运行时接收的门禁必须保留应用登记身份");
    const shell = buildGovernedTools(gate, { roleId, projectRoot, shellGate, shellCwd: projectRoot,
      shellPostAudit: capabilities.shellPostAudit }).find(tool => tool.name === "run_shell");
    assert.ok(shell);

    const denied = await shell.handler({ name: shell.name, args: { command }, toolCallId: "deny" });
    assert.equal(denied.ok, false);
    assert.equal(denied.execution, undefined, "拒绝审批后没有实际执行回执");
    assert.equal(prompts.length, 1);

    choice = "allow";
    const approved = await shell.handler({ name: shell.name, args: { command }, toolCallId: "allow" });
    assert.equal(approved.ok, true, approved.message);
    assert.equal(approved.execution?.exitCode, 0);
    assert.equal(approved.execution?.stdout?.trim(), "command-receipt");
    assert.deepEqual(prompts.map(({ argv, cwd, roleId: actor, entry }) => ({ argv, cwd, actor, entry })), [
      { argv: ["node", "check.cjs"], cwd: projectRoot, actor: roleId, entry: "run_shell" },
      { argv: ["node", "check.cjs"], cwd: projectRoot, actor: roleId, entry: "run_shell" },
    ]);

    for (const [argv, entry] of [
      [["node", "--version"], "start_background_task"],
      [["touch", "outside.txt"], "run_shell"],
      [["git", "commit", "-m", "unauthorized"], "run_shell"],
    ] as const) {
      const result: ShellReviewResult = await shellGate({ command: argv.join(" "), argv: [...argv], cwd: projectRoot,
        roleId, toolCallId: "restricted-" + argv[0], entry });
      assert.equal(result.allow, false, `应用应当拒绝 ${argv.join(" ")}`);
      assert.equal(result.by, "write-guard");
    }
    assert.equal(prompts.length, 2, "应用写域和后台限制在发卡前生效");
    assert.equal(audit.records.filter(record => record.conclusion === "allow").length, 1);

    let showApproval!: () => void;
    const shown = new Promise<void>(resolve => { showApproval = resolve; });
    let finishApproval!: (answer: OperatorOutcome) => void;
    const answer = new Promise<OperatorOutcome>(resolve => { finishApproval = resolve; });
    onPrompt = () => { showApproval(); return answer; };
    const abort = new AbortController();
    const pending = shell.handler({ name: shell.name, args: { command }, toolCallId: "cancel", signal: abort.signal });
    await shown;
    abort.abort();
    finishApproval({ outcome: "allow", operatorId: "fixture-operator" });
    const cancelled = await pending;
    assert.equal(cancelled.ok, false);
    assert.equal(cancelled.execution, undefined, "审批期间已取消，后到的同意不能启动命令");
  });

  await t.test("缺少应用审批能力时不注册前台执行入口", async sub => {
    let gate: WriteGate | undefined;
    let capabilities: AdapterCapabilities | undefined;
    const handle = await openRoleSession({
      project, roleId: "verifier", workflowMode: "fixed", durableFixedWorkflow: true, runtime: "claude",
      claimFileWrite: async () => { throw new Error("不经过文件认领端口"); },
    }, { createAdapter: (writeGate, supplied) => {
      gate = writeGate;
      capabilities = supplied;
      return {
        async composeContext() { return { systemPrompt: "" }; },
        async bindRole() { return { async prompt() {}, async *events() {}, async dispose() {} }; },
      };
    } });
    sub.after(() => handle.dispose());
    assert.ok(capabilities && gate);
    assert.equal(capabilities.shellGate, undefined);
    assert.ok(!buildGovernedTools(gate, { shellGate: capabilities.shellGate }).some(tool => tool.name === "run_shell"));
  });
});
