import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(HERE, "../../../../../.."));
const OUT = "角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b6-handback-dispatch-fixed_evidence";
fs.mkdirSync(OUT, { recursive: true });

const headText = execSync("git show HEAD:app/desktop/session.ts", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const srcLines = headText.split(/\r?\n/);
const data = JSON.parse(fs.readFileSync(path.join(HERE, "methods-source.json"), "utf8"));
const byName = new Map(data.methods.map((m) => [m.name, m]));
const facadeText = fs.readFileSync("app/desktop/session.ts", "utf8");

const GROUPS = [
  ["app/desktop/session/handback.ts", "handback", [
    "displayHandback", "handbackFlowId", "isTaskHandbackShape", "handleHandback", "commitHandback",
  ]],
  ["app/desktop/session/dispatch.ts", "dispatch", [
    "routeDispatch", "chainDispatchFacts", "captureChiefDispatchSource", "resumeChiefController", "routeStarDispatch",
  ]],
  ["app/desktop/session/fixed-workflow/route.ts", "fixedWorkflowRoute", [
    "routeFixedPathDispatch", "ensurePathBStartForDispatch", "checkPathBWriteSetForDispatch",
  ]],
  ["app/desktop/session/fixed-workflow/cards.ts", "fixedWorkflowCards", [
    "inspectFixedHandbackChild", "completeTeamPlanFixedForHandle", "closeCreatedTaskFixedForSession",
    "verifyFixedReviewCloseBasis", "prepareFixedAppointmentCardRequest", "recordFixedCardWorkflowResolution",
  ]],
  ["app/desktop/session/fixed-workflow/release-merge.ts", "fixedWorkflowRelease", [
    "presentMergeMainCard", "runFixedReleaseMerge", "settleMergeMainCard", "autoPresentFixedReleaseMerge", "noteFixedReleaseAutoTrigger",
  ]],
  ["app/desktop/session/fixed-workflow/panel.ts", "fixedWorkflowPanel", [
    "fixedPanelState", "dispatchAdvisorySummary",
  ]],
];

const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/**
 * 归一化（记录化适配；源与目标同规则）：
 *  1) 声明行 `private ` 前缀移除（模块内 public 仅为门面委托可调用；门面侧可见性逐字不变）；
 *  2) `routeStarDispatch` 的局部类型 `ReturnType<SessionManager["captureChiefDispatchSource"]>` →
 *     `ReturnType<Dispatch["captureChiefDispatchSource"]>`（L4 不可导入门面类 SessionManager——
 *     循环依赖；同一方法在模块内的结构化 self 视图，运行时零差异，仅编译期类型名）。
 */
function normalize(text) {
  let done = false;
  return text
    .split("\n")
    .map((line) => {
      if (!done && /^\s+private (async )?[A-Za-z0-9_$]+[<(]/.test(line)) {
        done = true;
        return line.replace(/^(\s+)private /, "$1");
      }
      return line;
    })
    .join("\n")
    .replace(/ReturnType<SessionManager\["captureChiefDispatchSource"\]>/g, 'ReturnType<Dispatch["captureChiefDispatchSource"]>')
    .replace(/return this\.routeStarDispatch\(/g, "return this.port.routeStarDispatch(");
}

function extractBody(text) {
  const lines = text.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(?:private )?(?:async )?(?:[A-Za-z0-9_$]+)[<(]/.test(lines[i])) {
      for (let j = i; j < lines.length; j += 1) {
        if (lines[j].trimEnd().endsWith("{")) { start = j; break; }
      }
      break;
    }
  }
  if (start < 0) return text;
  const braceIndex = lines[start].lastIndexOf("{");
  return [lines[start].slice(braceIndex), ...lines.slice(start + 1)].join("\n");
}

const reports = [];
for (const [target, field, names] of GROUPS) {
  const targetText = fs.readFileSync(target, "utf8");
  const targetLines = targetText.split("\n");
  for (const name of names) {
    const m = byName.get(name);
    if (!m) throw new Error(`source method missing: ${name}`);
    const sourceText = srcLines.slice(m.startLine - 1, m.endLine).join("\n") + "\n";
    const marker = `  // —— ${name}（B6 自 session.ts 逐字搬移）——`;
    const markerIndex = targetLines.indexOf(marker);
    if (markerIndex < 0) throw new Error(`marker not found for ${name} in ${target}`);
    const lineCount = m.endLine - m.startLine + 1;
    const targetMethodText = targetLines.slice(markerIndex + 1, markerIndex + 1 + lineCount).join("\n") + "\n";
    const sourceNormalized = normalize(sourceText);
    const targetNormalized = normalize(targetMethodText);
    const sourceBody = extractBody(sourceNormalized);
    const targetBody = extractBody(targetNormalized);
    const delegationExpected = name !== "isTaskHandbackShape";
    const delegation = new RegExp(`return this\\.${field}\\.${name}\\(`, "m").test(facadeText);
    reports.push({
      name,
      group: field,
      target,
      sourceStartLine: m.startLine,
      sourceEndLine: m.endLine,
      targetStartLine: markerIndex + 2,
      targetEndLine: markerIndex + 1 + lineCount,
      adaptations: [
        "visibility: private -> module public (declaration prefix only)",
        ...(name === "routeStarDispatch"
          ? ['local type: ReturnType<SessionManager["captureChiefDispatchSource"]> -> ReturnType<Dispatch["captureChiefDispatchSource"]> (compile-time self-view; L4 cannot import facade class; zero runtime difference)']
          : []),
        ...(name === "routeDispatch"
          ? ["internal star-route call routed through DispatchPorts.routeStarDispatch -> facade same-name delegate -> module implementation (runtime-equivalent; keeps instance-level test override semantics of the facade method)"]
          : []),
      ],
      sourceTextSha256: sha(sourceText),
      targetTextSha256: sha(targetMethodText),
      sourceNormalizedSha256: sha(sourceNormalized),
      targetNormalizedSha256: sha(targetNormalized),
      identicalUnderDocumentedAdaptations: sourceNormalized === targetNormalized,
      sourceBodySha256: sha(sourceBody),
      targetBodySha256: sha(targetBody),
      bodyIdentical: sourceBody === targetBody,
      facadeDelegationExpected: delegationExpected,
      facadeDelegationPresent: delegation,
    });
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  sourceOfTruth: "git show HEAD:app/desktop/session.ts (b5901ac)",
  methodCount: reports.length,
  allMethodsIdenticalUnderDocumentedAdaptations: reports.every((r) => r.identicalUnderDocumentedAdaptations),
  allMethodBodiesIdentical: reports.every((r) => r.bodyIdentical),
  allFacadeDelegationsPresent: reports.every((r) => r.facadeDelegationPresent === r.facadeDelegationExpected),
  methods: reports,
};
fs.writeFileSync(`${OUT}/moved-methods.json`, JSON.stringify(summary, null, 2), "utf8");

const md = [
  "# B6 moved methods — normalization evidence",
  "",
  `- Source: \`git show HEAD:app/desktop/session.ts\` (b5901ac)`,
  `- Methods: ${summary.methodCount} (handback 4 + helper 1 / dispatch 5 / fixed-workflow 16)`,
  `- allMethodsIdenticalUnderDocumentedAdaptations = **${summary.allMethodsIdenticalUnderDocumentedAdaptations}**`,
  `- allMethodBodiesIdentical = **${summary.allMethodBodiesIdentical}**`,
  `- allFacadeDelegationsPresent = **${summary.allFacadeDelegationsPresent}**`,
  "",
  "| method | group | source lines | target | targets lines | normalized sha equal | body sha equal | facade delegate |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...reports.map((r) => `| ${r.name} | ${r.group} | ${r.sourceStartLine}-${r.sourceEndLine} | ${r.target} | ${r.targetStartLine}-${r.targetEndLine} | ${r.identicalUnderDocumentedAdaptations ? "YES" : "**NO**"} | ${r.bodyIdentical ? "YES" : "**NO**"} | ${r.facadeDelegationExpected ? (r.facadeDelegationPresent ? "YES" : "**NO**") : "n/a（内部 helper，仅随 handback 方法搬移）"} |`),
  "",
  "Adaptations (only these; all other text byte-identical):",
  "- visibility: `private ` declaration prefix removed in module (facade keeps exact visibility/signature).",
  "- `routeStarDispatch`: `ReturnType<SessionManager[\"captureChiefDispatchSource\"]>` → `ReturnType<Dispatch[\"captureChiefDispatchSource\"]>` (type-only self-view; L4 cannot import facade class).",
  "- `routeDispatch`: `return this.routeStarDispatch(` → `return this.port.routeStarDispatch(` (facade trampoline preserves instance-level override semantics; production path identical).",
  "",
].join("\n");
fs.writeFileSync(`${OUT}/moved-methods-summary.md`, md, "utf8");
const bad = reports.filter((r) => !r.identicalUnderDocumentedAdaptations || !r.bodyIdentical || r.facadeDelegationPresent !== r.facadeDelegationExpected);
console.log(JSON.stringify({ methodCount: reports.length, allOk: bad.length === 0, bad: bad.map((r) => r.name) }, null, 2));
