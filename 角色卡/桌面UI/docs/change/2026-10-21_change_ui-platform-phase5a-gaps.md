---
id: change-ui-platform-phase5a-gaps
type: change
title: Phase 5A 变更记录——Sidebar 身份、P7 待选择、虚拟窗口阅读锚点与旧测试迁移准备
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: delivered（5A 范围内；旧渲染器仍生产默认，5B 切换/删除/打包未执行）
related: [ui-platform-phase5a-scope, ui-platform-round-review, ui-contract-surface, ui-components, ui-platform-phase4b-governance-receipts]
events:
  - date: "2026-10-21"
    kind: implemented
    summary: 按 PM §十七放行实施 5A：三项缺口（Sidebar data/aria 身份、pendingKindFor 待选择、full replay 阅读锚点）、178 项旧测试逐名迁移台账与新增纯逻辑/源码守卫、四套件 ANS_RENDERER_ENTRY fail-fast；门禁/证据执行；未删旧渲染器/vendor/旧测试、未切生产入口
---

# Phase 5A 变更记录：三项缺口、测试迁移与目标切换准备

**授权**：PM [5A 复核与放行 §十七](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)（§17.1 最终入口 A、§17.3 env/packaged smoke、§17.4 P1-3 安全证据、§17.5 三项缺口、§17.6 178 项台账、§17.7 删除仅 5B、§17.9 allowed-diff、§17.11 并行派发）。范围/删除/迁移计划：[5A 范围文档](../../design/2026-10-21_design_ui-platform-phase5a-scope.md)。**5A 不切换生产入口、不删除旧渲染器/vendor/旧测试、不打包发布、不接真实模型/网络/.env。**

## 一、三项缺口实现与链接回归修复

### 1. Sidebar 身份（data/aria，无重复第三行）

- `app/renderer/src/shell/Sidebar.tsx`：删除可见 `{primary ? <span className="ti-badge">主入口</span> : null}`；保留 `.primary`/`.builtin`，新增 `data-primary="true"`/`data-builtin="true"`；`aria-description` 保持「主入口：默认入口与主路径；内置角色：随应用发布，无角色目录」；`title` = 显示名 + 身份说明。
- `.ti-count` 仍是唯一数字徽标（busy=1 + 排队；`title/aria-label` 带当前工作/排队明细）；状态标签不带数量。
- `shell/phase4b.css`：身份徽标移出第三行后 9 角色在 1362 高恰好铺满，补 `#role-tree { padding-bottom:16px; }` 保持「树自身可滚动、末行不贴边」的既有交互；不改行高/虚拟窗口/工具组/懒挂载。
- 官方检查：DELIVERY_NOTE `builtin identity stays data and accessible without duplicate third visible line` **官方 pass**；段 9/9。

### 2. P7「待选择」

- `chat/operator-view.ts::pendingKindFor(pending, roleId)`：按 `operatorSurfaces`（源面+镜像面）聚合未决请求；任一 `request.kind==="choice"` ⇒「待选择」，否则「等待你确认」；无 pending ⇒ `null`。不返回数量、不猜未知 kind（非 choice 一律等待确认）。
- `Sidebar.tsx`：等待态只把 `statusBadge(status,0).label` 替换为 `pendingKindFor` 结果；状态优先级（等待确认 > 工作中 > 错误 > …）不变；作答/失效后 pending 删除即回真实状态。镜像面角色同样显示同一未决事实。
- 单测：`test/桌面UI/operator-view.test.ts` 覆盖 confirm/choice/混合/镜像面/无 pending/终态移除/畸形 request；`work-view` 已有待处理类型与空队列文案。
- 官方检查：COMPLETE_FLOW `P7 choice pending separated from empty queue` **官方 pass**（角色树「待选择」+ 工作概览「待选择」/「无进行中或排队消息」）。

### 3. 虚拟窗口阅读锚点

- 新增 `app/renderer/src/chat/reading-anchor.ts`（纯逻辑，无 DOM/定时器/动画）：
  - `clipReadingText` 60 字前缀；`isStuckToBottom` 24px 容差；
  - `readingAnchorFromRows` 取首个有文本可见行：`{text, offset, stickToBottom:false}`；
  - `readingAnchorMatches`/`readingAnchorDelta`/`restoredScrollTop`；`remember/take/clearReadingAnchor` 按角色一次性登记。
