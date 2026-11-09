#!/usr/bin/env bash
# Compare current fail/skip title set vs baseline set (normalized; no backslash rewriting).
# Usage: compare-sets.sh <current.txt> <baseline.txt> <outprefix>
set -u
export LC_ALL=C
norm() { sed -E 's/^✖ //; s/ \([0-9]+(\.[0-9]+)?(ms|s)\)$//' "$1" | sed -E 's/[[:space:]]+$//' | grep -v '^$' | grep -v '^failing tests:$' | sort -u; }
norm "$1" > "$3.current.norm.txt"
norm "$2" > "$3.baseline.norm.txt"
comm -23 "$3.current.norm.txt" "$3.baseline.norm.txt" > "$3.new-fails.txt"
comm -13 "$3.current.norm.txt" "$3.baseline.norm.txt" > "$3.missing-fails.txt"
echo "current=$(wc -l < "$3.current.norm.txt") baseline=$(wc -l < "$3.baseline.norm.txt") new=$(wc -l < "$3.new-fails.txt") missing=$(wc -l < "$3.missing-fails.txt")"
