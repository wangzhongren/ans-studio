# E1 chief 角色模块证据（greenfield）

- 日期：2026-11-07；角色：chief-code（幕僚代码维护角色，固定 worker 上下文）。
- 任务：E1 greenfield 开发 chief 角色模块（团队计划 §4.4①/§7.4，B1 E1.1–E1.7）。
- 契约输入：E0.3 `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（685 行 / 54561 bytes / SHA-256 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`，冻结记录 `docs/scheduling/2026-11-07_contract-freeze_runtime-gate-role-module.md` 映射已判 E0.2 `798ce9ce…`）。
- 状态：**implemented-unverified**；不判验收、不切换消费者、不提交/推送/暂存；旧引擎仍是 E2 前权威/oracle。

## 1. 交付文件与 SHA-256

候选实现集（13 文件；聚合 = 逐文件 `sha256` 行按路径排序后的 `sha256sum`）：

**候选聚合：`56f8c7e92b2bd787f4057f20c1a74601c232f5e070606cc668c39bed1f5edb1e`**（13 文件）

| 行数 | 文件 | SHA-256 |
| --- | --- | --- |
| 33 | `src/common/roles/chief/index.ts` | `0dd59c0ed6afdf838c40d94058e3f8ce4e0a37002374392dac1ec1a466929ddb` |
| 32 | `src/common/roles/chief/internal/card-text.ts` | `a606bf30b98f6b635fd9009d24e19840a58c27d595be27eb3179aed34fcd509b` |
| 61 | `src/common/roles/chief/internal/codes.ts` | `2c84fa8848cc4968b3b83a4bb9fe593c5dd261831fbfd13f5dac2721ac43221a` |
| 52 | `src/common/roles/chief/internal/context.ts` | `0c953ff685c7fea7c6b59e0f08b2bee83dcba5848921a8a78727dc0bc5fe6900` |
| 139 | `src/common/roles/chief/internal/dispatch.ts` | `75dc78f2fff9ffede576d6fde1f0af19b88d64e4810bb2649823fef4e8b393f6` |
| 47 | `src/common/roles/chief/internal/intent-confirm.ts` | `9da9f31523fce4badcf81158411a7e69ea8f637d6052e98abab26a7659dccdc5` |
| 32 | `src/common/roles/chief/internal/module.ts` | `f4543a681e8f2cfcb86cf56755b3e87393d4ecf134d81ef5dec684951a718164` |
| 142 | `src/common/roles/chief/internal/preflight.ts` | `4e21c9a2b0b0a5cd43ad5a4deb486c101387766858768c2d1bdd8f43f062a8a4` |
| 72 | `src/common/roles/chief/internal/spec.ts` | `4495b9600aa5a3b8f8f5481c19be6e7fc28c09fabce2468bf64cbfad9d46738c` |
| 72 | `src/common/roles/chief/internal/tools.ts` | `9cc3743fdb87ab04aadedf6dfafe7825910bba88ef8586b11a12b87b2bde7cdd` |
| 314 | `test/roles/chief/differential.test.ts` | `94c3f0e3eddd9ed2ce406be6fc9de877de1519af2982af671da79f1337c268cd` |
| 120 | `test/roles/chief/imports.test.ts` | `ddde7ede389c8387fc85d2311507effb67cc9debd570901d350bca19f7456def` |
| 385 | `test/roles/chief/module.test.ts` | `bdf61ff49d195794c1f032f051a32d9029eb94d7eacd7b136d726812acc2c0a2` |

文档：

| 行数 | 文件 | SHA-256 |
| --- | --- | --- |
| 160 | `角色卡/chief-code/api-spec.md` | `320c09d603eb57d2a297d302a156df6fb76542dba3741bfc9d8599e8fda0d2f5` |
| 15 | `角色卡/chief-code/memo.md` | `31584799be1d24f019810caa962a31c230d63b2fa6baf8785bafe9c0ea0200b5` |
| — | 本文件 | 自哈希不可嵌入；最终回复给出（本文件不参与代码候选聚合） |

## 2. 数据来源（只读 oracle，file:line）

