# 切换日志：运行时门控与角色模块化（E2 逐单元）

- **任务 ID**：`2026-11-07-runtime-gate-role-modularization`
- **记录角色**：ANS 统筹调度（Scheduler）
- **日期**：2026-11-07
- **性质**：E2 逐单元切换记录（等价差分/回滚演练/删除清单/受影响套件/证据链接）；不是验收结论；不授权提交/推送/合并/发布。
- **口径**：每单元「切换成功并验证后立即删除旧实现/门面/符号」；旧实现删除前旧路径保持可用；桥接/开关与旧实现同批删除；回滚长期以 Git 历史。B1 E2.1–E2.8 证据按单元归档；E3 汇总入最终变更包。

## 单元状态总览

| 单元 | 状态 | 切换点 | 回滚演练 | 删除清单 | 单元出口证据 |
| --- | --- | --- | --- | --- | --- |
| X-G 门控（trunk-runtime→gates） | **已切换（completed-unverified）** | 2026-11-07 | 三态 A/B/C 一致 | 已删（见下） | 编排 `8f71c4ca…`→`ccb0ac9a…`；测试 `510f2a57…` |
| X-R1 product | **已切换（completed-unverified）** | 2026-11-07 | 三态 A/B/C（B 态多 1 条=强制旧路径 vs 新测试的 D-PRE-1 已登记差异） | 已删（见下） | 门禁 `26ba6fd4…`；编排 `33900266…`；运行时核心 `52aca8c8…`；桌面 `fe696df2…`；测试 `b5b2dcda…` |
| X-R2 rapporteur | **已切换（completed-unverified）** | 2026-11-07 | 三态 A/B/C（product 接缝 B 态首跑已复跑补齐） | 已删（见下） | 门禁 `e44c1f2b…`；编排 `dc6abf4a…`；运行时核心 `7d017fb4…`；桌面 `d1f33c28…`；rapporteur-code `4c06fac0…`；测试 `1cab5d34…` |
| X-R3 nominator | **已切换（completed-unverified）** | 2026-11-07 | 三态 A/B/C/D 一致（开关已删） | 已删（见下） | 门禁 `c845c170…`；编排 `2cd0f9f1…`；运行时核心 `03c9bac9…`；桌面 `8c8bf983…`；测试 `0e4d7cef…` |
| X-R4 convener | **已切换（completed-unverified）** | 2026-11-07 | 三态 A/B/C（legacy 6 红均为新模块路径断言，已解释） | 已删（见下） | 门禁 `ba780c68…`；编排 `5c953d29…`；运行时核心 `f834ec47…`；桌面 `a26cefa6…`；convener-code `f28dbebb…`；测试 `8df8212d…` |
| X-R5 verifier | **已切换（completed-unverified）** | 2026-11-07 | 三态 A/B/C（B 态 3 红为最终态源码断言在带开关状态，已解释） | 已删（见下） | 门禁 `7c798ccf…`；编排 `7529cfc3…`；运行时核心 `3cbf2594…`；桌面 `6801472b…`；verifier-code `326739a4…`；测试 `ea8c8785…` |
| X-R6 chief | **已切换（completed-unverified）** | 2026-11-07 | 三态 A/B/C（A/B 多 3 红=最终态源码接缝断言） | 已删（见下） | 门禁 `6e85d384…`；编排 `4b77061d…`；运行时核心 `a63118f7…`；桌面 `522b9e5f…`；chief-code `736e3caa…`；测试 `3c95a1f8…` |

> **E2 状态：全部 7 个单元（X-G + X-R1…X-R6）切换完成、旧实现已删除、逐单元出口复核通过（completed-unverified；待 E3 终验与独立验收 B2）。**
| X-S 共享抽取 | **N/A**（E0 决定默认不迁移；`handback.ts`/`workflow-preconditions.ts` 保持编排公开只读入口） | — | — | — | E0 冻结记录 §二/§三 |

---

