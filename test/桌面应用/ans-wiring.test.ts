// test/桌面应用/ans-wiring.test.ts
// 桌面窗口（T13）：`.ans` 优先加载的接线验证——用**真实**共享载入器（只读导入
// `src/common/shared/config-loader.ts`）+ 真实门禁引擎 + 真实编排 + 真实多轮演示适配器。
//
// 三条路径（设计 §3.3 终态规则 / §3.10）：
//  ① 项目带可用的 `.ans/project.json`（带 pin）→ 用其 **pin-backed** acceptance（pin 生效、受 pin 约束）；
//  ② `.ans` 存在但**不可用**（不可解析）→ fail-closed **未接受**、**不回退**运行期同意；
//  ③ 无 `.ans` → 回退运行期同意（登记的非-pin 例外，行为不变）。
//  另有：`.ans` 的 pin 与文件 hash **不符** → 门禁引擎判未接受（fail-closed，会话被拒）。
//
// 用例用系统临时目录造 `.ans`，跑完清理，**不在仓库里留文件**。

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { after } from "node:test";

import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import { openRoleSession, createPiAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import { listProject, type ProjectListing } from "../../src/service/role/resolve-role.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { createChatDemoAdapter } from "../../app/desktop/chat-adapter.ts";
import { SessionManager } from "../../app/desktop/session.ts";

const ROOT = mkdtempSync(join(tmpdir(), "ans-desktop-ans-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

// 合法的 YAML 边界（内含项目根 file 条目 src/r.ts）——与门禁引擎/共享载入器测试同形。
const BOUNDARY_YAML = "role: R\nentries:\n  - kind: file\n    path: src/r.ts\n    purpose: t\n";
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

/** 建一个临时项目：角色 R（role-card.md + boundary.yaml）。返回根。 */
function newProject(): string {
  const root = mkdtempSync(join(ROOT, "proj-"));
  writeAt(root, "角色卡/R/role-card.md", "# 角色：R\n\n桌面接线测试角色。\n");
  writeAt(root, BOUNDARY_REL, BOUNDARY_YAML);
  return root;
}

/** 写一份 `.ans/project.json`（governanceBoundary + acceptance 由参数给定）。 */
function writeAns(root: string, acceptance: Record<string, unknown>): void {
  const doc = {
    roles: { R: { card: "角色卡/R/role-card.md", boundary: BOUNDARY_REL } },
    governanceBoundary: { path: BOUNDARY_REL, acceptance },
  };
  writeAt(root, ".ans/project.json", JSON.stringify(doc, null, 2));
}

/** 用真实下游（编排/演示适配器/枚举）构造会话管理器——**不注入** loadEffectiveConfig（用共享载入器）。 */
function makeManager(listing: ProjectListing, events: OrchestrationEvent[]): SessionManager {
  return new SessionManager({
    openRoleSession,
    createPiAdapterFactory,
    createDemoAdapter: createChatDemoAdapter,
    buildProjectConfig,
    getListing: (root) => (root === listing.projectRoot ? listing : undefined),
    emitEvent: (env) => events.push(env.event),
  });
}

// ————————————————— ① 有带 pin 的 `.ans` → 用其 pin-backed acceptance —————————————————

test("有带 pin 的 .ans → pin 生效：会话用其 pin-backed acceptance，边界内写入被接受", async () => {
  const root = newProject();
  const sha = sha256OfFile(join(root, BOUNDARY_REL));
  writeAns(root, { accepted: true, source: "客户 pin 2026-10-11", pin: [{ path: BOUNDARY_REL, sha256: sha }] });

  const listing = await listProject(root);
  const events: OrchestrationEvent[] = [];
  const mgr = makeManager(listing, events);

  const res = await mgr.open({ projectRoot: root, roleId: "R", runtime: "demo" });
  assert.equal(res.ok, true, "带 pin 的 .ans 应能开启会话");
  assert.ok(res.config, "应带回生效配置来源");
  assert.equal(res.config!.kind, "ans", "来源应为 .ans");
  assert.equal(res.config!.accepted, true, "pin-backed acceptance 应已接受");
  assert.equal(res.config!.pinCount, 1, "应如实反映 1 条 pin");
  assert.equal(res.config!.pinCount > 0, true, "pin 生效（accepted 必须可追到 pin）");

  await mgr.send("改 src/r.ts（边界内）");
  await tick();
  const kinds = events.map((e) => e.kind);
  assert.ok(kinds.includes("accepted"), "pin 匹配时边界内写入应被接受（pin 生效）");
  assert.ok(kinds.includes("denied"), "越界写入应被拒（门禁仍在把关）");
  await mgr.stop();
});

// ————————————————— ② `.ans` 的 pin 与文件 hash 不符 → 未接受（fail-closed，会话被拒） —————————————————

test(".ans 的 pin 与文件 hash 不符 → 门禁判未接受（fail-closed，会话被拒）", async () => {
  const root = newProject();
  writeAns(root, {
    accepted: true,
    source: "客户 pin",
    pin: [{ path: BOUNDARY_REL, sha256: sha256OfText("被篡改后的另一份内容") }],
  });

  const listing = await listProject(root);
  const mgr = makeManager(listing, []);

  const res = await mgr.open({ projectRoot: root, roleId: "R", runtime: "demo" });
  assert.equal(res.ok, false, "pin 与 hash 不符必须 fail-closed（会话被拒）");
  assert.match(res.error || "", /SHA-256|pin/, "错误应如实点明 pin/hash 校验失败");
});

// ————————————————— ③ `.ans` 存在但不可解析 → 未接受、不回退运行期同意 —————————————————

test(".ans 存在但不可解析 → 未接受、不回退运行期同意（界面据 config 如实呈现）", async () => {
  const root = newProject();
  writeAt(root, ".ans/project.json", "{ 这不是合法 JSON");

  const listing = await listProject(root);
  const events: OrchestrationEvent[] = [];
  const mgr = makeManager(listing, events);

  const res = await mgr.open({ projectRoot: root, roleId: "R", runtime: "demo" });
  assert.equal(res.ok, true, "枚举到角色即可开会话（写由门禁 fail-closed 拦）");
  assert.ok(res.config, "应带回生效配置来源");
  assert.equal(res.config!.kind, "ans-invalid", "来源应为 .ans 不可用");
  assert.equal(res.config!.accepted, false, "不可用 .ans 必须 fail-closed 未接受");
  assert.equal(res.config!.acceptanceSource, "", "未接受时 acceptance.source 为空（非运行期同意）");
  assert.ok(res.config!.reason && /fail-closed|不回退/.test(res.config!.reason), "应记录 fail-closed 降级原因");

  // 绝不回退运行期同意：门禁引擎拒绝一切写入（含本应「边界内」的 src/r.ts）。
  await mgr.send("试着改 src/r.ts");
  await tick();
  const kinds = events.map((e) => e.kind);
  assert.equal(kinds.includes("accepted"), false, "未接受时不得有任何写入被接受（不回退运行期同意）");
  assert.ok(kinds.includes("denied"), "一切写入应被拒");
  await mgr.stop();
});

// ————————————————— ④ 无 `.ans` → 回退运行期同意（行为不变） —————————————————

test("无 .ans → 回退运行期同意（登记的非-pin 例外，行为不变）", async () => {
  const root = newProject(); // 不写 .ans

  const listing = await listProject(root);
  const events: OrchestrationEvent[] = [];
  const mgr = makeManager(listing, events);

  const res = await mgr.open({ projectRoot: root, roleId: "R", runtime: "demo" });
  assert.equal(res.ok, true);
  assert.ok(res.config, "应带回生效配置来源");
  assert.equal(res.config!.kind, "builtin-fallback", "无 .ans 应走回退");
  assert.equal(res.config!.accepted, true, "回退运行期同意：accepted=true");
  assert.equal(res.config!.pinCount, 0, "运行期同意不得带 pin（登记的非-pin 例外）");
  assert.ok((res.config!.acceptanceSource || "").includes("desktop-app"), "来源应如实标注 desktop-app");

  await mgr.send("改 src/r.ts");
  await tick();
  assert.ok(events.map((e) => e.kind).includes("accepted"), "回退路径下边界内写入仍被接受（行为不变）");
  await mgr.stop();
});
