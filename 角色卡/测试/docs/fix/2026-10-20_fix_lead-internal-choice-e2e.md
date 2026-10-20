---
id: lead-internal-choice-e2e
type: fix
title: Lead 内部 choice 不得呈现客户的 E2E（测试角色）
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: verified
related: [lead-internal-choice, intent-confirm, flow-tools]
events:
  - date: "2026-10-20"
    kind: verified
    summary: 客户要求 Lead 的内部工程/协调 choice（不含 confirm）不得呈现客户后，新增 4 条 E2E：通用 choice ⇒ 0 客户卡/declined + 指导/无 customer.decision，Lead 随后用 flow_get/dispatch_task 推进；显式 intent-confirm 缺 confirm ⇒ 判断前 declined；含 confirm 的 intent-confirm 保持开关开代批/关手答。夹具补 flow 三工具透传；j 缺 confirm 负例同步前置拒绝。test/测试 799/799、全仓 3325/3323/0/2、typecheck 0。
---

# Lead 内部 choice 不得呈现客户：E2E

## 结论

- 新增 `test/测试/governance-e2e-auto/m-lead-internal-choice.test.ts`：**4/4**。
- `node --test "test/测试/**/*.test.ts"`：**799/799，17s**。
- 全仓 `node --test "test/**/*.test.ts"`：**3325 计 / 3323 过 / 0 红 / 2 skip，31s**。
- `npm run typecheck`：**exit 0**（运行期间产品文件稳定）。
- 未改产品源码、未改其他角色测试。

## 门控语义（产品实现，只读消费）

`run-role.ts` 客户通道包装（Lead / liaison）：

- `request_choice` 无 `confirm` 选项、且 `cardKind` 缺省或为 `intent-confirm` ⇒ **不呈现客户、不调判断、
  不写 customer.decision**，直接 `declined`：
  - 通用 choice：「这是内部协调/工程决策，不应要求客户选择；请 Lead 自行决定，或用 dispatch_task 派给
    Steward/项目角色，并用 flow_step_update 记录。客户只处理 intent-confirm 需求确认。」
  - 显式 `intent-confirm` 缺 confirm：「intent-confirm 必须有 confirm/revise 选项；本卡缺少 confirm 选项，
    未向客户呈现。请补齐选项后重试。」
- 含 `confirm` 的 choice 按角色默认推导为 `intent-confirm`，保持旧路径（decision 开关开 ⇒ 判断代批
  confirm；关 ⇒ 客户手答）。

## 用例

1. **通用 choice（keep-v1/do-v2/lead-decide，无 confirm、无 cardKind）**：
   - `presented=0`、`judgeRows=0`；
   - `request_choice` 回执 `ok=false`，含「内部协调/工程决策」「自行决定」「dispatch_task」
     「flow_step_update」「客户只处理 intent-confirm」；
   - 同一脚本随后 `flow_get`（成功）与 `dispatch_task`→Convener（门禁允许、成功），账本出现
     `dispatch.accepted{actorRoleId:"liaison",targetRoleId:"convener"}`；无 `customer.decision`。
2. **显式 intent-confirm 缺 confirm 选项**：0 客户卡、`judgeRows=0`、`request_choice` declined
   （「intent-confirm 必须有 confirm」「未向客户呈现」「请补齐选项后重试」）；无客户决定账本。
3. **含 confirm 的 intent-confirm 旧路径**：
   - decision 开 ⇒ 0 客户卡、判断结果行 `selected=["confirm"]`、账本 judge 证据；
   - decision 关 ⇒ 1 张客户卡、手答 confirm、customer-input 证据。
4. j-intent-confirm 的「缺 confirm」负例同步为**判断前直接 declined**（不再是 judge manual）。

## 夹具修正（测试侧）

`governance-e2e-auto/fixture.ts` 的脚本适配器补透传 `caps.flowGet` / `caps.flowStepUpdate` /
`caps.flowStepSupersede` 到 `buildGovernedTools`——产品已注入 Flow YAML 三工具，脚本适配器未透传会
「工具未注册」，导致 E2E 假阴性。

## 改动与纪律

- 新增：`test/测试/governance-e2e-auto/m-lead-internal-choice.test.ts`
- `test/测试/governance-e2e-auto/fixture.ts`（flow 三工具透传）
- `test/测试/governance-e2e-auto/j-intent-confirm.test.ts`（缺 confirm 负例同步）
- `角色卡/测试/docs/fix/2026-10-20_fix_intent-confirm-decision-group.md`（同日后置语义变化注记）
- `角色卡/测试/changelog.md` + 本文件
- 未由本角色 git 提交；未读 `.env`；未打印凭据；未改产品源码；未改其他角色测试。
