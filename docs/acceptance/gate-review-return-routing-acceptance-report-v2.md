**风险档位：T3（治理路由行为、跨角色交接、共享 i18n、治理卡文本；不降档）｜判定依据：客户闸门 1 确认的方案 v3.2 `docs/planning/2026-10-27_design_gate-review-return-routing.md`（978 行；SHA-256 `cf28b38eab0ac1d768a689df85b482fa9bbae75eaaf8e575c208dada3327fbb8`）、冻结的标准 v1 `docs/acceptance/gate-review-return-routing-criteria-v1.md`（914 行；SHA-256 `8666aa75b17ab1e2d91c89f4a5990b69f42f4fc5b310c5b41aae216ba786876b`）、统筹变更包 v1.1 `docs/scheduling/gate-review-return-routing-change-v1.md`（188 行；SHA-256 `09768d9550fef17f05f9e706c90ea3d4756b8a16b1b220297b856c9a899ec3c9`）｜选定检查：返工候选 12 文件逐路径哈希复算；`acceptance-dispatch`（143 例，含 P16/P8/P18）/`interface`/门禁引擎/i18n/runtime 定向套件；T3 串行全量（排除挂起 `write-sequencing.test.ts` 并记录）；真实 Electron 重跑；G4 临时项目 e2e；目标/演示零写入；P16 重建分支（5 个 handoff 点 + 第 6 处 gate-rework 不在范围）、P8 test-only 写失败注入、P18 不可读 R5/R6 身份核对｜复用证据：v1 候选的未变产品/测试文件证据（`governance-advance`/i18n/roles/interface.test/e2e/fixture 等同字节、同命令、同环境）与旧证据 README `d514438c…`（45/45）仅作历史对照；本次 P1–P8/P16/P18 的桌面行为均以返工后 `acceptance-dispatch` 143/143 与 T3 为准；Electron 因产品字节变化**重跑**（非复用）｜全量回归：已执行（返工候选 408 文件，4495 tests / 4461 pass / 15 fail / 19 skipped / 0 todo，exit 1，436s；15 红全部为 S1 基线既有，新增确定性失败 0）｜未覆盖：真实模型/网络、打包/签名/安装器、其他平台未测；19 项平台性 skip 不计通过；Electron 截图不覆盖 gate 路由 UI 定向断言（由 e2e 覆盖）；重建后一次性重复通知风险按变更包 §六.1 已知限制记录**

# 独立验收复判报告（v2）：gate 复核报告的退回重报与通过转交闭环（gate-review-return-routing）

- 任务 ID / 产品 flowId：`2026-10-27-gate-review-return-routing` / `gate-review-return-routing`
- 报告路径 / 版本 / 日期：`docs/acceptance/gate-review-return-routing-acceptance-report-v2.md`（实现 worktree 内路径）/ **v2（返工后复判）** / **2026-10-27**
- 判定角色 / 上下文：ANS 内置独立验收（Independent Acceptance）唯一主上下文；本报告是**唯一 B2 结论**，未启动取证子上下文、未并行化判断。
- 结论：**通过（pass）**。P1–P20 与 G1–G6 全部适用项 pass；v1 报告的 P16 fail、P8 insufficient evidence 与 P18 残余均已由返工处置并由当前候选证据覆盖。本结论不是客户批准、不是发布授权，不授权 commit/push/合并/发布。
- 验收基线：客户闸门 1 确认的方案 v3.2（即实施方案）；上位依据为客户闸门 0 确认的范围 A。团队计划（404 行；`b019bc19…`）只作范围/写集/阶段/证据口径依据。
- 候选：worktree `.claude/worktrees/gate-review-return-routing`（分支 `feat/gate-review-return-routing`；HEAD `14658335c08dc0bd764f3ee6be41cc907c961f2b` = main = origin/main）；**12 个产品/共享/测试候选**（11 个修改 + 1 个新增 e2e），逐路径哈希见 §一.2；候选联合摘要 `efa131e5d8063fb1e2879617256e89b483274c84b4093ed33f5a1c2149805b42`（本报告独立复算一致）。相对 v1 候选：`interface.ts`（`49aa77bc…`）与 `acceptance-dispatch.test.ts`（`6b49ae5b…`）更新；其余 10 个候选字节未变。
- 变更包：v1.1（188 行；`09768d95…`）；v1 初版 180 行/`edfaa683…` 与 v1 报告 212 行/`a2105e79…` 保留为历史；当前候选为未提交工作区，未 commit/push/合并/发布。
- 证据根：返工证据 `角色卡/测试/docs/change/2026-10-27-gate-review-return-routing-rework-evidence/`（README 135 行；SHA-256 `9dc81bc50f39f2eb83226ec97f1dc0ff9a2ee050be3ccdd2200b5df0b34973a6`；`sha256sum -c SHA256SUMS` **21/21 OK**）；旧最终证据 `...-final-evidence/`（184 行；`d514438c…`；45/45 未改）与 S1 基线 `...-baseline-evidence/`（158 行；`995ed094…`；24/24）仅作历史对照/基线。
- 独立变更边界：本报告只判定本变更；flow-skeleton、lead-governance、自动推进、`flow-busy` 基线变更、发布验收等事实不合并结论。

