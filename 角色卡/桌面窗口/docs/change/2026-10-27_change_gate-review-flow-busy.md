# 桌面窗口：gate 复核在途返回可重试 `flow-busy`（原因可见）

- 日期：2026-10-27
- 角色：桌面窗口
- 触发：客户要求——gate 复核因「流程仍有在途工作」返回的应是**可重试的 `flow-busy`**，不是
  `unavailable`；必须把原因给运营看到。
- 状态：实现、测试与 typecheck 完成；未 commit/push、未重启应用。

## 改动

### `app/desktop/interface.ts`

`requestGateReviewForProject` / `performRequestGateReview` 第 9 步（在途工作检查）：

- 原：`manager.hasActiveWorkForFlow(flowId)` ⇒ `code:"unavailable"` + 通用 unavailable 文案。
- 现：⇒ `code:"flow-busy"` + `main.gateReview.flowBusy` i18n 文案（单一来源＝PM；zh-CN/en-US 均已落地）。
  语义：流程仍有在途交付/轮次/回交 ⇒ gate 暂不派发；**可重试、不是故障、不是 gate 失败、不是已派发**。
- 其他 `unavailable`（运行时解析失败、打开会话失败、投递失败等）**保持原样**。
- `flow-busy` 分支零副作用：不写 gate 记录、不写 `gate.review` / `dispatch.accepted` 账本、不派任务；
  在途结束后重试即正常进入派发。

契约（并发角色工作已落地，桌面只读消费）：运行时核心 `RequestGateReviewResult["code"]` 含
`"flow-busy"`；Provider 冻结 code 集含 `"flow-busy"` 并有专门转达（可重试/不是故障/gate 失败/不要当已
派发）；i18n key `main.gateReview.flowBusy` 在 zh-CN/en-US 落地。桌面不再需要类型断言或桌面侧兜底文案。

### `test/桌面应用/acceptance-dispatch.test.ts`

新增用例「flow 有在途工作 ⇒ flow-busy」：

1. 构造 gate 流程 + 可派发步骤 `impl`（owner=executor），写入提案接受/任命账本；
2. 经 convener 会话 `dispatchTask` 派发 `impl`，制造该 flow 在途工作；
3. `request_gate_review` ⇒ `ok:false, code:"flow-busy"`，message 来自 PM 文案（含「在途」「重试」
   「不是故障」），回执带 flowId/gateId；
4. 断言不写 gate 记录、不写 `gate.review` / gate 派发账本、不派 gate 任务；
5. executor settle（在途结束）后重试 ⇒ `code:"dispatched"`，恰一条 gate 复核任务。

既有「运行时解析失败 ⇒ unavailable」等用例不变，继续覆盖其他 `unavailable` 语义。

## 验证（active worktree：`.claude/worktrees/gate-review-flow-busy`）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` | exit 0 |
| 目标用例 | `node --test --test-name-pattern="flow 有在途工作" "test/桌面应用/acceptance-dispatch.test.ts"` | **1/1 通过** |
| 桌面全量 | `node --test "test/桌面应用/*.test.ts"` | **709/709 通过** |
| 跨角色 flow-busy 套件（只读复核） | `node --test "test/门禁引擎/gate-review-flow-busy.test.ts" "test/runtime-core/request-gate-review-tool.test.ts"` | **14/14 通过** |

## 边界

- 只改 `app/desktop/interface.ts` 与本角色测试/记录；未改运行时/Provider/门禁/PM/i18n/游戏项目
  （其 `flow-busy` 契约与 i18n key 由对应角色并发落地）。
- 未 commit/push、未重启应用。
