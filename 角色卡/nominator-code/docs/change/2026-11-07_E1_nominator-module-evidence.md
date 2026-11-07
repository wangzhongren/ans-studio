# E1：nominator 角色模块证据（greenfield）

- 日期：2026-11-07；角色：nominator-code（人事代码维护角色）；状态：**implemented-unverified**。
- 未判验收、未 commit/push、未跑真实模型；旧引擎在 E2 切换前仍是权威 oracle。
- 工作目录：`.claude/worktrees/trunk-amendment`（分支 `feat/plan-escalation-card`）。

## 1. 输入（已核对）

| 输入 | 路径 | 行数 / SHA-256 |
| --- | --- | --- |
| E0.3 冻结契约 | `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` | 685 / `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3` |
| 团队计划 | `docs/scheduling/2026-11-07_team-plan_runtime-gate-role-modularization.md` | 687 / `00e1f76b6a527a1237ac1467bb4100805750606904ce6960bb56a013a4ba565c` |
| B1 验收标准 | `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md` | 273 / `a999dc1961c9ebe4727f0796d6baefd24a23e75b1a6cc1d215a9c0e2f63b4999` |

契约锚点核对：`sha256sum docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` 输出 `067e3d2e…c1b3`，与派单/冻结契约一致；§3.1（`BuiltInRoleModule` + 14 `RoleToolId` + R-1/R-2）、§3.2 nominator 行、§3.3 纯数据/纯策略、§3.4 preflight 归属、§3.5 错误语义、§7 基线、§10 D1/D9/D10、§11/§11.1 已只读核对。

## 2. 交付与候选哈希

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `src/common/roles/nominator/index.ts`（唯一 public entry） | 835 | `b346df668436bf38b2a5b6187e200a58f9bd1752e715be1a4d84d7c81730a44f` |
| `test/roles/nominator/nominator-module.test.ts` | 519 | `39f0bffca17035272bff9400342dedf5ef15895f2fb1e842783560124214552f` |
| `test/roles/nominator/nominator-differential.test.ts` | 531 | `328730537db81e0eb1404e53fc15d7670230b35e0b988011b6de7fbe91b51f57` |
| `test/roles/nominator/fixtures/nominator-fixtures.ts` | 227 | `78aacb4a39d7da00701e56ee01759b73e82dcc345e0b10ef10a2977ed0419274` |
| `角色卡/nominator-code/api-spec.md` | 204 | `9d07489bfa6c4508338bd9cac86a198a0cc246b3fb140a52cc8a12d31ea742fe` |
| `角色卡/nominator-code/memo.md` | 19 | `8368a4210e3eaa3ca5c1022d4ccce1213e14931337132b4d30fa8a62d1101ce0` |
| `角色卡/nominator-code/feature-map.md` | 15 | `dc780051a0877dc2910845d41868854f3fade2030427bcf2a0f9333f53d71437` |
| `角色卡/nominator-code/functional-description.md` | 34 | `336b3c11d0bd4ede8708117c0657e8ef845ce8ff3a4bfb769b1854a6e09ccc5b` |

**候选聚合哈希**（四个代码/测试文件按上表顺序拼接后 SHA-256）：`4c7b55285299930b769ce80ff86a588d8b9d4424160953abe998eaec18ae7c2e`。

## 3. API 落地（按 E0.3）

- `nominatorRoleModule: BuiltInRoleModule`（named + default 同一对象）；`id/displayName/function/card/capabilities/cards` 与旧 `governance-roles.ts::governanceRoleOf("nominator")` 逐字段一致；卡文本内嵌共享 `intentEntryContractText("nominator")`（单一来源）。
- `tools()`：`trio` → `["activateRoleDocuments"]`；`single` → `[]`；运行期未知模型 → `[]` + `role-tools-model-unknown`。`tools().capabilities === spec.capabilities`（D10）。
- `dispatch()`：R-2 硬身份/存在性；`chief→nominator(built-in, exists)` 允许并返回 `reportToRoleId:"chief"`；self/unknown-source/convener-built-in/chief-to-project/target-missing/非本模块目标均 deny。
- `preflight.checkAction()`：仅 `appointment`；`stage: "d3-card" | "role-documents"`；事实键/错误码/i18n key 全表见 `api-spec.md`；缺键/未知键/类型不符 deny。未实现 `resolveWrite`、边界解析、stable-write、账本。
- `context()`：3 段静态文本（D3 卡、appointment-write 卡数据、报告期望），无资源引用、不读盘。

