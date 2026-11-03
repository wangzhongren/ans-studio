# 变更包 E1：给内置策划一个可查询的文档 schema（`contract_check` topic，contract-schema-query）

- **任务 ID / flowId**：`2026-11-03-contract-schema-query` / `contract-schema-query`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立上下文）
- **日期**：2026-11-03
- **风险档位**：**T3**（团队计划 §1.2 与 V1 已定档，不压档）。依据：触及 `src/model/runtime.ts` 共享 Model、`contract_check` 公共工具契约，并修改内置策划卡文本（治理材料）；客户闸门 1 已确认「若统筹/验收按凡触 Model/公共工具契约即 T3 管理，则按 T3 全量回归并重评」，闸门 2 确认 T3。
- **候选身份（摘要）**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；分支 `release/v1.8.4-assets`；HEAD `243d8f6a6db663a383b516aad6320c5110c7f583`；**产品/测试候选 10 文件**（A0a/A0b/A1/A2/A3），逐文件哈希见 §1.1；**候选树 `57fdf6b369aece73ba3f3d4685f9ba3f9c91b95f`**；`git diff --stat -- src app test` = **10 files changed, 780 insertions(+), 13 deletions(-)**；无写集外产品/测试改动、无新增/删除文件、staged 空、`package.json`/锁/构建配置未改。
- **候选状态**：A0a/A0b/A1/A2/A3 均 `implemented-unverified`（A1/A3 有实施记录；A0/A2 无独立实施记录，候选文件哈希与 D1 记录/证据覆盖）；D1 已对当前候选取证；**本变更包不判通过/返工，不代替独立验收（E2）**。
- **验收标准**：`docs/acceptance/contract-schema-query-criteria-v1.md`（**725 行 / SHA-256 `110018449f43440a841785aa73b6d1be7d0ae60ca4d6b4bcf7b3636723d2768d`**，V1，实施前冻结；AC-1–AC-18 与方案 §7.2 一一对应，未弱化）。
- **授权状态**：闸门 0/1/2 与客户实施授权（IA）均已确认（`docs/communication/2026-11-03_intent_contract-schema-query.md` 当前 200 行 / `2d8e4f3c…`，确认小节为准）；**提交/推送/合并/发布未授权、未执行**；E2/E3 未执行。
- **记录性质**：本文件是统筹的 E1 变更包，不是验收报告、不是客户批准、不是放行文档；本项目无 `.ans/project.json`（未启用 task_ops），不伪造任务令牌/锁/审批/预检。

---

## 一、候选身份与逐文件哈希

### 1.1 产品/测试候选（10 路径）

> 行数为当前工作区实测；`git hash-object` 为工作区 blob；`sha256sum` 为工作区字节哈希（全部 LF；`core.autocrlf=true` 仅影响后续 git touch 提示）；`+/−` 为 `git diff --numstat`。全部落在团队计划 §4.1/§4.3 与 V1 §七写集内；无写集外产品/测试改动。

