#!/usr/bin/env bash
# After-candidate hang-file specials: customer-authorization-plane-integration with 90s watchdog
# (registered B0 §6.2口径), then bounded (--test-timeout=6000) reruns for the three desktop hang files.
# Usage: bash 57-run-after-hang-specials.sh <worktreeRoot> <evidenceDir>
set -u
ROOT="$1"
OUT="$2"
cd "$ROOT" || exit 2

timeout 90 node --test --test-concurrency=1 "test/测试/customer-authorization-plane-integration.test.ts" > "$OUT/after-customer-auth-plane-integration.tap.txt" 2>&1
echo "customer-auth-plane-integration exit=$? | $(grep -E '^ℹ (tests|pass|fail|cancelled|skipped) ' "$OUT/after-customer-auth-plane-integration.tap.txt" | tr '\n' ' ')"

for f in directive-decision session-rebuild-race stuck-redispatch; do
  node --test --test-timeout=6000 --test-reporter=tap "test/桌面应用/$f.test.ts" > "$OUT/after-bounded-$f.tap.txt" 2>&1
  echo "bounded $f exit=$? | $(grep -E '^# (tests|pass|fail|cancelled|skipped) ' "$OUT/after-bounded-$f.tap.txt" | tr '\n' ' ')"
done
echo "after hang specials done"
