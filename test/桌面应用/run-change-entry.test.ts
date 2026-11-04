// test/桌面应用/run-change-entry.test.ts
// 2026-10-31（run-change 触发缺陷）：显式入口「契约变更 · 重开 run」的桌面接线——
//   · listProject 附带 active run 摘要（按钮启用依据；读取失败如实 activeRunsError）；
//   · `run:change-request` → Interface.requestRunChange → SessionManager.requestRunChangeDecision
//     （客户作答后落账；无 pinned run / 无可呈现会话 ⇒ 如实失败）；
//   · 跨层源码钉：main handler / preload 桥 / platform 类型 / ChatHeader 按钮（防「已实现无入口」回潮）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDesktopInterface, type DesktopInterface } from "../../app/desktop/interface.ts";
import { createCustomerInputChannel, type OperatorJudgeResultPayload, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { readRunManifest, writeRunManifest, type RunManifest } from "../../src/common/编排/run-manifest.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { CustomerInputFn, CustomerInputRequest } from "../../src/model/runtime.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }) };
}

function pinnedManifest(flowId: string): RunManifest {
  const now = "2026-10-31T00:00:00.000Z";
  return {
    schema: "ans-run/v1",
    runId: `run-20261031-${flowId}-abcdef12`,
    flowId,
    state: "pinned",
    createdAt: now,
    updatedAt: now,
    pinnedAt: now,
    pinnedBy: "app",
    schemas: { run: "ans-run/v1" },
    documents: {},
    execution: { teamPlan: null, flow: null },
    d3: { decisionId: "decision-x", targetRoleIds: ["dev"] },
    stage: { current: "stage-1", planVersion: 1 },
    roles: ["dev"],
  };
}

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: NonNullable<ProjectListing["roles"][number]["governanceFunction"]>): ProjectListing["roles"][number] => ({
    roleId, cardPath: "", boundaryPath: "", cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true, governanceFunction: fn,
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"),
      builtIn("product", "product"),
      builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"),
      builtIn("convener", "schedule"),
      builtIn("verifier", "verification"),
    ],
    warnings: [], hasRoles: true, primaryRoleId: "chief", governanceModel: "trio",
  };
}

function handle(): RoleSessionHandle {
  return {
    async send() {},
    events() { return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(20); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } }; },
    async dispose() {},
  };
}

function desktopFor(root: string, options: { answer?: (request: CustomerInputRequest) => import("../../src/model/runtime.ts").CustomerInputOutcome }): { desktop: DesktopInterface; requests: CustomerInputRequest[] } {
  const requests: CustomerInputRequest[] = [];
  const customerInput: CustomerInputFn = async (request) => {
    requests.push(request);
    return options.answer?.(request) ?? { outcome: "declined", operatorId: "test" };
  };
  const desktop = createDesktopInterface({
    pickDirectory: async () => null,
    emitEvent: () => {},
    listProjectFn: async () => listing(root),
    buildProjectConfigFn: buildProjectConfig,
    openRoleSessionFn: async () => handle(),
    customerInput,
    envFilePath: path.join(root, ".env"),
    piConfigEnv: {},
    runtimeStatePath: path.join(root, "runtime-selection.json"),
  });
  return { desktop, requests };
}

test("listProject 附带 activeRuns（pinned/draft 摘要；draft 不算可发起）", async () => {
  const t = tempDir("ans-run-entry-status-");
  try {
    const pinned = pinnedManifest("focus");
    const written = await writeRunManifest(t.dir, pinned);
    assert.equal(written.ok, true);
    const draft: RunManifest = { ...pinnedManifest("other"), state: "draft", runId: "run-20261031-other-ffffffff" };
    assert.equal((await writeRunManifest(t.dir, draft)).ok, true);
    const { desktop } = desktopFor(t.dir, {});
    const result = await desktop.listProject({ projectRoot: t.dir });
    assert.ok(Array.isArray(result.activeRuns));
    assert.deepEqual(result.activeRuns?.map((run) => `${run.flowId}:${run.state}`).sort(), ["focus:pinned", "other:draft"]);
    assert.equal(result.activeRunsError, undefined);
    const focusRun = result.activeRuns?.find((run) => run.flowId === "focus");
    assert.equal(focusRun?.runId, pinned.runId);
    assert.deepEqual(focusRun?.roles, ["dev"]);
    assert.equal(focusRun?.rosterVersion, undefined);
    await desktop.stopSession();
  } finally {
    t.cleanup();
  }
});

