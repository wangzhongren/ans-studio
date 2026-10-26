import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const mod = await import(pathToFileURL("C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/src/common/编排/team-plan.ts").href);
const { validateTeamPlanFlowConsistency } = mod;

const plan = {
  ok: true,
  legacy: false,
  teamPlanSchema: 3,
  recommended: ["api", "storefront"],
  modules: ["api", "storefront"],
  moduleList: [],
  directories: ["api/", "storefront/"],
  directorySpecs: [],
  issues: [],
  roleRows: [
    { roleId: "api", isMap: true, primaryModule: "api", parallelGroup: "map-a", dependsOn: [] },
    { roleId: "storefront", isMap: true, primaryModule: "storefront", parallelGroup: "map-b", dependsOn: ["api"] },
  ],
};

const step = (id, extra = {}) => ({ id, title: id, owner: "x", kind: "dispatch", status: "pending", ...extra });
const flow = (withScaffold, deliveryApiDeps, deliveryStorefrontDeps = ["contract-freeze", "delivery-api"]) => ({
  flowId: "flow-a",
  version: 1,
  qualityTier: "production",
  steps: [
    step("contract-freeze", { owner: "convener", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: "docs/contracts/api-v1.md" } }),
    ...(withScaffold ? [step("build-scaffold", { owner: "api", dependsOn: ["contract-freeze"] })] : []),
    step("delivery-api", { owner: "api", parallelGroup: "map-a", dependsOn: deliveryApiDeps }),
    step("delivery-storefront", { owner: "storefront", parallelGroup: "map-b", dependsOn: deliveryStorefrontDeps }),
    step("test-map-shards", { owner: "integration", parallelGroup: "reduce", dependsOn: ["delivery-api", "delivery-storefront"] }),
    { id: "acceptance", title: "验收", owner: "verifier", kind: "acceptance", status: "pending" },
  ],
});

const run = (label, flowArg, expect) => {
  const issues = validateTeamPlanFlowConsistency(plan, flowArg);
  const messages = issues.map((issue) => issue.message);
  console.log(label, "=>", JSON.stringify(messages));
  expect(messages);
};

run("1 scaffold flow + delivery depends scaffold", flow(true, ["contract-freeze", "build-scaffold"]), (m) => assert.deepEqual(m, []));
run("2 scaffold optional (delivery without it)", flow(true, ["contract-freeze"]), (m) => assert.deepEqual(m, []));
run("3 no scaffold step but delivery depends scaffold", flow(false, ["contract-freeze", "build-scaffold"]), (m) => assert.ok(m.some((x) => /多：build-scaffold/.test(x))));
run("4 scaffold flow + delivery depends unknown peer-review", flow(true, ["contract-freeze", "build-scaffold", "peer-review"]), (m) => assert.ok(m.some((x) => /多：peer-review/.test(x))));
run("5 scaffold flow + delivery missing direct contract-freeze", flow(true, ["build-scaffold"]), (m) => assert.ok(m.some((x) => /缺：contract-freeze/.test(x))));
run("6 storefront missing dependency role delivery", flow(true, ["contract-freeze", "build-scaffold"], ["contract-freeze", "build-scaffold"]), (m) => assert.ok(m.some((x) => /缺：delivery-api/.test(x))));
console.log("ALL PROBES PASS");
