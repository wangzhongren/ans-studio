# snake-game A7 人事受理/准备记录

- flowId：snake-game
- 任务：#t-mwbuzyrq-185abbd9（来自运营 convener，stage=A7）
- A6 方案确认决定：decision-req-cc69217cbb05412e（由运营任务事实提供，本阶段未消费）
- 本阶段范围：仅受理/准备；未写角色卡、未写边界、未写技能/MCP 声明、未激活任何角色、未发任命卡。

## 1. 依据材料（按路径阅读）
- 名单：`docs/proposals/snake-game-roster-v1.md`（schema project-roster/v4，version 1）
- 模块清单：`docs/proposals/snake-game-modules-v1.md`（schema project-modules/v2，version 1）
- 提案：`docs/proposals/snake-game-proposal-v1.md`（schema project-proposal/v2，version 1）
- 产品意图：`docs/product/snake-game-intent-v1.md`（version 1）
- 意图入口：`docs/intents/snake-game-intent.md`
- 架构契约：`docs/contracts/snake-game-architecture-v1.md`（version 1）

## 2. 一致性核对结论
1. 名单 modules[] 与模块清单逐项一致：game（core，`src/game.js`）、env-resources（env，`styles.css`）、entry-index（entry，`index.html`）；id/name/purpose/category/path(s)/publicContract/architectureSource 无差异。
2. 属主：roles[].modules[] 为唯一绑定来源 —— env-bootstrap → [env-resources, entry-index]；game-owner → [game]；每模块恰一属主、每角色至少一模块；env/entry 归属 env-bootstrap，符合 envBootstrap 规则（omitted:false）。
3. 路径：`index.html`、`styles.css`、`src/game.js` 互不重叠、互不嵌套。
4. topology 块（project-topology/v2）：modules 的 id/路径/roleId 与 frontmatter 一致；roles 的 id/modules 与 frontmatter 一致；modules/roles 数量一致（3/2）；management=[convener, env-bootstrap, game-owner] 为扁平数组，含 convener 与全部项目角色。
5. 版本链：roster.intent / .proposal / .architecture 均指向现存最新 v1；proposal 正文含意图路径，architecture 正文含提案路径；modulesDoc 指向最新模块清单。
6. 意图入口链：产品意图 intentId=snake-game-intent、提案 intentId=snake-game-intent、入口文件 `docs/intents/snake-game-intent.md` 文件名与两处 frontmatter 一致，文件存在。
7. 结论：名单与模块清单一致、拓扑一致、引用链完整，具备 A8 建卡/激活的前置材料条件。

## 3. A8 建卡要点（每角色）
### env-bootstrap
- 模块：env-resources（`styles.css`）、entry-index（`index.html`）
- 允许写边界（取其模块文件名并集）：`styles.css`、`index.html`（file）
- 禁写：`src/`、角色卡目录、其他角色目录、治理路径
- 能力：静态页面装配、HTML/CSS、`file://` 本地运行校验

### game-owner
- 模块：game（`src/game.js`）
- 允许写边界：`src/game.js`（file）
- 禁写：页面文件、其他角色目录、角色卡、治理路径、构建/依赖文件（提案明确无 package.json/构建脚本）
- 能力：原生 JavaScript（ES2020）、Canvas 2D、DOM 事件与定时器

## 4. A8 文档与校验要求（已用 doc_format 查证）
- `角色卡/<roleId>/role-card.md`：10 个必填章节（组别/工作立场/能力描述/职责与功能导航/必读资料/交接输入输出/执行原则/质量职责/标准工作流/交付物清单）；项目 worker 卡须写明任务只来自运营、完成/阻塞先报告运营、只写自己名下模块、不派发/不招人/不联系客户、验收由质检执行。
- `角色卡/<roleId>/boundary.md`：Section 1 表格（类型枚举 file/directory/条件目录；路径项目相对、优先反引号）。
- `角色卡/<roleId>/boundary.yaml`：顶层只允许 role/entries/archived；entries[].kind/path/purpose 必填；role 与目录 id 一致；与 boundary.md 条目集合排序后恒等；不得写 version/roleId/root 顶层键，条目内不写 root。
- 激活：`activate_role_documents` v2（targetRoleId、roster{path}、documents{card,boundaryMd,boundaryYaml}，只传路径），roster/三文档哈希由应用按实际字节计算，本阶段不计算、不转抄。
- 技能/MCP：本期无需新增技能或 MCP 声明（零依赖零构建、纯静态三文件）；技能/MCP 安装仅客户明示可发起，本阶段不落盘。
- 激活前置：workflowId=wf-afe8ddbeba445bed145ccd1c、proposalDecisionId=decision-req-cc69217cbb05412e、最新名单路径；任一缺失或名单漂移则不写卡、如实阻塞回运营。

## 5. 风险与缺口
1. 两个角色的边界均为**文件级**（`styles.css`/`index.html`/`src/game.js`）：角色无法写任何额外文件（如临时脚本、README、资源目录）。若实现期确需 `docs/assets/` 或说明文件，须先出名单 v2 扩模块并经客户同意，本阶段不预置。
2. `src/` 目录尚不存在；game-owner 首次写 `src/game.js` 需由门禁确认父目录创建行为，若被拒属工具/门禁问题而非边界授权问题，需及时回报。
3. roster 使用 project-roster/v4（本角色说明提 v3，v4 为应用允许的双字面量，仅增可选 review）；名单未设验收角色，验收由治理侧验收角色承担，与名单第 3 节一致。
4. A6 决定 id 由运营任务事实提供，本阶段未在应用中消费；A8 激活时须由应用校验其与当前名单/文档一致，若拒绝则保留旧有效卡。
5. 扩展边界（任何超出上述文件并集的路径）属治理变更，须客户明确同意；本阶段无此需求。
