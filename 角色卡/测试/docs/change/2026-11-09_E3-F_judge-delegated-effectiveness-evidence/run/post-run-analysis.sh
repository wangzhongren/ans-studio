#!/usr/bin/env bash
# Post-run analysis for E3-F judge (run after the authoritative T3 completes).
set -u
REPO="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment"
EV="$REPO/角色卡/测试/docs/change/2026-11-09_E3-F_judge-delegated-effectiveness-evidence"
cd "$REPO" || exit 2
echo "=== compare vs reference E3-F ==="
bash "$EV/run/40-compare-vs-ref.sh"
echo "=== suites vs D1 ==="
bash "$EV/run/41-compare-suites-vs-d1.sh"
echo "=== new files cases ==="
bash "$EV/run/42-extract-new-cases.sh"
echo "=== typecheck ==="
npm run typecheck > "$EV/typecheck/typecheck-post.log" 2>&1
echo "typecheck_exit=$?" | tee -a "$EV/typecheck/typecheck-post.log"
echo "=== final recheck ==="
bash "$EV/run/50-final-recheck.sh"
