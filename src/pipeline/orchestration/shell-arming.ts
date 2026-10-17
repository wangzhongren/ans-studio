// src/pipeline/orchestration/shell-arming.ts
// **I-1 开放 shell —— 编排侧的闸装配**（设计 `2026-10-12_design_governed-interaction-and-chat-ux.md` §I-1）。
//
// 组装既有三层链（全部用既件，不新造判定）：
//   (c) 确定性硬地板 `classifyShell`（门禁引擎纯函数 + 规则集，**注入**——规则集内容不属编排，
//       见 `common/编排/shell-gate.ts` 头注；未注入 ⇒ 产出的闸**一律拒绝**，fail-closed）；
//   (b) **su 模型审读**：既有 `pm-reviewer`（`createPmReviewer`）——审读角色 = 项目内置治理角色
//       （`listProject` 枚举 `builtIn`，不硬编码；缺省即 su）；判「危险」（risky）→ 必升 (a)；拿不准/不可用 → 升 (a)；
//   (a) 操作者确认：**前端注入**的 `operatorChannel`（桌面确认框 / 测试桩）；关窗/不答/超时 = **不放行**（fail-closed）。
// 执行前提（Pi适配器侧，既有，本文件不碰）：`cwd` 钉会话项目根（`createPiAdapterFactory` 现传
// `shellCwd: projectRoot`）；spawn 前经 `buildShellEnv` **剥离凭据环境变量**（§7.9）。
//
// **su 只读档**（客户裁定 2026-10-12：「su 也要有 shell，但是只读」）：`assembleReadonlyShellGate` ——
// 同一审计边界解析（共用 `resolveGovernanceBoundary`），组 `buildShellGate({ readonlyOnly: true })`：
// **只接 (c)**（命中只读白名单放行；`risky`/`review`/`deny` 一律拒），**不接 (b)**（su 自己就是审读者，
// 不自审）、**不接 (a)**（只读外的命令直接拒，不打扰客户、不弹任何对话框）。
//
// 装配语义（谁 arm、谁能开）：**项目角色**走三层链（调用方 `openRoleSession` 按角色种类决定——su 不接
// 三层链）；**su 的 `run_shell` 只经只读档注册**。本函数族本身不做角色判定，只负责「按给定件产出 ShellGate」。
// 审计：`buildShellGate` 内建落盘（`docs/audit/shell-gate.jsonl`，治理边界 + 声明 `shell-gate` 条件；
// 审计失败不翻转判定，如实 stderr）。
//
// 【§6 边界——必读】本文件**只消费**：编排自己的 `shell-gate.ts` / `pm-reviewer.ts`、Service 公开出口
// （`listProject`/`resolveRole`）、契约家类型形状（`ClassifyShellFn`/`ShellRules`/`ShellAuditSink` 取自
// 编排 `shell-gate.ts`/`shell-audit.ts`——它们本身就是这两个形状的承载点）。**(c) 的 `classifyShell`
// 与 `rules` 由调用方注入**——门禁引擎的实件在 `src/common/门禁引擎/classify-shell.ts`（其私有 common），
// 本角色**不导入**；合法注入源（门禁引擎经 `src/service/gate/` 的公开再导出）尚不存在 ⇒ 已如实登记为
// 跨角色待办（见 change 文档）；未获注入时闸一律拒绝（fail-closed，绝不因缺件而放宽）。

