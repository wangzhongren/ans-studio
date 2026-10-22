---
id: governance-slug-no-trailing-hyphen-acceptance
type: design
title: 共享治理 slug 收紧（禁止尾连字符）独立验收标准——单一来源、显式拒绝、旧值不静默
version: A1
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: ready
related: [governance-slug-no-trailing-hyphen, invalid-governance-card-guard, invalid-governance-card-acceptance, change-invalid-governance-card-acceptance]
events:
  - date: "2026-10-22"
    kind: created
    summary: 在 S1 实施进行中、S2–S5 尚未派发时固定本轮共享 slug 收紧（S1–S5 必需、O1–O4 均不选）的验收标准；只定标准，未判定任何候选，未运行测试
---

# 共享治理 slug 收紧（禁止尾连字符）验收：先写死「怎样算做到」

客户 2026-10-22 在无效治理卡守卫 N1–N5 验收后选定：把共享 `GOVERNANCE_SLUG_PATTERN` 收紧为「首尾都是小写字母或数字、长度 2–64、内部可含连字符」，从此 `flow-`、`a-`、`flow--` 这类尾连字符 id 不再合法。这不是守卫本身的补丁，而是一次**共享契约收紧**：`flowId` / `stepId` / `intentId` 的所有入口都会受影响，因此按独立共享变更单独立标准、单独验收。

本文件是**本轮共享变更的验收标准（version A1，status: ready）**。它回答：必须交付什么、成功/失败/边界情形应看到什么、需要哪些证据、怎样下结论。**本文不判定实现结果，不预告通过。**写作时 S1 正在实施（共享 Model 常量已可见新值），S2–S5 尚未派发，候选未冻结。

## 一、依据、授权与状态

- **客户授权**：客户 2026-10-22 确认按[收紧共享治理 slug 契约——禁止尾连字符](../../../项目管理/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen.md)的 **S1–S5** 实施；**O1–O4 均不选**。该确认是设计与实施范围确认，不构成实施完成、测试通过或验收结论。
- **设计版本**：上述设计 `status: accepted`、`revision: 1`；本角色写作时核对的本机 SHA-256 为 `d283138476a4e0d7132481dfbd70ad7462be915a3524bf2bee532f61bfb370dd`。设计 §2（精确规则）、§3（单一来源与归属）、§4（兼容与迁移）、§6.1/§6.2（必需项/可选项）、§7（测试矩阵与风险）是本标准的行为依据。
- **前序守卫与本变更的衔接**：无效治理卡守卫 N1–N5 的验收标准 A1（SHA-256 `cc2c1fbf7c365d436a2ada6046200af6c7577b339d98715dcffb712a7f0fdbba`）与[验收报告 §7.3](../change/2026-10-22_change_invalid-governance-card-acceptance.md)（SHA-256 `b61ff1ded11d5628759091e918d6fb8c1f5905c117fb74f0143d87f1d8a3e255`）记录了尾连字符的开放口径（设计文字称「首尾连字符非法」，同段正则却允许尾连字符）。本变更以**收紧正则**的方式关闭该口径，不改写历史设计与历史验收报告；新验收报告必须引用旧报告 §7.3 说明关闭方式（见 S9/F12）。
- **标准定义时点晚于设计与实施启动**：设计已于 2026-10-22 获客户确认；本文件写作时 S1 已开始实施，S2–S5 尚未派发。写作时抽查（HEAD `4d944e7587f10be29b6356c42539e06219ed88fc`，工作树含此前守卫与后台任务的在途改动）：`src/model/runtime.ts` 的 `GOVERNANCE_SLUG_PATTERN` 已可见新值，JSDoc 引用本设计 §2.1。**该抽查只是时点说明，不构成对 S1 或任何候选的通过/返工判断**；本文件是补定判据，不是对已实现部分的追认。
- **角色独立**：本上下文只承担独立验收，只写 [boundary.md](../../boundary.md) Section 1 与任务精确范围共同覆盖的文件。不改产品代码、测试、断言、他人报告、权限或调度状态；不代跑全部测试、不派发、不把实施者自述当成观察结果；不提交 Git、不触碰 todo-demo、不重启应用。

## 二、交付与范围

### 2.1 必需项 S1–S5 的具体交付物

验收对象是设计 §6.1 的 S1–S5。五项缺一不可；只交付其中几项不能记完成。依赖顺序为 S1 → S2/S3 → S4 → S5 → typecheck/全量；顺序不替代逐项验收。