- `chat-store.applyHistory`：full replay 且已有行、当前角色 pane 已挂载、读者非贴底时，在 `model.clear()` **之前**查询 `.msg,.tool-records,.sys-denied` 并登记锚点（渲染侧只读 DOM，不碰 Node/fs）。
- `chat/VirtualPane.tsx`：行高测量之后新增 `useLayoutEffect`；版本变化取走本角色锚点，按同一文本前缀找行，`chat.scrollTop += 新offset - 旧offset` 后刷新虚拟窗口；找不到同一行、贴底、差值 <0.5px ⇒ 不动。无平滑动画/计时器；行模型/行高/虚拟窗口/工具组/懒挂载/C1 未改。
- 单测：`test/桌面UI/reading-anchor.test.ts`（前缀/粘底/首行/同文本匹配/delta/一次性登记）。
- 官方检查：默认段 `full replay preserves content identity` **官方 pass**（before/after 同一行，offset 差 **0px**）；5A 冒烟 1360/960 均差 0，贴底 distance=0。

### 4. Markdown 外链导航真回归（5A 内修复）

- **问题**：新渲染器 `.md-link` 无点击委托，点击会导航整个窗口（桌面窗口实测 `NAVIGATION_BLOCKED=https://example.com/x`、`LINK_OPEN_EXTERNAL_CALLED=false`）；旧端 `renderer.js::onChatLinkClick` 一律 `preventDefault` 后经 `d.openExternal` 外开。
- **修复**：`chat/markdown.ts` 新增 `markdownLinkAction` / `handleMarkdownLinkClick` / `installMarkdownLinkHandler`，模块加载时在 `document` 上安装捕获监听：
  - 命中 `a.md-link` 且不在 `#document-read-text`（该区由 DocumentView 自行解析相对/内部链接）即 `preventDefault + stopPropagation`，绝不导航窗口；
  - 仅 http/https 调 `getDesktopBridge().openExternal(url)`，即 preload `app/preload.cjs` 的 `openExternal` → 主进程通道 **`app:open-external`**（Interface 白名单仅 http/https、长度 ≤2048）；
  - 相对/锚点/mailto/javascript/file/data：拦截但不外开；通道缺失记录 `data-open-result="unavailable"`、`title` 说明「未提供外部打开通道」；返回 `{ok:false}`/异常记录 `failed` + 原因；成功记录 `opened`，不假装成功；
  - 链接规则仍输出 `class="md-link"` + `rel="noopener noreferrer"`；卡片/报告/资料/治理预览共用同一 Markdown 管线与同一全局监听。
- **测试**：`markdown.test.ts` 新增 6 项（白名单/外链 preventDefault+openExternal/缺失与失败/相对锚点/文档区让行/安装卸载）；5A 冒烟新增 2 项：真实点击 `.md-link` 后 `webContents.getURL()` 不变、`will-navigate` 0 次、`app:open-external` 记录 `https://example.com/x`、rel 保持、页面状态 `opened`；200% P0/P1 与空态检查另行加入。冒烟 **36/36**。
- **未改**：`app/preload.cjs`/`app/main.ts`/`app/desktop/`（通道名与白名单只读核对）；无新依赖/DOM 例外；未弱化既有断言。

## 二、178 项旧测试逐名迁移

- 台账：[2026-10-21_phase5a-test-migration-ledger.md](2026-10-21_phase5a-test-migration-ledger.md)，共 **178 行**（renderer 108 + markdown 5 + tool-rows 53 + runtime-ui 12），逐名给「迁移 / 迁移+e2e / e2e / 退役 / 交接」与新位置或替代说明，不用计数代替名单；附「旧源码子串守卫 → 替代断言」表。
- 新增/扩充 `test/桌面UI/`：
  - `markdown.test.ts`（5 项旧名逐字 + esc 单源 + 6 项链接拦截）：语法/XSS/`html:false`/npm `markdown-it 15.0.3` + lockfile/vendor 退役/受限文档静态；
  - `tool-summary.test.ts`：mergePhases、相位文案、callSummary/foldSummaryText、denied 优先、工具名零特判（install/MCP）、shortTime；
  - `role-view.test.ts`：五角色文案/权力/内置、普通角色/首句/边界数、三组分组/primaryRoleId/组名；
  - `source-guard.test.ts`：渲染器边界（无 node/electron/fs/require/网络、`window.desktop` 仅 platform）、CSP/无内联、Markdown 单一管线、Sidebar 身份、治理事实不持久化、阅读锚点无计时器、组件单一来源、npm pin；
  - `ui-store.test.ts`：左栏宽度 clamp/默认 248/坏值回退/持久化/折叠/存储不可用；
  - `reading-anchor.test.ts`、`operator-view.test.ts` 扩充。
