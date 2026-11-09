import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, link, symlink, lstat, readdir, unlink, realpath, rm } from "node:fs/promises";
import { linkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { createServer } from "node:http";
import { registerShellApproval, type ShellApprovalFacts, type ShellApprovalProbeSink } from "../../src/common/shared/shell-approval-binding.ts";
import { buildGovernedTools, GIT_QUERY_TOOL_NAME, GIT_CANDIDATE_TOOL_NAME, GIT_PUBLISH_TOOL_NAME } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter, inspectRuntimeCoreRegistry, createBlockedRoleCapabilityCallbacks, isRuntimeEditReadProbe, inspectRuntimeFileGateContext, type RuntimeSessionOptions } from "../../src/service/runtime/session.ts";
import { beginGitHostAction, endGitHostAction, inspectGitHostCoordinator, recordGitHostInterruption, initializeGitRepository, readGitProtectionFacts } from "../../src/provider/trunk/public/trunk-store.ts";
import { resolveWriteReadPreflight, resolveWriteFinal } from "../../src/service/gate/resolve-write.ts";
import { isGitOid, isGitCapabilityResult, type GitCapabilityResult } from "../../src/model/trunk.ts";
import type { GovernedToolsOptions, GitCandidateRequest, GitQueryRequest, RuntimeNativeToolSurfaceFacts, RuntimeNativeLifecycleFacts, RuntimeProviderOptions, ShellGate, WriteGate, WriteGateContext, CustomerInputOutcome } from "../../src/model/runtime.ts";
import { isRuntimeNativeToolSurfaceFacts, isTaskWorkSourceRef, isTaskParentRef, isTaskReviewBasisRef, isDispatchTaskReviewTarget,
  TASK_HUB_ROUTING, isTaskHubRouting, isTaskReviewControllerRef, isDispatchTaskResumeController,
  type TaskReviewControllerRef, type DispatchTaskResumeController, type TaskReviewBasisRef, type TaskCreatedEvent, type TaskWorkSourceRef, type TaskParentRef } from "../../src/model/runtime.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { allow, role } from "./fixtures.ts";

test("R25 Hub controller is separate from creator/parent; ordinary preparation and historical creators need no final-review reference", () => {
  const reviewBasisRef: TaskReviewBasisRef = { kind: "git-candidate-review", candidateOperationId: "actual-integrate-operation",
    candidate: { objectFormat: "sha1", hex: "a".repeat(40) }, criteria: [{ oid: { objectFormat: "sha1", hex: "b".repeat(40) }, path: "docs/criteria-v1.md", sha256: "c".repeat(64) }] };
  const controller: TaskReviewControllerRef = { kind: "convener-controller", taskId: "actual-live-controller", flowId: "actual-flow", runId: "actual-run", reviewBasisRef };
  assert.equal(isTaskReviewControllerRef(controller), true); assert.equal(isTaskHubRouting(TASK_HUB_ROUTING), true);
  for (const bad of [undefined, null, "legacy", "chief-hub-v2", {}]) assert.equal(isTaskHubRouting(bad), false);
  const preparation: TaskCreatedEvent = { v: 1, at: "2026-11-06T00:00:00Z", kind: "task.created", taskId: "readonly-review-investigation", from: "chief", to: "verifier",
    text: "Investigate available criteria; report blocked if missing", sideEffect: "read-only", idempotencyKey: "prepare-only", hubRouting: TASK_HUB_ROUTING };
  assert.equal(preparation.reviewBasisRef, undefined); assert.equal(preparation.reviewControllerRef, undefined); assert.equal(preparation.runId, undefined);
  const finalReview: TaskCreatedEvent = { ...preparation, taskId: "actual-final-review", reviewBasisRef, reviewControllerRef: controller, runId: controller.runId, flowId: controller.flowId };
  assert.equal(finalReview.from, "chief"); assert.equal(finalReview.parentTaskRef, undefined); assert.equal(finalReview.reviewControllerRef, controller);
  const historical: TaskCreatedEvent = { ...preparation, from: "convener", hubRouting: undefined, parentTaskRef: { kind: "assigned-task", taskId: "old-parent", ledgerSha256: "d".repeat(64) } };
  assert.equal(historical.from, "convener"); assert.equal(historical.parentTaskRef!.taskId, "old-parent"); assert.equal(historical.reviewControllerRef, undefined);
  for (const value of [null, [], {}, ...Object.keys(controller).map(key => Object.fromEntries(Object.entries(controller).filter(([field]) => field !== key))),
    { ...controller, kind: "assigned-task" }, { ...controller, taskId: "" }, { ...controller, flowId: " padded" }, { ...controller, runId: "bad\nrun" },
    { ...controller, parentTaskRef: historical.parentTaskRef }, { ...controller, passed: true },
    { ...controller, reviewBasisRef: { ...reviewBasisRef, candidate: { objectFormat: "sha1", hex: "short" } } }, { ...controller, reviewBasisRef: { ...reviewBasisRef, criteria: [] } },
  ]) assert.equal(isTaskReviewControllerRef(value), false, JSON.stringify(value));
});

test("R25 ordinary Chief preparation reaches each builtin callback without serial completion or final-CID tool arguments", async () => {
  const seen: unknown[] = [], options: GovernedToolsOptions = { roleId: "chief", dispatchTask: async payload => { seen.push(payload); return { ok: true }; } };
  for (const roleId of ["product", "rapporteur", "nominator", "convener", "verifier"]) {
    const args = { roleId, task: "Investigate the actual project context and report missing material", sideEffect: "read-only" };
    assert.equal((await run(options, "dispatch_task", args)).ok, true); assert.deepEqual(seen.at(-1), args);
  }
  assert.equal(seen.length, 5, "tool routing is not proof of actual task creation or action authorization");
  const description = describeTool("dispatch_task"), schema = description.parameters as { required: string[]; properties: Record<string, unknown> };
  assert.deepEqual(schema.required, ["roleId", "task"]); assert.doesNotMatch(description.description, /按序派|一次一步|运营.*与质检/);
  assert.match(description.description, /普通Verifier调查可不指定最终CID/); assert.match(description.description, /实际write\/activate\/publish\/execute仍核/);
});

test("R25 explicit resume has strict expected targets, trusted Chief scope and no void-receipt success", async () => {
  const resumeController: DispatchTaskResumeController = { taskId: "controller-owned", flowId: "actual-flow", runId: "actual-run", reviewTaskId: "actual-review", reviewCloseOperationId: "actual-accepted-close" };
  assert.equal(isDispatchTaskResumeController(resumeController), true);
  const seen: unknown[] = [], options: GovernedToolsOptions = { roleId: "chief", dispatchTask: async payload => { seen.push(payload); return { ok: true, message: "actual host accepted request for the existing queue" }; } };
  const args = { roleId: "convener", task: "Continue delivery in the actual live controller after reviewing its accepted review", flowId: resumeController.flowId, resumeController };
  for (const value of [undefined, null, {}, ...Object.keys(resumeController).map(key => Object.fromEntries(Object.entries(resumeController).filter(([field]) => field !== key))),
    { ...resumeController, taskId: "" }, { ...resumeController, runId: "bad\nrun" }, { ...resumeController, reviewTaskId: " padded" },
    { ...resumeController, reviewCloseOperationId: "x".repeat(501) }, { ...resumeController, approved: true }, { ...resumeController, sourceTaskId: "fake" },
  ]) {
    assert.equal(isDispatchTaskResumeController(value), false, JSON.stringify(value));
    assert.equal((await run(options, "dispatch_task", { ...args, resumeController: value })).ok, false); assert.equal(seen.length, 0);
  }
  for (const bad of [{ ...args, roleId: "verifier" }, { ...args, flowId: "other-flow" }, { ...args, sourceTaskId: "old-source" },
    { ...args, reviewTarget: { operationId: "other-op", candidate: { objectFormat: "sha1", hex: "a".repeat(40) } } }]) {
    assert.equal((await run(options, "dispatch_task", bad)).ok, false); assert.equal(seen.length, 0);
  }
  for (const roleId of [undefined, "convener", "nominator"]) {
    assert.equal((await run({ ...options, roleId }, "dispatch_task", { ...args, actorRoleId: "chief" })).ok, false); assert.equal(seen.length, 0);
  }
  const result = await run(options, "dispatch_task", args); assert.equal(result.ok, true, result.message); assert.match(result.message, /既有运营任务「controller-owned」的续接请求已接收/);
  assert.doesNotMatch(result.message, /任务已派发|已创建|授权已通过/); assert.deepEqual(seen, [args]);
  assert.notEqual((seen[0] as { resumeController: DispatchTaskResumeController }).resumeController, resumeController);
  for (const response of [undefined, null, { ok: false, message: "actual controller is closed or review mismatched" }]) {
    const result = await run({ roleId: "chief", dispatchTask: async () => response }, "dispatch_task", args);
    assert.equal(result.ok, false); assert.doesNotMatch(result.message, /续接请求已接收/);
  }
  assert.equal((await run({ roleId: "chief", dispatchTask: async () => undefined }, "dispatch_task", { roleId: "convener", task: "ordinary legacy preparation" })).ok, true, "legacy non-resume callback semantics remain");
});

