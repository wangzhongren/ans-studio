# entry-role-minimal 批次 C：申请/决策通道（change-package）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：C（申请/决策通道）｜风险档位：**T3**
- 性质：实施候选的 change-package；**不是验收结论、不是发布决定**。独立验收按验收标准 §8（C-01–C-11）判定。
- 隔离：worktree `.claude/worktrees/entry-role-minimal`；分支 `feat/entry-role-minimal`；本地提交，不 push、不合并 main。
- 依据：团队计划 `docs/scheduling/2026-10-28-entry-role-minimal-team-plan.md`（**717 行**；SHA-256 `d7bc2626e6d504c250482e90e5c6eb3344072d43d29f6ea09566c54ce2f90921`；§4.2 run-role 已回写）§4.3（348–365 行）、验收标准 §8（C-01–C-11）、协调者 C 批放行前置（2026-10-28）。
- 候选：B 候选 `c4ee7ade2635ef45f2fa2ecbe4830c270163f2ad`；**C 实施提交 `d85031f665657f191af50fb606a2375e2ea1a71c`**；证据提交 `0d1e7a4bd936f9c266fb93a8e9d729c43061b465`（本文件的最终复跑记录提交见最终报告）。
- 整树哈希（实施）：`git diff --binary c4ee7ade d85031f | sha256sum` = `1249ca13a453ea7c79ec1daca83d7647573c3066fed781cb345d8fec5dc461e8`。

## 1. 批次目标与生效口径

- 申请直达客户（穿透幕僚）：内置角色经 `request_confirmation`/`request_choice`/`request_requirement_change` 直接提交；卡片来源=发起角色 `sourceRoleId`；应用呈现/裁决，结果回发起角色。
- 应用在 `request.created`/`presented`/`resolved` 时向幕僚发**系统通知**（`request.notified`，按 `requestId+event` 去重、摘要）；删除「决定卡镜像面=主入口」。
- `appointment-write` 保留：新路径 D3 `request.resolved`（`decisionId`+`targetRoleIds`+`intentId|taskId`）通过后逐次写卡；应用做结构校验，失败不落盘。
- 事件 schema：`request.*`/`approval.*` 全部写 `.ans/state/tasks.jsonl`（app-only）；不写账本、不迁移旧账本。
- judge 两开关、唯一推荐、2026-10-19 回落语义保持；Q4 A rubric 保留（仅 `write` 删除；`schedule-write` 留 D）。
- 任务升级卡改**应用直接发起**（`application:true`/`sourceRoleId:"application"`），不借 convener/rapporteur 槽位；`DECISION_CARD_ALLOWED_ROLES` **未扩大**；continue/redispatch/replace 定义人工处置并落地。

## 2. 事件 schema（C-03）

写入 `.ans/state/tasks.jsonl`（append-only；与任务事件同文件；`task-state.ts` 校验/重放跳过任务记录）：

- `request.created`：`requestId, flowId?, intentId?, taskId?, sourceRoleId, title, context?, options[], recommended?, at`（归属键 flowId|intentId|taskId 至少一个；旧 direct 卡片仍兼容）。
- `request.presented`：`requestId, to:"customer"|"judge", at`。
- `request.resolved`：`requestId, decisionId?, targetRoleIds?, intentId?, taskId?, by:"judge"|"customer", operatorId?, choice, reason?, judge?{engine,model?,reasonCode?,reason?,evidence?,selected?,durationMs?}, at`。
- `request.notified`：`requestId, to:"chief", event:"created"|"presented"|"resolved", at`。
- `request.orphaned`：`requestId, reason:"restart", at`。
- `approval.created`：`approvalId, sourceRoleId, approvalKind:"shell"|"appointment-write", summary≤200, declaredPaths?, commandHash?, toolCallId?, turnId?, at`（**`write` 已删除**）。
- `approval.resolved`：`approvalId, by:"judge"|"customer", operatorId?, decision, reason?, judge?, at`。
- `approval.expired`：`approvalId, reason:"restart"|"timeout"|"unavailable", at`。

