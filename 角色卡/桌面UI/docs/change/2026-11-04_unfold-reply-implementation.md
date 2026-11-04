---
id: unfold-reply-implementation
type: change
title: 幕僚回复不再折叠（客户直修）实施记录
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: implemented-unverified
related:
  - docs/communication/2026-11-04_issue-unfold-chief-reply.md
  - 角色卡/桌面UI/docs/change/2026-11-04_unfold-reply-evidence/probe-unfold-reply.mjs
events:
  - date: "2026-11-04"
    kind: created
    summary: 按客户直修指令移除 assistant（幕僚）回复的 reply-original 折叠：settled/回放一律直接原文显示；task-request 折叠与其它折叠不变；typecheck 0、build 0、UI 403/403、phase4b smoke 72/72、探针 before 6/6 / after 6/6
---

# 幕僚回复不再折叠（客户直修）实施记录

- **任务 / 档位**：`2026-11-04_unfold-chief-reply`（客户直修） / 渲染层最小修复（跳过调研/方案/独立复核）。
- **角色 / 节点**：桌面UI（渲染进程属主，固定角色上下文）/ 只改渲染层展示。
- **worktree / 分支 / 基线**：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\unfold-reply-fix`（分支 `fix/unfold-reply`）；基线 `origin/main` `1e3268b1a5d5f311255e616e4e271dfd6d376008`（v1.9.1 发布合并已入 main）。
- **状态**：**`implemented-unverified`**。已实现并完成本角色自测与真实 Electron 前后证据采集；**未 commit、未 push、未验收**。

## 1. 客户直修依据与边界

- 需求记录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\customer-authorization-plane\docs\communication\2026-11-04_issue-unfold-chief-reply.md`（9 行 / 1165 字节；SHA-256 `f5a838ef467ea50add3ff52b9a380533f5f7345cf28de858752925a82eaac6a2`；该文件为派发侧 worktree 的未跟踪输入，本次只读）。
- 客户原话：「这个不应该折叠，应该原文显示」「幕僚说的话，怎么折叠起来干嘛呢。」
- 统筹决定：**直接修，本轮只改渲染层**；禁止改 `app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`（含 shared i18n 文案）；**不删除既有 i18n key / label 常量、不新增 key**；报告卡/交付卡/证据/回执等既有折叠保持不变。

## 2. 改动前行为 vs 改动后行为

| 场景 | 改动前（基线 `1e3268b`） | 改动后（本候选） |
| --- | --- | --- |
| 已报告轮次的 assistant（幕僚）回复（settled 后） | 折成 `<details class="reply-original">`，默认关闭；receiver 轮 summary 为「本轮交付处理回复原文（展开）」，普通报告轮为「本轮角色回复原文（展开）」 | **不再折叠**：assistant 行无 `details` 包裹，正文直接显示（原 `msg-assistant` 结构与 Markdown 管线不变） |
| 已报告轮次的 assistant 回复（cold history 回放） | 回放行带 `replay=true`，同样折成 `reply-original` | **不再折叠**：回放路径（`applyHistory` → `foldRowsForRole`）同样不生成 `reply-original` |
| 已报告轮次的 user 任务请求 | 折成 `details.task-request`，默认关闭，summary「任务请求原文」 | **不变**（同一 `applyFoldToRow` 路径，仅保留 user 分支） |
| 报告卡 / 交付卡 / 证据 / 回执 / 工具组折叠 | 各自既有折叠 | **不变**（本函数只处理 user/assistant 普通文本行；工具组默认开合仍由 `settledTurnsByRole` 驱动） |
| i18n key 与 label 常量 | `replyOriginalLabel` / `deliveryReplyLabel` / `taskRequestLabel` | **保留不动**；`ChatRow` 仍保留 `reply-original` 历史数据兼容渲染 |

## 3. 写集与实际改动

### 3.1 修改（6）

