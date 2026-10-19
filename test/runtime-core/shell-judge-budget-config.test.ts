// shell judge 读取预算配置（2026-10-19 真机缺陷）：
// 默认值放宽、env 覆盖（正整数/上下限校验、非法回落）、显式预算优先，
// 以及单次判断会话内的读取缓存（复用结果但仍按原口径计预算）。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  SHELL_JUDGE_BUDGET_LIMITS,
  SHELL_JUDGE_DEFAULT_BUDGET,
  SHELL_JUDGE_MAX_BYTES_ENV,
  SHELL_JUDGE_MAX_CALLS_ENV,
  SHELL_JUDGE_MAX_FILE_BYTES_ENV,
  resolveShellJudgeBudget,
} from "../../src/common/runtime-core/shell-judge/policy.ts";
import {
  SHELL_JUDGE_READ_TOOL,
  buildShellJudgeTools,
} from "../../src/common/runtime-core/shell-judge/tools.ts";
import type { ShellJudgeReadStats } from "../../src/model/runtime.ts";

const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-judge-budget-"));

const BUDGET_ENVS = [SHELL_JUDGE_MAX_CALLS_ENV, SHELL_JUDGE_MAX_BYTES_ENV, SHELL_JUDGE_MAX_FILE_BYTES_ENV] as const;

function freshStats(): ShellJudgeReadStats {
  return { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false };
}

const call = (args: Record<string, unknown>) => ({ name: SHELL_JUDGE_READ_TOOL, args });

function fixture(
  root: string,
  budget?: { maxCalls?: number; maxBytes?: number; maxFileBytes?: number; maxScanBytes?: number },
) {
  const stats = freshStats();
  const tools = buildShellJudgeTools({ projectRoot: root, report: () => {}, stats, ...(budget !== undefined ? { budget } : {}) });
  return { byName: new Map(tools.map((tool) => [tool.name, tool])), read: tools.find((tool) => tool.name === SHELL_JUDGE_READ_TOOL)!, stats };
}

