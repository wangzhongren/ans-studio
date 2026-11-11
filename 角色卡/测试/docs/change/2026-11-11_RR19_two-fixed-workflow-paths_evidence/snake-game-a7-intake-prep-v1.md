# A7 人事受理与建卡准备记录 · snake-game（v1）

- 记录性质：A7 受理 / 准备清单（**不含任何角色卡或边界正文，不构成激活**）
- flowId：`snake-game`
- workflowId：`wf-a91ecce1829b8ee8e87a65ed`
- 来源任务：`t-mwbnpfc6-09555c7c`（原始派发方：运营 convener；stage A7；同一任务亦经幕僚 chief 重派，受理结论不变）
- A6 方案确认（派发所述）：`decision-req-b780426ca59c058c`（**由应用在真实激活时校验；本记录不据此声称已满足**）
- 记录人：nominator（人事）
- 版本：v1

## 一、受理结论

**受理通过（仅限准备）**：名单、模块清单与架构契约互相自洽，可据此准备三份建卡文档的字段；**本阶段不写角色卡、不写边界、不激活、不派 A8**。

依据文件（按任务要求先读）：

1. `docs/contracts/snake-game-architecture-v1.md`（project-architecture/v1，version 1）
2. `docs/proposals/snake-game-roster-v1.md`（schema 字面量 `project-roster/v4`，version 1）
3. `docs/proposals/snake-game-modules-v1.md`（project-modules/v2，version 1）

辅助核对（只读）：`docs/proposals/snake-game-proposal-v1.md`、`docs/product/snake-game-intent-v1.md`、`docs/intents/snake-game-core.md`。

## 二、名单/模块自洽性核对（逐项）

| 核对项 | 实际内容 | 结论 |
|---|---|---|
| 名单 schema 与版本 | `project-roster/v4`；文件名 `-v1` 与 frontmatter `version: 1` 一致 | 一致 |
| 项目角色 | 唯一角色 `snake-game-dev`（displayName：贪吃蛇游戏实现者） | 与派发一致 |
| 模块绑定 | `snake-game-dev.modules = [snake-game-app]`；该角色至少一模块 | 满足 |
| 模块属主唯一 | 唯一模块 `snake-game-app` 的属主仅为 `snake-game-dev` | 每模块恰一属主 |
| 名单 modules[] 与模块清单 | id `snake-game-app`、name、purpose、category `app`、path `index.html`、publicContract 与 architectureSource 指向 `docs/contracts/snake-game-architecture-v1.md`，逐项一致 | 无漂移 |
| envBootstrap | `omitted: true` 且给出非空 omissionReason；无 `env-bootstrap` 角色、无 env/entry 模块 | 满足省略口径 |
| 拓扑图 | `project-topology/v2` 块：modules `snake-game-app`(path `index.html`, roleId `snake-game-dev`)；roles 同 frontmatter；management `[convener, snake-game-dev]`（含 convener 与全部项目角色） | 与 frontmatter 一致 |
| 引用链 | roster → intent `docs/product/snake-game-intent-v1.md`、proposal、architecture 均存在且为 v1 链；modulesDoc 指向最新模块清单 | 一致 |
| 意图入口链 | 产品意图 frontmatter `intentId: snake-game-core`；提案 frontmatter `intentId: snake-game-core`；入口文件 `docs/intents/snake-game-core.md` 存在且 frontmatter 同名 | 三者一致 |
| 架构契约 | 正文第七节明确「模块层面仅 `snake-game-app`，实现角色写集仅限该文件」 | 与名单写集口径一致 |

说明：以上为只读核对；名单的实际字节/哈希由应用在激活时按真实文件重算，本记录不计算、不转抄任何哈希。

## 三、建卡三份文档字段准备清单

格式依据：`doc_format` 查询的 `role-card/v1`、`boundary-md/v1`、`boundary-yaml/v1` 字段表与最小合法样例。
取值来源：名单 role `snake-game-dev` 的 `id/displayName/purpose/capability/modules` 与模块清单的模块路径 `index.html`。

### 3.1 `角色卡/snake-game-dev/role-card.md`

- 格式：`role-card/v1`；路径必须恰为 `角色卡/snake-game-dev/role-card.md`（与 boundary.md / boundary.yaml 同目录）。
- schema：无 schema 字面量；由路径 + 10 个必填章节标题界定（标题需为 `#`–`######` 加空白）。
- 10 个必填章节与取值口径：

| 必填章节 | 取值口径与来源 |
|---|---|
| 组别 | 项目/实施组（项目角色，非内置治理角色） |
| 工作立场 | 由名单 purpose 派生：独立实现并自测单文件贪吃蛇游戏，满足 AC1–AC5 |
| 能力描述 | 由名单 capability 派生：HTML/CSS/JavaScript；Canvas 2D 或 DOM 渲染；固定节拍游戏循环；输入校验与状态机 |
| 职责与功能导航 | 由名单 purpose + 模块清单派生：产出并自测 `index.html` 的配置/状态/输入/循环/规则/渲染/控制分层实现 |
| 必读资料 | `docs/contracts/snake-game-architecture-v1.md`、`docs/proposals/snake-game-modules-v1.md`、`docs/proposals/snake-game-roster-v1.md` |
| 交接输入输出 | 输入：运营（convener）派发的实现任务与验收口径；输出：`index.html` 与自测结论（submit_report 回运营） |
| 执行原则 | 只写本角色模块写集 `index.html`；零依赖/无构建/无网络；不改名单方案；不派发不招人 |
| 质量职责 | 按 AC1–AC5 自测；不自行宣告验收通过，验收由内置 verifier 与客户执行 |
| 标准工作流 | 读任务 → 实现 `index.html` → 自测 AC1–AC5 → submit_report 回运营（不能解决再由运营报 Chief） |
| 交付物清单 | `index.html`（单文件，内嵌 HTML/CSS/JS）与实现自测报告 |

