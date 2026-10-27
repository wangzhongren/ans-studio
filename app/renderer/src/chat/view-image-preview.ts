/**
 * view_image 缩略图预览的纯逻辑（2026-10-27 客户要求：聊天流里看到角色查看的那张图）。
 *
 * 渲染进程不接触文件系统：这里只把「项目根 + 工具 target（项目相对路径）」拼成
 * file URL，交给 `<img>` 由浏览器读取。路径校验**只服务展示**（拒绝绝对路径/盘符/
 * UNC/协议、`..` 段、NUL、非图片扩展名），不是写入边界判定，也不替代主进程/门禁
 * 的任何判定。projectRoot 由主进程列举给出，属受信输入；target 来自模型工具参数，
 * 一律按不可信处理。
 *
 * 纯函数、无 DOM/Node 依赖，供 `test/桌面UI/` 的 node 单测直接 import。
 */

/** 允许预览的图片扩展名（与 `view_image` 工具一致：png/jpeg/jpg/webp/gif）。 */
const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif)$/i;

/** 控制字符（含 NUL、换行、制表）不构成合法路径。 */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/** 形如协议/盘符的前缀（`file:`、`data:`、`http:`、`C:`、`C:foo`）。 */
const SCHEME_LIKE_PREFIX = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * 项目相对图片路径是否可以安全用于预览。
 *
 * 规则（与工具层 `viewImagePathSyntaxError` 同向，另加图片扩展名）：
 * - 必须是字符串、非空白、不含 NUL/控制字符；
 * - 反斜杠按 Windows 习惯归一为 `/` 后，不得以 `/` 开头（绝对路径/UNC）、
 *   不得匹配协议或盘符前缀、不得含空段/`.`/`..`/`:` 段；
 * - 末段扩展名必须是 png/jpeg/jpg/webp/gif（大小写不敏感）。
 */
export function isSafeProjectImagePath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (path.trim() === "") return false;
  if (CONTROL_CHARACTER.test(path)) return false;
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return false;
  if (SCHEME_LIKE_PREFIX.test(normalized)) return false;
  const segments = normalized.split("/");
  if (segments.length === 0) return false;
  for (const segment of segments) {
    // 空段（双斜杠/尾斜杠）、`.`、`..` 与 NTFS ADS 冒号段一律拒绝。
    if (segment === "" || segment === "." || segment === "..") return false;
    if (segment.includes(":")) return false;
  }
  return IMAGE_EXTENSION.test(segments[segments.length - 1] as string);
}

/** 逐段百分号编码；盘符段（`C:`）保留冒号，其余交给 encodeURIComponent。 */
function encodeFilePath(path: string): string {
  return path
    .split("/")
    .map((segment, index) =>
      index === 0 && /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment),
    )
    .join("/");
}

/**
 * 由项目根与项目相对 target 构造 file URL；不可安全预览时返回 `null`。
 *
 * - `projectRoot` 为空/非字符串/不是绝对路径（`/…`、`C:…`、UNC `\\server\share`）→ null；
 * - target 未通过 `isSafeProjectImagePath` → null；
 * - 项目根与 target 均按段编码（空格、中文、`#`、`?` 等不会破坏 URL）。
 */
export function viewImagePreviewUrl(
  projectRoot: string | null,
  target: string,
): string | null {
  if (typeof projectRoot !== "string") return null;
  const trimmedRoot = projectRoot.trim();
  if (trimmedRoot === "") return null;
  if (!isSafeProjectImagePath(target)) return null;
  const root = trimmedRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  if (root === "") return null;
  const encodedRoot = encodeFilePath(root);
  const encodedTarget = target
    .replace(/\\/g, "/")
    .split("/")
    .map(encodeFilePathSegment)
    .join("/");
  if (encodedRoot.startsWith("//")) {
    // UNC：file://server/share/…
    return "file:" + encodedRoot + "/" + encodedTarget;
  }
  if (encodedRoot.startsWith("/")) {
    // POSIX 绝对路径：file:///home/…
    return "file://" + encodedRoot + "/" + encodedTarget;
  }
  if (/^[A-Za-z]:($|\/)/.test(encodedRoot)) {
    // Windows 盘符路径（含整盘根 `C:`）：file:///C:/…
    return "file:///" + encodedRoot + "/" + encodedTarget;
  }
  return null;
}

/** 单段编码（与 `encodeFilePath` 的非盘符分支同口径；target 无盘符概念）。 */
function encodeFilePathSegment(segment: string): string {
  return encodeURIComponent(segment);
}
