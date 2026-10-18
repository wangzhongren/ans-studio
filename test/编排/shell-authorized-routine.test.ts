import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createShellGate, BRANCH_B_DELEGATED_ROUTINE, type PmAskFn } from "../../src/common/编排/shell-gate.ts";
import { matchesDelegatedRoutineCheck } from "../../src/common/编排/routine-shell-policy.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import { classifyShell, defaultShellRules } from "../../src/service/gate/shell-rules.ts";
import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import type { RoutineShellPolicy } from "../../src/pipeline/orchestration/shell-arming.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RuntimeAdapter } from "../../src/provider/pi/session.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";

const policy: RoutineShellPolicy = { enabled: true, projectRoot: "/project", authorizationSource: "customer-delegated-routine-checks" };
const req = (argv: string[], cwd = "/project") => ({ command: argv.join(" "), argv, cwd, toolCallId: "routine-call" });
function chain(pmAsk: PmAskFn = () => '{"verdict":"allow"}', options: { policy?: RoutineShellPolicy; readonlyOnly?: boolean } = { policy }) {
  const audit = createMemoryAuditSink();
  let operatorCalls = 0;
  const gate = createShellGate({
    classifyShell, rules: defaultShellRules(), audit,
    pmAsk, operatorChannel: () => { operatorCalls += 1; return { outcome: "deny", reason: "manual required" }; },
    routineShellPolicy: options.policy, readonlyOnly: options.readonlyOnly, timeoutMs: 100, pmTimeoutMs: 5,
  });
  return { gate, audit, operatorCalls: () => operatorCalls };
}

for (const argv of [["npm", "test"], ["npm", "run", "typecheck"], ["node", "--test"], ["node", "--test", "test/编排/handback.test.ts"], ["node", "--test", "test/**/*.test.ts"]]) {
  test(`宿主委托+b允许：${argv.join(" ")} 放行且不重复询问a`, async () => {
    const c = chain();
    const result = await c.gate(req(argv));
    assert.equal(result.allow, true);
    assert.equal(c.operatorCalls(), 0);
    const risky = classifyShell(argv, defaultShellRules()) === "risky";
    assert.equal(c.audit.records[0].branch, risky ? BRANCH_B_DELEGATED_ROUTINE : "b-allow");
    if (risky) assert.match(result.by, /customer-delegated-routine-checks/);
  });
}

test("没有宿主委托或cwd项目不一致时，pm允许仍保留a", async () => {
  const none = chain(undefined, {});
  assert.equal((await none.gate(req(["npm", "test"]))).allow, false);
  assert.equal(none.operatorCalls(), 1);
  const other = chain();
  assert.equal((await other.gate(req(["npm", "test"], "/other-project"))).allow, false);
  assert.equal(other.operatorCalls(), 1);
});

test("分类为risky的非匹配node路径/flags不会借普通检查政策免a", async () => {
  for (const argv of [["node", "--test", "../outside.test.ts"], ["node", "--test", "--import", "src/run.ts"]]) {
    let asked = false;
    const audit = createMemoryAuditSink();
    const gate = createShellGate({ classifyShell: () => "risky", rules: defaultShellRules(), audit, routineShellPolicy: policy,
      pmAsk: () => '{"verdict":"allow"}', operatorChannel: () => { asked = true; return { outcome: "deny" }; } });
    assert.equal((await gate(req(argv))).allow, false);
    assert.equal(asked, true);
    assert.equal(audit.records[0].branch, "b-allow→a-deny");
  }
});

for (const argv of [
  ["npm", "install"], ["npm", "ci"], ["npm", "run", "arbitrary"], ["npm", "test", "--", "--update"],
  ["rm", "-rf", "test"], ["node", "--test", "../outside.test.ts"], ["node", "--test", "/outside.test.ts"],
  ["node", "--test", "src/main.ts"], ["node", "--test", "--import", "src/execute.ts"],
]) {
  test(`非精确常规检查不继承政策：${argv.join(" ")}`, async () => {
    assert.equal(matchesDelegatedRoutineCheck(argv, "/project", policy), false);
    const c = chain();
    const original = chain(undefined, {});
    assert.deepEqual(await c.gate(req(argv)), await original.gate(req(argv)), "未匹配政策不得改变原链的判定");
    assert.equal(c.operatorCalls(), original.operatorCalls());
    assert.notEqual(c.audit.records[0].branch, BRANCH_B_DELEGATED_ROUTINE);
  });
}

