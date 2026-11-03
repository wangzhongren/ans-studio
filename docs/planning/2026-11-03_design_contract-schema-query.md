# 策划方案 P1.3：给内置策划一个可查询的文档 schema（`contract_check` topic）

- 日期：2026-11-03
- 角色：ANS 策划（Planning），独立上下文
- 状态：**草案 P1.3**（最终窄复核结论「建议提交客户确认」，仅剩 N8/N9 非阻断建议；待闸门 1 客户确认；未实施、未测试、未验收、未 commit/push）。闸门 1 确认的版本才是实施与验收基线。
- 风险档位：**T2（建议；逐项理由与升档条件见 §8.6）**。本方案只增加只读查询、字段表/示例与校验错误文案，不改放行语义、不新增写路径、不改角色权限/闸门/验收/证据。
- 闸门 0 依据：`docs/communication/2026-11-03_intent_contract-schema-query.md`（64 行，SHA-256 `2c11b726b9cde5d14c6d4b9f4f3d8800f6e01afddd2c061b25230975f914931c`；客户原话「给策划一个可查的schem 吗，不然的话也是猜测。」；客户已确认闸门 0，按 Q1–Q4 推荐 A/A/A/A 作为方案基线）。
- 代码基线：worktree `flow-improvements-wave1`，HEAD `243d8f6a6db663a383b516aad6320c5110c7f583`。本文所有行号均为该快照的只读核对结果；实施以符号名与文本锚点为准。
- 历史设计依据：`docs/planning/2026-10-29_design-workflow-maintainers-hiring.md`（1330 行，SHA-256 `4a13e99b0b0dbb4aeb9141ed4a15fdddd4ec5021b88146589bdf1f4f8030e6b6`；§5.2 模块/名单/拓扑字段与示例是本次 schema 文本的语义来源之一）。本次不重开该方案的整体设计，只补齐「可查询性」与错误文案。
- 独立复核：`docs/planning/2026-11-03_review_contract-schema-query.md`（P1.0 完整复核 178 行 / `87494f335d98dcde3d17e7f3ed476a420fbf07b8d2d5aaa6c75156fb0365f643`，F1–F16；P1.1 窄复核追加至 237 行 / `57cc1809be144d558f33e492b625ff3972be81fad9d40e15279f988a450f59a5`，N1–N7；P1.2 窄复核追加至 282 行 / `55a2d2681b29ab4e0a5896ce2a772f0d4fd779159eff8b88c9a39303a8c5459f`，结论「建议提交客户确认」，仅剩 N8/N9 非阻断建议；处置见 §13）。复核不是批准、不是客户确认、不是实施授权。
- 标记约定：**[现状]** 已只读核实的代码/测试行为；**[设计候选]** 本方案提议、未实施；**[待客户决定]** 见 §12。

**版本记录**

| 版本 | 日期 | 变更摘要 | 状态 |
| --- | --- | --- | --- |
| P1.0 | 2026-11-03 | 初稿：现状/根因、Q1–Q4、`contract_check` topic 契约、三个字段表与最小合法示例、逐字段错误文案、角色卡、测试/验收标准、风险与实施阶段建议 | 草案；已复核（F1–F16，结论「建议修订后提交」） |
| P1.1 | 2026-11-03 | 处置 F1–F16：roster schema 增加载级硬拒绝（引用/模块清单/版本链）；F2 去 `taskKind` 字面量与 AC-8 精确化；F3 topic 与 taskKind 可同时给出；F4 补 Model/公共工具契约的 T2 论证与升档条件；F5 purpose/四字段矩阵测试；F6 必填/可选分层；F7 path/paths 统一；F8 envBootstrap 示例警告与占位理由；F9 publicContract 示例去重；F10 schema 版本常量插值；F11 management 文案与 raw 说明；F12 空/空白 topic 测试；F13 §12 收窄；F14 回滚粒度；F15 卡内容守卫回归；F16 卡长实测 | 已窄复核（N1–N7，结论「建议再次修订」） |
| P1.2 | 2026-11-03 | 处置 P1.1 窄复核 N1–N7：对齐 modules/roster 示例模块字段并加跨示例一致性断言；AC-17 强化为所有出现处；roster 预算守卫 3900 B；占位 omissionReason 第三条警告与 AC-18；purpose:true 期望文案；AC-15 补 `roster-reference-missing`/`roster-modules-doc-missing` 负例；§10.3 基线命令同步 | 已窄复核（建议提交客户确认） |
| P1.3 | 2026-11-03 | 仅文档收口：§11 补 P1.2 版本行（与顶部一致）；顶部与 §11 补 P1.3 行；§13/头部复核引用更新为最终复核记录（282 行 / `55a2d268…`，结论「建议提交客户确认」）；N8 关闭、N9 记录为非阻断建议；不改 §1–§10、示例、AC、§12、写集、风险档位 | 草案；最终窄复核建议提交客户确认；未确认、未实施 |

---

## 0. 摘要（先读这段）

客户要求：内置策划（rapporteur）在写 `project-modules/v2`、`project-roster/v3`、`project-topology/v2` 之前，能通过应用的**只读查询**拿到精确 schema（字段/类型/必填/约束/最小合法 YAML 示例），不再猜；校验失败时错误要指出**具体字段与收到的类型**。

本方案的直接做法：

1. **扩展现有 `contract_check`**：新增只读 `topic: "modules" | "roster" | "topology"`。传 `topic` 时只返回该文档的字段表 + 最小合法 YAML 示例，并明确区分**解析器级**与**加载级**约束（引用存在/最新、模块清单一致、版本链）；**不读 run、不混入 run 摘要/写区**，因此不依赖项目/run 是否已存在。不传 `topic` 时保持现有 run/写区/taskKind 摘要逐字不变。
2. **schema 文本单一定义**：枚举与 `ContractCheckInput.topic` 类型放在 `src/model/runtime.ts`（契约家）；文本、示例与 `contractSchemaText(topic)` 放在 `src/common/编排/workflow-preconditions.ts`（与解析器同文件，降低漂移）；桌面会话直接复用；工具层只校验枚举并透传。
3. **示例由真实解析器锁定**：`PROJECT_MODULES_SCHEMA_EXAMPLE` / `PROJECT_ROSTER_SCHEMA_EXAMPLE` / `PROJECT_TOPOLOGY_SCHEMA_EXAMPLE` 是导出常量，测试用真实 `parseProjectModules` / `parseProjectRoster` 验证 `ok:true`；roster 示例内含 topology 块，topology 常量被 roster 示例直接引用，避免两份示例。
4. **错误文案逐字段**：把四字段合并报错改为 `name` / `purpose` / `publicContract` / `architectureSource` 逐字段，带收到类型（如 `publicContract 必须是非空字符串（收到 boolean: true）`）；topology 的 schema 提示与 `management` 提示统一到「顶层扁平数组」，去掉误导性的 `management.roles` 与 topology `category` 说法。
5. **角色卡加一句**：写模块/名单/拓扑前先查 `contract_check({topic:...})`；`publicContract` 是非空字符串；`management` 是扁平数组。

**一句话：**策划先查 schema 再写，写错时错误直接指出字段和收到类型；查询只读、不放行，校验放行语义不变。P1.1 已处置独立复核 F1–F16（见 §13），核心补齐了加载级硬拒绝与验收可核对性。

---

## 1. 现状与问题

### 1.1 `contract_check` 现在返回什么、不返回什么

**[现状]** `contract_check` 是只读契约速查（`src/provider/runtime/tools.ts:2417` 的 `makeContractCheckTool`；工具名与 4 KiB 上限在 `:139-140`；注册在 `:3499-3500`）。桌面侧文本由 `app/desktop/session.ts:8095` 的 `contractCheckText` 组装，内容包括：

- run pin/latest、七类文档路径 + hash（`session.ts:8116-8130`）；
- 调用角色的模块/写区/禁止路径（`:8131-8149`）；
- 意图入口契约与当前事实（按角色裁剪，`:8150-8181`）；
- 所选 `taskKind` 的必填项（`:8182-8191`）；
- 常见拒绝 `code → owner/下一步`（`:8192-8193`）；
- 会话层 4 KiB 截断（`:8194-8202`），工具层再截断（`tools.ts:2456-2462`）。

**没有**：任何文档的字段类型、必填性、约束、合法形状或最小 YAML 示例。`schema.ts:630-651` 的工具描述也只说「run pin/latest、七类文档路径+hash、写区、taskKind 必填与常见拒绝」。

### 1.2 策划卡只有字段名

**[现状]** `RAPPORTEUR_CARD_TEXT`（`src/common/门禁引擎/governance-roles.ts:178-193`）在产物说明里列了模块/名单/拓扑的字段名，例如 `modules[]` 每项 `id/name/purpose/path 或 paths[]/category/publicContract/architectureSource`，topology 的 `modules/roles/management`；但**没有类型、没有必填/可空、没有允许值、没有示例**。模型只能按字段名的字面意思猜 YAML 形状。

### 1.3 真实卡点：`ans-work/科研/layer0`，flow `ngmr-geometry-r2`

[现状·意图记录] 客户实际项目在写名单时卡住，出现两轮失败：

1. **第一处根因：`publicContract` 写成了 YAML 布尔 `true`。** 解析器要求它是**非空字符串**（`workflow-preconditions.ts:561-573`），`true` 不是字符串，被当作空值。
2. **第二处根因：topology 的 `management` 形状。** 修成字符串后，`management` 又按提示写成了 `management.roles`（mapping）。解析器实际读取**顶层 `management`**，要求是**含 `convener` 与全部项目角色 id 的扁平数组**（`:334-351`）。
3. **后果**：名单连续不合法 → 派人事/写卡链路被机械前置挡住；多轮盲试消耗客户与模型时间。按当前 schema 在内存中修正这两处后，名单解析通过（11 个模块 / 6 个角色）。

### 1.4 两处根因之外，为什么现有信息不够

- **`contract_check` 没有 schema**，模型无法在写之前核对字段类型；只能从报错反推。
- **策划卡只有字段名**，且 topology 的括号说明写的是「`management`（含 convener 与全部项目角色）」，没有说是数组还是 mapping，容易被读成 `management.roles`。
- **错误文案把四个字段合并成一条「缺」**，即使只有一个字段类型错，模型也会以为四个都缺；修一个字段后可能再撞下一个。
- **topology 的 schema 提示与校验口径矛盾**：`:328` 的提示写「`modules[].path 或 paths[] + category，management.roles 含 convener 与全部项目角色」；实际校验器（`:334-351`）读的是**顶层 `management`**，且 topology 模块**不读 `category`**。

### 1.5 错误文案为何误导：基线复现

[现状] 2026-11-03 在基线 HEAD `243d8f6` 用真实解析器（临时只读脚本，不入库）对最小合法名单做两处篡改，输出与意图记录一致：

```text
# 把 publicContract 改成 true
# 输出：
模块 core 缺 name/purpose/publicContract/architectureSource（均须非空）。

