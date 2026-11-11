---
flowId: snake-game
intentId: snake-game
stage: A7
version: 1
author: nominator
status: recorded
kind: a7-intake-preparation-record
date: 2026-11-11
workflowId: wf-f7e54091de068cb28e4e6998
taskId: t-mwbtfr4a-822215ba
roster: docs/proposals/snake-game-roster-v1.md
modulesDoc: docs/proposals/snake-game-modules-v1.md
proposal: docs/proposals/snake-game-proposal-v1.md
architecture: docs/contracts/snake-game-architecture-v1.md
proposalDecisionId: decision-req-a6b3741f0b3ce498
---

# snake-game A7 受理/准备记录（人事）

> 本记录只做 A7 受理与 A8 建卡/激活的准备：**不写角色卡、不激活任何角色、不改名单/模块/提案/架构、不派发任务、不联系客户**。名单哈希以应用登记值与应用激活前实际字节核验为准；本文件不含任何自行计算的 sha256。

## 1. 受理依据与结论

已按序读毕并核对下列材料（均实际存在且为 v1 最新版）：

| 角色 | 文件 | 版本/状态 |
| --- | --- | --- |
| 派发必读 | `docs/contracts/snake-game-architecture-v1.md` | project-architecture/v1，v1 |
| 模块唯一权威源 | `docs/proposals/snake-game-modules-v1.md` | project-modules/v2，v1 |
| 名单 | `docs/proposals/snake-game-roster-v1.md` | project-roster/v4，version 1（应用登记 sha256 引用值，未自行计算） |
| 提案 | `docs/proposals/snake-game-proposal-v1.md` | project-proposal/v2，v1，intentId=snake-game |
| 意图 | `docs/product/snake-game-intent-v1.md` + 入口 `docs/intents/snake-game.md` | project-intent/v1，v1，两处 intentId=snake-game，与入口文件名一致 |
| A6 客户决定 | accept，decisionId=`decision-req-a6b3741f0b3ce498` | 由应用账本持有；本角色不复制/不伪造 |

受理结论：名单**可机械建卡**（5 角色 / 6 模块，逐项一致，无不确定项）；A8 可按名单逐角色直接写三文档并调用 `activate_role_documents` v2。本次未写卡、未激活。

## 2. 名单机械校验逐项结果

1. **角色数量与 id**：5 个 —— `env-bootstrap`、`game-logic`、`input-ctrl`、`ui-render`、`app-shell`，均为小写 slug，且不等于任何内置角色 id（chief/product/rapporteur/nominator/convener/verifier/su/liaison）。✅
2. **模块数量与属主唯一**：6 个模块（`env-resources`、`entry-index`、`game-core`、`input-control`、`render-ui`、`app-entry`），`roles[].modules[]` 绑定为
   - env-bootstrap → [env-resources, entry-index]
   - game-logic → [game-core]
   - input-ctrl → [input-control]
   - ui-render → [render-ui]
   - app-shell → [app-entry]
   每模块恰一属主，每角色至少一个模块，无模块无主、无跨角色重复。✅
3. **roles[].review 显式给出**：5 个角色均显式写 `review: false`；无 `review: true` 的项目验收角色（名单正文 §2 说明验收默认由内置 verifier 承担，若后续要项目内验收角色须出 roster v2）。✅ 与 A12 由 verifier 独立验收的既有安排一致。
4. **topology.management**：为扁平数组 `[convener, env-bootstrap, game-logic, input-ctrl, ui-render, app-shell]`，含 convener 与全部 5 个项目角色 id；未写成 `management.roles`。✅
5. **拓扑块与 frontmatter 一致**：topology 的 6 个模块 id/path/roleId 与 5 个角色的 modules 集合，与 frontmatter modules/roles 一一对应；模块数量 6、角色数量 5 一致。✅
6. **roster modules[] 与模块清单逐项一致**：6 项逐字段比对 `id / name / purpose / category / path / publicContract / architectureSource` 均一致（`modulesDoc` 指向 `docs/proposals/snake-game-modules-v1.md`，version 1 = 名单 version 1）；未发现 `roster-modules-drift`。✅
7. **模块路径**：`styles/`、`index.html`、`src/core/`、`src/input/`、`src/render/`、`src/app/` 互不相同、互不嵌套，均为项目相对路径，不落在治理写区（`.ans/`、`角色卡/`、`docs/proposals|contracts|product|intents|scheduling|quality|verification|skills|mcp/` 等）。✅
8. **env-bootstrap 固定角色**：未写 `envBootstrap` 省略块 ⇒ 必须含 env-bootstrap 且 env/entry 模块（`env-resources` category=env、`entry-index` category=entry）只归它；实际完全满足。✅
9. **引用链**：intent=`docs/product/snake-game-intent-v1.md`、proposal=`docs/proposals/snake-game-proposal-v1.md`、architecture=`docs/contracts/snake-game-architecture-v1.md`、modulesDoc=`docs/proposals/snake-game-modules-v1.md`，四者均存在、非空、为各自最新版（目录内无 v2+）；proposal frontmatter `intentId: snake-game` 与意图文档及 `docs/intents/snake-game.md` 三者一致；proposal 正文含 intent 路径、architecture 正文含 proposal 路径；roster 正文 §2 与提案 §5 的角色—模块描述一致。✅
10. **文件命名与 version**：`snake-game-roster-v1.md` frontmatter `version: 1`，`schema: project-roster/v4`（校验器接受 v3/v4 双字面量；v4 仅增可选 `roles[].review`），`flowId: snake-game` 与派发一致。✅

