// test/编排/shell-command-guard.test.ts
// shell 命令**确定性前置封堵**（客户 2026-10-19 原话：「grep/长内联命令 这个应该让判断AI 做好封堵。」）
//
// 覆盖：
//   1. 长内联命令（node -e / python -c / 多行 sh -c / 单行超长）→ deny `inline-too-large`；
//      判断入口**模型零调用**（不建判断会话），理由含「落盘脚本」；
//   2. 无界递归搜索（grep -r 无路径/`.`/项目根/`/`/`~`、find /、rg 全项目）→ deny `unbounded-search`；
//      限定到具体文件/小目录的 grep、`find … -maxdepth`、管道喂入的 rg **不拦**；
//   3. shell-gate 在 (c) 分类之前封堵：classifyShell / pmAsk / operatorChannel 零调用，审计可辨识；
//   4. 普通短命令（npm test / node script.js / ls）不受影响；
//   5. 提示词同步声明「必须 deny」与有界搜索不拦。
//
// 全部离线：假适配器/内存审计，不调用真实模型、不读凭据、不联网。

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { AdapterCapabilities, RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import type { ShellJudgeRequest } from "../../src/model/runtime.ts";
import type { ShellRules } from "../../src/model/decision.ts";
import { createShellJudge } from "../../src/common/编排/shell-judge.ts";
import { buildShellJudgeSystemPrompt } from "../../src/common/编排/shell-judge-prompt.ts";
import {
  createShellGate,
  BRANCH_PREBLOCK_INLINE_TOO_LARGE,
  BRANCH_PREBLOCK_UNBOUNDED_SEARCH,
} from "../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import {
  guardShellCommand,
  INLINE_TOO_LARGE_REASON,
  UNBOUNDED_SEARCH_REASON,
  SHELL_GUARD_INLINE_MAX_COMMAND_BYTES,
  SHELL_GUARD_INLINE_MAX_LINES,
  SHELL_GUARD_INLINE_MAX_LINE_BYTES,
} from "../../src/common/编排/shell-command-guard.ts";

const ROOT = process.cwd();
const PROJECT: ProjectConfig = { projectRoot: ROOT, skillRoot: ROOT, roles: {} };

const BASE_REQUEST: ShellJudgeRequest = {
  command: "npm test",
  argv: ["npm", "test"],
  cwd: ROOT,
  toolCallId: "guard-1",
  roleId: "编排",
  projectRoot: ROOT,
  runtime: "claude",
  policy: "project",
  tier: "risky",
};

function request(overrides: Partial<ShellJudgeRequest> = {}): ShellJudgeRequest {
  return { ...BASE_REQUEST, ...overrides };
}

function guard(command: string, argv: string[] = command.split(/\s+/)): ReturnType<typeof guardShellCommand> {
  return guardShellCommand({ command, argv, cwd: ROOT, projectRoot: ROOT });
}

function assertDeny(
  result: ReturnType<typeof guardShellCommand>,
  reasonCode: "inline-too-large" | "unbounded-search",
  label: string,
): void {
  assert.equal(result.verdict, "deny", label);
  if (result.verdict !== "deny") return;
  assert.equal(result.reasonCode, reasonCode, label);
}

/** 假适配器：记录 bind 次数（= 判断会话建立次数，模型零调用的直接证据）。 */
function fakeFactory(report: unknown): { factory: RuntimeAdapterFactory; seen: { binds: number } } {
  const seen = { binds: 0 };
  const factory: RuntimeAdapterFactory = (_gate, capabilities: AdapterCapabilities | undefined) => ({
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole() {
      seen.binds += 1;
      return {
        async prompt() {
          capabilities?.shellJudge?.report(report);
        },
        async *events() {
          yield { kind: "settled" as const, summary: "settled" };
        },
        async dispose() {},
        async abort() {},
      };
    },
  });
  return { factory, seen };
}

function makeJudge(report: unknown = { verdict: "allow", reason: "无系统风险" }): {
  judge: ReturnType<typeof createShellJudge>;
  seen: { binds: number };
} {
  const { factory, seen } = fakeFactory(report);
  const judge = createShellJudge({
    project: PROJECT,
    runtime: "claude",
    createAdapter: factory,
    timeoutMs: 500,
  });
  return { judge, seen };
}

// —————————————————————— 1. 阈值与长内联 ——————————————————————

