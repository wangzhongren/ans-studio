# E1 证据：门控模块 `src/common/gates/` greenfield + `test/gates/`（含 module-graph 扫描）

- 角色：gates-code（固定 worker；本文件只交证据，不判验收）。
- 任务节点：E1（团队计划 §4.4⑧/§7.4；B1 §3.3 E1.1–E1.7；E0.3 §5；P1.6 §4.4/§11.1）。
- 状态：**implemented-unverified**（未提交/未推送/未暂存；未运行真实模型；未改依赖/构建）。
- 候选：分支 `feat/plan-escalation-card`，HEAD `e71501cae7fc563b63c63944d45d0d3114ec18a5`，
  cwd `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；
  Node `v24.22.1` / npm `11.19.1` / Windows 11 Pro 10.0.26300（Git Bash）。
  `package.json` SHA-256 `51b63e730dc2678ed647d621db5e1a283ccfc0ef465c0543fc3ea5846b91400d`（未改）。
- 写集：`src/common/gates/`、`test/gates/`、`角色卡/gates-code/**`。未写 `trunk-runtime.ts`、`src/model/**`、
  `src/common/shared/`、角色模块、其他角色资料、`docs/scheduling|acceptance|communication|planning`。

## 1. 冻结输入（写盘/运行前复核哈希一致）

| 输入 | 实测 | 结果 |
| --- | --- | --- |
| E0.3 契约 `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` | 685 行 / `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3` | 一致（任务给定哈希） |
| P1-C 证据（含 Amendment-1）`角色卡/编排/docs/change/2026-11-07_P1-C_dispatch-parent-d-minimal-evidence.md` | 443 行 / `73c3cbb1e17b0dc3204d45b85473ecb85c1273d37b5e40d1052c2f65bf3d149a` | 一致 |
| B0 冻结脏基线 `角色卡/测试/docs/change/2026-11-07_runtime-gate-role-modularization-B0-baseline.md` | 910 行 / `135535055abfe2e4b4f3c4c34d207618272b98fe5b5cfefc7b23e70cec483101` | 一致 |
| P1.6 方案 `docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md` | 1242 行 / `241502075ff57d6534d7b2c807a2726f1a4c261381e3b0f968b6be468c64e9ce` | 一致 |
| 团队计划 `docs/scheduling/2026-11-07_team-plan_runtime-gate-role-modularization.md` | 687 行 / `00e1f76b6a527a1237ac1467bb4100805750606904ce6960bb56a013a4ba565c` | 一致 |
| B1 `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md` | 273 行 / `a999dc1961c9ebe4727f0796d6baefd24a23e75b1a6cc1d215a9c0e2f63b4999` | 一致 |
| P1 D-minimal oracle `src/pipeline/orchestration/trunk-runtime.ts`（只读） | 1,259 行 / `9453a43ff014acf74cf2106454ee6f069b257bbd2b4a68b7c56ff619ac1ffa24` | 与 P1-C Amendment-1 §A1.8 一致；本角色未改 |
| Model 输入（只读）`src/model/runtime.ts` / `src/model/role.ts` | 3,945 行 / `368559b75268df669f362406d785d5c3f04ca71994736fdfab181b34e019e9e5`；409 行 / `d5e550a06514b8a61fc66b517a267343ba95d8aa29050eb6ee3c7b7f9b5f8780` | 仅 type import；未改 |
| D1 只读 `src/common/门禁引擎/role-tool-registry.ts`（关联契约，非本模块依赖） | 未改动 | 本模块不 import 该文件 |

## 2. 改动文件（写集内；逐文件 SHA-256 / 行数）

| 文件 | 状态 | SHA-256 | 行数 |
| --- | --- | --- | --- |
| `src/common/gates/index.ts` | 新增 | `be7e1738656c0be57b0412557027a54aaa1fad03a294d5d28777e417f6cd97bc` | 253 |
| `test/gates/fixtures.ts` | 新增（夹具，非用例） | `bdeb863ee3cc960c087ff80a76ce9037092653bdfea76eeb0ca26cd61213dfaf` | 344 |
| `test/gates/dispatch-parent.test.ts` | 新增 | `abbaa100ddc5fc3ff1d3808f3435d368b466dd581bd972b79b212b5e4e54800e` | 310 |
| `test/gates/differential-trunk-runtime.test.ts` | 新增 | `f4c0fa72f27661868346e1af4b0830d4ad448a798e3c8afb6d748e3ecd220837` | 58 |
| `test/gates/api-contract.test.ts` | 新增 | `6cdcc15430fb6c07104ff2f9e0b63649ed8f5e7897556eaa0ddf60f0969c1df1` | 114 |
| `test/gates/module-graph.test.ts` | 新增 | `d4dad779b12b9a393ba14616ffb9aed2b61e5292437977d691c79182c34e28ad` | 334 |
| `角色卡/gates-code/api-spec.md` | 新增 | `c30d69f78edf375db1ba2765c3b908ae75de3ae383d17e4d4c3158f7af3d3a91` | 140 |
| `角色卡/gates-code/memo.md` | 新增 | `26986ffa70808930a97c51e2989ea7a233fb375b322d10d17e4a6b96628bece0` | 44 |
| `角色卡/gates-code/feature-map.md` | 新增 | `36420aa8f29a31d0e44816acebae9ef8c9588a28859955d2c2def1cb09533b31` | 23 |
| `角色卡/gates-code/functional-description.md` | 新增 | `8731d30e81cf7e31a45b5339bef31e978d0ed808f1c4f45b888ee253902d9fb3` | 42 |
| 本证据文件 | 新增 | 写盘后交付回复另记（无法自含自身哈希） | — |

**候选聚合（代码/测试）**：6 个文件（`src/common/gates/` 1 + `test/gates/` 5）。
算法：按 posix 相对路径排序，逐行 `"<path>\t<sha256(file)>"`（UTF-8，LF），对整段字节取 SHA-256。
实测：**`999f3b450814610f570238720d32d83af46c71cd8fa355fa6a9079419697aedd`**。
逐文件身份原样见 `03-file-identity.txt`。

写集外未改动：`src/pipeline/orchestration/trunk-runtime.ts`、`src/model/**`、`src/common/shared/**`、
`src/common/roles/**`（其他角色并行落地）、三适配器、`src/service/**`、`src/provider/**`、`src/common/门禁引擎/**`、
`package.json`/`tsconfig.json`/构建脚本、角色卡/边界/YAML/changelog、`docs/scheduling|acceptance|communication|planning`。

## 3. 模块 API（E0.3 §5.1 原样落地；唯一 public entry `index.ts`）

```ts
export interface DispatchParentHostFacts { parent: { roleId: "chief"; runtime: RuntimeKind; sessionId: string;
  turnId: string; clientMessageId?: string; kind?: string; inputAccepted: true; settled: false };
  creatorReports?: readonly { taskId: string; roleId: string; reportId: string; turnId: string }[]; }
export interface DispatchParentCoreFacts { disposed: boolean; construction: string; roleId?: string; runtime?: RuntimeKind;
  lifecycle?: RuntimeSessionLifecycleFacts; toolSurface?: RuntimeSessionToolSurfaceFacts;
  turnInput?: { turnId: string; provenance?: RuntimeInputProvenanceV1 }; }
export type DispatchParentReason = /* 18 项闭集，见 §4 */;
export type DispatchParentDecision = { ok: true } | { ok: false; reasons: readonly DispatchParentReason[] };
export function evaluateChiefDispatchParent(input: { host: DispatchParentHostFacts;
  core: DispatchParentCoreFacts | undefined; hub: boolean; }): DispatchParentDecision;
