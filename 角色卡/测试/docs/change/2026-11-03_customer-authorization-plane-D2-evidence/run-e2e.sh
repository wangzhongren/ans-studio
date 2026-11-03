#!/usr/bin/env bash
# D2 evidence helper: run the existing Electron E2E untouched (test role).
set -u
cd "$(dirname "$0")/../../../../.." || exit 1
ROOT="$(pwd)"
OUT="$ROOT/角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence"
E2EOUT="$OUT/e2e-out"
LOG="$OUT/05-e2e-run.log"
rm -rf "$E2EOUT"
mkdir -p "$E2EOUT"
unset ANS_E2E_PROJECT ANS_RENDERER_ENTRY DEBUG ANS_DEBUG ELECTRON_ENABLE_LOGGING 2>/dev/null || true
start=$(date -Iseconds)
start_epoch=$(date +%s)
{
  echo "command: ANS_E2E_OUTDIR=$E2EOUT node_modules/.bin/electron test/桌面应用/e2e/main.mjs"
  echo "cwd: $ROOT"
  echo "start: $start"
  echo "head: $(git rev-parse HEAD)"
  echo "e2e_script_sha256: $(sha256sum test/桌面应用/e2e/main.mjs | cut -d' ' -f1)"
  echo "userData: $E2EOUT/userData (fresh; script sets app.setPath('userData', OUTDIR/userData))"
  echo "debug_env: DEBUG=${DEBUG:-<unset>} ANS_DEBUG=${ANS_DEBUG:-<unset>}"
  echo "---"
} > "$LOG"
ANS_E2E_OUTDIR="$E2EOUT" ./node_modules/.bin/electron test/桌面应用/e2e/main.mjs >> "$LOG" 2>&1
code=$?
end=$(date -Iseconds)
end_epoch=$(date +%s)
{
  echo "---"
  echo "end: $end"
  echo "elapsed_seconds: $((end_epoch - start_epoch))"
  echo "exit_code: $code"
} >> "$LOG"
echo "E2E_EXIT=$code elapsed=$((end_epoch - start_epoch))s"
grep -E "E2E_PASS=|E2E_FAILURES=|E2E_DONE=|ELECTRON=|NODE=|PROJECT=|OUTDIR=|SHOT_" "$E2EOUT/report.txt" 2>/dev/null | tail -40
exit "$code"
