# 需求确认卡（intent-confirm）真机 e2e 证据索引

**报告**：[2026-10-21_change_intent-confirm-card-e2e.md](../2026-10-21_change_intent-confirm-card-e2e.md)
**机器可读汇总**：[summary.json](summary.json)、[timings.txt](timings.txt)

| 项 | 路径 |
| --- | --- |
| 环境/候选/启动命令 | [environment.txt](environment.txt) |
| 驱动脚本（本角色自写） | [probes/intent-card-e2e.mjs](probes/intent-card-e2e.mjs) |
| 主证据（run2，clean project） | [model-run.json](model-run.json)、[timings.txt](timings.txt) |
| 1360×860 需求卡截图 | [intent-card-1360x860.png](intent-card-1360x860.png) |
| 960×620 需求卡截图 | [intent-card-960x620.png](intent-card-960x620.png) |
| 工作中截图 | [intent-working-1360x860.png](intent-working-1360x860.png) |
| 停止本轮后 | [intent-card-after-halt-1360x860.png](intent-card-after-halt-1360x860.png) |
| 引擎菜单（Pi 已配置） | [engine-menu-pi.png](engine-menu-pi.png) |
| 运行日志 | [logs/e2e-run.log](logs/e2e-run.log)、[logs/dev-stdout-run2.log](logs/dev-stdout-run2.log) |
| 项目前后状态 | [pre-state/](pre-state/)、[post-state/](post-state/) |
| 项目实际写入副本 | [project-state/intent-file.md](project-state/intent-file.md)、[project-state/ledger.jsonl](project-state/ledger.jsonl)、[project-state/pi-session.jsonl](project-state/pi-session.jsonl) |
| 首跑归档（run1） | [run1/](run1/)（同链路先跑一轮；960 截图下半部被 composer 遮挡，故重跑 run2 作为主证据） |

**结论**：需求确认卡在真实 Pi 流程中**弹出**。主理 Lead 先写 `docs/intents/todo-list-web.md`（预授权，无写盘卡），再以 `request_choice`（`cardKind=intent-confirm`，`flowId=todo-list-web`）发卡；卡片在 Lead 聊天 pane 内，含徽标「需求确认 · 客户」、`权力类型：需求确认`、`confirm`/`revise` 两个可见选项与「提交/取消」动作。截图后点击「停止本轮」，未回答需求卡（卡片转为 expired，未获同意）。无 console/CSP 错误；README 未变，仅 demo 内新增意图文件与 app 自动写的 `.ans` 会话/账本。

截图被 `.gitignore`（`角色卡/**/docs/**/*.png`）排除，本地保留。
