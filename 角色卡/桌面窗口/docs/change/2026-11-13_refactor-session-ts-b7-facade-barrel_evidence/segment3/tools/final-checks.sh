#!/usr/bin/env bash
# B7 第三段：终检证据收集（只读；行数/哈希/预算/git status/构建产物）。
set -u
WT="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b7"
E="$WT/角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3/final-check"
cd "$WT" || exit 90
mkdir -p "$E"
{
  echo "# generated $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo
  echo "## wc -l barrel / facade"
  wc -l app/desktop/session.ts app/desktop/session/index.ts
  echo
  echo "## session/**/*.ts top 10 by lines (budget <= 1500)"
  find app/desktop/session -name '*.ts' -print0 | xargs -0 wc -l | sort -rn | head -11
  echo
  echo "## sha256 barrel / facade"
  sha256sum app/desktop/session.ts app/desktop/session/index.ts
  echo
  echo "## structure test budgets (source of truth)"
  grep -n "SESSION_TS_FROZEN_BASELINE_LINES =\|SESSION_INDEX_MAX_LINES =\|SESSION_MODULE_MAX_LINES =" test/桌面应用/session-structure.test.ts
  echo
  echo "## git status --porcelain"
  git status --porcelain
  echo
  echo "## release-output (gitignored build output)"
  ls -la release-output/local 2>/dev/null || echo "release-output/local absent"
  echo
  echo "## renderer build output (gitignored)"
  ls -d app/renderer/dist 2>/dev/null || echo "app/renderer/dist absent"
  echo
  echo "## git check-ignore"
  git check-ignore -v release-output/local 2>/dev/null || true
  git check-ignore -v app/renderer/dist 2>/dev/null || true
} > "$E/final-checks.txt" 2>&1
cat "$E/final-checks.txt"