test("c硬拒组合即终结；su只读档即使误注入政策也不免审核", async () => {
  const combo = chain(() => { throw new Error("c deny must not call b"); });
  assert.equal((await combo.gate(req(["sh", "-c", "npm test; rm -rf test"]))).allow, false);
  assert.equal(combo.operatorCalls(), 0);
  assert.equal(combo.audit.records[0].branch, "c-deny");
  const readonly = chain(() => { throw new Error("readonly must not call b"); }, { policy, readonlyOnly: true });
  assert.equal((await readonly.gate(req(["npm", "test"]))).allow, false);
  assert.equal(readonly.operatorCalls(), 0);
  assert.equal(readonly.audit.records[0].branch, "readonly-deny");
});

for (const [label, pm, expectedA] of [
  ["deny", () => '{"verdict":"deny"}', 0],
  ["invalid", () => "no verdict", 0],
  ["unsure", () => '{"verdict":"unsure"}', 1],
  ["error", () => { throw new Error("review unavailable"); }, 1],
  ["timeout", () => new Promise<string>(() => {}), 1],
] as const) {
  test(`常规检查的b=${label} 不会被宿主政策擅自允许`, async () => {
    const c = chain(pm);
    assert.equal((await c.gate(req(["npm", "test"]))).allow, false);
    assert.equal(c.operatorCalls(), expectedA);
    assert.notEqual(c.audit.records[0].branch, BRANCH_B_DELEGATED_ROUTINE);
  });
}

test("node test外指符号链接路径不获委托；项目内测试路径获委托", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-routine-paths-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ans-routine-outside-"));
  try {
    fs.mkdirSync(path.join(root, "test"));
    fs.writeFileSync(path.join(root, "test", "inside.test.ts"), "");
    fs.writeFileSync(path.join(outside, "outside.test.ts"), "");
    fs.symlinkSync(path.join(outside, "outside.test.ts"), path.join(root, "test", "external.test.ts"));
    const current = { ...policy, projectRoot: root };
    assert.equal(matchesDelegatedRoutineCheck(["node", "--test", "test/inside.test.ts"], root, current), true);
    assert.equal(matchesDelegatedRoutineCheck(["node", "--test", "test/external.test.ts"], root, current), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

test("openRoleSession真正把宿主政策传到shell装配，su仍只读", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-routine-arming-"));
  const role = path.join(root, "角色卡", "X");
  fs.mkdirSync(role, { recursive: true });
  fs.writeFileSync(path.join(role, "role-card.md"), "# X\n");
  fs.writeFileSync(path.join(role, "boundary.yaml"), "role: X\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: fixture\n");
  const project: ProjectConfig = { projectRoot: root, skillRoot: root, roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } }, builtInRoles: ["su"], governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test" } } };
  let captured: AdapterCapabilities | undefined;
  const adapter: RuntimeAdapter = { async composeContext() { return { systemPrompt: "" }; }, async bindRole() { return { async prompt() {}, async *events() {}, async dispose() {} }; } };
  const deps = { createAdapter: (_gate: unknown, caps?: AdapterCapabilities) => { captured = caps; return adapter; } };
  let opCalls = 0;
  try {
    const handle = await openRoleSession({
      roleId: "X", project, routineShellPolicy: { ...policy, projectRoot: root },
      shellOperatorChannel: () => { opCalls++; return { outcome: "deny" }; },
      shellArming: {
        classifyShell, rules: defaultShellRules(), auditSink: createMemoryAuditSink(),
        // 本用例验证旧三层链的委托常规检查；2026-10-18 起项目角色默认 advisory，显式关闭走回归路径。
        advisoryRuleset: false,
        openSession: async () => ({ async send() {}, async *events() { yield { kind: "message", summary: '{"verdict":"allow"}' }; yield { kind: "settled", summary: "ended" }; }, async dispose() {} }),
      },
    }, deps);
    assert.equal((await captured!.shellGate!(req(["npm", "test"], root))).allow, true);
    assert.equal(opCalls, 0);
    await handle.dispose();
    const su = await openRoleSession({ roleId: "su", project, routineShellPolicy: { ...policy, projectRoot: root }, shellReadonly: { classifyShell, rules: defaultShellRules(), auditSink: createMemoryAuditSink() } }, deps);
    assert.equal((await captured!.shellGate!(req(["npm", "test"], root))).allow, false);
    assert.equal(opCalls, 0);
    await su.dispose();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("shell诊断明确委托来源与实际审核分支，不存命令/argv", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-routine-log-"));
  try {
    configureDiagnostics({ directory: root });
    await chain().gate(req(["npm", "test"]));
    await flushDiagnostics();
    const text = fs.readdirSync(root).map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("");
    assert.match(text, /shell.routine.delegated/);
    assert.match(text, /customer-delegated-routine-checks/);
    assert.ok(!text.includes('"command"'));
    assert.ok(!text.includes('"argv"'));
  } finally { await disposeDiagnostics(); fs.rmSync(root, { recursive: true, force: true }); }
});
