# 独立验收报告：客户授权平面——两个标记 `@审批` / `@决策`（T3）——E2 v1

- **任务 ID / flowId**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane`
- **风险档位**：**T3**（共享 Model/公共入口/跨模块契约 + 权限与审计语义变更；客户闸门 0 声明、方案 §11.3、复核与团队计划一致；不降档）
- **判定依据**：客户闸门 0/1/2 与实施授权记录 `docs/communication/2026-11-03_intent_customer-authorization-plane.md`（当前 **207 行 / SHA-256 `148485eafef0d10f9d483054cbf00e927b131ef0165402c505772c9df1edf587`**；E1 写盘时引用的 199 行 / `31d3064a…` 为历史快照，不混用）；闸门 1 确认方案 **P1.1 1199 行 / `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229`** + 盘上 **P1.2 1209 行 / `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688`**（R1/R2 编辑性等价，V1 §1.2.1；冲突以 P1.1 为准）；复核 **132 行 / `d258844527c382aeb1b575f9f0401a87422d557acc94fe2ea181924c6b5aa1b3`**；团队计划 v1 **653 行 / `37e6bd0dcf63a29fde654ded9a1425272692b95483bab5c276cbdd16f4122fe3`** + §十三/§十四（现行 **675 行 / `4545d3a5f3c94cc8476bba1197a17e3d6c3028850acd9dd2ae0ccaea0a75f671`**）；实施前标准 V1 **1171 行 / `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069`**；E1 变更包 **117 行 / `e3b3ca7007c38229aae1dafd4e554e70ca3fc59b9a53bc4648e0c010bfb06191`**。
- **当前候选**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`（分支 `feat/customer-authorization-plane`）+ **54 文件**（53 产品/测试源 + 1 test-only D2 探针）。候选冻结清单 `角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence/09-candidate-identity-fix.txt` **134 行 / `49cfc38d6ee6eaa4fab4b69b9a368e40acb19517d645b5314c57e481041a307a`**；运行后清单 `17-post-run-candidate-identity-fix.txt` **134 行 / `71b24533d714c5a26d98213df26a4734ca03221cdb91a75536b73e74ce76fcf1`**。本验收独立复算 **54/54 文件 SHA-256 全匹配、blob 抽查一致、unexpected 0 / missing 0 / mismatch 0**（详见 §一）。
- **验收入口**：E1 变更包 `docs/scheduling/customer-authorization-plane-change-v1.md`（117 / `e3b3ca70…`）；B0 **239 行 / `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441`**；D1 **231 行 / `c4d6ecfe105a9a218fd720e55b7bcc84761326cbc361148864e96d5160c7a9ad`**；D2 **459 行 / `df1bebd883cf42e9d0be9aebd023e6fc3f7673f1810b19a95de571da34c1faf6`**。
- **结论**：**证据不足**。逐项：**16 项 pass、7 项 insufficient evidence、0 项 fail、1 项 not applicable（AC-23 整体，O9 未选；AC-24 仅 O11 子句 N/A）**。无 fail，故不判返工；但存在 V1 要求的真实运行/原始样例证据缺口，不能判通过。补证清单见 §六。
- **性质**：本报告是本次任务的**唯一 B2 独立验收结论**（E2，同一验收主上下文；未启动只读取证子上下文）。结论只对当前候选有效；**不授权提交、推送、合并、发布**。

---

## 一、输入版本、候选身份与写集闭合

### 1.1 输入版本（只读实测）

| 输入 | 实测（2026-11-03 E2） | 说明 |
| --- | --- | --- |
| 沟通记录 | **207 行 / `148485eafef0d10f9d483054cbf00e927b131ef0165402c505772c9df1edf587`** | 含闸门 0/1/2、实施授权、V1/P1.2/H1/W-1/W-5/D2/E1 记录；E1 引用的 199 行 / `31d3064a…` 为历史快照 |
| 方案 P1.1（闸门 1 确认版） | **1199 行 / `7875ad6a…`** | 语义基线；冲突时以其为准 |
| 方案 P1.2（盘上） | **1209 行 / `1748ad2d…`** | 仅 R1/R2 编辑性收口；V1 §1.2.1 已记录等价映射 |
| 复核记录 | **132 行 / `d2588445…`** | P1.0 F1–F9 + P1.1 再复核；R1/R2 建议级 |
| 团队计划 v1 + §十三/§十四 | **675 行 / `4545d3a5…`** | v1 653 / `37e6bd0d…` 仍为闸门 2 确认版；§十三 W-1 A、§十四 W-5 A 为增补 |
| V1 实施前标准 | **1171 行 / `51ac0f50…`** | 含 §1.2.1 P1.2 版本注记；AC-1..AC-24 与 P1.1 §10.2 逐字一致 |
| E1 变更包 | **117 行 / `e3b3ca70…`** | 候选/证据索引，不是验收结论 |
| B0 | **239 行 / `f1c54f09…`** | rebase 后 HEAD `4c3a6e4`；T3 基线 393 文件 / 3479 / 3452 / 9 / 18 |
| D1 | **231 行 / `c4d6ecfe…`** | 修复前历史候选的集成/全量；E2 不作为当前候选证据 |
| D2（含 D2-fix Revision 1） | **459 行 / `df1bebd8…`** | 原 288 行保留 63/64 失败事实；D2-fix 当前候选 64/64 |
| P1 审核 | **397 行 / `3faef8ee…`** | `recommend approval`；P1-CAP-01..18 闭合 |
| C2 窄修复记录 | **139 行 / `6157181c…`** | 面板撤销回执修复；原用例保留 + 新用例 |
| i18n allowlist 增补记录 | **91 行 / `a92aa7da…`** | W-5 A；guard 6/6、violations=0 |

### 1.2 候选身份（独立复算，不采信 E1/D2 自述）

