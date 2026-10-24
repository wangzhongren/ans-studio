// test/项目管理/shared/i18n.test.ts
// 项目管理：共享国际化（i18n）B0 契约的行为验证。
//
// 覆盖（团队计划 §4.3 项目管理「可观察交付」/验收标准 P1、P4、P7）：
//  · locale 解析（合法/非法/大小写/非字符串）；
//  · zh-CN 与 en-US 目录 key 全集一致、B0 初始 key 齐全、zh-CN 沿用现有界面原文；
//  · 回退矩阵（en 缺 → zh + warning；两目录缺 → key + error；zh 缺不回退 en）；
//  · 插值、缺参数诊断、多余参数、HTML 不转义、不改入参；
//  · 复数（en one/other、zh other、0/1/2/多、缺变体回退 other、缺 other 诊断、缺 count）；
//  · 非法 locale 默认 zh-CN、诊断回调可注入且抛错不影响翻译；
//  · `Intl` 薄封装；
//  · 源码纯度（只导入相对模块，不依赖 Node/DOM/Electron）。
//
// 类型负例（缺 key/多 key 不被类型系统接受）在文件末尾的 `assertTypeLevelContracts`
// 中，以 `@ts-expect-error` 钉住；该函数不被调用，由 `npm run typecheck` 验证。

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  createTranslator,
  enUS,
  formatDateTime,
  formatNumber,
  resolveLocale,
  selectPluralCategory,
  translate,
  zhCN,
  type Catalog,
  type Locale,
  type MessageKey,
  type MessageParams,
  type MessageTemplate,
  type TranslateDiagnostic,
  type TranslateOptions,
} from "../../../src/common/shared/i18n/index.ts";
import { RUNTIME_SETTINGS } from "../../../src/common/shared/runtime-settings.ts";
import { RUNTIME_LABELS, RUNTIME_LABEL_KEYS } from "../../../src/common/shared/runtime-shared.ts";

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const I18N_DIR = join(ROOT, "src", "common", "shared", "i18n");

const B0_KEYS = [
  "ui.settings.language.title",
  "ui.settings.language.description",
  "ui.settings.language.zhCN",
  "ui.settings.language.enUS",
  "ui.settings.language.saveFailed",
  "main.window.title",
  "main.dialog.importProject.title",
  "main.dialog.pickImage.title",
  "main.error.startup.title",
  "main.error.startup.detail",
  "preferences.error.invalidLocale",
  "preferences.error.saveFailed",
  "preferences.error.readInvalid",
] as const satisfies readonly MessageKey[];

/** 测试合成 key：生产目录不含，必须显式 cast（运行时 API 只接受 MessageKey）。 */
function syntheticKey(key: string): MessageKey {
  return key as MessageKey;
}

function captureDiagnostics(): {
  diagnostics: TranslateDiagnostic[];
  options: TranslateOptions;
} {
  const diagnostics: TranslateDiagnostic[] = [];
  return {
    diagnostics,
    options: { onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) },
  };
}

function withCatalogs(
  catalogs: TranslateOptions["catalogs"],
  options?: TranslateOptions,
): TranslateOptions {
  return { ...options, catalogs };
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

// ---------------------------------------------------------------------------
// locale 契约
// ---------------------------------------------------------------------------

test("locale：SUPPORTED_LOCALES 只读且仅 zh-CN/en-US；DEFAULT_LOCALE 为 zh-CN", () => {
  assert.deepEqual([...SUPPORTED_LOCALES], ["zh-CN", "en-US"]);
  assert.equal(Object.isFrozen(SUPPORTED_LOCALES), true);
  assert.equal(DEFAULT_LOCALE, "zh-CN");
});

test("resolveLocale：白名单精确匹配；en/zh/大小写/空白/非字符串一律回退 zh-CN", () => {
  assert.equal(resolveLocale("zh-CN"), "zh-CN");
  assert.equal(resolveLocale("en-US"), "en-US");
  for (const value of [
    "en",
    "zh",
    "EN-US",
    "en-us",
    "En-Us",
    "zh-cn",
    " en-US",
    "en-US ",
    "",
    undefined,
    null,
    0,
    1,
    true,
    {},
    ["en-US"],
    new String("en-US"),
  ]) {
    assert.equal(
      resolveLocale(value),
      DEFAULT_LOCALE,
      `resolveLocale(${String(value)}) 应回退默认`,
    );
  }
});

// ---------------------------------------------------------------------------
// 目录 parity 与 B0 key
// ---------------------------------------------------------------------------

test("目录 parity：zh-CN 与 en-US key 全集一致，B0 初始 key 全部存在", () => {
  const zhKeys = Object.keys(zhCN).sort();
  const enKeys = Object.keys(enUS).sort();
  assert.deepEqual(enKeys, zhKeys);
  assert.ok(zhKeys.length >= B0_KEYS.length, "目录 key 数少于 B0 初始 key");
  for (const key of B0_KEYS) {
    assert.ok(key in zhCN, `zh-CN 缺 ${key}`);
    assert.ok(key in enUS, `en-US 缺 ${key}`);
  }
});

test("zh-CN 文案沿用现有界面原文（窗口标题/导入项目/选择图片/启动失败）", () => {
  assert.equal(zhCN["main.window.title"], "ANS 桌面应用（受治理会话）");
  assert.equal(zhCN["main.dialog.importProject.title"], "导入项目（选择项目根文件夹）");
  assert.equal(zhCN["main.dialog.pickImage.title"], "选择图片");
  assert.equal(zhCN["main.error.startup.title"], "应用启动失败");
  assert.equal(zhCN["main.error.startup.detail"], "界面无法启动，请查看诊断日志后重新打开。");
});

test("translate：zh-CN/en-US 正常取词（en-US 返回英文目录值）", () => {
  assert.equal(translate("zh-CN", "main.window.title"), zhCN["main.window.title"]);
  assert.equal(translate("en-US", "main.window.title"), enUS["main.window.title"]);
  assert.equal(translate("en-US", "main.window.title"), "ANS Desktop (Governed Sessions)");
});

// ---------------------------------------------------------------------------
// 回退矩阵
// ---------------------------------------------------------------------------

test("回退：en-US 缺 key → zh-CN 文案 + i18n.missing-key warning", () => {
  const { diagnostics, options } = captureDiagnostics();
  const text = translate("en-US", "main.window.title", undefined, {
    ...options,
    catalogs: { "en-US": {} },
  });
  assert.equal(text, zhCN["main.window.title"]);
  assert.deepEqual(diagnostics, [
    {
      code: "i18n.missing-key",
      locale: "en-US",
      key: "main.window.title",
      severity: "warning",
    },
  ]);
});

test("回退：两目录都缺 key → 返回 key 本身 + i18n.missing-key error", () => {
  const { diagnostics, options } = captureDiagnostics();
  const key = syntheticKey("test.key.missing.everywhere");
  const text = translate("en-US", key, undefined, options);
  assert.equal(text, "test.key.missing.everywhere");
  assert.deepEqual(diagnostics, [
    {
      code: "i18n.missing-key",
      locale: "en-US",
      key: "test.key.missing.everywhere",
      severity: "error",
    },
  ]);
});

test("回退：zh-CN 缺 key 时不回退 en-US（顺序只到 zh-CN → key）", () => {
  const { diagnostics, options } = captureDiagnostics();
  const text = translate("zh-CN", "main.window.title", undefined, {
    ...options,
    catalogs: { "zh-CN": {} },
  });
  assert.equal(text, "main.window.title");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "i18n.missing-key");
  assert.equal(diagnostics[0]?.severity, "error");
  assert.equal(diagnostics[0]?.locale, "zh-CN");
});

test("回退：非法 locale 在运行时回退 zh-CN（诊断 locale 也用生效值）", () => {
  assert.equal(
    translate("fr-FR" as Locale, "main.window.title"),
    zhCN["main.window.title"],
  );
  const { diagnostics, options } = captureDiagnostics();
  translate("fr-FR" as Locale, syntheticKey("test.key.missing"), undefined, options);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.locale, "zh-CN");
});

// ---------------------------------------------------------------------------
// 插值
// ---------------------------------------------------------------------------

const INTERPOLATION_ZH: Catalog = {
  "test.greeting": "你好，{name}！",
  "test.count": "共 {count} 项",
  "test.duplicate": "「{name}」「{name}」",
  "test.raw": "原样：{value}",
};
const INTERPOLATION_EN: Catalog = {
  "test.greeting": "Hello, {name}!",
  "test.count": "{count} items",
  "test.duplicate": "\"{name}\" and \"{name}\"",
  "test.raw": "Raw: {value}",
};

