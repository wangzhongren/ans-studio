import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { compatibilityReasoningCatalog, decodeEmbeddedReasoningCatalog, findReasoningCatalogMarker, MAX_REASONING_CATALOG_BYTES, prepareReasoningCatalog, readInstalledReasoningCatalog, REASONING_CATALOG_MARKER_OVERLAP, REASONING_CATALOG_VERSION } from "../../src/common/codex-adapter/reasoning-catalog.ts";
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
// Node on Windows synthesizes mode bits from file attributes (0666 for a regular file); POSIX
// reports the requested 0600. Pin each platform's truth; the assertion itself is not relaxed.
const PRIVATE_FILE_MODE = process.platform === "win32" ? 0o666 : 0o600;

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
  assert.throws(() => decodeEmbeddedReasoningCatalog(Buffer.from('{\r\n "models": [')), /version\/format/, "near-miss whitespace must not be guessed");
  const encoded = Buffer.from(JSON.stringify({ models: [original] }, null, 2) + '\u0000binary trailer');
  assert.deepEqual(decodeEmbeddedReasoningCatalog(encoded), { models: [original] });
  // win32-x64 0.162.1 embeds the same catalog formatted with CRLF; both verified formats decode identically.
  const crlf = Buffer.from(JSON.stringify({ models: [original] }, null, 2).replaceAll("\n", "\r\n"));
  assert.deepEqual(decodeEmbeddedReasoningCatalog(crlf), { models: [original] });
});

test("embedded catalog marker search accepts exactly the LF and CRLF formats, including across chunk splits", () => {
  assert.equal(findReasoningCatalogMarker(Buffer.from('junk{\n  "models": [')), 4);
  assert.equal(findReasoningCatalogMarker(Buffer.from('junk{\r\n  "models": [')), 4);
  assert.equal(findReasoningCatalogMarker(Buffer.from('{"models":[]}')), -1);
  assert.equal(findReasoningCatalogMarker(Buffer.from('{\r\n "models": [')), -1);
  // The production reader carries only the last REASONING_CATALOG_MARKER_OVERLAP bytes between
  // windows; a CRLF marker must survive every possible split position.
  const payload = Buffer.from("preamble".repeat(100) + '{\r\n  "models": [\r\n  ]}');
  const crlfMarker = '{\r\n  "models": [';
  const markerAt = payload.indexOf(crlfMarker);
  for (let cut = Math.max(0, markerAt - REASONING_CATALOG_MARKER_OVERLAP); cut <= markerAt + crlfMarker.length; cut++) {
    const head = payload.subarray(0, cut);
    const carry = head.subarray(Math.max(0, head.length - REASONING_CATALOG_MARKER_OVERLAP));
    const found = findReasoningCatalogMarker(Buffer.concat([carry, payload.subarray(cut)]));
    assert.equal(cut - carry.length + found, markerAt, `marker must survive a chunk split at ${cut}`);
  }
});

test("temporary catalog is private, exact, and unknown model creates no files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-catalog-file-test-"));
  try {
    assert.equal(await prepareReasoningCatalog(root, "not-an-installed-model"), undefined);
    assert.deepEqual(await readdir(root), []);
    const catalog = await prepareReasoningCatalog(root, "gpt-5.5"); assert.ok(catalog);
    assert.equal((await stat(catalog.path)).mode & 0o777, PRIVATE_FILE_MODE);
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
  assert.equal((await stat(file)).mode & 0o777, PRIVATE_FILE_MODE);
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