```

- 唯一 public entry：`src/common/gates/index.ts`；模块根只有该文件（`test/gates/module-graph.test.ts` 断言 + `07`/`05` 报告）。
- `lifecycle`/`toolSurface` 直接使用 Model 冻结类型（不复制第二套证据字段；E0.3 §5.4/D7）；`DispatchParentReason`
  为编译期闭集（helper 返回值均标注该类型，新增码会 typecheck 失败）。
- 模块头注释含**门 API 冻结声明**（输入/输出/reason/分支/消费边界）；冻结后变更走接口评审（E0.3 §4.4）。
- 只 import `../../model/runtime.ts` 的 type；无 I/O、无时钟、无随机数、无可变状态、不 import 角色/Service/Provider/Pipeline/`门禁引擎`。

## 4. 实现（与 P1 D-minimal 行为等价；只判定、不采集）

### 4.1 运行时四分支（E0.3 §5.2；P1.6 §4.4 F15）

| 运行时 | 分支 | 实现函数 |
| --- | --- | --- |
| `claude` / `pi` | 只走受限应用中介路径 | `restrictedApplicationMediationFailure` |
| `codex` | 先严格 native；严格不成立时 `observed + mediation verified` ⇒ 歧义拒绝；否则受限兜底；两段 reason 去重合并 | `strictNativeFailure` → N20 检查 → `restrictedApplicationMediationFailure` |
| `demo` | 只走严格路径（现状不变；受限路径拒绝 demo） | `strictNativeFailure` |
| 其它 | 拒绝 | `{ ok: false, reasons: ["wrong-runtime"] }` |

### 4.2 严格 native 路径（原条件逐字保留 + F15 guard）

`disposed` → `not-default-core` → `roleId !== "chief"`（`evidence-identity-mismatch`）→
`core.runtime !== parent.runtime`（`wrong-runtime`）→ `toolSurface?.status !== "observed"`（`tool-surface-unknown`）→
`sessionId` 不一致（`evidence-identity-mismatch`）→ `factoryProvenance === "custom-override"`（`custom-factory`）→
**`applicationMediation !== undefined`（`application-mediation-ambiguous`）** → 共享尾部。

### 4.3 受限应用中介路径（全条件；含 Codex 字面绑定）

runtime ∈ {claude,pi,codex} → 身份四条件（与严格路径单份实现）→ `status !== "unknown"`
（`observed + mediation verified` ⇒ `application-mediation-ambiguous`，否则 `tool-surface-unknown`）→
sessionId → `factoryProvenance === "default-production"`（否则 `custom-factory`）→
`nativeToolRegistry === "unknown"`（否则 `registry-mismatch`）→ mediation kind+verified（否则 `application-mediation-unverified`）→
mediation.runtime 一致（`evidence-identity-mismatch`）/ factory 映射/ reasons 为空（否则 `application-mediation-unverified`）→
`nativeBuiltinTools` 为空（否则 `native-builtin-present`）→ appTools/foreign 集合一致、active dispatch 工具名在 appTools（否则 `registry-mismatch`）→
**Codex 字面绑定** `native?.factory === "codex-chat" && native.nativeInstanceId === applicationMediation.nativeInstanceId`
（缺失/空串/不一致 ⇒ `evidence-identity-mismatch`；lifecycle native 在场时保留附加防御）→ 共享尾部。
共享尾部（turn/stop/activeDispatch/inputAccepted/settled/creatorReports/parent.kind）与严格路径**同一份**实现
（`dispatchParentTailFailure`），未复制第二份条件（D5/E3.8）。

### 4.4 reason 码（18 项闭集；只用于测试/诊断，对外回执仍 `trunk-verify-failed`）

`evidence-missing`、`disposed`、`not-default-core`、`evidence-identity-mismatch`、`wrong-runtime`、
`tool-surface-unknown`、`custom-factory`、`application-mediation-ambiguous`、`application-mediation-unverified`、
`native-builtin-present`、`registry-mismatch`、`turn-mismatch`、`stopped`、`no-active-dispatch`、
`input-not-accepted`、`turn-settled`、`creator-reports-mismatch`、`parent-kind-invalid`。

`test/gates/dispatch-parent.test.ts` 的「reason 闭集」用例遍历全部 134 个差分场景，
实测 18 项**全部可达且不产生闭集外取值**。

## 5. 差分（gates 模块 vs P1 D-minimal 内联实现；E2 前旧引擎为 oracle）

- 方式：`test/gates/differential-trunk-runtime.test.ts` **只读 import** `src/pipeline/orchestration/trunk-runtime.ts`
  的 `evaluateChiefDispatchParent` 作为 oracle；同一 fixture（`test/gates/fixtures.ts::differentialScenarios`）
  同时喂给两个实现，逐场景比较 `ok` 与 `reasons`（逐字段/逐 reason/顺序），`hub` 取 `true`/`false` 各一次。
- 覆盖：四个运行时分支、严格原条件单字段变异、受限全条件负例、双路径歧义、Codex 字面绑定
  （mismatch/missing/empty/lifecycle 缺席与不一致）、creatorReports 合法/非法、parent.kind、no-core、
  其它 runtime、受控 shell、外来 MCP。
- 结果：**scenarios=134 / comparisons=268 / differences=0**（exit 0；`04-differential-summary.txt`）。
  未列明差异：无。oracle 身份 `9453a43f…`（§1）。
- 边界：本差分只证明**判定层等价**；E2 切换后的双跑/回滚/删除清单归编排（团队计划 §7.5），本角色不写 `trunk-runtime.ts`。

## 6. 门正负例矩阵（P1.6 §11.1 / B1 §3.2 的判定层）

`test/gates/dispatch-parent.test.ts`：19 个用例全绿（`07-per-file-tests.txt`）。覆盖映射（只取证，不判验收）：

| P1.6/B1 条目 | 覆盖用例 |
| --- | --- |
| P3 Codex 严格路径原条件逐字保留 | 「严格路径原条件逐条保留」（10 条首败 reason + input/settled/turn）；差分严格场景零差异 |
| P4 `status unknown` + `nativeToolRegistry unknown` + kind + verified | 「P3/P4/P6/P7 判定层」三个运行时正例 |
| P5 单实现 + 两处复检 + controller resume | 「P5/hub」；结构守卫（唯一导出函数、模块根单入口） |
| P6 Codex 受控 shell / N16 | 「受控 shell」「Codex 先严格后受限」正例 + 严格仍 unknown 断言 |
| P7 Claude/Pi 外来 MCP | 「Claude/Pi 外来 MCP 精确枚举」正例 |
| P1/P2 | **不在本层**：真实 Claude/Pi 运行证据归 P1-RR/测试角色；本文件不伪造真实运行 |
| N1–N9 | 「严格路径原条件」+「其它 runtime/core 缺失」+「双路径歧义」 |
| N10–N14、N21–N23、N25、N27、N28 | 「受限路径逐条负例」+「Codex 字面绑定」+「Codex 配置外来 MCP」 |
| N13 | 「新应用中介路径拒绝 demo；demo 严格路径现状不变」 |
| N15 | 本模块不含写/初始化门符号；结构守卫断言 `inspectInitializationProtection` 不存在（写门实跑归对应 owner） |
| N17 | 「TOCTOU 两次复检」（同一判定对可变证据两次求值） |
| N18 | 「parent.kind 非 message ⇒ 拒绝」；creatorReports 分支优先 |
| N19 | 「creatorReports 数量/重复/角色/turn/reportId/origin/status 任一不匹配」 |
| N20 | 「observed + verified ⇒ 双路径歧义」 |
| N24 | 适配器「实际构造面 = 报告面」归适配器 owner；本层不伪造 |
| N26 | Claude/Pi 外来 MCP 正例 + foreign 漂移负例 |

## 7. 模块图扫描（`test/gates/module-graph.test.ts`；B1 E1.4/E1.5/E3.5；D9）

- 工具：仓内 `typescript@7.0.2`（devDependencies，**未新增依赖**）的 Compiler API：
  `typescript/unstable/sync`（`API.updateSnapshot` + `Project.program` + AST）与
  `typescript/unstable/ast/is`。TS 7 为原生编译器，传统 `ts.createSourceFile` 不再存在；
  本扫描使用其官方公开 unstable API（`updateSnapshot`），不 spawn 额外工具。脚本即测试文件，
  路径 `test/gates/module-graph.test.ts` / SHA-256 `d4dad779…`。
- 范围：`src/common/roles/**`（存在时）、`src/common/gates/**`、`src/common/shared/**`、`src/model/**`，
  以及引擎层 `src/pipeline/**`、`src/service/**`、`src/provider/**`、`src/common/门禁引擎/**`、
  `src/common/编排/**`、`src/common/runtime-core/**`、三个适配器、`src/common/装配/**`、`app/**`、`bin/**`。
- 解析：ImportDeclaration / ExportDeclaration / ImportTypeNode / dynamic `import()`；`import type`
  与全 type-only named specifier 记为 type-only 边（TS 7 `ImportClause.phaseModifier === SyntaxKind.TypeKeyword`）。
- 规则（违反即失败）：角色模块间零 import；角色不 import 门控/引擎/私有 common；门控不 import 角色/引擎；
  共享不 import 门/角色/引擎；Model 不 import 门/角色/引擎且禁止 Model→shared value import（type-only
  原语单列）；引擎只经 `index.ts` 消费角色/门控；模块层 value import 无环；type-only 环仅豁免 Model 内部（D9）。
- 实测（2026-11-07T09:12Z 快照；`01-gates-tests.log` / `05-module-graph-report.json`）：

| 项 | 结果 |
| --- | --- |
| 扫描文件 | 331（engine 270 / model 12 / shared 18 / gates 1 / roles 27 / other 3） |
| 解析 import/export 边 | 1,735 |
| 依赖方向违例 | **0** |
| value import 环 | **0** |
| type-only 环 | **1**：`src/model/role.ts ↔ src/model/runtime.ts`（D9 豁免，单列见下） |
| 唯一入口 | `src/common/gates/` 根 = `["index.ts"]`；角色模块根逐一 = `["index.ts"]`（chief/convener/nominator/product/rapporteur/verifier） |
| 引擎私有文件直引 | **0** |

- **D9 单列（Model→shared type-only 共享原语，新增须接口评审并更新清单）**：
  `src/model/download.ts -> src/common/shared/runtime-shared.ts`、
  `src/model/runtime.ts -> src/common/shared/diagnostics.ts`、
  `src/model/runtime.ts -> src/common/shared/runtime-shared.ts`；
  Model→shared **value import = 0**。
- **Model 内 type-only 豁免**：`role.ts ↔ runtime.ts` 互引在列（另有既有 `download.ts` 等 type-only 边，
  完整清单见 `05-module-graph-report.json::modelInternalTypeOnly`）；无 value 反向/环。
- 说明：扫描时 `src/common/roles/` 已由其他角色并行落地（六个模块，0 违例）；其内容归各 owner，
  本报告是 09:12Z 快照，最终候选需按 B1 §2.1/§5.2 重跑。

## 8. 测试计数与命令

| # | argv | 结果 |
| --- | --- | --- |
| 1 | `node --test --test-concurrency=1 "test/gates/**/*.test.ts"` | **29 tests / 29 pass / 0 fail / 0 skipped**；exit 0（`01-gates-tests.log`，98 行） |
| 2 | `node --test test/gates/api-contract.test.ts` | 3/3；exit 0 |
| 3 | `node --test test/gates/differential-trunk-runtime.test.ts` | 2/2；exit 0；`scenarios=134 comparisons=268 differences=0` |
| 4 | `node --test test/gates/dispatch-parent.test.ts` | 19/19；exit 0 |
| 5 | `node --test test/gates/module-graph.test.ts` | 5/5；exit 0 |
| 6 | `npm run typecheck`（全量） | **exit 0**（`02-typecheck-full.log` / `08-final-typecheck.log`）。开工期间一次运行（09:12:19Z）因并行角色在途文件 `test/roles/rapporteur/differential.test.ts`（写集外，09:12:04Z 写入）报 2 条 TS2769/TS2345；该文件由属主修复后重跑绿。**该次失败日志已被最终复跑覆盖、未保留原始字节**（失败摘要见本条与 §11 第 6 项） |
| 7 | `npx tsc --noEmit -p <temp>/tsconfig.gates.json`（extends 仓内 tsconfig；仅 include 本角色写集） | **exit 0**（`02-typecheck-scoped.log`） |
| 8 | 最终复跑：`node --test --test-concurrency=1 "test/gates/**/*.test.ts"` + `npm run typecheck` | **29/29 pass；typecheck exit 0**（`08-final-gates-tests.log` / `08-final-typecheck.log`；候选哈希未变） |