test("阈值：命令 2048B / 内联 >10 行 / 单行 >1024B（客户建议 2KB）", () => {
  assert.equal(SHELL_GUARD_INLINE_MAX_COMMAND_BYTES, 2048);
  assert.equal(SHELL_GUARD_INLINE_MAX_LINES, 10);
  assert.equal(SHELL_GUARD_INLINE_MAX_LINE_BYTES, 1024);
});

test("长内联 node -e（>2KB）→ deny inline-too-large，理由含落盘脚本", () => {
  const code = "const value = 1;\n".repeat(170); // >2KB
  const command = `node -e '${code}'`;
  const result = guard(command, ["node", "-e", code]);
  assertDeny(result, "inline-too-large", "长 node -e");
  if (result.verdict !== "deny") return;
  assert.equal(result.reason, INLINE_TOO_LARGE_REASON);
  assert.match(result.reason, /落盘脚本/);
});

test("判断入口：长内联直接 deny，模型零调用（不建判断会话），不是 manual", async () => {
  const code = "const value = 1;\n".repeat(170);
  const { judge, seen } = makeJudge();
  const out = await judge(request({ command: `node -e '${code}'`, argv: ["node", "-e", code] }));
  assert.equal(out.verdict, "deny", "确定性拒绝，不是 manual");
  assert.equal(out.reasonCode, "inline-too-large");
  assert.equal(out.reason, INLINE_TOO_LARGE_REASON);
  assert.equal(out.customerMessage, undefined, "理由已是人话，不再重复一句 customerMessage");
  assert.equal(seen.binds, 0, "命中前置封堵不得建立判断会话（模型零调用）");
});

test("判断入口：无界 grep 直接 deny unbounded-search，模型零调用", async () => {
  const { judge, seen } = makeJudge();
  const out = await judge(request({ command: "grep -rn http .", argv: ["grep", "-rn", "http", "."] }));
  assert.equal(out.verdict, "deny");
  assert.equal(out.reasonCode, "unbounded-search");
  assert.match(out.reason ?? "", /限定具体文件\/目录/);
  assert.equal(seen.binds, 0, "命中前置封堵不得建立判断会话（模型零调用）");
});

test("多行内联 sh -c（>10 行）→ deny；短内联 bash -c 放行", () => {
  const multiLine = Array.from({ length: 11 }, (_, index) => `echo line-${index}`).join("\n");
  assertDeny(guard(`sh -c '${multiLine}'`, ["sh", "-c", multiLine]), "inline-too-large", "11 行 sh -c");

  const tenLines = Array.from({ length: 10 }, (_, index) => `echo ${index}`).join("\n");
  assert.equal(guard(`bash -c '${tenLines}'`, ["bash", "-c", tenLines]).verdict, "allow", "10 行以内短内联不拦");
  assert.equal(guard(`bash -c 'echo ok'`, ["bash", "-c", "echo ok"]).verdict, "allow", "短内联不拦");
});

test("python -c 单行超长（>1024B）→ deny；短 python -c 放行", () => {
  const longLine = `print('${"a".repeat(1200)}')`;
  assertDeny(guard(`python -c "${longLine}"`, ["python", "-c", longLine]), "inline-too-large", "单行超长");

  const short = "print('ok')";
  assert.equal(guard(`python3 -c "${short}"`, ["python3", "-c", short]).verdict, "allow");
});

test("嵌套内联：bash -c 里再套长 node -e 也能识别", () => {
  const code = "const x = 2;\n".repeat(170);
  assertDeny(
    guard(`bash -c "node -e '${code}'"`, ["bash", "-c", `node -e '${code}'`]),
    "inline-too-large",
    "嵌套内联",
  );
});

// —————————————————————— 2. 无界/递归搜索 ——————————————————————

test("无界 grep：无路径 / . / 项目根 / / / ~ / $PWD → deny unbounded-search", () => {
  const cases: Array<[string, string[]]> = [
    ["grep -r foo", ["grep", "-r", "foo"]],
    ["grep -rn foo .", ["grep", "-rn", "foo", "."]],
    ["grep -R foo ./", ["grep", "-R", "foo", "./"]],
    [`grep -r foo ${ROOT}`, ["grep", "-r", "foo", ROOT]],
    ["grep -r foo /", ["grep", "-r", "foo", "/"]],
    ["grep -r foo ~", ["grep", "-r", "foo", "~"]],
    ["grep -r foo $PWD", ["grep", "-r", "foo", "$PWD"]],
    ["grep -r foo ${PWD}", ["grep", "-r", "foo", "${PWD}"]],
    ["grep -r foo ${HOME}", ["grep", "-r", "foo", "${HOME}"]],
    ["grep -r foo $(pwd)", ["grep", "-r", "foo", "$(pwd)"]],
    ['grep -r foo "$(pwd)"', ["grep", "-r", "foo", "$(pwd)"]],
    ["grep --recursive foo ..", ["grep", "--recursive", "foo", ".."]],
    ["grep -rn foo *", ["grep", "-rn", "foo", "*"]],
  ];
  for (const [command, argv] of cases) {
    const result = guard(command, argv);
    assertDeny(result, "unbounded-search", command);
    if (result.verdict === "deny") assert.equal(result.reason, UNBOUNDED_SEARCH_REASON, command);
  }
});

