// test/桌面UI/source-guard.test.ts
// Phase 5A 迁移：旧 renderer.test.ts 中「源码/边界/唯一来源/不许回潮」类守卫。
// 只读源码，不启动 DOM；替代旧 renderer.js/styles.css/vendor 子串守卫（逐项见迁移台账）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RENDERER = join(ROOT, "app", "renderer", "src");

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

const sourceFiles = walk(RENDERER).filter((file) => /\.(ts|tsx)$/.test(file));
const read = (file: string) => readFileSync(file, "utf8");
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const rel = (file: string) => relative(ROOT, file).replaceAll("\\", "/");
const find = (suffix: string) => sourceFiles.filter((file) => file.endsWith(suffix));

test("渲染器边界：只用 window.desktop 访问层；不 import Node/Electron/fs，不 require/网络", () => {
  for (const file of sourceFiles) {
    const source = codeOnly(read(file));
    assert.equal(
      /from\s+["'](node:|electron["']|fs["']|path["']|child_process["']|https?["'])/.test(source),
      false,
      rel(file) + " imports privileged module",
    );
    assert.equal(/\brequire\s*\(/.test(source), false, rel(file) + " uses require()");
    assert.equal(/window\.require\b/.test(source), false, rel(file) + " uses window.require");
    assert.equal(/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/.test(source), false, rel(file) + " uses network");
    // window.desktop 只允许经 lib/platform 访问；其他文件不得直接触碰。
    if (!rel(file).endsWith("lib/platform.ts")) {
      assert.equal(/window\.desktop\b/.test(source), false, rel(file) + " bypasses platform bridge");
    }
  }
});

test("CSP 与静态入口：默认拒绝、无内联脚本/事件处理器、唯一 module 入口", () => {
  const html = read(join(ROOT, "app", "renderer", "index.html"));
  assert.equal(
    html.includes(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;",
    ),
    true,
  );
  assert.equal(/<script(?![^>]*\bsrc=)/i.test(html), false);
  assert.equal(/<style[^>]*>/i.test(html), false);
  assert.equal(/\son(load|error|click|mouseover)\s*=/i.test(html), false);
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.match(html, /<script type="module" src="\/src\/main\.tsx"><\/script>/);
});