test("R25 host Hub marker/controller refs remain absent from model schema and raw spoofing causes zero callbacks", async () => {
  let calls = 0; const options: GovernedToolsOptions = { roleId: "chief", dispatchTask: async () => { calls++; return { ok: true }; } };
  for (const key of ["hubRouting", "reviewControllerRef"]) for (const value of [undefined, null, "chief-hub-v1", {}, { kind: "convener-controller", taskId: "model-controller" }]) {
    const rejected = await run(options, "dispatch_task", { roleId: "verifier", task: "ordinary investigation", [key]: value });
    assert.equal(rejected.ok, false); assert.match(rejected.message, /host-only/); assert.equal(calls, 0);
  }
  const schema = describeTool("dispatch_task").parameters as { properties: Record<string, unknown>; not: { anyOf: { required: string[] }[] }; allOf: unknown[] };
  for (const key of ["hubRouting", "reviewControllerRef"]) { assert.equal(key in schema.properties, false); assert.ok(schema.not.anyOf.some(item => item.required[0] === key)); }
  const resume = schema.properties.resumeController as { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
  assert.deepEqual(resume.required, ["taskId", "flowId", "runId", "reviewTaskId", "reviewCloseOperationId"]); assert.equal(resume.additionalProperties, false);
  assert.equal("approved" in resume.properties, false); assert.equal("criteria" in resume.properties, false); assert.ok(schema.allOf.length > 0);
});

const r24Choice = { title: "确认实际意图", cardKind: "intent-confirm", flowId: "actual-flow", options: [{ id: "confirm", label: "确认需求" }, { id: "revise", label: "修订" }] };
test("R24 choice fact and intent domain apply are distinct: absent stays legacy, pending is not completion, committed is bounded", async () => {
  const legacy: CustomerInputOutcome = { outcome: "answered", value: { selected: ["confirm"] }, operatorId: "customer-actual", decisionId: "retained-actual-decision" };
  let outcome = legacy;
  const options: GovernedToolsOptions = { roleId: "chief", customerInput: async () => outcome };
  const old = await run(options, "request_choice", r24Choice);
  assert.equal(old.ok, true); assert.match(old.message, /客户已选择/); assert.match(old.message, /confirm（确认需求）/);
  assert.doesNotMatch(old.message, /committed|意图确认应用状态|Service已完成/);
  outcome = { ...legacy, intentConfirmation: { status: "pending-recovery", code: "intent-freeze-write-pending", message: "actual finalization requires recovery" } };
  const pending = await run(options, "request_choice", r24Choice);
  assert.equal(pending.ok, false); assert.match(pending.message, /客户已选择/); assert.match(pending.message, /retained-actual-decision/);
  assert.match(pending.message, /pending-recovery.*intent-freeze-write-pending.*actual finalization requires recovery/);
  assert.match(pending.message, /真实选择已保留，应用尚未完成/); assert.doesNotMatch(pending.message, /committed|原Service已完成/); assert.equal("cancelTask" in pending, false);
  outcome = { ...legacy, intentConfirmation: { status: "committed", code: "actual-intent-committed", message: "actual apply completed" } };
  const committed = await run(options, "request_choice", r24Choice);
  assert.equal(committed.ok, true); assert.match(committed.message, /客户已选择/); assert.match(committed.message, /committed.*actual-intent-committed.*actual apply completed/);
  assert.match(committed.message, /原Service已完成本次应用；后续操作仍须通过原有授权校验/);
  outcome = { ...legacy, intentConfirmation: { status: "committed" } };
  assert.equal((await run(options, "request_choice", r24Choice)).ok, true, "code/message are optional");
  outcome = { ...outcome, value: { selected: ["not-offered"] } };
  const inconsistent = await run(options, "request_choice", r24Choice); assert.equal(inconsistent.ok, false); assert.doesNotMatch(inconsistent.message, /原Service已完成/);
});

test("R24 malformed apply replies never become committed and delegated selection retains its real source", async () => {
  for (const intentConfirmation of [null, [], {}, { status: "unknown" }, { status: "completed" }, { code: "missing-status" },
    { status: "committed", code: 1 }, { status: "pending-recovery", message: null }, { status: "committed", approved: true }]) {
    // Exercise actual malformed wire data, not a type assertion broadening the public contract.
    const options: GovernedToolsOptions = { customerInput: async () => JSON.parse(JSON.stringify({ outcome: "answered", value: { selected: ["confirm"] }, intentConfirmation })) };
    const result = await run(options, "request_choice", r24Choice);
    assert.equal(result.ok, false); assert.match(result.message, /客户已选择/); assert.match(result.message, /应用结果未知/); assert.doesNotMatch(result.message, /原Service已完成/);
  }
  const out: CustomerInputOutcome = { outcome: "answered", value: { selected: ["confirm"] },
    actionSource: { kind: "chief-delegated", actorRoleId: "chief", originRoleId: "convener", requestId: "actual-request", baseDigest: "a".repeat(64),
      delegationRevision: 1, disposition: "select", selected: ["confirm"], reason: "actual chief reason", at: "2026-11-06T00:00:00Z" },
    intentConfirmation: { status: "pending-recovery", code: "actual-pending" } };
  const delegated = await run({ customerInput: async () => out }, "request_choice", r24Choice);
  assert.equal(delegated.ok, false); assert.match(delegated.message, /幕僚已选择.*chief-delegated/); assert.match(delegated.message, /actual chief reason/);
  assert.match(delegated.message, /pending-recovery.*actual-pending/); assert.doesNotMatch(delegated.message, /客户已选择|原Service已完成/); assert.equal("cancelTask" in delegated, false);
});

test("R24 model host result fields are rejected before the real choice callback and never enter request schema", async () => {
  let calls = 0;
  const options: GovernedToolsOptions = { customerInput: async request => {
    calls++; assert.equal("intentConfirmation" in request, false); assert.equal("domainApply" in request, false);
    return { outcome: "answered", value: { selected: ["confirm"] } };
  } };
  for (const key of ["intentConfirmation", "domainApply"]) for (const value of [undefined, null, true, { status: "committed" }, { status: "pending-recovery", code: "model" }]) {
    const result = await run(options, "request_choice", { ...r24Choice, [key]: value });
    assert.equal(result.ok, false); assert.match(result.message, /host-only/); assert.equal(calls, 0);
  }
  const schema = describeTool("request_choice").parameters.properties as Record<string, unknown>;
  assert.equal("intentConfirmation" in schema, false); assert.equal("domainApply" in schema, false);
  assert.equal((await run(options, "request_choice", r24Choice)).ok, true); assert.equal(calls, 1);
});

test("R22 host review basis is exact bounded unique Git material, never a passed verdict or a synthetic legacy field", () => {
  const candidate = { objectFormat: "sha1" as const, hex: "a".repeat(40) };
  const criterion = { oid: { objectFormat: "sha1" as const, hex: "b".repeat(40) }, path: "docs/product/proposal-v1.md", sha256: "c".repeat(64) };
  const ref: TaskReviewBasisRef = { kind: "git-candidate-review", candidateOperationId: "opaque-candidate-operation", candidate, criteria: [criterion] };
  assert.equal(isTaskReviewBasisRef(ref), true);
  assert.equal(isTaskReviewBasisRef({ ...ref, candidate: { objectFormat: "sha256", hex: "d".repeat(64) } }), true);
  assert.equal(isTaskReviewBasisRef({ ...ref, criteria: Array.from({ length: 16 }, (_, i) => ({ ...criterion, path: `docs/criteria-${i}.md` })) }), true);
  const legacy: TaskCreatedEvent = { v: 1, at: "2026-11-06T00:00:00.000Z", kind: "task.created", taskId: "old-task", from: "convener", to: "verifier",
    text: "review", sideEffect: "read-only", idempotencyKey: "old-key" };
  const host: TaskCreatedEvent = { ...legacy, reviewBasisRef: ref }; assert.equal(host.reviewBasisRef, ref); assert.equal("reviewBasisRef" in legacy, false);
  const missing = Object.keys(ref).map(key => Object.fromEntries(Object.entries(ref).filter(([field]) => field !== key)));
  const badOids = [null, {}, { ...candidate, hex: "a".repeat(39) }, { ...candidate, hex: `${candidate.hex}\n` },
    { objectFormat: "sha256", hex: "a".repeat(40) }, { ...candidate, approved: true }];
  for (const value of [null, [], {}, ...missing, { ...ref, kind: "passed" }, { ...ref, candidateOperationId: "" }, { ...ref, candidateOperationId: " padded" },
    { ...ref, candidateOperationId: "x".repeat(501) }, { ...ref, criteria: [] }, { ...ref, criteria: Array(17).fill(criterion) },
    { ...ref, criteria: [criterion, { ...criterion, oid: { ...criterion.oid, hex: criterion.oid.hex.toUpperCase() } }] },
    { ...ref, approved: true }, { ...ref, passed: true }, { ...ref, source: "trusted" }, ...badOids.map(candidate => ({ ...ref, candidate })),
    ...["../secret", "/absolute", "docs/.git/config", ":(glob)*", "docs/*", "docs\\proposal.md"].map(path => ({ ...ref, criteria: [{ ...criterion, path }] })),
    ...[null, { ...criterion, sha256: "c".repeat(63) }, { ...criterion, sha256: `${criterion.sha256}\n` }, { ...criterion, passed: true },
      { ...criterion, oid: { ...criterion.oid, extra: true } }].map(criterion => ({ ...ref, criteria: [criterion] })),
  ]) assert.equal(isTaskReviewBasisRef(value), false, JSON.stringify(value));
});

test("R22 production dispatch preserves only strict expected reviewTarget; forged host material rejects with zero callbacks", async () => {
  const reviewTarget = { operationId: "actual-candidate-operation", candidate: { objectFormat: "sha256" as const, hex: "a".repeat(64) } };
  assert.equal(isDispatchTaskReviewTarget(reviewTarget), true);
  const calls: unknown[] = [], options: GovernedToolsOptions = { roleId: "convener", dispatchTask: async payload => { calls.push(payload); return { ok: true }; } };
  const normal = { roleId: "verifier", task: "review the actual immutable candidate", sideEffect: "read-only", requestedEvidence: ["ordinary passed/ref/criteria words remain evidence text"] };
  for (const key of ["reviewBasisRef", "criteria", "ref", "approved", "approval", "passed"]) for (const value of [undefined, null, {}, true]) {
    const rejected = await run(options, "dispatch_task", { ...normal, reviewTarget, [key]: value });
    assert.equal(rejected.ok, false); assert.match(rejected.message, /host-only/); assert.equal(calls.length, 0);
  }
  for (const target of [undefined, null, {}, { ...reviewTarget, operationId: "" }, { ...reviewTarget, operationId: "bad\nid" },
    { ...reviewTarget, operationId: " padded" }, { ...reviewTarget, candidate: { objectFormat: "sha256", hex: "a".repeat(40) } },
    { ...reviewTarget, candidate: { ...reviewTarget.candidate, passed: true } }, { ...reviewTarget, criteria: [] }, { ...reviewTarget, ref: "fake-ref" },
    { ...reviewTarget, approved: true }, { ...reviewTarget, passed: true }, { ...reviewTarget, reviewBasisRef: {} },
  ]) {
    assert.equal(isDispatchTaskReviewTarget(target), false, JSON.stringify(target));
    const rejected = await run(options, "dispatch_task", { ...normal, reviewTarget: target });
    assert.equal(rejected.ok, false); assert.match(rejected.message, /reviewTarget/); assert.equal(calls.length, 0);
  }
  const result = await run(options, "dispatch_task", { ...normal, reviewTarget });
  assert.equal(result.ok, true, result.message); assert.deepEqual(calls, [{ ...normal, reviewTarget }]);
  const payload = calls[0] as { reviewTarget: typeof reviewTarget }; assert.notEqual(payload.reviewTarget, reviewTarget); assert.notEqual(payload.reviewTarget.candidate, reviewTarget.candidate);
  assert.equal((await run(options, "dispatch_task", normal)).ok, true); assert.deepEqual(calls[1], normal, "legacy has no inferred host basis");
  const schema = describeTool("dispatch_task").parameters as { properties: Record<string, unknown>; not: { anyOf: { required: string[] }[] }; additionalProperties: boolean };
  const target = schema.properties.reviewTarget as { properties: Record<string, { additionalProperties?: boolean }>; required: string[]; additionalProperties: boolean };
  assert.deepEqual(target.required, ["operationId", "candidate"]); assert.equal(target.additionalProperties, false); assert.equal(target.properties.candidate.additionalProperties, false);
  for (const key of ["reviewBasisRef", "criteria", "ref", "approved", "approval", "passed"]) {
    assert.equal(key in schema.properties, false); assert.ok(schema.not.anyOf.some(rule => rule.required[0] === key)); assert.equal(key in target.properties, false);
  }
  assert.equal(schema.additionalProperties, true, "unrelated legacy aliases remain as before");
});

test("R21 result basis/source are optional pure shapes; legacy results gain no inferred code basis", () => {
  const receipt: GitCapabilityResult = { operationId: "r21-operation", repoId: "owned-repo", status: "observed",
    basis: { ref: "refs/ans/trunk", oid: { objectFormat: "sha256", hex: "a".repeat(64) } },
    basisSource: { kind: "assigned-run", runId: "opaque-historical-run", pinDigest: "b".repeat(64), runRecordSha256: "c".repeat(64) } };
  assert.equal(isGitCapabilityResult(receipt), true);
  const legacy: GitCapabilityResult = { operationId: "legacy-query", repoId: "owned-repo", status: "observed" };
  assert.equal(isGitCapabilityResult(legacy), true); assert.equal(Object.hasOwn(legacy, "basis"), false); assert.equal(Object.hasOwn(legacy, "basisSource"), false);
  for (const basis of [null, {}, { ...receipt.basis, ref: "HEAD" }, { ...receipt.basis, oid: { objectFormat: "sha256", hex: "a".repeat(40) } },
    { ...receipt.basis, oid: { objectFormat: "sha1", hex: "a".repeat(39) } }]) assert.equal(isGitCapabilityResult({ ...receipt, basis }), false, JSON.stringify(basis));
  const source = receipt.basisSource!;
  for (const basisSource of [null, [], {}, ...Object.keys(source).map(key => Object.fromEntries(Object.entries(source).filter(([field]) => field !== key))),
    { ...source, kind: "latest" }, { ...source, runId: "" }, { ...source, runId: " padded" }, { ...source, runId: "bad\nrun" },
    { ...source, pinDigest: "g".repeat(64) }, { ...source, pinDigest: "b".repeat(63) }, { ...source, runRecordSha256: "c".repeat(65) },
    { ...source, approved: true }, { ...source, authorizationRevision: 1 }, { ...source, latest: true },
  ]) assert.equal(isGitCapabilityResult({ ...receipt, basisSource }), false, JSON.stringify(basisSource));
});

test("R21 production Git tool preserves real result basis/source and rejects them as extra query host inputs", async () => {
  const basis = { ref: "refs/ans/trunk", oid: { objectFormat: "sha1" as const, hex: "a".repeat(40) } };
  const basisSource = { kind: "assigned-run" as const, runId: "owned-assigned-run", pinDigest: "b".repeat(64), runRecordSha256: "c".repeat(64) };
  const receipt: GitCapabilityResult = { operationId: "r21-query", repoId: "owned-repo", status: "observed", basis, basisSource };
  let calls = 0;
  const options: GovernedToolsOptions = { roleId: "project-worker", gitQuery: async () => { calls++; return receipt; } };
  const args = { operationId: receipt.operationId, template: "status" };
  const result = await run(options, GIT_QUERY_TOOL_NAME, args);
  assert.equal(result.ok, true, result.message); assert.deepEqual(decode(GIT_QUERY_TOOL_NAME, result.message), receipt); assert.equal(calls, 1);
  for (const extra of [{ basis }, { basisSource }, { basis: null }, { basisSource: undefined }]) {
    const rejected = await run(options, GIT_QUERY_TOOL_NAME, { ...args, ...extra });
    assert.equal(rejected.ok, false); assert.match(rejected.message, /invalid-arguments/); assert.equal(calls, 1);
  }
  const legacy = await run({ roleId: "worker", gitQuery: async () => ({ operationId: "legacy", repoId: "owned-repo", status: "observed" }) },
    GIT_QUERY_TOOL_NAME, { operationId: "legacy", template: "status" });
  assert.equal(legacy.ok, true); const old = decode(GIT_QUERY_TOOL_NAME, legacy.message); assert.equal("basis" in old, false); assert.equal("basisSource" in old, false);
  const schema = describeTool(GIT_QUERY_TOOL_NAME).parameters.properties as Record<string, unknown>;
  assert.equal("basis" in schema, false); assert.equal("basisSource" in schema, false);
});

test("R20 default Core/default Chat binds true dual roots and repo observations to actual write/edit stages", async t => {
  const root = await mkdtemp(join(tmpdir(), "ans-r20-default-chat-")), skillRoot = join(root, "actual-skills-root");
  await mkdir(skillRoot); await initializeGitRepository(root);
  const protection = await readGitProtectionFacts(root); assert.equal(protection.coverage, "complete", JSON.stringify(protection.reasons));
  const old = "\uFEFForiginal\r\n", expected = "\uFEFFchanged\r\n", file = join(root, "allowed", "doc.txt");
  const actions = [
    { name: "ans_write_file", arguments: { path: "allowed/doc.txt", content: "bad", stage: "final-write" } },
    { name: "ans_write_file", arguments: { path: "allowed/doc.txt", content: old } },
    { name: "ans_edit_file", arguments: { path: "allowed/doc.txt", old_string: "original", new_string: "changed" } },
  ];
  const bodies: Array<{ tools?: Array<{ function: { name: string; parameters: Record<string, unknown> } }>; messages?: Array<{ role: string; content?: unknown }> }> = [];
  const stages: string[] = [], issued: WriteGateContext[] = [];
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk; bodies.push(JSON.parse(raw));
    const action = actions[bodies.length - 1];
    const message = action ? { role: "assistant", tool_calls: [{ id: `r20-call-${bodies.length}`, type: "function", function: { name: action.name, arguments: JSON.stringify(action.arguments) } }] }
      : { role: "assistant", content: "actual registered file tools completed" };
    response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ id: "r20-owned-local", choices: [{ index: 0, finish_reason: "stop", message }] }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const previous = ["ANS_CODEX_WIRE_API", "ANS_CODEX_WEB_SEARCH", "ANS_R20_LOCAL_KEY"].map(name => [name, process.env[name]] as const);
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_R20_LOCAL_KEY = "owned-local-only";
  let session: import("../../src/model/runtime.ts").RoleSession | undefined;
  const boundary = { entries: [{ root: "project" as const, path: "allowed", kind: "directory" as const, purpose: "owned fixture" }], boundarySource: "unit", acceptance: { accepted: true, source: "unit" } };
  const scope = { writeSet: ["allowed/doc.txt"], conditions: [] };
  const gate: WriteGate = (target, context) => {
    if (!context?.stage || !context.operation) return { allowed: false, reason: "host facts required", allowedByRoot: { project: [], skill: [] } };
    const facts = inspectRuntimeFileGateContext(context, target, context.operation, context.stage); assert.ok(facts);
    assert.equal(facts.projectRoot, root); assert.equal(facts.skillRoot, skillRoot); assert.equal(facts.targetPath, file);
    issued.push(context); stages.push(`${facts.operation}:${facts.stage}`);
    if (facts.canonicalFacts) { assert.equal(facts.canonicalFacts.basisDigest, protection.basisDigest); assert.equal(facts.canonicalFacts.coverage, "complete"); }
    if (facts.stage === "final-write") {
      assert.deepEqual(facts.currentFile, facts.operation === "write" ? { state: "missing" } : { state: "present", sha256: createHash("sha256").update(old).digest("hex") });
      assert.equal(facts.contentSha256, createHash("sha256").update(facts.operation === "write" ? old : expected).digest("hex"));
      return resolveWriteFinal(target, boundary, scope, facts);
    }
    return resolveWriteReadPreflight(target, boundary, scope, facts);
  };
  try {
    const adapter = createRuntimeAdapter({ runtime: "codex", gate, projectRoot: root, skillRoot, writeRoot: root,
      fileGateProtocol: "host-facts-v1", fileGateProtection: protection, protectedGitRoots: protection.protectedGitRoots,
      baseUrl: `http://127.0.0.1:${address.port}/v1`, modelId: "r20-owned-local", apiKeyEnvVar: "ANS_R20_LOCAL_KEY", turnLastResortMs: 5000 });
    const prepared = await adapter.prepareRole!(role("worker")); assert.equal(prepared.plan.status, "observed", JSON.stringify(prepared.plan.reasons));
    session = await adapter.bindPreparedRole!(prepared.token!); await session.prompt("exercise actual registered write and edit tools");
    assert.equal(bodies.length, 4); assert.deepEqual(await readFile(file), Buffer.from(expected));
    assert.deepEqual(stages, ["write:lexical-read", "write:canonical-read", "write:final-write", "edit:lexical-read", "edit:canonical-read", "edit:final-write"]);
    const rejected = bodies[1]!.messages!.find(message => message.role === "tool"); assert.match(String(rejected!.content), /stage.*host-only/);
    const schema = bodies[0]!.tools!.find(tool => tool.function.name === "ans_write_file")!.function.parameters as { properties: Record<string, unknown>; not: unknown };
    assert.equal("fileFacts" in schema.properties, false); assert.ok(schema.not);
    for (const context of issued) assert.equal(inspectRuntimeFileGateContext(context, file, context.operation!, context.stage!), undefined);
    t.diagnostic(JSON.stringify({ actualDefaultCoreAndChat: true, roots: [root, skillRoot], sourceBasisDigest: protection.basisDigest, http: bodies.length, stages, modelHostInjection: "rejected-before-gate" }));
  } finally {
    await session?.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    for (const [name, value] of previous) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

const oid = { objectFormat: "sha1" as const, hex: "a".repeat(40) }, tree = { objectFormat: "sha1" as const, hex: "b".repeat(40) };
const base = { ref: "refs/ans/trunk", oid };
const observed: GitCapabilityResult = { operationId: "op-1", repoId: "repo-owned", status: "observed", output: "bounded output", truncated: true };
const prepared: GitCapabilityResult = { operationId: "op-1", repoId: "repo-owned", status: "prepared", candidate: oid, tree, parents: [] };
const published: GitCapabilityResult = { operationId: "op-1", repoId: "repo-owned", status: "published", published: { ref: "refs/ans/trunk", oid } };
const query = { operationId: "op-1", template: "status" };
const commit = { operationId: "op-1", action: "commit", base, paths: ["docs/a.md"], message: "owned change" };
const publish = { operationId: "op-1", target: "documents", expected: base, candidate: oid, criteria: [], evidence: [] };
const toolsFor = (options: GovernedToolsOptions = {}) => new Map(buildGovernedTools(allow, options).map(tool => [tool.name, tool]));
const run = (options: GovernedToolsOptions, name: string, args: Record<string, unknown>, signal?: AbortSignal) => toolsFor(options).get(name)!.handler({ name, args, signal });
const names = [GIT_QUERY_TOOL_NAME, GIT_CANDIDATE_TOOL_NAME, GIT_PUBLISH_TOOL_NAME];
const decode = (name: string, message: string) => JSON.parse(message.slice(name.length + 2));

test("R18 parent refs are pure host ledger references; legacy/top-level records acquire no synthetic parent", () => {
  const parent: TaskParentRef = { kind: "assigned-task", taskId: "opaque-legacy-parent-id", ledgerSha256: "a".repeat(64) };
  assert.equal(isTaskParentRef(parent), true); assert.equal(isTaskParentRef({ ...parent, ledgerSha256: "B".repeat(64) }), true);
  const legacy: TaskCreatedEvent = { v: 1, at: "2026-11-06T00:00:00.000Z", kind: "task.created", taskId: "child-opaque",
    from: "convener", to: "worker", text: "actual assignment", sideEffect: "code", idempotencyKey: "host-operation" };
  const actualHostRecord: TaskCreatedEvent = { ...legacy, parentTaskRef: parent };
  assert.equal(actualHostRecord.parentTaskRef, parent); assert.equal("parentTaskRef" in legacy, false);
  const sourceId = `init-source-${"c".repeat(64)}`, workSourceRef: TaskWorkSourceRef = { kind: "chief-customer-turn", sourceId,
    path: `.ans/trunk/initialization-sources/${sourceId}.json`, sha256: "d".repeat(64) };
  const topLevel: TaskCreatedEvent = { ...legacy, from: "chief", to: "convener", workSourceRef };
  assert.equal(isTaskWorkSourceRef(topLevel.workSourceRef), true); assert.equal(topLevel.parentTaskRef, undefined);
  assert.equal(isTaskParentRef(workSourceRef), false);
  for (const bad of [null, [], {}, ...Object.keys(parent).map(key => Object.fromEntries(Object.entries(parent).filter(([field]) => field !== key))),
    { ...parent, kind: "customer-turn" }, { ...parent, taskId: "" }, { ...parent, taskId: "  " }, { ...parent, taskId: " padded" },
    { ...parent, taskId: "bad\nid" }, { ...parent, taskId: 1 }, { ...parent, ledgerSha256: "a".repeat(63) }, { ...parent, ledgerSha256: "g".repeat(64) },
    { ...parent, ledgerSha256: `${parent.ledgerSha256}\n` }, { ...parent, approved: true }, { ...parent, sourceTaskId: parent.taskId },
    { ...parent, flowId: "other-flow" }, { ...parent, runId: "other-run" }, { kind: "assigned-task", sourceTaskId: parent.taskId, ledgerSha256: parent.ledgerSha256 },
  ]) assert.equal(isTaskParentRef(bad), false, JSON.stringify(bad));
});

test("R18 dispatch production raw entry rejects every host parent value before callback and preserves normal model payload", async () => {
  const calls: unknown[] = [], options: GovernedToolsOptions = { roleId: "convener", dispatchTask: async payload => { calls.push(payload); return { ok: true }; } };
  const legitimate = { roleId: "worker", task: "self-contained actual child", requestedEvidence: ["ans-work-source:ordinary evidence"] };
  for (const parentTaskRef of [undefined, null, false, 1, "fake-id", {}, { kind: "assigned-task", taskId: "actual-shaped-id", ledgerSha256: "a".repeat(64) }]) {
    const result = await run(options, "dispatch_task", { ...legitimate, parentTaskRef });
    assert.equal(result.ok, false); assert.match(result.message, /parentTaskRef.*host-only/); assert.equal(calls.length, 0);
  }
  const result = await run(options, "dispatch_task", { ...legitimate, sourceTaskId: "model-cannot-select-parent" });
  assert.equal(result.ok, true); assert.deepEqual(calls, [legitimate]);
  const schema = toolsFor(options).get("dispatch_task")!.inputSchema as { properties: Record<string, unknown>; not: unknown; additionalProperties: boolean };
  assert.equal("parentTaskRef" in schema.properties, false); assert.equal("workSourceRef" in schema.properties, false);
  assert.deepEqual(schema.not, { anyOf: ["workSourceRef", "parentTaskRef", "reviewBasisRef", "reviewControllerRef", "hubRouting", "criteria", "ref", "approved", "approval", "passed"].map(key => ({ required: [key] })) });
  assert.equal(schema.additionalProperties, true, "unrelated legacy extra/alias behavior is preserved");
});

test("R18 actual default Core/Chat transmits the parent-free schema and rejects model JSON before dispatch", async t => {
  const root = await mkdtemp(join(tmpdir(), "ans-r18-parent-tool-")); let calls = 0;
  const bodies: Array<{ tools?: Array<{ function: { name: string; parameters: Record<string, unknown> } }>; messages?: Array<{ role: string; content?: unknown }> }> = [];
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk; bodies.push(JSON.parse(raw));
    const args = bodies.length === 1 ? { roleId: "worker", task: "actual forged parent case", parentTaskRef: { kind: "assigned-task", taskId: "model-parent", ledgerSha256: "a".repeat(64) } }
      : { roleId: "worker", task: "normal dispatch after rejection" };
    const message = bodies.length <= 2 ? { role: "assistant", tool_calls: [{ id: `r18-call-${bodies.length}`, type: "function", function: { name: "ans_dispatch_task", arguments: JSON.stringify(args) } }] }
      : { role: "assistant", content: "completed actual tool cases" };
    response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ id: "r18-local", choices: [{ index: 0, finish_reason: "stop", message }] }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const previous = ["ANS_CODEX_WIRE_API", "ANS_CODEX_WEB_SEARCH", "ANS_R18_LOCAL_KEY"].map(name => [name, process.env[name]] as const);
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_R18_LOCAL_KEY = "owned-local-only";
  let session: import("../../src/model/runtime.ts").RoleSession | undefined;
  try {
    const adapter = createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, baseUrl: `http://127.0.0.1:${address.port}/v1`,
      modelId: "r18-parent-boundary", apiKeyEnvVar: "ANS_R18_LOCAL_KEY", turnLastResortMs: 5000,
      dispatchTask: async payload => { calls++; assert.equal("parentTaskRef" in payload, false); return { ok: true, message: "host callback accepted normal input" }; } });
    const prepared = await adapter.prepareRole!(role("convener")); assert.equal(prepared.plan.status, "observed");
    session = await adapter.bindPreparedRole!(prepared.token!); await session.prompt("perform actual parent-forgery and ordinary dispatch cases");
    assert.equal(calls, 1); assert.equal(bodies.length, 3);
    const transmitted = bodies[0]!.tools!.find(tool => tool.function.name === "ans_dispatch_task")!.function.parameters;
    assert.deepEqual(transmitted.not, { anyOf: ["workSourceRef", "parentTaskRef", "reviewBasisRef", "reviewControllerRef", "hubRouting", "criteria", "ref", "approved", "approval", "passed"].map(key => ({ required: [key] })) });
    const rejected = bodies[1]!.messages!.filter(message => message.role === "tool");
    assert.equal(rejected.length, 1); assert.match(String(rejected[0]!.content), /parentTaskRef.*host-only/);
    t.diagnostic(JSON.stringify({ root, actualDefaultChat: true, http: bodies.length, normalDispatchCallbacks: calls, forgedParentCallbacks: 0 }));
  } finally { await session?.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    for (const [name, value] of previous) if (value === undefined) delete process.env[name]; else process.env[name] = value; }
});

