#!/usr/bin/env bash
# Post-run snapshot: git status + candidate aggregate + manifest + ports/process + snake roots hashes (read-only).
set -u
export LC_ALL=C
W="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment"
R="C:/Users/51054/Desktop/work/ans-judge-delegated-run-2026-11-09"
P="$R/post"
S1="C:/Users/51054/Desktop/work/ans-game2d-snake-run-2026-11-09"
S2="C:/Users/51054/Desktop/work/ans-game2d-snake-2026-11-09"
mkdir -p "$P"
cd "$W"
{
  echo "date_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "branch: $(git branch --show-current)"
  echo "HEAD: $(git rev-parse HEAD)"
  echo "HEAD_tree: $(git rev-parse HEAD^{tree})"
} > "$P/env-after.txt"
git status --porcelain -- src app test > "$P/status-src-app-test.txt"
git status --porcelain > "$P/status-full.txt"
git -c core.quotePath=false status --porcelain -- src app test > "$P/status-src-app-test-quotepath.txt"
git diff --stat -- src app test > "$P/diffstat-src-app-test.txt"
git diff --stat -- app/desktop > "$P/diffstat-app-desktop.txt"
{
  git -c core.quotePath=false diff --name-only -z -- src app test | while IFS= read -r -d '' f; do sha256sum "$f"; done
  git ls-files --others --exclude-standard -z -- src app test | while IFS= read -r -d '' f; do sha256sum "$f"; done
} > "$P/write-set-actual.tmp"
sed 's/ \*/  /' "$P/write-set-actual.tmp" | sort -k2 > "$P/write-set-actual.tsv"
rm -f "$P/write-set-actual.tmp"
sha256sum "$P/write-set-actual.tsv" | awk '{print $1}' > "$P/write-set-canonical-aggregate.txt"
diff -u "$R/pre/write-set-actual.tsv" "$P/write-set-actual.tsv" > "$P/write-set-diff-pre-vs-post.txt" || true
git ls-files --cached --others --exclude-standard -z -- src app test \
 | while IFS= read -r -d '' f; do if [ -f "$f" ]; then sha256sum "$f"; fi; done > "$P/manifest-unsorted.tmp"
sed 's/ \*/  /' "$P/manifest-unsorted.tmp" | sort -k2 > "$P/manifest-src-app-test.tsv"
rm -f "$P/manifest-unsorted.tmp"
sha256sum "$P/manifest-src-app-test.tsv" | awk '{print $1}' > "$P/manifest-canonical-aggregate.txt"
diff -u "$R/pre/manifest-src-app-test.tsv" "$P/manifest-src-app-test.tsv" > "$P/manifest-diff-pre-vs-post.txt" || true
{
  echo "== at $(date -u +%Y-%m-%dT%H:%M:%SZ) =="
  echo "-- netstat 9222/9223 --"
  netstat -ano | grep -E ":9222|:9223" || echo "(no listeners)"
  echo "-- curl 9222 --"
  curl -s --max-time 2 http://127.0.0.1:9222/json/version || echo "(9222 unreachable)"
  echo "-- curl 9223 --"
  curl -s --max-time 2 http://127.0.0.1:9223/json/version || echo "(9223 unreachable)"
  echo "-- electron processes --"
  (tasklist | grep -i electron || echo "(none)")
} > "$P/ports-process.txt"
( cd "$S1" && find . -type f -print0 | while IFS= read -r -d '' f; do sha256sum "$f"; done | sort -k2 ) > "$P/snake-run-root.sha256.tsv"
( cd "$S2" && find . -type f -print0 | while IFS= read -r -d '' f; do sha256sum "$f"; done | sort -k2 ) > "$P/snake-target.sha256.tsv"
diff -u "$R/pre/snake-run-root.sha256.tsv" "$P/snake-run-root.sha256.tsv" > "$P/snake-run-root-diff-pre-vs-post.txt" || true
diff -u "$R/pre/snake-target.sha256.tsv" "$P/snake-target.sha256.tsv" > "$P/snake-target-diff-pre-vs-post.txt" || true
echo "post snapshot done"
