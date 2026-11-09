#!/usr/bin/env bash
# Extract failing/skip titles from a dir of TAP files.
# Usage: extract-titles.sh <tapdir> <outprefix>
set -u
export LC_ALL=C
dir="$1"; out="$2"
: > "$out.fails.raw"; : > "$out.skips.raw"
for tap in "$dir"/*.tap; do
  [ -f "$tap" ] || continue
  sed -n -E 's/^[[:space:]]*not ok [0-9]+ - //p' "$tap" >> "$out.fails.raw"
  sed -n -E 's/^[[:space:]]*ok [0-9]+ - (.*) # SKIP.*$/\1/p' "$tap" >> "$out.skips.raw"
done
norm() { sed -E 's/ \([0-9]+(\.[0-9]+)?(ms|s)\)$//; s/^✖ //' "$1" | sed -E 's/[[:space:]]+$//' | grep -v '^$' | grep -v '^failing tests:$' | sort -u; }
norm "$out.fails.raw" > "$out.fails.txt"
norm "$out.skips.raw" > "$out.skips.txt"
rm -f "$out.fails.raw" "$out.skips.raw"
wc -l "$out.fails.txt" "$out.skips.txt"
