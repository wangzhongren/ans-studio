风险档位：T3｜判定依据：治理/权限/流程设计变更（角色粒度规则、团队计划 v2 schema/校验、flow 并行语义、测试分片与验收证据规则；依据 references/testing.md，治理变更即使只改文档也非 T0）｜选定检查：29 个产品/测试候选逐文件复算 29/29、HEAD/status/diff/cached、T3 全量并行+串行、canonical e2e 99/99、6 个 Map 分片+共享只读夹具 pin+Reduce manifest、typecheck/typecheck:renderer/build:renderer、真实 Electron e2e + v2/legacy 演示、P1–P14/G1–G2 逐行核对｜复用证据：N3 官方基线（3448/3421/9/18、9 项 Windows symlink EPERM、typecheck/build 0）仅用于同候选失败分类与基线对照；Map A/B/C 证据不用于最终通过判定；最终判定使用 Reduce 同候选全量/e2e/真实启动证据；无过期证据被当作通过证据｜全量回归：已执行（并行 3528/3501/9/18 exit 1；串行同计数 300,781ms；9 项为 N3 同清单 Windows symlink EPERM，零新增红；typecheck/typecheck:renderer/build:renderer 均 exit 0）

# 验收报告：角色粒度（bounded context）与 MapReduce 并行测试

- 任务 ID：`2026-10-22-role-granularity-parallel-testing`
- 产品 flowId：`role-granularity-parallel-testing`
- 阶段：**实施后独立验收判定**（N8）
- 报告版本：`role-granularity-parallel-testing-report-v1`
- 判定时间：2026-10-22
- 判定角色：ANS 内置独立验收（`references/acceptance-role.md`）
- 验收基线：客户在**闸门 1** 确认的策划方案 v1（`docs/planning/2026-10-22_design_role-granularity-parallel-testing.md`；blob `a04e9106ef69d6efdfbb92affe91b5bd53c0fcde`；SHA-256 `38376e7cb3bbb5890febef311cfec30547f357361f6c124f49a6a83dd11fee83`；§13 Q1–Q12 推荐 A）
- 验收标准：`docs/acceptance/role-granularity-parallel-testing-criteria-v1.md`（blob `759fcc312059d11d67cce4ec84e98b0409840a7b`；SHA-256 `f5da3c31c5722370c70f33937841b860d5a64af16f8687b857aa5198e7d25751`；T3；16 条；写盘后冻结，未修改）
- 变更包：`docs/scheduling/role-granularity-parallel-testing-change-v1.md`（blob `4191fb440156565194e7b279574b4de2f892988d`；SHA-256 `95a2da33bdeafa5e0216391eecb0787ce3e9e600b6dfd0a9ea34d6f1aaa7dba0`；T3）
- 候选：**29 个产品/测试文件**（工作树候选）；候选清单 `角色卡/测试/docs/change/2026-10-22-role-granularity-parallel-testing-phase-e-evidence/candidate/hashes.tsv`（blob `aacf6fd209f9ed4f7006986e2c591d254e4c02cc`；SHA-256 `3f18309aa89ca1c20c4c8d8bd599df8b7afcfba1ce3cd2e3aae1e2978a664124`）；HEAD `64ed44a0ac6e75d647eadbeb3f35ae9f84625845`（未变）
- 总体结论：**通过（当前候选）**；附 §五 残余观察与 §5.1 方案措辞澄清项。结论只对上述候选有效，不授权提交、推送、合并、发布或任何对外操作。

---

## 一、判定摘要

1. **P1–P14 全部适用行 pass，G1–G2 pass；无 fail，无 insufficient evidence，无整行 not applicable。**
2. 当前候选满足客户闸门 1 确认的方案 v1：角色粒度（bounded context）、团队计划 v2（`teamPlanSchema: 2`/模块清单/14 列角色表/模块覆盖/写集/DAG/并行组/粒度理由）、MapReduce flow 可选字段与 dispatch 前置、测试按模块分片/独立证据/Reduce manifest、legacy v1 兼容、Convener/Crew 卡文本、单一团队计划解析器均已落地，并有同候选原始证据。
3. 非目标未被改动：第 2 项客户入口、第 4 项派发权、角色 id/显示名/路径、`GovernanceFunction`、`ENGINEERING_QUALITY_BASELINE` 与 §二.9 文本、历史文件；未新增 `cardKind`/`FlowStepKind`/`GovernancePower`/`GovernanceDecisionKind`；未引入纳米角色；未扩大治理角色写权。
4. T3 全量回归已对当前候选执行：并行与串行均 3528/3501/9/18，9 项失败与 N3 基线逐条相同（Windows symlink EPERM），**零本次新增确定性失败**；typecheck、typecheck:renderer、exact build:renderer 均 exit 0。
5. 真实启动/演示证据存在：真实 Electron 总自检 `E2E_PASS=true`（17 截图）；v2 治理链 `DEMO_PASS=true`（8 截图）；legacy v1 `DEMO_PASS=true`（7 截图）；模型为离线脚本桩，真实 Electron/preload/renderer/Interface/门禁/账本/客户通道为真实件。
6. 残余观察：桌面并行 E-1 去重一次偶发（隔离/串行通过）；演示输出根中文路径被治理门禁拒绝（既有 legacy demo 同样复现，ASCII 临时根通过）；v2 demo 首次预置账本行缺 `actorRoleId`/`power`（演示夹具修正，未改产品）；Provider 工具未扩参；真实在线模型/凭据、非 Windows、打包未验证。详见 §五。
7. **方案 §5.4.1 V12 行与 §9.1/§5.5/P9 对 existing 角色的措辞不一致**：V12 行写「existing 也必须覆盖，不覆盖退回」，§9.1/§5.5/P9 写「existing 只 warning」。实现按更具体的 §9.1/P9/§5.5（existing warning、new/changed 阻塞）；本报告 P3 按该口径判 pass，并把方案措辞冲突记录为澄清项（§5.1），不据此判返工。
8. 结论为**通过（当前候选）**，不是对后续候选的长期授权；任一产品/测试/角色卡/边界文件变化，受影响证据失效，需按标准 §3.3 重判。

---

## 二、基线与候选核对

### 2.1 基线文档

