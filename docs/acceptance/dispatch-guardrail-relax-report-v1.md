# 验收报告：派发护栏只保留「谁能给谁派发」——E2 独立验收报告 v1

- 风险档位：**T3**（治理/权限/派发受理语义变更；方案 §9、闸门 1/2 与团队计划确认；本报告未压档、未降档）。
- 判定依据：客户闸门 0/1/2 与实施授权记录 `docs/communication/2026-11-02_intent_dispatch-guardrail-relax.md`（写报告时 **124 行** / SHA-256 `bbb64072b0d0f071be756158a9f24a4ea944e7c86ae10372e0b5e55407c5b93f`，含闸门 0/1/2 与「实施授权记录」）；客户在闸门 1 确认的方案 **P1.1** `docs/planning/2026-11-02_design_dispatch-guardrail-relax.md`（**877 行** / `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649`）；独立复核 `docs/planning/2026-11-02_review_dispatch-guardrail-relax.md`（**150 行** / `aa702f6bb9ea034c067721462ff07b64f1e34a53c8439b8c28c0dbe8ad0bfdb5`）；闸门 2 确认的团队计划 `docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md`（**482 行** / `4ebd41fa9d68d7aca0e0847479b819965b367a87af58111128c4500f77ed074d`）；实施前冻结的验收标准 V1 `docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`（**814 行** / `63c441aa30bf895be8eadc9b9c4326edd5c202189bce32ee927b20c785a29ca3`）；统筹变更包 E1 `docs/scheduling/dispatch-guardrail-relax-change-v1.md`（**173 行** / `8a1403ead77fed356f1b8812c4d85a46589fba221be27732e5b0b0217d590279`）。
- 候选身份：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；分支 `feat/flow-improvements-wave1`；HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a`；**产品/测试候选树 `79962115b301f9e2b7c6c0d19af8844335b1fef5`**（HEAD + 13 个产品/测试路径；本报告独立复算一致，验收前后未变）。
- 选定检查：**T3 口径**——受影响层测试（编排 **34/34**、桌面 **61/61**，均由本验收独立复跑）+ 跨角色回归（D1）+ **T3 全量适用回归**（3385 tests / 3358 pass / 9 fail / 18 skipped / 0 todo；9 项失败与 B0 既有 Windows symlink EPERM 逐项相同；新增确定性失败 0、新 skip 0）+ `npm run typecheck`（退出码 0，独立复跑）+ 真实 Electron E2E（`E2E_PASS=true`、exit 0、30 张 1360×860 截图）；同候选有效证据复用 + 本验收补充探针（§六）。
- 证据复用：B0/A1/B1/D1/D1-fix/D2/P1 均绑定同一候选或同一 HEAD；A1 五文件与 B1 八文件哈希与冻结记录逐项一致；D1 初次发现的 `i-full-chain` 旧断言失败已由 D1-fix 做测试-only 迁移并在最终候选重跑（旧证据失效、最终证据有效）。管理/治理记录不进入产品候选。
- 消费者重测：任务账本/任务卡、报告路由、run 变更/显式入口、`evidenceScopeRoots`/证据检查、G-1 拒投、人事通道、写守卫/shell 守卫均按既有套件回归；T3 全量无新增确定性失败。
- 总体结论：**通过**（AC-1–AC-8 全部 pass；R1/R2/R3/F4 满足；R4 已由提交前编辑性更正关闭（§三.5/§六.4），不构成产品失败；E2 结论不因该编辑性更正而改变）。
- 报告日期/角色：**2026-11-02**，内置独立验收（验收主上下文）；本报告不授权提交、推送、合并、发布，也不代替客户确认。

---

## 一、范围、基线与候选身份

### 1.1 判定范围

按 V1 §1.3/§3.0：本报告判定方案 §8.2 **AC-1–AC-8**（子项 AC-1.1–AC-8.3 全部保留、未拆分/合并/删除/弱化），并核对 R1/R2/R3/F4/R4（V1 §四）。风险档位按 V1 §5.1 为 T3。判定只覆盖当前候选；候选、输入、依赖、契约、夹具或配置变化时，受影响证据失效。

### 1.2 候选身份与逐文件哈希（独立实测）

| # | 路径 | 节点 | 状态 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/common/编排/workflow-preconditions.ts` | A1 | M | 1337 | `9dfb55638324b6657fd7dc3928e7c7430215848dd9ee6c7d78a21de86ba1249f` |
| 2 | `src/common/编排/dispatch-advisories.ts` | A1 | A | 283 | `0781cd3db1201a724feb9ece4837aef4d23c043fa12e202cd01f0dd8d1e30d6f` |
| 3 | `src/common/编排/mechanical-rejection.ts` | A1 | M | 190 | `1e1e65736d99d371dbf13bbc18d9d88a048d17ac7fd6475ee508cca623750a62` |
| 4 | `test/编排/workflow-preconditions.test.ts` | A1 | M | 972 | `bec8c36109dc4cb1ad823f2dd363ff8aa8aae9e96276287733b5989c8cef066b` |
| 5 | `test/编排/dispatch-advisories.test.ts` | A1 | A | 304 | `72a3ad0cf9ee87d3cd0cecc7c96847463de7c1288103f016e7d433df0620c7e5` |
| 6 | `app/desktop/session.ts` | B1 | M | 7819 | `491bf24f8fa2201454524093e863ae7d01f50c2fde2f0aad612aab288b6b5030` |
| 7 | `test/桌面应用/chain-enforcement.test.ts` | B1 | M | 1036 | `9e20c8b6360180b71fc0b0407f284803b48b4f7c4657d80779fcbebda9eb633b` |
| 8 | `test/桌面应用/star-routing.test.ts` | B1 | M | 391 | `e0bfdfd6634b6ce811a0006eee5bde4ea6e2b78790d2ada2f0b1f849ccb4ba40` |
| 9 | `test/桌面应用/rejection-copy.test.ts` | B1 | M | 268 | `8c7e7dcee84214addd9ff96071b83059470d117209a431a43851ca997686076f` |
| 10 | `test/桌面应用/run-pin.test.ts` | B1 | M | 830 | `dad68b3b71c640341ed15a5e0b75020f3599f4cd75d3089c0346b592807773ed` |
| 11 | `test/桌面应用/run-change-trigger.test.ts` | B1 | M | 479 | `1f9f93406d763e10ba36bd26342fba10f6ccb5981bc7e35b4fc2d1f1aa691976` |
| 12 | `test/桌面应用/run-change-entry.test.ts` | B1 | M | 218 | `fc1a71f172495f198c32f735cdd43043f4818b6e794f318eb2ff6b61cf3ab16e` |
| 13 | `test/测试/governance-e2e-auto/i-full-chain.test.ts` | D1-fix | M | 229 | `b5d5c6c8411d71797479a452d611bb91a3b62146df6e05f54e0929f7e8545e6b` |