test("有界 grep 放行：具体目录 + --include / 具体文件（不因本规则拒绝）", () => {
  const cases: Array<[string, string[]]> = [
    ['grep -rn "http" src/public', ["grep", "-rn", "http", "src/public"]],
    ["grep -rn pattern src/specific-dir --include=*.js", ["grep", "-rn", "pattern", "src/specific-dir", "--include=*.js"]],
    ["grep -r foo file1.txt file2.txt", ["grep", "-r", "foo", "file1.txt", "file2.txt"]],
    ["grep -n 'a|b' f7data.txt", ["grep", "-n", "a|b", "f7data.txt"]],
    ["grep -rn foo ./src", ["grep", "-rn", "foo", "./src"]],
    ["grep -r foo ${PWD}/src", ["grep", "-r", "foo", "${PWD}/src"]],
  ];
  for (const [command, argv] of cases) {
    assert.equal(guard(command, argv).verdict, "allow", command);
  }
});

test("find：/ 与 . → deny；具体目录与 -maxdepth 有界 → 放行", () => {
  assertDeny(guard("find / -name x", ["find", "/", "-name", "x"]), "unbounded-search", "find /");
  assertDeny(guard("find . -name x", ["find", ".", "-name", "x"]), "unbounded-search", "find .");
  assertDeny(guard("find ~ -name x", ["find", "~", "-name", "x"]), "unbounded-search", "find ~");
  assert.equal(guard("find src -name '*.ts'", ["find", "src", "-name", "*.ts"]).verdict, "allow");
  assert.equal(guard("find . -maxdepth 1 -name x", ["find", ".", "-maxdepth", "1", "-name", "x"]).verdict, "allow");
});

test("rg：无路径全项目扫描 → deny；具体路径 / 管道喂入 / --version 放行", () => {
  assertDeny(guard("rg foo", ["rg", "foo"]), "unbounded-search", "rg 无路径");
  assertDeny(guard("rg -n foo .", ["rg", "-n", "foo", "."]), "unbounded-search", "rg .");
  assertDeny(guard("rg foo $PWD", ["rg", "foo", "$PWD"]), "unbounded-search", "rg 项目根");
  assertDeny(guard("rg --files", ["rg", "--files"]), "unbounded-search", "rg --files 无路径");
  assert.equal(guard("rg foo src/public", ["rg", "foo", "src/public"]).verdict, "allow");
  assert.equal(guard("rg -g '*.ts' foo src", ["rg", "-g", "*.ts", "foo", "src"]).verdict, "allow");
  assert.equal(guard("cat file | rg foo", ["cat", "file", "|", "rg", "foo"]).verdict, "allow", "stdin 有界");
  assert.equal(guard("rg --version", ["rg", "--version"]).verdict, "allow");
});

test("包装器剥离：sudo / timeout / xargs 后的无界 grep 仍被拒绝", () => {
  assertDeny(guard("sudo grep -r foo .", ["sudo", "grep", "-r", "foo", "."]), "unbounded-search", "sudo");
  assertDeny(guard("timeout 5 grep -r foo .", ["timeout", "5", "grep", "-r", "foo", "."]), "unbounded-search", "timeout");
  assertDeny(guard("xargs grep -r foo", ["xargs", "grep", "-r", "foo"]), "unbounded-search", "xargs");
  assertDeny(
    guard("bash -c 'grep -r foo .'", ["bash", "-c", "grep -r foo ."]),
    "unbounded-search",
    "短内联里的无界搜索（内联本身不超限，但不是有界搜索）",
  );
});

// —————————————————————— 3. 普通命令不受影响 ——————————————————————

