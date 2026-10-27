**风险档位：T3（治理路由行为、跨角色交接、共享 i18n、治理卡文本；不降档）｜判定依据：客户闸门 1 确认的方案 v3.2 `docs/planning/2026-10-27_design_gate-review-return-routing.md`（978 行；SHA-256 `cf28b38eab0ac1d768a689df85b482fa9bbae75eaaf8e575c208dada3327fbb8`）、冻结的标准 v1 `docs/acceptance/gate-review-return-routing-criteria-v1.md`（914 行；SHA-256 `8666aa75b17ab1e2d91c89f4a5990b69f42f4fc5b310c5b41aae216ba786876b`）、统筹变更包 `docs/scheduling/gate-review-return-routing-change-v1.md`（180 行；SHA-256 `edfaa683813f570bd01af985c112f6ad464d1295824e090dc9b70069687604df`）｜选定检查：候选 12 文件逐路径哈希复算；`acceptance-dispatch`/`interface`/门禁引擎/i18n/runtime 定向套件原始日志；T3 串行全量（排除挂起 `write-sequencing.test.ts` 并记录）；真实 Electron；G4 临时项目 e2e；目标/演示零写入核对；P16 重建分支与 P8 写失败分支的代码/证据核对｜复用证据：Electron `E2E_PASS`（S6 产品字节未变、仅测试期望修复后复用，见 §六.3）；门禁/i18n/runtime 受影响套件（同产品字节、同测试文件、同命令）；其余均为最终候选新跑证据｜全量回归：已执行（`node --test --test-concurrency=1` 408 文件，4490 tests / 4456 pass / 15 fail / 19 skipped / 0 todo，exit 1，434s；15 红全部为 S1 基线既有，新增确定性失败 0）｜未覆盖：P8 路由记录**真实写失败**分支未单独注入；P18 不可读 R5/R6 稳定身份分支未单独注入（代码路径已核对）；真实模型/网络、打包/签名/安装器、其他平台未测；19 项平台性 skip 不计通过**

# 独立验收报告：gate 复核报告的退回重报与通过转交闭环（gate-review-return-routing）

- 任务 ID / 产品 flowId：`2026-10-27-gate-review-return-routing` / `gate-review-return-routing`
- 报告路径 / 版本 / 日期：`docs/acceptance/gate-review-return-routing-acceptance-report-v1.md`（实现 worktree 内路径；按统筹 2026-10-27 判定请求命名，标准 §文件头的建议名 `...-report-v1.md` 不改变判定口径）/ **v1** / **2026-10-27**
- 判定角色 / 上下文：ANS 内置独立验收（Independent Acceptance）唯一主上下文；本报告是**唯一 B2 结论**，未启动取证子上下文、未并行化判断。
- 结论：**返工（rework）**。P16 **fail**；P8 **insufficient evidence**；其余 P1–P15、P17–P20 与 G1–G6 pass（含残余说明）。本结论不是客户批准、不是发布授权，不授权 commit/push/合并/发布。
- 验收基线：客户闸门 1 确认的方案 v3.2（即实施方案）；上位依据为客户闸门 0 确认的范围 A。团队计划（404 行；`b019bc19…`）只作范围/写集/阶段/证据口径依据。
- 候选：worktree `.claude/worktrees/gate-review-return-routing`（分支 `feat/gate-review-return-routing`；HEAD `14658335c08dc0bd764f3ee6be41cc907c961f2b` = main = origin/main）；**12 个产品/共享/测试候选**（11 个修改 + 1 个新增 e2e），逐路径哈希见 §一.2；候选联合摘要 `f159d2b7eb88b144c4ed73be69b6e50cfafb804872be3e10151f90ef226739be`（本报告独立复算一致）。冻结标准与角色变更记录/证据为治理记录，不计产品候选。
- 变更包：`docs/scheduling/gate-review-return-routing-change-v1.md`（180 行；`edfaa683…`）；候选状态为未提交工作区，未 commit/push/合并/发布。
- 证据根：`角色卡/测试/docs/change/2026-10-27-gate-review-return-routing-final-evidence/`（README 184 行；SHA-256 `d514438c2ac077ccbfdc280a2c4fc3308dbeda7a5460598d704fdf7dee9932c8`；`sha256sum -c SHA256SUMS` **45/45 OK**）；基线证据 `...-baseline-evidence/`（README 158 行；`995ed094…`；`sha256sum -c` 24/24 OK）。
- 独立变更边界：本报告只判定本变更；flow-skeleton、lead-governance、自动推进、`flow-busy` 基线变更、发布验收等事实不合并结论。

---

## 一、判定对象与身份核对

### 1.1 冻结输入与候选

