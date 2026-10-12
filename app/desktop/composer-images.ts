// app/desktop/composer-images.ts
// 桌面输入区的**图片附件**（K-2，2026-10-12）——校验与解码的**纯逻辑**（不依赖 electron；可在 node 下单测）。
//
// 边界（硬约束）：**渲染进程不碰文件系统**——选图走主进程的系统文件选择器（dialog + fs 读，见 main.ts），
// 粘贴/拖入的字节经 preload 白名单 IPC 交**本层校验**（渲染侧报的 name/mime/size 一律视为**不可信输入**：
// 以**解码后的真实字节数**为准）。
//
// 上限（设计 K-2 建议值，客户可改）：**≤5MB**；类型 **png / jpeg / webp / gif**。
// 「送进模型」那一段**未接**（Pi适配器正在核实 SDK 图片内容块支持）——本模块只做**收下并校验**，
// 不调用任何模型；接线点与「未接」的如实回报见 change 文档与 renderer 的提示行。

/** 单张图片上限（字节）。 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** 允许的图片 MIME（与文件选择器扩展名过滤同一口径）。 */
export const ALLOWED_IMAGE_MIMES: readonly string[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export interface ImageAttachmentInfo {
  name: string;
  mime: string;
  size: number;
}

export type ImageAttachmentResult =
  | { ok: true; image: ImageAttachmentInfo }
  | { ok: false; error: string };

/** 扩展名 → MIME（未识别 → null；只认白名单里那几种）。 */
export function mimeForFileName(name: string): string | null {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name ?? ""));
  if (!m) return null;
  const ext = m[1].toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return null;
  }
}

/** 校验类型与**真实字节数**（size 应为调用方解码后的长度，不是渲染侧报的值）。 */
export function validateImage(mime: unknown, byteLength: unknown): ImageAttachmentResult {
  const m = typeof mime === "string" ? mime.toLowerCase() : "";
  if (!ALLOWED_IMAGE_MIMES.includes(m)) {
    return { ok: false, error: `图片类型不支持：${m === "" ? "（未知）" : m}——只支持 ${ALLOWED_IMAGE_MIMES.join(" / ")}。` };
  }
  const size = typeof byteLength === "number" && Number.isFinite(byteLength) ? byteLength : -1;
  if (size <= 0) {
    return { ok: false, error: "图片内容为空或无法读取。" };
  }
  if (size > MAX_IMAGE_BYTES) {
    return { ok: false, error: `图片过大（${formatBytes(size)} > 上限 ${formatBytes(MAX_IMAGE_BYTES)}）——请压缩后再发。` };
  }
  return { ok: true, image: { name: "", mime: m, size } };
}

/** base64 解码（严格字符集；返回**真实字节缓冲**——后续校验与嗅探都以它为准）。 */
export function decodeImageBase64(dataBase64: unknown): { ok: true; buffer: Buffer } | { ok: false; error: string } {
  if (typeof dataBase64 !== "string" || dataBase64.trim() === "") {
    return { ok: false, error: "图片数据缺失（空）。" };
  }
  const s = dataBase64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 !== 0) {
    return { ok: false, error: "图片数据不是合法的 base64。" };
  }
  // 解码前先按 base64 长度粗算字节数，防超大串（上限+余量以外直接拒，避免为判尺寸先分配大缓冲）。
  const approx = (s.length / 4) * 3;
  if (approx > MAX_IMAGE_BYTES + 8) {
    return { ok: false, error: `图片过大（> ${formatBytes(MAX_IMAGE_BYTES)}）——请压缩后再发。` };
  }
  try {
    return { ok: true, buffer: Buffer.from(s, "base64") };
  } catch {
    return { ok: false, error: "图片数据解码失败。" };
  }
}

/**
 * **魔数嗅探**（内容为准——扩展名/声明 MIME 都只是线索，**不可信**）：只认白名单四种格式，
 * 其余（含被改名成 .png 的非图片）→ null。判定用**真实字节**，防「套壳」。
 */
export function sniffImageMime(buffer: Buffer): string | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  // PNG：89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  // JPEG：FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  // GIF：GIF87a / GIF89a
  if (buffer.subarray(0, 6).toString("latin1") === "GIF87a" || buffer.subarray(0, 6).toString("latin1") === "GIF89a") {
    return "image/gif";
  }
  // WEBP：RIFF....WEBP
  if (buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** 文件名净化（仅展示与留痕用；去路径分隔与控制字符，限长——**不参与任何判定**）。 */
export function sanitizeImageName(name: unknown): string {
  const s = typeof name === "string" ? name : "";
  const cleaned = s
    .replace(/[\\/]/g, "_")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return (cleaned === "" ? "图片" : cleaned).slice(0, 120);
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return `${n}B`;
}
