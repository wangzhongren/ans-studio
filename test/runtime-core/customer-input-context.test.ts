import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CustomerInputMetadata, CustomerInputOutcome, WriteGate } from "../../src/model/runtime.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { allow, until } from "./fixtures.ts";

test("confirmation passes original cancellation context; late yes cannot issue next-turn write permission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-confirm-context-"));
  try {
    let turnId = "confirmation-turn";
    const controller = new AbortController();
    const allowedPaths = new Set<string>();
    let metadata: CustomerInputMetadata | undefined;
    let reply!: (outcome: CustomerInputOutcome) => void;
    let issued = false;
    let callbackFinished = false;
    const gate: WriteGate = (target) => allowedPaths.has(target) ? allow(target) : { allowed: false, reason: "no live confirmation issued", allowedByRoot: { project: [], skill: [] } };
    const byName = new Map(buildGovernedTools(gate, {
      writeRoot: root, currentTurnId: () => turnId, roleId: "core", runtime: "claude",
      customerInput: async (_request, context) => {
        metadata = context;
        const answer = await new Promise<CustomerInputOutcome>((resolve) => { reply = resolve; });
        // This represents the issuer contract O1 must implement before any writeSet side effect.
        if (answer.outcome === "answered" && answer.value.confirmed === true && context?.signal && !context.signal.aborted) {
          allowedPaths.add(path.join(root, "approved.txt")); issued = true;
        }
        callbackFinished = true;
        return answer;
      },
    }).map((tool) => [tool.name, tool]));
    const request = byName.get("request_confirmation")!.handler({ name: "request_confirmation", args: { title: "approve approved.txt", preview: "approved.txt" }, signal: controller.signal });
    turnId = "later-turn-before-callback";
    await until(() => metadata !== undefined);
    assert.equal(metadata?.signal, controller.signal);
    assert.deepEqual({ turnId: metadata?.turnId, roleId: metadata?.roleId, runtime: metadata?.runtime }, { turnId: "confirmation-turn", roleId: "core", runtime: "claude" });
    controller.abort();
    const result = await request; assert.equal(result.ok, false); assert.match(result.message, /未获客户同意|中止/);
    turnId = "next-unconfirmed-turn";
    reply({ outcome: "answered", value: { confirmed: true } });
    await until(() => callbackFinished);
    assert.equal(metadata?.turnId, "confirmation-turn"); assert.equal(metadata?.signal?.aborted, true);
    assert.equal(issued, false); assert.equal(allowedPaths.size, 0);
    const nextSignal = new AbortController().signal;
    const nextWrite = await byName.get("write_file")!.handler({ name: "write_file", args: { path: "approved.txt", content: "must not write" }, signal: nextSignal });
    assert.equal(nextWrite.ok, false); assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("choice callback receives the captured original signal/turn and legacy single-argument callbacks remain valid", async () => {
  let turnId = "choice-turn";
  const controller = new AbortController();
  let context: CustomerInputMetadata | undefined;
  let reply!: (outcome: CustomerInputOutcome) => void;
  const choice = buildGovernedTools(allow, {
    currentTurnId: () => turnId, roleId: "core", runtime: "codex",
    customerInput: (_request, metadata) => { context = metadata; return new Promise((resolve) => { reply = resolve; }); },
  }).find((tool) => tool.name === "request_choice")!;
  const request = choice.handler({ name: choice.name, args: { title: "choose", options: [{ id: "a", label: "A" }] }, signal: controller.signal });
  turnId = "newer-choice-turn";
  await until(() => context !== undefined);
  assert.equal(context?.signal, controller.signal);
  assert.deepEqual({ turnId: context?.turnId, roleId: context?.roleId, runtime: context?.runtime }, { turnId: "choice-turn", roleId: "core", runtime: "codex" });
  reply({ outcome: "answered", value: { selected: ["a"] } }); assert.equal((await request).ok, true);
  const legacy = buildGovernedTools(allow, { customerInput: (_request) => ({ outcome: "answered", value: { confirmed: true } }) }).find((tool) => tool.name === "request_confirmation")!;
  assert.equal((await legacy.handler({ name: legacy.name, args: { title: "legacy" } })).ok, true);
});
