---
id: change-ui-platform-phase5-acceptance
type: change
title: UI 平台 Phase 5 独立验收——5A/5B 候选、AC1–AC8 逐条判断与 missing-evidence 边界
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ui-platform-phase5-acceptance, ui-platform-round-review, change-ui-platform-phase5b-final-verification, ui-platform-phase5b-final-audit, ui-platform-phase5b-renderer-entry]
events:
  - date: "2026-10-21"
    kind: verified
    summary: 按固定标准 A1 独立复核 5A 快照与 5B 冻结候选；AC1–AC8 全部 pass；AC3 记录旧 uiux 套件版本限制并以 424 名 0 回归证实质等价，AC8 以独立 378 文件候选清单补齐；总体 pass（macOS 本地离线/本地打包范围）
---

# Phase 5 独立验收：候选已冻结，AC1–AC8 全部通过，证据与台账补正已收口

**标准**：[UI 平台 Phase 5 验收标准 A1](../design/2026-10-21_design_ui-platform-phase5-acceptance.md)，version A1，SHA-256 `675238ed60490c2991f12f1b3ca3e0d37c9d12e4fb4811b157a387453dc87bea`。本报告按该文件 AC1–AC8 逐条判断，不另造标准。

**候选**：HEAD `224cf831f7a26fd2fac8af7155790a75fa31f6b5`（branch `main`）+ 冻结时未提交工作树；生产入口 `app/renderer/dist/index.html`；HTML `3c4da2a2a4f99f6ffffdb737ccf854b3320bf2605a8d2b53190e5017ad33b301`、JS `f568e2aae8866996b7dabc22b69cdb4675fa8e2e8b8d020eb812a8aba08e4095`、CSS `76fad7ce7c7b449d7e3b5f61517555f7f5c9d97e169a81d504289131d6ffc0f6`；本地包 `release-output/local/ANS-Studio-1.4.0-mac-arm64.zip`，406,507,281 B，sha256 `edeeef1949d51ee471f5c922f18cb17fdd0e97ddd33e58b5264a8411a7d8f13f`。

**总体结论**：**pass（AC1–AC8 全部满足；范围限 macOS 本机离线夹具/本地构建/本地 electron-builder 打包）**。2026-10-21 的 AC3/AC8 补正已复核：`OPEN_CARD_AT_ARRIVAL` 207→206 已补列 G3 并由本角色独立机器核对（380 行、值不匹配 0）；旧 uiux 套件版本限制已记录并以 424 个旧通过名 0 回归证明实质等价；契约面/产品复核已收口；同期无关改动已分离；计数与探针口径已修正。候选身份由本角色独立生成的 378 文件候选清单 + 16 个 DELETED 条目补齐，并与本地包 app 源逐文件核对。剩余项均为非阻塞记录（F8/F9/F10）与六类 missing-evidence 边界。

**权限声明**：本结论不授予提交、推送、合并、部署或发布；发布决定属客户。本轮未连接真实模型/网络、未读 `.env`、未运行全量 e2e/打包，未修改产品、测试、他人报告或调度状态。

## 一、候选身份与冻结清单（独立复算）

### 1.1 冻结身份

| 项 | 值 | 核对 |
| --- | --- | --- |
| HEAD | `224cf831f7a26fd2fac8af7155790a75fa31f6b5` | `git rev-parse HEAD` 与证据 `candidate/identity.txt` 一致 |
| 工作树 | `git status --porcelain` 当前 304 行；5B 冻结证据 302 行 | 差异仅两条冻结后新增的证据目录：`角色卡/UIUX设计师/docs/design/2026-10-21-phase5b-production-entry-audit-evidence/`、`角色卡/测试/docs/change/2026-10-21_change_phase5b-final-verification.md`；均为文档/证据，不是产品候选 |
| 产品文件冻结 | `find app src test package.json package-lock.json vite.config.ts electron-builder.yml -newermt "2026-10-21 21:06:30"` 命中 `app/renderer/src/shell/shell.css` 与 21:30 重建的 `app/renderer/dist/*`（其余产品/测试文件无更新） | `shell.css` 当前 sha256 `e1999c11…` 与本地包内同名文件**逐字节相同**；dist 于 21:30 重建后 HTML/JS/CSS 哈希仍为冻结值 `3c4da2a2…/f568e2aa…/76fad7ce…`；包内 `app/` 123 个文件与工作树逐文件比对 0 差异（工作树多出的 `app/renderer/src/vite-env.d.ts` 是类型声明，未入包） |
| 核心摘要 | 当前 `app/main.ts` `64a56c33…`、`app/preload.cjs` `98dde83a…`、`app/renderer/index.html` `0785d220…`、`package.json` `d408f2b7…`、`package-lock.json` `dbcd6ae6…`、五个 e2e 套件摘要 | 与 `candidate/core-sha256-after.txt` 逐项一致；`core-sha.diff` 为空 |
| 独立候选清单 | 本角色按 A1 §2.3 生成 `2026-10-21-phase5-acceptance-evidence/candidate-manifest-independent.sha256`：**378 个现有文件**（app/desktop、app/renderer/src、app/renderer/dist、test/桌面应用/e2e 与 *.test.ts、test/桌面UI、test/测试、test/装配、src/common/装配、package/vite/tsconfig/electron-builder/release.yml）+ `candidate-deleted-independent.txt`：16 个 DELETED 条目与 2 条退役注记 | `shasum -a 256 -c` 378/378 OK；解决提供方 `core-sha256-after.txt` 仅 10 个核心文件、`git-status.txt` 把 `app/renderer/src/`/`test/桌面UI/` 作为目录整体的冻结清单不完整问题（提供方清单仍建议后续补全，非阻塞） |
| dist | `dist/index.html` 581 B、`index-BVLfGR_D.js` 825,985 B、`index-DUBNk8-R.css` 108,501 B | `shasum -a 256` 与冻结值逐字节一致 |
| 本地包 | ZIP 406,507,281 B，sha256 `edeeef19…` | 独立 `shasum -a 256` 一致；`release-output/local/local-smoke.json` 与测试证据副本 `packaged/local-smoke.json` 逐字节相同 |
| 环境 | macOS 26.6.2 arm64；Electron 44.7.0；宿主 Node v24.14.0（Electron 内 Node 24.21.0）；Vite 8.3.4；electron-builder 26.15.3；包版本 1.4.0 | 与测试/UIUX/装配证据记录一致 |

### 1.2 证据完整性复算

以下 `shasum -a 256 -c` 均由本角色从仓库根独立执行：