# 把 management 改成 mapping：
management:
  roles: [convener, implementer]
# 输出：
拓扑图 management 必须含 convener（运营管理项目角色）。
```

第一条：只错 `publicContract` 一个字段，却报「四个字段都缺」，且没有说收到的是 `boolean: true`。
第二条：模型明明在 `management.roles` 里写了 `convener`，报错却说「必须含 convener」；提示与读法不一致，模型会继续在错误的结构上打转。

### 1.6 结论与目标

**结论：** 文档侧已无法再靠猜修正。需要应用提供**可查询的精确 schema + 可执行的错误反馈**。

**目标（本方案要达成的用户可见结果）：**

- 策划在写模块/名单/拓扑前，调用 `contract_check({topic:"modules"|"roster"|"topology"})`，得到字段表与最小合法 YAML 示例（≤4 KiB），照抄可过解析；**加载级约束**（引用文件存在/非空/最新、最新 modules 文档存在且与 roster `modules[]` 一致、proposal→intent / architecture→proposal 版本链）在 schema 文本中列明，须一并满足；
- 写错时，错误指出**具体字段**与**收到的类型**（如 `boolean: true`），并给出正确写法；
- topology 的提示与校验口径一致：`management` 是顶层扁平数组，不是 `management.roles`；
- 查询只读、不构成放行；校验放行语义、角色权限、闸门、验收/证据全部不变。

---

## 2. Q1–Q4 选项与推荐

闸门 0 已按 A/A/A/A 确认。下面给出被否决备选的代价，便于复核与后续变更判断。

### 2.1 Q1 查询面

| 选项 | 内容 | 评价 |
| --- | --- | --- |
| **A（推荐，已确认）** | 扩展现有 `contract_check`：新增只读 `topic`，返回字段表与示例；沿用同一工具、同一注入/裁剪/4 KiB 路径 | 改动最小；`contract_check` 已注入所有角色，无需新工具名/新注册/新权限；模型只需记一个工具 |
| B | 新增独立只读工具 `contract_schema` | 代价：`src/model/runtime.ts` 新类型、`tools.ts` 新 handler、`schema.ts` 新描述、`session.ts` 新能力注入、测试矩阵翻倍；两张只读查询面并存，角色卡与文档要同时提两个工具；没有额外收益 |
| C | 只写静态文档/角色卡，不提供工具查询 | 代价：不能保证模型在写前读到；文档会与解析器漂移；无法按调用角色裁剪；不满足客户「可查」的要求 |
| D | 把 schema 塞进每次 `contract_check` 的 run 摘要 | 代价：4 KiB 装不下三个文档；每次查询都消耗上下文；run 摘要与 schema 关注点混杂；不采用 |

**推荐 A。** 理由：复用现有只读工具与注入路径，改动面最小，且不新增权限面。

### 2.2 Q2 覆盖范围

| 选项 | 内容 | 评价 |
| --- | --- | --- |
| **A（推荐，已确认）** | `modules` / `roster` / `topology` | 正好覆盖当前卡点与策划三类受管文档；每个 topic 独立 ≤4 KiB |
| B | 再加 `proposal` / `architecture` / 意图入口 | 代价：超出本次意图；每个 topic 都要维护字段表/示例/测试；意图入口已有 `contract_check` 的 §5A 角色裁剪文本；可后续以新增枚举值的方式追加，不破坏本方案 |
| C | 仅 `roster` | 代价：模块清单与 topology 同样在卡点上；只做 roster 不能解决「写模块猜字段」「写拓扑猜形状」 |

**推荐 A。** 枚举扩展是加法；未来要加 `proposal`/`architecture` 不需要改现有调用。

### 2.3 Q3 示例

| 选项 | 内容 | 评价 |
| --- | --- | --- |
| **A（推荐，已确认）** | 字段表 + 最小合法 YAML 示例，示例由真实解析器测试保证 `ok:true` | 直接解决「形状猜错」；示例可复制；测试锁死漂移 |
| B | 仅字段表，不给示例 | 代价：字段类型解决了，但 YAML 形状仍靠猜（`management` mapping、`publicContract: true`、`path`/`paths` 形态都是形状问题）；真实卡点证明不够 |

**推荐 A。** 示例必须是**可直接解析的最小文档**，不是片段；导出为常量并由真实 parser 测试。

### 2.4 Q4 校验提示

| 选项 | 内容 | 评价 |
| --- | --- | --- |
| **A（推荐，已确认）** | 四字段合并报错改为逐字段带收到类型；topology 的 schema/management 提示与校验口径统一 | 直接消除两处根因的误导；错误码不变，只改 `reason` 文案 |
| B | 只做 schema 查询，不改错误文案 | 代价：写错后仍要盲试；四字段合并报错仍隐藏具体字段；`management.roles` 提示仍与校验矛盾；真实卡点会重演 |
| C | 只改错误文案，不做 schema 查询 | 代价：仍无写前可查的 schema，只能靠报错学习；且不符合闸门 0 的 Q1 A |

**推荐 A。** schema 查询与错误文案是同一问题的两端：写前可查、写后可诊断。

### 2.5 汇总

| 决策 | 选择 |
| --- | --- |
| 查询面 | 扩展 `contract_check`，新增 `topic` |
| 覆盖 | `modules` / `roster` / `topology` |
| 示例 | 字段表 + 最小合法 YAML，真实 parser 测试 |
| schema 文本范围 | 解析器级 + 加载级（引用/模块清单/版本链，见 §3.5.2） |
| 错误 | 逐字段 + 收到类型 + topology 提示统一 |
| `topic` 与 `taskKind` | 可同时给出；`topic` 优先，`taskKind`/`flowId`/`moduleId` 被忽略，输出头部明示 |
| `management` | 保留顶层 `management`；不接受 `management.roles` 兼容（见 §4.4） |
| 角色可见性 | 所有已注入 `contract_check` 的角色可查；不新增角色门禁（见 §6） |
| 风险档位 | T2（见 §8.6） |

---

## 3. 契约设计

### 3.1 工具入参

`ContractCheckInput`（`src/model/runtime.ts:1139-1144`）新增可选字段：

```ts
/** 只读 schema 主题；给出时只返回该文档的字段表与最小合法 YAML 示例（不混入 run 摘要）。 */
topic?: ContractSchemaTopic;
```

枚举与类型放在契约家 `src/model/runtime.ts`：

```ts
export const CONTRACT_SCHEMA_TOPICS = ["modules", "roster", "topology"] as const;
export type ContractSchemaTopic = (typeof CONTRACT_SCHEMA_TOPICS)[number];
```

> **与任务建议的差异（有意）**：任务建议把 `CONTRACT_SCHEMA_TOPICS` 放在 `workflow-preconditions.ts`。本方案把**枚举常量与类型**放在 `runtime.ts`（与 `ContractCheckInput` 同源，避免类型/数组两处维护），把**文本/示例/`contractSchemaText`** 放在 `workflow-preconditions.ts`。这样工具层（`tools.ts`）只从 `runtime.ts` 导入枚举，不必为了一个枚举把编排模块的 `fs`/`yaml` 依赖引入 provider 工具层。若复核坚持原建议，可把常量移到 `workflow-preconditions.ts` 并由 `tools.ts` 只导入该常量；代价是多一条模块依赖边，语义不变。

`tools.ts` 的 `makeContractCheckTool`（`:2417`）新增解析与校验：

```ts
const topicRaw = call.args["topic"];
let topic: ContractCheckInput["topic"];
if (topicRaw !== undefined && topicRaw !== null) {
  if (typeof topicRaw !== "string") {
    return { ok: false, message: `${name}：topic 参数非法（应为字符串：${CONTRACT_SCHEMA_TOPICS.join("|")}）。` };
  }
  const trimmed = topicRaw.trim();
  if (trimmed !== "") {
    if (!(CONTRACT_SCHEMA_TOPICS as readonly string[]).includes(trimmed)) {
      return { ok: false, message: `${name}：未知 topic=${JSON.stringify(trimmed.slice(0, 40))}；可用 topic：${CONTRACT_SCHEMA_TOPICS.join("|")}（只读 schema 查询）。` };
    }
    topic = trimmed as ContractCheckInput["topic"];
  }
}
```

校验顺序：**角色隔离（现有 `:2424-2426`）→ topic 校验 → 调用数据源**。理由：角色边界优先；即使 topic 模式不返回角色信息，也不允许用 topic 去绕过「只查本角色」的现有约束。

### 3.2 返回、未知 topic、空值

| 情形 | 行为 |
| --- | --- |
| `topic` 为三个枚举之一 | 工具 `ok:true`，`message` 为该 topic 的纯文本字段表 + 示例；不读项目、不读 run |
| `topic` 缺省 / `null` / 空字符串 / 仅空白串 | 走现有 legacy 摘要，**逐字不变**（`trim()` 后为空视为缺省；AC-16 测试覆盖） |
| `topic` 是非空字符串但不在枚举 | 工具 `ok:false`，列出可用值；**不调用**数据源 |
| `topic` 不是字符串（数字/布尔/数组/对象） | 工具 `ok:false`，明确「应为字符串」；**不静默忽略**（topic 决定输出模式，静默忽略会返回错误种类的信息） |
| 数据源返回空/非字符串 | 沿现有 `:2453-2455` 的「数据源未返回契约摘要（结果不明）」处理 |

错误值回显有界：未知 topic 只回显前 40 个字符并加引号，避免超长输入撑大输出。

### 3.3 与 `taskKind`、`roleId`、4 KiB 的关系

- **`topic` 与 `taskKind`**：可与 `taskKind`/`flowId`/`moduleId` 同时给出；`topic` 优先，后三者被忽略。输出头部（首两行）明示「仅 schema 与示例；不含 run/写区；其余参数被忽略」——schema 文本不出现字面 `taskKind`，避免与 AC-8 的「无 legacy taskKind 行」断言冲突。
  - 备选（不采用）：`topic` 与 `taskKind` 同时给出时拒绝。代价：模型常顺手带 `flowId`，会造成无谓失败；没有安全收益。
  - 备选（不采用）：同时返回 schema 与 run 摘要。代价：4 KiB 装不下，且两个关注点混杂。
- **`roleId`**：沿用现有隔离——给了其他角色 id 仍拒绝；topic 文本本身是静态 schema，不含任何角色/项目信息。
- **4 KiB**：schema 文本由 `contractSchemaText` 产出，**作者保证 ≤4096 字节**；工具层沿现有 `CONTRACT_CHECK_MAX_BYTES`（`tools.ts:140`）截断，作为防御。topic 模式的截断标记与 legacy 分开：

```ts
const marker = input.topic !== undefined
  ? "\n…（已截断）"
  : "\n…（已截断，完整规则见 run manifest）";
