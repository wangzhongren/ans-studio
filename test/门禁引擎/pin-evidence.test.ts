// 门禁引擎测试：只读 pin 证据检查（`inspectPinnedBoundaries`）。
// 契约：角色卡/项目管理/docs/design/2026-10-17_design_governance-pin-recovery-review.md §5.1 / §5.5。
// 覆盖：全一致、单文件 modified、missing、unreadable（目录/权限）、pin 形状非法、空 pin、
//       路径逃逸、requiredPath 未被覆盖 / 被覆盖（规范化比较）、digest 稳定性与变化、
//       只读（前后目录树/mtime 不变）、公共出口同一函数引用。
// 全部使用临时目录，不碰真实项目。
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

import { inspectPinnedBoundaries } from "../../src/service/boundary/resolve-boundary.ts";
import { inspectPinnedBoundaries as inspectPrivate } from "../../src/common/门禁引擎/pin-evidence.ts";
import type { PinEntry } from "../../src/model/boundary.ts";
import type { PinEvidenceFileStatus, PinEvidenceResult } from "../../src/service/boundary/resolve-boundary.ts";

const ROOT = mkdtempSync(join(tmpdir(), "pin-evidence-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

/** 每个用例一个独立子目录，互不干扰。 */
function caseDir(name: string): string {
  const dir = mkdtempSync(join(ROOT, `${name}-`));
  return dir;
}

function writeAt(root: string, rel: string, text: string): string {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, "utf8");
  return abs;
}

/** 某文件的 SHA-256（原始字节，与 io.ts::sha256File 同算法）。 */
function sha256OfFile(abs: string): string {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

/** 按 §5.1 第 6 条拼接规则求期望 digest。 */
function expectedDigest(lines: { path: string; pinned: string; status: string; actual: string | null }[]): string {
  const text = lines.map((l) => `${l.path}\t${l.pinned}\t${l.status}\t${l.actual ?? ""}\n`).join("");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** 目录树快照：相对路径 + 类型 + size + mtimeMs（含根自身），用于只读断言。 */
function snapshotTree(root: string): string {
  const lines: string[] = [];
  const rootStat = statSync(root);
  lines.push(`.\td\t${rootStat.size}\t${rootStat.mtimeMs}`);
  const walk = (dir: string, rel: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const abs = join(dir, e.name);
      const r = rel === "" ? e.name : `${rel}/${e.name}`;
      const st = statSync(abs);
      lines.push(`${r}\t${e.isDirectory() ? "d" : "f"}\t${st.size}\t${st.mtimeMs}`);
      if (e.isDirectory()) walk(abs, r);
    }
  };
  walk(root, "");
  return lines.join("\n");
}

// ---- 1) 全一致 ----
test("全一致：state=ok、files=[]、checked=pin 条数、digest 为 64 hex；哈希大小写不敏感", async () => {
  const root = caseDir("all-ok");
  const a = writeAt(root, "角色卡/R/boundary.yaml", "role: R\nentries: []\n");
  const b = writeAt(root, "docs/governance.yaml", "role: G\nentries: []\n");
  const pins: PinEntry[] = [
    { path: "角色卡/R/boundary.yaml", sha256: sha256OfFile(a) },
    // 大写十六进制：§5.1 形状允许大小写不敏感，比较按小写进行。
    { path: "docs/governance.yaml", sha256: sha256OfFile(b).toUpperCase() },
  ];

  const result: PinEvidenceResult = await inspectPinnedBoundaries({ projectRoot: root, pins });
  assert.equal(result.state, "ok");
  assert.deepEqual(result.files, []);
  assert.equal(result.checked, 2);
  assert.match(result.digest, /^[0-9a-f]{64}$/);
  assert.equal(result.reason, undefined);
});

// ---- 2) 单文件 modified ----
test("单文件 modified：files 恰 1 条、actual 为当前盘上哈希、pinned 不等于 actual；其余一致项不进入 files", async () => {
  const root = caseDir("modified");
  const good = writeAt(root, "角色卡/A/boundary.yaml", "a\n");
  const target = writeAt(root, "角色卡/B/boundary.yaml", "新内容\n");
  const pinnedB = sha256OfFile(target);
  writeFileSync(target, "被改过的内容\n", "utf8");
  const actualB = sha256OfFile(target);
  assert.notEqual(pinnedB, actualB, "夹具须体现修改后的哈希确实不同");

  const pins: PinEntry[] = [
    { path: "角色卡/A/boundary.yaml", sha256: sha256OfFile(good) },
    { path: "角色卡/B/boundary.yaml", sha256: pinnedB },
  ];
  const result = await inspectPinnedBoundaries({ projectRoot: root, pins });

  assert.equal(result.state, "mismatch");
  assert.equal(result.checked, 2, "checked 含一致项");
  assert.equal(result.files.length, 1, "只把非一致项放进 files");
  const [f] = result.files;
  assert.equal(f.path, "角色卡/B/boundary.yaml");
  assert.equal(f.status, "modified");
  assert.equal(f.pinned, pinnedB.toLowerCase());
  assert.equal(f.actual, actualB);
  assert.notEqual(f.pinned, f.actual);
  assert.ok(result.files.length <= result.checked);
});

// ---- 3) missing（ENOENT）----
test("missing：pin 目标不存在 → status=missing、actual=null；与 unreadable 分开", async () => {
  const root = caseDir("missing");
  const pins: PinEntry[] = [{ path: "角色卡/消失/boundary.yaml", sha256: "a".repeat(64) }];

  const result = await inspectPinnedBoundaries({ projectRoot: root, pins });
  assert.equal(result.state, "mismatch");
  assert.equal(result.checked, 1);
  assert.deepEqual(result.files, [
    { path: "角色卡/消失/boundary.yaml", pinned: "a".repeat(64), actual: null, status: "missing" },
  ]);
});

// ---- 4a) unreadable：目标是目录 ----
test("unreadable（目录）：pin 目标是目录 → status=unreadable、actual=null（非 missing）", async () => {
  const root = caseDir("unreadable-dir");
  mkdirSync(join(root, "docs"), { recursive: true });
  const pins: PinEntry[] = [{ path: "docs", sha256: "b".repeat(64) }];

  const result = await inspectPinnedBoundaries({ projectRoot: root, pins });
  assert.equal(result.state, "mismatch");
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].status, "unreadable");
  assert.equal(result.files[0].actual, null);
});