- 独立复算候选树：以临时索引从 `HEAD c80f494` 仅加入上述 13 路径后 `git write-tree` → **`79962115b301f9e2b7c6c0d19af8844335b1fef5`**，与 E1 一致。
- `git status --porcelain -- src app test` 恰为 13 路径；写集外产品/测试改动无；`git diff --cached --name-only` 空；`git diff --diff-filter=D --name-only` 空；`package.json`/锁/构建/发布配方未改。
- 验收执行独立复跑与探针后再次复算候选树仍为 `79962115…`；13 路径逐文件哈希未变。
- 管理/治理改动（memo、H1 boundary/changelog、角色 `docs/change/`、E1、V1）不进入产品候选树；H1 为闸门 2 确认的人事治理变更（B-1/B-2），不计产品候选。

### 1.3 证据记录与输入哈希（独立核对）

| 证据 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| B0 基线 | `角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-B0-baseline.md` | 201 | `547aba69c8244db0f29ce272a2969eef85679b6415fc1184aa704c23804901cb` |
| A1 实施记录 | `角色卡/编排/docs/change/2026-11-02_dispatch-guardrail-relax-A1-implementation.md` | 105 | `958f22f4248f63ac4336b542c5ccd0ed8a052df77f4bc6685aa9bd00f6137794` |
| B1 实施记录 | `角色卡/桌面窗口/docs/change/2026-11-02_dispatch-guardrail-relax-B1-implementation.md` | 113 | `048aa4270b3a1fc064b2ea9bc34368b1862960a0a61b40b7c38dcf22bf70b87b` |
| D1 回归（含 D1-fix） | `角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-D1-regression.md` | 287 | `12b581bac3f0627c170fc7c5ea8cbc0938bcb718c4674f1205f3f341ad90316c` |
| D2 E2E 记录 | `角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-D2-e2e.md` | 135 | `64051666014ca126713f45d5ec3e184e2ae46f0f277c558c70b55bbdf2920ec2` |
| P1 审核记录 | `角色卡/项目管理/docs/change/2026-11-02_dispatch-guardrail-relax-P1-review.md` | 375 | `9006e2bdee86e2df5608e8b65d7f4c33a565ce73688877f4a5dd1f1475a10fac`（Revision 2 复审结论 `recommend approval`） |
| A1 单测原始输出 | `角色卡/编排/docs/change/2026-11-02_dispatch-guardrail-relax-A1-evidence/a1-tests.txt` | 43 | `b3114c14a70a9b71eb16a8b7cf5667538f39c5e0461dbecf45b0324a92e14fbd` |
| B1 七文件原始输出 | `角色卡/桌面窗口/docs/change/2026-11-02-dispatch-guardrail-relax-B1-evidence/b1-tests.txt` | 69 | `4d9bf590a16f5778f269db744635789f07b37faa30bde2e3eb92688b23de35b5` |
| D1 最终 T3 | `角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-D1-evidence/17-d1fix-t3-full-suite.txt` | 4487 | `823def59a5d7d42966d01d8634f83798d9861f196baadffd99da1c1637740791` |
| D2 E2E report | `角色卡/测试/docs/change/2026-11-02-dispatch-guardrail-relax-D2-evidence/report.txt` | 512 | `db0c82dc063802abfc286a4cc2579a13a4d9814d0dbde3a34ffe7f3d3a4d8227` |
| D2 stdout/stderr | `角色卡/测试/docs/change/2026-11-02-dispatch-guardrail-relax-D2-evidence/02-e2e-run.txt` | 190 | `99cd43c1a2cbea1187e434a277c8d1221d436ae4da9adb9c80a055012281dd5c` |

以上行数/SHA-256 由本验收独立实测，与 E1 §三一致。环境：Windows 11 Pro 10.0.26300 / MINGW64 Git Bash；Node v24.22.1 / npm 11.19.1；Electron 44.7.0；无 `.ans/project.json`（未启用 task_ops）。

---

## 二、逐项验收（AC-1–AC-8）

### 2.0 总表

