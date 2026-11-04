// test/桌面应用/trunk.test.ts
// B-4（2026-11-04 trunk-amendment-model D1）：trunk IPC / 面板载荷接线。
// 覆盖：`trunk:state` 载荷（F15 workflow/roleCards/boundaries 三类）；Interface 只读/受控方法回执；
// 主干升级预览→同一 previewId 二次确认（一次性）；`trunk:state` 单一推送源；IPC 冻结集/接线源码钉
// （无 `version-change:submit` / `refactor:request` / `stable-write:request`；客户批准只经
// `session:operator-response`）。只跑主进程纯逻辑 + 假栈件；不启动 Electron、不触网。

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDesktopInterface,
  createShellJudgeSwitch,
  type DesktopInterface,
} from "../../app/desktop/interface.ts";
import { buildTrunkStatePayload } from "../../app/desktop/trunk.ts";
import type { TrunkStatePayloadV1, TrunkUpgradePreviewV1 } from "../../app/desktop/trunk.ts";
import type { VersionChangeStack } from "../../app/desktop/version-change.ts";
import type { TrunkStatusView } from "../../src/service/trunk/public/trunk-service.ts";
import type { VersionChangeRecord } from "../../src/model/version-change.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const AT = "2026-11-04T12:00:00.000Z";

function record(): VersionChangeRecord {
  return {
    v: 1,
    schema: "version-change/v1",
    applicationId: "vc-1",
    kind: "version-upgrade",
    initiatorRoleId: "product",
    flowId: "demo",
    baseTrunk: { trunkVersion: 1, runId: "run-1", digest: "d".repeat(64) },
    bootstrap: false,
    targets: [{ kind: "contract", path: "docs/proposals/demo-proposal-v2.md", action: "modify", toSha256: "a".repeat(64) }],
    summary: "s",
    status: "submitted",
    applicationSha256: "b".repeat(64),
    at: AT,
  };
}

function emptyPayload(projectRoot = "/p"): TrunkStatePayloadV1 {
  return {
    version: 1,
    ok: true,
    projectRoot,
    generatedAt: AT,
    availability: "frozen",
    trunkVersion: 1,
    source: "bootstrap",
    runId: "run-1",
    flowId: "demo",
    digest: "d".repeat(64),
    derived: false,
    stable: { workflow: { kind: "workflow", path: "docs/workflow.md", sha256: "1".repeat(64) }, roleCards: {}, boundaries: {} },
    amendment: null,
    journal: null,
    pendingReattach: [],
    issues: [],
    freezes: { count: 0, items: [], cacheHealth: "ok" },
    pendingVersionChanges: { count: 0, items: [] },
    refactors: { count: 0, items: [] },
    disables: { versionChange: null, stableWrite: null, trunkUpgrade: null, refactor: null },
  };
}

interface StackCalls {
  present: string[];
  confirm: Array<{ previewId: string; acknowledged: boolean }>;
  recover: Array<{ reason: string; acknowledged: boolean }>;
  upgrades: Array<{ reason: string; scope?: string[] }>;
  items: string[];
  apply: Array<{ applicationId: string; decisionCount: number }>;
  refreeze: Array<{ reason: string; acknowledged: boolean }>;
  abandon: Array<{ reason: string; acknowledged: boolean }>;
  history: number;
}