- 项目 worker 必须写明的纪律（缺一不可）：实现任务只来自运营（convener）；完成/阻塞先 `submit_report` 给运营，运营不能解决再报 Chief；只写自己名下模块（`index.html`），不写角色卡/其他角色目录/治理路径；不派发、不招人、不联系客户；验收由质检执行，不自行宣告完成。

### 3.2 `角色卡/snake-game-dev/boundary.md`

- 格式：`boundary-md/v1`；路径 `角色卡/snake-game-dev/boundary.md`。
- 必填结构：`## Section 1: 可修改文件与目录` 标题 + 表格（类型 / 路径 / 用途），路径优先反引号、项目相对。
- 条目准备（仅取名单名下模块路径并集，模块 `snake-game-app` → `index.html`）：

| 类型 | 路径 | 用途 |
|---|---|---|
| file | `index.html` | 贪吃蛇单文件应用实现（模块 snake-game-app 唯一交付物） |

- 恒等约束：Section 1 条目集合必须与 boundary.yaml 排序后恒等（比较 root/kind/path/condition，不含 purpose）。

### 3.3 `角色卡/snake-game-dev/boundary.yaml`

- 格式：`boundary-yaml/v1`；路径 `角色卡/snake-game-dev/boundary.yaml`。
- 顶层只允许 `role` / `entries` / `archived`；**禁止**顶层 `version` / `roleId` / `root`。
- 条目只允许 `kind` / `path` / `purpose` / `root` / `condition`；普通 `file`/`directory` 不写 `root`。
- 拟备内容（照最小模板，不扩大）：

```yaml
role: snake-game-dev
entries:
  - kind: file
    path: index.html
    purpose: 贪吃蛇单文件应用实现（模块 snake-game-app 唯一交付物）
```

- `role` 必须与目录 id `snake-game-dev` 一致；条目必须落在模块路径范围内。

### 3.4 写集口径（三文档共同约束）

- 允许写集：仅项目根文件 `index.html`（模块 `snake-game-app` 的唯一路径）。
- 不得包含：`docs/`（含 `docs/proposals/`、`docs/contracts/`、`docs/product/`、`docs/intents/`、`docs/governance/` 等）、`角色卡/`、`.ans/`、其他角色目录或任何治理路径。
- 不设条件目录、不设多路径、不与任何其他模块重叠（本项目仅一个模块）。

## 四、待明确问题与激活前置条件（只列清单，不代为判定）

### 4.1 待明确问题

1. A6 方案确认的真实覆盖面：派发给出 `decision-req-b780426ca59c058c`；其在应用侧的适用版本/绑定范围需由应用在激活时校验，本角色不预判其有效性。
2. 固定路径模式下激活是否还需额外的任命/决定凭据：本流程 fixedCards 为空、不发起 appointment/appointment-write 卡；实际必填字段以应用 `activate_role_documents` 回执为准，若要求 D3/planRef 则须由幕僚/运营补齐真实材料，**不得由人事伪造或代拟**。
3. 名单快照标识：激活入参需要 roster 的 `path`（fixed 模式按真实字节核验）；快照 id/版本是否由应用自动绑定，以实际回执为准。
4. 目标角色目录 `角色卡/snake-game-dev/` 当前尚不存在（本次只读探测确认无既有卡）；激活前无「旧有效卡」需保留，激活成功后为新上线。
5. `index.html` 当前是否已存在实现产物：不影响建卡与激活，但派发实现前应确认写集无冲突（本阶段不探测、不写）。

### 4.2 激活前置条件（A8 执行时逐项核对）

1. 真实 A6/方案决定（`proposalDecisionId`）与适用版本齐备，且由应用校验通过；无真实决定不激活。
2. 名单 `docs/proposals/snake-game-roster-v1.md` 为当前最新版、未漂移；模块清单与名单逐项一致。
3. 三份文档齐备且互相一致：`role-card.md` 10 章节齐全；`boundary.md` 与 `boundary.yaml` 条目标识集合恒等；`boundary.yaml` 顶层键集合法、`role` 与目录 id 一致。
4. 写集与模块属主一致：仅 `index.html`，模块 `snake-game-app` 属主唯一为 `snake-game-dev`；无越界路径。
5. 角色 id 合法（小写 slug、非内置保留 id），目标为项目角色。
6. 调用 `activate_role_documents`（v2，fixed 模式字段：workflowId / proposalDecisionId / roster{path} / documents{card,boundaryMd,boundaryYaml}，只传 path），由应用按实际字节重算 roster/三文档哈希并写真实 `role.activated`。
7. 激活失败即保留旧有效卡、新角色不就绪；不得以文件存在或自报 ready 冒充上线。
8. A8 由幕僚在 A7 收口后另发 stage-request 派发；本阶段不派发、不激活。

## 五、本阶段边界声明

- 未写任何 `角色卡/**` 文件，未调用 `activate_role_documents`，未派发 A8。
- 未发明名单外角色、未自行任命、未改名单/方案/架构/模块正文、未改意图。
- 未使用 shell 做环境或工具链探测；未计算、未给出、未转抄任何 sha256。
- 本记录仅为准备与核对清单，**不构成批准、激活或验收**。

## 六、下一步建议

1. 运营将本受理记录作为 A7 人事准备证据收口。
2. 幕僚在 A7 收口后另发 A8 stage-request；届时人事按本清单落盘三份文档并调用 `activate_role_documents`，以真实回执与 activationDigest 为上线依据。
3. 若激活入参要求本清单 4.1 中的任一待明确项，按责任链回运营/幕僚补齐真实材料，阻塞而不伪造。
