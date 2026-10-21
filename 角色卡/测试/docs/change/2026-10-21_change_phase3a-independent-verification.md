---
id: ui-platform-phase3a-independent-verification
type: change
title: UI 平台化 Phase 3A（聊天流核心迁移）独立验证
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ui-platform-round, ui-platform-round-review, ui-platform-phase3a-chat, ui-platform-phase3a-review, ui-contract-surface, ui-platform-phase2b-independent-reverification]
events:
  - date: "2026-10-21"
    kind: created
    summary: 候选变化后按 Invariant #6 重验：干净重建、新单测/旧基线、ime 新入口、预注册 bench 阈值 3 轮交替、自写离线 IPC 冒烟 30 项、uiux-v2/toolfold 新入口分类、DOM 契约变更评估；框架项全部通过，phase 3 gate 双端对照未达成交 PM 裁定
---

# Phase 3A 聊天流核心：独立验证（测试角色）

候选已变化（Phase 3A + 3A2 + bench 优化），本记录覆盖旧 Phase 2/2b 结论中受影响的渲染层部分。受验对象：桌面UI 的 [Phase 3A 变更记录](../../../桌面UI/docs/change/2026-10-21_change_ui-platform-phase3a-chat.md)（含 3A2 与 bench 优化节）、[3A2 证据](../../../桌面UI/docs/change/2026-10-21-phase3a2-evidence/)、[契约面清单](../../../桌面UI/docs/feature/ui-contract-surface.md)、[UIUX 3A 评审](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase3a-review.md)（needs-work → 3A2 pass）。验收口径：产品提案 revision 2 §六 Phase 3 门、PM 评审 Q5/Q10。

候选基线：HEAD `fc1a39c` + 当前工作树；环境：macOS Darwin 25.6.0 arm64、Node v24.14.0、Electron 44.7.0（Chromium 152.0.7977.130）。证据目录：[2026-10-21-phase3a-verification-evidence](2026-10-21-phase3a-verification-evidence/)。独立执行，未复用桌面UI 脚本或结论。

## 一、结论（pass / needs-work / missing-evidence 分列）

**框架内检查：pass。** 干净重建、CSP/预算、新单测、旧基线、ime 新入口、bench（按预注册阈值）、自写冒烟 30 项全部通过；旧渲染器核心零 diff；依赖无禁入。

**阶段门判定：needs-work（交 PM 裁定，不是本角色能改判的范围）。** 提案 §六 Phase 3 门写明「同一套 e2e 双端逐 check 名对照等价（含 `window.__ansRenderer` 驱动面）」；本次实测新入口在 uiux-v2 默认段第 9 项中止（8/9 布尔项通过），旧入口同段可跑到 101 项（90/91 布尔项通过，1 项既有红）。**双端逐 check 名对照未达成**。3A 变更记录把本轮门禁重定义为「ime 24/24、bench 跑通、新纯逻辑 18/18、旧基线 679/679、3A2 冒烟」——该口径通过，但与提案文字的阶段门不一致；需 PM 明确 3A 是否以缩小口径过门、双端对照是否整体后移 3B/5。

**missing-evidence：无**（派发列出的 3A 检查均有本轮独立证据）。覆盖边界见 §八。

**裁定后更新（2026-10-21，PM [§十](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)）**：PM 已裁定**接受狭义 Phase 3 门、双端全量逐 check 对照后移 Phase 5**；toolfold 尾部锚点登记为既有基线红（3B/5 收敛，Phase 5 判据「新 Δ 不得 >旧 32px」）；bench 预注册口径获批准并补预热/p95/单轮 50ms 红线；大工具组懒挂载批准为唯一限定例外并要求补正向覆盖。据此，上段「needs-work（阶段门）」已由 PM 裁定关闭；四类 check 名台账见 [Phase 3A check 台账](2026-10-21_check-ledger-phase3a.md)，正向覆盖结果见 §七.3。

## 二、干净重建与静态检查（通过）

```
rm -rf app/renderer/dist
npm run typecheck:renderer   # exit 0
npm run build:renderer       # exit 0（vite 8.3.4，250ms）
```

| 资产 | raw | gzip9 |
| --- | ---: | ---: |
| `dist/assets/index-C1ZwBwMz.js` | 708,779B | 235,863B |
| `dist/assets/index-Bwa69RnG.css` | 75,520B | 13,958B |
| `dist/src/index.html` | 583B | 388B |
| **入口引用资产合计** | — | **250,209B ≤ 300KB（307,200B）** |

