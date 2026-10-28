# entry-role-minimal 终态报告 v1（供独立验收终态判定）

- 日期：2026-10-29｜任务：`2026-10-28-entry-role-minimal`｜程序：entry-role-minimal（幕僚 + 最小系统）｜风险档位：**T3**
- 记录角色：统筹/实施上下文（非独立验收）；**本报告是实施侧终态事实与证据索引，不是独立验收报告、不是验收结论、不是发布决定**。终态判定由独立验收按 `docs/acceptance/entry-role-minimal-criteria-v1.md` §11–§12（F-01–F-08、FIN-01–FIN-10）作出，并另写 `docs/acceptance/entry-role-minimal-final-acceptance-report-v1.md`。
- 隔离：worktree `.claude/worktrees/entry-role-minimal`；分支 `feat/entry-role-minimal`；本地逐批提交，不 push、不合并 main、不发布；`package.json`/`package-lock.json` 零改动。
- 依据：A/B/C/D/E 各批均判 pass（A v3、B v2、C v1、D v2、E v4 报告 140 行 / `0b1fe68f…`）；E 最终 HEAD `9a23b88`（代码/测试内容 `dfd7361a`）。

## 1. 组合候选与提交链

- **F 代码/测试候选：`e008187`**（父 `9a23b88`），整树 `70412769a5b1876c289738d0793720422be5c557`；F diff：**6 files = 5 M + 1 A，+643 / −12501**。
- **F 文档提交**：见本文档所在提交（change-F/终态报告/属主记录/处置记录）；change-F 自身行数/SHA-256 与最终 HEAD 由验收/最终记录复算。
- 程序累计（相对基线 `8fc673e`）：**294 files / +13112 / −131336**（79 A / 125 D / 90 M；31 个本地提交）。
- 批次链：A `f4aa073`→返工 `e5a533d`；B `e5a533d`→`f151a86`；C `d364ea6`；D `c2b6cf9`/`98d3fe2`/`4c24149`→返工 `e8e5c1f`；E `e7ac5b2`→返工 `d30f648`；E 文档 `9a23b88`；F `e008187`。
- 候选身份/逐文件哈希：本报告 §8（F）与 `change-D` §10（74 文件）、`change-E` §8（44 文件）、A/B/C change-package 附录（各自候选）。所有哈希可按 `git hash-object` + `git cat-file blob | sha256sum` 复算。

## 2. 终态事实（P1–P15 / G1–G7 证据索引；判定归独立验收）

