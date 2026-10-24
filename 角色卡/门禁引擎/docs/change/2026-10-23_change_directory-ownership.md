# 变更记录：目录级授权与目录规范（门禁引擎卡文本）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-10-23
- 角色：门禁引擎（Gate Engine）
- 任务 ID：`2026-10-23-directory-ownership`；阶段 D4 / Map A（与编排、运行时核心并行）
- 依据：客户闸门 2 确认与实施授权（`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`）；策划方案 v1 `docs/planning/2026-10-23_design_directory-ownership.md` §4.4/§5.4/§7.1/§8.3（§13 Q1–Q12 推荐 A，尤其 Q9 A `实现目录` 必填）；团队计划 `docs/scheduling/2026-10-23-directory-ownership-team-plan.md` §4.3「门禁引擎」/§5 D4/§6；验收标准 v1.1 `docs/acceptance/directory-ownership-criteria-v1.md` P10/P11。
- 范围：只改本角色授权写集（产品数据文本 + 本角色测试/文档）；未开始 D5 桌面任务文案与 e2e，未提交/暂存/推送/发布。

## 1. 写前基线核对（2026-10-23）

- `git rev-parse HEAD` = `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`。
- `node --version` / `npm --version` = v24.22.1 / 11.19.1（PATH 前置 `/c/Users/51054/AppData/Local/Programs/nodejs`）。
- `git hash-object` / `sha256sum`（写前）：
  - `src/common/门禁引擎/governance-roles.ts` = `f074f0e15598b85cd47048652adca9bde07a5259` / `2fea2f941c90dbb611f6dcf08e332c0fcb94d9da0476a2c3b4ea753919fdfb4d`
  - `test/门禁引擎/governance-trio.test.ts` = `356d4433f58a6b0172afb5be11ae263c0a261e77` / `5885ea294d8fdb56f119e1b59ebc987195c8184e86a409b0350eb8bf12d8e62a`
  - `test/门禁引擎/governance-standard-workflow.test.ts` = `32fc34c914ca87852fc7e779921cc57f0d37243e` / `29399c19d79a097fe6daa6f5c9d1a9e5c9c67d94f6627377a98b4883b20807f7`
  - `角色卡/门禁引擎/api-spec.md` = `ccb1fd5f79d1204949430c2ee1f6529b0fc2839d` / `899a2f7f23952992a9e8b813ef0fa7a207d9e29c3f92018c492176b85d5db8bc`
  - `角色卡/门禁引擎/memo.md` = `fd97d4e43051c93869ed27b2335ab89ad3050515` / `3bfd9ee429609216f52163b2c12b1dfa0e1fe6238dc82d8b94d0948c984f16fb`
- 写前 `test/门禁引擎/**` 基线：**313 计 / 312 过 / 0 失败 / 1 Windows 既有 skip / exit 0**。
- `git status --short`：工作树已有其他角色的在飞改动（i18n B0：`app/**`、`src/common/shared/i18n/`、桌面/测试角色文档与测试）与本任务管理记录；**不含本批目标文件**。`git diff --cached --name-only`：空（未暂存）。

## 2. 改动摘要

### 2.1 `CONVENER_CARD_TEXT`（Steward / 统筹）

