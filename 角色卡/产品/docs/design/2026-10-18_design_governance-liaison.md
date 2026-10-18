---
id: governance-liaison
type: design
title: 治理四角色（新增 Liaison 联络官）设计提案
created: "2026-10-18"
updated: "2026-10-18"
timezone: Asia/Shanghai
status: proposed
revision: 1
related: [governance-trio, governance-trio-review, governance-pin-recovery, existing-project-compat]
events:
  - date: "2026-10-18"
    kind: created
    summary: 客户要求把「客户沟通」从 Rapporteur 拆出、以沟通角色作为主入口；已拍板新角色 Liaison 联络官（liaison）、提案接受/修改的决定卡镜像到主入口、现在就改四角色；本提案定义四角色与沟通权、意图自动交接、决定卡镜像、左树/UI、兼容（保持 governanceModel:"trio"）、审计、验收、风险、归属与最小 V1（仅设计，零代码改动）
---

# 治理四角色（新增 Liaison 联络官）设计提案

一句话结论：**三权不变、角色变四个。** 把「客户沟通」从 Rapporteur 拆成 **Liaison 联络官（liaison）**：Liaison 是客户默认的**主入口**，只拥有**沟通权**（非决定权），负责理解意图、把任务交给 Rapporteur；Rapporteur 保留**提案权**，Nominator 保留**提名权**，Convener 保留**编排权**。提案接受/修改等治理决定卡**镜像到主入口**；客户仍只答一次，最终批准权仍只属于客户。

> **本文件只是设计，未实施。** 未改任何源码、测试、边界、`.ans`、UI 或治理记录；未运行真实模型/网络/凭据；未 git 提交。文中源码位置为写作时点工作树读数（含在飞修改），实施前须按当轮 HEAD 复核。

## 〇、客户需求与已拍板

### 0.1 客户需求（逐字）

> 「感觉报告员可以在拆分一下，把客户沟通，和编写提案，拆分出来。客户沟通的作为主入口。」

### 0.2 已拍板

1. 新角色叫 **Liaison 联络官**，角色 id `liaison`，职能词 `communication`。
2. 提案**接受/修改**的决定卡**镜像到主入口**（联络官聊天）。
3. **现在就改四权**（按本次任务表述，即现在就改成**四个角色**；三权本身不变）。
4. 既有三权（提案/提名/编排）与最终批准权归属**不变**；客户仍是唯一批准者。

### 0.3 产品解读与非目标

- **拆的是「谁面对客户」，不是「谁做决定」**：Liaison 是客户默认对话者和沟通记录者，不是审批者、不是派发者、不是提名者。
- **Liaison 不是关卡**：客户仍可直接打开 Rapporteur/Nominator/Convener 对话；直接路径不因新增 Liaison 而失效。Liaison 是默认入口，不是强制中转。
- **非目标**：不新增第四种「决定权」；不改变提案接受门/任命写入门/派发范围门；不改变客户决定卡的答案语义；不让 Liaison 拥有 `dispatch_task`、任命/写卡、编排、安装、恢复或 shell 审批能力。

## 一、角色与权力

### 1.1 三权不变、角色四名

- **三个程序性权力不变**：提案权（Rapporteur）、提名权（Nominator）、编排权（Convener）；三道门禁（提案接受门、任命写入门、派发范围门）逐字沿用项目管理评审 `2026-10-17_design_governance-trio-review.md`。
- **Liaison 的沟通权不是第四种决定权**：它不产生任何能解锁门禁的「候选物」，不批准、不任命、不派发、不排流程；它只产出**意图记录**与**交接请求**。因此治理模型仍称「三权」；角色数变为四个。
- 四角色都是**内置角色**（沿用三人内置的既有裁定：空项目悖论、权限稳定性、与 su 同信任级）；Liaison 无 `角色卡/liaison/` 目录，不写入 `.ans` 的角色表。

### 1.2 四个角色一张表

| 角色 | 职能 | 权力 | 只产出 | 绝不能产出 |
| --- | --- | --- | --- | --- |
| **Liaison 联络官**（`liaison`） | 客户沟通、理解意图、把任务交给 Rapporteur | **沟通权**（非决定权） | 意图记录 `docs/intents/**`、交接请求 | 批准、提案、契约、提名、流程单、派发、任命、改角色卡/边界 |
| **Rapporteur 报告员**（`rapporteur`） | 在意图交接后形成方案；客户直接找它时照常沟通 | **提案权** | 澄清问题、提案、契约、方案说明 | 批准、任命、派发、改角色边界 |
| **Nominator 提名官**（`nominator`） | 选择角色、组建团队 | **提名权** | 候选名单、角色卡/边界草案（客户确认后写入）、能力安装建议 | 任命、批准、派发、改提案内容 |
| **Convener 召集人**（`convener`） | 安排流程、推动协作 | **编排权** | 流程单、步骤顺序、派发、进展与阻塞报告 | 批准、任命、改方案、改角色卡/治理记录 |

一句话记法：**Liaison 负责「客户要什么」，Rapporteur 写「做什么」，Nominator 写「谁来做」，Convener 写「按什么顺序做」；客户写「同意/不同意」。**

### 1.3 Liaison 能写什么、不能写什么（推荐：只写 `docs/intents/`）

**推荐：Liaison 的 Section 1 与预授权只含 `docs/intents/` 一棵目录；不设 `docs/governance/liaison/` 工作笔记目录。**

推荐理由：

1. **沟通必须留痕**：客户原话、目标、范围、验收线索若只存在聊天流里，应用派发给 Rapporteur 的文本就会成为唯一来源；一旦转述偏差，「沟通与提案脱节」无法从项目文件复原。意图记录让审计可以回答「客户到底说了什么」。
2. **与既有「先落盘再派发」一致**：意图记录是 Rapporteur 可读的稳定地址；应用在交接时计算摘要/哈希，不让模型自算（沿用 G-1 与账本口径）。
3. **权限面最小**：只多一棵非治理目录；不新增门禁、不进 pin、不改变任何现有角色的写权。相比「完全不写」，代价只是一个目录；收益是可审计、可复读、可关联 `intentId`。
4. **不设工作笔记目录**：Liaison 的产出物就是意图记录本身；额外草稿目录只会扩大写权面而没有独立审计价值。若后续确有需要，再按治理流程单独扩列。

**完全不写的替代方案（不推荐）**：权限面最小，但客户沟通只能留在聊天记录，Rapporteur 只能读应用转述；审计无法从项目文件还原意图，且每次交接都要应用重新序列化客户原话。除非客户明确要求「Liaison 零写权」，否则不采用。