test("插值：{param} 替换字符串/数字；多余参数被忽略且无诊断", () => {
  const { diagnostics, options } = captureDiagnostics();
  const catalogs = { "zh-CN": INTERPOLATION_ZH, "en-US": INTERPOLATION_EN };
  assert.equal(
    translate("en-US", syntheticKey("test.greeting"), { name: "ANS" }, withCatalogs(catalogs, options)),
    "Hello, ANS!",
  );
  assert.equal(
    translate("zh-CN", syntheticKey("test.count"), { count: 3 }, withCatalogs(catalogs, options)),
    "共 3 项",
  );
  assert.equal(
    translate(
      "en-US",
      syntheticKey("test.greeting"),
      { name: "ANS", unused: 42 },
      withCatalogs(catalogs, options),
    ),
    "Hello, ANS!",
  );
  assert.deepEqual(diagnostics, []);
});

test("插值：缺参数保留占位符 + i18n.missing-param warning（同一参数只报一次）", () => {
  const { diagnostics, options } = captureDiagnostics();
  const catalogs = { "zh-CN": INTERPOLATION_ZH, "en-US": INTERPOLATION_EN };
  assert.equal(
    translate("zh-CN", syntheticKey("test.duplicate"), {}, withCatalogs(catalogs, options)),
    "「{name}」「{name}」",
  );
  assert.deepEqual(diagnostics, [
    {
      code: "i18n.missing-param",
      locale: "zh-CN",
      key: "test.duplicate",
      param: "name",
      severity: "warning",
    },
  ]);
});

test("插值：不做 HTML 转义/注入，参数值原样输出", () => {
  const catalogs = { "en-US": INTERPOLATION_EN };
  assert.equal(
    translate(
      "en-US",
      syntheticKey("test.raw"),
      { value: "<b>x</b> & \"y\"" },
      { catalogs },
    ),
    'Raw: <b>x</b> & "y"',
  );
});

test("插值：不修改入参 params 与目录；返回新的翻译字符串", () => {
  const catalogs = { "en-US": { ...INTERPOLATION_EN } };
  const params: MessageParams = { name: "ANS" };
  const paramsSnapshot = { ...params };
  const catalogSnapshot = { ...catalogs["en-US"] };
  const first = translate(
    "en-US",
    syntheticKey("test.greeting"),
    params,
    { catalogs },
  );
  const second = translate(
    "en-US",
    syntheticKey("test.greeting"),
    { name: "Other" },
    { catalogs },
  );
  assert.equal(first, "Hello, ANS!");
  assert.equal(second, "Hello, Other!");
  assert.notEqual(first, second);
  assert.deepEqual(params, paramsSnapshot);
  assert.deepEqual(catalogs["en-US"], catalogSnapshot);
  assert.equal(catalogs["en-US"]?.["test.greeting"], INTERPOLATION_EN["test.greeting"]);
});

// ---------------------------------------------------------------------------
// 复数
// ---------------------------------------------------------------------------

const PLURAL_EN: Catalog = {
  "test.files": { one: "{count} file", other: "{count} files" },
  "test.onlyOther": { other: "{count} item(s)" },
};
const PLURAL_ZH: Catalog = {
  "test.files": { other: "{count} 个文件" },
};

test("复数 en-US：1 → one；0/2/21 → other", () => {
  const catalogs = { "en-US": PLURAL_EN };
  const t = (count: number) =>
    translate("en-US", syntheticKey("test.files"), { count }, { catalogs });
  assert.equal(t(1), "1 file");
  assert.equal(t(0), "0 files");
  assert.equal(t(2), "2 files");
  assert.equal(t(21), "21 files");
});

test("复数 zh-CN：Intl 恒选 other（0/1/2/多均用 other 模板）", () => {
  assert.equal(selectPluralCategory("zh-CN", 1), "other");
  assert.equal(selectPluralCategory("zh-CN", 2), "other");
  const catalogs = { "zh-CN": PLURAL_ZH };
  for (const count of [0, 1, 2, 21]) {
    assert.equal(
      translate("zh-CN", syntheticKey("test.files"), { count }, { catalogs }),
      `${count} 个文件`,
    );
  }
});

test("复数：所选变体缺失时回退 other（无诊断）", () => {
  const { diagnostics, options } = captureDiagnostics();
  const catalogs = { "en-US": PLURAL_EN };
  // en-US 对 1 选 one；onlyOther 没有 one，应回退 other。
  assert.equal(
    translate("en-US", syntheticKey("test.onlyOther"), { count: 1 }, withCatalogs(catalogs, options)),
    "1 item(s)",
  );
  assert.deepEqual(diagnostics, []);
});

test("复数：模板缺 other → 返回 key + i18n.missing-key error", () => {
  const { diagnostics, options } = captureDiagnostics();
  const catalogs: Catalog = { "test.noOther": { one: "{count} file" } };
  const text = translate(
    "en-US",
    syntheticKey("test.noOther"),
    { count: 1 },
    withCatalogs({ "en-US": catalogs }, options),
  );
  assert.equal(text, "test.noOther");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "i18n.missing-key");
  assert.equal(diagnostics[0]?.severity, "error");
});

test("复数：缺 count / count 非数字 → 回退 other + i18n.missing-param warning", () => {
  const { diagnostics, options } = captureDiagnostics();
  const catalogs = { "en-US": PLURAL_EN };
  assert.equal(
    translate("en-US", syntheticKey("test.onlyOther"), {}, withCatalogs(catalogs, options)),
    "{count} item(s)",
  );
  assert.equal(
    translate(
      "en-US",
      syntheticKey("test.onlyOther"),
      { count: "1" },
      withCatalogs(catalogs, options),
    ),
    "1 item(s)",
  );
  assert.equal(diagnostics.length, 2);
  for (const diagnostic of diagnostics) {
    assert.equal(diagnostic.code, "i18n.missing-param");
    assert.equal(diagnostic.param, "count");
    assert.equal(diagnostic.severity, "warning");
  }
});

// ---------------------------------------------------------------------------
// 诊断、translator 与格式化
// ---------------------------------------------------------------------------

test("诊断回调可注入；回调抛错不中断翻译", () => {
  const text = translate(
    "en-US",
    syntheticKey("test.key.missing"),
    undefined,
    {
      onDiagnostic: () => {
        throw new Error("diagnostic sink failed");
      },
    },
  );
  assert.equal(text, "test.key.missing");
});

test("createTranslator：绑定 locale 与诊断选项", () => {
  const { diagnostics, options } = captureDiagnostics();
  const t = createTranslator("en-US", options);
  assert.equal(t("main.window.title"), enUS["main.window.title"]);
  assert.equal(t(syntheticKey("test.key.missing")), "test.key.missing");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "i18n.missing-key");

  const zh = createTranslator("zh-CN");
  assert.equal(zh("main.window.title"), zhCN["main.window.title"]);
});

test("Intl 封装：formatNumber/formatDateTime/selectPluralCategory 按 locale 工作", () => {
  assert.equal(formatNumber("en-US", 1234.5), "1,234.5");
  assert.equal(
    formatNumber("en-US", 1234.5, { minimumFractionDigits: 2 }),
    "1,234.50",
  );
  const date = new Date(Date.UTC(2026, 9, 23));
  const dateOptions = {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  } as const;
  assert.equal(formatDateTime("en-US", date, dateOptions), "10/23/2026");
  assert.equal(formatDateTime("zh-CN", date, dateOptions), "2026/10/23");
  assert.equal(selectPluralCategory("en-US", 1), "one");
  assert.equal(selectPluralCategory("en-US", 0), "other");
  assert.equal(selectPluralCategory("en-US", 21), "other");
  assert.equal(selectPluralCategory("zh-CN", 1), "other");
  // 运行时不可信 locale 同样回退默认语言。
  assert.equal(formatNumber("de-DE" as Locale, 1234.5), "1,234.5");
});

// ---------------------------------------------------------------------------
// B1–B4 key 契约（2026-10-23 一次性共享 key；消费方迁移在后续批次）
// ---------------------------------------------------------------------------

/**
 * B1/B2 渲染层锚点 key：每个组件至少一个，防止整块组件漏 key。
 * 完整清单以 zh-CN 目录为准；这里只钉住「分区存在且未整体丢失」。
 */