| 清单 | 结果 |
| --- | --- |
| 5A 旧端快照 `2026-10-21-phase5a-old-baseline-evidence/snapshot-manifest.sha256` | exit 0，191 项 OK（含补正后的 `old-red-status.md` 683 计数） |
| 5A 新端 final3 `…/final3/snapshot-manifest.sha256` | exit 0，**246 项 OK**（补正后重算；含 `FINAL-G1-G5.md`、`final-allowed-diff-ledger.json`、`ledger-audit.txt`） |
| 5B 证据 `…/2026-10-21-phase5b-new-entry-evidence/snapshot-manifest.sha256` | exit 0，**185 项 OK**（补正后重算；含 `candidate-separation.md`、`csp-gzip-recheck.txt`、`5a-old-vs-final3-uiux.txt`） |
| 5B 测试域清理 `…-test-domain-cleanup-evidence/snapshot-manifest.sha256` | exit 0，13 项 OK；`retired-sha256.txt` 22 项 OK；`modified-sha256.txt` 5 项 OK |
| UIUX 生产入口终审 `manifest.json` | 128 张 PNG 全部 sha256 一致，无缺失/不符 |
| 本角色独立候选清单 `…/2026-10-21-phase5-acceptance-evidence/candidate-manifest-independent.sha256` | exit 0，**378/378 项 OK**；`candidate-deleted-independent.txt` 记录 16 个 DELETED（旧渲染器/旧守卫测试）与 hot-path ④/retired-5b 注记 |

**补正后独立复算**：final3 机器台账 380 行、逐行与 final3 old/new 报告比对**值不匹配 0**、`diff_names_not_ledger_rows` 6 项均为 G3/G4 表内的新等价检查名；`OPEN_CARD_AT_ARRIVAL` 为 G3（旧 207→新 206，PM §19.3，`OPEN_CARD_STABLE_AT_ANCHOR=true`）；post-fix3 JSON 同步为 G3 207/206；final3 的 75 条值差异全部登记、无 proposed/not-approved、`MATCH-FAIL=0`。旧 uiux 424 个旧通过名在新端全部存在且 true，0 个旧通过→新失败。

**同期无关改动（AC8 已补）**：`candidate/candidate-separation.md` 已单独列名 `src/common/`、`src/provider/`、`src/model/`、`src/service/` 与 adapter 测试等同期改动，说明不进入 Phase 5 判定、不涉及 `vite/tsconfig/package` 共享配置、渲染器不 import 它们；同时把 `atomic-write`/`fs-write` 等共享持久化风险交 PM/属主。本报告不再把该项列为缺口；该风险仍不并入 Phase 5 通过结论。

## 二、AC1–AC8 逐条判断

| AC | 主题 | 结论 | 主要原始依据 |
| --- | --- | --- | --- |
| AC1 | 生产入口唯一、旧渲染器/vendor/旧守卫测试下线 | **pass** | `app/desktop/renderer-entry.ts`、`app/main.ts`、`app/renderer/` 目录、删除哈希、178 项台账、release/preload 零 diff |
| AC2 | 新入口真实 Electron、严格 CSP、preload 桥、关键流程 | **pass** | `main.mjs` 397 名 `E2E_PASS=true`、UIUX 23 段 Electron 44.7.0、smoke CSP/console 为空、preload 零 diff |
| AC3 | 全量双端逐 check 名对照与 5A→5B 一致性 | **pass（附旧 uiux 套件版本限制）** | 397/397 名与 20 条环境值差异成立；`OPEN_CARD_AT_ARRIVAL` 已补列 G3（207→206）且独立核对 0 值不匹配；旧 uiux 424 个旧通过名 0 回归 |
| AC4 | 三项 Phase 5 缺口关闭 | **pass** | DELIVERY_NOTE 9/9、COMPLETE_FLOW 41/41、DEFAULT 110/110；三条官方 check 均 true |
| AC5 | 质量门（类型/构建/CSP/gzip/单测/旧基线/IME/懒挂载/bench/C1） | **pass** | typecheck 0（本角色复跑）、build log、gzip 288,530/289,095B、单测 142、旧基线 504、IME 26、lazy 10、bench、C1 Δ=20 |
| AC6 | 本地打包与 packaged smoke（不接发布流水线） | **pass** | ZIP 哈希、包内容核对、14/14 smoke、release/electron-builder 零 diff |
| AC7 | UIUX 最终视觉审计（1360/960/200%） | **pass** | UIUX pass，P0 0/P1 0/P2 5；128 PNG 哈希核验；A–L 三档 |
| AC8 | 证据、候选身份与文档同步可核对 | **pass（独立候选清单补齐）** | 契约面/产品复核已收口；无关改动已分离；F1 台账已补；独立 378 文件清单 + DELETED 记录；F8/F9/F10 非阻塞注记 |

### AC1 生产入口唯一，旧渲染器/vendor/旧守卫测试按批准范围下线——pass

**观察到**

1. **最终入口唯一**：`app/desktop/renderer-entry.ts` 只导出 `RENDERER_RELATIVE = ["renderer","dist","index.html"]` 与 `resolveRendererEntry`；`app/main.ts` 生产 `loadFile` 经它解析；`main.mjs` 默认也经它解析。`app/main.ts`、preload、`package.json`、`electron-builder.yml`、e2e 中没有生产加载旧 `app/renderer/index.html` 的路径。当前 `app/renderer/index.html` 是 481 B 的 Vite 源入口（`/src/main.tsx` + 严格 CSP），不是旧经典入口；生产不加载它。
2. **dev/prod 策略**：`app/main.ts` 生产 `app.isPackaged` ⇒ 构建入口；仅非打包且显式 `ANS_DEV_SERVER_URL`（http/https、回环、无凭据）时 `loadURL`，8s 限时、失败回退同一构建入口；未构建显示恢复页；生产不注入 CSP、不放宽 `webPreferences`（`contextIsolation:true`、`nodeIntegration:false`、`sandbox:false`）。
3. **5A 旧端完整性**：旧 `index.html`/`renderer.js`/`styles.css`/7 个经典脚本/`vendor/` 在 5A 期间未删除；`manifest-old-entry-before/after.sha256` diff 为空（0 字节）；5A 旧端 Node 基线 raw 日志为 683/683（679 + 4 项桌面窗口 5A 检查），补正后文字记录已统一为 679→683→504（见 §四注）。
4. **5B 删除清单**：`app/renderer/` 顶层只剩 `index.html`（新源入口）、`src/`、`dist/`、`tsconfig.json`、`components.json`；旧 8 个渲染文件、`vendor/`、四个旧守卫测试（renderer/markdown/tool-rows/runtime-ui）均已删除；删除哈希与 `2026-10-21_change_ui-platform-phase5b-cutover.md` 记录一致（旧 index.html `03f493e3…`、renderer.js `1ca3837e…`、styles.css `f71f4783…` 等；vendor markdown-it 为已批准的 15.0.3 `391f2aa6…`，HEAD 的 15.0.2 `635972b9…` 是 4B 前的历史值）。
5. **先迁移后删除**：`2026-10-21_phase5a-test-migration-ledger.md` 有 178 个编号行，逐名给出迁移/迁移+e2e/e2e/退役/交接；XSS 负例迁入 `test/桌面UI/markdown.test.ts`（`<script>`/`<img onerror>`/`javascript:`/图片/表格用例），Markdown 仍为单一 npm 精确 `markdown-it@15.0.3`，`html:false`、链接白名单、图片/表格禁用钉子保留。
6. **无悬挂引用**：验证脚本中出现的旧文件名是「包内必无」负向清单；`app/desktop/`、e2e 注释中的旧模块名是历史口径说明，不是运行引用。`vite.config.ts` 的 `input` 指向新的 `app/renderer/index.html`。
7. **发布冻结不变**：`git diff HEAD -- .github/workflows/release.yml src/common/装配/` 为空；`electron-builder.yml` 零 diff；未接流水线。

