# 团队计划：运行时派发门证据修复 + 产品内置角色代码模块化（8 个开发侧代码维护角色）

- **任务 ID**：`2026-11-07-runtime-gate-role-modularization`
- **产品 flowId**：`runtime-gate-role-modularization`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立固定上下文）
- **日期**：2026-11-07
- **状态**：团队计划已写盘。闸门 1/2 与实施授权按客户预授权记录视为已覆盖（`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`，当前 38 行 / SHA-256 `e2bdd96b19a2b58b190ea4bdeb6dc647b97139b5bf22cabcfa05dd7496d9011a`；含「全权委托」节，**发布/tag 除外**）；正式闸门记录（版本/哈希/客户原话）由沟通在 `docs/communication/` 留痕，本上下文不写。**未派发、未实施、未改代码/测试/角色卡/边界/方案/沟通记录/验收文档。**
- **唯一实施基线（方案）**：`docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md` **P1.6**（1242 行 / 160852 bytes / SHA-256 `241502075ff57d6534d7b2c807a2726f1a4c261381e3b0f968b6be468c64e9ce`，写本计划前实测一致）。本计划不扩大、不改变方案口径；实施超出 P1.6 或本计划写集须停止并回报统筹。
- **独立复核**：`docs/planning/2026-11-07_review_runtime-tool-surface-dispatch-gate.md`（305 行 / 66050 bytes / SHA-256 `59b2c81c0bbb306dac0cf68911eb9ae0158e4551924554e05e83b165dae77762`；完整复核 P1 + 窄复核 P1.1/P1.2/P1.3/P1.5；最终结论「建议提交客户确认」）。
- **意图与决定**：`docs/communication/2026-11-07_intent_runtime-tool-surface-gate.md`（当前 80 行 / SHA-256 `dd5c7b1e82be9a8722beee666d5ac5306677fd597aa0f08b3629a90727f96867`；方案头部引用 68 行 / `779a4249…` 为早期快照，当前文件含「客户闸门 1 前决定」节与尾部空行；两版本的决定内容与 P1.6 引用一致，本计划以当前文件只读核对）。含客户全部决定：shell 全运行时、允许已配置外来 MCP、契约冻结后 8 角色并行开发、死代码清理、8 角色结构（开发侧 worker ≠ 产品内置角色）。
- **授权**：`docs/communication/2026-11-07_authorization_trunk-verify-gate-fix.md`（修复后真实 Claude 重跑并如实报告）；T1 Claude schema 窄修复独立在飞、**不并入本变更**。
- **风险档位**：**T3**（P1.6 §10；共享运行时契约 + 派发门治理语义 + 角色结构/模块化 + 新增共享根；不压档）。
- **记录性质**：本文件是统筹团队计划，不是 `task_ops` 机器状态。本检出无 `.ans/project.json`（未启用 task_ops）；不伪造任务令牌、锁、审批或机器预检记录；证据以文件哈希、原始命令输出与独立验收结论为准。
- **基线（写本计划时实测）**：worktree `.claude/worktrees/trunk-amendment`，分支 `feat/plan-escalation-card`，HEAD `e71501cae7fc563b63c63944d45d0d3114ec18a5`；工作树含 T1 窄修复未提交差异（`src/common/claude-adapter/schema.ts`、`test/claude-adapter/session.test.ts`）与各角色 memo 修改、未跟踪管理文档/临时脚本。**T1 差异只读，不在本变更任何写集**；派发实施前由统筹核对工作树是否仍有同文件占用（§9.3）。
- **文件面基线**：`src/common/gates/`、`src/common/roles/` **当前不存在**（`ls src/common/` 仅 claude-adapter、codex-adapter、pi-adapter、runtime-core、shared、编排、装配、门禁引擎）；`src/common/shared/` 存在（11 项，含 `i18n/`）；`角色卡/项目管理/docs/architecture/shared-components.md` 216 行（现行属主：项目管理）。

---

## 一、任务与基线

### 1.1 目标（按 P1.6，不扩大）

1. **P1 派发门证据修复（最小前置）**：路线 A（Claude/Pi/Codex 诚实应用中介 tool-surface 事实 + 受限 `application-mediated-unknown-native` 证据路径）+ **D-minimal 变体**（§6.5）；Codex 严格路径原条件逐字保留；真实 Claude 最小重跑只承诺「派发受理」，后续门如实报告。
2. **E0 契约冻结**：六角色模块 + 共享模块 + 门控模块的 public API、错误语义、依赖方向、写集分配、行为/测试基线；产出冻结记录。
3. **E1 并行开发**：8 个开发侧代码维护角色上岗，greenfield 开发六角色模块 + 门控模块；共享角色在既有 `src/common/shared/` 上按契约维护/迁移；旧代码冻结。
4. **E2 增量切换**：按模块/门逐个切换；双跑差分 + 回滚演练；切换成功并验证后**立即删除**被替换旧实现（客户硬性要求）；禁止一次性替换。
5. **E3 测试贯穿/终验**：全量回归 + 门禁负例 + 反重复/死代码扫描（D1–D9、E-A10）+ 真实运行证据；独立验收判 B2。

可核对完成标准见 P1.6 §11（P/N、M、R、D、E-A、RR 系列）；正式验收标准由内置独立验收在实施前写盘（§8.1）。

### 1.2 风险档位与验证口径：T3

- 依据 P1.6 §10 与 `docs/acceptance/2026-10-22_acceptance-risk-tier-criteria.md` §4.3.3（治理/权限变更、shared-abstraction change 为 T3）。
- **T3 验证口径**：受影响角色层测试 + 跨角色集成 + **全量适用回归**（`node --test`，`--test-concurrency=1`，按 B0 基线分类 Windows 既有环境失败）+ `npm run typecheck`（必要时 `typecheck:renderer`/`build:renderer`）+ **一次最小真实 Claude 运行**（§8.3）+ 真实运行原始证据。升档不降档；证据不足按 `insufficient evidence` 记录。

### 1.3 本轮非目标（不得顺手扩大）

- 不放宽任何写/发布门（`inspectInitializationProtection`、交付、stable-write、run-stop 保持 Codex strict `observed`）；unknown 不冒充 observed。
- 不建 DSL/工作流引擎；角色模块只是 TypeScript 数据与纯策略函数。
- 不扩张产品内置六角色；八个新角色是 `角色卡/` 下的开发侧 worker。
- 不新增客户卡；接口变更走内部接口评审。
- 不把 T1 schema 修复并入本变更候选。
- 不改 I6 H01–H11/旧 A/J 冻结标准；新基线只写「运行时派发门与角色模块化 B1」。
- 不一次性替换原代码；不做先复制后清理。
- 不改 `package.json`/构建配置/发布配方；不提交、不推送、不合并、不发布（预授权仅覆盖本变更范围内开发过程；发布/tag 不在委托内）。

### 1.4 本轮不做（统筹能力边界）

- 本上下文不实施、不派发开发（派发待人事写卡后另行启动）、不判独立验收、不写角色卡/边界/方案/产品代码/测试。

---

## 二、闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-11-07） | `docs/communication/2026-11-07_intent_runtime-tool-surface-gate.md`（`dd5c7b1e…`） |
| 闸门 1：方案确认 | **预授权视为已覆盖**（P1.6 为唯一实施基线） | `2026-11-07_preauthorization_proceed-without-gates.md` §解读 3；正式确认记录由沟通留痕 |
| 闸门 2：角色指派/写集/边界变更 | **预授权视为已覆盖**（对本计划版本）；正式闸门记录由沟通在 `docs/communication/` 留痕 | 同上 |
| 客户实施授权 | **预授权视为已给出**（P1 修复、契约冻结、8 角色并行开发）；发布除外 | 同上 + 「全权委托」节 |
| 实施前验收标准 | 未写盘（由内置独立验收在实施前写 `docs/acceptance/`） | §8.1 |
| 提交/推送/PR/合并 | 本变更范围内已由「全权委托」覆盖；**本计划与写卡阶段不执行** | `2026-11-07_preauthorization_proceed-without-gates.md` |
| 发布/tag | **未授权** | 同上 |

### 2.1 预授权不是免记录

- 按预授权条件：「方案与团队计划的版本/哈希、复核记录、角色卡清单均需在沟通记录留痕」。**沟通须在本计划写盘后，把本计划版本（路径/行数/SHA-256）与 P1.6 版本写入 `docs/communication/` 闸门记录**；未留痕前人事不得把本计划当作已确认对象（人事只核对记录是否存在且覆盖本计划版本）。
- 实质变化（范围、角色结构、治理语义、风险档位）或无法解决的障碍 → 停止并回报客户，不伪造成功。

### 2.2 已确认决定（不重开）

| 决定 | 内容 | 出处 |
| --- | --- | --- |
| 受控 shell | 对所有运行时可用；只证明调用来源，不证明效果闭包；Codex 严格路径因 shell 给 unknown 时走应用中介路径；写/发布门不变 | 意图记录「客户闸门 1 前决定」Q2；P1.6 §5.3 |
| 外来 MCP | Claude/Pi 允许已配置外来 MCP（精确枚举、registry 一致）；**Codex chat 传输不支持，配置即 fail-closed**（客户可见限制） | 意图 Q3；P1.6 §4.6/§13.3 F19 |
| 实施策略 | 先定义/冻结公共契约 → 8 角色并行开发 → 影子/双轨 + 增量切换 → 测试贯穿；拒绝一次性替换 | 意图记录 2026-11-07 追加；P1.6 §2.6/§9 |
| 死代码清理 | 逐模块切换即删除被替换旧实现；终验扫描 + 构建 + 全量测试；只清理本变更导致的死代码，不确定项「待确认」不盲删 | 意图记录；P1.6 §8.6/D9/E-A10/Q18 |
| 团队结构 | 新增 8 个开发侧代码维护角色（6 角色模块 + 1 共享 + 1 门控）；产品内置六角色不变 | 意图记录「团队结构决定」 |

### 2.3 版本纪律

- P1.6（`24150207…`）是唯一实施与验收基线；实施角色按 P1.6 的符号名与文本锚点施工（P1.6 行号对应 HEAD `e71501c` 快照）。
- 实施中发现需要改变方案口径（门禁语义、证据路径、写集归属、阶段顺序、角色数量）→ 停止并回报统筹，按流程重开对应闸门；不得自行变更。

---

## 三、五维判断与决策表（任务项 1）

