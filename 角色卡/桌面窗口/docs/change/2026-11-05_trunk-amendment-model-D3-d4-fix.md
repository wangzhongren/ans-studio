# 桌面窗口 D4 修复记录：confirm 回执携带/校验 acknowledgments

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；桌面窗口（独立固定上下文）；E2/T1 缺陷 **D4**。
- **日期 / 状态**：2026-11-05；**D4 完成（派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push / 未 merge**。
- **依据**：E2 报告 `docs/acceptance/trunk-amendment-model-report-v1.md`（151 行 / `c6a05025…`）§三-2；T1 §8.2。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。
- **写集**：`app/desktop/customer-input.ts`；`test/桌面应用/version-change.test.ts`；本记录。**未改 `src/**`、`app/renderer/**`（U2 回传）、其它角色测试、角色卡/边界、session 的 `afterAppointmentWriteApproved` 防线。**

## 一、根因与结论

- **根因**：`OperatorDecisionPayload` 的 confirm 变体只有 `{kind:"confirm"; confirmed:boolean}`；`customer-input.ts` confirm 分支直接 settle answered，不读/不校验 `acknowledged`。而 `session.afterAppointmentWriteApproved` 要求 boundary 扩大项的 required acks 全覆盖才签发 stable 许可 ⇒ 客户即使在确认卡上勾选，回执也无法携带 ack，许可是 fail-closed 但功能不可用。
- **修复**：
  1. `OperatorDecisionPayload` confirm 变体加法可选 `acknowledged?: string[]`（渲→主不可信输入）。
  2. confirm 分支：`confirmed:false` ⇒ 不要求/不校验 ack，declined（不回传）；`confirmed:true` 且请求声明 `acknowledgments[].required` ⇒ `acknowledged` 必须为字符串数组、去重后**恰等于** required id 集合（缺失/多余/非数组一律 `{ok:false}`，pending 保留可重试）；合法 ⇒ answered 且回传 `CustomerInputOutcome.acknowledged`；无 required ⇒ 旧行为零变化（不校验/不回传）。
  3. 抽出公共 helper `settleAcknowledgements(request, raw)`，confirm 与 choice 分支**共用同一校验**（不复制第二套）；choice 既有行为不变。
  4. **不改** `session.afterAppointmentWriteApproved` 的最后防线（仍要求 required ack 全覆盖才签发许可）；不改 appointment-write/客户主权/D3 语义。
- **测试 / 类型检查**：D4 专项 **4 / 4 pass**（`version-change.test.ts` 34/34）；`test/桌面应用` 全量 **603 / 603 pass / 0 fail / 0 skip**（D2 基线 599 + 4 D4 tests）；cross-node 源码钉 + i18n **26 / 26 pass**；`npm run typecheck` **exit 0**。未改断言保绿、未新增 skip。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | SHA-256 | git hash-object |
| --- | --- | --- | --- | --- |
| 1 | `app/desktop/customer-input.ts` | 改（confirm `acknowledged` + 共用 required 校验） | `20772147c369f51f907312acc7a41f37229f3221fa436a1c5fb5b765e038f959` | `bc9807763f92ad45304a975acca50cf0e6416ab5` |
| 2 | `test/桌面应用/version-change.test.ts` | 改（+4 D4 tests；34 total） | `9b6553d580d95bfba05db785d7b9074d8280fb45973796f8810c2d1431608031` | `1dcdf2bbfbf71018eeaf1be6d2a1c9febcf1592b` |
| 3 | `角色卡/桌面窗口/docs/change/2026-11-05_trunk-amendment-model-D3-d4-fix.md` | 新增（本记录） | — | — |

**明确未改**：`src/**`（C1 `CustomerInputOutcome.acknowledged` 已定义）、`app/renderer/**`（U2 回传）、`app/desktop/session.ts`（`afterAppointmentWriteApproved` 防线保持）、`app/desktop/interface.ts`（IPC 原样透传）、其它角色测试、角色卡/边界。

## 三、confirm 回执形状与校验

```ts
// OperatorDecisionPayload（customer-input.ts）
| { kind: "confirm"; confirmed: boolean; acknowledged?: string[] }
```

