// test/桌面应用/acceptance-evidence.test.ts
// 2026-10-30（3.4/P4.1/P4.5）：验收事实 priority 由 criteria 派生；P0 缺 sidecar/mismatch 不通过；
// sidecar/角色 p0 自报不改变档位；P1 未校验明确标记。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { checkEvidence, deriveAcceptanceFact, loadCriteria, parseCriteriaText, readArtifact } from "../../src/common/编排/evidence-check.ts";
import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { parseProjectRoster } from "../../src/common/编排/workflow-preconditions.ts";
import { ensureDraftRun } from "../../src/common/编排/run-manifest.ts";
import { recordVersionedDocBaselines } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { EvidenceCheckFn, EvidenceCheckInput, WriteGate } from "../../src/model/runtime.ts";

const CRITERIA = [
  "```ans-criteria",
  "schema: ans-criteria/v1",
  "flowId: focus",
  "version: 1",
  "status: final",
  "criteria:",
  "  - id: AC-28",
  "    priority: P0",
  "  - id: P4.3",
  "    priority: P1",
  "```",
].join("\n");

test("P4.1/P4.5：AcceptanceFact.priority 来自 criteria；sidecar p0:false 不降级；P0 缺 sidecar 不通过", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-acceptance-evidence-"));
  try {
    const parsed = parseCriteriaText(CRITERIA, { flowId: "focus" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const fact = deriveAcceptanceFact(parsed.doc, { acId: "AC-28", artifact: "tests/evidence/a.txt" });
    assert.equal("ok" in fact, false);
    if ("ok" in fact) return;
    assert.equal(fact.priority, "P0");
    assert.equal(fact.unverified, true);
    const artifact = "tests/evidence/a.txt";
    await fs.mkdir(path.dirname(path.join(root, artifact)), { recursive: true });
    await fs.writeFile(path.join(root, artifact), "共 3 行\npass: 1\nfail: 0\n", "utf8");
    const p0NoMeta = await checkEvidence({ projectRoot: root, acId: "AC-28", criteria: parsed.doc, artifact });
    assert.equal(p0NoMeta.ok, false);
    assert.equal(p0NoMeta.rejection?.code, "evidence-mismatch");
    const actual = await readArtifact(root, artifact);
    await fs.writeFile(path.join(root, `${artifact}.meta.json`), JSON.stringify({
      schema: "evidence-meta/v1", artifact, sha256: actual.sha256, bytes: actual.bytes, lines: actual.lines,
      generatedAt: new Date(Date.now() + 2000).toISOString(), metrics: { pass: 1, fail: 0 }, acIds: ["AC-28"], p0: false,
    }), "utf8");
    const p0 = await checkEvidence({ projectRoot: root, acId: "AC-28", criteria: parsed.doc, artifact });
    assert.equal(p0.ok, true, p0.rejection?.missing.join("；") ?? "");
    assert.equal(p0.priority, "P0");
    assert.equal(p0.p0Ignored, true);
    const p1Artifact = "tests/evidence/b.txt";
    await fs.writeFile(path.join(root, p1Artifact), "共 1 行\n", "utf8");
    const p1 = await checkEvidence({ projectRoot: root, acId: "P4.3", criteria: parsed.doc, artifact: p1Artifact });
    assert.equal(p1.ok, true);
    assert.equal(p1.priority, "P1");
    assert.equal(p1.unverified, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("P4.4：criteriaRef 显式 path+sha+version；无 ref 不取 latest", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-acceptance-criteria-"));
  try {
    const rel = "docs/acceptance/focus-criteria-v1.md";
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), CRITERIA, "utf8");
    const sha = createHash("sha256").update(await fs.readFile(path.join(root, rel))).digest("hex");
    const unresolved = await loadCriteria(root, "focus", undefined);
    assert.equal(unresolved.ok, false);
    if (!unresolved.ok) assert.equal(unresolved.code, "criteria-version-unresolved");
    const loaded = await loadCriteria(root, "focus", { path: rel, sha256: sha, version: 1 });
    assert.equal(loaded.ok, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const SESSION_ROSTER_TEXT = [
  "---",
  "schema: project-roster/v3",
  "flowId: focus",
  "version: 1",
  "envBootstrapOmittedReason: 最小夹具省略装配/入口角色",
  "intent: docs/product/focus-intent-v1.md",
  "proposal: docs/proposals/focus-proposal-v1.md",
  "architecture: docs/contracts/focus-architecture-v1.md",
  "roles:",
  "  - id: implementer",
  "    displayName: 实现者",
  "    purpose: 实现",
  "    capability: TS",
  "    modules: [impl-core]",
  "  - id: qa",
  "    displayName: 测试",
  "    purpose: 核对",
  "    capability: 测试",
  "    modules: [qa-suite]",
  "modules:",
  "  - id: impl-core",
  "    name: 实现",
  "    purpose: 实现",
  "    path: src/",
  "    category: core",
  "    publicContract: src/index.ts",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "  - id: qa-suite",
  "    name: 测试",
  "    purpose: 测试",
  "    path: tests/",
  "    category: core",
  "    publicContract: tests/",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "---",
  "# 名单",
  "## 人员+模块拓扑图",
  "```topology",
  "schema: project-topology/v2",
  "modules:",
  "  - id: impl-core",
  "    path: src/",
  "    roleId: implementer",
  "  - id: qa-suite",
  "    path: tests/",
  "    roleId: qa",
  "roles:",
  "  - id: implementer",
  "    modules: [impl-core]",
  "  - id: qa",
  "    modules: [qa-suite]",
  "management: [convener, implementer, qa]",
  "```",
].join("\n");

function sessionListing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: NonNullable<ProjectListing["roles"][number]["governanceFunction"]>): ProjectListing["roles"][number] => ({
    roleId, cardPath: "", boundaryPath: "", cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true, governanceFunction: fn,
  });
  const worker = (roleId: string, dir: string): ProjectListing["roles"][number] => ({
    roleId, cardPath: `角色卡/${roleId}/role-card.md`, boundaryPath: `角色卡/${roleId}/boundary.yaml`, cardText: roleId,
    boundary: { entries: [{ root: "project", path: dir, kind: "directory", purpose: "p" }], boundarySource: `角色卡/${roleId}/boundary.yaml`, acceptance: { accepted: false, source: "" } },
  });
  return {
    projectRoot: root,
    roles: [builtIn("chief", "chief"), builtIn("verifier", "verification"), worker("implementer", "src/"), worker("qa", "tests/")],
    warnings: [], hasRoles: true, primaryRoleId: "chief", governanceModel: "trio",
  };
}

async function writeSessionProject(root: string): Promise<{ ref: { path: string; sha256: string; version: number }; otherRef: { path: string; sha256: string; version: number } }> {
  const write = async (rel: string, text: string): Promise<void> => {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text, "utf8");
  };
  await write("docs/product/focus-intent-v1.md", "# 产品意图\n\n目标：番茄钟。\n");
  await write("docs/proposals/focus-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: focus\nversion: 1\nintent: docs/product/focus-intent-v1.md\n---\n# 提案\n");
  await write("docs/proposals/focus-roster-v1.md", SESSION_ROSTER_TEXT);
  const parsed = parseProjectRoster(SESSION_ROSTER_TEXT);
  if (!parsed.ok) throw new Error(parsed.reason);
  await write("docs/proposals/focus-modules-v1.md", ["---", "schema: project-modules/v2", "flowId: focus", "version: 1", `modules: ${JSON.stringify(parsed.roster.modules)}`, "---", "# 模块清单"].join("\n"));
  await write("docs/contracts/focus-architecture-v1.md", "# 架构\n\nproposal: docs/proposals/focus-proposal-v1.md\n");
  await write("角色卡/qa/role-card.md", "# 测试\n");
  await write("角色卡/qa/boundary.yaml", "role: qa\nentries: []\n");
  await write("角色卡/implementer/role-card.md", "# 实现者\n");
  await write("角色卡/implementer/boundary.yaml", "role: implementer\nentries: []\n");
  await write("docs/acceptance/focus-criteria-v1.md", CRITERIA);
  await write("docs/acceptance/other-criteria-v1.md", CRITERIA.replace("flowId: focus", "flowId: other"));
  await recordVersionedDocBaselines({ projectRoot: root, recordedBy: "app:test" });
  await ensureDraftRun(root, "focus");
  const artifact = "tests/evidence/a.txt";
  await write(artifact, "共 3 行\npass: 2\nfail: 0\n");
  const actual = await readArtifact(root, artifact);
  await write(`${artifact}.meta.json`, JSON.stringify({
    schema: "evidence-meta/v1", artifact, sha256: actual.sha256, bytes: actual.bytes, lines: actual.lines,
    generatedAt: new Date(Date.now() + 5000).toISOString(), metrics: { pass: 2, fail: 0 }, acIds: ["AC-28"], p0: false,
  }));
  const second = "tests/evidence/b.txt";
  await write(second, "共 1 行\n");
  const actualSecond = await readArtifact(root, second);
  await write("tests/evidence/collection.meta.json", JSON.stringify({
    schema: "evidence-meta/v1",
    collection: [
      { artifact, sha256: actual.sha256, bytes: actual.bytes, lines: actual.lines, metrics: { pass: 2, fail: 0 }, acIds: ["AC-28"] },
      { artifact: second, sha256: actualSecond.sha256, bytes: actualSecond.bytes, lines: actualSecond.lines, acIds: ["AC-28"] },
    ],
    acIds: ["AC-28"],
    generatedAt: new Date(Date.now() + 5000).toISOString(),
  }));
  await write("other-role/evidence.txt", "共 1 行\n");
  const sha = (rel: string) => fs.readFile(path.join(root, rel)).then((bytes) => createHash("sha256").update(bytes).digest("hex"));
  return {
    ref: { path: "docs/acceptance/focus-criteria-v1.md", sha256: await sha("docs/acceptance/focus-criteria-v1.md"), version: 1 },
    otherRef: { path: "docs/acceptance/other-criteria-v1.md", sha256: await sha("docs/acceptance/other-criteria-v1.md"), version: 1 },
  };
}

function sessionHarness(root: string) {
  const evidenceChecks: Record<string, EvidenceCheckFn | undefined> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      evidenceChecks[input.roleId] = (input as { evidenceCheck?: EvidenceCheckFn }).evidenceCheck;
      const handle: RoleSessionHandle = {
        async send() {},
        events() {
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  return { value: undefined as unknown as OrchestrationEvent, done: true };
                },
              };
            },
          };
        },
        async dispose() {},
      };
      return handle;
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? sessionListing(root) : undefined),
    emitEvent: () => {},
    customerInput: async () => ({ outcome: "declined", operatorId: "test" }),
  });
  return { mgr, evidenceChecks };
}