test("R16 strict stable hash admission uses actual final bytes on first write and authentic read-only edit preflight", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-r16-content-")), file = join(root, "workflow.md");
  const original = "\uFEFF中文\r\noriginal\r\n🙂", changed = original.replace("original", "changed");
  const hash = (text: string) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  let approvedHash = hash(original), approvedRead = true;
  const seen: Array<{ target: string; context?: WriteGateContext; read: boolean }> = [];
  const denied = (reason: string) => ({ allowed: false as const, reason, allowedByRoot: { project: [], skill: [] } });
  const gate: WriteGate = (target, context) => {
    const read = isRuntimeEditReadProbe(context, target); seen.push({ target, context, read });
    if (target !== file) return denied("role target denied");
    if (read) return approvedRead ? allow(target) : denied("role read denied");
    if (!context?.contentSha256 || context.contentSha256 !== approvedHash) return denied("stable permit hash mismatch or missing");
    return allow(target);
  };
  const tools = new Map(buildGovernedTools(gate, { writeRoot: root }).map(tool => [tool.name, tool]));
  const write = await tools.get("write_file")!.handler({ name: "write_file", args: { path: "workflow.md", content: original } });
  assert.equal(write.ok, true, write.message); assert.equal(seen.length, 2);
  assert.deepEqual(seen[0]!.context, { contentSha256: approvedHash, operation: "write" }); assert.deepEqual(seen[1]!.context, seen[0]!.context);
  assert.deepEqual(await readFile(file), Buffer.from(original, "utf8"));
  approvedHash = hash(changed); seen.length = 0;
  const edit = await tools.get("edit_file")!.handler({ name: "edit_file", args: { path: "workflow.md", old_string: "original", new_string: "changed" } });
  assert.equal(edit.ok, true, edit.message); assert.equal(seen.length, 2); assert.equal(seen[0]!.read, true);
  assert.deepEqual(seen[0]!.context, { phase: "edit-read", operation: "edit" });
  assert.deepEqual(seen[1]!.context, { contentSha256: hash(changed), operation: "edit" });
  assert.deepEqual(await readFile(file), Buffer.from(changed, "utf8"));
  const probe = seen[0]!.context!;
  assert.equal(Object.isFrozen(probe), true); assert.equal(isRuntimeEditReadProbe({ ...probe }, file), false);
  assert.equal(isRuntimeEditReadProbe(probe, join(root, "other.md")), false);
  assert.equal(gate(file).allowed, false); assert.equal(gate(file, { phase: "edit-read", operation: "edit" }).allowed, false);
  assert.equal(gate(file, { operation: "write" }).allowed, false, "opaque/hashless probes never acquire stable-write authority");
  approvedRead = false;
  const rejected = await tools.get("edit_file")!.handler({ name: "edit_file", args: { path: "workflow.md", old_string: "changed", new_string: "bad" } });
  assert.equal(rejected.ok, false); assert.match(rejected.message, /role read denied/); assert.equal(await readFile(file, "utf8"), changed);
});

