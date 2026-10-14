# 双括号字印接入

产品与 UI/UX 根据现有浅色工作台重新讨论，选用暖灰圆角底、炭灰相向括号与独立短横桥。客户已明确指示「放入readme.md 并且修改桌面图标」。

使用已生成 PNG 的原样副本 `app/desktop/assets/ans-bracket-seal.png`。修改 `app/main.ts` 的 `APP_ICON_PATH`，复用现有窗口与 macOS Dock 设置；README 引用同一资源，避免两处图片漂移。旧候选保留，不修改绘图、会话、IPC 或安装包配置。

验证资源引用、PNG 解码、真实 Electron 建窗与 Dock 设置，以及类型检查。记录见[变更记录](../change/2026-10-14_change_bracket-seal-icon.md)。
