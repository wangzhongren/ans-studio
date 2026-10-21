---
id: project-site
type: change
title: 建立 ANS Studio 项目官网与 Pages 发布工作流
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: deployed
related: [project-site]
events:
  - date: "2026-10-21"
    kind: created
    summary: 首轮交付 site/、pages.yml 与角色文档，本地验证通过
  - date: "2026-10-21"
    kind: designed
    summary: 按客户追加定位（自主组织运行时 / Role-first）更新首屏、为什么与全文主线
  - date: "2026-10-21"
    kind: deployed
    summary: 协调方提交 f87eb134 并部署成功，线上页面与本地字节一致
---

# 首轮交付：项目官网与 Pages 工作流

官网已由协调方提交并部署上线：`https://wangzhongren.github.io/ans-studio/`。提交 `f87eb134`（main，`feat(site): add ANS Studio GitHub Pages site`）只含 `site/**` 与 `.github/workflows/pages.yml`；角色文档已随提交 `2983402` 入库；品牌图标变更随 `77c5143` 入库。本角色未执行任何 git 操作，未自行运行或触发部署。运行包未签名/未公证的风险由站点如实提示，不改发布事实。

## 交付内容

分支基线：`main`（工作区另有其他角色的未提交改动，本角色未触碰）。新增/修改文件：

```text
site/index.html                              中文单页官网（九节 + 账本栏）
site/styles.css                              视觉 token、布局、响应式、唯一加载编排
site/app.js                                  滚动监听 → aria-current（增强，失败不影响内容）
site/assets/desktop-intent-confirm.png       真实桌面截图 1360×980（原图复制，165 KB）
site/assets/ans-seal.png                     应用图标 256×256（53 KB）
site/assets/favicon.png                      应用图标 64×64（3.6 KB）
site/robots.txt / sitemap.xml / .nojekyll    抓取、站点地图与 Pages 约定
.github/workflows/pages.yml                  Pages 构建与发布（本角色边界内唯一 workflow）
角色卡/宣传/feature-map.md                   交付面导航（首轮建立）
角色卡/宣传/functional-description.md         职责、输入/输出、文件位置（首轮建立）
角色卡/宣传/api-spec.md                       apiSpec: not-applicable + 可核验理由（首轮建立）
角色卡/宣传/docs/design/2026-10-21_design_project-site.md   设计记录
角色卡/宣传/docs/feature/project-site.md    官网稳定说明与维护方法
角色卡/宣传/docs/change/2026-10-21_change_project-site.md   本文件
角色卡/宣传/docs/change/2026-10-21_project-site-evidence/   截图证据（4 张）
角色卡/宣传/memo.md                          追加首轮结果与续接线索（不改已有事实）
```

未修改：README、`app/`、`src/`、`test/`、`package.json`、其他角色目录、`角色卡/宣传/changelog.md`。

## 定位更新（客户 2026-10-21 追加，经协调方转达）

1. 顶层定位改为「AI Agent 的自主组织运行时（Autonomous Organization Runtime for AI Agents）」：不是单个写代码助手，而是把多个 AI Agent 组织成有角色、有边界、有派发、有验收的团队。
2. 其下以 Role-first 为组织原则：先明确业务责任与角色，再确定模块和代码归属；写权限只来自角色边界；角色边界、门禁、独立验收都是这一原则的实现。
3. 英文原句 `An Autonomous Organization Runtime for AI Agents.` 作为**页面可见的品牌定位行**，位置：Hero 顶部、Role-first 印章上方，mono、13px（窄屏 12.5px）、muted、混合大小写；页脚英文行使用同一句。
4. H1 保持「AI Agent 的自主组织运行时。」；Role-first 以印章形式出现在 H1 上方（括号符号 + `Role-first` + `组织原则`）。
5. 同步影响：`<title>`、meta description、OG/Twitter、JSON-LD（description 与 `alternateName`）、Why 标题与三条推论、各节导语、页脚英文行；事实链接与版本号未动。

## 验证（真实执行）

