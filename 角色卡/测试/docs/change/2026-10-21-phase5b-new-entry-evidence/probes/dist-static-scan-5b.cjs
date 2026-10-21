#!/usr/bin/env node
/**
 * Phase 2 独立验证：dist 入口静态扫描 + 入口引用资产 gzip9 预算。
 * 运行（仓库根）：node 角色卡/测试/docs/change/2026-10-21-phase2-verification-evidence/probes/dist-static-scan.cjs
 */
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const htmlPath = "app/renderer/dist/index.html";
const html = fs.readFileSync(htmlPath);
const s = html.toString();
const refs = [...s.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
let total = 0;
console.log("ENTRY=" + path.resolve(htmlPath));
console.log("HTML_BYTES=" + html.length);
for (const ref of refs) {
  const p = path.join(path.dirname(htmlPath), ref);
  const buf = fs.readFileSync(p);
  const gz = zlib.gzipSync(buf, { level: 9 }).length;
  total += gz;
  console.log(`ASSET ${ref} raw=${buf.length} gzip9=${gz}`);
}
const htmlGz = zlib.gzipSync(html, { level: 9 }).length;
total += htmlGz;
console.log(`ASSET index.html raw=${html.length} gzip9=${htmlGz}`);
console.log("TOTAL_GZIP9=" + total + " <=307200?" + (total <= 307200));
console.log("CSP_STATIC_SCAN " + JSON.stringify({
  INLINE_SCRIPT_PRESENT: /<script(?![^>]*\bsrc=)[^>]*>/i.test(s),
  STYLE_TAG_PRESENT: /<style[\s>]/i.test(s),
  STYLE_ATTR_PRESENT: /\bstyle\s*=/i.test(s),
  UNSAFE_INLINE: /unsafe-inline/i.test(s),
  UNSAFE_EVAL: /unsafe-eval/i.test(s),
  STRICT_CSP_META_PRESENT: /content="default-src \x27none\x27; script-src \x27self\x27; style-src \x27self\x27; img-src \x27self\x27 data:;"/.test(s),
  MODULEPRELOAD_LINK: /modulepreload/.test(s),
  SCRIPT_COUNT: (s.match(/<script/g) || []).length,
  SCRIPT_WITH_SRC_COUNT: (s.match(/<script[^>]*\bsrc=/g) || []).length,
  // 5B 入口为 app/renderer/dist/index.html，Vite 产物引用 ./assets/；
  // 5A dist/src 入口产物引用 ../assets/。两者均为同目录相对引用，均接受。
  RELATIVE_ASSET_REFS: refs.every((r) => r.startsWith("./assets/") || r.startsWith("../assets/")),
}));