与桌面UI 报告（250,015B）差 +194B，重建实例差异。静态扫描：恰 1 个外部 module script + 1 个外部 stylesheet；无内联脚本/`<style>`/`style=`/`unsafe-*`/modulepreload；严格 CSP meta 逐字在位（`evidence/dist-static-scan.txt`）。

## 三、测试与基线（通过）

| 命令 | 结果 |
| --- | --- |
| `node --test test/桌面UI/*.test.ts` | **18/18 pass，exit 0**（行模型/回放/状态/事件路由 + 工具相位合并/折叠摘要/目标提取） |
| `node --test test/桌面应用/*.test.ts` | **679/679 pass，0 fail，exit 0** |
| 旧渲染器核心 vs HEAD | `index.html`/`renderer.js`/`styles.css`/`tool-rows.js`/`role-status.js`/`runtime-ui.js`/`ui-labels.js`/`engine-selector.js` 与 `app/main.ts`/`app/preload.cjs` **全部 UNCHANGED**；`app/desktop/` 零改动 |
| 三个 e2e 文件 diff | 仅新增 `ANS_RENDERER_ENTRY` 与 `loadFile` 目标替换，**断言零改动**（`change-surface.txt`） |

`app/renderer/markdown.js`、`vendor/*`、`test/桌面应用/markdown.test.ts` 有改动，但属已单独记录的 [vendor 15.0.3 安全升级](../../../桌面UI/docs/change/2026-10-21_change_markdown-it-vendor-15-0-3.md)（版本号/sha pin 同步；配置与行为零改动），不计 3A。

## 四、ime-enter 新入口（通过，独立复跑）

```
ANS_RENDERER_ENTRY=<repo>/app/renderer/dist/src/index.html \
  ANS_IME_OUTDIR=<tmp> electron test/桌面应用/e2e/ime-enter.mjs
→ exit 0，E2E_DONE=1，24/24 check 全 true
```

覆盖：中/英组合期不发送、组合结束前一帧 229、`isComposing` 无组合开始、鼠标提交后下一次 Enter、Shift+Enter 原生换行、附件就绪与发送后清空、发送载荷 `{text, images}`。证据 `ime/report.txt`。

## 五、bench：阈值预注册 + 3 轮交替（按预注册口径通过，含两点保留）

**先写标准后执行**：[预注册文件](2026-10-21-phase3a-verification-evidence/bench/00-threshold-preregistration.md)（执行前写入，sha256 `ebbf92c2…`）。状态：**待 PM 批准**。口径：同机新旧交替 3 轮（O1→N1→O2→N2→O3→N3）；主阈值 = storm maxGap 新中位 ≤ max(旧中位, 25ms)；handler/replay/scroll 新中位 ≤ max(旧中位×1.2, 旧中位+5ms)。

| 指标 | 旧（3 轮，中位） | 新（3 轮，中位） | 阈值 | 判定 |
| --- | --- | --- | --- | --- |
| stormA.maxGap | 20.2 / 17.8 / 21.9（20.2） | **43.2 / 18.0 / 18.0（18.0）** | ≤ max(20.2,25)=25 | **PASS**（中位） |
| stormB.maxGap | 21.0 / 17.6 / 17.6（17.6） | 18.4 / 17.7 / 17.7（17.7） | ≤ 25 | PASS |
| stormA_handler.maxMs | 9.9 / 4.4 / 12.1（9.9） | 0.1 / 0.1 / 0.5（0.1） | ≤ max(11.9,14.9) | PASS |
| stormB_handler.maxBatchMs | 1.3 / 1.0 / 1.1（1.1） | 1.1 / 1.1 / 1.1（1.1） | ≤ max(1.3,6.1) | PASS |
| replay.replayMs | 21.0 / 21.0 / 11.9（21.0） | 5.7 / 6.4 / 3.4（5.7） | ≤ max(25.2,26.0) | PASS |
| scrollToBottom.ms | 22.6 / 10.6 / 15.5（15.5） | 4.9 / 13.4 / 4.3（4.9） | ≤ max(18.6,20.5) | PASS |

