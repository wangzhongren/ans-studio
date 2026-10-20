---
id: change_flow-tools-card-discipline
type: change
title: 流程文件方法化工具（flow_get / flow_step_update / flow_step_supersede）角色卡纪律
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: implemented
role: 门禁引擎
scope: Steward 初始创建例外与流程工具优先路径；Crew/Draft/Proof 只读流程并用 flow_step_update 记录自己步骤；expectedRevision/`revision-conflict` 纪律；不改判定逻辑
events:
  - date: "2026-10-20"
    kind: implemented
    summary: Steward 卡明确流程 YAML 初始创建仍用 request_confirmation(schedule-write)，创建后步骤状态推进用 flow_get + flow_step_update、返工用 flow_step_supersede；Crew/Draft/Proof 用 flow_get 读取并用 flow_step_update 记录自己步骤，不得直接写 docs/flows/**；四卡统一 expectedRevision 来自最近一次 flow_get、`revision-conflict` 重读不盲试
  - date: "2026-10-20"
    kind: verified
    summary: 门禁引擎套件 285 计 / 284 过 / 0 红 / 1 skip（新增 1 例）；npm run typecheck exit 0；未提交 git
---

# 流程文件方法化工具角色卡纪律

## 1. 客户决定

客户已拍板：「按这个方案做吧。」流程文件改为**方法化工具**：

- `flow_get`：读流程摘要/步骤/自己可更新的步骤（所有角色）。
- `flow_step_update`：更新步骤状态；参数 `flowId` / `stepId` / `status` / `expectedRevision` /
  `evidence?` / `idempotencyKey?` / `note?`；Steward 可更新全部，步骤 owner 只能更新自己的步骤；
  `done` 必须带账本可对账的 evidence；版本冲突（`revision-conflict`）/证据不足（`insufficient-evidence`）会拒绝。
- `flow_step_supersede`：Steward only；旧步骤 `superseded` + 新步骤 `pending`，参数 `flowId` /
  `oldStepId` / `newStepId` / `title` / `owner` / `kind` / `expectedRevision` / `reason?` /
  `idempotencyKey?`。

本批只在**门禁引擎**边界内更新角色卡文本（不改判定逻辑，不实现工具）。

## 2. 卡文本变更（`src/common/门禁引擎/governance-roles.ts`）

### Steward / 统筹（`convener`）

- 标准工作流第 1 步改为「写流程单（仅初始创建）」：
  - 初始创建仍用 `request_confirmation`（`cardKind=schedule-write`）后写 `docs/flows/<flowId>.yaml`；
  - 创建后所有步骤状态推进优先用 `flow_get` + `flow_step_update`，不再为每次状态更新写文件/发写卡；
  - **不要直接 `write_file` 流程 YAML**（初始创建除外，且按现有写卡门）。
- 第 4 步改为：先用 `flow_get` 读取最新流程与 revision，再用 `flow_step_update` 更新
  `status`（`dispatched` / `delivered` / `done` / `failed` / `blocked`）；`done` 前必须已有账本可对账的
  `evidence`；返工用 `flow_step_supersede`（旧步骤 `superseded`、新步骤 `pending`），不保留
  `aborted` / `failed` 行挡收尾门。
- 新增「流程工具（方法化，优先路径）」段：列出三个工具与关键参数（`flow_step_update` 注明
  Steward 可更新全部、其他角色只能更新自己的步骤）；明确初始创建例外、创建后不为每次状态更新
  写文件/发写卡、不直接 `write_file` 流程 YAML；`expectedRevision` 必须来自最近一次 `flow_get`
  （或更新回执）的 revision，`revision-conflict`（版本冲突）时重新 `flow_get` 再改、不盲目重试；
  `done` 前必须有账本可对账证据，证据不足（`insufficient-evidence`）不标 done；保留 id
  `verification` / `acceptance` 仍按既有验收卡流程，不因流程工具改变；步骤推进 ≠ 客户批准，
  需要客户决定的步骤仍走 `request_confirmation` / `request_choice`。
- 确认卡约定改为：流程 YAML **初始创建**（及迁移兼容）用 `cardKind=schedule-write`；普通写盘用
  `cardKind=write`；创建后的步骤状态推进不再为每次更新发写卡。
- declined 段同步为「修正流程状态 YAML（初始创建）或排程内容后重新发确认卡」。

### Crew / 组队（`nominator`）

- 标准工作流第 1 步改为用 `flow_get` 读取流程摘要与自己负责的步骤（YAML 仍是唯一机器状态，
  `.md` 仅人读视图）。
- 第 5 步角色就绪后：若自己负责的步骤（如 nomination / role-readiness）已有账本证据，用
  `flow_get` 读取最新 revision 后用 `flow_step_update` 记录 `delivered` / `done`；证据不足不标 `done`。
- 新增「流程工具纪律」：用 `flow_get` 读取流程与自己负责的步骤；**不得直接写 `docs/flows/**`**；
  你只能更新自己负责的步骤：交付/回交后按账本证据用 `flow_step_update` 记录状态；证据不足
  （`insufficient-evidence`）如实报告、不标 `done`；`expectedRevision` 来自最近一次 `flow_get`
  （或更新回执）的 revision，`revision-conflict` 重读后改、不盲目重试；保留 id
  `verification` / `acceptance` 仍按既有验收卡流程；步骤推进不等于客户决定/同意。

### Draft / 提案（`rapporteur`）

- 标准工作流第 4 步契约冻结后：若 contract-freeze 步骤归自己，按账本 `artifact.observed` 证据用
  `flow_step_update` 记录 `done`。
- 新增同款「流程工具纪律」段（flow_get / 不得直接写 docs/flows / 只能更新自己的步骤并用
  flow_step_update / 证据不足（`insufficient-evidence`）不标 done / expectedRevision / 
  `revision-conflict` / 保留 id）。

### Proof / 验收（`verifier`）

- 标准工作流第 1 步改为用 `flow_get` 读取流程摘要与自己负责的步骤，再读提案/契约/交付证据。
- 新增同款「流程工具纪律」段，并明确「保留 id `verification` / `acceptance` 仍按既有验收卡流程，
  不用 `flow_step_update` 代替客户验收决定」。

### Lead / 主理（`liaison`）

本批未改：Lead 不承担流程步骤 owner 职责，也不写 `docs/flows/**`。既有权力/禁写不变。

### 保留

- 现有 `request_confirmation` / `cardKind` / `schedule-write` 规则作为**初始创建与迁移兼容**保留，
  未删除旧路径。
- 五卡权力/职责/Section 1/预授权/禁写/能力位、shell 审批档、工程质量基线、治理卡参数、
  判断代批/deny 纪律与 flow YAML schema 契约逐字未改。

## 3. 测试（真实输出）

- `node --test "test/门禁引擎/**/*.test.ts"`
  - **285 tests / 284 pass / 0 fail / 1 skipped**（基线 280/279/0/1；本批新增 1 例）。
  - 新增：`标准工作流：流程工具——Steward 初始创建例外 + flow_get/flow_step_update/flow_step_supersede；Crew/Draft/Proof 只读流程并用工具记录状态`
    - Steward：三工具名、参数纪律、expectedRevision/`revision-conflict`、初始创建 `schedule-write` 例外、
      不直接 `write_file` 流程 YAML、不为每次状态更新写文件/发写卡、`done` 前账本证据、
      `superseded`/`pending` 返工、既有验收卡规则。
    - Crew/Draft/Proof：flow_get、flow_step_update、不得直接写 `docs/flows/**`、expectedRevision、
      `revision-conflict`、证据不足不标 done；Draft 契约冻结、Crew 角色就绪、Proof 不代替验收决定各有落点。
  - 更新（契约切换，非放宽）：Crew/Proof 的「按 YAML 读取」断言改为「用 flow_get 按 YAML 读取」；
    Steward declined 断言补「（初始创建）」限定。既有断言未删除、未放宽。
