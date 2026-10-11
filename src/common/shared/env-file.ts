// 跨角色共享 `.env` 读写模块（**单一来源**）。
//
// **属主：项目管理**（`src/common/shared/` 的唯一写入者）。**消费方：桌面应用**（**T28**：
// 启动时把 `.env` 载入 `process.env`，补上 Electron 缺失的 `--env-file`；配置面板保存时写回）。
// ——只读导入，**不得复制第二份实现**（工程法案 §一.5、`docs/architecture/shared-components.md`）。
//
// **来历（T26，设计 §11）**：客户要求「桌面 Pi 配置界面 → 保存到 `.env`」。`.env` **仍归装配**
// （Section 1 不动）；本模块是它的**指定写入者**——与 `docs/scheduling/`（目录归 pm、内容由
// `task_ops` 写）**同形**。该安排经 Governance 记档（G-2）。落点 `src/common/shared/env-file.ts`
// 属 pm 边界，故**无需 Section 1 授权**。
//
// **写入纪律（设计 §11.4，客户红线；本模块逐条落实）**
//  1. **只改相关键**：`mergeEnvText` **逐行**解析，只**替换匹配键的值**（键不存在则追加）；
//     **保留注释、空行、未知键、原有顺序与格式**——**绝不重写整份文件**（未命中的行逐字节不变）。
//  2. **credential 不回显**：错误信息**只含键名与路径、绝不含值**（`envError` 再对入参值做
//     redact 兜底）；`loadEnvFileInto` 只回报**键名**（`applied: string[]`），不含值。
//  3. **原子写**：`atomicWriteText` 复用**跨角色共享**的原子写原语 `atomicWrite`
//     （`src/common/shared/atomic-write.ts`，**单一来源**）——同目录临时文件 → `fsync` → `rename`
//     覆盖目标，避免半写坏掉 `.env`（rename 覆盖是原子的；同目录规避跨设备 `EXDEV`）。
//     该原语对 rename 的 **Windows 瞬时 `EPERM`**（实时防护/索引器短暂持有目标句柄）做**有界重试**
//     （见 `atomic-write.ts::renameReplacingExisting`）；Pi适配器的 `fs-write.ts` 有同源写法，
//     共享原语的抽取消除了这一处「§6 逼出的第二份镜像」。
//  4. **失败显式**：读取/写入失败（权限/磁盘/目录不存在）**抛错**，不静默。
//  5. **单一来源**：本模块是**全仓唯一**的 `.env` 读写实现（消费方只读导入，不复制第二份）。
//
// **接口（设计 §11/T26 所称 `parse`/`merge`/`atomicWrite`/`loadEnvFileInto` 即下列导出）**：
//  · `parseEnvFile(text)`        —— “parse”：`.env` 文本 → 键值对
//  · `mergeEnvText(orig, upd)`   —— “merge”：给定原文与更新键 → 新文本（只动命中键）
//  · `atomicWriteText(path, txt)`—— “atomicWrite”：同目录 temp + rename 原子落盘
//  · `loadEnvFileInto(env, path?)`——“loadEnvFileInto”：读 `.env` → 应用到给定 env 对象
//  · `readEnvFile(path)` / `saveEnvFile(path, upd)` —— 组合入口（读 / 只改相关键地原子写回）
//  · `PI_CONFIG_SECRET_KEYS` / `isSecretKey(key)` —— Pi 面板的**机密键**名单（供 T28 掩码）
//
// 行文依据：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §11.2/§11.4。

import { readFile } from "node:fs/promises";

// 跨角色共享原子写原语（**单一来源**，属主：项目管理）——同目录 temp + `fsync` + `rename` 覆盖目标，
// 并对 rename 的 Windows 瞬时 `EPERM` 做**有界重试**。抽取自本模块与 Pi适配器 `fs-write.ts` 的同源写法。
import { atomicWrite } from "./atomic-write.ts";

/** `.env` 键值对（值已去引号/去内联注释；重复键后者胜）。 */
export type EnvMap = Record<string, string>;

/** 可被写入的目标 env 对象（如 `process.env`）。 */
export type EnvTarget = Record<string, string | undefined>;

/**
 * `loadEnvFileInto` 的结果：**只回报键名**，**不含值**（凭据不回显；设计 §11.4）。
 */
