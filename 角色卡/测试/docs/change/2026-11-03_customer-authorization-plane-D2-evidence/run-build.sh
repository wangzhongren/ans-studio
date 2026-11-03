#!/usr/bin/env bash
# D2 evidence helper: renderer build gate (test role; not a product/test candidate).
set -u
cd "$(dirname "$0")/../../../../.." || exit 1
OUT="角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence"
LOG="$OUT/04-build-renderer.log"
start=$(date -Iseconds)
echo "command: npm run build:renderer" > "$LOG"
echo "cwd: $(pwd)" >> "$LOG"
echo "start: $start" >> "$LOG"
npm run build:renderer >> "$LOG" 2>&1
code=$?
end=$(date -Iseconds)
{
  echo "end: $end"
  echo "exit_code: $code"
} >> "$LOG"
echo "BUILD_EXIT=$code start=$start end=$end"
tail -12 "$LOG"
exit "$code"
