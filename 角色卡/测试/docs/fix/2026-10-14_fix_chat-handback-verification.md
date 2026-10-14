---
id: chat-handback-independent-verification
type: fix
title: 普通聊天误回交的独立验证方案与证据
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [desktop-real-project-p-limit-validation]
events:
  - date: "2026-10-14"
    kind: created
    summary: 根据已复现的桌面误回交准备独立验证范围
  - date: "2026-10-14"
    kind: verified
    summary: 客户确认后完成独立联调、全仓回归及真实桌面聊天与任务回交复测
---

# 验证目标

修复后，普通聊天未提交正式报告时只完成本轮会话，不自动生成「未报告」回交；su 派发的真实任务仍必须得到正式报告或明确的未报告/失败/中止结果。普通聊天主动调用 submit_report 时仍应回交。既有任务完成不能被后续闲聊改变。

复现及版本基线见 [原桌面测试](../change/2026-10-14_change_desktop-real-project-validation.md)。本测试上下文只修改测试角色范围，不修改产品源码。

## 独立验证范围

1. 在 `test/测试/` 追加一个跨角色契约测试：通过真实 openRoleSession 与桌面会话管理器连接，运行时外部模型替身只控制输入/输出；分别观察普通聊天、忙时排队聊天、派发任务未报告、派发正常报告和普通聊天主动报告。以真实 handback 事件、su 投递次数及任务来源/turnId 隔离作为断言，不通过人工过滤事件掩盖问题。
2. 保留失败/中止、重复终局、迟到报告与跨 runtime 隔离的既有回归；不修改别的角色测试。新增独立测试的确切接口以 PM 审核的编排公开契约为准。
3. 修复后重启真实 Electron 桌面，导入原 p-limit 副本；从测试角色发送两条「只回复收到，不提交报告」消息，确认角色正常空闲、没有新增回交卡、su 没有收到新回交。
4. 从 su 重新派发只读任务，要求测试角色使用 submit_report，确认自动开启/续接、真实执行、完成回交与 su 自动验收仍正常。进一步派发明确「只回复收到，不提交报告」的正式任务，确认 unreported 回交仍存在。
5. 在普通聊天中主动 submit_report，确认正式报告没有因入口为聊天而被吞掉。
6. 磁盘独立检查 ANS replay/native 中新增轮次和回交事件，以及 p-limit 已跟踪文件未变化；不能只信模型自述或历史卡片。记录当前候选改动、命令、输出与未测范围。

## 本角色拟修改范围

仅 `test/测试/chat-handback-integration.test.ts` 与本记录，以及测试角色已授权文档。生产修改由编排/桌面窗口属主执行。客户已确认项目管理审核的 revision 2 并明确授意相关角色实施；本轮独立验证按该版本执行。

## 当前候选与结果

编排修改 `src/common/编排/handback.ts`、`src/pipeline/orchestration/run-role.ts`，桌面窗口修改 `app/desktop/session.ts`。普通聊天没有正式报告时不生成任务回交，正式派发明确要求报告；主动报告仍回交。测试与说明同步分别由各属主完成。图片和 renderer 中旧 options 外包引用/字符串断言随来源包装做必要契约同步，保留图片原引用、调用方不可变与真实 ACK 验证，由项目管理独立复核。

独立候选身份见 [SHA-256 清单](2026-10-14-chat-handback-evidence/candidate-sha256.json)。工作区同时出现 README、app/main.ts、图标资产等其他会话的工作，本次没有修改或吸收它们；此次修复范围仅报告列明文件。

| 检查 | 当前结果 |
| --- | --- |
| 编排属主专项 | 247/247 通过，见属主[修复记录](../../../编排/docs/fix/2026-10-14_fix_chat-handback-scope.md) |
| 桌面窗口属主专项 | 72/72 通过，见[窗口记录](../../../桌面窗口/docs/fix/2026-10-14_fix_chat-handback-origin.md) |
| UI 必要调用方同步 | renderer 41/41 通过，见[UI 记录](../../../桌面UI/docs/fix/2026-10-14_fix_chat-handback-caller-test.md) |
| 独立联调 + 原 T1 | `node --test test/测试/chat-handback-integration.test.ts test/测试/t1-pipeline-integration.test.ts`：8/8 通过 |
| 全仓首次受限环境 | 1238 项，1235 通过、2 失败、1 跳过；1 项为回环 listen EPERM，另一项为 renderer 旧来源包字符串断言；[原始结果](2026-10-14-chat-handback-evidence/full-tests-sandbox.txt) |
| 同步 UI 且允许本地回环的全仓重测 | 1238 项，1237 通过、0 失败、1 既有 Windows 专属跳过；[原始结果](2026-10-14-chat-handback-evidence/full-tests-managed.txt) |
| 最终 `npm run typecheck` / `git diff --check` | 通过 |