| 编号 | 所有者 | 主要落点 | 验收时要看到什么 |
| --- | --- | --- | --- |
| **S1** | 运行时核心 | `src/model/runtime.ts`；`src/provider/runtime/tools.ts`、`schema.ts`（自动继承）；`test/runtime-core/`；`角色卡/运行时核心/api-spec.md` 与 `changelog.md` | Model 常量为新正则的**唯一产品代码定义**；Provider 的 10 处 `pattern: GOVERNANCE_SLUG_PATTERN` 与 handler 的 `new RegExp(GOVERNANCE_SLUG_PATTERN)` 自动继承；测试覆盖新正则值、正反例与 schema 相等断言；现行 `api-spec.md` 的旧正则文本同步更新；历史 memo/changelog 不追改 |
| **S2** | 编排 | `src/common/编排/governance-handoff.ts`、`governance-gate.ts`、`governance-judge-facts.ts`、`flow-state.ts`、`flow-service.ts`；`test/编排/`；`角色卡/编排/api-spec.md` 与 `changelog.md` | 五个私有副本全部改为由 Model 常量构造（不保留独立字面量）；`governance-handoff.ts` 的导出形状仍是 `RegExp`；门禁 6 处文案改用常量插值；`governance-judge-intent.ts` 对非空非法 `intentId` 显式 fail-closed（见 S6）；现行 `api-spec.md` 同步 |
| **S3** | 编排 | `src/pipeline/orchestration/run-role.ts`；`test/编排/` | `GOVERNANCE_FLOW_ID_RE` 由 Model 构造、`isGovernanceFlowId` 本地谓词保留（O3 不选）；`FLOW_YAML_PATH_RE` 宽捕获单段候选，`validateFlowYamlCard` 显式拒绝非法 id；2 处文案插值 |
| **S4** | 门禁引擎 | `test/门禁引擎/governance-standard-workflow.test.ts` | 删除测试侧硬编码旧正则，改为引用 Model 常量；补尾连字符负例；既有模板断言不放松 |
| **S5** | 测试 | `test/测试/governance-e2e-auto/` | 跨角色端到端负例（`flowId: "flow-"`/`"a-"`、`stepId: "impl-"`、`intentId: "intent-"`）与正例（合法 slug 全链路）；与 S1–S4 联合回归 |

### 2.2 明确排除的可选项 O1–O4

以下均**未获授权**，本轮不得实施，也不作为通过条件；若候选里出现相关改动，按范围越权处理（见 §六）。

| 编号 | 被排除的内容 | 范围核对例子 |
| --- | --- | --- |
| O1 | 读取兼容旧尾连字符值（双正则：读取宽 / 写入严） | 读取路径不得识别旧尾连字符值为合法；不得出现第二份「读取用宽正则」；旧值只允许**显式拒绝/显式报告**，不得静默解释成新值 |
| O2 | 进一步禁止连续连字符（`a--b` 非法） | `a--b` 必须仍被接受；不得把内部正则改成 `(?:-[a-z0-9]+)*` 之类更严形状；不得改变客户未要求的语义 |
| O3 | 抽出编排私有 `governance-slug` 模块统一谓词 | 不新增跨模块谓词模块/公共函数；`isGovernanceFlowId` 等谓词保留在原文件；只允许「每个模块从 Model 构造 RegExp」这一种单一来源方式 |
| O4 | 实施前对真实项目做只读审计 | 不产出真实项目尾连字符存量报告，不扫描仓库外项目；该项不选意味着**真实项目旧数据未经审计**，属已知未判边界（§七），不是通过条件 |

### 2.3 必须保持不变的部分

1. **守卫 N1–N5 已验收行为不变**：缺 `flowId`/`cardKind` 的治理 confirm 仍在原始客户通道之前被拒；角色 `cardKind` 白名单、`liaison` confirm 一律拒绝、choice 的 `cardKind` 机械兜底、普通项目角色与 `single`/`su` 路径、判断/镜像/排队/账本/回放语义、`notPresented` 回执形状均不变。唯一的有意差别是：**尾连字符从「按旧正则被允许」变为被拒绝**；拒绝/回执文案中内嵌的正则文本随常量更新为新正则（设计 §2.4/§3.2 要求），除此之外不改变文案与形状。
2. **合法旧 slug 零回归**：`flow-a`、`flow-alpha`、`todo-list-v1`、`intent-a`、`demo`、`s1`、`impl`、`verification`、`acceptance` 等既有合法值在各入口继续可用；测试计数可因新增用例增加，既有用例不得删除、skip 或放宽断言。
3. **旧值不自动迁移**：不做 `trimEnd("-")`、不自动补字符、不大小写转换、不重命名 Flow YAML/意图文件、不改写账本；不把非法值静默降级为缺席。
4. **连续连字符仍允许**：`a--b` 合法；本次只禁尾连字符（O2 不选）。
5. **契约与导出形状不变**：`GOVERNANCE_SLUG_PATTERN` 仍是 `string` 常量、名称与导出处不变；`governance-handoff.ts` 仍导出 `RegExp`；`govern-session.ts` 薄再导出形状不变；Provider schema 字段仍为可选，不新增/删除字段、不新增公共函数或版本号。
6. **本次变更的零 diff 面**：`app/desktop/`、`app/renderer/`、三适配器（Pi/Codex/Claude）、`src/service/runtime/session.ts`、装配/接线不因本变更产生代码改动。工作树中此前守卫与后台任务的在途改动必须在候选归属清单中分开列明，不得混入本变更交付（E5）。

### 2.4 本轮不判、不能冒充的证据边界

| 项 | 本轮是否判 | 说明 |
| --- | --- | --- |
| 真实项目旧值审计（O4 未选） | **不判** | 仓库外真实项目是否存在尾连字符 `flowId`/`stepId`/`intentId` 存量，本轮无审计、不判；升级后旧值会被显式拒绝，如需评估由客户另行安排 O4 |
| 真机/真实模型/桌面 UI | **不判** | 需客户另行安排；脚本化模型/判断桩结果不能冒充真实模型行为与桌面呈现 |
| 非 Windows 平台 | **不判** | 通过结论只覆盖实际记录平台；Windows 证据不能由其它平台结果代替 |
| 应用重启 | **不判** | 本变更无持久状态，但重启场景属真机阶段，另行安排 |
| O1–O4 | **不判** | 未授权、不实施；不因「顺手做了」算加分，实施即为范围越权 |
| 提交、推送、部署、发布、合并 | **不判** | 验收结论不授权任何对外操作 |

