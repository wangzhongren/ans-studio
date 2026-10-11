// 门禁引擎测试：`.ans/project.json` 的 SHA-256 pin 与 acceptance 链（F6 由"配置自称"升级为"可验证证据"）
// 覆盖：pin 匹配 → accepted；不匹配 → 未接受 → resolveWrite 拒一切写；
//       无 pin / 无 .ans → 回退内置（未接受）仍拒写；pin 指向文件不存在/不可读 → fail-closed；
//       pin 未覆盖当前文件 / pin 形状非法 / 展示路径不因 pin 变成绕过口子 / 按原始字节求哈希。
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

import { resolveBoundary } from "../../src/service/boundary/resolve-boundary.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import { loadBoundaryFile } from "../../src/common/门禁引擎/boundary-core.ts";
import type { Acceptance } from "../../src/model/boundary.ts";
import type { ProjectConfig } from "../../src/model/role.ts";

const ROOT = mkdtempSync(join(tmpdir(), "pin-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

// 一份合法的 YAML 边界（内含条目 src/a.ts）
const BOUNDARY_YAML = "role: R\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: t\n";

/** 某文件的 SHA-256（按原始字节，与实现同算法）。 */
function sha256OfFile(abs: string): string {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}
/** 一段文本 UTF-8 编码后的 SHA-256。 */
function sha256OfText(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function writeAt(rel: string, text: string): string {
  const abs = join(ROOT, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, "utf8");
  return abs;
}

/** 构造一个"治理边界走项目覆盖（branch 1）"的项目：角色 R 的边界即 rel，acceptance 由参数给定。 */
function makeProject(rel: string, acceptance: Acceptance): ProjectConfig {
  return {
    projectRoot: ROOT,
    skillRoot: join(ROOT, "skill"),
    roles: { R: { card: "角色卡/R/role-card.md", boundary: rel } },
    governanceBoundary: { path: rel, acceptance },
  };
}

const ctx = { skillRoot: join(ROOT, "skill"), projectRoot: ROOT };
const scope = { writeSet: ["src/a.ts"], conditions: [] };

// ---- 1) pin 匹配 → accepted，边界内写入放行 ----
test("pin 匹配 → accepted=true，边界内写入放行", async () => {
  const rel = "角色卡/R1/boundary.yaml";
  const abs = writeAt(rel, BOUNDARY_YAML);
  const project = makeProject(rel, {
    accepted: true,
    source: "客户 pin 2026-10-11",
    pin: [{ path: rel, sha256: sha256OfFile(abs) }],
  });
  const b = await resolveBoundary("R", project);
  assert.equal(b.acceptance.accepted, true);
  assert.equal(b.parseError, undefined);
  assert.equal(b.entries.length, 1);
  assert.equal(resolveWrite("src/a.ts", b, scope, ctx).allowed, true);
});

// ---- 2) pin 不匹配 → 未接受 → resolveWrite 拒一切写 ----
test("pin 不匹配 → 未接受（source 清空）+ parseError → resolveWrite 拒一切写", async () => {
  const rel = "角色卡/R2/boundary.yaml";
  writeAt(rel, BOUNDARY_YAML);
  const project = makeProject(rel, {
    accepted: true,
    source: "客户 pin 2026-10-11",
    pin: [{ path: rel, sha256: sha256OfText("被篡改后的另一份内容") }],
  });
  const b = await resolveBoundary("R", project);
  assert.equal(b.acceptance.accepted, false, "不匹配必须视为未接受");
  assert.equal(b.acceptance.source, "", "未接受时不得留下貌似有证据的 source");
  assert.ok(typeof b.parseError === "string" && b.parseError.length > 0);
  assert.match(b.parseError, /SHA-256|pin/);
  // 本应允许的路径也必须被拒——"拒一切写"
  const d = resolveWrite("src/a.ts", b, scope, ctx);
  assert.equal(d.allowed, false);
});

// ---- 3) 无 pin：沿用旧的 source 自称来源（向后兼容，向后不放松也不改变）----
test("无 pin（acceptance 未给 pin）→ 沿用配置自称来源，行为不改变", async () => {
  const rel = "角色卡/R3/boundary.yaml";
  writeAt(rel, BOUNDARY_YAML);
  const project = makeProject(rel, { accepted: true, source: "配置自称来源" });
  const b = await resolveBoundary("R", project);
  assert.equal(b.acceptance.accepted, true, "缺省 pin 时保持既有（自称）路径");
  assert.equal(b.parseError, undefined);
});

// ---- 4) 无 .ans（无治理边界）→ 回退内置未接受 → 拒写 ----
test("无 .ans / 无治理边界 → 回退内置（未接受）→ 拒一切写", async () => {
  const project: ProjectConfig = { projectRoot: ROOT, skillRoot: join(ROOT, "skill"), roles: {} };
  const b = await resolveBoundary("任意角色", project);
  assert.equal(b.acceptance.accepted, false);
  assert.match(b.boundarySource, /built-in/);
  const d = resolveWrite(join(ROOT, "src/a.ts"), b, scope, ctx);
  assert.equal(d.allowed, false);
  assert.match((d as { reason: string }).reason, /未被接受|F6/);
});

// ---- 5) pin 指向的文件不存在/不可读 → fail-closed ----
test("pin 指向的文件不存在 → fail-closed（未接受），即便另有 pin 命中当前文件", async () => {
  const rel = "角色卡/R5/boundary.yaml";
  const abs = writeAt(rel, BOUNDARY_YAML);
  const project = makeProject(rel, {
    accepted: true,
    source: "客户 pin",
    pin: [
      { path: rel, sha256: sha256OfFile(abs) }, // 命中，且哈希正确
      { path: "角色卡/R5/并不存在.yaml", sha256: "deadbeef" }, // 不存在 → 应导致整体未接受
    ],
  });
  const b = await resolveBoundary("R", project);
  assert.equal(b.acceptance.accepted, false);
  assert.ok(typeof b.parseError === "string");
  assert.match(b.parseError, /不可读|不存在/);
});

// ---- 6) pin 未覆盖当前加载的边界文件 → 未接受（不得拿无关 pin 认可）----
test("pin 未覆盖当前边界文件 → 未接受", async () => {
  const rel = "角色卡/R6/boundary.yaml";
  writeAt(rel, BOUNDARY_YAML);
  const other = "角色卡/R6/other.yaml";
  const otherAbs = writeAt(other, "entries: []\n");
  const project = makeProject(rel, {
    accepted: true,
    source: "客户 pin",
    pin: [{ path: other, sha256: sha256OfFile(otherAbs) }], // 只覆盖 other，不覆盖当前文件
  });
  const b = await resolveBoundary("R", project);
  assert.equal(b.acceptance.accepted, false);
  assert.ok(typeof b.parseError === "string");
  assert.match(b.parseError, /未被任何 pin 覆盖/);
});

// ---- 7) pin 形状非法 → 未接受 ----
test("pin 形状非法（空数组 / 缺 sha256 / 非数组）→ 未接受", async () => {
  const emptyRel = "角色卡/R7/boundary.yaml";
  writeAt(emptyRel, BOUNDARY_YAML);
  const b1 = await resolveBoundary("R", makeProject(emptyRel, { accepted: true, source: "x", pin: [] }));
  assert.equal(b1.acceptance.accepted, false);
  assert.ok(typeof b1.parseError === "string");
  assert.match(b1.parseError, /pin/);

  const noHashRel = "角色卡/R7b/boundary.yaml";
  writeAt(noHashRel, BOUNDARY_YAML);
  const b2 = await resolveBoundary(
    "R",
    makeProject(noHashRel, { accepted: true, source: "x", pin: [{ path: noHashRel } as never] }),
  );
  assert.equal(b2.acceptance.accepted, false);

  const notArrayRel = "角色卡/R7c/boundary.yaml";
  writeAt(notArrayRel, BOUNDARY_YAML);
  const b3 = await resolveBoundary(
    "R",
    makeProject(notArrayRel, { accepted: true, source: "x", pin: "nope" as never }),
  );
  assert.equal(b3.acceptance.accepted, false);
});

// ---- 8) 展示路径：accepted=false + 无 pin → 返回条目但未接受（不因缺 pin 崩、不误接受）----
test("展示路径（listProject 式）：accepted=false + 无 pin → 返回条目且未接受", async () => {
  const rel = "角色卡/R8/boundary.yaml";
  const abs = writeAt(rel, BOUNDARY_YAML);
  const b = await loadBoundaryFile(rel, abs, ROOT, join(ROOT, "skill"), { accepted: false, source: "" });
  assert.equal(b.acceptance.accepted, false);
  assert.equal(b.parseError, undefined, "未接受但解析正常，不应有 parseError");
  assert.equal(b.entries.length, 1, "展示仍能拿到条目");
});

// ---- 9) 按原始字节求哈希（含 BOM），与剥 BOM 的文本哈希不同 → 不匹配即未接受 ----
test("pin 按原始字节计算（含 BOM）：剥 BOM 的文本哈希不匹配 → 未接受；原始字节哈希 → 通过", async () => {
  const rel = "角色卡/R9/boundary.yaml";
  const abs = join(ROOT, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, "﻿" + BOUNDARY_YAML, "utf8"); // 带 UTF-8 BOM
  const rawHash = sha256OfFile(abs); // 原始字节（含 BOM）
  const strippedHash = sha256OfText(BOUNDARY_YAML); // 剥 BOM 后的文本
  assert.notEqual(rawHash, strippedHash, "本用例须体现两种哈希确实不同");

  const mismatched = await resolveBoundary(
    "R",
    makeProject(rel, { accepted: true, source: "x", pin: [{ path: rel, sha256: strippedHash }] }),
  );
  assert.equal(mismatched.acceptance.accepted, false, "哈希对不上必须未接受");

  const matched = await resolveBoundary(
    "R",
    makeProject(rel, { accepted: true, source: "x", pin: [{ path: rel, sha256: rawHash }] }),
  );
  assert.equal(matched.acceptance.accepted, true, "原始字节哈希对上则接受");
});
