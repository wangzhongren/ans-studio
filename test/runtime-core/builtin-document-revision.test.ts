import assert from "node:assert/strict";
import { test } from "node:test";
import { DOCUMENT_REVISION_CONTENT_MAX_BYTES, GOVERNANCE_CARD_KINDS, governanceCardGroup } from "../../src/model/runtime.ts";
import type { GovernedToolsOptions, RequestDocumentRevisionFn, SubmitDocumentRevisionFn } from "../../src/model/runtime.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { allow } from "./fixtures.ts";

const requestName = "request_document_revision";
const submitName = "submit_document_revision";
const validRequest = { path: "docs/proposals/flow-example-proposal-v1.md", reason: "修订实施方案" };
const recorded = (status: string, message: string) => ({ ok: true as const, value: { requestId: "rev-1", status, message } });
const request: RequestDocumentRevisionFn = async () => recorded("accepted", "申请已登记，等待派发");
const submit: SubmitDocumentRevisionFn = async () => recorded("awaiting-approval", "候选已登记，等待本人决定");

function tools(options: GovernedToolsOptions) {
  return buildGovernedTools(allow, { durableFixedWorkflow: true, currentTurnId: () => "current-turn", ...options });
}

function revisionNames(options: GovernedToolsOptions) {
  return tools(options).map(item => item.name).filter(name => name === requestName || name === submitName);
}

test("revision tools require exactly one trusted port, current-turn support and the corresponding built-in identity", () => {
  assert.deepEqual(revisionNames({ roleId: "convener" }), []);
  assert.deepEqual(revisionNames({ roleId: "convener", requestDocumentRevision: request }), [requestName]);
  assert.deepEqual(revisionNames({ roleId: "convener", submitDocumentRevision: submit }), [submitName]);
  for (const roleId of ["product", "rapporteur", "nominator", "verifier"]) {
    assert.deepEqual(revisionNames({ roleId, submitDocumentRevision: submit }), [submitName]);
    assert.deepEqual(revisionNames({ roleId, requestDocumentRevision: request }), []);
  }
  for (const roleId of ["chief", "game-engineer", "custom-verifier"]) {
    assert.deepEqual(revisionNames({ roleId, requestDocumentRevision: request }), []);
    assert.deepEqual(revisionNames({ roleId, submitDocumentRevision: submit }), []);
  }
  assert.deepEqual(revisionNames({ roleId: "convener", requestDocumentRevision: request, submitDocumentRevision: submit }), []);
  assert.deepEqual(revisionNames({ roleId: "convener", requestDocumentRevision: request, durableFixedWorkflow: false }), []);
  assert.deepEqual(revisionNames({ roleId: "convener", requestDocumentRevision: request, currentTurnId: undefined }), []);
});

test("revision request forwards path and reason within a live turn and preserves the actual host status", async () => {
  let currentTurn: string | undefined = "operations-turn";
  const signal = new AbortController();
  const calls: unknown[] = [];
  const tool = tools({ roleId: "convener", currentTurnId: () => currentTurn, async requestDocumentRevision(input, abort) {
    calls.push([input, abort]);
    return request(input, abort);
  } }).find(item => item.name === requestName)!;
  assert.deepEqual(tool.inputSchema.required, ["path", "reason"]);
  assert.equal(tool.inputSchema.additionalProperties, false);
  for (const args of [
    { ...validRequest, path: "../proposal.md" }, { ...validRequest, path: "C:/proposal.md" },
    { ...validRequest, path: "docs\\proposal.md" }, { ...validRequest, path: "docs/.git/proposal.md" },
    { ...validRequest, reason: "   " }, { ...validRequest, reason: "a".repeat(4001) },
    { ...validRequest, roleId: "rapporteur" }, { ...validRequest, approved: true },
  ]) {
    assert.equal((await tool.handler({ name: tool.name, args })).ok, false, JSON.stringify(args).slice(0, 150));
  }
  currentTurn = undefined;
  assert.equal((await tool.handler({ name: tool.name, args: validRequest })).ok, false);
  assert.equal(calls.length, 0);
  currentTurn = "operations-turn";
  const accepted = await tool.handler({ name: tool.name, args: validRequest, signal: signal.signal });
  assert.deepEqual(calls, [[validRequest, signal.signal]]);
  assert.equal(accepted.ok, true);
  assert.match(accepted.message, /"requestId":"rev-1","status":"accepted".*等待派发/);
  assert.doesNotMatch(accepted.message, /客户已选择|已派发/);
  signal.abort();
  assert.equal((await tool.handler({ name: tool.name, args: validRequest, signal: signal.signal })).ok, false);
  assert.equal(calls.length, 1);
});