const B1_B2_ANCHOR_KEYS = [
  "ui.titlebar.minimize",
  "ui.app.missingRoot",
  "ui.chatHeader.selectRoleHint",
  "ui.role.boundaryCount",
  "ui.sidebar.noRolesInProject",
  "ui.queue.withdrawTitle",
  "ui.queueSubview.showAll",
  "ui.work.viewAllQueue",
  "ui.drawer.collapseTitle",
  "ui.engineSelect.ariaCurrent",
  "ui.composer.queuedPosition",
  "ui.confirm.failedShell",
  "ui.settings.incomplete",
  "ui.runtimeConfig.readFailedWithDetail",
  "ui.governance.mismatch.summary",
  "ui.reportCard.disclaimer",
  "ui.reportView.saveError.conflict",
  "ui.documentView.expired",
  "ui.document.error.tooLarge",
  "ui.profile.emptySub",
  "ui.queue.title",
  "ui.status.title.working",
  "ui.chatRow.pathResult",
  "ui.chatStore.openFailedWithReason",
  "ui.chatStream.empty.openedSub",
  "ui.tool.summaryWithTools",
  "ui.events.dispatchTaskWithRole",
  "ui.reasoning.thoughtSeconds",
  "ui.markdown.openFailed",
  "ui.operator.expiredRetry",
  "ui.judge.scopeNote",
  "ui.drawerStore.refreshFailed",
  "ui.governanceStore.reacceptEffect",
  "ui.reportStore.statusUnavailable",
  "ui.settingsStore.saveChannelUnavailable",
] as const satisfies readonly MessageKey[];

/** B3 主进程锚点 key：每个 app/desktop 来源文件至少一个。 */
const B3_ANCHOR_KEYS = [
  "main.common.recoveryPageTitle",
  "main.session.dispatchGateRejected",
  "main.session.recoveryAutoText",
  "main.session.install.installedSkill",
  "main.session.delivery.noTarget",
  "main.interface.verifierFinished",
  "main.interface.writeBlockingSummary",
  "main.governance.acceptanceBlocked",
  "main.history.sessionReadFailed",
  "main.composerImages.typeUnsupported",
  "main.confirm.expiredTimeout",
  "main.recovery.expired",
  "main.operator.judgeResultDeliveryFailed",
  "main.operator.shellReview.title",
  "main.customerInput.judgeWriteHead",
  "main.judgeReason.readDeniedTail",
  "main.runtimeConfig.choiceInvalid",
  "main.project.governanceInvalid",
  "main.runtimeResolution.noRuntime",
  "main.watchdog.turnAbortedText",
  "main.demo.turnEnded",
] as const satisfies readonly MessageKey[];

/** B4 共享元数据锚点 key（`runtime-settings.ts` / `runtime-shared.ts` 的每个文案族）。 */
const B4_ANCHOR_KEYS = [
  "shared.runtimeSettings.runtime.demo",
  "shared.runtimeSettings.pi.token.label",
  "shared.runtimeSettings.field.apiBaseUrl.label",
  "shared.runtimeSettings.field.apiKey.label",
  "shared.runtimeSettings.field.model.label",
  "shared.runtimeSettings.pi.contextWindow.label",
  "shared.runtimeSettings.pi.contextWindow.help",
  "shared.runtimeSettings.pi.contextWindow.choice.default",
  "shared.runtimeSettings.pi.contextWindow.choice.k32",
  "shared.runtimeSettings.pi.promptTimeout.label",
  "shared.runtimeSettings.pi.promptTimeout.help",
  "shared.runtimeSettings.pi.promptTimeout.choice.default",
  "shared.runtimeSettings.pi.promptTimeout.choice.m1",
  "shared.runtimeSettings.reasoning.label",
  "shared.runtimeSettings.reasoning.help",
  "shared.runtimeSettings.reasoning.choice.off",
  "shared.runtimeSettings.codex.apiKey.help",
  "shared.runtimeSettings.codex.apiBaseUrl.help",
  "shared.runtimeSettings.claude.model.help",
  "shared.runtimeSettings.claude.apiBaseUrl.help",
  "shared.common.unknownReason",
  "shared.common.safeCopyTitle",
] as const satisfies readonly MessageKey[];

/**
 * key 规范：ASCII 段、点分隔，每段以字母开头（允许 camelCase / 数字 / 连字符）。
 * 依据任务契约与 B0/方案示例（`ui.shell.titleBar.minimize`、`shared.runtimeSettings.pi.token.label`、
 * `main.dispatch.rejected.roleNotFound`）；不含中文、空格或运行时拼接。
 */
const MESSAGE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$/;

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

function placeholdersOf(template: MessageTemplate): string[] {
  const texts = typeof template === "string" ? [template] : Object.values(template);
  const names = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(PLACEHOLDER_PATTERN)) names.add(match[1] as string);
  }
  return [...names].sort();
}

function valueContainsHan(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}

test("B1–B4 key 分区：ui/main/shared 计数与总 key 数符合契约（漏 key 或顺手加 key 需显式更新本断言）", () => {
  const keys = Object.keys(zhCN);
  const prefixes = {
    ui: keys.filter((key) => key.startsWith("ui.")).length,
    main: keys.filter((key) => key.startsWith("main.")).length,
    shared: keys.filter((key) => key.startsWith("shared.")).length,
    preferences: keys.filter((key) => key.startsWith("preferences.")).length,
  };
  assert.deepEqual(prefixes, {
    ui: 698, // B0 5 + B1/B2 676 + 2026-10-23 key supplement 10 + role-root-docs S5 7
    main: 486, // B0 5 + B3 452 + 2026-10-23 B3 key supplement 23 + acceptance-rework routing 6
    shared: 62, // B4 元数据 + 跨层通用短词
    preferences: 3, // B0
  });
  assert.equal(keys.length, 1249);
  // B1/B2 与 B3 分区（扣除 B0 的 5 个 ui.* / 5 个 main.*）。
  assert.equal(prefixes.ui - B0_KEYS.filter((key) => key.startsWith("ui.")).length, 693);
  assert.equal(prefixes.main - B0_KEYS.filter((key) => key.startsWith("main.")).length, 481);
});

test("B1–B4 锚点 key：每个组件/来源文件的代表 key 全部存在（zh + en）", () => {
  for (const key of [...B1_B2_ANCHOR_KEYS, ...B3_ANCHOR_KEYS, ...B4_ANCHOR_KEYS]) {
    assert.ok(key in zhCN, `zh-CN 缺锚点 key：${key}`);
    assert.ok(key in enUS, `en-US 缺锚点 key：${key}`);
  }
});

/**
 * 2026-10-23 B1/B2 key 增补（桌面UI 残余扫描登记的共享目录缺口；消费方迁移另批）。
 * 只补渲染层 ui.*，不收紧 allowlist、不改 app/**。
 */
const B1_B2_KEY_SUPPLEMENT_KEYS = [
  // shell/ChatHeader.tsx：tab 独立标签（同时供 QueueSubview 可见返回文本复用）
  "ui.chatHeader.tabWork",
  "ui.chatHeader.tabCard",
  // chat/runtime-config.ts：空错误兜底（前缀复用 saveFailed/saveException）
  "ui.runtimeConfig.unknownError",
  // chat/runtime-config.ts：零改动键保存条（非零分支复用 saveNoteShort）
  "ui.settings.saveNoteNoChanges",
  // stores/confirm-store.ts：无 reason 的失效兜底（带括号版本见 shared.common.shellConfirmationExpired）
  "ui.confirm.expiredShell",
  // stores/governance-store.ts：nextStep 兜底
  "ui.governanceStore.stepFallback",
  // chat/judge.ts：顺序与 ui.role.governance.*.name 相反的两个内置角色名
  "ui.judge.roleName.liaison",
  "ui.judge.roleName.verifier",
  // chat/judge.ts：路径 > 3 的完整标题（替代「 等 N 个」字符串拼接）
  "ui.judge.headline.writeConfirmOverflow",
  // chat/report-view.ts：历史保存 pending
  "ui.reportView.savingHistory",
] as const satisfies readonly MessageKey[];

