// test/桌面UI/network-status.test.ts
// P2（2026-10-30 团队计划 §3.6 P2 / 附录 B）：**网络状态行的桌面 UI 呈现**——
//  - `networkStatusView` 纯逻辑：离线人话（请求计时暂停/队列等待网络）、恢复行 8s 内显示、在线常态隐藏；
//  - `NetworkStatusLine` 组件：`role="status" aria-live="polite"`；隐藏时不渲染；
//  - 共享 i18n：`ui.network.*` 中英成对、en-US 零 Han、无技术 code/URL/凭据；
//  - 接线钉子：主进程 network:state → preload onNetworkState → 渲染 store；渲染 online/offline 仅提示上报。
// 真实路径：渲染层生产函数 `networkStatusView`/`NetworkStatusLine` + 主进程/preload 源码钉子。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  NETWORK_RECOVERED_VISIBLE_MS,
  networkStatusView,
} from "../../app/renderer/src/chat/status.ts";
import { NetworkStatusLine } from "../../app/renderer/src/chat/role-status-view.ts";
import { translate } from "../../src/common/shared/i18n/index.ts";
import { zhCN } from "../../src/common/shared/i18n/messages/zh-CN.ts";
import { enUS } from "../../src/common/shared/i18n/messages/en-US.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const MAIN = fs.readFileSync(path.join(ROOT, "app", "main.ts"), "utf8");
const PRELOAD = fs.readFileSync(path.join(ROOT, "app", "preload.cjs"), "utf8");
const IPC = fs.readFileSync(path.join(ROOT, "app", "renderer", "src", "chat", "ipc.ts"), "utf8");
const HEADER = fs.readFileSync(path.join(ROOT, "app", "renderer", "src", "shell", "ChatHeader.tsx"), "utf8");

const TECH_TOKEN = /network-offline-timeout|NetworkOfflineError|ECONN|ETIMEDOUT|stack|\bhttps?:\/\//i;
const NETWORK_KEYS = [
  "ui.network.label.offline",
  "ui.network.label.recovered",
  "ui.network.title.offline",
  "ui.network.title.recovered",
] as const;

test("离线视图：可见、人话（请求暂停/队列等待网络）、aria-live polite；不泄露技术细节", () => {
  const view = networkStatusView({ online: false });
  assert.equal(view.visible, true);
  assert.equal(view.status, "offline");
  assert.equal(view.label, "网络已断开");
  assert.match(view.title, /请求/, view.title);
  assert.match(view.title, /队列等待网络/, view.title);
  assert.equal(view.className, "network-status-line is-offline");
  assert.equal(view.ariaLive, "polite");
  assert.doesNotMatch(view.label + view.title, TECH_TOKEN);
  assert.doesNotMatch(view.label + view.title, /prompt|api[_-]?key|Bearer/i);
});

test("恢复视图：离线→在线后 8s 内显示「网络已恢复」；超时/无恢复时刻/未知快照均隐藏", () => {
  const recoveredAt = 10_000;
  const fresh = networkStatusView({ online: true, recoveredAt }, "zh-CN", recoveredAt + 1_000);
  assert.equal(fresh.visible, true);
  assert.equal(fresh.status, "recovered");
  assert.match(fresh.label, /网络已恢复/);
  assert.match(fresh.label, /正在继续/);
  assert.equal(fresh.className, "network-status-line is-recovered");
  assert.doesNotMatch(fresh.label + fresh.title, TECH_TOKEN);

  assert.equal(NETWORK_RECOVERED_VISIBLE_MS, 8_000);
  assert.equal(networkStatusView({ online: true, recoveredAt }, "zh-CN", recoveredAt + NETWORK_RECOVERED_VISIBLE_MS).visible, false, "8s 后收起");
  assert.equal(networkStatusView({ online: true }, "zh-CN", recoveredAt).visible, false, "在线常态隐藏");
  assert.equal(networkStatusView(null).visible, false, "未收到快照不误报（不显示离线/在线）");
  assert.equal(networkStatusView(undefined).visible, false);
});

test("en-US：恢复/离线两条人话成对、零 Han、无技术 code", () => {
  const offline = networkStatusView({ online: false }, "en-US");
  assert.equal(offline.label, "Network disconnected");
  assert.match(offline.title, /queue/i);
  assert.doesNotMatch(offline.label + offline.title, /\p{Script=Han}/u);
  const recovered = networkStatusView({ online: true, recoveredAt: 1_000 }, "en-US", 2_000);
  assert.match(recovered.label, /Network restored/i);
  assert.doesNotMatch(recovered.label + recovered.title, /\p{Script=Han}/u);
});

test("i18n 目录：ui.network.* 中英成对、非空、无技术细节；容器沿用既有 translate", () => {
  for (const key of NETWORK_KEYS) {
    const zh = zhCN[key];
    const en = enUS[key];
    assert.ok(typeof zh === "string" && zh.trim() !== "", `zh-CN 缺 ${key}`);
    assert.ok(typeof en === "string" && en.trim() !== "", `en-US 缺 ${key}`);
    assert.doesNotMatch(zh, TECH_TOKEN, `${key} zh 不得含技术 code`);
    assert.doesNotMatch(en, TECH_TOKEN, `${key} en 不得含技术 code`);
    assert.doesNotMatch(en, /\p{Script=Han}/u, `${key} en 不得含中文（英文泄漏）`);
  }
  assert.match(translate("zh-CN", "ui.network.label.offline"), /网络已断开/);
  assert.match(translate("en-US", "ui.network.label.recovered"), /Network restored/i);
});

test("组件：role=status + aria-live=polite；隐藏视图不渲染", () => {
  const html = renderToStaticMarkup(
    createElement(NetworkStatusLine, { view: networkStatusView({ online: false }) }),
  );
  assert.match(html, /id="network-status"/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /data-status="offline"/);
  assert.match(html, /网络已断开/);
  assert.doesNotMatch(html, TECH_TOKEN);

  const hidden = renderToStaticMarkup(
    createElement(NetworkStatusLine, { view: networkStatusView({ online: true }) }),
  );
  assert.equal(hidden, "", "在线常态不渲染占位");
});

test("接线钉子：main 推 network:state、preload 暴露受限桥、渲染订阅并上报 online/offline 提示", () => {
  assert.match(MAIN, /win\.webContents\.send\("network:state", state\)/, "主进程推送网络状态快照");
  assert.match(MAIN, /registerHandler\("network:get-state"/, "主进程提供首屏读取");
  assert.match(MAIN, /registerHandler\("network:renderer-state"/, "主进程受理渲染提示");
  assert.match(MAIN, /powerMonitor\.on\("suspend"/, "powerMonitor suspend 接线");
  assert.match(MAIN, /powerMonitor\.on\("lock-screen"/, "powerMonitor lock-screen 接线");
  assert.match(PRELOAD, /onNetworkState:/, "preload 暴露 onNetworkState");
  assert.match(PRELOAD, /reportNetworkHint:/, "preload 暴露 reportNetworkHint");
  assert.match(PRELOAD, /getNetworkState:/, "preload 暴露 getNetworkState");
  assert.match(IPC, /bridge\.onNetworkState\?\.\(handleNetworkState\)/, "渲染订阅网络状态");
  assert.match(IPC, /window\.addEventListener\("online"/, "渲染 online 只提示上报");
  assert.match(IPC, /window\.addEventListener\("offline"/, "渲染 offline 只提示上报");
  assert.match(HEADER, /<NetworkStatusLine view=\{networkStatus\} \/>/, "会话头渲染网络状态行");
});
