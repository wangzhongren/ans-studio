import fs from "node:fs";
import { execSync } from "node:child_process";

process.chdir("C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b5");
const text = execSync("git show HEAD:app/desktop/session.ts", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const lines = text.split(/\r?\n/);

const NAMES = [
  "interpretDirective", "requestRequirementChangeDecision", "requestRunChangeDecision", "pickGovernedCardEntry",
  "presentAppCard", "presentVersionChangeCard", "presentAmendmentItemCard", "presentStableWriteCard",
  "noteVersionChange", "noteVersionChangeInitiator", "reportPlanEscalation", "afterPlanEscalation",
  "afterStableWrite", "enrichAppointmentWriteBoundaryCard", "afterAppointmentWriteApproved", "activeRunViews",
  "proposalCardFrozenRejection", "pendingVersionChangesFor", "offerRunChangeOnFrozenContract", "requestIdFor",
  "notifyRequest", "recordRequestPresented", "appointmentWriteApplicationRejection", "withRequestLifecycle",
  "versionDecisionSubjectKey", "isVersionDecisionRequestIdForSubject", "findPendingVersionDecision",
  "pendingRequestIdsForFlow", "countPriorVersionDecisions", "buildVersionDecisionFacts", "versionDecisionCardLabels",
  "decidedByText", "formatTargetVersions", "stripVersionDecisionPrefix", "nextVersionFlowId",
  "mapVersionDecisionRawOutcome", "appendVersionDecisionAudit", "emitVersionDecisionResolved",
  "requestVersionDecision", "restoreVersionDecisions", "restoreRequestState",
  "enrichAcceptanceJudgeContext", "countAcceptanceRejections",
  "runTaskIsFenced", "selectRunChangeForHandle", "completeTeamPlanForHandle", "ownedRunStopMembers",
  "executeOwnedRunStop", "resumeDeferredRunChanges", "executionInventoryFacts", "controllerProducerFacts", "stopExactController",
];

const declRes = NAMES.map((name) => new RegExp(`^  (?:private |public |protected )?(?:async )?${name}[<(]`));
const startLineByName = new Map();
for (let i = 0; i < lines.length; i += 1) {
  for (let k = 0; k < NAMES.length; k += 1) {
    if (declRes[k].test(lines[i])) {
      if (!startLineByName.has(NAMES[k])) startLineByName.set(NAMES[k], i + 1);
    }
  }
}

/** Scan a slice of source starting at (line, col), return absolute end offset of the outermost { } block. */
function findBlockEnd(src, offset) {
  let depth = 0;
  let state = "code";
  let started = false;
  for (let i = offset; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (state === "line") { if (ch === "\n") state = "code"; continue; }
    if (state === "block") { if (ch === "*" && next === "/") { state = "code"; i += 1; } continue; }
    if (state === "single") { if (ch === "\\") { i += 1; } else if (ch === "'") state = "code"; continue; }
    if (state === "double") { if (ch === "\\") { i += 1; } else if (ch === '"') state = "code"; continue; }
    if (state === "template") { if (ch === "\\") { i += 1; } else if (ch === "`") state = "code"; continue; }
    if (ch === "/" && next === "/") { state = "line"; i += 1; continue; }
    if (ch === "/" && next === "*") { state = "block"; i += 1; continue; }
    if (ch === "'") { state = "single"; continue; }
    if (ch === '"') { state = "double"; continue; }
    if (ch === "`") { state = "template"; continue; }
    if (ch === "{") { depth += 1; started = true; continue; }
    if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) return i;
    }
  }
  throw new Error("unbalanced block");
}

function lineOf(offset) {
  // 1-based
  let count = 1;
  for (let i = 0; i < offset; i += 1) if (text.charCodeAt(i) === 10) count += 1;
  return count;
}

const methods = new Map();
const lineOffsets = [];
{
  let offset = 0;
  for (const line of lines) { lineOffsets.push(offset); offset += line.length + 1; }
}
for (const name of NAMES) {
  const declStartLine = startLineByName.get(name);
  if (!declStartLine) { console.log("NOT FOUND:", name); continue; }
  // The body opener is the first line ending with `{` whose matching `}` lands on a bare `  }` line.
  let bodyOpenLine = -1, endLine = -1;
  for (let i = declStartLine - 1; i < Math.min(lines.length, declStartLine + 40); i += 1) {
    const trimmed = lines[i].trimEnd();
    if (!trimmed.endsWith("{")) continue;
    const braceIndex = lineOffsets[i] + trimmed.lastIndexOf("{");
    const candidateEnd = findBlockEnd(text, braceIndex);
    const candidateEndLine = lineOf(candidateEnd);
    if (lines[candidateEndLine - 1] === "  }") { bodyOpenLine = i + 1; endLine = candidateEndLine; break; }
  }
  if (bodyOpenLine < 0) { console.log("BODY NOT FOUND:", name); continue; }
  let startLine = declStartLine;
  let i = declStartLine - 2;
  while (i >= 0 && lines[i].trim() === "") i -= 1;
  if (i >= 0 && lines[i].trimEnd().endsWith("*/")) {
    let j = i;
    while (j >= 0 && !lines[j].trimStart().startsWith("/**")) j -= 1;
    if (j >= 0 && j < i) startLine = j + 1;
  }
  const methodText = lines.slice(startLine - 1, endLine).join("\n") + "\n";
  const refs = [...new Set([...methodText.matchAll(/this\.([A-Za-z0-9_$]+)/g)].map((m) => m[1]))].sort();
  methods.set(name, { name, startLine, endLine, declStartLine, bodyOpenLine, bodyLines: endLine - bodyOpenLine + 1, lines: endLine - startLine + 1, refs, text: methodText });
}

const reports = NAMES.map((n) => methods.get(n)).filter(Boolean);
fs.mkdirSync(".tmp-b5", { recursive: true });
fs.writeFileSync(".tmp-b5/methods.json", JSON.stringify({ totalLines: lines.length, methods: reports }, null, 2), "utf8");
const allRefs = new Map();
for (const r of reports) for (const ref of r.refs) {
  if (!allRefs.has(ref)) allRefs.set(ref, []);
  allRefs.get(ref).push(r.name);
}
console.log("method count:", reports.length, "total lines(incl JSDoc):", reports.reduce((s, r) => s + r.lines, 0));
console.log("refs:");
for (const [ref, users] of [...allRefs].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${ref}  <- ${users.length}: ${users.slice(0, 8).join(", ")}${users.length > 8 ? ", …" : ""}`);
console.log("\nper-method body line counts:");
for (const r of reports) console.log(`${r.name}\t${r.startLine}-${r.endLine}\tdecl=${r.declStartLine}\tbodyLines=${r.bodyLines}`);
