// src/pipeline/orchestration/pm-reviewer.ts
// (b) 第二闸的**真实接线**：把命令原文交治理角色（su/项目管理）的模型判读（设计 §7.3 第 2 条、§7.4）。
//
// 归属：编排（`src/pipeline/orchestration/`）。
//
// **R-1（2026-10-12，客户裁定「不应该按照 json 解析」）——结论通道工具化**：
// 审读会话注入 `shellVerdict` 能力（「注入才注册」先例；Pi适配器据此注册工具 `report_shell_verdict`）；
// 模型**调用工具**交回结构化结论（verdict: allow|deny|unsure + reason）——本函数把结论序列化为 JSON 交回
// `createShellGate`（**构造保证可解析**）。**正文文本解析仅作降级**（模型没调工具、只在正文写了 JSON 时；
// 交由 shell-gate 的 `parsePmVerdict` 宽松解析）。真机根因：旧「正文 JSON」路径下模型轮大面积 500/空正文
// （详见 `shell-gate.ts` 的 R-1 注），取回复恒为空 ⇒ 恒不可解析。
// **审读会话不持久化**（`persistSession:false`）：不恢复用户 su 会话里可能损坏的历史、不污染其聊天记录。
//
// ⚠️ **端到端需求真实模型轮次——本机不可自动验收**（如实标注）：真实判读要跑一次模型调用，凭据命令须客户本人
//    运行，且不联网/不给凭据即无法复现。故本文件由**注入的** `openSession`（缺省 `openRoleSession`）+ `sessionDeps`
//    组装：**测试以桩替换 `openSession` 即可在无真实模型下验证编排逻辑**（见 `test/编排/shell-review-chain.test.ts`）；
//    **真实模型往返（prompt → 工具调用/JSON → 解析）在本机不做自动断言**，只保证接线形状正确、失败一律 fail-closed
//    （开不了会话 / 取不到结论 → 抛错或返回空 → shell-gate 判 (b) 不可用/不可解析，按 M-2 直拒或升 (a)）。

import type { ProjectConfig } from "../../model/role.ts";
import type { RuntimeKind, RuntimeAdapter, SessionEvent, WriteGate } from "../../model/runtime.ts";
import type { PmReviewInput } from "../../common/编排/shell-gate.ts";
import {
  normalizeShellVerdict,
  type ShellVerdictFn,
  type ShellVerdictPayload,
} from "../../common/编排/shell-gate.ts";
import { openRoleSession, type RoleSessionHandle } from "./run-role.ts";

/** 打开一个角色会话的函数形状（缺省 = 编排的 `openRoleSession`；测试可注入桩）。
 *  **R-1**：额外带 `persistSession`（审读会话**不持久化**）与 `shellVerdict`（结论工具的能力注入）。 */
export type OpenSessionFn = (
  input: {
    roleId: string;
    runtime?: RuntimeKind;
    project: ProjectConfig;
    taskId?: string;
    /** 审读会话固定 `false`——不恢复/不污染用户 su 会话；缺省行为（true）不受影响。 */
    persistSession?: boolean;
    /** 结论工具的能力（「注入才注册」：Pi适配器据此注册 `report_shell_verdict`）。 */
    shellVerdict?: ShellVerdictFn;
  },
  deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter },
) => Promise<RoleSessionHandle>;

export interface PmReviewerOptions {
  /** 装配注入的 project（配置单一来源在装配）。 */
  project: ProjectConfig;
  runtime?: RuntimeKind;
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
    // R-1 主路径：结论经**工具调用**（`shellVerdict` 能力）结构化交回——本闭包暂存之
    // （一次审读至多收一个结论，后到覆盖先到；参数再过一遍 `normalizeShellVerdict` 防御）。
    let verdict: ShellVerdictPayload | undefined;
    const shellVerdict: ShellVerdictFn = (v) => {
      const ok = normalizeShellVerdict(v);
      if (ok !== undefined) verdict = ok;
    };
    // 审读会话**不持久化**（`persistSession:false`）：① 不恢复用户 su 会话里可能已损坏/被网关拒收的历史
    // （真机 500 的诱因之一，见 shell-gate.ts 的 R-1 注）；② 不把审核往返灌进用户的 su 聊天记录。
    const handle = await open(
      { roleId: pmRoleId, runtime: opts.runtime, project: opts.project, taskId: opts.taskId, persistSession: false, shellVerdict },
      opts.sessionDeps,
    );
    try {
      await handle.send(buildPmReviewPrompt(input));
      const events: SessionEvent[] = [];
      for await (const ev of handle.events()) {
        if (ev.kind === "handback") continue; // 回交事件（§10.8）不参与回复提取
        events.push(ev);
        if (ev.kind === "settled") break; // settled 为终止信号（与 dispose 不互等）
      }
      // 主路径：拿到工具交回的结构化结论 ⇒ 序列化成 JSON（**构造保证可解析**）。
      if (verdict !== undefined) return JSON.stringify(verdict);
      // 降级路径：模型没调工具、只在正文写了 JSON（或什么都没写 → 空串 → 上层按不可解析 fail-closed 拒）。
      return extract(events);
    } finally {
      await handle.dispose();
    }
  };
}

/** 审核提示：**首选调用工具** `report_shell_verdict` 交回结构化结论（R-1 主路径——结构化由构造保证）；
 *  仅在无法调用工具时退而在正文**只输出**固定 JSON（**降级路径**，由 shell-gate 的 `parsePmVerdict` 宽松解析）。
 *  **M-2（2026-10-12）**：两手都拿不到明确结论 ⇒ shell-gate **直接拒绝**（fail-closed，不升 (a)、不打扰客户）。 */
export function buildPmReviewPrompt(input: PmReviewInput): string {
  return (
    `【shell 命令审核请求】\n` +
    `命令原文（逐字）：\n${input.command}\n` +
    `（规范化 argv：${JSON.stringify(input.argv)}；cwd：${input.cwd}；调用 id：${input.toolCallId}）\n\n` +
    `请以「放行 / 拒绝 / 拿不准」三态判读该命令能否在本项目内执行，并**调用工具 report_shell_verdict** ` +
    `交回结论（verdict = allow / deny / unsure；可选 reason）——**这是本任务的首选且唯一结构化结论通道**。\n` +
    `若因故**无法调用该工具**，才退而在正文**只输出下列 JSON**（**不得夹带任何解释文字、不得使用代码块围栏**；` +
    `verdict 只能是 allow / deny / unsure；reason / sessionId / model 为字符串）：\n` +
    `{"verdict":"allow|deny|unsure","reason":"简述理由","sessionId":"当前会话标识","model":"当前模型标识"}\n`
  );
}

/** **降级路径**的回复提取：取**最后一条** `message` 事件（跳过我们注入的「用户指令：」回显）。
 *  取不到 → 空串（→ shell-gate 按不可解析 **直接拒绝**，M-2；risky 语义不变）。主路径是 `shellVerdict` 工具。 */
export function defaultExtractReply(events: SessionEvent[]): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (ev.kind !== "message") continue;
    if (ev.summary.startsWith("用户指令：")) continue;
    return ev.summary;
  }
  return "";
}