| 条目 | 终态事实（本程序） | 证据索引 |
| --- | --- | --- |
| P1 六角色/主入口/liaison 不存在 | 注册表恰 `chief/product/rapporteur/nominator/convener/verifier`；`primaryRoleId="chief"`；`governanceRoleOf("liaison")=undefined`；liaison 运行期别名/`builtInRoles` shim/写归属来源已删除（保留 id 目录跳过仅为旧目录防御） | D 专项测试 5/5；`list-project` 测试；`change-D` §3；F `rg` 0 |
| P2 星形工作流 | 任务只由幕僚派发（trio=chief，single=su 旧行为）；结果只回幕僚（`[工作结果]`）；运营无 dispatch/role_status/session_tail | `star-routing`、`chief-workflow`、`handback-delivery`、`i-full-chain`；desktop 326/326 |
| P3 申请直达/应用裁决/系统通知 | 决定卡镜像面已删；申请卡只在来源角色会话/客户通道；`request.notified` 系统通知；结果回角色 | `application-line`、`decision-service`、`pending-card-restart`；E 对话框/待办/历史 |
| P4 双开关/judge/cardKind/回落 | `GOVERNANCE_CARD_GROUP` 保留 proposal/appointment/acceptance/intent-confirm/decision + appointment-write（approval）；judge rubric 与 2026-10-19 回落语义保留；关闭弹卡、开启代批；幕僚不选卡 | `decision-service`、`operator-view`、`phase5a`、E2E `OP_*` |
| P5 tasks.jsonl 主状态 | task/report/request/decision/notify/redispatch 事件；重启恢复（未投递重投/已投递不重投/坏行跳过/收口不重投） | `task-state`、`task-restart`、`pending-card-restart`、`i-full-chain` |
| P6 旧治理机器不再存在/生效 | gate/flow/账本/团队计划/分诊/返工/handoff/强制证据/自动编排已删除；无相关 IPC/UI/API；single/su 可打开且无 flow 工具 | D 删除 23 生产文件 + 104 测试；D-04 `rg` 0；F 清理 `interface/session` 死代码 |
| P7 验收幕僚调度/可选 | 幕僚可自核（role_status）/派 review 给质检；申请由发起角色直达、客户/judge 裁决；无自动验收派发/gate；不要求每次独立验收 | `optional-acceptance`（4/4）；E2E `GOVERNANCE_DISABLED_NO_AUTO_DISPATCH/NO_AUTO_SESSION=true`；F-05 `rg` 0 |
| P8 写区/shell/角色卡边界 | 六角色目标写区（D 生效）；shell 审批独立；appointment-write D3+结构校验；写盘预授权 | `write-safety`、`su-effective-boundary`、`shell-judge-verify`、`section1-write-preauthorization` |
| P9 主窗口=幕僚/独立对话框/任务日志 | 决策对话框（一次一卡/优先级/稍后/待办/历史/无障碍/二次确认/聊天流无卡）；tasks 面板/日志徽标；启动/重载 | E 测试 6 文件 + phase5a 30/30 + E2E 17 PNG；`E_TASK_PANEL_VISIBLE`/`E_ROLE_LOG_VIEW_VISIBLE=true` |
| P10 i18n | `ui 850 / main 541 / shared 62 / preferences 3 = 1456`；zh/en parity；旧 flow/triage/gate/ledger/acceptance/liaison key 0 | `i18n.test.ts`、`i18n-b1-b2`、`i18n-guard` |
| P11 无 legacy/零写入 | D-04 `rg` 0；liaison 别名 0；心跳/report_progress 无机制；主检出前后快照一致；demos 未打开 | 本报告 §5；F `rg`/快照 |
| P12 三条方案 Q13 A | 处置记录（合并包保持；机器部分重审/取代；文档原则按需保留；不写关闭） | `docs/planning/2026-10-28_entry-role-minimal-three-plans-disposition.md` |
| P13 真实应用演示 | 真实 Electron E2E `E2E_PASS=true`/`E2E_DONE=1`/17 PNG；启动/导入/聊天/拒绝/回交/恢复/bootstrap/对话框/任务日志/重载 | E2E 报告 `2b73e5f6…` |
| P14 日志/巡检/终止重派 | 角色日志/巡检/终止/安全重派（副作用分类/上限 2/升级/幂等/部分写入） | `role-log`、`log-patrol`、`log-stuck`、`stuck-redispatch(-safety)`、`log-actions`、`watchdog-reuse` |
| P15 pending 卡/重启 | orphaned/expired 回待办/历史、不自动执行、幂等；shell 不重放 | `pending-card-restart`、`task-restart`、`session-rebuild-race`、E2E 恢复组 |
| G1 静态结构 | 双 typecheck + build exit 0；写集内；无新依赖/目录/跨层私有引用 | §3 静态日志哈希 |
| G2 动态证据 | 规范全量 2908/2878/12/18；真实 Electron/phase3b/phase5a 全过 | §3 |
| G3 契约 | 六角色/工具面/事件 schema/cardKind/IPC/UI/i18n 快照按批核对；Q4 A rubric/回落保留 | A–E change 快照；D 专项 |
| G4 治理 | 闸门 1/2、Delta-1~7 按确认执行；本地批次提交；project-rules 修订范围正确 | change-A~F；memo |
| G5 验收 | 逐批独立验收 pass；F 后组合候选待终态判定（本报告为其输入） | A–E 报告；F-08/FIN-10 |
| G6 边界 | 只改批准写集；未改旧项目角色卡/边界/目标项目；产品角色卡不改；不 push/合并 | §5；git status |
| G7 回滚 | 各批 `git revert` 可执行；无数据/schema 迁移；tasks.jsonl/日志可删/忽略 | change-A~F §回滚 |

## 3. 终态验证（与 change-F §3 同一原始记录）