- 章节标题改为「团队判断与团队计划（v3，必须）」，条目 1–13 重排：
  - **frontmatter**：`teamPlanSchema: 3`、`modules`（同行内联数组）、`directories: [<dir-a>/, <dir-b>/]`（非空内联数组、项目相对、以 `/` 结尾、无通配符）、`recommended`；v1/v2 计划保持原行为、不强制迁移。
  - **模块清单**：五列（`module` / 职责 / 公开契约 / 架构来源 / 实现目录），恰好覆盖 `modules`；**每个 module 必须有非空 `实现目录`（Q9 A）**——不得写 `—`/空，角色 implementation/tests/docs 目录必须在该模块 `实现目录` 内或模块目录本身。
  - **角色表（v3，15 列）**：`roleId | 类型 | module | 职责目标 | 能力要求 | 授权目录 | 精确写集 | 公开契约 | 测试面 | 依赖 | dependsOn | 并行组 | 组别 | apiSpec | 粒度理由`；`授权目录` 目录条目、`精确写集` 精确文件；`唯一写集` 仅兼容别名（带 warning），`边界` 列名 v3 不再接受；一个模块一个 Map 角色、Reduce `module: reduce`。
  - **目录规范表（12 字段）**：`目录 | owner | 类型 | 用途 | 命名 | 允许子目录 | 允许文件类型 | 公开契约 | 测试面 | 依赖 | 禁写区 | 共享`；类型枚举、命名枚举/正则、子目录 `—`/显式/`*`/`**`、扩展名列表（`*` 仅 docs/evidence）、契约或 `internal` + 理由、测试面必填规则、依赖 DAG、禁写区在目录内、共享枚举。
  - **目录覆盖与唯一 owner**：`directories`/目录规范表/角色 `授权目录` 三处一致；每目录唯一 owner；不同角色目录不重叠（`split` 父目录不直接分配）；精确文件不落入他人目录；每个目录在模块 `实现目录` 内或即模块目录。
  - **共享与治理关键路径**：`none`/`read-only`/`split` 规则；`.ans/`、`角色卡/`、`docs/scheduling|acceptance|communication|flows|nominations|verification`、`src/common/shared/`、release/packaging、`.env`/密钥、根单例契约（`src/model/{boundary,role,decision}.ts`、`src/model/runtime.ts`）只能精确授权；`src/model/` 不整体目录授权。
  - **写集与依赖**：`授权目录`/`精确写集` 语法与跨角色不相交；`dependsOn` DAG、同 `map-*` 组无依赖、Map 不依赖 Reduce、Reduce 覆盖全部 Map（v2 规则保留）。
  - **粒度（v3）**：整层名/整应用目录/多模块无理由拒发卡；有理由 `exception-review`；单文件目录 warning；禁纳米角色；不得把「字段齐全」当「粒度正确」。
  - **目录规范变更（Q10）**：只有 Convener 能以新计划版本写，不原地改已确认版本；规范变更需 readiness 重跑；角色/范围实质变化重开闸门 2。
  - **readiness（v3）**：逐角色/逐目录记录 `directories`/`spec`/`shared`/`layout`，同时保留 v2 的 `module`/`contract`/`testSurface`/`parallel`/`dependsOn`/`granularity`；逐目录判断内聚/规范/共享/契约与测试面真实性/边界覆盖（`new` 一致、`changed`/`existing` 计划 ⊆ 边界且更宽限于模块实现目录/既有职责）；结构校验通过不等于粒度/规范正确。
- 标准工作流第 2/3/4/7 步同步：写 v3 计划、readiness 目录列、派发任务文本写明授权目录/规范要点/不得跨目录/改规范、变更包条目引用；质量职责同步 v3 目录规范与唯一 owner、布局核对与不得以结构通过代替语义复核。

### 2.2 `NOMINATOR_CARD_TEXT`（Crew / 组队）

- 标准工作流第 1 步：按 v3 读 `授权目录`/`精确写集`/目录规范/每个 module 的 `实现目录`（并按 v2 读 module/公开契约/测试面/dependsOn/并行组/粒度理由；`唯一写集` 仅兼容别名、`边界` 列名不再接受）；计划缺目录/规范/实现目录或目录/写集/模块/依赖冲突时停止写卡并报告 Convener，不自行补计划或增删目录/模块/角色/写集。
- 第 3 步与第 5 项内容清单：role-card 写 module/`实现目录`/`授权目录`/`精确写集`；`boundary.yaml` 按计划逐条落盘——`授权目录` 落 directory 条目、`精确写集` 落 file 条目，不多不少；`new` 角色边界目录与计划 `授权目录` 一致（角色根工作文档除外，不得更宽），`changed`/`existing` 计划 ⊆ 边界、更宽部分限于模块实现目录/既有职责。
- 新增「v3 目录落卡纪律」：不得改目录规范、不得跨目录、不得把他人目录并进自己边界；目录与边界不一致且无法按计划落卡时只报告 Convener（不确定性交回 Convener，不自行扩权）。
- 质量职责同步：写区与角色卡同 `授权目录`/`精确写集`、模块/`实现目录` 对应；`new` 边界不得比计划宽。

### 2.3 `VERIFIER_CARD_TEXT`（Proof / 验收）

