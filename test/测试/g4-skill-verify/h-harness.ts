// test/测试/g4-skill-verify/h-harness.ts —— H 域（范围审计）行为侧专用小夹具。
//
// 独立构造：真实 `openRoleSession` 装配（真 buildGovernedTools/真能力透传），自建 demo provider 桩
// （只钉「tools 面拿到什么」与「prompt 里手驱一趟工具」，不跑真实模型）。

import type { RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent, ToolDefinition } from "../../../src/model/runtime.ts";
import type { ProjectConfig } from "../../../src/model/role.ts";

/** 创世态 su 项目（同 c-preauth 口径：治理种子边界）。 */
export function genesisSuProject(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    builtInRoles: ["su"],
    genesisBootstrap: { source: "G-4 独立验证：客户导入空项目" },
  };
}

/** 普通项目：角色 X 自己的边界＋已接受证据（非创世）。 */
export function projectWithRoleX(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "G-4 独立验证夹具" } },
  };
}

function eventQueue() {
  const pending: SessionEvent[] = [];
  let waiter: (() => void) | undefined;
  let closed = false;
  return {
    push(event: SessionEvent): void {
      pending.push(event);
      waiter?.();
      waiter = undefined;
    },
    close(): void {
      closed = true;
      waiter?.();
      waiter = undefined;
    },
    async *events(): AsyncIterable<SessionEvent> {
      for (;;) {
        if (pending.length > 0) {
          yield pending.shift()!;
          continue;
        }
        if (closed) return;
        await new Promise<void>((resolve) => { waiter = resolve; });
      }
    },
  };
}

/** demo provider 桩：捕获 tools 面；prompt 时执行 `work(options)`；随后 settled 收尾。 */
export function stubDemoProvider(opts: {
  onTools?: (tools: readonly ToolDefinition[]) => void;
  work: (options: RuntimeProviderOptions) => Promise<void>;
}): { factory: RuntimeProviderFactory } {
  const factory: RuntimeProviderFactory = (options) => {
    opts.onTools?.(options.tools);
    options.registerToolDisplayProfile?.({ credentials: [] });
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole() {
        const events = eventQueue();
        return {
          runtime: options.runtime,
          get contextSource() { return "in-memory" as const; },
          get nativeSessionId() { return undefined; },
          get contextWarning() { return undefined; },
          async prompt(): Promise<void> {
            await opts.work(options);
            events.push({ kind: "settled", summary: "引擎收尾", turnId: options.currentTurnId?.(), detail: { outcome: "completed" } } as SessionEvent);
          },
          events: () => events.events(),
          async dispose(): Promise<void> {
            events.close();
          },
        };
      },
    };
  };
  return { factory };
}