```

  这样旧调用的截断文案逐字不变；topic 模式不会误导模型去 run manifest 找 schema。

- **无 IO 不变量**：`contractCheckText`（`session.ts:8095`）的**第一条语句**必须是 topic 早退：

```ts
if (input.topic !== undefined) return contractSchemaText(input.topic);
```

  早退发生在 `getListing`/`refreshListingNow`（`:8096-8098`）之前，因此 topic 模式**零磁盘读**、不依赖项目是否导入/run 是否存在。这是本方案「只读、不放行」的核心结构保证。

### 3.4 单一定义位置与分层

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 契约类型/枚举 | `src/model/runtime.ts` | `CONTRACT_SCHEMA_TOPICS`、`ContractSchemaTopic`、`ContractCheckInput.topic` |
| 文本/示例/解析 | `src/common/编排/workflow-preconditions.ts` | `contractSchemaText(topic)`、`PROJECT_MODULES_SCHEMA_EXAMPLE`、`PROJECT_ROSTER_SCHEMA_EXAMPLE`、`PROJECT_TOPOLOGY_SCHEMA_EXAMPLE`、错误文案 helper |
| 工具参数/枚举校验 | `src/provider/runtime/tools.ts` | 解析 `topic`、未知/非字符串拒绝、透传；枚举校验复用 `runtime.ts` 的 `CONTRACT_SCHEMA_TOPICS`；topic 专用截断标记 |
| 工具描述 | `src/provider/runtime/schema.ts` | `topic` 参数（`enum` 复用 `runtime.ts` 常量）与描述、promptGuidelines |
| 会话数据源 | `app/desktop/session.ts` | topic 早退到 `contractSchemaText`；legacy 路径不动 |
| 角色卡 | `src/common/门禁引擎/governance-roles.ts` | 策划卡加查询指引 |

**为什么文本放在 `workflow-preconditions.ts`**：三个 parser（`parseProjectModules`、`parseProjectRoster`、`validateRosterTopology`）都在这个文件；字段表/示例与解析规则相邻，改校验时在同一处同步文本与示例，评审也只需看一个文件。示例常量导出给测试，避免测试另写一份夹具。

### 3.5 字段表与最小合法示例

以下三块是 `contractSchemaText(topic)` 的**完整文本**（实现时作为常量；示例部分用导出的示例常量插值，避免两份字面量）。字节数为草案实测（UTF-8，无尾随换行），均低于 4096。

> 示例只保证**解析器合法**（`parseProjectModules`/`parseProjectRoster` 返回 `ok:true`）。`topic=roster` 文本另列**加载校验（硬拒绝）**：引用文件存在/非空/最新、最新 modules 文档存在且与 roster `modules[]` 逐项一致、proposal→intent 与 architecture→proposal 版本链；示例本身不保证通过加载期校验。文档版本化的正文要求（`## 版本记录`、精确版本引用、旧版只读等）仍按既有治理规则执行。

#### 3.5.1 `topic: "modules"`（2438 B）

````text
contract_check topic=modules（只读 schema；查询不构成放行/授权）
（仅 schema 与示例；不含 run/写区；其余参数被忽略）
文档：docs/proposals/<flowId>-modules-vN.md（唯一权威源；schema 必须恰为 project-modules/v2）
加载校验：文件名 -vN 的 N 必须 = frontmatter version；flowId 与派发一致；roster 加载要求存在最新本文件且 parseProjectModules(flowId) 通过。
frontmatter 顶层（必填；值不可为 null）：
- schema: 字面量 project-modules/v2
- flowId: 非空 string（与派发一致）
- version: 正整数（与文件名 -vN 的 N 一致）
- modules: 数组 1–12 项
modules[] 每项（必填键；值不可为 null）：
- id: string；小写 slug ^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$（2–64 字符；不含首/尾连字符）；唯一
- name: string；非空（trim 后）
- purpose: string；非空（兼容别名 responsibility）
- category: string；小写 slug ^[a-z0-9][a-z0-9-]{0,31}$（1–32 字符；实现正则不区分大小写）；env/entry 为保留类别，名单中只能由 env-bootstrap 拥有（本条由名单解析强制）
- path: string；普通模块只写本项；项目相对；尾 / = 目录，否则 = 文件；禁绝对/盘符/通配 *?[]{}! /空段/./..
- paths: string[]；1–20 项（单值按 1 项）；仅 env-resources/entry-index 可多路径（名单解析强制）；与 path 同时给出时 paths[0] 必须等于 path（兼容写法，不建议同时写）
- publicContract: string；非空（trim 后）；不能写 YAML 布尔 true/false；例 "internal（核心约定）" 或 docs/contracts/<flowId>-contract-v1.md
- architectureSource: string；非空（trim 后）；写作约定为项目相对路径（如 docs/contracts/<flowId>-architecture-v1.md）；解析器只校验非空，不校验路径形状
约束：模块路径之间不得相同或包含（同父文件与目录合法）；不得落在治理写区（.ans/、角色卡/、docs/intents|product|proposals|contracts|scheduling|quality|verification|skills|mcp|audit/ 等）。
最小合法示例（flowId=demo；写入时把 demo 替换为实际 flowId）：
---
schema: project-modules/v2
flowId: demo
version: 1
modules:
  - id: core
    name: 核心
    purpose: 核心逻辑与公开接口
    category: core
    path: src/
    publicContract: internal（核心约定）
    architectureSource: docs/contracts/demo-architecture-v1.md
---
````

#### 3.5.2 `topic: "roster"`（3763 B）

````text
contract_check topic=roster（只读 schema；查询不构成放行/授权）
（仅 schema 与示例；不含 run/写区；其余参数被忽略）
文档：docs/proposals/<flowId>-roster-vN.md（schema 必须恰为 project-roster/v3；modules[] 是 modules 文档的派生快照，加载时逐项比对）
frontmatter 顶层（必填项的值不可为 null；可选项见下）：
- schema: 字面量 project-roster/v3
- flowId: 非空 string（与派发一致）；version: 正整数（=文件名 -vN 的 N）
- intent: docs/product/<flowId>-intent-vM.md；proposal: docs/proposals/<flowId>-proposal-vM.md；architecture: docs/contracts/<flowId>-architecture-vM.md（均完整路径，M≥1）
- modulesDoc: 可选；docs/proposals/<flowId>-modules-vM.md
- envBootstrap: 对象（omitted:boolean），可省略；未写/omitted:false 时须含 env-bootstrap + env-resources(env)/entry-index(entry)（角色存在性由招人前置校验）；{omitted:true, omissionReason:"<非空理由>"} 时不得含 env-bootstrap 或 env/entry 模块；勿写旧扁平字段。
- modules: 数组 1–12；每项同 topic=modules，另须每模块恰一属主
- roles: 数组 1–12；每项：
  - id: 小写 slug（同模块 id）；唯一；不得为内置 id（chief/product/rapporteur/nominator/convener/verifier/su/liaison）
  - displayName/purpose/capability: 非空 string
  - modules: 非空 string[]；引用已定义模块 id；角色内不重复
绑定：roles[].modules[] 唯一来源；每模块恰一属主、每角色至少一模块；env/entry 只能归 env-bootstrap。
正文：必须有「人员+模块拓扑图」章节含 ```topology 块（见 topic=topology），与 frontmatter modules/roles 一致。
加载校验（硬拒绝；解析器之外）：
- 最新 roster 必须存在/可读（roster-missing）；文件名 vN 必须 = frontmatter version（roster-version-invalid）。
- 必须存在最新 modules 文档（roster-modules-doc-missing）；其 vN=version 且 parseProjectModules(flowId) 通过（roster-modules-doc-invalid）。
- roster modules[] 必须与最新 modules 文档逐项一致（roster-modules-drift）；modulesDoc 若写必须指向最新（roster-reference-stale）。
- intent/proposal/architecture 必须存在、非空（roster-reference-missing）且为各自最新版（roster-reference-stale）。
- proposal 必须 schema: project-proposal/v2 且正文含名单的 intent 路径（roster-reference-invalid/inconsistent）；architecture 正文必须含名单的 proposal 路径（roster-reference-inconsistent）。
最小示例（flowId=demo；省略 env-bootstrap 仅为最小形状）：
警告：示例只保证解析器通过；加载还需满足上方引用/模块清单/版本链校验。
警告：默认项目不要照抄省略块；须含 env-bootstrap（或写真实省略理由）。
警告：占位 omissionReason 必须替换，不得原样提交。
---
schema: project-roster/v3
flowId: demo
version: 1
intent: docs/product/demo-intent-v1.md
proposal: docs/proposals/demo-proposal-v1.md
architecture: docs/contracts/demo-architecture-v1.md
envBootstrap:
  omitted: true
  omissionReason: <小项目省略理由；默认项目不要照抄>
modules:
  - id: core
    name: 核心
    purpose: 核心逻辑与公开接口
    category: core
    path: src/
    publicContract: internal（核心约定）
    architectureSource: docs/contracts/demo-architecture-v1.md
roles:
  - id: implementer
    displayName: 实现者
    purpose: 核心实现
    capability: TS
    modules: [core]
---
## 人员+模块拓扑图
```topology
schema: project-topology/v2
modules:
  - id: core
    path: src/
    roleId: implementer
roles:
  - id: implementer
    modules: [core]
management: [convener, implementer]
```
````

#### 3.5.3 `topic: "topology"`（1265 B）

````text
contract_check topic=topology（只读 schema；查询不构成放行/授权）
（仅 schema 与示例；不含 run/写区；其余参数被忽略）
位置：roster 正文「人员+模块拓扑图」章节内的 ```topology YAML 块（唯一机器可读格式；schema 必须恰为 project-topology/v2）。
块顶层（必填；值不可为 null）：
- schema: 字面量 project-topology/v2
- modules: 数组；每项：id（非空 string）、path 或 paths（string 或 string[]，至少 1 项；项目相对；尾 / = 目录）、roleId（非空 string）；拓扑节点不要求 category
- roles: 数组；每项：id（非空 string）、modules（非空 string[]）
- management: 扁平字符串数组；必须含 convener 与全部项目角色 id；不要写 management.roles 或 mapping
一致性：modules 的 id/路径集合/属主必须与 roster frontmatter modules[] 及 roles[].modules[] 完全一致；roles 的 id/modules 集合也必须一致；modules 与 roles 的数量也必须一致。
最小合法示例（与 topic=roster 示例的绑定一致）：
```topology
schema: project-topology/v2
modules:
  - id: core
    path: src/
    roleId: implementer
roles:
  - id: implementer
    modules: [core]
management: [convener, implementer]
```
````

> 以上字节数是草案实测；实现后以测试断言为准。modules/topology 余量 >1 KiB；roster 因加入加载校验段，余量约 333 B（仍 <4096）。**N3 预算守卫**：测试断言 roster 文本 ≤3900 B（硬上限 4096，留约 196 B 缓冲）；任何新增字段必须先压缩措辞或拆子 topic（如 `roster-frontmatter`），**不要**只依赖工具层静默截断 schema。

### 3.6 示例与解析器的锁

**[设计候选]** 示例常量与文本的构造方式：

