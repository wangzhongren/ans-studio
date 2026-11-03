#!/usr/bin/env bash
# D2-fix evidence helper: re-run the test-only real-Electron directive-plane probe
# on the current candidate (C2 revoke-receipt fix). Probe file is NOT modified.
# Usage: run-d2-probe-fix.sh <out-dir-name> <log-path> [extra env assignments...]
set -u
cd "$(dirname "$0")/../../../../.." || exit 1
ROOT="$(pwd)"
OUT="$ROOT/角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence"
PROBE_OUT="$OUT/${1:-probe-run-3}"
LOG="$OUT/${2:-11-d2-probe-fix.log}"
unset ANS_E2E_PROJECT ANS_RENDERER_ENTRY DEBUG ANS_DEBUG ELECTRON_ENABLE_LOGGING 2>/dev/null || true
start=$(date -Iseconds)
start_epoch=$(date +%s)
{
  echo "command: ANS_D2_PROBE_OUT=$PROBE_OUT ./node_modules/.bin/electron test/测试/customer-authorization-plane-d2-probe.mjs"
  echo "cwd: $ROOT"
  echo "start: $start"
  echo "head: $(git rev-parse HEAD)"
  echo "probe_sha256: $(sha256sum test/测试/customer-authorization-plane-d2-probe.mjs | cut -d' ' -f1)"
  echo "preload_sha256: $(sha256sum app/preload.cjs | cut -d' ' -f1)"
  echo "renderer_entry_sha256: $(sha256sum app/renderer/dist/index.html | cut -d' ' -f1)"
  echo "userData: $PROBE_OUT/userData (fresh; probe sets app.setPath('userData', OUT/userData))"
  echo "debug_env: DEBUG=${DEBUG:-<unset>} ANS_DEBUG=${ANS_DEBUG:-<unset>} ELECTRON_ENABLE_LOGGING=${ELECTRON_ENABLE_LOGGING:-<unset>}"
  echo "---"
} > "$LOG"
ANS_D2_HEAD="$(git rev-parse HEAD)" ANS_D2_PROBE_OUT="$PROBE_OUT" ./node_modules/.bin/electron "test/测试/customer-authorization-plane-d2-probe.mjs" >> "$LOG" 2>&1
code=$?
end=$(date -Iseconds)
end_epoch=$(date +%s)
{
  echo "---"
  echo "end: $end"
  echo "elapsed_seconds: $((end_epoch - start_epoch))"
  echo "exit_code: $code"
} >> "$LOG"
echo "D2_PROBE_EXIT=$code elapsed=$((end_epoch - start_epoch))s log=$LOG"
grep -E "D2_PROBE_DONE|CHECK S5_|CHECK S1_RECEIPT|CHECK S2_RECEIPT|CHECK S3_RECEIPT|CHECK S4B_REVOKE|CHECK S7_RECEIPT" "$LOG" | tail -20
exit "$code"
