#!/usr/bin/env bash
# Capture D1 environment facts (plain commands, no interactive-shell substitution).
set -u
out="$1"
{
  echo "cwd: $(pwd)"
  echo "date: $(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "timezone: Asia/Shanghai (system local, +08:00)"
  echo "node: $(node -v)"
  echo "npm: $(npm -v)"
  echo "os: $(uname -a)"
  echo "shell: $BASH_VERSION ($BASH)"
  echo "branch: $(git branch --show-current)"
  echo "HEAD: $(git rev-parse HEAD)"
  echo "electron package: $(node -p "require('./node_modules/electron/package.json').version" 2>/dev/null || echo unavailable)"
  echo "electron binary: $(test -f node_modules/electron/dist/electron.exe && echo present || echo absent)"
  echo "dist present: $(test -f app/renderer/dist/index.html && echo yes || echo no)"
  echo "node_modules present: $(test -d node_modules && echo yes || echo no)"
} > "$out"
cat "$out"
