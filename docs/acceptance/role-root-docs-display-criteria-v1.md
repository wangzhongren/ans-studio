# 验收完成标准：角色根文档在详情面板展示（role-root-docs-display，T2）——实施前标准 v1

- 任务 ID：`2026-10-23-role-root-docs-display`
- 产品 flowId：`role-root-docs-display`
- 风险档位：**T2（跨角色/接口/契约变更）**。本变更触及 Model/Service 候选契约、桌面 Interface 的 `listProject` 视图形状、渲染层展示与跨层测试，属于跨角色/接口/契约变更；它不改变治理、权限、角色边界、验收要求或文档归属，因此不是 T3。若实施中出现改 Provider/读取模型、改角色边界/文档归属、改治理权限、新增 IPC/枚举/写路径，或证据不足需扩大验证面，按 §二.4 停止并升档；升档不降档。
- 判定依据：客户闸门 0/1/2 记录 `docs/communication/2026-10-23_intent_role-root-docs-display.md`（73 行；SHA-256 `016798a1541e232a33d32ec4b3b97a7dce156fdfe580aa527bde23461da4d09a`；闸门 0/1/2 均已确认，实施授权未给）；客户在**闸门 1**确认的**方案 v1** `docs/planning/2026-10-23_design_role-root-docs-display.md`（1023 行；SHA-256 `9b69a7864112eb3df0c1da86b6ce653bb9235d4c655ac4d6f3b979e29080c26d`；blob `e898e65b9b388c2e4fdc529bfbbcf6fbe03fa5b4`）的 §2、§4、§5、§7、§8.5、§10、§11、§14；客户在**闸门 2**确认的**团队计划 v1** `docs/scheduling/2026-10-23-role-root-docs-display-team-plan.md`（488 行；SHA-256 `8ec6e0d7f264a89bad3cb081371079dca8e2785750f29df9769704342f895fa8`；blob `98f41bd0be9c16e1b5556509acc4c581a2c0818c`）的 §1.2、§1.3、§3、§4、§5、§八。团队计划只作范围、写集、阶段顺序与证据口径依据，**不是标准来源**；本标准按方案 §8.5 建立，不得弱于方案 §8.5。
- 选定检查：受影响角色的单测/层测试（`test/桌面应用/project.test.ts`、`project-document.test.ts`、`interface.test.ts`；`test/桌面UI/document-view.test.ts`；按需 `test/项目管理/shared/i18n.test.ts`）+ 跨层集成（`listProject` → `RoleView.rootDocs` → renderer 展示；`projectDocumentCandidates` → Service refs；`test/测试/p1p7-document-integration.test.ts`）+ 真实 Electron（`test/桌面UI/phase4a-electron-smoke.mjs`；`test/桌面应用/e2e/main.mjs`）+ `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`；Windows fail-closed 与 POSIX 实读分开记录；T2 不默认全量回归。
- 复用证据：仅同一候选、同一输入/依赖、同一命令、同一配置/夹具的证据可复用；候选、输入、依赖、契约、测试夹具或配置变化时，受影响证据失效，只补失效部分；不得跨候选复用，也不得用 i18n、目录 v3、治理写卡、验收返工路由的验收结论替本变更背书。
- 全量回归：**N/A（T2 默认不全量回归）**。理由：本变更不改变治理/权限/角色边界，按 T2 执行受影响检查与跨层集成；若证据不足、候选不可复算、跨层结论不成立或触发升档条件，则升 T3 并执行适用全量回归，报告中记录理由；升档不降档。
- 标准路径 / 版本 / 日期：`docs/acceptance/role-root-docs-display-criteria-v1.md` / **v1** / **2026-10-23**（实施前冻结）。
- 阶段与状态：**实施前冻结；不是验收报告**。本文件只建立标准，不判定候选；当前**未实施、未测试、未验收**，不声称任何能力已具备。
- 验收报告：**另写 `docs/acceptance/role-root-docs-display-report-v1.md`**。报告由独立验收在实施后按本标准与统筹变更包判定，结论只能是通过/返工/证据不足；本文件不产生验收结论，不预判通过或返工。
- 适用变更：**仅 `2026-10-23-role-root-docs-display`（T2）**。本变更与 i18n、目录 v3、治理写卡门禁、验收返工路由分别闸门、分别实施、分别验收、分别报告；不合并判定（见 §二.5）。

---

## 一、基线、版本冻结与范围

### 1.1 客户确认链与冻结版本

| 项 | 状态 | 记录与版本 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-10-23）** | `docs/communication/2026-10-23_intent_role-root-docs-display.md`；客户明确「展示 feature-map.md、functional-description.md、api-spec.md；memo.md 默认不展示 这个排期，进 1.7」 |
| 闸门 1：方案确认 | **已确认（2026-10-23）** | 同上「闸门 1 确认记录」；客户原话「确认 Q9 A：v1.7.0 先只列三个文件名，Windows 点开显示既有不支持提示；正文可读留待后续。其余 Q1–Q12 按推荐。」确认对象为方案 v1（1023 行；SHA-256 `9b69a786…`） |
| 闸门 2：角色指派/写集/顺序/验收安排 | **已确认（2026-10-23）** | 同上「闸门 2 确认记录」；确认团队计划 v1（488 行；SHA-256 `8ec6e0d7…`；blob `98f41bd0…`）；参与角色为桌面窗口、桌面UI、项目管理、测试 4 个既有 worker + 内置独立验收 + 统筹；无新增角色/边界；T2；S1–S7 |
| 客户实施授权 | **未给** | 闸门 2 明确「实施授权另行取得」；本文件不是实施授权，也不授权派发 |
| 本验收标准 | **实施前写盘并冻结** | 本文件 v1（2026-10-23） |
| 验收报告 | 未写 | 实施后另写 `docs/acceptance/role-root-docs-display-report-v1.md` |

**状态头与沟通记录不一致（只报告，不改）：** 方案文件头与 §2.1 仍写「草案 v1（待独立只读复核、待闸门 1 方案确认）」「闸门 1：待确认」「闸门 2：未开始」「实施授权：未给」；团队计划文件头与 §1.5 仍写「闸门 2 未确认、实施授权未给」。沟通记录的闸门 1/2 确认记录已明确客户确认方案 v1 与团队计划 v1。本标准以 `docs/communication/` 的确认记录与冻结哈希为授权事实，引用方案正文内容；不把过期状态头当作未确认，也不改写方案/团队计划。方案 §13 记录「尚无复核意见」，预期路径 `docs/planning/2026-10-23_review_role-root-docs-display.md` 当前不存在；这是只读核对发现，不增加产品验收要求（见 §七.3）。

### 1.2 版本冻结与变更规则

- 本文件在实施开始前冻结为 v1；实施开始后，不得为迁就候选而改写标准、放宽或加严实质。
- 确需变更标准（例如客户改变范围、方案实质变更、发现标准本身不可执行）时：递增版本（v2…）、记录理由与受影响条目、交沟通/统筹确认，并重新核对受影响证据；未确认前仍按 v1 判定。
- 候选变化不改变标准；只使该候选上的证据失效，需按本文件重取。
- 本文件不是验收结论，也不是实施授权；任何通过/返工/证据不足结论只写在 `docs/acceptance/role-root-docs-display-report-v1.md`。

### 1.3 范围、基线与非目标

**本轮判定范围（按方案 §2.4/§4/§8.5）：**

- 角色根文档索引：`rootDocs`/等价字段只含 `feature-map.md`、`functional-description.md`、`api-spec.md`；固定顺序、只显示存在项；`memo.md` 永不入索引；`changelog.md` 仍独立可选；`docs/` 遍历/排序/500 条上限/隐藏文件跳过不回归。
- 路径/候选安全：只允许三个精确项目相对文件；拒绝 `memo`/任意根文件/`..`/绝对路径/符号链接/项目外；索引只 `lstat` 角色目录与三个直接普通文件，不扫描角色根目录；Service 二次精确校验；Provider 零改动。
- Interface/RoleView：`rootDocs`/等价字段 additive；`listProject` 装配；无新 IPC/preload；旧 renderer/main 兼容；`api-spec` 的 `not-applicable` 当普通文本。
- 渲染层：`ProfilePanel` 根文档/`docs/` 两组；只显示实际存在；空态；点击进入 `DocumentView`；`memo` 不渲染；`role-card`/`boundary` 不重复；长文档/窄窗/200% 布局不裁切关键操作。
- 平台诚实：Windows 只列名 + 点开既有 `UNSUPPORTED_ENVIRONMENT`，不伪造正文/不读字节；POSIX 真实读取（macOS/Linux）另记；无 POSIX 环境记未执行/证据不足。
- i18n：新增/复用标签中英文 key、无硬编码中文、zh/en parity；`memo` 不因 key 被展示。
- 测试与证据：受影响单测/层测试 + 跨层（`listProject` → `RoleView` → renderer；候选 → Service refs）+ 真实 Electron；T2 不默认全量 T3；断言未弱化；候选哈希/原始日志。
- 范围/权限：无新增角色/边界/权限/枚举/依赖；不改 Provider/preload/IPC/角色卡/目标项目；不迁移现有角色；不要求每个角色补 `changelog.md`/`docs/`。
- 证据完整性/文档状态：见 P9/P10。

**Windows Q9 A（客户已确认，必须按此判定）：**

- Windows 上“文档”区可以列出三个文件名；点开时显示既有“当前环境暂不支持安全读取项目文档”（`UNSUPPORTED_ENVIRONMENT`）；**不返回正文、不读字节、不建立 scope、不铸造 refs**；不得声称 Windows 可读正文，不得旁路读取，不得修改 Windows 受限读取 Provider，不得把本变更升 T3。
- POSIX（macOS/Linux）真实读取正文另记，不与 Windows 结果合并成“全平台可读”。
- 若当前无 POSIX 环境，POSIX 项记录“未执行 + 环境限制”，按 `insufficient evidence` 处理（团队计划 §2.3.5），不得用 Windows 的“文件存在/列名”冒充“正文可读”。

**明确非目标（方案 §2.4/§4.2/§7.4、团队计划 §1.3）：**

- 不展示、不索引 `memo.md`；不提供“显示 memo”开关（v1.7.0 不做）。
- 不要求/不自动创建 `changelog.md`、`docs/`；不把 `changelog.md` 纳入 docs/rootDocs 索引；不要求补写。
- 不修改任何角色卡、边界、模板、验收标准、文档正文或文档归属；不迁移/重命名/移动现有角色目录。
- 不复制/搬运根文档正文到 `RoleView`/`ProfilePanel`/第二个文件；不在 ProfilePanel 内嵌正文；正文只在 `DocumentView`。
- 不新增写路径、IPC 通道、preload 方法或权限；不改变 `documentScope` 语义、`project:document-read` 请求/回包形状。
- 不改变 Windows 受限读取的既有安全取舍；不降级 realpath/符号链接/O_NOFOLLOW/有界读/UTF-8 校验。
- 不修改目标项目 `ans-gateway` 或任何外部项目文件（只读样例）；不写其角色目录、不补 changelog/docs。
- 不改 `package.json`、构建配置、依赖、发布配方/冻结源；不提交、不推送、不合并、不发布。
- 不与 i18n、目录 v3、治理写卡、验收返工路由合并验收，不引用它们的验收结论替本变更背书。
- 不改 `flow`/账本/`.ans` 治理状态；本变更未启用 task_ops。

### 1.4 写标准时的只读基线（2026-10-23）

