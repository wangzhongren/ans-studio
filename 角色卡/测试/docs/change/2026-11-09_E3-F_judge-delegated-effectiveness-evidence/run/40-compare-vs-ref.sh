#!/usr/bin/env bash
# E3-F (2026-11-09 judge-delegated-effectiveness) comparison:
# per-file T3 run vs reference E3-F (2026-11-08 E3-F remove-predictive-gates,
# 540 files, 5,032/4,807/192/1/32). Same parse/multiset口径 as reference scripts.
set -u
REPO="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment"
EV="$REPO/角色卡/测试/docs/change/2026-11-09_E3-F_judge-delegated-effectiveness-evidence"
REF="$REPO/角色卡/测试/docs/change/2026-11-08_E3-F_evidence"
REFC="$REF/40-comparison"
RESULTS="$EV/31-t3-per-file-results.tsv"
OUT="$EV/compare"
mkdir -p "$OUT"
: > "$OUT/ours-failures-all.tsv"
: > "$OUT/ours-failures-trusted.tsv"
: > "$OUT/ours-skips-all.txt"
: > "$OUT/ours-skips-trusted.txt"
: > "$OUT/ours-skipnames-with-file.tsv"
: > "$OUT/per-file-validation.tsv"
: > "$OUT/counted-files.tsv"
: > "$OUT/anomalies.txt"
: > "$OUT/hang-and-timeout.txt"

REG_HANGS="test/pi-adapter/write-sequencing.test.ts test/测试/customer-authorization-plane-integration.test.ts test/桌面应用/directive-decision.test.ts test/桌面应用/optional-acceptance.test.ts test/桌面应用/session-rebuild-race.test.ts test/桌面应用/stuck-redispatch.test.ts"

while IFS=$'\t' read -r file to force exitcode killed summary tests pass fail cancelled skipped todo dur wall; do
  [ -z "${file:-}" ] && continue
  [ "$file" = "file" ] && continue
  [ "${file%% *}" = "DONE" ] && continue
  case "$file" in TIMEOUT_POSTCHECK*) continue ;; esac
  registered=0; for h in $REG_HANGS; do [ "$file" = "$h" ] && registered=1; done
  status=""
  if [ "$killed" = "1" ]; then
    if [ "$registered" = "1" ]; then status="registered-hang-timeout"; else status="watchdog-killed"; fi
    printf '%s\t%s\texit=%s\tdur=%s\twatchdog=%ss\n' "$status" "$file" "$exitcode" "$dur" "$to" >> "$OUT/hang-and-timeout.txt"
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t-\t-\t-\n' "$file" "$status" "$tests" "$pass" "$fail" "$cancelled" "$skipped" "$todo" >> "$OUT/per-file-validation.tsv"
    continue
  fi
  if [ "$summary" != "1" ]; then
    status="natural-exit-no-summary"
    printf '%s\t%s\texit=%s\n' "$status" "$file" "$exitcode" >> "$OUT/anomalies.txt"
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t-\t-\t-\n' "$file" "$status" "$tests" "$pass" "$fail" "$cancelled" "$skipped" "$todo" >> "$OUT/per-file-validation.tsv"
    continue
  fi
  status="natural-exit"
  log="$EV/logs/$(printf '%s' "$file" | sed 's#/#__#g').log"
  if [ ! -f "$log" ]; then printf 'MISSING_LOG\t%s\n' "$file" >> "$OUT/anomalies.txt"; continue; fi
  pairs_tmp="$OUT/.pairs-$$.tmp"
  awk '
    /^✖ failing tests:/ { start=NR }
    { line[NR]=$0 }
    END {
      if (start=="") exit 0
      for (i=start; i<=NR; i++) {
        l=line[i]
        if (l ~ /^test at /) { loc=l; sub(/^test at /,"",loc); sub(/:[0-9]+:[0-9]+$/,"",loc); gsub(/\\/,"/",loc); pending=loc; continue }
        if (pending!="" && l ~ /^[[:space:]]*✖ /) { name=l; sub(/^[[:space:]]*✖ /,"",name); sub(/ \([0-9.]+ms\)$/,"",name); print pending "\t" name; pending="" }
      }
    }
  ' "$log" > "$pairs_tmp"
  parsed_f=$(wc -l < "$pairs_tmp" | tr -d ' ')
  cat "$pairs_tmp" >> "$OUT/ours-failures-all.tsv"
  grep -E '^﹣ .*# SKIP$' "$log" | sed -E 's/^﹣ //; s/ \([0-9.]+ms\) # SKIP$//' >> "$OUT/ours-skips-all.txt"
  grep -E '^﹣ .*# SKIP$' "$log" | sed -E 's/^﹣ //; s/ \([0-9.]+ms\) # SKIP$//' | while IFS= read -r sname; do printf '%s\t%s\n' "$file" "$sname"; done >> "$OUT/ours-skipnames-with-file.tsv"
  trust="no"
  if [ "$parsed_f" = "$fail" ] || { [ "$file" = "test/桌面应用/chief-workflow.test.ts" ] && [ "$parsed_f" -le "$fail" ]; } || { [ "$fail" = "0" ] && [ "$cancelled" -gt 0 ] && [ "$parsed_f" = "$cancelled" ]; }; then
    trust="yes"
    cat "$pairs_tmp" >> "$OUT/ours-failures-trusted.tsv"
    grep -E '^﹣ .*# SKIP$' "$log" | sed -E 's/^﹣ //; s/ \([0-9.]+ms\) # SKIP$//' >> "$OUT/ours-skips-trusted.txt"
  fi
  rm -f "$pairs_tmp"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$file" "$status" "$tests" "$pass" "$fail" "$cancelled" "$skipped" "$todo" "$parsed_f" "$trust" "$dur" >> "$OUT/per-file-validation.tsv"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$file" "$status" "$tests" "$pass" "$fail" "$cancelled" "$skipped" "$todo" "$dur" >> "$OUT/counted-files.tsv"