**非阻塞注记**：`app/renderer/src/shell/shell.css` 仍保留一条未被 DOM 使用的 `.ti-badge` 样式定义（构建 CSS 中也有）；官方检查确认 DOM 无 `.ti-badge`，它不是第三行可见徽标，但属可清理的死样式。

### AC2 新入口真实 Electron 启动、严格 CSP、preload 桥与关键流程——pass

**观察到**

1. **真实 Electron**：`main.mjs`、23 个 `uiux-v2` 模式、IME、bench、design audit、UIUX smoke 均在真实 Electron 44.7.0 下运行；`main` 报告 397 名、`E2E_PASS=true`、`E2E_FAILURES` 空、`E2E_DONE=1`；UIUX 各段 `report.json` 的 `electron` 均为 44.7.0，不是 jsdom/静态检查。
2. **严格 CSP**：`dist/index.html` 的 meta 为 `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;`；单外链 module script + 单外链 stylesheet；无内联 script/style/`style=`、无 `unsafe-inline`/`unsafe-eval`、无 modulepreload link；`vite.config.ts` `modulePreload.polyfill:false`、`base:"./"`。UIUX smoke/phase4b/s0 的 `csp` 与 `console` 数组均为空；packaged smoke 的 `csp`/`cspViolations`/`console`/`load` 全 true、`consoleErrors`/`loadFailures` 为空。
3. **preload 桥**：`git diff HEAD -- app/preload.cjs` 为空；`contextIsolation:true`、`nodeIntegration:false`、`sandbox:false` 未改；渲染层仍只经 preload 桥访问主进程。
4. **关键流程**：官方套件覆盖项目/角色、会话、发送/停止/排队撤回、附件、受控 Markdown、operator/shell/恢复/治理卡、报告/持久化/回执、三引擎设置、资料/文档抽屉、工作概览/队列、引擎切换、窗口控制/主题、960/200% 布局；23 个 uiux 模式全部 `_PASS` 标记，main 397 名全绿（旧端唯一 C 类除外，见 AC3）。
5. **无新端专用分支**：四个 e2e 的差异是入口默认/env 注入与 PM 已批准的 C2/MERGE/toggleDrift/design-audit 重锚；没有为让新入口通过而新增产品分支或放宽断言。

### AC3 全量双端逐 check 名对照与 5A→5B 一致性——pass（附旧 uiux 套件版本限制）

**已成立的逐名对照**

- **main.mjs**：5A 旧端 391 名 / 5A 新端 397 名 / 5B 新端 397 名；旧→新 common 390、only-old 1（`P13_NEW_SEMANTICS`，PM §19.1 批准退役）、only-new 7（`P13_*`，批准），值差异 75；5A 新→5B 新 common 397、only-old/only-new 0、值差异 20。20 条差异名逐字为 `OUTDIR`、`RENDERER_ENTRY`、17 个 `SHOT_*`、`PENDING_DIAG`；行为/契约名与值逐名一致。以上由本角色独立解析三方 report 复算。
- **uiux-v2**：23 个模式全部有 5A 旧、5A 新、5B 新报告；5A 新 vs 5B 新逐模式、逐名、逐值 **0 差异**；5A 新 0 个 false、5B 新 0 个 false。旧端仅 5 个模式各 1 个 false（DEFAULT/RUNTIME 的 C2 旧载体、MIRROR 旧四角色、SELECTOR 旧几何、TOOLFOLD 旧 C1），均登记为旧端基线；旧端其余 18 个模式通过。**本角色独立复算：旧端 424 个值为 true 的检查名在新端全部存在且仍为 true，0 个旧通过→新失败、0 个缺失**；新端新增名是已批准的五角色/C2/C1/选择器/阅读锚点覆盖，没有替换旧名。
- **IME**：旧/5A 新/5B 新三份报告均为 24 个基线布尔名全 true（`=true` 共 26 行，含 2 条非基线 true），名称与值逐名一致，`E2E_DONE=1`。
- **design audit**：5B 31/31 全 `ok:true`（含 12 条重锚、S2 右缘、S1 截断、Motion 0.9s/reduced-motion）；旧端在 5A 快照中 abort（`#chat .tool-records` null，exit 1，无 report），已登记为旧端不适用，PM §19.6 批准重锚到新 DOM；旧端没有可对照的通过报告，故这项只能按「旧端不适用 + 新端全过」记录，不能声称旧端同名通过。
- **bench**：5A 旧/新同机同日交替 3 轮，5B 新端 3 轮；6 个指标的中位与阈值见 §四，全部通过护栏；旧端数据只引用 5A 快照，5B 未复跑旧端。
- **G1–G5（补正后）**：G1 19 整组、G2 12 逐名、**G3 26**（含补正的 `OPEN_CARD_AT_ARRIVAL`）、G4 21 全部关闭/批准/重锚、G4-RESOLVED 1、G5 2 派生、NEW-ONLY 7、OLD-ONLY 1；final3 的 75 条值差异全部登记，无未批准行，`MATCH-FAIL=0`。

**补正复核（本角色独立）**

