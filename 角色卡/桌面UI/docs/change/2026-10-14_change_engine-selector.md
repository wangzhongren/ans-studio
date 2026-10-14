---
id: desktop-engine-selector-v1
type: change
title: 会话头引擎选择器统一浅色列表与键盘行为
created: "2026-10-14"
updated: "2026-10-14"
status: implemented-unverified
revision: 1
---

# 在会话头用浅色列表选择引擎

客户已确认[UIUX v1](../../../UIUX设计师/docs/design/2026-10-14_design_engine-selector.md)和[PM 审核](../../../项目管理/docs/design/2026-10-14_design_engine-selector-review.md)并授意实施。本侧以已通过的[配置缺项入口修复](../fix/2026-10-14_fix_runtime-missing-config-entry.md)为基线，实现[桌面引擎选择](../feature/runtime-choice.md)的控件变化。

之前点击会话头原生 select 会出现系统深色菜单与蓝色选中，展开样式无法跟随工作台。现在触发器为104×28px，弹层为160px浅色三项列表，当前项保持浅 olivegray 底与勾，键盘/鼠标临时项仅改变灰色活动底。没有原型工具栏、模拟缺项或成功连通标识进入正式界面。

## 实际实现

- `index.html` 的 `runtime-select` 改为单焦点 combobox button，`runtime-options` listbox 挂在 body，避免抽屉/聊天区域 overflow 裁断；名称与当前值全文可获得，装饰箭头/勾 aria-hidden。
- 新 `engine-selector.js::create` 管理 selected/active、打开/取消、焦点与 aria 状态。↑↓/Home/End 只浏览；Enter/Space/选项点击提交一次；确认当前项只关闭。Escape 回触发器，Tab/Shift+Tab 不阻止浏览器默认移动，外点不抢焦点，窗口/触发器失焦关闭。菜单 resize/scroll 时定位，空间不足上翻或限高，活动项自动滚入可见。
- `renderer.js` 只把提交接至原 `selectRuntime`，程序化恢复/选择及 updateControls 同步控件，applyListing 关层。未导入 native disabled 与 aria-disabled 禁止打开，空文件夹导入成功也启用。缺项依原 missingKeys/设置入口更新，不改配置校验、IPC、主进程、后台任务或发送政策。
- `styles.css` 实现 v1 令牌、尺寸、单焦点环、ellipsis/title 与弹层状态。

## 验证与限度

`node --test test/桌面应用/renderer.test.ts test/桌面应用/runtime-ui.test.ts` **51/51 pass**（Node v24.14.0）。保留前轮图片/回交/导入断言，仅将真实选项检查从 native value 改为 data-runtime、停止按钮守卫精确排除唯一已批准 combobox，并允许 applyListing 关层记录；新增菜单定位的下开/上翻/限高/夹视口测试。`npm run typecheck` exit 0、限定 `git diff --check` exit 0。

实际 Electron 44.7.0 / Node 24.21.0 使用原 preload 与受控 IPC：`ANS_SELECTOR_UI_ONLY=1 ANS_UIUX_OUTDIR=/private/tmp/ans-selector-ui-v1 node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs` **SELECTOR_UI_PASS 25**，exit 0。涵盖未导入禁开、空项目解锁、浏览不提交、Space/点击一次提交、同项无查询、Escape/Tab/真实Shift+Tab焦点、外点/失焦、鼠标临时项、程序化同步、两档尺寸、长名全文与截断、极矮上翻/限高/滚动以及配置入口。外点/窗口blur分支使用真实renderer DOM事件，键盘提交、Escape、Tab与Shift+Tab使用 Electron sendInputEvent；不冒称每项均为人工硬件交互。

当前产品同一候选复跑 `ANS_CONFIG_UI_ONLY=1` **20/20**、`ANS_RUNTIME_UI_ONLY=1` **16项**，exit 0，原配置失败/保存/迟到响应、机密草稿、后台/历史/确认隔离断言保留。最初单元停止入口守卫笼统禁止聊天头任何button，与批准的combobox冲突；已精确允许该唯一控件，仍禁止停止/结束会话等其它头部按钮。没有删掉业务验证。选择器产品在25项首次通过后冻结，后续只将Shift+Tab测试从DOM取消升级为真实 Electron 键盘事件，最终25项仍通过。

原始证据：[选择器25项](2026-10-14-engine-selector-evidence/selector-report.json)、[配置20项](2026-10-14-engine-selector-evidence/config-regression-report.json)、[多引擎16项](2026-10-14-engine-selector-evidence/runtime-regression-report.json)、[单元输出](2026-10-14-engine-selector-evidence/unit-tests.txt)、[最终候选哈希](2026-10-14-engine-selector-evidence/manifest.txt)、[960展开截图](2026-10-14-engine-selector-evidence/selector-960-open.png)、[1360展开截图](2026-10-14-engine-selector-evidence/selector-1360-open.png)。已查看960截图，尺寸/浅色/临时项与当前勾分离符合v1；临时覆盖部分缺项条属正常展开行为，关闭后设置入口仍可用。

这些结果验证实际renderer与离线IPC，不表示在线模型或屏幕阅读器软件通过。独立真实主进程、人工选择/键盘/禁用/缺项入口及AX检查由root测试角色记录于[独立验证](../../../测试/docs/fix/2026-10-14_fix_engine-selector-verification.md)。本侧未写 `.env`、Window/Model/registry、前轮回交源码或他角色文档，未派生。
