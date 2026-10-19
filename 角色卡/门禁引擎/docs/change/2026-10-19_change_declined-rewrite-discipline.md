---
id: change_declined-rewrite-discipline
type: change
title: 写卡被 declined 时按 reason 修正后重发确认卡（Crew/Steward），judge deny 不是客户决定
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: implemented
role: 门禁引擎
scope: 五张内置治理角色卡文本新增 declined 修正重发纪律与 judge deny 定性；不改产品判定逻辑、Section 1、预授权、禁写、能力位
events:
  - date: "2026-10-19"
    kind: implemented
    summary: Crew appointment-write / Steward schedule-write 被 declined（含自动审批 deny 原因）时必须按 reason 修正后重新发确认卡，不得绕过确认/直接 write_file/把原因当客户已同意；五卡新增「judge deny 是系统审批拒绝，不是客户决定，不写入客户决定账本」
  - date: "2026-10-19"
    kind: verified
    summary: 门禁引擎套件 284 计 / 283 过 / 0 红 / 1 skip（新增 1 例）；npm run typecheck exit 0；未提交 git
---

# 写卡被 declined 时按 reason 修正后重发确认卡

## 1. 真机问题与客户要求

真机 2026-10-19：Crew / 组队 的 `appointment-write` 写卡内容有两处不合规——

- README 归属未在提名写区表定案；
- tester 的 `boundary.yaml` 混入 Markdown 散文（边界文件只允许 `role`/`entries`/`archived`）。

判断 agent 无法自动批准，只能 manual，客户被迫手批。客户要求：判断 agent 应**拒绝并把原因退回
Crew 重做**。编排正在给 approval 组增加 `deny` 结论；桌面会把 deny 转成 `declined` + 原因回投
发起角色。

本批只在**门禁引擎**边界内补角色卡纪律（不改产品判定逻辑）：

1. Crew / 组队：`appointment-write` / `write` 被 `declined`（含自动审批 deny 的原因）时，必须按
   `reason` 修正待写内容后**重新发确认卡**；不得绕过确认、不得直接 `write_file`、不得把原因当客户
   已同意；修正后再发卡，仍被拒则继续修正/如实报告，不循环空转。
2. Steward / 统筹：写流程状态 YAML 或排程写卡被 `declined` 时同样按原因修正重发；写卡完成/角色
   枚举出现后，按流程 YAML 继续下一步，不要等客户催办。
3. 五卡统一：判断 agent 的 `deny` 是系统审批拒绝，不是客户决定，不写入客户决定账本；不得把它
   当作客户意见或同意。

## 2. 卡文本变更（`src/common/门禁引擎/governance-roles.ts`）

### Crew / 组队（`nominator`）

- 标准工作流第 4 步增补：返回 `declined` 时按 `reason` 修正内容后**重新发确认卡**，不得绕过确认
  或直接写盘。
- 「任命后写卡」段后新增「**写卡被拒（declined）时（必须）**」段：

  > `request_confirmation` 返回 `declined`（含自动审批 deny 的原因）时，必须按 `reason` 修正待写
  > 内容后**重新发确认卡**；不得绕过确认、不得直接 `write_file`、不得把原因当客户已同意。修正后
  > 再发卡；仍被拒则继续按原因修正或如实向客户报告，不循环空转、不重复提交同一份未修正的内容。

### Steward / 统筹（`convener`）

- 「确认卡约定」后新增「**写卡被拒（declined）时（必须）**」段：

  > `request_confirmation` 返回 `declined`（含自动审批 deny 的原因）时，必须按 `reason` 修正流程
  > 状态 YAML 或排程内容后**重新发确认卡**；不得绕过确认、不得直接 `write_file`、不得把原因当客户
  > 已同意。修正后再发卡；仍被拒则继续按原因修正或如实报告，不循环空转。写卡完成/角色枚举出现后，
  > 按流程 YAML 继续下一步（派发/回交/登记），不要等客户催办。

### 五卡共同

「判断代批纪律」段后新增：

> 判断 agent 的 `deny` 是系统审批拒绝（拒绝本次写盘/命令），不是客户决定，不写入客户决定账本；
> 不得把它当作客户意见或同意。

### 逐字保留

五张卡的权力/职责/Section 1/预授权/禁写/能力位、shell 审批档、工程质量基线、治理卡参数纪律、
判断代批既有句、flow YAML 契约与本批前的全部纪律逐字未改；未改任何判定逻辑。

## 3. 测试（真实输出）

- `node --test "test/门禁引擎/**/*.test.ts"`
  - **284 tests / 283 pass / 0 fail / 1 skipped**（基线 280/279/0/1；本批新增 1 例）。
  - 新增：`标准工作流：写卡被 declined——Crew/Steward 按 reason 修正后重发确认卡；judge deny 是系统审批拒绝不是客户决定`
    - Crew：declined 段关键字、appointment-write 工作流与 declined→重发确认卡的顺序、
      `按 reason 修正`、不得绕过确认/直接 `write_file`/把原因当客户已同意/空转。
    - Steward：declined 段关键字、修正流程状态 YAML 或排程内容、重发确认卡、
      写卡完成/角色枚举出现后按流程 YAML 继续下一步且不等客户催办。
    - 五卡统一：judge `deny` 是系统审批拒绝、不是客户决定、不写入客户决定账本。
  - 既有断言未放宽、未删除。
- `npm run typecheck` ⇒ **exit 0**。

## 4. 跨角色依赖（本角色边界外，未改）

1. **编排**：approval 组新增 `deny` 结论；确认卡被拒时把 `declined` + 原因回投发起角色。卡文本
   以 `request_confirmation` 返回 `declined` 为前提；若运行时字段名/结果名不同（如 `rejected`），
   须同批对齐卡文本。
2. **桌面**：把判断 agent 的 `deny` 转成 `declined` + 原因回投；不得把它记成客户决定或写入客户
   决定账本。卡文本的「不写入客户决定账本」是行为约束，机械保证在编排/桌面。
3. **判断 agent**：需要真的能对不合规写卡内容返回 `deny` 与可操作 `reason`（README 归属未定案、
   边界文件混入散文等）；卡文本只规定发起角色收到 declined 后的行为。
4. **产品判定逻辑未改**：本批不实现 deny/declined 通道，也不改 approval 组、账本或桌面回投；
   在该通道落地前，卡文本纪律是行为约束，真机仍可能 manual。

## 5. 残余风险

- `declined` 后是否真的重发确认卡由模型遵从；无机械检查「同一份未修正内容不得重复提交」。
- 空转防护只有文本纪律（不循环空转、不重复提交同一份未修正内容），没有次数上限或机械闸。
- judge `deny` 不写入客户决定账本需要编排/桌面实现；卡文本不改变账本结构。
- 真机端到端与独立复验未进行；未提交 git。

## 6. 边界与约束

仅改 `src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-standard-workflow.test.ts`、
本文件、`changelog.md`、`memo.md`。未碰 `src/common/编排/**`、`app/**`、`test/测试/**`、
`src/service/**`、其他角色文件/测试、真实项目；不读 `.env`、不跑真实模型/凭据/网络；未 commit。
