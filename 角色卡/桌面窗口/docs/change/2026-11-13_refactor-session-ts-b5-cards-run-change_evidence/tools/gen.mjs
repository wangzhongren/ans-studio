import fs from "node:fs";

process.chdir("C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b5");
const data = JSON.parse(fs.readFileSync(".tmp-b5/methods.json", "utf8"));
const byName = new Map(data.methods.map((m) => [m.name, m]));

const GROUPS = {
  "app/desktop/session/cards/cards.ts": {
    preamble: ".tmp-b5/pre-cards.txt",
    methods: ["interpretDirective", "requestRequirementChangeDecision", "requestRunChangeDecision", "pickGovernedCardEntry", "presentAppCard", "presentVersionChangeCard", "presentAmendmentItemCard", "presentStableWriteCard", "noteVersionChange", "noteVersionChangeInitiator", "reportPlanEscalation", "afterPlanEscalation", "activeRunViews", "proposalCardFrozenRejection", "pendingVersionChangesFor", "offerRunChangeOnFrozenContract", "requestIdFor", "notifyRequest", "recordRequestPresented", "appointmentWriteApplicationRejection", "withRequestLifecycle"],
    inlineImportFix: null,
  },
  "app/desktop/session/cards/version-decisions.ts": {
    preamble: ".tmp-b5/pre-version-decisions.txt",
    methods: ["versionDecisionSubjectKey", "isVersionDecisionRequestIdForSubject", "findPendingVersionDecision", "pendingRequestIdsForFlow", "countPriorVersionDecisions", "buildVersionDecisionFacts", "versionDecisionCardLabels", "decidedByText", "formatTargetVersions", "stripVersionDecisionPrefix", "nextVersionFlowId", "mapVersionDecisionRawOutcome", "appendVersionDecisionAudit", "emitVersionDecisionResolved", "requestVersionDecision", "restoreVersionDecisions", "restoreRequestState"],
    inlineImportFix: null,
  },
  "app/desktop/session/cards/acceptance-facts.ts": {
    preamble: ".tmp-b5/pre-acceptance.txt",
    methods: ["enrichAcceptanceJudgeContext", "afterStableWrite", "enrichAppointmentWriteBoundaryCard", "afterAppointmentWriteApproved", "countAcceptanceRejections"],
    inlineImportFix: (text) => text.replaceAll('import("../../src/model/runtime.ts")', 'import("../../../../src/model/runtime.ts")'),
  },
  "app/desktop/session/run-change.ts": {
    preamble: ".tmp-b5/pre-run-change.txt",
    methods: ["runTaskIsFenced", "selectRunChangeForHandle", "completeTeamPlanForHandle", "ownedRunStopMembers", "executeOwnedRunStop", "resumeDeferredRunChanges", "executionInventoryFacts", "controllerProducerFacts", "stopExactController"],
    inlineImportFix: (text) => text.replaceAll("new Map<SessionManager,", "new Map<RunChangePeer,"),
    locatorComments: new Map([
      ["ownedRunStopMembers", "  /** 原 `private ownedRunStopMembers`（B5 自 session.ts 逐字搬移；模块内 public 仅为门面委托可调用）。 */"],
      ["executeOwnedRunStop", "  /** 原 `private async executeOwnedRunStop`（B5 自 session.ts 逐字搬移；模块内 public 仅为门面委托可调用）。 */"],
      ["resumeDeferredRunChanges", "  /** 原 `private resumeDeferredRunChanges`（B5 自 session.ts 逐字搬移；模块内 public 仅为门面委托可调用）。 */"],
    ]),
  },
};

for (const [target, spec] of Object.entries(GROUPS)) {
  const parts = [fs.readFileSync(spec.preamble, "utf8").replace(/\n*$/, "\n")];
  for (const name of spec.methods) {
    const method = byName.get(name);
    if (!method) throw new Error(`missing method ${name}`);
    let text = method.text;
    {
      let replaced = false;
      text = text.split("\n").map((line) => {
        if (!replaced && /^\s+private (async )?[A-Za-z0-9_$]+[<(]/.test(line)) {
          replaced = true;
          return line.replace(/^(\s+)private /, "$1");
        }
        return line;
      }).join("\n");
    }
    if (spec.inlineImportFix) text = spec.inlineImportFix(text);
    const locator = spec.locatorComments?.get(name);
    if (locator) parts.push(locator + "\n");
    parts.push(`  // —— ${name}（B5 自 session.ts 逐字搬移）——\n`);
    parts.push(text.endsWith("\n") ? text : `${text}\n`);
    parts.push("\n");
  }
  parts.push("}\n");
  fs.mkdirSync(target.split("/").slice(0, -1).join("/"), { recursive: true });
  fs.writeFileSync(target, parts.join(""), "utf8");
  console.log("wrote", target, parts.join("").split("\n").length - 1, "lines");
}
