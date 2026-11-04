// Patch probe shot() to drop stale first frames (CRLF-aware, exact match).
const fs = require("node:fs");
const file = "角色卡/桌面UI/docs/change/2026-11-04_delivery-inline-report-evidence/probe-delivery-inline.mjs";
let text = fs.readFileSync(file, "utf8");
const crlf = text.includes("\r\n");
const adapt = (value) => (crlf ? value.replace(/\n/g, "\r\n") : value);
const oldText = adapt(`  const shot = async (name) => {
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    report.screenshots.push(path.basename(file));
  };`);
const newText = adapt(`  const shot = async (name) => {
    const file = path.join(OUT, name + ".png");
    // show:false 窗口的首张 capturePage 常返回重绘前旧帧（空壳/旧滚动位置）：
    // 先请求完整重绘，等两个渲染帧后丢弃一张预热帧，再取真实帧。
    wc.invalidate();
    await js("new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))").catch(() => undefined);
    await sleep(180);
    await wc.capturePage();
    await sleep(120);
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    report.screenshots.push(path.basename(file));
  };`);
const first = text.indexOf(oldText);
if (first < 0) {
  if (text.includes(newText)) {
    console.log("ALREADY patched");
    process.exit(0);
  }
  console.error("MISS shot()");
  process.exit(1);
}
text = text.slice(0, first) + newText + text.slice(first + oldText.length);
fs.writeFileSync(file, text);
console.log("PATCHED shot()");