test("R16 unauthorized reads, forged host context, wrong final hash and final revocation cannot write", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-r16-denials-")), file = join(root, "workflow.md"); await writeFile(file, "original");
  const fs = createRequire(import.meta.url)("node:fs/promises") as typeof import("node:fs/promises");
  const originalRead = fs.readFile; let targetReads = 0, gateCalls = 0;
  fs.readFile = ((...args: Parameters<typeof originalRead>) => { if (String(args[0]) === file) targetReads++; return originalRead(...args); }) as typeof originalRead;
  syncBuiltinESMExports();
  const deny = (reason: string) => ({ allowed: false as const, reason, allowedByRoot: { project: [], skill: [] } });
  try {
    const noRead: WriteGate = () => { gateCalls++; return deny("no read authorization"); };
    assert.equal((await new Map(buildGovernedTools(noRead, { writeRoot: root }).map(tool => [tool.name, tool])).get("edit_file")!.handler({
      name: "edit_file", args: { path: "workflow.md", old_string: "original", new_string: "bad" },
    })).ok, false); assert.equal(targetReads, 0); assert.equal(gateCalls, 1);
    const wrongHash: WriteGate = (target, context) => isRuntimeEditReadProbe(context, target) ? allow(target) : deny("final content permit mismatch");
    const edit = new Map(buildGovernedTools(wrongHash, { writeRoot: root }).map(tool => [tool.name, tool])).get("edit_file")!;
    const denied = await edit.handler({ name: "edit_file", args: { path: "workflow.md", old_string: "original", new_string: "bad" } });
    assert.equal(denied.ok, false); assert.match(denied.message, /final content permit mismatch/); assert.equal(targetReads, 1);
    const beforeForged = gateCalls;
    for (const name of ["write_file", "edit_file"]) for (const key of ["phase", "context", "contentSha256", "operation", "editReadProbe"]) {
      const tools = new Map(buildGovernedTools(noRead, { writeRoot: root }).map(tool => [tool.name, tool]));
      const result = await tools.get(name)!.handler({ name, args: { path: "workflow.md", content: "bad", old_string: "original", new_string: "bad", [key]: key === "phase" ? "edit-read" : undefined } });
      assert.equal(result.ok, false); assert.match(result.message, /host-only/);
    }
    assert.equal(gateCalls, beforeForged); assert.equal(targetReads, 1);
  } finally { fs.readFile = originalRead; syncBuiltinESMExports(); }
  assert.equal(await readFile(file, "utf8"), "original");
  let calls = 0;
  const revoke: WriteGate = (target, context) => { calls++; assert.match(context!.contentSha256!, /^[a-f0-9]{64}$/); return calls === 1 ? allow(target) : deny("permit revoked before commit"); };
  const tools = new Map(buildGovernedTools(revoke, { writeRoot: root }).map(tool => [tool.name, tool]));
  const refused = await tools.get("write_file")!.handler({ name: "write_file", args: { path: "new/file.txt", content: "actual final bytes" } });
  assert.equal(refused.ok, false); assert.equal(calls, 2); await assert.rejects(lstat(join(root, "new", "file.txt")), { code: "ENOENT" });
  const legacy: WriteGate = target => allow(target);
  assert.equal(legacy("legacy direct call").allowed, true);
  assert.equal((await new Map(buildGovernedTools(legacy, { writeRoot: root }).map(tool => [tool.name, tool])).get("write_file")!.handler({
    name: "write_file", args: { path: "legacy.txt", content: "legacy" },
  })).ok, true);
});

test("R16 default Core writes approved workflow bytes through a strict host SHA gate and real after-write receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-r16-core-")), file = join(root, "workflow.md"), bytes = "workflow approved bytes\r\n";
  const approvedHash = createHash("sha256").update(Buffer.from(bytes)).digest("hex"); let receipts = 0;
  const contexts: WriteGateContext[] = [];
  const gate: WriteGate = (target, context) => {
    if (target !== file || context?.contentSha256 !== approvedHash || context.operation !== "write")
      return { allowed: false, reason: "strict stable permit requires the approved actual bytes", allowedByRoot: { project: [], skill: [] } };
    contexts.push(context); return allow(target);
  };
  const session = await createRuntimeAdapter({ runtime: "demo", projectRoot: root, skillRoot: root, writeRoot: root, gate,
    versionedDocAfterWrite: async target => { assert.equal(target, file); assert.equal(createHash("sha256").update(await readFile(target)).digest("hex"), approvedHash); receipts++; return true; },
    script: [{ name: "write_file", args: { path: "workflow.md", content: bytes } }],
  }).bindRole(role("convener"));
  try { await session.prompt("owned strict gate workflow write"); assert.equal(await readFile(file, "utf8"), bytes); assert.equal(receipts, 1);
    assert.equal(contexts.length, 2); assert.deepEqual(contexts[0], contexts[1]); }
  finally { await session.dispose(); }
});

test("R15 real blocked callbacks bind the protected default Chat surface; forged identities and drift never gain admission", async t => {
  const root = await mkdtemp(join(tmpdir(), "ans-r15-required-")), sourceId = `init-source-${"e".repeat(64)}`;
  const sourceDir = join(root, ".ans", "trunk", "initialization-sources"); await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, `${sourceId}.json`), JSON.stringify({ schema: "repository-work-source/v1", kind: "customer-turn", sourceId, projectRoot: root }));
  const capabilityNames = ["install_skill", "uninstall_skill", "install_mcp", "uninstall_mcp"];
  const bodies: Array<{ messages?: Array<{ role?: string; content?: unknown }> }> = [];
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk; bodies.push(JSON.parse(raw));
    const message = bodies.length === 1 ? { role: "assistant", tool_calls: capabilityNames.map((name, index) => ({ id: `r15-call-${index}`, type: "function",
      function: { name: `ans_${name}`, arguments: JSON.stringify({ roleId: "project-worker", name: "owned-fixture", roleCapabilityGuards: { status: "bound", safe: true } }) } })) }
      : { role: "assistant", content: "all four actual tools returned explicit blocks" };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: "r15-local", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message }] }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const oldWire = process.env.ANS_CODEX_WIRE_API, oldSearch = process.env.ANS_CODEX_WEB_SEARCH, oldKey = process.env.ANS_R15_LOCAL_KEY;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_R15_LOCAL_KEY = "owned-local-only";
  const crypto = createRequire(import.meta.url)("node:crypto") as typeof import("node:crypto"); const originalUUID = crypto.randomUUID;
  let nativeConstructions = 0, oldEffects = 0;
  crypto.randomUUID = ((...args: Parameters<typeof originalUUID>) => { if (new Error().stack?.includes("createCodexChatSession")) nativeConstructions++; return originalUUID(...args); }) as typeof originalUUID;
  syncBuiltinESMExports(); let session: import("../../src/model/runtime.ts").RoleSession | undefined;
  const oldEffect = async () => { oldEffects++; return { ok: false as const, reason: "old-effect", message: "must never execute" }; };
  try {
    const common = { runtime: "codex" as const, gate: allow, projectRoot: root, skillRoot: root, baseUrl: `http://127.0.0.1:${address.port}/v1`, modelId: "r15-owned-chat", apiKeyEnvVar: "ANS_R15_LOCAL_KEY", turnLastResortMs: 5000 };
    assert.equal(createBlockedRoleCapabilityCallbacks.length, 0);
    const callbacks = createBlockedRoleCapabilityCallbacks(); assert.equal(Object.isFrozen(callbacks), true);
    for (const callback of Object.values(callbacks)) { assert.equal(Object.isFrozen(callback), true); assert.deepEqual(await callback({ roleId: "worker", name: "owned" }),
      { ok: false, reason: "effect-scope-unproven", message: `${Object.entries(callbacks).find(([, fn]) => fn === callback)![0].replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}: blocked; effect scope is unproven` }); }
    const fake = Object.assign(async function installSkill() { return oldEffect(); }, { roleCapabilityGuards: { status: "bound", mechanism: "no-effect-rejection-v1" } });
    const forgedOptions = { ...common, installSkill: fake, uninstallSkill: fake, installMcp: fake, uninstallMcp: fake,
      roleCapabilityGuards: { status: "bound", safe: true, guardedTools: capabilityNames } } as RuntimeSessionOptions;
    const forged = createRuntimeAdapter(forgedOptions), forgedActor = role("r15-forged-nominator");
    const forgedPlan = await forged.prepareRole!(forgedActor);
    assert.equal(forgedPlan.plan.status, "unknown"); assert.equal(forgedPlan.token, undefined);
    assert.equal(forgedPlan.plan.roleCapabilityGuards!.status, "unknown"); assert.deepEqual(forgedPlan.plan.roleCapabilityGuards!.unguardedTools, capabilityNames);
    assert.ok(forgedPlan.plan.reasons.includes("required-scope-role-capability-effects-unproven"));
    await assert.rejects(forged.bindRole(forgedActor), /protected-scope-requires-verified-plan/);
    const changedOptions: RuntimeSessionOptions = { ...common, ...callbacks }, changed = createRuntimeAdapter(changedOptions);
    const changedPlan = await changed.prepareRole!(role("r15-callback-drift")); assert.ok(changedPlan.token);
    changedOptions.installSkill = fake; await assert.rejects(changed.bindPreparedRole!(changedPlan.token!), /configuration-changed/);
    const wrongSlot = createRuntimeAdapter({ ...common, ...callbacks, installMcp: callbacks.installSkill });
    assert.equal((await wrongSlot.prepareRole!(role("r15-wrong-slot"))).plan.roleCapabilityGuards!.status, "unknown");
    const actor = role("r15-role-drift"), roleDrift = createRuntimeAdapter({ ...common, ...callbacks });
    const rolePlan = await roleDrift.prepareRole!(actor); actor.id = "r15-other-role";
    await assert.rejects(roleDrift.bindPreparedRole!(rolePlan.token!), /configuration-changed/);
    assert.equal(nativeConstructions, 0); assert.equal(bodies.length, 0); assert.equal(oldEffects, 0);
    const snapshot = async () => { const result: Record<string, string> = {}; for (const file of await readdir(root, { recursive: true })) {
      const abs = join(root, file); if ((await lstat(abs)).isFile()) result[file] = createHash("sha256").update(await readFile(abs)).digest("hex"); } return result; };
    const before = await snapshot(), adapter = createRuntimeAdapter({ ...common, ...callbacks });
    const prepared = await adapter.prepareRole!(role("nominator")); assert.equal(prepared.plan.status, "observed");
    const planGuard = prepared.plan.roleCapabilityGuards!; assert.equal(planGuard.status, "bound"); assert.deepEqual(planGuard.guardedTools, capabilityNames);
    assert.equal(planGuard.corePlanId, prepared.plan.planId); assert.equal(planGuard.nativePlanId, prepared.plan.native!.planId);
    session = await adapter.bindPreparedRole!(prepared.token!);
    await session.prompt("invoke the four actually registered capability tools");
    const surface = session.inspectToolSurface!(), guard = surface.roleCapabilityGuards!;
    assert.equal(surface.status, "observed"); assert.equal(surface.nativeToolRegistry, "application-mediated");
    assert.equal(guard.status, "bound"); assert.equal(guard.sessionId, session.sessionId); assert.equal(guard.roleId, "nominator");
    assert.equal(guard.corePlanId, prepared.plan.planId); assert.equal(guard.nativePlanId, surface.native!.factoryPlan!.planId);
    assert.equal(guard.nativeConfigDigest, surface.native!.factoryPlan!.configDigest); assert.equal(guard.registryDigest, planGuard.registryDigest);
    for (const name of capabilityNames) { assert.ok(surface.appTools.includes(name)); assert.doesNotMatch(JSON.stringify(describeTool(name).parameters), /roleCapabilityGuards|guardedTools|safe/); }
    const results = bodies[1]!.messages!.filter(message => message.role === "tool"); assert.equal(results.length, 4);
    for (const result of results) assert.match(String(result.content), /effect-scope-unproven/);
    assert.equal(oldEffects, 0); assert.equal(nativeConstructions, 1); assert.equal(bodies.length, 2); assert.deepEqual(await snapshot(), before);
    (guard.guardedTools as string[]).length = 0; assert.equal(session.inspectToolSurface!().roleCapabilityGuards!.guardedTools.length, 4);
    t.diagnostic(JSON.stringify({ root, actualRegisteredTools: capabilityNames, blockedResults: results.length, oldEffects, nativeConstructions, http: bodies.length, filesAndRegistrationsUnchanged: true }));
  } finally {
    await session?.dispose(); crypto.randomUUID = originalUUID; syncBuiltinESMExports(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (oldWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = oldWire;
    if (oldSearch === undefined) delete process.env.ANS_CODEX_WEB_SEARCH; else process.env.ANS_CODEX_WEB_SEARCH = oldSearch;
    if (oldKey === undefined) delete process.env.ANS_R15_LOCAL_KEY; else process.env.ANS_R15_LOCAL_KEY = oldKey;
  }
});

