const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const REPO = "/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
app.setPath("userData", "/tmp/ans-p2-narrow-userdata");
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360, height: 860, useContentSize: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: path.join(REPO, "app/preload.cjs") },
  });
  await win.loadFile(path.join(REPO, "app/renderer/dist/src/index.html"));
  await new Promise((r) => setTimeout(r, 500));
  win.setContentSize(960, 620);
  await new Promise((r) => setTimeout(r, 500));
  const out = await win.webContents.executeJavaScript(`(() => {
    const rect = (s) => document.querySelector(s)?.getBoundingClientRect();
    return {
      inner: [window.innerWidth, window.innerHeight],
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      capsuleW: Math.round(rect('#composer-capsule').width),
      headW: Math.round(rect('.chat-head .head-inner').width),
      titlebarH: rect('#titlebar').height,
      chatHeadH: rect('.chat-head').height,
      keyboardHintVisible: getComputedStyle(document.querySelector('.composer-keyboard')).display !== 'none',
      titlebarSubVisible: getComputedStyle(document.querySelector('.titlebar-sub')).display !== 'none',
    };
  })()`, true);
  console.log("NARROW", JSON.stringify(out));
  const img = await win.webContents.capturePage();
  if (!img.isEmpty()) {
    const p = "/tmp/ans-p2-smoke-output/smoke-960x620.png";
    fs.writeFileSync(p, img.toPNG());
    console.log("NARROW_SHOT", p, fs.statSync(p).size);
  }
  win.destroy();
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(2); });
