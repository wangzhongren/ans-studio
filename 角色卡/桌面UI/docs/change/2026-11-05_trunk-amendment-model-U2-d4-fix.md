# 主干/冻结与版本变更申请模型 U2（D4 渲染侧修复）实施记录

- **任务 / flowId / 档位**：`2026-11-04-trunk-amendment-model` / `trunk-amendment-model` / **T3**（缺陷修复，渲染侧）。
- **角色 / 节点**：桌面UI（`app/renderer/src/**`、`test/桌面UI/**`）；来自 E2/T1 缺陷 **D4** 的渲染侧分派。D3（桌面 `app/desktop/customer-input.ts` 的 confirm 回执/结算）已完成，本记录只修渲染侧。
- **状态**：**implemented, tested（渲染单测/typecheck/构建）**；未启动 Electron；未 commit/push/暂存；未改 D3/桌面/服务/Model/其它角色文件。
- **一句话结论**：`DecisionDialog.confirm()` 正向确认在卡片声明 `required` acknowledgments 时，改为经纯函数 `confirmDecisionPayload` 发送 `{kind:"confirm", confirmed:true, acknowledged: requiredIds}`（恰为已勾选的 required id，非 required 不混入）；未勾选齐全返回 null（不可 confirm）；无 required 时旧 payload 不变；拒绝仍发 `{kind:"confirm", confirmed:false}`（不带 ack）。渲染侧 `OperatorDecisionPayload` confirm 变体同步 D3 加法 `acknowledged?: string[]`。

## 一、缺陷与冻结形状

- **缺陷**：`app/renderer/src/chat/DecisionDialog.tsx` 的 `confirm()` 原先只发 `{kind:"confirm", confirmed:true}`，A-5/C1 卡上已勾选的 **required boundary acknowledgments 在 confirm 路径丢失**；D3 已在桌面按请求快照校验/结算 `acknowledged`，但渲染侧从未上送。
- **D3 冻结形状（只读消费，未改）**：`app/desktop/customer-input.ts` 的 `OperatorDecisionPayload` confirm 变体：
  - `{ kind:"confirm"; confirmed:boolean; acknowledged?: string[] }`；
  - 请求声明 `acknowledgments[].required` 时，`acknowledged` 必须为字符串数组且去重后**恰覆盖**全部 required id（缺失/多余/非数组拒收，pending 保留）；
  - `confirmed:false` 不要求/不校验 ack；未声明 required ⇒ 旧行为零变化；
  - 合法时结算回传 `CustomerInputOutcome.acknowledged`。
- **渲染侧类型**：`app/renderer/src/lib/platform.ts` 新增导出 `OperatorDecisionPayload`（与 D3 同形；confirm/choice 两变体均含可选 `acknowledged`），供渲染侧/测试按冻结形状消费。

## 二、改动文件（候选哈希）

| 类别 | 文件 | blob | SHA-256 |
| --- | --- | --- | --- |
| 修改 | `app/renderer/src/chat/DecisionDialog.tsx` | `8328eb9d` | `5eb86e68…` |
| 修改 | `app/renderer/src/chat/decision-dialog.ts` | `d458c7e3` | `5c6a54f1…` |
| 修改 | `app/renderer/src/lib/platform.ts` | `e4a7d284` | `f8266f53…` |
| 修改测试 | `test/桌面UI/decision-dialog.test.ts` | `92f12842` | `3c31189a…` |
| 本记录 | `角色卡/桌面UI/docs/change/2026-11-05_trunk-amendment-model-U2-d4-fix.md` | — | — |

**写集核对**：仅上面 4 个代码/测试文件 + 本记录；未改 `app/desktop/**`、`src/**`、其它角色测试、角色卡/边界/communication/acceptance/scheduling；`git status` 中无其它新增改动（U1 既有改动保持不变）。

## 三、实现

