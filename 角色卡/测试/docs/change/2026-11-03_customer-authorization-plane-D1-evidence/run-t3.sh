#!/usr/bin/env bash
# D1 T3 full regression runner.
# Runs the exact dispatched command without relying on the interactive shell's
# command-substitution guard:
#   node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' | sort)
set -u
log="$1"
list="$2"
{
  echo "cwd: $(pwd)"
  echo "command: node --test --test-concurrency=1 \$(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' | sort)"
  echo "start: $(date '+%Y-%m-%dT%H:%M:%S%z')"
} > "$log"
find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' | sort > "$list"
files=()
while IFS= read -r line; do files+=("$line"); done < "$list"
echo "file_count: ${#files[@]}" >> "$log"
start=$(date +%s%3N)
node --test --test-concurrency=1 "${files[@]}" >> "$log" 2>&1
code=$?
end=$(date +%s%3N)
{
  echo "end: $(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "duration_ms: $((end - start))"
  echo "exit_code: $code"
} >> "$log"
exit "$code"