| 项 | 值 | 核对 |
| --- | --- | --- |
| 方案 v3.2 | 978 行；`cf28b38eab0ac1d768a689df85b482fa9bbae75eaaf8e575c208dada3327fbb8` | 与冻结标准/变更包/沟通记录一致；本报告复算一致 |
| 策划复核记录 | 149 行；`ddb757f86b7ef3334fd74df6b94c5376a660e180d8930d3ed00978b36b71d0ae` | 一致 |
| 团队计划 | 404 行；`b019bc19905ed8d8a865976fa5819c4d7627c133ef6d148092032b2e8b43dd87` | 一致 |
| 实现提案审核记录 | 147 行；`123175774f5fdb69b7ec8e91af0123358c84b591157c67c68f6c2abbcc5390aa` | 一致；RF-03 客户已决定「不要求，按现方案」 |
| 沟通记录（闸门 0/1/2 + 实施授权） | 当前 95 行；`d651e94138d791fd6413459976286bcec8f371d82ba8ce5240e9400f2662d2dc` | 变更包 §一引用的是 86 行/`a12715d7…`（追加闸门 2/实施授权前快照）；已确认对象（方案/团队计划）哈希未变；见 §六.6 |
| 冻结标准 v1 | 914 行；`8666aa75b17ab1e2d91c89f4a5990b69f42f4fc5b310c5b41aae216ba786876b` | 与变更包一致；本报告复算一致；实施期间未被修改 |
| 变更包 | 180 行；`edfaa683813f570bd01af985c112f6ad464d1295824e090dc9b70069687604df` | 复算一致 |
| 候选 HEAD | `14658335c08dc0bd764f3ee6be41cc907c961f2b` | worktree `git rev-parse HEAD`；= main = origin/main |
| 候选状态 | 11 个修改 + 2 个未跟踪（新增 e2e、冻结标准）；staged 0 | `git status --porcelain` 独立复算；无其它路径 |

### 1.2 候选逐路径哈希（独立复算，12/12 与变更包一致）

| 路径 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `app/desktop/interface.ts` | `6d668ba3ef450c0bd610a0b5c3a4e2ea9186274c` | `89087b4a0c84bbd875dcf3d358f8591a1532672c8a609287d5588c34500888e9` |
| `app/desktop/governance-advance.ts` | `0359d7ee33efa08fcf3695b8c65a3c722bc784f8` | `e73de2f74d6eb34fb16aa166d17ee9a0b2d970e2f34b8c12c103b793796f39c6` |
| `src/common/shared/i18n/messages/zh-CN.ts` | `2bf27db22673300cb9e66f1cff4146d895125055` | `ce5420dfced28f01dcaddab1f70e2b6b1936380913cc7a57b052949549dd49b3` |
| `src/common/shared/i18n/messages/en-US.ts` | `cece6c843a59b56d3494899b669823944fc87005` | `ab0dc94dec5e9904cbfee58a8c00db26f44406453abb2f75e24ff2928dc0908d` |
| `src/common/门禁引擎/governance-roles.ts` | `5b9fee57dbc15961ddd2968bdb398f3fc64e65e4` | `a1bbeba379fa49de41d21ddb319c9475779d65fbfd67570ba0e8289dfe895293` |
| `test/桌面应用/acceptance-dispatch.test.ts` | `f3cc70527640c5ddd23ac3e1e612718c5a8a0cab` | `438015f660556c56a165835ad89a50988ae682cae917e8dbdf61aeea728b7f32` |
| `test/桌面应用/interface.test.ts` | `3397e07eebad1e01a27ca432a93160b671b60fe0` | `7ed0fa9040a6cbff6e673f2bbedf81dbbae2ee0f816c87d040a4e86a811e4b12` |
| `test/门禁引擎/governance-standard-workflow.test.ts` | `f714a12f04880c08df49075bcdbbc836f7f05610` | `def0cc7e61079c6286ea3c7cfa7f1f80a386500f49257926e17df58a4745c1aa` |
| `test/门禁引擎/verifier-artifact-report.test.ts` | `e5863a6f690362096c2428af25f123004528d0e8` | `e9b83b1f911c2914ae90d228a543f1015e236cdda7249fcf889404be7749959a` |
| `test/项目管理/shared/i18n.test.ts` | `d4d9b9b4dbef12f55c3fe94f645f3e34e7d05d78` | `d4efe4834151dcaff2bd4cf15bafa8bf706bdc5e4743e47f5b34efe4210bbfdd` |
| `test/测试/governance-e2e-auto/t-gate-review-return-routing.test.ts` | `7a4aa0c47d427ea85ea23ef5644666bd351f0f7a` | `04ed023319e25fbbdfc5f54bc3013a100ff146b8155148e92defd200c0f17e4d` |
| `test/测试/governance-e2e-auto/fixture.ts` | `7fa52596487ad26256b7644c1a7306cf375a07c7` | `da53390ee84e7a8c0ba7a9dda7a000ecd5de6abae64b56d349568f7b3eedd055` |

- 联合摘要独立复算：按 12 个 `sha256sum` 值排序、换行拼接后取 SHA-256 = `f159d2b7eb88b144c4ed73be69b6e50cfafb804872be3e10151f90ef226739be`，与变更包一致。
- `test/桌面应用/` 无新建文件（仅两既有文件修改）；`test/测试/governance-e2e-auto/` 新增 e2e 与 opt-in 夹具在团队计划目录授权内；`test/门禁引擎/gate-review-flow-busy.test.ts`、`governance-trio.test.ts` 零 diff。
- 角色变更记录与测试证据在主检出 `角色卡/<角色>/docs/change/`（治理记录；变更包 §一登记）；不纳入产品候选哈希。冻结标准为未跟踪治理记录，不计候选。

### 1.3 证据身份与全量回归