| 数据 | 来源 |
| --- | --- |
| chief 规格（id/displayName/function/cardText/entries/preauthorized/forbidden/capabilities） | `src/common/门禁引擎/governance-roles.ts:166-178`（卡文本）、`:313-358`（规格项） |
| 卡种 `TRIO_CARD_KINDS.chief = ["intent-confirm"]` | `src/pipeline/orchestration/run-role.ts:2859-2880`（chief 行 `:2864`） |
| 5 个工具注入门控 | `src/pipeline/orchestration/run-role.ts:1697-1699`、`:1704`、`:1705` + `:2344-2346` |
| `RoleToolId` 允许集/映射 | `src/common/门禁引擎/role-tool-registry.ts:52-67`（14 项）；契约 E0.3 §3.1 表 |
| 派发硬授权（五内置/自派/项目 worker） | `src/common/编排/workflow-preconditions.ts:1510-1517`（allowlist）、`:1530-1573`（谓词） |
| 报告期望 | `src/common/编排/workflow-preconditions.ts:1596-1603`（`reportTargetForTaskCreator`） |
| hub 路由/目标/工作源 | `src/service/trunk/impl/apply-journal.ts:2923-2926`；`src/model/runtime.ts:1211`（`TASK_HUB_ROUTING`） |
| 版本决策请求形状 | `src/common/编排/version-decision.ts:70-126`（`validateVersionDecisionRequest`）；`src/provider/runtime/schema.ts:1527-1580` |
| 版本决策上下文（pinned/多 run/pending） | `src/common/编排/version-decision.ts:129-*`（`validateVersionDecisionContext`） |
| chief-workflow 资源 | `src/provider/runtime/tools.ts:167-183`（`loadBuiltinChiefWorkflow`）；资源文件 `src/common/门禁引擎/workflows/chief/chief-workflow.md` |
| intent-confirm 卡 | `src/model/runtime.ts:780-788`、`:837-865`；`src/provider/runtime/schema.ts:521-556`；`run-role.ts:2864`、`:2808-2825` |
| 共享意图入口契约段 | `src/common/shared/intent-entry-contract.ts`（E0.3 §4.2 列明角色模块为消费者） |

模块源码不 import 上述任何引擎文件；oracle 只在 `test/roles/chief/differential.test.ts` 中 **test-only 只读 import/源码 fixture**。

## 3. 差分方法与结果

方法：
1. **直接 oracle import**：`governanceRoleOf("chief")`（规格数据）、`ROLE_TOOL_CATALOG`/`validateRoleToolDeclaration`（工具允许集/映射）、`evaluateDispatchAuthorization`/`reportTargetForTaskCreator`（派发/报告）、`validateVersionDecisionRequest`（preflight 请求形状）、`loadBuiltinChiefWorkflow`（资源 path/version/sha256）。
2. **源码 fixture**（私有符号不可 import）：`run-role.ts` 的 `TRIO_CARD_KINDS`/5 个工具门控/`canRequestVersionDecision`/`closeCreatedTask` 门控；`apply-journal.ts` 的 hub 目标集——按逐字子串断言（换行归一化），结构变化即测试红。
3. 逐字段 `deepEqual`/逐字 `equal`；判定型输出比较 `allow`/`reportToRoleId`。

结果（13 个差分测试全 pass）：

| 差分项 | 结果 |
| --- | --- |
| card text / entries / preauthorizedDirs / forbiddenWritePaths / capabilities / displayName / function | **差异 0**（逐字段/逐字） |
| cards（含 D8 无 legacy `write`） | **差异 0**（源码 fixture） |
| 5 个工具 id：D1 允许集/映射名、run-role 门控 | **差异 0**（允许集内；见下方差异④说明范围） |
| dispatch：chief 来源 + `targetExists:true`（5 内置/自派/闭集外/项目目标） | **差异 0** |
| 报告期望（允许时 back to chief） | **差异 0**（`reportTargetForTaskCreator`） |
| preflight：请求形状子集（12 例） | **差异 0** |
| chief-workflow 资源 path/version/sha256 | **差异 0**（宿主 loader 实测） |
| hub 目标五内置 | **差异 0**（apply-journal 源码 fixture） |

列明方案差异（4 项，均在测试与 api-spec 显式记录）：

1. **`targetExists` fail-closed 收紧**：`RoleDispatchPolicyInput` 契约要求缺省 false ⇒ 拒绝；旧 `evaluateDispatchAuthorization` 对 chief→内置不读该字段。本模块在缺省/false 时 deny（测试 `差分（列明方案差异）：targetExists 缺省/false…`）。
2. **本模块只回答 chief 来源**：convener→project 在旧谓词允许，但 chief 模块以 `chief-dispatch-source-not-chief` 拒绝（来源身份由各自模块/引擎回答）。
3. **preflight 不复制最终校验**：`runId`/`refs` 的路径形状由宿主 `validateVersionDecisionRequest` 最终校验；本模块只查存在/类型/上限（E0.3 D4“不复制 Service 校验”）。
4. **`closeCreatedTask` / `decidePendingRequest` 不在本单元 `tools()`**：前者受 `directGovernance`（会话模式，`run-role.ts:1828`）约束、后者仅独立决策上下文（`role-tool-registry.ts:66` + `provider/runtime/tools.ts:4233`）；E0.3 Q2 保持 `TrustedToolPolicyInput` 最小，二者由引擎调用点判定。E2 接口评审可决定是否纳入模块声明。另：`single` 模型返回空工具集（Model 注释：single 不装配 trio 角色工具），旧 run-role 无此分支（chief 仅在 trio 存在）。**（已被 §9 E2 C-1 修复取代：`closeCreatedTask` 现纳入 trio 声明。）**

