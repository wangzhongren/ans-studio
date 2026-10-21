# 宣传 API 规格

```yaml
apiSpec: not-applicable
```

## 判定依据（可核验）

- 交付物 `site/` 是纯静态站点：HTML + CSS + 一个浏览器内脚本，无构建步骤、无框架、无外部 JS 依赖（仅 Google Fonts 样式表，失败时回退系统字体）。站点不导出模块、不提供共享运行时接口，也不参与产品装配。
- 唯一脚本 `site/app.js` 只做一件事：用 `IntersectionObserver` 给左侧锚点导航加 `aria-current`。它在 IIFE 内运行，异常被捕获，不影响内容显示；不暴露全局 API。
- 与产品代码没有导入/导出关系：站点不引用 `app/`、`src/`、`test/` 中的任何模块；产品也不引用站点。
- 与外部系统的接口只有部署：`.github/workflows/pages.yml` 使用 GitHub 官方 actions（`checkout@v4`、`configure-pages@v5`、`upload-pages-artifact@v3`、`deploy-pages@v4`），没有自定义接口或凭据。
- 因此不存在其他角色可装配、可调用或需共享的接口面。若未来站点数据改为脚本生成、或引入站点侧共享接口，应先更新设计记录并重新评估本文件。