---

## 一、判定对象与身份核对

### 1.1 冻结输入与候选

| 项 | 值 | 核对 |
| --- | --- | --- |
| 方案 v3.2 | 978 行；`cf28b38eab0ac1d768a689df85b482fa9bbae75eaaf8e575c208dada3327fbb8` | 与标准/变更包/沟通记录一致；本报告复算一致 |
| 策划复核记录 | 149 行；`ddb757f86b7ef3334fd74df6b94c5376a660e180d8930d3ed00978b36b71d0ae` | 一致 |
| 团队计划 | 404 行；`b019bc19905ed8d8a865976fa5819c4d7627c133ef6d148092032b2e8b43dd87` | 一致 |
| 实现提案审核记录 | 147 行；`123175774f5fdb69b7ec8e91af0123358c84b591157c67c68f6c2abbcc5390aa` | 一致；RF-03 客户已决定「不要求，按现方案」 |
| 沟通记录（闸门 0/1/2 + 实施授权） | 当前 95 行；`d651e94138d791fd6413459976286bcec8f371d82ba8ce5240e9400f2662d2dc` | 变更包 v1.1 §一已更正为当前哈希；已确认对象（方案/团队计划）哈希未变 |
| 冻结标准 v1 | 914 行；`8666aa75b17ab1e2d91c89f4a5990b69f42f4fc5b310c5b41aae216ba786876b` | 与变更包一致；本报告复算一致；实施期间未被修改 |
| 变更包 v1.1 | 188 行；`09768d9550fef17f05f9e706c90ea3d4756b8a16b1b220297b856c9a899ec3c9` | 复算一致；v1 180 行/`edfaa683…` 为历史 |
| 候选 HEAD | `14658335c08dc0bd764f3ee6be41cc907c961f2b` | worktree `git rev-parse HEAD`；= main = origin/main |
| 候选状态 | 11 个修改 + 2 个未跟踪（新增 e2e、冻结标准）；staged 0；验收报告 v1/memo 为治理记录 | `git status --porcelain` 独立复算；无其它产品路径 |

### 1.2 候选逐路径哈希（独立复算，12/12 与变更包一致）

| 路径 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `app/desktop/interface.ts`（R1 重建，已变） | `5a40b1c80384540254fd2c07e9c07b77944f8ec1` | `49aa77bc6f008a2f124fe09a2abbe3b9b0bd9ada4850f8463ba6122df3abf1d3` |
| `app/desktop/governance-advance.ts`（未改） | `0359d7ee33efa08fcf3695b8c65a3c722bc784f8` | `e73de2f74d6eb34fb16aa166d17ee9a0b2d970e2f34b8c12c103b793796f39c6` |
| `src/common/shared/i18n/messages/zh-CN.ts`（未改） | `2bf27db22673300cb9e66f1cff4146d895125055` | `ce5420dfced28f01dcaddab1f70e2b6b1936380913cc7a57b052949549dd49b3` |
| `src/common/shared/i18n/messages/en-US.ts`（未改） | `cece6c843a59b56d3494899b669823944fc87005` | `ab0dc94dec5e9904cbfee58a8c00db26f44406453abb2f75e24ff2928dc0908d` |
| `src/common/门禁引擎/governance-roles.ts`（未改） | `5b9fee57dbc15961ddd2968bdb398f3fc64e65e4` | `a1bbeba379fa49de41d21ddb319c9475779d65fbfd67570ba0e8289dfe895293` |
| `test/桌面应用/acceptance-dispatch.test.ts`（R2/R3，已变，143 例） | `48279ae28f1e7f6c14468a0f13a0e2c0ee53e16b` | `6b49ae5b62debe0d39d3d98b78c6690887c9b55b8928bafeb54ef074e863efe7` |
| `test/桌面应用/interface.test.ts`（未再改） | `3397e07eebad1e01a27ca432a93160b671b60fe0` | `7ed0fa9040a6cbff6e673f2bbedf81dbbae2ee0f816c87d040a4e86a811e4b12` |
| `test/门禁引擎/governance-standard-workflow.test.ts`（未改） | `f714a12f04880c08df49075bcdbbc836f7f05610` | `def0cc7e61079c6286ea3c7cfa7f1f80a386500f49257926e17df58a4745c1aa` |
| `test/门禁引擎/verifier-artifact-report.test.ts`（未改） | `e5863a6f690362096c2428af25f123004528d0e8` | `e9b83b1f911c2914ae90d228a543f1015e236cdda7249fcf889404be7749959a` |
| `test/项目管理/shared/i18n.test.ts`（未改） | `d4d9b9b4dbef12f55c3fe94f645f3e34e7d05d78` | `d4efe4834151dcaff2bd4cf15bafa8bf706bdc5e4743e47f5b34efe4210bbfdd` |
| `test/测试/governance-e2e-auto/t-gate-review-return-routing.test.ts`（未改） | `7a4aa0c47d427ea85ea23ef5644666bd351f0f7a` | `04ed023319e25fbbdfc5f54bc3013a100ff146b8155148e92defd200c0f17e4d` |
| `test/测试/governance-e2e-auto/fixture.ts`（未改） | `7fa52596487ad26256b7644c1a7306cf375a07c7` | `da53390ee84e7a8c0ba7a9dda7a000ecd5de6abae64b56d349568f7b3eedd055` |

