import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { compatibilityReasoningCatalog, decodeEmbeddedReasoningCatalog, MAX_REASONING_CATALOG_BYTES, prepareReasoningCatalog, readInstalledReasoningCatalog, REASONING_CATALOG_VERSION } from "../../src/common/codex-adapter/reasoning-catalog.ts";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import { harness, options, role, start, until } from "./fixtures.ts";

const installed = await readInstalledReasoningCatalog() as { models: Array<Record<string, unknown>> };
const original = installed.models.find(model => model.slug === "gpt-5.5")!;
const FIELD = JSON.stringify({ error: { message: "Unsupported parameter: reasoning.effort", param: "reasoning.effort", code: "unsupported_parameter", type: "invalid_request_error" } });
const models = [{ model: "gpt-5.5", defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "medium" }] }];
const catalogPath = (overrides: readonly string[]) => {
  const override = overrides.find(value => value.startsWith("model_catalog_json="));
  return override ? JSON.parse(override.slice("model_catalog_json=".length)) as string : undefined;
};

test("installed fixed-version metadata selects exact current model and changes only four approved fields", () => {
  assert.ok(original);
  const before = structuredClone(installed);
  const compatible = compatibilityReasoningCatalog(installed, "gpt-5.5", REASONING_CATALOG_VERSION) as { models: Array<Record<string, unknown>> };
  assert.equal(compatible.models.length, 1);
  assert.deepEqual(compatible.models[0], { ...original, default_reasoning_level: null, default_reasoning_summary: "none", supports_reasoning_summary_parameter: false, supports_reasoning_summaries: false });
  assert.deepEqual(installed, before, "installed metadata object is never mutated");
  assert.equal(compatibilityReasoningCatalog(installed, "gpt-5.5-alias", REASONING_CATALOG_VERSION), undefined);
});

test("unknown version, ambiguous model, malformed record and oversized/truncated embedded format are refused", () => {
  assert.throws(() => compatibilityReasoningCatalog(installed, "gpt-5.5", "0.162.2"), /version\/format/);
  assert.throws(() => compatibilityReasoningCatalog({ models: [original, original] }, "gpt-5.5", REASONING_CATALOG_VERSION), /version\/format/);
  assert.throws(() => compatibilityReasoningCatalog({ models: [{ slug: "gpt-5.5", default_reasoning_level: "medium" }] }, "gpt-5.5", REASONING_CATALOG_VERSION), /version\/format/);
  assert.throws(() => decodeEmbeddedReasoningCatalog(Buffer.alloc(MAX_REASONING_CATALOG_BYTES + 1)), /version\/format/);
  assert.throws(() => decodeEmbeddedReasoningCatalog(Buffer.from('{\n  "models": [')), /version\/format/);
  assert.throws(() => decodeEmbeddedReasoningCatalog(Buffer.from('{"models":[]}')), /version\/format/, "unknown embedding format must not be guessed");
  const encoded = Buffer.from(JSON.stringify({ models: [original] }, null, 2) + '\u0000binary trailer');
  assert.deepEqual(decodeEmbeddedReasoningCatalog(encoded), { models: [original] });
});

test("temporary catalog is private, exact, and unknown model creates no files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-catalog-file-test-"));
  try {
    assert.equal(await prepareReasoningCatalog(root, "not-an-installed-model"), undefined);
    assert.deepEqual(await readdir(root), []);
    const catalog = await prepareReasoningCatalog(root, "gpt-5.5"); assert.ok(catalog);
    assert.equal((await stat(catalog.path)).mode & 0o777, 0o600);
    const saved = JSON.parse(await readFile(catalog.path, "utf8"));
    assert.equal(saved.models.length, 1); assert.equal(saved.models[0].slug, "gpt-5.5");
    assert.deepEqual(saved.models[0].model_messages, original.model_messages);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("normal engine has no catalog overlay; confirmed E1 overlay is cleaned on dispose", async () => {
  const h = harness({ mcpServers: [], models });
  const session = await createCodexRuntimeAdapter(options("/tmp", h, { modelId: "gpt-5.5", reasoningEffort: "high" })).bindRole(role);
  assert.equal(catalogPath(h.engine.input.configOverrides), undefined);
  const first = await start(session, h.engine); h.engine.failTurn(FIELD);
  await until(() => h.engines.length === 2 && h.engine.turns === 1);
  const file = catalogPath(h.engine.input.configOverrides); assert.ok(file);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  h.engine.finish(); await first.completion;
  const next = await start(session, h.engine); assert.equal(h.engines.length, 2); h.engine.finish(); await next.completion;
  await session.dispose(); await assert.rejects(stat(file), { code: "ENOENT" });
});

test("failed or cancelled E1 overlay is removed before next original-policy engine request", async () => {
  for (const cancel of [false, true]) {
    const h = harness({ mcpServers: [], models });
    const session = await createCodexRuntimeAdapter(options("/tmp", h, { modelId: "gpt-5.5", reasoningEffort: "high" })).bindRole(role);
    const first = await start(session, h.engine); h.engine.failTurn(FIELD);
    await until(() => h.engines.length === 2 && h.engine.turns === 1);
    const file = catalogPath(h.engine.input.configOverrides); assert.ok(file);
    if (cancel) { await session.abort!(); await first.completion; }
    else { h.engine.failTurn("unexpected status 500: temporary failure"); await assert.rejects(first.completion); }
    const completion = session.prompt("restore original metadata"); void completion.catch(() => {});
    await until(() => h.engines.length === 3 && h.engine.turns === 1);
    assert.equal(catalogPath(h.engine.input.configOverrides), undefined);
    assert.equal(h.engine.requests.find(request => request.method === "turn/start")!.params.effort, "high");
    await assert.rejects(stat(file), { code: "ENOENT" });
    h.engine.finish(); await completion; await session.dispose();
  }
});

test("default value also rejected uses E1 in the same second no-effort candidate", async () => {
  const h = harness({ mcpServers: [], models });
  const session = await createCodexRuntimeAdapter(options("/tmp", h, { modelId: "gpt-5.5", reasoningEffort: "high" })).bindRole(role);
  const value = JSON.stringify({ error: { message: "Invalid value", param: "reasoning.effort", code: "unsupported_value", type: "invalid_request_error" } });
  const first = await start(session, h.engine); h.engine.failTurn(value);
  await until(() => h.engine.turns === 2);
  assert.equal(h.engine.requests.filter(request => request.method === "turn/start")[1].params.effort, "medium");
  h.engine.failTurn(value); await until(() => h.engines.length === 2 && h.engine.turns === 1);
  const file = catalogPath(h.engine.input.configOverrides); assert.ok(file);
  assert.equal(h.engines.flatMap(engine => engine.requests.filter(request => request.method === "turn/start")).length, 3);
  h.engine.finish(); await first.completion; await session.dispose(); await assert.rejects(stat(file), { code: "ENOENT" });
});