补充 3 轮新入口表征（非判定轮）：stormA **25.1 / 18.6 / 22.8**（6 轮合并中位 20.7，仍 ≤25）、stormB 17.9/19.1/17.7、replay 5.5/5.4/5.8、scroll 6.0/5.6/9.2。帧数：旧 stormA 98/98/98、新 97/98/98（±20% 内）；stormB 96/97/97 vs 97/97/97。

**保留 1（outlier）**：新入口 stormA 第 1 轮 **43.2ms**、补充轮 25.1ms，6 轮中 2 轮超过 25ms；按预注册的**中位**规则通过，但若 PM 要求「每轮 ≤25ms」则需另定。录原始分布交 PM。

**保留 2（预注册护栏的口径偏差，如实声明）**：预注册写「`replay.mounted`/`scrollToBottom.mounted` 新旧一致」；实测旧=1、新=361（两渲染器 pane 直接子节点的记账方式不同，桌面UI 证据同样如此）。该护栏不是采样有效性条件而是结构差异，故不因此作废计时数据；且新入口在**多挂载 360 行**的情况下 replay/scroll 仍显著更快，结论方向保守。`histPending/histDirect`：新 true/true、旧 false/false（旧驱动读不到同字段），如实记录，不作阈值。

## 六、自写 Electron 冒烟（离线 IPC 替身，30/30）

脚本：[electron-smoke/independent-smoke.cjs](2026-10-21-phase3a-verification-evidence/electron-smoke/independent-smoke.cjs) + [离线 preload](2026-10-21-phase3a-verification-evidence/electron-smoke/ans-p3a-smoke-preload.cjs)。窗口：`contextIsolation:true`、`nodeIntegration:false`、`sandbox:false`、`show:false`、`loadFile(dist/src/index.html)`，1360×860。结果 **30/30 true、exit 0**，零 console/CSP/did-fail-load。

- **220 事件虚拟窗口**：`rowModelDebug` count=220、lastIndex=219、rowGap=16；挂载 **61** 行（<120，窗口化）、两个 spacer（上 12,084px、下 0）、贴底判定通过（scrollHeight−scrollTop−clientHeight ≤24）。
- **operator toolCallId 锚点**：先推 tool 行（callId `call-anchor`）与 after-tool 助手行，再 `appendOperatorRequest{requestId:'op-anchor',toolCallId:'call-anchor'}` → operators 索引 **221** = count−2（223）；DOM 前一行 kind=activities（run_shell）、后一行 kind=assistant（after-tool 标记行）——锚在工具行之后、后续助手行之前。
- **状态优先级**：A busy=true 且有未决 operator → 徽标「等待你确认」、`#chat[data-state=run]`（等待确认 > 工作中）；过期 operator 后 →「工作中」（busy）；busy=false →「空闲」。B 会话开启失败 → 徽标「错误」、`data-state=err`、`.sys-config` 文本与计算色 `rgb(201,122,109)`（--danger）；B busy=true → 「工作中」/run（工作中覆盖上一轮错误）。
- **Markdown XSS 负例**：助手消息含 `<script>`/`<img onerror>`/`javascript:` 链接/引号注入 → 消息内 script/img/iframe 计数 0、`window.__xss` undefined、无 javascript: href；https 链接 `rel="noopener noreferrer"`、`**粗体**` 渲染为 `<strong>`；`ANSMarkdown.renderMarkdown` 对同载荷不产出 `<script>`/`<img>`。
- **虚拟卸载/重挂状态保持**：工具组 `<details>` 打开 + choice 选 B 后，`scrollTop=0` 离屏（group/op 均不在 DOM，挂载 39 行），滚回底部：组仍 open、B 仍 checked、op 仍 `open`。
- **IME + 真实发送 + 附件**：组合期 Enter 不拦截不发送；组合结束后 Enter 恰发送一次，载荷 `{"你好", [], {projectRoot:'/fixture',roleId:'A',runtime:'claude'}, {clientMessageId}}`，用户气泡出现、输入清空；选图 chip → 发送载荷含 `[{type:'image',data,mimeType:'image/png'}]` 且 chip 清空；keyCode 229 / isComposing / Shift+Enter 守护均不拦截。
- **调试面**：`rowModelDebug` count=227、operators [{221,op-anchor},{224,op-preserve}]、rowGap=16；`paneDebug` inChat=true、empty=false、assistant=222。截图 `electron-smoke/phase3a-chat.png`（真实渲染：分组角色树/状态、operator 卡、Markdown 安全文本、用户气泡）。