## 4. 测试与 typecheck

- `node --test "test/roles/chief/*.test.ts"` → **tests 41 / pass 41 / fail 0 / cancelled 0 / skipped 0**（module 24 + differential 13 + imports 4）。
- 隔离 typecheck（本模块 + 本测试，`tsc -p` 临时配置继承仓库 `tsconfig.json`，`include` 仅 chief 路径）→ **exit 0**。
- `npm run typecheck`（全仓）→ **exit 0（最终复跑）**。
  过程中曾观察到瞬时错误 `test/gates/module-graph.test.ts(98,14): error TS2339: Property 'isTypeOnly' does not exist on type 'ImportClause'`；该文件为**并发 gates-code 角色的未跟踪在途文件**（不属本角色写集，本上下文未修改），其后 gates-code 修复，2026-11-07 最终复跑全仓通过。
- 未运行全量测试套件：本单元未修改旧代码/其他目录；E1 出口要求为模块单测 + 差分（团队计划 §7.4）。未新增 skip/todo。

## 5. import / 纯策略扫描

`test/roles/chief/imports.test.ts`（4/4 pass）静态扫描模块源（`index.ts` + `internal/*.ts`）：

- 模块根仅 `index.ts`；内部实现仅在 `internal/`；外部只能经 index（E1.4）。
- 所有 import 均为相对路径；仅允许 `../../../../model/`、`../../../shared/`（shared public entry）与自身 `./internal/*.ts`；**无** `门禁引擎`/`pipeline`/`service`/`provider`/`app`/`gates`/`roles` import（E1.5、零跨角色）。
- 模块源无 `node:fs`/`node:crypto`/`node:path`/`Math.random`/`Date.now`/`new Date(`/`setTimeout`/`setInterval`/`process.`/`console.`/`fetch(` 等 token（纯数据/纯函数；注意：共享 `intent-entry-contract.ts` 自身含文件解析函数，但本模块只调用纯函数 `intentEntryContractText`，不在模块内执行 I/O）。
- 模块只返回普通数据/判定；不携带权限、token、租约或客户凭据。输入深冻结调用测试通过（无入参修改）。

## 6. 写集与旧代码冻结

- 本上下文 `git status --porcelain` 的角色写集仅：
  `?? src/common/roles/chief/`、`?? test/roles/chief/`、`?? 角色卡/chief-code/`。
- 未写旧引擎：`src/common/门禁引擎/governance-roles.ts`（`fddda111…`）、`src/common/门禁引擎/role-tool-registry.ts`（`9aca72a5…`）、`src/model/role.ts`（`d5e550a0…`）哈希与 E0 冻结记录一致；`run-role.ts`/`apply-journal.ts`/`provider/runtime/{tools,schema}.ts`/`workflow-preconditions.ts`/`version-decision.ts`/`chief-workflow.md` 均无工作树改动（`git status` 无输出）。
- 未提交/未推送/未暂存；未运行真实模型；未改依赖/构建/权限配置。

## 7. B1 E1 出口自检映射（不判验收）

| 条目 | 本单元证据 |
| --- | --- |
| E1.1 上岗/写集 | 写集扫描 §6；只写自身模块/测试/文档 |
| E1.2 greenfield | `src/common/roles/chief/`、`test/roles/chief/` 为新目录新文件 |
| E1.4 唯一 public entry | `imports.test.ts`：模块根仅 `index.ts`，外部只经 index |
| E1.5 零跨角色/无越界 import | `imports.test.ts` 静态扫描通过 |
| E1.7 模块交付 | public entry 按契约；单测 + 差分；依赖扫描；候选哈希（§1）；`api-spec.md` 更新；完成报告 |
| E1.3（旧代码冻结） | 旧引擎只读、无改动（§6）；新逻辑只进本模块 |
| E1.6（不重复） | 意图入口文本复用 shared public entry；模块仅数据/纯策略；无第二实现（旧内联规格按 D2 留待 E2 删除） |

## 8. 遗留 / 风险 / 披露