**推荐写权矩阵（Liaison）**：

| 路径 | 权限 | 说明 |
| --- | --- | --- |
| `docs/intents/` | **预授权** | 每条意图一份 `<intentId>.md`；仍走 F4/F6/F7 与既有边界判定 |
| `docs/proposals/**`、`docs/contracts/**` | 禁写 | 属 Rapporteur 提案权 |
| `docs/nominations/**`、`docs/skills/**`、`docs/mcp/**` | 禁写 | 属 Nominator 提名权 |
| `docs/flows/**`、`docs/workflow.md` | 禁写 | 属 Convener 编排权 |
| `docs/governance/` 下其他治理角色目录（`rapporteur/**`、`nominator/**`、`convener/**`） | 禁写 | 其他治理角色的工作记录 |
| `角色卡/**` | 禁写 | 角色定义属提名权；内置治理角色目录一律不可创建 |
| `.ans/**`、`docs/bootstrap-manifest.md`、`角色卡/governance-boundary.yaml` | 禁写 | 应用独占治理记录 |
| `app/**`、`src/**`、`test/**` | 禁写 | 本角色不实现 |

**意图记录格式（建议）**：

```md
---
intentId: <slug>
created: "YYYY-MM-DD"
handoffKind: initial | clarification | revision
flowId: <slug>            # 可选；澄清/修订时引用既有 flow
goal: <客户要达成什么，一句话>
scope: <包含/不包含>
acceptance: <怎样算完成>
constraints: <约束/偏好>
openQuestions: <仍未确定的问题；没有则空>
customerWords: <客户原话摘录；不写凭据/密钥>
status: draft
---
```

- `status` **不是权威**：门禁与账本只认应用签发的决定；意图文件写 `accepted` 不会解锁任何东西。
- 意图文件**不是提案**：不进入 `docs/proposals/`，不参与提案接受门；Rapporteur 在提案 frontmatter 里用 `intentId` 关联它。

### 1.4 能力矩阵（唯一数据来源＝内置注册表）

| 能力 | Liaison | Rapporteur | Nominator | Convener | su（single） |
| --- | --- | --- | --- | --- | --- |
| `customerInput`（确认/选择卡） | **否**（只用聊天） | 是 | 是 | 是 | 是 |
| `handOffIntent`（交接工具） | **是** | 否 | 否 | 否 | 否 |
| `requestClarification`（澄清工具） | 否 | **是** | 否 | 否 | 否 |
| `dispatchTask` | 否 | 否 | 否 | **是** | 是（旧行为） |
| `roleStatus` / `sessionTail` | 否 | 否 | 否 | **是** | 是 |
| `proposeRecovery` | 否 | 否 | 否 | **是** | 是 |
| `installSkill` / `installMcp` | 否 | 否 | **是** | 否 | 是 |
| shell | `none` | `none` | `none` | `readonly` | `operator-approve` |

- **Liaison 不注入 `customerInput`**：它用聊天问问题，不占用「一项目一卡」的治理决定队列。若让 Liaison 发选择卡，客户的普通沟通问题会挡住真正的提案决定卡；V1 不建议。若 PM 认为必须结构化提问，应另设**非治理问题卡**并明确绕过治理队列，不并入本版。
- 能力判断只读注册表 `capabilities`，不在调用方按角色 id 散落硬编码（沿用评审 §二-4）。
- Liaison 可读项目文件（读不受写边界限制），因此可以用 `docs/proposals/`、`docs/flows/` 等项目文件回答「现在到哪了」；账本若需展示，由应用以只读快照提供，不要求模型直接读 `.ans`。V1 不给 `role_status`/`session_tail`，避免把「沟通」与「看护」混在一起。

### 1.5 Liaison 卡文本最低内容

内置卡文本必须写清：

1. 你是 **Liaison 联络官**，职能是**客户沟通、理解意图、把任务交给 Rapporteur**；你**不拥有最终批准权**。
2. 你只能写 `docs/intents/**`；不得写提案/契约/提名/流程/角色卡/`.ans`/manifest/治理边界。
3. 意图清楚后，先写 `docs/intents/<intentId>.md`，再调用 `hand_off_intent`；**不要替客户猜**目标、范围、验收；缺项就先问。
4. 每次成功交接后，用一句话告诉客户「已交给报告员，正在工作中」；不要宣称已批准/已提案完成。
5. 客户直接问项目进展时，读 `docs/proposals/`、`docs/flows/` 等项目文件后如实转述；不确定就说不确定。
6. 不得创建第五个治理角色；不得修改其他治理角色的资料；不得把客户原话中的凭据/密钥写进意图文件。

### 1.6 Rapporteur 的角色定义修订（权力不变）

- 原三人定义中 Rapporteur 的「理解意图、沟通」由 Liaison 承接；Rapporteur 保留**提案权**，其输入改为「意图记录 + 客户直接消息（若客户直接找它）+ 澄清往返」。
- Rapporteur 的卡文本应增补：默认客户入口是 Liaison；收到应用交接的意图后先读 `docs/intents/<intentId>.md`；信息不足用 `request_clarification`，不要反复追问客户；客户直接找它时照常沟通，不改变权力边界。
- **权力与门禁不变**：Rapporteur 仍只能写提案/契约/自己的工作记录；仍不能批准、任命、派发。

## 二、主入口与流程

### 2.1 客户默认与谁对话

- **trio 下 `listProject` 返回四个内置角色，顺序 `liaison` → `rapporteur` → `nominator` → `convener`；`primaryRoleId = "liaison"`。** 左树主位、空态 CTA、默认选中都由该字段驱动（渲染侧不硬编码 id）。
- 客户导入项目后默认看到「开始与联络官对话」；客户仍可随时直接打开另外三个角色。
- `single` 模型不变：仍只有 su，`primaryRoleId = "su"`，不出现 Liaison、不做镜像、不做意图交接。
- 桌面默认入口是 Liaison；CLI `ans govern` 的缺省 `--function` **建议仍为 `proposal`（Rapporteur）**，因为 CLI 是操作者工具而非客户入口；两者都用同一 `resolveGovernanceRole`，但缺省由各自前端给出。若 PM 要求 CLI 也默认 Liaison，只改 CLI 调用处的缺省，不改共享解析器语义。

### 2.2 自动交接：Liaison → Rapporteur（应用代客户推进）

**不是角色间授权，也不是 Liaison 派活。** Liaison 没有 `dispatch_task`；它只调用一个**交接工具**，由应用校验后投递。权限链是：

