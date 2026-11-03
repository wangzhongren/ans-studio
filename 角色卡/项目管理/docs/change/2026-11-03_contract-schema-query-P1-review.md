---
id: contract-schema-query-p1-review
type: change
title: P1 实现提案审核：contract_check 只读 schema topic（四角色）
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: blocked
related: [contract-schema-query]
events:
  - date: "2026-11-03"
    kind: created
    summary: 只读审核 A0/A1/A2/A3 四份 P1 实现提案；结论 needs revision（A1 一项修订，其余三份通过）
  - date: "2026-11-03"
    kind: blocked
    summary: P1 未通过：A1 提案“文本不出现字面 flowId”与 P1.3 §3.5 的字段表不一致，待编排修订后复审；审核通过前不写产品代码
---

# P1 实现提案审核：`contract_check` 只读 schema topic（四角色）

- 任务 / flowId：`2026-11-03-contract-schema-query` / `contract-schema-query`
- 节点：P1（实现提案与审核；团队计划 §4.3「项目管理（P1 审核）」、§6.3 P1 出口）
- 审核角色：项目管理（独立固定上下文；只读审核，不切换角色）
- 日期：2026-11-03
- 状态：**审核完成；结论 `needs revision`**。A0（运行时核心）、A2（桌面窗口）、A3（门禁引擎）无修订项；A1（编排）有一项必须修订。整体 P1 未通过，A0a 不开工；A1 修订后按本记录复审受影响部分。
- 风险档位（输入事实，不是本次审核判定）：T3（团队计划 §1.2 / 闸门 2 已确认）。
- 审核对象：四份 P1 短实现提案（下表均在审核时点重新实测行数 / 字节 / SHA-256，与派发说明一致）。
- 写入：仅本文件（`角色卡/项目管理/docs/change/`，本角色边界 Section 1 目录条目）；未改提案、产品源码、测试、角色卡/边界、i18n 或其它角色资料；未 commit/push；不是客户批准、不是闸门、不是验收结论。

## 0. 审核上下文冲突（重要，先读）

- **本上下文是 P1 审核的重复/迟到派发。** 审核收尾时发现同任务已有一份项目管理 P1 审核记录：同一路径 `角色卡/项目管理/docs/change/2026-11-03_contract-schema-query-P1-review.md`，**293 行 / SHA-256 `d547b90d47615ef00556a65558fdcde6ad307e0286d3bd457624c977d46256ea`，结论 `recommend approval`**，并列出 P1-CSQ-01–10 实施前必须落实项。该结论已由沟通记录「P1 审核记录」与 `docs/communication/memo.md` 记录；统筹已据此启动 A0a/A0b/A1/A3，A3 已实施并写 `角色卡/门禁引擎/docs/change/2026-11-03_contract-schema-query-A3-implementation.md`（12:22:34），A0a/A0b/A1 源码已有改动。
- **写盘守卫事实**：本上下文写盘前检查该路径时文件不存在（见审核过程记录）；本记录写入后，该路径上只有本记录（当前行数/哈希见 §7），先前 293 行 / `d547b90d…` 版本当前不在本 worktree 磁盘上。存在**重复上下文覆盖同一审核文件**的风险，按任务防重复写守卫应停止并回报统筹；本记录不再改写该路径与任何其它文件。
- **本记录结论不是当前生效的 P1 决定。** §1–§5 是对四份提案文本的独立只读审核；`needs revision` 只代表本上下文对提案文本的意见。当前生效的 P1 决定以沟通记录/memo 中的 **293 行 / `d547b90d…`、`recommend approval` + P1-CSQ-01–10** 为准，直至统筹另行裁决。本记录发现与 P1-CSQ 有重叠（A1 的 `flowId` 措辞≈P1-CSQ-03；AC-8 无 `taskKind` 断言≈P1-CSQ-07；A1 AC-15 fixture 澄清≈P1-CSQ-04；A3 `@deprecated` 裁决=P1-CSQ-10）。
- **实施侧现状（只读观察，不作为本审核结论）**：`src/common/编排/workflow-preconditions.ts` 的进行中实现已保留 P1.3 的 `flowId` 字段行（`:102/:105/:128`），说明 A1 实施未按提案 §1 字面删改字段表；提案文本本身仍应修正或在 A1 完成记录中说明。工作区 `git status --porcelain -- src app test` 在本审核收尾时**非空**（5 个源码 + 1 个测试修改，另有 A3 实施记录），系并行实施产物，不是本审核所写；审核开始时该命令为空。
- **请统筹处置**：(a) 从统筹会话转录恢复/确认 293 行 / `d547b90d…` 审核记录，或明确以本记录为准；(b) 校正沟通记录/memo 与磁盘文件的哈希不一致；(c) 决定本重复记录保留、归档或删除；(d) 确认 A1 提案文本修正或 P1-CSQ-03 落实；(e) 确认实施继续/暂停与 D1 候选基线。

## 1. 审核对象（审核时点实测）