1. **纯逻辑（`chat/decision-dialog.ts`）**
   - `confirmDecisionPayload(acknowledgments, acknowledged): ConfirmDecisionPayload | null`：
     - `required = acknowledgments.filter(required).map(id)`；无 required ⇒ `{kind:"confirm", confirmed:true}`（**不带** `acknowledged`，旧 payload 零变化）；
     - 有 required：仅当 `required` 全部在 `acknowledged` 中才返回；携带 `acknowledged = required`（按声明顺序；非 required 勾选项不混入，满足 D3“恰覆盖”）；未勾选齐全 ⇒ `null`。
   - `rejectDecisionPayload(): {kind:"confirm", confirmed:false}`：不带 `acknowledged`（D3 不要求/不校验）。
   - `ConfirmDecisionPayload` 类型取 `Extract<OperatorDecisionPayload, {kind:"confirm"}>`（与 D3 同源，不复制第二形状）。
2. **对话框（`chat/DecisionDialog.tsx`）**
   - `confirm()`：破坏性二次确认逻辑不变；随后 `confirmDecisionPayload(view.acknowledgments, acknowledged)`；`null` 时防御性早退（按钮仍由既有 `acknowledgmentsSatisfied` 禁用）；否则 `send(payload)`。
   - `reject()`：choice 分支不变；confirm 分支改发 `rejectDecisionPayload()`（`confirmed:false`，无 ack）。
   - 勾选状态沿用 U1：原生 checkbox、不预勾选、换卡清空、`aria-required`。
3. **类型（`lib/platform.ts`）**：导出 `OperatorDecisionPayload`（confirm/choice 变体 + `acknowledged?: string[]`），`operatorRespond` 注释指向该冻结形状；未改桥方法签名（拒绝/既有调用零影响）。

## 四、测试与验证

`test/桌面UI/decision-dialog.test.ts` 追加 5 个用例（不新增/弱化既有断言）：

1. required 全勾选（混入非 required）⇒ `acknowledged` 恰为 required ids、声明序；仅 required 子集勾选同样声明序输出。
2. required 未勾选齐全（空/部分/仅非 required）⇒ `null`（不能 confirm）。
3. 无 required（仅 optional / 空数组）⇒ `{kind:"confirm",confirmed:true}` 且 `"acknowledged" in payload === false`（旧行为）。
4. `rejectDecisionPayload()` ⇒ `{kind:"confirm",confirmed:false}` 且无 `acknowledged`。
5. 源码守卫：`DecisionDialog.confirm` 经 `confirmDecisionPayload(view.acknowledgments, acknowledged)`；`reject` 经 `rejectDecisionPayload()`；无旧的直发 `{ kind:"confirm", confirmed:true }`；`platform.ts` 导出 `OperatorDecisionPayload` 且 confirm 变体含 `acknowledged?: string[]`。

| 命令 | 结果 |
| --- | --- |
| `node --test "test/桌面UI/**/*.test.ts"` | **437 tests / 437 pass / 0 fail / 0 skip**（U1 后 432；D4 新增 5） |
| `npm run typecheck:renderer` | **exit 0** |
| `npm run build:renderer` | **exit 0**（✓ built in 344ms；仅既有 chunk-size/无效动态导入警告） |

## 五、D3 消费与边界

- 只消费 D3 已冻结的 confirm `acknowledged?: string[]` 语义；未改 `app/desktop/customer-input.ts`、未改结算/校验、未新增 IPC。
- 与 U1 的 choice 路径一致：`acknowledged` 只含 required id；`cancelled/reject` 不带 ack；客户主权（不预勾选、判断器/委托/指令不可代选）不变。
- 未发现需要停止回报的 D3/冻结契约缺口。

## 六、声明

未 commit/push/暂存；未启动 Electron；未接触客户；未改 D3/桌面/服务/Model/其它角色文件；未新增 skip 或弱化断言。本记录为 D4 渲染侧修复证据，不是验收结论；T1/T2/E2 另行进行。
