---
id: readme-flow-tools-20261020
type: change
title: README 增补「流程工具（方法化）」与 Lead 工作流管理者
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-10-20"
    kind: verified
    summary: README 新增流程工具小节、Lead 治理角色表与工作流管理者条目；装配测试 82/82 通过，仅文档改动
---

# README 增补「流程工具（方法化）」与 Lead 工作流管理者

客户决定原话：「按这个方案做吧」「主理作为工作流管理者」。流程文件改为方法化：应用是 `docs/flows/<flowId>.yaml` 的唯一写者，角色改用 `flow_get` / `flow_step_update` / `flow_step_supersede`；Lead / 主理 兼任工作流管理者。本任务只改装配所属的 [README](../../../../README.md)，不修改任何代码、提示词或其他角色文件。

## README 改动

1. **五个治理角色表 Lead 行**：职责补「兼任工作流管理者」，权力改为「客户沟通 · 工作流管理 · 不拥有最终批准权」。
2. **`## 角色协作怎样约束修改` 新增条目**：「主理 Lead 是工作流管理者」——可用 `flow_get` / `flow_step_update` / `flow_step_supersede` 推进或返工流程，也可用 `dispatch_task` 向 Steward 与项目角色派发协调任务；协调与推进不等于客户批准，客户决定仍走判断 agent / 客户卡，Lead 仍不拥有最终批准权。
3. **新增 `## 流程工具（方法化）`**（在「流程状态 YAML」之后、「工程质量基线与验收演示」之前）：
   - 应用是流程 YAML 的唯一写者，角色不再直接写流程文件；初始创建仍走 `schedule-write` 写卡，创建后不再为每次状态更新写文件或发写卡。
   - `flow_get`：读取流程摘要、步骤与当前角色可更新的步骤，返回 `revision` 与 `canUpdate`；更新前先取最新 `revision`。
   - `flow_step_update`：按 `expectedRevision` 更新步骤状态；Steward / Lead 可更新全部未终态步骤，其他角色只能更新 owner 为自己的步骤（仅限交付、失败、阻塞等有限迁移）；`done` 必须带账本可对账的 `evidence`；版本冲突 `revision-conflict`、证据不足 `insufficient-evidence`，按提示重新 `flow_get` 或补证后重试，不伪造证据。
   - `flow_step_supersede`：Steward / Lead 返工用；旧步骤标 `superseded` 并记 `supersededBy`，新步骤为 `pending`，历史保留不删除。
   - 推进不等于批准：需要客户决定的步骤仍走 `request_choice` / `request_confirmation` 等客户卡或判断 agent。

文风沿用 README 现有条目式表述，未加入发布结论或能力夸大。

## 只读核对依据（其他角色工作树改动，未修改）

- `src/common/编排/flow-service.ts`：应用唯一写者；`expectedRevision` 为当前文件字节 sha256，过期返回 `revision-conflict`；`done` 经 `validateFlowEvidence` 与账本对账，不足返回 `insufficient-evidence`；工作流管理者为 `schedule`（Steward）或 `liaison`（Lead），可更新全部未终态步骤；其他角色仅能更新 owner=自己的步骤且只允许 `dispatched→delivered`、`dispatched|delivered→failed|blocked`；`supersede` 仅管理者，旧步骤 `superseded`、新步骤 `pending`；原子写、串行与幂等。
- `src/provider/runtime/schema.ts`：三个工具的入参/回执形状——`flow_get` 返回 `flowId/revision/qualityTier/steps/canUpdate`；`flow_step_update` 必填 `flowId/stepId/status/expectedRevision`；`flow_step_supersede` 必填 `flowId/oldStepId/newStepId/title/owner/kind/expectedRevision`。
- `src/pipeline/orchestration/run-role.ts`：`flowGet` 注入所有角色；`flowStepUpdate` / `flowStepSupersede` 仅注入内置治理角色（service 再校验权限）；Lead 的 `dispatchTask` 能力为 true。
- `src/common/门禁引擎/governance-roles.ts`：Lead 卡「工作流管理」段与工具纪律；Steward 卡「写流程单（仅初始创建）」经 `schedule-write` 写卡、创建后状态推进用 `flow_get` + `flow_step_update`；`governanceCapabilitiesOf("liaison").dispatchTask = true`。

## 跨角色观察（未改，供属主确认）

1. `src/provider/runtime/schema.ts` 中 `flow_step_supersede` 的工具描述仍写「**仅 Steward（流程管理员）可用**」，而 `flow-service.ts` 实际允许 `schedule`（Steward）与 `liaison`（Lead），Lead 卡也明确 Lead 可返工。README 按实际服务端权限写「Steward / Lead」；工具描述文本与 Lead 卡/服务端不一致，建议运行时核心属主同步。
2. 门禁引擎 `governance-roles.ts` 中 Draft / Crew / Proof 卡文本写可用 `flow_step_update` 记录 `delivered` / `done`；但 `flow-service.ts::isTransitionAllowed` 对非管理者只允许 `dispatched→delivered` 与 `dispatched|delivered→failed|blocked`，`delivered→done` 仅 Steward / Lead。README 因此表述为「其他角色只能更新 owner 为自己的步骤（仅限交付、失败、阻塞等有限迁移）」。卡文本与服务端迁移矩阵需属主对齐，否则角色按卡操作会收到 `invalid-transition`。

## 测试同步

`test/装配/` 无钉 README 文案的用例：`release-packaging.test.ts` 只把 `README.md` 当作发布 overlay 的排除路径夹具，不读取或断言正文。按任务要求不新增测试。

## 验证

- `node --test "test/装配/**/*.test.ts"` → **82 tests / 82 pass / 0 fail / 0 skipped**（工作树含其他角色未提交改动；本改动为纯文档）。
- README「流程状态 YAML」示例经真实 `parseFlowStateYaml` 校验 → `ok: true`。
- `git diff --check -- README.md` → exit 0。
- 未跑全仓测试与 typecheck（仅 README 文档改动，不触代码）；未读 `.env`、未发真实模型/网络请求；未 git 提交。
