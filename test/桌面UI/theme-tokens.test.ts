// 2026-10-29（客户：决策弹窗透明）：renderer 的 var(--x) 必须都有定义——
// 静态扫描 CSS/TSX；运行时注入变量（Tailwind/Base UI 定位）单独 allowlist。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../app/renderer/src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(css|tsx?|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const css = files.filter((file) => file.endsWith(".css")).map((file) => fs.readFileSync(file, "utf8")).join("\n");
const all = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const defined = new Set([...css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((match) => match[1]!));
const used = new Set([
  ...[...all.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)].map((match) => match[1]!),
  ...[...all.matchAll(/\((--[A-Za-z0-9_-]+)\)/g)].map((match) => match[1]!),
]);
// Tailwind/Base UI 在运行时注入的定位/间距变量（不是主题令牌，不能静态定义）。
const runtimeInjected = new Set(["--available-height", "--anchor-width", "--transform-origin", "--card-spacing"]);
const missing = [...used].filter((name) => !defined.has(name) && !runtimeInjected.has(name)).sort();

test("renderer 令牌审计：所有 var(--x) 都有定义（运行时注入变量除外）", () => {
  assert.deepEqual(missing, [], `未定义令牌：${missing.join(", ")}`);
  assert.ok(defined.has("--surface"), "决策弹窗/列表的 --surface 必须定义");
  assert.ok(defined.has("--radius-card"), "决策弹窗的 --radius-card 必须定义");
  assert.ok(defined.has("--text"), "旧组件正文色 --text 必须定义");
});

test("主题令牌值：surface 为抬升面、radius-card 复用主题圆角", () => {
  assert.match(css, /--surface:\s*#1e2328;/);
  assert.match(css, /--radius-card:\s*var\(--radius\);/);
});