test("Markdown 单一管线：只有 markdown.ts 定义 esc / 依赖 markdown-it；所有 HTML 注入都过受控渲染", () => {
  const escDefs = sourceFiles.filter((file) =>
    /export function esc\s*\(|function esc\s*\(/.test(read(file)),
  );
  assert.deepEqual(escDefs.map(rel), ["app/renderer/src/chat/markdown.ts"]);
  const mdImports = sourceFiles.filter((file) => /from\s+["']markdown-it["']/.test(read(file)));
  assert.deepEqual(mdImports.map(rel), ["app/renderer/src/chat/markdown.ts"]);
  // 5A：外链点击必须由 Markdown 单一管线在 document 捕获并 preventDefault + openExternal。
  const markdownSource = read(join(RENDERER, "chat", "markdown.ts"));
  assert.match(markdownSource, /installMarkdownLinkHandler\(document\)/);
  assert.match(markdownSource, /a\.md-link/);
  assert.match(markdownSource, /preventDefault\(\)/);
  assert.match(markdownSource, /openExternal/);
  assert.match(markdownSource, /app:open-external|openExternal\(href\)/);
  const injectors = sourceFiles.filter((file) => read(file).includes("dangerouslySetInnerHTML"));
  assert.ok(injectors.length > 0);
  for (const file of injectors) {
    const source = read(file);
    const lines = source.split("\n").filter((line) => line.includes("dangerouslySetInnerHTML"));
    for (const line of lines) {
      assert.match(
        line,
        /markdownHtml\(|renderMarkdown\(|renderDocumentMarkdown\(/,
        rel(file) + " injects non-Markdown HTML",
      );
    }
    assert.equal(/\.innerHTML\s*=/.test(source), false, rel(file) + " assigns innerHTML");
  }
  // 旧 vendor / 旧脚本不得被新渲染器 import（注释中的历史说明不算）。
  for (const file of sourceFiles) {
    assert.equal(
      /from\s+["'][^"']*(vendor\/|renderer\.js|role-status\.js|tool-rows\.js|ui-labels\.js|runtime-ui\.js|engine-selector\.js)/.test(
        read(file),
      ),
      false,
      rel(file) + " imports old renderer module",
    );
  }
});

test("品牌图标：标题栏与左栏使用 ans-studio 图标 img alt=ANS，保留 AGENT WORKSPACE", () => {
  const title = read(join(RENDERER, "shell", "TitleBar.tsx"));
  const sidebar = read(join(RENDERER, "shell", "Sidebar.tsx"));
  assert.match(title, /from\s+"@\/assets\/ans-studio-ans-icon\.png"/);
  assert.match(title, /<img\s+className="titlebar-mark"[^>]*alt="ANS"/);
  assert.equal(/<span className="titlebar-mark">ANS<\/span>/.test(title), false);
  assert.match(sidebar, /from\s+"@\/assets\/ans-studio-ans-icon\.png"/);
  assert.match(sidebar, /<img[\s\S]*className="workspace-brand-mark"[\s\S]*alt="ANS"/);
  assert.match(sidebar, /AGENT WORKSPACE/);
});

test("Sidebar 身份：主入口/内置只在 class/data/aria/title；不渲染 ti-badge 第三行；ti-count 唯一数字徽标", () => {
  const sidebar = read(join(RENDERER, "shell", "Sidebar.tsx"));
  assert.equal(sidebar.includes('"ti-badge"'), false);
  assert.equal(sidebar.includes("ti-badge"), false);
  assert.match(sidebar, /data-primary=\{primary \? "true" : undefined\}/);
  assert.match(sidebar, /data-builtin=\{role\.builtIn \? "true" : undefined\}/);
  assert.match(sidebar, /aria-description=\{description \|\| undefined\}/);
  assert.match(sidebar, /className="ti-count"/);
  assert.equal((sidebar.match(/className="ti-count"/g) || []).length, 1);
  assert.match(sidebar, /pendingKindFor/);
  assert.match(sidebar, /statusLabel/);
  // 状态标签不带数量（数量只由 ti-count 承担）。
  assert.equal(/statusBadge\(status,\s*[1-9]/.test(sidebar), false);
});

// i18n B0：语言偏好允许 `localStorage["ans.locale"]` 作为首屏镜像（方案 §4.6/§4.7）；
// 允许集仍是精确白名单，其余文件不得借道 localStorage 持久化。
const LOCAL_STORAGE_ALLOWED = [
  "app/renderer/src/stores/ui-store.ts",
  "app/renderer/src/i18n/locale-store.ts",
];

test("治理/报告事实不持久化：localStorage 仅左栏偏好与语言镜像；无 indexedDB/sessionStorage", () => {
  for (const file of sourceFiles) {
    const source = read(file);
    assert.equal(/\bindexedDB\b|\bsessionStorage\b/.test(source), false, rel(file));
    if (/\blocalStorage\b/.test(source) && !source.includes("不写 localStorage")) {
      assert.ok(
        LOCAL_STORAGE_ALLOWED.includes(rel(file)),
        rel(file) + " persists beyond sidebar preferences and the i18n locale mirror",
      );
    }
  }
  // 语言镜像只允许 `ans.locale` 一个键，且不得借用左栏偏好键。
  const localeStoreSource = read(join(RENDERER, "i18n", "locale-store.ts"));
  assert.match(localeStoreSource, /LOCALE_STORAGE_KEY = "ans\.locale"/);
  assert.equal(/ans\.sidebar\./.test(localeStoreSource), false);
  const ui = read(join(RENDERER, "stores", "ui-store.ts"));
  assert.match(ui, /SIDEBAR_WIDTH_STORAGE_KEY = "ans\.sidebar\.width"/);
  assert.match(ui, /SIDEBAR_COLLAPSED_STORAGE_KEY = "ans\.sidebar\.collapsed"/);
  for (const file of [
    "stores/governance-store.ts",
    "stores/report-store.ts",
    "chat/chat-store.ts",
    "chat/ipc.ts",
  ]) {
    const source = read(join(RENDERER, file));
    assert.equal(/localStorage|indexedDB|sessionStorage/.test(source.replace(/不写 localStorage/g, "")), false, file);
  }
});

test("阅读锚点：纯模块无定时器/动画；full replay 先记录后重建；VirtualPane 布局后按 delta 还原", () => {
  const anchor = read(join(RENDERER, "chat", "reading-anchor.ts"));
  assert.equal(/setTimeout|setInterval|requestAnimationFrame|behavior\s*:\s*["']smooth|\.animate\(/.test(anchor), false);
  assert.match(anchor, /readingAnchorFromRows/);
  assert.match(anchor, /restoredScrollTop/);
  const store = read(join(RENDERER, "chat", "chat-store.ts"));
  const capture = store.indexOf("captureReadingAnchor(roleId)");
  const clear = store.indexOf("model.clear();", capture);
  assert.ok(capture > 0 && clear > capture, "capture must precede model.clear()");
  const pane = read(join(RENDERER, "chat", "VirtualPane.tsx"));
  assert.match(pane, /takeReadingAnchor\(roleId\)/);
  assert.match(pane, /chat\.scrollTop = next/);
  assert.equal(/scrollTo\(\{[^}]*behavior/.test(pane), false);
});

test("i18n B4：runtime 显示名经 facade 共享 key；不导入 runtime-shared（node 依赖）", () => {
  const source = codeOnly(read(join(RENDERER, "chat", "runtime-config.ts")));
  // 共享 `runtime-shared.ts` 顶层 import node:os/node:path，渲染层只能经 facade 用同一 key。
  assert.equal(
    /from\s+["'][^"']*runtime-shared/.test(source),
    false,
    "runtime-config imports runtime-shared",
  );
  assert.equal(
    /from\s+["'][^"']*shared\/runtime-/.test(source),
    false,
    "runtime-config imports shared runtime modules",
  );
  assert.match(source, /from\s+"(@\/i18n|\.\.\/i18n\/index\.ts)"/);
  assert.match(source, /RUNTIME_LABEL_KEYS/);
  assert.match(source, /shared\.runtimeSettings\.runtime\.demo/);
  // demo 在本地映射里是语言中性值，用户可见中文只存在共享目录。
  assert.match(source, /demo:\s*"demo"/);
  assert.equal(/["']演示["']/.test(source), false, "demo Chinese literal");
});

test("视觉/组件单一来源：状态转轮只用 lucide LoaderCircle；无自绘 SVG；无第二 UI 库", () => {
  for (const file of sourceFiles) {
    const source = read(file);
    assert.equal(/<svg\b|createElementNS/.test(source), false, rel(file) + " hand-draws SVG");
    assert.equal(
      /from\s+["'](antd|@mui\/|@chakra-ui\/|bootstrap|semantic-ui-react)/.test(source),
      false,
      rel(file) + " adds a second UI library",
    );
  }
  const sidebar = read(join(RENDERER, "shell", "Sidebar.tsx"));
  assert.match(sidebar, /BusySpinner/);
  const busy = read(join(RENDERER, "chat", "BusySpinner.tsx"));
  assert.equal((codeOnly(busy).match(/LoaderCircle/g) || []).length, 2); // import + JSX
  assert.match(busy, /from "motion\/react"/);
  assert.match(busy, /duration: 0\.9/);
  assert.match(busy, /prefers-reduced-motion/);
  const phase4b = read(join(RENDERER, "shell", "phase4b.css"));
  assert.equal(/@keyframes\s+v3spin/.test(phase4b), false, "CSS keyframes must not be used for the spinner");
  assert.equal(/\.status-spinner\s+svg\s*\{[^}]*width:\s*12px/.test(phase4b), true);
  const css =
    read(join(RENDERER, "shell", "shell.css")) +
    read(join(RENDERER, "shell", "phase4a.css")) +
    phase4b;
  assert.equal(/\.ti-count\s*\{/.test(css), true);
});

test("治理状态行：警告详情走可换行 gov-detail；chip 可收缩换行不撑破状态行", () => {
  const panel = read(join(RENDERER, "shell", "GovernancePanel.tsx"));
  // 异常态与正常态共用同一语义：核心文本进 chip，流程/下一步统一进 detail。
  assert.equal(panel.includes('statusChip + " · " + nextStep'), false, "warn nextStep must not be concatenated into chip");
  assert.match(panel, /statusChip = core;/);
  assert.match(panel, /statusDetail = nextStep;/);
  // 窄屏单行裁剪时仍能通过 title 拿到完整文案。
  assert.match(panel, /title=\{statusVisible \? statusText : undefined\}/);

  const css = read(join(RENDERER, "shell", "phase4b.css"));
  const chipBlock = css.match(/\.gov-chip\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.ok(chipBlock.length > 0, ".gov-chip base rule missing");
  assert.equal(/(^|\n)\s*flex:\s*0\s+0\s+auto/.test(chipBlock), false, "chip must not be fixed-size");
  assert.match(chipBlock, /flex:\s*0\s+1\s+auto/);
  assert.match(chipBlock, /min-width:\s*0/);
  assert.match(chipBlock, /white-space:\s*normal/);
  assert.match(chipBlock, /overflow-wrap:\s*anywhere/);
  // 480 极窄档保持单行紧凑：chip/detail 仍 nowrap + hidden。
  const narrow = css.slice(css.indexOf("@media (max-width: 480px)"));
  assert.match(narrow, /\.governance-status \.gov-chip,\s*\n\s*\.governance-status \.gov-detail\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(narrow, /\.governance-status \.gov-chip,[\s\S]{0,200}?overflow:\s*hidden/);
});

test("配置与依赖：markdown-it 由 npm 提供且版本 15.0.3；渲染器无第二个 Markdown 实现", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const version = pkg.dependencies?.["markdown-it"] || pkg.devDependencies?.["markdown-it"];
  assert.equal(version, "15.0.3");
  for (const forbidden of ["marked", "remark", "showdown", "dompurify"]) {
    assert.equal(
      pkg.dependencies?.[forbidden] ?? pkg.devDependencies?.[forbidden],
      undefined,
      forbidden,
    );
  }
});
