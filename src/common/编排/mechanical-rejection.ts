// src/common/编排/mechanical-rejection.ts
// 2026-10-30（方案 v3 §3.2 / P2）：机械拒绝的单一三段式结构与 code→owner 映射。
//
// 所有高频拒绝点只从这里取 owner/action/retryable/文案；业务点提供 code 与具体 missing/docs。
// 客户卡只用人话（humanRejection）；技术 code 由系统行/模型回执携带。

export type RejectionOwner =
  | "chief"
  | "product"
  | "rapporteur"
  | "nominator"
  | "convener"
  | "verifier"
  | "customer"
  | "app";

export interface MechanicalRejection {
  code: string;
  missing: string[];
  action: string;
  owner: RejectionOwner;
  docs: string[];
  retryable: boolean;
  detail?: string;
  /** 旧 code 兼容（测试/日志对照）。 */
  legacyCode?: string;
}

interface RejectionRule {
  owner: RejectionOwner;
  action: string;
  retryable: boolean;
  /** 默认 docs 模式（会由调用方用 flowId 替换）。 */
  docs?: string[];
}

const PLAN_DOC = "docs/proposals/<flowId>-proposal-v1.md";
const MODULES_DOC = "docs/proposals/<flowId>-modules-vN.md";
const ROSTER_DOC = "docs/proposals/<flowId>-roster-vN.md";
const INTENT_DOC = "docs/product/<flowId>-intent-vN.md";

