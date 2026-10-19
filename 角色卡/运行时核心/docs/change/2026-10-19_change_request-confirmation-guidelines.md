---
id: request-confirmation-guidelines-runtime-core
type: change
title: request_confirmation 组卡指引同步「preview 逐路径正文」呈现前完整性闸
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [boundary-write-guard-runtime-core]
---

# `request_confirmation` 组卡指引同步呈现前完整性闸

## 背景

编排角色在 `src/pipeline/orchestration/run-role.ts` 接入 **preview 完整性闸**（2026-10-19 真机 op-2）：写盘类确认卡声明了写入路径（显式 `paths` 优先，否则 preview 声明）时，preview 必须为**每一条**路径给出可核对正文/结构，否则卡片不呈现、工具直接返回失败（`common/编排/confirmed-writes.ts::validateConfirmPreviewCompleteness`）。

模型此前只被告知「preview 必须列出路径」，不知道**每条路径还要带正文**；若不把组卡方法写进工具文案，模型只能靠一次失败回执反复试错。本批按协调者要求同步 `request_confirmation` 的 description / promptGuidelines（描述的单一来源在 `schema.ts`；`tools.ts` 经 `describeTool` 装配，本身不含文案）。

## 改动

1. `src/provider/runtime/schema.ts`（`request_confirmation`）：
   - `description`：在既有「preview 必须列出具体路径 / 未列出不获许可」之后补——写盘卡应提供**显式 `paths`**，preview 须为**每一条**声明路径给出可核对正文/结构：路径作为 Markdown 标题（如 `### <路径>`）或代码围栏说明（如 ```md <路径>```），锚点后紧跟非空正文/代码；**缺失任一路径正文时系统在呈现前拒绝并要求补全，不会先给客户看半张卡**。
   - `preview` 参数说明：补写盘卡的逐路径正文要求与「呈现前拒绝」后果（英文，与既有参数说明同语言）。
   - `paths` 参数说明：补「写盘卡应提供该列表；preview 须为每一项给出标题/围栏锚点 + 非空正文，否则卡片在呈现前被拒绝」。`paths` 仍为**可选**，`required` 仍只有 `title`——未改参数语义、未新增必填字段。
   - `promptGuidelines`：原「**优先**用 `paths`」改为「**应**提供显式 `paths: string[]`」（保留「只放真正要写的目标、不得含仅引用文件」）；新增一条组卡指引——逐路径锚点 + 非空正文（直到下一条路径锚点或 preview 末尾）、**写入内容须与 preview 正文一致且范围不得超出所预览内容**、缺失时呈现前拒绝/工具失败并要求补全、一次组完整不要靠反复试错。
   - 既有指引全部保留：仅 su 的四棵预置写盘目录、写盘一律先确认、`confirmed:true` 是唯一获准凭据、列出路径 ≠ 获准、未获同意不写盘等。
2. `src/provider/runtime/tools.ts`：仅更新 `makeRequestConfirmationTool` 的 JSDoc，记录编排侧呈现前完整性闸及其失败经 `declined` 如实转达；**无运行时行为/参数变化**。
3. 测试：
   - `test/runtime-core/tools.test.ts`：schema 文案用例补 8 条断言（显式 `paths`、每一条、`### <路径>` 示例、代码围栏说明、锚点后紧跟非空正文/代码、写入内容一致、呈现前拒绝该卡、不先给客户看半张卡）。
   - `test/runtime-core/confirmation-paths.test.ts`：schema 用例补 3 条断言（description 级逐路径正文要求、呈现前拒绝并要求补全、半张卡禁令）。
   - 既有断言（su 四棵树、paths 上限与非法拒绝、列出 ≠ 获准等）原样保留。

## 验证

- `node --test "test/runtime-core/**/*.test.ts"`：**204 计 / 203 过 / 0 红 / 1 跳过**（跳过项为 `boundary-write-guard` 的 Windows 平台条件用例，darwin 上按设计 skip）。
- `npm run typecheck`：**exit 0（0 错）**。
- 跨角色回归抽查：`node --test test/pi-adapter/interactive-execution-mode.test.ts` **5 计 / 5 过**（其钉住的「preview 必须列出具体路径 / 未列出 / 不等于 / confirmed:true」文案断言仍满足）。
- 未跑真实模型/凭据/网络；未 git 提交。

## 跨角色影响

- 编排侧闸（`run-role.ts` / `common/编排/confirmed-writes.ts`）**未改动**；本批仅使工具文案与其实测锚点语义（标题 / 围栏说明 / 一行一路径声明 + 其后至少一行非空正文）同口径，模型无需靠失败回执试错。
- 文案锚点示例用 `### <路径>`，与编排回执中的 `## <路径>` 同级可用（闸接受 1–6 级标题）。