## 4. 差分结果（旧 oracle vs 模块）

测试命令：`node --test test/roles/nominator/nominator-module.test.ts test/roles/nominator/nominator-differential.test.ts`。

### 4.1 规格数据 — 差异 0

`id/displayName/function/card.text/card.entries/preauthorizedDirs/forbiddenWritePaths/capabilities` 与 `governanceRoleOf("nominator")` 逐字段 deep equal。`cards` 与 `run-role.ts::TRIO_CARD_KINDS.nominator` 的测试侧冻结副本 `["appointment","appointment-write"]` 一致；无 legacy `"write"`（D8）。

### 4.2 工具装配 — 差异 0

旧注入条件（`run-role.ts`）：`governanceModel === "trio" && builtInGovernance && isTrio && chiefDecisionContext === undefined && role.id === "nominator"`。nominator 会话恒为 builtIn/isTrio 且非 chief 决策上下文 ⇒ 仅治理模型决定：trio 注入 `activateRoleDocuments`，single 不注入。模块逐模型输出与旧条件一致。

### 4.3 派发硬授权 — in-scope 差异 0；2 条列明差异

与 `workflow-preconditions.ts::evaluateDispatchAuthorization` 对照：

| 用例 | 旧 code | 模块 code |
| --- | --- | --- |
| chief→nominator（built-in, exists=true） | allow | allow（reportToRoleId=chief） |
| nominator→nominator | `self-dispatch` | `self-dispatch` |
| product→nominator | `unknown-source` | `unknown-source` |
| convener→nominator（built-in） | `convener-target-forbidden` | `convener-target-forbidden` |
| chief→nominator（targetBuiltIn=false） | `chief-to-project-forbidden` | `chief-to-project-forbidden` |

**列明差异**：

1. 旧 oracle 对 `chief→built-in` 目标不读 `targetExists`；模块按 E0 §3.5 要求 `targetExists === true`，缺失时 `target-card-missing`（fail-closed）。
2. 旧 oracle 对 `chief→product` 可允许；模块只回答 nominator 相关派发，非 nominator 目标返回 `dispatch-not-in-module-scope`，由目标模块/引擎回答。

### 4.4 D3 决定卡 — 差异 0

与 `validateAppointmentCardAgainstRoster` 对照：合法选项、非多选、缺名单角色、多名单外角色、含内置角色 5 例 allow/deny 结论一致；名单未省略 env-bootstrap 但缺失时双方均拒绝。

### 4.5 三文档结构 — 差异 0

与 `validateRoleDocumentsSnapshot` 对照（真实 `CompleteSnapshot` 夹具，digest 按契约算法）：

| 场景 | 旧 oracle | 模块 |
| --- | --- | --- |
| 合法三文档 | ok | allow |
| boundary 条目越角色模块 | `boundary-outside-role-modules` | `appointment-boundary-scope-invalid` |
| boundary.md / yaml 不同步 | `boundary-md-yaml-mismatch` | `appointment-boundary-unsynchronized` |
| role-card 缺必填章节 | `role-card-section-missing:质量职责` | `appointment-role-card-sections-missing` |
| 非 canonical 路径 | `role-document-path-mismatch` | `appointment-document-invalid` |

### 4.6 Service 前置 — source-transcribed 对齐

`prepareRoleActivation` 是 Service 事务方法（非纯函数），无法直接调用；以下旧拒绝点逐条转录自 `src/service/trunk/impl/apply-journal.ts`，模块输出拒绝码与之对齐：无 D3 / D3 未选中 / D3 名单版本或 hash 漂移 / 计划未完成 / 目标未被计划分配 / 目标不在名单。详见差分测试最后一组用例。

## 5. 测试与静态检查

- 模块单测 + 差分：**22 tests / 22 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**（约 144 ms）。
- 契约回归（只读）：`node --test test/门禁引擎/role-module-contract.test.ts` → **14/14 pass**。
- 定向 TypeScript（模块 + 测试 + 夹具，`--ignoreConfig`，与仓 tsconfig 同 flags）→ **exit 0**。
- 全仓 `npx tsc --noEmit`：**exit 0**（收工时复跑；此前并行角色文件的临时错误已由各自 owner 收口，输出中无 `roles/nominator` 行）。
- 未跑真实模型（E1 非目标）。