1. **全仓 typecheck 最终通过**：最终复跑 exit 0。过程中 `test/gates/module-graph.test.ts(98,14)`（gates-code 在途未跟踪文件）曾报 TS2339，由 gates-code 自行修复；本角色未改该文件。
2. `CHIEF_WORKFLOW_RESOURCE.sha256` 是数据 pin（当前资源 `9bef5626…`，8724 bytes）；资源字节变化须同步刷新，否则 differential 测试红。E1 接口评审可细化“应用资源根”loader 语义。
3. i18n messageKey 目前是稳定内部键（未登记 locales）；E2 若对外呈现需登记。
4. `tools()` 的 5-id 范围为 E1 任务卡口径；`closeCreatedTask`/`decidePendingRequest` 的模块归属待 E2 接口评审（当前由引擎调用点判定，注册表允许集未变）。**（已被 §9 E2 C-1 修复取代：`closeCreatedTask` 已补入；`decidePendingRequest` 仍不声明。）**
5. 旧引擎在 E2 切换前仍为权威；本模块未接任何消费者，未做真实模型/桌面运行；差分只覆盖 oracle 可判面。
6. 并发角色在共享 worktree 写其他新根（`src/common/gates/`、`test/gates/` 等）；本上下文只读未触碰，哈希/状态如实记录。

## 9. E2 C-1 修复（2026-11-07）：trio 工具集补入 closeCreatedTask

- **依据**：E2 接口评审处置记录 `docs/scheduling/2026-11-07_review_E2-interface_runtime-gate-role-module.md`（57 行 / SHA-256 `00bac588477cb11767bc114a83a3f9a6dea94a5dcdcbf237c9f1a02d6088abc0`）§一 C-1 与 §二 X-R6：chief `tools()` 只声明 5 个 `RoleToolId`，旧 `run-role.ts:1828` 在 `directGovernance` 下为 trio chief 注入 `close_created_task`；按模块 `tools()` 驱动装配会丢该工具。处置：chief-code 补入 `CHIEF_TOOL_IDS`；`decidePendingRequest` 保持引擎独立决策上下文。
- **状态**：implemented-unverified；不判验收、不切换消费者、不提交/推送/暂存。

### 9.1 修改点

| 文件 | 修改 |
| --- | --- |
| `src/common/roles/chief/internal/tools.ts` | `CHIEF_TOOL_IDS` 追加 `closeCreatedTask`（5→6；顺序 = 旧注入顺序，directGovernance 项在后）；更新门控来源注释（`run-role.ts:1694-1705`、`:1824`、`:1828`）与 `tools()` 语义 |
| `src/common/roles/chief/index.ts` | 导出注释 5→6 |
| `test/roles/chief/module.test.ts` | trio 断言 6 id（含 `closeCreatedTask`）；显式断言 `decidePendingRequest` 不在普通会话声明 |
| `test/roles/chief/differential.test.ts` | D1 校验 6/6 + 映射名 `close_created_task`；源码 fixture 增加 `directGovernance` 定义与 closeCreatedTask 门控；C-1 处置测试改写（`decidePendingRequest` 仍不声明） |
| `角色卡/chief-code/api-spec.md` | 工具表/导出表/差分摘要/遗留同步 |
| `角色卡/chief-code/memo.md` | 续接记录 |

### 9.2 工具集前后

| governanceModel | 修复前 | 修复后 |
| --- | --- | --- |
| `trio` | 5：`roleActivityLog`、`terminateRoleRun`、`redispatchTask`、`projectNote`、`requestVersionDecision` | **6**：上述 5 + `closeCreatedTask` |
| `single` | `[]` + `chief-tools-single-model` | 不变 |
| 未知/缺失 | `[]` + `chief-tools-governance-model-unknown` | 不变 |

- `decidePendingRequest` 维持不声明（注册表 `chiefIndependentDecisionOnly`；由 `buildChiefDecisionTools` 独立决策上下文装配）。
- 模块只声明**允许集**；`directGovernance`（`trio && builtInGovernance && isTrio && chiefDecisionContext === undefined`）属会话模式事实，仍由注入层在真实注入时判定（E0.3 Q2 不扩 `TrustedToolPolicyInput`）。E2 X-R6 接线须保留该判定。

### 9.3 差分与验证

