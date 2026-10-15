---
id: kanban-runtime-fixes-dispatch
type: change
title: kanban-live 真机测试轮暴露问题的修复优先级与提案派发
created: "2026-10-15"
status: dispatched
---

# kanban-live 真机测试轮暴露问题：修复优先级与提案派发（PM 协调记录）

来源：root 于 2026-10-15 21:13–21:57 用公开 v1.0.0 运行包在空文件夹（`~/code/vibeingcode/ans-testbed/kanban-live`）真实开发「离线中文任务看板」的全链路测试。问题原文与全部证据：`角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/problem-summary.md`、同目录 `raw/`、`shots/`、`queue-timeline.json`；真机会话逐事件记录见 kanban-live 项目 `.ans/sessions/{su,实现者,测试者}/pi/ans/replay.jsonl`。

流程约束（按工程法案与技能规则）：本轮**只派发「修复提案」**——各属主角色先出 dated 提案（问题证据、只读根因、最小改动、必需/可选拆分、测试计划、跨角色影响），不写代码；PM 评审并呈客户批准简报，**客户确认后**再派实施。

## 一、修复优先级与属主

| ID | 问题（等级） | 属主角色 | 关键证据 |
|---|---|---|---|
| F-1 | 外壳命令无执行时限：挂起命令使角色停摆（实测 583s 无自动中止），仅「停止本轮」/人工杀子进程可解（P0） | 运行时核心 | 实现者 replay 13:40:28→13:50:11（durationMs=583174）与 13:50:17→13:52:30；`raw/hung-selfcheck-413-sample.txt`；netstat 死锁取证（服务端 Recv-Q 1045579B / 客户端 Send-Q 3258B，见 problem-summary A1） |
| F-2 | 投递机整轮串行：一个角色卡住导致其他角色投递排队（实测测试者任务 13:43:19 受理、13:52:30 才投递，约 9 分钟）（P0） | 桌面窗口 | `queue-timeline.json`；`window.__ansRenderer.state` 快照（queueItemsByRole/runningByRole）；app/desktop/session.ts 注释「投递机串行链（每项目一条）」 |
| F-3 | 输出上限截断吞正式报告：测试者收尾因 stopReason=length 未发出，降级 unreported/terminal-fallback（P0） | Pi适配器 | 测试者 replay 13:34:56 settled；报告 JSON `raw/26d61e5f…json`（origin=terminal-fallback, status=unreported）；native 末条 message `stopReason: length`（thinking-only） |
| F-4 | 操作者通道不可用：实现者 `cp` 被拒「操作者通道不可用（无人值守？）」而界面开放、焦点在别的角色（P1） | 桌面窗口 | 实现者 replay 13:36:30–31 的 run_shell 拒绝事件与随后改用 write_file 的说明 |
| F-5 | su 治理笔记被 F4 拒：确认制 writeSet 收窄下，su 写自己 docs/su/ 的记录被硬拒，只能口头请求授权（P1） | 门禁引擎 | su replay 13:28:22 两条 write_file 拒绝（「路径在角色边界内，但不在任务 writeSet 内（F4）」）与 su 的如实汇报 |
| F-6 | 外壳审计未落盘：`shell 闸审计未落盘…（F6）：拒绝一切写入` 在应用日志中出现 17 次、审计缺条 17 条（P1） | 编排 | 证据目录顶层 `app-redacted.log`（17 行）；kanban-live `docs/audit/shell-gate.jsonl`（实存 53 条） |
| F-7 | run_shell 不支持管道/重定向但报错误导：`find … | sort` 报 `find: |: unknown primary or operator`（P2） | 运行时核心 | 测试者 replay 13:31+ 失败输出；su 已把「不支持管道」写进派发文本 |
| F-8 | 非零退出（grep 无匹配 exit 1）显示为「执行失败」，语义噪声（P2） | 运行时核心 | 实现者 replay 13:27:00 grep 事件（exit 1 标 failed） |
| F-9 | 上下文压缩频次观察：同一角色一轮内 threshold（375k）与 overflow（265k）连续两次压缩（观察项，先记录评估） | Pi适配器 | 测试者 replay 13:34:48（threshold）与 13:52:37–56（overflow，willRetry） |

预判影响面（供提案与评审核实）：F-1/F-7/F-8 涉及工具执行协议与结果语义，消费方含 Pi适配器（real-adapter 的 errorCode 映射）与桌面UI（工具行显示）；F-2/F-4 集中于桌面窗口的会话/投递/操作者接线，间接影响全部投递路径（回交/派发/顾客消息）；F-5 触及写门禁决策语义（全局共享判定，改动会使引用方证据失效，需评估）；F-6 影响审计留痕的完整性。

## 二、派发记录（提案轮）

已为五个属主角色各开**独立固定角色上下文**（fresh worker），任务范围＝仅准备本角色条目的修复提案并写入本角色 `docs/fix/`（或 `docs/change/`），不写代码、不改测试、不越界：

- 运行时核心：F-1、F-7、F-8
- 桌面窗口：F-2、F-4
- Pi适配器：F-3、F-9
- 门禁引擎：F-5
- 编排：F-6

各上下文的输入：本文件 + 上述证据路径 + 各自 role-card/boundary + `角色卡/项目管理/docs/project-rules.md`；交付：dated 修复提案（含必需/可选拆分与测试计划）+ 回交报告（结论/根因/涉及文件/跨边界发现）。跨边界根因一律「只读定位、回报不改」。