test("P4.4/F1–F3/F5：真实会话 evidence_check——collection 路由、角色范围、路径、flow 绑定", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-session-evidence-"));
  const outside = path.join(os.tmpdir(), `${path.basename(root)}-outside.meta.json`);
  const h = sessionHarness(root);
  try {
    const { ref, otherRef } = await writeSessionProject(root);
    await fs.writeFile(outside, JSON.stringify({ schema: "evidence-meta/v1", artifact: "tests/evidence/a.txt" }), "utf8");
    await h.mgr.open({ projectRoot: root, roleId: "qa", runtime: "demo" });
    await tick(30);
    const check = h.evidenceChecks.qa;
    assert.ok(check, "真实会话必须注入 evidenceCheck");
    if (!check) return;
    const call = async (input: EvidenceCheckInput): Promise<Record<string, unknown>> => {
      const text = await check(input);
      assert.equal(typeof text, "string");
      return JSON.parse(text as string) as Record<string, unknown>;
    };

    // F1：collection sidecar 经会话数据源（checkEvidence→checkEvidenceCollection）真实通过。
    const collection = await call({ artifact: "tests/evidence/a.txt", metaPath: "tests/evidence/collection.meta.json", acId: "AC-28", criteriaRef: ref });
    assert.equal(collection["ok"], true, JSON.stringify(collection));
    assert.equal(collection["valid"], true);
    assert.equal(collection["code"], undefined);
    // 单文件同源通过。
    const single = await call({ artifact: "tests/evidence/a.txt", acId: "AC-28", criteriaRef: ref });
    assert.equal(single["ok"], true, JSON.stringify(single));

    // F2：跨角色 artifact 被真实会话拒绝（qa 的模块范围＝tests/）。
    const foreign = await call({ artifact: "other-role/evidence.txt", acId: "AC-28", criteriaRef: ref });
    assert.equal(foreign["ok"], false);
    assert.equal(foreign["code"], "evidence-scope-denied");
    // F3：metaPath 越界/绝对路径在真实会话被拒。
    for (const metaPath of ["../" + path.basename(outside), outside, ".ans/state.json", ".env"]) {
      const traversal = await call({ artifact: "tests/evidence/a.txt", metaPath, acId: "AC-28", criteriaRef: ref });
      assert.equal(traversal["ok"], false, metaPath);
      assert.equal(traversal["code"], "evidence-path-invalid", metaPath);
    }
    // F5②：跨 flow criteriaRef 被当前 draft run（focus）拒绝。
    const crossFlow = await call({ artifact: "tests/evidence/a.txt", acId: "AC-28", criteriaRef: otherRef });
    assert.equal(crossFlow["ok"], false, JSON.stringify(crossFlow));
    assert.equal(crossFlow["code"], "criteria-ref-mismatch");

    // 工具层复用同一会话数据源：role 参数与路径也在工具层被拒，collection 仍通过。
    const gate = { allowed: true } as unknown as WriteGate;
    const tool = buildGovernedTools(gate, { roleId: "qa", evidenceCheck: check }).find((item) => item.name === "evidence_check");
    assert.ok(tool);
    if (!tool) return;
    const toolForeign = await tool.handler({ args: { artifact: "tests/evidence/a.txt", roleId: "other-role", acId: "AC-28", criteriaRef: ref } } as never);
    assert.equal(toolForeign.ok, false);
    if (!toolForeign.ok) assert.match(toolForeign.message, /evidence-scope-denied/);
    const toolCollection = await tool.handler({ args: { artifact: "tests/evidence/a.txt", metaPath: "tests/evidence/collection.meta.json", acId: "AC-28", criteriaRef: ref } } as never);
    assert.equal(toolCollection.ok, true);
    if (toolCollection.ok) {
      const parsedTool = JSON.parse(toolCollection.message) as Record<string, unknown>;
      assert.equal(parsedTool["ok"], true, toolCollection.message);
      assert.equal(parsedTool["valid"], true);
    }
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
    await fs.rm(outside, { force: true });
  }
});