/** 清空三个预算环境变量并在结束时恢复（断言不依赖本机/CI 环境）。 */
async function withCleanBudgetEnv(body: () => Promise<void>): Promise<void> {
  const saved = BUDGET_ENVS.map((name) => [name, process.env[name]] as const);
  try {
    for (const name of BUDGET_ENVS) delete process.env[name];
    await body();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("默认预算放宽为 12 次 / 512KB 总量 / 128KB 单文件（有限值，超限仍 fail-closed）", async () => {
  assert.equal(SHELL_JUDGE_DEFAULT_BUDGET.maxCalls, 12);
  assert.equal(SHELL_JUDGE_DEFAULT_BUDGET.maxBytes, 512 * 1024);
  assert.equal(SHELL_JUDGE_DEFAULT_BUDGET.maxFileBytes, 128 * 1024);
  assert.equal(SHELL_JUDGE_DEFAULT_BUDGET.maxScanBytes, 8 * 1024 * 1024);

  await withCleanBudgetEnv(async () => {
    const root = await temp();
    try {
      await writeFile(path.join(root, "big.txt"), "a".repeat(130 * 1024), "utf8");
      await writeFile(path.join(root, "small.txt"), "hi", "utf8");

      const big = fixture(root);
      const bigResult = await big.read.handler(call({ path: "big.txt" }));
      assert.equal(bigResult.ok, true);
      assert.match(bigResult.message, /\[已截断/);
      assert.equal(big.stats.readBytes, 128 * 1024);
      assert.equal(big.stats.truncatedReads, 1);

      const calls = fixture(root);
      for (let index = 0; index < 12; index++) {
        const result = await calls.read.handler(call({ path: "small.txt" }));
        assert.equal(result.ok, true, `默认预算下第 ${index + 1} 次读取应仍可用`);
      }
      const thirteenth = await calls.read.handler(call({ path: "small.txt" }));
      assert.equal(thirteenth.ok, false, "第 13 次读取必须 fail-closed");
      assert.match(thirteenth.message, /预算/);
      assert.equal(calls.stats.readCalls, 13);
      assert.equal(calls.stats.budgetExceeded, true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("env 覆盖生效：ANS_SHELL_JUDGE_MAX_CALLS / MAX_FILE_BYTES / MAX_BYTES", async () => {
  await withCleanBudgetEnv(async () => {
    const root = await temp();
    try {
      await writeFile(path.join(root, "small.txt"), "hi", "utf8");
      await writeFile(path.join(root, "four-k.txt"), "b".repeat(4096), "utf8");
      await writeFile(path.join(root, "five-k.txt"), "c".repeat(5000), "utf8");

      process.env[SHELL_JUDGE_MAX_CALLS_ENV] = "3";
      const calls = fixture(root);
      for (let index = 0; index < 3; index++) {
        const result = await calls.read.handler(call({ path: "small.txt" }));
        assert.equal(result.ok, true, `env 调低后第 ${index + 1} 次读取应仍可用`);
      }
      const fourth = await calls.read.handler(call({ path: "small.txt" }));
      assert.equal(fourth.ok, false);
      assert.match(fourth.message, /预算/);
      assert.equal(calls.stats.readCalls, 4);
      delete process.env[SHELL_JUDGE_MAX_CALLS_ENV];

      process.env[SHELL_JUDGE_MAX_FILE_BYTES_ENV] = "4096";
      const fileBytes = fixture(root);
      const clipped = await fileBytes.read.handler(call({ path: "five-k.txt" }));
      assert.equal(clipped.ok, true);
      assert.match(clipped.message, /\[已截断/);
      assert.equal(fileBytes.stats.readBytes, 4096, "env 单文件上限生效");
      delete process.env[SHELL_JUDGE_MAX_FILE_BYTES_ENV];

      process.env[SHELL_JUDGE_MAX_BYTES_ENV] = "6000";
      process.env[SHELL_JUDGE_MAX_FILE_BYTES_ENV] = "4096";
      const total = fixture(root);
      const first = await total.read.handler(call({ path: "four-k.txt" }));
      assert.equal(first.ok, true);
      assert.equal(first.message.includes("[已截断"), false);
      const second = await total.read.handler(call({ path: "five-k.txt" }));
      assert.equal(second.ok, true);
      assert.match(second.message, /\[已截断/);
      assert.equal(total.stats.readBytes, 6000, "env 总量上限生效：第二次只余 1904 字节");
      assert.equal(total.stats.budgetExceeded, true);
      const third = await total.read.handler(call({ path: "five-k.txt" }));
      assert.equal(third.ok, false);
      assert.match(third.message, /预算/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("env 校验：正整数且在上下限内生效；非法/越界回落缺省（不静默夹取）", () => {
  const defaults = SHELL_JUDGE_DEFAULT_BUDGET;
  const one = (name: string, value: string) => resolveShellJudgeBudget(undefined, { [name]: value });

  // 调用次数：1..64。
  assert.equal(SHELL_JUDGE_BUDGET_LIMITS.maxCalls.min, 1);
  assert.equal(SHELL_JUDGE_BUDGET_LIMITS.maxCalls.max, 64);
  assert.equal(one(SHELL_JUDGE_MAX_CALLS_ENV, "1").maxCalls, 1);
  assert.equal(one(SHELL_JUDGE_MAX_CALLS_ENV, "64").maxCalls, 64);
  for (const bad of ["0", "-1", "+3", "abc", "1.5", "1e3", "", " 3x", "65", "999999999"]) {
    assert.equal(one(SHELL_JUDGE_MAX_CALLS_ENV, bad).maxCalls, defaults.maxCalls, `非法 maxCalls=${JSON.stringify(bad)} 必须回落缺省`);
  }

  // 单文件字节：KiB..4MiB。
  assert.equal(one(SHELL_JUDGE_MAX_FILE_BYTES_ENV, "1024").maxFileBytes, 1024);
  assert.equal(one(SHELL_JUDGE_MAX_FILE_BYTES_ENV, String(4 * 1024 * 1024)).maxFileBytes, 4 * 1024 * 1024);
  for (const bad of ["0", "1023", String(4 * 1024 * 1024 + 1), "1.5", "64KB"]) {
    assert.equal(one(SHELL_JUDGE_MAX_FILE_BYTES_ENV, bad).maxFileBytes, defaults.maxFileBytes, `非法 maxFileBytes=${bad} 必须回落缺省`);
  }

  // 总量字节：KiB..16MiB。
  assert.equal(one(SHELL_JUDGE_MAX_BYTES_ENV, "1024").maxBytes, 1024);
  assert.equal(one(SHELL_JUDGE_MAX_BYTES_ENV, String(16 * 1024 * 1024)).maxBytes, 16 * 1024 * 1024);
  for (const bad of ["0", "1023", String(16 * 1024 * 1024 + 1), "10MB"]) {
    assert.equal(one(SHELL_JUDGE_MAX_BYTES_ENV, bad).maxBytes, defaults.maxBytes, `非法 maxBytes=${bad} 必须回落缺省`);
  }

  // 显式字段优先于 env；maxScanBytes 无 env 覆盖、保持缺省。
  const explicitWins = resolveShellJudgeBudget({ maxCalls: 5 }, { [SHELL_JUDGE_MAX_CALLS_ENV]: "2" });
  assert.equal(explicitWins.maxCalls, 5);
  assert.equal(resolveShellJudgeBudget(undefined, {}).maxScanBytes, defaults.maxScanBytes);
  assert.deepEqual(resolveShellJudgeBudget(undefined, {}), { ...defaults }, "无显式/无 env 时与缺省完全一致");
});

test("显式 budget 优先于 env（宿主注入不被环境变量意外覆盖）", async () => {
  await withCleanBudgetEnv(async () => {
    process.env[SHELL_JUDGE_MAX_CALLS_ENV] = "2";
    const root = await temp();
    try {
      await writeFile(path.join(root, "small.txt"), "hi", "utf8");
      const { read, stats } = fixture(root, { maxCalls: 4 });
      for (let index = 0; index < 4; index++) {
        const result = await read.handler(call({ path: "small.txt" }));
        assert.equal(result.ok, true, `显式 maxCalls=4 时第 ${index + 1} 次读取应仍可用`);
      }
      const fifth = await read.handler(call({ path: "small.txt" }));
      assert.equal(fifth.ok, false);
      assert.match(fifth.message, /预算/);
      assert.equal(stats.readCalls, 5);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("会话内读取缓存：同路径+同范围复用结果不再读盘，预算/统计口径不变", async () => {
  const root = await temp();
  try {
    const content = "cached-content";
    await writeFile(path.join(root, "data.txt"), content, "utf8");
    const { read, stats } = fixture(root);

    const first = await read.handler(call({ path: "data.txt" }));
    assert.equal(first.ok, true);
    // 删除磁盘文件：若第二次仍成功，证明命中会话缓存、没有再次读盘。
    await rm(path.join(root, "data.txt"));
    const second = await read.handler(call({ path: "data.txt" }));
    assert.equal(second.ok, true, "同一路径+同一范围应命中会话缓存");
    assert.equal(second.message, first.message, "命中返回与首次逐字相同的回执");
    assert.deepEqual(stats.readPaths, ["data.txt"]);
    assert.equal(stats.readCalls, 2, "命中仍计调用预算（既有计数语义不变）");
    assert.equal(stats.readBytes, content.length * 2, "命中仍按首次字节数计总预算（不是免费读取）");

    // 不同范围是不同缓存键，文件已删除 ⇒ 真实读取 not-found（缓存只复用完全相同的读取）。
    const otherRange = await read.handler(call({ path: "data.txt", offset: 0, limit: 3 }));
    assert.equal(otherRange.ok, false);
    assert.match(otherRange.message, /不存在/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("缓存按判断会话隔离：不跨 buildShellJudgeTools 实例", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "data.txt"), "only-once", "utf8");
    const first = fixture(root);
    const ok = await first.read.handler(call({ path: "data.txt" }));
    assert.equal(ok.ok, true);
    await rm(path.join(root, "data.txt"));

    const second = fixture(root);
    const miss = await second.read.handler(call({ path: "data.txt" }));
    assert.equal(miss.ok, false, "缓存不跨判断会话共享");
    assert.match(miss.message, /不存在/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("缓存命中不得绕过剩余总预算：不足时回落真实读取并按 remaining 截断", async () => {
  await withCleanBudgetEnv(async () => {
    const root = await temp();
    try {
      await writeFile(path.join(root, "ten.txt"), "0123456789", "utf8");
      const { read, stats } = fixture(root, { maxCalls: 5, maxBytes: 12, maxFileBytes: 100 });

      const first = await read.handler(call({ path: "ten.txt" }));
      assert.equal(first.ok, true);
      assert.equal(stats.readBytes, 10);

      // 剩余 2 字节 < 缓存条目 10 字节 ⇒ 不使用缓存，真实读取按 remaining 截断。
      const second = await read.handler(call({ path: "ten.txt" }));
      assert.equal(second.ok, true);
      assert.match(second.message, /\[已截断/);
      assert.match(second.message, /\n\n01\n\n\[已截断/);
      assert.equal(stats.readBytes, 12);
      assert.equal(stats.truncatedReads, 1);
      assert.equal(stats.budgetExceeded, true);

      const third = await read.handler(call({ path: "ten.txt" }));
      assert.equal(third.ok, false);
      assert.match(third.message, /预算/);
      assert.equal(stats.readCalls, 3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("拒绝结果不缓存：会话中途新建的文件可被后续读取（无负缓存）", async () => {
  const root = await temp();
  try {
    const { read, stats } = fixture(root);
    const missing = await read.handler(call({ path: "later.txt" }));
    assert.equal(missing.ok, false);
    assert.match(missing.message, /不存在/);

    await writeFile(path.join(root, "later.txt"), "now-exists", "utf8");
    const found = await read.handler(call({ path: "later.txt" }));
    assert.equal(found.ok, true, "首次 not-found 不得被缓存成持续拒绝");
    assert.match(found.message, /now-exists/);
    assert.equal(stats.readCalls, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("缓存有界：超过条目上限按插入顺序淘汰最旧结果", async () => {
  await withCleanBudgetEnv(async () => {
    const root = await temp();
    try {
      const files = 30;
      for (let index = 0; index < files; index++) {
        await writeFile(path.join(root, `f-${index}.txt`), String(index), "utf8");
      }
      const { read, stats } = fixture(root, { maxCalls: 64 });
      for (let index = 0; index < files; index++) {
        const result = await read.handler(call({ path: `f-${index}.txt` }));
        assert.equal(result.ok, true);
      }
      for (let index = 0; index < files; index++) await rm(path.join(root, `f-${index}.txt`));

      // 最近 24 条（f-6..f-29）仍在缓存；最旧的 f-0 已被淘汰 ⇒ 真实读取 not-found。
      const evicted = await read.handler(call({ path: "f-0.txt" }));
      assert.equal(evicted.ok, false, "超出条目上限后最旧缓存必须被淘汰（缓存有界）");
      assert.match(evicted.message, /不存在/);
      const retained = await read.handler(call({ path: "f-29.txt" }));
      assert.equal(retained.ok, true, "最近读取的条目仍在缓存内");
      assert.equal(stats.readCalls, files + 2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
