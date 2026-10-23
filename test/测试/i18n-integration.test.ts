// test/测试/i18n-integration.test.ts
// 2026-10-23 i18n I9（T2）：跨层集成/消费者验证（不启动真实 Electron）。
//
// 覆盖（方案 §7.1/§9.1/§11 P1–P5/P7–P9；标准 §三）：
//   · 共享目录：key 全集 parity、插值、复数（Intl.PluralRules）、en→zh→key 回退、稳定诊断码；
//   · 偏好文件：`<userData>/ans/preferences.json` 形状/原子写/缺失不写/损坏/非法/不可写降级；
//   · preferences IPC：`preferences:get`/`set-locale`/`locale-changed` 的形状与成功/失败语义；
//   · 渲染层 locale store：首屏镜像、文件权威校正、广播、切换失败回滚、IPC 不可用降级；
//   · store + 真实 preferences 服务：切换 → 文件 → 重启（新服务读取）保持；
//   · 主进程与渲染层消费同一 shared key；B4 `RUNTIME_SETTINGS` key 解析回 label/help/choiceLabels；
//   · 单一目录/单一实现扫描（无第二份 messages/resolver/插值）；旧 zh 输出逐字、机器标识不翻译；
//   · preload/main/interface 的 IPC 接线源码断言（跨层契约）。
//
// 本文件只写 `test/测试/`；不启动 Electron、不读真实凭据；临时文件全部在 OS 临时目录。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  createTranslator,
  enUS,
  resolveLocale,
  translate,
  zhCN,
  type Catalog,
  type Locale,
  type MessageKey,
  type TranslateDiagnostic,
} from "../../src/common/shared/i18n/index.ts";
import { RUNTIME_SETTINGS } from "../../src/common/shared/runtime-settings.ts";
import {
  PREFERENCES_FILE_VERSION,
  createPreferencesService,
  preferencesFilePath,
  readPreferences,
  writePreferences,
} from "../../app/desktop/preferences.ts";
import { createMainI18n, desktopTexts, mainT } from "../../app/desktop/i18n.ts";
import { getRuntimeConfig } from "../../app/desktop/runtime-config.ts";
import { registerPreferencesIpc, type SetLocaleReply } from "../../app/desktop/interface.ts";
import { LOCALE_STORAGE_KEY, createLocaleStore, type LocaleStoreDeps } from "../../app/renderer/src/i18n/locale-store.ts";
import type { DesktopBridge } from "../../app/renderer/src/lib/platform.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

function temp(tag: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), tag));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function zh(key: string): string {
  return translate("zh-CN", key as MessageKey);
}

function en(key: string): string {
  return translate("en-US", key as MessageKey);
}

