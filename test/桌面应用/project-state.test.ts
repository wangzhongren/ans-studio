// test/桌面应用/project-state.test.ts
// 2026-11-02（A2）：project-state:get 真实 IPC 形状、零写入、裁剪/有界、幕僚备注（focus/blocker/next-step）。
// 覆盖 AC-1.5/1.6/1.7/1.8、AC-2.1–2.4、AC-7.3、R1（视图侧坏+好 manifest 由 A1 覆盖，A2 断言同 builder 结果）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { SessionManager } from "../../app/desktop/session.ts";
import { createDesktopInterface, type DesktopInterface } from "../../app/desktop/interface.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendTaskEvent, taskEvent } from "../../src/common/编排/task-state.ts";
import { writeRunManifest, type RunManifest } from "../../src/common/编排/run-manifest.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { CustomerInputFn, CustomerInputRequest } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: ProjectListing["roles"][number]["governanceFunction"]): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    ...(fn !== undefined ? { governanceFunction: fn } : {}),
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"),
      builtIn("convener", "schedule"),
      builtIn("verifier", "verification"),
      { roleId: "worker", cardPath: "角色卡/worker/role-card.md", boundaryPath: "角色卡/worker/boundary.yaml", cardText: "worker", boundary: { entries: [{ root: "project", path: "src/w.ts", kind: "file", purpose: "p" }], boundarySource: "角色卡/worker/boundary.yaml", acceptance: { accepted: false, source: "" } } },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

function manifest(flowId: string, runId: string, state: RunManifest["state"] = "draft"): RunManifest {
  const now = "2026-11-02T00:00:00.000Z";
  return {
    schema: "ans-run/v1",
    runId,
    flowId,
    state,
    createdAt: now,
    updatedAt: now,
    ...(state === "pinned" ? { pinnedAt: now, pinnedBy: "app" as const } : {}),
    schemas: { run: "ans-run/v1" },
    documents: {},
    execution: { teamPlan: null, flow: null },
  };
}

function handle(): RoleSessionHandle {
  return {
    async send() {},
    events() {
      return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(20); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } };
    },
    async dispose() {},
  };
}

async function append(root: string, event: Parameters<typeof appendTaskEvent>[1]): Promise<void> {
  const result = await appendTaskEvent(root, event);
  assert.equal(result.ok, true, result.ok ? "" : result.message);
}

async function sha(file: string): Promise<string> {
  try {
    return createHash("sha256").update(await fs.readFile(file)).digest("hex");
  } catch {
    return "<missing>";
  }
}

async function fixture(root: string): Promise<{ runId: string; docPath: string }> {
  const runId = "run-20261102-focus-aaaaaaaa";
  assert.equal((await writeRunManifest(root, manifest("focus", runId))).ok, true);
  await fs.mkdir(path.join(root, "docs", "product"), { recursive: true });
  await fs.mkdir(path.join(root, "docs", "proposals"), { recursive: true });
  await fs.writeFile(path.join(root, "docs", "product", "focus-intent-v1.md"), "# intent\n", "utf8");
  await fs.writeFile(path.join(root, "docs", "proposals", "focus-proposal-v2.md"), "# proposal\n", "utf8");
  const docPath = path.join(root, "docs", "proposals", "focus-proposal-v2.md");
  await append(root, taskEvent("task.created", {
    taskId: "t-worker",
    from: "chief",
    to: "worker",
    text: "worker task body",
    sideEffect: "read-only",
    idempotencyKey: "k-worker",
    flowId: "focus",
    runId,
    runState: "draft",
  }));
  await append(root, taskEvent("task.delivered", { taskId: "t-worker", to: "worker" }));
  await append(root, taskEvent("task.reported", { taskId: "t-worker", from: "worker", status: "blocked", summary: "blocked by missing doc" }));
  await append(root, taskEvent("task.created", {
    taskId: "t-verifier",
    from: "chief",
    to: "verifier",
    text: "verifier task body",
    sideEffect: "read-only",
    idempotencyKey: "k-verifier",
    flowId: "focus",
    runId,
    runState: "draft",
  }));
  await append(root, taskEvent("task.delivered", { taskId: "t-verifier", to: "verifier" }));
  await append(root, taskEvent("task.reported", { taskId: "t-verifier", from: "verifier", status: "failed", summary: "failed evidence" }));
  await append(root, taskEvent("request.created", {
    requestId: "req-pending",
    flowId: "focus",
    cardKind: "acceptance",
    sourceRoleId: "verifier",
    title: "验收卡",
    options: [{ id: "approve", label: "通过" }, { id: "reject", label: "退回" }],
  }));
  await append(root, taskEvent("project.focus", { flowId: "focus", runId, roleId: "chief" }));
  await append(root, taskEvent("project.note", { noteKey: "block-1", noteKind: "blocker", text: "卡在验收证据", active: true, roleId: "chief" }));
  return { runId, docPath };
}

