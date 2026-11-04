# 运行期文本「su」表述泄漏修复——运行时核心变更记录（2026-11-04）

- 角色：运行时核心（runtime core）
- 依据：`docs/communication/2026-11-04_issue-su-wording-leak-in-runtime-texts.md`（客户直修：文案级，不改任何权限/门禁逻辑）
- 分支/基线：`feat/download-requests` @ `c2f1630`（与 origin/main 同一提交）
- 未提交：未 commit / push / 发布

## 0. 工作区说明（与任务指定的偏差，如实披露）

任务要求使用新 worktree `su-wording-fix`（分支 `fix/remove-su-from-runtime-texts`，基于 origin/main `c2f1630`）。该 worktree 已成功创建于
`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\su-wording-fix`，但本子会话被 harness 隔离在
`.claude/worktrees/download-requests`，**写入被硬限制在该目录**（EnterWorktree 切换被拒、Edit 到 su-wording-fix 被拒），且该新 worktree 不含 `node_modules`，无法跑测试。
因此实际修改落在本会话 worktree `.claude/worktrees/download-requests`（同一提交 `c2f1630`）。
该 worktree 内另有 download-requests 任务的既有未提交文档/角色卡改动，与本修复无关；本记录只列本修复触碰的文件。

## 1. 根因

trio 治理模型（`src/service/role/resolve-role.ts:10`：single→su；trio→chief/product/rapporteur/nominator/convener/verifier）
中不存在 `su`，但**模型可见的工具 schema 与 dispatch_task 成功回执**仍把 `su` 写成治理动作的主体；模型读到后复述为
「须由有权 su 确认」，导致 trio 内 chief/人事反复阻塞。

## 2. 改动清单（逐处 before → after）

### 2.1 `src/provider/runtime/schema.ts`

| 位置 | before（要点） | after（要点） |
| --- | --- | --- |
| `flowId`/`cardKind` 描述（约 :251/:264） | `Optional for ordinary project roles and single/su (legacy calls)` | `... and the legacy single-role governance model (legacy calls)` |
| request_confirmation 主描述（约 :281） | 「预授权例外（仅内置治理角色 su）」；`docs/su/**`（su 自己的工作笔记）、`docs/skills/**`（su 给角色安装…） | 「预授权例外（**仅内置治理角色**）」；`docs/su/**`（**内置治理角色**自己的工作笔记）、`docs/skills/**`（**内置治理角色**给其他角色安装…）；路径 `docs/su/**` 不变 |
| request_confirmation 主描述（约 :283） | 「须由 su 把变更呈给客户确认」 | 「须由**内置治理角色**把变更呈给客户确认」 |
| request_confirmation 主描述（约 :295） | 「普通项目角色与 single/su 的 …」 | 「普通项目角色与**旧治理模型（single）**的 …」 |
| request_confirmation promptGuidelines（约 :301） | 「预授权例外（仅内置治理角色 su）」 | 「预授权例外（**仅内置治理角色**）」 |
| request_confirmation promptGuidelines（约 :302） | 「须由 su 经 request_confirmation …」 | 「须由**内置治理角色**经 request_confirmation …」 |
| request_choice 主描述（约 :402） | 「仍由 su 请求客户确认」 | 「仍由**内置治理角色**请求客户确认」 |
| request_choice promptGuidelines（约 :415） | 「仍由 su 经 request_confirmation 请求确认」 | 「仍由**内置治理角色**经 request_confirmation 请求确认」 |
| submit_report 主描述（约 :451） | 「回交给 su 汇总」 | 「回交给**编排**汇总」 |
| dispatch_task `flowId` 描述（约 :516） | `legacy su calls may omit both` | `legacy single-model calls may omit both` |
| dispatch_task 主描述（约 :543） | 「仍由 su 请求客户确认」 | 「仍由**内置治理角色**请求客户确认」 |
| dispatch_task 主描述（约 :554） | 「旧 su 调用可缺席＝旧行为」 | 「**旧治理模型**调用可缺席＝旧行为」 |
| dispatch_task promptGuidelines（约 :558） | 「仍由 su 请求客户确认」 | 「仍由**内置治理角色**请求客户确认」 |