### 3.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **8 个持续独立责任成立**：每个角色模块有独立变化原因（该内置角色的卡文本/能力/派发/报告/动作前置）与独立契约面；共享模块（跨角色协议/原语）与门控模块（运行时准入判定）分别有独立的变更原因与接口评审职责。客户已明确要求该结构 | P1.6 §6.3/§7.1/§7.4；意图记录「团队结构决定」 |
| 2. 范围归属 | **两个新共享根无现有 owner**：`src/common/roles/`、`src/common/gates/` 不在任何现有角色 Section 1；`src/common/shared/` 现属项目管理（P1.6 F5/F8 已披露）。现有引擎文件（run-role/trunk-runtime/session.ts/apply-journal/desktop/三适配器）均有 owner，不移交 | 实测 `ls src/common/`；各角色 `boundary.md` 核对（§3.6） |
| 3. 契约影响 | **有，且是本变更的核心**：新增角色模块契约（Model 公开类型）、共享模块契约、门控模块契约；唯一 primary owner 分别为：E0 期 Model 契约=门禁引擎（`src/model/role.ts` 扩展）、共享 API=共享代码维护角色、门 API=门控代码维护角色、运行时证据类型=运行时核心。契约先冻结（E0）再消费（E1/E2） | P1.6 §6.2/§6.4/§9.1；§3.6 |
| 4. 证据独立性 | **满足**：测试角色保留跨角色集成/T3 全量；八个维护角色只跑自己模块测试，不自验；内置独立验收按实施前 B1 判 B2；统筹不改验收结论 | P1.6 §11/§12；本计划 §八 |
| 5. 协调成本 | **新增 8 角色成本高但客户已指定且并行收益最大**；缓解手段：E0 契约冻结先行、写集零重叠、角色模块间零 import、共享/门控单一 owner、接口评审不引入客户卡、逐模块切换（禁止大爆炸）。**不新增**额外架构/评审角色 | P1.6 §6.8/§8.4/§9；本计划 §7.7 |

### 3.2 逐角色判断

| 角色 | 判断 | 依据（五维要点） |
| --- | --- | --- |
| 运行时核心 | **保留**；增加「运行时证据契约 owner」职责（应用中介事实类型/包装层组合）；不拆分 Model/证据生产 | 证据 owner 原则；P1.6 §7.5 |
| 编排 | **保留、职责收窄**：角色策略外移后为引擎/装配/调用；P1 期间持有 D-minimal 门谓词；E2 改调门控模块；不拆会话编排与派发编排 | 同一会话生命周期；避免 god-file |
| 桌面窗口 | **保留**：host 事实与路由保留；E2 起角色策略改读模块（经 Pipeline public handle） | host 证据独立；P1.6 §6.5 |
| 桌面UI | **保留**：只消费模块数据渲染 | 无判定职责 |
| 门禁引擎 | **保留、职责收窄**：写/边界判定、Model boundary/role/decision；`governance-roles.ts` 变门面/装配，角色数据迁出；E0 扩展 `src/model/role.ts` 公开角色模块契约类型 | 写门 vs 准入门分离；Model 主属主 |
| Claude/Codex/Pi 适配器 | **保留**：各自新增/维护应用中介事实方法；不拆不并 | 证据 owner 原则 |
| 测试 | **保留**：跨角色回归/联调；B0 基线；E3 T3 全量；不并入 8 个维护角色 | 证据独立性 |
| 装配 | **保留**；本变更预期不参与实施（不改入口/构建/依赖；模块图扫描用仓内脚本 + `test/gates/` 测试，不新增 devDependency）。若实施中确需 `package.json`/脚本/构建变更，停止并回报 | 构建/入口职责 |
| 项目管理 | **保留、职责收窄（S2）**：移交 `src/common/shared/`、`test/项目管理/shared/`、共享组件目录；保留项目规则/架构/设计/会议/协调/`docs/scheduling/`（task_ops 路径） | 客户 8 角色结构；S2 单一 owner |
| 现有「产品」worker | **保留**；与新「产品代码维护（开发侧 worker）」**不合并**，命名与写集区分（产品 worker 不写代码；product-code 写角色模块代码） | 责任不同；P1.6 §7.5 |
| 独立验收（内置） | **保留**：B1 标准 + B2 判定；不承担维护职责 | 独立性 |
| UIUX设计师/宣传/桌面应用（归档） | 不受影响 | — |

### 3.3 决策表结果

**新增 8 个角色 + 改边界（现有 1 个角色收窄/移交 + 8 张新卡）+ 现有角色职责收窄说明（编排/门禁引擎/项目管理，随卡片由人事落实）。** 无拆分、无合并、无角色 id/显示名变更（现有角色）。

- 新增角色：`chief-code`、`product-code`、`rapporteur-code`、`nominator-code`、`convener-code`、`verifier-code`、`shared-code`、`gates-code`（§四）。
- 边界变更：8 张新卡（含 YAML 副本）+ 项目管理边界移除共享路径与共享组件目录 + 项目管理/门禁引擎/编排角色卡职责收窄措辞（人事执行，§5.4）。
- 新共享根：`src/common/roles/`、`src/common/gates/` 由对应新角色取得 Section 1；`src/common/shared/` 由项目管理移交共享代码维护角色（§六）。
- 不新增客户卡；接口评审为内部流程（§4.6）。

### 3.4 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 8 个开发侧代码维护角色（客户指定结构）+ 现有角色收窄 | **采用** | 客户已决定；模块 owner 单一、写集零重叠、并行收益最大 |
| B. 共享代码由项目管理兼任（S1） | 否决（客户方向 + 五维） | 客户要求共享代码单独角色；PM 已承担项目规则/架构/协调，接口评议会成瓶颈；S2 单一 owner 更清晰 |
| C. 由现有 owner 在 P2 重构后再把模块交给新角色 | 否决 | 客户已改为「契约冻结后并行开发」；旧顺序被取代（P1.6 §2.6/Q16） |
| D. P1 直接以 `src/common/gates/` 门控模块实现（Q16 选项 b） | 不采用（保留为备选） | 需先完成 E0 门控契约并把真实重跑推迟到契约冻结后；且 P1 需要最少的治理面（§6.5）。若客户/统筹改选，需修订计划后再派发 |
| E. P1 使用临时 owner 写 `src/common/gates/` | 否决 | 需在 E0 前给人事加临时 Section 1，与「新共享根修订前不获授权」冲突且增加治理往返；D-minimal 消除该需求 |
| F. 中文 roleId（如「幕僚代码维护」） | 不采用（建议英文短名） | 任务与沟通采用英文短名便于区分内置六角色（`chief` vs `chief-code`）；目录名即 roleId，显示名用中文。若人事按仓库惯例改中文目录，写集不变 |
| G. 共享组件目录保留在 `角色卡/项目管理/docs/architecture/` | 否决 | `shared-code` 不能写其他角色目录内的文件（module-boundary「禁止跨角色目录文件授权」）；须迁至 shared-code 自己的角色目录（§6.4） |
| H. 一次性替换原代码（客户原话字面） | 否决 | 治理代码耦合深、无法逐项证明等价、回滚困难；客户已接受 E'（P1.6 §2.6/Q16/E-A9） |

### 3.5 协调成本与关键排序（结论）

- **契约先行**：E0 冻结后 E1 才启动；P1 的运行时/适配器契约（A 路径证据字段）可在 E0 前先行冻结（与 E0 契约设计并行，不冲突）。
- **单一 owner**：共享代码只由 shared-code 写；门控代码只由 gates-code 写；六角色模块只由各自角色写；引擎文件只由现有 owner 写。
- **零重叠**：八个新角色的模块目录、测试目录、角色文档目录两两不相交；角色模块之间零 import；门控不 import 角色；共享不 import 门/角色。
- **串行点**：P1 真实重跑早于大规模切换（E-A7）；每模块切换以等价证据 + 回滚演练为门；切换与删除同批完成。

### 3.6 Section 1 覆盖图（写计划时核对）

> 依据各角色权威 `boundary.md`（`boundary.yaml` 为同步副本）。未列路径默认只读。

| 路径/路径根 | 现 owner | 本变更写入方（计划） | 说明 |
| --- | --- | --- | --- |
| `src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/provider/runtime/{tools,schema}.ts`、`src/common/runtime-core/`、`test/runtime-core/` | 运行时核心（单文件/目录授权） | 运行时核心（P1、E2 消费点） | 应用中介证据类型/包装层；角色条件外移（E2） |
| `src/model/role.ts`、`src/model/{boundary,decision,governance-matrix}.ts`、`src/common/门禁引擎/`、`test/门禁引擎/` | 门禁引擎 | 门禁引擎（E0 契约类型、E2 门面切换） | `governance-roles.ts` 变门面 |
| `src/pipeline/orchestration/trunk-runtime.ts`、`run-role.ts`、`src/common/编排/`、`src/service/trunk/`、`src/service/version-change/`、`test/编排/` | 编排 | 编排（P1 D-minimal、E2 消费点） | 角色策略/门判定外移 |
| `app/desktop/`、`app/main.ts`、`app/preload.cjs`、`test/桌面应用/`（逐文件） | 桌面窗口 | 桌面窗口（E2 消费点） | host 事实不变 |
| `app/renderer/`、`test/桌面UI/` | 桌面UI | 桌面UI（如 UI 需读模块数据；本变更预期少改） | 只消费 |
| `src/provider/claude/session.ts`、`src/common/claude-adapter/`、`test/claude-adapter/` | Claude适配器 | Claude适配器（P1） | 应用中介事实 |
| `src/provider/codex/session.ts`、`src/common/codex-adapter/`、`test/codex-adapter/` | Codex适配器 | Codex适配器（P1） | 应用中介事实（chat-transport） |
| `src/provider/pi/session.ts`、`src/common/pi-adapter/`、`test/pi-adapter/` | Pi适配器 | Pi适配器（P1） | 应用中介事实 |
| `src/common/shared/`、`test/项目管理/shared/`、`角色卡/项目管理/docs/architecture/` | **项目管理** | **移交 shared-code**（§5.4 B-9） | 本变更唯一现有边界收窄/移交 |
| `src/common/roles/` | **无 owner（缺口）** | **六角色各自子目录**（§六） | 新共享根 |
| `src/common/gates/` | **无 owner（缺口）** | **gates-code**（§六） | 新共享根 |
| `test/roles/`、`test/gates/` | **不存在** | 六个角色子目录 / gates-code | 新建测试根 |
| `test/测试/`、`角色卡/测试/docs/` | 测试 | 测试（B0、集成、T3） | — |
| `src/index.ts`、`package.json`、构建/发布配置 | 装配 | **不写**（预期） | 见 §3.2 |
| `docs/scheduling/` | 统筹（内置） | 统筹 | 本计划、冻结记录、切换日志、变更包 |
| `docs/acceptance/` | 内置独立验收 | 内置独立验收 | B1/B2 |
| `docs/planning/` | 策划 | 策划（E0 契约文档） | — |
| `docs/communication/` | 沟通 | 沟通（闸门留痕） | — |

---

## 四、八个开发侧代码维护角色定义（供人事写卡）（任务项 2）

### 4.1 口径与命名

