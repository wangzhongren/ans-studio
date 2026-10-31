// src/common/编排/shell-escalation.ts
// 2026-10-31：shell 判拒后的客户确认通道 —— 编排侧 registry（方案 v1.3 §4、§6.1、§6.3、§7.1、§9、§13.2）。
//
// 归属：编排（本角色私有 `common/编排/`）。**只做编排**：
//   · 判拒记录台账（键 `(roleId, projectRoot, cwd, entry, 规范化 argv)`；v1 只记录 `entry="run_shell"`）；
//   · 申请资格（只读已记录的审核结果——branch/judge/reasonCode/tier；**不重新做风险判定、不调用 judge**）；
//   · 申请单状态机 `recorded → requested → granted-once/granted-session/denied/expired → consumed`；
//   · 一次性 / 会话级客户授权存储（精确 argv + 同角色会话 + 同 cwd + `entry=run_shell`）；
//   · 脚本上下文的 sha256 时效校验（判拒时保存、消费时比对；不一致/不可读 ⇒ `stale`，授权作废且终态）；
//   · 申请接口（限流：同命令每会话一次、会话总上限默认 5、同时最多 1 张待答；必要性 ≤500 字符且 ≤1KB）；
//   · 升级决定审计事件（`event:"escalation-decision"`，写入与 review 记录**同一个 sink**
//     ——由闸的 `onAuditSinkCreated` 经 `bindAudit` 共享）。
//
// **权限边界（方案 §7.4 / §9，写死在本模块）：**
//   · 角色只能「申请」；授权只由客户卡回包后由本模块创建（工具入参不含任何授权字段）；
//   · judge 不参与升级决定：本模块从不调用 judge、不读「替我决策」开关；
//   · 硬地板不可翻案：c=deny / preblock / write-guard deny / script:context-unavailable /
//     readonly-deny / 非 judge 拒绝 / 其它 manual / row-failed / 后台入口 全部不可申请（`escalationEligibility`）；
//   · fail-closed：无记录不可申请；超时/通道不可用/推达失败 ⇒ expired（默认拒绝）；会话结束/重建即清空。
//
// **回滚开关（方案 §13.2，AC-30）**：`ANS_SHELL_ESCALATION_DISABLED=1` 时调用方**不创建本 registry**、
// 不注册 `request_shell_escalation`、不注入 `takeGrant`（既有授权全部失效，fail-closed）。
// 白名单扩容不受该开关控制（那是门禁引擎的独立改动）。
//
// **本模块不呈现卡片**：卡片由注入的 `ShellEscalationPresentFn`（桌面窗口 C1）负责；本模块只构造
// `ShellEscalationCardRequest` 并把客户决定转成授权/回执。roleId/projectRoot/cwd 由每会话闭包绑定，
// 不信任模型输入；`argv` 来自工具层既有 `splitCommand`（模型不提供 argv）。

import { createHash, randomUUID } from "node:crypto";
import type {
  RuntimeKind,
  ShellApprovalContext,
  ShellEscalationCardRequest,
  ShellEscalationDecision,
  ShellEscalationFn,
  ShellEscalationPresentFn,
  ShellGrant,
  ShellJudgeAudit,
  ShellReviewRequest,
  ShellReviewResult,
} from "../../model/runtime.ts";
import { normalizeArgv } from "../shared/argv-primitives.ts";
import type { ShellAuditEscalation, ShellAuditRecord, ShellAuditSink } from "./shell-audit.ts";
import {
  DEFAULT_SHELL_REVIEW_TIMEOUT_MS,
  SHELL_REVIEW_TIMEOUT_ENV,
  isTimeoutError,
  readTimeoutMs,
  withTimeout,
} from "./shell-deadline.ts";

