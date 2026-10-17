import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  SHELL_JUDGE_LIST_TOOL,
  SHELL_JUDGE_READ_TOOL,
  SHELL_JUDGE_REPORT_TOOL,
  SHELL_JUDGE_TOOL_NAMES,
  buildShellJudgeTools,
} from "../../src/common/runtime-core/shell-judge/tools.ts";
import { resolveJudgeRead, sensitiveClass } from "../../src/common/runtime-core/shell-judge/policy.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import type { RoleSession, RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent, ShellJudgeReadStats } from "../../src/model/runtime.ts";
import { allow, registerControlledDisplayProfile, role } from "./fixtures.ts";

const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-shell-judge-"));

function freshStats(): ShellJudgeReadStats {
  return { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false };
}

function fixture(root: string, report: (raw: unknown) => void = () => {}) {
  const stats = freshStats();
  const tools = buildShellJudgeTools({ projectRoot: root, report, stats });
  return { tools, byName: new Map(tools.map((tool) => [tool.name, tool])), stats };
}

const call = (name: string, args: Record<string, unknown>) => ({ name, args });

test("只读工具集恰为三项：judge_read_file / judge_list_dir / report_shell_judgement", () => {
  const root = process.cwd();
  const { tools } = fixture(root);
  assert.deepEqual(tools.map((tool) => tool.name), ["judge_read_file", "judge_list_dir", "report_shell_judgement"]);
  assert.deepEqual([...SHELL_JUDGE_TOOL_NAMES], ["judge_read_file", "judge_list_dir", "report_shell_judgement"]);
  const names = new Set(tools.map((tool) => tool.name));
  for (const forbidden of [
    "write_file", "edit_file", "read_file", "run_shell", "request_confirmation", "request_choice",
    "submit_report", "dispatch_task", "role_status", "session_tail", "propose_recovery",
    "install_skill", "uninstall_skill", "install_mcp", "uninstall_mcp",
  ]) {
    assert.equal(names.has(forbidden), false, `判断会话不得构造 ${forbidden}`);
  }
  // schema 与工具定义同源：required 字段与三值裁决按评审 §8.2 钉住。
  assert.deepEqual(describeTool(SHELL_JUDGE_READ_TOOL).parameters.required, ["path"]);
  assert.deepEqual(describeTool(SHELL_JUDGE_LIST_TOOL).parameters.required, []);
  assert.deepEqual(describeTool(SHELL_JUDGE_REPORT_TOOL).parameters.required, ["verdict"]);
  const verdict = (describeTool(SHELL_JUDGE_REPORT_TOOL).parameters.properties as Record<string, { enum?: string[] }>).verdict;
  assert.deepEqual(verdict.enum, ["allow", "deny", "manual"]);
  for (const tool of tools) assert.equal(tool.inputSchema.type, "object");
});

