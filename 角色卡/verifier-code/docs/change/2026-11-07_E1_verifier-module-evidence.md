# E1 verifier 角色模块证据

- 任务：E1 greenfield 开发 verifier 角色模块（运行时门控与角色模块化，团队计划 §4.4⑥/§7.4；B1 E1.1–E1.7 自检）
- 角色：`verifier-code`（质检代码维护角色）
- 日期：2026-11-07
- 工作树：`.claude/worktrees/trunk-amendment`（分支 `feat/plan-escalation-card`）
- 状态：模块/测试/文档候选完成；**未判验收、未提交、未推送、未跑真实模型**；E2 切换前旧引擎仍是权威（E1 过渡期口径）。

## 一、输入与冻结锚点（开工核对）

| 输入 | 值 |
| --- | --- |
| E0.3 契约（冻结） | `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`：**685 行 / SHA-256 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`**（开工与收工复算一致；差分测试内固化为断言） |
| 冻结记录 | `docs/scheduling/2026-11-07_contract-freeze_runtime-gate-role-module.md`（E1 可启动；旧引擎 E2 前权威/oracle） |
| B1 | `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md` v1 `a999dc19…` + v1.1 `e5027742…`（E1.1–E1.7） |
| 团队计划 | `docs/scheduling/2026-11-07_team-plan_runtime-gate-role-modularization.md`（§4.4⑥、§7.4、§7.5 X-R5） |
| Model 公开类型 | `src/model/role.ts` **409 行 / `d5e550a06514b8a61fc66b517a267343ba95d8aa29050eb6ee3c7b7f9b5f8780`**（E0 D1/D10 冻结口径） |
| 旧规格 oracle | `src/common/门禁引擎/governance-roles.ts` **794 行 / `fddda111cb1ea76614f632f931441d45e534e4f9f23297193615fbdf525cd16e`** |
| D1 registry oracle | `src/common/门禁引擎/role-tool-registry.ts` **157 行 / `9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b`** |
| 旧派发/报告 oracle | `src/common/编排/workflow-preconditions.ts` **1609 行 / `6c2349a5e7766e8c79edcc5c7b465cbf4bf10bae662cbe13f99499e6c8c4dd41`** |
| 旧卡种 oracle | `src/pipeline/orchestration/run-role.ts` **3333 行 / `026f5e995f4f10cf890a94a5e50d9a9317a0ebbcc04a1106bf287c9d6c2823e6`**（只读 source 对照 `TRIO_CARD_KINDS.verifier`） |

只读消费（未修改、未 import 进模块）：`src/service/trunk/impl/apply-journal.ts`（review/acceptance 路由）、`src/model/runtime.ts`（形状真源）、桌面 review/acceptance 路由。

## 二、交付物与写后哈希

| 文件 | 行数 | SHA-256 | 说明 |
| --- | --- | --- | --- |
| `src/common/roles/verifier/index.ts` | 385 | `ef7ce5b923961c36a10e6379cc2300c2a533ec37f192bf10b6bc985d29097bb6` | 唯一 public entry；数据 + `tools/dispatch/preflight/context` |
| `test/roles/verifier/verifier-module.test.ts` | 289 | `b763044b24d0e6e899bf5184d3f1aa66d33f36496201ee4ba8ca3efb59b60da5` | 15 项单测 |
| `test/roles/verifier/verifier-differential.test.ts` | 212 | `3786fe297ace2f8abc083734dc8c5a86269302a7bdd64e13d3120792472b11c9` | 8 项差分（旧 oracle） |
| `test/roles/verifier/fixtures/verifier-differential.fixtures.ts` | 340 | `980a3d335856b7b8136d1ab99237aa4d8107630c132ef30d040a905b07caa084` | dispatch/review 差分夹具 |
| `角色卡/verifier-code/api-spec.md` | 128 | `96dbbe35a5f42513008d4bbe24c552796f314a6ccd7e1c2a8fd243e64fc46372` | public API/事实键/错误码/差分报告 |
| `角色卡/verifier-code/memo.md` | 33 | `bee281ea4bd1594877693ffe822a3ee8d07c0294c7c9226b7e048d986139ff23` | 续接线索 |
| `角色卡/verifier-code/feature-map.md` | 13 | `a39753ce8d71bd9e010d43dc522a583b988addf622158eab5fa59ed49f875f28` | 功能导航（角色卡首轮要求） |
| `角色卡/verifier-code/functional-description.md` | 26 | `4bfd5f9cceb79569889e2cdb95ba00b2cdc7a351863840632419553f0c45ee3a` | 职责/交接/代码位置（角色卡首轮要求） |

本证据文件自身不列入哈希（写后复算会变化）；其余交付物哈希如上。

## 三、模块 public API（摘要；详表见 `api-spec.md`）

- 唯一导出：`verifierRoleModule: BuiltInRoleModule`（模块根只有 `index.ts`）。
- 数据：`id="verifier"`、`displayName="质检"`、`function="verification"`、`card`（旧 `VERIFIER_CARD_TEXT` 逐字 + 3 条边界/预授权 + 17 条禁写前缀）、`capabilities`（customerInput true、其余五能力位 false、`shell:"operator-approve"`）、`cards=["acceptance"]`。
- `tools()`：`{ capabilities: spec 同引用, tools: [], reasons: [] }`；14 项 `RoleToolId` 无一允许 verifier；空声明合法。
- `dispatch()`：R-2 硬身份/存在性（target 必须内置 verifier；来源 chief/convener；`targetExists===true`），允许时 `reportToRoleId=sourceRoleId`（仅差分期望）；6 个稳定码。
- `preflight`：只覆盖 `review`；登记事实键 `reviewTarget`（`{operationId,candidate}`，CID/最终候选）与 `criteria`（1..16 `GitEvidenceRef`）；形状复用 Model `isDispatchTaskReviewTarget`/`isTaskReviewBasisRef`；缺事实/形状不符 deny；**不做验收判定/证据内容核验**。
- `context()`：两条静态模板段（`verifier-acceptance-card`、`verifier-report-expectation`）。

## 四、差分结果（旧实现 vs 模块）

**结论：零差异**（卡文本/边界条目/预授权/禁写/capabilities/cards/tools/review preflight/可表达的 dispatch 事实）；差异仅 4 条**契约明文项**，逐条列为 `documented` 并断言。

| 差分面 | oracle | 结果 |
| --- | --- | --- |
| 卡/边界/capabilities/显示名 | `governanceRoleOf("verifier")` + `builtInRoleModuleDataOf("verifier")` | 逐字段零差异（含卡文本逐字、禁写清单逐项） |
| cards | `run-role.ts::TRIO_CARD_KINDS.verifier`（source 对照） | `["acceptance"]` 零差异；无 legacy `write`；∈ Model `GOVERNANCE_CARD_KINDS` |
| tools | `ROLE_TOOL_CATALOG` 14 项 + `validateRoleToolDeclaration` | 14 项允许角色均不含 verifier；空声明 `allow:true`、`tools:[]` |
| dispatch（9 个 zero fixture） | `evaluateDispatchAuthorization` + `reportTargetForTaskCreator` | 允许/拒绝、稳定 code、报告期望零差异 |
| dispatch（4 个 documented fixture） | 同上 | 差异见下；测试断言「登记为 documented 必须真实存在」 |
| review preflight（19 个 fixture） | `isDispatchTaskReviewTarget` + `isTaskReviewBasisRef` | allow/deny 零差异（含缺事实、非法形状、额外 accepted/passed 事实） |

**documented 差异（契约明确项）**：

1. `chief → verifier` 且 `targetExists=false` / 缺省：旧硬授权对内置目标不读单独 `targetExists`（放行）；模块按冻结契约 §3.1「宿主核验、缺省 false ⇒ 拒绝」拒绝（`target-card-missing`）。
2. `convener → verifier` 且 `targetKind="project"`、`targetExists=true`：旧函数以 `targetBuiltIn=false + exists=true` 放行；模块 fail-closed（`target-kind-mismatch`，内置 id 不能作项目角色 id）。
3. 同上且 `targetExists=false`：旧函数返回 `target-card-missing`；模块先判 kind 一致性返回 `target-kind-mismatch`（同为拒绝，code 不同）。
4. 缺省 `sourceRoleId`：旧函数签名无法表达（类型要求 `fromRoleId:string`）；模块 fail-closed `unknown-source`（与旧函数运行期等价拒绝路径一致，fixture 标 `module-only`）。

其余 `module-only` 负例：非 verifier 目标 → `target-not-verifier`（本模块只覆盖向 verifier 的派发）。

## 五、测试与静态门

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 模块测试 + 差分 | `node --test "test/roles/verifier/**/*.test.ts"` | **23 tests / 23 pass / 0 fail / 0 skipped / 0 todo**（unit 15 + differential 8；duration ≈127ms） |
| 全仓 typecheck | `npm run typecheck` | verifier 文件 **0 error**；收工期间全仓仍有**并发其他角色**未完成文件产生的错误（先后观察到 `test/roles/convener/convener-differential.test.ts` TS7022、`test/roles/rapporteur/differential.test.ts` TS2769/TS2345），均不在本角色写集；不修改他人写集来「修绿」 |
| verifier 作用域 typecheck | `npx tsc --ignoreConfig --noEmit ... src/common/roles/verifier/index.ts test/roles/verifier/*.test.ts test/roles/verifier/fixtures/*.ts`（与根 tsconfig 同编译选项） | **exit 0** |
| 契约未漂移 | 差分测试内 SHA-256 断言 | `067e3d2e…` 一致 |

测试覆盖要点：数据/能力位/卡种冻结；tools 空声明（trio/single）；dispatch 允许/拒绝/self/缺 source/缺 existence/非 verifier 目标；preflight 只覆盖 review、缺事实/非法 target/非法 criteria/额外验收事实不改变结果；context 两段静态模板/单 trio 一致；输入不被修改；重复调用结构一致；模块根单文件；依赖方向扫描；唯一导出。

## 六、写集 / import / 依赖扫描

- **写集**（本角色实际写入，全部为新增文件）：
  - `src/common/roles/verifier/index.ts`
  - `test/roles/verifier/{verifier-module.test.ts, verifier-differential.test.ts, fixtures/verifier-differential.fixtures.ts}`
  - `角色卡/verifier-code/{api-spec.md, memo.md, feature-map.md, functional-description.md, docs/change/2026-11-07_E1_verifier-module-evidence.md}`
- 未写：`src/common/门禁引擎/`、`src/model/`、`src/common/shared/`、`src/common/gates/`、`src/pipeline/`、`src/service/`、`src/provider/`、`app/`、其他角色模块/测试；未写角色卡/边界/YAML/changelog。
  - mtime 证据：`角色卡/verifier-code/{role-card.md,boundary.md,boundary.yaml,changelog.md}` 保持 H1 原始时间（12:53–12:54），本角色交付均在 17:08 之后；`git status` 仅显示本角色路径的新增（`??`）。
  - 注：`src/common/roles/`、`test/roles/` 下同时存在其他五角色**并发**产生的目录/文件（chief/convener/nominator/product/rapporteur）；本角色未创建/修改它们，扫描只按 verifier 路径取证。
- **import 扫描**（模块源码）：仅 `../../../model/boundary.ts`（type）、`../../../model/role.ts`（type）、`../../../model/runtime.ts`（纯形状 guard）；无 `node:`、无动态 import、无 `门禁引擎`/`pipeline`/`service`/`provider`/`app`/`common/gates`/其他角色 import。
- **单入口**：模块根 `readdirSync` = `["index.ts"]`；源码恰一条 `export const verifierRoleModule`。

## 七、B1 E1.1–E1.7 自检（本角色范围）

| B1 | 自检 | 证据 |
| --- | --- | --- |
| E1.1 只写 Section 1 写集、上岗前只读接收冻结契约 | 是；写集扫描见 §六；契约开工/收工哈希一致 | §一、§六 |
| E1.2 greenfield 新目录/新文件 | 是（`src/common/roles/verifier/`、`test/roles/verifier/` 全新） | §二 |
| E1.3 旧代码冻结、新逻辑只进新模块 | 未改旧引擎/Model/shared/gates；旧实现只读对照 | §六 |
| E1.4 唯一 public entry `index.ts`、模块根不散放 | 是（测试断言） | §五、§六 |
| E1.5 零跨角色 import、不 import 引擎/门控/共享外的越界层、无环 | 模块只 import Model；其他角色零 import | §六 |
| E1.6 不重复实现；角色模块只提供数据/纯策略；public entry 变更走评审 | 形状复用 Model guard；未改契约/共享 API；无接口变更 | §三、§四 |
| E1.7 每角色交付：public entry + 单测 + 差分 + 依赖扫描 + 候选哈希 + api-spec + 报告 | 全部提供 | §二、§四、§五、§六 |

## 八、遗留 / 限制

1. **E2 接线未做**（按闸门）：`governance-roles.ts` 内联规格改 import 本模块、`run-role.ts` verifier 卡种/默认卡数据、桌面 review/acceptance 呈现数据、门面 `builtInRoleModules` 装配——均属 X-R5/E2，不在 E1。
2. **4 条 documented 差异**（§四）需在 E2 切换前由接口评审确认接受；若评审要求与旧行为逐字一致，应先改冻结契约再改模块/fixture，不得单方改模块。
3. **i18n**：`messageKey` 目前是稳定内部诊断键；对外呈现前需由 shared-code/i18n owner 按接口评审登记，本角色不写共享 i18n。
4. **全仓 typecheck** 受并发其他角色文件影响（收工期间观察到 convener/rapporteur 的未完成测试文件错误）；已用 verifier 作用域 tsc 复核 exit 0。不得通过修改他人写集来「修绿」。
5. 未提交/推送；未跑真实模型；未判验收。

## 九、E2 P5 修复（2026-11-07）：未登记事实键 ⇒ deny

### 9.1 任务与输入

- 任务：E2 接口评审 **P5（X-R5 前置）**——verifier `preflight` 未拒绝未登记事实键，违反 E0.3 §3.4/D4「只允许读取 `api-spec.md` 登记的键；缺键/未知/类型不符 ⇒ deny」。
- 评审依据（只读）：
  - `docs/scheduling/2026-11-07_review_E2-interface_runtime-gate-role-module.md`（56 行 / `00bac588477cb11767bc114a83a3f9a6dea94a5dcdcbf237c9f1a02d6088abc0`）§一 P5；
  - `角色卡/门禁引擎/docs/change/2026-11-07_E2_interface-review_gate-engine.md`（334 行 / `9732baec59fca5d9bca59990242db59e258189fd407ea19f48f76073f626b9f9`）§2 第 10 项、§3 D-VER-1、§5 P5：实测合法 `reviewTarget`/`criteria` + `{accepted:true,passed:true,approved:true,smuggledDecision:"accept"}` 仍 `allow:true`。
  - E0.3 契约（只读、未漂移）：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（685 行 / `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`）§3.4 事实包规则 / §10.2 D4。

### 9.2 变更

1. `src/common/roles/verifier/index.ts`
   - 新增登记键常量 `REVIEW_FACT_KEYS = ["reviewTarget", "criteria"]`。
   - `reviewFactsDecision` 首先做 `Object.keys(facts)` 白名单：任何未登记顶层键 ⇒ deny；稳定码 **`review-facts-unknown-key`**，messageKey `role.verifier.preflight.reviewFactsUnknownKey`，`details = { action: "review", unknownKeys: <稳定排序的键名> }`。
   - 判定顺序：非普通对象 →（`preflight.checkAction` 既有）→ **未登记键** → 缺键 → `reviewTarget` 形状 → `criteria` 形状。未登记键先于缺键/形状，模块不读取其值。
   - 已登记键输入路径（合法 allow、缺键 `review-facts-missing`、形状错误 `review-target-invalid`/`review-criteria-invalid`）逻辑未改；纯策略、无 I/O、不修改调用方输入。
   - 唯一 public entry 导出、模块数据、tools/dispatch/context 均未改。
2. `test/roles/verifier/fixtures/verifier-differential.fixtures.ts`
   - review preflight fixture 增加差分口径 `zero | documented`；新增 7 条 P5 `documented` 负例：合法形状 + `accepted/passed`（值 false/true 均 deny）、`accepted/passed/approved`（评审实测输入）、`smuggledDecision`、非法形状 + 未登记键（未知键先行）、缺 `reviewTarget` + 未登记键（未知键先行）、值为 `undefined` 的未登记键、只有未登记键。
   - 保留 17 条只含登记键的 `zero` fixture（合法 sha1/sha256、缺键、空 facts、各形状错误、`facts=null`），用于证明既有 allow/deny 行为不变。
3. `test/roles/verifier/verifier-module.test.ts`
   - 新增「任何未登记事实键 ⇒ deny」：逐键负例、评审 D-VER-1 实测四键（`accepted/passed/approved/smuggledDecision`）、`undefined` 值、未登记键先于缺键/形状、`unknownKeys` 排序稳定、已登记键合法仍 allow。
   - 新增「未登记键拒绝不修改调用方事实包」。
4. `test/roles/verifier/verifier-differential.test.ts`
   - review preflight 差分拆为 `zero`（17 条，与旧 Model 形状 oracle allow/deny 零差异 + 既有 code 断言）与 `documented`（7 条，模块一律 `review-facts-unknown-key`；其中 4 条旧形状 oracle 会放行，证明「更严」差异真实存在）。
   - 「模块不读取验收结论键值」测试改为：同一合法形状下 `accepted:false` 与 `accepted:true/passed:true/approved:true` 均因未登记键 deny（值不改变判定），且 `details.unknownKeys` 稳定排序；形状非法 + 验收自报仍 deny。
5. `角色卡/verifier-code/api-spec.md`：§5 登记键表补事实包白名单、判定表补 `review-facts-unknown-key` 行、更新「不实现/不读取」措辞；§8 更新测试计数与差分结论；状态/版本更新为 `verifier-module/v1.1`。
6. `角色卡/verifier-code/memo.md`：状态与关键决策 2 同步 P5 语义（未登记键一律 deny，不得回退为忽略）。

### 9.3 测试与静态门（收工复跑）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| verifier 套件 | `node --test "test/roles/verifier/**/*.test.ts"` | **26 tests / 26 pass / 0 fail / 0 skip / 0 todo**（unit 17 + differential 9；duration ≈138ms） |
| 未知键负例 | 上述套件内 | D-VER-1 实测四键 `accepted/passed/approved/smuggledDecision` + 合法形状 ⇒ deny `review-facts-unknown-key`；单独 `accepted`/`passed`/`approved`/`smuggledDecision`/任意未登记键/`undefined` 值均 deny；未登记键优先于缺键与形状；`unknownKeys` 排序稳定 |
| 既有行为不变 | `zero` fixture（17 条） | 只含 `reviewTarget`/`criteria` 的合法输入仍 allow；缺键仍 `review-facts-missing`；`reviewTarget` 形状错误仍 `review-target-invalid`；`criteria` 形状错误仍 `review-criteria-invalid`；与旧 Model 形状 oracle allow/deny 零差异 |
| 全仓 typecheck | `npm run typecheck`（`tsc --noEmit`） | **exit 0**（收工复跑无输出错误） |
| 契约未漂移 | 差分测试内 SHA-256 断言 | `067e3d2e…` 一致 |