未发现需要回报策划修正的不确定项。

## 3. A8 激活所需三文档清单（按角色，共 5×3=15 个待写路径）

格式口径已用 `doc_format` 查证（role-card/v1、boundary-md/v1、boundary-yaml/v1），不凭记忆猜：

- `role-card/v1`：路径必须恰为 `角色卡/<roleId>/role-card.md`；10 个必填章节标题（`#`–`######` + 空格行匹配）：**组别 / 工作立场 / 能力描述 / 职责与功能导航 / 必读资料 / 交接输入输出 / 执行原则 / 质量职责 / 标准工作流 / 交付物清单**；无 schema 字段。校验器拒绝 `role-card-section-missing:<label>`。
- `boundary-md/v1`：路径 `角色卡/<roleId>/boundary.md`；必须有 Section 1 章节（标题含「Section 1」或「可修改文件与目录」）；表格三列 类型/路径/用途，类型枚举 file/directory/条件目录，路径项目相对（优先反引号）；条目集合（root/kind/path/condition）须与 boundary.yaml 排序后恒等，否则 `boundary-md-yaml-mismatch`。
- `boundary-yaml/v1`：路径 `角色卡/<roleId>/boundary.yaml`；顶层只允许 `role / entries / archived`（写 `version`/`roleId`/`root` 顶层键即拒）；`role` 必须等于目录角色 id（`boundary-role-mismatch`）；`entries[]` 每项只允许 `kind / path / purpose / root / condition`，`kind ∈ {file, directory, conditional-directory}`，`path` 非空项目相对，`purpose` 非空，`root` 可省略（缺省 project，普通条目不写），`condition` 仅 conditional-directory 必填。
- 边界条目只能取该角色名下模块路径的**文件/目录并集**，不得扩大或跨模块；一模块一属主（`module-owner-overlap` 拒）；条目 root≠project 或条件目录非法 → `invalid-role-boundary-scope`；超出授模块 → `boundary-outside-role-modules`。

逐角色待写路径与边界条目来源（A8 执行清单，本次不写）：

| 角色 | 待写路径（3 个） | 边界条目来源（模块并集） |
| --- | --- | --- |
| env-bootstrap | `角色卡/env-bootstrap/role-card.md`、`角色卡/env-bootstrap/boundary.md`、`角色卡/env-bootstrap/boundary.yaml` | `styles/`（env-resources，directory）、`index.html`（entry-index，file） |
| game-logic | `角色卡/game-logic/role-card.md`、`角色卡/game-logic/boundary.md`、`角色卡/game-logic/boundary.yaml` | `src/core/`（game-core，directory） |
| input-ctrl | `角色卡/input-ctrl/role-card.md`、`角色卡/input-ctrl/boundary.md`、`角色卡/input-ctrl/boundary.yaml` | `src/input/`（input-control，directory） |
| ui-render | `角色卡/ui-render/role-card.md`、`角色卡/ui-render/boundary.md`、`角色卡/ui-render/boundary.yaml` | `src/render/`（render-ui，directory） |
| app-shell | `角色卡/app-shell/role-card.md`、`角色卡/app-shell/boundary.md`、`角色卡/app-shell/boundary.yaml` | `src/app/`（app-entry，directory） |

三文档结构草稿口径（A8 落实，本次不落盘）：

- role-card.md 首行 H1 为角色名，随后 10 个必填章节齐全；项目 worker 卡须写明：实现任务只来自运营（convener）；完成/阻塞先 `submit_report` 给运营，运营不能解决再报 Chief；只写自己名下模块文件夹（上表并集），不写角色卡/其他角色目录/治理路径；不派发、不招人、不联系客户；验收由质检（内置 verifier）执行，不自行宣告完成。
- boundary.yaml 照最小模板：`role: <roleId>` + `entries:`（每条 `kind/path/purpose`，不写顶层 `version`/`roleId`/`root`，条目内不写 `root:`）；boundary.md 的 Section 1 表格条目与之恒等（root/kind/path/condition 相同；purpose 不参与恒等比较）。
- 因三文档须一次性由应用校验并保存不可变完整版本，A8 以「角色为最小单位」逐角色三件齐备后调用一次激活；不逐角色发 appointment-write 卡（固定路径明确 fixedCards 空）。

