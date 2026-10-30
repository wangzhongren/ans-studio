// test/桌面UI/request-status.test.ts
// P1（2026-10-30 团队计划 §3.6 P1 / 附录 B）：**请求超时/失败状态在桌面 UI 的人话呈现**——
//  - 渲染层真实 `describeEvent`：settled(failed) 的可见文本只取 Service 的人话 summary；结构化
//    errorCode 只留在 detail，不进入任何可见行；请求失败系统行（delivery-note）按系统行渲染；
//  - 共享 i18n：`main.requestStatus.*` 中英文人话（无 Han 泄漏到 en-US、无技术 code/URL/堆栈）；
//  - 接线钉子：主进程 `app/desktop/session.ts` 用同一组 i18n key 发 delivery-note 系统行；
//    Service 的 settled.detail 携带 errorCode；客户可见文本不含技术 code。
// 真实路径：渲染层生产函数 `describeEvent`（app/renderer/src/chat/events.ts）+ 主进程/Service 源码钉子。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describeEvent } from "../../app/renderer/src/chat/events.ts";
import { translate } from "../../src/common/shared/i18n/index.ts";
import { zhCN } from "../../src/common/shared/i18n/messages/zh-CN.ts";
import { enUS } from "../../src/common/shared/i18n/messages/en-US.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SESSION = fs.readFileSync(path.join(ROOT, "app", "desktop", "session.ts"), "utf8");
const SERVICE = fs.readFileSync(path.join(ROOT, "src", "service", "runtime", "session.ts"), "utf8");
const EVENTS = fs.readFileSync(path.join(ROOT, "app", "renderer", "src", "chat", "events.ts"), "utf8");

const HUMAN_KEYS = [
  "main.requestStatus.timeoutFirstByte",
  "main.requestStatus.timeoutIdle",
  "main.requestStatus.failed",
] as const;
const TECH_TOKEN = /request-timeout|MODEL_REQUEST|RequestTimeoutError|ECONN|stack|\bhttps?:\/\//i;

test("settled(failed) 终态行：可见文本 = 人话 summary；errorCode 不进入可见行", () => {
  const summary = "本轮请求超时（首字节未返回）";
  const row = describeEvent({
    kind: "settled",
    summary,
    turnId: "turn-1",
    runtime: "claude",
    roleId: "A",
    detail: { turnId: "turn-1", outcome: "failed", errorCode: "request-timeout-first-byte", attempts: 1, replaySafe: true, timeoutKind: "first-byte" },
  });
  assert.ok(row);
  assert.equal(row!.kind, "turn-terminal");
  const data = row!.data as { outcome?: unknown; text?: unknown; sources?: { text?: unknown }[] };
  assert.equal(data.outcome, "failed");
  assert.equal(data.text, summary, "终态行文本取 Service 人话摘要");
  assert.equal(data.sources?.[0]?.text, summary);
  assert.doesNotMatch(JSON.stringify(row), /request-timeout|MODEL_REQUEST|RequestTimeoutError/, "结构化 errorCode 不得出现在渲染行（客户卡不出现技术 code）");
  assert.doesNotMatch(String(data.text), TECH_TOKEN);
});

test("请求失败系统行（delivery-note）：按系统行渲染；zh/en 人话、无技术细节", () => {
  for (const locale of ["zh-CN", "en-US"] as const) {
    const text = translate(locale, "main.requestStatus.timeoutFirstByte");
    const row = describeEvent({ kind: "message", summary: text, roleId: "A", detail: { source: "delivery-note" } }, locale);
    assert.ok(row);
    assert.equal(row!.kind, "system");
    const data = row!.data as { cls?: unknown; text?: unknown };
    assert.match(String(data.cls), /sys-delivery-note/, "复用既有 delivery-note 系统行样式（不新增 UI 通道）");
    assert.equal(data.text, text);
    assert.doesNotMatch(String(data.text), TECH_TOKEN, "系统行不含技术 code/URL/堆栈");
  }
  assert.match(translate("zh-CN", "main.requestStatus.timeoutFirstByte"), /请求超时/);
  assert.match(translate("en-US", "main.requestStatus.timeoutFirstByte"), /Request timed out/);
});

test("i18n 目录：三条请求状态文案中英成对、非空、en-US 零 Han、无技术细节", () => {
  for (const key of HUMAN_KEYS) {
    const zh = zhCN[key];
    const en = enUS[key];
    assert.ok(typeof zh === "string" && zh.trim() !== "", `zh-CN 缺 ${key}`);
    assert.ok(typeof en === "string" && en.trim() !== "", `en-US 缺 ${key}`);
    assert.doesNotMatch(zh, TECH_TOKEN, `${key} zh 不得含技术 code`);
    assert.doesNotMatch(en, TECH_TOKEN, `${key} en 不得含技术 code`);
    assert.doesNotMatch(en, /\p{Script=Han}/u, `${key} en 不得含中文（英文泄漏）`);
    assert.match(zh, /请求|本轮/, `${key} 须为中文人话`);
  }
  assert.match(translate("zh-CN", "main.requestStatus.timeoutIdle"), /中断|空闲/);
  assert.match(translate("zh-CN", "main.requestStatus.failed"), /请求失败/);
});

test("接线钉子：主进程用同一组 i18n key 发 delivery-note；Service settled.detail 带 errorCode/attempts/replaySafe", () => {
  // 主进程：请求失败人话系统行（emitDeliveryNote）——不是客户可见的技术模板。
  assert.match(SESSION, /mainT\("main\.requestStatus\.timeoutFirstByte"\)/, "session.ts 使用 first-byte 人话 key");
  assert.match(SESSION, /mainT\("main\.requestStatus\.timeoutIdle"\)/, "session.ts 使用 idle 人话 key");
  assert.match(SESSION, /mainT\("main\.requestStatus\.failed"\)/, "session.ts 使用一般失败人话 key");
  assert.match(SESSION, /emitDeliveryNote\(en\.projectRoot, runtime, roleId, roleId, human\)/, "session.ts 经 delivery-note 系统行呈现");
  assert.match(SESSION, /detail as \{ errorCode\?: unknown \}/, "session.ts 从 settled.detail 读取 errorCode");
  assert.match(SESSION, /isRequestFailureCode\(settledErrorCodeRaw\)/, "session.ts 只对已知请求失败 code 发系统行");
  // Service：结构化事实进 detail，人话短报进 summary。
  assert.match(SERVICE, /requestTimeoutSummary\(requestFailureTimeout\.timeoutKind\)/, "Service 短报使用人话 summary");
  assert.match(SERVICE, /errorCode: failureCode/, "Service settled.detail 携带 errorCode");
  assert.match(SERVICE, /attempts: failureAttempts/, "Service settled.detail 携带 attempts");
  assert.match(SERVICE, /replaySafe: failureReplaySafe/, "Service settled.detail 携带 replaySafe");
  // 渲染层：终态行文本来自 summary（不拼接 detail.errorCode）。
  assert.match(EVENTS, /data: \{ turnId: turnId \|\| "", outcome, text: summary, sources: \[\{ kind: "settled", text: summary \}\] \}/, "渲染层 settled 行只呈现 summary");
});