// —— 回滚开关（方案 §13.2）——
/** 环境开关名：`1` ⇒ 升级通道整体关闭（registry 不创建 / 工具不注册 / takeGrant 不注入）。 */
export const SHELL_ESCALATION_DISABLED_ENV = "ANS_SHELL_ESCALATION_DISABLED";
/** 缺省会话申请总上限（方案 §4.3 Q4：默认 5 次/角色会话）。 */
export const DEFAULT_SHELL_ESCALATION_MAX_REQUESTS = 5;
/** 必要性说明上限（与 A1 工具契约一致：≤500 字符且 ≤1KB）。 */
export const SHELL_ESCALATION_NECESSITY_MAX_CHARS = 500;
export const SHELL_ESCALATION_NECESSITY_MAX_BYTES = 1024;
/**
 * 呈现超时沿用既有操作者确认超时链（方案 §6.4）：
 * `ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS` → `ANS_PI_SHELL_REVIEW_TIMEOUT_MS` → 120s。
 * 只读同一组 env 名（这是配置口径，不是第二份判定）；卡呈现端（C1）仍可自管超时，本层是兜底。
 */
export const SHELL_ESCALATION_OPERATOR_TIMEOUT_ENV = "ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS";

// —— 申请决定审计的稳定 branch（方案 §7.1 / AC-10）——
export const BRANCH_ESCALATION_GRANTED_ONCE = "escalation:granted-once";
export const BRANCH_ESCALATION_GRANTED_SESSION = "escalation:granted-session";
export const BRANCH_ESCALATION_DENIED = "escalation:denied";
export const BRANCH_ESCALATION_EXPIRED = "escalation:expired";

/** `ANS_SHELL_ESCALATION_DISABLED=1` 判定（调用方在创建 registry 前读取；缺省 false）。 */
export function shellEscalationDisabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[SHELL_ESCALATION_DISABLED_ENV] === "1";
}

/**
 * 判拒记录（可申请台账的一行）。`state` 覆盖方案 §4.5 状态机：
 * `recorded / requested / granted-once / granted-session / denied / expired / consumed`。
 * `recorded` 是申请前的判拒记录；终态 `denied/expired/consumed` 本会话不可再申请同一命令。
 */
export type ShellEscalationState =
  | "recorded"
  | "requested"
  | "granted-once"
  | "granted-session"
  | "denied"
  | "expired"
  | "consumed";

/** 可申请判拒的两种来源（方案 §4.2）：judge 主动 deny / manual+retry-capped。 */
export type ShellEscalationOutcomeKind = "judge-deny" | "retry-capped";

/** 台账记录（含判拒时的逐字原文、judge 审计与有界脚本上下文；卡与审计只取这里的事实）。 */
export interface ShellEscalationRecord {
  key: string;
  roleId: string;
  projectRoot: string;
  entry: "run_shell";
  /** 判拒时的**逐字原文**（不是模型本次输入）。 */
  command: string;
  /** 规范化 argv（与 gate/审计同源 `normalizeArgv`）。 */
  argv: string[];
  cwd: string;
  outcome: ShellEscalationOutcomeKind;
  branch: string;
  judge: ShellJudgeAudit;
  approvalContext?: ShellApprovalContext;
  at: string;
  /** 同一 key 最近一次审核的顺序号（旧记录清理/资格只认最近一次审核）。 */
  seq: number;
  state: ShellEscalationState;
  requestId?: string;
  operatorId?: string;
}

/** 闸交给 `recordReview` 的审核结果形状（与 `shell-gate.ts` 的最终判定同源）。 */
export interface ShellEscalationReviewedOutcome {
  result: ShellReviewResult;
  conclusion: "allow" | "deny" | "timeout" | "error";
  branch: string;
  judge?: ShellJudgeAudit;
}

/** 申请回执（工具原样转达；`ok` 只表示「申请已被处理」，不表示命令已执行）。 */
export interface ShellEscalationReceipt {
  ok: boolean;
  message: string;
  state?: string;
}

/**
 * 「已有待答 shell 卡」的稳定回执（E2 返工 R2；呈现前被拒与 **presenter 返回 pending** 共用）：
 * 两者都**不消耗**每命令申请权与会话额度、不写 `escalation-decision` 审计（没有客户决定）。
 */
const PENDING_RECEIPT_MESSAGE = "当前有 pending shell 确认卡，请稍后再申请（本次未弹卡）；未执行任何命令。";

