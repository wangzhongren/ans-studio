#!/usr/bin/env bash
# D1: W-J4 exact four-file combined command (single process), for 61/35/26 reference comparability.
set -u
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel) || exit 9
cd "$root" || exit 9
out="$1"
mkdir -p "$out"
start=$(date +%s)
timeout -k 5 600 node --test --test-concurrency=1 --test-reporter=tap \
  test/桌面应用/decision-service.test.ts \
  test/桌面应用/chain-enforcement.test.ts \
  test/桌面应用/run-pin.test.ts \
  test/桌面应用/run-change-trigger.test.ts > "$out/desktop-four-combined.tap" 2>&1
code=$?
end=$(date +%s)
echo "exit=$code duration_s=$((end-start))" > "$out/desktop-four-combined.exit.txt"
exit "$code"