- **口径**：八个角色是 **ans-studio 开发团队（开发侧 worker 角色）扩张**，位于 `角色卡/` 下、由统筹派发、闸门 2 确认、人事写卡；**不是**产品内置角色扩张（内置六角色不变）。
- **roleId（建议英文短名）**：项目角色 id 取自 `角色卡/` 目录名（`resolveRole` 按 `project.roles[roleId]` 解析）。建议目录与 roleId 一致使用英文短名，显示名（卡片标题）用中文；若人事按仓库既有中文目录惯例命名，写集与职责不变，只是 id 变化需在本计划修订中记录。
- **默认组别**：建议 `角色模块维护组`（六角色 + 共享）与 `门控模块维护组`（门控）或统一一个「代码模块维护组」；组别仅分类，不授予派发或继承权限（按技能单角色组默认）。
- **通用纪律**：只写自己模块与测试；引擎文件（`run-role.ts`、`trunk-runtime.ts`、`session.ts`、适配器、桌面）仍由现有 owner 写；接口变更走共享/门控评审；不自行扩写集；不修改自己的角色卡/边界/YAML/changelog（人事维护）；不写其他角色资料、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界。

### 4.2 角色总表

| # | roleId（建议） | 中文名（显示） | 维护模块 | 一句话能力 | 公开入口 | 阶段上岗 |
| --- | --- | --- | --- | --- | --- | --- |
| ① | `chief-code` | 幕僚代码维护角色 | `src/common/roles/chief/` | 维护 chief 角色模块：卡/边界条目/capabilities/工具策略/hub 派发目标/报告期望/上下文/intent-confirm 数据 | `index.ts` | E0 冻结后、E1 前 |
| ② | `product-code` | 产品代码维护角色 | `src/common/roles/product/` | 维护 product 角色模块：卡/能力/VCA 提交前置策略/上下文/报告期望 | `index.ts` | 同上 |
| ③ | `rapporteur-code` | 策划代码维护角色 | `src/common/roles/rapporteur/` | 维护 rapporteur 角色模块：卡/能力/修正案整单/run-change 三模式/decision 卡数据 | `index.ts` | 同上 |
| ④ | `nominator-code` | 人事代码维护角色 | `src/common/roles/nominator/` | 维护 nominator 角色模块：卡/能力/D3/appointment/三文档写卡前置/能力位/appointment-write 卡数据 | `index.ts` | 同上 |
| ⑤ | `convener-code` | 运营代码维护角色 | `src/common/roles/convener/` | 维护 convener 角色模块：卡/能力/worker 派发目标/team plan/git 动作角色侧条件/decision 卡/项目 workflow 引用 | `index.ts` | 同上 |
| ⑥ | `verifier-code` | 质检代码维护角色 | `src/common/roles/verifier/` | 维护 verifier 角色模块：卡/能力/review 目标/CID/criteria/acceptance 卡数据 | `index.ts` | 同上 |
| ⑦ | `shared-code` | 共享代码维护角色 | `src/common/shared/`（既有）+ 共享组件目录 | 维护共享协议/原语、共享 API 评审、消费者影响分析 | 各共享模块既有导出 | 同上 |
| ⑧ | `gates-code` | 门控代码维护角色 | `src/common/gates/`（新建） | 维护派发/准入门控判定模块、门 API、拒绝原因码、门测试矩阵 | `src/common/gates/index.ts` | 同上 |

### 4.3 通用 Section 1 模板（人事写卡）

八个角色的 Section 1 采用同一模板（精确目录 + 测试目录 + 自身工作文档）：

| 类型 | 可操作路径 | 用途 |
| --- | --- | --- |
| 目录（角色模块） | `<模块根>`（见 §4.4） | 本角色唯一维护的模块；模块内可新增/拆分内部文件，**唯一 public entry 为 `index.ts`**，不得在模块根散放文件 |
| 目录（测试） | `<测试根>`（见 §4.4） | 本角色模块单测与夹具；不做跨角色集成（归测试） |
| 单文件 | `角色卡/<roleId>/feature-map.md` | 功能导航（无用户功能时如实说明） |
| 单文件 | `角色卡/<roleId>/memo.md` | 本角色续接线索 |
| 单文件 | `角色卡/<roleId>/functional-description.md` | 实际职责、交接与代码位置 |
| 单文件 | `角色卡/<roleId>/api-spec.md` | 模块 public API 实现报告（真实导出） |
| 目录 | `角色卡/<roleId>/docs/design/` | 设计记录 |
| 目录 | `角色卡/<roleId>/docs/feature/` | 稳定功能说明与流程图 |
| 目录 | `角色卡/<roleId>/docs/change/` | 变更记录与证据 |
| 目录 | `角色卡/<roleId>/docs/fix/` | 修复记录 |

允许新增文件规则：模块目录与测试目录内新增内部文件**不需要**每次改边界（目录授权，模块根除外）；`index.ts` 之外不得被外部直接 import（由 module-graph 扫描核对，D2）；任何跨角色/跨模块新增路径、把私有实现移到模块根、或模块目录之外的新文件，须先由人事更新 Section 1。`shared-code` 额外条目：`角色卡/shared-code/docs/architecture/shared-components.md`（共享组件目录，迁入，§6.4）。

### 4.4 逐角色定义（能力 / 模块边界 / 精确写集 / 依赖与接口 / 测试与验收责任）

> 全部角色只依赖 `src/model/` 与 `src/common/shared/` 的 public entry；不得 import `src/common/门禁引擎/`（私有 common）、`src/pipeline/`、`src/service/`、`src/provider/`、`app/`、门控模块、其他角色模块。纯 TypeScript 数据与纯策略函数：无 I/O、无账本、无会话、无时钟、无随机数；缺事实默认拒绝（fail-closed）；不携带权限（引擎执行全部安全边界）。

#### ① `chief-code`（幕僚代码维护角色）

- **能力**：chief 卡文本/边界条目/capabilities；chief 专属工具策略（roleActivityLog/terminateRoleRun/redispatchTask/projectNote/requestVersionDecision/governance matrix）；hub 派发目标与报告期望；chief 决策上下文与 chief-workflow 资源引用；intent-confirm 卡数据（P1.6 §6.3）。
- **模块边界**：`src/common/roles/chief/`（greenfield）。不进入模块：会话装配、工具执行、账本、任务创建、客户卡渲染（留引擎/共享）。
- **精确写集**：`src/common/roles/chief/`（全部内部文件 + `index.ts`）、`test/roles/chief/`、`角色卡/chief-code/**`（§4.3 模板）。
- **依赖与接口**：依赖 Model/shared public entry；消费者=编排（`run-role.ts` 工具策略）、Service（`apply-journal.ts` hub 派发/报告）、桌面窗口（session 路由/呈现数据）、门禁引擎（`governance-roles.ts` 门面聚合卡/矩阵）。public entry 明确导出 `BuiltInRoleModule`（§6.2/P1.6 §6.2）。
- **测试与验收责任**：模块单测（工具策略/派发目标/报告期望/context 数据）；差分 fixture（旧 `governance-roles.ts`/`run-role.ts`/`apply-journal.ts` 行为 vs 模块输出逐字段一致）；参与阶段 1 门控集成评审（只读）；不判验收。E2 切换单元 R-6 提供等价证据。

#### ② `product-code`（产品代码维护角色）

- **能力**：product 卡/边界/capabilities；版本升级（VCA）提交前置策略；产品上下文；报告期望；卡种（无）。（P1.6 §6.3）
- **模块边界**：`src/common/roles/product/`。不进入模块：VCA Service 事务、schema 校验、trunk apply。
- **精确写集**：`src/common/roles/product/`、`test/roles/product/`、`角色卡/product-code/**`。
- **依赖与接口**：Model/shared；消费者=Service（`src/service/version-change/`、trunk）、编排、桌面。
- **测试与验收责任**：VCA 前置正负例、角色不变性；差分 fixture；E2 单元 R-1。

#### ③ `rapporteur-code`（策划代码维护角色）

- **能力**：rapporteur 卡/边界/capabilities；detail-amendment 整单策略；run-change 三模式选择策略；decision 卡数据；报告期望。（P1.6 §6.3）
- **模块边界**：`src/common/roles/rapporteur/`。不进入模块：VCA/run-change Service、停稳证据、账本。
- **精确写集**：`src/common/roles/rapporteur/`、`test/roles/rapporteur/`、`角色卡/rapporteur-code/**`。
- **依赖与接口**：Model/shared；消费者=Service、桌面。
- **测试与验收责任**：修正案/run-change 正负例、卡种；差分 fixture；E2 单元 R-2。

#### ④ `nominator-code`（人事代码维护角色）

- **能力**：nominator 卡/边界/capabilities；D3/appointment 策略；三文档写卡前置；`install_skill`/`install_mcp` 能力位；appointment-write 卡数据。（P1.6 §6.3）
- **模块边界**：`src/common/roles/nominator/`。不进入模块：resolveWrite、边界解析、stable-write 机制、账本。
- **精确写集**：`src/common/roles/nominator/`、`test/roles/nominator/`、`角色卡/nominator-code/**`。
- **依赖与接口**：Model/shared；消费者=Service（appointment/journals）、桌面、门禁引擎（D3 前置读数据）。
- **测试与验收责任**：D3/写卡正负例、边界不变；差分 fixture；E2 单元 R-3。

#### ⑤ `convener-code`（运营代码维护角色）

- **能力**：convener 卡/边界/capabilities；worker 派发目标/模块规则；team plan 策略；git 动作前置（init/commit/integrate/revert/publish 的角色侧条件）；decision 卡；项目 workflow 资源引用。（P1.6 §6.3）
- **模块边界**：`src/common/roles/convener/`。不进入模块：Git 执行/ACL/证据闭包、Service 事务、桌面路由。
- **精确写集**：`src/common/roles/convener/`、`test/roles/convener/`、`角色卡/convener-code/**`。
- **依赖与接口**：Model/shared；消费者=编排（Git 能力装配）、Service（apply-journal/hub）、桌面。
- **测试与验收责任**：团队计划/派发/Git 动作前置正负例；差分 fixture；E2 单元 R-4。

#### ⑥ `verifier-code`（质检代码维护角色）

- **能力**：verifier 卡/边界/capabilities；review target/最终候选/CID/criteria 策略；acceptance 卡数据；报告期望。（P1.6 §6.3）
- **模块边界**：`src/common/roles/verifier/`。不进入模块：验收判定（独立验收）、Git 候选证据核验、账本。
- **精确写集**：`src/common/roles/verifier/`、`test/roles/verifier/`、`角色卡/verifier-code/**`。
- **依赖与接口**：Model/shared；消费者=Service/桌面（review/acceptance 路由）。
- **测试与验收责任**：review 正负例、独立验收边界不被模块触碰；差分 fixture；E2 单元 R-5。

#### ⑦ `shared-code`（共享代码维护角色）