| 文件 | 角色 | 判定时 blob | 判定时 SHA-256 | 与标准写盘点对照 |
| --- | --- | --- | --- | --- |
| `docs/planning/2026-10-22_design_role-granularity-parallel-testing.md` | 验收基线（方案 v1） | `a04e9106ef69d6efdfbb92affe91b5bd53c0fcde` | `38376e7cb3bbb5890febef311cfec30547f357361f6c124f49a6a83dd11fee83` | **未变**，基线有效 |
| `docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md` | 闸门 0/1/2 与实施授权记录 | `ffaf672ac0fc57b50e1055fd7d38ed82c2bd2dc6` | `e50b6170c1f9e969e51379730abeabc245ca410c3d672a97a5e97faad57560fc` | 标准写盘时为 `b9f77b55…` / `f0a3d0a5…`；差异是追加实施前标准引用与团队计划版本口径（§58–§59），**闸门 0/1/2 确认内容未变**，闸门记录有效 |
| `docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md` | 闸门 2 确认的范围/写集（非标准来源） | `2071dcac48dd9293037add9a7a22279b6165c70d` | `a85f12f33ad1e0581da681651734824f843d162ddc6c33071bbf4359088d116b` | 闸门 2 确认版本 `4fb701fc31d21dcd5f31c48db3d1e499d6c53c9e`；确认后为记录性追加（§11.1.1），无角色/写集/阶段实质变更 |
| `docs/acceptance/role-granularity-parallel-testing-criteria-v1.md` | 验收标准 v1 | `759fcc312059d11d67cce4ec84e98b0409840a7b` | `f5da3c31c5722370c70f33937841b860d5a64af16f8687b857aa5198e7d25751` | **未变**，标准冻结有效 |
| `角色卡/项目管理/docs/project-rules.md` | 工程法案 §二.9 | `fdb738bb01035b9a270aaf5cbbcb89c6d1da2484` | `fdc5055906bcbb0f5d57d68cdaae05c4a27af1f13c7225374fbeda1a06ab3d9f` | **未变**（无 diff） |

**方案文件状态头说明：** 策划方案文件头仍写「草案 v1（待闸门 1 方案确认）」，与沟通闸门 1 确认记录不一致；本标准/报告按团队计划 §2.2 以沟通记录为授权事实，不改方案文件。

### 2.2 候选身份

