#!/usr/bin/env bash
# Extract trusted failure pairs (file<TAB>test name) from one spec-reporter log.
set -u
log="${1:?usage: extract-fail-pairs.sh <log> [file-path-for-pairs]}"
file="${2:-}"
awk '
  /^✖ failing tests:/ { start=NR }
  { line[NR]=$0 }
  END {
    if (start=="") exit 0
    for (i=start; i<=NR; i++) {
      l=line[i]
      if (l ~ /^test at /) { loc=l; sub(/^test at /,"",loc); sub(/:[0-9]+:[0-9]+$/,"",loc); gsub(/\\/,"/",loc); pending=loc; continue }
      if (pending!="" && l ~ /^[[:space:]]*✖ /) { name=l; sub(/^[[:space:]]*✖ /,"",name); sub(/ \([0-9.]+ms\)$/,"",name); print pending "\t" name; pending="" }
    }
  }' "$log"