| 项 | 结果 | 核对 |
| --- | --- | --- |
| 最终证据 README | 184 行；`d514438c2ac077ccbfdc280a2c4fc3308dbeda7a5460598d704fdf7dee9932c8` | 与变更包一致；复算一致 |
| 最终证据 SHA256SUMS | 45 个文件 | `sha256sum -c` **45/45 OK**（本报告独立执行） |
| S1 基线 README | 158 行；`995ed094c343cd85d8cc44c5435d000d977543e477bed4e26d458189dedc08ff` | `sha256sum -c` 24/24 OK（独立执行） |
| 静态检查（最终候选） | `typecheck` / `typecheck:renderer` / `build:renderer` 均 exit 0 | `final-fix/*.log` 原始命令/exit；G1 通过 |
| T3 串行全量（最终候选） | 408 文件；4490 tests / 4456 pass / **15 fail** / 19 skipped / 0 todo；exit 1；434s | `t3-full-final.log`（1,238,004 B）；与 S1 基线 407/4444/4409/16/19 对照，**新增确定性失败 0**；15 红全部为基线既有（9 Windows symlink EPERM + 6 非 EPERM 确定性） |
| 排除项 | `test/pi-adapter/write-sequencing.test.ts` 间歇挂起（14s 通过 / 120s 超时 exit 124 / 13s 通过） | 三次探针日志；文件自 HEAD 未修改；按既有口径排除并记录 |
| 受影响套件（最终候选/同产品字节复用） | acceptance-dispatch 138/138（复跑 3；首跑 1 条时序 flake）、interface 141/141 ×2、新 e2e 10/10 ×3、gate-flow-busy 3/3、governance-trio 50/50、governance-standard 28/28、verifier-artifact 5/5、i18n 65/65、i18n-guard 6/6、request-gate-review-tool 11/11 | 各原始日志在 `final-fix/`、`affected/`、`repro/`；计数与变更包一致 |
| 真实 Electron | exit 0，79s；`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`；17 张截图 | `electron.log` 第 317–319 行；运行于最终产品字节（S6 修红仅改测试期望，产品/共享字节未变），复用说明见 §六.3 |
| G4 临时项目场景 | e2e S6-1：gate 派发 → 结构坏 pass 报告 → 补正任务 → 修正 v2 → 机械复核通过 → 统筹恰一条 `[Gate 通过]`；10/10 ×3 | `affected/测试__governance-e2e-auto__t-gate-review-return-routing.test.ts.log`、`repro/...run2/3.log`；真实临时项目根 + 真实 Interface/会话/账本/flow；无截图（按媒体边界允许） |
| 目标/演示零写入 | `pixel-space-demo` 最新文件时间 16:57（早于本会话 19:42 起）；`demos/` 无 19:00 后修改文件 | 本报告独立只读核对（find -newermt）；目标项目位于 `C:\Users\51054\Downloads\pixel-space-demo`；未打开/未写入 |

---

## 二、验收表（P1–P20 + G1–G6）

> 判定规则：每行只能为 `pass` / `fail` / `insufficient evidence` / `not applicable`；N/A 必须写明依据。证据均指向当前候选；代码阅读只作补充，不替代行为证据。

