// app/desktop/chat-adapter.ts
// 桌面应用的「演示运行时」适配器（多轮）。
//
// 定位：与装配的演示假 runtime 同类——**只脚本化发起写入**，写入一律经受治理
// gate（buildGovernedTools → resolveWrite）判定；绝不真正落盘，也不做任何路径判断。
// 之所以自建（而非复用 createFakeRuntimeAdapter）：后者单轮 prompt 后即关闭事件队列，
// 无法支撑「一个会话反复发消息、事件持续刷出」的聊天形态。
//
// 边界纪律：本文件不判断"能不能写"——判定唯一来自 gate。

import type { BoundarySection1 } from "../../src/model/boundary.ts";
import type { RuntimeAdapter, RoleSession, SessionEvent, WriteGate } from "../../src/provider/pi/session.ts";
import { buildGovernedTools } from "../../src/provider/pi/tools.ts";

/** 越界示例路径：落在项目根内但几乎必不在任何角色边界内，用于稳定演示「写之前被拒」。 */
const OUT_OF_BOUNDS_PATH = "src/__desktop_out_of_bounds__.ts";

/** 取角色边界内首个项目根 file 条目路径（演示用"边界内写入"目标；非判定）。 */
export function firstProjectFilePath(boundary: BoundarySection1): string | undefined {
  const e = boundary.entries.find((x) => x.root === "project" && x.kind === "file");
  return e ? e.path : undefined;
}

/**
 * 多轮演示适配器：bindRole 建**一个**会话，prompt 可反复调用；每次 prompt 脚本化发起
 * 一笔"边界内"写入与一笔"越界"写入，事件持续累积，直到 dispose 才收口。
 */
export function createChatDemoAdapter(opts: { gate: WriteGate; boundary: BoundarySection1 }): RuntimeAdapter {
  return {
    async composeContext(role): Promise<{ systemPrompt: string }> {
      return {
        systemPrompt: `[桌面聊天演示 runtime] 角色=${role.id}；不调用真实 Pi SDK；写入一律经受治理 gate 判定。`,
      };
    },

    async bindRole(role): Promise<RoleSession> {
      const tools = buildGovernedTools(opts.gate);
      const writeTool = tools.find((t) => t.name === "write_file");
      const buffer: SessionEvent[] = [];
      let closed = false;
      let waiter: (() => void) | null = null;
      const wake = (): void => {
        if (waiter) {
          const w = waiter;
          waiter = null;
          w();
        }
      };
      const push = (ev: SessionEvent): void => {
        buffer.push(ev);
        wake();
      };
      const inBound = firstProjectFilePath(opts.boundary);
      let turn = 0;

      const attempt = async (path: string, note: string): Promise<void> => {
        push({ kind: "tool_call", summary: `模型请求调用 write_file -> ${path}`, detail: { name: "write_file", args: { path } } });
        if (!writeTool) {
          push({ kind: "denied", summary: `未知工具，拒绝执行：write_file`, detail: { name: "write_file", args: { path } } });
          return;
        }
        // 经受治理工具执行——判定发生在工具内部「写入之前」，与真实适配器同一条路径。
        const res = await writeTool.handler({ name: "write_file", args: { path, content: `// [chat ${turn}] ${note}\n` } });
        push({
          kind: res.ok ? "accepted" : "denied",
          summary: res.message,
          detail: { call: { name: "write_file", args: { path } }, result: res },
        });
      };

      const session: RoleSession = {
        async prompt(text: string): Promise<void> {
          turn += 1;
          push({ kind: "message", summary: `（演示运行时·第 ${turn} 轮）收到：${text}` });
          if (inBound) await attempt(inBound, "角色边界内的写入尝试");
          await attempt(OUT_OF_BOUNDS_PATH, "越界写入尝试");
          push({ kind: "message", summary: `第 ${turn} 轮结束（原型阶段未真正落盘）。` });
        },

        events(): AsyncIterable<SessionEvent> {
          let index = 0;
          return {
            [Symbol.asyncIterator](): AsyncIterator<SessionEvent> {
              return {
                async next(): Promise<IteratorResult<SessionEvent>> {
                  while (index >= buffer.length && !closed) {
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
          closed = true;
          wake();
        },
      };

      return session;
    },
  };
}
