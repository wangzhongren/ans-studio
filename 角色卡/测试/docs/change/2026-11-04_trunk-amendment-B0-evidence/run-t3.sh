#!/bin/bash
# B0 T3 runner for trunk-amendment baseline.
# Equivalent file set to: all test/**/*.test.ts excluding the known-hang
# test/pi-adapter/write-sequencing.test.ts.
# Mechanism (same as download-requests B0 v1-v3): 10 directory glob patterns
# passed literally to Node's test runner + 39 explicit pi-adapter files
# (worktree sandbox rejects $(find ...)/xargs/overlong command lines).
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../../../../.." && pwd)"
OUT="${T3_OUT:-$DIR/24-t3-full-regression.log}"
cd "$ROOT" || exit 2

{
  echo "== cwd =="
  pwd
  echo "== start =="
  date '+%Y-%m-%d %H:%M:%S %z'
  echo "== args =="
} > "$OUT"

args=(
  "test/claude-adapter/*.test.ts"
  "test/codex-adapter/*.test.ts"
  "test/runtime-core/**/*.test.ts"
  "test/桌面UI/**/*.test.ts"
  "test/桌面应用/**/*.test.ts"
  "test/测试/**/*.test.ts"
  "test/编排/**/*.test.ts"
  "test/装配/**/*.test.ts"
  "test/门禁引擎/**/*.test.ts"
  "test/项目管理/shared/**/*.test.ts"
)
while IFS= read -r f; do
  [ -n "$f" ] && args+=("test/pi-adapter/$f")
done < "$DIR/pi-adapter-explicit-files.txt"

for a in "${args[@]}"; do
  printf '%s\n' "$a" >> "$OUT"
done

node --test --test-concurrency=1 "${args[@]}" >> "$OUT" 2>&1
code=$?
{
  echo "== end =="
  date '+%Y-%m-%d %H:%M:%S %z'
  echo "exit=$code"
} >> "$OUT"
exit $code