| AC | 方案 §8.2 | 主题 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- |
| AC-1 | AC-1 | 硬授权仍拒绝（负例） | 全部硬负例按码拒绝；无任务行、无目标会话、无 draft run；无 run-change 自动卡 | **pass** |
| AC-2 | AC-2 | 任务状态不再阻断（正例） | 各状态缺失受理 + advisory + 任务行/投递；模块/verifier 字段符合 | **pass** |
| AC-3 | AC-3 | run 记账非阻断 | pinned 不覆盖/哈希漂移/roster 失败/pin 失败/账本不可用均受理；锚点符合；幂等不回归 | **pass** |
| AC-4 | AC-4 | 提示与记录 | 回执「已受理」「状态提示（未阻断）」「受理≠已完成」；诊断 reasonCode；洁净派发无噪声；>3 条截断 | **pass** |
| AC-5 | AC-5 | 范围外护栏不变 | 人事/写守卫/shell/版本化只读/验收/G-1/目标会话失败均不回归；verifier 元数据保留；证据范围 fail-closed | **pass** |
| AC-6 | AC-6 | 测试与迁移质量 | 无删测/新 skip/弱化；源码钉更新；typecheck 0；T3 新增确定性失败 0、新 skip 0；E2E 实跑通过 | **pass** |
| AC-7 | AC-7 | run-change 边界 | 派发不再自动弹卡（含硬拒）；显式入口/三模式保留；无自动批准复活 | **pass** |
| AC-8 | AC-8 | 文档与状态如实 | 状态如实；O5 未做、B-1/B-2 除外；旧设计/旧验收不改写并按 §7.4 披露 | **pass** |

### 2.1 AC-1 硬授权仍拒绝（负例）——pass

| 子项 | 观察证据 | 结果 |
| --- | --- | --- |
| AC-1.1 自派 | 纯函数 `workflow-preconditions.test.ts:571/945` 断言 `self-dispatch`；桌面 `star-routing.test.ts:170-172` 拒绝；本验收探针：chief→chief 拒绝且 `tasks.jsonl` 0 行 | pass |
| AC-1.2 非幕僚/运营来源 | 纯函数 `:574/948` `unknown-source`；桌面 `star-routing.test.ts:350-364` wrong-source 无任务行/无目标会话/无 run | pass |
| AC-1.3 幕僚→项目 worker | `workflow-preconditions.test.ts:539` `chief-to-project-forbidden`；`star-routing.test.ts:125-147` 无任务行/无会话/无 draft run | pass |
| AC-1.4 运营→非质检内置 | `:563` `convener-target-forbidden`；`star-routing.test.ts:324-348` convener→chief 归矩阵；`chain-enforcement.test.ts:499-502` convener→product 拒绝；本验收探针 AC-1.7 同时观察 convener→product 硬拒且无任务行/无卡 | pass |
| AC-1.5 运营→不存在项目角色 | `workflow-preconditions.test.ts:550-552` `target-card-missing`；`star-routing.test.ts:334-343` ghost-dev 硬拒、无任务行/会话/run；`rejection-copy.test.ts:42-100` 文案同时覆盖「角色卡/边界」与「拼写/id」，owner=`nominator`；`:203-206` `M5_TARGET_CARD_MISSING` 别名保留 | pass |
| AC-1.6 幕僚→su/未知内置/未知非内置 | `workflow-preconditions.test.ts:575-590` su/合成未知内置→`target-card-missing`、liaison（非内置）→`chief-to-project-forbidden`；本验收探针：桌面 chief→su 与 chief→ghost-dev 均硬拒且 0 任务行 | pass |
| AC-1.7 硬拒绝不触发 run-change 自动卡 | `runChangeRejectionForDispatch`/`dispatchFrozenConflictDetail` 已删除（`session.ts` 无 grep 命中）；`run-change-trigger.test.ts:242-279` 受理路径客户卡 0；本验收探针：pinned+新版本下 convener→product 硬拒，客户卡请求 0、无任务行 | pass |

**附加（R1）**：硬授权在 `session.ts:6050-6067` 调用，早于 `chainDispatchFacts:6068`、`findActiveRun:6082`、`ensureDraftRun:6089`、`pinRun:6121`；`star-routing.test.ts:143/343/364` 与探针均观察硬拒无 draft run。

### 2.2 AC-2 任务状态不再阻断（正例）——pass

| 子项 | 观察证据 | 结果 |
| --- | --- | --- |
| AC-2.1 幕僚→策划缺意图/flow | `chain-enforcement.test.ts:340-379` 缺意图受理、任务行 +1、`intent-missing` 诊断、同文幂等、补齐后受理；`dispatch-advisories.test.ts:69-72` flow-required/intent-missing；本验收探针：rapporteur 受理且实际投递 | pass |
| AC-2.2 幕僚→人事缺方案/名单/模块/env | `dispatch-advisories.test.ts:74-91/160-175` 各 code 正/负例与链顺序；`chain-enforcement.test.ts:381-395` 缺名单受理、任务行 +1、同文幂等；本验收探针：nominator 缺名单受理且实际投递 | pass |
| AC-2.3 幕僚→运营缺 D3/卡/draft | `star-routing.test.ts:150-177` 缺 D3 受理 + advisory + handoff 行；`dispatch-advisories.test.ts:93-103/196-199` d3-missing、d3-selected-cards-incomplete、run-pin-required 与顺序；本验收探针：D3 选中角色卡未齐备 → 受理 + advisory + 任务行 +1 + stepId=project-handoff | pass |
| AC-2.4 运营→worker 缺 handoff/run/module/D3 选中 | `star-routing.test.ts:179-196` 无 handoff 受理 + advisory + 任务行；`chain-enforcement.test.ts:413-512` 模块属主/非属主/越界路径/名单外目标；本验收探针：worker 受理且实际投递 | pass |
| AC-2.5 运营→质检缺 handoff/module | `chain-enforcement.test.ts:483-497` verifier 带非属主模块仍写 `moduleId`/`modulePaths`，文件型不写 `moduleDirectory`；本验收探针：无 handoff 时 convener→verifier 受理 + handoff advisory + 模块元数据 + 投递 | pass |
| AC-2.6 legacy flow | `run-pin.test.ts:770-820` 受理 + `run-legacy-readonly` + draft 锚点 + 旧记录可读 | pass |
| AC-2.7 版本化基线违规 | `chain-enforcement.test.ts:397-403` 受理 + advisory；`run-pin.test.ts:547-571` 文档与 `versions.jsonl` 哈希前后一致、任务行 +1；`versioned-doc-guard` 套件在 T3 全量通过 | pass |
| AC-2.8 pinned 哈希漂移/roster 失败 | `run-pin.test.ts:711-760` 受理 + advisory + manifest 未改写 + 任务无锚点 | pass |
| AC-2.9 无 flowId 无法推断 | `workflow-preconditions.test.ts:600-617` flow-required；本验收探针：convener→worker 无 flowId 受理且 `task.created` 的 `flowId`/`runId`/`runState` 均 undefined | pass |