// ---- 4b) unreadable：权限（POSIX；Windows 的 chmod 不阻断读取，跳过）----
test(
  "unreadable（权限）：文件不可读 → status=unreadable、actual=null",
  {
    skip:
      process.platform === "win32" ||
      (typeof process.getuid === "function" && process.getuid() === 0),
  },
  async () => {
    const root = caseDir("unreadable-perm");
    const abs = writeAt(root, "角色卡/L/boundary.yaml", "x\n");
    chmodSync(abs, 0o000);
    try {
      const result = await inspectPinnedBoundaries({
        projectRoot: root,
        pins: [{ path: "角色卡/L/boundary.yaml", sha256: "c".repeat(64) }],
      });
      assert.equal(result.state, "mismatch");
      assert.equal(result.files.length, 1);
      assert.equal(result.files[0].status, "unreadable");
      assert.equal(result.files[0].actual, null);
    } finally {
      chmodSync(abs, 0o600);
    }
  },
);

// ---- 5) pin 形状非法 ----
test("pin 形状非法：非数组 / 非对象 / path 空 / sha256 非 64 位十六进制 → invalid，reason 指明第几项", async () => {
  const root = caseDir("shape");
  const abs = writeAt(root, "a.yaml", "x\n");
  const goodHash = sha256OfFile(abs);

  const notArray = await inspectPinnedBoundaries({ projectRoot: root, pins: "nope" as unknown as PinEntry[] });
  assert.equal(notArray.state, "invalid");
  assert.match(notArray.reason ?? "", /数组/);
  assert.equal(notArray.checked, 0);
  assert.deepEqual(notArray.files, []);
  assert.equal(notArray.digest, "");

  const notObject = await inspectPinnedBoundaries({
    projectRoot: root,
    pins: [null as unknown as PinEntry],
  });
  assert.equal(notObject.state, "invalid");
  assert.match(notObject.reason ?? "", /pin\[0\]/);

  const emptyPath = await inspectPinnedBoundaries({ projectRoot: root, pins: [{ path: "  ", sha256: goodHash }] });
  assert.equal(emptyPath.state, "invalid");
  assert.match(emptyPath.reason ?? "", /pin\[0\].*path/);

  const badHash = await inspectPinnedBoundaries({
    projectRoot: root,
    pins: [
      { path: "a.yaml", sha256: goodHash },
      { path: "a.yaml", sha256: "deadbeef" },
    ],
  });
  assert.equal(badHash.state, "invalid");
  assert.match(badHash.reason ?? "", /pin\[1\].*sha256/);
});