- **能力**：共享协议/原语（任务-报告-收口、派发授权/预检等共享函数、工具 schema/描述中确属共享者、i18n、账本/审计原语、路径/原子写/诊断）；共享 API 评审（语义/消费者/兼容/测试）；共享组件目录维护与消费者影响分析。（P1.6 §7.2/§8.2）
- **模块边界**：`src/common/shared/`（**既有模块维护/迁移，不是 greenfield 重写**；F26 口径）；共享组件目录；不判定业务门。
- **精确写集**：`src/common/shared/`（全部）、`test/项目管理/shared/`（**由项目管理移交**）、`角色卡/shared-code/docs/architecture/shared-components.md`（**迁入**）、`角色卡/shared-code/**`（§4.3 模板 + `docs/architecture/`）。
- **依赖与接口**：只依赖 Model；被角色/门控/引擎消费。E0 冻结后按契约维护既有共享模块并新增角色模块所需的共享 public entry；共享 API 变更须评审记录 + 消费者影响清单 + 测试（无记录不得合并，D6）。
- **测试与验收责任**：共享行为单测（单源）、消费者契约测试、i18n 计数/parity（如受影响）；接口变更评审记录；`test/项目管理/shared/` 目录与既有测试保持不变（路径历史名，不改名以减少跨角色迁移；若后续改名，另立变更）。
- **共享/门控边界**：不写 `src/common/gates/`、不写角色模块；不从引擎复制实现（DRY，§8.4）。

#### ⑧ `gates-code`（门控代码维护角色）

- **能力**：运行时派发/准入判定模块：dispatch 父门、turn 身份、tool-surface 证据消费（strict observed 路径 + 受限应用中介路径）、activeDispatch/inputAccepted/settled、controller resume 共用 predicate；门 API；拒绝原因码（结构化 reasons）；门测试矩阵（正/负例 + 旧/新差分）。（P1.6 §7.2/§7.4）
- **模块边界**：`src/common/gates/`（greenfield）。**只判定、不采集证据**；不 import 角色模块/Service/Provider/Pipeline；不把写路径/边界判定并入。
- **精确写集**：`src/common/gates/`、`test/gates/`（含 `test/gates/module-graph.test.ts` 静态扫描，用仓内 TypeScript Compiler API，不新增依赖）、`角色卡/gates-code/**`。
- **依赖与接口**：只依赖 Model/shared；被编排（`trunk-runtime.ts`）与 Service 调用。public entry 冻结 `evaluateChiefDispatchParent` 输入/输出与 reason 码。
- **测试与验收责任**：门正负例矩阵（P1.6 §11.1 P/N 系列）、与 P1 D-minimal 内联实现的差分（E2 切换前）、拒绝原因码结构测试；阶段 1 真实重跑配合（只读核对证据链）。

### 4.5 写集互不重叠核对

| 写集 | 唯一 owner | 与其它角色交集 |
| --- | --- | --- |
| `src/common/roles/<六个内置角色 id>/` | 各自 `*-code` | 无（六目录两两不相交） |
| `test/roles/<6>/` | 各自 `*-code` | 无 |
| `src/common/shared/` + `test/项目管理/shared/` | `shared-code`（自项目管理**移交**） | 移交后项目管理不再拥有；不得双 owner |
| `src/common/gates/` + `test/gates/` | `gates-code` | 无（新建） |
| `src/model/role.ts` 等 Model 契约文件 | 门禁引擎 | 新角色只读引用 |
| 引擎文件（run-role/trunk-runtime/session.ts/apply-journal/desktop/适配器） | 现有 owner | 新角色只读 |
| `角色卡/<roleId>/**` | 各新角色自己的文档（不含卡/边界/YAML/changelog） | 卡/边界/YAML/changelog 归人事 |

结论：**八个新角色写集两两不相交；共享与门控各自单一 owner；现有角色只保留引擎写集，不与其模块写集重叠。**

### 4.6 接口治理（无客户卡）

1. 需求方（角色/门控/引擎 owner）提交「共享/门 API 变更提案」（目的、消费者、兼容性、测试、迁移）。
2. 共享 API → `shared-code` 评审并书面批准/拒绝；门 API → `gates-code` 评审；涉及 Model 类型 → 运行时核心/门禁引擎（按文件归属）；涉及证据生产/消费 → 同时经运行时核心/编排/适配器 owner。
3. 角色模块 public entry 变更 → 该角色提出，消费者 owner 确认，共享/门控只评审兼容性。
4. 实施并测试；受影响 owner 更新调用；统筹排期；独立验收按证据判断。
5. 共享组件目录更新；旧实现删除，不留双份。
6. **不新造客户卡**；不把内部评审伪装成客户决定。评审记录写提议角色 `docs/change/`；跨角色排期由统筹记 `docs/scheduling/`。

### 4.7 共享代码维护角色：S1 vs S2

采用 **S2**（新建专职共享代码维护角色），理由：客户已明确要求共享代码由单独角色维护（意图记录）；单一 owner + 接口评审与新角色并行；PM 保留项目规则/架构/协调职责，避免共享 API 评审排队。S1 作为回退备选（若客户改变方向），但会与已确认的 8 角色结构冲突，需重开闸门 2。

---

## 五、现有角色调整与阶段职责（任务项 3）

### 5.1 逐角色调整表

| 角色 | 判断 | 具体调整 | 备注 |
| --- | --- | --- | --- |
| 运行时核心 | 保留（职责增补，不拆分） | 新增「运行时证据契约 owner」职责：`RuntimeApplicationToolSurfaceFacts` 类型/guard、包装层 `applicationMediation` 组合、白名单/阻断集；E2 起把 `provider/runtime/{tools,schema}.ts` 中角色专属条件移出（改读角色模块数据） | P1 实施者之一；模型契约变更影响所有消费方，须评审 |
| 编排 | 保留、收窄 | 角色策略外移（run-role 的 isTrio/能力位/chief 工具/谓词/卡种白名单）；门判定 P1 期间以 D-minimal 唯一纯函数承载、E2 改调门控模块；`src/service/trunk/impl/apply-journal.ts` 的角色条件改读角色模块策略；保留账本/事务/证据核验/会话编排 | 角色卡措辞由人事更新 |
| 桌面窗口 | 保留 | host 事实（`captureChiefDispatchSource` 等）与路由保留；dispatch/review/plan 路由中的角色条件改读模块数据（经 Pipeline public handle）；不复制策略 | E2 消费点；`app/desktop/session.ts` 热点文件单写者 |
| 桌面UI | 保留 | 只消费模块数据渲染；本变更预期仅少量条件改动（如呈现标签），不新增判定 | — |
| 门禁引擎 | 保留、收窄 | 写/边界/`resolveWrite`/shell-rules/Model boundary/role/decision 不变；`governance-roles.ts` 变门面（re-export/装配），六规格数据迁出到角色模块；E0 扩展 `src/model/role.ts` 公开角色模块契约类型 | 角色卡措辞由人事更新 |
| Claude适配器 | 保留 | P1 新增 `inspectApplicationToolSurface()`（实际构造面：tools/allowedTools/mcpServers/WebSearch 计入 nativeBuiltin）；不判定门 | 证据 owner |
| Codex适配器 | 保留 | P1 在 `chat-transport.ts` 新增应用面事实（实际 toolMap；`foreignMcpServers: []`）；native 事实缺失/身份不符不提供应用面事实 | — |
| Pi适配器 | 保留 | P1 新增应用面事实（customTools/allowedSurface/noTools: builtin）；无 observation/bind 不提供（fail-closed） | — |
| 测试 | 保留 | B0 基线；P1 真实重跑执行与原始证据；E1/E2 跨层集成；E3 T3 全量 + D9/E-A10 复核；不并入维护角色 | 独立性 |
| 装配 | 保留；预期不参与 | 不改 `package.json`/入口/构建/发布配方；模块图扫描用仓内脚本 + `test/gates/`，不新增依赖 | 若确需构建/依赖变化，停止回报 |
| 项目管理 | 保留、收窄（S2） | 移交 `src/common/shared/`、`test/项目管理/shared/`、共享组件目录；保留 `docs/project-rules.md`、`docs/architecture.md`、`docs/meetings/`、`docs/design/`、`docs/change/`、`docs/fix/`、`docs/scheduling/`（task_ops 路径）与跨角色协调 | 角色卡与边界由人事更新 |
| 现有「产品」worker | 保留（不合并） | 产品视角提案/评审不变；与 `product-code` 命名、写集区分 | P1.6 §7.5 |
| 独立验收（内置） | 保留 | 写 B1 标准与 B2 报告；不承担维护 | — |
| UIUX设计师/宣传/桌面应用（归档） | 不受影响 | — | — |

### 5.2 E0/E1/E2/E3 各阶段谁做什么

| 角色 | P1 | E0 | E1 | E2 | E3 |
| --- | --- | --- | --- | --- | --- |
| 运行时核心 | 证据契约 + 包装层（P1） | 评审契约（Model 类型/证据消费） | 旧代码冻结；评审接口变更 | 移出角色条件（tools/schema）、重测 | 参与负例矩阵与回归 |
| 三适配器 | 应用面事实（各自） | 评审（可选/只读） | 旧代码冻结 | 无（事实方法保持） | 回归证据 |
| 编排 | D-minimal 门谓词 + 调用点 | 评审 + 冻结门契约输入（D-minimal 行为） | 旧代码冻结；评审接口 | 门控切换；run-role/apply-journal 消费模块 | 负例矩阵回归 |
| 桌面窗口 | 无（只读核对 host 事实） | 评审（宿主事实边界） | 旧代码冻结 | session 路由读模块 | 桌面相关回归（如需） |
| 桌面UI | 无 | 无 | 冻结 | 条件消费 | 渲染回归（如需） |
| 门禁引擎 | 无（`governance-roles.ts` 保持） | **E0 契约类型（`src/model/role.ts`）** + 评审 | 旧代码冻结（governance-roles 保持现状） | 门面切换六角色数据 | 负例/矩阵回归 |
| 测试 | B0 基线；P1 真实重跑；受影响套件 | B0 终态、差分 fixture 清单 | 契约为基线；跨层集成设计 | 每单元切换 gate 复核（差分/回滚证据） | **T3 全量 + D9/E-A10 扫描复核** |
| 六角色 code 角色 | —（未上岗） | 只读参与契约评审（上岗前不写） | **各自模块 greenfield + 测试**（写集见 §4.4） | 各单元提供模块与差分证据 | 回归、修复 |
| shared-code | — | 只读评审 | **接管共享 + 契约维护/迁移** | 共享抽取项切换（如有） | 共享测试/目录更新 |
| gates-code | — | 只读评审 | **门控模块 greenfield + 测试矩阵** | 门控切换（首个单元） | 门禁负例复核 |
| 项目管理 | — | 只读评审 | 移交完成（只读后续） | 只读 | 只读 |
| 装配 | — | — | — | — | 预计不参与 |
| 人事 | —（H1 已完成写卡/边界/修订；P1–E3 不再参与） | — | — | — | — |
| 沟通/统筹 | 组织/记录 | 组织冻结评审、写冻结记录 | 排期/派发/收证 | 切换日志、变更包 | 变更包/放行记录 |
| 内置独立验收 | B1 标准（实施前） | 评审冻结契约可判性 | 按 B1 收集证据 | 每单元切换证据按 B1 核对（可选抽样） | **B2 判定** |

> 人事在 H1 完成 8 卡 + 边界 + YAML + changelog + 项目管理边界收窄 + PM/编排/门禁引擎角色卡职责收窄措辞 + `shared-directories.md` 修订（§6.3）。

