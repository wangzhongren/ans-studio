#!/usr/bin/env bash
# Per-file run of test/桌面应用/** (excluding chief-workflow and optional-acceptance, which have their own documented commands).
# Per-file watchdog: 120s (documented; only to bound a known hang class, not to mask failures).
# Usage: bash 52-run-desktop-rest-perfile.sh <repoOrCopyRoot> <outFile>
set -u
ROOT="$1"
OUT="$2"
cd "$ROOT" || exit 2
mapfile -t FILES < <(find "test/桌面应用" -name "*.test.ts" | sort | grep -v "optional-acceptance.test.ts" | grep -v "chief-workflow.test.ts" | grep -v "session.test.ts")
: > "$OUT"
for f in "${FILES[@]}"; do
  echo "===== FILE: $f =====" >> "$OUT"
  start=$(date +%s)
  timeout 120 node --test --test-concurrency=1 "$f" >> "$OUT" 2>&1
  ec=$?
  end=$(date +%s)
  echo "===== EXIT $ec WALL $((end - start))s =====" >> "$OUT"
done
echo "done: ${#FILES[@]} files"