1. **`OPEN_CARD_AT_ARRIVAL` 已补列（原主缺口已关闭）**：final3 `FINAL-G1-G5.md` 现将该名列入 G3（旧 207→新 206，索引归一化，PM §19.3，`OPEN_CARD_STABLE_AT_ANCHOR=true`），G3 25→26；post-fix3 `final-allowed-diff-ledger.json` 同步改为 G3 207/206。本角色独立解析 final3 机器台账 **380 行**并与 final3 old/new 报告逐行比对：**值不匹配 0**、G0 值差异 0、无 `proposed`/`not-approved`；`diff_names_not_ledger_rows` 的 6 项均为 G3/G4 表内已列的新等价检查名。`ledger-audit.txt` 的结论与本角色复算一致。该缺口关闭。
2. **旧端 uiux 套件版本限制（保留为限制，不再是 needs-work 依据）**：5A 旧端 uiux 报告生成于 18:04–18:05，套件 `d568bf82…`；最终新端报告生成于 20:44，套件 `fa3f74d4…`。main 旧端已于 20:44 用最终套件重跑（391 名），旧 uiux 未在删除前用最终套件重跑，且旧端已删除不可补跑。补正证据 `5a-old-vs-final3-uiux.txt` 记录：23 模式、旧通过名 424、0 缺失、0 旧通过→新失败；本角色独立复算得到同样的 424/0/0。故 AC3 按「实质等价 + 旧套件版本限制」判 pass；**不再声称旧/新同套件源码**，该限制写入 5B 报告与证据。
3. **design audit 旧端不可比（限制）**：旧端 exit 1、无 report，只有 `error.txt`；旧端不适用、PM §19.6 重锚批准，旧端没有通过基线可比。已记录，不冒充旧端通过。

**5A→5B 候选差异说明**：5A 最终冻结为 HTML `f372e111…`/JS `f568e2aa…`/CSS `b52cfca1…`（`dist/src/index.html`）；5B 为 HTML `3c4da2a2…`/JS `f568e2aa…`/CSS `76fad7ce…`（`dist/index.html`）。JS 内容相同，HTML/CSS 随入口迁移与旧文件删除重建而变化；5B 在全部 23 个 uiux 模式与 main 397 名上复跑并逐名一致（见上），UIUX 终审也基于 5B 新哈希重跑。装配记录对 CSS 变化的「入口迁移 + 200% 遮挡修复」表述不精确（200% 修复已在 5A 最终 CSS 中）；该说明性小瑕疵记入 AC8 注记，不影响行为结论。

### AC4 三项 Phase 5 缺口关闭——pass

| # | 官方 check | 5A 新端 | 5B 新端 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | `builtin identity stays data and accessible without duplicate third visible line` | true（DELIVERY_NOTE 9/9） | true（9/9） | `raw/uiux/DELIVERY_NOTE/report.json`；`Sidebar.tsx` 只输出 `data-primary`/`data-builtin`/`aria-description`/`title`，无 `.ti-badge` DOM |
| 2 | `P7 choice pending separated from empty queue` | true（COMPLETE_FLOW 41/41） | true（41/41） | `raw/uiux/COMPLETE_FLOW/report.json`；`pendingKindFor` 按未决 choice 聚合，角色树/工作概览显示「待选择」 |
| 3 | `full replay preserves content identity` | before/after 同一文本、offset `-607`→`-607`（差 0<2px） | 同值 | `raw/uiux/DEFAULT/report.json` 第 307 行；DEFAULT 110/110 跑到末项 `W6-C presented queue…`，非早停 |

补充：UIUX 证据有 `smoke/01-sidebar-identity-1360.png`、`02-p7-pending-choice-1360.png`、`03-full-replay-1360.png`、`03-full-replay-960.png`、`05-sidebar-p7-200pct.png` 等目标截图；`full replay` 的 before/after 文本与 offset 由报告对象直接给出。没有发现用隐藏角色、缩小字号、删除文案或 `.ti-badge` 冒充身份可访问。`shell.css` 残留的 `.ti-badge` 样式规则不产生 DOM/可见第三行（非阻塞注记）。

### AC5 质量门——pass

| 门 | 结果 | 原始证据/独立核对 |
| --- | --- | --- |
| 根 typecheck | exit 0 | 5B `candidate/typecheck.txt`；本角色复跑 `npm run typecheck` exit 0 |
| 渲染 typecheck | exit 0 | 装配/桌面窗口记录；本角色复跑 `npm run typecheck:renderer` exit 0 |
| 构建 | `vite build` exit 0；`dist/index.html`+1 JS+1 CSS；无旧入口/`dist/src` | `candidate/build.log`；dist 列表/哈希复算 |
| CSP 静态 | 严格 meta、零内联/unsafe、modulepreload polyfill 关 | `candidate/csp-gzip.txt`；HTML 直接核对；`vite.config.ts` |
| gzip（入口 JS+CSS） | 测试角色 Node zlib **289,095B**；UIUX/装配 gzip9 **288,530B（含 HTML）**；均 ≤307,200B | `csp-gzip.txt`；本角色 `gzip -9` 复算 JS 268,650 + CSS 19,480 = 288,130B（仅资产） |
| 新单测 `test/桌面UI` | **142/142**，0 fail | `raw/node/unit-ui.txt`；本角色复跑 142/142 exit 0 |
| 旧基线（删除前） | 4B 679/679；5A 新增 4 项后 **683/683**（raw 证据）；删除后 **504/504** | 5A `raw/node/baseline.txt` 683/683；5B `raw/node/desktop.txt` 504/504；桌面窗口 §十一：683 − 178 旧四测试 − 1 hot-path ④ = 504 |
| test/测试 | 715 tests / 714 pass / 1 fail / 0 skip | `raw/node/test-domain.txt`；唯一红 `D3 AC4` 要求真实 `rg`，本机 `spawnSync("rg")` 为 `ENOENT`（`command -v rg` 只是 shell function，`/opt/homebrew/.../rg` 不存在）；环境红，未改断言/未 skip |
| IME | 26 true / 0 false / `E2E_DONE=1`；24 个基线名全 true | `raw/ime/report.txt`；旧/新同名同值 |
| 懒挂载 | **10/10**，`LAZY_TOOLGROUP_DONE=1` | `raw/lazy/report.json`；旧端无 `report.json`（旧入口无新工具组契约，N/A） |
| bench §10.3 | 见下表，全过 | `raw/bench/new{1,2,3}.json`；5A old1–3 |
| C1 | TOOLFOLD `fold anchor offsets` 150→170，**Δ=20**（目标≤20/硬门≤32），5B 与 5A 新端同值 | `raw/uiux/TOOLFOLD/report.json`（`anchorBefore:150, anchorAfter:170, anchorLater:170`） |
| 依赖/例外/断言 | Phase 5 未新增依赖（package-lock 未动）；无新增 DOM 例外；preload/release 零 diff | 装配/桌面窗口记录；`git diff` 核对 |

