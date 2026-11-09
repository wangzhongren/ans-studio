#!/usr/bin/env bash
# E3-F (2026-11-09 judge) suite-level comparison vs D1 (same candidate) baselines.
set -u
REPO="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment"
EV="$REPO/角色卡/测试/docs/change/2026-11-09_E3-F_judge-delegated-effectiveness-evidence"
D1="$REPO/角色卡/测试/docs/change/2026-11-09_D1_judge-delegated-effectiveness-evidence"
OUT="$EV/compare"
mkdir -p "$OUT/suites-vs-d1"

# my trusted failures with file; D1 titles are name-only per suite dir.
# runtime-core
awk -F'\t' '$1 ~ /^test\/runtime-core\//' "$OUT/ours-failures-trusted.sorted.tsv" | cut -f2 | LC_ALL=C sort -u > "$OUT/suites-vs-d1/runtime-core-fails-ours.txt"
LC_ALL=C sort -u "$D1/suites/runtime-core/titles.fails.txt" > "$OUT/suites-vs-d1/runtime-core-fails-d1.txt"
diff "$OUT/suites-vs-d1/runtime-core-fails-d1.txt" "$OUT/suites-vs-d1/runtime-core-fails-ours.txt" > "$OUT/suites-vs-d1/runtime-core-fails.diff"; echo "runtime-core fails diff lines: $(wc -l < "$OUT/suites-vs-d1/runtime-core-fails.diff")"
awk -F'\t' '$1 ~ /^test\/runtime-core\//' "$OUT/ours-skipnames-with-file.tsv" 2>/dev/null | cut -f2 | LC_ALL=C sort -u > "$OUT/suites-vs-d1/runtime-core-skips-ours.txt" || true

# orchestration (编排)
awk -F'\t' '$1 ~ /^test\/编排\//' "$OUT/ours-failures-trusted.sorted.tsv" | cut -f2 | LC_ALL=C sort -u > "$OUT/suites-vs-d1/orchestration-fails-ours.txt"
LC_ALL=C sort -u "$D1/suites/orchestration/titles.fails.txt" > "$OUT/suites-vs-d1/orchestration-fails-d1.txt"
diff "$OUT/suites-vs-d1/orchestration-fails-d1.txt" "$OUT/suites-vs-d1/orchestration-fails-ours.txt" > "$OUT/suites-vs-d1/orchestration-fails.diff"; echo "orchestration fails diff lines: $(wc -l < "$OUT/suites-vs-d1/orchestration-fails.diff")"

# gates (门禁引擎)
awk -F'\t' '$1 ~ /^test\/门禁引擎\//' "$OUT/ours-failures-trusted.sorted.tsv" | cut -f2 | LC_ALL=C sort -u > "$OUT/suites-vs-d1/gates-fails-ours.txt"
LC_ALL=C sort -u "$D1/suites/gates/titles.fails.txt" > "$OUT/suites-vs-d1/gates-fails-d1.txt"
diff "$OUT/suites-vs-d1/gates-fails-d1.txt" "$OUT/suites-vs-d1/gates-fails-ours.txt" > "$OUT/suites-vs-d1/gates-fails.diff"; echo "gates fails diff lines: $(wc -l < "$OUT/suites-vs-d1/gates-fails.diff")"

# desktop four
DESK4="test/桌面应用/decision-service.test.ts test/桌面应用/chain-enforcement.test.ts test/桌面应用/run-pin.test.ts test/桌面应用/run-change-trigger.test.ts"
awk -F'\t' -v d="$DESK4" 'BEGIN{n=split(d,a," "); for(i=1;i<=n;i++) k[a[i]]=1} ($1 in k)' "$OUT/ours-failures-trusted.sorted.tsv" | cut -f2 | LC_ALL=C sort -u > "$OUT/suites-vs-d1/desktop-fails-ours.txt"
LC_ALL=C sort -u "$D1/suites/desktop/titles.fails.txt" > "$OUT/suites-vs-d1/desktop-fails-d1.txt"
diff "$OUT/suites-vs-d1/desktop-fails-d1.txt" "$OUT/suites-vs-d1/desktop-fails-ours.txt" > "$OUT/suites-vs-d1/desktop-fails.diff"; echo "desktop fails diff lines: $(wc -l < "$OUT/suites-vs-d1/desktop-fails.diff")"

# per-suite count comparison (natural-exit files only)
count_suite() { # $1 regex over file path
  awk -F'\t' -v re="$1" '$1 ~ re {n++; t+=$3; p+=$4; f+=$5; c+=$6; s+=$7; td+=$8} END{printf "files=%d tests=%d pass=%d fail=%d cancelled=%d skipped=%d todo=%d\n",n,t,p,f,c,s,td}' "$OUT/counted-files.tsv"
}
{
  echo "== runtime-core (myself vs D1 540/503/33/4, 59 files)"; count_suite '^test/runtime-core/'
  echo "== 编排 (myself vs D1 1133/1109/22/2, 107 files)"; count_suite '^test/编排/'
  echo "== 门禁引擎 (myself vs D1 453/447/5/1, 41 files)"; count_suite '^test/门禁引擎/'
  echo "== desktop four (myself vs D1 61/35/26/0, 4 files)"; count_suite '^test/桌面应用/(decision-service|chain-enforcement|run-pin|run-change-trigger)[.]test[.]ts$'
  echo "== nominator (myself vs D1 27/27/0/0, 2 files)"; count_suite '^test/roles/nominator/'
  echo "== test-role 7 files (myself vs D1 raw 9/8/1; normalized 8/8/0)"; count_suite '^test/测试/(2026-11-09_judge-delegated-(doc-freeze|effectiveness)|git-action-(activation|commit-claude|commit-pi|delivery-claude)-e2e|git-run-stop-host-continuation-e2e)[.]test[.]ts$'
} | tee "$OUT/suites-vs-d1/count-comparison.txt"

# note: test-role 7 files include the effectiveness file which may be a registered/in-suite hang; report separately from per-file-validation