done < "$RESULTS"

# ours sorted sets
LC_ALL=C sort "$OUT/ours-failures-trusted.tsv" > "$OUT/ours-failures-trusted.sorted.tsv"
LC_ALL=C sort "$OUT/ours-skips-trusted.txt" | grep -v '^$' > "$OUT/ours-skips-trusted.sorted.txt"

# reference sets = E3-F (2026-11-08) trusted sets
cp "$REFC/ours-failures-trusted.sorted.tsv" "$OUT/ref-failures.sorted.tsv"
cp "$REFC/ours-skips-trusted.sorted.txt" "$OUT/ref-skips.sorted.txt"
cp "$REFC/counted-files.tsv" "$OUT/ref-counted-files-e3f.tsv"

diff_multiset() { # $1=ref $2=ours $3=new-out $4=missing-out
  : > "$3"; : > "$4"
  awk -F'\t' '
    FNR==NR { b[$0]++; next }
    { o[$0]++ }
    END {
      for (k in o) if (o[k] > b[k]+0) print "NEW\t" (o[k]-b[k]) "\t" k
      for (k in b) if (b[k] > o[k]+0) print "MISSING\t" (b[k]-o[k]) "\t" k
    }' "$1" "$2" | LC_ALL=C sort > "$OUT/all-diffs.tsv"
  awk -F'\t' '$1=="NEW"' "$OUT/all-diffs.tsv" > "$3"
  awk -F'\t' '$1=="MISSING"' "$OUT/all-diffs.tsv" > "$4"
}
diff_multiset "$OUT/ref-failures.sorted.tsv" "$OUT/ours-failures-trusted.sorted.tsv" "$OUT/new-failures.tsv" "$OUT/missing-failures.tsv"
diff_multiset "$OUT/ref-skips.sorted.txt" "$OUT/ours-skips-trusted.sorted.txt" "$OUT/new-skips.txt" "$OUT/missing-skips.txt"

# file origin: reference 540 vs current 547 (5 baseline-added after E3-F HEAD; 2 change-new)
cp "$REF/20-all-test-files.txt" "$OUT/ref-files-e3f.txt"
awk -F'\t' 'NR==FNR{b[$0]=1; next} {print $0"\t"($0 in b?"existing":"new-after-ref")}' "$OUT/ref-files-e3f.txt" "$EV/20-all-test-files.txt" > "$OUT/file-origin.tsv"
CHANGE_NEW="test/测试/2026-11-09_judge-delegated-doc-freeze.test.ts test/测试/2026-11-09_judge-delegated-effectiveness.test.ts"
awk -F'\t' -v cn="$CHANGE_NEW" 'BEGIN{n=split(cn,a," "); for(i=1;i<=n;i++) c[a[i]]=1} {origin=($2=="new-after-ref" && ($1 in c))?"change-new":(($2=="new-after-ref")?"baseline-added":"existing"); print $1"\t"origin}' "$OUT/file-origin.tsv" > "$OUT/file-origin-classified.tsv"