| 检查 | 命令/方法 | 结果 |
| --- | --- | --- |
| HEAD / 分支 | `git rev-parse HEAD` / `git branch --show-current` | `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0` / `feat/customer-authorization-plane` |
| 候选路径数 | `git ls-files -m -o --exclude-standard -- src app test` | **54 文件**（与冻结清单 54 一致） |
| 逐文件 SHA-256 | 独立 Node 读文件计算（不调用 git） | **54/54 与 `09-candidate-identity-fix.txt` 匹配；missing 0 / mismatch 0** |
| 逐文件 git blob | 独立 `git hash-object` 抽查 + Node 复核 | 抽查 `app/desktop/customer-input.ts` `2c29c737…`、`app/desktop/interface.ts` `4114f9b2…`、`src/model/runtime.ts` `b9289187…`、`test/编排/task-state.test.ts` `4d810681…`、`test/项目管理/shared/i18n.test.ts` `1de9f5a3…`，均与冻结清单一致（28 个 tracked 文件的 blob 差异为工作区 CRLF 与 git clean 过滤所致；SHA-256 全部一致） |
| 暂存区 | `git diff --cached --name-only` | 空 |
| 写集外 | `git status --porcelain -- src app test` | 50 个 status 条目，展开即 54 候选；无其它产品/测试路径 |
| 配置/锁/入口 | `package.json`、`package-lock.json`、`tsconfig*`、`vite.config.ts`、`electron-builder.yml`、`src/interface/cli` | **零改动** |
| e2e 夹具 | `test/桌面应用/e2e/main.mjs` | **零改动**（未扩展；D2 使用探针） |
| 边界 | `git diff` 三份 boundary.md/yaml | 仅 B-1..B-4 共 **7 条**（运行时核心 2 Model 文件、编排 1 Pipeline + 2 有界目录、桌面窗口 2 测试文件）；md/yaml 一致；无其它边界变更 |
| 提交纪律 | `git log -1` / staged | HEAD 仍 `4c3a6e4`；未 commit/push；未暂存 |

**候选身份结论**：当前工作区与 E1 冻结清单逐文件一致；E2 期间只读复跑未改动候选。`app/renderer/dist/`、`node_modules/`、D2 `probe-run-*/userData`、`e2e-*/userData` 为忽略/临时产物，非候选。

---

## 二、判定方法与证据复用

### 2.1 判定规则（按 V1）

- 每条 AC 只能判 `pass` / `fail` / `insufficient evidence` / `not applicable`；`not applicable` 仅 AC-23 整体（O9 未选）与 AC-24 的 O11 子句（O11 未选），依据闸门 1「O1–O11 选装均不实施」与团队计划 §7.1。
- 无 fail 但有任一项 `insufficient evidence` → 总体 **证据不足**，不得判通过；任一 fail → 返工。
- 证据必须绑定当前候选；D1/D2 修复前数字、C2 修复前 401/401、D2 首跑 63/64 只作历史对照，不作为当前候选通过依据。

### 2.2 证据复用与失效

- **复用**：B0 对未受影响路径；A1/A2/A3/B1/C1 的 49 个候选文件在 D2-fix 前后逐字未变；D2-fix 已在当前候选上重跑受影响套件、T3 全量、E2E、探针、双端 typecheck/build；候选身份 54/54 与 E1 一致。E2 因此复用 D2-fix 的 T3/受影响套件/E2E/探针证据。
- **失效**：D1 的修复前 T3（3623/3596）与 D2 首跑（63/64）被 C2 窄修复取代，E2 不采用；C2 修复改动 4 文件后，D1/D2 修复前的受影响证据不再代表当前候选。
- **独立补验（只读）**：E2 在当前候选上独立复跑双端 typecheck 与关键定向套件（结果见 §2.3）；未改动候选、未启动应用、未录屏。

### 2.3 E2 独立复跑（当前候选）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 双端 typecheck | `npm run typecheck`；`npm run typecheck:renderer` | 均 **exit 0** |
| 运行时核心指令 | `node --test --test-concurrency=1 test/runtime-core/directive-marker.test.ts test/runtime-core/directive-contract.test.ts` | **27/27 pass**，exit 0 |
| 编排指令/闸 | `node --test --test-concurrency=1 test/编排/customer-directive.test.ts test/编排/customer-directive-gate.test.ts` | **40/40 pass**，exit 0 |
| 桌面指令 | `node --test --test-concurrency=1 test/桌面应用/directive-input.test.ts test/桌面应用/directive-decision.test.ts` | **22/22 pass**，exit 0 |
| 桌面UI指令 | `node --test --test-concurrency=1 test/桌面UI/directive-dialog.test.ts test/桌面UI/directive-panel.test.ts` | **28/28 pass**，exit 0 |
| 跨层集成 | `node --test --test-concurrency=1 test/测试/customer-authorization-plane-integration.test.ts` | **6/6 pass**，exit 0 |
| shared 指令相关 | `node --test --test-concurrency=1 test/项目管理/shared/jsonl-ledger.test.ts test/项目管理/shared/i18n.test.ts test/项目管理/shared/i18n-guard.test.ts` | **33/33 pass**，exit 0 |

**口径**：E2 未重跑 4 分钟级 T3 全量；D2-fix 的 T3 全量在当前同一候选上执行（403 文件清单哈希 `ccabf2f3…` 与 D1/B0 一致），且候选身份在运行后复查 54/54、E2 复跑未改候选，故按 V1 §2.5/§4.7 复用。若补证修改任何候选文件，T3 证据失效并须重跑。

---

## 三、AC-1..AC-24 验收表

> 表中「实际证据路径/哈希」给出主要原始证据；完整索引见 D2 §10.8 `18-evidence-hashes-revision1.txt`。候选版本列统一为 E1 候选快照（HEAD `4c3a6e4` + 54 文件逐文件哈希），下文不再逐行重复。

