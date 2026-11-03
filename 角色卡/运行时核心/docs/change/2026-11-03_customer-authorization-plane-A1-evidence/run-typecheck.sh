#!/usr/bin/env bash
# A1 evidence runner: full repository typecheck. Raw stdout/stderr is appended to 05-npm-run-typecheck.log.
set +e
WORKTREE="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane"
EVIDENCE="$WORKTREE/角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-A1-evidence"
LOG="$EVIDENCE/05-npm-run-typecheck.log"
cd "$WORKTREE" || exit 99
{
  echo "cwd: $(pwd)"
  echo "command: npm run typecheck"
  echo "node: $(node --version)"
  echo "npm: $(npm --version)"
  echo "start: $(date -Iseconds)"
} > "$LOG"
npm run typecheck >> "$LOG" 2>&1
CODE=$?
{
  echo "exit_code: $CODE"
  echo "end: $(date -Iseconds)"
} >> "$LOG"
exit "$CODE"
