---
id: ui-platform-phase5a-scope
type: design
title: Phase 5A 范围、删除清单与测试迁移计划（旧渲染器下线前的对照与准备）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented（PM §十七放行；实施记录见 change/2026-10-21_change_ui-platform-phase5a-gaps.md）
related: [ui-platform-round-review, ui-platform-phase4b-review, ui-contract-surface, ui-components, check-ledger-phase3a]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按 PM §十六（Phase 5 授权，5A→5B 硬顺序）产出 5A 范围、三项缺口实现计划、旧渲染器/vendor/旧测试删除清单与测试迁移计划、e2e 目标切换、5B 切换前置、写集/证据/热路径与风险；仅规划，不写实现代码
---

# Phase 5A 范围、删除清单与测试迁移计划

**依据**：PM [Phase 5 授权 §十六](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)（§16.2 范围、§16.3 5A→5B 硬顺序、§16.4 角色写集、§16.6 约束）；UIUX [4B 评审 revision 3](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase4b-review.md)；测试 [4B 验证/重验/200% 收口](../../../测试/docs/change/2026-10-21_change_phase4b-200pct-reverification.md)；桌面UI [4B 变更/证据](../change/2026-10-21_change_ui-platform-phase4b-governance-receipts.md)；契约面 [ui-contract-surface](../feature/ui-contract-surface.md)；旧渲染器目录与测试现状（只读核对）。

**性质**：仅规划。本文不写实现代码、不改 `app/`/`test/`/依赖/主进程/preload/desktop/旧渲染器/根配置；未运行应用、测试、构建或网络；不读 `.env`。**5A 门通过前不删除任何旧文件。**

## 一、5A 范围

**目标**：旧渲染器仍是生产默认；完成全量双端快照/逐名对照、三项 Phase 5 缺口、旧测试迁移与 e2e 目标切换准备、本地打包 dry run 计划、最终 UIUX 审计计划；测试独立验证。**5A 只准备，不切换、不删除。**

### 1.1 三项 Phase 5 缺口

#### A. Sidebar 身份徽标（identity 在 data/aria，无重复第三行）

**现状**：`Sidebar.tsx` 对主入口额外渲染可见 `.ti-badge`「主入口」，与 `ti-power`/`ti-builtin` 形成第三行；GHOST 段 `builtin identity stays data and accessible without duplicate third visible line` 因此失败（官方段止点）。

**目标语义**：身份（主入口/内置）只存在于 class/data/aria 与 `title`，不额外占一行可见徽标。

**实现计划（5A）**：
- `app/renderer/src/shell/Sidebar.tsx`：删除 `{primary ? <span className="ti-badge">主入口</span> : null}`；保留 `.primary`/`.builtin`、`aria-description`（主入口：默认入口与主路径；内置角色：随应用发布，无角色目录）；补 `data-primary="true"`/`data-builtin="true"` 供机器断言；`title` 保持 显示名 + 身份说明。
- 保留 `.ti-count`（唯一数字徽标）、状态标签、权力/内置说明行不变；不隐藏角色、不缩小字号。
- 断言：`app/renderer/src` 内无 `.ti-badge` 引用（源码守卫）；GHOST 段该检查 pass；角色行仍含权力副标题与状态。
- 证据：1360/960/200% 五角色左树截图；DOM：`classList.primary/builtin`、`data-primary/data-builtin`、`aria-description` 含「主入口」「内置」、无 `.ti-badge`。

#### B. P7 角色树「待选择」文案

**现状**：`Sidebar` 状态标签统一显示「等待你确认」；默认段 `P7 choice pending separated from empty queue` 要求角色树包含「待选择」（工作概览已按 `pendingViews` 显示待选择）。

**目标语义**：状态标签仍是 **状态**（不显示数量）；当该角色存在未决 `choice` 请求时标签为「待选择」，否则仍「等待你确认」。确认/失效/作答后回到真实状态。

**实现计划（5A）**：
- `app/renderer/src/chat/operator-view.ts`（或 work-view）新增纯函数 `pendingKindFor(pendingOperator, roleId)`：按 `operatorSurfaces` 聚合未决请求，任一 `kind==="choice"` ⇒ `"待选择"`，否则 `"等待你确认"`；无 pending ⇒ null。
- `Sidebar.tsx`：状态徽标 label 在 `status==="waiting"` 时用该纯函数结果（待选择/等待你确认），`aria-label`/`title` 同步；不改变优先级（等待确认 > 工作中 > 错误）、不新增可见计数。
- 纯逻辑单测：choice/confirm/混合/镜像面/无 pending/终态移除；默认段 P7 与工作概览分离检查 pass。
- 证据：1360/960/200% 角色树「待选择」截图 + 工作概览「待选择」/空队列文案。