- 联合摘要独立复算：12 个 `sha256sum` 值排序、换行拼接后取 SHA-256 = `efa131e5d8063fb1e2879617256e89b483274c84b4093ed33f5a1c2149805b42`，与变更包一致。
- `test/桌面应用/` 无新建文件；新增 e2e 在 `test/测试/governance-e2e-auto/` 目录授权内；`gate-review-flow-busy.test.ts`、`governance-trio.test.ts` 零 diff。
- 冻结标准、验收报告 v1、验收 memo 为治理记录，不计产品候选；标准与 v1 报告哈希未变（`8666aa75…` / `a2105e79…`）。

### 1.3 证据身份与全量回归（返工候选）

| 项 | 结果 | 核对 |
| --- | --- | --- |
| 返工证据 README | 135 行；`9dc81bc50f39f2eb83226ec97f1dc0ff9a2ee050be3ccdd2200b5df0b34973a6` | 与变更包一致；复算一致 |
| 返工证据 SHA256SUMS | 21 个文件 | `sha256sum -c` **21/21 OK**（本报告独立执行） |
| 旧最终证据 / S1 基线 | 184 行/`d514438c…`（45/45）；158 行/`995ed094…`（24/24） | 历史对照/基线；未修改 |
| 静态检查（返工候选） | `typecheck` / `typecheck:renderer` / `build:renderer` 均 exit 0 | `typecheck.log`/`typecheck-renderer.log`/`build-renderer.log`；G1 通过 |
| T3 串行全量（返工候选） | 408 文件；4495 tests / 4461 pass / **15 fail** / 19 skipped / 0 todo；exit 1；436s | `t3-full-rework.log`（1,238,820 B）；与 S1 基线 407/4444/4409/16/19 对照，**新增确定性失败 0**；15 红全部为基线既有（9 Windows symlink EPERM + 6 非 EPERM 确定性） |
| 排除项 | `test/pi-adapter/write-sequencing.test.ts` 间歇挂起（14s 通过 / 120s 超时 exit 124 / 13s 通过） | 文件自 HEAD 未修改（`cf8fcbde…`）；沿用 S6 三次探针证据；按既有口径排除并记录 |
| 受影响套件（返工候选） | **462/462 pass**：acceptance-dispatch **143/143 首跑无 flake**、interface 141/141、新 e2e 10/10、gate-flow-busy 3/3、governance-trio 50/50、governance-standard 28/28、verifier-artifact 5/5、i18n 65/65、i18n-guard 6/6、request-gate-review-tool 11/11 | `affected/*.log` 原始输出；计数与变更包一致 |
| 真实 Electron（重跑） | exit 0，78s；`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`；17 张截图 | `electron-rework.log` 第 323–325 行；产品字节已变，**非复用** |
| G4 临时项目场景 | e2e S6-1：gate 派发 → 结构坏 pass 报告 → 补正 → 修正 v2 → 机械复核通过 → 统筹恰一条 `[Gate 通过]`；10/10 | `affected/测试__governance-e2e-auto__t-gate-review-return-routing.test.ts.log`；真实临时项目根/真实 Interface/会话/账本/flow；无截图（按媒体边界允许） |
| 目标/演示零写入 | `pixel-space-demo` 最新文件 16:57（早于本会话 19:42 起）；`demos/` 无 22:00 后修改 | 本报告独立只读核对（find -newermt） |

---

## 二、验收表（P1–P20 + G1–G6）

> 判定规则：每行只能为 `pass` / `fail` / `insufficient evidence` / `not applicable`；N/A 必须写明依据。证据均指向当前返工候选；v1 报告的历史证据只作对照。

