import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, "../../../../../..");
const text = fs.readFileSync(path.join(root, "app/desktop/session.ts"), "utf8").replace(/\r\n/g, "\n");
const lines = text.split("\n");
const data = JSON.parse(fs.readFileSync(path.join(HERE, "methods-current.json"), "utf8"));
const NAMES = ["openObservedRoleSession","ownsControllerDisposal","disposeObservedHandle","observeWatchdog","noteWatchdogActivity","profileRevision","profileChanged","hasBusyRuntime","hasStaleProfile","liveSessionViews","listBackgroundTasks","readBackgroundTask","stopBackgroundTask","healStaleOrigin","beginDeliveryOrigin","captureDeliveryOrigin","sendDelivery","sendFacts","trimDeliveryOrigins","failDeliveryOrigin","activeEntry","disposeEntry","evictBeyondLimit","isPrimarySession","open","openBackground","sendBackground","isRoleBusy","hasLiveSession","wasLastTurnAborted","hasPendingDelivery","waitForRoleSettle","waitForRoleIdle","openInternal","openInternalUnsafe","consume","send","abort","stop","isOpen","openForRoleId","liveRoleIds","findLiveRuntime","ensureFreshRoleSession","rebuildSession","rebuildSessionUnsafe","isCustomerInitiatedTurn"];
const byName = new Map(data.members.filter(m => !m.isField).map(m => [m.name, m]));
const idents = new Map(); const bare = [];
for (const name of NAMES) {
  const m = byName.get(name);
  if (!m) { console.log("MISSING", name); continue; }
  const t = lines.slice(m.startLine - 1, m.endLine).join("\n");
  for (const mm of t.matchAll(/\bthis\.([A-Za-z_$][\w$]*)/g)) idents.set(mm[1], (idents.get(mm[1]) ?? 0) + 1);
  // bare this: `this` not followed by . ident
  for (const mm of t.matchAll(/\bthis\b(?!\.)/g)) { const li = t.slice(0, mm.index).split("\n").length; bare.push(`${name}:${m.startLine + li - 1}: ${t.split("\n")[li-1].trim().slice(0,120)}`); }
}
console.log("=== this.<ident> counts ===");
for (const [k, v] of [...idents].sort((a,b) => b[1]-a[1])) console.log(String(v).padStart(4), k);
console.log("=== bare this ===");
console.log(bare.join("\n") || "(none)");
// write method source texts by group for reuse
