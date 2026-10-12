// test/桌面应用/markdown.test.ts
// 桌面应用（B-1，2026-10-12 **修订**）：Markdown 渲染现为**第三方库封装**（vendored markdown-it 15.0.2；
// 客户裁定「应该用第三方的」）——本文件仍是**纯函数面**的单测，并承载三组护栏：
//  ① 语法渲染（标题/列表/围栏码/行内码/粗斜/链接/引用/段落换行）；
//  ② **XSS 负例**（`<script>`/`<img onerror>`/`javascript:` 链接/引号注入 href/图片与表格——全跑一遍；
//     库升级或配置改动时它们就是护栏）；
//  ③ **配置钉子**：`options.html === false`——谁把 `html` 误开成 `true`，这里必红（并附「开了会怎样」的
//     现场演示）；外加 **vendor 文件 sha256 pin**（防静默换文件）。
//
// 装载：index.html 的顺序是 vendor → markdown.js → renderer.js；node 测试按同序动态 import（side effect）。

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..", "..", "app", "renderer");

// 先装库（UMD 在 node ESM 下走 globalThis 分支）、再装封装——与 index.html 同序。
const vendorHref = new URL("../../app/renderer/vendor/markdown-it.umd.min.js", import.meta.url).href;
const markdownHref = new URL("../../app/renderer/markdown.js", import.meta.url).href;
await import(vendorHref);
await import(markdownHref);
const Md = (globalThis as Record<string, unknown>).ANSMarkdown as {
  esc: (s: unknown) => string;
  renderMarkdown: (s: unknown) => string;
  options: Record<string, unknown>;
  createRenderer: (overrides?: Record<string, unknown>) => { render: (s: string) => string };
};
assert.ok(Md && typeof Md.renderMarkdown === "function", "markdown.js 应挂 globalThis.ANSMarkdown（renderMarkdown）");