// ---- 6) 空 pin ----
test("空 pin：pins=[] → invalid（checked=0、files=[]、digest 为空串）", async () => {
  const root = caseDir("empty");
  const result = await inspectPinnedBoundaries({ projectRoot: root, pins: [] });
  assert.equal(result.state, "invalid");
  assert.match(result.reason ?? "", /空数组/);
  assert.equal(result.checked, 0);
  assert.deepEqual(result.files, []);
  assert.equal(result.digest, "");
});

// ---- 7) 路径逃逸 ----
test("路径逃逸：.. 逃出项目根 / 绝对路径 → invalid", async () => {
  const root = caseDir("escape");
  const outside = writeAt(ROOT, "outside.txt", "outside\n");
  const hash = sha256OfFile(outside);

  const dotdot = await inspectPinnedBoundaries({
    projectRoot: root,
    pins: [{ path: "../outside.txt", sha256: hash }],
  });
  assert.equal(dotdot.state, "invalid");
  assert.match(dotdot.reason ?? "", /pin\[0\].*逃逸/);
  assert.equal(dotdot.digest, "");

  const abs = await inspectPinnedBoundaries({
    projectRoot: root,
    pins: [{ path: outside, sha256: hash }],
  });
  assert.equal(abs.state, "invalid");
  assert.match(abs.reason ?? "", /pin\[0\].*绝对路径/);
  assert.equal(abs.digest, "");
});

// ---- 8) requiredPath 未被覆盖 / 被覆盖（规范化比较）----
test("requiredPath 未被任何 pin 覆盖 → invalid，reason 逐字点名；路径规范化后同一目标视为覆盖", async () => {
  const root = caseDir("required");
  const gov = writeAt(root, "docs/governance.yaml", "role: G\nentries: []\n");
  const other = writeAt(root, "角色卡/R/boundary.yaml", "role: R\nentries: []\n");
  const pins: PinEntry[] = [
    { path: "角色卡/R/boundary.yaml", sha256: sha256OfFile(other) },
    { path: "docs/governance.yaml", sha256: sha256OfFile(gov) },
  ];

  const missingCoverage = await inspectPinnedBoundaries({
    projectRoot: root,
    pins,
    requiredPath: "docs/不存在的治理边界.yaml",
  });
  assert.equal(missingCoverage.state, "invalid");
  assert.equal(missingCoverage.reason, "治理边界文件未被任何 pin 覆盖：docs/不存在的治理边界.yaml");
  assert.equal(missingCoverage.checked, 0);
  assert.equal(missingCoverage.digest, "");

  // pin 写 "./docs/governance.yaml"，requiredPath 写 "docs/governance.yaml"：规范化后同一路径。
  const covered = await inspectPinnedBoundaries({
    projectRoot: root,
    pins: [{ path: "./docs/governance.yaml", sha256: sha256OfFile(gov) }, ...pins.slice(0, 1)],
    requiredPath: "docs/governance.yaml",
  });
  assert.equal(covered.state, "ok");
  assert.equal(covered.checked, 2);
});