| 路径 | 行数（改后） | +/−（相对基线） | SHA-256（改后） | 对象哈希（blob） |
| --- | ---: | --- | --- | --- |
| `app/renderer/src/chat/chat-store.ts` | 2684 | +6 / −19 | `9ef30656928592aaf8ccbae163907b1ca3e84481abc540fc0b841c1d47c3ea3f` | `85dc3d3c19a32d87b0feef71e260b31f81ce4eff` |
| `app/renderer/src/chat/ChatRow.tsx` | 978 | +5 / −2 | `d3c07e0202f5c19c6ef3751d43742c5a6af54db110e3864fb1659cc5b303b30b` | `e807fee5b61966508eaf774d609104455ff5fafa` |
| `app/renderer/src/chat/report-view.ts` | 514 | +1 / −0 | `ba95bdc099b1f76caca2bbf59552a16f10c2834bd9f54b4f10a47edddec97600` | `953160ef74aec7fda26362aa6eecdbeb275daa2a` |
| `test/桌面UI/phase4b-electron-smoke.mjs` | 1345 | +48 / −0 | `ab003adb895ca88d11fb86f98d2502c4f6aa8b30a521dcca6b2dff918145002f` | `7e1a0a2dd3e3e7c98e6b00996a96403fa84974b5` |
| `test/桌面应用/e2e/uiux-v2.mjs` | 1554 | +8 / −8 | `af78685a937998b47aca713af2952c910a4c68c358130d1da3d8280c08e8ec3b` | `63836bf363bc67e98b79de6fb8e8451c474e4401` |
| `test/桌面UI/source-guard.test.ts` | 287 | +15 / −0 | `8aca9fcd273356c5bf2cf4c0bef38b8f4e5a5687285c66256a42e55f83dcd9b6` | `01991eccc281f0d5fb5cceafa8c2264276f5ffdc` |

合计 **+83 / −29**（净 +54 行；`raw/diff.patch`，覆盖上述 6 个文件）。无 i18n 文案改动、无新增依赖、无构建配置改动、无主进程/preload/src 改动。

### 3.2 新增（证据与探针，未跟踪）

- `角色卡/桌面UI/docs/change/2026-11-04_unfold-reply-evidence/probe-unfold-reply.mjs`（229 行 / 12578 字节；SHA-256 `d3d35797789b14351d8da4101646fce63568e2252926053dd95c3ac23cf20ec3`；对象哈希 `30ff672e88449621f23b5ad8deb5e696b870c2bb`）
- `before/`、`after/`、`raw/`（截图 / 探针结果 / 验证日志 / 基线快照 / diff / 候选哈希）
- 本记录。

### 3.3 未写

`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`（含 `src/common/shared/i18n/messages/**`）、`package.json`/`tsconfig*`/`vite.config.ts`、其它角色资料、角色卡/边界、`docs/communication|scheduling|acceptance`。未使用任何 stash；未 commit、未 push。

## 4. 实现要点

1. **单一折叠策略**：`applyFoldToRow` 只保留 user 行分支（`task-request`）；assistant 分支整体删除，早退改为 `reported.has(turnId)`；doc comment 注明 2026-11-04 客户直修与 `reply-original` 的历史兼容定位。
2. **settled 状态保留**：`settledTurnsByRole` / `setSettled` 仍服务工具组默认折叠（`groupDefaultOpen`）。初版误删由 `npm run typecheck:renderer` 报 TS2552 捕获并已恢复；本改不改变工具组行为。
3. **渲染兼容**：`ChatRow.tsx` 的 `Folded` 仍识别 `reply-original`（便于历史数据/外部快照回放）；但当前 store 已无任何生成点，source-guard 新增守卫防回潮。`AssistantRow` 继续经 `Folded` 包裹，无 `fold` 属性时原样返回 children，DOM 结构与普通 assistant 行一致。
4. **回放一致**：`applyHistory` 末尾的 `foldRowsForRole` 不再对 assistant 生效；cold history 场景由探针与 smoke 双重覆盖。
5. **其它折叠不触碰**：报告卡/交付卡/证据/回执渲染路径未改；`task-request` 逻辑原样。
6. **i18n 边界**：零删除、零新增；`report-view.ts` 的 label 常量保留，并在注释中说明「assistant 不再生成 reply-original，常量按 i18n 管理边界保留」。

