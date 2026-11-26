import assert from "node:assert/strict";
import { link, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { buildGovernedTools, createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import type { GovernedToolsOptions, RuntimeProviderOptions, ToolCall } from "../../src/model/runtime.ts";
import { allow, deny, neutralProjectRoot, role } from "./fixtures.ts";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const retiredNames = ["exercise_acceptance_browser", "run_acceptance_workspace"];
const retiredBindings = {
  runAcceptanceWorkspace: () => assert.fail("retired execution binding reached"),
  exerciseAcceptanceBrowser: () => assert.fail("retired browser binding reached"),
};

async function fixture(t: TestContext) {
  const project = await neutralProjectRoot();
  t.after(project.cleanup);
  const root = project.root;
  const proof = ".ans/acceptance-runs/current/evidence";
  await mkdir(path.join(root, proof), { recursive: true });
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, proof, "track.png"), Buffer.from(png, "base64"));
  await writeFile(path.join(root, proof, "input.json"), '{"source":"current task"}');
  await writeFile(path.join(root, proof, "unrelated.txt"), "unrelated");
  await writeFile(path.join(root, "docs", "criteria.md"), "signed current criteria");
  await writeFile(path.join(root, "docs", "proof.json"), '{"source":"current task"}');
  await writeFile(path.join(root, "release.txt"), "production release");
  let current = true;
  const imageCalls: unknown[] = [];
  const reports: unknown[] = [];
  const options: GovernedToolsOptions = {
    durableFixedWorkflow: true, projectRoot: root, writeRoot: root, shellCwd: root, roleId: "verifier",
    currentTurnId: () => "audit-turn", evidenceAuditAccess: "audit", evidenceAuditIsCurrent: () => current,
    evidenceAuditReadPaths: [`${proof}/track.png`, `${proof}/input.json`, `${proof}/input.json.meta.json`, "docs/criteria.md", "docs/proof.json", "docs/proof.json.meta.json"],
    evidenceAuditReportPath: "docs/current-report.md",
    evidenceCollectionWritePaths: [`${proof}/`],
    shellGate: () => assert.fail("audit reached shell approval"),
    readonlyGit: { match: () => assert.fail("audit reached Git"), execute: () => assert.fail("audit executed Git") },
    dispatchTask: () => assert.fail("audit dispatched a task"),
    customerInput: () => assert.fail("audit requested approval"),
    requestDownload: () => assert.fail("audit requested a download"),
    restoreAcceptanceEnvironment: () => assert.fail("audit reached acceptance recovery"),
    evidenceCheck: async ({ artifact }) => `verified ${artifact}`,
    viewImage: async (image) => { imageCalls.push(image); return { ok: true, mode: "tool-result" }; },
    viewImagePolicy: { delivery: "tool-result", maxImageBytes: 10_000 },
    reportHandback: (report, meta) => { reports.push({ report, meta }); },
  };
  return { root, proof, reports, imageCalls, options, expire: () => { current = false; } };
}

test("retired browser and workspace tools cannot be constructed or described in any applicable runtime mode", async t => {
  const f = await fixture(t);
  for (const evidenceAuditAccess of [undefined, "audit", "collect"] as const) {
    const tools = buildGovernedTools(allow, { ...f.options, ...retiredBindings, evidenceAuditAccess });
    for (const name of retiredNames) {
      assert.equal(tools.some(tool => tool.name === name), false);
      assert.throws(() => describeTool(name, true, false, evidenceAuditAccess), /未知 ANS 工具/);
      assert.equal(tools.some(tool => JSON.stringify(tool).includes(name)), false);
    }
  }
});

test("real audit session constructor withholds retired tools, shell, background, dispatch and unrelated effects", async t => {
  const f = await fixture(t);
  const rejected = [...retiredNames, "run_shell", "start_background_task", "stop_background_task",
    "dispatch_task", "git_publish", "generate_package_lock", "restore_acceptance_environment", "request_download"];
  const script: ToolCall[] = [
    ...rejected.map(name => ({ name, args: { command: "node --version" } })),
    { name: "read_file", args: { path: "docs/criteria.md" } },
    { name: "submit_report", args: { status: "blocked", summary: "Fixture evidence incomplete", evidence: [`${f.proof}/input.json`] } },
  ];
  let captured: RuntimeProviderOptions | undefined;
  const session = await createRuntimeAdapter({
    ...f.options, ...retiredBindings, runtime: "demo", gate: allow, projectRoot: f.root, skillRoot: f.root,
    providerFactories: { demo: options => { captured = options; return createDemoRuntimeAdapter(options, script); } },
  }).bindRole(role("verifier"));
  try {
    assert.deepEqual(captured?.tools.map(tool => tool.name), ["read_file", "list_dir", "view_image", "evidence_check", "submit_report", "write_file", "edit_file"]);
    assert.deepEqual(captured?.installedMcpServers, []);
    assert.deepEqual(session.listBackgroundTasks?.(), []);
    assert.equal((await session.stopBackgroundTask?.("absent"))?.ok, false);
    await session.prompt("Run audit tool attempts");
    assert.equal(f.reports.length, 1);
  } finally { await session.dispose(); }
});

