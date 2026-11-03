#!/usr/bin/env bash
# A1 evidence runner: runtime-core suite. Raw stdout/stderr is appended to 04-runtime-core-suite.log.
set +e
WORKTREE="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane"
EVIDENCE="$WORKTREE/角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-A1-evidence"
LOG="$EVIDENCE/04-runtime-core-suite.log"
cd "$WORKTREE" || exit 99
{
  echo "cwd: $(pwd)"
  echo "command: node --test --test-concurrency=1 \"test/runtime-core/*.test.ts\""
  echo "node: $(node --version)"
  echo "npm: $(npm --version)"
  echo "start: $(date -Iseconds)"
} > "$LOG"
node --test --test-concurrency=1 "test/runtime-core/*.test.ts" >> "$LOG" 2>&1
CODE=$?
{
  echo "exit_code: $CODE"
  echo "end: $(date -Iseconds)"
} >> "$LOG"
exit "$CODE"