## X-G 门控切换（trunk-runtime → `src/common/gates/`）

- **目标**：用 `src/common/gates/index.ts` 的 `evaluateChiefDispatchParent` 替换 `trunk-runtime.ts` 内联 D-minimal 实现（`validParent` 与 `currentChiefResumeSource` 两处调用），行为等价后删除内联实现与本地类型。
- **切换前基线**：`角色卡/测试/docs/change/2026-11-07_E2-XG_pre-switch-baseline.md`（375 行 / `6f5d2484399377e85092583cd473f4d3e4a465a7ab7f7b9b38a051be926aaeac`；11 文件聚合 `eb75ca49…`）；gates 29/29、trunk 三件套 37/36/1、集成 10/10、typecheck 0。
- **金样冻结（oracle 脱离旧实现）**：`test/gates/fixtures/dispatch-parent-golden.ts`（308 行 / `d3062907765bf7897ce91d5c847f99c0a2b8aff0aed7d9c76c9967d35c03568d`；134 场景/268 比较，37 true/231 false；生成时 trunk-runtime `9453a43f…`、gates `be7e1738…`）；`differential-trunk-runtime.test.ts` 改写为金样对照（130 行 / `ea93e62c…`），变异负例验证不匹配即失败。
- **切换实现**：`trunk-runtime.ts` 新增 gates import（`:29`）；两处调用（`currentChiefResumeSource` `hub:true`、`validParent` `hub`）；文件 1,259→1,056 行（`9453a43f…`→`9666b2b2…`），shim 移除后最终 **1,044 行 / `b81e0dd307f6f740a54cbdf47c0358ed21d9336549d2a267bc125cb2d265b5f3`**。
- **双跑差分**：金样 `differential(gates vs frozen golden): scenarios=134 comparisons=268 differences=0`；P1 矩阵 19/19；跨层集成 10/10。
- **回滚演练（三态，删除前）**：A gates（gates 29/29；trunk 37/36/1）、B inline（29/29；37/36/1）、C gates 恢复（29/29；37/36/1）；三态逐测试名一致；唯一失败始终为 B0 冻结 `trunk-service` 同条。日志 `fc89a7ca…`/`89b1a14a…`/`1f47f6f3…`、`a8d4c493…`/`e375ff2f…`/`65ff6649…`。
- **删除清单（已执行）**：`ChiefDispatchParentHostFacts`/`ChiefDispatchParentCoreFacts`/`ChiefDispatchParentDecision` 本地类型、`APPLICATION_MEDIATION_FACTORY`、`sameNameSet`、`activeDispatchToolName`、`dispatchParentIdentityFailure`、`dispatchParentTailFailure`、`strictNativeFailure`、`restrictedApplicationMediationFailure`、内联 `evaluateChiefDispatchParent`、临时开关 `DISPATCH_GATE_IMPL`、X-G temporary bridge（再导出 + 两接口）、不再使用的 imports；word-boundary `\bChiefDispatchParent` 残留 = 0；本地判定实现/`applicationMediation`/7 helper 在 trunk-runtime 均 0。
- **受影响套件回归**：gates 29/29（exit 0）；trunk 三件套 37/36/1（exit 1；唯一失败 B0 同条）；跨层集成 10/10；P1 smoke 四文件 81/79/2（两条均为 B0 既有：`direct-role-capabilities`「Retained intent confirmation…」、`direct-role-capabilities-e2e`「Q normal-new early chain…」）；`npm run typecheck` exit 0；新增确定性失败 0、新 skip/todo 0。
- **测试改造**：`test/编排/trunk-dispatch-parent.test.ts` 最终 396 行 / `44b18c2e293895742f27f9cfedcfdcad933d827abdadba25a2ddc71334ba4f90`（19 例；第 19 例结构守卫改为最终结构）；`test/测试/runtime-dispatch-gate-integration.test.ts` 417 行 / `5433911a0d02130e2c659ef45abd47a15acf623bcf1137cc6894a918ad63467a`（10 例）；`trunk-runtime.test.ts` 未改。
- **单元候选**：10 文件（trunk-runtime、gates index、golden、differential、dispatch-parent、trunk-runtime.test、integration、fixtures、gates 其余测试）聚合 `f0dcf20c7c88e658ca9d6be9c757e74e50a3d45479aa019b80ca19ee58bea366`（算法见测试证据 §候选身份）。
- **证据链接**：编排 `角色卡/编排/docs/change/2026-11-07_E2-XG_gate-switch-evidence.md`（452 行 / `ccb0ac9ad9a14f452c7c9e1d23ede6eb791125183d6af4368bed65f192c002de`）；测试迁移 `角色卡/测试/docs/change/2026-11-07_E2-XG_integration-update-and-verification.md`（243 行 / `a3543178df1c502b2b705f253ba348f1e2aaa8e193f7fb181f6ac8a60be83655`）；单元出口 `角色卡/测试/docs/change/2026-11-07_E2-XG_unit-exit-verification.md`（259 行 / `510f2a57c158ec7a33b8ea05a6328b4d7b2fe2d3258d7537e544f625aac566b5`）；gates 金样 `角色卡/gates-code/docs/change/2026-11-07_E1_gates-module-evidence.md` §13（`f0ecdc07…`）。
- **测试复核缺口处置（G1–G8）**：G1 本日志已建立；G2 由 `docs/scheduling/2026-11-07_change-package_runtime-gate-role-modularization.md`（累积）承接；G3 L2 逐例 `ok/reasons` 转储缺失——以 L1 金样（134/268/0）+ 集成 10 例作为强证据，记录为可接受形式缺口；G4 shim 与内联非同一批次——同单元内（测试迁移完成后立即删除；shim 从未进入生产路径），记录为同单元等效；G5 构建证据留 E3（B1 E3.2/E-A8）；G6 「待确认」清单在 E2 变更包维护（X-G 无）；G7 E2.7 N/A 依据 = E0 冻结记录 §二/§三（共享不迁移）；G8 证据索引分节补充。
- **回滚方式**：单元已删除旧实现；长期回滚 = Git revert 本单元相关提交（当前未提交，工作树可整体回退）。单元切换前快照见 pre-switch 基线。

