#!/usr/bin/env node
/**
 * D2-supplement Node runner (test-only evidence; not a product/test source file).
 *
 * Uses the real B1 components on the frozen candidate:
 *   - createCustomerDirectiveRuntime (src/pipeline/orchestration/customer-directive.ts)
 *   - createShellGate (src/common/编排/shell-gate.ts)
 *   - createFileAuditSink + buildShellAuditGate (src/common/编排/shell-audit.ts)
 * with a temporary project under the supplement evidence directory.
 *
 * Mode `directive` (default):
 *   create `@审批 允许 shell "npm install" once` through the real runtime (real ledger),
 *   then invoke the real ShellGate with the exact ShellReviewRequest twice:
 *     1) hard-floor gate (c=deny) -> denied; allow directive not consumed
 *     2) review gate -> first call allow `by:"directive:d-1"` + once consumed;
 *        second call falls back to the normal operator chain (no directive)
 *   and save the real shell audit JSONL (`docs/audit/shell-gate.jsonl`).
 *
 * Mode `bad-ledger`:
 *   seed a ledger with bad lines + rotations; the real runtime must treat it as
 *   "no directives" (ledgerErrors>0), and the gate must fall back to the operator chain.
 *
 * Run from repo root:
 *   node <this script> directive
 *   node <this script> bad-ledger
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..", "..");
const BASE = path.resolve(HERE, "..");
const MODE = process.argv[2] ?? "directive";
const ROOT = MODE === "bad-ledger" ? path.join(BASE, "bad-ledger-shell") : path.join(BASE, "shell-directive");
const PROJECT = path.join(ROOT, "project");
const AUDIT_REL = ["docs", "audit", "shell-gate.jsonl"];
const LEDGER_REL = [".ans", "state", "customer-directives.jsonl"];
const SESSION_ID = `${MODE === "bad-ledger" ? "supplement-bad-ledger-session" : "supplement-shell-session"}-${Date.now()}`;

const result = {
  mode: MODE,
  startedAt: new Date().toISOString(),
  repo: REPO,
  root: ROOT,
  project: PROJECT,
  sessionId: SESSION_ID,
  checks: [],
  runtime: null,
  gateCalls: [],
  audit: null,
  ledger: null,
  failures: 0,
};
let failures = 0;
function check(name, value, detail) {
  result.checks.push({ name, value: value === true, detail: detail ?? null });
  if (value !== true) failures += 1;
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  return value === true;
}

function writeFixture(root) {
  fs.mkdirSync(path.join(root, "角色卡", "A"), { recursive: true });
  fs.writeFileSync(path.join(root, "角色卡", "A", "role-card.md"), "# 角色：A\n\nD2 补证 shell 夹具角色（不参与产品候选）。\n");
  fs.writeFileSync(path.join(root, "角色卡", "A", "boundary.yaml"), "role: A\nentries: []\n");
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return { path: file, exists: false, bytes: 0, lines: 0, events: [] };
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  return {
    path: file,
    exists: true,
    bytes: Buffer.byteLength(text),
    lines: lines.length,
    events: lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { parseError: line };
      }
    }),
  };
}

const {
  createCustomerDirectiveRuntime,
} = await import(new URL("../../../../../../src/pipeline/orchestration/customer-directive.ts", import.meta.url));
const {
  createShellGate,
  BRANCH_C_DENY,
  BRANCH_DIRECTIVE_ALLOW,
} = await import(new URL("../../../../../../src/common/编排/shell-gate.ts", import.meta.url));
const {
  createFileAuditSink,
  buildShellAuditGate,
  SHELL_GATE_CONDITION,
} = await import(new URL("../../../../../../src/common/编排/shell-audit.ts", import.meta.url));

const RULES = { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] };
const RULES_ID = "supplement-ruleset";
const pmBoundary = {
  boundarySource: "角色卡/项目管理/boundary.yaml",
  acceptance: { accepted: true, source: "supplement:fixture-pm" },
  entries: [
    {
      root: "project",
      path: "docs/audit/",
      kind: "conditional-directory",
      condition: SHELL_GATE_CONDITION,
      purpose: "shell 闸审计留痕",
    },
  ],
};

function makeRuntime(present) {
  return createCustomerDirectiveRuntime({
    projectRoot: PROJECT,
    sessionId: SESSION_ID,
    present,
  });
}

function makeGate({ classify, runtime, sink, operatorChannel }) {
  return createShellGate({
    projectRoot: PROJECT,
    classifyShell: classify,
    rules: RULES,
    rulesId: RULES_ID,
    audit: sink,
    takeDirective: (req, intent) => runtime.takeDirective(req, intent),
    ...(operatorChannel !== undefined ? { operatorChannel } : {}),
  });
}

async function runDirective() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(PROJECT, { recursive: true });
  writeFixture(PROJECT);

  const requests = [];
  const runtime = makeRuntime({
    async present(request) {
      requests.push(request);
      return {
        decision: "confirm",
        values: {
          action: request.prefill.action,
          scope: request.prefill.scope,
          until: request.prefill.until,
        },
      };
    },
  });

  const submitText = '@审批 允许 shell "npm install" once';
  const submitted = await runtime.submitFromInput({
    rawText: submitText,
    target: "approval",
    projectRoot: PROJECT,
    roleId: "A",
    clientMessageId: "supplement-shell-1",
    decisionGroupEnabled: true,
  });
  const directiveId = submitted.ok ? submitted.id : null;
  check("SUBMIT_OK", submitted.ok === true, submitted);
  check(
    "SUBMIT_PREFILL",
    requests.length === 1 &&
      requests[0].prefill.action.kind === "allow" &&
      requests[0].prefill.action.resource.type === "shell" &&
      requests[0].prefill.action.resource.command === "npm install" &&
      requests[0].prefill.until === "once" &&
      requests[0].confirmable === true,
    requests[0]?.prefill ?? null,
  );
  const factsBefore = runtime.approvalFacts();
  check("FACTS_ACTIVE_AFTER_CREATE", factsBefore.ledgerErrors === 0 && factsBefore.active.length === 1, factsBefore);
  result.runtime = { submitText, submitted, factsBefore };

  const auditPath = path.join(PROJECT, ...AUDIT_REL);
  const sink = createFileAuditSink({
    projectRoot: PROJECT,
    gate: buildShellAuditGate(pmBoundary, { skillRoot: PROJECT, projectRoot: PROJECT }),
  });

  const req = {
    command: "npm install",
    argv: ["npm", "install"],
    cwd: PROJECT,
    toolCallId: "supplement-hardfloor-1",
  };
  const hardFloorGate = makeGate({ classify: () => "deny", runtime, sink });
  const hardFloorResult = await hardFloorGate(req);
  result.gateCalls.push({ call: "hard-floor", req, result: hardFloorResult });
  check(
    "HARD_FLOOR_DENIES",
    hardFloorResult.allow === false &&
      typeof hardFloorResult.by === "string" &&
      hardFloorResult.by.startsWith("ruleset:") &&
      hardFloorResult.directive === undefined,
    hardFloorResult,
  );
  const factsAfterHardFloor = runtime.approvalFacts();
  check(
    "HARD_FLOOR_DOES_NOT_CONSUME",
    factsAfterHardFloor.ledgerErrors === 0 &&
      factsAfterHardFloor.active.some((item) => item.id === directiveId),
    factsAfterHardFloor,
  );

  const operatorCalls = [];
  const operatorChannel = (prompt) => {
    operatorCalls.push(prompt);
    return { outcome: "allow", operatorId: "supplement-operator" };
  };
  const reviewGate = makeGate({ classify: () => "review", runtime, sink, operatorChannel });

  const firstReq = { ...req, toolCallId: "supplement-directive-1" };
  const firstResult = await reviewGate(firstReq);
  result.gateCalls.push({ call: "directive-allow", req: firstReq, result: firstResult, operatorCalls: operatorCalls.length });
  check(
    "DIRECTIVE_ALLOW_ONCE",
    firstResult.allow === true &&
      firstResult.by === `directive:${directiveId}` &&
      firstResult.directive?.id === directiveId &&
      firstResult.directive?.scope === "once" &&
      operatorCalls.length === 0,
    firstResult,
  );

  const factsAfterConsume = runtime.approvalFacts();
  check(
    "ONCE_CONSUMED",
    factsAfterConsume.ledgerErrors === 0 && factsAfterConsume.active.length === 0,
    factsAfterConsume,
  );
  const listAfterConsume = await runtime.list();
  check(
    "LIST_CONSUMED",
    listAfterConsume.ok === true &&
      listAfterConsume.approval.consumed.some((item) => item.id === directiveId),
    listAfterConsume.ok ? { consumed: listAfterConsume.approval.consumed.map((item) => item.id) } : listAfterConsume,
  );

  const secondReq = { ...req, toolCallId: "supplement-fallback-2" };
  const secondResult = await reviewGate(secondReq);
  result.gateCalls.push({ call: "normal-chain-fallback", req: secondReq, result: secondResult, operatorCalls: operatorCalls.length });
  check(
    "SECOND_CALL_FALLS_BACK_TO_NORMAL_CHAIN",
    secondResult.allow === true &&
      typeof secondResult.by === "string" &&
      secondResult.by.includes("operator:supplement-operator") &&
      secondResult.directive === undefined &&
      operatorCalls.length === 1,
    secondResult,
  );

  const ledger = readJsonl(path.join(PROJECT, ...LEDGER_REL));
  result.ledger = {
    path: ledger.path,
    exists: ledger.exists,
    bytes: ledger.bytes,
    lines: ledger.lines,
    events: ledger.events.map((e) => ({ kind: e.kind, id: e.id, seq: e.seq, until: e.until, via: e.via, at: e.at })),
  };
  const consumedEvents = ledger.events.filter((e) => e && e.kind === "directive.consumed" && e.id === directiveId);
  check(
    "LEDGER_CREATED_AND_CONSUMED_ONCE",
    ledger.events.some((e) => e && e.kind === "directive.created" && e.id === directiveId && e.until === "once") &&
      consumedEvents.length === 1 &&
      consumedEvents[0].via?.toolCallId === "supplement-directive-1",
    { consumedEvents, events: result.ledger.events },
  );

  const audit = readJsonl(auditPath);
  result.audit = {
    path: audit.path,
    exists: audit.exists,
    bytes: audit.bytes,
    lines: audit.lines,
    records: audit.events,
  };
  check("AUDIT_FILE_EXISTS", audit.exists && audit.lines === 3, { lines: audit.lines, path: audit.path });
  const [hardRecord, directiveRecord, fallbackRecord] = audit.events;
  check(
    "AUDIT_HARD_FLOOR_RECORD",
    hardRecord?.conclusion === "deny" &&
      hardRecord?.branch === BRANCH_C_DENY &&
      typeof hardRecord?.by === "string" &&
      hardRecord.by.startsWith("ruleset:") &&
      hardRecord.directive === undefined &&
      hardRecord.judge === undefined &&
      hardRecord.customerGrant === undefined,
    hardRecord,
  );
  check(
    "AUDIT_DIRECTIVE_RECORD",
    directiveRecord?.conclusion === "allow" &&
      directiveRecord?.branch === BRANCH_DIRECTIVE_ALLOW &&
      directiveRecord?.by === `directive:${directiveId}` &&
      directiveRecord?.directive?.id === directiveId &&
      directiveRecord?.directive?.scope === "once" &&
      directiveRecord.judge === undefined &&
      directiveRecord.customerGrant === undefined &&
      directiveRecord.conditions?.includes(SHELL_GATE_CONDITION),
    directiveRecord,
  );
  check(
    "AUDIT_FALLBACK_RECORD",
    fallbackRecord?.conclusion === "allow" &&
      typeof fallbackRecord?.by === "string" &&
      fallbackRecord.by.includes("operator:supplement-operator") &&
      fallbackRecord.directive === undefined &&
      fallbackRecord.judge === undefined &&
      fallbackRecord.customerGrant === undefined,
    fallbackRecord,
  );

  fs.copyFileSync(path.join(PROJECT, ...LEDGER_REL), path.join(ROOT, "customer-directives.jsonl"));
  fs.copyFileSync(auditPath, path.join(ROOT, "shell-gate.jsonl"));
  result.finishedAt = new Date().toISOString();
  check("NO_FAILURES", failures === 0, { failures });
  result.failures = failures;
  fs.writeFileSync(path.join(ROOT, "result.json"), JSON.stringify(result, null, 2));
  process.exit(failures === 0 ? 0 : 1);
}

async function runBadLedger() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(PROJECT, { recursive: true });
  writeFixture(PROJECT);
  execFileSync(process.execPath, [path.join(HERE, "seed-bad-ledger.mjs"), PROJECT], { stdio: "inherit" });
  const seeded = readJsonl(path.join(PROJECT, ...LEDGER_REL));
  const ledgerBase = path.join(PROJECT, ...LEDGER_REL);
  const segmentFiles = [ledgerBase + ".2", ledgerBase + ".1", ledgerBase];
  const seededSegmentBytes = segmentFiles.map((file) => ({
    file: path.basename(file),
    path: file,
    exists: fs.existsSync(file),
    bytes: fs.existsSync(file) ? fs.statSync(file).size : 0,
  }));
  result.seeded = { ledger: { path: seeded.path, lines: seeded.lines, bytes: seeded.bytes }, segments: seededSegmentBytes };
  check("SEEDED_LEDGER_PRESENT", seeded.exists === true && seeded.lines >= 2, result.seeded);

  const runtime = makeRuntime({
    async present() {
      throw new Error("bad-ledger mode must not present a directive dialog");
    },
  });
  const listReply = await runtime.list();
  result.runtime = { listReply };
  check(
    "CONSUMER_SEES_LEDGER_ERRORS",
    listReply.ok === true && listReply.ledgerErrors === 3,
    listReply.ok ? { ledgerErrors: listReply.ledgerErrors, active: listReply.approval.active.length } : listReply,
  );
  check(
    "NO_ACTIVE_DIRECTIVES",
    listReply.ok === true && listReply.approval.active.length === 0 && listReply.decision.active.length === 0,
    listReply.ok ? { approvalActive: listReply.approval.active.length, decisionActive: listReply.decision.active.length } : listReply,
  );

  const auditPath = path.join(PROJECT, ...AUDIT_REL);
  const sink = createFileAuditSink({
    projectRoot: PROJECT,
    gate: buildShellAuditGate(pmBoundary, { skillRoot: PROJECT, projectRoot: PROJECT }),
  });
  const operatorCalls = [];
  const gate = makeGate({
    classify: () => "review",
    runtime,
    sink,
    operatorChannel: (prompt) => {
      operatorCalls.push(prompt);
      return { outcome: "allow", operatorId: "supplement-operator" };
    },
  });
  const req = {
    command: "npm install",
    argv: ["npm", "install"],
    cwd: PROJECT,
    toolCallId: "supplement-bad-ledger-1",
  };
  const gateResult = await gate(req);
  result.gateCalls.push({ call: "bad-ledger-normal-chain", req, result: gateResult, operatorCalls: operatorCalls.length });
  check(
    "SHELL_MAIN_PATH_UNAFFECTED",
    gateResult.allow === true &&
      typeof gateResult.by === "string" &&
      gateResult.by.includes("operator:supplement-operator") &&
      gateResult.directive === undefined &&
      operatorCalls.length === 1,
    gateResult,
  );

  const ledgerAfter = readJsonl(path.join(PROJECT, ...LEDGER_REL));
  result.ledger = { path: ledgerAfter.path, lines: ledgerAfter.lines, bytes: ledgerAfter.bytes };
  const noAppend =
    ledgerAfter.bytes === seeded.bytes &&
    seededSegmentBytes.every((segment) => {
      return !fs.existsSync(segment.path) ? segment.exists === false : fs.statSync(segment.path).size === segment.bytes;
    });
  check("LEDGER_NOT_MUTATED", noAppend, { before: seeded.bytes, after: ledgerAfter.bytes });

  const audit = readJsonl(auditPath);
  result.audit = { path: audit.path, exists: audit.exists, bytes: audit.bytes, records: audit.events };
  check("AUDIT_NO_DIRECTIVE_FIELD", audit.exists && audit.lines === 1 && audit.events[0]?.directive === undefined, audit.events[0]);

  fs.copyFileSync(path.join(PROJECT, ...LEDGER_REL), path.join(ROOT, "customer-directives.jsonl"));
  fs.copyFileSync(path.join(PROJECT, ...LEDGER_REL) + ".1", path.join(ROOT, "customer-directives.jsonl.1"));
  fs.copyFileSync(path.join(PROJECT, ...LEDGER_REL) + ".2", path.join(ROOT, "customer-directives.jsonl.2"));
  fs.copyFileSync(auditPath, path.join(ROOT, "shell-gate.jsonl"));
  result.finishedAt = new Date().toISOString();
  check("NO_FAILURES", failures === 0, { failures });
  result.failures = failures;
  fs.writeFileSync(path.join(ROOT, "result.json"), JSON.stringify(result, null, 2));
  process.exit(failures === 0 ? 0 : 1);
}

if (MODE === "directive") {
  await runDirective();
} else if (MODE === "bad-ledger") {
  await runBadLedger();
} else {
  console.error("UNKNOWN MODE", MODE);
  process.exit(2);
}