test("B1/B2 key 增补：10 个 key 全部存在（zh + en），zh 逐字取当前源码", () => {
  for (const key of B1_B2_KEY_SUPPLEMENT_KEYS) {
    assert.ok(key in zhCN, `zh-CN 缺增补 key：${key}`);
    assert.ok(key in enUS, `en-US 缺增补 key：${key}`);
  }
  assert.equal(zhCN["ui.chatHeader.tabWork"], "工作概览");
  assert.equal(zhCN["ui.chatHeader.tabCard"], "角色资料");
  assert.equal(zhCN["ui.runtimeConfig.unknownError"], "未知错误");
  assert.equal(
    zhCN["ui.settings.saveNoteNoChanges"],
    "已保存到 .env（改动键 无）。{tail}{application}",
  );
  assert.equal(
    zhCN["ui.confirm.expiredShell"],
    "此确认已失效，未获放行——请让角色重新发起。",
  );
  assert.equal(zhCN["ui.governanceStore.stepFallback"], "治理步骤");
  assert.equal(zhCN["ui.judge.roleName.liaison"], "主理");
  assert.equal(zhCN["ui.judge.roleName.verifier"], "验收");
  assert.deepEqual(zhCN["ui.judge.headline.writeConfirmOverflow"], {
    other: "确认写入 {count} 个路径（{paths} 等 {count} 个）",
  });
  assert.equal(zhCN["ui.reportView.savingHistory"], "正在保存历史…");
});

test("B1/B2 key 增补：en-US 自然英文；judge 复用 3 个既有治理角色名", () => {
  assert.equal(enUS["ui.chatHeader.tabWork"], "Work overview");
  assert.equal(enUS["ui.chatHeader.tabCard"], "Role profile");
  assert.equal(enUS["ui.runtimeConfig.unknownError"], "Unknown error");
  assert.equal(
    enUS["ui.settings.saveNoteNoChanges"],
    "Saved to .env (no keys changed). {tail} {application}",
  );
  assert.equal(
    enUS["ui.confirm.expiredShell"],
    "This confirmation has expired and was not approved — ask the role to initiate it again.",
  );
  assert.equal(enUS["ui.governanceStore.stepFallback"], "Governance step");
  assert.equal(enUS["ui.judge.roleName.liaison"], "Lead");
  assert.equal(enUS["ui.judge.roleName.verifier"], "Proof");
  assert.equal(enUS["ui.reportView.savingHistory"], "Saving history…");
  // 顺序相同的三个内置治理角色名不重复收录，复用既有 ui.role.governance.*.name。
  assert.equal(zhCN["ui.role.governance.draft.name"], "提案");
  assert.equal(zhCN["ui.role.governance.crew.name"], "组队");
  assert.equal(zhCN["ui.role.governance.steward.name"], "统筹");
  assert.equal(enUS["ui.role.governance.draft.name"], "Draft");
  assert.equal(enUS["ui.role.governance.crew.name"], "Crew");
  assert.equal(enUS["ui.role.governance.steward.name"], "Steward");
});

test("zh-CN 内置角色名：治理角色与 judge 角色名为纯中文；目录值不含英文角色别名", () => {
  const roleNameKeys = [
    "ui.role.governance.liaison.name",
    "ui.role.governance.draft.name",
    "ui.role.governance.crew.name",
    "ui.role.governance.steward.name",
    "ui.role.governance.verifier.name",
    "ui.judge.roleName.liaison",
    "ui.judge.roleName.verifier",
  ] as const satisfies readonly MessageKey[];
  assert.deepEqual(
    roleNameKeys.map((key) => zhCN[key]),
    ["主理", "提案", "组队", "统筹", "验收", "主理", "验收"],
  );
  for (const key of roleNameKeys) {
    assert.match(String(zhCN[key]), /^[\p{Script=Han}]+$/u, `zh-CN 角色名必须为纯中文：${key}`);
  }
  // 中文目录值不得再出现英文角色别名（en-US 保持英文，不在本断言范围）。
  const aliasPattern =
    /\b(?:lead|draft|crew|steward|proof|convener|nominator|verifier|liaison|rapporteur)\b/i;
  for (const [key, template] of Object.entries(zhCN)) {
    const text = typeof template === "string" ? template : Object.values(template).join("");
    assert.equal(aliasPattern.test(text), false, `zh-CN 值含英文角色别名：${key}`);
  }
});

test("B1/B2 key 增补：插值与复数（overflow 标题按 count 选 other/one；保存条无 count）", () => {
  assert.equal(
    translate("zh-CN", "ui.judge.headline.writeConfirmOverflow", {
      count: 5,
      paths: "docs/a.md、docs/b.md、docs/c.md",
    }),
    "确认写入 5 个路径（docs/a.md、docs/b.md、docs/c.md 等 5 个）",
  );
  assert.equal(
    translate("en-US", "ui.judge.headline.writeConfirmOverflow", {
      count: 5,
      paths: "docs/a.md, docs/b.md, docs/c.md",
    }),
    "Confirm writing 5 paths (docs/a.md, docs/b.md, docs/c.md, etc.)",
  );
  // 复数模板：count=1 选 one（渲染路径固定 >3，此处只验证模板本身）。
  assert.equal(
    translate("en-US", "ui.judge.headline.writeConfirmOverflow", {
      count: 1,
      paths: "docs/a.md",
    }),
    "Confirm writing 1 path (docs/a.md, etc.)",
  );
  // 零改动键保存条与既有非零分支/尾句 key 组合后逐字一致。
  assert.equal(
    translate("zh-CN", "ui.settings.saveNoteNoChanges", {
      tail: translate("zh-CN", "ui.settings.requiredReady"),
      application: translate("zh-CN", "ui.settings.applicationNextSession"),
    }),
    "已保存到 .env（改动键 无）。必填配置已齐备。下一次开启会话时应用。",
  );
  assert.equal(
    translate("en-US", "ui.settings.saveNoteNoChanges", {
      tail: translate("en-US", "ui.settings.requiredReady"),
      application: translate("en-US", "ui.settings.applicationNextSession"),
    }),
    "Saved to .env (no keys changed). Required configuration is complete. Applied when the next session opens.",
  );
});

/**
 * 2026-10-23 角色根文档展示（role-root-docs-display，T2）S5：`ui.profile.*` key。
 * 依据方案 §5.5.6 / 团队计划 §3.4：4 个必需 key（根文档分组、`docs/` 分组、整节空态、
 * 单文件只读打开标签）+ 3 个可选副标签（功能导航/模块视图/接口报告）。
 * 文件名、路径（`docs/`）与 `not-applicable` 是内容/路径标识，不翻译；memo 无 key/开关。
 */
const ROLE_ROOT_DOC_REQUIRED_KEYS = [
  "ui.profile.docsGroupRoot",
  "ui.profile.docsGroupSubdir",
  "ui.profile.noRoleDocs",
  "ui.profile.openRootDoc",
] as const satisfies readonly MessageKey[];

const ROLE_ROOT_DOC_OPTIONAL_KEYS = [
  "ui.profile.rootDoc.featureMap",
  "ui.profile.rootDoc.functionalDescription",
  "ui.profile.rootDoc.apiSpec",
] as const satisfies readonly MessageKey[];

const ROLE_ROOT_DOC_KEYS = [
  ...ROLE_ROOT_DOC_REQUIRED_KEYS,
  ...ROLE_ROOT_DOC_OPTIONAL_KEYS,
] as const;

const ROLE_ROOT_DOC_PLACEHOLDERS: Record<(typeof ROLE_ROOT_DOC_KEYS)[number], string[]> = {
  "ui.profile.docsGroupRoot": [],
  "ui.profile.docsGroupSubdir": [],
  "ui.profile.noRoleDocs": [],
  "ui.profile.openRootDoc": ["name"],
  "ui.profile.rootDoc.featureMap": [],
  "ui.profile.rootDoc.functionalDescription": [],
  "ui.profile.rootDoc.apiSpec": [],
};

const ROLE_ROOT_DOC_UNTRANSLATED_TOKENS = [
  "feature-map.md",
  "functional-description.md",
  "api-spec.md",
  "memo.md",
  "changelog.md",
  "not-applicable",
] as const;

