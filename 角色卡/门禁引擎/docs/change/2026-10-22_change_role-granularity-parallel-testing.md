# 变更记录：角色粒度（bounded context）与 MapReduce 并行测试（门禁引擎卡文本）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-10-22
- 角色：门禁引擎（Gate Engine）
- 任务 ID：`2026-10-22-role-granularity-parallel-testing`；阶段 Map A（与运行时核心并行）
- 依据：客户闸门 2 确认与实施授权（`docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md`）；团队计划 `docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md` §4.3「门禁引擎」/§5.4 N4/§6；策划方案 v1 `docs/planning/2026-10-22_design_role-granularity-parallel-testing.md` §4/§5/§6/§8/§9.1/§13 Q1–Q12 推荐 A；验收标准 v1 `docs/acceptance/role-granularity-parallel-testing-criteria-v1.md` P1/P5/P13。
- 范围：只改本角色授权写集；未开始 Map B（编排），未提交/暂存/推送/发布。

## 1. 写前基线核对（2026-10-22）

- `git rev-parse HEAD` = `64ed44a0ac6e75d647eadbeb3f35ae9f84625845`（与任务预期一致）。
- `git hash-object` / `sha256sum`（写前）：
  - `src/common/门禁引擎/governance-roles.ts` = `4573b5cc2da48f79e5abd3ed5e76503ac120a471` / `d82f6fae973dd08e56aee1a4e081115a6444482f2786ec33b4796faeec0a3d1f`
  - `test/门禁引擎/governance-trio.test.ts` = `daaa9f4f7e01a499b4929a5b3470688d28bb2f08` / `880e9442f2fc76c9ea64e56d8022fd68e26ce24c4db9f11be0bd8d0e14acb09e`
  - `test/门禁引擎/governance-standard-workflow.test.ts` = `813b46939417c93c52d02e982e5a5a219a06d884` / `0b0ec21366b587d038d5b1f3b8af8559943b24a489d5a2fdf5632cfa88d15b02`
  - `角色卡/门禁引擎/api-spec.md` = `78a569264f4d10bf84e2f5d6565c5bcc465a1976` / `ad79ffabb899126c66bb1d86a1be66f639545fc974b6a55909826de81472fe6f`
  - `角色卡/门禁引擎/memo.md` = `c67e4af1d77cfe203d9e48fa264d3f129bad6d6b` / `8ee9a27eb5436e19e4c53410a42839b2dfe7743bddc2fd4c01fa3dd6d2417a3a`
- `git status --short`：工作树已有管理记录改动（`docs/communication/memo.md`、`docs/planning/memo.md`）与未跟踪的意图/方案/团队计划/验收标准/测试基线证据；**不含本角色目标文件**。`git diff --cached --name-only`：空。
- 并行 transient：运行时核心 worker 同时修改 `src/model/runtime.ts`、`test/runtime-core/governance-flow-metadata.test.ts`、`角色卡/运行时核心/{api-spec,memo}.md`；本角色未写这些路径，也未覆盖其内容。

## 2. 改动摘要

### 2.1 `CONVENER_CARD_TEXT`（Steward / 统筹）

- 「团队判断与团队计划（必须）」升级为 v2：`teamPlanSchema: 2`、`modules` 同行内联数组（ASCII slug、不含 `reduce`）、正文模块清单表（module/职责/公开契约/架构来源，恰好覆盖 modules）。
- 角色表升级为 14 列：`roleId | 类型 | module | 职责目标 | 能力要求 | 唯一写集 | 公开契约 | 测试面 | 依赖 | dependsOn | 并行组 | 组别 | apiSpec | 粒度理由`；默认一个模块一个 Map 角色、一个角色一个模块；Reduce 角色 `module: reduce`、不计入模块覆盖；无重复/孤儿/未声明模块。
- 写集与依赖：精确路径/目录、分号分隔、目录以 `/` 结尾；禁通配符/散文/`..`/绝对路径与治理路径；跨角色两两不相交；dependsOn 目标存在、无自依赖/重复/环；同 `map-*` 组无依赖路径；Map 不依赖 Reduce；Reduce 覆盖全部 Map。
- 粒度：整层名黑名单与多模块 `a+b` 无 `粒度理由` 拒发卡；有理由标 `exception-review` 交 readiness 明确批准；单文件/极小模块 warning；禁止纳米角色；明确「字段齐全」≠「粒度正确」；计划须含五维判断与协调成本。
- readiness：`docs/scheduling/<flowId>-readiness-v1.md` 增加 `module`/`contract`/`testSurface`/`parallel`/`dependsOn`/`granularity` 列与 `status: pass|gaps`；例外必须批准或退回；结构校验通过不等于粒度正确。
- flow 模板：`delivery-<module>` Map 交付（模板示例 `delivery-checkout-api`/`delivery-checkout-web`）、`parallelGroup`/`dependsOn`、`contract-freeze`、`test-map-shards`/`integration-e2e`/`verification-evidence` Reduce 步骤；静态校验（目标存在/无自依赖/重复/环、同 map 组无依赖、Reduce 覆盖全部 Map、Map 依赖 contract-freeze、Map 不依赖 Reduce）；dispatch 前置全部 `done`；旧 flow 不填字段行为逐字不变、未知字段仍拒绝；**不新增 `FlowStepKind`**。
- 质量职责与推发任务文本：增加 Map 组并行约束、Reduce 等待全部 Map `done`、测试分片独立临时根/端口/日志、manifest 合并、失败隔离与不得共享可变夹具。