- 旧测试 **5A 不删除**；旧基线 `node --test test/桌面应用/*.test.ts` **683/683**（当前工作区计数；原记录 679 + 桌面窗口 Phase 5A 新增 4 项：入口接线、dev 回退 hook、导航兜底策略、主进程导航守卫接线；非桌面UI 改动），新 `test/桌面UI` **142/142**。
- 5B 才删除四个旧测试；`hot-path.test.ts`/`message-queue.test.ts` 旧段按交接表由桌面窗口在 5B 前替换/退役，不在本台账 178 项内。

## 三、e2e 目标切换（5A 默认旧入口）

- `uiux-v2.mjs`、`ime-enter.mjs`、`bench-storm.mjs`、`uiux-design-audit.mjs` 均支持 `ANS_RENDERER_ENTRY`，默认仍为 `app/renderer/index.html`（`bench` 默认 `BENCH_RENDERER_DIR/index.html`）；`uiux-design-audit` 原硬编码入口改为 env。
- 四套件在启动前校验显式目标：不存在即打印 `ANS_RENDERER_ENTRY does not exist: …` 并 **exit 2**，不静默回退/加载错误页；实测四套件均 exit 2。
- 未改任何既有断言；5B 才默认翻转到 `app/renderer/dist/index.html`。

## 四、门禁与证据（新入口 `dist/src/index.html`）

| 项 | 结果 |
| --- | --- |
| typecheck / typecheck:renderer / build | **0 / 0 / 成功** |
| CSP | 严格（`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`） |
| gzip9 | **288,552B**（JS 268,650 + CSS 19,209 + HTML 403）≤300KiB |
| 新单测 | **142/142** |
| 旧基线 | **683/683** |
| 5A 冒烟 | **36/36**，21 张 1360/960/200% 截图（含 200% 镜像卡/交付批次目标），零 console/CSP |
| DELIVERY_NOTE | **9/9**（identity 官方 pass） |
| COMPLETE_FLOW | **整段 41/41 PASS**（P7 + role reading 真滚动 + 1360/960） |
| 默认段 | 阅读锚点 **官方 pass**；PM §十九批准的 toggleDrift `closest('.chat-pane')` 重锚已由桌面UI 落地于 `uiux-v2.mjs`，**整段 110/110 PASS** |
| MERGE | 语义身份重锚已落地（同 request id + `data-state=open/decided` + confirm/anchors），**12/12 PASS** |
| MIRROR / QUEUE / GOV / JUDGE | 8/8 / 4/4 / 7 项报表 / 33/33 |
| G2 / SELECTOR / CONFIG / ROLE | 5/5 / 27/27 / 21/21 / 11/11 |
| SEND / TERMINAL / RUNTIME / FRESH | 8/8 / 22/22 / 17/17 / 4/4 |
| VISUAL | **54/54 PASS** |
| IME | **26 true / 0 false / E2E_DONE=1** |
| 延迟挂载 | **10/10** |
| TOOLFOLD | **19/19**；C1 150→170→170，**Δ=20px** |
| 4B 冒烟回归（链接修复后） | **70/70 / 0 failures**，零 console/CSP |
| bench（旧/新交替 4 轮，首轮预热，3 有效中位） | stormA **18.3**（旧 26.0）、stormB **17.7**（旧 17.7）、handler A **0.6**（旧 11.8）、B **0.6**（旧 1.0）、replay **6.2**（旧 16.6）、scroll **11.9**（旧 14.3）；全部阈值 pass；单轮 maxGap 最大 26.9ms（≤50） |

