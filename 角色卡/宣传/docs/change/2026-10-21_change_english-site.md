---
id: english-site
type: change
title: 增加英文版官网（/en/）与双语导航
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: deployed
related: [project-site]
events:
  - date: "2026-10-21"
    kind: created
    summary: 建立 site/en/ 英文单页与双语切换、hreflang 与双语 sitemap
  - date: "2026-10-21"
    kind: implemented
    summary: 本地 200、双页面视口无溢出、aria-current 与结构检查通过
  - date: "2026-10-21"
    kind: deployed
    summary: 协调方提交 b00bc74 并部署成功，线上中英两页与本地字节一致
---

# 增加英文版官网（/en/）

客户 2026-10-21 追加「这个应该还得有一份英文版本的吧」。本次在不动事实、链接与版本号的前提下，新增英文单页 `site/en/index.html`（路径 `/en/`），中文站保持 `site/index.html`（`/`）。两页共享同一套 `styles.css`、`app.js` 与 `assets/`，并互相提供语言切换。

英文版已由协调方提交并部署上线：`https://wangzhongren.github.io/ans-studio/en/`。提交 `b00bc74a66abf4f37f3e6a55d4f5762bb97e8fc9`（main，`feat(site): add English site and bilingual navigation`）仅含 `site/index.html`、`site/styles.css`、`site/sitemap.xml`、`site/en/index.html`；角色文档已随提交 `2983402` 入库；品牌图标变更随 `77c5143` 入库。本角色未执行任何 git 操作，未自行运行或触发部署。

## 交付内容

```text
site/en/index.html                                英文单页（九节，结构与中文页一一对应）
site/styles.css                                   追加语言切换、英文排版与 path-note 样式
site/sitemap.xml                                  改为双语两个 URL + 三条 xhtml:link alternate
site/index.html                                   仅头部（hreflang/og:locale/JSON-LD inLanguage）与账本栏/页脚语言切换；正文未动
角色卡/宣传/docs/change/2026-10-21_change_english-site.md   本文件
角色卡/宣传/docs/change/2026-10-21_english-site-evidence/   英文截图证据（4 张）
```

未改 `.github/workflows/pages.yml`、`robots.txt`、任何下载/发布链接或版本号；未做 git 操作。

## 结构与语言切换

- 中文页 `<html lang="zh-CN">`，英文页 `<html lang="en">`；不做浏览器语言自动跳转。
- 共享资源：英文页用 `../styles.css`、`../app.js`、`../assets/...`，不复制 CSS/图片。
- 切换位置：
  - 桌面：账本栏底部 `English / 中文`（当前语言 mint + `aria-current="true"`，另一语言为链接）；
  - 移动：同一个 `.rail-foot` 在 56px 顶栏内横向排列（`English / 中文` + `v1.4.0` + GitHub），360px 实测不溢出；
  - 页脚：语言项放在页脚链接列表末尾，同样标记当前语言。
- 英文页复用 `app.js`；section id 保持 `roles/flow/gates/engines/download/source`，滚动高亮实测返回 `Roles`。

## SEO / hreflang

- canonical：中文 `https://wangzhongren.github.io/ans-studio/`；英文 `https://wangzhongren.github.io/ans-studio/en/`。
- 两页均含三条 alternate：`zh-CN` → 中文页、`en` → 英文页、`x-default` → 中文页。
- OG：中文 `og:locale=zh_CN` + `og:locale:alternate=en_US`；英文 `en_US` + `zh_CN`；英文页 title/description/OG/Twitter 全英文。
- JSON-LD 两页均为 SoftwareApplication；中文 `inLanguage: "zh-CN"`，英文 `inLanguage: "en"` 且 `url` 指向 `/en/`。
- `site/sitemap.xml`：两个 `<url>`，每个带 `xmlns:xhtml` 的三条 `xhtml:link rel="alternate"`；`robots.txt` 未改。

## 英文文案

- 定位：H1 `An autonomous organization runtime for AI agents.`；其上是 mono 定位行 `Role-first governance for AI agents` 与 Role-first 印章（`organizing principle`）。核心品牌原句 `An Autonomous Organization Runtime for AI Agents.` 保留在页脚与 title/JSON-LD。
- 各节标题与正文按英文技术产品语气重写，不逐字机翻；事实、链接、版本与中文页一致（外链集合逐项相同）。
- 客户指定微调已落实：角色导语与 Steward 的权力统一为 orchestration / Orchestration；下载导语改为 `The app bundle includes its own runtime, so launching the app needs no separate Node.js install; …`。
- 事实边界保持：YAML schema 与 `status: done` + evidence 结构真实；写盘示例保留真实路径 `角色卡/提案/…`，并加一行说明该目录名在仓库中确实是中文。
- 排版：`html[lang="en"]` 下 H1 `letter-spacing:-0.03em`、`line-height:1.06`、`max-width:15em`，正文行高 1.65，H2 行高 1.2；支持宽屏两行、移动三行。

## 验证（真实执行）

```bash
python3 -m http.server 8765 --directory site
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/       # 200
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/en/    # 200
```

截图（Chrome headless / CDP 精确视口；均已用 Read 实看）：

