// 装配私有：演示用“假 runtime”。
//
// 定位（与契约对齐）：
//  - §4 里 Provider 的 createFakeRuntimeAdapter 明确“仅单元测试用”，因此演示命令
//    不能复用它；本文件是**装配自己拥有的演示替身**（隔离准备的兼容替身，见
//    技能 built-in-assembly：Work against compatible doubles can support isolated preparation）。
//  - §6 规定 main 只持有 Interface 层句柄、不得导入 Provider 对象。故本替身只在
//    **类型层**引用下层（WriteGate / RuntimeAdapter 等均为 `import type`，擦除后
//    不产生任何运行时依赖），实现对受治理写入的判定完全经由注入的 gate 完成。
//
// 它模拟一个假模型运行时：被 prompt 后，脚本化地发起若干次 write_file 调用；
// 每次调用**在写之前**先问 gate；gate 拒绝则不发写入、只产出可读的拒绝事件
// （含按根分组的允许路径，对应 F10）。它绝不真正落盘。

import type {
  RuntimeAdapter,
  RoleSession,
  SessionEvent,
  ToolCall,
  WriteGate,
} from "../../model/runtime.ts";
import type { ResolvedRole } from "../../model/role.ts";
import type { WriteDecision } from "../../model/decision.ts";

export interface DemoRuntimeOptions {
  /** 由 Pipeline 注入、已绑定 resolveWrite 的写入闸门。 */
  gate: WriteGate;
  /** 脚本化的工具调用序列；缺省用 DEMO_SCRIPT。 */
  script?: ToolCall[];
}

/**
 * §7 演示脚本（针对演示角色“编排”）：
 *  1. write_file src/evil.ts —— 落在“编排”边界之外，演示越界拒绝（F5/F10）。
 *  2. write_file src/common/编排/output.ts —— 在“编排”边界之内（命中 src/common/编排/
 *     目录条目）、但不在任务 writeSet 之内，演示任务级收窄拒绝（F4）。
 *
 * 第二笔特意选目录边界下的文件：无论 T-1 的 writeSet 具体收窄到哪几个文件，它都
 * 不在精确 writeSet 内，且仍属边界内——因而稳定演示 F4。
 */
export const DEMO_SCRIPT: ToolCall[] = [
  { name: "write_file", args: { path: "src/evil.ts", content: "// 越界：不在角色边界内\n" } },
  {
    name: "write_file",
    args: {
      path: "src/common/编排/output.ts",
      content: "// 边界内、但不在本任务 writeSet 内\n",
    },
  },
];

/** 把一次被拒判定格式化为可读文本，按根分组列出允许路径。 */
function formatDenied(targetPath: string, decision: Extract<WriteDecision, { allowed: false }>): string {
  const { reason, allowedByRoot } = decision;
  const lines = [`拒绝写入 ${targetPath}：${reason}`, "允许路径（按根分组）："];
  const renderRoot = (name: string, paths: string[]) => {
    lines.push(`  ${name}:`);
    if (paths.length === 0) {
      lines.push("    (无)");
    } else {
      for (const p of paths) {
        lines.push(`    - ${p}`);
      }
    }
  };
  renderRoot("skill", allowedByRoot.skill);
  renderRoot("project", allowedByRoot.project);
  return lines.join("\n");
}

function readPath(call: ToolCall): string {
  const args = call.args as Record<string, unknown>;
  const value = args.path;
  return typeof value === "string" ? value : "";
}

export function createDemoRuntimeAdapter(opts: DemoRuntimeOptions): RuntimeAdapter {
  const gate = opts.gate;
  const script = opts.script ?? DEMO_SCRIPT;

  return {
    async composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }> {
      return {
        systemPrompt:
          `[装配演示假 runtime] 角色=${role.id}；不调用真实 Pi SDK；` +
          "写入一律经受治理 gate 判定。",
      };
    },

    async bindRole(role: ResolvedRole): Promise<RoleSession> {
      // 有界事件队列：支持“先 prompt 后收集”与“边跑边收集”两种消费顺序。
      const buffer: SessionEvent[] = [];
      let settled = false;
      let waiter: (() => void) | null = null;

      const push = (event: SessionEvent): void => {
        buffer.push(event);
        if (waiter) {
          const resume = waiter;
          waiter = null;
          resume();
        }
      };

      const session: RoleSession = {
        async prompt(text: string): Promise<void> {
          // 角色/边界/工具集的播报由编排（Pipeline）负责；此处只标注这是装配的演示假 runtime。
          push({
            kind: "message",
            summary: `[装配演示假 runtime] 角色=${role.id}，脚本化发起 ${script.length} 次写入（不经真实 Pi SDK，每次写入前经 gate 判定）。`,
          });

          for (const call of script) {
            const target = readPath(call);
            push({ kind: "tool_call", summary: `runtime 请求 ${call.name} -> ${target}` });
            const decision = gate(target);
            if (decision.allowed) {
              push({
                kind: "accepted",
                summary: `写入被允许：${target}（命中条目 ${decision.matchedEntry.root}:${decision.matchedEntry.path}）`,
                detail: decision,
              });
            } else {
              push({ kind: "denied", summary: formatDenied(target, decision), detail: decision });
            }
          }

          push({ kind: "settled", summary: "会话结束（settled）" });
          settled = true;
          if (waiter) {
            const resume = waiter;
            waiter = null;
            resume();
          }
        },

        events(): AsyncIterable<SessionEvent> {
          let index = 0;
          return {
            [Symbol.asyncIterator](): AsyncIterator<SessionEvent> {
              return {
                async next(): Promise<IteratorResult<SessionEvent>> {
                  while (index >= buffer.length && !settled) {
                    await new Promise<void>((resolve) => {
                      waiter = resolve;
                    });
                  }
                  if (index < buffer.length) {
                    const value = buffer[index];
                    index += 1;
                    return { value, done: false };
                  }
                  return { value: undefined as unknown as SessionEvent, done: true };
                },
              };
            },
          };
        },

        async dispose(): Promise<void> {
          // 演示替身不持有外部资源。
        },
      };

      return session;
    },
  };
}
