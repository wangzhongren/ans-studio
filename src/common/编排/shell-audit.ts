// src/common/编排/shell-audit.ts
// shell 闸审计留痕（设计 §7.6）。
//
// 归属：编排。
//
// 落盘目标 `docs/audit/shell-gate.jsonl` 是**被治理目标项目**里的目录——**不是 ans-cli 自己的仓库**。
// 该目录是 pm 的 Section 1 条目：`conditional-directory: docs/audit/`（condition `shell-gate`，
// 已由 Governance 授权、客户批准）。故写审计是**以 pm 授权**写入。
//
// 硬要求（§7.6）：写这条记录时**必须在 `TaskScope.conditions` 里声明 `shell-gate`**——否则门禁以
// 「命中条件目录但缺少条件」在写入**之前**拒绝（Gov 已自证：同样路径、不含该条件 → `allowed:false`）。
// 故本模块**先调 gate 判定、再落盘**：gate 拒绝即**零副作用**（不建目录、不 open）。
// `buildShellAuditGate` 把「声明 `shell-gate`」这件必要的事**集中在装配处写死**，避免调用方各自漏声明。
//
// 追加式（§7.6）：一行一条 JSON（JSONL），只 append，绝不改写既有记录。

import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { WriteGate } from "../../model/runtime.ts";
import type { BoundarySection1 } from "../../model/boundary.ts";
import type { TaskScope } from "../../model/decision.ts";
import { resolveWrite } from "../../service/gate/resolve-write.ts";

/** 审计记录的目标（相对 projectRoot）。 */
export const SHELL_AUDIT_REL_PATH = "docs/audit/shell-gate.jsonl";
/** 放开 `docs/audit/` 条件目录所需的条件 slug（pm 边界条目）。 */
export const SHELL_GATE_CONDITION = "shell-gate";

/**
 * 审计写门禁：绑定 **pm 边界** + 声明 `shell-gate` 条件的 scope。
 * 集中构造，使「声明 shell-gate」不会被漏掉；调用方只需提供 pm 边界与两根。
 */
export function buildShellAuditGate(
  pmBoundary: BoundarySection1,
  ctx: { skillRoot: string; projectRoot: string },
): WriteGate {
  const scope: TaskScope = {
    writeSet: [SHELL_AUDIT_REL_PATH],
    // 硬要求：必须声明 shell-gate，否则 resolveWrite 因「命中条件目录但缺少条件」拒绝。
    conditions: [SHELL_GATE_CONDITION],
  };
  return (p) => resolveWrite(p, pmBoundary, scope, ctx);
}

/**
 * 一条 shell 审核记录（§7.6 的字段清单）。
 * - `command`：命令**逐字原文**；
 * - `argv`：规范化后的参数数组；
 * - `cwd`：执行工作目录（钉在 projectRoot）；
 * - `conclusion`：结论（allow / deny / timeout / error）；
 * - `branch`：**触发分支**——(c) 层 `c-allow` / `c-deny`；`review-default-deny`（未接 (b)/(a) 的 (c)-only 装配）；
 *   规则集/分类退路 `ruleset-load-failed` / `no-classifier` / `classify-error`；整体超时 `review-timeout`；
 *   (b) 层 `b-allow` / `b-deny`；**升级到 (a) 时**为**升级链** `<b 分支>→<a 分支>`（如 `b-unsure→a-allow`、
 *   `b-timeout→a-deny`、`b-unavailable→a-unavailable`）——两层的触发分支都**可辨识**（§7.6）。
 * - `by`：**谁审的**——(c) 命中为 `ruleset:<规则id|规则集id>`；(b) 为 `pm:<会话id>(<模型>)`；
 *   (a) 为 `operator:<操作者标识>`；升级链用 ` → ` 连接（如 `pm:<会话>(<模型>) → operator:<标识>`）；
 *   不可用/未接入则记 `...:unavailable` / `...:超时` / `...:通道未接入` 等。**各层身份都可辨识**（§7.6）。
 * - `conditions`：本次写入声明的条件（**须含 `shell-gate`**）；
 * - `execution`：执行结果——exit code（数字）或「未执行」。
 */
export interface ShellAuditRecord {
  timestamp: string;
  toolCallId: string;
  command: string;
  argv: string[];
  cwd: string;
  conclusion: "allow" | "deny" | "timeout" | "error";
  branch: string;
  by: string;
  conditions: string[];
  execution: number | "未执行";
}

/** 审计落盘结果；false 时 reason 说明为何未落盘（如条件缺失被门禁拒绝）。 */
export interface ShellAuditOutcome {
  ok: boolean;
  reason?: string;
}

/** 审计落盘接口（注入给 `createShellGate`）。 */
export interface ShellAuditSink {
  append(record: ShellAuditRecord): Promise<ShellAuditOutcome>;
}