test("角色根文档 key：4 个必需 + 3 个可选副标签在 zh-CN/en-US 均存在、无单边、占位符一致", () => {
  assert.equal(ROLE_ROOT_DOC_REQUIRED_KEYS.length, 4);
  assert.equal(ROLE_ROOT_DOC_OPTIONAL_KEYS.length, 3);
  for (const key of ROLE_ROOT_DOC_KEYS) {
    assert.ok(key in zhCN, `zh-CN 缺 ${key}`);
    assert.ok(key in enUS, `en-US 缺 ${key}`);
    assert.equal(key.startsWith("ui.profile."), true, `key 必须位于 ui.profile.*：${key}`);
    assert.deepEqual(
      placeholdersOf(zhCN[key]),
      ROLE_ROOT_DOC_PLACEHOLDERS[key],
      `zh-CN 占位符不符契约：${key}`,
    );
    assert.deepEqual(
      placeholdersOf(enUS[key]),
      ROLE_ROOT_DOC_PLACEHOLDERS[key],
      `en-US 占位符不符契约：${key}`,
    );
    assert.deepEqual(placeholdersOf(enUS[key]), placeholdersOf(zhCN[key]), `占位符不一致：${key}`);
  }
  // memo 不得因 key/标签被展示：`ui.profile.*` 不得新增任何 memo 相关 key
  // （显示过滤是兜底，不是安全边界；`main.interface.memoNoContinuation` 是既有的写卡校验文案，不属展示开关）。
  assert.equal(
    Object.keys(zhCN).some((key) => key.startsWith("ui.profile.") && /memo/i.test(key)),
    false,
    "不得新增 memo 显示开关/标签 key",
  );
});

test("角色根文档 key：zh-CN/en-US 取值与分组/空态/打开标签语义；文件名/路径不翻译", () => {
  assert.equal(zhCN["ui.profile.docsGroupRoot"], "角色根文档");
  assert.equal(enUS["ui.profile.docsGroupRoot"], "Role root documents");
  assert.equal(zhCN["ui.profile.docsGroupSubdir"], "docs/ 目录");
  assert.equal(enUS["ui.profile.docsGroupSubdir"], "docs/ directory");
  assert.equal(zhCN["ui.profile.noRoleDocs"], "（暂无角色文档）");
  assert.equal(enUS["ui.profile.noRoleDocs"], "(no role documents)");
  assert.equal(zhCN["ui.profile.openRootDoc"], "只读打开 {name}");
  assert.equal(enUS["ui.profile.openRootDoc"], "Open {name} read-only");
  assert.equal(zhCN["ui.profile.rootDoc.featureMap"], "功能导航");
  assert.equal(enUS["ui.profile.rootDoc.featureMap"], "Feature map");
  assert.equal(zhCN["ui.profile.rootDoc.functionalDescription"], "模块视图与代码位置");
  assert.equal(
    enUS["ui.profile.rootDoc.functionalDescription"],
    "Module view and code locations",
  );
  assert.equal(zhCN["ui.profile.rootDoc.apiSpec"], "接口 / 实现报告");
  assert.equal(enUS["ui.profile.rootDoc.apiSpec"], "API / implementation report");

  // 路径标识 `docs/` 原样保留，不翻译（中英文分组标题都含字面量 docs/）。
  assert.ok(zhCN["ui.profile.docsGroupSubdir"].includes("docs/"), "zh-CN 分组标题必须保留 docs/");
  assert.ok(enUS["ui.profile.docsGroupSubdir"].includes("docs/"), "en-US 分组标题必须保留 docs/");

  // 文件名/内容标识不进入标签；打开按钮经 {name} 原样拼接文件名。
  for (const key of ROLE_ROOT_DOC_KEYS) {
    for (const template of [zhCN[key], enUS[key]]) {
      const text = typeof template === "string" ? template : Object.values(template).join("");
      for (const token of ROLE_ROOT_DOC_UNTRANSLATED_TOKENS) {
        assert.equal(text.includes(token), false, `${key} 不得翻译/内嵌内容标识 ${token}`);
      }
    }
  }
  assert.equal(
    translate("zh-CN", "ui.profile.openRootDoc", { name: "feature-map.md" }),
    "只读打开 feature-map.md",
  );
  assert.equal(
    translate("en-US", "ui.profile.openRootDoc", { name: "feature-map.md" }),
    "Open feature-map.md read-only",
  );

  // en-US 不混入中文；整节空态是括号文案（非路径/非文件名）。
  for (const key of ROLE_ROOT_DOC_KEYS) {
    const value = enUS[key];
    const text = typeof value === "string" ? value : Object.values(value).join("");
    assert.equal(valueContainsHan(text), false, `en-US 含中文：${key}`);
  }
  assert.match(zhCN["ui.profile.noRoleDocs"], /^（.+）$/u);
  assert.match(enUS["ui.profile.noRoleDocs"], /^\(.+\)$/u);
});

/**
 * 2026-10-23 B3 主进程 key 增补（B3 报告 §5.2 中经分类确认为用户可见的缺口；
 * agent-facing 任务/反馈、机器标识与 B4 范围不补 key）。消费方迁移另批。
 * 第 22 项 `main.session.dispatchModelNote` 为 B3 收尾扫出的最后一个用户可见缺 key
 * （`dispatchWrongSource` 的 `{modelNote}` 片段，源码 `session.ts` 逐字）；
 * 第 23 项 `main.interface.teamPlanMissingBoundHint` 为协调方追加（`interface.ts:4582` 的
 * `{bound}` 片段，拼进 `teamPlanMissingBound`/`teamPlanMissingShort`）。
 */
const B3_KEY_SUPPLEMENT_KEYS = [
  // session.ts：release 回执、澄清系统行、派发/回交回执、派发拒绝模型注记、运行时配置变更片段、安装动词
  "main.session.releaseNoSession",
  "main.session.clarificationDelivery",
  "main.session.delivery.receivedDispatch",
  "main.session.delivery.handbackFailedShort",
  "main.session.dispatchModelNote",
  "main.session.rebuildChangedRuntimeConfig",
  "main.session.install.verbInstall",
  "main.session.install.verbUninstall",
  // customer-input.ts：judge 代批零路径/溢出整句、自动审批/自动决策标签
  "main.customerInput.judgeWriteHeadZero",
  "main.customerInput.judgeWriteHeadOverflow",
  "main.customerInput.autoApprovalLabel",
  "main.customerInput.autoDecisionLabel",
  // watchdog.ts：队列行摘要（信号名已本地化，模板补齐）
  "main.watchdog.signalSummary",
  "main.watchdog.queueStuckSummary",
  "main.watchdog.repeatFailSummary",
  // interface.ts：写卡/计划校验 issue 文本、恢复/僵尸系统行片段、团队计划绑定片段
  "main.interface.docEmpty",
  "main.interface.boundaryDeclaredMissing",
  "main.interface.teamPlanMissingNoRoles",
  "main.interface.teamPlanMissingBoundHint",
  "main.interface.roleCardsStepMissing",
  "main.interface.readErrorExistingSuffix",
  "main.interface.queueRecoveredLine",
  "main.interface.staleStepFact",
] as const satisfies readonly MessageKey[];