- `npm run typecheck` ⇒ **exit 0**。

## 4. 跨角色依赖（本角色边界外，未改）

1. **编排/运行时核心**需实现 `flow_get` / `flow_step_update` / `flow_step_supersede`，工具名、参数名
   （`flowId` / `stepId` / `status` / `expectedRevision` / `evidence` / `idempotencyKey` / `note` /
   `oldStepId` / `newStepId` / `title` / `owner` / `kind` / `reason`）与卡文本一致；若改名须同批对齐。
2. **权限与证据校验**：Steward 可更新全部、步骤 owner 只能更新自己的步骤；`done` 必须带账本可对账
   evidence；版本冲突/证据不足拒绝——这些必须由工具机械执行，卡文本只是行为约束。
3. **revision 语义**：`flow_get` 返回的 revision 必须能原样传给 `flow_step_update` /
   `flow_step_supersede` 的 `expectedRevision`；`revision-conflict` 的错误结果名/形状需与卡文本口径一致。
4. **初始创建路径**：`request_confirmation`（`cardKind=schedule-write`）写 YAML 的旧路径需保留用于
   初始创建与迁移兼容；若应用改为纯工具创建，须同批回改 Steward 卡。
5. **保留 id 与验收**：`verification` / `acceptance` 的既有自动派 Proof / 验收卡规则不变；工具不得
   被用来代替客户验收决定。
6. **Lead**：本批未要求 Lead 使用流程工具；若后续要求 Lead 读取流程，须另批更新。

## 5. 残余风险

- 卡文本是行为约束；模型是否真的先用 `flow_get` 再更新、是否在 `revision-conflict` 后重读，无机械检查。
- `idempotencyKey` 为可选；重复提交的幂等保证依赖工具实现与模型自觉。
- 旧写卡路径仍保留；若模型在创建后继续写卡/写文件，门禁是否拦截取决于工具与写权实现。
- 真机端到端与独立复验未进行；未提交 git。

## 6. 边界与约束

仅改 `src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-standard-workflow.test.ts`、
本文件、`changelog.md`、`memo.md`。未碰 `src/common/编排/**`、`src/provider/**`、`app/**`、
`test/测试/**`、`src/service/**`、其他角色文件/测试、真实项目；不读 `.env`、不跑真实模型/凭据/网络；
未 commit。