| 检查 | 命令/方式 | 结果 |
| --- | --- | --- |
| 当前 HEAD | `git rev-parse HEAD` | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（`docs(release): record v1.6.0 published assets and checksums`） |
| 工作树（写标准前） | `git status --short` | 共 **230** 条；包含 i18n、目录 v3、治理写卡、验收返工路由等既有未提交候选/管理记录；本文件写盘前未改产品代码/测试/角色卡/方案/团队计划 |
| 意图记录 | `sha256sum docs/communication/2026-10-23_intent_role-root-docs-display.md` | `016798a1541e232a33d32ec4b3b97a7dce156fdfe580aa527bde23461da4d09a`（73 行） |
| 方案 v1 | `sha256sum docs/planning/2026-10-23_design_role-root-docs-display.md` | `9b69a7864112eb3df0c1da86b6ce653bb9235d4c655ac4d6f3b979e29080c26d`（1023 行；blob `e898e65b…`） |
| 团队计划 v1 | `sha256sum docs/scheduling/2026-10-23-role-root-docs-display-team-plan.md` | `8ec6e0d7f264a89bad3cb081371079dca8e2785750f29df9769704342f895fa8`（488 行；blob `98f41bd0be9c16e1b5556509acc4c581a2c0818c`） |
| Node 可用性 | `node --version` / `npm --version` | 当前 shell PATH **未包含 Node**（`node: command not found`）；S1 须按既有流程加入 PATH 并记录实测版本/路径，不得伪造输出 |
| 当前索引事实 | `app/desktop/project.ts::readRoleDocsIndex` | 只读 `changelog.md` 与 `docs/`；`RoleDocsIndex` 只有 `changelog`/`docs`；无 `rootDocs`；`projectDocumentCandidates` 只透传 card/changelog/docs |
| 当前候选事实 | `src/model/project-document.ts`；`src/service/project-document/impl/read-project-document.ts` | `ProjectDocumentRoleCandidates` 无 `rootDocs`；Service 只为 card/changelog/docs 文件铸造 refs |
| 当前 Interface 事实 | `app/desktop/interface.ts` | `RoleView` 有 `changelog`/`docs`/`documents?`；无 `rootDocs`；`listProject` 只装配 `changelog`/`docs` |
| 当前渲染事实 | `app/renderer/src/shell/ProfilePanel.tsx` | “文档”节按 `role.docs` 渲染；`docs.length === 0` 显示 `ui.profile.noDocs`；根文档无入口 |
| 当前读取事实 | `src/provider/project-document/impl/file-reader.ts` | `supported()` 只在 darwin/linux 且 `O_NOFOLLOW` 可用；Windows 失败为 `UNSUPPORTED_ENVIRONMENT`；inspect 拒绝符号链接/项目外，读取使用 `O_NOFOLLOW` 并校验 inode/size/mtime |
| 当前 i18n 事实 | `src/common/shared/i18n/messages/{zh-CN,en-US}.ts` | 已有 `ui.profile.docsTab`、`ui.profile.noDocs`、`ui.profile.viewListedDocs`；**没有**根文档分组/整节空态/单文件打开标签 key |
| 现有测试事实 | `test/桌面应用/project.test.ts`、`project-document.test.ts`、`interface.test.ts`、`test/桌面UI/document-view.test.ts`、`test/测试/p1p7-document-integration.test.ts`、`test/桌面UI/phase4a-electron-smoke.mjs`、`test/桌面应用/e2e/main.mjs` | 现有索引/候选/IPC/Electron 测试存在；当前无 `rootDocs` 夹具/断言；Windows fail-closed 断言存在 |
| 目录授权事实 | `角色卡/桌面窗口/boundary.md` 等（只读核对） | `src/model/project-document.ts`、Service、`app/desktop/`、`test/桌面应用/` 指定文件在桌面窗口写集；`app/renderer/` 在桌面UI目录授权；`src/common/shared/i18n/messages/` 在项目管理目录授权；`test/桌面应用/` 为逐文件授权、不得新建 |

以上只读核对用于确认基线与约束；本文件写盘未改方案、团队计划、沟通记录、角色卡、产品源码或测试。

### 1.5 本文件不产生的授权

本文件不授权提交、推送、合并、发布，不授权派发 worker，不授权修改写集或档位，不授权实施。写标准只完成实施前验收准备；实施仍须客户另行给出实施授权，并按闸门 2 确认的写集与团队计划阶段执行。

---

## 二、判定口径与证据规则

### 2.1 四种判断与报告表

每条验收项（P1–P10、G1、G2）只能判：

| 判断 | 含义 |
| --- | --- |
| `pass` | 当前候选满足该条标准，证据为该候选的原始、可复算证据 |
| `fail` | 已有证据表明不满足标准，或证据显示以弱化断言/超范围改动达到表面通过 |
| `insufficient evidence` | 缺少必要证据、证据属于另一候选/另一输入、无法复算、只给摘要、只凭自述，或关键结论无法成立 |
| `not applicable` | 该条对本轮范围不适用；必须写明依据（如可选副标签未实施、客户明确收窄平台范围） |

验收报告的核心是逐项验收表，列至少为：

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1–P10/G1/G2 | 对应本文件条目与方案 §8.5/§8.4/§11/§14 | 本文件要求的最低证据 | 原始输出/截图/几何/哈希路径 | `git hash-object` + `sha256sum` | 桌面窗口/桌面UI/项目管理/测试/统筹 | 实际观察摘要 | pass/fail/insufficient evidence/not applicable |

### 2.2 行为证据原则（不得以“字段齐全”代替实际行为）

- 文件存在、字段名齐全、测试文件存在、代码“看起来已调用”，**只是必要条件，不是通过依据**。每条必须观察实际行为：索引返回值、`RoleView.rootDocs`、Service refs、渲染 DOM/文本、点击后的 `DocumentView` 状态、Windows 结构化错误、真实 Electron 几何/截图。
- 开发者自述、测试角色转述、工具“成功”、计划文字、截图缩略图、摘要，都不算原始证据；验收读取原始命令输出、文件哈希、diff/status、e2e 日志/截图/几何 JSON。
- 不得用“只跑了单测”代替跨层集成与真实 Electron；不得用“代码里有 `rootDocs`”代替渲染展示；不得用“Windows 文件存在”代替 POSIX 正文可读。
- 不得修改断言以保绿；不得跳过失败用例或把 `skip`/`todo` 计为通过；不得把失败归为“环境问题”而不做基线对照与分类。
- 不得把 `memo.md` 的“未显示”仅归因于测试夹具未包含；须覆盖“后端异常传入 memo”与“真实目录存在 memo”两条。

### 2.3 证据有效性与复用

- 有效证据必须绑定：候选哈希（`git hash-object` + `sha256sum`）、命令、工作目录、环境（Node/npm、OS/Shell）、输入/夹具、退出码、测试计数（pass/fail/skip/todo）、失败原文。
- 同一候选、同一输入/依赖、同一命令、同一配置/夹具的证据可复用；以下任一变化使受影响证据失效：候选文件、依赖、契约/类型、Service/Provider 行为、测试夹具、构建配置、i18n 目录内容、目标项目只读样例状态。
- 复用只补未失效部分；不得跨候选复用，也不得用 i18n/目录 v3/治理写卡/验收返工路由的证据替本变更背书。
- 证据不足时，按 `references/testing.md` 升档补证；能建立结论的最低档优先，但升档不降档。

### 2.4 档位与升档条件（T2）

- 默认检查面：受影响角色的单元/层测试 + 跨层集成（`listProject` → `RoleView` → renderer；候选 → Service refs）+ 受影响的 typecheck/渲染构建 + 真实 Electron（Windows fail-closed；POSIX 实读如可用）。
- **不默认全量回归**；但不得以“T2 不全量”为由遗漏受影响调用方、跨层或真实 Electron。
- 发现以下任一情形，停止并按升档处理，回报统筹/沟通：修改 `src/provider/project-document/**`、Windows 受限读取 Provider 或读取模型；修改角色卡/边界/文档归属/验收要求；新增/删除角色；新增 IPC 通道、改 `app/preload.cjs`、改 `project:document-read` 请求/回包形状；把根文档正文读进 `RoleView`/`ProfilePanel`；新增写路径/权限/枚举；候选不可复算/共享文件混入未隔离改动；跨层结论无法建立。升档不降档。
- 若客户改变 Q9 A 要求 Windows 实读正文，停止并重开闸门 1/2，另开设计；不得在本 T2 中顺手放宽。

### 2.5 与其他变更的隔离

- 本变更与 i18n、目录 v3、治理写卡门禁、验收返工路由**分别闸门、分别实施、分别验收、分别报告**；本文件只判定本变更。不得把多个变更合并为一个结论，不得用本文件的通过结论为其他变更背书，反之亦然。
- 工作树已有其他变更的未提交候选；S1 必须逐文件记录 `git hash-object` + `sha256sum` 基线，本变更候选只列相对 S1 基线的增量；共享文件按团队计划 §3.9/§4.2 串行写入，任何共享文件不得被两个变更并发写。并发混入按候选不可复算处理（证据不足/返工）。
- 本文件不改变闸门 2 已确认的写集、参与角色、阶段顺序与档位；实施中发现需要变更写集/档位时，按团队计划回报统筹并重开闸门 2，不在验收标准中自行调整。

### 2.6 无 task_ops

本项目没有 `.ans/project.json` 任务配置，未启用 task_ops。取证以文件哈希、原始命令输出、diff/status、跨层集成输出、真实 Electron 截图/几何、fixture 字节/mtime 为准；**不得伪造任务令牌、锁、审批、机器预检或 `docs/verification/` 记录**。

---

## 三、验收标准

### 3.0 标准来源映射与 P 编号对照

本任务要求的 P1–P10 分组与方案 §8.5 的 P1–P10 编号不完全一一对应；下表逐项对照，**保证方案 §8.5 每条均被覆盖，不新增产品要求、不弱化方案**。G1/G2 是变更包/写集流程核对，不是新增产品需求。

| 本文件 | 任务要求主题 | 方案 §8.5 对应 | 团队计划对应 | 说明 |
| --- | --- | --- | --- | --- |
| P1 | 索引/根文档 | P1 | §3.2、§5.2、§5.4 | 索引白名单/顺序/memo/changelog/docs |
| P2 | 路径/候选安全 | P2 | §3.2、§5.2、§5.4 | 白名单精确路径、Service 二次校验、Provider 零改动 |
| P3 | Interface/RoleView | P3 + P5（契约部分） | §3.2、§3.3、§5.2 | additive 契约、无新 IPC、旧兼容、`not-applicable` 普通文本；点击/不重复的渲染行为归 P4 |
| P4 | 渲染层 | P4 + P5 + P8 | §3.3、§5.2、§5.3 | 两组/空态/点击/memo/不重复/布局 |
| P5 | 平台诚实 | P6 | §5.2、§5.4 | Windows fail-closed、POSIX 实读分开 |
| P6 | i18n | P7 | §3.4、§5.2 | key/parity/不翻译文件名/不硬编码 |
| P7 | 测试/证据 | P9 | §5.1–§5.3、§5.5 | 受影响单测/跨层/Electron/typecheck/build/T2 |
| P8 | 范围/权限 | P10（非目标/治理不变部分） | §1.3、§3.7、§八 | 无新增角色/边界/权限/枚举/依赖；不改 Provider/preload/角色卡/目标项目 |
| P9 | 证据完整性 | P9 + 方案 §8.4 | §5.5 | 候选哈希/命令/计数/失败原文/分平台/fixture/截图 |
| P10 | 文档状态 | P10（状态部分）+ 方案 §11.14/§14 | §1.3、§七.18 | `implemented-unverified`/`verified-by-tests-only` ≠ 验收；标准先于实施 |
| G1 | 变更包/流程 | —（流程核对） | §3.6、§4.3、§5.5、§5.6 | 变更包完整、候选可复算、管理记录不混入产品候选 |
| G2 | 写集/边界/零改动 | —（流程核对） | §3.1–§3.9、§六 | 改动在写集内、无越界、无提交/推送/发布 |

**编号差异说明：** 任务版 P3 合并了方案 §8.5 的 P3（契约兼容/无新 IPC）与 P5 的接口部分（`RoleView` 装配）；任务版 P4 合并了方案 §8.5 的 P4（渲染分组/空态）、P5（点击/不重复）与 P8（布局/长文/200%）；任务版 P9/P10 把方案 P9/P10 的证据与状态要求展开。合并不降低覆盖：方案 P3/P5 的点击、不重复、memo 不渲染等要求均在 P4 中保留；方案 P8 的布局要求也在 P4 中保留。若实施者按方案编号提交证据，报告须在验收表中标注对应关系。

