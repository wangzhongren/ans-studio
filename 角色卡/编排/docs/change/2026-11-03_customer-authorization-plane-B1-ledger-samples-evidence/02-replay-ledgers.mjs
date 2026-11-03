#!/usr/bin/env node
// B1 ledger samples replay/verification (2026-11-03, orchestration role, evidence-only).
//
// Reads the generated samples back with the REAL frozen modules:
//   Provider `createDirectiveFileStore(...).replay()`   (A2 shared reader under the hood)
//   A2 `readJsonlLedger`                                (badLines / ignoredLines / errors / old→new files)
//   Pipeline `createCustomerDirectiveRuntime(...)`      (views, facts, consumers)
//   Service state machine via the Pipeline handle       (status groups)
//
// Read-only: uses the same sessionId as generation where a load could otherwise append expiry events.
//
// Run: node 02-replay-ledgers.mjs

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
const { createDirectiveFileStore, customerDirectiveLedgerPath } = await import(
  moduleUrl("src/provider/directive/public/directive-store.ts")
);
const { readJsonlLedger } = await import(moduleUrl("src/common/shared/jsonl-ledger.ts"));
const { createCustomerDirectiveRuntime } = await import(
  moduleUrl("src/pipeline/orchestration/customer-directive.ts")
);

const results = [];
function check(name, value, detail) {
  const ok = value === true;
  results.push({ name, ok, detail: detail ?? null });
  console.log(`CHECK ${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
  return ok;
}

const throwingPresenter = {
  async present() {
    throw new Error("no presenter call expected during replay");
  },
};

function summarizeView(view) {
  return {
    id: view.id,
    seq: view.seq,
    target: view.target,
    status: view.status,
    until: view.until,
    action: view.action,
    scope: view.scope,
    createdAt: view.createdAt,
    consumedAt: view.consumedAt,
    revokedAt: view.revokedAt,
    expiredAt: view.expiredAt,
    expiredReason: view.expiredReason,
    highRisk: view.highRisk,
    consumer: view.consumer,
  };
}

function printList(label, listed) {
  console.log(`${label}.ok=${listed.ok}`);
  if (!listed.ok) return;
  console.log(`${label}.ledgerErrors=${listed.ledgerErrors}`);
  for (const target of ["approval", "decision"]) {
    for (const status of ["active", "consumed", "revoked", "expired"]) {
      for (const view of listed[target][status]) {
        console.log(`${label}.${target}.${status}: ${JSON.stringify(summarizeView(view))}`);
      }
    }
  }
}

// ———————————————————— 1) Full sample replay ————————————————————

const mainRoot = path.join(HERE, "02-ledger-sample", "project");
const mainLedger = customerDirectiveLedgerPath(mainRoot);
console.log("=".repeat(80));
console.log("MAIN SAMPLE REPLAY");
console.log(`ledger: ${mainLedger}`);
console.log(`ledgerRel: ${CUSTOMER_DIRECTIVES_REL}`);

const mainStore = createDirectiveFileStore(mainRoot);
const mainReplay = await mainStore.replay();
console.log(`main.provider.files=${JSON.stringify(mainReplay.files)}`);
console.log(`main.provider.lines=${mainReplay.lines.length}`);
console.log(`main.provider.errors=${mainReplay.errors}`);
for (const raw of mainReplay.lines) {
  console.log(`main.provider.line: ${raw}`);
}

const mainRuntime = createCustomerDirectiveRuntime({
  projectRoot: mainRoot,
  sessionId: "b1-ledger-sample-session-B",
  present: throwingPresenter,
});
const mainListed = await mainRuntime.list();
printList("main.list", mainListed);
console.log(`main.approvalFacts=${JSON.stringify(mainRuntime.approvalFacts())}`);
console.log(`main.decisionFacts=${JSON.stringify(mainRuntime.decisionFacts())}`);

const picks = [
  ["npm install", "consumed once should not match"],
  ["npm test", "revoked session should not match"],
  ["npm run lint", "expired app-restart should not match"],
  ["npm run format", "expired unused-once should not match"],
];
for (const [command, note] of picks) {
  const picked = await mainRuntime.takeDirective({ command, argv: command.split(" "), cwd: mainRoot, toolCallId: `replay-${command}` });
  console.log(`main.takeDirective(${JSON.stringify(command)})=${JSON.stringify(picked)} // ${note}`);
  check(`main: takeDirective ${command} -> undefined`, picked === undefined, { command });
}
const build1 = await mainRuntime.takeDirective({ command: "npm run build", argv: ["npm", "run", "build"], cwd: mainRoot, toolCallId: "replay-build-1" });
const build2 = await mainRuntime.takeDirective({ command: "npm run build", argv: ["npm", "run", "build"], cwd: mainRoot, toolCallId: "replay-build-2" });
console.log(`main.takeDirective("npm run build") #1=${JSON.stringify(build1)}`);
console.log(`main.takeDirective("npm run build") #2=${JSON.stringify(build2)}`);
check("main: forever directive reusable twice", build1?.id === "d-4" && build2?.id === "d-4" && build1?.scope === "forever");

const views = new Map();
if (mainListed.ok) {
  for (const target of ["approval", "decision"]) {
    for (const status of ["active", "consumed", "revoked", "expired"]) {
      for (const view of mainListed[target][status]) views.set(view.id, view);
    }
  }
}
check("main: 6 views parsed (one per created directive; 11 ledger events)", views.size === 6, { actual: views.size });
check("main: d-1 consumed", views.get("d-1")?.status === "consumed" && views.get("d-1")?.consumedAt !== undefined);
check("main: d-2 expired app-restart (decision/session)", views.get("d-2")?.status === "expired" && views.get("d-2")?.expiredReason === "app-restart" && views.get("d-2")?.target === "decision");
check("main: d-3 revoked", views.get("d-3")?.status === "revoked" && views.get("d-3")?.revokedAt !== undefined);
check("main: d-4 active forever", views.get("d-4")?.status === "active" && views.get("d-4")?.until === "forever");
check("main: d-7 expired app-restart", views.get("d-7")?.status === "expired" && views.get("d-7")?.expiredReason === "app-restart");
check("main: d-8 expired unused-once", views.get("d-8")?.status === "expired" && views.get("d-8")?.expiredReason === "unused-once");
check("main: approvalFacts only d-4 active", mainRuntime.approvalFacts().ledgerErrors === 0 && mainRuntime.approvalFacts().active.length === 1 && mainRuntime.approvalFacts().active[0].id === "d-4");
check("main: decisionFacts empty (d-2 expired)", mainRuntime.decisionFacts().ledgerErrors === 0 && mainRuntime.decisionFacts().active.length === 0);

// ———————————————————— 2) Bad-line + rotation sample replay ————————————————————

const badRoot = path.join(HERE, "03-bad-rotation-sample", "project");
const badLedger = customerDirectiveLedgerPath(badRoot);
console.log("=".repeat(80));
console.log("BAD-LINE + ROTATION SAMPLE REPLAY");
console.log(`ledger: ${badLedger}`);

const badStore = createDirectiveFileStore(badRoot, { maxBytes: 1, rotations: 2 });
const badReplay = await badStore.replay();
console.log(`bad.provider.files=${JSON.stringify(badReplay.files)}`);
console.log(`bad.provider.lines=${badReplay.lines.length}`);
console.log(`bad.provider.errors=${badReplay.errors}`);
for (const raw of badReplay.lines) console.log(`bad.provider.line: ${raw}`);

// A2 shared reader: record badLines / ignoredLines / errors / old→new file order.
// The classifier below is evidence-side only; it mirrors the frozen Service rule
// "unknown kind ⇒ ignore (counted, not an error)" to make A2's ignoredLines observable.
const KNOWN_KINDS = new Set(["directive.created", "directive.consumed", "directive.revoked", "directive.expired"]);
const reader = await readJsonlLedger(badLedger, (raw) => {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, message: `JSON 坏行：${error instanceof Error ? error.message : String(error)}` };
  }
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.kind === "string" && !KNOWN_KINDS.has(parsed.kind)) {
    return { ok: "ignore" };
  }
  return { ok: true, value: raw };
}, { maxBytes: 1, rotations: 2 });
console.log(`bad.reader.files=${JSON.stringify(reader.files)}`);
console.log(`bad.reader.values=${reader.values.length}`);
console.log(`bad.reader.badLines=${reader.badLines}`);
console.log(`bad.reader.ignoredLines=${reader.ignoredLines}`);
console.log(`bad.reader.errors=${JSON.stringify(reader.errors)}`);

