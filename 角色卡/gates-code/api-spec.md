# 门控模块 API 实现报告（`src/common/gates/`）

- 角色/owner：gates-code（写集 `src/common/gates/`、`test/gates/`）。
- 状态：E1 greenfield 已实现（implemented-unverified）；E2 前旧引擎 `trunk-runtime.ts` 仍为生产权威。
- 契约：E0.3 `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` §5（685 行 / `067e3d2e…`）。
- 版本：E1 / 2026-11-07；冻结面见 §1，变更走接口评审（E0.3 §4.4）。

## 1. Public entry 与冻结导出面

唯一 public entry：`src/common/gates/index.ts`（模块根不得散放其他文件）。导出 5 个符号，无内部 helper：

```ts
import type { RuntimeInputProvenanceV1, RuntimeKind, RuntimeSessionLifecycleFacts, RuntimeSessionToolSurfaceFacts }
  from "../../model/runtime.ts";

export interface DispatchParentHostFacts {
  parent: { roleId: "chief"; runtime: RuntimeKind; sessionId: string; turnId: string;
    clientMessageId?: string; kind?: string; inputAccepted: true; settled: false };
  creatorReports?: readonly { taskId: string; roleId: string; reportId: string; turnId: string }[];
}

export interface DispatchParentCoreFacts {
  disposed: boolean;
  construction: string;                 // 只接受 "default-core"
  roleId?: string;
  runtime?: RuntimeKind;
  lifecycle?: RuntimeSessionLifecycleFacts;
  toolSurface?: RuntimeSessionToolSurfaceFacts;
  turnInput?: { turnId: string; provenance?: RuntimeInputProvenanceV1 };
}

export type DispatchParentReason = /* 18 项闭集，见 §3 */;

export type DispatchParentDecision =
  | { ok: true }
  | { ok: false; reasons: readonly DispatchParentReason[] };

export function evaluateChiefDispatchParent(input: {
  host: DispatchParentHostFacts;
  core: DispatchParentCoreFacts | undefined;
  hub: boolean;
}): DispatchParentDecision;
```

- 类型/函数签名与 E0.3 §5.1 逐项一致；`DispatchParentCoreFacts` 使用 Model 冻结证据类型，不复制第二套字段（§5.4/D7）。
- `reasons` 为编译期闭集：所有 helper 返回值标注 `DispatchParentReason | undefined`；新增码须改类型并过 typecheck。
- 测试冻结：`test/gates/api-contract.test.ts`（导出名/类型层 18 项/函数签名/import 面/纯函数约束）。

## 2. 判定语义（只判定、不采集证据）

输入是调用方已取得的事实；门不读注册表、不调用 Service/Provider/Pipeline、不做 I/O、不补造事实。
`hub` 只影响 `creatorReports` 分支（与旧 `validParent` / `currentChiefResumeSource` 一致）：

| 运行时 | 分支 |
| --- | --- |
| `claude` / `pi` | 只走受限应用中介路径（严格路径不评估） |
| `codex` | 先严格 native；严格不成立时 `observed + mediation verified` ⇒ `application-mediation-ambiguous`；否则受限兜底；两段 reason 相同则去重 |
| `demo` | 只走严格路径（现状不变；受限路径拒绝 demo） |
| 其它 | `wrong-runtime` |

**严格路径**（原条件逐字保留 + F15 互斥 guard）：`disposed` → `construction === "default-core"` →
`roleId === "chief"` → `core.runtime === host.parent.runtime` → `toolSurface.status === "observed"` →
`toolSurface.sessionId === parent.sessionId` → `factoryProvenance !== "custom-override"` →
**`applicationMediation === undefined`** → 共享尾部。

**受限应用中介路径**：runtime ∈ {claude,pi,codex} → 身份四条件 → `status === "unknown"` →
sessionId → `factoryProvenance === "default-production"` → `nativeToolRegistry === "unknown"` →
`mediation.kind === "application-mediated-unknown-native" && mediation.status === "verified"` →
`mediation.runtime === core.runtime` → `mediation.factory === APPLICATION_MEDIATION_FACTORY[runtime]` →
`mediation.reasons.length === 0` → `nativeBuiltinTools.length === 0` →
`appTools`/`configuredForeignMcpServers` 同集合 → active dispatch 工具名在 appTools →
**Codex 字面绑定** `native?.factory === "codex-chat" && native.nativeInstanceId === mediation.nativeInstanceId`
（缺失/空串 fail-closed；lifecycle native 在场时保留附加防御）→ 共享尾部。

**共享尾部**（严格/受限同一份实现）：`lifecycle.turnId` → `stopRequested` → active `dispatch_task`/`ans_dispatch_task` →
`inputAccepted === true` → `settled === false` → creatorReports（hub=true 时）→ `parent.kind`。

`applicationMediation.nativeInstanceId`（P1-A Amendment-1）是 verified 必填字段，纳入 Codex accepted evidence（Q10）。

## 3. 拒绝原因码（18 项闭集；仅测试/诊断，对外回执不变）

