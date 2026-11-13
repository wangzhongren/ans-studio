import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, "../../../../../..");
const text = fs.readFileSync(path.join(root, "app/desktop/session.ts"), "utf8").replace(/\r\n/g, "\n");
const lines = text.split("\n");
const data = JSON.parse(fs.readFileSync(path.join(HERE, "methods-current.json"), "utf8"));
const byName = new Map(data.members.filter(m => !m.isField).map(m => [m.name, m]));
const ALLOC = {
  "send": ["send","sendDelivery","sendFacts","beginDeliveryOrigin","captureDeliveryOrigin","trimDeliveryOrigins","failDeliveryOrigin","healStaleOrigin"],
  "consume": ["consume"],
  "background": ["listBackgroundTasks","readBackgroundTask","stopBackgroundTask"],
  "ops": ["openObservedRoleSession","ownsControllerDisposal","disposeObservedHandle","disposeEntry","evictBeyondLimit","isPrimarySession","activeEntry","observeWatchdog","noteWatchdogActivity","profileRevision","profileChanged","hasBusyRuntime","hasStaleProfile","liveSessionViews","openBackground","sendBackground","isRoleBusy","hasLiveSession","wasLastTurnAborted","hasPendingDelivery","waitForRoleSettle","waitForRoleIdle","abort","stop","isOpen","openForRoleId","liveRoleIds","findLiveRuntime","ensureFreshRoleSession","rebuildSession","rebuildSessionUnsafe","isCustomerInitiatedTurn"],
  "open": ["open","openInternal","openInternalUnsafe"],
};
for (const [file, names] of Object.entries(ALLOC)) {
  const ids = new Set();
  for (const name of names) {
    const m = byName.get(name);
    if (!m) throw new Error("missing " + name);
    const t = lines.slice(m.startLine - 1, m.endLine).join("\n");
    for (const mm of t.matchAll(/\bthis\.([A-Za-z_$][\w$]*)/g)) ids.add(mm[1]);
  }
  ids.delete("deps");
  console.log(`\n=== ${file} (${ids.size}) ===`);
  console.log([...ids].sort().join(", "));
}