## 三、成功标准 S1–S12

每条都要有当前候选上的**可执行证据**（测试用例名、命令、退出码、原始输出）；只有代码阅读或设计论证不算动态证据。

### S1 新正则精确且为唯一产品定义来源

**必须观察到**

1. `src/model/runtime.ts` 导出的 `GOVERNANCE_SLUG_PATTERN` **逐字等于** `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`；类型仍是 `string`，导出名称与位置不变；常量 JSDoc 同步为新语义（2–64、首尾字母数字、禁止首/尾连字符、连续连字符允许）。
2. 全仓扫描（`src/`、`test/`、`app/`）没有第二份**旧值**正则字面量 `a-z0-9][a-z0-9-]{1,63}` 作为产品/测试判定来源；历史角色文档（memo/changelog/历史设计/历史验收）可以保留旧文本，不作为运行来源，且不得追改。
3. Provider schema 的 10 处 `pattern: GOVERNANCE_SLUG_PATTERN` 与常量相等（既有 schema 相等断言继续通过）；Provider handler 用常量构造 `RegExp`，不硬编码新正则字面量。
4. 所有编排消费点从 Model 常量（或其派生 `RegExp`）构造；允许 `governance-handoff.ts` 值导入 Model 字符串并导出 `RegExp`，`governance-judge-intent.ts` 复用该 `RegExp`；不允许任何文件保留同值私有副本。

**判失败**：常量不是新字符串；任意产品文件保留独立旧/新正则字面量作为判定来源；schema `pattern` 与常量不一致；为收紧另造第二份「读取用」正则（O1）。

### S2 Provider 五个工具入口统一拒绝

**必须观察到（对应设计 T3/T4 的 Provider 部分）**

1. `request_confirmation`、`request_choice`、`dispatch_task`、`hand_off_intent`、`request_clarification` 在收到 `flowId`/`stepId`/`intentId` 为 `flow-`、`a-`、`impl-`、`intent-` 时返回 `ok:false`；回执点名具体字段与值/规则，并展示**新**正则（从常量插值，不硬编码旧正则）。
2. 字段缺席仍是合法旧调用；`stepId` 等可选项的缺席语义不变；字段形状、`required`、枚举、`additionalProperties` 未变。
3. schema 声明层 `pattern` 已为新常量；即使客户端忽略 `pattern`，handler 仍二次校验并拒绝，不得只依赖 schema。
4. 拒绝发生在触达客户通道/派发/能力之前：客户卡、派发、写盘、能力调用零次。

**判失败**：任一工具路径接受尾连字符；schema 仍显示旧正则或与常量不一致；handler 只信任 schema；回执无法指导更正或仍展示旧正则；缺席字段语义改变。

### S3 编排五个私有副本单一来源化

**必须观察到（对应设计 T2/T6/T7/T8/T10 的编排公共部分）**

1. `src/common/编排/governance-handoff.ts`：模块导出 `GOVERNANCE_SLUG_PATTERN` 仍是 `RegExp`（`instanceof RegExp`），构造源为 Model 字符串（可经别名导入）；`isSlug` 使用它；`intentId`/`flowId` 非法返回既有 `invalid-intent-id`/`invalid-flow-id`。
2. `governance-gate.ts`：`SLUG_RE` 由 Model 构造；`coordinate`/`dispatch`/`write-flow`/`write-nomination`/`write-role-card` 的 6 处错误文案展示新正则（常量插值）；错误码 `missing-flow-id`/`missing-step-id` 等不变；合法值仍放行。
3. `governance-judge-facts.ts`：`GOVERNANCE_FLOW_ID_RE` 由 Model 构造，谓词行为随新值收紧。
4. `flow-state.ts`：`FLOW_ID_RE` 由 Model 构造；解析错误文案经 `${FLOW_ID_RE}` 展示新正则；具体 path 报错保留。
5. `flow-service.ts`：`FLOW_ID_RE` 由 Model 构造；`flow_get`/`flow_step_update`/`flow_step_supersede` 的 `flowId`/`stepId`/`oldStepId`/`newStepId` 尾连字符被拒绝，既有错误码不变，不写盘。
6. `govern-session.ts` 薄再导出形状不变；桌面/外部消费方零改动。

**判失败**：任一私有副本仍是独立字面量；导出从 `RegExp` 改成字符串或其它形状；错误码变化；文案仍硬编码旧正则；合法值被误拒。

### S4 `run-role.ts`：谓词单一来源与 Flow YAML 路径宽捕获

**必须观察到（对应设计 T9/T11/T16）**

