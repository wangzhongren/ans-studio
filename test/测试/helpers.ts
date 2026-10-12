// 测试角色:跨角色联调测试辅助
// 归属:test/测试/(测试角色边界 Section 1)。不得被产品代码引用。
// 只做"驱动真实入口/真实服务"的辅助,不做任何路径判定——判定一律由受测产品代码完成。

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// §一.5 共享组件：凭据变量集合的单一来源（只读导入、不复制实现）。
import { PI_CREDENTIAL_ENV_VARS } from "../../src/common/shared/runtime-shared.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根:本文件位于 <root>/test/测试/。 */
export const REPO_ROOT = path.resolve(HERE, "..", "..");

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * `runCli` 的子进程环境（默认**擦洗**；2026-10-12 客户批准，提案见
 * `角色卡/测试/docs/fix/2026-10-12_fix_runcli-credential-leak-and-govern-cli-cases.md`）：
 * 剔除 ① Pi 凭据变量（`PI_CREDENTIAL_ENV_VARS`，单一来源 `src/common/shared/runtime-shared.ts`）
 * ② 所有 `ANS_PI_` 前缀键 ③ `ANS_RUNTIME`（否则会把 role run 从演示切到真实适配器）。
 * 其余变量（PATH/HOME 等）原样。目的：**跑测机器上碰巧有凭据或运行时开关，不影响自动用例**——
 * 绝不发真实模型请求，结果与环境无关（缺 base URL 在会话开启时即明确失败，先于任何网络请求）。
 */
function scrubbedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of PI_CREDENTIAL_ENV_VARS) {
    delete env[k];
  }
  for (const k of Object.keys(env)) {
    if (k.startsWith("ANS_PI_")) delete env[k];
  }
  delete env.ANS_RUNTIME;
  return env;
}

/** 以子进程驱动**真实入口** node bin/ans.js,记录真实退出码与输出。 */
export function runCli(argv: string[]): RunResult {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, "bin", "ans.js"), ...argv], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: scrubbedEnv(),
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