function fakeStack(
  calls: StackCalls,
  payload: TrunkStatePayloadV1 = emptyPayload(),
  overrides: Partial<VersionChangeStack> = {},
): VersionChangeStack {
  const preview: TrunkUpgradePreviewV1 = {
    previewId: "tup-1",
    reason: "emergency",
    scope: ["manifest 修复"],
    trunkVersion: 1,
    changes: [],
    expiresAt: AT,
  };
  return {
    projectRoot: payload.projectRoot,
    ensureInitialized: async () => ({ ok: true, cacheHealth: "ok" }),
    refreshFreezeState: async () => ({ ok: true, cacheHealth: "ok" }),
    stablePermitOf: () => undefined,
    completeStableWriteAfterWrite: async () => ({ ok: true, skipped: true }),
    onAppointmentWriteApproved: async () => ({ ok: true }),
    requestWorkflowWrite: async () => ({ ok: true }),
    listVersionChanges: async () => [record()],
    presentVersionChange: async (applicationId) => {
      calls.present.push(applicationId);
      return {
        ok: true,
        record: { ...record(), applicationId, status: "rejected" },
        needsItems: false,
      };
    },
    runAmendmentItems: async (applicationId) => {
      calls.items.push(applicationId);
      return { ok: true, decisions: [], cancelled: true };
    },
    applyAmendmentItems: async (applicationId, input) => {
      calls.apply.push({ applicationId, decisionCount: input.decisions.length });
      return { ok: true, record: { ...record(), status: "applied" }, resultTrunkVersion: 2 };
    },
    submitVersionChange: async () => ({ ok: false, errorCode: "vca-invalid", message: "not-used" }),
    submitRefactor: async () => ({ ok: false, errorCode: "refactor-invalid", message: "not-used" }),
    requestStableWrite: async () => ({ ok: false, errorCode: "stable-write-write-failed", message: "not-used" }),
    listStableWrites: async () => [],
    listRefactorRequests: async () => [],
    listDocFreezes: async () => ({ ok: true, freezes: [], cacheHealth: "ok" }),
    trunkState: async () => payload,
    trunkList: async () => ({ ok: true, trunks: [] }),
    requestTrunkUpgrade: async (input) => {
      calls.upgrades.push(input);
      return { ok: true, previewId: preview.previewId, preview };
    },
    confirmTrunkUpgrade: async (input) => {
      calls.confirm.push({ previewId: input.previewId, acknowledged: input.acknowledged });
      return { ok: true, status: "applied", trunkVersion: 2 };
    },
    recoverTrunk: async (input) => {
      calls.recover.push({ reason: input.reason, acknowledged: input.acknowledged });
      return { ok: true, status: "recovered", trunkVersion: 3 };
    },
    refreeze: async (input) => {
      calls.refreeze.push({ reason: input.reason, acknowledged: input.acknowledged });
      return { ok: true, status: "refrozen", trunkVersion: 1, changed: ["workflow"] };
    },
    abandonUpgrade: async (input) => {
      calls.abandon.push({ reason: input.reason, acknowledged: input.acknowledged });
      return { ok: true, status: "refrozen-cancelled", trunkVersion: 1 };
    },
    history: async () => {
      calls.history += 1;
      return { ok: true, versions: [1], currentTrunkVersion: 1 };
    },
    detectStableBoundaryExpansion: async () => ({ expanded: false, expansions: [] }),
    dispose: () => {},
    ...overrides,
  };
}

async function makeInterface(
  calls: StackCalls,
  payload: TrunkStatePayloadV1 = emptyPayload(),
  overrides: Partial<VersionChangeStack> = {},
): Promise<{ desktop: DesktopInterface; cleanup: () => void }> {
  const t = tempDir("ans-trunk-iface-");
  const desktop = createDesktopInterface({
    preferencesPath: path.join(t.dir, "preferences.json"),
    pickDirectory: async () => null,
    emitEvent: () => {},
    runtimeStatePath: path.join(t.dir, "runtime-selection.json"),
    envFilePath: path.join(t.dir, ".env"),
    piConfigEnv: {} as Record<string, string | undefined>,
    shellJudgeSwitch: createShellJudgeSwitch(false),
    decisionJudgeSwitch: createShellJudgeSwitch(false),
    createVersionChangeStackFn: () => fakeStack(calls, payload, overrides),
  });
  return { desktop, cleanup: t.cleanup };
}

// ———————————————— 1. trunk:state 载荷（F15） ————————————————

