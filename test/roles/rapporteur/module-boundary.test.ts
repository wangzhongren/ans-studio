// test/roles/rapporteur/module-boundary.test.ts
// 模块边界/纯度静态扫描（E1.4/E1.5/E1.6 自检；B1 E1.4/E1.5）：
//   · 模块根只有 index.ts；内部实现只在 internal/ 子目录；
//   · 外部只能经 index.ts 导入（内部文件不得被模块外引用）；
//   · 仅依赖 src/model/ 与 src/common/shared/ public entry；零跨角色 import；零引擎/门控 import；
//   · 无 I/O / 时钟 / 随机数 / 环境/进程/控制台；唯一 public 值导出。
//
// 说明：这是角色自己的轻量静态扫描，不替代 gates-code 的 TS Compiler API 模块图扫描（B1 E1.5）。

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import * as moduleNamespace from "../../../src/common/roles/rapporteur/index.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");
const MODULE_ROOT = path.join(PROJECT_ROOT, "src/common/roles/rapporteur");
const INTERNAL_ROOT = path.join(MODULE_ROOT, "internal");

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function listFiles(dir: string, predicate: (abs: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...listFiles(abs, predicate));
    else if (predicate(abs)) out.push(abs);
  }
  return out;
}

const MODULE_FILES = listFiles(MODULE_ROOT, (abs) => abs.endsWith(".ts"));

test("边界：模块根只有 index.ts，其余实现都在 internal/", () => {
  const rootEntries = readdirSync(MODULE_ROOT).sort();
  assert.deepEqual(rootEntries, ["index.ts", "internal"], "模块根不得散放其他文件");
  const internalFiles = readdirSync(INTERNAL_ROOT).sort();
  assert.ok(internalFiles.length > 0);
  for (const name of internalFiles) assert.ok(name.endsWith(".ts"), `${name} 必须是 TypeScript 内部实现`);
});

test("边界：唯一 public 值导出（模块 namespace 只有 rapporteurRoleModule）", () => {
  assert.deepEqual(Object.keys(moduleNamespace), ["rapporteurRoleModule"]);
});

test("边界：index.ts 无 export default、只有一个模块值导出", () => {
  const source = readFileSync(path.join(MODULE_ROOT, "index.ts"), "utf8");
  assert.equal(/export\s+default\b/.test(source), false);
  assert.equal((source.match(/export\s+const\s+[A-Za-z0-9_]+/g) ?? []).length, 1);
  assert.equal(/export\s+(function|class|let|var)\b/.test(source), false);
});

test("边界：所有 import 只指向模块内部 / src/model / src/common/shared", () => {
  const violations: string[] = [];
  for (const abs of MODULE_FILES) {
    const source = readFileSync(abs, "utf8");
    const relFile = toPosix(path.relative(PROJECT_ROOT, abs));
    for (const match of source.matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/g)) {
      const specifier = match[1]!;
      if (!specifier.startsWith(".")) {
        violations.push(`${relFile}: non-relative import ${specifier}`);
        continue;
      }
      const target = path.resolve(path.dirname(abs), specifier);
      const relTarget = toPosix(path.relative(PROJECT_ROOT, target));
      const insideModule = target.startsWith(MODULE_ROOT + path.sep) || target === MODULE_ROOT;
      const insideModel = target.startsWith(path.join(PROJECT_ROOT, "src/model") + path.sep);
      const insideShared = target.startsWith(path.join(PROJECT_ROOT, "src/common/shared") + path.sep);
      if (!insideModule && !insideModel && !insideShared) violations.push(`${relFile}: forbidden target ${relTarget}`);
      if (/门禁引擎|\/pipeline\/|\/service\/|\/provider\/|\/app\/|\/roles\/(?!rapporteur)|\/gates\//.test(relTarget)) {
        violations.push(`${relFile}: forbidden dependency ${relTarget}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test("边界：模块外不得导入 internal 实现（唯一入口 index.ts）", () => {
  const roots = ["src", "test", "app"].map((dir) => path.join(PROJECT_ROOT, dir));
  const violations: string[] = [];
  for (const root of roots) {
    for (const abs of listFiles(root, (file) => file.endsWith(".ts"))) {
      if (abs.startsWith(MODULE_ROOT + path.sep)) continue;
      const source = readFileSync(abs, "utf8");
      if (/common\/roles\/rapporteur\/internal|roles\/rapporteur\/internal/.test(source)) {
        violations.push(toPosix(path.relative(PROJECT_ROOT, abs)));
      }
    }
  }
  assert.deepEqual(violations, []);
});

test("纯度：无 I/O / 时钟 / 随机数 / 进程/环境/控制台副作用", () => {
  const forbiddenPatterns: ReadonlyArray<{ name: string; pattern: RegExp }> = [
    { name: "node builtin import", pattern: /(?:from\s+|import\s+)["']node:/ },
    { name: "filesystem import", pattern: /["'](?:node:)?fs(?:\/promises)?["']/ },
    { name: "path/crypto import", pattern: /["'](?:node:)?(?:path|crypto)["']/ },
    { name: "fetch", pattern: /\bfetch\s*\(/ },
    { name: "new Date", pattern: /\bnew\s+Date\b/ },
    { name: "Date.now", pattern: /\bDate\.now\b/ },
    { name: "Math.random", pattern: /\bMath\.random\b/ },
    { name: "process", pattern: /\bprocess\./ },
    { name: "console", pattern: /\bconsole\./ },
    { name: "setTimeout/Interval", pattern: /\bset(?:Timeout|Interval)\s*\(/ },
    { name: "read/write file", pattern: /\b(?:readFile|writeFile|readdir|mkdir|appendFile)\b/ },
  ];
  const violations: string[] = [];
  for (const abs of MODULE_FILES) {
    const source = readFileSync(abs, "utf8");
    const relFile = toPosix(path.relative(PROJECT_ROOT, abs));
    for (const { name, pattern } of forbiddenPatterns) {
      if (pattern.test(source)) violations.push(`${relFile}: ${name}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("纯度：无可变模块状态（无顶层 let / 无非冻结数据导出）", () => {
  const violations: string[] = [];
  for (const abs of MODULE_FILES) {
    const source = readFileSync(abs, "utf8");
    const relFile = toPosix(path.relative(PROJECT_ROOT, abs));
    if (/^let\s+/m.test(source)) violations.push(`${relFile}: top-level let`);
    if (/^var\s+/m.test(source)) violations.push(`${relFile}: top-level var`);
  }
  assert.deepEqual(violations, []);
});

test("纯度：运行时模块对象不可被调用方改写", () => {
  assert.ok(Object.isFrozen(moduleNamespace.rapporteurRoleModule));
  assert.equal(moduleNamespace.rapporteurRoleModule.id, "rapporteur");
});