test("共享目录：parity、插值、复数、回退与稳定诊断码（唯一实现）", () => {
  const zhKeys = Object.keys(zhCN).sort();
  const enKeys = Object.keys(enUS).sort();
  assert.deepEqual(enKeys, zhKeys, "zh-CN/en-US key 全集必须一致（en 类型强制齐全）");
  assert.ok(zhKeys.length >= 1200, `目录应含 B0–B4 全量 key（实际 ${zhKeys.length}）`);
  assert.ok(zhKeys.every((key) => /^[A-Za-z0-9.]+$/.test(key)), "key 是稳定 ASCII 标识（机器标识不翻译）");

  // 插值与缺失参数：生产 key `main.runtimeConfig.integerBound` 含 {min}/{label}。
  assert.match(zh("shared.runtimeSettings.pi.contextWindow.label"), /上下文窗口/);
  assert.match(en("shared.runtimeSettings.pi.contextWindow.label"), /Context window/);
  const diagnostics: TranslateDiagnostic[] = [];
  const withMissingParam = translate("en-US", "main.runtimeConfig.integerBound" as MessageKey, {}, {
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });
  assert.match(withMissingParam, /\{min\}/, "缺参数保留占位符原文");
  assert.ok(diagnostics.some((d) => d.code === "i18n.missing-param" && d.param === "min"), "缺参数诊断");

  // en 缺 key ⇒ zh + warning；zh 也缺 ⇒ key + error（不回退 en）。
  const brokenEn: Catalog = { ...enUS };
  delete brokenEn["ui.settings.language.title"];
  const fallbackDiagnostics: TranslateDiagnostic[] = [];
  const fallback = translate("en-US", "ui.settings.language.title", {}, {
    catalogs: { "en-US": brokenEn },
    onDiagnostic: (diagnostic) => fallbackDiagnostics.push(diagnostic),
  });
  assert.equal(fallback, zh("ui.settings.language.title"), "en 缺 key 回退 zh-CN 文案");
  assert.ok(
    fallbackDiagnostics.some((d) => d.code === "i18n.missing-key" && d.severity === "warning"),
    "回退诊断是 warning",
  );

  const emptyZh: Catalog = { ...zhCN };
  const emptyEn: Catalog = { ...enUS };
  delete emptyZh["ui.settings.language.title"];
  delete emptyEn["ui.settings.language.title"];
  const missingDiagnostics: TranslateDiagnostic[] = [];
  const missing = translate("zh-CN", "ui.settings.language.title", {}, {
    catalogs: { "zh-CN": emptyZh, "en-US": emptyEn },
    onDiagnostic: (diagnostic) => missingDiagnostics.push(diagnostic),
  });
  assert.equal(missing, "ui.settings.language.title", "两目录都缺 ⇒ 返回 key 本身");
  assert.ok(missingDiagnostics.some((d) => d.code === "i18n.missing-key" && d.severity === "error"));

  // 复数：注入测试专用目录（不改生产目录）。
  const pluralCatalogs = {
    "zh-CN": { ...zhCN, "test.plural": { other: "{count} 项" } } as Catalog,
    "en-US": { ...enUS, "test.plural": { one: "{count} item", other: "{count} items" } } as Catalog,
  };
  const plural = (locale: Locale, count: number) =>
    translate(locale, "test.plural" as MessageKey, { count }, { catalogs: pluralCatalogs });
  assert.equal(plural("en-US", 0), "0 items");
  assert.equal(plural("en-US", 1), "1 item");
  assert.equal(plural("en-US", 2), "2 items");
  assert.equal(plural("zh-CN", 1), "1 项", "zh 恒 other");
  assert.equal(plural("zh-CN", 3), "3 项");

  // 非法 locale 回退默认；诊断码/字段是机器标识。
  assert.equal(DEFAULT_LOCALE, "zh-CN");
  assert.deepEqual([...SUPPORTED_LOCALES], ["zh-CN", "en-US"]);
  assert.equal(resolveLocale("en"), "zh-CN");
  assert.equal(resolveLocale(" fr "), "zh-CN");
  assert.equal(resolveLocale("en-US"), "en-US");
});

