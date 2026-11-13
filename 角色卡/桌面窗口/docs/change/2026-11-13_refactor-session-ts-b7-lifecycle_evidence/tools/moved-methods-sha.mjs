// B7 取证：46 个逐字搬运方法的归一化文本/方法体 sha256 对比 + 47 个门面薄委托存在性。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(HERE, "../../../../../.."));
const OUT = "角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-lifecycle_evidence";
const src = JSON.parse(fs.readFileSync(path.join(HERE, "methods-source.json"), "utf8"));
const byName = new Map(src.methods.map((m) => [m.name, m]));
const facade = fs.readFileSync("app/desktop/session.ts", "utf8");
const GROUPS = {
  "app/desktop/session/lifecycle/send.ts": ["send", "sendDelivery", "sendFacts", "beginDeliveryOrigin", "captureDeliveryOrigin", "trimDeliveryOrigins", "failDeliveryOrigin", "healStaleOrigin"],
  "app/desktop/session/lifecycle/consume.ts": ["consume"],
  "app/desktop/session/lifecycle/background.ts": ["listBackgroundTasks", "readBackgroundTask", "stopBackgroundTask"],
  "app/desktop/session/lifecycle/open.ts": ["open", "openInternal"],
  "app/desktop/session/lifecycle/ops.ts": ["openObservedRoleSession","ownsControllerDisposal","disposeObservedHandle","observeWatchdog","noteWatchdogActivity","profileRevision","profileChanged","hasBusyRuntime","hasStaleProfile","liveSessionViews","activeEntry","disposeEntry","evictBeyondLimit","isPrimarySession","openBackground","sendBackground","isRoleBusy","hasLiveSession","wasLastTurnAborted","hasPendingDelivery","waitForRoleSettle","waitForRoleIdle","abort","stop","isOpen","openForRoleId","liveRoleIds","findLiveRuntime","ensureFreshRoleSession","rebuildSession","rebuildSessionUnsafe","isCustomerInitiatedTurn"],
};
const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");
const ADAPT = new Map([
  ["stop", [[/manager !== this && !members\.length/g, "manager !== this.host.manager && !members.length"]]],
  ["evictBeyondLimit", [[/this\.sessions\.size > MAX_LIVE_SESSIONS/g, "this.sessions.size > this.host.maxLiveSessions"]]],
]);
function normalizeSource(text, name) {
  let out = text
    .split("\n")
    .map((line, idx) => (idx === 0 ? line.replace(/^(  )private /, "$1") : line))
    .join("\n");
  for (const [re, rep] of ADAPT.get(name) ?? []) out = out.replace(re, rep);
  return out;
}
function extractBody(text) {
  const lines = text.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(?:private )?(?:async )?[A-Za-z0-9_$]+[<(]/.test(lines[i])) {
      for (let j = i; j < lines.length; j += 1) { if (lines[j].trimEnd().endsWith("{")) { start = j; break; } }
      break;
    }
  }
  if (start < 0) return text;
  const braceIndex = lines[start].lastIndexOf("{");
  return [lines[start].slice(braceIndex), ...lines.slice(start + 1)].join("\n");
}
const reports = [];
for (const [target, names] of Object.entries(GROUPS)) {
  const targetText = fs.readFileSync(target, "utf8");
  const targetLines = targetText.split("\n");
  for (const name of names) {
    const m = byName.get(name);
    if (!m) throw new Error("source method missing: " + name);
    const sourceText = m.text;
    const marker = `  // —— ${name}（B7 自 session.ts 逐字搬移）——`;
    const markerIndex = targetLines.indexOf(marker);
    if (markerIndex < 0) throw new Error(`marker not found: ${name} in ${target}`);
    const lineCount = m.endLine - m.startLine + 1;
    const targetMethodText = targetLines.slice(markerIndex + 1, markerIndex + 1 + lineCount).join("\n") + "\n";
    const sourceNormalized = normalizeSource(sourceText, name);
    const sourceBody = extractBody(sourceNormalized);
    const targetBody = extractBody(targetMethodText);
    const delegation = new RegExp(`return this\\.lifecycle\\.${name}\\(`, "m").test(facade);
    reports.push({
      name, target, sourceStartLine: m.startLine, sourceEndLine: m.endLine,
      targetStartLine: markerIndex + 2, targetEndLine: markerIndex + 1 + lineCount,
      adaptations: ADAPT.has(name) ? ["mechanical host-state adaptation (recorded)"] : [],
      sourceTextSha256: sha(sourceText), targetTextSha256: sha(targetMethodText),
      sourceNormalizedSha256: sha(sourceNormalized), targetNormalizedSha256: sha(targetMethodText),
      identicalUnderDocumentedAdaptations: sourceNormalized === targetMethodText,
      sourceBodySha256: sha(sourceBody), targetBodySha256: sha(targetBody),
      bodyIdentical: sourceBody === targetBody,
      facadeDelegationPresent: delegation,
    });
  }
}
const summary = {
  generatedAt: new Date().toISOString(),
  sourceOfTruth: "git show HEAD:app/desktop/session.ts (e37da80)",
  methodCount: reports.length,
  allMethodsIdenticalUnderDocumentedAdaptations: reports.every((r) => r.identicalUnderDocumentedAdaptations),
  allMethodBodiesIdentical: reports.every((r) => r.bodyIdentical),
  allFacadeDelegationsPresent: reports.every((r) => r.facadeDelegationPresent),
  methods: reports,
};
fs.writeFileSync(`${OUT}/moved-methods.json`, JSON.stringify(summary, null, 2), "utf8");
const md = [
  "# B7 moved methods — normalization evidence",
  "",
  "- Source: `git show HEAD:app/desktop/session.ts` (e37da80; 4,626 行)",
  `- Methods moved verbatim: ${reports.length}（openInternalUnsafe 另作 builder 分解，见 builder-equivalence.md）`,
  `- allMethodsIdenticalUnderDocumentedAdaptations = **${summary.allMethodsIdenticalUnderDocumentedAdaptations}**`,
  `- allMethodBodiesIdentical = **${summary.allMethodBodiesIdentical}**`,
  `- allFacadeDelegationsPresent = **${summary.allFacadeDelegationsPresent}**`,
  "",
  "| method | source lines | target | target lines | normalized sha equal | body sha equal | facade delegate |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...reports.map((r) => `| ${r.name} | ${r.sourceStartLine}-${r.sourceEndLine} | ${r.target} | ${r.targetStartLine}-${r.targetEndLine} | ${r.identicalUnderDocumentedAdaptations ? "YES" : "**NO**"} | ${r.bodyIdentical ? "YES" : "**NO**"} | ${r.facadeDelegationPresent ? "YES" : "**NO**"} |`),
  "",
  "Adaptations (only these):",
  "- visibility: `private ` declaration prefix removed in module（门面保留原可见性/签名）。",
  "- `stop`: `manager !== this` → `manager !== this.host.manager`（宿主=门面实例引用；跨实例协调语义逐字保留）。",
  "- `evictBeyondLimit`: `MAX_LIVE_SESSIONS` → `this.host.maxLiveSessions`（同一常量值由门面构造传入；单一来源仍在 barrel 导出）。",
  "",
].join("\n");
fs.writeFileSync(`${OUT}/moved-methods-summary.md`, md, "utf8");
const bad = reports.filter((r) => !r.identicalUnderDocumentedAdaptations || !r.bodyIdentical || !r.facadeDelegationPresent);
console.log(JSON.stringify({ methodCount: reports.length, allOk: bad.length === 0, bad: bad.map((r) => r.name) }, null, 2));
