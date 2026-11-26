import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { link, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type {
  GovernedToolsOptions, ImplementationSelfTestObservation, ShellReviewRequest, ToolDefinition,
} from "../../src/model/runtime.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { allow, deny, neutralProjectRoot } from "./fixtures.ts";

async function fixture(t: TestContext) {
  const project = await neutralProjectRoot();
  t.after(project.cleanup);
  const root = project.root;
  await mkdir(path.join(root, "evidence"));
  await mkdir(path.join(root, "delivery"));
  await writeFile(path.join(root, "delivery", "file.txt"), "release stays unchanged");
  await writeFile(path.join(root, "check.mjs"), 'console.log("actual collector fixture output");');
  const options = {
    durableFixedWorkflow: true, projectRoot: root, readRoot: root, writeRoot: root, shellCwd: root,
    roleId: "acceptance-evidence-collector", currentTurnId: () => "collection-turn",
    evidenceAuditAccess: "collect", evidenceCollectionWritePaths: ["evidence/"], evidenceAuditIsCurrent: () => true,
    evidenceAuditReadPaths: ["delivery/file.txt", "evidence/"],
  } satisfies GovernedToolsOptions;
  return { root, options };
}

function invoke(tools: ToolDefinition[], name: string, args: Record<string, unknown>) {
  return tools.find(tool => tool.name === name)!.handler({ name, args, toolCallId: "collector-call" });
}

test("collector writes only within the approved evidence scope and cannot use Git, dispatch, or delivery tools", async t => {
  const f = await fixture(t);
  const options = {
    ...f.options, evidenceAuditReportPath: "delivery/file.txt",
    requestDownload: () => assert.fail("collector reached delivery"),
    dispatchTask: () => assert.fail("collector dispatched a task"),
    shellGate: () => assert.fail("collector without a strict binding reached approval"),
    readonlyGit: { match: () => assert.fail("collector reached Git"), execute: () => assert.fail("collector executed Git") },
  } satisfies GovernedToolsOptions;
  const tools = buildGovernedTools(allow, options);
  assert.deepEqual(tools.map(tool => tool.name), ["read_file", "list_dir", "write_file", "edit_file"]);
  assert.equal((await invoke(tools, "write_file", { path: "evidence/current.json", content: "{}" })).ok, true);
  assert.equal((await invoke(tools, "edit_file", { path: "evidence/current.json", old_string: "{}", new_string: '{"current":true}' })).ok, true);
  for (const target of ["delivery/file.txt", "evidence/../delivery/file.txt", ".git/config", "evidence-next/other.json",
    path.join(f.root, "evidence", "absolute.json")]) {
    assert.equal((await invoke(tools, "write_file", { path: target, content: "unexpected" })).ok, false, target);
  }
  const linkedFile = path.join(f.root, "evidence", "linked.txt");
  await link(path.join(f.root, "delivery", "file.txt"), linkedFile);
  assert.equal((await invoke(tools, "write_file", { path: "evidence/linked.txt", content: "unexpected" })).ok, false);
  await t.test("an evidence directory alias cannot write into delivery", async st => {
    const alias = path.join(f.root, "evidence", "alias");
    try { await symlink(path.join(f.root, "delivery"), alias, process.platform === "win32" ? "junction" : "dir"); }
    catch (error) {
      if (process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
      st.skip("Windows runner cannot create a junction");
      return;
    }
    assert.equal((await invoke(tools, "write_file", { path: "evidence/alias/file.txt", content: "unexpected" })).ok, false);
  });
  assert.equal((await invoke(buildGovernedTools(deny, options), "write_file", { path: "evidence/denied.json", content: "{}" })).ok, false);
  assert.equal(await readFile(path.join(f.root, "evidence/current.json"), "utf8"), '{"current":true}');
  assert.equal(await readFile(path.join(f.root, "delivery/file.txt"), "utf8"), "release stays unchanged");
});

test("collector foreground execution uses the original strict approval, actual process, and post-write audit", async t => {
  const f = await fixture(t);
  const observed: ImplementationSelfTestObservation[] = [];
  const reviewed: ShellReviewRequest[] = [];
  const digest = "a".repeat(64);
  const evidenceExecutionRef = "evidence-execution:collector-task:" + createHash("sha256").update("collector-call").digest("hex");
  const argv = [process.execPath, "check.mjs"];
  const command = `"${argv[0]}" check.mjs`;
  const strict = { strictAuditReady: true, isCurrent: () => true } as const;
  const options = {
    ...f.options, shellGate: async request => {
      reviewed.push(request);
      return { allow: true, by: "approved-operator", implementationSelfTest: strict };
    },
    shellPostAudit: async (_request, outcome) => {
      assert.equal(outcome.exitCode, 0);
      return { violations: [], strictAudit: { status: "passed", digest } };
    },
    observeImplementationSelfTest: facts => {
      observed.push(facts);
      return { evidenceExecutionRef };
    },
  } satisfies GovernedToolsOptions;
  const collect = (overrides: Partial<GovernedToolsOptions>, input: string) =>
    invoke(buildGovernedTools(allow, { ...options, ...overrides }), "run_shell", { command: input });
  for (const git of ["git add evidence/current.json", "git commit -m collector", '"C:\\git\\bin\\git.exe" config a b']) {
    assert.equal((await collect({}, git)).ok, false, git);
  }
  assert.equal(reviewed.length, 0);
  const noPermission = await collect({ shellGate: async () => ({ allow: false, reason: "declined", by: "operator" }) }, command);
  assert.equal(noPermission.ok, false);
  const withoutStrict = await collect({ shellGate: async () => ({ allow: true, by: "operator" }) }, command);
  assert.equal(withoutStrict.ok, false);
  assert.match(withoutStrict.message, /严格审批/);
  assert.equal(observed.length, 0);

  const success = await collect({}, command);
  assert.equal(success.ok, true, success.message);
  assert.ok(success.message.includes(evidenceExecutionRef), success.message);
  assert.deepEqual(reviewed[0]?.argv, argv);
  const receipt = observed.shift();
  assert.equal(receipt?.toolCallId, "collector-call");
  assert.equal(receipt?.turnId, "collection-turn");
  assert.equal(receipt?.process?.started, true);
  assert.deepEqual(receipt?.strictAudit, { status: "passed", digest });
  assert.match(receipt?.output?.stdout ?? "", /actual collector fixture output/);

  const noAudit = await collect({ shellPostAudit: async () => ({ violations: [] }) }, command);
  assert.equal(noAudit.ok, false);
  assert.doesNotMatch(noAudit.message, /evidence-execution:/);
  assert.equal(observed.shift()?.strictAudit?.status, "failed");
  let current = true;
  const stale = await collect({
    evidenceAuditIsCurrent: () => current,
    shellGate: async () => { current = false; return { allow: true, by: "operator", implementationSelfTest: strict }; },
    shellPostAudit: () => assert.fail("stale collector spawned a process"),
  }, command);
  assert.equal(stale.ok, false);
  assert.equal(observed.shift()?.process?.started, false);
});
