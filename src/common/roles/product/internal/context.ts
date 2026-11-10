// product 角色模块内部：产品上下文与报告期望（纯数据；E0.3 §3.3 第 7 条）。
//
// `context().text` 是角色模块自有的**静态模板**：不嵌入运行时秘密、账本内容或未脱敏证据；
// 资源引用只声明 path/version/sha256（读取由宿主执行，角色模块不读盘）。
// product 没有应用资源文件（`docs/product/` 是项目写区，不是角色模块资源），因此不声明 resources；
// 项目 `docs/workflow.md` 等由宿主在上下文装配时另行提供（E0 D5/Q4）。
//
// T3「两条固定工作流路径」B2（v1.3 §3.4 / MF-IR-4）：按 `input.matrix` 分支——
//  - 缺省 / `"legacy-v1"`：返回 legacy 4 段（**逐字冻结、同一引用**；legacy 数据不改）；
//  - `"two-fixed-paths/v1"`：返回 fixed 段（意图撰写/修订、报告回运营；不派发/不实现/不自行改方案；
//    意图确认卡由幕僚呈）。fixed 段由编排在 fixed 会话追加注入（run-role `context({matrix})`），
//    legacy 会话不读本分支。纯数据、无 I/O、无时钟/随机数/可变状态。

import type { RoleContextInput, RoleContextSection } from "../../../../model/role.ts";

/** 产品上下文/报告期望提示块（legacy；顺序稳定；id 在 product 模块内唯一）。 */
export const PRODUCT_CONTEXT_SECTIONS: readonly RoleContextSection[] = Object.freeze([
  Object.freeze({
    id: "product-duty",
    text: "产品职责：产品取舍、产品评审、产品文档；按实际目标/范围缺口补足或升级产品意图，供需要该依据的策划使用。只写 `docs/product/`；不写提案/名单/架构/角色卡；不实现、不招人。",
  }),
  Object.freeze({
    id: "product-intent",
    text: "产品意图版本化：写 `docs/product/<flowId>-intent-vN.md`（新需求/变更出新版本，不原地改，旧版只读），必含目标用户与场景、要解决的问题、范围与非目标、成功/验收标准、客户原话与约束、质量档位；不写实现方案。",
  }),
  Object.freeze({
    id: "product-version-upgrade",
    text: "产品升级：用实际注入的 `submit_version_change(kind=version-upgrade)` 整单直接提交（operationId、显式 base 与每目标 expectedFromSha256）；应用完成结构/引用/路径/hash/权限/base 校验后直接切换有效 trunk，不等待 VCA 批拒。提交后通知不等于替策划决定旧 run 择时；旧 run 不自动重 pin。",
  }),
  Object.freeze({
    id: "product-report",
    text: "报告期望：收到幕僚派发的任务完成后，必须用 `submit_report` 回短报（完成/阻塞/证据/遗留）到真实任务创建者（幕僚/Chief）；缺关键信息先报阻塞，由幕僚发卡或转客户，不猜。",
  }),
]);

/**
 * fixed 固定路径产品提示块（仅 `matrix:"two-fixed-paths/v1"` 返回；legacy 4 段不混入）。
 *
 * 口径（v1.3 §3.4 product 行 + G-IR §5.7 + 任务派发）：
 * - 按运营（convener）派发撰写/修订 `docs/product/<flowId>-intent-vN.md`（版本化，不原地改）；
 * - 不派发、不实现、不招人；不自行改方案/名单/架构/角色卡；
 * - 意图确认卡由幕僚（chief）呈，product 不发卡/不代客户确认；
 * - 报告回运营（fixed 生产线任务创建者）；固定路径不注入 VCA/版本决策/结构化 Git 工具。
 */
export const PRODUCT_FIXED_CONTEXT_SECTIONS: readonly RoleContextSection[] = Object.freeze([
  Object.freeze({
    id: "product-fixed-duty",
    text: "固定路径产品：按运营（convener）派发的任务撰写/修订产品意图 `docs/product/<flowId>-intent-vN.md`（版本化：新需求/变更出新版本，不原地改，旧版只读）。必含目标用户与场景、要解决的问题、范围与非目标、成功/验收标准、客户原话与约束、质量档位；不写实现方案。本段仅用于固定路径；与旧角色卡文本冲突时以本段为准。",
  }),
  Object.freeze({
    id: "product-fixed-boundary",
    text: "固定路径边界：只写 `docs/product/`；不派发任务、不实现、不招人；不自行改方案/名单/架构/角色卡（方案与名单由策划产出，方案卡由幕僚呈）。意图确认卡由幕僚呈，product 不发卡、不代客户确认。固定路径不注入 VCA/版本决策/结构化 Git 等 legacy 工具；升级/变更走普通版本化文档与方案卡。",
  }),
  Object.freeze({
    id: "product-fixed-report",
    text: "固定路径报告期望：收到运营派发的任务，完成后必须用 `submit_report` 回短报（完成/阻塞/证据/遗留）到真实任务创建者运营（convener）；缺关键信息先报阻塞，由运营/幕僚发卡或转客户，不猜。",
  }),
]);

/**
 * 提示块纯函数：按 `input.matrix` 选择 legacy/fixed 段（缺省 `"legacy-v1"`）。
 *
 * - legacy（缺省/显式 `"legacy-v1"`）：返回 legacy 段**同一冻结引用**（逐字不变；不读 facts/matrix 之外字段）；
 * - `"two-fixed-paths/v1"`：返回 fixed 段同一冻结引用；不读输入事实、不读盘。
 */
export function productContext(input: RoleContextInput): readonly RoleContextSection[] {
  // 防御性可选链：旧调用点可能不传参数（E1 前 `context()` 无入参）；无 matrix 一律 legacy（不猜测）。
  if (input?.matrix === "two-fixed-paths/v1") return PRODUCT_FIXED_CONTEXT_SECTIONS;
  return PRODUCT_CONTEXT_SECTIONS;
}