脱敏样本（测试假 id；不是真实客户数据）：

```json
{"kind":"request.created","requestId":"req-d3","sourceRoleId":"nominator","title":"D3 角色创建","options":[{"id":"worker","label":"worker"}],"recommended":["worker"],"taskId":"t-d3","at":"2026-10-28T00:00:00.000Z"}
{"kind":"request.presented","requestId":"req-d3","to":"customer","at":"2026-10-28T00:00:01.000Z"}
{"kind":"request.resolved","requestId":"req-d3","decisionId":"decision-req-d3","targetRoleIds":["worker"],"taskId":"t-d3","by":"customer","choice":"worker","at":"2026-10-28T00:00:02.000Z"}
{"kind":"request.notified","requestId":"req-d3","to":"chief","event":"resolved","at":"2026-10-28T00:00:02.100Z"}
{"kind":"approval.created","approvalId":"req-aw","sourceRoleId":"nominator","approvalKind":"appointment-write","summary":"写角色卡 worker","declaredPaths":["角色卡/worker/role-card.md","角色卡/worker/boundary.yaml"],"toolCallId":"call-1","turnId":"turn-1","at":"2026-10-28T00:01:00.000Z"}
{"kind":"approval.resolved","approvalId":"req-aw","by":"judge","operatorId":"judge:claude","decision":"confirmed","judge":{"engine":"claude","reasonCode":"approval-ok"},"at":"2026-10-28T00:01:01.000Z"}
{"kind":"request.orphaned","requestId":"req-restart","reason":"restart","at":"2026-10-28T00:02:00.000Z"}
{"kind":"approval.expired","approvalId":"req-shell","reason":"restart","at":"2026-10-28T00:02:00.100Z"}
```

## 3. C-01–C-11 落实与证据

| 项 | 落实 | 证据 |
| --- | --- | --- |
| C-01 基线与前置 | B pass/候选 `c4ee7ade`；计划 §4.2 新哈希 `d7bc2626…` 已引用；Delta-3 fixture 已调整 | 本文件、`test/claude-adapter/session.test.ts` |
| C-02 写集 | 按 §4.3；**扩展 `src/common/编排/task-state.ts`**（C-03 必需，见 §11）；`package.json`/lock 零改动 | 本文件 §8；`git diff --stat c4ee7ade d85031f` |
| C-03 事件 schema | 八类事件类型 + 校验 + 重放跳过；全部写 tasks.jsonl；approval.created 仅 shell/appointment-write | `src/model/runtime.ts`、`task-state.ts`、`session.ts`；`application-line`/`pending-card-restart`/`write-safety` |
| C-04 申请直达+通知 | 来源=发起角色；无镜像；created/presented/resolved → 幕僚系统通知（去重）；结果回来源；worker 不注入 customerInput | `application-line.test.ts`（2/2）；`operator-wiring` 镜像段 |
| C-05 决策服务 | 两开关独立；decision 唯一推荐代选；approval rubric 保持；manual/deny/不可用退回发起角色；judge 审计不伪装客户；Q5 高风险本人（既有通道保持） | `decision-service.test.ts`（4/4）；`governance-judge`/`d-audit-ledger` 回归 |
| C-06 appointment-write | 新路径 `targetRoleId+decisionId` + D3 事实校验；路径全在 `角色卡/<targetRoleId>/`；role-card 必需章节、boundary YAML/顶层 role、非内置目标；失败不发卡/不落盘；legacy flow 保留至 D | `write-safety.test.ts`（5/5）；`validateAppointmentWritePreview`；session D3 校验 |
| C-07 发起方矩阵 | 协调者放行前置：**不扩大 `DECISION_CARD_ALLOWED_ROLES`**；应用升级卡用 `application:true`；convener/rapporteur 既有 decision 槽位不变；appointment-write 仅 nominator；worker 无申请线 | `decision-service`/`operator-wiring`；§11 决策点 |
| C-08 重启重放 | 未决 request→orphaned、未决 approval→expired；幂等；不自动执行/不重放；通知发起角色+幕僚；delivery/session 恢复沿用 B | `pending-card-restart.test.ts`；`restoreRequestState` |
| C-09 测试与验证 | +17 tests（5 新文件 + stuck-redispatch 3）；C 专项 63/63；全量 4569/4535/15/19（基线 4552/4518/15/19） | §9/§10 |
| C-10 i18n/UI 中间形态 | 16 个 `ui.request.*`/`ui.judge.directRequest*`；renderer 无改动（镜像已由主进程删除；中间态按缺省单面呈现，不假定转交）；独立对话框留 E | i18n 841/1447；桌面UI 属主记录 |
| C-11 证据与回滚 | change-package + 9 属主记录；事件样本；开关/回落/审计证据；负例；全量/专项/静态/Electron 日志与哈希；回滚=撤销 C 提交 | §10/§12 |