### 9.4 写后哈希（P5 修复后）

> §二为 E1 交付时点哈希（历史记录）；下表为 P5 修复后的当前值。

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `src/common/roles/verifier/index.ts` | 409 | `bbc5c258f6d58571859dd4f9ed357fb013fc4e79c4702e6b2c4e8523a21407f0` |
| `test/roles/verifier/verifier-module.test.ts` | 371 | `f734ee6cf6301100dbf83dc43cda7e1d02eb0c0639e78c2e6fdfa36f81a9aa21` |
| `test/roles/verifier/verifier-differential.test.ts` | 259 | `a38fbcf7044c1d2603154e10327595c950acb75cd3ff60347bee1051c8ac0b45` |
| `test/roles/verifier/fixtures/verifier-differential.fixtures.ts` | 386 | `ac62af9a58318dcc9d0791c54736e440d9cd1c8921d6ea62a3abc6d45ad057ca` |
| `角色卡/verifier-code/api-spec.md` | 132 | `1c9d4cc4450460e6553068e906f68abd7621c8b9f4dfb1a389bce7b0e31ac3a8` |
| `角色卡/verifier-code/memo.md` | 34 | `be7321c50619eed4cf840fd2db918488fd216aa6a233b393df91abb7f5813310` |

本证据文件自身不列入哈希（写后复算会变化）。

