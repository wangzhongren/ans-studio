#!/usr/bin/env bash
# B7 第三段：桌面全链定向复跑（各自独立进程、独立日志；口径同全量分段）
set -u
WT="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b7"
E="$WT/角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3/chain"
cd "$WT" || exit 90
mkdir -p "$E"
SUMMARY="$E/chain-summary.txt"
: > "$SUMMARY"
append() { echo "$*" >> "$SUMMARY"; }

run() {
  label="$1"; cap="$2"; out="$3"; shift 3
  start=$(date +%s)
  timeout -k 30 "$cap" node --test --test-concurrency=1 --test-timeout=120000 --test-force-exit "$@" > "$out" 2>&1
  code=$?
  dur=$(( $(date +%s) - start ))
  append "$label exit=$code dur=${dur}s"
}

append "started $(date '+%Y-%m-%d %H:%M:%S')"
run fixed-path-full-chain 600 "$E/fixed-path-full-chain.log" "test/测试/fixed-path-full-chain.test.ts"
run queue-recovery-e2e 600 "$E/queue-recovery-e2e.log" "test/测试/queue-recovery-e2e.test.ts"
run network-state-e2e 600 "$E/network-state-e2e.log" "test/测试/network-state-e2e.test.ts"
run turn-watch-verify 600 "$E/turn-watch-verify.log" \
  "test/测试/turn-watch-verify/a-inspect.test.ts" \
  "test/测试/turn-watch-verify/b-last-resort.test.ts" \
  "test/测试/turn-watch-verify/c-cross-runtime-settings.test.ts"
append "ALLDONE $(date '+%Y-%m-%d %H:%M:%S')"
