import type { GovernanceFunction, ResolvedRole } from "../../model/role.ts";
import type { ContractCheckFn, WorkflowStage } from "../../model/runtime.ts";
import { readIntentEntryFacts } from "../shared/intent-entry-contract.ts";
import { contractSchemaText, evidenceRosterScopeText, INTENT_DECISION_REQUIREMENTS_AUTHORING, loadLatestRoster } from "./workflow-preconditions.ts";
import type { AssignedTaskFacts } from "./workflow-service.ts";

const duties: Readonly<Record<GovernanceFunction, string>> = {
  chief: "根据客户需求选用工作流、提请确认和处理异常。依照本会话的 YAML 工作流说明办理。",
  product: "受理需求，厘清目标、范围与验收结果。意图撰写任务提交实际草稿，按当前任务使用 submit_report 回交。",
  proposal: "梳理设计取舍，编制当前任务需要的方案、模块、名单及契约。通过 submit_report 回交结论与实际文件路径。",
  nomination: "根据当前人事任务核对获批角色名单、职责和边界准备情况，通过 submit_report 回交。",
  schedule: "按当前任务完成团队计划和 Git 基线，或核对实际影响报告和实现候选。使用任务提供的工具和事实回交当前职责的结论。",
  verification: "独立编制验收标准，或检查当前候选。将实际检查、候选标识、结论和限制写入对应文件，并通过 submit_report 回交。",
};

const stageDuties: Readonly<Partial<Record<GovernanceFunction | "worker", Partial<Record<WorkflowStage, string>>>>> = {
  product: {
    A1: "本轮只读受理需求，整理目标、范围和主要待确认项，用 submit_report 回交受理结论。",
    A2: "按客户需求撰写当前意图草稿，用 submit_report 回交结论和实际文件路径。" + INTENT_DECISION_REQUIREMENTS_AUTHORING,
  },
  proposal: {
    A4: "本轮只读受理策划任务，梳理关键取舍和建议范围，用 submit_report 回交结论。",
    A5: duties.proposal + " 如已确认意图要求 A6 定案，在正式提案的 YAML 前置区写 decisionFields 数组。每项用 id、label、required 和 options，选项含 value 与 label，可声明集合内的 defaultValue。选项必须可落实且覆盖客户明确要求。没有需定案项时可以省略。",
  },
  nomination: {
    A7: "本轮只读核对已批准名单、角色职责和边界准备情况。用 submit_report 回交发现和缺项。",
    A8: "依据当前 A8 任务和已批准方案名单，直接用 write_file 或 edit_file 为每个必需角色编制 role-card.md、boundary.md 和 boundary.yaml。边界取该角色获批的模块路径。使用本轮提供的已批准方案依据逐人调用 activate_role_documents。所有必需角色激活后提交 completed，仍有缺项时使用 submit_report 回交 blocked 和缺项。",
  },
  schedule: {
    A9: "完成本轮团队计划并按实际工具回执核对 Git 基线。",
    A11: "核对本轮实际实现报告与 Git 提交，用 submit_report 回交核验结论。",
    B1: "核对本轮只读影响报告及其依据，提交本次处置和正式报告。",
    B3: "核对本轮实现报告、实际提交和已批准范围，提交本次处置和正式报告。",
  },
  worker: {
    A12a: "独立编制本轮验收标准，通过 submit_report 回交实际标准文件和必要说明。",
    A12b: "独立检查已绑定的候选，对照标准记录实际检查、候选标识和结论，通过 submit_report 回交。",
  },
};

export function yamlSessionRole(role: ResolvedRole, stage?: WorkflowStage, implementationController = false, revisionAuthor = false,
  environmentRecovery?: "parent" | "child"): ResolvedRole {
  const stageDuty = stage && stageDuties[role.governanceFunction ?? "worker"]?.[stage];
  const controllerDuty = implementationController
    ? "本轮负责 A11 已获批实施项。在提供的工作项内使用 dispatch_task 向指定属主派发一项，收到正式回交后用 close_created_task 核对并处置。按需要依序协调多个属主，所有工作项都通过后用 submit_report 提交子任务和实际提交汇总。"
    : undefined;
  const revisionDuty = revisionAuthor ? "本轮受应用派发处理指定的治理文件。核对原文与具体问题，使用 submit_document_revision 提交完整候选内容。" : undefined;
  const environmentDuty = environmentRecovery === "parent"
    ? "本轮处理当前 A12b 的本地环境补齐。在任务列出的获批清单属主中使用 dispatch_task 安排一名属主。收到正式回交后用 close_created_task 核对应用回执。无合格属主时正式回交 blocked。"
    : environmentRecovery === "child"
      ? "本轮只补齐应用已核对的本地依赖。使用无参数 restore_acceptance_environment，经应用审批后按实际结果与回执使用 submit_report 回交。保持源文件、锁文件、标准和 Git 候选。"
      : undefined;
  const duty = revisionDuty || environmentDuty || controllerDuty || stageDuty || (role.governanceFunction && duties[role.governanceFunction]) ||
    "以当前任务和获批模块边界为准，完成职责内的工作。通过 submit_report 回交结论、实际证据与遇到的障碍。";
  return {
    ...role,
    cardText: `# 角色 ${role.id}\n\n${duty}\n\n应用依照已启用的 YAML 工作流安排固定任务、后续分支和返工。按当前任务完成并回交。前序材料可用时参考；需要审批或校验证据的步骤以应用回执为准。`,
    boundary: {
      ...role.boundary,
      entries: role.boundary.entries.map(entry => ({ ...entry, purpose: "" })),
      acceptance: { ...role.boundary.acceptance, source: role.boundary.acceptance.accepted ? "本会话边界已核对" : "当前边界未获得确认" },
    },
  };
}

