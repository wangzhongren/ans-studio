---
id: desktop-real-project-p-limit-validation
type: change
title: 桌面界面上的 p-limit 真实使用验证
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [real-project-p-limit-validation]
events:
  - date: "2026-10-14"
    kind: verified
    summary: 通过原生桌面操作验证导入、确认写入、派发、真实 shell 测试及自动回交
---

# 桌面真实项目验证

此次实际启动 `npm run app`，通过 macOS 原生界面操作 ANS Electron 应用：点击导入项目、系统文件夹选择器、消息输入与发送、角色切换、预览展开、确认与不同意。未用 CLI 代替桌面操作，也未注入假模型或假 IPC。文件与日志读取只用于独立核实界面产生的结果。

ANS 提交为 `dd4b615c27215913c5089c5cb7b4618905416c42`，macOS / Node v24.14.0 / npm 11.9.0，真实 Pi provider。目标是前轮保留的 p-limit 7.3.3 副本 `/private/tmp/ans-real-p-limit-20261014`，上游提交 `a8a6fbec4e0e866d6d779b10889bb4f5567e70eb`。前轮已完成角色 bootstrap 和依赖安装，因此本轮验证现有项目导入，不声称验证了桌面从零 bootstrap。前轮报告见 [CLI 验证](2026-10-14_change_real-project-p-limit-validation.md)。

## 界面操作与真实结果

| 操作 | 实际观察与独立证据 |
| --- | --- |
| 点击导入项目，在系统目录选择器选 p-limit 副本 | 项目名与绝对路径显示正确；左树显示 su、测试、维护；su 状态「空闲（已恢复）」；读取并显示前轮历史 |
| 从输入框发送治理任务 | su 状态转「工作中」，真实读取 package.json 与 index.js，确认 p-limit 7.3.3 |
| 预览新增 `docs/su/desktop-validation.md` | 内联确认卡显示路径、可展开预览、确认/不同意按钮与待确认定位入口；su 状态「等待你确认」；独立检查确认前文件不存在 |
| 点击确认 | 卡片显示「已确认」，su 恢复工作；文件实际生成，2639 字节 |
| su 调用 dispatch_task 派发静态审查 | 测试角色由「未开启」自动转「工作中」；切换角色看到来自 su 的任务、真实读文件与报告写入活动 |
| 测试角色 submit_report | `角色卡/测试/docs/change/desktop-validation.md` 实际生成，15118 字节；界面显示「回交主入口 已完成」；su 自动收到「回交投递 · 来自 测试」，读取报告并给出验收说明 |
| su 尝试额外写自身 memo/changelog | 界面出现两个 `write_file 执行失败`，目标分别为 `docs/su/memo.md` 与 `docs/su/changelog.md`；真实门禁 F4 拒绝未进入该轮 writeSet 的路径 |
| 从桌面派发实际执行 `npm test` | 测试角色真实调用 run_shell，采集 Node/npm 版本；精确命令 `npm test` 放行并执行；产物 `角色卡/测试/docs/change/desktop-npm-test.md`，8277 字节 |
| 实际测试的自动回交与 su 验收 | 测试角色显示 completed 回交；su 自动收到并读取新报告，确认真实执行结果；双方最终空闲 |
| 拒绝新增 `docs/su/desktop-declined-probe.md` | 从界面请求确认并点击「不同意」；卡片显示「已回不同意（未获同意）」；模型报告已取消；文件始终不存在 |

## 实际运行测试的独立核实

原生 Pi JSONL 中的 `run_shell` 工具结果（不是助手文字）记录：

- toolCallId：`call_00_JUSTnlTMzfjU9gNO2SIz1476`；turnId：`0ae1abca-f046-41ae-b6b5-a149e3bc6985`。
- 返回文本：`run_shell 已执行：npm test（exit 0）`，包含真实 stdout 的 `p-limit@7.3.3`、`xo && ava && tsd`、`30 tests passed`；details 为 `ok=true`、`status=completed`，durationMs=16412。
- XO：上游 TODO 注释 1 warning，无失败；AVA：30 passed；tsd：串联整体退出码 0 支持 tsd 正常完成，成功时无输出。
- 同一会话的 `node -v` 返回 v24.14.0；`npm -v` 返回 11.9.0。
- `docs/audit/shell-gate.jsonl` 有相同 toolCallId、命令 `npm test`、cwd 为项目根、`conclusion=allow`、分支 `b-allow→customer-delegated-routine-checks`。该行是执行前的门禁记录，`execution=未执行` 不能单独当成执行证据；真正执行证据来自上述 toolResult。

本轮结束后 `git diff --exit-code` 确认 p-limit 已跟踪文件未变；配置内三个 pin 独立重算仍全部匹配。未修改 ANS 产品代码或测试代码。

## 暴露的真实使用问题

**普通聊天回交容易污染验收上下文。** 测试角色完成静态审查后，操作者分别发送 Q1/Q2「只回复收到、不提交报告」探针。角色如实回复，但桌面仍各生成一份 `unreported` 自动回交，并投递给 su。su 左树真实出现「工作中 · 1 待办」「工作中 · 2 待办」。su 把这些后续聊天回执误认为原任务报告互相冲突，将先前 completed 降为未闭环，并提出重交建议。操作者澄清 Q1/Q2 是独立聊天后，su 才恢复原 completed 判定。

已确认的是上述界面、自动回交和模型判断现象；不能直接断言投递器重复投递了同一轮。两次 unreported 确实来自两个独立聊天轮次。需由属主评估普通聊天是否应触发任务回交，以及回交是否携带足够的任务关联，避免模型混淆。

su 也把先前会话的路径确认误当作当前轮仍有写权，尝试额外归档；门禁正确拒绝并在聊天中提示，未通过放宽边界掩盖问题。

## 本轮未覆盖

桌面从零创建角色及左树新增刷新、Codex/Claude 在线会话、图片发送、停止轮次、关闭再启动的原生恢复、客户消息忙碌入队撤回未进行系统验证。自动回交忙碌排队已看到真实待办徽标，但 Q1/Q2/Q3/Q4 的发送恰跨轮次结束，不能把它们当作客户消息入队的充分证据。

本轮支持的结论是：桌面现有项目导入→真实 Pi 会话→确认写入→派发→角色执行真实 npm test→submit_report→su 自动验收这一条链路成功，拒绝确认不落盘；同时记录了普通聊天自动回交干扰验收的实际问题。它不是全部桌面功能的验收结论。
