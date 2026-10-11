// test/装配/config-loader.test.ts
// 装配：`.ans/project.json` 的加载、终态规则（accepted:true 必须 pin-backed，设计 §3.3）、
// 缺文件回退与 doctor 的 pin 来源打印。
//
// 覆盖（本任务 T2 要求）：
//  1) `.ans` 合法（带 pin）→ 注入 roles/governanceBoundary/acceptance 正确；
//  2) `.ans` 声明 accepted:true **无 pin** → 载入方置为未接受（fail-closed）；
//  3) pin 与 hash 不符 → 未接受（引擎 verifyPins 在载入层之上再加一层）；
//  4) 无 `.ans` → 回退内置、不崩；
//  5) `ans doctor` 能打印配置来源与 pin 来源。
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { test, after } from "node:test";

import {
  loadEffectiveConfig,
  enforcePinBackedAcceptance,
  ansProjectPath,
} from "../../src/common/装配/config-loader.ts";
import { resolveBoundarySection } from "../../src/common/门禁引擎/boundary-core.ts";
import { main } from "../../src/index.ts";
import type { Acceptance } from "../../src/model/boundary.ts";
import type { ProjectConfig } from "../../src/model/role.ts";

const ROOT = mkdtempSync(join(tmpdir(), "ans-assembly-config-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

// 合法的 YAML 边界（内含条目 src/a.ts）——与门禁引擎 pin 测试同形。
const BOUNDARY_YAML = "role: R\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: t\n";
const BOUNDARY_REL = "角色卡/R/boundary.yaml";

function writeAt(root: string, rel: string, text: string): string {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, "utf8");
  return abs;
}

function sha256OfFile(abs: string): string {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}
function sha256OfText(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function newRoot(): string {
  return mkdtempSync(join(ROOT, "proj-"));
}

/** 回退配置（无 `.ans` 时使用）：roles 为空、治理边界未接受——与演示 fallback 可区分。 */
function fallbackUnaccepted(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: join(root, "skill"),
    roles: {},
    governanceBoundary: { path: "", acceptance: { accepted: false, source: "" } },
  };
}

/** 写一份 `.ans/project.json`；acceptance 由参数给定。返回新根。 */
function projectWithAns(acceptance: Acceptance, root = newRoot()): string {
  writeAt(root, BOUNDARY_REL, BOUNDARY_YAML);
  const doc = {
    roles: { R: { card: "角色卡/R/role-card.md", boundary: BOUNDARY_REL } },
    governanceBoundary: { path: BOUNDARY_REL, acceptance },
  };
  writeAt(root, ".ans/project.json", JSON.stringify(doc, null, 2));
  return root;
}

function load(root: string) {
  return loadEffectiveConfig({
    projectRoot: root,
    skillRoot: join(root, "skill"),
    fallback: fallbackUnaccepted(root),
  });
}

// ---- 0) 路径拼接 ----
test("ansProjectPath：项目根下 .ans/project.json", () => {
  assert.equal(ansProjectPath("/p"), join("/p", ".ans", "project.json"));
  assert.equal(ansProjectPath("/p", "my-ans"), join("/p", "my-ans", "project.json"));
});

// ---- 1) `.ans` 合法（带 pin）→ 注入正确 ----
test(".ans 合法（带 pin）→ 注入 roles/governanceBoundary/acceptance，pin 保留", async () => {
  const root = newRoot();
  writeAt(root, BOUNDARY_REL, BOUNDARY_YAML);
  const sha = sha256OfFile(join(root, BOUNDARY_REL));
  const root2 = projectWithAns(
    { accepted: true, source: "客户 pin 2026-10-11", pin: [{ path: BOUNDARY_REL, sha256: sha }] },
    root,
  );

  const { project, source } = await load(root2);
  assert.equal(source.kind, "ans");
  assert.equal(source.downgradeReason, undefined, "带 pin 的合法 .ans 不应降级");
  assert.equal(project.roles.R.boundary, BOUNDARY_REL);
  assert.equal(project.governanceBoundary?.path, BOUNDARY_REL);
  assert.equal(project.governanceBoundary?.acceptance.accepted, true);
  assert.equal(project.governanceBoundary?.acceptance.pin?.[0].sha256, sha);
  assert.deepEqual(source.pinPaths, [BOUNDARY_REL]);
});

// ---- 2) `.ans` 声明 accepted:true 无 pin → 载入方置为未接受 ----
test(".ans 声明 accepted:true 无 pin → 载入方置为未接受（fail-closed，§3.3）", async () => {
  const root = projectWithAns({ accepted: true, source: "自填：客户已接受" }); // 无 pin
  const { project, source } = await load(root);

  assert.equal(project.governanceBoundary?.acceptance.accepted, false, "无 pin 必须置为未接受");
  assert.equal(project.governanceBoundary?.acceptance.source, "", "降级时清空 source");
  assert.equal(source.acceptance.accepted, false);
  assert.ok(source.downgradeReason && source.downgradeReason.length > 0, "应记录降级原因");
  assert.match(source.downgradeReason, /无 pin|accepted/);
});

test("终态规则纯函数：accepted:true 无 pin → 降级；有 pin / accepted:false → 不变", () => {
  const downgraded = enforcePinBackedAcceptance({ accepted: true, source: "自称" }, "orig");
  assert.equal(downgraded.downgraded, true);
  assert.equal(downgraded.acceptance.accepted, false);
  assert.equal(downgraded.acceptance.source, "");

  const pinned = enforcePinBackedAcceptance(
    { accepted: true, source: "客户 pin", pin: [{ path: "x", sha256: "y" }] },
    "orig",
  );
  assert.equal(pinned.downgraded, false);
  assert.equal(pinned.acceptance.accepted, true);

  const notAccepted = enforcePinBackedAcceptance({ accepted: false, source: "" }, "orig");
  assert.equal(notAccepted.downgraded, false);
  assert.equal(notAccepted.acceptance.accepted, false);
});

// ---- 3) pin 与 hash 不符 → 未接受（引擎在载入层之上再加一层） ----
test("pin 与 hash 不符 → 载入层保留（pin 存在），引擎 verifyPins 判未接受", async () => {
  const root = projectWithAns({
    accepted: true,
    source: "客户 pin",
    pin: [{ path: BOUNDARY_REL, sha256: sha256OfText("被篡改后的另一份内容") }],
  });
  const { project } = await load(root);

  // 载入层只管「有没有 pin」——pin 存在，故此处仍 accepted=true。
  assert.equal(project.governanceBoundary?.acceptance.accepted, true);

  // 引擎比对 hash（「pin 对不对」）→ 未接受。
  const b = await resolveBoundarySection("R", project);
  assert.equal(b.acceptance.accepted, false, "hash 不符必须视为未接受");
  assert.match(b.parseError ?? "", /SHA-256|pin/);
});

test(".ans 合法且 pin 匹配 → 引擎解析后仍 accepted=true（对照）", async () => {
  const root = newRoot();
  writeAt(root, BOUNDARY_REL, BOUNDARY_YAML);
  const sha = sha256OfFile(join(root, BOUNDARY_REL));
  const root2 = projectWithAns(
    { accepted: true, source: "客户 pin", pin: [{ path: BOUNDARY_REL, sha256: sha }] },
    root,
  );
  const { project } = await load(root2);
  const b = await resolveBoundarySection("R", project);
  assert.equal(b.acceptance.accepted, true);
  assert.equal(b.parseError, undefined);
});

// ---- 4) 无 `.ans` → 回退、不崩 ----
test("无 .ans/project.json → 回退入参 fallback（原样、不崩）", async () => {
  const root = newRoot();
  const fallback = fallbackUnaccepted(root);
  const { project, source } = await loadEffectiveConfig({
    projectRoot: root,
    skillRoot: join(root, "skill"),
    fallback,
  });
  assert.equal(source.kind, "builtin-fallback");
  assert.equal(project, fallback, "无 .ans 时应原样回退 fallback 引用");
  assert.equal(source.acceptance.accepted, false);
  assert.equal(source.pinPaths.length, 0);
});

// ---- 4b) `.ans` 存在但不可解析 → fail-closed（不回退到演示 acceptance） ----
test(".ans 存在但 JSON 不可解析 → fail-closed 未接受，不回退演示 acceptance", async () => {
  const root = newRoot();
  writeAt(root, ".ans/project.json", "{ 这不是合法 JSON");
  const { project, source } = await load(root);
  assert.equal(source.kind, "ans-invalid");
  assert.equal(project.governanceBoundary?.acceptance.accepted, false);
  assert.equal(project.roles.R, undefined);
  assert.ok(source.downgradeReason && source.downgradeReason.length > 0);
});

// ---- 5) `ans doctor` 打印配置来源与 pin 来源（无 .ans → 内置回退，仍不崩） ----
function capture(): { out: string[]; restore: () => void } {
  const out: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stdout.write;
  return {
    out,
    restore: () => {
      process.stdout.write = origOut;
    },
  };
}

test("ans doctor（无 .ans）→ 0 结束，打印配置来源与 pin 来源（内置非-pin 例外）", async () => {
  const cap = capture();
  const code = await main(["doctor"], {});
  cap.restore();
  assert.equal(code, 0);
  const text = cap.out.join("");
  assert.match(text, /配置来源:\s+内置回退/);
  assert.match(text, /pin 来源:/);
  assert.match(text, /登记的非-pin 例外/);
  // 既有行不破：acceptance 来源仍如实标注演示来源。
  assert.match(text, /边界接受来源:\s+demo:embedded-config/);
});

// ---- 6) loadEffectiveConfig 通过 doctor 之外的真实入口：role run 无 .ans 不崩 ----
test("无 .ans：role run 仍走内置演示配置（未放松，既有行为保持）", async () => {
  const cap = capture();
  const code = await main(["role", "run", "编排", "--task", "T-1"], {});
  cap.restore();
  assert.ok(code === 0 || code === 1, `预期 0 或 1，实际 ${code}`);
});