test("项目根内可读（相对/绝对）；根外、`..`、符号链接逃逸一律拒绝且不回显绝对路径", async () => {
  const root = await temp();
  const outside = await temp();
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "app.ts"), "export const answer = 42;\n", "utf8");
    await writeFile(path.join(outside, "secret.txt"), "OUTSIDE_SECRET", "utf8");
    await symlink(outside, path.join(root, "escape"), "junction");

    const { byName } = fixture(root);
    const inside = await byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "src/app.ts" }));
    assert.equal(inside.ok, true);
    assert.match(inside.message, /judge_read_file: src\/app\.ts/);
    assert.match(inside.message, /answer = 42/);

    const absoluteInside = await byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: path.join(root, "src", "app.ts") }));
    assert.equal(absoluteInside.ok, true);
    assert.match(absoluteInside.message, /answer = 42/);

    const absoluteOutside = await byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: path.join(outside, "secret.txt") }));
    assert.equal(absoluteOutside.ok, false);
    assert.equal(absoluteOutside.message.includes(outside), false, "拒绝文案不得回显项目根外绝对路径");
    assert.equal(absoluteOutside.message.includes("OUTSIDE_SECRET"), false);

    const dotdot = await byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "../secret.txt" }));
    assert.equal(dotdot.ok, false);

    const escape = await byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "escape/secret.txt" }));
    assert.equal(escape.ok, false);
    assert.equal(escape.message.includes("OUTSIDE_SECRET"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("敏感文件/目录拒绝：.env、私钥、凭据/令牌、.git、审计与会话目录；列表不列敏感项", async () => {
  const root = await temp();
  try {
    await mkdir(path.join(root, "keys"), { recursive: true });
    await mkdir(path.join(root, "docs", "audit"), { recursive: true });
    await mkdir(path.join(root, ".ans", "sessions"), { recursive: true });
    await mkdir(path.join(root, ".git"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, ".env"), "API_KEY=do-not-read", "utf8");
    await writeFile(path.join(root, ".env.local"), "SECRET=1", "utf8");
    await writeFile(path.join(root, "keys", "server.pem"), "PRIVATE", "utf8");
    await writeFile(path.join(root, "credentials.json"), "{}", "utf8");
    await writeFile(path.join(root, "my-token.txt"), "TOKEN", "utf8");
    await writeFile(path.join(root, "docs", "audit", "a.md"), "audit", "utf8");
    await writeFile(path.join(root, ".ans", "sessions", "x.jsonl"), "session", "utf8");
    await writeFile(path.join(root, ".git", "config"), "[remote]", "utf8");
    await writeFile(path.join(root, "README.md"), "# project", "utf8");
    await writeFile(path.join(root, "src", "app.ts"), "export {};\n", "utf8");

    const { byName } = fixture(root);
    for (const payload of [".env", ".env.local", "keys/server.pem", "credentials.json", "my-token.txt", "docs/audit/a.md", ".ans/sessions/x.jsonl", ".git/config"]) {
      const result = await byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: payload }));
      assert.equal(result.ok, false, `${payload} 必须被拒绝`);
      assert.match(result.message, /敏感/);
    }

    // 8 次被拒读取也占调用预算；列表用独立会话统计（同一预算语义）。
    const listing = await fixture(root).byName.get(SHELL_JUDGE_LIST_TOOL)!.handler(call(SHELL_JUDGE_LIST_TOOL, {}));
    assert.equal(listing.ok, true);
    assert.match(listing.message, /README\.md/);
    assert.match(listing.message, /src\//, "目录名以 / 结尾");
    for (const hidden of [".env", ".env.local", "credentials.json", "my-token.txt", ".git"]) {
      assert.equal(listing.message.includes(hidden), false, `列表不得列出敏感项 ${hidden}`);
    }
    const docsList = await fixture(root).byName.get(SHELL_JUDGE_LIST_TOOL)!.handler(call(SHELL_JUDGE_LIST_TOOL, { path: "docs" }));
    assert.equal(docsList.ok, true);
    assert.equal(docsList.message.includes("audit"), false, "docs/audit 不得列名");
    const ansList = await fixture(root).byName.get(SHELL_JUDGE_LIST_TOOL)!.handler(call(SHELL_JUDGE_LIST_TOOL, { path: ".ans" }));
    assert.equal(ansList.ok, true);
    assert.equal(ansList.message.includes("sessions"), false, ".ans/sessions 不得列名");

    // 敏感目录本身也不可列。
    const sensitiveDir = await fixture(root).byName.get(SHELL_JUDGE_LIST_TOOL)!.handler(call(SHELL_JUDGE_LIST_TOOL, { path: ".git" }));
    assert.equal(sensitiveDir.ok, false);
    assert.match(sensitiveDir.message, /敏感/);

    // 真实路径检查：根内「别名」链接到敏感目录仍被拒（防链接成 config.txt）。
    await mkdir(path.join(root, "credentials-dir"), { recursive: true });
    await writeFile(path.join(root, "credentials-dir", "info.txt"), "PRIVATE", "utf8");
    await symlink(path.join(root, "credentials-dir"), path.join(root, "config"), "junction");
    const alias = await fixture(root).byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "config/info.txt" }));
    assert.equal(alias.ok, false);
    assert.match(alias.message, /敏感/);

    assert.equal(sensitiveClass(["src", "app.ts"]), undefined);
    assert.equal(sensitiveClass([".env"]), "env");
    assert.equal(sensitiveClass(["keys", "server.pem"]), "key-material");
    assert.equal(sensitiveClass(["docs", "audit", "x.md"]), "audit");
    assert.equal(sensitiveClass([".ans", "sessions", "x.jsonl"]), "session");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("二进制拒绝、64KB 截断标记、8 次调用与 192KB 总预算", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "image.bin"), Buffer.from([0x61, 0x00, 0x62, 0x63]));
    await writeFile(path.join(root, "big.txt"), "a".repeat(70 * 1024), "utf8");
    await writeFile(path.join(root, "small.txt"), "hello", "utf8");

    const binary = fixture(root);
    const binaryResult = await binary.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "image.bin" }));
    assert.equal(binaryResult.ok, false);
    assert.match(binaryResult.message, /二进制/);

    const big = fixture(root);
    const bigResult = await big.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "big.txt" }));
    assert.equal(bigResult.ok, true);
    assert.match(bigResult.message, /\[已截断/);
    assert.equal(big.stats.truncatedReads, 1);
    assert.equal(big.stats.readBytes, 64 * 1024);

    const calls = fixture(root);
    for (let index = 0; index < 8; index++) {
      const result = await calls.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "small.txt" }));
      assert.equal(result.ok, true, `第 ${index + 1} 次读取应仍可用`);
    }
    const ninth = await calls.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "small.txt" }));
    assert.equal(ninth.ok, false);
    assert.match(ninth.message, /预算/);
    assert.equal(calls.stats.budgetExceeded, true);
    assert.equal(calls.stats.readCalls, 9);

    // 总读取 192KB：3×60KB=180KB，第 4 次只余 12KB → 截断；第 5 次预算拒绝。
    for (let index = 0; index < 4; index++) await writeFile(path.join(root, `chunk-${index}.txt`), "b".repeat(60 * 1024), "utf8");
    const total = fixture(root);
    for (let index = 0; index < 3; index++) {
      const result = await total.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: `chunk-${index}.txt` }));
      assert.equal(result.ok, true);
      assert.equal(result.message.includes("[已截断"), false);
    }
    const fourth = await total.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "chunk-3.txt" }));
    assert.equal(fourth.ok, true);
    assert.match(fourth.message, /\[已截断/);
    assert.equal(total.stats.readBytes, 192 * 1024);
    assert.equal(total.stats.budgetExceeded, true);
    const fifth = await total.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "chunk-3.txt" }));
    assert.equal(fifth.ok, false);
    assert.match(fifth.message, /预算/);

    // 预算参数可注入（测试/宿主）：单文件上限收紧后立即截断。
    const custom = buildShellJudgeTools({ projectRoot: root, report: () => {}, stats: freshStats(), budget: { maxFileBytes: 2, maxCalls: 1, maxBytes: 100 } });
    const customRead = await custom.find((tool) => tool.name === SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "small.txt" }));
    assert.equal(customRead.ok, true);
    assert.match(customRead.message, /\[已截断/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("第 9 次读取返回独立 budget 码且不计入 deniedReads；敏感/越界仍 read-denied、截断仍 read-truncated", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "small.txt"), "hello", "utf8");
    await writeFile(path.join(root, "big.txt"), "a".repeat(70 * 1024), "utf8");

    const stats = freshStats();
    for (let index = 0; index < 8; index++) {
      const result = await resolveJudgeRead({ projectRoot: root, path: "small.txt", stats });
      assert.equal(result.ok, true, `第 ${index + 1} 次读取应仍可用`);
    }
    const ninth = await resolveJudgeRead({ projectRoot: root, path: "small.txt", stats });
    assert.equal(ninth.ok, false);
    if (!ninth.ok) { assert.equal(ninth.code, "budget"); assert.equal(ninth.pathClass, "budget"); }
    assert.equal(stats.budgetExceeded, true);
    assert.equal(stats.readCalls, 9);
    assert.equal(stats.deniedReads, 0, "预算耗尽是独立原因码，不得计入 deniedReads/read-denied");

    const sensitive = freshStats();
    const secret = await resolveJudgeRead({ projectRoot: root, path: ".env", stats: sensitive });
    assert.equal(secret.ok, false);
    if (!secret.ok) assert.equal(secret.code, "sensitive");
    assert.equal(sensitive.deniedReads, 1);

    const outside = freshStats();
    const escape = await resolveJudgeRead({ projectRoot: root, path: "../outside.txt", stats: outside });
    assert.equal(escape.ok, false);
    if (!escape.ok) assert.equal(escape.code, "outside-root");
    assert.equal(outside.deniedReads, 1);

    const truncated = freshStats();
    const big = await resolveJudgeRead({ projectRoot: root, path: "big.txt", stats: truncated });
    assert.equal(big.ok, true);
    if (big.ok) assert.equal(big.truncated, true);
    assert.equal(truncated.truncatedReads, 1);
    assert.equal(truncated.deniedReads, 0);
    assert.equal(truncated.budgetExceeded, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("report_shell_judgement 原样回调模型参数，不做裁决规范化", async () => {
  const root = await temp();
  try {
    const received: unknown[] = [];
    const { byName } = fixture(root, (raw) => { received.push(raw); });
    const raw = { verdict: "MAYBE", reason: "", alternative: "not-an-object", evidence: "not-an-array", extra: { nested: true } };
    const result = await byName.get(SHELL_JUDGE_REPORT_TOOL)!.handler(call(SHELL_JUDGE_REPORT_TOOL, raw));
    assert.equal(result.ok, true);
    assert.equal(received.length, 1);
    assert.equal(received[0], raw, "回调必须收到同一份原始参数对象（不做克隆/归一）");
    assert.deepEqual(received[0], raw);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Service 装配：注入 shellJudge 时只构造三只只读工具、judgeMode=true、外来 MCP 置空", async () => {
  const root = await temp();
  let captured: RuntimeProviderOptions | undefined;
  const factory: RuntimeProviderFactory = (options) => {
    registerControlledDisplayProfile(options);
    captured = options;
    return {
      async composeContext() { return { systemPrompt: "fixture" }; },
      async bindRole() {
        const queue = createEventQueue<SessionEvent>();
        const session: RoleSession = { async prompt() {}, events: () => queue.stream, async dispose() { queue.close(); } };
        return session;
      },
    };
  };
  try {
    const stats = freshStats();
    const session = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      shellJudge: { projectRoot: root, report: () => {}, stats },
      // 即便误给写/shell/交互能力，judge 模式也不得把它们变成工具。
      shellGate: async () => ({ allow: false, reason: "fixture", by: "fixture" }),
      customerInput: () => ({ outcome: "declined" }),
      reportHandback: () => {},
      dispatchTask: () => {},
      providerFactories: { claude: factory },
    }).bindRole(role());
    await session.dispose();
    assert.ok(captured);
    assert.deepEqual(captured!.tools.map((tool) => tool.name), ["judge_read_file", "judge_list_dir", "report_shell_judgement"]);
    assert.equal(captured!.judgeMode, true);
    assert.deepEqual(captured!.installedMcpServers, []);
    assert.equal(captured!.tools.some((tool) => ["write_file", "edit_file", "read_file", "run_shell"].includes(tool.name)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("judge_list_dir 单层列举、默认项目根、根外拒绝", async () => {
  const root = await temp();
  const outside = await temp();
  try {
    await mkdir(path.join(root, "src", "nested"), { recursive: true });
    await writeFile(path.join(root, "src", "nested", "deep.ts"), "deep", "utf8");
    await writeFile(path.join(root, "src", "top.ts"), "top", "utf8");
    const { byName } = fixture(root);
    const rootList = await byName.get(SHELL_JUDGE_LIST_TOOL)!.handler(call(SHELL_JUDGE_LIST_TOOL, {}));
    assert.equal(rootList.ok, true);
    assert.match(rootList.message, /src\//);
    const srcList = await byName.get(SHELL_JUDGE_LIST_TOOL)!.handler(call(SHELL_JUDGE_LIST_TOOL, { path: "src" }));
    assert.equal(srcList.ok, true);
    assert.match(srcList.message, /top\.ts/);
    assert.match(srcList.message, /nested\//);
    assert.equal(srcList.message.includes("deep.ts"), false, "只列一层");
    const outsideList = await byName.get(SHELL_JUDGE_LIST_TOOL)!.handler(call(SHELL_JUDGE_LIST_TOOL, { path: outside }));
    assert.equal(outsideList.ok, false);
    assert.equal(outsideList.message.includes(outside), false);
    // resolveJudgeRead 直接调用同样落预算统计（策略只给运行时核心内部消费）。
    const direct = await resolveJudgeRead({ projectRoot: root, path: "src/top.ts", stats: freshStats() });
    assert.equal(direct.ok, true);
    if (direct.ok) assert.equal(direct.rel, "src/top.ts");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
