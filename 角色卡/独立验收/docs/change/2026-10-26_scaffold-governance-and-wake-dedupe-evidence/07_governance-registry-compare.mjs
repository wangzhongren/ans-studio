import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";

const base = await import(pathToFileURL("C:/Users/51054/AppData/Local/Temp/accept-baseline-tree/src/common/门禁引擎/governance-roles.ts").href);
const head = await import(pathToFileURL("C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/src/common/门禁引擎/governance-roles.ts").href);

const structural = (spec) => ({
  id: spec.id,
  displayName: spec.displayName,
  function: spec.function,
  entries: spec.entries,
  preauthorizedDirs: spec.preauthorizedDirs,
  forbiddenWritePaths: spec.forbiddenWritePaths,
  capabilities: spec.capabilities,
});

const idsBase = base.BUILT_IN_GOVERNANCE_ROLES.map((spec) => spec.id);
const idsHead = head.BUILT_IN_GOVERNANCE_ROLES.map((spec) => spec.id);
assert.deepEqual(idsHead, idsBase, "built-in id list changed");
const cardTextDiffs = [];
for (const id of idsHead) {
  assert.deepEqual(structural(head.governanceRoleOf(id)), structural(base.governanceRoleOf(id)), `structural fields changed for ${id}`);
  if (head.governanceRoleOf(id).cardText !== base.governanceRoleOf(id).cardText) cardTextDiffs.push(id);
}
console.log("built-in ids:", JSON.stringify(idsHead));
console.log("structural fields identical (id/displayName/function/entries/preauthorizedDirs/forbiddenWritePaths/capabilities): true");
console.log("cardText changed for:", JSON.stringify(cardTextDiffs));
for (const name of ["BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE", "ENGINEERING_QUALITY_BASELINE", "STANDARD_WORKFLOW_PRINCIPLE", "LEGACY_SU_PREAUTHORIZED_DIRS", "LEGACY_SU_CAPABILITIES", "APP_GOVERNANCE_SOURCE"]) {
  const same = JSON.stringify(base[name]) === JSON.stringify(head[name]);
  console.log(name, same ? "unchanged" : "CHANGED");
  if (!same) process.exitCode = 3;
}