**bench 数值（5B 新端 3 轮中位 vs 5A 旧端中位）**：

| 指标 | 5B 新中位 | 5A 旧中位 | 阈值 | 结论 |
| --- | --- | --- | --- | --- |
| stormA.maxGap | 20.5ms | 21.5ms | max(21.5,25)=25 | pass |
| stormB.maxGap | 18.2ms | 17.8ms | 25 | pass |
| stormA_handler.maxMs | 1.2ms | 10.7ms | max(12.84,15.7)=15.7 | pass |
| stormB_handler.maxBatchMs | 1.5ms | 1.3ms | max(1.56,6.3)=6.3 | pass |
| replay.replayMs | 10.5ms | 19.4ms | max(23.28,24.4)=24.4 | pass |
| scrollToBottom.ms | 3.4ms | 18.6ms | max(22.32,23.6)=23.6 | pass |

单轮最大 21.9ms ≤50；`histDirect=true` 3/3。相对 5A 新端（stormA 17.7、handler 0.7、scroll 1.8）本次中位有噪声性上浮，但未触及任何批准阈值/护栏；bench 脚本只输出 `maxGap`，未单独输出 p95，因 `p95 ≤ maxGap ≤21.9ms`，p95≤35ms 的护栏由最大值上界满足。该口径与 PM §10.3「不采用每轮≤25ms、单轮用50ms红线」一致。

**注**：5A 旧端文字记录原有 `679/679`/`681/681` 两种旧计数，raw 日志为 683/683；原因是桌面窗口在 5A 新增 4 项（入口接线/dev 回退/导航兜底/导航守卫），台账写作时点为 681（2 项）。补正后 5A/5B 报告已统一为 **679→683→504** 并注明 raw 路径；桌面UI 台账的 681 注明为时点值。最终 683 与 504 的算法在桌面窗口 §十一有逐项说明。

### AC6 本地打包与 packaged smoke——pass

- **构建顺序**：装配先 `npm run build:renderer`，再由 electron-builder 本地打包到 `release-output/local/`；`electron-builder.yml` 零 diff（`files: app/**/*` 覆盖 dist）。
- **包内容**：ZIP 独立 `unzip -l` 核对——含 `app/renderer/dist/index.html`、`assets/index-BVLfGR_D.js`、`assets/index-DUBNk8-R.css`；旧 8 文件、`vendor/`、`dist/src/` **0 命中**；`local-smoke.json` 的 `removedRendererAbsent`/`removedLegacyDirsAbsent` 全 true；`mustExist` 6/6；devDependencies 0/21 进入包，生产依赖 8/8 在位。包内另有 `app/renderer/index.html`（481B 新源入口，Vite dev 用），生产不加载它；不是旧经典入口。
- **真实打包产物启动**：`local-smoke.json` smoke 14/14 true：`entry/rootMounted/driver/csp/cspViolations/dom/preload/ipc/importDisabled/missingConfiguration/settingsEntryDisabled/envPathMatches/console/load`；`isPackaged=true`、arch arm64、`entryUrl` 指向包内 `dist/index.html`、`consoleErrors=[]`、`loadFailures=[]`、`smokeProcess.code=0`。
- **离线**：使用隔离 HOME/提取包与离线夹具，未连接模型/网络、未读 `.env`（`missingKeys` 只记缺失键名）。
- **不接发布流水线**：`.github/workflows/release.yml`、`src/common/装配/release-policy.mjs` 零 diff；未签名/公证/做安装器/`publish`；本地包不是发布件。

### AC7 UIUX 最终视觉审计——pass

- UIUX 最终审计（revision 4，5B 唯一生产入口）结论 **pass：P0 0、P1 0、P2 5**；审计对象为 5B 新哈希 `3c4da2a2/f568e2aa/76fad7ce`。
- **三档/关键面**：1360×860、960×620、200%（960×620 物理/480 CSS，`setZoomFactor(2)`）A–L 覆盖标题栏、左树、聊天流、工具行、卡族、抽屉、设置、工作概览/队列、治理、报告/交付、空态/错误、全局纪律；`main-al-3x` 51 张 17 场景×三档，另有 smoke/phase4b/s0 目标截图。关键面有治理预览、报告/完整摘要、镜像卡、交付、角色树、缺配提示、输入区等。
- **测量而非只看图**：design audit 31/31（W1 行距 15、密度 9/613.4、960 6/381.4、S2 右缘 0、S1 截断、W6 1.6、W9–W12 Motion/reduced）；5A smoke 36/36（680/480 遮挡门 `bottom<=composer.top`、composer 95、S0、全 replay）；4B smoke 70/70（480 逐容器无横溢、header 换行、config notice）；带提示条密度 32/32（8/576.4）；S0 480 25/25。
- **旧新对照**：§十二 有 200% 左树/头部横溢/治理预览/Esc/报告 target 的旧端快照→新端结果表；旧图引用 `2026-10-21-phase5a-old-visual-evidence/raw/...`（旧端已删，只读历史）。
- **P2 5 条逐条记录**（`findings.json`，不阻塞）：①480 镜像 chip 与确认/拒绝动作带重叠（滚动可移开）；②480 报告/交付 target 可见但完整卡片/批次标题在视口上缘外；③480 缺配条下半/「打开 Pi 设置」按钮初始画面被 composer 覆盖（header/设置入口仍可恢复）；④main 3× 200% 截图常停滚动底部/`04-profile` 为聊天、命名不符；⑤smoke/4B「窗口控制不可用」harness 标记（非产品）。
- **证据核验**：`manifest.json` 128 张 PNG 的 sha256/尺寸全部一致；`findings.json` summary 与报告 §十二 一致；未发现第二设计系统/令牌/图标/动画或 200% 横向滚动。200% 为 zoom factor，不等于 OS/DPI 200%（边界见 §六）。

### AC8 证据、候选身份与文档同步——pass（独立候选清单补齐）

**已成立部分**：候选身份/哈希、dist/包摘要、四份证据 manifest（补正后 191/246/185/13）、测试/UIUX/装配原始输出、官方与 probe 分目录（`probes/dist-static-scan-5b.cjs` 单列）、失败/环境红保留、截图 hash、证据索引均存在且可复算；5A/5B 候选未拼接，5B 未复跑旧端。