| 角色 | 提案路径 | 行数 | 字节 | SHA-256 | 逐份结论 |
| --- | --- | --- | --- | --- | --- |
| 运行时核心（A0a/A0b） | `角色卡/运行时核心/docs/change/2026-11-03_contract-schema-query-P1-proposal.md` | **100** | 10,025 | `57838e461aa36cc98538a4fad823626c80109314a9c1a41eb7a3d6b8cb595d41` | **通过（无修订项）** |
| 编排（A1） | `角色卡/编排/docs/change/2026-11-03_contract-schema-query-P1-proposal.md` | **90** | 11,559 | `70e36ea4e8e50a0c0942a2b305351a6b40c4a00ca48eae8730f9cf4e87cddaff` | **需修订（1 项，见 §5.1）** |
| 桌面窗口（A2） | `角色卡/桌面窗口/docs/change/2026-11-03_contract-schema-query-P1-proposal.md` | **100** | 8,323 | `bb04be77865ecf13b3e6db36b4c093001c0541a6c88820c83c3812f5bb194bc0` | **通过（无修订项）** |
| 门禁引擎（A3） | `角色卡/门禁引擎/docs/change/2026-11-03_contract-schema-query-P1-proposal.md` | **81** | 8,286 | `f44f1b98590fe271f639fa61d6ce35767fa1a80375b25cce4cc9169a6364c593` | **通过（无修订项）** |

四份均为 `proposal-only, no code`：提案自述未改代码/测试、未 commit/push；审核时点 `git status --porcelain -- src app test` 为空、`git diff --cached --name-only` 为空，基线 HEAD `243d8f6a6db663a383b516aad6320c5110c7f583`（`release/v1.8.4-assets`）。

## 2. 输入基线（审核时点实测）

| 输入 | 路径 | 行数 | 字节 | SHA-256 |
| --- | --- | --- | --- | --- |
| 方案 P1.3（唯一实施基线） | `docs/planning/2026-11-03_design_contract-schema-query.md` | **911** | 81,313 | `4d61d376c3bcbf89b8069efcf501f062087f088873d3946b522a6abeaa6f4b85` |
| 独立复核记录 | `docs/planning/2026-11-03_review_contract-schema-query.md` | **282** | 60,036 | `55a2d2681b29ab4e0a5896ce2a772f0d4fd779159eff8b88c9a39303a8c5459f` |
| 团队计划（闸门 2 已确认） | `docs/scheduling/2026-11-03_team-plan_contract-schema-query.md` | **539** | 71,649 | `a93bd02f4f2cd3ecfd90b13aa41195e95eaec539277649fbbc9a8b6a91c03f5c` |
| V1 实施前验收标准 | `docs/acceptance/contract-schema-query-criteria-v1.md` | **725** | 91,243 | `110018449f43440a841785aa73b6d1be7d0ae60ca4d6b4bcf7b3636723d2768d` |
| B0 基线（最终版） | `角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline.md` | **189** | 17,504 | `9f5872807fd163c9e47ce5a9b704771a2162f9129114a194f2f3bb53ef20676e` |
| 沟通记录（观察值，可能继续追加） | `docs/communication/2026-11-03_intent_contract-schema-query.md` | 157 | 19,459 | `e6657f0a2363ca9987ce619a5d808bf5bd924fb984909083ac3c9f492ce1bde9` |

说明：

1. 方案 / 复核 / 团队计划 / V1 / B0 的行数与 SHA-256 均与派发说明及文件自述一致；B0 文件第 189 行自述的 `1c89e14a…` 是「不含本行」的可复算哈希，整文件哈希为 `9f587280…`（与最终版说明一致）。
2. 四份提案的输入表引用 B0 为 **171 行 / `314f9941…`**（B0 中间快照）。最终版已取代；统筹说明「计数与分类未变」，本审核核对最终版：受影响套件 72/72、typecheck 双端 exit 0、T3 全量 3462 tests / 3435 pass / 9 fail（均为既有 Windows symlink EPERM）/ 18 skipped、新增确定性失败 0、新增 skip 0，与提案所依赖的事实一致。该引用差异不改变提案结论；A 阶段证据须引用最终 B0（189 行 / `9f587280…`）。
3. 本审核未重跑 B0/V1 的实施测试或 typecheck；只读执行了 Node 对现有 `workflow-preconditions.ts` / `governance-roles.ts` 的导入、设计文本抽取、示例真实解析与字节统计，以及只读 `grep` / `git blame` / `git log` / `git hash-object` / `sha256sum` / `wc`。这些操作未写仓库、未启动应用。

## 3. 核对结论与证据

### 3.1 契约形状与单一来源

