/// <reference lib="dom" />
/**
 * 受控 Markdown 封装（Phase 3A；npm markdown-it 15.0.3）。
 *
 * 与旧 `app/renderer/markdown.js` 的安全配置逐项一致：
 * - `html:false`（原文 HTML 只以转义文本出现）；
 * - `validateLink` 只放行 http/https/mailto，叠加库默认拒绝表；
 * - 链接类 `md-link` + `rel="noopener noreferrer"`；
 * - 图片覆写为转义原文（不产 `<img>`，也不回落成链接）；
 * - 表格启用（单元格内 HTML 仍转义）；
 * - 围栏/缩进代码块用 `.md-pre`/`.md-lang`，内容经本文件唯一的 `esc`。
 * - `.md-link` 点击由本文件安装的捕获监听统一拦截：一律 preventDefault，不导航窗口；
 *   http/https 经 `window.desktop.openExternal` → 主进程 `app:open-external` 白名单外开；
 *   相对/锚点/非 http(s) 不导航；通道缺失不导航、不做假成功。
 *
 * 本文件是新渲染器**唯一**的 `esc` 来源；聊天行/系统行/工具详情一律从这里取用，
 * 不另写第二份转义。
 */

import MarkdownIt, {
  type MarkdownIt as MarkdownItInstance,
  type MarkdownItOptions,
} from "markdown-it";
import { getDesktopBridge, type DesktopBridge } from "../lib/platform.ts";
import {
  DEFAULT_LOCALE,
  translate,
  useLocaleStore,
  type Locale,
} from "../i18n/index.ts";

export function esc(value: unknown): string {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const OPTIONS: MarkdownItOptions = {
  html: false,
  xhtmlOut: false,
  breaks: true,
  linkify: false,
  typographer: false,
};

function configure(md: MarkdownItInstance): MarkdownItInstance {
  md.renderer.rules.image = (tokens: any[], idx: number) => {
    const token = tokens[idx];
    const alt = String(token.content || "");
    const src = String(token.attrGet("src") || "");
    return esc("![" + alt + "](" + src + ")");
  };

  const defaultValidate = md.validateLink.bind(md);
  md.validateLink = (url: string) =>
    /^(https?:\/\/|mailto:)/i.test(String(url)) && defaultValidate(url);

  md.renderer.rules.link_open = (
    tokens: any[],
    idx: number,
    options: any,
    _env: any,
    self: any,
  ) => {
    tokens[idx].attrSet("class", "md-link");
    tokens[idx].attrSet("rel", "noopener noreferrer");
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.fence = (tokens: any[], idx: number) => {
    const token = tokens[idx];
    const lang = String(token.info || "").trim().split(/\s+/)[0] || "";
    return (
      '<pre class="md-pre">' +
      (lang ? '<span class="md-lang">' + esc(lang) + "</span>" : "") +
      "<code>" +
      esc(String(token.content || "").replace(/\n$/, "")) +
      "</code></pre>"
    );
  };

  md.renderer.rules.code_block = (tokens: any[], idx: number) =>
    '<pre class="md-pre"><code>' +
    esc(String(tokens[idx].content || "").replace(/\n$/, "")) +
    "</code></pre>";

  return md;
}

export function createRenderer(overrides?: MarkdownItOptions): MarkdownItInstance {
  return configure(new MarkdownIt({ ...OPTIONS, ...(overrides || {}) }));
}

const defaultRenderer = createRenderer();

export function renderMarkdown(text: unknown): string {
  return defaultRenderer.render(String(text == null ? "" : text));
}

export type MarkdownLinkAction = "external" | "none";
export type MarkdownLinkOutcome = "ignored" | "blocked" | "unavailable" | "requested";

/** 主进程 `app:open-external` 的放行口径：只允许 http/https。 */
export function markdownLinkAction(href: unknown): MarkdownLinkAction {
  const url = String(href == null ? "" : href).trim();
  return /^https?:\/\//i.test(url) ? "external" : "none";
}

interface MarkdownLinkEventLike {
  target: EventTarget | null;
  preventDefault: () => void;
  stopPropagation: () => void;
}

/**
 * `.md-link` 点击处理（可注入 bridge 便于离线单测）：
 * - 文档阅读区 `#document-read-text` 由 DocumentView 自己解析相对/内部链接，这里不接管；
 * - 其余 `.md-link` 一律 preventDefault + stopPropagation，不导航窗口；
 * - 仅 http/https 调 openExternal；缺失/异常/`{ok:false}` 只记录失败状态，不导航、不假成功。
 */
export function handleMarkdownLinkClick(
  event: MarkdownLinkEventLike,
  getBridge: () => DesktopBridge | null = getDesktopBridge,
  locale: Locale = DEFAULT_LOCALE,
): MarkdownLinkOutcome {
  const target = event.target as Element | null;
  if (!target || typeof target.closest !== "function") return "ignored";
  const anchor = target.closest("a.md-link") as HTMLAnchorElement | null;
  if (!anchor) return "ignored";
  if (anchor.closest("#document-read-text")) return "ignored";
  event.preventDefault();
  event.stopPropagation();
  const href = (anchor.getAttribute("href") || "").trim();
  if (markdownLinkAction(href) !== "external") return "blocked";
  const setState = (state: string, title?: string) => {
    if (typeof anchor.setAttribute !== "function") return;
    anchor.setAttribute("data-open-result", state);
    if (title) anchor.setAttribute("title", title);
  };
  const bridge = getBridge();
  const openExternal = bridge?.openExternal;
  if (typeof openExternal !== "function") {
    setState("unavailable", translate(locale, "ui.markdown.externalUnavailable"));
    return "unavailable";
  }
  try {
    Promise.resolve(openExternal(href))
      .then((result) => {
        const record =
          result && typeof result === "object"
            ? (result as { ok?: unknown; error?: unknown })
            : {};
        if (record.ok === false) {
          setState(
            "failed",
            translate(locale, "ui.markdown.openFailed", {
              detail:
                typeof record.error === "string" && record.error
                  ? record.error
                  : translate(locale, "shared.common.unknownReason"),
            }),
          );
          return;
        }
        setState("opened");
      })
      .catch(() =>
        setState("failed", translate(locale, "ui.markdown.openFailedChannel")),
      );
  } catch {
    setState("failed", translate(locale, "ui.markdown.openFailedChannel"));
  }
  return "requested";
}

/** 安装全局捕获监听（应用启动一次；返回可用于测试的卸载函数）。 */
export function installMarkdownLinkHandler(
  doc: Document,
  getBridge: () => DesktopBridge | null = getDesktopBridge,
): () => void {
  const onClick = (event: MouseEvent) => {
    handleMarkdownLinkClick(
      event,
      getBridge,
      useLocaleStore.getState().locale,
    );
  };
  doc.addEventListener("click", onClick, true);
  return () => doc.removeEventListener("click", onClick, true);
}

if (typeof document !== "undefined") {
  installMarkdownLinkHandler(document);
}

export const markdownApi = {
  esc,
  renderMarkdown,
  options: OPTIONS,
  createRenderer,
  markdownLinkAction,
  handleMarkdownLinkClick,
  installMarkdownLinkHandler,
};

declare global {
  interface Window {
    ANSMarkdown?: typeof markdownApi;
  }
}

if (typeof window !== "undefined") {
  window.ANSMarkdown = markdownApi;
}