1. `GOVERNANCE_FLOW_ID_RE` 由 Model 常量构造；`isGovernanceFlowId` 本地谓词保留（不新增 O3 模块）；依赖它的确认卡守卫、步骤解析、账本过滤等行为随新值收紧。
2. `FLOW_YAML_PATH_RE` 改为**宽捕获单段候选**（候选段不含 `/` 或 `\`，扩展名 `.yaml`/`.yml`）；路径正则本身不再内嵌 slug 正则，slug 判定只保留在 `isGovernanceFlowId`。
3. `validateFlowYamlCard` 在匹配到候选路径后先判 `isGovernanceFlowId(target.flowId)`：不合法 ⇒ **记录失败并拒绝该卡**，明确写出候选值与新规则；**不得** `continue` 静默跳过，也不得放行未经 YAML 校验的写路径。
4. 确认卡声明 `docs/flows/flow-.yaml`（无论卡片自身 `flowId` 是否合法/缺失）被显式拒绝；`docs/flows/flow-a.yaml` 等合法候选仍走既有「与卡片 flowId 一致 + preview 提取 YAML + `parseFlowStateYaml`」校验。
5. 多段路径（`docs/flows/a/b.yaml`）、含反斜杠或 `..` 的路径不被宽捕获为 Flow YAML 目标（不能借宽捕获绕过）。
6. 801/823 附近两处硬编码旧正则的文案改用常量插值，展示新正则；错误形状不变（`declined`/`notPresented` 等按 N1–N5 原语义）。

**判失败**：路径正则收紧后非法文件名被静默忽略（绕过 YAML 校验）；宽捕获把多段/穿越路径当目标；非法 id 未点名值/规则；两处文案仍显示旧正则；谓词被换成 O3 模块。

### S5 流程服务与治理门禁拒绝尾连字符

**必须观察到（对应设计 T7/T8/T10）**

1. `flow_get`/`flow_step_update`/`flow_step_supersede` 的 `flowId`、`stepId`、`oldStepId`、`newStepId` 为尾连字符时被拒绝（`missing-flow-id` 或既有等价错误码），不写盘、不发行路径。
2. 治理门禁 `write-flow`/`write-nomination`/`write-role-card`/`dispatch`/`coordinate` 对 `flowId`/`stepId` 尾连字符 deny（`missing-flow-id`/`missing-step-id`），文案含新正则；合法值仍放行。
3. Markdown 流程回落解析（`parseFlowStepIds`）不再把 `impl-` 识别为步骤 id（fail-closed）；`impl` 正常识别。由此派发门禁对旧 Markdown 尾连字符步骤报「步骤不存在」，不得静默匹配。

**判失败**：任一服务/门禁入口接受尾连字符；错误码变化；Markdown 回落把尾连字符步骤当合法；合法值被误拒。

### S6 旧值显式处理：handoff 与 judge-intent 不静默

**必须观察到（对应设计 T6/T15）**

1. `validateIntentHandoff`：入参 `intentId`/`flowId` 为尾连字符 ⇒ `invalid-intent-id`/`invalid-flow-id`；意图文件 frontmatter 的 `flowId` **非空但不合法** ⇒ `invalid-flow-id` 显式报错，不得按 `undefined` 静默当作缺席（当前 `fileFlowId` 回落分支 `input.flowId ?? (fileFlowId !== "" && isSlug(...) ? ... : undefined)` 必须改为显式错误）。
2. `resolveIntentReference`：账本 `intent.handed-off` 行中的 `intentId` **非空但不合法** ⇒ 返回 fail-closed `intent-unconfirmed`，detail 点名旧值与新规则；不得 `continue` 静默跳过；提案 frontmatter 的 `intentId` **非空但不合法** ⇒ 同样 fail-closed，不得回落 `flow-id`。
3. 空/缺席值保持既有回落语义（账本 → 提案 → `flow-id`）；合法旧值（如 `intent-a`）继续可用。
4. 不做 `trim`/裁剪/大小写转换；错误信息不得把旧值说成「没有意图」。

**判失败**：非空非法值被静默跳过/回落；错误信息不提旧值/新规则；空/缺席路径被误伤；合法旧值不可用。

### S7 Flow YAML 与意图文件解析

**必须观察到（对应设计 T9/T16）**

1. Flow YAML 的文件名 `flowId`、顶层 `flowId`、步骤 `id`、`evidence.ref`、`supersedes`/`supersededBy` 引用为尾连字符时，返回**具体 path** 的校验错误；合法 YAML 解析结果不变。
2. 盘上已存在的 `docs/flows/flow-.yaml`（内容自洽）在新规则下解析报 `flowId` 非法；派发门禁 deny；不自动重命名、不自动改写内容、不删除。
3. 意图文件：`hand_off_intent` 不能接受/创建 `docs/intents/intent-.md`；既有非法 frontmatter 被显式报错；合法 `intent-a` 不受影响。
4. 治理账本读取仍只做形状校验（`at/kind/actorRoleId/power`），历史行可读；但**消费方**（判断意图基准、门禁）对非空非法 slug 显式处理（S6），不得把「不符合现行规则」误当成「没有意图」。

**判失败**：解析器静默跳过非法值；错误无 path/值；自动迁移或改写；账本历史行被删改；消费方静默回落。

### S8 正反例全表逐项成立

**必须观察到（对应设计 §2.2、T1/T2/T4）**

| 值 | 期望 | 说明 |
| --- | --- | --- |
| `flow-a`、`a-b`、`ab`、`a-1`、`1-a` | 接受 | 首尾字母数字，长度 2–64 |
| `a--b` | 接受 | 连续连字符仍允许（O2 不选） |
| `todo-list-v1`、`flow-alpha`、`intent-a` | 接受 | 既有合法值 |
| 64 字符（如 `a`×64） | 接受 | 最长 64 不变 |
| `flow-`、`a-`、`flow--` | 拒绝 | **尾连字符**（本变更目标） |
| `-flow` | 拒绝 | 首连字符 |
| `Flow` | 拒绝 | 大写 |
| `a_b` | 拒绝 | 下划线 |
| `a`（单字符） | 拒绝 | 最短 2 |
| 65 字符 | 拒绝 | 超长 |
| 空串、纯空白、`flow-\n` | 拒绝 | 长度/字符不合法；无静默 trim |

至少一层测试逐项覆盖上表，且同一常量同时用于 JS `RegExp` 与 JSON Schema `pattern`（ECMA-262）判定；Provider handler、编排包装器、门禁/流程服务各自的实际拒绝行为与表一致。

**判失败**：任一值结果不符；只在代码阅读中声称；`f` 等单字符被当作合法正例（见 §七.2）；新旧值混用导致 `flow--` 被接受。

### S9 守卫 N1–N5 零回归且 F2 开放口径关闭

**必须观察到**

1. 上一轮守卫验收记录的既有套件基线继续通过（以候选上的实际输出为准）：`test/编排/governance-judge.test.ts` 77/77、`test/runtime-core/governance-flow-metadata.test.ts` 9/9、`test/门禁引擎/governance-trio.test.ts` 33/33、`test/测试/governance-e2e-auto/` 53/53；计数可因新增用例增加，**既有用例不得删除、skip 或放宽断言**。
2. N1–N5 的语义与形状不变：缺字段治理 confirm 在原始通道前拒绝（`declined`+`notPresented`）、回执「治理确认卡未发出/未向客户呈现」、五角色白名单与 `liaison` 拒绝、choice 兜底、普通角色/`single`/`su` 零变化、判断/镜像/排队/账本/回放零变化；唯一差别是尾连字符被拒，且文案内正则文本为新值。
3. 守卫 A1 F2 中「首尾连字符非法」的子项在本变更后实际成立；旧验收报告 §7.3 的开放口径由**新验收报告引用旧报告**的方式关闭；历史设计与历史验收报告**不回改**（F12）。

**判失败**：任一既有守卫用例红/被删/被 skip；N1–N5 其它行为变化；Tail-hyphen 仍能通过治理 confirm 守卫；为关闭 F2 去改写旧报告或旧标准。

### S10 S4 门禁测试与 S5 跨角色 e2e

**必须观察到（对应设计 T12/T13/T14）**

1. **S4**：`test/门禁引擎/governance-standard-workflow.test.ts` 不再硬编码 `/^[a-z0-9][a-z0-9-]{1,63}$/`；改为引用 Model 常量构造 `RegExp`；新增一个尾连字符步骤 id 负例；既有模板合法 id 断言不放松。
2. **S5**：跨角色 e2e 负例——治理角色脚本发 `flowId: "flow-"`/`"a-"`、`stepId: "impl-"`、`intentId: "intent-"` ⇒ 工具 `ok:false`；`presented=0`、`judgeRows=0`、无 `governance-judge.started`、无镜像/排队行、无 `customer.decision` 账本、无写集发行；正例——同一路径改用 `flow-a` 等合法 slug 时，卡片呈现/判断/账本/镜像与改前一致。
3. e2e 夹具若因路径/字段变化需要调整，属测试角色边界内的同步修改；不得为通过而放宽产品断言或删除场景。

**判失败**：S4 仍硬编码旧正则；负例只有代码阅读/单元断言而无跨角色证据；负例产生任何客户卡/判断/账本/镜像/排队副作用；正例回归。

### S11 契约文档与记录

**必须观察到**

1. `角色卡/运行时核心/api-spec.md`、`角色卡/编排/api-spec.md` 中**现行契约文本**的旧正则更新为新正则；历史 memo/changelog 条目不改写。
2. 各实施角色在自己的 `changelog.md` 新增本变更记录，写明用户可见入口、实际代码位置、验证命令与结果、未验证项；状态与实际相符。
3. 新验收报告引用设计路径、`status: accepted`、`revision: 1`、设计 SHA-256、本标准 A1 与旧守卫报告 §7.3。

**判失败**：现行契约文档仍展示旧正则；历史记录被追改；变更记录自述「已验证」但无实际输出；报告未引用版本。

### S12 typecheck 0 与全量基线记录

**必须观察到（对应设计 T18）**

1. 同一候选上实际运行 `npm run typecheck`（`tsc --noEmit`），**退出码 0**，附原始输出尾部；不能用定向 typecheck 或「编辑器无红线」代替。
2. 同一候选上实际运行全量测试（`node --test "test/**/*.test.ts"` 或仓库既有等价命令），记录命令、cwd、环境、退出码、通过/失败/跳过计数与失败清单。
3. 既有环境红（Windows 无 symlink 权限的 `EPERM`，上一轮记录为 9 个文件:行）逐条指名并附证据；`test/pi-adapter/write-sequencing.test.ts` 按客户决定的既有口径排除并记为**未验证/排除**，不得算作通过；不得把本次改动引入的失败归为既有基线红，也不得因存在基线红就省略全量运行。
4. 不声称「全量全绿」；若候选引入新失败，按返工处理。

**判失败**：typecheck 非 0 或未在同一候选运行；全量未运行；失败无法区分基线红/新增红；排除项被算作通过；用旧候选输出充数。

## 四、失败与边界标准 F1–F12

> 本文件的 F 编号只用于本标准；设计 §5/§7.3 的 T 编号另有含义；仓库既有的「F4 写前拦截」是产品内既有闸门名称，与本文件编号无关。

### F1 旧非法值显式拒绝、不静默、不改写

旧账本、旧 Flow YAML、旧意图文件中已存在的尾连字符 `flowId`/`stepId`/`intentId`：读取/消费路径必须**显式拒绝或显式报告**（具体 path/字段/值），不得静默跳过、不得当作缺席、不得自动裁剪/重命名/改写。账本作为历史事实保持可读；消费方（判断意图基准、门禁）必须 fail-closed，不得换用其他来源。

### F2 合法旧 slug 零回归

`flow-a`、`flow-alpha`、`todo-list-v1`、`intent-a`、`demo`、`s1`、`impl`、`verification`、`acceptance` 等既有合法值在 Provider、编排、门禁、Flow YAML、意图文件、账本消费各层与改前一致；既有测试计数不得减少或出现 skip。

### F3 连续连字符仍允许

`a--b` 在常量、schema、handler、门禁、Flow YAML 解析中均被接受；不得顺手收紧内部连字符（O2 未选）。若候选把 `a--b` 拒绝，按范围越权/契约变化处理。

### F4 长度与字符边界

2 字符接受、64 字符接受、1 字符拒绝、65 字符拒绝；首连字符、尾连字符、大写、下划线、空串、纯空白、换行均拒绝。边界由同一常量驱动，不允许入口间不一致。

### F5 Provider 工具路径与编排包装器路径一致

同一非法值经 Provider 工具（schema/handler）与直接调用编排包装器时均被拒绝；字段名一致（`flowId`/`stepId`/`intentId`）；不存在「工具路径拒绝、包装器放行」或反向的旁路。schema `pattern` 与 Model 常量相等是结构证据，handler/包装器实际行为是动态证据，两者都要有。

### F6 Flow YAML 旁路关闭

声明 `docs/flows/flow-.yaml`/`.yml` 的确认卡必须被**显式拒绝**；不得因为路径正则收紧而不再识别该路径、从而绕过 `validateFlowYamlCard` 的 YAML 校验。宽捕获不得接受多段/反斜杠/`..` 路径作为目标。合法 `docs/flows/flow-a.yaml` 仍走既有「卡片 flowId 一致 + preview 提取 + YAML 解析」全链。

### F7 诊断不扩 `FIELD_NAMES`

1. `src/common/shared/diagnostics.ts` 零 diff；不得为记录 `flowId`/`stepId`/`intentId`/旧值而扩白名单（属另一件共享组件变更）。
2. 若实现新增诊断事件，只能使用既有白名单字段；拒绝信息通过工具回执/错误码表达，不记录客户内容或新 payload 字段。
3. 错误/回执必须点名字段与值/规则，但不得把值写进共享诊断白名单之外的位置。

### F8 本次变更零 diff 面

`app/desktop/`、`app/renderer/`、三适配器、`src/service/runtime/session.ts`、装配/接线不因本变更产生代码改动；`app/` 与适配器无 slug 副本。工作树中此前守卫/后台任务的在途改动（尤其 `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`schema.ts`、`src/service/runtime/session.ts`）必须在归属清单中分开列明，不得算作本变更交付或用于满足本标准的证据。

