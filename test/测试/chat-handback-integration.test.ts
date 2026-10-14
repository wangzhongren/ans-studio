import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { SessionManager, type SessionEventEnvelope } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { listProject } from "../../src/service/role/resolve-role.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import type { RuntimeKind, RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent, ToolResult } from "../../src/model/runtime.ts";

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 2));
async function until(check: () => boolean) {
  const end = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > end) throw new Error("independent chat/dispatch observation timed out");
    await tick();
  }
}

for (const runtime of ["pi", "codex", "claude"] as const satisfies readonly RuntimeKind[]) {
  test(`independent ${runtime}: real Desktop → Pipeline → Core separates chat, queued chat, dispatch and explicit reports`, async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-chat-handback-")));
    const roleDir = path.join(root, "角色卡", "A");
    fs.mkdirSync(roleDir, { recursive: true });
    fs.writeFileSync(path.join(roleDir, "role-card.md"), "# Independent role A\n");
    fs.writeFileSync(path.join(roleDir, "boundary.yaml"), "role: A\nentries:\n  - kind: directory\n    path: docs/A/\n    purpose: independent test\n");
    const listing = await listProject(root);
    const envelopes: SessionEventEnvelope[] = [];
    const suInputs: string[] = [];
    const workerInputs: string[] = [];
    let release: (() => void) | undefined;
    let held = false;
    const tool = async (options: RuntimeProviderOptions, name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> => {
      const definition = options.tools.find(item => item.name === name);
      assert.ok(definition, `${name} must be the actual registered Core tool`);
      return definition.handler({ name, args, signal, toolCallId: `${options.currentTurnId()}:${name}` });
    };
    // Only external engine responses are controlled. Desktop, Pipeline, Core,
    // dispatch/report handlers and all handback delivery remain production code.
    const factory: RuntimeProviderFactory = options => ({
      async composeContext() { return { systemPrompt: "independent external engine" }; },
      async bindRole(role) {
        let closed = false;
        let wake: (() => void) | undefined;
        let controller = new AbortController();
        const rows: SessionEvent[] = [];
        const push = (event: SessionEvent) => { rows.push(event); wake?.(); wake = undefined; };
        return {
          runtime: options.runtime, roleId: role.id, contextSource: "fresh",
          async prompt(text, promptOptions) {
            assert.equal(Object.hasOwn(promptOptions ?? {}, "handback"), false, "Pipeline-only source must not reach the engine");
            controller = new AbortController();
            const turnId = options.currentTurnId();
            if (role.id === "su") {
              suInputs.push(text);
              if (text.startsWith("dispatch:")) {
                const receipt = await tool(options, "dispatch_task", { roleId: "A", task: text.slice("dispatch:".length) }, controller.signal);
                assert.equal(receipt.ok, true);
              }
            } else {
              workerInputs.push(text);
              if (text.includes("hold")) {
                held = true;
                await new Promise<void>(resolve => {
                  release = resolve;
                  controller.signal.addEventListener("abort", () => resolve(), { once: true });
                });
                held = false;
              }
              if (text.includes("fail-worker")) throw new Error("independent deliberate engine failure");
              if (text.includes("explicit-report")) {
                const result = await tool(options, "submit_report", { status: "completed", summary: "independent explicit completion", evidence: ["read-only inspection"] }, controller.signal);
                assert.equal(result.ok, true);
              }
            }
            // Real Core normalizes duplicate infrastructure terminals.
            for (let i = 0; i < 2; i++) push({ kind: "settled", turnId, summary: "external completion", detail: { outcome: "completed" } });
          },
          async *events() {
            while (!closed || rows.length > 0) {
              if (rows.length > 0) { yield rows.shift()!; continue; }
              await new Promise<void>(resolve => { wake = resolve; });
            }
          },
          async abort() { controller.abort(); },
          async dispose() { closed = true; controller.abort(); wake?.(); },
        };
      },
    });
    const manager = new SessionManager({
      openRoleSession: input => openRoleSession({ ...input, autoRepin: false, persistSession: false }, {
        runtimeOptions: { providerFactories: { [runtime]: factory }, persistSession: false, promptTimeoutMs: 2000 },
      }),
      createPiAdapterFactory: () => () => { throw new Error("unused external SDK factory"); },
      createDemoAdapter: () => { throw new Error("unused demo factory"); },
      buildProjectConfig,
      getListing: projectRoot => projectRoot === root ? listing : undefined,
      emitEvent: event => envelopes.push(event),
    });
    const target = { projectRoot: root, runtime, roleId: "A" };
    const su = { projectRoot: root, runtime, roleId: "su" };
    const handbacks = () => envelopes.filter(row => row.roleId === "A" && row.event.kind === "handback");
    const terminals = () => envelopes.filter(row => row.roleId === "A" && row.event.kind === "settled").length;
    const delivered = () => suInputs.filter(text => text.startsWith("[回交]")).length;
    const statusAt = (index: number) => {
      const event = handbacks()[index].event;
      assert.equal(event.kind, "handback");
      return event.kind === "handback" ? event.handback.status : undefined;
    };
    try {
      assert.equal((await manager.open(target)).ok, true);
      assert.equal((await manager.send("ordinary chat", undefined, target)).ok, true);
      await until(() => terminals() === 1);
      assert.equal(handbacks().length, 0);
      assert.equal(delivered(), 0);

      const hold = manager.send("ordinary hold", undefined, target);
      await until(() => held);
      const queued = await manager.send("queued ordinary chat", undefined, target);
      assert.equal(queued.ok, true);
      assert.equal(queued.queued, true, "must actually exercise the busy queue");
      release!();
      await hold;
      await until(() => terminals() === 3);
      assert.equal(workerInputs.filter(text => text === "queued ordinary chat").length, 1);
      assert.equal(handbacks().length, 0);
      assert.equal(delivered(), 0);

      assert.equal((await manager.open(su)).ok, true);
      assert.equal((await manager.send("dispatch:no report", undefined, su)).ok, true);
      await until(() => handbacks().length === 1 && delivered() === 1);
      assert.equal(statusAt(0), "unreported");

      assert.equal((await manager.send("dispatch:explicit-report", undefined, su)).ok, true);
      await until(() => handbacks().length === 2 && delivered() === 2);
      assert.equal(statusAt(1), "completed");

      assert.equal((await manager.send("after completed ordinary chat", undefined, target)).ok, true);
      await until(() => terminals() === 6);
      assert.equal(handbacks().length, 2, "completed task must not turn later chat into a task");
      assert.equal(delivered(), 2);

      assert.equal((await manager.send("ordinary explicit-report", undefined, target)).ok, true);
      await until(() => handbacks().length === 3 && delivered() === 3);
      assert.equal(statusAt(2), "completed");
      const turnIds = handbacks().map(row => row.event.kind === "handback" ? row.event.handback.turnId : undefined);
      assert.ok(turnIds.every(id => typeof id === "string" && id.length > 0));
      assert.equal(new Set(turnIds).size, 3, "each real turn owns exactly one report");
    } finally {
      release?.();
      await manager.stop();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
