#!/usr/bin/env bash
# D1 v1.1 incremental reruns after the 编排 fix (2026-11-10). Serial.
set -u
ROOT="$1"
OUT="$2"
cd "$ROOT" || exit 2
summ() { grep -E "^(ℹ (tests|pass|fail|cancelled|skipped|todo) |# (tests|pass|fail|cancelled|skipped|todo) )" "$1" | tr '\n' ' '; echo; }

node --test --test-concurrency=1 --test-reporter=tap "test/编排/doc-format-specs.test.ts" > "$OUT/v11-doc-format-specs.tap.txt" 2>&1
echo "doc-format-specs exit=$? | $(summ "$OUT/v11-doc-format-specs.tap.txt")"

node --test --test-concurrency=1 "test/测试/governance-matrix-integration.test.ts" > "$OUT/v11-governance-matrix.tap.txt" 2>&1
echo "governance-matrix exit=$? | $(summ "$OUT/v11-governance-matrix.tap.txt")"

node --test --test-concurrency=1 --test-reporter=tap "test/runtime-core/doc-format-specs-pin.test.ts" > "$OUT/v11-runtime-core-pin.tap.txt" 2>&1
echo "runtime-core-pin exit=$? | $(summ "$OUT/v11-runtime-core-pin.tap.txt")"

node --test --test-concurrency=1 --test-reporter=tap "test/门禁引擎/doc-format-specs-pin.test.ts" > "$OUT/v11-gate-pin.tap.txt" 2>&1
echo "gate-pin exit=$? | $(summ "$OUT/v11-gate-pin.tap.txt")"

node --test --test-concurrency=1 --test-reporter=tap "test/桌面应用/session.test.ts" > "$OUT/v11-desktop-session.tap.txt" 2>&1
echo "desktop-session exit=$? | $(summ "$OUT/v11-desktop-session.tap.txt")"

node --test --test-concurrency=1 --test-reporter=tap "test/测试/doc-format-all-roles.test.ts" > "$OUT/v11-all-roles.tap.txt" 2>&1
echo "all-roles exit=$? | $(summ "$OUT/v11-all-roles.tap.txt")"

node --test --test-concurrency=1 "test/桌面应用/rejection-copy.test.ts" > "$OUT/v11-rejection-copy.tap.txt" 2>&1
echo "rejection-copy exit=$? | $(summ "$OUT/v11-rejection-copy.tap.txt")"

node --test --test-concurrency=1 "test/桌面应用/run-pin.test.ts" > "$OUT/v11-run-pin.tap.txt" 2>&1
echo "run-pin exit=$? | $(summ "$OUT/v11-run-pin.tap.txt")"

node --test --test-timeout=6000 --test-reporter=tap "test/桌面应用/optional-acceptance.test.ts" > "$OUT/v11-optional-acceptance.tap.txt" 2>&1
echo "optional-acceptance exit=$? | $(summ "$OUT/v11-optional-acceptance.tap.txt")"

for spec in "test/编排:编排" "test/runtime-core:runtime-core" "test/门禁引擎:门禁引擎"; do
  d="${spec%%:*}"; n="${spec##*:}"
  start=$(date +%s)
  node --test --test-concurrency=1 "$d/**/*.test.ts" > "$OUT/v11-dir-$n.tap.txt" 2>&1
  ec=$?; end=$(date +%s)
  echo "DIR $n exit=$ec wall=$((end - start))s | $(summ "$OUT/v11-dir-$n.tap.txt")"
done

start=$(date +%s)
npm run typecheck > "$OUT/v11-typecheck.txt" 2>&1
echo "typecheck exit=$? wall=$(( $(date +%s) - start ))s"
echo "v1.1 suites done"
