# B2 实施记录：两条固定工作流路径——角色模块/工具面（运行时核心：fixed close/activate v2 + WorkflowDocumentRef.version）

- 批次：**B2 角色模块/工具面——运行时核心批次**（团队计划 §三 B2「运行时核心」行 + 任务精确写集）
- 角色 / 上下文：运行时核心（roleId `运行时核心`，独立固定实施上下文）
- 日期：2026-11-10；worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；
  分支 `feat/two-fixed-workflow-paths`；基线 HEAD **`6a6d763`**（B2 角色模块/门禁/编排接线已提交）
- 状态：**已实现，未提交**。`npm run typecheck` **exit 0**；`test/runtime-core` before **564/527/33/4** →
  after **577/540/33/4**（失败名集合**一致**：新增确定性失败=0、新 skip=0；新增 13 测试全绿）；
  定向 61/59/2（2 = 既有环境红，见 §5.3）；`test/编排` **1,265/1,239/24/2**（与编排 B2 记录逐数一致）、
  `test/roles` **275/275**、`test/门禁引擎` **499/493/5/1**（只读回归）。
  **未 commit / 未 push / 未 merge / 未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。

## 0. 依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测（行 / 字节 / SHA-256） |
| --- | --- | --- |
| B1 验收（冻结，唯一判据；AC-05/18/24、T-04/13/17） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 / 33,722 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| G-IR 接口评审（MF-IR-2/3/5/8；§六拒绝 `requestReleaseMerge`） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 344 / 35,665 / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 实现级方案 v1.3（§3.5/§4.2 A3/A8/§7.1/§8.4/§10.3） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 / 184,391 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| 编排 B2 记录（fixed 回调签名与 handler 要求） | `角色卡/编排/docs/change/2026-11-10_B2_two-fixed-workflow-paths.md` | 291 / 23,139 / `9b0d65496dd5b18e0835d405920e7d63a26b5db5b5d1bc3af2cc3168e164c428` |
| 团队计划 | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | 159 / 17,013 / `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |

五份 hash 与任务给定值一致（写盘前实测）。

## 1. 范围与不做

**本批实现（B2 运行时核心；仅本角色写集）**

1. **MF-IR-2 `close_created_task` v2（fixed）**：类型/schema/handler 支持 fixed `{operationId,taskId,outcome,note?}`；
   fixed 会话调用编排注入的 `closeCreatedTaskFixed`（身份/项目根由注入端绑定）并**独立校验回执后直出**；
   legacy `runId/basisDigest/reportRef` 必填、旧 handler/回执/错误语义**逐字保留**（缺失 fail-closed）；
   fixed 分支不触 trunk/CAS。
2. **MF-IR-3 `activate_role_documents` v2（fixed）**：schema/handler 支持 fixed `{operationId,flowId,workflowId,
   proposalDecisionId,targetRoleId,roster:{path,sha256},documents:{card,boundaryMd,boundaryYaml}}`；
   调用 `activateRoleDocumentsFixed`；fixed 回执独立校验后直出；legacy 形状/必填/实现逐字保留；不写 trunk、
   不发 appointment-write。
3. **MF-IR-5**：`WorkflowDocumentRef` 追加可选 `version?: number`（A3 intent `documentRefs`）；旧形状兼容。
4. **`dispatch_task` 收口复核**：六字段（`taskKind/workflowAction/workflowPath/workflowId/stage/reworkOf`）与
   stage-request 形状校验已在 B0 落地；本批复核「旧属性/`required:["roleId","task"]`/文案不变」与
   `contract_check.taskKind` 同步，无源码改动（测试钉住）。
5. **merge-main/工具面复核**：卡种保持非判断卡、不进 `GOVERNANCE_CARD_GROUP`（`governanceCardGroup(...)`＝
   `undefined` ⇒ 桌面 `planJudge` 排除、judge 不可代批）；**未新增 `requestReleaseMerge`**（G-IR §六）；
   fixed 会话不注入 legacy Git/VCA/stable 工具（run-role 过滤；本批以注入面清单测试复核）。

**不做（按任务边界）**：`src/common/编排/**`、`src/pipeline/orchestration/run-role.ts`（编排 B1/B2 已提交）、
`src/model/role.ts`、`src/common/roles/**`、`src/common/门禁引擎/**`、`src/common/gates/**`、`app/**`、
其它角色/文档；不新增依赖；classify-shell v5（B4）；merge-main 卡执行/应用通道（B3）；不新增 skip/force-exit。

## 2. 实施内容

### 2.1 `src/model/runtime.ts`（M，+82/−0）

- `WorkflowDocumentRef`：追加 `version?: number`（MF-IR-5；纯加法，旧引用/旧事件合法）。
- 新增 fixed v2 类型面（与编排 `workflow-service.ts` 结构等价的本层契约，五层不反向依赖）：
  - `FixedCloseCreatedTaskInput`（4 字段；无 actor/source/runId/basisDigest/reportRef）；
  - `FixedCloseCreatedTaskResult`（`{ok:true,taskId,outcome,workflowId?,stage?,eventId,operationId,replay,
    stageCompleted}` | `{ok:false,code,message,missing?}`；**不是** legacy `DirectActionReceipt`）；
  - `FixedActivateRoleDocumentsInput/Result`（roster/提案决定/三文档；回执含 `workflowId/roleId/
    rosterSha256/activationKey/replay/stageCompleted` 或 `{ok:false,code,message,missing?}`）；
  - `FixedCloseCreatedTaskFn` / `FixedActivateRoleDocumentsFn`（`signal?: AbortSignal`）。
- `GovernedToolsOptions`：新增 `closeCreatedTaskFixed?` / `activateRoleDocumentsFixed?`（仅 fixed 会话由
  run-role 注入；两者存在时 handler 以 fixed 为准 = 纵深防御）；legacy 字段 `activateRoleDocuments`/
  `closeCreatedTask` 与既有窄能力全部逐字保留。

### 2.2 `src/provider/runtime/schema.ts`（M，+10/−4）

- **模式中立共享 schema**（一个工具 schema 同时承载两模式；是否必填由 handler 按实际模式核验）：
  - `close_created_task`：`required` 由 legacy 六项收口为 fixed 3+1 公共子集
    `["operationId","taskId","outcome"]`；legacy 属性（`runId/basisDigest/reportRef`）与 `note`、`outcome`
    枚举、`additionalProperties:false` 逐字保留。description 保留「legacy runId/basisDigest/reportRef
    必填不变」并补充 fixed 语义（只要求 3+1；真实创建者/报告/状态/幂等仍由应用核验；不触 trunk/CAS）。
  - `activate_role_documents`：新增 fixed 属性 `workflowId`/`proposalDecisionId`/`roster`（file 形状）；
    `required` = 两模式交集 `["operationId","flowId","targetRoleId","documents"]`；legacy 属性
    `planRef/d3DecisionId/rosterRef`（snapshot 形状）与 documents 子形状逐字保留。description 保留
    「失败保持旧有效版本」，补充 fixed：应用重算 roster/三文档实际字节 SHA-256、写 `role.activated`、
    不写 trunk、不发 appointment-write 卡。
- 文案模式中立（不写死 `two-fixed-paths`；不改变 legacy 提示方向）；未新增 `request_release_merge`。

### 2.3 `src/provider/runtime/tools.ts`（M，+89/−9）

- `makeDirectCapabilityTools`：条目改为 `legacy`/`fixed` 双实现位（注入任一即注册）；**fixed 优先**
  （两者同时存在——编排 B1 兼容别名场景——仍走 fixed；legacy 会话不会注入 fixed）。
- **模式化必填校验**（`modeShapeSchema`）：共享 schema 仅两模式交集；handler 按模式套用完整 `required`：
  - legacy close：`operationId/taskId/runId/basisDigest/reportRef/outcome`；
  - fixed close：`operationId/taskId/outcome`；
  - legacy activate：`operationId/flowId/planRef/d3DecisionId/rosterRef/targetRoleId/documents`；
  - fixed activate：`operationId/flowId/workflowId/proposalDecisionId/targetRoleId/roster/documents`。
  错误消息与 B2 前逐字一致（`invalid-arguments args.<field>: required`）。
- **fixed 入参构造**：`fixedCloseInput`/`fixedActivateInput` 只装载 v2 字段——fixed 模式下即便夹带
  legacy 键（`runId/basisDigest/reportRef`、`planRef/d3DecisionId/rosterRef`）也**不透传**（不触 trunk/CAS/
  appointment-write）；legacy 模式仍以原引用 `call.args` 调 legacy 实现（不改写载荷）。
- **fixed 回执独立校验**：不复用 legacy `isDirectActionReceipt`/`directReceiptResult`/`taskStatus`/
  `activationDigest`：
  - close：`taskId/operationId/outcome` 必须等于输入；`eventId` 非空、`replay/stageCompleted` 布尔、
    可选 `workflowId` 非空/`stage` 合法；`ok:false` 要求 `code/message` 非空、`missing` 为字符串数组；
  - activate：`workflowId/roleId/rosterSha256` 必须等于输入（rosterSha256 64-hex）、`activationKey` 非空、
    `replay/stageCompleted` 布尔；`ok:false` 同上。
  校验失败 ⇒ 既有「结果未知」fail-closed 文案；通过 ⇒ 回执 JSON 如实直出（`{ok,message}`）。
- **signal**：fixed 调用透传 `call.signal`（`invokeDirectCapability` 中止时不调用能力；外层 guard 在会话
  中止时直接拒绝）。
- legacy 路径（形状/必填/回执/错误文案/角色门控/`role-not-allowed`）逐字保留。

### 2.4 `dispatch_task` / `contract_check`（无改动，复核 + 测试钉住）

- `dispatch_task`：`required` 仍 `["roleId","task"]`、`additionalProperties:true`、旧属性 13 项逐字保留；
  六字段枚举/形状（`taskKind` 仅 `stage-request`；`workflowAction∈{advance,stop}`；`workflowPath∈{A,B}`；
  `workflowId` 1–200；`stage/reworkOf ∈ WORKFLOW_STAGES`）与 handler 校验/透传（B0）不变。
- `contract_check.taskKind` 枚举含 `stage-request`（schema/handler/`ContractCheckInput` 三处同步）。

### 2.5 merge-main / 工具面复核（无改动，测试钉住）

- `merge-main` 在 `GOVERNANCE_CARD_KINDS`/app-owned 清单；**不在** `GOVERNANCE_CARD_GROUP`
  （`governanceCardGroup("merge-main")===undefined` —— 桌面 `planJudge` 的排除依据）；`release.confirmed.by`
  仅 customer（B0 既有，未改）。
- 本角色写集源码 `requestReleaseMerge`/`request_release_merge` 零出现（测试扫描三源文件）。
- 注入面清单：只注入 fixed 依赖时，`git_query/git_candidate/git_publish/select_run_change/
  request_stable_write/submit_refactor/submit_version_change/request_version_decision` 均不注册
  （run-role 的 fixed 过滤在编排 B2 记录 §1.5 已实测；本层复核类型/清单）。

## 3. G-IR must-fix 闭环（本角色 owner 部分）

| 条件 | 状态 | 证据 |
| --- | --- | --- |
| **MF-IR-2** close_created_task v2 | **运行时核心侧闭环** | §2.1 类型、§2.2 schema、§2.3 handler；fixed 输入 3+1 放行并调用 fixed 回调；legacy 必填/错误语义逐字（测试 `two-fixed-workflow-paths-b2.test.ts`）。服务实现（真实创建者/报告/状态/幂等/`task.closed`+阶段事件/不触 trunk）属编排 B1 已提交 |
| **MF-IR-3** activate_role_documents v2 | **运行时核心侧闭环** | fixed 七字段 schema/handler；fixed 回执独立校验；legacy 形状/必填/实现逐字；不写 trunk、不发 appointment-write。服务实现（roster/提案决定/三文档 hash/`role.activated`）属编排 B1 已提交 |
| **MF-IR-5** `WorkflowDocumentRef.version` | **闭环** | `version?: number` 可选；旧形状/旧事件合法（§2.1；测试钉住） |
| **MF-IR-8** 不新增 `requestReleaseMerge` | **遵守** | 源码零出现；merge-main 非判断卡复核（§2.5） |
| MF-IR-4/6/7 | 不在本角色写集 | 由门禁引擎/六角色/编排 B1/B2 记录闭环（本批未触碰） |

## 4. 与编排 fixed 回调签名一致性（实测）

- 编排给出的依赖（`workflow-service.ts` 单一类型源；run-role 同名透传）：

```ts
closeCreatedTaskFixed?: (input: { operationId: string; taskId: string;
  outcome: "accepted" | "rework" | "rejected"; note?: string }, signal?: AbortSignal) => Promise<
  { ok: true; taskId: string; outcome: TaskClosedOutcome; workflowId?: string; stage?: WorkflowStage;
    eventId: string; operationId: string; replay: boolean; stageCompleted: boolean }
  | { ok: false; code: string; message: string; missing?: string[] }>;
activateRoleDocumentsFixed?: (input: { operationId: string; flowId: string; workflowId: string;
  proposalDecisionId: string; targetRoleId: string; roster: { path: string; sha256: string };
  documents: { card: { path: string; sha256: string }; boundaryMd: { path: string; sha256: string };
    boundaryYaml: { path: string; sha256: string } } }, signal?: AbortSignal) => Promise<
  { ok: true; workflowId: string; roleId: string; rosterSha256: string; activationKey: string;
    replay: boolean; stageCompleted: boolean } | { ok: false; code: string; message: string; missing?: string[] }>;
```

- 运行时核心 `FixedCloseCreatedTaskFn`/`FixedActivateRoleDocumentsFn`（`src/model/runtime.ts`）与上列**逐字段
  结构一致**；`npm run typecheck` exit 0 证明 run-role → `createRuntimeAdapter` → `buildGovernedTools` 的
  透传可赋值（`GovernedToolsOptions` 同名字段）。
- 消费规则：fixed 会话只消费固定字段；B1 兼容别名 `closeCreatedTask`（值为 fixed 实现）不会被消费
  （fixed 字段优先）；handler 仅传模型参数（4/7 字段），不附身份；回执按 fixed 独立校验直出。

## 5. 测试与证据

环境：Node **v24.22.1**；npm 11.19.1；git 2.55.0.windows.5；Windows 11；worktree（`runtime-protection-
scope-unknown` 等环境性 known-red 与 B0/B1 记录一致）。命令：`node --test --test-concurrency=1
--test-force-exit --test-reporter=tap`（before/after 同一命令）。

### 5.1 typecheck

| 时点 | 命令 | exit |
| --- | --- | --- |
| 实施前（HEAD `6a6d763` 干净工作树） | `npm run typecheck` | **0**（证据 02） |
| 实施后（本候选） | `npm run typecheck` | **0**（证据 11） |

### 5.2 `test/runtime-core/**` before/after（同一命令、同一环境）

| 时点 | tests | pass | fail | skipped | 日志 |
| --- | --- | --- | --- | --- | --- |
| before（HEAD `6a6d763` 干净工作树，本批改动暂时移出后实测） | 564 | 527 | 33 | 4 | `_evidence/01-before-runtime-core.tap` |
| after（本候选） | 577 | 540 | 33 | 4 | `_evidence/03-after-runtime-core.tap` |

- **失败名集合 diff：BEFORE−AFTER = 0、AFTER−BEFORE = 0**（证据 `03-failure-names-diff.txt`；
  33 项均与 B0/B1 记录的环境性/既有红一致，如 `runtime-protection-scope-unknown`、两个 `dispatch_task`
  文案红；见 `03-after-failure-names.txt`）。新增确定性失败=0、新 skip=0（skip 4 项名称前后一致）。
- before = HEAD 文件暂时恢复后当场实测、随后从候选备份逐字节恢复并校验 hash 一致（证据 12；仅 B0 测试
  文件因 `core.autocrlf` 在 checkout 时为 CRLF，JS 语义不变）；before/after 使用同一命令与同一环境。
- 增量：+13 tests（`two-fixed-workflow-paths-b2.test.ts`），全部 pass。

### 5.3 定向测试（证据 04）

| 文件 | 覆盖 |
| --- | --- |
| `test/runtime-core/two-fixed-workflow-paths-b2.test.ts`（新，13 tests） | fixed close：3+1 放行/回调只收四字段/legacy 实现不触达/信号透传；缺字段与坏枚举拒绝且不调用；fixed 回执独立校验（身份/形状/业务失败直出）、legacy 回执路径不套用；fixed activate：七字段放行/roster·documents 不重写/legacy 字段丢弃/legacy 实现不触达；fixed/legacy 两模式必填与回执校验；`WorkflowDocumentRef.version`；dispatch_task 收口复核；merge-main 非分组；`requestReleaseMerge` 零出现 + fixed 注入面清单 |
| `test/runtime-core/two-fixed-workflow-paths-b0.test.ts`（M） | B0 契约保持；唯一按计划更新：close 共享 `required` 断言改为两模式交集（§5.5），description/property 断言逐字保留 |
| `test/runtime-core/submit-capability-tools.test.ts`（不改） | legacy 五窄工具注入/身份/载荷/回执逐字（本批未修改，回归通过） |
| `test/runtime-core/direct-role-capabilities.test.ts`（不改） | 类型/守卫负例（不受影响） |

定向合计 **61 tests / 59 pass / 2 fail**；2 fail 均为 before 集合中的环境红
（`R2 Service real-chief context ...`、`R2 chief timeout ...`），非本批引入。B0+B2 两文件单独运行 **23/23 pass**。

### 5.4 只读回归（不改其它角色代码；证据 05/06/07）

| 套件 | 结果 | 说明 |
| --- | --- | --- |
| `test/编排/**` | **1,265 / 1,239 pass / 24 fail / 2 skip** | 与编排 B2 记录收尾计数（1,265/1,239/24/2）逐数一致；24 失败名见证据 `05-orch-failure-names.txt`（known-red，未恶化、无新增） |
| `test/roles/**` | **275 / 275 pass** | 零失败 |
| `test/门禁引擎/**` | **499 / 493 pass / 5 fail / 1 skip** | 5 失败名见证据 `07-gates-failure-names.txt`，与门禁引擎 B2 记录逐名一致（known-red） |

### 5.5 旧断言保护

- 未删除/弱化任何既有断言；唯一修改是 B0 契约测试中「close schema `required` 仍为 legacy 六项」的
  **批次性 pin**：G-IR §5.6 明确 B0 该状态「尚不足以支撑 fixed v2」、由 B2 接口扩展；现改为两模式交集，
  并在新测试中以逐字段错误消息钉住 legacy 必填语义（`invalid-arguments args.runId: required` 等）。
- 既有 `submit-capability-tools.test.ts` / `direct-role-capabilities.test.ts` 零修改并全部通过；
  legacy 成功回执 JSON 直出、未知/坏回执「结果未知」文案不变。

## 6. 候选（本角色 B2 写集）

### 6.1 逐文件（raw SHA-256 / bytes / lines）

| 文件 | SHA-256 | bytes | lines |
| --- | --- | --- | --- |
| `src/model/runtime.ts`（M） | `e719c3604f221fe9736c79b37c8d426a2eb5ffd62ac69b1c0153a277904eac82` | 247,607 | 4,904 |
| `src/provider/runtime/schema.ts`（M） | `2e7328a68d8d88cbc9a7247bf990a5f0f0b6bac7dcef5c02e69b7343db723891` | 151,949 | 1,908 |
| `src/provider/runtime/tools.ts`（M） | `616a7c7f7e1c835e414a7e35d047ab5b25d0619e304af50e1d8f436fc20d5cbe` | 344,776 | 5,601 |
| `test/runtime-core/two-fixed-workflow-paths-b0.test.ts`（M） | `eddfdc98989228644b837a39263fc60554ee56f15061b44a7c30a6d8bc623439` | 19,772 | 323 |
| `test/runtime-core/two-fixed-workflow-paths-b2.test.ts`（新） | `1ef5e5188fcd1e83d02fbb012fd576f015b33b324bf990d503f44d7d4ba44226` | 23,218 | 373 |

- git numstat（M）：`+82/−0`（runtime.ts）、`+10/−4`（schema.ts）、`+89/−9`（tools.ts）、
  `+5/−3`（b0 test）；新测试 373 行。合计 **787,322 bytes**。
- 聚合哈希（按路径排序后逐行 `path + "\0" + sha256` 串联的 SHA-256）：
  **`773152c85eab38b1869db387b64ef114c388017d31f49abc8d85f28b58c66ef3`**（证据 08，可复算）。

### 6.2 写集外 diff=0（实测）

- `git status --porcelain -- src app test` 仅上述 5 文件（证据 09）。
- 零 diff 守卫：`app/**`、`src/common/编排/**`、`src/pipeline/orchestration/run-role.ts`、
  `src/model/role.ts`、`src/common/roles/**`、`src/common/门禁引擎/**`、`src/common/gates/**`、
  `package.json`/lock（无新依赖）（证据 09）。
- 记录/证据仅写入本角色 `docs/change/`；未改其它角色/文档。

## 7. 限制与披露

1. **共享 schema 的 legacy 面**：为满足 MF-IR-2/3（同一工具 schema 必须接受 fixed 输入），`activate_role_
   documents` 的共享 schema 声明了 fixed 三键（`workflowId/proposalDecisionId/roster`）。legacy 调用若携带
   这些键，形状层容忍并**原样转交** legacy 实现（旧实现忽略未知键）；legacy 的必填/回执/错误消息不变。
   `close_created_task` 未新增属性，legacy 输入面 100% 不变。
2. **fixed 模式的 legacy 键**：形状层按各属性 schema 校验（出现须形状合法，仅作断言），handler **不透传**；
   不产生任何 trunk/CAS/appointment-write 行为。
3. **fixed close replay 回执**：编排服务 replay 分支固定返回 `stageCompleted:false`（服务语义）；工具层只
   如实转交，不推断阶段状态。`eventId` 在 replay 空串时按「结果未知」fail-closed（fixed 任务由同一服务
   写入 eventId，正常不触发）。
4. **known-red/环境性**：`test/runtime-core` 的 33 fail 与 B0/B1 记录同集合（30 项直接含
   `runtime-protection-scope-unknown`，其余为既有文案/冻结哈希红）；`test/编排` 24 red、`test/门禁引擎`
   5 red 与各自记录逐名一致；本批未修复、未恶化。
5. **本批不做**：状态机/账本/服务层业务校验（编排 B1 已提交）、桌面路由/卡通道（B3）、classify-shell v5
   （B4）、merge-main 卡执行（B3）。未新增 skip/force-exit（套件命令的 `--test-force-exit` 为环境适配，
   before/after 同一命令）。
6. 未运行真实模型/Electron/真机全链；未占用 9222/9223。

## 8. 未提交声明

- 本记录与 `_evidence/` 仅写入本角色 `docs/change/` 目录（任务精确写集）；产品/测试代码变更仅限 §6.1。
- **未 commit / 未 push / 未 merge / 未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。
- 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；引用 hash 均为写盘实测。

## 9. 证据索引（同目录 `..._evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-baseline-head.txt` / `00-baseline-status.txt` | 基线 HEAD `6a6d763`；基线 `git status --porcelain -- src app test` 为空 |
| `00-before-hashes.txt` | 基线三源文件 + B0 测试 raw SHA-256 |
| `01-before-runtime-core.tap` / `01-before-failure-names.txt` | before 全量 TAP（564/527/33/4）；33 失败名 |
| `02-before-typecheck.txt` | 基线 `npm run typecheck` exit 0 |
| `03-after-runtime-core.tap` / `03-after-failure-names.txt` / `03-failure-names-diff.txt` | after 全量 TAP（577/540/33/4）；失败名 diff 空 |
| `04-targeted-tests.tap` | 定向 4 文件 TAP（61/59/2；2 = 既有环境红） |
| `05-orch-readonly.tap` / `05-orch-failure-names.txt` | `test/编排` 只读回归（1,265/1,239/24/2） |
| `06-roles-readonly.tap` | `test/roles` 只读回归（275/275） |
| `07-gates-readonly.tap` / `07-gates-failure-names.txt` | `test/门禁引擎` 只读回归（499/493/5/1） |
| `08-candidate-hashes.txt` | 候选逐文件 hash/bytes/lines/numstat/聚合/写集外零 diff |
| `09-write-set-boundary.txt` | 写集外 diff=0 清单 |
| `10-adapter-subset.tap` | 适配器契约子集（`test/pi-adapter/dispatch-task`、`test/pi-adapter/tool-display-projection`、`test/claude-adapter/schema`）只读回归：**28/28 pass** |
| `11-after-typecheck.txt` | 收尾 `npm run typecheck` exit 0 |
| `12-baseline-revert-restore.txt` | before 实测的 HEAD 文件恢复 + 候选恢复的 hash 校验（逐字节一致） |
