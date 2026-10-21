// test/桌面UI/markdown.test.ts
// Phase 5A 迁移：旧 markdown.test.ts 的 5 项（语法/XSS/options/库 pin/受限文档静态呈现）。
// 新管线 = app/renderer/src/chat/markdown.ts（npm markdown-it 15.0.3），不读旧 vendor。

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  OPTIONS,
  createRenderer,
  esc,
  handleMarkdownLinkClick,
  installMarkdownLinkHandler,
  markdownLinkAction,
  renderMarkdown,
} from "../../app/renderer/src/chat/markdown.ts";

const require = createRequire(import.meta.url);

test("语法：标题/粗斜/行内码/引用/列表/围栏码/链接/段落换行（markdown-it 输出形状）", () => {
  const html = renderMarkdown(
    [
      "# 标题",
      "",
      "**粗** *斜* `行内码`",
      "",
      "> 引用",
      "",
      "- 一",
      "- 二",
      "",
      "```js",
      "const x = 1;",
      "```",
      "",
      "[站点](https://example.com)",
      "",
      "第一行",
      "第二行",
    ].join("\n"),
  );
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /<strong>粗<\/strong>/);
  assert.match(html, /<em>斜<\/em>/);
  assert.match(html, /<code>行内码<\/code>/);
  assert.match(html, /<blockquote>\s*<p>引用<\/p>\s*<\/blockquote>/);
  assert.match(html, /<ul>\s*<li>一<\/li>\s*<li>二<\/li>\s*<\/ul>/);
  assert.equal(
    html.includes('<pre class="md-pre"><span class="md-lang">js</span><code>const x = 1;</code></pre>'),
    true,
  );
  assert.equal(
    html.includes(
      '<a href="https://example.com" class="md-link" rel="noopener noreferrer">站点</a>',
    ),
    true,
  );
  // breaks:true：单换行保留为 <br>，段落语义不丢。
  assert.match(html, /第一行<br>\s*第二行/);
});

test("XSS 负例（护栏）：<script>/<img onerror>/javascript: 链接/引号注入 href/图片/表格单元格——一律不产可执行 HTML", () => {
  const cases = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "[x](javascript:alert(1))",
    '[a](https://e.com/" onmouseover="alert(1))',
    "![alt](https://e.com/x.png)",
    "| a | b |\n|---|---|\n| <script>x</script> | y |",
    "```html\n<script>alert(1)</script>\n```",
  ];
  for (const input of cases) {
    const html = renderMarkdown(input);
    assert.equal(/<script/i.test(html), false, input);
    assert.equal(/<img/i.test(html), false, input);
    assert.equal(/<[^>]*\sonerror\s*=/i.test(html), false, input);
    assert.equal(/<[^>]*\sonmouseover\s*=/i.test(html), false, input);
    assert.equal(/href="javascript:/i.test(html), false, input);
    // 原文仍可读：危险内容以转义文本出现，而不是被静默吞掉。
    if (input.includes("<script>")) assert.match(html, /&lt;script&gt;/);
  }
  // 图片覆写为转义原文，不产 <img>，也不回落成链接。
  const image = renderMarkdown("![alt](https://e.com/x.png)");
  assert.equal(image.includes("![alt](https://e.com/x.png)"), true);
  assert.equal(image.includes("<a "), false);
});

test("配置钉子：options.html 必须为 false（误开成 true 本测试必红）；并现场演示「开了会怎样」", () => {
  assert.equal(OPTIONS.html, false);
  assert.equal(OPTIONS.linkify, false);
  assert.equal(OPTIONS.typographer, false);
  assert.equal(renderMarkdown("<b>原文</b>").includes("<b>"), false);
  // 故意覆盖只用于演示风险：默认入口不受影响。
  const unsafe = createRenderer({ html: true });
  assert.equal(unsafe.render("<b>原文</b>").includes("<b>原文</b>"), true);
  assert.equal(renderMarkdown("<b>原文</b>").includes("&lt;b&gt;"), true);
});

