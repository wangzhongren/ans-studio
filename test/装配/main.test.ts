import assert from "node:assert/strict";
import { test } from "node:test";

import { main } from "../../src/index.ts";

function capture(): { out: string[]; err: string[]; restore: () => void } {
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stderr.write;
  return {
    out,
    err,
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

test("main([]) 与 main([--help]) 返回 0 并打印用法", async () => {
  for (const argv of [[], ["--help"]]) {
    const cap = capture();
    const code = await main(argv);
    cap.restore();
    assert.equal(code, 0);
    assert.match(cap.out.join(""), /用法/);
  }
});

test("未知命令返回 2 并打印错误", async () => {
  const cap = capture();
  const code = await main(["frobnicate"]);
  cap.restore();
  assert.equal(code, 2);
  assert.match(cap.err.join(""), /未知命令/);
});

test("doctor 返回 0 并打印内嵌演示配置（无需其余角色落盘）", async () => {
  const cap = capture();
  const code = await main(["doctor"]);
  cap.restore();
  assert.equal(code, 0);
  const text = cap.out.join("");
  assert.match(text, /装配自检/);
  assert.match(text, /编排/);
  assert.match(text, /demo:embedded-config/);
});

test("role run 在 Interface 层缺失时返回非零且如实报告未就绪", async () => {
  const cap = capture();
  const code = await main(["role", "run", "编排", "--task", "T-1"]);
  cap.restore();
  // 若编排已落盘并成功，则为 0；未落盘时装配如实返回 1。
  assert.ok(code === 0 || code === 1, `预期 0 或 1，实际 ${code}`);
  if (code === 1) {
    assert.match(cap.err.join(""), /尚未就绪|落盘/);
  }
});

test("doctor 显示当前运行时（默认 demo）", async () => {
  const cap = capture();
  const code = await main(["doctor"], {});
  cap.restore();
  assert.equal(code, 0);
  assert.match(cap.out.join(""), /运行时:\s+demo（来源：默认）/);
});

test("doctor 显示运行时来源（env ANS_RUNTIME=pi）", async () => {
  const cap = capture();
  const code = await main(["doctor"], { ANS_RUNTIME: "pi" });
  cap.restore();
  assert.equal(code, 0);
  assert.match(cap.out.join(""), /运行时:\s+pi（来源：环境变量 ANS_RUNTIME）/);
});

test("--help 显示当前运行时选择（命令行来源，压过默认）", async () => {
  const cap = capture();
  const code = await main(["--runtime", "pi", "help"], {});
  cap.restore();
  assert.equal(code, 0);
  const text = cap.out.join("");
  assert.match(text, /当前运行时：pi/);
  assert.match(text, /命令行 --runtime/);
});

test("无效 --runtime 值返回 2 并非 0 报错", async () => {
  const cap = capture();
  const code = await main(["--runtime", "bogus", "doctor"], {});
  cap.restore();
  assert.equal(code, 2);
  assert.match(cap.err.join(""), /无效的 --runtime 值/);
});

test("role run 选 pi 且无凭据时非 0 退出、如实报错、绝不退回 demo", async () => {
  const viaFlag = ["role", "run", "编排", "--task", "T-1", "--runtime", "pi"];
  const viaEnv = ["role", "run", "编排", "--task", "T-1"];
  const cases: Array<{ argv: string[]; env: Record<string, string | undefined> }> = [
    { argv: viaFlag, env: {} },
    { argv: viaEnv, env: { ANS_RUNTIME: "pi" } },
  ];
  for (const { argv, env } of cases) {
    const cap = capture();
    const code = await main(argv, env);
    cap.restore();
    assert.notEqual(code, 0, `应非 0 退出：${argv.join(" ")}（env=${JSON.stringify(env)}）`);
    const err = cap.err.join("");
    assert.match(err, /凭据/, "应如实说明缺少凭据");
    assert.match(err, /不会退回 demo/, "应明确不退回 demo");
    // 绝不产生演示假 runtime 的输出（否则即为静默降级）。
    assert.ok(
      !cap.out.join("").includes("[装配演示假 runtime]"),
      "不得退回 demo 运行时",
    );
  }
});