---

## X-R1 product（数据门面 + 消费点）

- **目标**：product 规格数据迁入模块门面；run-role 工具注入/卡种/默认卡与 VCA direct 前置改读模块；目标侧 dispatch 不进生产链；single/su 保留旧路径。
- **门面（门禁引擎）**：`governance-roles.ts` 产品项改为 `specOf(productRoleModule)`；删除 product 内联卡文本/规格；D6 `GovernanceCapabilities` alias 到 Model；`BUILT_IN_ROLE_MATRIX` 部分化（product 逐字迁入）；经 `src/service/role/resolve-role.ts` 公开 `builtInRoleModuleOf`/`validateRoleToolDeclaration`（接口评审记录，无客户卡）。oracle 冻结差分：product 规格/卡/cards/工具声明 **0 差异**。
- **消费点（编排）**：`run-role.ts` product 工具注入经模块 `tools()` + D1 校验（trio；single/su/未装配回退旧路径）；`cardKindsOf` 6 处与默认卡改模块数据；`version-change-runtime.ts` direct 路径 `kind=version-upgrade` 在既有早退后调用 product preflight（deny 映射既有回执码，allow 不替代 Service）；`apply-journal.ts` 无适用策略改动（17 处 product 均为 Service 信任核验/路由/证据，记录不改理由）。
- **运行时核心/桌面窗口**：**无生产改动**（provider 注册由能力位驱动、角色条件为 defense-in-depth；桌面 18 处均为身份/呈现/宿主事实，策略归 Pipeline/Service）。证据 `52aca8c8…`/`fe696df2…`。
- **双跑差分**：run-role 工具注入 6 场景 0 差异；VCA direct 9 场景 7 同 + 2 个 D-PRE-1（空 targets、畸形 baseTrunk；生产 schema 不可达）；回滚三态 A/B/C：131/118/13、131/117/14（B 态多 1 条=强制旧路径下新测试的已登记 D-PRE-1 差异）、131/118/13；删除开关后 FINAL 131/118/13；typecheck 0。
- **删除清单**：facade `PRODUCT_CARD_TEXT` + product 内联规格；run-role trio product 无条件注入分支、默认卡 product 分支；`TRIO_CARD_KINDS.product` 保留为 fallback/oracle（待 product-code 改冻结 fixture 后收口）；临时回滚开关（同批删除）。
- **受影响套件**：编排四文件 82/81/1、runtime-core 两文件 37/34/3、version-change 集成 12/3/9、product 29/29、契约 15/15；门禁全量 421/415/5、runtime-core 全量 490/453/33、编排全量 1,041/1,015/24——全部失败逐条在 B0 名单，**新增确定性失败 0、新 skip 0**。
- **单元候选**：7 文件聚合 `649e3ca0ada571d00db3927e2b1004d014610fb7fa531fc482fc8a37e8b3d667`（门禁 4 文件 `4885ea15…`、编排 3 文件 `ae7609ab…`）；最终 `run-role.ts` `fd65cc4a…`、`version-change-runtime.ts` `d50d3220…`。
- **证据链接**：门禁 `26ba6fd4…`；编排（含 §13 三态/§14 哈希订正）`33900266…`；运行时核心 `52aca8c8…`；桌面 `fe696df2…`；测试单元出口 `b5b2dcda…`。
- **缺口处置（测试 G1–G7）**：G1 本日志/变更包/派发记录更新；G2 三态回滚补齐；G3 构建证据留 E3；G4 待确认清单在变更包维护；G5 E2.7 N/A 依 E0 冻结记录；G6 oracle 行号漂移为 S2 编辑所致（数据 equal，记录）；G7 开工哈希 LF/CRLF 伪差异已订正。
- **回滚方式**：开关已删；长期回滚 = Git revert。

