// test/桌面UI/i18n-store.test.ts
// i18n B0：渲染层 locale store 的行为契约（镜像/文件校正/广播/切换回滚/降级）。
// 全部依赖注入（镜像 Map、lang 记录、桥替身）：不触碰真实 window/localStorage/document。

import test from "node:test";
import assert from "node:assert/strict";

import {
  LOCALE_STORAGE_KEY,
  createLocaleStore,
  translate,
  type LocaleStoreDeps,
  type LocaleStoreDiagnosticCode,
} from "../../app/renderer/src/i18n/index.ts";
import type { DesktopBridge } from "../../app/renderer/src/lib/platform.ts";

type BridgeSource = {
  prefs?: () => Promise<unknown>;
  setLocale?: (locale: string) => Promise<unknown>;
  subscribe?: (callback: (payload: unknown) => void) => () => void;
};

interface HarnessOptions {
  /** 预置的 localStorage 镜像值；不传表示没有镜像。 */
  stored?: string | null;
  /** null = 没有桥；不传 = 有桥但没有任何方法（旧 preload 形态）。 */
  bridge?: BridgeSource | null;
}

function createHarness(options: HarnessOptions = {}) {
  const mirror = new Map<string, string>();
  if (typeof options.stored === "string") {
    mirror.set(LOCALE_STORAGE_KEY, options.stored);
  }
  const langs: string[] = [];
  const diagnostics: LocaleStoreDiagnosticCode[] = [];
  const calls = {
    prefs: 0,
    setLocale: [] as string[],
    subscribe: 0,
  };
  const listeners = new Set<(payload: unknown) => void>();

  let bridge: DesktopBridge | null = null;
  if (options.bridge !== null) {
    const source: BridgeSource = options.bridge ?? {};
    const methods: Record<string, unknown> = {};
    if (source.prefs) {
      methods.getPreferences = async () => {
        calls.prefs += 1;
        return source.prefs!();
      };
    }
    if (source.setLocale) {
      methods.setLocale = async (locale: string) => {
        calls.setLocale.push(locale);
        return source.setLocale!(locale);
      };
    }
    if (source.subscribe) {
      methods.onLocaleChanged = (callback: (payload: unknown) => void) => {
        calls.subscribe += 1;
        listeners.add(callback);
        const off = source.subscribe!(callback);
        return () => {
          listeners.delete(callback);
          off();
        };
      };
    }
    bridge = methods as unknown as DesktopBridge;
  }

  const deps: LocaleStoreDeps = {
    readStoredLocale: () => mirror.get(LOCALE_STORAGE_KEY) ?? null,
    writeStoredLocale: (locale) => {
      mirror.set(LOCALE_STORAGE_KEY, locale);
    },
    applyDocumentLang: (locale) => {
      langs.push(locale);
    },
    getBridge: () => bridge,
    onDiagnostic: (code) => {
      diagnostics.push(code);
    },
  };

  const store = createLocaleStore(deps);
  const emit = (payload: unknown) => {
    for (const listener of listeners) listener(payload);
  };

  return { store, mirror, langs, diagnostics, calls, emit };
}

test("镜像键沿用方案口径；无镜像时默认 zh-CN、未初始化、无错误", () => {
  assert.equal(LOCALE_STORAGE_KEY, "ans.locale");
  const h = createHarness();
  const state = h.store.getState();
  assert.equal(state.locale, "zh-CN");
  assert.equal(state.error, null);
  assert.equal(state.initialized, false);
  assert.deepEqual(h.diagnostics, []);
  assert.equal(h.mirror.size, 0);
});

test("合法镜像作为首屏 locale；init 写入 <html lang> 并完成初始化", async () => {
  const h = createHarness({ stored: "en-US" });
  assert.equal(h.store.getState().locale, "en-US");
  assert.equal(h.mirror.get(LOCALE_STORAGE_KEY), "en-US");
  await h.store.getState().init();
  assert.deepEqual(h.langs, ["en-US"]);
  assert.equal(h.store.getState().initialized, true);
});

test("非法/空镜像回退 zh-CN 并记 locale.mirror.invalid", () => {
  for (const stored of ["en", "zh", "EN-US", "", "zh-CN "]) {
    const h = createHarness({ stored });
    assert.equal(h.store.getState().locale, "zh-CN", JSON.stringify(stored));
    assert.deepEqual(h.diagnostics, ["locale.mirror.invalid"], JSON.stringify(stored));
  }
});