### 9.5 写集与遗留

- 写集内实际修改：`src/common/roles/verifier/index.ts`、`test/roles/verifier/`（3 文件）、`角色卡/verifier-code/{api-spec.md,memo.md,docs/change/2026-11-07_E1_verifier-module-evidence.md}`。`git status --short` 在写集内只显示三个未跟踪目录（`?? src/common/roles/verifier/`、`?? test/roles/verifier/`、`?? 角色卡/verifier-code/`），本角色未提交/推送。
- 未触碰：`角色卡/verifier-code/{role-card.md,boundary.md,boundary.yaml,changelog.md}`、旧引擎/Model/shared/gates/其他角色/`docs/scheduling|acceptance|communication|planning`。
- 遗留：P5 修复不判验收；E2 X-R5 切换（`governance-roles.ts` 改 import 模块、Service/桌面 review 接线）仍按闸门由后续单元执行；`role.verifier.preflight.reviewFactsUnknownKey` 仍是内部诊断 messageKey，若对外呈现由 shared-code/i18n owner 登记。

## 十、E2 X-R5 fixture 金样化（2026-11-07，verifier-code）

### 10.1 触发与结果

- 触发：E2 X-R5 已把 verifier 规格迁入模块门面（`src/common/门禁引擎/governance-roles.ts`
  595 行 / `70315a80d47881308e6a7f7983bb0f133eceb53f4d971bb502f147d9b1ce7fa5`；
  `specOf(verifierRoleModule)` 零复制投影）。`test/roles/verifier/verifier-differential.test.ts`
  的规格用例退化为模块自比较（仍 26/26 绿，但不再提供独立物证；见 E2-XR5 证据
  `7c798ccf9d822b5190fa607ba6c8bea8ea3d662ec0aa2e6ee4ed8f01c54fd141` §6.4/§8.6）。
