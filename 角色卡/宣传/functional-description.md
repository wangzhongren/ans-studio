# 宣传 职责说明

## 职责

负责 ANS Studio 的对外表达：GitHub Pages 项目官网、下载入口、宣传文案与对外视觉一致性。把产品事实、治理模型与发布信息准确呈现给潜在用户与贡献者；不实现产品功能，不改应用源码与测试。

首轮定位（客户 2026-10-21）：官网主线是「AI Agent 的自主组织运行时（Autonomous Organization Runtime for AI Agents）」，其下以 Role-first 为组织原则——先明确业务责任与角色，再确定模块和代码归属；写权限只来自角色边界；角色边界、门禁与独立验收都是这一原则的实现。

## 输入

- 产品事实：根 `README.md`（v1.4.0，2026-10-20 发布）、`.env.example`。
- 发布事实：GitHub Release v1.4.0 与 `角色卡/测试/docs/change/2026-10-20_change_v1.4-release-verification.md`。
- 视觉素材：`角色卡/桌面UI/docs/change/2026-10-20_readme-v1.4-screenshot/desktop-intent-confirm.png`（真实桌面截图）、`app/desktop/assets/ans-bracket-seal.png`（应用图标）。
- 学术来源：RFSG 论文（DOI 10.5281/zenodo.22824700）。
- 客户指令：定位措辞与视觉方向（含 2026-10-21 追加的「自主组织运行时 / Role-first」定位）。

## 输出

- `site/`：`index.html`、`styles.css`、`app.js`、`assets/`、`robots.txt`、`sitemap.xml`、`.nojekyll`。
- `.github/workflows/pages.yml`：GitHub Pages 构建与发布工作流（本角色边界内唯一 workflow 文件）。
- 本角色文档：`feature-map.md`、`functional-description.md`、`api-spec.md`、`memo.md`，以及 `docs/design/`、`docs/feature/`、`docs/change/`、`docs/fix/` 下的记录。

## 文件位置

```text
site/
  index.html                     中文单页官网（九节：首屏 / 为什么 / 五角色 / 流程 / 门禁 / 引擎 / 下载 / 来源 / 页脚）
  styles.css                     视觉 token、账本式布局、响应式与一次性加载编排
  app.js                         滚动监听（IntersectionObserver）为左侧导航加 aria-current；内容不依赖脚本
  assets/desktop-intent-confirm.png   真实桌面截图（原图 1360×980）
  assets/ans-a-mint.png          品牌标识：薄荷绿几何 A 512×512（账本栏与页脚）
  assets/ans-a-graphite.png      石墨版几何 A 512×512（站点未引用，保留给浅色场景/未来使用）
  assets/favicon.png             石墨底薄荷绿 A 的 64px favicon
  assets/apple-touch-icon.png    180×180 触屏图标
  robots.txt / sitemap.xml / .nojekyll
.github/workflows/pages.yml      Pages 发布工作流
角色卡/宣传/                    本角色文档面
```

## 无产品代码模块

本角色没有产品代码模块：不改 `app/`、`src/`、`test/`、README、package 配置或其他角色资料；站点不导入产品代码，也不被产品导入。接口面见 [api-spec.md](api-spec.md)（not-applicable）。

## 交接与边界

- 发布/推送/部署由客户或协调方执行；仓库 Pages 设置（source 选择 GitHub Actions）同样不由本角色修改。
- 返工产物先存 `temp/宣传/` 并写 REVIEW.md，再改主交付物。
- 角色卡、边界与同步 YAML、根 `changelog.md` 由 ANS Team Formation 维护。