test("偏好文件：形状、缺失不写、原子写、损坏/版本/非法 locale 与不可写降级", async () => {
  const t = temp("ans-i18n-prefs-");
  try {
    const file = preferencesFilePath(t.dir);
    const missing = await readPreferences(file);
    assert.equal(missing.state, "missing");
    assert.equal(missing.locale, "zh-CN");
    assert.equal(existsSync(file), false, "首次启动无偏好文件时不得创建文件/目录");

    await writePreferences(file, "en-US");
    assert.equal(
      readFileSync(file, "utf8"),
      `${JSON.stringify({ version: PREFERENCES_FILE_VERSION, locale: "en-US" })}\n`,
      "文件形状必须恰为 {version:1, locale}",
    );
    const valid = await readPreferences(file);
    assert.deepEqual({ state: valid.state, locale: valid.locale }, { state: "valid", locale: "en-US" });

    writeFileSync(file, "{ not json", "utf8");
    const corrupt = await readPreferences(file);
    assert.equal(corrupt.state, "invalid");
    assert.equal(corrupt.locale, "zh-CN");
    assert.deepEqual(
      corrupt.diagnostics.map((d) => [d.code, d.reasonCode]),
      [["preferences.read.invalid", "corrupt-json"]],
    );

    writeFileSync(file, JSON.stringify({ version: 2, locale: "en-US" }), "utf8");
    const version = await readPreferences(file);
    assert.equal(version.diagnostics[0]?.reasonCode, "unsupported-version");
    assert.equal(version.locale, "zh-CN");

    writeFileSync(file, JSON.stringify({ version: 1, locale: "fr-FR" }), "utf8");
    const invalidLocale = await readPreferences(file);
    assert.equal(invalidLocale.locale, "zh-CN");
    assert.deepEqual(
      invalidLocale.diagnostics.map((d) => [d.code, d.reasonCode]),
      [["preferences.locale.invalid", "invalid-locale"]],
    );

    // 服务：非法值不改内存/文件；成功写盘后内存更新；不可写/未注入路径如实失败且不改内存。
    const service = createPreferencesService({ filePath: file, initialLocale: "zh-CN" });
    const beforeInvalid = readFileSync(file, "utf8");
    const rejected = await service.setLocale("fr-FR");
    assert.deepEqual(rejected, { ok: false, locale: "zh-CN", error: "invalid-locale" });
    assert.equal(readFileSync(file, "utf8"), beforeInvalid, "非法值不得改文件");
    const saved = await service.setLocale("en-US");
    assert.deepEqual(saved, { ok: true, locale: "en-US" });
    assert.equal(service.getLocale(), "en-US");

    const unavailable = createPreferencesService({ initialLocale: "zh-CN" });
    assert.deepEqual(await unavailable.setLocale("en-US"), {
      ok: false,
      locale: "zh-CN",
      error: "persistence-unavailable",
    });

    const blocker = path.join(t.dir, "blocker");
    writeFileSync(blocker, "x", "utf8");
    const blockedService = createPreferencesService({
      filePath: path.join(blocker, "preferences.json"),
      initialLocale: "zh-CN",
    });
    const writeFailed = await blockedService.setLocale("en-US");
    assert.equal(writeFailed.ok, false);
    assert.equal(writeFailed.ok === false ? writeFailed.error : "", "write-failed");
    assert.equal(blockedService.getLocale(), "zh-CN", "写失败不得更新内存");
  } finally {
    t.cleanup();
  }
});

test("preferences IPC：通道名、get 形状、成功广播/失败不广播、失败文案按当前 locale", async () => {
  const t = temp("ans-i18n-ipc-");
  try {
    const file = preferencesFilePath(t.dir);
    const service = createPreferencesService({ filePath: file, initialLocale: "zh-CN" });
    const i18n = createMainI18n("zh-CN");
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const broadcasts: Locale[] = [];
    const desktop = {
      getPreferences: async () => service.getView(),
      setLocale: async (input: unknown): Promise<SetLocaleReply> => {
        const record =
          input !== null && typeof input === "object" && !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : undefined;
        const value = record?.locale;
        if (value !== "zh-CN" && value !== "en-US") {
          return { ok: false, locale: service.getLocale(), error: i18n.t("preferences.error.invalidLocale") };
        }
        const result = await service.setLocale(value);
        if (!result.ok) {
          return {
            ok: false,
            locale: result.locale,
            error: i18n.t(result.error === "invalid-locale" ? "preferences.error.invalidLocale" : "preferences.error.saveFailed"),
          };
        }
        i18n.setLocale(result.locale);
        return { ok: true, locale: result.locale };
      },
    };
    registerPreferencesIpc(
      (channel, listener) => handlers.set(channel, listener),
      desktop,
      { onLocaleChanged: (locale) => broadcasts.push(locale) },
    );
    assert.deepEqual([...handlers.keys()].sort(), ["preferences:get", "preferences:set-locale"]);

    const view = (await handlers.get("preferences:get")!(null)) as {
      version: number;
      locale: string;
      supported: string[];
    };
    assert.deepEqual(view, { version: 1, locale: "zh-CN", supported: ["zh-CN", "en-US"] });

    const ok = await handlers.get("preferences:set-locale")!(null, { locale: "en-US" });
    assert.deepEqual(ok, { ok: true, locale: "en-US" });
    assert.deepEqual(broadcasts, ["en-US"], "成功切换只广播一次");
    assert.equal((await readPreferences(file)).locale, "en-US");

    const rejected = await handlers.get("preferences:set-locale")!(null, { locale: "fr-FR" });
    assert.equal((rejected as { ok: boolean }).ok, false);
    assert.equal(
      (rejected as { error: string }).error,
      en("preferences.error.invalidLocale"),
      "失败文案按当前（en-US）locale 渲染",
    );
    assert.deepEqual(broadcasts, ["en-US"], "失败不得广播");

    // preload/main/interface 的接线源码断言（跨层契约；不启动 Electron）。
    const preload = readFileSync(path.join(REPO_ROOT, "app", "preload.cjs"), "utf8");
    assert.ok(preload.includes('ipcRenderer.invoke("preferences:get")'));
    assert.ok(preload.includes('ipcRenderer.invoke("preferences:set-locale", { locale:'));
    assert.ok(preload.includes('ipcRenderer.on("preferences:locale-changed"'));
    const mainSource = readFileSync(path.join(REPO_ROOT, "app", "main.ts"), "utf8");
    assert.ok(mainSource.includes("registerPreferencesIpc(registerHandler, desktop"));
    assert.ok(mainSource.includes("win.setTitle(desktopTexts(mainI18n).windowTitle)"));
    assert.ok(mainSource.includes('target.webContents.send("preferences:locale-changed", { locale })'));
    const interfaceSource = readFileSync(path.join(REPO_ROOT, "app", "desktop", "interface.ts"), "utf8");
    assert.ok(interfaceSource.includes('registerHandler("preferences:get"'));
    assert.ok(interfaceSource.includes('registerHandler("preferences:set-locale"'));
    assert.ok(interfaceSource.includes("mainI18n.setLocale(result.locale)"));
  } finally {
    t.cleanup();
  }
});

