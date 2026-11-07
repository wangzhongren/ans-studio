import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { SIX_ROLES, ScriptBudget, emptyProjectDriver, inspectWaits, scriptedInference, type SixRoleScripts } from "./direct-role-capabilities-driver.ts";

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

test("Q normal-new early chain: actual chief customer request -> formal product dispatch -> product write/report; no seeded freeze", { timeout: 20000 }, async () => {
  const scripts = emptyScripts();
  scripts.chief = [async turn => {
    const wrote = await turn.call("write_file", { path: "docs/intents/direct-e2e.md", content:
      "---\nschema: project-intent-entry/v1\nintentId: direct-e2e\nflowId: direct-e2e\nversion: 1\n---\n# Build a bounded local example\nGoal: implement one local worker output.\n" });
    assert.equal(wrote.ok, true, `Q1_FIRST_BLOCK chief intent write: ${wrote.message}`);
    const confirmed = await turn.call("request_choice", { title: "确认本轮意图", question: "建立有界本地示例？", cardKind: "intent-confirm",
      flowId: "direct-e2e", intentId: "direct-e2e", options: [{ id: "confirm", label: "确认", recommended: true }, { id: "revise", label: "修订" }] });
    assert.equal(confirmed.ok, true, `Q1_FIRST_BLOCK real intent-confirm tool: ${confirmed.message}`);
    const dispatched = await turn.call("dispatch_task", { roleId: "product", task: "读取 docs/intents/direct-e2e.md，写 docs/product/direct-e2e-intent-v1.md，报告实际路径；不得伪造确认。",
      sideEffect: "docs", expectedOutput: "docs/product/direct-e2e-intent-v1.md", idempotencyKey: "q-empty-product-1" });
    assert.equal(dispatched.ok, true, `Q1_FIRST_BLOCK actual product dispatch: ${dispatched.message}`);
  }, async () => { /* Production handback arrives in a distinct actual chief turn. No fake close. */ }];
  scripts.product = [async turn => {
    const wrote = await turn.call("write_file", { path: "docs/product/direct-e2e-intent-v1.md", content:
      "---\nschema: project-intent/v1\nflowId: direct-e2e\nintentId: direct-e2e\nversion: 1\n---\n# Bounded local example\nOnly one local worker output.\n" });
    assert.equal(wrote.ok, true, `Q1_FIRST_BLOCK product intent write: ${wrote.message}`);
    const report = await turn.call("submit_report", { status: "completed", summary: "已落盘产品意图 docs/product/direct-e2e-intent-v1.md；等待合法直接规划首建，不代表授权或验收。", evidence: ["docs/product/direct-e2e-intent-v1.md"] });
    assert.equal(report.ok, true, `Q1_FIRST_BLOCK production report: ${report.message}`);
  }];
  const driver = await emptyProjectDriver(scripts, { steps: 80, timeoutMs: 5000, repeatedFingerprint: 3 });
  let start: Promise<unknown> | undefined;
  try {
    start = driver.start("建立有界本地示例"); void start.catch(() => undefined);
    await driver.budget.bounded("real intent request or explicit source blocker", async signal => {
      for (;;) {
        if (driver.inference.errors.length) throw new Error(driver.inference.errors.join("\n"));
        const card = [...driver.pending.values()].find(p => p.request.cardKind === "intent-confirm");
        if (card) { assert.equal(driver.respond(card.id, { kind: "choice", selected: ["confirm"] }).ok, true); return; }
        signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    await start;
    await driver.budget.bounded("real product report", async signal => {
      for (;;) {
        if (driver.inference.errors.length) throw new Error(driver.inference.errors.join("\n"));
        const observed = await driver.observe();
        if (observed.tasks.some(task => task.reports.length > 0)) break;
        signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    const integration = createVersionChangeIntegration({ projectRoot: driver.root });
    const frozen = await integration.services.freeze.entryOf("docs/product/direct-e2e-intent-v1.md", 1);
    assert.equal(frozen?.freeze.reason, "intent-confirmed",
      "Q1_FIRST_MISSING_PRODUCTION_ENTRY: actual customer confirmation/handback must produce the intent-confirmed R9 used by null-CAS; never seed it in this test");
  } finally {
    console.log("Q1_EARLY_CHAIN", JSON.stringify({ root: driver.root, trace: driver.budget.trace, observation: await driver.observe(), customer: driver.customerTrace, errors: driver.inference.errors }));
    await driver.dispose(); await start?.catch(() => undefined);
  }
});

// Required later scenarios consume this same real driver after O/G/W APIs are ready:
// null-CAS planning publication; D3 -> zero-file draft writes -> complete activation -> dispatch;
// recreate an old-run session after live edits; all run modes; creator close/dependency release;
// post-CAS restart/supersede facts; real environment repair; independent chief while main waits;
// off/on/CAS/@directive/revise -> returned promise -> actual author write -> new real request.
// No placeholder test is declared passed for these still-uncovered scenarios.