### 5.3 切换期职责与交接

- **旧代码冻结（E0 后）**：旧引擎文件只修阻断缺陷、不新增行为/策略/角色逻辑；新逻辑只进新模块（P1.6 §8.6/E-A2）。
- **交接时点**：E1 上岗时，各角色以冻结契约 + B0 基线为输入；E2 每单元切换时，旧实现 owner（编排/门禁引擎/桌面窗口/运行时核心）负责删除被替换代码并交删除清单；角色模块 owner 负责等价证据的模块侧输出。
- **切换期间同一文件单写者**：`governance-roles.ts`（门禁引擎）、`run-role.ts`/`trunk-runtime.ts`/`apply-journal.ts`（编排）、`app/desktop/session.ts`（桌面窗口）、`src/common/shared/**`（shared-code）、`src/common/gates/**`（gates-code）。
- **角色模块 public entry 冻结后变更**：走 §4.6 评审；不因 E2 切换擅自改契约。

### 5.4 治理变更清单（闸门 2 对象，由人事执行）

| # | 角色 | 治理文件 | 变更内容（精确） | 依据 |
| --- | --- | --- | --- | --- |
| B-1～B-8 | 8 个新角色 | 新建 `角色卡/<roleId>/role-card.md` + `boundary.md` + `boundary.yaml` + 角色根 `changelog.md` | Section 1 按 §4.3/§4.4；卡片能力描述、必读资料、交接输入输出、执行原则由人事按本计划补全 | 本计划 §四；闸门 2（预授权覆盖） |
| B-9 | 项目管理 | `角色卡/项目管理/boundary.md` + `boundary.yaml` + `role-card.md` | **移除** `src/common/shared/`、`test/项目管理/shared/` 两个条目（移交 shared-code）；共享组件目录迁出（§6.4）；角色卡职责收窄为项目规则/架构/设计/协调/文档（不再维护共享代码） | S2（§4.7） |
| B-10 | 门禁引擎 | `role-card.md`（职责措辞） | 卡片职责收窄：角色规格数据迁出为门面/装配；Model 契约类型主属保持 | §5.1 |
| B-11 | 编排 | `role-card.md`（职责措辞） | 职责收窄：角色策略外移；门判定 E2 后调用门控模块 | §5.1 |
| B-12 | 人事（内置） | 技能 `references/shared-directories.md`（精确单文件） | 修订内容见 §6.3；项目侧留痕见 §6.3 | Q6/Q8；P1.6 §6.4 |

- 人事执行后须核对：`boundary.md` 与 `boundary.yaml` 一致；无其它未列改动；八个新角色写集两两不重叠、且与现有角色不重叠；按各角色根 `changelog.md` 记录变更与依据（本计划 + 预授权记录）。
- **不改**现有角色 id/显示名；不重写无关角色卡内容；与本变更无关的既有漂移不顺手改。

---

## 六、新共享根与治理修订（任务项 4）

### 6.1 新共享根边界条目（人事新增）

| 根 | 取得角色 | Section 1 条目（精确） | 允许新增文件规则 |
| --- | --- | --- | --- |
| `src/common/roles/` | 六个 `*-code` 角色 | 各角色 `目录（角色模块）src/common/roles/<builtin-id>/` | 模块内可自由增删内部文件；唯一 public entry `index.ts`；模块根不得散放其它文件；不得跨角色 import（D2 扫描） |
| `test/roles/` | 六个 `*-code` 角色 | 各角色 `目录（测试）test/roles/<builtin-id>/` | 测试与夹具；不得放产品代码 |
| `src/common/gates/` | `gates-code` | `目录（门控模块）src/common/gates/` | 内部文件自由；public entry `index.ts`；不 import 角色/引擎（D2） |
| `test/gates/` | `gates-code` | `目录（测试）test/gates/` | 门矩阵 + 模块图扫描测试 |
| `src/common/shared/` | `shared-code`（移交） | `目录（私有→共享资产）src/common/shared/` | 既有模块维护/迁移；接口变更评审（§4.6） |
| `test/项目管理/shared/` | `shared-code`（移交） | `目录（测试）test/项目管理/shared/` | 共享测试单源；路径保持历史名（不改名以减少迁移；改名另立变更） |

- **修订前不获授权**：人事完成上述条目（B-1～B-12）之前，任何角色不得写 `src/common/roles/`、`src/common/gates/`；P1 不需要写这两个根（D-minimal，§6.5）。
- `src/common/roles/` 与 `src/common/gates/` 根目录本身不授予任何角色散放文件的权限；只有各子目录/门控根及其内部文件。

### 6.2 允许新增文件规则（模块内）

- 在已接受目录内新增/拆分/重命名内部文件不需要逐次改边界（module-boundary「Private abstractions」）；但每个模块只有一个 public entry `index.ts`，外部只能经它导入。
- 模块不得包含 I/O、账本、会话、时钟、随机数、可变状态；不得返回权限（只返回数据/判定）。
- 依赖图必须无环（D2）；角色模块间零 import；门控不 import 角色；共享不 import 门/角色；角色/共享/门控不得 import 引擎层。

### 6.3 `shared-directories.md` 修订（治理参考变更）

- **性质**：技能参考 `C:\Users\51054\.claude\skills\ans-governed-construction\references\shared-directories.md`（现行规则：`common/<role-id>/` 私有、`common/shared/` 由项目管理唯一写入）位于**用户技能目录**，不是仓库文件；修订是治理参考变更，必须留痕。
- **谁**：**人事（ANS People Operations）**——其默认写权含「`references/` 中的角色定义类参考（精确单文件）」；本变更是「创建/重构角色」任务，符合其条件目录条目的适用条件。统筹不写技能目录；策划/沟通不代改。
- **何时**：在 H1（人事写卡批次）内完成，**先于**任何角色写 `src/common/roles/`、`src/common/gates/`、以及共享移交（B-1～B-9 同批）；最迟不晚于 E1 上岗。
- **如何留痕（项目侧必须有对应记录，因技能目录不在仓库内）**：
  1. 修订前后对 `shared-directories.md` 计算 SHA-256 并记录在人事报告与 `角色卡/招募/memo.md`；
  2. 修订说明写入本团队计划（§6.3 本表）与沟通闸门记录（预授权 + 本计划版本）；
  3. 受影响角色 changelog（项目管理、shared-code、gates-code）记录依据；
  4. 修订内容摘要：新增 `common/roles/<id>/`（各角色模块公开资产、单一 owner、public entry、零跨角色 import）与 `common/gates/`（门控判定模块、单一 owner、只判定不采集）两类根；`common/shared/` 的维护 owner 从项目管理改为**共享代码维护角色（开发侧 worker）**；依赖方向更新为 `Model ← shared ← {roles, gates} ← engines`；保留「不保留两份独立维护副本」与证据失效规则。
- 若客户或治理评审反对该修订，停止共享移交并把第 7 位改为 S1（PM 兼任），需重开闸门 2（角色结构变化）。

### 6.4 共享组件目录迁移（PM → shared-code）

- **问题**：P1.6 Q8 默认把共享组件目录定在 `角色卡/项目管理/docs/architecture/shared-components.md`；但 `shared-code` 不能写其他角色目录内的文件（module-boundary 禁止跨角色目录文件授权），PM 也不能写 shared-code 目录。**须迁移路径**。
- **决议（本计划推荐，待 E0 评审确认）**：迁至 `角色卡/shared-code/docs/architecture/shared-components.md`（shared-code 自己的角色目录；Section 1 明确单文件授权）。理由：保持单一 owner 且不违反跨角色目录限制；`角色卡/项目管理/docs/architecture/` 继续承载 PM 自己的架构细分文档。
- **迁移步骤（单写者顺序，不留双份）**：
  1. shared-code 上岗后（E1）以 PM 现行目录为只读输入，写新目录文件（含 8 个维护角色/门控的模块清单、owner、public entry、消费者、测试）；
  2. E0/E1 评审确认新目录等价完整；
  3. PM 在同一窗口删除自己目录下的旧副本（PM 删自己的文件），记录迁移与证据；
  4. 此后共享组件目录只由 shared-code 维护；其他角色链接引用不复制。
- 若 E0 评审否决迁移，则退回 S1（PM 兼任共享），并重开闸门 2。

### 6.5 Q9 临时 owner 路径与 D-minimal 变体

- **结论：P1 不使用 `src/common/gates/`，不需要临时 owner。**
- P1 采用 **D-minimal 变体**（P1.6 §2.4）：门判定纯函数 `evaluateChiefDispatchParent` 留在 `src/pipeline/orchestration/trunk-runtime.ts` 内（编排既有单文件写权），导出给测试与 `currentChiefResumeSource` 复用；`validParent` 与 `currentChiefResumeSource` 共用同一实现；Codex 严格路径条件物理上保持在原文件（最接近「逐字保留」）；测试在 `test/编排/`（既有目录授权）。**无新共享根、无临时 Section 1、无跨角色例外授权。**
- E1：`gates-code` 按 E0 冻结契约在 `src/common/gates/` greenfield 建立门控模块（含同一 predicate 与 reason 码）。
- E2：编排把 `trunk-runtime.ts` 的两处调用改接 `src/common/gates/`；双跑差分证明与 D-minimal 内联实现等价；回滚演练通过后删除内联纯函数（D9/E-A10），Git 历史保留。
- 备选（Q16 选项 b）：E0 门控契约冻结后由 gates-code 直接实现 P1 切片、编排切换、再真实重跑；**需在派发前修订本计划**（改变阶段 1 实施角色），不作为默认。

---

## 七、阶段、授权与预留（任务项 5）

### 7.1 节点总表