| ID | 方案标准（摘要，不弱化） | 需要的证据（摘要） | 实际证据路径/哈希 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- |
| AC-1 | §3.1 识别规则全部通过（前导空白/边界/多行/近失配/全角/`@边界`；空正文；带图拒绝） | 解析器单测 + 输入夹具 + 截图 + D2 四类真实运行 | 解析器 27/27（`test/runtime-core/directive-marker.test.ts`）；C1 22/22（`test/桌面应用/directive-input.test.ts` 命中/空正文/带图）；D2 S1/S2/S3 截图；**缺 D2 近失配普通投递、空正文面板、带图拒绝的真实运行截图** | 运行时核心、桌面窗口、桌面UI、测试 | 规则单测全过；D2 仅覆盖命中面板 | **insufficient evidence** |
| AC-2 | 命中不调用 `SessionManager.send`/`handle.send`；无角色轮次/`lastUserText`/`session:events`；未命中逐字不变 | 调用计数/诊断 + 集成 + diff + D2 | C1 22/22：`sendCalls.length=0`、`env.events` 不变、`inputAccepted/turnId/outcome/sessionCurrent` 未写、未命中普通消息 `sendCalls=["普通客户消息"]`、坏图仍拒发；D2 S1 `S1_NO_USER_BUBBLE=true`；**缺 D2 未命中普通消息真实投递截图** | 桌面窗口、测试 | 主进程行为证据完整；D2 未命中真实运行缺 | **insufficient evidence** |
| AC-3 | 面板显示原文/动作/范围/资源/期限；解析不确定留空并列未识别片段；确认禁用直到有效 | UI 测试 + 截图 + IPC + D2 | C2 28/28（`directive-dialog.test.ts`/`directive-panel.test.ts`：字段/`confirmable:false`/未识别/超限）；C1 IPC 载荷；D2 S1/S2/S3 截图；**缺 D2 空正文与未识别片段的真实运行截图** | 桌面UI、桌面窗口、测试 | 字段/禁用测试全过；D2 两个子场景缺 | **insufficient evidence** |
| AC-4 | 取消/关窗/面板不可用/写失败：不落账、不投递、无假回执；原文回草稿；关窗取消未决 | 集成/桌面测试 + 故障注入 | C1 22/22（取消/未知 id/关窗 `cancelAll`/`directiveCancelled`）；B1 40/40（`submitFromInput` 取消/通道异常/非法回包不落账；账本写失败 `ledger-write-failed` 不更新视图）；C2 store 取消/项目切换；`Composer.tsx:356-379` 按 runtime×role 恢复草稿；D2 S6 `S6_CANCEL_MESSAGE="已取消；未记录。"`、零账本 | 桌面窗口、桌面UI、编排、测试 | 四路径均有测试/运行证据；项目切换按设计清空旧项目草稿（D2 §5.5 披露） | **pass** |
| AC-5 | 回执精确四条模板；只在 durable 后出现；不含原文全文；不进模型上下文 | i18n 快照 + 集成 + 截图 + D2 | A3 i18n 11/11（四条模板逐字、`{id}` 唯一参数）；C1 22/22（durable 后回执、失败无回执）；D2 探针 detail：`已记录审批指令 #d-1/#d-2`、`已记录决策指令 #d-3`、`已撤销决策指令 #d-3/#d-4`、`已撤销审批指令 #d-1`；无录屏 | 项目管理、桌面窗口、桌面UI、测试 | 四条回执与撤销回执真实运行逐字匹配；不含原文 | **pass** |
| AC-6 | 账本路径/schema/ID `d-<seq>`/target/until/seq 单调/版本/轮转/未知事件/坏行/幂等符合 §5 | Provider/Service 单测 + 账本样例 | B1 40/40（`customer-directive.test.ts`：路径、schema、ID max+1、轮转 `.1` 最新/`.N` 最旧、坏行、未知 kind、幂等、写失败）；D2 账本 `probe-run-3/.../customer-directives.jsonl` **9 行 / `9e582f1f…`**（created/revoked、d-1..d-9、target、highRisk）；**缺 V1 要求的 created/consumed/revoked/expired 全类 + 坏行/轮转原始样例文件** | 运行时核心、编排、测试 | 行为测试全过；原始样例覆盖不全 | **insufficient evidence** |
| AC-7 | approval 快照不含 decision；decision 快照不含 approval；跨 target 撤销被拒；提示词不含另一 target；伪造记录丢弃 | 类型负例 + 过滤测试 + 提示词快照 | A1 27/27（`ApprovalDirectiveFact`/`DecisionDirectiveFact` 不兼容、type 负例、快照只含本 target）；B1 40/40（target 过滤、伪造记录丢弃、跨 target 撤销错误）；`governance-judge-prompt.ts`/`shell-judge-prompt.ts` 无 directive 字段（E2 grep 零命中）；D1 集成 6/6 | 运行时核心、编排、桌面窗口、测试 | 类型/运行时/提示词三层隔离均成立 | **pass** |
| AC-8 | 审批 allow 精确命令在硬地板后放行；once/session/forever；c=allow 不消费；script 不适用；消费失败不放行 | gate 单测/集成 + 审计 + D2 | B1 40/40（`customer-directive-gate.test.ts`：deny 先于 c=allow、preblock/write-guard、c=deny/script、既有 takeGrant 先、once、readonly 不注入、审计 `by=directive:<id>`+`directive` 字段）；D1 集成 6/6；**D2 未执行 shell 精确命令放行/重复回正常链；未提供 shell 审计 JSONL 样例** | 编排、测试 | gate 行为与审计断言全过；D2/审计样例缺 | **insufficient evidence** |
| AC-9 | deny 先于 c=allow；c=allow 只在 allow 侧先行；不能翻案硬地板；不误伤 | gate 配置矩阵 | B1 40/40（deny 先于 c=allow、preblock/write-guard 终结、c=deny/script 不消费 allow、既有 grant 先、readonly 构造期抛错、deny 不误伤、operatorOnly/advisory 顺序）；D1 集成 6/6 | 编排、测试 | 顺序矩阵逐项通过 | **pass** |
| AC-10 | 推荐/选项/拒绝；0/多匹配回落；冲突/不匹配绕过默认推荐；Q7 独立性；Q9 A 四处如实 | 消费者测试 + 四处断言 + D2 | C1 22/22（decision 消费者：推荐/label/拒绝/冲突/不匹配/可见行失败/坏账本）；B1 40/40（`applyDecisionDirective` 规则/冲突/no-match/`emitResult` 先于 consume）；Q9 测试：`run-change.test.ts`、`version-decision.test.ts`、`task-state.test.ts`、`run-manifest.test.ts` 四处断言 `directive`+`directiveId`；D2 S3/S4/S4b 真实运行：代选 alpha、冲突/不匹配系统行、人工选择；`requirement-change.ts:319-321` 三值文案 | 桌面窗口、编排、运行时核心、项目管理、测试 | 规则/冲突/归属四处全过；D2 代选/回落真实运行 | **pass** |
| AC-11 | session 重启失效；once 按 Q3 A；forever 持续；面板分组正确；不依赖时钟 | 状态机/回放 + 面板截图 + D2 | B1 40/40（`sessionId` 重启 `app-restart`、未用 once `unused-once`、forever、无时间戳）；D1 集成第 4 用例 6/6；C2 面板分组 28/28；D2 S5 面板 active/history 截图；**D2 未真实重启** | 编排、桌面窗口、桌面UI、测试 | 状态机/集成/分组通过；D2 重启缺 | **insufficient evidence** |
| AC-12 | 仅同 target active 可撤销；终态拒绝；立即生效；回执正确；保留历史 | 集成 + 账本审计 + D2 | B1 40/40（同 target/active、跨 target/终态错误、append-only）；C1 22/22（输入式撤销）；C2 28/28（面板撤销带 roleId/runtime）；D2-fix S5 `S5_PANEL_REVOKE_RECEIPT=true`（`已撤销审批指令 #d-1`）、`S5_REVOKED_ROW_STATE=true`、`S5_LEDGER_REVOKED=true`；S4B 输入式撤销回执 | 编排、桌面窗口、桌面UI、测试 | 面板/输入撤销回执与状态均成立 | **pass** |
| AC-13 | §4.3 谓词真值表；未勾选拒绝；渲染不可绕过；reasons/acknowledged；Q7 A 子句 | 真值表 + 复核 + 截图 + D2 | A1 27/27（forever、项目级 reject/select、通配域名、宽路径、宽命令、Q7 A 开关关闭项目级 select-recommended、非高危示例、多原因顺序）；C1 22/22（主进程复核、未勾选拒绝）；C2 28/28（高危只读显示/勾选）；D2 S2/S3：未勾选禁用、勾选落账、`highRisk.reasons/acknowledged` 真实记录 | 运行时核心、桌面窗口、桌面UI、测试 | 真值表/主进程复核/真实运行均成立；Q7 A 已确认 | **pass** |
| AC-14 | 指令类型无写权目标；越界写仍拒；不能自动通过 proposal/appointment/acceptance；appointment-write 不自动确认 | 结构检查 + gate/decision 测试 | `src/model/directive.ts`：`ApprovalResource` 仅 shell/domain/path、`DecisionAction` 仅选择/拒绝（E2 只读核对）；B1 40/40（gate 只读 approval、不新增工具）；C1 22/22（decision 只处理 `cardKind==="decision"`）；无新增模型工具 | 运行时核心、编排、桌面窗口、测试 | 类型无写权目标；治理卡未自动通过 | **pass** |
| AC-15 | 无指令路径不变；旧输入/账本/记录可读；Q9 A 旧读者逐点核对 | 受影响测试 + T3 全量 + 四处断言 | T3 全量 **403 文件 / 3624 tests / 3597 pass / 9 fail / 18 skip / 0 todo**；9 fail 与 18 skip 与 B0 逐条相同；新增确定性失败 **0**、新增 skip **0**；`git diff --numstat` 显示修改测试仅新增/计数更新（i18n 8 处删除为计数 97→98/1642→1746），无断言弱化；Q9 读者 `session.ts` 四处、`interface.ts:1451-1455`、`requirement-change.ts:319-321`、`task-state.ts`/`version-decision.ts`/`run-manifest.ts` 均三值；旧二值记录测试可读 | 桌面窗口、编排、各实施角色、测试 | 全量回归与旧读者核对通过 | **pass** |
| AC-16 | 坏账本/坏行：消费者按无指令；主路径不受阻；面板如实报错；不伪造回执 | 故障注入 + D2 | B1 40/40（坏行/`version>1`/不可读 ⇒ 空快照+`ledgerErrors`；`list` 不伪造空）；C1 22/22（`directive-decision.test.ts` 坏账本按无指令）；D1 集成第 5 用例 6/6；**D2 未真实运行坏账本** | 编排、桌面窗口、测试 | 故障注入/集成通过；D2 坏账本缺 | **insufficient evidence** |
| AC-17 | zh-CN/en-US 成对；无硬编码用户可见字符串；回执/面板/高危/错误可切换 | i18n 测试 + 键检查 + 截图 | A3 i18n 11/11（1746 key、parity true、en-US 零 Han、104 指令 key、四条回执模板）；guard 6/6（`scanned=136 allowlisted=21 violations=0`）；C2 28/28（新源码零 Han、只消费 A3 key）；D2 面板/回执截图；allowlist 仅 `app/desktop/directive-input.ts` 的输入协议 token「撤销」（W-5 A 授权、分类注释） | 项目管理、桌面UI、测试 | 中英成对/计数/零泄漏；allowlist 为已授权非 UI 协议 token | **pass** |
| AC-18 | 候选哈希/版本、改动路径、测试命令/结果、截图（DEBUG 关、sha256/窗口尺寸、不录屏）、全量回归、状态如实 | E1 + 全量 + 截图元数据 | E1 117/`e3b3ca70…`；候选 54/54；T3 403/3624/3597/9/18；双端 typecheck 0、build 0；D2 探针 64/64（16 张 1360×860 截图，`11b` 清单 **726f8b82…**）；E2E `E2E_PASS=true`（30 张 1360×860，`12b` 清单 **88452647…**）；DEBUG/ANS_DEBUG/ELECTRON_ENABLE_LOGGING 均 unset；未录屏；各角色 `implemented-unverified` | 统筹、测试、桌面窗口、桌面UI、独立验收 | 证据包完整、元数据齐全、状态如实 | **pass** |
| AC-19 | 实施基线不含对方未提交改动；若先合入则 rebase/重跑；如实披露 | 分支/合并记录 + 重跑 | 沟通记录 §基线更新：`origin/main=4c3a6e4`、分支 `--ff-only` 从 `243d8f6` 到 `4c3a6e4`（50 files/+8518/−13）；B0 在 rebase 后重记（HEAD `4c3a6e4`，T3 393/3479/3452/9/18）；E1 §一披露；旧 Model/桌面证据未复用 | 统筹、运行时核心、桌面窗口、测试 | rebase 与重跑记录完整 | **pass** |
| AC-20 | 无 `@边界` 解析；无英文别名/全角（除非 O5）；无联网/目录新闸（除非 Q5 B+O1/O2）；无模型解释（除非 O3）；无 CLI；无指令进模型上下文 | 结构/文本检查 + 范围清单 | E2 grep：`src`/`app` 无 `ANS_CUSTOMER_DIRECTIVES_DISABLED`、无 `@approval`/`@decision`/`＠` 实际解析（仅注释）、无 `@边界` 解析；`ID_PATTERN="^d-[1-9][0-9]*$"`（O11 未实施）；`consumerOf` 对 domain/path 返回 `"none"`；`GovernanceJudgeFacts`/`governance-judge-prompt.ts`/`shell-judge-prompt.ts` 无 directive 字段；`src/interface/cli`、`src/common/门禁引擎`、`src/service/gate`、`test/桌面应用/e2e/main.mjs` 零 diff；`RequestPresentedEvent.to` 仍 `"customer"|"judge"`（W-6） | 统筹、独立验收、各角色 | 非目标逐项满足 | **pass** |
| AC-21 | 闸门 1 记录中 Q5/Q9 各有客户明确选择；无「确认方案即默认 A」推断 | 闸门 1 材料 + 客户原话 | 沟通记录「闸门 1 确认记录」：客户选择卡作答「确认 P1.1」「Q5=A：仅 shell」「Q9=A：扩展 directive」；P1.2 记录声明不重开闸门 1 | 沟通、独立验收 | Q5/Q9 均单独确认 | **pass** |
| AC-22 | 指令面板不占 `shellCardSlot`、不进一项目一卡队列；shell 卡待答仍可输入；角色卡仍推达；项目切换取消未决；session 按项目分开 | 集成/UI + 截图 + D2 | C1 22/22（独立 pending、不占卡槽/队列、项目切换取消、session 按项目账本、target fail-closed）；C2 28/28（三卡入口、overlay 让位、默认焦点拒绝、待答徽标、不调用 shell 应答）；D2 S7 `S7_SHELL_CARD_STILL_PENDING_WITH_DIALOG=true`、`S7_SHELL_NOT_RESPONDED=true`、回执 #d-9；S6 项目切换 `S6_DIALOG_CLOSED_ON_SWITCH=true`、零账本 | 桌面窗口、桌面UI、测试 | 共存/切换真实运行与测试均通过 | **pass** |
| AC-23 | 回滚开关（若 O9 被选） | 无（O9 未选） | 闸门 1「O1–O11 均不实施」+ 团队计划 §7.1；E2 grep 无 `ANS_CUSTOMER_DIRECTIVES_DISABLED`；`directivesEnabled` 基础位恒 true（无 env false 分支） | 独立验收（依据记录） | O9 未选；基础能力位由 AC-1/AC-2/AC-22 覆盖 | **not applicable（O9 未选）** |
| AC-24 | 若 O11 未选，账本重置/ID 重号风险在方案/面板/审计披露；面板以 `(id, createdAt)` 展示；若 O11 被选则随机后缀 | 单测 + 面板/审计快照 | 方案 P1.1 §5.5/§9.5 披露；`ui.directive.panel.itemMeta="{id} · 创建于 {createdAt}"`（zh-CN:2114）、`directive-store.ts:240-244`、`directive-panel.tsx:99-101`；D2 S5 面板截图与账本（id+createdAt；d-1…d-9）；O11 未选（ID 模式 `^d-[1-9][0-9]*$`） | 编排、桌面窗口、测试、独立验收 | 披露/展示成立；O11 子句 N/A | **pass（O11 子句 not applicable）** |

