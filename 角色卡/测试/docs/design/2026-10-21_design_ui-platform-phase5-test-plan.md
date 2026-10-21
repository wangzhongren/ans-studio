---
id: design-ui-platform-phase5-test-plan
type: design
title: Phase 5 全量双端对照与 5A/5B 验证计划（测试角色）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: planned
related: [ui-platform-round-review, ui-platform-phase4b-governance-receipts, check-ledger-phase3a, phase5-suite-inventory]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按 Phase 5（5A→5B）授权产出全量双端套件清单、5A 旧/新端快照与逐 check 对照协议、允许差异模板、已知 Phase 5 缺口关闭条件、5B 切换/打包/最终回归/删除前快照完整性门；只写计划，未跑实现
---

# Phase 5 全量双端对照与 5A/5B 验证计划

**依据**：PM [Phase 5 授权与门规](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)（全量双端、入口切换、打包/真机留 Phase 5）；4B 独立验证与返工/200% 重验报告；测试台账 §八；桌面UI 候选与套件源码。**本文件是验证计划，不是执行记录**；5A/5B 的真实环境、退出码、报告与截图在授权后按本文执行并落入证据目录。

**套件 check 名清单（本计划的组成部分）**：[2026-10-21_phase5-suite-inventory.md](2026-10-21_phase5-suite-inventory.md)。该清单从当前源码/既有报告静态提取，逐名列出 uiux-v2 各模式、main.mjs 检查键、ime-enter、bench-storm、uiux-design-audit；5A 运行时以实际 `report.json`/`report.txt` 的 `reports[].name` 为最终名单，本清单用于逐名对照，不以计数代替。

## 一、目标与定义

- **全量双端**：同一候选、同一机器/环境、同一套件，分别对**旧入口**（`app/renderer/index.html` + 旧 renderer 核心）与**新入口**（`app/renderer/dist/src/index.html`，Vite/React）执行；逐 check 名对账，不是抽样。
- **5A**：旧端快照冻结 + 新端同套件运行 + 逐 check 对照 + 已知 Phase 5 缺口在 5A 关闭；**不切换生产入口**。
- **5B**：生产入口切换到新端；删除旧入口前做快照完整性核对；新端全量套件、packaged smoke、最终回归；**旧端不再复跑**，只引用 5A 冻结快照。
- **候选**：每次 5A/5B 执行前重新 clean build 并生成候选哈希清单；候选一变，旧结论按 Invariant #6 失效。
- **不弱化断言**：检查名、布尔断言、负向用例、阈值、fail-closed 行为不得删除或放宽；目标切换只允许改入口/env 管线，不改业务断言。

## 二、计划时基线（2026-10-21）

- HEAD：`224cf831f7a26fd2fac8af7155790a75fa31f6b5`；Node `v24.14.0`；Electron `v44.7.0`；Darwin arm64。
- 旧入口哈希：`app/renderer/index.html 03f493e3…`、`app/renderer/renderer.js 1ca3837e…`、`app/main.ts 59654afd…`、`app/preload.cjs 98dde83a…`。
- 套件哈希：`uiux-v2.mjs 4bf50d86…`、`main.mjs b72fa921…`、`ime-enter.mjs f17c907f…`、`bench-storm.mjs 91fd3c38…`、`uiux-design-audit.mjs 9d1b05c9…`。
- 依赖锁：`package.json 42d28192…`、`package-lock.json dbcd6ae6…`。
- 以上哈希在 5A/5B 开始时写入 `candidate-manifest.sha256` 并复算；计划时值只用于识别候选漂移。

## 三、套件矩阵（全量）

