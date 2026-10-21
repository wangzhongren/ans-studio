---
id: ui-platform-phase5b-reanchor-review
type: design
title: Phase 5B design audit 重锚落地复核（PM §十九）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: designed
revision: 3
related: [ui-platform-phase5b-new-visual-audit, ui-platform-phase5b-bootstrap-empty-state, ui-platform-phase4b-review, ui-platform-nova]
events:
  - date: "2026-10-21"
    kind: reviewed
    summary: 复核桌面UI 对 12 条 design audit 的重锚落地；W1/S3/W6b/W6/W9-12px/W10/W11/reduced-motion 设计口径成立，但 W9/W10/W11 被改成 CSS keyframes 而非 Motion，密度规范夹具与 S2 右缘测量未落地，旧审计脚本仍用旧选择器；结论 needs-work
---

# Phase 5B design audit 重锚落地复核（PM §十九）

**范围**：按 PM §十九 第 2 项，复核桌面UI [Phase 5A 独立验证响应](../../../桌面UI/docs/change/2026-10-21_phase5a-independent-verification-response.md) §三/§五 的 12 条 design audit 重锚，对照当前实现（`ChatStream.tsx`、`Sidebar.tsx`、`phase4b.css`、`shell.css`）与当前候选真实 Electron 5A 冒烟。**只读**；未改 `app/`、`src/`、`test/`；未提交。

**结论：needs-work。** 大多数新 DOM/测量口径已成立，P0（200% 输入区）与 P1（200% 错误态横滚）已由新冒烟证实修复；但 **W9/W10/W11 的转轮实现从 Motion 改成 CSS keyframes，违反 Nova §7.1 与 PM §十九「`.status-spinner`+Lucide+Motion」的重锚要求**；密度规范化夹具、S2 右缘测量尚未落地；旧审计脚本仍按旧 `.spin-arc`/`24px`/左缘/9 行断言，不能按“已重锚”记 pass。

## 一、复核对象与候选

| 项 | 值 |
| --- | --- |
| 桌面UI 响应 | `角色卡/桌面UI/docs/change/2026-10-21_phase5a-independent-verification-response.md` §三/§五 |
| 实现 | `app/renderer/src/chat/ChatStream.tsx`、`app/renderer/src/shell/Sidebar.tsx`、`app/renderer/src/shell/phase4b.css`、`shell.css` |
| 候选（本次冒烟） | `app/renderer/dist/src/index.html` SHA-256 `d1f76147ce70b0a89dc1a3567faaaafa8e91f562909173d227a9cc2e6d8b9aed`；JS `d16a48336220142860158099c468c94d57a4cbd6d260ebfbc7c78a54f21a678c`；CSS `e278df817feb006c758a23eea1782c87f9702cff3953ff2d170f9cf330f8511f`（19:23 构建） |
| 新冒烟 | 本角色只读运行 `test/桌面UI/phase5a-electron-smoke.mjs`，**19/19 checks、0 failures、零 console/CSP**；证据 `2026-10-21-phase5b-reanchor-evidence/phase5a-smoke/report.json` 与 7 张截图 |

> 候选仍在重建（本审计前后已多次变化）；本复核只对上述 hash 有效。完整 A–L 视觉审计必须在候选冻结后按新 hash 重跑，旧 5B 审计 hash 已过期。

## 二、12 条逐项复核

