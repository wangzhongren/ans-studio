// test/桌面UI/view-image-lightbox.test.ts
// 2026-10-27 客户追加：view_image 缩略图点击后在应用内放大（lightbox）。
// 纯状态/关闭键可单测；DOM 行为（portal/焦点/Esc）用源码接线守卫锁定，
// 真实点击/截图由主上下文在 Electron 内核验。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isLightboxCloseKey,
  useViewImageLightbox,
} from "../../app/renderer/src/chat/view-image-lightbox.ts";

const CHAT_ROW_SOURCE = readFileSync(
  fileURLToPath(new URL("../../app/renderer/src/chat/ChatRow.tsx", import.meta.url)),
  "utf8",
);
const LIGHTBOX_SOURCE = readFileSync(
  fileURLToPath(new URL("../../app/renderer/src/chat/ViewImageLightbox.tsx", import.meta.url)),
  "utf8",
);
const CHAT_STREAM_SOURCE = readFileSync(
  fileURLToPath(new URL("../../app/renderer/src/chat/ChatStream.tsx", import.meta.url)),
  "utf8",
);
const SHELL_CSS_SOURCE = readFileSync(
  fileURLToPath(new URL("../../app/renderer/src/shell/shell.css", import.meta.url)),
  "utf8",
);

const reset = () => useViewImageLightbox.setState({ item: null });

test("放大层单例：打开一个后打开第二个即替换（同一时刻只开一个）", () => {
  reset();
  const first = { src: "file:///C:/p/a.png", target: "docs/a.png", ownerId: "o1" };
  const second = { src: "file:///C:/p/b.png", target: "docs/b.png", ownerId: "o2" };
  useViewImageLightbox.getState().open(first);
  assert.deepEqual(useViewImageLightbox.getState().item, first);
  useViewImageLightbox.getState().open(second);
  assert.deepEqual(useViewImageLightbox.getState().item, second);
  reset();
});

test("关闭：无 owner 无条件关闭；带 owner 只关闭自己的弹层", () => {
  reset();
  const item = { src: "file:///C:/p/a.png", target: "docs/a.png", ownerId: "row-1" };
  useViewImageLightbox.getState().open(item);
  useViewImageLightbox.getState().close("other-row");
  assert.deepEqual(useViewImageLightbox.getState().item, item, "其他行卸载不得误关");
  useViewImageLightbox.getState().close("row-1");
  assert.equal(useViewImageLightbox.getState().item, null);
  useViewImageLightbox.getState().open(item);
  useViewImageLightbox.getState().close();
  assert.equal(useViewImageLightbox.getState().item, null);
  reset();
});

test("打开：非法载荷（空 URL/路径/owner、非字符串、null）一律忽略", () => {
  reset();
  const item = { src: "file:///C:/p/a.png", target: "docs/a.png", ownerId: "row-1" };
  useViewImageLightbox.getState().open(item);
  const invalid: unknown[] = [
    { src: "", target: "docs/a.png", ownerId: "row-1" },
    { src: "file:///C:/p/a.png", target: "", ownerId: "row-1" },
    { src: "file:///C:/p/a.png", target: "docs/a.png", ownerId: "" },
    { src: 1, target: "docs/a.png", ownerId: "row-1" },
    { src: "file:///C:/p/a.png", target: 2, ownerId: "row-1" },
    { src: "https://example.com/a.png", target: "docs/a.png", ownerId: "row-1" },
    { src: "data:image/png;base64,AAAA", target: "docs/a.png", ownerId: "row-1" },
    null,
    "file:///C:/p/a.png",
  ];
  for (const value of invalid) {
    useViewImageLightbox.getState().open(value as never);
    assert.deepEqual(useViewImageLightbox.getState().item, item, JSON.stringify(value));
  }
  reset();
});

test("Esc 关闭键：只认未处理的 Escape（Esc/Enter/已处理/空值不关）", () => {
  assert.equal(isLightboxCloseKey({ key: "Escape" }), true);
  for (const event of [
    { key: "Esc" },
    { key: "Enter" },
    { key: "Escape", defaultPrevented: true },
    {},
    null,
    undefined,
  ]) {
    assert.equal(isLightboxCloseKey(event as never), false, JSON.stringify(event));
  }
});

