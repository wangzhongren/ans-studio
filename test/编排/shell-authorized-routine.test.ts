// test/编排/shell-authorized-routine.test.ts
// 编排自测：宿主委托的「常规检查」政策 × 2026-10-31 确定性白名单（门禁引擎 A2 冻结 id）。
//
// 2026-10-31 方案 v1.3 §5.4 / §6.4 的断言同步（逐条列明理由，不弱化其它断言）：
//   ① `npm test` / `npm run typecheck` / `node --test`（含受限测试路径）现在是 (c) 级确定性白名单
//      （`classifyShell` 直接 allow，ruleId `allow:routine:<id>`）⇒ 分支从 `b-allow` / 委托变为
//      `c-allow`；0 卡、0 judge/客户调用。断言改为 c-allow + judge/operator 零调用（更强）。
//   ② 通配 `test/**/*.test.ts` 不命中谓词 ⇒ 不获委托（负例保持）；仍是 review → b 放行。
//   ③ 委托策略只接受原三 id：`npm ci` / `tsc --noEmit` / `npm run test|lint|check` 由谓词命中但
//      **不**继承给委托（本文件直接断言 `matchesDelegatedRoutineCheck === false`）。
//   ④ 「b 不会被宿主政策擅自允许」系列改用 **stub 分类器 risky** 驱动委托路径（真实分类器下三 id 已是
//      c-allow、到不了 b）——保留原断言：b=deny/invalid 不打扰 a，b=unsure/error/timeout 升级 a。
//   ⑤ `npm test` 的 c-allow 与宿主政策/cwd 无关（确定性白名单对**所有角色**生效）；委托的 cwd 等值校验
//      仍在单测层断言（`matchesDelegatedRoutineCheck`）。
//   ⑥ `node --test` 的 realpath/越界/后缀校验保持（外指符号链接不获委托；本机 Windows 无符号链接权限时
//      该用例为既有 EPERM 基线失败，不属本变更）。
//   ⑦ su 只读档相关断言改用**非白名单**命令（`node --test ../outside.test.ts` / `rm`），不改变
//      只读档「只映射 (c)」语义（routine 命令在只读档下的归属是方案空白，见 B1 完成报告 blocked）。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createShellGate, BRANCH_B_DELEGATED_ROUTINE, type PmAskFn } from "../../src/common/编排/shell-gate.ts";
import { matchesDelegatedRoutineCheck } from "../../src/common/编排/routine-shell-policy.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import {
  classifyShell,
  defaultShellRules,
  matchRoutineShellCommand,
} from "../../src/service/gate/shell-rules.ts";
import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import type { RoutineShellPolicy } from "../../src/pipeline/orchestration/shell-arming.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RuntimeAdapter } from "../../src/provider/pi/session.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";

const policy: RoutineShellPolicy = { enabled: true, projectRoot: "/project", authorizationSource: "customer-delegated-routine-checks" };
const req = (argv: string[], cwd = "/project") => ({ command: argv.join(" "), argv, cwd, toolCallId: "routine-call" });

function chain(
  pmAsk: PmAskFn = () => '{"verdict":"allow"}',
  options: { policy?: RoutineShellPolicy; readonlyOnly?: boolean; classify?: typeof classifyShell } = { policy },
) {
  const audit = createMemoryAuditSink();
  let operatorCalls = 0;
  let pmCalls = 0;
  const gate = createShellGate({
    classifyShell: options.classify ?? classifyShell,
    rules: defaultShellRules(),
    audit,
    pmAsk: (input) => {
      pmCalls += 1;
      return pmAsk(input);
    },
    operatorChannel: () => { operatorCalls += 1; return { outcome: "deny", reason: "manual required" }; },
    routineShellPolicy: options.policy,
    readonlyOnly: options.readonlyOnly,
    timeoutMs: 100,
    pmTimeoutMs: 5,
  });
  return { gate, audit, operatorCalls: () => operatorCalls, pmCalls: () => pmCalls };
}