| 套件 | 目标切换 | 环境/命令 | 报告与成功标记 |
| --- | --- | --- | --- |
| uiux-v2 默认段 | `ANS_RENDERER_ENTRY` | `ANS_UIUX_OUTDIR=... electron test/桌面应用/e2e/uiux-v2.mjs` | `$OUT/report.json`；exit 0 |
| uiux-v2 22 个模式段 | `ANS_RENDERER_ENTRY` | 见下表逐模式 env | `$OUT/report.json`；各 `*_PASS` 标记 |
| main.mjs | **5A-0 需加** `ANS_RENDERER_ENTRY`（当前硬编码旧入口） | `ANS_E2E_PROJECT=... ANS_E2E_OUTDIR=... electron test/桌面应用/e2e/main.mjs` | `$OUTDIR/report.txt`；`E2E_DONE=1` |
| ime-enter | `ANS_RENDERER_ENTRY` | `ANS_IME_OUTDIR=... electron test/桌面应用/e2e/ime-enter.mjs` | `$OUT/report.txt`；`E2E_DONE=1` |
| bench-storm | `ANS_RENDERER_ENTRY` | `BENCH_OUT=... electron test/桌面应用/e2e/bench-storm.mjs` | `$BENCH_OUT` JSON；3 有效轮 |
| uiux-design-audit | **5A-0 需加** `ANS_RENDERER_ENTRY`（当前硬编码旧入口） | `ANS_UIUX_OUTDIR=... electron test/桌面应用/e2e/uiux-design-audit.mjs` | `$OUT/report.json`；exit 0 |
| Node 单测 | — | `node --test "test/桌面UI/*.test.ts"` | exit 0；96/96 |
| 旧基线单测 | — | `node --test test/桌面应用/*.test.ts` | exit 0；679/679 |
| 懒挂载 | — | `electron test/测试/phase3a-lazy-toolgroup-check.mjs <entry> <out>` | `LAZY_TOOLGROUP_DONE=1` |

**运行约定**：uiux-v2 每个模式独立进程、独立 `ANS_UIUX_OUTDIR`；默认 `ANS_UIUX_INTERACTIVE=0`（无人值守离线），窗口/缩放按环境记录；禁止同进程串跑模式以免状态串扰。**uiux-v2 模式表（每一模式都是必跑项）**：

| 模式 | env | 函数 | 成功标记 |
| --- | --- | --- | --- |
| 默认 | 无 | app.whenReady 默认体 | exit 0 |
| FRESH | `ANS_FRESH_CONTEXT_UI_ONLY=1` | freshContextChecks | FRESH_CONTEXT_PASS |
| ROLE_FOCUS | `ANS_ROLE_RETURN_FOCUS_UI_ONLY=1` | roleDocumentFocusChecks | ROLE_FOCUS_PASS |
| TERMINAL | `ANS_TERMINAL_UI_ONLY=1` | terminalChecks | TERMINAL_PASS |
| SEND_FACTS | `ANS_SEND_FACTS_UI_ONLY=1` | sendFactsChecks | SEND_FACTS_PASS |
| TERMINAL_MERGE | `ANS_TERMINAL_MERGE_UI_ONLY=1` | terminalMergeChecks | TERMINAL_MERGE_PASS |
| VISUAL | `ANS_VISUAL_V2_UI_ONLY=1` | visualChecks | VISUAL_V2_PASS |
| DELIVERY_NOTE | `ANS_DELIVERY_NOTE_UI_ONLY=1` | deliveryNoteChecks | DELIVERY_NOTE_PASS |
| COMPLETE_FLOW | `ANS_COMPLETE_FLOW_UI_ONLY=1` | completeFlowChecks | COMPLETE_FLOW_UI_PASS |
| PROJECT_RESET | `ANS_PROJECT_RESET_UI_ONLY=1` | projectResetChecks | PROJECT_RESET_UI_PASS |
| DUP | `ANS_DUP_UI_ONLY=1` | duplicateChecks | DUP_UI_PASS |
| SELECTOR | `ANS_SELECTOR_UI_ONLY=1` | selectorChecks | SELECTOR_UI_PASS |
| CONFIG | `ANS_CONFIG_UI_ONLY=1` | configChecks | CONFIG_UI_PASS |
| RUNTIME | `ANS_RUNTIME_UI_ONLY=1` | runtimeChecks | RUNTIME_UI_PASS |
| MIRROR | `ANS_MIRROR_UI_ONLY=1` | mirrorChecks | MIRROR_UI_PASS |
| MERGE | `ANS_MERGE_UI_ONLY=1` | mergeChecks | MERGE_UI_PASS |
| G2 | `ANS_G2_RECOVERY_UI_ONLY=1` | g2RecoveryChecks | G2_RECOVERY_UI_PASS |
| TOOLFOLD | `ANS_TOOLFOLD_UI_ONLY=1` | toolFoldChecks | TOOLFOLD_UI_PASS |
| GOV | `ANS_GOVERNANCE_REACCEPT_UI_ONLY=1` | governanceReacceptChecks | GOVERNANCE_REACCEPT_UI_PASS |
| NOTICE | `ANS_NOTICE_UI_ONLY=1` | noticeChecks | SYSTEM_NOTICE_UI_PASS |
| BLANK | `ANS_BLANK_PANE_UI_ONLY=1` | blankPaneChecks | BLANK_PANE_UI_PASS |
| QUEUE_VIEW | `ANS_QUEUE_VIEW_UI_ONLY=1` | queueViewChecks | QUEUE_VIEW_UI_PASS |