## X-R2 rapporteur（数据门面 + 消费点）

- **目标**：rapporteur 规格数据迁入模块门面；run-role 工具注入/canRequestRequirementChange（rapporteur 分支）/默认卡、VCA detail-amendment direct 前置、trunk-runtime run-change 前置改读模块；requirement-change 在工具层（Provider 直接 import 角色 public entry，DAG 允许）前置；目标侧 dispatch 不进生产链；convener 分支保留至 X-R4。
- **门面（门禁引擎）**：`governance-roles.ts` rapporteur 项 `specOf(rapporteurRoleModule)`；删除 `RAPPORTEUR_CARD_TEXT` 与内联规格；matrix 逐字迁入；`builtInRoleModuleOf("rapporteur")` 返回模块；差分 **0**（`2756d7e0…` 日志末行 ZERO DATA DIFFERENCES）。
- **消费点（编排）**：run-role 模块化工具注入扩至 rapporteur（D1 校验；single/su/未装配回退）；`canRequestRequirementChange` 仅切 rapporteur 分支；rapporteur 默认卡/卡种模块驱动；`version-change-runtime` detail-amendment direct 前置（facts wholeOrder=true/legacyCardPath="none"）；`trunk-runtime` run-change 前置（facts 齐备处；保留 `run-stop-unverified`）；`apply-journal` 无改动（Service 事务/账本/证据/停稳，接缝测试断言无模块消费）。
- **运行时核心**：`provider/runtime/tools.ts` requirement-change handler 前置调用 rapporteur 模块 preflight（Provider→角色 public entry，不经 Service；deny→既有回执；allow 恒真 = 零差异性质）；detail-amendment 非 direct 分支不接线（无诚实 facts，记录归属）。
- **桌面窗口**：**零改动**（27 处分类为身份/路由/宿主事实/呈现；工具注入归编排、preflight 归 Service/Pipeline；无合法零差异接线点）。
- **双跑/三态**：工具注入 3/3、run-change 5/5、detail-amendment allow + 畸形目标同拒；三态 A/B/C 12 套件一致（product 接缝 B 态首跑 4/3/1 已复跑 4/4 补齐）；typecheck 0。
- **删除清单**：rapporteur 内联卡文本/规格、`canRequestRequirementChange` rapporteur 分支、selectRunChange 旧角色字面门控（降回退）、默认卡 product 特例、`TRIO_CARD_KINDS.rapporteur`、临时三态开关（同批删除，grep 0）。
- **受影响套件**：rapporteur 67/67；编排 9 文件 110/109/1；runtime-core 3 文件 30/29/1；version-change 集成 12/3/9；契约 25/25；全部失败逐条 B0；**新增确定性失败 0、新 skip 0**。
- **单元候选**：12 文件合并聚合 `9e650ad98f41278c3acb6a59265a78c68b2684d6e587b6edd8224873e315fd41`（门禁 `959080e8…`、编排 `13f62d88…`、运行时核心 `5cf53433…`、rapporteur-code `656941a6…`）。
- **证据链接**：门禁 `e44c1f2b…`；编排 `dc6abf4a…`；运行时核心 `7d017fb4…`；桌面 `d1f33c28…`；rapporteur-code `4c06fac0…`；测试单元出口 `1cab5d34…`。
- **缺口处置**：切换日志/变更包本行已更新（G1）；三态假阴性已复跑解释（G3）；fixture 更新目录无汇总 md——以测试出口记录为准（G4）；全量整目录留 E3（G5）。
- **回滚方式**：开关已删；长期回滚 = Git revert。