- 处置：按 E2 检查单 **G9**（先冻结金样：场景输入 + 期望输出 + 来源候选 + hash；禁止删断言/
  整文件），参照 rapporteur 先例 `test/roles/rapporteur/oracle-fixture.ts`
  （`21c0220a8bc58eb0ef0e50d8169d4cdfa3a14253576a6c9ddf4f5e9cc0100c1b`）与 convener 先例
  `test/roles/convener/oracle-fixture.ts`
  （`998f372f39ba47488f6232c7e8598b4c497b9716fe7ff57b0501a7c83230bc28`）。
- 结果：**29 tests / 29 pass / 0 fail / 0 skip / 0 todo**（金样化前 26 例：模块单测 17 + 差分 9；
  金样化后模块单测 17 + 差分 12 = 29）。差分矩阵 64 项比较与 6 项 `KNOWN_DELTAS` 全部保留；
  冻结载荷 `payloadSha256 = 3c4e7a3aaf4a8ceb980145be4622000e6ec2462c7be85fa2f264da10ab9920c0`。

### 10.2 改动点

| 文件 | 变更 |
| --- | --- |
| `test/roles/verifier/oracle-fixture.ts` | **新增**（1,440 行）：冻结金样 `ORACLE_VERIFIER_SPEC`（8 字段 + 卡文本身份）/ `ORACLE_ROLE_TOOL_CATALOG`（D1 14 项）/ `ORACLE_TOOLS_DECLARATION`（trio/single 空声明 + 捕获期校验）/ `ORACLE_DISPATCH_CASES`（15 = zero 9 + documented 4 + module-only 2）/ `ORACLE_PREFLIGHT_CASES`（24 = zero 17 + documented 7 P5）/ `KNOWN_DELTAS`（6）+ `ORACLE_GOLDEN_PAYLOAD` + `ORACLE_GOLDEN_META`（来源候选 7 文件 / 切换后实测 / 模块身份 / 捕获期复核 `captureChecks` / 计数 / 覆盖映射 / `payloadSha256`）；纯数据，只 type-import Model。 |
| `test/roles/verifier/verifier-differential.test.ts` | 259 → **499 行**：改为纯金样对照（不再 import `governance-roles`/`role-tool-registry`/`workflow-preconditions`/`model/runtime` 等旧 oracle，不读取旧引擎字节；仅以 `readFile` 读 E0.3 冻结契约做哈希断言）；矩阵/断言不弱化；zero 用例逐例校验「金样旧观测 == 模块期望」，documented 用例逐例校验差异方向，新增 module-only 差分用例与 provenance（元数据/计数/覆盖/载荷哈希/无旧依赖扫描）。 |
| `test/roles/verifier/verifier-module.test.ts` | 371 → **376 行**：夹具 import 改为 `./oracle-fixture.ts`（`ORACLE_DISPATCH_CASES`/`ORACLE_PREFLIGHT_CASES`/`validReviewFacts`），字段名对齐 `expected*`；新增「cards ∈ Model `GOVERNANCE_CARD_KINDS` 闭集」断言（自差分测试迁入，无覆盖丢失）。单测 17 项不变。 |
| `test/roles/verifier/fixtures/verifier-differential.fixtures.ts` | 386 行 → **删除**：15 条 dispatch + 24 条 review preflight + `validReviewFacts` 已 **1:1 迁入** `oracle-fixture.ts`（迁移前逐项交叉核对：名称/输入 JSON/期望 allow/code/report/差分口径/`undefined` 键保留全部一致；矩阵与断言不丢失），避免双份期望值漂移。 |
| `角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_golden-capture.mjs` | **新增**（1,124 行）：一次性捕获脚本（`--out` 写 capture JSON；`--emit-fixture` 重新生成 fixture；含 spec/D2 投影/旧卡文本逐字节复核、zero/documented/module-only 自校验、payload SHA-256 计算）。 |
| `角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_golden-capture.json` | **新增**（1,351 行）：捕获期原始数据（spec/catalog/declaration/15 dispatch/24 preflight/KNOWN_DELTAS/counts/来源身份）。 |
| `角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_verifier-tests.log` | **新增**（39 行）：测试原始输出（exit 0）。 |
| `角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_typecheck.log` | **新增**（6 行）：全仓 typecheck 原始输出（exit 0）。 |
| `角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_verifier-scoped-typecheck.log` | **新增**（0 行，空输出）：verifier 作用域 tsc（模块 + 两测试 + 金样）exit 0。 |
| `角色卡/verifier-code/api-spec.md` | §8 更新：差分 12 项、金样路径/内容、29/29 计数、证据 §十。 |
| `角色卡/verifier-code/memo.md` | 状态更新为 29/29；旧 oracle 段改为历史捕获锚点；续接线索补「金样重取须同步 `payloadSha256` 并登记」。 |