#### C. 虚拟窗口阅读锚点（`full replay preserves content identity`）

**现状**：默认段在 full replay（历史重写/前插行）后同一阅读行相对聊天顶位移 >2px，官方止点；Phase 3 行模型/虚拟窗口未实现阅读锚点恢复。

**目标语义**：full replay（非贴底读者）前后，正在阅读的同一行相对聊天视口顶位移 <2px；贴底读者仍贴底；不改变行高/虚拟窗口/工具组/懒挂载语义。

**实现计划（5A）**：
- 新增纯逻辑 `app/renderer/src/chat/reading-anchor.ts`：`captureReadingAnchor(chat)`（首个可见 `.msg/.tool-records/.sys-denied` 的稳定文本前缀 + 相对 chat 顶偏移 + stickToBottom）、`restoreDelta(anchor, nextRect)`（新位置差值）、`shouldRestore(anchor)`（非贴底、文本可定位）。
- `chat-store.applyHistory`：full replay 前通过 interface-only 的 DOM 捕获（渲染侧只读，不碰 Node/fs）记录 `{roleId, anchor}` 到模块级 `pendingReadingRestore`；`paneVersions` 更新后由 `VirtualPane` 的 `useLayoutEffect`（版本变化且存在本角色 restore 请求）测量新行位置，按差值调整 `#chat.scrollTop`，清除请求；找不到同一文本 ⇒ 不调整（不猜、不跳）。
- 边界：仅在 `!stickToBottom` 时恢复；贴底路径仍走现有 `tail`/`scrollHeight`；不引入动画/计时器；不改变 `rowModel`/`rowGap`/`CHAT_ROW_GAP`/锚点卡逻辑。
- 单测：纯 delta/定位/贴底拒绝/找不到行不调整；e2e 默认段 `full replay preserves content identity` 官方 pass，并补「贴底读者仍贴底」「前插/尾随/重写三形态」检查；bench 覆盖 replay/scroll。
- 证据：full replay 前后 1360/960 截图与 offset 记录。

### 1.2 旧测试迁移计划（先迁后删）

**迁移原则**（PM Q5/G9）：先补行为断言/纯逻辑与源码守卫，再删除旧守卫；逐测试名台账（old file::test name → new file/action）在 5A 门前列全，不用计数代替名单；不静默丢弃覆盖。

**旧测试现状**（只读）：`test/桌面应用/` 中与旧渲染器相关 6 个文件：`renderer.test.ts`（108）、`markdown.test.ts`（5）、`tool-rows.test.ts`（53）、`runtime-ui.test.ts`（12）、`hot-path.test.ts`（含旧 renderer.js/markdown.js/vendor 段）、`message-queue.test.ts`（含旧 renderer.js/styles.css/role-status.js 源钉与纯逻辑段）。旧四文件共 178 tests，属 679 基线。

