---
id: govern-target-strict-card-fixture-20261022
type: change
title: 治理卡严格口径下的 ans govern 目标目录测试夹具适配（补 flowId/cardKind）
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: verified
related: [invalid-governance-card-guard]
events:
  - date: "2026-10-22"
    kind: created
    summary: 记录按无效治理卡守卫 N1–N5 严格口径适配 test/装配/govern-target.test.ts 的夹具：request_confirmation 补 flowId=cardKind，并加强到达客户通道的合法卡断言
  - date: "2026-10-22"
    kind: verified
    summary: 目标测试 11/11 通过、npm run typecheck 0 错；全量测试与独立验收未运行
---

# 治理卡严格口径下的 `ans govern` 目标目录测试夹具适配

## 这次改了什么

只改本角色测试 [`test/装配/govern-target.test.ts`](../../../../test/装配/govern-target.test.ts) 的「`ans govern <空目录>`（经 `governCommand` + 假适配器）」用例：

- 脚本里的 `request_confirmation` 参数从 `title`/`preview` 两项，补为同时携带 `flowId: "demo"` 与 `cardKind: "write"`。`flowId` 匹配 `^[a-z0-9][a-z0-9-]{1,63}$`；`cardKind` 在此用例的 trio 治理角色（rapporteur / Draft·提案）合法集内。`preview`（逐路径正文）原样保留。
- 放行桩改为同时记录 `CustomerInputRequest` 与 `CustomerInputMetadata`；新增断言：到达客户通道的确认请求带 `flowId="demo"`、`cardKind="write"`，且编排已据此计算 `judgeContext`（`judgeContext.flowId="demo"`）。
- 用例标题与文件头覆盖说明同步写明「合法治理卡（flowId+cardKind）」。
- 原有断言全部保留：确认通道恰被请求一次、提案文件落盘且内容逐字正确、stderr 无边界/模型/目录错误、无凭据环境下不凭空写 `.ans/project.json`。没有删除确认覆盖，也没有放宽任何断言。

## 为什么改：预期中的夹具适配，不是产品缺陷

[无效治理确认卡守卫设计](../../../项目管理/docs/design/2026-10-22_design_invalid-governance-card-guard.md)（status: accepted，客户 2026-10-22 确认按 N1–N5 严格口径实施）要求：五个内置治理角色的 `request_confirmation` 必须同时携带 `flowId` + `cardKind`；缺失时编排在**触达客户通道之前**拒绝，不生成客户卡、不计算 `judgeContext`、不写账本。

本用例模拟的正是 trio 项目的 rapporteur 治理角色，而原脚本只传 `title`/`preview`。全量基线中该用例因此失败（`confirmRequests.length` 为 `0`，断言 `0 !== 1`）——这是新守卫按设计正确拒绝了无效卡，属预期的测试夹具适配。

| 场景 | 改前（夹具缺字段） | 改后（合法治理卡） |
| --- | --- | --- |
| rapporteur 发 `request_confirmation` | 缺 `flowId`/`cardKind` ⇒ 编排拒绝，确认通道 0 次，用例红 | 字段齐备 ⇒ 到达客户通道 1 次，放行桩同意，提案落盘 |
| `judgeContext` | 不计算（判断链不启动） | 计算并随 metadata 传给客户通道，`flowId` 与卡片一致 |

## 范围与不改动

- 不改产品代码；不改 `src/pipeline/orchestration/run-role.ts`（守卫实现属编排角色）。
- 不改其他角色测试/文档；不修 Windows symlink EPERM 等基线红。
- 只影响本角色 `test/装配/` 测试夹具，产品行为不变（守卫行为本身是上游已批准设计的有意变更）。

## 验证

实际执行的命令与结果（Node v24.22.1，Windows 11，工作树含其他角色未提交改动）：

- `node --test --test-timeout=120000 test/装配/govern-target.test.ts` → **11 tests / 11 pass / 0 fail**。会话日志显示 `request_confirmation` 获客户确认、`write_file` 落盘 `docs/proposals/demo-v1.md`（9 字节），用例绿。
- `npm run typecheck` → **0 错**（`tsc --noEmit` 无输出，退出 0）。

## 未验证

- 未跑全量测试（`node --test "test/**/*.test.ts"`）；未做独立验收。
- 未跑真实模型端到端（本用例用假适配器；真实凭据/网络未触碰）。
- 未 git 提交；未重启应用；未触碰 todo-demo。

相关功能：[CLI 选择受治理运行时](../feature/cli-runtime-assembly.md)。本记录是测试夹具适配，未改变该功能的产品流程。