| 核对点 | 结论 | 证据（只读） |
| --- | --- | --- |
| `CONTRACT_SCHEMA_TOPICS` / `ContractSchemaTopic` / `ContractCheckInput.topic?` 仅在 `src/model/runtime.ts` 定义 | **通过** | `ContractCheckInput` 唯一定义在 `src/model/runtime.ts:1139-1144`；全仓 grep 仅此定义（`tools.ts:47` 为导入，`run-role.ts:101/293/599` 为引用，`runtime.ts:2213` 为可选注入字段）；A0 §2 明确只改此文件；A1 只 `import type`；A2 只消费 `ContractCheckInput` |
| 文本 / 三示例 / `contractSchemaText(topic)` 仅在 `src/common/编排/workflow-preconditions.ts` | **通过** | 基线全仓 grep 无 `contractSchemaText` / `CONTRACT_SCHEMA_TOPICS` 实现（只在方案/复核/团队计划/V1/提案/沟通等文档出现）；A1 §1/§3 明确导出位置；A2 §2 只 import；A0 §3/§7-5 明确工具层不 import 该文件 |
| 工具层 / 会话 / 描述复用同一枚举，无重复字面量 | **通过** | A0 §3 用 `CONTRACT_SCHEMA_TOPICS` 构造拒绝消息与枚举校验；A0 §4 `schema.ts` 用 `[...CONTRACT_SCHEMA_TOPICS]`；A2 只用 `ContractSchemaTopic \| undefined`，不复制枚举；`src/provider/runtime/tools.ts:62` 与 `schema.ts:2` 本来就从 `model/runtime.ts` 导入值，新增同一常量不新增依赖边 |
| 示例单一来源 | **通过** | A1 §1 规定 roster 示例直接插值 topology 示例；AC-2 以 `includes` 锁；我按 P1.3 文本实测 `rosterExample.includes(topologyExample) === true`、三块文本分别包含各自示例 |
| schema 版本常量单一来源 | **通过（实现需按 AC-17）** | P1.3 §3.5 三块文本共 3/3/3 行包含 `project-modules/v2` / `project-roster/v3` / `project-topology/v2`，行内容与常量拼出的期望行一致；A1 §1/§4 AC-17 规定用同文件 `PROJECT_*_SCHEMA` 插值并逐行断言 |

### 3.2 分层与依赖方向

| 核对点 | 结论 | 证据（只读） |
| --- | --- | --- |
| `src/provider/runtime/{tools,schema}.ts` 只从 `src/model/runtime.ts` 导入枚举，不 import 编排 `workflow-preconditions.ts` | **通过** | A0 §3/§4/§7-4 明确；基线 grep `src/provider/runtime/*.ts` 无 `workflow-preconditions` 匹配；`tools.ts:62` / `schema.ts:2` 的导入方向是 Provider → Model（共享 Model，允许） |
| Provider 不反向依赖编排（本次新增范围） | **通过（附基线观察）** | 本次不新增 `tools.ts` / `schema.ts` → `workflow-preconditions.ts` 的边；基线 `tools.ts:69-70` 已有从 `src/common/编排/mechanical-rejection.ts`、`evidence-check.ts` 的既有导入，属本任务之前的现状，不在本任务写集内，本审核不要求修也不把它算作本次违规（见 §5.2 O-2） |
| `app/desktop/session.ts` 只复用既有导入边的 `contractSchemaText` | **通过** | `app/desktop/session.ts:133-142` 已从 `src/common/编排/workflow-preconditions.ts` 导入 `loadLatestRoster` 等；A2 §2 只把 `contractSchemaText` 加入同一导入块，不新增依赖边；`app/desktop/session.ts:2545-2546` 已无条件注入 `contractCheck` |
| 无上行/深导 | **通过** | A0：Provider → Model（允许）；A1：`workflow-preconditions.ts` 新增 `import type { ContractSchemaTopic } from "../../model/runtime.ts"`，Model 是全局共享层且 `runtime.ts` 只 import `model/*` / `common/shared/*`（`runtime.ts:1-19`），不构成环；A2：桌面 → 编排私有 `common` 是既有导入边，非本次新增；A3 无导入变化 |
| 不复制 Provider / 编排实现 | **通过** | A2 不复制文本/示例/枚举；A0 不 import 编排；A1 不 import Provider；A3 只加卡文本 |

### 3.3 写集与边界（Section 1 唯一白名单）

| 角色 | 提案写集 | Section 1 依据（`boundary.md` / `boundary.yaml` 同步副本） | 结论 |
| --- | --- | --- | --- |
| 运行时核心 | `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts` | `角色卡/运行时核心/boundary.md:9/12/13` 单文件条目；`boundary.yaml:6/16/19` | 在既有授权内 |
| 编排 | `src/common/编排/workflow-preconditions.ts`、`test/编排/workflow-preconditions.test.ts`、`test/编排/trio-worker-report.test.ts` | `boundary.md:14` 目录 `src/common/编排/`；`boundary.md:15` 目录 `test/编排/`；`boundary.yaml:27/30` | 在既有授权内 |
| 桌面窗口 | `app/desktop/session.ts`、`test/桌面应用/rejection-copy.test.ts`、`test/桌面应用/run-pin.test.ts` | `boundary.md:11` 目录 `app/desktop/`；`boundary.md:62/64` 逐文件条目；`boundary.yaml:15/171/177` | 在既有授权内 |
| 门禁引擎 | `src/common/门禁引擎/governance-roles.ts`；`test/门禁引擎/**` 只读回归 | `boundary.md:14` 目录 `src/common/门禁引擎/`；`boundary.md:15` 目录 `test/门禁引擎/`（只读）；`boundary.yaml:28/31` | 在既有授权内 |

- **互不重叠**：四角色写集逐文件不相交；`src/provider/runtime/{tools,schema}.ts` 只由运行时核心写；`workflow-preconditions.ts` 与 `test/编排/*` 只由编排写；`app/desktop/session.ts` 与两个桌面测试只由桌面窗口写；`governance-roles.ts` 只由门禁引擎写；`test/门禁引擎/*` 任何角色不写。
- **无新增文件**：四份提案均只改既有文件；A1 未新增独立测试文件；A2 未新增测试文件；A0/A3 无测试文件。
- **无新增依赖/工具**：不新增 `package.json`、不新增工具名；`contract_check` 只是新增可选 `topic`。
- **A1 的 `trio-worker-report.test.ts` 卡断言在 A3 后**：A1 §2/§3/§6 明确；A3 §5 明确由 A1 在 A3 卡文本落地后追加；符合团队计划 §4.3/§5.2。
- **A2 不新增测试文件**：仅写 `rejection-copy.test.ts`、`run-pin.test.ts` 两个既有逐文件条目。
- **`test/门禁引擎/**` 只读回归**：A3 §4/§5 明确不写；D1 回归由测试角色执行。

