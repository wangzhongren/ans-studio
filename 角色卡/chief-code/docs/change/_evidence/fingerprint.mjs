// chief 模块 legacy/fixed 指纹采集（T3 B2 chief-code 批次 before/after 对照；只读，不写产品代码）。
//
// 用法：node 角色卡/chief-code/docs/change/_evidence/fingerprint.mjs
// 输出：确定性文本（逐行 key=JSON；哈希为 utf8 SHA-256），供 before/after diff 证明 legacy 逐字不变。

import { createHash } from "node:crypto";

const moduleUrl = new URL("../../../../../src/common/roles/chief/index.ts", import.meta.url);
const m = await import(moduleUrl.href);

const { chiefRoleModule, CHIEF_HUB_DISPATCH, CHIEF_INTENT_CONFIRM_CARD, CHIEF_TOOL_IDS, CHIEF_WORKFLOW_RESOURCE } = m;

const sha256 = (text) => createHash("sha256").update(typeof text === "string" ? text : JSON.stringify(text)).digest("hex");
const show = (label, value) => console.log(`${label}=${JSON.stringify(value)}`);

show("module.id", chiefRoleModule.id);
show("module.displayName", chiefRoleModule.displayName);
show("module.function", chiefRoleModule.function);
show("module.cards", [...chiefRoleModule.cards]);
show("module.cards.frozen", Object.isFrozen(chiefRoleModule.cards));
show("module.fixedCards", chiefRoleModule.fixedCards === undefined ? null : [...chiefRoleModule.fixedCards]);
show("module.fixedTargetRoleIds", chiefRoleModule.fixedTargetRoleIds === undefined ? null : [...chiefRoleModule.fixedTargetRoleIds]);
show("module.capabilities", chiefRoleModule.capabilities);
show("module.card.text.length", chiefRoleModule.card.text.length);
show("module.card.text.lineCount", chiefRoleModule.card.text.split("\n").length);
show("module.card.text.sha256", sha256(chiefRoleModule.card.text));
show("module.card.entries", chiefRoleModule.card.entries);
show("module.card.preauthorizedDirs", [...chiefRoleModule.card.preauthorizedDirs]);
show("module.card.forbiddenWritePaths", [...chiefRoleModule.card.forbiddenWritePaths]);
show("module.card.spec.sha256", sha256(chiefRoleModule.card));
show("chief.toolIds", [...CHIEF_TOOL_IDS]);
show("hub.dispatch", { ...CHIEF_HUB_DISPATCH, targetRoleIds: [...CHIEF_HUB_DISPATCH.targetRoleIds] });
show("hub.dispatch.sha256", sha256({ ...CHIEF_HUB_DISPATCH, targetRoleIds: [...CHIEF_HUB_DISPATCH.targetRoleIds] }));
show("intent.confirm", { ...CHIEF_INTENT_CONFIRM_CARD, optionIds: [...CHIEF_INTENT_CONFIRM_CARD.optionIds], customerOnlyOptionIds: [...CHIEF_INTENT_CONFIRM_CARD.customerOnlyOptionIds] });
show("workflow.resource", { ...CHIEF_WORKFLOW_RESOURCE });

for (const governanceModel of ["trio", "single"]) {
  const policy = chiefRoleModule.tools({ governanceModel });
  show(`tools.${governanceModel}`, { capabilities: policy.capabilities, tools: [...policy.tools], reasons: policy.reasons });
}

const dispatchFacts = [
  { sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true },
  { sourceRoleId: "chief", targetRoleId: "rapporteur", targetKind: "built-in-governance", targetExists: true },
  { sourceRoleId: "chief", targetRoleId: "nominator", targetKind: "built-in-governance", targetExists: true },
  { sourceRoleId: "chief", targetRoleId: "convener", targetKind: "built-in-governance", targetExists: true },
  { sourceRoleId: "chief", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true },
  { sourceRoleId: "chief", targetRoleId: "chief", targetKind: "built-in-governance", targetExists: true },
  { sourceRoleId: "chief", targetRoleId: "worker-a", targetKind: "project", targetExists: true },
  { sourceRoleId: "convener", targetRoleId: "worker-a", targetKind: "project", targetExists: true },
  { sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance", targetExists: false },
  { sourceRoleId: "chief", targetRoleId: "liaison", targetKind: "built-in-governance", targetExists: true },
];
dispatchFacts.forEach((facts, index) => show(`dispatch.${index}`, chiefRoleModule.dispatch(facts)));

const preflightFacts = [
  { flowId: "q2-new", action: "version-modify", reason: "x" },
  { flowId: "Q2 New", action: "version-modify", reason: "x" },
  { flowId: "q2-new", action: "upgrade", reason: "x" },
  { flowId: "q2-new", action: "version-modify", reason: "x", runState: "pinned" },
  { flowId: "q2-new", action: "version-modify", reason: "x", pendingVersionDecisionCount: 1 },
];
preflightFacts.forEach((facts, index) =>
  show(`preflight.${index}`, chiefRoleModule.preflight.checkAction({ action: "version-decision", facts })),
);
show("preflight.other", chiefRoleModule.preflight.checkAction({ action: "review", facts: {} }));

const legacyContext = chiefRoleModule.context({ governanceModel: "trio" });
show("context.legacy.ids", legacyContext.map((section) => section.id));
show("context.legacy.json", legacyContext);
show("context.legacy.sha256", sha256(legacyContext));
show("context.legacy.frozen", Object.isFrozen(legacyContext));
show("context.legacy.resources", legacyContext[0]?.resources ?? null);
show("context.legacy.explicitLegacyV1.sameRef", chiefRoleModule.context({ governanceModel: "trio", matrix: "legacy-v1" }) === legacyContext);

const fixedContext = chiefRoleModule.context({ governanceModel: "trio", matrix: "two-fixed-paths/v1" });
show("context.fixed.ids", fixedContext.map((section) => section.id));
show("context.fixed.json", fixedContext);
show("context.fixed.sha256", sha256(fixedContext));
show("context.fixed.frozen", Object.isFrozen(fixedContext));
show("context.fixed.sameAsLegacyRef", fixedContext === legacyContext);
