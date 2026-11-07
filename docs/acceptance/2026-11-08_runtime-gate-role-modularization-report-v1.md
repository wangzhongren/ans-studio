# 运行时派发门与角色模块化：B2 独立验收报告 v1

- 日期：2026-11-08；固定身份：ANS 独立验收唯一主上下文（本报告只做 B2 判定，不实施、不派发、不运行真实模型、不授权提交/推送/合并/发布）。
- 判定依据：B1 v1 `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md`（273 行 / 38456 bytes / `a999dc1961c9ebe4727f0796d6baefd24a23e75b1a6cc1d215a9c0e2f63b4999`）+ B1 v1.1 `…criteria-v1.1.md`（137 行 / 17749 bytes / `e5027742d4ae36b5f71a090d7ceb956ae3046f06da6d9f4252cf60153776e867`，仅取代 E3.1 基线分类/挂起口径）。
- 方案/契约/计划：P1.6 `24150207…`；E0.3 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`（685 行 / 54561 bytes；E0.2 已判可判性 `798ce9ce…` 的文本修正版）；复核 `59b2c81c…`；团队计划 `00e1f76b…`；闸门留痕 `b788072e…`。
- 候选：实施检出 `.claude/worktrees/trunk-amendment`；HEAD `e71501cae7fc563b63c63944d45d0d3114ec18a5`；分支 `feat/plan-escalation-card`；**97 文件（45 src + 52 test；20 M + 77 ??）**；候选聚合 `7bbff9bd1fa12090590d1bc3a42b70effaa86b42b08ff124ed5ff17924d12a95`；候选树 `a93fbcd80a3c9a7eff2fc54b02a1eef1807fdb6d`（7,737 条目）；`src app test` manifest `5cbdbb9483cbc64d56de7e7649e0466cf956298ff354993b0d6e6d21cb2765fb`（1,066 文件）。T1 三文件为只读基线（不属本候选）。
- 风险档位：**T3**（不压档）。

## 0. 总体结论

**总体结论：pass（通过），但附明确限制。** 本结论只对上述冻结候选、B1 v1/v1.1 与 E0.3/P1.6 字节版本有效；**不替代** I6 B1（H01–H11）、旧 A/J 或 T1 验收结论；不授权提交/推送/合并/发布；不宣称 T3 单次全绿或六角色完整真实闭环。

- **逐项统计（核心 B1 条目）**：E0.1–E0.9 **9/9 pass**；P1–P7 **7/7 pass**；N1–N28 **28/28 pass**（矩阵）；RR1–RR3 **3/3 pass**（RR2 的真实 Pi 子项 N/A）；E1.1–E1.7 **7/7 pass**；E2.1–E2.8 **7 pass + E2.7 N/A**；E3.1–E3.12 **12/12 pass**；E-A1–E-A10 **10/10 pass**；D1–D9 **9/9 pass**（3 项历史「待确认」按 B1 允许保留）；M1–M8 **8/8 pass**；R1–R7 **7/7 pass**。
- **非 pass 项**：仅 **N/A** 3 项——E2.7（X-S 共享抽取，E0 冻结记录 §二/§三决定默认不迁移）、RR2 的真实 Pi 运行（Q11/团队计划 §8.3 默认不跑；Pi 确定性集成/桩件 pass）、E3.11 的真实 Codex 模型运行（按计划以确定性集成/桩件 + 既有真实证据回归，不跑真实模型）。无 fail、无 insufficient evidence。
- **需返工项**：无阻断性返工。但存在 **非阻塞形式/后续项**（见 §4）：候选聚合算法文字需订正（path sort vs full-line sort）；`TRIO_CARD_KINDS.product` 空回退残留待 product-code fixture 收口；部分 E2 单元原始 oracle 日志未归档（形式缺口）；T3 非确定性（Node 原生崩溃/清理抖动/post-test 泄漏）需继续监测或另立变更；桌面 hub 目标数据化/version-decision preflight 等后续接口评审项。
- **非确定性裁定**：E3.1 按 B1 v1.1 判 pass——新增确定性失败 **0**、新 skip **0**、6 个登记挂起按登记、32 skip 不变、198 fail/1 cancelled 计数不变；但**失败名称集合并非逐条完全不变**（194/199 一致 + 4 条新增非确定性 + 5 条既有消失非确定性，逐条说明见 T3 §3.4/§3.5）。本 pass **不表示** T3 单次运行全绿；若客户要求“失败名称集合逐条完全不变/单次全绿”，则本项应按 insufficient evidence 另判。

## 1. 候选身份独立复核

### 1.1 独立重算结果

| 项 | 声称/冻结值 | 我的独立复算 | 结果 |
| --- | --- | --- | --- |
| HEAD / 分支 | `e71501c` / `feat/plan-escalation-card` | 一致 | 一致 |
| scope | 100 项 = 候选 97 + T1 3 | `git status --porcelain -uall -- src app test` = 100 项 | 一致 |
| 候选文件数 | 97（45 src + 52 test） | 97（45/52） | 一致 |
| 逐文件 raw SHA-256 | `08-candidate-hashes.tsv`（97 行 / `46889bf4…`） | 逐文件重算 **97/97 全一致，0 缺、0 异** | 一致 |
| 候选聚合 | `7bbff9bd…` | 见 §1.2：以证据实际行序（整行/哈希前缀排序）复算 = `7bbff9bd…` | 一致（附算法文字订正） |
| 候选树 | `a93fbcd8…`（7,737 条目） | 临时 `GIT_INDEX_FILE`：read-tree HEAD + 97 路径 add + write-tree = `a93fbcd80a3c9a7eff2fc54b02a1eef1807fdb6d`，`ls-tree -r` 7,737 条 | 一致 |
| 全量 manifest | `5cbdbb94…`（1,066 文件） | 遍历 `src app test`（排除 `app/renderer/dist/**`、`node_modules/**`）= 1,066 文件，逐文件 sha256 与证据清单 **逐行一致**，manifest hash `5cbdbb94…` | 一致 |
| T1 只读三文件 | `afe70c62…` / `358ac967…` / `f0db260e…` | 当前工作树与 B0/T3 记录一致；不属候选 | 一致 |
| 冻结后稳定性 | 冻结 23:50:27；T3 收工/扫描复核 manifest 不变 | 我的复核运行（gates/contract/typecheck）后再次重算：97/97 逐文件一致、manifest `5cbdbb94…`、scope 100 | 一致 |
| E3 两处扫描修复 | rapporteur 未使用类型 `7842311f…`；门禁 `roleToolNameOf` `ca3b370a…` | 两文件当前 hash 精确一致；`roleToolNameOf`/`RapporteurLegacyCardPath` 全仓 0 命中；角色工具注册 14 项与 `RoleToolId`/`RoleToolName` 一致（扫描 §3.5） | 一致 |

### 1.2 候选聚合算法文字订正（形式问题，不影响候选绑定）

- 变更包 §一与 T3 记录 §2.3 称聚合算法为“按仓库相对路径 `LC_ALL=C` 排序，逐行 `<sha256>  <path>\n` 连接后 SHA-256”。
- 我按 path 排序复算得 `aa09499a…`，**不等于** `7bbff9bd…`；检查证据 `09-candidate-aggregate-lines.txt` 发现其实际行序为**整行（哈希前缀）排序**（首行 `01bb…  test/roles/rapporteur/preflight.test.ts`，末行 `fdf7…  src/provider/runtime/tools.ts`）。按整行 `LC_ALL=C` 排序后连接，SHA-256 精确 = `7bbff9bd…`，与证据文件自身 hash 一致。
- **判定**：候选聚合值可由证据实际行序复现；但变更包/T3 记录的“path 排序”文字错误。该错误属**形式披露缺口**，不影响候选绑定（逐文件 hash、树、manifest 均独立复现且一致）；要求统筹在变更包/T3 记录中订正算法文字（或明确“整行排序”）后再用于后续引用。B2 以证据实际行序与逐文件/tree/manifest 绑定为准。

## 2. 关键证据抽查

### 2.1 T3 全量回归（`76872622…`，326 行 + 约 11MB 证据）

- 权威运行 C：510 文件 = 503 natural-exit + 6 B0 登记挂起（90s 隔离 watchdog，不计通过）+ 1 非登记 watchdog（`interactive-execution-mode`，5/5 ✔ 后不退出，隔离复跑 5/5 ×2 natural pass）。
- 计数（503 自然完成）：**4,872 tests / 4,641 pass / 198 fail / 1 cancelled / 32 skipped / 0 todo**；B0 子集 **4,471/4,240/198/1/32**；新增 39 文件 **401/401 pass、0 skip**。
- B0 逐条对照（`40c-comparison/summary.txt`）：`b0_failure_pairs=199`、`our_failure_pairs_trusted=198`、**194/199 完全一致**、`new_failures=4`、`missing_failures=5`、`new_skips=0`、`missing_skips=0`、`parse_not_ok_files=2`（均有解释）、`new_files_nonpass=0`、`anomalies=0`。
- 4 条新增失败：`e-pi` Node v24.22.1 原生 `CleanupQueue::Add` 断言崩溃（隔离 11/11 ×2 pass）；`chief-workflow` 的 W29/commit-race/selected（ENOTEMPTY/AggregateError 清理抖动，4 次完整运行 fail 数 15/14/11/14；W19 稳定失败为 B0 既有；W33 名称稳定但错误类在 AssertionError/ENOTEMPTY 间变化）。
- 5 条既有消失：`application-line`（B 断言、C+2 复跑 3/3）、`chief-workflow` W19 重复项之一、W30、`unmanaged`（清理抖动）、`git-shell-acl`（B0 file-level fail；隔离 3 次 36/36 pass）。均逐条披露，未当作本变更修复声明。
- 6 个登记挂起逐项复现（`write-sequencing`、`customer-authorization-plane-integration`、`directive-decision`、`optional-acceptance`、`session-rebuild-race`、`stuck-redispatch`），90s watchdog、exit 1，未改断言/加 skip/改超时；**全程未使用 `--test-force-exit`**。
- 运行方法偏差：尝试 A 停止未实际生效并与 B 重叠 16m28s；A/B 产物保留、不作权威计数；权威计数只取隔离 C。属如实披露。
- 静态门：`npm run typecheck` / `typecheck:renderer` / `build:renderer` 前/收工均 exit 0；收工 manifest 与冻结一致。
- 我的复跑抽查：`test/gates/*.test.ts` 29/29、`test/编排/trunk-dispatch-parent.test.ts` 19/19、`test/测试/runtime-dispatch-gate-integration.test.ts` 10/10、`test/gates/module-graph.test.ts` 5/5、`test/门禁引擎/role-module-contract.test.ts` 20/20、`npm run typecheck` exit 0；运行后候选 97/97 与 manifest 不变。

### 2.2 扫描与检查（`73175db7…`，312 行 + 44 文件）

- 冻结校验：候选 97 逐文件 hash、聚合、树、manifest、T1、HEAD/tree、分支、暂存均与冻结一致；T3 后无源码改动；F1 两修复（`7842311f…`/`ca3b370a…`）在候选内且符号不存在。
- 模块图：331 文件 / 1,760 边；依赖方向违例 **0**、value 环 **0**、type-only 环 **1**（`model/runtime.ts↔role.ts`，D9 Model 内豁免；非 Model 内部 0）；角色间 import 0、角色→引擎/门控/私有 common 0、门控→角色 0、共享→门/角色 0；六角色模块根与 gates 根唯一 public entry。
- 未使用导出：范围内 **0**（F1 已清零）；历史待确认 3（`rosterFileName`、`isSelfReport`、`BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE`；后者在 HEAD `e71501c` 已存在，属历史导出）。
- 重复实现：body hash 重复组 0、≥20 行窗口 0；同形文本 4 组为角色卡私有数据（已说明，非共享逻辑复制）。
- 结构：已删常量 app 残留 0、临时开关 0、D2 投影 0、完整 `builtInRoleModules` 六键、D5 单实现（`trunk-runtime.ts` import gates + 2 调用、本地定义 0、gates 定义 1）；`TRIO_CARD_KINDS` 仅剩 `product: []`（空回退/源码 oracle，`cardKindsOf` 优先模块；详见 §4）。
- 门禁负例矩阵：gates 29/29、trunk-dispatch-parent 19/19、集成 10/10、direct-role-capabilities 34/35（唯一失败为 B0 既有同名条目）、workflow-preconditions 29/29 = **122/121/1**；N1–N28 断言存在性核对；N24 适配器面由 T3 新增文件 401/401 覆盖；Git/验收专属负例引用 T3 运行 C（`git-shell-acl` 36/36、`application-line` 3/3）。
- D1–D9/E-A10：D2/D3/D5/D7/D8/D9/E-A10 扫描面/结构面通过；D1/D4/D6 以文档/接口评审/清单证据判定；详见 §3.5。

### 2.3 切换日志（`0ad6ca45…`，137 行）与删除清单

- 7 单元全部切换（X-G 门控 + X-R1…X-R6：product→rapporteur→nominator→convener→verifier→chief），旧实现删除、桥接/开关同批删除；逐单元记录 pre-switch 基线、金样/差分、回滚三态、受影响套件、删除清单、证据 hash。
- 差分：X-G 金样 134 场景/268 比较/0 差异；X-R1 至 X-R6 的公开回执/工具/卡种/派发/报告差异逐单元记录；已登记差异（X-R1 B 态 1 条 D-PRE-1、X-R4 更严项、X-R5/R6 带开关状态断言）已映射说明。
- 回滚：三态 A/B/C（部分单元 A/D）逐测试名一致；开关删除后 FINAL 复跑；长期回滚 = Git。
- 删除清单：P1 D-minimal 内联判定；六角色内联卡文本/规格与共享残段；`TRIO_CARD_KINDS` 六行中五行；D2 过渡投影；旧谓词；临时桥接/开关/探针；rapporteur 未使用类型；门禁 `roleToolNameOf`。`BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE`、`TRIO_CARD_KINDS.product` 列入「待确认」。
- 形式缺口（日志自述）：X-R3 编排双跑/三态原始日志未归档（开关已删不可重跑，仅证据正文摘要）；X-R4/R5/R6 门禁 oracle compare 因源码锚点删除不可复跑（以只读探针复验零差异）；X-G L2 逐例 ok/reasons 转储缺失（以 L1 金样 134/268/0 + 集成 10 例替代）；shim 与内联同单元删除（shim 从未进生产）；构建证据留 E3。

### 2.4 E0 冻结（`5439d7c3…`，91 行）与 E0.3

- E0.3 `067e3d2e…`（685 行 / 54561 bytes）为 E0.2 `798ce9ce…` 的纯文本修正（版本文字 E0.1→E0.3、Q3/Q13 编号、7/7→8/8）；语义等价，E0.2 可判性继续适用。
- G1–G6 全部关闭：D1 落地（`src/model/role.ts` 409 行 / `d5e550a0…`，`RoleToolId` 14 + `RoleToolName`；`role-tool-registry.ts` 14 项单一来源；契约测试原 E0 595 行 14/14，当前候选 843 行 20/20 pass——E2/E3 增量）；版本文字；Q3/Q13；shared-directories `4e43e615…`→`80ece2c5…`（当前技能文件 hash 已复算）；B1 v1.1；D9/D10/共享与工具排除/逐模块版本声明；E0.1 旧文字引用纪律。
- 评审参与方（运行时核心/编排/门禁引擎/三适配器/测试/独立验收）与结论齐备；D1–D10 落地状态记录（D2 过渡、D6–D8 迁移注记）；Pi P-1/P-2/P-3 落地。

### 2.5 E2 接口评审（`00bac588…`，56 行）与 P1 变更包（`5c6791af…`，66 行）

- E2 评审记录：派发来源模块权威（仅 chief/convener 生产消费；single/su 保留旧路径）；E2.2 比较口径（公开回执 + 受影响套件；已登记差异继续）；i18n 112 键零新增（96 内部诊断/16 复用 main.*）；dispatch 文案源保留 `evaluateDispatchAuthorization`；matrix 留门禁引擎；D-1/C-1/P5 三项修复前置已派发；context 接线另立；无客户新卡/无新增范围。
- P1 变更包：P1-A/B/C/D 证据（`6bf1a9d2…`/`b2cbef7e…`/`023a096e…`/`a1694be8…`/`73c3cbb1…`/`91e5cbe7…`）；P1-RR `c47198f7…`：父门受理、`task.created` `t-mw659tgv-974915bb`（from chief/to product），投递被下游 `runtime-creation-admission-unproven:required-scope-unconfined-script-tools,native-factory-plan-unavailable` 拒绝；预算 1 消息/1 chief 回合/应用处理器 1 次 dispatch/约 70s；4 张截图 hash 一致；偏差（模型侧首次字段错误被 MCP 校验拒绝、第二次才进入应用）如实披露。我的抽查确认 `summary.json` `00a49606…`、`drive.jsonl` `c3173bad…`、`tasks.jsonl` `8801a939…`、`chief.jsonl` `e3f8d231…`、`replay.jsonl` `2b74e881…`、`native-transcript.jsonl` `584d30ec…`。

## 3. 逐项判定

### 3.1 E0.1–E0.9（契约冻结出口）

| ID | 判定 | 依据 |
| --- | --- | --- |
| E0.1 | pass | E0.3 §3.1/§3.2/§4/§5/§6：8 模块边界/public API/消费者/owner；逐模块版本由冻结记录 G5 声明 E0.3 适用全部 8 模块。 |
| E0.2 | pass | E0.3 §3.1/§3.3/§3.4：`BuiltInRoleModule`/`RolePolicyDecision`/纯策略 10 条/preflight 事实包；D1 已落地（role.ts 409 行 / 14 id + RoleToolName；`role-tool-registry` 14 项；契约测试当前 20/20 pass）。 |
| E0.3 | pass | E0.3 §4.1/§4.2/§4.3：共享 owner/写集/11 组件 public entry/消费者；`handback.ts`/`workflow-preconditions.ts` 保持编排公开只读（冻结记录 §三列 public entry 与测试来源）；`provider/runtime/{schema,tools}.ts` 明确留运行时核心；共享组件目录已迁至 shared-code（`351b0b3b…`，旧 PM 副本已删）。 |
| E0.4 | pass | E0.3 §5.1–§5.4：门 API/四分支/证据接受/reason 18 闭集/只判定不采集；消费者仅派发+controller resume；写/发布消费门排除。 |
| E0.5 | pass | E0.3 §3.5/§5.3：对外 `trunk-verify-failed` 原文案；内部 reason；RolePolicyDecision；缺事实/未知 fail-closed。 |
| E0.6 | pass | E0.3 §2/§10.2 D9：Model←shared←{roles,gates}←engines；零跨角色 import；无环；扫描 331/1,760、违例 0、value 环 0、type-only Model 环 1 豁免；module-graph 5/5。 |
| E0.7 | pass | E0.3 §6：8 角色写集/测试/owner、新共享根经 H1 B-1–B-12/闸门 2；shared-directories `4e43e615…`→`80ece2c5…`；shared-components 迁至 `角色卡/shared-code/docs/architecture/shared-components.md`（`351b0b3b…`）；`test/项目管理/shared/` 路径保留、owner 移交；8 卡/边界/YAML/changelog 齐备。 |
| E0.8 | pass | E0.3 §7/§8：B0 `13553505…` + 22 fixture + 契约测试/差分层 + 冻结记录字段（路径/版本/哈希/评审/消费者/基线/变更流程）；E0.3 版本文字已修正；B1 v1.1 引用在冻结记录。 |
| E0.9 | pass | E0.3 §8/§12 + 冻结记录：E0 出口 = 评审通过 + B1 E0.1–E0.9 可判；E1 在冻结后启动；无 E1 早于冻结证据。 |

### 3.2 P1–P7、N1–N28、RR1–RR3

| ID | 判定 | 依据 |
| --- | --- | --- |
| P1 | pass | 真实 Claude 幕僚 `dispatch_task` 父门受理、`task.created`（from chief/to product）；工具回执因下游目标会话准入失败而 denied（见 RR1/§4.2），父门与 Service 后续业务拒绝可用 task.created/下游回执区分。 |
| P2 | pass | Pi 应用面事实/确定性集成在 P1-B 与 T3 新增文件 401/401；真实 Pi 默认不跑（RR2 N/A 子项）。 |
| P3 | pass | Codex 严格路径原条件保留：X-G 金样 134/268/0；P1-C 19/19；`inspectNativeToolSurface` 未改；`applicationMediation === undefined` 互斥 guard。 |
| P4 | pass | `status:"unknown"`、`nativeToolRegistry:"unknown"`、`applicationMediation.kind/status` 由 P1-A/B 与集成测试覆盖；无冒充 observed；T3 新文件全绿。 |
| P5 | pass | 单一 `evaluateChiefDispatchParent`：`trunk-runtime.ts` import gates + 2 调用、本地定义 0；validParent/currentChiefResumeSource 共用；两次复检集成。 |
| P6 | pass | Codex 受控 shell：严格路径仍 unknown；应用面事实存在/绑定经应用中介路径；N16 断言在 gates/trunk 测试通过。 |
| P7 | pass | Claude/Pi 外来 MCP 精确枚举；N26 正负例；Codex 配置外来 MCP fail-closed（N28/T3 Codex 构造期证据）。 |
| N1–N28 | pass | 扫描 §4.2：N1–N28 断言存在于 gates/trunk/集成套件，29/29+19/19+10/10 通过；N24 适配器面由 T3 新增 401/401；唯一 `direct-role-capabilities` 失败为 B0 冻结清单同名既有失败，非门禁负例。 |
| RR1 | pass（限缩） | P1-RR：真实回合/工具、父门受理、task.created；投递被下游门拒绝并如实记录（非本变更范围）；预算/偏差/截图/日志齐备。**不宣称投递或闭环完成**。 |
| RR2 | pass（真实 Pi N/A） | Pi 确定性集成/桩件必测（T3 新文件/套件）；真实 Pi 默认不跑（Q11/团队计划 §8.3），按 N/A。 |
| RR3 | pass | 预算/中止/失败原件保留；未美化/未伪造；与 T1 不混跑；运行前确定性门矩阵已执行。 |

### 3.3 E1.1–E1.7（并行 greenfield）

| ID | 判定 | 依据 |
| --- | --- | --- |
| E1.1 | pass | E0 冻结后 E1 上岗；8 卡/边界/YAML/changelog 齐备；写集扫描无越界；上岗前只读接收契约（冻结记录 §七）。 |
| E1.2 | pass | 六角色模块 + gates greenfield（六 `index.ts`+gates `index.ts`）；共享 `src/common/shared/` 既有维护/迁移（shared-components 已迁）。 |
| E1.3 | pass | 旧代码冻结：E2 pre-switch 基线逐单元重取；E1 只新增模块/测试；旧引擎在 E2 前为权威/oracle（E2 评审/§三）。 |
| E1.4 | pass | 唯一 public entry：module-graph `publicEntryViolations=[]`；六角色根/gates 根仅 `index.ts`。 |
| E1.5 | pass | 零跨角色 import/无环：扫描 331/1,760、违例 0、value 环 0；module-graph 5/5。 |
| E1.6 | pass | 无重复：body hash 重复 0、≥20 行窗口 0；共享测试单源（12 文件/11 组件，`shared-components.md` `351b0b3b…`）；接口评审 E0/E2 记录齐备。 |
| E1.7 | pass | 各角色模块 public entry/测试/差分/api-spec/完成报告；T3 新增 39 文件 401/401。 |

### 3.4 E2.1–E2.8（增量切换）

| ID | 判定 | 依据 |
| --- | --- | --- |
| E2.1 | pass | 7 单元顺序：X-G 先，X-R1 product→X-R2 rapporteur→X-R3 nominator→X-R4 convener→X-R5 verifier→X-R6 chief；逐单元切换记录。 |
| E2.2 | pass（含形式缺口） | 每单元双跑/金样差分 + 受影响套件；已登记差异（D-PRE-1、更严项、带开关断言）映射说明；X-R3 原始日志未归档、X-R4/R5/R6 oracle compare 不可复跑（形式缺口，见 §4.4），以证据正文摘要/只读探针/E3 扫描补充。 |
| E2.3 | pass | 桥接/开关无客户可见开关、不改门禁语义；同批删除；消费文件单写者（切换日志/评审记录）。 |
| E2.4 | pass | 三态 A/B/C（部分 A/D）回滚演练逐测试名一致；日志/哈希入单元证据。 |
| E2.5 | pass | 切换成功验证后删除旧实现/门面/符号；删除清单入切换日志/变更包；`TRIO_CARD_KINDS.product` 为空回退/源码 oracle 残留（待确认，见 §4.3）。 |
| E2.6 | pass | 只清理本变更导致不再使用的代码；历史零引用 3 项/`TRIO_CARD_KINDS.product` 列「待确认」不盲删；Git 历史保留。 |
| E2.7 | **not applicable** | X-S 共享抽取按 E0 冻结记录 §二/§三决定默认不迁移（`handback.ts`/`workflow-preconditions.ts` 保持编排公开只读）；依据明确。 |
| E2.8 | pass | 每单元切换 gate：等价差分+受影响套件+回滚演练+删除清单；E3 汇总入变更包。 |

### 3.5 E3.1–E3.12、E-A1–E-A10、D1–D9

| ID | 判定 | 依据 |
| --- | --- | --- |
| E3.1 | pass（非确定性披露审查通过；见 §4.1） | B0 `13553505…` 有效；510 文件逐文件自然 EXIT/CLOSE + 6 登记挂起 + 1 非登记 watchdog；4,872/4,641/198/1/32；B0 子集 4,471/4,240/198/1/32；194/199 一致、4 新增非确定性、5 消失、new skip 0、missing skip 0；6 挂起逐项复现；32 skip 不变；静态门全绿；T3 前后 manifest 不变。 |
| E3.2 | pass | `npm run typecheck` / `typecheck:renderer` / `build:renderer` 前/收工 exit 0；日志 hash 记录；renderer 未触及仍实测通过。 |
| E3.3 | pass | 门禁负例矩阵 122/121/1（1 为 B0 既有）；N1–N28 断言存在；Git/验收负例引用 T3 C；无门禁放宽。 |
| E3.4 | pass | D1 目录/owner：六角色+gates 唯一入口；8 卡/边界/YAML；shared-components `351b0b3b…`；PM 旧共享边界已移交/删除。 |
| E3.5 | pass | D2：模块图无环/零跨角色/门不 import 角色/共享不 import 门·角色（扫描 + module-graph 5/5）。 |
| E3.6 | pass | D3：body hash 重复 0、≥20 行窗口 0；4 组同形文本为角色卡私有数据（说明）。 |
| E3.7 | pass | D4：12 共享测试文件 + 11 组件映射；`test/项目管理/shared/` 历史路径保留；共享测试单源声明。 |
| E3.8 | pass | D5：`trunk-runtime.ts` 仅 import gates、2 调用、本地定义 0；gates 定义 1；金样/集成。 |
| E3.9 | pass（3 项待确认允许） | D6 接口评审（E0/E2/三份输入）齐备；D7 不以「后续清理」通过（F1 已修复复扫 0）；D8 双轨/单 owner/切换即删结构面（`TRIO_CARD_KINDS.product` 待确认）；D9/E-A10 范围内零未使用/零重复、删除清单、历史 3 项待确认不删。 |
| E3.10 | pass | E-A1–E-A10 逐项证据见 §2/E0 冻结/E2 切换/E3 扫描；E-A9 拒绝一次性替换（E2 逐单元）；E-A10 范围限定/删除清单/历史待确认。 |
| E3.11 | pass（P1-RR 限缩） | Claude 必测 = P1-RR（父门受理、task.created；下游投递拒绝如实记录）；Pi 确定性必测/真实 Pi N/A；Codex 确定性/桩件 + 既有 T3 证据（真实模型 N/A）。 |
| E3.12 | pass | 最终变更包 `01d89b57…`（70 行）：候选身份、改动面、T3、扫描、真实运行、披露、删除清单、待确认、证据链接齐备；不授权提交/发布。 |
| E-A1 | pass | 契约冻结（E0.3 `067e3d2e…` + 冻结记录 `5439d7c3…`）；8 角色边界/写集/6+1+1 public 契约/基线齐备。 |
| E-A2 | pass | 写集不重叠；角色零 import；共享/门控单一 owner；旧代码冻结（E1/E2 记录）。 |
| E-A3 | pass | 每单元切换前差分逐字段/公开回执一致；已登记差异映射；E3 门禁负例不变。 |
| E-A4 | pass | 逐单元增量切换；桥接/回滚；禁止大爆炸；切换验证后删除旧实现（删除清单）；`TRIO_CARD_KINDS.product` 待确认例外。 |
| E-A5 | pass | 契约/单测/差分/集成/真实运行按里程碑；E3 终验；不把测试留到替换后。 |
| E-A6 | pass | 8 角色边界/写集/无越界/接口评审记录（E1/E2 证据）。 |
| E-A7 | pass | P1-RR 真实重跑在 P1 门控修复后、E1/E2 大规模切换前完成；顺序证据。 |
| E-A8 | pass | 终验 = T3 全量 + 门禁负例 + D1–D9/E-A10 + 真实运行证据；变更包。 |
| E-A9 | pass | 无一次性替换；逐单元切换 + 回滚 + 双跑；证据见切换日志。 |
| E-A10 | pass（3 项待确认） | 范围内旧实现不存在/零未使用导出/零重复；删除清单；无关历史 3 项列待确认不删；Git 历史保留。 |
| D1 | pass | 目录/owner/入口/边界：六角色+gates 唯一 index；8 卡/边界/YAML；shared-code 移交；扫描+文档。 |
| D2 | pass | 同 E3.5。 |
| D3 | pass | 同 E3.6。 |
| D4 | pass | 同 E3.7。 |
| D5 | pass | 同 E3.8。 |
| D6 | pass | 同 E3.9/D6。 |
| D7 | pass | 同 E3.9/D7。 |
| D8 | pass（1 待确认） | 同 E2.5/D8；`TRIO_CARD_KINDS.product` 空回退待 product-code fixture 收口。 |
| D9 | pass（3 待确认） | 同 E3.9/D9；历史 3 项允许保留。 |

### 3.6 M1–M8、R1–R7、L1–L6

| ID | 判定 | 依据 |
| --- | --- | --- |
| M1 | pass | 六角色模块目录/唯一入口；`governance-roles.ts` 门面差分 0/6 差异（E2 评审：旧规格 vs 模块规格 0/6；cards 0/6；reportToRoleId 7/7）。 |
| M2 | pass | 依赖图零跨角色/无环（扫描 + module-graph）。 |
| M3 | pass | 行为不变：逐单元差分/受影响套件；已登记差异映射；E2 评审 226/226 + 差分 0/6。 |
| M4 | pass | 现有测试全过（T3）；无删断言/加 skip/放宽；失效证据重取披露。 |
| M5 | pass | 门禁负例 N1–N28 + 写/边界/Git/验收既有负例（122/121/1；Git/验收引用 T3）。 |
| M6 | pass | 角色模块 API 限 E0.3 §6.2 契约；无 I/O/可变状态/第二事实源（扫描/契约测试）。 |
| M7 | pass | 门面共存期无两处维护；逐批迁移差分/回归；D2 投影/E2 删除。 |
| M8 | pass | 每模块 api-spec/功能说明；shared-components 目录更新。 |
| R1 | pass | 8 角色候选/边界/写集可核查；H1 卡/边界/YAML/changelog 齐备；闸门留痕。 |
| R2 | pass | 写盘扫描：每角色只写声明写集；引擎文件原 owner；无越界（E1/E2 证据/扫描）。 |
| R3 | pass | 共享代码仅 shared-code 写；角色模块不复制/私改共享（D3 扫描 + 评审）。 |
| R4 | pass | 共享 API 变更评审记录/消费者影响/测试（E0/E2 记录）。 |
| R5 | pass | 门控代码仅 gates-code 写；门 API 评审；门不采集（E2/E3 证据）。 |
| R6 | pass | 现有 worker 保留/收窄按闸门 2；无未确认职责迁移。 |
| R7 | pass | 角色上岗不早于 E0 冻结；P1 由现有 owner D-minimal；无临时写集例外。 |
| L1–L6 | 披露充分（非 pass/fail 条目） | Codex 外来 MCP fail-closed、WebSearch 默认拒绝、下游写/发布门 strict observed、`start_background_task` 无真实证据、应用中介不证明效果闭包、产品内置六角色不扩张——均在变更包/证据中披露，未放宽。 |

## 4. 披露审查与判断

### 4.1 冻结脏基线非确定性（E3.1）

- **披露现状**：T3 记录 §3.4/§3.5 逐条列出 4 条新增失败（e-pi Node 原生崩溃、chief-workflow W29/commit-race/selected 清理抖动）与 5 条既有消失（application-line、W19 重复项、W30、unmanaged、git-shell-acl），并提供同候选同命令复跑（e-pi 11/11×2、git-trunk-store 13/13×2、interactive 5/5×2、application-line 3/3×2、git-shell-acl 3 次 36/36）；chief-workflow 4 次运行 15/14/11/14、W19 稳定、W33 名称稳定但错误类变化；6 登记挂起逐项复现；`--test-force-exit` 全程未使用。
- **判断**：按 B1 v1.1 E3.1-B/E（逐条说明 + 变差=新增确定性失败）与 E3.1-H：新增确定性失败 **0**、新 skip **0**、6 挂起按登记、32 skip 不变、198 fail/1 cancelled 计数不变；4 新增/5 消失均为非确定性（复跑消失/波动），已逐条披露；因此 E3.1 pass。**但**失败名称集合并非逐条完全不变；本 pass 不表示 T3 单次全绿/无阻断。若客户要求“失败名称集合逐条完全不变”或“单次全绿”，则 E3.1 应按 insufficient evidence 另判。T3 记录自身的“阻断/待裁定”已由本 B2 裁定为“接受为非确定性披露、需持续监测/必要时另立变更”，不当作本变更源码缺陷。

### 4.2 P1-RR 下游门

- **事实**：真实 Claude 父门受理、`task.created` 成功；`dispatch_task` 工具回执为 `denied`/failed，原因是目标 product 会话创建被下游 `runtime-creation-admission-unproven:required-scope-unconfined-script-tools,native-factory-plan-unavailable` 拒绝；任务记 failed、投递队列空、无产品会话；预算/回退/截图如实记录。
- **判断**：B1 P1/RR1 明确只承诺“派发受理/父门通过”，后续写/发布/会话准入门不放宽（INV-2/N15）；任务创建证明父门/Service 派发前段通过，工具回执失败属下游、已披露。P1/RR1 pass（限缩），**不宣称投递或闭环完成**。若验收要求“dispatch_task 工具整体成功/投递成功”，则 RR1 应按 insufficient evidence；冻结标准与授权未要求。

### 4.3 待确认项

- `TRIO_CARD_KINDS.product`：当前仅剩 `product: []` 空回退/源码 oracle；运行期 `cardKindsOf` 优先角色模块（product module `cards=[]`），fallback 与模块值相同，无行为差异；product-code fixture 仍读取旧源码文本。属 E2.5/D8/D9 的**已披露例外**，待 product-code fixture 迁移后收口；不改变本次行为等价结论。**建议**后续变更删除该空表并与 fixture 迁移同批完成。
- `BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE`：HEAD `e71501c` 已存在（历史导出），代码引用 0、注释引用 1；属 D9 允许的“无关历史导出列待确认不删”。
- `rosterFileName`/`isSelfReport`：历史零引用导出；D9 允许。
- 同形文本 4 组：角色卡私有数据，非共享逻辑复制；已说明。

### 4.4 后续接口评审项与形式缺口

- **后续接口评审项**：桌面 hub 目标数据化与 version-decision preflight（需 Pipeline 公开只读句柄）、Pi 其他 native 方法 legacy 转发、Git-action preflight（Git Service/宿主单元）、requirement-change 工具层唯一消费点已收敛；均为变更包 §六.4 披露的后续项，不属于本 B1 的 E2/E3 阻断（E2 评审明确“无需要修改 E0.3 冻结契约/写集的实质问题”）。判断：披露充分，不影响本次 pass；需后续接口评审排期。
- **形式缺口**：E2 X-R3 原始日志未归档、X-R4/R5/R6 oracle compare 不可复跑（只读探针）、X-G L2 用例转储缺失（金样+集成替代）、shim 同单元删除、build 留 E3、T3 运行 A/B 重叠（C 权威）、候选聚合算法文字（path vs 整行排序）、`role.*` 内部 messageKey 未登记 i18n（E2 评审决定）。判断：均已充分披露；不影响本次 pass，但应在变更包/T3 记录/后续变更中订正或补齐（非返工阻断）。
- **冻结后候选稳定性**：T3 收工 manifest `5cbdbb94…` 与冻结一致；E3 扫描收工同值；我的复跑后同值；候选聚合/树/HEAD/T1/暂存不变。判断：稳定。

## 5. 结论与范围限制

1. **总体：pass（通过），限上述冻结候选与 B1 v1/v1.1**。pass 的含义是：B1 核心条目在当前候选上的必要证据齐备、逐项满足（N1–N28 矩阵、M/R/D/E-A 组合同样满足）；非确定性/形式缺口/待确认项已披露并按 B1 v1.1 允许的方式处理。
2. **不做出的声明**：不宣称 T3 单次全绿；不宣称六角色真实 Claude 完整闭环/投递成功；不宣称发布就绪；不替代 I6 B1（H01–H11）、旧 A/J 或 T1 的验收结论；不改变任何标准/角色/写集。
3. **需后续处理（非返工阻断）**：
   - 变更包/T3 记录订正候选聚合算法文字（整行排序；path 排序值 `aa09499a…` 仅为错误描述下的结果，不得引用）。
   - product-code fixture 迁移后删除 `TRIO_CARD_KINDS.product` 空回退；补齐 E2 缺失原始日志/转储（可归档范围）。
   - 对 Node 原生 CleanupQueue 崩溃、ENOTEMPTY 清理抖动、`interactive-execution-mode` post-test 泄漏继续监测；如有必要另立变更（不当作本变更源码失败）。
   - 后续接口评审项（桌面 hub 目标数据/version-decision preflight、Pi legacy native 方法、Git-action preflight）按计划排期。
   - 发布/tag、提交/推送/合并均未授权；如需远端复核另行客户授权。
4. **限制**：本报告只读复核（可复跑非破坏性命令）；未改产品/测试/方案/角色卡/边界；未跑真实模型；未修改候选；未判 I6/旧 A/J/T1。所有结论只对当前候选字节和上述 B1 版本有效；任何候选/标准/写集/环境变化使受影响证据失效并需重判。

---

**签署：ANS 独立验收唯一主上下文（固定身份）——2026-11-08；本报告仅写于本实施检出 `docs/acceptance/`。**