test("trunk:state 载荷：F15 workflow/roleCards/boundaries 三类；禁用原因与冻结健康派生", () => {
  const view: TrunkStatusView = {
    availability: "frozen",
    manifest: {
      schema: "trunk/v1",
      trunkVersion: 3,
      source: "upgrade",
      previous: { trunkVersion: 2 },
      flowId: "demo",
      runId: "run-1",
      artifacts: {
        documents: { proposal: { path: "docs/proposals/demo-proposal-v3.md", sha256: "3".repeat(64), version: 3 } },
        execution: {
          teamPlan: { path: "docs/scheduling/demo-team-v1.md", sha256: "4".repeat(64) },
          flow: { path: "docs/flows/demo.yaml", sha256: "5".repeat(64), version: 1 },
        },
        workflow: { kind: "workflow", path: "docs/workflow.md", sha256: "6".repeat(64) },
        roleCards: { impl: { kind: "role-card", path: "角色卡/impl/role-card.md", sha256: "7".repeat(64) } },
        boundaries: { impl: { kind: "boundary", path: "角色卡/impl/boundary.yaml", sha256: "8".repeat(64) } },
      },
      digest: "9".repeat(64),
      createdAt: AT,
      updatedAt: AT,
    },
    derived: false,
    frozenDocuments: [{ kind: "proposal", path: "docs/proposals/demo-proposal-v3.md", sha256: "3".repeat(64), version: 3 }],
    stable: {
      workflow: { kind: "workflow", path: "docs/workflow.md", sha256: "6".repeat(64) },
      roleCards: { impl: { kind: "role-card", path: "角色卡/impl/role-card.md", sha256: "7".repeat(64) } },
      boundaries: { impl: { kind: "boundary", path: "角色卡/impl/boundary.yaml", sha256: "8".repeat(64) } },
    },
    pendingReattach: [],
    issues: [],
  } as TrunkStatusView;
  const payload = buildTrunkStatePayload({
    projectRoot: "/p",
    view,
    generatedAt: AT,
    cacheHealth: "ok",
    freezeCount: 7,
    versionChanges: [],
    refactors: [],
  });
  assert.equal(payload.trunkVersion, 3);
  assert.equal(payload.stable.workflow?.kind, "workflow");
  assert.equal(payload.stable.roleCards.impl?.path, "角色卡/impl/role-card.md");
  assert.equal(payload.stable.roleCards.impl?.kind, "role-card");
  assert.equal(payload.stable.boundaries.impl?.path, "角色卡/impl/boundary.yaml");
  assert.equal(payload.stable.boundaries.impl?.kind, "boundary");
  assert.equal(payload.disables.versionChange, null);
  assert.equal(payload.disables.stableWrite, null);
  assert.equal(payload.disables.trunkUpgrade, null);
  assert.equal(payload.freezes.count, 7);

  // 冻结缓存 corrupt ⇒ 依赖冻结判定的入口全部 fail-closed；无 manifest ⇒ 升级禁用。
  const corrupt = buildTrunkStatePayload({
    projectRoot: "/p",
    view: { ...view, availability: "unavailable", manifest: undefined, derived: false } as TrunkStatusView,
    generatedAt: AT,
    cacheHealth: "corrupt-failclosed",
    freezeCount: 0,
    versionChanges: [],
    refactors: [],
  });
  assert.equal(typeof corrupt.disables.versionChange, "string");
  assert.equal(typeof corrupt.disables.stableWrite, "string");
  assert.equal(typeof corrupt.disables.trunkUpgrade, "string");
  assert.equal(corrupt.trunkVersion, null);
  assert.equal(corrupt.availability, "unavailable");
});

// ———————————————— 2. Interface：只读/受控回执（假栈件） ————————————————

test("Interface 版本变更/重构/冻结只读：空项目根结构化失败；有栈件时返回摘要", async () => {
  const calls: StackCalls = {
    present: [],
    confirm: [],
    recover: [],
    upgrades: [],
    items: [],
    apply: [],
    refreeze: [],
    abandon: [],
    history: 0,
  };
  const { desktop, cleanup } = await makeInterface(calls);
  try {
    const missing = await desktop.listVersionChanges({ projectRoot: "" });
    assert.equal(missing.ok, false);
    const listed = await desktop.listVersionChanges({ projectRoot: "/p" });
    assert.equal(listed.ok, true);
    if (listed.ok) {
      assert.equal(listed.items.length, 1);
      assert.equal(listed.items[0]?.applicationId, "vc-1");
      assert.equal(listed.items[0]?.targets[0]?.version, 2);
    }
    const writes = await desktop.listStableWrites({ projectRoot: "/p", limit: 3 });
    assert.deepEqual(writes, { ok: true, items: [] });
    const refactors = await desktop.listRefactorRequests({ projectRoot: "/p" });
    assert.deepEqual(refactors, { ok: true, items: [] });
    const freezes = await desktop.listDocFreezes({ projectRoot: "/p", limit: 5 });
    assert.equal(freezes.ok, true);
    if (freezes.ok) {
      assert.deepEqual(freezes.freezes, []);
      assert.equal(freezes.cacheHealth, "ok");
    }
  } finally {
    cleanup();
  }
});