**补充测量（非门）**：`uiux-prototype-measure.mjs` 只记录原型几何 `widths.<档位>`，用于 UIUX 设计对照，不进入 5A/5B 必过门；若 PM 将其纳入门，则按同一双端/逐名规则追加。

## 四、5A-0 前置（开始快照前必须完成）

1. **目标切换管线**：`main.mjs`、`uiux-design-audit.mjs` 增加单一 `ANS_RENDERER_ENTRY` 读取（缺省仍旧入口），禁止每套件自造第二变量；改动只限入口路径，不改任何断言/夹具。由桌面UI落文件，测试只读核对并在 5A 新端运行。
2. **已知 Phase 5 缺口先关闭**（桌面UI 实现、测试独立复验；官方段必须自己到达，不再用补证副本替代必过名）：
   - **Sidebar 身份徽标**：`DELIVERY_NOTE` 的 `builtin identity stays data and accessible without duplicate third visible line`；关闭后 DELIVERY_NOTE 必须继续跑完其后 `long project path is single line ellipsis with full actual title`。
   - **P7「待选择」**：`COMPLETE_FLOW` 的 `P7 choice pending separated from empty queue` 与 `P7 locate uses original request no default decision`；关闭后 COMPLETE_FLOW 必须继续跑完 C/P3 全部名单。
   - **虚拟窗口阅读锚点**：默认段的 `full replay preserves content identity`（raw assert，连同 `incremental reader anchor`）；关闭后默认段必须继续跑完 toggleDrift/B1/B2/B3 全部名单。
3. **套件冻结**：5A 快照前记录套件文件哈希；快照期间禁止改断言。若必须改目标切换，改动单独提交并在差异表登记为“仅 env 管线”。
4. **候选冻结**：5A 旧/新端使用同一 HEAD/工作树与同一依赖锁；旧端 build 产物（新入口 dist）与旧入口目录哈希均入 manifest。

## 五、5A 旧端快照

### 5.1 执行

对旧入口 `ANS_RENDERER_ENTRY=app/renderer/index.html`（main/design audit 缺省旧入口）按 §三全量执行；每个模式独立 `ANS_UIUX_OUTDIR=$EVID/raw/uiux/<MODE>`，每次运行独立进程，避免状态串扰。顺序：默认 + 22 模式 + main + ime + bench（旧端 3 轮）+ design audit + Node 单测/旧基线/懒挂载。

### 5.2 必须记录的字段

`$EVID/suite-index.md` 每个套件/模式一行，至少包含：

| 字段 | 说明 |
| --- | --- |
| suite/mode | 套件与模式 |
| command | 完整命令（含 env，不含 `.env` 内容） |
| entry | 旧入口绝对路径 |
| exit_code | 进程退出码 |
| pass_marker | `*_PASS`/`E2E_DONE`/exit 0 |
| report_path | `report.json`/`report.txt`/`BENCH_OUT` |
| check_names | 实际 `reports[].name` 的清单文件（不得只写数量） |
| check_values | 每个 name 的布尔值/报告对象 |
| environment | OS/arch/Node/Electron/Chromium/zoom/window size/offline |
| hashes | 套件与候选哈希 |

同时生成 `environment.txt`、`candidate-manifest.sha256`、`raw/<suite>/<mode>/stdout.log`、所有报告/截图。

### 5.3 冻结

快照完成后复算 `candidate-manifest.sha256` 与套件哈希，必须与执行前一致；任何差异 → 5A 快照无效，重跑。旧端快照只读存档，5B 不再复跑。

## 六、5A 新端运行与逐 check 对照

### 6.1 执行