### 2.3 AC-3 run 记账非阻断——pass

| 子项 | 观察证据 | 结果 |
| --- | --- | --- |
| AC-3.1 pinned run 不含目标 | `run-change-trigger.test.ts:242-279` 受理 + `run-role-missing` + 旧 run 未改写；本验收探针：同一场景任务 `flowId`/`runId`/`runState` 均 undefined | pass |
| AC-3.2 handoff pin 失败 | `run-pin.test.ts:316-344` 缺 D3 pin 失败仍受理、锚定 draft、不伪造 pinned、`run-pin-failed` 在 `run-pin-required` 前 | pass |
| AC-3.3 run 读取/草案失败或 handoff 无 runManifest/flowId | `run-pin.test.ts:664-709` 两类 handoff 均受理、无锚点、有 run 记录 advisory；`stepId=project-handoff` 保留 | pass |
| AC-3.4 前提齐备 | `run-pin.test.ts:184-266` draft→pin 同 runId、任务锚定 pinned；:268 起 D3 卡种收口正例 | pass |
| AC-3.5 幂等 | `star-routing.test.ts:198-235` 已报告/已收口重复派发被抑制、不新建/不重复投递；终态提示新文本/新键 | pass |

### 2.4 AC-4 提示与记录——pass

| 子项 | 观察证据 | 结果 |
| --- | --- | --- |
| AC-4.1 受理回执 | `acceptedTask` i18n 以「已受理」开头并含「受理≠已完成」；`chain-enforcement.test.ts:353-356`/`star-routing.test.ts:161-164` 含「状态提示（未阻断）」；本验收探针：4 个 advisory 时回执显示前 3 条 + 「另有 N 项，见诊断记录」 | pass |
| AC-4.2 诊断记录 | `chain-enforcement.test.ts:364-367` 捕获 `tasks.dispatch.advisory` 与 `reasonCode=intent-missing`；`session.ts:6343-6355` 按 advisory 循环记录 `reasonCode`/`phase`/`mode`，不写任务正文/密钥；`star-routing.test.ts:371-385` 洁净派发零 advisory 诊断 | pass |
| AC-4.3 状态齐备 | `star-routing.test.ts:371-385` 洁净派发无「状态提示」、诊断无 `tasks.dispatch.advisory`；T3 全量通过 | pass |

### 2.5 AC-5 范围外护栏不变——pass

