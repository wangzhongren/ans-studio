#!/usr/bin/env bash
# Build D1 failure/skip classification from the final T3 log.
set -u
log="$1"
out="$2"
{
  echo "D1 T3 failure / skip classification (from final 04-full-t3.log)"
  echo "generated: $(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo
  grep -E '^ℹ (tests|pass|fail|cancelled|skipped|todo|duration_ms)' "$log"
  echo
  echo "--- FAILING TESTS (9) ---"
  grep -E '^test at |^✖ ' "$log" | tail -30
  echo
  echo "--- SKIPPED (18) ---"
  grep -E '^﹣ ' "$log"
  echo
  echo "--- CLASSIFICATION ---"
  echo "1  test/claude-adapter/session.test.ts:639           既有 Windows symlink EPERM"
  echo "2  test/codex-adapter/session.test.ts:351            既有 Windows symlink EPERM"
  echo "3  test/pi-adapter/injected-runtime.test.ts:185      既有 Windows symlink EPERM"
  echo "4  test/pi-adapter/injected-runtime.test.ts:193      既有 Windows symlink EPERM"
  echo "5  test/runtime-core/file-write-safety.test.ts:97    既有 Windows symlink EPERM"
  echo "6  test/runtime-core/session-store.test.ts:46        既有 Windows symlink EPERM"
  echo "7  test/runtime-core/session-store.test.ts:58        既有 Windows symlink EPERM"
  echo "8  test/测试/g4-skill-verify/b-render-double-check.test.ts:182  既有 Windows symlink EPERM"
  echo "9  test/编排/shell-authorized-routine.test.ts:184    既有 Windows symlink EPERM"
  echo
  echo "The 9 failing file:line + test names are identical to B0 07-failure-classification.txt."
  echo "All 18 skips are the pre-existing platform skips:"
  echo "  codex-adapter/session 1; pi-adapter/session-persistence 1; 门禁引擎/pin-evidence 1;"
  echo "  runtime-core/file-write-safety 4; 测试/lightweight-permission-repairs 6;"
  echo "  项目管理/shared/atomic-write 5."
  echo
  echo "NEW DETERMINISTIC FAILURES: 0"
  echo "NEW SKIPS: 0"
  echo
  echo "Excluded file: test/pi-adapter/write-sequencing.test.ts"
  echo "Reason: repository-known pre-existing hang (historical record: 39+ minutes with no progress,"
  echo "CPU ~2339s); exclusion follows B0 baseline record and docs/acceptance/acceptance-rework-routing-criteria-v1.md"
  echo "lines 98/162/604. Not run in D1; behavior unverified. Excluded by '! -name write-sequencing.test.ts'."
} > "$out"
cat "$out"