- 标准工作流第 1 步：v3 计划还读 `directories`/目录规范/`实现目录`。
- 第 3 步：对 v3 计划核对目录布局核对报告（改动路径 → 目录规范）与原始 `git status`/diff/候选哈希；报告必须可复算、布局 fail 不得标 pass；核对 readiness 逐角色/逐目录 `directories`/`spec`/`shared`/`layout`；**不把「字段齐全/结构通过」当成「语义正确」**——目录内聚/规范合理/共享必要/契约与测试面真实性以 readiness 记录与验收判断为准；布局报告是证据不是授权，摘要不替代原始证据，缺失/无法对应候选判 insufficient evidence。
- 质量职责：新增布局报告 + 原始证据核对与「结构通过 ≠ 语义正确」结论口径；模块覆盖/manifest 核查扩为 v2/v3；**真实启动/演示基线不变**（未真实运行、未演示仍不得建议 accept）。

### 2.4 不变项（有测试逐字钉住）

- `BUILT_IN_GOVERNANCE_ROLES` 的 entries / forbiddenWritePaths / preauthorizedDirs、`GovernanceCapabilities` 能力位、内部 id/显示名/`GovernanceFunction` 值、`ENGINEERING_QUALITY_BASELINE` 文本、`appGovernanceBoundary` 四项与所有导出函数签名不变。
- 未新增 `cardKind` / `FlowStepKind` / `GovernancePower` / `GovernanceDecisionKind` / artifact kind；未改客户入口/派发权/角色路径。
- `git diff -U0` 的 hunk 全部落在 `CONVENER_CARD_TEXT`/`NOMINATOR_CARD_TEXT`/`VERIFIER_CARD_TEXT` 字符串与文件头注释内；排除卡文本字符串行与注释后，diff 零注册表/能力位/基线/导出函数改动（见证据 `registry-zero-change.txt`）。

## 3. 检查命令与结果

环境：Windows 11 Pro（10.0.26300）、Git Bash、Node v24.22.1、npm 11.19.1；cwd `C:\Users\51054\Desktop\work\ans-studio`；`PATH` 前置 `/c/Users/51054/AppData/Local/Programs/nodejs`。

| # | 命令 | 退出码 | tests/pass/fail/skip | 备注 |
| --- | --- | --- | --- | --- |
| 1 | 改动前 `node --test "test/门禁引擎/**/*.test.ts"` | 0 | 313/312/0/1 | 基线（1 skip 为既有 Windows 平台型跳过） |
| 2 | 改动后定向 `node --test test/门禁引擎/governance-trio.test.ts test/门禁引擎/governance-standard-workflow.test.ts` | 0 | **63/63/0/0** | 改动前 60/60；新增 3 例目录负例，更新既有 v2 断言为 v3 真实文本 |
| 3 | 改动后 `node --test "test/门禁引擎/**/*.test.ts"` | 0 | **316/315/0/1** | 1 skip 为既有 Windows 平台型跳过；无新增失败 |
| 4 | `npm run typecheck`（`tsc --noEmit`） | 1 | — | 本角色交付时快照 4 条（并行编辑中浮动；首次 7 条含 `src/pipeline/orchestration/run-role.ts`），全在并行角色在飞文件：`app/desktop/interface.ts(1125,5) TS2322`（`1\|2\|3` → `1\|2`）、`src/common/编排/team-plan.ts(729,19/729,43/729,52) TS2345/TS2339/TS2363`（v3 编辑中间态）；**`src/common/门禁引擎/governance-roles.ts` 与 `test/门禁引擎/**` 0 错**，未改他角色文件 |

未删除测试、未放松既有断言：v2 断言按真实文本更新（`teamPlanSchema: 3`、五列模块清单、15 列角色表、目录规范表、readiness 目录列等），并新增 Convener 漏 `实现目录`/目录规范/readiness 列、Crew 跨目录/改规范/`new` 更宽、Verifier 把结构通过当语义正确三组负例；注册表零变化与基线文本逐字不变仍由既有测试逐项钉住并通过。

证据原件（原始输出/哈希/diff）保存在 [`2026-10-23_change_directory-ownership-evidence/`](2026-10-23_change_directory-ownership-evidence/)：
`environment.txt`、`baseline-hashes.txt`、`candidate-hashes.txt`、`targeted-tests.txt`、`gate-engine-suite.txt`、`typecheck.txt`、`governance-roles.diff`、`gate-engine-tests.diff`、`status.txt`、`registry-zero-change.txt`。