- **共用 helper**（`createCustomerInputChannel` 内 `settleAcknowledgements`）：
  - 请求 `acknowledgments` 中 `required===true` 的 id 集合为空 ⇒ `{ok:true}`（不校验、不回传；旧行为零变化）；
  - `raw` 非字符串数组 ⇒ `{ok:false, error: selectionMustBeArray}`；去重后长度/元素与 required 集合不相等（缺失/多余）⇒ `{ok:false, error: selectionNotInRequest}`；pending 保留、可重试；
  - 合法 ⇒ `{ok:true, acknowledged: unique}`。
- **confirm 分支**：`confirmed:true` ⇒ 经 helper 校验后 `settleActive({outcome:"answered", value:{confirmed:true}, operatorId, acknowledged?})`；`confirmed:false` ⇒ `settleActive({outcome:"declined", operatorId, reason: customerDeclined})`（**不读** `d.acknowledged`，不回传）。
- **choice 分支**：改用同一 helper，既有 selected/ack 行为逐字保持。
- **结算链路**：`CustomerInputOutcome.acknowledged` → `withRequestLifecycle` 原样返回（`request.resolved` 不加字段，C1 口径）→ `session.afterAppointmentWriteApproved` 复核 required ack 后签发许可；`stablePermitOf` 可用。

## 四、测试与类型检查（原始结果）

1. D4 专项（`test/桌面应用/version-change.test.ts`）：**tests 34 / pass 34 / fail 0 / skipped 0**，其中 D4：
   - confirm+required 合法勾选 ⇒ answered + `acknowledged:["a"]`；
   - 缺失/非数组/多余非 required id ⇒ `{ok:false}` 且 pending 保留（之后合法回包可结算）；
   - `confirmed:false` 即使带非法 ack 也不校验 ⇒ declined、无 `acknowledged`；
   - 无 required ack ⇒ 旧行为（不要求/不回传）；
   - **端到端**：真实 `createCustomerInputChannel` + SessionManager + 真实栈，appointment-write 扩大 boundary 卡未勾选拒收、勾选后 `acknowledged` 回传且 `stablePermitOf(boundary)` 已签发（D4 根因闭环）。
2. `node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"` → **tests 603 / pass 603 / fail 0 / skipped 0**（D2 基线 599 + 4）。
3. cross-node：`g1-copy-and-nails` + `i18n-integration` + `项目管理/shared/i18n` → **26 / 26 pass**。
4. `npm run typecheck` → **exit 0**。未改断言保绿、未新增 skip；无既有失败新增。

## 五、U2 交接点（渲染侧回传；本节点不改）

- `DecisionDialog.confirm`（confirm 卡）在请求 `request.acknowledgments` 存在 required 项时，必须回传
  `{ kind:"confirm", confirmed:true, acknowledged: string[] }`（勾选 id 数组，去重后恰等于 required 集合）；
  `confirmed:false` 不需回传 `acknowledged`。
- 既有 `operatorRespond` IPC 原样透传 `decision`（无需改 preload/主进程）；`OperatorDecisionPayload` 已接受该字段。
- U2 应继续按 `acknowledgments` 对象数组渲染 required 勾选项（D1 已有），并在未勾选时禁用确认或让主进程拒收（pending 保留可重试）。

## 六、遗留与披露

1. 本节点只修 confirm 回执的**桌面主进程侧**；U2 的 `DecisionDialog.confirm` 回传字段是外部依赖（未改 `app/renderer/**`）。
2. `confirmed:false` 不校验 ack（拒绝不要求勾选）；如果 U2 在拒绝时仍回传 ack，主进程忽略、不回传。
3. 无 required 的旧 confirm 卡行为零变化（包括客户端可能携带的多余 `acknowledged` 被忽略）。
4. 未运行 Electron 截图/全量 T3/双端 renderer 构建（T1/T2）；E2 可复跑受影响套件后重判相关 AC。
5. 若需改 C1 Model/session 防线/新增 B-x，按停止项回报；本节点未触发。

## 七、声明

- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 本节点仅写 §二列出的文件；**未改 `src/**`/`app/renderer/**`/package.json/构建配置/角色卡/边界/`docs/scheduling|acceptance|communication|planning`/其它角色测试**。
- 未运行应用；**未 commit / push / merge / release**。