export interface LoadEnvResult {
  /** 被读取的 `.env` 路径。 */
  path: string;
  /** 已写入 env 的**键名**（无值）。文件不存在时为 `[]`。 */
  applied: string[];
}

/**
 * Pi 面板纳入的**机密键**（界面须掩码；设计 §11.2）。与非机密键（`ANS_PI_BASE_URL` 等）
 * 的区别仅在于「要不要掩码」；值一律走 env/`.env`，不进任何入库文件、不进日志。
 * 供**桌面应用**（T28）掩码时**只读引用**（单一来源）。
 */
export const PI_CONFIG_SECRET_KEYS: readonly string[] = ["ANTHROPIC_AUTH_TOKEN"];

/** 该键是否为机密键（供界面掩码判定）。 */
export function isSecretKey(key: string): boolean {
  return PI_CONFIG_SECRET_KEYS.includes(key);
}

const REDACTED = "[redacted]";

/** 把文本中出现的任一 secret 值替换掉（凭据不回显的兜底；设计 §11.4）。 */
function redactSecrets(text: string, secrets?: Iterable<string>): string {
  if (!secrets) return text;
  let out = text;
  for (const s of secrets) {
    if (typeof s === "string" && s.length > 0) out = out.split(s).join(REDACTED);
  }
  return out;
}

/**
 * 构造**只含键名与路径、绝不含值**的错误（设计 §11.4）。底层 `err.message` 亦经 redact 兜底
 * （即使某些底层错误意外带上了值，也不会泄漏）。
 */
function envError(action: string, envPath: string, err: unknown, secrets?: Iterable<string>): Error {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  const raw = err instanceof Error ? err.message : String(err);
  const detail = redactSecrets(raw, secrets);
  const suffix = code ? `（${code}）` : "";
  return new Error(`env-file：${action} "${envPath}" 失败${suffix}：${detail}`);
}

// ---- 行解析（纯逻辑；逐行，绝不重写整份） ----

interface AssignmentLine {
  kind: "assignment";
  key: string;
  /** 键名之前 + 键名 + `=` + `=` 后的空白（原样保留）。 */
  head: string;
  /** 值 token（含引号；不含尾随内联注释）。 */
  valueRaw: string;
  /** 值之后的原文：尾随空白 + 内联注释（若有）。 */
  tail: string;
  /** 原值的引号风格（用于替换时尽量保持格式）；无引号为 null。 */
  quote: '"' | "'" | null;
}

interface OtherLine {
  kind: "other";
}

type LineShape = AssignmentLine | OtherLine;

/** 找与起始引号配对的收尾引号（双引号内 `\"` 视为转义，跳过）；找不到返回 -1。 */
function findClosingDouble(s: string): number {
  for (let i = 1; i < s.length; i++) {
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s[i] === '"') return i;
  }
  return -1;
}

/**
 * 判定一行是否为「`KEY=VALUE` 赋值行」并拆出 `head` / `valueRaw` / `tail`。
 * 注释行、空行、无 `=` 的行一律 `kind:"other"`（**原样保留**）。支持 `export KEY=…`。
 */
