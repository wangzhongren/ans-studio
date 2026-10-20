---
id: readme-flow-yaml-20261019
type: change
title: README 增补「流程状态 YAML」：docs/flows/<flowId>.yaml 为唯一机器状态
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-10-19"
    kind: verified
    summary: README 新增流程状态 YAML 小节（唯一机器状态、schema、fail-closed 与 legacy 兼容）；装配测试 82/82 通过，仅文档改动
---

# README 增补「流程状态 YAML」小节

客户决定原话：「这些全部改成yaml。」流程状态由 Markdown 表格改为 YAML 唯一机器状态。本任务只改装配所属的 [README](../../../../README.md)，不修改任何代码、提示词或其他角色文件。

## README 改动

在 `## 角色协作怎样约束修改` 之后、`## 工程质量基线与验收演示` 之前新增 `## 流程状态 YAML`（原「技术结构与跨角色接口」一行保留为该小节结尾）：

- **唯一机器状态**：`docs/flows/<flowId>.yaml` 供应用解析并做派发与验收判定；同名 `.md` 仅人读视图，应用不解析它做判定。Markdown 流程文档仍可保留给人阅读。
- **Schema 示例**：顶层 `flowId`（与文件名一致）/`version`（正整数）/`qualityTier`（`prototype | production`）/`steps`（非空）；步骤字段 `id`/`title`/`owner`/`kind`/`status`/`evidence`/`supersedes`/`supersededBy`。
- **枚举**：`kind ∈ dispatch | customer-decision | artifact | acceptance`；`status ∈ pending | dispatched | delivered | done | superseded | failed | blocked | aborted`。
- **证据纪律**：`done` 必须有证据，`evidence` 为 `{kind, ref}`，`kind` 与步骤 `kind` 对应；`dispatch` 对账 `dispatch.accepted`，`customer-decision` 对账已结算的客户决定，`artifact` 对账 `artifact.observed`，`acceptance` 对账客户验收决定。
- **验收步骤归应用**：保留 id `verification` / `acceptance` 为应用自动派 Proof 的验收步骤（`kind: acceptance`，初始 `pending`）；Steward 不占用这两个 id、不派发、不标 `done`，执行与证据步骤改用其他 id（如 `verification-evidence`）。
- **取代关系**：推荐双写——被 retake 取代的旧步骤标 `status: superseded` 并写 `supersededBy`，新步骤写 `supersedes`；只写一侧也合法；真环（步骤互指或闭环）与两侧矛盾会被拒绝；`failed` / `blocked` / `aborted` 未标 `superseded` 时仍阻塞收尾。
- **fail-closed 与兼容**：YAML 存在但校验失败（未知字段、未知枚举、缺必填、`done` 缺证据等）⇒ 应用 fail-closed 并给出具体路径与原因，不回退解析 Markdown；仅在 YAML 不存在时，迁移期兼容旧的 Markdown 流程。

文风沿用 README 现有条目式表述，未加入发布结论或能力夸大。

## 只读核对依据（其他角色工作树改动，未修改）

- `src/common/编排/flow-state.ts`（编排写区，工作树未提交）：`parseFlowStateYaml` 的顶层字段/步骤字段枚举、`done` 必须有 `evidence`、`evidence.kind` 与步骤 `kind` 对应、`evidence.ref` 对账键（`dispatch.accepted.stepId` / `decisionKind` / `artifactPath` / 固定 `acceptance`）、保留 id 与 `supersedes`/`supersededBy` 校验（双写归一为一条「旧 → 新」关系，只写一侧也合法，真环与两侧矛盾拒绝）、未知字段拒绝均与 README 条目一致；`flowStatePath()` 返回 `docs/flows/<flowId>.yaml`。
- `src/common/编排/governance-gate.ts::flowStepExists`：YAML 存在即只认 YAML（校验失败 fail-closed，不回落 `.md`）；YAML 不存在才 legacy 回落 Markdown，对应 README 的兼容表述。
- `app/desktop/interface.ts`（桌面窗口写区）：自动验收门 YAML 优先、非法 YAML 不派且出系统行、ENOENT 才走 legacy `flowCompletionIssue`，对应「非法 YAML 不回退」。
- `src/common/门禁引擎/governance-roles.ts` 的 Steward 卡文本：`kind`/`status`/`evidence`、保留 id、`supersedes`/`supersededBy` 与 README 口径一致；卡内注明 `aborted` 为迁移兼容值且仍挡门。

## 示例自检（编排修复后）

README 的 YAML 示例采用双写形状（旧步骤 `supersededBy` + 新步骤 `supersedes`），用真实解析器原地校验（只读调用编排 `parseFlowStateYaml`）：

- `parseFlowStateYaml(<README 示例>, "todo-list-v1")` → `ok: true`，步骤解析为
  `delivery-server-old:dispatch:superseded, delivery-server:dispatch:done, verification:acceptance:pending`。
- **依据编排 2026-10-19 flow-state 修复**：先前双写会被误判成环（本角色首版 README 因此只展示单侧写法）；编排已修正为同一对步骤去重、归一为一条「旧 → 新」关系，双写合法且推荐，只写一侧也合法；真环（两节点互指、三节点以上闭环）与两侧矛盾仍拒绝并给出具体 YAML 路径。编排侧验证为 `test/编排` 667/667、typecheck exit 0。README 据此改为推荐双写的表述与示例。

## 测试同步

`test/装配/` 无钉 README 文案的用例：`release-packaging.test.ts` 只把 `README.md` 当作发布 overlay 的排除路径夹具（断言私有/文档文件不入包），不读取或断言正文。按任务要求不新增测试。

## 验证

- `node --test "test/装配/**/*.test.ts"` → **82 tests / 82 pass / 0 fail / 0 skipped**（工作树含其他角色未提交改动；本改动为纯文档）。
- README 的 YAML 示例（双写形状）经真实 `parseFlowStateYaml` 校验 → `ok: true`（详见上节）。
- `git diff --check -- README.md` → exit 0。
- 未跑全仓测试与 typecheck（仅 README 文档改动，不触代码）；未读 `.env`、未发真实模型/网络请求；未 git 提交。