## 4. 申请直达 / 通知 / 镜像删除（C-04）

- `session.ts` 在每条客户卡通道外增加 `withRequestLifecycle`：**卡片同步呈现**（先调用通道、事件写入串行落盘），保留 D1「同一轮 signal 身份」语义；写入顺序 created → approval.created → presented → resolved。
- 幕僚通知：`request.notified` + `[系统·申请]` 消息行（`detail.source="request-notified"`）；按 `requestId+event` 去重；不是客户卡、不代答/不代决。
- 镜像：`mirrorRoleIdFor` 恒 `undefined`；`isMirroredGovernanceCard` 恒 false（保留导出兼容旧测试）；renderer 收到缺省 `mirrorRoleId` 时按单面呈现，不需要 UI 改动。
- 项目 worker：会话不注入 `customerInput`（原有结构性 fail-closed 保持）；worker 只向幕僚汇报。

## 5. appointment-write（C-06）

- 新路径（无 flow，用 intentId/taskId 归属）：
  - 卡片必须带 `targetRoleId` + `decisionId`，且至少一个归属键；
  - 应用读 `.ans/state/tasks.jsonl` 的 D3 `request.resolved`：`decisionId` 相符、`targetRoleIds` 含目标、`intentId|taskId` 相符；
  - 声明路径必须全部位于 `角色卡/<targetRoleId>/`；目标不得为内置角色/su；
  - 编排呈现前再校验 preview：role-card 标题+`ROLE_CARD_REQUIRED_SECTIONS`、boundary YAML + 顶层 `role` 与目录一致；失败 `declined+notPresented`（不发卡、不发行写入路径）。
- judge `facts.appointmentTargetRoleIds` 新路径由应用校验后的 `targetRoleId` 注入（替代账本 appointment 事实）；旧 flow 路径保持账本事实至 D。
- 旧 flow 路径（带合法 flowId 且未给 target/decision）逐字保留，避免 C 批破坏旧流程；D 批统一收敛。
- 实际写入仍经 gate + 工具层 boundary YAML 校验；失败零文件副作用（`write-safety` 覆盖）。

## 6. 任务升级卡（C-04/C-05 放行前置）

- `escalateStuckTask` 不再寻找 convener/rapporteur 槽位；请求为 `application:true`、`sourceRoleId:"application"`、`cardKind:"decision"`、`flowId`（任务 flow 或 `task-escalation`）、`taskId` 归属；共享 decision 校验以 `applicationOwned` 放行，`DECISION_CARD_ALLOWED_ROLES` 保持不变。
- 真实 decision 开关开/关（SessionManager + 真实 `createCustomerInputChannel`）：
  - 关：升级卡呈现客户（1 张，继续/重派/换人/终止，恰一个推荐 terminate）；客户手选后按裁决处置。
  - 开：judge 按唯一推荐代选 terminate；0 张客户卡；恰一条 judge 结果行；任务收口 `stuck-escalation:terminate`。