| # | 路径 | 节点/角色 | git hash-object | SHA-256 | 行数 | +/− |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `src/model/runtime.ts` | A0a/运行时核心 | `90f0a4b4b15d66e41a2c2f9c1333581d7339da50` | `05d6e4e9f4740e88b5616a0e76960b93e936d17466e0dbe1b8d473c30fe7d0f5` | 2734 | +6/−0 |
| 2 | `src/provider/runtime/tools.ts` | A0b/运行时核心 | `8b257fbe2649f8c4538a1a284dcf1d54d886a9cb` | `2d2f8b10cafecb1e9c65871faa5c64862f71a2fa94bc29135bb79812933be159` | 3667 | +21/−2 |
| 3 | `src/provider/runtime/schema.ts` | A0b/运行时核心 | `1683fb406fdabab10afa831770c8b85cd9142672` | `0cb1f6f4dcd7b6a7b6e8ec52c68d5ad593ca0b58f07bc66b15a6a1408bbe987e` | 1422 | +6/−2 |
| 4 | `src/common/编排/workflow-preconditions.ts` | A1/编排 | `74a60e37ce8931ca282d4fc38e9099cd88642400` | `5fa99f57c2423531bc28784e3561313953f2f134bb6ffa3f6574380ed23fb727` | 1531 | +201/−7 |
| 5 | `test/编排/workflow-preconditions.test.ts` | A1/编排 | `f1b2d26cce30a72eed6be558ae95063d002c6913` | `9d083a156d0d645b133e299c2fc9f473d2cc36de1bb27d180f9cc1bf6f98e9ad` | 1305 | +333/−0 |
| 6 | `test/编排/trio-worker-report.test.ts` | A1/编排 | `d2bc956507def345fcff71985b76165c77879af7` | `7ab180eb49c4c94b9dd0a47360c21ec298dee12a71bf34461ea9fd8cd5ab4d2c` | 261 | +4/−0 |
| 7 | `src/common/门禁引擎/governance-roles.ts` | A3/门禁引擎 | `8926ec3faa354ad2716ae01168d2ec46fa741f54` | `e1639969069a90b1aada42850da0bcbf4aac35dbdc4fd1a976f6996ee3842f40` | 617 | +2/−0 |
| 8 | `app/desktop/session.ts` | A2/桌面窗口 | `26aac02aecee060ce0d5c4aa5a5ca2d0102a7978` | `346777afb5dc1e89af5ea89905ddb11a595f9f7cb8cec71099f7d866fb538f82` | 8794 | +4/−0 |
| 9 | `test/桌面应用/rejection-copy.test.ts` | A2/桌面窗口 | `b372d88b8a89859483609c02ada8443237eff2e0` | `71388f9f734309074a8e6bd8a3c5a14853def4309a656b2878274e9c65d3cb91` | 410 | +143/−1 |
| 10 | `test/桌面应用/run-pin.test.ts` | A2/桌面窗口 | `779a2480fb02d9c06e38cc875f3c9e11c8a46be1` | `3344387aada33224e97aae49b157cfd49519a6afa0e62bff90106761cbb075bc` | 889 | +60/−1 |

- 合计 **+780/−13**，与 D1 记录 §二及 `git diff --stat` 一致。
- D1 运行前后逐文件重算 `git hash-object` + `sha256sum` **10/10 无差异**（`00-candidate-identity.txt`、`09-post-run-verification.log`）；本 E1 写盘前复算 10/10 与 D1 表一致。
- A1 的 `test/编排/trio-worker-report.test.ts` 为方案 §10.2/团队计划 §4.1 纳入、任务摘要未列的卡断言文件（AC-11 需要，`test/编排/` 目录授权）；非写集扩大。
- 本任务**无新增文件、无删除文件、无新依赖、无新工具**；`test/门禁引擎/{view-image-cards,list-project}.test.ts` 只读回归，不在候选。

### 1.2 候选树、status 快照与写集闭合

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| HEAD / 分支 | `git rev-parse HEAD` / `git branch --show-current` | `243d8f6a6db663a383b516aad6320c5110c7f583` / `release/v1.8.4-assets` |
| 候选清单 | `git status --porcelain -- src app test` | **10 条，全部 `M`**；无新增/删除 |
| 写集闭合 | 期望 10 路径 vs 实际候选双向比对（D1 `12-scope-check.txt`） | **10/10 精确匹配**；候选外 0 |
| diff 规模 | `git diff --stat -- src app test` | **10 files changed, 780 insertions(+), 13 deletions(-)** |
| 候选树 | 临时索引 `git read-tree HEAD` + 仅 add 上述 10 路径 + `git write-tree` | **`57fdf6b369aece73ba3f3d4685f9ba3f9c91b95f`**（管理/治理记录不进入产品候选树） |
| 产品候选 status 快照 | `git status --porcelain -- src app test \| sort \| sha256sum` | **`9b410444cd7ad301cd20e9ed0bae2266e09fa3e2f6cc0ddc37e17b50e6181afe`** |
| 全量 worktree status 快照（E1 写盘前） | `git status --porcelain -uall \| sort \| sha256sum` | **`76d4c5cfd778fbe1383e449e477a1b2da58336d5ec35a8c828b76575f7bec010`**（43 条；含管理/治理记录；E1/本文件与 memo 写盘后此快照会变化，**产品候选快照不受影响**） |
| 全量 worktree status 快照（E1 写盘后，含本文件） | `git status --porcelain -uall \| sort \| sha256sum` | **`4c9f697094420d03705d2d7bd538c8c4d288f9f971471a79f5c1df61f70f051d`**（44 条；E1 写盘后实测；后续 memo 修改不新增文件，快照行不变；若再有新文件/新路径须重记） |
| staged / 配置 | `git diff --cached --name-only`；`package.json`/`package-lock.json`/`tsconfig.json`/`README*` status | staged **空**；配置/README **未改** |
| 测试 diff 无弱化 | `git diff --stat -- test`；`git diff -U0 -- test` | 4 个测试文件 **+540/−2**；删除行仅 2 条 import，均被同文件更完整 import 取代；无断言删除/放宽、无新增 skip/todo、无测试文件删除（D1 §九） |

