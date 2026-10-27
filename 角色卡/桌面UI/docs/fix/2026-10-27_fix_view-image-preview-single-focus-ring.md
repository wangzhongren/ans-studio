---
id: desktop-ui-fix-view-image-preview-single-focus-ring
type: fix
title: view_image 缩略图选中态只保留一层绿色焦点指示
created: "2026-10-27"
updated: "2026-10-27"
timezone: Asia/Shanghai
status: implemented-unverified
related: [desktop-ui-view-image-row-preview]
events:
  - date: "2026-10-27"
    kind: created
    summary: 客户反馈缩略图选中出现两层绿色框；focus-visible 焦点环改为唯一绿色指示，悬停边框高亮仅在未聚焦时生效；补 CSS 守卫测试并重建 renderer dist
---

# view_image 缩略图选中态只保留一层绿色焦点指示

**客户反馈**（2026-10-27，原话）：「这个选中多了一层绿色的框」；随后明确「不是这个，我说的是图片」——指聊天流 `view_image` 缩略图被键盘聚焦/选中时出现两层绿色框。相关功能见[view_image 独立工具行与缩略图预览](../change/2026-10-27_change_view-image-row-preview.md)。

## 根因

`app/renderer/src/shell/shell.css` 两条规则在同一 `:focus-visible` 状态叠加：

1. `.view-image-preview-trigger:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }` —— 触发按钮的绿色焦点环；
2. `.view-image-preview-trigger:hover img.view-image-preview, .view-image-preview-trigger:focus-visible img.view-image-preview { border-color: var(--primary); }` —— 聚焦时又把图片 1px 边框染成同一绿色系。

焦点环与染绿边框贴在一起，视觉上就是「多了一层绿框」。运行中实测（主上下文只读探针）：按钮 `:focus-visible` 时 computed outline 为 `rgb(111,160,139) solid 2px`，同时 `img.view-image-preview` 的边框变为同一绿色。鼠标点击/悬停不触发 `:focus-visible` 时只有边框一层，所以问题只在键盘聚焦路径出现。

## 方案（只改 CSS，不改行为/布局）

- **键盘聚焦**：保留 `.view-image-preview-trigger:focus-visible` 的 2px `--ring` 焦点环（贴合图片、offset 2px），键盘可达性与既有 UIUX 焦点规范不变；
- **悬停反馈**：保留图片 1px 边框 `--primary` 高亮，但限定为 `.view-image-preview-trigger:hover:not(:focus-visible) img.view-image-preview`——已键盘聚焦时不再叠加边框色；
- **聚焦且悬停**：最多只有焦点环一层绿色；
- 未改放大层（lightbox）、缩略图布局/尺寸、图片默认 `--border` 边框，也未改 `index.css:232` 的全局 `:focus-visible` 规范。

## 测试

`test/桌面UI/view-image-preview.test.ts` 新增守卫测试「CSS：缩略图聚焦/悬停最多一层绿色指示」：焦点环规则必须存在；悬停规则必须带 `:not(:focus-visible)`；源码不得再出现 `:focus-visible img.view-image-preview` 染绿规则。

## 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 相关单测 | `node --test "test/桌面UI/view-image-preview.test.ts" "test/桌面UI/view-image-lightbox.test.ts"` | **22/22 pass** |
| 桌面UI 套件 | `node --test "test/桌面UI/**/*.test.ts"` | **319/319 pass / 0 fail**（原 318 + 新增 1） |
| 渲染层 typecheck | `npm run typecheck:renderer` | **exit 0** |
| 根 typecheck | `npm run typecheck` | **exit 0** |
| 渲染器构建 | `npm run build:renderer`（Vite） | **成功**，2681 modules；`dist/assets/index-Ci6XSQXP.css` 含 `:hover:not(:focus-visible)` 规则、旧 `:focus-visible img.view-image-preview` 规则 0 处；`dist/index.html` 引用新 hash `index-BF8HgfwN.js` / `index-Ci6XSQXP.css` |

## 运行中的应用如何看到

运行中的 Electron 实例仍是旧 `dist`，按任务要求未重启/未关闭。需由主上下文用新 `app/renderer/dist/` 受控重载（窗口内 Ctrl+R 或重新打开/重启应用）后核验；重载前看到的仍是旧的两层绿框。

## 残余

- 未做真实 Electron 视觉截图核验（应用未重载）；CSS 方案已由源码守卫测试与构建产物双重核验。
- 未 commit/push。
