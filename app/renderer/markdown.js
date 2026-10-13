// app/renderer/markdown.js —— 聊天消息的 Markdown 渲染（**第三方库封装**；B-1 修订，2026-10-12 客户裁定：
// 「应该用第三方的」——原「自写最小子集」路线被取代）。
//
// 库：**markdown-it**（vendored 单文件 `vendor/markdown-it.umd.min.js`，版本 **15.0.2**，MIT——
// 许可/来源/sha256/升级路径见 `vendor/README.md`；加载顺序见 index.html：vendor → 本文件 → renderer.js）。
// 选型理由（对比 marked）：① `html:false` **默认转义**原文 HTML——无需另加消毒器（marked 会把 HTML 原样透传，
// 须配 DOMPurify，多一个部件）；② 官方 UMD 单文件自带全部内部依赖，**无打包器可用**；③ 链接校验点
// （`validateLink`）与渲染规则（`renderer.rules`）都是公开扩展位，可把本仓既有约束钉在同处。
//
// —— 安全红线的实现（改动本文件必须保持）——
//   1) `html:false` —— 模型输出里的原始 HTML **只以转义文本**出现（XSS 底线；见测试里的**钉子**）；
//   2) 链接：`validateLink` 收紧为 **http/https/mailto 白名单**（叠加库默认拒绝表）；`rel="noopener
//      noreferrer"`、类 `md-link`（点击仍由 renderer.js 委托、经 preload 外开——不在应用内导航）；
//   3) 图片**禁用**（O-B1 未准；且图片会引外链）——`![x](url)` 以原文文本呈现；
//      **表格已启用**（2026-10-13 客户裁定）：`md.disable(["table"])` 删除——`html:false` 下单元格照常
//      转义（纯 table/tr/td/th 输出，无 XSS 增量；测试钉住「单元格内 HTML 仍被转义」）；
//   4) 围栏/缩进代码块内容经**本文件唯一的 `esc`** 转义后输出（样式类 `.md-pre`/`.md-lang` 与既有 CSS/测试对齐）。
//
// —— 单测面（与渲染分离）——：`esc`（**单一来源**：renderer.js 的既有非 Markdown 路径继续用它）、
//   `renderMarkdown(text)`（语义与旧版相同：无匹配语法时退化为转义纯文本）、`options`（配置钉子：测试断言
//   `html===false`——谁把它改坏，测试即红）、`createRenderer(overrides)`（测试用：演示/验证配置项的作用）。
(function (root) {
  "use strict";

  /** HTML 转义（**单一来源**：renderer.js 复用本函数，不再自持一份；库内部自己的转义不在此列）。 */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** 本仓**固定配置**（唯一一份；`createRenderer` 的默认值）——安全项不容改动（测试有钉子断言）。 */
  var OPTIONS = {
    html: false, // ★ XSS 底线：原文 HTML 一律转义（禁直通）
    xhtmlOut: false,
    breaks: true, // 段落内换行 → <br>（聊天场景与旧版行为一致）
    linkify: false, // 不做自动链接（与旧版最小子集对齐；正文里的裸 URL 保持纯文本）
    typographer: false,
  };

  function merged(a, b) {
    var out = {};
    var k;
    for (k in a) out[k] = a[k];
    for (k in b || {}) out[k] = b[k];
    return out;
  }

  /** 用给定配置构造一个 markdown-it 渲染器（默认 = 本仓固定配置；测试可传 overrides 验证配置项作用）。 */
  function createRenderer(overrides) {
    var factory = root.markdownit;
    if (typeof factory !== "function") {
      throw new Error("markdown-it（vendored）未加载：index.html 须先加载 vendor/markdown-it.umd.min.js，再加载 markdown.js。");
    }
    var md = factory(merged(OPTIONS, overrides));

    // 图片**禁用为链接**：`![alt](url)` 以**原文文本**呈现（O-B1 未准；且图片会引外链）——
    // 注意不能只 `disable("image")`：那会让 `[alt](url)` 部分回落成一条普通链接（带着孤立的 `!`），
    // 故**覆写 image 规则**输出转义后的原文。
    // 表格：**启用**（2026-10-13 客户裁定，原 `md.disable(["table"])` 删除）——库默认配置即输出
    // table/thead/tbody/tr/th/td；`html:false` 保证单元格内原文 HTML 照常转义（安全红线不回退，有钉子）。
    md.renderer.rules.image = function (tokens, idx) {
      var token = tokens[idx];
      var alt = String(token.content || "");
      var src = String(token.attrGet("src") || "");
      return esc("![" + alt + "](" + src + ")");
    };

    // 链接 scheme 白名单（叠加库默认拒绝表）：只放行 http/https/mailto——`javascript:`/`data:` 等不产 <a>。
    var defaultValidate = md.validateLink.bind(md);
    md.validateLink = function (url) {
      return /^(https?:\/\/|mailto:)/i.test(String(url)) && defaultValidate(url);
    };

    // 链接输出：类 `md-link`（既有 CSS/点击委托用）+ rel（外开经 preload；不在应用内导航）。
    md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
      tokens[idx].attrSet("class", "md-link");
      tokens[idx].attrSet("rel", "noopener noreferrer");
      return self.renderToken(tokens, idx, options);
    };

    // 围栏代码块：与既有样式类对齐（.md-pre/.md-lang）；内容经**本文件唯一的 esc** 转义（去掉尾部换行）。
    md.renderer.rules.fence = function (tokens, idx) {
      var token = tokens[idx];
      var lang = String(token.info || "").trim().split(/\s+/)[0] || "";
      return (
        '<pre class="md-pre">' +
        (lang ? '<span class="md-lang">' + esc(lang) + "</span>" : "") +
        "<code>" + esc(String(token.content || "").replace(/\n$/, "")) + "</code></pre>"
      );
    };
    // 缩进代码块（四空格）：同样给 `.md-pre`（样式与围栏一致）。
    md.renderer.rules.code_block = function (tokens, idx) {
      return '<pre class="md-pre"><code>' + esc(String(tokens[idx].content || "").replace(/\n$/, "")) + "</code></pre>";
    };

    return md;
  }

  var md = createRenderer();

  /** 渲染一段 Markdown 为**受控 HTML 字符串**（语义与旧版相同：库配置保证转义；白名单外语法退化文本）。 */
  function renderMarkdown(text) {
    return md.render(String(text == null ? "" : text));
  }

  var api = { esc: esc, renderMarkdown: renderMarkdown, options: OPTIONS, createRenderer: createRenderer };
  root.ANSMarkdown = api; // 浏览器（window）/ node（globalThis）共同生效
  if (typeof module !== "undefined" && module.exports) module.exports = api; // 若将来以 CJS 装载
})(typeof window !== "undefined" ? window : globalThis);