test("requestRunChange：无 pinned run / 多 pinned run / 无可呈现会话 ⇒ 如实失败（不伪造成功）", async () => {
  const empty = tempDir("ans-run-entry-empty-");
  const pinnedDir = tempDir("ans-run-entry-no-session-");
  const multiDir = tempDir("ans-run-entry-multi-");
  try {
    const noRun = desktopFor(empty.dir, {});
    const missing = await noRun.desktop.requestRunChange({ projectRoot: empty.dir });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.match(missing.error, /pinned run|run-change/);
    await noRun.desktop.stopSession();

    assert.equal((await writeRunManifest(multiDir.dir, pinnedManifest("focus"))).ok, true);
    assert.equal((await writeRunManifest(multiDir.dir, { ...pinnedManifest("other"), runId: "run-20261031-other-abcdef34" })).ok, true);
    const multi = desktopFor(multiDir.dir, {});
    const ambiguous = await multi.desktop.requestRunChange({ projectRoot: multiDir.dir });
    assert.equal(ambiguous.ok, false);
    if (!ambiguous.ok) assert.match(ambiguous.error, /多个 pinned run/);
    await multi.desktop.stopSession();

    assert.equal((await writeRunManifest(pinnedDir.dir, pinnedManifest("focus"))).ok, true);
    const noSession = desktopFor(pinnedDir.dir, {});
    await noSession.desktop.listProject({ projectRoot: pinnedDir.dir }); // 导入项目（无会话）
    const failed = await noSession.desktop.requestRunChange({ projectRoot: pinnedDir.dir });
    assert.equal(failed.ok, false);
    if (!failed.ok) assert.match(failed.error, /无法呈现 run-change 卡/);
    await noSession.desktop.stopSession();
  } finally {
    empty.cleanup();
    pinnedDir.cleanup();
    multiDir.cleanup();
  }
});

test("requestRunChange（真实链路）：convener 会话呈现 run-change 卡，客户答 continue-frozen 后落账", async () => {
  const t = tempDir("ans-run-entry-happy-");
  try {
    const manifest = pinnedManifest("focus");
    assert.equal((await writeRunManifest(t.dir, manifest)).ok, true);
    const { desktop, requests } = desktopFor(t.dir, {
      answer: (request) => {
        assert.equal(request.cardKind, "decision");
        assert.equal((request as { application?: boolean }).application, true);
        const choice = request as Extract<CustomerInputRequest, { kind: "choice" }>;
        assert.deepEqual(choice.options.map((option) => option.id), ["continue-frozen", "stop-and-restart", "stop"]);
        return { outcome: "answered", value: { selected: ["continue-frozen"] }, decisionId: "decision-entry-run-change", operatorId: "customer" };
      },
    });
    assert.equal((await desktop.listProject({ projectRoot: t.dir })).projectRoot, t.dir);
    const opened = await desktop.openSession({ projectRoot: t.dir, roleId: "convener", runtime: "demo" });
    assert.equal(opened.ok, true, opened.ok ? "" : opened.error ?? "");
    await tick(30);
    const reply = await desktop.requestRunChange({ projectRoot: t.dir });
    assert.equal(reply.ok, true, reply.ok ? "" : reply.error);
    if (reply.ok) {
      assert.equal(reply.status, "answered");
      assert.equal(reply.mode, "continue-frozen");
      assert.equal(reply.flowId, "focus");
      assert.equal(reply.runId, manifest.runId);
    }
    assert.equal(requests.length, 1, "run-change 卡真实进入客户卡通道");
    const stored = await readRunManifest(t.dir, manifest.runId);
    assert.equal(stored.ok, true);
    if (stored.ok) {
      assert.equal(stored.manifest.state, "pinned", "continue-frozen 不改 run");
      assert.equal(stored.manifest.runChange?.mode, "continue-frozen");
      assert.equal(stored.manifest.runChange?.decisionId, "decision-entry-run-change");
    }
    await desktop.stopSession();
  } finally {
    t.cleanup();
  }
});

