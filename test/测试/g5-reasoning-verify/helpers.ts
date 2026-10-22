// test/测试/g5-reasoning-verify/helpers.ts —— G-5 独立验证共用夹具。
// 只做「驱动真实入口」的辅助，不做判定；判定一律写入各域测试文件。

import { rm } from "node:fs/promises";
import type { RuntimeAdapter, RuntimeProviderOptions, SessionEvent, RuntimeKind } from "../../../src/model/runtime.ts";
import type { ResolvedRole } from "../../../src/model/role.ts";

/**
 * 清理测试临时目录，带**有界**异步重试。
 *
 * Windows CI（v1.5.0 run 39702128045）实证：`session.dispose()`/`observed.done` 返回后，
 * 子进程收尾、实时防护或索引器仍可能在极短时间内持有目录句柄，teardown 的 `rm` 随即抛
 * `EBUSY: resource busy or locked, rmdir ...`。这些是操作系统层面的瞬时占用：句柄一释放，
 * 同一删除即可成功；因此在**测试夹具**内有界重试不掩盖任何产品/断言失败：
 * - 只重试瞬时码（EBUSY/ENOTEMPTY/EPERM/EACCES/EMFILE/ENFILE，同 Node `fs.rm` 的瞬时集合）；
 * - 其它错误立即上抛；
 * - 上界耗尽仍失败则带 cause 上抛，绝不把清理失败伪装成成功。
 * 用异步 `rm` + 异步退避（不阻塞事件循环），给待收尾的句柄留出释放时间。
 */
export async function removeTempDirEventually(dir: string, attempts = 20, delayMs = 100): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return; // force 通常已吞掉；兜底并发删除
      if (code !== "EBUSY" && code !== "ENOTEMPTY" && code !== "EPERM" && code !== "EACCES"
          && code !== "EMFILE" && code !== "ENFILE") throw error;
      lastError = error;
      if (attempt < attempts) await new Promise<void>(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(
    `清理临时目录失败（已重试 ${attempts} 次）：${dir}${lastError instanceof Error ? `：${lastError.message}` : ""}`,
    { cause: lastError },
  );
}

export function makeRole(id: string): ResolvedRole {
  return {
    id,
    kind: "project",
    cardText: `# ${id}`,
    boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
    boundarySource: "fixture",
    location: { card: "fixture", boundary: "fixture" },
  };
}

/** 简单闩：push/end 唤醒等待者。 */
export function latch() {
  let waiters: Array<() => void> = [];
  const wake = () => { const current = waiters; waiters = []; for (const fn of current) fn(); };
  return { wake, wait: () => new Promise<void>((resolve) => { waiters.push(resolve); }) };
}

/**
 * 自建「与会话发射器」假适配器：bindRole 注册空展示档案（满足 assertReady），prompt 触发脚本，
 * 脚本经 push 注入**原始** SessionEvent（无 turnId——pump 会补），end 结束事件流。
 * 用于验证 Service 的 emit 投影单点（B 域）。
 */
export function emittingAdapter(options: RuntimeProviderOptions, script: (push: (event: SessionEvent) => void, end: () => void) => void): RuntimeAdapter {
  return {
    async composeContext() { return { systemPrompt: "" }; },
    async bindRole(_role: ResolvedRole) {
      options.registerToolDisplayProfile?.({ credentials: [] });
      const queue: SessionEvent[] = [];
      let ended = false;
      const signal = latch();
      return {
        async prompt(): Promise<void> {
          const push = (event: SessionEvent) => { queue.push(event); signal.wake(); };
          script(push, () => { ended = true; signal.wake(); });
        },
        events() {
          return (async function* () {
            for (;;) {
              while (queue.length > 0) yield queue.shift()!;
              if (ended) return;
              await signal.wait();
            }
          })();
        },
        async dispose(): Promise<void> { ended = true; signal.wake(); },
      };
    },
  };
}

/** 诊断假记录器（结构化收集 record 调用）。 */
export function fakeDiagnostics(sink: Array<{ event: string; fields: Record<string, unknown> }>) {
  return {
    record(event: string, fields?: Record<string, unknown>) { sink.push({ event, fields: fields ?? {} }); },
    error(event: string, error: unknown, fields?: Record<string, unknown>) { sink.push({ event, fields: { ...(fields ?? {}), error: String(error) } }); },
  };
}

export const RUNTIMES: readonly RuntimeKind[] = ["claude", "codex", "pi"];
