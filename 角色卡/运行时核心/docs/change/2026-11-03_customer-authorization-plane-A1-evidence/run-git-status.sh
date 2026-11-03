#!/usr/bin/env bash
# A1 evidence: git status/diff and candidate-isolation facts (includes concurrent-write disclosure).
set +e
WORKTREE="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane"
EVIDENCE="$WORKTREE/角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-A1-evidence"
LOG="$EVIDENCE/08-git-status.txt"
cd "$WORKTREE" || exit 99
{
  echo "captured_at: $(date -Iseconds)"
  echo "head: $(git rev-parse HEAD)"
  echo "branch: $(git branch --show-current)"
  echo "--- git status --porcelain -- src app test"
  git status --porcelain -- src app test
  echo "--- status of the six A1 paths"
  for f in \
    src/model/directive-marker.ts \
    src/model/directive.ts \
    src/model/runtime.ts \
    src/model/project-state.ts \
    test/runtime-core/directive-marker.test.ts \
    test/runtime-core/directive-contract.test.ts; do
    git status --porcelain -- "$f"
  done
  echo "--- git diff --name-only"
  git diff --name-only
  echo "--- git diff --cached --name-only"
  git diff --cached --name-only
  echo "--- git status --short"
  git status --short
  echo "--- concurrent non-A1 changes observed during A1 (NOT written by 运行时核心)"
  echo "  A2: src/common/shared/jsonl-ledger.ts, test/项目管理/shared/jsonl-ledger.test.ts"
  echo "  A3: src/common/shared/i18n/messages/{zh-CN,en-US}.ts, test/项目管理/shared/i18n.test.ts"
  echo "  H1/治理: 角色卡/*/boundary.*, changelog.md, docs/*, 角色卡/项目管理/docs/architecture/shared-components.md"
} > "$LOG"
exit 0
