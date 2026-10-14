# 桌面应用「悬桥 A」图标接入

客户已选用产品与 UI/UX 联合设计的「悬桥 A」，并明确要求将桌面应用图标换成这张新图。

## 范围与行为

- `app/desktop/assets/ans-suspended-bridge-a.png` 保存已选图片的原样副本。
- `app/main.ts` 从自身目录定位图片，不依赖启动时的工作目录；首次建窗与 macOS 重开窗口使用同一路径。
- `BrowserWindow.icon` 设置窗口图标；macOS 在 `app.whenReady()` 后调用 `app.dock.setIcon` 设置运行中 Dock 图标。
- 当前仓库通过 `npm run app` 启动 Electron，没有安装包构建配置。本次设置运行时图标，不修改系统 Electron 安装文件。

## 验证

检查资源可解码，在真实 Electron 中验证窗口创建与 macOS Dock 设置，再运行仓库既有测试与类型检查。结果见对应变更记录。