import type { ProjectConfig } from "../../model/role.ts";
import type { RuntimeKind, RuntimeAdapter, ShellGate, WriteGate, OperatorChannelFn } from "../../model/runtime.ts";
import type { BoundarySection1 } from "../../model/boundary.ts";
import { listProject, resolveRole } from "../../service/role/resolve-role.ts";
import {
  buildShellGate,
  type ClassifyShellFn,
  type ShellRules,
} from "../../common/编排/shell-gate.ts";
import type { ShellAuditSink } from "../../common/编排/shell-audit.ts";
import { createPmReviewer, type OpenSessionFn } from "./pm-reviewer.ts";
// F-6-1：审计边界刷新用**共享载入器**（pm 主属的 `src/common/shared/config-loader.ts`）——只读导入，
// 工程法案 §一.5 的消费方名单已含编排（同源先例：`src/common/编排/finalize.ts` 亦从此导入）。
// 刷新的语义 = **重读盘上 `.ans/project.json` 的最新验收**（不是会话快照），再经下方同一
// `resolveGovernanceBoundary` 重新解析——复用既有解析，不造第二份。
import { loadEffectiveConfig } from "../../common/shared/config-loader.ts";
// 仅类型（`import type` 运行期擦除）：能力面形状的单一来源在 `run-role.ts`（run-role → 本文件为值导入，
// 本文件 → run-role 仅为类型——无运行期循环）。
import type { AdapterCapabilities } from "./run-role.ts";
import type { RoutineShellPolicy } from "../../common/编排/routine-shell-policy.ts";
export type { RoutineShellPolicy } from "../../common/编排/routine-shell-policy.ts";

// ── su 审批档的卡片原因文案（2026-10-17，PM 评审 §3.2）──────────────────────────────
// **Pipeline 公共出口**：桌面窗口只读导入本模块，不直接导入编排私有 `common/`（§6 边界纪律）。
// 单一来源仍在 `common/编排/shell-gate.ts`；此处**同一符号再导出**（不复制实现）。
export { SU_APPROVAL_REASON_PREFIX, renderSuApprovalReason } from "../../common/编排/shell-gate.ts";
export type { SuApprovalTier } from "../../common/编排/shell-gate.ts";

/** 无治理边界时的审计边界（未接受 ⇒ 审计写被门禁拒，如实 stderr；**不翻转**判定）。 */
const NO_AUDIT_BOUNDARY: BoundarySection1 = {
  entries: [],
  boundarySource: "<shell-audit:无治理边界>",
  acceptance: { accepted: false, source: "" },
};

export interface AssembleShellGateOptions {
  /** 目标项目（配置单一来源在装配/前端）。 */
  project: ProjectConfig;
  runtime?: RuntimeKind;
  /** (a) 前端操作者确认通道（桌面确认框；关窗/不答/超时 = 不放行）。 */
  operatorChannel: OperatorChannelFn;
  /** 客户委托的常规检查政策，仅宿主提供；不会给 su 只读档。 */
  routineShellPolicy?: RoutineShellPolicy;
  /** (c) 门禁引擎纯函数（既有件；**注入**）。未注入 ⇒ 闸一律拒绝（fail-closed）。 */
  classifyShell?: ClassifyShellFn;
  /** (c) 规则集本体或加载器（门禁引擎的数据，如 `defaultShellRules()`）；未注入 ⇒ 同上。 */
  rules?: ShellRules | (() => ShellRules | Promise<ShellRules>);
  /** (b) 审读角色 id；缺省 = `listProject` 枚举到的内置治理角色（su）。找不到 ⇒ (b) 不可用 → 升 (a)。 */
  pmRoleId?: string;
  /** (b) 审读超时（毫秒）；缺省 = `timeoutMs`。 */
  pmTimeoutMs?: number;
  /** (a) 确认超时（毫秒）；缺省 = `timeoutMs`（默认 120000：**超时 = 不放行**）。 */
  operatorTimeoutMs?: number;
  /** 整体审核超时（毫秒）。 */
  timeoutMs?: number;
  /** 可注入时钟/环境（测试）。 */
  now?: () => Date;
  env?: Record<string, string | undefined>;
  /** 覆盖审计 sink（测试）；缺省落 `docs/audit/shell-gate.jsonl`（经治理边界 + `shell-gate` 条件）。 */
  auditSink?: ShellAuditSink;
  /** (b) 打开审读会话的函数（测试替换点；缺省 = 编排 `openRoleSession`，pm-reviewer 内定）。 */
  openSession?: OpenSessionFn;
  /** 审读会话的会话依赖（与本次被 arm 会话同一适配器工厂）。 */
  sessionDeps: {
    createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
  };
}

