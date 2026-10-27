// test/桌面UI/view-image-preview.test.ts
// 2026-10-27 客户要求：聊天流显示角色查看的图片（view_image 缩略图）。
// 纯逻辑：项目相对路径安全判定 + file URL 构造；不启动 DOM、不接触文件系统。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isSafeProjectImagePath,
  viewImagePreviewUrl,
} from "../../app/renderer/src/chat/view-image-preview.ts";

const CHAT_ROW_SOURCE = readFileSync(
  fileURLToPath(new URL("../../app/renderer/src/chat/ChatRow.tsx", import.meta.url)),
  "utf8",
);
const SHELL_CSS_SOURCE = readFileSync(
  fileURLToPath(new URL("../../app/renderer/src/shell/shell.css", import.meta.url)),
  "utf8",
);

test("isSafeProjectImagePath：接受项目相对图片路径（含 Windows 反斜杠与大小写扩展名）", () => {
  for (const path of [
    "docs/verification/pixel-snake/gate-vertical-slice/vs-ready.png",
    "docs\\evidence\\run\\ready.png",
    "docs/evidence/READY.PNG",
    "docs/evidence/photo.jpg",
    "docs/evidence/photo.jpeg",
    "docs/evidence/photo.webp",
    "docs/evidence/anim.gif",
    "a.png",
  ]) {
    assert.equal(isSafeProjectImagePath(path), true, path);
  }
});

test("isSafeProjectImagePath：拒绝绝对路径、盘符、UNC、协议与 ADS", () => {
  for (const path of [
    "/etc/secret.png",
    "\\server\\share\\secret.png",
    "C:/secret.png",
    "C:secret.png",
    "c:\\secret.png",
    "file:///C:/secret.png",
    "https://example.com/secret.png",
    "data:image/png;base64,AAAA.png",
    "docs/secret.png:stream",
    "docs/photo:stream.png",
  ]) {
    assert.equal(isSafeProjectImagePath(path), false, path);
  }
});

test("isSafeProjectImagePath：拒绝 `..`/`.`/空段/尾斜杠与 NUL/控制字符", () => {
  for (const path of [
    "docs/../secret.png",
    "..\\secret.png",
    "docs/./ready.png",
    "docs//ready.png",
    "docs/ready.png/",
    "docs/ready.png\u0000",
    "docs/\u0000ready.png",
    "docs/ready\n.png",
    "docs/ready\t.png",
  ]) {
    assert.equal(isSafeProjectImagePath(path), false, path);
  }
});

test("isSafeProjectImagePath：拒绝空值、非字符串与非图片扩展名", () => {
  for (const value of ["", "   ", null, undefined, 42, {}, ["a.png"]]) {
    assert.equal(isSafeProjectImagePath(value), false, String(value));
  }
  for (const path of [
    "docs/a.md",
    "docs/a.txt",
    "docs/a.png.exe",
    "docs/a.exe",
    "docs/a",
    "docs/a.svg",
    "docs/a.bmp",
  ]) {
    assert.equal(isSafeProjectImagePath(path), false, path);
  }
});

test("viewImagePreviewUrl：Windows 盘符项目根拼出 file:///、反斜杠归一、尾斜杠容忍", () => {
  assert.equal(
    viewImagePreviewUrl(
      "C:\\Users\\51054\\Desktop\\work\\ans-studio",
      "docs/verification/pixel-snake/gate-vertical-slice/vs-ready.png",
    ),
    "file:///C:/Users/51054/Desktop/work/ans-studio/docs/verification/pixel-snake/gate-vertical-slice/vs-ready.png",
  );
  assert.equal(
    viewImagePreviewUrl("C:\\proj\\", "docs\\evidence\\run\\ready.png"),
    "file:///C:/proj/docs/evidence/run/ready.png",
  );
  assert.equal(
    viewImagePreviewUrl("C:\\", "docs/evidence/ready.png"),
    "file:///C:/docs/evidence/ready.png",
  );
});

test("viewImagePreviewUrl：POSIX 与 UNC 项目根", () => {
  assert.equal(
    viewImagePreviewUrl("/home/user/proj", "docs/evidence/ready.png"),
    "file:///home/user/proj/docs/evidence/ready.png",
  );
  assert.equal(
    viewImagePreviewUrl("\\\\server\\share", "docs/evidence/ready.png"),
    "file://server/share/docs/evidence/ready.png",
  );
});

test("viewImagePreviewUrl：项目根缺失/非绝对/空串返回 null", () => {
  assert.equal(viewImagePreviewUrl(null, "docs/ready.png"), null);
  assert.equal(viewImagePreviewUrl("", "docs/ready.png"), null);
  assert.equal(viewImagePreviewUrl("   ", "docs/ready.png"), null);
  assert.equal(viewImagePreviewUrl("relative/proj", "docs/ready.png"), null);
  assert.equal(viewImagePreviewUrl("./proj", "docs/ready.png"), null);
});

test("viewImagePreviewUrl：target 非法/非图片/空串返回 null（不构造 file URL）", () => {
  const root = "C:\\proj";
  for (const target of [
    "",
    "/etc/secret.png",
    "C:/secret.png",
    "..\\secret.png",
    "docs/../secret.png",
    "docs/secret.png\u0000",
    "docs/secret.md",
    "docs/secret.png:stream",
  ]) {
    assert.equal(viewImagePreviewUrl(root, target), null, target);
  }
});

test("viewImagePreviewUrl：空段/点段/协议形式不因工具 target 而放行", () => {
  const root = "/home/user/proj";
  for (const target of [
    "docs//ready.png",
    "docs/./ready.png",
    "file:///etc/ready.png",
    "https://example.com/ready.png",
  ]) {
    assert.equal(viewImagePreviewUrl(root, target), null, target);
  }
});

