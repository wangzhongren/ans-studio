import json, re

root = "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b5"
data = json.load(open(f"{root}/.tmp-b5/methods.json", encoding="utf-8"))

GROUPS = {}
cards_ts = ["interpretDirective", "requestRequirementChangeDecision", "requestRunChangeDecision", "pickGovernedCardEntry", "presentAppCard", "presentVersionChangeCard", "presentAmendmentItemCard", "presentStableWriteCard", "noteVersionChange", "noteVersionChangeInitiator", "reportPlanEscalation", "afterPlanEscalation", "activeRunViews", "proposalCardFrozenRejection", "pendingVersionChangesFor", "offerRunChangeOnFrozenContract", "requestIdFor", "notifyRequest", "recordRequestPresented", "appointmentWriteApplicationRejection", "withRequestLifecycle"]
vd_ts = ["versionDecisionSubjectKey", "isVersionDecisionRequestIdForSubject", "findPendingVersionDecision", "pendingRequestIdsForFlow", "countPriorVersionDecisions", "buildVersionDecisionFacts", "versionDecisionCardLabels", "decidedByText", "formatTargetVersions", "stripVersionDecisionPrefix", "nextVersionFlowId", "mapVersionDecisionRawOutcome", "appendVersionDecisionAudit", "emitVersionDecisionResolved", "requestVersionDecision", "restoreVersionDecisions", "restoreRequestState"]
af_ts = ["enrichAcceptanceJudgeContext", "afterStableWrite", "enrichAppointmentWriteBoundaryCard", "afterAppointmentWriteApproved", "countAcceptanceRejections"]
rc_ts = ["runTaskIsFenced", "selectRunChangeForHandle", "completeTeamPlanForHandle", "ownedRunStopMembers", "executeOwnedRunStop", "resumeDeferredRunChanges", "executionInventoryFacts", "controllerProducerFacts", "stopExactController"]
for name in cards_ts: GROUPS[name] = ("cards", "session/cards/cards.ts")
for name in vd_ts: GROUPS[name] = ("versionDecisions", "session/cards/version-decisions.ts")
for name in af_ts: GROUPS[name] = ("acceptanceFacts", "session/cards/acceptance-facts.ts")
for name in rc_ts: GROUPS[name] = ("runChange", "session/run-change.ts")


def split_params(sig):
    assert sig[0] == "("
    depth = angle = brace = bracket = 0
    i = 0
    state = None
    parts = []
    cur = ""
    while i < len(sig):
        ch = sig[i]
        nxt = sig[i + 1] if i + 1 < len(sig) else ""
        if state is not None:
            cur += ch
            if ch == "\\":
                cur += nxt
                i += 2
                continue
            if (state == "single" and ch == "'") or (state == "double" and ch == '"') or (state == "template" and ch == "`"):
                state = None
            i += 1
            continue
        if ch == "'":
            state = "single"; cur += ch; i += 1; continue
        if ch == '"':
            state = "double"; cur += ch; i += 1; continue
        if ch == "`":
            state = "template"; cur += ch; i += 1; continue
        if ch == "(":
            depth += 1
            if depth == 1:
                i += 1
                continue
        elif ch == ")":
            depth -= 1
            if depth == 0:
                if cur.strip():
                    parts.append(cur)
                return parts
        elif ch == "<":
            angle += 1
        elif ch == ">":
            if angle > 0:
                angle -= 1
        elif ch == "{":
            brace += 1
        elif ch == "}":
            brace -= 1
        elif ch == "[":
            bracket += 1
        elif ch == "]":
            bracket -= 1
        elif ch == "," and depth == 1 and angle == 0 and brace == 0 and bracket == 0:
            parts.append(cur)
            cur = ""
            i += 1
            continue
        cur += ch
        i += 1
    raise ValueError("unbalanced params")


def param_name(part):
    p = part.strip()
    m = re.match(r"^(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*[:?=]", p)
    if m:
        return m.group(1)
    m = re.match(r"^([A-Za-z_$][\w$]*)$", p)
    if m:
        return m.group(1)
    raise ValueError(f"cannot parse param {p!r}")


lines = open(f"{root}/app/desktop/session.ts", encoding="utf-8").read().split("\n")
edits = []
report = []
for m in data["methods"]:
    name = m["name"]
    field, target = GROUPS[name]
    decl = m["declStartLine"] - 1
    body_open = m["bodyOpenLine"] - 1
    end = m["endLine"] - 1
    decl_line = lines[decl]
    joined = "\n".join(lines[decl:body_open + 1])
    joined_offset = decl_line.index("(")
    params = split_params(joined[joined_offset:])
    args = ", ".join(param_name(p) for p in params)
    sig_lines = lines[decl:body_open + 1]
    delegate = [f"  /** 薄委托 → `{target}`（JSDoc/方法体见模块）。 */"] + sig_lines + [f"    return this.{field}.{name}({args});", "  }"]
    edits.append((m["startLine"] - 1, end, delegate))
    report.append((name, field, args))

for start, end, newlines in sorted(edits, key=lambda e: e[0], reverse=True):
    lines[start:end + 1] = newlines
open(f"{root}/app/desktop/session.ts", "w", encoding="utf-8", newline="").write("\n".join(lines))
for row in report:
    print(row)
print("edits:", len(edits))
