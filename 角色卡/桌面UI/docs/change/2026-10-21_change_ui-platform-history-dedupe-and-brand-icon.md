# 桌面UI 历史派发去重 + 品牌图标接入（2026-10-21）

## 一、真机问题

genesis demo `todo-app-dev` 的 ANS replay 中，同一条 `[派发]` 同时以：

- `kind:"user"` 历史行；以及
- `kind:"event"` + `detail.source:"prompt-input"` 的 message 事件（归一化后同样进入 user/injected 投影）

存在（同 turnId、同文本）。`applyHistory` 只做「实时 vs 历史」去重，未做「历史内部」去重，渲染两行。

## 二、历史内部去重

- `app/renderer/src/chat/events.ts` 新增：
  - `historyProjectionKey(descriptor)`：仅对 `user`/`injected`（同组 user）、`system`、`delivery` 生成 `group|turnId|首行文本` 键；`assistant`/`reasoning`/`tool` 不参与。
  - `historyDescriptorHasIdentity` / `dedupeHistoryDescriptors`：同键保留一条；若后续条目带 `anchorKey`/`anchor`/`requestId` 而先前没有，则原位替换为带身份的一条。
  - `dedupeHistoryRows`：历史原始行版本，供 `applyHistory` 在重放前统一去重。
- `app/renderer/src/chat/chat-store.ts::applyHistory`：
  - 入口计算 `historyRows = dedupeHistoryRows(rows)`；full rebuild 使用 `dedupeHistoryDescriptors(historyRows.map(...))` 生成行与计数；append 分支对新增切片去重。
  - 不改变 `assistant` 同轮多行、不同 `callId` 工具行、终态/交互卡/报告行；`rowSignature` 仍按原始历史签名用于 replay plan。
- 单测：新增 `test/桌面UI/history-dedupe.test.ts` 4 项：
  1. 同一 turn 的 user 行 + prompt-input 同文 → 只保留一条 injected，且优先保留 `anchorKey` 身份；
  2. 两条不同 stepId 的派发（首行文本不同）→ 两条都保留；
  3. 同轮重复 assistant、不同 callId 工具行 → 不误删；
  4. 无 turnId / 无文本 → 不误合并。

## 三、品牌图标接入

- 复制 `app/desktop/assets/ans-studio-ans-icon.png`（1024×1024，黑底绿 ANS）到 `app/renderer/src/assets/ans-studio-ans-icon.png`（SHA256 `ff88e313…8d32c`）；Vite 打包为 `dist/assets/ans-studio-ans-icon-DOpmqMAU.png`。
- `TitleBar.tsx`：`.titlebar-mark` 由文字 `ANS` 改为 `<img alt="ANS">`（20×20），保留「治理会话工作台」；`titlebar-brand` 改为 `align-items:center`。
- `Sidebar.tsx`：`.workspace-brand` 文字 `ANS` 改为 `<img class="workspace-brand-mark" alt="ANS">`（30×30），保留 `<span>AGENT WORKSPACE</span>`。
- CSS：`.titlebar-mark` / `.workspace-brand-mark` 固定盒、`object-fit:contain`；无 CSP 变更（`img-src 'self' data:` 已允许打包资源）。
- 测试：`source-guard.test.ts` 新增「品牌图标使用打包 img alt=ANS、无文字 mark」；5A 冒烟新增 1 项真实 Electron 校验（titlebar 20px / sidebar 30px、`naturalWidth=1024`、`AGENT WORKSPACE`、无 `.titlebar-mark` 文本）；1360/960/200% 截图更新。

## 四、复跑结果（默认 `app/renderer/dist/index.html`）

| 项 | 结果 |
| --- | --- |
| `test/桌面UI/*.test.ts` | **147/147**（原 142 + 4 去重 + 1 品牌守卫） |
| 5A 冒烟 | **37/37**（含图标检查），21 截图，零 console/CSP |
| 4B 冒烟 | **70/70** |
| uiux-v2 默认段 | **110/110** |
| uiux-v2 MERGE 段 | **12/12** |
| uiux-v2 MIRROR 段（角色名修复轮） | **8/8** |
| uiux-v2 TOOLFOLD/C1 | **19/19**，C1 150→170 Δ=20 |
| uiux design audit | **31 项 v3，0 bad** |
| main 新端 | **E2E_PASS=true / E2E_FAILURES 空** |
| typecheck / typecheck:renderer | **0 / 0** |
| build | 成功 |
| bench 4 次（默认新入口） | stormA 中位 ~19.4（≤26）、stormB ~19.5（≤25）、handlerA 0.5–1.5、handlerB 0.7–1.6、replay 10.0–12.4（≤21.6）、scroll 3.6–15.0（≤19.3），全阈值 pass |

## 五、新 dist 哈希

- `app/renderer/dist/index.html` SHA256 `f779ac60c39d341db7f10d76bde343cc1424c99935bf1859679602427ca1c88b`
- `assets/index-CFjc0h-3.js` SHA256 `007c60aac1e2da0590d3e7ee257aa2973e016f9f7dffa906680952af02d0b6aa`
- `assets/index-BYYh-X8f.css` SHA256 `531d8035b44e909e3ee31efa0a2e014d3641102e4c61a7b42e7ce06d809b04b3`
- `assets/ans-studio-ans-icon-DOpmqMAU.png` SHA256 `ff88e313c9c6a41fa94f5e34b9e1798169ea7ffece2404e5c9fc6474f788d32c`
- gzip9 **288,931B**（JS 269,033 + CSS 19,500 + HTML 398）≤300KiB；CSP 严格、零内联。

## 六、边界

- 只改 `app/renderer/src/`、`test/桌面UI/`、`test/桌面应用/e2e/uiux-v2.mjs`、`角色卡/桌面UI/`；未改主进程/preload/package/vite/其他角色。
- 未新增依赖/DOM 例外；去重只作用于 user/injected/system/delivery 投影，assistant/tool/终态/卡/报告不参与。
- 新候选 hash 已变化；UIUX 如按旧 hash 审计，请按新 hash 复核品牌位与历史回放场景。

## 七、证据

- 5A/4B 报告：`/tmp/ans-phase5a-smoke/report.json`、`/tmp/ans-phase4b-smoke/report.json`（本轮）。
- uiux：`/tmp/ans-uiux-default-icon/report.json`、`/tmp/ans-uiux-merge-icon/report.json`、`/tmp/ans-toolfold-icon/report.json`。
- bench：`/tmp/ans-bench-icon-{1..4}.json`；main：`/tmp/ans-main-icon/report.txt`；design audit：`/tmp/ans-design-audit-icon/report.json`。