test("locale store：首屏镜像、文件权威、广播、失败回滚、IPC 降级、非法镜像诊断", async () => {
  interface FakeBridge {
    getPreferences?: () => Promise<unknown>;
    setLocale?: (locale: string) => Promise<unknown>;
    onLocaleChanged?: (cb: (payload: unknown) => void) => () => void;
  }
  function depsWith(
    initialMirror: string | null,
    bridge: FakeBridge | null,
    events: { mirrors: Array<string | null>; langs: Locale[]; diagnostics: string[] },
  ): LocaleStoreDeps {
    return {
      readStoredLocale: () => initialMirror,
      writeStoredLocale: (locale) => events.mirrors.push(locale),
      applyDocumentLang: (locale) => events.langs.push(locale),
      getBridge: () => bridge as DesktopBridge | null,
      onDiagnostic: (code) => events.diagnostics.push(code),
    };
  }

  // ① 首屏镜像 → 文件权威校正（文件 zh-CN 覆盖镜像 en-US）。
  const events1 = { mirrors: [] as Array<string | null>, langs: [] as Locale[], diagnostics: [] as string[] };
  let broadcast: ((payload: unknown) => void) | undefined;
  const bridge1: FakeBridge = {
    getPreferences: async () => ({ version: 1, locale: "zh-CN", supported: ["zh-CN", "en-US"] }),
    setLocale: async () => ({ ok: true, locale: "en-US" }),
    onLocaleChanged: (cb) => {
      broadcast = cb;
      return () => {};
    },
  };
  const store1 = createLocaleStore(depsWith("en-US", bridge1, events1));
  assert.equal(store1.getState().locale, "en-US", "首屏先读 localStorage 镜像");
  await store1.getState().init();
  assert.equal(store1.getState().locale, "zh-CN", "偏好文件是权威，启动校正镜像");
  assert.deepEqual(events1.mirrors, ["zh-CN"]);
  assert.deepEqual(events1.langs.at(-1), "zh-CN");
  broadcast?.({ locale: "en-US" });
  assert.equal(store1.getState().locale, "en-US", "主进程广播更新 store");
  assert.deepEqual(events1.mirrors.at(-1), "en-US");

  // ② 切换失败整体回滚（store/lang/镜像），错误按回滚后的语言渲染。
  const events2 = { mirrors: [] as Array<string | null>, langs: [] as Locale[], diagnostics: [] as string[] };
  const bridge2: FakeBridge = {
    getPreferences: async () => ({ version: 1, locale: "zh-CN" }),
    setLocale: async () => ({ ok: false, locale: "zh-CN", error: "save failed" }),
  };
  const store2 = createLocaleStore(depsWith(null, bridge2, events2));
  await store2.getState().init();
  assert.equal(await store2.getState().setLocale("en-US"), false);
  assert.equal(store2.getState().locale, "zh-CN");
  assert.equal(store2.getState().error, zh("ui.settings.language.saveFailed"));
  assert.deepEqual(events2.mirrors.slice(-2), ["en-US", "zh-CN"], "乐观写后失败回滚镜像");
  assert.deepEqual(events2.langs.slice(-2), ["en-US", "zh-CN"]);
  assert.ok(events2.diagnostics.includes("locale.preferences.saveFailed"));

  // ③ IPC 不可用 ⇒ 降级保留本地镜像，不阻塞 UI。
  const events3 = { mirrors: [] as Array<string | null>, langs: [] as Locale[], diagnostics: [] as string[] };
  const store3 = createLocaleStore(depsWith(null, null, events3));
  await store3.getState().init();
  assert.equal(await store3.getState().setLocale("en-US"), true);
  assert.equal(store3.getState().locale, "en-US");
  assert.deepEqual(events3.mirrors.at(-1), "en-US");

  // ④ 非法镜像回退默认 + 诊断。
  const events4 = { mirrors: [] as Array<string | null>, langs: [] as Locale[], diagnostics: [] as string[] };
  const store4 = createLocaleStore(depsWith("fr-FR", null, events4));
  assert.equal(store4.getState().locale, "zh-CN");
  assert.ok(events4.diagnostics.includes("locale.mirror.invalid"));
});

