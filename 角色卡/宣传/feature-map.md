# 宣传功能导航

本角色负责的**对外交付面**导航（名称 / 一句话用途 / 当前状态 / 文档）。本角色不拥有产品系统功能：官网是静态站点，不导出软件能力；功能点归属不等于文件修改权限，写入仍以 [boundary.md](boundary.md) Section 1 为准。

首轮定位（客户 2026-10-21）：ANS Studio 是「AI Agent 的自主组织运行时（Autonomous Organization Runtime for AI Agents）」，组织原则是 Role-first。

| 交付面 | 一句话用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| 项目官网（中文站 `/`） | 中文官网，讲清定位、五角色、流程、门禁、引擎、下载与学术来源 | 已部署：<https://wangzhongren.github.io/ans-studio/>（2026-10-21，协调方提交 `f87eb134` 并发布） | [当前说明](docs/feature/project-site.md) |
| 英文官网（`/en/`） | 与中文页同结构的英文单页；共享样式、脚本与素材，双向语言切换、hreflang 与双语 sitemap | 已部署：<https://wangzhongren.github.io/ans-studio/en/>（2026-10-21，协调方提交 `b00bc74` 并发布） | [当前说明](docs/feature/project-site.md#双语与语言切换)、[变更记录](docs/change/2026-10-21_change_english-site.md)、[证据](docs/change/2026-10-21_english-site-evidence/) |
| 官网视觉与信息架构 | 石墨账本式布局、Role-first 印章、真实截图、内容事实映射与验收口径 | 已定稿（随首轮实现） | [设计记录](docs/design/2026-10-21_design_project-site.md) |
| Pages 发布工作流 | push main 的 `site/**` 变更时构建并部署 GitHub Pages，支持手动触发 | 已创建并成功运行（run `39541758607`，success，19 秒；由 push 触发） | [部署流程](docs/feature/project-site.md#部署流程) |
| 品牌图标与 favicon | ANS STUDIO 字标（桌面完整、移动紧凑 ANS）、字标 A 的 favicon/apple-touch-icon；Role-first 印章与截图四角括号保持不变 | 已实现，本地验证通过；未推送、未部署（线上仍为几何 A 版） | [字标变更记录](docs/change/2026-10-21_change_lettermark-logo.md)、[证据](docs/change/2026-10-21_lettermark-evidence/)、[上一版几何 A](docs/change/2026-10-21_change_logo-assets.md) |
| 首轮交付与验证证据 | 文件清单、定位更新、截图、链接/响应式/对比度检查、未做事项 | 已记录 | [变更记录](docs/change/2026-10-21_change_project-site.md)、[证据目录](docs/change/2026-10-21_project-site-evidence/) |
| 职责与接口面 | 职责、输入/输出、文件位置；接口不适用及可核验理由 | 已建立 | [functional-description](functional-description.md)、[api-spec](api-spec.md) |

## 说明

- 站点只写 README v1.4.0、GitHub Release v1.4.0、发布验收记录与论文可证实的事实；版本与下载链接以实际发布为准。
- `changelog.md` 由 ANS Team Formation 维护，本角色不修改。
- 发布/推送/部署由客户或协调方执行；本角色不自行 push、不改仓库设置。
