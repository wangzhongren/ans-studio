// 判断 agent 定点抽查（2026-10-19 客户反馈）：
// `judge_read_file` 可选字节范围（offset/limit）或行范围（startLine/endLine），
// 在既有预算内只返回指定片段；无参数行为逐字不变；敏感/二进制/realpath/项目根检查不可被范围绕过。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  SHELL_JUDGE_LIST_TOOL,
  SHELL_JUDGE_READ_TOOL,
  buildShellJudgeTools,
} from "../../src/common/runtime-core/shell-judge/tools.ts";
import { buildGovernanceJudgeTools } from "../../src/common/runtime-core/governance-judge/tools.ts";
import { resolveJudgeRead } from "../../src/common/runtime-core/shell-judge/policy.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import type { ShellJudgeReadStats } from "../../src/model/runtime.ts";

const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-judge-range-"));

function freshStats(): ShellJudgeReadStats {
  return { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false };
}

const call = (name: string, args: Record<string, unknown>) => ({ name, args });

function fixture(
  root: string,
  budget?: { maxCalls?: number; maxBytes?: number; maxFileBytes?: number; maxScanBytes?: number },
) {
  const stats = freshStats();
  const tools = buildShellJudgeTools({ projectRoot: root, report: () => {}, stats, ...(budget !== undefined ? { budget } : {}) });
  return { stats, byName: new Map(tools.map((tool) => [tool.name, tool])) };
}