| 节点 | 阶段 | 角色 | 可观察交付 | 前置 |
| --- | --- | --- | --- | --- |
| G0 | 闸门/授权留痕 | 沟通 | 本计划版本 + P1.6 版本的闸门记录（预授权覆盖）；实施授权记录 | 本计划写盘 |
| H1 | 治理落地 | 人事 | 8 卡 + 边界/YAML + changelog；B-9～B-12 现有角色调整与技能参考修订；`shared-directories.md` 修订留痕 | G0 |
| V1 | 实施前标准 | 内置独立验收 | `docs/acceptance/` B1 标准（P/N、M、R、D、E-A、RR 系列不弱化） | G0（可与 H1 并行） |
| B0 | 基线 | 测试 | HEAD/worktree、Node/npm、typecheck、受影响套件与全量基线、失败分类、差分 fixture 清单 | G0（可与 H1/V1 并行） |
| P1-A | 运行时契约 | 运行时核心 | `src/model/runtime.ts` 应用中介事实类型/guard + `session.ts` 包装层组合 + runtime-core 测试；**证据契约冻结** | V1 + B0 + H1 + 实施授权 |
| P1-B | 适配器事实 | Claude/Codex/Pi 适配器 | 各自 `inspectApplicationToolSurface()` + 桩件测试（实际构造面=报告面） | P1-A |
| P1-C | 门判定 D-minimal | 编排 | `trunk-runtime.ts` 单实现（strict + 受限路径、双路径互斥、reason 码）+ 门矩阵/差分测试 | P1-A |
| P1-D | 确定性验证 | 测试 + 运行核心/编排 | 门正负例矩阵、Codex 回归、受影响套件、typecheck；候选哈希 | P1-A/B/C |
| P1-RR | 真实重跑 | 测试（统筹组织） | 真实 Claude 最小派发受理证据（任务创建/投递），如实记录后续门；预算 §8.3 | P1-D |
| E0 | 契约冻结 | 策划 + 门禁引擎 + 测试 + 统筹 + 评审 | 契约文档（策划 `docs/planning/`）；`src/model/role.ts` 公开契约类型（门禁引擎）；行为/测试基线（测试）；冻结记录（统筹 `docs/scheduling/`）；**E0 出口=契约冻结评审通过 + B1 可判** | G0/H1/V1/B0（与 P1 可并行） |
| E1-S | 共享开发 | shared-code | 共享契约维护/迁移、新增共享 public entry、共享测试、接收集管目录 | E0 + 实施授权 |
| E1-G | 门控开发 | gates-code | `src/common/gates/` 门控模块 + 门矩阵 + 模块图扫描 | E0 |
| E1-R1…R6 | 六模块开发 | 各 `*-code` | `src/common/roles/<id>/` + `test/roles/<id>/` + 差分证据 | E0 |
| E2-G | 门控切换 | 编排 + gates-code | trunk-runtime 改调门控模块；双跑等价；回滚演练；删除 D-minimal 内联实现；记录删除清单 | E1-G + P1-RR |
| E2-R1…R6 | 角色模块切换 | 各 `*-code` + 消费 owner | 逐角色切换（数据/策略/消费点）、双跑差分、回滚演练、删旧实现与散落条件 | E1-R + E0 |
| E2-S | 共享抽取切换（如有） | shared-code + 消费 owner | 仅 E0 明列的共享抽取项；否则无此节点 | E0 决定 |
| E3-F | 终验执行 | 测试 + 各 owner | T3 全量回归 + 门禁负例 + D1–D9/E-A10 扫描 + 构建/typecheck；被删除文件/符号清单 | 全部 E2 单元完成 |
| E3-B | 变更包 | 统筹 | `docs/scheduling/` 最终变更包：候选哈希、改动路径、节点、证据链接、T3、删除清单、待确认项 | E3-F |
| E3-V | 独立验收 | 内置独立验收 | B2 报告（`docs/acceptance/`）：通过/返工/证据不足 | E3-B |
| E3-R | 放行记录 | 统筹 | `docs/scheduling/` 放行记录（只表示当前候选满足 B1；不授权发布） | E3-V |

### 7.2 P1 派发门修复（D-minimal；精确写集）

**范围**：P1.6 §2.1 路线 A 的运行时/适配器证据 + §4.4 判定规则（strict + 受限路径、双路径互斥、reason 白名单/阻断集）+ D-minimal 单实现。**不包含**：门控模块目录、写/发布门放宽、demo 行为改变。

| 角色 | 写集（精确） | 交付与检查 |
| --- | --- | --- |
| 运行时核心 | `src/model/runtime.ts`（`RuntimeApplicationToolSurfaceFacts` + guard；`RoleSession.inspectApplicationToolSurface?`；`RuntimeSessionToolSurfaceFacts.applicationMediation?`）；`src/service/runtime/session.ts`（包装层组合：仅 `status !== observed` 时构造；身份/注册表/工厂一致；reason 白名单/阻断集；`nativeBuiltinTools` 为空）；`test/runtime-core/`（组合正负例、guard、加法兼容） | `node --test "test/runtime-core/**/*.test.ts"` + `npm run typecheck`；证据契约冻结声明；候选哈希 |
| Claude适配器 | `src/provider/claude/session.ts`（`inspectApplicationToolSurface`：实际 `tools`/`allowedTools`/`mcpServers` 精确枚举；`WebSearch` 计入 `nativeBuiltinTools`）；`test/claude-adapter/`（实际构造面=报告面；WebSearch 启用即 nativeBuiltin 非空） | `node --test "test/claude-adapter/**/*.test.ts"` + typecheck；候选哈希 |
| Codex适配器 | `src/common/codex-adapter/chat-transport.ts`（应用面事实：实际 `toolMap`（含受控 shell 时）；`foreignMcpServers: []`；`nativeBuiltinTools: []`；native 缺失/身份不符不提供）；`test/codex-adapter/` | `node --test "test/codex-adapter/**/*.test.ts"` + typecheck；Codex 严格路径回归（原条件逐字保留 + `applicationMediation === undefined` guard） |
| Pi适配器 | `src/common/pi-adapter/real-adapter.ts`（`makeRoleSession`/bind 路径事实：`customTools`/`allowedSurface`/`noTools: builtin`；无 observation/bind 不提供）；`test/pi-adapter/` | `node --test "test/pi-adapter/**/*.test.ts"` + typecheck；候选哈希 |
| 编排 | `src/pipeline/orchestration/trunk-runtime.ts`（**D-minimal 单实现**：导出 `evaluateChiefDispatchParent` 纯函数；`validParent` 与 `currentChiefResumeSource` 共用；运行时四分支 claude/pi/codex/demo；reason 码 `not-default-core`/`tool-surface-unknown`/`application-mediation-unverified`/`turn-mismatch`/`no-active-dispatch`/`input-not-accepted`/`turn-settled`/`custom-factory`/`disposed`/`stopped`/`wrong-runtime`/`evidence-identity-mismatch`/`registry-mismatch`/`native-builtin-present`；对外仍 `trunk-verify-failed` + 原文案）；`test/编排/trunk-runtime.test.ts`（按影响更新）+ 新增 `test/编排/trunk-dispatch-parent.test.ts`（P1.6 §11.1 P/N 系列 + 双路径歧义 + TOCTOU 复检） | `node --test "test/编排/**/*.test.ts"` + typecheck；差分（旧内联条件 vs 新单函数输出一致，新增受限分支为预期差异）；候选哈希 |
| 测试 | `test/测试/`（跨层集成：fake managed sessions + `prepareRoleDispatch` 覆盖 Claude/Pi/Codex；creatorReports/controller resume；两次 validParent）；`角色卡/测试/docs/change/` 证据 | 集成原始输出；受影响套件 + T3 全量；失败分类；候选哈希 |
| 内置独立验收 | `docs/acceptance/`（B1 标准；不写产品） | V1 见 §8.1 |
| 统筹 | `docs/scheduling/`（本计划、P1 变更包、memo） | 收证、变更包、真实重跑组织 |

**P1 出口**：确定性矩阵全绿 + Codex 严格路径回归 + typecheck + 受影响套件 + 真实 Claude 派发受理证据（如被下游门拒，如实记录该门与证据，不宣称闭环完成）。

### 7.3 E0 契约冻结（owner / 写集 / 出口）

| 产物 | owner | 写集 | 内容 |
| --- | --- | --- | --- |
| 契约文档 | 策划 | `docs/planning/`（建议名 `2026-11-07_design_runtime-gate-role-module-contract.md`，以策划写盘为准） | 8 模块 public API 清单（六角色 + 共享 + 门控）、输入/输出、错误码、依赖方向、写集分配与 owner、消费者清单、版本 |
| 角色模块契约类型 | 门禁引擎 | `src/model/role.ts`（既有单文件，扩展） | `BuiltInRoleModule` 及 `tools/dispatch/preflight/context` 的具体签名/返回类型/`RolePolicyDecision`；公开形状（GovernanceCapabilities/CardKind/RoleSpec 的公开部分）；纯数据/纯函数约束 |
| 门控模块契约 | 策划文档 + 契约评审（gates-code 上岗后实现） | 文档；代码在 E1 | `evaluateChiefDispatchParent` 输入/输出、reason 码、可接受证据 kind、消费门（派发/controller resume）、禁止消费门（写/发布） |
| 行为/测试基线 | 测试 | `角色卡/测试/docs/change/` + `test/测试/`（如需基线夹具） | 旧行为基线、差分 fixture、门禁负例矩阵、契约测试清单、切换/回滚方案输入、旧代码冻结规则 |
| 冻结记录 | 统筹 | `docs/scheduling/`（建议 `2026-11-07_contract-freeze_runtime-gate-role-module.md`） | 路径/版本/sha256/评审人/消费者清单/测试证据；变更走 §4.6 |
| 评审 | 统筹组织：运行时核心、编排、门禁引擎、三适配器、测试、内置独立验收（可判性）；八个新角色上岗前**只读**接收冻结契约 | 无写 | 契约完整、可实现、可差分、可验收 |

**出口**：契约冻结评审通过 + B1（契约）可判；未冻结不得开始 E1；冻结后变更走接口评审（不引入客户卡）。

### 7.4 E1 并行开发（8 角色写集与并行规则）

- **greenfield 范围**：六角色模块 + 门控模块为新目录新文件；**共享模块在既有 `src/common/shared/` 上按 E0 契约维护/迁移**（P1.6 §9.2/F26），同样适用 E2 增量与 D9 清理。
- **并行规则**：旧代码冻结；新逻辑只进新模块；共享只由 shared-code 写、门控只由 gates-code 写；角色模块间零 import；每个角色只写自己的模块/测试/文档；不得私改契约；接口变更先评审再改。
- **八角色写集**：§4.4（模块目录 + 测试目录 + 自身文档）。
- **E1 出口（每角色）**：模块 public entry 按契约落地；模块单测 + 差分 fixture 输出；依赖扫描（本模块无越界 import）；候选哈希；`api-spec.md` 更新；完成报告。

### 7.5 E2 增量切换（顺序 / 桥接 / 双跑 / 回滚 / 删除）

**切换单元与顺序**（禁止一次性替换）：

1. **X-G 门控单元**（第一个）：编排将 `trunk-runtime.ts` 两处判定改调 `src/common/gates/`；gates-code 提供模块。
   - 切换前：同一 fixture 集合下 gates 模块输出 vs D-minimal 内联实现逐字段一致（允许差异=无）；
   - 桥接：消费方临时代码级开关（默认新模块；切回内联仅用于回滚演练），**不新增客户可见开关、不改变门禁语义**；
   - 回滚演练：切回内联 → 跑门矩阵/受影响套件 → 恢复新模块；
   - 验证通过后：删除内联 `evaluateChiefDispatchParent` 与桥接开关（同批）；记录删除符号清单（D9）。
2. **X-R1…X-R6 六角色单元**：顺序（数据先行 + 动作前置分批，沿用 P1.6 §6.7 建议）：**product → rapporteur → nominator → convener → verifier → chief**。每个单元包含：
   - 数据层：门禁引擎 `governance-roles.ts` 对应规格改为 import 模块 spec（删除内联规格）；
   - 策略层：该角色专属条件在 `run-role.ts`（能力位/工具/谓词/卡种）、`apply-journal.ts`（派发/报告/动作）、桌面路由（呈现数据）、`provider/runtime/{tools,schema}.ts`（如涉及）改读模块数据；
   - 差分：同一 fixture（角色/任务/卡/动作事实）旧输出 vs 新模块输出逐字段一致（允许方案明确的新证据分支；模块化阶段应为零差异）；
   - 回滚演练 + 删除旧散落条件（每单元记录删除清单）。
   - **单写者**：每个消费文件在其 owner 名下按单元顺序修改；同一时间一个角色单元占用一个消费文件；跨角色单元不并发写同一文件。