| ID | 依据（方案/Q/O） | 判定项（摘要） | 实际证据（路径/哈希） | 候选 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | §9.1 P1；§3.1.1 R1–R5；Q1 A | 报告侧退回向质检恰一条可执行补正任务；字段/错误/下一版本/格式要求齐全；无改判/已接受；gate pending | `acceptance-dispatch.test.ts` R3/R4/R5/R1 用例日志与源码（`438015f6…`）；e2e S6-1；R3 测试断言补正任务含 `line/column`、v2 路径、格式清单、同一轮、无「已接受/已通过」；routing record/gate record/ledger 原文 | `f159d2b7…` | 桌面窗口、测试 | 通过 | **pass** |
| P2 | §9.1 P2；§3.1.3；Q1 A；Q10 A | 每次退回转换向统筹恰一条对应任务；原因/下一步/质检投递结果如实；重复扫描不重复；部分失败只重试失败方 | R3 测试、R6 测试、部分失败测试；e2e S6-1/S6-5；任务原文含「质检补正任务投递结果：已投递」「不需要重新派发质检」「应用未替统筹派发」；routing deliveries | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P3 | §9.1 P3；R6；Q6 A | 候选变化不向质检发补正；统筹收到「需重新 request_gate_review」；旧报告不放行；gate pending；保存稳定身份 | R6 测试（`acceptance-dispatch` 7564 一带；e2e S6-5）：质检补正 0、统筹 `[Gate 退回·需重新请求]`、新 v2 pass 不自动收口、routing `candidate-changed`、`rejectedIdentity` | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P4 | §9.1 P4；R8；Q5 A | 连续 3 轮报告侧退回后停止自动补正并给统筹人工；投递失败 ≤3 次后 exhausted；gate 始终 pending | R8 测试（`acceptance-dispatch` 7980 一带）与 e2e S6-8：第 3 轮 `[Gate 退回·需人工]`、第 4 版不再补正、`consecutiveReturns=3`、gate pending；耗尽测试 8416：attempts=3、exhausted、不再发送 | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P5 | §9.1 P5；§3.2；Q2 A；Q7 A | 收口成功后统筹恰一条 `[Gate 通过]`；身份/报告/revision/可派发+仅知情分组或空原因；应用未派 worker/未改其它步骤 | P5 测试（8070 一带）与 e2e S6-1/S6-10：恰一条、`delivery-after-gate` 可派、`verifier-followup` 仅知情、无 `dispatch.accepted`、无 worker 派单、重启不重复；空原因测试存在 | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P6 | §9.1 P6；Q7 A | 同周期统筹最多一条覆盖「gate 通过+ready」；同口径去重键含仅知情 | P5 测试断言同周期 `[自动推进]` 0；`interface.test.ts` 断言恰一条 `[Gate 通过]`、400ms 内无 `[自动推进]`；实现 `gatePassReadyDedupe` 与 `wakeStewardForReadySteps` 同一公式/`APP_MANAGED_READY_STEP_IDS` | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P7 | §9.1 P7；§3.5；§4.5 第 6 点 | 重复 settle/扫描/重启不重复；路由记录驱动恢复；同一报告只路由一次；新版本只开一轮 | R3 重复扫描、P5 测试重启、e2e S6-10；routing record 原文；已知崩溃窗口有诊断说明 | 同上 | 桌面窗口、测试 | 通过（崩溃窗口按标准 §9 全局说明） | **pass** |
| P8 | §9.1 P8；§3.4；§4.5；Q12 A | 发送/打开失败如实 failed、主理如实、有界重试、只重试失败方；**路由记录写失败零发送且 gate 记录保持 dispatched**；不改投主理 | 失败/部分失败/耗尽测试（7920 一带、8416）覆盖 open/send/partial/exhausted；路由记录“不可用”测试（7745）用目录占位实际触发 **read corrupt** 分支并断言零发送、gate 保持 dispatched；真实 **write 失败**分支无运行时注入（变更包 §六.2 自述；测试首跑/复跑均未覆盖写失败）；代码写序可读但按标准 P8 需执行证据 | 同上 | 桌面窗口、测试 | 失败语义大部分通过；写失败子项缺运行证据 | **insufficient evidence** |
| P9 | §9.1 P9；§3.7；§5.5 | 无可解析 pass 报告绝不收口/写 passed；不改报告字节、不写 customer.decision/分诊；退回 gate pending | R3 测试断言无 `gate.review`、无 `customer.decision`、无下游 `dispatch.accepted`、gate pending；P5 测试仅 pass 收口；报告只读（无改写代码）；负例覆盖 R3/R4/R5/R6/R2b | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P10 | §9.1 P10；Q8 A；O4 不做；B10 | `request_gate_review` 仍只注入统筹、契约/码集合不变、flow-busy 保持；无新增工具/能力位/枚举/账本 kind；边界/写权未变；路由记录 app 私有 | `git diff --name-only` 仅 11 修改 + 1 新增 e2e；无 `src/model/**`、`src/provider/**`、`session.ts`、`watchdog.ts`、`app/main.ts`、`preload`、边界/角色卡 diff；`governance-roles.ts` 仅 +9 卡文本；无新增 `appendGovernanceLedger`/账本 kind；`gate-review-record/v1` 形状注释明确不变；`flow-busy` 行未改 | 同上 | 全角色 | 通过 | **pass** |
| P11 | §9.1 P11；Q3 A/O1；Q4 A/O3 | 扫描在真实事件 + 看护 tick；O1 空闲一次提醒、忙/排队跳过；重复 tick 不刷屏；看护不可用有兜底 | O3 测试（8340 一带）与 O1 测试（7629/8371 一带）、e2e S6-3/S6-9：无真实事件扫描、重复 tick 不刷屏、质检忙不发提醒、记录保持 dispatched；`runFlowAdvanceTick` 调用 `processGateReviewsForFlow`（`skipGateScan` 分支保留） | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P12 | §9.1 P12；Q10 A；RF-05 | zh/en key 齐全、占位符一致；主理系统行如实；UI 与 agent 任务文本分离；保留 flowBusy/passNote 语义 | `i18n.test.ts` 65/65（key 数 1395；7 新 key 占位符断言）；`flowBusy` 12 条子串断言保留；`passNote`「最终客户验收」/`final customer acceptance` 保留；`returnedToProof` 语义保留并追加「投递结果另行说明」；主理事实行/结果行在 R3/P5 测试断言 | 同上 | 项目管理、测试 | 通过 | **pass** |
| P13 | §9.1 P13；§3.6；§二.10 | 每次路由决策/跳过/失败有结构化诊断（flowId/gateId/reasonCode/attempts）；无报告正文/凭据/命令原文；不改变控制流 | `interface.ts` 中 `gate.return.route.*`、`gate.pass.handoff.*`、`gate.handoff.record.*`、`gate.route.exhausted`、`gate.reminder.skip` 等；`reasonDigest` 仅 sha；错误/摘要有界；日志/测试未出现报告正文或凭据；诊断只记录不分支 | 同上 | 桌面窗口 | 通过 | **pass** |
| P14 | §9.1 P14；§1.4；B8 | 既有 gate pass/fail/nit-only/返工/恢复/审计行为除新增转交外不变；两条返工路由未动；既有测试不弱化 | T3 15 红全为基线（9 EPERM + 6 确定性），新增确定性 0；`routeGateRework` 函数体与基线逐字节相同（提取对比）；最终验收返工路由不在 diff；`interface.test.ts` 仅把等待 `[自动推进]` 改为更强断言（恰一条 `[Gate 通过]`、含可派步骤、同周期无 `[自动推进]`），有设计 §3.2/Q7 依据；既有断言未删除 | 同上 | 全角色、测试 | 通过 | **pass** |
| P15 | §9.1 P15；R7；F6；RF-02 | 历史 returned 无路由记录：一次统筹历史提示、不重派质检、不猜原因、不转 dispatched、跨重启不重复 | R7 测试（`acceptance-dispatch` 7900 一带）与 e2e S6-6：恰好一条 `[Gate 退回·历史记录]`、附 error 摘要、质检 0、gate 记录字节不变、`latestReturn.cause=legacy`、重启后 0 条 | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P16 | §9.1 P16；§3.4；F6；RF-02 | 路由记录损坏/无法解析时，**按 gate 记录 + 报告身份重建**；无法重建才 fail-closed；不伪造；历史 passed 不追溯 | **fail**：6 处 `routingRead.state === "corrupt"` 调用点（`interface.ts` 约 7800/8021/8568/8714/8832/9723）全部直接 fail-closed；无重建函数/分支；变更记录 `...routing-core.md` 第 30 行明确「不猜测重建（P16 允许无法重建时 fail-closed）」；测试 `acceptance-dispatch` 7745/7925 与 e2e S6-7 只断言 fail-closed，未覆盖可重建场景 | 同上 | 桌面窗口 | 未实现 P16 的重建分支 | **fail** |
| P17 | §9.1 P17；R2b；F10；Q3 A/O1 | 报告存在但不可读：一次提醒+统筹知情；记录保持 dispatched；身份固定；同版本不重复；R2b+O1 上限 3 后停止并人工提示 | R2b 测试（7629 一带）与 e2e S6-2：提醒含「仍为 dispatched」「未判退回」「读取权限」；`reminderCount` 1→2→3，v4 达到上限后质检 0 新增、统筹第 4 条人工提示、`humanNoticeAt` 非空、gate 记录 dispatched、`consecutiveReturns=0`；O1 测试同样断言 | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P18 | §9.1 P18；§4.5；Q6 A；F2/F13 | R5/R6 保存被拒报告稳定身份；同一旧报告不转 dispatched/不覆盖 revision/不收口；同 sha 不同版本视为新报告；记录形状不变 | R5 测试（7501）与 e2e S6-4：退回记录真实 sha、`rejectedIdentity.reportSha256=v1 sha`、重复扫描不重开；v2 同内容（同 sha 不同版本）→ 按新报告收口；R3/R5 记录 `gate-review-record/v1` 形状未变；**残余**：不可读 R5/R6 的 `rejectedIdentity` 分支未单独注入（代码路径 `readGateReportIdentity`/`isSameRejectedReport` 已核对，size/mtime 比较存在；建议后续补测） | 同上 | 桌面窗口、测试 | 通过（附残余） | **pass** |
| P19 | §9.1 P19；§1.4；B10 | flow 在途 ⇒ 可重试 flow-busy（非 unavailable），零 gate 记录/账本/路由；本方案路由不因 flow-busy 触发；卡/Provider/i18n/既有测试保持 | e2e S6-9：在途 ⇒ `flow-busy`、无 gate 记录/无路由/无 verifier 任务；在途结束后重试 `dispatched`；`gate-review-flow-busy` 3/3、`governance-trio` 50/50、`request-gate-review-tool` 11/11、`acceptance-dispatch` flow-busy 用例通过；`flow-busy` i18n/卡文本未改 | 同上 | 测试、门禁引擎 | 通过 | **pass** |
| P20 | 闸门 1 O2（Q9 A）+ RF-04 | 统筹/质检卡保留基线 `flow-busy` 段与质检纪律；只新增通知来源/边界；不改能力/边界/注册表；测试保留旧断言并新增 | `governance-roles.ts` diff +9/−0（仅卡文本）；`gate-review-flow-busy` 3/3、`governance-trio` 50/50、`governance-standard` 28/28、`verifier-artifact` 5/5；新增卡测试断言 `[Gate 退回]`/`[Gate 通过]`/来源/边界/不改判/不派下游，并逐字断言基线 `flow-busy` 三段、质检「应用会退回你补报告、不触发返工」；反向断言无越权表述 | 同上 | 门禁引擎、测试 | 通过 | **pass** |
| G1 | §9.2 G1 | `npm run typecheck` 0 诊断，记录候选/命令 | `final-fix/typecheck.log` exit 0；`interface`/`i18n`/门禁测试通过 | 同上 | 测试 | 通过 | **pass** |
| G2 | §9.2 G2 | 定向套件通过并记录计数（acceptance-dispatch、门禁引擎 O2、i18n） | 见 §1.3：acceptance 138/138（复跑 3）、interface 141/141、e2e 10/10、gate 3/3+50/50+28/28+5/5、i18n 65/65+guard 6/6、runtime 11/11 | 同上 | 测试、各角色 | 通过 | **pass** |
| G3 | §9.2 G3；团队计划 §6.4 | T3 全量（桌面/门禁/i18n 全套、串行、排除挂起、基线对照、类型/构建、Electron） | 4490/4456/15/19/0；15 红全基线；`write-sequencing` 排除记录；静态检查 3/3 exit 0；Electron `E2E_PASS=true`；G4 e2e 10/10 | 同上 | 测试 | 通过 | **pass** |
| G4 | §9.2 G4；团队计划 §6.4 | 临时/隔离项目复现现场形状；截图至多（真实运行、关 DEBUG、记 sha/候选/命令/尺寸）；不要求录屏 | e2e S6-1 在系统临时根、真实 Interface/会话/账本/flow；10/10；无截图（场景不在 `main.mjs` UI 断言面；标准允许，缺录屏不构成失败）；目标/演示未写 | 同上 | 测试 | 通过 | **pass** |
| G5 | §9.2 G5；团队计划 §6.5 | 变更包含候选哈希、改动路径、任务节点、证据链接、T3；未 commit/push | 变更包 180 行 `edfaa683…`：12 文件逐哈希、联合摘要、S1–S6 节点、证据索引、T3、方案 v3.2、已知限制；`git status` staged 0、HEAD 未变、无 commit/push | 同上 | 统筹 | 通过（附文档注记 §六.6） | **pass** |
| G6 | §9.2 G6；团队计划 §6.1 | 桌面/门禁（O2）/项目管理（i18n）按规则更新 change 记录；状态如实；目标/演示零写入 | 桌面 4 份、门禁 O2、PM i18n change 记录均在主检出（状态 `implemented-unverified`/未验收；无 `verified` 宣称）；测试证据 README/SHA256SUMS；方案哈希未变；目标项目最新文件 16:57、`demos/` 无 19:00 后修改；无 feature 文档被篡改 | 同上 | 各角色、测试 | 通过 | **pass** |