| 旧文件 | 迁移动作 | 新落点 |
| --- | --- | --- |
| `markdown.test.ts`（5） | **XSS 负例与受控渲染全部先迁**：`<script>`/`<img onerror>`/`javascript:`/引号注入/图片原文/表格单元格/围栏码/链接白名单/配置 `html:false`；vendor sha256 pin **退役**（改 npm 15.0.3 版本 + lockfile 断言），新增「npm markdown-it 版本 15.0.3 与 lockfile」守卫 | `test/桌面UI/markdown.test.ts`（直接 import `chat/markdown.ts`） |
| `tool-rows.test.ts`（53） | 有价值纯逻辑逐组迁移：工具事实/状态优先级（denied/timedOut/exit≠0/failed/phase）、目标提取与瘦身、display v1 版本拒绝、delivery note 非工具、十调用历史不新增泛工具、F-8-b 中性退出、mergePhases、callSummary、reasoning label/foldable、注入 `[系统·]`/`【系统通知】` 分类、replayKey/canonicalKey；旧 DOM/模板/HTML 字符串断言退役并映射到新 e2e（uiux-v2 TOOLFOLD/TERMINAL/DELIVERY_NOTE） | `test/桌面UI/tool-semantics.test.ts`、`injected-notice.test.ts`、`replay.test.ts` 扩充；已有 `judge/governance-view/operator-view` 覆盖的 ui-labels 文案去重后保留补齐 |
| `runtime-ui.test.ts`（12） | 纯映射迁移：viewKey/matchesView（缺省 runtime 口径）、roleGroups、sourceLabel/applicationLabel、context 文案、canonical/replay key 与计数、P7 kind/保存状态文案；旧 renderer 源码钉退役 | `test/桌面UI/runtime-view.test.ts`、`work-view.test.ts`、`runtime-config.test.ts`、`labels.test.ts` 扩充 |
| `renderer.test.ts`（108） | 逐名三类：①XSS/业务纯函数（B-1/N-1/状态徽标/治理文案/纯映射）→ 迁新纯测试；②行为/DOM 断言 → 已有 uiux-v2/JUDGE/G2/MIRROR/TERMINAL/TOOLFOLD/VISUAL 覆盖的退役并登记对照；③旧源码/CSS 子串守卫 → 以 **新渲染器源码守卫** 替代（见下） | 新 `test/桌面UI/source-guard.test.ts` + 既有 4A/4B 单测 + uiux-v2 |
| `hot-path.test.ts` | **桌面窗口属主**：①②③保留；④旧 `vendor/markdown-it.umd.min.js` + `markdown.js` 解析成本段改为新 `chat/markdown.ts`（npm）或移交新基准；5A 由桌面窗口改，桌面UI 提供新入口路径与 Markdown 封装 | 桌面窗口 |
| `message-queue.test.ts` | **桌面窗口属主**：队列/忙态主进程段保留；旧 renderer.js/styles.css 源钉与 `role-status.js` 纯逻辑段：状态徽标纯函数先迁 `test/桌面UI/status.test.ts`，其余映射 e2e 后由桌面窗口退役 | 桌面窗口 + `test/桌面UI/` |

**新渲染器源码守卫（`test/桌面UI/source-guard.test.ts`，5A 新增）**：
- `app/renderer/src/**` 禁止 `node:`/`require(`/`from "src/`/直接 `fs`；渲染进程无第二份边界判定（不得出现 classify-shell/resolve-write 同类实现或治理判定常量）。
- 无手绘 SVG 图标（Lucide 例外为既有组件 copy-in）；无裸色值（CSS 只引用 index.css 令牌，扫描 phase4b.css/新增 CSS）；无第二 Markdown/UI/图标/状态库。
- 无业务计时器（允许 16ms 合帧、9s 一次性警告、130ms 抽屉离场；其余 `setTimeout/setInterval` 需登记）。
- 无治理事实持久化/localStorage（仅 `ans.sidebar.width`、折叠键既有例外）；无 Node/fs 能力。
- CSP/零内联：构建产物 `dist` 入口 meta 严格、无 inline script/unsafe；与桌面窗口 5B packaged smoke 交叉。
- 旧源码守卫的删除逐项对应新守卫/行为断言，台账列「旧守卫 → 替代断言」，先绿后删。

### 1.3 e2e 套件目标切换（5A 准备，5B 翻转默认）

| 套件 | 现状 | 5A | 5B |
| --- | --- | --- | --- |
| `uiux-v2.mjs`（桌面UI） | 默认 `app/renderer/index.html`，`ANS_RENDERER_ENTRY` 可指新入口 | 保持旧默认；增加显式 `ANS_RENDERER_ENTRY` 必填校验/缺目标 fail-fast；用同一脚本跑旧/新快照并逐名 diff | 默认改为最终构建入口；删除旧路径常量；env 仅作调试覆盖 |
| `ime-enter.mjs`（桌面UI） | 同上 | 同上；24 项基线冻结 | 默认最终入口；24/24 |
| `bench-storm.mjs`（桌面UI） | `BENCH_RENDERER_DIR`/`ANS_RENDERER_ENTRY` | 旧/新同机同日交替基线（§10.3）；`BENCH_RENDERER_DIR` 旧路径用法标注退役计划 | 默认最终入口；旧目录参数退役或仅保留外部路径 |
| `uiux-design-audit.mjs`（桌面UI） | 硬编码 `renderer/index.html` | 改为 `ANS_RENDERER_ENTRY` 优先、默认旧；视觉测量双端快照 | 默认最终入口 |
| `main.mjs`（桌面窗口） | 硬编码旧入口 | 桌面窗口提交目标切换与 dev/prod 策略 | 5B 生产 `loadFile` 最终入口；整机自检 |
| `uiux-prototype-measure.mjs` | 不涉渲染器 | 不变 | 不变 |

