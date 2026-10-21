# 修复后构建真机复核证据索引（34484f3）

**报告**：[2026-10-21_change_fixed-build-real-machine.md](../2026-10-21_change_fixed-build-real-machine.md)
**机器可读汇总**：[summary.json](summary.json)、[timings.txt](timings.txt)

| 项 | 路径 |
| --- | --- |
| 环境 / 构建 / 启动命令 | [environment.txt](environment.txt) |
| 修复提交 | `34484f32327975552c0c9899c101285a09e71370` |
| 新 dist | HTML `f779ac60…`（CDP 载入原文一致）、JS `index-CFjc0h-3.js`、CSS `index-BYYh-X8f.css`、图标 `ans-studio-ans-icon-DOpmqMAU.png` |
| 需求卡驱动（本角色自写） | [probes/fixed-intent-card.mjs](probes/fixed-intent-card.mjs) |
| Genesis 回放驱动（本角色自写） | [probes/genesis-replay.mjs](probes/genesis-replay.mjs) |
| 需求卡运行 JSON / 计时 | [model-run.json](model-run.json)、[timings.txt](timings.txt) |
| 角色名 + 品牌截图 1360/960 | [brand-roles-1360x860.png](brand-roles-1360x860.png)、[brand-roles-960x620.png](brand-roles-960x620.png) |
| 需求卡截图 1360/960 | [intent-card-1360x860.png](intent-card-1360x860.png)、[intent-card-960x620.png](intent-card-960x620.png) |
| 停止本轮后 | [intent-card-after-halt-1360x860.png](intent-card-after-halt-1360x860.png) |
| 引擎菜单（Pi 已配置） | [engine-menu-pi.png](engine-menu-pi.png) |
| Genesis 回放 JSON | [genesis-run.json](genesis-run.json) |
| convener 派发行 1360/960 | [convener-dispatch-1360x860.png](convener-dispatch-1360x860.png)、[convener-dispatch-960x620.png](convener-dispatch-960x620.png) |
| todo-app-dev 派发行 1360/960 | [todo-app-dev-dispatch-1360x860.png](todo-app-dev-dispatch-1360x860.png)、[todo-app-dev-dispatch-960x620.png](todo-app-dev-dispatch-960x620.png) |
| Genesis 角色树 1360/960 | [genesis-tree-1360x860.png](genesis-tree-1360x860.png)、[genesis-tree-960x620.png](genesis-tree-960x620.png) |
| 运行日志 | [logs/intent-run.log](logs/intent-run.log)、[logs/genesis-run.log](logs/genesis-run.log)、[logs/dev-stdout.log](logs/dev-stdout.log) |
| demo 项目前后 | [pre-state/](pre-state/)、[post-state/](post-state/)、[project-state/](project-state/) |
| genesis 前后（61 文件哈希） | [genesis-pre/](genesis-pre/)、[genesis-post/files-restored.sha256](genesis-post/files-restored.sha256) |
| genesis 自动恢复写入副本 | [genesis-post/changed/](genesis-post/changed/)（恢复前副本；原字节已按前缀哈希截断恢复） |

**结论**：修复后构建加载正确（CDP HTML 哈希 `f779ac60…` 一致）。真实 Pi 流程中需求确认卡弹出，徽标/权力类型/confirm-revise/锚定均通过；角色树为 `Draft / 提案`、`Crew / 组队`、`Steward / 统筹`；标题栏与左栏为 `img[alt=ANS]`（20px/30px 黑底绿 ANS 图标），无文字 mark；零 console/CSP。Genesis 回放派发去重通过：convener 4 条（原始 8 个投影）、todo-app-dev 5 条（原始 10 个投影），无重复、不同 stepId 各保留一次。**风险发现**：加载 genesis 项目会自动恢复 verifier 待办并启动真实模型回合、写入 verifier 会话文件；已停止并按原哈希截断恢复，61 个文件与事前完全一致。

截图被 `.gitignore`（`角色卡/**/docs/**/*.png`）排除，本地保留。
