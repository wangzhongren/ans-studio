#!/usr/bin/env bash
# D2-fix evidence runner (test role; not a product/test candidate).
# Usage: run-d2fix.sh <log-path> <command...>
# Writes command header, millisecond duration and exit code into the log.
set -u
cd "$(dirname "$0")/../../../../.." || exit 1
log="$1"
shift
{
  echo "cwd: $(pwd)"
  echo "command: $*"
  echo "start: $(date '+%Y-%m-%dT%H:%M:%S%z')"
} > "$log"
start=$(date +%s%3N)
"$@" >> "$log" 2>&1
code=$?
end=$(date +%s%3N)
{
  echo "end: $(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "duration_ms: $((end - start))"
  echo "exit_code: $code"
} >> "$log"
echo "EXIT=$code duration_ms=$((end - start)) log=$log"
exit "$code"
