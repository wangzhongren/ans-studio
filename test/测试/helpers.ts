// 测试角色:跨角色联调测试辅助
// 归属:test/测试/(测试角色边界 Section 1)。不得被产品代码引用。
// 只做"驱动真实入口/真实服务"的辅助,不做任何路径判定——判定一律由受测产品代码完成。

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根:本文件位于 <root>/test/测试/。 */
export const REPO_ROOT = path.resolve(HERE, "..", "..");

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** 以子进程驱动**真实入口** node bin/ans.js,记录真实退出码与输出。 */
export function runCli(argv: string[]): RunResult {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, "bin", "ans.js"), ...argv], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
