#!/usr/bin/env bash
# A1 evidence: candidate hashes for the six A1 files (git hash-object + sha256 + line count).
set +e
WORKTREE="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane"
EVIDENCE="$WORKTREE/角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-A1-evidence"
LOG="$EVIDENCE/07-candidate-hashes.txt"
cd "$WORKTREE" || exit 99
{
  echo "captured_at: $(date -Iseconds)"
  echo "baseline_head: 4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0"
  for f in \
    src/model/directive-marker.ts \
    src/model/directive.ts \
    src/model/runtime.ts \
    src/model/project-state.ts \
    test/runtime-core/directive-marker.test.ts \
    test/runtime-core/directive-contract.test.ts; do
    echo "path: $f"
    echo "  git hash-object: $(git hash-object "$f")"
    echo "  sha256: $(sha256sum "$f" | cut -d' ' -f1)"
    echo "  lines: $(wc -l < "$f")"
  done
} > "$LOG"
exit 0
