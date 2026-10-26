---
id: proof-gate-reviews
type: design
title: Proof 关键节点复核（gate 门禁）——独立复核权归验收，统筹只做证据完整性检查
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: approved-implementing
revision: 3
related: [acceptance-triage, judge-governance-cards-review, invalid-governance-card-guard]
events:
  - date: "2026-10-26"
    kind: created
    summary: 客户确认「独立复核的权威只放在验收角色（Proof）；统筹只协调与检查证据完整性，不再做实质性独立复核；对关键节点设置验收门禁，由 Proof 独立判定」；只读核对 team-plan v2/v3、flow-state/flow-service、interface 的 request_acceptance/验收派发、governance-roles 的 Steward/Proof 卡与 castle-2d 真实流程；给出 gate 节点类型、flow 表达、request_gate_review 通道、Proof/统筹卡变更、应用行为、兼容与 A1–A8；只写设计，未改代码/测试/i18n
  - date: "2026-10-26"
    kind: decided
    summary: 客户曾决定 v1 **只落规则、不实现工具/新 schema**——只把「何时设 gate、gate 计划要素、Proof 独判、统筹不自审」写进 Steward / 统筹角色卡（v1 不含 Crew）；request_gate_review、gateKind、账本 gate.review、多 gate 幂等机制保留为未来可选方案（当时未实施、未授权）；当前实现只用现有步骤与 request_acceptance（最终验收），不新增 FlowStepKind/工具；其他业务项目按规则在计划里设 gate，不要求迁移
  - date: "2026-10-26"
    kind: authorized
    summary: 客户追加授权实现 `request_gate_review`（§5–§8、§12），并要求 gate 复核独立于最终验收、防吹毛求疵——gate fail 必须有 blocker/major，只有 minor/nit 的 fail 退回 Proof、不返工；pass 可带 minor/nit。实现由各能力角色分工进行（**实现中，未验证、未验收**）；项目管理本批只补共享 i18n（13 个 `main.gateReview.*` key）、变更记录与规则同步，未改 flow/桌面/model/provider/门禁卡
---

# Proof 关键节点复核（gate 门禁）：独立复核权归验收

> **状态更新（2026-10-26，客户已授权实施：`approved-implementing`）。** 客户在 v1 `rules-only` 落卡后**追加授权实现** `request_gate_review` 与本设计 §4–§8、§12 的 gate 机制，并追加要求：
>
> - **gate 复核独立于最终验收**：gate 复核 ≠ 验收通过 ≠ 客户批准；gate 结论不写 `customer.decision`、不进入验收分诊；最终验收仍走既有 `request_acceptance`/验收卡链路。
> - **防吹毛求疵**：gate `fail` 必须有 `blocker`/`major` 依据；只有 `minor`/`nit` 的 `fail` 按结构不符**退回 Proof、不触发返工**；gate `pass` 可带 `minor`/`nit` 备注，不因非阻断建议反复开 gate。
> - **范围不变**：不新增治理角色、不新增 `FlowStepKind`、不新增 cardKind；`request_gate_review` 只注入统筹会话，`request_acceptance` 保持最终验收唯一主动通道；无 gate 的旧 flow 行为不变。
>
> **实施状态：实现中，未验证、未验收。** 实现由各能力角色按各自边界分工进行；项目管理本批只补共享 i18n、变更记录与规则同步（`docs/change/2026-10-26_change_request-gate-review.md`），未改 flow/桌面/model/provider/门禁卡。实施完成并经独立验收后另记状态。
>
> **历史状态（2026-10-26 早前，`rules-only`）**：客户曾决定 v1 只落规则、不实现工具/新 schema；`request_gate_review`、`gateKind`、账本 `gate.review`、多 gate 幂等机制当时保留为未来可选方案（**当时未实施、未授权**）。该历史决定已被上述实施授权取代；历史原文保留在下方事件与 §十三。

**本轮性质：设计文档（`approved-implementing`：客户已授权实现，实施进行中）。** 本文记录方案与代码事实。2026-10-26 客户在 `rules-only` 落卡后追加授权实现 `request_gate_review` 与 §4–§8 的 gate 机制（含上述独立性/防吹毛求疵要求）。实现由各能力角色按各自边界分工进行；**本文与相关变更记录不声称已实现、已验证或已验收**。项目管理本批只补共享 i18n key、变更记录与规则同步，未改 `app/**`、`src/common/编排/**`、`src/model/**`、`src/provider/**`、`src/common/门禁引擎/governance-roles.ts`。

## 〇、一分钟摘要

> **当前范围（2026-10-26，客户已授权实施：`approved-implementing`）**：客户在 v1 `rules-only` 落卡后**追加授权实现** `request_gate_review`、`gateKind`、`gate.review` 账本与多 gate 幂等机制（§4–§8、§12），并追加「gate 复核独立于最终验收」与「防吹毛求疵」要求。实现由各能力角色分工进行，**实现中、未验证、未验收**；不新增角色/`FlowStepKind`/cardKind，`request_acceptance`（最终验收）语义不变。历史 `rules-only` 决定见下方事件与 §十三。

- 在流程的**关键节点**增加「验收门禁」（gate）：脚手架后的首个可玩/可用切片、视觉基线、集成/性能，以及保持不变的最终客户验收。gate 由 **Proof 独立复核并给结论**；应用只做确定性记录与硬拦。
- gate 在 Flow YAML 中用**现有 `kind: artifact` + 新增可选 `gateKind` 元数据**表达（**不新增 `FlowStepKind`**）；下游实现步骤把 gate 写进 `dependsOn`，应用既有派发门禁会在 gate 未 `done` 时硬拒下游派发。
- 统筹新增专用请求通道 `request_gate_review({flowId, gateId, note?})`；应用校验 gate 存在且 pending、前置与证据齐备后派 Proof，回执为冻结 code。`request_acceptance` 保持原义，只用于最终验收。
- Proof 写 gate 报告（复用 `acceptance-triage/v1` 结构）、亲自跑/看真实输出（UI/游戏必须关闭 DEBUG 的截图）；**不发验收卡、不写客户决定、不实现、不派发**。gate 失败复用既有返工路由（按 gate 独立记录），返工后再复核。
- 统筹只做「证据完整性检查 + 请求 gate 复核 + 返工协调」，**不得自行标 gate `done`、不得以自查代替 Proof、gate 未 `done` 不派下游依赖步骤**。
- 无 gate 的旧 flow 逐字不变；castle-2d 现有流程本轮不改、行为不变（见 §2.4、§9）。

## 一、目标与非目标

### 1.1 客户已确认的方向（原话要点）

> 独立复核的权威只放在验收角色（Proof）。统筹只协调与检查证据完整性，不再做实质性独立复核。对关键节点设置「验收门禁」，由 Proof 独立判定。

拆成可执行的行为：

1. 流程在关键节点（不只是最后）设 gate；gate 的通过与失败由 **Proof** 独立判定，统筹不判、更不得自行标通过；
2. 统筹在 gate 前的职责收缩为：机械核对「该交的证据是否齐、是否与账本对得上」，然后**请求** Proof 复核；统筹的自查不能替代 Proof；
3. gate 未通过（或未复核）时，下游实现步骤**不能被派发**；gate 通过后流程才继续；
4. 最终客户验收不变：gate 复核不是客户决定，不消耗、不替代、不伪造 `customer.decision`；
5. 不新增治理角色；不新增 `FlowStepKind`；不改变 Proof 的独立验收权与客户的最终决定权。

### 1.2 目标

| ID | 目标 |
| --- | --- |
| G1 | 在风险合适的最早时点，由 Proof 用真实输出判定关键节点是否达标，避免问题积累到最终验收才暴露。 |
| G2 | 把「判」和「协调」分开：Proof 判、应用记、统筹协调；统筹没有通过权。 |
| G3 | gate 结论可审计、可重启恢复、幂等，不重复派发、不重复返工。 |
| G4 | 对下游实现形成**硬拦**：gate 未 `done` 时派发被应用拒绝，而不是靠角色自觉。 |
| G5 | 与现有验收、分诊、返工、账本、Flow YAML 契约兼容；无 gate 的旧流程零变化。 |

### 1.3 非目标

- **不新增治理角色**（不新增内置角色、不新增项目角色模板）；gate 复核仍归内置 Proof（`verifier`）。
- **不新增 `FlowStepKind`**（`dispatch` / `customer-decision` / `artifact` / `acceptance` 不变，见 §4）。
- **不新增客户卡种类**：gate 不发客户验收卡、不进入验收分诊、不写 `customer.decision`。
- **不改变最终验收语义**：`verification` 保留 id、客户决定卡、`acceptance-triage/v1` 分诊、返工重派与收口门全部不变。
- **不改变 Proof 的独立验收权**：gate 只是新增职责，不是新增权力；Proof 仍不实现、不派发、不任命。
- **不改变统筹的写入边界**：仍不能写 `docs/acceptance/**`、`docs/verification/**`、账本或客户决定。
- 本任务不做 CLI、发布配置、打包、版本号变更；不做 castle 流程改造。

