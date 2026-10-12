---
id: markdown-vendored-library
type: change
title: Markdown 渲染改用第三方库（vendored markdown-it 15.0.2；B-1 修订）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [markdown-history-status]
events:
  - date: "2026-10-12"
    kind: created
    summary: 客户裁定「应该用第三方的」——B-1 的「自写最小子集」路线被取代；选定并 vendored markdown-it 15.0.2（UMD 单文件、MIT），markdown.js 改为封装，XSS 负例与配置钉子加强
  - date: "2026-10-12"
    kind: implemented
    summary: 新增 app/renderer/vendor/{markdown-it.umd.min.js, markdown-it.LICENSE, README.md}；markdown.js 重写为库封装（esc/renderMarkdown 接口不变，+options/createRenderer 钉子面）；index.html 装载顺序 vendor→markdown.js→renderer.js；markdown.test.ts 重写（XSS 负例×7 + html:false 钉子 + sha256 pin）
  - date: "2026-10-12"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 108 计/107 过/1 红（唯一红为既有环境红）；全量 753 计/750 过/2 红/1 skipped（两红均既有环境红，非本改动）
---

# Markdown 渲染改用第三方库（vendored markdown-it；B-1 修订）

**来源**：客户修订（设计稿 B-1 节已加注）：「应该用第三方的，现在看起来像是你自己实现的」——原
「自写最小子集、不引库」路线**被取代**（原实现与本轮之前的行为见 `2026-10-12_change_markdown-and-multisession.md`，
该页保留为当时记录）。实施面：`app/renderer/**`（含新增 `vendor/`）、`test/桌面应用/**`、本页。

> **状态：已实施、已验证（2026-10-12）。** 渲染进程仍**无打包器**：库随仓库自带单文件并 pin。

## 选型与理由（**markdown-it 15.0.2**，而非 marked+DOMPurify）

1. **`html:false` 为默认**：原文 HTML 只以转义文本出现——XSS 底线由**配置项**一次性保证；marked 会把 HTML
   原样透传，必须再引 DOMPurify（多一个部件、多一处分寸），与「少一个部件」取向相悖。
2. **官方 UMD 单文件**（`dist/browser/markdown-it.umd.min.js`，浏览器全局 `markdownit`）**自带全部内部依赖**
   ——无打包器可用（经典脚本直挂）。
3. **扩展位正好是我们要的**：`validateLink`（scheme 白名单）、`renderer.rules.{link_open,fence,code_block,image}`
   （rel/类名/样式类/图片降级）——把本仓既有约束钉在同一处，不给第二份实现留口子。
4. 许可 **MIT**（全文 vendored）；本仓零新增 npm 依赖（**未动 `package.json`/lock——那属装配角色**）。

## 库文件（来源 / 校验 / 升级路径）

- `app/renderer/vendor/markdown-it.umd.min.js` — **sha256 `635972b985228e8af9f0143647c68616b7a3bb09f6946e7e4a52e43dcf5e7be5`**
- `app/renderer/vendor/markdown-it.LICENSE` — MIT 全文（sha256 `792c48c5a849a15fdf9e37e8bcf9e6d1dd13b32b46c642a748a0a46a9919d473`）
- 来源：npm tarball `https://registry.npmjs.org/markdown-it/-/markdown-it-15.0.2.tgz` 内
  `package/dist/browser/markdown-it.umd.min.js`。
- **升级路径**（含校验与「不得带着红升级」）：`app/renderer/vendor/README.md` 逐条列出；
  `markdown.test.ts` **pin 了 sha256**——文件被静默替换/升级未同步（README、测试两处）即红。

## 改在哪（文件 → 改动）

- **`app/renderer/markdown.js`（重写为封装）**：对外接口**不变**——`esc`（**单一来源**：renderer.js 的既有非
  Markdown 路径继续用它）+ `renderMarkdown(text)`（语义同前：无匹配语法退化为转义文本）；新增**钉子面**
  `options`（固定配置，`html:false` 在内）与 `createRenderer(overrides)`（测试演示/验证配置项作用）。
  封装内定制：`validateLink` 收紧为 **http/https/mailto 白名单**（叠加库默认拒绝表）；`link_open` 加
  `class="md-link" rel="noopener noreferrer"`；`fence`/`code_block` 输出既有样式类 `.md-pre`/`.md-lang`
  （内容经本文件唯一的 `esc`）；**`image` 规则覆写为原文文本**（注意：只 `disable("image")` 会让
  `[alt](url)` 回落成一条普通链接、还留个孤立 `!`——故覆写而非禁用）；`table` 禁用（O-B1 未准）。
- **`app/renderer/vendor/`（新增）**：库单文件 + LICENSE + README（版本/许可/来源/sha256/升级步骤）。
- **`app/renderer/index.html`**：装载顺序 **vendor → markdown.js → renderer.js**（测试钉住）。
- **`styles.css`**：**未动**（`.md-pre`/`.md-lang`/`.md-link` 由封装输出对齐；其余元素选择器本就通用）。
- **测试**：`markdown.test.ts` 重写（3→4 例、断言面扩大）：语法逐字钉 15.0.2 输出；**XSS 负例 7 组**；
  **`options.html===false` 钉子 + 「html:true 会直通」现场演示**；**vendor sha256 pin + index 顺序**；
  `renderer.test.ts` 的 B-1 冒烟按同序装载。渲染侧（`renderer.js`）**未改**（接口不变）。

## XSS 证据（全跑通；库升级/配置改动时的护栏）

`<script>`→`&lt;script&gt;`（无 `<script`）；`<img onerror>`→转义；`javascript:` 链接**不成 `<a>`**（白名单）；
引号注入 `[a](https://x.tld/"><script>…)` → URL 被**百分号编码**（现场断言含 `%22%3E%3Cscript%3E`）且无
`"><` 逃逸、无 `<script`；行内码/围栏码内标签转义；图片=原文文本（不产 `<img>`、不回落链接）；表格不渲染；
任意 HTML 标签不直通；**钉子**：`options.html===false`（误开即红）且演示 `createRenderer({html:true})`
确会直通（证明该断言不是装饰）；**sha256 pin**（静默换文件即红）。

## 行为差异（如实登记，均测试钉住）

- 输出形状随库：块级标签间带换行、属性顺序 `href` 在前（CSS/点击委托不受影响——测 `.md-link`/`rel`/元素选择器）；
- 库同时转义单引号（`&#39;`）——比旧版更严（无兼容问题）；
- `breaks:true` 保持聊天内换行行为；`linkify:false` 保持裸 URL 纯文本；
- **新增小能力**：`<https://…>` 角括号 autolink 现可用（经白名单，安全）；
- 图片/表格维持「不渲染」（O-B1 未准）。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD d933537）

- `npm run typecheck` → **0 错**。
- `node --test "test/桌面应用/*.test.ts"` → **108 计 / 107 过 / 1 红**——唯一红为**既有环境红**
  （`pi-config.test.ts` 断言检出目录名 `ans-cli`，本机 `ans-runtime`；**未动**）。
- 全量 `node --test "test/**/*.test.ts"` → **753 计 / 750 过 / 2 红 / 1 skipped**；两红**均既有环境红、非本改动**。
- 库文件 sha256（实测）：`635972b985228e8af9f0143647c68616b7a3bb09f6946e7e4a52e43dcf5e7be5`（与 pin 一致）。

## 不在本轮

- O-B1（表格/图片渲染）：未准，不做（图片维持原文文本）。库升级本身随时可做（按 vendor/README.md 流程）。
