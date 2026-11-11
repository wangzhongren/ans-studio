---
flowId: snake-game
intentId: snake-game-core
stage: A4
kind: rapporteur-intake
version: 1
status: prepared
intent: docs/product/snake-game-intent-v1.md
intentEntry: docs/intents/snake-game-core.md
---

# snake-game · A4 策划受理与准备（路径 A）

## 一、受理结论

- 受理状态：**已受理 A4 策划阶段**（本文件为受理与准备记录，不含方案正文）。
- flowId：`snake-game`；intentId：`snake-game-core`。
- 依据版本：`docs/product/snake-game-intent-v1.md`（产品意图 v1，范围与验收以本文档 AC1–AC5 为准）；意图入口 `docs/intents/snake-game-core.md`（intentId=snake-game-core）。
- 客户确认留痕：A3 意图确认卡 decisionId=`decision-req-b0d663d1200a8ca3`（由运营/幕僚转达，本记录如实登记，不代替客户决定）。
- 运行环境事实：仅以应用只读事实（project_state / 项目配置）为准；本阶段**未做**任何环境或工具链探测。

## 二、A5 将产出的四份版本化文档

| 序号 | 文档 | 建议路径（首次 v1） | 格式 |
|---|---|---|---|
| 1 | 策划方案 | `docs/proposals/snake-game-proposal-v1.md` | `project-proposal/v2` |
| 2 | 模块清单 | `docs/proposals/snake-game-modules-v1.md` | `project-modules/v2` |
| 3 | 人员名单 | `docs/proposals/snake-game-roster-v1.md` | `project-roster/v3`（含 `project-topology/v2` 块） |
| 4 | 项目架构/契约 | `docs/contracts/snake-game-architecture-v1.md` | `project-architecture/v1` |

说明：以上为 A5 的**建议命名与路径**，均按 `-vN` 版本化、不原地改旧版；实际以 A5 派发时的目录口径与 `doc_format`/`contract_check` 字段表为准。本文件不构成其中任何一份正文。

## 三、A5 各文档要点清单

### 1. 策划方案（proposal-v1）

- frontmatter：`flowId=snake-game`、`version=1`、`author=rapporteur`、`status=draft`、`intent: docs/product/snake-game-intent-v1.md`；`intentId` 从意图 frontmatter **原样复制**（`snake-game-core`），与 roster/architecture 引用同一 intent 版本和 intentId。
- 目标与范围复述：绑定意图 v1 的 scope/nonGoals/constraints，不扩大授权。
- 交付物清单：单文件 `index.html`（HTML/CSS/JS 内嵌、无构建、无外部依赖、无网络请求）。
- 功能口径：方向键（可选 WASD）控制移动；禁止 180° 反向（相反方向输入被忽略）；吃食物 +10 分、蛇身增长并在空位生成新食物；蛇头越过边界（撞墙）立即结束并显示最终分数；结束后重开（按钮或 R 键）且分数归零。
- 非目标复述：无联机/网络、无持久化排行榜与存档、无移动端触控/手柄、无音效与复杂美术、无后端服务与数据采集、无暂停/加速/穿墙/障碍物扩展玩法；「蛇头撞自身」不纳入本版。
- 实施步骤与依赖：文档冻结 → 实现 index.html → 自检 → 验收（AC1–AC5）。
- 风险与缓解：浏览器差异、输入节奏/移动节拍、重开重置完整性；以人工可复现操作验证。
- 验收对应：逐条映射 AC1–AC5（见下）。
- 质量档位：基础可玩（功能完整、可复现验收），不要求生产级健壮性、兼容矩阵、性能压测与自动化测试体系。

### 2. 模块清单（modules-v1）

- 遵循 `project-modules/v2`；每项含 `id` / `name` / `purpose` / `path`（目录以 `/` 结尾；`index.html` 为文件）/ `category` / `publicContract`（**非空字符串**，不得写 true/false）/ `architectureSource`。
- 路径唯一、互不重叠/不嵌套（单文件项目尤须注意：`index.html` 只能由一个模块持有）。
- 构思方向（仅方向，不定稿）：
  - 方向 A（倾向）：单模块 `game`（path=`index.html`，category 取实现类），承载全部游戏逻辑与页面；配合小项目省略 `env-bootstrap`（`envBootstrap: {omitted: true, omissionReason: ...}`，且不再含 env/entry 模块）。
  - 方向 B：保留 `env-bootstrap` 固定模块（`entry-index`→`index.html`，`env-resources`→若干 1–20 条资源路径）；但单文件约束下 env-resources 无明显承载，且 index.html 不能被他模块复用，存在与意图冲突的风险。
  - 结论建议：A5 前用 `contract_check({topic:"modules"})` 取字段表与最小合法 YAML，再与运营/幕僚对齐后定稿；不在本阶段拍板。

### 3. 人员名单（roster-v1）

