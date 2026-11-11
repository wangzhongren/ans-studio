// test/编排/project-state.test.ts
// A1（2026-11-02）：全局任务状态派生视图（project-state/v1）纯逻辑。
// 覆盖 AC-1.1–1.8、AC-2.3/2.4、AC-7.3、AC-8.1、R1；并含 A1 修订 V1 的 R1/R2/R3/R4 前置证据。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  TASKS_STATE_REL,
  appendTaskEvent,
  taskEvent,
  readTaskState,
  type TaskCardView,
} from "../../src/common/编排/task-state.ts";
import type { TaskCreatedEvent, TaskReportedEvent } from "../../src/model/runtime.ts";
import {
  buildProjectStateView,
  deriveActiveRunFromManifests,
  renderProjectStateSummary,
  scanRunManifestsForState,
} from "../../src/common/编排/project-state.ts";
import { writeRunManifest, type RunManifest } from "../../src/common/编排/run-manifest.ts";
import type { ProjectStateTask } from "../../src/model/project-state.ts";

type TaskMirror = TaskCardView & {
  from: "chief" | "convener";
  blocked: boolean;
  failed: boolean;
  redispatchCount: number;
};
// A0 `ProjectStateTask` 与 A1 结构镜像双向可赋值（类型级断言；typecheck 校验）。
const _modelToLocal: ProjectStateTask = {} as TaskMirror;
const _localToModel: TaskMirror = {} as ProjectStateTask;
void _modelToLocal;
void _localToModel;

const T0 = "2026-11-02T00:00:00.000Z";

function manifest(flowId: string, runId: string, state: RunManifest["state"] = "draft", createdAt = T0): RunManifest {
  return {
    schema: "ans-run/v1",
    runId,
    flowId,
    state,
    createdAt,
    updatedAt: createdAt,
    schemas: { run: "ans-run/v1" },
    documents: {},
    execution: { teamPlan: null, flow: null },
  };
}

async function writeManifest(root: string, value: RunManifest): Promise<void> {
  const result = await writeRunManifest(root, value);
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
}

async function writeDoc(root: string, rel: string, text = ""): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
}

interface TaskInput {
  taskId: string;
  flowId?: string;
  runId?: string;
  runState?: "draft" | "pinned" | "legacy";
  status?: "blocked" | "failed" | "done";
  targetRoleId?: string;
  text?: string;
  requestedEvidence?: string[];
  modulePaths?: string[];
}

async function addTask(root: string, input: TaskInput): Promise<void> {
  const created: TaskCreatedEvent = {
    v: 1,
    at: T0,
    kind: "task.created",
    taskId: input.taskId,
    from: "chief",
    to: input.targetRoleId ?? "worker",
    text: input.text ?? `任务 ${input.taskId}`,
    sideEffect: "code",
    idempotencyKey: `key-${input.taskId}`,
    ...(input.flowId !== undefined
      ? {
        flowId: input.flowId,
        runId: input.runId ?? "run-20261102-focus-aaaaaaaa",
        runState: input.runState ?? "draft",
      }
      : {}),
    ...(input.requestedEvidence !== undefined ? { requestedEvidence: input.requestedEvidence } : {}),
    ...(input.modulePaths !== undefined ? { modulePaths: input.modulePaths } : {}),
  };
  assert.equal((await appendTaskEvent(root, created)).ok, true);
  if (input.status !== undefined) {
    const reported: TaskReportedEvent = {
      v: 1,
      at: "2026-11-02T00:01:00.000Z",
      kind: "task.reported",
      taskId: input.taskId,
      from: "worker",
      status: input.status,
      summary: input.status,
    };
    assert.equal((await appendTaskEvent(root, reported)).ok, true);
  }
}