## 二、现状核对（代码事实，2026-10-26 只读）

> 行号为当前工作树快照；实施以符号名为准。

### 2.1 Flow 契约与依赖

- `src/common/编排/flow-state.ts`：`FLOW_STEP_KINDS = ["dispatch", "customer-decision", "artifact", "acceptance"]`（约 L47）；`FLOW_EVIDENCE_KINDS` 与步骤 `kind` **一一对应**（约 L68）；验收步骤必须使用保留 id `verification` / `acceptance`、**至多一个**、初始 `pending`，`done` 时必须带 `customer.decision{decisionKind:"acceptance"}` 证据（约 L587–L601、L962–L970）。
- 步骤可选字段已有 `dependsOn` / `parallelGroup` / `supersedes` / `supersededBy`（约 L126–L153）；`dependsOn` 静态校验（存在/自依赖/重复/环，约 L726–L880）且派发门禁在 `src/common/编排/governance-gate.ts::evaluateDispatchGate` 第 6 条解析 `supersededBy` 链后**硬性要求前置 `done`**（拒绝码 `dependencies-not-done` / `dependencies-unresolved`，约 L500–L560）。
- `evaluateFlowCompletion`（约 L1151）要求所有**非 acceptance** 活动步骤 `done` 且证据与账本对账通过；验收步骤按**最新** `customer.decision{decisionKind:"acceptance"}` 决定是否收口。因此任何 `kind: artifact` 的 gate 步骤只要未 `done`，最终验收就不可达——这是天然的硬拦。
- `listReadyFlowSteps`（约 L1351）是只读规划器：`acceptance` / `customer-decision` 永不进入 ready；`artifact` 步骤会进入 ready；`dependsOn` 未 done 标记 `dependency-not-done`。它只驱动「继续调度」提示，不派发、不标 done。
- `observeFlowArtifacts`（`flow-service.ts` 约 L2487）会扫描**所有** `kind: artifact` 步骤的 `evidence.ref`，文件存在即追加 `artifact.observed`（与状态无关）。**gate 步骤必须排除在这条自动观测之外**，否则失败报告也会被当成 done 证据（§8.4）。

### 2.2 派发与验收门

- 自动验收派发：`app/desktop/interface.ts::dispatchAcceptanceForFlow`（约 L4639），结构化回执 `AcceptanceDispatchOutcome`，状态 `dispatched | already-dispatched | blocked | failed`；去重是「运行期 flow mtime + 账本 `dispatch.accepted{targetRoleId:"verifier", stepId:"verification"}`」，flow 更新才允许重派（约 L5058–L5103）。
- 统筹主动通道：`request_acceptance({flowId?, note?})`（`src/model/runtime.ts` 约 L929–L956；工具层 `src/provider/runtime/tools.ts` 约 L2716–L2830；应用实现 `interface.ts` 约 L5283–L5624）。校验顺序：flow 存在 → 验收标准（最新版本、结构合格）→ 变更包 + `riskTier` → `acceptance-criteria` 步骤收口 → `evaluateFlowCompletion` → 引擎解析 → `dispatchAcceptanceForFlow({force:true, trigger:"request"})`；回执 code 冻结为 `dispatched | flow-not-found | criteria-missing | change-package-missing | change-package-no-risk | flow-incomplete | runtime-unresolved | already-dispatched | unavailable`。工具**只路由载荷并如实转达回执**，不写 flow/账本、不做治理判定。
- `request_acceptance` 只对**内置治理角色会话**注入（`session.ts` 约 L2165–L2170；`run-role.ts` 约 L1352–L1356），项目角色不注入；回执明确「请求复核 ≠ 客户批准」。
- 验收分诊：`acceptance-triage/v1` 解析、R1–R7 默认建议、`.ans/governance/acceptance/<flowId>/triage-v1.json` 记录与返工承接均已落地（`flow-state.ts` 公共出口、`interface.ts` 约 L4685–L4734）。gate 复核**不进入**这条链路。

### 2.3 角色卡

- Steward / 统筹（`governance-roles.ts::CONVENER_CARD_TEXT`，约 L628 起）：负责流程/团队计划/readiness/变更包/派发/回交核证；卡文要求「`delivered → done` 由 manager 核证后标记」，并在完成后主动 `request_acceptance`；明确「不派发治理角色、不代替验收」。
- Proof / 验收（`VERIFIER_CARD_TEXT`，约 L836 起）：写实施前验收标准与验收报告、发 `request_choice(cardKind=acceptance)`、验收报告必须带 `acceptance-triage/v1`；「验收权（不是批准权）」；不实现、不派发。
- 写入边界：Steward 的 Section 1 只有 `docs/flows/`、`docs/scheduling/`、`docs/governance/convener/`；`docs/acceptance/**` 归 Proof。**统筹在结构上就写不了 gate 报告**（这是已有的硬边界，本设计不需要新增）。

### 2.4 castle-2d 真实现场（只读参考）

- `demos/castle-2d/docs/flows/castle-2d-game-v1.yaml`：version 11、50+ 步骤、大量 `supersedes` 返工链，最终 `verification` 仍 `pending`；验收报告已到 v5。
- `demos/castle-2d/docs/acceptance/castle-2d-game-v1-report-v5.md`：结论 `fail`（1 blocker / 4 major / 2 minor / 1 nit），其中视觉/证据类问题（窄窗截图缺失、DEBUG 覆盖层旧截图、渲染修复后取证要求）与真实运行问题（level-03 Boss 未击败）在最终验收阶段才集中暴露；`.ans/.../triage-v1.json` 显示分诊已判 `rework` 但流程中**没有对应返工步骤**，导致同一不达标交付被重复验收。
- 结论：gate 的价值不在「多一道验收」，而在**把真实运行与视觉证据的判定前移到问题还便宜的时候**；castle 的教训是最终验收前的多轮返工成本远高于一次早期 gate。

## 三、门禁节点类型与适用范围

### 3.1 四个节点（建议 3 个 `gateKind` + 最终客户验收）

| 节点 | `gateKind` / 现有步骤 | 时点 | Proof 判定内容（摘要） |
| --- | --- | --- | --- |
| **G-1 垂直切片门** | `vertical-slice` | `build-scaffold` 完成 + 首个端到端可玩/可用切片交付后 | 脚手架真实可跑（安装/typecheck/最小测试）、切片是真实贯通（不是 mock/占位）、模块边界与依赖方向符合契约、该切片的核心用户路径可用 |
| **G-2 视觉基线门** | `visual-baseline` | UI/游戏：首个可玩关卡或关键页面完成后；可按关/按页面组多次设 gate | Proof 亲自打开真实浏览器/游戏，按视觉基线逐项核对（布局、像素/缩放、可读性、错误态），**UI/游戏必须关闭 DEBUG 覆盖层后截图/录屏**；不接受只读别人的截图 |
| **G-3 集成/性能门** | `integration-performance` | 各模块交付完成、集成/e2e 与性能证据齐备后，最终验收前 | e2e/契约测试真实通过、性能预算达标或有书面免采、打包/离线/错误路径符合标准、Reduce manifest 与分片原始日志可对账 |
| **G-4 最终客户验收** | 现有 `kind: acceptance` 步骤 `verification`（不变） | 所有 gate 与执行步骤 `done` 后 | 客户（或判断代批）在既有验收卡上决定；Proof 原有验收职责不变 |

说明：

- **最终验收不是 `gateKind`**：它沿用现有 `acceptance` 步骤与客户决定语义；本文所说「gate 复核」只指 G-1–G-3。
- gate 数量不固定：视觉门可按关卡/关键页面设多个（如 `gate-visual-level-01`、`gate-visual-level-02`），集成门通常一个；垂直切片门通常一个。
- `qualityTier: prototype` **不豁免** gate：原型档放宽的是实现完备度，不是「真实运行/真实截图」的独立复核。

### 3.2 按风险档/产品类型的适用矩阵（推荐默认；Q1 待确认）

| 项目类型 \ 风险档 | T0 | T1 | T2 | T3 |
| --- | --- | --- | --- | --- |
| 纯文档/数据/配置（无代码） | 无 | 无（最终验收即可） | 可选集成门 | 集成门 |
| 后端/服务/CLI（无视觉面） | 无 | 垂直切片门 | 垂直切片门 + 集成/性能门 | 全部（含集成/性能门） |
| UI/桌面/Web（有视觉面） | 无 | 垂直切片门 + 视觉基线门（至少 1 次） | 两者 + 集成/性能门；视觉按关键页面 | 全部；视觉按关键页面/状态 |
| 游戏（如 castle-2d） | 无 | 垂直切片门 + 视觉基线门（首关） | 三者；视觉按关 | 全部；视觉按关 + 错误态/窄窗 |

