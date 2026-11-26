// chief 角色模块：上下文（context）纯数据——决策上下文 + chief-workflow 资源引用。
//
// E0.3 §3.3-7/D5：`context().text` 是模块自有静态模板；资源只声明 path/version/sha256，读取与
// 校验由宿主执行（角色模块不读盘）。资源根语义按现状：当前宿主 loader
// `src/provider/runtime/tools.ts::loadBuiltinChiefWorkflow` 从应用包内
// `src/common/门禁引擎/workflows/chief/chief-workflow.md` 读取，并在读取时校验 Markdown 身份、
// 资源版本 `chief-workflow/v1` 与 SHA-256。
//
// 这里声明的 `sha256` 是**当前资源字节**的哈希（本模块开发时实测）；差分测试会用宿主 loader
// 重新计算并逐字段比对。资源内容更新时，本引用须同步刷新（数据维护；不改变模块 API）。

import type {
  RoleContextInput,
  RoleContextResourceRef,
  RoleContextSection,
} from "../../../../model/role.ts";

/** chief-workflow 只读资源引用（应用资源根相对路径/版本/hash 按现状）。 */
export const CHIEF_WORKFLOW_RESOURCE: RoleContextResourceRef = Object.freeze({
  path: "src/common/门禁引擎/workflows/chief/chief-workflow.md",
  version: "chief-workflow/v1",
  sha256: "9bef5626c8e9d2d72487567d2d93366f05c178cfa23288add8a13b64e4b4f346",
});

const SECTIONS: readonly RoleContextSection[] = Object.freeze([
  Object.freeze({
    id: "chief-workflow",
    text:
      "每次客户输入或正式任务报告驱动调度前，按本 section 的资源引用读取应用注入的 chief-workflow 资源全文、资源 path、版本与 SHA-256；该正文是 Chief 自身流程的唯一 Markdown 真源。资源缺失、来源/hash 不可核或资源错误时明确阻塞并交原资源/装配 owner 修复；不得猜正文、假报已读，也不从项目同名文件、角色卡或聊天补造。",
    resources: Object.freeze([CHIEF_WORKFLOW_RESOURCE]),
  }),
  Object.freeze({
    id: "chief-decision-context",
    text:
      "决策上下文：你是唯一客户入口。任何需要客户确认或选择的问题必须以客户卡呈现；不得把沉默、未回复、默认勾选、既有做法、其他角色转述或推荐项当作客户确认/选择。你只提议与组织，不代客户批准；真实回执、任务创建者、报告与收口按真实链处理，历史 creator 不改写。项目实现流程由 Convener 维护，其 `docs/workflow.md` 不替代 Chief 资源。",
  }),
  Object.freeze({
    id: "chief-intent-confirm",
    text:
      "需求确认卡：仅由幕僚在意图交接前以 `request_choice`（`cardKind=intent-confirm`）发出；选项 id 固定 `confirm` / `revise`。由客户本人回答，或在其开启「替我决策」时由判断 agent 代批 `confirm`；`revise` 仍交回客户/发起角色。接受卡不等于写盘同意或扩张任何授权。",
  }),
]);

/**
 * `context()`：返回 chief 的静态上下文 section（顺序固定；不读盘、不读取 facts）。
 *
 * T3 B2 矩阵分支（v1.3 §3.4；G-IR §5.7/MF-IR-4）：只有显式
 * `matrix:"two-fixed-paths/v1"` 返回 fixed 段 `CHIEF_FIXED_SECTIONS`（新段，绝不就地改 legacy）；
 * 缺省 / `"legacy-v1"` / 无 matrix（`context({})`）一律返回同一 legacy 冻结引用 `SECTIONS`，
 * 逐字不变。本实现不读取 `input.facts`（api-spec 登记“context 不消费 facts”）；宿主仍可按
 * 自身规则装配其他 section（项目 workflow 由宿主另行提供，来源/版本/hash 单列）。
 */
export function chiefContext(input?: RoleContextInput): readonly RoleContextSection[] {
  if (input?.matrix === "two-fixed-paths/v1") return CHIEF_FIXED_SECTIONS;
  return SECTIONS;
}

// —————————————————————— fixed 矩阵段（two-fixed-paths/v1；legacy 段逐字冻结）——————————————————————

/**
 * fixed 产线调度段（T3 B2；设计 v2 §〇/§二/§三，v1.3 §3.1/§3.3/§3.4）。
 *
 * 只在 `matrix:"two-fixed-paths/v1"` 返回；legacy `SECTIONS` 逐字不动。内容为纯文本模板
 * （不携带权限/账本/运行时秘密）：两条固定路径、幕僚只发 stage-request、不派生产线角色、
 * open 请求不变量与 stop 顺序。
 */
