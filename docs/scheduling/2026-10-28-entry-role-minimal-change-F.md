# entry-role-minimal 批次 F：验收与收尾（change-package）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：F（验收与收尾）｜风险档位：**T3**
- 性质：实施候选的 change-package；**不是验收结论、不是发布决定**。独立验收按验收标准 F-01–F-08、FIN-01–FIN-10 判定。
- 隔离：worktree `.claude/worktrees/entry-role-minimal`；分支 `feat/entry-role-minimal`；本地逐批提交，不 push、不合并 main。
- 依据：E 批已判 pass（v4 报告 140 行 / `0b1fe68f…`，候选 `9a23b881025c786fcbf908b0246d29055b567848`）；团队计划 §4.6、验收标准 F-01–F-08、Delta-1/6。
- F 代码/测试提交：**`e008187`**（父 `9a23b88`）；F 文档提交见最终报告。
- 组合候选（代码/测试）：`e008187`，整树 `70412769a5b1876c289738d0793720422be5c557`；F 相对 E 文档 HEAD：**6 files / +643 / −12501**。

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
- **真实 typecheck**：`npm run typecheck` 在无 `@ts-nocheck` 下 exit 0（`aee16865…`）；`session.ts`/`interface.ts` 头行 `@ts-nocheck` 均为 0。
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
- **目标项目/主检出零写入**：主检出 `C:\Users\51054\Desktop\work\ans-studio` 前后快照一致（`git status --porcelain=v2 -uall`、`HEAD`、`git diff | sha256sum`、`git ls-files -s | sha256sum`、stash 列表；diff 0 行）；worktree 仅 F 写集文件变更；未打开/未枚举 `demos/`/`dragonball-*`（工作树无该目录；E2E 用独立临时夹具）。
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

统计：6 files = 5 M + 1 A；`+643 / −12501`；整树 `70412769a5b1876c289738d0793720422be5c557`。`package.json`/lock 零改动。

## 9. 回滚 / 边界 / 已知限制

- **回滚**：`git revert e008187`（F 代码/测试）与 F 文档提交，重跑本批验证即可恢复 E 终态；无数据/schema 迁移；`.ans/state/tasks.jsonl` 可删除/忽略；旧账本/flow 文件未写、未迁移。
- **边界**：仅 F 写集内文件；`interface.ts`/`session.ts`/`project.ts`/`governance-roles.ts` 属 F-05/`@ts-nocheck` 清理授权（D 批遗留过渡死代码/别名），无新功能、无 API/契约新增；未改 `app/renderer/**`、其他 `src/**`、角色卡/边界、`package.json`/lock。
- **已知限制**：`write-sequencing.test.ts` 进程退出挂起为基线已知（3 tests 通过后不退出；规范口径按基线排除）；12 fail/18 skip 为基线既红/平台类；E2E 36 项旧快照 false 非阻断；无真实模型/网络/打包/发布验证（不属本程序）。