- 档位取团队计划/变更包中**较高**者（沿用现有规则）；gate 数量只增不减。
- 产品类型以提案/团队计划的交付面为准；同一项目后期出现视觉面时，可在新 flow 版本补视觉门（§9）。

### 3.3 gate 复核标准写在哪

- **单一来源**：`docs/acceptance/<flowId>-criteria-vN.md`（Proof 现有产物）中为每个 gate 增加一节，标题必须包含精确 `gateId`，例如：

  ```markdown
  ## Gate 复核标准：gate-vertical-slice（vertical-slice）
  | ID | 标准 | 需要的证据 | 判定 |
  | --- | --- | --- | --- |
  | GV-1 | 脚手架可真实安装/typecheck/跑最小测试 | 命令、日志、退出码 | pass / fail / insufficient evidence |
  ```

- 应用只做**机械检查**：最新 criteria 文件存在、结构合格、标题里出现该 `gateId`；缺节 ⇒ `request_gate_review` 返回 `criteria-missing`，由 Proof 递增 criteria 版本补齐（统筹不写 `docs/acceptance/**`）。
- 不新增独立 gate 标准文件：版本扫描、结构校验、写入边界全部复用现有 criteria；避免多一份需要同步的标准。

## 四、Flow 表达：gate 步骤如何表示

### 4.1 三种候选与取舍

| 方案 | 做法 | 优点 | 代价 / 风险 | 结论 |
| --- | --- | --- | --- | --- |
| **A. 复用 `kind: acceptance` + `gateKind`** | gate 步骤声明 `kind: acceptance`，用 `gateKind` 区分 gate 与最终验收 | 不新增 `FlowStepKind`；gate 天然是人工闸门（ready 规划器永不自动派发） | 与 flow-state 现有验收硬规则正面冲突：验收步骤必须用保留 id、**至多一个**、`done` 必须带 `customer.decision{decisionKind:"acceptance"}`（L587–L601、L962–L970）；`evaluateFlowCompletion` 还会**跳过所有 acceptance 步骤**（L1165），gate 将不再阻塞最终验收。要支持 gate 必须同时放宽这四类规则并给 `gateKind` 分支，直接动到「客户验收」这条最敏感的路径，违背「最终客户验收不变」。 | **不推荐** |
| **B. 新增 `kind: gate`** | `FLOW_STEP_KINDS` 增 `gate`（并同步 `FLOW_EVIDENCE_KINDS`、`FlowToolStepKind` 等跨角色契约） | 语义最干净：解析、证据、门禁、卡片、判断各层都能显式分支 | 新增 `FlowStepKind` 是跨角色契约变更（`model/runtime.ts`、flow-state、flow-service、governance-gate、桌面、角色卡模板、判断机械门槛、测试全链路）；**旧版应用读到含 `kind: gate` 的 flow YAML 会解析失败**（未知枚举），前向兼容更脆；本轮成本与回归面最大。 | **本轮不做**（保留升级路径，见 §4.2 末） |
| **C. 复用 `kind: artifact` + 可选 `gateKind` 元数据**（推荐） | gate 步骤仍是 `artifact`，新增可选字段 `gateKind`；`done` 由应用专用助手按 Proof gate 报告收口，角色不能代标 | 不新增 `FlowStepKind` / evidence kind；`dependsOn` + 派发门禁 + `evaluateFlowCompletion` 的既有硬拦直接生效；解析器只增一个可选字段；与 `acceptance-criteria` 步骤（同为 app 收口的 artifact）同构 | `artifact` 的通用行为（自动观测、manager 可 done）必须对 gate 步骤显式排除；否则失败报告也能当 done 证据（§8.4）。旧版应用读到 `gateKind` 会按未知字段拒绝（fail-closed），需升级应用。 | **推荐** |

**推荐结论：方案 C。** 它同时满足「默认不新增 `FlowStepKind`」与「不触碰最终客户验收语义」。`gateKind` 将来若要升级为独立 `kind: gate`，字段与路径已就位，可平滑迁移（解析器先兼容两种表达，再淘汰旧字段）。

### 4.2 推荐形状（YAML 示例，castle 风格）

```yaml
  - id: build-scaffold-finish
    title: 前置脚手架收口（typecheck + 最小真实测试）
    owner: app-shell
    kind: dispatch
    status: pending
    evidence:
      kind: dispatch
      ref: build-scaffold-finish
    dependsOn: [contract-freeze, role-readiness]

  - id: delivery-engine-core
    title: Map｜engine-core 交付（首个可运行切片）
    owner: engine-core
    kind: dispatch
    status: pending
    evidence:
      kind: dispatch
      ref: delivery-engine-core
    dependsOn: [contract-freeze, build-scaffold-finish]

  - id: gate-vertical-slice
    title: 垂直切片门｜脚手架 + 首关可玩切片（Proof 独立复核）
    owner: verifier
    kind: artifact
    status: pending
    gateKind: vertical-slice
    evidence:
      kind: artifact
      ref: docs/acceptance/castle-2d-game-v1-gate-vertical-slice-report-v1.md
    dependsOn: [build-scaffold-finish, delivery-engine-core]

  - id: gate-visual-level-01
    title: 视觉基线门｜level-01 真实浏览器视觉基线（DEBUG 关闭截图）
    owner: verifier
    kind: artifact
    status: pending
    gateKind: visual-baseline
    evidence:
      kind: artifact
      ref: docs/acceptance/castle-2d-game-v1-gate-visual-level-01-report-v1.md
    dependsOn: [gate-vertical-slice, delivery-presentation, delivery-content-model]

  - id: delivery-sim-core
    title: Map｜sim-core 交付
    owner: sim-core
    kind: dispatch
    status: pending
    evidence:
      kind: dispatch
      ref: delivery-sim-core
    dependsOn: [contract-freeze, build-scaffold-finish, gate-vertical-slice]
```

### 4.3 解析与静态规则（新增，全部只对含 `gateKind` 的步骤生效）

1. `gateKind` 可选；**只允许出现在 `kind: artifact` 的步骤上**，其它 kind 携带 ⇒ 校验失败。
2. 枚举 `FLOW_GATE_KINDS = ["vertical-slice", "visual-baseline", "integration-performance"]`；未知值 ⇒ 失败（严格口径，不猜）。
3. 含 `gateKind` 的步骤 id 必须匹配 `^gate-[a-z0-9]+(?:-[a-z0-9]+)*$`（允许 `gate-visual-level-01` 这类多实例）；不得占用保留验收 id。
4. `owner` 必须是 `verifier`（gate 复核归 Proof；不是可派发目标，`evaluateDispatchGate` 会以 `builtin-target` 拒绝任何派发尝试）。
5. `evidence.kind` 必须是 `artifact`；`ref` 约定为 `docs/acceptance/<flowId>-<stepId>-report-vN.md`（应用收口时按最新版本重写 ref，与 `completeAcceptanceCriteriaStep` 同口径）。
6. 旧 flow 不含 `gateKind` ⇒ 解析、序列化、门禁、ready 规划、证据对账**逐字不变**；未知字段仍拒绝（旧流程不会被误升级）。
7. `listReadyFlowSteps` 建议新增 skip 原因 `awaiting-gate`（gate 步骤永不进入 ready；只是提示面，不是新 `FlowStepKind`）。不新增该原因的备选是维持现状（gate 步骤出现在 ready 列表但内置 owner 不会被 Steward 唤醒），代价是提示面含噪声；推荐新增。

### 4.4 `dependsOn` 如何保证下游依赖 gate done

- 下游步骤在 Flow YAML 中把 gate 步骤 id 写入 `dependsOn`（如 `delivery-sim-core.dependsOn` 含 `gate-vertical-slice`）。
- 应用已有**硬拦**：`evaluateDispatchGate` 第 6 条解析 `supersededBy` 链后要求每个前置 `done`，否则拒绝 `dispatch_task`（`dependencies-not-done`）。这是应用拒绝，不是角色自觉。
- 同时 `listReadyFlowSteps` 会把依赖未 done 的步骤标 `dependency-not-done`（不提示继续调度）；`evaluateFlowCompletion` 会让最终验收不可达。
- 因此「gate 未 done 不派下游」不需要新机制，只需 Steward 在写 flow 时把依赖写全；V 系列静态校验保持现状（§Q1）。

### 4.5 多个 gate 与最终 `verification` 共存