```
客户消息（客户本人） → Liaison 理解并写意图 → hand_off_intent（Liaison 请求交接）
  → 应用校验（模型/角色/意图文件/字段/去重） → 应用后台投递给 Rapporteur（actor=app）
```

**工具：`hand_off_intent`（只注入 Liaison）**

入参建议：

```ts
{
  intentId: string;                 // slug，匹配 docs/intents/<intentId>.md
  handoffKind: "initial" | "clarification" | "revision";
  goal: string;
  scope: string;
  acceptance: string;
  flowId?: string;                  // clarification/revision 时引用既有 flow
  summary: string;                  // ≤200 字，给客户看的进度摘要
}
```

**应用侧校验（机械、可测）**：

1. `governanceModel === "trio"` 且当前角色 `governanceFunction === "communication"`；工具只注入 Liaison，其他角色不注册（未注入＝工具不存在，沿用 `dispatch_task` 先例）。
2. `docs/intents/<intentId>.md` 存在，frontmatter `intentId` 与入参一致；`goal`/`scope`/`acceptance` 非空，且**以意图文件为权威**——入参四要素与文件不一致 → 拒绝，不猜测、不截断。缺任一 → `ok:false`，明确告诉 Liaison「先向客户澄清并写意图，未交接」。
3. **去重**：同一 `intentId + handoffKind + 意图文件 sha256` 已成功交接 → 拒绝，回执「已交接，不重复派发」。
4. **每轮最多一次成功交接**：同一模型轮次内第二次调用 → 拒绝；防止一次回复里连发多个任务。
5. `initial`：同一 `intentId` 已有成功 `initial` 交接且流程未关闭 → 拒绝，提示改用 `clarification`/`revision`；`clarification`/`revision` 必须引用既有 `intentId`（建议同时带 `flowId`）。
6. **不产生客户决定卡**：客户的消息本身就是指令；应用只在交接成功后落一条可见系统行「已交给报告员（工作中）」，不要求客户再点一次「确认」。

**应用侧动作（成功时）**：

1. 通过既有桌面会话投递队列把**一条**任务消息发给 Rapporteur；**不打开/不切换会话、不移动当前 pane / 输入焦点**；左树只按 `role-state` 显示 Rapporteur「工作中」。
2. 任务消息只给地址与最小上下文：`docs/intents/<intentId>.md` 路径、`intentId`、`handoffKind`、`flowId?`、摘要；不内嵌全文、不让模型自算哈希（沿用 G-1）。消息模板必须写明「意图记录不是客户批准；请形成提案并用提案卡请客户决定；信息不足用 `request_clarification`」。
3. 成功后写账本：`intent.handed-off`（actor=liaison、power=communication）与 `dispatch.accepted`（actor=app、power=app、trigger=intent-handoff、target=rapporteur）。**先投递成功、后写账本**；投递失败只落系统行，不写成功账本。
4. 若 Rapporteur 忙，消息进既有投递队列；系统行如实说「报告员工作中，已排队」，不新建第二套队列、不循环重试。

### 2.3 完整闭环

```
客户 → Liaison（主入口：理解、澄清、写意图）
  ├─ docs/intents/<intentId>.md（goal/scope/acceptance/客户原话）
  └─ hand_off_intent
        ↓（应用校验；不打开/不切换；左树 Rapporteur「工作中」）
  Rapporteur 读意图 → 写 docs/proposals/<flowId>-v1.md（frontmatter 关联 intentId）
  ├─ 信息不足 → request_clarification → 系统行镜像到 Liaison
  └─ 写完后 request_choice（cardKind=proposal，flowId，accept/accept-quick/revise/reject）
        ↓
  提案卡 **镜像到主入口（Liaison 聊天）**；客户在主入口或 Rapporteur 聊天作答（同一请求只答一次）
        ↓
  账本 customer.decision（power=proposal）→ 既有 advanceGovernanceFlow（actor=app）
        ↓（不打开/不切换；目标角色「工作中」）
  Nominator（accept）或 Convener（accept-quick）
        ↓
  任命卡 / 写盘确认卡 / 流程写盘卡 **同样镜像到主入口**（同一规则）
        ↓
  Convener 派发项目角色 → 回交 Convener（镜像 Rapporteur）→ 更新流程单
        ↓
  Rapporteur 汇总证据 → 验收卡（cardKind=acceptance，同样镜像）
        ↓
  客户决定 → 流程关闭；或按反馈开 v2 / 新 flow
```

**硬约束（沿用并新增）**：

- 没有客户接受提案，Convener 不能写 flow；没有任命决定，Nominator 不能写角色卡；没有已接受提案 + 任命/快捷路径 + 流程步骤，`dispatch_task` 拒投。
- Liaison 的交接**不解锁任何门禁**；它只把「客户已经提出的需求」交给 Rapporteur。提案是否接受仍是客户在提案卡上的决定。
- 应用后台交接/推进**不自动批准、不自动写盘、不自动任命**；目标角色仍走自己的门禁与客户卡。
- 同一 flow 同一时刻只允许一个待客户决定；跨 flow 的卡按项目队列串行（见 §3.6）。
- 角色之间不互相批准；Markdown `status` 不是权威。

### 2.4 异常与分歧