---

## 三、关键判定说明

### 3.1 P16（fail）：路由记录损坏时未实现要求的“重建”分支

**标准要求（冻结 v1 §3.2.16 / 方案 §9.1 P16）：** 路由记录损坏/无法解析时，应用应**按 gate 记录 + 报告身份重建**路由记录；只有无法重建（如报告身份缺失）才 fail-closed（零发送、主理如实、人工核对）。

**实际证据：**

1. `app/desktop/interface.ts` 共有 6 处 `routingRead.state === "corrupt"` 处理点（约 7800、8021、8568、8714、8832、9723），**全部直接**调用 `main.gateReview.routingRecordUnusable` 系统行并 `return`，没有调用任何重建函数；代码中不存在 `rebuildGateHandoffRoutingRecord`/等价分支（`grep` 仅命中 `rebuildGateCorrectionInput`，那是重建补正任务输入，不是重建路由记录）。
2. 桌面窗口变更记录 `角色卡/桌面窗口/docs/change/2026-10-27_change_gate-review-return-routing-routing-core.md` 第 30 行明确写：「读失败/损坏/schema/身份/形状不符 ⇒ `corrupt`，调用方 fail-closed（不发任务、不写 gate 状态、主理如实）；**不猜测重建（P16 允许无法重建时 fail-closed）**」。
3. 测试 `test/桌面应用/acceptance-dispatch.test.ts` 的「路由记录不可用/损坏」用例（7745 一带、7925 一带）与 e2e S6-7 只断言 fail-closed（零发送、gate 记录不变、主理可见），**没有任何“可重建 → 重建后正常路由”的用例**。