### 3.4 无边界变更（B-0）

| 核对点 | 结论 | 证据 |
| --- | --- | --- |
| 不改角色权限 / 边界 / YAML / Section 1 / changelog | **通过** | 四份写集全部落在既有 Section 1；不含 `角色卡/**/boundary*`、changelog；A3 明确只加 `RAPPORTEUR_CARD_TEXT` 两行，不改 `entries` / `preauthorizedDirs` / `forbiddenWritePaths` / `capabilities` / 角色 id/function |
| H1 不适用 | **通过** | 无新增/修改/删除 Section 1 条目、无角色 id/显示名/职责变化；团队计划 §4.5 已确认 B-0 |
| 不改 parser 接受/拒绝集合 | **通过** | A1 §2 明确错误码不变、宽容读取不变；改动仅是错误 `reason` 文案；A0/A2 只涉及 `contract_check` 工具/会话，不涉及项目文档 parser；A3 只改提示文本 |
| 不接受 `management.roles` 兼容 | **通过** | A1 §2 明确保留顶层 `management` 解析、映射仍报错；P1.3 §4.4/§9 与闸门 1 已确认不做兼容 |
| `architectureSource` 不强制路径 | **通过** | A1 §2 新文案只是提示「应为项目相对路径」；P1.3 §4.5 明确解析器仍只校验非空 |

### 3.5 无 i18n

| 核对点 | 结论 | 证据 |
| --- | --- | --- |
| 无新增 `ui.*` / `main.*` / `shared.*` key | **通过** | 四份写集不含 `app/renderer/**`、`src/common/shared/i18n/**`、i18n messages/计数；A0 改工具描述（模型面向）、A1 改 parser 错误文案（模型面向工具输出）、A3 改内置角色卡文本（角色提示词）；i18n 非目标明确不翻译角色提示词/角色卡/系统提示；团队计划 §4.3 项目管理条目亦明确本任务不参与 i18n |
| 不改 i18n messages / 计数 | **通过** | 同上；无任何 i18n 目录/文件写入 |

### 3.6 AC-1–AC-18 映射与 T3 验证

| AC | 归属（提案） | 证据落点 | 覆盖 |
| --- | --- | --- | --- |
| AC-1 | 编排（A1） | `test/编排/workflow-preconditions.test.ts`：两示例真实 parser `ok:true` + `modules[]` `deepEqual` | 有 |
| AC-2 | 编排（A1） | 同文件：roster 示例 `includes` topology 示例 | 有 |
| AC-3 | 编排（A1）+ 运行时核心/桌面窗口（A0/A2 工具/会话可观察部分） | A1 三 topic 字节断言（≤4096，roster ≤3900）；A0 §6、A2 §4 工具/会话输出 ≤4096 | 有 |
| AC-4 | 桌面窗口（A2） | `rejection-copy.test.ts`：`seenInput.topic === "roster"` 且 `ok:true` | 有 |
| AC-5 | 桌面窗口（A2） | 同文件：未知 topic `ok:false`、列三值、数据源 0 调用 | 有 |
| AC-6 | 桌面窗口（A2） | 同文件：非字符串 `ok:false`、含「应为字符串」 | 有 |
| AC-7 | 桌面窗口（A2） | 同文件：`topic + roleId:other` 拒绝、隔离先于 topic | 有 |
| AC-8 | 桌面窗口（A2；A0 工具侧） | `run-pin.test.ts` 三 topic 行断言、`topic+flowId+taskKind` 并存；`rejection-copy.test.ts` 工具侧透传 | 有（文本侧「无字面 taskKind」断言见 §5.1 修订项 A1-1） |
| AC-9 | 编排（A1） | `workflow-preconditions.test.ts`：四字段 × 空/非字符串矩阵、`purpose` raw-vs-effective、错误码不变 | 有 |
| AC-10 | 编排（A1） | 同文件：mapping/缺角色/宽容读取/v1 提示 | 有 |
| AC-11 | 门禁引擎（A3）写卡 + 编排（A1）写断言 + 测试（D1）回归 | `governance-roles.ts` 两行；`trio-worker-report.test.ts` 四正则；`view-image-cards.test.ts` / `list-project.test.ts` 只读回归 | 有 |
| AC-12 | 桌面窗口（A2） | `session.ts` 首句早退 diff + `run-pin.test.ts` 无 run 项目根用例 | 有 |
| AC-13 | 桌面窗口（A2）+ 运行时核心（A0） | 两个桌面测试既有 `seenInput`/legacy 断言；A0 input 构造 legacy 不变 | 有 |
| AC-14 | 运行时核心（A0）+ 编排/桌面/门禁 + 测试（D1） | A0/A1/A2/A3 `npm run typecheck`；D1 双端 typecheck + §7.3 六套件 + T3 全量 | 有 |
| AC-15 | 编排（A1） | `workflow-preconditions.test.ts`：`loadLatestRoster` 正例 + drift/stale/inconsistent/missing/modules-doc-missing 五负例 | 有（正例 fixture 措辞见 §5.2 O-4） |
| AC-16 | 桌面窗口（A2） | `rejection-copy.test.ts`：null/空串/空白串 legacy；`topic:123` 拒绝 | 有 |
| AC-17 | 编排（A1） | `workflow-preconditions.test.ts`：每 topic schema 常量恰好 3 行且等于常量期望行 | 有 |
| AC-18 | 编排（A1）+ 独立验收（E2） | 文本三条警告断言；E2 只读抽查真实项目文档 | 有 |

