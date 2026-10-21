const { app, BrowserWindow } = require("electron");
const path = require("path");
const REPO = "/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
app.setPath("userData", "/tmp/ans-p2-probe-userdata");
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360, height: 860, useContentSize: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: path.join(REPO, "app/preload.cjs") },
  });
  await win.loadFile(path.join(REPO, "app/renderer/dist/src/index.html"));
  await new Promise((r) => setTimeout(r, 500));
  const result = await win.webContents.executeJavaScript(`(async () => {
    const out = [];
    const sample = (tag) => {
      const app = document.querySelector('.app');
      const left = document.querySelector('.col-left');
      const panels = [...document.querySelectorAll('.app-body [data-panel]')];
      out.push({
        tag,
        collapsedClass: app.classList.contains('is-sidebar-collapsed'),
        leftW: left ? +left.getBoundingClientRect().width.toFixed(2) : null,
        panels: panels.map((p) => ({ id: p.getAttribute('data-panel'), w: +p.getBoundingClientRect().width.toFixed(2), flex: p.style.flex, style: p.getAttribute('style') })),
        groupStyle: document.querySelector('.app-body').getAttribute('style'),
      });
    };
    sample('before');
    document.getElementById('sidebar-collapse').click();
    sample('sync-after-click');
    await new Promise((r) => requestAnimationFrame(r));
    sample('raf1');
    await new Promise((r) => requestAnimationFrame(r));
    sample('raf2');
    await new Promise((r) => setTimeout(r, 50));
    sample('t50');
    await new Promise((r) => setTimeout(r, 100));
    sample('t150');
    await new Promise((r) => setTimeout(r, 250));
    sample('t400');
    // expand again and sample
    document.getElementById('sidebar-expand').click();
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    sample('expand-raf2');
    await new Promise((r) => setTimeout(r, 400));
    sample('expand-t400');
    return out;
  })()`, true);
  console.log(JSON.stringify(result, null, 2));
  win.destroy();
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(2); });