test("语法：标题/粗斜/行内码/引用/列表/围栏码/链接/段落换行（markdown-it 输出形状）", () => {
  assert.equal(Md.renderMarkdown("# 标题"), "<h1>标题</h1>\n");
  assert.equal(Md.renderMarkdown("## 二级 **粗**"), "<h2>二级 <strong>粗</strong></h2>\n");
  assert.equal(Md.renderMarkdown("**x** 与 *y*"), "<p><strong>x</strong> 与 <em>y</em></p>\n");
  assert.equal(Md.renderMarkdown("行内 `a<b`"), "<p>行内 <code>a&lt;b</code></p>\n");
  assert.equal(Md.renderMarkdown("> 引用"), "<blockquote>\n<p>引用</p>\n</blockquote>\n");
  assert.equal(Md.renderMarkdown("- 一\n- 二"), "<ul>\n<li>一</li>\n<li>二</li>\n</ul>\n");
  assert.equal(Md.renderMarkdown("1. 一\n2. 二"), "<ol>\n<li>一</li>\n<li>二</li>\n</ol>\n");
  // 围栏码：**本仓样式类**（.md-pre/.md-lang）在封装里定制；内容转义、去尾换行。
  assert.equal(
    Md.renderMarkdown("```ts\nconst a = 1 < 2;\n```"),
    '<pre class="md-pre"><span class="md-lang">ts</span><code>const a = 1 &lt; 2;</code></pre>'
  );
  // 链接：类 `md-link` + `rel="noopener noreferrer"`（外开仍由渲染侧委托、经 preload）。
  assert.equal(
    Md.renderMarkdown("[站点](https://example.com/a?b=1&c=2)"),
    '<p><a href="https://example.com/a?b=1&amp;c=2" class="md-link" rel="noopener noreferrer">站点</a></p>\n'
  );
  // 段落内换行以 <br> 保留（breaks:true——与旧版聊天行为一致）；空行分段。
  assert.equal(Md.renderMarkdown("一\n二\n\n三"), "<p>一<br>\n二</p>\n<p>三</p>\n");
  assert.equal(Md.renderMarkdown("普通一句话"), "<p>普通一句话</p>\n");
  // esc 单一来源：本函数与渲染侧共用同一实现（非 Markdown 路径仍用它）。
  assert.equal(Md.esc('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");
});

test("XSS 负例（护栏）：<script>/<img onerror>/javascript: 链接/引号注入 href/图片/表格——一律不产可执行 HTML", () => {
  const s1 = Md.renderMarkdown("<script>alert(1)</script>");
  assert.ok(s1.includes("&lt;script&gt;") && !s1.includes("<script"), "script 标签必须转义（html:false）");
  const s2 = Md.renderMarkdown('<img src=x onerror="alert(1)">');
  assert.ok(!/<img/i.test(s2) && s2.includes("&lt;img"), "img 标签必须转义");
  const s3 = Md.renderMarkdown("[点我](javascript:alert(1))");
  assert.ok(!/<a /i.test(s3), "javascript: 链接不得渲染为 <a>（validateLink 白名单：仅 http/https/mailto）");
  assert.ok(s3.includes("javascript:alert(1)"), "非白名单链接原样展示为文字");
  // 引号/尖括号注入 href：URL 被百分号编码，不产生标签逃逸。
  const s4 = Md.renderMarkdown('[a](https://x.tld/"><script>alert(1)</script>)');
  assert.ok(!s4.includes("<script"), "URL 注入串不得冒出标签");
  assert.ok(s4.includes("%22%3E%3Cscript%3E"), "引号与尖括号应被百分号编码（现场证据）");
  assert.ok(!s4.includes('"><'), "不得有属性逃逸");
  // 行内码里的标签同样转义。
  const s5 = Md.renderMarkdown("`<svg onload=alert(1)>`");
  assert.ok(s5.includes("&lt;svg") && !s5.includes("<svg"), "行内码内容同样转义");
  // 图片：以**原文文本**呈现（O-B1 未准；且不得变成链接/外链请求）。
  const s6 = Md.renderMarkdown("![alt](https://x.tld/i.png)");
  assert.ok(!/<img/i.test(s6) && !/<a /i.test(s6), "图片不得渲染为 <img>，也不得回落成链接");
  assert.ok(s6.includes("![alt](https://x.tld/i.png)"), "图片以原文文本呈现");
  // 表格：未启用（O-B1 未准）——保持文本。
  const s7 = Md.renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
  assert.ok(!/<table/i.test(s7) && s7.includes("| a | b |"), "表格不渲染（保持文本）");
  // 任意 HTML 标签不得直通。
  const s8 = Md.renderMarkdown("<div onmouseover=alert(1)>hi</div>");
  assert.ok(!/<div/i.test(s8), "任意 HTML 标签不得直通");
});

test("配置钉子：options.html 必须为 false（误开成 true 本测试必红）；并现场演示「开了会怎样」", () => {
  // ★ 钉子：谁把 html 误开（或换成默认透传 HTML 的配置），此断言立刻红——这就是护栏本体。
  assert.equal(Md.options.html, false, "html 必须为 false（XSS 底线；误开 html:true 会让上面全部负例失守）");
  assert.equal(Md.options.breaks, true, "breaks 保持 true（聊天内换行行为）");
  // 现场演示：同一库、仅把 html 换成 true 时，原始标签会直通——说明该配置项不是摆设（不得删除本演示）。
  const unsafe = Md.createRenderer({ html: true });
  assert.ok(/<img/i.test(unsafe.render('<img src=x onerror="alert(1)">')), "演示：html:true 会直通原始 HTML（故默认必须 false）");
  assert.ok(!/<img/i.test(Md.renderMarkdown('<img src=x onerror="alert(1)">')), "默认渲染器：仍然转义");
});

test("库文件 pin：vendor 的 markdown-it 单文件 sha256 与记录一致（静默换文件/升级未同步必红）", () => {
  const file = fs.readFileSync(path.join(APP_DIR, "vendor", "markdown-it.umd.min.js"));
  const sha = crypto.createHash("sha256").update(file).digest("hex");
  assert.equal(
    sha,
    "635972b985228e8af9f0143647c68616b7a3bb09f6946e7e4a52e43dcf5e7be5",
    "vendored markdown-it 15.0.2 的 sha256 须与 vendor/README.md 记录一致（升级时同步更新两处）"
  );
  const index = fs.readFileSync(path.join(APP_DIR, "index.html"), "utf8");
  const vPos = index.indexOf('src="vendor/markdown-it.umd.min.js"');
  const mPos = index.indexOf('src="markdown.js"');
  const rPos = index.indexOf('src="renderer.js"');
  assert.ok(vPos >= 0 && vPos < mPos && mPos < rPos, "index.html 装载顺序须为 vendor → markdown.js → renderer.js");
  const readme = fs.readFileSync(path.join(APP_DIR, "vendor", "README.md"), "utf8");
  assert.ok(readme.includes("15.0.2") && readme.includes(sha), "vendor/README.md 须记录版本与同一 sha256");
  assert.ok(readme.includes("MIT"), "须记录许可（MIT）");
});
