import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLAUDE_IMAGE_MIME_TYPES,
  isClaudeImageMimeType,
  mapClaudeToolResultImages,
} from "../../src/common/claude-adapter/tool-result-images.ts";

// 白名单必须与 Claude 用户提示图片一致（session.ts prompt 校验同一常量）。
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const image = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({ type: "image", data: PNG, mimeType: "image/png", ...overrides });

test("MIME 白名单与 Claude 用户图片一致：png/jpeg/gif/webp", () => {
  assert.deepEqual([...CLAUDE_IMAGE_MIME_TYPES], ["image/png", "image/jpeg", "image/gif", "image/webp"]);
  for (const mime of ["image/png", "image/jpeg", "image/gif", "image/webp"]) assert.equal(isClaudeImageMimeType(mime), true);
  for (const mime of ["image/svg+xml", "image/avif", "IMAGE/PNG", "", undefined, null, 1]) assert.equal(isClaudeImageMimeType(mime), false);
});

test("ok + 图片：逐张映射为 MCP image 内容块，data 原引用不重编码", () => {
  const mapping = mapClaudeToolResultImages({ ok: true, images: [image(), image({ mimeType: "image/jpeg" })] });
  assert.equal(mapping.invalid, false);
  assert.equal(mapping.images.length, 2);
  assert.deepEqual(mapping.images[0], { type: "image", data: PNG, mimeType: "image/png" });
  // 原引用：字符串同一值（未经 base64 解码/重编码、未缩放）。
  assert.equal(mapping.images[0]!.data, PNG);
  assert.equal(mapping.images[1]!.mimeType, "image/jpeg");
});

test("无图/空图：不附图且不算非法", () => {
  assert.deepEqual(mapClaudeToolResultImages({ ok: true }), { images: [], invalid: false });
  assert.deepEqual(mapClaudeToolResultImages({ ok: true, images: [] }), { images: [], invalid: false });
});

test("ok:false 绝不附图，即使 images 意外非空", () => {
  const mapping = mapClaudeToolResultImages({ ok: false, images: [image()] });
  assert.deepEqual(mapping, { images: [], invalid: false });
});

test("非法载荷整批不交付：非数组 / 条目非对象 / type 非 image", () => {
  assert.deepEqual(mapClaudeToolResultImages({ ok: true, images: { 0: image() } }), { images: [], invalid: true });
  assert.deepEqual(mapClaudeToolResultImages({ ok: true, images: [null] }), { images: [], invalid: true });
  assert.deepEqual(mapClaudeToolResultImages({ ok: true, images: ["not-an-object"] }), { images: [], invalid: true });
  assert.deepEqual(mapClaudeToolResultImages({ ok: true, images: [image({ type: "text" })] }), { images: [], invalid: true });
  assert.deepEqual(mapClaudeToolResultImages({ ok: true, images: [image({ type: undefined })] }), { images: [], invalid: true });
});

test("非法载荷整批不交付：data 缺失/空/非字符串/非标准 base64", () => {
  for (const data of [undefined, "", 42, "not base64!", "AAAAA", "AA=A", PNG.slice(0, -1)]) {
    const mapping = mapClaudeToolResultImages({ ok: true, images: [image({ data })] });
    assert.deepEqual(mapping, { images: [], invalid: true }, `data=${String(data)}`);
  }
});

test("非法载荷整批不交付：MIME 非白名单", () => {
  for (const mimeType of [undefined, "image/svg+xml", "image/avif", "text/plain", ""]) {
    assert.deepEqual(mapClaudeToolResultImages({ ok: true, images: [image({ mimeType })] }), { images: [], invalid: true }, `mimeType=${String(mimeType)}`);
  }
});

test("混合批次：一条合法一条非法 ⇒ 整批零交付（不做部分交付）", () => {
  const mapping = mapClaudeToolResultImages({ ok: true, images: [image(), image({ mimeType: "image/svg+xml" })] });
  assert.deepEqual(mapping, { images: [], invalid: true });
});
