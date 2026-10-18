---
id: codex-governance-judge-change
type: change
title: P3c（Codex）：judge allowlist 改运行时核心并集 ALL_JUDGE_TOOL_NAMES＋治理 judge 三工具会话
created: "2026-10-18"
updated: "2026-10-18"
timezone: Asia/Shanghai
status: implemented-unverified
related: [judge-governance-cards-review]
---

# P3c（Codex）：治理 judge 会话接入

依据：`角色卡/项目管理/docs/design/2026-10-18_design_judge-governance-cards-review.md` §六（运行时核心契约）/§十二（P3a–P3c 适配器波次）/§十三 AC19/AC24。P1 已冻结：运行时核心导出 `ALL_JUDGE_TOOL_NAMES`（shell 与治理工具名并集，恰四只）、`GOVERNANCE_JUDGE_REPORT_TOOL`；Service 在注入 `governanceJudge` 时走 `buildGovernanceJudgeTools` 并置 `judgeMode:true`、`installedMcpServers:[]`。本适配器**只消费注入工具**（能力注入不是工具注入），`judgeMode` 复用为唯一中性标志。

## 改动（本角色边界内 2 文件 + 测试/文档；0 git 提交）

- **`src/provider/codex/session.ts`**（+~20/-9）：
  - allowlist 改消费运行时核心并集 `ALL_JUDGE_TOOL_NAMES`（`report_shell_judgement` 与 `report_governance_judgement` 都在名单内）；**不再以 shell 名单做唯一断言**，也不在适配器内维护第二份名单。
  - `assertJudgeToolSet`（`:118-141`）返回 `JudgeToolFlavor`：要求注入集**恰为两种冻结集之一**——名字恰三只、无重复、恰一只 report、全部在并集内；shell/治理混合或夹带写/编辑/shell/交互/回交/派发工具 ⇒ 工厂与 `bindRole` 装配前抛错、零引擎/零副作用（fail closed）。校验使用 `SHELL_JUDGE_TOOL_NAMES.length`（两类冻结集都恰三只）与 `GOVERNANCE_JUDGE_REPORT_TOOL`，无本地名单常量。
  - 系统提示的 report 工具名按注入集判定（`:331, :345`）：治理会话提示 `report_governance_judgement`，shell 会话仍逐字为 `report_shell_judgement`——**shell 会话文本与工具面逐字不变**。
  - 既有 judge 姿态对两类会话一致（沿用 `judgeMode`，未新增分支）：`web_search="disabled"`、`installedMcpServers` 视为空、storage 忽略（线程 ephemeral/CODEX_HOME 临时目录）、只读沙箱 `networkAccess:false`、原生审批/选择/输入 decline/cancel/空答案、原生 `mcpToolCall`/`webSearch`/`commandExecution`/`fileChange` 泄漏隔离该轮。治理 judge 结构上无写/shell/交互/回交/派发/MCP/网络工具。
  - 普通角色会话路径逐字不变（`judgeMode` 未设时不做名单校验、webSearch/storage/MCP 照旧）。
- **`test/codex-adapter/judge-mode.test.ts`**（1 行）：断言错误文案改为 `/frozen judge tool set/`（行为不变：仍拒绝夹带/缺项/多项）。
- **`test/codex-adapter/judge-governance.test.ts`**（新；6 例，离线假引擎＋内存 MCP）：
  1. 并集 allowlist 接受 shell/治理两类冻结集；夹带 `write_file`/`run_shell`、空集、缺 report、双 report、混合 report、重复名均在装配前拒绝且零引擎。
  2. 治理会话原生工具面恰 `ans_judge_list_dir`/`ans_judge_read_file`/`ans_report_governance_judgement`；写/编辑/shell/客户交互/回交/派发与 `report_shell_judgement` 均不可调用；审批/选择/输入请求照旧 decline/空答案；只读沙箱。
  3. `report_governance_judgement` 原样回调模型参数（不规范化）。
  4. 治理会话强制 web search 关、不装配已安装 MCP；原生 MCP/web search 泄漏 ⇒ 隔离该轮 failed。
  5. shell judge 会话仍恰三只 shell 工具、提示面不含治理 report（并集只放宽 allowlist，不放宽装配）。
  6. 普通模式不回归：任意注入工具照旧注册、webSearch 按 env、提示面无「只读判断会话」。
  - 环境缺 `@modelcontextprotocol/sdk@1.32.1` 时，涉及 bindRole 的用例 `t.skip` 并给出说明（沿 Pi 适配器 `piInstalled` 先例）；纯装配前校验用例不依赖 SDK。

## 验证（Windows 11 / Node v24.11.1）

- `node --test "test/codex-adapter/judge-mode.test.ts" "test/codex-adapter/judge-governance.test.ts"` ⇒ **13/13 绿**（0 skip）。
- `node --test "test/codex-adapter/**/*.test.ts"` ⇒ **68 计 / 66 过 / 1 红 / 1 skip**；唯一红＝`session.test.ts:351` Windows symlink `EPERM`（既有环境红，非本批）；skip＝POSIX-only 进程组清理用例（平台既有）。
- `npx tsc --noEmit` ⇒ 全仓 **0 错**。
- 全量 `node --test "test/**/*.test.ts"` ⇒ **2806 计 / 2784 过 / 19 红 / 3 skip**；19 红**均不在本批文件**：Windows symlink EPERM 环境红（codex/claude/pi 存储与 runtime-core tools、编排 shell-authorized-routine、测试 g4 渲染）、桌面应用 renderer/runtime-ui/markdown/dispatch-delivery 与 runtime-core shell-judge 文案等**他域在飞/预期红**；`test/codex-adapter/` 内仅上述既有 EPERM 一红。

## 未验边界与残余（如实登记）

1. 真实模型/网关未跑：治理判断质量、超时/解析属编排（P2）与验收（P6），本批只验证适配器工具面与隔离。
2. 三适配器并集一致性：本批只落 Codex；Claude/Pi 的 allowlist 仍待各自 P3a/P3b（AC24 全绿以三引擎为准）。
3. 治理 judge 会话的 `report_governance_judgement` schema/提示词由运行时核心 `describeTool` 提供，本适配器只透传；schema 变更随运行时核心，不在本角色重复维护。
4. 原生能力面残余：引擎升级若新增原生工具/网络条目，仍需按 `judgeMode` 隔离清单复核（既有残余 R17）。

## 边界声明

只写本角色 Section 1 内文件（`src/provider/codex/session.ts`、`test/codex-adapter/**`、本记录与 changelog/memo/feature-map/api-spec）；未改运行时核心/编排/桌面/UI/其他适配器文件；未读 `.env`、未跑真实模型/凭据/网络；零 git 提交。