## 6. 写集 / import / 模块图

- 模块根只有 `index.ts`（`find src/common/roles/nominator -type f` → 1 个文件）。
- 模块 import 白名单扫描：

  ```json
  {
    "file": "src/common/roles/nominator/index.ts",
    "imports": [
      "../../../model/boundary.ts",
      "../../../model/role.ts",
      "../../shared/intent-entry-contract.ts"
    ],
    "bad": []
  }
  ```

- 模块内无 `node:`/I/O import；无 `门禁引擎`/`pipeline`/`service`/`provider`/`app/`/`gates`/其他角色模块 import。
- 本角色写入仅：`src/common/roles/nominator/`、`test/roles/nominator/`、`角色卡/nominator-code/**`（§7）。未写旧引擎/Model/shared/gates/其他角色；未提交/推送。
- 并发说明：同一 worktree 有其他角色（chief/convener/product/rapporteur/verifier/gates）正在写各自写集；本证据只覆盖 nominator 写集，不把并发文件计入候选。

## 7. 约束核对

| 约束 | 结果 |
| --- | --- |
| 唯一 public entry `index.ts`，模块根无散放文件 | 通过 |
| 只依赖 `src/model/` + `src/common/shared/` public entry | 通过（import 扫描） |
| 角色模块之间零 import | 通过（模块无角色 import） |
| 纯数据/纯函数；无 I/O/账本/会话/时钟/随机数/可变状态 | 通过（代码审查；context 返回冻结常量，preflight 不写输入） |
| 缺事实/未知/类型不符 deny | 通过（单测负例） |
| 不实现 `resolveWrite`/边界解析/stable-write/账本 | 通过（模块无相关 import/实现） |
| 不携带权限 | 通过（返回 `RolePolicyDecision` + 报告期望；无 allowed/authorized/token 字段） |
| 卡/capabilities/cards 与旧规格一致（D8） | 通过（差分 4.1） |
| 不修改卡/边界/YAML/changelog | 通过（未写） |

## 8. 遗留与下一步

1. **i18n 登记**：`role.nominator.*` 与 `role.preflight.actionNotCovered` 的 messageKey 尚未登记 shared i18n（shared-code 写集）；E2 前由 shared-code/引擎统一登记。
2. **preflight 事实 producer**：E1 旧引擎冻结，Service/桌面尚未调用模块；E2 单元按 `api-spec.md` 事实表接线，保留 Service 最终校验。
3. **dispatch 消费点/语义**：E2 接口评审确认「目标模块 vs 来源模块」调用约定；本实现按与 nominator 相关 fail-closed，非 nominator 目标不越权回答。
4. **E2 切换**：门禁引擎门面 import 模块、删除旧内联 nominator 规格；`BuiltInRoleModuleMap` 装配；旧 `run-role.ts` 门控删除单元。
5. **全仓 typecheck/回归**：待并行角色收口后由统筹复跑；本节点只提供定向证据。

## 9. E2 D-1 修复（2026-11-07）

- 来源：`docs/scheduling/2026-11-07_review_E2-interface_runtime-gate-role-module.md` 行 24（D-1）；编排评估 `角色卡/编排/docs/change/2026-11-07_E2_interface-review_orchestration.md` §7.1。
- 问题：模块 preflight 将 `intentEntryConsistent` 列为**必需且须 `true`**（修复前 `src/common/roles/nominator/index.ts:347,385-395,750-755`），但旧 D3 卡/激活路径不校验意图入口一致性：`validateAppointmentCardAgainstRoster`（`workflow-preconditions.ts:1359-1405`）与 `prepareRoleActivation`（`apply-journal.ts:3090-3177`）均无该检查；`run-role.ts:1519` 的 `readIntentEntryFacts` 只服务 judge 上下文，解析失败不阻断发卡。按现状接线会在 E2 新增旧路径没有的拒绝条件，违反 B1 E2.2 零差异。
- 处置：**选择 (a)：可选/诊断**。不改 E0.3 冻结契约、不改 `RoleToolId`/Model/Service，不新增或扩大强制；模块行为与旧路径等价。

### 9.1 变更