**双端快照与逐名对照（5A 门证据）**：旧端（旧入口）与新端（`ANS_RENDERER_ENTRY=dist 入口`）各跑 `uiux-v2` 全段、`ime-enter`、`bench-storm`、`main.mjs`（桌面窗口）；每套件输出 `old.json/new.json/diff.md`（check 名 + 值），允许差异逐条登记「旧名→新名/旧值→新值/批准依据」；不得用计数代替名单；C2 重锚、五角色、P7、identity 等已批准差异单列。旧端快照必须包含 `uiux-design-audit` 两档测量与旧截图。

## 二、删除清单（仅 5B 执行；5A 门通过前禁止删除）

### 2.1 旧渲染器与 vendor（桌面UI）

| 路径 | 行数/内容 | 说明 |
| --- | --- | --- |
| `app/renderer/index.html` | 326 行 | 旧入口；5B 删除后新入口可占用此名（见 §三） |
| `app/renderer/renderer.js` | 6833 行 | 旧主脚本（聊天/治理/报告/队列/抽屉/测试驱动）；经典脚本 7/7 |
| `app/renderer/styles.css` | 2086 行 | 旧样式（含浅色主题/旧令牌） |
| `app/renderer/engine-selector.js` | 106 行 | 旧经典脚本 1/7 |
| `app/renderer/markdown.js` | 112 行 | 旧经典脚本 2/7（vendor UMD 封装） |
| `app/renderer/role-status.js` | 144 行 | 旧经典脚本 3/7（状态/转轮） |
| `app/renderer/runtime-ui.js` | 88 行 | 旧经典脚本 4/7（运行时展示映射） |
| `app/renderer/tool-rows.js` | 317 行 | 旧经典脚本 5/7（工具相位/分类） |
| `app/renderer/ui-labels.js` | 1234 行 | 旧经典脚本 6/7（业务文案单一来源）；7 个经典脚本 = engine-selector / markdown / role-status / runtime-ui / tool-rows / ui-labels / renderer（renderer.js 为 7/7，见上） |
| `app/renderer/vendor/markdown-it.umd.min.js` | 13 行 | vendored UMD；npm `markdown-it@15.0.3` 已在 devDependencies + lockfile（`node_modules` 实测 15.0.3），新渲染器 `chat/markdown.ts` 使用 npm 版本 |
| `app/renderer/vendor/markdown-it.LICENSE` | MIT 全文 22 行 | 随 npm 包分发，不再需要仓库副本 |
| `app/renderer/vendor/README.md` | 25 行 | vendor 说明与 pin 记录；删除后在变更记录/契约面保留历史链接说明 |
| `app/renderer/vendor/` | 目录 | 整体删除 |

**保留**：`app/renderer/src/**`、`app/renderer/dist/**`（构建产物）、`app/renderer/components.json`、`app/renderer/tsconfig.json`、`src/` 内新入口源文件（5B 可能移动到 `app/renderer/index.html`，见 §三）。

### 2.2 旧测试（桌面UI 四文件 + 交接两文件）

- 桌面UI 删除：`test/桌面应用/renderer.test.ts`、`markdown.test.ts`、`tool-rows.test.ts`、`runtime-ui.test.ts`（共 178 tests）——仅在 §1.2 迁移台账全部绿、双端快照完成后。
- 桌面窗口交接：`test/桌面应用/hot-path.test.ts`、`message-queue.test.ts` 中引用旧 renderer.js/styles.css/role-status.js/vendor 的段由桌面窗口在 5B 删除前替换/退役；桌面UI 提供 `test/桌面UI` 对应纯逻辑与状态徽标覆盖，不直接改这两文件（边界外）。
- 旧 e2e 不删除：`uiux-v2/ime-enter/bench-storm/uiux-design-audit` 保留并改目标；`main.mjs` 属桌面窗口。
- 夹具/证据：旧入口证据（旧截图、旧 JSONL 夹具）保留在各自 `docs/change/` 历史目录，只读；不放宽/删除证据。

### 2.3 与桌面窗口/装配/测试的交接