awk -F'\t' '
  NR==FNR{origin[$1]=$2; next}
  { o=origin[$1]; if(o=="")o="unknown";
    files[o]++; tests[o]+=$3; pass[o]+=$4; fail[o]+=$5; canc[o]+=$6; skip[o]+=$7; todo[o]+=$8;
    allfiles++; alltests+=$3; allpass+=$4; allfail+=$5; allcanc+=$6; allskip+=$7; alltodo+=$8;
  }
  END {
    printf "origin\tfiles\ttests\tpass\tfail\tcancelled\tskipped\ttodo\n";
    for (o in files) printf "%s\t%d\t%d\t%d\t%d\t%d\t%d\t%d\n",o,files[o],tests[o],pass[o],fail[o],canc[o],skip[o],todo[o];
    printf "TOTAL\t%d\t%d\t%d\t%d\t%d\t%d\t%d\n",allfiles,alltests,allpass,allfail,allcanc,allskip,alltodo;
  }' "$OUT/file-origin-classified.tsv" "$OUT/counted-files.tsv" | LC_ALL=C sort > "$OUT/aggregate-by-origin.tsv"

awk -F'\t' '{st[$2]++} END {for (k in st) printf "%s\t%d\n",k,st[k]}' "$OUT/per-file-validation.tsv" | LC_ALL=C sort > "$OUT/status-counts.tsv"

awk -F'\t' '$10!="yes" && $2=="natural-exit" {print}' "$OUT/per-file-validation.tsv" > "$OUT/parse-not-ok-files.tsv"

awk -F'\t' '
  {dir=$1; sub(/\/[^\/]*$/,"",dir); f[dir]++; t[dir]+=$3; p[dir]+=$4; fa[dir]+=$5; c[dir]+=$6; sk[dir]+=$7; td[dir]+=$8}
  END {printf "dir\tfiles\ttests\tpass\tfail\tcancelled\tskipped\ttodo\n"; for (d in f) printf "%s\t%d\t%d\t%d\t%d\t%d\t%d\t%d\n",d,f[d],t[d],p[d],fa[d],c[d],sk[d],td[d]}' "$OUT/counted-files.tsv" | LC_ALL=C sort > "$OUT/aggregate-by-dir.tsv"

awk -F'\t' '($5+0)>0 || ($6+0)>0' "$OUT/per-file-validation.tsv" > "$OUT/files-with-fail-or-cancel.tsv"

# new-file results (change-new / baseline-added)
awk -F'\t' 'NR==FNR{origin[$1]=$2; next} ($1 in origin){print $1"\t"origin[$1]"\t"$2"\t"$3"\t"$4"\t"$5"\t"$6"\t"$7"\t"$8}' "$OUT/file-origin-classified.tsv" "$OUT/per-file-validation.tsv" | awk -F'\t' '$2!="existing"' > "$OUT/new-files-results.tsv"
awk -F'\t' '($5+0)!=0 || ($6+0)!=0 || ($7+0)!=0 || ($8+0)!=0' "$OUT/new-files-results.tsv" > "$OUT/new-files-nonpass.tsv"

# per-file count deltas vs E3-F counted files (same path only)
awk -F'\t' 'NR==FNR{ref[$1]=$0; next} ($1 in ref){split(ref[$1],r,"\t"); if (r[3]!=$3||r[4]!=$4||r[5]!=$5||r[6]!=$6||r[7]!=$7||r[8]!=$8) print}' \
  "$OUT/ref-counted-files-e3f.tsv" "$OUT/counted-files.tsv" > "$OUT/count-deltas-vs-ref.tsv"

printf 'files=%s trusted_fail_pairs=%s trusted_skips=%s new_failures=%s missing_failures=%s new_skips=%s missing_skips=%s\n' \
  "$(wc -l < "$OUT/counted-files.tsv" | tr -d ' ')" "$(wc -l < "$OUT/ours-failures-trusted.sorted.tsv" | tr -d ' ')" "$(wc -l < "$OUT/ours-skips-trusted.sorted.txt" | tr -d ' ')" \
  "$(wc -l < "$OUT/new-failures.tsv" | tr -d ' ')" "$(wc -l < "$OUT/missing-failures.tsv" | tr -d ' ')" "$(wc -l < "$OUT/new-skips.txt" | tr -d ' ')" "$(wc -l < "$OUT/missing-skips.txt" | tr -d ' ')" > "$OUT/summary.txt"
cat "$OUT/summary.txt"