test("库 pin：npm markdown-it 15.0.3 与 lockfile 一致；源码只依赖 npm 包，不再读旧 vendor", () => {
  assert.equal(require("markdown-it/package.json").version, "15.0.3");
  const lock = JSON.parse(
    readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"),
  );
  assert.equal(lock.packages?.["node_modules/markdown-it"]?.version, "15.0.3");
  const source = readFileSync(
    new URL("../../app/renderer/src/chat/markdown.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /from "markdown-it"/);
  assert.equal(/from ["'][^"']*(vendor\/markdown|renderer\/markdown\.js)|window\.ANSMarkdownUMD/.test(source), false);
});

test("B受限文档仍静态呈现：原文可读且不建立图片脚本或本地文件资源", () => {
  const documentText = [
    "# 文档正文",
    "",
    "可读的第一段。",
    "",
    "<script>alert('x')</script>",
    "<iframe src=\"file:///etc/passwd\"></iframe>",
    "![本地图](file:///etc/passwd)",
    "[外链](https://example.com/doc)",
  ].join("\n");
  const html = renderMarkdown(documentText);
  assert.match(html, /文档正文/);
  assert.match(html, /可读的第一段/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;iframe/);
  assert.equal(/<script|<iframe|<img/i.test(html), false);
  assert.equal(/file:\/\//i.test(html), true); // 仅作为转义文本可见，不是可加载资源。
  assert.equal(html.includes('href="https://example.com/doc"'), true);
});

test("esc 仍是新渲染器唯一转义来源：五个字符全覆盖且幂等输入不变", () => {
  assert.equal(esc(`& < > " '`), "&amp; &lt; &gt; &quot; '");
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc(42), "42");
});

function fakeAnchor(href: string, inDocument = false) {
  const attrs: Record<string, string> = { href };
  const anchor: {
    attrs: Record<string, string>;
    closest: (selector: string) => unknown;
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
  } = {
    attrs,
    closest(selector: string) {
      if (selector === "a.md-link") return anchor;
      if (selector === "#document-read-text") return inDocument ? { id: "document-read-text" } : null;
      return null;
    },
    getAttribute(name) {
      return attrs[name] ?? null;
    },
    setAttribute(name, value) {
      attrs[name] = value;
    },
  };
  return anchor;
}

function clickEvent(anchor: ReturnType<typeof fakeAnchor>) {
  const calls = { prevented: 0, stopped: 0 };
  return {
    calls,
    event: {
      target: anchor as unknown as EventTarget,
      preventDefault: () => {
        calls.prevented += 1;
      },
      stopPropagation: () => {
        calls.stopped += 1;
      },
    },
  };
}

test("链接动作白名单：仅 http/https 外部；相对/锚点/mailto/javascript/file 均不外开", () => {
  assert.equal(markdownLinkAction("https://example.com/x"), "external");
  assert.equal(markdownLinkAction("HTTP://example.com"), "external");
  assert.equal(markdownLinkAction("http://example.com"), "external");
  for (const href of ["#section", "/relative/path", "../doc.md", "mailto:a@b.c", "javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", ""]) {
    assert.equal(markdownLinkAction(href), "none", href);
  }
});

test("外链点击：preventDefault + stopPropagation，openExternal 收到 URL，不导航窗口", async () => {
  const anchor = fakeAnchor("https://example.com/x");
  const { event, calls } = clickEvent(anchor);
  const opened: string[] = [];
  const outcome = handleMarkdownLinkClick(event, () => ({
    openExternal: async (url: string) => {
      opened.push(url);
      return { ok: true };
    },
  }));
  assert.equal(outcome, "requested");
  assert.equal(calls.prevented, 1);
  assert.equal(calls.stopped, 1);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(opened, ["https://example.com/x"]);
  assert.equal(anchor.attrs["data-open-result"], "opened");
});

test("外链通道缺失/失败/同步异常：不导航、不假成功，失败状态如实", async () => {
  const missing = fakeAnchor("https://example.com/missing");
  const missingEvent = clickEvent(missing);
  assert.equal(
    handleMarkdownLinkClick(missingEvent.event, () => null),
    "unavailable",
  );
  assert.equal(missingEvent.calls.prevented, 1);
  assert.equal(missing.attrs["data-open-result"], "unavailable");
  assert.match(missing.attrs.title, /未提供外部打开通道/);

  const failed = fakeAnchor("https://example.com/fail");
  assert.equal(
    handleMarkdownLinkClick(clickEvent(failed).event, () => ({
      openExternal: async () => ({ ok: false, error: "离线拒绝" }),
    })),
    "requested",
  );
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(failed.attrs["data-open-result"], "failed");
  assert.match(failed.attrs.title, /离线拒绝/);

  const thrown = fakeAnchor("https://example.com/throw");
  assert.doesNotThrow(() =>
    handleMarkdownLinkClick(clickEvent(thrown).event, () => ({
      openExternal: () => {
        throw new Error("bridge down");
      },
    })),
  );
  assert.equal(thrown.attrs["data-open-result"], "failed");
});

test("相对/锚点链接仍被拦截：preventDefault，但不调用 openExternal、不导航", () => {
  for (const href of ["#anchor", "/relative", "mailto:a@b.c", "javascript:alert(1)"]) {
    const anchor = fakeAnchor(href);
    const { event, calls } = clickEvent(anchor);
    let opened = 0;
    assert.equal(
      handleMarkdownLinkClick(event, () => ({
        openExternal: async () => {
          opened += 1;
          return { ok: true };
        },
      })),
      "blocked",
      href,
    );
    assert.equal(calls.prevented, 1, href);
    assert.equal(calls.stopped, 1, href);
    assert.equal(opened, 0, href);
  }
});

test("文档阅读区交给 DocumentView：全局拦截不 preventDefault，保留内部/相对链接解析", () => {
  const anchor = fakeAnchor("https://example.com/doc", true);
  const { event, calls } = clickEvent(anchor);
  let opened = 0;
  assert.equal(
    handleMarkdownLinkClick(event, () => ({
      openExternal: async () => {
        opened += 1;
        return { ok: true };
      },
    })),
    "ignored",
  );
  assert.equal(calls.prevented, 0);
  assert.equal(calls.stopped, 0);
  assert.equal(opened, 0);
});

test("全局捕获监听可安装/卸载（应用只安装一次；测试可清理）", () => {
  const listeners: Array<(event: unknown) => void> = [];
  const doc = {
    addEventListener: (_type: string, listener: (event: unknown) => void) => listeners.push(listener),
    removeEventListener: (_type: string, listener: (event: unknown) => void) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
  } as unknown as Document;
  const uninstall = installMarkdownLinkHandler(doc, () => null);
  assert.equal(listeners.length, 1);
  const anchor = fakeAnchor("https://example.com/installed");
  const { event, calls } = clickEvent(anchor);
  listeners[0](event);
  assert.equal(calls.prevented, 1);
  assert.equal(anchor.attrs["data-open-result"], "unavailable");
  uninstall();
  assert.equal(listeners.length, 0);
});