const RULES: Record<string, RejectionRule> = {
  "run-missing": { owner: "app", action: "由应用在 M1 前生成 draft run，并在 handoff 前 pin；不要手写 manifest。", retryable: true },
  "run-pin-required": { owner: "app", action: "在交付/实现前把同一 runId 的 draft pin 为 pinned，再重试；pin 失败如实退回。", retryable: true },
  "run-role-missing": { owner: "rapporteur", action: "把目标项目角色加入 pin 的 roster/manifest.roles，或改派 manifest 内角色。", retryable: true, docs: [ROSTER_DOC] },
  "run-legacy-readonly": { owner: "app", action: "legacy 只读；需要继续工作请创建新 run、在 handoff 前 pin 后再派实现/验收。", retryable: true },
  "flow-required": { owner: "chief", action: "补 flowId（链式步骤必须带）；看不清 flow 时先查 contract_check。", retryable: true, docs: [INTENT_DOC] },
  "intent-missing": { owner: "product", action: "先派产品出/更新产品意图文档，再派策划。", retryable: true, docs: [INTENT_DOC] },
  "proposal-missing": { owner: "rapporteur", action: "先出方案/模块/名单/架构版本，再派人事或验收。", retryable: true, docs: [PLAN_DOC] },
  "roster-missing": { owner: "rapporteur", action: "出合法的 roster vN（含 modules[]/roles[] 绑定与 topology 块）。", retryable: true, docs: [ROSTER_DOC] },
  "roster-modules-missing": { owner: "rapporteur", action: "补 modules-vN 并让 roster modules[] 与之一致。", retryable: true, docs: [MODULES_DOC, ROSTER_DOC] },
  "roster-reference-missing": { owner: "rapporteur", action: "按版本链补齐被引用的 intent/proposal/modules/architecture 精确版本。", retryable: true, docs: [ROSTER_DOC] },
  "roster-reference-stale": { owner: "rapporteur", action: "重出 roster，引用最新精确版本；旧引用不得作为 active 依据。", retryable: true, docs: [ROSTER_DOC] },
  "roster-modules-drift": { owner: "rapporteur", action: "以 modules-vN 为权威重出 roster modules[] 快照。", retryable: true, docs: [MODULES_DOC, ROSTER_DOC] },
  "roster-module-owner-invalid": { owner: "rapporteur", action: "修正模块属主：env/entry 只能归 env-bootstrap，一模块一属主。", retryable: true, docs: [ROSTER_DOC] },
  "env-bootstrap-missing": { owner: "rapporteur", action: "补 env-bootstrap 与 env-resources/entry-index，或在名单写 omitted:true + 理由并移除 env/entry 模块。", retryable: true, docs: [ROSTER_DOC] },
  "target-card-missing": { owner: "nominator", action: "按 D3 选中集合逐角色写卡；缺卡 id 见 missing，不要改写名单绕过。", retryable: true, docs: ["角色卡/<id>/role-card.md", "角色卡/<id>/boundary.yaml"] },
  "target-not-nominated": { owner: "nominator", action: "先取得 D3 选中/重走 D3；未选中角色不得写卡或派实现。", retryable: true, docs: [ROSTER_DOC] },
  "module-required": { owner: "convener", action: "派实现任务必须带 moduleId；模块必须属于目标角色。", retryable: true, docs: [MODULES_DOC] },
  "module-missing": { owner: "rapporteur", action: "把该模块加入 modules-vN 并绑定属主后重试。", retryable: true, docs: [MODULES_DOC] },
  "module-not-owned": { owner: "convener", action: "改派给模块属主，或由策划出新模块/绑定版本；不要越模块派发。", retryable: true, docs: [ROSTER_DOC] },
  "module-path-outside": { owner: "convener", action: "只派该模块声明的路径；越界路径不得写。", retryable: true, docs: [MODULES_DOC] },
  "appointment-write-root-missing": { owner: "app", action: "这是应用判断事实接线失败（不是角色写卡错误）；应用修复 allowedPathRoots/pathProbes 后原样重试。", retryable: true, docs: ["角色卡/<target>/"] },
  "path-outside-boundary": { owner: "app", action: "若为 appointment-write/角色卡路径，属于应用可写根接线问题；否则按 boundary.yaml 修正声明路径。", retryable: true },
  "appointment-invalid": { owner: "nominator", action: "按 D3 回执修正 appointment-write（decisionId/targetRoleId/路径）后重试。", retryable: true },
  "shell-write-outside": { owner: "convener", action: "命令/写目标不得越角色边界；改为模块/角色卡允许路径或申请边界变更。", retryable: true },
  "boundary-parse-failed": { owner: "app", action: "检查角色 boundary.yaml 可解析并重建/重开会话后重试；应用不自动放行。", retryable: true },
  "boundary-unaccepted": { owner: "app", action: "完成边界接受（桌面建立治理记录/ans govern）或补齐 accepted+source 后重试。", retryable: true },
  "write-path-empty": { owner: "convener", action: "write_file/edit_file 必须给项目内明确路径。", retryable: true },
  "path-symlink-escape": { owner: "convener", action: "改为根内真实路径；不得用符号链接/junction 逃逸写区。", retryable: true },
  "boundary-condition-missing": { owner: "convener", action: "在任务 conditions 声明该条件，或改选已激活的写区路径。", retryable: true },
  "path-cross-root": { owner: "app", action: "检查 skill/project 根归属与命令 cwd；应用/角色修正路径后重试。", retryable: true },
  "task-write-set-missing": { owner: "convener", action: "把路径加入任务 writeSet，或走 request_confirmation 客户确认发行后再写。", retryable: true },
  "shell-write-hard-deny": { owner: "convener", action: "该命令形态被硬拒（内联求值/包装/awk 等）；改为落盘脚本或等价安全命令后重试。", retryable: true },
  "versioned-doc-overwrite": { owner: "app", action: "旧版本只读；新建 -vN+1 并在引用链中指向最新。", retryable: true },
  "versioned-doc-baseline-violation": { owner: "app", action: "从版本记录恢复旧版，或新建 -vN+1 并在引用链中指向最新；修正后重试。", retryable: true },
  "criteria-missing": { owner: "verifier", action: "补写精确 <flowId>-criteria-vN.md 或修正 ref；不要用其他版本替代。", retryable: true },
  "criteria-format-missing": { owner: "verifier", action: "加恰好一个 ans-criteria block（ans-criteria/v1）。", retryable: true },
  "criteria-format-ambiguous": { owner: "verifier", action: "只保留一个 ans-criteria block。", retryable: true },
  "criteria-parse-failed": { owner: "verifier", action: "修正 YAML/闭合 fence/顶层字段。", retryable: true },
  "criteria-schema-invalid": { owner: "verifier", action: "删除未知字段，按 ans-criteria/v1 补齐。", retryable: true },
  "criteria-version-mismatch": { owner: "verifier", action: "文件名、block version、ref version 三者一致。", retryable: true },
  "criteria-version-unresolved": { owner: "verifier", action: "在验收任务中显式 pin criteria path+sha+version；不取 latest。", retryable: true },
  "criteria-ref-mismatch": { owner: "app", action: "检查 manifest/任务 ref（path/sha/version/flowId）；不自动选。", retryable: true },
  "criteria-status-draft": { owner: "verifier", action: "把选中的 criteria 升为 status: final 并重出 vN。", retryable: true },
  "criteria-id-invalid": { owner: "verifier", action: "改为 AC-<digit> 或 P<maj>.<min>；不要用别名。", retryable: true },
  "criteria-priority-invalid": { owner: "verifier", action: "改为 P0/P1/P2/P3。", retryable: true },
  "criteria-duplicate-ac": { owner: "verifier", action: "合并/删除重复 canonical id；一个 AC 只有一个档位。", retryable: true },
  "criteria-too-many": { owner: "verifier", action: "拆分/精简 criteria（>500）。", retryable: true },
  "criteria-empty": { owner: "verifier", action: "至少列一条 criteria。", retryable: true },
  "criteria-mismatch": { owner: "verifier", action: "补齐 fact.acId 在 criteria 中的条目；sidecar acIds 必须包含该 fact.acId。", retryable: true },
  "run-change-invalid": { owner: "app", action: "run-change 选择无法映射为唯一模式；重新呈现三模式卡，不自动选择。", retryable: true },
  "evidence-mismatch": { owner: "verifier", action: "重算 artifact/meta/sidecar 并修正证据后重提验收。", retryable: true },
  "evidence-path-invalid": { owner: "verifier", action: "改为项目内相对路径；不得绝对路径、.. 越界、.ans、.env；修正后重试。", retryable: true },
  "evidence-scope-denied": { owner: "verifier", action: "只查询本角色模块目录内的证据；换用本角色模块证据或由应用验收链核对。", retryable: false },
  "not-recommended": { owner: "chief", action: "按推荐项/客户选择修正卡面或流程后重新提交；不得自行发明选项。", retryable: true },
  "insufficient-evidence": { owner: "verifier", action: "补齐判断所需证据/理由后重新提交。", retryable: true },
  "path-unverified": { owner: "app", action: "检查写盘卡结构与逐路径探测接线；应用修正后原样重试。", retryable: true },
  "group-mismatch": { owner: "app", action: "检查请求 group/cardKind 与卡面一致性；应用/发卡方修正后重新提交。", retryable: true },
  "parse-failed": { owner: "app", action: "判断输出无法解析；检查判断引擎/格式后重新提交。", retryable: true },
  "artifact-missing": { owner: "verifier", action: "补齐规范物证/证据后重新提交验收。", retryable: true },
  "artifact-not-read": { owner: "verifier", action: "先读取规范物证再判断；补齐读取证据后重新提交。", retryable: true },
  "asset-missing": { owner: "rapporteur", action: "补齐 assets 需求/清单或按 Gate 规则处理。", retryable: true },
};

