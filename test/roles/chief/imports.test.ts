// chief 角色模块 import / 模块图扫描（B1 E1.4/E1.5；E1 出口自检）。
//
// 口径（E0.3 §2/§3.3、团队计划 §4.4①）：
//  - 唯一 public entry：模块根只有 `index.ts`（内部实现放在 `internal/`，外部只能经 index 导入）；
//  - 模块源只 import `src/model/` 与 `src/common/shared/` 的 public entry（相对路径）与自身内部文件；
//  - 零跨角色 import；不 import 引擎（`src/common/门禁引擎/`、`src/pipeline/`、`src/service/`、
//    `src/provider/`、`app/`）或门控模块；
//  - 纯数据/纯函数：模块源不得出现 I/O、时钟、随机数、控制台、进程或网络调用。
//
// 扫描是静态文本扫描（不引入新依赖；TS Compiler API 的完整模块图扫描属 E1 gates-code/E3）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MODULE_ROOT = resolve(REPO_ROOT, "src", "common", "roles", "chief");
const INTERNAL_ROOT = resolve(MODULE_ROOT, "internal");

function relativePath(filePath: string): string {
  return filePath.slice(REPO_ROOT.length + 1).replaceAll("\\", "/");
}

function importSpecifiersOf(source: string): string[] {
  return [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]!);
}

test("模块图：模块根只有 index.ts；内部实现在 internal/", () => {
  const rootEntries = readdirSync(MODULE_ROOT, { withFileTypes: true });
  const rootFiles = rootEntries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  assert.deepEqual(rootFiles, ["index.ts"], "模块根不得散放其他文件（唯一 public entry）");
  const rootDirs = rootEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.deepEqual(rootDirs, ["internal"]);
  assert.ok(readdirSync(INTERNAL_ROOT).length > 0);
});

test("模块图：模块源 import 仅 Model/shared public entry 与自身内部文件（零越界、零跨角色）", () => {
  const files = [
    resolve(MODULE_ROOT, "index.ts"),
    ...readdirSync(INTERNAL_ROOT).map((name) => resolve(INTERNAL_ROOT, name)),
  ].filter((filePath) => filePath.endsWith(".ts"));

  for (const filePath of files) {
    const source = readFileSync(filePath, "utf8");
    const rel = relativePath(filePath);
    const specifiers = importSpecifiersOf(source);
    for (const specifier of specifiers) {
      assert.ok(specifier.startsWith("./") || specifier.startsWith("../"), `${rel}: 非相对 import ${specifier}`);
      assert.equal(specifier.includes("门禁引擎"), false, `${rel}: 不得 import 门禁引擎私有 common`);
      assert.equal(specifier.includes("/pipeline/"), false, `${rel}: 不得 import pipeline`);
      assert.equal(specifier.includes("/service/"), false, `${rel}: 不得 import service`);
      assert.equal(specifier.includes("/provider/"), false, `${rel}: 不得 import provider`);
      assert.equal(specifier.includes("/app/"), false, `${rel}: 不得 import app`);
      assert.equal(specifier.includes("/gates"), false, `${rel}: 不得 import 门控模块`);
      assert.equal(specifier.includes("/roles/"), false, `${rel}: 零跨角色 import`);

      if (filePath === resolve(MODULE_ROOT, "index.ts")) {
        assert.match(specifier, /^\.\/internal\/[a-z-]+\.ts$/, `${rel}: 只经 internal 相对导入`);
      } else if (specifier.startsWith("./")) {
        assert.match(specifier, /^\.\/[a-z-]+\.ts$/, `${rel}: 内部兄弟文件导入`);
      } else {
        assert.ok(
          specifier.startsWith("../../../../model/") || specifier.startsWith("../../../shared/"),
          `${rel}: 只允许 Model 与 shared public entry（实际 ${specifier}）`,
        );
      }
    }
  }
});

test("模块图：模块源无 I/O/时钟/随机数/控制台/进程/网络调用（纯数据/纯函数）", () => {
  const files = [
    resolve(MODULE_ROOT, "index.ts"),
    ...readdirSync(INTERNAL_ROOT).map((name) => resolve(INTERNAL_ROOT, name)),
  ].filter((filePath) => filePath.endsWith(".ts"));

  const forbiddenTokens = [
    "node:fs",
    "node:crypto",
    "node:path",
    "node:net",
    "node:http",
    "Math.random",
    "Date.now",
    "new Date(",
    "setTimeout",
    "setInterval",
    "process.",
    "console.",
    "fetch(",
    "XMLHttpRequest",
    "localStorage",
  ];
  for (const filePath of files) {
    const source = readFileSync(filePath, "utf8");
    const rel = relativePath(filePath);
    for (const token of forbiddenTokens) {
      assert.equal(source.includes(token), false, `${rel}: 出现禁止 token ${token}`);
    }
  }
});

test("模块图：index.ts 是唯一 public entry（导出面集中）", () => {
  const indexPath = resolve(MODULE_ROOT, "index.ts");
  const source = readFileSync(indexPath, "utf8");
  const exports = [...source.matchAll(/\bexport\s+(?:type\s+)?\{([^}]+)\}/g)].flatMap((match) =>
    match[1]!.split(",").map((part) => part.trim().split(/\s+as\s+/).pop()!.trim()),
  );
  assert.ok(exports.includes("chiefRoleModule"), "必须导出 BuiltInRoleModule");
  assert.ok(exports.includes("CHIEF_HUB_DISPATCH"));
  assert.ok(exports.includes("CHIEF_INTENT_CONFIRM_CARD"));
  assert.ok(exports.includes("CHIEF_WORKFLOW_RESOURCE"));
  assert.ok(exports.includes("CHIEF_POLICY_CODES"));
  assert.ok(exports.includes("CHIEF_MESSAGE_KEYS"));
  assert.ok(exports.includes("CHIEF_TOOL_REASON_CODES"));
  assert.ok(exports.includes("CHIEF_TOOL_MESSAGE_KEYS"));
  assert.ok(exports.includes("CHIEF_TOOL_IDS"));
});
