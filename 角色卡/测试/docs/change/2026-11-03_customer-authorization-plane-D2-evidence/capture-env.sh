#!/usr/bin/env bash
# D2 evidence helper (test role; not a product/test candidate).
set -u
cd "$(dirname "$0")/../../../../.." || exit 1
OUT="角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence"
{
  echo "D2 real-run environment (captured $(date -Iseconds))"
  echo "timezone: $(date +%Z%z)"
  echo "cwd: $(pwd)"
  echo "node: $(node -v)"
  echo "npm: $(npm -v)"
  echo "electron: $(./node_modules/.bin/electron --version 2>&1)"
  echo "git: $(git --version)"
  echo "bash: $BASH_VERSION"
  echo "uname: $(uname -a)"
  echo "os: $(cmd //c ver 2>&1 | tr -d '\r')"
  echo "branch: $(git branch --show-current)"
  echo "head: $(git rev-parse HEAD)"
  echo "electron_binary: $(ls -l node_modules/electron/dist/electron.exe 2>&1)"
  echo "renderer_dist: $(ls -l app/renderer/dist/index.html 2>&1)"
} > "$OUT/00-environment.txt"
cat "$OUT/00-environment.txt"

{
  echo "=== tasklist electron.exe ($(date -Iseconds))"
  tasklist //FI "IMAGENAME eq electron.exe" 2>&1
  echo
  echo "=== PID 35700 (dispatch-mentioned residue)"
  tasklist //FI "PID eq 35700" 2>&1
  echo
  echo "note: B0 baseline recorded PIDs 11492/34404/41000 as network-monitor worktree processes (unrelated to this worktree); PID 35700 was terminated by dispatch before D2. D2 uses a fresh userData directory under this evidence dir."
} > "$OUT/02-residual-processes.txt"
cat "$OUT/02-residual-processes.txt"
