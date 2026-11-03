#!/usr/bin/env bash
# D1 evidence runner for npm scripts: records start/end/exit and appends output.
# Usage: run-npm.sh <log-path> <script-name>
set -u
log="$1"
script="$2"
{
  echo "cwd: $(pwd)"
  echo "command: npm run $script"
  echo "node: $(node -v)"
  echo "npm: $(npm -v)"
  echo "start: $(date '+%Y-%m-%dT%H:%M:%S%z')"
} > "$log"
start=$(date +%s%3N)
npm run "$script" >> "$log" 2>&1
code=$?
end=$(date +%s%3N)
{
  echo "end: $(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "duration_ms: $((end - start))"
  echo "exit_code: $code"
} >> "$log"
exit "$code"