/**
 * 文件审计落盘：写 `docs/audit/shell-gate.jsonl`。
 * 落盘前**先经 gate 判定**（绑定 pm 边界 + 声明 `shell-gate`）；gate 拒绝或抛错即零副作用。
 *
 * **F-6-1（刷新重试）**：可选 `refreshGate` 给出时，首查被拒后**重读盘上最新接受证据**（由装配注入的
 * 刷新闭包重新解析边界）并**以新 gate 重试一次**——覆盖「会话在创世过渡窗口内创建、持有未接受快照，
 * 收尾落盘后快照无自愈通道」的留痕缺口（kanban-live F-6）。安全语义不变：写入仍**唯一经 `resolveWrite`**
 * （重试不绕过 F6/pin/条件/writeSet 任何一步）；重解析失败或仍拒 → 维持拒绝、零副作用（重试发生在触碰
 * 文件系统之前，与现状同）。重试放行 → 落盘并把**活跃门禁切换为新 gate**（后续命令直接走新 gate，
 * 恢复后零额外开销）。
 */
export function createFileAuditSink(opts: {
  projectRoot: string;
  /** 审计写门禁：由 `buildShellAuditGate(pmBoundary, ctx)` 构造。 */
  gate: WriteGate;
  /** 覆盖目标相对路径；缺省 `docs/audit/shell-gate.jsonl`。 */
  relPath?: string;
  /**
   * **F-6-1 刷新闭包**：首查被拒时调用，返回重解析后的新门禁（供重试一次）；返回 `undefined` 或抛错
   * = 刷新失败（维持拒绝）。缺省不传 = 旧行为（无刷新，逐字不变）。
   */
  refreshGate?: () => Promise<WriteGate | undefined>;
}): ShellAuditSink {
  const relPath = opts.relPath ?? SHELL_AUDIT_REL_PATH;
  // 活跃门禁：初值 = 装配时快照；F-6-1 重试放行后切换为刷新所得的新 gate。
  let activeGate = opts.gate;
  return {
    async append(record: ShellAuditRecord): Promise<ShellAuditOutcome> {
      const abs = resolve(opts.projectRoot, relPath);

      // 1) 门禁判定（唯一授权点）。调用前不碰文件系统。
      let allowed = false;
      let reason = "";
      try {
        const decision = activeGate(abs);
        allowed = decision.allowed;
        if (!decision.allowed) reason = decision.reason;
      } catch (err) {
        return { ok: false, reason: `审计写门禁异常（未落盘）：${reasonOf(err)}` };
      }
      if (!allowed) {
        // 文案（F-6-2）：不再猜测「缺少条件」——现场反例即条件已声明、缺的是**接受**；如实回
        // resolveWrite 原文（F6/pin/条件/未匹配各有其自述原因）。
        const firstReason = `审计写被门禁拒绝：${reason}`;
        if (opts.refreshGate === undefined) {
          return { ok: false, reason: firstReason };
        }
        // F-6-1：重解析一次、以新 gate 重试一次（判定仍唯一经 resolveWrite；重试不绕过任何一步）。
        let fresh: WriteGate | undefined;
        try {
          fresh = await opts.refreshGate();
        } catch (err) {
          return { ok: false, reason: `${firstReason}；刷新边界快照失败（${reasonOf(err)}），未重试` };
        }
        if (fresh === undefined) {
          return { ok: false, reason: `${firstReason}；刷新边界快照未取得可用门禁，未重试` };
        }
        let retryAllowed = false;
        let retryReason = "";
        try {
          const decision = fresh(abs);
          retryAllowed = decision.allowed;
          if (!decision.allowed) retryReason = decision.reason;
        } catch (err) {
          retryReason = `刷新后的门禁异常：${reasonOf(err)}`;
        }
        if (!retryAllowed) {
          // 如实拼接链式原因（原判 + 重解析后仍拒），不加猜测性归因。
          return { ok: false, reason: `${firstReason}；已刷新边界快照重试一次，仍被拒：${retryReason}` };
        }
        // 重试放行 → 切换活跃门禁（后续命令直接走新 gate），落盘走下方同一路径。
        activeGate = fresh;
      }

      // 2) 追加一行 JSON（仅 append，绝不改写既有记录）。
      try {
        await mkdir(dirname(abs), { recursive: true });
        await appendFile(abs, JSON.stringify(record) + "\n", "utf8");
      } catch (err) {
        return { ok: false, reason: `审计落盘失败：${reasonOf(err)}` };
      }
      return { ok: true };
    },
  };
}

/** 内存审计落盘（单元测试与无盘场景）；记录按追加顺序保留。 */
export function createMemoryAuditSink(): ShellAuditSink & { records: ShellAuditRecord[] } {
  const records: ShellAuditRecord[] = [];
  return {
    records,
    async append(record: ShellAuditRecord): Promise<ShellAuditOutcome> {
      records.push(record);
      return { ok: true };
    },
  };
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