## X-R3 nominator（数据门面 + 消费点）

- **目标**：nominator 规格数据迁入模块门面；run-role 工具注入/卡种、D3 卡前置（run-role/workflow-preconditions）、角色文档激活前置（trunk-runtime）改读模块；D-1 已修复（intentEntryConsistent 可选/诊断，等价旧路径）；Service 事务/账本/证据/D3 最终校验保持。
- **门面（门禁引擎）**：nominator 项 `specOf(nominatorRoleModule)`；删除 `NOMINATOR_CARD_TEXT` 与内联规格；matrix 逐字迁入；差分 **0**（`0e0f66be…`）；契约 17/17（含 X-R3 1 例）。
- **消费点（编排）**：run-role 模块工具注入扩至 nominator；`activateRoleDocuments` 模块声明 + `directGovernance` 双门控（single/su 回退）；D3 卡前置在既有校验后调用模块（deny→`appointment-invalid`）；workflow-preconditions 严格 api-spec fact 投影（flowId 非 slug 跳过、不新增拒绝）；trunk-runtime 三文档激活前置在 `validateRoleDocumentsSnapshot`+`validateBoundaryYamlText` 后（deny→`activation-not-ready`）；apply-journal 仅注释（Service 信任核验/账本，recovery/revalidate 跳过并记录理由）。
- **运行时核心/桌面窗口**：**零改动**（能力位由模块 capabilities 单源驱动、provider 注入才注册；桌面 18 处为身份/路由/宿主事实/呈现；无合法零差异接线点）。证据 `03c9bac9…`/`8c8bf983…`。
- **双跑/三态**：工具/D3 卡 6 例（1 allow/5 deny 一致）/角色文档激活 allow 一致；三态 A+D 112/108/4、B 35/34/1、C 40/38/2 逐组一致；typecheck 0。
- **删除清单**：`NOMINATOR_CARD_TEXT`、nominator 内联规格、`TRIO_CARD_KINDS.nominator`、`activateRoleDocuments` 内联条件（降回退）、临时三态开关与探针（同批删除，grep 0）。
- **受影响套件**：出口复核 213/206/7（7 红均 B0 逐条：appointment-roster ×2、section1 ×2、direct-role-capabilities ×1、matrix A5 ×1、trunk-service ×1）；新增测试全绿；**新增确定性失败 0、新 skip 0**。
- **单元候选**：8 文件合并聚合 `6c62fe5c2c3c2d28f383ea01544657e2e21e937832685acfb9a12231f9c340b1`（门禁 `4732b8a3…`、编排 `98f5e9bc…`）。
- **证据链接**：门禁 `c845c170…`；编排 `2cd0f9f1…`；运行时核心 `03c9bac9…`；桌面 `8c8bf983…`；测试 `0e4d7cef…`。
- **缺口处置**：G1 记录本行已更新；编排双跑/三态仅证据正文摘要、原始日志未归档（开关已删不可重跑）——记录为形式缺口；门禁 oracle compare 因 S2 删源码锚点不可复跑，以只读探针复验零差异；门禁全量留 E3。
- **回滚方式**：开关已删；长期回滚 = Git revert。