- HEAD：`64ed44a0ac6e75d647eadbeb3f35ae9f84625845`（`git log` 最新提交仍是该 HEAD；未提交）。
- 候选清单：29 个产品/测试文件，路径见 `.../candidate/candidate-paths.txt`（29 行；SHA-256 `e262e788a84d9f5fad6ff191b910fddb205e3125f2965abd9676455366117611`）。
- 逐文件哈希：`.../candidate/hashes.tsv` 29 行；验收按清单逐行复算 `git hash-object` + `sha256sum`，**mismatches=0**。
- `git diff --cached --name-only`：空（`.../candidate/diff-cached-name-only.txt` 为 0 字节，SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`）。
- `git status --short`：候选改动为 24 个已跟踪产品/测试文件的 `M` + 5 个未跟踪新文件（`team-plan.ts`、`q-role-granularity.test.ts`、`r-mapreduce-parallel.test.ts`、`role-granularity-v2-demo.mjs`、`team-plan.test.ts`）；另有角色自身文档、沟通/策划 memo 与 `docs/` 管理记录，按 §2.3/§5.6 不混入 29 文件产品候选。
- 聚合身份：`tracked_diff_sha256`（`git diff --binary -- src app test`）= `267194bf55246e586cda3f6bfee17a5de3e1e9b4b093321d96dcb54a788f5573`（验收复算一致）；`full.diff` SHA-256 = `6f494efe15cc6ef8a9f6584be7bca47b5f33361c682cbcaab23c08d16a42ff15`（与变更包一致）；`untracked_candidate_sha256` = `621ec300f17dc87656e50bc7198caf369b4aa398fdcf0eb8417934b089c61eef`（变更包/证据提供；未跟踪 5 文件的逐文件哈希已逐项复算一致）。
- HEAD tree：`a736eaac0acdf3f6d979a42ec68071ae1e79ac12`（`.../candidate/tree.txt`）。

### 2.3 角色自身文档记录（不是产品行为候选）

角色自身文档 17 个（10 个 `M` + 7 个 `??`，均在团队计划 §4.3 的「自身文档」写集内；未改 `boundary.md`/`boundary.yaml`/`role-card.md`）。完整 blob/SHA-256 见 §4.4；未混入 29 文件产品候选。测试证据目录（`...-baseline-evidence/`、`...-phase-e-evidence/`）是管理/证据记录，不是产品候选。

### 2.4 变更包与档位

- 变更包 frontmatter：`flowId: role-granularity-parallel-testing`、`version: 1`、`riskTier: T3`、`candidate: aacf6fd209f9ed4f7006986e2c591d254e4c02cc`、`candidateSha256: 3f18309a89ca1c20c4c8d8bd599df8b7afcfba1ce3cd2e3aae1e2978a664124`、`head: 64ed44a0ac6e75d647eadbeb3f35ae9f84625845`。
- 档位核对：本变更改变角色粒度规则、团队计划 schema/校验、flow 并行语义、测试分片与验收证据规则，属治理/流程设计变更；按 `references/testing.md` 为 **T3**，未压档。验收接受 T3，不降档。
- 变更包内容：候选与范围、29 文件哈希、任务节点 N1–N8（N9 为验收后放行，不属于变更包输入）、证据链接、T3 依据、复用/失效说明、已知问题；满足 G1。

### 2.5 团队计划版本追溯（G2）

- 闸门 2 确认版本：`git hash-object` `4fb701fc31d21dcd5f31c48db3d1e499d6c53c9e`（意图记录「闸门 2 确认与实施授权记录」引用；SHA-256 未保存）。
- 当前版本：`git hash-object` `2071dcac48dd9293037add9a7a22279b6165c70d`；SHA-256 `a85f12f33ad1e0581da681651734824f843d162ddc6c33071bbf4359088d116b`。
- 团队计划 §11.1.1 逐版核对：确认后只追加/更新闸门状态、N3 基线、验收标准状态、`build:renderer` 归属等记录性内容；未修改参与角色、逐角色写集、阶段顺序、非目标或证据口径的实质内容。§11.1.1 及后续记录列出的中间版本 hash（`66703f2f…`、`ae9bbd26…`、`22a54a41…`、`272ca4d5…`、`62e4f228…`）均为管理记录追加，不构成角色/写集/阶段变更。闸门 2 继续有效；G2 按 §4.3/§八 写集核对。意图记录 §59 的「当前版本」`a4370085…` 是较早的管理记录快照；判定时实测团队计划为 `2071dcac…`，以判定时实测和 §11.1.1 的追加核对为准。

---

## 三、验收表

> 证据 ID 见 §四「证据索引」；`CAND` = 29 文件候选（HEAD `64ed44a…`；`hashes.tsv` `aacf6fd2…` / `3f18309a…`）。表中「实际证据路径/哈希」给出主证据与关键候选文件 blob；完整路径/哈希见 §四。

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | 团队计划 v2 schema（§11 P1；§5.1–§5.3；Q2/Q6/Q11 A）：frontmatter 含 flowId/version/riskTier/recommended（内联数组）/`teamPlanSchema: 2`/modules（内联数组、非空、无重复、ASCII slug、不含保留值 `reduce`）；正文模块清单表恰好覆盖 modules 集合（职责/公开契约/架构来源非空）；角色表含 roleId/类型/module/职责目标/能力要求/唯一写集/公开契约/测试面/依赖/dependsOn/并行组/组别/apiSpec/粒度理由；公开契约/测试面必填，Map 角色测试面至少一个测试路径，Reduce 角色测试面至少集成/e2e/装配检查之一，`internal`/`not-applicable` 需非空理由；无 `teamPlanSchema: 2` 的旧计划按 v1 校验并记迁移 warning。 | schema/解析器 diff；v2 计划样例；legacy v1 通过测试与迁移 warning；内联数组/别名/重复列负例；候选哈希。 | E15 `team-plan.ts` `328737a3…`；E15 `team-plan.test.ts` `402b909a…`（17 例，含 v2 正向/别名/V1–V3 负例）；E6 `canonical-e2e.log` q1/q6；E11 `demo-v2/report.txt` `DEMO_V2_PLAN=true`；E3 `CAND`。 | CAND | 编排、桌面窗口、门禁引擎、测试 | v2 解析/校验落地；14 列与模块清单/内联数组/别名支持；legacy 只跑旧表格检查并记迁移 warning；演示团队计划为真实 v2。 | pass |
| P2 | 模块覆盖（§11 P2；§5.2；Q8/Q11 A）：每个模块恰好被一个 Map 角色覆盖；无重复/孤儿/未声明模块；Reduce 角色 module=reduce 且不计入覆盖；模块清单集合=modules；多模块仅 `a+b` 过渡例外并写粒度理由；Map 角色 module 恰好一个模块 id（例外见 P5）。 | 模块覆盖正/负例；模块清单样例；Reduce 角色样例；候选哈希。 | E15 `team-plan.ts` V4 实现；E15 `team-plan.test.ts` `402b909a…`（V4 负例：缺模块/孤儿/未声明/重复覆盖/Reduce 不计入）；E6 q2；E11 演示计划 `modules: [storefront, checkout-api]` + executor/reviewer/tester。 | CAND | 编排、测试 | 模块清单与 frontmatter 集合一致；每个模块恰一个 Map 角色；Reduce 不计入覆盖；孤儿/重复/未声明均拒绝；演示通过。 | pass |
| P3 | 写集不相交与边界覆盖（§11 P3；§5.4 V5/V12）：写集语法合法（精确路径/目录、分号分隔、目录以 `/` 结尾、无通配符/省略号/散文/`..`/绝对路径）；跨角色两两不相交；不得写 `.ans/`、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、`docs/flows/`、`docs/nominations/`、`角色卡/`；只读契约不算写集；V12：new/changed 边界覆盖计划写集，existing 既有边界也必须覆盖，不覆盖退回 Crew/Convener。 | 写集解析/重叠/治理路径负例；boundary 覆盖测试；V12 来源分流测试；候选哈希。 | E15 `team-plan.ts` `parseWritesetCell`/`writesetsOverlap`/`isGovernanceWritesetPath`；E15 `team-plan.test.ts` `402b909a…`（V5 负例）；E15 `interface.test.ts` `f3b8cae8…`（V12 new 阻塞 + existing warning 两例）；E6 q3；E3 `CAND`。 | CAND | 编排、桌面窗口、测试 | 写集语法/治理路径/跨角色不相交均拒绝负例；V12 new/changed 未覆盖阻塞并提示 Convener；existing 未覆盖 warning 不阻塞，按方案 §9.1/P9/§5.5 的迁移口径实现；方案 §5.4.1 V12 行措辞冲突见 §5.1。 | pass（§5.1 澄清项） |
| P4 | 依赖/并行组（§11 P4；§5.4 V7/V8）：dependsOn 目标存在；无自依赖/重复/环；`依赖` 非空；并行组只能 `map-<slug>` 或 `reduce`；产品模块角色必须 `map-*`，reduce 模块角色必须 `reduce`；同 Map 组无依赖路径；Map 不依赖 Reduce；每个 Reduce 的 dependsOn 直接/传递覆盖全部 Map；Reduce 之间可顺序依赖但不得被 Map 依赖。 | DAG/环/同组/Map 依赖 Reduce/Reduce 未覆盖 Map 负例；计划样例；复算输出；候选哈希。 | E15 `team-plan.ts` V7/V8；E15 `team-plan.test.ts` `402b909a…`（V7/V8 负例）；E6 q4；E11 演示计划 executor/reviewer 同 map-a、tester reduce 依赖两者。 | CAND | 编排、测试 | 目标存在/自依赖/重复/环、同组依赖、Map→Reduce、Reduce 未覆盖全部 Map 均拒绝；Reduce 顺序依赖允许、Map 依赖 Reduce 拒绝；演示通过。 | pass |
| P5 | 粒度与 readiness（§11 P5；§4.2–§4.5；§5.4 V9/V10；§5.4.2；Q1/Q4/Q7/Q10 A）：默认一个模块一个角色、一个角色一个模块；整层名/多模块无 `粒度理由` 硬拒；有理由 exception-review + readiness 明确批准；架构来源空/不可追溯硬拒；单文件写集 warning；禁止函数级/单文件/按钮/端点级纳米角色；五维协调成本章节存在且非空；Convener readiness 记录含 module/contract/testSurface/parallel/dependsOn/granularity；gap 退回 Crew，计划缺细节退回 Convener；应用不调用 LLM、不宣称语义完成；验收逐新增/变更角色核对，旧计划 legacy 检查。 | 粒度负例矩阵；readiness 记录样例；Convener/Crew 卡文本断言；系统行文案；五维章节测试；候选哈希。 | E15 `team-plan.ts` V9/V10；E15 `team-plan.test.ts` `402b909a…`（V9/V10 负例）；E15 `governance-roles.ts` `f074f0e1…`（Convener/Crew readiness 列）；E11 `demo-v2` 临时 readiness 记录（`status: pass`，逐角色 module/contract/testSurface/parallel/dependsOn/granularity）；E6 q5；E11 `demo-v2/report.txt` `DEMO_READINESS_RECORD=true`。 | CAND | 门禁引擎、编排、桌面窗口、测试、独立验收 | 整层名/多模块无理由硬拒、有理由 exception-review、单文件 warning、架构来源可追溯检查落地；演示 readiness 逐角色记录新列；应用不宣称语义完成；未引入纳米角色。 | pass |
| P6 | Map/Reduce flow 与 dispatch（§11 P6；§6.1/§6.2；Q3/Q12 A）：`FlowStateStep` 可选 `parallelGroup`/`dependsOn`；`STEP_KEYS` 严格；`FLOW_STEP_KINDS` 不变（四值）；旧 flow 不填字段逐字不变；静态校验语法/目标/自依赖/重复/环/同组无依赖/Reduce 覆盖全部 Map/Map 不依赖 Reduce/Map 交付依赖 contract-freeze；`evaluateDispatchGate` 对声明 dependsOn 的步骤要求前置全部 done；不改变派发权；Reduce 前置硬拦。 | flow-state/flow-service/gate 测试；旧 flow 夹具；flow 样例；前置未完成拒绝/完成后允许；候选哈希。 | E15 `flow-state.ts` `ec1ba7c1…`；E15 `flow-service.ts` `cdba5175…`；E15 `governance-gate.ts` `948116e7…`；E15 `r-mapreduce-parallel.test.ts` `11be5800…`（r1 Reduce 前置拒绝、r3 legacy/四值）；E6 q7/q8；E11 演示 flow 含 `parallelGroup: map-a` 与 `dependsOn`。 | CAND | 运行时核心、编排、测试 | 可选字段解析/序列化/静态校验落地；旧 flow 不新增检查；dispatch 前置未 done 拒绝、完成后受理；Reduce 硬拦；`FLOW_STEP_KINDS` 仍四值；未新增 kind。 | pass |
| P7 | 测试分片与 Reduce 合并（§11 P7；§6.3/§6.6；Q5 A）：按模块分片并行；每分片独立临时根/端口/DB 命名空间/输出目录/日志；只读夹具 pin 哈希；不共享可变根/端口/DB/构建输出；不并发 npm install；每分片原始日志含命令/环境/候选哈希/退出码/pass-fail-skip/失败原文；不多进程追加同一文件；失败隔离；Reduce 合并 manifest（候选/分片/命令/日志/结果/环境）后跑契约/集成/e2e/真实启动；verification-evidence 指向 manifest；证据根单一所有者；测试角色不改模块代码。 | 测试任务文案；分片证据样例；隔离/并发测试；manifest；证据根核对；失败隔离记录；候选哈希。 | E7 `manifest.md` `92829edc…`；E7 6 个 `map-*-summary.txt`（orchestration 769/768/1、gate-engine 313/312/0/1、runtime-core 292/285/3/4、desktop-files 518/517/1、desktop-ui 163/163、governance-e2e 99/99）；E7 `fixture-pins-before/after.tsv` 均 `5750e7d8…`（diff 空）；E7 `rerun-desktop-handback-isolated.log` `391a1fe7…`（16/16）、`rerun-desktop-serial.log` `8748269d…`（518/518）；E15 `r-mapreduce-parallel.test.ts` r5；E11 `DEMO_MANIFEST=true`。 | CAND | 门禁引擎、编排、桌面窗口、测试 | 6 分片独立临时根/日志/输出；夹具 pin 前后一致；desktop-files 偶发隔离/串行通过；失败隔离完成；manifest 合并候选/分片/命令/日志/结果/环境；证据根在测试角色写区，模块角色只写自己测试路径。 | pass |
| P8 | 验收复用与档位（§11 P8；§6.4；testing.md）：同候选/同输入/依赖/同命令/同环境可复用；模块代码/测试/契约/夹具/配置变化使受影响分片/Reduce 失效；T0–T3；本任务 T3 默认全量回归；Verifier 核对 manifest + 分片原始日志，不把摘要当原始证据；缺失/失效判 insufficient evidence。 | 验收标准/报告样例；证据失效矩阵；T3 回归日志；manifest 与分片日志对照；候选哈希。 | E2 标准 §3/§6；E1 变更包 §四（复用/失效）；E4 最终全量；E5 N3 基线；E7 manifest/分片日志；本报告 §四/§五。 | CAND | 独立验收、统筹、测试 | 最终判定用 Reduce 同候选全量/e2e/启动证据；N3 仅用于失败分类；manifest 与分片原始日志分开核对；无过期证据当作通过依据；T3 全量已执行。 | pass |
| P9 | 兼容与迁移（§11 P9；§5.1/§5.5；§10.4；Q6/Q7/Q10 A）：旧团队计划按 v1 校验、不强制新字段、桌面记迁移 warning、不阻塞；旧 flow 无并行字段不要求、不改旧解析、dispatch 不新增检查；旧角色卡 existing 最低格式检查 + warning，不一次性重写；旧 nomination/旧提案不删除/重写；迁移不设硬截止；新流程默认 v2；计划实质变更递增 `-team-v2.md`，角色/写集实质变化重开闸门 2。 | legacy 计划/flow/角色卡测试；旧 flow 夹具；文件清单/无删除 diff；迁移说明；候选哈希。 | E15 `team-plan.test.ts` `402b909a…`（v1 legacy/缺职责仍拒绝）；E15 `flow-state.test.ts`/`r-mapreduce-parallel.test.ts` r3；E6 q6/r3；E12 `demo-legacy-v1/report.txt` `3bc18ce9…`（legacy 全链路 pass）；E3 `diff-name-only` 无历史删除。 | CAND | 编排、桌面窗口、测试 | legacy 计划只跑旧四列检查并记 warning；旧 flow 不新增前置检查；旧角色卡 existing warning；历史文件未删除/重写；legacy v1 演示通过。 | pass |
| P10 | 非目标不变（§11 P10；§12；Q8 A）：第 2 项客户入口、第 4 项派发权、角色 id/显示名/路径、`GovernanceFunction`、工程基线 `ENGINEERING_QUALITY_BASELINE` 与 §二.9 文本、历史文件均不变；不新增固定测试角色；不新增 `cardKind`/`FlowStepKind`/`GovernancePower`/`GovernanceDecisionKind`；不引入纳米角色；不扩大 `BUILT_IN_GOVERNANCE_ROLES` entries/forbidden/preauthorized；不提交/推送/合并/发布。 | 代码/测试 diff；id/显示名/路径 grep；能力矩阵/客户入口/派发权回归；e2e；基线文本 diff；候选哈希。 | E15 `governance-trio.test.ts` `356d4433…`（注册表/写权/id/显示名零变化、基线文本逐字不变）；E15 `runtime.ts` `4b96ae9d…`（仅可选字段，无枚举变化）；E15 `governance-gate.ts` `948116e7…`（`ACTION_ROLE.dispatch: "convener"`）；E15 `flow-state.ts` `ec1ba7c1…`（`FLOW_STEP_KINDS` 四值）；E7 `invariants-check.txt` `9dbc2d0e…`；E11 v2 demo/legacy demo。 | CAND | 测试、独立验收、门禁引擎、编排、桌面窗口 | 第 2/4 项未改；角色 id/显示名/路径/`GovernanceFunction` 未改；基线文本未改；无新枚举/固定测试角色/纳米角色；写权未扩张；未提交/推送/发布。 | pass |
| P11 | 测试与证据（§11 P11；§9.2；§11 证据计划）：受影响单测/层测试/集成/e2e 更新并通过；至少一条 v2 完整链路 + 至少一条 legacy v1；负例覆盖模块缺失/重复/孤儿/写集重叠/依赖环/同组依赖/整层名/多模块无理由/纳米 warning/Reduce 未覆盖 Map/flow 前置未完成/分片共享夹具/证据失效；T3 全量回归按 §3.4 执行并与 N3 对照；原始输出可复算；不弱化断言；文档状态 `implemented-unverified`，不写 `verified`。 | 全部测试命令/输出；全量回归与 N3 对照；v2/legacy e2e；负例矩阵；候选哈希；diff/status；文档状态。 | E4 最终全量并行/串行（3528/3501/9/18；失败标题 `cad33790…`/`ada3582d…`）；E5 N3（3448/3421/9/18；`2513a82f…`）；E6 canonical 99/99；E9 real-entry 16/16 `8e900dbc…`；E7 6 分片；E10/E11/E12 真实启动/演示；E15 测试 diff（移除断言行数 0）；E14 角色文档状态。 | CAND | 测试、各实施角色、统筹 | 受影响测试全部更新并通过；v2/legacy 链路与负例覆盖方案清单；T3 全量并行/串行同计数、零新增红；原始输出可复算；无删除/放松断言；文档状态 `implemented-unverified`/`verified-by-tests-only`，未写 `verified`。 | pass |
| P12 | 与 §二.9/工程基线一致（§11 P12；§9.3）：变更包标 T0–T3；定义引用 `references/testing.md`；不压档；报告首行五项；真实启动/演示保留；T0–T3 强度按 testing.md；不扩张写权；`ENGINEERING_QUALITY_BASELINE` 与 `project-rules.md` §二.9 文本不变；T3 全量回归必须执行。 | 规则对照表；基线文本/`project-rules.md` diff（应为空）；报告；相关测试；候选哈希。 | E1 变更包 T3；E2 标准 §1.4/§3.4/§5.3；本报告首行五项；E15 `governance-trio.test.ts` `356d4433…`（基线文本逐字不变）；`project-rules.md` 无 diff；E4/E5 全量回归；E10/E11/E12 真实启动/演示。 | CAND | 独立验收、统筹、门禁引擎 | 变更包 T3；报告首行五项；真实启动/演示保留；§二.9 与工程基线文本未变；T3 全量回归已执行；未扩张写权。 | pass |
| P13 | Convener/Crew 提示词与角色卡同步（§4.4、§5.4.2、§9.1）：Convener 卡要求团队计划 v2 字段/模块清单/MapReduce/并行组/dependsOn/readiness 例外/flow 模板 optional 字段；Crew 卡要求读 module/公开契约/测试面/dependsOn/粒度理由，角色卡写 bounded context/公开契约/测试面/上下游依赖/粒度理由，boundary 按计划写集；不写整层/纳米角色；Verifier 卡可选补充；卡文本断言同步。 | Convener/Crew 卡文本 diff；`governance-trio.test.ts`/`governance-standard-workflow.test.ts`；`test/测试/` 卡文本断言；e2e；候选哈希。 | E15 `governance-roles.ts` `f074f0e1…`（Convener/Crew/Verifier 文本）；E15 `governance-trio.test.ts` `356d4433…`（P1/P4/P5/P13 卡文本断言）；E15 `governance-standard-workflow.test.ts` `32fc34c9…`（团队计划 v2/flow 模板/Crew v2）；E6 q1/q9/q10；E11 `DEMO_CREW_WRITE_CARD_VISIBLE=true`/`DEMO_CREW_TWO_ROLES_WRITTEN=true`。 | CAND | 门禁引擎、编排、测试 | Convener 卡含 v2/模块/MapReduce/flow 字段/readiness 例外；Crew 卡含 bounded context/契约/测试面/依赖/粒度理由与 boundary 按计划写集；Verifier 可选补充已实现且未弱化真实启动基线；卡文本测试通过。 | pass |
| P14 | 单一团队计划解析器（Q9 A；§8.4；§14.3）：解析/校验唯一实现 `src/common/编排/team-plan.ts`（V1–V10）；经 `src/pipeline/orchestration/run-role.ts` 公共出口供桌面消费；桌面不直接 import 私有 common、不保留第二份 v2 解析；卡前守卫与写卡后校验同源；若未抽出需统筹/沟通确认的偏差 + parity 测试。 | 新模块 diff；import 图/grep；单源/parity 测试；`run-role.ts`/`interface.ts` 测试；候选哈希。 | E15 `team-plan.ts` `328737a3…`（V1–V10）；E15 `run-role.ts` `8aa00772…`（再导出公共 API）；E15 `interface.ts` `203e36f4…`（`parseTeamPlanInfo` 调用公共出口，legacy 仅旧表格适配）；E6 q9/q10（卡前守卫真实路径）；import grep 无 `app/` 直接 import `team-plan.ts`。 | CAND | 编排、桌面窗口、测试 | 单一解析/校验实现；桌面经 pipeline 公共出口；未保留第二份 v2 解析；卡前守卫与写卡后校验同源；q9/q10 正/负例通过。 | pass |
| G1 | 变更包完整、候选身份可复算：变更包 `docs/scheduling/role-granularity-parallel-testing-change-v1.md` 含任务 ID、flowId、候选哈希（每产品改动文件 `git hash-object` + `sha256sum`）、HEAD、改动路径、任务节点、证据链接、T3、复用/失效说明；候选可复算；`docs/` 管理记录不混入产品候选。 | 变更包原文；原始 hash/status 输出；验收复算；证据链接；候选哈希。 | E1 变更包 `4191fb44…`/`95a2da33…`；E3 `hashes.tsv` `aacf6fd2…`/`3f18309a…`、`candidate-paths` `e262e788…`、`full.diff` `6f494efe…`、`status-short` `34737b1b…`、`diff-name-only` `627bab88…`、`diff-stat` `511f356f…`、`cached` 空；29/29 复算 mismatches=0；`tracked_diff_sha256` 复算 `267194bf…`。 | CAND | 统筹、独立验收 | 变更包字段齐全；29 文件逐行哈希一致；tracked diff/full.diff 一致；暂存空；管理记录未混入产品候选；任务节点 N1–N8（N9 验收后放行，不属于变更包输入）覆盖到 N8。 | pass |
| G2 | 写集与授权：所有改动路径在闸门 2 确认的逐角色写集内；无越界、无保护文件/角色卡边界改动、无未授权用户改动；不提交/推送/合并/发布；worker 不写 `docs/scheduling/`、`docs/acceptance/`、`docs/verification/`；`test/桌面应用/` 不新建文件；角色自身文档按写集允许；默认无边界/角色卡改动。 | `git diff --name-only`/`--stat`/`status`/`--cached`；与团队计划 §4.3/§八 对照；无提交；boundary/role-card 未变；候选哈希。 | E3 `status-short`/`diff-name-only`/`diff-stat`/`cached`；E13 团队计划 §4.3/§八 + §11.1.1 版本追溯（闸门 2 `4fb701fc…`，当前 `2071dcac…`，记录性追加）；`git status --porcelain -- test/桌面应用` 仅两个既有文件 `M`，无 `??`；顶层 `boundary.md`/`boundary.yaml`/`role-card.md` 无 diff；HEAD 未变、无提交。 | CAND | 统筹、独立验收 | 29 文件均在对应角色写集；角色自身文档在自身写集；无 `test/桌面应用/` 新建；无 boundary/role-card 改动；worker 未写顶层 `docs/scheduling/`/`docs/acceptance/`/`docs/verification/`；未暂存/提交/推送/发布；团队计划版本追溯满足。 | pass |

---

## 四、证据索引

> 以下为判定时实际读取/复算的原始证据；SHA-256 为文件内容哈希。验收未修改任何候选、标准、变更包或团队计划。角色文档与证据目录是管理/角色记录，不是产品行为候选。

### 4.1 候选与变更包

| ID | 路径 | 哈希 |
| --- | --- | --- |
| E1 | `docs/scheduling/role-granularity-parallel-testing-change-v1.md` | blob `4191fb44…`；SHA-256 `95a2da33bdeafa5e0216391eecb0787ce3e9e600b6dfd0a9ea34d6f1aaa7dba0` |
| E2 | `docs/acceptance/role-granularity-parallel-testing-criteria-v1.md` | blob `759fcc31…`；SHA-256 `f5da3c31c5722370c70f33937841b860d5a64af16f8687b857aa5198e7d25751` |
| E3 | `.../phase-e-evidence/candidate/hashes.tsv`（29 行） | blob `aacf6fd2…`；SHA-256 `3f18309aa89ca1c20c4c8d8bd599df8b7afcfba1ce3cd2e3aae1e2978a664124` |
| E3 | `.../candidate/candidate-paths.txt` | SHA-256 `e262e788a84d9f5fad6ff191b910fddb205e3125f2965abd9676455366117611` |
| E3 | `.../candidate/full.diff` | SHA-256 `6f494efe15cc6ef8a9f6584be7bca47b5f33361c682cbcaab23c08d16a42ff15` |
| E3 | `.../candidate/status-short.txt` | SHA-256 `34737b1ba511e81f352ac184980cf083045964a3eec62762719459f807530650` |
| E3 | `.../candidate/diff-name-only.txt` | SHA-256 `627bab88724bda9675f9cf760cea41a35841c0e9058d3f6d8429f6bc0a4c441e` |
| E3 | `.../candidate/diff-stat.txt` | SHA-256 `511f356f6d0c58a3d0514eac227746b5bd988c8a242a703d5005d36f01906007` |
| E3 | `.../candidate/diff-cached-name-only.txt`（空） | SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| E3 | `.../candidate/head.txt` / `tree.txt` | HEAD `64ed44a…`；tree `a736eaac…` |
| E3 | `tracked_diff_sha256`（`git diff --binary -- src app test`） | `267194bf55246e586cda3f6bfee17a5de3e1e9b4b093321d96dcb54a788f5573`（验收复算一致） |

### 4.2 测试与全量回归

| ID | 路径 | 哈希/计数 |
| --- | --- | --- |
| E4 | `.../phase-e-evidence/final-full-parallel.log` | SHA-256 `cac9013de965bc98ca6274ec458df4b2d0a493d0a1e36261df070c40dc7df3d5`；3528/3501/9/18/0；exit 1；22,620.8ms |
| E4 | `.../final-full-serial.log` | SHA-256 `b9ba28798b12af4baa50b488f6f0ea9d954959aafc19803d67ae964d945e22b9`；3528/3501/9/18/0；exit 1；300,781.2ms |
| E4 | `.../final-full-parallel-failure-titles.txt` / `...-serial-failure-titles.txt` | `cad33790…` / `ada3582d…`；9 项标题集合一致 |
| E5 | `.../baseline-evidence/post-standard/full-run1-rerun.log` | SHA-256 `2357154c…`；3448/3421/9/18；exit 1；22,313.9ms |
| E5 | `.../post-standard/full-run2.log` | SHA-256 `ea2be24e…`；3448/3421/9/18；exit 1；22,248.3ms |
| E5 | `.../baseline-evidence/failure-titles-run1.txt` / `run2.txt` | 均 `2513a82f…`；与 E4 失败标题逐条相同 |
| E6 | `.../canonical-e2e.log` | SHA-256 `c7f3b9ed…`；99/99；exit 0；11,367ms |
| E8 | `.../typecheck.log` / `typecheck-renderer.log` / `build-renderer-exact.log` | `e938f6ed…` / `37a4d2a7…` / `aa37953a…`；exit 0；build 2,654 modules，298ms |
| E8 | `.../typecheck-build-summary.txt` | `6650cc32…`；三个 exit=0 |
| E9 | `.../real-entry.log` | `8e900dbc…`；16/16；exit 0 |

### 4.3 Map 分片、Reduce manifest 与真实启动/演示

| ID | 路径 | 哈希/计数 |
| --- | --- | --- |
| E7 | `.../phase-e-evidence/manifest.md` | SHA-256 `92829edc46d33c6ac48b01bfd448778e5f5001f9fb7ddd0ff031329cba349be3` |
| E7 | `.../map/map-orchestration-summary.txt` | 769/768/1/0；唯一红 N3 EPERM |
| E7 | `.../map/map-gate-engine-summary.txt` | 313/312/0/1；全绿 |
| E7 | `.../map/map-runtime-core-summary.txt` | 292/285/3/4；3 红 N3 EPERM |
| E7 | `.../map/map-desktop-files-summary.txt` | 518/517/1；并行偶发；隔离/串行通过 |
| E7 | `.../map/map-desktop-ui-summary.txt` | 163/163 |
| E7 | `.../map/map-governance-e2e-summary.txt` | 99/99 |
| E7 | `.../map/fixture-pins-before.tsv` / `...-after.tsv` | 均 `5750e7d8be6b914380b32552e3a81e7116bd94c5f4afe1c0c46aeed8aa584c4a`；diff 空 |
| E7 | `.../map/rerun-desktop-handback-isolated.log` | `391a1fe7…`；16/16 |
| E7 | `.../map/rerun-desktop-serial.log` | `8748269d…`；518/518 |
| E10 | `.../e2e-main/report.txt` | `cf823c9c…`；`E2E_PASS=true`、`E2E_DONE=1`；17 PNG |
| E11 | `.../demo-v2/report.txt` | `3839c19b…`；`DEMO_PASS=true`、`DEMO_DONE=1`；`DEMO_DISPATCHES=role-cards,delivery-storefront,delivery-checkout-api,role-readiness,test-map-shards,integration-e2e`；8 PNG |
| E12 | `.../demo-legacy-v1/report.txt` | `3bc18ce9…`；`DEMO_PASS=true`、`DEMO_DONE=1`、`DEMO_IMPL_DISPATCH=true`；7 PNG |
| E7 | `.../invariants-check.txt` | `9dbc2d0e…`；基线文本/注册表/枚举抽检 |
| E11 | v2 demo 临时项目根 `%TEMP%/ans-v2-demo-BC9xQX/project/`（判定时实读；非仓库候选，临时根清理后以 E11 report+截图为准） | `docs/scheduling/flow-demo-team-v1.md` `34352ff8…`；`docs/scheduling/flow-demo-readiness-v1.md` `20111dd4…`；`docs/flows/flow-demo.yaml` `f8858606…`；`docs/verification/flow-demo/manifest.md` `7790b92e…` |

### 4.4 角色自身文档（管理/角色记录，不是产品行为候选）

| 文件 | blob | SHA-256 |
| --- | --- | --- |
| `角色卡/桌面UI/memo.md` | `a739d9d0…` | `509db7313b64bdc64d5d9f8d526938eba02e39fd339cb1f0ce2a1da0c3affeef` |
| `角色卡/桌面窗口/api-spec.md` | `09b76fb8…` | `b48b1483c0702ebf30436d1c2e01f2abfe35b5b31ccba23c69df44f4eea49bc2` |
| `角色卡/桌面窗口/memo.md` | `4c1e23c1…` | `3c503fe300f3239f0ced81c35bd76b5409965e85dc1be549599c11e486b99c74` |
| `角色卡/测试/memo.md` | `a5872efe…` | `9d8eb9694e8a9d4585db75f6c5643222fa089477ae09e4b5cc0b10da1e882bf0` |
| `角色卡/编排/api-spec.md` | `f0e2fb75…` | `74b162ea2554ade74024576e42e2c994020fe2d89eddbd31d4f658d69bbffbae` |
| `角色卡/编排/memo.md` | `23562ef9…` | `128d6e629a2d566a1ebf340615944d20340c94d28a81c0d0f9d466c9f77aaadc` |
| `角色卡/运行时核心/api-spec.md` | `a331b868…` | `85b689d2a7c85f2f27100f54beaee5de22450553d635354bf0159db4f205820f` |
| `角色卡/运行时核心/memo.md` | `5c45ee94…` | `b248df9c76dc069f679ddc0860d62297996b842796dddd48233ca02b83a4ace7` |
| `角色卡/门禁引擎/api-spec.md` | `ccb1fd5f…` | `899a2f7f23952992a9e8b813ef0fa7a207d9e29c3f92018c492176b85d5db8bc` |
| `角色卡/门禁引擎/memo.md` | `fd97d4e4…` | `3bfd9ee429609216f52163b2c12b1dfa0e1fe6238dc82d8b94d0948c984f16fb` |
| `角色卡/桌面UI/docs/change/2026-10-22_change_role-granularity-parallel-testing.md` | `16558121…` | `30d60ffd686469ac6229955f0d31665ae9f1dfabb12b0949bf34565d433195bd` |
| `角色卡/桌面窗口/docs/change/2026-10-22_change_role-granularity-parallel-testing.md` | `0c388cb8…` | `8cbab1355b8f9c94590d48151a7e3b15968bd810b0ec22fa0db8c75d36e43e87` |
| `角色卡/测试/docs/change/2026-10-22_change_role-granularity-parallel-testing-baseline.md` | `b49f354f…` | `a44a62c6577b5381e4cf7c81b0b956f0a007e4334fbed62d1bd6f3e05536d3da` |
| `角色卡/测试/docs/change/2026-10-22_change_role-granularity-parallel-testing-phase-e.md` | `b8eb2212…` | `940268675c7d2011c234f5e242c1bf66e0e87eab35116f6bf93943d9bbc2d7e5` |
| `角色卡/编排/docs/change/2026-10-22_change_role-granularity-parallel-testing.md` | `820ab7e8…` | `89ece7576e8bfdc5ddbb7a8adb43e10c50e81d85b0f259e915de6e3c2c74c7dd` |
| `角色卡/运行时核心/docs/change/2026-10-22_change_role-granularity-parallel-testing.md` | `6f1de65e…` | `d611fe056b924375ba50e1dad130861d2134c1f9a123ed697f6b04096f56b376` |
| `角色卡/门禁引擎/docs/change/2026-10-22_change_role-granularity-parallel-testing.md` | `4249788c…` | `eac453d96f943e78b9176027dac71565342fbf3badb5471741549d1ecffc01c2` |

### 4.5 关键候选文件 blob（完整 29 行见 E3）

| 文件 | blob |
| --- | --- |
| `src/common/编排/team-plan.ts`（新） | `328737a3735f69209fd4ac8e32c26d789df16d44` |
| `src/common/编排/flow-state.ts` | `ec1ba7c1706cc5b07ef17f01ef935bf529a8ea9a` |
| `src/common/编排/flow-service.ts` | `cdba51754e73e4d39bfbdedea7ecc788a05e76e8` |
| `src/common/编排/governance-gate.ts` | `948116e73141830342a1e8721b56163dfda53ffa` |
| `src/common/门禁引擎/governance-roles.ts` | `f074f0e15598b85cd47048652adca9bde07a5259` |
| `src/model/runtime.ts` | `4b96ae9db3f8f962913e2d010d5ab47bba110389` |
| `src/pipeline/orchestration/run-role.ts` | `8aa00772c5228037fcd080bcdd520a616b4ea794` |
| `src/pipeline/orchestration/govern-session.ts` | `988934b43c7b2fb16c6638f79128674bc77eddef` |
| `app/desktop/interface.ts` | `203e36f492f4bcc07689810bdd6c861a75e5cba9` |
| `app/desktop/governance-advance.ts` | `965e46568a49c4e445ae947de3addd21a51a1d5f` |
| `test/编排/team-plan.test.ts`（新） | `402b909ade71a79efb30f68252b4e413b5701426` |
| `test/测试/governance-e2e-auto/q-role-granularity.test.ts`（新） | `7c306b35ad4e830f8cc7c91cc47455b7dee74a97` |
| `test/测试/governance-e2e-auto/r-mapreduce-parallel.test.ts`（新） | `11be5800939647bb439d274b96fe3174e904efe4` |
| `test/桌面应用/interface.test.ts` | `f3b8cae8c2bf637020c469e1874f675f6a2aef9f` |
| `test/门禁引擎/governance-trio.test.ts` | `356d4433f58a6b0172afb5be11ae263c0a261e77` |
| `test/门禁引擎/governance-standard-workflow.test.ts` | `32fc34c914ca87852fc7e779921cc57f0d37243e` |

---

## 五、残余观察与未解决问题

### 5.1 方案 §5.4.1 V12 与 §9.1/§5.5/P9 的 existing 措辞冲突（澄清项，不判返工）

- **事实**：方案 §5.4.1 V12 行写「existing 角色的既有边界也必须覆盖计划写集；不覆盖 → 退回 Crew/Convener」；同一方案 §9.1 的 `validateAppointmentArtifacts` 行写「existing 只 warning」，§5.5 与 §11 P9 也写「existing 只 warning/仅提醒」。
- **实现**：`new`/`changed` 未覆盖 ⇒ Crew 阻塞、提示 Convener 修正计划；`existing` 未覆盖 ⇒ warning 不阻塞（`test/桌面应用/interface.test.ts` 两例分别断言）。
- **判定**：按更具体的 §9.1/§5.5/P9 迁移条款，P3 判 pass；这不是候选产品缺陷，而是方案内部措辞不一致。建议策划在下一版本统一 V12 行与 §9.1/P9 的表述；本标准 v1 不改，受影响证据无需重跑。若沟通/统筹认为必须按 V12 行严格执行 existing 阻塞，则应按 §3.5 走标准/方案澄清与新版本判定，而不是追溯改变本报告结论。
- **证据**：E15 `interface.test.ts` `f3b8cae8…`（V12 new/existing 两例）；E13 团队计划 §11.9；方案 §5.4.1/§9.1/§5.5。

### 5.2 桌面并行 E-1 去重一次偶发（不判返工）

- **现象**：6 分片并行时 `test/桌面应用/handback-delivery.test.ts` 的 E-1 去重断言一次 `0 !== 1`；其余 517 项通过。
- **分类**：隔离复跑 16/16（`391a1fe7…`）、整目录串行 518/518（`8748269d…`）；最终全量并行/串行均未把该用例列为失败（失败标题集合只有 9 项 EPERM）。属并行负载下桌面时序偶发，不是当前候选的确定性新增红。
- **处理**：记录为残余观察；不修改测试/产品代码，未放宽断言。若组织要求零 flaky，应另开稳定性任务，不作为本候选通过的前置条件。

### 5.3 演示输出根中文路径与 v2 账本夹具（环境/夹具观察）

- 首次把 `ANS_DEMO_OUTDIR` 放在仓库内中文证据路径时，demo 的 Crew `write_file` 被治理门禁拒绝（`目标绝对路径不在任何受治理根`）；既有 legacy `phase-e-governance-demo.mjs` 同样复现。改用 ASCII 临时根后通过；不影响产品代码/测试。
- 首次 v2 demo 预置 `artifact.observed` 账本行缺 `actorRoleId`/`power`，账本读取 fail-closed；补齐字段后通过。属演示夹具修正，未改产品。
- **证据**：E11 `demo-v2/report.txt`/`demo-evidence.md`；E12 legacy report。

### 5.4 Provider 工具限制（已接受口径）

- `flow_step_supersede` 未转发、`flow_get` 文本投影未渲染 `parallelGroup`/`dependsOn`；初始 flow YAML 可携带两字段并通过解析/V11；本轮未证明必须扩 Provider 参数，`src/provider/runtime/**` 未改。按团队计划 §11.6 的口径接受，不构成 P6/P14 fail。
- **证据**：E15 `flow-state.ts`/`flow-service.ts`；E6 r4；E13 团队计划 §11.6/§11.9。

### 5.5 未验证范围

- 真实在线模型/凭据、非 Windows 平台、打包产物未验证；`app/renderer/dist` 为忽略的构建产物，非候选。演示模型为离线脚本桩，真实 Electron/preload/renderer/Interface/门禁/账本/客户通道为真实件。E10 report 的 `NODE=24.21.0` 是 Electron 内嵌 Node；shell/测试证据环境为 Node v24.22.1、Electron 44.7.0，两者不矛盾。该边界不改变 P11/P12 的 pass，但后续若要求在线模型链路或跨平台/打包验证，应另开任务。

### 5.6 候选口径与记录

- 29 文件产品/测试候选为行为候选；角色自身文档与测试证据目录是管理/角色记录，按 §4.4 单列，不混入 29 文件候选；`docs/` 管理记录（方案/意图/团队计划/标准/变更包/本报告）不是产品候选。
- 变更包节点到 N8（独立验收输入）；N9（放行）在验收通过后由统筹执行，不属于变更包内容。角色自身文档 17 个（10 M + 7 ??）均在团队计划 §4.3 自身文档写集内，未改 boundary/role-card。
- 方案文件头仍写「草案 v1（待闸门 1 确认）」；按团队计划 §2.2 以沟通记录为授权事实，不改方案文件。团队计划版本追溯见 §2.5。

---

## 六、结论与效力

### 6.1 总体结论

**通过（当前候选）。**

- P1–P14、G1–G2 全部适用行 pass；无 fail、无 insufficient evidence、无整行 N/A。
- 29 文件候选逐行哈希复算 29/29；HEAD `64ed44a…` 未变；暂存为空；无提交/推送/合并/发布。
- T3 全量回归对当前候选执行：并行/串行均 3528/3501/9/18；9 项为 N3 同清单 Windows symlink EPERM；零本次新增确定性失败；typecheck/typecheck:renderer/exact build:renderer 均 0。
- canonical e2e 99/99；6 个 Map 分片独立证据 + fixture pins 一致 + Reduce manifest；真实 Electron 总自检、v2 治理链、legacy v1 演示均 pass。
- 残余观察见 §五；§5.1 方案 V12/existing 措辞冲突是澄清项，不改变当前候选通过结论。

### 6.2 效力与限制

- 本结论只对 **29 文件候选、HEAD `64ed44a…`、T3** 有效。任一产品/测试/角色卡/边界文件再变化，受影响证据失效，按标准 §3.3 重判；全量回归只在当前候选有效。
- 本结论**不授权提交、推送、合并、发布、部署或任何对外操作**；验收通过不等于客户批准后续动作。
- 本结论不替代客户确认、方案审核、团队计划/闸门 2 记录或调度记录；统筹只能按匹配当前候选的通过结论放行。
- 本报告只写 `docs/acceptance/`；未修改标准、代码、测试、角色卡、边界、方案、团队计划、沟通或调度记录。

---

## 七、判定时的只读检查记录

1. **核对基线：** 读取沟通闸门 0/1/2 记录；方案 v1 blob/SHA-256 与标准 §2 一致（未变）；标准 v1 未变；团队计划闸门 2 版本 `4fb701fc…` 与当前 `2071dcac…` 的差异按 §11.1.1 为记录性追加，无实质变更。
2. **核对候选：** 29 文件 `git hash-object` + `sha256sum` 逐行复算，mismatches=0；HEAD 未变；`git diff --cached` 空；`tracked_diff_sha256` 复算一致；`full.diff` 与变更包一致。
3. **核对档位：** 变更包 `riskTier: T3`，与治理/流程设计变更相符；未降档。
4. **核对写集（G2）：** 29 路径与团队计划 §4.3/§八 对照；无越界；无 `test/桌面应用/` 新建；无 boundary/role-card 改动；worker 未写顶层 `docs/scheduling/`、`docs/acceptance/`、`docs/verification/`；未暂存/提交/发布。
5. **核对 P1–P5：** 读 `team-plan.ts`/`team-plan.test.ts`/卡文本/demo 团队计划与 readiness；核对 schema、模块覆盖、写集、DAG、并行组、粒度例外、V12、legacy。
6. **核对 P6：** 读 `flow-state.ts`/`flow-service.ts`/`governance-gate.ts`/`r-mapreduce-parallel.test.ts`；核对可选字段、旧 flow 不变、静态校验、dispatch 前置 done、Reduce 硬拦、四值 kind。
7. **核对 P7–P8：** 读 manifest、6 分片摘要/日志、fixture pins、隔离/串行复跑、runtime/demo 证据；核对证据根、T3、证据复用/失效。
8. **核对 P9–P10：** 读 legacy 测试/q6/r3/legacy demo、invariants-check、注册表/枚举/派发权断言；核对历史文件未删除/重写。
9. **核对 P11–P12：** 对照 N3 与最终全量原始输出、失败标题集合；确认零新增红；核对 e2e/真实启动/演示、断言未删除、文档状态、§二.9/报告首行五项。
10. **核对 P13–P14：** 读 Convener/Crew/Verifier 卡文本 diff 与卡文本断言；核对单一解析器、公共出口、桌面 import、q9/q10。
11. **填写验收表并给结论：** 按标准 §5 逐行判 pass/fail/insufficient evidence/not applicable；写本报告，首行五项，链接证据与未解决问题；报告只对当前候选有效。

---

## 八、边界声明

- 本报告不扩张任何角色的文件写权；独立验收只写 `docs/acceptance/`。
- 本报告不授权修改产品代码、测试、角色卡、边界、工程法案、方案、团队计划、沟通记录或调度记录。
- 本报告不授权提交、推送、合并、发布或任何对外操作。
- 本报告不是客户确认记录，也不是验收结论之外的客户决定；客户确认仍以 `docs/communication/` 的记录为准。
- 本报告未把开发自述、测试转述或工具成功当作原始证据；引用的是原始日志、diff/status、哈希、manifest/分片日志、e2e/启动演示报告与账本/测试合同。