未运行：真实模型、桌面应用、Git 写操作（commit/push/stash）、依赖安装/构建。

## 9. 写集扫描与候选稳定性

- `git status --porcelain -- src/common/gates test/gates 角色卡/gates-code`（`06-write-set-status.txt`）：
  仅本角色三个路径（`?? src/common/gates/`、`?? test/gates/`、`?? 角色卡/gates-code/`）。
- 写集外无本角色写入；工作树中其他 `M`/`??` 条目为并行角色在途（含 `src/common/roles/**`、
  `test/roles/**`、`src/model/**` 等），本角色未触碰。
- 候选稳定性（如实披露）：共享工作树中其他角色并行写盘；本证据的测试/扫描为 09:12–09:13Z 快照，
  其后其他角色仍可能改动其写集（模块图扫描对象含其文件）。最终合并候选须按 B1 §2.1/§5.2 重跑
  `test/gates/**`、`npm run typecheck` 与 module-graph。

## 10. 候选聚合与证据文件（SHA-256 / 行数）

| 文件 | SHA-256 | 行数 |
| --- | --- | --- |
| `01-gates-tests.log` | `c8b70d9fa8b2f93efbd5b87b5799dec7dd96e8c785464f9ce7460fb06d8ff9d9` | 98 |
| `01-gates-tests.meta.txt` | `2f195275f1cffdcebc058f27ceacfb8529c23e18fb65e3c294801a607c2ce5b4` | 8 |
| `02-typecheck-full.log` | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` | 4 |
| `02-typecheck-full.meta.txt` | `78417f1da090a5f58595c102170ba5c1aaf36f500e285ed575791b4b00943a9e` | 5 |
| `02-typecheck-scoped.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`（空） | 0 |
| `02-typecheck-scoped.meta.txt` | `6a4b3f75a80694abd7d591ad8f87ff238bc0dbc99a6c004f9a675bc3a1a4552b` | 6 |
| `03-file-identity.txt` | `e7220bd190fe84f9da454475256bcf2c8171bbb0ad3fc058645817b969415ec3` | 8 |
| `04-differential-summary.txt` | `153ba777da9602ec14eed51a0fd16be5eedb111b4dcfe531672740c602a08680` | 1 |
| `05-module-graph-report.json` | `28cbf7b99fb30aabb913ce5a2005b1599ce4c70a5fd72b9afd29da0b40588ded` | 60 |
| `06-write-set-status.txt` | `7c9bdeb4d6597735fc8cddc1435be346b10891c3a33448cabd79b574ee62a906` | 5 |
| `07-per-file-tests.txt` | `c663d2b7cbae06bfd0ec5a3d11ddb0087782a446eb01793986935f7f9fb0a0e2` | 30 |
| `08-final-gates-tests.log` | `9e81b628e1ea76f0f82f4049519ce26554722626aa69eceff4d798818e04aa9c` | 98 |
| `08-final-gates-tests.meta.txt` | `57f58c3cc6a24816143e25040ad8d2e8671794d8a51bd764632220948f955010` | 6 |
| `08-final-typecheck.log` | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` | 4 |
| `08-final-typecheck.meta.txt` | `9dfb1d6a46e3d2e2bd312f6ef61c8c3c2ef3bcb069a066f7c24d312555d524a5` | 5 |
| 代码/测试候选聚合（6 文件） | `999f3b450814610f570238720d32d83af46c71cd8fa355fa6a9079419697aedd` | §2 算法 |

