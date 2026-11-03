#!/usr/bin/env bash
# Generate D1 evidence hash index (lines, bytes, SHA-256) for every evidence file
# except the index itself.
set -u
dir="$1"
out="$dir/08-evidence-hashes.txt"
{
  echo "D1 evidence hash index"
  echo "generated: $(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "directory: $dir"
  echo "columns: lines  bytes  sha256  file"
  echo
  find "$dir" -maxdepth 1 -type f ! -name '08-evidence-hashes.txt' -printf '%f\n' | sort | while IFS= read -r name; do
    file="$dir/$name"
    lines=$(wc -l < "$file")
    bytes=$(wc -c < "$file")
    sha=$(sha256sum "$file" | cut -d' ' -f1)
    printf '%s\t%s\t%s\t%s\n' "$lines" "$bytes" "$sha" "$name"
  done
} > "$out"
cat "$out"
