#!/usr/bin/env bash
# D1 per-file runner (external watchdog; no force-exit of the node test body itself).
# Usage: run-files.sh <outdir> <listfile>
set -u
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel) || exit 9
cd "$root" || exit 9
out="$1"
list="$2"
mkdir -p "$out"
: > "$out/summary.tsv"
printf 'file\tstatus\ttests\tpass\tfail\tcancelled\tskipped\ttodo\texit\tduration_s\n' > "$out/summary.tsv"
n=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  n=$((n+1))
  slug=$(printf '%s' "$f" | sed 's#^test/##; s#/#__#g; s#\.test\.ts$##')
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
done < "$list"
echo "DONE $n files" >&2
