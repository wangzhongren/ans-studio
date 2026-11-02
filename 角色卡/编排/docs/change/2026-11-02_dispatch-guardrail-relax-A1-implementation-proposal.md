---
id: dispatch-guardrail-relax-a1-implementation-proposal
type: change
title: A1 实现提案：派发护栏放宽——编排硬授权与 advisory 纯逻辑
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: draft
related: [dispatch-guardrail-relax]
events:
  - date: "2026-11-02"
    kind: created
    summary: 写 A1 短实现提案（proposal-only，无代码）
  - date: "2026-11-02"
    kind: revised
    summary: revision 1——按项目管理 P1 审核记录（needs revision）修订 P1-R-01/02/03/08/09 与 PM 裁决
  - date: "2026-11-02"
    kind: revised
    summary: revision 2——按 Revision 1 复审（needs revision）修订 P1-R-15/08-R1/16
---

# A1 实现提案（P1）：派发护栏放宽——编排纯逻辑（硬授权 + advisory）

- **角色**：编排（Orchestration）
- **版本**：**revision 2（2026-11-02）**。本版按项目管理 Revision 1 复审记录修订：`角色卡/项目管理/docs/change/2026-11-02_dispatch-guardrail-relax-P1-review.md`（现 323 行 / SHA-256 `597a585978fc14f28863c2cdd85fb159fe8814461d34d8986b4522203a515003`，含原 P1 审核与 Revision 1 复审）中的 P1-R-15、P1-R-08-R1、P1-R-16。审核对象为 revision 1（684 行 / SHA-256 `2d7335d89b170af42f5ef8979b27f201ebedf3629f8078859c47680012e0a131`）；原始审核对象为 revision 0（588 行 / `b007b38831f530d24c95631c21beeaf1aaec053a3f6fc428671f56775d4d1221`）。本修订版的新行数/SHA-256 由交付报告给出。逐项落点见 §11/§12。
- **状态**：**proposal-only, no code**。本文件只写实现提案；未改任何产品源码/测试，未实施、未测试、未验收、未 commit/push，未启动应用，未联系客户。本版不声称审核通过；复审由项目管理另行进行。
- **用途**：交项目管理按团队计划 §5.3 P1、§6.1 与 V1 §4.1 复审。审核聚焦 **R1 调用协议、契约冻结形状、测试迁移不弱化、写集与 typecheck 影响**；复审结论为 `recommend approval` 前 A1/B1 不写产品代码。
- **不是**：不是实施授权、不是验收结论、不是客户确认；不替代闸门 0/1/2，也不替代 V1 与 B0。
- **边界**：本提案符合 `角色卡/编排/boundary.md` Section 1（`src/common/编排/`、`test/编排/`、本角色 `docs/change/`）；未写角色卡/边界、`docs/scheduling|acceptance|communication|planning`、`app/**`、`test/桌面应用/**`、`src/common/shared/**`。

---

## 1. 输入与基线

### 1.1 冻结输入

| 输入 | 路径 | 行数 | SHA-256 | 用途 |
| --- | --- | --- | --- | --- |
| 代码基线 | worktree `flow-improvements-wave1`，HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a` | — | — | 所有行号仅作定位；实现以符号名为准 |
| 客户确认方案 P1.1（语义基线） | `docs/planning/2026-11-02_design_dispatch-guardrail-relax.md` | 877 | `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649` | §1.2、§3.1、§4.2、§5.1、§5.3.1、§5.3.2、§5.3.3、§5.5、§7.3、§8.2、§8.3 |
| 闸门 2 团队计划 v1 | `docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md` | 482 | `4ebd41fa9d68d7aca0e0847479b819965b367a87af58111128c4500f77ed074d` | §4.3 A1 写集、§5.3 A1 出口、§6.1–§6.3 R1/R2/R3、§7.3 证据 |
| 实施前验收标准 V1 | `docs/acceptance/dispatch-guardrail-relax-criteria-v1.md` | 814 | `63c441aa30bf895be8eadc9b9c4326edd5c202189bce32ee927b20c785a29ca3` | §3 AC-1–AC-8、§4.1 R1、§5.3 T3 全量、§5.5 命令 |
| 独立复核记录 | `docs/planning/2026-11-02_review_dispatch-guardrail-relax.md` | 150 | `aa702f6bb9ea034c067721462ff07b64f1e34a53c8439b8c28c0dbe8ad0bfdb5` | F1–F12、R1–R4 |
| B0 实施前基线 | `角色卡/测试/docs/change/2026-11-02_dispatch-guardrail-relax-B0-baseline.md` | 201 | `547aba69c8244db0f29ce272a2969eef85679b6415fc1184aa704c23804901cb` | B0 入口、typecheck 0、受影响套件 39+50、T3 基线 3358/3331/9/18 |
| 实施授权记录（B0 转引） | `docs/communication/2026-11-02_intent_dispatch-guardrail-relax.md`（管理记录，可能追加；按确认小节引用） | 124 | `bbb64072b0d0f071be756158a9f24a4ea944e7c86ae10372e0b5e55407c5b93f` | 「授权实施：按团队计划 v1 与 V1 标准开始 B0/P1，随后按阶段实施；不含提交/推送/发布。」 |

以上哈希为提案写盘前实测值，与任务输入及 B0/V1 记录一致。B0 实测：`npm run typecheck` 退出码 0；受影响套件编排 3 文件 39/39、桌面 7 文件 50/50；T3 全量 3358 计 / 3331 过 / 9 既有 Windows symlink EPERM / 18 skip / 0 todo。A1 只新增/改造 `test/编排/`，不重复桌面与 T3 全量（由 D1 取证）。

### 1.2 只读核对（HEAD `c80f494`）

- `src/common/编排/workflow-preconditions.ts:1133-1161`：`DispatchPreflightInput` 现有字段；`:1163-1165` `DispatchPreflightResult = { ok:true } | { ok:false; code; message; rejection }`；`:1187-1372` `evaluateDispatchPreflight` 把硬授权与状态检查混在一个函数；`:214` 私有 `normalizeModulePath`（模块路径归一化，仅供解析与旧 preflight 使用）。
- `app/desktop/session.ts:6067` `routeStarDispatch`；`:6130-6137` 刷新枚举与目标信息；`:6138` `chainDispatchFacts`；`:6150-6178` `findActiveRun`/`ensureDraftRun`/`verifyPinnedRun`/`loadPinnedRoster`；`:6180-6222` preflight 与 run-change 自动触发；`:6225-6242` 版本基线；`:6244-6276` handoff pin（早退 `:6245-6247`）；`:6293-6312` `task.created`；`:6331-6349` `planDispatchDelivery`；`:6354-6401` 投递/收口。
- `test/桌面应用/rejection-copy.test.ts:54-70`：桌面测试直接构造 `DispatchPreflightInput`（当前无 `targetExists`）并调用 `evaluateDispatchPreflight`；该文件属桌面窗口写集，A1 不得改，但会影响 A1 的 typecheck/运行期望（见 §8.2）。
- `test/编排/workflow-preconditions.test.ts`：现有 `preflight()` helper（`:474-493`）未含 `targetExists`；M1–M8（`:495-560`）、正/负例（`:562-571`）、flow（`:580-598`）、run（`:836-854`）、legacy（`:856-866`）。
- `test/编排/dispatch-advisories.test.ts`：**不存在**（B0 已记录；A1 新建）。
- `src/common/编排/task-state.ts:234-237` 的 `run-required`、`run-manifest.ts`、`versioned-doc-guard.ts`、`governance-roles.ts`、`handback.ts`：本提案**不改**；A1 不触碰这些文件。

---

## 2. 契约设计（A1 退出冻结）

### 2.1 冻结形状

`src/common/编排/dispatch-advisories.ts`（新增，纯逻辑；只做 `import type`）：

```ts
export type DispatchAdvisoryCode =
  | "flow-required"
  | "intent-missing"
  | "proposal-missing"
  | "roster-missing"
  | "roster-modules-missing"
  | "env-bootstrap-missing"
  | "d3-missing"
  | "d3-selected-cards-incomplete"
  | "handoff-missing"
  | "run-legacy-readonly"
  | "run-pin-required"
  | "run-pin-failed"
  | "run-role-missing"
  | "run-ledger-unavailable"
  | "run-document-hash-mismatch"
  | "run-pinned-roster-invalid"
  | "versioned-doc-baseline-violation"
  | "module-required"
  | "module-missing"
  | "module-not-owned"
  | "module-path-invalid"
  | "module-path-outside"
  | "target-not-nominated";

export type DispatchAdvisory = {
  /** 稳定技术 code；只进诊断/模型回执，不塞进客户卡。 */
  code: DispatchAdvisoryCode;
  /** 一句人话；不含技术 code。 */
  message: string;
};

export function collectDispatchAdvisories(input: DispatchPreflightInput): DispatchAdvisory[];
```

`src/common/编排/workflow-preconditions.ts`（改造，保留单一公开入口）：

```ts
export type DispatchPreflightInput = {
  fromRoleId: string;
  targetRoleId: string;
  targetBuiltIn: boolean;
  /**
   * 目标真实存在（硬授权事实）。
   * 会话层计算：内置 id 由注册表判定；项目 worker 以 listing 枚举为准。
   * 仅旧调用方可省略；省略时按 targetCardFound 兼容解析（见 §2.2）。
   * 桌面 B1 必须显式传入。
   */
  targetExists?: boolean;
  chiefRoleId: string | null;          // 由 string 放宽；未枚举到幕僚时为 null
  convenerRoleId: string | null;
  flowId?: string;
  intent: { found: boolean; candidates: number };
  proposalFound: boolean;
  architectureFound: boolean;
  roster?: RosterLoadResult;
  d3Selected: string[];
  moduleId?: string;
  modulePaths?: string[];
  handoffFound: boolean;
  targetCardFound: boolean;            // 保留为兼容字段；硬授权不再使用（见 §2.2）
  missingSelectedCardIds?: string[];
  /**
   * run 事实。
   * - `state`：draft/pinned 来自 runManifest；`legacy` 是**仅 advisory 事实**——B1 在
   *   `hasLegacyFlowTask === true` 时传 `{state:"legacy"}`，即使本次 `ensureDraftRun` 成功；
   *   任务锚点仍用本地 draft，绝不把 `legacy` 当锚点（P1-R-02 方案 (a)）。
   * - `roles`：pinned manifest 的角色集；未定义时**不**产出 `run-role-missing`（不伪造）。
   * - `modules`：pinned manifest 的模块 id（仅 B1 传，用于 run 专属 `module-missing`；
   *   不得用 latest roster 冒充，见 P1-R-08 方案 (a)）。
   */
  run?: {
    state: "draft" | "pinned" | "legacy";
    runId?: string;
    roles?: readonly string[];
    modules?: readonly string[];
  };
  /**
   * 会话层观察到的 run 事实（R2；纯逻辑不读盘、不推断）。
   * 仅 B1 传入；旧调用方省略。
   */
  runFacts?: {
    /** run 读取/草案创建失败，或 handoff 无 runManifest/flowId。 */
    ledgerUnavailable?: boolean;
    /** handoff pin 尝试失败（run 保持 draft/缺失）；run 仍 draft 时与 run-pin-required 同时产出（P1-R-01）。 */
    pinFailed?: boolean;
    /** verifyPinnedRun 发现文档哈希不一致。 */
    documentHashMismatch?: boolean;
    /** loadPinnedRoster 读取/校验失败。 */
    pinnedRosterInvalid?: boolean;
  };
  /** 会话层事实：verifyVersionedDocBaselines 的违规路径；非空即 advisory。 */
  versionedDocBaselineViolations?: string[];
};

