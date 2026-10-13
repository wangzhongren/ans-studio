// 独立离线回归：真实renderer/preload，受控组合事件与发送IPC替身，无模型请求。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain } from "electron";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..", "..", "..", "app");
const OUTDIR = process.env.ANS_IME_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), "ans-ime-enter-"));
fs.mkdirSync(path.join(OUTDIR, "user-data"), { recursive: true });
app.setPath("userData", path.join(OUTDIR, "user-data"));
const report = ["ELECTRON=" + process.versions.electron, "NODE=" + process.versions.node];
const sent = [];
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
let win;
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const js = (source) => win.webContents.executeJavaScript(source);
const check = (name, value) => {
  report.push(name + "=" + value);
  assert.equal(value, true, name);
};

ipcMain.handle("app:recovery-state", () => null);
ipcMain.handle("app:renderer-diagnostic", () => ({ ok: true }));
ipcMain.handle("window:is-maximized", () => false);
ipcMain.handle("app:list-project", () => ({
  projectRoot: "/ime-project", primaryRoleId: "A", hasRoles: true, warnings: [],
  roles: [{ roleId: "A", cardText: "# A", cardPath: "", boundaryPath: "", boundary: { entries: [] }, builtIn: false, changelog: null, docs: [] }],
}));
ipcMain.handle("session:open", () => ({ ok: true, resumed: true, contextSource: "resumed" }));
ipcMain.handle("session:stop", () => ({ ok: true }));
ipcMain.handle("session:live", () => ["A"]);
ipcMain.handle("session:send", (_event, input) => { sent.push(input); return { ok: true }; });
ipcMain.handle("app:pick-image", () => ({ ok: true, image: { name: "ime.png", mime: "image/png", size: 68, dataBase64: PNG } }));

async function snapshot() {
  const value = await js("(() => ({ text:document.getElementById('inp-message').value, images:document.querySelectorAll('#attach-row .attach-chip').length, users:document.querySelectorAll('#chat .msg-user').length }))()");
  return { ...value, sends: sent.length };
}
async function compose(type) {
  await js("document.getElementById('inp-message').dispatchEvent(new CompositionEvent(" + JSON.stringify(type) + ",{bubbles:true,data:'candidate'}))");
}
async function attachImage() {
  await js("document.getElementById('btn-attach-image').click()");
  for (let attempt = 0; attempt < 100 && (await snapshot()).images !== 1; attempt += 1) await pause(10);
  check("ATTACHMENT_READY", (await snapshot()).images === 1);
}
async function enter(options = {}) {
  return js("(() => { const event=new KeyboardEvent('keydown'," + JSON.stringify({ key: "Enter", bubbles: true, cancelable: true, ...options }) + "); document.getElementById('inp-message').dispatchEvent(event); return { cancelled:event.defaultPrevented,isComposing:event.isComposing,keyCode:event.keyCode }; })()");
}
async function assertIgnored(name, options) {
  const before = await snapshot();
  const event = await enter(options);
  await pause(20); // 仅等待IPC事件队列处理，不参与产品的输入判定。
  const after = await snapshot();
  report.push(name + "_OBSERVATION=" + JSON.stringify({ event, before, after }));
  check(name + "_NOT_CANCELLED", event.cancelled === false);
  check(name + "_NO_SEND", after.sends === before.sends);
  check(name + "_INPUT_ATTACHMENT_BUBBLE_UNCHANGED", after.text === before.text && after.images === before.images && after.users === before.users);
}
async function assertSent(name) {
  const before = await snapshot();
  const event = await enter({ isComposing: false, keyCode: 13 });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const current = await snapshot();
    if (current.sends === before.sends + 1 && current.images === 0) break;
    await pause(10);
  }
  const after = await snapshot();
  const payload = sent[sent.length - 1];
  check(name + "_SENT_ONCE", event.cancelled === true && after.sends === before.sends + 1 && after.users === before.users + 1);
  check(name + "_PAYLOAD_AND_CLEAR", payload.text === before.text.trim() && payload.images.length === before.images && after.text === "" && after.images === 0);
}

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { report.push("WATCHDOG=1"); fs.writeFileSync(path.join(OUTDIR, "report.txt"), report.join("\n")); app.exit(1); }, 15000);
  try {
    win = new BrowserWindow({ width: 1100, height: 760, show: process.env.ANS_IME_VISIBLE === "1", webPreferences: { preload: path.join(APP_DIR, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: false } });
    await win.loadFile(path.join(APP_DIR, "renderer", "index.html"));
    await js("window.__ansRenderer.loadProject('/ime-project')");
    await js("window.__ansRenderer.selectRole('A')");
    await attachImage();

    await js("document.getElementById('inp-message').value='候选中文'");
    await compose("compositionstart");
    await assertIgnored("CHINESE_COMPOSITION_STATE", { isComposing: false, keyCode: 13 });
    await compose("compositionend");
    await assertSent("CHINESE_END_NORMAL_ENTER");

    await attachImage();
    await js("document.getElementById('inp-message').value='English candidate'");
    await compose("compositionstart");
    await assertIgnored("ENGLISH_COMPOSITION", { isComposing: true, keyCode: 13 });
    await compose("compositionend");
    await assertIgnored("COMPOSITION_END_BEFORE_229", { isComposing: false, keyCode: 229 });
    await assertSent("AFTER_229_NORMAL_ENTER");

    await attachImage();
    await js("document.getElementById('inp-message').value='中文独立组合标志'");
    await assertIgnored("IS_COMPOSING_WITHOUT_START", { isComposing: true, keyCode: 13 });
    await assertSent("AFTER_IS_COMPOSING_NORMAL_ENTER");

    await js("document.getElementById('inp-message').value='mouse candidate'");
    await compose("compositionstart");
    await compose("compositionend");
    await assertSent("MOUSE_COMMIT_NEXT_ENTER");

    await js("(() => {const input=document.getElementById('inp-message');input.value='shift';input.focus();input.setSelectionRange(input.value.length,input.value.length);})()");
    const beforeShift = await snapshot();
    const shiftEvent = await enter({ shiftKey: true, keyCode: 13 });
    check("SHIFT_ENTER_NOT_CANCELLED", shiftEvent.cancelled === false);
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter", modifiers: ["shift"] });
    win.webContents.sendInputEvent({ type: "char", keyCode: "\r", modifiers: ["shift"] });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter", modifiers: ["shift"] });
    await pause(30);
    const afterShift = await snapshot();
    check("SHIFT_ENTER_NATIVE_NEWLINE_NO_SEND", afterShift.text.includes("\n") && afterShift.sends === beforeShift.sends && afterShift.users === beforeShift.users);

    await js("document.getElementById('inp-message').value='explicit button'");
    await compose("compositionstart");
    const beforeButton = await snapshot();
    await js("document.getElementById('btn-send').click()");
    await pause(20);
    check("SEND_BUTTON_BEHAVIOR_UNCHANGED", sent.length === beforeButton.sends + 1 && sent[sent.length - 1].text === "explicit button");
    await compose("compositionend");
    report.push("E2E_DONE=1");
    fs.writeFileSync(path.join(OUTDIR, "report.txt"), report.join("\n") + "\n");
    clearTimeout(watchdog);
    app.exit(0);
  } catch (error) {
    report.push("E2E_ERROR=" + error.stack);
    fs.writeFileSync(path.join(OUTDIR, "report.txt"), report.join("\n") + "\n");
    clearTimeout(watchdog);
    app.exit(1);
  }
});