### 1.3 复算方法

- 逐文件：`git hash-object <path>`（工作区 blob）与 `sha256sum <path>`（工作区字节）；D1 证据 `00-candidate-identity.txt` 同时记录 bytes/lines/CRLF-lines。
- 候选树：以临时 `GIT_INDEX_FILE` 从 HEAD 读树，仅 `git add -- <10 路径>` 后 `git write-tree`；结果 `57fdf6b3…`。该树只含产品/测试候选，不含 `docs/`、`角色卡/` 管理/证据记录。
- 候选变化（任何产品/测试文件、夹具或构建配置）会使 D1 证据失效；E2 必须按 E1 §1.1 重新核对哈希。

---

## 二、节点 G2 → D1 与交付状态

| 节点 | 角色 | 可观察交付 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| G2 | 沟通 → 客户 | 闸门 2 确认：参与角色、精确写集、无边界变更、T3、阶段、验收安排、证据口径、越界规则 | **已确认（2026-11-03）** | 沟通记录「闸门 2 确认记录」（当前 `docs/communication/2026-11-03_intent_contract-schema-query.md` 200 行 / `2d8e4f3c…`）；团队计划 539 / `a93bd02f…` |
| IA | 客户 → 沟通 → 统筹 | 客户实施授权（与闸门 2 分开；不含提交/推送/发布） | **已给（2026-11-03）** | 沟通记录「实施授权记录」 |
| V1 | 内置独立验收 | 实施前验收标准：AC-1–AC-18 不弱化、T3 依据/升档、证据计划/复用失效、判定规则、版本冻结 | **已写盘并冻结** | `docs/acceptance/contract-schema-query-criteria-v1.md` 725 / `110018449f…`；沟通「V1 确认记录」「V1 核对记录」 |
| B0 | 测试 | 基线：HEAD/工作树、Node/npm、双端 typecheck 0、受影响 72/72、T3 全量 3462/3435/9/18、失败分类、Electron 可运行性、无产品/测试改动 | **已完成** | `角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline.md` 189 / `9f587280…` + 证据目录 15 文件 |
| P1 | 运行时核心/编排/桌面窗口/门禁引擎（提案）；项目管理（审核） | 四份短实现提案 + 项目管理审核 `recommend approval` + P1-CSQ-01–10 | **已完成（有效决定）**；含记录覆盖事故与恢复版 | 提案：A0 100/`57838e46…`、A1 90/`70e36ea4…`（评审版；现 90/`9fe02757…`）、A2 100/`bb04be77…`、A3 81/`f44f1b98…`；有效审核 293/`d547b90d…`；恢复版 300/`1f4b8f34…`；事故版 272/`4469ce2d…`（见 §六） |
| A0a | 运行时核心 | `src/model/runtime.ts` 枚举/类型/`ContractCheckInput.topic?`；typecheck 0；冻结声明 | **已实施（implemented-unverified）** | 候选 #1；无独立实施记录；P1 提案 100/`57838e46…`；D1 候选哈希 |
| A0b | 运行时核心 | `tools.ts` topic 解析/校验/透传/截断标记；`schema.ts` topic 参数/描述/promptGuidelines；typecheck 0 | **已实施（implemented-unverified）** | 候选 #2/#3；P1 提案 100/`57838e46…`；A0 无独立实施记录；行为由 A2 测试覆盖（P1-CSQ-08） |
| A1 | 编排 | `workflow-preconditions.ts` 三示例/三文本/`contractSchemaText`/`describeContractValue`/逐字段错误/topology 文案；两测试文件（含 A3 后卡断言） | **已实施（implemented-unverified）** | 候选 #4/#5/#6；A1 实施记录 62/`3b7da027…`；P1 提案现 90/`9fe02757…`；自测 34/34、typecheck 0 |
| A2 | 桌面窗口 | `app/desktop/session.ts` 首句 topic 早退；`rejection-copy.test.ts`/`run-pin.test.ts` 工具/会话层用例 | **已实施（implemented-unverified）** | 候选 #8/#9/#10；无独立实施记录；P1 提案 100/`bb04be77…`；D1 受影响 36/36 |
| A3 | 门禁引擎 | `governance-roles.ts` 策划卡两行；活动路径核对；卡文本 4612 B/27 行；typecheck 0 | **已实施（implemented-unverified）** | 候选 #7；A3 实施记录 66/`1c07f3c3…`；P1 提案 81/`f44f1b98…`；P1-CSQ-10 保留注释 |
| D1 | 测试 | 受影响套件 88/88；双端 typecheck 0；T3 全量 3478/3451/9/18；失败分类/排除项/候选哈希/写集闭合 | **已完成** | D1 记录 223/`ab7ffb07…` + 证据目录 15 文件（§四） |
| E1 | 统筹 | 本变更包 | **已写盘** | 本文件 |
| E2 | 内置独立验收 | 按 V1 判定 AC-1–AC-18、K1–K8；通过/返工/证据不足 | **未执行** | 待同一 V1 验收主上下文；本 E1 不代替 E2 |
| E3 | 统筹 → 沟通 | 按匹配当前候选的验收结论记录/放行/回报 | **未执行** | 待 E2；提交/推送/发布另行授权 |

