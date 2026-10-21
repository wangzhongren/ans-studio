# macOS 真机证据索引

**报告**：[2026-10-21_change_real-machine-test.md](../2026-10-21_change_real-machine-test.md)
**机器可读汇总**：[summary.json](summary.json)

| 项 | 路径 |
| --- | --- |
| 环境/候选/包哈希 | [environment.txt](environment.txt) |
| 整机 e2e | [main-e2e/report.txt](main-e2e/report.txt)、[stdout.log](main-e2e/stdout.log)、`main-e2e/*.png`（17 张） |
| 打包空项目 | [packaged/empty-project.json](packaged/empty-project.json)、`packaged/*.png`、[packaged/embedded-dist-sha256.txt](packaged/embedded-dist-sha256.txt) |
| 打包 stdio | [logs/packaged-stdout.log](logs/packaged-stdout.log) |
| 真实模型（修复后） | [model-fix/model-run.json](model-fix/model-run.json)、[model-fix/timings.txt](model-fix/timings.txt)、`model-fix/*.png` |
| MIRROR 镜像卡 | [model-fix/uiux-mirror/report.json](model-fix/uiux-mirror/report.json) |
| 真实模型（修复前对照） | [model/model-run.json](model/model-run.json)、`model/*.png` |
| 真实模型 stdio（已 sanitize） | [logs/model-dev-stdout.log](logs/model-dev-stdout.log) |
| 图标 | [icon/icon-1024.png](icon/icon-1024.png)、[icon/dock-icon-crop.png](icon/dock-icon-crop.png)、[icon/dock-screen.png](icon/dock-screen.png) |
| 只读前后 | `pre-state/`、`post-state/` 下 `new-demo-*`（打包）与 `model-demo-*`（真实模型） |
| 复跑探针 | [probes/](probes/) |

**结论**：真机链路可运行。整机 e2e 修复前/后均 `E2E_PASS=true`；打包应用（修复前包）未写项目；角色显示名修复后开发版角色树为 Draft/提案、Crew/组队、Steward/统筹，旧称不再出现，MIRROR 8/8；真实模型只读、无写盘工具/确认卡，但 app 自动写 `.ans/sessions`；空项目状态行显示“尚无治理记录…”（MIRROR 种子项目状态行 true）。打包 zip 仍是修复前构建，需重新打包才能在包内看到新称。详见报告“发现与待确认”。截图本地保留，未 commit/push。
