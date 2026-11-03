#!/usr/bin/env bash
# D2 evidence helper: capture candidate state before/after runs (test role; not a product/test candidate).
set -u
cd "$(dirname "$0")/../../../../.." || exit 1
OUT="角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence"
LABEL="${1:-pre}"
FILE="$OUT/${LABEL}-state.txt"
{
  echo "=== D2 $LABEL state ($(date -Iseconds))"
  echo "head: $(git rev-parse HEAD)"
  echo "branch: $(git branch --show-current)"
  echo
  echo "=== git status --porcelain -- src app test"
  git -c core.quotepath=false status --porcelain -- src app test
  echo
  echo "=== git status --short (full)"
  git -c core.quotepath=false status --short
  echo
  echo "=== git diff --cached --name-only"
  git diff --cached --name-only
  echo
  echo "=== protected config status (expect empty)"
  git status --porcelain -- package.json package-lock.json tsconfig.json vite.config.ts electron-builder.yml src/index.ts app/renderer/dist
  echo
  echo "=== candidate files (git ls-files -m -o --exclude-standard -- src app test), count + hash-object + sha256"
  LIST=$(git -c core.quotepath=false ls-files -m -o --exclude-standard -- src app test | sort)
  echo "count: $(printf '%s\n' "$LIST" | sed '/^$/d' | wc -l)"
  printf '%s\n' "$LIST" | while IFS= read -r f; do
    [ -z "$f" ] && continue
    printf '%s\t%s\t%s\n' "$(git hash-object -- "$f")" "$(sha256sum -- "$f" | cut -d' ' -f1)" "$f"
  done
} > "$FILE"
cat "$FILE"
