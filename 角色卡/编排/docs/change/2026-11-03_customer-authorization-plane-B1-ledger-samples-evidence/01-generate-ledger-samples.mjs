#!/usr/bin/env node
// B1 ledger samples generator (2026-11-03, orchestration role, evidence-only).
//
// AC-6 evidence supplement: generate a raw customer-directive ledger sample covering
// directive.created / consumed / revoked / expired (app-restart + unused-once), plus a
// bad-line + rotation sample, by driving the REAL frozen B1 modules, not a reimplementation:
//   src/pipeline/orchestration/customer-directive.ts  (Pipeline public handle)
//   src/service/directive/**                          (Service state machine)
//   src/provider/directive/**                         (Provider file store)
//   src/model/directive.ts                            (A1 schema/path constants)
//   src/common/shared/jsonl-ledger.ts                 (A2 append/rotate/read; used via Provider)
//
// The script writes only inside this evidence directory. It does not modify src/app/test.
//
// Outputs:
//   02-ledger-sample/project/.ans/state/customer-directives.jsonl      (11 events, all four kinds)
//   03-bad-rotation-sample/project/.ans/state/customer-directives.jsonl{,.1,.2}
//      (`.2` = unknown-kind line oldest, `.1` = bad JSON line, current = valid created event)
//
// Run: node 01-generate-ledger-samples.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const startedAt = new Date().toISOString();

function moduleUrl(relative) {
  return pathToFileURL(path.join(REPO, ...relative.split("/"))).href;
}

const { CUSTOMER_DIRECTIVES_REL } = await import(moduleUrl("src/model/directive.ts"));
const { createCustomerDirectiveRuntime } = await import(
  moduleUrl("src/pipeline/orchestration/customer-directive.ts")
);
const { createDirectiveFileStore, customerDirectiveLedgerPath } = await import(
  moduleUrl("src/provider/directive/public/directive-store.ts")
);
const { createDirectiveService } = await import(
  moduleUrl("src/service/directive/public/directive-service.ts")
);

