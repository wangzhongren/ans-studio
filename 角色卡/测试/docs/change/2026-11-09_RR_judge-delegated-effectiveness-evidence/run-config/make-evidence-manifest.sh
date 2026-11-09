#!/usr/bin/env bash
# Build a sha256 manifest for an evidence directory (sorted by path).
set -u
export LC_ALL=C
dir="$1"; out="$2"
( cd "$dir" && find . -type f -print0 | while IFS= read -r -d '' f; do sha256sum "$f"; done | sort -k2 ) > "$out"
echo "manifest: $(wc -l < "$out") files -> $out"