## 11. 遗留、偏差与风险（如实登记）

1. **E2 前旧引擎仍为权威**：`trunk-runtime.ts` 的 `evaluateChiefDispatchParent` 保持生产调用；本模块尚未被任何
   消费者 import（`grep` 仅测试引用）。E2 由编排切换两处调用、双跑、回滚演练并删除内联实现/旧类型；
   本角色不写 `trunk-runtime.ts`（角色边界）。
2. **真实运行证据不在本节点**：未运行 Claude/Pi/Codex 真实模型或桌面应用；P1/P2/RR1/RR2 与适配器
   「实际构造面 = 报告面」归 P1-RR/适配器 owner。本证据只覆盖判定层。
3. **门 API 冻结**：`index.ts` 的 5 个导出与 18 reason 已按 typecheck 断言冻结；任何新增/改名须走接口评审
   （E0.3 §4.4）并更新 `api-contract.test.ts`/本证据。
4. **重复实现口径**：本模块与 P1 D-minimal oracle 是**同一 predicate 的有意双份**（E2 删除旧实现，D5/E3.8）；
   模块内无第二份实现（唯一导出函数；共享身份/尾部/严格/受限 helper 各一份）。测试只把 oracle 当只读参照，
   生产代码不依赖它。
5. **module-graph 工具为 TS 7 原生 unstable API**：`typescript@7.0.2` 未提供传统 `ts.createSourceFile`；
   扫描使用官方 `unstable/sync` API。若后续 TypeScript 版本调整该 API，需同步更新测试（已在测试头注释声明）。