证据目录：`角色卡/桌面UI/docs/change/2026-10-21-phase5a-evidence/`（smoke、GHOST/FLOW/DEFAULT/VISUAL/TOOLFOLD、各段 report、IME、lazy、bench 原始+summary、gates/fail-fast）；门禁汇总见同目录 `gates.txt`。

## 四之二、独立验证 / UIUX 新视觉审计修复（第二轮）

- **A 组**：TERMINAL_MERGE 12/12、PROJECT_RESET 7/7、DUP 32/32、NOTICE 6/6、BLANK 6/6；COMPLETE_FLOW 整段 41/41（role reading 真滚动）。MERGE 旧 `window.__mergeCard` 同一 DOM 节点断言已按 PM §十九重锚为同 request id+状态+confirm/anchors，**已落地 `uiux-v2.mjs` 并 12/12 全过**；DEFAULT 旧 `parentNode` 已批准重锚 `closest(.chat-pane)`，**已落地，整段 110/110 全过**。产品修复：终态 sources 合并/history 提升、显式 loadProject fresh+清角色状态、pending history IPC、handback 保留、系统通知独立行+remainder、paneDebug queue/busy、special tool 生命周期、anchored replay 生命周期行独立、Drawer open flushSync/scroll layout。
- **B 组**：`selectRole` 同角色显式确认 openSession；发送失败按 `sessionCurrent` 失效句柄、补开失败 fail-closed；renderer diagnostics（replay/viewport/recovery/event-error）经 preload 白名单。main 新端 **E2E_FAILURES 空/exit 0**，repair 10 项全 true。
- **S0 空态**：`hasRoles=false` 与 `roles.length===0` 分流；空项目标题「项目尚未 bootstrap」、说明「与 <主入口> 对话…」、CTA `#btn-start-primary`（点击/Enter 才开会话）、仅 empty-title 一次提及、无治理 CTA、左栏无「未枚举」。5A 冒烟新增标题/点击/键盘检查。
- **UIUX P0/P1**：200% `#chat` 内部滚动 + composer sticky；`.col-mid` 200% 禁横溢；`sys-loading`/`tool-current` 统一 12px `BusySpinner`（Lucide + Motion rotate 360 0.9s，reduced-motion 静止）；`.mi-body` 1.6。5A 冒烟 36/36 含 200% 长历史 composer bottom=430=innerHeight、空项目无横溢、S0 标题/说明/CTA/点击/键盘、200% 镜像卡「镜像·主入口/来自报告员/动作」与交付批次标题+三项事实入镜且无横溢（UIUX 5B-F7 缺证据补齐）。
- **C/D**：C 10 条重锚映射与 D G3/G4 旧载体→新等价见 [独立验证响应](2026-10-21_phase5a-independent-verification-response.md)；design audit 已由桌面UI 按 §十九重锚（先 loadProject/selectRuntime('pi')/selectRole 再取新 DOM），**exit 0 / AUDIT_DONE，12 条 v3 全过、31 项 0 bad、密度 9 @1360 / 6 @960**。
- **门禁**：typecheck 0、build 成功、CSP 严格、gzip9 **288,552B**、新单测 142/142、旧基线 683/683、smoke 36/36、main 全绿、VISUAL 54/54、TOOLFOLD 19/19（C1 20）、IME 26/0、lazy 10/10；bench A 18.3/B 17.7/replay 6.2/scroll 11.9、maxGap 26.9（≤50）。

## 四之三、UIUX 最终审计 P1：200% sticky composer 遮挡目标内容（第三轮）

