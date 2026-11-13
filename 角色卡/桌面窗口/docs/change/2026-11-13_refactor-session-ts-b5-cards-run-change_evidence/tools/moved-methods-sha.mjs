import fs from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

process.chdir("C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b5");
const OUT = "角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b5-cards-run-change_evidence";
fs.mkdirSync(OUT, { recursive: true });

const headText = execSync("git show HEAD:app/desktop/session.ts", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const srcLines = headText.split(/\r?\n/);
const data = JSON.parse(fs.readFileSync(".tmp-b5/methods.json", "utf8"));
const byName = new Map(data.methods.map((m) => [m.name, m]));
const facadeText = fs.readFileSync("app/desktop/session.ts", "utf8");

const GROUPS = [
  ["app/desktop/session/cards/cards.ts", "cards", [
    "interpretDirective", "requestRequirementChangeDecision", "requestRunChangeDecision", "pickGovernedCardEntry", "presentAppCard",
    "presentVersionChangeCard", "presentAmendmentItemCard", "presentStableWriteCard", "noteVersionChange", "noteVersionChangeInitiator",
    "reportPlanEscalation", "afterPlanEscalation", "activeRunViews", "proposalCardFrozenRejection", "pendingVersionChangesFor",
    "offerRunChangeOnFrozenContract", "requestIdFor", "notifyRequest", "recordRequestPresented", "appointmentWriteApplicationRejection", "withRequestLifecycle",
  ]],
  ["app/desktop/session/cards/version-decisions.ts", "versionDecisions", [
    "versionDecisionSubjectKey", "isVersionDecisionRequestIdForSubject", "findPendingVersionDecision", "pendingRequestIdsForFlow",
    "countPriorVersionDecisions", "buildVersionDecisionFacts", "versionDecisionCardLabels", "decidedByText", "formatTargetVersions",
    "stripVersionDecisionPrefix", "nextVersionFlowId", "mapVersionDecisionRawOutcome", "appendVersionDecisionAudit", "emitVersionDecisionResolved",
    "requestVersionDecision", "restoreVersionDecisions", "restoreRequestState",
  ]],
  ["app/desktop/session/cards/acceptance-facts.ts", "acceptanceFacts", [
    "enrichAcceptanceJudgeContext", "afterStableWrite", "enrichAppointmentWriteBoundaryCard", "afterAppointmentWriteApproved", "countAcceptanceRejections",
  ]],
  ["app/desktop/session/run-change.ts", "runChange", [
    "runTaskIsFenced", "selectRunChangeForHandle", "completeTeamPlanForHandle", "ownedRunStopMembers", "executeOwnedRunStop",
    "resumeDeferredRunChanges", "executionInventoryFacts", "controllerProducerFacts", "stopExactController",
  ]],
];

const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/**
 * 归一化（记录化适配；源与目标同规则）：
 *  1) 声明行 `private ` 前缀移除（模块内 public 仅为门面委托可调用；门面侧可见性逐字不变）；
 *  2) 正文内联 `import("…src/model/runtime.ts")` 相对深度规范化（session.ts 为 ../../src，cards/ 为
 *     ../../../../src；同一模块，仅类型位置）；
 *  3) `ownedRunStopMembers` 的局部 Map 键类型 `SessionManager` → `RunChangePeer`（L2 不可导入门面类；
 *     运行时同对象、仅编译期结构化视图）。
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
    .replace(/"\.\.\/(?:\.\.\/)*src\/model\/runtime\.ts"/g, '"../src/model/runtime.ts"')
    .replace(/new Map<SessionManager,/g, "new Map<RunChangePeer,");
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
    const sourceText = srcLines.slice(m.startLine - 1, m.endLine).join("\n") + "\n";
    const marker = `  // —— ${name}（B5 自 session.ts 逐字搬移）——`;
    const markerIndex = targetLines.indexOf(marker);
    if (markerIndex < 0) throw new Error(`marker not found for ${name} in ${target}`);
    const lineCount = m.endLine - m.startLine + 1;
    const targetMethodText = targetLines.slice(markerIndex + 1, markerIndex + 1 + lineCount).join("\n") + "\n";
    const sourceNormalized = normalize(sourceText);
    const targetNormalized = normalize(targetMethodText);
    const sourceBody = extractBody(sourceNormalized);
    const targetBody = extractBody(targetNormalized);
    const delegation = new RegExp(`return this\\.${field}\\.${name}\\(`, "m").test(facadeText);
    reports.push({
      name,
      group: "cards",
      target,
      sourceStartLine: m.startLine,
      sourceEndLine: m.endLine,
      targetStartLine: markerIndex + 2,
      targetEndLine: markerIndex + 1 + lineCount,
      adaptations: [
        "visibility: private -> module public (declaration prefix only)",
        ...(name === "enrichAcceptanceJudgeContext" ? ["inline import depth: ../../src -> ../../../../src (type-only, same module)"] : []),
        ...(name === "ownedRunStopMembers" ? ["local Map key type: SessionManager -> RunChangePeer (compile-time structural view; same runtime objects)"] : []),
      ],
      sourceTextSha256: sha(sourceText),
      targetTextSha256: sha(targetMethodText),
      sourceNormalizedSha256: sha(sourceNormalized),
      targetNormalizedSha256: sha(targetNormalized),
      identicalUnderDocumentedAdaptations: sourceNormalized === targetNormalized,
      sourceBodySha256: sha(sourceBody),
      targetBodySha256: sha(targetBody),
      bodyIdentical: sourceBody === targetBody,
      facadeDelegationPresent: delegation,
    });
  }
}
// group label fix
for (const r of reports) {
  if (r.target.includes("/cards/")) r.group = "cards";
  if (r.target.endsWith("run-change.ts")) r.group = "run-change";
}

const allIdentical = reports.every((r) => r.identicalUnderDocumentedAdaptations && r.bodyIdentical && r.facadeDelegationPresent);
const out = {
  generatedAt: new Date().toISOString(),
  source: "git show HEAD:app/desktop/session.ts (9970c3d = origin/main, contains B0-B4; 9,118 lines)",
  adaptations: [
    "receiver/state: 类外壳同名成员重建 this 面（cards/run-change 单 owner 状态 / shared 同名同义委托 / 未迁出门面方法端口 / FixedCardHooks）",
    "visibility: private -> 模块内 public（仅门面委托可调用；不进入公开导出面）",
    "inline import depth: enrichAcceptanceJudgeContext 的 import(\"…src/model/runtime.ts\") 相对路径随模块目录深度调整（类型位置，同一模块）",
    "run-change ownedRunStopMembers 局部 Map 键类型 SessionManager -> RunChangePeer（结构化编译期视图，运行时同对象）",
  ],
  methodCount: reports.length,
  allIdenticalUnderDocumentedAdaptations: allIdentical,
  allMethodsIdenticalUnderDocumentedAdaptations: allIdentical,
  allMethodBodiesIdentical: reports.every((r) => r.bodyIdentical),
  allFacadeDelegationsPresent: reports.every((r) => r.facadeDelegationPresent),
  methods: reports,
};
fs.writeFileSync(`${OUT}/moved-methods.json`, JSON.stringify(out, null, 2), "utf8");

const rows = reports.map((r) => `| \`${r.name}\` | \`${r.target.replace("app/desktop/session/", "")}\` | ${r.sourceStartLine}-${r.sourceEndLine} | ${r.targetStartLine}-${r.targetEndLine} | ${r.identicalUnderDocumentedAdaptations && r.bodyIdentical ? "✅" : "❌"} \`${r.targetNormalizedSha256.slice(0, 16)}…\` |`);
const summary = `# B5 搬出方法摘要（52 方法，逐字移动证明）

- 源：\`git show HEAD:app/desktop/session.ts\`（9970c3d = origin/main，含 B0–B4；9,118 行）
- 方法数：**52**（cards 43：cards.ts 21 / version-decisions.ts 17 / acceptance-facts.ts 5；run-change 9）
- 全部在记录化适配下逐字节相等：**${out.allIdenticalUnderDocumentedAdaptations}**；方法体 sha256 全部相等：**${out.allMethodBodiesIdentical}**；门面薄委托全部存在：**${out.allFacadeDelegationsPresent}**
- 归一化（源与目标同规则）：（1）声明行 \`private \` 前缀去掉（模块内 public，供门面委托调用；门面侧可见性逐字不变）；（2）\`enrichAcceptanceJudgeContext\` 的内联 \`import("…src/model/runtime.ts")\` 相对深度随模块目录调整（类型位置，同一模块）；（3）\`ownedRunStopMembers\` 局部 Map 键类型 \`SessionManager\` → \`RunChangePeer\`（编译期结构化视图，运行时同对象）。方法体其余文本（含 JSDoc）零改动。
- 定位注释（不参与方法体）：run-change 的 \`ownedRunStopMembers\`/\`executeOwnedRunStop\`/\`resumeDeferredRunChanges\` 声明前保留注明原 \`private\` 声明文本的注释行，供 chief-workflow 顺序钉按方法边界切片（钉子本身零改动）。

| 方法 | 模块 | HEAD 源行 | 目标行 | 归一化 sha256 相等 |
| --- | --- | --- | --- | --- |
${rows.join("\n")}
`;
fs.writeFileSync(`${OUT}/moved-methods-summary.md`, summary, "utf8");
console.log(JSON.stringify({ methodCount: reports.length, allIdentical, failures: reports.filter((r) => !r.identicalUnderDocumentedAdaptations || !r.bodyIdentical || !r.facadeDelegationPresent).map((r) => r.name) }));
