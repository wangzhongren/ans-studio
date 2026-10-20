---
id: change_steward-flow-yaml
type: change
title: 五张内置卡流程状态统一为 YAML（唯一机器状态），Steward 标准工作流改写 YAML（kind/evidence/supersedes）
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: implemented
role: 门禁引擎
scope: 五张内置治理角色卡的流程状态引用统一为 docs/flows/<flowId>.yaml（同名 .md 仅人读视图）；Steward 标准工作流与流程单 schema 指引；权力、Section 1、预授权、禁写、能力位与判定逻辑零变化
events:
  - date: "2026-10-19"
    kind: implemented
    summary: 流程单机器状态改为 docs/flows/<flowId>.yaml（Markdown 仅人读视图）；Steward 卡加入顶层 flowId/version/qualityTier、步骤字段/kind/status 枚举、evidence{kind,ref}、done 必须有 evidence、保留 id verification/acceptance、supersededBy/supersedes 与 schema 校验拒绝后的修正纪律
  - date: "2026-10-19"
    kind: implemented
    summary: 协调方追加——Lead/Draft/Crew/Proof 的治理文件命名统一为 YAML 机器状态；Crew 读流程、Proof 标准复核按 YAML 读取流程状态（Markdown 仅人读视图）
  - date: "2026-10-19"
    kind: verified
    summary: 门禁引擎套件 283 计 / 282 过 / 0 红 / 1 skip（新增 3 例）；卡内 YAML 模板用 yaml 包解析通过，并用编排 parseFlowStateYaml 实测通过（template-flow）；npm run typecheck exit 0；未提交 git
---

# 五张内置卡流程状态统一为 YAML

## 1. 客户决定（原话）

> 这些全部改成yaml。

客户决定：流程状态改为 `docs/flows/<flowId>.yaml` 作为**唯一机器状态**；`docs/flows/<flowId>.md`
仅人读视图。Steward / 统筹的标准工作流必须写 YAML，并使用显式 `kind` / `evidence` / `supersedes`，
避免再用 Markdown 表撞收尾门。协调方追加：其余四张内置卡（Lead / Draft / Crew / Proof）的流程状态
引用也统一为该口径；Proof 的标准复核按 YAML 读取流程状态。

## 2. 卡文本变更（仅 `CONVENER_CARD_TEXT`）

`src/common/门禁引擎/governance-roles.ts`：

1. **职能与权力**：流程单明确为 `docs/flows/**` 中的 `docs/flows/<flowId>.yaml`（机器状态），
   同名 `.md` 仅人读视图。
2. **标准工作流（按序执行）**：
   - 第 1 步「写流程单」：必须写 `docs/flows/<flowId>.yaml`（**唯一机器状态**；同名 `.md` 仅人读
     视图，不得承载门禁状态），使用显式 `kind` / `evidence` / `supersedes`，包含 contract-freeze、
     集成/端到端与 `verification-evidence` 步骤，并引用提案中的架构模块/边界。
   - 第 2 步「派发项目角色」：`dispatch_task` 的 stepId 必须与 YAML 中该步骤的 `id` 完全一致。
   - 第 4 步「登记完成」：在 YAML 更新 `status`；`done` 的执行步骤必须写对应 `evidence`。
   - 第 3、5 步（收齐回交、应用自动派 Proof）与「不派发治理角色、不代替验收、不催办」逐字保留。
3. **治理文件命名**：流程一行改为 `docs/flows/<flowId>.yaml`（唯一机器状态；
   `docs/flows/<flowId>.md` 仅人读视图）。
4. **新增「流程单 YAML（必须照抄 schema）」段**，替换旧 Markdown 步骤表模板：

   ```yaml
   flowId: <flowId>
   version: 1
   qualityTier: production
   steps:
     - id: contract-freeze
       title: 冻结跨角色契约
       owner: <项目角色 id>
       kind: artifact
       status: done
       evidence:
         kind: artifact
         ref: docs/contracts/<name>-v1.md
     - id: delivery-server
       title: 服务端交付
       owner: <项目角色 id>
       kind: dispatch
       status: dispatched
     - id: verification-evidence
       title: 真实启动应用并演示
       owner: <项目角色 id>
       kind: artifact
       status: pending
     - id: verification
       title: 验收
       owner: app
       kind: acceptance
       status: pending
   ```

   - 顶层字段：`flowId`（与文件名一致，小写 slug）、`version`（正整数）、`qualityTier`
     （`prototype` / `production`，与客户确认的质量档位一致）、`steps`（非空数组；可选 `status`
     仅人读）。
   - 步骤字段：`id` / `title` / `owner` / `kind` / `status` / `evidence` / `supersedes` /
     `supersededBy`；`id` 用小写 slug（`[a-z0-9-]`）。
   - `kind ∈ dispatch | customer-decision | artifact | acceptance`。
   - `status ∈ pending | dispatched | delivered | done | superseded | failed | blocked`
     （迁移兼容值 `aborted` 会被识别并挡门，不要使用）。
   - `evidence` 是对象 `{ kind, ref }`，`kind` 必须与步骤 `kind` 一致：`dispatch` →
     账本 `dispatch.accepted.stepId`；`customer-decision` → 账本 `decisionKind`；`artifact` →
     项目相对产物路径；`acceptance` → 固定 `acceptance`。`status: done` 的步骤必须有 `evidence`，
     无证据不得标 `done`。
   - **保留 ID**：`verification` / `acceptance` 只能用于唯一的验收步骤（`kind: acceptance`、
     初始 `status: pending`、`owner: app`）——Steward 不占用、不派发、不标 `done`；只按模板预留
     该验收步骤；执行/证据步骤必须用其他 id（如 `verification-evidence`）。
   - 被 retake 取代的旧步骤标 `status: superseded` 并写 `supersededBy: <新步骤 id>`；新步骤写
     `supersedes: [<旧步骤 id>]`；不要保留 `aborted` / `failed` 行挡收尾门。
   - 写完流程后应用按 schema 校验：非法 `id`（含占用保留 id）、非法枚举值、未知字段、`done` 缺
     `evidence` 都会被拒绝；按错误提示修正 YAML 后重写，**不得改用 Markdown 表格**；YAML 步骤的
     `id` 与 `dispatch_task` 的 stepId 不一致时派发会被拒。
