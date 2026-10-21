import { app, BrowserWindow } from "electron";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const repo = process.env.REPO_ROOT;
const dir = process.env.PROBE_DIR;
const log = (...args) => console.log("[probe]", ...args);
const fail = (error) => { console.error("[probe-error]", error && error.stack ? error.stack : error); app.exit(2); };
process.on("uncaughtException", fail);
setTimeout(() => { console.error("[probe-timeout]"); app.exit(3); }, 25000);

const page = path.join(dir, "page.html");
fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;">
</head><body>
<a id="https" href="https://example.com/x">https</a>
<a id="file" href="file:///etc/passwd">file</a>
<a id="data" href="data:text/html,hello">data</a>
<a id="js" href="javascript:document.body.dataset.pwned='1'">js</a>
</body></html>`);
fs.mkdirSync(path.join(dir, "user-data"), { recursive: true });
app.setPath("userData", path.join(dir, "user-data"));

app.whenReady().then(async () => {
  log("ready");
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false } });
  const { installNavigationGuard } = await import(pathToFileURL(path.join(repo, "app/desktop/navigation-guard.ts")).href);
  log("guard-imported");
  const opened = []; const blocked = [];
  installNavigationGuard(win.webContents, { allowedUrls: () => [pathToFileURL(page).href], openExternal: (u) => { opened.push(u); log("open", u); }, onBlocked: (r) => { blocked.push(r); log("blocked", r); } });
  await win.loadFile(page);
  log("loaded", win.webContents.getURL());
  const before = win.webContents.getURL();
  for (const id of ["https", "file", "data", "js"]) {
    log("click", id);
    await win.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(id)}).click()`);
    await new Promise((r) => setTimeout(r, 300));
  }
  const after = win.webContents.getURL();
  const pwned = await win.webContents.executeJavaScript("document.body.dataset.pwned || ''");
  log("window.open");
  await win.webContents.executeJavaScript("window.open('https://example.com/y','_blank'); 'called'");
  await new Promise((r) => setTimeout(r, 500));
  const afterOpen = win.webContents.getURL();
  console.log("NAV_PROBE=" + JSON.stringify({ before, after, afterOpen, opened, blocked, pwned }));
  app.exit(0);
}).catch(fail);