test("R15 actual callback and registry replacement make observer facts unknown instead of trusting function properties", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-r15-registry-drift-")), callbacks = createBlockedRoleCapabilityCallbacks();
  let captured!: RuntimeProviderOptions;
  const options: RuntimeSessionOptions = { runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, ...callbacks,
    providerFactories: { demo: input => { captured = input; return createDemoRuntimeAdapter(input); } } };
  const session = await createRuntimeAdapter(options).bindRole(role("nominator"));
  try {
    assert.equal(session.inspectToolSurface!().roleCapabilityGuards!.status, "bound");
    const original = options.installSkill;
    options.installSkill = async () => ({ ok: false, reason: "fake", message: "fake no-effect claim" });
    assert.equal(session.inspectToolSurface!().roleCapabilityGuards!.status, "unknown");
    options.installSkill = original;
    captured.tools.find(tool => tool.name === "install_skill")!.handler = async () => ({ ok: true, message: "forged handler" });
    const facts = session.inspectToolSurface!(); assert.equal(facts.status, "unknown"); assert.equal(facts.roleCapabilityGuards!.status, "unknown");
    assert.ok(facts.roleCapabilityGuards!.reasons.includes("role-or-core-registry-drift"));
  } finally { await session.dispose(); }
});

/** W1 冻结 API 夹具：登记一个「应用构造成功」的受保护审批链 gate（同 session-admission-approval.test.ts 口径）。 */
function registeredGate(input: { projectRoot: string; mode?: "readonly" | "operator-approve" | "rules-advisory" | "three-layer" }): ShellGate {
  const gate: ShellGate = async () => ({ allow: true, by: "r14-registered-fixture" });
  const facts: ShellApprovalFacts = { source: "orchestration-shell-gate", version: 1, projectRoot: input.projectRoot, mode: input.mode ?? "three-layer",
    classifier: true, rules: true, pmAsk: true, operatorChannel: true, takeGrant: true, takeDirective: true, routinePolicy: false, escalation: true,
    audit: { sink: "file", durable: true, probe: "unknown" } };
  const sink: ShellApprovalProbeSink = { probe: async () => "ok", describe: () => ({ kind: "file", durable: true }) };
  registerShellApproval(gate, facts, sink);
  return gate;
}

test("R14 actual required scope admits registered scripts through the approval chain; Codex native plan is optional evidence and clean Chat/unmanaged scripts still work", async t => {
  const root = await mkdtemp(join(tmpdir(), "ans-r14-required-")), unmanaged = await mkdtemp(join(tmpdir(), "ans-r14-unmanaged-"));
  const sourceId = `init-source-${"d".repeat(64)}`, sourceDir = join(root, ".ans", "trunk", "initialization-sources");
  await mkdir(sourceDir, { recursive: true }); await writeFile(join(sourceDir, `${sourceId}.json`), JSON.stringify({
    schema: "repository-work-source/v1", kind: "customer-turn", sourceId, projectRoot: root,
  }));
  const marker = join(unmanaged, "owned-node-marker.txt");
  const command = `"${process.execPath}" -e "require('node:fs').writeFileSync(process.argv[1],'owned-control')" "${marker}"`;
  let requests = 0, shellPhase = false, shellReplied = false;
  const server = createServer(async (request, response) => {
    for await (const _ of request) { /* real local inference only */ } requests++;
    const message = shellPhase && !shellReplied ? (shellReplied = true, { role: "assistant", tool_calls: [{ id: "r14-owned-shell", type: "function",
      function: { name: "ans_run_shell", arguments: JSON.stringify({ command }) } }] }) : { role: "assistant", content: "owned control completed" };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: "r14-local", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message }] }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const oldWire = process.env.ANS_CODEX_WIRE_API, oldSearch = process.env.ANS_CODEX_WEB_SEARCH, oldKey = process.env.ANS_R14_LOCAL_KEY;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_R14_LOCAL_KEY = "owned-local-only";
  const crypto = createRequire(import.meta.url)("node:crypto") as typeof import("node:crypto");
  const originalUUID = crypto.randomUUID; let nativeConstructions = 0;
  crypto.randomUUID = ((...args: Parameters<typeof originalUUID>) => {
    if (new Error().stack?.includes("createCodexChatSession")) nativeConstructions++;
    return originalUUID(...args);
  }) as typeof originalUUID; syncBuiltinESMExports();
  const sessions: import("../../src/model/runtime.ts").RoleSession[] = [];
  try {
    const common = { runtime: "codex" as const, gate: allow, baseUrl: `http://127.0.0.1:${address.port}/v1`, modelId: "r14-owned-chat", apiKeyEnvVar: "ANS_R14_LOCAL_KEY" };
    const shellGate = async () => ({ allow: true as const, by: "owned-r14-control" });
    const unsafe = createRuntimeAdapter({ ...common, projectRoot: root, skillRoot: root, shellGate });
    const actor = role("r14-required-script"), prepared = await unsafe.prepareRole!(actor);
    assert.equal(prepared.plan.scopeProtection!.state, "required"); assert.equal(prepared.plan.native!.factory, "codex-chat");
    assert.ok(prepared.plan.native!.appTools.includes("run_shell")); assert.ok(prepared.plan.native!.appTools.includes("start_background_task"));
    assert.equal(prepared.plan.status, "unknown"); assert.equal(prepared.token, undefined);
    // 2026-11-08（准入按操作审批，P1.3 §2.3.4/§4.5）：裸函数 gate 无 binding ⇒ 新 reason；
    // 旧 `required-scope-unconfined-script-tools` 退役（不再产生）。
    assert.ok(prepared.plan.reasons.includes("protected-scope-approval-chain-unproven"));
    assert.equal(prepared.plan.reasons.includes("required-scope-unconfined-script-tools"), false);
    // P1.4 F5：Codex native plan observed 但审批链不成立时，拒绝原因只有审批链；native 证据不再是创建门。
    assert.equal(prepared.plan.reasons.some(reason => reason.startsWith("native-factory-plan-")), false);
    await assert.rejects(unsafe.bindRole(actor), /protected-scope-requires-verified-plan/);
    await assert.rejects(unsafe.composeContext(actor), /protected-scope-requires-verified-plan/);
    assert.equal(nativeConstructions, 0); assert.equal(requests, 0); await assert.rejects(lstat(marker), { code: "ENOENT" });
    assert.ok(inspectRuntimeCoreRegistry().entries.filter(entry => entry.roleId === actor.id).every(entry => !entry.sessionId && entry.state === "prepared"));
    // 2026-11-08 W1（P1.4 §3.2 A5/A6）：审批链成立 + Codex native observed ⇒ 绑定成功并可真实执行受控 shell；
    // 不再以「含 shell」或「native plan 之外的能力面」作为预知拒绝。
    const approved = createRuntimeAdapter({ ...common, projectRoot: root, skillRoot: root, shellGate: registeredGate({ projectRoot: root }) });
    const approvedPlan = await approved.prepareRole!(role("r14-required-approved"));
    assert.equal(approvedPlan.plan.scopeProtection!.state, "required");
    assert.equal(approvedPlan.plan.status, "observed", JSON.stringify(approvedPlan.plan.reasons));
    assert.ok(approvedPlan.token);
    assert.equal(approvedPlan.plan.native!.status, "observed", "native observed ⇒ 可选强证明记录");
    assert.ok(approvedPlan.plan.approvalChain, "审批链成立即可绑定");
    assert.equal(approvedPlan.plan.reasons.includes("required-scope-unconfined-script-tools"), false);
    const approvedSession = await approved.bindPreparedRole!(approvedPlan.token!); sessions.push(approvedSession);
    shellPhase = true; shellReplied = false;
    await approvedSession.prompt("real approved shell control");
    assert.equal(await readFile(marker, "utf8"), "owned-control");
    assert.equal(nativeConstructions, 1); assert.equal(requests, 2);
    shellPhase = false;
    const driftRoot = await mkdtemp(join(tmpdir(), "ans-r14-scope-drift-"));
    const drift = createRuntimeAdapter({ ...common, projectRoot: driftRoot, skillRoot: driftRoot, shellGate });
    const driftPlan = await drift.prepareRole!(role("r14-scope-drift"));
    assert.equal(driftPlan.plan.status, "observed"); assert.equal(driftPlan.plan.scopeProtection!.state, "unmanaged");
    const driftDir = join(driftRoot, ".ans", "trunk", "initialization-sources"); await mkdir(driftDir, { recursive: true });
    await writeFile(join(driftDir, `${sourceId}.json`), JSON.stringify({ schema: "repository-work-source/v1", kind: "customer-turn", sourceId, projectRoot: driftRoot }));
    await assert.rejects(drift.bindPreparedRole!(driftPlan.token!), /protection-scope-changed/);
    assert.equal(nativeConstructions, 1); assert.equal(requests, 2);
    const clean = createRuntimeAdapter({ ...common, projectRoot: root, skillRoot: root });
    const cleanPlan = await clean.prepareRole!(role("r14-required-clean")); assert.equal(cleanPlan.plan.status, "observed");
    const cleanSession = await clean.bindPreparedRole!(cleanPlan.token!); sessions.push(cleanSession);
    await cleanSession.prompt("real clean Chat control"); assert.equal(nativeConstructions, 2); assert.equal(requests, 3);
    shellPhase = true; shellReplied = false;
    const compatible = createRuntimeAdapter({ ...common, projectRoot: unmanaged, skillRoot: unmanaged, shellGate, shellCwd: unmanaged });
    const controlPlan = await compatible.prepareRole!(role("r14-unmanaged-script"));
    assert.equal(controlPlan.plan.scopeProtection!.state, "unmanaged"); assert.equal(controlPlan.plan.status, "observed");
    const control = await compatible.bindPreparedRole!(controlPlan.token!); sessions.push(control);
    await control.prompt("real unmanaged script control"); assert.equal(await readFile(marker, "utf8"), "owned-control");
    assert.equal(nativeConstructions, 3); assert.equal(requests, 5);
    assert.equal(control.inspectToolSurface!().nativeToolRegistry, "unknown", "unmanaged script compatibility never becomes an isolation receipt");
    t.diagnostic(JSON.stringify({ root, unmanaged, requiredScripts: prepared.plan.native!.appTools.filter(name => /shell|background/.test(name)),
      rejectedNativeConstructions: 0, rejectedHttp: 0, rejectedMarkerWrites: 0, admittedNativeConstructions: nativeConstructions, actualHttp: requests, ownedMarker: marker }));
  } finally {
    await Promise.all(sessions.map(session => session.dispose()));
    crypto.randomUUID = originalUUID; syncBuiltinESMExports(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (oldWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = oldWire;
    if (oldSearch === undefined) delete process.env.ANS_CODEX_WEB_SEARCH; else process.env.ANS_CODEX_WEB_SEARCH = oldSearch;
    if (oldKey === undefined) delete process.env.ANS_R14_LOCAL_KEY; else process.env.ANS_R14_LOCAL_KEY = oldKey;
  }
});

test("R12 preparing an override is effect-free, unknown and credential-free; forged tokens cannot bind", async () => {
  let constructions = 0;
  const adapter = createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(),
    apiKeyEnvVar: "R12_PRIVATE_AUTH_NAME", providerFactories: { codex: options => { constructions++; return createDemoRuntimeAdapter(options); } } });
  const prepared = await adapter.prepareRole!(role("r12-custom"));
  assert.equal(prepared.plan.status, "unknown"); assert.equal(prepared.plan.factoryProvenance, "custom-override");
  assert.equal(prepared.token, undefined); assert.equal(constructions, 0);
  assert.doesNotMatch(JSON.stringify(prepared.plan), /R12_PRIVATE_AUTH_NAME|apiKey|credentials|environment/);
  await assert.rejects(adapter.bindPreparedRole!({} as never), /token-invalid-or-consumed/);
  assert.equal(constructions, 0);
});