| 情形 | 处理 | 升级/边界 |
| --- | --- | --- |
| **Liaison 判断不了**（目标、范围、验收缺失或自相矛盾） | Liaison 在聊天里列出缺失项，不写意图、不交接；可给出选项让客户口头选择 | 两轮澄清仍不收敛 → 明确告诉客户「现在还不能交给报告员」，客户可直接找 Rapporteur 或继续补充；不猜测、不硬交 |
| **Rapporteur 需要澄清** | Rapporteur 调 `request_clarification`（`flowId?`、`intentId?`、`question`）；应用写账本 `clarification.requested`，把问题作为系统行镜像到 Liaison；客户在 Liaison 回答；Liaison 更新意图记录并 `hand_off_intent{handoffKind:"clarification", intentId/flowId}`；应用再投递给 Rapporteur | 同一 flow 最多 2 轮澄清；第 3 轮必须由 Rapporteur 在提案卡上请客户决定（带假设/备选），不得无限追问 |
| **客户直接找 Rapporteur** | 允许；Rapporteur 照常沟通、写提案、发卡；不要求补意图交接。提案卡仍镜像到 Liaison | 直接对话不改变任何权力边界；Liaison 不是关卡 |
| **客户直接找 Nominator/Convener** | 允许；直接对话仍受各自边界与客户卡约束 | 同上 |
| **交接投递失败**（会话打不开/发送失败） | 在 Liaison 聊天落系统行「应用无法把意图交给报告员：<原因>；未重试」；**不写成功账本**、不循环重试 | 客户再发一条消息后，Liaison 可重新交接（失败尝试不进去重成功集） |
| **同一意图重复交接** | 工具回执「已交接，不重复派发」；不产生第二次派发 | 若确需补充，用 `clarification`/`revision` 并更新意图文件 |
| **同一意图多个提案** | `initial` 只允许一次；修订走 `revision` 且引用既有 flow；提案最多 v2 | 超过 v2 → 客户明确要求或开新 flow；Liaison 卡文本必须写明 |
| **多个意图并行** | 允许不同 `intentId` 并行；Rapporteur 按投递队列顺序处理；决定卡按项目队列一次一张 | 系统行与账本必须带 `intentId`，避免串话 |
| **Liaison 会话不可用** | 客户可直接打开 Rapporteur；治理卡仍在其原生聊天出现（镜像不可用不影响原生卡） | 主入口是默认，不是单点依赖 |
| **客户在 Liaison 已回答提案卡，但仍继续聊天补充需求** | Liaison 视为新的 `revision`/新意图；不修改已作出的客户决定 | 已决定不可覆盖；补充需求走新交接/v2 |

### 2.5 防误触发与防空转（机械规则）

1. **意图四要素**：`goal`/`scope`/`acceptance` 任一为空 → 工具拒绝；防止「客户随口一说就自动提案」。
2. **每轮一次**：同一模型轮次最多一次成功交接。
3. **同意图去重**：`intentId + handoffKind + sha256(意图文件)` 唯一；成功后不再派发。
4. **`initial` 一次**：同一意图的初次交接只允许一次；后续只能澄清/修订。
5. **不自动重试**：投递失败只落系统行；下一次交接必须由客户新消息触发。
6. **交接不是批准**：`intent.handed-off` 不写 `customerDecision`；任何门禁不读它。
7. **澄清上限**：同一 flow 最多 2 轮 `request_clarification`；超过即请客户在提案卡上决定。
8. **不增殖**：仍是四个内置治理角色；不得创建第五个，也不得把项目角色提升为治理角色。

## 三、决定卡镜像

### 3.1 定义

**镜像 = 同一个请求 id 的第二处呈现，不是第二个请求，也不是第二次审批。** 主进程只创建一个待决请求；镜像只是让这张卡同时出现在主入口（Liaison）聊天流里。客户无论在哪一侧作答，调用的是同一个 `respond({id, decision})`，只结算一次。

### 3.2 哪些卡镜像

**V1 推荐：所有治理决定卡都镜像；普通写盘卡与运维卡不镜像。** 判据是卡片已有的 `cardKind`：

| `cardKind` | 是否镜像 | 理由 |
| --- | --- | --- |
| `proposal` | **是** | 客户明确要求；主入口应能接受/修改提案 |
| `appointment` | **是** | 任命是客户级治理决定；在主入口作答可少切一次聊天 |
| `appointment-write` | **是** | 逐路径写盘确认是任命的第二层，客户应在主入口看到完整链 |
| `schedule-write` | **是** | 流程写盘是治理决定 |
| `acceptance` | **是** | 验收是客户级治理决定 |
| `write`（普通写盘确认） | 否 | 属角色工作会话的操作确认，不是治理决定；镜像会制造噪音 |
| 无 `cardKind`（旧调用） | 否 | 零行为变化 |
| shell 审批卡 / 恢复确认卡 | 否 | 运维面，保持原生位置；不与治理决定混淆 |

**为什么统一镜像全部治理卡，而不是只镜像提案卡**：若只镜像提案卡，客户要记住「提案在主入口答、任命/验收去角色聊天答」，认知负担更大；统一规则实现上只是一个判据（`cardKind` 存在且 ≠ `write`），且不改变任何门禁。若 PM 要缩到最小，可先只镜像 `proposal`，但应作为明确的降级项记录，而不是默认行为。

### 3.3 原角色是否仍显示

**是。原生卡与镜像卡都显示、都可作答；第一份被受理的答案生效。**

- 原生卡留在发起角色的聊天流（Rapporteur 看到客户的决定结果，符合其工具调用上下文）。
- 镜像卡出现在 Liaison 聊天流，带来源标签：**「来自 <发起角色> 的治理决定 · 客户最终批准」**（发起角色由请求的 `roleId` 派生；沿用既有「来自 <role> 的报告」镜像先例，不新造一套视觉语言）。
- 两侧的按钮/输入都指向同一个请求 id；任何一侧作答后，两侧同时进入终态。
- 终态说明统一为「客户已作出决定：<接受/退回/要求修改/拒绝/任命…>」；不显示「已批准」来描述派发/流程推进。

### 3.4 同一请求 id 只能答一次

- 主进程的客户通道按**请求快照**校验（既有 `customer-input.ts` 语义）；镜像不创建第二个 `pending` 条目。
- 第一次合法答案结算后，第二次 `respond`（无论来自哪一侧）返回 `{ok:false, expired:true}`；界面已冻结，不提供可点的第二份。
- 第二次尝试**不写账本**、不产生第二个 `customer.decision`、不触发第二次 `onNextStep`。
- 若两侧几乎同时提交：主进程事件循环串行受理，先到者生效；后到者按终态拒绝，不会覆盖。

### 3.5 镜像卡与原生卡状态同步

- 渲染侧 `opRequests`（`app/renderer/renderer.js`，现为「一请求一条登记」）扩展为一条登记带 `surfaces: string[]`：`payload.roleId` 仍是发起角色（用于回执归属/原生徽标），新增 `payload.mirrorRoleId`（trio 下为主入口 Liaison）。
- 同一 `requestId` 在两个 pane 各物化一张卡；pane 切换后按登记表重新物化（沿用既有「卡不丢」机制）。
- `openRequestIdsFor(roleId)`/左树徽标把镜像面计入：Liaison 与发起角色都显示「等待你确认」（同一请求，不是两张不同卡）。
- 终态冻结函数同时作用于两张卡；排队提示、失效终态同样同步。
- 镜像卡不写入 Liaison 的模型上下文（不是模型消息）；它只是界面呈现。Liaison 若要回答进展，读项目文件/账本快照。

### 3.6 排队与一项目一卡

