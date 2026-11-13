// app/desktop/session/fixed-workflow/panel.ts
// B6（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §5 B6、附录 A fixed-workflow 组）：fixed 面板只读投影 + advisory 摘要（L5）。
// 2 个类方法（fixedPanelState/dispatchAdvisorySummary）自 app/desktop/session.ts **逐字搬移**（含 JSDoc）：
// 方法体零改动（纯读；不持状态、不导入 feature）。`fixedPanelState` 保持 public（Interface 只读投影面）。
// 依赖规则（结构测试 R-c）：L5 fixed-workflow 只可导入 L0、card-gateway、evidence、run-change、git-ports。

import { readTaskState } from "../../../../src/common/编排/task-state.ts";
import { readWorkflowLedger } from "../../../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView, type WorkflowView } from "../../../../src/common/编排/workflow-state.ts";
import type { WorkflowEvent } from "../../../../src/model/runtime.ts";
import type { DispatchAdvisory } from "../../../../src/common/编排/dispatch-advisories.ts";
import { resolveProjectFixedPanelMode, type WorkflowMode } from "../../workflow.ts";

/** fixed 面板只读投影与派发 advisory 摘要（原 SessionManager 2 方法的同签名实现）。 */
export class FixedWorkflowPanel {
  // —— fixedPanelState（B6 自 session.ts 逐字搬移）——
  /**
   * fixed 面板只读投影（v1.3 §6.5/§7.4；AC-23）：fixed 项目 ⇒ VCA/trunk/stable 面板**只读**
   * （mutation IPC 由 Interface 拒绝），并给出 workflow 状态；legacy 项目逐字不变（panel:"full"）。
   * 纯读、零写入；不做 UI 改版（渲染层显示切换不在本批）。
   */
  async fixedPanelState(
    projectRoot: string,
    flowId?: string,
  ): Promise<{
    ok: true;
    mode: WorkflowMode;
    panel: "read-only" | "full";
    mutationAllowed: boolean;
    workflow?: {
      workflowId: string;
      flowId: string;
      path: "A" | "B";
      stage: WorkflowView["stage"];
      status: string;
      closed?: string;
      blocked?: { code: string; summary: string };
    };
  }> {
    const mode = await resolveProjectFixedPanelMode(projectRoot);
    let workflow: {
      workflowId: string;
      flowId: string;
      path: "A" | "B";
      stage: WorkflowView["stage"];
      status: string;
      closed?: string;
      blocked?: { code: string; summary: string };
    } | undefined;
    try {
      const ledger = await readWorkflowLedger(projectRoot);
      const started = [...ledger.events].reverse().find(
        (event): event is Extract<WorkflowEvent, { kind: "workflow.started" }> =>
          event.kind === "workflow.started" && (flowId === undefined || event.flowId === flowId),
      );
      if (started !== undefined) {
        const view = deriveWorkflowView(
          ledger.events.filter((event) => event.workflowId === started.workflowId),
          (await readTaskState(projectRoot)).events,
        );
        workflow = {
          workflowId: view.workflowId,
          flowId: view.flowId,
          path: view.path,
          stage: view.stage,
          status: view.stages[view.stage]?.status ?? view.status,
          ...(view.closed !== undefined ? { closed: view.closed.outcome } : {}),
          ...(view.blocked !== undefined ? { blocked: { code: view.blocked.code, summary: view.blocked.summary } } : {}),
        };
      }
    } catch {
      workflow = undefined;
    }
    return {
      ok: true,
      mode,
      panel: mode === "fixed" ? "read-only" : "full",
      mutationAllowed: mode !== "fixed",
      ...(workflow !== undefined ? { workflow } : {}),
    };
  }
  // —— dispatchAdvisorySummary（B6 自 session.ts 逐字搬移）——
  dispatchAdvisorySummary(advisories: readonly DispatchAdvisory[]): string {
    const shown = advisories.slice(0, 3);
    const more = advisories.length - shown.length;
    const numbered = shown.map((advisory, index) => `${index + 1}. ${advisory.message}`).join("；");
    return `${numbered}${more > 0 ? `；另有 ${more} 项，见诊断记录` : ""}`;
  }
}