test("R12 unsupported default native plan is omitted optional evidence: admission observed with no native spawn or project write", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-r12-plan-"));
  const oldWire = process.env.ANS_CODEX_WIRE_API; process.env.ANS_CODEX_WIRE_API = "responses";
  const childProcess = createRequire(import.meta.url)("node:child_process") as typeof import("node:child_process");
  const oldSpawn = childProcess.spawn; let spawns = 0;
  childProcess.spawn = (() => { spawns++; throw new Error("R12 unexpected native spawn during pure plan"); }) as typeof oldSpawn;
  syncBuiltinESMExports();
  try {
    const adapter = createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root });
    const prepared = await adapter.prepareRole!(role("r12-default-unsupported"));
    assert.equal(prepared.plan.factoryProvenance, "default-production");
    // 2026-11-08 W1（P1.4 F5）：native factory plan 降为可选证据；responses wire 不可观测时 plan 省略
    // native，不再产生 native-factory-plan-* 拒绝（旧断言 status unknown / token undefined 已按契约变更改写）。
    assert.equal(prepared.plan.status, "observed", JSON.stringify(prepared.plan.reasons));
    assert.ok(prepared.token);
    assert.equal("native" in prepared.plan, false);
    assert.equal(prepared.plan.reasons.some(reason => reason.startsWith("native-factory-plan-")), false);
    assert.equal(spawns, 0); assert.deepEqual(await readdir(root), []);
  } finally {
    childProcess.spawn = oldSpawn; syncBuiltinESMExports();
    if (oldWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = oldWire;
  }
});

test("R12 prepared identity is one-shot, instance-bound and rejects config/role/reprepare drift before construction", async t => {
  const tempParent = await realpath(tmpdir());
  const root = await mkdtemp(join(tempParent, "ans-r35-token-"));
  t.after(async () => {
    assert.equal(dirname(root), tempParent, "only remove this fixture's owned temporary directory");
    await rm(root, { recursive: true, force: true });
    await assert.rejects(lstat(root), { code: "ENOENT" });
  });
  assert.equal(await realpath(root), root);
  for (let ancestor = root; ; ancestor = dirname(ancestor)) {
    assert.equal((await lstat(ancestor)).isSymbolicLink(), false, `fixture ancestor must not be a link: ${ancestor}`);
    await assert.rejects(lstat(join(ancestor, ".git")), { code: "ENOENT" }, `fixture must not inherit a Git association: ${ancestor}`);
    if (dirname(ancestor) === ancestor) break;
  }
  const options = { runtime: "demo" as const, gate: allow, projectRoot: root, skillRoot: root, modelId: "before" };
  const adapter = createRuntimeAdapter(options), actor = role("r12-token");
  const prepared = await adapter.prepareRole!(actor);
  assert.equal(prepared.plan.status, "observed"); assert.ok(prepared.token); assert.deepEqual(Object.keys(prepared.token!), []);
  const foreign = createRuntimeAdapter(options);
  await assert.rejects(foreign.bindPreparedRole!(prepared.token!), /token-invalid-or-consumed/);
  options.modelId = "after";
  await assert.rejects(adapter.bindPreparedRole!(prepared.token!), /configuration-changed/);
  await assert.rejects(adapter.bindPreparedRole!(prepared.token!), /token-invalid-or-consumed/);
  const fresh = createRuntimeAdapter({ ...options });
  const first = await fresh.prepareRole!(actor), second = await fresh.prepareRole!(actor);
  await assert.rejects(fresh.bindPreparedRole!(first.token!), /configuration-changed/);
  const session = await fresh.bindPreparedRole!(second.token!);
  try { await assert.rejects(fresh.bindPreparedRole!(second.token!), /token-invalid-or-consumed/); }
  finally { await session.dispose(); }
  const changed = createRuntimeAdapter({ ...options }), mutableRole = role("r12-role-drift");
  const rolePlan = await changed.prepareRole!(mutableRole); mutableRole.cardText += "changed";
  await assert.rejects(changed.bindPreparedRole!(rolePlan.token!), /configuration-changed/);
});

test("R12 every real Core bind shares the host lease and registry; in-progress/active/disposed actors remain visible", async () => {
  let constructions = 0, release!: () => void;
  const pending = new Promise<void>(done => { release = done; });
  const root = process.cwd(), actor = role("r12-judge-like-direct-core");
  const adapter = createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root,
    providerFactories: { demo: async options => { constructions++; await pending; return createDemoRuntimeAdapter(options); } } });
  const blocked = beginGitHostAction({ projectRoot: root, kind: "git-mutation" }); assert.equal(blocked.ok, true);
  if (!blocked.ok) throw new Error("fixture mutation lease unavailable");
  try { await assert.rejects(adapter.bindRole(actor), /coordinator-busy/); assert.equal(constructions, 0); }
  finally { endGitHostAction({ projectRoot: root, leaseId: blocked.leaseId }); }
  const before = inspectRuntimeCoreRegistry().revision;
  const binding = adapter.bindRole(actor);
  while (!constructions) await new Promise(done => setTimeout(done, 1));
  const creating = inspectRuntimeCoreRegistry(), entry = creating.entries.find(entry => entry.roleId === actor.id)!;
  assert.equal(entry.state, "creating"); assert.ok(creating.revision > before); assert.ok(entry.rootRevision > 0);
  assert.equal(inspectGitHostCoordinator({ projectRoot: root }).activeAction, "session-open");
  release(); const session = await binding;
  const active = inspectRuntimeCoreRegistry().entries.find(candidate => candidate.id === entry.id && candidate.sessionId === session.sessionId)!;
  assert.equal(active.state, "active"); assert.equal(active.lifecycle!.sessionId, session.sessionId);
  assert.ok(active.reasons.includes("legacy-bind-without-precreation-plan"));
  const owner = beginGitHostAction({ projectRoot: root, kind: "git-mutation" }); assert.equal(owner.ok, true);
  if (!owner.ok) throw new Error("fixture mutation lease unavailable");
  try {
    await session.dispose();
    assert.equal(inspectGitHostCoordinator({ projectRoot: root }).activeAction, "git-mutation", "emergency disposal never releases someone else's lease");
    const disposed = inspectRuntimeCoreRegistry().entries.find(entry => entry.sessionId === session.sessionId)!;
    assert.equal(disposed.state, "disposed"); assert.ok(disposed.reasons.includes("dispose-is-not-a-quiescence-receipt"));
    assert.ok(disposed.lifecycle); assert.equal(inspectRuntimeCoreRegistry().coverage, "current-process-only");
  } finally { endGitHostAction({ projectRoot: root, leaseId: owner.leaseId }); }
});

test("R12 interruption during async factory preparation prevents the subsequent native bind", async () => {
  let bindCalls = 0;
  const root = process.cwd();
  const adapter = createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root,
    providerFactories: { demo: options => {
      recordGitHostInterruption({ projectRoot: root, reason: "owned-fixture-interruption" });
      const inner = createDemoRuntimeAdapter(options);
      return { ...inner, async bindRole(actor) { bindCalls++; return inner.bindRole(actor); } };
    } } });
  await assert.rejects(adapter.bindRole(role("r12-interrupted")), /lease-interrupted/); assert.equal(bindCalls, 0);
  assert.equal(inspectRuntimeCoreRegistry().entries.find(entry => entry.roleId === "r12-interrupted")!.state, "failed");
});

test("R12 actual shell/governance judge tool modes and a direct interpretation actor all enter the Core registry", async () => {
  const root = process.cwd();
  const stats = () => ({ readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false });
  for (const mode of ["shell", "governance", "directive"] as const) {
    const adapter = createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root,
      ...(mode === "shell" ? { shellJudge: { projectRoot: root, report() {}, stats: stats() } } : {}),
      ...(mode === "governance" ? { governanceJudge: { projectRoot: root, report() {}, stats: stats() } } : {}),
    });
    const session = await adapter.bindRole(role(`r12-${mode}-actual-core`));
    try {
      const inventory = inspectRuntimeCoreRegistry(), entry = inventory.entries.find(entry => entry.sessionId === session.sessionId)!;
      assert.equal(entry.state, "active"); assert.equal(entry.roleId, `r12-${mode}-actual-core`);
      if (mode !== "directive") {
        assert.equal(entry.toolSurface!.appTools.includes("write_file"), false);
        assert.equal(entry.toolSurface!.appTools.includes(mode === "shell" ? "report_shell_judgement" : "report_governance_judgement"), true);
      }
      (entry.reasons as string[]).push("mutated-copy");
      assert.equal(inspectRuntimeCoreRegistry().entries.find(entry => entry.sessionId === session.sessionId)!.reasons.includes("mutated-copy"), false);
      assert.doesNotMatch(JSON.stringify(inventory), /R12_PRIVATE_AUTH_NAME/);
    } finally { await session.dispose(); }
  }
});

test("R12 physically managed or unknown scopes cannot invoke an unknown legacy factory even outside mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-r12-managed-")), sourceId = `init-source-${"c".repeat(64)}`;
  const sourceDirectory = join(root, ".ans", "trunk", "initialization-sources"), sourceFile = join(sourceDirectory, `${sourceId}.json`);
  await mkdir(sourceDirectory, { recursive: true });
  await writeFile(sourceFile, JSON.stringify({ schema: "repository-work-source/v1", kind: "customer-turn", sourceId, projectRoot: root }));
  let constructions = 0;
  const adapter = createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root,
    providerFactories: { codex: options => { constructions++; return createDemoRuntimeAdapter(options); } } });
  await assert.rejects(adapter.bindRole(role("r12-managed-custom")), /protected-scope-requires-verified-plan/);
  await assert.rejects(adapter.composeContext(role("r12-managed-compose")), /protected-scope-requires-verified-plan/);
  assert.equal(constructions, 0);
  await unlink(sourceFile);
  await assert.rejects(adapter.bindRole(role("r12-managed-marker-removed")), /protected-scope-requires-verified-plan/);
  assert.equal(constructions, 0, "removing observed management evidence cannot downgrade the scope");
  const demo = createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root });
  await assert.rejects(demo.bindRole(role("r12-managed-demo")), /protected-scope-requires-verified-plan/);
  const unknownRoot = await mkdtemp(join(tmpdir(), "ans-r12-unknown-")); await writeFile(join(unknownRoot, ".git"), "gitdir: missing\n");
  const unknown = createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: unknownRoot, skillRoot: unknownRoot,
    providerFactories: { demo: options => { constructions++; return createDemoRuntimeAdapter(options); } } });
  await assert.rejects(unknown.bindRole(role("r12-unknown-association")), /protection-scope-unknown/); assert.equal(constructions, 0);
});

test("R11 dispatch rejects every model workSourceRef before callback while normal evidence stays ordinary", async () => {
  const calls: unknown[] = [];
  const options: GovernedToolsOptions = { roleId: "chief", dispatchTask: async payload => {
    calls.push(payload); return { ok: true, message: "accepted owned child fixture" };
  } };
  const args = { roleId: "convener", task: "Perform the actual bootstrap preparation", sideEffect: "docs",
    requestedEvidence: ["ans-work-source:ordinary user evidence", "normal evidence"], idempotencyKey: "owned-operation" };
  const sourceId = `init-source-${"a".repeat(64)}`;
  for (const workSourceRef of [undefined, null, false, "fake-id", {},
    { kind: "chief-customer-turn", sourceId, path: `.ans/trunk/initialization-sources/${sourceId}.json`, sha256: "b".repeat(64) },
    { kind: "chief-creator-report", sourceId, path: `.ans/trunk/initialization-sources/${sourceId}.json`, sha256: "b".repeat(64) }]) {
    const result = await run(options, "dispatch_task", { ...args, workSourceRef });
    assert.equal(result.ok, false); assert.match(result.message, /workSourceRef.*host-only/);
    assert.equal(calls.length, 0, "not even a well-shaped model source may create a callback/child");
  }
  const accepted = await run(options, "dispatch_task", args);
  assert.equal(accepted.ok, true, accepted.message); assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], args, "normal fields/evidence remain unchanged and acquire no host authority");
});

