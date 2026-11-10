// nominator B2 证据脚本：legacy 冻结指纹（before/after 各跑一次，输出逐字节比对）。
// 只读：import 模块与测试夹具，计算候选字段/策略输出的 SHA-256 与结构快照；不写盘、不改状态。
import { createHash } from "node:crypto";

import { nominatorRoleModule } from "../../../../../src/common/roles/nominator/index.ts";
import {
  d3CardFacts,
  roleDocumentsFacts,
} from "../../../../../test/roles/nominator/fixtures/nominator-fixtures.ts";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value);

const out = [];
out.push(`node ${process.version}`);

// 规格数据
out.push(`card.text=${sha(nominatorRoleModule.card.text)} (${nominatorRoleModule.card.text.length} chars)`);
out.push(`card.entries=${sha(json(nominatorRoleModule.card.entries))}`);
out.push(`card.preauthorizedDirs=${sha(json(nominatorRoleModule.card.preauthorizedDirs))}`);
out.push(`card.forbiddenWritePaths=${sha(json(nominatorRoleModule.card.forbiddenWritePaths))}`);
out.push(`capabilities=${sha(json(nominatorRoleModule.capabilities))}`);
out.push(`cards=${sha(json([...nominatorRoleModule.cards]))} value=${json([...nominatorRoleModule.cards])}`);

// 工具策略
const trio = nominatorRoleModule.tools({ governanceModel: "trio" });
const single = nominatorRoleModule.tools({ governanceModel: "single" });
out.push(`tools.trio=${sha(json({ tools: [...trio.tools], reasons: trio.reasons, capabilities: trio.capabilities }))} value=${json([...trio.tools])}`);
out.push(`tools.single=${sha(json({ tools: [...single.tools], reasons: single.reasons, capabilities: single.capabilities }))} value=${json([...single.tools])}`);

// 派发策略（legacy 语义；不传 matrix）
const dispatchCases = [
  ["chief->nominator builtin exists", { sourceRoleId: "chief", targetRoleId: "nominator", targetKind: "built-in-governance", targetExists: true }],
  ["convener->nominator builtin exists", { sourceRoleId: "convener", targetRoleId: "nominator", targetKind: "built-in-governance", targetExists: true }],
  ["nominator->nominator self", { sourceRoleId: "nominator", targetRoleId: "nominator", targetKind: "built-in-governance", targetExists: true }],
  ["product->nominator unknown", { sourceRoleId: "product", targetRoleId: "nominator", targetKind: "built-in-governance", targetExists: true }],
  ["chief->nominator project", { sourceRoleId: "chief", targetRoleId: "nominator", targetKind: "project", targetExists: true }],
  ["chief->nominator missing target", { sourceRoleId: "chief", targetRoleId: "nominator", targetKind: "built-in-governance" }],
  ["chief->product out of scope", { sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true }],
];
for (const [name, input] of dispatchCases) {
  const result = nominatorRoleModule.dispatch(input);
  out.push(`dispatch[${name}]=${sha(json(result))} value=${json(result)}`);
}

// preflight（legacy 语义；不传 matrix）
const pre = nominatorRoleModule.preflight;
if (pre === undefined) throw new Error("preflight missing");
const preCases = [
  ["d3-card allow", "appointment", d3CardFacts()],
  ["role-documents allow", "appointment", roleDocumentsFacts()],
  ["action-not-covered", "team-plan", {}],
];
for (const [name, action, facts] of preCases) {
  const result = pre.checkAction({ action, facts });
  out.push(`preflight[${name}]=${sha(json(result))} value=${json(result)}`);
}

// context（legacy 三种调用；应与 before 完全一致）
const contextCalls = [
  ["context({governanceModel:trio})", { governanceModel: "trio" }],
  ["context({governanceModel:single})", { governanceModel: "single" }],
  ["context({})", {}],
];
for (const [name, input] of contextCalls) {
  const sections = nominatorRoleModule.context(input);
  out.push(`context[${name}].ids=${json(sections.map((s) => s.id))}`);
  out.push(`context[${name}]=${sha(json(sections))}`);
}
// 引用同一性：legacy 三种调用必须返回同一数组引用（逐字旧段）。
const a = nominatorRoleModule.context({ governanceModel: "trio" });
const b = nominatorRoleModule.context({});
out.push(`context.legacy.sameReference=${a === b}`);

// 模块键集（观测新增 fixedCards；legacy 值不受影响）
out.push(`module.keys=${json(Object.keys(nominatorRoleModule).sort())}`);

console.log(out.join("\n"));
