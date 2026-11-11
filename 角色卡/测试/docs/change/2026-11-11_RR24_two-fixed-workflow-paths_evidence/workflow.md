# 项目工作流（flowId: snake-game）

> 维护者：运营（convener）。本文件为稳定文件（workflow/v1），不版本化；阶段细目以幕僚当期 `stage-request` 为准，运营随实际调度更新。

## 1. 项目级规则

- 路径：路径 A（新建，snake-game 走此路径）；路径 B（修改）保留为后续变更使用。
- 唯一派发：幕僚（chief）只发 `stage-request`（只读、无 module/写集）；运营（convener）派发生产角色（product / rapporteur / nominator / 项目实现 worker）。幕僚不直接派生产线角色。
- 质检：运营不派 verifier；独立验收由幕僚创建 verifier 任务并收口。
- 客户卡（固定路径预算）：A3 意图确认、A6 方案确认、A10 任命确认三张确认卡 + A13 merge-main（应用呈卡、仅客户本人确认）；`acceptance` 卡固定路径抑制；`decision` 卡仅用于材料性选择，不计入三张确认卡。
- 证据口径：只写项目相对路径（path）、内容/frontmatter 要点、结论；文档哈希由应用在收口/归档时按真实字节计算，worker 与运营均不用 shell 计算或转抄 sha256。
- 环境事实：以应用只读事实（`project_state` / 项目配置）为准；任何角色不得为探测环境运行 shell（`node -v` / `python --version` / `which` / `where` 等）。
- 写集纪律：实现类任务一模块一任务（moduleId 权威，modulePaths 只写该模块路径），同工作区写任务串行；冲突/返工交回原 owner 责任链。

## 2. 路径 A 步骤表

| 步骤 | 角色 | 前置依赖 | 契约 | 交接物 | 完成口令 | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 需求受理/准备 | 运营（convener） | 客户目标；flowId=snake-game 已登记 | 本文件 | `docs/scheduling/snake-game-a1-intake-v1.md`（受理记录：目标/范围初判/验收口径初判/尚缺信息/阶段顺位） | `submit_report` 回幕僚 | 幕僚核对受理结论与缺口，确认无越权拍板 |
| A2 产品意图撰写 | product | A1 受理记录；经运营派发 | `docs/scheduling/snake-game-a1-intake-v1.md` | `docs/product/snake-game-intent-v1.md`（frontmatter: flowId/version/author/status；正文含目标/范围/验收；不写实现） | `submit_report` 回运营 | 意图覆盖客户四项要求；未提前实现；无 A2 外内容 |
| A3 意图确认 | 幕僚（呈 customer 卡 `intent-confirm`） | A2 意图文档 | — | 客户确认记录 | 客户 `confirm`（改则 `revise` 回 A2） | 客户本人决定；未确认不得进入方案阶段 |
| A4 方案准备（派发策划） | 运营 → rapporteur | A3 客户确认 | 本文件 | 派发任务（自足：依据 A2 意图 + 客户目标） | 报告回运营 | 派发含需求依据、交付物、验收/证据要求 |
| A5 方案/名单/模块/架构 | rapporteur | A4 派发；A2/A3 意图 | doc_format：`project-proposal/v2`、`project-modules/v2`、`project-roster/v3`、`project-architecture/v1` | `docs/proposals/snake-game-proposal-v1.md`、`docs/proposals/snake-game-modules-v1.md`、`docs/proposals/snake-game-roster-v1.md`、`docs/contracts/snake-game-architecture-v1.md` | 报告回运营 | 模块唯一权威源、owner/写区/依赖/拓扑合法；名单与模块一致 |
| A6 方案确认 | 幕僚（呈 customer 卡 `proposal`） | A5 方案/名单/模块/架构 | — | 客户确认记录 | 客户确认方案 | 客户本人决定；方案未确认不得任命/实现 |
| A7–A8 预留（按幕僚调度） | 待定 | A6 | — | 以当期 `stage-request` 为准 | 报告 | 不提前定义 |
| A9 基线 3 件小事 | 运营（convener；`git init` 由应用执行） | A6 方案确认；团队计划就绪 | `team-plan/v3`（`complete_team_plan` v4） | `docs/scheduling/snake-game-team-v1.md`；`git init -b main`；`.gitignore` 托管块 + baseline commit + 任务分支 `ans/task/<workflowId>` | 团队计划完成回执 + 基线回执 | 应用核 owner/写区/依赖；基线 `baseline-*` 失败即 fail-closed |
| A10 任命确认 | 幕僚（呈 customer 卡 `appointment`） | A9 团队计划（D3 依据） | — | 客户确认记录（目标角色名单） | 客户确认任命 | 仅客户本人；确认后方可建卡 |
| A11 实现派发 | 运营 → 项目 worker（模块属主/实现角色） | A10 完整激活回执；本工作流就位；依赖就绪 | `docs/contracts/snake-game-architecture-v1.md`、本文件 | 一模块一任务：moduleId、写集、需求依据、验收标准、证据要求（路径/内容/结论） | `submit_report` 回运营 | 属主校验通过；同工作区写任务串行；目标在批准名单内 |
| A12 独立验收 | 幕僚 → verifier（A12a criteria 先写，A12b report 后出） | A11 集成候选（真实 CID） | `ans-criteria/v1`、`quality-report/v1` | `docs/quality/**` 报告 + `docs/verification/**` 证据 | 报告回幕僚 | 应用核 criteria/CID/证据；运营不派质检、不代验收 |
| A13 发布合并 | 应用呈 customer 卡 `merge-main`；客户本人确认 | A12 accepted + 各任务合法收口 + 应用 CAS 交付核验 | — | main 合并回执 | 客户确认 | 仅客户本人；运营不代批、不自行合并 main |

## 3. 失败与回退约定

- 机械拒绝：先读 code/missing/action/owner/docs，再决定返工或补材料；不改名单绕过。
- 实现返工：退原 worker 责任链，附要求与证据；运营不代写实现。
- 环境/授权阻塞：运营按 `decision` 卡口径报幕僚/客户，不伪造批准、不重弹同因卡。
- 冲突：交原 owner 语义修复；运营只做集成与差异归属核对。