同一环境、同一套件、同一模式矩阵，目标切换为 `ANS_RENDERER_ENTRY=app/renderer/dist/src/index.html`（或 5A-0 统一变量）；输出到 `$EVID/raw-new/...`。每模式独立进程。

### 6.2 逐 check 名对照

对每个套件/模式生成 `name-diff.md`：

- 读取旧/新 `report.json` 的 `reports[]`，按 `name` 精确匹配；模板名先按实际展开（如 `role geometry 1360/960`）再匹配。
- 状态只能为：`MATCH-PASS`、`MATCH-FAIL`、`RENAME`、`NEW-ONLY`、`OLD-ONLY`、`REMOVED`。
- 每个非 `MATCH-PASS` 行必须进入允许差异清单并获得 PM 批准；未批准即 5A 门失败。
- `MATCH-FAIL` 不得用“新端预期变化”解释；必须是产品/夹具缺陷并修复或 PM 明确批准差异。
- `observed` 报告对象、截图、几何测量不是检查名，单独列“测量记录”，不得拿来替代布尔检查。

### 6.3 允许差异清单模板（PM 批准）

| ID | Suite / mode | 旧端 check 名/值/证据 | 新端 check 名/值/证据 | 类型 | 依据与替代覆盖 | PM 决定 | 到期 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PM-5A-01 | DELIVERY_NOTE | 旧端对应能力待快照（预期无身份徽标 DOM） | `builtin identity stays data and accessible without duplicate third visible line` = pass | `NEW-ONLY`（预期） | Sidebar 新身份徽标；旧端无等价载体，需旧端 DOM 证据 | proposed/approved/rejected | 5A 关闭 |
| PM-5A-02 | COMPLETE_FLOW | `P7 choice pending separated from empty queue`（旧端值待快照） | 同名 = pass | `RENAME`/语义重锚（预期） | 新角色树「待选择」文案；P7 两项须一起过 | proposed/approved/rejected | 5A 关闭 |
| PM-5A-03 | 默认段 | `full replay preserves content identity` raw assert（旧端值待快照） | 同名 raw assert = pass | `MEASUREMENT`/重锚（预期） | 新虚拟窗口阅读锚点；旧端虚拟化差异需测量证据 | proposed/approved/rejected | 5A 关闭 |

> 上表是模板示例，不预判旧端实际值；5A 快照后按实际值改写并请 PM 逐行批准。未批准的 `NEW-ONLY`/`RENAME`/`REMOVED` 一律视为门失败。

规则：

- 同名同义必须两端都过，不允许用差异表掩盖旧端红。
- 改名仅当语义完全一致；必须保留旧名到新名的覆盖映射与报告证据。
- `NEW-ONLY` 仅当旧入口无法表达该能力（如新 Sidebar 身份徽标）且 PM 批准；必须给出旧端无对应 DOM/行为的证据。
- `OLD-ONLY`/`REMOVED` 必须有等价替代检查；安全/fail-closed/持久化/权限类检查不得退役。
- 所有差异最迟到 5B 前关闭；不得长期豁免。

### 6.4 已知缺口的 5A 关闭判据

- 三个缺口对应的官方段在新端**自然到达并 pass**，且继续执行到该段末尾；若仍需补证副本，5A 门失败（补证只用于诊断，不作为门证据）。
- 旧端对应值如实记录：旧端 pass 则 MATCH；旧端无对应能力则 `NEW-ONLY` + PM 批准，不得伪造旧端通过。
- 缺口修复后重跑受影响段和热路径门（bench/C1/IME/懒挂载），并重新记录哈希。

## 七、5B 切换与最终回归

### 7.1 入口切换

生产入口切到新端（`app/renderer/index.html` 指向/等价新入口，旧入口进入退役路径）；切换候选冻结并记录 manifest。切换本身不改变套件断言；只允许入口/env 管线差异。

### 7.2 删除前快照完整性核对

1. 对 5A 旧端证据目录生成 `snapshot-manifest.sha256`（报告、stdout、截图、bench JSON、suite-index）。
2. 对旧入口目录（`app/renderer/index.html`、`renderer.js`、`styles.css`、`tool-rows.js`、`role-status.js`、`runtime-ui.js`、`ui-labels.js`、`engine-selector.js`、`vendor/`）生成文件清单+哈希并归档。
3. 复制/归档到 `2026-10-21-phase5-snapshot-archive/`；执行 `shasum -c` 双向核对；缺失/多出/哈希不符 → 停止删除，回 PM。
4. 删除/退役旧入口后再核对归档自身哈希；归档必须可离线读取，不得依赖已删除文件。