- 既有「同一 `projectRoot` 同一时刻只呈现一张待决卡，后续入队」**不变**（`app/desktop/customer-input.ts` 的 `waiting`/`activeByProject`）。
- **只有已呈现（active）的治理卡镜像**；排队中的请求不在 Liaison 显示可操作卡，只在主入口状态行显示一条聚合提示：「还有 N 个决定等待前一个决定」。
- 前一张结算后，队列中的下一张按到达顺序自动呈现；若它是治理卡，再镜像到 Liaison。客户不需要重新打开任何会话。
- 不自动合并、不自动批准、不自动跳过；同一请求 id 不会因镜像多占一个队列位。

### 3.7 持久性与重启语义（如实）

- 镜像卡是**运行期呈现**：它随待决请求存在；应用关闭/重启后，未决请求按既有 G-1 语义失效（`expired:true`），镜像卡随之消失。
- **持久记录在账本与发起角色的会话历史**：`customer.decision` 记录客户批了什么；发起角色的聊天回放保留原生卡的请求/结论行。Liaison 的聊天历史不会凭空多出它没有参与过的模型消息。
- V1 不承诺「重启后在主入口回放镜像卡」；若客户需要，可在 V1.1 做只读回放（读账本 + 请求登记），但不得造第二份可作答卡。

## 四、左树与 UI

### 4.1 左树

1. **主入口**：Liaison（`primaryRoleId` 驱动，区域框与默认选中沿用现有主入口样式）。
2. **治理职能（内置）**：Rapporteur、Nominator、Convener。
3. **其他角色**：项目角色，沿用现有 `group`/`groupDuty` 分组。

渲染实现落点：`app/renderer/renderer.js::renderRoleTree()` / `roleTreeItem()` 已按 `governanceFunction` 分组、按 `primaryRoleId` 置顶；新增 Liaison 后**结构无需重写**，只需注册表与 `primaryRoleId` 数据变化。

### 4.2 权力副标题与标识

每行显示：

- 中文名 + 英文名：「联络官 Liaison」「报告员 Rapporteur」「提名官 Nominator」「召集人 Convener」。
- 权力副标题：
  - 联络官：**「客户沟通 · 不拥有最终批准权」**
  - 报告员：**「提案权 · 不拥有最终批准权」**
  - 提名官：**「提名权 · 不拥有最终批准权」**
  - 召集人：**「编排权 · 不拥有最终批准权」**
- 内置标识：「内置角色：随应用发布，无角色目录」。
- 文案映射加在 `app/renderer/ui-labels.js::governanceRoleView()` 的 `communication` 项；不硬编码角色 id。

### 4.3 空态

- **Liaison 空态（主入口）**：说明「客户默认入口：你说要做什么，我先确认目标、范围与验收，再交给报告员形成提案。我不写提案、不批准。」；**「建立治理记录 / 检查并重新接受」入口继续显示在主入口**（沿用 `primaryRoleId` 数据驱动，S1/I4 谓词与文案不变）。
- **Rapporteur 空态**：「通常由联络官交接打开；客户也可以直接找我。我只写提案，不批准。」保留其提案/契约入口。
- **Nominator/Convener 空态**：沿用现有「通常由应用按流程后台派发」说明。
- 旧项目（single）不出现 Liaison；旧模型提示条与迁移入口不变。

### 4.4 状态行与系统行

- 状态行显示：治理模型（三权/旧模型）、当前 `flowId`（若有）、`等待你决定` / `进行中` / `阻塞` / `已升级客户`；数据来自账本/流程单，不读 Markdown `status`。
- 新增主入口进度行（只读、非模型消息）：
  - 「已交给报告员（工作中）」
  - 「报告员需要澄清：<一句话>」
  - 「报告员工作中 / 提名官工作中 / 召集人工作中」（随 `role-state`）
  - 「应用无法把意图交给报告员：<原因>；未重试」
- **应用治理进度行优先落在主入口（Liaison）聊天流**；目标角色自己的聊天流保留其自身的系统行（如派发成功/失败）。不整段镜像角色助手消息，避免噪音。
- 失败行不循环重试、不自动切换视图；`single`/`su` 不出现这些行。

### 4.5 不做

- 不做独立的「意图」面板（V1）；`docs/intents/*.md` 复用现有文档预览/资料入口。
- 不新增独立「权限说明」模态；说明放行副标题 + 内置卡文本。
- 不自动打开/切换 Liaison 或任何角色；镜像卡到达只更新徽标与状态行。

## 五、兼容与迁移

### 5.1 保持 `governanceModel: "trio"`，不新增模型值（推荐）

**建议保持 `.ans` 的 `governanceModel` 值为 `"trio"`（三权四角色），不改为 `quad` 等新值，也不新增角色映射字段。** 理由：

1. **模型值命名的是权力模型，不是角色数量**：`trio` 指提案/提名/编排三权；Liaison 是同一模型下新增的沟通职能，不构成第四种决定权。
2. **四个角色 id 是应用常量**：`.ans` 本来就不存 `governanceRoles` 映射（项目管理评审 §5.5：写进 `.ans` 只会制造第二份真相）；Liaison 与三人一样由注册表+模型派生。
3. **现有 trio 项目零迁移**：包括正在试跑的项目，升级应用后 `listProject` 自动返回四角色、`primaryRoleId` 变为 `liaison`；`.ans`、pin、manifest、角色卡、提案/流程/账本全部不动。
4. **避免双模型代码路径**：若新增 `quad`，`resolveBoundarySection`、`listProject`、迁移预览、测试矩阵都要处理 `single|trio|quad` 三态；收益只是版本标记，不抵成本。
5. **降级友好**：旧版应用读到 `trio` 仍按三角色工作，忽略 `liaison` 与 `docs/intents/`；新版再升级回来，数据不丢。若改成 `quad`，旧版会把模型判为未知/`single`，反而制造兼容问题。

> 若客户坚持要「本版启用四角色」的版本标记，建议用应用版本/诊断记录表达，不写进 `.ans`；是否接受由 PM 拍板。

### 5.2 现有 `trio` 项目（含试跑项目）

- 升级后自动获得 Liaison 作为主入口；`primaryRoleId` 由 `rapporteur` 变为 `liaison`。这是**默认入口变化**，不是数据迁移。
- 既有 Rapporteur/Nominator/Convener 会话、提案、契约、提名、流程、账本、pin 全部保留可读；不重写、不重 pin、不追加 manifest。
- 未决卡按既有重启语义失效；不承诺跨版本保留待决请求。
- `docs/intents/` 对旧项目是新增空目录；首次使用时由 Liaison 创建文件（预授权）。不把它加入 pin。
- 左树会多出「联络官」；旧项目无需任何确认。Liaison 空态用一句话说明「本版起默认入口为联络官；报告员与历史提案不变」，**不做持久化迁移提示条**（避免每条项目永久挂一个已完成的提示）。

