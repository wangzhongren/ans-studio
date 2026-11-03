#!/usr/bin/env bash
# A1 evidence: static dependency/single-source checks (complements the runtime assertions in the contract test).
set +e
WORKTREE="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane"
EVIDENCE="$WORKTREE/角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-A1-evidence"
LOG="$EVIDENCE/09-static-checks.txt"
cd "$WORKTREE" || exit 99
{
  echo "captured_at: $(date -Iseconds)"
  echo "=== marker imports / require / node: (expect none)"
  grep -nE '^\s*import\b|require\s*\(|node:' src/model/directive-marker.ts || echo "NONE"
  echo "=== directive.ts import lines (expect 3: marker type, runtime type, runtime value)"
  grep -nE '^\s*import\b' src/model/directive.ts
  echo "=== directive.ts import sources"
  grep -n 'from "' src/model/directive.ts
  echo "=== runtime.ts / project-state.ts must not define CUSTOMER_DIRECTIVE_* (expect none)"
  grep -rn 'CUSTOMER_DIRECTIVE_' src/model/runtime.ts src/model/project-state.ts || echo "NONE"
  echo "=== only one parseDirectiveMarker implementation"
  grep -rn 'function parseDirectiveMarker' src test/runtime-core
  echo "=== runtime.ts must not import directive model (expect none)"
  grep -n 'from "./directive' src/model/runtime.ts || echo "NONE"
  echo "=== project-state.ts must not import runtime.ts (expect none)"
  grep -n 'from "./runtime.ts"' src/model/project-state.ts || echo "NONE"
  echo "=== by unions: RequestResolvedEvent includes directive; only ApprovalResolvedEvent stays customer|judge (out of scope)"
  grep -n 'by: "judge" | "customer"' src/model/runtime.ts || echo "NONE"
  echo "--- ApprovalResolvedEvent context (must stay narrow)"
  sed -n '903,906p' src/model/runtime.ts
  echo "=== Q9 fields present"
  grep -n 'directiveId' src/model/runtime.ts
  echo "=== GOVERNANCE_SLUG_PATTERN single definition in Model"
  grep -rn 'export const GOVERNANCE_SLUG_PATTERN' src/model
  echo "=== no @边界 string literal marker in directive.ts"
  grep -n '"@边界"\|'"'"'@边界'"'"'' src/model/directive.ts || echo "NONE"
} > "$LOG"
exit 0