### 7.3 旧端不可复跑声明

5B 起旧入口已退役/删除，**旧端结果只引用 5A 冻结快照，不再复跑**；任何 5B 报告不得把新端结果标为旧端。声明写入 5B 报告与证据索引，并由 PM 确认。

### 7.4 5B 必跑

- 新入口全量套件：§三全部 uiux-v2 模式 + main + ime + bench（新端 3 有效轮）+ design audit + Node 单测/旧基线/懒挂载。
- **packaged smoke**：打包产物启动（非 dev），使用临时 userData；检查窗口打开、`#root > .app-shell`、新入口资源加载、无 console error、严格 CSP、运行时选择器/治理状态存在、正常退出。拟命名：`PACKAGED_WINDOW_OPEN`、`PACKAGED_ENTRY_LOADED`、`PACKAGED_SHELL_READY`、`PACKAGED_RUNTIME_OPTIONS`、`PACKAGED_GOVERNANCE_STATUS`、`PACKAGED_NO_CONSOLE_ERROR`、`PACKAGED_CSP_STRICT`、`PACKAGED_QUIT`。由桌面UI提供/测试独立复跑，报告与截图入证据。
- **打包命令模板**（具体产物路径以 electron-builder 实际输出为准，5B 前冻结）：`npm run package` → 启动 `dist/mac-arm64/ANS Studio.app/Contents/MacOS/ANS Studio`（或 Windows 对应 exe）→ 设置 `ANS_SMOKE_OUT`/临时 userData → 执行 packaged smoke 脚本 → 记录 productName/version/arch/asar 入口哈希/启动耗时/退出码。
- **最终回归**：5B 新端全量结果与 5A 新端逐 check 名一致（除已批准差异）；bench/C1/IME/懒挂载/单测/旧基线全过；C1 Δ≤32（目标≤20，当前 16）。
- **删除后声明**：旧端不可复跑、5A 快照完整性通过、packaged smoke 通过、无未批准差异；否则 5B 门失败。

## 八、证据索引与台账

| 阶段 | 目录 | 内容 |
| --- | --- | --- |
| 5A 旧端 | `角色卡/测试/docs/change/2026-10-21-phase5a-old-baseline-evidence/` | environment、candidate/snapshot manifest、suite-index、raw/uiux/<MODE>、main、ime、bench、design-audit、node |
| 5A 新端 | `.../2026-10-21-phase5a-new-entry-evidence/` | 同上 + name-diff/<suite>/<mode>.md + allowed-diff.md |
| 5B 新端 | `.../2026-10-21-phase5b-new-entry-evidence/` | 全量新端、final-regression、name-diff |
| 5B 打包 | `.../2026-10-21-phase5b-packaged-smoke-evidence/` | package 命令/产物哈希、启动日志、截图、report |
| 快照归档 | `.../2026-10-21-phase5-snapshot-archive/` | 旧入口文件清单/哈希、5A 报告副本、完整性核对输出 |

每个目录必须含 `environment.txt`、`candidate-manifest.sha256`、`suite-index.md`、`raw/`、`reports/`（或报告索引）。原始 stdout/report 不覆盖、不裁剪；截图保留原始尺寸。测试台账 §八追加 5A/5B 结果与差异批准记录。

## 九、计划时已知差异/风险（不是 5A 结果）

4B 200% 重验后新端已知状态（5A 必须重跑，不得直接引用）：

- **已知 Phase 5 缺口三项**：`builtin identity…`（DELIVERY_NOTE）、`P7 choice pending…`（COMPLETE_FLOW）、`full replay preserves content identity`（默认段 raw assert）在新端仍为红；5A-0 关闭后官方段必须自然跑完，否则 5A 门失败。
- **旧端对应值未知**：必须在 5A 旧端快照中如实取得；若旧端 pass 则登记 MATCH，若旧端无对应能力则登记 `NEW-ONLY` 并请 PM 批准，不得把新端通过写成旧端通过。
- **已验证但需重跑的基线**：RUNTIME 17/17、VISUAL 54/54、QUEUE 4/4、MIRROR 8/8、GOV 7/7、JUDGE 33/33、G2 5/5、TOOLFOLD 19/19、bench/C1 等只属于 4B 候选，5A 以新候选重新执行后才有效。
- **套件改动风险**：main.mjs/design audit 当前硬编码旧入口；在 5A-0 前其“新端运行”不可执行，任何声称的新端结果无效。