- 每个 gate 都是独立的 `artifact` 步骤：各自有 `dependsOn`（前置交付/前一个 gate）、各自 pending、各自应用收口。
- 最终 `verification` 步骤不用显式依赖每个 gate：`evaluateFlowCompletion` 已要求**所有非 acceptance 活动步骤 done**，gate 未 done ⇒ 最终验收不可达；`request_acceptance` 的 flow-incomplete 与自动验收门自动覆盖。
- gate 之间可以串行（视觉门依赖垂直切片门）或并行（多个关卡视觉门同 `parallelGroup`），由 Flow YAML 声明。
- gate 失效（gate 定义变化）用既有 `flow_step_supersede`：旧 gate `superseded`、新 gate 用新 id；`dependsOn` 沿 `supersededBy` 链解析（既有规则）。

## 五、派发通道：新增 `request_gate_review`

### 5.1 新工具 vs 扩展 `request_acceptance`（二选一）

**推荐：新增统筹专用工具 `request_gate_review({flowId, gateId, note?})`。**

| 维度 | 新增 `request_gate_review`（推荐） | 扩展 `request_acceptance` 带 `gateId` |
| --- | --- | --- |
| 契约影响 | 全新工具与回执枚举，`request_acceptance` 的冻结形状/语义/文案零变化 | 修改已冻结的 `RequestAcceptanceInput`/`RequestAcceptanceResult` 语义；旧调用方与测试需同步 |
| 语义清晰度 | 「gate 复核」与「最终验收」两条通道，回执不混淆 | 同一工具既能提交 gate 又能提交最终验收；回执 `dispatched` 指哪一种依赖 `gateId`，易被角色误解为「已验收通过」 |
| 校验差异 | gate 校验（gate 存在/pending/前置证据/标准节）与最终验收校验（变更包/riskTier/flow 完成）本来就是两套 | 需要在同一函数内分叉两套校验与两套 code，分支复杂 |
| 注入范围 | 只注入统筹（`convener`）会话，最窄 | 现状注入所有内置治理角色；要收窄反而破坏既有行为 |
| 先例 | 与 `request_boundary_change` 同模式（专用请求通道 + 冻结 code） | 无 |

结论：新增工具；`request_acceptance` 保留为最终验收唯一主动通道（§9.2）。

### 5.2 载荷与冻结回执

```ts
// src/model/runtime.ts（契约家；形状冻结）
export interface RequestGateReviewInput {
  flowId?: string;   // 省略＝当前/默认流程（应用归一，规则同 request_acceptance）
  gateId: string;    // 必填：flow step id（如 gate-vertical-slice）
  note?: string;     // 可选说明；不写账本、不参与判定
}

export interface RequestGateReviewResult {
  ok: boolean;
  code:
    | "dispatched"
    | "already-dispatched"
    | "gate-not-found"
    | "criteria-missing"
    | "flow-incomplete"
    | "unavailable"
    | "rejected";
  message: string;
  flowId?: string;
  gateId?: string;
  runtime?: RuntimeKind;
}
```

- 工具层只做参数形状校验（`gateId` 合法 slug、`note` 有界文本）并**原样转达**回执；契约外回执 fail-closed（按未派发处理）。
- 回执文案必须写清「gate 复核 ≠ 验收通过 ≠ 客户批准」；`dispatched` 只表示已派 Proof。
- 注入：仅 `convener` 会话（`session.ts` / `run-role.ts` 按内置角色职能判定），项目角色与其它治理角色不注册该工具（能力缺席＝最强 fail-closed）。

### 5.3 应用校验顺序（`requestGateReviewForProject`）

1. **flowId 归一**：显式优先；省略时仅当 `docs/flows` 恰有一个 YAML 才采用，否则 `gate-not-found`（提示指定 flowId，不猜）。
2. **flow 读取/解析**：不存在/不可读/校验失败 ⇒ `gate-not-found`。
3. **gate 步骤查找**：步骤存在且含合法 `gateKind` ⇒ 否则 `gate-not-found`。
4. **gate 状态**：
   - `done` ⇒ `already-dispatched`（已通过；如需重验，用 `flow_step_supersede` 出新 gate id）；
   - `superseded` / `failed` / `blocked` / `delivered` ⇒ `rejected`（说明原因；返工/修复后重交）；
   - `pending` ⇒ 继续。
5. **gate 记录**（§5.6）：同 flow revision 已在途/已通过 ⇒ `already-dispatched`；上一轮 `failed` 且返工路由未发送 ⇒ `rejected`（先完成返工协调）；`returned-to-proof` 允许重派一次。
6. **前置依赖**：gate 的 `dependsOn` 每项解析 `supersededBy` 链后必须 `done`，否则 `flow-incomplete`（列出未 done 项）。
7. **标准**：最新 criteria 存在、结构合格、含该 `gateId` 的 Gate 标准节，否则 `criteria-missing`。
8. **证据完整性**（机械检查，§5.4 清单），不满足 ⇒ `flow-incomplete`。
9. **在途工作**：该 flow 仍有在途派发/回交/运行轮次 ⇒ `unavailable`（说明稍后重试；不抢跑）。
10. **引擎解析**：无法确定 ⇒ `unavailable`（绝不回退桌面默认引擎）。
11. **派发**：打开 Proof 后台会话并投递 gate 复核任务；`openBackground`/`sendBackground` 失败或超时 ⇒ `unavailable`（如实写「可能已派发，请用 flow_get 核对」，不谎报）。
12. **持久化**：写账本 `dispatch.accepted{stepId:<gateId>, targetRoleId:"verifier", trigger:"settle"}` + gate 记录（原子写）；写失败 ⇒ `unavailable`（不声称已派发），下一次真实事件可重试。

所有阶段有界（总预算 + 单阶段预算，沿用 `request_acceptance` 的 `requestAcceptanceLimits` 模式）；超时只保证工具回执返回，不取消底层动作、不伪造结果。

### 5.4 「证据完整性」机械清单（应用做；语义判断归 Proof）

应用只核对**是否存在、是否对得上**，不评价内容好坏：

1. gate 的每个 `dependsOn` 步骤：`status: done`，且其声明的 evidence 在账本中可对账（`validateFlowEvidence` 同一口径；dispatch → `dispatch.accepted{stepId}`；artifact → `artifact.observed{artifactPath, artifactSha256}`；customer-decision → 对应 `customer.decision`）。
2. 最新验收标准含该 `gateId` 的 Gate 复核标准节（§3.3）。
3. `visual-baseline`：流程中已有真实运行/演示证据步骤（`verification-evidence` 或其切片对应步骤）`done`，且证据索引文件存在；**截图/录屏是否为关闭 DEBUG 的版本由 Proof 判定**，应用只检查路径存在。
4. `integration-performance`：集成/e2e 步骤（或 Reduce 步骤）`done` 且证据可对账；T2/T3 或声明性能预算时，性能证据路径存在（内容判定归 Proof）。
5. 无在途工作（第 9 条）。
6. 任何一项不满足 ⇒ `flow-incomplete`/`criteria-missing`，并给出具体缺项；**不把「文件存在」当「内容合格」**，也不把「统筹自查」当 Proof 复核。

### 5.5 派发内容（gate 任务文案要点）

任务文本必须自足，包含：`flowId`、`gateId`、`gateKind`、gate 步骤标题、gate 标准的 criteria 路径、`dependsOn` 各步骤的证据指针、候选身份（flow revision，可选候选 digest）、gate 报告路径（`docs/acceptance/<flowId>-<gateId>-report-v1.md`，重验递增 `vN+1`，不覆盖旧报告）、以及：

1. 只做 gate 复核，不发验收卡、不写 `customer.decision`、不代表客户批准；
2. 必须亲自运行或打开真实输出；UI/游戏必须在**关闭 DEBUG 覆盖层**后截图/录屏（证据里出现 DEBUG 覆盖层 ⇒ insufficient evidence）；
3. 结论用 `acceptance-triage/v1`（§6.2）；fail 项必须有 severity / reason / action / targets 或 criteria 指针；
4. gate 失败不直接改代码、不派发；由应用按返工路由交统筹；
5. 报告写清候选/流程版本与证据复用判定，禁止用旧截图冒充新候选。

### 5.6 幂等键与记录

- 运行期在途：`projectRoot\0flowId\0gateId`（并发/重复请求不重复派发）。
- 持久派发去重：账本 `dispatch.accepted`（`flowId + stepId=gateId`）+ gate 记录 `flowRevision` 比对。
  - 同 gate + 同 flow revision ⇒ `already-dispatched`（不重复投递）；
  - flow revision 变化且门仍是 pending、上一轮记录 `failed`/`returned-to-proof` ⇒ 允许重新派发（新候选的新一轮）；
  - 记录 `dispatched` 且报告未产出、flow revision 未变 ⇒ `already-dispatched`（在途）；超过陈旧阈值后可 `rejected` 提示重新提交（见 §5.7）。