async function hashFile(file: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

test("flow 合并/focus：多候选不猜 -c；唯一候选 derived；chief 事件与 cleared 正反例", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-project-state-focus-"));
  try {
    await writeManifest(root, manifest("flow-a", "run-20261102-flow-a-aaaaaaaa"));
    await writeManifest(root, manifest("flow-c", "run-20261102-flow-c-cccccccc"));
    await addTask(root, { taskId: "t-a", flowId: "flow-a", runId: "run-20261102-flow-a-aaaaaaaa" });
    await addTask(root, { taskId: "t-c", flowId: "flow-c", runId: "run-20261102-flow-c-cccccccc" });

    const multi = await buildProjectStateView(root, { now: new Date(T0) });
    assert.equal(multi.focus.selectedBy, "none", "多候选不猜 focus（尤其不选 -c）");
    assert.equal(multi.focus.flowId, undefined);
    assert.deepEqual(multi.flows.map((flow) => flow.flowId).sort(), ["flow-a", "flow-c"]);

    await appendTaskEvent(root, taskEvent("project.focus", {
      flowId: "flow-a",
      runId: "run-20261102-flow-a-aaaaaaaa",
      roleId: "chief",
    }, () => new Date("2026-11-02T00:02:00.000Z")));
    const chief = await buildProjectStateView(root);
    assert.equal(chief.focus.selectedBy, "chief");
    assert.equal(chief.focus.flowId, "flow-a");
    assert.equal(chief.focus.runId, "run-20261102-flow-a-aaaaaaaa");
    assert.equal(chief.focus.runState, "draft");

    await appendTaskEvent(root, taskEvent("project.focus", { cleared: true, roleId: "chief" }, () => new Date("2026-11-02T00:03:00.000Z")));
    const cleared = await buildProjectStateView(root);
    assert.equal(cleared.focus.selectedBy, "none");
    assert.equal(cleared.focus.flowId, undefined, "cleared:true 后不再自动派生");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("focus derived：唯一活动 flow 派生；多活动 run 全部列出且不擅自选 runId", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-project-state-derived-"));
  try {
    await writeManifest(root, manifest("focus", "run-20261102-focus-aaaaaaaa"));
    const derived = await buildProjectStateView(root);
    assert.equal(derived.focus.selectedBy, "derived");
    assert.equal(derived.focus.flowId, "focus");
    assert.equal(derived.focus.runId, "run-20261102-focus-aaaaaaaa");

    await writeManifest(root, manifest("focus", "run-20261102-focus-bbbbbbbb", "draft", "2026-11-02T00:01:00.000Z"));
    const multi = await buildProjectStateView(root);
    assert.equal(multi.focus.selectedBy, "derived");
    assert.equal(multi.focus.flowId, "focus");
    assert.equal(multi.focus.runId, undefined, "多个活动 run 时不擅自选 runId");
    assert.equal(multi.flows[0]!.runs.length, 2);
    assert.equal(multi.flows[0]!.runs.every((run) => run.active), true);
    assert.equal(multi.blockers.some((blocker) => blocker.kind === "run-ambiguous"), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("AC-1：坏账本行数准确进 errors；可读任务照常返回（不阻塞）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-project-state-bad-lines-"));
  try {
    await writeManifest(root, manifest("focus", "run-20261102-focus-aaaaaaaa"));
    const good = taskEvent("task.created", {
      taskId: "t-good",
      from: "chief",
      to: "worker",
      text: "好任务",
      sideEffect: "code",
      idempotencyKey: "key-good",
      flowId: "focus",
      runId: "run-20261102-focus-aaaaaaaa",
      runState: "draft",
    }, () => new Date(T0));
    const stateFile = path.join(root, ...TASKS_STATE_REL.split("/"));
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(
      stateFile,
      `${JSON.stringify(good)}\n{broken json\n${JSON.stringify({ v: 1, at: T0, kind: "unknown.kind" })}\n`,
      "utf8",
    );
    const view = await buildProjectStateView(root);
    const taskErrors = view.errors.filter((error) => error.source === "tasks");
    assert.equal(taskErrors.length, 2, JSON.stringify(taskErrors));
    assert.equal(taskErrors.every((error) => error.line !== undefined && error.line > 0), true);
    assert.deepEqual(view.tasks.map((task) => task.taskId), ["t-good"]);
    assert.equal(view.counts.tasks, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("R1：1 坏 + 1 好 manifest → 好 flow active 正确、errors 精确；源码不调用 all-or-nothing API", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-project-state-r1-"));
  try {
    await writeManifest(root, manifest("good", "run-20261102-good-aaaaaaaa"));
    const badId = "run-20261102-broken-bbbbbbbb";
    const badFile = path.join(root, ".ans", "runs", badId, "manifest.json");
    await fs.mkdir(path.dirname(badFile), { recursive: true });
    await fs.writeFile(badFile, "{not-json\n", "utf8");

    const scan = await scanRunManifestsForState(root);
    assert.equal(scan.manifests.length, 1);
    assert.equal(scan.manifests[0]!.flowId, "good");
    assert.equal(scan.errors.length, 1);
    assert.equal(scan.errors[0]!.source, "run-manifest");

    const view = await buildProjectStateView(root);
    const good = view.flows.find((flow) => flow.flowId === "good");
    assert.ok(good !== undefined);
    assert.equal(good!.runs.length, 1);
    assert.equal(good!.runs[0]!.active, true);
    assert.equal(view.errors.filter((error) => error.source === "run-manifest").length, 1);
    assert.equal(view.truncated, false);

    const derived = deriveActiveRunFromManifests(scan.manifests, "good");
    assert.equal(derived.active?.runId, "run-20261102-good-aaaaaaaa");
    assert.equal(derived.conflict, undefined);

    const source = await fs.readFile(path.join(process.cwd(), "src", "common", "编排", "project-state.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.equal(code.includes("findActiveRun"), false, "project-state.ts 不得调用 findActiveRun");
    assert.equal(code.includes("listRunManifestsResult"), false, "project-state.ts 不得调用 listRunManifestsResult");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("tasks/blockers/counts：blocked/failed 分离、rework-pending 机器事实、request-pending、redispatch、chief-note", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-project-state-blockers-"));
  try {
    await writeManifest(root, manifest("focus", "run-20261102-focus-aaaaaaaa"));
    await addTask(root, { taskId: "t-blocked", flowId: "focus", runId: "run-20261102-focus-aaaaaaaa", status: "blocked" });
    await addTask(root, { taskId: "t-failed", flowId: "focus", runId: "run-20261102-focus-aaaaaaaa", status: "failed" });
    await addTask(root, { taskId: "t-rework", flowId: "focus", runId: "run-20261102-focus-aaaaaaaa", status: "done" });
    await appendTaskEvent(root, taskEvent("task.closed", {
      taskId: "t-rework",
      by: "chief",
      outcome: "rework",
    }, () => new Date("2026-11-02T00:02:00.000Z")));
    await addTask(root, { taskId: "t-open", flowId: "focus", runId: "run-20261102-focus-aaaaaaaa" });

    // 重派链 2 次
    await appendTaskEvent(root, taskEvent("task.redispatch", { taskId: "t-open-r1", retryOf: "t-open", to: "worker", reason: "stuck", safety: "safe" }, () => new Date("2026-11-02T00:03:00.000Z")));
    await addTask(root, { taskId: "t-open-r1", flowId: "focus", runId: "run-20261102-focus-aaaaaaaa" });
    await appendTaskEvent(root, taskEvent("task.redispatch", { taskId: "t-open-r2", retryOf: "t-open-r1", to: "worker", reason: "stuck", safety: "safe" }, () => new Date("2026-11-02T00:04:00.000Z")));
    await addTask(root, { taskId: "t-open-r2", flowId: "focus", runId: "run-20261102-focus-aaaaaaaa" });

    await appendTaskEvent(root, taskEvent("request.created", {
      requestId: "req-acc",
      flowId: "focus",
      cardKind: "acceptance",
      sourceRoleId: "verifier",
      title: "验收卡",
      options: [{ id: "accept", label: "接受" }, { id: "reject", label: "退回" }],
    }, () => new Date("2026-11-02T00:05:00.000Z")));
    await appendTaskEvent(root, taskEvent("request.resolved", {
      requestId: "req-acc",
      cardKind: "acceptance",
      selectedOptionIds: ["reject"],
      by: "customer",
      choice: "reject",
    }, () => new Date("2026-11-02T00:06:00.000Z")));
    await appendTaskEvent(root, taskEvent("request.created", {
      requestId: "req-pending",
      flowId: "focus",
      cardKind: "decision",
      sourceRoleId: "convener",
      title: "待决申请",
      options: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    }, () => new Date("2026-11-02T00:07:00.000Z")));
    await appendTaskEvent(root, taskEvent("project.note", {
      noteKey: "blocker-1",
      noteKind: "blocker",
      text: "幕僚阻塞备注",
      active: true,
      roleId: "chief",
    }, () => new Date("2026-11-02T00:08:00.000Z")));

    const state = await readTaskState(root);
    const view = await buildProjectStateView(root);
    const kinds = new Set(view.blockers.map((blocker) => blocker.kind));
    for (const kind of ["task-blocked", "task-failed", "rework-pending", "request-pending", "redispatch-exhausted", "chief-note"] as const) {
      assert.equal(kinds.has(kind), true, `缺 blocker kind：${kind}`);
    }
    const blocked = view.tasks.find((task) => task.taskId === "t-blocked");
    const failed = view.tasks.find((task) => task.taskId === "t-failed");
    assert.equal(blocked?.blocked, true);
    assert.equal(blocked?.failed, false);
    assert.equal(failed?.failed, true);
    assert.equal(failed?.blocked, false);
    assert.equal(view.counts.unclosed, state.unclosed.length);
    assert.equal(view.counts.activeUnclosed, state.unclosed.length);
    assert.equal(view.counts.supersededUnclosed, 0);
    assert.equal(view.counts.blocked, 1, "blocked/failed 不合并");
    assert.equal(view.counts.failed, 1);
    const rework = view.blockers.find((blocker) => blocker.kind === "rework-pending");
    assert.match(rework?.summary ?? "", /acceptance reject 1 次/);
    assert.match(rework?.summary ?? "", /不推断未收口返工任务/);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("versions/evidence/零写入：latest vs pinned/newerThanPinned；evidence 仅 present/missing；读前后哈希不变", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-project-state-versions-"));
  try {
    const pinned = manifest("focus", "run-20261102-focus-aaaaaaaa", "pinned");
    pinned.documents = {
      intent: { path: "docs/product/focus-intent-v1.md", sha256: "a".repeat(64) },
      proposal: { path: "docs/proposals/focus-proposal-v1.md", sha256: "b".repeat(64) },
      modules: null,
      roster: null,
      topology: null,
      architecture: null,
      assets: null,
    };
    await writeManifest(root, pinned);
    await writeDoc(root, "docs/product/focus-intent-v1.md", "intent");
    await writeDoc(root, "docs/proposals/focus-proposal-v1.md", "proposal v1");
    await writeDoc(root, "docs/proposals/focus-proposal-v2.md", "proposal v2");
    await writeDoc(root, "docs/quality/focus-report-v1.md", "report");
    await addTask(root, {
      taskId: "t-evidence",
      flowId: "focus",
      runId: "run-20261102-focus-aaaaaaaa",
      requestedEvidence: ["docs/quality/focus-report-v1.md", "docs/missing-evidence.md"],
    });
    await appendTaskEvent(root, taskEvent("request.created", {
      requestId: "req-acc-2",
      flowId: "focus",
      cardKind: "acceptance",
      sourceRoleId: "verifier",
      title: "验收卡 2",
      options: [{ id: "accept", label: "接受" }, { id: "reject", label: "退回" }],
    }, () => new Date("2026-11-02T00:05:00.000Z")));

    const taskFile = path.join(root, ...TASKS_STATE_REL.split("/"));
    const manifestFile = path.join(root, ".ans", "runs", pinned.runId, "manifest.json");
    const docFile = path.join(root, "docs", "proposals", "focus-proposal-v1.md");
    const before = { tasks: await hashFile(taskFile), manifest: await hashFile(manifestFile), doc: await hashFile(docFile) };
    const stateNamesBefore = (await fs.readdir(path.join(root, ".ans", "state"))).sort();

    const view = await buildProjectStateView(root);
    const proposal = view.versions.find((version) => version.docKind === "proposal");
    assert.equal(proposal?.latest?.version, 2);
    assert.equal(proposal?.pinned?.version, 1);
    assert.equal(proposal?.newerThanPinned, true);
    const intent = view.versions.find((version) => version.docKind === "intent");
    assert.equal(intent?.latest?.version, 1);
    assert.equal(intent?.pinned?.version, 1);
    assert.equal(intent?.newerThanPinned, false);
    const missing = view.versions.find((version) => version.docKind === "modules");
    assert.equal(missing?.latest, undefined, "缺失文档 latest:undefined，不误报 reference-invalid");
    assert.equal(missing?.referenceIssue, undefined);

    // B23.1：文本投影 [versions] 行必须携带应用按真实字节计算的 sha256（有则输出、无则 none），
    // 供 fixed convener 写团队计划 modules/roster 字段时直接读取，不再用 shell/certutil 自算。
    const summary = renderProjectStateSummary(view);
    const proposalLine = summary.split("\n").find((line) => line.includes("kind=proposal"));
    const expectedProposalSha = await hashFile(path.join(root, "docs", "proposals", "focus-proposal-v2.md"));
    assert.equal(
      proposalLine?.includes(`latest=2 path=docs/proposals/focus-proposal-v2.md sha256=${expectedProposalSha}`),
      true,
      `proposal 行缺真实 sha256：${proposalLine ?? "<missing>"}`,
    );
    const modulesLine = summary.split("\n").find((line) => line.includes("kind=modules"));
    assert.match(modulesLine ?? "", /latest=none path=none sha256=none/, "缺失文档 sha256 输出 none（不猜 hash）");

    const evidenceStatuses = view.evidence.map((item) => `${item.kind}:${item.status}`);
    assert.equal(evidenceStatuses.includes("verifier-report:present"), true);
    assert.equal(evidenceStatuses.includes("task-evidence:present"), true);
    assert.equal(evidenceStatuses.includes("task-evidence:missing"), true);
    assert.equal(evidenceStatuses.includes("acceptance-card:present"), true);
    assert.equal(view.evidence.every((item) => item.status === "present" || item.status === "missing"), true);

    const after = { tasks: await hashFile(taskFile), manifest: await hashFile(manifestFile), doc: await hashFile(docFile) };
    assert.deepEqual(after, before, "读取零写入");
    const stateNamesAfter = (await fs.readdir(path.join(root, ".ans", "state"))).sort();
    assert.deepEqual(stateNamesAfter, stateNamesBefore, "不产生第二状态文件");
    assert.equal(stateNamesAfter.some((name) => /^project.*\.json$/.test(name)), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("notes/nextStep/角色裁剪：chief 备注优先；其他角色只见自己的任务，不见他人正文", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-project-state-trim-"));
  try {
    await writeManifest(root, manifest("focus", "run-20261102-focus-aaaaaaaa"));
    await addTask(root, { taskId: "t-worker-a", flowId: "focus", runId: "run-20261102-focus-aaaaaaaa", targetRoleId: "worker-a", text: "A 的正文" });
    await addTask(root, { taskId: "t-worker-b", flowId: "focus", runId: "run-20261102-focus-aaaaaaaa", targetRoleId: "worker-b", text: "B 的正文" });
    await appendTaskEvent(root, taskEvent("project.note", {
      noteKey: "next-step",
      noteKind: "next-step",
      text: "先修复验收证据",
      active: true,
      roleId: "chief",
    }, () => new Date("2026-11-02T00:02:00.000Z")));

    const full = await buildProjectStateView(root);
    assert.equal(full.nextStep?.source, "chief");
    assert.equal(full.nextStep?.text, "先修复验收证据");
    assert.equal(full.tasks.length, 2);

    const trimmed = await buildProjectStateView(root, { roleId: "worker-a" });
    assert.deepEqual(trimmed.tasks.map((task) => task.taskId), ["t-worker-a"]);
    assert.equal(trimmed.tasks.some((task) => task.text === "B 的正文"), false);
    assert.equal(trimmed.notes.length, 0, "其他角色不拿幕僚私有备注全文");
    assert.equal(trimmed.nextStep?.text, "先修复验收证据", "公开下一步可见");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("有界/truncated：50/500/20/50 可覆盖测试（小上限）且计数保留；工具文本 ≤8 KiB", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-project-state-bounds-"));
  try {
    await writeManifest(root, manifest("flow-a", "run-20261102-flow-a-aaaaaaaa"));
    await writeManifest(root, manifest("flow-b", "run-20261102-flow-b-bbbbbbbb"));
    await addTask(root, { taskId: "t-1", flowId: "flow-a", runId: "run-20261102-flow-a-aaaaaaaa" });
    await addTask(root, { taskId: "t-2", flowId: "flow-b", runId: "run-20261102-flow-b-bbbbbbbb" });
    const view = await buildProjectStateView(root, { limits: { flows: 1, tasks: 1, versionsPerFlow: 1, evidence: 1 } });
    assert.equal(view.truncated, true);
    assert.equal(view.flows.length, 1);
    assert.equal(view.tasks.length, 1);
    assert.equal(view.counts.flows, 2);
    assert.equal(view.counts.tasks, 2);
    const summary = renderProjectStateSummary(view);
    assert.ok(Buffer.byteLength(summary, "utf8") <= 8 * 1024);
    assert.match(summary, /truncated/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("AC-8：轮转丢失 focus 事件后回退 derived/none（不伪造 focus）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-project-state-rotation-"));
  const oldMax = process.env.ANS_TASKS_MAX_BYTES;
  const oldRot = process.env.ANS_TASKS_ROTATIONS;
  try {
    process.env.ANS_TASKS_MAX_BYTES = "200";
    process.env.ANS_TASKS_ROTATIONS = "1";
    await writeManifest(root, manifest("focus", "run-20261102-focus-aaaaaaaa"));
    const stateDir = path.join(root, ".ans", "state");
    await fs.mkdir(stateDir, { recursive: true });
    // 最旧文件（.2）不会被 rotations=1 读取；模拟 focus 事件被轮转删除。
    await fs.writeFile(path.join(stateDir, "tasks.jsonl.2"), `${JSON.stringify(taskEvent("project.focus", { flowId: "focus", roleId: "chief" }))}\n`, "utf8");
    await fs.writeFile(path.join(stateDir, "tasks.jsonl"), "", "utf8");
    const derived = await buildProjectStateView(root);
    assert.equal(derived.focus.selectedBy, "derived");
    assert.equal(derived.focus.flowId, "focus");

    await writeManifest(root, manifest("other", "run-20261102-other-bbbbbbbb"));
    const none = await buildProjectStateView(root);
    assert.equal(none.focus.selectedBy, "none");
    assert.equal(none.focus.flowId, undefined);
  } finally {
    if (oldMax === undefined) delete process.env.ANS_TASKS_MAX_BYTES; else process.env.ANS_TASKS_MAX_BYTES = oldMax;
    if (oldRot === undefined) delete process.env.ANS_TASKS_ROTATIONS; else process.env.ANS_TASKS_ROTATIONS = oldRot;
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});