## X-R4 convener（数据门面 + 消费点）

- **目标**：convener 规格数据迁入模块门面；run-role 工具/谓词/卡种、team-plan/stable-write/requirement-change 前置、dispatch 来源模块组合（`evaluateDispatchAuthorization` 保持公开入口与对外文案）、apply-journal worker 路由读模块数据；Git 执行/ACL/证据闭包、Service 事务/账本保持。
- **门面（门禁引擎）**：convener 项 `specOf(convenerRoleModule)`；删除 `CONVENER_CARD_TEXT`/`CREATED_TASK_CLOSURE`/内联规格；matrix 逐字迁入；差分 **0**（`a07f045c…`）。
- **消费点（编排）**：run-role 工具注入扩至 convener（含 completeTeamPlan/closeCreatedTask/submitRefactor/requestStableWrite）；`canRequestRequirementChange`/`canRequestStableWrite` 旧谓词删除；`TRIO_CARD_KINDS.convener` 删除；team-plan/stable-write preflight 接线；`workflow-preconditions` convener 来源 dispatch 改读模块（code/message 保旧）；trunk-runtime team-plan/review 路由读模块；apply-journal worker 目标/review 路由读模块数据。
- **运行时核心**：`provider/runtime/tools.ts` convener requirement-change 工具层前置接入（净 +13；rapporteur 同入口按可信 roleId）；其余条件保留（能力位驱动/defense-in-depth/Git 事实不可得）。
- **桌面窗口**：**零改动**（91 处分类；来源模块组合归 Pipeline 公开入口；桌面不自行调用模块）。
- **convener-code**：差分 fixture 金样化（脱离旧文件结构；107 项比较；32/32）。
- **双消费点处置**：编排侧 `withConvenerRequirementChangePreflight` 与 Provider 工具层重复消费 → 按 E2 V-7 **保留 Provider、删除编排包装**（run-role 净 −41；全仓 0 命中）。
- **双跑/三态**：工具/卡种/team-plan/stable-write/requirement-change/dispatch 0 行为差异（dispatch 仅已登记更严项）；三态 A 118/118/0↔118/112/6（6 红=新模块路径断言）↔118/118/0；B/C 组三态一致；typecheck 0。
- **删除清单**：convener 内联卡文本/规格、旧谓词（canRequestRequirementChange/canRequestStableWrite）、`TRIO_CARD_KINDS.convener`、convener 路由字面量、临时开关（同批删除，grep 0）。
- **受影响套件**：出口复核 177/171/4（4 红均 B0：git-capabilities、direct-role-capabilities、trunk-stable-write ×2；skip 2 同 B0）；**新增确定性失败 0、新 skip 0**。
- **单元候选**：16 文件合并聚合 `891c92d5182778a0baffda0620c9d514ea7dcde6d7b44c85464c65484ce745c2`（门禁 `170d25d3…`、编排 `15a5c3fe…`、运行时核心 `40ef6e9d…`、convener-code `1232df59…`）。
- **证据链接**：门禁 `ba780c68…`；编排 `5c953d29…`；运行时核心 `f834ec47…`；桌面 `a26cefa6…`；convener-code `f28dbebb…`；测试 `8df8212d…`。
- **缺口处置**：调度侧记录本行已更新；`trunk-stable-write.test.ts` 名称以 `test/测试/trunk-stable-write-integration.test.ts` 替代；门禁 oracle compare 不可复跑（源码锚点已删）以探针复验；编排全量 post-test 抖动在 E3 留意；门禁/runtime-core 全量留 E3。
- **回滚方式**：开关已删；长期回滚 = Git revert。

