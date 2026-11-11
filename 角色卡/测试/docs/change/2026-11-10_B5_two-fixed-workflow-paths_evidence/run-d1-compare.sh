#!/usr/bin/env bash
# B5 D1 known-red comparisons (run from repo root after d1-domains completes).
set -u
EV="角色卡/测试/docs/change/2026-11-10_B5_two-fixed-workflow-paths_evidence"
OUT="$EV/d1-knownred"
mkdir -p "$OUT"
node "C:\Users\51054\AppData\Local\Temp\ans-b5-probe\compare-ref.mjs" "$EV/d1-domains/failing-names.json" "test/编排/" "$EV/ref-knownred-orch-24.txt" "$OUT/orch.txt" > /dev/null
node "C:\Users\51054\AppData\Local\Temp\ans-b5-probe\compare-ref.mjs" "$EV/d1-domains/failing-names.json" "test/门禁引擎/" "$EV/ref-knownred-gates-5.txt" "$OUT/gates.txt" > /dev/null
node "C:\Users\51054\AppData\Local\Temp\ans-b5-probe\compare-ref.mjs" "$EV/d1-domains/failing-names.json" "test/runtime-core/" "$EV/ref-knownred-runtime-core-33.txt" "$OUT/runtime-core.txt" > /dev/null
node "C:\Users\51054\AppData\Local\Temp\ans-b5-probe\compare-ref.mjs" "$EV/d1-domains/failing-names.json" "test/桌面应用/" "$EV/ref-knownred-desktop-union.txt" "$OUT/desktop-union.txt" > /dev/null
node "C:\Users\51054\AppData\Local\Temp\ans-b5-probe\summarize-domains.mjs" "$EV/d1-domains/results.tsv" > "$OUT/domain-counts.tsv"
echo "=== orch ==="; cat "$OUT/orch.txt"
echo "=== gates ==="; cat "$OUT/gates.txt"
echo "=== runtime-core ==="; cat "$OUT/runtime-core.txt"
echo "=== desktop-union ==="; cat "$OUT/desktop-union.txt"
echo "=== counts ==="; cat "$OUT/domain-counts.tsv"