**T3 验证口径核对**（团队计划 §1.2/§7、V1 §五）：

- 受影响套件：运行时核心 `npm run typecheck`；编排两测试；桌面窗口两测试；门禁引擎两测试只读回归——四份提案均按此映射（A0 §7、A1 §5、A2 §5、A3 §5/§6）。
- T3 全量回归：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`，D1 执行；B0 最终版基线 3462 / 3435 pass / 9 fail（既有 Windows symlink EPERM）/ 18 skipped；新增确定性失败 0、新增 skip 0（A1/A2/A3 均引用 B0/D1；A0 退出只要求 typecheck，D1 负责全量）。
- 双端 typecheck：`npm run typecheck`、`npm run typecheck:renderer` 均须 0；A0/A1/A2/A3 各自跑 `npm run typecheck`，D1 补 `typecheck:renderer`。
- 不要求真实 Electron E2E；提案未把未运行写成通过。
- **结论：映射完整，T3 口径与团队计划/V1 一致。** 唯一缺口是 AC-8 文本侧「三块文本不含字面 taskKind」没有明确落到 A1 测试断言（A2 的行断言不会捕获非行首的 `taskKind` 字样）；该缺口并入 §5.1 A1-1。

### 3.7 legacy 逐字不变、4 KiB 预算、卡文本活动路径与 `@deprecated`

| 核对点 | 结论 | 证据（只读） |
| --- | --- | --- |
| legacy（不传 topic）逐字不变 | **通过** | A0 §3：仅合法 topic 构造 `input.topic`；空/空白/null 不构造，legacy `seenInput` 深比较不变；legacy 工具层截断标记 `\n…（已截断，完整规则见 run manifest）` 保持 `tools.ts:2456` 原文；A2 §2：`contractCheckText` 只加首句早退，`getListing`（`:8096`）/`refreshListingNow`（`:8097`）/会话截断（`:8194-8202`）不动；AC-13 以既有 `rejection-copy.test.ts:161-198`、`run-pin.test.ts:522-545` 为护栏 |
| 4 KiB 预算（roster ≤3900 B） | **通过** | 我从 P1.3 §3.5 三块 ````text` 抽取实测：**2438 / 3763 / 1265 B**（无尾随换行），与 A1 §5 一致；示例 **282 / 850 / 171 B**；`parseProjectModules(...,"demo")` 与 `parseProjectRoster(...,"demo")` 均 `ok:true`、`modules[]` `deepEqual`、roster 示例包含 topology 示例、三块文本均包含各自示例、schema 常量行 3/3/3；A1 §1/§4 AC-3 有 ≤4096/≤3900 断言 |
| 卡文本活动路径 | **通过** | `governanceRoleOf("rapporteur")` 在 `governance-roles.ts:470-472` 按注册表查找；`rapporteur` 注册项 `cardText: RAPPORTEUR_CARD_TEXT` 在 `:328-332`；`src/service/role/resolve-role.ts:57-59` 保留内置 id（项目角色不可遮蔽），`:97-98` 对内置治理角色使用 `spec.cardText`；`run-role.ts:1455` `adapter.bindRole(setup.role)`；适配器使用 `role.cardText`：`pi-adapter/real-adapter.ts:352`、`provider/claude/session.ts:192`、`provider/codex/session.ts:354`、`provider/pi/session.ts:82`、`provider/runtime/tools.ts:3616`。A3 §3 结论（活动路径）成立 |
| `@deprecated` 注释 | **处理得当（PM 裁决：本任务不改）** | `governance-roles.ts:177` 的注释由 `f4aa073a`（批次 A）加在 `LIAISON_CARD_TEXT` 上方，`c2b6cf9`（批次 D1）删除该常量后残留，紧邻 `RAPPORTEUR_CARD_TEXT`；`git blame -L 177,178` 证实注释隶属 `f4aa073a`、常量隶属 `e53fb76e`，注释文本指向「旧 liaison」而非 rapporteur；A3 §3/§7-1 的判断成立。本任务改它属额外文案变更，会让 A1/AC-11 证据失效且超出 P1.3 §5.1 两行；不改。列入门禁引擎后续获授权变更的技术债（O-3） |
| 卡长 | **通过** | 实测 `governanceRoleOf("rapporteur").cardText` = **4246 B / 25 行**；模拟插入两行（169 B + 195 B + 2 换行）后 **4612 B / 27 行 / +366 B**，与 A3 §2、P1.3 §5.2/§8.4 一致；`view-image-cards.test.ts` 只查禁用字符串、无长度硬上限；A1 四正则对模拟文本全部命中 |

### 3.8 提案间一致性矩阵