- **规范全量**（排除基线挂起 `write-sequencing.test.ts`）：**2908 tests / 2878 pass / 12 fail / 18 skip**；相对 E 2903/2873/12/18 = +5/+5/0/0；12 fail = 9 Windows symlink EPERM + T1×3（基线既红）；日志 `%TEMP%\f-full-canonical.log` sha256 `18a4415283ab5f2e929d75ffe84e63997a24b00c5e49fde5300a3c789a0d6be9`。
- 参考：含 `write-sequencing` 的探索跑 2911/2881/12/18（该文件 3 tests 通过后进程退出挂起为基线已知；不计入规范口径），日志 `4c4eaa94…`。
- **static**：`typecheck` exit 0 `aee16865…`；`typecheck:renderer` exit 0 `914780f6…`；`build:renderer` exit 0 `ff7f1dd0…`。
- **Electron E2E**：临时夹具 `%TEMP%\ans-e2e-f-fixture-5mKJRC`（仅 `角色卡/桌面窗口/`）、fresh userData；exit 0；`E2E_PASS=true`、`E2E_FAILURES=` 空、17/17 PNG；报告 `2b73e5f6aee7b0613b484ce7977fa58e4ecf46e0d8c3a00917e956be8bcd775c`。
- **phase3b**：45 checks / 0 false；report.json `2f98c884…`。**phase5a**：30/30、failures=0；report.json `76dc0c91…`。
- 环境：Windows 11 Pro 10.0.26300；Node v24.22.1；Electron 44.7.0；无 `.env`；E2E/冒烟均用临时夹具与临时 userData。

## 4. 测试差异闭环

- 附录 A 119 逐文件闭环见 `change-F` §4.2（D 最终 = 删除 82 / 重写 22 / 保留复核 15；表外 22 删除 + D 新增 5 tests 逐项列于 `change-D` §7）；E 11 个测试文件见 `change-F` §4.3；F 2 个文件见 §4.4；E-02 保留复核解释见 §4.5；E2E 36/40 口径见 §4.6；任务/日志真实夹具 smoke 见 §4.7；i18n 1456/parity 见 §4.8。
- 无新增确定性失败、无新增 skip、无「删除测试保绿」；测试集变化符合 D 大删除、B/C/E 新增、F 收口的预期。

## 5. 无 legacy / 零写入 / 隔离

- `rg`（D-04 口径）0 命中；liaison 运行期别名 0；心跳/`report_progress` 无机制（仅负向说明）。
- 主检出 `C:\Users\51054\Desktop\work\ans-studio` 前后快照一致（status/HEAD/diff/index/stash；diff 0 行）；worktree 仅 F 写集；`demos/`/`dragonball-*` 未打开/未枚举（E2E 用独立临时夹具）。
- `package.json`/lock 零 diff；不 push、不合并 main、不发布；旧账本/flow 文件未写、未迁移。

## 6. 文档与收口

- change-F：`docs/scheduling/2026-10-28-entry-role-minimal-change-F.md`；三条方案处置：`docs/planning/2026-10-28_entry-role-minimal-three-plans-disposition.md`；属主 change/changelog：桌面窗口、门禁引擎、测试、项目管理、独立验收；memo：`docs/scheduling/memo.md`、`docs/acceptance/memo.md`。
- `project-rules` 最终核对：§二.13/15/16 已按 D 批修订，§二.9/11/12 不变；F 未再修改。
- `角色卡/桌面窗口/boundary.{md,yaml}` 已含 `optional-acceptance.test.ts`（Delta-1）；F 无边界变更；不新建角色卡目录；`角色卡/产品` 不改。

## 7. 已知限制 / 残余（不影响本报告事实，供验收判定参考）

- `write-sequencing.test.ts` 进程退出挂起为基线已知（3 tests 通过后不退出；规范口径按 S1/E 同口径排除）。
- 12 fail / 18 skip 为基线既红/平台类（9 Windows symlink EPERM + T1×3；Windows 权限 skip）。
- E2E 36 项旧快照检查仍 false（非阻断，见 change-E §6/change-F §4.6）。
- 无真实模型/网络/打包/发布验证（不属本程序）；真实 Electron 只验证离线 demo/夹具链路。
- F 对 `interface.ts`/`session.ts`/`project.ts`/`governance-roles.ts` 的改动属 `@ts-nocheck`/F-05 清理授权，无新功能/契约；若独立验收认为超出 F-02「产品源码不新增修改」字面，应按标准 §16 记录口径并判定（本报告如实标注来源与范围）。

## 8. 证据文件与哈希

- change-F 代码/测试 6 文件逐文件 blob/sha256：`change-F` §8（候选 `e008187`，整树 `70412769…`）。
- D：`change-D` §10（74 文件）+ §7（测试 119 表）；E：`change-E` §8（44 文件）；A/B/C：各自 change-package 附录。
- 本报告与 change-F 的最终行数/SHA-256：由文档提交后复算并记入 memo/最终报告回执（自引用文件不在自身内嵌最终哈希）。
- 结论（本报告）：**事实层面 F-01–F-08 所述工作已完成，证据如上；是否终态 pass 由独立验收判定**。本报告不授权提交/推送/合并/发布。
