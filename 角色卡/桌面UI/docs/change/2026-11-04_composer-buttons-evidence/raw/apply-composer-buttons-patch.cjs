#!/usr/bin/env node
/** 2026-11-04 客户直修：输入区按钮精简补丁（精确单次替换，失败即停；兼容 CRLF）。 */
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");

function adapt(text, needle, replacement) {
  if (text.includes(needle)) { return [needle, replacement]; }
  const crlfNeedle = needle.split("\n").join("\r\n");
  if (text.includes(crlfNeedle)) { return [crlfNeedle, replacement.split("\n").join("\r\n")]; }
  return null;
}

function replaceOnce(file, needle, replacement, label) {
  const target = path.join(ROOT, file);
  const text = fs.readFileSync(target, "utf8");
  const pair = adapt(text, needle, replacement);
  if (pair === null) {
    const already = replacement.length > 0 ? adapt(text, replacement, replacement) : null;
    if (already !== null) { console.log("ALREADY " + label + " :: " + file); return; }
    throw new Error("not found: " + label);
  }
  const realNeedle = pair[0];
  const realReplacement = pair[1];
  const index = text.indexOf(realNeedle);
  const rest = text.slice(index + realNeedle.length);
  if (rest.includes(realNeedle)) { throw new Error("multiple matches: " + label); }
  fs.writeFileSync(target, text.slice(0, index) + realReplacement + rest);
  console.log("PATCHED " + label + " :: " + file);
}

function removeBlock(file, startNeedle, endNeedle, label) {
  const target = path.join(ROOT, file);
  const text = fs.readFileSync(target, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const startAdapted = text.includes(startNeedle) ? startNeedle : startNeedle.split("\n").join(eol);
  const endAdapted = text.includes(endNeedle) ? endNeedle : endNeedle.split("\n").join(eol);
  const start = text.indexOf(startAdapted);
  if (start < 0) { throw new Error("start not found: " + label); }
  const end = text.indexOf(endAdapted, start);
  if (end < 0) { throw new Error("end not found: " + label); }
  const rest = text.slice(end + endAdapted.length);
  if (rest.includes(startAdapted)) { throw new Error("multiple blocks: " + label); }
  fs.writeFileSync(target, text.slice(0, start) + rest);
  console.log("PATCHED " + label + " :: " + file);
}

function replaceLineContaining(file, markers, newLine, label) {
  const target = path.join(ROOT, file);
  const text = fs.readFileSync(target, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(eol);
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    let ok = true;
    for (const marker of markers) { if (!lines[i].includes(marker)) { ok = false; } }
    if (ok) { hits.push(i); }
  }
  if (hits.length !== 1) { throw new Error(label + " hits=" + hits.length); }
  lines[hits[0]] = newLine;
  fs.writeFileSync(target, lines.join(eol));
  console.log("PATCHED " + label + " :: " + file);
}

function enterLine(text) {
  const setValue = text === null ? "" : "i.value=" + JSON.stringify(text) + ";";
  return "await js(`(()=>{const i=document.getElementById(\"inp-message\");" + setValue + "i.focus();i.dispatchEvent(new KeyboardEvent(\"keydown\",{key:\"Enter\",bubbles:true,cancelable:true}));})()`);";
}

const COMPOSER = "app/renderer/src/shell/Composer.tsx";
replaceOnce(COMPOSER, "import { ArrowUp, ImagePlus, Scale, ScrollText, ShieldCheck, Square, X } from \"lucide-react\";", "import { ImagePlus, Scale, ScrollText, ShieldCheck, Square, X } from \"lucide-react\";", "composer: drop ArrowUp import");
replaceOnce(COMPOSER, "              size=\"sm\"\n              className=\"danger-ghost\"", "              size=\"icon-sm\"\n              className=\"danger-ghost\"", "halt: icon size");
replaceOnce(COMPOSER, "              title={t(\"ui.composer.stopTitle\")}\n              aria-label={t(\"ui.composer.stopTitle\")}", "              title={t(\"shared.common.stopTurn\")}\n              aria-label={t(\"shared.common.stopTurn\")}", "halt: accessible name");
replaceOnce(COMPOSER, "              <Square size={12} strokeWidth={1.5} aria-hidden=\"true\" />\n              {t(\"shared.common.stopTurn\")}\n            </Button>", "              <Square size={14} strokeWidth={1.5} aria-hidden=\"true\" />\n            </Button>", "halt: icon-only");
removeBlock(COMPOSER, "            <Button\n              id=\"btn-send\"", "            </Button>\n", "composer: remove send button");

const DRIVER = "app/renderer/src/test-driver.ts";
replaceOnce(DRIVER, "function sendDisabled(): boolean {\n  const el = document.getElementById(\"btn-send\");\n  return !(el instanceof HTMLButtonElement) || el.disabled;\n}", "function sendDisabled(): boolean {\n  // 2026-11-04 客户直修：发送按钮移除后，发送入口为 Enter；禁用事实改由会话/项目状态决定\n  // （等价 Composer 的 canSend = sessionOpen && projectRoot），保持驱动契约不变。\n  const ui = useUiStore.getState();\n  const chat = useChatStore.getState();\n  return !(\n    ui.selectedRoleId &&\n    chat.sessionOpenRoleId === ui.selectedRoleId &&\n    !!chat.projectRoot\n  );\n}", "test-driver: sendDisabled semantics");

const SMOKE3B = "test/桌面UI/phase3b-electron-smoke.mjs";
replaceLineContaining(SMOKE3B, ["btn-send", "冒烟发送"], enterLine("冒烟发送"), "phase3b: send via Enter");
replaceLineContaining(SMOKE3B, ["btn-send", "拒发保留"], enterLine("拒发保留"), "phase3b: failure via Enter");
const SMOKE4A = "test/桌面UI/phase4a-electron-smoke.mjs";
replaceLineContaining(SMOKE4A, ["btn-send"], enterLine(null), "phase4a: send via Enter");

console.log("PATCH_DONE");