**判定：** gate 记录在多数退回/通过场景下保存了报告路径/版本/sha（可读）或 `rejectedIdentity`（不可读），至少可通过 gate 记录 + 报告身份恢复身份与重试；实现把所有 corrupt 一律视为“无法重建”，跳过了方案要求的重建分支。这是行为偏差（不是单纯缺证据），按 **fail**。所有者为桌面窗口；修复后候选变化，受影响证据与 T3/Electron 需按 §五重跑。

### 3.2 P8（insufficient evidence）：真实“路由记录写失败”分支未被运行时注入

**标准要求（冻结 v1 §3.2.8 / 方案 §9.1 P8）：** 路由记录写失败时，gate 记录保持 `dispatched`、不发送任何角色任务、主理系统行如实说明，并有有界重试。

**实际证据：**

1. 变更包 §六.2 自述：「路由记录真实权限写失败未单独注入：实现为零发送 + fail-closed；测试以'目录占位'触发读取 corrupt 分支（同样 fail-closed）；真实写失败路径由代码写序保证。」
2. `acceptance-dispatch.test.ts` 的「写入/读取失败」用例（7745 一带）用 `mkdirSync` 占住路由记录路径；代码先 `readGateHandoffRoutingRecord` 读到 `EISDIR` → `corrupt` → 早退，因此**没有走到 `writeGateJson` 抛错的写失败分支**。
3. 该分支的代码顺序（`routeGateReturnHandoff`/`routeGateReminderHandoff`/`completeGatePassWithHandoff` 均先写路由记录，catch 后不写 gate 记录、不发送）从静态阅读看是合理的；但标准 P8 要求该失败语义有当前候选上的运行证据，且变更包已主动披露该注入缺失。

**判定：** P8 的其余失败语义（open/send、部分失败、exhausted、只重试失败方、主理如实）均已通过；**仅“路由记录真实写失败”子项缺执行证据**，按 `insufficient evidence`。请测试角色补一个定向注入：路由记录可读/合法但写入失败（例如只读目标/权限/注入失败），断言 gate 记录保持 `dispatched`、零角色任务、主理如实、下一次事件重试；补证后本行可 pass。该行不是产品 fail。

