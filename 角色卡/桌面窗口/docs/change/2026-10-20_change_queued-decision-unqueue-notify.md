---
id: queued-decision-unqueue-notify
type: change
title: 排队决定被自动处理（从未呈现）时补发 onExpired——渲染侧排队行不再残留
created: "2026-10-20"
status: implemented
---

# 排队决定自动处理后的排队行清理

## 真机问题

UI 显示「还有 7 个决定等待前一个决定」，但主进程队列/活动卡都是 0（apply 查过 `queuedCount=0`、
`pendingCards=0`）。根因：排队请求被判断 agent 直接代批/自动退回（**从未 presenter 呈现**）时，
customer-input 没有通知渲染侧减项；渲染侧 `queuedRequests` 只在 presented/onExpired 时删除，所以聚合行
残留。

## 改动（`app/desktop/customer-input.ts`）

- `ChannelEntry` 新增三个标记：
  - `queuedNotified`：该请求曾进入等待队列且已发 `onQueued`（界面出现排队行）；
  - `presented`：**真正 presenter 呈现成功**后才置 true（presenter 抛错按未呈现处理）；
  - `expiredNotified`：已发过 `onExpired`（rejectAllPending / cancel / 结算补发共用，防重复通知）。
- 置位：入队分支与 `replayPending`（重推排队行）置 `queuedNotified = true`；`presentNow` 在
  `opts.presenter` 成功后置 `presented = true`。
- `notifyExpired` 增加 `expiredNotified` 去重（同一条目至多通知一次）。
- `settleEntry`（active/judging 两条结算路径共用）：**曾排队且从未呈现** ⇒ 在 resolve 前补发
  `onExpired({ id, roleId, runtime, projectRoot, reason: "排队决定已自动处理（未呈现客户卡）" })`
  ——复用既有 `session:operator-expired` IPC（渲染侧已有删除 queued 的处理），随后照旧
  cleanup → resolve → 下一步推导 → drain。
- **不向客户呈现卡、不改结算语义/账本**：判断代批/自动退回的 outcome 逐字不变；`onQueued` 仍只在入队/
  重推时调用；队列 drain 后 `queuedCount` 归零（派生自 waiting，无第二状态源）。
- `rejectAllPending` / `cancel` / drain-aborted 路径原本就发 `onExpired`；去重标记保证与结算补发不双通知。

## 测试与证据（真实输出）

- `test/桌面应用/operator-wiring.test.ts` 新增 2 例（共 **51/51 过**）：
  1. 第一张卡直接进入判断（占住一项目一卡）、第二/三张排队；三张都被判断代批（从未呈现）⇒
     每个排队 id 恰一条 `onExpired`（reason=「排队决定已自动处理（未呈现客户卡）」）、无重复、
     `queuedCount=0`、`pendingCount=0`、`pushed`（客户卡）为 0、结算 outcome 均为 answered、
     approve 结果行仍每张一条（结算语义不变）；
  2. 正常呈现路径：第一张呈现、第二张排队后 drain 呈现并手答 ⇒ 零 `onExpired`（呈现过的不补发排队移除、
     不双通知），`queuedCount` 排空。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **679 计 / 679 过 / 0 红**。
- `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` ⇒ **44/44 过**。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险

- `onQueued` 抛错（IPC 失败）时仍置 `queuedNotified`：结算会多发一条 `onExpired`（渲染侧删除不存在的
  排队行为无害）。
- 渲染侧 `queuedRequests` 的持久化/重载清理由桌面UI 角色另行处理（本改动只保证主进程如实发清理通知）。
- 呈现失败（presenter 抛错）现在按「未呈现」处理：若该卡曾排队，会补发 `onExpired` 清行（比旧行为更准确）。
- `expiredNotified` 只去重同一 entry；同一 `id` 不会二次入队（id 由 nextId 生成）。