- continue：保持观察，不自动重派/不终止；写 `task.escalation.manual` 角色日志 + `[系统·升级]` 幕僚行。
- redispatch：自动重派上限已到，不再自动；人工核对部分产物后新建/重派（可先终止原任务）。
- replace：不自动换人；人工选择替代角色并派新任务。
- terminate：原有自动终止并收口。

## 7. 重启重放（C-08）

- 未决 `request.created` → `request.orphaned`（不自动执行原动作）；未决 `approval.created` → `approval.expired`（命令/写盘不重放）。
- 已 resolved/orphaned、已 resolved/expired 的事件幂等跳过；二次恢复不重复。
- 发起角色收到系统行（原 tool call 已不存在），幕僚同时收到 `request.notified`（application 来源跳过重复通知）；delivery queue/session 恢复沿用 B。
- 「重新进入待办/对话框」按计划留 E 批 UI；C 保证事件/幂等/通知/不自动执行，E 接对话框待办。

## 8. 改动文件与统计

- 实施提交：**29 文件，+1704 / −140**（13 产品文件 + 16 测试文件）。
- 产品：`app/desktop/{session,interface,requirement-change,governance-advance}.ts`；`src/model/runtime.ts`；`src/provider/runtime/{tools,schema}.ts`；`src/common/编排/{decision-card,task-state}.ts`；`src/common/门禁引擎/governance-roles.ts`；`src/pipeline/orchestration/run-role.ts`；i18n `zh-CN`/`en-US`。
- 测试：新增 `application-line`/`decision-service`/`pending-card-restart`/`write-safety`/`shell-approval`；修改 `operator-wiring`/`stuck-redispatch`/`governance-flow-metadata`/`request-choice-decision-card`/`request-requirement-change-tool`/`tools`/`编排/decision-card`/`编排/governance-judge`/`d-audit-ledger`/`i18n`/`claude-adapter/session`。
- 未改：`app/renderer/**`、`src/service/runtime/session.ts`、`src/model/decision.ts`、`src/common/编排/governance-judge-*.ts`（Q4 A rubric 原样保留）、`package.json`/lock。

## 9. 测试差异表

- 新增 +17：`application-line` 2、`decision-service` 4、`pending-card-restart` 1、`write-safety` 5、`shell-approval` 2、`stuck-redispatch` +3。
- 重写/修改 11 个既有测试文件（见 §8）；未删除测试、未新增 skip、未弱化断言。
- 既有未改文件全绿（包括 C-09 列出的 `operator-channel`、`session`/`interface` C 段、runtime-core judge 系列、`confirm-preview-completeness`、`decision-evidence-packet`、`decision-intent-drift`、`request-requirement-change`、`requirement-change-judge-guidance`、门禁引擎 `customer-card-rules`/`decision-card`/`requirement-change-cards`、`e-switch-matrix`、`g-judge-timeout`）；无新增确定性失败。
- `write` 删除口径：模型可见 schema 删除；旧 direct/legacy 通道（工具解析/角色矩阵/判定组/账本分类）保留至 D，旧测试与旧项目不破坏；见 §11。

## 10. 验证

