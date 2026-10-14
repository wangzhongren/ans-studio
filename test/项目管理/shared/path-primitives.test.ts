// test/项目管理/shared/path-primitives.test.ts
// 项目管理：对共享路径原语 `src/common/shared/path-primitives.ts` 的行为验证，**并钉死「两处旧实现
// 对同一输入给同一答案」**——这是 T23 的要害（单一来源后应恒真）。
//
// 覆盖：
//  A. 共享原语自身行为（边界：大小写、尾点/空格、`..`、绝对/相对、Windows 分隔符、重复斜杠）。
//  B. **逐字同源**：共享原语与两处旧实现（门禁 `paths.ts` / Pi适配器 `fs-write.ts`）对同输入同输出。
//  C. **安全要害**：门禁 `realResolve`（sync）与 Pi适配器 `realResolveAsync`（async）对同输入同答案。
//
// 隶属：共享组件测试（`src/common/shared/` 的专属测试目录，pm 属主）。

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, after } from "node:test";

import * as shared from "../../../src/common/shared/path-primitives.ts";
// 两处旧实现（**只读导入**，用于证明收敛前后同答案；删除归 T20/T25）。
import {
  realResolve as gateRealResolve,
  toPosix as gateToPosix,
  normalizeLexical as gateNormalizeLexical,
  compareKey as gateCompareKey,
  absRel as gateAbsRel,
  isUnderOrEqual as gateIsUnderOrEqual,
  isAbsoluteAny as gateIsAbsoluteAny,
  IS_WINDOWS as GATE_IS_WINDOWS,
} from "../../../src/common/门禁引擎/paths.ts";
import { absRelLexical, realResolveAsync as piRealResolveAsync } from "../../../src/common/pi-adapter/fs-write.ts";

