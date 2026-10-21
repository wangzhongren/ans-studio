#!/usr/bin/env node
/**
 * 补充探针：真实键盘 modality 下的 :focus-visible（show:true）。
 * 说明：show:false 的隐藏窗口 document.hasFocus()=false，Chromium 不匹配 :focus-visible，
 * 因此主冒烟用 CDP forcePseudoState + 过渡等待；本探针用可见窗口 + 真实 Tab 键复核。
 */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const REPO = "/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
app.setPath("userData", "/tmp/ans-p2b-focus-userdata");
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1360, height: 860, useContentSize: true, show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: path.join(REPO, "app/preload.cjs") } });
  const wc = win.webContents;
  await win.loadFile(path.join(REPO, "app/renderer/dist/src/index.html"));
  await new Promise((r) => setTimeout(r, 600));
  const js = (c) => wc.executeJavaScript(c, true);
  await js(`window.__ansRenderer.openConfirmDemo({command:'echo focus'})`);
  await new Promise((r) => setTimeout(r, 400));
  const report = { hasFocus: await js(`document.hasFocus()`), checks: [] };
  const snap = async (label, expr) => {
    const v = await js(expr);
    report.checks.push({ label, ...v });
    console.log("FOCUS", label, JSON.stringify(v));
  };
  // 真实 Tab：首个焦点元素
  await js(`document.activeElement && document.activeElement.blur()`);
  wc.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
  wc.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
  await new Promise((r) => setTimeout(r, 200));
  await snap("first-tab", `(() => { const a = document.activeElement; const cs = a ? getComputedStyle(a) : null; return { id: a && a.id, tag: a && a.tagName, matchesFocusVisible: a ? a.matches(':focus-visible') : null, outlineWidth: cs && cs.outlineWidth, outlineStyle: cs && cs.outlineStyle, outlineColor: cs && cs.outlineColor, outlineOffset: cs && cs.outlineOffset }; })()`);
  // 键盘 modality 下程序化 focus 组件按钮与输入框（等过渡 300ms）
  await js(`document.getElementById('sc-allow').focus()`);
  await new Promise((r) => setTimeout(r, 350));
  await snap("allow-focus", `(() => { const a = document.getElementById('sc-allow'); const cs = getComputedStyle(a); return { id: a.id, matchesFocusVisible: a.matches(':focus-visible'), outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset }; })()`);
  await js(`document.getElementById('inp-message').focus()`);
  await new Promise((r) => setTimeout(r, 350));
  await snap("textarea-focus", `(() => { const a = document.getElementById('inp-message'); const cs = getComputedStyle(a); return { id: a.id, matchesFocusVisible: a.matches(':focus-visible'), outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset }; })()`);
  await js(`document.getElementById('runtime-select').focus()`);
  await new Promise((r) => setTimeout(r, 350));
  await snap("engine-trigger-focus", `(() => { const a = document.getElementById('runtime-select'); const cs = getComputedStyle(a); return { id: a.id, matchesFocusVisible: a.matches(':focus-visible'), outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset }; })()`);
  report.pass = report.checks.every((c) => c.matchesFocusVisible === true && c.outlineWidth === "2px" && c.outlineStyle === "solid" && c.outlineColor === "rgb(111, 160, 139)" && c.outlineOffset === "3px");
  console.log("FOCUS_ALL_PASS=" + report.pass);
  win.destroy();
  app.exit(report.pass ? 0 : 1);
}).catch((e) => { console.error(e); app.exit(2); });