| 事项 | 属主 | 5A 交付 | 5B 依赖 |
| --- | --- | --- | --- |
| 最终入口路径 + `app/main.ts` dev/prod 加载 | 桌面窗口 | 5A 确认路径；dev/prod 实现（生产可暂不切换） | 5B 切换生产 `loadFile` 到最终入口 |
| Vite 入口/产物路径（若选 `dist/index.html`） | 装配（`vite.config.ts`）+ 桌面UI（源入口文件） | 5A 评审方案；不改旧入口期构建 | 5B 删除旧 `index.html` 后移动源入口/更新 input |
| `main.mjs` 目标切换与整机自检 | 桌面窗口 | 5A 改目标切换 + 旧/新快照 | 5B 新入口全量 |
| `uiux-design-audit.mjs` 目标 | 桌面UI | 5A 加 env/双端 | 5B 默认最终入口 |
| `hot-path.test.ts`/`message-queue.test.ts` 旧段 | 桌面窗口 | 5A 替换计划/改写 | 5B 删除旧文件前绿 |
| packaged smoke / 本地打包 | 桌面窗口 + 装配 | 5A 本地打包 dry run 计划与命令 | 5B 真实 Electron 加载最终入口冒烟 |
| 全量双端台账/独立验证 | 测试 | 5A 快照与逐名 diff、允许差异清单 | 5B 新入口全量复验 |
| release 流水线/冻结源 | 装配/客户 | **不改 release.yml/release-policy** | 发布接入留新冻结源 |

## 三、5B 切换前置与顺序

1. **最终入口路径唯一化**：优先 `app/renderer/dist/index.html`。
   - 方案 A（推荐）：5B 删除旧 `app/renderer/index.html` 后，把新源入口 `app/renderer/src/index.html` 移至 `app/renderer/index.html`（`<script src="/src/main.tsx">` 相对 root 仍有效），装配把 `vite.config.ts` `rollupOptions.input` 指向新路径 → 构建产物 `dist/index.html`；桌面窗口 `main.ts` 生产 `loadFile(dist/index.html)`；e2e/bench/packaged smoke 同路径。需 5B 同批协调（删除/移动/配置/main 同时完成）。
   - 方案 B（允许的回退）：保留源入口与产物流水线，最终入口 = `app/renderer/dist/src/index.html`；必须在契约面/提案写明理由，并统一 `main.ts`、e2e 默认、打包冒烟路径；不额外改 Vite。
   - 待 PM/桌面窗口/装配在 5A 内确认（§六 R1）。
2. **5A 门通过**：双端快照与逐名 diff 完成、三项缺口 pass、旧测试迁移台账绿、5A 冒烟/门禁/bench/lazy/C1/IME、UIUX 5A 复核；测试独立验证。**5A 门前不删任何旧文件。**
3. **5B 原子切换**：桌面窗口切生产入口；桌面UI 删除旧渲染器/vendor/旧测试（按 §二）；e2e/bench/design-audit 默认目标翻转；装配本地 `build:renderer` + package 顺序；`release.yml/release-policy` 不动。
4. **5B 验收**：新入口全量套件（uiux-v2/ime/bench、main.mjs、design-audit）、packaged smoke、最终 UIUX 审计、热路径重基线（旧端已删除 ⇒ 以 5A 冻结的旧基线/阈值比较，不再声称旧端可复跑）、gzip/CSP；测试独立验证；随后独立验收角色按 §16.5 新上下文立项。

## 四、写集（5A / 5B）与不写清单

### 4.1 5A 写集（桌面UI）

- `app/renderer/src/shell/Sidebar.tsx`（删 `.ti-badge`、data/aria 身份、P7 待选择标签）
- `app/renderer/src/chat/operator-view.ts`（pendingKind 纯函数；或 work-view）
- `app/renderer/src/chat/reading-anchor.ts`（新增）、`chat/chat-store.ts`、`chat/VirtualPane.tsx`（阅读锚点恢复；不重写行模型/虚拟窗口）
- `test/桌面UI/markdown.test.ts`、`tool-summary.test.ts`、`role-view.test.ts`、`source-guard.test.ts`、`ui-store.test.ts`、`reading-anchor.test.ts`、`phase5a-electron-smoke.mjs`（新增/扩充；injected-notice 归并 event-routing）
- `test/桌面应用/e2e/{uiux-v2,ime-enter,bench-storm,uiux-design-audit}.mjs`（目标切换/env/fail-fast；断言只增不弱化）
- `角色卡/桌面UI/docs/{design,feature,change,fix}/`（本文件、契约面最终更新、组件台账、5A 证据、memo/changelog）

