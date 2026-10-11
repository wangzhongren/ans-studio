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
import type { WriteGate } from "../../provider/pi/session.ts";
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
 */
export function createFileAuditSink(opts: {
  projectRoot: string;
  /** 审计写门禁：由 `buildShellAuditGate(pmBoundary, ctx)` 构造。 */
  gate: WriteGate;
  /** 覆盖目标相对路径；缺省 `docs/audit/shell-gate.jsonl`。 */
  relPath?: string;
}): ShellAuditSink {
  const relPath = opts.relPath ?? SHELL_AUDIT_REL_PATH;
  return {
    async append(record: ShellAuditRecord): Promise<ShellAuditOutcome> {
      const abs = resolve(opts.projectRoot, relPath);

      // 1) 门禁判定（唯一授权点）。调用前不碰文件系统。
      let allowed = false;
      let reason = "";
      try {
        const decision = opts.gate(abs);
        allowed = decision.allowed;
        if (!decision.allowed) reason = decision.reason;
      } catch (err) {
        return { ok: false, reason: `审计写门禁异常（未落盘）：${reasonOf(err)}` };
      }
      if (!allowed) {
        return { ok: false, reason: `审计写被门禁拒绝（缺少 \`${SHELL_GATE_CONDITION}\` 条件？）：${reason}` };
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