**补正复核**：

1. **契约面已最终更新（F2 关闭）**：`ui-contract-surface.md` frontmatter 改为 `status: implemented`（唯一生产入口 `app/renderer/dist/index.html`、旧渲染器/vendor 已删、四个 e2e/冒烟默认翻转、packaged smoke 完成）；套件表默认入口已改为 `dist/index.html`；§四 #1/#22/#24/#26–#28/#34/#37–#38 已写 5B 三态/DOM 例外（仍只有延迟挂载 40 与失效 operator 卡动作 hidden 两条）；旧文件/`dist/src`/「旧入口仍生产默认」等过期引用已清理。
2. **产品最终产品面复核已补（F3 关闭）**：新增 `角色卡/产品/docs/change/2026-10-21_change_ui-platform-final-review.md`（status: reviewed），按「让治理可见/一眼三问」逐项复核 5B 证据、列出六类未判与 P2；提案 `2026-10-21_design_ui-platform-round.md` 已升为 revision 3、`status: implemented`，写明最终入口 `dist/index.html`/三哈希/5A/5B 门/独立验收 needs-work（历史时点）/未发布；PM 记录 §17.1/§20.3 同一路径。三处入口一致。
3. **同期无关改动已分离（F4 关闭）**：`candidate/candidate-separation.md` 单独列名 `src/common|provider|model|service`、adapter 测试与角色文档；说明不进入 Phase 5 判定、不涉及 `vite/tsconfig/package` 共享配置、渲染器不 import 它们、不进 renderer dist；`atomic-write`/`fs-write` 共享持久化风险交 PM/属主，不并入 Phase 5 通过结论。
4. **台账/计数已统一（F1/F6 关闭）**：`OPEN_CARD_AT_ARRIVAL` 已补 G3（207→206，PM §19.3，`OPEN_CARD_STABLE_AT_ANCHOR=true`）；final3 机器台账 380 行、本角色独立比对**值不匹配 0**、无 proposed/not-approved、`MATCH-FAIL=0`；post-fix3 JSON 同步 G3 207/206。`old-red-status.md` 改为 683（679+4），5A/5B 报告统一 679→683→504，并注明 raw 路径；桌面UI 迁移台账的 681 是时点值，未越权改。
5. **探针/说明已修正（F7 关闭）**：`dist-static-scan-5b.cjs` 的 `RELATIVE_ASSET_REFS` 改为接受 `./assets/`（兼容 `../assets/`），重跑 `csp-gzip-recheck.txt`：`RELATIVE_ASSET_REFS=true`、gzip 289,095B≤307,200、CSP 严格；之前 false 是探针口径过期，不是 CSP 失败。装配对 CSS hash 变化的「入口迁移 + 200% 遮挡修复」表述仍不够精确（200% 修复已在 5A 最终 CSS 中；85B 差异未逐项归因），记为说明性注记，不影响行为结论。
6. **候选清单完整性（本角色补齐）**：提供方 `core-sha256-after.txt` 只覆盖 10 个核心文件，`git-status.txt` 把 `app/renderer/src/`、`test/桌面UI/` 作为目录整体列出，未满足 §2.3「未跟踪文件逐个列名并给摘要」的字面要求。本角色按 §2.3/§八独立生成 `2026-10-21-phase5-acceptance-evidence/candidate-manifest-independent.sha256`（**378 个现有文件**，覆盖 app/desktop、app/renderer/src、dist、test/桌面应用 e2e 与 *.test.ts、test/桌面UI、test/测试、test/装配、src/common/装配、package/vite/tsconfig/electron-builder/release.yml）与 `candidate-deleted-independent.txt`（16 个 DELETED 旧渲染器/旧守卫测试 + hot-path ④/retired-5b 注记）；378/378 `shasum -c` OK。另将包内 `app/` 123 个文件与工作树逐文件比对：0 缺失、0 哈希不符；工作树多出的 `app/renderer/src/vite-env.d.ts` 是类型声明、未入包。提供方后续仍建议直接生成同格式完整 manifest（非阻塞）。
7. **其余注记（非阻塞）**：F8 `.ti-badge` 死 CSS 规则仍在 `shell.css`/dist 中（无 DOM；为保持冻结 hash 未删，已记录，后续清理）；F9 UIUX 证据在 `docs/design/`（UIUX 边界允许，历史审计一致）；F10 `test/测试` 唯一红为本机无真实 `rg`（ENOENT，环境红，未改断言/未 skip；不属 AC5 产品门）。

**结论**：AC8 pass；候选身份由独立 378 文件清单 + DELETED 记录 + 包内 app 逐文件核对补齐；文档/台账/探针补正完成。按标准 §2.4/§5.3，文档补正不改产品、测试断言或候选摘要，不需重跑产品门；若后续产品文件变化，则重新冻结并重跑受影响门。

## 三、全量双端与 5A/5B 一致性汇总

### 3.1 main.mjs

| 对比 | 名称数 | common | only-old | only-new | 值差异 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 5A 旧端 vs 5A 新端 | 391 / 397 | 390 | 1（`P13_NEW_SEMANTICS`，批准退役） | 7（`P13_*`，批准） | 75 | 逐名可对照；G1–G5 分组见下 |
| 5A 新端 vs 5B 新端 | 397 / 397 | 397 | 0 | 0 | 20（环境/派生：OUTDIR、RENDERER_ENTRY、17 SHOT_*、PENDING_DIAG） | 行为/契约名与值逐名一致 |
| 5A 旧端 vs 5B 新端 | 391 / 397 | 390 | 1 | 7 | 75 | 与 5A 新端相同；旧端不可复跑 |