| # | 一致性点 | A0（运行时核心） | A1（编排） | A2（桌面窗口） | A3（门禁引擎） | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 枚举/类型形状 | 在 `runtime.ts` 定义 `CONTRACT_SCHEMA_TOPICS` / `ContractSchemaTopic` / `ContractCheckInput.topic?` | 只 `import type`，`contractSchemaText(topic: ContractSchemaTopic)` | 只消费 `input.topic`，不复制枚举 | 不涉及代码枚举 | 一致 |
| 2 | `topic` 参数名 | 只读 `call.args["topic"]`，不取别名 | 只定义 `topic` | 明确只 `topic`，无 `schema`/`topic_kind` | 卡文本用 `topic:"modules"` | 一致 |
| 3 | 文本/示例来源 | 不 import 编排文本 | 在 `workflow-preconditions.ts` 定义 | import 既有依赖边 | 卡文本不复制 schema 文本 | 一致 |
| 4 | 工具解析/透传 | 角色隔离 → topic 校验 → 透传；未知/非字符串不调用数据源 | 接收 `ContractSchemaTopic` | 测试锁 `seenInput.topic`、调用计数 | — | 一致 |
| 5 | 截断标记 | topic `\n…（已截断）`；legacy 原文 | 作者保证 ≤4096 | session 不预截断；工具层兜底 | — | 一致 |
| 6 | 空/空白 → legacy | null/空串/仅空白 trim 后不构造 topic | — | 测试锁三种值 | — | 一致 |
| 7 | 非字符串拒绝 | `ok:false` 含「应为字符串」，不读 `readStringArg`（其会静默返回 undefined） | — | 测试锁 `topic:123` 等 | — | 一致 |
| 8 | 未知 topic 不调用数据源 | 返回早于 `fn` | — | `seenInput===undefined` | — | 一致 |
| 9 | 角色隔离先于 topic | 隔离（`:2424-2426` 逐字不动）在前 | — | `topic + roleId:other` 拒绝 | — | 一致 |
| 10 | A1 文本/错误 ↔ A2 首句早退 | — | 静态文本、无 IO；错误文案只改 `reason` | `contractCheckText` 首句 `return contractSchemaText(input.topic)`；无 run 可用 | — | 一致 |
| 11 | A3 卡文本 ↔ A1 断言正则 | — | `/contract_check/`、`/topic:"modules"/`、`/publicContract.*非空字符串/`、`/management.*扁平数组/` | — | 两行文本逐字取自 P1.3 §5.1；模拟文本四正则全命中 | 一致 |
| 12 | A1 卡断言在 A3 后 | — | 明确 A3 后追加 | — | 明确 A1 在 A3 卡文本落地后追加 | 一致 |
| 13 | legacy 逐字不变 | 仅合法 topic 构造 `topic`；legacy 标记不变 | 不触碰 session/工具 | 只加首句早退；legacy diff 不变 | — | 一致 |
| 14 | 写集互不重叠 | 3 个源码文件 | 1 源码 + 2 测试 | 1 源码 + 2 测试 | 1 源码（门禁测试只读） | 一致 |
| 15 | 无新增文件/依赖/工具 | 是 | 是 | 是 | 是 | 一致 |
| 16 | 无 i18n / 无边界变更 | 是 | 是 | 是 | 是 | 一致 |

**文本事实核对（供第 10/11 行）**：P1.3 §3.5 三块文本中 `taskKind` / `moduleId` 均不出现；`flowId` 在 modules 与 roster 字段表中作为 schema 字段出现（`- flowId: 非空 string（与派发一致）` 及加载校验行「flowId 与派发一致」），topology 文本不出现 `flowId`。这正是 A1 §1 表述需要修正的地方（见 §5.1）。

## 4. PM 裁决点逐条处理

### 4.1 运行时核心 A0 提案 §9

| # | 裁决点 | PM 裁决 | 理由 |
| --- | --- | --- | --- |
| 1 | 枚举导入方向：枚举/类型放 `runtime.ts`，工具层只 import，不放 `workflow-preconditions.ts` | **同意** | 与 P1.3 §3.1 的有意差异、团队计划 §3.4 选项 D、§4.2 一致；避免 Provider → 编排的上行依赖 |
| 2 | topic 参数别名：仅 `topic`，不取 `schema` / `topic_kind` | **同意** | 方案与 AC-4/6/16 只定义 `topic`；别名会扩大输入面与测试组合，无收益 |
| 3 | 空/空白判定：null/空串/仅空白 → legacy；合法值 trim 后接受；非字符串拒绝；必须读原始值 | **同意** | 与 P1.3 §3.1/§3.2、AC-16 一致；`readStringArg` 对非字符串静默返回 undefined（`tools.ts:232-238`），确实不能用于 topic |
| 4 | 截断标记文案：topic `\n…（已截断）`；legacy 原文 | **同意** | 与 P1.3 §3.3 一致；legacy 逐字不变优先 |
| 5 | 与 A1 边界：工具只校验枚举并透传；文本/字节由 A1 产出、经注入 `ContractCheckFn` 返回；工具层不 import 编排 | **同意** | 单一来源与分层要求；A2 会话负责数据源 |
| 6 | topic 模式 `fn` 异常文案沿用 legacy 兜底（提及 pin/写区） | **同意（记录）** | 方案未要求改、AC 不覆盖；保持 legacy 逐字不变优先；`contractSchemaText` 为纯静态文本，异常路径不影响正常查询。A0 退出记录需注明该选择 |