- **根因**：≤680 CSS 下 composer 为 `position:sticky; bottom:0`，实际高 174.6（480 CSS 约 185）；`#chat` `min-height:240` 在窄视口内高于可视区，目标滚到 chat 底部时被 composer 覆盖。桌面UI 现只验目标存在/rect 与 sw/cw，未验遮挡。
- **修复**：
  1. **紧凑输入区（≤680 CSS）**：底栏单行（`flex-wrap:nowrap`）、折叠 `.composer-scope`/`.composer-scope-demo`/`.compose-note`/键盘提示；composer padding 8/6；实测 **95 CSS**（680/480 均同），≤96 目标达成。480 CSS 进一步把审批/决策开关收成「复选框 + 单字 审/决」，完整文案保留在 `title`/`aria-label`，底栏不横溢。
  2. **滚动留白**：`#chat` 与 `.col-mid` 加 `scroll-padding-bottom:104px`；`#chat` `padding-bottom:104px`，目标 `scrollIntoView({block:'end'})` 后 bottom 落在 composer.top 之上。
  3. **治理预览**：`.col-mid:has(#governance-preview:not([hidden])) .composer { position:static }`，预览打开时输入区不粘底；预览 `overflow-wrap:anywhere` 防长路径横溢。
  4. **480 CSS 头部/空态**：session-head 压缩（隐藏 role-sub、动作按钮 5px/11px、context 单行省略）、治理状态单行省略、S0 空态字号/间距收紧并隐藏装饰图标；chat `min-height:200`。
- **实测（目标 bottom / composer.top，CSS px）**：
  - 680 CSS：报告完整摘要 320.4/335、证据 320.7/335、治理预览 326.2/586.98（static）、镜像动作 320.75/335、交付事实 320.76/335、S0 CTA 332.6/335；chat client 240。
  - 480 CSS：报告完整摘要 206.2/215、证据 205.8/215、治理预览 206.1/426.9（static）、镜像动作 206.1/215、交付事实 206.1/215、S0 CTA 209.7/215；chat client 200。
- **断言**：5A 冒烟新增 12 项「目标元素 bottom ≤ composer.top」+ 宽度/文档无横溢；覆盖 report/details/preview/mirror/delivery/S0 × 680/480。冒烟 **36/36**、**21 张截图**（`10-15-*680css/480css`）。
- **回归**：4B 冒烟 **70/70**（200% header wraps/notice wrap/容器无横溢全过）；design audit **exit 0 / AUDIT_DONE**（31 项 v3、0 bad）；main 新端 **E2E_PASS=true / E2E_FAILURES 空**；5A P0 composer 可达（680：h=95、bottom=430=innerHeight）仍通过。
- **新候选**：JS `index-T1im4gOp.js` SHA256 `f568e2aa…08e4095`；CSS `index-DbPZU_Oj.css` SHA256 `b52cfca1…4271fe`；HTML `dist/src/index.html` SHA256 `f372e111…5b5cc`；gzip9 **288,552B**（268,650 + 19,501 + 401）。

## 五、已知边界（未冒充通过）

- 200% sticky composer 遮挡 P1 已按 UIUX 建议修复并补断言；5B-F7 200% 镜像/交付目标截图已补齐（`07`/`08` + `10-15` 两档）。仍待 UIUX 书面依据：带提示条密度等价（当前夹具无提示条）、200% 其余 A–L 场景的 P2 叠加/命名观察；请 UIUX 按同一场景复跑最终 A–L。
- 默认段 toggleDrift 旧 `parentNode` 断言已按 PM §十九批准重锚 `closest(.chat-pane)`；MERGE 同一 DOM 节点断言批准重锚为同 request id+状态+confirm/anchors。COMPLETE_FLOW 整段 41/41 已通过。C 组 design audit 已按 §十九重锚并 **exit 0**（12 条 v3 全过、密度 9/6、Motion 0.9s）；D 组 P1_*/REPLAY/BOOTSTRAP 等价/依据见独立验证响应。
- 旧入口仍生产默认；最终入口 `dist/index.html` 的移源/Vite input/main.ts/main.mjs/packaged smoke 未执行，全部留 5B 原子批次。
- `main.mjs` 属桌面窗口，本次未改。

## 六、边界声明

- 只改：`app/renderer/src/**`（Sidebar、operator-view、reading-anchor、chat-store、VirtualPane、markdown/ui-store 的 DOM lib 引用、phase4b.css 树呼吸位）、`test/桌面UI/**`、四个 e2e 脚本、`角色卡/桌面UI/**`。
- 未删除旧渲染器/vendor/旧测试；未改 `App.tsx`/`main.ts`/preload/desktop/package/package-lock/vite/根配置；无新增依赖/DOM 例外；未弱化断言。
- 本文是 5A 实施记录，不是最终验收；最终由独立验收角色按 AC1–AC8 判断。