- gate 记录路径：`.ans/governance/acceptance/<flowId>/gates/<gateId>.json`（app-only 写域；原子写；损坏 fail-closed，不猜）。
- schema `gate-review-record/v1`：

  ```json
  {
    "schema": "gate-review-record/v1",
    "flowId": "castle-2d-game-v1",
    "gateId": "gate-vertical-slice",
    "gateKind": "vertical-slice",
    "flowRevision": "…",
    "reportPath": "docs/acceptance/castle-2d-game-v1-gate-vertical-slice-report-v1.md",
    "reportVersion": 1,
    "reportSha256": "…",
    "conclusion": "pass | fail | conditional | null",
    "severityCounts": { "blocker": 0, "major": 0, "minor": 0, "nit": 0 },
    "itemCount": 0,
    "itemsDigest": "…",
    "status": "dispatched | passed | failed | returned-to-proof | superseded | unavailable",
    "requestId": "gate-…",
    "dispatchedAt": "…",
    "decidedAt": "…",
    "error": null,
    "at": "…"
  }
  ```

### 5.7 重启恢复

应用启动/导入项目后扫描 `.ans/governance/acceptance/<flowId>/gates/*.json`：

| 记录状态 | 恢复动作 |
| --- | --- |
| `dispatched` + 最新 gate 报告存在且可解析 | 按 §8 执行通过/失败处置（幂等） |
| `dispatched` + 无报告 | 不自动通过；主理（`primaryRoleId`）一条如实系统行；允许 Steward 重新 `request_gate_review`（记录转 `returned-to-proof` 或按陈旧阈值允许重派），不循环轮询 |
| `passed` + gate 步骤仍 pending | 应用重新执行 gate 收口（`completeGateStep` 幂等） |
| `failed` + 返工路由未写/未发送 | 补写/重试一次返工路由（§8.2） |
| `failed` + 路由已发送 | 不重复任务；等返工后重新请求 |
| `returned-to-proof` | 不自动重派；主理系统行；Steward 修正后重交 |
| `superseded`（gate 步骤已被 supersede） | 不执行旧处置；按新 gate id 走新记录 |
| 记录损坏/未知 schema | fail-closed：不自动执行、不派发、不标记 pass；主理如实系统行，人工核对 |

## 六、Proof 卡变更与 gate 报告

### 6.1 gate 复核职责（新增到 `VERIFIER_CARD_TEXT`）

- 收到应用派发的 gate 任务（`stepId` 为 `gate-*`）后：读 gate 标准节、`dependsOn` 证据、候选/流程版本；**亲自跑或看真实输出**——不是只读别人转述的日志。
- UI/游戏：必须打开真实浏览器/游戏窗口核对；**截图/录屏必须关闭 DEBUG 覆盖层**；发现 DEBUG 覆盖层、旧候选截图、或无法确认截图为当前候选 ⇒ `insufficient evidence`（按 fail 处理，不通过）。
- 产出 gate 报告（§6.2），结论只允许 `pass` / `fail` / `conditional`；`fail` / `conditional` 必须逐项给出 `blocker` / `major` 的失败原因与改进方案指针。
- gate 报告写 `docs/acceptance/<flowId>-<gateId>-report-vN.md`；证据附件写 `docs/verification/<flowId>/<gateId>/`；**不发 `request_choice`、不发验收卡、不写 `customer.decision`、不标任何 flow 步骤 `done`**。
- gate 失败：**不实现、不派发、不返工**——由应用按 §8.2 路由给统筹；Proof 只等返工后的下一次复核请求。
- gate 报告是 gate 的判定证据，不是客户验收报告；最终 `verification` 仍走既有验收卡/分诊/客户决定。

### 6.2 gate 报告路径与格式

**路径（版本化，不覆盖）：**

- 首次：`docs/acceptance/<flowId>-<gateId>-report-v1.md`；
- 重验：`vN+1`（不覆盖被拒/历史报告，沿用现有报告版本口径）；
- 与最终验收报告 `docs/acceptance/<flowId>-report-vN.md` **命名不冲突**：现有版本扫描 `^<flowId>-report-v(\d+)\.md$` 不会匹配 gate 报告（`gateId` 段在中间），因此验收分诊/最终验收不会被 gate 报告污染。

**格式：推荐复用 `acceptance-triage/v1`**（同一解析器、同一严重度、同一返工映射），不新增 schema。理由：

1. gate 与验收都需要 `conclusion + items（severity/owner/reason/action/targets/criteria/evidence）`；语义完全覆盖；
2. `pass` 允许带 `minor`/`nit` 备注项（现有解析器只禁止 `pass` 带 `blocker`/`major`），正好表达「通过但有非阻断建议」，避免为 nit 反复开 gate；
3. 应用已有严格解析、`items` 上限（64 项/32KB）、owner 可执行性核对与返工映射，零新增解析代码；
4. gate 身份由**路径 + 步骤 id** 唯一确定（报告文件名含 `gateId`），无需在 YAML 顶层加 `gateId` 字段（避免破坏 triage 严格 schema）。

报告首行（人读、供应用展示/审计，不参与机器判定）建议写成：

```markdown
# Gate 复核报告 v1｜flowId: castle-2d-game-v1｜gateId: gate-vertical-slice｜gateKind: vertical-slice｜候选 revision: <flowRevision>
```

独立 schema `gate-review/v1` 的备选（含 `gateId`/`gateKind`/`candidate`/`insufficientEvidence` 字段）见 Q3；若客户要求报告内部机器绑定候选，可在下一轮引入，本设计默认不引入。

### 6.3 gate 结论规则（应用机械校验 + Proof 判定）

| 报告内容 | 应用处置 |
| --- | --- |
| 缺报告 / 不可读 / 缺 `acceptance-triage/v1` / 段坏 / 矛盾（`pass` 带 blocker/major、`fail` 空 items） | `returned-to-proof`：不通过、不路由返工、不标 done；主理系统行要求 Proof 补报告；gate 保持 pending |
| `pass`（可带 `minor`/`nit` 备注） | 通过：应用收口 gate 步骤（§8.1） |
| `fail` / `conditional`，含 `blocker`/`major` | 失败：记录 + 返工路由（§8.2）；gate 保持 pending |
| `fail` / `conditional`，**只有** `minor`/`nit` | 推荐按结构不符退回 Proof（gate 失败必须以 blocker/major 为依据；nit 不入 fail）——见 Q5 |
| 报告路径与 gate 不符 / 版本早于派发 / 候选版本不符 | `returned-to-proof` 或 `superseded`（不猜、不通过） |

### 6.4 与验收卡、客户决定的关系

- gate 复核**不发卡**：Proof 写报告后结束回合，应用在 settle/导入/账本事件上读取报告并处置（无需新增 cardKind）。
- gate 结论**不写** `customer.decision`、不进入 `latestAcceptanceDecision`、不进入验收分诊（`cardKind=acceptance` 才分诊）。
- gate 通过只表示「该节点允许继续」；最终验收仍是客户（或判断代批）在既有验收卡上的决定。gate 失败不等于客户拒绝，客户仍可在最终验收阶段做最终决定。

### 6.5 Proof 的禁止事项（沿用并强化）

不实现修复、不派发任何任务、不写 flow/账本/客户决定、不标步骤 `done`、不改统筹的返工范围、不把自查/转述当真实运行证据。gate 报告不得替代最终验收报告，也不得在 gate 失败时直接建议客户接受。

## 七、统筹卡变更

### 7.1 职责收缩为三件事

新增/改写 `CONVENER_CARD_TEXT` 的 gate 章节：

1. **证据完整性检查（不是实质复核）**：核对 gate 的 `dependsOn` 步骤是否 `done`、证据是否在账本可对账、gate 标准节是否存在、真实运行/截图路径是否齐；只判「齐不齐」，不判「好不好」。完成即调用 `request_gate_review`；**不得**自行宣告 gate 通过、不得代写 gate 报告（结构上也无权写 `docs/acceptance/**`）。
2. **请求 gate 复核**：按 §3.2 的默认矩阵在 flow YAML 中声明 gate 步骤，把 gate 写入下游 `dependsOn`；到点主动 `request_gate_review`，不等客户催办。
3. **返工协调**：gate 失败后按既有返工门禁建返工步骤（`flow_step_supersede` / 新版本步骤），完成后重新请求 gate 复核；返工项带 gate 报告的 severity/reason/targets。

### 7.2 回执处理（必须如实）

| code | 统筹动作 |
| --- | --- |
| `dispatched` | 如实记录「已提交 gate 复核」；**不等于通过**；等应用结果，不重复提交 |
| `already-dispatched` | 不重复提交；`flow_get` 核对：step `done` ⇒ 已通过；否则在途，等待 |
| `gate-not-found` | 核对 flow YAML 与 gate step id；修正/新建 gate（新 id）后重交 |
| `criteria-missing` | 通知 Proof 补/递增 criteria 的 gate 标准节（统筹不写 `docs/acceptance/**`），补齐后重交 |
| `flow-incomplete` | 按 message 补齐前置/证据；不得提前提交、不得用提交代替缺步骤 |
| `unavailable` | 如实说明「通道不可用/可能已派发」；不绕过、不自己判、不伪造通过 |
| `rejected` | 按 message 区分「gate 已 done / 已 superseded / 返工未完成」；协调修复后重交，不原样死循环 |

