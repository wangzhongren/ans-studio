import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { readWorkflowLedger } from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import type { TaskStateEvent } from "../../src/model/runtime.ts";
import { SIX_ROLES, ScriptBudget, emptyProjectDriver, inspectWaits, scriptedInference, type ScriptTurn, type SixRoleScripts } from "./direct-role-capabilities-driver.ts";

const emptyScripts = (): SixRoleScripts => ({ chief: [], product: [], rapporteur: [], nominator: [], convener: [], verifier: [] });

test("Q driver: legal external waits stay distinct from orphan/circular waits; repeated facts exhaust a fixed budget", () => {
  const external = inspectWaits([{ waiter: "product", resolver: "test-customer", event: "actual-request-response", external: true }]);
  assert.equal(external.cycles.length, 0); assert.equal(external.orphan.length, 0); assert.equal(external.external.length, 1);
  assert.ok(inspectWaits([{ waiter: "worker", resolver: "chief", event: "decision", external: false },
    { waiter: "chief", resolver: "worker", event: "report", external: false }]).cycles.length > 0);
  assert.equal(inspectWaits([{ waiter: "worker", resolver: null, event: "no-owner", external: false }]).orphan.length, 1);
  let now = 0; const budget = new ScriptBudget({ steps: 2, timeoutMs: 10, repeatedFingerprint: 1 }, () => now);
  budget.fingerprint({ actualTask: "pending" });
  assert.throws(() => budget.fingerprint({ actualTask: "pending" }), /NO_PROGRESS/);
  budget.step("chief", "dispatch"); budget.step("product", "read");
  assert.throws(() => budget.step("chief", "auto-increase-budget"), /SCRIPT_BUDGET_EXHAUSTED/);
  const timed = new ScriptBudget({ steps: 2, timeoutMs: 1, repeatedFingerprint: 1 }, () => now);
  now = 11; assert.throws(() => timed.step("chief", "late"), /SCRIPT_BUDGET_EXHAUSTED/);
});

test("Q six-identity driver opens real sessions from an empty project; unknown scripts never fall back to SDK", { timeout: 15000 }, async () => {
  const scripts = emptyScripts();
  scripts.chief = [async turn => { assert.equal(turn.roleId, "chief"); assert.ok(turn.toolNames.includes("dispatch_task"));
    const read = await turn.call("list_dir", { path: "." }); assert.equal(read.ok, true, read.message); }];
  const driver = await emptyProjectDriver(scripts);
  try {
    assert.deepEqual([...driver.inference.seen].sort(), [...SIX_ROLES].sort(), "All identities are real resolved roles, not six copies of one fake role");
    await assert.rejects(fs.access(path.join(driver.root, ".ans/project.json")), "No accepted configuration prefill");
    await assert.rejects(fs.access(path.join(driver.root, "角色卡")), "No role documents prefill");
    await assert.rejects(fs.access(path.join(driver.root, "docs/workflow.md")), "No workflow prefill");
    const actual = await driver.observe(); assert.equal("unavailable" in actual.trunk, true); assert.deepEqual(actual.tasks, []);
    await driver.start("读取当前空项目，不建状态");
    assert.deepEqual(driver.inference.errors, []);
    assert.throws(() => driver.respond("invented-request", { kind: "choice", selected: ["confirm"] }), /actual presented request/);
    await assert.rejects(driver.start("没有第二轮脚本必须失败"), /UNSCRIPTED_TURN/);
  } finally { await driver.dispose(); }
});

