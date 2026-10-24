# 团队计划：角色根文档在详情面板展示（role-root-docs-display）

- **任务 ID**：`2026-10-23-role-root-docs-display`
- **产品 flowId**：`role-root-docs-display`（任务标签）
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色）
- **日期**：2026-10-23
- **状态**：团队计划已写盘；**闸门 2 未确认、实施授权未给；未派发、未实施、未改代码/测试/角色卡/边界/方案/flow/账本/沟通记录/验收文档**
- **闸门 0 记录**：[`docs/communication/2026-10-23_intent_role-root-docs-display.md`](../communication/2026-10-23_intent_role-root-docs-display.md)（已确认，2026-10-23）
- **闸门 1 记录**：同上文件「闸门 1 确认记录（2026-10-23）」；客户原话「确认 Q9 A：v1.7.0 先只列三个文件名，Windows 点开显示既有不支持提示；正文可读留待后续。其余 Q1–Q12 按推荐。」
- **客户确认的策划方案版本**：[`docs/planning/2026-10-23_design_role-root-docs-display.md`](../planning/2026-10-23_design_role-root-docs-display.md) **方案 v1**（1023 行；SHA-256 `9b69a7864112eb3df0c1da86b6ce653bb9235d4c655ac4d6f3b979e29080c26d`；2026-10-23 实测复算一致）
- **风险档位**：**T2（跨角色/接口/契约变更）**；目标版本 **v1.7.0**；发布前完成独立验收
- **记录性质**：本文件是统筹的团队计划，不是 `task_ops` 机器状态。本项目没有 `.ans/project.json` 任务配置（`.ans/` 仅 `sessions/`）；本计划不伪造任务令牌、审批、锁或机器预检记录。
- **当前停点**：本计划写盘后交沟通向客户确认**闸门 2（角色指派/写集/顺序/验收安排）**；客户另行给出**实施授权**前不派发。**本计划写盘 ≠ 派发 ≠ 实施**。本变更与 i18n、目录 v3、治理写卡、验收返工路由分别闸门、分别实施、分别验收，不合并。

---

## 一、任务、档位与基线

### 1.1 任务与目标（按闸门 1 确认的方案 v1）

1. **角色根文档索引**：`readRoleDocsIndex` 增加角色根目录下的精确白名单 `feature-map.md`、`functional-description.md`、`api-spec.md`；固定顺序；`memo.md` 永不入索引；`changelog.md` 仍保留在独立“变更记录”字段；`docs/` 现有递归遍历、排序、500 条上限、隐藏文件跳过不变。
2. **只读元数据 + 既有读取链路**：索引只返回文件名/项目相对路径等元数据，不读取根文档正文；正文仍经既有受限文档 Service/Provider 的 opaque 引用读取，不建立第二套读取器或第二条内容来源。
3. **契约 additive**：`RoleView` 增加可选 `rootDocs`；`ProjectDocumentRoleCandidates` 增加可选 `rootDocs`；不新增 IPC 通道，`listProject` 载荷向后兼容；旧 renderer/旧 main 组合不崩。
4. **详情面板分组展示**：`ProfilePanel` 的“文档”区分为“角色根文档”与“`docs/` 目录”两组；只显示实际存在的根文档；部分缺失不显示占位；有根文档但没有 `docs/` 时不再显示误导性的整节空态；内置角色/无根文档角色显示诚实空态；`role-card`/`boundary` 保持各自专门栏，不重复进入“文档”。
5. **点击打开**：根文档行可键盘操作，点击在既有 `DocumentView` 中只读打开；刷新 listing 后按 `relativePath` 精确匹配 opaque 引用，不构造文件系统路径、不自行生成 `documentId`；Windows 上点击显示既有 `UNSUPPORTED_ENVIRONMENT` 提示，不伪造正文。
6. **i18n**：新增根文档分组/空态/按钮标签 key（zh-CN/en-US），文件名、路径、`not-applicable` 等机器/内容值不翻译；由项目管理唯一写入 `src/common/shared/i18n/messages/`，桌面UI 只消费。
7. **测试与验收**：受影响角色单测/层测试 + 跨层集成（`listProject` → `RoleView` → renderer、候选 → Service refs）+ 真实 Electron；Windows fail-closed 与 POSIX 实读分开记录；T2 不默认全量 T3；独立验收在实施前按客户确认的方案 v1 写正式标准，实施后按同版判断。

### 1.2 风险档位：T2

依据技能 `references/testing.md`「Risk-Based Verification and Change Packages」：本变更同时触及 Model/Service 候选契约、桌面 Interface 的 `listProject` 视图形状、渲染层展示与跨层测试，属于跨角色/接口/契约变更；它**不**改变治理、权限、角色边界、验收要求或文档归属，因此不是 T3。

**T2 默认验证**：受影响角色的单元/层测试 + 跨角色集成检查（`listProject` → `RoleView` → renderer 展示；`projectDocumentCandidates` → Service refs）+ 受影响的 typecheck/渲染构建 + 真实 Electron 点击；不默认全量回归。

**升档/重开条件（触发即停止并回报统筹，不自行扩大）**：
- 需要修改 `src/provider/project-document/**`、Windows 受限读取 Provider 或改变读取模型（Q9 A 已明确不做；若客户改选 B/C，重开闸门 1，可能升 T3）；
- 需要修改角色卡/边界/文档归属/验收要求，或新增/删除角色；
- 需要新增 IPC 通道、改 `app/preload.cjs`、改 `project:document-read` 请求/回包形状；
- 需要读取根文档正文到 `RoleView`/`ProfilePanel`（方案 D，绕过受限 Provider）；
- 实施证据不足以建立跨层结论（按 `references/testing.md` 可升 T3 补证，升档不降档）。

### 1.3 本轮非目标（不得顺手扩大）

- 不展示、不索引 `memo.md`；不提供“显示 memo”开关。
- 不要求每个角色新增 `changelog.md`/`docs/`；不把 `changelog.md` 当 docs 索引；不要求补写。
- 不修改任何角色卡、边界、模板、验收标准、文档正文或文档归属；不迁移/重命名/移动现有角色目录。
- 不复制/搬运根文档正文到 `RoleView`、`ProfilePanel` 或第二个文件；不在 ProfilePanel 内嵌正文。
- 不新增写路径、IPC 通道、preload 方法或权限；不改变 `documentScope` 语义。
- 不改变 Windows 受限读取的既有安全取舍；不降级 realpath/符号链接/O_NOFOLLOW/有界读检查。
- 不修改目标项目 `ans-gateway` 或任何外部项目文件（只读样例）。
- 不修改 `package.json`、构建配置、依赖、发布配方/冻结源；不提交、不推送、不合并、不发布。
- 不与 i18n、目录 v3、治理写卡、验收返工路由合并验收，不引用它们的验收结论替本变更背书。
- 不改 `flow`/账本/`.ans` 治理状态；本计划不建立第二套机器状态。

### 1.4 基线（2026-10-23 写计划时实测）

