// nominator B2 证据脚本：fixed 数据/上下文指纹（写盘后只读采集）。
import { createHash } from "node:crypto";

import { nominatorRoleModule } from "../../../../../src/common/roles/nominator/index.ts";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value);

const fixed = nominatorRoleModule.context({ governanceModel: "trio", matrix: "two-fixed-paths/v1" });
const legacy = nominatorRoleModule.context({ governanceModel: "trio" });
const legacyExplicit = nominatorRoleModule.context({ governanceModel: "trio", matrix: "legacy-v1" });

console.log(`node ${process.version}`);
console.log(`fixedCards.exists=${nominatorRoleModule.fixedCards !== undefined}`);
console.log(`fixedCards.value=${json([...(nominatorRoleModule.fixedCards ?? [])])}`);
console.log(`fixedCards.frozen=${Object.isFrozen(nominatorRoleModule.fixedCards)}`);
console.log(`fixedCards.sameReferenceAsLegacyCards=${nominatorRoleModule.fixedCards === nominatorRoleModule.cards}`);
console.log(`legacyCards.value=${json([...nominatorRoleModule.cards])}`);
console.log(`fixedContext.ids=${json(fixed.map((section) => section.id))}`);
console.log(`fixedContext.frozen=${Object.isFrozen(fixed)}`);
console.log(`fixedContext.sameReferenceAsLegacy=${fixed === legacy}`);
console.log(`legacyContext.sameReferenceExplicitLegacy=${legacy === legacyExplicit}`);
console.log(`fixedContext.hash=${sha(json(fixed))}`);
for (const section of fixed) {
  console.log(`fixedContext[${section.id}].frozen=${Object.isFrozen(section)} resources=${section.resources === undefined}`);
  console.log(`fixedContext[${section.id}].hash=${sha(section.text)}`);
  console.log(`--- ${section.id} ---`);
  console.log(section.text);
  console.log(`--- /${section.id} ---`);
}
console.log(`legacyContext.hash=${sha(json(legacy))}`);
console.log(`legacyContext.containsFixedMarker=${json(legacy).includes("two-fixed-paths")}`);
console.log(`fixedContext.containsLegacyIds=${json(fixed).includes("nominator-appointment-card")}`);