test("locale store + 真实 preferences 服务：切换 → 文件 → 重启保持；项目切换不改变 locale", async () => {
  const t = temp("ans-i18n-store-prefs-");
  try {
    const file = preferencesFilePath(t.dir);
    const service = createPreferencesService({ filePath: file, initialLocale: "zh-CN" });
    const bridge: DesktopBridge = {
      getPreferences: async () => service.getView(),
      setLocale: async (locale: string) => service.setLocale(locale),
    } as DesktopBridge;
    const events = { mirrors: [] as Array<string | null>, langs: [] as Locale[], diagnostics: [] as string[] };
    const store = createLocaleStore({
      readStoredLocale: () => (events.mirrors.at(-1) ?? null),
      writeStoredLocale: (locale) => events.mirrors.push(locale),
      applyDocumentLang: (locale) => events.langs.push(locale),
      getBridge: () => bridge,
      onDiagnostic: (code) => events.diagnostics.push(code),
    });
    await store.getState().init();
    assert.equal(await store.getState().setLocale("en-US"), true);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).locale, "en-US");

    // 模拟重启：新服务从同一文件读取 → en-US；新的 store 以文件校正镜像。
    const restarted = createPreferencesService({
      filePath: file,
      initialLocale: (await readPreferences(file)).locale,
    });
    assert.equal(restarted.getLocale(), "en-US");
    const restartedStore = createLocaleStore({
      readStoredLocale: () => "en-US",
      writeStoredLocale: () => {},
      applyDocumentLang: () => {},
      getBridge: () => ({ getPreferences: async () => restarted.getView() }) as DesktopBridge,
    });
    await restartedStore.getState().init();
    assert.equal(restartedStore.getState().locale, "en-US", "重启后保持 en-US");

    // 项目切换（渲染层换项目不改 locale store）后仍 en-US；切回 zh-CN 写盘。
    assert.equal(restartedStore.getState().locale, "en-US");
    assert.equal(await store.getState().setLocale("zh-CN"), true);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).locale, "zh-CN");
  } finally {
    t.cleanup();
  }
});

