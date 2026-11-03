#!/usr/bin/env bash
# B1 ledger-samples evidence run (2026-11-03, orchestration role, evidence-only).
# Runs: candidate identity (before) -> generate samples -> replay/verify -> candidate identity (after)
#       -> evidence hashes.
# Writes only inside this evidence directory. Does not modify src/app/test, does not commit/push.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../../../.." && pwd)"
cd "$REPO" || exit 2

{
  echo "generatedAt: $(date -Is)"
  echo "cwd: $REPO"
  echo "evidenceDir: $HERE"
  echo "HEAD: $(git rev-parse HEAD)"
  echo "node: $(node --version)"
  echo "npm: $(npm --version)"
  echo "uname: $(uname -a)"
  echo "timezone: $(date +%Z) offset $(date +%z)"
  echo "shell: $BASH_VERSION"
} > "$HERE/00-environment.txt"

# — before: candidate identity must equal the frozen 54-file list —
node "$HERE/verify-candidates.mjs" "00b-candidate-identity-before.txt" > "$HERE/00b-candidate-identity-before.log" 2>&1
BEFORE_CODE=$?
echo "exit code: $BEFORE_CODE" >> "$HERE/00b-candidate-identity-before.log"

# — generate samples —
{
  echo "command: node 01-generate-ledger-samples.mjs"
  echo "cwd: $REPO"
  echo "startedAt: $(date -Is)"
  node "$HERE/01-generate-ledger-samples.mjs"
  GEN_CODE=$?
  echo "finishedAt: $(date -Is)"
  echo "exit code: $GEN_CODE"
} > "$HERE/01-generate-log.txt" 2>&1

# — replay/verify samples —
{
  echo "command: node 02-replay-ledgers.mjs"
  echo "cwd: $REPO"
  echo "startedAt: $(date -Is)"
  node "$HERE/02-replay-ledgers.mjs"
  REPLAY_CODE=$?
  echo "finishedAt: $(date -Is)"
  echo "exit code: $REPLAY_CODE"
} > "$HERE/02-replay-log.txt" 2>&1

# — after: candidate identity must still equal the frozen 54-file list —
node "$HERE/verify-candidates.mjs" "03-candidate-identity-after.txt" > "$HERE/03-candidate-identity-after.log" 2>&1
AFTER_CODE=$?
echo "exit code: $AFTER_CODE" >> "$HERE/03-candidate-identity-after.log"

# — run summary —
{
  echo "started: $(head -n 1 "$HERE/00-environment.txt")"
  echo "candidate-before-exit: $BEFORE_CODE"
  echo "generate-exit: ${GEN_CODE:-unknown}"
  echo "replay-exit: ${REPLAY_CODE:-unknown}"
  echo "candidate-after-exit: $AFTER_CODE"
  echo "generation-start: $(grep -m1 '^startedAt:' "$HERE/01-generate-log.txt" || true)"
  echo "generation-end: $(grep -m1 '^finishedAt:' "$HERE/01-generate-log.txt" || true)"
  echo "generation-checks: $(grep -m1 '^SUMMARY checks=' "$HERE/01-generate-log.txt" || true)"
  echo "replay-checks: $(grep -m1 '^SUMMARY checks=' "$HERE/02-replay-log.txt" || true)"
  echo "candidate-before-summary: $(grep -m1 '^RESULT ' "$HERE/00b-candidate-identity-before.log" || true)"
  echo "candidate-after-summary: $(grep -m1 '^RESULT ' "$HERE/03-candidate-identity-after.log" || true)"
} > "$HERE/05-run-summary.txt"

# — evidence hashes (all files except this hash list itself) —
{
  echo "# B1 ledger samples evidence hashes"
  echo "# generated: $(date -Is)"
  echo "# cwd: $REPO"
  echo "# command: (cd evidence && find . -type f ! -name '04-evidence-hashes.txt' -print | sort | xargs sha256sum)"
  echo
  (cd "$HERE" && find . -type f ! -name '04-evidence-hashes.txt' -print | sort | while IFS= read -r file; do sha256sum "$file"; done)
  echo
  echo "# ledger line counts / sizes"
  wc -l -c "$HERE/02-ledger-sample/project/.ans/state/customer-directives.jsonl"
  wc -l -c "$HERE/03-bad-rotation-sample/project/.ans/state/customer-directives.jsonl"
  wc -l -c "$HERE/03-bad-rotation-sample/project/.ans/state/customer-directives.jsonl.1"
  wc -l -c "$HERE/03-bad-rotation-sample/project/.ans/state/customer-directives.jsonl.2"
} > "$HERE/04-evidence-hashes.txt"

cat "$HERE/05-run-summary.txt"
if [ "$BEFORE_CODE" -ne 0 ] || [ "${GEN_CODE:-1}" -ne 0 ] || [ "${REPLAY_CODE:-1}" -ne 0 ] || [ "$AFTER_CODE" -ne 0 ]; then
  exit 1
fi
exit 0