- 阶段按团队计划 §六执行：G2 → IA → H1（**不适用**：无边界变更，B-0）→ V1/B0 → P1 → A0a → A0b/A1/A3 → A2 → D1 → E1；无 H1 边界条目，无角色卡/边界/YAML/changelog 改动。
- A1 的卡断言在 A3 卡文本落地后追加；A2 在 A0a+A1 后实施；D1 在 A0a/A0b/A1/A2/A3 后对同一候选取证。

---

## 三、证据链接与哈希

> 行数/SHA-256 为 E1 写盘时实测；`docs/communication/`、`docs/scheduling/`、`角色卡/**/docs/change/` 属管理/治理记录，可能继续追加；E2 以其中确认小节与原始证据为准，不把管理记录混入产品候选。

| 证据 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| 闸门 0/1/2 + IA + V1/B0/P1/D1 记录（当前快照） | `docs/communication/2026-11-03_intent_contract-schema-query.md` | 200 | `2d8e4f3c22372c0e25b6d4187e77e0c6c85764ccfc89af57bc2ce68f11be1a77` |
| 客户确认方案 P1.3 | `docs/planning/2026-11-03_design_contract-schema-query.md` | 911 | `4d61d376c3bcbf89b8069efcf501f062087f088873d3946b522a6abeaa6f4b85` |
| 独立复核（最终） | `docs/planning/2026-11-03_review_contract-schema-query.md` | 282 | `55a2d2681b29ab4e0a5896ce2a772f0d4fd779159eff8b88c9a39303a8c5459f` |
| 团队计划（闸门 2 确认版） | `docs/scheduling/2026-11-03_team-plan_contract-schema-query.md` | 539 | `a93bd02f4f2cd3ecfd90b13aa41195e95eaec539277649fbbc9a8b6a91c03f5c` |
| 实施前验收标准 V1 | `docs/acceptance/contract-schema-query-criteria-v1.md` | 725 | `110018449f43440a841785aa73b6d1be7d0ae60ca4d6b4bcf7b3636723d2768d` |
| A0 P1 提案 | `角色卡/运行时核心/docs/change/2026-11-03_contract-schema-query-P1-proposal.md` | 100 | `57838e461aa36cc98538a4fad823626c80109314a9c1a41eb7a3d6b8cb595d41` |
| A1 P1 提案（评审版） | `角色卡/编排/docs/change/2026-11-03_contract-schema-query-P1-proposal.md`（评审时为 90 行 / `70e36ea4…`；现为修订版，见下行） | 90 | `70e36ea4e8e50a0c0942a2b305351a6b40c4a00ca48eae8730f9cf4e87cddaff` |
| A1 P1 提案（现版，P1-CSQ-03 修订） | `角色卡/编排/docs/change/2026-11-03_contract-schema-query-P1-proposal.md` | 90 | `9fe02757d2e90b5848ccb914108bbace7c7f784cf2e6393cf098ba5dc4ab8cfb` |
| A2 P1 提案 | `角色卡/桌面窗口/docs/change/2026-11-03_contract-schema-query-P1-proposal.md` | 100 | `bb04be77865ecf13b3e6db36b4c093001c0541a6c88820c83c3812f5bb194bc0` |
| A3 P1 提案 | `角色卡/门禁引擎/docs/change/2026-11-03_contract-schema-query-P1-proposal.md` | 81 | `f44f1b98590fe271f639fa61d6ce35767fa1a80375b25cce4cc9169a6364c593` |
| P1 审核（有效决定，原版） | `角色卡/项目管理/docs/change/2026-11-03_contract-schema-query-P1-review.md`（原 293 行版本；当前路径为事故版 272，见下行） | 293 | `d547b90d47615ef00556a65558fdcde6ad307e0286d3bd457624c977d46256ea` |
| P1 审核（恢复版） | `角色卡/项目管理/docs/change/2026-11-03_contract-schema-query-P1-review-approved-recovered.md` | 300 | `1f4b8f3404561b07ee649fade571066f2617096285784e690e4087678982ee19` |
| P1 审核（事故版，仅事故历史） | `角色卡/项目管理/docs/change/2026-11-03_contract-schema-query-P1-review.md` | 272 | `4469ce2d50f0b4117f154288e996e1bdecd1990126c132510e8c26885eaa87b9` |
| A1 实施记录 | `角色卡/编排/docs/change/2026-11-03_contract-schema-query-A1-implementation.md` | 62 | `3b7da027852bb677b6004d9b290f40fb88d027812fe531f73ed58ef0e3d40cee` |
| A3 实施记录 | `角色卡/门禁引擎/docs/change/2026-11-03_contract-schema-query-A3-implementation.md` | 66 | `1c07f3c3e8f4ce90c8b9bda5b11a5566d4583a2f8a94aad92714a44aaa460242` |
| B0 基线（终态） | `角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline.md` | 189 | `9f5872807fd163c9e47ce5a9b704771a2162f9129114a194f2f3bb53ef20676e` |
| B0 证据目录 | `角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline-evidence/` | 15 文件 | 逐文件哈希见 B0 记录 §九；文件清单见 §四.4 |
| D1 回归记录 | `角色卡/测试/docs/change/2026-11-03_contract-schema-query-D1-regression.md` | 223 | `ab7ffb0796c8ff561e9c6bce5a13024fbd1604808d59f21d8d3b79d86fb6b98e` |
| D1 证据目录 | `角色卡/测试/docs/change/2026-11-03_contract-schema-query-D1-regression-evidence/` | 15 文件 | 逐文件哈希见 D1 记录 §十；候选身份/scope 见 §四.4 |

