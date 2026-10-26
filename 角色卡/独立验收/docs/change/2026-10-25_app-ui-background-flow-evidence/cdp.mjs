// 独立验收只读 CDP 辅助（2026-10-25）：
// 连接已运行的 Electron 渲染页（9225），执行表达式并可选截图。
// 允许 Page.reload；不重启主进程、不点击会触发写操作/模型调用的控件。
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const WS = require("ws");

const CDP_HTTP = "http://127.0.0.1:9225";

async function pageTarget() {
  const res = await fetch(CDP_HTTP + "/json/list");
  const list = await res.json();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");
  return page.webSocketDebuggerUrl;
}

export async function connect() {
  const url = await pageTarget();
  const ws = new WS(url);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  let id = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  return {
    send,
    async eval(expression) {
      const result = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: false,
      });
      if (result.exceptionDetails) {
        throw new Error(
          "EVAL_ERROR: " +
            (result.exceptionDetails.exception?.description ||
              JSON.stringify(result.exceptionDetails)),
        );
      }
      return result.result?.value;
    },
    async screenshot(path) {
      const { data } = await send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      fs.writeFileSync(path, Buffer.from(data, "base64"));
      return path;
    },
    close() {
      ws.close();
    },
  };
}

export async function reload(client, waitMs = 4000) {
  await client.send("Page.reload", { ignoreCache: false });
  await new Promise((r) => setTimeout(r, waitMs));
}