| ID | 依据（方案/Q/O） | 判定项（摘要） | 实际证据（路径/哈希） | 候选 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | §9.1 P1；§3.1.1 R1–R5；Q1 A | 报告侧退回向质检恰一条可执行补正任务；字段/错误/下一版本/格式要求齐全；无改判/已接受；gate pending | `acceptance-dispatch` 143/143 中的 R3/R4/R5/R1 用例；e2e S6-1；补正任务断言 `line/column`、v2 路径、格式清单、同一轮、无「已接受/已通过」；routing/gate/ledger 原文 | `efa131e5…` | 桌面窗口、测试 | 通过 | **pass** |
| P2 | §9.1 P2；§3.1.3；Q1 A；Q10 A | 每次退回转换向统筹恰一条对应任务；原因/下一步/投递结果如实；重复扫描不重复；部分失败只重试失败方 | R3/R6/部分失败用例；e2e S6-1/S6-5；任务原文含「质检补正任务投递结果：已投递」「不需要重新派发质检」「应用未替统筹派发」；routing deliveries | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P3 | §9.1 P3；R6；Q6 A | 候选变化不向质检发补正；统筹收到「需重新 request_gate_review」；旧报告不放行；gate pending；保存稳定身份 | R6 用例与 e2e S6-5：质检补正 0、统筹 `[Gate 退回·需重新请求]`、新 v2 pass 不自动收口、routing `candidate-changed`、`rejectedIdentity` | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P4 | §9.1 P4；R8；Q5 A | 连续 3 轮报告侧退回后停止自动补正并给统筹人工；投递失败 ≤3 次后 exhausted；gate 始终 pending | R8 用例与 e2e S6-8；耗尽用例：第 3 轮 `[Gate 退回·需人工]`、第 4 版不再补正、`consecutiveReturns=3`、attempts=3、exhausted、gate pending | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P5 | §9.1 P5；§3.2；Q2 A；Q7 A | 收口成功后统筹恰一条 `[Gate 通过]`；身份/报告/revision/可派发+仅知情分组或空原因；应用未派 worker/未改其它步骤 | P5 用例与 e2e S6-1/S6-10；恰一条、`delivery-after-gate` 可派、`verifier-followup` 仅知情、无 `dispatch.accepted`、无 worker 派单、重启不重复；空原因用例存在 | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P6 | §9.1 P6；Q7 A | 同周期统筹最多一条覆盖「gate 通过+ready」；同口径去重键含仅知情 | P5 用例断言同周期 `[自动推进]` 0；`interface.test.ts` 断言恰一条 `[Gate 通过]`、400ms 内无 `[自动推进]`；`gatePassReadyDedupe` 与 `wakeStewardForReadySteps` 同一公式/`APP_MANAGED_READY_STEP_IDS` | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P7 | §9.1 P7；§3.5；§4.5 第 6 点 | 重复 settle/扫描/重启不重复；路由记录驱动恢复；同一报告只路由一次；新版本只开一轮 | R3 重复扫描、P5 重启、e2e S6-10；routing record 原文；崩溃窗口/重建重复风险按已知限制记录（见 §六.1） | 同上 | 桌面窗口、测试 | 通过（已知限制见 §六.1/§六.2） | **pass** |
| P8 | §9.1 P8；§3.4；§4.5；Q12 A | 发送/打开失败如实 failed、主理如实、有界重试、只重试失败方；路由记录写失败零发送且 gate 记录保持 dispatched；不改投主理 | 返工用例 `2026-10-27 gate 路由记录写失败（可读/合法但写入失败）…`（`acceptance-dispatch` 7756 一带）：注入 `gateHandoffWriteJsonFn` 抛错 → gate 保持 dispatched、质检/统筹零任务、主理「路由记录写入失败」、无 gate.review；修复后重启下一次事件正常路由一次；open/send/partial/exhausted 用例同批通过 | 同上 | 桌面窗口、测试 | 通过（R2） | **pass** |
| P9 | §9.1 P9；§3.7；§5.5 | 无可解析 pass 报告绝不收口/写 passed；不改报告字节、不写 customer.decision/分诊；退回 gate pending | R3 用例断言无 `gate.review`/`customer.decision`/下游 `dispatch.accepted`、gate pending；P5 用例仅 pass 收口；负例覆盖 R3/R4/R5/R6/R2b | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P10 | §9.1 P10；Q8 A；O4 不做；B10 | `request_gate_review` 仍只注入统筹、契约/码集合不变、flow-busy 保持；无新增工具/能力位/枚举/账本 kind；边界/写权未变；路由记录 app 私有 | `git diff --name-only` 仅 11 修改 + 1 新增 e2e；无 `src/model/**`、`src/provider/**`、`session.ts`、`watchdog.ts`、`app/main.ts`、`preload`、边界/角色卡 diff；`governance-roles.ts` 仅 +9 卡文本；无新增 `appendGovernanceLedger`/账本 kind；`gate-review-record/v1` 形状未变；`flow-busy` 行未改；`DesktopDeps.gateHandoffWriteJsonFn` 为 app 私有 test-only 可选注入（缺省=生产 `writeGateJson`，仅 interface/test 引用） | 同上 | 全角色 | 通过（R2 注入面已核对） | **pass** |
| P11 | §9.1 P11；Q3 A/O1；Q4 A/O3 | 扫描在真实事件 + 看护 tick；O1 空闲一次提醒、忙/排队跳过；重复 tick 不刷屏；看护不可用有兜底 | O3/O1 用例、e2e S6-3/S6-9：无真实事件扫描、重复 tick 不刷屏、质检忙不发提醒、记录保持 dispatched；`runFlowAdvanceTick` 调用 `processGateReviewsForFlow`（`skipGateScan` 分支保留） | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P12 | §9.1 P12；Q10 A；RF-05 | zh/en key 齐全、占位符一致；主理系统行如实；UI 与 agent 任务文本分离；保留 flowBusy/passNote 语义 | `i18n.test.ts` 65/65（key 数 1395；7 新 key 占位符断言）；`flowBusy` 12 条子串断言保留；`passNote`「最终客户验收」/`final customer acceptance` 保留；`returnedToProof` 语义保留并追加「投递结果另行说明」；主理事实行/结果行在 R3/P5 用例断言 | 同上 | 项目管理、测试 | 通过 | **pass** |
| P13 | §9.1 P13；§3.6；§二.10 | 每次路由决策/跳过/失败有结构化诊断（flowId/gateId/reasonCode/attempts）；无报告正文/凭据/命令原文；不改变控制流 | `interface.ts` 中 `gate.return.route.*`、`gate.pass.handoff.*`、`gate.handoff.record.*`、`gate.route.exhausted`、`gate.reminder.skip` 等；`reasonDigest` 仅 sha；错误/摘要有界；R1 重建有 `gate.handoff.record.rebuilt`/`rebuild-write.failed`；无报告正文/凭据 | 同上 | 桌面窗口 | 通过 | **pass** |
| P14 | §9.1 P14；§1.4；B8 | 既有 gate pass/fail/nit-only/返工/恢复/审计行为除新增转交外不变；两条返工路由未动；既有测试不弱化 | T3 15 红全为基线，新增确定性 0；`routeGateRework` 函数体与基线逐字节相同（提取对比）；最终验收返工路由不在 diff；`interface.test.ts` 仅把等待 `[自动推进]` 改为更强断言（恰一条 `[Gate 通过]`、含可派步骤、同周期无 `[自动推进]`），有设计 §3.2/Q7 依据；既有断言未删除 | 同上 | 全角色、测试 | 通过 | **pass** |
| P15 | §9.1 P15；R7；F6；RF-02 | 历史 returned 无路由记录：一次统筹历史提示、不重派质检、不猜原因、不转 dispatched、跨重启不重复 | R7 用例与 e2e S6-6：恰好一条 `[Gate 退回·历史记录]`、附 error 摘要、质检 0、gate 记录字节不变、`latestReturn.cause=legacy`、重启后 0 条 | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P16 | §9.1 P16；§3.4；F6；RF-02 | 路由记录损坏/无法解析时，按 gate 记录 + 报告身份重建；无法重建才 fail-closed；不伪造；历史 passed 不追溯 | **返工已实现**：`rebuildGateHandoffIdentity` + 5 个 handoff 处理点重建优先（return 事件、reminder、complete pass、retry pass、returned 扫描）；第 6 处约 8948 为既有 `gate-rework-routing`，不属 P16 且未改。用例：returned 事件 corrupt → 重建后按已知 cause 正常补正/知情、同一旧报告不重开；passed 扫描 corrupt → 重建 passHandoff 并转交；passed 无 sha → 零发送、主理如实、记录不变；returned 扫描 corrupt → 恢复身份 guard、原因不可安全推断时零发送/不转 dispatched/不收口 | 同上 | 桌面窗口、测试 | 通过（R1） | **pass** |
| P17 | §9.1 P17；R2b；F10；Q3 A/O1 | 报告存在但不可读：一次提醒+统筹知情；记录保持 dispatched；身份固定；同版本不重复；R2b+O1 上限 3 后停止并人工提示 | R2b 用例与 e2e S6-2：提醒含「仍为 dispatched」「未判退回」「读取权限」；`reminderCount` 1→2→3，v4 达到上限后质检 0 新增、统筹第 4 条人工提示、`humanNoticeAt` 非空、gate 记录 dispatched、`consecutiveReturns=0`；O1 用例同样断言 | 同上 | 桌面窗口、测试 | 通过 | **pass** |
| P18 | §9.1 P18；§4.5；Q6 A；F2/F13 | R5/R6 保存被拒报告稳定身份；同一旧报告不转 dispatched/不覆盖 revision/不收口；同 sha 不同版本视为新报告；记录形状不变 | R5 可读/同 sha 不同版本用例与 e2e S6-4；**新增**不可读 R5/R6 用例：`rejectedIdentity.reportSha256=null`、size/mtime 为数字、同一目录重复扫描不重复退回/不重开、R6 新版本不自动放行；`gate-review-record/v1` 形状未变 | 同上 | 桌面窗口、测试 | 通过（R3） | **pass** |
| P19 | §9.1 P19；§1.4；B10 | flow 在途 ⇒ 可重试 flow-busy（非 unavailable），零 gate 记录/账本/路由；本方案路由不因 flow-busy 触发；卡/Provider/i18n/既有测试保持 | e2e S6-9：在途 ⇒ `flow-busy`、无 gate 记录/无路由/无 verifier 任务；在途结束后重试 `dispatched`；`gate-review-flow-busy` 3/3、`governance-trio` 50/50、`request-gate-review-tool` 11/11、`acceptance-dispatch` flow-busy 用例通过；`flow-busy` i18n/卡文本未改 | 同上 | 测试、门禁引擎 | 通过 | **pass** |
| P20 | 闸门 1 O2（Q9 A）+ RF-04 | 统筹/质检卡保留基线 `flow-busy` 段与质检纪律；只新增通知来源/边界；不改能力/边界/注册表；测试保留旧断言并新增 | `governance-roles.ts` diff +9/−0（仅卡文本）；`gate-review-flow-busy` 3/3、`governance-trio` 50/50、`governance-standard` 28/28、`verifier-artifact` 5/5；新增卡测试断言六类任务/来源/边界/不改判/不派下游，并逐字断言基线 `flow-busy` 三段、质检「应用会退回你补报告、不触发返工」；反向断言无越权表述 | 同上 | 门禁引擎、测试 | 通过 | **pass** |
| G1 | §9.2 G1 | `npm run typecheck` 0 诊断，记录候选/命令 | 返工证据 `typecheck.log` exit 0；`typecheck-renderer`/`build-renderer` 0 | 同上 | 测试 | 通过 | **pass** |
| G2 | §9.2 G2 | 定向套件通过并记录计数（acceptance-dispatch、门禁引擎 O2、i18n） | 见 §1.3：acceptance 143/143（首跑无 flake）、interface 141/141、e2e 10/10、gate 3/3+50/50+28/28+5/5、i18n 65/65+guard 6/6、runtime 11/11；合计 462/462 | 同上 | 测试、各角色 | 通过 | **pass** |
| G3 | §9.2 G3；团队计划 §6.4 | T3 全量（桌面/门禁/i18n 全套、串行、排除挂起、基线对照、类型/构建、Electron） | 4495/4461/15/19/0；15 红全基线；`write-sequencing` 排除记录；静态检查 3/3 exit 0；Electron 重跑 `E2E_PASS=true`；G4 e2e 10/10 | 同上 | 测试 | 通过 | **pass** |
| G4 | §9.2 G4；团队计划 §6.4 | 临时/隔离项目复现现场形状；截图至多（真实运行、关 DEBUG、记 sha/候选/命令/尺寸）；不要求录屏 | e2e S6-1 在系统临时根、真实 Interface/会话/账本/flow；10/10；无截图（场景不在 `main.mjs` UI 断言面；标准允许，缺录屏不构成失败）；目标/演示未写 | 同上 | 测试 | 通过 | **pass** |
| G5 | §9.2 G5；团队计划 §6.5 | 变更包含候选哈希、改动路径、任务节点、证据链接、T3；未 commit/push | 变更包 v1.1 188 行/`09768d95…`：12 文件逐哈希、联合摘要 `efa131e5…`、S1–S7 节点、返工证据索引、T3、方案 v3.2、已知限制；`git status` staged 0、HEAD 未变、无 commit/push；R4 沟通记录引用已更正为当前 95 行/`d651e941…` | 同上 | 统筹 | 通过 | **pass** |
| G6 | §9.2 G6；团队计划 §6.1 | 桌面/门禁（O2）/项目管理（i18n）按规则更新 change 记录；状态如实；目标/演示零写入 | 桌面 5 份（含返工记录 95 行/`1e743378…` 与更新后的 routing-core 167 行/`0d245b29…`）、门禁 O2、PM i18n change 记录均在主检出（`implemented-unverified`/未验收；无 `verified` 宣称）；测试证据 README/SHA256SUMS；方案哈希未变；目标项目最新文件 16:57、`demos/` 无 22:00 后修改 | 同上 | 各角色、测试 | 通过 | **pass** |

