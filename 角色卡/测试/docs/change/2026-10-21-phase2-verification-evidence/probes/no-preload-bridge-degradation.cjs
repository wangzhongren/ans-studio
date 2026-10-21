const { app, BrowserWindow } = require("electron");
const path = require("path");
const REPO = "/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
app.setPath("userData", "/tmp/ans-p2-nobridge-userdata");
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360, height: 860, useContentSize: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false }, // 无 preload
  });
  const messages = [];
  win.webContents.on("console-message", (...a) => {
    const e = a[0];
    messages.push(e && typeof e === "object" && "message" in e ? { level: e.level, message: e.message } : { level: a[1], message: a[2] });
  });
  await win.loadFile(path.join(REPO, "app/renderer/dist/src/index.html"));
  await new Promise((r) => setTimeout(r, 600));
  const out = await win.webContents.executeJavaScript(`(() => ({
    mounted: !!document.querySelector('#root > .app-shell'),
    bridge: typeof window.desktop,
    winMinDisabled: document.getElementById('win-min').disabled,
    winMaxDisabled: document.getElementById('win-max').disabled,
    winCloseDisabled: document.getElementById('win-close').disabled,
    note: (document.querySelector('.titlebar-note') || {}).textContent || null,
    csp: (window.__ansCspViolations || []).length,
  }))()`, true);
  const errors = messages.filter((m) => String(m.level) === "error" || m.level === 3);
  console.log("NOBRIDGE", JSON.stringify(out), "consoleErrors=" + JSON.stringify(errors));
  win.destroy();
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(2); });
