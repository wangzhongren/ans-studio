// 角色卡/测试/docs/change/2026-10-23-i18n-integration-evidence/i18n-cdp.mjs
// i18n I9 真实 Electron 验证用 CDP 小工具（临时证据脚本，不进入产品/测试套件）。
// 用法：
//   node i18n-cdp.mjs eval '<js expression>'
//   node i18n-cdp.mjs screenshot <绝对路径.png>
//   node i18n-cdp.mjs metrics <width> <height> <deviceScaleFactor>
//   node i18n-cdp.mjs reset-metrics
//   node i18n-cdp.mjs close
// 连接固定 http://127.0.0.1:9222/json 的 page target（验证期间仅一个 Electron 实例）。

import { writeFileSync } from "node:fs";

const [, , command, ...args] = process.argv;
const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = targets.find((target) => target.type === "page");
if (!page) {
  console.error("no page target");
  process.exit(3);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve);
  ws.addEventListener("error", reject);
});
function send(method, params) {
  return new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

try {
  if (command === "eval") {
    const expression = args.join(" ");
    const res = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (res.result?.exceptionDetails) {
      console.error(JSON.stringify(res.result.exceptionDetails, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify(res.result?.result?.value ?? res.result?.result ?? null, null, 2));
  } else if (command === "screenshot") {
    const file = args[0];
    const res = await send("Page.captureScreenshot", { format: "png" });
    if (!res.result?.data) throw new Error("captureScreenshot failed");
    writeFileSync(file, Buffer.from(res.result.data, "base64"));
    console.log(file);
  } else if (command === "metrics") {
    const width = Number(args[0]);
    const height = Number(args[1]);
    const deviceScaleFactor = Number(args[2] ?? 1);
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile: false });
    console.log(JSON.stringify({ width, height, deviceScaleFactor }));
  } else if (command === "eval-metrics") {
    const width = Number(args[0]);
    const height = Number(args[1]);
    const deviceScaleFactor = Number(args[2] ?? 1);
    const screenshotFile = args[3] === "-" ? undefined : args[3];
    const expression = args.slice(4).join(" ");
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile: false });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const res = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (res.result?.exceptionDetails) {
      console.error(JSON.stringify(res.result.exceptionDetails, null, 2));
      process.exit(1);
    }
    if (screenshotFile !== undefined) {
      const shot = await send("Page.captureScreenshot", { format: "png" });
      if (shot.result?.data) writeFileSync(screenshotFile, Buffer.from(shot.result.data, "base64"));
    }
    await send("Emulation.clearDeviceMetricsOverride", {});
    console.log(JSON.stringify(res.result?.result?.value ?? res.result?.result ?? null, null, 1));
  } else if (command === "reset-metrics") {
    await send("Emulation.clearDeviceMetricsOverride", {});
    console.log("reset");
  } else if (command === "close") {
    await send("Browser.close", {});
    console.log("closed");
  } else {
    console.error("unknown command");
    process.exit(2);
  }
} finally {
  ws.close();
}