---

## 三、R1–R4 复核说明

### 3.1 P16（R1，pass）：重建分支已实现

- **实现：** `app/desktop/interface.ts` 新增 `rebuildGateHandoffIdentity(projectRoot, record)`：从 gate 记录 + 报告身份恢复稳定身份（可读用真实 sha；不可读用 path/version/size/mtime）；不读取/猜测 cause、不读报告正文。5 个 `gate-handoff-routing/v1` 处理点先重建、无法安全重建才 fail-closed：
  1. `routeGateReturnHandoff`（退回事件；cause 来自当前分支机械判定，重建空记录 + guard 后正常补正/知情）；
  2. `routeGateReminderHandoff`（R2b/O1 提醒；同）；
  3. `completeGatePassWithHandoff`（通过路径；重建 passHandoff 后转交）；
  4. `retryGatePassHandoff`（passed 扫描；报告 sha 可重建 passHandoff 后转交）；
  5. returned 扫描（恢复身份 guard，原退回原因不可安全推断时零发送、不转 dispatched、不收口）。
- **第 6 处约 8948 的 corrupt 属既有 `gate-rework-routing/v1` 的 fail 返工路由**（`routeGateRework`），按设计 §8.2 保持不变；其函数体与基线逐字节相同，不属 P16。
- **证据：** `acceptance-dispatch` 143/143 中 P16 三用例（returned 事件重建、passed 扫描重建、不可重建零发送）与 returned 扫描 corrupt 用例（恢复 guard、零发送）；routing record 的 `rebuiltAt`/`rebuiltGuard`/`latestReturn.cause`；gate/flow/ledger 原文；T3 无新增失败。
- **残余（变更包 §六.1 已披露）：** 重建时无法恢复损坏前的投递状态；若原通知已送达，可能重复一次。属 P16 重建的固有残余，已如实诊断/记录；后续扫描按 rebuilt 记录去重，不持续重复。该残余不改变 P16 pass；如客户要求严格去重，需独立方案（不由验收自行加严）。