6. **并行工作树残差**：开工期间一次全量 typecheck 的 2 条错误来自写集外并行文件（属主修复后重跑绿；
   该次失败日志已被最终复跑覆盖、未保留原始字节，失败摘要见 §8 第 6 项）；
   module-graph 的 roles 快照（27 文件、0 违例）会随其他角色继续改动；最终候选须重跑。
7. **未做**：E2 切换、真实重跑、回滚演练、D9 删除清单、全量 T3、构建/发布；均属后续阶段/其他角色。

## 12. 结论（只交证据，不判验收）

- `src/common/gates/` greenfield 模块按 E0.3 §5.1 落地唯一 public entry（5 个导出 + 18 reason 闭集），
  四运行时分支/严格原条件 + F15 guard/受限全条件/Codex 字面绑定与 P1 D-minimal **差分 0**（134 场景 / 268 比较）。
- `test/gates/` 29/29 绿；`npm run typecheck` exit 0；模块图扫描 331 文件 / 1,735 边 / **0 违例 / 0 value 环**，
  D9 type-only 豁免单列；写集扫描仅本角色三个路径。
- 未判验收；E2 切换/真实运行/最终候选重跑归相应 owner 与阶段。

## 13. X-G 金样冻结（E2 切换前置，2026-11-07）