test("getPreferences 以文件为准校正镜像与 lang，并回写 localStorage", async () => {
  const h = createHarness({
    stored: "en-US",
    bridge: {
      prefs: async () => ({
        version: 1,
        locale: "zh-CN",
        supported: ["zh-CN", "en-US"],
      }),
    },
  });
  assert.equal(h.store.getState().locale, "en-US");
  await h.store.getState().init();
  assert.equal(h.store.getState().locale, "zh-CN");
  assert.equal(h.mirror.get(LOCALE_STORAGE_KEY), "zh-CN");
  assert.deepEqual(h.langs, ["en-US", "zh-CN"]);
  assert.deepEqual(h.diagnostics, []);
});

test("getPreferences 返回 en-US 时补写缺失镜像", async () => {
  const h = createHarness({
    bridge: {
      prefs: async () => ({
        version: 1,
        locale: "en-US",
        supported: ["zh-CN", "en-US"],
      }),
    },
  });
  await h.store.getState().init();
  assert.equal(h.store.getState().locale, "en-US");
  assert.equal(h.mirror.get(LOCALE_STORAGE_KEY), "en-US");
  assert.deepEqual(h.langs, ["zh-CN", "en-US"]);
});

test("getPreferences 失败/形状非法不阻塞 UI：保持镜像值、完成初始化、记诊断", async () => {
  const rejected = createHarness({
    stored: "en-US",
    bridge: {
      prefs: async () => {
        throw new Error("preferences unavailable");
      },
    },
  });
  await rejected.store.getState().init();
  assert.equal(rejected.store.getState().initialized, true);
  assert.equal(rejected.store.getState().locale, "en-US");
  assert.deepEqual(rejected.diagnostics, ["locale.preferences.readFailed"]);

  const malformed = createHarness({
    bridge: { prefs: async () => ({ version: 1, locale: "en", supported: [] }) },
  });
  await malformed.store.getState().init();
  assert.equal(malformed.store.getState().initialized, true);
  assert.equal(malformed.store.getState().locale, "zh-CN");
  assert.deepEqual(malformed.diagnostics, ["locale.preferences.readFailed"]);
});

test("onLocaleChanged 广播更新 store/lang/镜像；非法载荷忽略", async () => {
  const h = createHarness({ bridge: { subscribe: () => () => undefined } });
  await h.store.getState().init();
  assert.equal(h.calls.subscribe, 1);

  h.emit({ locale: "en-US" });
  assert.equal(h.store.getState().locale, "en-US");
  assert.equal(h.mirror.get(LOCALE_STORAGE_KEY), "en-US");
  assert.deepEqual(h.langs, ["zh-CN", "en-US"]);

  for (const payload of [{ locale: "fr" }, { locale: 42 }, {}, null, "en-US"]) {
    h.emit(payload);
  }
  assert.equal(h.store.getState().locale, "en-US");
  assert.deepEqual(h.langs, ["zh-CN", "en-US"]);
});

test("重复/并发 init 不重复订阅、不重复读偏好", async () => {
  const h = createHarness({
    bridge: {
      prefs: async () => ({
        version: 1,
        locale: "zh-CN",
        supported: ["zh-CN", "en-US"],
      }),
      subscribe: () => () => undefined,
    },
  });
  await Promise.all([h.store.getState().init(), h.store.getState().init()]);
  await h.store.getState().init();
  assert.equal(h.calls.prefs, 1);
  assert.equal(h.calls.subscribe, 1);
  assert.equal(h.store.getState().initialized, true);
});

test("启动期间用户显式切换优先于晚到的偏好文件快照（方案 §4.6 优先级）", async () => {
  let resolvePrefs!: (value: unknown) => void;
  const prefsPromise = new Promise<unknown>((resolve) => {
    resolvePrefs = resolve;
  });
  const h = createHarness({
    bridge: {
      prefs: () => prefsPromise,
      setLocale: async (locale) => ({ ok: true, locale }),
    },
  });
  const initPromise = h.store.getState().init();
  assert.equal(await h.store.getState().setLocale("en-US"), true);
  resolvePrefs({
    version: 1,
    locale: "zh-CN",
    supported: ["zh-CN", "en-US"],
  });
  await initPromise;
  assert.equal(h.store.getState().locale, "en-US");
  assert.equal(h.mirror.get(LOCALE_STORAGE_KEY), "en-US");
  assert.equal(h.store.getState().initialized, true);
});