- 5A 旧端 `E2E_PASS=false`，唯一 `E2E_FAILURES=RECOVERY_SAME_PENDING_CARD_ONCE`（C 类同因）；5A 新端/5B 新端 `E2E_PASS=true`、`E2E_FAILURES=`、`E2E_DONE=1`。
- **G1–G5（补正后）**：G1 19 整组批准（环境/实例）；G2 12 逐名批准；**G3 26**（含 `OPEN_CARD_AT_ARRIVAL` 207→206，索引归一化，PM §19.3）；G4 21 全部关闭/批准/重锚；G4-RESOLVED 1；G5 2 派生；NEW-ONLY 7 P13；OLD-ONLY 1 退役。final3 的 75 条值差异全部登记、无未批准行、`MATCH-FAIL=0`（本角色独立 380 行值比对 0 不匹配）。
- **旧端不可复跑**：5B 已删除旧渲染器/vendor/旧守卫测试，旧端结论只引用 5A 快照（391 名，唯一 C 类）；5B 报告没有把新端结果标为旧端。
- **5A 快照完整性**：`2026-10-21-phase5a-old-baseline-evidence/snapshot-manifest.sha256` 复算 191 项 OK；补正后 final3 246 项 OK、5B 185 项 OK；`manifest-old-entry-before/after.sha256` diff 为空。
- **S0 命名**：`BOOTSTRAP_S0_*` 六名未进 main 官方名单，行为由 5A smoke 36/36 的 S0 3 项 + 独立 S0 9/9 覆盖；PM §20.2 已接受为等价覆盖（NEW-ONLY/EQUIVALENT），不按缺失旧名处理。

### 3.2 uiux-v2 / IME / design audit / bench

- **uiux-v2**：23 个模式，5A 新与 5B 新逐模式 0 差异、0 false；5A 旧端 5 个失败模式各 1 个 false（见上），旧端 18 个模式通过；所有旧端通过名在新端存在且通过。旧端 uiux 套件版本低于最终套件（`d568bf82` vs `fa3f74d4`），旧端已删，无法补跑（AC3 限制）。
- **IME**：24 个基线名，旧/5A/5B 全 true、同名同值；5B `E2E_DONE=1`。
- **design audit**：旧端不可运行（exit 1，无 report，S1 夹具 `#chat .tool-records` null）；新端 31/31 全 true。PM §19.6 批准重锚；旧端没有通过基线可比。
- **bench**：上表；5A 旧/新同机同日交替 3 轮，5B 新端 3 轮；旧端 `histDirect=false`，新端 true；C1 150→170 Δ=20 在 5A 新/5B 新一致。

## 四、问题清单与处置状态

| # | 发现 | 影响 AC | 状态/处置 |
| --- | --- | --- | --- |
| F1 | final3 G1–G5 漏登 `OPEN_CARD_AT_ARRIVAL` 207→206；post-fix3 台账记为 MATCH 207/207 | AC3/AC8 | **已关闭**：final3 G3 补行（26 行）；post-fix3 JSON 改 G3 207/206；本角色独立核对 380 行、值不匹配 0、无未批准、`MATCH-FAIL=0` |
| F2 | 契约面仍写旧入口/旧文件/`dist/src` 与「待收尾」 | AC8 | **已关闭**：`ui-contract-surface.md` status implemented、套件表/三态表/默认入口均改 `dist/index.html`；旧文件与 `dist/src` 过期引用已清理；两条 DOM 例外保持 |
| F3 | 产品最终产品面复核记录/提案最终入口缺失 | AC8 | **已关闭**：`2026-10-21_change_ui-platform-final-review.md`（reviewed）；提案 revision 3 status implemented、最终入口/哈希/5A/5B 门写明；PM §17.1/§20.3 三处一致 |
| F4 | 同期无关 `src/common|provider|model|service`/adapter 测试未分离 | AC8 | **已关闭**：`candidate/candidate-separation.md` 逐类列名、说明不进入 Phase 5 判定/不进 renderer dist；共享持久化风险交 PM/属主，不并入通过结论 |
| F5 | 旧端 uiux 套件 `d568bf82` ≠ 最终 `fa3f74d4`，删除前未用最终套件重跑；旧端已删不可补 | AC3（限制） | **已记录为限制**：旧通过名 424、0 缺失、0 旧通过→新失败（本角色独立复算一致）；不再声称同套件源码；AC3 按实质等价判 pass |
| F6 | `old-red-status.md` 679/679、迁移台账 681/681 与 raw 683/683 不一致 | AC8（文字） | **已关闭**：统一 679→683→504 并注明 raw 路径；桌面UI 台账 681 注明时点值 |
| F7 | `RELATIVE_ASSET_REFS` probe 口径过期；装配对 CSS hash 变化解释不精确 | AC8（说明） | **已关闭/注记**：probe 改 `./assets/` + 兼容 `../assets/`，重跑 true、gzip 289,095B、CSP 严格；装配对 5B CSS 85B 变化的表述仍不够精确，记为说明性注记（非阻塞） |
| F8 | `.ti-badge` 死 CSS 规则残留（无 DOM） | AC1/AC8（非阻塞） | 已记录；为保持冻结 hash 未删，后续清理；不影响 AC4 官方检查 |
| F9 | UIUX 证据在 `docs/design/` 而非 AC8 字面 `docs/change`/`docs/fix` | AC8（轻） | 角色边界允许，历史审计一致；记录为位置口径差异，非阻塞 |
| F10 | test/测试 1 红（真实 `rg` 缺失） | AC5 注记 | 环境红（`spawnSync` ENOENT）；未改断言/未 skip；不属 AC5 产品门；本机无法验证该用例，保留 |
| F11 | 提供方候选清单不完整：`core-sha256-after` 仅 10 文件，`git-status` 把 `app/renderer/src/`、`test/桌面UI/` 作为目录整体列出 | AC8 | **已由本角色补齐**：独立 `candidate-manifest-independent.sha256` 378 文件 + `candidate-deleted-independent.txt` 16 DELETED；378/378 OK；包内 `app/` 123 文件 0 差异；建议提供方后续直接生成同格式完整 manifest（非阻塞） |

## 五、missing-evidence 边界（本轮逐项「未判」）

以下六项按标准 §六**本轮未判**；macOS 离线/本地包/夹具不能替代，也不能被写成已通过：

| 项 | 本轮状态 | 允许证据/禁止替代 |
| --- | --- | --- |
| 真实模型/网络/`.env` 生产验证 | **本轮未判** | 离线夹具/替身只证明离线行为；没有连接真实模型/网络，未读 `.env`；不能用本地包/夹具结果声称线上模型可用 |
| Windows 原生路径、DPI 缩放、屏读 | **本轮未判** | 无证据；macOS、zoom factor 200%、字符串测试、skipped 均不能代替 |
| 签名、公证、安装器、自动更新 | **本轮未判** | 本地未签名 ZIP 只作 packaged smoke；不是发布件/安装器 |
| 发布流水线与 CI（release.yml/release-policy.mjs） | **本轮未判（M1：本轮不改）** | 两文件零 diff 已核对；未接入流水线、未声称 CI 通过 |
| Linux/其他平台 | **本轮未判** | 无证据；macOS 结果不能代替 |
| 真实主进程卡通道/真实引擎会话（非替身） | **本轮未判** | 套件使用离线 IPC 替身/夹具；不能把替身结果说成真实引擎/真实通道验证 |