test("audit handlers check the true source scope, expose the original image and preserve formal handback", async t => {
  const f = await fixture(t);
  const tools = buildGovernedTools(allow, f.options);
  const run = (name: string, args: Record<string, unknown>) => tools.find(tool => tool.name === name)!.handler({ name, args });
  const text = await run("read_file", { path: `${f.proof}/input.json` });
  assert.equal(text.ok, true, text.message);
  assert.match(text.message, /current task/);
  const entries = await run("list_dir", { path: f.proof });
  assert.match(entries.message, /track\.png/);
  assert.doesNotMatch(entries.message, /unrelated/);
  for (const target of ["release.txt", `${f.proof}/unrelated.txt`, `${f.proof}/../evidence/input.json`, path.join(f.root, f.proof, "input.json")]) {
    assert.equal((await run("read_file", { path: target })).ok, false, target);
  }
  const image = await run("view_image", { path: `${f.proof}/track.png` });
  assert.equal(image.ok, true, image.message);
  assert.deepEqual(image.images, [{ type: "image", mimeType: "image/png", data: png }]);
  assert.equal(f.imageCalls.length, 1);
  assert.equal((await run("view_image", { path: `${f.proof}/unrelated.txt` })).ok, false);
  const ref = { path: "docs/criteria.md", sha256: "a".repeat(64), version: 1 };
  const checked = await run("evidence_check", { artifact: "docs/proof.json", criteriaRef: ref });
  assert.equal(checked.ok, true, checked.message);
  assert.equal((await run("evidence_check", { artifact: "release.txt", criteriaRef: ref })).ok, false);
  assert.equal((await run("evidence_check", { artifact: "docs/proof.json", criteriaRef: ref, metaPath: "release.txt" })).ok, false);

  const linkPath = path.join(f.root, f.proof, "linked.txt");
  await link(path.join(f.root, "release.txt"), linkPath);
  const withLink = buildGovernedTools(allow, { ...f.options, evidenceAuditReadPaths: [`${f.proof}/linked.txt`] });
  assert.equal((await withLink.find(tool => tool.name === "read_file")!.handler({ name: "read_file", args: { path: `${f.proof}/linked.txt` } })).ok, false);
  await t.test("a directory alias cannot expose an otherwise inaccessible file", async st => {
    const alias = path.join(f.root, "linked-docs");
    try { await symlink(path.join(f.root, "docs"), alias, process.platform === "win32" ? "junction" : "dir"); }
    catch (error) {
      if (process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
      st.skip("Windows runner cannot create a junction");
      return;
    }
    const aliasTools = buildGovernedTools(allow, { ...f.options, evidenceAuditReadPaths: ["linked-docs/criteria.md"] });
    assert.equal((await aliasTools.find(tool => tool.name === "read_file")!.handler({ name: "read_file", args: { path: "linked-docs/criteria.md" } })).ok, false);
  });

  const report = { status: "blocked", summary: "Current evidence insufficient", evidence: [`${f.proof}/input.json`] };
  assert.equal((await run("submit_report", report)).ok, true);
  f.expire();
  assert.equal((await run("read_file", { path: `${f.proof}/input.json` })).ok, false);
  assert.equal((await run("view_image", { path: `${f.proof}/track.png` })).ok, false);
  assert.equal((await run("submit_report", report)).ok, false);
  assert.equal(f.reports.length, 1);
  assert.equal(f.imageCalls.length, 1);
});

test("audit write and edit are restricted to the one formal report and still consult the existing gate", async t => {
  const f = await fixture(t);
  const run = (name: string, args: Record<string, unknown>, gate = allow) =>
    buildGovernedTools(gate, f.options).find(tool => tool.name === name)!.handler({ name, args });
  assert.equal((await run("write_file", { path: "release.txt", content: "unapproved change" })).ok, false);
  assert.equal((await run("write_file", { path: `${f.proof}/copied.json`, content: "unapproved evidence" })).ok, false);
  assert.equal((await run("write_file", { path: "docs/current-report.md", content: "denied" }, deny)).ok, false);
  assert.equal((await run("write_file", { path: "docs/current-report.md", content: "Audited" })).ok, true);
  assert.equal((await run("edit_file", { path: "docs/current-report.md", old_string: "Audited", new_string: "Blocked" })).ok, true);
  assert.equal(await readFile(path.join(f.root, "docs/current-report.md"), "utf8"), "Blocked");
  assert.equal(await readFile(path.join(f.root, "release.txt"), "utf8"), "production release");
  assert.equal(buildGovernedTools(allow, { ...f.options, evidenceAuditReportPath: undefined }).some(tool => tool.name === "write_file"), false);
  assert.equal(buildGovernedTools(allow, { ...f.options, evidenceAuditReportPath: "docs/" }).some(tool => tool.name === "write_file"), false);
});

for (const runtime of ["claude", "pi", "codex"] as const) {
  test(`default ${runtime} adapter receives the restricted audit catalog`, async t => {
    const f = await fixture(t);
    const environment = {
      ANS_CODEX_WIRE_API: "chat",
      ANS_CODEX_WEB_SEARCH: "on",
      ANS_CLAUDE_WEB_SEARCH: "on",
      ANS_R20_LOCAL_KEY: "local-fixture-no-model-called",
    };
    const original = Object.keys(environment).map(key => [key, process.env[key]] as const);
    Object.assign(process.env, environment);
    try {
      const session = await createRuntimeAdapter({
        ...f.options, runtime, gate: allow, projectRoot: f.root, skillRoot: f.root,
        baseUrl: "http://127.0.0.1:9/v1", modelId: "r20-context-only", apiKeyEnvVar: "ANS_R20_LOCAL_KEY",
      }).bindRole(role("verifier"));
      try {
        const surface = session.inspectToolSurface!();
        assert.equal(surface.factoryProvenance, "default-production");
        assert.deepEqual(surface.appTools, ["read_file", "list_dir", "view_image", "evidence_check", "submit_report", "write_file", "edit_file"]);
        assert.deepEqual(surface.configuredForeignMcpServers, []);
        if (surface.native) assert.deepEqual(surface.native.nativeBuiltinTools, []);
      } finally { await session.dispose(); }
    } finally {
      for (const [key, value] of original) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
}