### F9 导出形状与兼容

`GOVERNANCE_SLUG_PATTERN` 仍为 `string`；`governance-handoff.ts` 仍导出 `RegExp`；`govern-session.ts` 薄再导出不变；Provider schema 字段仍可选、`required`/枚举/`additionalProperties` 不变；不新增公共函数、字段、版本号或迁移脚本；桌面消费方若读取再导出，类型与行为不变。

### F10 O1–O4 未实施

候选不得出现：读取宽正则/旧值读取兼容（O1）；连续连字符收紧（O2）；新谓词模块/公共 `governance-slug` 模块（O3）；真实项目审计报告或扫描仓库外项目的产物（O4）。上述任一出现，按范围越权返工，不因「更严格/更兼容」而视为通过。

### F11 N1–N5 除尾连字符外行为不变

缺字段拒绝、角色白名单、`liaison` confirm 拒绝、choice 兜底、普通角色/`single`/`su`、判断/镜像/排队/账本/回放、`notPresented` 回执形状均不变；唯一有意差别是尾连字符被拒与文案正则文本更新。任一其它行为变化按返工处理，须回到原所有者并说明理由。

### F12 历史记录不回改，F2 关闭方式可追溯

旧守卫设计、旧验收标准 A1、旧验收报告（含 §7.3）保持原样；不追改历史 memo/changelog。新验收报告必须明确引用旧报告 §7.3/F2，说明「尾连字符自本变更起被拒绝」，从而关闭开放口径。若历史文档被修改以「补成一致」，按治理违规处理。

