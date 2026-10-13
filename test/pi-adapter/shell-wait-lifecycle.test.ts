import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGovernedTools } from "../../src/provider/pi/tools.ts";
import { createInteractionGate, withPausableTimeout } from "../../src/common/pi-adapter/timeout.ts";
import { makeGate } from "./fixtures.ts";
import type { ShellReviewResult } from "../../src/provider/pi/session.ts";

test("shell review waiting pauses prompt budget while retaining its separate deadline", async () => {
  const gate = createInteractionGate();
  const tool = buildGovernedTools(makeGate({ skill: [], project: [] }), { interactionGate: gate, shellReviewTimeoutMs: 1000, shellGate: async () => { await new Promise(r => setTimeout(r, 60)); return { allow: false, by: "fixture", reason: "deny" }; } }).find(t => t.name === "run_shell")!;
  const result = await withPausableTimeout(tool.handler({ name: tool.name, args: { command: "npm test" } }), 20, "prompt", gate);
  assert.equal(result.ok, false);
  assert.match(result.message, /审核拒绝/);
  assert.equal(gate.isWaiting(), false);
});

test("unresponsive shell reviewer fails closed at its own deadline", async () => {
  const gate = createInteractionGate();
  const tool = buildGovernedTools(makeGate({ skill: [], project: [] }), { interactionGate: gate, shellReviewTimeoutMs: 20, shellGate: () => new Promise(() => {}) }).find(t => t.name === "run_shell")!;
  const result = await withPausableTimeout(tool.handler({ name: tool.name, args: { command: "npm test" } }), 10, "prompt", gate);
  assert.equal(result.ok, false); assert.match(result.message, /超时/); assert.equal(gate.isWaiting(), false);
});

test("abort releases review wait immediately; late allow cannot execute command", async () => {
  const gate = createInteractionGate();
  const controller = new AbortController();
  let release!: (result: ShellReviewResult) => void;
  const tool = buildGovernedTools(makeGate({ skill: [], project: [] }), { interactionGate: gate, shellReviewTimeoutMs: 1000, shellGate: () => new Promise(resolve => { release = resolve; }) }).find(t => t.name === "run_shell")!;
  const work = tool.handler({ name: tool.name, args: { command: "node --version" }, signal: controller.signal });
  await Promise.resolve(); controller.abort();
  const result = await work;
  release({ allow: true, by: "fixture" });
  assert.equal(result.ok, false); assert.match(result.message, /未执行/); assert.equal(gate.isWaiting(), false);
});