### 4.2 编排 A1 提案 §7

| 裁决点 | PM 裁决 | 理由 |
| --- | --- | --- |
| 4 KiB / 3900 B 预算（3763 B，余 333/137 B） | **同意** | 实测 3763 B；守卫 3900；新增字段先压缩或拆子 topic（拆子 topic 属方案变更，重开闸门 1） |
| 示例漂移（modules/roster `modules[]` 逐项一致） | **同意** | 实测 `deepEqual` 为 true；AC-1/AC-15 同锁 |
| `purpose` raw-vs-effective | **同意** | 与 P1.3 §4.1 一致：`purpose:true` 无 responsibility → `boolean: true`；`purpose:""` 不回退 |
| 错误文案措辞基线 | **同意以 P1.3 §4.3 为新文案基线**，实现逐字按该模板；本审核不另立措辞 | 避免实现与验收各写一套；A1 提案的新文案表与 P1.3 §4.3 一致 |
| A3 卡路径（`RAPPORTEUR_CARD_TEXT` 可能非活动） | **同意并已核实** | 见 §3.7；活动路径成立；若 A3 实施时发现变化，停止并回报 |

### 4.3 桌面窗口 A2 提案 §7

| # | 裁决点 | PM 裁决 | 理由 |
| --- | --- | --- | --- |
| 1 | 早退位置必须是 `contractCheckText` 第一条语句（注释不算） | **同意** | P1.3 §3.3 无 IO 不变量；AC-12 以 diff 核对 |
| 2 | tool 参数别名：仅 `topic`；如需别名请 PM 裁决 | **裁决：不加别名** | 与 A0 §9-2、P1.3 一致；不扩大输入面 |
| 3 | 空串/空白串：null/`""`/仅空白 → legacy；非字符串拒绝；归 A0b，A2 测试锁定 | **同意** | 与 P1.3 §3.2/AC-16 一致 |
| 4 | 截断归属：session 不预截断 topic；工具层 `truncateUtf8` 4096 兜底；A1 文本超限应在 AC-3 先失败 | **同意** | 与 P1.3 §3.3/§8.2 一致；不允许靠截断掩盖超限 schema |
| 5 | legacy 逐字不变：只加 import + 首句；既有 `seenInput` 深比较与 run-pin legacy 断言为护栏 | **同意** | 与 AC-13 一致；实测 `rejection-copy.test.ts:177` 的 `seenInput` 深比较、`run-pin.test.ts:522-545` 的 legacy 断言均在基线 |

### 4.4 门禁引擎 A3 提案 §7

| # | 裁决点 | PM 裁决 | 理由 |
| --- | --- | --- | --- |
| 1 | `@deprecated` 注释与活动路径：注释是 `c2b6cf9` 删除 `LIAISON_CARD_TEXT` 的残留；本任务不改注释，是否清理交 PM 另定 | **裁决：本任务不改注释；记录为后续技术债（O-3）** | 注释经核实为历史残留（`f4aa073a` 引入、`c2b6cf9` 删除 liaison 常量后残留），不是 rapporteur 停用声明；改它属额外文案变更，会使 A1/AC-11 证据失效且超出 P1.3 §5.1 两行。活动路径已由 A3 §3 与本次只读核对确认 |
| 2 | 卡长 4246 → 4612 B（+8.6%），仍是六卡最大；无硬上限；若要控制长度，备选仅保留第一行 | **同意按 P1.3 两行实施** | 实测 4612 B / 27 行；`view-image-cards` 只查禁用项、无长度上限；仅保留第一行是方案 §5.2/§8.4 变更，需 PM/策划裁决，本任务不做 |
| 3 | 文案精确措辞：采用 P1.3 §5.1 原文（直引号 `"`）；不自行润色 | **同意** | A1 四正则按该文本设计；改字会使 A1/AC-11 证据失效 |
| 4 | 与 A1 断言对齐：A1 在 A3 后追加；A3 不改测试、不预写断言；若 A1 复审要求不同正则，先同步文案再实施 | **同意** | 团队计划 §4.3/§5.2 的依赖顺序；单写者 |

## 5. 发现、非阻断观察与结论

### 5.1 必须修订项（A1 / 编排）

**A1-1（重要）：提案 §1 的「文本不出现字面 `taskKind`/`flowId`/`moduleId`」与 P1.3 §3.5 的确认文本不一致。**

- 位置：A1 提案 §1（90 行版本第 26 行）；相关上下文 A1 §5 第 70 行。
- 事实：我从 P1.3 §3.5 抽取三块完整文本实测：
  - `taskKind`：三块均不出现（正确）；
  - `moduleId`：三块均不出现（正确）；
  - `flowId`：**modules 与 roster 文本均出现**，作为 schema 字段：modules 的 `- flowId: 非空 string（与派发一致）` 与加载校验行「flowId 与派发一致；…」；roster 的 `- flowId: 非空 string（与派发一致）；version: 正整数…`；topology 文本不出现。
