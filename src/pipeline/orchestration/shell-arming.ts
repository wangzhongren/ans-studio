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
// 装配语义（谁 arm、谁能开）：**只对项目角色**装配（调用方 `openRoleSession` 按角色种类决定——su 自身不 arm）；
// 本函数本身不做角色判定，只负责「按给定 (a) 通道 + 注入的 (c)/(b) 件产出 ShellGate」。
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
import type { RuntimeAdapter, ShellGate, WriteGate, OperatorChannelFn } from "../../provider/pi/session.ts";
import type { BoundarySection1 } from "../../model/boundary.ts";
import { listProject, resolveRole } from "../../service/role/resolve-role.ts";
import {
  buildShellGate,
  type ClassifyShellFn,
  type ShellRules,
} from "../../common/编排/shell-gate.ts";
import type { ShellAuditSink } from "../../common/编排/shell-audit.ts";
import { createPmReviewer, type OpenSessionFn } from "./pm-reviewer.ts";
// 仅类型（`import type` 运行期擦除）：能力面形状的单一来源在 `run-role.ts`（run-role → 本文件为值导入，
// 本文件 → run-role 仅为类型——无运行期循环）。
import type { AdapterCapabilities } from "./run-role.ts";

/** 无治理边界时的审计边界（未接受 ⇒ 审计写被门禁拒，如实 stderr；**不翻转**判定）。 */
const NO_AUDIT_BOUNDARY: BoundarySection1 = {
  entries: [],
  boundarySource: "<shell-audit:无治理边界>",
  acceptance: { accepted: false, source: "" },
};

export interface AssembleShellGateOptions {
  /** 目标项目（配置单一来源在装配/前端）。 */
  project: ProjectConfig;
  /** (a) 前端操作者确认通道（桌面确认框；关窗/不答/超时 = 不放行）。 */
  operatorChannel: OperatorChannelFn;
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
  // (b) 审读角色：缺省 = 项目内置治理角色（经 listProject 枚举 builtIn，不硬编码 "su"）。
  let reviewerRoleId = opts.pmRoleId;
  if (reviewerRoleId === undefined) {
    try {
      const listing = await listProject(opts.project.projectRoot);
      reviewerRoleId = listing.roles.find((r) => r.builtIn === true)?.roleId;
    } catch {
      reviewerRoleId = undefined; // 枚举失败 → (b) 不接 → 链上升 (a)（fail-closed，不放宽）
    }
  }

  const pmAsk =
    reviewerRoleId !== undefined
      ? createPmReviewer({
          project: opts.project,
          sessionDeps: opts.sessionDeps,
          pmRoleId: reviewerRoleId,
          ...(opts.openSession !== undefined ? { openSession: opts.openSession } : {}),
        })
      : undefined;

  // 审计边界 = 治理角色的边界（项目治理边界文档 / 创世种子 / 内置；docs/ 为其可写区之一）。
  let govBoundary: BoundarySection1 = NO_AUDIT_BOUNDARY;
  if (reviewerRoleId !== undefined) {
    try {
      const resolved = await resolveRole(reviewerRoleId, opts.project);
      if (resolved.boundary !== undefined) govBoundary = resolved.boundary;
    } catch {
      govBoundary = NO_AUDIT_BOUNDARY;
    }
  }

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
    ...(opts.pmTimeoutMs !== undefined ? { pmTimeoutMs: opts.pmTimeoutMs } : {}),
    ...(opts.operatorTimeoutMs !== undefined ? { operatorTimeoutMs: opts.operatorTimeoutMs } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    projectRoot: opts.project.projectRoot,
    skillRoot: opts.project.skillRoot,
    pmBoundary: govBoundary,
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    ...(opts.env !== undefined ? { env: opts.env } : {}),
    ...(opts.auditSink !== undefined ? { auditSink: opts.auditSink } : {}),
  });
}