### 本地服务与截图

```bash
python3 -m http.server 8765 --directory site   # 后台运行
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/          # 200
```

截图（Chrome 155 headless；全页与精确视口用 CDP `Emulation.setDeviceMetricsOverride`）：

| 截图 | 路径（/tmp 工作副本） | 入档副本 |
| --- | --- | --- |
| 桌面首屏 1440×1000 | `/tmp/ans-site-desktop-hero.png` | [desktop-hero-1440x1000.png](2026-10-21_project-site-evidence/desktop-hero-1440x1000.png) |
| 桌面全页 1440×7825 | `/tmp/ans-site-desktop-full.png` | [desktop-full-1440.png](2026-10-21_project-site-evidence/desktop-full-1440.png) |
| 移动全页 390×8901 | `/tmp/ans-site-mobile-full.png` | [mobile-full-390.png](2026-10-21_project-site-evidence/mobile-full-390.png) |
| 移动首屏 360×1000 | `/tmp/ans-360seg-0.png` | [mobile-hero-360x1000.png](2026-10-21_project-site-evidence/mobile-hero-360x1000.png) |

逐张用 Read 查看后的观察：

- **桌面首屏**：英文定位行（mono、muted）→ Role-first 印章 → 两行 H1 → 两段导语 → 双 CTA → 事实行的层级清楚，不拥挤；截图框四角薄荷绿 L 形括号可见；账本栏底部版本与 GitHub 链接就位。
- **桌面全页**：九节顺序正确；角色行、流程六步与右侧 YAML 面板、门禁示例、三列引擎、三平台下载、引用块与页脚均按账本式横线组织；无圆角卡片网格；section 间细线贯穿。
- **移动全页 390**：单列布局；顶栏 56px 显示图标 + `ans` + `v1.4.0` + GitHub；YAML 面板移到步骤下方；门禁示例换行不截断；下载按钮与校验链接可点；页脚单列。
- **移动首屏 360**：H1 两行完整（「AI Agent 的 / 自主组织运行时。」），印章与英文定位行均不溢出，按钮自然换行。

### 结构、链接与运行时检查

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 重复 id / 标题层级 / alt / 外链 rel | Python 正则扫描 `site/index.html` | 9 个 id 无重复；恰 1 个 h1；3 个 img 全有 alt；20 个外链均 `rel="noopener"` |
| 本地资源 | 解析 `href`/`src` 相对路径并检查文件 | 5 个本地引用全部存在（app.js、styles.css、3 个图片） |
| 外链 HTTP | `curl -sSIL`（15 个 GitHub/Zenodo URL） | 全部 200：仓库、LICENSE、Releases、v1.4.0 Release 页、3 个 ZIP、4 个 SHA256SUMS、release-provenance.json、overlay.patch、Zenodo DOI |
| Google Fonts | HEAD `fonts.googleapis.com` | 200（不可达时回退系统字体） |
| 横向溢出 | CDP 精确视口 1440/390/360，`documentElement.scrollWidth` 对比 `innerWidth`，并枚举越界元素 | 三者均相等，越界元素 0（修复前 390/360 曾出现 399px 轨道溢出，见下） |
| 对比度 | 页面内计算 WCAG 比值 | 正文 15.39:1；muted（导语/说明/导航/页脚）6.76:1；mint 按钮深色文字 >14:1 |
| JS 语法 | `node --check site/app.js` | 通过 |
| 运行时异常 | CDP 监听 `Runtime.exceptionThrown` / `Log.entryAdded` | 无异常、无控制台错误 |
| 导航高亮 | CDP 滚动到 `#roles` 后读取 `[aria-current]` | 返回「角色」，高亮生效 |

`pages.yml` 的触发器、权限、并发与步骤按派发要求逐条落盘；本角色未自行运行或触发工作流。协调方通过 push 触发的一次成功部署见下节「发布记录（协调方执行）」。

## 自我批评与修正（首轮）