5. **质量职责**：真实启动/演示要求从「verification 步骤」改挂到执行/证据步骤
   （如 `verification-evidence`），并再次点明保留 id 归应用；「未演示不得进入验收」逐字保留。
6. **注册表条目 purpose**：`docs/flows/` 改为「流程单 YAML（唯一机器状态；同名 .md 仅人读视图；
   不自动推进）」。
7. **文件头注记**：登记客户 2026-10-19「这些全部改成yaml」决定。

### 逐字保留

「不拥有最终批准权」段、派发只依据客户已接受提案/已任命名单/流程单对应步骤、不派发内置治理角色、
不写角色卡/不创建角色、治理角色之间不 dispatch、提名由应用后台派发、判断代批纪律、治理卡参数纪律
（`schedule-write` / `write`，不用 `request_choice`）、可写目录/禁写路径、shell 审批档、
工程质量基线全文、`dispatch_task` 带基线/架构模块/contract-freeze/集成端到端、不得自动推进/催办。

## 2.1 其余四张内置卡（协调方追加）

按协调方要求，Lead / Draft / Crew / Proof 四张卡的流程状态引用统一为 YAML；各自权力、Section 1、
预授权、禁写、能力位与纪律逐字保留：

- **Lead / 主理（`liaison`）**：治理文件命名中的流程改为
  `docs/flows/<flowId>.yaml`（唯一机器状态；`docs/flows/<flowId>.md` 仅人读视图）。不新增流程读取
  或写权；`docs/flows/**` 仍在禁写路径中。
- **Draft / 提案（`rapporteur`）**：同上命名口径；不新增流程读取或写权；`docs/flows/**` 仍禁写。
- **Crew / 组队（`nominator`）**：治理文件命名同上；标准工作流第 1 步「读提案与流程」改为读
  `docs/flows/<flowId>.yaml`（唯一机器状态；同名 `.md` 仅人读视图）的流程单；`docs/flows/**` 仍禁写。
- **Proof / 验收（`verifier`）**：治理文件命名同上；标准工作流第 1 步「读流程单/提案/契约/架构影响
  分析」改为读 `docs/flows/<flowId>.yaml`（唯一机器状态；同名 `.md` 仅人读视图）；`docs/flows/**`
  仍禁写，仍只写 `docs/verification/` 与自身治理记录。

**测试**：`test/门禁引擎/governance-trio.test.ts` 的五卡共同命名断言升级为「YAML 机器状态 + Markdown
人读视图」双断言（原 `.md` 断言保留）；`governance-standard-workflow.test.ts` 新增 1 例覆盖五卡统一
口径与 Crew/Proof 按 YAML 读取（见 §4）。

## 3. 与真实 Flow YAML 契约的对齐（跨角色只读核读）

编排角色已在工作树落盘 Flow YAML 契约（本角色只读核读，未改）：

- `src/common/编排/flow-state.ts`：`parseFlowStateYaml(text, flowId)` /
  `evaluateFlowCompletion(flow, ledger)` / `flowStatePath()`；顶层 `flowId/version/qualityTier/status/steps`，
  步骤字段与枚举、`evidence{kind,ref}`、保留 id、`supersedes`/`supersededBy`、未知字段拒绝均与本卡
  文本一致。
- `src/pipeline/orchestration/flow-state.ts`：公共再导出。
- `src/common/编排/governance-gate.ts::flowStepExists`：YAML 存在即唯一机器状态（校验失败
  fail-closed，不回落 Markdown）；YAML 不存在才 legacy 回落 `.md`。
- `src/pipeline/orchestration/run-role.ts`：确认卡声明写 `docs/flows/<flowId>.yaml` 时，写前用
  `parseFlowStateYaml` 校验，失败拒绝发卡并交回 path + reason。