test("R10 host work-source reference is a strict immutable-source shape, never approval or a parent Task", () => {
  const sourceId = `init-source-${"a".repeat(64)}`;
  const ref: TaskWorkSourceRef = { kind: "chief-customer-turn", sourceId,
    path: `.ans/trunk/initialization-sources/${sourceId}.json`, sha256: "b".repeat(64) };
  assert.equal(isTaskWorkSourceRef(ref), true);
  assert.equal(isTaskWorkSourceRef({ ...ref, sha256: "B".repeat(64) }), true);
  const oldTask: TaskCreatedEvent = { v: 1, at: "2026-11-05T00:00:00.000Z", kind: "task.created", taskId: "task-1",
    from: "chief", to: "convener", text: "real work", sideEffect: "docs", idempotencyKey: "op-owned" };
  assert.equal(oldTask.workSourceRef, undefined);
  const childTask: TaskCreatedEvent = { ...oldTask, workSourceRef: ref };
  assert.equal(childTask.workSourceRef, ref); assert.equal("parentTaskId" in ref, false);
  assert.equal("workSourceRef" in oldTask, false, "reading/validating a new reference must not retrofit old tasks");
  for (const value of [null, [], "ref", {}, ...Object.keys(ref).map(key => Object.fromEntries(Object.entries(ref).filter(([field]) => field !== key))),
    { ...ref, kind: "customer-approval" }, { ...ref, sourceId: "task-1" }, { ...ref, sourceId: `init-source-${"a".repeat(63)}` },
    { ...ref, sourceId: `${sourceId}\n`, path: `.ans/trunk/initialization-sources/${sourceId}\n.json` },
    { ...ref, sha256: "g".repeat(64) }, { ...ref, sha256: "b".repeat(63) }, { ...ref, sha256: `${ref.sha256}\n` },
    ...["../source.json", `/absolute/${sourceId}.json`, `.ans/trunk/initialization-sources/../${sourceId}.json`,
      `.ans\\trunk\\initialization-sources\\${sourceId}.json`, `.ans/trunk/initialization-sources/init-source-${"c".repeat(64)}.json`,
      `.ans/trunk/initialization-sources/${sourceId}.json/extra`, `.ans/trunk/initialization-sources/${sourceId}.json:stream`].map(path => ({ ...ref, path })),
    ...[{ approved: true }, { decisionId: "fake" }, { parentTaskId: "fake" }, { flowId: "other" }, { authority: true },
      { inputAccepted: true }, { actorRoleId: "chief" }].map(extra => ({ ...ref, ...extra })),
  ]) assert.equal(isTaskWorkSourceRef(value), false, JSON.stringify(value));
  // Valid shape alone has no project IO, accepted-turn/flow proof or dispatch side effect.
  assert.equal(Object.keys(ref).length, 4);
});

test("R23 customer-turn and creator-report refs share the unchanged strict four-field shape without authenticating either source", () => {
  const sourceId = `init-source-${"a".repeat(64)}`;
  for (const kind of ["chief-customer-turn", "chief-creator-report"] as const) {
    const ref: TaskWorkSourceRef = { kind, sourceId, path: `.ans/trunk/initialization-sources/${sourceId}.json`, sha256: "b".repeat(64) };
    assert.equal(isTaskWorkSourceRef(ref), true); assert.equal(isTaskWorkSourceRef({ ...ref, sha256: "B".repeat(64) }), true);
    for (const bad of [null, [], {}, ...Object.keys(ref).map(key => Object.fromEntries(Object.entries(ref).filter(([field]) => field !== key))),
      { ...ref, kind: "chief-report" }, { ...ref, kind: "chief-creator-report " }, { ...ref, kind: "customer-approval" },
      { ...ref, sourceId: "task-1" }, { ...ref, sourceId: `init-source-${"a".repeat(63)}` },
      { ...ref, path: `.ans/trunk/initialization-sources/../${sourceId}.json` }, { ...ref, path: `.ans/trunk/initialization-sources/init-source-${"c".repeat(64)}.json` },
      { ...ref, path: `/absolute/${sourceId}.json` }, { ...ref, sha256: "b".repeat(63) }, { ...ref, sha256: `${ref.sha256}\n` },
      { ...ref, approved: true }, { ...ref, latestReportRef: {} }, { ...ref, childTaskId: "fake" }, { ...ref, actorRoleId: "chief" },
    ]) assert.equal(isTaskWorkSourceRef(bad), false, JSON.stringify(bad));
    const old: TaskCreatedEvent = { v: 1, at: "2026-11-06T00:00:00.000Z", kind: "task.created", taskId: "legacy-child",
      from: "chief", to: "product", text: "ordinary document work", sideEffect: "docs", idempotencyKey: "old-op" };
    const host: TaskCreatedEvent = { ...old, workSourceRef: ref };
    assert.equal(host.workSourceRef, ref); assert.equal("workSourceRef" in old, false); assert.equal(Object.keys(ref).length, 4);
  }
});

test("Git capabilities register only when injected; all six roles/worker may query a host-bound template", async () => {
  for (const name of names) assert.equal(toolsFor().has(name), false);
  const calls: GitQueryRequest[] = [];
  const controller = new AbortController();
  for (const roleId of ["chief", "product", "rapporteur", "nominator", "convener", "verifier", "project-worker"]) {
    const result = await run({ roleId, gitQuery: async (input, signal) => {
      assert.equal(signal, controller.signal); calls.push(input); return observed;
    } }, GIT_QUERY_TOOL_NAME, query, controller.signal);
    assert.equal(result.ok, true); assert.deepEqual(decode(GIT_QUERY_TOOL_NAME, result.message), observed);
  }
  assert.equal(calls.length, 7); assert.deepEqual(calls[0], query);
  assert.equal("repoId" in calls[0]!, false); assert.equal("actorRoleId" in calls[0]!, false);
});

test("Git schemas reject host identity/protection receipts, arbitrary argv/env and nested unknown fields", async () => {
  let calls = 0;
  const options: GovernedToolsOptions = { roleId: "convener", gitQuery: async () => { calls++; return observed; },
    gitCandidate: async () => { calls++; return prepared; }, gitPublish: async () => { calls++; return published; } };
  for (const [name, args] of [[GIT_QUERY_TOOL_NAME, query], [GIT_CANDIDATE_TOOL_NAME, commit], [GIT_PUBLISH_TOOL_NAME, publish]] as const) {
    for (const extra of [{ argv: ["status"] }, { env: {} }, { actorRoleId: "convener" }, { repoId: "mine" }, { taskId: "t" },
      { runId: "r" }, { authorizationRevision: 1 }, { protectionFacts: { safe: true } }, { roleDocumentChecks: { ok: true } }]) {
      assert.equal((await run(options, name, { ...args, ...extra })).ok, false);
    }
  }
  assert.equal((await run(options, GIT_QUERY_TOOL_NAME, { ...query, target: { ...oid, command: "status" } })).ok, false);
  assert.equal((await run(options, GIT_CANDIDATE_TOOL_NAME, { ...commit, base: { ...base, authorizationRevision: 7 } })).ok, false);
  assert.equal(calls, 0);
});

test("full object-format OIDs and literal paths replace short revisions/pathspecs/user refs", async () => {
  assert.equal(isGitOid(oid), true); assert.equal(isGitOid({ objectFormat: "sha256", hex: "c".repeat(64) }), true);
  assert.equal(isGitOid({ objectFormat: "sha256", hex: oid.hex }), false);
  let calls = 0;
  const options: GovernedToolsOptions = { roleId: "convener", gitCandidate: async () => { calls++; return prepared; } };
  const invalid = [
    { ...commit, base: { ...base, oid: { ...oid, hex: "HEAD~1" } } },
    { ...commit, base: { ...base, oid: { objectFormat: "sha256", hex: oid.hex } } },
    { ...commit, base: { ref: "refs/heads/main", oid } },
    ...["../escape", ".git/config", "a/.GIT/config", ":(top)a", "*.ts", "-all", "/abs", "a//b"].map(path => ({ ...commit, paths: [path] })),
  ];
  for (const args of invalid) assert.equal((await run(options, GIT_CANDIDATE_TOOL_NAME, args)).ok, false, JSON.stringify(args));
  assert.equal(calls, 0);
});

test("candidate actions have exact shapes and trusted scope; prepared is not published", async () => {
  const inputs: GitCandidateRequest[] = [];
  const fn: NonNullable<GovernedToolsOptions["gitCandidate"]> = async input => { inputs.push(input); return prepared; };
  for (const args of [commit, { operationId: "op-1", action: "integrate", base, candidates: [oid], message: "integrate" },
    { operationId: "op-1", action: "revert", base, commit: oid, mainline: 1, message: "revert" },
    { operationId: "op-1", action: "init", base: { ...base, oid: null }, message: "controlled init" }]) {
    const result = await run({ roleId: "convener", gitCandidate: fn }, GIT_CANDIDATE_TOOL_NAME, args);
    assert.equal(result.ok, true); assert.equal(decode(GIT_CANDIDATE_TOOL_NAME, result.message).status, "prepared");
    if (args.action !== "commit") assert.equal((await run({ roleId: "product", gitCandidate: fn }, GIT_CANDIDATE_TOOL_NAME, args)).ok, false);
  }
  assert.equal(inputs.length, 4);
  assert.equal((await run({ roleId: "convener", gitCandidate: fn }, GIT_CANDIDATE_TOOL_NAME, { ...commit, candidates: [oid] })).ok, false);
  assert.equal(inputs.length, 4);
});

test("publish scope and actual expected-ref/OID result are checked; no raw success on mismatch", async () => {
  for (const roleId of ["product", "rapporteur", "nominator", "convener"]) assert.equal(
    (await run({ roleId, gitPublish: async () => published }, GIT_PUBLISH_TOOL_NAME, publish)).ok, true);
  for (const roleId of ["chief", "verifier", "project-worker"]) assert.equal(
    (await run({ roleId, gitPublish: async () => published }, GIT_PUBLISH_TOOL_NAME, publish)).ok, false);
  assert.equal((await run({ roleId: "product", gitPublish: async () => published }, GIT_PUBLISH_TOOL_NAME, { ...publish, target: "delivery" })).ok, false);
  const result = await run({ roleId: "convener", gitPublish: async () => ({ ...published, published: { ...base, oid: tree } }) }, GIT_PUBLISH_TOOL_NAME, publish);
  assert.equal(result.ok, false); assert.match(result.message, /结果未知/);
});

test("Git pending-recovery/conflict/blocked are preserved, and abort after published never rewrites the commit", async () => {
  for (const status of ["rejected", "conflict", "blocked", "pending-recovery"] as const) {
    const receipt: GitCapabilityResult = { operationId: "op-1", repoId: "repo-owned", status,
      journalId: "journal-owned", code: "protection-unverified", message: "Actual surface is not yet proven" };
    const result = await run({ roleId: "convener", gitPublish: async () => receipt }, GIT_PUBLISH_TOOL_NAME, publish);
    assert.equal(result.ok, false); assert.deepEqual(decode(GIT_PUBLISH_TOOL_NAME, result.message), receipt);
  }
  const controller = new AbortController();
  const result = await run({ roleId: "convener", gitPublish: async () => { controller.abort(); return published; } }, GIT_PUBLISH_TOOL_NAME, publish, controller.signal);
  assert.equal(result.ok, true); assert.match(result.message, /published/);
  assert.equal(isGitCapabilityResult({ ...prepared, tree: undefined }), false);
  assert.equal(isGitCapabilityResult({ operationId: "op-1", repoId: "r", status: "pending-recovery" }), false);
});

test("Git schema declarations are strict nested templates, with no host-only fields", () => {
  for (const name of names) {
    const description = describeTool(name); assert.equal(description.executionMode, "sequential");
    assert.doesNotMatch(JSON.stringify(description.parameters), /authorizationRevision|ownedIndexId|protectionFacts|actorRoleId|repoId/);
    if (name !== GIT_CANDIDATE_TOOL_NAME) assert.equal(description.parameters.additionalProperties, false);
    else for (const branch of description.parameters.oneOf as Record<string, unknown>[]) assert.equal(branch.additionalProperties, false);
  }
});

test("actual Service registry snapshots bind the instance and do not convert empty capabilities into confinement proof", async () => {
  for (const shellEnabled of [false, true]) {
    const session = await createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(),
      ...(shellEnabled ? { shellGate: async () => ({ allow: true as const, by: "fixture" }) } : {}),
    }).bindRole(role("worker"));
    try {
      const surface = session.inspectToolSurface!(), lifecycle = session.inspectLifecycle!();
      assert.equal(surface.source, "core-provider-assembly"); assert.equal(surface.status, "observed");
      assert.equal(surface.sessionId, session.sessionId); assert.equal(surface.sessionId, lifecycle.sessionId);
      assert.equal(surface.appTools.includes("run_shell"), shellEnabled);
      assert.equal(surface.appTools.includes("start_background_task"), shellEnabled);
      assert.equal(surface.nativeToolRegistry, "unknown"); assert.equal(surface.filesystemConfinement, "unknown");
      assert.deepEqual(surface.configuredForeignMcpServers, []); assert.equal("safe" in surface, false);
    } finally { await session.dispose(); }
    assert.equal(session.inspectToolSurface!().status, "unknown");
  }
});