- 全量（与 B 同口径，排除 `write-sequencing.test.ts`）：**4569 tests / 4535 pass / 15 fail / 19 skip**；B 基线 4552/4518/15/19 ⇒ **tests +17、pass +17、fail +0、skip +0**。15 fail 全部为基线既红（9 条 Windows symlink + 6 条稳定断言：S7-F、T1 pi/codex/claude×3、k-governance-feedback、e-audit）。**最终候选（证据提交 HEAD `0d1e7a4bd936f9c266fb93a8e9d729c43061b465`）clean 复跑**；运行前工作区无 `.ans` 残留（残留会令既有 acceptance-dispatch 时序断言偶发超时；复跑前已清理）。日志 `%TEMP%\c-full-final5.log`（sha256 `1ab460491fafc00097ad9b45552c1c5d0eba17b5557194026749fdde53dfb60c`）；实施提交 `d85031f` 上的 clean 全量日志 `%TEMP%\c-full-final.log`（`19f8188ef787573a5e863b494250aa1b59adea6306c8f135a4e59e64ab428dcb`）同为 15 fail。
- C 专项（7 文件）：**63/63**；日志 `%TEMP%\c-special-final.log`（`ecabc76629c9c55ce2bb46c40ae8bfb9dfa3457b0af9c14b9c651f87559ab7c2`）。
- 桌面应用全量：**803/803**；日志 `%TEMP%\c-desktop2.log`（`b009973923a1fe368c48c00c0261f7644a034e91add8cd2055e87b3037283ade`）；C-listed 编排/judge/门禁集：304/304（其中 1 条 symlink 基线在 Claude 适配器文件内）；日志 `%TEMP%\c-judge.log`（`7aec18f6907875bafd83980f923e144bc847f84140c54fd7e48bf9475feb3492`）。
- 静态（逐个 exit 0）：`typecheck` `%TEMP%\c-typecheck.log`（`a5f639a1f80ac13a0066e40c0b9b16a9c0e45ad18dbac0e9ef45489b545a9347`）；`typecheck:renderer`（`f849a6813604908999067fdfa819bc1bf9795df0fe2430105171eabe88593005`）；`build:renderer`（`7f23f216c307f2d776e671b5fce6cc291b7af2e2d2efa55a730acaf9947763d8`）。
- Electron（**最终代码复跑**，临时夹具 `%TEMP%\ans-e2e-c4-fixture-q897xP`）：**`E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空、`ROLE_COUNT=2`、`PRIMARY_ROLE_ID=su`、`BOOTSTRAP_PRIMARY=chief`、`BOOTSTRAP_ROLE_COUNT=6`**；截图 **16/17**（`00-titlebar.png` 捕获偶发 `UnknownVizError`，环境性；其余 16 张均 1360x860；A 批同项先例）；报告 `%TEMP%\ans-e2e-c4-out-dDWIjz\report.txt`（sha256 `226778f6ebeefebe74ce0c57fb84edbfad9601964c5ecae8665ebbedacb377c1`）；截图清单 `SHA256SUMS`（sha256 `d25239bcefbf5d55def383fb74d17d361f193862abd1755db2478b32f42c0a96`）。实施代码上另有一次 **17/17** 先跑（临时夹具 `%TEMP%\ans-e2e-c-fixture-mqxm18`；报告 `%TEMP%\ans-e2e-c-out-yb2Csq\report.txt`，sha256 `c978ab038b9287ae844000964c30807fd8b812b512f11ac9baf6ee300b1df4b0`）。
- 环境：Windows 11 Pro 10.0.26300（win32 x64）；**Node v24.22.1**；Electron 44.7.0；worktree/分支见页首。

## 11. 决策点 / 过渡态 / 越界说明

1. **`DECISION_CARD_ALLOWED_ROLES` 未扩大**（协调者放行前置）：应用升级卡用 `application:true` 共享校验，不借 convener/rapporteur 槽位；C-07 中其他内置角色的 decision 发起矩阵**未在 C 扩大**（角色自有 decision 仍限 convener/rapporteur），留后续批次按客户/计划收敛。此为协调者明确口径，不是遗漏。
2. **通用 `write` 卡**：模型可见 schema 与 `approval.created` 事件已删除；为不破坏旧项目/旧测试，工具解析、角色矩阵、判定组与账本分类保留 **legacy 兼容（不向模型列出）至 D**；`write-safety` 断言 schema 删除 + 旧 direct 调用兼容。`schedule-write` 按计划留 D。
3. **`task-state.ts` 写集扩展**：§4.3 未列该文件，但 C-03 要求 request/approval 事件写 tasks.jsonl 并可重放；校验/重放逻辑只能落该模块，故作为 C-03 必需的写集扩展登记（未新建文件）。
4. **旧 flow appointment-write 路径**：带合法 flowId 且未给 target/decision 的旧卡保持原行为；新路径才强制 D3+结构校验；D 批统一收敛。
5. **C-08 待办/对话框**：C 落事件/幂等/通知/不自动执行；对话框待办与「稍后处理」按计划留 E。
6. **renderer 未改**：镜像删除在主进程完成；中间态按缺省单面呈现，不假定 liaison/幕僚转交；独立对话框留 E。
7. **决策开关端到端证据**：在 SessionManager + 真实 `createCustomerInputChannel` 上覆盖开/关（应用升级卡），不在 Electron 夹具内模拟 judge 闭包；Electron 夹具覆盖应用 17/17。
8. **C-09 测试**：未逐文件「重写」所有列名测试；行为兼容的列名测试保持原断言并全绿，实际改动 11 个文件 + 新增 5 个；差异见 §9。

## 12. 证据 / 回滚 / 逐文件哈希

- 属主记录（9 份）：`角色卡/{编排,运行时核心,桌面窗口,桌面UI,项目管理,测试,门禁引擎,Claude适配器,独立验收}/docs/change/2026-10-28_change_entry-role-minimal-C.md`。
- 回滚：撤销 C 实施/证据提交并重跑 C 验证；pending 快照/`.ans/state` 可删；旧 ledger/flow 未写入、未迁移。
- 哈希口径：`git blob` = `git hash-object`（与提交 blob 同值）；`sha256` = 工作区字节 `sha256sum`（提交后可由 `git show d85031f:<path>` 复算）。本文件自引用行按最终字节在证据提交后复算（最终报告给出）。

| 文件（实施 + B-12 文档） | git blob | sha256 |
| --- | --- | --- |
| `app/desktop/governance-advance.ts` | `378ef074f0bfb2ee90b29c7c241d59fe3948d3bd` | `9977f68c7c044feb862056932d6a3d663feaea29156ac1c82e3a7b8504d0a59e` |
| `app/desktop/interface.ts` | `15fd7f59d10363e546688e6f001267fc626bad88` | `a2de1bd7ca30af2db34a344061e5b50a91f9fb67467f3cf9abd313c0327a8701` |
| `app/desktop/requirement-change.ts` | `0f611dfb8f839467c33c93d69c88094940b1e6bf` | `53fa71875b267f0c7c6fceac7cffd50e9cb18b00bc9e1c49a6c86c4f33be3011` |
| `app/desktop/session.ts` | `54ba4afbc7fc17788cfab0f7c5d7bbdadd909870` | `48bb7d9e62a3cc01f8336f9c5438de06f6345f64bb57413fca878400ea39e13a` |
| `docs/scheduling/2026-10-28-entry-role-minimal-change-B.md` | `c512211e602a2cf71c6d7fbfc1cd831a1909c4e6` | `2a2ddbb9a549074abc51690e6baa8c1af4400dd65e1ab9cc4f31698fc78fb4d2` |
| `src/common/shared/i18n/messages/en-US.ts` | `711621683e5b6e09226f390b6ffc4d72a6a12c56` | `bfd4d40fea26786332ec1b47629a9113582ab9b88256572e81b4cd58fbb7d314` |
| `src/common/shared/i18n/messages/zh-CN.ts` | `9817315b2783f2e4385ba62cc2526c93affd9c7d` | `1cbf9fd7cd51db4c0d3d0cd5ec597b1317ebcac8d8dd5a4ffee0efff72b32dfa` |
| `src/common/编排/decision-card.ts` | `31b88e9e397c72711d8c99bf50acf0db1f8321e0` | `ef90c2096b2fdaa67c199bcb54d1a6743389914faad2ffae3d0db244c0a945b5` |
| `src/common/编排/task-state.ts` | `d8a4708112d85024705245332ea5210ab8b4b06c` | `6c38932b4b918c76880eb3cf155416c260fefe4d81aac8730354ca9a094e76c2` |
| `src/common/门禁引擎/governance-roles.ts` | `6b03fe3ddefe88ae5083014fc5e87de8f78020dd` | `e9d26f3b13724b72a3ffc827f08eec139b2af5e7562e59660455e0e96d1007b3` |
| `src/model/runtime.ts` | `8e03c708cc976dc427a11f10506c02c5de917737` | `635442cf22a1bdd7718cb354f6f6aaf547cd26234fbc42ea760f53e13f4bd50f` |
| `src/pipeline/orchestration/run-role.ts` | `6679fc66c026c0d78fd5e5864159283aaafafbb7` | `4d8ae790c6e275a33205f20141b684b5e0bff7a03a7529a25d8815697abe30eb` |
| `src/provider/runtime/schema.ts` | `ea19ac35ca339937f46fb0d9d3b3eb229a79fbe5` | `062ab00d966d0546d7c03de3da9cfd016dde7d6c56f24a53b7ac10e661574054` |
| `src/provider/runtime/tools.ts` | `a687e6ae26cd66c95d92b60b0b2b41aa86f07fe3` | `55d5b311662970fa08f3a66c602e1e269461fc1a353789a47dbaf3670aee3a6f` |
| `test/claude-adapter/session.test.ts` | `e2910b34b520afbc7ef85747230aee1ede213eaa` | `1d49fb01f5aeace2eb8c2e4255b6fcf185e8466fd5d9a7a3c19b472556b19c18` |
| `test/runtime-core/governance-flow-metadata.test.ts` | `e5bec9bbb95f594fda21088d8935128bc441d8a5` | `63aa646831d2d6bd0c3a2e6c453e9c14fc9a68303a0895ba3c3a5eb2324f0f3f` |
| `test/runtime-core/request-choice-decision-card.test.ts` | `c834d11ea4f74a6065c23b352a43ffeae62f1ac2` | `83890570aa3188ce957ce38405b59cd5fc685f8dc1948f5be693832e8a948714` |
| `test/runtime-core/request-requirement-change-tool.test.ts` | `f147250060ae93de90c415dedb6cca6b6a80a6ab` | `3feb40d2e80d28cc6c6dfb5fad4eef5dcf24767a73e2adcc302b0f72d6fd58ca` |
| `test/runtime-core/tools.test.ts` | `fc40d0051708b9111943f3c4d4dae91532a91edc` | `911736f5d0f62cb5eb22e7261d2ad1386b469e980c773774fa0d0053a3edd3d4` |
| `test/桌面应用/application-line.test.ts` | `66e4adbaa3385f44095b88e0ec8cecdf97da3a5a` | `49fc89b0ea16aafcf71357aef352e1d72250f0f6f08c0f54c47c28a7fc46b065` |
| `test/桌面应用/decision-service.test.ts` | `aaeda81e3e03d6fdd5bb695141492b5f5564af47` | `41aa678d86782bafa7d7d2b8e4af6df5f3d67ca3b49d26cb76d3f2e5d6d36e7d` |
| `test/桌面应用/operator-wiring.test.ts` | `044ee633f7654e47d3780d3a18022c441ec9b20a` | `cbaf328e2dd86c2ecad42383f56f5f4e63e024dab53f2d6492a1960bc5979a68` |
| `test/桌面应用/pending-card-restart.test.ts` | `56f1e0a116475e58a6f6e4572a9651c4a82e4c10` | `d46d858808ebb8234a5f4092bf8ff10d7a9344d329abfaf6b93f50b2b952a76c` |
| `test/桌面应用/stuck-redispatch.test.ts` | `411c9b388eba2fbc8bdef2469950aafe0edb4172` | `d671eeaccc0839b4824a452a9f913239c504b86d22b0dccca2e6e9721f8cc790` |
| `test/桌面应用/write-safety.test.ts` | `f4dd9337f4c4e4db1b00913f6ccaf991b66973d1` | `f5cb351337c605e76733fce9017b868a621bc94af0c1194a2dfe40903432e38c` |
| `test/测试/governance-judge-cards-verify/d-audit-ledger.test.ts` | `6bbd826fb781c52185d75ca1f3c560fc7d6d637b` | `972b93d324a4a21d6ab5f3a3736f68c59c35ebe67af8eca686b0ab6840862ebf` |
| `test/编排/decision-card.test.ts` | `c8f8c1c95fe9a37690a95a389f673675f6e2b52b` | `fc952aa648db4a4219f4b86e0e95425db35b4c5eb46b90b528df1024782c1a07` |
| `test/编排/governance-judge.test.ts` | `2f3d7cb3a9e67de484f68da8e90ca0f78a4bfedd` | `09f80758cdaab975019037aed4afb4ec8e822d5e38ccad3f91ab7966f800e95f` |
| `test/门禁引擎/shell-approval.test.ts` | `99598b32f15720277cb647ab3082146e534359d7` | `fbc3056a9cbf7714d10d75af29c38f5e39ebe3ac10a08568237a65bc9a7302f7` |
| `test/项目管理/shared/i18n.test.ts` | `c74597a5c27bdc5e9bb2e3c47f54b6906fe6749d` | `d0883e593cacc1f290c2cfdd562f9c8fe762ed1a7714bd6e5b10a05185de3106` |

| 属主记录（证据提交） | git blob | sha256 |
| --- | --- | --- |
| `角色卡/Claude适配器/docs/change/2026-10-28_change_entry-role-minimal-C.md` | `babcc93130e68b7c59b1f222a2839c5c68e2d153` | `6192a5d6386e35c859ffd5e433126acc443ee188f770bc7881d74bd416c1a6b9` |
| `角色卡/桌面UI/docs/change/2026-10-28_change_entry-role-minimal-C.md` | `a3717eba3458da5893acf61a1c2e874b038f2f6f` | `71d1c9184aa9b4bc0de15d45eb9b25637e246924230442b03f4786b753882d46` |
| `角色卡/桌面窗口/docs/change/2026-10-28_change_entry-role-minimal-C.md` | `f6d5a70ee56e881a12021fc7f6e1aadcc058682b` | `76cae1a1a4fc77e5674fefb8c19fd15a42b4f90b3c9a6a5c1d95058a6841ffc0` |
| `角色卡/测试/docs/change/2026-10-28_change_entry-role-minimal-C.md` | `45b0569188535e0e45323b5aab8129dd4eccccbf` | `7f75281a75784eb2dffe5f46d1d0e0dda57e22ccbe18d89772db6f86b83e230f` |
| `角色卡/独立验收/docs/change/2026-10-28_change_entry-role-minimal-C.md` | `5af8b9ac78ac73c2cd161f9e4252e9ab27641723` | `d19de0dd50da858e29346d8f11a212f84806efbeb387177b2c3926d466b61dfa` |
| `角色卡/编排/docs/change/2026-10-28_change_entry-role-minimal-C.md` | `8d711a7299d59973bb548a6439597cac4e4cfba3` | `d4395c1485150bafa4d1fb92c01c25d5a1658703ae98c75e38b4e2da9821ad8b` |
| `角色卡/运行时核心/docs/change/2026-10-28_change_entry-role-minimal-C.md` | `592462869842f671cc8bbfa402dbc979e373ac25` | `53a5c6bd008454fcc3f3c1f9187805af112f65ab3bb898d3faae3fa400ea7634` |
| `角色卡/门禁引擎/docs/change/2026-10-28_change_entry-role-minimal-C.md` | `9c2927c2862505f4fe88909220f78dffd98fb171` | `a9e97a57c711b4fb41214cd831b96e3116ef3620fdfe8254339f17d0698255d5` |
| `角色卡/项目管理/docs/change/2026-10-28_change_entry-role-minimal-C.md` | `13a97cc33b17f5caad59b7ec19b4b9634ff16e33` | `4d3e55c3c22e2ddfb9f3cb9d23dbf7ab4c8a3e56c0f3965caa3068e9c468de72` |

- B-12 小修：change-B 行数与 Node 版本已更新（v24.22.1）；补 C5 整树 `1c31d9264d218c6a4685c2b451b56ff81ec980fc07d111de0376501064aa87b0`（`git diff --binary 778a7f2 c4ee7ade | sha256sum`）。