| # | 重锚 | 桌面UI 落地 | 复核结论 |
| --- | --- | --- | --- |
| 1 | `1-W1-行距16±1` | 映射到 `getComputedStyle(.chat-row).paddingBottom=16±1`；CSS `.chat-row{padding-bottom:16px}` | **设计 pass**；旧审计仍测 `.chat-pane` gap，需测试替换选择器 |
| 2 | `6-可见行≥9` | 桌面UI 接受规范化夹具/阈值（无提示条≥9、有提示条≥8、960≥4），但声明“等待规范夹具结果”，未实现 | **未落地**；旧脚本仍按 6 行/旧夹具判，不能确认；需测试/UIUX 落规范化夹具 |
| 3 | `S3-无chip时尾行兜底` | `.tool-current` 文本「正在工作」+ `BusySpinner`；chip hidden 夹具 | **设计 pass**；旧检查仍期望「等待你确认」/`.spin-arc`，需测试换文案/选择器 |
| 4 | `W6b-系统正文去前缀` | `classifyInjected` 转 `label`，`mi-body` 只留正文；注入行夹具 | **设计 pass**；旧夹具无注入行，需补夹具 |
| 5 | `W6-注入盒行高1.6` | `phase4b.css` 新增 `.msg-injected .mi-body{line-height:1.6}` | **产品 pass（P2 关闭）**；旧检查期望 `24px`，新期望 `19.2px`/比值 1.6，需测试更新 |
| 6 | `S2-chip对齐阅读列≤8` | 设计批准右对齐；CSS `.op-chip{align-self:flex-end}` | **未测量**；需断言 `|chip.right - pane.right|≤8`；旧检查仍测左缘（diff 734），需替换。若右缘 >8，桌面UI 需补 margin |
| 7 | `S1-截断目标仍可见` | 映射到超长目标夹具；当前 900 列夹具未触发截断 | **未落地（夹具）**；旧 `truncated=false` 不应判实现失败，需补超长目标 |
| 8 | `9-W9-徽标12pxSVG` | `.ti-status.st-working .ts-ico.status-spinner svg`，12px Lucide | **设计 pass**；旧选择器 `.spin-arc` 已可命中新类，但仍需改断言 |
| 9 | `9-W9-转轮0.9±0.2s` | **改为 CSS `.status-spinner.spin-arc` + `@keyframes v3spin 0.9s`；Motion 旧写法已删** | **不接受（P1 设计纪律）**：Nova §7.1 明确“生产只用 motion/react；不写 CSS keyframes”；PM §十九 明确重锚到 Motion。0.9s 时长正确，但机制错误 |
| 10 | `11-W11-loading同款转轮` | `.sys-loading` 加 `BusySpinner`（同 CSS 转轮） | **DOM pass（条件）**：12px/0.9s/reduced-motion 行为正确；需与 W9 一起改回 Motion |
| 11 | `10-W10-尾行含转轮` | `.tool-current` 加 `BusySpinner`；行高 26.6±2 | **DOM pass（条件）**：同上 |
| 12 | `12-reduced-motion静止弧` | CSS `animation-duration:0.01s; iteration-count:1`；弧可见 | **行为 pass（条件）**：reduce 下静态正确；若改 Motion 需用 `useReducedMotion` 重验 |
| 附 | `11-无第二转轮实现` | 全应用统一 `.status-spinner`；但 `v3spin` 与 `phase4a.css::ans-engine-spin` 均为 CSS keyframes | **未 pass 纪律**：转轮单一 DOM，但动画机制不是 Motion；引擎切换转轮同样 CSS keyframes，需一并核对 Nova §7.1 |

## 三、当前候选冒烟结果（P0/P1 修复）

`phase5a-electron-smoke.mjs` 19/19 通过，关键值：

- `200% long history keeps composer reachable and chat internally scrollable=true`：`chatClient=240`、`chatScroll=19396`、`overflowY=auto`、`composer.top=255.4`、`composer.bottom=430=innerHeight`。
- `200% empty/error state has no horizontal overflow and composer reachable=true`：`mid.scrollW=422=clientW`、`.chat-empty` 在列内、`composer.bottom=430`。**注意**：该夹具是 `hasRoles:false` 的空态，不是 `11-operator-card` 的长会话失败文案；具体 P1 错误态仍需定向 200% 复测。
- `busy tail uses the same 12px status spinner at 0.9s=true`（测试自身口径；其断言读取 `animationName.includes('v3spin')`，因此**把 CSS 机制固化进了新冒烟**，不能作为 Motion 合规证据）。
- 19/19、零 console/CSP；P0/P1 行为修复有新鲜证据。

**但**：该冒烟不覆盖完整 A–L、不覆盖 `6-可见行`、不覆盖 S2 右缘、不覆盖 BOOTSTRAP S0；且其转轮检查接受 CSS 动画，不能替代 Motion 设计纪律检查。

## 四、重锚落地结论与必改

**结论：重锚未全部落地，needs-work。**