// ————————————————— 临时真实目录（供 realResolve 用例） —————————————————
const ROOT = mkdtempSync(join(tmpdir(), "ans-shared-paths-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

mkdirSync(join(ROOT, "a", "b"), { recursive: true });
writeFileSync(join(ROOT, "a", "b", "f.txt"), "hi", "utf8");

// 符号链接/junction：Windows 无特权时 symlink 可能失败，用 junction；仍失败则整体跳过链接用例。
let LINK: string | null = null;
try {
  LINK = join(ROOT, "link");
  symlinkSync(join(ROOT, "a"), LINK, "junction");
} catch {
  LINK = null;
}

// ————————————————— A. 共享原语自身行为 —————————————————

test("toPosix：反斜杠统一为正斜杠（Windows 分隔符）", () => {
  assert.equal(shared.toPosix("a\\b\\c"), "a/b/c");
  assert.equal(shared.toPosix("C:\\x\\y"), "C:/x/y");
  assert.equal(shared.toPosix("already/posix"), "already/posix");
  assert.equal(shared.toPosix(""), "");
});

test("normalizeLexical：折叠重复斜杠、解析 . 与 ..，不触碰文件系统", () => {
  assert.equal(shared.normalizeLexical("a//b"), "a/b");
  assert.equal(shared.normalizeLexical("a/./b"), "a/b");
  assert.equal(shared.normalizeLexical("a/b/../c"), "a/c");
  assert.equal(shared.normalizeLexical("a\\..\\b"), "b");
  assert.equal(shared.normalizeLexical(""), "");
  assert.equal(shared.normalizeLexical("."), "");
  assert.equal(shared.normalizeLexical("./"), "");
});

test("normalizeLexical：绝对路径越过根的多余 .. 被丢弃；相对路径开头的 .. 保留", () => {
  assert.equal(shared.normalizeLexical("/a/../../b"), "/b");
  assert.equal(shared.normalizeLexical("/.."), "/");
  assert.equal(shared.normalizeLexical("a/../../b"), "../b");
  assert.equal(shared.normalizeLexical("../a"), "../a");
  assert.equal(shared.normalizeLexical("../../a"), "../../a");
});

test("normalizeLexical：Windows 盘符保留且不越过盘根", () => {
  assert.equal(shared.normalizeLexical("C:\\a\\..\\b"), "C:/b");
  assert.equal(shared.normalizeLexical("C:/a/../../b"), "C:/b");
  assert.equal(shared.normalizeLexical("C:/.."), "C:/");
});

test("normalizeLexical：尾点/空格是**词法保留**的（剥离是写入层 checkRelativePathSafe 的职责，不在此）", () => {
  // 词法原语**不**处理 Windows 的尾点/空格静默剥离——那是写入层的名称安全校验。
  assert.equal(shared.normalizeLexical("dir./file"), "dir./file");
  assert.equal(shared.normalizeLexical("dir /file"), "dir /file");
  assert.equal(shared.normalizeLexical("name. "), "name. ");
});

test("normalizeLexical：保留内部空格与中文段", () => {
  assert.equal(shared.normalizeLexical("角色卡/项目管理/memo.md"), "角色卡/项目管理/memo.md");
  assert.equal(shared.normalizeLexical("a b/c d"), "a b/c d");
});

test("compareKey：Windows 折叠大小写、POSIX 原样（与平台一致）", () => {
  assert.equal(shared.compareKey("A/B"), GATE_IS_WINDOWS ? "a/b" : "A/B");
  assert.equal(shared.compareKey("C:\\X\\Y"), GATE_IS_WINDOWS ? "c:/x/y" : "C:/X/Y");
});

test("absRel：在 base 之下返回相对路径；相等返回空串；不在其下返回 null", () => {
  assert.equal(shared.absRel("/r/a/b.txt", "/r"), "a/b.txt");
  assert.equal(shared.absRel("/r", "/r"), "");
  assert.equal(shared.absRel("/other/x", "/r"), null);
});

test("absRel：前缀陷阱——/r/bc 不在 /r/b 之下（必须按路径段边界，非字符串前缀）", () => {
  assert.equal(shared.absRel("/r/bc", "/r/b"), null);
  assert.equal(shared.absRel("/r/b/c", "/r/b"), "c");
});

test("absRel：Windows 大小写不敏感匹配（大小写不同仍算在根内）", () => {
  if (!GATE_IS_WINDOWS) return;
  assert.equal(shared.absRel("C:/R/A/File.TXT", "c:/r"), "A/File.TXT");
  assert.equal(shared.absRel("C:/R/A", "c:/r/a"), "");
});

test("isWithinReal：等于 root 或在其下为真，否则假", () => {
  assert.equal(shared.isWithinReal("/r", "/r"), true);
  assert.equal(shared.isWithinReal("/r", "/r/a/b"), true);
  assert.equal(shared.isWithinReal("/r", "/other"), false);
  assert.equal(shared.isWithinReal("/r/b", "/r/bc"), false);
});

test("isUnderOrEqual：空 base 恒真；按段边界判定", () => {
  assert.equal(shared.isUnderOrEqual("a/b", ""), true);
  assert.equal(shared.isUnderOrEqual("a/b", "a"), true);
  assert.equal(shared.isUnderOrEqual("a", "a"), true);
  assert.equal(shared.isUnderOrEqual("ab", "a"), false);
});

test("isAbsoluteAny：POSIX 前导斜杠、Windows 盘符为真；相对/UNC 裸形为假", () => {
  assert.equal(shared.isAbsoluteAny("/x"), true);
  assert.equal(shared.isAbsoluteAny("C:\\x"), true);
  assert.equal(shared.isAbsoluteAny("a/b"), false);
  assert.equal(shared.isAbsoluteAny(""), false);
});

// ————————————————— B. 逐字同源：共享原语 == 两处旧实现 —————————————————

const LEXICAL_CORPUS = [
  "",
  ".",
  "..",
  "/",
  "//",
  "a",
  "a/b",
  "a//b",
  "a/./b",
  "a/../b",
  "../a",
  "../../a",
  "/a/../../b",
  "/..",
  "C:\\a\\b",
  "c:/A/B",
  "C:/a/../b",
  "C:/..",
  "a/b/",
  "a b/c d",
  "a./b",
  "a /b",
  "name. ",
  "角色卡/项目管理/memo.md",
  "a\\..\\b",
  "\\\\server\\share\\x",
];

test("逐字同源：normalizeLexical / toPosix / compareKey 与门禁引擎旧实现逐字相同", () => {
  for (const x of LEXICAL_CORPUS) {
    assert.equal(shared.normalizeLexical(x), gateNormalizeLexical(x), `normalizeLexical(${JSON.stringify(x)})`);
    assert.equal(shared.toPosix(x), gateToPosix(x), `toPosix(${JSON.stringify(x)})`);
    assert.equal(shared.compareKey(x), gateCompareKey(x), `compareKey(${JSON.stringify(x)})`);
    assert.equal(shared.isAbsoluteAny(x), gateIsAbsoluteAny(x), `isAbsoluteAny(${JSON.stringify(x)})`);
  }
});

const ABSREL_PAIRS: Array<[string, string]> = [
  ["/r/a/b.txt", "/r"],
  ["/r", "/r"],
  ["/other/x", "/r"],
  ["/r/bc", "/r/b"],
  ["/r/b/c", "/r/b"],
  ["C:/R/A/File.TXT", "c:/r"],
  ["C:/R/A", "c:/r/a"],
  ["a/b/c", "a/b"],
];

test("逐字同源：absRel 与门禁引擎 absRel 逐字相同", () => {
  for (const [abs, base] of ABSREL_PAIRS) {
    assert.equal(shared.absRel(abs, base), gateAbsRel(abs, base), `absRel(${abs}, ${base})`);
  }
});

test("逐字同源：isUnderOrEqual 与门禁引擎逐字相同", () => {
  for (const [rel, base] of [["a/b", ""], ["a/b", "a"], ["a", "a"], ["ab", "a"], ["x/y/z", "x/y"]] as Array<[string, string]>) {
    assert.equal(shared.isUnderOrEqual(rel, base), gateIsUnderOrEqual(rel, base), `isUnderOrEqual(${rel}, ${base})`);
  }
});

test("逐字同源：absRel == Pi适配器旧实现 absRelLexical（同一函数、两处曾各自维护）", () => {
  for (const [abs, base] of ABSREL_PAIRS) {
    assert.equal(shared.absRel(abs, base), absRelLexical(abs, base), `absRelLexical(${abs}, ${base})`);
  }
});

test("逐字同源：shared.realResolve == 门禁引擎旧 realResolve（同输入同答案）", () => {
  const inputs = [
    ROOT,
    join(ROOT, "a", "b", "f.txt"),
    join(ROOT, "a"),
    join(ROOT, "nope", "deep", "x"),
    join(ROOT, "a") + "\\",
  ];
  for (const x of inputs) {
    assert.equal(shared.realResolve(x), gateRealResolve(x), `realResolve(${x})`);
  }
});

test("逐字同源：shared.realResolveAsync == Pi适配器旧 realResolveAsync（同输入同答案）", async () => {
  const inputs = [ROOT, join(ROOT, "a", "b", "f.txt"), join(ROOT, "nope", "x")];
  for (const x of inputs) {
    assert.equal(await shared.realResolveAsync(x), await piRealResolveAsync(x), `realResolveAsync(${x})`);
  }
});

// ————————————————— C. 安全要害：两处旧实现（sync 门禁 / async Pi）对同一输入同答案 —————————————————

test("两处旧实现同答案（要害）：门禁 realResolve(sync) 与 Pi适配器 realResolveAsync(async) 对同输入同输出", async () => {
  const inputs: string[] = [
    ROOT,
    join(ROOT, "a", "b", "f.txt"),
    join(ROOT, "a", "B", "F.TXT"), // 大小写不同（Windows 上 realpath 规范化大小写）
    join(ROOT, "nope", "deep", "x"), // 不存在的尾部：纯词法拼回
    join(ROOT, "a") + "/../a/b", // 含 ..
  ];
  if (LINK) {
    inputs.push(LINK, join(LINK, "b"), join(LINK, "b", "f.txt")); // 穿符号链接/junction
  }
  for (const x of inputs) {
    const sync = gateRealResolve(x);
    const asyncR = await piRealResolveAsync(x);
    assert.equal(asyncR, sync, `sync/async 分歧于：${x}`);
  }
});

test("realResolve 解析 junction 逃逸：经链接到达的真实路径落在链接目标之下", () => {
  if (!LINK) return; // 无法创建链接时跳过
  const real = shared.realResolve(join(LINK, "b"));
  // tmpdir 的父链本身也可能是链接（Mac /var -> /private/var）；预期以独立 OS realpath 为准。
  assert.equal(real, shared.normalizeLexical(realpathSync.native(join(ROOT, "a", "b"))));
  // 关键安全性质：判定权威用**链接目标**（而非链接路径）来比较是否在根内。
  assert.equal(shared.isWithinReal(shared.realResolve(ROOT), real), true);
});
