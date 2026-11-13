#!/usr/bin/env bash
# B7 第三段：全量套件分段执行（B0 口径，2026-11-13）
# 口径：
#   - 命令 = node --test --test-concurrency=1 --test-timeout=120000 [--test-force-exit] <段>;
#   - 分段 = test/ 一级目录 13 段 + 拆分单文件 2 段（测试-hangsplit / 编排-git-trunk-store，均历史登记挂起文件）；
#   - --test-force-exit 仅作本环境句柄泄漏/退出兜底（不改变用例结果；CI 权威命令无此开关）；
#   - 段级外部 timeout 兜底（-k 30）；
#   - 门禁引擎段：临时 LF 归一 chief 两工作流文件（git cat-file blob HEAD:）→ 运行 → git checkout -- 还原。
set -u
WT="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b7"
E="$WT/角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3"
FULL="$E/full"
SUMMARY="$FULL/segments-summary.txt"
cd "$WT" || exit 90
mkdir -p "$FULL"
: > "$SUMMARY"
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

append "started $(date '+%Y-%m-%d %H:%M:%S')"

run_glob gates 300 "test/gates/**/*.test.ts" "$FULL/segment-gates.tap"
run_glob claude-adapter 300 "test/claude-adapter/**/*.test.ts" "$FULL/segment-claude-adapter.tap"
run_glob codex-adapter 300 "test/codex-adapter/**/*.test.ts" "$FULL/segment-codex-adapter.tap"
run_glob pi-adapter 600 "test/pi-adapter/**/*.test.ts" "$FULL/segment-pi-adapter.tap"
run_glob roles 300 "test/roles/**/*.test.ts" "$FULL/segment-roles.tap"
run_glob runtime-core 600 "test/runtime-core/**/*.test.ts" "$FULL/segment-runtime-core.tap"
run_glob 装配 300 "test/装配/**/*.test.ts" "$FULL/segment-装配.tap"
run_glob 项目管理 300 "test/项目管理/**/*.test.ts" "$FULL/segment-项目管理.tap"
run_glob 桌面UI 300 "test/桌面UI/**/*.test.ts" "$FULL/segment-桌面UI.tap"
run_glob 桌面应用 1800 "test/桌面应用/**/*.test.ts" "$FULL/segment-桌面应用.tap"

# 门禁引擎：临时 LF 归一 chief 两文件 -> 运行 -> 还原（口径同 B0）
CF1="src/common/门禁引擎/workflows/chief/chief-workflow.md"
CF2="src/common/门禁引擎/workflows/chief/chief-workflow-v2.md"
git cat-file blob "HEAD:$CF1" > "$CF1" || append "门禁引擎 LF normalization FAILED ($CF1)"
git cat-file blob "HEAD:$CF2" > "$CF2" || append "门禁引擎 LF normalization FAILED ($CF2)"
append "门禁引擎 LF normalization applied (chief-workflow.md, chief-workflow-v2.md)"
run_glob 门禁引擎 1200 "test/门禁引擎/**/*.test.ts" "$FULL/segment-门禁引擎.tap"
git checkout -- src/common/门禁引擎/workflows/chief/ || append "门禁引擎 resources restore FAILED"
append "门禁引擎 resources restored (CRLF via git checkout)"
git status --porcelain -- src/common/门禁引擎/workflows/chief/ > "$FULL/gates-resources-status.txt"
# CRLF 复核（应输出 CRLF 计数 > 0、LF-only 计数 = 0）
node -e '
const fs = require("fs");
const files = ["src/common/门禁引擎/workflows/chief/chief-workflow.md","src/common/门禁引擎/workflows/chief/chief-workflow-v2.md"];
const lines = [];
for (const f of files) {
  const b = fs.readFileSync(f);
  const crlf = (b.toString("latin1").match(/\r\n/g) || []).length;
  const lf = (b.toString("latin1").match(/(?<!\r)\n/g) || []).length;
  lines.push(`${f}: bytes=${b.length} crlf=${crlf} lfOnly=${lf}`);
}
fs.writeFileSync(process.argv[1], lines.join("\n") + "\n");
' "$FULL/gates-resources-crlf-check.txt"

# 测试段（拆分历史登记挂起文件 customer-authorization-plane-integration.test.ts）
mapfile -t TEST_FILES < <(find test/测试 -name '*.test.ts' ! -name 'customer-authorization-plane-integration.test.ts' -print | sort)
append "测试 segment file count: ${#TEST_FILES[@]} (excluding customer-authorization-plane-integration.test.ts)"
run_files "测试" 2400 "$FULL/segment-测试.tap" "${TEST_FILES[@]}"
run_files "测试-hangsplit" 300 "$FULL/segment-测试-hangsplit.tap" "test/测试/customer-authorization-plane-integration.test.ts"

# 编排段（拆分 git-trunk-store.test.ts）
mapfile -t ORCH_FILES < <(find test/编排 -name '*.test.ts' ! -name 'git-trunk-store.test.ts' -print | sort)
append "编排 segment file count: ${#ORCH_FILES[@]} (excluding git-trunk-store.test.ts)"
run_files "编排" 1800 "$FULL/segment-编排.tap" "${ORCH_FILES[@]}"
run_files "编排-git-trunk-store" 300 "$FULL/segment-编排-git-trunk-store.tap" "test/编排/git-trunk-store.test.ts"

append "ALLDONE $(date '+%Y-%m-%d %H:%M:%S')"