test("缩略图接线：可点击按钮（非 <a href>），点击打开单例放大层，卸载关闭自己的弹层", () => {
  assert.match(
    CHAT_ROW_SOURCE,
    /<button\s+type="button"\s+className="view-image-preview-trigger"\s+aria-label=\{t\("ui\.viewImage\.openPreview", \{ path: target \}\)\}\s+aria-haspopup="dialog"/,
    "缩略图必须是 button + aria-label + aria-haspopup=dialog",
  );
  assert.match(
    CHAT_ROW_SOURCE,
    /useViewImageLightbox\.getState\(\)\.open\(\{ src, target, ownerId \}\)/,
  );
  assert.match(
    CHAT_ROW_SOURCE,
    /useViewImageLightbox\.getState\(\)\.close\(ownerId\)/,
    "缩略图卸载时必须关闭自己的放大层",
  );
  assert.equal(/<a\s[^>]*href=/.test(CHAT_ROW_SOURCE), false, "不得用 <a href> 导航");
});

test("放大层组件：portal 到 body、dialog/aria-modal、Esc/遮罩关闭、焦点归还", () => {
  assert.match(LIGHTBOX_SOURCE, /createPortal\(/);
  assert.match(LIGHTBOX_SOURCE, /document\.body/);
  assert.match(LIGHTBOX_SOURCE, /role="dialog"/);
  assert.match(LIGHTBOX_SOURCE, /aria-modal="true"/);
  assert.match(LIGHTBOX_SOURCE, /aria-label=\{t\("ui\.viewImage\.lightboxLabel", \{ path: item\.target \}\)\}/);
  assert.match(LIGHTBOX_SOURCE, /isLightboxCloseKey\(event\)/);
  assert.match(LIGHTBOX_SOURCE, /document\.addEventListener\("keydown", onKeyDown, true\)/);
  assert.match(LIGHTBOX_SOURCE, /event\.target === event\.currentTarget/);
  assert.match(LIGHTBOX_SOURCE, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(LIGHTBOX_SOURCE, /returnFocusRef/);
  assert.match(LIGHTBOX_SOURCE, /target\?\.focus\(\)/);
  assert.match(LIGHTBOX_SOURCE, /t\("shared\.common\.close"\)/);
  for (const forbidden of [/window\.open/, /location\./, /href=/, /openExternal/, /window\.desktop/]) {
    assert.equal(forbidden.test(LIGHTBOX_SOURCE), false, String(forbidden));
  }
});

test("聊天流接线：挂载唯一放大层，切换角色/项目时关闭", () => {
  assert.equal(
    (CHAT_STREAM_SOURCE.match(/<ViewImageLightbox \/>/g) || []).length,
    1,
    "ChatStream 只挂载一个放大层",
  );
  assert.match(
    CHAT_STREAM_SOURCE,
    /useViewImageLightbox\.getState\(\)\.close\(\);\s*\}, \[selectedRoleId, projectRoot\]\)/,
  );
});

test("CSS：遮罩固定层/90vw×80vh 大图/像素化 contain/可点击视觉", () => {
  for (const pattern of [
    /\.view-image-lightbox\s*\{[^}]*position:\s*fixed/s,
    /\.view-image-lightbox\s*\{[^}]*z-index:\s*80/s,
    /\.view-image-lightbox\s*\{[^}]*background:\s*var\(--backdrop-strong\)/s,
    /\.view-image-lightbox-image\s*\{[^}]*max-width:\s*calc\(90vw - 26px\)/s,
    /\.view-image-lightbox-image\s*\{[^}]*max-height:\s*calc\(80vh - 60px\)/s,
    /\.view-image-lightbox-image\s*\{[^}]*image-rendering:\s*pixelated/s,
    /\.view-image-lightbox-image\s*\{[^}]*object-fit:\s*contain/s,
    /\.view-image-preview-trigger\s*\{[^}]*cursor:\s*zoom-in/s,
    /\.view-image-preview-trigger:focus-visible/,
  ]) {
    assert.match(SHELL_CSS_SOURCE, pattern);
  }
});