| 项 | 结果 |
| --- | --- |
| D1 装配校验 `validateRoleToolDeclaration("chief", CHIEF_TOOL_IDS)` | `allow: true`；6/6 映射名含 `close_created_task`；`reasons` 0 |
| 旧 run-role 门控源码 fixture | 4 个 `trioSpec?.id === "chief"` 门控 + `requestVersionDecision`/`canRequestVersionDecision` + `directGovernance` 定义 + closeCreatedTask 门控逐字命中；`CHIEF_TOOL_IDS` 与旧注入顺序一致 |
| `decidePendingRequest` | 注册表 `chiefIndependentDecisionOnly: true`；不在 `CHIEF_TOOL_IDS`；`buildChiefDecisionTools` fixture 命中 |
| 其余 7 个 catalog id | 允许角色均不含 chief（模块未声明，越权 fail-closed） |
| single / 未知模型 | 空集断言保持 |
| 测试 | `node --test "test/roles/chief/**/*.test.ts"` → **tests 41 / pass 41 / fail 0 / cancelled 0 / skipped 0**（与修复前同计数；更新既有断言，未新增/删除用例） |
| 隔离 typecheck（本模块 + 本测试） | exit 0 |
| `npm run typecheck`（全仓） | **最终复跑 exit 0**。首次复跑曾报 `test/roles/verifier/verifier-differential.test.ts(220,16): error TS2304: Cannot find name 'validReviewFacts'`——该文件为并发 verifier-code 的未跟踪在途文件（不属本写集，本上下文未修改），其修复后全仓通过 |

### 9.4 候选文件 SHA-256（修复后，13 文件）

**候选聚合：`5a1c3e28cffcca3490c4ebd32f816ef2ce041441a8abc8f8eb48901d37bc9b11`**（逐文件 `sha256sum` 行按路径排序后取 `sha256sum`）

| 行数 | 文件 | SHA-256 |
| --- | --- | --- |
| 33 | `src/common/roles/chief/index.ts` | `f3e022b5cb40efea836e6ae379279b4b1f5565680befd349bc4fb1eb2a81a4cd` |
| 32 | `src/common/roles/chief/internal/card-text.ts` | `a606bf30b98f6b635fd9009d24e19840a58c27d595be27eb3179aed34fcd509b`（未变） |
| 61 | `src/common/roles/chief/internal/codes.ts` | `2c84fa8848cc4968b3b83a4bb9fe593c5dd261831fbfd13f5dac2721ac43221a`（未变） |
| 52 | `src/common/roles/chief/internal/context.ts` | `0c953ff685c7fea7c6b59e0f08b2bee83dcba5848921a8a78727dc0bc5fe6900`（未变） |
| 139 | `src/common/roles/chief/internal/dispatch.ts` | `75dc78f2fff9ffede576d6fde1f0af19b88d64e4810bb2649823fef4e8b393f6`（未变） |
| 47 | `src/common/roles/chief/internal/intent-confirm.ts` | `9da9f31523fce4badcf81158411a7e69ea8f637d6052e98abab26a7659dccdc5`（未变） |
| 32 | `src/common/roles/chief/internal/module.ts` | `f4543a681e8f2cfcb86cf56755b3e87393d4ecf134d81ef5dec684951a718164`（未变） |
| 142 | `src/common/roles/chief/internal/preflight.ts` | `4e21c9a2b0b0a5cd43ad5a4deb486c101387766858768c2d1bdd8f43f062a8a4`（未变） |
| 72 | `src/common/roles/chief/internal/spec.ts` | `4495b9600aa5a3b8f8f5481c19be6e7fc28c09fabce2468bf64cbfad9d46738c`（未变） |
| 79 | `src/common/roles/chief/internal/tools.ts` | `ba81457ffea499fc4dc3bf7d2cd21525f8c0c19be593dfe02c262b8e38e5a665` |
| 332 | `test/roles/chief/differential.test.ts` | `279f1c259645fb383cdb45ff5eff006613b0fe37f700537da364028bf8e4e719` |
| 120 | `test/roles/chief/imports.test.ts` | `ddde7ede389c8387fc85d2311507effb67cc9debd570901d350bca19f7456def`（未变） |
| 388 | `test/roles/chief/module.test.ts` | `b704de271c359d71e097db595428348f3de75083a858bdd5b7ee6fae97c98506` |

文档：

| 行数 | 文件 | SHA-256 |
| --- | --- | --- |
| 160 | `角色卡/chief-code/api-spec.md` | `fdcdd0af290ac75f3adcd2ca6c2561cf6a8b4b72d7f476e3dc69a77510884d1d` |
| 22 | `角色卡/chief-code/memo.md` | `d191bece1002024b9e44edc726e92531ebf2ee0f6d4ed9711638dcaf2180704e` |
| — | 本文件 | 自哈希不可嵌入；最终回复给出（本文件不参与代码候选聚合） |

### 9.5 写集与 oracle 状态