## 七、uiux-v2 新入口分类与 DOM 契约变更评估

### 7.1 默认段（新入口 8/9 布尔项通过）

新入口报告 10 条（9 布尔 + 1 观察）：第 1–8 项 true；**第 9 项 `one independent work list without duplicated role documents` = false**。该检查点击 `#tab-work` 后断言 `#right-body #right-queue-body` 1 个、`.q-item` 4 个、`drawer-title` 含「工作概览」——**工作概览/队列抽屉**仍未实现（新渲染器 `#tab-work` 是禁用占位）。旧入口同段 101 条（91 布尔）中该检查 **true**。归属：**3B/4（队列/工作概览抽屉），不是 3A 聊天流缺口**；契约面行 7/15 亦标注「工作概览仍禁用占位/Phase 4」。

旧入口同段另有 1 条既有红：`expired old shell shown disabled in its own runtime` = false（旧渲染器零 diff，属既有基线红，与 3A 无关）。

### 7.2 toolfold 段（12/13 布尔项通过；失败为既有基线红）

新入口 15 条（13 布尔 + 2 观察）：第 1–12 项 true；报告位置第 13 条为观察 `fold anchor offsets`（非布尔），第 **14** 条布尔检查 `tail fold movement bounded and non accumulating with the reading row still in view` = **false**。桌面UI 自述的「第 13 项」在报告位置上实为第 14 布尔项（观察项占一位），实质一致。

观测值：`anchorBefore=150`、`anchorAfter=anchorLater=201` → 位移 **51px > 20px** 阈值（组已按预期折叠、摘要保留；失败在位移界）。**同机旧入口复跑同一检查也失败**：`150→182`，位移 **32px**（同样 >20）。结论：**该检查是旧基线既有红，不是 3A 新引入**；新入口位移比旧大 19px，属 3B/5 虚拟行锚点精修时需收敛的差值（提案 Phase 3 门含「锚点断言」，是否允许以「既有红 + 差值待修」过门需 PM 裁定）。

### 7.3 大工具组懒挂载的 DOM 契约变更评估

bench 优化引入「>40 行且默认折叠的大工具组延迟挂载明细」（`ChatRow.tsx` `DEFER_TOOL_ROWS_WHEN_CLOSED=40`；小工具组仍折叠也挂载）。旧渲染器对闭合组**始终挂载**明细。

- **现有 e2e 断言**：逐条检索 `.tool-activity`/`.tool-call-record`/`.tool-records` 的查询，没有任何断言在「>40 行且闭合」的组内取行；最大的 toolfold 夹具为 12 个调用（≤40）；bench 的 300 事件组不被 DOM 查询。**现有套件不受影响、无需适配。**
- **契约判断**：这是**有意的行为/DOM 差异**（性能优化）。PM §10.4 已**批准为唯一限定例外**：仅 >40 行且闭合；摘要与失败/未放行直显保持；展开立即挂载；≤40 行保持旧契约；桌面UI 在契约面登记常量与测试规则。
- **正向覆盖（已补，`test/测试/`）**：`phase3a-lazy-toolgroup-check.mjs`（离线 preload 同目录）在新入口实跑 **10/10、exit 0**：45 调用/91 相位闭合组内部活动行 **0**、摘要「本轮 45 个调用…含 1 条未放行」、`.sys-denied` 直显 outside.md；展开 **45** 行且 file-1/file-45/已拒绝相位可见；再折叠回 0；离屏（160 行前置正文）后回窗仍闭合、摘要完整、再展开 45；≤40 三调用小组闭合仍挂载 3 行；零 console 错误。证据 `lazy-toolgroup/report.json`、`run.log`。

## 八、未验证 / 覆盖边界

1. 真实模型/网络与真实 IPC 端到端：冒烟用离线替身；真实 `sendSession`/`session:event` 由后续真机轮覆盖。
2. 打包安装包、Windows/DPI/200% 文字/屏读、`prefers-reduced-motion`：本机 macOS。
3. uiux-v2 其余 90+ 项未在新入口运行（第 9 项即中止）；**双端逐 check 对照未完成**（§一）。
4. 长转录手感、bench 的同一挂载行数对比、sustained 长会话内存：未测。
5. `openPiPanel`/`loadPiConfig`/治理/shell/judge/recovery/`replayAnchorDebug` 等驱动未实现（3B/4），冒烟未覆盖。
6. 停止本轮、双开关、完整附件 UX、真实确认卡：3B/4 范围。
7. **3A2 的 12 组视觉计算样式**（Markdown 字号/列表/表格、`.is-replay` opacity .88、blocked 3px danger、工具真实时间、chevron、CTA 实底等）由 UIUX 复核（3A2 pass）；本次仅独立覆盖其中子集（XSS 安全、choice 行 40px、`sys-config` danger、虚拟状态保持），未逐项重测全部 12 组，也未核对其 4 张截图。