## 4. 潜在阻碍项（只记录，不处置）

1. **名单哈希一致性只在激活前由应用核验**：应用登记 sha256=`5371f56e306c9ca5d86e4544d1e7321e2da69fa82896aacbba850414febc82c0`（引用值）。若 `docs/proposals/snake-game-roster-v1.md` 在登记后字节被改动，应用激活前重算将与登记值不符而拒绝；本角色不计算、不转抄、不改写名单。同理三文档 hash 由应用激活前按实际字节计算回填，模型不传 hash。
2. **A6 决定适用范围**：`decision-req-a6b3741f0b3ce498`（accept）确认的是提案 v1 的推荐项（D1 网页本地静态页、D2 原生 HTML/CSS/JS + Canvas 2D 零构建、D3 20×20×24px、D4 深底高对比中文、D5 固定 130ms、D6 双入口）；名单/模块/架构 v1 与之同源。激活时 `proposalDecisionId` 必须原样使用该 id，由应用复核 roster 与 A6 documentRefs 一致性；本角色不自造、不套用其它决定。
3. **绑定与边界越界风险**：`env-bootstrap` 同时拥有 `styles/`（目录）与 `index.html`（项目根文件），属其两个模块的正常并集；其余 4 角色仅单个 `src/*/` 目录。A8 写 boundary 时若误加项目根其它路径或跨模块，将被 `boundary-outside-role-modules` / `module-owner-overlap` 拒绝，须在原选中 scope 内修正后整套重验。
4. **必填章节/同步风险**：role-card 10 章节任一缺失即 `role-card-section-missing:<label>`；boundary.md 与 boundary.yaml 须条目恒等（`boundary-md-yaml-mismatch`）；boundary.yaml 顶层多写 `version`/`roleId`/`root` 即拒。三文档需一次齐全，任一失败保留旧有效卡（本次为首次激活，无旧卡）。
5. **固定角色要求**：`env-bootstrap` 不可省略，其 env/entry 模块只归它；若后续名单变更导致省略或 env/entry 易主，须出 roster v2，不得本阶段私改。
6. **无项目内验收角色**：5 角色 `review: false`，A12 默认内置 verifier 独立验收；人事不得以「建卡」暗示项目内验收角色或替代验收。
7. **`角色卡/` 目录当前不存在**，A8 首次写入将创建 5 个角色子目录；本任务不得预创建或写占位文件。
8. **激活能力可用性**：以本会话实际注入的 `activate_role_documents` 为准；若调用返回失败/未提供真实 `role.activated` 与 activationDigest，须如实报「未上线、保留旧有效状态」，不得宣称激活成功。
9. **阶段前置**：A8 激活依赖 A6 决定与名单当前版本；固定路径下不要求 D3/planRef/rosterRef（旧模式语义不适用于本 flow），亦不发起 appointment / appointment-write 卡；A10 任命确认卡由幕僚呈交。

## 5. `activate_role_documents` v2 参数口径（A8 用，本次不调用）

逐角色一次调用，参数固定为：

- `operationId`：每次唯一的操作 id；`flowId`：`snake-game`；`workflowId`：`wf-f7e54091de068cb28e4e6998`；`targetRoleId`：名单角色 id 之一；
- `proposalDecisionId`：`decision-req-a6b3741f0b3ce498`（A6 accept，真实回执 id，原样使用）；
- `roster`：`{ path: "docs/proposals/snake-game-roster-v1.md" }` —— **只传 path**；
- `documents`：`card { path: "角色卡/<roleId>/role-card.md" }`、`boundaryMd { path: "角色卡/<roleId>/boundary.md" }`、`boundaryYaml { path: "角色卡/<roleId>/boundary.yaml" }` —— **只传 path**；
- **不传** `sha256`、不传 `planRef`/`d3DecisionId`/`rosterRef`（固定路径模式），不在 shell 中计算哈希、不猜 hash；roster/三文档 hash 由应用激活前按实际字节计算并回填，并据以判定漂移。
- 回执务必记录真实 `role.activated` 与 activationDigest 作为 A8 证据；失败即如实阻塞，不伪造。

## 6. 本阶段未做事项（边界留痕）

- 未写任何 `角色卡/**` 文件，未创建角色目录、未激活任何角色。
- 未写/未改 `docs/proposals/**`、`docs/product/**`、`docs/contracts/**`、`docs/scheduling/**`、`docs/quality/**`、`docs/verification/**`、`.ans/**`。
- 未运行任何 shell / 未探测环境或工具链；未计算或转抄任何 sha256。
- 未派发任务、未招名单外角色、未联系客户、未批准提案/验收。
