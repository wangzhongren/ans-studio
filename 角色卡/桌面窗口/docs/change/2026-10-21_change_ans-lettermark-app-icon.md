# 桌面应用图标换用黑底绿字 ANS 字标版

客户要求把应用图标换成 ANS 字标版本（「需要 ans 的那个」），实施中改口径为**黑底绿字**（深石墨底 + 薄荷绿 ANS）。本批只换窗口/Dock 运行时图标资源与 `app/main.ts` 接线；安装包配置未动（见「待装配」），未运行打包。

## 源与合成

| 项 | 事实 |
| --- | --- |
| 源字标 | `app/desktop/assets/ans-lettermark-mint.png`（薄荷绿 ANS 字标，透明底，1024×1024，SHA-256 `de248877aeefdd670d27a0212790950b5da6033dea0e42ecdc4ca36087396885`），原样保留未动 |
| 底 | `#14171A`（与 app 界面 `--bg` 同值）圆角方形，`border-radius: 225px`，圆角外透明 |
| 合成方式 | /tmp 临时 HTML（不落仓库）：body 透明 margin 0；内层 1024×1024 `#14171A` 圆角方块，flex 居中；img 指向源字标绝对路径、宽 780px。本机 Chrome headless 一次性截图 |
| 渲染命令 | `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars --window-size=1024,1024 --default-background-color=00000000 --screenshot=/tmp/ans-icon.png file:///tmp/ans-icon.html` |
| 产物 | `app/desktop/assets/ans-studio-ans-icon.png`，1024×1024 RGBA（hasAlpha yes），55057 字节，SHA-256 `ff88e313c9c6a41fa94f5e34b9e1798169ea7ffece2404e5c9fc6474f788d32c` |

实施中途曾按旧口径（白底 + 石墨字标）出过一版，**未作为最终产物入库**，仅存 /tmp。

## 尺寸决策

源字标 1024 画布内墨迹实测 864×233（占画布宽 84.4%），居中于 (511.5, 511.5)。若按参考 HTML 的 img 宽 700px 直接缩放，成品墨迹只得 57.7%（低于要求的 62–70%）；故 img 宽取 780px，成品墨迹实测 656×176、中心 (511.5, 511.5)、占图标宽 64.1%，落在 62–70% 区间中部。

## 接线

`app/main.ts` 的 `APP_ICON_PATH` 由 `ans-bracket-seal.png` 改为 `ans-studio-ans-icon.png`；现有 `BrowserWindow.icon` 与 macOS ready 后的 `app.dock.setIcon` 共用它。未改 preload、IPC、渲染器与打包配置。

## 验证

- sips：`pixelWidth 1024`、`pixelHeight 1024`、`hasAlpha yes`。
- 像素核验（Chrome canvas 读回成品）：四角 (0,0)/(1023,0)/(0,1023)/(1023,1023) alpha=0；四边中点 (512,0)/(0,512)/(512,1023)/(1023,512) 均为 `#14171A`（20,23,26,255）；(512,512) 为薄荷绿墨迹（199,233,192）；墨迹均值（197,230,190）、bbox 656×176、中心 511.5/511.5、占宽 64.1%，无裁切；抽样不透明非墨迹像素全部精确等于 `#14171A`。
- Read 目视（成品透明 PNG）：深石墨底圆角方形、圆角外透明可见、薄荷绿 ANS 居中清晰、无裁切。
- `npm run typecheck` 0 错。
- 未运行打包；真实 Electron 窗口/Dock 未在本批复验（资源路径与既有接线同构，沿用 2026-10-14 双括号字印的独立检查结论）。

## 待装配（交后续装配上下文）

- `electron-builder.yml` 的 `mac.icon` 与 `win.icon`（第 21/27 行）仍指 `app/desktop/assets/ans-bracket-seal.png`，需改指 `app/desktop/assets/ans-studio-ans-icon.png` 后重新打包并走既有 verify。
- 旧图标 `ans-bracket-seal.png` 及其候选保留未删，供宣传/回落引用。