- 环境：Windows 11 Pro 10.0.26300 / Git Bash；Node **v24.22.1** / npm **11.19.1**；Electron **44.7.0**（devDependency；未启动）；无 `.ans/project.json`（未启用 task_ops）。
- 与本任务无关的工作树未跟踪文件 `docs/communication/2026-11-03_intent_customer-authorization-plane.md`（另一事项）不属本任务候选/证据，不进入本变更包、不参与判定。

---

## 四、T3 验证结果与 B0 对照

### 4.1 B0 基线（对照，不是当前候选证据）

- 记录：`B0-baseline.md` **189 行 / `9f587280…`**（171 行 / `314f9941…` 为中间版，见 §六）。
- HEAD `243d8f6`；`git status --porcelain -- src app test` 采集前后均为空；Node v24.22.1 / npm 11.19.1。
- 双端 typecheck：`npm run typecheck` / `npm run typecheck:renderer` 均 **exit 0**（原始日志 `01`/`02`）。
- 受影响三组：**72 tests / 72 pass / 0 fail / 0 skip / 0 todo**（编排 26、桌面 28、门禁 18）。
- T3 全量：**393 文件 / 3462 tests / 3435 pass / 9 fail / 18 skipped / 0 todo**，exit 1（9 项均为既有 Windows symlink EPERM）；首次运行 294.1s（`06-full-t3.log`）与独立重跑 269.5s（`07-full-t3-rerun.log`）计数、9 项失败与 18 项 skip 逐条一致。
- 排除项：`test/pi-adapter/write-sequencing.test.ts`（既有已知挂起；命令 `find ... ! -name 'write-sequencing.test.ts'`；未运行、未验证）。
- Electron：44.7.0 二进制与 `app/renderer/dist` 存在，本 worktree 无 Electron 进程；未启动应用/未跑 E2E。