test("无参数行为逐字不变：整文件回执、128KB 截断文案、统计与预算口径", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "small.txt"), "hello\n", "utf8");
    await writeFile(path.join(root, "big.txt"), "a".repeat(130 * 1024), "utf8");

    const { byName, stats } = fixture(root);
    const small = await byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "small.txt" }));
    assert.equal(small.ok, true);
    assert.equal(small.message, "judge_read_file: small.txt\n\nhello\n", "无参数时回执与历史逐字一致");
    assert.equal(stats.readBytes, 6);
    assert.equal(stats.truncatedReads, 0);

    const big = await byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "big.txt" }));
    assert.equal(big.ok, true);
    assert.match(big.message, /\[已截断：文件超过单文件\/总读取预算\]/);
    assert.equal(stats.readBytes, 6 + 128 * 1024);
    assert.equal(stats.truncatedReads, 1);

    // 12 次调用上限；第 13 次预算拒绝（独立 budget 码）。
    const calls = fixture(root);
    for (let index = 0; index < 12; index++) {
      const result = await calls.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "small.txt" }));
      assert.equal(result.ok, true);
    }
    const thirteenth = await calls.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "small.txt" }));
    assert.equal(thirteenth.ok, false);
    assert.match(thirteenth.message, /预算/);
    assert.equal(calls.stats.readCalls, 13);
    assert.equal(calls.stats.budgetExceeded, true);
    assert.equal(calls.stats.deniedReads, 0, "预算耗尽不计入 deniedReads");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("字节范围：offset/limit 定点读取、范围标注、恰好读完不算截断", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "digits.txt"), "0123456789abcdef", "utf8");
    const { byName, stats } = fixture(root);
    const readTool = byName.get(SHELL_JUDGE_READ_TOOL)!;

    const middle = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "digits.txt", offset: 4, limit: 6 }));
    assert.equal(middle.ok, true);
    assert.match(middle.message, /judge_read_file: digits\.txt（字节 4–9 \/ 共 16 字节）/);
    assert.match(middle.message, /\n\n456789$/);
    assert.equal(middle.message.includes("[已截断"), false);
    assert.equal(stats.readBytes, 6, "readBytes 只计实际返回字节");
    assert.equal(stats.truncatedReads, 0);

    const tail = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "digits.txt", offset: 10 }));
    assert.equal(tail.ok, true);
    assert.match(tail.message, /（字节 10–15 \/ 共 16 字节）/);
    assert.match(tail.message, /\n\nabcdef$/);

    const head = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "digits.txt", limit: 3 }));
    assert.equal(head.ok, true);
    assert.match(head.message, /（字节 0–2 \/ 共 16 字节）/);
    assert.match(head.message, /\n\n012$/);

    assert.deepEqual(stats.readPaths, ["digits.txt"], "成功范围读取也记录 readPaths（去重）");
    assert.equal(stats.readCalls, 3);

    // 大文件上的小范围：即使文件 > 128KB，恰好读完请求片段也不算截断。
    await writeFile(path.join(root, "big.txt"), "a".repeat(140 * 1024), "utf8");
    const ranged = fixture(root);
    const slice = await ranged.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "big.txt", offset: 100, limit: 10 }));
    assert.equal(slice.ok, true);
    assert.match(slice.message, /（字节 100–109 \/ 共 143360 字节）/);
    assert.equal(slice.message.includes("[已截断"), false);
    assert.equal(ranged.stats.truncatedReads, 0);
    assert.equal(ranged.stats.readBytes, 10);

    // 请求范围超过单文件预算：返回 128KB 并如实标注截断。
    const clipped = fixture(root);
    const huge = await clipped.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "big.txt", offset: 0, limit: 200000 }));
    assert.equal(huge.ok, true);
    assert.match(huge.message, /\[已截断：请求范围超过单文件\/总读取预算\]/);
    assert.equal(clipped.stats.readBytes, 128 * 1024);
    assert.equal(clipped.stats.truncatedReads, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("字节范围：越过文件末尾如实拒绝、空文件返回空片段、结构化 range 事实", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "digits.txt"), "0123456789abcdef", "utf8");
    await writeFile(path.join(root, "empty.txt"), "", "utf8");

    const { byName, stats } = fixture(root);
    const readTool = byName.get(SHELL_JUDGE_READ_TOOL)!;

    const atEnd = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "digits.txt", offset: 16, limit: 1 }));
    assert.equal(atEnd.ok, false);
    assert.match(atEnd.message, /范围超出文件末尾或扫描上限/);
    assert.equal(stats.deniedReads, 0, "越界是信息性结果，不计入 deniedReads");
    assert.equal(stats.readCalls, 1);
    assert.equal(stats.deniedPaths?.some((entry) => entry.code === "out-of-range"), true);

    const beyond = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "digits.txt", offset: 99 }));
    assert.equal(beyond.ok, false);
    assert.match(beyond.message, /范围超出文件末尾/);

    const empty = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "empty.txt", offset: 0, limit: 10 }));
    assert.equal(empty.ok, true);
    assert.match(empty.message, /judge_read_file: empty\.txt（空文件）\n\n$/);
    assert.equal(empty.message.includes("[已截断"), false);

    // 直接调用策略层：结构化范围事实（工具文案之外的单一来源）。
    const stats2 = freshStats();
    const structured = await resolveJudgeRead({
      projectRoot: root,
      path: "digits.txt",
      stats: stats2,
      range: { offset: 4, limit: 6 },
    });
    assert.equal(structured.ok, true);
    if (structured.ok) {
      assert.equal(structured.text, "456789");
      assert.equal(structured.bytes, 6);
      assert.equal(structured.totalBytes, 16);
      assert.equal(structured.truncated, false);
      assert.deepEqual(structured.range, { kind: "bytes", offset: 4, end: 10, totalBytes: 16 });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("行范围：startLine/endLine 1 基含端点、缺省另一端、超 EOF 收敛如实标注", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "lines.txt"), "l1\nl2\nl3\nl4\n", "utf8");
    await writeFile(path.join(root, "no-trailing.txt"), "a\nb", "utf8");
    const { byName, stats } = fixture(root);
    const readTool = byName.get(SHELL_JUDGE_READ_TOOL)!;

    const middle = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "lines.txt", startLine: 2, endLine: 3 }));
    assert.equal(middle.ok, true);
    assert.match(middle.message, /（第 2–3 行）/);
    assert.match(middle.message, /\n\nl2\nl3\n$/);
    assert.equal(middle.message.includes("[已截断"), false);

    const single = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "lines.txt", startLine: 2, endLine: 2 }));
    assert.equal(single.ok, true);
    assert.match(single.message, /（第 2 行）/);
    assert.match(single.message, /\n\nl2\n$/);

    const fromLine = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "lines.txt", startLine: 3 }));
    assert.equal(fromLine.ok, true);
    assert.match(fromLine.message, /（第 3–4 行 \/ 共 4 行）/);
    assert.match(fromLine.message, /\n\nl3\nl4\n$/);

    const toLine = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "lines.txt", endLine: 2 }));
    assert.equal(toLine.ok, true);
    assert.match(toLine.message, /（第 1–2 行）/);
    assert.match(toLine.message, /\n\nl1\nl2\n$/);

    const clamped = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "lines.txt", startLine: 3, endLine: 99 }));
    assert.equal(clamped.ok, true);
    assert.match(clamped.message, /请求第 3–99 行；文件止于第 4 行，实际 第 3–4 行/);
    assert.equal(clamped.message.includes("[已截断"), false, "收敛到 EOF 不是预算截断");
    assert.equal(stats.truncatedReads, 0);

    const lastNoNewline = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "no-trailing.txt", startLine: 2, endLine: 2 }));
    assert.equal(lastNoNewline.ok, true);
    assert.match(lastNoNewline.message, /（第 2 行(?: \/ 共 2 行)?）/);
    assert.match(lastNoNewline.message, /\n\nb$/);

    const beyond = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "lines.txt", startLine: 99 }));
    assert.equal(beyond.ok, false);
    assert.match(beyond.message, /范围超出文件末尾/);
    assert.equal(stats.deniedReads, 0);

    const noLine = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "lines.txt", endLine: 0 }));
    assert.equal(noLine.ok, false, "endLine=0 属于非法参数");
    assert.match(noLine.message, /范围参数非法/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("行范围：大文件定点抽查不把整文件计入读取预算；请求范围超预算才截断", async () => {
  const root = await temp();
  try {
    const lines = Array.from({ length: 1000 }, (_, index) => `line-${index + 1}-${"x".repeat(160)}`);
    await writeFile(path.join(root, "large.txt"), `${lines.join("\n")}\n`, "utf8");

    const spot = fixture(root);
    const readTool = spot.byName.get(SHELL_JUDGE_READ_TOOL)!;
    const one = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "large.txt", startLine: 500, endLine: 500 }));
    assert.equal(one.ok, true);
    assert.match(one.message, /（第 500 行）/);
    assert.match(one.message, new RegExp(`\\n\\n${lines[499]}\\n$`));
    assert.equal(one.message.includes("[已截断"), false, "文件 > 128KB，但请求片段完整");
    assert.equal(spot.stats.truncatedReads, 0);
    assert.equal(spot.stats.readBytes, lines[499]!.length + 1);

    // 请求整段（约 170KB）超过单文件 128KB 预算：按字节截断并如实标注。
    const whole = fixture(root);
    const all = await whole.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "large.txt", startLine: 1, endLine: 1000 }));
    assert.equal(all.ok, true);
    assert.match(all.message, /\[已截断：请求范围超过单文件\/总读取预算\]/);
    assert.match(all.message, /（第 1 行起）/);
    assert.equal(whole.stats.readBytes, 128 * 1024);
    assert.equal(whole.stats.truncatedReads, 1);

    // 行定位扫描上限：startLine 在超限区域内 ⇒ 如实拒绝（不猜测）。
    await writeFile(path.join(root, "scan.txt"), `${"aaaa\n".repeat(20)}bbbb\n`, "utf8");
    const scanned = fixture(root, { maxScanBytes: 10 });
    const far = await scanned.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "scan.txt", startLine: 3 }));
    assert.equal(far.ok, false);
    assert.match(far.message, /扫描上限/);
    assert.equal(scanned.stats.deniedReads, 0);
    const near = await scanned.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "scan.txt", startLine: 1, endLine: 1 }));
    assert.equal(near.ok, true, "起始行在扫描上限内仍可读");
    assert.match(near.message, /（第 1 行）/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("范围参数校验：负数/0/非整数/类型不符/混用/endLine<startLine 一律拒绝且不消耗调用预算", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "digits.txt"), "0123456789abcdef", "utf8");
    const { byName, stats } = fixture(root);
    const readTool = byName.get(SHELL_JUDGE_READ_TOOL)!;

    const invalidRanges: Record<string, unknown>[] = [
      { offset: -1 },
      { offset: 1.5 },
      { offset: Number.MAX_SAFE_INTEGER + 1 },
      { limit: 0 },
      { limit: -2 },
      { offset: "2" },
      { offset: null },
      { startLine: 0 },
      { endLine: 0 },
      { startLine: 1.5 },
      { startLine: "1" },
      { endLine: null },
      { startLine: 5, endLine: 2 },
      { offset: 0, startLine: 1 },
      { limit: 1, endLine: 2 },
    ];
    for (const range of invalidRanges) {
      const result = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "digits.txt", ...range }));
      assert.equal(result.ok, false, `范围 ${JSON.stringify(range)} 必须被拒绝`);
      assert.match(result.message, /范围参数非法/, `范围 ${JSON.stringify(range)} 应给出明确原因`);
      assert.equal(result.message.includes("0123456789abcdef"), false, "拒绝不得泄露文件内容");
    }
    assert.equal(stats.readCalls, 0, "非法参数不消耗调用预算（与 empty/invalid-path 同口径）");
    assert.equal(stats.readBytes, 0);
    assert.equal(stats.deniedReads, 0);
    assert.equal(stats.deniedPaths?.every((entry) => entry.code === "range-invalid"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("敏感路径/二进制/realpath/项目根检查不因范围参数被绕过", async () => {
  const root = await temp();
  const outside = await temp();
  try {
    await mkdir(path.join(root, ".ans", "sessions"), { recursive: true });
    await writeFile(path.join(root, ".env"), "ENV_SECRET", "utf8");
    await writeFile(path.join(root, ".ans", "sessions", "x.jsonl"), "SESSION_SECRET", "utf8");
    await writeFile(path.join(outside, "secret.txt"), "OUTSIDE_SECRET", "utf8");
    await symlink(outside, path.join(root, "escape"), "junction");
    await writeFile(path.join(root, "bin-head.bin"), Buffer.from([0x61, 0x00, 0x62, 0x63]));
    const lateNul = Buffer.from("a".repeat(10000), "utf8");
    lateNul[9000] = 0;
    await writeFile(path.join(root, "bin-late.bin"), lateNul);

    const { byName, stats } = fixture(root);
    const readTool = byName.get(SHELL_JUDGE_READ_TOOL)!;

    const env = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: ".env", offset: 1, limit: 2 }));
    assert.equal(env.ok, false);
    assert.match(env.message, /敏感/);
    assert.equal(env.message.includes("ENV_SECRET"), false);

    const privateRead = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: ".ans/sessions/x.jsonl", startLine: 1 }));
    assert.equal(privateRead.ok, false);
    assert.match(privateRead.message, /应用私有数据/);
    assert.equal(privateRead.message.includes("SESSION_SECRET"), false);

    const dotdot = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "../secret.txt", offset: 0, limit: 2 }));
    assert.equal(dotdot.ok, false);

    const escape = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "escape/secret.txt", offset: 0, limit: 2 }));
    assert.equal(escape.ok, false);
    assert.equal(escape.message.includes(outside), false, "拒绝文案不回显项目外绝对路径");
    assert.equal(escape.message.includes("OUTSIDE_SECRET"), false);

    const binaryHead = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "bin-head.bin", offset: 2, limit: 1 }));
    assert.equal(binaryHead.ok, false);
    assert.match(binaryHead.message, /二进制/);

    // 文件头 8KB 是文本、目标片段含 NUL：返回数据探针仍拒绝（不因 offset 绕过）。
    const binaryLate = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "bin-late.bin", offset: 9000, limit: 10 }));
    assert.equal(binaryLate.ok, false);
    assert.match(binaryLate.message, /二进制/);

    assert.equal(stats.readBytes, 0, "被拒读取不计入读取字节");
    // .env＝敏感 1、`..` 越界 1、链接外逃 1、两次二进制 2；app-private 不计入 deniedReads。
    assert.equal(stats.deniedReads, 5);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("预算计数：范围读取的 calls/bytes/truncated 与总预算耗尽语义", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "digits.txt"), "0123456789abcdef", "utf8");
    const { byName, stats } = fixture(root, { maxCalls: 8, maxBytes: 10, maxFileBytes: 10 });
    const readTool = byName.get(SHELL_JUDGE_READ_TOOL)!;

    const first = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "digits.txt", offset: 0, limit: 6 }));
    assert.equal(first.ok, true);
    assert.equal(first.message.includes("[已截断"), false);
    assert.equal(stats.readBytes, 6);
    assert.equal(stats.budgetExceeded, false);

    // 剩余总预算 4 字节 < 请求 6 字节 ⇒ 返回 4 字节、如实截断并置 budgetExceeded。
    const second = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "digits.txt", offset: 6, limit: 6 }));
    assert.equal(second.ok, true);
    assert.match(second.message, /（字节 6–9 \/ 共 16 字节）/);
    assert.match(second.message, /\[已截断：请求范围超过单文件\/总读取预算\]/);
    assert.equal(stats.readBytes, 10);
    assert.equal(stats.truncatedReads, 1);
    assert.equal(stats.budgetExceeded, true);

    const third = await readTool.handler(call(SHELL_JUDGE_READ_TOOL, { path: "digits.txt", offset: 10, limit: 1 }));
    assert.equal(third.ok, false);
    assert.match(third.message, /预算/);
    assert.equal(stats.readCalls, 3);
    assert.equal(stats.deniedReads, 0);

    // 调用次数预算：8 次小范围读取后第 9 次拒绝。
    const calls = fixture(root, { maxCalls: 8, maxBytes: 192 * 1024, maxFileBytes: 64 * 1024 });
    for (let index = 0; index < 8; index++) {
      const result = await calls.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "digits.txt", offset: 0, limit: 1 }));
      assert.equal(result.ok, true, `第 ${index + 1} 次范围读取应仍可用`);
    }
    const ninth = await calls.byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "digits.txt", offset: 1, limit: 1 }));
    assert.equal(ninth.ok, false);
    assert.match(ninth.message, /预算/);
    assert.equal(calls.stats.readCalls, 9);
    assert.equal(calls.stats.budgetExceeded, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("治理 judge 复用同一范围实现（read 工具与 shell judge 同源）", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "proposal.md"), "line-a\nline-b\nline-c\n", "utf8");
    const stats = freshStats();
    const byName = new Map(
      buildGovernanceJudgeTools({ projectRoot: root, report: () => {}, stats }).map((tool) => [tool.name, tool]),
    );
    const ranged = await byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "proposal.md", startLine: 2, endLine: 2 }));
    assert.equal(ranged.ok, true);
    assert.match(ranged.message, /（第 2 行）/);
    assert.match(ranged.message, /\n\nline-b\n$/);
    const byteRange = await byName.get(SHELL_JUDGE_READ_TOOL)!.handler(call(SHELL_JUDGE_READ_TOOL, { path: "proposal.md", offset: 0, limit: 6 }));
    assert.equal(byteRange.ok, true);
    assert.match(byteRange.message, /（字节 0–5 \/ 共 21 字节）/);
    assert.match(byteRange.message, /\n\nline-a$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("schema 同步：judge_read_file 暴露可选范围参数并写明「定点抽查」与「不得猜测」", () => {
  const read = describeTool(SHELL_JUDGE_READ_TOOL);
  assert.deepEqual(read.parameters.required, ["path"], "path 仍是唯一必填字段");
  const properties = read.parameters.properties as Record<string, { type?: string; minimum?: number }>;
  assert.deepEqual(Object.keys(properties).sort(), ["endLine", "limit", "offset", "path", "startLine"]);
  assert.equal(properties.offset?.type, "integer");
  assert.equal(properties.offset?.minimum, 0);
  assert.equal(properties.limit?.type, "integer");
  assert.equal(properties.limit?.minimum, 1);
  assert.equal(properties.startLine?.minimum, 1);
  assert.equal(properties.endLine?.minimum, 1);
  assert.match(read.description, /可按范围定点抽查/);
  assert.match(read.description, /字节与行参数|二选一/);
  assert.match(read.description, /不要猜测未返回的内容/);
  assert.match(read.description, /不算截断/);
  assert.equal(read.promptGuidelines?.some((line) => line.includes("定点抽查")), true);

  // judge_list_dir 保持现状：仍只有可选 path，不扩大可见面。
  const list = describeTool(SHELL_JUDGE_LIST_TOOL);
  assert.deepEqual(list.parameters.required, []);
  assert.deepEqual(Object.keys(list.parameters.properties as Record<string, unknown>), ["path"]);
});