- 目的：E2 将把 `src/pipeline/orchestration/trunk-runtime.ts` 的两处判定改调 `src/common/gates/index.ts`
  并删除内联实现；先把内联 `evaluateChiefDispatchParent` 冻结为金样，使差分测试脱离 trunk-runtime oracle
  （E2 检查单 §4.5 / G9 / B3；B1 M4/D7「不得删断言/删覆盖」）。本节点**不改** `src/common/gates/index.ts`、
  **不改** `trunk-runtime.ts`（内联实现仍存在、仍是生产权威），不提交/推送。

### 13.1 生成方法与来源（生成时身份）

| 项 | 值 |
| --- | --- |
| 生成器 | `角色卡/gates-code/docs/change/2026-11-07_E1_gates-module-evidence/30-xg-golden-generate.mjs`（104 行 / `60180a8680de7fb57b4c563b55762f8dfb29858aca571ba45967a1e82a4cc57f`） |
| 输入夹具 | `test/gates/fixtures.ts::differentialScenarios()`（未改，`bdeb863e…`） |
| oracle | `src/pipeline/orchestration/trunk-runtime.ts::evaluateChiefDispatchParent`（`9453a43f…`） |
| 交叉复核 | 同一 fixture 同步喂给 `src/common/gates/index.ts`（`be7e1738…`）；差异 ≠ 0 时拒绝写盘 |
| 顺序 | 场景声明顺序 × hub `true` → `false` |
| 内容 | 每个场景 × hub 的 `ok` 与 `reasons`（逐项、保留顺序）；reason 类型为 gates `DispatchParentReason`，闭集外取值会被 typecheck 拒绝 |
| 生成时间（UTC） | `2026-11-07T09:51:15.591Z`（记录于金样元数据） |
| 生成结果 | **scenarios=134 / comparisons=268 / differences=0**（`31-xg-golden-generate.log`，`82da4cba267b0b38addc2f801280f98a3ce96c9866626becdad68259fcbf42a1`，3 行） |

