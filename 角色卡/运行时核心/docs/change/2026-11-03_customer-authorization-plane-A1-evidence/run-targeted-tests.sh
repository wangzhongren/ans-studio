#!/usr/bin/env bash
# A1 evidence: targeted directive tests. Raw stdout/stderr is appended to 03-targeted-tests.log.
set +e
WORKTREE="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane"
EVIDENCE="$WORKTREE/角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-A1-evidence"
LOG="$EVIDENCE/03-targeted-tests.log"
cd "$WORKTREE" || exit 99
{
  echo "cwd: $(pwd)"
  echo "command: node --test --test-concurrency=1 test/runtime-core/directive-marker.test.ts test/runtime-core/directive-contract.test.ts"
  echo "start: $(date -Iseconds)"
} > "$LOG"
node --test --test-concurrency=1 test/runtime-core/directive-marker.test.ts test/runtime-core/directive-contract.test.ts >> "$LOG" 2>&1
CODE=$?
{
  echo "exit_code: $CODE"
  echo "end: $(date -Iseconds)"
} >> "$LOG"
exit "$CODE"
