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

/** 两个判断开关的持久值（2026-10-29 客户缺陷修复：界面刷新/重启后恢复；缺失 = 均关闭）。 */
export interface JudgeSwitchesPreference {
  readonly approval: boolean;
  readonly decision: boolean;
}

/** 缺省开关值（首次启动/字段缺失/字段非法时使用；**不写文件**）。 */
export const DEFAULT_JUDGE_SWITCHES: JudgeSwitchesPreference = Object.freeze({
  approval: false,
  decision: false,
});

/** 偏好文件形状（唯一来源；IPC `preferences:get` 另加 `supported`）。 */
export interface PreferencesFile {
  readonly version: typeof PREFERENCES_FILE_VERSION;
  readonly locale: Locale;
  /**
   * 可选的判断开关持久值。**仅当至少一个开关为开时才写入**——既保持旧文件形状
   * （`{version, locale}`，i18n 契约测试逐字钉住）向后兼容，也以「缺省 = 全关」表达关闭态。
   */
  readonly judgeSwitches?: JudgeSwitchesPreference;
}

/** `<userData>/ans/preferences.json` 的唯一路径构造（主进程与测试共用，不各自拼串）。 */
export function preferencesFilePath(userDataPath: string): string {
  return path.join(userDataPath, "ans", "preferences.json");
}

/** 稳定诊断码（机器标识，不翻译；与用户可见文案 key `preferences.error.*` 分开）。 */
export type PreferencesDiagnosticCode =
  | "preferences.read.invalid"
  | "preferences.locale.invalid"
  | "preferences.judge.invalid"
  | "preferences.write.failed";

/** 稳定原因码（机器标识，不翻译）：区分同码不同分支，便于诊断与测试断言。 */
export type PreferencesDiagnosticReason =
  | "unreadable"
  | "corrupt-json"
  | "invalid-shape"
  | "unsupported-version"
  | "invalid-locale"
  | "invalid-judge-switches"
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
  /** 判断开关持久值（已归一化：缺失/非法时回退 `DEFAULT_JUDGE_SWITCHES`）。 */
  readonly judgeSwitches: JudgeSwitchesPreference;
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
    judgeSwitches: DEFAULT_JUDGE_SWITCHES,
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

/** 归一化可选的 `judgeSwitches` 字段：未知键/非布尔值 ⇒ 全关 + 诊断（不阻断 locale 读取）。 */
function normalizeJudgeSwitches(value: unknown): { judgeSwitches: JudgeSwitchesPreference; invalid: boolean } {
  if (value === undefined) return { judgeSwitches: DEFAULT_JUDGE_SWITCHES, invalid: false };
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { judgeSwitches: DEFAULT_JUDGE_SWITCHES, invalid: true };
  }
  const record = value as Record<string, unknown>;
  const unknownKey = Object.keys(record).some((key) => key !== "approval" && key !== "decision");
  const approval = record.approval ?? false;
  const decision = record.decision ?? false;
  if (unknownKey || typeof approval !== "boolean" || typeof decision !== "boolean") {
    return { judgeSwitches: DEFAULT_JUDGE_SWITCHES, invalid: true };
  }
  return { judgeSwitches: { approval, decision }, invalid: false };
}

/**
 * 读取偏好文件。**只读**：缺失时不创建文件/目录；任何失败都回退 `zh-CN` + 稳定诊断，不抛错。
 * 非法 locale 单独用 `preferences.locale.invalid`（与「文件读不出来」区分）；非法 `judgeSwitches`
 * 单独用 `preferences.judge.invalid`，locale 仍按有效值读取。
 */
export async function readPreferences(filePath: string): Promise<ReadPreferencesResult> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const errorCode = errorCodeOf(error);
    if (errorCode === "ENOENT") {
      return { state: "missing", locale: DEFAULT_LOCALE, judgeSwitches: DEFAULT_JUDGE_SWITCHES, diagnostics: [] };
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
  const judge = normalizeJudgeSwitches(record.judgeSwitches);
  const judgeDiagnostics: PreferencesDiagnostic[] = judge.invalid
    ? [{ code: "preferences.judge.invalid", severity: "warning", reasonCode: "invalid-judge-switches" }]
    : [];
  if (!isLocale(record.locale)) {
    return {
      state: "invalid",
      locale: DEFAULT_LOCALE,
      judgeSwitches: judge.judgeSwitches,
      diagnostics: [
        { code: "preferences.locale.invalid", severity: "warning", reasonCode: "invalid-locale" },
        ...judgeDiagnostics,
      ],
    };
  }
  return { state: "valid", locale: record.locale, judgeSwitches: judge.judgeSwitches, diagnostics: judgeDiagnostics };
}

/**
 * 原子写偏好文件（同目录临时文件 → fsync → rename；共享 `atomicWrite` 处理 Windows 瞬时 EPERM）。
 * 目录不存在时按既有 userData 纪律 `mkdir(..., {recursive:true, mode:0o700})`。
 * `locale` 只接受 shared 白名单；非法值是编程错误（`RangeError`），IPC 层在调用前已校验。
 * `judgeSwitches` 仅在至少一个为开时写入（缺省 = 全关；旧文件形状 `{version, locale}` 保持不变）。
 */