- `src/common/编排/governance-judge*.ts`、`governance-judge-facts.ts`：判定与物证路径改 YAML。

**实测**：把卡内 YAML 模板的 `<flowId>` 替换为 `template-flow` 后调用真实
`parseFlowStateYaml(text, "template-flow")` ⇒ `ok.true`，解析结果
`contract-freeze:artifact:done, delivery-server:dispatch:dispatched,
verification-evidence:artifact:pending, verification:acceptance:pending`。

## 4. 测试（真实输出）

- `node --test "test/门禁引擎/**/*.test.ts"`
  - **283 tests / 282 pass / 0 fail / 1 skipped**（基线 280/279/0/1；新增 3 例）。
  - 新增：`标准工作流：Steward / 统筹——流程机器状态改为 docs/flows/<flowId>.yaml（schema/保留 ID/evidence/superseded）`
  - 新增：`标准工作流：Steward 卡中的 YAML 模板可被 yaml 解析，顶层/字段/枚举/evidence 合法且保留 id 只用于验收步骤`
  - 新增：`标准工作流：五卡流程状态引用统一为 YAML（唯一机器状态），Markdown 仅人读视图；Crew/Proof 按 YAML 读取`
    （用仓库依赖 `yaml` 实际解析卡内模板块，校验顶层必填、步骤字段/枚举、done 的 evidence 对象与
    kind 对应、保留 id 只用于唯一验收步骤且初始 pending）
  - 更新（契约切换，非放宽）：`test/门禁引擎/governance-trio.test.ts` 的旧 Markdown 步骤表模板断言
    改为 YAML 模板逐字断言 + 反向断言（旧表头与「stepId 在第一列」不得复现）；Steward 质量职责断言
    改为执行/证据步骤承载真实演示。
- `npm run typecheck` ⇒ **exit 0**。

## 5. 跨角色依赖（本角色边界外，未改；按任务边界如实登记）

1. **桌面自动验收门的解析器仍是临时实现**：`app/desktop/interface.ts` 目前从
   `app/desktop/flow-state.ts` 导入 `parseFlowStateYaml`/`evaluateFlowCompletion`，而该临时文件的
   YAML 形状与编排契约**不一致**（用 `stepId` 而非 `id`、`kind: decision` 而非 `customer-decision`、
   `evidence` 为数组且 `kind` 取 `dispatch.accepted` 等、无 `version/qualityTier`）。桌面注释已写明
   编排模块落盘后改导入 `src/pipeline/orchestration/flow-state.ts` 并删除临时文件；**必须完成该切换**，
   否则 Steward 按本卡写出的 YAML 会在桌面自动验收门被判非法。
2. **编排提示词** `src/pipeline/orchestration/govern-session.ts` 的 `STANDARD_WORKFLOW_PROMPT`
   与本角色卡文本成对同步（本角色 memo 已登记「改文案须两处同批」）；其流程路径仍写
   `docs/flows/<flowId>.md`（L729、L762），需同批改为 YAML/人读视图口径。
3. **桌面旧路径辅助**：`app/desktop/governance-advance.ts::governanceFlowPath` 仍返回 `.md`，
   新增的 `governanceFlowStatePath` 返回 `.yaml`；`interface.ts` 已 YAML 优先、`.md` 仅 legacy
   回退，但两条流程文案/提示（如 Convener 写流程单的任务消息）仍写 `.md`，需其属主同步。
4. **其余四张内置卡已按协调方追加统一**：Lead / Draft / Crew / Proof 的治理文件命名均改为
   `docs/flows/<flowId>.yaml`（唯一机器状态；同名 `.md` 仅人读视图），Crew 读流程与 Proof 标准复核
   均按 YAML 读取；各自写权/禁写/能力位未变。代码侧仍需属主同步的文案见第 2、3 项。
5. **真实模型行为**：Steward 是否按卡文本写 YAML 仍靠模型遵从；写前校验已在编排
   `run-role.ts` 落地（YAML 卡会被 `parseFlowStateYaml` 拒绝非法形状），但本角色未做真机验证。

## 6. 残余风险

- 过渡期两套桌面/编排解析形状不一致（见 §5-1）；在桌面切换到编排公共出口前，真机自动验收门可能
  拒掉合法 YAML。
- `evidence` 仅按账本键对账，无内容哈希；演示证据仍可伪造。
- Markdown 人读视图可能漂移；门禁以 YAML 为准，无一致性机械检查。
- 保留 id 的机械守卫已在编排 `parseFlowStateYaml` 实现（kind/唯一性/初始状态），但桌面临时实现
  尚未对齐。
- 真机端到端与独立复验未进行；未提交 git。

## 7. 边界与约束

仅改 `src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-trio.test.ts`、
`test/门禁引擎/governance-standard-workflow.test.ts`、本文件、`changelog.md`、`memo.md`。
未碰 `app/**`、`src/pipeline/**`、`src/common/编排/**`、`src/service/**`、其他角色文件/测试、
真实项目；不读 `.env`、不跑真实模型/凭据/网络；未 commit。
