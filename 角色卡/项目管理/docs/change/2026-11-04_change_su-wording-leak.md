# 运行期/界面文本「su」表述泄漏修复——项目管理（共享 i18n）变更记录（2026-11-04）

- 角色：项目管理（project management，`src/common/shared/` 所有者）
- 依据：`docs/communication/2026-11-04_issue-su-wording-leak-in-runtime-texts.md`（客户直修：文案级，不改任何权限/门禁逻辑）
- 分支/基线：`feat/download-requests` @ `c2f1630`（与 origin/main 同一提交）
- 未提交：未 commit / push / 发布

## 0. 工作区说明（与任务指定的偏差，如实披露）

任务指定的新 worktree `su-wording-fix` 已创建，但本子会话被 harness 隔离在 `.claude/worktrees/download-requests`（写入硬限制、且新 worktree 无 `node_modules`）。
实际修改落在本会话 worktree；详见同批 `角色卡/运行时核心/docs/change/2026-11-04_change_su-wording-leak.md` §0。

## 1. 根因

i18n 文案值把 `su` 写成当前治理角色：确认卡徽标「su 审批」、判断器标题「SU 命令审批」、旧模型提示「（su）」、派发失败提示「trio 三人与 su」、恢复失效提示「让 su 重新提议」。
其中确认卡徽标与判断器标题由 `policy === "su-approval"` 触发——该 policy 在 trio 治理角色审批时同样使用，故用户可见文本会误导。

## 2. 改动清单（值 before → after，key 全部不变）

### 2.1 `src/common/shared/i18n/messages/zh-CN.ts`

| key | before | after |
| --- | --- | --- |
| `ui.judge.titleSu` | `SU 命令审批` | `治理命令审批` |
| `ui.confirm.suApprovalBadge` | `su 审批` | `治理审批` |
| `ui.governance.model.single` | `旧模型（su）` | `旧模型` |
| `ui.governance.legacyModelHint` | `本项目使用旧治理模型（su）。可升级为三权模型。` | `本项目使用旧治理模型。可升级为三权模型。` |
| `ui.judge.quickPathNote` | `…旧治理模型（single/su）的治理方向卡仍逐张确认…` | `…旧治理模型的治理方向卡仍逐张确认…` |
| `main.session.dispatchBuiltinTarget` | `派发未受理：{roleId} 是内置治理角色（trio 三人与 su 均不可被派发）——派发对象应是项目角色。` | `派发未受理：{roleId} 是内置治理角色——派发对象应是项目角色。` |
| `main.recovery.expired` | `…可让 su 重新提议。` | `…可让内置治理角色重新提议。` |

### 2.2 `src/common/shared/i18n/messages/en-US.ts`

| key | before | after |
| --- | --- | --- |
| `ui.judge.titleSu` | `SU command approval` | `Governance command approval` |
| `ui.confirm.suApprovalBadge` | `su approval` | `Governance approval` |
| `ui.governance.model.single` | `Legacy model (su)` | `Legacy model` |
| `ui.governance.legacyModelHint` | `This project uses the legacy governance model (su). It can be upgraded to trio.` | `This project uses the legacy governance model. It can be upgraded to trio.` |
| `ui.judge.quickPathNote` | `…under the legacy model (single/su)…` | `…under the legacy model…` |
| `main.session.dispatchBuiltinTarget` | `…(neither the trio nor su can receive dispatches)…` | `…is a built-in governance role — dispatch targets must be project roles.` |
| `main.recovery.expired` | `…— su may propose again.` | `…— the built-in governance role may propose again.` |

### 2.3 渲染层/测试引用

- `app/renderer/src/chat/judge.ts:88` 仍按 key `ui.judge.titleSu` 取文案；`ConfirmCard.tsx:339` 仍按 key `ui.confirm.suApprovalBadge` 取文案——**key 未改**。
- 同步测试断言（任务明确授权；仅改期望文案，不放宽行为断言）：
  - `test/桌面UI/judge.test.ts:198`：`shellConfirmTitle("su-approval","A")` 期望 `治理命令审批`。
  - `test/桌面UI/phase3b-electron-smoke.mjs:303`：标题期望 `治理命令审批`。
  - `test/桌面应用/e2e/uiux-v2.mjs:319/:321`：标题期望 `治理命令审批`。
  - 说明：这三个测试归属桌面UI/桌面应用角色；本任务直接授权「测试断言同步更新」，未改其行为断言。

## 3. 保留项（未改）

1. **key 名全部不变**（含 `ui.judge.titleSu`、`ui.confirm.suApprovalBadge`、`main.session.dispatchBuiltinTarget` 等），渲染层/测试对 key 的引用不动。
2. `policy === "su-approval"` 等代码标识符、CSS 类 `is-su-approval`、`sc-su-warning` 等内部标识符未改。
3. 其他 `single`/`trio` 模型术语保留（`single` 是治理模型名，不是角色名）。
4. 历史 i18n 映射证据（`角色卡/项目管理/docs/change/2026-10-23_change_i18n-b1-b4-keys-evidence/`）为历史记录，未回改。

## 4. 测试与证据（原始结果）

证据目录：`角色卡/项目管理/docs/change/2026-11-04_change_su-wording-leak-evidence/`

| 命令 | 原始结果 | 日志 |
| --- | --- | --- |
| `node --test test/项目管理/shared/i18n-guard.test.ts test/项目管理/shared/i18n.test.ts test/桌面UI/i18n-b1-b2.test.ts test/桌面UI/i18n-view.test.ts test/测试/i18n-integration.test.ts` | tests 36 / pass 36 / fail 0 / skipped 0 / duration_ms 477.651 | `i18n-test.log` |
| `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） | 退出码 0，无诊断 | `typecheck-renderer.log` |
| `npm run typecheck` | 退出码 0 | 见运行时核心证据目录 `typecheck.log` |

含 `test/桌面UI/judge.test.ts` 的更大批次（800 项）结果见编排记录：799 pass / 1 fail（Windows 符号链接 EPERM，环境限制）。

## 5. 候选哈希（sha256，2026-11-04 写定）

- `src/common/shared/i18n/messages/zh-CN.ts`：`71e8e5461ade7a479e1942a492ef9d4e10bce191b51b631b47b6b75bafb71bf5`
- `src/common/shared/i18n/messages/en-US.ts`：`5ac6fd9d8f6629f3ae5a68cf59e2ddd3edc8cb1a7a9defc7d29854c6d5c08542`
- `test/桌面UI/judge.test.ts`：`dd3cbc155c664e4e5721facfea01f2d7cfd213ebfbde7c5f5f8b9a30b656c626`
- `test/桌面UI/phase3b-electron-smoke.mjs`：`d3d4cd637f86aa66b77ef27349bb3abacc5ccfbe00ee85232d5d1cbed0a2ec21`
- `test/桌面应用/e2e/uiux-v2.mjs`：`981770d5d8a963638947ad08c8ed1e8568759401409933e35f7870ad016ee959`
- 证据日志与本记录自身哈希随最终回报给出。

## 6. 风险与披露

- `app/renderer/dist/` 为既有构建产物，未重建；发布 overlay 需在正式构建时重新打包。
- 改值不改 key，`translate(locale,key)` 调用方无需变更；若外部有按旧中文值做字符串匹配的脚本，需改按 key 匹配（仓库内未发现此类活代码）。
- 未运行 `npm install`、未启动 Electron。
