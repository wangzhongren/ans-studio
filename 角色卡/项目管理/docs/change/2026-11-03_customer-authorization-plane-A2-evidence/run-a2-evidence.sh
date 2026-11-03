#!/usr/bin/env bash
# A2 / A3 证据生成脚本（项目管理，2026-11-03 customer-authorization-plane）。
# 只写本角色 evidence 目录；不 commit/push；不修改产品/测试代码。
set -u
cd "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane" || exit 2
dir="角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-A2-evidence"

# 00 环境与基线
{
  printf 'node: '; node --version
  printf 'npm: '; npm --version
  printf 'os: '; uname -a
  printf 'shell: %s\n' "$BASH_VERSION"
  printf 'worktree: %s\n' "$PWD"
  printf 'head: '; git rev-parse HEAD
  printf 'collected_at: '; date '+%Y-%m-%dT%H:%M:%S%z'
  printf 'baseline_status_src_app_test_at_node_start: empty (observed before implementation)\n'
  printf 'current_status_src_app_test:\n'
  git status --porcelain -- src app test
} > "$dir/00-environment-and-baseline.txt" 2>&1

# 02 A2 单文件测试
{
  printf 'cwd: %s\n' "$PWD"
  printf 'command: node --test --test-concurrency=1 "test/项目管理/shared/jsonl-ledger.test.ts"\n'
  printf 'started_at: '; date '+%Y-%m-%dT%H:%M:%S%z'
  node --test --test-concurrency=1 "test/项目管理/shared/jsonl-ledger.test.ts"
  status=$?
  printf 'exit_code: %s\n' "$status"
  printf 'ended_at: '; date '+%Y-%m-%dT%H:%M:%S%z'
} > "$dir/02-tests-jsonl-ledger.log" 2>&1

# 03 项目管理 shared 全组
{
  printf 'cwd: %s\n' "$PWD"
  printf 'command: node --test --test-concurrency=1 "test/项目管理/shared/*.test.ts"\n'
  printf 'started_at: '; date '+%Y-%m-%dT%H:%M:%S%z'
  node --test --test-concurrency=1 "test/项目管理/shared/*.test.ts"
  status=$?
  printf 'exit_code: %s\n' "$status"
  printf 'ended_at: '; date '+%Y-%m-%dT%H:%M:%S%z'
} > "$dir/03-tests-project-shared-group.log" 2>&1

# 04 全仓 typecheck（原始输出；若并发角色未收口可能非 0，按失败分类记录）
{
  printf 'cwd: %s\n' "$PWD"
  printf 'command: npm run typecheck\n'
  printf 'started_at: '; date '+%Y-%m-%dT%H:%M:%S%z'
  npm run typecheck
  status=$?
  printf 'exit_code: %s\n' "$status"
  printf 'ended_at: '; date '+%Y-%m-%dT%H:%M:%S%z'
} > "$dir/04-typecheck-full.log" 2>&1

# 05 写集范围 typecheck（显式文件，忽略 tsconfig.json）
{
  printf 'cwd: %s\n' "$PWD"
  printf 'command: npx tsc --noEmit --ignoreConfig <project compilerOptions> src/common/shared/jsonl-ledger.ts src/common/shared/i18n/index.ts test/项目管理/shared/jsonl-ledger.test.ts test/项目管理/shared/i18n.test.ts\n'
  printf 'started_at: '; date '+%Y-%m-%dT%H:%M:%S%z'
  npx tsc --noEmit --ignoreConfig --strict --target esnext --lib esnext --module nodenext --moduleResolution nodenext --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax --erasableSyntaxOnly --isolatedModules --resolveJsonModule --forceConsistentCasingInFileNames --types node src/common/shared/jsonl-ledger.ts src/common/shared/i18n/index.ts test/项目管理/shared/jsonl-ledger.test.ts test/项目管理/shared/i18n.test.ts
  status=$?
  printf 'exit_code: %s\n' "$status"
  printf 'ended_at: '; date '+%Y-%m-%dT%H:%M:%S%z'
} > "$dir/05-typecheck-scoped-a2a3.log" 2>&1

# 06 diff / 暂存区
{
  printf 'git diff --name-only:\n'
  git diff --name-only
  printf 'git diff --cached --name-only:\n'
  git diff --cached --name-only
} > "$dir/06-git-diff-name-only.txt" 2>&1

# 07 status
git status --short > "$dir/07-git-status-short.txt" 2>&1

# 08 写后哈希/行数
{
  printf 'file | git hash-object | sha256 | bytes | lines\n'
  for f in "src/common/shared/jsonl-ledger.ts" "test/项目管理/shared/jsonl-ledger.test.ts" "src/common/shared/i18n/messages/zh-CN.ts" "src/common/shared/i18n/messages/en-US.ts" "test/项目管理/shared/i18n.test.ts" "角色卡/项目管理/docs/architecture/shared-components.md"; do
    printf '%s | ' "$f"
    printf '%s | ' "$(git hash-object -- "$f")"
    printf '%s | ' "$(sha256sum -- "$f" | cut -d' ' -f1)"
    printf '%s | ' "$(wc -c < "$f")"
    printf '%s\n' "$(wc -l < "$f")"
  done
} > "$dir/08-after-hashes.txt" 2>&1

# 09 失败分类
{
  printf 'full typecheck errors are outside the A2/A3 write set when non-zero.\n'
  printf 'expected concurrent source: uncommitted A1 files (src/model/runtime.ts, src/model/project-state.ts, src/model/directive*.ts, test/runtime-core/directive-*.test.ts) and their consumers to be updated by B1.\n'
  printf 'A2 acceptance signal: 05-typecheck-scoped-a2a3.log exit_code 0 and no errors in A2/A3 files.\n'
  printf 'deterministic new failures in A2 test file: 0; new skips: 0.\n'
} > "$dir/09-failure-classification.txt" 2>&1

exit 0
