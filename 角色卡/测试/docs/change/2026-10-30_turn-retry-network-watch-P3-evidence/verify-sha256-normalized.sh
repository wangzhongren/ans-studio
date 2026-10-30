#!/usr/bin/env bash
# Verify the evidence manifest across EOL variants.
# Text files are CRLF-normalized before hashing; PNG screenshots are hashed raw.
# Usage: bash verify-sha256-normalized.sh
set -u
cd "$(dirname "$0")"
fail=0
ok=0
while IFS= read -r line || [ -n "$line" ]; do
  line=${line%$'\r'}
  [ -z "$line" ] && continue
  expected=${line%% *}
  path=${line#* }
  path=${path#\*}
  case "$path" in
    *.png) actual=$(sha256sum "$path" | cut -d' ' -f1) ;;
    *) actual=$(tr -d '\r' < "$path" | sha256sum | cut -d' ' -f1) ;;
  esac
  if [ "$actual" = "$expected" ]; then
    ok=$((ok + 1))
  else
    echo "FAILED $path"
    fail=$((fail + 1))
  fi
done < sha256.txt
echo "normalized verify: ok=$ok failed=$fail"
[ "$fail" -eq 0 ]