### 6.5 不弱化断言核验（机械 + PM）

- 对 `uiux-v2.mjs`、`main.mjs`、`ime-enter.mjs`、`bench-storm.mjs`、`uiux-design-audit.mjs` 做 5A 前后 `sha256` 与 `git diff`；只允许入口/env 管线或已批准差异。
- 逐套件比较 check 名集合：任何 `OLD-ONLY`/`REMOVED` 必须有替代名与 PM 批准；`NEW-ONLY` 必须有旧端无能力证据。
- 对每条保留检查核对断言强度：不得减少负向分支（deny/Esc/fail-closed/权限/持久化/迟到回包）、不得提高超时/重试上限、不得删除“不得/绝不/未执行”断言、不得把精确值改为范围或存在性。
- bench 阈值按 §10.3 原始口径，不得因新端较慢而放宽；C1 不得用新基线替换旧基线。
- PM 只批准“允许差异”，不批准“跳过检查”；测试在 5B 报告逐项列出被批准差异及证据。

## 十、5A/5B 门清单

### 5A 门（进入 5B 前）

1. 旧端全量快照完整：§三全部套件/模式有 command、exit_code、report_path、check_names、哈希；快照前后 manifest 一致。
2. 新端同套件全量执行；逐 check 名对照完成；无未批准差异；`MATCH-FAIL=0`。
3. 三个已知 Phase 5 缺口在新端官方段自然 pass 并跑完该段；无补证替代门证据。
4. 断言未弱化：套件 diff 仅入口/env 管线或 PM 批准差异；负向/fail-closed/阈值未放宽。
5. 新端质量门：单测 96/96、旧基线 679/679、IME 24/24、懒挂载 10/10、bench §10.3 3 有效轮、C1 Δ≤32（目标≤20）、VISUAL/design audit 全过。
6. 证据索引/哈希齐全，PM 批准允许差异清单。

### 5B 门（Phase 5 完成）

1. 入口切换候选冻结；旧入口归档哈希与 5A manifest 双向一致；删除前完整性核对通过。
2. 旧端不可复跑声明写入并获 PM 确认；5B 不出现旧端复跑结果。
3. 新端全量套件（所有模式 + main + ime + bench + design audit + 单测/基线/懒挂载）全过；与 5A 新端逐名一致（除已批准差异）。
4. packaged smoke 全过；严格 CSP/零 console error。
5. 最终回归通过；C1、bench、IME、懒挂载无回退；无新增依赖/DOM 例外。
6. 证据索引/哈希完整；PM 最终验收；不得宣称超出证据的全量等价或最终验收。

## 十一、风险与停止条件

- **main/design audit 无目标切换**：5A-0 未完成 → 停止，不开始旧/新快照。
- **旧端快照期间候选变化**：manifest 不一致 → 快照作废重跑。
- **逐名对照出现未批准差异/旧端红**：停止，不进入 5B。
- **三个已知缺口仍失败或官方段需补证才到达**：5A 门失败。
- **旧端删除前哈希/归档不完整**：停止删除，回 PM。
- **packaged smoke 失败或 CSP 违规**：5B 门失败。
- **任何断言弱化**：直接拒绝，不以“新端已通过”替代。

## 十二、交付物与后续

- 本计划：[2026-10-21_design_ui-platform-phase5-test-plan.md](2026-10-21_design_ui-platform-phase5-test-plan.md)
- 套件 check 名清单：[2026-10-21_phase5-suite-inventory.md](2026-10-21_phase5-suite-inventory.md)
- 5A 执行后：旧/新证据目录、`suite-index.md`、`name-diff/`、`allowed-diff.md`、候选哈希；测试台账 §八追加。
- 5B 执行后：新端全量、packaged smoke、快照归档完整性、最终回归与 PM 验收记录。

未执行任何实现/套件；只写 `角色卡/测试/`。本计划不构成 5A/5B 通过或最终验收。