## X-R5 verifier（数据门面 + 消费点）

- **目标**：verifier 规格数据迁入模块门面；run-role 空工具声明/acceptance 卡种/默认卡模块化；apply-journal review 前置在 `prepareReviewTask` 产出 `reviewBasisRef` 后调用模块（严格两键 facts；P5 未知键 deny 生效）；验收判定/证据核验仍归独立验收；目标侧 dispatch 不进生产链。
- **门面（门禁引擎）**：verifier 项 `specOf(verifierRoleModule)`；删除 `VERIFIER_CARD_TEXT`/`ROLE_RECOVERY_DISCIPLINE`/`CHIEF_HUB_DISCIPLINE`/`BUILT_IN_ROLE_DIR_PREFIXES`/内联规格；matrix 逐字迁入；差分 **0**（`027563f1…`）。
- **消费点（编排）**：run-role verifier 空声明注入（D1 allow/[]）+ 默认卡/卡种模块化，删除 `TRIO_CARD_KINDS.verifier`；apply-journal `verifierReviewFacts`（`reviewTarget`/`criteria`）与 review 前置（deny→`trunk-item-invalid`）；trunk-runtime 注释核对；无适用路由替换（记录理由）。
- **运行时核心/桌面窗口**：**零改动**（provider 共有能力/`cardKind` 条件/defense-in-depth；桌面 18 处身份/路由/呈现，无合法零差异接线点）。证据 `3cbf2594…`/`6801472b…`。
- **verifier-code**：差分 fixture 金样化（64 项比较、P5 负例保留；29/29）。
- **双跑/三态**：工具/卡种/review 前置 0 差异；三态 A 126/119/5/2 ↔ B 126/119/5/2（3 红=带开关的最终态源码断言）↔ C 126/122/2/2（仅 B0）；typecheck 0。
- **删除清单**：`VERIFIER_CARD_TEXT` 等门面常量、verifier 内联规格、`TRIO_CARD_KINDS.verifier`、临时开关（同批删除，grep 0）。
- **受影响套件**：出口复核 150/146/2（2 红均 B0：direct-role-capabilities、git-capabilities；skip 2 同 B0）；**新增确定性失败 0、新 skip 0**。
- **单元候选**：13 文件合并聚合 `47f6b0749a6bd04ccdc30f1856939b3b0f87141d8f0eeb3e0e65fce3ddbd3e71`（门禁 `9aad0294…`、编排 `88e21fd4…`、verifier-code `c55101d7…`）。
- **证据链接**：门禁 `7c798ccf…`；编排 `7529cfc3…`；运行时核心 `3cbf2594…`；桌面 `6801472b…`；verifier-code `326739a4…`；测试 `ea8c8785…`。
- **缺口处置**：调度侧记录本行已更新；门禁 oracle compare 不可复跑（源码锚点删除）以探针复验；全量套件留 E3；金样 `runRole` 历史值已披露（仅元数据自洽）。
- **回滚方式**：开关已删；长期回滚 = Git revert。

## X-R6 chief（数据门面 + 收口）