// ---- 9) digest 稳定性与变化（含 §5.1 第 6 条拼接规则核对）----
test("digest：重复调用稳定、公式可复算、任一目标内容变化即变化", async () => {
  const root = caseDir("digest");
  const a = writeAt(root, "a.yaml", "a\n");
  const b = writeAt(root, "b.yaml", "b\n");
  const hashA = sha256OfFile(a);
  const hashB = sha256OfFile(b);
  const pins: PinEntry[] = [
    { path: "a.yaml", sha256: hashA },
    { path: "b.yaml", sha256: hashB },
  ];

  const first = await inspectPinnedBoundaries({ projectRoot: root, pins });
  const second = await inspectPinnedBoundaries({ projectRoot: root, pins });
  assert.equal(first.state, "ok");
  assert.equal(first.digest, second.digest, "无变化时 digest 稳定（只读、不缓存也不影响结果）");
  assert.equal(
    first.digest,
    expectedDigest([
      { path: "a.yaml", pinned: hashA, status: "ok", actual: hashA },
      { path: "b.yaml", pinned: hashB, status: "ok", actual: hashB },
    ]),
    "digest 必须按 §5.1 第 6 条的拼接规则覆盖全部 pin（含一致项）",
  );

  writeFileSync(b, "b 已改\n", "utf8");
  const changed = await inspectPinnedBoundaries({ projectRoot: root, pins });
  assert.equal(changed.state, "mismatch");
  assert.notEqual(changed.digest, first.digest, "任一 pin 目标内容变化都必须改变 digest");

  // 恢复内容后 digest 回到原值：只由内容与 pin 决定，与 mtime 无关。
  writeFileSync(b, "b\n", "utf8");
  const restored = await inspectPinnedBoundaries({ projectRoot: root, pins });
  assert.equal(restored.state, "ok");
  assert.equal(restored.digest, first.digest);
});

// ---- 10) 只读：前后目录树 / mtime 不变 ----
test("只读：检查前后目录树、文件大小与 mtime 完全不变，未创建任何文件", async () => {
  const root = caseDir("readonly");
  const a = writeAt(root, "角色卡/R/boundary.yaml", "role: R\nentries: []\n");
  const b = writeAt(root, "docs/governance.yaml", "role: G\nentries: []\n");
  const pins: PinEntry[] = [
    { path: "角色卡/R/boundary.yaml", sha256: sha256OfFile(a) },
    { path: "docs/governance.yaml", sha256: "0".repeat(64) }, // 故意不一致，仍不得写盘
  ];

  const before = snapshotTree(root);
  const result = await inspectPinnedBoundaries({ projectRoot: root, pins, requiredPath: "docs/governance.yaml" });
  const after = snapshotTree(root);

  assert.equal(result.state, "mismatch");
  assert.equal(before, after, "只读检查不得改变目录树、文件大小或 mtime");
});

// ---- A3 契约：公共出口与私有实现是同一函数引用 ----
test("公共出口 `resolve-boundary.ts` 再导出与私有实现为同一函数引用", () => {
  assert.equal(inspectPinnedBoundaries, inspectPrivate);
  // 类型再导出可用（编译期断言）：下面这行在类型层校验 PinEvidenceFileStatus / PinEvidenceResult 的导出。
  const _status: PinEvidenceFileStatus = "modified";
  const _shape: Pick<PinEvidenceResult, "state" | "checked" | "files" | "digest"> = {
    state: "ok",
    checked: 0,
    files: [],
    digest: "",
  };
  assert.equal(_status, "modified");
  assert.equal(_shape.state, "ok");
});