**来源候选**：

- 捕获期（E1，2026-11-07）：`governance-roles.ts` 794 / `fddda111…`、`run-role.ts` 3333 /
  `026f5e99…`、`role-tool-registry.ts` 157 / `9aca72a5…`、`workflow-preconditions.ts` 1609 /
  `6c2349a5…`（以上见本证据 §一）；`model/runtime.ts` 3945 / `368559b7…` 与 E0.3 契约 685 /
  `067e3d2e…` 为金样化复核实测（E1 证据未记录 runtime.ts 哈希）；`model/role.ts` 409 /
  `d5e550a0…`（§一）。
- 切换后（X-R5）：`governance-roles.ts` 595 / `70315a80…`（E2-XR5 证据 §7.1）；
  `run-role.ts` **3566 / `b63defa415283df23e82e8a77f7fef05f157a77b4bbe087948abb592a4c3b873`**
  （金样化实测；X-R5 证据 §1 记录为 3546 / `f454d18e…`，之后并发编排单元继续修改，故前移；
  X-R5 未改本文件）；`workflow-preconditions.ts` 1687 /
  `480e0e7effa7b8120f44e478673dbe0b5ca4fbdbfcf026f4238c0b73724a7ffc`（E1 后由并发单元修改，
  非 X-R5，仅记录、不参与期望值）；`role-tool-registry.ts`、`model/runtime.ts`、`model/role.ts`、
  E0.3 契约与捕获期**逐字节一致**。
