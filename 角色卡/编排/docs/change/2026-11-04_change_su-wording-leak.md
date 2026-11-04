# 运行期文本「su」表述泄漏修复——编排变更记录（2026-11-04）

- 角色：编排（orchestration）
- 依据：`docs/communication/2026-11-04_issue-su-wording-leak-in-runtime-texts.md`（客户直修：文案级，不改任何权限/门禁逻辑）
- 分支/基线：`feat/download-requests` @ `c2f1630`（与 origin/main 同一提交）
- 未提交：未 commit / push / 发布

## 0. 工作区说明（与任务指定的偏差，如实披露）

任务指定的新 worktree `su-wording-fix` 已创建，但本子会话被 harness 隔离在 `.claude/worktrees/download-requests`（写入硬限制、且新 worktree 无 `node_modules`）。
实际修改落在本会话 worktree；详见同批 `角色卡/运行时核心/docs/change/2026-11-04_change_su-wording-leak.md` §0。该 worktree 另含 download-requests 任务的既有未提交改动，与本修复无关。

## 1. 根因

trio 无 `su`，但判断器系统提示、CLI 操作者提示、派发回执与 bootstrap 留痕文案仍把 `su` 写成动作主体，模型/用户读到后复述为「须由 su 确认」。

## 2. 改动清单（逐处 before → after）

| 文件:位置 | before | after |
| --- | --- | --- |
| `src/common/编排/shell-judge-prompt.ts:68` | `【deny 档（su 审批档）特殊规则】` | `【deny 档（治理审批档）特殊规则】` |
| `src/common/编排/governance-judge-prompt.ts:136` | `…不得选内置治理角色（chief/product/rapporteur/nominator/convener/verifier/su）。` | `…不得选内置治理角色（chief/product/rapporteur/nominator/convener/verifier）。` |
| `src/common/编排/finalize.ts:242` | `无可 pin 的边界文件（su 尚未写出…）` | `无可 pin 的边界文件（治理角色尚未写出…）` |
| `src/common/编排/finalize.ts:1681-1683` | `在 su 的治理会话 settle 之后生成（su 不会算 hash…）`；`每轮 su settle 后自动刷新`；`非经 su 会话…下一次 su settle 会吸收进 pin` | 同一语义，主体改为「治理会话 / 治理角色」：`在治理会话 settle 之后生成（治理角色不会算 hash…）`；`每轮治理会话 settle 后自动刷新`；`非经治理会话…下一次治理会话 settle 会吸收进 pin` |
| `src/common/编排/handback.ts:374` | `（不静默；su 修正后重派）` | `（不静默；派发主人修正后重派）` |
| `src/common/编排/handback.ts:487` | `投递结果/失败会在其聊天流与 su 的聊天流如实显示` | `投递结果/失败会在其聊天流与派发者的聊天流如实显示` |
| `src/common/编排/operator-channel.ts:111` | `(su 审批档：客户逐条批准，不走 (b) 审读)` | `(治理审批档：客户逐条批准，不走 (b) 审读)` |
| `src/pipeline/orchestration/run-role.ts:2238` | `targetRoleId=… 是内置治理角色/su，appointment-write 只能写项目角色` | `targetRoleId=… 是内置治理角色，appointment-write 只能写项目角色` |

### 2.1 `watchdog.ts` 核查结论（任务列出的泄漏源 #3）

`src/common/编排/watchdog.ts` 的 `WATCHDOG_PROMPT_GUIDELINES` **三条正文本身不含「su」**（`:287-289` 已是「你判断 / 幕僚终止 / 不得假设写权」等中性表述）；
`WATCHDOG_DISCIPLINE_LINE` 亦为中性。文件中出现「su」的位置均为历史/说明注释（`:11`、`:42-43`、`:281-285`），按任务要求**保留**。故本文件无活文本改动。

### 2.2 测试同步（仅同步文案断言，不放宽行为断言）

- `test/编排/handback.test.ts:599`：期望子串改为 `投递结果/失败会在其聊天流与派发者的聊天流如实显示`。
- `test/编排/shell-operator-only.test.ts:273`：正则改为 `/治理审批档：客户逐条批准，不走 \(b\) 审读/`。

## 3. 保留项（未改，逐项）