test("Interface VCA 重发卡：submitted 重发回执 answered/recordStatus；不提供 submit 通道", async () => {
  const calls: StackCalls = {
    present: [],
    confirm: [],
    recover: [],
    upgrades: [],
    items: [],
    apply: [],
    refreeze: [],
    abandon: [],
    history: 0,
  };
  const { desktop, cleanup } = await makeInterface(calls);
  try {
    const reply = await desktop.presentVersionChange({ projectRoot: "/p", applicationId: "vc-1" });
    assert.equal(reply.ok, true);
    if (reply.ok) {
      assert.equal(reply.status, "answered");
      assert.equal(reply.recordStatus, "rejected");
      assert.equal(reply.needsItems, false);
    }
    assert.deepEqual(calls.present, ["vc-1"]);
    // 结构：Interface 无 submit/refactor 请求方法（提交只经角色能力工具）。
    const proto = Object.keys(desktop as unknown as Record<string, unknown>);
    assert.equal(proto.includes("submitVersionChange"), false);
    assert.equal(proto.includes("requestRefactor"), false);
  } finally {
    cleanup();
  }
});

test("detail VCA 批准后：后台驱动逐项卡收集 → apply（needsItems；不新增 IPC）", async () => {
  const calls: StackCalls = {
    present: [],
    confirm: [],
    recover: [],
    upgrades: [],
    items: [],
    apply: [],
    refreeze: [],
    abandon: [],
    history: 0,
  };
  const decision = { itemId: "am-item-1", choice: "item-apply" as const, decisionId: "decision-item-1" };
  const { desktop, cleanup } = await makeInterface(calls, emptyPayload(), {
    presentVersionChange: async (applicationId) => {
      calls.present.push(applicationId);
      return { ok: true, record: { ...record(), applicationId, status: "approved" }, needsItems: true };
    },
    runAmendmentItems: async (applicationId) => {
      calls.items.push(applicationId);
      return { ok: true, decisions: [decision], cancelled: false };
    },
    applyAmendmentItems: async (applicationId, input) => {
      calls.apply.push({ applicationId, decisionCount: input.decisions.length });
      return { ok: true, record: { ...record(), status: "applied" }, resultTrunkVersion: 2 };
    },
  });
  try {
    const reply = await desktop.presentVersionChange({ projectRoot: "/p", applicationId: "vc-detail" });
    assert.equal(reply.ok, true);
    if (reply.ok) assert.equal(reply.needsItems, true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(calls.items, ["vc-detail"]);
    assert.deepEqual(calls.apply, [{ applicationId: "vc-detail", decisionCount: 1 }]);
  } finally {
    cleanup();
  }
});

test("Interface trunk：state 单一载荷、list、升级预览→同一 previewId 二次确认、恢复/重冻结构", async () => {
  const calls: StackCalls = {
    present: [],
    confirm: [],
    recover: [],
    upgrades: [],
    items: [],
    apply: [],
    refreeze: [],
    abandon: [],
    history: 0,
  };
  const { desktop, cleanup } = await makeInterface(calls);
  try {
    const state = await desktop.getTrunkState({ projectRoot: "/p" });
    assert.equal(state.ok, true);
    if (state.ok) {
      assert.equal(state.payload.trunkVersion, 1);
      assert.equal(state.payload.stable.workflow?.path, "docs/workflow.md");
    }
    const list = await desktop.listTrunks({ projectRoot: "/p" });
    assert.deepEqual(list, {
      ok: true,
      trunks: [],
      history: { versions: [1], currentTrunkVersion: 1 },
    });
    assert.equal(calls.history, 1, "trunk:list 读取 S5 history()");
    const upgrade = await desktop.requestTrunkUpgrade({ projectRoot: "/p", reason: "emergency", scope: ["manifest 修复"] });
    assert.equal(upgrade.ok, true);
    assert.equal(upgrade.previewId, "tup-1");
    assert.equal(calls.upgrades[0]?.reason, "emergency");
    assert.deepEqual(calls.upgrades[0]?.scope, ["manifest 修复"]);
    const confirmed = await desktop.confirmTrunkUpgrade({ projectRoot: "/p", previewId: "tup-1", acknowledged: true });
    assert.deepEqual(confirmed, { ok: true, status: "applied", trunkVersion: 2 });
    assert.deepEqual(calls.confirm[0], { previewId: "tup-1", acknowledged: true });
    // 非 true 的 acknowledged 原样传给栈（栈 fail-closed；Interface 不伪造）。
    await desktop.confirmTrunkUpgrade({ projectRoot: "/p", previewId: "tup-1", acknowledged: false });
    assert.equal(calls.confirm[1]?.acknowledged, false);
    // 常规理由拒绝（不进入栈）。
    const before = calls.upgrades.length;
    const regular = await desktop.requestTrunkUpgrade({ projectRoot: "/p", reason: "normal" });
    assert.equal(regular.ok, false);
    assert.equal(calls.upgrades.length, before);
    const recovered = await desktop.requestTrunkRecover({ projectRoot: "/p", reason: "manifest 损坏", acknowledged: true });
    assert.deepEqual(recovered, { ok: true, status: "recovered", trunkVersion: 3 });
    assert.deepEqual(calls.recover[0], { reason: "manifest 损坏", acknowledged: true });
    const refreeze = await desktop.requestTrunkRefreeze({ projectRoot: "/p", reason: "重新冻结", acknowledged: true });
    assert.deepEqual(refreeze, { ok: true, status: "refrozen", trunkVersion: 1, changed: ["workflow"] });
    assert.deepEqual(calls.refreeze[0], { reason: "重新冻结", acknowledged: true });
    const refreezeMissing = await desktop.requestTrunkRefreeze({ projectRoot: "/p", acknowledged: true });
    assert.equal(refreezeMissing.ok, false);
    assert.equal(calls.refreeze.length, 1, "缺 reason 不进入栈");
    const abandon = await desktop.abandonTrunkUpgrade({ projectRoot: "/p", reason: "放弃", acknowledged: true });
    assert.deepEqual(abandon, { ok: true, status: "refrozen-cancelled", trunkVersion: 1 });
    assert.deepEqual(calls.abandon[0], { reason: "放弃", acknowledged: true });
  } finally {
    cleanup();
  }
});

// ———————————————— 3. 接线源码钉（main.ts / preload.cjs） ————————————————

test("接线源码钉：main.ts 注册冻结 IPC 集；无 submit/refactor:request/stable-write:request；preload 白名单", () => {
  const main = read("app/main.ts");
  for (const channel of [
    "version-change:list",
    "version-change:present",
    "stable-write:list",
    "refactor:list",
    "doc-freeze:list",
    "trunk:list",
    "trunk:upgrade-request",
    "trunk:upgrade-confirm",
    "trunk:refreeze-request",
    "trunk:abandon-upgrade",
    "trunk:recover-request",
    "trunk:state",
  ]) {
    assert.equal(main.includes(channel), true, `main.ts 应注册/推送 ${channel}`);
  }
  for (const forbidden of ["version-change:submit", "refactor:request", "stable-write:request"]) {
    assert.equal(main.includes(`registerHandler("${forbidden}"`), false, `main.ts 不得注册 ${forbidden}`);
    assert.equal(main.includes(`registerHandler('${forbidden}'`), false, `main.ts 不得注册 ${forbidden}`);
  }
  // 客户批准/拒绝只经既有 operator-response；trunk:upgrade-confirm 仅紧急/恢复二次确认。
  assert.equal(main.includes('"session:operator-response"'), true);
  const preload = read("app/preload.cjs");
  for (const method of [
    "listVersionChanges",
    "presentVersionChange",
    "listStableWrites",
    "listRefactorRequests",
    "listDocFreezes",
    "listTrunks",
    "requestTrunkUpgrade",
    "confirmTrunkUpgrade",
    "requestTrunkRefreeze",
    "abandonTrunkUpgrade",
    "requestTrunkRecover",
    "onTrunkState",
  ]) {
    assert.equal(preload.includes(`${method}:`), true, `preload 应暴露 ${method}`);
  }
  assert.equal(preload.includes('invoke("version-change:submit"'), false);
  assert.equal(preload.includes('invoke("refactor:request"'), false);
  assert.equal(preload.includes('invoke("stable-write:request"'), false);
});