- 遵循 `project-roster/v3`；frontmatter 含 `flowId` / `version`，并版本化引用 `intent` / `proposal` / `modules` / `architecture`（均指向 A5 实际产出文件）。
- `roles[]` 每项 `id` / `displayName` / `purpose` / `capability` / `modules[]`（引用模块 id）；每个模块**恰好一个属主**、每个角色至少绑定一个模块、模块总数 1–12。
- 正文必须有「人员+模块拓扑图」章节，含 ```topology YAML 块（`project-topology/v2`）：`modules`（id/path 或 paths/roleId）+ `roles`（id/modules）+ `management`（**含 convener 与全部项目角色 id 的扁平数组**，不得写 `management.roles`）。
- 构思方向（仅方向）：最小名单——1 个实现角色（如 `game-implementer`，绑定 `game` 模块）；质量/验收优先复用内置 verifier 与客户按 AC1–AC5 实操，暂不新增验收角色。最终人数与角色 id 待 A5 与运营/幕僚对齐。
- 仅真实名单/角色/权限缺口才进入激活；不因内部重构或 bug 机械重招。

### 4. 项目架构/契约（architecture-v1）

- 遵循 `project-architecture/v1`；frontmatter 引用 proposal 版本（版本链 architecture→proposal）与 intent 版本。
- 覆盖：分层（页面外壳 / 游戏状态与规则 / 渲染循环 / 输入处理 / 结束与重开流程）；模块与职责边界；依赖方向（单向、无循环）；公开契约（游戏状态结构、分数与蛇身/食物数据、输入接口与移动节拍、重开语义）；数据流（键盘输入 → 方向队列/校验 → 节拍推进 → 碰撞与进食判定 → 分数/渲染 → 结束/重开）；扩展点（后续变更立项处，本版不实现）。
- 契约含验收口径：AC1 能启动运行；AC2 键盘控制且禁止反向；AC3 吃食物 +10、增长并生成新食物；AC4 撞墙立即结束；AC5 重开且分数归零。验收方式为桌面浏览器逐项实操核对。
- 不写实现代码；不引入外部依赖、构建或网络契约。

## 四、模块划分与角色名单构思方向（汇总）

- 单文件交付 ⇒ 模块粒度以「一个可拥有 `index.html` 的实现模块」为中心；拆多文件模块会与「单文件」约束冲突，倾向不拆。
- 角色以最小可行名单为主：env 装配若无可承载内容，按小项目省略条款处理（需写明 `omissionReason`）；实现属主唯一；验收不预设重复职能。
- 写区划分（方向）：实现角色仅写 `index.html`；策划写 `docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/`；不互相越界。
- 依赖顺序：A4 受理（本文件）→ A5 文档冻结 → 实现 → 验收；文档间 proposal←intent、modules←proposal、roster←proposal/modules、architecture←proposal 单向引用。

## 五、待明确问题清单（A5 前需对齐）

1. **名单最小规模**：是否只设 1 个实现角色，验收完全交由内置 verifier + 客户实操？是否需独立质量复核角色。
2. **env-bootstrap 取舍**：走小项目省略条款（`omitted: true` + `omissionReason`），还是保留固定 `env-resources`/`entry-index` 模块；若保留，`env-resources` 的合法路径承载与 `index.html` 唯一属主冲突如何解决。
3. **模块 id/category/publicContract/architectureSource 取值**：需在 A5 依 `contract_check({topic:"modules"})` 与 `doc_format` 字段表确定，不以记忆中的字段硬写。
4. **属主分配**：`index.html` 唯一属主角色 id 与 `capability` 描述口径。
5. **写区与角色边界**：实现角色的 writable 路径是否仅为 `index.html`，是否需其他产物（如说明文件）。
6. **是否新增非功能交付物**（如 README/交付说明）：属范围外，若需要须经客户变更授权，策划不擅自纳入。
7. **验收证据方式**：AC1–AC5 人工操作核对的留痕形式（截图/录屏/书面记录）与证据 sidecar 要求；若属材料性选择，交运营发 decision 卡。
8. **验收角色选定**：由内置 verifier 复核还是指定专门验收角色（仅方向，不预设）。
9. **依赖顺序与派发衔接**：A4 收口后由幕僚另发 A5 stage-request；策划不自行派发。
10. **意图绑定核对**：proposal/roster/architecture 三处引用的 intent 版本与 intentId 必须一致（`docs/product/snake-game-intent-v1.md` / `snake-game-core`）。

## 六、边界与禁止事项（本阶段已遵守）

- 未写方案正文（未产出 proposal/modules/roster/architecture 任何正文）；未派 A5；未发方案卡（A6 由幕僚呈客户）。
- 未写产品意图正文、未写角色卡、未做客户确认卡、未代表客户作任何批准。
- 未使用 shell 做环境/工具链探测；未计算、未给出、未转抄任何 sha256/哈希。
- 仅写入本角色白名单内路径；本文件为受理/准备记录，不构成提案、不构成批准或放行。

## 七、下一步建议

- 由运营/幕僚在 A4 收口后另发 A5 stage-request；A5 再按第 3 节要点产出四份版本化文档，并以 `doc_format` / `contract_check` 字段表与门禁真实回执为准。
- 第 5 节待明确问题建议在 A5 前与运营/幕僚对齐；涉及材料性选择或需求变更的，按固定路径规则走 decision / 需求变更审批，不自行决定。