**逐项汇总**：pass **16**（AC-4/5/7/9/10/12/13/14/15/17/18/19/20/21/22/24）；insufficient evidence **7**（AC-1/2/3/6/8/11/16）；fail **0**；not applicable **1**（AC-23 整体；AC-24 仅 O11 子句）。

### 3.1 insufficient evidence 的具体缺口（不判 fail 的理由）

以下 AC 的行为本身均有单测/集成证据，未发现与标准相反的证据，故不判 `fail`；但 V1「所需证据（最低）」要求的原始真实运行/样例未提供，不能判 `pass`：

- **AC-1**：缺 D2 真实运行的（a）近失配普通投递、（b）空正文面板且确认禁用、（c）带图标记拒绝；D2 仅 S1/S2/S3 覆盖命中面板/高危/决策。解析器 27/27 与 C1/C2 测试已覆盖规则。
- **AC-2**：缺 D2 未命中普通消息的真实投递记录（S1 只覆盖命中无气泡）；C1 测试已证明命中 0 次 `send`/0 events、未命中 `sendCalls=["普通客户消息"]`。
- **AC-3**：缺 D2 空正文与未识别片段的真实运行截图（S1/S2/S3 只覆盖常规字段/高危/决策）；C2 28/28 已覆盖字段/确认禁用/未识别。
- **AC-6**：缺 V1 要求的账本原始样例文件（created/consumed/revoked/expired 全类 + 坏行/轮转）；D2 账本 9 行仅含 created/revoked；B1 40/40 覆盖行为但未保留样例。
- **AC-8**：D2 未执行「精确命令放行一次/重复回正常链」（探针不驱动 shell）；未提供带 `directive:{id,scope}`/`by:"directive:<id>"` 的 shell 审计 JSONL 样例；gate 40/40 覆盖顺序/once/session/script/c=allow/消费失败/审计断言。
- **AC-11**：D2 未真实重启（D1 集成第 4 用例覆盖 `app-restart`/`unused-once`；面板分组由 C2 测试/S5 截图覆盖）。
- **AC-16**：D2 未真实运行坏账本（D1 集成第 5 用例与 C1 `directive-decision.test.ts` 覆盖 `ledgerErrors>0`、主路径回落、不伪造回执）。