const results = [];
function check(name, value, detail) {
  const ok = value === true;
  results.push({ name, ok, detail: detail ?? null });
  console.log(`CHECK ${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
  return ok;
}

// Deterministic clock: every call advances 1s, so the sample is reproducible.
const CLOCK_START = Date.parse("2026-11-03T12:00:00.000Z");
let tick = 0;
const clock = () => new Date(CLOCK_START + tick++ * 1000);

function queuePresenter(values) {
  let index = 0;
  return {
    async present() {
      const value = values[index];
      index += 1;
      if (value === undefined) throw new Error("presenter queue exhausted");
      return { decision: "confirm", values: value };
    },
  };
}

const throwingPresenter = {
  async present() {
    throw new Error("no presenter call expected during replay/expiry");
  },
};

function shellAllow(command, root) {
  return { kind: "allow", resource: { type: "shell", command, cwd: root } };
}

async function submit(runtime, root, target, rawText, decisionGroupEnabled = true, clientMessageId) {
  return runtime.submitFromInput({
    rawText,
    target,
    projectRoot: root,
    roleId: "worker",
    decisionGroupEnabled,
    ...(clientMessageId !== undefined ? { clientMessageId } : {}),
  });
}

async function ledgerSummary(file) {
  const raw = await fs.readFile(file, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.map((line, index) => {
    const event = JSON.parse(line);
    return { line: index + 1, event };
  });
}

async function dirListing(dir) {
  try {
    const names = (await fs.readdir(dir)).sort();
    const entries = [];
    for (const name of names) {
      const stat = await fs.stat(path.join(dir, name));
      entries.push({ name, bytes: stat.size });
    }
    return entries;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

// ———————————————————— 1) Full ledger sample ————————————————————

const mainRoot = path.join(HERE, "02-ledger-sample", "project");
await fs.rm(path.join(HERE, "02-ledger-sample"), { recursive: true, force: true });
await fs.mkdir(mainRoot, { recursive: true });
const mainLedger = customerDirectiveLedgerPath(mainRoot);

const mainValues = [
  { action: shellAllow("npm install", mainRoot), scope: {}, until: "once" },
  { action: { kind: "select-recommended" }, scope: {}, until: "session", acknowledged: true },
  { action: shellAllow("npm test", mainRoot), scope: {}, until: "session" },
  { action: shellAllow("npm run build", mainRoot), scope: {}, until: "forever", acknowledged: true },
  { action: shellAllow("npm run lint", mainRoot), scope: {}, until: "session" },
  { action: shellAllow("npm run format", mainRoot), scope: {}, until: "once" },
];

const runtimeA = createCustomerDirectiveRuntime({
  projectRoot: mainRoot,
  sessionId: "b1-ledger-sample-session-A",
  present: queuePresenter(mainValues),
  now: clock,
});

const submissions = [];
submissions.push(await submit(runtimeA, mainRoot, "approval", '@审批 允许 shell "npm install" once', true, "sample-m1"));
submissions.push(await submit(runtimeA, mainRoot, "decision", "@决策 选推荐项 until=session", false, "sample-m2"));
submissions.push(await submit(runtimeA, mainRoot, "approval", '@审批 允许 shell "npm test" session', true, "sample-m3"));
submissions.push(await submit(runtimeA, mainRoot, "approval", '@审批 允许 shell "npm run build" forever', true, "sample-m4"));

const consumed = await runtimeA.takeDirective({
  command: "npm install",
  argv: ["npm", "install"],
  cwd: mainRoot,
  toolCallId: "sample-tool-1",
});
const revoked = await runtimeA.revoke("d-3", "approval");

submissions.push(await submit(runtimeA, mainRoot, "approval", '@审批 允许 shell "npm run lint" session', true, "sample-m5"));
submissions.push(await submit(runtimeA, mainRoot, "approval", '@审批 允许 shell "npm run format" once', true, "sample-m6"));

// New app run: loading with a different sessionId appends directive.expired for the active
// session directive (app-restart) and the unused once directive (unused-once).
const runtimeB = createCustomerDirectiveRuntime({
  projectRoot: mainRoot,
  sessionId: "b1-ledger-sample-session-B",
  present: throwingPresenter,
  now: clock,
});
const listedB = await runtimeB.list();

const mainEvents = await ledgerSummary(mainLedger);
const mainKinds = mainEvents.map(({ event }) => event.kind);
check("main: created id d-1", submissions[0].ok === true && submissions[0].id === "d-1");
check("main: decision target created (d-2)", submissions[1].ok === true && submissions[1].target === "decision");
check("main: approval once consumed by takeDirective", consumed?.action === "allow" && consumed?.id === "d-1" && consumed?.scope === "once");
check("main: approval session revoked", revoked.ok === true && revoked.id === "d-3");
check("main: ledger has 11 events", mainEvents.length === 11, { actual: mainEvents.length });
check("main: all four event kinds present", ["directive.created", "directive.consumed", "directive.revoked", "directive.expired"].every((kind) => mainKinds.includes(kind)), { kinds: mainKinds });
check("main: created rows > = 2 distinct targets", new Set(mainEvents.filter(({ event }) => event.kind === "directive.created").map(({ event }) => event.target)).size === 2);
check("main: expired reasons include app-restart and unused-once", new Set(mainEvents.filter(({ event }) => event.kind === "directive.expired").map(({ event }) => event.reason)).has("app-restart") && new Set(mainEvents.filter(({ event }) => event.kind === "directive.expired").map(({ event }) => event.reason)).has("unused-once"));
check("main: every event version===1", mainEvents.every(({ event }) => event.version === 1));
check("main: seq strictly monotonic 1..11", mainEvents.every(({ event }, index) => event.seq === index + 1));
check("main: created id === d-<seq>", mainEvents.filter(({ event }) => event.kind === "directive.created").every(({ event }) => event.id === `d-${event.seq}`));
check("main: created events carry sessionId", mainEvents.filter(({ event }) => event.kind === "directive.created").every(({ event }) => typeof event.sessionId === "string" && event.sessionId.length > 0));
check("main: highRisk sample present (forever + switch-off-project-recommended)", mainEvents.some(({ event }) => event.kind === "directive.created" && Array.isArray(event.highRisk?.reasons) && event.highRisk.reasons.includes("forever")) && mainEvents.some(({ event }) => event.kind === "directive.created" && Array.isArray(event.highRisk?.reasons) && event.highRisk.reasons.includes("switch-off-project-recommended")));

const mainLayout = await dirListing(path.dirname(mainLedger));
console.log("SUMMARY main ledger:", mainLedger);
console.log("SUMMARY main lines:", mainEvents.length, "bytes:", (await fs.stat(mainLedger)).size);
console.log("SUMMARY main layout:", JSON.stringify(mainLayout));

// ———————————————————— 2) Bad-line + rotation sample ————————————————————

const badRoot = path.join(HERE, "03-bad-rotation-sample", "project");
await fs.rm(path.join(HERE, "03-bad-rotation-sample"), { recursive: true, force: true });
await fs.mkdir(badRoot, { recursive: true });
const badLedger = customerDirectiveLedgerPath(badRoot);
// maxBytes = 1 forces a rotation before every append; rotations = 2 keeps `.1` (newest) and `.2` (oldest).
const badStore = createDirectiveFileStore(badRoot, { maxBytes: 1, rotations: 2 });
const badService = createDirectiveService({
  projectRoot: badRoot,
  sessionId: "b1-bad-rotation-session-A",
  store: badStore,
  now: clock,
});
await badService.ready();

const badCreated1 = await badService.create({
  target: "approval",
  action: shellAllow("npm install", badRoot),
  scope: {},
  until: "once",
  rawText: '@审批 允许 shell "npm install" once',
  projectRoot: badRoot,
  decisionGroupEnabled: true,
});
await badService.create({
  target: "decision",
  action: { kind: "select-recommended" },
  scope: {},
  until: "session",
  rawText: "@决策 选推荐项 until=session",
  projectRoot: badRoot,
  decisionGroupEnabled: true,
});
// Unknown kind: a valid JSON line from a hypothetical future additive event. The real Service
// must ignore it (not a ledger error) per A1 §5.5 / B1 schema.
await badStore.append(
  JSON.stringify({
    version: 1,
    kind: "directive.future",
    id: "d-500",
    seq: 500,
    at: "2026-11-03T12:00:30.000Z",
    note: "unknown-kind evidence line (future additive event)",
  }),
);
// Bad JSON: a truncated/partial write line (must be counted as badLines/errors, never parsed).
await badStore.append('{"version":1,"kind":"directive.created",');
const badCreated3 = await badService.create({
  target: "approval",
  action: shellAllow("npm run build", badRoot),
  scope: {},
  until: "session",
  rawText: '@审批 允许 shell "npm run build" session',
  projectRoot: badRoot,
  decisionGroupEnabled: true,
});

const badLayout = await dirListing(path.dirname(badLedger));
const badContents = [];
for (const entry of badLayout) {
  const text = await fs.readFile(path.join(path.dirname(badLedger), entry.name), "utf8");
  badContents.push({ name: entry.name, bytes: entry.bytes, lines: text.split(/\r?\n/).filter((line) => line !== "") });
}

check("bad/rotation: created d-1", badCreated1.ok === true && badCreated1.id === "d-1");
check("bad/rotation: created d-3 in current file", badCreated3.ok === true && badCreated3.id === "d-3");
check("bad/rotation: three segment files exist", ["customer-directives.jsonl.2", "customer-directives.jsonl.1", "customer-directives.jsonl"].every((name) => badLayout.some((entry) => entry.name === name)), { layout: badLayout });
check("bad/rotation: .2 oldest = unknown-kind line", badContents.find((item) => item.name === "customer-directives.jsonl.2")?.lines.length === 1 && badContents.find((item) => item.name === "customer-directives.jsonl.2")?.lines[0].includes('"directive.future"'));
check("bad/rotation: .1 = bad JSON line", badContents.find((item) => item.name === "customer-directives.jsonl.1")?.lines.length === 1 && badContents.find((item) => item.name === "customer-directives.jsonl.1")?.lines[0] === '{"version":1,"kind":"directive.created",');
check("bad/rotation: current = valid created d-3", badContents.find((item) => item.name === "customer-directives.jsonl")?.lines.length === 1 && badContents.find((item) => item.name === "customer-directives.jsonl")?.lines[0].includes('"id":"d-3"'));

console.log("SUMMARY bad/rotation ledger:", badLedger);
console.log("SUMMARY bad/rotation layout:", JSON.stringify(badLayout));
for (const item of badContents) {
  console.log(`SUMMARY segment ${item.name}: bytes=${item.bytes} lines=${item.lines.length}`);
  for (const line of item.lines) console.log(`  ${line}`);
}

// ———————————————————— 3) Exit ————————————————————

const failed = results.filter((item) => !item.ok);
console.log(`SUMMARY generation startedAt=${startedAt} finishedAt=${new Date().toISOString()}`);
console.log(`SUMMARY checks=${results.length} passed=${results.length - failed.length} failed=${failed.length}`);
console.log(`SUMMARY repo=${REPO}`);
console.log(`SUMMARY node=${process.version} platform=${process.platform} arch=${process.arch}`);
console.log(`SUMMARY ledgerRel=${CUSTOMER_DIRECTIVES_REL}`);
if (failed.length > 0) {
  console.error("FAILED:", JSON.stringify(failed));
  process.exitCode = 1;
}