test("revision submission retains candidate bytes, denies extra scope and reports the actual host refusal", async () => {
  const content = "  # 建议方案\r\n\r\n修订候选。\r\n";
  const calls: unknown[] = [];
  const tool = tools({ roleId: "rapporteur", async submitDocumentRevision(input) {
    calls.push(input);
    return { ok: false, code: "revision-basis-changed", message: "原文件已变化" };
  } }).find(item => item.name === submitName)!;
  assert.deepEqual(tool.inputSchema.required, ["content"]);
  assert.equal(tool.inputSchema.additionalProperties, false);
  for (const args of [
    { content: "" }, { content: "\0abc" }, { content: "字".repeat(Math.ceil(DOCUMENT_REVISION_CONTENT_MAX_BYTES / 3)) },
    { content, path: validRequest.path }, { content, revisionId: "fake" }, { content, decision: "approved" },
  ]) assert.equal((await tool.handler({ name: tool.name, args })).ok, false);
  assert.equal(calls.length, 0);
  assert.deepEqual(await tool.handler({ name: tool.name, args: { content } }), {
    ok: false, message: "submit_document_revision：revision-basis-changed · 原文件已变化",
  });
  assert.deepEqual(calls, [{ content }]);

  const controller = new AbortController();
  const committed = tools({ roleId: "rapporteur", submitDocumentRevision: async input => {
    const receipt = await submit(input);
    controller.abort();
    return receipt;
  } }).find(item => item.name === submitName)!;
  const result = await committed.handler({ name: committed.name, args: { content }, signal: controller.signal });
  assert.equal(result.ok, true);
  assert.match(result.message, /"status":"awaiting-approval"/);
});

test("document-revision cards are reserved for the application and excluded from model choice tools and judging", async () => {
  assert.ok(GOVERNANCE_CARD_KINDS.includes("document-revision"));
  assert.equal(governanceCardGroup("document-revision"), undefined);
  let presented = 0;
  for (const durableFixedWorkflow of [false, true]) {
    const tool = tools({ durableFixedWorkflow, roleId: "chief", customerInput: async () => {
      presented++;
      return { outcome: "declined" };
    } }).find(item => item.name === "request_choice")!;
    assert.doesNotMatch(JSON.stringify(tool.inputSchema), /document-revision/);
    const result = await tool.handler({ name: tool.name, args: {
      title: "确认修订", flowId: "race", cardKind: "document-revision", options: [{ id: "approve-document-revision", label: "批准" }],
    } });
    assert.equal(result.ok, false);
  }
  assert.equal(presented, 0);
});

test("task Git instructions follow the actual A11 transport separately from the lockfile tool", async () => {
  const projectRoot = process.cwd();
  const commands: string[][] = [];
  const git = { match: (argv: readonly string[]) => ({ argv }), async execute(match: object) {
    commands.push([...(match as { argv: readonly string[] }).argv]);
    return { exitCode: 0, stdout: "verified Git result", stderr: "" };
  } };
  const options: GovernedToolsOptions = {
    roleId: "game-engineer", shellGate: async inquiry => inquiry.argv[2] === "foreign.ts"
      ? { allow: false, reason: "outside task", by: "fixture" } : { allow: true, by: "fixture" },
    readonlyGit: git, taskGitAvailable: true,
  };
  for (const lockfileAvailable of [false, true]) {
    const lockfile: GovernedToolsOptions = lockfileAvailable ? {
      projectRoot, skillRoot: projectRoot, writeRoot: projectRoot, fileGateProtocol: "host-facts-v1",
      fileGateProtection: { projectRoot, coverage: "complete", basisDigest: "a".repeat(64), protectedGitRoots: [], reasons: [] },
      claimFileWrite: async () => assert.fail("the task Git presentation does not claim a file write"),
      governedPackageLock: {
        authorize: async () => assert.fail("the task Git presentation does not call the lock generator"),
        generate: async () => assert.fail("the task Git presentation does not call the lock generator"),
      },
    } : {};
    const mounted = tools({ ...options, ...lockfile });
    assert.equal(mounted.some(item => item.name === "generate_package_lock"), lockfileAvailable);
    const shell = mounted.find(item => item.name === "run_shell")!;
    const description = [shell.description, ...(shell.promptGuidelines ?? [])].join("\n");
    assert.match(description, /当前 A11 任务 Git.*git add.*git commit -m/);
    assert.match(description, /submit_report.*OID/);
    assert.doesNotMatch(description, /git_candidate|git_publish/);
    assert.equal((await shell.handler({ name: shell.name, args: { command: "git add approved.ts" } })).ok, true);
    assert.equal((await shell.handler({ name: shell.name, args: { command: "git add foreign.ts" } })).ok, false);
    assert.equal((await shell.handler({ name: shell.name, args: { command: "git commit -m \"Verified work\"" } })).ok, true);
  }
  const transport = [["git", "add", "approved.ts"], ["git", "commit", "-m", "Verified work"]];
  assert.deepEqual(commands, [...transport, ...transport]);
  for (const overrides of [{ taskGitAvailable: false }, { readonlyGit: undefined }]) {
    const shell = tools({ ...options, ...overrides }).find(item => item.name === "run_shell")!;
    assert.doesNotMatch(shell.description, /git add|git commit|git_candidate|git_publish/);
  }
  const legacy = tools({ ...options, durableFixedWorkflow: false }).find(item => item.name === "run_shell")!;
  assert.match(legacy.description, /git_candidate.*git_publish/);
});