- 说明：X-R5 后 `governanceRoleOf("verifier")` 已由 `specOf(verifierRoleModule)` 派生，捕获脚本的
  旧注册表复核属模块自比较；**独立物证仍是本证据 §四（E1 编辑前捕获）与 X-R5 证据 §5**。
  本轮只做期望值冻结，不宣称新的独立再验。

### 10.3 差分矩阵/断言未弱化

- 保留：规格 8 字段（id/displayName/function/entries/preauthorizedDirs/forbiddenWritePaths/
  capabilities/cards）+ 卡文本 sha256/长度/行数；cards 与 D8 无 legacy token；D1 14 项 catalog
  均不含 verifier + trio/single 空声明；dispatch 15 例（zero 9 / documented 4 / module-only 2）；
  review preflight 24 例（zero 17 / documented 7）、P5 未登记键负例与「旧 oracle 会放行 4 例」
  计数；`KNOWN_DELTAS` 6 类；合计 **64 项比较**（`ORACLE_GOLDEN_META.counts.fixtureComparisons`）。
- 强化：dispatch zero 用例逐例校验「金样旧观测（allow/code/report）== 模块期望」，documented
  用例逐例校验差异方向与类别；module-only 用例由模块单测提升为差分测试显式覆盖；
  provenance 增加载荷 SHA-256、capture/switch 身份交叉核对、计数/覆盖映射、旧引擎 import/读取扫描。