### 5.3 `single` / su 不变

- `.ans` 无 `governanceModel` 或为 `"single"`：行为逐字不变——只有 su 一个内置治理角色，`primaryRoleId = "su"`，无 Liaison、无镜像、无意图交接、无新账本事件。
- CLI `ans govern` 在 single 下仍只接受 su；传 `--function communication` 应明确拒绝并提示「旧治理模型只有 su」。

### 5.4 保留 id 与角色目录

- `liaison` 加入**保留 id**：`角色卡/liaison/` 目录一律跳过并警告；`resolveRole("liaison")` 按内置角色解析，不被项目角色遮蔽；不得创建该目录。
- `listProject` 对 `liaison`/`rapporteur`/`nominator`/`convener`/`su` 的冲突处理沿用既有守卫。
- `resolveGovernanceRole` 的合法 id 列表与错误文案从三人改为四人（含 `liaison`）；trio 下 `function` 合法值含 `communication`。

### 5.5 迁移（single → trio）代码不变

- `migrateGovernanceModel` 只写 `governanceModel:"trio"` 的行为不变；迁移后 `listProject` 自然返回四角色、主入口 Liaison。
- 迁移预览文案需补一句「迁移后客户默认入口为联络官」，但不改变写路径与 pin。
- 旧 `docs/su/**` 仍只读保留；Liaison 不获得其写权。

## 六、审计：客户沟通、意图交接与批准

### 6.1 账本扩展（append-only，沿用 `.ans/governance/ledger.jsonl`）

新增：

- `GovernancePower` 增 `"communication"`。
- `kind` 增 `"intent.handed-off"` 与 `"clarification.requested"`。
- `GovernanceLedgerEntry` 增可选：`intentId?: string`、`handoffKind?: "initial" | "clarification" | "revision"`、`trigger?: "customer-decision" | "intent-handoff" | "settle"`。
- `dispatch.accepted` 的 `trigger` 用于区分「客户决定后推进」与「意图交接后投递」；两者都仍是 `actorRoleId:"app"`、`power:"app"`，**都不是客户批准**。

`intent.handed-off` 建议字段：

```
at, kind:"intent.handed-off", actorRoleId:"liaison", power:"communication",
intentId, handoffKind, targetRoleId:"rapporteur", flowId?,
artifactPath:"docs/intents/<intentId>.md", artifactSha256（应用算）,
messageSummary（≤200 字）, runtime, sessionId
```

### 6.2 谁提的案、谁转的交、客户批了什么

| 审计问题 | 账本回答 |
| --- | --- |
| 客户说了什么 | 聊天流 + `docs/intents/<intentId>.md`（Liaison 写，`customerWords` 原话摘录）；`artifact.observed`（若观察器扫描 `docs/intents/`）为补充 |
| 谁转的交 | `intent.handed-off`（`actorRoleId:"liaison"`、`power:"communication"`、`intentId`、`artifactPath/hash`、`handoffKind`） |
| 应用怎么推进的 | `dispatch.accepted{actorRoleId:"app", power:"app", trigger:"intent-handoff", targetRoleId:"rapporteur", intentId}`；不写 `customerDecision` |
| 谁提的案 | `artifact.observed{actorRoleId:"rapporteur", artifactPath:"docs/proposals/<flowId>-vN.md"}`（既有） |
| 谁提的名 | `artifact.observed{actorRoleId:"nominator", ...}`（既有） |
| 谁排的程 | `artifact.observed{actorRoleId:"convener", ...}` + `dispatch.accepted`（既有） |
| 客户批了什么 | `customer.decision`（`decisionKind`、`customerDecision`、`targetRoleIds`、`paths`、`decisionEvidence`）；镜像作答仍只写**一条** |
| 澄清往返 | `clarification.requested`（`actorRoleId:"rapporteur"`、`flowId?`、`intentId?`、`messageSummary`）+ 后续 `intent.handed-off{handoffKind:"clarification"}` |

### 6.3 纪律

- `intent.handed-off` **不是**客户批准：不写 `customerDecision`/`decisionEvidence`，不进入提案接受门/任命写入门/派发范围门的判定。
- 镜像**不产生**第二份 `customer.decision`；同一请求 id 只结算一次。
- 角色（含 Liaison）不可写账本；`.ans/**` 在四人的 `forbiddenWritePaths` 内。
- `decisionEvidence.surfaceRoleId`（客户在哪一侧作答）**V1 不记录**：不改变契约、不参与门禁；若后续要做「主入口体验统计」，作为独立的只读诊断字段再加，绝不能让门禁读取它。
- 账本读失败仍 fail-closed；不回退到 Markdown `status`。

## 七、验收口径（可测量）

实现后由测试/真机证据判定，不以文案自述：