## 五、必需证据 E1–E8

实施与测试角色交付时必须提供下列证据；不接受「已完成」「已测」这类自述。每条证据都要绑定**同一候选**（E5）。同时，验收报告必须引用设计路径与 `status: accepted`/`revision: 1`/SHA-256 `d283138476a4e0d7132481dfbd70ad7462be915a3524bf2bee532f61bfb370dd`，以及本标准 A1。

| 编号 | 证据 | 通过条件 |
| --- | --- | --- |
| **E1** | **各角色变更记录** | S1 运行时核心、S2/S3 编排、S4 门禁引擎（测试改动记录）、S5 测试的变更记录均存在（实际文件名以真实路径为准并在报告中列明）；写明用户可见入口、实际代码位置、验证命令与结果、未验证项；状态与事实相符，不得把未跑的真机/跨角色写成已验证；引用设计与本标准版本 |
| **E2** | **实际测试命令与原始输出** | 列出每条关键标准的实际命令、工作目录、环境（OS/架构、Node/npm 版本）、退出码与原始 stdout/stderr；每条 S/F 映射到可指名用例或明确标注「仅静态证据」；不接受只有自述、截图或计划 |
| **E3** | **`npm run typecheck` 0** | 同一候选上实际运行，退出码 **0**，附原始输出尾部；不能只写「类型检查通过」；覆盖全部工作树（含测试文件） |
| **E4** | **目标套件结果** | runtime-core（`governance-flow-metadata.test.ts`、`tools.test.ts`、`liaison-handoff-tools.test.ts`）、编排（`test/编排/`）、门禁引擎（`test/门禁引擎/`）、跨角色（`test/测试/governance-e2e-auto/`）实际运行；记录计数并与上一轮守卫基线（77/77、9/9、33/33、53/53）对比；既有用例零缺失、零 skip、零放宽；新增正反例可指名 |
| **E5** | **候选 HEAD + 工作树清单 + 逐文件归属** | `git rev-parse HEAD` 完整 SHA；`git status --porcelain`（`core.quotepath=false`）完整清单（修改/新增/删除/未跟踪，未跟踪文件附哈希）；逐文件归属到 S1–S5、此前守卫、后台任务等**不同在途任务**，并证明每条路径落在对应角色 `boundary.md` Section 1 内；列出本次变更的零 diff 面；记录候选冻结时点；任何后续产品/测试/配置变化使受影响证据失效 |
| **E6** | **旧合法 slug 正例与尾连字符负例** | 同一候选上实际运行：合法旧值（`flow-a`、`flow-alpha`、`todo-list-v1`、`intent-a`、`demo`、`s1`、`impl`、`verification`、`acceptance`、`a--b`、64 字符）在各入口的正例输出；`flow-`/`a-`/`flow--`/`-flow`/`Flow`/`a_b`/单字符/65 字符在各入口的负例输出；至少覆盖 Provider handler、编排包装器/守卫、门禁、Flow YAML、意图/账本消费中的实际路径 |
| **E7** | **Flow YAML 旁路用例** | 实际运行证明：确认卡声明 `docs/flows/flow-.yaml`/`.yml` 被显式拒绝（不是静默忽略），错误点名候选值与新规则；`docs/flows/flow-a.yaml` 合法候选仍完成既有 YAML 校验；多段/反斜杠/`..` 路径不被宽捕获为目标；卡片 `flowId` 与文件名一致性校验仍生效 |
| **E8** | **失败清单与环境红区分** | 全量运行的命令、计数（tests/pass/fail/skip）、失败清单逐条文件:行与错误文本；Windows symlink `EPERM` 既有环境红逐条指名并附证据；`test/pi-adapter/write-sequencing.test.ts` 按客户决定的既有口径排除，记为**排除/未验证**；本次改动引入的新失败不得归为基线红；区分「失败」「无法运行」「排除」三种状态；不得声称全量全绿（若基线红存在） |