## 5. 验证原始结果

环境说明：worktree 已 `npm ci`；Electron 二进制缺失时用 `node node_modules/electron/install.js` 补装（Electron v44.7.0，`node_modules/electron/dist/electron.exe` 存在）。以下均在本 worktree 内执行。

| 步骤 | 命令 | 结果 | 原始输出 |
| --- | --- | --- | --- |
| 类型检查 | `npm run typecheck:renderer` | exit 0，无错误输出 | `raw/typecheck-renderer.log` |
| 构建 | `npm run build:renderer` | exit 0，`✓ built in 383ms` | `raw/build-renderer-final.log` |
| 单测 | `node --test "test/桌面UI/**/*.test.ts"` | **tests 403 / pass 403 / fail 0 / skipped 0**（726.6ms） | `raw/renderer-ui-tests.log` |
| 冒烟（改后） | `node node_modules/electron/cli.js test/桌面UI/phase4b-electron-smoke.mjs "" <raw/smoke-after>` | **72 checks / 0 failures**；zero console errors / zero CSP violations；新增 3 条 unfold 检查均 true；截图 `unfold-reply-direct.png` | `raw/after-phase4b-smoke.log`、`raw/smoke-after/report.json` |
| 改前探针 | `node node_modules/electron/cli.js .../probe-unfold-reply.mjs before <before>` | **6 checks / 0 failures** | `before/probe-result.json` |
| 改后探针 | `node node_modules/electron/cli.js .../probe-unfold-reply.mjs after <after>` | **6 checks / 0 failures** | `after/probe-result.json` |
| uiux-v2 视觉模式（附加） | `ANS_VISUAL_V2_UI_ONLY=1 node node_modules/electron/cli.js test/桌面应用/e2e/uiux-v2.mjs` | 更新后的前两条断言通过；运行在**与本改无关**的既有断言「V2 modal declares dialog and makes whole background inert」处停止（夹具缺少 `session:role-states` / `network:get-state` / `preferences:get` / `background-tasks:list` 桩，基线既有漂移）；后段折叠断言未执行，其等价 DOM 行为由改后探针覆盖 | `raw/after-uiux-visual.log`、`raw/uiux-visual-after/report.json` |

探针改前/改后关键事实（无点击）：

- 改前：`assistantInsideFold = "reply-original"`；`replyOriginalCount = 1`；`replyOriginalLabels = ["本轮交付处理回复原文（展开）"]`；`taskRequestCount = 1`、`taskRequestOpen = false`、summary「任务请求原文」；交付卡未被折叠。
- 改后：`assistantInsideFold = null`；`assistantDirectVisible = true`；`replyOriginalCount = 0`；summary 列表不含「本轮交付处理回复原文」/「本轮角色回复原文」；`taskRequestCount = 1`、`taskRequestOpen = false`、summary「任务请求原文」；交付卡未被折叠。
- 回放：改前 cold history 仍折（count 1 / reply-original）；改后 cold history 直接显示（count 0 / direct）且 task-request 折叠不变。

## 6. 截图与证据路径

证据目录：`角色卡/桌面UI/docs/change/2026-11-04_unfold-reply-evidence/`

- `before/unfold-reply-before.png`（改前：有交付轮次 settle 后，幕僚回复折成「本轮交付处理回复原文（展开）」行）
- `before/task-request-unchanged-before.png`（改前：任务请求折叠行）
- `after/unfold-reply-after.png`（改后：同一轮次，幕僚回复原文直接显示，无折叠行）
- `after/task-request-unchanged-after.png`（改后：任务请求折叠保持）
- `raw/smoke-after/unfold-reply-direct.png`（冒烟内同场景截图）
- `raw/smoke-after/report.json`、`raw/after-phase4b-smoke.log`、`raw/typecheck-renderer.log`、`raw/build-renderer-final.log`、`raw/renderer-ui-tests.log`、`raw/after-uiux-visual.log`
- `raw/diff.patch`、`raw/baseline-*`（6 个改前文件快照）、`raw/candidate-hashes.txt`

