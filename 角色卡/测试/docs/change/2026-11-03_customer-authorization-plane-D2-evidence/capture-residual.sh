#!/usr/bin/env bash
# D2 evidence helper (test role): residual Electron processes after the D2 probe.
set -u
cd "$(dirname "$0")/../../../../.." || exit 1
OUT="角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence"
{
  echo "=== tasklist electron.exe after D2 probe ($(date -Iseconds))"
  tasklist //FI "IMAGENAME eq electron.exe" 2>&1
  echo
  echo "=== PID 35700"
  tasklist //FI "PID eq 35700" 2>&1
  echo
  echo "note: same three residual PIDs as 02-residual-processes.txt (34404/11492/41000, network-monitor worktree; unrelated to this task). PID 35700 is terminated. The D2 probe process exited with app.exit(1) and left no new Electron process."
} > "$OUT/02b-d2-residual-processes.txt"
cat "$OUT/02b-d2-residual-processes.txt"