1. **截图放大**：`sips -Z 1600` 把 1360 宽的截图放大成 1600×1153（体积 300 KB 且变糊）；按任务允许「保持 1360 宽即可」，改为原图复制（165 KB）。
2. **移动端真实溢出**：门禁示例的 `white-space: nowrap` 文本把 grid 子项撑到 399px（`min-width:auto` 的典型问题），390/360 视口出现横向裁切；给账本行 grid 子项加 `min-width:0`，示例在窄屏改为换行；复测 0 溢出。
3. **中文拆词**：390px 下 H1 原先把「分工」「完成」拆到两行；改为 `nowrap` 短语片段 + 窄屏 H1 降一档（`clamp(1.9rem,9vw,2.6rem)`），现为两行「AI Agent 的 / 自主组织运行时。」；流程与来源的 H2 同样用不可断行片段，避免「一条」「一套」被拆开。
4. **孤字**：角色描述曾出现「管理者」的「者。」单独成行；正文启用 `text-wrap: pretty` 修正。
5. **示例观感**：窄屏示例像被截断 → 允许换行；`.gate-list p` 的 muted 颜色因选择器优先级盖过了 `.example`，补 `.gate-list .example { color: var(--text) }`，命令文字回到正文色。
6. **`rel="noopener"` 遗漏**：三个下载按钮缺 rel，补齐后复扫 0 遗漏。
7. **导航高亮算法**：最初用 `intersectionRatio` 比较不同高度 section 不可靠；改为「与阅读带（视口 30%–55%）交集高度最大」判定，并调 rootMargin 为 `-30% / -45%`。
8. **截图假象排查**：macOS 上 `--window-size=390` 的实际布局宽是 500px，首轮移动截图右侧被裁是截图工具假象；改用 CDP 精确视口后才得到真实 390/360 证据，并在此记录以免后续误判。

## 发布记录（协调方执行）

- **提交**：`f87eb134ea441683d15cc85d4d855789d8ec7e59`（main，`feat(site): add ANS Studio GitHub Pages site`）。提交内容仅 `site/**` 与 `.github/workflows/pages.yml`；角色文档后已随提交 `2983402` 入库（品牌图标变更随 `77c5143`）。
- **部署**：workflow run `39541758607`（job `119030858968`），结论 success，耗时 19 秒（2026-10-21 12:01 Asia/Shanghai，UTC 04:01:36→04:01:55），由 push 触发。
- **仓库设置**：Pages 已启用 `build_type=workflow`、`https_enforced=true`；仓库 homepage 已设为 `https://wangzhongren.github.io/ans-studio/`（本角色用 `gh api` 只读复核，未修改设置）。
- **线上核对（本角色 curl 复核）**：`/` 返回 200（22988 bytes），且线上 `index.html` 的 SHA-256 与本地一致（`a6aaa5d30981158faa49afe5cfce90e9764cdbed12878b46e46369aa3e8aad17`）；`styles.css`、`app.js`、`desktop-intent-confirm.png`、`ans-seal.png`、`favicon.png`、`robots.txt`、`sitemap.xml` 全部 200 且字节数与本地一致。协调方 Chrome headless 1440×1000 实拍的首屏与本地截图一致。
- 以上为协调方提供的发布事实，提交、run 与设置由本角色独立复核；本角色未执行 push、部署或任何仓库设置变更。

## 未做与限制

- **站点已由协调方提交并部署**；本角色不做 git 操作，未自行 push、运行工作流或改仓库设置。角色文档已随提交 `2983402` 入库；品牌图标变更随 `77c5143` 入库。
- 运行包本身仍未签名/公证（发布事实，非本次改动）；站点警示与 README 一致。
- 未在真实手机、Windows 浏览器与屏幕阅读器上实测；首轮为 Chromium 桌面/移动视口模拟与键盘焦点样式检查。
- 未内嵌 SHA256 明细；校验以 Release 的 `SHA256SUMS-*` 文件为准。
- `/tmp` 下的工作截图不可长期保留，已复制到本目录 `2026-10-21_project-site-evidence/`。
