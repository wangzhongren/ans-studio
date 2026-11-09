#!/usr/bin/env bash
# W-J5 amendment: run the W-J5-related files (effectiveness, doc-freeze, buildWriteChain consumers)
# with the same external-watchdog convention as the W-J5 run-suite.sh.
# Usage: run-related.sh <outdir>
set -u
cd "$(dirname "$0")/../../../../../../" || exit 9
out="$1"
mkdir -p "$out"
: > "$out/summary.tsv"
printf 'file\tstatus\ttests\tpass\tfail\tcancelled\tskipped\ttodo\texit\tduration_s\n' >> "$out/summary.tsv"
files=(
  "test/测试/2026-11-09_judge-delegated-effectiveness.test.ts"
  "test/测试/2026-11-09_judge-delegated-doc-freeze.test.ts"
  "test/测试/git-run-stop-host-continuation-e2e.test.ts"
  "test/测试/git-action-delivery-claude-e2e.test.ts"
  "test/测试/git-action-activation-e2e.test.ts"
  "test/测试/git-action-commit-pi-e2e.test.ts"
  "test/测试/git-action-commit-claude-e2e.test.ts"
)
n=0
for f in "${files[@]}"; do
  n=$((n+1))
  slug=$(printf '%s' "$f" | sed 's#^test/测试/##; s#\.test\.ts$##')
  limit=300
  start=$(date +%s)
  timeout -k 5 "$limit" node --test --test-concurrency=1 --test-reporter=tap "$f" > "$out/$slug.tap" 2>&1
  code=$?
  end=$(date +%s)
  if [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; then status="hang(${limit}s)"; else status="natural"; fi
  counts=$(awk '
    /^# tests /{t=$3} /^# pass /{p=$3} /^# fail /{f=$3} /^# cancelled /{c=$3} /^# skipped /{s=$3} /^# todo /{d=$3}
    END { if (t=="") t="-" ; if (p=="") p="-" ; if (f=="") f="-" ; if (c=="") c="-" ; if (s=="") s="-" ; if (d=="") d="-"
          print t"\t"p"\t"f"\t"c"\t"s"\t"d }' "$out/$slug.tap")
  printf '%s\t%s\t%s\t%s\t%d\n' "$f" "$status" "$counts" "$code" "$((end-start))" >> "$out/summary.tsv"
  echo "[$n] $status exit=$code ${end}s-${start}s $f" >&2
done
echo "DONE $n files" >&2
