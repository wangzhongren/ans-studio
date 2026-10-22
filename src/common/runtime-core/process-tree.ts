// 平台分支的进程树终止（F-1-opt1；2026-10-22 从 provider/runtime/tools.ts **逐字搬迁**，run_shell 与
// 会话级后台任务管理器共用同一实现）。搬迁要求行为逐字等价：平台分支、taskkill 回退、异常不抛出均不变。
import { spawn } from "node:child_process";

/**
 * 平台分支的**进程树终止**（F-1-opt1）。
 * - POSIX：spawn 时 `detached:true` 使子进程成为**进程组组长**，按 `-pid` 向整组发信号
 *   （`npm test` 等派生的孙进程一并收掉，不留占端口/CPU 的孤儿）；组不可达（已退出/竞态）回退 `child.kill`。
 * - Windows：`taskkill /pid <pid> /T /F` 终止整棵树；taskkill 不可用时回退 `child.kill`。
 * 任何失败都不抛出——收口交由 close / 清理计时器（既有两条路径语义不变）。
 */
export function killProcessTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals, useProcessGroup: boolean, env: Record<string, string>): void {
  if (process.platform === "win32") {
    const pid = child.pid;
    if (pid !== undefined) {
      try {
        const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", env });
        killer.on("error", () => { try { child.kill(signal); } catch { /* 已退出 */ } });
        return;
      } catch { /* 回退直接子进程 */ }
    }
    try { child.kill(signal); } catch { /* 已退出 */ }
    return;
  }
  if (useProcessGroup && child.pid !== undefined) {
    try { process.kill(-child.pid, signal); return; } catch { /* 组不可达 → 回退 */ }
  }
  try { child.kill(signal); } catch { /* 已退出 */ }
}
