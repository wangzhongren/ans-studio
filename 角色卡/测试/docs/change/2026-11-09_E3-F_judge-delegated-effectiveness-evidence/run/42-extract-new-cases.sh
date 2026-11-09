#!/usr/bin/env bash
# Extract per-case results for new/baseline-added test files from spec-reporter logs.
# Spec lines: "✔ name (12.3ms)", "✖ name (12.3ms)", "﹣ name (12.3ms) # SKIP".
set -u
REPO="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment"
EV="$REPO/角色卡/测试/docs/change/2026-11-09_E3-F_judge-delegated-effectiveness-evidence"
OUT="$EV/compare/new-files-cases.tsv"
: > "$OUT"
FILES="test/测试/2026-11-09_judge-delegated-effectiveness.test.ts test/测试/2026-11-09_judge-delegated-doc-freeze.test.ts test/测试/git-action-activation-e2e.test.ts test/测试/git-action-commit-claude-e2e.test.ts test/测试/git-action-commit-pi-e2e.test.ts test/测试/git-action-delivery-claude-e2e.test.ts test/测试/git-run-stop-host-continuation-e2e.test.ts"
for f in $FILES; do
  safe=$(printf '%s' "$f" | sed 's#/#__#g')
  log="$EV/logs/$safe.log"
  [ -f "$log" ] || { printf '%s\tMISSING_LOG\t-\n' "$f" >> "$OUT"; continue; }
  grep -E '^(✔|✖|﹣) ' "$log" | grep -v '^✖ failing tests:' | sed -E 's/^✔ /ok\t/; s/^✖ /not_ok\t/; s/^﹣ /skip\t/; s/ \([0-9.]+ms\).*$//' | while IFS=$'\t' read -r st name; do
    printf '%s\t%s\t%s\n' "$f" "$st" "$name" >> "$OUT"
  done
done
echo "cases: $(wc -l < "$OUT")"
awk -F'\t' '{c[$1]++; if($2=="ok")p[$1]++} END{for(f in c) printf "%s\tcases=%d\tok=%d\n",f,c[f],p[f]+0}' "$OUT" | LC_ALL=C sort