1. **P1 转轮机制**：把 `BusySpinner` 改回共享 `motion/react` 实现（`useReducedMotion`；`animate={{rotate:360}}`，`duration:0.9`，`linear`，`repeat:Infinity`；reduce 时冻结），Sidebar/loading/tail 共用；删除生产 `@keyframes v3spin`（`ans-engine-spin` 也需按 Nova §7.1 核对或另行书面例外）。审计改为运行时角速度采样或 source guard，不再要求 `animationName`。若 PM 要保留 CSS keyframes，必须出具 Nova §7.1 修订，不由测试/实现默认改变。
2. **P1 密度**：测试/UIUX 落规范化夹具，按 ≥9/≥8/≥4 复测；不得用残留 `v3-pending/audit-pending` 夹具判密度，不得降到 6。
3. **S2 右缘**：补 `|chip.right - pane.right|≤8` 测量；旧左缘断言替换。若实测 >8，桌面UI 调 chip 对齐（不改变右对齐设计）。
4. **测试选择器/夹具**：`uiux-design-audit.mjs` 仍用 `.spin-arc`、`paneGap`、`bodyLineHeight==='24px'`、`fullyVisibleRows>=9`、chip 左缘、`等待你确认` 等旧口径；需按 §二逐项替换，否则 12 条无法执行。
5. **完整 A–L 重跑**：当前候选 hash `d1f76147…`（或冻结后的新 hash）重跑 1360/960/200% 视觉审计；旧 5B 审计 hash `8d202c2d…` 已过期，不得作为最终 pass。
6. **BOOTSTRAP S0**：另见 [BOOTSTRAP 空态设计依据](2026-10-21_design_ui-platform-phase5b-bootstrap-empty-state.md)；`CENTER_CTA_PRESENT/MENTION_COUNT/MENTION_IN_CENTER_EMPTY` 三项不是有意差异，桌面UI 需补回 S0 文案与中心 CTA。

## 五、边界

只写 `角色卡/UIUX设计师/`；未改 `app/`、`src/`、`test/`、其他角色资料或历史设计文档；未提交。UIUX 结论只作设计对齐证据，不代替测试独立验证、PM 门或独立验收。

## 六、冻结候选更新（2026-10-21 20:25）

在冻结候选 `c9d13918/f568e2aa/57d9575c` 上复跑后，本复核中的以下待办已关闭：

- **W9/W10/W11**：已改为共享 `app/renderer/src/chat/BusySpinner.tsx`（`motion/react`，`duration:0.9 linear infinite`，`useReducedMotion`，`data-spin-*`）；Sidebar/loading/tail 共用；生产无 `@keyframes v3spin`。design audit 31/31 中 `motion:"true"`、`spinDuration:"0.9"`、reduced-motion true。
- **密度**：1360 无提示条 9/613.4；带提示条 8/576.4（独立夹具）与 11/539.4（测试夹具）；960 6/381.4 或 8/335.6。
- **S2/S1**：`diffRight=0`；截断目标 rows=1/truncated=true。
- **S0**：1360/960/680 标题/说明/CTA/单一提及/无治理 CTA/点击+键盘通过；480 CSS CTA 首屏下（P2，与 composer 遮挡同源）。
- **MERGE/DEFAULT/RESTORE**：12/12、110/110、`RESTORE_NO_SUCCESS_DIVIDER=true`。

**本复核的 needs-work 结论更新为：仅剩 200%（480/680 CSS）sticky composer 遮挡报告/完整摘要/治理预览/镜像卡目标的 P1（见 [冻结候选最终审计](2026-10-21_design_ui-platform-phase5b-final-audit.md)）。** 之前关于 CSS keyframes/密度/S2 未落地的条目已关闭，保留为历史记录。

### 最终候选状态（2026-10-21 20:45）

唯一生产入口 `app/renderer/dist/index.html`（`3c4da2a2/f568e2aa/76fad7ce`）：5A 36/36、4B 70/70、design audit 31/31、带提示条密度 32/32、S0 25/25、main E2E_PASS。**W9-W12/密度/S2/S1/S0/遮挡全部关闭；本复核结论更新为 pass（P2 5 条登记）**。剩余 P2 为 480 镜像 chip 与动作带重叠、480 完整卡片标题在视口外、480 缺配条下半/按钮被 composer 覆盖、main 3× 200 截图位/命名、harness 标记注记。详见 [最终审计](2026-10-21_design_ui-platform-phase5b-final-audit.md) §十一。