### 4.2 D1 当前候选（同一候选，10 文件）

- 记录：`D1-regression.md` **223 行 / `ab7ffb07…`**；候选 HEAD `243d8f6` + 10 文件；逐文件哈希 10/10 与 E1 §1.1 一致；D1 运行前后候选快照 10/10 无差异；无写集外产品/测试改动；staged 空。
- 双端 typecheck：`npm run typecheck` / `npm run typecheck:renderer` 均 **exit 0**（`01`/`02`，12:28:25–12:28:29）。
- 受影响套件（`node --test --test-concurrency=1`，三组）：
  - 编排 A1：`workflow-preconditions.test.ts` + `trio-worker-report.test.ts` → **34/34 pass**（B0 26 → +8）。
  - 桌面窗口 A2：`rejection-copy.test.ts` + `run-pin.test.ts` → **36/36 pass**（B0 28 → +8）。
  - 门禁引擎 A3：`view-image-cards.test.ts` + `list-project.test.ts` → **18/18 pass**（B0 18 → 18）。
  - **合计 88 tests / 88 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**。
- T3 全量：**393 文件 / 3478 tests / 3451 pass / 9 fail / 18 skipped / 0 todo**，exit 1，268.4s。
- 与 B0 对照：

| 指标 | B0 终态（189/`9f587280…`） | D1（当前候选） | 差 |
| --- | --- | --- | --- |
| tests | 3462 | 3478 | **+16**（候选扩展：编排 +8、桌面 +8） |
| pass | 3435 | 3451 | **+16** |
| fail | 9（既有 EPERM） | 9（同一集合） | **0 新增确定性失败** |
| skipped | 18 | 18（同一集合） | **0 新增 skip** |
| todo | 0 | 0 | 0 |

### 4.3 失败分类（9 项，均为既有 Windows symlink EPERM，errno -4048）

| # | 文件:行 | 测试名（摘要） |
| --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 |
| 9 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 |

- 与 B0 §八逐项同名同文件:行；**新增确定性失败 0、新增 skip 0**；无未知/无法解释失败；未删除/放宽测试或断言。
- 18 项 skip 与 B0 相同：codex-adapter 1、pi-adapter 1、runtime-core file-write-safety 4、runtime-core lightweight-permission-repairs 6、门禁引擎 pin-evidence 1、shared atomic-write 5（完整清单见 D1 `08-failure-classification.txt`）。

### 4.4 证据目录清单

- **D1 证据（15 文件）**：`00-candidate-identity.txt`、`01-npm-run-typecheck.log`、`02-npm-run-typecheck-renderer.log`、`03-suite-orchestration.log`、`04-suite-desktop-app.log`、`05-suite-gate-engine.log`、`06-electron-facts.txt`、`07-full-t3-file-list.txt`、`07-full-t3.log`、`08-failure-classification.txt`、`09-post-run-verification.log`、`10-test-diff-U0.txt`、`10b-test-diff-summary.txt`、`11-inventory.txt`、`12-scope-check.txt`；逐文件行数/字节/SHA-256 见 D1 记录 §十。
- **B0 证据（15 文件）**：`00-baseline.txt`、`01-npm-run-typecheck.log`、`02-npm-run-typecheck-renderer.log`、`03-suite-orchestration.log`、`04-suite-desktop-app.log`、`05-suite-gate-engine.log`、`06-full-t3-file-list.txt`、`06-full-t3.log`、`07-failure-classification.txt`、`07-full-t3-rerun-failure-classification.txt`、`07-full-t3-rerun-file-list.txt`、`07-full-t3-rerun.log`、`08-post-run-verification.log`、`09-inventory.txt`、`09a-v1-observation.txt`；逐文件行数/字节/SHA-256 见 B0 记录 §九。
- **测试 diff 无弱化**：4 个测试文件 +540/−2；删除行仅 2 条 import（被同文件更完整 import 取代）；无断言删除；无新增 skip/todo；无测试文件删除（D1 `10-test-diff-U0.txt`/`10b-test-diff-summary.txt`）。