test("B3 key 增补：23 个 key 全部存在（zh + en），zh 逐字取当前源码", () => {
  for (const key of B3_KEY_SUPPLEMENT_KEYS) {
    assert.ok(key in zhCN, `zh-CN 缺增补 key：${key}`);
    assert.ok(key in enUS, `en-US 缺增补 key：${key}`);
  }
  assert.equal(zhCN["main.session.releaseNoSession"], "角色 {roleId} 没有打开的会话。");
  assert.equal(zhCN["main.session.clarificationDelivery"], "提案需要澄清：{question}");
  assert.equal(
    zhCN["main.session.delivery.receivedDispatch"],
    "已接收来自 {role} 的派发任务——请按任务文本执行，完成后交回报告。",
  );
  assert.equal(
    zhCN["main.session.delivery.handbackFailedShort"],
    "回交投递失败（来自 {sourceRoleId}）：{detail}",
  );
  assert.equal(
    zhCN["main.session.dispatchModelNote"],
    "（trio：统筹或主理）",
  );
  assert.equal(zhCN["main.session.rebuildChangedRuntimeConfig"], "运行时配置");
  assert.equal(zhCN["main.session.install.verbInstall"], "安装");
  assert.equal(zhCN["main.session.install.verbUninstall"], "卸载");
  assert.equal(zhCN["main.customerInput.judgeWriteHeadZero"], "judge 代批 · 代审批：确认写入 0 个路径");
  assert.deepEqual(zhCN["main.customerInput.judgeWriteHeadOverflow"], {
    other: "judge 代批 · 代审批：确认写入 {count} 个路径（{paths}等 {count} 个）",
  });
  assert.equal(zhCN["main.customerInput.autoApprovalLabel"], "自动审批");
  assert.equal(zhCN["main.customerInput.autoDecisionLabel"], "自动决策");
  assert.equal(zhCN["main.watchdog.signalSummary"], "系统·看护 · {signal} · 角色 {roleId}");
  assert.equal(
    zhCN["main.watchdog.queueStuckSummary"],
    "系统·看护 · {signal} · 角色 {roleId}（深度 {depth}）",
  );
  assert.equal(
    zhCN["main.watchdog.repeatFailSummary"],
    "系统·看护 · {signal} · 角色 {roleId}（{count} 次）",
  );
  assert.equal(zhCN["main.interface.docEmpty"], "文件为空（需要正文）");
  assert.equal(zhCN["main.interface.boundaryDeclaredMissing"], "未提供");
  assert.equal(zhCN["main.interface.teamPlanMissingNoRoles"], "缺少团队计划/任命名单，未派发写卡任务");
  assert.equal(zhCN["main.interface.teamPlanMissingBoundHint"], "（账本 appointment 绑定 {plan}）");
  assert.equal(
    zhCN["main.interface.roleCardsStepMissing"],
    "流程缺少 id 为 \"{stepId}\" 的步骤（团队计划存在但 flow 未声明 role-cards，无法完成收口；请统筹补齐 flow 步骤）。",
  );
  assert.equal(zhCN["main.interface.readErrorExistingSuffix"], "（existing/legacy：仅提醒）");
  assert.equal(zhCN["main.interface.queueRecoveredLine"], "- [{kind}] {summary}（角色 {roleId} · {runtime}）");
  assert.equal(zhCN["main.interface.staleStepFact"], "- 步骤 {stepId}（owner: {owner}，status: {status}）");
});

test("B3 key 增补：en-US 自然英文；三个缺口复用既有同文案 key（不新增重复文案）", () => {
  assert.equal(enUS["main.session.releaseNoSession"], "Role {roleId} has no open session.");
  assert.equal(
    enUS["main.session.clarificationDelivery"],
    "Draft (proposal) needs clarification: {question}",
  );
  assert.equal(
    enUS["main.session.delivery.receivedDispatch"],
    "Received a dispatched task from {role} — follow the task text and hand back a report when done.",
  );
  assert.equal(
    enUS["main.session.delivery.handbackFailedShort"],
    "Handback delivery failed (from {sourceRoleId}): {detail}",
  );
  // 前导空格：拼接在 `... dispatch owner {dispatcher}{modelNote}.` 之后自然成句。
  assert.equal(enUS["main.session.dispatchModelNote"], " (trio: Steward or Lead)");
  assert.equal(enUS["main.session.rebuildChangedRuntimeConfig"], "runtime configuration");
  assert.equal(enUS["main.session.install.verbInstall"], "install");
  assert.equal(enUS["main.session.install.verbUninstall"], "uninstall");
  assert.equal(
    enUS["main.customerInput.judgeWriteHeadZero"],
    "judge delegation · approval: confirm writing 0 paths",
  );
  assert.deepEqual(enUS["main.customerInput.judgeWriteHeadOverflow"], {
    one: "judge delegation · approval: confirm writing {count} path ({paths}, etc.)",
    other: "judge delegation · approval: confirm writing {count} paths ({paths}, etc.)",
  });
  assert.equal(enUS["main.customerInput.autoApprovalLabel"], "Auto-approval");
  assert.equal(enUS["main.customerInput.autoDecisionLabel"], "Auto-decision");
  assert.equal(enUS["main.watchdog.signalSummary"], "System·Watchdog · {signal} · role {roleId}");
  assert.equal(
    enUS["main.watchdog.queueStuckSummary"],
    "System·Watchdog · {signal} · role {roleId} (depth {depth})",
  );
  assert.equal(
    enUS["main.watchdog.repeatFailSummary"],
    "System·Watchdog · {signal} · role {roleId} ({count} times)",
  );
  assert.equal(enUS["main.interface.docEmpty"], "File is empty (body required)");
  assert.equal(enUS["main.interface.boundaryDeclaredMissing"], "not provided");
  assert.equal(
    enUS["main.interface.teamPlanMissingNoRoles"],
    "Missing team plan/appointment list; card-writing task not dispatched",
  );
  // 前导空格：拼接在 `...team-vN.md){bound}` / `Team plan missing{bound}` 之后自然成句。
  assert.equal(
    enUS["main.interface.teamPlanMissingBoundHint"],
    " (appointment ledger bound to {plan})",
  );
  assert.equal(
    enUS["main.interface.roleCardsStepMissing"],
    "The flow is missing the step with id \"{stepId}\" (the team plan exists but the flow does not declare role-cards, so closure cannot complete; ask the Convener to add the flow step).",
  );
  assert.equal(enUS["main.interface.readErrorExistingSuffix"], " (existing/legacy: warning only)");
  assert.equal(
    enUS["main.interface.queueRecoveredLine"],
    "- [{kind}] {summary} (role {roleId} · {runtime})",
  );
  assert.equal(enUS["main.interface.staleStepFact"], "- Step {stepId} (owner: {owner}, status: {status})");
  // 复用既有 key（B3 配对时不得再收第二份同文案）：
  assert.equal(zhCN["ui.events.dispatchTask"], "派发任务");
  assert.equal(enUS["ui.events.dispatchTask"], "Dispatched task");
  assert.equal(zhCN["ui.composer.imageFallbackName"], "图片");
  assert.equal(enUS["ui.composer.imageFallbackName"], "Image");
  assert.equal(zhCN["main.watchdog.repeatFailUnknown"], "（未知）");
  assert.equal(enUS["main.watchdog.repeatFailUnknown"], "(unknown)");
});

test("B3 key 增补：插值与复数（overflow 按 count 选 one/other；队列/僵尸行占位符；派发拒绝模型注记与团队计划绑定片段拼接）", () => {
  assert.equal(
    translate("zh-CN", "main.interface.teamPlanMissingBoundHint", { plan: "docs/scheduling/x-team-v2.md" }),
    "（账本 appointment 绑定 docs/scheduling/x-team-v2.md）",
  );
  assert.equal(
    translate("en-US", "main.interface.teamPlanMissingBoundHint", { plan: "docs/scheduling/x-team-v2.md" }),
    " (appointment ledger bound to docs/scheduling/x-team-v2.md)",
  );
  assert.equal(
    translate("zh-CN", "main.interface.teamPlanMissingShort", {
      bound: translate("zh-CN", "main.interface.teamPlanMissingBoundHint", {
        plan: "docs/scheduling/x-team-v2.md",
      }),
    }),
    "团队计划缺失（账本 appointment 绑定 docs/scheduling/x-team-v2.md）；未派组队写卡（不猜计划、不自行扩大职责）",
  );
  assert.equal(
    translate("en-US", "main.interface.teamPlanMissingShort", {
      bound: translate("en-US", "main.interface.teamPlanMissingBoundHint", {
        plan: "docs/scheduling/x-team-v2.md",
      }),
    }),
    "Team plan missing (appointment ledger bound to docs/scheduling/x-team-v2.md); Crew card-writing not dispatched (no guessing plans, no unilateral scope expansion)",
  );
  assert.equal(
    translate("zh-CN", "main.session.dispatchWrongSource", {
      from: "组队",
      dispatcher: "统筹",
      modelNote: translate("zh-CN", "main.session.dispatchModelNote"),
    }),
    "派发未受理：来源角色 组队 不是本项目派发主人 统筹（trio：统筹或主理）。",
  );
  assert.equal(
    translate("en-US", "main.session.dispatchWrongSource", {
      from: "Crew",
      dispatcher: "Steward",
      modelNote: translate("en-US", "main.session.dispatchModelNote"),
    }),
    "Dispatch not accepted: source role Crew is not this project's dispatch owner Steward (trio: Steward or Lead).",
  );
  assert.equal(
    translate("zh-CN", "main.customerInput.judgeWriteHeadOverflow", {
      count: 5,
      paths: "docs/a.md、docs/b.md、docs/c.md",
    }),
    "judge 代批 · 代审批：确认写入 5 个路径（docs/a.md、docs/b.md、docs/c.md等 5 个）",
  );
  assert.equal(
    translate("en-US", "main.customerInput.judgeWriteHeadOverflow", {
      count: 5,
      paths: "docs/a.md, docs/b.md, docs/c.md",
    }),
    "judge delegation · approval: confirm writing 5 paths (docs/a.md, docs/b.md, docs/c.md, etc.)",
  );
  // 复数模板：count=1 选 one（渲染路径固定 >3，此处只验证模板本身）。
  assert.equal(
    translate("en-US", "main.customerInput.judgeWriteHeadOverflow", {
      count: 1,
      paths: "docs/a.md",
    }),
    "judge delegation · approval: confirm writing 1 path (docs/a.md, etc.)",
  );
  assert.equal(
    translate("zh-CN", "main.customerInput.judgeWriteHeadZero"),
    "judge 代批 · 代审批：确认写入 0 个路径",
  );
  assert.equal(
    translate("zh-CN", "main.interface.queueRecoveredLine", {
      kind: "回交",
      summary: "报告已交回",
      roleId: "编排",
      runtime: "pi",
    }),
    "- [回交] 报告已交回（角色 编排 · pi）",
  );
  assert.equal(
    translate("en-US", "main.interface.queueRecoveredLine", {
      kind: "Handback",
      summary: "report handed back",
      roleId: "Lead",
      runtime: "claude",
    }),
    "- [Handback] report handed back (role Lead · claude)",
  );
  assert.equal(
    translate("zh-CN", "main.interface.staleStepFact", {
      stepId: "role-cards",
      owner: "编排",
      status: "dispatched",
    }),
    "- 步骤 role-cards（owner: 编排，status: dispatched）",
  );
  assert.equal(
    translate("en-US", "main.watchdog.signalSummary", {
      signal: translate("en-US", "main.watchdog.signal.cmdTimeout"),
      roleId: "Lead",
    }),
    "System·Watchdog · Command timeout · role Lead",
  );
});