// ① 委托清单原三 id 现在是 (c) 级确定性白名单：0 卡、0 judge。
for (const argv of [["npm", "test"], ["npm", "run", "typecheck"], ["node", "--test"], ["node", "--test", "test/编排/handback.test.ts"]]) {
  test(`确定性白名单（原委托形态）：${argv.join(" ")} → c-allow，0 卡且不调判断 agent`, async () => {
    const c = chain();
    const result = await c.gate(req(argv));
    assert.equal(result.allow, true);
    assert.equal(c.operatorCalls(), 0);
    assert.equal(c.pmCalls(), 0, "c-allow 在 judge 之前放行（A2 白名单不惊动判断 agent）");
    assert.equal(c.audit.records[0].branch, "c-allow");
    // 注：本测试直接注入 `classifyShell`（四态封装的裸串出口），审计 `by` 只带规则集 id；
    // 谓词命中 id（`allow:routine:<id>`）由门禁引擎自身的 `classifyShellDetailed` 出口携带（A2 测试覆盖）。
    assert.match(c.audit.records[0].by, /^ruleset:/);
    assert.notEqual(matchRoutineShellCommand(argv), undefined, "形态命中确定性白名单谓词");
    // 委托策略仍把这些形态视为可委托（同一谓词 + 原三 id），但本路径已由 c 层放行。
    assert.equal(matchesDelegatedRoutineCheck(argv, "/project", policy), true);
  });
}

// ② 通配路径不命中谓词、不获委托（仍走 b）。
test("通配 test/**/*.test.ts 不命中谓词/不获委托：不是 c-allow，也未借政策免 a", async () => {
  const argv = ["node", "--test", "test/**/*.test.ts"];
  assert.equal(matchRoutineShellCommand(argv), undefined, "通配不命中确定性白名单");
  assert.equal(matchesDelegatedRoutineCheck(argv, "/project", policy), false, "不获委托");
  const c = chain();
  const result = await c.gate(req(argv));
  assert.equal(result.allow, true, "review + b 明确 allow 仍放行（既有链不变）");
  assert.equal(c.audit.records[0].branch, "b-allow");
  assert.equal(c.operatorCalls(), 0);
  assert.notEqual(c.audit.records[0].branch, BRANCH_B_DELEGATED_ROUTINE);
});

// ③ 委托策略只接受原三个 id——新增白名单形态不继承给委托。
test("委托策略只认原三 id：npm ci / tsc --noEmit / npm run test|lint|check 谓词命中但不委派", () => {
  const cases: Array<[string[], string]> = [
    [["npm", "ci"], "npm-ci"],
    [["tsc", "--noEmit"], "tsc-noemit"],
    [["npm", "run", "test"], "npm-run-test"],
    [["npm", "run", "lint"], "npm-run-lint"],
    [["npm", "run", "check"], "npm-run-check"],
  ];
  for (const [argv, id] of cases) {
    assert.equal(matchRoutineShellCommand(argv)?.id, id, `${argv.join(" ")} 应命中确定性白名单 id=${id}`);
    assert.equal(matchesDelegatedRoutineCheck(argv, "/project", policy), false, `${argv.join(" ")} 不继承给委托`);
  }
  assert.equal(matchRoutineShellCommand(["npm", "install"]), undefined, "npm install 不命中白名单");
  assert.equal(matchesDelegatedRoutineCheck(["npm", "install"], "/project", policy), false);
});