### 4.5 Electron/构建

- 本任务不涉及渲染层/UI/窗口/IPC/preload；V1 与团队计划**不要求真实 Electron E2E**、不要求截图/录屏。
- D1 仅记录 Electron 44.7.0 与 `app/renderer/dist` 存在、本 worktree 无 Electron 进程；**未启动应用、未跑 E2E、未截图/录屏**。
- `npm run build:renderer` 不属本任务必需检查（未改渲染层）；D1 未运行、未写成通过。

---

## 五、复用/失效说明

- **当前证据全部来自同一候选**：D1 的受影响 88/88、T3 全量 3478/3451/9/18、双端 typecheck 0 均在 E1 §1.1 的 10 文件候选上执行；D1 运行前后逐文件哈希 10/10 无差异。
- **B0 仅作对照**：B0 的 3462/3435/9/18、72/72、typecheck 0 是基线证据，**不作为当前候选通过依据**；D1 已对当前候选重跑受影响套件、T3 全量与双端 typecheck。
- **V1 冻结**：V1 725/`110018449f…` 在实施前写盘并冻结；本 E1 未改 V1，未改 AC/判定口径；E2 按 V1 判定。
- **管理记录变化不使产品证据失效**：P1 恢复版、沟通记录追加、E1/本文件、memo 等属管理/治理记录，不进入产品候选树；产品候选仍为 §1.1 的 10 文件。
- **证据失效条件**：任何产品/测试文件、夹具、构建配置或候选哈希变化，使 D1 受影响/T3/typecheck 证据失效，E2 必须要求按当前候选重跑；不得跨候选复用。
- **不得复用其他任务证据**：未引用 acceptance-return-card、dispatch-guardrail-relax、global-task-state、i18n、shell-escalation 等变更的通过结论或证据。
- **候选快照**：E1 §1.1 的逐文件哈希、候选树 `57fdf6b3…`、产品 status 快照 `9b410444…` 为 E2 核对的冻结依据；管理记录快照 `76d4c5cf…` 仅记录 E1 写盘前状态，会随管理记录追加变化，不作为产品候选依据。

---

## 六、已知限制、事故披露与开放项

1. **P1 审核记录覆盖事故（必须披露）**：
   - **有效 P1 决定** = 原 **293 行 / `d547b90d47615ef00556a65558fdcde6ad307e0286d3bd457624c977d46256ea`**，结论 `recommend approval`，含 **P1-CSQ-01–10**；由沟通记录「P1 审核记录」与「并发事故与状态校正」裁决为有效版本。
   - **磁盘原路径当前为事故版**：`2026-11-03_contract-schema-query-P1-review.md` **272 行 / `4469ce2d…`**，`status: blocked`、`needs revision`；其 §0 自述「不是当前生效的 P1 决定，生效以 293 批准版为准」，仅作事故历史保留，**不作为实施/验收依据**。
   - **恢复版**：`2026-11-03_contract-schema-query-P1-review-approved-recovered.md` **300 行 / `1f4b8f34…`**；原 frontmatter 与正文按原文重出（正文 SHA-256 `f297b267…`），仅在 frontmatter 后新增恢复说明，故整文件哈希不同；**是重建版，不是整文件逐字节恢复**。E2 应引用原 293 哈希 + 恢复版路径 + 沟通裁决，并记录该审计链缺口。