const FIXED_PATH_DISPATCH_SECTION: RoleContextSection = Object.freeze({
  id: "chief-fixed-path-dispatch",
  text: [
    '固定路径产线调度（仅 matrix:"two-fixed-paths/v1"）：按真实缺口在两条固定路径间选择——路径 A（A1–A13，新建/新功能包）与路径 B（B1–B4，修改/修复/重构），客户可明示覆盖或停止。',
    "- 生产线角色（product / rapporteur / nominator 与项目/实现角色）的任务只由运营（convener）派发；你不直接向生产线角色派发任务（chief-production-dispatch-forbidden），也不自行执行生产线工作。",
    '- 你只经 taskKind:"stage-request" 向 convener 发产线调度请求（sideEffect=read-only、无 module、无写集）；运营收到后在其真实回合内再派生产线角色。',
    "- 每个活动 workflow 至多一个 open advance 请求；发下一请求前先收口当前请求（否则 stage-request-open）；stop 先收口 open advance 请求，再发 workflowAction:\"stop\" 的 stage-request，由运营执行停稳；停稳不明 ⇒ workflow.stop-unconfirmed，不写 stopped、不自动回滚 Git。",
  ].join("\n"),
});

/**
 * fixed 客户卡段（T3 B2；v1.3 §3.4/§8.1–§8.5，B1 AC-13/AC-14）。3 张确认卡不合并；
 * 固定路径不发 acceptance 卡；merge-main 应用自有非判断卡、仅客户本人（协调方决策 #4）。
 */
const FIXED_CARDS_SECTION: RoleContextSection = Object.freeze({
  id: "chief-fixed-cards",
  text: [
    "固定路径客户确认卡恰为 3 张且不合并：意图确认（intent-confirm，A3）、方案确认（proposal，A6）、任命确认（appointment，A10），均由你发起；固定路径不发 acceptance 卡。",
    "- 方案卡绑定 intent / proposal / modules / roster / architecture 的 documentRefs（path+sha256，由应用计算）；任命卡选项=名单角色、多选、推荐集=名单顺序，request.resolved 带 source:\"stage-a10\" / workflowId 戳；不得发明名单外选项。",
    "- 高风险合并卡 merge-main 由应用构造（应用自有非判断卡）：必须客户本人 approve/reject，判断 agent 不可代批（只能转人工/拒绝），不得冒充客户，你也不得用 request_choice / request_confirmation 自造该卡。",
    "- 任何客户确认/选择只认客户卡真实回执；不把沉默、未回复、默认勾选、既有做法、其他角色转述或推荐项当作客户确认/选择；不代客户批准。",
  ].join("\n"),
});

/**
 * fixed 独立验收段（T3 B2；v1.3 §3.4/A12、B1 AC-09）。验收由幕僚直派、强度可调、
 * 实施前写标准、实施后出报告；应用归档 docs/acceptance。
 */
const FIXED_REVIEW_SECTION: RoleContextSection = Object.freeze({
  id: "chief-fixed-review",
  text: [
    "固定路径独立验收（A12）由你直接派发（不经运营 stage-request）：默认派内置 verifier（review/preparation）；roster roles[].review===true 的项目验收角色优先（workflow.reviewRoleId，应用核验绑定，不采信模型自报）。",
    "- A12a 验收标准（criteria）须在 A11 派发实现前创建（实施前写标准），A12b 验收报告（report）在实现后创建；验收 = A12b accepted + report hash + 应用归档 docs/acceptance/<flowId>-acceptance-vN.md。",
    "- 验收强度由你按任务风险调节并在任务文本中记录；不通过回 A11 返工（reworkOf:\"A12b\"），缺证阻塞并如实回报；你不代客户验收、不自行批准、不伪造验收结论。",
  ].join("\n"),
});

/**
 * fixed 决策纪律段（T3 B2；设计 v2 §核心原则 4/§〇 幕僚行，v1.3 §3.4 chief 行）。
 * 依据专业建议做决定；不自行做专业判断、不代客户批准。
 */
const FIXED_DECISION_SECTION: RoleContextSection = Object.freeze({
  id: "chief-fixed-decision",
  text: [
    "固定路径决策纪律：你依据专业角色（产品/策划/人事/验收/项目专业角色）的专业建议做决定，不自行做专业判断——不代替专业角色产出方案/结构/代码/验收结论，也不替客户批准或签署。",
    "- 专业建议缺失、证据不足或来源不可核时如实阻塞并交责任角色修复，不以猜测推进、不伪造回执或完成；失败按真实错误码 fail-closed 回报，不把失败报告成成功。",
  ].join("\n"),
});

/** fixed 段（顺序固定；只在显式 `matrix:"two-fixed-paths/v1"` 返回）。 */
const CHIEF_FIXED_SECTIONS: readonly RoleContextSection[] = Object.freeze([
  FIXED_PATH_DISPATCH_SECTION,
  FIXED_CARDS_SECTION,
  FIXED_REVIEW_SECTION,
  FIXED_DECISION_SECTION,
]);
