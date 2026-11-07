// test/编排/product-module-consumption.test.ts
// X-R1（E2 S2/S4）product 单元消费点回归：
//  - run-role：product 角色专属工具在 trio 读角色模块 `tools()`（D1 装配表校验），single 保留旧角色门控；
//  - version-change-runtime：product 模块 `preflight.checkAction("version-upgrade", …)` 只在 direct 路径、
//    既有 operationId/baseTrunk/actor 校验之后调用；deny 映射回既有 Direct 回执码，allow 不替代 Service 校验；
//  - apply-journal：product 相关条件均为 Service 事务/账本/证据/派发数据，不接角色模块策略（无改动守卫）。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createHash } from "node:crypto";

import { createFsTrunkStore } from "../../src/provider/trunk/public/trunk-store.ts";
import { createGuardFreezeRegistry } from "../../src/provider/version-change/public/version-change-store.ts";
import { createTrunkService } from "../../src/service/trunk/public/trunk-service.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { createVersionChangeRuntime } from "../../src/pipeline/orchestration/version-change-runtime.ts";
import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  SubmitVersionChangeFn,
  WriteGate,
} from "../../src/model/runtime.ts";
import { TRUNK_MANIFEST_SCHEMA, type TrunkManifest } from "../../src/model/trunk.ts";

const at = "2026-11-07T00:00:00.000Z";
const sha = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

interface Captured {
  caps?: AdapterCapabilities;
}

function capturingFactory(captured: Captured) {
  return (_gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
    captured.caps = caps;
    const session: RoleSession = {
      async prompt(): Promise<void> {},
      events(): AsyncIterable<SessionEvent> {
        return (async function* () {
          yield { kind: "settled" as const, summary: "完成" };
        })();
      },
      async dispose(): Promise<void> {},
    };
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return session;
      },
    };
  };
}

const submitVersionChange: SubmitVersionChangeFn = async () => ({
  ok: true,
  applicationId: "vc-xr1",
  status: "submitted",
});

function productProject(root: string, governanceModel: "single" | "trio"): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel,
    builtInRoles: ["product"],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:xr1-product" },
    },
  };
}