| 截图 | 路径（/tmp 工作副本） | 入档副本 |
| --- | --- | --- |
| 英文桌面首屏 1440×1000 | `/tmp/ans-en-desktop-hero.png` | [desktop-hero-en-1440x1000.png](2026-10-21_english-site-evidence/desktop-hero-en-1440x1000.png) |
| 英文桌面全页 1440×8310 | `/tmp/ans-en-desktop-full.png` | [desktop-full-en-1440.png](2026-10-21_english-site-evidence/desktop-full-en-1440.png) |
| 英文移动全页 390×10160 | `/tmp/ans-en-mobile-full.png` | [mobile-full-en-390.png](2026-10-21_english-site-evidence/mobile-full-en-390.png) |
| 英文移动首屏 360×1000 | `/tmp/ans-en-360seg-0.png` | [mobile-hero-en-360x1000.png](2026-10-21_english-site-evidence/mobile-hero-en-360x1000.png) |

观察：

- **英文桌面首屏**：定位行、印章、两行 H1（`An autonomous organization` / `runtime for AI agents.`）、导语、CTA、事实行与截图层次清楚；语言切换在账本栏底部、当前语言为 mint。
- **英文移动 390/360**：顶栏一行放下图标 + `ans` + `English / 中文` + `v1.4.0` + GitHub；H1 三行（`An autonomous` / `organization runtime` / `for AI agents.`），无拆词、无孤行；YAML 面板与示例不溢出；页脚语言项正常。
- **中文页回归**：1440 与 360 首屏正常，账本栏/页脚新增 `中文 / English`（当前中文 mint），360 顶栏不挤爆；正文未动。

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 双语 200 与共享资源 | curl `/`、`/en/` 与 `../` 资源 | 全部 200 |
| 横向溢出 | CDP 1440/390/360 两页 | `scrollWidth == innerWidth`，越界元素 0 |
| H1 断行 | Range 行盒测量 14 个宽度（1440→320） | 1440 两行、末行 9.5em；390/360 三行、末行 5.9em；`organization` 不被拆开，`AI&nbsp;agents.` 防止孤行 |
| 结构 | 两页脚本扫描 | 无重复 id；各 1 个 h1；各 3 个 img 全有 alt；外链 20 个且 `rel="noopener"` 无遗漏 |
| 外链一致 | 抓取两页 URL 集合 | 完全相等（16 个唯一 URL，均为此前 HEAD 200 的既有链接） |
| hreflang / canonical / OG | 解析 head | 两页三条 alternate 互指正确；canonical 与 locale 符合要求 |
| JSON-LD | json 解析 | 两页可解析；`inLanguage` 分别为 zh-CN / en |
| sitemap | ElementTree 解析 | 2 个 URL × 3 条 alternate，指向正确 |
| 运行时 | CDP 监听异常/控制台；即时滚动读 `aria-current` | 无异常；英文页滚动到角色段后为 `Roles` |
| 对比度 | 页面内计算 | 正文 15.39:1、muted 6.76:1、示例文字 15.39:1 |

## 自我批评与修正

1. **英文角色列宽规则泄漏到移动端**：英文桌面列宽覆盖以更高优先级覆盖了移动网格，390/360 出现 486px 横向溢出；把该规则限定在 `@media (min-width: 1024px)`，复测两页 0 溢出。
2. **H1 断行**：用 CDP 在 14 个宽度测量行盒；1440/390/360 均无孤立 `agents.` 行；给 `AI agents.` 加 `&nbsp;` 防止窄宽度下只剩 `agents.`。
3. **客户指定文案**：统一 orchestration / Orchestration；下载导语改为 app bundle 表述，消除“runtime bundle includes its own runtime”的重复。
4. 语言切换在 360px 顶栏与页脚均实测不溢出，点击目标沿用 44px 规则。

## 发布记录（协调方执行）

- **提交**：`b00bc74a66abf4f37f3e6a55d4f5762bb97e8fc9`（main，`feat(site): add English site and bilingual navigation`）。内容仅 `site/index.html`、`site/styles.css`、`site/sitemap.xml`、`site/en/index.html`（4 个文件）；角色文档后已随提交 `2983402` 入库（品牌图标变更随 `77c5143`）。
- **部署**：workflow run `39545903589`（job `119043890223`），结论 success，耗时 34 秒（2026-10-21 12:46 Asia/Shanghai，UTC 04:46:48 触发 → 04:47:26 完成），由 push 触发。
- **线上核对（本角色 curl 复核）**：`/en/` 200，HTML SHA-256 `bc6739fa6b8e63eb62891ff3e353b5744610a249b50e4b9468f2cbc1be18ea93` 与本地 `site/en/index.html` 一致；`/` 200，HTML SHA-256 `dfd7786bfb1ea2b7419ea0539260093898875a9aa46c0f4b04af74b8c13f9369` 与本地 `site/index.html` 一致；`/styles.css`、`/app.js`、`/assets/ans-seal.png`、`/assets/favicon.png`、`/assets/desktop-intent-confirm.png`、`/sitemap.xml` 全部 200；线上英文页含 zh-CN / en / x-default 三条 hreflang，中文页已输出 `English` 切换链接。协调方 Chrome headless 实拍的英文首屏与本地一致。
- 提交、run 与线上结果由本角色独立复核（curl + git + `gh api`）；本角色未执行 push、部署或任何仓库设置变更。

## 未做与限制

- **站点已由协调方提交并部署**（`b00bc74`）；本角色不做 git 操作，未自行 push、运行工作流或改仓库设置。角色文档已随提交 `2983402` 入库；品牌图标变更随 `77c5143` 入库。
- 未做浏览器语言自动跳转（按客户要求）；未新增任何事实或承诺。
- 未在真实手机、Windows 浏览器与屏幕阅读器实测；同中文站，为 Chromium 视口模拟与键盘焦点样式检查。
- 运行包未签名/未公证、未内嵌 SHA256 等限制同中文站，英文页已如实转述。
- Google Fonts 仍为外链，失败时回退系统字体。