test("viewImagePreviewUrl：空格/中文/`#`/`?`/`%` 逐段百分号编码", () => {
  assert.equal(
    viewImagePreviewUrl("C:\\项目 根", "docs/证据 图.png"),
    "file:///C:/%E9%A1%B9%E7%9B%AE%20%E6%A0%B9/docs/%E8%AF%81%E6%8D%AE%20%E5%9B%BE.png",
  );
  assert.equal(
    viewImagePreviewUrl("C:\\proj", "docs/a#b?.png"),
    "file:///C:/proj/docs/a%23b%3F.png",
  );
  assert.equal(
    viewImagePreviewUrl("C:\\proj", "docs/100%.png"),
    "file:///C:/proj/docs/100%25.png",
  );
  const url = viewImagePreviewUrl("C:\\Program Files\\proj", "docs/ready.png");
  assert.equal(url, "file:///C:/Program%20Files/proj/docs/ready.png");
  assert.equal(url?.includes("\\"), false);
  assert.equal(url?.includes(" "), false);
});

/**
 * 渲染接线守卫（2026-10-27 补）：真实历史回放的 view_image 行由 `.tool-call-record`
 * （ToolLifecycleRow）呈现；工具组兜底路径由 ActivityRow 呈现。两条路径都必须在
 * `<details>` / 活动行之外挂 ViewImagePreview，且 `img` 自身带 `view-image-preview`
 * class（探针/e2e 可按 `img.view-image-preview` 定位）。
 */
test("ChatRow 接线：生命周期行在 <details> 外渲染缩略图，img 带 class/alt/lazy", () => {
  assert.match(
    CHAT_ROW_SOURCE,
    /<\/details>\s*\{[\s\S]{0,400}?toolName === "view_image"[\s\S]{0,400}?<ViewImagePreview/,
    "生命周期行的缩略图必须在 </details> 之后、且仅对 view_image 渲染",
  );
  assert.match(CHAT_ROW_SOURCE, /!failed && activity\.denied !== true/);
  assert.match(
    CHAT_ROW_SOURCE,
    /<img\s+className="view-image-preview"\s+src=\{src\}\s+alt=\{target\}\s+loading="lazy"/,
    "缩略图 img 必须带 view-image-preview class、alt=路径与 loading=lazy",
  );
  assert.match(CHAT_ROW_SOURCE, /isSafeProjectImagePath\(target\)/);
  assert.match(CHAT_ROW_SOURCE, /viewImagePreviewUrl\(projectRoot, target\)/);
});

test("ChatRow 接线：ActivityRow 兜底路径同样渲染 view_image 缩略图并拿到 projectRoot", () => {
  assert.match(
    CHAT_ROW_SOURCE,
    /const projectRoot = useChatStore\(\(s\) => s\.projectRoot\)/,
    "工具行必须从 chat store 取 projectRoot",
  );
  assert.match(CHAT_ROW_SOURCE, /view\.toolName === "view_image"/);
  assert.match(CHAT_ROW_SOURCE, /previewable/);
  assert.match(
    CHAT_ROW_SOURCE,
    /<ViewImagePreview roleId=\{roleId\} projectRoot=\{projectRoot\} target=\{view\.target\}/,
  );
  assert.match(
    CHAT_ROW_SOURCE,
    /<ActivityRow[\s\S]{0,260}?roleId=\{roleId\}[\s\S]{0,160}?projectRoot=\{projectRoot\}/,
    "ActivityRow 调用点必须传 roleId/projectRoot",
  );
  assert.match(
    CHAT_ROW_SOURCE,
    /<ViewImagePreview roleId=\{roleId\} projectRoot=\{projectRoot\} target=\{rawTarget\}/,
    "生命周期行同样传 roleId/projectRoot/rawTarget",
  );
});

test("CSS：缩略图边框/像素化/最大尺寸/contain 钩子存在", () => {
  for (const pattern of [
    /img\.view-image-preview/,
    /image-rendering:\s*pixelated/,
    /max-height:\s*240px/,
    /max-width:\s*min\(420px/,
    /object-fit:\s*contain/,
    /border:\s*1px solid var\(--border\)/,
  ]) {
    assert.match(SHELL_CSS_SOURCE, pattern);
  }
});

/**
 * 2026-10-27 客户反馈「选中多了一层绿色的框」：缩略图按钮 focus-visible 的绿色焦点环
 * 与 focus-visible 下图片边框染绿叠加成两层。守卫：任何状态最多一层绿色指示——
 * 键盘聚焦只留贴合图片的焦点环；悬停边框高亮只在未 focus-visible 时生效。
 */
test("CSS：缩略图聚焦/悬停最多一层绿色指示（聚焦时只留焦点环，不再染绿边框）", () => {
  assert.match(
    SHELL_CSS_SOURCE,
    /\.view-image-preview-trigger:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ring\)/s,
    "键盘聚焦必须保留贴合图片的 2px 焦点环",
  );
  assert.match(
    SHELL_CSS_SOURCE,
    /\.view-image-preview-trigger:hover:not\(:focus-visible\) img\.view-image-preview\s*\{[^}]*border-color:\s*var\(--primary\)/s,
    "悬停边框高亮必须保留，且只在未 focus-visible 时生效",
  );
  assert.equal(
    /\.view-image-preview-trigger:focus-visible\s+img\.view-image-preview/.test(SHELL_CSS_SOURCE),
    false,
    "focus-visible 不得再给图片边框染绿（两层绿框的来源）",
  );
});