### 3.3 P18（pass，附残余）：不可读 R5/R6 稳定身份分支未单独注入

可读场景的稳定身份、同一旧报告不重开、同 sha 不同版本、记录形状不变均已由 R5 测试与 e2e S6-4 证明（`rejectedIdentity.reportSha256` 为真实 sha；v2 同内容视为新报告）。**残余**：不可读 R5/R6 的 `readGateReportIdentity` → `size/mtime` 比较分支没有专门注入用例；代码路径已核对（`isSameRejectedReport` 在 sha 为 null 时比较 size/mtime；两者均为 null 时退化为 path+version），建议在后续补测，不改变本行 pass。

### 3.4 其余 P/G 的通过依据（摘要）

- **P1/P2/P3/P4/P5/P6/P7**：桌面 `acceptance-dispatch` 的 R1–R8、R2b、O1、稳定身份、损坏、失败、恢复、通过转交用例与 e2e S6-1/S6-5/S6-8/S6-10 均实际执行；任务文本、routing record、gate/flow/ledger 快照与计数一致；无应用 `dispatch_task`、无自动通过、无下游派发。
- **P9/P10/P13/P14**：负例断言无 `gate.review`/`customer.decision`/下游派发；diff 只含 12 个授权文件，`routeGateRework` 函数体与基线逐字节相同，无 model/provider/session/watchdog/边界改动，无新增账本 kind/枚举/工具；T3 新增确定性失败 0。
- **P11/P12/P17/P19/P20**：O1/O3、i18n（65/65、`flowBusy`/`passNote` 语义保留）、R2b 上限、flow-busy（3/3+50/50+11/11）、O2 卡文本（+9/−0，基线 `flow-busy` 三段逐字断言）均通过。
- **G1–G6**：静态检查 3/3 exit 0；定向套件计数见 §1.3；T3 全量已执行且无新增确定性失败；G4 e2e 真实临时项目 10/10；变更包齐全；各角色 change 记录为 `implemented-unverified`，方案哈希未变，目标/演示零写入（独立 mtime 核对）。

---

## 四、总体结论与返工要求

### 4.1 总体结论：**返工（rework）**

- **P16 fail**：路由记录损坏时未实现“按 gate 记录 + 报告身份重建”的分支；一律 fail-closed，与冻结标准 P16 不符。
- **P8 insufficient evidence**：路由记录真实写失败分支未见运行时注入；其余失败语义通过。
- 其余 P1–P15、P17–P20 与 G1–G6 均为 pass（P18 附残余说明）。
- 按标准 §5.2：存在 fail ⇒ 总体结论为**返工**；同时列出待补证据，避免修复后重复缺证。本结论只对当前候选有效；**不是客户批准、不是发布授权，不授权 commit/push/合并/发布**。

### 4.2 返工项与所有者

| # | 项 | 所有者 | 要求 | 复测/证据 |
| --- | --- | --- | --- | --- |
| R1 | P16 重建分支 | 桌面窗口 | 在 `interface.ts` 实现：路由记录 corrupt 时，若 gate 记录 + 报告身份（可读 sha 或完整 rejectedIdentity）足以重建，则重建 app 私有路由记录（至少恢复身份与 pending/待重试状态），再按既有路由发送；无法重建才 fail-closed。不得猜测 cause/报告正文；保持 `gate-review-record/v1` 形状。更新变更记录。 | 新增“可重建 → 重建后正常路由/重试”与“不可重建 → 零发送”两类测试；受影响桌面套件 + T3；产品字节变化后按 §五重跑 |
| R2 | P8 写失败证据 | 测试（桌面窗口协助注入） | 增加真实现路由记录可读/合法但写失败的注入，断言 gate 记录保持 `dispatched`、零角色任务、主理系统行如实、下一次事件有界重试；或提供等价的、可复算的运行证据。 | `acceptance-dispatch` 定向 + T3；更新变更包 §六.2 |
| R3 | P18 残余（建议） | 测试 | 增加不可读 R5/R6 的 `rejectedIdentity`（size/mtime）用例；不影响本次结论，但建议随 R1/R2 一并补。 | 定向测试 |
| R4 | 变更包文档注记 | 统筹 | 变更包 §一引用沟通记录 86 行/`a12715d7…`，当前记录 95 行/`d651e941…`（其后追加闸门 2/实施授权）；请更正引用或加注说明。非产品缺陷，不单独阻塞。 | 变更包更新 |

### 4.3 重新判定条件

1. 候选必须冻结并提交新的 12+ 文件哈希/联合摘要与更新后的变更包；任何产品/测试文件变化使受影响证据失效。
2. 修复 P16 改动 `interface.ts`（产品字节变化）⇒ 受影响桌面测试重跑，T3 全量重跑，真实 Electron 按产品字节变化重跑（若仅测试变化，可按同产品字节复用并说明）。
3. P8 补测证据须对应当前候选、同命令/同环境；不得用旧候选的失败注入证据。
4. 重新判定仍按冻结标准 v1 的 P1–P20 + G1–G6；不得因返工修改标准或删减判据。

---

## 五、证据复用与失效说明

