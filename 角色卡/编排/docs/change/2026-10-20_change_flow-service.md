# 2026-10-20 变更：Flow 文件方法化（编排侧核心）

- 日期：2026-10-20
- 角色：编排
- 客户决定：「按这个方案做吧」（Flow 文件方法化最小闭环）
- 范围：新增 `src/common/编排/flow-service.ts`；`src/pipeline/orchestration/run-role.ts` 注入；`test/编排/flow-service.test.ts`、`test/编排/governance-judge.test.ts`；本角色文档。未改 `src/model/runtime.ts`、`src/provider/**`、`app/**`、`test/测试/**`；未 git 提交。

## 1. 目标

应用是 `docs/flows/<flowId>.yaml` 的**唯一写者**；角色不再直接写流程文件，改用工具（`flow_get` / `flow_step_update` / `flow_step_supersede`）。串行 mutation、revision 校验、证据对账、原子写。

## 2. 公开契约

`src/common/编排/flow-service.ts` 导出：

```ts
createFlowService({ projectRoot, actorRoleId, actorPower, defaultFlowId?, writeFile? }): {
  get(input: { flowId?: string }): Promise<FlowToolResult>;
  update(input: { flowId; stepId; status; evidence?; expectedRevision; idempotencyKey?; note? }): Promise<FlowToolResult>;
  supersede(input: { flowId; oldStepId; newStepId; title; owner; kind; expectedRevision; reason?; idempotencyKey? }): Promise<FlowToolResult>;
}
```

类型单一来源＝运行时中立契约 `src/model/runtime.ts` 的 `FlowTool*`（2026-10-20 运行时核心已落盘）；flow-service **再导出同一组符号**，不保留第二份形状。`FlowToolResult.issues` 按契约为 `string[]`（`path: message` 形式）。

## 3. 行为

### 3.1 `get`

- flowId 缺省用 `defaultFlowId`；仍无 ⇒ `missing-flow-id`。
- 读 `docs/flows/<flowId>.yaml`；不存在 ⇒ `not-found`；非法 ⇒ `invalid-flow`（带具体 `path: message`）。
- `revision = sha256(文件字节)`；返回 `flow` 视图 + `canUpdate`：
  - `actorPower === "schedule"`（Steward/Convener）⇒ 全部未终态步骤（`done`/`superseded` 之外）；
  - 其他角色 ⇒ `owner === actorRoleId` 的未终态步骤；否则空。

### 3.2 `update`

- **per-project 串行队列**（模块级 Promise 链，键=`path.resolve(projectRoot)`）；读-改-写都在临界区。
- revision 不匹配 ⇒ `{ok:false, code:"revision-conflict", revision, flow}`（带当前 revision/flow，不写盘）。
- 不存在 ⇒ `not-found`；非法 ⇒ `invalid-flow`；步骤不存在 ⇒ `step-not-found`。
- 权限：
  - Steward/Convener（`schedule`）可更新全部步骤；
  - 其他角色仅 `owner === actorRoleId`，否则 `forbidden`；
  - `pending→dispatched`、`delivered→done` 仅 Steward；`delivered|dispatched→failed|blocked` 允许 owner；
  - `superseded` 只能走 `supersede`（`update` 返回 `invalid-transition` 并指向 `flow_step_supersede`）；
  - 终态 `done/superseded` 不可再改；非法迁移 ⇒ `invalid-transition`。
- `done`：必须有 `evidence`；`evidence.kind` 必须与步骤 `kind` 对应；用 `flow-state.ts::validateFlowEvidence` 对**候选 flow**与账本对账，只过滤目标 `stepId` 的 issue；有 ⇒ `{ok:false, code:"insufficient-evidence", issues}`。`dispatched/delivered/failed/blocked` 不要求 evidence。
- 幂等：目标步骤当前 status/evidence 与请求一致（`evidence` 省略=保留原值）⇒ `{ok:true, idempotent:true, revision, flow}`，不写盘。`idempotencyKey` 接受但本轮不做 LRU（状态/证据相等已覆盖重放）。
- 写：保留已知字段与步骤顺序（`flowId/version/qualityTier/status/steps` 及步骤 `title/owner/kind/status/evidence/supersedes/supersededBy`）；注释/原始格式不保真。原子写复用 `common/shared/atomic-write.ts`（tmp + fsync + rename），失败 ⇒ `write-failed`，原文件不被替换；写后重算 revision。

### 3.3 `supersede`

- 仅 Steward/Convener（`schedule`），否则 `forbidden`。
- old 必须存在且非验收保留步骤（`verification`/`acceptance`、或 `kind: acceptance`）⇒ `invalid-supersede`。
- newStepId 唯一（同 old 拒绝）；旧步骤 `status:"superseded"` + `supersededBy:new`；新步骤插入旧步骤之后，`status:"pending"` + `supersedes:[old]`；新步骤 title/owner/kind 由入参给出。
- 重复同一 supersede（old 已 superseded、new 存在且匹配）⇒ `{ok:true, idempotent:true}`；new id 被其他步骤占用 ⇒ `step-exists`；旧步骤已被其他步骤取代 ⇒ `invalid-supersede`。
- 与原 `update` 相同的 revision 校验 / 串行队列 / 原子写 / 候选 YAML 复核（含 supersede 双写一致性）。