export async function writePreferences(
  filePath: string,
  locale: Locale,
  judgeSwitches?: JudgeSwitchesPreference,
): Promise<void> {
  if (!isLocale(locale)) throw new RangeError("preferences locale must be a supported locale");
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const approval = judgeSwitches?.approval === true;
  const decision = judgeSwitches?.decision === true;
  const content: PreferencesFile = {
    version: PREFERENCES_FILE_VERSION,
    locale,
    ...(approval || decision ? { judgeSwitches: { approval, decision } } : {}),
  };
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
  /** 启动时已读取并校验的判断开关持久值（缺省 = 均关闭；main.ts 在 build 前传入）。 */
  readonly initialJudgeSwitches?: JudgeSwitchesPreference;
  /** 稳定诊断钩子（可选；回调抛错不影响偏好读写）。 */
  readonly onDiagnostic?: (diagnostic: PreferencesDiagnostic) => void;
}

/** `setJudgeSwitch` 回执：写盘失败如实报错，但**内存镜像仍跟随主进程开关**（不撤销本次会话内的开关）。 */
export type PreferencesSetJudgeSwitchResult =
  | { readonly ok: true; readonly judgeSwitches: JudgeSwitchesPreference }
  | {
      readonly ok: false;
      readonly judgeSwitches: JudgeSwitchesPreference;
      readonly error: "persistence-unavailable" | "write-failed";
    };

export interface PreferencesService {
  getLocale(): Locale;
  getView(): PreferencesView;
  /** 当前判断开关持久值的内存镜像（构造时来自 `initialJudgeSwitches`）。 */
  getJudgeSwitches(): JudgeSwitchesPreference;
  /**
   * 只接受 shared 白名单值：非法值 ⇒ `{ok:false, error:"invalid-locale"}`，不改内存/文件；
   * 写失败 ⇒ `{ok:false, error:"write-failed"}`，不改内存；**只有写成功才更新内存**。
   * 写盘时一并写回当前判断开关持久值（不因切换语言丢开关）。
   */
  setLocale(value: unknown): Promise<PreferencesSetLocaleResult>;
  /**
   * 持久化单个判断开关（`approval` = 替我审批；`decision` = 替我决策）。
   * 内存镜像**先**跟随（开关本体已在主进程生效）；写盘失败返回 `ok:false` + 稳定错误码，
   * 由调用方诊断——下一次成功写入会带上最新镜像值。
   */
  setJudgeSwitch(kind: "approval" | "decision", enabled: boolean): Promise<PreferencesSetJudgeSwitchResult>;
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
  // 判断开关的内存镜像：构造后只由 `setJudgeSwitch` 更新；写盘失败也保留（主进程开关已生效）。
  let currentJudgeSwitches: JudgeSwitchesPreference = {
    approval: options.initialJudgeSwitches?.approval === true,
    decision: options.initialJudgeSwitches?.decision === true,
  };
  // 写盘串行链（2026-10-29）：两次开关连点/开关与语言切换并发时，后写必须带最新镜像值——
  // 直接并发 atomicWrite 会让较早的快照在较晚落盘时覆盖新值。
  let writeChain: Promise<unknown> = Promise.resolve();
  const enqueueWrite = <T>(task: () => Promise<T>): Promise<T> => {
    const next = writeChain.then(task, task);
    writeChain = next.catch(() => undefined);
    return next;
  };

  return {
    getLocale: () => current,
    getView: () => ({
      version: PREFERENCES_FILE_VERSION,
      locale: current,
      supported: [...SUPPORTED_LOCALES],
    }),
    getJudgeSwitches: () => currentJudgeSwitches,
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
        // 排队串行执行：执行当刻读取最新开关镜像（避免与并发的开关写互相覆盖）。
        await enqueueWrite(() => writePreferences(filePath, value, currentJudgeSwitches));
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
    async setJudgeSwitch(kind, enabled): Promise<PreferencesSetJudgeSwitchResult> {
      currentJudgeSwitches =
        kind === "approval"
          ? { ...currentJudgeSwitches, approval: enabled === true }
          : { ...currentJudgeSwitches, decision: enabled === true };
      if (filePath === undefined) {
        emitDiagnostic(options.onDiagnostic, {
          code: "preferences.write.failed",
          severity: "warning",
          reasonCode: "persistence-unavailable",
        });
        return { ok: false, judgeSwitches: currentJudgeSwitches, error: "persistence-unavailable" };
      }
      try {
        // 排队串行执行：执行当刻读取最新 locale 与镜像（连点两次开关也按序落盘，后写生效）。
        await enqueueWrite(() => writePreferences(filePath, current, currentJudgeSwitches));
      } catch (error) {
        const errorCode = errorCodeOf(error);
        emitDiagnostic(options.onDiagnostic, {
          code: "preferences.write.failed",
          severity: "warning",
          reasonCode: "write-failed",
          ...(errorCode !== undefined ? { errorCode } : {}),
        });
        return { ok: false, judgeSwitches: currentJudgeSwitches, error: "write-failed" };
      }
      return { ok: true, judgeSwitches: currentJudgeSwitches };
    },
  };
}