test("setLocale 成功：乐观更新保留，镜像/lang 同步、无错误", async () => {
  const h = createHarness({
    bridge: { setLocale: async (locale) => ({ ok: true, locale }) },
  });
  const ok = await h.store.getState().setLocale("en-US");
  assert.equal(ok, true);
  assert.equal(h.store.getState().locale, "en-US");
  assert.equal(h.store.getState().error, null);
  assert.equal(h.mirror.get(LOCALE_STORAGE_KEY), "en-US");
  assert.deepEqual(h.langs, ["en-US"]);
  assert.deepEqual(h.calls.setLocale, ["en-US"]);
  assert.deepEqual(h.diagnostics, []);
});

test("setLocale 失败（ok:false）：回滚 store/lang/镜像，错误按回滚后语言渲染", async () => {
  const zh = createHarness({
    bridge: { setLocale: async () => ({ ok: false, locale: "zh-CN", error: "denied" }) },
  });
  assert.equal(await zh.store.getState().setLocale("en-US"), false);
  assert.equal(zh.store.getState().locale, "zh-CN");
  assert.equal(zh.mirror.get(LOCALE_STORAGE_KEY), "zh-CN");
  assert.deepEqual(zh.langs, ["en-US", "zh-CN"]);
  assert.equal(
    zh.store.getState().error,
    translate("zh-CN", "ui.settings.language.saveFailed"),
  );
  assert.deepEqual(zh.diagnostics, ["locale.preferences.saveFailed"]);

  const en = createHarness({
    stored: "en-US",
    bridge: { setLocale: async () => ({ ok: false, locale: "en-US" }) },
  });
  assert.equal(await en.store.getState().setLocale("zh-CN"), false);
  assert.equal(en.store.getState().locale, "en-US");
  assert.equal(en.mirror.get(LOCALE_STORAGE_KEY), "en-US");
  assert.equal(
    en.store.getState().error,
    translate("en-US", "ui.settings.language.saveFailed"),
  );
});

test("IPC 异常回滚；IPC 不可用（无桥/旧 preload）只保留本地镜像降级", async () => {
  const thrown = createHarness({
    bridge: {
      setLocale: async () => {
        throw new Error("ipc down");
      },
    },
  });
  assert.equal(await thrown.store.getState().setLocale("en-US"), false);
  assert.equal(thrown.store.getState().locale, "zh-CN");
  assert.equal(thrown.mirror.get(LOCALE_STORAGE_KEY), "zh-CN");
  assert.notEqual(thrown.store.getState().error, null);

  for (const options of [{ bridge: null }, {}] as HarnessOptions[]) {
    const h = createHarness(options);
    assert.equal(await h.store.getState().setLocale("en-US"), true);
    assert.equal(h.store.getState().locale, "en-US");
    assert.equal(h.mirror.get(LOCALE_STORAGE_KEY), "en-US");
    assert.equal(h.store.getState().error, null);
    assert.deepEqual(h.calls.setLocale, []);
  }
});

test("非法 setLocale 值拒绝：不改状态、不调 IPC、不写镜像/lang", async () => {
  const h = createHarness({
    bridge: { setLocale: async (locale) => ({ ok: true, locale }) },
  });
  for (const value of ["fr", "", "zh", "en-US ", "ZH-CN"]) {
    assert.equal(await h.store.getState().setLocale(value), false, JSON.stringify(value));
  }
  assert.equal(h.store.getState().locale, "zh-CN");
  assert.deepEqual(h.calls.setLocale, []);
  assert.equal(h.mirror.size, 0);
  assert.deepEqual(h.langs, []);
});

test("setLocale 同值：不调用 IPC；成功后清除旧错误", async () => {
  const h = createHarness({
    bridge: { setLocale: async () => ({ ok: false, locale: "zh-CN" }) },
  });
  assert.equal(await h.store.getState().setLocale("en-US"), false);
  assert.notEqual(h.store.getState().error, null);

  assert.equal(await h.store.getState().setLocale("zh-CN"), true);
  assert.equal(h.store.getState().error, null);
  assert.deepEqual(h.calls.setLocale, ["en-US"]);
});

test("t 按当前 locale 输出 zh-CN / en-US 文案", () => {
  const zh = createHarness();
  assert.equal(zh.store.getState().t("ui.settings.language.title"), "语言");
  assert.equal(zh.store.getState().t("ui.settings.language.zhCN"), "简体中文");
  assert.equal(zh.store.getState().t("ui.settings.language.enUS"), "English");

  const en = createHarness({ stored: "en-US" });
  assert.equal(en.store.getState().t("ui.settings.language.title"), "Language");
  assert.equal(
    en.store.getState().t("ui.settings.language.zhCN"),
    "Chinese (Simplified)",
  );
});