check("bad: old→new file order is .2, .1, current", JSON.stringify(reader.files) === JSON.stringify([
  "customer-directives.jsonl.2",
  "customer-directives.jsonl.1",
  "customer-directives.jsonl",
]), { files: reader.files });
check("bad: badLines === 1 (bad JSON line)", reader.badLines === 1, { badLines: reader.badLines });
check("bad: ignoredLines === 1 (unknown kind)", reader.ignoredLines === 1, { ignoredLines: reader.ignoredLines });
check("bad: one file-level/parse error recorded", reader.errors.length === 1 && reader.errors[0].file === "customer-directives.jsonl.1" && reader.errors[0].line === 1, { errors: reader.errors });
check("bad: valid current-segment event remains readable", reader.values.some((raw) => raw.includes('"id":"d-3"')));

const badRuntime = createCustomerDirectiveRuntime({
  projectRoot: badRoot,
  sessionId: "b1-bad-rotation-session-A",
  present: throwingPresenter,
});
const badListed = await badRuntime.list();
printList("bad.list", badListed);
const badFacts = badRuntime.approvalFacts();
console.log(`bad.approvalFacts=${JSON.stringify(badFacts)}`);
const badPick = await badRuntime.takeDirective({ command: "npm run build", argv: ["npm", "run", "build"], cwd: badRoot, toolCallId: "replay-bad-1" });
console.log(`bad.takeDirective("npm run build")=${JSON.stringify(badPick)}`);
check("bad: consumer treats ledgerErrors>0 as no directive", badFacts.ledgerErrors === 1 && badFacts.active.length === 0 && badPick === undefined);
check("bad: panel list still ok:true + ledgerErrors (does not fake empty)", badListed.ok === true && badListed.ledgerErrors === 1);
check("bad: parseable created view remains visible (d-3 active)", badListed.ok === true && badListed.approval.active.some((view) => view.id === "d-3"));

// ———————————————————— 3) Exit ————————————————————

const failed = results.filter((item) => !item.ok);
console.log(`SUMMARY replay startedAt=${startedAt} finishedAt=${new Date().toISOString()}`);
console.log(`SUMMARY checks=${results.length} passed=${results.length - failed.length} failed=${failed.length}`);
if (failed.length > 0) {
  console.error("FAILED:", JSON.stringify(failed));
  process.exitCode = 1;
}
