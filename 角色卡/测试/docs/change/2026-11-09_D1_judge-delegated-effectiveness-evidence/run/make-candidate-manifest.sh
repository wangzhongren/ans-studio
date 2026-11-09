#!/usr/bin/env bash
# D1 candidate manifest builder (run from worktree root; read-only except outdir)
set -u
out="$1"
mkdir -p "$out"
export LC_ALL=C
# 1) write-set actual hashes (modified tracked + untracked, excluding ignored)
{
  git -c core.quotePath=false diff --name-only -z -- src app test | while IFS= read -r -d '' f; do sha256sum "$f"; done
  git ls-files --others --exclude-standard -z -- src app test | while IFS= read -r -d '' f; do sha256sum "$f"; done
} > "$out/write-set-actual.tmp"
sed 's/ \*/  /' "$out/write-set-actual.tmp" | sort -k2 > "$out/write-set-actual.tsv"
rm -f "$out/write-set-actual.tmp"
# canonical aggregate of write set: sha256 over sorted "sha256  path" lines
sha256sum "$out/write-set-actual.tsv" | awk '{print $1}' > "$out/write-set-canonical-aggregate.txt"
# 2) full manifest of src app test (tracked + untracked, excludes gitignored; raw paths)
git ls-files --cached --others --exclude-standard -z -- src app test \
 | while IFS= read -r -d '' f; do
     if [ -f "$f" ]; then sha256sum "$f"; fi
   done > "$out/manifest-unsorted.tmp"
sed 's/ \*/  /' "$out/manifest-unsorted.tmp" | sort -k2 > "$out/manifest-src-app-test.tsv"
rm -f "$out/manifest-unsorted.tmp"
sha256sum "$out/manifest-src-app-test.tsv" | awk '{print $1}' > "$out/manifest-canonical-aggregate.txt"
# counts
total=0
while IFS= read -r -d '' f; do [ -f "$f" ] && total=$((total + $(stat -c %s "$f"))); done < <(git ls-files --cached --others --exclude-standard -z -- src app test)
{
  echo "write_set_files: $(wc -l < "$out/write-set-actual.tsv")"
  echo "manifest_files: $(wc -l < "$out/manifest-src-app-test.tsv")"
  echo "manifest_total_bytes: $total"
  echo "tracked_at_HEAD(src app test): $(git ls-files -- src app test | wc -l)"
  echo "untracked(src app test): $(git ls-files --others --exclude-standard -- src app test | wc -l)"
} > "$out/manifest-counts.txt"
