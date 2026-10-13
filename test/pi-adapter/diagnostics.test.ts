import { test } from "node:test";
import assert from "node:assert/strict";
import { toPiTool, makeRolePrompt } from "../../src/common/pi-adapter/real-adapter.ts";
import { buildGovernedTools } from "../../src/provider/pi/tools.ts";
import { createTurnLifecycle, type DiagnosticLog } from "../../src/common/pi-adapter/lifecycle.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import { makeGate } from "./fixtures.ts";

test("tool, report and interaction diagnostics contain metadata without argument or result bodies", async () => {
  const records: unknown[] = [];
  const diagnostics: DiagnosticLog = { record: (event, fields) => records.push({ event, fields }), error: (event, _error, fields) => records.push({ event, fields }) };
  const tools = buildGovernedTools(makeGate({ project: [], skill: [] }), { currentTurnId: () => "one", diagnostics, customerInput: () => ({ outcome: "answered", value: { confirmed: true }, operatorId: "operator" }), reportHandback: () => ({ ok: true }) });
  for (const [name, args] of [
    ["request_confirmation", { title: "SECRET_TITLE", preview: "SECRET_PREVIEW" }],
    ["submit_report", { status: "completed", summary: "SECRET_REPORT", evidence: ["SECRET_EVIDENCE"] }],
  ] as const) {
    const tool = tools.find(t => t.name === name)!;
    await toPiTool(tool, { currentTurnId: () => "one", diagnostics }).execute("call", args, undefined, () => {}, {} as never);
  }
  const text = JSON.stringify(records);
  assert.doesNotMatch(text, /SECRET_/);
  for (const event of ["tool.start", "tool.result", "report.submit.accepted", "interaction.wait.start", "interaction.wait.end"]) assert.match(text, new RegExp(event));
});

test("model error diagnostics omit raw API error responses and prompt input", async () => {
  const records: unknown[] = [];
  const diagnostics: DiagnosticLog = { record: (event, fields) => records.push({ event, fields }), error: (event, error, fields) => records.push({ event, error: String(error), fields }) };
  const lifecycle = createTurnLifecycle(() => {}, diagnostics);
  lifecycle.begin();
  lifecycle.observe({ role: "assistant", stopReason: "error", errorMessage: "SECRET_API_RESPONSE" });
  lifecycle.finish();
  const prompt = makeRolePrompt({ session: { prompt: async () => { throw new Error("SECRET_API_RESPONSE"); }, abort: async () => {}, dispose() {} }, promptMs: 100, gate: createInteractionGate(), emit: () => {}, log: { stage() {}, trace() {}, traceEnabled: false }, diagnostics });
  await assert.rejects(prompt("SECRET_PROMPT"));
  assert.doesNotMatch(JSON.stringify(records), /SECRET_/);
  assert.match(JSON.stringify(records), /MODEL_ERROR/);
});
