#!/usr/bin/env bash
# Isolated same-candidate rerun for one test file (same command as authoritative run).
# Usage: bash run-isolated.sh <file> <outdir> [timeout_s]
set -u
REPO="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment"
f="$1"; out="${2:?usage: run-isolated.sh <file> <outdir> [timeout_s]}"; TO="${3:-300}"
mkdir -p "$out"
cd "$REPO" || exit 2
safe=$(printf '%s' "$f" | sed 's#/#__#g')
start=$(date +%s%3N)
timeout -k 5 "$TO" node --test --test-concurrency=1 "$f" > "$out/$safe.log" 2>&1
ec=$?
end=$(date +%s%3N)
wall=$((end-start))
killed=0; [ "$ec" = "124" ] && killed=1
tests=$(grep -E '^ℹ tests ' "$out/$safe.log" | tail -1 | awk '{print $3}')
pass=$(grep -E '^ℹ pass ' "$out/$safe.log" | tail -1 | awk '{print $3}')
fail=$(grep -E '^ℹ fail ' "$out/$safe.log" | tail -1 | awk '{print $3}')
cancelled=$(grep -E '^ℹ cancelled ' "$out/$safe.log" | tail -1 | awk '{print $3}')
skipped=$(grep -E '^ℹ skipped ' "$out/$safe.log" | tail -1 | awk '{print $3}')
todo=$(grep -E '^ℹ todo ' "$out/$safe.log" | tail -1 | awk '{print $3}')
printf 'file\t%s\ntimeout_s\t%s\texit\t%s\tkilled\t%s\ntests\t%s\tpass\t%s\tfail\t%s\tcancelled\t%s\tskipped\t%s\ttodo\t%s\nwall_ms\t%s\n' \
  "$f" "$TO" "$ec" "$killed" "${tests:--1}" "${pass:--1}" "${fail:--1}" "${cancelled:--1}" "${skipped:--1}" "${todo:--1}" "$wall" > "$out/summary.txt"
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$f" "$TO" "$ec" "$killed" "${tests:--1}" "${pass:--1}" "${fail:--1}" "${cancelled:--1}" "${skipped:--1}" > "$out/summary.tsv"
cat "$out/summary.txt"
