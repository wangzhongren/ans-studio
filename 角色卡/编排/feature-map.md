# 编排功能导航

本角色负责的**系统功能**导航（功能名称 / 一句话用途 / 当前状态 / 文档链接）。
每份功能的稳定说明（当前流程 + 流程图 + 演变历史）归 `docs/feature/<feature-id>.md`；**本角色各功能的稳定说明待补**（见状态列），既有历史先链 `docs/change/`、`docs/fix/` 记录。

> 注：本文件 2026-10-12 建立（此前缺失；role-card 已引用本路径）。功能文档按 `docs/feature/` 规范逐步补齐——先立导航，不建失效链接。

| 功能 | 一句话用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| ans role run（一次性角色会话） | CLI 按角色跑一轮受治理会话：解析角色/边界 → 写入前门禁 → 事件流到 `settled` | 已实现 | 功能文档待补（[受治理会话运行时](docs/change/2026-10-12_change_governed-interaction-a3-a4.md)） |
| 角色会话句柄（多轮） | 桌面聊天栏的会话式入口：`openRoleSession` 一个会话多轮 send（可带图 `opts.images` 原样透传，P0-1）、`abort?()` 停当前轮次（三态如实：不支持停止即如实说明，P0-2）、事件流持续、`dispose` 收口；桌面停止钮与图片 IPC 接线为后环 | 已实现 | 功能文档待补（[P0-1/P0-2 句柄层](docs/change/2026-10-13_change_p01-images-p02-abort-handle.md)、[会话自持目录](docs/change/2026-10-12_change_session-dir-restore-wiring.md)） |
| ans govern（治理会话） | su 的治理对话（建/改角色、创世）：CLI 与桌面收敛为同一引擎 `openGovernanceSession` | 已实现 | 功能文档待补（[确认制/删收口](docs/change/2026-10-12_change_governed-interaction-a3-a4.md)） |
| 客户确认制（写前预览确认） | 写盘前经 `request_confirmation` 预览（含具体路径）并获客户 `confirmed:true`，写集按确认发行 | 已实现 | 功能文档待补（同左；残余「内容漂移」已如实登记） |
| 自动收尾 / 重 pin | su 会话 settle 后自动重扫并更新 `.ans` pin + manifest（创世首轮 = 首次收尾） | 已实现 | 功能文档待补（同左 + [finalize 相关记录](docs/change/2026-10-12_change_governed-interaction-a3-a4.md)） |
| shell 闸（三层链：项目角色） | 命令执行前经 (c) 白名单/硬拒 → (b) su 模型审读 → (a) 客户确认；逐条留痕 | 已实现 | 功能文档待补（[开放 shell 装配](docs/change/2026-10-12_change_shell-gate-arming.md)、[审读工具化](docs/change/2026-10-12_change_shell-review-verdict-tool.md)） |
| **su 只读 shell（只读档）** | **su 的 `run_shell` 只执行 (c) 只读白名单命令；risky/review/deny 一律拒——不接 (b)/(a)、不弹框** | **已实现** | [su 只读 shell](docs/change/2026-10-12_change_su-readonly-shell.md)（稳定功能说明待补） |
| 回交（任务报告） | 角色会话 settle → 自动回交（报告优先、证据过滤、每轮至多一份、稳定去重键）投递 su 验收 | 已实现 | 功能文档待补（[回交文案](docs/change/2026-10-12_change_handback-acceptance-prompt.md)、[稳定键](docs/change/2026-10-12_change_handback-round-stable-key.md)、[交报告](docs/change/2026-10-12_change_submit-report-handback.md)） |
| su 派发任务 | su 把任务派发给项目角色（前端路由：未开自动开/忙排队/去重）；派发 ≠ 授权 | 已实现（编排侧） | 功能文档待补（[派发接线](docs/change/2026-10-12_change_su-dispatch-wiring.md)、[派发回执](docs/change/2026-10-12_change_dispatch-receipt-queue.md)） |
| 交互工具 CLI 通道 | CLI 端的客户确认/操作者确认通道（stdin 问答；EOF/未识别一律 fail-closed） | 已实现 | 功能文档待补（[客户确认不设超时](docs/change/2026-10-12_change_customer-input-no-timeout.md)） |
| 会话自持目录（重启恢复） | 会话数据落 `<projectRoot>/.ans/sessions/<roleId>/`（目录创建归适配器） | 已实现（编排侧） | 功能文档待补（[session-dir 接线](docs/change/2026-10-12_change_session-dir-restore-wiring.md)） |

## 说明

- 功能点 = 用户或外部系统能触发并得到结果的行为；本角色不自编项目管理/测试等功能。
- 跨角色事项（Pi 适配器、门禁引擎、桌面应用）不在本导航重复，按各自角色文档链接。
- 每份 `docs/feature/<feature-id>.md` 补齐时，在本表对应行更新链接。
