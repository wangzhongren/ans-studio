import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { BrowserWindow, IpcMain } from "electron";
import { createWindowIpcRegistrar, observeWindowDiagnostics, recordRendererDiagnostic } from "../../app/desktop/diagnostics.ts";
import { configureDiagnostics, createDiagnosticLogger, flushDiagnostics, disposeDiagnostics } from "../../src/common/shared/diagnostics.ts";
import { createCustomerInputChannel, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { createShellConfirmPresenter } from "../../app/desktop/operator-channel.ts";

test("窄诊断桥：关键节点落入统一sink，拒任意事件/路径，凭据净化且不存正文", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ans-desktop-diagnostics-"));
  process.env.ANS_DESKTOP_TEST_TOKEN = "diagnostic-secret-test";
  configureDiagnostics({ directory });
  const logger = createDiagnosticLogger({ component: "desktop.test" });
  try {
    assert.deepEqual(recordRendererDiagnostic(logger, { event: "arbitrary", fields: {} }), { ok: false });
    assert.deepEqual(recordRendererDiagnostic(logger, { event: "renderer.viewport", component: "forged", directory: "/forged", fields: { firstRow: 4, lastRow: 40, visibleCount: 8, path: "/forged", prompt: "PRIVATE_BODY", state: "viewport" } }), { ok: true });
    recordRendererDiagnostic(logger, { event: "renderer.error", fields: { errorMessage: "Bearer diagnostic-secret-test", errorType: "Error" } });
    const window = new EventEmitter() as EventEmitter & { webContents: EventEmitter };
    window.webContents = new EventEmitter();
    let failures = 0;
    observeWindowDiagnostics(window as unknown as BrowserWindow, logger, () => { failures += 1; });
    window.webContents.emit("did-fail-load", {}, -6, "file missing", "private-url", true);
    window.webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: 9 });
    window.emit("unresponsive");
    window.emit("responsive");
    assert.equal(failures, 2);
    await flushDiagnostics();
    const files = await fs.readdir(directory);
    const text = (await Promise.all(files.map((file) => fs.readFile(path.join(directory, file), "utf8")))).join("");
    const records = text.trim().split("\n").map((line) => JSON.parse(line));
    for (const event of ["renderer.viewport", "renderer.error", "window.load.failed", "window.renderer.gone", "window.unresponsive", "window.responsive"]) assert.ok(records.some((record) => record.event === event));
    assert.ok(!text.includes("diagnostic-secret-test") && !text.includes("PRIVATE_BODY") && !text.includes("/forged") && !text.includes("private-url"));
    assert.ok(text.includes("[REDACTED]"));
  } finally {
    delete process.env.ANS_DESKTOP_TEST_TOKEN;
    await disposeDiagnostics();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("窗口关闭只释放自有IPC，再建窗可注册同名handler，不删其他通道", () => {
  const handlers = new Map<string, unknown>([["foreign:channel", "foreign"]]);
  const ipc = {
    handle(channel: string, listener: unknown) { assert.ok(!handlers.has(channel), "重复注册必须失败"); handlers.set(channel, listener); },
    removeHandler(channel: string) { handlers.delete(channel); },
  } as unknown as IpcMain;
  const first = new EventEmitter();
  const register = createWindowIpcRegistrar(first as unknown as BrowserWindow, ipc);
  register("app:renderer-diagnostic", () => ({ ok: true }));
  register("session:send", () => ({ ok: true }));
  first.emit("closed");
  assert.deepEqual([...handlers.keys()], ["foreign:channel"]);
  const second = new EventEmitter();
  createWindowIpcRegistrar(second as unknown as BrowserWindow, ipc)("session:send", () => ({ ok: true }));
  assert.equal(handlers.size, 2);
  second.emit("closed");
  assert.deepEqual([...handlers.keys()], ["foreign:channel"]);
});

test("客户请求恢复：重放同id不作答，仍可答旧请求，已结束请求不复活", async () => {
  const presented: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ operatorId: "test", presenter: (payload) => { presented.push(payload); } });
  let answered = false;
  const outcome = Promise.resolve(channel.customerInput({ kind: "confirm", title: "恢复请求" }, { roleId: "A" })).then((value) => { answered = true; return value; });
  assert.equal(channel.replayPending(), 1);
  assert.equal(channel.replayPending(), 1);
  await Promise.resolve();
  assert.equal(answered, false);
  assert.equal(new Set(presented.map((item) => item.id)).size, 1);
  assert.equal(channel.respond({ id: presented[0].id, decision: { kind: "confirm", confirmed: true } }).ok, true);
  assert.equal((await outcome)?.outcome, "answered");
  assert.equal(channel.replayPending(), 0);
  assert.equal(channel.pendingCount(), 0);
});

test("shell确认恢复：不重置时限、不代答，失效请求不能复活", async () => {
  const ids: string[] = [];
  const channel = createShellConfirmPresenter({ present: (request) => { ids.push(request.id); }, cleanupAfterMs: 10 });
  const outcome = channel.presenter.present({} as never, { command: "npm test", argvLines: "npm\ntest", cwd: "/proj", reason: "check" } as never);
  assert.equal(channel.replayPending(), 1);
  assert.equal(new Set(ids).size, 1);
  assert.deepEqual(await outcome, { allow: false });
  assert.equal(channel.replayPending(), 0);
  assert.equal(channel.respond({ id: ids[0], allow: true }).expired, true);
});
