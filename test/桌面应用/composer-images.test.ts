// test/桌面应用/composer-images.test.ts
// 桌面窗口（K-2，2026-10-12）：输入区图片附件的**纯逻辑**与 Interface 校验——上限/类型（**内容为准**：
// 魔数嗅探，声明 mime/size 不可信）/失败如实；选图经注入的「主进程读文件」替身（渲染进程不碰文件）。
//
// 诚实边界（与实现同一登记）：图片**随消息送进模型**那一段**未接**（Pi适配器核实 SDK 中）——本层测试
// 只覆盖「收下与校验」，不涉及任何模型调用。

import test from "node:test";
import assert from "node:assert/strict";

import {
  ALLOWED_IMAGE_MIMES,
  MAX_IMAGE_BYTES,
  decodeImageBase64,
  mimeForFileName,
  sanitizeImageName,
  sniffImageMime,
  validateImage,
} from "../../app/desktop/composer-images.ts";
import { createDesktopInterface } from "../../app/desktop/interface.ts";

/** 1×1 透明 PNG（真图，魔数齐全）——接口级用例的真实字节。 */
const PNG_1X1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** 造一个「魔数 + 填充」的各格式最小缓冲（嗅探只看签名；不做完整解码——如实登记的边界）。 */
function magic(kind: "jpeg" | "gif" | "webp"): Buffer {
  const pad = Buffer.alloc(16, 1);
  if (kind === "jpeg") return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), pad]);
  if (kind === "gif") return Buffer.concat([Buffer.from("GIF89a", "latin1"), pad]);
  return Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP", "latin1"), pad]);
}

test("K-2 纯逻辑：类型白名单/命名 MIME；尺寸上限；base64 严格解码；**魔数嗅探以内容为准**", () => {
  assert.deepEqual([...ALLOWED_IMAGE_MIMES], ["image/png", "image/jpeg", "image/webp", "image/gif"]);
  assert.equal(mimeForFileName("a.PNG"), "image/png");
  assert.equal(mimeForFileName("a.jpeg"), "image/jpeg");
  assert.equal(mimeForFileName("a.webp"), "image/webp");
  assert.equal(mimeForFileName("a.gif"), "image/gif");
  assert.equal(mimeForFileName("a.txt"), null);

  assert.equal(validateImage("image/png", 10).ok, true);
  assert.equal(validateImage("text/plain", 10).ok, false, "非白名单类型拒");
  assert.equal(validateImage("image/png", MAX_IMAGE_BYTES + 1).ok, false, "超限拒");
  assert.equal(validateImage("image/png", 0).ok, false, "空内容拒");

  assert.equal(decodeImageBase64("").ok, false);
  assert.equal(decodeImageBase64("not base64!!!").ok, false);
  const ok = decodeImageBase64(PNG_1X1_B64);
  assert.equal(ok.ok, true);

  // 嗅探：真 PNG base64 → image/png；JPEG/GIF/WEBP 魔数 → 各自类型；非图片字节 → null（**扩展名不作数**）。
  assert.equal(sniffImageMime(Buffer.from(PNG_1X1_B64, "base64")), "image/png");
  assert.equal(sniffImageMime(magic("jpeg")), "image/jpeg");
  assert.equal(sniffImageMime(magic("gif")), "image/gif");
  assert.equal(sniffImageMime(magic("webp")), "image/webp");
  assert.equal(sniffImageMime(Buffer.from("hello, i am not an image at all", "utf8")), null);
  assert.equal(sanitizeImageName("../../etc/passwd\u0000.png"), ".._.._etc_passwd.png", "去路径分隔与控制字符（仅展示用）");
});

test("K-2 Interface（attachImage）：以**真实字节**判定——声明谎报也按内容；失败逐类如实", async () => {
  const iface = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {} });
  // 好图（声明还谎报为 text/plain——以内容为准 ⇒ 仍收下，且 mime 为嗅探值）。
  const good = await iface.attachImage({ name: "a.png", mime: "text/plain", dataBase64: PNG_1X1_B64 });
  assert.equal(good.ok, true);
  assert.equal(good.image!.mime, "image/png", "类型以**真实字节**嗅探为准（声明不可信）");
  assert.equal(good.image!.size, Buffer.from(PNG_1X1_B64, "base64").length);
  // 非图片内容（即便声明 image/png）。
  const fake = await iface.attachImage({ name: "fake.png", mime: "image/png", dataBase64: Buffer.from("not an image").toString("base64") });
  assert.equal(fake.ok, false);
  assert.ok(/不是受支持的图片/.test(fake.error || ""), "内容非图片 → 如实拒（扩展名不作数）");
  // 超限（真实字节 5MB+1）。
  const big = await iface.attachImage({ name: "big.png", mime: "image/png", dataBase64: Buffer.concat([Buffer.from(PNG_1X1_B64, "base64"), Buffer.alloc(MAX_IMAGE_BYTES)]).toString("base64") });
  assert.equal(big.ok, false);
  assert.ok(/过大/.test(big.error || ""), "超限 → 如实拒");
  // 非法 base64 / 空。
  assert.equal((await iface.attachImage({ dataBase64: "%%%" })).ok, false);
  assert.equal((await iface.attachImage({})).ok, false);
});

test("K-2 Interface（pickImage）：选图经注入替身（主进程读文件）；取消安静；失败/未接如实", async () => {
  // 未接线 → fail-closed（如实）。
  const bare = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {} });
  const unwired = await bare.pickImage();
  assert.equal(unwired.ok, false);
  assert.ok(/未接线/.test(unwired.error || ""));

  // 正常：替身返回真 PNG 字节（模拟主进程 dialog+fs 读）。
  const iface = createDesktopInterface({
    pickDirectory: async () => null,
    emitEvent: () => {},
    pickImageFileFn: async () => ({ name: "选中的图.png", dataBase64: PNG_1X1_B64 }),
  });
  const picked = await iface.pickImage();
  assert.equal(picked.ok, true);
  assert.equal(picked.image!.mime, "image/png");
  assert.equal(picked.image!.dataBase64, PNG_1X1_B64, "预览数据原样带回");
  assert.equal(picked.cancelled, undefined);

  // 取消（null）→ cancelled:true（不是失败）。
  const cancelledIface = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {}, pickImageFileFn: async () => null });
  const cancelled = await cancelledIface.pickImage();
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.cancelled, true);

  // 读取抛错 → 如实失败（不崩）。
  const throwIface = createDesktopInterface({
    pickDirectory: async () => null,
    emitEvent: () => {},
    pickImageFileFn: async () => {
      throw new Error("ENOENT");
    },
  });
  const failed = await throwIface.pickImage();
  assert.equal(failed.ok, false);
  assert.ok(/读取图片失败/.test(failed.error || ""));
});