```ts
export const PROJECT_TOPOLOGY_SCHEMA_EXAMPLE = [
  "schema: project-topology/v2",
  "modules:",
  "  - id: core",
  "    path: src/",
  "    roleId: implementer",
  "roles:",
  "  - id: implementer",
  "    modules: [core]",
  "management: [convener, implementer]",
].join("\n");

export const PROJECT_MODULES_SCHEMA_EXAMPLE = [/* frontmatter only */].join("\n");

export const PROJECT_ROSTER_SCHEMA_EXAMPLE = [
  /* frontmatter ... */
  "---",
  "## 人员+模块拓扑图",
  "```topology",
  PROJECT_TOPOLOGY_SCHEMA_EXAMPLE,
  "```",
].join("\n");
```

文本常量用插值引用示例（F10：schema 版本字面量在所有出现处——文档行、schema 行、示例——都用同文件常量插值，避免升版漏改）：

```ts
const CONTRACT_MODULES_SCHEMA_TEXT = [ /* 字段表 */, `schema 必须恰为 ${PROJECT_MODULES_SCHEMA}`, "最小合法示例（flowId=demo；写入时把 demo 替换为实际 flowId）：", PROJECT_MODULES_SCHEMA_EXAMPLE ].join("\n");
const CONTRACT_ROSTER_SCHEMA_TEXT = [ /* 字段表 */, `schema 必须恰为 ${PROJECT_ROSTER_SCHEMA}`, "最小合法示例（flowId=demo；……）：", PROJECT_ROSTER_SCHEMA_EXAMPLE ].join("\n");
const CONTRACT_TOPOLOGY_SCHEMA_TEXT = [ /* 字段表 */, `schema 必须恰为 ${PROJECT_TOPOLOGY_SCHEMA}`, "最小合法示例（与 topic=roster 示例的绑定一致）：", "```topology", PROJECT_TOPOLOGY_SCHEMA_EXAMPLE, "```" ].join("\n");
```

测试锁（`test/编排/workflow-preconditions.test.ts`）：

```ts
const modules = parseProjectModules(PROJECT_MODULES_SCHEMA_EXAMPLE, "demo");
assert.ok(modules.ok);
const roster = parseProjectRoster(PROJECT_ROSTER_SCHEMA_EXAMPLE, "demo");
assert.ok(roster.ok);
assert.deepEqual(modules.doc.modules, roster.roster.modules); // N1：两示例模块字段逐项一致
assert.ok(Buffer.byteLength(contractSchemaText("roster"), "utf8") <= 3900); // N3 预算守卫；硬上限 4096
assert.ok(PROJECT_ROSTER_SCHEMA_EXAMPLE.includes(PROJECT_TOPOLOGY_SCHEMA_EXAMPLE));
assert.ok(contractSchemaText("modules").includes(PROJECT_MODULES_SCHEMA_EXAMPLE));
assert.ok(contractSchemaText("roster").includes(PROJECT_ROSTER_SCHEMA_EXAMPLE));
assert.ok(contractSchemaText("topology").includes(PROJECT_TOPOLOGY_SCHEMA_EXAMPLE));
assert.ok(contractSchemaText("modules").includes(PROJECT_MODULES_SCHEMA));
assert.ok(contractSchemaText("roster").includes(PROJECT_ROSTER_SCHEMA));
assert.ok(contractSchemaText("topology").includes(PROJECT_TOPOLOGY_SCHEMA));
```

**N2 更强断言**：对每个 topic，过滤出包含该 schema 常量的所有行，断言恰好 3 行且等于用常量拼出的期望行（modules：文档行、`- schema: 字面量 …`、示例 `schema: …`；roster：文档行、schema 行、示例；topology：位置行、schema 行、示例）。这样实现若留下硬编码旧字面量，行数或行内容不匹配。

```ts
// 示例（modules）；roster/topology 同理，期望行均用对应常量拼出
const occurrences = contractSchemaText("modules").split("\n").filter((line) => line.includes(PROJECT_MODULES_SCHEMA));
assert.deepEqual(occurrences, [
  `文档：docs/proposals/<flowId>-modules-vN.md（唯一权威源；schema 必须恰为 ${PROJECT_MODULES_SCHEMA}）`,
  `- schema: 字面量 ${PROJECT_MODULES_SCHEMA}`,
  `schema: ${PROJECT_MODULES_SCHEMA}`,
]);
```

这样 roster 示例解析通过就同时验证了 topology 示例；任何示例或 schema 版本常量改动若破坏文本一致性，测试立即失败。

**加载级测试（F1/N1/N6）**：在 `test/编排/workflow-preconditions.test.ts`（或 `run-pin.test.ts` 既有夹具）构造 intent/proposal/architecture + modules 文档 + 按 `topic=roster` 文本写的 roster；modules 文档使用 `PROJECT_MODULES_SCHEMA_EXAMPLE`（N1 后与 roster 示例的 `modules[]` 逐项一致），断言 `loadLatestRoster` 为 `ok:true`。负例至少覆盖：`roster-modules-drift`（roster `modules[]` 与 modules 文档不一致）、`roster-reference-stale`（引用旧版本）、`roster-reference-inconsistent`（proposal/architecture 未引用声明版本）、`roster-reference-missing`（引用文件缺失/为空）、`roster-modules-doc-missing`（最新 modules 文档缺失）。示例常量本身只锁解析器级；加载级由这条测试补锁。

### 3.7 工具描述修订（`schema.ts:630-651`）

参数新增（`schema.ts` 从 `runtime.ts` 导入 `CONTRACT_SCHEMA_TOPICS`，不重复字面量）：

```ts
topic: {
  type: "string",
  enum: [...CONTRACT_SCHEMA_TOPICS],
  description: "Optional schema topic; returns that document's field table and minimal valid YAML example (read-only; no run summary)",
},
```

`description` 追加一句：

> 传 `topic`（modules|roster|topology）时，只返回该文档的**字段表 + 最小合法 YAML 示例**（静态 schema；不读 run、不含写区摘要；可与 taskKind/flowId/moduleId 同时给出，topic 优先，后三者被忽略）。

`promptGuidelines` 追加：

- 「写模块清单/名单/拓扑前，先用 `topic` 查字段表与最小合法 YAML 示例；`publicContract` 必须是非空字符串（不能写 true/false），topology 的 `management` 是含 convener 与全部项目角色的扁平数组。」
- 「`topic` 只读 schema，不是批准/授权；不要因查询成功就认为文档已通过校验。」

`required` 不变（`topic` 可选）；`additionalProperties: true` 不变——新增可选属性是 API 加法，旧调用不受影响。

---

## 4. 错误文案修订

### 4.1 四字段合并报错改为逐字段带类型

**[现状]** 两处合并报错：

- roster：`workflow-preconditions.ts:568-573` —— `模块 ${id} 缺 name/purpose/publicContract/architectureSource（均须非空）。`
- modules 文档：`:791-793` —— `模块清单 ${id} 缺 name/purpose/publicContract/architectureSource。`

**[设计候选]** 两处都改为**逐字段检查、逐字段返回**，顺序固定为 `name → purpose → publicContract → architectureSource`。新增内部 helper：

```ts
function describeContractValue(value: unknown): string {
  if (value === undefined) return "未提供";
  if (value === null) return "null";
  if (typeof value === "string") return value.trim() === "" ? "string（空）" : "string";
  if (typeof value === "boolean") return `boolean: ${value}`;
  if (typeof value === "number") return `number: ${value}`;
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") return "object（mapping）";
  return typeof value;
}
```

不回声字符串内容（避免超长/敏感回显）；布尔按客户要求的形态回显 `boolean: true` / `boolean: false`。

**`purpose` / `responsibility` 的 raw-vs-effective 口径（F5/N5）**：helper 接收 raw 值；`purpose` 检查使用与解析器相同的**有效来源**——`purpose` 为字符串时用 `purpose`（含空串，不回退到 `responsibility`），否则用 `responsibility`。错误显示**优先取 raw `purpose`**（`purpose` 存在且非 `null` 时，即使非字符串也显示其类型，如 `boolean: true`）；仅当 `purpose` 缺省/`null` 时才显示 `responsibility` 的 raw 类型。这样 `purpose: true` 且无 `responsibility` 报 `boolean: true`，而不是「未提供」，避免掩盖用户实际写错的字段。合法的 `responsibility` 别名不会误报；`purpose` 为空串时即使 `responsibility` 有值也按解析器语义报错（`string（空）`）。

**逐字段错误测试矩阵（F5）**：roster 与 modules 文档两侧都要覆盖：

| 字段 | 至少覆盖的取值 |
| --- | --- |
| `name` | 未提供、`null`、`""`、`false`、`42`、`[]`、`{}` |
| `purpose` | 同上；另测 `responsibility` 别名（`purpose` 非字符串时回退；`purpose` 为空串时不回退）；`purpose:true` 且无 `responsibility` → 期望 `boolean: true`（N5） |
| `publicContract` | 同上（重点 `true` / `false`） |
| `architectureSource` | 同上 |

每个用例断言 `ok:false`、错误码不变、`reason` 含字段名与收到类型；至少每个字段一个空值（未提供/`""`）与一个非字符串（boolean/number/array/object）。

roster 侧新文案（`id` 通常已通过前序 id 校验；仍用 `缺失` 兜底）：

```text
名单模块第 <N> 项（id=<id>）的 name 必须是非空字符串（收到 <received>）。
名单模块第 <N> 项（id=<id>）的 purpose 必须是非空字符串（收到 <received>）。
名单模块第 <N> 项（id=<id>）的 publicContract 必须是非空字符串（收到 <received>）；不能写 YAML 布尔 true/false。
名单模块第 <N> 项（id=<id>）的 architectureSource 必须是非空字符串（收到 <received>）；应为项目相对路径（如 docs/contracts/<flowId>-architecture-v1.md）。
```

modules 文档侧把前缀换成 `模块清单第 <N> 项（id=<id>）的 …`，其余逐字相同。

要点：

- **错误码不变**：roster 仍为 `roster-module-fields-missing`，modules 文档仍为 `modules-doc-fields`；只改 `reason` 文本。机械拒绝 map 与调用方不受影响。
- `purpose` 的 `responsibility` 兼容别名保留；`purpose` 是字符串但为空时，不回退到 `responsibility`（与现有解析语义一致），错误显示 `string（空）`。
- `publicContract: true` 现在会得到 `publicContract 必须是非空字符串（收到 boolean: true）；不能写 YAML 布尔 true/false。`——直接命中真实卡点。
- `architectureSource: 架构 §3` 这类值仍会**通过**（解析器只校验非空）；新文案只是提示「应为项目相对路径」，不改变放行语义（见 §4.5）。

### 4.2 topology 提示与校验口径统一

**[现状]**

- `:328` 的 schema 提示：`…（schema: project-topology/v2；modules[].path 或 paths[] + category，management.roles 含 convener 与全部项目角色）…` —— 两处错：topology 模块不读 `category`；`management` 不是 `management.roles`。
- `:340-341`：`拓扑图 management 必须含 convener（运营管理项目角色）。` —— 当 `management` 写成 mapping 时，解析器把它当空数组，于是报「必须含 convener」，但模型明明在 `management.roles` 里写了 convener。
- `:347-349`：`拓扑图 management 缺项目角色 ${role.id}（运营对项目角色的管理关系不完整）。` —— 未说明 `management` 必须是扁平数组。

**[设计候选]** 保留**顶层 `management`（扁平字符串数组为写作格式）**的校验口径（不改变放行语义），只改提示与文案：

```text
# schema 不匹配（:328）
拓扑图 schema 必须恰为 project-topology/v2；旧 v1 请按 v2 重出拓扑图（modules[] 每项 id/path 或 paths[]/roleId；roles[] 每项 id/modules[]；management 为扁平数组，含 convener 与全部项目角色 id），不做静默归一化。