## 九、依赖与产物

- Phase 3A 本身**未新增依赖**；三 e2e 仅加目标切换。
- 相对 HEAD 的依赖增量 107 包（Phase 2 时为 97），新增 10 个均为**已批准的 markdown-it 15.0.3 + @types 工具链**（`markdown-it@15.0.3`、`@types/markdown-it@14.2.0`、linkify-it/mdurl/uc.micro/entities/argparse/punycode 等）；`typescript` 由 `^7.0.2` 收紧为 **`7.0.2`**（PM Q1「实施中确认」项已收口）。锁文件 0 删除/0 既有版本变化；禁入清单（radix/react-aria/vitest/dnd-kit/tw-animate-css/第二套库）零命中。`markdown-it` 在 devDependencies（Q9 口径）。
- `dist` 仅 3 个文件，无 sourcemap。

## 十、与桌面UI 自述的差异

1. **toolfold 失败项编号**：其「第 13 项」在报告位置是第 14 个布尔项（第 13 条为非布尔观察 `fold anchor offsets`）；实质同一检查。
2. **toolfold 旧基线**：其记录未给旧入口同检查结果；本次实测**旧入口也失败（Δ=32px）**——该检查是既有基线红，不是 3A 新红；新入口 Δ=51px 更大，需在 3B/5 收敛。
3. **gzip**：其 250,015B；本次重建 250,209B（+194B），实例差异。
4. **bench stormA**：其 3 轮 17.7/21.3/17.6；本次 3 轮含 **43.2ms 单轮尖峰**（中位 18.0 仍达标），另 3 轮 25.1/18.6/22.8。个别轮次超 25ms，已在 §五保留。
5. **uiux-v2 默认段**：其称「前 8 项 true、第 9 项工作概览 3B/4」，本次独立复现一致；另发现旧入口该段可跑 101 项且含 1 条既有红（`expired old shell shown disabled in its own runtime`），其记录未提。

## 十一、边界核对

- 只写：本报告、`角色卡/测试/docs/change/2026-10-21-phase3a-verification-evidence/`、本角色 `feature-map.md`/`memo.md`/`changelog.md`。均在 `角色卡/测试/` 内。
- 未改任何产品代码、构建配置、测试文件或其他角色文件；未 commit/push。
- 按派发删除并重建 `app/renderer/dist/`（gitignore 构建产物）；未触碰源码。
- 工作树另含其他角色并行改动（推理强度轻量修复等），与受验面（`app/renderer/`、`test/桌面UI`、`test/桌面应用`、根依赖）不重叠。

## 附：复跑命令

```bash
rm -rf app/renderer/dist && npm run typecheck:renderer && npm run build:renderer
node --test test/桌面UI/*.test.ts
node --test test/桌面应用/*.test.ts

ANS_RENDERER_ENTRY="$PWD/app/renderer/dist/src/index.html" ANS_IME_OUTDIR=/tmp/ime \
  ./node_modules/.bin/electron test/桌面应用/e2e/ime-enter.mjs

# bench（3 轮交替；阈值见 bench/00-threshold-preregistration.md）
BENCH_OUT=… ./node_modules/.bin/electron test/桌面应用/e2e/bench-storm.mjs
ANS_RENDERER_ENTRY=… BENCH_OUT=… ./node_modules/.bin/electron test/桌面应用/e2e/bench-storm.mjs

# 冒烟
./node_modules/.bin/electron 角色卡/测试/docs/change/2026-10-21-phase3a-verification-evidence/electron-smoke/independent-smoke.cjs

# uiux-v2 新入口 / toolfold
ANS_RENDERER_ENTRY=… ANS_UIUX_OUTDIR=… ./node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs
ANS_TOOLFOLD_UI_ONLY=1 ANS_RENDERER_ENTRY=… ANS_UIUX_OUTDIR=… ./node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs
```
