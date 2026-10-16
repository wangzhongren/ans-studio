// test/测试/g5-reasoning-verify/helpers.ts —— G-5 独立验证共用夹具。
// 只做「驱动真实入口」的辅助，不做判定；判定一律写入各域测试文件。

import type { RuntimeAdapter, RuntimeProviderOptions, SessionEvent, RuntimeKind } from "../../../src/model/runtime.ts";
import type { ResolvedRole } from "../../../src/model/role.ts";

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