### 3.1 总表

| ID | 覆盖主题 | 标准摘要 | 最低证据 | 产出角色 |
| --- | --- | --- | --- | --- |
| P1 | 索引/根文档 | `rootDocs` 只含三个精确文件、固定顺序、只显示存在项；memo 永不入索引；changelog 独立可选；docs 遍历/排序/上限不回归；索引只元数据 | 单测原始输出；索引样例；diff；旧 docs/changelog 测试 | 桌面窗口 |
| P2 | 路径/候选安全 | 只允许三个精确项目相对文件；拒绝 memo/任意根文件/`..`/绝对路径/符号链接/项目外；索引只 `lstat` 三个直接普通文件、不扫描根目录；Service 二次精确校验；Provider 零改动；无写路径 | 负例测试；POSIX 符号链接测试；Windows fail-closed；Provider diff；候选 refs 输出 | 桌面窗口、测试 |
| P3 | Interface/RoleView | `rootDocs`/等价字段 additive；`listProject` 装配；无新 IPC/preload；旧 renderer/main 兼容；`api-spec` 的 `not-applicable` 普通文本；文档 refs 追加且既有前缀不变 | 类型/接口 diff；`interface.test.ts` 原始输出；preload 断言；旧夹具；api-spec 测试 | 桌面窗口 |
| P4 | 渲染层 | 根文档/docs 两组；只显示存在项；空态；点击进 `DocumentView`；memo 不渲染；role-card/boundary 不重复；长文/窄窗/200% 不裁切关键操作；焦点回归 | 纯逻辑测试；Phase 4A DOM/截图/几何；空态样例；点击/焦点测试 | 桌面UI |
| P5 | 平台诚实 | Windows 只列名 + 点开既有 `UNSUPPORTED_ENVIRONMENT`，不伪造正文/不读字节；POSIX 实读正文另记；无 POSIX 环境记未执行/证据不足 | 分平台测试/截图；Provider/Service 输出；fixture 字节/mtime | 测试、桌面窗口、桌面UI |
| P6 | i18n | 新增/复用标签 zh/en key；无硬编码中文；zh/en parity；文件名/路径/`not-applicable` 不翻译；memo 不因 key 被展示 | key parity/值断言；zh/en 输出；源码扫描；diff | 项目管理、桌面UI |
| P7 | 测试/证据 | 受影响单测/层测试 + 跨层 + 真实 Electron；typecheck/typecheck:renderer/build；T2 不默认全量 T3；断言未弱化；候选哈希/原始日志 | 命令/退出码/计数/失败原文；测试 diff；候选哈希；证据清单 | 测试、各实施角色、统筹 |
| P8 | 范围/权限 | 无新增角色/边界/权限/枚举/依赖；不改 Provider/preload/IPC/角色卡/目标项目；不迁移；不要求补 changelog/docs | 路径 diff/status；Provider/preload/package 零改动；角色卡/目标项目零改动；依赖清单 | 桌面窗口、桌面UI、项目管理、测试 |
| P9 | 证据完整性 | 候选哈希、命令/退出码/计数、失败原文、Windows/POSIX 分开、fixture 字节/mtime、截图/几何；不接受“全部通过”摘要 | 变更包；原始日志；哈希清单；截图/几何元数据；失败分类 | 统筹、各实施角色、测试 |
| P10 | 文档状态 | `implemented-unverified`/`verified-by-tests-only` ≠ 验收；标准先于实施；报告另写；不提前宣称 | 文档 diff/状态行；报告路径/作者；变更包 | 各实施角色、统筹 |
| G1 | 变更包/流程 | 变更包完整、候选身份可复算、S1 基线隔离、管理记录不混入产品候选 | `docs/scheduling/role-root-docs-display-change-v1.md`；逐文件哈希；HEAD/status/diff/stat；标准版本/哈希 | 统筹 |
| G2 | 写集/边界/零改动 | 改动在团队计划写集内；无越界；`test/桌面应用/` 未新建；Provider/preload/IPC/角色卡/目标项目零改动；不暂存/不提交/不推送/不发布 | `git diff --name-only`/`--stat`/`--cached`；角色卡/边界 diff；目标哈希；S1 基线对照 | 统筹、各实施角色 |

### 3.2 P1 索引白名单、顺序与既有索引不回归

**标准**