- 影响：若按 A1 §1 字面实施「文本不出现 flowId」，会删改 P1.3 §3.5 已确认的字段表行，偏离唯一实施基线；若按 P1.3 实施，则 A1 §1 的表述不成立。A1 §5 自己只声称「无字面 taskKind」，与 §1 不一致。
- 修订要求（编排）：
  1. 将 §1 改为与 P1.3 一致的表述，例如：「全文不出现字面 `taskKind` / `moduleId`；首两行不出现 `taskKind` / `flowId` / `moduleId`；`flowId` 仅作为 schema 字段名出现在 modules/roster 字段表（P1.3 §3.5 文本），必须保留，不得删除或改写。」不得改变 P1.3 的字段表文本。
  2. 在 `test/编排/workflow-preconditions.test.ts`（既有文件，不新增文件）的文本断言组补一条对三个 topic 的 `contractSchemaText(t)` **不含 `taskKind`** 的断言（可选加 `moduleId`），作为 AC-8 / V1 §3.8 证据第 3 项的文本侧落点；不得削弱 AC-17 的「恰好 3 行」断言。
- 复审范围：仅 A1 修订后的 §1 表述与新增断言映射；A0/A2/A3 不需重审。修订后由统筹重新交本项目审核上下文复审，`recommend approval` 前不写任何产品代码。

**A1-2（建议，非阻断）：AC-15 正例的「topic=roster 文本」措辞应明确为按 schema 文本构造的 roster 文档（`PROJECT_ROSTER_SCHEMA_EXAMPLE` 或同内容文件），不是整块 schema 文本本身。** 这避免测试作者把字段表/示例说明当成 roster 文件；不改变 AC-15 语义。

### 5.2 非阻断观察项

- **O-1（B0 快照引用）**：四份提案输入表均引用 B0 中间快照 171 行 / `314f9941…`；最终版为 189 行 / `9f587280…`（统筹已复核「计数与分类未变」）。本审核核对最终版：72/72 受影响套件、双端 typecheck exit 0、T3 3462/3435/9/18、新增确定性失败 0、新增 skip 0；提案依赖的事实全部成立。A0–A3 进入实施时，证据记录应引用最终 B0 哈希，不引用中间快照；无需为此修改提案。
- **O-2（基线既有依赖）**：`src/provider/runtime/tools.ts:69-70` 在基线已有从 `src/common/编排/mechanical-rejection.ts`、`evidence-check.ts` 的导入。本任务不新增 `tools.ts`/`schema.ts` → `workflow-preconditions.ts` 的边，不修既有边；记录此事实，避免把「Provider 不依赖编排」误读为本任务后的全局干净状态。该既有边不在本任务写集或本次审核范围内。
- **O-3（`@deprecated` 技术债）**：`governance-roles.ts:177` 的 liaison 残留注释建议由门禁引擎在后续获授权的变更中清理（或由角色卡/文档维护者另行安排）；本任务不改，不影响 A3 的活动路径结论。
- **O-4（A2 测试夹具）**：A2 §4.2 的「空临时根（无项目文件、无 run/flow）open 后」用例需在实施时确认 SessionManager `open` 的前置条件；AC-12 要求的是「无 run/项目根可用」，若 `open` 需要最小项目文件，测试可用最小项目根（无 run）实现，不改变 AC。属测试实现细节，不是提案缺陷。
- **O-5（工具描述测试可选）**：A2 §4.1 的 `describeTool("contract_check").parameters.properties.topic.enum` 用例在 P1.3 §7.1 中为可选；建议实施时顺手加上（成本极低），但不作 P1 通过条件。

### 5.3 结论

**`needs revision`。**

- A0（运行时核心）、A2（桌面窗口）、A3（门禁引擎）三份提案在契约形状、单一来源、分层/依赖、写集/边界、B-0、i18n、AC 映射、T3 口径、legacy/4 KiB/卡活动路径/`@deprecated` 处理上均满足本节点要求；本审核对这三份无修订项。
- A1（编排）有一项必须修订（A1-1）和一项建议澄清（A1-2）。A1-1 是提案文本与 P1.3 唯一实施基线的不一致，若按字面实施会改变已确认的 schema 字段表；因此整体 P1 不能给 `recommend approval`。
- 按团队计划 §6.3 P1 出口：四份提案须由原所有者修订后复审，审核通过前不写产品代码；本结论不是客户批准、不是实施授权、不是验收结论。
- 复审建议：只审 A1 修订版（A1-1 的表述/断言映射 + A1-2 澄清）；A0/A2/A3 的提案版本不变，若版本变化需重新核对哈希。

## 6. 声明与限制

- 本审核为**只读**：只写本文件；未修改四份提案、产品源码、测试、角色卡/边界、i18n、`src/common/shared/`、`docs/scheduling|acceptance|communication|planning` 或运行项目文档；未 commit/push/merge/release；未接触客户。
- 本审核未运行实施测试或 typecheck；未启动应用/Electron；只读执行了仓库文件/哈希核对与 Node 对现有模块的导入、设计文本抽取、真实 parser 与卡文本模拟。B0/V1/团队计划中的测试数字是输入记录，不是本审核重跑；`pass`/`needs revision` 是**提案审核建议**，不是验收结论。
- 本审核不是客户闸门、不是实施授权、不是独立验收；审批摘要与客户沟通由沟通/统筹处理。
- 未发现需要 `not ready` 的信息缺口：四份提案、基线、源码锚点、B0/V1 均足以作出上述判断。

## 7. 记录版本

本记录最终 **272** 行（`wc -l`，含本行）；SHA-256（不含本行，可复算：`head -n -1 <本文件> | sha256sum`）：**181c0c1050b207af4248686638f6114060c6dcf7275b0863bec8e8de6c5582e3**。