1. **四角色枚举**：新 trio 项目 `listProject` 恰返回 4 个 `builtIn === true`，顺序 `liaison`/`rapporteur`/`nominator`/`convener`，`primaryRoleId === "liaison"`，`governanceModel === "trio"`。
2. **左树与文案**：主入口为联络官；治理职能组恰为报告员/提名官/召集人；四条权力副标题逐字正确；`角色卡/liaison/` 不出现。
3. **Liaison 写权**：写 `docs/intents/**` 放行；写 `docs/proposals/**`、`docs/contracts/**`、`docs/nominations/**`、`docs/flows/**`、`docs/skills/**`、`docs/mcp/**`、`角色卡/**`、`.ans/**`、manifest、治理边界全部被拒，拒绝文案指回正确归属（报告员/提名官/召集人/应用）。
4. **交接闭环（确定性夹具）**：意图文件 → `hand_off_intent` → 账本 `intent.handed-off` + `dispatch.accepted{actor:"app",trigger:"intent-handoff"}` → Rapporteur 收到一条任务；**不打开/不切换会话、不移动 pane/焦点**；左树只显示「工作中」。
5. **交接守卫**：意图文件缺失、`goal/scope/acceptance` 任一为空 → 工具拒绝且无账本/无派发；同一 `intentId+handoffKind+hash` 重复 → 拒绝；同一轮第二次 → 拒绝；非 Liaison 角色无该工具。
6. **交接不是批准**：交接与派发不写 `customerDecision`，不使任何门禁放行（无客户接受提案时 Convener 写 flow 仍被拒）。
7. **镜像范围**：`proposal`/`appointment`/`appointment-write`/`schedule-write`/`acceptance` 在 Liaison 与发起角色两侧都出现；`write`、shell 审批、恢复确认、无 `cardKind` 不镜像。
8. **同一请求只答一次**：在任一侧作答后两侧冻结；另一侧再答返回 `expired:true`；账本恰一条 `customer.decision`；`onNextStep` 恰一次。
9. **排队与一项目一卡**：第二张治理卡排队时不出现可操作镜像，只显示聚合排队行；第一张结算后第二张按序出现并镜像；不自动合并/批准。
10. **镜像后的下一步**：在主入口接受提案 `accept` → 恰一次后台派发 Nominator；`accept-quick` → 恰一次 Convener；无重复派发、无第二事件。
11. **澄清闭环**：Rapporteur `request_clarification` → 账本 `clarification.requested` → Liaison 出现系统行 → 客户回答 → Liaison `hand_off_intent{clarification}` → 再投递 Rapporteur；不新建 flow；超过 2 轮必须在提案卡上请客户决定。
12. **直接路径仍可用**：客户直接打开 Rapporteur 写提案、发卡、接受；不要求意图文件；提案卡仍镜像到 Liaison。
13. **旧项目兼容**：既有 trio 夹具 `.ans` 在升级前后逐字节不变（或字段级无变化）；`primaryRoleId` 变 `liaison`；single 夹具行为逐字不变（仍 su、无镜像、无交接）。
14. **降级语义**：旧版应用读同一 trio `.ans` 不崩溃、仍按三角色工作；新版再打开后 Liaison 回来；`docs/intents/**` 不被删除。
15. **保留 id**：`角色卡/liaison/` 被跳过并给出警告；项目角色不能遮蔽内置 Liaison。
16. **审计可还原**：给定一条完整链，能从账本还原「客户意图 → 谁转的交 → 谁提的案 → 客户批了什么 → 应用派发给谁」；`intent.handed-off` 与 `customer.decision` 不混用。
17. **失败路径**：投递失败只落系统行、无成功账本、不循环重试；下一次成功交接必须由客户新消息触发。
18. **全量回归**：`node --test "test/**/*.test.ts"`（三层 glob，不能漏测）；typecheck 零错；不跑真实模型/网络/凭据/`.env`。

## 八、风险

| 风险 | 表现 | 缓解 |
| --- | --- | --- |
| **沟通与提案脱节** | Liaison 转述偏差，Rapporteur 写出错误提案 | 意图文件带客户原话、goal/scope/acceptance；提案 frontmatter 关联 `intentId`；提案卡显示 flowId；客户可直接找 Rapporteur |
| **重复提案/重复交接** | 同一意图多次派发，Rapporteur 写多份提案 | `intentId+handoffKind+sha256` 去重；`initial` 仅一次；修订必须引用既有 flow；提案最多 v2 |
| **镜像卡答两次** | 两侧都点，产生两个决定 | 同一请求 id 单点结算；第二份 `expired:true`；两侧同步冻结；账本只一条；渲染侧不建第二请求 |
| **自动交接误触发** | 客户寒暄/提问被当成任务，自动派发 | 意图四要素非空；每轮一次；去重；Liaison 卡文本要求先问清；系统行可见；不自动重试 |
| **Liaison 越权** | 写提案、任命、派发、批准 | Section 1 只 `docs/intents/`；能力矩阵无 dispatch/install/approval；禁写路径先于 `resolveWrite` 判定；拒绝文案指路；测试逐项断言 |
| **主入口单点** | Liaison 会话异常时客户不知道找谁 | Liaison 不是关卡；客户可直接打开 Rapporteur；原生提案卡始终存在；失败系统行如实说明 |
| **默认入口变化引发困惑** | 旧 trio 项目升级后突然面对联络官 | Liaison 空态一句话说明「本版起默认入口为联络官；报告员与历史不变」；不做永久迁移提示；报告员仍可点开 |
| **镜像噪音/双徽标** | 同一决定在两侧都亮「等待你确认」 | 镜像规则统一、只镜像治理卡；只镜像 active 卡；排队用聚合行；徽标语义是「同一请求」，不是两张卡 |
| **澄清循环** | Rapporteur 反复追问，客户疲惫 | 同一 flow 最多 2 轮澄清；第 3 轮必须提案卡（带假设/备选）；Liaison 负责解释 |
| **与在飞 auto-dispatch 冲突** | 同文件并行修改，下一步事件重复/冲突 | 串行在 W3/W4 收口后做；复用 `governance-advance.ts` 的投递纪律；交接是新增触发，不复制第二套；`deriveGovernanceNextStep` 不新增卡片种类 |
| **审计缺口** | 客户在哪一侧作答无法从账本区分 | V1 如实：侧别是 UI 事实，不入账本；账本回答「谁批了什么」；若需侧别，V1.1 加只读诊断字段，门禁不读 |
| **意图文件泄密** | 客户在沟通里贴了凭据/密钥被写入文件 | 卡文本明确禁止；`customerWords` 只摘录需求；应用落盘前可按既有敏感路径/字段规则扫描（V1 只做文案纪律，不做承诺） |

## 九、文件归属与最小 V1

### 9.1 归属建议（只是指引，不构成写入授权）