---

## 四、K1–K8 重点核对项（协调者列示的披露/流程项；不是新增产品标准）

> 本任务 V1/方案 P1.1/P1.2/团队计划/E1 **未定义** K1–K8（该命名属上一任务 `contract-schema-query` 的重点核对项）。本节按协调者列示的披露/流程项编号核对，**不新增 AC、不改判定口径**。

| # | 核对项 | 证据 | 判断 |
| --- | --- | --- | --- |
| K1 | W-1 闸门 2 写集增补（C2 `ConfirmCard.tsx`/`shell.css`） | 团队计划 §十三（W-1 A）；`app/renderer/src/shell/ConfirmCard.tsx`、`shell.css` 在 54 候选；C2 28/28；D2 S7 卡内入口/共存 | **pass** |
| K2 | i18n allowlist 增补（W-5 A） | 团队计划 §十四；`test/项目管理/shared/i18n-guard-allowlist.ts` +2 行（分类注释）；guard 6/6（`scanned=136 allowlisted=21 violations=0`）；A3/allowlist 记录 `a92aa7da…` | **pass** |
| K3 | PID 35700 与残留进程 | D2 `02-residual-processes.txt`（PID 35700 已终止）、`02b-d2-residual-processes.txt`；E2 `tasklist` 仅见 network-monitor 的 34404/11492/41000，与本 worktree 无关 | **pass** |
| K4 | A1 `api-spec.md` EOF 空行 | `git diff --check` 报告 `角色卡/运行时核心/api-spec.md:160 new blank line at EOF`；E1 §四.4 已披露；非产品候选 | **pass（附编辑性建议；非阻断）** |
| K5 | D2 未覆盖场景与证据边界 | D2 §六 逐项披露（重启/坏账本/shell 执行/带图/`@边界`/空正文/近失配/多引擎）；E1 §四.7 披露；本报告据此判 AC-1/2/3/8/11/16 `insufficient evidence` | **pass（披露完整；后果见 §三）** |
| K6 | 客户提交/合并预授权未执行 | 沟通记录 §提交/合并预授权（E2 通过 + E3 放行后执行）；HEAD 仍 `4c3a6e4`、无 commit/push、staged 空 | **pass** |
| K7 | O1–O11 不实施；`request.presented.to` 不扩展 | 见 AC-20/AC-23：无 env 回滚、无随机后缀、无联网/目录新闸、无模型解释、无 CLI、无指令进提示词；`RequestPresentedEvent.to` 仍 `"customer"\|"judge"`；D2/集成断言不伪造 presented | **pass** |
| K8 | P1.1+P1.2 等价映射与 V1 §1.2.1 | P1.1 1199/`7875ad6a…`；P1.2 1209/`1748ad2d…`；24 AC 与 V1 引文仅 AC-13 增加「（Q7 A 时）」及 Q7 B 不适用说明（脚本比对）；V1 §1.2.1 记录 E2 基线为 P1.1 确认版 + P1.2 等价映射 | **pass** |

