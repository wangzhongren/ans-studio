# 桌面窗口 B29 记录：fixed `complete_team_plan` 返回 fixed 服务形状（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「桌面窗口」（roleId: 桌面窗口；独立固定上下文；B29 写集）
- 任务：T3「两条固定工作流路径」**B29**（RR26 接缝事实：fixed A9 计划回执恒被工具层降级「结果未知」）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`f81f969`（RR26 记录提交）
- 性质：D1 实现批次记录（自检，不替代独立验收）；**未 commit / 未 push / 未合并 / 未发布**；未运行 Electron、未占用 CDP 9224。

## 一、事实（RR22/RR25/RR26 接缝）

1. 桌面 fixed 会话的 `complete_team_plan` 注入实现 `completeTeamPlanFixedForHandle` 原先把应用服务
   `completeTeamPlanFixed` 的成功结果包装成 legacy `DirectActionReceipt`：
   `{ok:true,status:"applied",operationId,baseDigest:null,targetDigest:completed.basisId,...}`。
   legacy 校验 `isDirectActionReceipt` 要求 `targetDigest` 为 64-hex，而 fixed 服务 `basisId` 形如
   `bas-<24 hex>` ⇒ fixed 成功回执**永远不被 legacy 校验接受**，工具层恒降级为「结果未知或回执不完整」。
2. 运行时核心 B25（`src/provider/runtime/tools.ts`，非本角色写区）对 fixed 调用（入参含
   `workflowId` + `plan`）走 `fixedCompleteTeamPlanReceiptResult`：
   - 成功要求 `{ok:true,operationId,flowId,workflowId,basisId 非空,plan{path,version,sha256},
     documents 数组,replay 布尔,stageCompleted 布尔}`，且身份与入参逐字一致；
   - 失败要求 `{ok:false,code,message[,missing]}`（`fixedFailureResult` 非空字符串校验后原样透出）。
3. 结论：桌面 fixed 分支必须**原样返回 fixed 服务形状**；legacy `completeTeamPlanForHandle` 与
   legacy 回执逐字不变。B30 已核对工具层 B25 校验器兼容该形状，`src/provider/runtime/tools.ts`
   **无需改动**（未改）。

## 二、实施

### 2.1 `app/desktop/session.ts`（M，+19/−34）

- 新增只读类型导入 `type CompleteTeamPlanFixedResult`（`src/common/编排/workflow-service.ts`）。
- fixed 注入位（唯一 fixed 注入，`sessionWorkflowMode === "fixed"`）继续复用共享能力位
  `CompleteTeamPlanFn`（工具层按入参形状路由 B25），以显式断言把返回 `Promise<CompleteTeamPlanFixedResult>`
  的实现接到 legacy 能力位类型上；**legacy 分支表达式逐字未改**。
- `completeTeamPlanFixedForHandle` 返回类型改为 `Promise<CompleteTeamPlanFixedResult>`：
  - 桌面级前置失败（`plan-task-unavailable` / `plan-flow-conflict` / `plan-task-changed` /
    `inspectWorkflowAssignedTask` 原码）返回 `{ok:false,code,message}`；
  - 应用服务成功/失败结果**原样返回**（成功含 `operationId/flowId/workflowId/basisId/plan/documents/
    replay/stageCompleted`，另含可选 `git`；失败为 `WorkflowServiceFailure`）；
  - 删除旧 legacy 包装（`status:"applied"` / `targetDigest=basisId` / `applicationId` / 拼装 message）。
- legacy `completeTeamPlanForHandle`、legacy 回执形状、runId 绑定、客户卡策略均未改。

### 2.2 入口核对（`grep -rn "completeTeamPlan" src app`）

- `app/desktop/session.ts`：**唯一 fixed 注入**（convener + fixed）。
- `src/pipeline/orchestration/trunk-runtime.ts:824`：legacy direct runtime（`service.completeTeamPlan`），
  非 fixed 入口，未改。
- `src/provider/runtime/tools.ts:4566`：共享能力位与 B25 分流，运行时核心写区，B30 已核对无需改动。
- 未发现第二处 fixed 注入；无跨写区需求。

## 三、测试（M，3 文件 +116/−12）

### 3.1 `test/桌面应用/b3-fixed-baseline-pathb.test.ts`（+102/−9）

- A9 fixed 成功：直接断言 fixed 服务形状（`ok:true`、`basisId` 匹配 `^bas-[a-f0-9]{24}$`、
  `operationId/flowId/workflowId`、`plan` 逐字、`documents` 数组、`replay:false`、`stageCompleted:true`），
  并断言无 legacy `status/targetDigest/applicationId`。
- 工具层闭环：用 `buildGovernedTools` + 本地放行 `WriteGate` 调用 `complete_team_plan`，断言 B25 接受
  同一回执、如实透出同一 `basisId`，且消息不含「结果未知或回执不完整」。
- fixed 桌面级 blocked：flow 不符 ⇒ `{ok:false,code:"plan-flow-conflict",message}`；无真实受派回合 ⇒
  `code:"plan-task-unavailable"`；失败均无 legacy `status/errorCode`。
- dirty 工作区失败：直接调用与服务码 `baseline-repository-dirty` 为 `{ok:false,code,message}`；
  工具层 `fixedFailureResult` 透出真实 code（不降级 unknown）。
- 新增 legacy 守门用例：legacy 会话注入仍返回 legacy `{ok:false,status:"blocked",errorCode,...}`，
  `isDirectActionReceipt` 接受（证明 fixed 形状未污染 legacy）。