### 4.2 5A 不写

`app/renderer/index.html`、旧 7 脚本、`styles.css`、`vendor/`（5B 删除）；`app/main.ts`、`app/preload.cjs`、`app/desktop/`（桌面窗口）；`vite.config.ts`、`package.json`/`package-lock.json`、根 tsconfig（装配）；`release.yml`、`release-policy.mjs`；旧 e2e `main.mjs`（桌面窗口）；`uiux-prototype-measure.mjs`；其他角色文件；不新增依赖/DOM 例外。

### 4.3 5B 写集（桌面UI）

删除 §二.1/2.2 的桌面UI 文件；`app/renderer/index.html`（如方案 A 移动新源入口）；`test/桌面应用/e2e/{uiux-v2,ime-enter,bench-storm,uiux-design-audit}.mjs` 默认目标与旧路径清理；`角色卡/桌面UI/docs/` 5B 记录/最终证据；配合桌面窗口/装配联调（不写其文件）。

### 4.4 契约面最终更新

- 行 #1：旧入口退役、最终入口路径（方案 A/B）唯一化；旧 `dist/src/index.html` 过渡说明删除。
- 行 #6/#7/#15/#16/#18：Sidebar 身份 data/aria、P7「待选择」、queueView/菜单/设置最终状态。
- 行 #12：回放阅读锚点恢复、`full replay preserves content identity` 转绿；旧 `.virt-spacer`/`rowModelDebug` 保持。
- 行 #19/#20：`window.__ansRenderer` 全量方法与 state 快照最终表；删除「unimplemented/4B 计划」字样。
- 旧套件目标表：uiux-v2/ime/bench 默认最终入口；design-audit env；main.mjs 属桌面窗口；删除旧入口选择器/路径说明。
- 旧渲染器/vendor 删除与测试迁移台账（old→new 名、退役理由、替代断言）附在契约面/5A 证据索引。

### 4.5 1360/960/200% 证据计划（5A/5B）

| 面 | 5A | 5B |
| --- | --- | --- |
| Sidebar 身份 | 1360/960/200% 五角色树：无第三行徽标、`data-primary/data-builtin`、aria-description、行不重叠 | 最终入口同档复验 |
| P7 待选择 | 1360/960/200% 角色树「待选择」+ 工作概览「待选择」/空队列；作答/失效后回状态 | 最终入口同档复验 |
| 阅读锚点 | 1360/960 full replay 前后同一行 offset<2px 截图+数值；贴底仍贴底 | 最终入口复验 |
| 治理/镜像/报告/回执/队列/设置 | 关键面 1360/960/200% 旧/新视觉对照（旧浅色仅层级参考） | 最终入口三档截图 |
| 菜单/抽屉/交互动效 | 208 菜单、424 抽屉、Esc/焦点/inert | 打包冒烟后复验 |
| 打包 | 本地打包 dry run 计划/产物路径 | 真实 Electron 加载最终入口截图/首屏冒烟 |

### 4.6 热路径与门禁（5A/5B）

- 改动 `Sidebar`（非聊天热路径）与 `chat-store/VirtualPane`（聊天热路径）：按 PM §10.3 同机同日旧/新交替 ≥3 有效轮（首轮预热），storm maxGap 中位 ≤max(旧,25ms)、handler/replay/scroll 中位 ≤max(旧×1.2,旧+5ms)、p95≤35、单轮≤50。
- 懒挂载正向检查 10/10；C1 新 Δ≤32（目标≤20）；IME 24/24（新入口 26 true/0 false）；gzip9 ≤300KB；CSP 严格；typecheck/build；旧基线 679/679 在 5A 保持，5B 删除旧测试后基线只统计保留套件并在台账登记。
- 5B 后旧端不可复跑：不得用 5B 的新结果冒充双端；双端结论只来自 5A 快照。

## 五、风险与缓解

