#!/usr/bin/env bash
# Build evidence manifest: SHA-256 + bytes + lines for every file under the evidence dir (excluding itself), sorted by path.
set -u
EV="${1:?usage: make-evidence-manifest.sh <evidence-dir>}"
cd "$EV" || exit 2
EV="$PWD"
OUT="$EV/evidence-manifest.txt"
: > "$OUT.tmp"
find . -type f ! -name 'evidence-manifest.txt' ! -name 'evidence-manifest.txt.tmp' | LC_ALL=C sort | while IFS= read -r f; do
  rel="${f#./}"
  h=$(sha256sum -- "$rel" | awk '{print $1}')
  b=$(wc -c < "$rel" | tr -d ' ')
  l=$(wc -l < "$rel" | tr -d ' ')
  printf '%s\t%s\t%s\t%s\n' "$h" "$b" "$l" "$rel" >> "$OUT.tmp"
done
mv "$OUT.tmp" "$OUT"
echo "entries: $(wc -l < "$OUT")"
echo "manifest sha256: $(sha256sum "$OUT" | awk '{print $1}')"
echo "manifest bytes: $(wc -c < "$OUT")"