- 文件头注释同步更新（旧「失败回执 status:blocked」表述）。

### 3.2 `test/桌面应用/chief-workflow.test.ts`（+5）

- W6/T5「普通消息回合无受派任务」用例显式钉 `legacy/v1`：该用例意图是 **legacy 宿主绑定回执**
  （`status/errorCode`）；empty 项目按 B6.1 解析为 fixed 后会得到 fixed 失败形状，故钉 legacy。
  fixed 的 `plan-task-unavailable` 形状已由 b3 套件覆盖；其它断言未弱化。

### 3.3 `test/测试/fixed-path-full-chain.test.ts`（+9/−3）

- 路径 A A9 回执断言从 legacy `status:"applied"` 更新为 fixed 服务形状：
  `basisId`（`bas-…`）、`workflowId`、`replay:false`、`stageCompleted:true`、无 legacy `status`。
  其余 Git/basis/阶段断言全部保留。

## 四、验证（D1）

| 范围 | 结果 | 证据（raw SHA-256） |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `b29-01-typecheck.txt`（`871c857d8ffc4848d9004deeea393200f3e8fb0b6f36eed79ae813aa99de5ab6`） |
| 受影响集（b3-fixed-baseline-pathb + fixed-path-routing + b51-fixed-workflow-wiring + b21-basis-gate-desktop + full-chain + runtime-core b3-1；6 文件，`--test-concurrency=1`） | **56/56 pass / 0 fail / 0 skip** | `b29-02-affected.tap`（`f4fdfc373e5b771a5a5dd35e55efdef68286defbd3d20027449120828a6d5ed0`） |
| chief-workflow W6/T5 三测（`--test-name-pattern="W6/T5"`） | **3/3 pass** | `b29-02b-chief-workflow-w6.tap`（`aeae50ff51aa77591800f1bd1a2157b7ba2e32c6b65a19d2f2e6818d107e87e8`） |
| 确定性全链 `test/测试/fixed-path-full-chain.test.ts` | **3/3 pass** | `b29-03-full-chain.tap`（`0bdb69302cef7c2419963f01c968e1fc5adae771dd8833824df0677425dae906`） |
| 桌面既有 known-red（`test/桌面应用/version-change.test.ts`） | 46 tests / 42 pass / **4 fail**；失败名与冻结基线 **逐名一致（`diff -u` exit 0、0 字节）** | `b29-04-version-change.tap`（`0b47b8558f45b87949c302a2bd374c9b6f8a3d798693cdc7f70252397a9a8c42`）、`b29-04-knownred.txt`（`d42bbe0e54b461175d0b3927d6de6c636df580eb2e33badbfc9bd9da181abdf9`） |

- known-red 说明（详见 `b29-04-knownred.txt`）：B29 fixed 相关范围 **0 known-red**；chief-workflow 全文件
  运行出现的额外红为 Windows 临时目录 teardown 竞态 `ENOTEMPTY`/本地 HTTP 适配器 flaky，已用**无 B29 改动**
  的临时 worktree（HEAD + 仅 B30 的 4 个非 B29 文件改动）复现同类红且运行间集合漂移，非本次引入。
- 头信息：`b29-00-baseline-head.txt`（`455ffb31d5295e0b310ee1374bd07459b85a3884bb1863cf4643714f258a1021`）。
- 无新增 skip/force-exit。

## 五、候选文件（桌面窗口写区）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `app/desktop/session.ts` | M | 868,205 / 13,456 | `52ea4a3890447e796e266b47bd4039aa9ded45a8ff92e83060a6553f10da7516` | +19/−34 |
| `test/桌面应用/b3-fixed-baseline-pathb.test.ts` | M | 45,619 / 813 | `522bff9d7cac0fc94768f1373d742e5249249731e606a61304315382993921c9` | +102/−9 |
| `test/桌面应用/chief-workflow.test.ts` | M | 263,839 / 2,667 | `94e92f721ab2fca29696941ec6f6f5435aa50adb10678e61f5b75da24bbc3201` | +5/−0 |
| `test/测试/fixed-path-full-chain.test.ts` | M | 84,347 / 1,271 | `97d771b85a61736a73b613f69db7291e4162346dd772e685565f7e9b3c1b43bd` | +9/−3 |

- 写集外改动 = 0（工作树中 `src/provider/trunk/impl/git-command.ts`、`test/runtime-core/two-fixed-workflow-paths-b3-1.test.ts`、
  `test/编排/git-command.test.ts`、`test/编排/readonly-git-transport.test.ts` 属 B30 运行时核心角色，未触碰）。
- 未改 `src/provider/**`、`src/common/**`、`src/pipeline/**`、`src/model/**`。

## 六、限制与披露

- 只做确定性实现与测试；**未运行**真实 Electron/模型，不声称 RR26/B29 真机通过；真实效果待调度方复跑。
- 工具层 B25 校验器与 fixed 注入位类型仍按运行时核心既有契约（共享 `CompleteTeamPlanFn` 注入位，
  返回形状由工具层按入参路由校验）；本层用显式断言表达，未改运行时核心类型。
- fixed 会话若模型不传 `workflowId`，B25 不进入 fixed 校验而按 legacy 校验降级 unknown（B25 既有行为，
  非本批范围）；fixed 会话应按 v4 schema 传 `workflowId`。
- 未 commit（由调度统一提交）；未 push/合并/tag；未占用 CDP 9224。
