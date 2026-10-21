---
id: markdown-it-vendor-15-0-3
type: change
title: vendored markdown-it 安全升级 15.0.2 → 15.0.3（GHSA-gfr2-rv44-r23c / GHSA-vfgh-jcmw-g37q）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented-unverified
related: [ui-platform-round, ui-contract-surface]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按安全派发把 app/renderer/vendor 的 markdown-it UMD 从 15.0.2 升到 15.0.3，与装配已升级的 npm 依赖同版本
  - date: "2026-10-21"
    kind: implemented
    summary: vendor 两文件替换、README/markdown.js 头注/测试 pin 同步；markdown 单测 5/5、桌面目录 679/679 全绿；配置/行为零改动
---

# vendored markdown-it 升到 15.0.3：安全修复，行为不变

渲染侧聊天 Markdown 使用 vendored 的 `markdown-it` UMD 单文件（`app/renderer/vendor/markdown-it.umd.min.js`）。安全派发确认 **15.0.2 命中两条安全公告**，均修于 **15.0.3**：

- **GHSA-gfr2-rv44-r23c（high，CVSS 7.5）**：默认配置下，多个多行 link reference definition 会触发二次方渲染；聊天渲染路径可达（模型输出可包含这类 Markdown）。
- **GHSA-vfgh-jcmw-g37q（low）**：同批修复的 low 级问题。

装配已把根 `package.json`/`package-lock.json` 的 `markdown-it` 升到 **15.0.3**（根清单不属本角色，未改）。本轮把 vendor 单文件同步升到 **15.0.3**，保证 npm 依赖与 vendored UMD **两处同版本**。

## 改在哪里

| 位置 | 改动 |
| --- | --- |
| `app/renderer/vendor/markdown-it.umd.min.js` | 替换为 `markdown-it@15.0.3` tarball 内的 `package/dist/browser/markdown-it.umd.min.js` |
| `app/renderer/vendor/markdown-it.LICENSE` | 替换为同 tarball 的 `package/LICENSE`（内容与旧文件逐字节一致，sha256 不变） |
| `app/renderer/vendor/README.md` | 版本 15.0.2→15.0.3、registry tarball URL、sha256、核对日期；新增安全升级说明与本次变更记录链接 |
| `app/renderer/markdown.js` | **仅头注释版本号** 15.0.2→15.0.3（安全升级标注）；配置/行为一字未动 |
| `test/桌面应用/markdown.test.ts` | vendor pin 的版本号、sha256、README 版本断言、文件头注释同步；XSS/html:false/装载顺序断言未动 |
| **未改** | 根 `package.json`/`package-lock.json`（装配已升级）、`index.html`、`renderer.js`、`styles.css`、`vendor/README.md` 的升级路径、其他角色目录 |

## 来源与可复核哈希

- 临时目录 `/tmp/ans-md-it-1503` 执行 `npm pack markdown-it@15.0.3`：
  - tarball：`markdown-it-15.0.3.tgz`
  - tarball **sha256**：`98a7453983ab0e268c17dbd5260bf7190ba46b4cca912327fc1c1a2578e4b56d`
  - tarball **sha1（npm notice）**：`2a69a26db9abb63340512bfde0c4f4ae6db671eb`
  - **integrity**：`sha512-+Az7Ojz3iRGu8KYMvJ6xVhvrxP3eE+vEtJX75Ow88XBpcQNV/0lGX5ZynIIBftREo4DC2jsveAMDaeltmm8QvQ==`（与根 `package-lock.json` 的 15.0.3 条目一致）
- 解包取 `package/dist/browser/markdown-it.umd.min.js`（100,786B）与 `package/LICENSE`（1,073B）。

**sha256 前后值（仓库内 vendor 文件实测）**：

| 文件 | 15.0.2（前） | 15.0.3（后） |
| --- | --- | --- |
| `markdown-it.umd.min.js` | `635972b985228e8af9f0143647c68616b7a3bb09f6946e7e4a52e43dcf5e7be5` | `391f2aa638e75e6c7859d0a5c5650ef0956722a45998f17e05b83bc655778e1e` |
| `markdown-it.LICENSE` | `792c48c5a849a15fdf9e37e8bcf9e6d1dd13b32b46c642a748a0a46a9919d473` | `792c48c5a849a15fdf9e37e8bcf9e6d1dd13b32b46c642a748a0a46a9919d473`（未变） |

## 行为不变声明

`markdown.js` 的配置与安全约束**逐字未动**：

- `html: false`（原文 HTML 只以转义文本出现）；
- 链接 `validateLink` 白名单（http/https/mailto）+ `rel="noopener noreferrer"` + 类 `md-link`；
- 图片禁用为原文文本；表格保持启用；
- 围栏/缩进代码块的 `esc` 单一来源与 `.md-pre`/`.md-lang` 类不变；
- `index.html` 装载顺序 vendor → markdown.js → renderer.js 不变。

本轮 `markdown.js` 的 git diff 只有文件头注释的版本号一行。

## 测试结果（真实输出）

| 命令 | 结果 |
| --- | --- |
| `node --test test/桌面应用/markdown.test.ts` | **5/5 通过，exit 0**：语法、XSS 负例、`options.html===false` 钉子、vendor sha256 pin、受限文档静态呈现全部绿 |
| `node --test test/桌面应用/*.test.ts` | **679 计 / 679 过 / 0 败 / exit 0**（含 renderer/tool-rows/runtime-ui/markdown 等桌面测试目录全量） |
| `git diff --check` | exit 0 |

**XSS 负例与 `html:false` 钉子全绿**，未带着红升级。`vendor/README.md` 的版本与 sha256 断言、`markdown.test.ts` 的 README 版本断言同步通过（pin 同时防静默换文件与升级未同步两处）。

## 未验证项 / 残留

- **注释残留（非版本源）**：`app/renderer/index.html` 加载 vendor 的注释仍写「markdown-it 15.0.2」；本次派发文件范围只列 `app/renderer/` 的 vendor 与 `markdown.js`，未改该注释。权威版本/哈希在 `vendor/README.md` 与测试 pin；如允许可后续一行同步。

- 未在真实 Electron 中重跑聊天流渲染（Phase 3 聊天流尚未迁移；本轮是纯函数/单测面验证 + vendor 文件替换）。
- 未跑全仓 `node --test "test/**/*.test.ts"` 或其他角色测试；只跑派发要求的桌面目录。
- 未独立复核 npm 公告的 CVSS/修复范围（按安全派发给定信息记录）。

## 边界核对

只写：`app/renderer/vendor/markdown-it.umd.min.js`、`app/renderer/vendor/markdown-it.LICENSE`、`app/renderer/vendor/README.md`、`app/renderer/markdown.js`、`test/桌面应用/markdown.test.ts`、本角色 `角色卡/桌面UI/` 文档。未改根 `package.json`/`package-lock.json`（装配已升 15.0.3）、`app/main.ts`、`app/preload.cjs`、`app/desktop/`、旧渲染器其他文件或其他角色目录。临时 tarball/解包只在 `/tmp/ans-md-it-1503`，未入库。
