#!/usr/bin/env bash
# A1 evidence: line/byte/SHA-256 manifest for every evidence file (manifest itself excluded from rows).
set +e
WORKTREE="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane"
EVIDENCE="$WORKTREE/角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-A1-evidence"
LOG="$EVIDENCE/11-evidence-hashes.txt"
TMP="$EVIDENCE/.evidence-hashes.tmp"
cd "$WORKTREE" || exit 99
{
  echo "captured_at: $(date -Iseconds)"
  echo "format: name | lines | bytes | sha256"
  for f in "$EVIDENCE"/*; do
    base=$(basename "$f")
    if [ "$base" = "11-evidence-hashes.txt" ] || [ "$base" = ".evidence-hashes.tmp" ]; then
      continue
    fi
    echo "$base | $(wc -l < "$f") | $(wc -c < "$f") | $(sha256sum "$f" | cut -d' ' -f1)"
  done
} | sort > "$TMP"
SELF=$(sha256sum "$TMP" | cut -d' ' -f1)
{
  cat "$TMP"
  echo "self_sha256_excluding_this_line: $SELF"
} > "$LOG"
rm -f "$TMP"
exit 0