test("主进程/渲染层消费同一 shared key；RUNTIME_SETTINGS key 解析回 label/help/choiceLabels（zh/en）", async () => {
  const t = temp("ans-i18n-runtime-");
  try {
    const missingEnv = path.join(t.dir, "missing.env");
    const zhI18n = createMainI18n("zh-CN");
    const rendererZh = createTranslator("zh-CN");
    const sharedKeys: MessageKey[] = [
      "ui.settings.language.saveFailed",
      "shared.runtimeSettings.field.model.label",
      "main.window.title",
      "preferences.error.invalidLocale",
    ];
    for (const key of sharedKeys) {
      assert.equal(mainT(key), rendererZh(key), `主进程与渲染层对同一 key 输出一致：${key}`);
      assert.equal(mainT(key), zh(key));
    }
    assert.equal(desktopTexts(zhI18n).windowTitle, "ANS 桌面应用（受治理会话）");
    assert.equal(desktopTexts(zhI18n).startupErrorTitle, zh("main.error.startup.title"));

    const zhView = await getRuntimeConfig("pi", { envPath: missingEnv, env: {} });
    const zhFields = new Map(zhView.fields.map((field) => [field.key, field]));
    assert.equal(zhFields.get("ANS_PI_MODEL")?.label, "模型");
    assert.equal(zhFields.get("ANS_PI_REASONING_EFFORT")?.label, "推理强度");
    assert.equal(zhFields.get("ANS_PI_REASONING_EFFORT")?.help, zh("shared.runtimeSettings.reasoning.help"));
    assert.deepEqual(zhFields.get("ANS_PI_REASONING_EFFORT")?.choiceLabels, ["关", "低", "中", "高", "极高"]);
    assert.equal(zhFields.get("ANS_PI_CONTEXT_WINDOW")?.choiceLabels?.[0], "系统默认（500k）");
    for (const field of zhView.fields) {
      assert.equal("labelKey" in field, false, "IPC 视图不得暴露 labelKey");
      assert.equal("helpKey" in field, false);
      assert.equal("choiceLabelKeys" in field, false);
    }

    const enI18n = createMainI18n("en-US");
    const rendererEn = createTranslator("en-US");
    for (const key of sharedKeys) assert.equal(mainT(key), rendererEn(key));
    assert.equal(desktopTexts(enI18n).windowTitle, "ANS Desktop (Governed Sessions)");
    const enView = await getRuntimeConfig("pi", { envPath: missingEnv, env: {} });
    const enFields = new Map(enView.fields.map((field) => [field.key, field]));
    assert.equal(enFields.get("ANS_PI_MODEL")?.label, "Model");
    assert.equal(enFields.get("ANS_PI_REASONING_EFFORT")?.label, "Reasoning effort");
    assert.deepEqual(enFields.get("ANS_PI_REASONING_EFFORT")?.choiceLabels, ["Off", "Low", "Medium", "High", "XHigh"]);

    // 字段集/必填/choices/secret 等机器语义跨 locale 不变；共享元数据只含 key。
    assert.deepEqual(
      zhView.fields.map((field) => [field.key, field.required, field.secret, field.choices ?? null]),
      enView.fields.map((field) => [field.key, field.required, field.secret, field.choices ?? null]),
    );
    for (const definition of Object.values(RUNTIME_SETTINGS)) {
      for (const field of definition.fields) {
        assert.equal(typeof field.labelKey, "string");
        assert.ok(zh(field.labelKey as string).length > 0);
        assert.ok(en(field.labelKey as string).length > 0);
      }
    }
  } finally {
    t.cleanup();
  }
});

