import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

import { resolveProjectRoot } from "../../src/index.ts";
import {
  resolveEntryTimeoutMs,
  DEFAULT_ENTRY_TIMEOUT_MS,
  ENTRY_TIMEOUT_ENV,
} from "../../src/common/装配/entry-timeout.ts";
import { PI_CREDENTIAL_ENV_VARS } from "../../src/common/装配/runtime.ts";

const PROJECT_ROOT = resolveProjectRoot();
const BIN = path.join(PROJECT_ROOT, "bin", "ans.js");

/** 干净环境：去掉凭据与运行时覆盖，保证测试确定性。 */
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of PI_CREDENTIAL_ENV_VARS) delete env[name];
  delete env.ANS_RUNTIME;
  delete env[ENTRY_TIMEOUT_ENV];
  return env;
}

/** 运行真实入口，返回退出码/信号/输出。timeout 用于兜底：挂起会被杀，signal 非 null。 */
function runEntry(args: string[], env: NodeJS.ProcessEnv = cleanEnv()) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 30_000,
    env,
  });
}

test("resolveEntryTimeoutMs：默认 5 分钟，合法覆盖生效，非法值回退默认", () => {
  assert.equal(DEFAULT_ENTRY_TIMEOUT_MS, 300_000);
  assert.equal(resolveEntryTimeoutMs({}), DEFAULT_ENTRY_TIMEOUT_MS);
  assert.equal(resolveEntryTimeoutMs({ [ENTRY_TIMEOUT_ENV]: "1500" }), 1500);
  // 非法：非数字 / 0 / 负 / 空白 → 回退默认，绝不放行“立即超时”。
  assert.equal(resolveEntryTimeoutMs({ [ENTRY_TIMEOUT_ENV]: "abc" }), DEFAULT_ENTRY_TIMEOUT_MS);
  assert.equal(resolveEntryTimeoutMs({ [ENTRY_TIMEOUT_ENV]: "0" }), DEFAULT_ENTRY_TIMEOUT_MS);
  assert.equal(resolveEntryTimeoutMs({ [ENTRY_TIMEOUT_ENV]: "-5" }), DEFAULT_ENTRY_TIMEOUT_MS);
  assert.equal(resolveEntryTimeoutMs({ [ENTRY_TIMEOUT_ENV]: "   " }), DEFAULT_ENTRY_TIMEOUT_MS);
});

test("入口确定性收敛：doctor 不挂起、以 0 退出、无 unsettled TLA 警告", () => {
  const r = runEntry(["doctor"]);
  assert.equal(r.signal, null, "入口不应超时被杀（即应自行收敛）");
  assert.equal(r.status, 0, `doctor 应 0 退出，实际 ${r.status}；stderr=${r.stderr}`);
  assert.match(r.stdout, /装配自检/);
  assert.ok(
    !(r.stderr ?? "").includes("unsettled top-level await"),
    "不应出现 unsettled top-level await 警告",
  );
});

test("入口退出码可靠：--help 以 0 退出", () => {
  const r = runEntry(["--help"]);
  assert.equal(r.signal, null);
  assert.equal(r.status, 0, `实际 ${r.status}；stderr=${r.stderr}`);
});

test("入口退出码可靠：无凭据的 pi 路径以非 0 退出（真实结果，非默认 0）", () => {
  const r = runEntry(["role", "run", "编排", "--task", "T-1", "--runtime", "pi"]);
  assert.equal(r.signal, null, "入口不应超时被杀");
  assert.notEqual(r.status, 0, `应非 0 退出，实际 ${r.status}`);
  assert.match(r.stderr, /凭据/);
});

test("入口退出码可靠：demo 路径以 0 退出且无警告", () => {
  const r = runEntry(["role", "run", "编排", "--task", "T-1", "--runtime", "demo"]);
  assert.equal(r.signal, null);
  assert.equal(r.status, 0, `实际 ${r.status}；stderr=${r.stderr}`);
  assert.match(r.stdout, /\[settled\]/);
  assert.ok(!(r.stderr ?? "").includes("unsettled top-level await"));
});
