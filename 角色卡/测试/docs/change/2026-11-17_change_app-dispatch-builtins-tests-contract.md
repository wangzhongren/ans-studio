# 变更记录：app-dispatch/v1 第一步测试批 T1——既有测试契约/断言更新

- 日期：2026-11-17（记录落盘 2026-11-18）
- 角色：ANS 内置「测试」
- 工作树：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\feat-app-dispatch-builtins`
  （分支 `feat/app-dispatch-builtins`，HEAD `caf0acf`；在编排/门禁/桌面三批未提交实现之上继续）
- 权威依据：
  - `docs/planning/2026-11-17_design_app-dispatch-builtins.md`（§2.1 派发权矩阵、§2.3 角色残余职责、
    §三 阶段执行者、§四 任务种类/协议、§6.1/§6.2 能力面与文本、§九 兼容/迁移/Q10）；
  - `角色卡/编排/docs/change/2026-11-17_change_app-dispatch-builtins-foundation.md`（§二 API、§六 待测试批配合点）；
  - `角色卡/门禁引擎/docs/change/2026-11-17_change_app-dispatch-builtins-texts.md`（§1 v3/v2 差异、§4 保留清单、§5.2 待对齐项、§6 预期变更）；
  - `角色卡/桌面窗口/docs/change/2026-11-17_change_app-dispatch-builtins-desktop.md`（§三 协议分流、§四 工具面矩阵、§六 待测试批覆盖点）。
- 范围：**只改既有测试与新增本记录**。未改生产代码、未改其它测试、未 commit/push/CI/tag/main；
  未读 `.env`；未占 9222/9223/9224。
- 本批性质：客户 2026-11-17 授权的**语义变更**（内置任务由应用创建、运营只派项目 worker、幕僚只选流程 +
  按 prompt 呈卡、在飞 fixed-v2.1 与 legacy 逐字保留）。因此以下断言更新是**正当变更**，不是放宽：
  - 凡「目标集清零 / 应用建任务 / 应用直派验收 / 协议分叉 / 新增 select_workflow」⇒ 客户授权语义变更；
  - 凡「任务来源从句」由运营/幕僚改为应用 ⇒ 仅重指（安全语义不变）；
  - legacy / fixed-v2.1 / B9.1 / B13.2 / B14 / B23 / B27 / B28 / B31 / B32 / 三卡纪律等
    **逐字段落断言一律保留**，未删除、未弱化。

## 一、逐文件/逐用例变动与理由

| # | 文件 | 变动 | 理由分类 |
| --- | --- | --- | --- |
| 1 | `test/门禁引擎/role-module-contract.test.ts` | `RoleToolId`/`RoleToolName` 闭集 14→15（追加 `selectWorkflow`/`select_workflow`）；`EXPECTED_ROLE_TOOL_TABLE` 追加第 15 行（allowedRoleIds=["chief"]，非独立决策模式）；计数/唯一性 14→15；新增「select_workflow 不能当 id 查」负例。前 14 项逐项 oracle、越权/重复/空表 fail-closed、`decidePendingRequest` 独立决策断言全部保留 | 客户授权语义（新增工具，设计 §6.1；接口闭集扩展） |
| 2 | `test/门禁引擎/fixed-role-module-surface.test.ts` | ①`fixedCards`：删除「字段缺失 ⇒ 空集」分支，六模块必须提供字段并逐字断言冻结值；②chief `fixedTargetRoleIds`=[]、convener `fixedAllowedBuiltInRoleIds`=[]（必须存在、冻结、无内置目标）；convener 谓词恒 false；③legacy `CHIEF_HUB_DISPATCH` 五内置与 `CONVENER_WORKER_DISPATCH_TARGETS=["verifier"]` 逐字保留；④fixed 摘要断言改为 app-dispatch/v1 正向口径（chief `select_workflow`/`card-prompt`/`chief-dispatch-removed`；convener 只派项目 worker/`worker-dispatch`/`convener-builtin-dispatch-forbidden`；product/rapporteur/nominator 应用任务来源；verifier 应用直派）；⑤G-IR：`RoleToolId` 14→15，`requestReleaseMerge` 零出现断言保留 | 客户授权语义（目标集清零/应用建任务）+ 表面绿洞补强 |
| 3 | `test/门禁引擎/governance-matrix-fixed-view.test.ts` | `fixed 派发视图`用例改为：目标字段必须存在且为 []（不是缺失分支）；旧三条派发行（生产线派发/产线调度请求/独立验收派发）不出现；**正向断言** fixed 角色摘要展示「幕僚只选流程 + 按 prompt 呈卡 / 运营只派项目 worker / 应用建内置任务 / A12 应用直派」，并断言渲染文本含 `select_workflow`、`只派项目 worker`。其余 fixed/legacy 视图、卡种路由、无客户门、只读一致性断言保持不变 | 客户授权语义（视图展示新分工；满足「不得只靠 targets.length===0 分支」） |
| 4 | `test/roles/chief/fixed.test.ts` | `fixedTargetRoleIds` 期望 [convener,verifier]→[]（必须存在/冻结；所有内置目标为 false）；fixed context 内容改为新 token：`固定路径流程选择与驱动`/`select_workflow`/`workflowPath`/`acceptanceStrength`/`workflow.started`/`由应用按流程定义创建并投递`/`运营只派项目 worker`/`chief-dispatch-removed`/`worker-dispatch-required`/`card-prompt`/`promptId`/`card-prompt-mismatch`/`验收强度 = 流程定义参数`；新增旧协议负例（`产线调度`/`stage-request`/`sideEffect=read-only`/`open advance 请求`/`workflowAction:"stop"`/`chief-production-dispatch-forbidden`/`验收强度由你` 必须整体消失）。fixedCards 3 卡、段 id/顺序、legacy 段逐字、`CHIEF_HUB_DISPATCH` 五内置、tools 6 项、G-IR 拒绝 token 扫描保持 | 客户授权语义 + 来源重指（上下文） |
| 5 | `test/roles/convener/convener-fixed.test.ts` | `fixedAllowedBuiltInRoleIds` 期望三项→[]；谓词恒 false（字段必须存在）；fixed context 主题词改为 `只派项目 worker`/`worker-dispatch-required`/`convener-builtin-dispatch-forbidden`/`stage-execution`/`from:"application"` 等，新增旧协议负例（`生产线唯一派发者`/`convener-to-verifier-forbidden`/`stage-request` 整体消失）；B32 仅将来源从句 `stage-request 会话`→`按应用发放的 worker-dispatch 任务派 worker`（其余 RR27 提交语法/返工/不得代提交逐字保留）。B9.1/B23/B27/B28/B13.2/B14/卡预算/legacy 三段/legacy dispatch 断言保持不变 | 客户授权语义（目标集/谓词）+ 仅重指（B32 来源从句） |
| 6 | `test/roles/product/product-fixed.test.ts` | fixed context 来源重指：`任务由应用按流程定义创建`/`stage-execution`/`from:"application"`/`意图确认卡由应用开卡、幕僚呈交`/`task.reported`；新增负例（`运营（convener）派发`/`收到幕僚派发`/`意图确认卡由幕僚呈`/`报告回运营` 必须消失）。fixedCards=[]、B9.1 报告/证据、B13.2 evidence[] 纯路径、legacy 4 段逐字冻结、dispatch/preflight 断言保持不变 | 仅重指 + 客户授权语义（任务来源） |
| 7 | `test/roles/rapporteur/fixed-module.test.ts` | fixed context 主题词改为应用任务来源/A4/A5/B1/`方案确认卡由应用开卡`/`幕僚（chief）按应用 prompt`；新增负例（`运营（convener）`/`方案确认卡由幕僚`/`运营只派` 必须消失）。fixedCards=[decision]、legacy 卡文本 SHA-256/长度/行数冻结、fixed-only 负例（continue-frozen 等）、dispatch/tools/preflight 不变断言保持 | 仅重指 |
| 8 | `test/roles/nominator/nominator-fixed.test.ts` | fixed duty 改为 `由应用按流程定义创建并投递`/`stage-execution`/`from:"application"`/`任命确认卡由应用开卡、幕僚（chief）按应用 prompt 在 A10 呈交`；新增负例（旧运营派发/任命卡由幕僚）。B17「只传 path / 应用按实际字节算 hash」、A7/A8-role.activated 激活纪律、legacy 段引用冻结、tools/cards/preflight 断言保持 | 仅重指 |
| 9 | `test/roles/verifier/verifier-fixed.test.ts` | fixed context 增加 `应用直派`/`由应用按流程定义直接创建并投递`/`不经运营、不经幕僚`/`与运营生产派发相互独立`/`select_workflow`/`acceptanceStrength:"light"|"standard"`/`task.reported`；新增负例（`幕僚直派`/`运营（convener）派` 必须消失）。legacy context JSON SHA-256 冻结、legacy 卡文本/边界/dispatch、fixedCards=[]、无 release 工具断言保持 | 客户授权语义（A12 应用直派）+ 仅重指 |
| 10 | `test/编排/doc-format-specs.test.ts` | TM-5 `SCHEMA_WHITELIST` 登记 4 个应用内部字面量：`ans-workflow-definition/v1`、`ans-workflow-definitions/v1`（流程定义单定义/注册表 JSON Schema id，`workflow-definitions.ts` 导出）、`app-dispatch/v1`（`workflow.started.protocol` 协议标识）、`chief-workflow/v3`（app-dispatch/v1 注入的 Chief 资源版本）。理由均为「应用内部契约/协议/资源元数据，非目标项目文档格式」。扫描逻辑、覆盖指定字面量断言、白名单理由非空断言不变；TM-8 等其它用例不动 | 设计 §九/TM-5 要求登记（基线条目曾为 known-red；`chief-workflow/v3` 为实际扫描新增项，任务单列 3 项之外的必要补充） |
| 11 | `test/桌面应用/b71-fixed-fail-closed.test.ts` | contract_check fixed 用例拆为两套：①**无 workflow 新项目聊天 = app-dispatch/v1**：断言新 run 行（应用流程驱动/select_workflow）、`chief-dispatch-removed`/`worker-dispatch-required`/`convener-builtin-dispatch-forbidden`/`promptId`、新 taskKind（stage-execution/worker-dispatch/card-prompt）与 select_workflow 必填、4 KiB 截断、topic 早退；并断言旧 `taskKind:"stage-request"` 串不出现。②**fixed-v2.1 在飞**（seed 无 protocol 的 `workflow.started`）：旧 run 行、旧 stage-request 必填串、旧四个拒绝码**逐字保留**，且新协议码不混入。③legacy/single 用例逐字不动；第 1–3 节 fixed 聊天 fail-closed/路由用例不动 | 客户授权语义（协议分叉）+ 在飞兼容逐字保留 |
| 12 | `test/编排/run-role-fixed-b2.test.ts` | ②资源注入按协议分叉：缺省（fixed-v2.1）仍断言 v2 版本行/身份/SHA-256/bytes 与磁盘一致；新增 app-dispatch/v1 用例断言 v3 版本行/身份/SHA-256/bytes、不注入 v2，工具面：`dispatch_task` 不注入、`select_workflow` 注入同一引用、fixed `close_created_task` 不注入；fixed-v2.1 下 `dispatch_task` 照常注入、`select_workflow` 不注入。fixed context 注入 token 改为 `固定路径流程选择与驱动`。⑦governance_matrix fixed 断言改为 `select_workflow`/`card-prompt`/`worker-dispatch` 正向口径并断言无 `stage-request`；legacy 侧不变。①②（cardKindsOf）、③（Git/VCA/stable 不注入）、④（close 绑定身份/默认 closeTask）、⑤（activate 绑定）、⑥（legacy 注入面）断言保持 | 客户授权语义（协议分流/工具面收窄）+ 仅重指（fixed context token） |

### 1.1 表面绿洞补强（重点）

- **移除字段不再自动绿**：`fixed-role-module-surface.test.ts` 与 `governance-matrix-fixed-view.test.ts` 删除
  「`fixedCards`/`fixedTargetRoleIds`/`fixedAllowedBuiltInRoleIds`/谓词 === undefined ⇒ 断言 undefined」的
  双态分支；改为**字段必须存在**（存在性断言）+ 冻结/清零值断言。字段被删除、改名或退回旧值都会变红。
- **旧句删除后的子串假绿**：chief/convener/product/rapporteur/nominator/verifier 六个 fixed 测试均新增
  旧协议整句负例（如 `stage-request`、`生产线唯一派发者`、`chief-production-dispatch-forbidden`、
  `运营（convener）派发`、`幕僚直派`、`任命确认卡由幕僚` 等），防止「只删一个词、其余子串仍命中」。
- **不得只靠空分支撑**：governance-matrix fixed 派发视图在目标集为空之外，正向断言六角色 fixed 摘要与渲染
  文本包含新分工（应用建内置任务/运营只派 worker/幕僚只选流程+呈卡），并断言三条旧派发行整体消失。
- **协议分叉不得互相假绿**：b71 的 app-dispatch 与 fixed-v2.1 两套用例分别断言「本协议文案存在 + 对方协议
  关键串不存在」（新协议码 vs 旧 stage-request 串双向负例）。

### 1.2 保持不动（逐字冻结）清单

- legacy 断言：`test/编排/workflow-preconditions.test.ts`、`test/桌面应用/star-routing.test.ts`、roles 各
  `*-differential.test.ts`、`convener-module-consumption` 等**未改**；
- fixed-v2.1 在飞：v2 资源字节/SHA-256、card_check 旧文案、`dispatch_task`/`close_created_task` 旧工具面、
  v2 旧稳定码（b71 新用例与 run-role-fixed-b2 缺省用例逐字断言）；
- 安全语义段：B9.1/B13.2/B14/B23/B27/B28/B31/B32 断言逐字保留（仅 B32 的来源从句重指）；
- legacy 冻结常量：`CHIEF_HUB_DISPATCH.targetRoleIds` 五内置、`CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds=["verifier"]`；
- 三张确认卡/merge-main 客户本人/judge 不可代批/不新增客户门/只读矩阵等断言保留。

## 二、验证输出

### 2.1 `npm run typecheck`

- T1 写区 12 文件单独 typecheck（临时 tsconfig 仅 include 本批文件，root `tsconfig.json` 同选项）：
  **exit 0，0 error**（含 `RoleToolId`/`RoleToolName` 15 项类型钉）。
- 根 `npm run typecheck`（全仓）运行时刻存在**并行测试批的在飞文件**类型错误（非本批文件，未触碰）：
  - `test/编排/app-dispatch-definitions.test.ts(182,16): TS7053`（未跟踪新文件）；
  - `test/编排/app-dispatch-service.test.ts(610,40): TS2339`（未跟踪新文件）；
  - `test/测试/fixed-path-full-chain.test.ts(633,5): TS2322`（tracked，09:24 被并行会话修改中新增 app-dispatch 全链用例；
    `cardKind: string` 未窄化为 `GovernanceCardKind`）。
  本批 12 文件无任何错误。同批另有 3 个并行未跟踪测试文件（`test/桌面应用/app-dispatch-delivery.test.ts`、
  `test/桌面应用/app-dispatch-tool-surface.test.ts`、`test/门禁引擎/chief-workflow-v3-resource.test.ts`）类型干净。
  已在回报中披露；待并行批完成后全仓应为 0（本批末次 T1-only tsc exit 0）。

### 2.2 指定测试文件（`node --test --test-concurrency=1`，逐个运行）

| 测试文件 | tests / pass / fail |
| --- | --- |
| `test/门禁引擎/role-module-contract.test.ts` | 20 / 20 / 0 |
| `test/门禁引擎/fixed-role-module-surface.test.ts` | 7 / 7 / 0 |
| `test/门禁引擎/governance-matrix-fixed-view.test.ts` | 6 / 6 / 0 |
| `test/roles/chief/fixed.test.ts` | 8 / 8 / 0 |
| `test/roles/convener/convener-fixed.test.ts` | 16 / 16 / 0 |
| `test/roles/product/product-fixed.test.ts` | 12 / 12 / 0 |
| `test/roles/rapporteur/fixed-module.test.ts` | 8 / 8 / 0 |
| `test/roles/nominator/nominator-fixed.test.ts` | 8 / 8 / 0 |
| `test/roles/verifier/verifier-fixed.test.ts` | 7 / 7 / 0 |
| `test/编排/doc-format-specs.test.ts` | 26 / 26 / 0 |
| `test/桌面应用/b71-fixed-fail-closed.test.ts` | 8 / 8 / 0 |
| `test/编排/run-role-fixed-b2.test.ts` | 12 / 12 / 0 |
| `test/门禁引擎/chief-workflow-v2-resource.test.ts` | 3 / 3 / 0 |
| `test/门禁引擎/dispatch-matrix-mode.test.ts` | 4 / 4 / 0 |
| `test/门禁引擎/convener-workflow-write.test.ts` | 4 / 4 / 0 |
| `test/编排/workflow-dispatch-fixed.test.ts` | 9 / 9 / 0 |
| **合计** | **158 / 158 / 0** |

### 2.3 目录级复跑

- `test/roles/**`：**285 / 283 / 2**。仅 2 项既有 CRLF 环境差异：
  `差分：契约冻结文件哈希（E0.3 067e3d2e…，差分输入未漂移）`×2（原始工作树 CRLF 字节 vs LF 归一常量；
  与本批改动无关，门禁批记录 §6.5 同口径）。chief/product/rapporteur/nominator/convener/verifier
  differential 与 fixed 测试其余全绿。
- `test/门禁引擎/**`：**577 / 565 / 11 / 1 skipped**。11 项 = 9 项既有 CRLF 资源字节差异
  （B7.1 A1/冻结、B9.1 A1/冻结、B9.2 A1/冻结与资源事实、B32.1/B32.2、B34、Chief资源正文独立）
  + 2 项 `listProject`（`caf0acf` 的 `角色卡/策划/` 目录缺 role-card.md 产生额外 warning，见 §三）。
  无本批文件新增失败；基线（本批前）为 15 fail，修复后 11。
- `test/runtime-core/**`：**607 / 603 / 0 / 4 skipped**——0 fail（本批未改该目录；33 名冻结 known-red
  在 R8 基线已登记 REMOVED/已修，本批复跑无回归）。
- `test/编排/**`：见 §四（含并行未跟踪新文件的分类）。

## 三、known-red 核对

三套冻结名单（canonical；本工作树内可用副本）：
- runtime-core 33：`角色卡/测试/docs/change/2026-11-10_B5_two-fixed-workflow-paths_evidence/ref-knownred-runtime-core-33.txt`
  （33 名；canonical TAP 为 B0 基线 §4 所列 `角色卡/运行时核心/docs/change/2026-11-12_release-blocker-83-provider_evidence/14b-knownred-runtime-core.tap`）
- gates 5：`角色卡/运行时核心/docs/change/2026-11-10_B2_two-fixed-workflow-paths-evidence/07-gates-failure-names.txt`
- orchestration 24：`角色卡/编排/docs/change/2026-11-11_B17_two-fixed-workflow-paths_evidence/b17-05-known-red-failnames.txt`

| 套件 | 结果 | 核对 |
| --- | --- | --- |
| runtime-core 33 | 607 tests / 0 fail | 冻结名**未改名、未删除、未新增红**；33 名在 R8 基线已 REMOVED（全绿），本批未触碰该目录 |
| gates 5 | 577 / 11 fail | 5 名**全部仍在且未改名**：其中 3 名已绿（D-10、卡文本：运营负责落盘工作流、渲染过滤）；2 名 `listProject` 仍红，原因为 `caf0acf` 设计提交把策划记录放在 `角色卡/策划/docs/planning/…`，`角色卡/策划/` 被 listProject 当角色目录枚举且缺 `role-card.md`，多出 `角色卡/策划：缺少 role-card.md，已跳过` warning（门禁批在工作树未跟踪阶段已记录同因；提交后该目录已入 HEAD）。非本批编辑、非代码回归、未改名/未放宽；处置需协调方/角色卡属主（补 role-card.md 或把记录移出角色扫描根），测试批不得改冻结断言。其余 9 红为已披露 CRLF 环境差异 |
| orchestration 24 | 1413 / 1411 / **0** / 2 skipped | 24/24 冻结名**按名字逐项复跑为 pass**（未改名/未删除）：本批改动触及的只有 **TM-5**（`doc-format-specs.test.ts`），登记应用内部字面量后由红转绿；其余 23 名在本分支已绿（R8 后续修复生效），本批未回退。属「既有失败消失」已解释（§一#10）。运行含并行会话新增的 2 个未跟踪 test/编排 文件（其运行时用例全过；类型错误见 §五） |

- 本批**未改名、未放宽、未删除**任何冻结 known-red 测试名；三套名单文件未改。
- 「应绿而红」的唯一例外为 gates 的 2 个 `listProject`：`caf0acf` 的 `角色卡/策划/docs/planning/`
  记录使 `角色卡/策划/` 成为缺 `role-card.md` 的角色目录（listProject/role-group-metadata 的 warning
  快照多一项）。非本批编辑、非代码回归；需协调方/角色卡属主处置（补卡或移出扫描根），
  测试批不得通过改这两个冻结用例的期望来「修绿」。

## 四、orchestration 目录复跑

- `test/编排/**`（`node --test --test-concurrency=1`）：**1413 tests / 1411 pass / 0 fail / 2 skipped**。
- 冻结 24 名核对：24/24 均以**原名**出现在通过清单（`✔ <name>`），无改名、无删除、无红；
  本批仅将 TM-5（`doc-format-specs.test.ts`）按设计登记字面量后的失败转为通过（理由见 §一#10）。
- 计数高于旧基线（1373/1378）的原因：本分支测试增长 + 运行时刻工作树内并行会话新增的 2 个未跟踪
  `test/编排/app-dispatch-*.test.ts`（运行时用例通过；其类型错误见 §五）。
- runtime-core 冻结 33 名同样以原名出现在 runtime-core 复跑的通过清单（33/33，0 fail）；
  gates 冻结 5 名均存在（3 pass / 2 fail，见 §三）。

## 五、披露与生产实现疑点（本批未改）

1. **Service fixed 路由文案仍为旧协议**：`src/service/governance-matrix/impl/routing.ts` 的
   `FIXED_PATH_APP_ROUTING_RULES` 备注仍写「convener 派 product 撰写意图」「convener 派 rapporteur」；
   与同视图 fixed 角色摘要（应用建内置任务）不一致。门禁批记录 §5.2-3 已登记该点由服务/桌面批补充；
   本批测试只断言角色摘要与请求行，不掩盖该陈旧文案。建议后续批次更新服务展示（非判定面）。
2. **TM-5 白名单实际需要 4 个字面量**：任务单列了 3 个（`ans-workflow-definition/v1`、
   `ans-workflow-definitions/v1`、`app-dispatch/v1`）；实际扫描还发现 `chief-workflow/v3`
   （run-role app-dispatch/v1 资源版本），已按同一「应用内部资源元数据」理由登记，否则 TM-5 不能全绿。
   如协调方要求严格只登记 3 项，需先移除 src 中的 v3 字面量引用（不建议）。
3. **并行测试批在飞文件**：本批期间其它会话新增 5 个未跟踪测试文件
   （`test/编排/app-dispatch-definitions.test.ts`、`test/编排/app-dispatch-service.test.ts`、
   `test/桌面应用/app-dispatch-delivery.test.ts`、`test/桌面应用/app-dispatch-tool-surface.test.ts`、
   `test/门禁引擎/chief-workflow-v3-resource.test.ts`），并修改 `test/测试/fixed-path-full-chain.test.ts`
   增加 app-dispatch 全链用例（09:24 仍在写）。其中 3 处当前存在类型错误（见 §2.1）。
   本批未改、未纳入写区；根 typecheck 全绿需并行批完成。
4. **fixed 矩阵 render 的 `stage-request` 负断言**：当前 fixed 路由无派发行、摘要无 stage-request，
   断言成立；若后续服务批按新协议新增展示行，应同步扩展本断言（而不是删除负例）。
5. **run-role v3 loader 错误前缀**：桌面批记录提到前缀由 `chief-workflow-v2-resource-unavailable` 改为
   `chief-workflow-resource-unavailable`；本批检索既有测试无逐字断言旧前缀者，未发现需改用例。
6. 本批未运行 Electron/真实模型/真实全链；b71 用假会话，run-role-fixed-b2 用假适配器；未占用端口。

*本记录供协调方/客户核对实施对照；不构成合并/发布授权。*
