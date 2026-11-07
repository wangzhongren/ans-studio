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
 * 本实现不读取 `input.facts`（api-spec 登记“context 不消费 facts”）；宿主仍可按自身规则装配
 * 其他 section（项目 workflow 由宿主另行提供，来源/版本/hash 单列）。
 */
export function chiefContext(_input: RoleContextInput): readonly RoleContextSection[] {
  return SECTIONS;
}