## 六、判定规则

### 6.1 三种结论

| 结论 | 条件 | 后续 |
| --- | --- | --- |
| **通过（pass）** | S1–S5 交付齐全且归属正确；S1–S12、F1–F12 全部满足；E1–E8 完整且绑定当前候选；无未解决失败；O1–O4 未实施；无断言被删除/放宽、无测试被 skip 以促成通过；文档与实际行为一致 | 交可信启动端/统筹记录该阶段完成。通过只覆盖「当前候选 × 实际记录平台」的 S1–S5 范围，不授权提交/推送/部署/发布/合并，不替代真机与真实项目审计 |
| **返工（needs-work）** | 已有证据表明不满足标准：例如任一 slug 入口仍接受尾连字符；私有正则副本仍在；Flow YAML 路径被静默跳过；旧值被静默裁剪/改写；N1–N5 行为变化；零 diff 面被改动；诊断扩 `FIELD_NAMES`；O1–O4 被实施；typecheck 非 0；全量出现本变更引入的新失败；断言被放宽/删除/skip | 验收报告列出条目、原始证据、差异与应回到的所有者（运行时核心 / 编排 / 门禁引擎 / 测试，越权处还需 Team Formation 处理）；由可信启动端安排修复与复测，保留原失败记录 |
| **证据不足（missing-evidence）** | 无法判断：测试未实际运行或只给自述/截图；缺少命令、退出码或原始输出；证据绑定旧候选/与当前工作树不符；关键场景只有代码阅读；E1–E8 任一必需项缺失；环境未记录；全量基线红无法区分；候选尚未冻结或 S1–S5 未全部交付 | 写明缺什么、由谁补、补证后重判；**不能记通过**，也不能把「没有证明失败」当成通过 |

### 6.2 必须判「证据不足」的情形（不穷举）