### 2.2 `NOMINATOR_CARD_TEXT`（Crew / 组队）

- 读团队计划 v2 的 `module`/公开契约/测试面/`dependsOn`/并行组/`粒度理由`；计划缺这些细节或写集/模块/依赖冲突时停止写卡并报告 Steward / 统筹，不自行补计划、不自行增删模块/角色/写集。
- 第 5 项内容清单：`role-card.md` 增加 bounded context（module）、公开契约、测试面、上下游依赖（含 `dependsOn`）、粒度理由；`boundary.yaml` 按计划唯一写集逐条精确落盘（不多不少、不写治理路径/他人角色卡）。
- 新增「v2 粒度落卡纪律」：一个角色一个 bounded context/模块；禁整层角色与纳米角色；多模块/整层例外只按计划 `粒度理由` 与 readiness 例外记录落地。
- 沿用 2026-10-22 已落地边界：不选角色、不发 appointment、不写 `docs/nominations/`、不改团队计划。

### 2.3 `VERIFIER_CARD_TEXT`（Proof / 验收，可选补充）

- 核对团队计划 v2 的模块覆盖/并行组/`dependsOn`、Reduce manifest 与每个 Map 分片原始日志（命令/环境/候选哈希/退出码/pass/fail/skip/失败原文）；manifest 是索引、不替代原始证据，缺失/无法对应候选判 insufficient evidence。
- **真实启动/应用演示基线不变**：未真实运行、未演示仍不得建议 accept。

### 2.4 不变项（有测试逐字钉住）

- `BUILT_IN_GOVERNANCE_ROLES` 的 entries / forbiddenWritePaths / preauthorizedDirs、`GovernanceCapabilities` 能力位、内部 id/显示名/`GovernanceFunction` 值、`ENGINEERING_QUALITY_BASELINE` 文本、`appGovernanceBoundary` 四项与所有导出函数签名不变。
- 未新增 `cardKind` / `FlowStepKind` / `GovernancePower` / `GovernanceDecisionKind`；未改客户入口/派发权/角色路径。

## 3. 检查命令与结果

环境：Windows 11 Pro（10.0.26300）、Git Bash、Node v24.22.1、npm 11.19.1；cwd `C:\Users\51054\Desktop\work\ans-studio`；`PATH` 前置 `/c/Users/51054/AppData/Local/Programs/nodejs`。

| # | 命令 | 退出码 | tests/pass/fail/skip/todo | 耗时 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 1 | 改动前 `node --test test/门禁引擎/governance-trio.test.ts test/门禁引擎/governance-standard-workflow.test.ts` | 0（基线记录于 2026-10-22 上一批） | 49/49/0/0/0 | — | 本批新增 8 例后为 60/60 |
| 2 | 改动后同上（定向） | 0 | **60/60/0/0/0** | 168.5 ms | 新增 v2/MapReduce/readiness/registry-invariance 断言 |
| 3 | `node --test "test/门禁引擎/**/*.test.ts"` | 0 | **313/312/0/1/0** | 468.0 ms | 1 skip 为既有 Windows 平台型跳过 |
| 4 | `npm run typecheck`（`tsc --noEmit`） | 0 | — | — | 无诊断；并发运行时核心改动也在同一候选下通过 |
| 5 | 只读跨角色回归 `node --test "test/测试/governance-trio-verify/**/*.test.ts" "test/测试/governance-liaison-verify/**/*.test.ts"` | 0 | 50/50/0/0/0 | 754 ms | 未写这些路径，仅确认卡文本变更未破坏既有断言 |
| 6 | 只读跨角色回归 `node --test "test/测试/governance-judge-cards-verify/**/*.test.ts" "test/测试/governance-e2e-auto/**/*.test.ts"` | 0 | 104/104/0/0/0 | 11.4 s | 同上 |
| 7 | 只读回归 `node --test "test/编排/**/*.test.ts"` | 1 | 735/734/1/0/0 | — | 唯一红为 N3 基线既有 Windows symlink EPERM（`shell-authorized-routine.test.ts:103` 用例），与本批卡文本无关；未改该路径 |

