// test/项目管理/shared/i18n-guard.test.ts
// 项目管理：i18n 硬编码守卫（方案 §4.9；验收标准 P3）。
//
// 判据：
//  · 扫描 `app/renderer/src/**/*.{ts,tsx}`、`app/desktop/**/*.ts`、`src/index.ts`、
//    `src/interface/cli/**`、`src/common/shared/runtime-settings.ts`；
//  · 去除注释后，字符串/模板/JSX 文本（以及保守超集：标识符/正则）中的中文必须为 0，
//    除非文件在 B0 allowlist 中；
//  · allowlist 逐批收紧：条目必须仍在扫描范围且当前仍含中文（陈旧条目直接失败）；
//  · 合成负例证明「新文件含中文被拒绝」，且只写系统临时目录、不写仓库源码。
//
// 守卫只读源码；不修改任何文件。

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { I18N_GUARD_ALLOWLIST } from "./i18n-guard-allowlist.ts";
import {
  collectGuardFiles,
  evaluateGuard,
  evaluateGuardFile,
  findHan,
  stripComments,
  toRepoPath,
} from "./i18n-guard-scanner.ts";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ALLOWLIST: ReadonlySet<string> = new Set(I18N_GUARD_ALLOWLIST);

test("守卫范围：包含入口与共享设置，排除测试/消息目录/治理角色文本/dist", () => {
  const rels = collectGuardFiles(ROOT).map((file) => toRepoPath(ROOT, file));
  assert.ok(rels.length > 0, "扫描结果为空");
  assert.ok(rels.includes("src/index.ts"));
  assert.ok(rels.includes("src/common/shared/runtime-settings.ts"));
  assert.ok(rels.includes("app/desktop/interface.ts"));
  assert.ok(rels.some((rel) => rel.startsWith("app/renderer/src/")));
  assert.equal(rels.some((rel) => /\.(test|spec)\.tsx?$/.test(rel)), false);
  assert.equal(rels.some((rel) => rel.startsWith("src/common/shared/i18n/messages/")), false);
  assert.equal(rels.some((rel) => rel.endsWith("governance-roles.ts")), false);
  assert.equal(rels.some((rel) => rel.startsWith("app/renderer/dist/")), false);
  assert.equal(rels.some((rel) => rel.includes("node_modules/")), false);
});

test("allowlist 纪律：无重复、已排序、无陈旧条目（每条仍在范围内且仍含中文）", () => {
  assert.equal(new Set(I18N_GUARD_ALLOWLIST).size, I18N_GUARD_ALLOWLIST.length, "allowlist 有重复条目");
  assert.deepEqual(
    [...I18N_GUARD_ALLOWLIST],
    [...I18N_GUARD_ALLOWLIST].sort(),
    "allowlist 未按字典序排列",
  );
  const scanned = new Set(collectGuardFiles(ROOT).map((file) => toRepoPath(ROOT, file)));
  for (const rel of I18N_GUARD_ALLOWLIST) {
    assert.ok(scanned.has(rel), `allowlist 条目不在扫描范围：${rel}`);
    const hits = findHan(readFileSync(join(ROOT, ...rel.split("/")), "utf8"));
    assert.ok(hits.length > 0, `allowlist 条目已无中文，应从清单移除：${rel}`);
  }
});

test("硬编码守卫：allowlist 之外不得出现中文（B0 基线条目全部通过）", () => {
  const files = collectGuardFiles(ROOT);
  const violations: string[] = [];
  for (const file of files) {
    const result = evaluateGuardFile(ROOT, file, ALLOWLIST);
    if (!result.allowed) {
      const first = result.hits[0];
      const where = first === undefined ? "" : `:${first.line}:${first.column} ${first.text}`;
      violations.push(`${result.path}${where}`);
    }
  }
  console.log(
    `[i18n-guard] scanned=${files.length} allowlisted=${I18N_GUARD_ALLOWLIST.length} violations=${violations.length}`,
  );
  assert.deepEqual(violations, [], "allowlist 之外出现硬编码中文");
});

test("合成负例：新文件的中文字符串/模板/JSX 文本被拒绝；注释中文放行", () => {
  const dir = mkdtempSync(join(os.tmpdir(), "ans-i18n-guard-"));
  try {
    const source = [
      "// 行注释里的中文不算硬编码",
      "/* 块注释里的中文也不算 */",
      'export const label = "新按钮";',
      "export const title = `模板 ${1 + 1} 文案`;",
      'export const view = <span title="提示">按钮</span>;',
    ].join("\n");
    const file = join(dir, "NewPanel.tsx");
    writeFileSync(file, source, "utf8");

    const hits = findHan(readFileSync(file, "utf8"));
    const hitText = hits.map((hit) => hit.text).join("|");
    for (const expected of ["新按钮", "模板", "文案", "提示", "按钮"]) {
      assert.ok(hitText.includes(expected), `未检出中文片段：${expected}（实际：${hitText}）`);
    }
    assert.equal(hitText.includes("注释"), false, "注释中的中文不应被检出");

    const newFile = "app/renderer/src/shell/NewPanel.tsx";
    const rejected = evaluateGuard(newFile, source, ALLOWLIST);
    assert.equal(rejected.allowed, false, "allowlist 之外的新文件含中文必须被拒绝");
    assert.ok(rejected.hits.length >= 5);

    const allowedPath = I18N_GUARD_ALLOWLIST[0];
    assert.ok(allowedPath !== undefined, "allowlist 为空，无法验证放行路径");
    const allowed = evaluateGuard(allowedPath, source, ALLOWLIST);
    assert.equal(allowed.allowed, true, "allowlist 内文件应放行");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("去注释扫描：字符串/模板中的 URL 与内容不误删", () => {
  const source = [
    'const url = "https://example.test/路径"; // 中文注释',
    'const t = `https://例子.test/${"中文"}`;',
  ].join("\n");
  const hitText = findHan(source)
    .map((hit) => hit.text)
    .join("|");
  assert.ok(hitText.includes("路径"));
  assert.ok(hitText.includes("例子"));
  assert.ok(hitText.includes("中文"));
  assert.equal(hitText.includes("注释"), false);
});

test("去注释扫描：模板表达式内的注释被去除，模板原文保留", () => {
  const source = "const x = `前 ${1 /* 表达式注释 */ + 2} 后`;";
  const stripped = stripComments(source);
  assert.equal(stripped.includes("表达式注释"), false);
  assert.equal(stripped.includes("前"), true);
  assert.equal(stripped.includes("后"), true);
});