### 7.3 gate 规划与下游依赖

- gate 步骤由 Steward 在 Flow YAML 中声明（初始创建或后续 flow 版本），属 `docs/flows/**` 写入权限内；team plan schema 本轮不变（Q1）。
- 默认矩阵（§3.2）写进 Steward 卡与 flow 模板示例；项目可在此基础上加 gate，不得减少默认 gate（除非客户书面豁免并记录）。
- 下游 `delivery-*` / Reduce 步骤 `dependsOn` 必须包含相关 gate；V 系列静态校验维持现状，不建议本轮新增强制规则（避免旧 flow 回归；Q1）。

### 7.4 边界不变

- Steward 仍不派治理角色、不代替验收、不写 `docs/acceptance/**` / `docs/verification/**` / 账本 / 客户决定。
- gate `done` **只能由应用**按 Proof 报告收口；`flow_step_update` 对 gate 步骤的 `done` 一律拒绝（新 code `gate-review-required`），manager 也不能代标（§8.4）。

## 八、应用行为

### 8.1 gate 通过

1. 应用在 verifier settle / 导入 / 账本事件上发现 gate 记录 `dispatched` 且最新 gate 报告可解析、`conclusion=pass`。
2. 调编排公共出口的新 app-only 助手 `completeGateStep`（与 `completeAcceptanceCriteriaStep` 同构）：
   - 扫描最新 gate 报告版本，校验 triage 结构并复核 `gateId` 与路径匹配；
   - 追加 `artifact.observed{actorRoleId:"app", power:"app", artifactPath:<report>, artifactSha256, flowId}`（与 `completeAcceptanceCriteriaStep` 同口径；同 path+sha 幂等）；
   - 把 gate 步骤置 `done` + evidence `{kind:"artifact", ref:<最新报告路径>}`（幂等；不覆盖其它状态）。
3. 追加账本 `gate.review`（pass，§8.4），gate 记录转 `passed`；主理系统行「gate 已通过（附报告路径）」。
4. 下游依赖 gate 的步骤变为可派（`dependsOn` 满足）；`ready` 唤醒随下一次真实事件/继续调度提示生效。

### 8.2 gate 失败与返工（复用现有返工路由）

1. 报告 `fail`/`conditional` 且含 blocker/major ⇒ gate 记录 `failed`；**不标 done、不置 failed/blocked**（gate 步骤保持 `pending`，避免需要重开状态）。
2. 复用现有返工路由能力（`routeAcceptanceRework` 的解析/任务构建/发送语义），但**按 gate 独立记录**：`.ans/governance/acceptance/<flowId>/gates/<gateId>-rework-routing.json`（`schema: gate-rework-routing/v1`，含 `gateId`、报告 sha、items、source:`proof`、`sourceDetail:"gate-review"`），避免与最终验收的 `rework-routing.json` 互相覆盖。
3. 返工任务接收方沿用现有规则（trio = 主理/Lead；single/su 保持原接收方）；任务文本用 `buildAcceptanceReworkTaskMessage` 同口径，追加 `gateId` 与 gate 报告指针；`minor`/`nit` 标为非阻断、可选后续。
4. 发送失败/记录写失败：如实记录 `failed` + 主理系统行；下一次真实事件重试；不假装已返工。
5. 返工完成后由统筹再次 `request_gate_review`（显式通道）；应用不自动把同一份失败报告重判，也不自动放行。

### 8.3 gate 报告缺失/坏结构

- 记录 `returned-to-proof`：不通过、不路由返工、不标 done；主理系统行要求 Proof 补报告；gate 保持 pending；不解析自由文本、不猜结论。
- 同一 gate 同一报告 sha 只退回一次（去重）；下一次真实事件/重新请求再检查。

### 8.4 账本记录（不写 `customer.decision`）

- 新增账本 kind `gate.review`（只增；旧读取方忽略未知字段），条目形状：

  ```ts
  {
    at, kind: "gate.review", flowId, actorRoleId: "app", power: "app",
    messageSummary: "Gate 复核：gate-vertical-slice 通过（visual-baseline；报告 v2）",
    gateReview: {
      schema: "gate-review-decision/v1",
      gateId, gateKind, reportPath, reportVersion, reportSha256,
      conclusion: "pass" | "fail" | "conditional",
      severityCounts, itemCount, requestId, flowRevision, decidedAt
    }
  }
  ```

- `gate.review` **不是** `customer.decision`：`latestAcceptanceDecision`、`evaluateFlowCompletion`、收口门、分诊都**不读**它；它只做审计、幂等（`gateId + reportSha` 去重）与汇报。
- gate 完成事实仍以 flow 步骤 `done` + `artifact.observed` 为准（与现有 artifact 收口一致）；`gate.review` 是判定审计，不是完成证据的替代。
- **`observeFlowArtifacts` 必须跳过含 `gateKind` 的步骤**（否则 gate 报告文件存在即被观测，失败报告也可能被当成 done 证据）；gate `done` 只经 `completeGateStep`。
- `flow_step_update` 对含 `gateKind` 的步骤：非应用调用一律拒绝 `done`（`gate-review-required`）；`dispatched/delivered` 等状态也不应出现，出现即诊断并按异常处理。Steward 只能通过 `flow_step_supersede` 换 gate id。

### 8.5 下游硬拦与最终验收

- gate 步骤未 done ⇒ `evaluateDispatchGate` 对依赖它的下游步骤返回 `dependencies-not-done`；`listReadyFlowSteps` 返回 `dependency-not-done`；`evaluateFlowCompletion` 不 ready。
- 最终验收：`request_acceptance` 与自动验收门都因 `evaluateFlowCompletion` 不 ready 而拒绝（`flow-incomplete`）；gate 未 done 不可能进入验收卡/分诊/客户决定。
- gate 全部 done 后，最终验收仍走现有链路：criteria → change-package/riskTier → Proof 验收报告 + 验收卡 → 分诊（若 fail）→ 客户决定。**gate 不改变验收报告版本扫描、分诊触发条件与收口语义。**

### 8.6 Proof 不可用 / 超时（fail-closed）

| 场景 | 行为 |
| --- | --- |
| 引擎无法解析 / 打开/发送失败 | `request_gate_review` 返回 `unavailable`；gate 保持 pending；下游与最终验收均不可达；主理如实系统行；不伪造通过 |
| 工具调用超时 | 返回 `unavailable` +「可能已派发，用 flow_get 核对」；不声称已派发、不自动重试循环 |
| 已派发但 Proof 未产出报告 | gate 记录保持 `dispatched`；主理系统行一次；陈旧后允许重新请求（§5.7）；**永不按超时判 pass** |
| 报告存在但无法对应候选/流程版本 | 按 `returned-to-proof`；不通过、不放行 |
| gate 记录损坏 | fail-closed：不执行、不派发、不通过；人工核对 |

### 8.7 状态总表

| 事件 | gate 步骤状态 | gate 记录 | 账本 | 下游/最终验收 |
| --- | --- | --- | --- | --- |
| 请求且校验通过、已派 Proof | pending | dispatched | `dispatch.accepted{stepId:gateId}` | 仍拦 |
| 报告 pass | done（app-only） | passed | `artifact.observed` + `gate.review(pass)` | 放行 |
| 报告 fail/conditional（含 blocker/major） | pending | failed | `gate.review(fail)` | 仍拦；返工路由 |
| 报告缺/坏/矛盾 | pending | returned-to-proof | 无（或诊断） | 仍拦；退回补报告 |
| 请求被拒（gate-not-found/criteria-missing/flow-incomplete/rejected） | pending | 不变 | 无 | 仍拦 |
| Proof 不可用/超时 | pending | dispatched/unavailable | 可能无 | 仍拦；如实报告 |

## 九、兼容与迁移

### 9.1 无 gate 的旧 flow

- 不含 `gateKind` 的 flow：解析、序列化、`evaluateFlowCompletion`、`listReadyFlowSteps`、派发门禁、证据对账、验收派发、分诊、返工、收口**逐字不变**。
- `gateKind` 是可选字段；旧 flow 不会被自动补 gate，也不会被强制迁移。
- 旧版应用读取含 `gateKind` 的新 flow：按现有「未知字段 ⇒ 校验失败」口径**fail-closed**（不猜、不执行）；需要升级应用（与现有 Flow YAML 严格 schema 的兼容口径一致）。

### 9.2 `request_acceptance` 保留（最终验收）