| 归属 | 需要改/新增的内容 |
| --- | --- |
| **门禁引擎** | `src/model/role.ts`：`GovernanceFunction` 增 `"communication"`；`src/common/门禁引擎/governance-roles.ts`：Liaison spec（卡文本/条目/预授权/禁写/能力）、注册表顺序与 `GovernanceCapabilities` 增 `handOffIntent`/`requestClarification`；`src/service/role/resolve-role.ts`：`primaryRoleId = "liaison"`、保留 id、错误文案、`resolveGovernanceRole` 合法列表；`boundary-core.ts` 的 trio 分支随注册表生效（不改判定顺序）；`test/门禁引擎/` |
| **运行时核心** | `src/model/runtime.ts`：`hand_off_intent` / `request_clarification` 的载荷类型（不改变 `CustomerInputRequest` 冻结形状）；`src/provider/runtime/tools.ts`：工具定义/schema/handler（沿 `dispatch_task` 的「注入才注册、工具不写盘」先例）；`src/provider/runtime/schema.ts`（若需要）；`test/runtime-core/` |
| **编排** | `src/pipeline/orchestration/run-role.ts`：按能力注入交接/澄清工具、Liaison 预授权与禁写、拒绝文案；`src/common/编排/governance-handoff.ts`（新）：意图文件校验、去重、任务消息模板（纯逻辑）；`src/common/编排/governance-ledger.ts`：power/kind/字段扩展；`govern-session.ts`：薄再导出；`test/编排/` |
| **桌面窗口** | `app/desktop/session.ts`：交接工具接线、后台投递（不打开/不切换）、系统行、镜像推送；`app/desktop/customer-input.ts`：`OperatorRequestPayload.mirrorRoleId`、`surfaces` 与同一请求只答一次（既有通道语义上扩展）；`app/desktop/governance-advance.ts`：新增 intent-handoff 触发/消息（不复制下一步推导）；`app/desktop/interface.ts`、`app/main.ts`、`app/preload.cjs`（若需 IPC）；`test/桌面应用/` |
| **桌面UI** | `app/renderer/renderer.js`：镜像卡物化/冻结/徽标、Liaison 空态与状态行；`app/renderer/ui-labels.js`：`communication` 文案；`app/renderer/styles.css`：镜像卡来源标签；渲染测试 |
| **项目管理** | 不改 `.ans`/模型值；仅在评审/拆发与测试矩阵中登记四角色；迁移预览文案补一句默认入口变化 |
| **测试** | 独立验收夹具：四角色枚举、交接、镜像一次性、排队、兼容、审计还原；全量三层 glob |

### 9.2 与当前在飞 auto-dispatch/下一步事件的关系

- 当前工作树正在收口「客户决定后应用后台派发下一步」：`app/desktop/governance-advance.ts`（未跟踪）、`customer-input.ts`、`interface.ts`、`session.ts`、`main.ts`、`preload.cjs`、`renderer.*` 均有在飞修改。
- **Liaison 这一批必须串行排在该批收口之后**，不得并写同一文件。它应**复用**而不是另起一套：
  - 后台投递仍走既有会话/投递队列；不打开/不切换/左树「工作中」纪律逐字沿用。
  - 新增的 `intent-handoff` 只是 `dispatch.accepted` 的一个新 `trigger`，与 `customer-decision` 并列；不改变 `deriveGovernanceNextStep` 的卡片种类与推导表（Liaison 不新增 `GovernanceCardKind`，因此不会产生额外的下一步事件）。
  - 镜像扩展既有 `session:operator-request` 载荷与 `opRequests` 登记，不新建第二套卡系统。
- 若 PM 希望把 Liaison 并入当前 W3/W4，需要等当前批次文件释放后按同一任务书串行改；否则建议单列 **W6 Liaison 波次**（门禁/运行时类型 → 编排 → 桌面窗口 → 桌面UI → 测试）。

### 9.3 最小 V1（建议一次成立）

1. **四角色注册与主入口**：Liaison spec、`GovernanceFunction` 增 `communication`、`listProject` 四角色、`primaryRoleId = liaison`、左树/副标题/空态。
2. **Liaison 写权与卡文本**：`docs/intents/` 预授权；禁写全部治理产物；能力矩阵（无 customerInput/dispatch/install/recovery/shell）。
3. **意图交接**：`hand_off_intent` + 应用校验/去重/后台投递 + 账本 `intent.handed-off`/`dispatch.accepted{trigger}` + 失败系统行 + 不打开/不切换。
4. **决定卡镜像**：全部治理 `cardKind` 镜像到 Liaison；同一请求只答一次、两侧冻结、排队只镜像 active、主入口来源标签。
5. **澄清闭环**：`request_clarification` + 账本 `clarification.requested` + Liaison 系统行 + `hand_off_intent{clarification}`；最多 2 轮。
6. **兼容**：保持 `governanceModel:"trio"`；旧 trio 项目零迁移；single 不变；保留 id `liaison`。
7. **审计与验收**：账本可还原；AC1–AC18；全量三层 glob。

### 9.4 不在 V1

- 独立的「意图/流程」面板；
- Liaison 的 `role_status`/`session_tail`/`propose_recovery`（读文件已够用）；
- 镜像普通写盘卡、shell 审批卡、恢复确认卡；
- 镜像卡重启后回放；
- 自动重试交接、批量迁移、`governanceModel` 新值（如 `quad`）；
- Liaison 发结构化问题卡（会占用治理决定队列）；
- 第五个治理角色、Liaison shell、Liaison 任命/派发能力。

## 十、待 PM / 客户拍板

1. **Liaison 写权**：推荐只写 `docs/intents/`（可审计），不设工作笔记目录；是否接受？若客户要求「完全不写」，需接受沟通只留在聊天记录、审计不完整。
2. **镜像范围**：推荐全部治理 `cardKind`（提案/任命/任命写盘/流程写盘/验收）统一镜像；是否接受？若只镜像提案卡，需明确列为降级。
3. **交接守卫**：`goal/scope/acceptance` 必填、每轮最多一次、同意图去重、`initial` 仅一次——是否接受？这是防误触发的机械底线。
4. **澄清工具**：V1 是否加 `request_clarification`？推荐加；若不加，Rapporteur 只能在聊天里问，客户回答需客户自己直接找 Rapporteur，Liaison 无法闭环。
5. **Liaison 不发卡**：推荐 Liaison 不注入 `customerInput`，只用聊天；避免普通问题占用「一项目一卡」。是否接受？
6. **多意图并行**：推荐允许不同 `intentId` 并行，决定卡按项目队列串行；是否改为「一次只允许一个活跃意图」？
7. **模型值**：推荐保持 `governanceModel:"trio"`（三权四角色），不新增 `.ans` 字段、不做迁移；是否确认？
8. **主入口进度行**：推荐应用治理进度系统行落在 Liaison（主入口）；是否接受？是否还要同步到发起角色聊天（建议目标角色保留自己的系统行即可）？
9. **旧项目提示**：推荐 Liaison 空态一句话说明默认入口变化，不做持久迁移提示条；是否接受？
10. **排期**：推荐在当前 auto-dispatch/下一步批次收口后单列 W6，串行改同文件；是否接受？若要并入当前批，需 PM 确认文件释放时间。

## 十一、明确声明

**本文件只是设计，未实施。** 未改任何源码、测试、边界、`.ans`、UI 或治理记录；未运行真实模型/网络/凭据；未读取 `.env`；未 git 提交。文中的源码位置与行为均为写作时点工作树读数（含在飞修改），实施前须按当轮 HEAD 复核。本提案不构成对任何实现角色的派发授权；是否实施、如何分期、哪些点采用推荐默认，由客户/项目管理拍板。
