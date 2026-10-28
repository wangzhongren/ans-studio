# entry-role-minimal 批次 F：验收与收尾（change-package）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：F（验收与收尾）｜风险档位：**T3**
- 性质：实施候选的 change-package；**不是验收结论、不是发布决定**。独立验收按验收标准 F-01–F-08、FIN-01–FIN-10 判定。
- 隔离：worktree `.claude/worktrees/entry-role-minimal`；分支 `feat/entry-role-minimal`；本地逐批提交，不 push、不合并 main。
- 依据：E 批已判 pass（v4 报告 140 行 / `0b1fe68f…`，候选 `9a23b881025c786fcbf908b0246d29055b567848`）；团队计划 §4.6、验收标准 F-01–F-08、Delta-1/6。
- F 代码/测试提交：**`e008187`**（父 `9a23b88`）；F 文档提交见最终报告。
- 组合候选（代码/测试）：`e008187`，整树 `70412769a5b1876c289738d0793720422be5c557`；F 代码/测试 6 files / +643 / −12501。
- **最终组合候选（含 F 文档）：HEAD `044811f48cba849556ce76ca9cef9cd7c623b005`，整树 `8dcbdb8d4df197388ad284ec534e62289d40a974`；`8fc673e..044811f4` = 308 files = 87 A + 125 D + 96 M，+13594 / −131336；`git diff --binary 8fc673e 044811f4` sha256 `34b5d22189fae51f5182f6b929297c61dfd49d588f14e333a3bdc0eda5e6f408`；F 范围 `9a23b88..044811f4` = 21 files = 9 A + 12 M，+1125 / −12501。**

## 1. 目标与生效口径（F-01–F-08）

- **F-01 基线**：以 E 最终 HEAD `9a23b88` 为 F 基线（E 代码/测试内容仍为 `dfd7361a`；两者仅文档差异）。
- **F-02 写集**：代码/测试 6 文件——`app/desktop/interface.ts`、`app/desktop/session.ts`、`app/desktop/project.ts`（F-05/`@ts-nocheck` 清理授权）、`src/common/门禁引擎/governance-roles.ts`（F-05 无 liaison 清理）、`test/桌面应用/optional-acceptance.test.ts`（新增，Delta-1 第 15 文件）、`test/测试/governance-e2e-auto/i-full-chain.test.ts`（既有文件名收口，Delta-6）；文档——change-F、终态报告、三条方案处置、各属主 changelog/docs change、memo。未新增目录/依赖；`package.json`/`package-lock.json` 零改动。
- **F-03 验收调度**：幕僚调度验收（自行核对 `role_status` / 派 `review` 任务给质检）；验收申请由发起角色直接提交、客户/判断 agent 裁决；**无自动验收派发/gate**；幕僚不自收自验、不转发。`optional-acceptance.test.ts` 覆盖开关开/关（decision 组关闭 ⇒ 客户手选；开启 ⇒ judge 代批推荐项）与无自动验收（行为钉 + 源码钉）。
- **F-04 终态回归**：全量 + 双 typecheck + build + 真实 Electron + phase3b/phase5a 全通过；完整测试差异表见 §4。
- **F-05 无 legacy/零写入/隔离**：D-04 口径 `rg` 生产源码 **0 命中**；liaison 运行期别名 **0**（A 批 shim 已清）；目标项目/主检出前后快照一致；不 push/合并/发布；旧账本/flow 文件未写、未迁移。
- **F-06 三条在办方案**：`docs/planning/2026-10-28_entry-role-minimal-three-plans-disposition.md`（Q13 A 合并包；机器部分重审/取代；文档/文字原则按需保留；不写「关闭」）。
- **F-07 文档/changelog**：`project-rules` §二.13/15/16 已按 D 批治理变更修订，§二.9/11/12 不变（最终核对，无新增修改）；各属主 change/changelog；`docs/scheduling/memo.md`、`docs/acceptance/memo.md`；不新建角色卡目录；`角色卡/产品` 不改。
- **F-08 终态报告**：`docs/acceptance/entry-role-minimal-final-report-v1.md`（供独立验收终态判定；**不是**独立验收报告/结论；验收角色另写 `entry-role-minimal-final-acceptance-report-v1.md`）。

## 2. 生产代码与测试清理（`@ts-nocheck` 硬性）

- `app/desktop/interface.ts`：**13715 → 2389 行（−11326）**。删除 D 批过渡死代码：flow 状态视图/类型、治理记录预览/建立/重新接受/迁移方法、team-plan/role-cards/gate/ledger/acceptance-triage/acceptance-rework/boundary-change 机器、acceptance/post-write/zombie 探针、gate 审查路由与交接、requirement-change 之外的全部旧派发门；移除全部 D 批 `any` 兼容桩与 `@ts-nocheck`。保留：文档读取、listProject（governanceRecord 派生）、双 judge 开关、偏好、会话/任务/日志/终止/重派、图片、Pi 配置、看护起停、持久化、需求变更申请、投递恢复。
- `app/desktop/session.ts`：**6936 → 6116 行（−820）**。删除意图交接/澄清/恢复提议（工具已撤除）、acceptance/handback 回调、ledger/gate 旧派发路径、D 批 any 桩与 `@ts-nocheck`；路由改为 single=su / trio=chief 星形；保留任务/汇报主干、投递机、看护、技能/MCP、需求变更审批卡、日志/终止/重派。
- `app/desktop/project.ts`（−6）：删除 A 批旧 `liaison` `builtInRoles` 登记 shim（D 遗留）。
- `src/common/门禁引擎/governance-roles.ts`（−12）：删除旧 `liaison` 写归属指引来源与过时别名注释（无行为变化）。
- **真实 typecheck**：`npm run typecheck` 在无 `@ts-nocheck` 下 exit 0（`aee16865…`）；`session.ts`/`interface.ts` 头行 `@ts-nocheck` 均为 0；生产源码（`src/`+`app/`）`@ts-nocheck` 全仓 **0**。
- **test-only `@ts-nocheck` 例外登记**：`test/测试/redispatch-target-recompute.ts:1` 保留 `// @ts-nocheck`——该文件是 2026-10-23 旧 flow/账本机器的**一次性目标项目只读复算脚本**（非 `*.test.ts`、不被 `node --test` 收集、不被任何测试/产品代码 import；其依赖的 `governance-e2e-auto/fixture.ts` 已在 D 批删除，脚本已不可执行）。**范围=test-only 历史脚本；不影响生产 typecheck（`tsc` include 内因 nocheck 跳过该文件，生产源码 0 标记）**；不新增行为、不参与全量/候选。若验收要求全仓清零，需另开变更删除该历史脚本（超出 F-02 e2e 写集）。
- 测试：新增 `test/桌面应用/optional-acceptance.test.ts`（**4 tests**）；`i-full-chain.test.ts` **1 → 2 tests**（保留 D 最小系统全链 + 新增 F 幕僚调度验收/无自动验收终态）。测试文件 335 → **336**（执行 335，`write-sequencing` 按基线挂起排除）。

## 3. 验证（串行；环境 Windows 11 Pro 10.0.26300 / Node v24.22.1 / Electron 44.7.0）