| 项 | 值 |
| --- | --- |
| 分支/HEAD | `main` / `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（`docs(release): record v1.6.0 published assets and checksums`） |
| 工作树（写计划前） | `git status --short` 共 **228** 条；其中 i18n（T2）、目录 v3（T3）、治理写卡（T3）、验收返工路由（T3）均已实施并有独立验收报告判定「通过（当前候选）」，但**均未提交**；另有 `docs/*/memo.md` 修改与管理文档未跟踪。以上是**既有上下文**，不是本变更候选 |
| 本变更目标文件现状 | `src/model/project-document.ts`、`src/service/project-document/impl/read-project-document.ts`、`src/provider/project-document/**`、`test/桌面应用/project.test.ts`、`test/桌面应用/project-document.test.ts` 与 HEAD 一致；`app/desktop/project.ts`、`app/desktop/interface.ts`、`app/renderer/src/{chat/document-view.ts,chat/types.ts,shell/ProfilePanel.tsx,shell/DocumentView.tsx,stores/drawer-store.ts,shell/phase4a.css}`、`test/桌面应用/{interface.test.ts,e2e/main.mjs}`、`test/桌面UI/{runtime-config.test.ts,source-guard.test.ts}` 已被上述既有变更修改（未提交）。S1 必须逐文件记录 `git hash-object` + `sha256sum` 基线 |
| i18n 现状 | `src/common/shared/i18n/messages/{zh-CN,en-US}.ts` 已由 i18n 候选建立（未跟踪）；已有 `ui.profile.docsTab`、`ui.profile.noDocs`、`ui.profile.viewListedDocs`，**没有**根文档分组/整节空态/单文件打开标签 key。本变更需要项目管理新增 key；现有 key 不足以完整表达方案 §5.5.6 |
| `test/桌面应用/` 授权 | **逐文件授权**：`project.test.ts`、`project-document.test.ts`、`interface.test.ts`、`e2e/main.mjs` 均在权威 `角色卡/桌面窗口/boundary.md` Section 1；**不得新建该目录文件** |
| 任务配置 | 无 `.ans/project.json`；未启用 task_ops；不建立第二条机器状态 |
| Node/npm | 沿用既有记录：当前 shell PATH 未包含 Node，S1 按既有流程加入 PATH 并记录实测版本（上轮 Node v24.22.1 / npm 11.19.1，以实测为准） |
| 测试 runner | `node --test`；`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`；真实 Electron `test/桌面应用/e2e/main.mjs`、`test/桌面UI/phase4a-electron-smoke.mjs`；不新增 runner/配置 |
| 目标项目 | `ans-gateway` 仅只读样例；其 7 个角色目录通常只有六个根文件（含 `memo.md`），无 `changelog.md`/`docs/`；实施不写它 |
| 验收基线 | 客户闸门 1 确认的方案 v1（1023 行；SHA-256 `9b69a7864112eb3df0c1da86b6ce653bb9235d4c655ac4d6f3b979e29080c26d`）；正式标准由内置独立验收在实施前基于同一版本另写 |

### 1.5 闸门与授权状态

| 项 | 状态 | 记录 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-10-23）** | `docs/communication/2026-10-23_intent_role-root-docs-display.md` |
| 闸门 1：方案确认 | **已确认（2026-10-23，方案 v1，Q1–Q12 推荐 A；Q9 明确 A）** | 同上「闸门 1 确认记录（2026-10-23）」 |
| 闸门 2：角色指派/写集确认 | **未确认** | 本计划 §八；确认记录须由沟通写入 `docs/communication/` |
| 客户实施授权 | **未给** | 与闸门 2 分开；未给前不派发、不改代码 |
| 实施前验收标准 | 未写盘 | 由内置独立验收在闸门 2 后、实施前写 `docs/acceptance/role-root-docs-display-criteria-v1.md`；沟通确认其路径/版本 |

**三个事实**：本计划写盘 ≠ 派发 ≠ 实施；闸门 2 确认角色/写集/顺序/验收安排，**不等于实施授权**；实施授权由沟通在闸门 2 后另行取得。本计划不写实施授权记录。

---

## 二、五维判断与决策表

### 2.1 五维判断

| 维度 | 判断 | 依据 |
| --- | --- | --- |
| 1. 责任独立性 | **无新增持续独立责任** | 这是角色详情只读展示/索引能力，横跨既有分层：Model 白名单/候选契约与 Service 校验归桌面窗口；桌面索引/`RoleView` 装配归桌面窗口；渲染分组/点击/焦点归桌面UI；`ui.profile.*` key 归项目管理（shared 唯一属主）；跨层集成/真实 Electron 归测试。没有产生需要不同知识与契约的新独立责任 |
| 2. 范围归属 | **现有 Section 1 精确覆盖；无默认缺口** | 方案 §6/§7 路径逐文件映射（见 §三）。`src/model/project-document.ts`、Service、Provider 均在桌面窗口 Section 1；`app/renderer/` 是桌面UI 目录授权；`src/common/shared/` 是项目管理目录授权；`test/桌面应用/` 是桌面窗口逐文件授权；`test/桌面UI/`、`test/测试/` 是各自目录授权。新增 `app/renderer/src/chat/profile-docs.ts` 在已接受目录内，不需要重写边界 |
| 3. 契约影响 | **有，跨角色 additive 契约** | `RoleView.rootDocs?`、`ProjectDocumentRoleCandidates.rootDocs?`、Model 的 `ROLE_ROOT_DOC_FILENAMES`/`RoleRootDocName`、Service 的精确路径校验、渲染层 `rootDocs` 消费与 i18n key。单一主属：Model/Service/Interface/索引 → 桌面窗口；渲染 → 桌面UI；key → 项目管理；跨层证据 → 测试。**不新增 IPC/preload/通道；不改变 `ProjectDocumentRef` 形状** |
| 4. 证据独立性 | **已满足** | 各开发角色跑自己的单测/层测试；测试角色独立跑跨层集成与真实 Electron 复跑；桌面UI 产出 Phase 4A 受控冒烟与布局证据；内置独立验收按实施前标准判定。实施者不自验产品，统筹不改验收结论 |
| 5. 协调成本 | **维持现有团队最低** | 4 个实施 worker（桌面窗口、桌面UI、项目管理、测试）+ 内置独立验收 + 统筹。新增“文档展示”专职角色会增加建卡、边界、交接与证据成本，而本轮没有新的持续独立责任；不新增角色 |

### 2.2 决策表结果

**不变，派给现有角色。**

- **无新增、无拆分、无合并、无角色卡改动、无边界变更。**
- 参与实施 worker：**桌面窗口、桌面UI、项目管理、测试**。
- **内置独立验收**写实施前标准与实施后报告；**统筹**写本计划、变更包与调度记录。
- **不启用人事**：无角色/边界变更，无需写卡。
- **不启用装配**：不改 `package.json`/`vite.config.ts`/`tsconfig.json`/入口；`app/main.ts`、`app/preload.cjs` 不改。
- **不启用运行时核心/门禁引擎/编排/各适配器**：`src/model/runtime.ts`、`src/model/{boundary,role,decision}.ts`、`src/common/门禁引擎/**`、`src/common/编排/**`、`src/pipeline/**`、`src/provider/**` 均不改（`src/provider/project-document/**` 虽在桌面窗口边界内，但按 Q9 A 明确不改）。
- **不启用 UIUX**：布局用现有伸缩/换行/`min-width:0`/`overflow-wrap` 解决；若必须改变固定高度、最小窗口、侧栏宽度等设计基线，停止回报，另行确认，不默认扩角色。

### 2.3 条件项（不是默认，触发即停止回报）

1. **`test/桌面应用/` 新文件**：该目录对桌面窗口是逐文件授权。本计划默认**不新建**；新断言并入 `project.test.ts`、`project-document.test.ts`、`interface.test.ts`、`e2e/main.mjs`。确需新文件时，停止并回报，交 ANS 人事按本计划与闸门 2 的额外确认补精确单文件条目，不默认派发。
2. **`src/model/project-document.ts` / Service 归属**：已核对在桌面窗口 Section 1，**不是边界缺口**。若实施发现实际路径/归属与边界不一致，停止并列为闸门 2 边界缺口，交人事；不自行改写边界。
3. **Windows 读取模型**：Q9 A 已确认只列名 + 既有 `UNSUPPORTED_ENVIRONMENT` 提示；不得改 Provider、不得旁路读取、不得把本变更升 T3。若客户改主意要求 Windows 实读正文，停止并重开闸门 1，另开设计。
4. **i18n key**：现有 key 不足以表达“角色根文档”分组、整节空态和单文件打开标签；项目管理须新增 key（或在报告中逐项说明可复用 key 的语义，且不得在渲染层硬编码中文）。若 key 命名/目录与当前 i18n 基线变化，按实际基线调整名称，不改变语义。
5. **POSIX 实读证据**：若当前环境无 macOS/Linux，POSIX 真读只能记录「未执行」并说明环境限制；不得用 Windows 的“文件存在”冒充“正文可读”。Windows fail-closed 证据仍必须完整。验收可按标准判 `insufficient evidence`，由统筹安排补证或按客户决定处理。
6. **共享文件并发写**：`app/desktop/interface.ts`、`app/desktop/project.ts`、`app/renderer/src/shell/ProfilePanel.tsx`、`DocumentView.tsx`、`chat/document-view.ts`、`chat/types.ts`、`stores/drawer-store.ts`、`shell/phase4a.css`、`test/桌面应用/interface.test.ts`、`e2e/main.mjs` 已被 i18n/目录 v3 等候选修改；S1 必须冻结候选哈希，任何角色不得与另一变更并发写同一文件。

### 2.4 考虑过的选项

| 选项 | 结论 | 理由 |
| --- | --- | --- |
| A. 现有 4 个 worker（桌面窗口、桌面UI、项目管理、测试）+ 内置验收 + 统筹 | **采用** | 写集与现有 Section 1 一一对应；Model/Service/Interface、渲染、key、跨层证据分离；协调成本最低 |
| B. 新增“文档展示”专职角色 | 否决 | 一次性横向展示能力，不构成持续独立责任；现有 owner 已覆盖；新增角色触发人事写卡与额外闸门 |
| C. 只改渲染层（方案 §9.3 C） | 否决 | 索引没有根文档条目；渲染层无文件系统能力；无法生成 opaque refs，`DocumentView` 无法读取 |
| D. 主进程索引时读正文、ProfilePanel 直接渲染（方案 §9.4 D） | 否决（Q9 A） | 绕过受限 Provider 的 scope/符号链接/大小/编码/竞态校验，形成第二条内容读取路径；与“点击 `DocumentView` 只读打开”冲突 |
| E. 扩展 Windows 受限读取 Provider（方案 §9.5 E） | 否决（Q9 A） | 改变 v1 已接受的平台安全取舍，需独立安全设计与 T3 级验证；不能压进本 T2 |
| F. 由一个角色包办全部实现 | 否决 | 跨越桌面窗口/桌面UI/项目管理/测试的 Section 1；违反单一属主与写权限 |
| G. 与 i18n/目录 v3/治理写卡/返工路由合并验收 | 否决 | 客户已确认独立变更、独立验收；合并会污染候选与结论 |
| H. 新建 `test/桌面应用/profile-docs.test.ts` | 否决（默认） | 该目录逐文件授权；纯逻辑测试并入既有 `test/桌面UI/document-view.test.ts`，集成用既有 Phase 4A/e2e |

---

## 三、参与角色、精确写集与边界

> 每个文件同一时间只有一个 owner。未列路径默认只读。新增文件仅限已授权目录内；角色卡/边界/YAML、他角色资料、`.ans` 治理状态不属任何 worker 写集。

### 3.1 Section 1 覆盖图（2026-10-23 核对权威 `boundary.md`）

| 方案 §6/§7 路径 | 所属角色 | Section 1 依据（权威 `boundary.md`） | 本任务写入 |
| --- | --- | --- | --- |
| `src/model/project-document.ts` | 桌面窗口 | 「单文件 `src/model/project-document.ts` / B 专属 Model 唯一主属：版本、文档引用、可信导入类型、请求/结果与错误类型；不含 IO」 | 是（白名单常量 + `rootDocs?` 候选字段） |
| `src/service/project-document/impl/read-project-document.ts` | 桌面窗口 | 「单文件 `src/service/project-document/impl/read-project-document.ts` / B Service 实现：唯一 scope registry、清单资格、预算/格式/编码政策与错误映射」 | 是（精确路径校验并追加 paths） |
| `src/service/project-document/abstract/document-reader.ts`、`public/read-project-document.ts` | 桌面窗口 | 各对应单文件条目 | **默认不改**；仅类型透传确需时最小改动，须在 S1 说明 |
| `src/pipeline/project-document/read-project-document.ts` | 桌面窗口 | 「单文件 `src/pipeline/project-document/read-project-document.ts` / B Pipeline 公开入口」 | **默认不改**；仅透传既有 reader |
| `src/provider/project-document/**` | 桌面窗口 | 各对应单文件条目（abstract/public/impl） | **不改（Q9 A）**；保持 lstat/realpath/O_NOFOLLOW/有界读/编码校验 |
| `app/desktop/project.ts` | 桌面窗口 | 「目录 `app/desktop/` / 桌面 Interface（主进程侧纯逻辑）」 | 是（`RoleRootDocEntry`/`RoleDocsIndex.rootDocs`/`readRoleDocsIndex`/`projectDocumentCandidates`） |
| `app/desktop/interface.ts` | 桌面窗口 | 同上「目录 `app/desktop/`」 | 是（`RoleView.rootDocs?`；`listProject` 装配） |
| `app/preload.cjs` | 桌面窗口 | 「单文件 `app/preload.cjs` / 受限 IPC 桥」 | **不改**（无新通道） |
| `test/桌面应用/project.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/project.test.ts` / 主进程侧测试：枚举构造 ProjectConfig」 | 是（索引白名单/顺序/memo 排除/docs 不回归） |
| `test/桌面应用/project-document.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/project-document.test.ts` / B 专属测试：服务/Provider 预算、编码、句柄竞态、grant/scope 与引用失效」 | 是（候选校验/refs/Windows fail-closed/旧 docs 不回归） |
| `test/桌面应用/interface.test.ts` | 桌面窗口 | 「单文件 `test/桌面应用/interface.test.ts` / 主进程侧测试：Interface 处理器」 | 是（`RoleView.rootDocs` 装配/内置空态/无新 IPC） |
| `test/桌面应用/e2e/main.mjs` | 桌面窗口 | 「单文件 `test/桌面应用/e2e/main.mjs` / 桌面端到端总自检台（真实 Electron）」 | 是（**逐文件授权**；Windows 列表+不可用提示；POSIX 实读分开） |
| `app/renderer/src/chat/types.ts` | 桌面UI | 「目录 `app/renderer/` / 渲染进程前端（含渲染层 React 源码 src/、样式、组件、渲染层 tsconfig 与构建产物 dist/）」 | 是（`RoleView.rootDocs?`） |
| `app/renderer/src/chat/profile-docs.ts`（新增） | 桌面UI | 同上「目录 `app/renderer/`」 | 是（纯展示分组/过滤/精确匹配；目录内新文件，不需重写边界） |
| `app/renderer/src/chat/document-view.ts` | 桌面UI | 同上「目录 `app/renderer/`」 | 按需（精确匹配 helper；不复制解析器） |
| `app/renderer/src/shell/ProfilePanel.tsx` | 桌面UI | 同上「目录 `app/renderer/`」 | 是（两组/空态/count/按钮/点击/焦点） |
| `app/renderer/src/shell/DocumentView.tsx` | 桌面UI | 同上「目录 `app/renderer/`」 | 按需（返回焦点/阅读态；不改 scope/错误语义） |
| `app/renderer/src/stores/drawer-store.ts` | 桌面UI | 同上「目录 `app/renderer/`」 | 是（`openDocumentList` 可选 `targetRelativePath`；刷新后精确匹配） |
| `app/renderer/src/shell/phase4a.css` | 桌面UI | 同上「目录 `app/renderer/`」 | 是（分组/行/按钮样式；不新增固定高度） |
| `test/桌面UI/document-view.test.ts` | 桌面UI | 「目录 `test/桌面UI/` / 渲染层 React 组件与设计系统守卫测试」 | 是（纯分组/匹配逻辑并入既有文件） |
| `test/桌面UI/phase4a-electron-smoke.mjs` | 桌面UI | 同上「目录 `test/桌面UI/`」 | 是（夹具 `rootDocs`/点击/空态/焦点/布局） |
| `test/桌面UI/phase4a-smoke-preload.cjs` | 桌面UI | 同上「目录 `test/桌面UI/`」 | 按需（夹具 shape 变化时） |
| `test/桌面UI/source-guard.test.ts` | 桌面UI | 同上「目录 `test/桌面UI/`」 | 按需（新增组件/样式触发守卫时保持通过） |
| `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` | 项目管理 | 「目录（私有）`src/common/shared/` / 跨角色共享组件」 | 是（仅新增 `ui.profile.*` key；不改 shared 属主） |
| `test/项目管理/shared/i18n.test.ts` | 项目管理 | 「目录（测试）`test/项目管理/shared/` / 共享组件的单元测试与夹具」 | 是（key parity/值断言） |
| `test/项目管理/shared/i18n-guard.test.ts` | 项目管理 | 同上「目录（测试）`test/项目管理/shared/`」 | 按需（仅允许清单受影响时） |
| `test/测试/p1p7-document-integration.test.ts` | 测试 | 「目录（测试）`test/测试/` / 跨角色联调、完整流程与回归用例」 | 是（根文档候选/refs/Windows-POSIX 分开） |
| `test/测试/i18n-integration.test.ts` | 测试 | 同上「目录（测试）`test/测试/`」 | 按需（新增 key parity/值；文件名不翻译） |
| `docs/acceptance/`（标准、报告） | 独立验收（内置） | 技能 `references/acceptance-role.md` 默认写权 | 是（不派 worker） |
| `docs/scheduling/`（本计划、变更包） | 统筹（内置） | 技能 `references/scheduler.md` 默认写权 | 是（不派 worker） |

### 3.2 桌面窗口（契约与索引先行）

- **写集（精确）**：
  - `src/model/project-document.ts`：新增 `ROLE_ROOT_DOC_FILENAMES`（`feature-map.md`、`functional-description.md`、`api-spec.md`，顺序即展示顺序）与 `RoleRootDocName`；`ProjectDocumentRoleCandidates` 增加可选 `rootDocs?: readonly { path: string; kind: "file" }[]`；不写盘、不读文件、不复制白名单。
  - `src/service/project-document/impl/read-project-document.ts`：`updateListing` 对每个非内置角色计算 `roleDir` 与 `expectedRootPaths`（`roleDir + "/" + 白名单文件名`），只接受 `kind === "file"` 且路径精确命中的候选；`memo.md`、任意根文件、`../feature-map.md`、绝对路径、反斜杠、大小写变体、`docs/feature-map.md` 静默拒绝、不铸造引用；合法根路径追加在既有 card/changelog/docs 之后，继续经过 `eligible()`/`format()`/Set 去重；既有 docs 路径处理不变；Windows 不建立 scope、不铸造 refs。
  - `app/desktop/project.ts`：新增 `RoleRootDocEntry`；`RoleDocsIndex` 增加 `rootDocs: RoleRootDocEntry[]`；`readRoleDocsIndex` 由 `cardPath` 取角色目录，`lstat` 角色目录（非目录/符号链接返回空索引），对白名单三个文件名逐个 `lstat`，只接受 `isFile()` 且非符号链接；存在则 `path: roleDirRel + "/" + name`；**不对角色根目录 `readdir`/glob，不读取 `memo.md`，不读取根文档正文**；`changelog`/`docs` 既有逻辑逐字保留；`projectDocumentCandidates` 透传 `rootDocs`（仅元数据）。
  - `app/desktop/interface.ts`：`RoleView.rootDocs?`；`listProject` 对非内置、`cardPath` 非空角色装配 `idx.rootDocs`（缺省 `[]`）；内置角色 `rootDocs: []`、不读项目根；`documents` 继续由既有 Service 生成，根文档 refs 追加在既有条目之后；不新增 IPC、不改 preload。
  - `test/桌面应用/project.test.ts`：索引白名单/固定顺序/部分缺失/`memo.md` 排除/`changelog` 可选/`docs` 不回归/`cardPath` 异常/内置空态。
  - `test/桌面应用/project-document.test.ts`：合法 `rootDocs` 生成 refs、`memo`/任意根文件/`../`/绝对路径/反斜杠/冒号/`docs/feature-map.md` 拒绝、重复去重、既有 refs 前缀不变、`not-applicable` 普通文本、Windows `UNSUPPORTED_ENVIRONMENT` 无 refs/无字节、旧 docs 不回归。
  - `test/桌面应用/interface.test.ts`：`RoleView.rootDocs` 装配、内置角色空态、`documents` 含根文档 refs、旧 renderer/旧 main 兼容、无新 IPC/preload 断言。
  - `test/桌面应用/e2e/main.mjs`：真实 Electron（Windows 列出 3 个文件名 + 点击显示 `UNSUPPORTED_ENVIRONMENT`；POSIX 实读正文；fixture 字节/mtime 前后不变）。**逐文件授权**：只改该既有文件，不新建文件、不删除既有断言。
- **不写**：`src/provider/project-document/**`（Q9 A）、`app/preload.cjs`、`app/main.ts`、`src/common/shared/**`、`app/renderer/**`、`test/桌面UI/**`、`test/测试/**`、`package.json`/`tsconfig.json`/`vite.config.ts`、角色卡/边界、`docs/scheduling/`、`docs/acceptance/`。
- **可观察交付**：`rootDocs` 恰好白名单顺序、`memo` 永不出现、`changelog` 独立、`docs` 逐字不回归；Service 只铸造精确路径 refs；Windows fail-closed 无 scope/refs/正文；`node --test` 精确文件与 `npm run typecheck` 原始输出；候选哈希/diff/status；**`git diff -- src/provider/project-document` 为空**。

### 3.3 桌面UI（依赖 S3 契约与 S5 key）

- **写集（精确）**：
  - `app/renderer/src/chat/types.ts`：`RoleView` 增加可选 `rootDocs?: unknown[]`（渲染层只按后端数组显示，不复制白名单）。
  - `app/renderer/src/chat/profile-docs.ts`（新增，`app/renderer/` 目录内）：纯展示分组/过滤/精确匹配（`rootDocs` 中 `path` 非空、`kind !== "directory"`；按后端顺序；`memo.md` 显示兜底排除；按 `relativePath` 精确匹配 refs）；不依赖 DOM/Node/fs，不构造路径。
  - `app/renderer/src/shell/ProfilePanel.tsx`：“文档”节两组（角色根文档 / `docs/` 目录）；根文档组只在至少一条存在时渲染；`docs` 组只在 `docs.length > 0` 时渲染；节 count = 根文档 file 数 + `docs` file 数（目录不计）；两组都空显示 `ui.profile.noRoleDocs`；有根文档无 docs 不显示“无 docs/”整节空态；根文档行按钮使用 `ui.profile.openRootDoc` + 文件名作为 `title`/`aria-label`，点击调用 `openDocumentList(roleId, "card", targetRelativePath)`；`memo.md` 不渲染；`role-card`/`boundary` 不重复。
  - `app/renderer/src/shell/DocumentView.tsx`：返回角色资料时焦点回触发根文档按钮（`data-root-doc-path` 或等价标记）；无法定位时回退“查看已列文档”按钮；不改 scope/错误码语义。
  - `app/renderer/src/stores/drawer-store.ts`：`openDocumentList` 增加可选第三参数 `targetRelativePath`；先用当前 refs 建立列表/临时 scope，刷新 `listProject` 后按 `ref.relativePath === targetRelativePath` 精确匹配；命中且 scope 可读则调用既有 `readDocument(ref)`；未命中/无 scope/平台不支持停留列表态并显示既有结构化错误；不构造路径、不生成 `documentId`、不重试风暴。
  - `app/renderer/src/chat/document-view.ts`：如需精确匹配纯 helper，在此增加；不复制解析器/白名单。
  - `app/renderer/src/shell/phase4a.css`：分组/行/按钮样式；`min-width: 0`、允许换行、`overflow-wrap: anywhere`；不新增固定高度/固定宽度，不为中英文各写一套布局。
  - 测试：`test/桌面UI/document-view.test.ts`（分组/顺序/count/空态/部分缺失/memo 过滤/精确匹配，并入既有文件）；`test/桌面UI/phase4a-electron-smoke.mjs`（夹具 `rootDocs` 3 + refs；两组；点击根文档进入阅读态；memo 不出现；空态；焦点；960×620/200%）；`test/桌面UI/phase4a-smoke-preload.cjs`（按需补受控回包）；`test/桌面UI/source-guard.test.ts`（按需保持通过）。
- **不写**：`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`test/桌面应用/**`（不新建、不修改）、`test/项目管理/**`、`test/测试/**`、`package.json`/`tsconfig.json`/`vite.config.ts`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。
- **硬约束**：**不得在 `test/桌面应用/` 写入任何文件**；默认不新建 `test/桌面UI/` 测试文件（纯逻辑并入 `document-view.test.ts`）；若确需新增，该目录是目录授权，但须在变更包列明并在 S1 写集确认，不默认扩大。
- **可观察交付**：两组标题/顺序/count/空态正确；部分缺失不伪造；有根文档无 docs 不显示整节空；内置角色空态；点击可读/不可读分支正确；焦点回归；960×620/200%/窄窗无水平溢出；`node --test test/桌面UI/document-view.test.ts`、`npm run typecheck:renderer`、`npm run build:renderer`、Phase 4A Electron 原始输出/截图；候选哈希。

### 3.4 项目管理（i18n key 唯一写入者）

- **写集（精确）**：
  - `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`：新增 `ui.profile.*` key；建议语义（最终名称以项目管理现有命名规范为准）：
    - 必需：`ui.profile.docsGroupRoot`（角色根文档 / Role root documents）、`ui.profile.docsGroupSubdir`（docs/ 目录 / docs/ directory）、`ui.profile.noRoleDocs`（（暂无角色文档） / (no role documents)）、`ui.profile.openRootDoc`（只读打开 {name} / Open {name} read-only）。
    - Q2 A 可选副标签：`ui.profile.rootDoc.featureMap`（功能导航 / Feature map）、`ui.profile.rootDoc.functionalDescription`（模块视图与代码位置 / Module view and code locations）、`ui.profile.rootDoc.apiSpec`（接口 / 实现报告 / API / implementation report）。
    - 文件名 `feature-map.md`、`functional-description.md`、`api-spec.md`、`docs/` 是路径/内容标识，**不翻译**；`not-applicable` 是文件内容，不翻译、不加 badge；`changelog.md` 现有 `ui.profile.changelogTab`/`noChangelog` 不改。
  - `test/项目管理/shared/i18n.test.ts`：zh/en key 全集 parity、新增 key 值断言；`i18n-guard.test.ts` 仅在允许清单受影响时按需更新（新增文本进目录，不新增硬编码）。
- **现有 key 是否足够**：`ui.profile.docsTab`、`ui.profile.noDocs`、`ui.profile.viewListedDocs` 只能覆盖旧节标题/旧 docs 空态/旧清单按钮；按方案 §5.5.1，`docs/` 组只在有内容时渲染，旧 `noDocs` 不能替代根文档分组、整节空态或单文件打开标签。**结论：需要新增 key**；不得在渲染层硬编码中文。
- **不写**：`app/**`、`src/model/**`、`src/service/**`、`src/pipeline/**`、`src/provider/**`、其他 shared 文件、`test/桌面UI/**`、`test/桌面应用/**`、`test/测试/**`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界；不改 shared 属主/目录。
- **可观察交付**：key 契约先冻结（S5）供桌面UI typecheck；zh/en parity/typecheck 原始输出；key diff；候选哈希。

### 3.5 测试（跨层、真实 Electron、证据）

- **写集（精确）**：`test/测试/`（目录）。
  - `test/测试/p1p7-document-integration.test.ts`：根文档候选 → Service refs 的跨层集成；合法/非法候选（memo/任意根文件/`../`/绝对路径/符号链接）；既有 card/changelog/docs refs 不回归；Windows `UNSUPPORTED_ENVIRONMENT` 无 refs/正文；POSIX 真实读取（如环境可用）。
  - `test/测试/i18n-integration.test.ts`（按需）：新增 key 的 zh/en parity/值；文件名/路径/`not-applicable` 不翻译；默认 zh；无新增硬编码 UI 文案。
  - 跨层 `listProject` → `RoleView` → renderer 展示：默认通过 `p1p7` + 桌面窗口 `interface.test.ts` + 桌面UI Phase 4A/真实 e2e 组合取证；如确需新文件，只能在 `test/测试/` 目录内新增并在 S1 写集确认，不写其他角色测试。
- **不写**：产品源码、其他角色单测、`test/桌面应用/**`（由桌面窗口 owner 写）、`test/桌面UI/**`（由桌面UI owner 写）、`test/项目管理/**`、`docs/scheduling/`、`docs/acceptance/`、角色卡/边界。
- **可观察交付**：定向集成原始输出、Windows/POSIX 分开记录、失败分类（新增失败 vs 既有失败 vs 不可用/跳过）、候选哈希/diff/status；不修改断言保绿；不把测试角色自测当验收。

### 3.6 内置验收与统筹（不派 worker）

- **内置独立验收**：写 `docs/acceptance/role-root-docs-display-criteria-v1.md`（实施前）与 `role-root-docs-display-report-v1.md`（实施后）；基于客户闸门 1 确认的方案 v1 与闸门 0 意图记录；团队计划只作范围/写集依据，不是标准来源；不派 `角色卡/独立验收` worker（其 Section 1 不含 `docs/acceptance/`，且会造成双重验收）。
- **统筹**：写本计划、`docs/scheduling/role-root-docs-display-change-v1.md`（S7 变更包）、调度记录；不写方案/实现/测试/验收结论；不派 worker；`docs/acceptance/` 不派 worker。

### 3.7 明确不改（本变更的硬边界）

- `src/provider/project-document/**`（Q9 A；虽在桌面窗口 Section 1，但明确不改）。
- `app/preload.cjs`、`app/main.ts`、IPC 通道名/请求/回包形状、`documentScope` 语义。
- `src/service/project-document/abstract/document-reader.ts`、`public/read-project-document.ts`、`src/pipeline/project-document/read-project-document.ts`（默认不改；仅类型透传确需时最小改动并回报）。
- `src/model/runtime.ts`、`src/model/boundary.ts`、`src/model/role.ts`、`src/model/decision.ts`、`src/service/gate/**`、`src/common/门禁引擎/**`、`src/common/编排/**`、`src/pipeline/orchestration/**`。
- `角色卡/**`（角色卡、boundary、YAML、feature-map、memo、api-spec、changelog、docs）；`docs/**` 既有管理记录；目标项目 `ans-gateway/**`。
- `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`electron-builder.yml`、发布配方/冻结源、`.ans`、`.env`、依赖。
- 现有 `docs/` 遍历/排序/500 条上限/隐藏文件跳过；现有 `changelog` 读取逻辑。

### 3.8 工作量与范围预留

工作量按文件与检查项计，不编造工时：

| 角色 | 规模（约） | 预留 |
| --- | --- | --- |
| 桌面窗口 | 4 个产品文件（Model/Service/`project.ts`/`interface.ts`）+ 4 个既有测试文件（`project.test.ts`、`project-document.test.ts`、`interface.test.ts`、`e2e/main.mjs`）+ 自身文档 | S2 独占 Model/Service/`project.ts` 与 `project.test.ts`/`project-document.test.ts`；S3 独占 `interface.ts`/`interface.test.ts`；S6 独占 `e2e/main.mjs`（逐文件） |
| 桌面UI | 1 个新增纯逻辑文件 + 5–6 个渲染层产品文件 + 2 个既有测试 + 2 个条件测试 + 自身文档 | S4 独占 `app/renderer/` 列明文件与 `test/桌面UI/` 既有文件 |
| 项目管理 | 2 个 messages 文件 + 1 个既有测试（+1 条件 guard） | S5 独占 `src/common/shared/i18n/messages/` 两份与 `test/项目管理/shared/` 相关文件 |
| 测试 | 2 个既有/按需集成测试 + 证据 | S6 独占 `test/测试/` 相关文件 |
| 内置验收 | 1 份标准 + 1 份报告 | S7；`docs/acceptance/` |
| 统筹 | 本计划 + 1 份变更包 | S7；`docs/scheduling/` |

范围预留规则：每个阶段开始前按角色 `roleId` 与精确路径预留；任何角色不得写其他角色路径；同一文件同一时间只有一个写入者。Model/Service/`RoleView` 契约冻结前，桌面UI 不写引用新字段的代码；S5 key 冻结前，桌面UI 不引用新 key；`e2e/main.mjs` 只由桌面窗口写，测试角色只运行/复跑。

### 3.9 与既有未提交变更的隔离与排序

- 工作树已有四项独立变更候选：i18n（T2）、目录 v3（T3）、治理写卡（T3）、验收返工路由（T3）；均有独立验收报告判定「通过（当前候选）」，但**均未提交**。本变更与它们**分别闸门、分别实施、分别验收**，不引用其验收结论。
- 共享文件（可能被上述变更修改）：`app/desktop/interface.ts`、`app/desktop/project.ts`、`app/renderer/src/chat/document-view.ts`、`chat/types.ts`、`shell/ProfilePanel.tsx`、`shell/DocumentView.tsx`、`stores/drawer-store.ts`、`shell/phase4a.css`、`test/桌面应用/interface.test.ts`、`e2e/main.mjs`、`src/common/shared/i18n/messages/*`。S1 必须逐文件记录 `git hash-object` + `sha256sum` 基线；任何共享文件不得被两个变更并发写。
- **推荐顺序**：i18n 收口（独立验收通过且候选冻结/提交，优先）→ 本变更 S2–S7。若客户允许在未提交候选上实施，S1 以哈希冻结 i18n/目录 v3/治理写卡/返工路由候选，本变更只列相对 S1 基线的增量；既有改动声明为「既有上下文」，不纳入本变更候选，也不得用本变更验收为其背书。本计划不自行提交。
- 若目录 v3 或 i18n 在本变更实施期间仍需改同一共享文件，必须停止并回报统筹，重排窗口；不得以“只是小改”并行写。

---

## 四、阶段、依赖与并行组（S1–S7）

### 4.1 阶段节点

| 节点 | 阶段 | 角色 | 可观察交付 | 前置节点 |
| --- | --- | --- | --- | --- |
| S1 | 闸门/标准/基线/预检 | 沟通 → 客户；内置验收；测试；统筹 | 闸门 2 确认记录 + 实施授权（分开）+ `docs/acceptance/role-root-docs-display-criteria-v1.md` + 当前 HEAD/工作树基线（逐文件哈希、typecheck/受影响套件基线、环境）+ 角色/边界预检 | 本计划写盘 |
| S2 | 索引/Model/Service/候选 | 桌面窗口 | Model 白名单/`rootDocs?`；Service 精确校验；`project.ts` 索引/候选；`project.test.ts`/`project-document.test.ts`；Windows fail-closed；不碰 Provider | S1 完成 + i18n/既有候选冻结 |
| S3 | 桌面 Interface | 桌面窗口 | `RoleView.rootDocs?`；`listProject` 装配；`interface.test.ts`；无新 IPC/preload；旧 renderer/旧 main 兼容 | S2 退出（Model/Service/候选契约冻结） |
| S4 | 渲染层 | 桌面UI | `types.ts`/`profile-docs.ts`/`ProfilePanel`/`DocumentView`/`drawer-store`/CSS；分组/空态/点击/焦点/布局；纯逻辑测试 | S3 退出 + S5 key 冻结（如新增 key） |
| S5 | i18n key | 项目管理 | `ui.profile.*` zh/en key + parity/typecheck；或 N/A（现有 key 足够）并说明 | S1 完成；可与 S2/S3 并行；**必须在 S4 入口前完成** |
| S6 | 测试/真实 Electron | 桌面UI + 桌面窗口 + 测试 | Phase 4A 受控冒烟；`e2e/main.mjs` 真实 Electron（Windows 列表+不可用提示；POSIX 实读分开）；`p1p7`/`i18n-integration`；截图/几何/字节/mtime；typecheck/build | S2–S5 完成 |
| S7 | 变更包 + 独立验收 | 统筹 → 内置独立验收 | 变更包（候选哈希、改动路径、节点、证据链接、T2）→ 验收报告（通过/返工/证据不足） | S6 完成 |

### 4.2 依赖/并行/串行

- **必须串行**：S1 → S2（基线/标准先于代码）；S2 → S3（Model/Service/候选契约冻结先于 Interface 消费）；S3 → S4（`RoleView.rootDocs` 契约冻结先于渲染层）；S5 → S4（新增 key 必须先落地；若 S5 判 N/A，则 S4 只用既有 key）；S6 → S7（终验针对合并后的实际候选）。
- **可并行**：S2 与 S5（不同角色/写集，`src/common/shared/i18n/messages/` 与桌面窗口写集不相交）；S2 与 S3 内部按桌面窗口同角色串行，不并行写；S5 与 S3 可并行（key 与 Interface 契约不同文件）。S6 内部：桌面UI Phase 4A、桌面窗口真实 e2e、测试角色 p1p7/i18n 集成可分组并行，但每组使用独立临时 userData/临时项目根/日志，不共享可变夹具。
- **不允许**：S4 与 S5 并行写引用新 key 的组件（key 未冻结）；S2/S3 与 S4 并行写 `RoleView` 类型（契约未冻结）；任何角色写 `test/桌面应用/` 新文件；任何角色写 `docs/scheduling/` 或 `docs/acceptance/`；任何角色在 `src/common/shared/i18n/messages/` 之外复制 UI 文案或 key。
- **与既有变更的窗口**：i18n/目录 v3/治理写卡/返工路由候选冻结前，不开始 S2/S4 的共享文件改动；S1 明确冻结基线。若客户要求并行，必须逐变更记录基线哈希并保证同一文件不并发写；默认串行。

### 4.3 各阶段入口/出口/证据

- **S1 入口**：本计划写盘。**出口**：闸门 2 确认记录 + 实施授权记录齐备（两者分开）；确认记录覆盖本计划版本、参与角色、精确写集、无角色/边界变更、T2、阶段顺序、验收安排、证据口径；内置验收标准写盘并经沟通确认；基线命令/环境/计数/失败分类可复算；逐文件 `git hash-object` + `sha256sum`；角色卡/边界预检通过；确认 `test/桌面应用/` 不新建文件；确认 `src/provider/project-document/**` 零改动计划。**未满足不启动 S2**。
- **S2 入口**：S1 完成；i18n/既有候选冻结；`src/model/project-document.ts`/Service/`project.ts` 基线哈希记录。**出口**：白名单/顺序/memo 排除/changelog 可选/docs 不回归；Service 精确路径拒绝非法候选；无 Provider diff；`node --test test/桌面应用/project.test.ts test/桌面应用/project-document.test.ts` + `npm run typecheck` 原始输出；Windows fail-closed 证据；候选哈希/diff/status。
- **S3 入口**：S2 退出（Model/Service/候选契约冻结）。**出口**：`RoleView.rootDocs?` 装配；内置角色空态；`documents` 含根文档 refs；preload/IPC 未改；旧 renderer/旧 main 兼容；`node --test test/桌面应用/interface.test.ts` + `npm run typecheck` 原始输出；候选哈希。
- **S4 入口**：S3 退出；S5 key 冻结（或 N/A 记录）。**出口**：两组/顺序/count/空态/部分缺失/memo 过滤；点击打开/不可用分支；焦点回归；960×620/200% 布局；`node --test test/桌面UI/document-view.test.ts`、`npm run typecheck:renderer`、`npm run build:renderer` 通过；候选哈希。
- **S5 入口**：S1 完成；i18n 消息目录基线哈希记录。**出口**：新增 key zh/en parity；文件名/路径/`not-applicable` 不翻译；无硬编码中文；`node --test test/项目管理/shared/i18n.test.ts` + `npm run typecheck` 原始输出；或 N/A + 理由（现有 key 足够）。**S5 必须在 S4 入口前完成**。
- **S6 入口**：S2–S5 完成。**出口**：Phase 4A 受控冒烟；真实 Electron Windows 列表+`UNSUPPORTED_ENVIRONMENT`；POSIX 实读（如环境可用）分开记录；`p1p7`/`i18n-integration`；截图/几何/字节/mtime；typecheck/typecheck:renderer/build；失败分类；候选哈希/diff/status。
- **S7 入口**：S6 完成。**出口**：变更包完整、候选可复算；独立验收按标准给出通过/返工/证据不足；统筹只按匹配当前候选的结论放行。**S7 通过只表示当前候选满足标准，不授权提交/推送/合并/发布。**

---

## 五、测试与验收安排

### 5.1 T2 口径

- **T2 默认**：受影响角色单测/层测试 + 跨角色集成（`listProject` → `RoleView` → renderer；`projectDocumentCandidates` → Service refs）+ 受影响 typecheck/渲染构建 + 真实 Electron；不默认全量回归。
- **不因“只读展示”降档**：本变更触及 Model/Service/Interface/渲染层契约，按 T2；不得只跑单测、跳过跨层或真实 Electron。
- **升档**：若证据不足以建立跨层结论、候选无法复算、共享文件混入未隔离改动、或实施被迫改 Provider/边界/读取模型，按 `references/testing.md` 升档补证或停止重开工序；升档不降档。

### 5.2 测试矩阵

#### 后端索引（`readRoleDocsIndex`）

| 用例 | 期望 |
| --- | --- |
| 角色目录有 3 个根文档 + `memo.md` + `changelog.md` + `docs/` | `rootDocs` 恰好 3 条、白名单顺序；`memo.md` 不在任何字段；`changelog` 仍读到；`docs` 与现状一致 |
| 只有 3 个根文档，无 changelog/docs | `rootDocs` 3；`changelog: null`；`docs: []` |
| 只有 memo（无根文档） | `rootDocs: []`；不读 memo；不抛错 |
| 缺少其中一个根文档 | 只返回存在的；顺序保持相对 |
| `cardPath` 含 `..`/绝对路径/`C:`/反斜杠/空段 | 返回空索引；不越出项目；不抛错 |
| 根目录是符号链接 / 根文档是符号链接（POSIX） | 不列入；不读正文；不抛错 |
| 内置角色（`cardPath` 空） | 不调用索引（Interface 现有守卫）；`rootDocs: []` |
| 现有 docs/changelog 夹具 | 不回归（条目、排序、数量、500 上限、隐藏文件跳过） |

#### 候选/Service（`project-document`）

| 用例 | 期望 |
| --- | --- |
| 合法 `rootDocs` 三条 | 生成三条 opaque refs；`relativePath` 项目相对；`label` 文件名；`format: markdown` |
| 候选含 `memo.md` | 不生成 ref（Service 精确白名单拒绝） |
| 候选含任意根文件/`docs/feature-map.md`/`../feature-map.md`/绝对路径/反斜杠/冒号/大小写变体 | 不生成 ref；不抛错；既有 refs 不受影响 |
| 重复根文档候选 | 去重为一条 ref |
| 既有 card/changelog/docs | 原有 refs 及 `documentId` 前缀不变；根文档追加在后 |
| 文件内容为 `not-applicable` | 正常读取为文本；无特殊错误/badge |
| 根文档超过 256 KiB / 非 UTF-8 / 含 NUL | 既有 `TOO_LARGE`/`INVALID_UTF8`/`BINARY_CONTENT`；不返回 partial 正文；文件名仍可列出 |
| POSIX：根文档真实读取 | 正文/字节数正确；只读；不修改 mtime |
| 符号链接/根替换/竞态（POSIX） | 既有 Provider 错误码不变（`SYMLINK_NOT_ALLOWED`/`CHANGED_DURING_READ` 等） |
| Windows：`updateListing` | `documentReadUnavailable: UNSUPPORTED_ENVIRONMENT`；无 scope；无 refs；不读字节 |
| 项目切换/撤销/迟到读取 | 既有 `STALE_SCOPE`/`NOT_LISTED` 语义不变 |
| 请求含额外 `path`/`roleId` | 既有 `INVALID_REQUEST`；不因根文档改动放宽 |

#### 渲染层（纯逻辑 + 组件）

| 用例 | 期望 |
| --- | --- |
| 3 根文档 + N docs | 两组标题、顺序、count = 3 + N file；目录不计入 |
| 3 根文档 + 0 docs | 只显示根文档组；不显示“无 docs/”整节空态 |
| 0 根文档 + N docs | 只显示 docs 组；不显示根文档组 |
| 0 + 0 / 内置角色 | 显示 `ui.profile.noRoleDocs`；不伪造 |
| 部分根文档缺失 | 只显示存在的；不显示占位 |
| 异常传入 `memo.md` | 不渲染（显示过滤兜底） |
| `api-spec.md` 内容 `not-applicable` | 正常列出/打开；无 badge/错误 |
| 点击根文档（有 ref/scope） | `DocumentView` 阅读态；正文正确 |
| 点击根文档（无 ref/Windows） | 列表态 + 结构化 `UNSUPPORTED_ENVIRONMENT`；不伪造正文 |
| 返回角色资料 | 焦点回根文档按钮（或回退“查看已列文档”） |
| `role-card`/`boundary` | 不在文档组重复；专门节不变 |
| 长文/窄窗/200% | 无水平溢出；按钮可点击；截断有 title/aria |
| zh/en | 分组/空态/按钮文案正确；文件名不翻译 |

#### 跨层 / 真实 Electron

| 用例 | 期望 |
| --- | --- |
| `test/桌面应用/interface.test.ts` | `listProject` → `RoleView.rootDocs` → `documents` refs 装配；内置角色空态；旧 renderer/旧 main 兼容；无新 IPC |
| `test/测试/p1p7-document-integration.test.ts` | 候选 → Service refs 三层集成；合法/非法候选；Windows fail-closed；POSIX 实读分开 |
| Phase 4A 冒烟（受控 IPC） | 夹具 `rootDocs` 3 + refs；文档节两组；点击根文档进入阅读态；memo 不出现；既有 document/焦点/迟到失效测试仍过 |
| `test/桌面应用/e2e/main.mjs`（Windows） | 点击角色后能看到 3 个根文档名；点击后显示 `UNSUPPORTED_ENVIRONMENT`（不返回正文）；fixture 字节/mtime 不变 |
| `test/桌面应用/e2e/main.mjs`（POSIX，可选/CI） | 点击根文档读取真实 `feature-map.md`/`functional-description.md`/`api-spec.md` 正文；`not-applicable` 可读 |
| 既有文档链路回归 | `p1p7-document-integration`、`project-document`、`interface` 的 Windows/POSIX 断言不变 |
| 类型/构建 | `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` 通过 |

### 5.3 命令与环境（既有 runner，不新增配置）

```text
node --test test/桌面应用/project.test.ts test/桌面应用/project-document.test.ts test/桌面应用/interface.test.ts
node --test test/桌面UI/document-view.test.ts
node --test test/测试/p1p7-document-integration.test.ts
node --test test/测试/i18n-integration.test.ts        # 按需
node --test test/项目管理/shared/i18n.test.ts          # S5
npm run typecheck
npm run typecheck:renderer
npm run build:renderer
./node_modules/.bin/electron test/桌面UI/phase4a-electron-smoke.mjs
node test/桌面应用/e2e/main.mjs                        # 按该脚本现有运行说明
```

- S1 按既有流程把 Node 加入 PATH 并记录实测版本；命令不可用不得伪造结果。
- 真实 Electron 用例需临时 userData/临时项目根；证据不得写 `docs/verification/` 或伪造目录。
- Windows 用例明确断言 fail-closed；POSIX 真实读取用例在 macOS/Linux 执行；不能用 Windows 的“文件存在”冒充“正文可读”。
- 失败分类：本次新增失败 / 既有失败（如 Windows symlink EPERM、桌面时序偶发）/ 环境不可用或跳过；新增失败不得放行，既有失败必须附基线证据与原因。

### 5.4 Windows fail-closed 与 POSIX 实读分开记录

- **Windows（客户当前环境）**：只验证“三个文件名可列出 + 点击显示既有 `UNSUPPORTED_ENVIRONMENT` + 不建立 scope/不铸造 refs/不返回正文/不读字节”；fixture 字节/mtime 前后不变；不得声称正文可读。Q9 A 已客户确认。
- **POSIX（macOS/Linux）**：验证真实 `feature-map.md`/`functional-description.md`/`api-spec.md` 正文可读、`not-applicable` 当普通文本、只读且不修改 mtime；与 Windows 证据分开文件/小节记录，不合并成“全平台可读”。
- 若 POSIX 环境不可用：记录“未执行 + 环境限制”，不得用 Windows 结果替代；验收可按标准判 `insufficient evidence`，由统筹安排补证或按客户决定处理。

### 5.5 证据计划

- 设计/实施文档：本方案 v1、实施记录、变更清单、根文档索引样例、`RoleView` 契约 diff、i18n key diff。
- 代码 diff：`src/model/project-document.ts`、Service、`app/desktop/project.ts`、`interface.ts`、`ProfilePanel`、`drawer-store`、`document-view`、`types.ts`、CSS、i18n messages。
- 测试：上述命令的原始输出、通过/失败计数、退出码；临时夹具路径/哈希；Windows 与 POSIX 分开记录。
- Electron：截图（角色资料文档节、根文档阅读态、空态、960/200%）；DOM/几何断言输出；fixture 字节/mtime 前后对比。
- 回归：既有 `project.test`/`project-document.test`/`interface.test`/`p1p7`/Phase 4A；旧 docs/changelog 行为。
- 负例：memo/任意根文件/`../`/绝对路径/符号链接/Windows/无 scope/文件删除/迟到读取。
- 候选/证据：变更包候选哈希（`git hash-object` + `sha256sum`）、改动路径、环境、命令、测试计数；不伪造 `docs/verification/`；管理记录不混入产品候选。

### 5.6 独立验收安排

- **作者**：内置独立验收（技能 `references/acceptance-role.md` 默认角色；不是项目 `角色卡/独立验收` worker）。
- **时机**：闸门 2 确认后、S2 实施前；可与 S1 基线并行。
- **路径**：`docs/acceptance/role-root-docs-display-criteria-v1.md`（标准）；`docs/acceptance/role-root-docs-display-report-v1.md`（报告）。
- **基线**：客户在闸门 1 确认的方案 v1（1023 行，SHA-256 `9b69a786…`）+ 闸门 0 意图记录；团队计划只作范围/写集依据，不是标准来源。
- **最低内容**：验收表（ID、方案条目/标准、需要的证据、实际证据路径/哈希、候选版本、产出角色、结果、验收判断）、T2 依据/升档条件、判定规则（pass/fail/insufficient evidence/not applicable）、成功/失败/边界情形、证据失效规则、版本冻结规则；标准不得弱于方案 §8.5 的 P1–P10。
- **变更包**：S7 由统筹写 `docs/scheduling/role-root-docs-display-change-v1.md`，含候选哈希、改动路径（相对 S1 基线）、任务节点 S1–S7、证据链接、风险档位 T2、复用证据与失效说明。
- **结论**：只能是**通过 / 返工 / 证据不足**；返工交原所有者，补证由统筹安排；统筹不改验收结论。通过只表示当前候选满足标准 v1，不授权提交/推送/合并/发布。
- **独立性**：本变更的验收标准/报告单独写盘；**不与 i18n、目录 v3、治理写卡、验收返工路由合并判定**；不引用它们的结论替本变更背书。
- **memo/changelog/docs 不回归**：`memo.md` 排除；`changelog.md` 可选、不要求补写；`docs/` 既有遍历/排序/数量不回归；验收表必须覆盖这些负例/不变项。

---

## 六、边界/授权核对

| 事项 | 结论 | 处理 |
| --- | --- | --- |
| `src/model/project-document.ts` | **在桌面窗口 Section 1**（单文件，B 专属 Model 唯一主属） | 不是边界缺口；由桌面窗口写。若 S1 预检发现实际归属不符，停止并列为闸门 2 缺口 |
| `src/service/project-document/impl/read-project-document.ts` | **在桌面窗口 Section 1**（单文件，B Service 实现） | 不是边界缺口；由桌面窗口写 |
| `src/service/project-document/abstract/document-reader.ts`、`public/read-project-document.ts`、`src/pipeline/project-document/read-project-document.ts` | **在桌面窗口 Section 1**（各单文件） | 默认不改；确需类型透传时最小改动并回报 |
| `src/provider/project-document/**` | **在桌面窗口 Section 1**（各单文件） | 不是缺口；但 **Q9 A 明确不改**；`git diff` 为空是验收项 |
| `test/桌面应用/project.test.ts`、`project-document.test.ts`、`interface.test.ts` | 各**单文件**在桌面窗口 Section 1 | 不是缺口；逐文件授权，只改这些既有文件 |
| `test/桌面应用/e2e/main.mjs` | **单文件**在桌面窗口 Section 1 | 不是缺口；**逐文件授权**，只改该既有文件；不得新建 `test/桌面应用/` 文件 |
| `app/renderer/src/chat/profile-docs.ts`（新增） | 在桌面UI `app/renderer/` 目录授权内 | 不是边界缺口；目录内新增文件不需重写边界，但必须在写集列明 |
| `test/桌面UI/` 既有文件 | 在桌面UI 目录授权内 | 不是缺口；默认只改 `document-view.test.ts`、`phase4a-electron-smoke.mjs` 等既有文件；不新建默认 |
| `src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n.test.ts` | 在项目管理 `src/common/shared/`、`test/项目管理/shared/` 授权内 | 不是缺口；项目管理唯一写入，不改 shared 属主 |
| `test/测试/p1p7-document-integration.test.ts`、`i18n-integration.test.ts` | 在测试 `test/测试/` 目录授权内 | 不是缺口；测试角色写 |
| `docs/acceptance/`、`docs/scheduling/` | 内置验收/统筹默认写区 | 不是 worker 写集；不派 worker |
| 角色/边界/YAML/角色卡 | 人事维护 | **本变更无角色/边界变更**；不派人事；人事只在闸门 2 后如确有缺口才写卡/边界 |
| 其他方案 §6/§7 路径 | 均被现有 Section 1 精确覆盖 | 无缺口 |

**结论：本变更无角色/边界变更；无未覆盖路径。** 若实施发现任何 Section 1 未覆盖路径、需要新增 `test/桌面应用/` 文件、或需要改 `src/provider/project-document/**`/preload/IPC/角色边界，**停止并回报统筹**，列为闸门 2 边界缺口或方案实质变更；不默认写、不自行改边界、不先派工。

---

## 七、风险、工作量与顺序

1. **Windows 只能列名（最高优先，已客户确认 Q9 A）**：既有 Provider 在 Windows 明确 `UNSUPPORTED_ENVIRONMENT`；本变更只能列出文件名并诚实报错。不得用“文件存在”冒充“正文可读”；Windows 与 POSIX 证据分开；若客户改主意要求 Windows 实读，重开闸门 1，另开设计，可能升 T3。
2. **混合未提交上下文**：i18n、目录 v3、治理写卡、验收返工路由均未提交；共享文件已被修改。S1 必须冻结逐文件哈希、确认候选边界；实施不得把其他变更的改动混入本变更候选，也不得用其他变更验收结论背书。推荐 i18n 收口后再开始 S2/S4。
3. **共享文件并发写**：`app/desktop/interface.ts`、`project.ts`、`ProfilePanel.tsx`、`DocumentView.tsx`、`document-view.ts`、`types.ts`、`drawer-store.ts`、`phase4a.css`、`interface.test.ts`、`e2e/main.mjs`、i18n messages 都可能被其他变更触及；同一文件同一时间只有一个 owner；任何冲突停止回报、重排窗口。
4. **长文档/渲染布局**：根文档行文件名短，但 960×620、侧栏 208、200% zoom 仍需验证；不要新增固定高度/宽度导致裁切；截断必须有 `title`/`aria-label`；长文只在 `DocumentView` 内滚动。
5. **`docs/` 既有遍历不回归**：`walkDir` 的排序（`localeCompare(..., "zh-Hans-CN")`）、500 条上限、隐藏文件跳过、目录/文件顺序必须保持；新增根文档字段不得改变 `docs` 数组语义。根文档不得通过 `readdir` 扫描，只 `lstat` 三个精确文件名。
6. **内置角色空态**：`builtIn: true`/`cardPath` 空不得读项目根、不得伪造根文档；显示诚实空态；`rootDocs: []`、`docs: []`。
7. **候选隔离与路径基准**：`docs[].path` 角色相对、`rootDocs[].path` 项目相对；实施/测试不得混用；Service 用 `roleDir + "/" + name` 精确校验，渲染层用 `relativePath` 精确匹配，不自行拼路径。
8. **`documents` 数量变化**：根文档加入 refs 后，“查看已列文档”清单从 1 条（角色卡）变为 1+3 条（目标角色）；既有 Phase 4A 夹具断言数量会变，需更新并说明“新增根文档，不是回归”；既有 card/changelog/docs 的 `documentId` 前缀不变。
9. **i18n key 与硬编码**：新增 key 必须 zh/en 全集 parity；文件名/路径/`not-applicable` 不翻译；桌面UI 不写第二份中文；key 未落地前不引用；若复用现有 key，S5 记录 N/A + 理由。
10. **POSIX 环境**：当前客户环境 Windows；POSIX 实读需要 macOS/Linux；无环境时如实记录未执行，不伪造；验收可判证据不足，统筹安排补证/客户决定。
11. **真实 Electron/桌面时序偶发**：历史基线有 Windows symlink EPERM、桌面并发偶发；S1 记录基线并分类；终验只对本次新增失败负责；并行偶发用隔离/整文件/串行复跑分类，不笼统写“环境问题”。
12. **`test/桌面应用/` 逐文件授权**：不得新建该目录文件；新断言并入既有精确文件；`e2e/main.mjs` 只最小追加；不得删除既有断言或把平台性失败改成通过。
13. **旧 renderer/旧 main 兼容**：`RoleView.rootDocs?`、`Candidates.rootDocs?` 为 additive；旧 renderer 忽略未知字段；新 renderer 连旧 main 时无 `rootDocs` 不显示根文档组、不崩；测试需覆盖。
14. **不新增 IPC/preload**：`project:document-read` 请求/回包形状不变；`app/preload.cjs` 零改动；若实施需要新通道，停止回报，重开闸门 2。
15. **目标项目只读**：`ans-gateway` 仅只读样例；不写其角色目录、不补 changelog/docs、不改文件；验收用临时项目根/只读复算。
16. **无 task_ops**：无 `.ans/project.json`；不伪造任务令牌、锁、审批、机器预检；证据以文件哈希、原始输出、diff/status 为准。
17. **发布**：目标 v1.7.0；不改发布配方/冻结源；发布另走装配流程；本变更验收通过后再准备发布，不与发布合并验收。
18. **状态如实**：本文件是计划；未实施/未测试/未验收；不对外声称“已支持根文档展示”。

---

## 八、闸门 2 待客户确认项

> 以下为闸门 2 需客户确认的具体项；客户确认记录由沟通写入 `docs/communication/`。本计划不自行判断客户是否同意。

1. **参与角色**：**桌面窗口**（Model 白名单/候选契约、Service 校验、`project.ts` 索引、`interface.ts` 的 `RoleView`/`listProject`、主进程精确测试与真实 e2e）、**桌面UI**（`types.ts`/`profile-docs.ts`/`ProfilePanel`/`DocumentView`/`drawer-store`/CSS 与渲染测试）、**项目管理**（`ui.profile.*` zh/en key 与 parity）、**测试**（`test/测试/` 跨层集成、Windows/POSIX 证据）为实施 worker；**内置独立验收**写标准与报告；**统筹**写计划/变更包/记录。**不启用人事**（无角色/边界变更）；**不启用装配/运行时核心/门禁引擎/编排/各适配器/UIUX**（无写集）。
2. **精确写集**：
   - 桌面窗口：`src/model/project-document.ts`、`src/service/project-document/impl/read-project-document.ts`、`app/desktop/project.ts`、`app/desktop/interface.ts`；`test/桌面应用/project.test.ts`、`test/桌面应用/project-document.test.ts`、`test/桌面应用/interface.test.ts`、`test/桌面应用/e2e/main.mjs`（逐文件）；默认不改 abstract/public Service、Pipeline、Provider、preload、main。
   - 桌面UI：`app/renderer/src/chat/types.ts`、`app/renderer/src/chat/profile-docs.ts`（新增）、`app/renderer/src/chat/document-view.ts`（按需）、`app/renderer/src/shell/ProfilePanel.tsx`、`app/renderer/src/shell/DocumentView.tsx`（按需）、`app/renderer/src/stores/drawer-store.ts`、`app/renderer/src/shell/phase4a.css`；`test/桌面UI/document-view.test.ts`、`phase4a-electron-smoke.mjs`（+按需 `phase4a-smoke-preload.cjs`、`source-guard.test.ts`）；不写 `test/桌面应用/`。
   - 项目管理：`src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`（仅新增 `ui.profile.*` key）；`test/项目管理/shared/i18n.test.ts`（+按需 `i18n-guard.test.ts`）。
   - 测试：`test/测试/p1p7-document-integration.test.ts`、`test/测试/i18n-integration.test.ts`（按需）；不写其他角色测试。
   - 统筹：`docs/scheduling/`（本计划、变更包）；内置验收：`docs/acceptance/`（标准、报告）。
3. **是否有角色/边界变更**：**无**。`src/model/project-document.ts`、Service、Provider、Pipeline 均在权威 `角色卡/桌面窗口/boundary.md` Section 1；`test/桌面应用/` 是逐文件授权，本计划只改 `project.test.ts`、`project-document.test.ts`、`interface.test.ts`、`e2e/main.mjs`，**不新建文件**；`app/renderer/src/chat/profile-docs.ts` 在 `app/renderer/` 目录授权内。**无未覆盖路径**。若实施发现缺口，停止并交人事/闸门 2，不默认写。
4. **档位**：**T2**（跨角色/接口/契约），按 §1.2 与 §5.1 的 T2 验证；不默认全量 T3；若改 Provider/读取模型/边界/权限或证据不足，停止并按升档/重开工序处理。
5. **阶段顺序**：闸门 2 + 实施授权 → （S1）标准/基线/预检 → **S5 i18n key（可与 S2/S3 并行，但必须先于 S4）** → S2 索引/Model/Service/候选 → S3 桌面 Interface → S4 渲染层 → S6 测试/真实 Electron → S7 变更包/独立验收 → 放行。S2→S3→S4 串行；S6 后于 S2–S5；S7 后于 S6。
6. **验收安排**：使用**内置独立验收**（写 `docs/acceptance/role-root-docs-display-criteria-v1.md` / `role-root-docs-display-report-v1.md`），不使用项目 `角色卡/独立验收` worker；**实施前标准先于实施**，标准基于客户闸门 1 确认的方案 v1；**不与 i18n/目录 v3/治理写卡/验收返工路由合并判定**；不派 worker 写 `docs/acceptance/`。
7. **证据口径**：未启用 task_ops；以逐文件 `git hash-object` + `sha256sum`、原始命令输出、diff/status、跨层集成输出、真实 Electron 截图/几何、fixture 字节/mtime、Windows/POSIX 分开记录为证据；不提交、不推送、不合并、不发布；管理记录不混入产品候选；不伪造 `docs/verification/`。
8. **闸门 2 ≠ 实施授权**：客户可先确认角色/写集/顺序/验收安排，再另行给出实施授权；本计划写盘后不派发，直到两者齐备 + 实施前验收标准经沟通确认 + 逐角色范围预留完成。本计划**不写实施授权记录**。
9. **i18n key 写集确认**：按 Q2 A，新增 4 个必需 key（分组/空态/打开标签）+ 3 个可选副标签 key；若客户只要求 4 个必需 key，S5 只写 4 个、S4 不显示副标签，不改变方案语义；若客户认为现有 key 足够，S5 记 N/A + 理由，S4 只用现有 key、不硬编码。请在闸门 2 确认该写集口径。
10. **既有未提交基线**：i18n/目录 v3/治理写卡/验收返工路由候选已验收但未提交；请确认本变更在**冻结候选**上实施（S1 哈希基线 + 候选隔离），或先由上游完成提交/收口后再实施。默认串行；任何共享文件不得并发写。
11. **`test/桌面应用/e2e/main.mjs` 逐文件授权**：确认允许在该既有单文件内最小追加根文档真实 Electron 断言；不新建 `test/桌面应用/` 文件、不删除既有断言、不把 Windows fail-closed 改成通过。
12. **Windows/POSIX 证据口径**：确认 Windows 只验“列名 + `UNSUPPORTED_ENVIRONMENT` + 不读字节”，POSIX 另验实读；若当前无 POSIX 环境，POSIX 项记录未执行/证据不足，不以 Windows 结果替代。

---

## 九、计划状态

- **已写**：本团队计划（`docs/scheduling/2026-10-23-role-root-docs-display-team-plan.md`）。
- **未确认**：闸门 2（参与角色/写集/顺序/验收安排/证据口径）与客户实施授权。
- **未写盘**：实施前验收标准（由内置独立验收在闸门 2 后写 `docs/acceptance/role-root-docs-display-criteria-v1.md`）；变更包（S7）。
- **未做**：派发、实施、测试、验收、提交、推送、合并、发布；未改任何源码/测试/角色卡/边界/方案/flow/账本/沟通记录/验收文档。
- **下一步**：交沟通 → 客户闸门 2 → 客户实施授权 → 内置独立验收写标准 → S1 基线/预检 → 按 §四阶段派发。若客户改变方案默认项（尤其 Q9 改为 Windows 实读/改 Provider/升 T3），重开闸门 1/2；本计划不自行调整。
