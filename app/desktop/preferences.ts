// app/desktop/preferences.ts
// 应用级偏好（当前仅 locale）的持久化：`<userData>/ans/preferences.json`。
//
// 契约（i18n 方案 §4.7/§5.2；验收标准 P2/P8）：
//  · 形状 `{version:1, locale:"zh-CN"|"en-US"}`；写入经共享 `atomicWrite`（单一实现，不复制）；
//  · 首次启动无文件**不写**；用户切换时由 `setLocale` 写；
//  · 文件损坏/不可读/非法 locale/未知 version/不可写 ⇒ 回退 `zh-CN` + **稳定诊断码**，
//    不阻塞启动；诊断码与 reasonCode 是机器标识，**不翻译**；
//  · 只写注入的偏好文件（生产为 userData）；**不写项目 `.ans`/`.env`/治理账本**，不读真实凭据。
//
// 分层：桌面 Interface 层（主进程侧纯逻辑，可注入路径、可在 node 下单测）。只读导入共享
// `atomicWrite` 与 i18n locale 白名单，不维护第二份实现。

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "../../src/common/shared/atomic-write.ts";
import {
  DEFAULT_LOCALE,
  isLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from "../../src/common/shared/i18n/index.ts";

/** 偏好文件版本（未来迁移用；未知版本按默认值读取并诊断，不覆盖写坏文件）。 */
export const PREFERENCES_FILE_VERSION = 1;

/** 偏好文件形状（唯一来源；IPC `preferences:get` 另加 `supported`）。 */
export interface PreferencesFile {
  readonly version: typeof PREFERENCES_FILE_VERSION;
  readonly locale: Locale;
}

/** `<userData>/ans/preferences.json` 的唯一路径构造（主进程与测试共用，不各自拼串）。 */
export function preferencesFilePath(userDataPath: string): string {
  return path.join(userDataPath, "ans", "preferences.json");
}

/** 稳定诊断码（机器标识，不翻译；与用户可见文案 key `preferences.error.*` 分开）。 */
export type PreferencesDiagnosticCode =
  | "preferences.read.invalid"
  | "preferences.locale.invalid"
  | "preferences.write.failed";

/** 稳定原因码（机器标识，不翻译）：区分同码不同分支，便于诊断与测试断言。 */
export type PreferencesDiagnosticReason =
  | "unreadable"
  | "corrupt-json"
  | "invalid-shape"
  | "unsupported-version"
  | "invalid-locale"
  | "set-locale-rejected"
  | "persistence-unavailable"
  | "write-failed";

export interface PreferencesDiagnostic {
  readonly code: PreferencesDiagnosticCode;
  readonly severity: "warning" | "error";
  readonly reasonCode: PreferencesDiagnosticReason;
  /** 原始错误码（如 ENOENT/EACCES/EEXIST），仅诊断用；不含路径或内容。 */
  readonly errorCode?: string;
}

export interface ReadPreferencesResult {
  /** `missing`＝首次启动无文件（合法状态，不写文件）；`valid`＝可读且 locale 受支持；`invalid`＝已回退默认。 */
  readonly state: "missing" | "valid" | "invalid";
  readonly locale: Locale;
  readonly diagnostics: readonly PreferencesDiagnostic[];
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") return code;
  if (typeof code === "number") return String(code);
  return undefined;
}

function readInvalid(reasonCode: PreferencesDiagnosticReason, errorCode?: string): ReadPreferencesResult {
  return {
    state: "invalid",
    locale: DEFAULT_LOCALE,
    diagnostics: [
      {
        code: "preferences.read.invalid",
        severity: "warning",
        reasonCode,
        ...(errorCode !== undefined ? { errorCode } : {}),
      },
    ],
  };
}

/**
 * 读取偏好文件。**只读**：缺失时不创建文件/目录；任何失败都回退 `zh-CN` + 稳定诊断，不抛错。
 * 非法 locale 单独用 `preferences.locale.invalid`（与「文件读不出来」区分）。
 */
export async function readPreferences(filePath: string): Promise<ReadPreferencesResult> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const errorCode = errorCodeOf(error);
    if (errorCode === "ENOENT") {
      return { state: "missing", locale: DEFAULT_LOCALE, diagnostics: [] };
    }
    return readInvalid("unreadable", errorCode);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return readInvalid("corrupt-json");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return readInvalid("invalid-shape");
  }
  const record = parsed as Record<string, unknown>;
  // 未知/缺失版本：按默认值读取并诊断；**不覆盖**写坏文件（用户切换时才由写入替换）。
  if (record.version !== PREFERENCES_FILE_VERSION) {
    return readInvalid("unsupported-version");
  }
  if (!isLocale(record.locale)) {
    return {
      state: "invalid",
      locale: DEFAULT_LOCALE,
      diagnostics: [
        { code: "preferences.locale.invalid", severity: "warning", reasonCode: "invalid-locale" },
      ],
    };
  }
  return { state: "valid", locale: record.locale, diagnostics: [] };
}

