import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { openRoleSession, readRoleSessionHistory } from "../../src/pipeline/orchestration/run-role.ts";
import { getSessionHistory } from "../../app/desktop/runtime-history.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RuntimeProviderFactory, SessionEvent, CustomerInputMetadata } from "../../src/model/runtime.ts";

for (const runtime of ["pi", "codex", "claude"] as const) {
  test(`independent ${runtime}: one input per real turn, same-text turns and genuine assistant quote survive history merge`, async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-input-identity-")));
    const roleDir = path.join(root, "角色卡", "X");
    fs.mkdirSync(roleDir, { recursive: true });
    fs.writeFileSync(path.join(roleDir, "role-card.md"), "# Independent X\n");
    fs.writeFileSync(path.join(roleDir, "boundary.yaml"), "role: X\nentries:\n  - kind: directory\n    path: docs/X/\n    purpose: fixture\n");
    const project: ProjectConfig = { projectRoot: root, skillRoot: root,
      roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
      governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "independent input identity test" } } };
    const text = "[回交] identical input text must not collapse different actual turns";
    const requestIds: string[] = [];
    const observedMetadata: CustomerInputMetadata[] = [];
    const factory: RuntimeProviderFactory = options => ({
      async composeContext() { return { systemPrompt: "independent controlled external engine" }; },
      async bindRole(role) {
        assert.equal(options.toolDisplayMode, "required-v1");
        assert.equal(typeof options.registerToolDisplayProfile, "function");
        options.registerToolDisplayProfile!({ credentials: [] });
        let closed = false;
        let wake: (() => void) | undefined;
        const rows: SessionEvent[] = [];
        return { runtime: options.runtime, roleId: role.id, contextSource: "fresh",
          async prompt(input) {
            const turnId = options.currentTurnId();
            assert.ok(turnId);
            const toolCallId = "request-" + turnId;
            requestIds.push(toolCallId);
            const definition = options.tools.find(tool => tool.name === "request_confirmation");
            assert.ok(definition);
            const result = await definition.handler({ name: definition.name,
              args: { title: "identity fixture", preview: "docs/X/fixture.md" },
              signal: new AbortController().signal, toolCallId });
            assert.equal(result.ok, false, "a real declined confirmation must remain declined");
            // This is an actual assistant output with an old echo-like prefix.
            // It has no typed input marker and must never be hidden by its text.
            rows.push({ kind: "message", turnId, summary: "用户指令：" + input });
            rows.push({ kind: "settled", turnId, summary: "controlled engine finished", detail: { outcome: "completed" } });
            wake?.(); wake = undefined;
          },
          async *events() {
            while (!closed || rows.length > 0) {
              if (rows.length > 0) { yield rows.shift()!; continue; }
              await new Promise<void>(resolve => { wake = resolve; });
            }
          },
          async dispose() { closed = true; wake?.(); },
        };
      },
    });
    const handle = await openRoleSession({ project, roleId: "X", runtime,
      customerInput: (_request, metadata) => {
        assert.ok(metadata);
        observedMetadata.push(metadata);
        return { outcome: "declined", operatorId: "independent test" };
      },
    }, { runtimeOptions: { providerFactories: { [runtime]: factory }, persistSession: true } });
    const events: SessionEvent[] = [];
    const pump = (async () => { for await (const event of handle.events()) if (event.kind !== "handback") events.push(event); })();
    try {
      await handle.send(text, { images: [{ type: "image", data: "AA==", mimeType: "image/png" }] });
      await handle.send(text);
      await handle.dispose();
      await pump;
      const inputs = events.filter(event => (event.detail as { source?: string } | undefined)?.source === "prompt-input");
      assert.equal(inputs.length, 2);
      assert.equal(new Set(inputs.map(event => event.turnId)).size, 2);
      assert.ok(inputs.every(event => event.turnId === (event.detail as { turnId: string }).turnId));
      assert.deepEqual(inputs.map(event => (event.detail as { text: string }).text), [text, text]);
      assert.equal((inputs[0].detail as { imageCount: number }).imageCount, 1);
      assert.equal(observedMetadata.length, 2);
      assert.deepEqual(observedMetadata.map(metadata => metadata.toolCallId), requestIds);
      assert.deepEqual(observedMetadata.map(metadata => metadata.turnId), inputs.map(event => event.turnId));
      const raw = await readRoleSessionHistory({ projectRoot: root, roleId: "X", runtime });
      assert.equal(raw.entries.filter(entry => entry.kind === "user").length, 2, "raw user persistence remains one per turn");
      const view = await getSessionHistory({ projectRoot: root, roleId: "X", runtime });
      assert.equal(view.error, null);
      const users = view.rows.filter(row => row.kind === "user");
      assert.equal(users.length, 2, "persisted input and live echo share one trusted input identity");
      assert.ok(users.every(row => row.text === text && row.input?.source === "prompt-input"));
      assert.equal(view.rows.filter(row => row.kind === "assistant" && row.text === "用户指令：" + text).length, 2,
        "assistant prefix cannot be used as a text-based deduplication rule");
    } finally {
      await handle.dispose();
      await pump;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
