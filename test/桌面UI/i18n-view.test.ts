// test/桌面UI/i18n-view.test.ts
// i18n B0：语言区视图模型 + UI 接线证据。
//
// 仓库没有 jsdom/渲染测试依赖（不新增依赖），Node 也不能直接执行 .tsx；因此本文件用
// 两层证据代替 DOM 渲染：
//  1) 纯视图模型：facade 的 `languageOptions` / store `t` 在 zh-CN、en-US 下的真实输出；
//  2) 源码接线守卫：SettingsPanel 的语言区确实使用这些 API、位于引擎 tabs 之前、切换调用
//     store `setLocale`、错误经 `role="alert"` 呈现，且语言区无中文硬编码。
// 这不是快照伪造：输出由真实 shared 目录与 store 计算，接线由可复核的源码断言证明。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_LOCALE,
  LANGUAGE_OPTION_KEYS,
  SUPPORTED_LOCALES,
  createTranslator,
  enUS,
  isLocale,
  languageOptions,
  resolveLocale,
  translate,
  useLocaleStore,
  zhCN,
} from "../../app/renderer/src/i18n/index.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RENDERER = join(ROOT, "app", "renderer", "src");
const read = (path: string) => readFileSync(path, "utf8");
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const hasHan = (source: string) => /[一-鿿]/.test(source);

test("facade 再导出 shared 契约（默认 zh-CN、支持集、翻译函数与目录）", () => {
  assert.equal(DEFAULT_LOCALE, "zh-CN");
  assert.deepEqual([...SUPPORTED_LOCALES], ["zh-CN", "en-US"]);
  assert.equal(typeof translate, "function");
  assert.equal(typeof createTranslator, "function");
  assert.equal(typeof isLocale, "function");
  assert.equal(typeof resolveLocale, "function");
  assert.equal(resolveLocale("en"), "zh-CN");
  assert.equal(isLocale("en"), false);
  assert.equal(zhCN["ui.settings.language.title"], "语言");
  assert.equal(enUS["ui.settings.language.title"], "Language");
  assert.equal(Object.isFrozen(SUPPORTED_LOCALES), true);
});