---

## 五、关键证据核验（E2 独立读取/复算）

### 5.1 T3 全量回归（复用 D2-fix，当前候选）

- 命令：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' | sort)`；文件清单 **403**，清单哈希 `ccabf2f3d0638068298acfb2025e6aad111e33830772eb5c59c87ca65b44a04c`（E2 独立重算一致）。
- 结果：**tests 3624 / pass 3597 / fail 9 / cancelled 0 / skipped 18 / todo 0**，exit 1（因 9 项既有环境失败）；日志 `14-full-t3-fix.log` **4733 行 / `10ac5e52868e536181503a0519ad42114fb0ccd1bcb7c17175dbbb7b5b1ac585`**；分类 `15-failure-classification-fix.txt` **64 行 / `4a6d1e4e465568103cbccb845c98000736e0d08b7f207cd2b20a2b60e69f3a60`**。
- 失败分类：9 项全部既有 Windows symlink `EPERM`（`claude-adapter:639`、`codex-adapter:351`、`pi-adapter injected-runtime:185/193`、`runtime-core file-write-safety:97`、`session-store:46/58`、`g4-skill-verify b-render:182`、`编排 shell-authorized-routine:184`），与 B0 逐条同名同因；**新增确定性失败 0、新增 skip 0**；`write-sequencing.test.ts` 排除且未运行、行为未验证。
- 与 B0（393 / 3479 / 3452 / 9 / 18）对照：+10 文件 / +145 tests / +145 pass / fail 与 skip 条目相同。

