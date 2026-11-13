#!/usr/bin/env bash
# B7 第三段：全量运行后的合并与对照（只读/证据生成）。
set -u
WT="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b7"
E="$WT/角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3"
cd "$WT" || exit 90

node "$E/tools/merge-segments.mjs" "$E/full" > "$E/full/merged-console.txt" 2>&1
node "$E/tools/diff-full-failnames.mjs" "$E/full/merged.json" "$E/full/b0-frozen-merged.json" "$E/full/failname-diff.json" > "$E/full/failname-diff-summary.txt" 2>&1
node "$E/tools/segment-compare.mjs" "$E/full/merged.json" "$E/full/b0-frozen-merged.json" "$E/full/segment-compare.json" > "$E/full/segment-compare-summary.txt" 2>&1
node "$E/tools/knownred-compare.mjs" "$E/full/segment-runtime-core.tap" "$E/knownred/runtime-core-33.txt" runtime-core > "$E/knownred/runtime-core-diff.json" 2>&1
node "$E/tools/knownred-compare.mjs" "$E/full/segment-门禁引擎.tap" "$E/knownred/gates-5.txt" gates > "$E/knownred/gates-diff.json" 2>&1
node "$E/tools/knownred-compare.mjs" "$E/full/segment-编排.tap" "$E/knownred/orchestration-24.txt" orchestration > "$E/knownred/orchestration-diff.json" 2>&1
git status --porcelain > "$E/full/git-status-after-run.txt"
cat "$E/full/merged-console.txt"
echo "--- failname diff ---"
cat "$E/full/failname-diff-summary.txt"
echo "--- segment compare ---"
cat "$E/full/segment-compare-summary.txt"
echo "--- knownred sameSet ---"
node -e '
const fs=require("fs");
for (const name of ["runtime-core","gates","orchestration"]) {
  const j=JSON.parse(fs.readFileSync(process.argv[1]+"/knownred/"+name+"-diff.json","utf8"));
  console.log(name, "canonical="+j.canonicalCount, "actual="+j.actualCount, "sameSet="+j.sameSet);
}
' "$E"