/**
 * 2026-10-23 验收返工路由（团队计划 §3.5 S5a/S5b）系统行 key。
 * 契约：客户来源才写「客户拒绝」；judge/自动来源写「自动决策未通过/未完成（判断代批/自动退回）」，
 * 且任何 judge/自动来源值不得出现「客户拒绝」；缺段/失败/审计失败文案如实、可操作，不伪造成功。
 * 占位符：RoutedCustomer/RoutedAutomatic/Pending = {flowId}；
 * ReportIncomplete = {flowId}/{reportPath}/{detail}；Failed/AuditFailed = {flowId}/{detail}。
 */
const ACCEPTANCE_REWORK_KEYS = [
  "main.governance.acceptanceReworkRoutedCustomer",
  "main.governance.acceptanceReworkRoutedAutomatic",
  "main.governance.acceptanceReworkPending",
  "main.governance.acceptanceReworkReportIncomplete",
  "main.governance.acceptanceReworkFailed",
  "main.governance.acceptanceReworkAuditFailed",
] as const satisfies readonly MessageKey[];

test("验收返工路由 key：6 个 key 在 zh-CN/en-US 均存在，占位符集合逐 key 一致且符合契约", () => {
  const expectedPlaceholders: Record<(typeof ACCEPTANCE_REWORK_KEYS)[number], string[]> = {
    "main.governance.acceptanceReworkRoutedCustomer": ["flowId"],
    "main.governance.acceptanceReworkRoutedAutomatic": ["flowId"],
    "main.governance.acceptanceReworkPending": ["flowId"],
    "main.governance.acceptanceReworkReportIncomplete": ["detail", "flowId", "reportPath"],
    "main.governance.acceptanceReworkFailed": ["detail", "flowId"],
    "main.governance.acceptanceReworkAuditFailed": ["detail", "flowId"],
  };
  for (const key of ACCEPTANCE_REWORK_KEYS) {
    assert.ok(key in zhCN, `zh-CN 缺 ${key}`);
    assert.ok(key in enUS, `en-US 缺 ${key}`);
    assert.deepEqual(placeholdersOf(zhCN[key]), expectedPlaceholders[key], `zh-CN 占位符不符契约：${key}`);
    assert.deepEqual(placeholdersOf(enUS[key]), expectedPlaceholders[key], `en-US 占位符不符契约：${key}`);
    assert.deepEqual(
      placeholdersOf(enUS[key]),
      placeholdersOf(zhCN[key]),
      `占位符不一致：${key}`,
    );
  }
});

test("验收返工路由 key：客户来源写「客户拒绝」；judge/自动来源写自动决策措辞且不得出现「客户拒绝」", () => {
  const customerZh = zhCN["main.governance.acceptanceReworkRoutedCustomer"];
  const automaticZh = zhCN["main.governance.acceptanceReworkRoutedAutomatic"];
  const customerEn = enUS["main.governance.acceptanceReworkRoutedCustomer"];
  const automaticEn = enUS["main.governance.acceptanceReworkRoutedAutomatic"];

  assert.ok(customerZh.includes("客户拒绝"), "客户来源必须写明「客户拒绝」");
  assert.ok(customerEn.includes("customer rejected"), "en-US 客户来源必须写明 customer rejected");
  assert.ok(customerZh.includes("统筹"), "zh-CN 系统行必须写明接收方统筹");
  assert.ok(customerEn.includes("Convener"), "en-US 系统行必须写明接收方 Convener");

  assert.ok(
    automaticZh.includes("自动决策未通过/未完成（判断代批/自动退回）"),
    "judge/自动来源必须使用自动决策措辞",
  );
  assert.equal(automaticZh.includes("客户拒绝"), false, "judge/自动来源不得出现「客户拒绝」");
  assert.equal(
    /customer\s+(?:has\s+)?reject/i.test(automaticEn),
    false,
    "en-US judge/自动来源不得写成 customer rejected",
  );
  assert.ok(automaticEn.includes("automatic decision"), "en-US judge/自动来源必须使用 automatic decision 措辞");
});

test("验收返工路由 key：zh-CN/en-US 取值与插值（客户/自动/等待/缺段/失败/审计失败）", () => {
  assert.equal(
    translate("zh-CN", "main.governance.acceptanceReworkRoutedCustomer", { flowId: "flow-a" }),
    "流程 flow-a：验收结果为客户拒绝；应用已按路由规则把返工交统筹组织。",
  );
  assert.equal(
    translate("en-US", "main.governance.acceptanceReworkRoutedCustomer", { flowId: "flow-a" }),
    "Flow flow-a: the customer rejected the acceptance result; the app routed the rework to Steward (Convener) under the routing rules.",
  );
  assert.equal(
    translate("zh-CN", "main.governance.acceptanceReworkRoutedAutomatic", { flowId: "flow-a" }),
    "流程 flow-a：自动决策未通过/未完成（判断代批/自动退回）；应用已按路由规则把返工交统筹组织。",
  );
  assert.equal(
    translate("en-US", "main.governance.acceptanceReworkRoutedAutomatic", { flowId: "flow-a" }),
    "Flow flow-a: the automatic decision did not pass or did not complete (judge proxy approval / automatic return); the app routed the rework to Steward (Convener) under the routing rules.",
  );
  assert.equal(
    translate("zh-CN", "main.governance.acceptanceReworkPending", { flowId: "flow-a" }),
    "流程 flow-a：返工路由尚未完成（等待发送或等待下一次事件重试）；应用暂不派发验收复核，也不会重复通知。",
  );
  assert.equal(
    translate("en-US", "main.governance.acceptanceReworkPending", { flowId: "flow-a" }),
    "Flow flow-a: rework routing is not complete yet (waiting to send or waiting for the next event to retry); the app is not dispatching acceptance review for now and will not notify repeatedly.",
  );

  // 缺段：如实写明报告缺少结构化段，给出报告路径与解析错误，并说明未生成 items/未建步骤。
  const incompleteZh = translate("zh-CN", "main.governance.acceptanceReworkReportIncomplete", {
    flowId: "flow-a",
    reportPath: "docs/acceptance/flow-a-report-v2.md",
    detail: "items[3].owner: expected a single owner",
  });
  assert.ok(incompleteZh.includes("acceptance-rework/v1"));
  assert.ok(incompleteZh.includes("docs/acceptance/flow-a-report-v2.md"));
  assert.ok(incompleteZh.includes("items[3].owner: expected a single owner"));
  assert.ok(incompleteZh.includes("未生成返工项、未创建流程步骤"));
  const incompleteEn = translate("en-US", "main.governance.acceptanceReworkReportIncomplete", {
    flowId: "flow-a",
    reportPath: "docs/acceptance/flow-a-report-v2.md",
    detail: "items[3].owner: expected a single owner",
  });
  assert.ok(incompleteEn.includes("acceptance-rework/v1"));
  assert.ok(incompleteEn.includes("docs/acceptance/flow-a-report-v2.md"));
  assert.ok(incompleteEn.includes("items[3].owner: expected a single owner"));
  assert.ok(incompleteEn.includes("no rework items were generated"));

  // 失败：不伪造成功（明确「不声称已送达」），并给出可操作的重试路径。
  const failedZh = translate("zh-CN", "main.governance.acceptanceReworkFailed", {
    flowId: "flow-a",
    detail: "send failed: convener busy",
  });
  assert.ok(failedZh.includes("返工路由失败"));
  assert.ok(failedZh.includes("不声称已送达"));
  assert.ok(failedZh.includes("下一次事件会自动重试"));
  const failedEn = translate("en-US", "main.governance.acceptanceReworkFailed", {
    flowId: "flow-a",
    detail: "send failed: convener busy",
  });
  assert.ok(failedEn.includes("does not claim delivery"));
  assert.ok(failedEn.includes("retries automatically"));

  // 审计失败：已发送事实不翻转、不伪造账本，且给出诊断入口。
  const auditZh = translate("zh-CN", "main.governance.acceptanceReworkAuditFailed", {
    flowId: "flow-a",
    detail: "ledger write denied",
  });
  assert.ok(auditZh.includes("审计记录写入失败"));
  assert.ok(auditZh.includes("已发送事实不翻转"));
  assert.ok(auditZh.includes("不会伪造账本"));
  assert.ok(auditZh.includes("请检查账本与诊断"));
  const auditEn = translate("en-US", "main.governance.acceptanceReworkAuditFailed", {
    flowId: "flow-a",
    detail: "ledger write denied",
  });
  assert.ok(auditEn.includes("writing the audit record failed"));
  assert.ok(auditEn.includes("sent fact is not reversed"));
  assert.ok(auditEn.includes("does not fabricate ledger entries"));
});

