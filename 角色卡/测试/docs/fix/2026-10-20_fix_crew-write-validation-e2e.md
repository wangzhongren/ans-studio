---
id: crew-write-validation-e2e
type: fix
title: Crew 写卡确定性门控 E2E（测试角色）
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: verified
related: [crew-write-validation, appointment-write, convener-dispatch]
events:
  - date: "2026-10-20"
    kind: verified
    summary: 为 appointment-write 写角色卡/边界的确定性门控补 7 条 E2E：正常写卡 Convener 恰一次；缺 role-card/缺 boundary/空 role-card/boundary 混 Markdown/role 与目录不一致 5 种失败均不派 Convener、Crew 收到具体路径/错误、0 客户卡、重复 settle 不刷屏；Crew 修正后重新写卡通过并继续派 Convener 恰一次。test/测试 795/795、全仓 3319/3317/0/2、typecheck 0。
---

# Crew 写卡确定性门控 E2E

## 结论

- 新增 `test/测试/governance-e2e-auto/l-crew-write-validation.test.ts`：**7/7**。
- `node --test "test/测试/**/*.test.ts"`：**795/795，17s**。
- 全仓 `node --test "test/**/*.test.ts"`：**3319 计 / 3317 过 / 0 红 / 2 skip，32s**。
- `npm run typecheck`：**exit 0**（运行期间 `app/desktop/interface.ts` 哈希稳定：`1f04b69e…`）。
- 未改产品源码、未改其他角色测试。

## 门控语义（产品实现，只读消费）

`app/desktop/interface.ts::validateAppointmentArtifacts` / `reportAppointmentArtifactIssues`：

- `role-card.md`：存在、可读、非空、至少一个 Markdown 标题（`/^#{1,6}\s/m`）；
- `boundary.yaml`：存在、可读、非空；`validateBoundaryYamlText`（与运行时同一实现）通过；`entries` 非空；
  顶层 `role` 与目录 id 一致；
- 任一问题 ⇒ **不派 Convener、不把 appointment 步骤标 done、不弹客户卡**；
  向 Crew/Nominator 后台投递逐文件修正任务（`- <path>：<issue>` + 要求重发 appointment-write 卡），
  并给 Lead 一条 delivery-note 系统行；
- 去重：`projectRoot\0flowId` → 问题哈希，同问题重复 settle 不再反馈；通过后清除，回归可再报；
- 修正后重新写卡并 settle ⇒ 重新校验，通过则继续派 Convener（共享运行期/账本去重，恰一次）。

## 用例设计

前置（每个用例独立临时根）：trio 项目 + `docs/flows/flow-a.yaml` + 提案接受 + **账本 appointment
决定 `targetRoleIds=["executor"]`** + 意图确认。打开 Nominator 并发一条写卡指令；Crew 的首轮
`onPrompt` 直接写盘（正常/坏卡），turn settle 触发应用的写卡后检查。

> 写盘用直接文件写入模拟 Crew 产物：`write_file` 的写前格式校验会拒绝非法 boundary YAML，
> 而应用门控必须能拦住**任何来源**的坏文件（shell/旧文件/并发写）。正常路径与既有
> `c-appointment-timing` 的 appointment-write 真实确认卡路径并存。

| 用例 | 断言 |
| --- | --- |
| 正常写卡（role-card 有 `#` 标题 + boundary 合法、role/entries 正确） | 0 修正任务；Convener 恰 1 条任务；账本 app→convener `dispatch.accepted` 恰 1；0 客户卡 |
| 缺 `role-card.md`（boundary 合法） | 修正任务含 `角色卡/executor/role-card.md：文件不存在`；Convener 0；0 客户卡 |
| 缺 `boundary.yaml`（role-card 合法） | 修正任务含 `角色卡/executor/boundary.yaml：文件不存在`；Convener 0；0 客户卡 |
| 空 role-card（内容仅空白） | 修正任务含 `role-card.md：文件为空`；Convener 0；0 客户卡 |
| boundary 混入 Markdown（代码围栏包 YAML） | 修正任务含 `boundary.yaml：边界 YAML 解析失败`；Convener 0；0 客户卡 |
| role 与目录不一致（`role: other`） | 修正任务含 `顶层 role 与目录 id 不一致`；Convener 0；0 客户卡 |
| 5 种失败后重复 settle | 修正任务仍恰 1 条、Lead 系统行恰 1 条、Convener 仍 0（问题哈希去重，不刷屏） |
| Crew 修正（补写合法 role-card）后重新写卡 | 修正任务恰 1 条；随后 Convener 恰 1 条、账本恰 1 条、不再重复反馈；0 客户卡 |

修正任务/系统行匹配使用稳定片段 `/写卡产物未通过/`（任务文案为「写卡产物未通过**确定性**校验」，
系统行为「写卡产物未通过校验」）。

## 改动与纪律

- 新增：`test/测试/governance-e2e-auto/l-crew-write-validation.test.ts`
- 角色记录：`changelog.md` + 本文件。
- 未由本角色 git 提交；未读 `.env`；未打印凭据；未改产品源码；未改其他角色测试。