/** 旧 code → 新 code 兼容别名（原 code 写入 legacyCode）。 */
export const LEGACY_CODE_ALIASES: Record<string, string> = {
  M2_ROSTER_INVALID: "roster-missing",
  M5_TARGET_CARD_MISSING: "target-card-missing",
  M6_MODULE_OWNER_MISMATCH: "module-not-owned",
  APPOINTMENT_ROOT_MISSING: "appointment-write-root-missing",
  PATH_OUTSIDE_BOUNDARY: "path-outside-boundary",
};

export function canonicalRejectionCode(code: string): string {
  return LEGACY_CODE_ALIASES[code] ?? code;
}

export function rejectionRuleFor(code: string): RejectionRule {
  return RULES[code] ?? { owner: "app", action: "检查技术 code 并修正后重试；完整规则见 contract_check。", retryable: false };
}

export function makeMechanicalRejection(
  code: string,
  missing: string | string[],
  overrides: Partial<Omit<MechanicalRejection, "code" | "missing">> = {},
): MechanicalRejection {
  const canonicalCode = canonicalRejectionCode(code);
  const rule = rejectionRuleFor(canonicalCode);
  const missingList = (Array.isArray(missing) ? missing : [missing]).filter((item) => item.trim() !== "").slice(0, 5);
  return {
    code: canonicalCode,
    missing: missingList.length > 0 ? missingList : ["未知缺失（请查看技术 code）"],
    action: overrides.action ?? rule.action,
    owner: overrides.owner ?? rule.owner,
    docs: (overrides.docs ?? rule.docs ?? []).slice(0, 5),
    retryable: overrides.retryable ?? rule.retryable,
    ...(overrides.detail !== undefined ? { detail: overrides.detail } : {}),
    ...(overrides.legacyCode !== undefined
      ? { legacyCode: overrides.legacyCode }
      : canonicalCode !== code
        ? { legacyCode: code }
        : {}),
  };
}

/** 模型/工具回执的三段式全文（含技术 code）。 */
export function formatMechanicalRejection(rejection: MechanicalRejection): string {
  const docs = rejection.docs.length > 0 ? ` 依据：${rejection.docs.join("、")}。` : "";
  return `拒绝：缺少 ${rejection.missing.join("；")}。下一步：${rejection.action} 谁来做：${rejection.owner}。${docs}${rejection.retryable ? " 修正后可原样重试。" : " 当前不可原样重试。"} [技术 code：${rejection.code}]`;
}

/** 客户卡/人读文案：只保留缺什么/做什么/谁来做，不出现技术 code。 */
export function humanRejection(rejection: MechanicalRejection): string {
  return `缺少 ${rejection.missing.join("；")}。下一步：${rejection.action} 谁来做：${rejection.owner}。`;
}

/** 系统行折叠技术 code（一个短括号）。 */
export function technicalRejectionCode(rejection: MechanicalRejection): string {
  return `[${rejection.code}]`;
}

/** 高频 code→owner 表（测试/contract_check 共用；只读快照）。 */
export function rejectionMapSnapshot(): Array<{ code: string; owner: RejectionOwner; retryable: boolean }> {
  return Object.entries(RULES).map(([code, rule]) => ({ code, owner: rule.owner, retryable: rule.retryable }));
}

export function docsForFlow(flowId: string): string[] {
  return [
    `docs/product/${flowId}-intent-v1.md`,
    `docs/proposals/${flowId}-proposal-v1.md`,
    `docs/proposals/${flowId}-modules-v1.md`,
    `docs/proposals/${flowId}-roster-v1.md`,
    `docs/contracts/${flowId}-architecture-v1.md`,
  ];
}