3. **X-S 共享抽取单元（如有）**：仅当 E0 明列 `handback.ts`/`workflow-preconditions.ts` 等既有共享候选迁移（默认**不迁移**，声明为编排公开只读入口；见 §9.4）。若迁移：shared-code 建新模块 → 消费 owner 切 import → 双跑 → 删旧（同一单元）。

**切换 gate（每单元必备证据）**：等价差分报告 + 受影响套件回归 + 回滚演练记录 + 删除清单；违反任一 → 不切换/不删除，交返工。**切换成功并验证后立即删除旧实现/门面/符号**（客户硬性要求）；清理只限本变更导致不再使用的代码，不确定项列「待确认」不盲删；Git 历史保留。

### 7.6 E3 终验（B1 输入 / D9 / E-A10）

- **B1（验收标准）**：由内置独立验收在实施前撰写（§8.1），覆盖 P1.6 §11.1–§11.6；B2 判定用。
- **D9/E-A10 死代码/重复实现扫描**：
  - TS Compiler API 使用/导出扫描 + 连续 ≥20 行相同代码块窗口扫描（阈值可配置）；
  - 扫描范围**限定为「被替换旧实现/本变更导致不再使用的代码」**；该范围内零未使用导出、零重复实现；
  - 与本变更无关的历史导出/功能/依赖列「待确认」，不删；
  - 构建 + 全量测试通过；被删除文件/符号清单入变更包；
  - 动态加载/字符串引用/外部入口等不确定项列「待确认」并报告。
- **门禁负例**：P1.6 §11.1 N 系列 + §11.2 M5 写/边界/Git/验收既有负例仍拒绝。
- **反重复**：D1–D9 全项（§8.4 扫描报告、模块图无环、共享测试单源、接口评审记录）。

### 7.7 依赖、单写者约束、失败与恢复