### 3.4 诊断

`component: "orchestration.flow-service"`；事件 `flow.update`、`flow.supersede`、`flow.conflict`（写失败另记 `*.write.failed`）。不写客户决定账本，只写 YAML。

### 3.5 配套：项目角色 artifact 观察（2026-10-20 真机证据缺口）

`run-role.ts::scanPreauthorizedArtifacts` 原先只扫**内置治理角色**的 `preauthorizedDirs`，项目角色（tester）写在 `test/evidence/...md` 的产物永远不会产生 `artifact.observed`，导致 `kind: artifact` 步骤即使写了文件也无法 `done`。本批修复：

- **观察目录**：内置治理角色沿用 `preauthorizedDirs`（既有行为逐字不变）；项目角色扫描其 boundary Section 1 中 `kind:"directory"` 且 `root:"project"` 的目录（tester 的 `test/`、`scripts/`，backend 的 `src/`，frontend 的 `public/` 等）；两套集合按角色去重合并。
- **安全排除**：`.ans/`、`角色卡/` 全树、空/绝对/`..` 路径；扫描器沿用「只收 `.md`、跳过符号链接、按路径排序」。
- **写账本**：角色 settle 后对新增/变更的 `.md` 追加 `artifact.observed`；项目角色 `actorRoleId=该角色`、`power="project"`（`GovernancePower` 为此新增 `"project"`），内置角色仍为 `power=function`；应用算 sha256；未变更不重复记录。
- **启用范围**：`governanceModel === "trio"`（项目角色）或内置 trio 角色；single/su 项目保持零账本副作用。
- 测试：tester 在 `test/evidence/foo.md` 写文件并 settle ⇒ `artifact.observed{artifactPath, actorRoleId:"tester", power:"project"}`；内容变更再记一条、未变更不重复；`docs/secret.md`/`.ans/secret.md`/`角色卡/tester/secret.md` 不观察；flow YAML 的 artifact 步骤 `evidence.ref` 指向该路径时 `validateFlowEvidence` 通过。

### 3.6 应用专用：`completeAcceptanceStep`（2026-10-20 真机补收口）

真机：verifier 第二轮复核完成，验收卡被判断 agent 代批 accept，账本已有 `customer.decision{decisionKind:"acceptance",customerDecision:"accepted",flowId:"bookmark-manager"}`，但 flow YAML 的 `verification` 仍 pending——`evaluateFlowCompletion` 已返回「已有验收决定，流程已收口」，且又重复派了一次 verifier。补应用专用收口（**不注册为角色工具**）：

- 新增并导出 `completeAcceptanceStep({ projectRoot, flowId })`（`flow-service.ts`），经 `src/pipeline/orchestration/flow-state.ts` 公共出口再导出（桌面只消费公共出口）。
- 行为：
  - 读 flow YAML；找保留验收步骤（`verification`/`acceptance`，`kind: acceptance`）；已是 `done` ⇒ `{ok:true,idempotent:true,revision,flow}`（不写盘）；
  - 读账本；必须存在该 flowId 的 `customer.decision{decisionKind:"acceptance",customerDecision:"accepted"}`；缺失（含 rejected）⇒ `{ok:false,code:"acceptance-not-accepted"}`；账本坏行 ⇒ `ledger-unavailable`；
  - 把验收步骤设为 `status:"done"`、`evidence:{kind:"acceptance",ref:"acceptance"}`（保留其他步骤/supersedes/顺序）；候选 YAML 复核通过后原子写；并发/revision 沿用现有 per-project 串行队列与 `atomic-write`；诊断 `flow.acceptance.completed`；
  - **不写客户决定账本、不伪造客户批准**；缺保留验收步骤 ⇒ `acceptance-step-missing`。
- 测试：accepted+pending ⇒ done+acceptance 证据；重复调用幂等；无 accepted/rejected ⇒ `acceptance-not-accepted` 且文件不变；坏账本 ⇒ `ledger-unavailable`、非法 flow ⇒ `invalid-flow` 均不写盘；只读目录原子写失败 ⇒ `write-failed` 原文件不变；并发两调用 ⇒ 一完成一幂等、revision 一致。

## 4. 注入（`run-role.ts`）

- 每个 `openRoleSession` 创建一个 `createFlowService({ projectRoot, actorRoleId: setup.role.id, actorPower: trioSpec?.function ?? "project" })`。
- `flowGet` 注入**所有角色**；`flowStepUpdate`/`flowStepSupersede` 只注入**内置治理角色**（项目角色本批只有 `flowGet`；权限仍由 service 二次校验）。
- `flowGet` 的缺省 flowId 用**调用时**的 `currentFlowId`（会话中途切 flow 也能取对）。
- 能力字段名与运行时核心 `GovernedToolsOptions` 对齐：`flowGet` / `flowStepUpdate` / `flowStepSupersede`；`createRuntimeAdapterFactory` 以 spread 透传（运行时核心已注册三工具并按回执 `ok/code/revision/error/issues` 原样转达）。