/** registry 的可注入运行选项（时钟/环境/上限/ID 生成，便于测试；生产缺省）。 */
export interface ShellEscalationRuntimeOptions {
  /** 可注入时钟（`at` 与 `expiresAt`）；缺省 `new Date()`。 */
  now?: () => Date;
  /** 可注入环境（超时链/回滚开关）；缺省 `process.env`。 */
  env?: Record<string, string | undefined>;
  /** 呈现超时（毫秒）；缺省按既有确认超时链解析。 */
  presentTimeoutMs?: number;
  /** 角色会话申请总上限；缺省 5。 */
  maxRequestsPerSession?: number;
  /** requestId 生成器；缺省 `randomUUID()`。 */
  idFactory?: () => string;
}

export interface ShellEscalationSessionConfig extends ShellEscalationRuntimeOptions {
  /** 本会话角色 id（由 `openRoleSession` 闭包绑定；不来自模型输入）。 */
  roleId: string;
  /** 本会话项目根（`projectRoot` 与记录键的一部分；`request` 的 cwd 固定为它）。 */
  projectRoot: string;
  /** 会话运行时（卡片请求字段；由调用方提供）。 */
  runtime: RuntimeKind;
  /** 升级卡呈现函数（桌面窗口注入）。 */
  present: ShellEscalationPresentFn;
}

/**
 * 每角色会话的升级 registry（内部接口；由 `openRoleSession` 构造并闭包绑定 roleId/projectRoot）。
 * - `bindAudit`：闸创建/取得审计 sink 后经 `onAuditSinkCreated` 共享同一 sink；
 * - `recordReview`：审核结束回调（只记录/清理，不改变判定）；
 * - `takeGrant`：授权消费（精确位置由闸保证；`"stale"` ⇒ 拒绝且授权作废）；
 * - `request`：申请接口（工具能力 `ShellEscalationFn`）；
 * - `dispose`：会话结束/重建时清空台账与授权（fail-closed）。
 */
export interface ShellEscalationSession {
  readonly roleId: string;
  bindAudit(sink: ShellAuditSink): void;
  recordReview(req: ShellReviewRequest, outcome: ShellEscalationReviewedOutcome): void;
  takeGrant(req: ShellReviewRequest, context?: ShellApprovalContext): ShellGrant | "stale" | undefined;
  request: ShellEscalationFn;
  dispose(): void;
}

/** 台账键（方案 §4.4）：`(roleId, projectRoot, cwd, entry, 规范化 argv)`；`entry` v1 仅 `run_shell`。 */
export function shellEscalationKey(
  roleId: string,
  projectRoot: string,
  cwd: string,
  entry: string,
  argv: readonly string[],
): string {
  return `${roleId}\0${projectRoot}\0${cwd}\0${entry}\0${JSON.stringify([...argv])}`;
}

/**
 * 资格判定（方案 §4.2；**只读已记录的审核结果**）：
 * - `entry` 必须是 `run_shell`（后台启动不进入本台账——在 `recordReview` 更早处处理）；
 * - 结论必须为拒绝且 judge 审计存在；
 * - `judge.manualAsDeny === true`：仅 `reasonCode === "retry-capped"` 可申请（其它 manual / row-failed ❌）；
 * - 否则 judge 主动 `deny` 可申请（judge allow ❌）；
 * - 硬地板（c=deny 开头的分支——含审批档 `tier === "deny"`、advisory 非 script 的 `c-deny→a-*`、script 路径
 *   `c-deny`；preblock / write-guard / script:context-unavailable / readonly-deny）一律 ❌；
 * - `approvalContext.failClosed === true`（脚本上下文不可识别）❌——那不是判拒，是 fail-closed 拒绝。
 */
export function escalationEligibility(
  req: Pick<ShellReviewRequest, "approvalContext">,
  outcome: ShellEscalationReviewedOutcome,
): ShellEscalationOutcomeKind | undefined {
  if (outcome.conclusion !== "deny" || outcome.result.allow !== false) return undefined;
  if (isHardFloorBranch(outcome.branch)) return undefined;
  if (req.approvalContext?.failClosed === true) return undefined;
  const judge = outcome.judge;
  if (judge === undefined) return undefined;
  // 审批档的 `deny` 档（方案 §4.2）：即使 judge 在审批档下判拒也不可申请。
  if (judge.tier === "deny") return undefined;
  if (judge.manualAsDeny === true) {
    // manual 转拒绝（2026-10-19 裁定）：只有 retry-capped 可申请；其它 reasonCode / row-failed ❌。
    return judge.reasonCode === "retry-capped" ? "retry-capped" : undefined;
  }
  // judge 主动 deny（非 manualAsDeny）。
  return judge.verdict === "deny" ? "judge-deny" : undefined;
}