## 4. 候选哈希（工作区，写文档前）

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/common/门禁引擎/governance-roles.ts` | `540927402fc63cd3561b170f8b478d786216b40a` | `90b480fa7b43e31dac88e533cf12cd86641cdb0a176ca9d9c22531896ce94803` |
| `test/门禁引擎/governance-trio.test.ts` | `364be1a11c09ff7c28f584a6c33a600bafa1458c` | `452f7ff134e4aced40a5e35242a01ecb947ed0ef155f120d311283de0ee988a6` |
| `test/门禁引擎/governance-standard-workflow.test.ts` | `abccf2d1af9bd79392b9d29975ae2afc494de758` | `b16a06741dd3a5770792e3917ef5c9773d934ff169e40f72a74bfe033d6427a6` |
| `角色卡/门禁引擎/api-spec.md` | `123595c92c942b30b99cd897f8c8870fa9a3d632` | `3b843835f8165757b99045c0eeb21b215bfb960d8397d09cf011cff402e4735c` |
| `角色卡/门禁引擎/memo.md` | `a596c2c4da810a3b765a70b5948c8ffe550f39aa` | `52342f9577f03fff81e1b9f5afb5412b4fbef5a75fb748610f3c1eb71b450c37` |

本变更记录与证据目录自身的最终哈希由角色交付报告记录（自引用无法在文内稳定列出）。

`git diff --stat -- src/common/门禁引擎 test/门禁引擎 角色卡/门禁引擎`：5 files changed，237 insertions(+)，76 deletions(-)（不含本记录与证据目录）；`git diff --cached --name-only`：空（未暂存）。

## 5. 未做项与跨角色影响（未越界）

- **编排（D4，并行）**：v3 解析/`DirectorySpec`/V-D1–D9/布局核对纯函数/卡前守卫/`govern-session.ts` 提示由编排实施；本批只在卡文本提出产品要求，未实现/未验证这些行为。`npm run typecheck` 的 4 条诊断（交付时快照；首次 7 条含 `run-role.ts`）均来自其与桌面窗口的在飞 v3 改动，本角色未修改这些文件。
- **运行时核心（D4，条件）**：`GovernanceJudgeFacts.teamPlanSchema?: 1|2|3` 等由运行时核心实施；未改。
- **桌面窗口（D5）**：`interface.ts` v3 解析/V12、`governance-advance.ts` Crew/readiness/验收任务文案与 `test/桌面应用/interface.test.ts` 未由本批实施；e2e 不在本批。
- **测试（D6/D7）**：v3 夹具/完整链路/布局核对 e2e、T3 全量回归、真实启动/演示未做；本报告不声称 T3 验收通过。
- 未进行真机端到端、未独立验收；未提交、未暂存、未推送、未合并、未发布；未运行 `npm install`，未改 `package.json`/`package-lock.json`，未新建 `test/桌面应用/` 文件，未写 `docs/scheduling/`、`docs/acceptance/` 或 `docs/communication/`。

## 6. 与方案的偏差 / 未解决问题

- 无功能性偏差。卡文本按方案 Q1–Q12 推荐 A 与验收标准 v1.1（Q9 A `实现目录` 必填）落地；v1/v2 计划不强制迁移的兼容口径保留在卡文本中。
- `typecheck` 当前被并行角色在飞改动挡红（非本角色文件）；本角色文件 0 错。最终候选的全仓 typecheck 由 D7 Reduce 在合并候选上复跑。
- 卡文本是行为约束，不是 V-D/V12/布局核对/任务文案的机械实现证据；跨角色 e2e 断言（`test/测试/**`、`test/桌面应用/**`）由对应属主随其实现同步。
- 独立验收标准 P10/P11 中与桌面任务文案、readiness 样例相关的部分依赖 D5/D6 产物，本批不生产这些证据，不声称通过。

## 7. 声明

本角色只在授权写集内修改：`src/common/门禁引擎/governance-roles.ts`（仅卡文本数据与文件头注释）、`test/门禁引擎/governance-trio.test.ts`、`test/门禁引擎/governance-standard-workflow.test.ts`、`角色卡/门禁引擎/api-spec.md`、`角色卡/门禁引擎/memo.md`、本文件与证据目录。未越界、未提交/暂存/推送；统筹可复核并安排独立验收。
