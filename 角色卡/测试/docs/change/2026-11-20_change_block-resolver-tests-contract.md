# 变更记录：Block 解法路由测试批 R4a——既有测试契约更新

- 日期：2026-11-20
- 角色：ANS 内置「测试」
- 工作树：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\feat-block-resolver`
  （分支 `feat/block-resolver`，HEAD `694ea9c`；在 R1/R2/R3 未提交实现之上继续）
- 权威依据：
  - `docs/planning/2026-11-20_design_block-resolution-paths.md`（§三–§七、§8.1 T-1/T-2/T-5/T-11、§九 Q1–Q10）；
  - `角色卡/编排/docs/change/2026-11-20_change_block-resolver-foundation.md`（§二 API、§六 测试现状、§七 待测试批点）；
  - `角色卡/桌面窗口/docs/change/2026-11-20_change_block-resolver-desktop.md`（§四 决策卡、§七 P27、§十一 验证、§十二 风险）；
  - `角色卡/门禁引擎/docs/change/2026-11-20_change_block-resolver-texts.md`（§三 资源事实、§五 待测试批点）。
- 范围：**只改既有测试 6 文件 + 新增本记录**。未改生产代码、R4b 新测试文件（`test/**/block-*.test.ts`
  等并行在飞文件）、其它测试、门禁文本、workflow 资源；未 commit/push/CI/tag/main；未读 `.env`；未占端口。
- 本批性质：客户 2026-11-20 授权语义（所有 block 必须有解法，终态只有 `fixed`/`decided`，无 `stopped`；
  `onExhausted` 版本化；review 名单不可读不再静默回落 verifier）。以下断言更新是**正当契约变更**，
  不是放宽；安全门/上限/客户主权/不伪造停止/known-red 冻结名一律保留。

## 一、逐文件/逐用例改动与理由

### 1. `test/编排/app-dispatch-definitions.test.ts`（8/8 pass）

| 用例 | 改动 | 理由 |
| --- | --- | --- |
| 注册表覆盖 | `add/modify.version` 1→2；新增 `WORKFLOW_DEFINITION_VERSION=2`、`WORKFLOW_DEFINITION_VERSIONS=[1,2]` 断言；测试名补「当前版本 v2、双版本 v1/v2」 | R1 §八：定义版本化（Q5/Q10）；v2 为当前注册表，v1 逐字保留给在飞 workflow |
| 定义 hash | 新增逐版本断言：`workflowDefinitionVersionsOf` 返回 [1,2]；v1/v2 各自 hash = 重算值 = `WORKFLOW_DEFINITION_HASHES_BY_VERSION[id][version]`；v2 = 当前 `WORKFLOW_DEFINITION_HASHES`；v1≠v2 | hash 冻结口径随版本化更新；v1 旧发布 hash 仍用于在飞对账（不静默迁移） |
| 定义只读 | 篡改值 `version = 2`→`= 3`；结果断言 `version===2` | 当前定义版本为 2；仍验证严格模式对冻结属性赋值抛 TypeError |
| getWorkflowDefinition fail-closed | `getWorkflowDefinition("add",2)` 改为**合法**正例（version 2）；非法版本改用 3；`modify@1` 仍合法并断言 version 1；测试名更新 | R1：显式 1/2 均合法，其它版本才 `workflow-definition-version-unsupported`；旧的「2 非法」断言已过时 |
| 关键语义冻结 | `A2.retry.onExhausted` 期望 `blocked`→`route-block-resolver`；新增 v2 全阶段 `route-block-resolver`、v1（add/modify）全阶段 `blocked` 断言；注释更新 Q8 版本化语义 | 设计 §6.5：`onExhausted` 语义更名属定义版本化；v1 旧定义按旧值解释，禁止静默迁移 |

未改动：阶段集合/顺序、next/rework 冻结表、driveOrder 合法边、JSON Schema 生成、三卡/merge-main/
B1 回退/B2 派生/验收策略等安全语义断言（仅版本字段期望随注册表更新）。

### 2. `test/编排/app-dispatch-service.test.ts`（20/20 pass）

| 用例 | 改动 | 理由 |
| --- | --- | --- |
| selectWorkflow(A) | `selected.definition` 与 `workflow.started.definition.version` 1→2；hash 仍取当前 `WORKFLOW_DEFINITION_HASHES`（v2） | R1：新 select 使用 v2 定义 |
| selectWorkflow(B) | `selected.definition` version 1→2 | 同上 |
| selectWorkflow 拒绝面 | `definitionVersion` 非法值 2→3 | v2 现合法；仅 1/2 可解析 |
| drive 任务形状矩阵（A12a/A12b） | 新增 `writeReviewRoster(root)` 可读名单夹具（project-roster/v4 + 被引用 intent/proposal/architecture/modules）；保留 `to:"verifier"` 与幂等键/executorKind 正向断言 | R1：名单不可读不再静默回落 verifier；名单可读且无 `roles[].review` ⇒ 既有 Q3 默认 verifier（语义不变）。夹具为正向路径，不弱化 |
| **新增** review 名单不可读负例 | 断言 `review-role-unavailable`、message 含「名单不可读」「不再静默回落」、`blockFact`（protocol app-dispatch/v1、code、detailCode `roster-unreadable`、ownerRoleId `rapporteur`、stage/workflowId）、`classifyBlock` ⇒ B1 `missing-resource`；并断言不建 A12a 任务、不写 A12a `stage.dispatched` | R1 §六/§七：新稳定码与事实出口必须由测试钉住；B1 属主 rapporteur（名单属主）；fail-closed 交 resolver 路由 |
| observe A12b（light/standard/rework 两用例） | 新增 `writeReviewRoster` 夹具后驱动 A12b | 同上：review 阶段需可读名单；A12b 收口/归档/聚合/rework 语义断言逐字保留 |
| app 工作流自身只产生 app 协议事件 | 注释 `add@1`→`add@2`（断言本身取当前注册表，值随版本） | 版本化后的准确口径 |

未改动：Q8 重试/预算耗尽、高风险零重派、卡 prompt 逐项匹配、worker-dispatch、reconcile、
协议隔离、反向驱动守卫等安全/语义断言。

### 3. `test/门禁引擎/chief-workflow-v3-resource.test.ts`（4/4 pass）

| 用例 | 改动 | 理由 |
| --- | --- | --- |
| v1/v2/v3 字节稳定性 | v3 冻结 blob SHA `0318486…` → `f3ee15156ebf40a959961ef29811922204e18d45`；测试名/注释改为「block resolver 文本批后冻结」；v1 `53d7167…`、v2 `d528c6c…` 逐字不变 | R3 §三：v3 新增 block 语义段后的工作树字节；v1/v2 逐字冻结（在飞 fixed-v2.1 零迁移） |
| v3 关键语义段 | 测试名补「block 路由与决策卡」；新增 positive：`block 如实报告即路由输入`、`应用按类路由`、`block.raised → block.routed`、`requestId=block-card-<blockId>`、`block 生命周期（无 stopped）`、终态 fixed/decided、`escalated` 非终态、`T_repair`/`T_remind`、`block-terminate-flow`、`终止仅由客户在决策卡中显式选择`、`decided 结果`、`blocks.jsonl` 审计；新增 negative（按具体旧句，不做 blanket「停止」误杀）：`stage.blocked` 交客户/运营、无法恢复时按停止面处理、阻塞推进并交原资源/装配 owner 修复 | R3 §五.2：T-12 断言口径——positive 新句 + negative 具体旧句；保留「不停止/停止工具/workflow.stop-unconfirmed」等合法停止语义词 |

未改动：版本行唯一/身份行/体积/BOM/NUL、v3 不授予旧动作面、v2 旧口径段逐字仍在。

### 4. `test/编排/doc-format-specs.test.ts`（26/26 pass）

| 用例 | 改动 | 理由 |
| --- | --- | --- |
| TM-8 稳定 code 扫描 | `CODE_WHITELIST` 登记 4 个应用内部码（含非空理由）：`boundary-denied`、`boundary-violation`、`plan-escalation`、`roster-unreadable` | R1/R2 实际新增的 block 分类事实码/详情码（`block-resolution.ts` 码表；`workflow-service.ts` 事实出口）；非 boundary/plan/roster 文档格式解析码。全仓扫描结果恰为这 4 个，已全量核对 |
| TM-5 schema 字面量扫描 | `SCHEMA_WHITELIST` 登记 `block/v1`（理由：blocks.jsonl 生命周期账本 schema，应用内部状态账本） | 运行中发现的额外预期差异（R1 新增 `block-ledger.ts`）；任务书 TM-8 清单之外的必要最小登记 |

未改动：TM-5/TM-8 扫描逻辑、覆盖指定字面量断言、白名单理由非空断言；未放宽任何扫描面。

### 5. `test/桌面应用/stuck-redispatch.test.ts`（10/10 pass）

| 用例 | 改动 | 理由 |
| --- | --- | --- |
| B-07 升级卡（block 卡） | 客户作答 `terminate`→`block-terminate-flow`；`requestId` 断言由 `task-escalation-t-esc-2` 改为正则 `^block-card-[0-9a-f]{24}$`；选项断言改为 B9 block 词表 `block-revise-scope/block-retry-with-cap/block-accept-current-state/block-terminate-flow`；唯一推荐 `block-revise-scope`（修复向，terminate 永不推荐）；`evaluateDecisionCardRequest` 推荐项同步；标题 `[Block]`；flowId `snake`；保留「terminate ⇒ failed 报告、不 close/不收口」断言 | R2 §4.4/§七 P27：升级卡改为 block 卡（`block-card-<blockId>`、应用发行 decision、选项/推荐来自 R1 装配、主权终止仅客户）；保留不伪造停止/终止落地单一实现断言 |
| B-07 重复调用 | 原 `captured.length===1` 改为「block 卡（含 `block-revise-scope`）只呈现 1 次」；披露重复调用会落入 legacy 升级卡回退面 | block 卡 resolved 后同链再次调用时 R2 未缓存升级结果 ⇒ 回退旧卡（见 §四-2）；测试只钉「block 卡不重弹」契约，不把回退旧卡固化为期望 |
| C-04 开关关闭（真实 channel） | 选项/唯一推荐改为 block 词表（推荐 `block-revise-scope`）；客户作答 `continue`→`block-accept-current-state`（映射既有 continue 落地动作）；保留「任务未收口 + `task.escalation.manual` 记录」断言 | 同上；主权项 `block-accept-current-state` 为客户本人决定 |
| C-04 开关开启（真实 channel） | 测试名/注释改为 block 卡 customer-decision 路由；judge 结果行仍为 0；推荐项 `block-revise-scope`；断言终止选项在卡面；客户作答 `block-terminate-flow`；保留 failed 报告/不自动收口 | R2：`metadata.blockJudgePermitted` 仅在 `judge-decision` 路由为 true；本事实（P27）为 customer-decision ⇒ 即使「替我决策」开启也不代选，主权选项永不代判 |
| C-04 升级卡修复向选项 | 原 redispatch/replace 双侧用例改为 `block-revise-scope`/`block-retry-with-cap` 两修复向选项（均映射既有 redispatch 落地动作）；保留「不自动执行危险动作 + 人工处置记录 + 任务未收口」断言 | 设计 §三 B9 卡选项为 revise-scope/retry-with-cap/accept-current-state/terminate；`block-replace-executor` 不再是 P27 卡选项（映射仍保留于 router 供 B2/B7/B8 类使用） |
| 夹具（`seedMaxChain`/B-07 inline created） | 任务 `task.created` 增加 `flowId:"snake"`、`runId:"run-test"`、`runState:"legacy"` | block 决策卡复用既有 decision 卡通道，该通道要求 flowId 合法 slug（缺失 ⇒ `missing-flow-id` 拒发卡、presenter 不呈现）；带 flowId 的 legacy 任务按 task-state run-required 规则必须携 runId/runState。见 §四-1 |

未改动：safe/unsafe/needs-review 重派、重派上限、B-07 自动换人、B-08 终止证据（安全门/上限/不伪造停止）断言。

### 6. `test/桌面应用/app-dispatch-delivery.test.ts`（5/5 pass）

| 用例 | 改动 | 理由 |
| --- | --- | --- |
| A12b done / standard blocked rework / light blocked archive 三个子块 | 各自在创建临时项目后 `writeReviewRoster(root)`（可读 project-roster/v4，无 `roles[].review` ⇒ 默认 verifier） | R1：review 阶段名单不可读 ⇒ `review-role-unavailable`，不再静默回落；补可读名单夹具保留「应用直派 A12b → 报告 → 归档/聚合/rework/light accept」全链正向断言（不弱化任何验收语义） |

未改动：select_workflow 捕获/投递、报告观察、卡 prompt、worker 派发、启动对账等断言。

## 二、保持不动的冻结面

- v1/v2 Chief 资源字节/blob SHA（`53d7167…`/`d528c6c…`）与 legacy/fixed-v2.1 旧协议断言；
- 三卡 + `merge-main` 客户本人、judge 不可代批、客户主权排除面、shell 三层链、安全门/上限/不伪造停止；
- 三套 known-red 名单文件与其测试名（未改名、未删除、未新增 skip）；
- 未改生产代码；R4b 并行新增测试文件（`test/**/block-*.test.ts` 等）未触碰。

## 三、验证

### 3.1 typecheck

- 根 `npm run typecheck`（cwd=worktree）：**exit 0，0 error**（最终复跑）。
- 过程中并行 R4b 在飞文件（`test/桌面应用/block-router.test.ts`、`test/编排/block-ledger.test.ts`）
  曾短暂有类型错误；本批 6 文件用临时 tsconfig（仅 include 本批文件，继承根配置）单独 typecheck
  **exit 0**；R4b 作者修复后全仓 typecheck 0。本批未触碰这些文件。

### 3.2 指定测试文件（`node --test --test-concurrency=1`，逐文件）

| 测试文件 | tests / pass / fail / skipped |
| --- | --- |
| `test/编排/app-dispatch-definitions.test.ts` | 8 / 8 / 0 / 0 |
| `test/编排/app-dispatch-service.test.ts` | 20 / 20 / 0 / 0 |
| `test/编排/app-dispatch-b2.test.ts` | 3 / 3 / 0 / 0 |
| `test/编排/doc-format-specs.test.ts` | 26 / 26 / 0 / 0 |
| `test/门禁引擎/chief-workflow-v3-resource.test.ts` | 4 / 4 / 0 / 0 |
| `test/桌面应用/stuck-redispatch.test.ts` | 10 / 10 / 0 / 0 |
| `test/桌面应用/app-dispatch-delivery.test.ts` | 5 / 5 / 0 / 0 |

### 3.3 目录级复跑

| 目录 | tests / pass / fail / skipped | 说明 |
| --- | --- | --- |
| `test/roles/**` | 285 / 285 / 0 / 0 | 保持全绿 |
| `test/runtime-core/**` | 607 / 603 / 0 / 4 | 0 fail |
| `test/门禁引擎/**` | 589 / 588 / 0 / 1 | 0 fail（含 R4b 并行新增 `block-resolver-texts.test.ts`） |
| `test/编排/**` | 1446 / 1444 / 0 / 2 | 0 fail（含 R4b 并行新增 block-ledger/block-resolution 测试） |
| `test/桌面应用/**` | 879 / 876 / 3 / 0 | 3 项为既知工作树环境差异（见 §四-5），非本批回归 |

### 3.4 known-red 三套冻结名单核对

| 套件 | 结果 | 核对 |
| --- | --- | --- |
| runtime-core 33 | 607 / 603 / 0 / 4 | 33/33 名以原名出现于通过清单；0 命中失败；名单文件未改 |
| gates 5 | 589 / 588 / 0 / 1 | 5/5 名以原名出现于通过清单；0 命中失败；名单文件未改 |
| orchestration 24 | 1446 / 1444 / 0 / 2 | 24/24 名以原名出现于通过清单；0 命中失败；名单文件未改 |

- 名单路径（canonical）：
  - runtime-core 33：`角色卡/测试/docs/change/2026-11-10_B5_two-fixed-workflow-paths_evidence/ref-knownred-runtime-core-33.txt`
  - gates 5：`角色卡/运行时核心/docs/change/2026-11-10_B2_two-fixed-workflow-paths-evidence/07-gates-failure-names.txt`
  - orchestration 24：`角色卡/编排/docs/change/2026-11-11_B17_two-fixed-workflow-paths_evidence/b17-05-known-red-failnames.txt`
- 本批**未改名、未删除、未放宽**任何冻结 known-red 测试名/期望；未新增 skip；三套名单文件未改。

## 四、披露与生产实现疑点（本批未改）

1. **block 决策卡要求 flowId（P27 无 flowId 任务的真实缺口）**：R2 的 block 卡复用既有
   `cardKind:"decision"` 通道；该通道的 `validateDecisionCardRequest` 要求 `flowId` 为合法 slug
   （缺失 ⇒ `missing-flow-id`，`notPresented:true`，presenter 不呈现）。R2 `escalateRedispatchBlock`
   只在任务 `created.flowId` 存在时带 flowId ⇒ **无 flowId 的 legacy 任务无法呈现 P27 block 卡**。
   本批把 stuck-redispatch 夹具改为带 `flowId/runId/runState` 的现实 legacy 任务（不弱化卡语义），
   并在此披露；建议 R2 为无 flowId 任务提供确定性回退（如 `task-escalation` slug）或允许 task-only
   block 卡走独立校验（属生产实现决定，测试批不改）。
2. **block 卡 resolved 后同链重复调用回退旧卡**：block 卡已 `decided` 后再次 `redispatchTask`，
   `escalateRedispatchBlock` 返回 `handled:false`，随后 `escalateStuckTask`（首次）呈现旧
   `task-escalation-*` 卡。本批测试只钉「block 卡不重弹」（不把旧卡回退固化为期望）；建议 R2
   按链缓存升级结果，避免客户已裁决后再次弹卡。
3. **P27 卡不再提供 replace**：B9 选项按设计为 `block-revise-scope`/`block-retry-with-cap`/
   `block-accept-current-state`/`block-terminate-flow`；`block-replace-executor` 的落地映射仍在
   router 单一动作表中供 B2/B7/B8 类使用。原 C-04 replace 用例据此改为两个修复向选项。
4. **TM-5 额外登记 `block/v1`**：任务书 TM-8 清单之外，运行 TM-5 发现 R1 新增 `block/v1` 字面量；
   已按同一「应用内部账本 schema」理由登记（否则 TM-5 不能全绿）。
5. **桌面 3 项环境失败（非本批）**：`genesis-bootstrap`（su gate）、`operator-channel` I-1、
   `p0-halt-and-images` P0-2 —— 与 R2 记录 §十一.4 一致：linked worktree 的 `.git` 为文件，
   `readGitHostProtectionRequirement` 返回 unknown，导致真实 openRoleSession 预检失败；
   与 resolver 代码/本批测试无关，主检出/CI 应为绿。
6. **R4b 并行文件**：本批期间其它会话正在新增 block 专项测试（`block-ledger`/`block-resolution`/
   `block-router`/`block-resolver-*`/`tests-new` 记录）；本批未读写这些文件，最终全仓 typecheck 0
   与目录复跑均含其运行结果。
7. 本批未运行 Electron/真实模型；未占调试端口；未读 `.env`；未 commit/push/CI/tag/main。

*本记录供协调方/客户核对实施对照；不构成合并/发布授权。*