### 13.2 金样文件

| 项 | 值 |
| --- | --- |
| 路径 | `test/gates/fixtures/dispatch-parent-golden.ts`（新增） |
| 行数 / SHA-256 | **308 行 / `d3062907765bf7897ce91d5c847f99c0a2b8aff0aed7d9c76c9967d35c03568d`** |
| 条目 | 268（134 场景 × 2 hub）；`ok: true` 37 条、`ok: false` 231 条 |
| 元数据 | `DISPATCH_PARENT_GOLDEN_META`：schema=`dispatch-parent-golden/v1`、oracle 符号、scenarios/comparisons、hubValues、三个来源 SHA-256 |
| 导入面 | 只有 `import type { DispatchParentReason }`（gates public entry，type-only）；**不含 trunk-runtime import** |

### 13.3 测试改写（`test/gates/differential-trunk-runtime.test.ts`）

- 保留原文件名（E2 检查单 §4.5 的删除清单以该路径登记；改名会造成测试角色文档额外漂移）。
- 删除 `import { evaluateChiefDispatchParent as oracleEvaluate, ... } from trunk-runtime.ts` 及 oracle 结构断言；
  现在只 import `src/common/gates/index.ts` + 金样 + `test/gates/fixtures.ts`（130 行 / `ea93e62ca789fdade18f28c76ed9d0fc09f5cdfbd87edf6b5a4e0ee576e5ca8b`）。
- 比较语义不变：逐场景 × hub 比较 `ok` 与 `reasons`（逐项/顺序）；保留原断言下界（场景 ≥100、比较 ≥200），
  新增：金样条目数 = 元数据比较数、缺项/多项检测、金样元数据自洽、18 项 reason 闭集不变量，
  以及「测试与金样均不 import trunk-runtime」结构守卫（删除内联实现后测试仍可运行）。
- 负例验证：把 `demo/strict-pass [hub=true]` 期望改为 `ok:false / ["wrong-runtime"]` 后运行该文件 →
  **exit 1 / 1 条差异**（`34-xg-golden-mutation.log`，`5974e875db7af1c0b91ed3711fec0c805aaca4e267a02b5b6106cd99c5d7d9b7`，48 行）；
  随后按备份还原，金样 SHA-256 恢复为 `d3062907…`（逐字节一致）。证明金样不匹配即失败、比较并非空转。

### 13.4 命令与计数（最终态；cwd = 本 worktree）