- 保留现有工具、输入、冻结回执、注入范围与全部校验；语义不变：最终验收的唯一主动通道。
- 有 gate 的 flow 在其完成前调用 `request_acceptance` ⇒ 既有 `evaluateFlowCompletion` 返回 `flow-incomplete`（无需新代码）；gate 完成后行为与今天一致。
- 不把 `request_gate_review` 的回执与 `request_acceptance` 的回执混用；角色卡分别写清「gate 复核」与「最终验收」。

### 9.3 多 gate 的幂等与重启恢复

- 每个 gate 独立：在途键、账本派发记录（stepId）、gate 记录、返工记录、报告版本互不干扰；同一 flow 多个 gate 可并行/串行。
- 幂等键：请求 `projectRoot+flowId+gateId`；持久 `flowId+gateId+flowRevision`；判定 `gateId+reportSha256`；返工 `gateId+reportSha+decisionAt`。
- 重启恢复按 §5.7；恢复动作只做「补处置/补记录/补系统行」，不自动重派 Proof（除 Steward 重新请求），不自动通过。
- `superseded` gate 的旧记录不执行；新 gate id 走新记录。

### 9.4 行为变化清单（相对今天）

| 场景 | 改前 | 改后 | 性质 |
| --- | --- | --- | --- |
| 无 gate 的 flow | 既有行为 | 逐字不变 | 不变 |
| 有 gate 的 flow，gate 未 done | 不存在该场景 | 下游派发被拒、最终验收不可达 | **新增（有意）** |
| gate 报告 pass | 不存在 | 应用收口 gate、放行下游 | **新增（有意）** |
| gate 报告 fail | 不存在 | 返工路由（按 gate 独立记录） | **新增（有意，复用既有返工语义）** |
| 统筹自查后想直接标 gate done | 不存在 | 被拒（`gate-review-required`） | **新增（有意，客户要求）** |
| 最终验收 | 既有验收卡/分诊/客户决定 | 同左 | 不变 |
| `request_acceptance` | 既有行为 | 同左（gate 未完成时由 flow-incomplete 拦截） | 不变 |
| 视觉/游戏证据 | 最终验收时检查 | gate 前移检查（DEBUG 关闭截图） | **新增（有意）** |

### 9.5 残余风险

- **gate 增加流程成本**：每个 gate 至少一轮 Proof 复核；按 §3.2 只在高价值节点设 gate，T0/纯文档不设。
- **gate 报告复用 triage schema 无机器字段绑定候选**：以路径 + `flowRevision` 记录 + 变更后作废（flow revision 变化 ⇒ 要求重新请求）缓解；需要更强绑定时升级 `gate-review/v1`（Q3）。
- **Proof 单点**：Proof 不可用时 gate 停住是**有意 fail-closed**；不提供「统筹代判」降级。
- **旧版应用读新 flow 失败**：严格 schema 的既有口径；升级应用后恢复，不静默降级。
- **gate 记录/账本写失败**：按 §8 如实降级，不伪造通过。

## 十、验收标准 A1–A8（可核对；实施后独立验收引用）

> 每行判定 `pass` / `fail` / `insufficient evidence` / `not applicable`（N/A 写依据）；全适用行 pass 且证据对应当前候选才通过。

| ID | 标准 | 需要的证据 | 负例（应判 fail） |
| --- | --- | --- | --- |
| **A1 权威与角色边界** | 独立复核结论只由 Proof 产出；统筹只做证据完整性检查、请求与返工协调；不新增治理角色、不新增 `FlowStepKind`、不新增 cardKind | 角色卡文本；枚举 diff；工具注册清单；e2e 角色行为 | 统筹卡出现「自行判定 gate 通过/自行核证结论」；新增 gate 角色；新增 `kind: gate` |
| **A2 gate 节点与规划** | 三类 gate（vertical-slice / visual-baseline / integration-performance）语义与适用矩阵可核对；gate 标准节写在最新 criteria；T0/纯文档可不设 gate | flow 模板；criteria 样例；Steward 卡矩阵；项目 flow YAML | 所有项目一刀切设 gate；gate 无标准节；visual gate 无可执行视觉标准 |
| **A3 Flow 表达与依赖硬拦** | gate 用 `kind: artifact` + `gateKind`；下游 `dependsOn` 含 gate；gate 未 done 时 `dispatch_task` 被 `dependencies-not-done` 拒绝、ready 不提示、最终验收不可达；多 gate 与 `verification` 共存；旧 flow 零变化 | 解析单测；governance-gate 单测；e2e 派发拒绝；旧 flow 回归 | gate 未 done 下游派发成功；gate 步骤出现在 ready；旧 flow 解析/行为变化；出现新 `FlowStepKind` |
| **A4 派发通道** | `request_gate_review` 仅统筹注入；校验顺序与冻结 code 完整；`dispatched` 只表示已派 Proof；`request_acceptance` 形状/语义不变；并发/重复请求幂等 | 工具单测；应用能力单测；回执矩阵；注入范围测试 | 项目角色可调用；未知 code 被当成功；重复请求重复派发；扩展 `request_acceptance` 改坏旧回执 |
| **A5 Proof gate 复核与报告** | Proof 读标准+证据、亲自跑/看真实输出；UI/游戏 DEBUG 关闭截图；报告复用 `acceptance-triage/v1`、版本化不覆盖；pass/fail 结论与 items 合规；不发验收卡、不写客户决定、不实现、不派发 | 角色卡；gate 报告样例；真实 Electron/浏览器 e2e；账本无 customer.decision | 只看转述日志就 pass；DEBUG 覆盖层截图被判 pass；缺 triage 段仍收口；Proof 改代码/派任务 |
| **A6 统筹职责收缩** | 统筹只做证据完整性检查 + 请求 + 返工；`flow_step_update(done)` 对 gate 被拒；不得以自查代替 Proof；gate 未 done 不派下游；回执如实处理 | 统筹卡；gate-review-required 单测；e2e 拒绝；系统行文案 | 统筹自标 gate done 成功；统筹写 gate 报告；gate 未 done 统筹派下游；把 `dispatched` 说成通过 |
| **A7 应用行为与降级** | gate pass 收口 done + `artifact.observed` + `gate.review`；fail 走独立返工路由；账本不写 `customer.decision`；下游硬拦；最终验收与客户决定不变；Proof 不可用/超时/无报告 fail-closed | 集成测试；账本断言；故障注入；重启测试；真实流程 e2e | 失败报告把 gate 标 done；gate 结论写 customer.decision；Proof 不可用仍放行；超时判 pass；最终验收被 gate 报告污染 |
| **A8 兼容、幂等与恢复** | 无 gate 旧 flow 逐字不变；`request_acceptance` 保留；多 gate 幂等键与记录互不覆盖；重启恢复按 §5.7；`observeFlowArtifacts` 跳过 gate；记录损坏 fail-closed | 兼容回归；幂等测试；重启测试；diff/枚举检查；故障注入 | 旧 flow 行为漂移；gate 报告被自动观测成 done 证据；重启重复派发/重复返工；记录损坏后猜结论 |

**必须覆盖的负例（至少）**：

1. **统筹不能自标 gate 通过**：Steward 调 `flow_step_update(status=done)` 于 gate 步骤 ⇒ 应用拒绝（`gate-review-required`），flow 不变；统筹不得写 gate 报告（边界拒绝）。
2. **gate fail 下游不能派**：gate 报告 fail 后，`dispatch_task` 给依赖该 gate 的 `delivery-*` ⇒ `dependencies-not-done`；`ready` 不提示；`request_acceptance` ⇒ `flow-incomplete`。
3. **Proof 不可用不得放行**：引擎不可解析/打开失败/超时 ⇒ `request_gate_review` 返回 `unavailable`；gate 保持 pending；下游/最终验收仍被拦；无任何路径把超时当通过。
4. **gate 报告缺证据退回**：缺报告、缺 `acceptance-triage/v1`、段坏、`pass` 带 blocker/major、`fail` 空 items ⇒ `returned-to-proof`；不标 done、不路由返工、不猜。
5. **旧 flow 兼容**：无 `gateKind` 的 flow 解析、派发、验收、分诊、返工、收口全部逐字不变；`request_acceptance` 回执与行为不变。

## 十一、开放问题 Q1–Q8（待客户确认；推荐项是建议，不是拍板）

