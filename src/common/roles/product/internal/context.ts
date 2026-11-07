// product 角色模块内部：产品上下文与报告期望（纯数据；E0.3 §3.3 第 7 条）。
//
// `context().text` 是角色模块自有的**静态模板**：不嵌入运行时秘密、账本内容或未脱敏证据；
// 资源引用只声明 path/version/sha256（读取由宿主执行，角色模块不读盘）。
// product 没有应用资源文件（`docs/product/` 是项目写区，不是角色模块资源），因此不声明 resources；
// 项目 `docs/workflow.md` 等由宿主在上下文装配时另行提供（E0 D5/Q4）。

import type { RoleContextSection } from "../../../../model/role.ts";

/** 产品上下文/报告期望提示块（顺序稳定；id 在 product 模块内唯一）。 */
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

/** 提示块纯函数：返回同一份冻结静态数据（不读输入事实、不读盘）。 */
export function productContext(): readonly RoleContextSection[] {
  return PRODUCT_CONTEXT_SECTIONS;
}