// ⑤ `npm test` 的 c-allow 与宿主政策/cwd 无关；委托的 cwd 等值校验仍成立。
test("c-allow 与宿主政策无关；委托的 cwd/项目根等值校验仍在单测层成立", async () => {
  const none = chain(undefined, {});
  const r1 = await none.gate(req(["npm", "test"]));
  assert.equal(r1.allow, true, "无宿主委托也由 (c) 白名单放行（对内置角色同样生效）");
  assert.equal(none.operatorCalls(), 0);
  assert.equal(none.pmCalls(), 0);
  const other = chain();
  const r2 = await other.gate(req(["npm", "test"], "/other-project"));
  assert.equal(r2.allow, true, "(c) 白名单不依赖 cwd 等于项目根（委托的等值校验见下一行）");
  assert.equal(other.pmCalls(), 0);
  assert.equal(matchesDelegatedRoutineCheck(["npm", "test"], "/other-project", policy), false, "委托要求 cwd=项目根");
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
  // 只读档：用**非白名单**命令（node --test 越界），政策注入也改变不了只读档「只映射 (c)」的判定。
  const readonly = chain(() => { throw new Error("readonly must not call b"); }, { policy, readonlyOnly: true });
  const readonlyArgv = ["node", "--test", "../outside.test.ts"];
  assert.equal(matchesDelegatedRoutineCheck(readonlyArgv, "/project", policy), false, "越界路径不获委托");
  assert.equal((await readonly.gate(req(readonlyArgv))).allow, false);
  assert.equal(readonly.operatorCalls(), 0);
  assert.equal(readonly.audit.records[0].branch, "readonly-deny");
});

// ④ stub 分类器 risky 驱动委托路径：宿主政策不得让 b 的否定/未完成结论变成放行。
for (const [label, pm, expectedA] of [
  ["deny", () => '{"verdict":"deny"}', 0],
  ["invalid", () => "no verdict", 0],
  ["unsure", () => '{"verdict":"unsure"}', 1],
  ["error", () => { throw new Error("review unavailable"); }, 1],
  ["timeout", () => new Promise<string>(() => {}), 1],
] as const) {
  test(`常规检查的b=${label} 不会被宿主政策擅自允许`, async () => {
    const c = chain(pm, { policy, classify: () => "risky" });
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

test("openRoleSession真正把宿主政策传到shell装配，su仍只读（非白名单命令）", async () => {
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
        // 本用例验证三层链的委托常规检查；2026-10-18 起项目角色默认 advisory，显式关闭走回归路径。
        advisoryRuleset: false,
        openSession: async () => ({ async send() {}, async *events() { yield { kind: "message", summary: '{"verdict":"allow"}' }; yield { kind: "settled", summary: "ended" }; }, async dispose() {} }),
      },
    }, deps);
    // npm test 现在是 (c) 确定性白名单（原委托形态提升为 c-allow），与宿主政策无关。
    assert.equal((await captured!.shellGate!(req(["npm", "test"], root))).allow, true);
    assert.equal(opCalls, 0);
    await handle.dispose();
    const su = await openRoleSession({ roleId: "su", project, routineShellPolicy: { ...policy, projectRoot: root }, shellReadonly: { classifyShell, rules: defaultShellRules(), auditSink: createMemoryAuditSink() } }, deps);
    // 只读档：非白名单命令（越界测试路径，review/risky）一律拒——「su 仍只读」的语义不变。
    assert.equal((await captured!.shellGate!(req(["node", "--test", "../outside.test.ts"], root))).allow, false);
    assert.equal(opCalls, 0);
    await su.dispose();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("shell诊断明确委托来源与实际审核分支，不存命令/argv", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-routine-log-"));
  try {
    configureDiagnostics({ directory: root });
    // 真实分类器下原三 id 已是 c-allow（不产生委托诊断）；用 stub 分类器 risky 触发委托路径以验证诊断来源。
    await chain(undefined, { policy, classify: () => "risky" }).gate(req(["npm", "test"]));
    await flushDiagnostics();
    const text = fs.readdirSync(root).map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("");
    assert.match(text, /shell.routine.delegated/);
    assert.match(text, /customer-delegated-routine-checks/);
    assert.ok(!text.includes('"command"'));
    assert.ok(!text.includes('"argv"'));
  } finally { await disposeDiagnostics(); fs.rmSync(root, { recursive: true, force: true }); }
});