export type DispatchAuthorizationInput = Pick<
  DispatchPreflightInput,
  "fromRoleId" | "targetRoleId" | "targetBuiltIn" | "chiefRoleId" | "convenerRoleId"
> & { targetExists: boolean };

export type DispatchAuthorizationFailure = {
  ok: false;
  code: string;
  message: string;
  rejection: MechanicalRejection;
};
export type DispatchAuthorizationResult = { ok: true } | DispatchAuthorizationFailure;
export type DispatchPreflightResult =
  | { ok: true; advisories: DispatchAdvisory[] }
  | DispatchAuthorizationFailure;

/** 硬授权唯一谓词；只接收 6 个授权事实，不接收任何状态/run/名单/模块事实。 */
export function evaluateDispatchAuthorization(input: DispatchAuthorizationInput): DispatchAuthorizationResult;

/** 复合入口：内部调用 evaluateDispatchAuthorization，通过后调用 collectDispatchAdvisories。 */
export function evaluateDispatchPreflight(input: DispatchPreflightInput): DispatchPreflightResult;
```

导出面（A1 冻结）：

- `workflow-preconditions.ts`：`evaluateDispatchAuthorization`、`evaluateDispatchPreflight`、`DispatchAuthorizationInput`、`DispatchAuthorizationResult`、`DispatchAuthorizationFailure`、`DispatchPreflightInput`、`DispatchPreflightResult`；`export type { DispatchAdvisory, DispatchAdvisoryCode } from "./dispatch-advisories.ts";`（便于桌面只从既有模块取类型）。
- `dispatch-advisories.ts`：`collectDispatchAdvisories`、`DispatchAdvisory`、`DispatchAdvisoryCode`。
- `mechanical-rejection.ts`：仅更新 `target-card-missing` 的 action 文案；不新增/删除拒绝码；`LEGACY_CODE_ALIASES.M5_TARGET_CARD_MISSING` 保留。

说明（P1-R-11）：

- `DispatchAuthorizationInput/Result/Failure` 是**窄步骤的公开签名**（`Pick` 派生，不是第二份输入形状）；冻结声明列明。复合入口进入后**第一个判定步骤**是 `evaluateDispatchAuthorization`；不要求测试对函数体「第一行」做源码钉，也不要求实现把参数构造挤在一行。
- `collectDispatchAdvisories` 是全部 23 个 advisory code 的**唯一产出点**（PM P1 审核 §5.4 裁决）；B1 只收集事实、合并/截断/呈现/诊断，不得在会话层另写同类 advisory 文案或第二套诊断/去重逻辑。

### 2.2 `targetExists`、`chiefRoleId` 与兼容字段

- **`targetExists` 在复合输入上可省略（兼容），在窄输入上必填。** 原因：`test/桌面应用/rejection-copy.test.ts:54-70` 直接构造 `DispatchPreflightInput` 且属桌面窗口写集，A1 不能改；若设为必填，A1 的 `npm run typecheck` 会因跨角色测试而失败。复合入口用**唯一私有解析** `resolveTargetExists(input) = input.targetExists ?? input.targetCardFound`；窄入口不解析、只接收显式 boolean。旧调用方省略时按 `targetCardFound` 兼容：在唯一使用 `targetExists` 的「运营→项目 worker」分支，现状 `targetCardFound` 恰为目标枚举结果；幕僚分支不读 `targetExists`，故不影响类型优先判定。fail-closed。
- **`targetExists` 计算口径（B1）**：`targetRole !== undefined || isBuiltInGovernanceRoleId(targetRoleId)`。内置目标由注册表判定；项目 worker 以 `refreshListingNow` 后的 listing 枚举为准。listing/刷新不可用时，项目 worker 目标 `targetExists=false`，按硬 `target-card-missing` 拒绝并说明「未枚举到，可能 enumeration 不可用」，**不猜**；内置目标仍由注册表判定。
- **`targetCardFound` 保留**：硬授权不再使用；`collectDispatchAdvisories` 仅用它作 `d3-selected-cards-incomplete` 的旧聚合兜底（与 `missingSelectedCardIds` 并用）。这样旧调用方与既有测试的字段仍可编译，且旧语义不被静默改写。
- **`chiefRoleId: string | null`**：`chiefRoleId === null` 时不匹配任何字符串来源；来源=运营且 `convenerRoleId` 可用时不再因幕僚缺失被误伤。会话层仅在「来源/creator 无法确定」时拒绝（`routeDispatch` 的来源身份校验仍保留）。

### 2.3 硬授权判定顺序（`evaluateDispatchAuthorization`，唯一谓词）

显式 allowlist 常量（不新增到 `src/common/门禁引擎` 的依赖）：

```ts
const CHIEF_DISPATCHABLE_BUILT_INS = ["product", "rapporteur", "nominator", "convener", "verifier"] as const;
```

1. `fromRoleId === targetRoleId` → `self-dispatch`。
2. `fromRoleId !== chiefRoleId && fromRoleId !== convenerRoleId` → `unknown-source`（`chiefRoleId` 为 null 时只可能是运营来源）。
3. 来源是幕僚：
   - `!targetBuiltIn` → `chief-to-project-forbidden`（**类型禁止优先于存在性**；即使 id 不存在也走此码）。
   - `targetRoleId` 不在 `CHIEF_DISPATCHABLE_BUILT_INS` → `target-card-missing`（`su` 及其它注册表内置但不在 allowlist 的 id：说明「该 id 不是可派发内置角色」）。
   - 否则通过。
4. 来源是运营：
   - `targetBuiltIn && targetRoleId !== "verifier"` → `convener-target-forbidden`。
   - `targetBuiltIn`（verifier）→ 通过。
   - `!targetExists` → `target-card-missing`（目标角色不存在/未枚举到；文案同时覆盖角色卡/边界未就绪、id 拼写错误、枚举不可用）。
   - 否则通过。

补充：

- 「未知非内置 id」（如 `foo`）在幕僚来源下走 `chief-to-project-forbidden`（类型优先）；「未知内置 id」指注册表判定为 built-in 但不在 allowlist 的 id（如 `su`），走 `target-card-missing`。两者都不得放行。
- **`liaison` 不是内置 id（P1-R-09）**：`isBuiltInGovernanceRoleId("liaison")` 为 false（已退休只读别名，不进入 `BUILT_IN_GOVERNANCE_ROLES` 注册表）；会话层 `targetBuiltIn=false`，真实路径是 `chief-to-project-forbidden`，不得写成 `target-card-missing`。A1 测试只用 `su` 覆盖真实 `target-card-missing`；若要测「未知内置 id」，用纯函数显式 `targetBuiltIn:true` 的**合成 case**并注明 synthetic fact，不把它写成会话层真实枚举路径。
- `targetBuiltIn` 仍由会话层按现状计算（listing 的 `builtIn` 或 `isBuiltInGovernanceRoleId`）；`targetExists` 不参与幕僚分支的类型判定，避免两个事实互相覆盖。
- 失败返回沿用现有 `reject()` 形状：`{ ok:false, code, message, rejection }`；`reject()` 的返回类型改为 `DispatchAuthorizationFailure`。
- 删除的状态分支不再返回 `ok:false`；`run-missing` 不再产生（其 RULES 条目保留供历史回执/码表读取）。
- **`targetExists` 兼容窗口（PM P1 审核 §5.2 裁决）**：复合输入可选、窄输入必填；`resolveTargetExists(input) = input.targetExists ?? input.targetCardFound` 是私有唯一解析点，fail-closed；B1 在 `routeStarDispatch` 始终显式传 boolean；A1 单测覆盖「省略 + `targetCardFound=false`（运营→项目 worker）→ 硬 `target-card-missing`」「省略 + `true` → 通过」「显式 false/true 的窄入口矩阵」「复合入口成功带 `advisories`、失败不带」。不得让 collector 或其他分支二次推断 `targetExists`。

### 2.4 `collectDispatchAdvisories` 契约

- 签名：`(input: DispatchPreflightInput) => DispatchAdvisory[]`。
- **纯函数**：不读盘、不写盘、不调用日志/会话、不抛异常；所有事实由 `input` 传入；无事实/事实不完整 → 按缺失处理并返回对应 advisory，或返回 `[]`，**永不返回 `ok:false`**。
- **不反向影响硬授权**：复合入口在硬授权失败时直接返回失败，不调用 collector；collector 不改变 `ok`。
- **唯一产出点**：全部 23 个 advisory code 只由 `collectDispatchAdvisories` 产出（PM P1 审核 §5.4 裁决）；B1 不另写同类 advisory/文案/诊断。
- 导入方向（P1-R-10）：`dispatch-advisories.ts` 只 `import type { DispatchPreflightInput } from "./workflow-preconditions.ts"`（`verbatimModuleSyntax` 下擦除）；`workflow-preconditions.ts` 运行期导入 `collectDispatchAdvisories`。模块图在静态检查器看来可能像 import 环，但**仅 type-only 反向引用、运行期无环**；冻结声明记录该口径。
- 模块路径 advisory（`module-path-invalid`/`module-path-outside`）的归一化/比较在 `dispatch-advisories.ts` 内私有实现，规则与旧 preflight 的 `normalizeModulePath` 一致；旧硬分支删除后不构成「第二份授权判定」。A1 增补等价性测试（反斜杠、绝对路径、`..`、通配、目录/文件尾斜杠，见 §6.2）；若后续要求与解析器单一来源，需抽到共享模块，属后续变更（不在 A1 写集，不在本提案临时加文件）。

---

## 3. R1 调用协议（桌面 B1 接线）

### 3.1 选择：同模块窄步骤导出（不是「单一复合入口内部拆分后一次调用」）

R1 的硬约束是：**硬授权必须先于任何 run 账本写入**，而 advisory 所需事实在事实收集之后才齐备。一次 `evaluateDispatchPreflight` 调用无法同时满足「早于 run 记账」与「晚于事实收集」；因此采用 R1-c 明确允许的第二种方式：

- **同一模块导出窄步骤** `evaluateDispatchAuthorization`；
- `evaluateDispatchPreflight` 保留为**唯一复合公开入口**，内部 = `evaluateDispatchAuthorization` + `collectDispatchAdvisories`，**复用同一谓词，无第二份判定**；
- 桌面 `routeStarDispatch` 按协议**早调窄步骤、晚调 collector**，一次派发只做一次硬授权。

被否决的替代：

- 把复合调用整体移到 run 记账之后：硬拒绝可能先产生/领养 draft run，违反 R1-a（复核 R1 指出的正是该问题）。
- 在早、晚各调一次复合入口：虽然复用的是同一纯函数，但会产生两次授权评估，且第二次位于 run 写入之后，容易被误读为「拒绝可晚于记账」；不使用。

### 3.2 最终调用顺序（B1 在 `routeStarDispatch` 接线）

以 HEAD `c80f494` 行号定位（实现以符号名为准）：

1. **幂等抑制**（`:6110-6125`，保持现状）：同键已存在/终态重复 → `ok:true`；不建任务、不写 run、不投递。位置可在硬授权前，减少 I/O。
2. **刷新枚举 + 目标事实**（`:6130-6137`）：`refreshListingNow`；取 `targetRole`、`targetBuiltIn`、`targetExists`；取 `chiefRoleId`（允许 null）、`convenerRoleId`；`:6086` 防御按 P1-R-05 由 B1 收窄为只拦 `fromRoleId === targetRoleId`（自派），「target=幕僚且来源非幕僚」交给矩阵返回 `convener-target-forbidden`，不形成矩阵之外的第二条目标判定。
3. **硬授权（R1 锚点）**：调用
   ```ts
   evaluateDispatchAuthorization({
     fromRoleId,
     targetRoleId,
     targetBuiltIn,
     targetExists,          // 显式 boolean
     chiefRoleId,           // string | null
     convenerRoleId,
   })
   ```
   返回 `{ ok:true }` 或 `{ ok:false, code, message, rejection }`。**若失败：立即 `fail(...)` 并返回**——不调用 `chainDispatchFacts`、不调用 `findActiveRun`、不调用 `ensureDraftRun`、不调用 `pinRun`、不写 `task.created`、不打开目标会话、不投递。这是硬拒绝零副作用的唯一卡点。
4. **事实收集（只读）**：`chainDispatchFacts`（`:6138`）、`dispatchFlowId`、`runFlowId`、`handoffDispatch`、`hasLegacyFlowTask`。读失败按缺事实处理，不抛到调用方。
5. **run 只读/记账（含 handoff pin；尽力而为）**：
   - `findActiveRun`（只读）；有 `flowId` 时对所有目标 `ensureDraftRun`（**写入只发生在硬授权通过之后**）；pinned 时 `verifyPinnedRun`/`loadPinnedRoster`（只读）。
   - handoff 且 run 为 draft 时尝试 `pinRun`；pin 成功后再做 `verifyPinnedRun`/`loadPinnedRoster`。pin 失败 → `runFacts.pinFailed`；pinned 校验失败 → `runFacts.documentHashMismatch`/`pinnedRosterInvalid`；所有失败**不 fail**，run 保持 draft/缺失，不伪造 pinned；校验失败/不覆盖目标或模块的 pinned run 不作为任务锚点。
   - `hasLegacyFlowTask === true` 时：collector 的 `run` 事实设为 `{state:"legacy"}`（**仅 advisory 事实**）；任务锚点仍用本地 `runManifest` draft，不把 `legacy` 当锚点（P1-R-02 方案 (a)）。
6. **版本化基线（B1）**：`verifyVersionedDocBaselines` 的违规写入 `versionedDocBaselineViolations`，不再 `return fail`（A1 只提供 collector 输入字段与 code；调用点在 B1 写集）。
7. **advisory（纯）**：调用
   ```ts
   collectDispatchAdvisories({
     ...完整 DispatchPreflightInput,
     roster: 最新名单,            // 不是 pinned roster；pinned 仅用于 run 专属 advisory/模块元数据
     d3Selected: 最新 D3,         // 不是 pinned D3；pinned 仅用于 run 专属 advisory/模块元数据
     run: { state, runId?, roles?, modules? }, // run 可省略（无 manifest/不可用）；legacy 仅 advisory 事实；roles/modules 为 pinned manifest 事实
     runFacts: { ... },           // 第 5 步的会话层观察
     versionedDocBaselineViolations, // 第 6 步 verifyVersionedDocBaselines 结果（若有）
   })
   ```
   返回 `DispatchAdvisory[]`（可为空）；**不存在把 `ok:true` 变 `ok:false` 的路径**；全部 code 只由 collector 产出。
8. **`task.created`**：按方案 §5.5 锚点规则（draft 直接锚定；pinned 仅在校验通过、roster 成功、目标/模块覆盖时锚定；否则省略并按 R2 记 advisory）；模块字段按目标区分（实现目标仅属主写；verifier 模块存在即写 `moduleId`/`modulePaths`；文件型模块不写 `moduleDirectory`）。
9. **投递/回执**：`planDispatchDelivery` 契约引用缺失仍拒投并 `task.closed(rejected)`；投递成功后回执追加 advisory 摘要（最多 3 条 + 「另有 N 项，见诊断记录」）、`emitDeliveryNote` 一行「状态提示（未阻断）」、诊断按 code 记录 `tasks.dispatch.advisory`。

**桌面应调用什么、返回什么：**

| 时点 | 调用 | 输入 | 返回/用途 |
| --- | --- | --- | --- |
| 事实收集前（`:6137` 后） | `evaluateDispatchAuthorization`（`workflow-preconditions.ts`） | 6 个授权事实（§2.1） | `{ok:true}` 或失败（`code/message/rejection`）；失败即终止 |
| run 记账/handoff pin 后、版本基线后、`task.created` 前 | `collectDispatchAdvisories`（`dispatch-advisories.ts`） | 完整 `DispatchPreflightInput` + `runFacts` + 版本违规 | `DispatchAdvisory[]`；空数组 = 无提示 |
| 纯测试/其它调用方 | `evaluateDispatchPreflight`（复合入口） | 完整 `DispatchPreflightInput` | `{ok:true, advisories}` 或授权失败；内部复用同一窄步骤 |

- **不**要求 B1 在 `routeStarDispatch` 调用 `evaluateDispatchPreflight`；该复合入口保留为契约层/测试层入口，避免第二次授权评估。
- 桌面不得复制 `evaluateDispatchAuthorization` 的判定逻辑，不得自行解释 `targetExists`/allowlist；只做事实收集与调用。

### 3.3 R1 逐项落实与证据分工

| R1 条目 | A1 提供 | B1/D1 取证 |
| --- | --- | --- |
| R1-a 硬授权先于 run 账本写入 | `DispatchAuthorizationInput` 只有 6 个授权事实；复合入口先调窄步骤；旧状态分支删除 | 桌面集成：硬拒绝时 `ensureDraftRun` 未被调用 / 无新 draft run；`tasks.jsonl` 行数不变；目标会话未打开 |
| R1-b 硬授权事实最小化 | 窄输入不含 chain facts/run/roster/module；A1 单测只用 6 字段即可跑全矩阵 | B1 在 `:6130-6137` 后即可调用，不依赖 `chainDispatchFacts` |
| R1-c 单一公开入口 | `evaluateDispatchPreflight` 保留；内部复用 `evaluateDispatchAuthorization`；无第二份谓词 | P1 审核本提案；D1 只读核对无重复判定 |
| R1-d advisory 不反向影响硬授权 | collector 返回数组、无 `ok` 字段；复合入口授权失败直接返回；单测钉住 | B1 状态读取失败按缺事实处理；D1 观察 `ok:true` + advisory |
| R1-e 测试 | 硬授权矩阵、`targetExists`、每个 advisory code、链顺序、空数组、不返回拒绝 | B1：硬拒绝零任务/零会话/零 draft run、调用顺序、状态缺失受理、`run-required` 正例；D1 全量 |

**调用图对齐（P1-R-03）**：最终顺序固定为 **硬授权 → 事实收集 → run 只读/记账（含 handoff pin）→ `verifyVersionedDocBaselines` → `collectDispatchAdvisories` → `task.created` → 投递/回执**；与 B1 §2.2 逐项一致。run 记账/handoff pin 的写入均在硬授权通过之后；collector 在版本基线之后调用，因此能拿到 `versionedDocBaselineViolations`；`task.created` 在 collector 之后，advisory 可随回执返回。

`run-required` 正例（有 `flowId` 时保证 run 锚点）由 B1/D1 覆盖；A1 不改 `task-state.ts`，也无法在纯逻辑层证明会话锚点。A1 的职责是提供「硬授权不依赖 run 事实」的结构性可测点。

---

## 4. 逐项行为映射（方案 §3.1 / §5.3.1）

### 4.1 硬授权矩阵（保留拒绝）

| 来源 | 目标 | 判定 | code |
| --- | --- | --- | --- |
| 任意 | 自己 | 硬拒 | `self-dispatch` |
| 非幕僚/运营 | 任意 | 硬拒 | `unknown-source` |
| 幕僚 | 项目 worker（含未知非内置 id） | 硬拒（类型优先） | `chief-to-project-forbidden` |
| 幕僚 | 产品/策划/人事/运营/质检 | 通过 | — |
| 幕僚 | `su`/其它注册表内置但非 allowlist 的 id | 硬拒 | `target-card-missing` |
| 幕僚 | `liaison` 等非内置 id（`isBuiltInGovernanceRoleId` false） | 硬拒（类型优先） | `chief-to-project-forbidden` |
| 运营 | 非质检内置（产品/策划/人事/幕僚等） | 硬拒 | `convener-target-forbidden` |
| 运营 | 质检（`verifier`） | 通过 | — |
| 运营 | 真实存在的项目 worker（`targetExists=true`） | 通过 | — |
| 运营 | 不存在的项目 worker（`targetExists=false`） | 硬拒 | `target-card-missing` |

硬拒绝一律发生在 `task.created` 之前：不写任务行、不打开目标会话、不投递；按 R1 还不得产生/领养 draft run。

### 4.2 旧检查逐项处置

| # | 旧检查/拒绝码 | 现状位置 | A1 处置 | 新 code / 说明 |
| --- | --- | --- | --- | --- |
| 1 | `self-dispatch` | `workflow-preconditions.ts:1189` | 保留硬拒 | `self-dispatch` |
| 2 | `unknown-source` | `:1371` | 保留硬拒 | `unknown-source`；会话层 `routeDispatch:5786-5803` 来源校验保留 |
| 3 | `chief-to-project-forbidden` | `:1191-1197` | 保留硬拒 | 目标类型级；`!targetBuiltIn` 即拒，不按 `sideEffect` |
| 4 | 内置 allowlist（`su`/未知内置） | 现状无显式 allowlist | 新增硬拒 | 显式 `CHIEF_DISPATCHABLE_BUILT_INS`；`su`/其它注册表内置但非 allowlist → `target-card-missing`；`liaison` 非内置 → `chief-to-project-forbidden` |
| 5 | `convener-target-forbidden` | `:1283-1289` | 保留硬拒 | 运营只可派项目 worker/质检 |
| 6 | `target-card-missing`（运营→项目 worker 目标存在性） | `:1365-1367` | 保留硬拒、前移到授权阶段 | 用 `targetExists`；文案覆盖角色卡/边界未就绪、id 拼写、枚举不可用；owner=nominator；旧别名保留 |
| 7 | `target-card-missing`（幕僚→运营 D3 选中卡齐备） | `:1264-1276` | 降级 advisory | `d3-selected-cards-incomplete`（列出缺卡 id） |
| 8 | `flow-required` | `:1200-1205`、`:1216-1218`、`:1252-1254`、`:1311-1313` | 降级 advisory | `flow-required`（链首个未满足项） |
| 9 | `intent-missing` | `:1206-1212` | 降级 advisory | `intent-missing` |
| 10 | `proposal-missing` | `:1219-1225` | 降级 advisory | `proposal-missing` |
| 11 | `roster-missing` | `:1226-1232` | 降级 advisory | `roster-missing` |
| 12 | `roster-modules-missing` | `:1234-1240` | 降级 advisory | `roster-modules-missing`；与 `roster-missing` 同链只报首个 |
| 13 | `env-bootstrap-missing` | `:1241-1248` | 降级 advisory | `env-bootstrap-missing` |
| 14 | `d3-missing` | `:1258-1263` | 降级 advisory | `d3-missing` |
| 15 | `run-missing` | `:1255-1257`、`:1302-1304` | 删除（不再产生） | RULES 条目保留供历史码表；run 记账失败改为 `run-ledger-unavailable` |
| 16 | `run-pin-required` | `:1305-1307` | 降级 advisory | `run-pin-required`（draft 且需要 pin；可与 `run-pin-failed` 同时，见 P1-R-01） |
| 17 | `run-role-missing` | `:1308-1310` | 降级 advisory | `run-role-missing`（pinned roles 定义且不含目标；roles 未定义时不产出，不伪造；任务不锚定该 run） |
| 18 | `run-legacy-readonly` | `:1290-1295` | 降级 advisory | `run-legacy-readonly`（会话层 `hasLegacyFlowTask` 映射的 advisory 事实；任务锚点仍用本地 draft） |
| 19 | `handoff-missing` | `:1296-1301` | 降级 advisory | `handoff-missing` |
| 20 | `module-required` | `:1326-1328` | 降级 advisory | `module-required` |
| 21 | `module-missing` | `:1322`、`:1332-1335` | 降级 advisory | `module-missing` |
| 22 | `module-not-owned` | `:1336-1342` | 降级 advisory | `module-not-owned`；verifier 例外：模块存在即保留元数据，不要求属主 |
| 23 | `module-path-invalid` | `:1348` | 降级 advisory | `module-path-invalid` |
| 24 | `module-path-outside` | `:1354-1356` | 降级 advisory | `module-path-outside` |
| 25 | `target-not-nominated` | `:1359-1364` | 降级 advisory | `target-not-nominated` |
| 26 | 派发触发的 run-change（`runChangeRejectionForDispatch`/`dispatchFrozenConflictDetail`） | `session.ts:2050-2130`、`:6206-6222` | 删除代码路径（B1） | A1 不写 session；run-change 卡/显式入口/提案卡路径保留 |
| 27 | run 读取/草案创建/pinned 哈希/pinned roster 失败 | `session.ts:6150-6178` | 降级 advisory（B1 接线） | `run-ledger-unavailable`/`run-document-hash-mismatch`/`run-pinned-roster-invalid`/`run-pin-failed`；A1 提供 code 与 `runFacts` 字段 |
| 28 | `versioned-doc-baseline-violation` | `session.ts:6225-6242` | 降级 advisory（B1 接线） | `versioned-doc-baseline-violation`；A1 提供 code 与 `versionedDocBaselineViolations` 字段 |
| 29 | handoff pin 失败/pin 后校验失败/早退（无 runManifest/无 flowId） | `session.ts:6244-6276`（早退 `:6245-6247`） | 降级 advisory（B1 接线） | `run-pin-failed`（pin 失败）+ `run-pin-required`（run 仍 draft，可同时）；`run-ledger-unavailable`（无 runManifest/无 flowId）；pin 后 verify/roster 失败按 `run-document-hash-mismatch`/`run-pinned-roster-invalid`；R2 三类分开 |
| 30 | `planDispatchDelivery` 引用缺失 | `session.ts:5857-5861`、`:6331-6349`；`handback.ts:353-378` | 保留（不属于本提案） | 运行文案逐字不变；A1 不改 `handback.ts` |
| 31 | 目标会话无法打开 | `session.ts:6354-6369` | 保留（B1） | 任务 `task.closed(rejected)`，不投递 |
| 32 | 任务状态写入失败 | `session.ts:6313-6318` | 保留（B1） | 不投递；不自称受理 |
| 33 | 重复幂等抑制 | `session.ts:6110-6125` | 保留（B1） | 业务去重；不产生 advisory |
| 34 | `chiefRoleId === null` | `session.ts:6135-6137` | 保留但调整（B1） | 仅当来源/creator 无法确定时拒；运营来源不误伤；输入允许 `null` |
| 35 | 空 `roleId`/`task` | `session.ts:5777-5779` | 保留（B1） | 输入校验 |

> 名单解析内部码（`roster-reference-missing`/`-stale`/`roster-modules-drift`/`roster-module-owner-invalid` 等）仍保留在解析器，不新增派发拒绝码；在派发链只作为 advisory 的原因文本。

### 4.3 `mechanical-rejection.ts` 文案与码表

- 仅更新 `RULES["target-card-missing"].action`，owner 保持 `nominator`；`retryable` 保持 `true`；docs 保持 `角色卡/<id>/role-card.md`、`角色卡/<id>/boundary.yaml`。
- 新 action 文案（单一来源）：
  > 先确认目标 id 拼写与类型：幕僚只能派产品/策划/人事/运营/质检，运营只能派真实存在的项目 worker 或质检；若目标是项目 worker 且角色卡/边界尚未就绪，请人事按 D3 完成写卡后重试。不要改写名单绕过。
- `target-card-missing` 的 `message`（由 `evaluateDispatchAuthorization` 提供）分两种，但同一 code：
  - 运营→不存在的项目 worker：`目标角色不存在/未枚举到（<id>）；可能是角色卡或边界未就绪、id 拼写错误，或本次角色枚举不可用。`
  - 幕僚→非 allowlist 内置 id：`目标角色 <id> 不是可派发的内置角色（幕僚可派产品/策划/人事/运营/质检）。`
- 保留 `LEGACY_CODE_ALIASES.M5_TARGET_CARD_MISSING → target-card-missing`；不新增拒绝码；不修改 `rejectionMapSnapshot` 的既有 code 集。

---

## 5. advisory 规则

### 5.1 通用规则

1. **按来源→目标链，链上只报首个未满足项**；独立 run/版本/会话级 advisory 可追加（按 §5.3 的固定顺序）。
2. **链级 latest 优先，run 专属用 pinned 事实**：`input.roster`/`input.d3Selected` 由会话层传最新值；**链级** `target-not-nominated`/`d3-*`/`roster-*`/`module-*` 用 latest；**run 专属** `run-role-missing` 用 `run.roles`、run 专属 `module-missing` 用 `run.modules`（pinned），不覆盖 latest 链级判定（P1-R-15）。
3. **`run-legacy-readonly` 由会话层事实**：B1 在 `hasLegacyFlowTask === true` 时把 collector 的 `run` 事实设为 `{state:"legacy"}`（**仅 advisory 事实**，即使本次 `ensureDraftRun` 已成功）；任务锚点仍用本地 `runManifest` draft，不把 `legacy` 当锚点。collector 只读该事实，不自己读盘（P1-R-02 方案 (a)）。
4. **纯函数、不读盘/写盘、永不 `ok:false`**；无事实/事实不完整按缺失处理；无任何提示 → `[]`。
5. **每条 advisory 一句人话**（`message`），技术 code 只在 `code`；不出现「已受理/已满足/已确认/拒绝」等结论词；最多由会话层展示 3 条（collector 不截断）。
6. **同一 code 不重复报，但不同 code 可组合**：`runFacts.pinFailed=true` 时**至少**报 `run-pin-failed`（无条件）；若 `run.state === "draft"`，同时报 `run-pin-required`（顺序固定：`run-pin-failed` 在 `run-pin-required` 之前）；若 run 不可用/无 manifest，另按 `run-ledger-unavailable` 口径处理，此时不产 `run-pin-required`（无 draft），但已有 `pinFailed=true` 事实时仍产 `run-pin-failed`（P1-R-01）。`d3Selected` 为空时只报 `d3-missing`，不再报 `d3-selected-cards-incomplete`；链级 `module-missing` 已产出时，不再追加 run 专属的同 code。

### 5.2 链顺序（链上首个未满足项）

| 来源→目标 | 链顺序 |
| --- | --- |
| 幕僚→产品/质检 | 无链检查 |
| 幕僚→策划 | `flow-required` → `intent-missing` |
| 幕僚→人事 | `flow-required` → `proposal-missing`（方案或架构缺一即触发）→ `roster-missing` → `roster-modules-missing` → `env-bootstrap-missing` |
| 幕僚→运营 | `flow-required` → `d3-missing` → `d3-selected-cards-incomplete` |
| 运营→项目 worker | `handoff-missing` → `flow-required` → 模块链（`module-required` → `roster-missing` → `module-missing` → `module-not-owned` → `module-path-invalid` → `module-path-outside`）→ `target-not-nominated` |
| 运营→质检 | `handoff-missing` → `flow-required` →（仅当带 `moduleId`）`roster-missing` → `module-missing`；无属主/路径/选中检查 |

### 5.3 独立 advisory（链后按固定顺序追加）

| 顺序 | code | 触发（纯输入事实） |
| --- | --- | --- |
| 1 | `run-legacy-readonly` | 运营来源且 collector `run.state === "legacy"`（B1 由 `hasLegacyFlowTask` 映射；任务锚点仍用本地 draft） |
| 2 | `run-pin-failed` | `runFacts.pinFailed === true` |
| 3 | `run-pin-required` | `run.state === "draft"`，且（幕僚→运营 handoff 或运营→项目 worker/质检）；**不再以 `!pinFailed` 为前提**；pinFailed=true 且 run 仍 draft 时与 `run-pin-failed` 同时出现，顺序固定为 2→3（P1-R-01） |
| 4 | `run-role-missing` | `run.state === "pinned"` 且目标非内置且 `run.roles !== undefined` 且不含 `targetRoleId`；`run.roles === undefined` 时按**无事实**处理：**不产出**（不伪造 roles）、任务不锚定该 pinned run，B1 证据/实施记录「pinned manifest 未声明 roles，无法证明覆盖」的限制；**B1 不得在会话层补产 `run-role-missing`**（P1-R-08-R1） |
| 5 | `module-missing`（run 专属） | `run.state === "pinned"` 且 `moduleId` 存在且 `run.modules !== undefined` 且不含该 `moduleId`；`run.modules === undefined`（旧 manifest 无该字段）时按**无事实**处理：不产该 advisory、任务不锚定该 pinned run，B1 证据记录该限制，**B1 不得在会话层补产 run 专属 `module-missing`**；链级 `module-missing` 已产出时跳过（P1-R-08 方案 (a)/P1-R-08-R1：`run.modules` 为 pinned manifest 模块 id，不用 latest roster 冒充）。B1 在 roles/modules 未声明时可不向 collector 传 `run`、只传 `runFacts`；collector 对 `run` 缺省与 `run` 无 roles/modules 均按无事实处理 |
| 6 | `run-ledger-unavailable` | `runFacts.ledgerUnavailable === true`（无 runManifest/无 flowId 或 run 读取/草案创建失败） |
| 7 | `run-document-hash-mismatch` | `runFacts.documentHashMismatch === true` |
| 8 | `run-pinned-roster-invalid` | `runFacts.pinnedRosterInvalid === true` |
| 9 | `versioned-doc-baseline-violation` | `versionedDocBaselineViolations` 非空（一条，最多列 3 个路径） |

### 5.4 advisory 文案模板（`message`，技术 code 不进正文）

| code | 模板 |
| --- | --- |
| `flow-required` | 未携带/无法推断 flowId；本次不关联 run 记录。 |
| `intent-missing` | 尚无产品意图文档；策划可先接任务，但产出依据可能不足。 |
| `proposal-missing` | 尚无方案/架构文档；人事发 D3/写卡前仍需这些材料。 |
| `roster-missing` | 尚无合法名单；人事暂时无法发 D3/写卡。 |
| `roster-modules-missing` | 名单缺模块清单；模块归属信息不可用。 |
| `env-bootstrap-missing` | 名单缺 env-bootstrap 且未声明省略理由。 |
| `d3-missing` | 尚无 D3 选中角色；运营派实现时目标可能不存在。 |
| `d3-selected-cards-incomplete` | D3 选中角色卡未齐备（缺：<ids>）；运营为内置角色，不需写卡；不阻断交付。 |
| `handoff-missing` | 尚未收到幕僚的交付任务；不阻断本次派发。 |
| `run-legacy-readonly` | 该 flow 有 legacy 历史任务；本次按新 run 记账，不阻断。 |
| `run-pin-required` | run <runId?> 仍为 draft/未 pin；实现与验收的冻结契约不可用，不阻断派发。 |
| `run-pin-failed` | run <runId?> 的 pin 尝试失败；run 保持 draft/缺失，不伪造 pinned。 |
| `run-role-missing` | 目标 <target> 不在 pinned run 的角色集；不阻断派发。 |
| `run-ledger-unavailable` | run 记录不可用；任务不带 run/flow 锚点，不阻断。 |
| `run-document-hash-mismatch` | pinned run 文档哈希与 manifest 不一致；不重写、不阻断，任务不锚定该 run。 |
| `run-pinned-roster-invalid` | pinned run 的 roster 读取/校验失败；不重写、不阻断，任务不锚定该 run。 |
| `versioned-doc-baseline-violation` | 版本化文档基线有漂移（<paths>）；派发不阻断，旧版本写入仍受只读保护。 |
| `module-required` | 实现任务未带 moduleId；任务照常受理，写入仍受角色边界约束。 |
| `module-missing` | 链级：模块 <id> 不在最新名单内；任务照常受理。run 专属：模块 <id> 不在 pinned run 的模块集；任务不锚定该 run，不阻断受理。 |
| `module-not-owned` | 目标 <target> 不拥有模块 <id>；任务照常受理，写入仍受角色边界约束。 |
| `module-path-invalid` | modulePaths 含非法路径 <raw>；任务照常受理。 |
| `module-path-outside` | modulePaths 中的 <path> 不属于模块 <id>；任务照常受理。 |
| `target-not-nominated` | 目标 <target> 不在最新 D3 选中集合；不阻断本次派发。 |

### 5.5 handoff 事实 → advisory / 锚点决策矩阵（P1-R-12）

| handoff 事实 | advisory | 任务锚点 |
| --- | --- | --- |
| `runManifest === undefined` / 无 flowId / run 读取或 `ensureDraftRun` 失败 | `run-ledger-unavailable`；无 flowId 时另有 `flow-required` | 省略 `flowId`/`runId`/`runState`；仍写 `stepId=project-handoff` |
| run 为 draft，pin 尝试失败 | `run-pin-failed` + `run-pin-required`（run 仍未 pin；顺序固定） | 锚定已有 draft：`runId` + `runState:"draft"` +（有 flowId）`flowId`；不伪造 pinned |
| run 为 draft，pin 未尝试 | `run-pin-required` | 锚定已有 draft（同上） |
| run 为 pinned，`verifyPinnedRun` 失败/violations | `run-document-hash-mismatch` | 省略三者；不锚定失效 pinned |
| pin 成功但 post-pin verify/`loadPinnedRoster` 失败 | `run-document-hash-mismatch` / `run-pinned-roster-invalid` | 省略三者；不伪称 draft（磁盘已 pinned） |
| pin 成功且 verify/roster 成功，但目标不在 pinned roles | `run-role-missing` | 省略三者 |
| pin 成功且 verify/roster 成功，带 moduleId 但模块不在 pinned modules | `module-missing`（run 专属） | 省略三者 |
| 以上校验全部通过 | 无 pin 失败 advisory | 合法 pinned 锚定（目标内置或项目 worker 在 roles；带 moduleId 时模块在 pin 名单） |

---

## 6. 测试计划（A1）

### 6.1 `test/编排/workflow-preconditions.test.ts` 迁移映射（方案 §7.3）

| 旧位置/测试 | 旧断言 | 迁移后断言（不删除、不新增 skip、不放松） |
| --- | --- | --- |
| `:474-493` `preflight()` helper | 无 `targetExists` | 默认加 `targetExists: true`；保留其余默认值 |
| `:495-560` M1–M8 | 缺意图/方案/名单/模块/D3/缺卡 → `ok:false` 指定 code | 缺意图 → `ok:true` + `intent-missing`；缺方案 → `proposal-missing`；缺名单 → `roster-missing`；缺模块 → `roster-modules-missing`；缺 D3 → `d3-missing`；D3 缺卡 → `d3-selected-cards-incomplete`（消息含 `implementer`，并保留旧 `/内置角色/` 语义：运营为内置角色、不需写卡）；幕僚→worker 仍 `ok:false` `chief-to-project-forbidden` |
| 同上 convener 块 | 未接交付/名单外/缺卡 → 拒；名单内+有卡/质检 → 放 | 未接交付 → `ok:true` + `handoff-missing`；名单外 → `ok:true` + `target-not-nominated`；缺卡场景改为硬负例：`targetExists:false` → `ok:false` `target-card-missing`；名单内+有卡 → `ok:true` 且 `advisories` 为空；质检 → `ok:true` |
| 同上 运营→产品 | `convener-target-forbidden` | 保持不变（硬负例） |
| `:562-571` 幕僚→产品/质检；自派/未知来源 | 保持不变 | 保持正/负例；补幕僚→`su` → `target-card-missing`；幕僚→未知非内置 `foo` → `chief-to-project-forbidden`（AC-1.6）；`liaison` 不按内置测（`isBuiltInGovernanceRoleId` false，真实路径 `chief-to-project-forbidden`）；若测未知内置，用纯函数显式 `targetBuiltIn:true` 的 synthetic case 并注明 |
| `:580-598` flowId | 缺 flowId → `flow-required` 拒 | `ok:true` + `flow-required`；幕僚→运营与运营→worker 各一例；用 `advisories.some` 断言 |
| `:836-854` run | 缺 run → `run-missing`；draft → `run-pin-required`；roles 缺 → `run-role-missing` | 缺 run + `runFacts:{ledgerUnavailable:true}` → `ok:true` + `run-ledger-unavailable`；draft handoff → `run-pin-required`；impl draft → `run-pin-required`；pinned roles `["qa"]` → `run-role-missing`；`draftHandoff` 正例仍 `ok:true` |
| `:856-866` legacy | `run-legacy-readonly` 拒 | `ok:true` + `run-legacy-readonly` |
| 其余 roster/modules/报告路由测试 | 不变 | 不变 |

另补 `evaluateDispatchAuthorization` 直接硬矩阵（自派/来源/幕僚 allowlist/运营类型与存在性），以及 `evaluateDispatchPreflight` 的复合行为（硬失败无 `advisories`；成功带数组）。**`targetExists` 兼容窗口（PM §5.2）**：复合入口省略 `targetExists` + `targetCardFound=false`（运营→项目 worker）→ 硬 `target-card-missing`；省略 + `true` → 通过；窄入口显式 `false`/`true` 各一例；复合成功带 `advisories`、失败不带。**legacy 事实（P1-R-02）**：`run.state="legacy"` → `run-legacy-readonly`；A1 只测 collector 事实映射，任务锚点解耦由 B1 集成测试覆盖。

### 6.2 新增 `test/编排/dispatch-advisories.test.ts` 用例矩阵

每个 code 至少一正一负；链顺序、独立追加、空数组、从不返回拒绝：

| code | 正例触发 | 负例（不触发） |
| --- | --- | --- |
| `flow-required` | 幕僚→策划 `flowId` 缺省 | 有 `flowId` 且意图存在 |
| `intent-missing` | 幕僚→策划 `flowId` 有、`intent.found=false` | `intent.found=true` |
| `proposal-missing` | 幕僚→人事 `proposalFound=false` 或 `architectureFound=false` | 两者 true |
| `roster-missing` | 幕僚→人事 `roster` 缺省/`ok:false` | `roster.ok=true` |
| `roster-modules-missing` | `roster.ok=true` 且 `modules=[]` | 模块非空 |
| `env-bootstrap-missing` | 名单无 env 且 `omitted!==true` | 有 env 或 `omitted:true` |
| `d3-missing` | 幕僚→运营 `d3Selected=[]` | 非空 |
| `d3-selected-cards-incomplete` | 幕僚→运营 `d3Selected` 非空、`targetCardFound=false`、`missingSelectedCardIds` 有值 | `targetCardFound=true` |
| `handoff-missing` | 运营→worker `handoffFound=false` | `true` |
| `run-legacy-readonly` | `run.state="legacy"` | draft/pinned |
| `run-pin-required` | 运营→worker `run.state="draft"`（可与 `run-pin-failed` 同时） | pinned；run 缺省/不可用（无 draft 可报） |
| `run-pin-failed` | `runFacts.pinFailed=true` | 缺省/false |
| `run-role-missing` | pinned、`run.roles=["qa"]`、目标 `implementer` | roles 含目标；`run.roles=undefined`（无事实，不产出、不伪造、不锚定该 pinned run；B1 不得在会话层补产） |
| `run-ledger-unavailable` | `runFacts.ledgerUnavailable=true` | 缺省/false |
| `run-document-hash-mismatch` | `runFacts.documentHashMismatch=true` | 缺省/false |
| `run-pinned-roster-invalid` | `runFacts.pinnedRosterInvalid=true` | 缺省/false |
| `versioned-doc-baseline-violation` | `versionedDocBaselineViolations=["docs/product/x.md"]` | `[]`/缺省 |
| `module-required` | 运营→worker `moduleId` 缺省 | 有 `moduleId` |
| `module-missing` | 链级：`moduleId` 不在最新名单 | 模块存在于最新名单 |
| `module-missing`（run 专属） | pinned、`run.modules=["impl-core"]`、`moduleId="impl-test"`、模块存在于最新名单 | `run.modules` 含该模块；`run.modules=undefined`（无事实，不产出、不锚定该 pinned run；B1 不得在会话层补产）；链级已产出时跳过 |
| `module-not-owned` | 模块存在、目标非属主（项目 worker） | 目标是属主；verifier 非属主不触发 |
| `module-path-invalid` | `modulePaths=["../x"]` | 合法路径 |
| `module-path-outside` | `modulePaths=["src/other.ts"]`、模块 `src/` | 模块路径内 |
| `target-not-nominated` | 运营→worker `d3Selected=[]`（模块/交付/flow 均满足） | `d3Selected` 含目标 |

另测：

- **链顺序**：幕僚→人事 `flowId` 缺省 + 方案缺 + 名单缺 → 仅 `flow-required`；`flowId` 有 + 方案缺 + 名单缺 → 仅 `proposal-missing`；方案有 + 名单缺 + 模块缺 → 仅 `roster-missing`；以此类推。
- **独立追加**：幕僚→运营 `d3Selected=[]` + `run.state="draft"` → 同时含 `d3-missing` 与 `run-pin-required`（顺序固定）。
- **R2 组合（P1-R-01）**：`runFacts.pinFailed=true` + `run.state="draft"`（handoff）→ **同时**含 `run-pin-failed` 与 `run-pin-required`，顺序固定为 `run-pin-failed` 在 `run-pin-required` 之前；`pinFailed=true` + run 不可用 → `run-ledger-unavailable` + `run-pin-failed`（若该事实存在），不产 `run-pin-required`（无 draft）。
- **legacy 事实（P1-R-02）**：`run.state="legacy"` → `run-legacy-readonly`；即使同一输入另有 draft 锚点事实，collector 只按传入的 `run.state` 产出 advisory，任务锚点由 B1 用本地 draft（A1 不测锚点）。
- **latest/pinned 分离**：运营→worker `d3Selected=["implementer"]`（latest）+ `run.roles=["qa"]`（pinned）→ 有 `run-role-missing`、无 `target-not-nominated`；`run.modules` 只影响 run 专属 `module-missing`，不影响链级模块判定。
- **空 advisory**：幕僚→产品、全部事实齐备且无 run/版本事实 → `[]`。
- **不返回拒绝**：缺 roster/run/模块等输入只返回数组，不抛错、不返回 `ok:false`/`rejection`。
- **verifier 例外**：运营→质检带 `moduleId`、模块存在、verifier 非属主 → 无 `module-not-owned`/`module-path-*`/`target-not-nominated`；模块缺 → `module-missing`；roster 缺 → `roster-missing`。
- **模块路径等价性（P1-R-10）**：用同一组路径输入表驱动 advisory 分类，覆盖反斜杠（`src\\a.ts`）、绝对路径（`/x`、`C:/x`）、`..`、通配（`src/*`）、目录尾斜杠与文件尾斜杠；断言 invalid / outside / ok 与 roster 解析器 `normalizeModulePath` 规则一致。若测试无法直接访问私有 helper，则以同一规则表构造期望值并在测试注释注明；不为此在 A1 临时新增共享模块。
- **targetExists 兼容窗口（PM §5.2）**：复合入口省略 `targetExists` + `targetCardFound=false`（运营→项目 worker）→ 硬 `target-card-missing`；省略 + `true` → 通过；显式 `false`/`true` 的窄入口各一例；不得让 collector 二次推断。

### 6.3 R1 的测试分工

- **A1（本阶段）**：`evaluateDispatchAuthorization` 全硬矩阵；`evaluateDispatchPreflight` 复合行为；`collectDispatchAdvisories` 全 code 矩阵/链序/空数组。结构性证明：窄输入只有 6 个授权字段，无法依赖 chain facts/run/roster/module。
- **B1（桌面窗口）**：`routeStarDispatch` 集成测试覆盖 R1-e——
  - 硬拒绝（运营→非质检内置且带 `flowId`；幕僚→项目 worker；自派；未知来源）不产生 `tasks.jsonl` 行、不打开目标会话、不产生/领养 draft run（注入/观察 `ensureDraftRun` 未被调用，或断言 run 目录/账本无新记录）；
  - 调用顺序测试（session 集成或对导出窄步骤的可观察调用序）证明硬授权先于 run 记账；B1 始终显式传 `targetExists` boolean，不依赖复合入口回退；
  - 硬授权通过、状态缺失 → `ok:true` + advisory + 任务行 + 投递；
  - **legacy flow（P1-R-02）**：`hasLegacyFlowTask=true` 时即使 `ensureDraftRun` 成功，collector 仍收到 `run.state="legacy"` → advisory `run-legacy-readonly` 存在；任务锚定本地 draft（`runId`/`runState:"draft"`），不把 legacy 当锚点；旧 legacy 记录仍可读；
  - **R2 组合（P1-R-01）**：handoff pin 失败且 run 仍 draft → 回执/诊断同时含 `run-pin-failed` 与 `run-pin-required`（顺序固定），任务锚定已有 draft，不伪造 pinned；
  - **pinned 模块（P1-R-08）**：pinned 且 `moduleId` 不在 `run.modules` → advisory `module-missing`、任务不锚定该 run；`run.roles` 未定义时不产出 `run-role-missing`；
  - 既有 `run-required` 正例（有 `flowId` 时 `task.created` 带 run 锚点）不回归。
- **D1**：方案 §8.1 命令 + `test/桌面应用/**`/`test/编排/**` + T3 全量，核对新增确定性失败 0、新 skip 0。

A1 的退出标准不包含桌面测试与 T3 全量；A1 只跑 §9 的两个命令 + typecheck。

### 6.4 跨角色测试影响（B1 必须处理，A1 不写）

- `test/桌面应用/rejection-copy.test.ts:42-79`（BUG-4）：当前断言幕僚→运营缺 D3 卡 → `ok:false` `target-card-missing`。A1 后该场景变为 `ok:true` + `d3-selected-cards-incomplete`；B1 按方案 §7.3 改为 advisory 断言，并保留硬 `target-card-missing` 文案/owner/别名用例。B1 在迁移后仍使用存在性分支的构造中**显式传 `targetExists`**（新硬负例传 `false`，不依赖复合入口的 `targetCardFound` 回退）。
- 该文件 `:111-128` 的 code→owner 表：`target-card-missing` 仍在 RULES 中，保留；advisory code 不进拒绝 map。
- 其它 6 个桌面测试按团队计划 §4.3 B1 迁移；A1 不改 `test/桌面应用/**`。

---

## 7. 写集与非目标

### 7.1 A1 精确写集（团队计划 §4.3）

| 路径 | 操作 |
| --- | --- |
| `src/common/编排/workflow-preconditions.ts` | 改：输入/结果形状、`evaluateDispatchAuthorization`、`evaluateDispatchPreflight` 复合、删除状态拒绝分支、`target-card-missing` 文案 |
| `src/common/编排/dispatch-advisories.ts` | 新增：`DispatchAdvisory`/`DispatchAdvisoryCode`/`collectDispatchAdvisories` |
| `src/common/编排/mechanical-rejection.ts` | 改：仅 `target-card-missing` action 文案；码表/别名不变 |
| `test/编排/workflow-preconditions.test.ts` | 改：按 §6.1 迁移 |
| `test/编排/dispatch-advisories.test.ts` | 新增：按 §6.2 |
| `角色卡/编排/docs/change/2026-11-02_dispatch-guardrail-relax-A1-evidence/`（A1 实施时） | 证据与原始输出 |
| `角色卡/编排/api-spec.md`、`memo.md`（按需） | 契约/续接记录 |

### 7.2 明确不改（非目标）

- 不改 `src/common/编排/task-state.ts`（含 `run-required` schema）、`run-manifest.ts`、`src/common/门禁引擎/versioned-doc-guard.ts`、`governance-roles.ts`、`src/common/编排/handback.ts`（`planDispatchDelivery` 运行文案）。
- 不改 `app/**`（含 `app/desktop/session.ts`）、`test/桌面应用/**`、`src/common/shared/**`、`src/model/**`、`src/provider/**`、`src/pipeline/**`、其它角色测试目录。
- 不改 `docs/scheduling|acceptance|communication|planning`、角色卡/边界/YAML/changelog（人事治理）；不改 `package.json`/构建/发布配方。
- 不改 schema；不新增拒绝码；不改 `redispatch_task`/`redispatchTask`/`chooseRedispatchTarget`（F4/O7）。
- 不 commit/push/merge/release；不启动应用；不跑 E2E；不接触客户；不伪造测试/命令输出。

---

## 8. 风险与开放点

### 8.1 按 P1 审核已裁决事项（revision 1 已落入，不再作为开放点）

1. **R1 API 形状**：PM 审核 §5.1 裁决「核心协议可接受」；A1 保留 `evaluateDispatchPreflight` 复合入口 + 同模块窄步骤 `evaluateDispatchAuthorization`，并按 P1-R-03 重排调用图（硬授权 → 事实 → run 只读/记账含 handoff pin → 版本基线 → collector → `task.created`）。B1 不调用复合入口、只调窄步骤 + collector，可接受；不要求只调用复合入口（那无法同时满足 R1-a）。
2. **`targetExists`（PM §5.2 裁决）**：复合输入可选、窄输入必填；`resolveTargetExists(input) = input.targetExists ?? input.targetCardFound` 为私有唯一解析点、fail-closed；B1 在 `routeStarDispatch` 始终显式传 boolean；A1 单测覆盖省略 + `targetCardFound=false/true` 与显式 `false/true`；冻结声明标注为「兼容窗口」；后续把复合输入收紧为必填是独立变更。
3. **`runFacts`/`versionedDocBaselineViolations`（PM §5.3 有条件接受）**：仅作为「会话层观察的可选事实（实施级扩展）」；全部可选、collector 不读盘/不推断/不影响硬授权；A1 为每个 fact 各一正一负；冻结声明/E1 记录该口径及超出方案 §5.7 字面的理由。若统筹/沟通/V1 所有者严格按 §5.7 字面否决任何新增字段，A1 停止并回报，按团队计划 §5.4 处理，不自行扩为方案变更。
4. **legacy advisory 事实（P1-R-02 方案 (a)）**：B1 在 `hasLegacyFlowTask=true` 时把 collector 的 `run` 事实设为 `{state:"legacy"}`（仅 advisory）；任务锚点仍用本地 draft，不把 legacy 当锚点。A1 的 `run` 字段注释/冻结声明已写明；B1 补 legacy flow 会话测试。
5. **pinned 模块覆盖（P1-R-08 方案 (a)/P1-R-08-R1）**：`run.modules?: readonly string[]` 最小可选事实，仅 B1 传 pinned manifest 模块 id；collector 在 run 专属场景产 `module-missing`；不得用 latest roster 冒充。`run.roles === undefined` 时不产出 `run-role-missing`，`run.modules === undefined` 时不产出 run 专属 `module-missing`；两者均按无事实处理、任务不锚定该 pinned run，B1 证据记录「pinned manifest 未声明 roles/modules，无法证明覆盖」的限制，且不得在会话层补产同类 code。
6. **模块路径 advisory（P1-R-10）**：`dispatch-advisories.ts` 只 `import type`，模块图仅 type-only 反向引用、运行期无环（`verbatimModuleSyntax` 擦除）；A1 补反斜杠/绝对路径/`..`/通配/目录与文件尾斜杠的等价性测试；与解析器单一来源的共享 helper 不在 A1 写集，需后续独立变更。
7. **i18n**：默认不新增 key；advisory 文案为中文，放在 `dispatch-advisories.ts`，与现有 `workflow-preconditions.ts`/`mechanical-rejection.ts` 的中文拒绝文案同口径；`main.session.acceptedTask` 复用。若确需 i18n，由项目管理按既有目录授权条件写 `src/common/shared/i18n/messages/*` 与 `test/项目管理/shared/i18n.test.ts`；本提案不默认要求。
8. **契约冻结顺序**：A1 退出即冻结 §2 形状（含 `targetExists` 兼容窗口、`runFacts`/`versionedDocBaselineViolations`/`run.modules` 实施级可选事实、R2 组合、legacy 映射、调用图）；B1 只按冻结形状消费；A1 冻结前 B1 不得写引用 `advisories`/`targetExists`/`runFacts`/`run.modules` 的 `session.ts` 代码。任何后续形状变更回编排重跑受影响证据。
9. **advisory 唯一产出点（PM §5.4）**：`collectDispatchAdvisories` 是全部 23 个 code 的唯一产出点；B1 不采用「会话层追加同类 advisory」备选，只做事实收集、合并/截断/呈现/诊断。

**残余待确认**：仅第 3 项的治理解释（若统筹/沟通/V1 严格按方案 §5.7 字面否决任何新增字段，则停止回报）；其余 P1-R 阻断项已按本修订落入提案文本。

### 8.2 其他风险

- **A1→B1 中间态**：A1 改的是现有 `evaluateDispatchPreflight` 行为，而 `app/desktop/session.ts` 仍按旧接线调用；A1 完成到 B1 完成之间，工作树中的桌面行为是未接线中间态，不得启动应用、不得作为候选/发布/验收。D1 只在 A1+B1 同一候选上跑。A1 不运行应用/E2E。
- **`rejection-copy.test.ts` 运行期望**：A1 后该桌面测试的 BUG-4 断言会红（预期，B1 迁移）；A1 的必跑命令不含桌面测试；typecheck 因 `targetExists` 可选保持 0。D1 必须确认 B1 已迁移，不得把该红带入候选。
- **`targetExists` 枚举失败口径**：listing/刷新不可用时项目 worker 目标按 `targetExists=false` 硬拒，不猜；内置目标仍由注册表判定。该口径写入 §2.2，B1 需在失败文案/诊断中如实说明枚举不可用。
- **`run-pin-failed` 与 `run-pin-required` 组合（P1-R-01）**：二者**不再互斥**。`pinFailed=true` 至少报 `run-pin-failed`；若 run 仍为 draft，同时报 `run-pin-required`（顺序固定：failed 在 required 前）；run 不可用/无 manifest 走 `run-ledger-unavailable`。B1 只在 pin 尝试失败时设 `pinFailed=true`，未尝试/有 draft 未 pin 用 `run-pin-required`；测试钉住组合与顺序，避免 R2 混写。
- **legacy 事实与锚点解耦（P1-R-02）**：B1 必须让 collector 的 `run.state="legacy"`（来自 `hasLegacyFlowTask`）与任务锚点使用的本地 `runManifest` draft 分离；若把 collector `run` 直接用于锚点，会把 legacy 当锚点，属实现错误。A1 的 `run` 字段注释/冻结声明已写明。
- **pinned 模块事实（P1-R-08）**：`run.modules` 只由 B1 从 pinned manifest 传入，不得用 latest roster 冒充；`run.modules === undefined`（旧 manifest 无该字段）时按无事实处理、不产 run 专属 `module-missing`，B1 证据记录该限制；`run.roles` 未定义时不产 `run-role-missing`，任务不锚定该 run；run 专属 `module-missing` 与链级同 code 不重复。
- **latest vs pinned**：B1 必须把最新 roster/D3 传给 collector，pinned roster/D3 只用于 run 专属 advisory/模块元数据；若传错，`target-not-nominated`/`d3-*` 会误报。A1 的 latest/pinned 分离用例（§6.2）钉住。
- **`run-required` 正例**：A1 不改 `task-state.ts`；B1 有 flowId 时对所有目标 `ensureDraftRun` 并保证锚点；D1 复跑既有 run-pin 正例。
- **F4**：本提案不触碰 `redispatch`；D1 仍按团队计划 §6.5 做只读 diff 核对。
- **无 task_ops**：不伪造令牌/锁/审批/机器预检；证据以文件哈希与原始输出为准。

---

## 9. 可观察交付与证据计划（A1）

### 9.1 A1 退出命令（最低要求）

```bash
node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/dispatch-advisories.test.ts
npm run typecheck
```

- 预期：两个测试文件全 pass，0 fail / 0 skip / 0 todo；`npm run typecheck` 退出码 0。
- A1 不跑桌面套件、T3 全量或 E2E；这些由 B1/D1/D2 取证。B0 基线（受影响套件 39+50、typecheck 0、T3 3358/3331/9/18）用于 D1 对照。

### 9.2 候选与证据

- 写前基线：目标文件 `git hash-object` + `sha256sum`、HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a`、`git status --short`。
- 候选身份：逐文件 before/after blob + sha256；新增文件同；`git diff --name-only`/`git status` 只含 §7.1 写集；`git diff --cached --name-only` 为空。
- 原始输出：命令、工作目录、Node/npm、退出码、测试计数（pass/fail/skip/todo）、失败原文；跳过项原因。
- 证据路径：`角色卡/编排/docs/change/2026-11-02_dispatch-guardrail-relax-A1-evidence/`（A1 实施时创建）。
- 不 commit/push；不改断言保绿；不新增 skip/todo；不把中间态写成已实施/已验证。

### 9.3 契约冻结声明（A1 退出时写入实施记录）

> A1 冻结以下形状与口径：
>
> - `DispatchPreflightInput`：`targetExists?: boolean`（**复合输入兼容窗口**，窄输入必填；`resolveTargetExists` 私有唯一解析、fail-closed；B1 始终显式 boolean）、`chiefRoleId: string | null`、`runFacts?: { ledgerUnavailable?; pinFailed?; documentHashMismatch?; pinnedRosterInvalid? }`、`versionedDocBaselineViolations?: string[]`（后两项为**会话层观察的可选事实/实施级扩展**，仅可选、collector 不读盘/不推断/不影响硬授权）、`run?: { state; runId?; roles?; modules? }`（`state="legacy"` 仅 advisory 事实，来自 `hasLegacyFlowTask`；`roles`/`modules` 为 pinned manifest 事实）。
> - **run 事实口径（P1-R-15/P1-R-08-R1）**：链级 `target-not-nominated`/`d3-*`/`roster-*`/`module-*` 用 latest；run 专属 `run-role-missing` 用 `run.roles`、run 专属 `module-missing` 用 `run.modules`（pinned），不覆盖 latest 链级判定。`run.roles === undefined` / `run.modules === undefined` 均按**无事实**处理：不产对应 code、任务不锚定该 pinned run；B1 证据/实施记录「pinned manifest 未声明 roles/modules，无法证明覆盖」的限制；**B1 不得在会话层补产同类 code**。B1 在 roles/modules 未声明时可不向 collector 传 `run`、只传 `runFacts`；collector 对 `run` 缺省与 `run` 无 roles/modules 同口径。
> - **实施级可选事实的 §5.7 说明（P1-R-16）**：`runFacts`/`versionedDocBaselineViolations`/`run.modules` 超出方案 §5.7 的字面「新增」清单，但为方案 §4.2 已确认的 advisory 输出与 V1 §5.2「每个 code 正/负例」所必需；做法是复用既有 `DispatchPreflightInput` 事实袋（全部可选），**不新增 `DispatchAdvisoryInput`**，不改 `TaskCreatedEvent`/`DispatchTaskPayload`/`RunManifest`/`tasks.jsonl` schema，不改变产品语义/写集/档位。若统筹/沟通/V1 所有者严格按 §5.7 字面否决任何新增字段，A1 停止并回报，按团队计划 §5.4 处理（见 §8.1 第 3 点）。
> - `DispatchAuthorizationInput`/`DispatchAuthorizationResult`/`DispatchAuthorizationFailure`：窄步骤的公开签名（`Pick` 派生，不是第二份输入形状）；窄输入只含 6 个授权事实。
> - `DispatchPreflightResult.ok:true.advisories`；`DispatchAdvisory`/`DispatchAdvisoryCode`；`evaluateDispatchAuthorization`；`collectDispatchAdvisories`（全部 23 个 code 的唯一产出点）；`evaluateDispatchPreflight`（复合入口，进入后第一个判定步骤复用窄步骤）。
> - R2 advisory 组合：`runFacts.pinFailed=true` + `run.state="draft"` → `run-pin-failed` 与 `run-pin-required` **同时产出**，顺序固定（failed 前、required 后）；run 不可用/无 manifest → `run-ledger-unavailable`。
> - 调用图：**硬授权 → 事实收集 → run 只读/记账（含 handoff pin）→ `verifyVersionedDocBaselines` → `collectDispatchAdvisories` → `task.created` → 投递/回执**；与 B1 §2.2 逐项一致。
> - 导入方向：`dispatch-advisories.ts` 仅 `import type` 反向引用 `workflow-preconditions.ts`；运行期无环（`verbatimModuleSyntax` 擦除类型导入）；模块路径 advisory 的归一化与旧 `normalizeModulePath` 规则等价（等价性测试见 §6.2），共享 helper 不在 A1 写集。
> - `target-card-missing` 码表文案/owner/旧别名（`M5_TARGET_CARD_MISSING`）；不新增拒绝码。
>
> B1 只按此形状消费；任何变更回编排重跑受影响证据。

---

## 10. 请项目管理复审（revision 2）

请按团队计划 §5.3 P1 出口、§6.1 与 Revision 1 复审记录 §R1.3/§R1.4 重点核对：

1. P1-R-15：§5.1 规则 2 已改为「链级 latest / run 专属 pinned」，§9.3 冻结声明同步；
2. P1-R-08-R1：§5.3 第 4/5 行、§6.2、§9.3 已写死保守口径（`run.roles`/`run.modules === undefined` = 无事实、不产 code、不锚定该 pinned run；B1 不得在会话层补产同类 code；B1 证据记录限制）；
3. P1-R-16：§9.3 已补「为何 `runFacts`/`versionedDocBaselineViolations`/`run.modules` 超出方案 §5.7 字面清单」的理由（复用既有事实袋、不新增 `DispatchAdvisoryInput`、不改 schema/产品语义/写集/档位；严格字面否决则停止回报）；
4. 已关闭项（P1-R-01/02/03/05/06/07/09、P1-R-10~13、PM §5.2/§5.4、A1/B1 调用图一致性）在 revision 1 已落实，本 revision 未回退；P1-R-04-R1/P1-R-14 属 B1，A1 文件不改 B1 文档；
5. 输出结论：`recommend approval` / `needs revision` / `not ready`。复审通过前 A1/B1 不写产品代码。

本提案是 `proposal-only, no code`；不声称任何实施、测试、验收或客户确认。

---

## 11. 修订记录（revision 1，按原 P1 审核）

审核记录：`角色卡/项目管理/docs/change/2026-11-02_dispatch-guardrail-relax-P1-review.md`（原审核 218 行 / `dc41989c…`，结论 `needs revision`）。下表逐项列出 A1 落点；P1-R-04/05/06/07/13 属 B1/桌面窗口，本文件不改 B1 提案，仅在 §3.2/§6.3/§8 标注 A1 侧契约与测试分工。

| 编号 | 处置 | A1 落点 |
| --- | --- | --- |
| P1-R-01（阻断） | 采纳 | §5.1 规则 6 删除互斥；§5.3 第 2/3 行改为 pinFailed+draft 可同时；§5.4/§6.2 组合矩阵（`run-pin-failed` 在 `run-pin-required` 前）；§5.5 handoff 决策矩阵；§8.2；§9.3 冻结声明 |
| P1-R-02（阻断） | 采纳方案 (a) | §2.1 `run` 字段注释（legacy 仅 advisory 事实、锚点仍用本地 draft）；§5.1 规则 3；§5.3 第 1 行；§5.5；§6.1/§6.2/§6.3 legacy 测试口径；§9.3 |
| P1-R-03（阻断） | 采纳 | §3.2 重排为硬授权 → 事实 → run 只读/记账（含 handoff pin）→ 版本基线 → collector → `task.created` → 投递；§3.3 调用图对齐说明；§9.3 |
| P1-R-09（阻断 A1 测试） | 采纳 | §2.3 删除 `liaison` 作为内置 id；§4.1/§4.2 更正 `liaison` 为 `chief-to-project-forbidden`；§6.1 用 `su` + synthetic `targetBuiltIn:true` |
| P1-R-08（需写清） | 采纳方案 (a) | §2.1 `run.modules?`；§5.3 第 5 行 run 专属 `module-missing`；§5.4 文案；§6.2 正/负例；§8.2；§9.3 |
| PM §5.2 `targetExists` 裁决 | 落入 | §2.2 兼容窗口与唯一解析；§2.3 补充；§6.1/§6.2 省略/显式正负例；§8.1 第 2 点；§9.3 |
| PM §5.3 `runFacts`/版本字段裁决 | 落入 | §2.1 可选字段；§8.1 第 3 点（有条件接受 + 严格字面否决即停止）；§9.3 标注实施级扩展 |
| PM §5.4 advisory 唯一产出点 | 落入 | §2.1 导出面说明；§2.4；§3.2 第 7 步；§8.1 第 9 点 |
| P1-R-10（建议） | 部分采纳 | §2.4 type-only 环说明；§6.2 模块路径等价性用例；§9.3；**未采纳**「抽共享 helper」——不在 A1 写集，需后续独立变更 |
| P1-R-11（建议） | 采纳 | §2.1 窄类型为窄步骤公开签名；不要求「第一行」源码钉；§9.3 |
| P1-R-12（建议） | 采纳 | §2.2 笔误修正（`chiefRoleId === null`）；§5.5 handoff 事实 → advisory/锚点决策矩阵 |
| P1-R-04/05/06/07/13 | 不属 A1 写集 | 由 B1/桌面窗口按其审核记录修订；本文件仅在 §3.2 第 2 步（P1-R-05 收窄 `:6086`）与 §6.3 B1 测试清单标注 A1 侧预期，未改 B1 文档 |

**未采纳项**：仅 P1-R-10 的「抽共享 helper 作为单一来源」未采纳；理由：A1 写集不含新共享模块，且 `dispatch-advisories.ts` 只允许 `import type` 以避免运行期环；A1 改为同输入等价性测试，单一来源留后续独立变更。其余 A1 项均已落入本 revision。

**本修订不改变**：授权矩阵、advisory 语义、写集、风险档位、客户确认范围；不改产品源码/测试/审核记录/其他角色文档；不 commit/push。

---

## 12. 修订记录（revision 2，按 Revision 1 复审）

复审记录：`角色卡/项目管理/docs/change/2026-11-02_dispatch-guardrail-relax-P1-review.md`（323 行 / SHA-256 `597a585978fc14f28863c2cdd85fb159fe8814461d34d8986b4522203a515003`，含「Revision 1 复审」节，结论 `needs revision`）。复审对象为 A1 Revision 1（684 行 / `2d7335d8…`）。下表只列本轮 A1 剩余项；已关闭项（P1-R-01/02/03/05/06/07/09、P1-R-10~13、PM §5.2/§5.4、A1/B1 调用图一致性）未回退。

| 编号 | 处置 | A1 落点 |
| --- | --- | --- |
| P1-R-15（一般，阻断 A1 文本/冻结） | 采纳 | §5.1 规则 2 改为「链级 `target-not-nominated`/`d3-*`/`roster-*`/`module-*` 用 latest；run 专属 `run-role-missing` 用 `run.roles`、run 专属 `module-missing` 用 `run.modules`（pinned），不覆盖 latest 链级判定」；§9.3 冻结声明同步 |
| P1-R-08-R1（重要，阻断 A1+B1） | 采纳推荐方案（A1 保守口径） | §5.3 第 4/5 行、§6.2 矩阵、§9.3 写死：`run.roles === undefined` / `run.modules === undefined` 按无事实处理，不产对应 code、任务不锚定该 pinned run；B1 证据/实施记录「pinned manifest 未声明 roles/modules，无法证明覆盖」的限制；**B1 不得在会话层补产同类 code**；B1 可不传 `run`、只传 `runFacts`，collector 对 `run` 缺省与 `run` 无 roles/modules 同口径 |
| P1-R-16（建议） | 采纳 | §9.3 补「为何 `runFacts`/`versionedDocBaselineViolations`/`run.modules` 超出方案 §5.7 字面清单」：复用既有 `DispatchPreflightInput` 事实袋、全部可选、不新增 `DispatchAdvisoryInput`、不改 `TaskCreatedEvent`/`DispatchTaskPayload`/`RunManifest`/`tasks.jsonl` schema、不改变产品语义/写集/档位；严格字面否决则停止回报（§8.1 第 3 点） |

**未采纳项**：无新增未采纳项。P1-R-10 的「抽共享 helper」仍按 revision 1 的理由未采纳（不在 A1 写集，需后续独立变更）。

**B1 侧归属（本文件不改 B1 文档）**：P1-R-04-R1（verifier creator 集合含 chief）、P1-R-14（B1 依赖快照更新到 A1 Revision 1）、P1-R-08-R1 的 B1 测试/证据同步由桌面窗口按复审记录 §R1.3 修订；A1 已在 §3.2/§6.3/§8.2 写明 A1 侧预期。

**本修订不改变**：授权矩阵、advisory 语义、写集、风险档位、客户确认范围；不改产品源码/测试/审核记录/B1 文档；不 commit/push。