- 捕获期复核：`ORACLE_GOLDEN_META.captureChecks` 记录冻结前执行的
  `oldSpecFieldsEqual` / `oldCardTextByteEqual` / `d2ProjectionEqual` / `oldRunRoleCardsEqual` /
  `toolsDeclarationValid`（任一不符即 throw，不生成 fixture）；差分 provenance 逐项断言。
- **D2 投影**：旧差分曾比较 `builtInRoleModuleDataOf("verifier")`；X-R5 后该投影由模块派生
  （自比较），其绑定改由门禁引擎 X-R5 契约测试
  （`test/门禁引擎/role-module-contract.test.ts`）与 E2-XR5 证据 §5（`zeroCopyBinding=true`）覆盖；
  本差分仍逐字段覆盖投影涉及的 card/capabilities 数据，且按 G9 移除旧门面 import。无覆盖删除。
- **cards 闭集**：Model `GOVERNANCE_CARD_KINDS` 成员断言迁入模块单测；差分测试保留金样 cards
  精确值与 D8 负例。
- **tools 校验**：旧 `validateRoleToolDeclaration("verifier", [])` 的捕获输出（allow/tools/reasons）
  冻结在 fixture；引擎侧 live 校验仍由门禁契约测试覆盖，本模块声明仍按 trio/single 逐项断言为空。

### 10.4 测试与静态门（收工复跑）

