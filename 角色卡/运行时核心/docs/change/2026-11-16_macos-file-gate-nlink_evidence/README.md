# 证据索引 — 2026-11-16 macOS file-gate nlink 修复

记录：`../2026-11-16_macos-file-gate-nlink.md`

- `01-product-diff.txt`：写入面 `git status`、`git diff -- src/provider/trunk/impl/git-command.ts`、
  产品与新增回归钉 sha256。
- `02-regression-pin-pre-fix-red.txt`：修复前（HEAD `d1f256f` 原文）运行回归钉；目录 nlink 模拟项
  `false !== true`（EXIT=1）。捕获方式：临时还原产品文件 → 运行 → 从备份恢复（恢复后 sha256 与
  补丁态 `3227f37c…` 一致）。
- `03-regression-pin-post-fix-3x.txt`：修复后回归钉 3×（RUN1/2/3 EXIT=0）。
- `04-typecheck.txt`：`npm run typecheck` EXIT=0。
- `05-git-command-test.tap`：`test/编排/git-command.test.ts`，17 tests / 17 pass。
- `06-provider-trunk-related.tap`：`readonly-git-transport`、`trunk-store`、`git-trunk-store`、
  `git-capability-tools`、`project-root-canonicalization`、`write-gate-context`、`trunk-contract`、
  `session-lifecycle` 合并 TAP：123 tests / 115 pass / 8 fail；8 名全部命中冻结 runtime-core-33
  基线（`角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b0_evidence/04a-knownred-runtime-core-33.txt`），
  基线外新增 0。
- `07-runtime-core-full.tap`：`test/runtime-core/*.test.ts` 全量（`--test-concurrency=1`）：
  607 tests / 570 pass / 33 fail / 4 skipped。
- `07-runtime-core-knownred-diff.txt`：实际失败名 vs 冻结 33 名，`diff` 为空；并记录产品 sha256。
- `08-nlink-simulation-post-fix.txt`：编排角色模拟脚本（真实 provider 函数）修复后输出：
  present-repo 模拟根 nlink+1 = `true`（修复前为 `false`，见编排
  `_evidence/03-nlink-simulation-output.txt`）。