- **规范全量**（排除基线挂起 `write-sequencing.test.ts`，与 S1/E 同口径）：`node --test --test-concurrency=1 <335 files>` → **2908 tests / 2878 pass / 12 fail / 18 skip**（exit 1，基线红）；日志 `%TEMP%\f-full-canonical.log`（sha256 `18a4415283ab5f2e929d75ffe84e63997a24b00c5e49fde5300a3c789a0d6be9`）。相对 E 基线 2903/2873/12/18 ⇒ **+5 tests / +5 pass、fail 0 增、skip 0 增**。
- 12 fail = 基线 16 红中复现的 9 Windows symlink EPERM + T1×3；无新增确定性失败。18 skip 与 E 一致（Windows 权限类 skip）。
- 参考：含 `write-sequencing.test.ts` 的探索跑 **2911/2881/12/18**（该文件 3 tests 通过后进程退出挂起为基线已知问题；不计入规范口径），日志 `f-full2.log`（`4c4eaa94…`）。
- **静态**：`typecheck` exit 0（`aee16865…`）、`typecheck:renderer` exit 0（`914780f6…`）、`build:renderer` exit 0（`ff7f1dd0…`；dist 不入候选）。
- **真实 Electron E2E**（临时夹具 `%TEMP%\ans-e2e-f-fixture-5mKJRC` 仅 `角色卡/桌面窗口/`；fresh userData；`ANS_E2E_OUTDIR=%TEMP%\ans-e2e-f-out-PnLKAL`）：exit 0；**`E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空；17/17 PNG**；`ROLE_COUNT=2`、`PRIMARY_ROLE_ID=su`、`BOOTSTRAP_PRIMARY=chief`、`BOOTSTRAP_ROLE_COUNT=6`；`OP_CANCEL_DECLINED=true`、`OPX_EXPIRED_HISTORY=true`、E_DIALOG/E_CHAT/E_LATER/E_TODO/E_TASK/E_ROLE_LOG 全 true；`GOVERNANCE_DISABLED_NO_AUTO_DISPATCH/NO_AUTO_SESSION/ZERO_WRITE=true`。报告 `report.txt` sha256 `2b73e5f6aee7b0613b484ce7977fa58e4ecf46e0d8c3a00917e956be8bcd775c`；截图清单聚合 sha256 `1618e8fa84c8eeed0d7a62fb3952a150fdd748e4e6e4f1863f8bcb67c4309030`。
- **phase3b smoke**：45 checks、`=false` 0、exit 0；日志 `67863821…`，report.json `2f98c884…`。
- **phase5a smoke**（E 文件名）：**30/30 checks、failures=0**；日志 `e35114cd…`，report.json `76dc0c91…`。
- **i18n**：无 F 改动；全量含 `i18n.test.ts`（`ui 850 / main 541 / shared 62 / preferences 3 = 1456`，parity/泄漏守卫）全过。

## 4. 测试差异合并视图（D/E/F）

### 4.1 汇总

| 批次 | 测试文件动作 | tests 变化 | 累计（规范口径） | 说明 |
| --- | --- | ---: | --- | --- |
| S1 基线 `8fc673e` | 409 枚举 / 408 执行（`write-sequencing` 挂起排除） | — | 4495 / 4460 / 16 / 19 | 基线 |
| D | 删除 104（119 表内 82 + 表外 22）、重写 22、保留复核 15、新增 1（D 专项 5 tests） | −1615 | 2880 / 2850 / 12 / 18 | 治理机器撤除；`change-D` §7 |
| E | 新增 6（dialog×4/role-log/i18n-b1-b2）、重写 `decision-card-view`、改 `ans-wiring`/`phase5a`/E2E；`operator-view`/`history-dedupe`/`role-status-view` 保留复核（E-02） | +23 | 2903 / 2873 / 12 / 18 | `change-E` §7 |
| F | 新增 `optional-acceptance`（4）、`i-full-chain` 1→2；执行 `write-sequencing` 不计入规范口径 | +5 | **2908 / 2878 / 12 / 18** | 本文件 §3 |

### 4.2 附录 A 119 闭环（D 最终处置即闭环；E/F 后仅两文件再动）

| # | 文件（`test/` 相对） | 预分类 / 批次 | D 最终处置 / 批次 | 用例数（前→后） | 说明 |
| ---: | --- | --- | --- | ---: | --- |
| 1 | `claude-adapter/session.test.ts` | 重写 / C | 保留（复核） / 前批完成 | 55 → 55 | 偏差：按 D 复核调整 |
| 2 | `codex-adapter/judge-governance.test.ts` | 保留（复核） / C | 保留（复核） / 前批完成 | 6 → 6 | 按附录 A |
| 3 | `pi-adapter/flow-tools.test.ts` | 删除 / D | 删除 / D | 4 → 0 | 按附录 A |
| 4 | `runtime-core/flow-tools.test.ts` | 删除 / D | 删除 / D | 11 → 0 | 按附录 A |
| 5 | `runtime-core/governance-flow-metadata.test.ts` | 删除 / D | 删除 / D | 14 → 0 | 按附录 A |
| 6 | `runtime-core/governance-judge.test.ts` | 重写 / C | 删除 / D | 14 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 7 | `runtime-core/liaison-handoff-tools.test.ts` | 删除 / D | 删除 / D | 10 → 0 | 按附录 A |
| 8 | `runtime-core/request-acceptance-tool.test.ts` | 删除 / D | 删除 / D | 9 → 0 | 按附录 A |
| 9 | `runtime-core/request-boundary-change-tool.test.ts` | 删除 / D | 删除 / D | 9 → 0 | 按附录 A |
| 10 | `runtime-core/request-choice-decision-card.test.ts` | 重写 / C | 删除 / D | 5 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 11 | `runtime-core/request-gate-review-tool.test.ts` | 删除 / D | 删除 / D | 11 → 0 | 按附录 A |
| 12 | `runtime-core/request-requirement-change-tool.test.ts` | 重写 / C | 重写 / D | 10 → 9 | 按附录 A |
| 13 | `runtime-core/shell-judge.test.ts` | 保留（复核） / C/D | 保留（复核） / 前批完成 | 8 → 8 | 按附录 A |
| 14 | `runtime-core/tools.test.ts` | 重写 / D | 删除 / D | 16 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 15 | `runtime-core/view-image-tool.test.ts` | 保留（复核） / — | 重写 / D | 20 → 19 | 偏差：按 D 复核调整 |
| 16 | `桌面UI/background-tasks.test.ts` | 保留（复核） / — | 保留（复核） / 前批完成 | 11 → 11 | 按附录 A |
| 17 | `桌面UI/decision-card-view.test.ts` | 重写 / E | 删除 / D | 9 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 18 | `桌面UI/flow-status.test.ts` | 删除 / D | 删除 / D | 9 → 0 | 按附录 A |
| 19 | `桌面UI/governance-view.test.ts` | 删除 / D | 删除 / D | 10 → 0 | 按附录 A |
| 20 | `桌面UI/history-dedupe.test.ts` | 重写 / E | 保留（复核） / 前批完成 | 4 → 4 | 偏差：按 D 复核调整 |
| 21 | `桌面UI/i18n-b1-b2.test.ts` | 重写 / A/E | 删除 / D | 5 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 22 | `桌面UI/judge.test.ts` | 重写 / A | 重写 / D | 7 → 7 | 按附录 A |
| 23 | `桌面UI/operator-view.test.ts` | 重写 / C/E | 重写 / D | 8 → 8 | 按附录 A |
| 24 | `桌面UI/role-status-view.test.ts` | 重写 / E | 保留（复核） / 前批完成 | 9 → 9 | 偏差：按 D 复核调整 |
| 25 | `桌面UI/role-view.test.ts` | 重写 / A | 保留（复核） / 前批完成 | 6 → 6 | 偏差：按 D 复核调整 |
| 26 | `桌面应用/acceptance-dispatch.test.ts` | 删除 / D | 删除 / D | 143 → 0 | 按附录 A |
| 27 | `桌面应用/dispatch-delivery.test.ts` | 重写 / B | 删除 / D | 56 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 28 | `桌面应用/genesis-bootstrap.test.ts` | 重写 / A | 保留（复核） / 前批完成 | 7 → 7 | 偏差：按 D 复核调整 |
| 29 | `桌面应用/handback-delivery.test.ts` | 重写 / B | 重写 / D | 18 → 18 | 按附录 A |
| 30 | `桌面应用/interface.test.ts` | 重写 / B→E | 删除 / D | 142 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 31 | `桌面应用/operator-channel.test.ts` | 重写 / C | 重写 / D | 53 → 53 | 按附录 A |
| 32 | `桌面应用/operator-wiring.test.ts` | 重写 / C/E | 删除 / D | 75 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 33 | `桌面应用/runtime-resolution.test.ts` | 重写 / B | 删除 / D | 14 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 34 | `桌面应用/session.test.ts` | 重写 / B/C | 删除 / D | 48 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 35 | `测试/g1-verify/g1-copy-and-nails.test.ts` | 删除 / D | 重写 / D | 6 → 5 | 偏差：D 保留/重写（保留能力按新语义落地） |
| 36 | `测试/governance-e2e-auto/a-proposal-write-auto.test.ts` | 删除 / D | 删除 / D | 2 → 0 | 按附录 A |
| 37 | `测试/governance-e2e-auto/acceptance-triage-e2e.test.ts` | 删除 / D | 删除 / D | 10 → 0 | 按附录 A |
| 38 | `测试/governance-e2e-auto/b-proposal-accept-timing.test.ts` | 删除 / D | 删除 / D | 3 → 0 | 按附录 A |
| 39 | `测试/governance-e2e-auto/c-appointment-timing.test.ts` | 删除 / D | 删除 / D | 4 → 0 | 按附录 A |
| 40 | `测试/governance-e2e-auto/d-dispatch-listing.test.ts` | 删除 / D | 删除 / D | 5 → 0 | 按附录 A |
| 41 | `测试/governance-e2e-auto/e-switch-matrix.test.ts` | 重写 / C/F | 删除 / D | 6 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 42 | `测试/governance-e2e-auto/f-acceptance-gate.test.ts` | 删除 / D | 删除 / D | 7 → 0 | 按附录 A |
| 43 | `测试/governance-e2e-auto/g-judge-timeout.test.ts` | 重写 / C/F | 删除 / D | 3 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 44 | `测试/governance-e2e-auto/i-full-chain.test.ts` | 重写 / F | 重写 / D | 4 → 1 | 按附录 A |
| 45 | `测试/governance-e2e-auto/j-intent-confirm.test.ts` | 删除 / D | 删除 / D | 4 → 0 | 按附录 A |
| 46 | `测试/governance-e2e-auto/k-governance-feedback.test.ts` | 删除 / D | 删除 / D | 1 → 0 | 按附录 A |
| 47 | `测试/governance-e2e-auto/l-crew-write-validation.test.ts` | 删除 / D | 删除 / D | 2 → 0 | 按附录 A |
| 48 | `测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts` | 删除 / D | 删除 / D | 6 → 0 | 按附录 A |
| 49 | `测试/governance-e2e-auto/m-lead-internal-choice.test.ts` | 删除 / D | 删除 / D | 4 → 0 | 按附录 A |
| 50 | `测试/governance-e2e-auto/n-invalid-governance-card.test.ts` | 删除 / D | 删除 / D | 9 → 0 | 按附录 A |
| 51 | `测试/governance-e2e-auto/o-slug-trailing-hyphen.test.ts` | 删除 / D | 删除 / D | 7 → 0 | 按附录 A |
| 52 | `测试/governance-e2e-auto/p-team-plan-guard.test.ts` | 删除 / D | 删除 / D | 2 → 0 | 按附录 A |
| 53 | `测试/governance-e2e-auto/q-role-granularity.test.ts` | 重写 / A | 删除 / D | 15 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 54 | `测试/governance-e2e-auto/r-mapreduce-parallel.test.ts` | 删除 / D | 删除 / D | 9 → 0 | 按附录 A |
| 55 | `测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts` | 删除 / D | 删除 / D | 10 → 0 | 按附录 A |
| 56 | `测试/governance-e2e-auto/t-gate-review-return-routing.test.ts` | 删除 / D | 删除 / D | 10 → 0 | 按附录 A |
| 57 | `测试/governance-judge-cards-verify/a-switch-matrix.test.ts` | 重写 / C | 删除 / D | 5 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 58 | `测试/governance-judge-cards-verify/b-card-kinds.test.ts` | 重写 / C | 删除 / D | 13 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 59 | `测试/governance-judge-cards-verify/c-fallback.test.ts` | 重写 / C | 删除 / D | 9 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 60 | `测试/governance-judge-cards-verify/d-audit-ledger.test.ts` | 重写 / C | 删除 / D | 4 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 61 | `测试/governance-judge-cards-verify/e-queue-once.test.ts` | 重写 / C/E | 删除 / D | 5 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 62 | `测试/governance-liaison-verify/a-roles-writes-caps.test.ts` | 删除 / D | 删除 / D | 8 → 0 | 按附录 A |
| 63 | `测试/governance-liaison-verify/b-intent-handoff.test.ts` | 删除 / D | 删除 / D | 13 → 0 | 按附录 A |
| 64 | `测试/governance-liaison-verify/c-clarification.test.ts` | 删除 / D | 删除 / D | 5 → 0 | 按附录 A |
| 65 | `测试/governance-liaison-verify/e-audit.test.ts` | 删除 / D | 删除 / D | 1 → 0 | 按附录 A |
| 66 | `测试/governance-liaison-verify/f-cli.test.ts` | 删除 / D | 保留（复核） / 前批完成 | 1 → 1 | 偏差：D 保留/重写（保留能力按新语义落地） |
| 67 | `测试/governance-trio-verify/a-listing-sessions-writes.test.ts` | 重写 / A | 删除 / D | 4 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 68 | `测试/governance-trio-verify/b-gates-dispatch-ledger.test.ts` | 删除 / D | 删除 / D | 7 → 0 | 按附录 A |
| 69 | `测试/governance-trio-verify/c-migration.test.ts` | 删除 / D | 删除 / D | 6 → 0 | 按附录 A |
| 70 | `测试/governance-trio-verify/d-single-compat.test.ts` | 重写 / D | 删除 / D | 5 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 71 | `测试/i18n-integration.test.ts` | 重写 / A/D/E | 保留（复核） / 前批完成 | 8 → 8 | 偏差：按 D 复核调整 |
| 72 | `测试/real-entry.test.ts` | 重写 / A | 保留（复核） / 前批完成 | 8 → 8 | 偏差：按 D 复核调整 |
| 73 | `测试/shell-judge-verify/f-readonly-sandbox.test.ts` | 保留（复核） / — | 重写 / D | 4 → 4 | 偏差：按 D 复核调整 |
| 74 | `测试/t9-block1-bootstrap.test.ts` | 重写 / A | 保留（复核） / 前批完成 | 11 → 11 | 偏差：按 D 复核调整 |
| 75 | `编排/acceptance-rework.test.ts` | 删除 / D | 删除 / D | 19 → 0 | 按附录 A |
| 76 | `编排/acceptance-triage-record.test.ts` | 删除 / D | 删除 / D | 17 → 0 | 按附录 A |
| 77 | `编排/acceptance-triage.test.ts` | 删除 / D | 删除 / D | 29 → 0 | 按附录 A |
| 78 | `编排/confirm-preview-completeness.test.ts` | 重写 / C | 重写 / D | 7 → 4 | 按附录 A |
| 79 | `编排/decision-card.test.ts` | 重写 / C | 重写 / D | 20 → 3 | 按附录 A |
| 80 | `编排/decision-evidence-packet.test.ts` | 重写 / C | 重写 / D | 20 → 4 | 按附录 A |
| 81 | `编排/decision-intent-drift.test.ts` | 重写 / C | 重写 / D | 5 → 5 | 按附录 A |
| 82 | `编排/directory-conformance.test.ts` | 删除 / D | 删除 / D | 15 → 0 | 按附录 A |
| 83 | `编排/dispatch-reads.test.ts` | 重写 / B | 保留（复核） / 前批完成 | 19 → 19 | 偏差：按 D 复核调整 |
| 84 | `编排/finalize.test.ts` | 重写 / D | 保留（复核） / 前批完成 | 9 → 9 | 偏差：按 D 复核调整 |
| 85 | `编排/flow-gate.test.ts` | 删除 / D | 删除 / D | 13 → 0 | 按附录 A |
| 86 | `编排/flow-service.test.ts` | 删除 / D | 删除 / D | 89 → 0 | 按附录 A |
| 87 | `编排/flow-state.test.ts` | 删除 / D | 删除 / D | 64 → 0 | 按附录 A |
| 88 | `编排/governance-gate.test.ts` | 删除 / D | 删除 / D | 28 → 0 | 按附录 A |
| 89 | `编排/governance-judge.test.ts` | 重写 / C | 删除 / D | 82 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 90 | `编排/governance-ledger.test.ts` | 删除 / D | 删除 / D | 8 → 0 | 按附录 A |
| 91 | `编排/governance-migration.test.ts` | 删除 / D | 删除 / D | 13 → 0 | 按附录 A |
| 92 | `编排/governance-record-ledger.test.ts` | 删除 / D | 删除 / D | 1 → 0 | 按附录 A |
| 93 | `编排/governance-session.test.ts` | 删除 / D | 删除 / D | 39 → 0 | 按附录 A |
| 94 | `编排/liaison-handoff.test.ts` | 删除 / D | 删除 / D | 15 → 0 | 按附录 A |
| 95 | `编排/liaison-session.test.ts` | 删除 / D | 删除 / D | 12 → 0 | 按附录 A |
| 96 | `编排/report-artifact.test.ts` | 删除 / D | 删除 / D | 3 → 0 | 按附录 A |
| 97 | `编排/request-acceptance.test.ts` | 删除 / D | 删除 / D | 2 → 0 | 按附录 A |
| 98 | `编排/request-boundary-change.test.ts` | 删除 / D | 删除 / D | 3 → 0 | 按附录 A |
| 99 | `编排/request-gate-review.test.ts` | 删除 / D | 删除 / D | 2 → 0 | 按附录 A |
| 100 | `编排/request-requirement-change.test.ts` | 重写 / C | 重写 / D | 5 → 5 | 按附录 A |
| 101 | `编排/requirement-change-judge-guidance.test.ts` | 重写 / C | 删除 / D | 3 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 102 | `编排/section1-write-preauthorization.test.ts` | 保留（复核） / — | 重写 / D | 5 → 5 | 偏差：按 D 复核调整 |
| 103 | `编排/shell-readonly.test.ts` | 保留（复核） / — | 保留（复核） / 前批完成 | 9 → 9 | 按附录 A |
| 104 | `编排/team-plan.test.ts` | 删除 / D | 删除 / D | 32 → 0 | 按附录 A |
| 105 | `编排/view-image.test.ts` | 保留（复核） / — | 重写 / D | 3 → 3 | 偏差：按 D 复核调整 |
| 106 | `装配/govern-target.test.ts` | 重写/删除 / D | 重写 / D | 11 → 11 | 按附录 A |
| 107 | `装配/release-packaging.test.ts` | 重写 / D | 重写 / D | 9 → 9 | 按附录 A |
| 108 | `门禁引擎/customer-card-rules.test.ts` | 重写 / C | 删除 / D | 6 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 109 | `门禁引擎/decision-card.test.ts` | 重写 / C | 重写 / D | 5 → 4 | 按附录 A |
| 110 | `门禁引擎/gate-review-flow-busy.test.ts` | 删除 / D | 删除 / D | 3 → 0 | 按附录 A |
| 111 | `门禁引擎/governance-standard-workflow.test.ts` | 删除 / D | 删除 / D | 28 → 0 | 按附录 A |
| 112 | `门禁引擎/governance-trio.test.ts` | 重写 / A | 删除 / D | 51 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 113 | `门禁引擎/liaison-role.test.ts` | 重写/退役 / A | 删除 / D | 13 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 114 | `门禁引擎/list-project.test.ts` | 重写 / A | 重写 / D | 15 → 15 | 按附录 A |
| 115 | `门禁引擎/requirement-change-cards.test.ts` | 重写 / C | 删除 / D | 6 → 0 | 偏差：D 删除（旧断言绑定已撤除机器/旧 UI/旧注入）；E/F 按新语义重写 |
| 116 | `门禁引擎/screenshot-only-evidence.test.ts` | 删除 / D | 删除 / D | 5 → 0 | 按附录 A |
| 117 | `门禁引擎/verifier-artifact-report.test.ts` | 删除 / D | 删除 / D | 5 → 0 | 按附录 A |
| 118 | `门禁引擎/view-image-cards.test.ts` | 保留（复核） / C | 重写 / D | 5 → 3 | 偏差：按 D 复核调整 |
| 119 | `项目管理/shared/i18n.test.ts` | 重写 / A/B/C/D/E | 重写 / D | 65 → 6 | 按附录 A |

> **E/F 后补充**：`i18n.test.ts`（#119）E 批更新计数至 `ui 850 / 总 1456`；`i-full-chain.test.ts`（#44）F 批由 1 test 扩至 2（新增「幕僚调度验收/无自动验收」终态）。其余 117 个文件 E/F 未再变动（E 的 11 个测试文件见表 4.3）。附录 A 预分类 = 删除 58 / 重写 50 / 保留（复核）9 / 重写或删除 1 / 重写或退役 1；D 最终 = 删除 82 / 重写 22 / 保留复核 15；偏差逐文件见 `change-D` §7（理由：机器整体撤除后预分类「重写」多数无对象；保留能力测试已恢复/重写）。

### 4.3 E 批 11 个测试文件

| # | 文件（`test/` 相对） | 动作 | tests / checks |
| ---: | --- | --- | ---: |
| 1 | `桌面UI/decision-dialog.test.ts` | 新增 | 5 |
| 2 | `桌面UI/dialog-queue.test.ts` | 新增 | 3 |
| 3 | `桌面UI/dialog-a11y.test.ts` | 新增 | 5 |
| 4 | `桌面UI/dialog-history.test.ts` | 新增 | 2 |
| 5 | `桌面UI/role-log-view.test.ts` | 新增 | 3 |
| 6 | `桌面UI/i18n-b1-b2.test.ts` | 新增 | 2 |
| 7 | `桌面UI/decision-card-view.test.ts` | 重写 | 2 |
| 8 | `桌面应用/ans-wiring.test.ts` | 修改 | 7 |
| 9 | `项目管理/shared/i18n.test.ts` | 修改（计数 1456） | 6 |
| 10 | `桌面UI/phase5a-electron-smoke.mjs` | 重写（既有文件名） | 30 checks |
| 11 | `桌面应用/e2e/main.mjs` | 重写模态语义 + hardChecks | E2E_PASS（13 hardChecks） |

### 4.4 F 批测试变更

| # | 文件 | 动作 | tests | 说明 |
| ---: | --- | --- | ---: | --- |
| 1 | `桌面应用/optional-acceptance.test.ts` | 新增（Delta-1） | 4 | 幕僚调度验收/无自动机器/开关关/开关开 |
| 2 | `测试/governance-e2e-auto/i-full-chain.test.ts` | 重写收口（既有文件名） | 1 → 2 | D 全链 + F 终态（review 任务→回交→无自动验收） |

### 4.5 E-02 保留复核解释

E 批计划写「重写」的 `operator-view`/`history-dedupe`/`role-status-view` 三文件实际行为在 E 未变化（D 末尾已按新语义重写/复核通过），故 E 保留复核、断言数不变（8/4/9）；E-02 偏差已在 `change-E` §7 记录，F 不重复改动。E 的 11 个测试文件与 F 的 2 个文件合计 13 个 E/F 触及文件，其余 D 表内文件保持 D 最终处置。

### 4.6 E2E 36/40 口径

- E 最终 E2E 报告实际 `=false` 共 **36 项**（40 行分类表；36 项逐条见 `change-E` §6），全部为旧快照/旧夹具（C4 单/旧项目、旧聊天卡/工具行/Markdown/链接、旧徽标/分组等），非 E/F 核心；E-03/E-04/E-05/E-06 关键项全 true 且已纳入 hardChecks。
- F 终态 E2E `E2E_PASS=true`、`E2E_FAILURES=` 空；同口径 36 项仍为 false（非阻断、F 未新增/放大）；F 新增的验收/无自动派发检查以 `GOVERNANCE_DISABLED_NO_AUTO_DISPATCH/NO_AUTO_SESSION/ZERO_WRITE=true` 与 `optional-acceptance` 单测双证。

### 4.7 任务/日志真实夹具 smoke

- phase5a（真实 Electron + 假 IPC）30/30：`任务/日志面板存在`、`角色日志徽标/视图存在`、决策对话框/待办/历史/输入中断/无障碍/过期历史全过；F 复跑 failures=0。
- E2E 终态：`E_TASK_PANEL_VISIBLE=true`、`E_ROLE_LOG_VIEW_VISIBLE=true`，任务卡/日志入口在真实渲染进程可见；`optional-acceptance` 以真实 SessionManager 夹具验证 `tasks.jsonl` 任务落盘、回交只回幕僚、无自动验收任务。

### 4.8 i18n 1456/parity

- F 未改 i18n/文案键：`ui 850 / main 541 / shared 62 / preferences 3 = 1456`；zh/en parity、en-US 泄漏 0、旧 flow/triage/gate/ledger/acceptance/liaison key 0（全量 `i18n.test.ts` 通过）。

## 5. 无 legacy / 零写入 / 隔离（F-05）

- `rg`（D-04 口径，`src/`+`app/`，排除 `dist`/`node_modules`）：`governance-gate|governance-ledger|flow_get|flow_step_update|flow_step_supersede|flow-service|flow-state|team-plan|acceptance-triage|acceptance-rework|request_acceptance|request_gate_review|request_boundary_change|hand_off_intent|request_clarification|schedule-write|report_artifact_ready|docs/flows/|ledger\.jsonl` ⇒ **0 命中**。
- liaison 运行期别名：`governanceRoleOf("liaison")`/`builtInRoles.push("liaison")`/legacy alias 分支 ⇒ **0**；保留 id 冲突跳过仅为旧目录防御（非别名）。
- 心跳/`report_progress`：无工具/机制；源码仅两处「不得当心跳/无心跳」负向说明。
- **目标项目/主检出零写入**：主检出 `C:\Users\51054\Desktop\work\ans-studio` 前后快照 status/HEAD/diff/index/stash 全同（实现侧零写入/零吸收；唯一后续 delta 为独立验收角色写入的 `docs/acceptance/entry-role-minimal-final-acceptance-report-v1.md`，非本实现上下文）；worktree 仅 F 写集文件变更；未打开/未枚举 `demos/`/`dragonball-*`（工作树无该目录；E2E 用独立临时夹具）。
- `package.json`/`package-lock.json` 零 diff；无新依赖/目录；不 push、不合并 main、不发布。

## 6. 三条在办方案处置（F-06）

- 记录：`docs/planning/2026-10-28_entry-role-minimal-three-plans-disposition.md`（策划）。要点：客户闸门 1 已确认 Q13 A「保持合并一包」；三条机器部分（性能 gate 检查、分阶段 flow/团队计划、项目架构 V4/团队计划/验收 ⑤）按本方案重审/取代、不实现；文档/文字原则按需保留；**不写「关闭」**；检索无残留依赖（§5 的 0 命中）。

## 7. 文档/角色卡/changelog 收口（F-07）

- `project-rules`：最终核对 §二.13/15/16 已按 D 批修订（decision 卡改为需该决定的内置角色直接提交、幕僚执行、移除 write/schedule-write 旧卡种），§二.9/11/12（ANS 交付流程）不变；F 无新增修改。
- 属主记录（本批新增）：桌面窗口、门禁引擎、测试、项目管理、独立验收的 `docs/change/2026-10-28_change_entry-role-minimal-F.md` 与 `changelog.md` 条目；统筹 change-F；策划处置记录；`docs/scheduling/memo.md`、`docs/acceptance/memo.md`。
- 不新建角色卡目录；`角色卡/产品` 不改；`角色卡/桌面窗口/boundary.{md,yaml}` 已含 `optional-acceptance.test.ts`（Delta-1，F 无边界变更）。

## 8. F 代码/测试候选逐文件哈希（`e008187`）

口径：`git hash-object`（提交 blob）与 `git cat-file blob <blob> | sha256sum`（提交字节；本文件工作区 LF 与提交一致）。

| 文件 | 状态 | git hash-object | sha256 |
| --- | --- | --- | --- |
| `app/desktop/interface.ts` | M | `86f55e3de636a39b6df1319cd850c8fd7716d3b1` | `42389b73ea665bca5718af2a33b87a71422660a911f6d4f69c1e40963f01c3cc` |
| `app/desktop/project.ts` | M | `b88bace7d199748ca32f254a8ff34e8a0e6bec3e` | `627542415fbff0499301b7f0e0ce0ca6fdf1bfe43a4c7e9ae49b0a4899e87342` |
| `app/desktop/session.ts` | M | `4299a22faf5f58b2889bb8793fa7b677e2b9c8de` | `f8458061804525124865482acbe8eb3362e402098815765ae17ab92e19064e3b` |
| `src/common/门禁引擎/governance-roles.ts` | M | `49f9610aec1bda417d319241dea2e928f3ce9551` | `c1d92149e6f9492a6942fdfbaa49d56ab9452aef807cfa41e82769169159eeeb` |
| `test/测试/governance-e2e-auto/i-full-chain.test.ts` | M | `2434932c35a1e27bcbfdd43b326273aaeb132432` | `5bc184945ce01009b311adab0a72715d19c126af4362dbc8f3daa2a6323b3f13` |
| `test/桌面应用/optional-acceptance.test.ts` | A | `26c374e67ba9af3d03690f9f067b76166025178f` | `64bc2b4d1b621730e60d89a6796b337f67245ee0a1a251eef1d8962132a74fa4` |

统计：F 代码/测试 6 files = 5 M + 1 A；`+643 / −12501`；整树 `70412769a5b1876c289738d0793720422be5c557`。**最终组合候选 `044811f4` 的 308 文件逐文件 `git hash-object` + `sha256sum` 全表见 §10**（含 A/M 的 candidate blob 与 D 的基线 8fc673e blob）。`package.json`/lock 零改动。

## 9. 回滚 / 边界 / 已知限制

- **回滚**：`git revert e008187`（F 代码/测试）与 F 文档提交，重跑本批验证即可恢复 E 终态；无数据/schema 迁移；`.ans/state/tasks.jsonl` 可删除/忽略；旧账本/flow 文件未写、未迁移。
- **边界**：仅 F 写集内文件；`interface.ts`/`session.ts`/`project.ts`/`governance-roles.ts` 属 F-05/`@ts-nocheck` 清理授权（D 批遗留过渡死代码/别名），无新功能、无 API/契约新增；未改 `app/renderer/**`、其他 `src/**`、角色卡/边界、`package.json`/lock。
- **已知限制**：`write-sequencing.test.ts` 进程退出挂起为基线已知（3 tests 通过后不退出；规范口径按基线排除）；12 fail/18 skip 为基线既红/平台类；E2E 36 项旧快照 false 非阻断；无真实模型/网络/打包/发布验证（不属本程序）。

## 10. 最终组合候选 308 文件逐文件哈希（`044811f4`）

口径：`git diff --name-status -z 8fc673e 044811f4` = **308 行（87 A + 125 D + 96 M）**；A/M 行取候选 `044811f4` 的 `git ls-tree -r` blob，D 行取基线 `8fc673e` blob（候选已删除，供删除路径身份核对）；sha256 为 `git cat-file blob <blob>` 的提交字节。整树 `8dcbdb8d4df197388ad284ec534e62289d40a974`；完整 diff `34b5d22189fae51f5182f6b929297c61dfd49d588f14e333a3bdc0eda5e6f408`。**说明**：本表按 `044811f4` 实测并入 change-F；本次证据修订提交（终态 rework 收口）只改 change-F/终态报告/memo，不改代码/测试；表中 change-F/终态报告/memo 自身行为 `044811f4` 版本，修订后的最终数值见终态报告 §1 回执与 memo。

| # | 文件（仓库相对） | 状态 | git hash-object（candidate 044811f） | sha256（提交字节） |
| ---: | --- | --- | --- | --- |
| 1 | `app/desktop/artifact-report.ts` | D | `0631d20e9f74d2ed9310072eb07eaf08b4eaacd0`（基线 8fc673e blob） | `a17fa30210dbb1144dd7587aaa91c2d4301879d7fc68abd8bcedba1140b2ca0e` |
| 2 | `app/desktop/boundary-change.ts` | D | `6c2284278ad63b81e7a92675a2351791c1b5ccb7`（基线 8fc673e blob） | `a1594b8951c9c747240adc6d6e3b26084440e1834e5ea6a589b2337203b754a3` |
| 3 | `app/desktop/customer-input.ts` | M | `d2d7181e421412e2f9763df063fc56047cf9882d` | `8b33a550bfa96267f21064e3e9655c6da0d6889b3e4d12fe471048e29a393ccb` |
| 4 | `app/desktop/governance-advance.ts` | M | `49a5c54c9309a6c89d395a52b05af67c5a8ece28` | `fa5fb991c0020b5d59837dd997a929178c1637ba26d4c988fbf4515877bb8f9f` |
| 5 | `app/desktop/interface.ts` | M | `86f55e3de636a39b6df1319cd850c8fd7716d3b1` | `42389b73ea665bca5718af2a33b87a71422660a911f6d4f69c1e40963f01c3cc` |
| 6 | `app/desktop/project.ts` | M | `b88bace7d199748ca32f254a8ff34e8a0e6bec3e` | `627542415fbff0499301b7f0e0ce0ca6fdf1bfe43a4c7e9ae49b0a4899e87342` |
| 7 | `app/desktop/requirement-change.ts` | M | `f4f8839c8a42f4c810f551cda74ff725dc9c4533` | `e6694c529c36fa09d45cd9e1dc75dae485718237bfece96853a2083dd237748d` |
| 8 | `app/desktop/session.ts` | M | `4299a22faf5f58b2889bb8793fa7b677e2b9c8de` | `f8458061804525124865482acbe8eb3362e402098815765ae17ab92e19064e3b` |
| 9 | `app/desktop/watchdog.ts` | M | `d2cd848300f0c85876fd90690fd47b80a6b7c48f` | `bdae661f733af3725571bac122361d6599f894a9ba3b7064efb22af2dac1bf0e` |
| 10 | `app/desktop/write-preauthorization.ts` | M | `fe7fa2f1dd67d7e2b78234f3df1402b15ef38e5b` | `5f5865f18cbff46a02e4c415da794b51b91e9d1ed3c89568c6d296702b2e8ad7` |
| 11 | `app/main.ts` | M | `5ae62e753dda35f34f3c21d5524132c3a2fbbb75` | `c97f2d4186be9fa44e7f12c31aa7a4d6e7a5763f084e2c7e1bff8db9e8f35f42` |
| 12 | `app/preload.cjs` | M | `b491b9a3240115b67900c93f8ae961b3ca7f0e26` | `8614190931934ceda4ee68cfcbf7059beffca92faa623d04f8408b702f15fbbf` |
| 13 | `app/renderer/src/App.tsx` | M | `97e06f506d92c16d378579660b9d94f82ce0c102` | `1e442dbcbd3d574b51d2a20cbd38be0d97943bbd2e882d0d743fb81478420cd1` |
| 14 | `app/renderer/src/chat/ChatRow.tsx` | M | `0950a992ba7cb0106dd74b706d015ccdb500b74e` | `476fa4bce011d18e2807aa3408405bf45e1f2f0204e6ab95bb904f3b4836c2ba` |
| 15 | `app/renderer/src/chat/ChatStream.tsx` | M | `279221908c3bf3c2498c17e7ce26e5dcd478c8fa` | `20a9443bd5e6b3e4402d4a905001ce4f38e98774b1f3cd90a33dc5fddc8c8be9` |
| 16 | `app/renderer/src/chat/DecisionCenterPanel.tsx` | A | `b3ddb21411adec64de06444fa89dc373cd4eac6a` | `c6066d127b9bb014a12939cc4cdd25d8bb10b836e70c0f075e834e2be517796c` |
| 17 | `app/renderer/src/chat/DecisionDialog.tsx` | A | `2f5e12f914ca48dd5b6eb9ed744e8a0b8069cd54` | `fb5196bbaac32d76360cb0ab1466f4e86e04362509fb0332a49f54a1dceee5ab` |
| 18 | `app/renderer/src/chat/TaskCenterPanel.tsx` | A | `0005c8cb67150ca9fba9fa262b26802584dc5d60` | `91619d7839d46919b4d2e5d79ac313dc6c878901c38f2bd7bc76d5be07b5745f` |
| 19 | `app/renderer/src/chat/card-meta.ts` | A | `fddaff8cfa91dbeb3d1bca28c49d7138cfde68a0` | `7270f7ae046656fc4137381f988f8fbd13f64d650b7f2752d644c05667be6060` |
| 20 | `app/renderer/src/chat/chat-store.ts` | M | `4ccb05ded6f8ed9ace31782894fac469b7f9faaa` | `87b5dbcba4d2bbc3dea356165b2faf7ae2565d995ad4a42c361dcbe8255ebeb8` |
| 21 | `app/renderer/src/chat/decision-dialog.ts` | A | `f3352f142120a9da790a21cc433e712deb00620e` | `3dd969bff29f66817d691960de713be5c20a46582d99c7e52e8f497c0025c736` |
| 22 | `app/renderer/src/chat/extensions/governance.ts` | D | `0265d34b272e33c3b56d70b2877f239c39953dcb`（基线 8fc673e blob） | `ff288739cd958a7aff1335875cfb09abeab35b2b178558bc15d63bf8b9499027` |
| 23 | `app/renderer/src/chat/flow-status.ts` | D | `89cf5c733717fb39fb8a2efd85c67af509360599`（基线 8fc673e blob） | `ea8bf561ac2d5af457077a125b5ebbc393e8ae20c2160f7bdacf616068ff5e55` |
| 24 | `app/renderer/src/chat/governance-view.ts` | D | `f365befb78d70021370edecd405b99b1d11c873d`（基线 8fc673e blob） | `c01a9d0fdb2f70ca3f89f839c94a7afee5e7808bddf988da8e804a8eaab98a58` |
| 25 | `app/renderer/src/chat/ipc.ts` | M | `7be498dd30cb3ba721078241d34fcf6239d7f348` | `d8e4e857eb3b346647463a2393ec4aae2cb00c64bbe2fe86b6819d55ebd09bdd` |
| 26 | `app/renderer/src/chat/judge.ts` | M | `0063798cf1d5353b17675c03e8f8f5bcf525c265` | `663f3e9c988621fb0dfe0e86c401daf1c93e96410bb72838a56e5455d28bf76f` |
| 27 | `app/renderer/src/chat/operator-view.ts` | M | `9d9ed563fb9ce6be9b901a417a7831312d2f8e55` | `fae6d93e80559da5bd01e1d7f203eb09f17d053463c63c091a5a87212c8dd289` |
| 28 | `app/renderer/src/chat/role-log-view.ts` | A | `20ab996e582e082fa04100554bad07c8f77ca84d` | `0fc2b2b1335241fa67d64d065075f27cfa524c9de4d54c8dcab96d35dfffa60b` |
| 29 | `app/renderer/src/chat/role-view.ts` | M | `e0925eda7188fa549e903c3323a3f3e40c9279a1` | `d56f5b92a070150bddcba1151befcade18759d0454ca74ad18f32c75fb64fc0b` |
| 30 | `app/renderer/src/driver-extensions/governance.ts` | D | `99441ffcf84ec713d5ce44851460c113c6b9b96e`（基线 8fc673e blob） | `bfbc6503e4be0e2f2610381c3e4d77e1ebbf3dde80633204a43927bb5598325a` |
| 31 | `app/renderer/src/lib/platform.ts` | M | `f4ee9f35652150a411cfe5f753638755904e1cec` | `c47ee04416bacc18a83bed2180173fe7e5b4d56c0100e8899463c9aa530739a3` |
| 32 | `app/renderer/src/shell/ChatHeader.tsx` | M | `19b0f3aea98465df9e9d45139c44eef9e996b92a` | `680cd61c1e923700b9ef73cc831fa7cf4f4b617a61bf566e833aab2584fd5ed4` |
| 33 | `app/renderer/src/shell/Composer.tsx` | M | `c19e0565b4fc00fcd60522d46780306377a3da44` | `02d6acc2c4f381c13a60b90f4bbe070af611bcf4eb8d66c789fc0cc0c5342d80` |
| 34 | `app/renderer/src/shell/Drawer.tsx` | M | `71bee5e56e501b5d808338398d665fdcb82886d2` | `7ea558188e14b76f9b0db4886056514f7bbd3c9e35fae86b916f9d8f2b721adc` |
| 35 | `app/renderer/src/shell/FlowStatusPanel.tsx` | D | `ac947c9e560cb70b503b2930d004fbe3f04773d5`（基线 8fc673e blob） | `081e2186ea5a0e91f7ac0ba315d6186d08ea7de108044b556ce55d01500f3a06` |
| 36 | `app/renderer/src/shell/GovernancePanel.tsx` | D | `e09580982e2ddcf65652c026c87258d15894cc09`（基线 8fc673e blob） | `921585184253485d5a53487f17f10e81ad0c4862a5f18ae3d4e127dc47c98191` |
| 37 | `app/renderer/src/shell/WorkOverview.tsx` | M | `d2460aeb06642a7832649c4e325a2966b8722015` | `85405e816852abaa3bc4284ca77f92bd2c3e484c07255787a5ced99d1d3b41f0` |
| 38 | `app/renderer/src/shell/phase4a.css` | M | `143336416d3670471b7eecc3f28bc29135d38fa1` | `b8d4959e1dd7174f1e7177777a19cb0c110fb1a2f5870797a034edddb50866bf` |
| 39 | `app/renderer/src/stores/decision-center-store.ts` | A | `df0dca575c411787737344ad413b2f7460eeb9a4` | `58f5109823b6e02708b70f94ffaa8e0b01c22949bee395141bfe4da3ae22b5bd` |
| 40 | `app/renderer/src/stores/drawer-store.ts` | M | `fd5478a4908a2475338a8dd2508a882d52ca3239` | `98bf5ee144eb1c5ac47533a330fba054e63bff2cc9e6cfd5b57316344e678026` |
| 41 | `app/renderer/src/stores/flow-status-store.ts` | D | `03f9fceb88825ea11e6277a8c854a2a3b7455721`（基线 8fc673e blob） | `ec115ccefec5eaefdd5573c120c5b6f252d48239acdc54a9c6e6ec2d67ccb4de` |
| 42 | `app/renderer/src/stores/governance-store.ts` | D | `767bc5add7cd73ef3ab198cbb89260595d0d7d80`（基线 8fc673e blob） | `55da2612d0fb318f4c477fc3687192cd885176171c3097ea4c4bce5cd93d6a5e` |
| 43 | `app/renderer/src/test-driver.ts` | M | `926a438f373824ff9dfd4cfaf9c93727960c05ed` | `b245cc982cdc29e6bcb4dad5ac9a3314ffc32c83b0cb3e8d21a9a121babdcfcd` |
| 44 | `docs/acceptance/entry-role-minimal-final-report-v1.md` | A | `18399d5b903b122b8c84811682b158b9c5a8ba46` | `e8df25dfd2eae113f36a1007d441467d6f968eada578ca07f945282a95aa84e2` |
| 45 | `docs/acceptance/memo.md` | M | `fbbc84bda4ddcd1d92b4c1ab1e1d13d66a287fb7` | `0b350ed9110b5f152ea0a4b291bb39cb9d74e2e0c1758fc01f4e7d28c1dd773c` |
| 46 | `docs/planning/2026-10-28_entry-role-minimal-three-plans-disposition.md` | A | `c05108c9103bce0bbea22bbd7f4aba892d4869b3` | `50fe20ca779a2d1bf40c7e960731af15279a97cfb8ddfb53c8ac35ef51b483c4` |
| 47 | `docs/scheduling/2026-10-28-entry-role-minimal-change-A.md` | A | `26db7d8f24bdb7a411f67198cf9fa77c0a554cc1` | `dcad915d24e5c3cd038154475a088980da074aa05065d0fae4b4b7b0b0f37ffb` |
| 48 | `docs/scheduling/2026-10-28-entry-role-minimal-change-B.md` | A | `c512211e602a2cf71c6d7fbfc1cd831a1909c4e6` | `2a2ddbb9a549074abc51690e6baa8c1af4400dd65e1ab9cc4f31698fc78fb4d2` |
| 49 | `docs/scheduling/2026-10-28-entry-role-minimal-change-C.md` | A | `e2f43a24562626f4d42d30cefc1565c3c715ded7` | `d6a88a1c1f32f4c230f89a1a1232de1c3647b710ceb0d2e738a99d0b1a5f62b5` |
| 50 | `docs/scheduling/2026-10-28-entry-role-minimal-change-D.md` | A | `c9d005491fd43bf8aeae1e1f12f3f8c8fe81c477` | `4807383f63f9a99429cd3b821368b07cc7c1e3d101af7b7d961d8b8c4e6057b4` |
| 51 | `docs/scheduling/2026-10-28-entry-role-minimal-change-E.md` | A | `9277264dd31bf4b11e0ab969e44e8eeb16fcc670` | `b1080b354888faf7f77453274bf69f36e13960e94dd248caa4829f1f76531265` |
| 52 | `docs/scheduling/2026-10-28-entry-role-minimal-change-F.md` | A | `53a025a21831b3c432e35eb4632d652a7d58c176` | `4f9118bd4bd73c46e862ec2938aba31bb3b3e88c77c7cef808048e384594bd5a` |
| 53 | `docs/scheduling/2026-10-28-entry-role-minimal-gate2-amendment-2.md` | A | `64f237cfea811a9ce7e211bf33d26c2ca375b2c5` | `8d5ddeb5d45690d34ac5ef9031cae80768f47b8e07ecd37685d61e940395aaae` |
| 54 | `docs/scheduling/memo.md` | M | `02be350bc943c97b2cf0d6185d63be2f94c5dff0` | `014e4afda7322e30090a28d2fe828217537ac17bf161de174e21d20085829c97` |
| 55 | `src/common/runtime-core/shell-judge/policy.ts` | M | `ee60b2d4b80fa9de3c316c201a9068ea35bf9c87` | `d1a8b74480e26087578c5dbfa8065c1e20896a92936e53ad19762f8ac648c04b` |
| 56 | `src/common/shared/i18n/messages/en-US.ts` | M | `2720ab5e6e74c456ba69bc7f8e9054a3a8797953` | `50762682dfff37a12e969cd93a59f4814b0046fb99f377b4ca1847a6c91ff471` |
| 57 | `src/common/shared/i18n/messages/zh-CN.ts` | M | `a60e9f5c08f188ae3c62ccb8585a05a288684cb7` | `cef3a5fa72c1abc4c6610f491f15cb4d7215a9257672eb844ac0679fbf8112e7` |
| 58 | `src/common/编排/acceptance-rework.ts` | D | `f7fc50061a481619c3d8f66d0faf8f5b3aa6d844`（基线 8fc673e blob） | `b817d94fa3c8681be4874cd1594a03301418d6715d0924eb9dbbce972d9cc671` |
| 59 | `src/common/编排/acceptance-triage-record.ts` | D | `33ab184af703cf89141601894bdd783ffd49e041`（基线 8fc673e blob） | `7fd4b20e3c75344729f41cad24e6db79658cf4d8ab9eb56daf279cfdf92910f0` |
| 60 | `src/common/编排/acceptance-triage.ts` | D | `ca2af2758ca4195bffae5dd4b3acdfe535a4d175`（基线 8fc673e blob） | `78ea989817f2989c4e74d922857f9d577b985df79077c29ecff3fcd65aec5daa` |
| 61 | `src/common/编排/decision-card.ts` | M | `31b88e9e397c72711d8c99bf50acf0db1f8321e0` | `5300db1f46fcb2e45a36b622da1f02573aecec80397fa927832cffa4e7ffc2da` |
| 62 | `src/common/编排/directory-conformance.ts` | D | `400af3c2d4a9a9338ded55d7acd106f931648456`（基线 8fc673e blob） | `a8168a73033b902084465e5d76e0e37724e6de91d6a635e503d8349a6240f5db` |
| 63 | `src/common/编排/finalize.ts` | M | `2cf32badcfa3f67576e8675bc1fb74ad6cf6e6ad` | `1db4973c343f9c6f175a77102d18d5f962f529a1205c402fb834eab3931363dd` |
| 64 | `src/common/编排/flow-service.ts` | D | `a298ab5255cbe4c87be6a4aae4f7ac5e94836b5e`（基线 8fc673e blob） | `6c0566b169bc1e4973f9064e1055ce2d7f11bd7096b505889ef08defdba69a06` |
| 65 | `src/common/编排/flow-state.ts` | D | `c5f5a3fbd00c33c4ace1a7ff10fa95d8a9c84b55`（基线 8fc673e blob） | `d0c77a7a60d0fd049a14b8d21776b6134d5b091b37c9acb03e45ec285fe6ea11` |
| 66 | `src/common/编排/governance-gate.ts` | D | `fc79cc9fa8b5f0724a9e50f5918fdbbff8ff93db`（基线 8fc673e blob） | `4a838f2e758cfd9ae1d483be48416ffac8eb9b7e3a5fe8ba291014ca8c67b64a` |
| 67 | `src/common/编排/governance-handoff.ts` | D | `fbb5c53dfe6f3b6ea646644b79a99488aff0f0a3`（基线 8fc673e blob） | `71c5391f945b340e456e93eb296824ba1fa61b815dd517b54096ece34611c805` |
| 68 | `src/common/编排/governance-judge-evidence.ts` | M | `470c6e7888a74fdfc1a8f79dce472069eafabf64` | `e3590bfe7970196312d4b7a96f1661a9672368e850bf690f67e403d5a06f3c01` |
| 69 | `src/common/编排/governance-judge-facts.ts` | M | `0d59ba9ac071b6fbb95b14eeadfe8cf487364416` | `f99d564b81ca14b26906ee17bf8f4b40da3a7362d8ceb897c4e337a6e5893303` |
| 70 | `src/common/编排/governance-judge-intent.ts` | M | `d323b559a3aab93ee303caa8c3b687019d3af53a` | `d4fe2e29d698aba935639e5f11f46ee4f320ddc1418623a04e58cdb54b14cc9b` |
| 71 | `src/common/编排/governance-judge-prompt.ts` | M | `bde04495f60537c91f16121317f885d53b222998` | `591aa9b8d44283b5b4fdf855e05be698dc1333015d3c06e78976b8205a6b7601` |
| 72 | `src/common/编排/governance-judge-verdict.ts` | M | `8a1aab66a6c23c102bfe0583b235e53113b81909` | `548e87928a5b7a4420dbfd011cc8a9e7fd35a8e2cfb7546b2cb09ab011cdf1c7` |
| 73 | `src/common/编排/governance-judge.ts` | M | `20bbfdfc247cff3d81d1fb571f3cdad184accb4e` | `4c4902ee840e1d827d0dbacc43d0efd40e29f1a7c49525656981d4e6a46d334a` |
| 74 | `src/common/编排/governance-ledger.ts` | D | `1e925d59a0da5252547bba96330c391ea4d18418`（基线 8fc673e blob） | `92939ac9676033386499d16427aa9d5841007c3376d303aed0e7fc28421f45ff` |
| 75 | `src/common/编排/governance-migration.ts` | D | `b84056644d0792f9ec8d3730a813b646c888472b`（基线 8fc673e blob） | `454b8568e1f610503f99393ae13e6c7857dddba2e9c2ca1682848ac1a6768ac7` |
| 76 | `src/common/编排/governance-record-lock.ts` | D | `e77b31a9c9009b067337de0481c2ab288b5401a8`（基线 8fc673e blob） | `c1b06b440c106fee082affb302b7c6f585a9505216ca3295854ba1c190fffe19` |
| 77 | `src/common/编排/handback.ts` | M | `ea7380734b99e9f55fca2bd12ea5ef452b2e2acf` | `117b3632c1e8237c57d7dbddf86735f1a5e575410037d8ba9ca260c09452324a` |
| 78 | `src/common/编排/role-log.ts` | A | `8ce268dbb68ec9c382e805be429cf5518870d7ca` | `b99810dd599263d89c23028cce408bb13a8af611df7ac986c499957d863f2371` |
| 79 | `src/common/编排/task-state.ts` | A | `d8a4708112d85024705245332ea5210ab8b4b06c` | `6c38932b4b918c76880eb3cf155416c260fefe4d81aac8730354ca9a094e76c2` |
| 80 | `src/common/编排/team-plan.ts` | D | `8b5e918bbb8b5d749f93d4cc61ccb762ee3b9474`（基线 8fc673e blob） | `549bea98342f5bfdf77805ef186d3e6ca14885a6cf4209669038235592e4131b` |
| 81 | `src/common/编排/watchdog.ts` | M | `3789c2947374aae2c9b5567fe19de3233ef96366` | `d345e13421896ce568c4bc9db1e88a18739c882205e7cc46077236357d1b4b95` |
| 82 | `src/common/装配/release-policy.mjs` | M | `f9414f2ef5c8ab68c3b28bd51b0ef36ba2f34517` | `2a33b867a3dac2b6978a5be07e0582d254115c0f3faca10863155b3c7364dfdf` |
| 83 | `src/common/门禁引擎/governance-roles.ts` | M | `49f9610aec1bda417d319241dea2e928f3ce9551` | `c1d92149e6f9492a6942fdfbaa49d56ab9452aef807cfa41e82769169159eeeb` |
| 84 | `src/interface/cli/govern.ts` | M | `3de770751c24c620224f1a2e8140d99ff7a60a81` | `558754331f8482fc029548d9bb62e865b6056a83f7a31664e7ef770d515fa102` |
| 85 | `src/model/role.ts` | M | `db8707cc3df4c834fe987f19071c096a53e8baf4` | `8c015166fbaa25567acb719ed349a2fe6a594b285a4c3d0b905622234240de9c` |
| 86 | `src/model/runtime.ts` | M | `c96e2a7d9ec2a996ee7bd1009db29bf216083404` | `8c276de5ea5e816762a6e65dfa206e3f5cade47e0d6db8ca0baca576aad4bee1` |
| 87 | `src/pipeline/orchestration/flow-state.ts` | D | `55890ef62de686d7799c7a16b1d2b0fb55074b8c`（基线 8fc673e blob） | `8ad93e5e038cf9435f932926d2951c2cb19fe9331e59ea5c833b0ccc285cd2bc` |
| 88 | `src/pipeline/orchestration/govern-session.ts` | M | `871835ec66de6db7f2900402f6883167135b507a` | `584c4c44de5e8d8ceab5b6d99f8a8d60f741240a757d3d60c4c28971f0af5548` |
| 89 | `src/pipeline/orchestration/run-role.ts` | M | `c2222dea712023478f023cba9cfea4fbe38f7774` | `3a2c1e60a7710ba8db50eb5afeb06e20e50c0abb7a43ad71062f9a43e863b088` |
| 90 | `src/provider/pi/session.ts` | M | `0215e9d6976d9ea43bb6e6a8173c263dc74700c6` | `337df9b1cada3c9849e8225c28d484475dc836cba3f145d71efe62b6262300b3` |
| 91 | `src/provider/runtime/schema.ts` | M | `3b1f24f7734cc90c040a8169361a75df1e0d31b1` | `a60187910ab295a38c2833f3bf9fae3e8d4edea1a71954ca0f82d46b565e7fbf` |
| 92 | `src/provider/runtime/tools.ts` | M | `f8a21efa0adb4d928c57c2d0b3d234a82da98a04` | `88bab27f959cea09899cbfb9d68e4a83ebb6ee3d8ce0f0b7def81fc52c64663c` |
| 93 | `src/service/boundary/resolve-boundary.ts` | M | `44adb28358b890487d1c141e3c88fa79db2e0e87` | `b73b943e88eaf924faf37ca5d0084fc676bf3a44d5c2486305e4da3edc96251b` |
| 94 | `src/service/role/resolve-role.ts` | M | `dd5b466489f8db1862fc61a7924126d6f2cf17e9` | `cc482d28bff18398e127696f9c832a829dded6c82a093cc7546da9ca23e8fe6c` |
| 95 | `test/claude-adapter/session.test.ts` | M | `e2910b34b520afbc7ef85747230aee1ede213eaa` | `860917635d81765db26551edf85343a220e6b733b5948a7ae3eb14599d39d86d` |
| 96 | `test/pi-adapter/flow-tools.test.ts` | D | `a42d46836cdf0e6b42e66b853a89008866a1e01d`（基线 8fc673e blob） | `61e3745d52248434030df230002bbbb1630a9d8332c45fc8975538a3439a8c5d` |
| 97 | `test/runtime-core/flow-tools.test.ts` | D | `8484a01d6156c979652aee0caea860eefb651188`（基线 8fc673e blob） | `5ee2e86a9a30fcc531aab0e60dcdce00805a215b8dc2d94ce560317c0c0e1ac6` |
| 98 | `test/runtime-core/governance-flow-metadata.test.ts` | D | `9809eff198efbe41f0886d8bda58f6377bedbee4`（基线 8fc673e blob） | `4e99701fc8c187254a82e28e36f0a1b10f8ee43a4304f62f0bf08605bebe7511` |
| 99 | `test/runtime-core/governance-judge.test.ts` | D | `927acd19134d621d4ce2149dd1a3a88da7b590a8`（基线 8fc673e blob） | `66eda45aed570dccda647dd46413c8a3cbf12e4f00af9d12095f9f9382f54218` |
| 100 | `test/runtime-core/governance-slug-pattern.test.ts` | D | `85daa1730e80fdfacfd759beb498997e069d919f`（基线 8fc673e blob） | `4717869e08d323a2a951807226a8f4b9690b3cdc0a736b70aefca6b5b8020920` |
| 101 | `test/runtime-core/liaison-handoff-tools.test.ts` | D | `11f3c1f25dbc7771a83a192b1774f70e7d993f28`（基线 8fc673e blob） | `bd4b2c0462f1644b0a24612bf64aaead9663a3f5cb6ace4ecbc2a9be7a622f5c` |
| 102 | `test/runtime-core/report-artifact-tool.test.ts` | D | `88c2a6a1eb6c3dbd99ea471409fc3badfffbeeb7`（基线 8fc673e blob） | `295f657f530ed3f56ca670e22c9e2bc1d2900a75c83bf44f6941a948bb09fe99` |
| 103 | `test/runtime-core/request-acceptance-tool.test.ts` | D | `a580b5171f4ac3708775b668325d11e173209579`（基线 8fc673e blob） | `d048fccc4601a93d962add6eeca08fff7c93f2213488d2f7d3d93dbbca24fc39` |
| 104 | `test/runtime-core/request-boundary-change-tool.test.ts` | D | `161969c77918827aec852f5e4f23697dd9b4e82a`（基线 8fc673e blob） | `eb34965025ab672b72f65aa37c2723d426bd5d3bc5d4b6bec205e2fe526c1c59` |
| 105 | `test/runtime-core/request-choice-decision-card.test.ts` | D | `ed3f21746793af1807f96f5b27aa807d5ed54586`（基线 8fc673e blob） | `b2fd2fa203aa924ee5bb5cc7b639039aeee23782b9e7d350eb3e4bc3b2486268` |
| 106 | `test/runtime-core/request-gate-review-tool.test.ts` | D | `66721879d1307c4ffdc680b75815ea4265189532`（基线 8fc673e blob） | `946afbad43c1499cd0ac66eea7cbc094adf69c4e0eeab223ea7f692e9fcbb5e0` |
| 107 | `test/runtime-core/request-requirement-change-tool.test.ts` | M | `37e5b33c93f956e1602af03c8a5e5109f9f3742b` | `014dd18ce15a274c4947637240295f2f09f85155f8935b28f32c3795f6691def` |
| 108 | `test/runtime-core/tools.test.ts` | D | `e6cd1499cda5647a8158102d9282502975c12a40`（基线 8fc673e blob） | `4750afed3a1673b142e1fbf8a78751d025c6eeb78aed21ea070140ee50ad6fae` |
| 109 | `test/runtime-core/view-image-tool.test.ts` | M | `b7e7aca24f040b609142fc043ee403d0200ca924` | `fe578c0785bcc9f7f7eb2f3e10257bde1280dd62ffff744bcb151b26b35fa6f2` |
| 110 | `test/runtime-core/watchdog-tools.test.ts` | D | `003c842626178566e5295c7d681ce57dddf28869`（基线 8fc673e blob） | `3bb858310d15ee0c3376bf107203709d0b94c7dcf62b4076e5e59420849226f3` |
| 111 | `test/桌面UI/decision-card-view.test.ts` | M | `312849d619b8962ce523f4e72307741b70fd2af3` | `778578b0be9fc4e4a42b5209eacaafa9c22c213cc6ed5a1727d8352ba50a6d74` |
| 112 | `test/桌面UI/decision-dialog.test.ts` | A | `b7e2391de88010f7f62c5b6c9310d0b2c2b81445` | `6a12cdf19d785c8045e83cbd3cf282ce04821a05c4599af4b74ca8fc2de02c25` |
| 113 | `test/桌面UI/dialog-a11y.test.ts` | A | `078db9e53b23787dc0f9bd4eee3762aeeedd2b50` | `f52eedd8f932142f1a7815cd37bcd852b2f83bb80eff58da244addc30a6eea71` |
| 114 | `test/桌面UI/dialog-history.test.ts` | A | `24bca6aa1390234d70c92bfda7a8c4cc359259df` | `5544ae14a059769015b9b969113feb01e448782a5c6e08ecfd3922d88d0b59df` |
| 115 | `test/桌面UI/dialog-queue.test.ts` | A | `23e48e600a16f9028456b201e2288b59855a0e09` | `581b1304e79b4b9904e2766523e90ea1cc3c1d51c7c024f608f622174eb6d782` |
| 116 | `test/桌面UI/flow-status.test.ts` | D | `41976ee2c1e6c0d1a841446d3dd0591b54ed4dc9`（基线 8fc673e blob） | `69d2d5f764178397bb0d3943d69b4503ec2c4ac4358c517fb747d7592c18a810` |
| 117 | `test/桌面UI/governance-view.test.ts` | D | `1976765b87322f4e8240ac08d9b4e3d75f41f3e8`（基线 8fc673e blob） | `0603db1d523a7a72515550fa65c8381c7554ba3da9f532c1e4df98701902917c` |
| 118 | `test/桌面UI/i18n-b1-b2.test.ts` | M | `db30bc8ce14b7e083db21e4cc45b5caa8f5d6dfe` | `9ea86f2fcb87c701333d4772384ad2f9511d69584b568804044494cb50d6d0c7` |
| 119 | `test/桌面UI/judge.test.ts` | M | `0e7448344174aa23e42c38c2205aec4a17953e4d` | `cb005a7154f6e0a99c04ee0c3bd84c475398a7f23b706779c4fabe0fb5360f30` |
| 120 | `test/桌面UI/operator-view.test.ts` | M | `86d88ecbdda23542c31e4ab17705b51343a3693d` | `874443c59ca3ffbe5086e60a6b98f1d734a876e20d382ccc52a9ebfcfbc6332f` |
| 121 | `test/桌面UI/phase5a-electron-smoke.mjs` | M | `1f6db3e0549fa9534e9cd7ad315e4b86bf633bdb` | `bd25e679877d44a563dba42e29f38ee88f8b55d8858d2607833c7d49f969fbea` |
| 122 | `test/桌面UI/role-log-view.test.ts` | A | `d34fc6986e1ed07706bceb8ba486595b09195438` | `0c44b31b96560dc63818e01ac6b8fc766b0c52c03b1ac426d1eb53b6b02c067b` |
| 123 | `test/桌面UI/role-view.test.ts` | M | `99071b1b70e65fc768b0c3c4d7fca0808be0f6e8` | `97b5ea7b6c2581cb91cac71dc480a374cc8107c059cfaff8178e58e90af1223d` |
| 124 | `test/桌面UI/source-guard.test.ts` | M | `1a1253e54a253c1fbebf7ea0e368432339ae9f7a` | `4990116bd6046085dc6ba8426855fae0c6075f81f64b6133a9853c6e6038a329` |
| 125 | `test/桌面应用/acceptance-dispatch.test.ts` | D | `48279ae28f1e7f6c14468a0f13a0e2c0ee53e16b`（基线 8fc673e blob） | `a5a48cc3a689027ccc7ec9cfe4bd6947f9c48b0361926e30335101c07a480080` |
| 126 | `test/桌面应用/ans-wiring.test.ts` | M | `0c295539d51a3e332b5a8a69cb4619febdcd129e` | `94bac889df7b5f7f49fe98913489d89d87634fc0193d647a7c174e6b75e2f554` |
| 127 | `test/桌面应用/application-line.test.ts` | A | `66e4adbaa3385f44095b88e0ec8cecdf97da3a5a` | `49fc89b0ea16aafcf71357aef352e1d72250f0f6f08c0f54c47c28a7fc46b065` |
| 128 | `test/桌面应用/chief-workflow.test.ts` | A | `747af1e711a590e3deb1c78f625cbbf7227bb0ce` | `53d034f2a32094ce7a0ba414de42ce8fae7f8127fd467ff7198b4f1fd36c58bd` |
| 129 | `test/桌面应用/decision-service.test.ts` | A | `aaeda81e3e03d6fdd5bb695141492b5f5564af47` | `41aa678d86782bafa7d7d2b8e4af6df5f3d67ca3b49d26cb76d3f2e5d6d36e7d` |
| 130 | `test/桌面应用/dispatch-delivery.test.ts` | D | `5f2320cff78a51c5d0fc236e4363ac9cb10e3ffd`（基线 8fc673e blob） | `a92b2797f3972a8fddd3d2f7e0c4910898f747163bbe1974f56fc10e83c6bece` |
| 131 | `test/桌面应用/e2e/main.mjs` | M | `7ed0728b8b4a59aace8c040071a829d4d6088fd9` | `58115cfb66951b7f6b3c2e7bce1800e450dc54557a6dec52f845eadcbe67386b` |
| 132 | `test/桌面应用/genesis-bootstrap.test.ts` | M | `2fd53a177042a4c763038a217ff5723fe492529f` | `dc049d59a67ea6403c450b4a15d786a7c99e7d04951bb000f5ff3339c92630fc` |
| 133 | `test/桌面应用/handback-delivery.test.ts` | M | `88ac02fecc6a8ce19ef95ef4db2fa2e1fcfbc73f` | `5ec046b647c87447a7aea529a48708036c208b18627b845ed37d7ed46d8a8c6f` |
| 134 | `test/桌面应用/interface.test.ts` | D | `3397e07eebad1e01a27ca432a93160b671b60fe0`（基线 8fc673e blob） | `6471a33add57dbb0982a71477c5c215b4ccf9b796d14a9f18b6597b5703d4972` |
| 135 | `test/桌面应用/log-actions.test.ts` | A | `caeff8b91d77e3ab781958075911a7cb91e25498` | `d0f2f78021f9c58fb9ad1d9403d8f824390fe31eacff3e636ab81ca21f030ade` |
| 136 | `test/桌面应用/log-patrol.test.ts` | A | `116c8331d94b3d97869fd5ca106715c87ca495e8` | `f205eaae856fa94c64caa4d3cb5b48fcd6bcee090e05ec085103cbf9e5d61d42` |
| 137 | `test/桌面应用/log-stuck.test.ts` | A | `1d0b4f81c5981badf7820c2c19be467e584fb236` | `91f710d9598c85f2073b11a9dae5e50773c08455ffd9564a8fd4435b0bf64994` |
| 138 | `test/桌面应用/operator-channel.test.ts` | M | `167313ef8a55bc14914a3e64db8ba552b36a1558` | `ef6764c215d735459d23fc3b191ab35c6edbd56433607ac2466492e75116f591` |
| 139 | `test/桌面应用/operator-wiring.test.ts` | D | `bcf925fe8a4e7a4c15cac6b0de364719a7af40f0`（基线 8fc673e blob） | `5ed80a70f96a3f9afdd31ca0de62135db6007429ba82c658137a7ee5856e905f` |
| 140 | `test/桌面应用/optional-acceptance.test.ts` | A | `26c374e67ba9af3d03690f9f067b76166025178f` | `64bc2b4d1b621730e60d89a6796b337f67245ee0a1a251eef1d8962132a74fa4` |
| 141 | `test/桌面应用/pending-card-restart.test.ts` | A | `56f1e0a116475e58a6f6e4572a9651c4a82e4c10` | `d46d858808ebb8234a5f4092bf8ff10d7a9344d329abfaf6b93f50b2b952a76c` |
| 142 | `test/桌面应用/role-log.test.ts` | A | `c1ca829d12e229a8c9416a20542e4112ebc8a0ef` | `16865f761de62804e0b763e7ed0782b335d1dc27033c2b9fa204956121ed20c3` |
| 143 | `test/桌面应用/runtime-resolution.test.ts` | D | `4ec976d696e1fc716f8fa33c2b5c6166c60e01d8`（基线 8fc673e blob） | `ef92daa7529eaf4e049dac92cf29a131ae6e7543d06953342bda3848eac3c7ea` |
| 144 | `test/桌面应用/session.test.ts` | D | `4fa70a971e97263c63571e6e2470a6c7061cc324`（基线 8fc673e blob） | `6418fe43b263268150610e95e76e53029ceb01051931dcd777ba91ee26247425` |
| 145 | `test/桌面应用/star-routing.test.ts` | A | `7644fda97292b1d50b97ba4e1184a71ebe27717e` | `b31bb35882c18158f72206657fd9acb0fdd403283895182b92530449d9149d90` |
| 146 | `test/桌面应用/stuck-redispatch-safety.test.ts` | A | `3d7a7eeee2b2f44cfb1945fcd0f309a70a9fd214` | `c823dd4f1fbd487f80f67f6cebbf65e22b91eebfe3becd55d4a068ecd92e7257` |
| 147 | `test/桌面应用/stuck-redispatch.test.ts` | A | `411c9b388eba2fbc8bdef2469950aafe0edb4172` | `d671eeaccc0839b4824a452a9f913239c504b86d22b0dccca2e6e9721f8cc790` |
| 148 | `test/桌面应用/task-restart.test.ts` | A | `30bd097549d2d14fd6f7c621a34ccb45d2287f2a` | `2c5e4351bdb810d51ee0f3fed820419da9db21371f4394bffa37731720e0e7d6` |
| 149 | `test/桌面应用/watchdog-reuse.test.ts` | A | `bfd4b0f6073fa8e269b4d268234019400e6aa6c6` | `2d074d0bf796633c2a4ca42370ab82159411b2648981c9721c77fc24f4a255a9` |
| 150 | `test/桌面应用/write-safety.test.ts` | A | `01245c1b743821ab51de09f67b37ca30405dd864` | `87b777a909ee275c4ffbbdfafaa13388ac8055b6121934f033f0b7e544482f03` |
| 151 | `test/测试/directory-layout.test.ts` | D | `1eb758d1e0e4f8a1fb2141187a69dc8d714ee18f`（基线 8fc673e blob） | `7a4b845f4b8396a9b23ae90746197b64051a00abfea1663bee3e343af191154e` |
| 152 | `test/测试/entry-role-minimal-d.test.ts` | A | `1960638b06fe07a790e806ab0ef446fa56b4de8a` | `f4da18cf86fc7fa3e8c223e33196ddc85513a031ed39201c5a2b9ad0ee33e734` |
| 153 | `test/测试/existing-project-compat-verify/a-state-preview.test.ts` | D | `1d7295d8e2824a2215aac89b797df83a9589cdd3`（基线 8fc673e blob） | `e7d89f768da1077eaa147fdaeaf299a94c48ff4ccfd23625fd76e1c603e7f09e` |
| 154 | `test/测试/existing-project-compat-verify/b-establish.test.ts` | D | `2cbd5e5a12bfdd4975b9e7ab1ccaa19f4ff71f6f`（基线 8fc673e blob） | `c0f1492aa3435f388f979f64b986ffc050e2d4530123ca003b2054e59124b031` |
| 155 | `test/测试/existing-project-compat-verify/c-invariants.test.ts` | D | `657df5f6cce8f5e61d53f0f7d64a31394bc2d74c`（基线 8fc673e blob） | `c0228fa9ccb4d68d1665841e9729f68d7056c3426dc1f3e7069e440e3d0c7d2d` |
| 156 | `test/测试/g1-verify/g1-copy-and-nails.test.ts` | M | `80d174259b370f2fe887a5efbae225416a71117b` | `1533f417a417bb80de0441046fff76371b873d8298f88e57ee82f79b89ef9b9a` |
| 157 | `test/测试/g2-verify/fixture.ts` | D | `25aff43dc58b72a6161948fbfe2e59ae15d87c7a`（基线 8fc673e blob） | `45530109fd9231d4048344208025e2ef62d23353e8d7416d59f7f85c09c0a8a8` |
| 158 | `test/测试/g2-verify/r1-desktop-datasource.test.ts` | D | `5ea7a8aaf7ed08b74084023d284d69cb645c57c3`（基线 8fc673e blob） | `09c8e9ede095d26303416a0a6f65b381da258e7aefe0e548965479f1cef873e5` |
| 159 | `test/测试/g2-verify/r1-r2-tools.test.ts` | D | `0eabca1519b692ba6c3b090a721233f0952d730f`（基线 8fc673e blob） | `081879f328373351a156ac5271b14b475172b5b3013af69e0b41949bab206cd8` |
| 160 | `test/测试/g2-verify/w2-system-delivery.test.ts` | D | `b4358e9a5ddab248a3eff78bd8fcfe81d41e2973`（基线 8fc673e blob） | `2c9a29a9d491c502287fd7b7c315307ee74092344fbb151bbf1d18657c6a46fb` |
| 161 | `test/测试/g2-verify/w4-w5-recovery.test.ts` | D | `e2b99405d3ba7b221108c05eb25b972043e0785c`（基线 8fc673e blob） | `1afcb85147b9c19972ea3158f359cbcc6c62d1fe1cf3442edeb1149c7dc5ecf1` |
| 162 | `test/测试/governance-e2e-auto/a-proposal-write-auto.test.ts` | D | `4c3f19126ccad98fafac5f298f0a5fe359f89875`（基线 8fc673e blob） | `ae18b1581a644013dfef69be0f8ee022167a399c94be5e3e4db0f350240f182f` |
| 163 | `test/测试/governance-e2e-auto/acceptance-triage-e2e.test.ts` | D | `2abb282c109b58cd14dc8027366a10b333dcc973`（基线 8fc673e blob） | `c46c6cf21d2b0474dbce1fc56058e4bb803acd540c19ec701635d3446e828b34` |
| 164 | `test/测试/governance-e2e-auto/b-proposal-accept-timing.test.ts` | D | `aa3f78bc0ecdc69c9d0ecc0ccf565340de6311e7`（基线 8fc673e blob） | `62bc7d078b084838df7c3b3d81212a9e3fe5cd29c372ec0092b9e0d6f72e9442` |
| 165 | `test/测试/governance-e2e-auto/c-appointment-timing.test.ts` | D | `5a1bd5c5301e2c23a27346d49417406c36f936d8`（基线 8fc673e blob） | `4262b039eb22d0bc962258183c7be88383671a285f9dab78482b0f840089d7b6` |
| 166 | `test/测试/governance-e2e-auto/d-dispatch-listing.test.ts` | D | `f05d15d260e7e0d6aec5083578c3f771c4baa981`（基线 8fc673e blob） | `c43015b5605fea04cd3efb0d6946081b8ee49097bd145d51de992591a03ea9f5` |
| 167 | `test/测试/governance-e2e-auto/e-switch-matrix.test.ts` | D | `2a380f9c1ffa4caded8410fa28361cadafc793a4`（基线 8fc673e blob） | `18bca9a00f56dc895dc5182b4d56585d18e9e5155f71c1109fb9d79496ee1679` |
| 168 | `test/测试/governance-e2e-auto/f-acceptance-gate.test.ts` | D | `b8ebde757d9ceb5483146114cc7e1d6f3fdba76c`（基线 8fc673e blob） | `e80656b3d626e587507714fb50ad482c6d727decf23edab2b24d380a925f4b5b` |
| 169 | `test/测试/governance-e2e-auto/fixture.ts` | D | `7fa52596487ad26256b7644c1a7306cf375a07c7`（基线 8fc673e blob） | `010bbcc4bbc817141241120267dbdafae6af586d402039a269be0973dfab3eb6` |
| 170 | `test/测试/governance-e2e-auto/g-judge-timeout.test.ts` | D | `739fd731ff07fd17f6f5cb05f59a0834e59e3c91`（基线 8fc673e blob） | `b596ce1dc02849fac5c9dc43a541dea098f76880dadf8c21fa586f1746a2e2a2` |
| 171 | `test/测试/governance-e2e-auto/h-list-dir.test.ts` | D | `fff06e578f8ba081a6c84ed7b053dbd8c3125f5c`（基线 8fc673e blob） | `c3dab1573c479f84768d0273b8d7b52ce435c5889e88e664c74b104d037e2aef` |
| 172 | `test/测试/governance-e2e-auto/i-full-chain.test.ts` | M | `2434932c35a1e27bcbfdd43b326273aaeb132432` | `5bc184945ce01009b311adab0a72715d19c126af4362dbc8f3daa2a6323b3f13` |
| 173 | `test/测试/governance-e2e-auto/j-intent-confirm.test.ts` | D | `6e88420738315a366101c0f3850f9a236b1b8f8b`（基线 8fc673e blob） | `4716e1f57b5f97e3a46bddbedb0b58d92b31f73370b24dd8711e2c0563eff3ea` |
| 174 | `test/测试/governance-e2e-auto/k-governance-feedback.test.ts` | D | `72095c25ea4866fb6be8845a374b584555e04eb9`（基线 8fc673e blob） | `603f4200dc0c0e401c2bf9f650c793e2af6ff3562fcaabb4b3fd6446420520b4` |
| 175 | `test/测试/governance-e2e-auto/l-crew-write-validation.test.ts` | D | `b84362ad0a76a6fa889ef511d69bd9493db873fa`（基线 8fc673e blob） | `2c0bea5b4d4e6e2c8aab4291b261bdb15348bccd778acda4c35b15de1403db93` |
| 176 | `test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts` | D | `cb6f483461815570ef0a18b7fbb251f5cdc0aa5d`（基线 8fc673e blob） | `48fb0aa8467479904a9b2a7b4498b5f6a3cf200b2782f1eee52c76813ec85e3e` |
| 177 | `test/测试/governance-e2e-auto/m-lead-internal-choice.test.ts` | D | `a411e3f3be12982b497a61465acae0410e827d13`（基线 8fc673e blob） | `ef19badfd3c28aae8d537bbae38dfe20764e39ccad83f41feaaeace08fa3370f` |
| 178 | `test/测试/governance-e2e-auto/n-invalid-governance-card.test.ts` | D | `f125ad2b3bd4953800907160e74818bb94a3ccec`（基线 8fc673e blob） | `e918207416e501537bf4353fb8b7db9ed05c17b77433080fbc82a149bf3d57ba` |
| 179 | `test/测试/governance-e2e-auto/o-slug-trailing-hyphen.test.ts` | D | `8dde9b6b05c5b74a35089f00cfc97dbe24189ae9`（基线 8fc673e blob） | `c889e6fac788e062edd09b19082ab5b5d220e6d6169fdc2bb743e5945fa4231b` |
| 180 | `test/测试/governance-e2e-auto/p-team-plan-guard.test.ts` | D | `da5b0c53bf3b44bdc652c15a2ee2107341ce81b6`（基线 8fc673e blob） | `c35da9810c995a3d556e2f406323a273024e5521dac77cb23c14d4f933296cee` |
| 181 | `test/测试/governance-e2e-auto/q-role-granularity.test.ts` | D | `8a1cd8a85a64250de4ff9958cc58c157adca264a`（基线 8fc673e blob） | `0dff76c42bb9b7bb1027985a26445d7ae38002e228f1ba70fa89d591ea484000` |
| 182 | `test/测试/governance-e2e-auto/r-mapreduce-parallel.test.ts` | D | `0fed3f3fb1a5b399b4ac0386b6a972e018883c34`（基线 8fc673e blob） | `3957da671fb9647e84cbe4c7eb075c9d7567bb38659c14f5b2c4b59e8f22d06b` |
| 183 | `test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts` | D | `788b0aaadc3f6fed0c360a681d571baede44055c`（基线 8fc673e blob） | `7bc15353e01c3f67a44afdaaf8cb21aa025354e34a95b4bc22bf2fd3bbeae634` |
| 184 | `test/测试/governance-e2e-auto/t-gate-review-return-routing.test.ts` | D | `7a4aa0c47d427ea85ea23ef5644666bd351f0f7a`（基线 8fc673e blob） | `04ed023319e25fbbdfc5f54bc3013a100ff146b8155148e92defd200c0f17e4d` |
| 185 | `test/测试/governance-judge-cards-verify/a-switch-matrix.test.ts` | D | `366e78e17668beb07e68a3653f279c0a078cdcc2`（基线 8fc673e blob） | `f8a051b5faba13d39c3f3373ba7319928bbf9f9041369ac3d17c360e7e3bbd7b` |
| 186 | `test/测试/governance-judge-cards-verify/b-card-kinds.test.ts` | D | `a584c737c0818cb998eedb1b9cd39e0251b7658d`（基线 8fc673e blob） | `488a882d557bac18ca908b296cce5ccc9b3771bf789c484ee26cd52dc11b3140` |
| 187 | `test/测试/governance-judge-cards-verify/c-fallback.test.ts` | D | `81ba9e3edf9768779d9d42134757da9190623f4c`（基线 8fc673e blob） | `01af1b94d20feecb14db0cbc93667673bcd370982f262559c0c08723aba24259` |
| 188 | `test/测试/governance-judge-cards-verify/d-audit-ledger.test.ts` | D | `66b2e9928d2a4d5ae65c3466c2cf7d94a882bf87`（基线 8fc673e blob） | `c1f08e6d19db06a1bfb921a3b44e0daed9e2ecc580e9a0fdab0828787e466c70` |
| 189 | `test/测试/governance-judge-cards-verify/e-queue-once.test.ts` | D | `e225a367b08cfa17db9e4c4a2a7c268698cc7de6`（基线 8fc673e blob） | `2e931ca9e043c53081b3df524fb109f176bc2e17a8f1aa4ebd1956de371d4d8b` |
| 190 | `test/测试/governance-judge-cards-verify/fixture.ts` | D | `10c147deea3dbdfd459bfab1a8ebed41028709e3`（基线 8fc673e blob） | `f0506e0567210514334a55a7cda5d716c42a03699233c13ced61f1c1fb424524` |
| 191 | `test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts` | D | `5cb03e6d5864545ce7b5c2b20a573c81be55a3ba`（基线 8fc673e blob） | `c98b5b1c695c06929e038a0f67e81ecdbd03ffba9378d6fc92e46d8ae09ea949` |
| 192 | `test/测试/governance-liaison-verify/b-intent-handoff.test.ts` | D | `b7c202dfc49b935f53a4067d2643eb7027970450`（基线 8fc673e blob） | `1076b4d159e5a8e87dfba14a2b671255236b842106d960874f7058fae7fae28a` |
| 193 | `test/测试/governance-liaison-verify/c-clarification.test.ts` | D | `e55958716f5b5ae6429114103aa92ef37d905df9`（基线 8fc673e blob） | `7402a69cb4f8a3f344769d18afca60fe022d50417cc82e9528f6e8bfc48c3b19` |
| 194 | `test/测试/governance-liaison-verify/e-audit.test.ts` | D | `202e6b36dfac2a05f3eec906bd725c6a82c618b8`（基线 8fc673e blob） | `e49077dbad5f719046d2fef30600780d8a2be42506794e702eea1e467118efae` |
| 195 | `test/测试/governance-liaison-verify/fixture.ts` | D | `e9e79977121b309b3e37e72d2049cc90c88098ac`（基线 8fc673e blob） | `b890134336553e20dc1f6dbb16a83738d15933be5062e608c2fe281e4f55eafd` |
| 196 | `test/测试/governance-pin-recovery-verify/fixture.ts` | D | `1bf6c25bbaa86c0f22fedd6752299ad25ad67be0`（基线 8fc673e blob） | `56f5f17c35e6e6815191191015e253d41c9298f635f31cbf5546e1d5e12840a2` |
| 197 | `test/测试/governance-pin-recovery-verify/pin-recovery-e2e.test.ts` | D | `981505fe93b20900e63ec6d5fcdab225d04d8783`（基线 8fc673e blob） | `b7e24264b2f7abfd004be8b6c07d2a8e4dcabb9a2b38df5f82cfd4ff92976a19` |
| 198 | `test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts` | D | `825c7044d7dd3e0c94d0bd55f82cbc0a7b48150c`（基线 8fc673e blob） | `5a4748c29f18ac698bc22ff7f524cd01efab3b4f8459d130ec39210fc6f64e07` |
| 199 | `test/测试/governance-trio-verify/b-gates-dispatch-ledger.test.ts` | D | `d33c50e242f31a94d45309e0bb610c0dcf6f1473`（基线 8fc673e blob） | `f1e9d1859ad462573a7f6c88362e72463d99a99fd6563a44cadc08f4e8337824` |
| 200 | `test/测试/governance-trio-verify/c-migration.test.ts` | D | `e073e2410634f302ab55a592eb9f5743a7dbbe93`（基线 8fc673e blob） | `e7e90bcf10a306a83b52d172a50eca963bb9a69ebeaede85fbc33ea949057b4d` |
| 201 | `test/测试/governance-trio-verify/d-single-compat.test.ts` | D | `cff8e803ac05a85c368a48ec63cb2c1ed5ed4185`（基线 8fc673e blob） | `26ba63479891321de0eb7e0a7c7ca7450a370c2be364e22606e6d11c69cd17ce` |
| 202 | `test/测试/governance-trio-verify/fixture.ts` | D | `95302438439b366013b6443083992eb6d44b1386`（基线 8fc673e blob） | `ded7417731b04dae6aa8c9a578b12dfe6839b4ff122ca8c801c7a6bb8299ec51` |
| 203 | `test/测试/redispatch-target-recompute.ts` | M | `e1e1f9f40e16c0f678737ea7a073028891422b88` | `b3170036971ae58a3a2af940c9c50ef68fe114f705958be8a9ef9ba8cbe0b9ee` |
| 204 | `test/测试/shell-judge-verify/f-readonly-sandbox.test.ts` | M | `d8a7e13ca0de445ba040026d00124a027c49a60a` | `1a6cabff7ea641fa560d7ae382faa4b58043087ad1ad4d0d0dfa8d270620d164` |
| 205 | `test/测试/t9-block1-bootstrap.test.ts` | M | `40fb481052479237b3169b9f2e576f6c77cb4a24` | `3c6cbeaeb90798e744b46ef1138ab0a38d4b662ff3719fe7e7956e018c0c48dd` |
| 206 | `test/测试/turn-watch-verify/d-recovery.test.ts` | D | `a513fc3547cf26983368fe55e748b5f30ef4971c`（基线 8fc673e blob） | `358bd54eb3602afdb46f6597f8994c63647fe4b238c1cad5b3675428db79b9ee` |
| 207 | `test/编排/acceptance-rework.test.ts` | D | `d6e5d9249533feafef431693f0dd04d3145184bc`（基线 8fc673e blob） | `92546d19cde77621cfc8585c93f38ee9ebb0baddc63cd3bed8914c51b87d6d8e` |
| 208 | `test/编排/acceptance-triage-record.test.ts` | D | `7ca2679c4da5962affa652b1e69f6c91db41c4ae`（基线 8fc673e blob） | `c15b26ceb060b9a4f7c2812485696951cf3e9822c699bb0c873ff454d7292d83` |
| 209 | `test/编排/acceptance-triage.test.ts` | D | `3366b2dd802bf6b88a5a4506bf4e35a790f793d0`（基线 8fc673e blob） | `4ce28177c8a3a0068ef82d34bb1c07d25b49b883e8b2daba35021c741a86295d` |
| 210 | `test/编排/confirm-preview-completeness.test.ts` | M | `94d9761c3e4c417330c227a6415a765a39971e56` | `f0617f40359b7e1785746f5312ccf6c1f427314ece9d6e69debd2de84b59a7f9` |
| 211 | `test/编排/decision-card.test.ts` | M | `c87624cefa206d5bfb38a1a0f4ca55c3b562e2a1` | `01c8c2b36c2d2305d33c3d2232aefe5d3959ecaa6487243951640e59680f3664` |
| 212 | `test/编排/decision-evidence-packet.test.ts` | M | `e40922df07fc9f7a6dc48bb8db8775691032c762` | `57992e1e485588bb072fd9027881be2d1f3519336e7f92282db43ec0ef63e62d` |
| 213 | `test/编排/decision-intent-drift.test.ts` | M | `f24b29c6cbc9fe6783a3bb679209550c996e7c8e` | `84751064f3bc60288fffa2c832412ff15bff711c35c72c5016acb1cf8896725b` |
| 214 | `test/编排/directory-conformance.test.ts` | D | `23b3d7405d02f736abad498f12d5fa1c033a959a`（基线 8fc673e blob） | `8028c7c694c7c00d01aa5db47488dc27648ab22173a9914cbcc7c8d91b9581dc` |
| 215 | `test/编排/dispatch-reads.test.ts` | M | `daf3fdf4737a15e10d299d661ca506a3bdda299d` | `a990e67bedd8bbdc236b8fac5785045cccfd72c212dab85b46199db3f03e9705` |
| 216 | `test/编排/flow-gate.test.ts` | D | `edaf1dc0d761152516fa176279533c1e7ced8075`（基线 8fc673e blob） | `68a26c54a1ed45b26cd9dfdffcbb401496dc7bea12e92d2e8e92a4e680932f51` |
| 217 | `test/编排/flow-service.test.ts` | D | `aba98b338d28141f5060ec17300a30f5f2795181`（基线 8fc673e blob） | `6caeb2b0d6e71a4fc3b7b3c5eb7758ad0d3138fea97c0d768d2a2f840dbcf1ed` |
| 218 | `test/编排/flow-state.test.ts` | D | `bf7311ec6cc8b4cfb65f38612e6f932db8ffc281`（基线 8fc673e blob） | `1aec1c40a01c65bae5d5f130c5953e008b4423ed6e52a9c2567424edea3ce089` |
| 219 | `test/编排/governance-gate.test.ts` | D | `8e78e8c52e614422a7095576a980ccbee303d1ed`（基线 8fc673e blob） | `1f16f14374f5815af3ece48e8682ccc8ef59c5c7abea57b0933bd0d7cb02485f` |
| 220 | `test/编排/governance-judge.test.ts` | D | `3352b7d62509298463230d0c3d1fa52fb188ea08`（基线 8fc673e blob） | `751356bf57d4292836595e93aba701577a2384cef79f25e1e8ed8f65ae5924fa` |
| 221 | `test/编排/governance-ledger.test.ts` | D | `d5beddb51f1ba9fdb2ac039ab920fef6e300beca`（基线 8fc673e blob） | `86b7602a0fcb6e86f48974f27a8b839feb98c1ea163a9f0f2dc58985cb9b9b80` |
| 222 | `test/编排/governance-migration.test.ts` | D | `c458cf80eefca06859b8129849fc393a9f479601`（基线 8fc673e blob） | `44255cd5bbcd5697ceda1df520be25bff4b214593b989e8081dba25e1b62efa5` |
| 223 | `test/编排/governance-reaccept.test.ts` | D | `2993fcc1a749eb8c8e01e5418d9d91a5a9fddd92`（基线 8fc673e blob） | `2d0f8621231e452722db0360867e6b6e94ea39666c67b907feaf8ebb972bfcdd` |
| 224 | `test/编排/governance-record-ledger.test.ts` | D | `03dea3b6c0a6f01acb3ac4bf8074a976f538a1d6`（基线 8fc673e blob） | `80eff2eeb91bdefd717da2dfee8c6a83c1d98a29d147ab3bcd3e624c86a5f217` |
| 225 | `test/编排/governance-session.test.ts` | D | `014ccedfcc01a0fa000a8ed39d94939a35bef8c0`（基线 8fc673e blob） | `236ffc891497337cd68f80545c2c906efe3e9b77902874e28819f3508b89c858` |
| 226 | `test/编排/liaison-handoff.test.ts` | D | `a63904127c424b4b9c84a771a0ec0e3819c48617`（基线 8fc673e blob） | `9f385ae1f2a56edb90c2d8b69a1917cd2109d56e2a952e2486d7b4db994ed6fa` |
| 227 | `test/编排/liaison-session.test.ts` | D | `bc2f28c6727f926b063b126ada7b70df61609282`（基线 8fc673e blob） | `6309839dd753de1d41d3fe6950ad381cbedd5cdc8aba26034f6b3903ef1d44c6` |
| 228 | `test/编排/report-artifact.test.ts` | D | `564b4b84a0f8bdde0f0546c49abb5ddf5b8fa40a`（基线 8fc673e blob） | `8009256c05630df9f4b35f46be14036737e52382dfa54b5fba980e4bc92e956d` |
| 229 | `test/编排/request-acceptance.test.ts` | D | `23a16f96ea963f54c16550c6ebc70b17e87a0df8`（基线 8fc673e blob） | `48832097f73be29836c504c516fc1757843723f91add5e9d36fc17e5524b08f1` |
| 230 | `test/编排/request-boundary-change.test.ts` | D | `42bdf6db5629f3ad266de0948d2ae82039d7cab7`（基线 8fc673e blob） | `0c8dc8384418efa4738d0a4145832a0a610e0f323d3ddddd10e47028c97a7417` |
| 231 | `test/编排/request-gate-review.test.ts` | D | `f62b34f7ffa552b33dd976f1e219a66fb158cfaa`（基线 8fc673e blob） | `408a1df3bfdba21e04117cfcd0db33fe6f773442610dd59bbde463ac7b83039b` |
| 232 | `test/编排/request-requirement-change.test.ts` | M | `63f8215ba8057b05772615a6f8a0e5e0227dab0c` | `bcf15e450acfebca15944cff8177cca54b82a1761db7c31386a4d60cc7381bdf` |
| 233 | `test/编排/requirement-change-judge-guidance.test.ts` | D | `87dd4c96b7151b762dd7102def6d8cfea0807a1a`（基线 8fc673e blob） | `184d5eac19780a09fc433532e2623940bb0050f63902ebefcc4eb9851c999ab2` |
| 234 | `test/编排/section1-write-preauthorization.test.ts` | M | `a061faee8b4413d351a61001dd01f3d6ff9a3553` | `0d39349ea2a0e4357d61033008300c1f55a7bcb6e58005f92dc2a1a98a95b212` |
| 235 | `test/编排/task-state.test.ts` | A | `3a2d5f944a5d366fb19e5a2e31ac787e19c7f624` | `9dc50a5df9794f3bf56f91b000d284ead1c9f59fec71d3b9acd1ec5d73f77f60` |
| 236 | `test/编排/team-plan.test.ts` | D | `f065269693daa63ac8868107e5dbafb46a0b848a`（基线 8fc673e blob） | `2f4dd1f5298986204f1df51a3248a03c835c17c75d07c9f571d025518ef1c216` |
| 237 | `test/编排/view-image.test.ts` | M | `88aadafc7f4b992a3b6bc1c46482d34bbd110bb3` | `31ce7e47fd1c80cf80a288ac3cf91da5f2a93fa1f72f2bc0ce395e54aa379e45` |
| 238 | `test/编排/watchdog.test.ts` | D | `3da1809b76c04e655fe8f1d4f945ca8cec305992`（基线 8fc673e blob） | `3dc548f8adc50082a22aa5fb47cc1c2b28af1f003440af72f95c0c7f4e3d676c` |
| 239 | `test/装配/govern-target.test.ts` | M | `f9b79f18f38ad2c398183f7bf18a39834095e8b0` | `95b5757bad9eeac8220e0f0aab99b9f3131eb1a8f5218d27d6536a12828eeaaa` |
| 240 | `test/装配/release-packaging.test.ts` | M | `59e6838e8902e8452a7e3c13bd15fac7874cbd55` | `59b84e97bfa3b004dc803cb9507a692854517fd0e39ef2b614fd52e90d623f08` |
| 241 | `test/门禁引擎/customer-card-rules.test.ts` | D | `46764cbfaf43022ec62b4f94125023045bf397c0`（基线 8fc673e blob） | `0f61c8bfb8980188cf414d0541c6cf65a916c4d4641738c7ce8b65b002821751` |
| 242 | `test/门禁引擎/decision-card.test.ts` | M | `e9fb99c28ec0a6e4ed3d55a72cd1cb2ba1d6095a` | `47fbcad848275900ee0d5c1f8d64997b54721f9bcf6017a368adee319729003e` |
| 243 | `test/门禁引擎/gate-review-flow-busy.test.ts` | D | `e60ed37cf56b427751889d3ce3b6cb089587bba1`（基线 8fc673e blob） | `35e05a714894cafd7711ae2faa42c8540a2095019dadbeacdf69b5b75f8f2e0a` |
| 244 | `test/门禁引擎/governance-standard-workflow.test.ts` | D | `f714a12f04880c08df49075bcdbbc836f7f05610`（基线 8fc673e blob） | `89f166b5eee10dcd1b7d125bcf49cd257876ca6c170f3c397b0a1f67e804453e` |
| 245 | `test/门禁引擎/governance-trio.test.ts` | D | `06e692d01e87f08474ce79e59aa58dc322af8953`（基线 8fc673e blob） | `8056e503b6113e961e533592699b6432257c8810cdd7b275b082ebd4380b7902` |
| 246 | `test/门禁引擎/liaison-role.test.ts` | D | `f1f0923b86615045575b710ed8713934da06dcf2`（基线 8fc673e blob） | `87c06fe67ea3bbb392998cfed02fac0b689fd8858ed71ea80de589e28e5155d0` |
| 247 | `test/门禁引擎/list-project.test.ts` | M | `61ae132650751fdd914d97d21d8ea7f2204d45e9` | `e0c94f1022e62a3125cf887322fd5dc6b79fc498ec0b89b706ffc96b9df514df` |
| 248 | `test/门禁引擎/requirement-change-cards.test.ts` | D | `83d782199bd4ed7be8d7466addceb9031510b972`（基线 8fc673e blob） | `82b5c26a227071d663998c1ffe0d0a91ce8a8b8ca4573949d3036b7a1491b59b` |
| 249 | `test/门禁引擎/screenshot-only-evidence.test.ts` | D | `fb57faaf847752cfcc167a67d16864d549105dcc`（基线 8fc673e blob） | `7a31be8228a6334864ff9fb5a9bce32c972bfc46c631013b69ac5f2485eaae4f` |
| 250 | `test/门禁引擎/shell-approval.test.ts` | A | `99598b32f15720277cb647ab3082146e534359d7` | `fbc3056a9cbf7714d10d75af29c38f5e39ebe3ac10a08568237a65bc9a7302f7` |
| 251 | `test/门禁引擎/verifier-artifact-report.test.ts` | D | `e5863a6f690362096c2428af25f123004528d0e8`（基线 8fc673e blob） | `de8d5d944df61749d11e664895362f09270810d33af279e563e848f3540485de` |
| 252 | `test/门禁引擎/view-image-cards.test.ts` | M | `9b7b0b0cf9e97475551578347d8e3bcf6699ac4b` | `adc0192085b5fc3c91eaf470c5f769d4736330228b5166c6df9dd61a145d0f8c` |
| 253 | `test/项目管理/shared/i18n-guard-allowlist.ts` | M | `f11923d752cd85a216d1ca801834b1872fca39db` | `6c1d6a8d0440700bc51e92ffa4e1166b740b62babe366ce5c2a4d9d0694255b1` |
| 254 | `test/项目管理/shared/i18n.test.ts` | M | `b78021e2406a06b6b53af3eb80d93e86b9a45adf` | `975ba980e10232d73b5d06fd8cd45ff2a1b521752dbb69780c8c1eac963047cd` |
| 255 | `角色卡/Claude适配器/docs/change/2026-10-28_change_entry-role-minimal-C.md` | A | `babcc93130e68b7c59b1f222a2839c5c68e2d153` | `6192a5d6386e35c859ffd5e433126acc443ee188f770bc7881d74bd416c1a6b9` |
| 256 | `角色卡/Claude适配器/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `d1d7a08d6575d864081a13a12bdee3cfbebbf9ba` | `a232529d4d211dbc1e967177f055277501a5369746b78bb3e449f7645a0965c5` |
| 257 | `角色卡/Claude适配器/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `3b0e5b37ca47847951fe30b486d8753457012362` | `5e74ca44e64c4f0b6173dcd27088316bb51ca9811e09b321ae535e9d72438fdd` |
| 258 | `角色卡/桌面UI/docs/change/2026-10-28_change_entry-role-minimal-A.md` | A | `5f325e2d2e7ad75df9eb7f0b4940894ed7c61d4c` | `ae49a6d70ad5279503b204f0b0b861c75993e7ba85ec99f4fc20dc82846008a9` |
| 259 | `角色卡/桌面UI/docs/change/2026-10-28_change_entry-role-minimal-B.md` | A | `eae1f10c3ea4cf6ae7f84f62d3d13efff35f120f` | `cc5b303cb51d2385d00456f5caee31fe212c8b740f6ba6e1d5a6e5bee6f08627` |
| 260 | `角色卡/桌面UI/docs/change/2026-10-28_change_entry-role-minimal-C.md` | A | `a3717eba3458da5893acf61a1c2e874b038f2f6f` | `71d1c9184aa9b4bc0de15d45eb9b25637e246924230442b03f4786b753882d46` |
| 261 | `角色卡/桌面UI/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `84740b4115c515a1686f6eddc0d676fed512b494` | `58832f5571a2b9ba19d2bb6d84a3211755fa8b097cea8e902018dcaa855a6d65` |
| 262 | `角色卡/桌面UI/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `f60193e892fa50dad8eeeb79a771b211121d826c` | `2caf293ba5e476d067204ce11058bda1e3e0ee348e8417f9b72caebadaada3f8` |
| 263 | `角色卡/桌面窗口/boundary.md` | M | `2b0927a5e4420f62a828b0159619f5ba440d8ce5` | `a031a9ee3ff390edad14b1ed0cb75ea00acb7c5a824c39e946a4f3036e706226` |
| 264 | `角色卡/桌面窗口/boundary.yaml` | M | `d47e13d22bf6a872ff5e1ebed761c2108a270315` | `b30da82ba740e0aadbacd325d9205f216a8f9a8dcc368f0f04b183bffe0b0984` |
| 265 | `角色卡/桌面窗口/changelog.md` | M | `137cc815982fbeefcde9ef8c8c1b3d01a71e4d13` | `2d14077629dd48d27af9c63156a30c1be65e3c176d5c400918491841fa74f222` |
| 266 | `角色卡/桌面窗口/docs/change/2026-10-28_change_entry-role-minimal-A.md` | A | `0f5d38165a63fd876b3b27f82428eadb68be6fd5` | `79caabaaa78dc3ec73287a67a1d76c75eec2179600138d955c4cc7546b8eaaf9` |
| 267 | `角色卡/桌面窗口/docs/change/2026-10-28_change_entry-role-minimal-B.md` | A | `0418f8a808a3dac07a05557d3c35357cb6afa628` | `31af90a2ca5ef27c827c9ccae50a1d56feed8e585cf743f07e91ceb363f1c341` |
| 268 | `角色卡/桌面窗口/docs/change/2026-10-28_change_entry-role-minimal-C.md` | A | `f6d5a70ee56e881a12021fc7f6e1aadcc058682b` | `76cae1a1a4fc77e5674fefb8c19fd15a42b4f90b3c9a6a5c1d95058a6841ffc0` |
| 269 | `角色卡/桌面窗口/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `d6da4c1186ba15fa5fd63700c5d3f0cc7ac95d6e` | `c82c1af09ad207b3b6ae537ee4aafcc1e78eba152b174a75e132f90dd29b9449` |
| 270 | `角色卡/桌面窗口/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `42aac5d642c0288c9d6b7ec32ebcc91db6e345a1` | `24871441a231d5f696b0ca3a9173f27f52dad9f7c505d17723d808a761c0d2cf` |
| 271 | `角色卡/桌面窗口/docs/change/2026-10-28_change_entry-role-minimal-F.md` | A | `3e530149157fbd865b77cf739b0c658bab0e8681` | `691348fd2b99c16d8663ac1ee1736419acc84f69e72313f63000986564b439f7` |
| 272 | `角色卡/测试/changelog.md` | M | `39df36156f27edb8c9325bf9541f90dd0608fcff` | `d7ee376fa21bbf888d69cbea858e3fdc7ab9f949b4ed7dbd780f9acf2415d899` |
| 273 | `角色卡/测试/docs/change/2026-10-28_change_entry-role-minimal-A.md` | A | `88e2ac1b749d38f5ae5f1b65113ea849d32fd262` | `580809e00c22c86ac2986e0bfc4840714af28acad1bbc4f928acb1ab42df1831` |
| 274 | `角色卡/测试/docs/change/2026-10-28_change_entry-role-minimal-B.md` | A | `eb7c46dfde07e3ca282919a4c4c13cff936b005c` | `a3696dfae0906258dc30335098f19e2fc91189b3bf72376ec52d2b8d5fe94dc6` |
| 275 | `角色卡/测试/docs/change/2026-10-28_change_entry-role-minimal-C.md` | A | `45b0569188535e0e45323b5aab8129dd4eccccbf` | `7f75281a75784eb2dffe5f46d1d0e0dda57e22ccbe18d89772db6f86b83e230f` |
| 276 | `角色卡/测试/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `acc84ccebc0e0dde44e470781f49724648a6c7c5` | `96c7393bd0085fe46fd4af683cdd79e7aa3b7af55c7678627b51de65657835bc` |
| 277 | `角色卡/测试/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `bc900e50d4fb0403700799ca38d009c721b95adc` | `17286c6b9aec5e8130167772bcd21d5b18b955d489ef20a4d169d2977c6fa45b` |
| 278 | `角色卡/测试/docs/change/2026-10-28_change_entry-role-minimal-F.md` | A | `4a084b4cd52c1632e4d8c85050bba4f7f1fa5b9e` | `dcf7d4e8af8cfd5705134abc51c533a7221e23e79d56df78e818c810edb8fce4` |
| 279 | `角色卡/独立验收/changelog.md` | M | `970b3d5ee2e416ec6a5e2bfc8ad9842e251f5be0` | `15b5e87f80ab4b152bc9f02fa8d1ed2ad5672f7a2a64af8cb4e6a5db35ee94a1` |
| 280 | `角色卡/独立验收/docs/change/2026-10-28_change_entry-role-minimal-B.md` | A | `46c22ad0c036884bc8ef1dcc4a1231ee189574a7` | `403d3e1ace4672a0041cbfc46aaa3a7ba76e87b22a0bc7facdc0f04a16659c9e` |
| 281 | `角色卡/独立验收/docs/change/2026-10-28_change_entry-role-minimal-C.md` | A | `5af8b9ac78ac73c2cd161f9e4252e9ab27641723` | `d19de0dd50da858e29346d8f11a212f84806efbeb387177b2c3926d466b61dfa` |
| 282 | `角色卡/独立验收/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `a71f0c45ee67a7940ed956cf2e28f2917b27e65e` | `d9fc3edf5de72fe62cf713736e0358fd6b8c914f68b2aaf760619d46027b3431` |
| 283 | `角色卡/独立验收/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `c89f237cb18fb9ea8601ab23fcae6e2b2a3343b7` | `77862a354200e2826ca07325332a606c5c526822b7501a61fee976fb6a35a9ee` |
| 284 | `角色卡/独立验收/docs/change/2026-10-28_change_entry-role-minimal-F.md` | A | `e14d5cddba448b2886859a5964d2c90ac9e67231` | `ee1f189b0733b44fdd74fc7d0c7d91044809acfb5f51f5d6b3188504c2074e2c` |
| 285 | `角色卡/编排/docs/change/2026-10-28_change_entry-role-minimal-A.md` | A | `91b0d14c3af1f0c01f1fad0785ff398aba5a0d21` | `d526576db9b42fece6e60654ee5bbddf2859ec4fb70e60597e3466d78301518a` |
| 286 | `角色卡/编排/docs/change/2026-10-28_change_entry-role-minimal-B.md` | A | `2cb307eed7717cee89a32a2550223cd6fed02349` | `2b5e9d2de37f4eea50129f172be973edb66159ad61cb9539aee0546f2d717316` |
| 287 | `角色卡/编排/docs/change/2026-10-28_change_entry-role-minimal-C.md` | A | `8d711a7299d59973bb548a6439597cac4e4cfba3` | `d4395c1485150bafa4d1fb92c01c25d5a1658703ae98c75e38b4e2da9821ad8b` |
| 288 | `角色卡/编排/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `703f51ec86294fd9a6989b567afe1149be1c4ba4` | `6a661f9876bf1a8620ce140b2d2a487bb94f739eb09f21c4cded6d8e9f97919e` |
| 289 | `角色卡/编排/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `cad262138ea8e951026b52ea35a319c5da5afd4c` | `d44460aa97d5e84e4e400c68740590e85717f753fa821d4963c88d4742b25c4e` |
| 290 | `角色卡/运行时核心/docs/change/2026-10-28_change_entry-role-minimal-B.md` | A | `7a5f2027673cf04bfd6c5d9f78da7462aa779dd6` | `56f6665e9cb8208b5ff6d3e73549831e9919a2f7007f7b045dd8020ead03eaed` |
| 291 | `角色卡/运行时核心/docs/change/2026-10-28_change_entry-role-minimal-C.md` | A | `592462869842f671cc8bbfa402dbc979e373ac25` | `53a5c6bd008454fcc3f3c1f9187805af112f65ab3bb898d3faae3fa400ea7634` |
| 292 | `角色卡/运行时核心/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `bf8f2a7597e658d9fc1d89a079ad9f20233e967b` | `0115fe608870693546f07d9a42e72acbe3113141711c20637ffa948e30f97e92` |
| 293 | `角色卡/运行时核心/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `91c830fcce74e681d20a6942ad43b24a4152c65d` | `87d9a63c3811ecfddad6bfa6405b45ba16b709779d24905987354e6ef1f29d7d` |
| 294 | `角色卡/门禁引擎/changelog.md` | M | `e67a115780dd04eeb4cf46ff7ad78cc048ce0cf0` | `58bd0449955c7af083abfe79d91a10ae59aa54847c042b03adb704395ce3c153` |
| 295 | `角色卡/门禁引擎/docs/change/2026-10-28_change_entry-role-minimal-A.md` | A | `f891b33c5e190f20d0a5f6a851da3834c3cda3c1` | `e0cbee8ab4ec99f4019d3e104e283daeb78390368dd3c3695be37c638554b51c` |
| 296 | `角色卡/门禁引擎/docs/change/2026-10-28_change_entry-role-minimal-B.md` | A | `ce0c32872e47111971203bfd4b671946d3be94c5` | `af45838795538dcb2f977520a5e354f6cd0b141961c2511894b2f40e9e80d5d0` |
| 297 | `角色卡/门禁引擎/docs/change/2026-10-28_change_entry-role-minimal-C.md` | A | `9c2927c2862505f4fe88909220f78dffd98fb171` | `a9e97a57c711b4fb41214cd831b96e3116ef3620fdfe8254339f17d0698255d5` |
| 298 | `角色卡/门禁引擎/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `66e04de133bcf2f2c5ff2e5430fdd3173392ab55` | `d33bc78e7f38fbc29ef7bdb5e7f854d7249eeb2c090130963ade828e63a3f729` |
| 299 | `角色卡/门禁引擎/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `0e8ba5ee69007953689f5ceea9053909c67e7878` | `b7b03a27c54e802f0e8bee99101a1249a796cdf9e164eaa138049c0c1b44313c` |
| 300 | `角色卡/门禁引擎/docs/change/2026-10-28_change_entry-role-minimal-F.md` | A | `725c8ba3c8b406854f7494229a95175728374779` | `bbfd78a325e1ddab130aa90d55217894dcb2f40b6e4a4ec296d4bf1a6ea6d468` |
| 301 | `角色卡/项目管理/changelog.md` | M | `f583658cccd1473f07df5f28f6f6e0863c7b486f` | `5080c7042868b6c555266be014d3f38f72ba7ddb707bc0c6d7d1da91a6d4b930` |
| 302 | `角色卡/项目管理/docs/change/2026-10-28_change_entry-role-minimal-A.md` | A | `3da5b9057dc47c1af03ed3327f2fd66601a292f2` | `d634c4000f8dad0299db04f4cedefe23e5b64328f76834b0e3edc81935a0a0b4` |
| 303 | `角色卡/项目管理/docs/change/2026-10-28_change_entry-role-minimal-B.md` | A | `924f45e243fce53729b6e849d0111baebf1cd356` | `7ec30dcb35589892562ada9a0a3370fd485b918f5d29c15e7938a2e361c87d5e` |
| 304 | `角色卡/项目管理/docs/change/2026-10-28_change_entry-role-minimal-C.md` | A | `13a97cc33b17f5caad59b7ec19b4b9634ff16e33` | `4d3e55c3c22e2ddfb9f3cb9d23dbf7ab4c8a3e56c0f3965caa3068e9c468de72` |
| 305 | `角色卡/项目管理/docs/change/2026-10-28_change_entry-role-minimal-D.md` | A | `38a767f109fc15b5460dd05c5f1d14b65ff9d0ac` | `810b3bd8aa0d7faf49c4605aad63f82624cc916b033bf5a2e43c2cb4e0ede928` |
| 306 | `角色卡/项目管理/docs/change/2026-10-28_change_entry-role-minimal-E.md` | A | `b14118a873c2094dc6a211c749ee1e68ead93902` | `484e3043fecd6d24d0228d028c00aec92126f281761fc669e14a9213b2b76e31` |
| 307 | `角色卡/项目管理/docs/change/2026-10-28_change_entry-role-minimal-F.md` | A | `e7b335c39526b63984a22cd170eed6844be8e497` | `9ea27d46498a10af12d01379540146c7339bd610fc68855381389d299bf395bb` |
| 308 | `角色卡/项目管理/docs/project-rules.md` | M | `c51fa0831db141094bfc09135895fe54484579d3` | `1807af39f0ddb2991d6a5489278bd30e8b0f8bd1a73f8b07804b2c4a1656aaed` |