## 5. 测试与验证（真实输出）

- `test/编排/flow-service.test.ts` **17 例**（11 + Lead manager + 5 completeAcceptanceStep）：
  - get revision=文件 sha256 / Steward/owner/stranger 的 canUpdate；
  - defaultFlowId / 缺失 flowId / not-found / invalid-flow；
  - revision-conflict（带当前 revision/flow，不写盘）；
  - Steward pending→dispatched→delivered→done（dispatch 证据对账；缺 evidence / kind 不匹配 / 账本无记录均 insufficient-evidence）；
  - owner 权限与迁移限制（pending→dispatched 拒、他人步骤 forbidden、delivered→done 拒、dispatched→delivered/failed 允许）；
  - Lead（liaison）manager：canUpdate 全部未终态、可更新他人 owner、可 supersede；证据/revision 校验不变；
  - 非法迁移（pending→done / dispatched→done / superseded 经 update）；
  - 幂等（同 status/evidence 重放 ok/idempotent，不写盘）；
  - artifact 证据对账（artifact.observed）；
  - supersede（旧/新关系、重复幂等、验收保留 id、已存在 id、非 Steward forbidden）；
  - 原子写失败 ⇒ write-failed 且原文件字节不变；
  - 并发两个同 revision 更新 ⇒ 恰一成功、一 revision-conflict（串行队列）；
  - `completeAcceptanceStep`：accepted+pending ⇒ done+acceptance 证据/幂等/未 accepted/rejected/坏账本/非法 flow/原子写失败/并发。
- `test/编排/governance-judge.test.ts` 新增：项目角色只有 `flowGet`；内置治理角色有 `flowGet`+`flowStepUpdate`+`flowStepSupersede`。
- `test/编排/governance-session.test.ts` 新增：项目角色（tester）settle 后观察 boundary directory 内新增/变更的 `.md`（tester `test/evidence/foo.md`）；内容变更/未变更、禁写路径、`validateFlowEvidence` 对账。
- `node --test "test/编排/flow-service.test.ts"` → **17/17**
- `node --test "test/编排/**/*.test.ts"` → **704 tests / 704 pass / 0 fail / 0 skipped**
- `npm run typecheck` → **exit 0**（全仓）

## 6. 跨角色待办

1. **运行时核心 code 文案（已对齐）**：`src/provider/runtime/schema.ts` / `src/model/runtime.ts` 注释 / 门禁卡 / runtime-core 测试统一使用 `revision-conflict` 与 `insufficient-evidence`；本服务已按同一口径返回，工具层原样透传。
2. **直接写路径收口**：当前 `docs/flows/<flowId>.yaml` 仍可经 `request_confirmation`/`write-flow` 由 Convener 直接写（保留迁移兼容与既有测试）；「应用唯一写者」的强制收口（拒绝角色直接写 flow YAML）建议下一批单独实施。
3. **角色提示/门禁卡文本**：Steward/Convener 的提示仍写「流程状态写入 docs/flows/...yaml」；应改为「用 flow_get/flow_step_update/flow_step_supersede，不直接写 flow 文件」。门禁引擎卡文本归其属主。
4. **`idempotencyKey` 跨进程重放**：本轮仅靠 status/evidence 相等做幂等；若需要跨进程/重启重放，需账本或持久化 LRU（未做）。
5. **项目角色 artifact 观察**：已随本批修复（§3.5）；项目角色仍只给 `flowGet`，写 flow 仍由工具化路径/后续批次收口。
6. **桌面窗口（本批跨角色）**：在 acceptance check / verifier settle 检测到账本已有 accepted 时调用 `completeAcceptanceStep({projectRoot, flowId})`（经 `src/pipeline/orchestration/flow-state.ts`），并在同处跳过/去重 verifier 重派；该函数是应用专用，不注册为角色工具。

## 7. 残余风险

- 串行队列是**进程内**按项目；跨进程并发写同一 YAML 仍可能 last-writer-wins（原子写保证不损坏，但不做跨进程锁）。
- YAML 注释/原始格式不保真（数据字段与步骤顺序保留）。
- `done` 只过滤目标 stepId 的证据 issue（按任务书）；其他既有 done 步骤的账本漂移不会阻断本次更新。
- `completeAcceptanceStep` 是**应用专用**：只读账本确认 accepted、只写 YAML；没有 accepted 决定时拒绝（含 rejected），不伪造客户批准；幂等只以验收步骤 `done` 为准（不重复读账本）。
- 桌面重复派 verifier 的去重需桌面侧在调用该函数后同处收口（本批只提供收口函数）。
- 直接 `write_file` 路径仍在（见 §6.2），「唯一写者」目前是流程约定 + 工具化，不是硬门禁。