| 检查 | 命令 | 结果 | 原始日志 |
| --- | --- | --- | --- |
| verifier 套件 | `node --test "test/roles/verifier/*.test.ts"` | **29 tests / 29 pass / 0 fail / 0 skip / 0 todo**（exit 0） | `2026-11-07_E2-XR5_verifier-tests.log` 39 行 / `797b424892a353b82542b7add19065a4da04fa630b43477543c86d898ee9d117` |
| 全仓 typecheck | `npm run typecheck`（`tsc --noEmit`） | **exit 0**（无输出错误；收尾时并发 Service 单元短暂引入写集外错误，等待其完成后复跑恢复） | `2026-11-07_E2-XR5_typecheck.log` 6 行 / `399953ddb11ce7a95479bf43d321483d7cfafedf8235bad122bf1a989f7d9210` |
| verifier 作用域 typecheck | `npx tsc --ignoreConfig --noEmit ...`（模块 + 两测试 + 金样；与根 tsconfig 同编译选项） | **exit 0**（空输出） | `2026-11-07_E2-XR5_verifier-scoped-typecheck.log` 0 行 / `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| 契约未漂移 | 差分测试内 E0.3 SHA-256 断言 | `067e3d2e…` 一致 | — |
| 金样自洽 | 差分测试 provenance | payload SHA-256 = `3c4e7a3a…`；capture/switch 身份与计数一致 | — |

### 10.5 写后哈希（金样化后现行值）

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `src/common/roles/verifier/index.ts` | 409 | `bbc5c258f6d58571859dd4f9ed357fb013fc4e79c4702e6b2c4e8523a21407f0`（未改） |
| `test/roles/verifier/oracle-fixture.ts` | 1,440 | `0e684a163b08356cff5e36aeb29d0fa1aa02f09c85ddd71e44054d97beed59a1` |
| `test/roles/verifier/verifier-differential.test.ts` | 499 | `083fc8fb68d0d707db6a61e7bdf1094c0043ed788a219dbafa01523e18319d09` |
| `test/roles/verifier/verifier-module.test.ts` | 376 | `8ce3e20d1f483353a8ed03b99bd849e71d848af3da610523b87100d1a0e3135c` |
| `角色卡/verifier-code/api-spec.md` | 132 | `ee51e3fbd401451ff623901d389e4161728530e3654400217121dae0d881e6f8` |
| `角色卡/verifier-code/memo.md` | 34 | `d303defe6a38b8cd2dce0e486cb00a9304a8535e964e2fc28507153b25e63097` |
| `角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_golden-capture.mjs` | 1,124 | `ca3468668fed45dc36995e6b892259713419627803da065c1755f23457175b1d` |
| `角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_golden-capture.json` | 1,351 | `8829ad5c74007a9e6c72265339870a92935a6adbc0bb8857d3fe45829af09808` |
| `角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_verifier-tests.log` | 39 | `797b424892a353b82542b7add19065a4da04fa630b43477543c86d898ee9d117` |
| `角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_typecheck.log` | 6 | `399953ddb11ce7a95479bf43d321483d7cfafedf8235bad122bf1a989f7d9210` |
| `角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_verifier-scoped-typecheck.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`（空） |
| `test/roles/verifier/fixtures/verifier-differential.fixtures.ts` | 386 | 已删除（P5 时点哈希见 §9.4 `ac62af9a…`；内容 1:1 迁入金样） |

本证据文件自身不列入哈希（写后复算会变化；新 sha256 由完成报告给出）。

### 10.6 写集与遗留

- `git status --short -- src/common/roles/verifier test/roles/verifier 角色卡/verifier-code` 仅显示
  三个未跟踪根（`?? src/common/roles/verifier/`、`?? test/roles/verifier/`、
  `?? 角色卡/verifier-code/`）；`git diff` 为空；未提交/推送。
- 未触碰：`角色卡/verifier-code/{role-card.md,boundary.md,boundary.yaml,changelog.md}`、
  旧引擎/Model/shared/gates/其他角色、`docs/scheduling|acceptance|communication|planning`。
- 遗留（不阻塞本单元出口）：
  1. **X-R5 S2–S4 未做**：`run-role.ts` acceptance 卡种/默认卡数据/工具注入、Service review 路由/
     preflight 接线、桌面 review/acceptance 呈现仍属编排 / Service / 桌面单元。
  2. `run-role.ts::TRIO_CARD_KINDS.verifier` 仍保留为回退/迁移前源码 oracle；本金样已冻结
     `["acceptance"]`，编排 S2 删除/切换后差分仍可运行。
  3. D2 投影（`BUILT_IN_ROLE_MODULE_DATA`/`builtInRoleModuleDataOf`）保留至 X-R6 收口；绑定由
     门禁 X-R5 测试覆盖。
  4. **并发快照**：`run-role.ts` / `workflow-preconditions.ts` 在 X-R5 证据后仍被其他单元修改；
     本证据记录的是金样化时点实测哈希（见 §10.2），不参与期望值。若后续行为/矩阵变化，须重取
     金样并同步 `payloadSha256`，在 §10 登记。
  5. i18n：`role.verifier.*` 仍为内部诊断 messageKey，对外呈现由 shared-code/i18n owner 登记。
  6. 未提交/推送；未跑真实模型；不判验收、不判 E2 pass。