### 3.2 P8（R2，pass）：真实写失败注入已成立

- **实现：** `DesktopDeps.gateHandoffWriteJsonFn` 为 app 私有可选依赖（缺省 = 生产 `writeGateJson`；仅 `interface.ts` 声明/使用、`acceptance-dispatch.test.ts` 注入；无生产构造方设置，生产行为零变化）。所有 handoff 路由记录写经 `writeGateHandoffJson`（`deps.gateHandoffWriteJsonFn ?? writeGateJson`）。
- **用例：** `2026-10-27 gate 路由记录写失败（可读/合法但写入失败）…`（`acceptance-dispatch` 7756 一带）：路由记录路径可读/合法，注入写入抛错 → gate 记录保持 `dispatched`、质检/统筹零任务、主理「路由记录写入失败」如实、无 `gate.review`；修复后新实例下一次真实事件正常路由一次。满足 P8 的“零发送 + gate 保持 dispatched + 主理如实 + 有界重试”要求。
- **P10 核对：** 该注入为 app 私有 test-only 钩子，不是角色工具/能力位/共享契约；生产缺省零变化。

### 3.3 P18（R3，pass）：不可读 R5/R6 身份已覆盖

- **新增用例：**
  - `P18 不可读 R5：rejectedIdentity 用 size/mtime 判同一报告，不重复退回`：不可读报告 + 版本偏旧 → `rejectedIdentity.reportSha256=null`、size/mtime 为数字；重复扫描不重复退回/不重复任务。
  - `P18 不可读 R6：候选变化 rejectedIdentity 用 size/mtime；新版本也不自动放行`：R6 保存 size/mtime，新版本仍不自动开启新一轮，等统筹重新请求。
