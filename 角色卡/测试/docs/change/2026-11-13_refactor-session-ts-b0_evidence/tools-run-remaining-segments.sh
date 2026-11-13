#!/usr/bin/env bash
# B0（2026-11-13）：剩余三段基线（门禁引擎 / 测试 / 编排）的分段执行脚本。
# 口径：与 14-segments-summary.txt 前 10 段一致（--test-concurrency=1 --test-timeout=120000，
#       增补 --test-force-exit 防本环境句柄泄漏；段级外部 timeout 兜底）。
# 拆分披露：
#   - 测试段：customer-authorization-plane-integration.test.ts 为历史登记挂起文件，单独以 300s 上限运行；
#   - 编排段：git-trunk-store.test.ts 为本环境已知挂起/原生崩溃文件，单独以 300s 上限运行；
#     编排 24 条冻结 known-red 均不在该文件（已逐名映射核对）。
set -u
SNAP="C:/Users/51054/AppData/Local/Temp/b0-baseline-c234e79"
E="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b0/角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b0_evidence"
SUMMARY="$E/14-segments-summary.txt"
cd "$SNAP" || exit 90
append() { echo "$*" >> "$SUMMARY"; }

run_glob() {
  label="$1"; cap="$2"; glob="$3"; out="$4"
  start=$(date +%s)
  timeout -k 30 "$cap" node --test --test-concurrency=1 --test-timeout=120000 --test-force-exit "$glob" > "$out" 2>&1
  code=$?
  dur=$(( $(date +%s) - start ))
  append "$label exit=$code dur=${dur}s"
}

run_files() {
  label="$1"; cap="$2"; out="$3"; shift 3
  start=$(date +%s)
  timeout -k 30 "$cap" node --test --test-concurrency=1 --test-timeout=120000 --test-force-exit "$@" > "$out" 2>&1
  code=$?
  dur=$(( $(date +%s) - start ))
  append "$label exit=$code dur=${dur}s"
}

# 门禁引擎：LF 归一 -> 运行 -> 还原（口径同前 10 段，孤儿轮已有 14a 审计件）
mv "$E/14-segment-门禁引擎.tap" "$E/14a-segment-门禁引擎-orphaned-run.tap" 2>/dev/null || true
git cat-file blob HEAD:src/common/门禁引擎/workflows/chief/chief-workflow.md > src/common/门禁引擎/workflows/chief/chief-workflow.md
git cat-file blob HEAD:src/common/门禁引擎/workflows/chief/chief-workflow-v2.md > src/common/门禁引擎/workflows/chief/chief-workflow-v2.md
append "门禁引擎 LF normalization applied (chief-workflow.md, chief-workflow-v2.md)"
run_glob "门禁引擎" 1200 "test/门禁引擎/**/*.test.ts" "$E/14-segment-门禁引擎.tap"
git checkout -- src/common/门禁引擎/workflows/chief/
append "门禁引擎 resources restored (CRLF via git checkout)"

# 测试段（拆分历史登记挂起文件）
mapfile -t TEST_FILES < <(find test/测试 -name '*.test.ts' ! -name 'customer-authorization-plane-integration.test.ts' -print | sort)
run_files "测试" 2400 "$E/14-segment-测试.tap" "${TEST_FILES[@]}"
run_files "测试-hangsplit" 300 "$E/14-segment-测试-hangsplit.tap" "test/测试/customer-authorization-plane-integration.test.ts"

# 编排段（拆分 git-trunk-store）
mapfile -t ORCH_FILES < <(find test/编排 -name '*.test.ts' ! -name 'git-trunk-store.test.ts' -print | sort)
run_files "编排" 1800 "$E/14-segment-编排.tap" "${ORCH_FILES[@]}"
run_files "编排-git-trunk-store" 300 "$E/14-segment-编排-git-trunk-store.tap" "test/编排/git-trunk-store.test.ts"

append "ALLDONE $(date '+%Y-%m-%d %H:%M:%S')"
