import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractRuntimeArg,
  resolveRuntime,
  hasPiCredential,
  DEFAULT_RUNTIME,
  PI_CREDENTIAL_ENV_VARS,
} from "../../src/common/装配/runtime.ts";

test("extractRuntimeArg：抽出 --runtime <值> 并从 argv 剔除（两段式）", () => {
  const { argv, flag } = extractRuntimeArg([
    "role",
    "run",
    "编排",
    "--task",
    "T-1",
    "--runtime",
    "pi",
  ]);
  assert.deepEqual(argv, ["role", "run", "编排", "--task", "T-1"]);
  assert.deepEqual(flag, { present: true, value: "pi" });
});

test("extractRuntimeArg：支持 --runtime=<值> 等号写法，任意位置", () => {
  const { argv, flag } = extractRuntimeArg(["--runtime=demo", "doctor"]);
  assert.deepEqual(argv, ["doctor"]);
  assert.deepEqual(flag, { present: true, value: "demo" });
});

test("extractRuntimeArg：未出现时为 present:false；出现但缺值为空串", () => {
  assert.deepEqual(extractRuntimeArg(["doctor"]).flag, { present: false, value: "" });
  assert.deepEqual(extractRuntimeArg(["doctor", "--runtime"]).flag, {
    present: true,
    value: "",
  });
});

test("resolveRuntime：命令行 > 环境变量 > 默认", () => {
  // 命令行给定：来源 argv，压过环境变量。
  assert.deepEqual(resolveRuntime({ present: true, value: "pi" }, { ANS_RUNTIME: "demo" }), {
    ok: true,
    selection: { runtime: "pi", source: "argv" },
  });
  // 仅环境变量：来源 env。
  assert.deepEqual(resolveRuntime({ present: false, value: "" }, { ANS_RUNTIME: "pi" }), {
    ok: true,
    selection: { runtime: "pi", source: "env" },
  });
  // 都没有：默认 demo。
  assert.deepEqual(resolveRuntime({ present: false, value: "" }, {}), {
    ok: true,
    selection: { runtime: DEFAULT_RUNTIME, source: "default" },
  });
  assert.equal(DEFAULT_RUNTIME, "demo");
});

test("resolveRuntime：非法取值（含缺值）一律 ok:false，不静默忽略", () => {
  assert.equal(resolveRuntime({ present: true, value: "bogus" }, {}).ok, false);
  assert.equal(resolveRuntime({ present: true, value: "" }, {}).ok, false);
  assert.equal(resolveRuntime({ present: false, value: "" }, { ANS_RUNTIME: "bogus" }).ok, false);
  // 空串环境变量视为未设置 → 默认。
  assert.deepEqual(resolveRuntime({ present: false, value: "" }, { ANS_RUNTIME: "" }), {
    ok: true,
    selection: { runtime: "demo", source: "default" },
  });
});

test("hasPiCredential：任一凭据变量非空即为真，空白视为无", () => {
  assert.equal(hasPiCredential({}), false);
  assert.ok(PI_CREDENTIAL_ENV_VARS.length > 0);
  assert.equal(hasPiCredential({ ANTHROPIC_API_KEY: "sk-xxx" }), true);
  assert.equal(hasPiCredential({ OPENAI_API_KEY: "   " }), false);
  assert.equal(hasPiCredential({ GEMINI_API_KEY: "" }), false);
});