async function overriddenNativeSurface(change?: (state: { tool: RuntimeNativeToolSurfaceFacts; lifecycle: RuntimeNativeLifecycleFacts; options: RuntimeProviderOptions }) => void, shellEnabled = false) {
  return createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(),
    ...(shellEnabled ? { shellGate: async () => ({ allow: true as const, by: "fixture" }) } : {}),
    providerFactories: { codex: options => {
      const tool: RuntimeNativeToolSurfaceFacts = { source: "native-provider-tool-registry", nativeInstanceId: "fixture-native", roleId: "worker", runtime: "codex", factory: "codex-chat",
        status: "observed", observedAt: new Date().toISOString(), appTools: options.tools.map(tool => tool.name), foreignMcpServers: [], nativeBuiltinTools: [], reasons: [] };
      const lifecycle: RuntimeNativeLifecycleFacts = { instanceId: "fixture-native", roleId: "worker", runtime: "codex", status: "quiescent", promptState: "not-started", observedAt: new Date().toISOString(),
        transport: { kind: "http", state: "idle" }, activeTools: [], processes: [], processCoverage: "complete", reasons: [] };
      change?.({ tool, lifecycle, options });
      const demo = createDemoRuntimeAdapter(options);
      return { ...demo, async bindRole(role) {
        const inner = await demo.bindRole(role);
        return { ...inner, nativeLifecycle: { instanceId: "fixture-native", inspect: () => lifecycle, async stopAndInspect() { return lifecycle; } },
          inspectNativeToolSurface: () => tool };
      } };
    } },
  }).bindRole(role("worker"));
}

test("R8 a custom factory cannot self-report the default Codex Chat production provenance", async () => {
  const session = await overriddenNativeSurface();
  try {
    const facts = session.inspectToolSurface!();
    assert.equal(facts.factoryProvenance, "custom-override");
    assert.equal(facts.native!.factory, "codex-chat", "the forged producer label is preserved as data, never used as authority");
    assert.equal(facts.nativeToolRegistry, "unknown"); assert.equal(facts.status, "unknown");
    assert.equal(facts.filesystemConfinement, "unknown");
    assert.ok(facts.reasons.includes("custom-provider-factory-unverified"));
    assert.equal("safe" in facts, false); assert.equal("inspectNativeToolSurface" in facts, false);
    assert.equal(isRuntimeNativeToolSurfaceFacts(facts.native), true);
    (facts.native!.appTools as string[]).push("tampered-copy");
    assert.equal(session.inspectToolSurface!().native!.appTools.includes("tampered-copy"), false);
  } finally { await session.dispose(); }
  assert.ok(session.inspectToolSurface!().reasons.includes("disposed-registry-not-current"));
});

test("R8 native registry/instance/role/runtime/activity mismatches remain unknown", async () => {
  const cases: [(state: { tool: RuntimeNativeToolSurfaceFacts; lifecycle: RuntimeNativeLifecycleFacts; options: RuntimeProviderOptions }) => void, string][] = [
    [state => { state.tool.nativeInstanceId = "other-instance"; }, "native-tool-registry-binding-unverified"],
    [state => { state.tool.roleId = "other-role"; }, "native-tool-registry-binding-unverified"],
    [state => { state.tool.runtime = "pi"; }, "native-tool-registry-binding-unverified"],
    [state => { state.tool.appTools = ["unregistered"]; }, "native-tool-registry-mismatch"],
    [state => { state.tool.foreignMcpServers = ["hidden-server"]; }, "native-tool-registry-mismatch"],
    [state => { state.tool.nativeBuiltinTools = ["native-shell"]; }, "unmediated-execution-registered"],
    [state => { state.tool.factory = "unknown"; }, "native-production-tool-factory-unverified"],
    [state => { state.lifecycle.processCoverage = "unknown"; }, "native-tool-execution-coverage-unverified"],
    [state => { state.lifecycle.status = "unknown"; }, "native-tool-execution-coverage-unverified"],
    [state => { state.lifecycle.processes = [{ id: "owned", kind: "native", state: "running", treeStatus: "unknown" }]; }, "native-tool-execution-coverage-unverified"],
    [state => { state.lifecycle.activeTools = [{ id: "hidden", name: "native-shell" }]; }, "native-tool-execution-coverage-unverified"],
    [state => { (state.options.tools as Array<RuntimeProviderOptions["tools"][number]>).push({ name: "extra-after-core-assembly", description: "fixture", inputSchema: {}, async handler() { return { ok: false, message: "never executed" }; } }); }, "core-registry-changed-after-factory"],
    [state => { state.options.tools[0]!.handler = async () => ({ ok: true, message: "replacement" }); }, "core-tool-handler-changed-after-factory"],
  ];
  for (const [change, reason] of cases) {
    const session = await overriddenNativeSurface(change);
    try {
      const facts = session.inspectToolSurface!();
      assert.equal(facts.nativeToolRegistry, "unknown"); assert.equal(facts.filesystemConfinement, "unknown");
      assert.ok(facts.reasons.includes(reason), JSON.stringify(facts.reasons));
    } finally { await session.dispose(); }
  }
  const shell = await overriddenNativeSurface(undefined, true);
  try { assert.ok(shell.inspectToolSurface!().reasons.includes("unmediated-execution-registered")); }
  finally { await shell.dispose(); }
});

test("R8 active HTTP inference alone is not treated as an uncontrolled execution program", async () => {
  const session = await overriddenNativeSurface(state => {
    state.lifecycle.status = "running"; state.lifecycle.promptState = "running";
    state.lifecycle.transport.state = "open"; state.lifecycle.reasons = ["chat-http-request-running"];
  });
  try {
    const facts = session.inspectToolSurface!();
    assert.equal(facts.nativeToolRegistry, "unknown", "custom factory remains unverified even though its claimed HTTP activity is not an OS child");
    assert.ok(facts.reasons.includes("custom-provider-factory-unverified"));
    assert.equal(facts.reasons.includes("native-tool-execution-coverage-unverified"), false);
    assert.equal(facts.reasons.includes("owned-execution-program-not-proven-stopped"), false);
  } finally { await session.dispose(); }
});

test("R9 real write/edit reject Git, host roots, hardlinks and junction aliases after an allowing gate", async t => {
  const root = await mkdtemp(join(tmpdir(), "ans-r9-files-"));
  const repo = join(root, "repo"), common = join(root, "common-dir"), other = join(root, "other-worktree");
  const commands = [
    ["init", "--quiet", repo],
    ["-C", repo, "-c", "user.name=R9 fixture", "-c", "user.email=r9@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "owned fixture"],
    ["-C", repo, "worktree", "add", "--quiet", "--detach", other, "HEAD"],
    ["init", "--quiet", "--separate-git-dir", common, join(root, "separate-repo")],
  ];
  for (const args of commands) execFileSync("git", args, { encoding: "utf8", stdio: "pipe" });
  const targets = [join(repo, ".git", "config"), join(common, "config"), join(other, "owned.txt")];
  await writeFile(targets[2]!, "owned bytes\n");
  let gateCalls = 0;
  const tools = new Map(buildGovernedTools(target => { gateCalls++; return allow(target); }, {
    writeRoot: root, protectedGitRoots: [common, other],
  }).map(tool => [tool.name, tool]));
  const invoke = (name: string, path: string, extra = {}) => tools.get(name)!.handler({ name,
    args: name === "write_file" ? { path, content: "forbidden mutation", ...extra } : { path, old_string: "", new_string: "forbidden mutation", ...extra } });
  const evidence: object[] = [];
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index]!, before = await readFile(target), alias = join(root, `hardlink-${index}.txt`);
    await link(target, alias);
    assert.ok((await lstat(alias)).nlink > 1);
    // Same fixture/identity control: the ambient primitive really can mutate through the alias.
    await writeFile(alias, Buffer.concat([before, Buffer.from("control-write\n")]));
    assert.equal((await readFile(target)).equals(before), false);
    await writeFile(alias, before);
    for (const path of [target, alias]) for (const name of ["write_file", "edit_file"]) {
      const calls = gateCalls, result = await invoke(name, path);
      assert.equal(result.ok, false, `${name} ${path}: ${result.message}`);
      assert.ok(gateCalls > calls, "the fixture gate genuinely allowed before the production IO guard");
      assert.match(result.message, /file-write-protection/);
      assert.deepEqual(await readFile(target), before); assert.deepEqual(await readFile(alias), before);
    }
    evidence.push({ target, alias, primitiveControl: "wrote-and-restored", nlink: (await lstat(alias)).nlink,
      beforeSha256: createHash("sha256").update(before).digest("hex"), afterSha256: createHash("sha256").update(await readFile(target)).digest("hex") });
  }
  // Single-link canonical aliases exercise root protection independently of nlink protection.
  for (const [index, directory] of [join(repo, ".git"), common, other].entries()) {
    const target = join(directory, "single-link.txt"), aliasDir = join(root, `junction-${index}`), alias = join(aliasDir, "single-link.txt");
    await writeFile(target, "original"); await symlink(directory, aliasDir, process.platform === "win32" ? "junction" : "dir");
    await writeFile(alias, "control"); assert.equal(await readFile(target, "utf8"), "control"); await writeFile(target, "original");
    assert.equal((await lstat(target)).nlink, 1);
    for (const name of ["write_file", "edit_file"]) {
      const result = await invoke(name, alias); assert.equal(result.ok, false, result.message);
      assert.match(result.message, /file-write-protection/); assert.equal(await readFile(target, "utf8"), "original");
      const rootAliasResult = await run({ writeRoot: root, protectedGitRoots: [aliasDir] }, name,
        { path: target, content: "bad", old_string: "original", new_string: "bad" });
      assert.equal(rootAliasResult.ok, false, rootAliasResult.message); assert.equal(await readFile(target, "utf8"), "original");
    }
    evidence.push({ target, alias, primitiveControl: "wrote-and-restored", nlink: 1, after: "original" });
  }
  t.diagnostic(JSON.stringify({ root, commands: commands.map(argv => ["git", ...argv]), gateCalls, evidence }));
});

test("R9 rechecks nlink after gate approval, allows ordinary IO and rejects model roots", async t => {
  const root = await mkdtemp(join(tmpdir(), "ans-r9-final-")), ordinary = join(root, "ordinary.txt");
  const options = { writeRoot: root, protectedGitRoots: [join(root, "not-yet-created", "git-metadata")] };
  const firstWrite = await run(options, "write_file", { path: ordinary, content: "before" });
  assert.equal(firstWrite.ok, true, firstWrite.message);
  assert.equal((await run(options, "edit_file", { path: ordinary, old_string: "before", new_string: "after" })).ok, true);
  assert.equal(await readFile(ordinary, "utf8"), "after");
  for (const name of ["write_file", "edit_file"]) {
    const target = join(root, `${name}.txt`), alias = join(root, `${name}-late-link.txt`);
    await writeFile(target, "before"); let linked = false, contentChecks = 0;
    const tool = buildGovernedTools((path, context) => {
      if (context?.contentSha256 && ++contentChecks === (name === "write_file" ? 2 : 1) && !linked) { linkSync(target, alias); linked = true; }
      return allow(path);
    }, options).find(tool => tool.name === name)!;
    const result = await tool.handler({ name, args: { path: target, content: "after", old_string: "before", new_string: "after" } });
    assert.equal(linked, true); assert.equal(result.ok, false); assert.match(result.message, /nlink=1/);
    assert.equal(await readFile(target, "utf8"), "before"); assert.equal(await readFile(alias, "utf8"), "before");
    assert.equal((await run(options, name, { path: ordinary, content: "bad", old_string: "after", new_string: "bad", protectedGitRoots: [] })).ok, false);
  }
  // First init starts with no .git; missing metadata is not permission to create it via file tools.
  const newRepo = join(root, "brand-new-repo"); await mkdir(newRepo);
  const result = await run({ writeRoot: newRepo, protectedGitRoots: [join(newRepo, ".git")] }, "write_file", { path: ".git/config", content: "fake-init" });
  assert.equal(result.ok, false); await assert.rejects(lstat(join(newRepo, ".git")), { code: "ENOENT" });
  t.diagnostic(JSON.stringify({ root, ordinary: "write+edit succeeded", lateHardlink: "both rejected", newRepo: "no .git created" }));
});

test("R9 Service binds defensive host roots without claiming FS confinement or complete discovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-r9-service-")), protectedRoot = join(root, "metadata");
  await mkdir(protectedRoot); const target = join(protectedRoot, "owned.txt"); await writeFile(target, "original");
  const hostRoots = [protectedRoot];
  const session = await createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, writeRoot: root,
    protectedGitRoots: hostRoots, script: [{ name: "write_file", args: { path: target, content: "bad" } }],
  }).bindRole(role("worker"));
  hostRoots.length = 0;
  try {
    const facts = session.inspectToolSurface!();
    assert.equal(facts.fileWriteProtection!.mechanism, "canonical-roots-and-nlink-v1");
    assert.deepEqual(facts.fileWriteProtection!.protectedGitRoots, [protectedRoot]);
    assert.equal(facts.fileWriteProtection!.rootCoverage, "unknown"); assert.equal(facts.filesystemConfinement, "unknown");
    (facts.fileWriteProtection!.protectedGitRoots as string[]).length = 0;
    assert.deepEqual(session.inspectToolSurface!().fileWriteProtection!.protectedGitRoots, [protectedRoot]);
    await session.prompt("run owned fixture");
    assert.equal(await readFile(target, "utf8"), "original");
  } finally { await session.dispose(); }
  assert.equal(session.inspectToolSurface!().fileWriteProtection, undefined);
});