## 7. 候选哈希（改前 → 改后）

| 文件 | 改前 SHA-256 | 改后 SHA-256 | 改后对象哈希 |
| --- | --- | --- | --- |
| `chat-store.ts` | `0b88d11ecca7bb9e26546f929bd098e10db6c64720f24a1fcf0a4c3a0bbdb88c` | `9ef30656928592aaf8ccbae163907b1ca3e84481abc540fc0b841c1d47c3ea3f` | `85dc3d3c19a32d87b0feef71e260b31f81ce4eff` |
| `ChatRow.tsx` | `47969c0e6e97a3435780214e95b1b51e1c04591bc6dd267a9eac6c2e779ccf6a` | `d3c07e0202f5c19c6ef3751d43742c5a6af54db110e3864fb1659cc5b303b30b` | `e807fee5b61966508eaf774d609104455ff5fafa` |
| `report-view.ts` | `0a9e6d78bef512cf9566c26652939265f92de4a677fd43b3fb48572f6eeb2b64` | `ba95bdc099b1f76caca2bbf59552a16f10c2834bd9f54b4f10a47edddec97600` | `953160ef74aec7fda26362aa6eecdbeb275daa2a` |
| `phase4b-electron-smoke.mjs` | `e84ef409b82136eb096a1d1891cd507049a61fdc97aa73f45710cece059e47f8` | `ab003adb895ca88d11fb86f98d2502c4f6aa8b30a521dcca6b2dff918145002f` | `7e1a0a2dd3e3e7c98e6b00996a96403fa84974b5` |
| `uiux-v2.mjs` | `f38d919212db6a3252b498922b62ed3f5c2ef54f04c99076bc497d8aa17b8f67` | `af78685a937998b47aca713af2952c910a4c68c358130d1da3d8280c08e8ec3b` | `63836bf363bc67e98b79de6fb8e8451c474e4401` |
| `source-guard.test.ts` | `480564e15c49762911d8981533a23843b0f7685b2804b344d6e3ce66f7a33e9b` | `8aca9fcd273356c5bf2cf4c0bef38b8f4e5a5687285c66256a42e55f83dcd9b6` | `01991eccc281f0d5fb5cceafa8c2264276f5ffdc` |

## 8. 风险与未覆盖项

- `reportedTurnsByRole` 的 `receiver` 字段仍被记录但不再被读取（当前折叠策略不区分接收方）；保留 Map 形状以免扩大改动面，后续可单独简化。
- `reply-original` 的渲染支持、CSS 与 i18n key / label 常量保留为历史数据兼容；当前仓库已无生成点（source-guard 守护）。若外部持久化快照直接携带 `fold: "reply-original"`，仍会按旧样式折叠；本仓库现有事件/历史路径不携带该字段。
- `uiux-v2` 视觉模式在基线既有断言处停止（与本改无关的夹具漂移，见 §5）；其后续更新的折叠断言未在当前环境执行，但改后探针以同口径 DOM 断言覆盖 settled receiver 与 cold replay。
- 会话启动目录为 `delivery-inline-report-fix`（发布流程 worktree）；本会话未修改其文件、未执行其提交；全部实际写集位于 `unfold-reply-fix`。
- 未改历史记录/设计文档中关于旧行为的描述（历史事实，不改写）。

## 9. 未提交声明

本候选 **未 commit、未 push、未验收**；`unfold-reply-fix` 工作区包含 6 个已修改文件与未跟踪的证据目录。未使用任何 stash；未触碰 `customer-authorization-plane`、`delivery-inline-report-fix`、`composer-buttons-fix` 及其它 worktree 的工作文件。