| 子项 | 观察证据 | 结果 |
| --- | --- | --- |
| AC-5.1 人事通道 | `test/编排/appointment-roster.test.ts` 在 T3 全量通过；D1 编排目录补充 660/661（唯一失败为既有 symlink EPERM） | pass |
| AC-5.2 写守卫/shell/版本化只读 | `src/common/编排/task-state.ts`、`run-manifest.ts`、`src/common/门禁引擎/versioned-doc-guard.ts`、`governance-roles.ts`、`src/common/编排/handback.ts`、`src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`app/renderer/**` 均零改动（`git diff --name-only` 空，哈希与 HEAD 一致）；T3 全量无新增确定性失败 | pass |
| AC-5.3 验收语义/verifier 元数据 | `chain-enforcement.test.ts:483-497` verifier 非属主写 `moduleId`/`modulePaths`、文件型不写 `moduleDirectory`；T3 全量含验收/证据相关套件通过；R3 正/负例通过 | pass |
| AC-5.4 `planDispatchDelivery` 拒投 | `src/common/编排/handback.ts` 零改动；G-1 测试（`dispatch-reads.test.ts`、`g1-dispatch-wiring.test.ts`、`g1-extraction-render.test.ts`）零改动且在 T3 全量通过；`chain-enforcement.test.ts`/`star-routing.test.ts` 未改其文案 | pass |
| AC-5.5 目标会话打不开 | `star-routing.test.ts:238-256` 回执失败、不投递、任务 `closed(rejected)`、note=`delivery-target-open-failed` | pass |
| AC-5.6 锚点省略下游 | `chain-enforcement.test.ts:857-1036` 无 flow verifier 以 `modulePaths` 贡献根、creator 不匹配拒绝、roster 漂移不丢根、角色边界兜底记录来源、无根 `evidence-scope-denied`；`acceptance-evidence.test.ts:245-307` 模块外物证拒绝 | pass |

### 2.6 AC-6 测试与迁移质量——pass

| 子项 | 观察证据 | 结果 |
| --- | --- | --- |
| AC-6.1 不弱化测试 | `git diff --diff-filter=D` 无删除；`git diff -U0 -- test` 无新增 `skip(`/`todo(`；测试 diff 删除断言 93 行、新增 256 行（净增）；抽查与 A1/B1/D1 的迁移映射一致（旧负例转为硬负例或受理 + advisory 正例），未发现删测/新增 skip/放宽断言 | pass |
| AC-6.2 run-change-entry 源码钉 | `test/桌面应用/run-change-entry.test.ts:208-215` 保留 `requestRunChangeDecision`、`proposalCardFrozenRejection`、`run-change-required`；`:212` 以精确正则断言源码无 `runChangeRejectionForDispatch` 调用 | pass |
| AC-6.3 typecheck/T3 全量 | 本验收独立 `npm run typecheck` 退出码 0；D1 最终 T3 **3385/3358/9/18/0**，9 项失败与 B0（3358/3331/9/18）逐项相同（全部 Windows symlink EPERM），新增确定性失败 0、新 skip 0；命令显式排除既有挂起 `write-sequencing.test.ts` 并记录依据 | pass |
| AC-6.4 E2E | D2 真实运行 exit 0、79s、`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`；30 张 PNG 全部 1360×860、无 `capture-failed`；未使用/不要求录屏 | pass |

### 2.7 AC-7 run-change 边界——pass

| 子项 | 观察证据 | 结果 |
| --- | --- | --- |
| AC-7.1 不再自动弹卡 | `run-change-trigger.test.ts:242-279` 受理 + advisory + 客户卡请求 0 + 旧 run 未改写；本验收探针：硬拒绝场景客户卡 0 | pass |
| AC-7.2 显式入口/三模式不变 | `run-change-trigger.test.ts:281-386` 三模式落账与 stop-and-restart 用例；`run-change-entry.test.ts` 跨层源码钉保留；两文件在 A1/B1/D1/D2 期间通过 | pass |
| AC-7.3 不新增自动批准 | `git diff` 新增行无 `auto-approve`/`runChangeAuto`；`requestRunChangeDecision`/`proposalCardFrozenRejection` 保留；已取消的 run-change-auto-approve 未复活 | pass |

### 2.8 AC-8 文档与状态如实——pass

| 子项 | 观察证据 | 结果 |
| --- | --- | --- |
| AC-8.1 状态如实 | 方案 P1.1 仍标「草案 P1.1」并写未实施/未测试；A1/B1 记录 `implemented-unverified`；E1 明示「不判通过/返工」；未发现虚假验收/发布/客户确认声明。方案文件头「待闸门 1 客户确认」为历史状态行（V1 §九.2 已约定按沟通记录判定），不据此判 fail；R4 已由提交前编辑性更正关闭（§三.5/§六.4） | pass |
| AC-8.2 角色卡/边界差异 | `角色卡/**` 仅 H1 的 `boundary.md`/`boundary.yaml`/`changelog`（B-1/B-2 补登）与角色 `api-spec.md`/`memo.md` 改动；无 `role-card.md` 文本改动；`src/provider/runtime/schema.ts` 零改动；O5 仍在方案/团队计划列为后续 | pass |
| AC-8.3 旧设计与旧验收记录 | `docs/planning/2026-10-29_design-workflow-maintainers-hiring.md` 及旧验收报告零改动；方案 §7.4 取代关系表在确认版本中；E1 披露旧标准处置 | pass |

---

## 三、R1/R2/R3/F4/R4 核对项

### 3.1 R1 调用协议与「硬拒绝不产生任务/会话/draft run」——满足

- P1 实现提案审核（P1 review 375 行 / `9006e2bd…`）Revision 2 复审结论 **`recommend approval`**，明确批准：硬授权 → chain facts → run 只读/记账 → handoff pin → 版本基线 → collector → `task.created`；单一公开入口 `evaluateDispatchPreflight` + 同模块窄步骤 `evaluateDispatchAuthorization`；无第二份授权谓词。
- 代码实测：`session.ts:6050-6067` 目标事实 + `evaluateDispatchAuthorization`；`chainDispatchFacts:6068`、`findActiveRun:6082`、`ensureDraftRun:6089`、`pinRun:6121` 均在其后。硬拒绝路径 `:6065-6067` 直接 `fail`，不写任务/不开会话/不写 run。
- 测试实测：`star-routing.test.ts:135-143`（幕僚→worker）、`:334-343`（运营→ghost）、`:350-364`（wrong-source）均断言无任务行/无目标会话/无 draft run；`workflow-preconditions.test.ts:904-971` 覆盖 `targetExists` 兼容窗口与硬矩阵；`run-pin.test.ts:184-266` 保留 `run-required` 正例（有 flowId 时 draft/pinned 锚点）。
- 本验收补充探针（§六）：AC-1.1/AC-1.6/AC-1.7 均观察到硬拒 0 任务行；AC-1.7 另观察 0 客户卡。
- 结论：R1 **满足**。

### 3.2 R2 pin/draft 锚定三分口径——满足

- **pin 失败**：`run-pin.test.ts:316-344` 缺 D3 pin 失败 → 受理、任务锚定已有 draft（`runState:"draft"`、`runId`、`flowId`）、不伪造 pinned、`run-pin-failed` 在 `run-pin-required` 前。
- **无 runManifest / 无 flowId**：`run-pin.test.ts:664-709` 两类 handoff 均受理、省略 `flowId`/`runId`/`runState`、保留 `stepId=project-handoff`、advisory `run-ledger-unavailable`/`run-pin-required`。
- **合法 pinned 正例**：`run-pin.test.ts:184-266` 任务锚定 pinned；`run-change-trigger.test.ts` 旧 run 不被改写。
- **advisory 口径**：A1 `dispatch-advisories.test.ts:201-214` 验证 `pinFailed+draft` 同时产出两 code 且顺序固定；legacy 仅产 `run-legacy-readonly`、不产 `run-pin-required`。
- 代码实测：`session.ts:6116-6148` handoff 尽力 pin，失败只记 `runFacts`；`:6193-6209` draft 直接锚定、pinned 仅在 verify+roster+目标/模块覆盖时锚定；`:6158-6169` advisory 的 run 事实按 legacy/draft/pinned 区分。
- 结论：R2 **满足**。

### 3.3 R3 `evidenceScopeRoots` 优先级与 fail-closed——满足

- 代码实测 `session.ts:7038-7119`：tier ① 无 flow 任务按 `created.to` + creator（verifier: chief|convener；其它内置: chief；项目 worker: convener）+ `created.moduleId` 兼容匹配，直接纳入 `created.modulePaths`、不以 roster 为门槛；有 flow 任务按 `flowId`（及锚定 runId）匹配。tier ② 适用 roster（pinned 可读时；否则 latest）。tier ③ 角色边界仅空集兜底、限定在 roster 模块目录内并记录 `evidence.scope.boundary-fallback`；空集 `[]` → 调用方 `evidence-scope-denied` fail-closed。
- 测试实测 `chain-enforcement.test.ts:857-1036`：chief→verifier 无 flow 正例（`src/` 证据接受）；creator 不匹配负例（`outside/r3/` 拒绝）；roster 漂移仍以 `modulePaths` 贡献根；角色边界兜底（`test/`）接受且记录来源；无根 fail-closed（`docs/outside.txt` 拒绝）。
- 既有 `acceptance-evidence.test.ts:245-307` 另验证真实会话对模块外物证返回 `evidence-scope-denied`，`evidence-check.test.ts:276-280` 验证 role scope 外 collection 拒绝。
- 结论：R3 **满足**。

### 3.4 F4 `redispatch_task` 只读核对——满足

- 独立实测：`git diff --name-only -- src/pipeline/orchestration/run-role.ts` 为空；`git hash-object` 与 `git rev-parse HEAD:...` 均为 `8cb9d580c39a1ed38c787e2a8c7b02a30fe77358`。
- `app/desktop/session.ts` 的 `git diff -U0` hunk 头集中在 import、`:2045` 删除 run-change 辅助、`:6086-6403` 派发/锚点/回执、`:7059-7083` 证据范围；**无 hunk 落入 `chooseRedispatchTarget:4246` / `redispatchTask:4398` 及其区域**。D1 `21-d1fix-final-tree-and-f4.txt`（56 行 / `f7a9b86a…`）记录同结果。
- 结论：F4 **满足**（本任务未改重派路径；F4 仍为已披露未关闭项，留 O7）。

### 3.5 R4 方案 §13 引用更正与哈希映射——已由编辑性更正关闭

- **原开放状态（本报告初判时）**：方案 §13 引用 P1.0 复核快照（101 行 / `232c4b1c…`）并写「仍未解决的意见：无」；E1 §6.2 如实披露，按 V1 §4.5 记为开放文档项（不因产品候选未修判 fail）。
- **提交前完成（2026-11-02）**：策划作者已执行 R4 编辑性更正。语义基线为 **877 行 / `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649`**；编辑性更正后为 **884 行 / `fa5902edce310f7960c88ac396f3ae940ca595eba079197ed5179b07410ab446`**。仅 §13 复核记录引用改为 150 行 / `aa702f6b…`，并把未决项改为 F4（部分采纳/O7）、R1、R2/R3、R4 的如实清单；未改 Q1–Q5、AC、写集、范围、风险档位或已确认语义。
- **独立核对**：§1–§12 的章节行位与关键锚点（§1.2 授权矩阵、§1.5 范围、§8.2 AC-1–AC-8、§9 风险/T3、§11 Q1–Q5）与更正前一致；§13 起点仍为第 853 行，文件仅由 877 增至 884 行（+7 行，均在 §13）；Q1–Q5/AC/写集/档位文本未变。两者是**同一方案的编辑性版本，不是两个方案版本**；E2 判定仍以语义基线 `54da5d31…` 为基准，编辑性更正版 `fa5902ed…` 只作引用映射。
- 结论：R4 **已关闭**；E2 结论（通过，候选 `79962115…`）不变。

---

## 四、T3 全量回归、typecheck 与真实 E2E

### 4.1 T3 全量回归

- 命令：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`
- 最终候选结果（D1 `17-d1fix-t3-full-suite.txt`，4487 行 / `823def59…`）：**tests 3385 / pass 3358 / fail 9 / skipped 18 / todo 0，exit 1**。
- 9 项失败与 B0 基线（3358 tests / 3331 pass / 9 fail / 18 skip，`t3-full-suite.txt`）**逐项相同**：全部为既有 Windows symlink EPERM（`errno -4048`、`syscall symlink`），涉及 claude/codex/pi 适配器、runtime-core、g4-skill-verify、shell-authorized-routine；**新增确定性失败 0**。
- skip 18 与 B0 同类（POSIX 权限/umask/chmod/fsync、进程组、不可读/不可写目录），**新增 skip 0**；todo 0。
- 排除项：`test/pi-adapter/write-sequencing.test.ts` 为既有已知挂起，按 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604` 允许排除；命令显式 `! -name 'write-sequencing.test.ts'`，未静默跳过。
- 中间态披露：D1 记录 §11.4 如实列出 `17a`（i-full-chain `fs.rm` ENOTEMPTY 清理竞态，测试体断言全过，随后仅给清理加 `maxRetries`）与 `17b`（无关 background-entry 清理 EPERM，隔离 5/5 pass）；最终干净复跑 `17` 无这两类竞态。未把中间态算作通过。
- 结论：T3 全量 **满足**（9 项既有失败如实列出，不计为通过；新增确定性失败 0）。

### 4.2 typecheck

- D1 `18-d1fix-typecheck.txt`（9 行 / `8ba48a35…`）：`npm run typecheck`（`tsc --noEmit`）退出码 0、无错误。
- 本验收独立复跑 `npm run typecheck`：退出码 **0**。渲染层未改，未要求 `typecheck:renderer`/`build:renderer`。
- 结论：满足。

### 4.3 真实 Electron E2E

- 命令：`ANS_E2E_OUTDIR=<D2 evidence dir> node_modules/.bin/electron test/桌面应用/e2e/main.mjs`；工作目录 worktree 根。
- 结果：exit 0、79s、`E2E_PASS=true`、`E2E_FAILURES=`（空）、`E2E_DONE=1`；Electron 44.7.0 / 内置 Node 24.21.0；窗口 1360×860。
- 截图：30 张 PNG，全部 1360×860，无 `capture-failed`；无 DEBUG 覆盖层；未使用/不要求录屏。`report.txt` 无 `E2E_ERROR`/`WATCHDOG_TIMEOUT`/`IMPORT_ERROR`/`RENDERER_ENTRY_ERROR`。
- 候选一致性：D2 pre/post 候选树均 `79962115…`；13 路径 status 与逐文件哈希一致；E2E 未修改产品/测试/脚本。
- stderr 中 57 条 `background-tasks:list` 无 handler 与 1 条脚本失败注入探针为非致命输出，未进入 `E2E_FAILURES`；D2 记录如实披露，不作为产品通过或失败。
- 限制：该 E2E 是桌面整机自检，不是派发护栏专项场景；其 PASS 不替代 D1/T3 的派发语义证据（D2 记录 §四.4 已披露）。
- 结论：AC-6.4 **满足**。

---

## 五、独立抽验与补充探针

### 5.1 独立复跑（当前候选）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| A1 单测 | `node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/dispatch-advisories.test.ts` | **34/34 pass，exit 0** |
| 桌面 7 文件 | `node --test --test-concurrency=1`（chain-enforcement/star-routing/rejection-copy/run-pin/run-change-trigger/run-change-entry/dispatch-fresh-enum） | **61/61 pass，exit 0** |
| i-full-chain | `node --test --test-concurrency=1 test/测试/governance-e2e-auto/i-full-chain.test.ts` | **2/2 pass，exit 0** |
| typecheck | `npm run typecheck` | **exit 0** |
| 候选树复算 | 临时索引 HEAD + 13 路径 `git write-tree` | **`79962115…`**（与 E1/前后一致） |

### 5.2 补充探针（临时测试副本，不在仓库写入）

为避免仅依赖实现自述/代码阅读，本验收在系统临时目录复制既有测试夹具并追加最小断言，针对 V1 未直接单测覆盖的组合做实际行为观察。探针文件不进入仓库，不改变候选；每次运行后复算候选树仍 `79962115…`。

| 探针 | 针对 | 断言 | 结果 |
| --- | --- | --- | --- |
| AC-1.1 self | 自派无任务行 | chief→chief `ok:false`、`tasks.jsonl` 0 行 | pass（exit 0） |
| AC-1.6 | 幕僚→su / 未知非内置 | su 与 ghost-dev 均 `ok:false`（对应码文案）、0 任务行 | pass（exit 0） |
| AC-1.7 | 硬拒 + pinned + 新版本 | convener→product 硬拒、0 任务行、0 客户卡 | pass（exit 0） |
| AC-2 delivery | 受理后实际投递 | rapporteur/nominator/worker/verifier 均 `ok:true` 且 `sent[role]` 实际收到 | pass（exit 0） |
| AC-2.3 | D3 选中卡未齐备 | 受理 + D3/角色卡 advisory + 任务行 +1 + `stepId=project-handoff` | pass（exit 0） |
| AC-2.5 | 无 handoff 的 verifier | 受理 + handoff advisory + `moduleId`/`modulePaths`/`moduleDirectory`（目录型） | pass（exit 0） |
| AC-2.9 | 无 flowId 的 convener→worker | 受理且 `flowId`/`runId`/`runState` 均 undefined | pass（exit 0） |
| AC-3.1 | pinned 不含目标 | 受理 + `run-role-missing` 且任务无 `flowId`/`runId`/`runState` 锚点 | pass（exit 0） |
| AC-4.1 | >3 条 advisory | 回执含「另有 N 项，见诊断记录」 | pass（exit 0） |

- 说明：一次早期探针因 `star-routing` 夹具未列出 rapporteur 而导致投递失败（属夹具限制，不是产品缺陷），已改用 `chain-enforcement` 完整夹具重跑并通过；该失败不计产品失败，不影响判定。
- 探针结论：V1 中未被现有测试直接覆盖的组合（AC-1.1/1.6/1.7、AC-2 投递、AC-2.3 卡不齐、AC-2.5 无 handoff、AC-2.9 无 flow 锚点、AC-3.1 不锚定、AC-4.1 截断）均按 V1 预期实际运行通过；无与方案/标准冲突的行为。

---

## 六、证据复用、失效与披露

### 6.1 复用与失效

- B0（HEAD `c80f494`、同一 Windows 环境）仅用于基线分类，不作为候选通过证据。
- A1 五文件哈希在 B1/D1/D2 期间未变；B1 八文件哈希与记录一致；A1 34/34、B1 61/61、桌面全量 462/462、A1 冻结回归 34/34 均在同一候选上通过，证据有效。
- D1 初始 T3（12 路径、10 失败）因 `i-full-chain` 迁移失效；D1 最终 T3（13 路径、9 失败）取代；A1/B1 层证据不受测试-only 迁移影响。
- D2 与 D1 使用同一候选树 `79962115…`；E2E 前后候选一致，D2 证据有效。
- 管理记录/角色证据目录不进入候选；H1 边界与 changelog 为治理变更，不纳入产品候选。
- 不得复用其它变更（shell-escalation、i18n、acceptance-evidence-path 等）证据；本报告未使用。

### 6.2 D1-fix 迁移表遗漏（已披露，按非产品缺陷处理）

- 方案/团队计划 §7.3 迁移表未列 `test/测试/governance-e2e-auto/i-full-chain.test.ts`；D1 发现其仍断言旧语义「运营未接交付 ⇒ 派实现被拒」，统筹裁定在测试角色既有写集内做测试-only 迁移（`test/测试/` 目录授权；既有文件），不需改团队计划/边界或重开闸门。
- 独立核对 diff：仅将旧「拒绝」断言迁移为「受理 + handoff-missing advisory + 任务行 +1」，保留其余全部断言；无删除/放宽；`fs.rm` 仅增加 Windows 清理重试，不改断言。
- 结论：该披露项**已按已确认语义正确迁移**，不构成产品缺陷；E1 §6.1 已如实披露。

### 6.3 其它披露/限制（如实记录，不影响通过结论）

1. **R4 已关闭**：提交前编辑性更正已完成（语义基线 877/`54da5d31…`；更正后 884/`fa5902ed…`；映射见 §三.5/§六.4）；原开放状态保留为历史记录。
2. **E1 证据目录路径笔误**：E1 §三「角色证据目录」行对 B1/B0/D1/D2 使用下划线目录名，实际目录为连字符（`2026-11-02-dispatch-guardrail-relax-...`）；§三证据表逐行路径正确，未影响任何证据取用。
3. **P1 review 文件头状态**：frontmatter 仍写 `status: draft` / Revision 1 的 blocked 事件；Revision 2 复审节结论 `recommend approval` 为准（本报告按 R2.4 采信）。属文档状态同步问题，不影响实现审核事实。
4. **E2E 非派发专项**：D2 为桌面整机 E2E，不替代 D1/T3 的派发语义证据；D2 §四.4 已披露。
5. **AC-4.1 文案等价**：方案 AC-4.1 写「受理≠已完成」，现有 `acceptedTask` i18n 写「受理≠已完成」、回执追加「受理 ≠ 完成」；本验收按语义等价核对（V1 §九.5）；`planDispatchDelivery` G-1 文案仍逐字不变。
6. **H1 治理变更**：桌面窗口 boundary.md/yaml/changelog 的 B-1/B-2 补登为闸门 2 确认的人事变更；不纳入产品候选；`governance-roles.ts` 与角色卡文本零改动（O5 未做）。
7. **未实施/范围外**：O1/O5/O7 未实施；O2–O4/O6 未做；`planDispatchDelivery` 拒投保留；F4 未改（留 O7）；未恢复 run-change-auto-approve；未改 `task-state.ts` schema、`run-manifest.ts`、`versioned-doc-guard.ts`、`governance-roles.ts`、`handback.ts`、`src/provider/runtime/schema.ts`、`app/renderer/**`。
8. **无 task_ops**：未伪造任务令牌/锁/审批/机器预检；证据以文件哈希与原始输出为准。
9. **录屏**：未使用、未要求录屏；截图 30 张为辅助证据，不构成录屏要求。
10. **中间态**：D1 的 `17a`/`17b` 清理竞态已如实披露，最终 T3 与 B0 失败集合逐项一致；不计新增确定性失败。
11. **候选隔离**：本验收只写 `docs/acceptance/` 报告、memo 与探针脚本（系统临时目录）；未改代码/测试/角色卡/边界/方案/沟通记录；未 commit/push；候选树未变。

### 6.4 R4 编辑性更正记录（提交前完成，2026-11-02）

| 项 | 值 |
| --- | --- |
| 方案 P1.1 语义基线 | **877 行 / `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649`** |
| R4 编辑性更正后 | **884 行 / `fa5902edce310f7960c88ac396f3ae940ca595eba079197ed5179b07410ab446`** |
| 更正范围 | 仅 §13 复核记录引用（改为 150 行 / `aa702f6b…`）与未解决意见清单（F4 部分采纳/O7、R1、R2/R3、R4）；未改 Q1–Q5、AC、写集、范围、风险档位或已确认语义 |
| 关系 | 两者是**同一方案的编辑性版本，不是两个方案版本**；E2 判定仍以语义基线 `54da5d31…` 为基准，`fa5902ed…` 只作编辑性更正版引用映射 |
| 独立核对 | §1–§12 章节行位与关键锚点（§1.2/§1.5/§8.2/§9/§11）与更正前一致；§13 起点仍第 853 行，文件仅 877→884 行（+7 行均在 §13） |
| 对结论的影响 | R4 开放文档项**已关闭**；E2 结论（通过，候选 `79962115b301f9e2b7c6c0d19af8844335b1fef5`）**不变** |

---

## 七、结论

**总体结论：通过。**

- 当前候选（worktree `flow-improvements-wave1`，HEAD `c80f4944…`，产品/测试候选树 `79962115b301f9e2b7c6c0d19af8844335b1fef5`，13 路径）满足客户闸门 1 确认的 P1.1 方案与实施前冻结的 V1 标准：
  - **AC-1–AC-8 全部 pass**（子项全部核对，无 fail、无 insufficient evidence、无 not applicable）；
  - **R1/R2/R3/F4 满足**；**R4 已由提交前编辑性更正关闭**（映射见 §三.5/§六.4），不构成产品失败；
  - T3 全量 3385/3358/9/18，9 项既有 EPERM、新增确定性失败 0、新 skip 0；`npm run typecheck` 0；Electron E2E `E2E_PASS=true`、30 张 1360×860 截图。
- 本结论只对当前候选有效；候选、输入、依赖、契约、夹具或配置变化时，受影响证据失效，需补证或重新判定。
- 本报告是独立验收结论，不是客户确认、不是实施/提交/推送/合并/发布授权；R4 编辑性更正已由策划作者在提交前完成（映射见 §三.5/§六.4），D1-fix 迁移表遗漏已按披露规则核对，不构成返工。

---

**本报告状态：E2 独立验收完成；结论=通过（当前候选）；未 commit/push；未接触客户。**
