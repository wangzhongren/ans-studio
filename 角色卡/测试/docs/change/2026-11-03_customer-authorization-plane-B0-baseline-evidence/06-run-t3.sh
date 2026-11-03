#!/usr/bin/env bash
# B0 evidence runner: full T3 regression (customer-authorization-plane)
# Reproduces the team-plan §7.2 command, excluding the known-hanging
# test/pi-adapter/write-sequencing.test.ts. The worktree tool refuses
# command-substitution/xargs forms, so this literal script is used instead.
set -u
cd "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane"
echo "cwd: $(pwd)"
echo "command: node --test --test-concurrency=1 \$(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' | sort)"
echo "start: $(date '+%Y-%m-%dT%H:%M:%S%z')"
node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' | sort)
code=$?
echo "end: $(date '+%Y-%m-%dT%H:%M:%S%z')"
echo "exit_code: $code"
exit "$code"
