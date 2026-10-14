# 桌面应用换用「悬桥 A」

客户明确要求将已选的新图用于桌面应用。方案见[接入设计](../design/2026-10-14_design_suspended-bridge-icon.md)。

## 实际改动

`app/main.ts` 新增相对模块目录解析的 `APP_ICON_PATH`，`createWindow()` 用它设置 `BrowserWindow.icon`；macOS 在应用 ready 后用相同路径设置 Dock 图标。首次建窗与关窗重开共用设置。

资源保存为 `app/desktop/assets/ans-suspended-bridge-a.png`，是 README 所用概念图片的原样副本。本次未改变绘图内容、IPC 或会话逻辑，也未修改 Electron 安装包。

## 验证证据

- macOS 真实 Electron 独立检查（临时脚本 `/tmp/ans-icon-smoke.cjs`）：读取生产图标路径与接线，PNG 解码为 1254×1254，创建隐藏窗口成功，`app.dock.setIcon` 调用成功，退出码 0。沙箱内首次启动 SIGABRT；获准运行后完成检查。未宣称完整应用端到端或 Dock 外观截图验证通过。
- `git diff --check` 通过。
- 全量测试：1238 项，1232 通过、5 失败、1 跳过；日志 `/tmp/ans-icon-tests.log`。失败涉及本地监听 EPERM、图片接线断言、Pi/Codex/Claude 回交集成超时，不涉及图标代码。工作区有并行任务改动，未修改这些失败对应的代码。
- `npm run typecheck` 未通过：图片测试缺 `RoleSessionSendOptions`、回交测试监听回调与 `OrchestrationEvent.handback` 类型错误。本次 `app/main.ts` 没有类型报错。
- 获准监听回环后单独复跑 `test/pi-adapter/real-adapter.timeout.test.ts`：1/1 通过；初次沙箱失败记录保留，全量测试未宣称全过。

## 后续设计反馈

客户认为悬桥 A 与整体风格不搭。产品与 UI/UX 重新核对 `app/renderer/styles.css`、现行 v2 规范与实际界面截图，推荐暖灰底、炭灰主体的「双括号字印」。以内建 imagegen 生成新的透明 PNG 候选，保存到 `app/desktop/assets/ans-bracket-seal-concept.png`，本轮先展示候选，尚未接入。

生成约束：暖灰 `#F4F4F2` 圆角 tile，外部透明；炭灰 `#242624` 两个相向短臂括号及一条独立短横桥；整体近方形、留白宽；无 A/ANS 文字、深蓝青绿、渐变、投影或立体。候选外沿仍需精修，小尺寸识别未验收。

## 使用与范围

重启 `npm run app` 后应用读取新图标。当前为源码启动配置；以后若增加安装包构建，需要另行配置打包图标。Windows/Linux 未实机验证。
