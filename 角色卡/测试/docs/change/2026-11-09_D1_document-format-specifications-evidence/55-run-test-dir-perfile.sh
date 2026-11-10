#!/usr/bin/env bash
# Per-file run of test/测试/** with a 300s per-file watchdog (prior D1 precedent: 300s watchdog for this dir,
# which hosts the known-slow git-role-workflows-e2e and registered hang files such as
# customer-authorization-plane-integration.test.ts).
# Usage: bash 55-run-test-dir-perfile.sh <repoOrCopyRoot> <outFile>
set -u
ROOT="$1"
OUT="$2"
cd "$ROOT" || exit 2
# customer-authorization-plane-integration.test.ts is a registered hang file (prior B0 §6.2: 90s watchdog)
# and is run separately with the documented 90s watchdog; the rest of the directory uses a 300s per-file watchdog
# (prior D1 precedent for the known-slow git-role-workflows-e2e tests).
mapfile -t FILES < <(find "test/测试" -name "*.test.ts" | sort | grep -v "customer-authorization-plane-integration.test.ts")
: > "$OUT"
for f in "${FILES[@]}"; do
  echo "===== FILE: $f =====" >> "$OUT"
  start=$(date +%s)
  timeout 300 node --test --test-concurrency=1 "$f" >> "$OUT" 2>&1
  ec=$?
  end=$(date +%s)
  echo "===== EXIT $ec WALL $((end - start))s =====" >> "$OUT"
done
echo "done: ${#FILES[@]} files"