/** 硬地板分支（方案 §4.2 / §9 不变量 2）：这些拒绝不产生可申请记录、授权也不得越过。 */
function isHardFloorBranch(branch: string): boolean {
  return (
    branch.startsWith("c-deny") ||
    branch === "readonly-deny" ||
    branch === "script:readonly-deny" ||
    branch === "script:context-unavailable" ||
    branch.startsWith("preblock:") ||
    branch.startsWith("write-guard:") ||
    branch === "review-timeout" ||
    branch === "ruleset-load-failed" ||
    branch === "no-classifier" ||
    branch === "classify-error"
  );
}

/** 脚本上下文摘要（sha256 时效校验）：只哈希判定相关字段，不含读取时间等易变信息。 */
export function digestApprovalContext(context: ShellApprovalContext | undefined): string | undefined {
  if (context === undefined) return undefined;
  const canonical = JSON.stringify({
    scripts: (context.scripts ?? []).map((script) => ({
      label: script.label,
      path: script.path ?? null,
      sha256: script.sha256,
      bytes: script.bytes,
    })),
    scriptPaths: context.scriptPaths ?? [],
    npmScriptName: context.npmScriptName ?? null,
    failClosed: context.failClosed === true,
    note: context.note ?? null,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

interface GrantEntry {
  scope: "once" | "session";
  requestId: string;
  operatorId?: string;
  /** 判拒记录的脚本上下文摘要（存在时消费必须比对；不一致/不可读 ⇒ stale）。 */
  contextDigest?: string;
}

/** 内部：当前待答申请（同一角色会话同时最多 1 张）。 */
interface PendingRequest {
  requestId: string;
}

/**
 * 构造每角色会话的升级 registry（纯逻辑 + 注入时钟/呈现函数/审计 sink）。
 * 调用方：`openRoleSession`（roleId/projectRoot 闭包绑定）；回滚开关与 presenter 缺席时**不调用**。
 */
export function createShellEscalationSession(config: ShellEscalationSessionConfig): ShellEscalationSession {
  const roleId = config.roleId;
  const projectRoot = config.projectRoot;
  const runtime = config.runtime;
  const present = config.present;
  const now = config.now ?? (() => new Date());
  const env = config.env ?? process.env;
  const maxRequests = config.maxRequestsPerSession ?? DEFAULT_SHELL_ESCALATION_MAX_REQUESTS;
  const idFactory = config.idFactory ?? (() => randomUUID());
  const presentTimeoutMs = config.presentTimeoutMs ?? resolveEscalationTimeoutMs(env);

  const records = new Map<string, ShellEscalationRecord>();
  const grants = new Map<string, GrantEntry>();
  /** 每命令每会话最多申请一次（无论结果）：申请真正开始呈现时消耗该命令的申请权。 */
  const requestedKeys = new Set<string>();
  let requestCount = 0;
  let pending: PendingRequest | undefined;
  let auditSink: ShellAuditSink | undefined;
  let auditFailureReported = false;
  let disposed = false;
  let seq = 0;

  function bindAudit(sink: ShellAuditSink): void {
    auditSink = sink;
  }

  /**
   * 审核结束回调（由闸在最终判定后、与审计同址调用）。**只记录/清理，不改变判定**：
   * - 只处理 `entry="run_shell"`；`start_background_task` 的 review **只忽略**——
   *   不写入、也不清除/消费 `run_shell` 记录（方案 §4.2/N3）；
   * - 可申请（judge 主动 deny 非硬拒 / retry-capped）⇒ upsert `recorded`（同一 key 最近一次审核）；
   * - 非可申请（judge allow、客户手拒、其它 manual、硬拒等）⇒ 若该 key 处于 `recorded`，**立即删除**
   *   （方案 §4.5 旧记录清理；申请前记录被清除即不可申请）。
   *   `requested`/`granted-*`/终态不受后续审核影响（终态与在途请求不可被覆盖）。
   * - 客户升级授权放行（`result.grant`）是消费事件，**不清除**记录（会话授权须持续到会话结束）。
   */
  function recordReview(req: ShellReviewRequest, outcome: ShellEscalationReviewedOutcome): void {
    if (disposed) return;
    const entry = req.entry ?? "run_shell";
    if (entry !== "run_shell") return; // 后台入口：只忽略（不写入/不清除/不消费 run_shell 台账）。
    if (typeof req.cwd !== "string" || typeof req.command !== "string") return;
    const argv = normalizeArgv(req.argv);
    const key = shellEscalationKey(roleId, projectRoot, req.cwd, entry, argv);
    const existing = records.get(key);

    // 客户升级授权放行：消费事件，不清除记录（once 的终态由 takeGrant 维护；session 保持在效）。
    if (outcome.result.allow === true && outcome.result.grant !== undefined) return;

    const outcomeKind = outcome.result.allow === false ? escalationEligibility(req, outcome) : undefined;
    if (outcomeKind === undefined) {
      // 非可申请结果 ⇒ 清掉旧的 `recorded` 记录；在途/授权/终态记录不因后续审核变化。
      if (existing !== undefined && existing.state === "recorded") records.delete(key);
      return;
    }
    if (existing !== undefined && existing.state !== "recorded") return; // 终态/在途/授权保持。
    seq += 1;
    records.set(key, {
      key,
      roleId,
      projectRoot,
      entry: "run_shell",
      command: req.command,
      argv,
      cwd: req.cwd,
      outcome: outcomeKind,
      branch: outcome.branch,
      judge: outcome.judge!,
      ...(req.approvalContext !== undefined ? { approvalContext: req.approvalContext } : {}),
      at: now().toISOString(),
      seq,
      state: "recorded",
    });
  }

  /**
   * 授权消费（闸在精确位置调用：非 script 于 classify 后 review/risky；script 于 c=deny 检查与上下文
   * 重载之后）。`once` **原子** check-and-consume；`session` 在会话内反复放行。
   * 脚本类授权必须比对判拒时的 `approvalContext` sha256：不一致/不可读 ⇒ `"stale"`，授权作废、
   * 记录转终态（本会话不可再申请）。
   * `start_background_task` 永不消费 `run_shell` 授权（键含 entry，且此处显式拒绝）。
   */
  function takeGrant(req: ShellReviewRequest, context?: ShellApprovalContext): ShellGrant | "stale" | undefined {
    if (disposed) return undefined;
    const entry = req.entry ?? "run_shell";
    if (entry !== "run_shell") return undefined; // 后台入口不消费前台授权。
    if (typeof req.cwd !== "string") return undefined;
    const argv = normalizeArgv(req.argv);
    const key = shellEscalationKey(roleId, projectRoot, req.cwd, entry, argv);
    const grant = grants.get(key);
    if (grant === undefined) return undefined;
    const record = records.get(key);
    if (grant.contextDigest !== undefined) {
      const current = digestApprovalContext(context ?? req.approvalContext);
      if (current === undefined || current !== grant.contextDigest) {
        // 判拒时客户看到的是旧脚本内容 ⇒ 授权作废、终态（不可再申请）。
        grants.delete(key);
        if (record !== undefined) record.state = "consumed";
        return "stale";
      }
    }
    if (grant.scope === "once") {
      grants.delete(key);
      if (record !== undefined) record.state = "consumed";
    }
    return {
      scope: grant.scope,
      requestId: grant.requestId,
      ...(grant.operatorId !== undefined ? { operatorId: grant.operatorId } : {}),
    };
  }

  /**
   * 申请接口（`request_shell_escalation` 工具能力）。顺序（fail-closed）：
   * 参数校验 → 必要性上限 → 匹配记录（键精确；cwd 固定项目根）→ 资格/状态 → 每命令一次 →
   * pending（1 张）→ 会话总上限 → 呈现 → 客户决定 → 授权/回执 + 审计。
   * 超限 / 已有待答 / 不可申请：**直接拒绝、不弹卡**。
   */
  const request: ShellEscalationFn = async (input, signal) => {
    if (disposed) return receipt(false, "ineligible", "角色会话已结束/重建，升级申请不可用（fail-closed）；未执行任何命令。");
    if (input === null || typeof input !== "object" || typeof input.command !== "string" || input.command.trim() === "") {
      return receipt(false, "invalid", "缺少 command 参数，无法申请客户确认（未执行任何命令）。");
    }
    const argv = normalizeArgv(input.argv);
    if (argv.length === 0) return receipt(false, "invalid", "缺少 argv（命令为空），无命令可申请（未执行任何命令）。");
    const necessity = input.necessity;
    if (necessity !== undefined) {
      if (typeof necessity !== "string") return receipt(false, "invalid", "necessity 参数非法（须为字符串；可省略）——未提交申请。");
      const chars = Array.from(necessity).length;
      const bytes = new TextEncoder().encode(necessity).length;
      if (chars > SHELL_ESCALATION_NECESSITY_MAX_CHARS || bytes > SHELL_ESCALATION_NECESSITY_MAX_BYTES) {
        return receipt(
          false,
          "invalid",
          `necessity 超过上限（当前 ${chars} 字符 / ${bytes} 字节；上限 ${SHELL_ESCALATION_NECESSITY_MAX_CHARS} 字符且 ${SHELL_ESCALATION_NECESSITY_MAX_BYTES} 字节）——超限拒绝、不截断；未提交申请。`,
        );
      }
    }

    // cwd 固定为本会话项目根（方案 §4.3：「cwd 固定为本会话项目根」）。
    const key = shellEscalationKey(roleId, projectRoot, projectRoot, "run_shell", argv);
    const record = records.get(key);
    if (record === undefined) {
      return receipt(
        false,
        "ineligible",
        "未找到可申请的判拒记录：该命令在当前角色会话中未被判断 agent 判拒（或记录已被后续审核清除）。本次申请未提交，未执行任何命令。",
      );
    }
    if (record.state !== "recorded") {
      return receipt(false, record.state, stateMessage(record.state));
    }
    if (requestedKeys.has(key)) {
      // 防御：`recorded` 与 requestedKeys 理论上互斥；任一存在即已申请过。
      return receipt(false, "ineligible", stateMessage("denied"));
    }
    if (pending !== undefined) {
      return receipt(false, "pending", PENDING_RECEIPT_MESSAGE);
    }
    if (requestCount >= maxRequests) {
      return receipt(
        false,
        "capped",
        `本角色会话的升级申请已达上限（${maxRequests} 次），本次申请被拒绝（未弹卡）；未执行任何命令。`,
      );
    }

    // 消耗该命令的申请权与会话额度（无论最终结果）。
    requestedKeys.add(key);
    requestCount += 1;
    const requestId = idFactory();
    record.state = "requested";
    record.requestId = requestId;
    pending = { requestId };

    let decision: ShellEscalationDecision;
    if (signal?.aborted === true) {
      decision = { action: "expired", reason: "轮次已中止" };
    } else {
      const card: ShellEscalationCardRequest = {
        version: 1,
        requestId,
        roleId,
        projectRoot,
        runtime,
        // 命令原文逐字取自**判拒记录**（不是模型本次输入）；argv 规范化。
        command: record.command,
        argv: [...record.argv],
        cwd: record.cwd,
        ...(record.judge.reason !== undefined ? { judgeReason: record.judge.reason } : {}),
        ...(record.judge.customerMessage !== undefined ? { judgeCustomerMessage: record.judge.customerMessage } : {}),
        ...(record.judge.alternative !== undefined ? { judgeAlternative: record.judge.alternative } : {}),
        ...(necessity !== undefined ? { necessity } : {}),
        ...(record.approvalContext !== undefined ? { approvalContext: record.approvalContext } : {}),
        expiresAt: new Date(now().getTime() + presentTimeoutMs).toISOString(),
      };
      try {
        decision = await withTimeout(Promise.resolve(present(card, signal)), presentTimeoutMs, "shell 升级确认");
      } catch (err) {
        decision = isTimeoutError(err)
          ? { action: "expired", reason: `确认超时（>${presentTimeoutMs}ms）` }
          : { action: "unavailable", reason: describeError(err) };
      }
    }
    pending = undefined;
    if (disposed) {
      // 呈现期间会话结束/重建：按 expired 处理，不创建授权（fail-closed）。
      return receipt(false, "expired", expiredMessage());
    }

    const normalized = normalizeDecision(decision);
    // E2 返工 R2（A1 契约第三支 `{action:"pending"}`）：呈现端因**已有待答 shell 卡**返回 pending。
    // 这不是客户决定、也不是默认拒绝：**回滚呈现前的消耗**（每命令申请权与会话额度归还、记录回到
    // `recorded`、清除 requestId），不写 `escalation-decision` 审计；同一命令稍后可再次申请并正常呈现。
    if (normalized.action === "pending") {
      requestedKeys.delete(key);
      requestCount = Math.max(0, requestCount - 1);
      record.state = "recorded";
      delete record.requestId;
      return receipt(false, "pending", PENDING_RECEIPT_MESSAGE);
    }
    const operatorId = "operatorId" in normalized ? normalized.operatorId : undefined;
    if (operatorId !== undefined) record.operatorId = operatorId;

    if (normalized.action === "allow-once" || normalized.action === "allow-session") {
      const scope = normalized.action === "allow-once" ? "once" : "session";
      const digest = digestApprovalContext(record.approvalContext);
      grants.set(key, {
        scope,
        requestId,
        ...(operatorId !== undefined ? { operatorId } : {}),
        ...(digest !== undefined ? { contextDigest: digest } : {}),
      });
      record.state = scope === "once" ? "granted-once" : "granted-session";
      await auditDecision(record, normalized.action, "allow", operatorId);
      const message =
        scope === "once"
          ? `已获客户允许：仅此一次（allow-once；requestId ${requestId}）。请原样重试该精确命令——仅下一次完全匹配的 run_shell 调用会放行一次；未执行任何命令。`
          : `已获客户允许：本会话内该精确命令可直接执行（allow-session；requestId ${requestId}）。请原样重试该精确命令；未执行任何命令。`;
      return receipt(true, scope === "once" ? "granted-once" : "granted-session", message);
    }
    if (normalized.action === "deny") {
      record.state = "denied";
      await auditDecision(record, "deny", "deny", operatorId);
      return receipt(
        false,
        "denied",
        "未获客户允许（客户拒绝）。本会话不再受理同一命令的申请；命令未执行。",
      );
    }
    // expired / unavailable / 非法回包 ⇒ 默认拒绝（fail-closed），消耗该命令申请权。
    record.state = "expired";
    await auditDecision(record, normalized.action, "timeout", undefined);
    return receipt(false, "expired", expiredMessage());
  };

  /** 申请决定审计（与 review 记录同一 sink；失败不翻转判定，如实 stderr 一次）。 */
  async function auditDecision(
    record: ShellEscalationRecord,
    action: "allow-once" | "allow-session" | "deny" | "expired" | "unavailable",
    conclusion: ShellAuditRecord["conclusion"],
    operatorId: string | undefined,
  ): Promise<void> {
    const sink = auditSink;
    if (sink === undefined) {
      if (!auditFailureReported) {
        auditFailureReported = true;
        process.stderr.write("shell 升级决定审计未落盘：审计 sink 未绑定（判定不受影响）\n");
      }
      return;
    }
    const branch =
      action === "allow-once"
        ? BRANCH_ESCALATION_GRANTED_ONCE
        : action === "allow-session"
          ? BRANCH_ESCALATION_GRANTED_SESSION
          : action === "deny"
            ? BRANCH_ESCALATION_DENIED
            : BRANCH_ESCALATION_EXPIRED;
    const escalation: ShellAuditEscalation = {
      requestId: record.requestId ?? "",
      action,
      roleId,
    };
    const by =
      action === "expired" || action === "unavailable"
        ? "operator:unavailable"
        : operatorId !== undefined && operatorId !== ""
          ? `operator:${operatorId}`
          : "operator:未知操作者";
    const auditRecord: ShellAuditRecord = {
      timestamp: now().toISOString(),
      toolCallId: "", // 申请工具无 toolCallId 透传（方案 §7.1：可为空串）
      command: record.command, // 判拒原文（不是模型本次输入）
      argv: [...record.argv],
      cwd: record.cwd,
      conclusion,
      branch,
      by,
      conditions: ["shell-gate"],
      execution: "未执行",
      event: "escalation-decision",
      escalation,
      entry: "run_shell",
    };
    try {
      const res = await sink.append(auditRecord);
      if (!res.ok && !auditFailureReported) {
        auditFailureReported = true;
        process.stderr.write(`shell 升级决定审计未落盘：${res.reason ?? "未知原因"}\n`);
      }
    } catch (err) {
      if (!auditFailureReported) {
        auditFailureReported = true;
        process.stderr.write(`shell 升级决定审计异常：${describeError(err)}\n`);
      }
    }
  }

  function dispose(): void {
    disposed = true;
    records.clear();
    grants.clear();
    requestedKeys.clear();
    pending = undefined;
  }

  return { roleId, bindAudit, recordReview, takeGrant, request, dispose };
}

// —————————————————————— 内部辅助 ——————————————————————

function receipt(ok: boolean, state: string, message: string): ShellEscalationReceipt {
  return { ok, message, state };
}

function expiredMessage(): string {
  return "未获客户允许（超时/通道不可用，默认拒绝）。本会话不再受理同一命令的申请；命令未执行。";
}

function stateMessage(state: ShellEscalationState): string {
  switch (state) {
    case "requested":
      return "该命令已有一条待答复的申请，不能重复申请；未执行任何命令。";
    case "granted-once":
    case "granted-session":
      return "该命令已获得客户授权，无需重复申请；请原样重试该精确命令（命令未执行）。";
    case "denied":
      return "该命令本会话已申请过（结果：客户拒绝），本会话不再受理同一命令的申请；未执行任何命令。";
    case "expired":
      return "该命令本会话已申请过（结果：超时/通道不可用），本会话不再受理同一命令的申请；未执行任何命令。";
    case "consumed":
      return "该命令本会话已申请过（授权已消费或已失效），本会话不再受理同一命令的申请；未执行任何命令。";
    case "recorded":
      return "未找到可申请的判拒记录；未执行任何命令。";
  }
}

type NormalizedDecision =
  | { action: "allow-once" | "allow-session" | "deny"; operatorId?: string }
  | { action: "expired" | "unavailable"; reason?: string }
  | { action: "pending"; reason?: string };

/** 客户回包规范化：未知形状/动作 ⇒ expired（默认拒绝，绝不视为放行）；`pending` 原样保留（E2 R2）。 */
function normalizeDecision(raw: unknown): NormalizedDecision {
  if (raw === null || typeof raw !== "object") return { action: "expired", reason: "应用未返回明确决定" };
  const rec = raw as Record<string, unknown>;
  const action = rec["action"];
  const operatorId =
    typeof rec["operatorId"] === "string" && rec["operatorId"].trim() !== "" ? rec["operatorId"] : undefined;
  if (action === "allow-once" || action === "allow-session" || action === "deny") {
    return { action, ...(operatorId !== undefined ? { operatorId } : {}) };
  }
  if (action === "expired" || action === "unavailable") {
    const reason = typeof rec["reason"] === "string" ? rec["reason"] : undefined;
    return { action, ...(reason !== undefined ? { reason } : {}) };
  }
  if (action === "pending") {
    const reason = typeof rec["reason"] === "string" ? rec["reason"] : undefined;
    return { action, ...(reason !== undefined ? { reason } : {}) };
  }
  return { action: "expired", reason: "未知决定动作" };
}

/** 既有确认超时链：专用覆盖 → 审核超时 → 120s（方案 §6.4）。 */
function resolveEscalationTimeoutMs(env: Record<string, string | undefined>): number {
  const explicit = Number(env[SHELL_ESCALATION_OPERATOR_TIMEOUT_ENV]);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  return readTimeoutMs(env, SHELL_REVIEW_TIMEOUT_ENV, DEFAULT_SHELL_REVIEW_TIMEOUT_MS);
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