test("B1–B4 key 规范：ASCII 字母开头、点分隔、允许 camelCase/数字/连字符；不含中文", () => {
  for (const key of Object.keys(zhCN)) {
    assert.match(key, MESSAGE_KEY_PATTERN, `key 不符合命名规范：${key}`);
    assert.equal(valueContainsHan(key), false, `key 含中文：${key}`);
  }
});

test("B1–B4 插值：zh-CN 与 en-US 的占位符集合逐 key 一致", () => {
  for (const key of Object.keys(zhCN) as MessageKey[]) {
    assert.deepEqual(
      placeholdersOf(enUS[key]),
      placeholdersOf(zhCN[key]),
      `占位符不一致：${key}`,
    );
  }
});

test("B1–B4 复数：对象模板必须含 other；en-US 的复数模板 zh-CN 也必须是模板", () => {
  for (const key of Object.keys(enUS) as MessageKey[]) {
    const en = enUS[key];
    const zh = zhCN[key];
    if (typeof en === "string") continue;
    assert.ok("other" in en, `en-US 复数模板缺 other：${key}`);
    assert.ok(
      typeof zh === "string" || "other" in zh,
      `zh-CN 缺 other 或应为字符串：${key}`,
    );
  }
});

test("B4 覆盖：runtime-settings.ts / runtime-shared.ts 展示文案改为目录 key，key 全部可解析且无孤儿", () => {
  const runtimeSettingKeys = (Object.keys(zhCN) as MessageKey[]).filter((key) =>
    key.startsWith("shared.runtimeSettings."),
  );
  assert.equal(runtimeSettingKeys.length, 34, "shared.runtimeSettings.* key 数应为 34（B4 契约）");

  const referenced = new Set<MessageKey>();
  for (const definition of Object.values(RUNTIME_SETTINGS)) {
    for (const field of definition.fields) {
      // 共享元数据不再携带展示中文字面量：只有 key 字段。
      assert.equal("label" in field, false, `${definition.runtime}:${field.key}: 不得保留 label 字面量`);
      assert.equal("help" in field, false, `${definition.runtime}:${field.key}: 不得保留 help 字面量`);
      assert.equal("choiceLabels" in field, false, `${definition.runtime}:${field.key}: 不得保留 choiceLabels 字面量`);
      referenced.add(field.labelKey);
      if (field.helpKey !== undefined) referenced.add(field.helpKey);
      for (const key of field.choiceLabelKeys ?? []) referenced.add(key);
    }
  }
  // runtime-shared：demo 显示名走同一目录 key；品牌名无 key。
  assert.equal(valueContainsHan(RUNTIME_LABELS.demo), false, "RUNTIME_LABELS.demo 不得再是中文");
  const demoKey = RUNTIME_LABEL_KEYS.demo;
  assert.ok(demoKey !== null, "demo 必须有 i18n key");
  referenced.add(demoKey);
  assert.deepEqual(
    [...referenced].sort(),
    [...runtimeSettingKeys].sort(),
    "目录中的 shared.runtimeSettings.* key 必须全部被共享元数据引用（无孤儿、无缺失）",
  );
  for (const key of referenced) {
    const zhText = translate(DEFAULT_LOCALE, key);
    const enText = translate("en-US", key);
    assert.notEqual(zhText, key, `zh-CN 缺 key：${key}`);
    assert.notEqual(enText, key, `en-US 缺 key：${key}`);
    assert.ok(zhText.length > 0 && enText.length > 0, `目录值为空：${key}`);
  }
});

// ---------------------------------------------------------------------------
// 源码纯度（纯 ECMAScript/Intl，不依赖 Node/DOM/Electron）
// ---------------------------------------------------------------------------

test("shared i18n 纯模块：只导入相对模块，不含 Node/DOM/Electron 访问", () => {
  const files = walk(I18N_DIR).filter((file) => file.endsWith(".ts"));
  assert.ok(files.length >= 8, `i18n 源文件数量异常：${files.length}`);
  const forbiddenGlobals: ReadonlyArray<readonly [RegExp, string]> = [
    [/\brequire\s*\(/, "require()"],
    [/\bprocess\s*\./, "process.*"],
    [/\bwindow\s*\./, "window.*"],
    [/\bdocument\s*\./, "document.*"],
    [/\blocalStorage\b/, "localStorage"],
    [/\bBuffer\b/, "Buffer"],
    [/\b__dirname\b/, "__dirname"],
    [/\b__filename\b/, "__filename"],
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const specifiers: string[] = [];
    for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      specifiers.push(match[1] as string);
    }
    for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g)) {
      specifiers.push(match[1] as string);
    }
    for (const match of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) {
      specifiers.push(match[1] as string);
    }
    for (const specifier of specifiers) {
      assert.ok(
        specifier.startsWith("."),
        `${relative(ROOT, file)} 导入了非相对模块：${specifier}`,
      );
    }
    // 全局对象检查先去掉字符串字面量内容，避免目录 key（如 `main.window.title`）误报。
    const codeOnly = source
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, "``");
    for (const [pattern, label] of forbiddenGlobals) {
      assert.equal(
        pattern.test(codeOnly),
        false,
        `${relative(ROOT, file)} 含禁止的 ${label}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 类型负例（不运行；由 `npm run typecheck` 验证）
// ---------------------------------------------------------------------------

type ExpectedB0Keys = (typeof B0_KEYS)[number];

/** B0 的 13 个 key 必须都属于 MessageKey（后续批次可继续增加 key，不破坏本断言）。 */
type B0KeysCovered = ExpectedB0Keys extends MessageKey ? true : false;
const b0KeysAreMessageKeys: B0KeysCovered = true;
void b0KeysAreMessageKeys;

function omitKey<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value } as Record<string, unknown>;
  delete copy[key as string];
  return copy as Omit<T, K>;
}

function acceptEnCatalog(_catalog: Record<MessageKey, MessageTemplate>): void {
  void _catalog;
}

function assertTypeLevelContracts(): void {
  // @ts-expect-error en-US 缺任一 MessageKey 时不被 Record<MessageKey, MessageTemplate> 接受
  const missingEnKey: Record<MessageKey, MessageTemplate> = omitKey(enUS, "main.window.title");
  // @ts-expect-error 目录出现 zh-CN 全集之外的 key 时，对象字面量多余属性被拒绝
  acceptEnCatalog({ ...enUS, "extra.not.in.catalog": "x" });
  void missingEnKey;
}

void assertTypeLevelContracts;