- **目标**：chief 规格数据迁入模块门面并完成门面收口（完整 `BuiltInRoleModules` map、删除 D2 投影、matrix 完整、共享残段清理）；run-role chief 工具（6 项含 closeCreatedTask）/默认卡/intent-confirm、apply-journal hub 分支、trunk-runtime hub 路由改读模块；`decidePendingRequest` 保持独立决策上下文；Service 任务身份/账本/工作源证据核验保持。
- **门面（门禁引擎）**：chief 项 `specOf(chiefRoleModule)`；删除 `CHIEF_CARD_TEXT`/内联规格/`SHELL_APPROVAL_CARD_LINE`/`CUSTOMER_CARDIFICATION_PRINCIPLE`/`DIRECT_*`/`STRUCTURED_GIT_DISCIPLINE`/`APP_ONLY_WRITE_PREFIXES`/D2 四符号/私有部分 map；**导出完整 `builtInRoleModules`（六模块同一绑定、冻结）**、`builtInRoleModuleOf` 全六、`BUILT_IN_ROLE_MATRIX` 完整；`resolve-role.ts` 公共再导出；`BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE` 保留「待确认」；差分 8 节 **0 差异**（`3e751261…`）。
- **消费点（编排）**：run-role chief 工具注入（D1 校验）、`canRequestVersionDecision` 发起权、默认卡/intent-confirm 卡数据模块化；apply-journal hub 分支改读 `CHIEF_HUB_DISPATCH`（Service 事务/账本/证据核验保留）；trunk-runtime hub 路由读模块；govern-session 注释更正；`TRIO_CARD_KINDS` 仅剩 product 行（product-code fixture 用，E3 待确认）。
- **运行时核心/桌面窗口**：**零改动**（provider 独立决策上下文/defense-in-depth/loader 实测非重复；桌面 205 处身份/路由/宿主事实/呈现，无合法零差异接线点；hub 目标数据化/version-decision preflight 记为接口评审项）。证据 `a63118f7…`/`522b9e5f…`。
- **chief-code**：差分 fixture 金样化（payload `fb4557b8…`；42/42）。
- **双跑/三态**：工具/卡种/hub/version-decision 发起权 0 差异；三态 A 274/262/10/2↔B 274/262/10/2（3 红=最终态源码断言）↔C 274/265/7/2（仅 B0）；typecheck 0。
- **删除清单**：门面 chief 卡/规格/共享残段/D2 投影、run-role chief 内联分支、`TRIO_CARD_KINDS.chief`、临时开关（同批删除，grep 0）。
- **受影响套件**：出口复核 42/42（chief）+ 编排 103/102/1（B0）+ 门禁 29/29 + module-graph 5/5 + trunk-runtime 隔离 7/7；**新增确定性失败 0、新 skip 0**。
- **单元候选**：12 文件合并聚合 `9ed75ffa65a705dfc5503d8bcd4f38f331cefc772ba8d130600f9755febf5968`（门禁 `e0a63055…`、编排 `14c34967…`、chief-code `9708b842…`）。
- **证据链接**：门禁 `6e85d384…`；编排 `4b77061d…`；运行时核心 `a63118f7…`；桌面 `522b9e5f…`；chief-code `736e3caa…`；测试 `3c95a1f8…`。
- **缺口处置**：调度侧记录本行已更新；oracle `cards` 节锚点已删（结构后果，模块 cards 逐值相等）；门禁/编排/运行时核心全量套件留 E3；共享工作树在飞改动如实披露。
- **回滚方式**：开关已删；长期回滚 = Git revert。

## E2 汇总（供 E3）

- 全部 7 个单元切换完成；旧实现删除；逐单元差分/回滚/删除/受影响套件/typecheck 证据齐备（见各单元节与 `docs/scheduling/2026-11-07_change-package_runtime-gate-role-modularization.md`）。
- E2 遗留（E3 处置/记录）：完整 T3 全量回归（B1 v1.1 冻结脏基线口径）、D1–D9/E-A10 扫描、最终变更包、B2 独立验收；`BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE`、`TRIO_CARD_KINDS.product` 残留、桌面 hub 目标数据化/version-decision preflight（接口评审项）列「待确认」。