test("Q normal-new fixed chain: chief A1 stage-request -> convener/product A2 intent -> A3 customer confirm; no trunk/doc-freeze", { timeout: 60000 }, async () => {
  // 2026-11-16（B7 前置收尾批）：旧 legacy 早链（先写 docs/intents、legacy intent-confirm、产品后补意图、
  // 期望 legacy doc-freeze）已被 2026-11-10「两条固定工作流路径」取代。按当前有意语义重写为真实
  // fixed A1→A2→A3 链：A1 幕僚 stage-request→运营派产品；A2 产品写真实意图 doc、运营收口完成；
  // A3 幕僚写 docs/intents 入口并呈 intent-confirm 卡，客户 confirm 后 finalizeIntent 完成——
  // **不写 trunk/run/CAS/doc-freeze**。断言按当前语义逐字钉住，不放宽。
  const scripts = emptyScripts();
  let rootRef = "";
  let a1StageRequestTaskId = "";
  let a2StageRequestTaskId = "";
  const productTaskStage = new Map<string, "A1" | "A2">();
  const taskIdOf = (message: string): string => {
    const match = /任务编号：#([A-Za-z0-9-]+)/.exec(message);
    assert.ok(match, `派发回执必须包含真实任务号：${message}`);
    return match![1]!;
  };
  const handbackTaskId = (text: string): string | undefined =>
    /任务：#([A-Za-z0-9-]+)/.exec(text)?.[1] ?? /任务 ([A-Za-z0-9-]+)/.exec(text)?.[1];
  const chainView = async () => {
    const ledger = await readWorkflowLedger(rootRef);
    const tasks = await readTaskState(rootRef);
    const started = ledger.events.find((event) => event.kind === "workflow.started");
    if (started === undefined) return undefined;
    return deriveWorkflowView(ledger.events.filter((event) => event.workflowId === started.workflowId), tasks.events);
  };

  scripts.chief = [async turn => {
    const dispatched = await turn.call("dispatch_task", { roleId: "convener", task: "推进 A1：请运营派产品受理意图撰写请求。",
      flowId: "direct-e2e", taskKind: "stage-request", workflowPath: "A", stage: "A1", workflowAction: "advance", sideEffect: "read-only" });
    assert.equal(dispatched.ok, true, `Q1_FIXED_A1 chief stage-request: ${dispatched.message}`);
    a1StageRequestTaskId = taskIdOf(dispatched.message);
  }, async turn => {
    assert.equal(handbackTaskId(turn.text), a1StageRequestTaskId, `A1 stage-request 回交来源必须匹配：${turn.text}`);
    const closed = await turn.call("close_created_task", { operationId: "q-fixed-close-a1-stage-request", taskId: a1StageRequestTaskId, outcome: "accepted", note: "A1 请求受理完成" });
    assert.equal(closed.ok, true, `Q1_FIXED_A1 chief close stage-request: ${closed.message}`);
    const dispatched = await turn.call("dispatch_task", { roleId: "convener", task: "推进 A2：产品撰写意图 docs/product/direct-e2e-intent-v1.md。",
      flowId: "direct-e2e", taskKind: "stage-request", workflowPath: "A", stage: "A2", workflowAction: "advance", sideEffect: "read-only" });
    assert.equal(dispatched.ok, true, `Q1_FIXED_A2 chief stage-request: ${dispatched.message}`);
    a2StageRequestTaskId = taskIdOf(dispatched.message);
  }, async turn => {
    assert.equal(handbackTaskId(turn.text), a2StageRequestTaskId, `A2 stage-request 回交来源必须匹配：${turn.text}`);
    // 幕僚等待真实运营把 A2 收口完成（产品意图 doc 经报告证据 + 收口 ⇒ stage.completed A2）。
    await turn.wait("workflow A2 completed", "convener", async () => (await chainView())?.stages.A2.status === "completed" ? true : undefined);
    const view = await chainView();
    assert.ok(view);
    assert.equal(view!.stages.A1.status, "completed", "A1 完成于真实产品任务创建（stage.dispatched）");
    assert.equal(view!.stages.A2.status, "completed", "A2 完成于真实产品意图 doc + 运营 accepted 收口");
    const closed = await turn.call("close_created_task", { operationId: "q-fixed-close-a2-stage-request", taskId: a2StageRequestTaskId, outcome: "accepted", note: "A2 完成" });
    assert.equal(closed.ok, true, `Q1_FIXED_A2 chief close stage-request: ${closed.message}`);
    const entry = await turn.call("write_file", { path: "docs/intents/direct-e2e.md", content:
      "---\nschema: project-intent-entry/v1\nintentId: direct-e2e\nflowId: direct-e2e\nversion: 1\n---\n# 意图入口\n\n有界本地示例。\n" });
    assert.equal(entry.ok, true, `Q1_FIXED_A3 chief intent entry: ${entry.message}`);
    const confirmed = await turn.call("request_choice", { title: "确认本轮意图", question: "建立有界本地示例？", cardKind: "intent-confirm",
      flowId: "direct-e2e", intentId: "direct-e2e", options: [{ id: "confirm", label: "确认", recommended: true }, { id: "revise", label: "修订" }] });
    assert.equal(confirmed.ok, true, `Q1_FIXED_A3 real intent-confirm tool: ${confirmed.message}`);
  }];

  const convenerHandle = async (turn: ScriptTurn): Promise<void> => {
    const text = turn.text;
    if (text.startsWith("[工作结果]") || text.startsWith("[回交]")) {
      const taskId = handbackTaskId(text);
      assert.ok(taskId, `运营回交必须携带真实任务号：${text}`);
      const stage = productTaskStage.get(taskId!);
      assert.ok(stage, `运营只收口自己派发的产品任务（收到 ${taskId}）`);
      const closed = await turn.call("close_created_task", { operationId: `q-fixed-convener-close-${stage!.toLowerCase()}-product`, taskId: taskId!, outcome: "accepted",
        note: stage === "A2" ? "产品意图完成" : "A1 受理完成" });
      assert.equal(closed.ok, true, `Q1_FIXED_${stage} convener close product: ${closed.message}`);
      return;
    }
    if (text.includes("推进 A1")) {
      const dispatched = await turn.call("dispatch_task", { roleId: "product", task: "A1 受理：准备产品意图撰写（本阶段不写意图文档）。",
        flowId: "direct-e2e", stage: "A1", sideEffect: "docs" });
      assert.equal(dispatched.ok, true, `Q1_FIXED_A1 convener product dispatch: ${dispatched.message}`);
      productTaskStage.set(taskIdOf(dispatched.message), "A1");
      const report = await turn.call("submit_report", { status: "completed", summary: "A1 生产任务已派发；等待产品回交。" });
      assert.equal(report.ok, true, `Q1_FIXED_A1 convener report: ${report.message}`);
      return;
    }
    if (text.includes("推进 A2")) {
      const dispatched = await turn.call("dispatch_task", { roleId: "product", task: "撰写产品意图 docs/product/direct-e2e-intent-v1.md 并报告实际路径；不得伪造确认。",
        flowId: "direct-e2e", stage: "A2", sideEffect: "docs", expectedOutput: "docs/product/direct-e2e-intent-v1.md" });
      assert.equal(dispatched.ok, true, `Q1_FIXED_A2 convener product dispatch: ${dispatched.message}`);
      productTaskStage.set(taskIdOf(dispatched.message), "A2");
      const report = await turn.call("submit_report", { status: "completed", summary: "A2 产品任务已派发；等待产品回交。" });
      assert.equal(report.ok, true, `Q1_FIXED_A2 convener report: ${report.message}`);
      return;
    }
    throw new Error(`UNEXPECTED_CONVENER_TURN ${text}`);
  };
  scripts.convener = [convenerHandle, convenerHandle, convenerHandle, convenerHandle, convenerHandle];

  const productHandle = async (turn: ScriptTurn): Promise<void> => {
    if (turn.text.includes("A1 受理")) {
      const report = await turn.call("submit_report", { status: "completed", summary: "A1 受理完成：等待 A2 派发撰写意图，本阶段不写意图文档。" });
      assert.equal(report.ok, true, `Q1_FIXED_A1 product report: ${report.message}`);
      return;
    }
    if (turn.text.includes("docs/product/direct-e2e-intent-v1.md")) {
      const wrote = await turn.call("write_file", { path: "docs/product/direct-e2e-intent-v1.md", content:
        "---\nschema: project-intent/v1\nflowId: direct-e2e\nintentId: direct-e2e\nversion: 1\n---\n# Bounded local example\nOnly one local worker output.\n" });
      assert.equal(wrote.ok, true, `Q1_FIXED_A2 product intent write: ${wrote.message}`);
      const report = await turn.call("submit_report", { status: "completed", summary: "已落盘产品意图 docs/product/direct-e2e-intent-v1.md；等待合法直接规划首建，不代表授权或验收。",
        evidence: ["docs/product/direct-e2e-intent-v1.md"] });
      assert.equal(report.ok, true, `Q1_FIXED_A2 product report: ${report.message}`);
      return;
    }
    throw new Error(`UNEXPECTED_PRODUCT_TURN ${turn.text}`);
  };
  scripts.product = [productHandle, productHandle, productHandle];

  const driver = await emptyProjectDriver(scripts, { steps: 200, timeoutMs: 20000, repeatedFingerprint: 3 });
  rootRef = driver.root;
  let start: Promise<unknown> | undefined;
  try {
    start = driver.start("建立有界本地示例"); void start.catch(() => undefined);
    await driver.budget.bounded("real fixed A3 intent request", async signal => {
      for (;;) {
        if (driver.inference.errors.length) throw new Error(driver.inference.errors.join("\n"));
        const card = [...driver.pending.values()].find(p => p.request.cardKind === "intent-confirm");
        if (card) { assert.equal(driver.respond(card.id, { kind: "choice", selected: ["confirm"] }).ok, true); return; }
        signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    await driver.budget.bounded("real fixed A3 completion", async signal => {
      for (;;) {
        if (driver.inference.errors.length) throw new Error(driver.inference.errors.join("\n"));
        const view = await chainView();
        if (view?.stages.A3.status === "completed") return;
        signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    await start;

    // 真实 fixed A1→A2→A3 链的事实断言。
    const view = await chainView();
    assert.ok(view, "必须存在真实 workflow.started");
    assert.equal(view!.path, "A");
    assert.equal(view!.stages.A1.status, "completed");
    assert.equal(view!.stages.A2.status, "completed");
    assert.equal(view!.stages.A3.status, "completed", "客户 confirm 后 finalizeIntent 完成 A3");
    const state = await readTaskState(driver.root);
    const intentCreated = state.events.find((event) => event.kind === "request.created" && event.cardKind === "intent-confirm");
    assert.ok(intentCreated !== undefined && intentCreated.kind === "request.created", "A3 卡必须是应用真实 request.created");
    const intentRef = intentCreated!.documentRefs?.find((ref) => ref.kind === "intent");
    assert.ok(intentRef, "A3 卡必须携带应用计算的 documentRefs[intent]");
    assert.equal(intentRef!.path, "docs/product/direct-e2e-intent-v1.md");
    const intentBytes = await fs.readFile(path.join(driver.root, "docs/product/direct-e2e-intent-v1.md"));
    assert.equal(intentRef!.sha256, createHash("sha256").update(intentBytes).digest("hex"), "intent 引用必须绑定真实字节 hash");
    const entryText = await fs.readFile(path.join(driver.root, "docs/intents/direct-e2e.md"), "utf8");
    assert.match(entryText, /intentId: direct-e2e/);
    const productReports = state.events.filter(
      (event): event is Extract<TaskStateEvent, { kind: "task.reported" }> => event.kind === "task.reported" && event.from === "product",
    );
    assert.ok(productReports.some((event) => event.evidence?.includes("docs/product/direct-e2e-intent-v1.md")), "产品意图必须经真实报告关联");
    assert.equal(driver.customerTrace.length, 1);
    // A3/fixed 路径不写 legacy trunk/run/CAS/doc-freeze。
    await assert.rejects(fs.stat(path.join(driver.root, ".ans", "trunk")), "fixed A3 不得写 .ans/trunk");
    await assert.rejects(fs.stat(path.join(driver.root, ".ans", "runs")), "fixed A3 不得写 .ans/runs");
    await assert.rejects(fs.stat(path.join(driver.root, ".ans", "state", "doc-freezes.json")), "fixed A3 不得写 doc-freeze 缓存");
  } finally {
    console.log("Q1_FIXED_CHAIN", JSON.stringify({ root: driver.root, trace: driver.budget.trace, observation: await driver.observe(), customer: driver.customerTrace, errors: driver.inference.errors }));
    await driver.dispose(); await start?.catch(() => undefined);
  }
});

// Required later scenarios consume this same real driver after O/G/W APIs are ready:
// null-CAS planning publication; D3 -> zero-file draft writes -> complete activation -> dispatch;
// recreate an old-run session after live edits; all run modes; creator close/dependency release;
// post-CAS restart/supersede facts; real environment repair; independent chief while main waits;
// off/on/CAS/@directive/revise -> returned promise -> actual author write -> new real request.
// No placeholder test is declared passed for these still-uncovered scenarios.
