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
import type { RuntimeAdapter, RoleSession, SessionEvent, WriteGate, PromptOptions } from "../../src/provider/pi/session.ts";
import { buildGovernedTools } from "../../src/provider/pi/tools.ts";
import { mainT } from "./i18n.ts";

/** 越界示例路径：落在项目根内但几乎必不在任何角色边界内，用于稳定演示「写之前被拒」。 */
const OUT_OF_BOUNDS_PATH = "src/__desktop_out_of_bounds__.ts";

/** 取角色边界内首个项目根 file 条目路径（演示用"边界内写入"目标；非判定）。 */
export function firstProjectFilePath(boundary: BoundarySection1): string | undefined {
  const e = boundary.entries.find((x) => x.root === "project" && x.kind === "file");
  return e ? e.path : undefined;
}

// —— P0-1（2026-10-13 客户批准）：prompt 载荷记录（**仅演示适配器**；真实适配器不记录、载荷直入 SDK）——
/** 一次 `prompt(text, opts)` 的收包记录：`opts` 保持**收到的同一引用**（供 e2e/单测断言**透传保真**——
 *  IPC → Interface 重校验 → SessionManager/队列 → 句柄 → 适配器，逐环不变形）。 */
export interface DemoPromptRecord {
  roleId: string;
  text: string;
  opts?: PromptOptions;
}
/** 模块级记录（环形上限 50 条——防长跑泄漏；e2e/单测经 `takeDemoPromptLog` 取走并清空）。 */
const demoPromptLog: DemoPromptRecord[] = [];
/** 取走全部记录并清空（e2e/单测断言用；生产 demo 路径无人调用）。 */
export function takeDemoPromptLog(): DemoPromptRecord[] {
  const out = demoPromptLog.slice();
  demoPromptLog.length = 0;
  return out;
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
        push({ kind: "tool_call", summary: mainT("main.demo.toolCall", { path }), detail: { name: "write_file", args: { path } } });
        if (!writeTool) {
          push({ kind: "denied", summary: mainT("main.demo.unknownToolDenied"), detail: { name: "write_file", args: { path } } });
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
        // P0-1：**接受可选 opts 并记录**（同一引用；**行为不变**——图片不参与演示脚本，也不落盘）。
        // 契约 `RoleSession.prompt` 同形（`PromptOptions` 从冻结契约家只读导入，不复制形状）。
        async prompt(text: string, promptOpts?: PromptOptions): Promise<void> {
          if (demoPromptLog.length >= 50) demoPromptLog.shift();
          demoPromptLog.push({ roleId: role.id, text, opts: promptOpts === undefined ? undefined : promptOpts });
          turn += 1;
          push({ kind: "message", summary: mainT("main.demo.message", { turn, text }) });
          if (inBound) await attempt(inBound, mainT("main.demo.inBoundsWrite"));
          await attempt(OUT_OF_BOUNDS_PATH, mainT("main.demo.outOfBoundsWrite"));
          push({ kind: "message", summary: mainT("main.demo.turnEndedPrototype", { turn }) });
          // L-1（2026-10-12）：轮次**终止信号**与真实适配器对齐（真实 pi 适配器在 `agent_settled` 时发此）——
          // 会话管理器据此把该角色置回「空闲」并放行其队列。demo 端此前不发（无此语义）；L-1 起忙态判据
          // 依赖它：不发则一轮跑完忙态永不复位（后续消息只能入队、永不投递）——绝不可删。
          push({ kind: "settled", summary: mainT("main.demo.turnEnded", { turn }) });
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