1. `src/common/编排/shell-gate.ts`：**su 只读档**代码与其术语（`:697` `（su 只读档）`、`:699` `（su 审批档）`、`:826-827`/`:921-922` 的 su 只读策略文案）——按任务保留；这些路径仅 su 会话使用。
2. `src/common/编排/shell-judge-verdict.ts:25` 的 `"su-审批档"` policy 标识符；`SU_APPROVAL_REASON_PREFIX = "su-审批档"`（`shell-gate.ts:223`）——代码字符串，桌面按前缀解析，未改。
3. `src/common/编排/workflow-preconditions.ts:134/:214` 保留 id 名单（含 `su`/`liaison`）。
4. `src/common/编排/governance-judge-verdict.ts:50/:100` 的 `"su"`/`"角色卡/su/"` 内部判定名单/路径。
5. `src/common/编排/handback.ts:419` 的 `sourceRoleId ?? "su"` 缺省值——single/su 旧文案与行为逐字不变。
6. 所有历史/说明注释（含 `finalize.ts:30/:156/:235-236`、`handback.ts:186/:299/:384/:448`、`operator-channel.ts:106-107`、`watchdog.ts` 注释等）。

## 4. 测试与证据（原始结果）

证据目录：`角色卡/编排/docs/change/2026-11-04_change_su-wording-leak-evidence/`

| 命令 | 原始结果 | 日志 |
| --- | --- | --- |
| `node --test test/编排/*.test.ts test/桌面UI/judge.test.ts test/项目管理/shared/i18n-guard.test.ts test/项目管理/shared/i18n.test.ts test/桌面UI/i18n-b1-b2.test.ts test/桌面UI/i18n-view.test.ts test/测试/i18n-integration.test.ts` | tests 800 / pass 799 / fail 1 / skipped 0 / duration_ms 1846.0487 | `orchestration-and-i18n-test.log` |
| `node --test test/桌面应用/watchdog-reuse.test.ts test/测试/g2-verify/*.test.ts test/门禁引擎/su-turn-watch-convention.test.ts test/门禁引擎/su-doc-surface-convention.test.ts test/测试/shell-judge-verify/*.test.ts test/测试/su-shell-approval-verify/*.test.ts test/桌面应用/operator-channel.test.ts` | tests 167 / pass 167 / fail 0 / skipped 0 / duration_ms 1318.9951 | `watchdog-shell-judge-approval-test.log` |
| `node --test test/桌面UI/*.test.ts` | tests 405 / pass 405 / fail 0 / skipped 0 / duration_ms 702.1378 | `desktop-ui-test.log` |
| `node --test test/编排/*.test.ts`（run-role 修改后复跑） | tests 757 / pass 756 / fail 1 / skipped 0 / duration_ms 1745.8035 | `orchestration-rerun-after-run-role.log` |
| `node --test test/门禁引擎/su-*.test.ts`（保留项回归） | tests 26 / pass 26 / fail 0 / skipped 0 / duration_ms 134.88 | `gate-engine-su-convention-test.log` |
| `npm run typecheck` | 退出码 0 | 见运行时核心证据目录 `typecheck.log` |

唯一失败的 1 项为 **Windows 符号链接 EPERM 环境限制**（`test/编排/shell-authorized-routine.test.ts:184` 的 `symlinkSync`），与本次文案改动无关。

## 5. 候选哈希（sha256，2026-11-04 写定）

- `src/common/编排/shell-judge-prompt.ts`：`28fdb0dc6ca535eb1d340e990b700a4c34f4dd31812a9d8a2875932027bf8332`
- `src/common/编排/governance-judge-prompt.ts`：`95054781594fec2aef5911647a846675bea61ec4e3eb85dab8c9f4a2a9e6c968`
- `src/common/编排/finalize.ts`：`c071d4c5cf19c5e309170d8d9d1646ef2c75022ad91092a995893cbc57005711`
- `src/common/编排/handback.ts`：`8ad1ea8fc51b311125e5f45c5374c90cc9d34cdf60da19cb1984f5aae818fcbd`
- `src/common/编排/operator-channel.ts`：`2d1cfac84ccaf8b240ede886e6ff05c2342c02a4982dc1f488345921d5a6b7fe`
- `src/pipeline/orchestration/run-role.ts`：`499e79219c39d399a8383b903af921bc96b0e60280216768ea3f736d64e143bb`
- `test/编排/handback.test.ts`：`592203ba0739355ed39fd1ecb513ed276447874ba645e3cc7c971936ffa86543`
- `test/编排/shell-operator-only.test.ts`：`8a0c5d3c9551fad4f1f74768f03d9623e584a9260914d3e9bbad409866d0ccde`
- 证据日志与本记录自身哈希随最终回报给出。

## 6. 风险与披露

- `shell-gate` 的 su 只读档文案按任务保留，仍含「su」；它只在 single/su 会话出现，不影响 trio。
- 未改任何判定/放行/门禁逻辑；判断器仍按原 rubric 工作，仅提示词中的档位称呼中性化。
- 未运行 `npm install`、未启动 Electron。
