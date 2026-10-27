// app/desktop/artifact-report.ts
// 2026-10-27 客户新设计：质检（verifier）写完验收标准后**调用 `report_artifact_ready` 汇报给应用**；
// 应用校验后决定是否收口——**不允许应用盯文件自动勾卡，也不允许质检自己改状态**。
//
// 契约单一来源＝运行时核心 `src/model/runtime.ts`（`ReportArtifactFn`/`ReportArtifactInput`/
// `ReportArtifactReceipt`）与 Provider 工具 `src/provider/runtime/tools.ts`（参数形状校验/回执如实
// 转达）。本文件**不复制契约**，只承载桌面侧诊断扩展回执与无 IO 的路径规范化；应用侧校验/收口实现
// 在 `interface.ts`（`reportArtifactForProject`），会话注入在 `session.ts`（仅 verifier；编排再按
// trio verifier 收口）。
//
// 纪律（与 request_acceptance 同一套）：
//  · 汇报 ≠ 验收通过 ≠ 客户批准；`accepted` 只表示应用**校验通过并把 `acceptance-criteria` 步骤收口**；
//  · 校验不通过/收口失败一律 `ok:false, accepted:false` + 明确原因（fail-closed），绝不伪造已收口；
//  · 收口只经编排公共出口 `completeAcceptanceCriteriaStep`（幂等、原子写；只改目标步骤、不写客户决定）。

import type { ReportArtifactReceipt } from "../../src/model/runtime.ts";

/** `acceptance-criteria` 步骤的精确 id（应用收口助手只处理该 id；报告校验也钉死该值）。 */
export const ACCEPTANCE_CRITERIA_STEP_ID = "acceptance-criteria";

/** 拒收/失败原因（机器可读；`accepted` 只在成功收口/幂等已收口时为 true）。 */
export type ReportArtifactRejectCode =
  | "invalid-input"
  | "flow-not-found"
  | "unsupported-step"
  | "step-missing"
  | "step-terminal"
  | "kind-unsupported"
  | "criteria-missing"
  | "criteria-empty"
  | "criteria-unreadable"
  | "path-not-latest"
  | "content-mismatch"
  | "rejected"
  | "unavailable";

/**
 * 桌面侧**诊断扩展**回执：核心三字段（`ok`/`accepted`/`message`）继承契约
 * `ReportArtifactReceipt`；其余字段只供桌面诊断/测试对齐，不改变工具层语义（工具只读核心三字段）。
 */
export interface DesktopReportArtifactReceipt extends ReportArtifactReceipt {
  ok: boolean;
  /** 本实现始终显式声明接受/拒绝（不依赖工具层对「缺席」的 fail-closed 解释）。 */
  accepted: boolean;
  message: string;
  code?: "accepted" | "already-accepted" | ReportArtifactRejectCode;
  flowId?: string;
  stepId?: string;
  path?: string;
  /** 编排收口助手的结果码（`completeAcceptanceCriteriaStep`；原样携带、不改写）。 */
  detailCode?: string;
  /** 幂等命中：步骤此前已是 done，本次未重复写盘。 */
  alreadyDone?: boolean;
}

/**
 * 汇报路径规范化（**只做字面归一，不做任何「大概是哪个文件」的猜测**）：
 * 反斜杠 → `/`、去掉前导 `./`、去首尾空白。绝对路径/含 `..` 的路径保持原样——随后与项目相对最新
 * 标准路径比较时必然不相等（fail-closed 拒收），不在此处静默改写。
 */
export function normalizeReportedArtifactPath(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}