- **复用：** 门禁引擎（`gate-review-flow-busy` 3/3、`governance-trio` 50/50、`governance-standard` 28/28、`verifier-artifact` 5/5）、`i18n` 65/65、`i18n-guard` 6/6、`runtime-core/request-gate-review-tool` 11/11 —— 产品/共享字节与最终候选一致、测试文件未在其运行后变化、同命令/同环境；符合标准 §2.2/§2.3。
- **Electron：** 运行于 S6 修红前候选；S6 修红仅改 `interface.test.ts` 期望（产品 `interface.ts`/`governance-advance.ts`/i18n/roles 字节未变，`main.mjs`/渲染产物未变），按同产品字节复用；若 R1 修复产品字节，Electron 必须重跑。
- **T3：** 最终候选新跑（`t3-full-final.log`），非复用；15 红全部为 S1 基线既有（9 EPERM + 6 确定性），新增确定性失败 0；19 skip 不计通过；`write-sequencing` 间歇挂起按既有口径排除并记录。
- **不可复用/未覆盖：** 真实模型/网络、打包/签名/安装器、其他平台未测；P8 写失败、P18 不可读身份残余见 §三；R1 修复后所有受影响证据重新核对。

---

## 六、未覆盖、残余与说明

1. **P8 写失败分支**：见 §3.2；补证后可 pass。
2. **P18 不可读 R5/R6 身份**：见 §3.3；建议补测，不改变本行 pass。
3. **Electron 证据复用**：见 §五；当前产品字节未变，复用有效；R1 修复后须重跑。
4. **T3 基线红**：15 条均为 S1 基线既有（9 Windows symlink EPERM + 6 非 EPERM 确定性：`k-governance-feedback`、`s-acceptance-rework-routing`、`governance-liaison-verify/e-audit`、`t1-pipeline-integration` 三变体）；本轮不修复、不归责本变更；19 项平台性 skip 不计通过。
5. **`write-sequencing`**：三次探针 14s 通过 / 120s 超时 / 13s 通过，按既有口径排除并记录；非本变更引入。
6. **变更包引用差异**：沟通记录当前 95 行/`d651e941…`，变更包 §一写 86 行/`a12715d7…`（追加闸门 2/实施授权前快照）；已确认对象（方案/团队计划）哈希未变。请统筹更正/加注（R4），不影响产品判定。
7. **角色文档位置**：桌面/门禁/PM 的 change 记录与测试证据写在主检出 `角色卡/<角色>/docs/change/`，变更包按治理记录登记、不计产品候选；本报告按该约定核对（G6 pass），未把它们混入 12 个产品候选哈希。若后续要求角色文档也纳入候选哈希，需标准升版并重新冻结口径。
8. **目标/演示零写入**：本报告独立只读核对 `pixel-space-demo` 最新文件 16:57（早于本会话 19:42 起）、`demos/` 无 19:00 后修改；测试角色证据亦声明未打开/未写目标项目。未对目标项目做逐文件前后哈希清单（未打开目标项目），按现有证据确认零写入。
9. **截图/录屏**：G4 无截图；按证据媒体边界截图至多、不要求录屏，缺录屏不构成失败。
10. **结论边界**：本报告不是客户批准、不是发布授权、不是提交/推送/合并授权；不改变 T3 档位；不改变方案/团队计划/标准/角色卡/边界/目标项目；未 commit/push。

---

## 七、判定时的只读核对记录（摘要）

- `sha256sum` 复算方案/复核/团队计划/沟通/提案审核/标准/变更包；`git hash-object` + `sha256sum` 复算 12 个候选；联合摘要 `f159d2b7…` 复算一致。
- `sha256sum -c` 最终证据 45/45 OK、基线证据 24/24 OK。
- 解析 `t3-full-final.log` 汇总（4490/4456/15/19/0，exit 1，434s）与失败清单；对照基线 README 16 红与最终 15 红，确认新增确定性 0。
- 解析 `final-fix`/`affected`/`repro` 套件计数；核对 `electron.log` 的 `E2E_PASS=true`、`E2E_FAILURES=`、`E2E_DONE=1`。
- 阅读 `interface.ts` 的关键实现（路由记录形状/写序/稳定身份/R1–R8/R2b/O1/pass handoff/去重/诊断/流程挂点）、`governance-advance.ts` 四构建器、i18n diff、`governance-roles.ts` O2 diff、`interface.test.ts`/`i18n.test.ts`/门禁卡测试 diff、新 e2e 全文件。
- 核对 `routeGateRework` 函数体与基线逐字节相同；核对无 model/provider/session/watchdog/边界/构建配置 diff；核对 `test/桌面应用/` 无新建。
- 核对 `pixel-space-demo` 与 `demos/` 的会话时间窗零写入；核对 worktree `git status`/HEAD 与变更包一致。

---

## 八、声明

- 本报告是内置独立验收对当前候选的唯一判定（唯一 B2），结论为 **返工（rework）**；不是验收通过，不是客户批准，不是发布授权，不授权提交/推送/合并/发布或任何对外操作。
- 本报告不修改产品代码/测试/角色卡/边界/方案/团队计划/标准/目标项目；未 commit/push；未启动取证子上下文。
- 方案实质变化、候选变化或标准变化时，按冻结标准 §2.3/§2.5 重新判定受影响部分；本次 P16/P8 的返工项与重新判定条件见 §四。