/**
 * 原子写偏好文件（同目录临时文件 → fsync → rename；共享 `atomicWrite` 处理 Windows 瞬时 EPERM）。
 * 目录不存在时按既有 userData 纪律 `mkdir(..., {recursive:true, mode:0o700})`。
 * `locale` 只接受 shared 白名单；非法值是编程错误（`RangeError`），IPC 层在调用前已校验。
 */
export async function writePreferences(filePath: string, locale: Locale): Promise<void> {
  if (!isLocale(locale)) throw new RangeError("preferences locale must be a supported locale");
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const content: PreferencesFile = { version: PREFERENCES_FILE_VERSION, locale };
  await atomicWrite(filePath, `${JSON.stringify(content)}\n`);
}

/** `preferences:get` 的视图（`supported` 为只读白名单的副本，渲染层只按名消费）。 */
export interface PreferencesView {
  readonly version: typeof PREFERENCES_FILE_VERSION;
  readonly locale: Locale;
  readonly supported: string[];
}

export type PreferencesSetLocaleResult =
  | { readonly ok: true; readonly locale: Locale }
  | {
      readonly ok: false;
      readonly locale: Locale;
      /** 稳定错误码（机器标识，不翻译；IPC 层映射为 `preferences.error.*` 本地化文案）。 */
      readonly error: "invalid-locale" | "persistence-unavailable" | "write-failed";
    };

export interface PreferencesServiceOptions {
  /** 偏好文件路径；缺省/空串 ⇒ 不持久化（`setLocale` 如实失败，不假装保存成功）。 */
  readonly filePath?: string;
  /** 启动时已读取并校验的 locale（main.ts 在 build 前传入；缺省 zh-CN）。 */
  readonly initialLocale?: Locale;
  /** 稳定诊断钩子（可选；回调抛错不影响偏好读写）。 */
  readonly onDiagnostic?: (diagnostic: PreferencesDiagnostic) => void;
}

export interface PreferencesService {
  getLocale(): Locale;
  getView(): PreferencesView;
  /**
   * 只接受 shared 白名单值：非法值 ⇒ `{ok:false, error:"invalid-locale"}`，不改内存/文件；
   * 写失败 ⇒ `{ok:false, error:"write-failed"}`，不改内存；**只有写成功才更新内存**。
   */
  setLocale(value: unknown): Promise<PreferencesSetLocaleResult>;
}

function emitDiagnostic(
  callback: ((diagnostic: PreferencesDiagnostic) => void) | undefined,
  diagnostic: PreferencesDiagnostic,
): void {
  try {
    callback?.(diagnostic);
  } catch {
    // 诊断是观测，不是控制流：失败不得中断偏好读写。
  }
}

/**
 * 构造偏好服务（同步、可注入）。文件**读取**由 `readPreferences` 在启动时完成；服务只负责
 * 当前 locale 的内存状态与后续原子写入——不在构造时读盘，避免第二处读取口径。
 */
export function createPreferencesService(options: PreferencesServiceOptions = {}): PreferencesService {
  const filePath =
    typeof options.filePath === "string" && options.filePath !== "" ? options.filePath : undefined;
  let current: Locale = isLocale(options.initialLocale) ? options.initialLocale : DEFAULT_LOCALE;

  return {
    getLocale: () => current,
    getView: () => ({
      version: PREFERENCES_FILE_VERSION,
      locale: current,
      supported: [...SUPPORTED_LOCALES],
    }),
    async setLocale(value: unknown): Promise<PreferencesSetLocaleResult> {
      if (!isLocale(value)) {
        emitDiagnostic(options.onDiagnostic, {
          code: "preferences.locale.invalid",
          severity: "warning",
          reasonCode: "set-locale-rejected",
        });
        return { ok: false, locale: current, error: "invalid-locale" };
      }
      if (filePath === undefined) {
        emitDiagnostic(options.onDiagnostic, {
          code: "preferences.write.failed",
          severity: "error",
          reasonCode: "persistence-unavailable",
        });
        return { ok: false, locale: current, error: "persistence-unavailable" };
      }
      try {
        await writePreferences(filePath, value);
      } catch (error) {
        const errorCode = errorCodeOf(error);
        emitDiagnostic(options.onDiagnostic, {
          code: "preferences.write.failed",
          severity: "error",
          reasonCode: "write-failed",
          ...(errorCode !== undefined ? { errorCode } : {}),
        });
        return { ok: false, locale: current, error: "write-failed" };
      }
      current = value;
      return { ok: true, locale: current };
    },
  };
}