test("跨层源码钉：main handler / preload 桥 / platform 类型 / U1 旧按钮已移除（低层 API 保留）/ 触发点接线", () => {
  const main = read("app/main.ts");
  assert.ok(main.includes('registerHandler("run:change-request", (_e, input) => desktop.requestRunChange(input))'), "main.ts 注册 run:change-request");
  const preload = read("app/preload.cjs");
  assert.ok(preload.includes('requestRunChange: (input) => ipcRenderer.invoke("run:change-request", input)'), "preload 暴露 requestRunChange");
  const platform = read("app/renderer/src/lib/platform.ts");
  assert.ok(platform.includes("requestRunChange?: (input: { projectRoot: string; flowId?: string; reason?: string }) => Promise<unknown>"), "platform 桥类型声明（低层 API 保留）");
  const header = read("app/renderer/src/shell/ChatHeader.tsx");
  // 2026-11-05（P1.6 §4.10 / U1）：客户侧移除 `#run-change` 与「重构」按钮，改为「版本变更」+ 收窄「主干升级」；
  // 低层 run-change API/通道保留（preload/Interface/SessionManager 不动），仅 UI 入口移除。
  assert.equal(header.includes('id="run-change"'), false, "旧「契约变更 · 重开 run」按钮已移除");
  assert.equal(header.includes("bridge.requestRunChange"), false, "会话头不再经 preload 桥发起 run-change");
  assert.equal(header.includes("runChangeButtonView"), false, "旧按钮可用性视图已移除");
  assert.ok(header.includes('id="version-change"'), "会话头有「版本变更」入口");
  assert.ok(header.includes('id="trunk-upgrade"'), "会话头有收窄的「主干升级」入口");
  const iface = read("app/desktop/interface.ts");
  assert.ok(iface.includes("requestRunChange(input: unknown): Promise<RunChangeRequestReply>"), "Interface 暴露 requestRunChange");
  assert.ok(iface.includes("manager.requestRunChangeDecision("), "Interface 调 SessionManager.requestRunChangeDecision");
  assert.ok(iface.includes("activeRunViews("), "listProject 使用 active run 摘要");
  const session = read("app/desktop/session.ts");
  assert.ok(session.includes("this.requestRunChangeDecision({"), "SessionManager 内部有真实调用方（显式入口）");
  assert.doesNotMatch(session, /\brunChangeRejectionForDispatch\s*\(/, "派发不再自动触发 run-change（源码无调用）");
  assert.ok(session.includes("proposalCardFrozenRejection"), "提案卡冻结冲突先尝试 run-change 卡");
  const rejection = read("src/common/编排/mechanical-rejection.ts");
  assert.ok(rejection.includes('"run-change-required"'), "机械拒绝新增 run-change-required");
  const finder = read("src/common/编排/run-manifest.ts");
  assert.ok(finder.includes("export async function findNewerContractDocs"), "run-manifest 提供更新版本契约事实（单一来源）");
});

test("requestRunChange（真实客户卡通道 + 替我决策开启）：三模式卡呈现客户、不代选；客户作答后按 customer 落账", async () => {
  const t = tempDir("ans-run-entry-autoselect-");
  try {
    const manifest = pinnedManifest("focus");
    assert.equal((await writeRunManifest(t.dir, manifest)).ok, true);
    const pushed: OperatorRequestPayload[] = [];
    const judgeRows: OperatorJudgeResultPayload[] = [];
    let seq = 0;
    const channel = createCustomerInputChannel({
      presenter: (payload) => pushed.push(payload),
      operatorId: "tester",
      nextId: () => `op-${++seq}`,
      judge: {
        isGroupEnabled: () => true,
        fn: async (request) => ({
          verdict: "approve",
          group: "decision",
          cardKind: "decision",
          engine: request.runtime,
          reasonCode: "recommended-default",
          selected: ["continue-frozen"],
          durationMs: 1,
        }),
      },
      emitJudgeResult: (row) => judgeRows.push(row),
    });
    const desktop = createDesktopInterface({
      pickDirectory: async () => null,
      emitEvent: () => {},
      listProjectFn: async () => listing(t.dir),
      buildProjectConfigFn: buildProjectConfig,
      openRoleSessionFn: async () => handle(),
      customerInput: channel.customerInput,
      envFilePath: path.join(t.dir, ".env"),
      piConfigEnv: {},
      runtimeStatePath: path.join(t.dir, "runtime-selection.json"),
    });
    assert.equal((await desktop.listProject({ projectRoot: t.dir })).projectRoot, t.dir);
    const opened = await desktop.openSession({ projectRoot: t.dir, roleId: "convener", runtime: "demo" });
    assert.equal(opened.ok, true, opened.ok ? "" : opened.error ?? "");
    await tick(30);
    const reply = await desktop.requestRunChange({ projectRoot: t.dir });
    assert.equal(reply.ok, true, reply.ok ? "" : reply.error);
    if (reply.ok) {
      assert.equal(reply.status, "presented", "卡呈现给客户（不代选、不自动结算）");
      assert.equal(reply.runId, manifest.runId);
      assert.equal(reply.flowId, "focus");
    }
    assert.equal(pushed.length, 1, "run-change 卡真实进入客户卡通道并呈现");
    assert.equal(judgeRows.length, 0, "不得产生 judge 代批结果行");
    const request = pushed[0]!.request as Extract<CustomerInputRequest, { kind: "choice" }>;
    assert.equal((request as { application?: boolean }).application, true);
    assert.deepEqual(request.options.map((option) => option.id), ["continue-frozen", "stop-and-restart", "stop"]);
    assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: ["stop-and-restart"] } }).ok, true);
    const end = Date.now() + 3000;
    let stored: Awaited<ReturnType<typeof readRunManifest>> | undefined;
    while (Date.now() < end) {
      stored = await readRunManifest(t.dir, manifest.runId);
      if (stored.ok && stored.manifest.runChange?.mode !== undefined) break;
      await tick(20);
    }
    assert.equal(stored?.ok, true);
    if (stored?.ok) {
      assert.equal(stored.manifest.runChange?.mode, "stop-and-restart");
      assert.equal(stored.manifest.runChange?.decidedBy, "customer", "客户本人作答，不是 judge");
      assert.equal(stored.manifest.state, "closed");
    }
    await desktop.stopSession();
  } finally {
    t.cleanup();
  }
});