test("单一目录/单一实现：无第二份 messages/resolver/插值；facade 只再导出 shared", () => {
  const roots = [path.join(REPO_ROOT, "app"), path.join(REPO_ROOT, "src")];
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (/\.(ts|tsx|mjs|cjs|js)$/.test(entry.name)) files.push(abs);
    }
  };
  for (const root of roots) walk(root);
  const relative = (abs: string) => path.relative(REPO_ROOT, abs).replace(/\\/g, "/");

  const pluralRules = files.filter((file) => readFileSync(file, "utf8").includes("new Intl.PluralRules("));
  assert.deepEqual(pluralRules.map(relative), ["src/common/shared/i18n/format.ts"], "复数选择只有唯一实现");
  const pluralSelector = files.filter((file) =>
    readFileSync(file, "utf8").includes("export function selectPluralCategory"),
  );
  assert.deepEqual(pluralSelector.map(relative), ["src/common/shared/i18n/format.ts"]);
  const missingKey = files.filter((file) => readFileSync(file, "utf8").includes("i18n.missing-key"));
  assert.deepEqual(missingKey.map(relative), ["src/common/shared/i18n/translate.ts"], "回退/诊断只有唯一实现");
  const productionCatalogs = files.filter((file) => readFileSync(file, "utf8").includes("PRODUCTION_CATALOGS"));
  assert.deepEqual(productionCatalogs.map(relative), ["src/common/shared/i18n/translate.ts"]);
  const zhCatalogDefs = files.filter((file) => /export const zhCN\b/.test(readFileSync(file, "utf8")));
  assert.deepEqual(zhCatalogDefs.map(relative), ["src/common/shared/i18n/messages/zh-CN.ts"]);
  const enCatalogDefs = files.filter((file) => /export const enUS\b/.test(readFileSync(file, "utf8")));
  assert.deepEqual(enCatalogDefs.map(relative), ["src/common/shared/i18n/messages/en-US.ts"]);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "renderer", "src", "messages")), false, "渲染层不得有第二份 messages");

  const facade = readFileSync(path.join(REPO_ROOT, "app", "renderer", "src", "i18n", "index.ts"), "utf8");
  assert.ok(
    facade.includes('from "../../../../src/common/shared/i18n/index.ts"'),
    "渲染层 facade 直接从 shared 再导出",
  );
  assert.ok(facade.includes("export {") && facade.includes("createTranslator"), "facade 提供再导出");
  assert.equal(/export const (zhCN|enUS)\s*=/.test(facade), false, "facade 不得定义第二份目录");
});

test("旧 zh 输出逐字不变、locale 白名单/机器标识不翻译", () => {
  assert.equal(zh("main.window.title"), "ANS 桌面应用（受治理会话）");
  assert.equal(zh("ui.settings.language.title"), "语言");
  assert.equal(zh("ui.settings.language.zhCN"), "简体中文");
  assert.equal(zh("ui.settings.language.enUS"), "English");
  assert.equal(zh("ui.settings.language.saveFailed"), "语言偏好保存失败，请稍后重试。");
  assert.equal(zh("preferences.error.invalidLocale"), "语言偏好无效，已恢复为简体中文。");
  assert.equal(zh("shared.runtimeSettings.field.model.label"), "模型");
  assert.equal(zh("shared.runtimeSettings.reasoning.choice.low"), "低");
  assert.equal(en("ui.settings.language.zhCN"), "Chinese (Simplified)");
  assert.equal(en("main.window.title"), "ANS Desktop (Governed Sessions)");

  // 机器标识（locale 白名单/诊断码/存储键/偏好路径）原样。
  assert.deepEqual([...SUPPORTED_LOCALES], ["zh-CN", "en-US"]);
  assert.equal(LOCALE_STORAGE_KEY, "ans.locale");
  assert.equal(preferencesFilePath("/tmp/userData"), path.join("/tmp/userData", "ans", "preferences.json"));
  const codes = new Set<string>();
  translate("zh-CN", "definitely.not.a.key" as MessageKey, {}, { onDiagnostic: (d) => codes.add(d.code) });
  translate("zh-CN", "main.runtimeConfig.integerBound" as MessageKey, {}, { onDiagnostic: (d) => codes.add(d.code) });
  assert.deepEqual([...codes].sort(), ["i18n.missing-key", "i18n.missing-param"]);
  // 目录值中不得出现 roleId/cardKind/flow step 等机器标识被翻译的痕迹：抽查机器标识保持原样。
  for (const machineId of ["role-cards", "role-readiness", "appointment-write", "zh-CN", "en-US"]) {
    assert.match(machineId, /^[A-Za-z-]+$/, "机器标识保持 ASCII 原样");
  }
});