### 2.2 `src/provider/runtime/tools.ts`

- 约 :2226，dispatch_task **成功回执**：
  - before：`新建或扩张边界、治理写集仍由 su 请求客户确认`
  - after：`新建或扩张边界、治理写集仍由内置治理角色请求客户确认`
- 这是每次派发后模型必读的回执，是本缺陷最直接的泄漏源。

### 2.3 测试同步（仅同步文案断言，不放宽任何行为断言）

- `test/pi-adapter/dispatch-task.test.ts:108`、`:187`：正则由 `仍由 su 请求客户确认` 改为 `仍由内置治理角色请求客户确认`。

## 3. 保留项（未改，逐项）

1. **注释与历史说明**：`schema.ts` 约 :190-196（2026-10-16 客户裁定注释）、:468/:474（派发设计注释）、:657/:684（看护工具注释）、:780/:812/:840/:873（安装工具注释）；`tools.ts` 注释（:126/:2065/:2493/:2719 等）。按任务要求保留历史/说明注释。
2. **路径**：`docs/su/**` 四棵预授权目录路径本身未改（只中性化其描述）。
3. **内部标识符**：`SU_PREAUTHORIZED_WRITE_DIRS`、`SU_APPROVAL_REASON_PREFIX` 等代码字符串/常量名未改。
4. **single/su 逻辑**：`src/service/role/resolve-role.ts`、`workflow-preconditions.ts` 保留 id 名单（含 su/liaison）、`shell-gate` su 只读档代码与术语、`su-approval` policy 标识符均未触碰；single 模型行为不变。

## 4. 测试与证据（原始结果）

证据目录：`角色卡/运行时核心/docs/change/2026-11-04_change_su-wording-leak-evidence/`

| 命令 | 原始结果 | 日志 |
| --- | --- | --- |
| `node --test test/runtime-core/*.test.ts test/pi-adapter/dispatch-task.test.ts test/pi-adapter/governance-judge.test.ts` | tests 328 / pass 321 / fail 3 / skipped 4 / duration_ms 15759.0527 | `runtime-core-and-pi-dispatch-test.log` |
| `npm run typecheck`（`tsc --noEmit`） | 退出码 0，无诊断 | `typecheck.log` |

失败的 3 项均为 **Windows 符号链接 EPERM 环境限制**（`file-write-safety.test.ts`、`session-store.test.ts` 的 `symlink` 用例），与本次改动文案无关，也不涉及被改文件；其余 321 项通过。

## 5. 候选哈希（sha256，2026-11-04 写定）

- `src/provider/runtime/schema.ts`：`611a19a491bfd6b793edee0389dd2b6c49f2fc13d6bafa300d3ac59774f77b68`
- `src/provider/runtime/tools.ts`：`4039f62c2f340ee616066d2c87bb4e8915ec5fa23a078f37f4a1d64cc404f9d8`
- `test/pi-adapter/dispatch-task.test.ts`：`894d7b14098463b659fb562769bf986b4b4f8791501f500f6f53c4861afe4eb8`
- `.../runtime-core-and-pi-dispatch-test.log`：见最终回报（写定后计算）
- `.../typecheck.log`：见最终回报（写定后计算）
- 本记录自身：哈希无法自引用内嵌，随最终回报给出。

## 6. 风险与披露

- 本记录所在 worktree 含 download-requests 任务既有未提交改动；本修复未触碰其文件。最终交付/合并需由客户授权与独立验收决定。
- 未运行 `npm install`、未启动 Electron；`app/renderer/dist` 为既有构建产物，未重建。
- 文案改为「内置治理角色」后，single 模型（su）读到的是同一中性表述，语义仍正确；未改任何判定/授权路径。
