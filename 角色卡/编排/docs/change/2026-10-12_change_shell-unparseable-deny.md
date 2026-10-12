---
id: shell-unparseable-deny
type: change
title: shell 审读不可解析不再打扰客户（M-2）：直接 fail-closed 拒绝 + 提示收紧
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [governed-interaction-and-chat-ux, shell-gate-arming]
events:
  - date: "2026-10-12"
    kind: designed
    summary: 真机首跑暴露——(a) 对话框弹出「pm 判定 JSON 不合法」；客户：「json 不合法的问题，就不用发给我了」；补充裁定「直接拒绝就行了」（不重试）
  - date: "2026-10-12"
    kind: implemented
    summary: shell-gate 解析失败改直接 fail-closed 拒绝（新归因码 b-unparseable-deny + 固定短句）；pm-reviewer 提示侧收紧（只输出 JSON、禁围栏/解释）
  - date: "2026-10-12"
    kind: verified
    summary: test/编排 160/160（+1）；typecheck 本角色零错；全量 831 计/827 过（3 红=2 既有环境 + 1 测试角色旧断言待更）
---

# M-2：shell 审读「不可解析」不再打扰客户

> 客户原话：「**json 不合法的问题，就不用发给我了。**」补充裁定：「**直接拒绝就行了**」。背景（真机首跑）：(b) 层模型审读没产出可解析结论 ⇒ (a) 层弹原生对话框，升级原因写「pm 判定 JSON 不合法」——客户不要这类打扰。

## 改在哪里（位置 → 改动）

**`src/common/编排/shell-gate.ts`——解析失败：升级 (a) → **直接拒绝**（fail-closed）**
- **删除** `BRANCH_B_BADJSON`（`b-badjson → 升 (a)` 的旧语义）。
- **新增（稳定枚举，供桌面 M-1 映射人话——看码不看文本猜）**：
  - 归因码 `BRANCH_B_UNPARSEABLE = "b-unparseable-deny"`；
  - 与之**一一对应**的固定短句 `REASON_B_UNPARSEABLE = "审核未能给出明确结论，已按 fail-closed 拒绝；可换更简单的命令形式或稍后重试"`。
- `runB`：`parsePmVerdict` 返回 undefined（含 null/undefined、围栏剥离 + 取首个 JSON 对象后仍非法）⇒ **terminate deny**（`branch: b-unparseable-deny`、`by: pm:输出不可解析`、`conclusion: deny`）——**不进 (a)、不重试、不打扰客户**。`BOutcome.deny` 增可选的 `branch` 覆盖位（缺省仍 `b-deny`）。
- **其它升级理由保持现状（逐条点名）**：(b) 明确判 `risky` ⇒ 仍必过 (a)；`b-unsure` ⇒ 升 (a)；`b-unavailable`（无会话/报错）⇒ 升 (a)；`b-timeout` ⇒ 升 (a)；`b-allow`（review）⇒ 终结放行；`b-deny` ⇒ 终结拒绝；c-*、a-* 全部不动。

**`src/pipeline/orchestration/pm-reviewer.ts`——提示侧收紧（减少该情形的发生手段，不是重试）**
- `buildPmReviewPrompt`：原「并**只**以…回复（不要任何多余文字）」收紧为「并**只输出下列 JSON**（**不得夹带任何解释文字、不得使用代码块围栏**；**字段与取值域固定**：`verdict` 只能是 allow / deny / unsure；reason / sessionId / model 为字符串）」。
- **解析侧容错照旧**（`parsePmVerdict` 已有：剥 ```json 围栏、取首个 `{...}` 块——本文件未改，新增链级测试钉住仍在生效）。

## 如何确认（实际结果）

- `test/编排/` **160/160**（+1）：`shell-review-chain.test.ts` 重写「不可解析」用例（断言 **pmAsk 恰 1 次**（不重试）、**operatorChannel 0 次**（不进 (a)）、`reason === REASON_B_UNPARSEABLE`、审计 `branch === "b-unparseable-deny"`、`conclusion === "deny"`）+ 新增「围栏包裹合法 JSON 仍解析成功（`b-allow` 终结）」；`shell-risky-order.test.ts`：risky + 不可解析 → **opCalls 0**、分支 `b-unparseable-deny`（原「升 (a)」断言删除）；`shell-arming.test.ts`：I-1 链上不可解析 → **operatorCalls 0**、fail-closed 短句在；unsure/超时升 (a) 既有断言保留。
- `npm run typecheck` 本角色零错；全量 `node --test "test/**/*.test.ts"`（引号带）**831 计 / 827 过 / 3 红 / 1 skipped**——3 红逐条：2 条**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）+ 1 条**测试角色旧断言**（`test/测试/t9-block3-pin-shell.test.ts:380-381` 仍断言 `b-badjson→a-*`——M-2 改判后待其更新，**请 pm 转达**；非本角色文件，未动）。**本角色零红**。
- 环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。真机复验（真的让 (b) 输出垃圾 → 客户不再被弹框）属**客户跑**。

## 不改什么

- (c) 硬地板与 白名单/risky 分类、(a) 的关窗/超时/不可用语义、审计落盘（本条拒绝**照常留痕**：`branch=b-unparseable-deny`、`conclusion=deny`）、`renderDispatch*`/回交等全部不动。
- **不重试**（客户补充裁定明确去掉）；不新增事件类型。