未删除测试、未放松既有断言；旧 flow 模板断言按真实模板变化同步更新，并新增「旧 flow 不填新字段逐字不变」「不新增 FlowStepKind」断言。

## 4. 候选哈希（工作区，写文档前）

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/common/门禁引擎/governance-roles.ts` | `f074f0e15598b85cd47048652adca9bde07a5259` | `2fea2f941c90dbb611f6dcf08e332c0fcb94d9da0476a2c3b4ea753919fdfb4d` |
| `test/门禁引擎/governance-trio.test.ts` | `356d4433f58a6b0172afb5be11ae263c0a261e77` | `7440f91ee425ed37ee44aca9292bbe3cb03a0863dd6030283e5c3b20893b65e8` |
| `test/门禁引擎/governance-standard-workflow.test.ts` | `32fc34c914ca87852fc7e779921cc57f0d37243e` | `3f7e6fa714db82debe6325eb8527fc3c541123553aebb0bc17e1ff7152541345` |
| `角色卡/门禁引擎/api-spec.md` | `ccb1fd5f79d1204949430c2ee1f6529b0fc2839d` | `899a2f7f23952992a9e8b813ef0fa7a207d9e29c3f92018c492176b85d5db8bc` |
| `角色卡/门禁引擎/memo.md` | `fd97d4e43051c93869ed27b2335ab89ad3050515` | `3bfd9ee429609216f52163b2c12b1dfa0e1fe6238dc82d8b94d0948c984f16fb` |

本变更记录自身的最终哈希由角色交付报告记录（自引用无法在文内稳定列出）。

`git diff --stat -- src/common/门禁引擎 test/门禁引擎 角色卡/门禁引擎`：5 files changed，450 insertions(+)，25 deletions(-)；`git diff --cached --name-only`：空（未暂存）。完整写集状态见角色交付报告。

## 5. 未做项与跨角色影响（未越界）

- **编排（Map B）**：`src/common/编排/team-plan.ts` V1–V10/V11、`flow-state.ts` 可选字段/静态校验、`flow-service.ts` 视图/序列化、`governance-gate.ts` dependsOn 前置、`run-role.ts` 卡前守卫、`govern-session.ts` 提示；本批只在卡文本提出产品要求，未实现/未验证这些行为。
- **桌面窗口 / 桌面UI（Map C）**：团队计划 v2 解析、V12、任务文案、可选渲染文案；未改。
- **测试（Reduce）**：v2/legacy e2e、Map 分片/Reduce manifest、T3 全量回归、真实启动/演示；未做。
- **运行时核心（Map A 并行）**：`src/model/runtime.ts` 与其测试由运行时核心 worker 修改；本角色未写，`npm run typecheck` 在双方改动共存的候选上 exit 0。
- 未进行真机端到端、未独立验收；未提交、未暂存、未推送、未合并、未发布；未运行 `npm install`，未改 `package.json`/`package-lock.json`，未新建 `test/桌面应用/` 文件，未写 `docs/scheduling/` 或 `docs/acceptance/`，未开始 Map B。

## 6. 与方案的偏差 / 未解决问题

- 无功能性偏差。卡文本按方案 Q1–Q12 推荐 A 落地；`VERIFIER_CARD_TEXT` 采用了方案允许的可选补充（未按 N/A 记录）。
- 卡文本是行为约束，不是编排/桌面实现的证据；V1–V12、flow 静态校验、dispatch 前置、V12 边界覆盖仍需 Map B/C 实现并由 Reduce 终验。
- `delivery-<module>` 在 YAML 模板中以具体合法 slug 示例（`delivery-checkout-api` 等）呈现，避免 `<module>` 占位符违反 flow step id 的 slug 契约；模板旁明示「Map 交付步骤 id 固定为 `delivery-<module>`」。
- 全量回归与真实启动/演示不在本角色检查范围（团队计划 §6.2/§6.4 归 Reduce），本报告不声称已做。

## 7. 声明

本角色只在授权写集内修改：`src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-trio.test.ts`、`test/门禁引擎/governance-standard-workflow.test.ts`、`角色卡/门禁引擎/api-spec.md`、`角色卡/门禁引擎/memo.md` 与本文件。未越界、未提交/暂存/推送；统筹可复核并安排独立验收。
