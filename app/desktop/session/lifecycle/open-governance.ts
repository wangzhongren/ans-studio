import type { BoundarySection1 } from "../../../../src/model/boundary.ts";
import type { GovernanceModel } from "../../../../src/model/role.ts";
import type { CloseCreatedTaskFn, CustomerInputRequest, DispatchTaskFn, FixedCloseCreatedTaskFn, ViewImageFn } from "../../../../src/model/runtime.ts";
import { resolveBoundary } from "../../../../src/service/boundary/resolve-boundary.ts";
import type { RoleSessionHandle } from "../../../../src/pipeline/orchestration/run-role.ts";
import { createDirectRoleRuntime } from "../../../../src/pipeline/orchestration/trunk-runtime.ts";
import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import { createViewImageDelivery } from "../../view-image.ts";
import type { WorkflowMode } from "../../workflow.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";
import type { LifecycleHost } from "./host.ts";
import type { OpenContext } from "./open-context.ts";

/** assembleGovernanceCapabilities：openInternalUnsafe 连续块（源 2195–2301；映射见 change 记录）。 */
export async function assembleGovernanceCapabilities(
  ctx: OpenContext,
  host: Pick<LifecycleHost, "sessions" | "routeDispatch" | "send" | "queueDirectNotification" | "drainAllQueuesFor" | "closeCreatedTaskFixedForSession">,
  deps: SessionManagerDeps,
): Promise<void> {
  const { req, userInitiated, selectionVersion, internalReopen, lifecycle, key, stopped, stoppedResult, requestedSessionMode, project, role, config } = ctx;
  // ——— 三权（评审 §5.6）：能力按 `governanceFunction` 路由；single/su 旧行为逐字不变 ———
  //
  // 唯一数据来源＝门禁引擎注册表（经 `role.governanceFunction`/`builtIn` 表达，**不硬编码角色 id**）。
  // · legacyBuiltIn：single 模型下的内置治理角色（su）——保持旧能力集（派发/看护/安装）；
  // · schedule：trio 的 Convener——派发/看护/恢复提议；
  // · nomination：trio 的 Nominator——技能/MCP 安装；
  // · liaison：trio 的 Liaison——意图交接；proposal：Rapporteur——澄清 + 需求变更申请；
  // · verification：trio 的 Verifier——无附加能力。
  // **shell 不再按职能分档**（客户 2026-10-19 新规则）：全部内置治理角色统一审批档，见下方 `shellOperatorOnly`。
  const governanceModel: GovernanceModel = project.governanceModel ?? "single";
  const governanceFunction = role.governanceFunction;
  // T3（2026-11-10 两条固定工作流路径，B1 AC-12/AC-23）：会话级 workflow 模式（与 run-role 同口径：
  // 输入任务的真实 flowId ⇒ `workflowMode`；B6.1 起无任务的 trio 聊天按项目状态解析）。fixed 会话
  // **不注入** legacy 治理型 Git/流程能力（下方注入 gate）；single/su 与 legacy 会话的注入集合/顺序逐字不变。
  // 复用本函数前段的同一个解析结果（同一任务/项目事实；不引入项目级缓存）。
  const sessionWorkflowMode: WorkflowMode = governanceModel === "trio" ? requestedSessionMode : "legacy";
  const legacyOnlyCapabilitiesAllowed = sessionWorkflowMode !== "fixed";
  const legacyBuiltIn = role.builtIn === true && governanceFunction === undefined && governanceModel === "single";
  const canSchedule = governanceFunction === "schedule" || legacyBuiltIn;
  const canNominate = governanceFunction === "nomination" || legacyBuiltIn;

  // ——— 客户确认制交互（A-1/A-3/A-5）：**仅内置治理角色（su 或 trio 五人）**的会话注入客户交互通道 ———
  //
  // 判据 = 「本角色是内置治理角色」（`role.builtIn`，数据驱动、**不硬编码 "su"**）。注入 ⇒ 编排把本会话
  // 置为**确认制**（`request_confirmation`/`request_choice` 注册；gate 走「客户确认才发行 writeSet」）——
  // 「客户确定了才加、才落盘」。**普通角色的会话一律不注入**（无客户通道：工具不注册、gate 旧语义逐字
  // 不变）。通道未接（deps.customerInput 缺省）⇒ 不注入——**绝不**出现「没人问就放行」。
  // 2026-10-18 Lead 需求确认，2026-10-20 客户修正：Liaison（Lead / 主理）**需要** customerInput 发
  // `intent-confirm` 需求确认卡——**客户决策卡**；「替我决策」开关开启时判断 agent 可代批 `confirm`，
  // `revise` 仍交回客户。隔离由编排 `TRIO_CARD_KINDS.liaison = ["intent-confirm"]` 保证：
  // 其他治理卡在 Liaison 会话里**结构性拒绝**（不弹卡、declined），不占「一项目一卡」决定队列。
  // `intent-confirm` 不镜像（由 Lead 本人发）；single/su 旧行为不变。
  // trio 下客户作出决定后的 `customer.decision` 账本写入在编排的 `customerInput` 包装器内（评审 §5.7，
  // 桌面只接线、不另写一份）。
  const customerInput = role.builtIn === true ? deps.customerInput : undefined;

  // ——— 写盘确认的应用层兜底（客户 2026-10-25 新规则：「写自己角色权限内的路径，直接放行」）———
  // 预解析本会话的 Section 1 边界快照（含接受证据）：与 `openRoleSession` 内部的 `setupRole`
  // **同一解析源**（Service `resolveBoundary` → 门禁 `resolveBoundarySection`；入参是本会话同一份
  // `ProjectConfig`，`governanceBoundary` 的接受证据与开会话时一致）。customer-input 只在**呈现卡片/
  // 调用判断之前**用它对写盘确认做边界判定（`write-preauthorization.ts`；边界判定唯一来源仍是
  // 门禁 `resolveWrite`）。解析失败/非确认制会话 ⇒ 缺省 ⇒ 预授权不生效（保持既有卡片/判断路径；
  // fail-closed 方向不变——绝不「不知道边界就放行」）。
  let writeBoundary: BoundarySection1 | undefined;
  if (customerInput !== undefined) {
    try {
      writeBoundary = await resolveBoundary(req.roleId, project);
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId }).error(
        "write-preauthorization.boundary.unavailable",
        error,
      );
      writeBoundary = undefined;
    }
  }

  // C 批（2026-10-28）：**删除决定卡镜像面**——申请卡只在来源角色会话/客户通道呈现，
  // 幕僚只收 `request.notified` 系统通知（不呈现第二张卡、不代答、不代决）。
  const mirrorRoleIdFor = (_request: CustomerInputRequest): string | undefined => undefined;

  // 2026-10-29（方案 v2.1/Topology v4.1）：派发能力给幕僚（主链/验收调度）、运营（实现任务/验收核对）
  // 与 single/su；目标矩阵由 `routeDispatch` → `evaluateDispatchPreflight` 机械执行。
  const canDispatch = governanceFunction === "chief" || governanceFunction === "schedule" || legacyBuiltIn;
  const dispatchBinding: { handle?: RoleSessionHandle } = {};
  // W6（B1 AC-6）：团队计划登记的宿主 run 绑定——handle 在开会话成功处与 gitBinding/dispatchBinding 同源定格。
  const planBinding: { handle?: RoleSessionHandle } = {};
  const dispatchTask: DispatchTaskFn | undefined = canDispatch ? (d, metadata) => {
    const entry = host.sessions.get(key), origin = entry?.origins.running;
    const source = entry?.handle === dispatchBinding.handle && origin &&
      (!metadata || metadata.turnId === origin.turnId && (!metadata.roleId || metadata.roleId === req.roleId) &&
        (!metadata.runtime || metadata.runtime === req.runtime)) ? { entry, origin } : undefined;
    return host.routeDispatch(req.projectRoot, req.runtime, req.roleId, d, source);
  } : undefined;
  // 2026-10-26 `view_image`（全部角色）：工具读取的图片作为**下一轮用户提示的图片附件**排队给**同一角色**。
  // 目标在开会话时定格（不认 `activeRoleId`，也不接受调用方改投）；投递经既有 `send` → 同一投递机——
  // 工具本轮内角色必然 busy ⇒ 按到达序入队，settle 后投递；直发失败/会话不可用如实回执。
  // 后台系统提示（`background:true`+`kind:"system"`）：不冒充客户消息、不抢 pane；`images` 原引用。
  const viewImage: ViewImageFn = createViewImageDelivery({
    target: { projectRoot: req.projectRoot, roleId: req.roleId, runtime: req.runtime },
    send: (text, opts, target, metadata) => host.send(text, opts, target, metadata),
  });
  // 2026-10-26 需求变更申请（request_requirement_change）：**仅统筹（schedule）与报告员（proposal）**
  // 会话注入（2026-10-26 客户纠正：审批卡由这两个角色发起/持有；其他内置治理角色、项目角色与
  // single/su 不注入——能力缺席 = 工具不注册 = 最强 fail-closed）。编排再按治理职能收口；本层只把
  // 项目根/发起角色/引擎补入后透传。**提交申请 ≠ 批准**：审批由客户/判断 agent 在 decision 卡上完成，
  // 主理不审批、只在批准后执行意图变更。
  const canInitiateRequirementChange = governanceFunction === "proposal" || governanceFunction === "schedule";
  // 2026-10-31（run-change 触发）：应用自有的 run-change 卡可经统筹/提案/幕僚任一在场的客户卡通道呈现
  // （会话选择顺序 convener → rapporteur → chief）。这只扩大**应用内**的发卡呈现面，不新增模型工具：
  // `request_requirement_change` 仍只注入 proposal/schedule（上面 canInitiateRequirementChange 未变）。
  const canPresentAppRunChange = canInitiateRequirementChange || governanceFunction === "chief";
  // 2026-11-04 trunk-amendment-model D1：每项目版本变更/冻结/stable 栈（Interface 注入；缺省 ⇒
  // 不注入 `stablePermitOf`、不接 appointment-write 钩子——旧行为，能力缺席 = fail-closed）。
  const versionChangeStack = deps.getVersionChangeStack?.(req.projectRoot);
  const direct = governanceModel === "trio" ? createDirectRoleRuntime({ projectRoot: req.projectRoot, actorRoleId: req.roleId, notifyDirect: input => host.queueDirectNotification(req.projectRoot, input) }) : undefined;
  const closeCreatedTask: CloseCreatedTaskFn | undefined = direct !== undefined && (req.roleId === "chief" || req.roleId === "convener")
    ? async (input, signal) => {
        const result = await direct.closeCreatedTask(input, signal);
        if (result.ok) void host.drainAllQueuesFor(req.projectRoot);
        return result;
      } : undefined;
  // T3 B3（AC-18/AC-20）：fixed 会话的 close_created_task v2 应用实现（身份由 run-role 绑定；
  // 证据由应用补入；legacy 会话不注入本键——run-role 只在 fixed 会话消费）。
  const closeCreatedTaskFixed: FixedCloseCreatedTaskFn | undefined =
    sessionWorkflowMode === "fixed" && direct !== undefined && (req.roleId === "chief" || req.roleId === "convener")
      ? async (input, signal) => host.closeCreatedTaskFixedForSession(req.projectRoot, req.roleId, input, signal)
      : undefined;
  ctx.governanceModel = governanceModel;
  ctx.governanceFunction = governanceFunction;
  ctx.sessionWorkflowMode = sessionWorkflowMode;
  ctx.legacyOnlyCapabilitiesAllowed = legacyOnlyCapabilitiesAllowed;
  ctx.legacyBuiltIn = legacyBuiltIn;
  ctx.canSchedule = canSchedule;
  ctx.canNominate = canNominate;
  ctx.customerInput = customerInput;
  ctx.writeBoundary = writeBoundary;
  ctx.mirrorRoleIdFor = mirrorRoleIdFor;
  ctx.canDispatch = canDispatch;
  ctx.dispatchBinding = dispatchBinding;
  ctx.planBinding = planBinding;
  ctx.dispatchTask = dispatchTask;
  ctx.viewImage = viewImage;
  ctx.canInitiateRequirementChange = canInitiateRequirementChange;
  ctx.canPresentAppRunChange = canPresentAppRunChange;
  ctx.versionChangeStack = versionChangeStack;
  ctx.direct = direct;
  ctx.closeCreatedTask = closeCreatedTask;
  ctx.closeCreatedTaskFixed = closeCreatedTaskFixed;
}