2. **B0 中间版**：B0 记录曾出现 **171 行 / `314f9941…`** 中间版（缺 §六/§八/§九最终汇总）；终态为 **189 行 / `9f587280…`**（补独立重跑与最终计数）。本 E1/D1 以 189/`9f587280…` 为对照；171/`314f9941…` 仅作历史。
3. **A1 提案版本**：P1 审核时 A1 提案为 **90 行 / `70e36ea4…`**；P1-CSQ-03 要求更正 `flowId`/`moduleId` 表述后，现版为 **90 行 / `9fe02757…`**；**无单独复审记录**。A1 实施记录确认 P1-CSQ-03/04/05/06 已落实（`taskKind`/`flowId` 口径、AC-15 fixture、AC-10 错误码/多余 id、management 空串口径）；该修订不改变契约/写集/AC/档位，但复审链缺口如实披露。
4. **双会话协调**：本任务存在两路并行推进，导致 B0/P1 记录覆盖；沟通已裁决有效版本并落盘校正（B0 终态 189/`9f587280…`、P1 有效 293/`d547b90d…`、恢复版 300/`1f4b8f34…`、A1 现版 9fe02757…）。已落盘的 10 文件产品/测试候选不回退、不重做；E1 以 D1 同一候选为冻结依据。**E2/E3 尚未执行；本 E1 不预判分工，只记录事实。**
5. **N9 非阻断**：复核 N9 指出 AC-17「每 topic schema 常量恰好 3 行」是严格维护契约；V1 保留 AC-17 原文，E2 按当前「恰好 3 行」判定；未来新增合法 schema 行须同步期望行集合，不得删除/放宽断言。
6. **无 Electron/截图/录屏**：V1 不要求；D1 未启动应用、未跑 E2E。不把未运行写成通过，也不因缺少截图/录屏判失败。
7. **T3 排除项**：`test/pi-adapter/write-sequencing.test.ts` 既有已知挂起，D1/B0 均未运行、未验证；排除命令、文件清单、原因见 §四.1/§四.2。不得把排除当通过。
8. **AC-18 真实项目只读抽查**：V1 允许运行项目不可访问时记 `not applicable`/`insufficient evidence` 并写依据；E2 负责该子项，本 E1 不判。
9. **A0/A2 无独立实施记录**：两角色的候选文件由 P1 提案（A0 100/`57838e46…`；A2 100/`bb04be77…`）、D1 候选哈希与证据覆盖；A0b 工具行为由 A2 测试覆盖（P1-CSQ-08）；不把缺失的实施记录当作实现失败，但 E2 可据此要求补充说明。
10. **管理记录快照会变化**：沟通记录当前 200/`2d8e4f3c…`，可能继续追加；E1/本文件与 `docs/scheduling/memo.md` 写盘后全量 status 快照变化。**产品候选 status 快照 `9b410444…` 与 §1.1 逐文件哈希不受管理记录追加影响。**
11. **未启用 task_ops**：无 `.ans/project.json`；不伪造任务令牌/锁/审批/预检/验收凭证；证据以文件哈希与原始输出为准。
12. **未包含无关事项**：`docs/communication/2026-11-03_intent_customer-authorization-plane.md` 属另一事项（客户授权平面），不进入本候选/证据/判定；本任务不改运行项目文档、角色卡/边界、i18n、README/构建/发布。

---

## 七、E2/E3 待执行与授权边界

- **E2 未执行**：本 E1 只汇总当前候选与证据，不判通过/返工/证据不足。E2 由内置独立验收按 V1（725/`110018449f…`）判定 AC-1–AC-18、K1–K8，报告路径 `docs/acceptance/contract-schema-query-report-v1.md`；E2 必须自行打开原始证据、核对候选哈希，不得以本 E1 的自述/摘要代替。
- **E3 未执行**：放行/回报待 E2 匹配当前候选的结论；E3 不授权提交/推送/合并/发布。
- **授权边界**：本 E1 **不授权** commit/push/merge/release，**不授权**修改产品/测试/方案/复核/沟通/验收/角色卡/边界，**不授权**扩大写集或改变 V1/AC/档位；任何候选变化使 D1/E1 证据失效，须重跑并重记 E1。
- **E1 的自述不是验收结论**：AC 判定、T3 档位核对与证据充分性由 E2 按 V1 独立判断；本 E1 不代替 E2，也不代替客户决定。

---

**变更包结束。** 本 E1 未判通过/返工、未 commit/push、未接触客户；候选为 HEAD `243d8f6` + §1.1 的 10 文件，候选树 `57fdf6b369aece73ba3f3d4685f9ba3f9c91b95f`；E2/E3 待执行。