test("普通短命令/落盘脚本不受影响：npm test / node script.js / ls / git status", () => {
  const cases = [
    ["npm test", ["npm", "test"]],
    ["node script.js", ["node", "script.js"]],
    ["ls -la", ["ls", "-la"]],
    ["git status", ["git", "status"]],
    ["node --test", ["node", "--test"]],
    ['echo "$(pwd)"', ["echo", "$(pwd)"]],
  ] as const;
  for (const [command, argv] of cases) {
    assert.equal(guard(command, [...argv]).verdict, "allow", command);
  }
});

// —————————————————————— 4. shell-gate：先于 (c)/(b)/(a) ——————————————————————

const RULES: ShellRules = { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] };

test("shell-gate：前置封堵先于 (c) 白名单与 (b)/(a)——classify/pm/operator 零调用，审计可辨识", async () => {
  let classifyCalls = 0;
  let pmCalls = 0;
  let operatorCalls = 0;
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => {
      classifyCalls += 1;
      return "allow";
    },
    rules: RULES,
    rulesId: "guard-test",
    audit,
    pmAsk: () => {
      pmCalls += 1;
      return JSON.stringify({ verdict: "allow", reason: "x" });
    },
    operatorChannel: () => {
      operatorCalls += 1;
      return { outcome: "allow", operatorId: "guard-test" };
    },
  });

  const code = "const value = 1;\n".repeat(170);
  const inline = await gate({
    command: `node -e '${code}'`,
    argv: ["node", "-e", code],
    cwd: ROOT,
    toolCallId: "preblock-inline",
  });
  assert.equal(inline.allow, false);
  if (!inline.allow) {
    assert.match(inline.reason, /落盘脚本/);
    assert.equal(inline.by, "preblock:inline-too-large");
  }
  assert.equal(classifyCalls, 0, "(c) 分类零调用");
  assert.equal(pmCalls, 0, "(b) 模型零调用");
  assert.equal(operatorCalls, 0, "(a) 客户通道零调用");
  assert.equal(audit.records[0]?.branch, BRANCH_PREBLOCK_INLINE_TOO_LARGE);
  assert.equal(audit.records[0]?.conclusion, "deny");

  const grep = await gate({
    command: "grep -rn http .",
    argv: ["grep", "-rn", "http", "."],
    cwd: ROOT,
    toolCallId: "preblock-grep",
  });
  assert.equal(grep.allow, false, "grep -r 项目根必须拒绝（即使 (c) 白名单本会放行）");
  if (!grep.allow) {
    assert.match(grep.reason, /限定具体文件\/目录/);
    assert.equal(grep.by, "preblock:unbounded-search");
  }
  assert.equal(classifyCalls, 0);
  assert.equal(audit.records[1]?.branch, BRANCH_PREBLOCK_UNBOUNDED_SEARCH);

  // 有界 grep 不因本规则拒绝：放行到 (c)，由分类器决定（这里桩为 allow）。
  const bounded = await gate({
    command: 'grep -rn "http" src/public',
    argv: ["grep", "-rn", "http", "src/public"],
    cwd: ROOT,
    toolCallId: "bounded-grep",
  });
  assert.equal(bounded.allow, true);
  assert.equal(classifyCalls, 1, "有界命令照常进入 (c)");
  assert.equal(audit.records[2]?.branch, "c-allow");
});

test("shell-gate：只读档同样先被封堵（不因白名单放行无界 grep）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => "allow",
    rules: RULES,
    rulesId: "guard-readonly",
    audit,
    readonlyOnly: true,
  });
  const result = await gate({
    command: "grep -rn http .",
    argv: ["grep", "-rn", "http", "."],
    cwd: ROOT,
    toolCallId: "preblock-readonly",
  });
  assert.equal(result.allow, false);
  if (!result.allow) assert.equal(result.by, "preblock:unbounded-search");
});

// —————————————————————— 5. 提示词同步 ——————————————————————

test("系统提示：长内联/无界搜索属卡死风险，必须 deny 并给落盘脚本；有界搜索不拦", () => {
  const system = buildShellJudgeSystemPrompt();
  assert.match(system, /【长内联与无界搜索——必须 deny/);
  assert.match(system, /长内联命令/);
  assert.match(system, /node -e/);
  assert.match(system, /python\|python3 -c/);
  assert.match(system, /bash\|sh\|zsh -c/);
  assert.match(system, /落盘脚本/);
  assert.match(system, /无界递归搜索/);
  assert.match(system, /grep -r/);
  assert.match(system, /find \//);
  assert.match(system, /rg` 全项目扫描|rg 全项目扫描/);
  assert.match(system, /限定到具体文件\/小目录且有界的搜索/);
  assert.match(system, /不得因此 deny/);
});