| # | 风险 | 缓解 |
| --- | --- | --- |
| R1 | 最终入口路径（dist/index.html vs dist/src/index.html）未定导致 main/e2e/打包漂移 | 5A 由 PM/桌面窗口/装配确认唯一路径；契约面写死；5B 原子切换；e2e 缺目标 fail-fast |
| R2 | 删除旧守卫导致守卫空洞 | old→new 台账逐名；先补 XSS/纯逻辑/新源码守卫再删；测试独立复核；不删除未映射项 |
| R3 | e2e 目标切换遗漏（design-audit/main.mjs/hot-path/message-queue） | 5A 交接表点名属主与时点；main.mjs 由桌面窗口 5A 改；两测试由桌面窗口 5B 前绿 |
| R4 | vendor 删除后旧入口不可复跑 | 5A 完成旧/新快照、JSON/截图/测量固化；5B 后不声称旧端；旧证据只读保留 |
| R5 | Sidebar/阅读锚点改动影响热路径/滚动语义 | 行模型不动；锚点仅非贴底恢复、无动画/计时器；bench/lazy/C1/IME；UIUX 复核三档 |
| R6 | P7 标签改变状态语义/数量误读 | 纯函数单一来源；只替换等待确认文案；保留 `.ti-count` 唯一数字；镜像面/终态单测 |
| R7 | 200%/960 视觉回归 | 5A/5B 三档截图 + 逐容器断言沿用 4B 收口规则 |
| R8 | packaged smoke 与 release 冻结冲突 | 5A dry run 不接 release；不改 release.yml/policy；5B 本地打包，发布轮另由客户决定 |
| R9 | 旧测试 679 口径变化被误报为回归 | 5A 前保持 679/679；5B 删除的 178 tests 在台账逐名映射，保留套件单列计数 |
| R10 | 独立验收尚未立项 | 5B 后只记「实施完成、待独立验收」；由统筹新上下文先定标准（§16.5） |

## 六、待 PM 复核点

1. **最终入口路径**：批准方案 A（`dist/index.html`，5B 移动源入口 + 装配 Vite input）还是方案 B（保留 `dist/src/index.html` 并统一 main/e2e/打包）？方案 A 需 5B 同批协调装配/桌面窗口。
2. **删除范围**：§二.1 旧渲染器 + vendor、§二.2 四测试；`hot-path.test.ts`/`message-queue.test.ts` 旧段由桌面窗口交接，是否按此分工？
3. **测试迁移台账**：是否要求 5A 门前提交 178 tests 的 old→new 逐名台账并由测试复核（本文仅给分组）？
4. **三项缺口语义**：Sidebar 身份 data 字段名（`data-primary`/`data-builtin`）与 aria 文案；P7「待选择」仅 choice 优先还是需区分 confirm「等待你确认」；阅读锚点仅在非贴底恢复、找不到同一行不调整。
5. **5A 双端差异**：允许差异清单与快照格式（old/new/diff、截图、bench）由测试定稿；C2/五角色/P7/identity 已批准差异单列。
6. **5A 本地打包 dry run**：由装配执行还是桌面窗口执行？5A 是否要求产物存在但不切换生产入口？
7. **5B 删除时点**：确认「5A 门 + 快照 + 逐名对照 + 迁移台账全绿」后才允许删除；`uiux-design-audit` 是否保留（改目标）而非退役。
8. **证据目录/命名**：`角色卡/桌面UI/docs/change/2026-10-21-phase5a-evidence/`（或按 5A 实际日期）与 5B 证据；独立验收标准由新上下文先立。

## 附：只读核对与状态声明

- 只读核对：PM §十六；旧 `app/renderer/index.html`、`renderer.js`、`styles.css`、7 经典脚本、`vendor/`；`vite.config.ts` 入口/产物；`app/main.ts`/`main.mjs`/`uiux-design-audit.mjs` 载入面；旧测试 `renderer.test.ts`（108 名）、`markdown.test.ts`（5）、`tool-rows.test.ts`（53）、`runtime-ui.test.ts`（12）与 `hot-path/message-queue` 引用面；`package.json` 的 `markdown-it@15.0.3` 与 lockfile；4B 证据与契约面。
- 未运行应用/测试/构建，未调用模型/网络，未读 `.env`；未改 `app/`/`test/`/依赖/主进程/preload/desktop/旧渲染器/根配置；只写本文件与 memo/changelog。
- 本文是 5A 范围与迁移计划（status: implemented，PM §十七放行；实施记录见 change/2026-10-21_change_ui-platform-phase5a-gaps.md），不是独立验收记录；5A 派发与删除以 PM 复核结论为准。