独立联调接真实 SessionManager → openRoleSession → Runtime Core 与真实 dispatch/submit_report handler，仅外部模型替身。三种运行时分别验证直发聊天无回交、真实忙碌队列聊天无回交、正式派发缺报告产生 unreported、正式完成自动投 su、完成后的聊天不继承任务、聊天主动报告正常投 su及重复外部终局归一。旧 T1 的 aborted/unreported/completed、failed/timed_out 保持原断言并通过。

独立夹具首轮还尝试在桌面派发器制造永久 engine 抛错，并错误预期派发只执行一次，观察等待超时：现有派发器保留失败任务重试，该夹具与既有合同不符。最终将该额外错误路径交由既有 T1 和属主终局测试覆盖，新增联调聚焦本次批准的聊天/任务来源路径；未修改产品重试策略或放宽失败/中止回交断言。

## 真实桌面复测

2026-10-14，北京时间 21:18 起，通过原生 UI 退出旧 Electron 并重新 `npm run app`，系统目录选择器导入同一个 p-limit 7.3.3 副本。真实 Pi 原生上下文恢复，按以下顺序操作，没有用 CLI 或假 IPC 替代。

1. 直接给测试角色发送 CHAT-R1、CHAT-R2，只要求回复收到，不调用工具或报告。两轮实际回复、settled、回到空闲；聊天没有新增回交卡，su 一直空闲，未出现新待办。独立读盘确认测试角色 user 数从 4 增至 6，su user 数保持 10，且两个真实 turnId 各有 completed terminal。
2. 在 su 输入 TASK-R1：用 dispatch_task 派发只读 package.json 版本确认并正式 submit_report。测试角色实际读取 `name=p-limit`、`version=7.3.3`，调用 submit_report，桌面显示「回交主入口 已完成」；su 自动接到报告，显示「TASK-R1 已完成（只读验收通过）」。
3. su 派发 TASK-NOREPORT，明确要求只回复、不调用报告工具。桌面仍生成 unreported 自动回交；su 明确说明这是该缺报告探针的预期结果，不影响 TASK-R1 的已验收状态。证明没有通过一概禁回交掩盖缺报告。
4. 直接聊天给测试角色发送 CHAT-REPORT，要求主动 submit_report；真实工具调用成功，界面显示 completed 回交，su 自动收到并识别为客户主动报告，未误归到 TASK-R1。
5. 再发 CHAT-R3，只回复收到、不交报告。角色正常完成且空闲，没有新回交；su user 数最终仍为 15，新增 5 条严格对应 2 次客户派发请求和 3 次预期回交（TASK-R1 completed、TASK-NOREPORT unreported、CHAT-REPORT completed）。测试角色 user 数为 10，对应新增 6 轮：3 次普通聊天、2 次派发、1 次主动报告。没有多余普通聊天回交。

原生 read_file/submit_report 返回与新 replay 轮次独立核对；[截取的轮次与 su 输入证据](2026-10-14-chat-handback-evidence/desktop-replay-evidence.json)保留真实 turnId、时间与终局。原生 UI 两角色最终空闲。p-limit `git diff --exit-code` 通过，三个边界 pin 独立重算匹配，未改动上游已跟踪文件。

本轮没有在真实桌面主动制造运行失败/停止任务；失败、超时与中止的保留行为由当前属主与 T1 自动测试支持，不冒充真实桌面验证。真实在线桌面仅 Pi；Codex/Claude 为无网络整链替身验证。

此次缺陷修复与所要求的真实桌面聊天/正式回交复测均已完成；无提交、推送或发布动作。
