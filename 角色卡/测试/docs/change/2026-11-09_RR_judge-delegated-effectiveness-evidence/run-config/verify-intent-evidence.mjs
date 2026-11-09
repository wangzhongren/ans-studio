// Post-run read-only evidence check for the judge-delegated RR (outside the repo).
// Imports the worktree implementation and calls readConfirmedIntentEvidence against the target root.
// No writes to the repo or the target; only writes its result JSON under the run root.
import fs from "node:fs";
import path from "node:path";
const [, , projectRootArg, relPath, outFile] = process.argv;
const projectRoot = path.win32.normalize(projectRootArg);
const registry = await import("file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment/src/provider/version-change/impl/guard-freeze-registry.ts");
const result = await registry.readConfirmedIntentEvidence(projectRoot, relPath);
const payload = { checkedAt: new Date().toISOString(), projectRoot, relPath, result };
fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload));