test("facade/store 不复制目录或 resolver：实现只在 shared", () => {
  const facade = codeOnly(read(join(RENDERER, "i18n", "index.ts")));
  const store = codeOnly(read(join(RENDERER, "i18n", "locale-store.ts")));
  for (const source of [facade, store]) {
    for (const forbidden of [
      "Intl.PluralRules",
      "Intl.NumberFormat",
      "i18n.missing-key",
      "i18n.missing-param",
      "PLACEHOLDER",
      "messages/zh-CN",
      "messages/en-US",
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  }
  // 唯一实现经相对路径从 shared 导入（不需要 alias/tsconfig 改动）。
  assert.match(
    facade,
    /from "\.\.\/\.\.\/\.\.\/\.\.\/src\/common\/shared\/i18n\/index\.ts"/,
  );
  assert.match(
    store,
    /from "\.\.\/\.\.\/\.\.\/\.\.\/src\/common\/shared\/i18n\/index\.ts"/,
  );
  // facade/store 的代码面没有硬编码中文（注释为中文，已剥离）。
  assert.equal(hasHan(facade), false, "facade code has hardcoded Chinese");
  assert.equal(hasHan(store), false, "locale store code has hardcoded Chinese");
});

test("语言选项映射是显式静态 key（无运行时拼接），且 key 属于 B0 语言区", () => {
  assert.deepEqual({ ...LANGUAGE_OPTION_KEYS }, {
    "zh-CN": "ui.settings.language.zhCN",
    "en-US": "ui.settings.language.enUS",
  });
  for (const key of Object.values(LANGUAGE_OPTION_KEYS)) {
    assert.match(key, /^ui\.settings\.language\./);
  }
});

test("languageOptions 输出 zh-CN / en-US 的标签与选中状态", () => {
  assert.deepEqual(languageOptions("zh-CN", createTranslator("zh-CN")), [
    { id: "zh-CN", label: "简体中文", selected: true },
    { id: "en-US", label: "English", selected: false },
  ]);
  assert.deepEqual(languageOptions("en-US", createTranslator("en-US")), [
    { id: "zh-CN", label: "Chinese (Simplified)", selected: false },
    { id: "en-US", label: "English", selected: true },
  ]);
});

test("store.t 随 locale 切换；非法值拒绝且不改状态（语言区切换行为）", async () => {
  const initial = useLocaleStore.getState();
  assert.equal(initial.locale, "zh-CN");
  assert.equal(initial.t("ui.settings.language.title"), "语言");
  assert.equal(initial.t("ui.settings.language.description"), translate(
    "zh-CN",
    "ui.settings.language.description",
  ));
  try {
    // Node 无 preload 桥：按契约降级为本地镜像（本测试只验证 store 行为）。
    assert.equal(await initial.setLocale("en-US"), true);
    assert.equal(useLocaleStore.getState().locale, "en-US");
    assert.equal(useLocaleStore.getState().t("ui.settings.language.title"), "Language");
    assert.equal(
      useLocaleStore.getState().t("ui.settings.language.zhCN"),
      "Chinese (Simplified)",
    );

    assert.equal(await useLocaleStore.getState().setLocale("fr"), false);
    assert.equal(useLocaleStore.getState().locale, "en-US");
  } finally {
    useLocaleStore.setState({ locale: "zh-CN", error: null });
  }
});

test("SettingsPanel：语言区在面板顶部、引擎 tabs 之前，切换调用 store setLocale", () => {
  const panel = read(join(RENDERER, "shell", "SettingsPanel.tsx"));

  const START = "// ---- 语言区（B0）开始 ----";
  const END = "// ---- 语言区（B0）结束 ----";
  const start = panel.indexOf(START);
  const end = panel.indexOf(END);
  assert.ok(start >= 0, "language section start marker");
  assert.ok(end > start, "language section end marker");
  const section = panel.slice(start + START.length, end);
  const code = codeOnly(section);

  // 渲染 API 接线：useT / store 选择 / 选项列表 / 切换动作 / 错误呈现。
  assert.match(code, /useT\(\)/);
  assert.match(code, /useLocaleState\(\(s\) => s\.locale\)/);
  assert.match(code, /useLocaleState\(\(s\) => s\.error\)/);
  assert.match(code, /useLocaleState\(\(s\) => s\.setLocale\)/);
  assert.match(code, /languageOptions\(locale, t\)/);
  assert.match(code, /value=\{locale\}/);
  assert.match(
    code,
    /onChange=\{\(event\) => \{\s*void setLocale\(event\.target\.value\);\s*\}\}/,
  );
  assert.match(code, /t\("ui\.settings\.language\.title"\)/);
  assert.match(code, /t\("ui\.settings\.language\.description"\)/);
  assert.match(code, /\{error \? \(/);
  assert.match(code, /role="alert"/);
  // B0 语言区只使用自己的 key，不越界做主进程/其他区域文案。
  const keys = [...code.matchAll(/t\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.ok(keys.length >= 2, "language section uses t()");
  for (const key of keys) {
    assert.match(key, /^ui\.settings\.language\./, key);
  }
  // 语言区本身无中文硬编码、无内联样式（不改设计基线）。
  assert.equal(hasHan(code), false, "language section hardcodes Chinese");
  assert.equal(/style=\{\{/.test(section), false, "language section overrides styles");

  // 位置：面板内、引擎 tabs 之前；引擎保存条仍在（布局基线未动）。
  const panelStart = panel.indexOf('<div id="pi-panel"');
  const mount = panel.indexOf("<LanguageSection />");
  const engineTabs = panel.indexOf('className="pi-engine-tabs"');
  const saveBar = panel.indexOf('className="pi-save-bar"');
  assert.ok(panelStart >= 0 && mount > panelStart, "language section mounted in panel");
  assert.ok(engineTabs > mount, "language section precedes engine tabs");
  assert.ok(saveBar > engineTabs, "save bar remains in place");

  // 组件经唯一 facade 消费 shared；不从其他路径导入翻译实现。
  assert.match(
    panel,
    /import \{ languageOptions, useLocaleState, useT \} from "@\/i18n";/,
  );
});

test("App：启动时在既有 effect 内初始化 locale store", () => {
  const app = read(join(RENDERER, "App.tsx"));
  assert.match(app, /import \{ useLocaleStore \} from "@\/i18n";/);
  assert.match(
    app,
    /useEffect\(\(\) => \{\s*installChatRuntime\(\);\s*installTestDriver\(\);\s*(\/\/[^\n]*\n\s*)?void useLocaleStore\.getState\(\)\.init\(\);\s*\}, \[\]\);/,
  );
});

test("platform.ts：DesktopBridge 新增三个可选方法，形状与 IPC 契约一致", () => {
  const platform = read(join(RENDERER, "lib", "platform.ts"));
  for (const name of ["getPreferences", "setLocale", "onLocaleChanged"]) {
    assert.match(platform, new RegExp(name + "\\?:"), name);
  }
  assert.match(platform, /version: 1;/);
  assert.match(platform, /locale: "zh-CN" \| "en-US";/);
  assert.match(platform, /supported: string\[\];/);
  assert.match(platform, /ok: boolean;/);
  assert.match(platform, /error\?: string;/);
  assert.match(platform, /onLocaleChanged\?:[\s\S]*?=> \(\) => void;/);
});

test("locale-store：镜像键与 DOM/桥访问符合方案（ans.locale、lib/platform、document.lang）", () => {
  const storeSource = read(join(RENDERER, "i18n", "locale-store.ts"));
  const store = codeOnly(storeSource);
  assert.match(store, /LOCALE_STORAGE_KEY = "ans\.locale"/);
  assert.match(
    store,
    /import \{ getDesktopBridge, type DesktopBridge \} from "\.\.\/lib\/platform\.ts";/,
  );
  // 渲染层不得直接触碰 window.desktop（源码守卫同口径），也不得读偏好文件。
  assert.equal(/window\.desktop\b/.test(store), false);
  assert.equal(/\breadFile\b|\bpreferences\.json\b/.test(store), false);
  assert.match(store, /document\.documentElement\.lang = locale/);
  assert.match(store, /translate\(/);
});
