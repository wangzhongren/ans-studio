#!/usr/bin/env bash
# A1 evidence runner: scoped typecheck of the six A1 candidate files with the same strict flags as tsconfig.
# This proves the A1 files themselves have zero type errors independent of the known B1-owned consumer.
set +e
WORKTREE="C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane"
EVIDENCE="$WORKTREE/角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-A1-evidence"
LOG="$EVIDENCE/06-scoped-typecheck.log"
cd "$WORKTREE" || exit 99
{
  echo "cwd: $(pwd)"
  echo "command: npx tsc --ignoreConfig --noEmit --target esnext --lib esnext --module nodenext --moduleResolution nodenext --strict --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax --erasableSyntaxOnly --isolatedModules --resolveJsonModule --forceConsistentCasingInFileNames --types node src/model/directive-marker.ts src/model/directive.ts src/model/runtime.ts src/model/project-state.ts test/runtime-core/directive-marker.test.ts test/runtime-core/directive-contract.test.ts"
  echo "start: $(date -Iseconds)"
} > "$LOG"
npx tsc --ignoreConfig --noEmit --target esnext --lib esnext --module nodenext --moduleResolution nodenext --strict --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax --erasableSyntaxOnly --isolatedModules --resolveJsonModule --forceConsistentCasingInFileNames --types node src/model/directive-marker.ts src/model/directive.ts src/model/runtime.ts src/model/project-state.ts test/runtime-core/directive-marker.test.ts test/runtime-core/directive-contract.test.ts >> "$LOG" 2>&1
CODE=$?
{
  echo "exit_code: $CODE"
  echo "end: $(date -Iseconds)"
} >> "$LOG"
exit "$CODE"