- **结果：** 两用例通过；可读稳定身份/同 sha 不同版本/记录形状不变的既有证据仍有效。P18 残余关闭。

### 3.4 R4（文档，pass）：沟通记录引用已更正

- 变更包 v1.1 §一已写：写包时 86 行/`a12715d7…`，当前 95 行/`d651e941…`（追加闸门 2/实施授权），并注明已确认对象哈希未变。R4 关闭。

---

## 四、其余 P/G 的候选变化复核

- **仅 `interface.ts` 与 `acceptance-dispatch.test.ts` 相对 v1 候选变化**；其余 10 个候选字节相同（哈希见 §1.2）。
- **P1–P7、P9–P15、P17、P19、P20：** 返工后 `acceptance-dispatch` 143/143（含全部既有 R1–R8/R2b/O1/稳定身份/损坏/失败/恢复/通过转交/去重用例）与 T3 全量、门禁/i18n/runtime/e2e 套件均通过；`routeGateRework` 与最终验收返工路由未改；无新增工具/能力位/枚举/账本 kind/边界/写权；O2 卡文本 +9/−0 且基线 `flow-busy` 三段逐字断言；i18n 65/65 且 `flowBusy`/`passNote` 语义保留。判定沿用 v1 报告的通过依据，候选身份/证据已重新核对。
- **G1–G6：** 静态检查 3/3 exit 0；定向套件 462/462；T3 4495/4461/15/19（新增确定性 0）；Electron 重跑 `E2E_PASS=true`；G4 e2e 10/10；变更包 v1.1 齐全；角色 change 记录更新且状态 `implemented-unverified`；目标/演示零写入。

---

## 五、总体结论与发布边界

### 5.1 总体结论：**通过（pass）**