function classifyLine(body: string): LineShape {
  const m = /^([ \t]*(?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_]*)([ \t]*=[ \t]*)([\s\S]*)$/.exec(body);
  if (!m) return { kind: "other" };
  const key = m[2];
  const head = m[1] + m[2] + m[3];
  const rest = m[4];

  let valueRaw: string;
  let tail: string;
  if (rest.startsWith('"')) {
    const end = findClosingDouble(rest);
    if (end === -1) {
      valueRaw = rest;
      tail = "";
    } else {
      valueRaw = rest.slice(0, end + 1);
      tail = rest.slice(end + 1);
    }
  } else if (rest.startsWith("'")) {
    const end = rest.indexOf("'", 1);
    if (end === -1) {
      valueRaw = rest;
      tail = "";
    } else {
      valueRaw = rest.slice(0, end + 1);
      tail = rest.slice(end + 1);
    }
  } else {
    // 未加引号：尾随「空白 + # …」视为内联注释，与值分开（注释随 tail 原样保留）。
    const cm = /^([^#]*?)([ \t]+#.*)$/.exec(rest);
    if (cm) {
      valueRaw = cm[1];
      tail = cm[2];
    } else {
      valueRaw = rest;
      tail = "";
    }
  }

  const quote: '"' | "'" | null = valueRaw.startsWith('"')
    ? '"'
    : valueRaw.startsWith("'")
      ? "'"
      : null;
  return { kind: "assignment", key, head, valueRaw, tail, quote };
}

/** 反转义双引号串内的 `\n` `\r` `\"` `\\`。 */
function unescapeDouble(v: string): string {
  let out = "";
  for (let i = 0; i < v.length; i++) {
    if (v[i] === "\\" && i + 1 < v.length) {
      const n = v[i + 1];
      if (n === "n") {
        out += "\n";
        i++;
        continue;
      }
      if (n === "r") {
        out += "\r";
        i++;
        continue;
      }
      if (n === '"') {
        out += '"';
        i++;
        continue;
      }
      if (n === "\\") {
        out += "\\";
        i++;
        continue;
      }
      out += n;
      i++;
      continue;
    }
    out += v[i];
  }
  return out;
}

/** 双引号串转义（供写出）。 */
function escapeDouble(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

/** 无引号时是否安全（无空白/`#`/引号/反斜杠；空串安全——`KEY=`）。 */
function isSafeUnquoted(v: string): boolean {
  return /^[^\s#'"\\]*$/.test(v);
}

/** 解析单个值 token（去引号 + 反转义；未加引号者去内联注释并 trim）。 */
export function parseEnvValue(valueRaw: string): string {
  if (valueRaw.startsWith('"')) {
    const end = findClosingDouble(valueRaw);
    const inner = end === -1 ? valueRaw.slice(1) : valueRaw.slice(1, end);
    return unescapeDouble(inner);
  }
  if (valueRaw.startsWith("'")) {
    const end = valueRaw.indexOf("'", 1);
    const inner = end === -1 ? valueRaw.slice(1) : valueRaw.slice(1, end);
    return inner;
  }
  const cm = /^([^#]*?)([ \t]+#.*)$/.exec(valueRaw);
  const core = cm ? cm[1] : valueRaw;
  return core.trim();
}

/**
 * 规范化渲染一个值（无首选引号风格时）。含空白/`#`/引号/反斜杠者**加双引号**，
 * 以保证 `parseEnvFile` 能**原样读回**（`=` 等无需转义，因为值取自首个 `=` 之后）。
 */
export function renderEnvValue(value: string): string {
  return isSafeUnquoted(value) ? value : '"' + escapeDouble(value) + '"';
}

/** 按首选引号风格渲染；该风格无法安全表示时回退到双引号（保证可读回）。 */
function renderEnvValueWith(value: string, quote: '"' | "'" | null): string {
  if (quote === '"') return '"' + escapeDouble(value) + '"';
  if (quote === "'") {
    if (!/['\r\n]/.test(value)) return "'" + value + "'";
    return '"' + escapeDouble(value) + '"';
  }
  return renderEnvValue(value);
}

/** 把文本切成逻辑行（保留各自的行尾符，便于逐字节回写）。 */
function toLogicalLines(text: string): { body: string; ending: string }[] {
  const parts = text.split(/(\r\n|\r|\n)/);
  const lines: { body: string; ending: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    lines.push({ body: parts[i], ending: parts[i + 1] ?? "" });
  }
  return lines;
}

/** 文本的第一个行尾符（缺省 `\n`），供追加新键时对齐风格。 */
function detectEol(text: string): string {
  const m = /\r\n|\r|\n/.exec(text);
  return m ? m[0] : "\n";
}

/**
 * 逐行解析 `.env` 文本 → 键值对。**宽松**：无法识别的行（注释/空行/无 `=`）忽略、绝不抛错。
 * 重复键**后者胜**（与 dotenv 惯例一致）。
 */
export function parseEnvFile(text: string): EnvMap {
  const map: EnvMap = {};
  for (const { body } of toLogicalLines(text)) {
    const shape = classifyLine(body);
    if (shape.kind === "assignment") {
      map[shape.key] = parseEnvValue(shape.valueRaw);
    }
  }
  return map;
}

/**
 * **只改相关键**地合并：给定原文与更新键值，返回新文本。
 *
 * 规则（设计 §11.4）：逐行扫描——命中更新键的赋值行**只替换其值 token**（**保留**键、`=`、
 * 引号风格、内联注释）；其余行（注释、空行、未知键、其它已有键）**逐字节不变**、顺序不变；
 * 更新中**未命中**的键**追加**到文件末尾（用原文件的行尾符）。**绝不重写整份文件**。
 * 更新为空时**返回原文**（恒等）。
 */
export function mergeEnvText(original: string, updates: EnvMap): string {
  const updateKeys = Object.keys(updates);
  if (updateKeys.length === 0) return original;

  const lines = toLogicalLines(original);
  const eol = detectEol(original);
  const n = lines.length;
  // 末行若是「尾随换行」产生的幻影空行，不计入内容（追加应发生在它之前）。
  let contentEnd = n;
  if (original !== "" && n >= 1 && lines[n - 1].body === "" && lines[n - 1].ending === "") {
    contentEnd = n - 1;
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < contentEnd; i++) {
    const { body, ending } = lines[i];
    const shape = classifyLine(body);
    if (shape.kind === "assignment" && Object.prototype.hasOwnProperty.call(updates, shape.key)) {
      seen.add(shape.key);
      out.push(shape.head + renderEnvValueWith(updates[shape.key], shape.quote) + shape.tail + ending);
    } else {
      out.push(body + ending);
    }
  }

  const appended = updateKeys.filter((k) => !seen.has(k));
  let result = out.join("");
  if (appended.length > 0) {
    if (result.length > 0 && !(result.endsWith("\n") || result.endsWith("\r"))) result += eol;
    for (const k of appended) result += k + "=" + renderEnvValue(updates[k]) + eol;
  }
  return result;
}

/**
 * **原子写**：在**同目录**写临时文件 → `fsync` → `rename` 覆盖目标（设计 §11.4）。
 * 失败时清理临时文件并**抛错**；目标文件在 `rename` 成功前**不被触碰**（半写不可能）。
 *
 * **实现**：委托**跨角色共享**原语 `atomicWrite`（`src/common/shared/atomic-write.ts`，**单一来源**）——
 * 该原语除同目录 temp+`fsync`+`rename` 外，还对 rename 的 **Windows 瞬时 `EPERM`** 做**有界重试**
 * （仅瞬时码、≤20 次、次数间只 `setImmediate` 让出事件循环）。本函数仅保留 TEXT 语义（UTF-8）的薄封装，
 * **签名与行为不变**（T28 消费方只读导入此名）。
 */
export async function atomicWriteText(filePath: string, text: string): Promise<void> {
  await atomicWrite(filePath, text);
}

/** 读取 `.env` → 键值对。任何读取失败（含不存在/权限/磁盘）**明确抛错**（设计 §11.4）。 */
export async function readEnvFile(envPath: string): Promise<EnvMap> {
  let text: string;
  try {
    text = await readFile(envPath, "utf8");
  } catch (err) {
    throw envError("读取", envPath, err);
  }
  return parseEnvFile(text);
}

/**
 * 读 `.env` 应用到给定 env 对象（缺省 `process.env`；补 Electron 缺失的 `--env-file`）。
 * **同名键以 `.env` 为准覆盖**（保存后重载即生效；设计 §11.3）。
 * 文件**不存在**视为「无 `.env`」→ 无操作、不抛错；其它读取失败**明确抛错**。
 * 返回**只含键名**（`applied`），**不含值**。
 */
export async function loadEnvFileInto(env: EnvTarget, envPath = ".env"): Promise<LoadEnvResult> {
  let text: string;
  try {
    text = await readFile(envPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { path: envPath, applied: [] };
    }
    throw envError("读取", envPath, err);
  }
  const parsed = parseEnvFile(text);
  const applied: string[] = [];
  for (const [k, v] of Object.entries(parsed)) {
    env[k] = v;
    applied.push(k);
  }
  return { path: envPath, applied };
}

/**
 * 保存：**只改相关键**地把 `updates` 写回 `.env`（含**原子写**；设计 §11.4）。
 * 目标不存在则**创建**；存在则**就地替换命中键的值**（其余逐字节保留）。读取/写入失败**明确抛错**，
 * 且错误信息**只含键名与路径、绝不含值**（`updates` 的值一并 redact 兜底）。
 */
export async function saveEnvFile(envPath: string, updates: EnvMap): Promise<void> {
  let original = "";
  try {
    original = await readFile(envPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw envError("读取", envPath, err, Object.values(updates));
    }
  }
  const merged = mergeEnvText(original, updates);
  try {
    await atomicWriteText(envPath, merged);
  } catch (err) {
    throw envError("写入", envPath, err, Object.values(updates));
  }
}