### 5.2 受影响套件与静态/构建门（D2-fix 当前候选）

| 组 | 结果 | 日志 |
| --- | --- | --- |
| 桌面UI | 402 / 402，0 fail / 0 skip | `13a-suite-desktop-ui.log`（416 / `7fdb47c2…`） |
| 桌面应用 | 522 / 522，0 fail / 0 skip | `13b-suite-desktop-app.log`（549 / `515413c6…`） |
| 编排 | 737 / 736 / 1（既有 EPERM）/ 0 skip | `13c-suite-orchestration.log`（1319 / `3fc6e517…`） |
| 运行时核心 | 309 / 302 / 3（既有 EPERM）/ 4 skip | `13d-suite-runtime-core.log`（374 / `a18e5988…`） |
| 项目管理 shared | 175 / 170 / 0 / 5 skip | `13e-suite-project-shared.log`（192 / `ab515e15…`） |
| i18n guard | 6 / 6（`scanned=136 allowlisted=21 violations=0`） | `13f-suite-i18n-guard.log`（21 / `00c1c367…`） |
| D1 跨层集成 | 6 / 6 | `13g-suite-d1-integration.log`（20 / `312f6024…`） |
| 合计 | **2151 / 2138 / 4 / 9 / 0** | 4 项均既有 EPERM；新增失败 0、新增 skip 0 |
| `npm run typecheck` | exit 0 | `16a-typecheck-fix.log`（10 / `384d42c6…`） |
| `npm run typecheck:renderer` | exit 0 | `16b-typecheck-renderer-fix.log`（10 / `97006a34…`） |
| `npm run build:renderer` | exit 0，2799 modules | `10-build-renderer-fix.log`（28 / `d20e311a…`）；dist 忽略、非候选 |

E2 独立复跑双端 typecheck 0/0、关键定向套件 27/27 + 40/40 + 22/22 + 28/28 + 6/6 + 33/33，与上述一致。

### 5.3 D2 真实运行（当前候选）

- **D2 探针**：`test/测试/customer-authorization-plane-d2-probe.mjs` **954 行 / `a7913e87dfb08e7662b231ebb63af8c35e7d1b396c9e9664bbd45bf267a41427`**（未修改）；`probe-run-3` 全新 userData/夹具；**64/64 checks true、failures=0、exit 0、12 秒、16 张 1360×860 PNG、0 console error / 0 CSP**；report `876 / c1468699…`；账本 `9 行 / 9e582f1f…`；日志 `11-d2-probe-fix.log` `98 / 5bb6479c…`。
- **关键真实运行细节**：S1 回执「已记录审批指令 #d-1」、无用户气泡；S2 高危未勾选禁用、勾选后 #d-2 + `highRisk.reasons=["forever"]`；S3 项目级「选推荐项」在「替我决策」关闭时为高危、勾选后 #d-3 代选 `alpha`，结果行「客户指令 #d-3 已代选推荐项 方案 A（客户指令，不是客户本人点击）」；S4 冲突系统行 `决策指令冲突（d-3、d-4）：未代选…`；S4b 不匹配系统行 `决策指令 #d-7 未匹配到唯一选项：未代选…`；S5 面板撤销 **`S5_PANEL_REVOKE_RECEIPT=true`**（「已撤销审批指令 #d-1」）+ 账本 `directive.revoked d-1 seq=8`；S6 项目切换取消 `已取消；未记录。`、零账本；S7 shell 卡待答时卡内入口打开对话框、确认 #d-9、shell 卡仍待答、未调用 shell 应答。
- **E2E**：当前候选复跑 `E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`、exit 0、86 秒、30 张 1360×860 PNG；report `512 / f0807a8e…`；日志 `199 / d55df407…`。E2 独立核验 **16/16 探针截图与 30/30 E2E 截图 SHA-256/尺寸全部匹配**。
- **截图规则**：DEBUG/ANS_DEBUG/ELECTRON_ENABLE_LOGGING 均 unset（`00b-probe-environment.txt`）；窗口 1360×860；候选 HEAD/PRELOAD 哈希记录；**未录屏**；缺录屏不构成 fail/insufficient。
- **D2 未覆盖**：重启、坏账本、shell 精确命令执行/审计样例、带图/`@边界`/空正文/近失配、多引擎逐一真实运行；D2 §六/E1 §四.7 已如实披露（本报告据此判 AC-1/2/3/8/11/16 insufficient）。

### 5.4 账本、审计与 Q9

- 账本样例：`probe-run-3/project/.ans/state/customer-directives.jsonl` 9 行（created d-1/d-2/d-3/d-4/d-7/d-9；revoked d-3/d-4/d-1；`d-2` highRisk forever、`d-3` highRisk switch-off-project-recommended）；`d-<seq>`、target、sessionId、createdAt、createdBy/source 均按 v1；**无 consumed/expired 样例**（见 AC-6 缺口）。
- Q9 四处：`request.resolved.by`（`session.ts:4226` + `directiveId`）、`version.decision.decidedBy`（`:4692` + `directiveId`）、run manifest `decidedBy`（`run-manifest.ts`/`run-change.test.ts`）、UI 文案（`ui.versionDecision.decidedBy.directive`，`requirement-change.ts:319-321`、`session.ts:4500`）；测试 `run-change.test.ts`/`version-decision.test.ts`/`task-state.test.ts`/`run-manifest.test.ts` 断言 `directive`/`directiveId`，旧二值记录仍可读；`request.presented.to` 不扩（W-6）。
- shell 审计：`ShellAuditRecord.directive?: {id,scope}`（`shell-audit.ts:120`）；gate 测试断言 `by="directive:<id>"` + `directive` 字段与 judge/customerGrant 互斥；**未提供原始 JSONL 样例**（见 AC-8 缺口）。

