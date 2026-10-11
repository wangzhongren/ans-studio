// src/pipeline/orchestration/pm-reviewer.ts
// (b) 第二闸的**真实接线**：把命令原文交 pm 角色（项目管理）的模型判读（设计 §7.3 第 2 条、§7.4）。
//
// 归属：编排（`src/pipeline/orchestration/`）。
//
// 用途：产出 `PmAskFn`（定义在 shell-gate.ts），经 `deps` **注入** `createShellGate`。
// 它把「问 pm」这一步落成一句 `openRoleSession(项目管理, …)` 会话：开 pm 会话 → 发审核提示 → 取模型回复原文 → 关闭会话。
// 回复**原文**交回 `createShellGate`，由那里的 `parsePmVerdict` 解析为三态（这样「判定 JSON 不合法 → 升级到 (a)」的
// 职责与测试都落在审核链一侧，§7.5）。
//
// ⚠️ **端到端需求真实模型轮次——本机不可自动验收**（如实标注）：真实 pm 判读要跑一次模型调用，凭据命令须客户本人
//    运行，且不联网/不给凭据即无法复现。故本文件由**注入的** `openSession`（缺省 `openRoleSession`）+ `sessionDeps`
//    组装：**测试以桩替换 `openSession` 即可在无真实模型下验证编排逻辑**（见 `test/编排/shell-review-chain.test.ts`）；
//    **真实模型往返（prompt → 模型 JSON → 解析）在本机不做自动断言**，只保证接线形状正确、失败一律 fail-closed
//    （开不了会话 / 取不到回复 → 抛错或返回空 → shell-gate 判 (b) 不可用并升级到 (a)）。

import type { ProjectConfig } from "../../model/role.ts";
import type { RuntimeAdapter, SessionEvent, WriteGate } from "../../provider/pi/session.ts";
import type { PmReviewInput } from "../../common/编排/shell-gate.ts";
import { openRoleSession, type RoleSessionHandle } from "./run-role.ts";

/** 打开一个角色会话的函数形状（缺省 = 编排的 `openRoleSession`；测试可注入桩）。 */
export type OpenSessionFn = (
  input: { roleId: string; project: ProjectConfig; taskId?: string },
  deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter },
) => Promise<RoleSessionHandle>;

export interface PmReviewerOptions {
  /** 装配注入的 project（配置单一来源在装配）。 */
  project: ProjectConfig;
  /** 传给 `openRoleSession` 的依赖（通常是装配注入的 `{ createAdapter }`）。 */
  sessionDeps: { createAdapter: (gate: WriteGate) => RuntimeAdapter };
  /** pm 角色 id；缺省 `"项目管理"`。 */
  pmRoleId?: string;
  /** 会话任务 id（审计/调度串联用）；可选。 */
  taskId?: string;
  /** 打开会话的函数（注入；缺省 `openRoleSession`）——**无真实模型测试的替换点**。 */
  openSession?: OpenSessionFn;
  /** 从会话事件流里取 pm 的**回复原文**（注入；缺省取最后一条 message 事件）。 */
  extractReply?: (events: SessionEvent[]) => string;
}

/**
 * 构造 `PmAskFn`：每次调用开一个 pm 会话、问一次、取原文回复、关闭会话。
 * 任一步失败（开不了会话 / 会话报错）→ **抛错**，由 `createShellGate` 判为 (b) 不可用 → **升级到 (a)**（§7.5）。
 *
 * 返回类型取**具体形状** `(input) => Promise<string>`（本实现是 async，成功恒回 `string`，失败**抛错**而非回
 * `null`/`undefined`）。它仍是注入点 `PmAskFn` 的**子类型**（可赋值给 `CreateShellGateOptions.pmAsk`），
 * 只是比那个「允许同步返回 + 允许 null/undefined」的宽形状更精确。
 */
export function createPmReviewer(opts: PmReviewerOptions): (input: PmReviewInput) => Promise<string> {
  const open = opts.openSession ?? openRoleSession;
  const pmRoleId = opts.pmRoleId ?? "项目管理";
  const extract = opts.extractReply ?? defaultExtractReply;

  return async (input: PmReviewInput): Promise<string> => {
    const handle = await open(
      { roleId: pmRoleId, project: opts.project, taskId: opts.taskId },
      opts.sessionDeps,
    );
    try {
      await handle.send(buildPmReviewPrompt(input));
      const events: SessionEvent[] = [];
      for await (const ev of handle.events()) {
        if (ev.kind === "handback") continue; // 回交事件（§10.8）不参与 pm 回复提取
        events.push(ev);
        if (ev.kind === "settled") break; // settled 为终止信号（与 dispose 不互等）
      }
      return extract(events);
    } finally {
      await handle.dispose();
    }
  };
}

/** 审核提示：要求 pm **只**以固定 JSON 回复（解析交给 shell-gate 的 `parsePmVerdict`）。 */
export function buildPmReviewPrompt(input: PmReviewInput): string {
  return (
    `【shell 命令审核请求】\n` +
    `命令原文（逐字）：\n${input.command}\n` +
    `（规范化 argv：${JSON.stringify(input.argv)}；cwd：${input.cwd}；调用 id：${input.toolCallId}）\n\n` +
    `请以「放行 / 拒绝 / 拿不准」三态判读该命令能否在本项目内执行，并**只**以下列 JSON 回复（不要任何多余文字）：\n` +
    `{"verdict":"allow|deny|unsure","reason":"简述理由","sessionId":"当前会话标识","model":"当前模型标识"}\n`
  );
}

/** 缺省的回复提取：取**最后一条** `message` 事件（跳过我们注入的「用户指令：」回显）。取不到 → 空串（→ 判定非法 → 升级到 (a)）。 */
export function defaultExtractReply(events: SessionEvent[]): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (ev.kind !== "message") continue;
    if (ev.summary.startsWith("用户指令：")) continue;
    return ev.summary;
  }
  return "";
}
