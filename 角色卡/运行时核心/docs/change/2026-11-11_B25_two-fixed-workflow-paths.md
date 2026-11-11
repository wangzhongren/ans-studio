# W：B25 fixed `complete_team_plan` 回执校验（运行时核心，2026-11-11）

- 角色：ANS 固定 worker「运行时核心」（roleId: 运行时核心），独立上下文。
- 任务：T3「两条固定工作流路径」B25——RR22 失败修复（fixed complete_team_plan 成功被工具层判“结果未知”，A9 后死锁）。
- 依据：RR22 记录 `角色卡/测试/docs/change/2026-11-11_RR22_two-fixed-workflow-paths.md`（`84a7cf75bd66a9e01b51422f6df7e0c13ee9eb92d91d8ab72dc71152505d29a7`）；协调方 B25 授权与 RR23 预算批准。
- 基线：HEAD `469d0bb`（RR22 记录提交）。

## 一、RR22 失败事实（根因）

- A1–A9 应用侧完成：A9 `basis.recorded bas-c025778e7ec12b05bf121d90`、`stage.completed A9`（06:41:15.425），target 已 `git init` + 基线提交 `10d65cd`。
- 但 convener 三次 `complete_team_plan` 调用（06:41:15/19/40）均收到工具结果 `ok=false`「complete_team_plan: 结果未知或回执不完整…」；convener 报 A9 blocked，chief 落 blocker 后未发起 A10，12 分钟无进度 stall 停止。
- 代码根因：`src/provider/runtime/tools.ts` 的 `makeDirectCapabilityTools` 中 `complete_team_plan` 只有 legacy 注入（无 `entry.fixed`），fixed 会话经同一注入位调用 `completeTeamPlanFixed`；其结果走 legacy `directReceiptResult` → `isDirectActionReceipt` 校验。fixed 服务成功回执为 `{ok, operationId, flowId, workflowId, basisId, plan, documents, replay, stageCompleted}`，不满足 legacy 形状 ⇒ 每次成功都被改写为 `directUnknownResult`。服务已提交，仅模型侧回执错误。

## 二、实施

### 2.1 `src/provider/runtime/tools.ts`（M）

- 新增 `fixedCompleteTeamPlanReceiptResult(args, value)`（仿 `fixedCloseReceiptResult`）：
  - 非 record / `ok` 非布尔 ⇒ unknown；
  - `ok=false` ⇒ `fixedFailureResult(name, value)`（透出 code/message/missing，真实失败不降级 unknown）；
  - `ok=true` ⇒ 校验 `operationId`、`flowId`（及 `workflowId`）与入参逐字一致、`basisId` 非空字符串、`plan.path` 非空、`plan.version` 安全整数、`plan.sha256` 64 hex、`documents` 数组、`replay`/`stageCompleted` 布尔；通过 ⇒ `{ok:true, message: JSON.stringify(value)}`，否则 unknown（fail-closed）。
- handler 在 legacy 回执校验之前按入参形状路由：`args.workflowId` 为字符串且 `args.plan` 为对象 ⇒ `fixedCompleteTeamPlanReceiptResult`；legacy 回执路径（`isDirectActionReceipt`/`directReceiptResult`/source 校验）逐字不变。

### 2.2 测试 `test/runtime-core/two-fixed-workflow-paths-b3-1.test.ts`（M）

- fixed handler 既有用例改为返回 **fixed 服务真实成功回执形状**并断言 ok:true + 回执逐字透出；输入原样透传/signal 断言保持。
- 新增 B25 用例：
  1. fixed 失败回执（`baseline-team-plan-invalid`）⇒ `ok:false`，code/message 透出，**不得**出现「结果未知或回执不完整」；
  2. fixed 成功回执形状不符/身份不一致（缺 basisId、workflowId/flowId 不一致、plan sha256 非法、documents 非数组、stageCompleted 非布尔、legacy 形状回执）⇒ unknown（fail-closed，不伪造成功）；
  3. 混合 legacy 字段（fixed 形状 + runId/baseDigest）⇒ 工具层原样透传、服务拒绝（`baseline-legacy-field-forbidden`）原样透出、不降级 unknown。
- legacy 形状/必填/schema/角色门控用例保持通过。

## 三、验证（D1）

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b25-01-typecheck.txt`（`92ef7d09…`） |
| 受影响集（runtime-core b3-1/b2、桌面 b3-fixed-baseline-pathb、fixed-path-routing；4 文件） | **45/45 pass** | `_evidence/b25-02-affected.tap`（`062413db…`） |
| 确定性全链 | **3/3 pass** | `_evidence/b25-03-full-chain.tap`（`f4049c59…`） |
| 全量 `test/runtime-core/*.test.ts` | **553 pass / 33 fail / 4 skip**；33 条失败名与 WJ1 记录冻结基线**逐名一致**（diff 空） | `_evidence/b25-04-runtime-core-suite.tap`（`0b2a15f3…`）、`b25-05-runtime-core-known-red-failnames.txt`（`973c918f…`）、`b25-06-runtime-core-known-red-diff.txt`（`e3b0c442…`，空） |
| 全量 `test/编排/*.test.ts` | **1342 pass / 24 fail / 2 skip**；24 条与 B17 冻结 known-red **逐名一致**（diff 空） | `_evidence/b25-07-orchestration-suite.tap`（`023f66db…`）、`b25-08-orchestration-known-red-failnames.txt`（`f9513fb0…`）、`b25-09-orchestration-known-red-diff.txt`（`e3b0c442…`，空） |
| `submit-capability-tools` 单独（既有红复核） | 25 tests / 23 pass / 2 fail（R2 pair；HEAD 无 B25 时同样 2 fail，既有 known-red） | `_evidence/b25-10-submit-capability-alone.tap`（`9c0344ec…`） |

- 抖动披露：`download-provider.test.ts` 的 provider 超时用例在全量编排套件并发下曾两次失败（1341/25），单独运行 **14/14 pass**，第三次全量恢复 24 冻结 known-red；HEAD（无 B25）全量亦为 24。判定为时序抖动，B25 无确定性新增失败。详见 `_evidence/b25-11-flake-disclosure.txt`（`6bdb16e5…`）。

## 四、候选（运行时核心）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/provider/runtime/tools.ts` | M | 348,754 / 5,657 | `0ea9b17679f053d52be8569c1a9f479d1fb8b83f896260913f94c7e7b643a171` | +24/−0 |
| `test/runtime-core/two-fixed-workflow-paths-b3-1.test.ts` | M | 15,297 / 242 | `1a6c2338b2ddc65f9755cdbe6bcac45eef444ef405bffece667839296a3ee4fa` | +51/−6 |

## 五、限制与披露

- 只做确定性实现与测试；**未运行**真实 Electron/模型，不声称 RR/B2 通过；真实效果待 RR23 行使。
- 不改服务层 `completeTeamPlanFixed`、schema、桌面注入与 legacy 回执语义；只修复工具层对 fixed 成功回执的识别与透出。