1. `RoleDocsIndex` 增加 `rootDocs`（或语义等价字段）；`rootDocs` 只含 `feature-map.md`、`functional-description.md`、`api-spec.md` 三个精确文件名，顺序固定为 feature-map → functional-description → api-spec；只返回实际存在的直接普通文件；缺失项不出现，不显示“未提供”占位。
2. `rootDocs` 条目只含元数据（规范文件名、项目相对路径、`kind: "file"`），不读取/返回根文档正文；正文只能经既有受限文档 Service/Provider 的 opaque 引用读取。
3. `memo.md` 永不进入 `changelog`、`docs`、`rootDocs` 或任何等价字段；索引不对 `memo.md` 做 `lstat`/读取，也不对角色根目录做 `readdir`/glob 枚举。
4. `changelog.md` 仍在独立 `changelog` 字段；存在则读到正文，不存在为 `null`；不进入 `docs`/`rootDocs`；不要求任何角色补写。
5. `docs/` 的现有递归遍历、排序（`localeCompare(..., "zh-Hans-CN")`）、500 条上限、隐藏文件跳过、目录/文件条目及路径基准（角色相对）不变；新增 `rootDocs` 不得改变 `docs` 数组语义。
6. `cardPath` 为空、绝对路径、含 `\`、含 `:`、含空段/`.`/`..` 或角色目录不是目录/是符号链接时，返回空索引（`rootDocs: []`、`docs: []`、`changelog: null`），不抛错；内置角色不调用索引，`rootDocs: []`。
7. `rootDocs[].path` 为项目相对路径（如 `角色卡/编排/feature-map.md`），`docs[].path` 为角色相对路径；两者不得混用。

**判定方法**

1. 运行 `node --test test/桌面应用/project.test.ts`，核对新增/更新的 `readRoleDocsIndex` 断言：三文件 + memo + changelog + docs 的夹具返回恰好 3 条 `rootDocs` 且顺序固定；memo 不在任何字段；changelog 仍读到；docs 条目/排序/数量与基线一致。
2. 用独立索引样例（JSON/文本）对照固定顺序；检查缺少中间文件时只返回存在项且相对顺序保持；检查只有 memo 时 `rootDocs: []` 且不抛错。
3. 检查 `readRoleDocsIndex` 的 diff：是否只对角色目录与三个白名单文件做 `lstat`，是否没有角色根目录 `readdir`/glob，是否没有读取根文档正文；`changelog`/`docs` 既有逻辑是否逐字保留或等价。
4. 运行旧 docs/changelog 测试（同一 `project.test.ts` 或基线套件），对照基线输出；检查 500 条上限/隐藏文件跳过/排序断言未改弱。
5. 检查 `RoleView`/`ProjectDocumentRoleCandidates` 是否没有根文档正文；若索引把正文塞进视图，直接按 fail 处理。

**最低证据**

- `test/桌面应用/project.test.ts` 原始输出（命令、退出码、计数、失败原文）。
- 索引样例（三文件齐全/部分缺失/仅 memo/仅 docs/内置角色）与候选哈希。
- `readRoleDocsIndex` diff；`changelog`/`docs` 逻辑未改或等价说明；无根目录 `readdir`/无正文读取的代码/diff 证据。
- 旧 docs/changelog 测试输出与基线对照。

**判定**

- `pass`：上述行为全部满足当前候选；索引只含三个精确文件且顺序固定；memo 永不出现；changelog 独立；docs 不回归；无正文读取。
- `fail`：任意根文件被索引；memo 出现；`rootDocs` 顺序错误；缺失项被占位；docs 排序/数量/上限/隐藏文件行为变化；根文档正文进入 `RoleView`/候选；索引扫描角色根目录。
- `insufficient evidence`：只给出代码阅读或字段存在；无索引样例/测试输出；无法证明 memo 未被读取；无法对照旧 docs 行为。

### 3.3 P2 路径/候选安全、只读与 Provider 零改动

**标准**

1. 白名单单一来源：`src/model/project-document.ts` 的 `ROLE_ROOT_DOC_FILENAMES`/`RoleRootDocName`（或语义等价常量）；桌面索引与 Service 都消费该来源，不各写一份白名单。
2. 索引阶段只允许角色目录根下的三个精确文件；只 `lstat` 角色目录与三个直接普通文件，只接受 `isFile()` 且非符号链接；不扫描任意根文件，不读取 `memo.md`，不读取根文档正文；角色目录为符号链接/非目录时返回空索引。
3. `ProjectDocumentRoleCandidates.rootDocs?` 为可选 additive；Service 计算精确期望路径（`roleDir + "/" + 白名单文件名`），只接受 `kind === "file"` 且路径精确命中的候选；`memo.md`、任意根文件、`../feature-map.md`、绝对路径、反斜杠、冒号、大小写变体、`docs/feature-map.md`、项目外路径一律静默拒绝、不铸造引用、不抛错；`roleDir` 为空时拒绝所有 `rootDocs`。
4. 合法根路径追加在既有 card/changelog/docs 之后，继续经过既有 `eligible()`/`format()`/Set 去重；既有 card/changelog/docs 路径处理不变；重复根文档候选去重为一条 ref。
5. Provider `src/provider/project-document/**` 零改动；既有 `lstat`/`realpath`/`O_NOFOLLOW`/有界读/UTF-8 校验/符号链接拒绝/项目外拒绝/竞态校验不变；不新增第二套读取器、写路径或旁路。
6. 符号链接/项目外/`..`/绝对路径/盘符/UNC/空段/NUL 在索引、Service、Provider 各层按既有语义拒绝；不得为了“显示完整”跟随链接或放宽校验。
7. 读取仍只经 opaque `documentId`/`projectViewId`；渲染层不构造文件系统路径、不自行生成 `documentId`。

**判定方法**

1. 运行 `node --test test/桌面应用/project.test.ts test/桌面应用/project-document.test.ts`，核对索引/Service 负例：`memo.md`、任意根文件、`../feature-map.md`、绝对路径、反斜杠、冒号、大小写变体、`docs/feature-map.md`、重复候选、空 `roleDir`；断言不生成 ref、不抛错、既有 refs 不受影响。
2. 运行 POSIX 符号链接/角色根替换/竞态用例（若环境可用）：符号链接根目录/根文档不列入、不铸造、Provider 读取拒绝；错误码与基线一致。
3. 运行 Windows 用例：`updateListing` 返回 `UNSUPPORTED_ENVIRONMENT`、无 scope、无 refs、不读字节；`role.rootDocs`（索引元数据）仍可列出文件名（若文件存在），但 `documents` 无根文档 refs。
4. 检查 `git diff -- src/provider/project-document` 为空；检查代码中只有角色目录一次 + 三个白名单文件各一次 `lstat`，没有根目录 `readdir`/glob；检查无新写路径/新读取器。
5. 检查白名单定义只有一处，索引/Service 均引用；渲染层不复制白名单/不解析路径。

**最低证据**

- `project.test.ts`/`project-document.test.ts` 原始输出（命令、计数、失败原文）。
- 负例夹具路径/内容/哈希；POSIX 符号链接/竞态测试输出（若有）；Windows fail-closed 输出。
- `src/provider/project-document/**` 零 diff；`git diff --name-only`/`git status --short`；白名单单一来源的 diff/grep。
- 合法候选生成的 refs（`relativePath` 项目相对、`label` 文件名、`format: markdown`）。

**判定**

- `pass`：白名单精确、只 `lstat` 三个直接普通文件、不扫描根目录；非法候选被 Service 拒绝且不铸造；Provider 零改动；无写路径/旁路；合法 refs 正确。
- `fail`：扫描到私有/任意根文件；memo/`../`/绝对路径/符号链接被铸造 ref 或可读；新增写路径/第二读取器；Provider 被改动或校验降级；根文档正文绕过 Service。
- `insufficient evidence`：只有正向用例；无负例/符号链接/Provider diff；只凭代码声明“已校验”；Windows fail-closed 未测。

### 3.4 P3 Interface/RoleView 契约、装配与无新 IPC

**标准**

1. `RoleView.rootDocs?`（或语义等价字段）为可选 additive；`ProjectDocumentRoleCandidates.rootDocs?` 为可选 additive；`RoleDocsIndex.rootDocs` 在桌面索引中按方案为新增字段（可必填）；不破坏旧载荷/类型。
2. `listProject` 对非内置、`cardPath` 非空角色装配 `rootDocs`（缺省 `[]`）；内置角色 `rootDocs: []`、不读项目根/不伪造；索引失败如实留空、不使 `listProject` 崩溃。
3. `documents` 由既有 Service 生成；根文档 refs 追加在既有 card/changelog/docs 之后；既有条目的 `documentId` 与顺序前缀不变；根文档 ref 的 `relativePath` 为项目相对、`label` 为文件名、`format` 为 `markdown`。
4. 不新增 IPC 通道、不新增 preload 方法、不改 `project:document-read` 请求/回包形状、不改 `documentScope` 语义；`app/preload.cjs` 零改动。
5. 旧 renderer/旧 main 兼容：旧 renderer 忽略未知 `rootDocs`；新 renderer 连旧 main 时没有 `rootDocs` 时根文档组不显示、不崩；旧夹具缺少 `rootDocs` 按 `[]` 处理。
6. `api-spec.md` 内容为 `not-applicable` 时按普通 Markdown 文本读取/展示；不特殊解析、不加 badge、不隐藏、不拒绝；不因内容值改变 ref/格式。
7. `RoleView` 仍由 `listProject` 一次性返回；不新增“读根文档正文”的 IPC；根文档正文不进入 `RoleView`。

**判定方法**

1. 检查 `app/desktop/interface.ts`/`src/model/project-document.ts`/`src/service/project-document/impl/read-project-document.ts` 的 diff：字段 additive、无破坏性改名/删除；`listProject` 装配 `idx.rootDocs`；内置角色空态。
2. 运行 `node --test test/桌面应用/interface.test.ts`：`RoleView.rootDocs` 装配；内置角色 `rootDocs: []`；`documents` 含根文档 refs；既有 card/changelog/docs refs 前缀/`documentId` 不变；旧夹具/旧 renderer 兼容断言。
3. 检查 `app/preload.cjs` diff 为空；检查 IPC 通道清单/`project:document-read` 请求/回包形状未变；检查无新增 `ipcMain.handle`/`ipcRenderer.invoke` 通道。
4. 运行 `project-document.test.ts` 的 `not-applicable` 用例：内容为 `not-applicable` 的文件正常返回文本/`format: markdown`，无特殊错误/badge/hide；根文档 ref 的 `relativePath`/`label` 正确。
5. 检查旧 renderer/旧 main 兼容：用旧夹具（无 `rootDocs`）跑 `interface.test.ts`/渲染纯逻辑；新 renderer 连旧 main 的模拟回包不崩、根文档组不显示。
6. 检查 `RoleView`/`documents` 无根文档正文；若正文进入 `listProject` 载荷，按 fail 处理。

**最低证据**

- 类型/接口 diff；`listProject` 装配 diff；`RoleView`/候选类型 diff。
- `test/桌面应用/interface.test.ts` 原始输出；旧夹具/旧 renderer 兼容输出；`documents` refs 清单。
- `app/preload.cjs` 零 diff；IPC 通道/请求形状检查输出。
- `not-applicable` 测试输出；`api-spec` ref 的 `relativePath`/`label`/`format` 断言。

**判定**

- `pass`：契约 additive；装配正确；无新 IPC/preload；旧 renderer/main 兼容；`not-applicable` 普通文本；refs 追加且既有前缀不变；无正文进入 `RoleView`。
- `fail`：破坏性字段改名/删除；新 IPC/preload；旧 renderer 崩；`not-applicable` 被特殊拒绝/隐藏；根文档正文进入 `listProject`；既有 `documentId`/顺序前缀变化未说明。
- `insufficient evidence`：只有类型 diff；无 `listProject` 装配测试；无旧兼容/无新 IPC 证据；只凭代码阅读。

### 3.5 P4 渲染分组、空态、点击、不重复与布局

**标准**

1. `ProfilePanel` 的“文档”节分两组：**角色根文档**与 **`docs/` 目录**；根文档组只在至少一条实际存在时渲染；`docs/` 组只在 `docs.length > 0` 时渲染；两组顺序固定；不按 locale/文件名重排，不伪造缺失项。
2. 节 count = `rootDocs` 中 file 数 + `docs` 中 file 数（目录不计）；两组都空（含内置角色/无任何根文档与 docs 的角色）显示 `ui.profile.noRoleDocs`（或等价新增空态 key）；只有根文档无 docs 时不显示“无 docs/ 目录或为空”作为整节内容；只有 docs 无根文档时不渲染根文档组；部分根文档缺失只显示存在项。
3. 根文档行可键盘操作（按钮），`title`/`aria-label` 使用 `ui.profile.openRootDoc` + 文件名；点击调用既有 `openDocumentList` 的扩展参数（或等价内部动作），刷新 listing 后按 `ref.relativePath === targetRelativePath` 精确匹配，命中且 scope 可读时调用既有 `readDocument(ref)` 进入 `DocumentView` 阅读态；未命中/无 scope/平台不支持时停留列表态并显示既有结构化错误；不构造文件系统路径、不自行生成 `documentId`、不重试风暴。
4. `memo.md` 不渲染（即使后端异常传入，渲染层按文件名/白名单兜底过滤）；`role-card.md`/`boundary.yaml`（或 `boundary.md`）不在“文档”组重复；`changelog.md` 仍在独立“变更记录”节，位置/内容/空态不变。
5. 从 `DocumentView` 返回角色资料时，焦点回到触发该根文档的按钮（`data-root-doc-path` 或等价标记）；无法定位时回退“查看已列文档”按钮；既有 Phase 4A 焦点回归测试扩展后仍通过。
6. 长文档只在 `DocumentView` 内滚动；ProfilePanel 不内嵌正文；960×620、侧栏 208、200% zoom 下“文档”节无水平溢出、根文档按钮可点击、截断标签有 `title`/`aria-label`；不新增固定高度/固定宽度导致裁切；不为中英文各写一套布局。
7. 根文档标签使用 React 文本节点，不使用 `dangerouslySetInnerHTML`；`docs/` 既有 Markdown 索引继续走既有受控 `renderMarkdown`（html:false）。

**判定方法**

1. 运行 `node --test test/桌面UI/document-view.test.ts`（及新增纯逻辑断言）：3 根文档 + N docs；3 + 0；0 + N；0 + 0/内置角色；部分缺失；异常传入 memo；count 不计目录；顺序按后端；精确 `relativePath` 匹配。
2. 运行 Phase 4A 受控冒烟（`./node_modules/.bin/electron test/桌面UI/phase4a-electron-smoke.mjs`）：夹具 `rootDocs` 3 + refs；两组标题/顺序/count；点击根文档进入阅读态；memo 不出现；role-card/boundary 不重复；空态；焦点回归。
3. 真实 Electron `test/桌面应用/e2e/main.mjs`（Windows）：点击角色后能看到三个根文档名；点击后显示 `UNSUPPORTED_ENVIRONMENT`（或等价结构化不可用），不显示正文；fixture 字节/mtime 不变。
4. 布局：在 960×620、侧栏 208、200% zoom 下记录 `document.documentElement.scrollWidth/clientWidth`、关键容器/按钮 `getBoundingClientRect`、`elementFromPoint`；截图角色资料文档节、根文档阅读态、空态；检查截断元素 `title`/`aria-label`。
5. 检查 `ProfilePanel` diff：不再用 `docs.length === 0` 判断整节空；两组条件渲染；`memo` 过滤；`role-card`/`boundary` 不进入文档组；点击动作不拼路径。
6. 检查 `DocumentView`/`drawer-store` diff：`openDocumentList` 可选第三参数；精确匹配；失败保留列表/错误；焦点回归；不改 scope/错误码语义。

**最低证据**

- `test/桌面UI/document-view.test.ts` 原始输出（命令、计数、失败原文）。
- Phase 4A 原始日志与截图；DOM/几何 JSON（窗口尺寸、zoomFactor、sidebar 宽度、scrollWidth/clientWidth、按钮 rect、`elementFromPoint`）。
- 真实 Electron `main.mjs` 日志/截图；Windows 不可用分支；fixture 字节/mtime 前后对比。
- 空态/部分缺失/内置角色样例；点击/焦点回归输出；zh/en 文案观察（P6 交叉）。

**判定**

- `pass`：两组/顺序/count/空态正确；部分缺失不伪造；有根文档无 docs 不显示整节空；内置角色空态；点击可读/不可读分支正确；memo 不渲染；role-card/boundary 不重复；焦点回归；960/200% 无关键裁切。
- `fail`：仍用 `docs.length` 判整节空；缺失项占位/伪造；memo 出现；role-card/boundary 重复；根文档只列名字不可点；点击伪造正文/构造路径；200% 关键操作不可达；文档节撑破抽屉。
- `insufficient evidence`：只有截图缩略图无 DOM/几何；未测点击/焦点；未测 960/200%；只有纯逻辑测试无真实 Electron；空态/部分缺失样例缺失。

### 3.6 P5 平台诚实：Windows fail-closed 与 POSIX 实读分开

**标准**

1. **Windows（客户当前环境）**：索引仍可列出实际存在的三个根文档文件名；`updateListing` 返回 `documentReadUnavailable: "UNSUPPORTED_ENVIRONMENT"`，不建立 scope、不铸造 refs、不返回正文/不读字节；点击根文档后 `DocumentView` 显示既有“当前环境暂不支持安全读取项目文档”，不伪造正文、不把错误吞成空成功；fixture 字节/mtime 前后不变。
2. **POSIX（macOS/Linux）**：在支持环境下真实读取 `feature-map.md`/`functional-description.md`/`api-spec.md` 正文；`byteLength` 正确；`not-applicable` 当普通文本；只读且不修改 mtime；符号链接/根替换/竞态按既有 Provider 错误码拒绝。
3. Windows 与 POSIX 证据分开记录（不同文件/小节/日志），不合并成“全平台可读”；不得用 Windows 的“文件存在/列名”冒充“正文可读”；不得用 POSIX 结果覆盖 Windows fail-closed 断言。
4. 若当前无 POSIX 环境：记录“未执行 + 环境限制”（命令/原因/日期）；P5 判 `insufficient evidence`（团队计划 §2.3.5），不得判 pass；只有在客户以书面确认明确收窄本轮平台范围为“仅 Windows 列名 + 不可用提示”时，才可按 `not applicable` 处理 POSIX 实读子项，并在报告写明依据。
5. 不修改 `src/provider/project-document/**`/Windows 受限读取 Provider；不旁路读取；不新增明文/第二次内容来源；不把本变更升 T3。

**判定方法**

1. Windows：运行 `test/桌面应用/project-document.test.ts`/`interface.test.ts` 的 Windows fail-closed 用例；运行真实 Electron `main.mjs`（Windows）点击角色/根文档；记录 `documentReadUnavailable`、无 scope/refs、无正文、fixture 字节/mtime。
2. POSIX：在 macOS/Linux 运行 `test/测试/p1p7-document-integration.test.ts`/`e2e/main.mjs` 的根文档实读用例；记录正文/`byteLength`/`not-applicable`/mtime；记录符号链接/竞态错误码。
3. 分平台检查 `git diff -- src/provider/project-document` 为空；检查没有新增 Windows 读取路径/旁路/Provider 分支。
4. 检查 e2e/报告是否把 Windows 与 POSIX 放在同一“通过”结论；若合并或互相替代，按 fail/insufficient 处理。
5. 检查无 POSIX 环境时是否有“未执行”记录与证据不足判断；不得把 Windows 列名/文件存在当成 POSIX 实读。

**最低证据**

- Windows：`project-document`/`interface` 原始输出；真实 Electron 日志/截图；`UNSUPPORTED_ENVIRONMENT`、无 scope/refs、无正文、fixture 字节/mtime 前后。
- POSIX：实读原始输出/日志；正文/`byteLength`/`not-applicable`/mtime；符号链接/竞态错误码；环境（OS/内核/Node/Electron）。
- 分平台证据清单；Provider 零 diff；无新增旁路/读取路径的检查。

**判定**

- `pass`（P5 整体）：Windows fail-closed 与 POSIX 实读均按标准执行且证据分离；不伪造正文；Provider 零改动。
- `fail`：Windows 声称可读/返回正文/建立 scope/铸造 refs；旁路读取/吞错误；修改 Provider/放宽安全；POSIX 未测却声称可读；Windows/POSIX 合并或互相替代。
- `insufficient evidence`：Windows fail-closed 缺失；POSIX 未执行且未记录环境限制；只给 Windows “文件存在”/列名；无字节/mtime/截图；分平台证据不可区分。

### 3.7 P6 i18n 标签、parity 与不翻译内容

**标准**

1. 根文档分组标题、`docs/` 分组标题、整节空态、单文件打开按钮（`title`/`aria-label`）使用 zh-CN/en-US 双语 key；若实现可选副标签（功能导航/模块视图/接口报告），也须 zh/en 齐全；key 命名可按项目管理现有规范，语义不变。
2. 新增/复用 key 在 `src/common/shared/i18n/messages/zh-CN.ts` 与 `en-US.ts` 中全集 parity（无单边 key）；默认 locale 为 zh-CN；不得在渲染层/主进程硬编码中文 UI 文案。
3. 文件名 `feature-map.md`/`functional-description.md`/`api-spec.md`、路径、`docs/`、`not-applicable`、`changelog.md` 等路径/内容标识不翻译；`api-spec` 的 `not-applicable` 不加 badge/不改成本地化状态；`changelog` 现有 key 不改。
4. `memo.md` 不因任何 key/标签被展示；不得新增“显示 memo”的 key/开关；显示过滤是兜底，不是安全边界。
5. key 归属：项目管理唯一写入 `src/common/shared/i18n/messages/`；桌面UI 只经既有 i18n facade 消费；不创建第二份 messages/resolver/catalog。
6. 若现有 key 被认为足够，S5 必须记录“N/A + 复用语义/理由”，且渲染层不得硬编码；若只实现 4 个必需 key、不做 3 个可选副标签，须在报告写明可选子项 N/A，不判 fail（方案 §5.5.6/团队计划 §八.9）。

**判定方法**

1. 运行 `node --test test/项目管理/shared/i18n.test.ts`（及按需 `i18n-integration.test.ts`）：zh/en key 全集、新增 key 值、默认 zh；检查无单边 key。
2. 检查 messages diff：key 语义/分组/空态/打开标签；文件名/路径/`not-applicable` 未翻译；`memo` 无 key；无第二份 messages。
3. 运行渲染层测试/真实 Electron，观察 zh-CN/en-US 分组标题、空态、按钮 title/aria；检查文件名原样、`not-applicable` 原样。
4. 源码扫描（`rg`/AST/守卫）渲染层与主进程：无新增硬编码中文 UI 文案；桌面UI 只经 facade；无 `dangerouslySetInnerHTML` 渲染根文档标签。
5. 检查可选副标签：若未实现，报告记录 N/A 及团队计划 §八.9 依据；若实现，检查 zh/en 齐全；不得因缺少可选副标签判 fail。

**最低证据**

- `i18n.test.ts`/`i18n-integration.test.ts` 原始输出（key parity/值/默认 zh）。
- messages diff；key 清单；无硬编码中文扫描输出；无第二份 resolver/messages 的检查。
- zh/en 真实输出/截图（分组/空态/按钮）；文件名/`not-applicable` 原样观察。
- 可选副标签 N/A 理由（若适用）。

**判定**

- `pass`：必需 key zh/en 齐全、无硬编码、无单边 key；文件名/路径/`not-applicable` 不翻译；memo 不展示；无第二份 messages；可选子项按记录处理。
- `fail`：只在 zh 加 key；英文缺失/错 key；硬编码中文；翻译文件名/路径/`not-applicable`；memo 通过 key/开关展示；创建第二份目录/resolver；把可选副标签缺失判为失败（若已记录 N/A）。
- `insufficient evidence`：只有 key 数量；无 zh/en 输出；无扫描/守卫；无 `memo`/`not-applicable` 行为证据。

### 3.8 P7 测试、跨层与真实 Electron 证据

**标准**

1. 受影响单测/层测试在当前候选执行：`test/桌面应用/project.test.ts`、`project-document.test.ts`、`interface.test.ts`；`test/桌面UI/document-view.test.ts`；按需 `test/项目管理/shared/i18n.test.ts`；跨层 `test/测试/p1p7-document-integration.test.ts`；真实 Electron `phase4a-electron-smoke.mjs` 与 `test/桌面应用/e2e/main.mjs`。
2. 跨层证据覆盖：`listProject` → `RoleView.rootDocs` → renderer 展示；`projectDocumentCandidates` → Service refs；点击根文档 → `DocumentView` 阅读态/不可用态；候选负例 → Service 拒绝。
3. `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` 在当前候选通过；构建产物与源码一致（build 后未被后续修改）。
4. T2 不默认全量 T3；若执行全量回归，记录命令/范围/理由/结果；不得只跑单测、跳过跨层或真实 Electron；不得把 `skip`/`todo` 无理由计为通过。
5. 断言未弱化：既有 docs/changelog、Windows fail-closed、`documentId` 前缀/顺序断言不得删除或放宽；`documents` 数量变化必须说明“新增根文档 refs，不是回归”，并保留既有断言或等价强度。
6. 失败分类：本次新增失败 / 既有失败（如 Windows symlink EPERM/桌面时序偶发）/ 环境不可用；新增失败未修复不得放行；既有失败须附基线证据与原因；不得笼统写“环境问题”。
7. 候选哈希/原始输出/退出码/计数/失败原文可复算；不接受“全部通过”摘要。

**判定方法**

1. 核对变更包命令清单与 §四.2 对照；逐项检查命令是否在当前候选执行、退出码、计数、失败原文；用候选哈希复算文件身份。
2. 检查测试 diff：是否删除/放宽既有断言、跳过用例、改 fixture 适配失败；`documents` 数量变化是否有说明；Windows fail-closed 是否仍断言。
3. 检查跨层证据：`interface.test.ts` 的 `RoleView.rootDocs`/`documents` 装配；`p1p7` 的候选→Service refs；Phase 4A 的点击/焦点；`main.mjs` 的真实 Electron。
4. 检查 typecheck/build 输出与退出码；build 后源码/产物身份；`typecheck:renderer` 是否覆盖新增渲染文件。
5. 检查失败分类表与基线对照；新增失败、跳过、不可用是否如实记录。

**最低证据**

- 命令清单与原始输出（cwd、环境、Node/npm、退出码、计数、失败原文）。
- 测试 diff（无弱化）；`documents` 数量变化说明；跨层/Electron 日志/截图。
- typecheck/typecheck:renderer/build 原始输出；候选哈希清单。
- 失败分类表/基线对照；全量回归理由（若执行）。

**判定**

- `pass`：选定检查齐全、原始输出可复算、无弱化断言、无新增失败、跨层/Electron 证据对应当前候选。
- `fail`：只跑单测/跳过 Electron；改断言保绿；删除既有 Windows/docs 断言；新增失败未处理；候选哈希不可复算；把根文档新增 refs 说成回归或反之。
- `insufficient evidence`：输出缺失/摘要化；命令与候选不匹配；跨层/Electron 缺失；失败分类不明。

### 3.9 P8 范围、权限、非目标与零改动

**标准**

1. 无新增角色、无角色卡/边界变更、无权限/治理变更；不新增 `cardKind`、`FlowStepKind`、`GovernancePower`、`GovernanceDecisionKind`、artifact kind；不改 `resolveWrite`/`TaskScope`/门禁引擎/编排。
2. 不改 `src/provider/project-document/**`（Q9 A）；不改 `app/preload.cjs`、`app/main.ts`、IPC 通道名/请求/回包形状、`documentScope` 语义；不改 `src/service/project-document/abstract|public`、`src/pipeline/project-document/read-project-document.ts`（仅类型透传确需时最小改动并回报，默认不改）。
3. 除统筹/内置验收按角色写 `docs/scheduling/`、`docs/acceptance/` 记录外，不改 `docs/**` 既有管理记录；不改目标项目 `ans-gateway/**` 或任何外部项目；不迁移/重命名/移动现有角色；不要求每个角色补 changelog/docs；不复制内容到第二位置。
4. 不改 `package.json`/`package-lock.json`/`tsconfig.json`/`vite.config.ts`/`electron-builder.yml`/发布配方/冻结源/`.ans`/`.env`/依赖；不新增依赖/新枚举/新写路径。
5. 改动路径在团队计划 §三写集内；管理记录（`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`）不混入产品候选；不写 `docs/verification/` 伪造记录。
6. 不提交、不暂存、不推送、不合并、不发布；不修改 flow/账本/`.ans` 治理状态。

**判定方法**

1. 对照 S1 基线，列出候选 `git diff --name-only`/`git status --short`；逐路径核对团队计划 §3.1–§3.7 写集；范围外路径零改动。
2. 检查 `git diff -- src/provider/project-document`、`app/preload.cjs`、`app/main.ts`、`package.json`/锁文件/构建配置为空；检查依赖清单无新增。
3. 检查角色卡/边界/YAML/目标项目哈希与 S1 基线一致；检查无迁移/重命名/新增文件；检查目标项目零写入。
4. 检查治理枚举/协议字段/flow step id 无新增/改名；检查 `src/common/门禁引擎/**`、`src/pipeline/orchestration/**`、`src/model/{boundary,role,decision}.ts` 零改动（除非方案明确允许且已回报）。
5. 检查 `git diff --cached --name-only` 为空；无 commit/push 记录；无 `docs/verification/` 新记录。
6. 检查管理记录与产品候选分离：`docs/scheduling/`/`docs/acceptance/`/`docs/communication/` 的哈希不作为产品文件哈希，不混入候选清单。

**最低证据**

- S1 基线路径/哈希；候选 `git diff --name-only`/`--stat`/`--cached`/status。
- Provider/preload/main/package/构建配置零 diff；依赖清单。
- 角色卡/边界/YAML/目标项目基线/候选哈希对照（零变化）。
- 治理枚举/协议/编排零改动检查；管理记录与产品候选分离清单。

**判定**

- `pass`：范围/权限/非目标全部满足；Provider/preload/角色卡/目标项目零改动；无新依赖/枚举/写路径；无提交/暂存/推送/发布。
- `fail`：顺手改角色卡/边界/Provider/preload/IPC/目标项目；新增角色/依赖/枚举/写路径；迁移现有角色；要求补 changelog/docs；提交/推送/发布；管理记录混入产品候选。
- `insufficient evidence`：无 S1 基线/路径 diff；只声明“未改”；无法区分管理记录与产品候选；目标项目未做零写入核对。

### 3.10 P9 证据完整性与可复算

**标准**

1. 变更包（`docs/scheduling/role-root-docs-display-change-v1.md`）至少含：候选哈希/版本、改动路径（相对 S1 基线）、任务节点 S1–S7、证据链接、风险档位 T2、复用证据与失效说明、环境、未解决问题、P 编号对照、与其他变更的隔离声明。
2. 每个候选文件有 `git hash-object` + `sha256sum`；HEAD/status/diff/stat 可复算；候选与证据哈希一致；管理记录不作为产品候选哈希。
3. 每项检查记录命令原文、cwd、环境（Node/npm、OS/Shell）、退出码、测试计数（pass/fail/skip/todo）、失败原文（不截断关键堆栈）、执行时间；跳过项写明原因；只给“全部通过”摘要不算原始证据。
4. Windows/POSIX 证据分开（文件/小节/日志）；fixture 路径/内容/字节/mtime；截图/几何附生成命令、候选哈希、窗口尺寸/zoom、临时 userData 路径；目标项目零写入前后哈希。
5. 不得伪造命令/输出/令牌/锁/审批/机器预检；不得写 `docs/verification/` 伪造记录；不得把设计/计划写成已实施。
6. 证据失效：候选、输入/依赖、契约、夹具、配置、i18n 目录、目标样例变化时，受影响证据失效；同候选/同输入/同命令才可复用；失效部分补证，不得用旧候选证据。
7. 证据路径可打开、可核对；失败分类明确（新增/既有/环境不可用）；不接受无法定位的截图/日志。

**判定方法**

1. 核对变更包字段与 §四.1/§四.2 清单；逐文件复算 `git hash-object`/`sha256sum`；核对 HEAD/status/diff/stat 与证据中的候选哈希。
2. 抽查原始日志：命令、退出码、计数、失败原文、环境；检查是否有“全部通过”无明细；检查 skip/todo 理由。
3. 检查 Windows/POSIX 分平台记录；fixture 字节/mtime；截图/几何元数据；目标项目零写入前后哈希。
4. 检查证据复用/失效说明：候选是否变化、依赖/夹具/配置是否变化；旧证据是否被不当复用。
5. 检查 `docs/verification/` 无伪造记录；管理记录与产品候选分离；证据路径可打开。

**最低证据**

- 变更包完整文本与哈希；逐文件 `git hash-object` + `sha256sum`；HEAD/status/diff/stat。
- 原始命令输出/退出码/计数/失败原文；环境记录；skip/todo 理由。
- Windows/POSIX 分平台证据；fixture 字节/mtime；截图/几何元数据；目标零写入哈希。
- 复用/失效说明；失败分类表；证据路径清单。

**判定**

- `pass`：变更包完整、候选可复算、原始证据齐全、分平台/夹具/截图/目标零写入可核对、复用/失效说明清楚。
- `fail`：候选哈希不符/不可复算；摘要代替原始输出；Windows/POSIX 合并；fixture/截图无元数据；伪造/转述；用旧候选证据；管理记录冒充产品哈希。
- `insufficient evidence`：任一必需字段/日志/哈希缺失；证据路径不可打开；无法对应候选；失败分类不明。

### 3.11 P10 文档状态如实（实施/测试/验收分离）

**标准**

1. 实施文档/变更记录/状态行如实标注 `implemented-unverified`（实现完成但未验收）或等价状态；`verified-by-tests-only` 不等于验收通过；未验收前不得写 `verified`、不得声称“已支持根文档展示/已完成”。
2. 本验收标准先于实施写盘并冻结；验收报告另写 `docs/acceptance/role-root-docs-display-report-v1.md`，不得把标准当报告、不得提前写结论。
3. 不把设计/计划写成实施结果；不改写方案/团队计划的状态头；沟通记录是闸门事实来源；状态漂移只报告，不自行校正方案/计划。
4. 报告/交付说明链接实际证据路径；未做/未测项如实写“未做/未测”；不伪造 `docs/verification/`；实施角色不写验收结论，验收结论只由独立验收写。
5. 发布/提交状态如实：本变更未提交/未发布；验收通过只表示当前候选满足标准，不授权提交/推送/合并/发布。

**判定方法**

1. 阅读各角色实施记录/变更包/状态行，核对 `implemented-unverified`/`verified-by-tests-only` 与“已验收/已支持”的区分；检查是否有提前 verified。
2. 检查本文件与报告路径分离：标准 v1 已冻结；报告是否存在、作者是否为独立验收；报告是否在实施后写。
3. 检查方案/团队计划状态头未被改写；沟通记录与哈希可追溯；状态漂移有记录。
4. 检查证据链接有效、未做/未测项如实、无 `docs/verification/` 伪造；检查实施角色未自写验收结论。
5. 检查变更包/交付说明是否声明未提交/未发布；是否把“测试通过”写成“验收通过”。

**最低证据**

- 文档 diff/状态行原文；实施记录/变更包；报告路径/作者/时间。
- 方案/团队计划状态头 diff（应无改写）；沟通记录哈希。
- 未做/未测声明；证据链接清单；提交/发布状态。

**判定**

- `pass`：状态如实、标准/报告分离、链接有效、无提前 verified、无自验收、未提交/未发布声明清楚。
- `fail`：声称“已支持/已验证”但无验收；把设计写成实施；实施角色自写验收结论；改写方案/计划状态头冒充确认；伪造 verification；提前声称通过。
- `insufficient evidence`：无文档/状态行；无法区分标准/报告/实施状态；链接失效；报告作者/时间不可核对。

### 3.12 G1 变更包与候选身份（流程核对）

**标准**

1. 统筹提交 `docs/scheduling/role-root-docs-display-change-v1.md`，内容至少含：候选哈希/版本、改动路径（相对 S1 基线）、任务节点 S1–S7、证据链接、风险档位 T2、复用证据与失效说明、环境、未解决问题、P 编号对照、与其他变更的隔离声明。
2. 候选身份可复算：逐文件 `git hash-object` + `sha256sum`；HEAD/status/diff/stat；`git diff --cached --name-only` 为空；候选与证据哈希一致；新增文件同。
3. S1 基线隔离：逐文件哈希基线；本变更候选只列相对 S1 的增量；i18n/目录 v3/治理写卡/验收返工路由等既有改动声明为“既有上下文”，不纳入本变更候选，也不为其背书。
4. 管理记录（`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、`docs/planning/`）不混入产品候选；不得把管理记录哈希当作产品文件哈希。
5. 变更包声明 T2 与选定检查；若升档/全量回归，记录理由/命令/范围；若复用证据，记录同候选/同输入/同命令依据。

**判定方法**

1. 核对变更包路径/字段齐全；逐文件复算哈希；核对 HEAD/status/diff/stat 与证据。
2. 检查 S1 基线记录与候选增量；检查既有上游改动是否被隔离；检查共享文件 hunk 是否只属本变更。
3. 检查管理记录/产品候选分离；检查证据链接可打开；检查 T2/复用/失效说明。
4. 检查变更包是否声明未提交/未发布、未解决问题。

**最低证据**

- 变更包全文/哈希；S1 基线哈希清单；逐文件候选哈希；HEAD/status/diff/stat/cached。
- 隔离说明/共享文件 hunk 归属；管理记录/产品候选分离清单；证据链接清单。

**判定**

- `pass`：变更包完整、候选可复算、S1 隔离/复用说明清楚、管理记录不混入。
- `fail`：变更包缺关键字段；候选哈希不符/不可复算；管理记录冒充产品哈希；未声明隔离/复用；用其他变更结论背书。
- `insufficient evidence`：字段/哈希/链接缺失；无法区分既有上下文与本变更候选；S1 基线不可复算。

### 3.13 G2 写集、边界与零改动（流程核对）

**标准**

1. 所有改动路径在团队计划 §3.1–§3.7 写集内；每个文件同一时间只有一个 owner；共享文件按 §3.9/§4.2 串行写入，无并发混入。
2. `test/桌面应用/` 不新建文件；只改 `project.test.ts`、`project-document.test.ts`、`interface.test.ts`、`e2e/main.mjs`（逐文件授权）；`e2e/main.mjs` 只最小追加，不删除既有断言、不把 Windows fail-closed 改成通过。
3. `src/provider/project-document/**` 零改动；`app/preload.cjs`/`app/main.ts` 零改动；无新 IPC 通道/请求/回包形状变化；`package.json`/锁文件/构建配置/发布配方零改动。
4. 无角色卡/边界/YAML/角色迁移/目标项目写入；无新增角色/权限/枚举/依赖；无提交/暂存/推送/合并/发布。
5. 改动路径与 S1 基线对照：本变更只含本变更 hunk；其他变更的改动不被吸收/覆盖；无未授权文件。
6. 管理记录（`docs/scheduling/`、`docs/acceptance/`）由统筹/内置验收写，worker 不写；`docs/verification/` 不伪造。

**判定方法**

1. 将 `git diff --name-only`/`--stat`/`--cached`/status 与团队计划 §三逐路径对照；标注 owner/写集/是否新增文件。
2. 检查 `test/桌面应用/` 无新建；`e2e/main.mjs` diff 只追加；既有断言未删除/弱化。
3. 检查 Provider/preload/main/package/构建配置零 diff；检查 IPC 通道清单无新增；检查角色卡/边界/YAML/目标项目零改动。
4. 检查 S1 基线对照/共享文件 hunk 归属；检查其他变更的改动未被吸收；检查无 commit/push/staged。
5. 检查 worker 未写 `docs/scheduling/`/`docs/acceptance/`；无 `docs/verification/` 伪造。

**最低证据**

- `git diff --name-only`/`--stat`/`--cached`/status；逐路径写集/owner 对照表。
- `test/桌面应用/` 文件清单/diff；`e2e/main.mjs` diff；Provider/preload/main/package/构建配置零 diff。
- 角色卡/边界/YAML/目标项目哈希对照；IPC 通道清单；S1 基线/共享文件 hunk 归属。
- 无 staged/commit/push 检查；管理记录写者核对。

**判定**

- `pass`：改动全在写集内、无新建 `test/桌面应用/`、Provider/preload/角色卡/目标项目零改动、无提交/推送/发布、共享文件隔离清楚。
- `fail`：越界写/新建未授权文件；改 Provider/preload/IPC/角色卡/目标项目；删除/弱化 e2e 断言；吸收其他变更；提交/推送/发布；worker 写管理记录。
- `insufficient evidence`：无 diff/status/基线；无法区分其他变更改动；写集/owner 不明；目标项目未核对。

### 3.14 覆盖对照（任务要求 → 验收项）

| 要求主题 | 落点 |
| --- | --- |
| 索引/根文档、固定顺序、只显示存在、memo 永不入索引、changelog 独立、docs 不回归 | P1 |
| 路径/候选安全、精确白名单、Service 二次校验、只 lstat 直接文件、不扫描根目录、Provider 零改动 | P2 |
| Interface/RoleView、additive、listProject 装配、无新 IPC/preload、旧兼容、`not-applicable` 普通文本 | P3 |
| 渲染分组、空态、点击 DocumentView、memo 不渲染、role-card/boundary 不重复、长文/窄窗/200% | P4 |
| Windows 只列名 + 既有 `UNSUPPORTED_ENVIRONMENT`、不伪造/不读字节、POSIX 实读另记 | P5 |
| i18n key/parity、无硬编码、文件名/路径/`not-applicable` 不翻译、memo 不因 key 展示 | P6 |
| 受影响单测/层测试 + 跨层 + 真实 Electron、typecheck/build、T2 不全量、断言不弱化、候选哈希/原始日志 | P7 |
| 无新增角色/边界/权限/枚举/依赖、不改 Provider/preload/IPC/角色卡/目标项目、不迁移、不要求补 changelog/docs | P8 |
| 证据完整性：候选哈希、命令/退出码/计数、失败原文、Windows/POSIX 分开、fixture 字节/mtime、截图/几何 | P9 |
| 文档状态：implemented-unverified/verified-by-tests-only ≠ 验收、标准先于实施、报告另写、不提前宣称 | P10 |
| 变更包完整/候选可复算/管理记录不混入 | G1 |
| 写集/边界/零改动/无提交 | G2 |

---

## 四、证据计划

### 4.1 候选与基线证据

- 写前基线：`git rev-parse HEAD`、`git status --short`、目标文件 `git hash-object` + `sha256sum`；S1 逐文件记录（含共享文件与 i18n messages）。
- 候选身份：所有新增/改动文件（产品代码、测试、i18n messages、配置）的 `git hash-object` + `sha256sum`；CRLF/LF 差异分别记录，不互相误判。
- 改动范围：`git diff --name-only` 与 `git status --short` 必须落在团队计划写集内；`git diff --cached --name-only` 为空（不暂存）；无授权外已跟踪变化。
- 环境：Node/npm 实测版本/完整路径、OS/Shell、命令工作目录；当前 shell PATH 无 Node 时先按团队计划 §1.4 加入并记录，不得伪造。
- 候选隔离：本变更候选只列相对 S1 基线变化的路径；i18n/目录 v3/治理写卡/验收返工路由的既有改动声明为“既有上下文”，不纳入本变更候选；共享文件按团队计划 §3.9/§4.2 串行写入。
- 基线证据：S1 记录（HEAD、status、逐文件哈希、受影响套件基线、环境）用于失败分类与既有失败对照；它不是本变更的通过证据，也不能替代当前候选复跑。

### 4.2 命令清单（按仓库实际脚本/runner；当前 Node 不在 PATH）

| 范围 | 命令 | 产出角色 |
| --- | --- | --- |
| 后端索引/候选/Interface | `node --test test/桌面应用/project.test.ts test/桌面应用/project-document.test.ts test/桌面应用/interface.test.ts` | 桌面窗口 |
| 渲染纯逻辑 | `node --test test/桌面UI/document-view.test.ts` | 桌面UI |
| 跨层候选→Service | `node --test test/测试/p1p7-document-integration.test.ts` | 测试 |
| i18n 集成（按需） | `node --test test/测试/i18n-integration.test.ts` | 测试 |
| i18n key（S5） | `node --test test/项目管理/shared/i18n.test.ts` | 项目管理 |
| 根 typecheck | `npm run typecheck` | 桌面窗口/项目管理 |
| 渲染 typecheck/build | `npm run typecheck:renderer`、`npm run build:renderer` | 桌面UI |
| Phase 4A 真实 Electron | `./node_modules/.bin/electron test/桌面UI/phase4a-electron-smoke.mjs` | 桌面UI |
| 真实 Electron 总自检 | `node test/桌面应用/e2e/main.mjs`（按脚本现有运行说明；Windows 列表+不可用；POSIX 实读分开） | 桌面窗口/测试 |

命令若因仓库实际脚本/runner 不同而调整，须在变更包中记录实际命令、原因与等价性；不得用不可运行的示例命令冒充结果。

### 4.3 原始输出要求

每项检查记录：命令原文、工作目录、环境（Node/npm、OS/Shell）、退出码、测试计数（pass/fail/skip/todo）、失败原文（不截断关键堆栈）、执行时间；跳过项写明原因。只给“全部通过”摘要不算原始证据。截图/几何文件附生成命令、候选哈希、窗口尺寸/zoom、临时 userData 路径。

### 4.4 文件哈希与 diff/status

- 每个候选文件：`git hash-object <path>` + `sha256sum <path>`；新增文件同。
- `git status --short`、`git diff --name-only`、`git diff --cached --name-only`；逐路径核对写集。
- 范围外文件（`src/provider/project-document/**`、`app/preload.cjs`、`app/main.ts`、`package.json`/锁文件/构建配置、角色卡/边界/目标项目）记录基线/候选哈希对照，证明零改动。
- 测试 diff 用 `git diff -U0` 片段证明既有断言未被改写/删除；`documents` 数量变化说明单独记录。

### 4.5 截图/几何

- 截图：角色资料“文档”节（3 根文档 + docs；只有根文档；只有 docs；空态/内置角色）、根文档阅读态、Windows 不可用提示、960×620/侧栏 208、200% zoom；zh-CN/en-US 对照。
- 几何：`document.documentElement.scrollWidth/clientWidth`；文档节/关键容器 `scrollWidth/clientWidth`；根文档按钮/“查看已列文档”按钮 `getBoundingClientRect` + `elementFromPoint`；截断元素与 `title`/`aria-label` 对照；窗口尺寸、sidebar 宽度、zoomFactor、临时 userData。
- 截图/日志不写 `docs/verification/`；按团队计划/角色证据目录存放；附候选哈希与生成命令。

### 4.6 Windows fail-closed 与 POSIX 实读分开

- **Windows（客户当前环境）**：只验证“三个文件名可列出 + 点击显示既有 `UNSUPPORTED_ENVIRONMENT` + 不建立 scope/不铸造 refs/不返回正文/不读字节”；fixture 字节/mtime 前后不变；不得声称正文可读。
- **POSIX（macOS/Linux）**：验证真实 `feature-map.md`/`functional-description.md`/`api-spec.md` 正文可读、`not-applicable` 当普通文本、只读且不修改 mtime；符号链接/竞态错误码与基线一致。
- 分平台证据放不同文件/小节/日志，报告不得合并成“全平台可读”；无 POSIX 环境时记录“未执行 + 环境限制”，按 `insufficient evidence` 处理（团队计划 §2.3.5）。

### 4.7 真实 Electron 要求

- 使用临时 userData/临时项目根（记录绝对路径），不写真实用户目录/仓库根 `.env`；不依赖真实模型凭据；离线可运行。
- 覆盖：点击角色 → 文档节两组；点击根文档 → 阅读态/不可用；memo 不出现；role-card/boundary 不重复；空态/内置角色；部分缺失；焦点回归；960×620/侧栏 208/200% 几何/截图；Windows/POSIX 分开。
- 记录 Electron 版本、窗口尺寸、zoomFactor、sidebar 宽度、临时 userData、候选哈希；截图/几何不能只有缩略图或口头摘要。
- 如果真实 Electron 因环境不可用无法执行，按 `insufficient evidence` 处理，不得以单测替代点击/布局/平台结论；记录环境边界。

### 4.8 目标项目零写入

- 目标项目 `ans-gateway` 仅只读样例；记录其角色目录/关键文件前后哈希（至少 7 个角色目录的文件清单/哈希）与 `git status`（若其为独立仓库）；确认无新增/修改/删除、无 `docs/verification/`、无补写 changelog/docs。
- 真实 Electron/POSIX 读取使用临时项目根或目标只读副本；不得在目标项目内创建临时文件；读取后 mtime/字节不变。
- 若目标项目在证据期间外部漂移，记录漂移事实与只读复算时间；不得用漂移后的状态冒充本变更写入。

### 4.9 证据复用与失效

- 可复用：同候选、同输入/依赖、同命令、同配置/夹具、同环境的证据；复用须在变更包列链接与复用理由。
- 失效：候选文件、依赖、契约/类型、Service/Provider、测试夹具、构建配置、i18n 目录、目标样例变化时，受影响证据失效；只补失效部分，不得用旧候选/其他变更证据。
- 失败分类：本次新增失败 / 既有失败（附基线证据/原因）/ 环境不可用；新增失败不得放行；环境不可用但无替代证据按 `insufficient evidence`。

### 4.10 证据路径与禁止事项

- 证据路径按团队计划/角色记录；`docs/acceptance/` 只放标准与报告；管理记录不混入产品候选。
- 禁止：伪造命令/输出/哈希/令牌/锁/审批；改断言保绿；跳过来源；把设计/计划写成已实施；把摘要当原始证据；用其他变更证据替本变更背书；写 `docs/verification/` 伪造记录；在目标项目写入。

---

## 五、成功、失败与边界情形（判定观察点）

| 情形 | 预期观察 | 判定 |
| --- | --- | --- |
| 角色目录有 3 根文档 + memo + changelog + docs | `rootDocs` 恰好 3、固定顺序；memo 不在任何字段；changelog 仍读到；docs 条目/排序/数量与基线一致 | 顺序/memo/docs 变化 → P1 fail |
| 只有 3 根文档，无 changelog/docs | `rootDocs` 3；`changelog: null`；`docs: []`；文档节显示根文档组，不显示误导性整节空 | 显示“无 docs/”整节空 → P4 fail |
| 只有 memo（无根文档） | `rootDocs: []`；不读/不显示 memo；不抛错 | memo 出现/读取 → P1/P4 fail |
| 缺少其中一个根文档 | 只返回/显示存在的；顺序保持相对；不显示占位 | 占位/补造 → P1/P4 fail |
| changelog 有/无 | 有则“变更记录”显示正文；无则“（无 changelog.md）”；不进入 docs/rootDocs；不要求补写 | 混入 docs/强制补写 → P1/P3 fail |
| docs/ 有/无 | 有则 docs 组显示现有条目/排序；无则不渲染 docs 组；不改变遍历/上限/隐藏文件 | docs 回归/整节误空 → P1/P4 fail |
| 内置角色 | `rootDocs: []`、`docs: []`；诚实空态；不读项目根/不伪造 | 伪造/读取项目根 → P1/P4 fail |
| `api-spec.md` 内容 `not-applicable` | 正常列出/打开为普通 Markdown 文本；无 badge/特殊错误/隐藏 | 特殊拒绝/隐藏/badge → P3/P6 fail |
| 根文档是符号链接/角色目录是符号链接（POSIX） | 索引不列出；Service 不铸造；Provider 读取拒绝；不读正文 | 跟随链接/可读 → P2/P5 fail |
| 候选含 memo/任意根文件/`../`/绝对路径/反斜杠/冒号/大小写变体/`docs/feature-map.md` | Service 精确校验拒绝；不铸造；不抛错；既有 refs 不变 | 铸造/可读/影响既有 → P2 fail |
| 候选重复根文档 | 去重为一条 ref | 重复 ref → P2 fail |
| Windows：`updateListing` | `UNSUPPORTED_ENVIRONMENT`；无 scope/refs/正文；不读字节；索引仍列名；点击显示既有提示 | 声称可读/有 refs/正文 → P5 fail |
| Windows：点击根文档 | `DocumentView` 列表态 + 结构化 `UNSUPPORTED_ENVIRONMENT`；不伪造正文；fixture 字节/mtime 不变 | 空白/假正文/吞错 → P5 fail |
| POSIX：根文档真实读取 | 正文/`byteLength` 正确；`not-applicable` 普通文本；只读/mtime 不变；符号链接/竞态错误码不变 | 不可读/改 mtime/错误码变化 → P5 fail |
| 无 POSIX 环境 | 记录“未执行 + 环境限制”；P5 `insufficient evidence`；不以 Windows 结果替代 | 声称全平台可读/把 Windows 列名当实读 → P5 fail/insufficient |
| 根文档超过 256 KiB / 非 UTF-8 / 含 NUL | 文件名仍列出；打开显示既有 `TOO_LARGE`/`INVALID_UTF8`/`BINARY_CONTENT`；不返回 partial 正文 | 返回 partial/崩溃/隐藏文件名 → P2/P5 fail |
| 文件在列目录后被删除 | 打开显示既有 `NOT_FOUND`；下次 `listProject` 刷新索引；不伪造 | 显示旧正文/崩溃 → P3/P5 fail |
| 无原生授权/项目未导入 | 索引仍列文件名；打开显示既有 `PROJECT_NOT_GRANTED` 类错误；不伪造 | 伪造正文/崩溃 → P3/P5 fail |
| 旧 renderer/旧 main | 旧 renderer 忽略 `rootDocs`；新 renderer 连旧 main 无根文档组、不崩；旧夹具按 `[]` | 崩/类型破坏 → P3 fail |
| 长文/窄窗/960×620/200% | 文档节无水平溢出；按钮可点击；截断有 title/aria；长文在 DocumentView 内滚动 | 关键操作被裁切/不可点 → P4 fail |
| 文档节计数 | count = 根文档 file 数 + docs file 数；目录不计；0 显示空态 | 目录计数/整节误空 → P4 fail |
| 异常传入 memo 到 rootDocs | 渲染层显示过滤不渲染 memo；Service 已拒绝其 ref | memo 出现 → P4/P2 fail |
| 目标项目 `ans-gateway` | 零写入；文件哈希/status 前后一致；无补 changelog/docs | 写入/迁移/补文件 → P8/G2 fail |
| 候选变化 | 受影响证据失效；重跑；旧候选证据不得复用 | 复用旧证据/不重跑 → P9/G1 insufficient |
| i18n key 缺失/单边 | 必需 key zh/en 齐全；无硬编码；文件名/路径/`not-applicable` 不翻译 | 单边 key/硬编码/翻译文件名 → P6 fail |
| 可选副标签未实现 | 报告记录 N/A + 团队计划 §八.9 依据；不判 fail | 无记录/因此判 fail → P6 insufficient/fail |
| 变更包缺字段/候选哈希不符 | 按 G1 判 insufficient/fail | 仍判 pass → G1 fail |
| 写集越界/`test/桌面应用/` 新建/Provider 改动 | 按 G2 判 fail；停止并回报 | 放行 → G2 fail |

---

## 六、T2 检查面、升档与全量回归

### 6.1 T2 选定检查面

- 受影响单测/层测试：`project.test.ts`、`project-document.test.ts`、`interface.test.ts`、`document-view.test.ts`、按需 `i18n.test.ts`。
- 跨层集成：`listProject` → `RoleView.rootDocs` → renderer；`projectDocumentCandidates` → Service refs；`p1p7-document-integration.test.ts`；Phase 4A 受控冒烟。
- 真实 Electron：`phase4a-electron-smoke.mjs`（分组/点击/空态/焦点/布局）；`test/桌面应用/e2e/main.mjs`（Windows 列表+不可用；POSIX 实读分开）。
- 构建/类型：`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`。
- 平台：Windows fail-closed；POSIX 实读（如可用）；分平台证据。

### 6.2 升档与全量回归

- 升档触发：§二.4 所列任一情形；证据不足/候选不可复算/跨层结论不成立；实施中需要改 Provider/读取模型/角色边界/权限/文档归属；新增 IPC/preload/枚举/写路径；客户改变 Q9 A；共享文件混入其他变更；真实 Electron/跨层证据无法建立。
- 升档后：停止当前派发，回报统筹/沟通，按 T3 重开闸门 2（如涉及写集/档位），执行适用全量回归 + 治理/共享抽象检查；本文件标准不因升档而放宽。
- 全量回归在报告首行记录：已执行（命令/范围/输出）或 N/A（理由）。本文件首行默认 N/A，理由为 T2 且无治理/权限变更；不得用 N/A 跳过受影响检查、跨层与真实 Electron。

---

## 七、判定规则与总体结论

### 7.1 每行验收判断

- 每个 P/G 行只能判 `pass` / `fail` / `insufficient evidence` / `not applicable`；`not applicable` 必须写明依据。
- `pass` 必须有当前候选的原始、可复算证据；`fail` 必须有差异/证据；`insufficient evidence` 不得记 pass；`not applicable` 不得用于掩盖缺失证据。
- P1–P10 不得整行 `not applicable`（各条均有本轮适用面）；G1/G2 对本变更适用，不得整行 N/A。可选子项（如 3 个副标签）可按 §3.7 记 N/A；POSIX 实读在无环境时按 `insufficient evidence`，不是 N/A（除非客户书面收窄范围）。
- 不得弱化/加严方案 §8.5；若发现本文件与方案实质不一致，按 §1.2 递增版本，不按本文件强行判定。

### 7.2 总体结论

- **通过**：P1–P10 + G1/G2 全部适用行 `pass`；候选哈希与证据一致；T2 选定检查/跨层/真实 Electron 对当前候选执行；无本次新增确定性失败；Windows/POSIX 分平台证据符合；目标项目零写入；报告首行五项齐全（风险档位/判定依据/选定检查/复用证据/全量回归）。
- **返工**：任一行 `fail`；或同时存在 `fail` 与 `insufficient evidence`（按返工并列出待补证据）。
- **证据不足**：无 `fail` 但存在 `insufficient evidence`；或候选/变更包无法复算、关键证据缺失、跨层/Electron 未执行且无替代。
- 通过只表示当前候选满足本标准；不授权提交、推送、合并、发布或对外操作；不声称目标项目已修复/已迁移。

### 7.3 报告要求

- 报告路径 `docs/acceptance/role-root-docs-display-report-v1.md`；首行至少含风险档位、判定依据、选定检查、复用证据、全量回归（已执行或 N/A + 理由）。
- 报告须含完整验收表（P1–P10 + G1/G2），逐行填实际证据路径/哈希、候选版本、产出角色、结果、验收判断；不得只写“已完成/通过”而无表。
- 报告须链接：任务/阶段、客户确认的方案 v1（路径 + 哈希）、本标准 v1（路径 + 判定时计算的哈希）、候选哈希、变更包、原始证据、未解决问题、结论理由。
- 报告须分别列出 Windows/POSIX 证据、未执行项、N/A 依据、失败分类、复用/失效说明；不得把摘要/设计/计划当原始证据。

---

## 八、版本冻结与报告安排

- 本文件路径固定为 `docs/acceptance/role-root-docs-display-criteria-v1.md`，版本 **v1**，日期 **2026-10-23**；写盘即冻结，标准先于实施。
- 实施前：沟通确认本文件路径/版本；未确认不派实施（团队计划 S1 出口）。
- 实施后：统筹提交变更包（候选哈希、改动路径、节点、证据链接、T2），独立验收按本文件判定并**另写** `docs/acceptance/role-root-docs-display-report-v1.md`。
- 本文件不包含任何候选判定、通过/返工/证据不足结论；不做验收结论的提前预告。
- 标准变更：递增版本、记录理由、交沟通/统筹确认；候选变化不改变标准，只使受影响证据失效并补证。
- 本文件不授权实施、提交、推送、合并、发布；不改变闸门 2 已确认的写集/角色/顺序/档位。

---

## 九、写标准时发现的歧义与缺口（只报告，不修改）

以下为只读核对发现的事实/文档状态问题，供统筹/沟通处理；本文件未修改方案、团队计划、沟通记录、角色卡、产品源码或测试。

1. **P 编号分组不一致（已对照，不影响覆盖）：** 任务要求的 P1–P10 分组与方案 §8.5 的 P1–P10 编号不同：任务 P3 合并方案 P3+P5 的接口部分；任务 P4 合并方案 P4+P5+P8；任务 P9/P10 展开方案 P9/P10 的证据/状态要求。§3.0 已逐项对照，方案 §8.5 每条均被覆盖，无遗漏、无弱化；报告须按 §3.0 标注对应关系，避免把“编号不同”误判为缺项。
2. **方案/团队计划状态头漂移：** 方案文件头/§2.1 仍写「草案 v1（待独立只读复核、待闸门 1 方案确认）」「闸门 1：待确认」「闸门 2：未开始」「实施授权：未给」；团队计划文件头/§1.5 仍写「闸门 2 未确认、实施授权未给」。沟通记录已确认闸门 1/2，且哈希与冻结版本一致。判定以沟通记录与方案正文为准；建议策划/统筹在后续版本校正状态行，避免误读。
3. **方案 §13 复核记录缺失：** 方案 §13 写“尚无复核意见”，预期路径 `docs/planning/2026-10-23_review_role-root-docs-display.md` 当前不存在；客户闸门 1 已确认方案 v1。该缺失只报告，不增加产品验收要求，也不据此判 fail；若统筹认为需要补复核记录，由沟通/策划处理。
4. **i18n key 数量口径：** 方案 §5.5.6 建议 4 个必需 key + 3 个可选副标签；团队计划 §八.9 明确“若客户只要求 4 个必需 key，S5 只写 4 个、S4 不显示副标签；若现有 key 足够，S5 记 N/A + 理由”。本文件 P6 按此执行：3 个副标签不是强制项，但必须有 S5 记录；不得因缺少可选副标签判 fail，也不得因“复用了现有 key”而跳过 zh/en parity/无硬编码检查。
5. **`rootDocs` 路径基准：** 方案 §5.1/团队计划 §3.2 明确 `rootDocs[].path` 为项目相对、`docs[].path` 为角色相对；两者基准不同。本文件 P1/P2/P3 要求不得混用；实施/测试若把根文档拼成 `<roleDir>/<docs 风格路径>` 或渲染层自行拼路径，按 P2/P3 fail。
6. **Windows 索引与 refs 的差异：** Q9 A 下 Windows 仍可列出三个文件名（索引元数据），但 Service 不建立 scope/不铸造 refs；点击根文档时 `DocumentView` 可能没有根文档 ref，只显示既有 `UNSUPPORTED_ENVIRONMENT`/列表态。本文件 P5 以“可列名 + 点开既有结构化错误 + 无正文/无字节/无 refs/无 scope”判定，不要求 Windows 生成 ref；实施/测试不得把“无 refs”误判为索引失败。
7. **POSIX 环境缺失：** 团队计划 §2.3.5 明确无 macOS/Linux 时 POSIX 实读记录“未执行 + 环境限制”，验收可判 `insufficient evidence`，由统筹补证或客户决定。本文件 P5 不把 POSIX 缺失判 N/A（除非客户书面收窄范围），也不允许用 Windows 列名/文件存在替代；请统筹在变更包明确当前环境能力。
8. **Node 不在当前 PATH：** 写标准时 `node --version`/`npm --version` 不可用；S1 须按既有流程加入 PATH 并记录实测版本/完整路径，不得伪造命令输出；证据中的 Node/npm 版本须与命令执行环境一致。
9. **`test/桌面应用/` 逐文件授权：** 该目录对桌面窗口是逐文件授权；本变更只改 `project.test.ts`、`project-document.test.ts`、`interface.test.ts`、`e2e/main.mjs`，不得新建文件；`e2e/main.mjs` 只最小追加，不删除既有断言、不把 Windows fail-closed 改成通过。若实施确需新文件，先由统筹/人事按闸门 2 补精确单文件条目，不默认新建。
10. **既有未提交上游候选：** i18n、目录 v3、治理写卡、验收返工路由均有已验收但未提交的候选；本变更必须按 S1 哈希隔离，只列本变更增量，不引用其验收结论；共享文件（`app/desktop/interface.ts`、`project.ts`、`ProfilePanel.tsx`、`DocumentView.tsx`、`document-view.ts`、`types.ts`、`drawer-store.ts`、`phase4a.css`、`interface.test.ts`、`e2e/main.mjs`、i18n messages）不得并发写。若客户要求并行，须逐变更记录基线哈希并保证同一文件不并发写。
11. **`documents` 数量变化：** 根文档 refs 追加后，目标角色“查看已列文档”清单从 1 条（角色卡）变为 1+3 条（若三文件存在）；既有 Phase 4A 夹具数量断言会变化。本文件 P7 要求更新测试并说明“新增根文档，不是回归”，保留既有 card/changelog/docs 的 `documentId` 前缀/顺序断言；不得把数量变化当成回归或删除既有断言。
12. **`memo.md` “默认不展示”的范围：** 客户原话是“memo.md 默认不展示 这个排期，进 1.7”；方案 Q3 A 明确 v1.7.0 不提供显示开关。本文件按“永不展示、无开关”判定；未来若要显示 memo，需另开需求/权限语义讨论，不在本 T2 中顺手实现。
13. **`changelog.md` 可选：** 客户原话“要不要也无所谓”；方案 Q4 A 明确保持独立“变更记录”节、有则显示、无则“（无 changelog.md）”、不要求补写。本文件不要求任何角色新增 `changelog.md`，也不把其缺失当缺陷。
14. **i18n 现有 key 与新增 key 的边界：** 现有 `ui.profile.docsTab`/`noDocs`/`viewListedDocs` 只能覆盖旧节标题/旧 docs 空态/旧清单按钮；方案/团队计划认为不足以表达根文档分组、整节空态、单文件打开标签。若项目管理认为可复用现有 key，S5 必须逐项说明语义并证明无硬编码；否则按新增 key 要求。
15. **目标项目只读：** `ans-gateway` 仅只读样例；其 7 个角色目录通常只有六个根文件（含 `memo.md`），无 `changelog.md`/`docs/`。本文件 P8/G2 要求目标零写入；不得为“填满”而补 changelog/docs 或迁移文件。
16. **发布与 task_ops：** 目标 v1.7.0；本变更不改发布配方/冻结源，发布另走装配流程；本项目无 `.ans/project.json`，未启用 task_ops，不伪造任务令牌/锁/审批/机器预检；验收证据以文件哈希、原始输出、diff/status、跨层/Electron 证据为准。

---

**本文件状态：标准 v1 已写盘冻结（路径/版本待沟通确认）；未判定任何候选；未声称角色根文档展示已实施、已测试或已验收；不授权实施、提交、推送、合并或发布。**