/**
 * 装配项目级 `ShellGate`（I-1）。**返回的闸不持有任何本层的判定策略**——三层全在既件里；
 * 本函数只做：(b) 审读角色的发现与接线、(c) 依赖透传、审计边界解析、交 `buildShellGate` 组装。
 *
 * 失败语义：任何一步取不到件都不抛给调用方期望之外的错误——(b) 取不到 → `pmAsk` 不接（链上表现为
 * 「(b) 不可用 → 升 (a)」）；(c) 未注入 → `buildShellGate` 侧一律拒绝；审计边界取不到 → 审计写被拒
 * （stderr 如实，不翻转判定）。全部 fail-closed。
 */
export async function assembleProjectShellGate(opts: AssembleShellGateOptions): Promise<ShellGate> {
  // (b) 审读角色 + 审计边界：共享解析（缺省枚举 `builtIn`，不硬编码 "su"；`pmRoleId` 给出则直接用它）。
  const { roleId: reviewerRoleId, boundary: govBoundary } = await resolveGovernanceBoundary(
    opts.project,
    opts.pmRoleId,
  );

  const pmAsk =
    reviewerRoleId !== undefined
      ? createPmReviewer({
          project: opts.project,
          runtime: opts.runtime,
          sessionDeps: opts.sessionDeps,
          pmRoleId: reviewerRoleId,
          ...(opts.openSession !== undefined ? { openSession: opts.openSession } : {}),
        })
      : undefined;

  // **F-6-1 审计边界刷新闭包**（客户 2026-10-16 批准）：审计写首查被拒时，重读盘上最新 `.ans` 验收
  // （共享载入器只读导入；无 `.ans` → 回退本会话快照）→ 对 loaded.project **复用同一个**
  // `resolveGovernanceBoundary`（含 `roleIdOverride`）→ 返回重解析后的边界，供 sink 以新门禁重试一次。
  // 覆盖「会话在创世过渡窗口内创建、持有未接受快照」的留痕缺口（kanban-live F-6：收尾落盘后旧快照
  // 无自愈通道）。安全语义不变：重试仍唯一经 `resolveWrite`（含 F6/pin 全链），失败即维持拒绝。
  const refreshAuditBoundary = async (): Promise<BoundarySection1> => {
    const loaded = await loadEffectiveConfig({
      projectRoot: opts.project.projectRoot,
      skillRoot: opts.project.skillRoot,
      fallback: opts.project,
    });
    const { boundary } = await resolveGovernanceBoundary(loaded.project, opts.pmRoleId);
    return boundary;
  };

  return buildShellGate({
    ...(opts.classifyShell !== undefined ? { classifyShell: opts.classifyShell } : {}),
    // (c) 规则集未注入 → 加载器抛错 → createShellGate 判 `ruleset-load-failed` → 一律拒绝（fail-closed）。
    rules:
      opts.rules ??
      (() => {
        throw new Error("(c) shell 规则集未注入——本闸一律拒绝（fail-closed）");
      }),
    ...(pmAsk !== undefined ? { pmAsk } : {}),
    operatorChannel: opts.operatorChannel,
    routineShellPolicy: opts.routineShellPolicy,
    ...(opts.pmTimeoutMs !== undefined ? { pmTimeoutMs: opts.pmTimeoutMs } : {}),
    ...(opts.operatorTimeoutMs !== undefined ? { operatorTimeoutMs: opts.operatorTimeoutMs } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    projectRoot: opts.project.projectRoot,
    skillRoot: opts.project.skillRoot,
    pmBoundary: govBoundary,
    auditBoundaryRefresh: refreshAuditBoundary,
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    ...(opts.env !== undefined ? { env: opts.env } : {}),
    ...(opts.auditSink !== undefined ? { auditSink: opts.auditSink } : {}),
  });
}

// —————————————————————— su 只读档（客户裁定 2026-10-12：「su 也要有 shell，但是只读」） ——————————————————————

/**
 * `assembleReadonlyShellGate` 的选项（**契约钉死**：三方——编排/桌面/测试——按此接，不许改名）。
 * **不提供 `operatorChannel` / `pmAsk` / `pmRoleId` / `openSession` / `sessionDeps`**——只读档**不接 (b)/(a)**：
 * su 自己就是审读者（不自审）；只读外的命令直接拒（不打扰客户、不弹任何对话框）。**type 层面即接不上**。
 */
export interface AssembleReadonlyShellGateOptions {
  /** 目标项目（配置单一来源在装配/前端）。 */
  project: ProjectConfig;
  /** (c) 门禁引擎纯函数（既有件；**注入**）。未注入 ⇒ 闸一律拒绝（fail-closed）。 */
  classifyShell?: ClassifyShellFn;
  /** (c) 规则集本体或加载器（门禁引擎的数据，如 `defaultShellRules()`）；未注入 ⇒ 同上（fail-closed）。 */
  rules?: ShellRules | (() => ShellRules | Promise<ShellRules>);
  /** 整体审核超时（毫秒）。 */
  timeoutMs?: number;
  /** 可注入时钟（测试）。 */
  now?: () => Date;
  /** 可注入环境（测试）。 */
  env?: Record<string, string | undefined>;
  /** 覆盖审计 sink（测试）；缺省落 `docs/audit/shell-gate.jsonl`（经治理边界 + `shell-gate` 条件）。 */
  auditSink?: ShellAuditSink;
}

/**
 * 装配 **su 只读档** `ShellGate`（客户裁定 2026-10-12）。语义：
 * - **命中 (c) 只读白名单（`allow`）→ 放行执行**（既有 `c-allow` 路径）；
 * - **`deny` → 照旧拒绝**（`c-deny` 硬拒）；**`risky` / `review` → 一律拒绝**（`readonly-deny`，reason 写明命中档）；
 * - **不接 pmAsk、不接 operatorChannel**（选项面根本没有这两项；`buildShellGate` 亦不传）；
 * - fail-closed 退路（`ruleset-load-failed` / `no-classifier` / `classify-error`）与三层链逐字一致——
 *   **装配失败 / 缺件 ⇒ 一律拒绝**，绝不放宽；调用方（`openRoleSession`）装配抛错 ⇒ **不 arm**（`run_shell` 不注册）。
 *
 * 审计边界 = 治理角色边界（与三层链**同一解析**，共用 `resolveGovernanceBoundary`；取不到 ⇒ 审计写被门禁拒、
 * stderr 如实，**不翻转判定**）。审计仍落 `docs/audit/shell-gate.jsonl`，`execution` 恒「未执行」（既有约定）。
 */
export async function assembleReadonlyShellGate(opts: AssembleReadonlyShellGateOptions): Promise<ShellGate> {
  // 审计边界 = 内置治理角色边界（枚举 builtIn → resolveRole；与三层链共用同一 helper，不造第二份解析）。
  const { boundary: govBoundary } = await resolveGovernanceBoundary(opts.project);

  // **F-6-1 审计边界刷新闭包**（只读档同接线）：语义与三层链装配完全一致（重读盘上最新 `.ans` 验收 →
  // `loaded.project` 经同一 `resolveGovernanceBoundary` 重解析；无 `.ans` → 回退快照）。只读档无
  // `pmRoleId` 覆盖，故不传 roleIdOverride（与上方初次解析同口径）。**不接 (b)/(a) 的语义不变**——
  // 刷新只服务审计通道，绝不放宽任何命令判定。
  const refreshAuditBoundary = async (): Promise<BoundarySection1> => {
    const loaded = await loadEffectiveConfig({
      projectRoot: opts.project.projectRoot,
      skillRoot: opts.project.skillRoot,
      fallback: opts.project,
    });
    const { boundary } = await resolveGovernanceBoundary(loaded.project);
    return boundary;
  };

  return buildShellGate({
    ...(opts.classifyShell !== undefined ? { classifyShell: opts.classifyShell } : {}),
    // (c) 规则集未注入 → 加载器抛错 → createShellGate 判 `ruleset-load-failed` → 一律拒绝（fail-closed）。
    rules:
      opts.rules ??
      (() => {
        throw new Error("(c) shell 规则集未注入——本闸一律拒绝（fail-closed）");
      }),
    // **不接 (b)/(a)**：不传 pmAsk、不传 operatorChannel；只读档由 shell-gate 层结构保证两闸永不调用。
    readonlyOnly: true,
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    projectRoot: opts.project.projectRoot,
    skillRoot: opts.project.skillRoot,
    pmBoundary: govBoundary,
    auditBoundaryRefresh: refreshAuditBoundary,
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    ...(opts.env !== undefined ? { env: opts.env } : {}),
    ...(opts.auditSink !== undefined ? { auditSink: opts.auditSink } : {}),
  });
}

// —————————————————————— su 审批档（客户裁定 2026-10-17） ——————————————————————

/**
 * `assembleOperatorShellGate` 的选项（**契约钉死**：编排/桌面/测试按此接，不许改名）。
 * **选项面没有** `pmAsk`/`pmRoleId`/`openSession`/`sessionDeps`/`routineShellPolicy`——su 不自审，
 * 客户审批不得被 pm 审读或委托常规检查绕过；type 层面即接不上。
 * `operatorChannel` **必填**（无通道即不 arm；`shell-gate.ts` 构造期亦有守卫）。
 */
export interface AssembleOperatorShellGateOptions {
  /** 目标项目（配置单一来源在装配/前端）。 */
  project: ProjectConfig;
  /** (a) 客户确认通道（**必填**；桌面确认卡 / 测试桩）。批准才执行；拒绝/超时/不可用 = 拒绝。 */
  operatorChannel: OperatorChannelFn;
  /** (c) 门禁引擎纯函数（既有件；**注入**）。未注入 ⇒ 闸一律拒绝（fail-closed）。 */
  classifyShell?: ClassifyShellFn;
  /** (c) 规则集本体或加载器（门禁引擎的数据）；未注入 ⇒ 同上（fail-closed）。 */
  rules?: ShellRules | (() => ShellRules | Promise<ShellRules>);
  /** 整体审核超时（毫秒）。 */
  timeoutMs?: number;
  /** (a) 确认超时（毫秒）；缺省 = `timeoutMs`。**超时 = 拒绝**。 */
  operatorTimeoutMs?: number;
  /** 可注入时钟（测试）。 */
  now?: () => Date;
  /** 可注入环境（测试）。 */
  env?: Record<string, string | undefined>;
  /** 覆盖审计 sink（测试）；缺省落 `docs/audit/shell-gate.jsonl`（经治理边界 + `shell-gate` 条件）。 */
  auditSink?: ShellAuditSink;
}

/**
 * 装配 **su 审批档** `ShellGate`（客户裁定 2026-10-17：「只读的免审批，其他的要客户审批」＋
 * 「deny 也走客户审批」）。语义（判定全部在 `shell-gate.ts`，本函数只装配）：
 * - `(c)=allow` → 直接放行（`c-allow`），**不弹卡**（0 次 operator 调用）；
 * - `(c)=risky` / `review` → 交 (a)（`c-risky→a-*` / `c-review→a-*`）；
 * - `(c)=deny` → 也交 (a)（`c-deny→a-*`；`approveDeny: true`）——原硬拒可被客户逐条批准；
 * - **不接 (b)**（su 不自审）；拒绝/超时/通道不可用 = 拒绝（fail-closed）。
 *
 * 审计边界 = 治理角色边界（与三层链/只读档**同一解析**，共用 `resolveGovernanceBoundary`）；
 * 审计仍落 `docs/audit/shell-gate.jsonl`，`conditions`/`execution` 既有语义不变。
 * 装配失败 / 缺件 ⇒ 构造抛错或闸一律拒绝；调用方（`openRoleSession`）捕获 ⇒ **不 arm**。
 */
export async function assembleOperatorShellGate(
  opts: AssembleOperatorShellGateOptions,
): Promise<ShellGate> {
  // 审计边界 = 内置治理角色边界（与三层链/只读档共用同一 helper，不造第二份解析）。
  const { boundary: govBoundary } = await resolveGovernanceBoundary(opts.project);

  // F-6-1 审计边界刷新闭包（同只读档接线）：重读盘上最新 `.ans` 验收 → 同一解析重试一次。
  const refreshAuditBoundary = async (): Promise<BoundarySection1> => {
    const loaded = await loadEffectiveConfig({
      projectRoot: opts.project.projectRoot,
      skillRoot: opts.project.skillRoot,
      fallback: opts.project,
    });
    const { boundary } = await resolveGovernanceBoundary(loaded.project);
    return boundary;
  };

  return buildShellGate({
    ...(opts.classifyShell !== undefined ? { classifyShell: opts.classifyShell } : {}),
    // (c) 规则集未注入 → 加载器抛错 → createShellGate 判 `ruleset-load-failed` → 一律拒绝（fail-closed）。
    rules:
      opts.rules ??
      (() => {
        throw new Error("(c) shell 规则集未注入——本闸一律拒绝（fail-closed）");
      }),
    operatorChannel: opts.operatorChannel,
    // su 审批档：不接 (b)；risky/review/deny 一律交 (a) 客户逐条批准。
    operatorOnly: true,
    approveDeny: true,
    ...(opts.operatorTimeoutMs !== undefined ? { operatorTimeoutMs: opts.operatorTimeoutMs } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    projectRoot: opts.project.projectRoot,
    skillRoot: opts.project.skillRoot,
    pmBoundary: govBoundary,
    auditBoundaryRefresh: refreshAuditBoundary,
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    ...(opts.env !== undefined ? { env: opts.env } : {}),
    ...(opts.auditSink !== undefined ? { auditSink: opts.auditSink } : {}),
  });
}

// —————————————————————— 共享：内置治理角色发现 + 其边界（审计边界）解析 ——————————————————————

/**
 * **内置治理角色发现 + 其边界解析**（三层链与只读档**共用**的「审计边界」路径；§6：只经 Service 公开出口）。
 * - `roleIdOverride` 给出（三层链的 `pmRoleId`）⇒ 直接用它，不枚举；
 * - 否则经 `listProject` 枚举 `builtIn === true` 的角色（**不硬编码 "su"**）；
 * - 枚举失败 / 无内置角色 → `roleId: undefined`；边界解析失败 → `boundary: NO_AUDIT_BOUNDARY`。
 * 调用方按各自 fail-closed 语义处理（三层链：`roleId` 缺席 ⇒ (b) 不接 → 升 (a)；边界缺席 ⇒ 审计写被拒）。
 */
async function resolveGovernanceBoundary(
  project: ProjectConfig,
  roleIdOverride?: string,
): Promise<{ roleId: string | undefined; boundary: BoundarySection1 }> {
  let roleId = roleIdOverride;
  if (roleId === undefined) {
    try {
      const listing = await listProject(project.projectRoot);
      roleId = listing.roles.find((r) => r.builtIn === true)?.roleId;
    } catch {
      roleId = undefined; // 枚举失败 → 无审计边界来源（fail-closed，不放宽）
    }
  }
  if (roleId === undefined) return { roleId: undefined, boundary: NO_AUDIT_BOUNDARY };

  // 审计边界 = 治理角色的边界（项目治理边界文档 / 创世种子 / 内置；docs/ 为其可写区之一）。
  try {
    const resolved = await resolveRole(roleId, project);
    if (resolved.boundary !== undefined) return { roleId, boundary: resolved.boundary };
  } catch {
    /* 边界解析失败 → NO_AUDIT_BOUNDARY（审计写被拒，stderr 如实；不翻转判定） */
  }
  return { roleId, boundary: NO_AUDIT_BOUNDARY };
}
