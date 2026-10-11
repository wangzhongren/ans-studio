// test/项目管理/shared/config-loader.test.ts
// 项目管理：共享组件 `src/common/shared/config-loader.ts` 的等价行为验证。
//
// 本模块由 T11 从装配私有 `src/common/装配/config-loader.ts` **整体搬迁**而来（非 fork）。
// 本测试覆盖搬迁后的**等价行为**（与装配 `test/装配/config-loader.test.ts` 同形），重点钉两条
// fail-closed 分支：
//   1) `.ans` 存在且 accepted:true → 必须 pin-backed；无 pin → 载入层置未接受并清空 source；
//   2) `.ans` 存在但不可解析 → fail-closed 未接受，**绝不**回退到（可能是演示 accepted:true 的）
//      fallback acceptance。
// 另覆盖：合法 `.ans`（带 pin）→ 注入正确；pin 与 hash 不符 → 引擎层判未接受；无 `.ans` → 回退、不崩。

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
  ANS_DIR_NAME,
  ANS_PROJECT_FILE_NAME,
} from "../../../src/common/shared/config-loader.ts";
import { resolveBoundarySection } from "../../../src/common/门禁引擎/boundary-core.ts";
import type { Acceptance } from "../../../src/model/boundary.ts";
import type { ProjectConfig } from "../../../src/model/role.ts";

const ROOT = mkdtempSync(join(tmpdir(), "ans-shared-config-"));
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

// ---- 0) 路径拼接与常量 ----
test("ansProjectPath：项目根下 .ans/project.json；常量导出不变", () => {
  assert.equal(ANS_DIR_NAME, ".ans");
  assert.equal(ANS_PROJECT_FILE_NAME, "project.json");
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

// ---- 2) `.ans` 声明 accepted:true 无 pin → 置为未接受、清空 source（fail-closed） ----
test(".ans 声明 accepted:true 无 pin → 未接受且 source 清空（fail-closed，§3.3）", async () => {
  const root = projectWithAns({ accepted: true, source: "自填：客户已接受" }); // 无 pin
  const { project, source } = await load(root);

  assert.equal(project.governanceBoundary?.acceptance.accepted, false, "无 pin 必须置为未接受");
  assert.equal(project.governanceBoundary?.acceptance.source, "", "降级时清空 source");
  assert.equal(source.acceptance.accepted, false);
  assert.equal(source.acceptance.source, "", "source.acceptance 同样清空");
  assert.ok(source.downgradeReason && source.downgradeReason.length > 0, "应记录降级原因");
  assert.match(source.downgradeReason, /无 pin|accepted/);
});

test("终态规则纯函数：accepted:true 无 pin → 降级并清空 source；有 pin / accepted:false → 不变", () => {
  const downgraded = enforcePinBackedAcceptance({ accepted: true, source: "自称" }, "orig");
  assert.equal(downgraded.downgraded, true);
  assert.equal(downgraded.acceptance.accepted, false);
  assert.equal(downgraded.acceptance.source, "", "降级须清空 source（不留貌似有证据的说明）");

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

test("终态规则：pin 为空数组（声明了但无条目）同样降级（无有效证据）", () => {
  const empty = enforcePinBackedAcceptance({ accepted: true, source: "x", pin: [] }, "orig");
  assert.equal(empty.downgraded, true);
  assert.equal(empty.acceptance.accepted, false);
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

test("无 .ans 且回退配置自称 accepted:true（演示路径）→ 原样带出、不崩", async () => {
  const root = newRoot();
  const demoAcceptance: Acceptance = { accepted: true, source: "demo:embedded-config" };
  const fallback: ProjectConfig = {
    projectRoot: root,
    skillRoot: join(root, "skill"),
    roles: {},
    governanceBoundary: { path: "", acceptance: demoAcceptance },
  };
  const { project, source } = await loadEffectiveConfig({
    projectRoot: root,
    skillRoot: join(root, "skill"),
    fallback,
  });
  assert.equal(source.kind, "builtin-fallback");
  assert.equal(project, fallback);
  // 无 `.ans` 时**不经过**终态规则——回退路径的 acceptance 原样带出（登记的非-pin 例外）。
  assert.equal(source.acceptance.accepted, true);
  assert.equal(source.acceptance.source, "demo:embedded-config");
});

// ---- 4b) `.ans` 存在但不可解析 → fail-closed（不回退到演示 acceptance） ----
test(".ans 存在但 JSON 不可解析 → fail-closed 未接受，不回退演示 acceptance", async () => {
  const root = newRoot();
  writeAt(root, ".ans/project.json", "{ 这不是合法 JSON");
  const { project, source } = await load(root);
  assert.equal(source.kind, "ans-invalid");
  assert.equal(project.governanceBoundary?.acceptance.accepted, false);
  assert.equal(project.roles.R, undefined, "解析失败时不得带出任何角色（不凭空造）");
  assert.equal(project.roles && Object.keys(project.roles).length, 0);
  assert.ok(source.downgradeReason && source.downgradeReason.length > 0);
  assert.match(source.downgradeReason, /fail-closed|不回退/);
});

test(".ans 存在但顶层非对象（如数组）→ fail-closed 未接受，不回退", async () => {
  const root = newRoot();
  writeAt(root, ".ans/project.json", "[1,2,3]");
  const { project, source } = await load(root);
  assert.equal(source.kind, "ans-invalid");
  assert.equal(project.governanceBoundary?.acceptance.accepted, false);
  assert.equal(Object.keys(project.roles).length, 0);
  assert.match(source.downgradeReason ?? "", /顶层不是对象|fail-closed/);
});

// ---- 5) ansDirName 覆盖（仅供测试注入） ----
test("ansDirName 覆盖：从自定义目录载入（不影响默认 .ans）", async () => {
  const root = newRoot();
  writeAt(root, BOUNDARY_REL, BOUNDARY_YAML);
  const sha = sha256OfFile(join(root, BOUNDARY_REL));
  const doc = {
    roles: { R: { card: "角色卡/R/role-card.md", boundary: BOUNDARY_REL } },
    governanceBoundary: {
      path: BOUNDARY_REL,
      acceptance: { accepted: true, source: "客户 pin", pin: [{ path: BOUNDARY_REL, sha256: sha }] },
    },
  };
  writeAt(root, ".custom-ans/project.json", JSON.stringify(doc));

  const { source } = await loadEffectiveConfig({
    projectRoot: root,
    skillRoot: join(root, "skill"),
    fallback: fallbackUnaccepted(root),
    ansDirName: ".custom-ans",
  });
  assert.equal(source.kind, "ans");
  assert.equal(source.acceptance.accepted, true);
});
