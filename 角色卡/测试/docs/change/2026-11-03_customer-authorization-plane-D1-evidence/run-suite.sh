#!/usr/bin/env bash
# D1 evidence runner: node --test --test-concurrency=1 <args...>
# Usage: run-suite.sh <log-path> <label> <node test args...>
set -u
log="$1"
label="$2"
shift 2
{
  echo "label: $label"
  echo "cwd: $(pwd)"
  echo "command: node --test --test-concurrency=1 $*"
  echo "start: $(date '+%Y-%m-%dT%H:%M:%S%z')"
} > "$log"
start=$(date +%s%3N)
node --test --test-concurrency=1 "$@" >> "$log" 2>&1
code=$?
end=$(date +%s%3N)
{
  echo "end: $(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "duration_ms: $((end - start))"
  echo "exit_code: $code"
} >> "$log"
exit "$code"