1. 声称测试通过但没有实际运行记录、退出码或原始输出。
2. 测试输出对应的候选与当前工作树不一致（HEAD、工作树清单或未跟踪文件哈希不符）。
3. 关键标准只有代码阅读/设计论证，没有动态证据（尤其 S2 的入口拒绝、S4 的 Flow YAML 旁路、S6 的旧值 fail-closed、S10 的跨角色负例）。
4. `npm run typecheck` 未在同一候选运行，或只提供定向 typecheck 结果。
5. 全量测试未运行，或既有红与新增红无法区分（E8）。
6. 平台/环境未记录，或只提供其他平台证据却宣称本平台行为。
7. 改动归属清单缺失，无法判断 S1–S5 与此前守卫/后台任务等其他在途工作的边界。
8. S1–S5 未全部交付（内容感知不全、某项仅部分落盘）即提交验收。

### 6.3 证据失效与不降低标准

- 产品代码、测试、断言、配置或依赖在证据生成后变化 → 受影响证据失效，需在新候选上重跑受影响门；不能拼接不同候选的输出。
- 同一候选同一范围已有有效结论可复用；设计/标准实质修订后，按原确认流程更新并重判受影响项。
- 验收不为了通过而放宽标准：不接受自述代替原始输出、代码阅读代替行为测试、定向 typecheck 代替全仓 typecheck、单元测试代替跨角色 e2e、脚本化模型结果冒充真机、其他平台结果代替 Windows。
- 验收报告至少包含：任务/阶段、设计与本标准版本（含设计 SHA-256）、候选身份、实际改动范围与归属、逐条 S/F 结论、原始证据链接、剩余问题与理由。
- **验收通过不授予提交、推送、部署、发布或合并权限**；发布决定属客户。

## 七、未判范围与未决问题

### 7.1 本轮不判

1. **真实项目旧值审计（O4 未选）**：仓库外真实项目是否存在尾连字符 `flowId`/`stepId`/`intentId` 存量未审计；升级后这些旧值会被显式拒绝，是否影响真实流程需客户另行安排。
2. **真机/真实模型/桌面 UI**：真实桌面/CLI + 真实模型/凭据下的呈现、重试与镜像/排队未判；脚本化模型不能代替。
3. **非 Windows 平台**：不判；通过结论只覆盖实际记录平台。
4. **应用重启**：不判。
5. **O1–O4**：未授权、不判；若发现实施，按范围越权交回，不因「行为更好」而算通过。
6. **提交、推送、部署、发布、合并**：不判、不授权。

### 7.2 未决与需交接确认

1. **候选尚未冻结**：写作时工作树同时含 S1 在途改动、此前守卫/后台任务改动；S2–S5 尚未派发。验收前必须由可信启动端给出**候选冻结时点**与**改动归属清单**（E5/E6）；否则只能判证据不足。
2. **变更记录文件名**：S1/S2/S3/S4/S5 的实际变更记录路径以交付时真实文件为准；本文件不预造文件名。
3. **设计 §4.1 夹具清单的小误差**：设计把 `f` 列为「新正则合法值」，但单字符在旧、新正则下都非法。本角色抽查发现 `f` 仅出现在 `test/runtime-core/flow-tools.test.ts`、`test/pi-adapter/flow-tools.test.ts` 的 mock 能力参数与 `test/桌面UI/operator-view.test.ts` 的展示载荷中，不经过 `flow-service` 校验，因此不构成回归面；**本标准的正例表不采用 `f`**。建议项目管理在后续文档修订中更正该句（本角色不改设计）。
4. **`write-sequencing` 排除口径**：上一轮按客户决定排除 `test/pi-adapter/write-sequencing.test.ts`；本轮沿用该既有口径并记为未验证。若客户改变决定，全量范围随之变化，须在 E8 中重新记录。
5. **S4 测试文件范围**：设计只点名 `governance-standard-workflow.test.ts`；若实现同时改动 `test/门禁引擎/` 其它文件，须在 E5 中逐文件归属，不得扩大断言放松。
6. **`FLOW_YAML_PATH_RE` 的具体写法**：本标准验收「单段宽捕获 + 显式拒绝」的行为与单一来源，不强制某个字面写法；但不得内嵌 slug 正则、不得静默跳过。

## 八、标准状态与后续

- 本文件是**验收标准（version A1，status: ready）**，不是实施、测试、验收报告或发布记录。截至写作时，S1 实施进行中、S2–S5 待派发、候选未冻结；本文件不对任何候选给出通过/返工/证据不足结论。
- 交付方按 §五 提交证据后，本角色将在自身 `docs/change/` 撰写独立验收报告，逐条对照 S1–S12、F1–F12 与 E1–E8，附原始证据链接和候选摘要；结论只写通过、返工或证据不足三态之一（可分项）。
- 标准若因授权、候选或契约变化需要修订，先记录依据并按原确认流程处理；实施后不得为了通过而放宽本文件。
- 验收通过不授予提交、推送、部署、发布或合并权限。

## 九、相关链接

- 设计（项目管理）：[收紧共享治理 slug 契约——禁止尾连字符](../../../项目管理/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen.md)
- 前序守卫设计：[无效治理确认卡的应用侧守卫](../../../项目管理/docs/design/2026-10-22_design_invalid-governance-card-guard.md)
- 前序守卫验收标准 A1：[无效治理确认卡守卫 N1–N5 验收标准](2026-10-22_design_invalid-governance-card-acceptance.md)
- 前序守卫验收报告（§7.3 尾连字符开放项）：[无效治理确认卡守卫 N1–N5 独立验收](../change/2026-10-22_change_invalid-governance-card-acceptance.md)
- 本角色边界：[boundary.md](../../boundary.md)