| reason | 触发 |
| --- | --- |
| `evidence-missing` | `core` 不存在 |
| `disposed` | Core 会话已 disposed |
| `not-default-core` | 构造非 `default-core` |
| `evidence-identity-mismatch` | role/runtime/session/nativeInstanceId 等身份不一致 |
| `wrong-runtime` | runtime 不匹配或不在允许分支 |
| `tool-surface-unknown` | 严格路径 `status !== "observed"`；或受限路径 `status !== "unknown"` 且非歧义 |
| `custom-factory` | 严格路径 `factoryProvenance === "custom-override"`；受限路径 `!== "default-production"`（含 custom/demo） |
| `application-mediation-ambiguous` | 严格路径 `applicationMediation !== undefined`（任何 status）；受限路径 `status === "observed" && mediation.status === "verified"` |
| `application-mediation-unverified` | mediation 缺失/status 非 verified/kind 不符/factory 不符/reasons 非空 |
| `native-builtin-present` | `nativeBuiltinTools` 非空 |
| `registry-mismatch` | appTools/foreign 不一致、`nativeToolRegistry` 非 unknown、active dispatch 工具不在 appTools |
| `turn-mismatch` | `lifecycle.turnId !== parent.turnId` |
| `stopped` | `stopRequested` |
| `no-active-dispatch` | 无 active `dispatch_task`/`ans_dispatch_task` |
| `input-not-accepted` | `parent.inputAccepted !== true` |
| `turn-settled` | `parent.settled !== false` |
| `creator-reports-mismatch` | handback provenance / creatorReports 不匹配 |
| `parent-kind-invalid` | `parent.kind` 已定义且非 `"message"`（`undefined` 允许；creatorReports 分支优先） |

对外错误语义不变：消费者只消费 `.ok`，仍返回 `trunk-verify-failed` + 现有文案（E0.3 §5.2 第 8 条）。

## 4. 证据消费边界

- **允许消费**：派发父门（`prepareRoleDispatch`）与 controller resume（`prepareControllerResume`）。
- **禁止消费**：写/发布/stable-write/run-stop（`inspectInitializationProtection`、stable-write、run-stop）一律不读
  `applicationMediation`（INV-2）；本模块不承载这些门。
- 本模块不新增第二消费点，不写注册表/账本/会话；缺事实默认拒绝（fail-closed）。
- 依赖方向：`Model ← shared ← gates ← engines`；本模块只 import `src/model/runtime.ts`（type-only），
  不 import 角色模块、`src/service/`、`src/provider/`、`src/pipeline/`、`src/common/门禁引擎/`。

## 5. 测试与证据映射

| 测试文件 | 覆盖 | 计数 |
| --- | --- | --- |
| `test/gates/dispatch-parent.test.ts` | P1.6 §11.1 / B1 §3.2 判定层 P/N 矩阵；四分支；TOCTOU；reason 闭集可达性；结构守卫 | 19 |
| `test/gates/differential-trunk-runtime.test.ts` | 与冻结金样逐字段/逐 reason/顺序差分（X-G：不再 import trunk-runtime；金样见下行） | 2（134 场景 / 268 比较 / 差异 0） |
| `test/gates/fixtures/dispatch-parent-golden.ts` | X-G 金样：生成自 P1 D-minimal oracle 的 268 条期望输出（不匹配即失败；夹具，非用例） | — |
| `test/gates/api-contract.test.ts` | 冻结导出面、18 reason、函数签名、纯函数/import 约束 | 3 |
| `test/gates/module-graph.test.ts` | TS Compiler API 模块图：单入口、依赖方向、无环、D9 type-only 单列、引擎经 index 消费 | 5 |
| `test/gates/fixtures.ts` | 共享夹具（非用例） | — |

证据：`docs/change/2026-11-07_E1_gates-module-evidence.md`（文件哈希/差分/扫描/计数/候选聚合）。
原始日志与其哈希见同目录 `2026-11-07_E1_gates-module-evidence/`。

## 6. 冻结、变更与 E2 迁移

- 本 API 冻结；新增/改名 `DispatchParentReason`、修改输入输出形状、增加导出面均走接口评审
  （E0.3 §4.4），并同步 `test/gates/api-contract.test.ts` 与本文件。
- E2（编排执行）：`trunk-runtime.ts` 两处判定改调本模块；双跑差分 + 回滚演练后删除内联实现/本地类型
  （D9/E-A10），并把 `ChiefDispatchParentHostFacts/CoreFacts/Decision` 的消费者改为 import 本模块类型。
  本角色不写 `trunk-runtime.ts`。
- X-G 金样冻结（2026-11-07，本角色）：内联 `evaluateChiefDispatchParent` 的 134 场景 / 268 比较已冻结为
  `test/gates/fixtures/dispatch-parent-golden.ts`；`test/gates/differential-trunk-runtime.test.ts` 已改为
  「gates vs 金样」、不再 import trunk-runtime（证据：E1 证据 §13）。删除内联实现与切换调用仍归编排。
- 已知非目标：通用工作流引擎/DSL、I/O、账本、会话、写路径/边界判定；均不在本模块。

## 7. 已知限制

- 本模块当前无生产调用方（E2 才接线）；真实运行证据不在 E1 范围内。
- module-graph 扫描依赖 `typescript@7.0.2` 原生 `unstable/sync` API（未新增依赖）；版本升级需复核该 API。
- `src/common/roles/**` 由其他角色并行落地；模块图报告是时间点快照，最终候选须重跑。