- **必须串行**：G0 → H1（角色卡/边界/修订先于任何新根写入）；V1/B0 → P1-A；P1-A → P1-B/C；P1-D → P1-RR；E0 → E1；E1-G → E2-G（且 E2-G 需 P1-RR 已如实报告）；E1-R<id> → E2-R<id>（每角色）；全部 E2 → E3-F → E3-B → E3-V → E3-R。
- **可并行**：H1/V1/B0；P1（运行时/适配器/编排三线，在 P1-A 之后）；P1 与 E0 契约设计并行（写集不相交）；E1 八角色并行；E2 不同角色单元可排不同窗口，但共享消费文件不并发。
- **不允许**：任何角色写写集外路径；八角色未上岗前写新根；E0 冻结前写引用契约的实现；切换未验证即删旧实现；角色写 `docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界。
- **失败/返工**：失败阻止依赖节点；返工交原所有者（模块归其角色、共享归 shared-code、门控归 gates-code、引擎归现有 owner、测试复测）；统筹不改验收结论；候选/契约/标准/边界变化使受影响证据失效，回到待做/返工，不得只改哈希冒充当前结果。
- **并发在飞**：工作树已有 T1 窄修复差异与多份 memo/临时脚本；派发前核对同文件占用；若冲突先冻结/重排并回报。

### 7.8 工作量与范围预留

| 角色 | 规模（约，按文件面） | 预留 |
| --- | --- | --- |
| 运行时核心 | P1：2 产品文件 + runtime-core 测试；E2：tools/schema 条件外移 + 重测 | `src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/provider/runtime/{tools,schema}.ts`、`test/runtime-core/` |
| 三适配器 | 各 1 产品文件 + 测试目录内测试 | 各自 `session.ts`/`chat-transport.ts`/`real-adapter.ts` + `test/<adapter>/` |
| 编排 | P1：1 产品文件 + 1–2 测试；E2：门控切换、run-role/apply-journal 消费、删除清单 | `src/pipeline/orchestration/{trunk-runtime,run-role}.ts`、`src/common/编排/`、`src/service/trunk/`、`src/service/version-change/`、`test/编排/` |
| 桌面窗口 | E2：session 路由读模块（按单元） | `app/desktop/` 列明文件、既有精确测试 |
| 桌面UI | 条件少量 | `app/renderer/`、`test/桌面UI/` |
| 门禁引擎 | E0：1 文件契约类型；E2：governance-roles 门面逐单元切换 | `src/model/role.ts`、`src/common/门禁引擎/`、`test/门禁引擎/` |
| 六角色 code 角色 | 各 1 模块目录 + 1 测试目录 + 文档 | §4.4 |
| shared-code | 既有 shared + 测试 + 共享目录 | §4.4 |
| gates-code | 1 模块 + 测试矩阵 + 模块图扫描 | §4.4 |
| 测试 | B0、P1-RR、集成、E3-F | `test/测试/`、`角色卡/测试/docs/` |
| 人事 | 8 卡 + 4 项现有角色调整 + 技能参考修订 | H1 |
| 独立验收 | B1/B2 | `docs/acceptance/` |
| 装配 | 预期 0 | — |

范围预留规则：每个节点开始前按具体 roleId 与精确路径预留；同一文件同一时间只有一个写入者；未知工作量如实标「待评估」，不编造工时。

---

## 八、验收与证据计划（任务项 6）

### 8.1 独立验收标准（V1/B1）与 B2

- **作者**：内置独立验收（技能内置管理角色；**不使用**项目 `角色卡/独立验收` worker——其 Section 1 只覆盖自身角色文档，不含 `docs/acceptance/`，会造成双重验收）。
- **时机**：闸门留痕后、实施前；可与 H1/B0 并行。
- **建议路径**：`docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md`（以独立验收写盘为准）；报告建议 `...-report-v1.md`。
- **基线**：P1.6（`24150207…`）+ 意图记录 + 复核记录；团队计划只作范围/写集依据，不是标准来源。
- **最低内容**：验收表（ID/标准/需要的证据/证据路径/候选/产出角色/结果/判断）、T3 依据与升档条件、判定规则（pass/fail/insufficient evidence/not applicable）、证据失效与复用规则、版本冻结规则；覆盖 P1.6 §11.1（P/N）、§11.2（M）、§11.3（R）、§11.4（D）、§11.5（RR）、§11.6（E-A）。
- **B1 暂名**：「运行时派发门与角色模块化 B1」；不替代/不修改 I6 B1 与 H02/H03，仅交叉引用（Q14）。
- **冻结**：实施开始后不得改标准适配候选；确需变更递增版本并记录理由，受影响证据重新核对。

### 8.2 T3 全量、受影响套件与检查命令

| 阶段 | 最低检查 |
| --- | --- |
| P1 | `node --test "test/runtime-core/**/*.test.ts"`、`"test/claude-adapter/**"`、`"test/codex-adapter/**"`、`"test/pi-adapter/**"`、`"test/编排/**"`；`test/测试/` 跨层集成；`npm run typecheck`；Codex 严格路径回归；门矩阵 |
| E1 | 各角色模块测试（`test/roles/<id>/`）、共享测试（`test/项目管理/shared/`）、门控测试（`test/gates/`）；模块图扫描（无环/零 import）；typecheck |
| E2 | 每单元：差分报告 + 受影响套件 + 回滚演练记录 + 删除清单；模块图/重复实现扫描 |
| E3 | **T3 全量回归**（`node --test --test-concurrency=1` 按 B0 口径；允许按既有方式排除 `write-sequencing.test.ts` 并记录理由）；双端 typecheck（如渲染层未改可注明 N/A，但 typecheck 必须绿）；`typecheck:renderer`/`build:renderer` 按是否触及渲染层判定并记录理由；D9/E-A10 扫描；门禁负例；被删除文件/符号清单 |

- 现有相关测试**不得删断言/加 skip/放宽**；失效证据按规则重取并披露；Windows 既有环境失败（symlink/EPERM 等）按 B0 基线分类，新增确定性失败必须为 0、新 skip 必须为 0。

### 8.3 真实运行预算（Q11）

- **Claude 真实运行**：**必测**。P1-RR：单条客户消息、单 chief 回合、最多 1 次 `dispatch_task` 调用、无自动重试；墙钟上限 10 分钟；失败/超时/预算超限立即中止并保留证据；不跑六角色全链（P1.6 §12.3）。
- **Pi 真实运行**：默认**不跑**（O3 不实施）；Pi 以确定性集成/桩件必测。如客户另批真实 Pi 定向，另计预算。
- **Codex**：以确定性集成/桩件 + 既有真实证据回归；不跑真实模型（受控 shell 应用面路径）。
- **执行与证据**：测试角色执行并交原始证据（日志/回执/截图），统筹组织并记录；真实运行使用既有 dogfood 隔离目录/临时 userData，不碰现有项目；费用按单回合上限控制；不与 T1 验证混跑；运行前先跑确定性门矩阵。
- **真实运行目标**：派发父门受理、任务创建/投递成功；若随后被仓库初始化/交付门拒绝，如实记录该门与证据（Q5 另立变更），不宣称闭环完成。

### 8.4 证据存放与变更包

- **每角色证据**：`角色卡/<roleId>/docs/change/...-evidence/`（原始输出、截图、哈希）；测试证据 `角色卡/测试/docs/change/`。
- **截图规则**：按既有 2026-10-27 客户规则——**最多截图、不要求/不提供录屏**；截图来自当前候选真实运行、关闭 DEBUG 覆盖层；记录 sha256/候选版本/拍摄命令/窗口尺寸（仅适用真实应用证据，P1-RR）。
- **变更包**（统筹写 `docs/scheduling/`）：
  - P1：`2026-11-07_change-package_runtime-dispatch-gate.md`（候选哈希、改动路径、任务节点、证据链接、T3、下游门如实记录）；
  - 终验：`2026-11-07_change-package_runtime-gate-role-modularization.md`（含每单元切换记录汇总、删除文件/符号清单、「待确认」清单）；
  - E2 切换日志：`2026-11-07_switch-log_runtime-gate-role-modularization.md`（每单元：等价差分、受影响套件、回滚演练、删除清单、证据链接）。
- **候选冻结**：变更包中的候选哈希即验收冻结依据；候选变化使受影响证据失效。
- **纪律**：管理记录不混入产品候选；不提交/推送/合并/发布（本计划阶段）；Git 历史保留旧实现。

### 8.5 独立验收输入清单

1. P1.6 方案（`24150207…`）与 B1 标准版本；
2. 本团队计划版本与闸门留痕（预授权/沟通记录）；
3. 变更包（候选哈希、改动路径、节点、证据链接、T3）；
4. 每单元：差分报告、受影响套件原始输出、回滚演练记录、删除清单、模块图/重复扫描报告；
5. P1-RR 真实运行原始证据（含后续门如实记录）；
6. 接口评审记录（共享/门/角色契约变更）与共享组件目录更新；
7. 边界/YAML 一致性报告（人事）与 `shared-directories.md` 修订留痕（前后 hash）；
8. 反重复/死代码扫描报告（D1–D9/E-A10）与「待确认」清单。

---

## 九、披露、待确认项与风险（任务项 7）

### 9.1 Q1–Q18 推荐答案与影响

| Q | 推荐答案（本计划） | 影响/备注 |
| --- | --- | --- |
| Q1 路线 | A + 有界 D；B 拒绝，C 仅长期方向；阶段 1 采用 **D-minimal**；demo 保持现状（仅新应用中介路径拒绝 demo） | §6.5/§7.2；E2 门控单元完成 D 的模块化切换 |
| Q2 残留（shell/WebSearch） | 接受 Codex 应用中介路径行为新增（客户决定 1 的落实；写/发布门不变）；**WebSearch 默认 fail-closed（不批准具名例外）**；`start_background_task` 无真实证据，B1 只按代码/桩件覆盖并披露 | 客户可见限制 §9.2；如客户要 WebSearch 例外，另立变更 + 补正负例 |
| Q3 残留（外来 MCP） | Claude/Pi 采用精确枚举 + N26 负例（足够）；**Codex 配置外来 MCP 即 fail-closed** 作为客户可见限制接受 | §9.2；如客户要求 Codex 支持，需另立「Codex app-server tool-surface 证据」变更 |
| Q4 controller resume | 纳入：`currentChiefResumeSource` 与 `validParent` 共用同一 predicate/单实现（P1 D-minimal；E2 后门控模块） | P1.6 F2；P1 出口含 controller resume 差分 |
| Q5 下游门 | 保持不动，另立变更；阶段 1 真实重跑只承诺派发受理并如实报告下一门 | §9.2；不把应用中介证据用于写/发布门 |
| Q6 角色模块位置/契约 | 确认三区布局 `src/common/roles/<id>/`、`src/common/gates/`、`src/common/shared/`；启动 `shared-directories.md` 修订（人事执行 + 留痕） | §六 |
| Q7 六角色模块边界 | 确认 P1.6 §6.3 模块内容/不进入模块清单；role module public API 限于契约 | §4.4 |
| Q8 共享代码角色 | **采用 S2**；PM 职责收窄；共享组件目录迁至 `角色卡/shared-code/docs/architecture/shared-components.md`（跨角色目录限制） | §4.7/§6.4；迁移单写者顺序 |
| Q9 E0/E1 写集/临时 owner | **P1 D-minimal，无临时 owner、无新根写入**；E0 由策划/门禁引擎/测试/统筹按既有边界完成；E1 后八角色按卡写 | §6.5；若改选 Q16(b) 需修订计划 |
| Q10 8 角色结构 | 确认开发侧 worker（不扩张产品内置角色）；§5.1 保留/收窄方案采纳；角色 E0 冻结后上岗 | §三/§五 |
| Q11 真实运行预算 | Claude 必测（§8.3 预算）；Pi 确定性必测 + 真实可选（默认不跑）；Codex 桩件/回归 | §8.3 |
| Q12 错误语义 | 对外 `trunk-verify-failed` 与原文案不变；内部 reason 码 + O1 诊断日志（建议实施，不改回执） | §7.2 |
| Q13 T1 共存 | T1 独立完成/验收后再实施本变更；不触碰 `src/common/claude-adapter/schema.ts` 与 `test/claude-adapter/session.test.ts`（其测试目录共用，但本变更只新增应用面事实测试文件，须在实施前由统筹核对 T1 状态与工作树） | 基线已含 T1 未提交差异（只读） |
| Q14 标准 | 不改 I6 H01–H11/旧 A/J；新 B1 暂名「运行时派发门与角色模块化 B1」，与 I6 B1 区分、不替代 H02/H03，仅交叉引用；模块化纳入同一 B1（分部判定） | §8.1 |
| Q15 阶段顺序 | E0 → E1 → E2 → E3 主计划；P1 先行并与 E0 并行；角色 E0 后上岗；增量切换而非一次性替换 | §七 |
| Q16 实施策略 | 采用 E'（契约冻结 + 并行开发 + 影子/双跑 + 增量切换 + 测试贯穿 + 可回切）；拒绝一次性替换（E-A9） | §7.5 |
| Q17 契约冻结 | 接受 E0 产物/冻结方式/接口评审流程（§7.3/§4.6） | 冻结记录留痕 |
| Q18 死代码清理 | 接受 D9/E-A10 边界与扫描；只清理本变更导致的死代码；不确定项「待确认」不删；Git 保留历史 | §7.6 |

### 9.2 客户可见限制（不得隐藏）

1. **Codex 配置外来 MCP → fail-closed**（chat 传输构造期不支持；配置非空即拒绝，或建会话即失败）。
2. **WebSearch 启用 → 应用中介路径不成立**（计入 `nativeBuiltinTools`），派发被拒；未批准具名例外。
3. **下游写/发布门仍只接受 Codex strict observed**：派发修好后，真实闭环可能在仓库初始化（`git_candidate init`）或交付被拒；阶段 1 不宣称闭环完成。
4. **`start_background_task` 无真实运行证据**（仅代码/桩件覆盖）。
5. **应用中介证据不证明 native 进程/传输/效果闭包**；只用于派发父门与 controller resume。
6. 项目内置六角色**不扩张**；新增 8 个是开发侧 worker。

### 9.3 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| R1 治理语义被误放宽（unknown 冒充 observed / 新证据用于写门） | INV-1/2/7/8；消费者白名单；负例矩阵；门控单实现；E2 差分 |
| R2 Codex 回归（提取门/类型改变条件） | 原条件逐字保留 + `applicationMediation === undefined` guard；Codex 专项回归 + 差分 |
| R3 shell/MCP 政策误用 | 客户决定边界；调用来源证据 vs 效果闭包分离；外来 MCP 精确枚举；WebSearch fail-closed |
| R4 下游门阻断真实闭环 | 阶段 1 只承诺派发受理；Q5 另立变更；如实报告 |
| R5 模块化行为漂移 | 差分测试、逐单元切换、双跑、全量回归 |
| R6 8 角色协调/写集重叠 | E0 冻结 + 零 import + 单一 owner + 本计划 §4.5 核对 + 人事 preflight 核对 |
| R7 共享/门控 god-module | §6.8 边界、依赖图扫描、评审、反重复扫描（D2/D3） |
| R8 周期/预算 | 分阶段节点/验收；真实运行最小化；不编造工时 |
| R9 证据/标准漂移 | 不改冻结标准；B1 独立撰写；T1 不混包；阶段独立证据包 |
| R10 先复制后清理 | D5/D8/D9；门控从第一天单实现；切换即删 |
| R11 E2 双轨漂移/长期双份 | 每单元等价 gate + 回滚演练 + 切换即删；桥接开关与旧实现同批删除；只接受 E' |
| R12 清理误删/漏删 | 扫描范围限定；「待确认」清单；构建 + 全量测试；Git 历史 |
| R13 预授权留痕缺失 | G0：沟通先留痕本计划版本 + P1.6 版本；人事核对记录后才写卡 |
| R14 T1 在飞冲突 | 本变更不碰 T1 文件；`test/claude-adapter/` 共用目录，实施前核对 T1 完成/文件占用 |
| R15 共享移交动荡 | 单写者顺序（shared-code 建新→评审→PM 删旧）；shared-code 直接接管既有模块不重写；测试路径不改名 |
| R16 真实运行环境/费用 | B0 基线 + 确定性矩阵先行；单回合上限/10 分钟/无重试；失败如实记录 |

### 9.4 契约缺口/需策划或客户确认的事项（如实报告）

1. **共享组件目录路径与跨角色目录限制冲突**（P1.6 Q8 默认 PM 路径不可由 shared-code 维护）：本计划决议迁至 `角色卡/shared-code/docs/architecture/shared-components.md`；需 E0 评审/策划确认（P1.6 已预留「若改用其它路径须说明理由并经评审」）。若否决 → 退回 S1 并重开闸门 2。
2. **E0 契约产物位置未在 P1.6 指定**：本计划指定契约文档=策划 `docs/planning/`、TS 契约类型=门禁引擎扩展 `src/model/role.ts`、基线=测试、冻结记录=统筹 `docs/scheduling/`；如策划/评审有不同归属，按既有写权调整，不扩大任何角色权限。
3. **E0 评审参与方措辞**（P1.6 §7.2「共享/门控/六角色候选评审」）与新角色「E0 后上岗」存在时点张力：本计划安排新角色**上岗前只读接收冻结契约**，E0 评审由现有 owner + 独立验收（可判性）完成；如评审认为新角色必须参与 E0 评审，需调整上岗时点（属计划修订，不改变方案实质）。
4. **`src/common/编排/handback.ts` / `workflow-preconditions.ts` 的共享归属**：P1.6 §8.2 列为共享候选但允许「声明为公开只读入口」。本计划默认**不迁移**（保持为编排私有、写入权不变；角色模块不 import 引擎，故不受影响）；若 E0 评审认定必须迁入 `src/common/shared/`，按 X-S 单单元执行（shared-code 建新模块 → 消费方切换 → 删旧）。
5. **共享测试目录历史名** `test/项目管理/shared/` 将由 shared-code 使用（路径不变、owner 变更）；如项目规范要求目录名与 owner 一致，改名须另立变更（不在本变更顺手改）。
6. **P1 真实运行与 T1 验收顺序**：P1 实施需 T1 验收完成或至少确认无同文件占用；如 T1 未完成，P1 可先做确定性部分、真实重跑待 T1 关闭（如实记录）。

---

## 十、计划状态与下一步

- **已写**：本团队计划（`docs/scheduling/2026-11-07_team-plan_runtime-gate-role-modularization.md`）；统筹 memo 续接线索（同目录）。
- **待办（按序）**：
  1. 沟通：在 `docs/communication/` 留痕本计划版本（路径/行数/SHA-256）+ P1.6 版本（预授权闸门 1/2 覆盖记录）；
  2. 人事：按 §5.4/§六写 8 卡 + 边界/YAML + changelog，执行 B-9～B-12，修订 `shared-directories.md` 并留痕；
  3. 统筹：核对人事交付（写集不重叠、边界/YAML 一致、记录齐备）后按 §7.1 派发；
  4. 内置独立验收：写 B1 标准（§8.1）；测试：B0 基线；
  5. 实施按 P1（并行 E0）→ E1 → E2 → E3；每阶段独立证据包，独立验收判 B2。
- **未做**：派发、实施、测试、验收、提交、推送、合并、发布；未改任何源码/测试/角色卡/边界/方案/沟通记录/验收文档；未联系客户。
- **约束复核**：本文件只写 `docs/scheduling/`；不实施、不派发、不判验收、不提交/推送/合并/发布。若客户改变方案默认项、角色结构或写集口径，重开对应闸门并修订本计划。