function desktopFor(root: string): { desktop: DesktopInterface; caps: Record<string, Record<string, unknown>>; requests: CustomerInputRequest[] } {
  const caps: Record<string, Record<string, unknown>> = {};
  const requests: CustomerInputRequest[] = [];
  const customerInput: CustomerInputFn = async (request) => {
    requests.push(request);
    return { outcome: "declined", operatorId: "customer" };
  };
  const desktop = createDesktopInterface({
    pickDirectory: async () => null,
    emitEvent: () => {},
    listProjectFn: async () => listing(root),
    buildProjectConfigFn: buildProjectConfig,
    openRoleSessionFn: async (input) => {
      caps[input.roleId] = input as unknown as Record<string, unknown>;
      return handle();
    },
    customerInput,
    envFilePath: path.join(root, ".env"),
    piConfigEnv: {},
    runtimeStatePath: path.join(root, "runtime-selection.json"),
  });
  return { desktop, caps, requests };
}

test("project-state:get：IPC 形状/计数/版本/备注/零写入；空 root 返回空视图+errors", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-project-state-"));
  try {
    const { runId, docPath } = await fixture(root);
    const beforeTask = await sha(path.join(root, ".ans", "state", "tasks.jsonl"));
    const beforeManifest = await sha(path.join(root, ".ans", "runs", runId, "manifest.json"));
    const beforeDoc = await sha(docPath);
    const { desktop } = desktopFor(root);
    const view = await desktop.getProjectState({ projectRoot: root });
    assert.equal(view.schema, "project-state/v1");
    assert.equal(view.projectRoot, root);
    assert.equal(view.focus.flowId, "focus");
    assert.equal(view.focus.runId, runId);
    assert.equal(view.focus.selectedBy, "chief");
    assert.equal(view.flows.find((flow) => flow.flowId === "focus")?.runs[0]?.active, true);
    assert.equal(view.counts.unclosed, 2);
    assert.equal(view.counts.blocked, 1);
    assert.equal(view.counts.failed, 1);
    assert.equal(view.counts.pendingRequests, 1);
    assert.equal(view.truncated, false);
    const tasks = new Map(view.tasks.map((task) => [task.taskId, task]));
    assert.equal(tasks.get("t-worker")?.blocked, true);
    assert.equal(tasks.get("t-worker")?.failed, false);
    assert.equal(tasks.get("t-verifier")?.failed, true);
    assert.equal(tasks.get("t-verifier")?.blocked, false);
    const blockerKinds = new Set(view.blockers.map((blocker) => blocker.kind));
    assert.equal(blockerKinds.has("task-blocked"), true);
    assert.equal(blockerKinds.has("task-failed"), true);
    assert.equal(blockerKinds.has("request-pending"), true);
    assert.equal(blockerKinds.has("chief-note"), true);
    const proposal = view.versions.find((version) => version.flowId === "focus" && version.docKind === "proposal");
    assert.equal(proposal?.latest?.version, 2);
    assert.equal(view.notes.some((note) => note.noteKey === "block-1" && note.kind === "blocker"), true);
    const list = await desktop.listTasks({ projectRoot: root });
    assert.equal(view.counts.unclosed, list.unclosed);
    assert.equal(await sha(path.join(root, ".ans", "state", "tasks.jsonl")), beforeTask);
    assert.equal(await sha(path.join(root, ".ans", "runs", runId, "manifest.json")), beforeManifest);
    assert.equal(await sha(docPath), beforeDoc);
    const stateFiles = await fs.readdir(path.join(root, ".ans", "state"));
    assert.deepEqual(stateFiles.sort(), ["tasks.jsonl"]);
    const empty = await desktop.getProjectState({ projectRoot: "" });
    assert.equal(empty.schema, "project-state/v1");
    assert.equal(empty.counts.unclosed, 0);
    assert.equal(empty.errors.length, 1);
    await desktop.stopSession();
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("project-state:get：chief 完整、convener 裁剪、worker 无 project_state 工具；项目状态工具文本 ≤8 KiB", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-project-state-clip-"));
  try {
    await fixture(root);
    const { desktop, caps } = desktopFor(root);
    await desktop.listProject({ projectRoot: root });
    for (const roleId of ["chief", "convener", "worker"]) {
      const opened = await desktop.openSession({ projectRoot: root, roleId, runtime: "demo" });
      assert.equal(opened.ok, true, `${roleId}: ${opened.ok ? "" : opened.error}`);
    }
    await tick(30);
    const chiefState = caps["chief"]!["projectState"] as ((query: { flowId?: string }) => Promise<{ ok: boolean; text?: string }>) | undefined;
    const convenerState = caps["convener"]!["projectState"] as ((query: { flowId?: string }) => Promise<{ ok: boolean; text?: string }>) | undefined;
    assert.equal(typeof chiefState, "function");
    assert.equal(typeof convenerState, "function", "内置治理角色获得只读 project_state");
    assert.equal(caps["worker"]!["projectState"], undefined, "项目 worker 不注入 project_state");
    const chiefText = await chiefState!({});
    const convenerText = await convenerState!({});
    assert.equal(chiefText.ok, true);
    assert.equal(convenerText.ok, true);
    assert.match(chiefText.text ?? "", /worker task body|#t-worker/);
    assert.doesNotMatch(convenerText.text ?? "", /worker task body|#t-worker/);
    assert.ok(Buffer.byteLength(chiefText.text ?? "", "utf8") <= 8 * 1024);
    await desktop.stopSession();
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("IPC 面：只新增 project-state:get；不注册/不暴露 project:note、version-decision:request 写桥", async () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const main = await fs.readFile(path.join(root, "app", "main.ts"), "utf8");
  const preload = await fs.readFile(path.join(root, "app", "preload.cjs"), "utf8");
  const iface = await fs.readFile(path.join(root, "app", "desktop", "interface.ts"), "utf8");
  assert.ok(main.includes('registerHandler("project-state:get"'), "main 注册 project-state:get");
  assert.ok(!main.includes('registerHandler("project:note"'), "main 不注册 project:note");
  assert.ok(!main.includes('registerHandler("version-decision:request"'), "main 不注册 version-decision:request");
  assert.ok(preload.includes("getProjectState:"), "preload 暴露 getProjectState");
  assert.ok(preload.includes('ipcRenderer.invoke("project-state:get"'), "preload 走 project-state:get");
  assert.ok(!preload.includes("project:note"), "preload 不暴露 project:note");
  assert.ok(!preload.includes("version-decision:request"), "preload 不暴露 version-decision:request");
  assert.ok(iface.includes("getProjectState(input: { projectRoot: string }): Promise<ProjectStateView>"), "Interface 暴露只读 getProjectState");
  assert.ok(!iface.includes("project:note"), "Interface 不定义 note 写 IPC");
  assert.ok(!iface.includes("version-decision:request"), "Interface 不定义 version 写 IPC");
});

test("project_note：set-focus/blocker/next-step 校验、幂等、解除、重启重建；不改任务/run/文档", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-project-note-"));
  const caps: Record<string, Record<string, unknown>> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      caps[input.roleId] = input as unknown as Record<string, unknown>;
      return handle();
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (candidate) => (candidate === root ? listing(root) : undefined),
    emitEvent: () => {},
  });
  try {
    const { runId, docPath } = await fixture(root);
    for (const roleId of ["chief", "convener", "worker"]) {
      const opened = await mgr.open({ projectRoot: root, roleId, runtime: "demo" });
      assert.equal(opened.ok, true);
    }
    const note = caps["chief"]!["projectNote"] as ((input: unknown) => Promise<{ ok: boolean; message: string; at?: string }>) | undefined;
    assert.equal(typeof note, "function");
    assert.equal(caps["convener"]!["projectNote"], undefined);
    assert.equal(caps["worker"]!["projectNote"], undefined);
    const tasksBefore = (await mgr.listTasks(root)).tasks.map((task) => task.taskId).sort();
    const manifestBefore = await sha(path.join(root, ".ans", "runs", runId, "manifest.json"));
    const docBefore = await sha(docPath);

    const focus = await note!({ op: "set-focus", flowId: "focus", runId, note: "当前推进" });
    assert.equal(focus.ok, true);
    const viewAfterFocus = await mgr.projectStateView(root, { full: true });
    assert.equal(viewAfterFocus.focus.flowId, "focus");
    assert.equal(viewAfterFocus.focus.runId, runId);
    assert.equal(viewAfterFocus.focus.selectedBy, "chief");

    const blocker1 = await note!({ op: "blocker", noteKey: "blocker-a", text: "等待验收", active: true, refs: ["docs/proposals/focus-proposal-v2.md"] });
    assert.equal(blocker1.ok, true);
    const blocker2 = await note!({ op: "blocker", noteKey: "blocker-a", text: "等待验收", active: true, refs: ["docs/proposals/focus-proposal-v2.md"] });
    assert.equal(blocker2.ok, true);
    assert.equal(blocker2.at, blocker1.at, "同 key/同文本/同 active 幂等，不重复写事件");
    const ledgerAfterBlocker = (await mgr.listTasks(root)).tasks;
    assert.deepEqual(ledgerAfterBlocker.map((task) => task.taskId).sort(), tasksBefore);
    await note!({ op: "blocker", noteKey: "blocker-a", text: "等待验收", active: false });
    const viewAfterOff = await mgr.projectStateView(root, { full: true });
    assert.equal(viewAfterOff.notes.some((item) => item.noteKey === "blocker-a"), false);
    await note!({ op: "blocker", noteKey: "blocker-a", text: "等待验收", active: false });
    await note!({ op: "next-step", noteKey: "next", text: "先补证据", active: true });
    const viewAfterNext = await mgr.projectStateView(root, { full: true });
    assert.equal(viewAfterNext.nextStep?.text, "先补证据");
    assert.equal(viewAfterNext.nextStep?.source, "chief");

    const missingFlow = await note!({ op: "set-focus", flowId: "missing-flow" });
    assert.equal(missingFlow.ok, false);
    const wrongRun = await note!({ op: "set-focus", flowId: "focus", runId: "run-20261102-other-bbbbbbbb" });
    assert.equal(wrongRun.ok, false);
    const tooLong = await note!({ op: "blocker", noteKey: "blocker-b", text: "x".repeat(501), active: true });
    assert.equal(tooLong.ok, false);
    const tooManyRefs = await note!({ op: "blocker", noteKey: "blocker-c", text: "x", active: true, refs: ["a", "b", "c", "d", "e", "f"] });
    assert.equal(tooManyRefs.ok, false);
    await note!({ op: "set-focus", cleared: true });
    const viewCleared = await mgr.projectStateView(root, { full: true });
    assert.equal(viewCleared.focus.selectedBy, "none");

    const restored = await mgr.restoreTasks(root);
    assert.equal(typeof restored.versionDecisionsReconciled, "number");
    const viewAfterRestore = await mgr.projectStateView(root, { full: true });
    assert.equal(viewAfterRestore.focus.selectedBy, "none");
    assert.equal(viewAfterRestore.notes.some((item) => item.noteKey === "next"), true);
    assert.equal(await sha(path.join(root, ".ans", "runs", runId, "manifest.json")), manifestBefore);
    assert.equal(await sha(docPath), docBefore);
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});
