// test/项目管理/shared/i18n.test.ts
// D 批（2026-10-28）：共享 i18n 的 key 清单/计数/parity/英文泄漏守卫。
//
// D-05 要求：
//   · 最终 key 分区计数固定（漏 key 或顺手加 key 必须显式更新本断言）；
//   · zh-CN / en-US key 全集一致（parity）；
//   · 英文目录零中文泄漏（按值计数）；
//   · 已撤除的 flow/triage/gate/ledger/acceptance/Liaison key 零命中。
//
// 本文件只读共享目录，不依赖 Node/DOM/Electron；行为级翻译/回退/复数测试仍在
// `i18n-guard.test.ts` 与 i18n 实现单测覆盖（本批聚焦 D-05 计数/清理守卫）。

import assert from "node:assert/strict";
import { test } from "node:test";

import { zhCN } from "../../../src/common/shared/i18n/messages/zh-CN.ts";
import { enUS } from "../../../src/common/shared/i18n/messages/en-US.ts";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, translate, type MessageKey } from "../../../src/common/shared/i18n/index.ts";

const HAN = /\p{Script=Han}/u;

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

/** D 批保留的关键 UI/主进程 key（删除旧治理机器后仍必须存在）。 */
const D_RETAINED_KEYS = [
  "ui.task.title",
  "ui.workReport.title",
  "ui.roleLog.title",
  "ui.request.title",
  "ui.governance.power.appointmentWrite",
  "ui.judge.shellOffTitle",
  "ui.judge.shellOnTitle",
  "main.requirementChange.dispatched",
  "main.viewImage.queued",
] as const;

function templateTexts(template: unknown): string[] {
  if (typeof template === "string") return [template];
  if (template !== null && typeof template === "object") return Object.values(template).filter((v): v is string => typeof v === "string");
  return [];
}

test("locale：SUPPORTED_LOCALES 只有 zh-CN/en-US，默认 zh-CN", () => {
  assert.deepEqual([...SUPPORTED_LOCALES], ["zh-CN", "en-US"]);
  assert.equal(DEFAULT_LOCALE, "zh-CN");
});

test("key 分区计数：ui 886 / main 550 / shared 62 / preferences 3，总计 1501", () => {
  const keys = Object.keys(zhCN);
  const prefixes = {
    ui: keys.filter((key) => key.startsWith("ui.")).length,
    main: keys.filter((key) => key.startsWith("main.")).length,
    shared: keys.filter((key) => key.startsWith("shared.")).length,
    preferences: keys.filter((key) => key.startsWith("preferences.")).length,
  };
  assert.deepEqual(prefixes, { ui: 886, main: 550, shared: 62, preferences: 3 });
  assert.equal(keys.length, 1501);
});

test("key parity：zh-CN 与 en-US 全集一致（顺序无关）", () => {
  assert.deepEqual(Object.keys(enUS).sort(), Object.keys(zhCN).sort());
});

test("英文泄漏计数：en-US 所有模板值零 Han 字符", () => {
  const leaking: string[] = [];
  for (const [key, value] of Object.entries(enUS)) {
    if (templateTexts(value).some((text) => HAN.test(text))) leaking.push(key);
  }
  assert.deepEqual(leaking, []);
});

test("旧治理 key 零命中：flow/triage/gate/ledger/acceptance/liaison", () => {
  const keys = Object.keys(zhCN);
  for (const pattern of ["ui.flow.", "ui.triage.", "ui.gate.", "ui.ledger.", "ui.acceptance.", "liaison"]) {
    assert.deepEqual(
      keys.filter((key) => key.includes(pattern)),
      [],
      `${pattern} 旧 key 不得残留`,
    );
  }
});

test("关键 key 清单：B0 与 D 保留能力 key 全部存在且中英成对", () => {
  for (const key of [...B0_KEYS, ...D_RETAINED_KEYS]) {
    assert.ok(key in zhCN, `zh-CN 缺 ${key}`);
    assert.ok(key in enUS, `en-US 缺 ${key}`);
  }
  assert.equal(translate("zh-CN", "main.window.title"), zhCN["main.window.title"]);
  assert.equal(translate("en-US", "main.window.title"), enUS["main.window.title"]);
});