| argv | exit | 计数（tests/pass/fail/cancelled/skipped/todo） | 日志 |
| --- | --- | --- | --- |
| `node --test --test-concurrency=1 "test/gates/**/*.test.ts"` | **0** | **29 / 29 / 0 / 0 / 0 / 0** | `32-xg-gates-tests.log`（98 行 / `bdd3a687116a18c14cc61f9249c4442aab0aa1d1f38220537cd0f2b1764c7862`） |
| `npm run typecheck`（`tsc --noEmit`） | **0** | 无诊断 | `33-xg-typecheck.log`（4 行 / `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247`，与 pre-switch 基线 typecheck 日志同哈希） |

- 差分输出原行：`differential(gates vs frozen golden): scenarios=134 comparisons=268 differences=0`（`32-xg-gates-tests.log:4`）。
- gates 套件内含 `module-graph` 5/5（本节点未改 `src/`，扫描对象未变）。

### 13.5 冻结前后身份（未漂移项）

| 文件 | 冻结前（pre-switch 基线） | 本节点后 |
| --- | --- | --- |
| `src/common/gates/index.ts` | `be7e1738…` | `be7e1738…`（未改） |
| `src/pipeline/orchestration/trunk-runtime.ts` | `9453a43f…` | `9453a43f…`（未改；内联实现仍为生产权威） |
| `test/gates/fixtures.ts` | `bdeb863e…` | `bdeb863e…`（未改） |
| `test/gates/differential-trunk-runtime.test.ts` | `f4c0fa72…` | `ea93e62c…`（改写） |
| `test/gates/fixtures/dispatch-parent-golden.ts` | — | `d3062907…`（新增） |

- gates 模块/测试候选聚合（7 文件，算法：posix 路径排序、逐行 `<path>\t<sha256>`、LF 连接 + 末尾 LF、UTF-8）：
  `d5ed1772507038dcc82a0397aa12953ef75429508ce099679b14d8da540aaf00`（`35-xg-candidate-aggregate.txt`）。
  注：E1 gates 候选聚合 `999f3b45…` 的 6 文件口径因本节点改写测试/新增金样而不再适用（E1 记录保留为历史）。
- 写集：`git status --porcelain -- test/gates src/common/gates 角色卡/gates-code` 仅三个路径
  （`?? test/gates/`、`?? src/common/gates/`、`?? 角色卡/gates-code/`）；未 commit / push / stash。

### 13.6 本节点证据文件

| 文件 | SHA-256 | 行数 |
| --- | --- | --- |
| `30-xg-golden-generate.mjs` | `60180a8680de7fb57b4c563b55762f8dfb29858aca571ba45967a1e82a4cc57f` | 104 |
| `31-xg-golden-generate.log` | `82da4cba267b0b38addc2f801280f98a3ce96c9866626becdad68259fcbf42a1` | 3 |
| `32-xg-gates-tests.log` | `bdd3a687116a18c14cc61f9249c4442aab0aa1d1f38220537cd0f2b1764c7862` | 98 |
| `33-xg-typecheck.log` | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` | 4 |
| `34-xg-golden-mutation.log` | `5974e875db7af1c0b91ed3711fec0c805aaca4e267a02b5b6106cd99c5d7d9b7` | 48 |
| `35-xg-candidate-aggregate.txt` | 内容为 7 行 `<path>\t<sha256>` + 1 行 `AGGREGATE=…`（见 §13.5） | 8 |

> `*.log` 被仓库 `.gitignore:6` 忽略（文件在磁盘、按上表哈希可复算）；全部证据文件未提交/未暂存。

### 13.7 遗留 / 交给后续

1. 本节点只冻结金样并改测试；`trunk-runtime.ts` 的内联实现与两处调用切换、桥接常量、回滚演练、
   L2 测试 import 重定向（`test/测试/runtime-dispatch-gate-integration.test.ts`、
   `test/编排/trunk-dispatch-parent.test.ts` 的结构断言）与删除清单归编排/测试角色（本角色写集外）。
2. 删除内联实现后，本测试/金样无需再改即可运行；gates 行为若随后改变导致金样不匹配，应视为行为变更，
   走接口评审并显式重新生成金样（不得改断言/删条目）。
3. 金样元数据记录的是生成时来源哈希；`trunk-runtime.ts` 删除内联实现后该哈希成为历史身份，不再与工作树一致；
   本测试不校验它（结构性守卫只禁 import）。
4. 未运行真实模型/Electron/全量 T3；未判验收；未更新 E2 检查单/测试角色证据（`角色卡/测试/**` 写集外）。