export async function yamlTaskAssignmentContextText(
  task: AssignedTaskFacts, writePaths: readonly string[] | undefined, projectRoot: string, canGeneratePackageLock = false, taskGitAvailable = false,
  evidenceCollectorRoleId?: string,
): Promise<string> {
  const roster = writePaths && task.flowId ? await loadLatestRoster({ projectRoot, flowId: task.flowId, evidenceCollectorRoleId }) : undefined;
  const assigned = roster?.ok ? roster.roster.roles.find(role => role.id === task.to) : undefined;
  return "当前 YAML 任务（应用账本）\n" + JSON.stringify({
    taskId: task.taskId, roleId: task.to, workflowId: task.workflowId, flowId: task.flowId,
    stage: task.stage, open: task.open, ...(writePaths ? { writePaths } : {}),
    ...(assigned ? { rosterReference: { purpose: assigned.purpose, capability: assigned.capability, modules: assigned.modules } } : {}),
  }) + (evidenceCollectorRoleId && task.flowId && (task.stage === "A5" || task.stage === "A8" || task.stage === "A9")
    ? "\n" + evidenceRosterScopeText(task.flowId, evidenceCollectorRoleId) : "") + (canGeneratePackageLock ?
    "\n根目录 package.json 就绪后，调用 generate_package_lock（参数 {}）生成根目录 package-lock.json。此操作可在其他 worker 交付前独立完成。分别记录锁文件生成与构建或集成检查的实际结果。"
    : "") + (taskGitAvailable ?
    "\n本任务已开通受治理的任务 Git。用 run_shell 分别执行 `git add <实际修改的获批文件>` 和 `git commit -m <提交说明>`，用 submit_report 回交实际 OID。仅暂存自己已完成并已获批的文件，其他角色的成果齐备后统一验证集成。"
    : "");
}

export function yamlContractCheck(
  role: ResolvedRole, task: AssignedTaskFacts | undefined, writePaths: readonly string[] | undefined, projectRoot: string,
  evidenceCollectorRoleId?: string,
): ContractCheckFn {
  return async ({ topic, flowId, moduleId }) => {
    const collector = task?.flowId && (!flowId || flowId === task.flowId) ? evidenceCollectorRoleId : undefined;
    if (topic) return contractSchemaText(topic, collector && task?.flowId ? { flowId: task.flowId, roleId: collector } : undefined);
    const currentFlowId = task?.flowId ?? flowId;
    const lines = ["contract_check（当前 YAML 工作流，只读）", `角色 ${role.id}`];
    if (task) lines.push(await yamlTaskAssignmentContextText(task, writePaths, projectRoot, false, false, collector));
    if (role.boundary.entries.length) {
      lines.push("角色边界 " + role.boundary.entries.slice(0, 12).map(entry => `${entry.path}（${entry.kind}）`).join("、"));
    }
    if (currentFlowId && /^[a-z0-9][a-z0-9-]{0,79}$/.test(currentFlowId)) {
      if (moduleId) {
        const roster = await loadLatestRoster({ projectRoot, flowId: currentFlowId, evidenceCollectorRoleId: collector });
        const module = roster.ok ? roster.roster.modules.find(entry => entry.id === moduleId) : undefined;
        if (module) lines.push(`模块 ${module.id}（${module.category}） ${module.paths.join("、")}`);
      }
      if (["chief", "product", "rapporteur", "nominator"].includes(role.id)) {
        const intent = await readIntentEntryFacts({ projectRoot, flowId: currentFlowId });
        if (intent.resolvedIntentId) lines.push(`当前意图 ${intent.resolvedIntentId}；入口 ${intent.intentEntryPath ?? "未知"}；存在 ${intent.intentEntryExists === true ? "是" : "否"}`);
        if (intent.resolutionError) lines.push(`意图入口校验 ${intent.resolutionError.code}`);
      }
    }
    lines.push("工作流负责固定派发与分支。按当前任务和应用校验办理，用正式报告回交结果。");
    return lines.join("\n");
  };
}