test("X-R1 run-role：trio product 注入 submitVersionChange；single+product 结构不可达（P-6 旧口径）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-xr1-roles-"));
  try {
    const captured: Captured = {};
    const handle = await openRoleSession(
      { roleId: "product", project: productProject(root, "trio"), submitVersionChange },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.equal(captured.caps?.submitVersionChange, submitVersionChange, "module/trio: 注入同一引用");
    } finally {
      await handle.dispose();
    }
    // single 下三权角色由门禁引擎结构性拒绝；旧 fallback（模块未启用 ⇒ 旧角色 id 门控）保留在代码中，
    // 但不经生产入口暴露（P-6）。
    await assert.rejects(
      openRoleSession({ roleId: "product", project: productProject(root, "single"), submitVersionChange },
        { createAdapter: capturingFactory({}) }),
      /single/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function directFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-xr1-vca-"));
  await fs.mkdir(path.join(root, "docs"), { recursive: true });
  const workflow = Buffer.from("# Workflow\n", "utf8");
  await fs.writeFile(path.join(root, "docs/workflow.md"), workflow);
  const store = createFsTrunkStore(root);
  const captured = await store.captureSnapshot!({
    snapshotId: "xr1-s1",
    createdAt: at,
    files: [{ path: "docs/workflow.md", sha256: sha(workflow) }],
  });
  assert.ok(captured.ok, JSON.stringify(captured));
  if (!captured.ok) throw new Error("snapshot fixture failed");
  const manifest: TrunkManifest = {
    schema: TRUNK_MANIFEST_SCHEMA,
    trunkVersion: 1,
    source: "bootstrap",
    previous: null,
    flowId: "demo",
    runId: null,
    artifacts: {
      documents: {},
      execution: { teamPlan: null, flow: null },
      workflow: { kind: "workflow", path: "docs/workflow.md", sha256: sha(workflow) },
      boundaries: {},
    },
    snapshotRef: captured.value,
    digest: sha("xr1-manifest-1"),
    createdAt: at,
    updatedAt: at,
  };
  assert.ok((await store.compareAndSwapManifest!(null, manifest, captured.value)).ok);
  await fs.mkdir(path.join(root, "docs/proposals"), { recursive: true });
  const proposalPath = "docs/proposals/demo-proposal-v1.md";
  await fs.writeFile(path.join(root, proposalPath), "---\nschema: project-proposal/v2\n---\nTarget bytes\n");
  const service = createTrunkService({
    projectRoot: root,
    store,
    freezeRegistry: createGuardFreezeRegistry(root, { migrationCompleted: () => true }),
  });
  const integration = createVersionChangeIntegration({ projectRoot: root, migrationCompleted: () => true });
  const runtime = createVersionChangeRuntime({
    projectRoot: root,
    services: integration.services,
    trunkService: service,
    directTrunkService: service,
    trunkRuntime: {
      applyApproved: async () => { throw new Error("ordinary approval path forbidden"); },
      bootstrap: async () => { throw new Error("ordinary bootstrap path forbidden"); },
    },
    emitEvent: async () => {},
    notifyDirect: async () => {},
  });
  const input = {
    kind: "version-upgrade" as const,
    initiatorRoleId: "product" as const,
    flowId: "demo",
    summary: "Publish the direct target",
    operationId: "xr1-direct-submit",
    baseTrunk: { version: 1, digest: manifest.digest },
    targets: [{ kind: "contract", path: proposalPath, action: "add" as const, expectedFromSha256: null }],
  };
  return { root, store, manifest, runtime, proposalPath, input };
}

test("X-R1 VCA direct：product preflight allow 不替代 Service——合法提交仍由既有 direct 链路落盘", async () => {
  const f = await directFixture();
  try {
    const result = await f.runtime.submitDirect(f.input, "product");
    assert.equal(result.status, "applied", JSON.stringify(result));
    const current = await f.store.readManifest();
    assert.ok(current.ok, JSON.stringify(current));
    if (current.ok) assert.equal(current.value.trunkVersion, 2);
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test("X-R1 VCA direct：product 模块 deny 映射既有回执码，且拒绝不落盘", async () => {
  const f = await directFixture();
  try {
    const missingExpected = await f.runtime.submitDirect({
      ...f.input,
      operationId: "xr1-missing-expected",
      targets: [{ kind: "contract", path: f.proposalPath, action: "add" }],
    }, "product");
    assert.equal(missingExpected.status, "rejected");
    assert.equal(missingExpected.errorCode, "vca-target-invalid");

    const emptyTargets = await f.runtime.submitDirect({
      ...f.input,
      operationId: "xr1-empty-targets",
      targets: [],
    }, "product");
    assert.equal(emptyTargets.status, "rejected");
    assert.equal(emptyTargets.errorCode, "vca-invalid");

    const amendmentRef = await f.runtime.submitDirect({
      ...f.input,
      operationId: "xr1-amendment-ref",
      amendmentId: "am-1",
    }, "product");
    assert.equal(amendmentRef.status, "rejected");
    assert.equal(amendmentRef.errorCode, "vca-invalid");

    // 非 direct 的 detail-amendment（rapporteur）不经过 product 模块：若误调用会先 deny
    // `product-initiator-mismatch`（vca-role-not-allowed）；实际仍由 Service 的 expectedFromSha256
    // 前置拒绝（vca-target-invalid）。
    const detail = await f.runtime.submitDirect({
      kind: "detail-amendment",
      initiatorRoleId: "rapporteur",
      flowId: "demo",
      summary: "Detail amendment",
      operationId: "xr1-detail",
      baseTrunk: { version: 1, digest: f.manifest.digest },
      targets: [{ kind: "contract", path: f.proposalPath, action: "add" }],
    }, "rapporteur");
    assert.equal(detail.status, "rejected");
    assert.equal(detail.errorCode, "vca-target-invalid");

    const current = await f.store.readManifest();
    assert.ok(current.ok, JSON.stringify(current));
    if (current.ok) assert.equal(current.value.digest, f.manifest.digest, "rejections leave the trunk untouched");
  } finally {
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test("X-R1 接缝守卫：消费点经 Service 公共出口；apply-journal 不接 product 策略", async () => {
  const read = (rel: string): Promise<string> => fs.readFile(new URL(rel, import.meta.url), "utf8");
  const runRole = await read("../../src/pipeline/orchestration/run-role.ts");
  // X-R2 起同一模块路径覆盖 product/rapporteur（`setup.role.id` 选择；literal 不再硬编码 product）；
  // X-R5 起 verifier 也进入同一 `moduleToolsRole`（空声明经 D1 校验）。
  assert.match(
    runRole,
    /const moduleToolsRole =[\s\S]{0,300}?setup\.role\.id === "product"[\s\S]{0,300}?setup\.role\.id === "rapporteur"/,
  );
  assert.match(runRole, /moduleToolDeclarationOf\(setup\.role\.id, governanceModel\)/);
  assert.match(runRole, /validateRoleToolDeclaration\(roleId, module\.tools\(\{ governanceModel \}\)\.tools\)/);
  assert.match(runRole, /const module = builtInRoleModuleOf\(roleId\);\s*\n\s*if \(module !== undefined\) return module\.cards;/);
  assert.match(runRole, /moduleSubmitVersionChange === undefined\n?\s*\? legacySubmitVersionChange/,
    "模块未启用（single/su/未装配）必须保留旧角色 id 门控");

  const vcaRuntime = await read("../../src/pipeline/orchestration/version-change-runtime.ts");
  assert.match(vcaRuntime, /builtInRoleModuleOf\("product"\)\?\.preflight/);
  assert.match(vcaRuntime, /preflight\.checkAction\(\{ action: "version-upgrade", facts \}\)/);

  const applyJournal = await read("../../src/service/trunk/impl/apply-journal.ts");
  assert.doesNotMatch(applyJournal, /builtInRoleModuleOf|validateRoleToolDeclaration/,
    "apply-journal 不接角色工具声明策略");
  assert.doesNotMatch(applyJournal, /action: "version-upgrade"/,
    "product 角色策略经 version-change-runtime direct 路径消费");
  assert.match(
    applyJournal,
    /verifierRoleModule\.preflight\?\.checkAction\(\{[\s\S]{0,200}?action: "review"/,
    "apply-journal 唯一的角色策略消费是 verifier review 前置（X-R5）",
  );
});
