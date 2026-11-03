#!/usr/bin/env bash
# Capture D1 static scope evidence (git state, config untouched, dist ignored).
set -u
out="$1"
{
  echo "cwd: $(pwd)"
  echo "date: $(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "HEAD: $(git rev-parse HEAD)"
  echo "branch: $(git branch --show-current)"
  echo
  echo "--- git diff --cached --name-only ---"
  git diff --cached --name-only
  echo
  echo "--- git status --porcelain -- package.json package-lock.json tsconfig.json vite.config.ts electron-builder.yml ---"
  git status --porcelain -- package.json package-lock.json tsconfig.json vite.config.ts electron-builder.yml
  echo
  echo "--- git check-ignore -v app/renderer/dist/index.html ---"
  git check-ignore -v app/renderer/dist/index.html
  echo
  echo "--- git ls-files app/renderer/dist (should be empty) ---"
  git ls-files app/renderer/dist
  echo
  echo "--- git status --porcelain -- src app test (full) ---"
  git status --porcelain -- src app test
  echo
  echo "--- git diff --stat -- src app test (tracked modifications only) ---"
  git diff --stat -- src app test
} > "$out"
cat "$out"
