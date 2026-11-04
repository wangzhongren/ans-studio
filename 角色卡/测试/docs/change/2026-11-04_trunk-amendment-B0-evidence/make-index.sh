#!/bin/bash
# Generate 28-evidence-index.sha256 for the trunk-amendment B0 evidence dir.
# Includes the B0 record + every evidence file except the index itself and the
# verification log (29-evidence-verify.log).
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT="$(cd "$DIR/.." && pwd)"
cd "$PARENT" || exit 2
index="$DIR/28-evidence-index.sha256"
: > "$index"
sha256sum -b "2026-11-04_trunk-amendment-B0-baseline.md" >> "$index"
for f in "$DIR"/*; do
  b=$(basename "$f")
  case "$b" in
    28-evidence-index.sha256|29-evidence-verify.log) continue ;;
  esac
  sha256sum -b "$f" >> "$index"
done
wc -l < "$index"