上述六项不阻塞 Phase 5 范围内的结论，但本报告不把它们记成通过；若客户另行授权，需新增标准附录与证据。

## 六、总体结论与后续

**总体：pass（AC1–AC8 全部满足；范围限 macOS 本机离线夹具/本地构建/本地 electron-builder 打包）。** 5A 门与 5B 门均有当前候选的有效独立证据；AC3/AC8 的补正已经复核关闭；无未解决的 Phase 5 产品门失败；六类边界仍为「本轮未判」。

**补正收口**：F1/F2/F3/F4/F6/F7 已由属主补正并由本角色复核（见 AC3/AC8 与 §四）；F5 记录为旧 uiux 套件版本限制并以 424 名 0 回归证实质等价；F11 由本角色独立 378 文件候选清单 + 16 个 DELETED 条目补齐，提供方后续可补同格式 manifest（非阻塞）；F8/F9/F10 为非阻塞记录/环境红。

**非阻塞剩余项**：

1. `.ti-badge` 死 CSS 规则可在后续清理（当前为保持冻结 hash 未删，无 DOM，不影响 AC4）。
2. 装配对 5B CSS 85B 变化的说明可再精确（行为证据已逐名一致）。
3. 测试/测试 的 `rg` 环境红需本机安装真实 ripgrep 才能转绿；不影响 Phase 5 范围内结论（非 AC5 产品门）。
4. 产品复核/提案中「AC3/AC8 补正中」的时点措辞可在下次文档更新时改为「已补正」；不影响当前结论。

**权限与发布分离**：本报告是独立验收结论，不是提交/推送/部署/合并/发布授权；验收通过不改变客户发布决定。`release.yml`/`release-policy.mjs` 保持零 diff，下一次冻结源/新发布轮由客户决定；签名/公证/安装器/Windows/真实网络等仍按 §五本轮未判。

## 七、核对方式与状态声明

**只读核对**：本报告读取了角色卡/边界、固定标准 A1、PM 评审 revision 17 §十六至§二十、测试 5A/5B 报告与 final3/旧端/5B 证据、UIUX 终审与 128 PNG manifest、装配 5B 记录与 `release-output/local/local-smoke.json`、桌面UI 契约面/迁移台账/5B 切记录、桌面窗口 5A/5B 记录、产品提案/变更记录、`app/main.ts`/`app/desktop/renderer-entry.ts`/`app/renderer/dist/index.html`/`vite.config.ts`/`app/preload.cjs`/`package.json`/`electron-builder.yml` 等。未修改任何产品、测试、他人报告、角色卡/边界或调度状态。

**本角色执行过的命令**：`git rev-parse/status/diff/show`、`shasum -a 256`（dist、ZIP、四份证据 manifest、UIUX 128 PNG、清理/退役 manifest、独立 378 文件候选清单）、`gzip -9` 复算、`unzip -l`/`unzip -q` 包内容与 `app/` 123 文件逐文件比对、`find -newermt`、`node --test "test/桌面UI/*.test.ts"`（142/142）、`npm run typecheck`/`typecheck:renderer`（均 exit 0）、read-only Python 解析三方 main/uiux/IME/bench/design-audit 报告做逐名对照与 final3 台账 380 行值比对。**未运行**完整 e2e/打包/真实模型/网络/bench/全量旧基线；未读 `.env`；未 commit/push。

**状态**：本文件是独立的验收报告（change，status: verified，结论 pass），不是实施、测试或发布记录。标准 A1 未修改、未降低；报告内所有数值均可按所列证据路径复算；若候选、契约或证据后来变化，受影响结论失效并重判。

## 八、证据索引（主要路径）

- 标准：`角色卡/独立验收/docs/design/2026-10-21_design_ui-platform-phase5-acceptance.md`（SHA-256 见文首）
- 测试 5B：`角色卡/测试/docs/change/2026-10-21_change_phase5b-final-verification.md`；`…/2026-10-21-phase5b-new-entry-evidence/index.md`、`candidate/`、`raw/{main,uiux,ime,lazy,bench,design-audit,node}/`、`main-diff/FINAL-G1-G5-5B.md`、`packaged/`
- 测试域清理：`角色卡/测试/docs/change/2026-10-21_change_5b-test-domain-cleanup.md`；`…-test-domain-cleanup-evidence/{retired-checks.md,retired-sha256.txt,modified-sha256.txt}`
- 5A 快照：`角色卡/测试/docs/change/2026-10-21-phase5a-old-baseline-evidence/`；`…/2026-10-21-phase5a-new-entry-evidence/final3/`（含补正后 `main-diff/FINAL-G1-G5.md`、`final-allowed-diff-ledger.json`、`ledger-audit.txt`）；`…/2026-10-21_change_phase5a-final-verification.md`
- 本角色独立候选清单：`角色卡/独立验收/docs/change/2026-10-21-phase5-acceptance-evidence/candidate-manifest-independent.sha256`（378 文件，sha256 `ad19be24…`）、`candidate-deleted-independent.txt`（16 DELETED，sha256 `8520fa49…`）
- UIUX：`角色卡/UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase5b-final-audit.md`；`…/2026-10-21-phase5b-production-entry-audit-evidence/{manifest.json,findings.json,smoke,phase4b-smoke,design-audit,density-notice-pass,s0-200,main-al-3x}`
- 装配：`角色卡/装配/docs/change/2026-10-21_change_ui-platform-phase5b-renderer-entry.md`；`release-output/local/{ANS-Studio-1.4.0-mac-arm64.zip,local-smoke.json}`
- 桌面UI：`角色卡/桌面UI/docs/change/2026-10-21_change_ui-platform-phase5b-cutover.md`、`2026-10-21_phase5a-test-migration-ledger.md`、`docs/feature/ui-contract-surface.md`（5B 最终化）、`docs/feature/ui-components.md`
- 桌面窗口：`角色卡/桌面窗口/docs/change/2026-10-21_change_ui-platform-phase5a-entry.md`（§十一 5B 步骤 c）
- PM：`角色卡/项目管理/docs/design/2026-10-21_review_ui-platform-round.md` §十六–§二十
- 产品：`角色卡/产品/docs/design/2026-10-21_design_ui-platform-round.md`（revision 3, implemented）；`角色卡/产品/docs/change/2026-10-21_change_ui-platform-final-review.md`（最终轻量复核）