# management 不是可识别的扁平数组 / 缺 convener（:340-341）
拓扑图 management 的写作格式是扁平字符串数组（如 management: [convener, <全部项目角色 id>]），且必须含 convener；收到 <raw management>（mapping → object（mapping），数组 → array(N)）；解析器兼容单个字符串（不推荐），不接受 management.roles 这种 mapping。

# management 缺某个项目角色（:347-349）
拓扑图 management 缺项目角色 <roleId>（运营对项目角色的管理关系不完整）；management 是扁平字符串数组，须含 convener 与全部项目角色 id。
```

注意：

- 解析器目前会把 `management` 的单个字符串当作一元数组、把数组中的非字符串项过滤掉；这是既有**宽容读取**，本方案不改。schema 文本明确「写作格式是扁平字符串数组」，错误文案用「写作格式」而不是「必须是」，避免把宽容读取说成硬拒绝。
- 「收到」取 **raw `management`**（归一化前）：mapping → `object（mapping）`、数组 → `array(N)`、字符串 → `string`、未提供 → `未提供`。这样看到 `object（mapping）` 就知道写成了 `management: {roles: ...}`。
- `management` 多余 id 目前不报错；schema 文本写「必须含 convener 与全部项目角色 id」，不声称「多余即失败」，与实现一致。

### 4.3 旧/新文案对照

| # | 位置 | 旧文案（逐字） | 新文案（模板） |
| --- | --- | --- | --- |
| 1 | roster 四字段（`:568-573`） | `模块 ${id} 缺 name/purpose/publicContract/architectureSource（均须非空）。` | `名单模块第 ${N} 项（id=${id}）的 name 必须是非空字符串（收到 ${received}）。`（依次 name/purpose/publicContract/architectureSource；publicContract 追加「不能写 YAML 布尔 true/false」；architectureSource 追加「应为项目相对路径…」） |
| 2 | modules 文档四字段（`:791-793`） | `模块清单 ${id} 缺 name/purpose/publicContract/architectureSource。` | `模块清单第 ${N} 项（id=${id}）的 <field> 必须是非空字符串（收到 ${received}）。`（同上追加） |
| 3 | topology schema 提示（`:328`） | `拓扑图 schema 必须恰为 project-topology/v2；旧 v1 请按 v2 重出拓扑图（schema: project-topology/v2；modules[].path 或 paths[] + category，management.roles 含 convener 与全部项目角色），不做静默归一化。` | `拓扑图 schema 必须恰为 project-topology/v2；旧 v1 请按 v2 重出拓扑图（modules[] 每项 id/path 或 paths[]/roleId；roles[] 每项 id/modules[]；management 为扁平数组，含 convener 与全部项目角色 id），不做静默归一化。` |
| 4 | management 缺 convener（`:340-341`） | `拓扑图 management 必须含 convener（运营管理项目角色）。` | `拓扑图 management 的写作格式是扁平字符串数组（如 management: [convener, <全部项目角色 id>]），且必须含 convener；收到 ${rawManagement}（mapping → object（mapping），数组 → array(N)）；解析器兼容单个字符串（不推荐），不接受 management.roles 这种 mapping。` |
| 5 | management 缺项目角色（`:347-349`） | `拓扑图 management 缺项目角色 ${role.id}（运营对项目角色的管理关系不完整）。` | `拓扑图 management 缺项目角色 ${role.id}（运营对项目角色的管理关系不完整）；management 是扁平字符串数组，须含 convener 与全部项目角色 id。` |

未列出的错误（id/category/path/version/roles 绑定等）**不动**；错误码全部不动。

### 4.4 是否接受 `management.roles` 兼容

**结论：不采用。** 保留「顶层 `management`」校验口径（扁平数组为写作格式；解析器对单字符串的宽容读取不改），修提示与示例。

若采用兼容（选项 B），代价：

1. **第二数据源**：parser 要同时接受 `management: [...]` 与 `management: {roles: [...]}`，设计 v2.21、角色卡、示例、D3 预览都可能出现两种形状，漂移面扩大。
2. **放行语义变化**：这是**放宽校验**，与本次意图的非目标「不放宽任何校验」直接冲突；需要单独意图、单独测试与单独验收。
3. **错误文案更难统一**：两种形状下「缺 convener」「缺角色」的提示要分别写，模型仍可能混用。
4. **收益有限**：真实卡点只需要提示写对形状；示例 + 扁平数组文案已足够。

### 4.5 `architectureSource` 路径形状的处理

任务要求字段表写「`architectureSource` 为非空项目相对路径」。本方案的精确口径是：

- **解析器强制**：非空字符串（trim 后）；布尔/数字/null/mapping 均拒绝。
- **写作约定**：项目相对路径（如 `docs/contracts/<flowId>-architecture-v1.md`）；解析器**不校验路径形状**。

**不在本次把路径形状改为强制校验**，理由：那会改变放行语义（原本通过的文本会被拒绝），超出本次意图（只改错误文案）。schema 文本用「写作约定」明确区分，避免把未校验规则写成硬校验。若客户希望强制路径形状，应另立意图（新增校验 + 迁移旧文档 + 验收）。

---

## 5. 角色卡

### 5.1 新增文本

**[设计候选]** 在 `RAPPORTEUR_CARD_TEXT`（`governance-roles.ts:178-193`）的产物说明之后、`名单是人事招人的唯一依据` 之前，加两行：

```text
- 写模块清单/名单/拓扑前，先 `contract_check({topic:"modules"|"roster"|"topology"})` 取字段表与最小合法 YAML 示例（只读，不构成放行）。
- 硬约束：`publicContract` 是非空字符串（不能写 true/false）；topology 的 `management` 是含 convener 与全部项目角色 id 的扁平数组（不能写 management.roles）。
```

### 5.2 卡长与可读性评估

**[现状]** 策划卡当前 4246 字节 / 25 行（`governanceRoleOf("rapporteur").cardText` 实测），已是六张内置卡中最大（chief 3952 B、nominator 3480 B、product 1928 B、convener 2051 B、verifier 1338 B）。

**[设计候选]** 新增两行实测 +366 字节（+8.6%），卡长约 4612 字节 / 27 行（F16）：

- 卡长仍在同量级，没有硬上限（`view-image-cards.test.ts` 只检查内容禁用项，不检查长度）；
- 两行短句比塞进现有超长产物行更可读；现有 1.5 KB 的产物行不动，避免破坏已确认文本；
- 若复核认为卡太长，备选是只保留第一行（查询指引），把第二行硬约束完全交给 schema 文本与错误文案；代价是模型可能不主动查 schema 时仍写错。

### 5.3 角色卡测试

在 `test/编排/trio-worker-report.test.ts:195-204` 的策划卡断言旁补：

```ts
assert.match(governanceRoleOf("rapporteur")!.cardText, /contract_check/);
assert.match(governanceRoleOf("rapporteur")!.cardText, /topic:"modules"/);
assert.match(governanceRoleOf("rapporteur")!.cardText, /publicContract.*非空字符串/);
assert.match(governanceRoleOf("rapporteur")!.cardText, /management.*扁平数组/);
```

（具体正则以最终文案为准；至少锁「工具名 + topic + 两个硬约束」存在。）

---

## 6. 权限/边界

| 项 | 本方案 |
| --- | --- |
| 读写 | `topic` 模式**零磁盘读、零写盘**；只返回静态文本 |
| 写路径 | 不新增任何写路径/写区；不改 `resolveWrite`/boundary/Section 1 |
| 角色权限 | 不新增/不删除角色能力；`contract_check` 现有注入范围不变（所有已注入角色可查静态 schema） |
| 角色隔离 | 保留；给了其他 `roleId` 仍拒绝，即使 topic 不返回角色信息 |
| 闸门 | 不改客户闸门/判断 agent/验收/证据规则 |
| 校验放行 | 不改；只改错误文案（错误码不变）；不放宽 `management`、不收紧 `architectureSource` |
| 运行项目文档 | 不修改 `ans-work/科研/layer0` 或任何运行项目文档；不自动修复 |
| 查询语义 | 查询结果不是放行/授权；输出首行明示「查询不构成放行/授权」 |
| 工具注入 | 不新增工具；`contract_check` 未注入时不注册的现有行为不变 |

**关于「只给策划」**：闸门 0 的意图是「给策划一个可查的 schema」，没有要求排他。本方案不新增角色门禁：schema 是静态公开信息，`contract_check` 已注入所有角色；再按角色裁剪只会增加代码与测试，不增加安全性。若客户要求「仅内置策划可查 topic」，属独立权限变更，应另立意图（在工具层加角色白名单并补负例）。

---

## 7. 测试与验收标准（V1 可核对）

### 7.1 测试矩阵

| 层 | 文件 | 新增/调整 | 断言 |
| --- | --- | --- | --- |
| 解析/示例 | `test/编排/workflow-preconditions.test.ts` | 示例常量、跨示例 `modules[]` 一致性、schema 出现处计数、逐字段错误矩阵、topology 文案 | `PROJECT_MODULES_SCHEMA_EXAMPLE` 经 `parseProjectModules(..., "demo")` 为 `ok:true`；`PROJECT_ROSTER_SCHEMA_EXAMPLE` 经 `parseProjectRoster(..., "demo")` 为 `ok:true`；两者 `modules[]` `deepEqual`（N1）；roster 示例包含 topology 常量；三块 `contractSchemaText` 均 ≤4096 B（roster 另 ≤3900 B）；每个 topic 的 schema 常量恰好出现 3 次且等于常量拼出的期望行（N2）；`publicContract: true` 报 `boolean: true`；`name`/`purpose`/`publicContract`/`architectureSource` × 空值/非字符串矩阵见 §4.1；`management: {roles: [...]}` 报文含「写作格式」「扁平字符串数组」「management.roles」与 raw `object（mapping）`；`management: [convener]` 报缺项目角色；topology v1 提示不再含 `management.roles 含 convener` 且含 `扁平数组`/`roleId` |
| 加载级 | `test/编排/workflow-preconditions.test.ts`（或 `run-pin.test.ts` 既有夹具） | `loadLatestRoster` 正/负例（F1/N1/N6） | modules 文档使用 `PROJECT_MODULES_SCHEMA_EXAMPLE`（与 roster 示例 `modules[]` 逐项一致）+ intent/proposal/architecture + roster → `loadLatestRoster` 为 `ok:true`；负例至少命中 `roster-modules-drift`、`roster-reference-stale`、`roster-reference-inconsistent`、`roster-reference-missing`、`roster-modules-doc-missing` |
| 工具层 | `test/桌面应用/rejection-copy.test.ts` | 新增 topic 透传/未知/非字符串/null/空串/空白串/角色隔离/同时传 flowId+taskKind/长度 | `{topic:"roster"}` 透传到 `fn`；未知 `"foo"` → `ok:false` 且 `fn` 未被调用；`topic:123` → `ok:false`；`topic:null`/`""`/`"   "` → legacy（`seenInput` 无 `topic`）；`{topic:"roster", roleId:"other"}` → 拒绝；`{topic:"roster", flowId:"focus", taskKind:"dispatch"}` → 透传 topic 且输出只含 schema；三个 topic 的输出 ≤4096 B 且含 schema 标识；legacy 无 topic 调用的 `seenInput` 与现有断言一致 |
| 会话层 | `test/桌面应用/run-pin.test.ts` | 新增 topic 早退与 legacy 行精确断言 | `contractCheck({topic:"modules"})` 在无 run/legacy 项目也返回 schema 文本；输出不含以 `run：` 开头、以 `taskKind ` 开头且含「必填」、以 `可写边界：` 开头的 legacy 行（允许头部「仅 schema 与示例……其余参数被忽略」行）；三个 topic 均 ≤4096 B；legacy `{flowId, taskKind, moduleId}` 仍返回 run/角色/taskKind 摘要 |
| 角色卡 | `test/编排/trio-worker-report.test.ts` | 新增策划卡断言 | `contract_check`、`topic:"modules"`、`publicContract.*非空字符串`、`management.*扁平数组` 出现 |
| 工具描述 | `test/桌面应用/rejection-copy.test.ts` 或既有 schema 测试 | 可选：`describeTool("contract_check").parameters.properties.topic` | `enum` 恰为 `["modules","roster","topology"]`；`required` 不含 `topic` |
| 回归 | 既有套件 + 角色卡内容守卫 | 不改夹具语义 | `workflow-preconditions.test.ts` 现有正/负例全过；`rejection-copy.test.ts`、`run-pin.test.ts` 现有断言全过；`view-image-cards.test.ts`（可选加 `list-project.test.ts`）全过 |

### 7.2 验收标准（逐条可核对）

| ID | 标准 | 核对方式 |
| --- | --- | --- |
| AC-1 | 三个示例均可被真实解析器解析 | `parseProjectModules(PROJECT_MODULES_SCHEMA_EXAMPLE, "demo").ok === true`；`parseProjectRoster(PROJECT_ROSTER_SCHEMA_EXAMPLE, "demo").ok === true`；两者 `modules[]` `deepEqual`（N1） |
| AC-2 | roster 示例与 topology 示例单一来源 | `PROJECT_ROSTER_SCHEMA_EXAMPLE.includes(PROJECT_TOPOLOGY_SCHEMA_EXAMPLE) === true` |
| AC-3 | 三块 schema 文本 ≤4 KiB | `Buffer.byteLength(contractSchemaText(t), "utf8") <= 4096` 对三个 topic 均成立（草案实测 2438 / 3763 / 1265 B）；roster 另断言 ≤3900 B（N3 预算守卫） |
| AC-4 | topic 透传 | 工具 handler 收到的 `ContractCheckInput.topic` 与调用参数一致 |
| AC-5 | 未知 topic | `ok:false`，消息含 `modules|roster|topology`；数据源未被调用 |
| AC-6 | 非字符串 topic | `ok:false`，消息含「应为字符串」 |
| AC-7 | 角色隔离 | `{topic:"roster", roleId:"other"}` → `ok:false`，消息含「只允许查询本角色」 |
| AC-8 | topic 模式无 legacy 行 | 不得出现以 `run：` 开头、以 `taskKind ` 开头且含「必填」、以 `可写边界：` 开头的行；允许头部 `topic=<t>` 与「仅 schema 与示例……其余参数被忽略」。另测 `topic + flowId + taskKind` 同时给出：topic 优先，后三者被忽略 |
| AC-9 | 逐字段错误 | roster 与 modules 文档两侧，`name`/`purpose`/`publicContract`/`architectureSource` 各至少一个空值（未提供/`""`）与非字符串（boolean/number/array/object/null）；`publicContract: true` → 含 `publicContract`、`必须是非空字符串`、`boolean: true`；`purpose:true` 且无 `responsibility` → 含 `boolean: true`（不是「未提供」）；`purpose` 别名 `responsibility` 不误报；`purpose: ""` + `responsibility: 有效值` 按解析器语义报 `string（空）` |
| AC-10 | topology 提示一致 | `management: {roles: [convener, implementer]}` → 消息含「写作格式」「扁平字符串数组」「management.roles」与 raw `object（mapping）`；`management: [convener]` → 消息含「缺项目角色 implementer」与「扁平」；`management: [convener, implementer, 5]` 按既有宽容读取通过（不新增拒绝）；schema v1 提示不再含「management.roles 含 convener」 |
| AC-11 | 角色卡 | 策划卡出现 `contract_check`、`topic`、`publicContract` 非空字符串、`management` 扁平数组；`view-image-cards.test.ts`（可选 `list-project.test.ts`）全过 |
| AC-12 | 无新写路径 | 代码审查：topic 分支在 `contractCheckText` 第一句早退，早退前无 `getListing`/`refreshListingNow`/`writeFile`/`appendFile`；测试在无 run 的项目根可用 |
| AC-13 | 旧调用不变 | 不传 `topic` 的 `contractCheck` 输出仍含 run/角色/写区/taskKind；现有 `rejection-copy.test.ts` 的 `seenInput` 深比较不变 |
| AC-14 | 回归与类型 | `npm run typecheck`、`npm run typecheck:renderer` 通过；§7.3 套件全过 |
| AC-15 | 加载级硬拒绝（F1/N1/N6） | modules 文档使用 `PROJECT_MODULES_SCHEMA_EXAMPLE`（与 roster 示例 `modules[]` 逐项一致）+ intent/proposal/architecture + 按 `topic=roster` 文本构造的 roster → `loadLatestRoster` 为 `ok:true`；负例至少命中 `roster-modules-drift`、`roster-reference-stale`、`roster-reference-inconsistent`、`roster-reference-missing`、`roster-modules-doc-missing` |
| AC-16 | 空/空白 topic（F12） | `topic:null`、`topic:""`、`topic:"   "` → legacy 摘要（无 `topic` 透传、无 `ok:false`）；`topic:123` → `ok:false`；测试与 §3.2 表一致 |
| AC-17 | schema 版本常量单一来源（F10/N2） | 每个 topic 的 schema 常量在完整文本中恰好出现 3 次（文档/位置行、`- schema: 字面量 …`、示例 `schema: …`），且每行等于用对应常量拼出的期望行；不残留硬编码旧字面量 |
| AC-18 | 占位 omissionReason 不可照抄（N4） | schema 文本含「占位 omissionReason 必须替换，不得原样提交」警告；验收检查真实项目文档不含该占位符（运行时只校验非空，本方案不加校验） |

### 7.3 回归命令

```bash
npm run typecheck
npm run typecheck:renderer
node --test test/编排/workflow-preconditions.test.ts
node --test test/桌面应用/rejection-copy.test.ts
node --test test/桌面应用/run-pin.test.ts
node --test test/编排/trio-worker-report.test.ts
node --test test/门禁引擎/view-image-cards.test.ts
node --test test/门禁引擎/list-project.test.ts
```

若实施阶段新增独立测试文件，需在团队计划/角色边界中单独登记；本方案建议优先在现有文件内补用例，避免新增边界条目。

---

## 8. 风险与兼容

### 8.1 旧调用（无 topic）逐字不变

- `ContractCheckInput.topic` 是**可选**；不传/`null`/空字符串/仅空白串时，`session.contractCheckText` 的现有逻辑一行不动（trim 后为空视为缺省；AC-16 覆盖）。
- 工具层只有在 `topic` 为非空字符串时构造 `topic` 字段；legacy 调用的 `seenInput` 深比较不变（现有测试继续通过）。
- legacy 截断标记 `…（已截断，完整规则见 run manifest）` 与 topic 标记分开；旧输出不受影响。
- `schema.ts` 新增 `topic` 属性是 JSON Schema 加法；`required` 不变；`additionalProperties: true` 不变。旧客户端/旧模型调用不需要改。

### 8.2 4 KiB 截断边界

- 三块文本草案实测 2438 / 3763 / 1265 字节；modules/topology 余量 >1 KiB，roster 余量约 333 B（因加入加载校验段），均低于 4096；验收测试断言 ≤4096。
- **N3 预算守卫**：roster 文本另断言 ≤3900 B；距硬上限保留约 196 B 缓冲。任何新增字段先压缩或拆子 topic，不能只依赖工具层截断。
- topic 模式在 session 层**不预截断**（早退），由工具层 `truncateUtf8` 安全截断（保留 UTF-8 边界）；legacy 仍走 session 的 4096 截断 + 工具层二次截断。
- 若未来 schema 增长导致超限：优先压缩措辞或拆子 topic；**不允许**把截断后的半截 schema 当作完整 schema 返回而不提示。topic 标记会显示「已截断」，模型应知道信息不完整。

### 8.3 schema 与解析器漂移

- **示例**由真实 parser 测试锁死；这是最强的防漂移。
- **字段表是散文**，无法完全机械校验；缓解：
  - 文本与 parser 同文件（`workflow-preconditions.ts`），改校验时评审会看到相邻文本；
  - 在 parser 入口加注释：「改本文件的校验规则/错误文案时，必须同步 `contractSchemaText` 与三个示例常量」；
  - 验收检查 AC-1/AC-9/AC-10 覆盖示例与关键文案。
- 已知基线漂移（本次不修，只记录）：历史设计 v2.22 写 `category` 2–64 字符，解析器实际是 1–32（`/^[a-z0-9][a-z0-9-]{0,31}$/i`）；历史设计写「治理路径的父目录也拒绝」，`isGovernanceDirectory` 实际只匹配治理前缀/子路径，不匹配 `docs/` 这样的父目录。schema 文本以**解析器实际行为**为准，不复制历史设计的超出实现口径。若客户要改校验，另立意图。

### 8.4 角色卡长度

- 策划卡 +366 字节（+8.6%），约 4612 字节 / 27 行（F16 实测）；仍是同量级、无硬上限。
- 可读性：两行短句比继续加长产物行好；现有超长产物行不动。
- 若复核要求控制长度，可只保留查询指引一行，把硬约束交给 schema 文本/错误文案（见 §5.2）。

### 8.5 工具描述/API 兼容

- `contract_check` 工具名、参数（`flowId`/`roleId`/`taskKind`/`moduleId`）、返回类型（字符串）不变；`topic` 是新增可选参数。
- `ContractCheckFn` 类型不变（`ContractCheckInput` 加可选字段向后兼容）。
- 工具描述文本变化会影响模型行为，但不会破坏既有调用；描述中明示 topic 与 taskKind 的优先关系，避免模型误用。

### 8.6 风险档位：T2 vs T3

**建议 T2。** 理由：

1. 不新增/删除角色权限、写边界、闸门、验收/证据规则；`contract_check` 的注入范围不变。
2. 校验**放行语义**不变：错误码不变，只改 `reason` 文本；不放宽 `management`，不收紧 `architectureSource`。
3. 主要改动是只读静态文本 + 工具可选参数 + 角色卡一行指引；最坏情况是模型看到更长的 schema 文本或错误文案变化。
4. 示例由真实 parser 测试锁定，schema 文本有 4 KiB 上限保护；topic 回滚只需删 `topic` 分支/常量，schema 文本/错误文案可独立保留（见 §10.3），已写入项目的文档不受影响。

**对 `references/testing.md` T3 条款（Model / 公共工具契约）的正面说明（F4）**：本改动对 `src/model/runtime.ts` 是**加法可选字段**（`ContractCheckInput.topic?`），对 `contract_check` 是**加法可选参数**；不改变既有字段、默认值、返回类型或旧调用行为，不构成 breaking shared abstraction。按此口径仍建议 T2。若统筹/验收按「凡触 Model 或公共工具契约即 T3」管理，则按 T3 执行全量回归并重评档位。

**升档条件（若出现任一，按 T3 重评）：**

- 复核/验收认为「角色卡文本/治理材料变更」或「凡触 Model/公共工具契约」本身必须按 T3 管理；
- 要新增角色门禁（仅策划可查）、接受 `management.roles` 兼容、或把 `architectureSource` 路径改为强制校验；
- 要修改任何 parser 的接受/拒绝集合，而非仅改文案。

**不压档声明：** 本方案没有把已确认的 T3 事项降为 T2；历史 T3 是派发权限矩阵/工作流治理变更；本次是只读可查性与文案，范围不同。

### 8.7 其它风险

| 风险 | 缓解 |
| --- | --- |
| **schema 文本漏加载级硬拒绝**（F1） | `topic=roster` 已列加载校验（引用存在/非空/最新、modules 文档存在且逐项一致、proposal→intent / architecture→proposal 版本链）及对应 code；示例明示「只保证解析器通过」；AC-15 用 `loadLatestRoster` 正/负例锁住 |
| **modules 示例与 roster 示例漂移**（N1） | 两示例的 `modules[]` 用 `deepEqual` 断言逐项一致；AC-15 正例直接使用 `PROJECT_MODULES_SCHEMA_EXAMPLE` + `PROJECT_ROSTER_SCHEMA_EXAMPLE`；若未来只改一个示例，AC-1/AC-15 失败 |
| 模型把 `<flowId>`/`demo` 示例或 envBootstrap 省略块原样抄进真实文档（F8/N4） | 文本明确替换 `demo`；roster 示例的 `omissionReason` 用占位 `<小项目省略理由；默认项目不要照抄>`，并加三条警告：示例只保证解析器通过、默认项目须含 env-bootstrap（或写真实省略理由）、占位 omissionReason 必须替换不得原样提交；AC-18 验收检查真实文档不含占位符 |
| 三个 topic 文本过长，挤占上下文 | 每个 ≤4 KiB（实测 2438/3763/1265 B），按需查询；不传 topic 时零额外上下文 |
| 未知/空 topic 被静默忽略导致模型误以为拿到 schema | 工具层对未知/非字符串明确 `ok:false`；`null`/空串/仅空白串视为缺省并走 legacy（与现有 roleId 空值口径一致），AC-16 显式测试；`topic:123` 拒绝 |
| `management` 单字符串/非字符串项的既有宽容读取被误读为「推荐写法」 | schema 文本明确「扁平字符串数组」；错误文案用「写作格式」并显示 raw `management`（mapping → `object（mapping）`）；不建议改宽容读取（放行语义） |
| schema 版本字面量漂移（F10） | 文本用 `PROJECT_MODULES_SCHEMA`/`PROJECT_ROSTER_SCHEMA`/`PROJECT_TOPOLOGY_SCHEMA` 插值；AC-17 断言三块文本分别包含常量值 |
| 角色卡新增工具名与现有工具名不一致 | 文本使用精确 `contract_check`；测试锁字符串；`view-image-cards.test.ts` 内容守卫加入回归（F15） |

---

## 9. 非目标

- **不放宽任何校验**：不接受 `management.roles` mapping，不把 `publicContract: true` 当字符串，不跳过名单/模块/拓扑校验。
- **不自动修复项目文档**：不修改 `ans-work/科研/layer0` 或任何运行项目；不替客户/策划重写名单。
- **不改变放行语义**：除错误文案外，parser 的接受/拒绝集合不变；`architectureSource` 路径形状仍是写作约定，不是强制校验。
- **不新增写路径/权限**：不改角色卡写区、boundary、Section 1、shell/写守卫、闸门、验收/证据。
- **不处理独立事项**：roster/引用循环、demo 重复投递、run pin 哈希、版本链 M13、D3 招人逻辑等不在本次范围。
- **不把查询当放行**：`contract_check` 的 schema 结果不是批准、不是验收、不是授权；计划/团队实施仍需闸门 2。
- **不新增 `proposal`/`architecture` topic**：本次按闸门 0 Q2 A 只做三个 topic；未来可加。

---

## 10. 实施阶段建议（仅供统筹判断；不是团队计划）

### 10.1 阶段

| 阶段 | 内容 | 依赖 | 可核对完成标志 |
| --- | --- | --- | --- |
| **P1：文本/示例/错误文案** | `src/model/runtime.ts` 加枚举/类型/`topic`；`src/common/编排/workflow-preconditions.ts` 加示例常量、`contractSchemaText`、逐字段错误 helper 与 topology 文案、加载级文案 | 无 | 示例经真实 parser 为 `ok:true`；加载级 `loadLatestRoster` 正/负例通过；错误文案测试通过；`npm run typecheck` |
| **P2：工具/会话/描述** | `src/provider/runtime/tools.ts` 解析/校验/透传 + topic 截断标记；`src/provider/runtime/schema.ts` 参数/描述；`app/desktop/session.ts` topic 早退 | P1 | topic 透传/未知/隔离/≤4 KiB 测试通过；legacy 输出不变；双端 typecheck |
| **P3：角色卡与全量回归** | `src/common/门禁引擎/governance-roles.ts` 两行指引；`test/编排/trio-worker-report.test.ts` 断言；跑 §7.3 全量 | P2 | 角色卡断言通过；相关套件全绿 |

### 10.2 建议写集

- `src/model/runtime.ts`
- `src/common/编排/workflow-preconditions.ts`
- `src/provider/runtime/tools.ts`
- `src/provider/runtime/schema.ts`
- `app/desktop/session.ts`
- `src/common/门禁引擎/governance-roles.ts`
- `test/编排/workflow-preconditions.test.ts`
- `test/桌面应用/rejection-copy.test.ts`
- `test/桌面应用/run-pin.test.ts`
- `test/编排/trio-worker-report.test.ts`

本方案不要求新增文件；优先在现有测试文件补用例，避免新增角色边界条目。若统筹决定新增独立测试文件，需按既有流程补边界与登记。

### 10.3 依赖与回滚

- P2 依赖 P1 的枚举/文本；P3 依赖 P2 的工具可用（角色卡指引才有意义）。
- **回滚粒度（F14）**：① topic 查询面（枚举/`topic` 分支/工具描述/角色卡指引）可整体回滚；② schema 文本/示例与逐字段错误文案是独立改进，可保留（逐字段错误不依赖 topic；即使 topic 回滚，错误诊断仍可独立生效）；③ 若客户要求整体回滚，则全部恢复。无状态迁移，回滚不影响已写文档。
- 实施前建议先跑一次基线（与 §7.3 同步）：`node --test test/编排/workflow-preconditions.test.ts test/桌面应用/rejection-copy.test.ts test/桌面应用/run-pin.test.ts test/编排/trio-worker-report.test.ts test/门禁引擎/view-image-cards.test.ts test/门禁引擎/list-project.test.ts`，确认基线绿。

---

## 11. 版本记录与文档规则

**版本记录**

| 版本 | 日期 | 变更摘要 | 状态 |
| --- | --- | --- | --- |
| P1.0 | 2026-11-03 | 初稿：见 §0 摘要与 §2 决策汇总 | 已复核（F1–F16，结论「建议修订后提交」） |
| P1.1 | 2026-11-03 | 逐项处置 F1–F16（见 §13）：加载级硬拒绝、taskKind 字面量/AC-8、topic 与 taskKind 并存、T2/Model 论证、purpose 矩阵、必填/可选、path/paths、envBootstrap 警告、publicContract 示例、schema 版本常量、management raw 文案、空/空白 topic、§12 收窄、回滚粒度、卡内容守卫、卡长实测 | 已窄复核（N1–N7，结论「建议再次修订」） |
| P1.2 | 2026-11-03 | 处置 P1.1 窄复核 N1–N7：对齐 modules/roster 示例模块字段并加跨示例一致性断言；AC-17 强化为所有出现处；roster 预算守卫 3900 B；占位 omissionReason 第三条警告与 AC-18；purpose:true 期望文案；AC-15 补 `roster-reference-missing`/`roster-modules-doc-missing` 负例；§10.3 基线命令同步 | 已窄复核（建议提交客户确认） |
| P1.3 | 2026-11-03 | 仅文档收口：§11 补 P1.2 版本行（与顶部一致）；顶部与 §11 补 P1.3 行；§13/头部复核引用更新为最终复核记录（282 行 / `55a2d268…`，结论「建议提交客户确认」）；N8 关闭、N9 记录为非阻断建议；不改 §1–§10、示例、AC、§12、写集、风险档位 | 草案；最终窄复核建议提交客户确认；未确认、未实施 |

**文档版本化规则**

1. 本文件是**策划方案（P 系列）**，不是已确认的实施基线；闸门 1 客户确认的版本才是实施/验收基线。
2. 复核/客户每轮实质修改升一个小版本（P1.1、P1.2…），在 §11 版本记录追加一行，写明变更摘要与状态；**不原地改写已确认版本的实质内容**。
3. 小的文字修正（错别字/锚点行号）可不升版，但需在交付回执中说明；涉及决策、字段表、示例、错误文案、写集、风险档位的修改必须升版。
4. 引用基线：意图文件 SHA-256 `2c11b726…`、代码 HEAD `243d8f6`；实施时若 HEAD 已前进，以符号名/文本锚点重新核对，并在实施记录中写明新基线。
5. 本文不写入任何实施证据或验收结论；V1 验收在实施后独立进行。

---

## 12. 待客户决定 / 闸门 1 确认项

闸门 0 已确认 Q1–Q4 A/A/A/A，本方案没有超出该基线的新增需求。闸门 1 需要确认的**真实设计选择**只有第 1 项：

1. **schema topic 的可见范围**：本方案不新增角色门禁，所有已注入 `contract_check` 的角色都可查询（schema 是静态公开信息）。若客户要求「仅内置策划可查」，需另立意图并在工具层加角色白名单（新增权限面，建议按 T3 处理）。

以下两项已被闸门 0 非目标（不放宽/不收紧校验）排除，**本方案不做**，不作为本次并列可选项；若客户改变非目标，需另立意图并按 T3 重评：

2. **`management.roles` 兼容**：本方案保留「顶层 `management`」校验口径（扁平数组为写作格式，见 §4.4）。改变意味着放宽校验、第二数据源与额外测试；需另立意图。
3. **`architectureSource` 强制路径**：本方案保持「非空字符串 + 写作约定路径」（见 §4.5）。改变意味着收紧放行语义并迁移旧文档；需另立意图。

无其他待决项。

---

## 13. 独立复核处置表（F1–F16 / N1–N9；N8/N9 非阻断）

复核记录：`docs/planning/2026-11-03_review_contract-schema-query.md`（P1.0 完整复核 178 行 / `87494f335d98dcde3d17e7f3ed476a420fbf07b8d2d5aaa6c75156fb0365f643`，结论「建议修订后提交」，F1–F16；P1.1 窄复核追加至 237 行 / `57cc1809be144d558f33e492b625ff3972be81fad9d40e15279f988a450f59a5`，结论「建议再次修订」，N1–N7；P1.2 窄复核追加至 282 行 / `55a2d2681b29ab4e0a5896ce2a772f0d4fd779159eff8b88c9a39303a8c5459f`，结论「建议提交客户确认」，仅剩 N8/N9 非阻断建议）。F1–F16 与 N1–N7 全部采纳（F8 采纳警告备选；F12 采纳「保留 legacy + 显式测试」；N4 采纳警告/验收提示备选），无「不采纳」项；实质修订已同步正文/AC/风险/角色卡。

P1.3 收口：N8（§11 版本记录表漏 P1.2）已由 §11 补 P1.2 行关闭；N9（AC-17 精确 3 行断言的未来维护契约）记录为非阻断建议——P1.3 按「纯文档收口」不改 AC，实施/验收新增合法 schema 行时需同步期望行集合。

P1.2 自检：三块 schema 文本实测 **2438 / 3763 / 1265 B**（均 <4096；roster 满足 ≤3900 B 预算守卫）；modules/roster 示例经真实 parser 为 `ok:true` 且 `modules[]` `deepEqual`；用两示例 + intent/proposal/architecture 构造临时项目，`loadLatestRoster` 为 `ok:true`（1 模块 / 1 角色）；移除 modules 文档 / intent 引用分别命中 `roster-modules-doc-missing` / `roster-reference-missing`。

| 编号 | 严重度 | 处置 | 理由与落点 |
| --- | --- | --- | --- |
| F1 | 重要 | 采纳 | `topic=roster` 增加「加载校验（硬拒绝）」：最新 roster 存在/可读（`roster-missing`）、文件名 vN=version（`roster-version-invalid`）、最新 modules 文档存在且 vN=version/解析通过（`roster-modules-doc-missing`/`invalid`）、roster `modules[]` 与 modules 文档逐项一致（`roster-modules-drift`）、`modulesDoc` 指向最新（`roster-reference-stale`）、intent/proposal/architecture 存在/非空/最新（`roster-reference-missing`/`stale`）、proposal→intent 与 architecture→proposal 版本链（`roster-reference-inconsistent`）；`topic=modules` 增加加载校验行；§3.5 说明示例只锁解析器级；AC-15 用 `loadLatestRoster` 正/负例补锁；§1.6 改为「照抄可过解析；加载级约束须一并满足」 |
| F2 | 重要 | 采纳 | 三块 schema 文本第二行改为「仅 schema 与示例；不含 run/写区；其余参数被忽略」，删除字面 `taskKind`/`flowId`/`moduleId`；§3.3 改为「输出头部（首两行）明示」；AC-8/§7.1 改为精确 legacy 行断言（`run：` 开头、`taskKind ` 开头且含「必填」、`可写边界：` 开头），允许头部行 |
| F3 | 一般 | 采纳 | §3.3/§3.7 工具描述改为「可与 taskKind/flowId/moduleId 同时给出；topic 优先，后三者被忽略」，删除「互斥」；AC-8 增加同时传 `topic + flowId + taskKind` 的透传/忽略用例 |
| F4 | 一般 | 采纳 | §8.6 增「对 `references/testing.md` T3 条款的正面说明」：Model 加法可选字段、工具加法可选参数、非 breaking shared abstraction；若统筹/验收按「凡触 Model/公共工具契约即 T3」管理，则按 T3 全量回归并重评；升档条件同步加入该条 |
| F5 | 一般 | 采纳 | §4.1 写明 `purpose` 的 raw-vs-effective 口径（`purpose` 为字符串时用 `purpose` 含空串、不回退；否则用 `responsibility`）；新增四字段 × 空值/非字符串矩阵（roster 与 modules 文档两侧）；AC-9 扩展 purpose 与 `responsibility` 别名 |
| F6 | 一般 | 采纳 | §3.5.2 标题改为「frontmatter 顶层（必填项的值不可为 null；可选项见下）」，与 `modulesDoc`/`envBootstrap` 可选条目一致 |
| F7 | 一般 | 采纳 | §3.5.1 `path` 改为「普通模块只写本项」；`paths` 改为「与 path 同时给出时 paths[0] 必须等于 path（兼容写法，不建议同时写）」，消除「二选一」与「同时给出」矛盾 |
| F8 | 一般 | 采纳（复核给出的警告备选） | roster 示例 `omissionReason` 改为占位 `<小项目省略理由；默认项目不要照抄>`；示例前加两条警告（示例只保证解析器通过；默认项目须含 env-bootstrap 或写真实省略理由）；P1.2 按 N4 增补第三条警告（占位 omissionReason 必须替换，不得原样提交）；§8.7 风险行同步。未改成含 env-bootstrap 的示例，以保留 roster 文本 333 B 余量；复核允许此备选 |
| F9 | 建议 | 采纳 | §3.5.1 `publicContract` 示例改为 `docs/contracts/<flowId>-contract-v1.md`，与 `architectureSource` 的 `<flowId>-architecture-v1.md` 区分；示例正文仍用 `internal（核心约定）` |
| F10 | 建议 | 采纳 | §3.6 文本常量用 `${PROJECT_MODULES_SCHEMA}`/`${PROJECT_ROSTER_SCHEMA}`/`${PROJECT_TOPOLOGY_SCHEMA}` 插值；测试增加三块文本包含对应常量的断言（AC-17） |
| F11 | 建议 | 采纳 | §4.2/§4.3 文案改为「写作格式是扁平字符串数组」，明确「收到」取 raw `management`（mapping → `object（mapping）`、数组 → `array(N)`），说明解析器兼容单字符串（不推荐）、非字符串项过滤（既有宽容读取） |
| F12 | 建议 | 采纳（选择复核给出的「保留 legacy + 显式测试」口径） | 明确 `topic:null`/`""`/仅空白串 trim 后视为缺省并走 legacy；AC-16 增加三项 legacy 测试与 `topic:123` 拒绝测试；§3.2/§8.1/§8.7 同步 |
| F13 | 建议 | 采纳 | §12 只保留「topic 可见范围」为真实确认项；`management.roles` 兼容与 `architectureSource` 强制路径改为「本方案不做；改变非目标需另立意图并按 T3 重评」，不再并列 |
| F14 | 建议 | 采纳 | §10.3 写明回滚粒度：topic 查询面可整体回滚；schema 文本/逐字段错误文案是独立改进可保留；整体回滚则全部恢复；无状态迁移 |
| F15 | 建议 | 采纳 | §7.3 回归命令加入 `view-image-cards.test.ts`（可选 `list-project.test.ts`）；AC-11 同步 |
| F16 | 建议 | 采纳 | §5.2/§8.4 改为实测 +366 B、约 4612 B / 27 行 |

**未采纳项（F1–F16）**：无。**未解决意见**：复核记录「未检查事项」中的实现/运行/UI 验证留待实施与验收阶段；本方案只做设计处置。

### 13.1 P1.1 窄复核 N1–N7 处置（P1.2）

| 编号 | 严重度 | 处置 | 理由与落点 |
| --- | --- | --- | --- |
| N1 | 重要 | 采纳（方案①：对齐示例） | roster 示例的 `purpose` 改为 `核心逻辑与公开接口`，与 modules 示例的模块字段逐项一致；§3.6 增加 `deepEqual(parseProjectModules(...).doc.modules, parseProjectRoster(...).roster.modules)`；§7.1/AC-1/AC-15 明确加载级正例的 modules fixture 使用 `PROJECT_MODULES_SCHEMA_EXAMPLE`；用两示例 + intent/proposal/architecture 实测 `loadLatestRoster` 为 `ok:true`；§8.7 增加示例漂移风险行 |
| N2 | 建议 | 采纳 | §3.6/§7.1/AC-17 改为：对每个 topic 过滤包含 schema 常量的所有行，断言恰好 3 行（文档/位置行、`- schema: 字面量 …`、示例 `schema: …`）且等于用常量拼出的期望行；不再只断言 `includes`，硬编码旧字面量会因行数/行内容不匹配而失败 |
| N3 | 建议 | 采纳 | §3.5/§8.2/AC-3 增加 roster 文本 ≤3900 B 预算守卫（硬上限 4096，留约 196 B 缓冲）与「新增字段先压缩或拆子 topic」规则；§3.6 测试含 `Buffer.byteLength(contractSchemaText("roster")) <= 3900` 断言 |
| N4 | 建议 | 采纳（警告/验收提示备选） | roster schema 文本新增第三条警告「占位 omissionReason 必须替换，不得原样提交」；§8.7 风险行更新；新增 AC-18 验收检查真实项目文档不含占位符。不改运行时校验（parser/D3 仍只查非空） |
| N5 | 建议 | 采纳 | §4.1 明确错误显示**优先取 raw `purpose`**：`purpose:true` 且无 `responsibility` → `boolean: true`（不是「未提供」）；§4.1 矩阵与 AC-9 增加该期望 |
| N6 | 建议 | 采纳 | §3.6/§7.1/AC-15 增加 `roster-reference-missing` 与 `roster-modules-doc-missing` 负例；实测两者均命中（另实测 `roster-modules-doc-invalid`/`roster-version-invalid` 也可命中，未全部列入 AC） |
| N7 | 建议 | 采纳 | §10.3「实施前基线」命令同步为 §7.3 的六个文件（含 `view-image-cards.test.ts` / `list-project.test.ts`） |

**未采纳项（N1–N7）**：无。
