#!/usr/bin/env bash
# E3-F (2026-11-09 judge-delegated-effectiveness) full T3 harness.
# Same method as reference E3-F (2026-11-08, 41a4a215) / first-change E3 (5cba2d54) run-t3-per-file.sh:
# one independent `node --test --test-concurrency=1` process per test file; natural EXIT/CLOSE;
# watchdog only to bound hangs (registered hangs 90s; all others 300s). No --test-force-exit / --test-timeout.
# Usage: bash run-e3f-per-file.sh <repo-abs> <file-list> <logdir> <results-tsv> <node-leftovers-log> <progress-log>
set -u
REPO="$1"; LIST="$2"; LOGDIR="$3"; RESULTS="$4"; PROCKLOG="${5:-/dev/null}"; PROGRESS="${6:-/dev/null}"
cd "$REPO" || exit 2
: > "$RESULTS"
: > "$PROGRESS"
n=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  n=$((n+1))
  safe=$(printf '%s' "$f" | sed 's#/#__#g')
  log="$LOGDIR/$safe.log"
  force=0
  case "$f" in
    "test/pi-adapter/write-sequencing.test.ts"|"test/测试/customer-authorization-plane-integration.test.ts"|"test/桌面应用/directive-decision.test.ts"|"test/桌面应用/optional-acceptance.test.ts"|"test/桌面应用/session-rebuild-race.test.ts"|"test/桌面应用/stuck-redispatch.test.ts") TO=90 ;;
    *) TO=300 ;;
  esac
  start=$(date +%s%3N)
  timeout -k 5 "$TO" node --test --test-concurrency=1 "$f" > "$log" 2>&1
  ec=$?
  end=$(date +%s%3N)
  wall=$((end-start))
  killed=0; [ "$ec" = "124" ] && killed=1
  tests=$(grep -E '^ℹ tests ' "$log" | tail -1 | awk '{print $3}')
  pass=$(grep -E '^ℹ pass ' "$log" | tail -1 | awk '{print $3}')
  fail=$(grep -E '^ℹ fail ' "$log" | tail -1 | awk '{print $3}')
  cancelled=$(grep -E '^ℹ cancelled ' "$log" | tail -1 | awk '{print $3}')
  skipped=$(grep -E '^ℹ skipped ' "$log" | tail -1 | awk '{print $3}')
  todo=$(grep -E '^ℹ todo ' "$log" | tail -1 | awk '{print $3}')
  dur=$(grep -E '^ℹ duration_ms ' "$log" | tail -1 | awk '{print $3}')
  summary=0; grep -qE '^ℹ tests ' "$log" && summary=1
  [ -z "$tests" ] && tests=-1
  [ -z "$pass" ] && pass=-1
  [ -z "$fail" ] && fail=-1
  [ -z "$cancelled" ] && cancelled=-1
  [ -z "$skipped" ] && skipped=-1
  [ -z "$todo" ] && todo=-1
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$f" "$TO" "$force" "$ec" "$killed" "$summary" "$tests" "$pass" "$fail" "$cancelled" "$skipped" "$todo" "${dur:-}" "$wall" >> "$RESULTS"
  printf '%s\t%s/%s\tec=%s\tkilled=%s\ttests=%s\tpass=%s\tfail=%s\tcanc=%s\tskip=%s\ttodo=%s\tdur=%s\twall=%sms\n' \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$n" "$(wc -l < "$LIST" | tr -d ' ')" "$ec" "$killed" "$tests" "$pass" "$fail" "$cancelled" "$skipped" "$todo" "${dur:-}" "$wall" >> "$PROGRESS"
  if [ "$killed" = "1" ]; then
    nproc=$(tasklist //FI "IMAGENAME eq node.exe" 2>/dev/null | grep -c "node.exe")
    printf 'TIMEOUT_POSTCHECK\t%s\tpost_kill_node_exe_lines=%s\t%s\n' "$f" "$nproc" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$PROCKLOG"
  fi
done < "$LIST"
echo "DONE $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$RESULTS"
echo "DONE $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$PROGRESS"