1. `COMMON_REQUIRED_KEYS` 移除 `intentEntryConsistent`（`d3-card` / `role-documents` 两阶段均不再必填）。
2. 删除 `checkAction` 中 `record["intentEntryConsistent"] !== true ⇒ deny` 分支；`appointment-intent-entry-inconsistent` 不再产生。
3. 键仍保留在 `COMMON_FACT_KINDS`（`boolean`）：**提供时**仍按事实包通用纪律校验类型；缺失 / `false` / `true` 一律 `allow`（不据其值拒绝）。
4. 测试夹具默认不再提供该键（覆盖「缺失必须放行」）；单测/差分新增显式 `true` / `false` / 缺失用例。
5. `api-spec.md`：公共事实键表标为「可选；仅诊断/类型校验」，错误码表移除该拒绝码并注明 E2 D-1 停用。
6. 模块/差分测试文件头补 D-1 说明（旧路径不校验；模块降为可选诊断）。

### 9.2 行为等价（与旧路径）

| 阶段 | 旧路径 | 模块（修复后） |
| --- | --- | --- |
| `d3-card` | `validateAppointmentCardAgainstRoster` 不读取意图入口事实；合法卡 `ok:true` | 事实缺失 / `false` / `true` 均 `{ allow: true }` |
| `role-documents` | `prepareRoleActivation` 无意图入口一致性拒绝分支；`validateRoleDocumentsSnapshot` 亦不读取 | 事实缺失 / `false` / `true` 均 `{ allow: true }` |
| judge 上下文 | `run-role.ts:1519` 解析失败只写入 `intentResolutionError`，不阻断发卡 | 模块不复制该解析；解析与诊断仍由宿主保留 |

仅存的输入校验：提供该键时必须是 `boolean`；非布尔 → `appointment-facts-invalid`（事实包被篡改/接线错误的通用 fail-closed 纪律，不是意图入口强制；旧路径没有对应事实包）。

### 9.3 测试与静态检查（修复后复跑）

- `node --test "test/roles/nominator/**/*.test.ts"` → **25 tests / 25 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**（约 140–151 ms；修复前 22）。
- 新增用例：单测 1 组（缺失/`false`/`true` 均 allow；非布尔类型仍拒绝）；差分 2 条（D3 卡阶段对照 `validateAppointmentCardAgainstRoster`；激活阶段对照 `validateRoleDocumentsSnapshot` + `prepareRoleActivation` 无该拒绝点）。
- 全仓 `npm run typecheck` → **exit 0**（2026-11-07 收工复跑）。
- 未跑真实模型；未 commit/push；未判验收。

### 9.4 修复后哈希（本小节取代 §2 对应文件快照；§2 为修复前 E1 证据）

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `src/common/roles/nominator/index.ts` | 847 | `7426b00f8e413681a358702f7c506ae857278ae6fab585e2a261aa58bfe25025` |
| `test/roles/nominator/nominator-module.test.ts` | 541 | `dc4dcaddbfe8e7ef04681db80f2734dc7fac8e5a7477c553dae023bf288e5b6a` |
| `test/roles/nominator/nominator-differential.test.ts` | 572 | `6a9a59858f7c7bd9a52437a21c0c44bd41aee25fd54eb99897e327fd30c7ab34` |
| `test/roles/nominator/fixtures/nominator-fixtures.ts` | 234 | `2d8d856e7ade7465775d4ad5614a985e1b649c82bf5c0c4caf242528a08df153` |
| `角色卡/nominator-code/api-spec.md` | 208 | `30e192c4518bb7be6118bba4fadc10c63be6eeef9b5f825eb6960d8c6d04a7a6` |

**修复后四文件聚合哈希**（index.ts、module test、differential test、fixtures 按上表顺序拼接后 SHA-256）：`19573e170f2ebe651f4da89e0e9573fb67be9deccf4820827588fbc19096345c`。

### 9.5 遗留（本模块写集外）

1. **shared-code i18n 评审**：`角色卡/shared-code/docs/change/2026-11-07_E2_interface-review_role-i18n-keys.md` 第 14 行仍列 `role.nominator.preflight.intentEntryInconsistent`（条件）；修复后该键不再产生，由其 owner 在自身写集内决定移除或保留历史登记。本模块不依赖外部文案。
2. **X-R3 S4 解阻**：D-1 已按 (a) 处置，preflight 可进入 E2 差分接线；最终是否切换由编排/验收判定，本证据不判验收。
3. 未改旧引擎/Model/shared/gates/其他角色；未提交/推送；未跑真实模型。