- 本上下文写集仅 `src/common/roles/chief/`、`test/roles/chief/`、`角色卡/chief-code/`（`git status --porcelain` 三者均为 `??` 未跟踪目录，与 E1 交付一致；无其他路径由本上下文写入）。
- 只读 oracle 未由本上下文修改：`role-tool-registry.ts` `9aca72a5…`、`src/model/role.ts` `d5e550a0…`、`governance-roles.ts` `fddda111…` 与 E0 冻结哈希一致；`run-role.ts` 当前 `026f5e99…`（3333 行）仅作只读 oracle。
- 未提交/推送/暂存；未运行真实模型；未改依赖/构建/权限配置。

### 9.6 遗留

1. E2 X-R6 接线：模块 `tools()` 只给允许集；调用点必须保留 `directGovernance`（会话模式）判定后才真正注入 `close_created_task`。
2. `decidePendingRequest` 仍属 `buildChiefDecisionTools` 独立决策上下文调用点，不随普通会话声明。
3. 本修复不改变 E0.3 契约（`RoleToolId` 14 项与 chief 允许集未变）；未新增 id/字段。§3 列明差异④与 §8 遗留④已被本节取代。

## 10. E2 X-R6 fixture 金样化（2026-11-07）

- 依据：E2 检查单 G9（`角色卡/测试/docs/change/2026-11-07_E2_switch-gate-checklist.md` 885 行 /
  `ffa763fe049a6849e89963dd76512e20dfee521f576d9be080af72e0d2db4e9f` §11 G9：先冻结金样
  「场景输入 + 期望输出 + 来源候选 + hash」，再改 import；禁止删断言/整文件；记录覆盖映射）。
- 触发：X-R6 门面切换（`角色卡/门禁引擎/docs/change/2026-11-07_E2-XR6_gate-facade-chief-and-closure-evidence.md`
  308 行 / `6e85d384e4a2bdaba306188cee091a01860801708e0018256822cdd319e09332` §10.6）后，
  旧差分以 `governanceRoleOf("chief")` 为 oracle 的用例退化为模块自比较（41/41 仍绿但不再独立）。
- 先例：`test/roles/rapporteur/oracle-fixture.ts`（653 行 / `21c0220a8bc58eb0ef0e50d8169d4cdfa3a14253576a6c9ddf4f5e9cc0100c1b`）、
  `test/roles/convener/oracle-fixture.ts`（1634 行 / `998f372f39ba47488f6232c7e8598b4c497b9716fe7ff57b0501a7c83230bc28`）、
  `test/roles/verifier/oracle-fixture.ts`（1440 行 / `0e684a163b08356cff5e36aeb29d0fa1aa02f09c85ddd71e44054d97beed59a1`）。
- 状态：**implemented-unverified**；仅本模块写集；不提交/推送/暂存；未运行真实模型；不判验收。