- P1–P20 全部适用项 pass；G1–G6 全部 pass；v1 的 P16 fail、P8 insufficient evidence、P18 残余均已关闭。
- 候选哈希与证据一致；T3 全量对当前候选执行且新增确定性失败 0；真实 Electron 重跑 `E2E_PASS=true`；G4 临时项目 10/10；目标/演示零写入；报告首行五项齐全。
- 已知限制/残余（不改变 pass）：重建后一次性重复通知风险（变更包 §六.1）、“发送成功后未落 sent”崩溃窗口（§六.2）、T3 15 条基线既有红与 19 项平台性 skip 不计通过、`write-sequencing` 间歇挂起排除、真实模型/网络/打包/其他平台未测、Electron 截图不覆盖 gate 路由 UI 定向断言（由 e2e 覆盖）。

### 5.2 结论边界

- 本结论只对当前候选（12 文件、联合摘要 `efa131e5…`）有效；候选、输入、依赖、契约、夹具、配置或环境变化使受影响证据失效，按冻结标准 §2.3 重新判定。
- 本结论不是客户批准、不是发布授权，不授权 commit/push/合并/发布或任何对外操作；发布版本另行随发布流程验收，不能引用本报告替代发布验收。
- 本报告不修改产品代码/测试/角色卡/边界/方案/团队计划/标准/目标项目；未 commit/push；未启动取证子上下文。

---

## 六、未覆盖、残余与说明

1. **重建后重复通知（R1）**：变更包 §六.1 已披露；属 P16 重建的固有残余，诊断如实、不引入第二套事务/锁；不改变 pass。
2. **崩溃窗口**：方案 §4.5 第 6 点“发送成功后未落 sent 即崩溃”可能重复一次；已知限制，按标准 §9 全局说明核对。
3. **T3 基线红/skip**：15 红全部为 S1 基线既有（9 Windows symlink EPERM + 6 非 EPERM 确定性）；19 项平台性 skip 不计通过；`write-sequencing` 间歇挂起按既有口径排除并记录。
4. **未测**：真实模型/网络、打包/签名/安装器、其他平台；不在本变更验证范围。
5. **Electron 截图**：仅启动/导入/聊天/卡片/系统行通道回归，不覆盖 gate 路由 UI 定向断言；gate 路由由 e2e 真实 harness 覆盖；无截图/录屏要求不构成失败。
6. **证据复用**：v1 候选的未变文件证据（`d514438c…` 45/45）只作历史对照；本报告 P1–P8/P16/P18 以返工后 evidence 为准；Electron 因产品字节变化重跑，非复用。
7. **角色文档位置**：桌面/门禁/PM 的 change 记录与测试证据在主检出 `角色卡/<角色>/docs/change/`，按变更包/团队计划治理记录登记，不计 12 个产品候选哈希；G6 按该约定核对。
8. **报告版本**：v1 报告（212 行/`a2105e79…`）保留，不复写；本 v2 是返工后复判的唯一当前结论。v1 中的 P16/P8/P18 判定针对旧候选，已由本报告 §三更新。

---

## 七、判定时的只读核对记录（摘要）

- `sha256sum` 复算方案/复核/团队计划/沟通/提案审核/标准/变更包 v1.1；`git hash-object` + `sha256sum` 复算 12 个返工候选；联合摘要 `efa131e5…` 复算一致。
- `sha256sum -c` 返工证据 21/21 OK；旧最终证据 45/45、基线 24/24 保留未改。
- 解析 `t3-full-rework.log` 汇总（4495/4461/15/19/0，exit 1，436s）与失败清单；对照基线 16 红，确认新增确定性 0。
- 解析 `affected/*.log`（462/462）；核对 `electron-rework.log` 的 `E2E_PASS=true`、`E2E_FAILURES=`、`E2E_DONE=1`。
- 阅读 `interface.ts` 的 `rebuildGateHandoffIdentity`、`writeGateHandoffJson`/`DesktopDeps.gateHandoffWriteJsonFn`、5 个 handoff 重建点与第 6 处既有 `gate-rework-routing`；核对 `routeGateRework` 函数体与基线逐字节相同。
- 阅读 `acceptance-dispatch` 的 P16（returned 事件/passed 扫描/不可重建/returned 扫描）、P8 写失败、P18 不可读 R5/R6 用例与断言；核对 143 例。
- 核对 `pixel-space-demo` 与 `demos/` 的会话时间窗零写入（目标最新 16:57；demos 无 22:00 后修改）；核对 worktree `git status`/HEAD 与变更包一致。

---

## 八、声明

- 本报告是内置独立验收对当前返工候选的唯一判定（唯一 B2），结论为 **通过（pass）**；不是客户批准，不是发布授权，不授权提交/推送/合并/发布或任何对外操作。
- 本报告不修改产品代码/测试/角色卡/边界/方案/团队计划/标准/目标项目；未 commit/push；未启动取证子上下文。
- 方案实质变化、候选变化或标准变化时，按冻结标准 §2.3/§2.5 重新判定受影响部分；发布版本另行验收。
