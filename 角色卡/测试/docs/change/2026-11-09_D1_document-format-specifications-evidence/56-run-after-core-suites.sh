#!/usr/bin/env bash
# After-candidate core suites (serial). Usage: bash 56-run-after-core-suites.sh <worktreeRoot> <evidenceDir>
set -u
ROOT="$1"
OUT="$2"
cd "$ROOT" || exit 2
summary() { grep -E "^(ℹ (tests|pass|fail|cancelled|skipped|todo) |# (tests|pass|fail|cancelled|skipped|todo) )" "$1" | tr '\n' ' '; echo; }

for spec in "test/编排/workflow-preconditions.test.ts:workflow-preconditions" "test/编排/run-manifest.test.ts:run-manifest" "test/编排/evidence-check.test.ts:evidence-check" "test/门禁引擎/boundary-yaml.test.ts:boundary-yaml" "test/runtime-core/mcp-declarations.test.ts:mcp-declarations" "test/桌面应用/run-pin.test.ts:run-pin" "test/桌面应用/rejection-copy.test.ts:rejection-copy"; do
  f="${spec%%:*}"; n="${spec##*:}"
  node --test --test-concurrency=1 "$f" > "$OUT/after-$n.tap.txt" 2>&1
  echo "SINGLE $n exit=$? | $(summary "$OUT/after-$n.tap.txt")"
done

for spec in "test/编排/doc-format-specs.test.ts:doc-format-specs" "test/runtime-core/doc-format-specs-pin.test.ts:runtime-core-doc-format-pin" "test/门禁引擎/doc-format-specs-pin.test.ts:gate-doc-format-pin" "test/桌面应用/session.test.ts:desktop-session" "test/测试/doc-format-all-roles.test.ts:doc-format-all-roles"; do
  f="${spec%%:*}"; n="${spec##*:}"
  node --test --test-concurrency=1 --test-reporter=tap "$f" > "$OUT/after-$n.tap.txt" 2>&1
  echo "NEW $n exit=$? | $(summary "$OUT/after-$n.tap.txt")"
done

node --test --test-timeout=6000 --test-reporter=tap "test/桌面应用/optional-acceptance.test.ts" > "$OUT/after-optional-acceptance.tap.txt" 2>&1
echo "SPECIAL optional-acceptance exit=$? | $(summary "$OUT/after-optional-acceptance.tap.txt")"

start=$(date +%s)
node --test --test-concurrency=1 "test/桌面应用/chief-workflow.test.ts" > "$OUT/after-chief-workflow.tap.txt" 2>&1
ec=$?; end=$(date +%s)
echo "SPECIAL chief-workflow exit=$ec wall=$((end - start))s | $(summary "$OUT/after-chief-workflow.tap.txt")"

for spec in "test/编排:编排" "test/runtime-core:runtime-core" "test/门禁引擎:门禁引擎"; do
  d="${spec%%:*}"; n="${spec##*:}"
  start=$(date +%s)
  node --test --test-concurrency=1 "$d/**/*.test.ts" > "$OUT/after-dir-$n.tap.txt" 2>&1
  ec=$?; end=$(date +%s)
  echo "DIR $n exit=$ec wall=$((end - start))s | $(summary "$OUT/after-dir-$n.tap.txt")"
done
echo "after core suites done"