### 10.1 金样产物（本单元新增/改写）

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `test/roles/chief/oracle-fixture.ts`（**新**，冻结金样） | 975 | `a6b1838e3fdd02b9c6df55a16ba3283555bd172f483f6e7cb0a899075a359660` |
| `test/roles/chief/differential.test.ts`（**改写**，纯金样对照） | 571 | `377cab9ed2e487d19913ebf3f3d570b79a2d0a3a0a63edda87070be0fd099bc7` |
| `角色卡/chief-code/docs/change/2026-11-07_E2-XR6_golden-capture.mjs`（一次性捕获工具） | 1098 | `f7f796e5e43e9af3f5a6aa8bfb7448911d0576da6a408c9fd6541d5dd1167555` |
| `角色卡/chief-code/docs/change/2026-11-07_E2-XR6_golden-capture.json`（捕获载荷/身份） | 856 | `b207917b9453a978f906552445d432e1c768d6a21bc425e6c577f8bfa7e9f9fe` |
| `角色卡/chief-code/docs/change/2026-11-07_E2-XR6_chief-tests.log` | 50 | `2b0ccf4c37690c81fd039e8a941a5eee4b95b830f733078797e8618e8289edf7` |
| `角色卡/chief-code/docs/change/2026-11-07_E2-XR6_chief-typecheck.log` | 4 | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` |
| 本文件（新 §10） | — | 自哈希不可嵌入；完成报告给出 |

**冻结载荷哈希（`ORACLE_GOLDEN_PAYLOAD`）**：
`fb4557b8a579e6f8358cc2c0ae468823118bcdb94b760a68998818b8ddd9ea25`。
测试断言 `sha256(JSON.stringify(ORACLE_GOLDEN_PAYLOAD))` 与元数据一致；改动任一期望值必须同步更新
元数据并在本证据登记（不得删断言/删矩阵/整文件替换）。

### 10.2 冻结内容（场景输入 + 期望输出 + 来源候选 + hash）

| 面 | 冻结值 | 来源（捕获期） |
| --- | --- | --- |
| 规格 8 字段 | `id=chief` / `displayName=幕僚` / `function=chief` / 1 条 `docs/intents/` 条目 / `preauthorizedDirs=["docs/intents/"]` / 11 项禁写 / capabilities 七字段 / `cards=["intent-confirm"]` | E1 §3（编辑前 `governanceRoleOf("chief")` 逐字段 0 差异）；X-R6 §7 切换后 0 差异 |
| 卡文本 | 1680 字符 / 22 行 / SHA-256 `bdca98f9ee0d7875d0d9812107a2565af897a5a37b4987c7256294da6381935f` | E1 卡文本逐字节；X-R6 §7 前后一致 |
| tools | D1 `ROLE_TOOL_CATALOG` 14 项（chief 允许 7 项）；chief 6-id 声明 = `roleActivityLog/terminateRoleRun/redispatchTask/projectNote/requestVersionDecision/closeCreatedTask`；旧 `validateRoleToolDeclaration` 捕获 `allow:true` / 6 绑定 / `reasons:[]`；映射名 `role_activity_log…close_created_task` | E1 §9 + E2 C-1；run-role 注入门控 6 条逐字锚点（历史，不依赖现行行号） |
| `closeCreatedTask` / `decidePendingRequest` | 前者纳入声明（chief/convener 共享，非独立决策上下文）；后者 `chiefIndependentDecisionOnly:true` 且不在声明内（`buildChiefDecisionTools` 独立上下文） | E2 C-1；注册表 14 项捕获 |
| dispatch | 11 例：zero 8（五内置允许 + 自派 `self-dispatch` + 闭集外 `target-card-missing` + 项目目标 `chief-to-project-forbidden`）+ documented 3（`targetExists=false/缺省` 2 例；`convener→worker-a` 来源归属 1 例） | 旧 `evaluateDispatchAuthorization` / `reportTargetForTaskCreator` 捕获 |
| preflight（version-decision） | 14 例：zero 12（请求形状子集：正例 3 + 缺键/非法值/超限 9）+ documented 2（非法 runId / 绝对路径 ref：宿主最终校验仍拒绝，preflight 只做前置） | 旧 `validateVersionDecisionRequest` 捕获 |
| context 资源 | `src/common/门禁引擎/workflows/chief/chief-workflow.md`；version `chief-workflow/v1`；SHA-256 `9bef5626c8e9d2d72487567d2d93366f05c178cfa23288add8a13b64e4b4f346`；8724 bytes | 宿主 `loadBuiltinChiefWorkflow()` 捕获（path suffix 校验） |
| hub 数据 | routing `chief-hub-v1` / source `chief` / report `chief` / purpose `builtin-preparation` / schema `repository-work-source/v1` / 目标五内置（product/rapporteur/nominator/convener/verifier） | `CHIEF_HUB_DISPATCH` + `apply-journal.ts` 目标/routing/from 源字符串捕获（历史锚点） |

**来源身份（捕获期 / 切换后实测）**：元数据 `ORACLE_GOLDEN_META` 记录 11 个 capture 身份与
8 个 unchanged / 3 个 changed 切换身份：

- E1 捕获期：`governance-roles.ts` 794 行 / `fddda111…`；`run-role.ts` 3333 行 / `026f5e99…`；
  `role-tool-registry.ts` 157 行 / `9aca72a5…`；`workflow-preconditions.ts` 1609 行 / `6c2349a5…`；
  `model/role.ts` 409 行 / `d5e550a0…`；E0.3 契约 685 行 / `067e3d2e…`。
- 金样化实测：`version-decision.ts` 514 行 / `133778f8…`；`apply-journal.ts` 3791 行 / `84532a96…`；
  `provider/runtime/tools.ts` 5330 行 / `fdf7a44e…`；`model/runtime.ts` 3945 行 / `368559b7…`；
  chief-workflow 资源 61 行 / `9bef5626…`。
- 切换后 changed：`governance-roles.ts` 457 行 / `6eafcf3a…`（X-R6）；`run-role.ts` 3554 行 /
  `493fd4ed…`（X-R1 起编排单元，非 X-R6）；`workflow-preconditions.ts` 1687 行 / `480e0e7e…`
  （E1 后并发单元，非 X-R6）。其余 8 文件逐字节 unchanged。

### 10.3 差分测试改写（不依赖旧文件结构/行号）

- **移除**旧引擎 live 依赖：`governanceRoleOf`、`ROLE_TOOL_CATALOG`/`roleToolCatalogEntryOf`/
  `validateRoleToolDeclaration`、`evaluateDispatchAuthorization`/`reportTargetForTaskCreator`、
  `validateVersionDecisionRequest`、`loadBuiltinChiefWorkflow`，以及 `run-role.ts`/`apply-journal.ts`
  的 `readFileSync` 源码 fixture。测试与 fixture 均不 import/读取旧引擎；旧实现删除后差分仍可运行
  （provenance 测试静态扫描 import，fixture 纯数据且无 `node:fs`/`readFileSync`）。
- **保留**全部差分矩阵与断言（数量不弱化，另加 1 个 provenance 用例）：
  - 规格 8 字段逐项 JSON 比较 + 卡文本 sha256/长度/行数；
  - cards 金样 + D8 无 legacy `write`；
  - tools：6-id 声明逐项同序、旧 D1 校验映射名 6/6、catalog 14 项越权负例、
    `closeCreatedTask`（C-1）与 `decidePendingRequest`（不声明）双断言；
  - dispatch 8 zero + 3 documented：allow 位 / 稳定码 / `reportToRoleId` / 拒绝 messageKey 前缀，
    documented 差异真实存在且登记在 `KNOWN_DELTAS`；
  - preflight 12 zero + 2 documented：allow 位 / 稳定码 / messageKey 前缀 / details 可序列化；
  - context 资源 path/version/sha256/bytes；hub 数据 routing/source/report/purpose/schema/五内置；
  - E0 契约哈希断言保留（只读契约，非旧引擎）。
- **自比较说明**：X-R6 后 `governanceRoleOf("chief") === specOf(chiefRoleModule)`（零复制投影）；
  金样化脚本在冻结前仍逐字段复核（0 差异），但独立物证是 E1 §3（编辑前捕获）与 X-R6 §7
  （切换后差分 0 / 零复制绑定），不把自比较当作独立证据。

### 10.4 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| chief 套件 | `node --test "test/roles/chief/*.test.ts"` | **tests 42 / pass 42 / fail 0 / cancelled 0 / skipped 0 / todo 0**（module 24 + differential 14 + imports 4；原 41 = 24+13+4，差分重写为 14 例） |
| 类型检查 | `npm run typecheck` | **exit 0** |

未新增 skip/todo；未运行全量套件（本单元只改 chief 测试/证据与新增 fixture；模块源码未改）。

### 10.5 写集与 status

- `git status --porcelain` 本角色写集仅：`?? src/common/roles/chief/`、`?? test/roles/chief/`、
  `?? 角色卡/chief-code/`（三者均为 E1 起的未跟踪目录；本单元只在其内新增/改写文件）。
- **未改**：旧引擎（`governance-roles.ts` / `run-role.ts` / `role-tool-registry.ts` /
  `workflow-preconditions.ts` / `version-decision.ts` / `apply-journal.ts` / `provider/runtime/tools.ts`）、
  `src/model/**`、`src/common/shared/**`、`src/common/gates/**`、其他角色模块、其他角色卡、
  `docs/scheduling|acceptance|communication|planning`。旧引擎仅被捕获脚本在捕获期只读导入/读取。
- 模块源码 10 文件哈希与 §9.4 **逐字节一致**（`src/common/roles/chief/index.ts` `f3e022b5…` 等）；
  `test/roles/chief/module.test.ts`（388 行 / `b704de27…`）与 `imports.test.ts`（120 行 /
  `ddde7ede…`）未改。
- 未提交/推送/暂存；未运行真实模型；不判验收、不判 E2 pass。

### 10.6 遗留

1. **历史锚点不再由测试复核**：`ORACLE_RUN_ROLE_TOOL_GATES`、`ORACLE_CHIEF_HUB_DISPATCH` 的源字符串
   anchor 只在捕获脚本运行期校验（旧文件仍在时）；测试运行期不读取。编排 S2 删除
   `TRIO_CARD_KINDS.chief` / provider loader 迁移后，差分无需改动。
2. **资源字节维护**：`CHIEF_WORKFLOW_RESOURCE.sha256`（当前 `9bef5626…` / 8724 bytes）变化时，
   须同步刷新模块常量与金样 `ORACLE_CHIEF_WORKFLOW_RESOURCE`，并重算 `payloadSha256`（E1 §8.2）。
3. **i18n**：`role.chief.*` messageKey 仍未登记 locales（§8.3）；本单元未消费 messageKey。
4. **E2 消费者接线**：`tools()` 只声明允许集，`directGovernance` 会话模式仍由注入层判定；
   `decidePendingRequest` 仍归 `buildChiefDecisionTools` 独立上下文（§9.6）。
5. 本单元未引入新依赖/构建/权限配置变更；E2 收口/验收判定不在本单元。