1. **Q1 gate 集合与默认矩阵**：是否接受 §3.2 的默认矩阵（T1 代码项目至少垂直切片门；视觉产品加视觉基线门；T2/T3 加集成/性能门；T0/纯文档不设）？gate 由 Steward 在 Flow YAML 声明、team plan schema 本轮不变。推荐：接受；后续需要时再扩 team plan。
2. **Q2 Flow 表达选型**：确认采用「`kind: artifact` + 可选 `gateKind`，不新增 `FlowStepKind`」（推荐）；`kind: gate` 作为未来升级路径保留，不在本轮引入。
3. **Q3 gate 报告 schema**：确认复用 `acceptance-triage/v1`（推荐，零新解析、pass 可带 minor/nit 备注）；还是引入独立 `gate-review/v1`（可机器绑定 gateId/候选，但新增解析与测试）？推荐：复用；若客户要求报告内部硬绑定候选，再切换。
4. **Q4 gate 失败后的重派方式**：确认由统筹在返工完成后**显式**再次 `request_gate_review`（推荐，控制强、不自动循环）；还是应用在 flow revision 变化 + 返工步骤 done 后自动重派一次（省协调但风险高）？
5. **Q5 gate 里 minor/nit 的处置**：确认 gate `pass` 可带 `minor`/`nit` 备注；gate `fail` 必须至少一个 `blocker`/`major`，只有 minor/nit 的 fail 按结构不符退回 Proof（推荐，避免 castle 式吹毛求疵返工）。
6. **Q6 证据完整性机械范围**：确认 §5.4 清单（依赖 done、账本可对账、标准节、运行证据路径、无在途）就是统筹可作为的全部检查；内容合格与否一律归 Proof。
7. **Q7 gate 是否对客户可见**：确认 gate 不发客户卡（推荐）；只给主理系统行 + 报告路径；gate 失败不等于客户拒绝；最终验收仍由客户决定。
8. **Q8 现有项目与 castle 迁移**：确认旧 flow 不回溯补 gate（推荐）；castle-2d 当前流程保持不动、验收轮次继续；是否在下一版 flow（返工完成后）补 `gate-visual-level-01` 等 gate，由客户另行决定。

## 十二、影响面（本任务不实施；供后续团队计划与闸门 2 使用）

| 角色 | 文件 / 符号 | 改动 |
| --- | --- | --- |
| 编排 | `src/common/编排/flow-state.ts` | 可选 `gateKind` 字段与解析/序列化/静态校验；`FLOW_GATE_KINDS`；`awaiting-gate` skip 原因（若采纳） |
| 编排 | `src/common/编排/flow-service.ts` | `completeGateStep`（app-only 收口，复用 criteria 收口模式）；`observeFlowArtifacts` 跳过 gate 步骤；`flow_step_update` 拒绝 gate `done` |
| 编排 | `src/pipeline/orchestration/flow-state.ts` | 公共出口再导出 gate 解析/收口/记录能力 |
| 编排 | `src/common/编排/governance-ledger.ts` | `kind:"gate.review"` + 可选 `gateReview` 审计字段 |
| 编排 | `src/common/编排/governance-gate.ts` | 依赖门禁复用（预计零改动；加回归测试确认 gate 依赖被拒） |
| 运行时核心 / Model | `src/model/runtime.ts` | `RequestGateReviewInput/Result/Fn` 冻结契约；能力位 |
| 运行时核心 | `src/provider/runtime/tools.ts` | `request_gate_review` 工具（参数校验 + 原样转达 + 冻结 code） |
| 编排注入 | `src/pipeline/orchestration/run-role.ts` | 仅 convener 会话注入 `requestGateReview` |
| 桌面窗口 | `app/desktop/session.ts` | 仅统筹会话注入；gate 能力项目入口 |
| 桌面窗口 | `app/desktop/interface.ts` | `requestGateReviewForProject`（§5.3 校验/派发）；gate 记录读写；gate 报告解析与处置；返工路由（按 gate）；重启恢复扫描；主理系统行 |
| 桌面窗口 | `app/desktop/governance-advance.ts` | gate 任务文案；gate 报告路径/版本；gate 返工任务追加 gateId |
| 桌面窗口 | `app/main.ts` | 能力接线（与 request_acceptance 同模式） |
| 门禁引擎 | `src/common/门禁引擎/governance-roles.ts` | Proof 卡 gate 复核职责；Steward 卡职责收缩 + `request_gate_review` 回执；gate 默认矩阵 |
| 项目管理 | `src/common/shared/i18n/messages/{zh-CN,en-US}.ts` | gate 系统行/回执文案 key（**2026-10-26 已补 13 个 `main.gateReview.*` key；桌面/编排消费方接线在各自实现批次完成**） |
| 测试 | `test/编排/flow-state.test.ts`、`test/编排/governance-gate.test.ts`、`test/runtime-core/tools.test.ts`、`test/桌面应用/`、`test/测试/governance-e2e-auto/` | 见 §10 |

**默认不新增角色、不新增 `FlowStepKind`、不新增 cardKind。**

## 十三、状态与下一步

- **已做的**：只读核对 FlowStepKind/保留验收 id/证据对账、dependsOn 派发硬拦、request_acceptance 与验收派发、验收分诊、Steward/Proof 卡与 castle-2d 真实流程与 v5 报告；完成本设计（`rules-only`）。
- **状态更新（2026-10-26，客户已授权实施，实现中）**：客户在 `rules-only` 落卡后**追加授权实现 `request_gate_review`** 与 §4–§8、§12 的 gate 机制；同时追加两条客户要求：**gate 复核独立于最终验收**（gate ≠ 验收通过 ≠ 客户批准）、**防吹毛求疵**（gate fail 必须有 blocker/major；只有 minor/nit 的 fail 退回 Proof、不返工；pass 可带 minor/nit）。实现由各能力角色分工进行，**当前实现中、未验证、未验收**；项目管理本批只补 13 个共享 i18n key 与变更记录/规则同步，未改 flow/桌面/model/provider/门禁卡。详见 [`docs/change/2026-10-26_change_request-gate-review.md`](../change/2026-10-26_change_request-gate-review.md)。
- **历史（2026-10-26 早前，已被上述授权实施取代）——客户决定（2026-10-26）**：v1 **只落规则、不实现工具/新 schema**——只把「何时设 gate、gate 计划要素、Proof 独判、统筹不自审」写进 **Steward / 统筹** 角色卡（v1）；`request_gate_review`、`gateKind`、账本 `gate.review`、多 gate 幂等机制保留为未来可选方案，**当时未实施、未授权**；当时仅用现有步骤与 `request_acceptance`（最终验收），不新增 `FlowStepKind`/工具；其他业务项目按规则在计划里设 gate，不要求迁移。
- **后续落卡关系（2026-10-26）**：本设计文档本身**未改任何代码、测试或角色卡**（上述「设计阶段未做的」是设计时点声明）；规则已按 `rules-only` 在后续提交 `cd6d042` + `c843bd6` 落成——实际只改 `CONVENER_CARD_TEXT`（Steward / 统筹）与门禁测试；**`NOMINATOR_CARD_TEXT`（Crew / 组队）不含 gate 规划/独立复核时机，v1 范围不含 Crew**，如后续需要，再单独授权。
- **设计阶段未做的**：未改任何产品代码、测试、角色卡、边界、共享 i18n；未运行测试 / typecheck；未 commit / push；未实施、未验证。
- **下一步**：按客户授权，由各能力角色在各自边界内实现 `request_gate_review`、`gateKind` 解析/门禁/收口、gate 记录与返工路由、卡文本与桌面系统行接线；实现完成后**另走独立验收**（本文件届时再更新实现/验收状态）。Q1–Q8 中未随本次授权明确覆盖的取舍仍按实现方案与独立验收证据判定。
- **版本**：`2026-10-26 v3（approved-implementing）`（v2 `rules-only` 保留在事件历史；实质变更递增版本并重新确认）。

## 附：客户摘要（5–8 句）

1. gate 按四个节点排：脚手架后的垂直切片、UI/游戏的视觉基线（可按关/页面多次）、集成/性能，最后仍是原来的客户最终验收；风险档越高、视觉面越强，gate 越全。
2. 谁判：只有 Proof 判。Proof 亲自跑或亲自看真实输出，UI/游戏必须关闭 DEBUG 后截图，写 gate 报告（pass/fail + 原因 + 改进指针）；gate 失败走现有返工流程，返工后再由 Proof 复核。
3. 统筹还能做什么：只做证据完整性检查（依赖是否 done、证据是否与账本对得上、标准节是否存在）、调用新通道 `request_gate_review` 请 Proof 复核、失败后协调返工；不能再自己核证通过，也不能代标 gate done。
4. Flow 上不新增步骤类型：gate 用现有 artifact + `gateKind` 表达，下游步骤把 gate 写进 `dependsOn`；应用已有派发门禁会在 gate 未通过时直接拒绝派下游，最终验收也自动不可达。
5. 对 castle 的影响：现有流程本轮完全不动、行为不变；如果以后新版本加 gate，像「窄窗截图缺失、DEBUG 旧截图、Boss 打不死」这类问题会更早被 Proof 拦下，而不是拖到第五轮验收。
6. 客户已于 2026-10-26 授权实现（Q1 gate 默认矩阵、Q3 报告复用、Q4 返工后显式重新请求、Q5 nit 不算失败、Q8 castle 暂不迁移等取舍按本设计与实现方案执行）；**当前实现中、未验证、未验收**，完成后走独立验收。
