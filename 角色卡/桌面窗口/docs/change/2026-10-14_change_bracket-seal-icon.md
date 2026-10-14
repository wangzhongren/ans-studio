# README 与桌面应用换用双括号字印

客户已确认候选并明确要求同时更新 README 和桌面图标。[方案](../design/2026-10-14_design_bracket-seal-icon.md)。

## 结果

`app/main.ts` 的 `APP_ICON_PATH` 改为 `app/desktop/assets/ans-bracket-seal.png`，现有 `BrowserWindow.icon` 与 macOS ready 后的 `app.dock.setIcon` 共用它。README 顶部引用相同 PNG，并更新为暖灰/炭灰双括号字印的说明。图片为已展示候选的原样副本，1254×1254 RGBA；旧设计资源保留。

## 验证

- `npm run typecheck` 通过（与前次检查之间其他任务修复了工作区测试类型错误，本任务未修改那些代码）。
- `git diff --check` 通过，README 资源路径存在。
- macOS 真实 Electron 独立检查 `/tmp/ans-icon-smoke.cjs` 退出码 0：生产图标路径及两处接线匹配、PNG 非空且解码为1254×1254、隐藏窗口创建成功、Dock 图标设置成功。
- 本次只换资源路径与说明，未再次运行前次全量测试；未验证完整应用端到端、Windows/Linux 外观或安装包图标。

重启源码桌面应用后读取新图标。现仓库没有安装包构建配置，运行时设置不替换系统 Electron 安装文件。
