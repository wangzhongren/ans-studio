# 候选身份与独立复跑命令（2026-10-26 需求变更申请 v2 验收）

- worktree：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination`
- 分支：`feat/scaffold-first-governance`
- HEAD：`99bbbe2cda3be0fcd7c8d1e72189b6f530e8387e`（未提交候选）
- 冻结时刻：2026-10-26 22:00:24 +0800（Asia/Shanghai）
- 候选范围：40 个 tracked 改动文件（+3353/−102）+ 12 个未跟踪批次文件 = **52 文件**（排除 `.claude/`、`demos/`）
- 候选清单摘要：`00_candidate-manifest.sha256.txt` 的 SHA-256 =
  `fd95bf627532b96366637efd20cd292513a95978d369a835392018b9b2647c30`
  （清单逐行格式 `<sha256>  <path>`，经 `sha256sum` 计算；测试运行前后两次计算一致）
- 环境：Windows 11 Pro 10.0.26300；Node v24.22.1；npm 11.19.1；Git Bash

说明：验收期间工作树有并发在飞修复（21:52–21:59，门禁卡/运行时 schema/工具回执/测试把
「发起方自行 request_choice 发审批卡」改为「应用自动呈现、发起方不得重复发卡」）。本目录日志均为
**冻结快照**（22:00:24 之后）的产物；清单在全部测试完成后复算仍为同一摘要。

## 复跑命令与结果

| # | 命令 | 结果 |
| --- | --- | --- |
| 01 | `npm run typecheck` | **exit 0** |
| 02 | `npm run typecheck:renderer` | **exit 0** |
| 03 | `node --test "test/桌面应用/**/*.test.ts"` | **689 tests / 689 pass / 0 fail / 0 skip** |
| 04 | `node --test "test/编排/**/*.test.ts"` | **1016 / 1014 pass / 1 fail / 1 skip**（唯一红＝既有 Windows symlink EPERM：`test/编排/shell-authorized-routine.test.ts:103`，该文件零 diff） |
| 05 | `node --test "test/runtime-core/**/*.test.ts"` | **354 / 347 pass / 3 fail / 4 skip**（3 红均既有 Windows symlink EPERM：`file-write-safety.test.ts:97`、`session-store.test.ts:46`、`session-store.test.ts:58`；文件零 diff） |
| 06 | `node --test "test/门禁引擎/**/*.test.ts"` | **346 / 345 pass / 0 fail / 1 skip** |
| 07 | `node --test "test/项目管理/shared/**/*.test.ts"` | **209 / 204 pass / 0 fail / 5 skip**（含 i18n 契约、i18n 守卫） |
| 08 | `node --test "test/桌面UI/**/*.test.ts"` | **296 / 296 pass / 0 fail / 0 skip** |

定向复核（冻结快照）：

- `test/门禁引擎/requirement-change-cards.test.ts`：6/6
- `test/runtime-core/request-choice-decision-card.test.ts`：5/5
- `test/runtime-core/request-requirement-change-tool.test.ts`：10/10
- `test/编排/request-requirement-change.test.ts` + `requirement-change-judge-guidance.test.ts` + `decision-card.test.ts`：28/28

既有红基线核对：四个失败测试文件均 `git diff` 零改动，且失败原因为本机无法创建 symlink 的
`EPERM`（与 2026-10-22 起各批次登记的 Windows 基线一致），不属于本批。