### 5.5 非目标、边界与纪律

- O1–O11：E2 grep/只读核对未发现实施（无 `ANS_CUSTOMER_DIRECTIVES_DISABLED`、无 `@approval`/`@decision`/`＠`/`@边界` 解析、ID 仅 `d-<seq>`、domain/path `consumer:"none"`、无模型解释/CLI/提示词注入、无 `until=<时长>`、无角色级审批、无面板搜索/导出、无 `@边界` 迁移引导）。
- 边界：B-1..B-4 共 7 条，三份 boundary.md/yaml 一致；`test/桌面应用/` 无第三个新文件；`test/桌面应用/e2e/main.mjs` 未改；角色 id/显示名/能力描述未变。
- 纪律：未 commit/push/merge/release；HEAD 仍 `4c3a6e4`；staged 空；package/lock/构建配置/CLI/门禁引擎零 diff；管理记录（`docs/acceptance`、`docs/scheduling`、沟通/方案/复核）不混入产品候选。

---

## 六、发现、总体结论与补证清单

### 6.1 总体结论

- **fail：0**；**insufficient evidence：7（AC-1、AC-2、AC-3、AC-6、AC-8、AC-11、AC-16）**；**pass：16（AC-4、AC-5、AC-7、AC-9、AC-10、AC-12、AC-13、AC-14、AC-15、AC-17、AC-18、AC-19、AC-20、AC-21、AC-22、AC-24）**；**not applicable：1（AC-23；AC-24 仅 O11 子句）**。
- 按 V1「无 fail 但有 insufficient → 证据不足，不得判通过」：**总体结论为证据不足**，不是返工、不是通过。

### 6.2 补证清单（交统筹/沟通安排；不判返工）

1. **D2 真实运行补证**（测试角色执行、桌面窗口/桌面UI 配合；同一候选、全新 userData、截图规则不变、不录屏）：
   - 近失配/未命中普通消息真实投递（AC-1/AC-2）；
   - 空正文面板且确认禁用（AC-1/AC-3）；
   - 带图标记输入明确拒绝、不投递/不落账（AC-1）；
   - 未识别片段面板（AC-3）；
   - shell 精确命令放行一次/第二次回正常链 + shell 审计样例（AC-8）；
   - 应用重启后 `session` 失效（AC-11）；
   - 坏账本不阻断主路径（AC-16）。
2. **B1/编排原始样例补证**（证据文件，不改产品）：
   - 账本样例文件：created/consumed/revoked/expired 全类 + 坏行/轮转（路径 + SHA-256）（AC-6）；
   - shell 审计 JSONL 样例：`directive:{id,scope}`、`by:"directive:<id>"`，与 judge/customerGrant 可区分（AC-8）。
3. 补证后由同一独立验收主上下文（E2）按 V1 复判受影响 AC；若候选未变，T3/typecheck/既有测试证据可复用；若改产品/测试，按 V1 §4.7 重取失效证据。补证不改变 V1 标准，也不改变本报告对 pass 项的结论。

### 6.3 非阻断披露

- **D2 首跑 63/64 → C2 窄修 → D2-fix 64/64**：D2 原记录保留原始失败事实（S5 面板撤销无回执），C2-fix 只改 4 个 C2 文件（store/panel/Composer/test），C1 未改；原“无上下文”用例保留并改名，新增“带上下文”用例，无断言弱化；D2-fix 探针未修改（`a7913e87…`）、全新 `probe-run-3`，S5 回执恢复。该链路成立。
- **面板撤销回执的残余边界**：回执依赖当前选中角色的 `roleId/runtime`；无选中角色时不产回执（C2-fix §6.7 披露）。本报告不据此判 fail/insufficient；如产品要求无选中角色也回执，需 C1/产品另行定义。
- **A1 `api-spec.md:160` EOF 空行**：`git diff --check` 提示；非产品候选；E1 已披露；建议编辑性修正（非阻断）。
- **沟通记录 E1 快照**：E1 引用 199 行 / `31d3064a…`；当前 207 行 / `148485ea…`（追加 D2/E1 记录），纯管理记录，不混入候选。
- **多引擎**：D2 只选默认 `claude` 运行时；其余引擎以共享通道测试覆盖（团队计划 §10.2 第 9 项允许）；缺口已披露。
- **T3 全量单次运行**：D2-fix 在当前候选执行一次；E2 复用并独立复跑关键定向套件/双端 typecheck；未重跑 4 分钟级全量。
- **无 task_ops/无录屏/无 commit**：未伪造任务令牌、锁、审批或 `docs/verification/`；未录屏；未 commit/push/merge/release。

---

## 七、报告状态与边界

- 本报告是 `docs/acceptance/customer-authorization-plane-report-v1.md`，v1，日期 **2026-11-03**；E2 由与 V1 相同的唯一独立验收主上下文判定；未启动只读取证子上下文。
- 结论仅对**当前候选**（HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0` + 54 文件逐文件哈希）有效；候选、方案、V1、团队计划或相关契约变化时，按 V1 §1.2/§4.7 重判受影响部分。
- **本结论不是客户批准、不是发布授权**：不授权提交、推送、合并、发布、打 tag；客户提交/合并预授权由统筹在 E2 通过 + E3 放行后执行，本报告当前结论为证据不足，不满足该前提。

---

**报告状态：E2 独立验收 v1；总体证据不足（0 fail / 7 insufficient / 16 pass / 1 N/A）；未 commit/push；不授权提交、推送、合并、发布。**
