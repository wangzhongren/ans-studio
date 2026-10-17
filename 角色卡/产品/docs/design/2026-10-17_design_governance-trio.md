---
id: governance-trio
type: design
title: 治理三权分立（Rapporteur / Nominator / Convener）设计提案
created: "2026-10-17"
updated: "2026-10-17"
timezone: Asia/Shanghai
status: proposed
revision: 1
related: [existing-project-compat, governance-pin-recovery, contract-workflow-dispatch, role-capability-install, role-watchdog-and-closure, shell-auto-approve]
events:
  - date: "2026-10-17"
    kind: created
    summary: 客户提出把唯一内置治理角色 su 拆为 Rapporteur（报告员）/ Nominator（提名官）/ Convener（召集人）三个角色，并确立「提案权 / 提名权 / 编排权均不自动包含最终批准权」；本提案定义三权、协作协议、会话模型、边界与治理记录、兼容迁移、入口 UI、验收口径、风险与开放问题（仅设计，零代码改动）
---

# 治理三权分立（Rapporteur / Nominator / Convener）设计提案

一句话结论：**把 su 从「一个同时拥有治理写权、派发权、审批通道的单一角色」拆成「三个只拥有程序性权力的内置角色」——Rapporteur 有提案权、Nominator 有提名权、Convener 有编排权，但三者都不拥有最终批准权。** 最终批准权仍只属于客户：它体现为应用签发的客户决定事件（确认卡 `confirmed:true`、提案/任命接受记录、pin 接受、风险/命令批准），而不是任何一个角色的自我声明。

> **本文件只是设计，未实施。** 未改任何源码、测试、边界、`.ans` 或 UI；未运行真实模型/网络/凭据；未提交。文中的源码行号为写作时点工作树读数（含在飞修改），实施前须复核。

## 〇、命名与立场

### 0.1 命名来源

Rapporteur / Nominator / Convener 是**借鉴议会职能后的软件角色命名**，不声称与任何国家的正式议会职位一一对应。它们不是比喻口号：本文把每项权力落到**可写路径、可调用能力、可审计事件、门禁判定**四件事上；凡是不能落成这四件事的，都只能算文案，不算权限。

### 0.2 三个角色不是管理层级

- 三人之间**没有汇报线、没有命令关系、没有考核关系**。任何一个角色都不能「命令」另一个角色做动作；只能产出**候选物**（提案、提名名单、流程单）或按已批准流程**转交/派发**。
- 三人都是**内置治理角色**（V1 推荐，见 §四），不是项目角色；项目角色由 Nominator 提名、客户任命后创建。
- 三人的权力是**程序性权力**：它们决定「谁先提出、谁提名谁、按什么顺序做」，不决定「做不做、批不批」。决定权在客户。

### 0.3 三权速览

| 角色 | 职能 | 权力 | 只能产出 | 绝不能产出 |
| --- | --- | --- | --- | --- |
| **Rapporteur 报告员** | 理解意图、沟通、形成方案 | **提案权** | 澄清问题、提案、契约版本、给客户的方案说明 | 批准、任命、派发、改角色边界 |
| **Nominator 提名官** | 选择角色、组建团队 | **提名权** | 候选角色名单、角色卡/边界草案、能力安装建议 | 任命、批准、派发、改提案内容 |
| **Convener 召集人** | 安排流程、推动协作 | **编排权** | 流程单、步骤顺序、派发、进展与阻塞报告 | 批准、任命、改方案、改角色卡、改治理记录 |

一句话记法：**Rapporteur 写「做什么」，Nominator 写「谁来做」，Convener 写「按什么顺序做」；客户写「同意/不同意」。**

## 一、三权定义

### 1.1 Rapporteur（报告员）——提案权

**职责**：把客户的模糊意图变成可评审、可验收、可执行的方案；对客户说人话，对下游给准确地址。

**输入**：
- 客户消息与反馈；
- 项目内既有角色卡、边界、文档、历史提案/契约（只读）；
- Convener 回传的流程阻塞与执行结果（只读）；
- Nominator 回传的提名名单（只读，用于在提案中说明「需要什么角色」）。

**输出**（项目根相对路径）：
- `docs/proposals/<flowId>-v1.md`：提案正文。必须含——问题/目标、约束、方案与备选、影响角色、验收口径、风险、**需要的客户决定**（逐条列出「需要客户批什么」）。
- `docs/contracts/<name>-v1.md`：提案被接受后冻结的跨角色契约（版本化、不可原地改；变更出新版本）。
- `docs/governance/rapporteur/**`：本角色的工作笔记、澄清记录、方案草稿。

**可写范围**：`docs/proposals/**`、`docs/contracts/**`、`docs/governance/rapporteur/**`（预授权直写）；其余 `docs/` 只读。

**明确禁忌**：
- 不写 `角色卡/**`（角色定义属提名权范畴）；
- 不写 `.ans/**`、`角色卡/governance-boundary.yaml`、`docs/bootstrap-manifest.md`（治理记录属应用）；
- 不写 `app/`、`src/`、`test/`；
- 不调用 `dispatch_task`、`run_shell`；
- 不得把「客户口头说可以」写成提案已接受；不得在提案里自称 `accepted` 作为门禁依据（门禁只认应用签发的决定记录，见 §1.5）；
- 不得替 Nominator 决定团队，也不得替 Convener 排步骤。

**权力边界**：提案权 = **把选项摆上桌**。它可以定义问题、给出推荐、列出备选与代价，但不能替客户选，也不能把「推荐」写成「决定」。

### 1.2 Nominator（提名官）——提名权

**职责**：在已接受的提案范围内，选择角色、组建团队；产出一份客户可以「照单任命」的候选名单，而不是替客户任命。

**输入**：
- 已接受的提案路径与版本（只读）；
- `listProject` 枚举的项目角色、角色卡、边界（只读）；
- 现有技能/MCP 清单与角色能力面（只读）；
- Convener 的流程单（只读，用于知道需要哪些角色、何时到位）。

**输出**：
- `docs/nominations/<flowId>-v1.md`：提名正文。必须含——候选角色（复用/新建/拆分/合并）、每个候选的理由与不选备选的理由、需要授予的边界路径差异（逐条列出 `角色卡/<id>/boundary.yaml` 的路径增删）、需要安装的技能/MCP、风险与替代方案、**需要客户任命的清单**。
- `角色卡/<roleId>/role-card.md` 与 `角色卡/<roleId>/boundary.yaml` 草案：**只有在客户对提名名单作出「任命」决定、且确认卡逐条列出这些路径之后**才可写入。
- `docs/skills/**`、`docs/mcp/**`：技能与 MCP 声明文件（沿用 G-4「先落盘再激活」口径）。
- `docs/governance/nominator/**`：本角色工作笔记。

**可写范围**：`docs/nominations/**`、`docs/skills/**`、`docs/mcp/**`、`docs/governance/nominator/**`（预授权直写）；`角色卡/<roleId>/**` **仅经客户确认发行后**可写；其余只读。

**明确禁忌**：
- 不写 `.ans/**`、治理边界文档、manifest（治理记录属应用）；
- 不写 `docs/proposals/**`、`docs/contracts/**`（提案与契约属 Rapporteur）；
- 不写 `docs/flows/**`、`docs/workflow.md`（流程属 Convener）；
- 不调用 `dispatch_task`、`run_shell`；
- 不得在未获客户任命决定前写任何 `角色卡/**`；
- 不得扩大自己的边界；不得提名自己（三人是内置角色，不接受项目角色式任命）；不得创建第四个治理角色；
- 不得把「提名」写成「已任命」。

**权力边界**：提名权 = **形成候选名单**。它可以推荐复用谁、新建谁、给什么边界，但不能替客户任命，也不能在任命令下来之前把角色写进项目。

### 1.3 Convener（召集人）——编排权

**职责**：把已接受的提案与已任命的团队变成一条可跟踪的流程；安排步骤、派发任务、推动协作、暴露阻塞；不替客户验收。

**输入**：
- 已接受的提案与契约（只读）；
- 已接受的提名名单与角色边界（只读）；
- 各角色的运行状态、队列、回交报告（只读，经 `role_status` / `session_tail`）；
- 客户对流程的显式指令（例如「先做 A 再做 B」「跳过 C」）。

**输出**：
- `docs/flows/<flowId>.md`：流程单。必须含——步骤表（步骤 id / 角色 / 前置依赖 / 契约 / 交接物 / 完成口令 / 验收口径）、当前状态、阻塞原因、下一步、客户已作出的决定链接。
- `docs/workflow.md`：项目级工作流总则（沿用 G-1 约定；V1 建议只由 Convener 维护，文件级预授权或经确认写入）。
- 派发：经 `dispatch_task` 向**项目角色**投递步骤；投递文本按地址引用提案/契约/流程单，不内嵌全文，不自算哈希。
- `docs/governance/convener/**`：本角色工作笔记。

**可写范围**：`docs/flows/**`、`docs/workflow.md`、`docs/governance/convener/**`（预授权/文件级预授权）；其余只读。

**可调用能力**：`dispatch_task`、`role_status`、`session_tail`、`propose_recovery`、客户确认通道、只读 `run_shell`（V1 推荐；见 §4.4）。

**明确禁忌**：
- 不写 `角色卡/**`、`.ans/**`、治理边界文档、manifest；
- 不写 `docs/proposals/**`、`docs/nominations/**`、`docs/contracts/**`（不得改别人的候选物）；
- 不调用 `install_skill` / `install_mcp`（能力安装属提名权）；
- 不得派发**未出现在已接受提案与已接受提名范围内**的任务；
- 不得向三个治理角色自身派发（`dispatch_task` 目标必须是项目角色；现有实现已拒绝 `builtIn === true`，见 `app/desktop/session.ts` 的 `routeDispatch`）；
- 不得把「已派发」写成「已完成」，不得把「流程推进」写成「客户已验收」；
- 不得因步骤受阻自行改需求、改角色、改边界；只能回到 Rapporteur/Nominator 或请客户裁决。

**权力边界**：编排权 = **在已批准的范围内排顺序、派任务、催进展**。它可以重排步骤、拆分步骤、标记阻塞，但不能改变提案的目标与验收口径，不能增删角色，不能替代客户做接受/拒绝。

### 1.4 三权之间的边界（一张表）

| 动作 | 只能由谁做 | 其他角色能做什么 | 为什么不能越界 |
| --- | --- | --- | --- |
| 提出/修改方案 | Rapporteur | 提意见、给证据，但不能改提案文件 | 防止「提方案的人」被「排流程的人」悄悄改掉目标 |
| 决定做不做 | 客户 | 三人只能请求决定 | 最终批准权不在任何角色 |
| 提名角色/团队 | Nominator | 推荐、反对、给证据，但不能写提名文件 | 防止提案者或流程者自组班底 |
| 任命角色/授予边界 | 客户（确认卡）→ Nominator 执行写入 | 三人可解释、可预览 | 任命是治理行为，不是提名者的自我授权 |
| 写角色卡/边界 | Nominator（仅客户确认后） | 只读 | 角色定义是「人」的边界，不能由流程或方案顺手改 |
| 排步骤/派发 | Convener（仅限已接受范围） | 可提出顺序建议，但不能派发 | 派发 ≠ 授权；编排不能变成新的授权源 |
| 接受/拒绝执行结果 | 客户 | Convener 汇总证据、Rapporteur 转述 | 验收不是流程动作 |
| 写 `.ans` / pin / 治理边界 / manifest | 应用（客户发起的 establish/reaccept） | 只读 | 治理记录是授权证据，不能由被治理者改写 |
| 判断 shell 是否放行 | 客户（或既有「替我审」judge 的 shell 例外） | Convener 可只读核查 | 治理决定不得复用 judge 的 shell 例外 |

### 1.5 为什么三者合起来仍不构成最终批准权

这不是一句道德约束，而是四条结构性事实：

1. **三项权力都只能产出「候选物」**。提案是「请客户决定」的请求；提名是「请客户任命」的名单；流程单是「按已批准方案排步骤」的计划。三者都不包含「接受」这个动作。
2. **接受原语在应用侧，不在角色侧。** 现有机制已经如此：
   - 角色卡/边界写入必须经 `request_confirmation` 拿到 `confirmed:true`，由确认发行器把路径发行进 writeSet（`src/pipeline/orchestration/run-role.ts` 的确认制 gate 与 `common/编排/confirmed-writes.ts`）；
   - `.ans`、治理边界文档、manifest 由应用侧 `finalize.ts` 的 establish/reaccept 写出，并经 `boundary-core.ts::verifyPins` 校验（`src/common/编排/finalize.ts`、`src/common/门禁引擎/boundary-core.ts`）；
   - 派发只负责路由，既有口径明确「**派发 ≠ 授权**」（`BUILT_IN_ROLE_CARD_TEXT` 原文；`routeDispatch` 只投递、不发行写权）；
   - `propose_recovery` 只能提议，执行与否由客户一键确认（`run-role.ts` 的能力注释）；
   - risky/review/deny shell 必须客户逐条批准（su 审批档；项目角色三层链）。
3. **文档自称不算数。** 任何角色都可以在自己的 Markdown 里写 `status: accepted`，但门禁、派发、任命、治理记录**只认应用签发的决定事件**。这条要写进实现：UI 读决定账本，不读 Markdown 状态；门禁不解析提案/提名文件的 `status`。
4. **即使一个人同时掌握三权，也仍然不能替客户批准。** 三权分立是「防越权的第二道锁」，不是批准权的来源；批准权的唯一来源是客户在应用里的显式决定。三权分立的真正价值是：让「谁提的、谁提的名、谁排的程、客户批了什么」在结构上可分辨、可审计、可追责。

## 二、协作协议

### 2.1 四个候选物 + 一个决定账本

| 名称 | 作者 | 位置 | 作用 |
| --- | --- | --- | --- |
| 提案 proposal | Rapporteur | `docs/proposals/<flowId>-vN.md` | 说明做什么、为什么、怎么验收 |
| 契约 contract | Rapporteur | `docs/contracts/<name>-vN.md` | 冻结跨角色接口/交接物（版本化） |
| 提名 nomination | Nominator | `docs/nominations/<flowId>-vN.md` | 说明用谁、给什么边界、备选是什么 |
| 流程 flow | Convener | `docs/flows/<flowId>.md` | 步骤、依赖、状态、阻塞、下一步 |
| 决定 decision | **应用** | 决定账本（§5.5） | 客户接受了什么、拒绝了什么、何时、依据哪份文件 |

所有候选物都带 `flowId`；同一 flow 的同一类候选物只有一个**当前版本**，旧版本标 `superseded`，不删除。

### 2.2 一次需求从进入到交付

```
客户 → Rapporteur（理解意图）
        ↓ 提案草案 / 澄清
     客户决定①：接受提案（或退回修改）
        ↓
     Convener 开流程单（步骤、角色、依赖、完成口令）
        ↓
     Convener 把「提名」步骤交给 Nominator
        ↓
     Nominator 读提案 + 枚举角色 → 提名名单
        ↓
     客户决定②：任命（确认卡逐条列角色卡/边界路径）
        ↓
     Nominator 写角色卡/边界（仅确认路径）
        ↓
     Convener 派发第一项执行任务（引用提案/契约/流程单）
        ↓
     项目角色执行 → 回交
        ↓
     Convener 更新流程单（完成/阻塞/下一步）
        ↓
     Rapporteur 汇总证据 → 客户决定③：验收/退回
        ↓
     流程关闭，或按反馈开新版本
```

**关键约束**：
- **没有客户决定①，不进入提名**；没有客户决定②，不写角色卡；没有已接受提案 + 已接受提名，Convener 不派发。
- 每个决定都对应应用账本中的一条记录；卡上显示 `flowId`、权力类型（提案/提名/编排）、将写路径、哈希或摘要。
- 同一 flow 同一时刻**只允许一个待客户决定**（其他请求排队并在流程单显示「等待前一个决定」），防止三张卡同时抢客户注意力。
- 客户可以随时打开 Nominator/Convener 直接对话；但**直接对话不改变权力边界**：Nominator 仍不能未确认就写角色卡，Convener 仍不能派发未批准的任务。

### 2.3 客户快捷路径（避免仪式化）

客户显式说「直接让开发者改 X」「就用现有测试角色，别再提一轮」时，客户本人就是提案者与批准者，允许走快捷路径：

- 记录来源为 `customer-direct`（账本字段），把客户原话摘要、目标、涉及路径写入 flow；
- 若涉及创建新角色/改边界，仍必须出一张**逐路径确认卡**（任命是治理行为，快捷路径不能省掉边界确认）；
- 若不涉及新角色/边界，Convener 可以直接建步骤并派发，但步骤仍须引用客户指令摘要与验收口径；
- 快捷路径不产生「角色自动批准」：所有决定仍记在客户名下。

### 2.4 异常与分歧

| 情形 | 处理 | 升级条件 |
| --- | --- | --- |
| 提案目标不清 / 客户需求自相矛盾 | Rapporteur 写澄清问题，提案保持 `draft`，不进入提名 | 两轮澄清仍无法收敛 → 请客户裁决 |
| 提案不可行 / 与现有边界冲突 | Convener 在流程单标 `blocked` 并附证据，退回 Rapporteur | Rapporteur 出一版修订；同一问题第二次退回 → 客户裁决 |
| 没有合适角色 | Nominator 出 `nomination-declined`，列「复用/新建/拆分/合并/停止」选项 | 客户决定是否新建角色；不得自行创建 |
| Nominator 与 Rapporteur 对范围/角色有分歧 | 各自保留自己的候选物；不互相改写 | 客户在两张候选物之间裁决 |
| 项目角色拒绝任务 / 回交 `blocked` | Convener 在流程单记录；可在**已接受提名名单内**改派 | 名单外改派/新增角色 → 回 Nominator + 客户 |
| Convener 发现越权派发请求 | 门禁拒绝并记账；Convener 在流程单标 `blocked` | 客户决定是否补提案/补提名 |
| 客户长时间不决定 | 流程单显示 `waiting-customer`；Convener 只提醒，不自动推进 | 客户明确授权前，任何角色不得视为默认同意 |
| 客户中途改主意 | 新提案版本；引用旧版本的契约/提名/步骤标 `superseded`；只重做受影响步骤 | 影响范围由 Rapporteur 在提案中列明，客户确认 |
| 角色会话卡死 | Convener 用 `role_status`/`session_tail` 核查，必要时 `propose_recovery` | 执行由客户确认；不得自动停止/重建 |

### 2.5 防止三权空转/循环

V1 用**机械规则**而不是口号来防：

1. **一个步骤一个主人**：流程单每个步骤必须有且只有一个负责角色；没有主人的步骤不得进入 `in-progress`。
2. **一个步骤最多退回一次**：同一版本的同一步骤第二次 `returned` → 自动标记 `escalated-to-customer`，三人停止互相转交。
3. **一个提案最多一次修订**：Rapporteur 对同一 flow 的提案最多出到 `v2`；再改必须由客户明确要求或开新 flow。
4. **一个 flow 一个当前版本**：提案/提名/流程单都只认当前版本；旧版本保留只读，不参与派发与 UI 主视图。
5. **派发唯一键**：沿用现有 `roleId\0task\0reason` 队列期去重，并新增 `flowId + stepId` 唯一性；同一 flow 步骤不能重复派发，除非流程单出新版本。
6. **禁止自循环**：同一角色不能同时是某候选物的作者与接受者；三人之间不能互相「批准」对方的候选物。
7. **无进展熔断**：flow 连续 N 小时（V1 建议 24h）无状态变化且无客户动作 → Convener 只报 `paused/blocked`，不自动催办、不自动换人。
8. **治理角色不增殖**：三人是固定的内置角色；任何流程都不得创建第四个治理角色，也不得把项目角色提升为治理角色。

## 三、会话模型

### 3.1 客户默认和谁对话

**Rapporteur 是主入口、默认对话者。** 理由：客户的需求首先需要被理解、澄清、形成方案；提名与编排是下游程序动作，不应成为客户的日常入口。左树主位、空态 CTA、默认选中都指向 Rapporteur（经 `primaryRoleId` 数据驱动，不硬编码）。

### 3.2 三人是否都能被客户直接打开

**V1 推荐：三人都可被客户直接打开，但默认只主推 Rapporteur。**
- Nominator/Convener 的会话是「可检查、可纠偏、可下达客户快捷指令」的入口，不是隐藏后台。
- 直接打开不等于绕过协议：它们的写盘仍受各自边界与客户确认约束；Convener 的派发仍要求已接受提案/提名/流程步骤。
- 客户从 Rapporteur 的提案/流程链接可以一键跳到对应角色会话；返回时保留原会话。

### 3.3 三者是否共享上下文

**V1 推荐：不共享模型上下文，通过文档与投递消息交接。**
- 每个角色独立会话、独立上下文；交接物是项目内文件（提案/提名/流程/契约）和带路径的投递消息。
- 交接消息应带「路径 + 摘要 + 由应用计算的 sha256/版本」，与 G-1「先落盘再派发」一致；不让模型手算哈希。
- 会话重建后，角色通过重新读取候选物恢复上下文；不依赖隐藏的共享内存。
- 好处：可审计、可复现、上下文不漂移、一个角色重建不拖垮其他角色。
- 代价：跨角色沟通有落盘成本；V1 用固定模板与轻量摘要控制成本。

### 3.4 报告与回交去哪

- 项目角色的回交（handback）默认投给 **Convener**（流程主人），用于推进步骤；
- 同时**镜像到 Rapporteur 的聊天流**（沿用现有「来自 <role> 的报告」镜像先例，`app/renderer/renderer.js` 已有该呈现），让客户在默认入口看到进展；
- 客户验收仍由 Rapporteur 汇总并请客户决定；Convener 不能替客户验收。
- 若项目仍处于旧 su 模型，回交仍投 su（兼容模式，见 §六）。

### 3.5 V1 会话推荐

- 一个引擎：扩展 `openGovernanceSession`，用 `governanceRoleId` / 新增 `governanceFunction` 选择三人之一；不新建第二套治理会话引擎。
- 三个内置会话共用同一 runtime 选择与同一项目配置；不要求每角色不同模型。
- 不自动让三者互相聊天；应用按流程单一次只推进一步，客户可见每一步。

## 四、与项目角色的关系

### 4.1 三人是内置角色还是项目角色

**V1 推荐：三人都是内置角色（built-in governance roles），定义随应用发布，不依赖项目文件。**

理由：
1. **空项目悖论**：项目角色需要被创建，而创建角色的治理角色必须在空项目里已经存在；若三人是项目角色，空项目没有角色能创建它们。
2. **权限稳定性**：治理角色的边界不应由项目内可改文件定义，否则项目角色可以改治理者边界，形成自授权。
3. **与现状一致**：su 现在就是内置角色（`BUILT_IN_GOVERNANCE_ROLE_ID = "su"`，`boundary-core.ts`），三人是把单内置扩展为内置注册表，不是引入新概念。
4. **迁移可控**：内置角色可以按应用版本发布，旧项目按 `governanceModel` 选择单人或三人模型。

诚实说明：内置角色定义在代码/技能文本里，**pin 只钉项目内文件（治理边界文档 + 项目角色边界），不钉应用代码**；因此需要在 `.ans`/manifest 记录治理模型版本（如 `governanceModel: "trio@1"`），并对内置角色 id 做启动校验。这是与 su 相同的信任级别，不是新增风险，但必须如实写进文档与 UI 说明。

### 4.2 现有项目角色如何被提名、创建

1. Nominator 通过 `listProject` 枚举项目角色（只读），读取角色卡与边界，判断复用/新建/拆分/合并。
2. Nominator 在 `docs/nominations/<flowId>-v1.md` 写明候选与边界差异；**不直接写角色卡**。
3. 客户对提名名单作出任命决定；确认卡逐条列出 `角色卡/<id>/role-card.md`、`角色卡/<id>/boundary.yaml` 等将写路径。
4. 客户确认后，Nominator 写角色卡/边界（沿现有 `request_confirmation` + confirmed-writes 机制；`run-role.ts` 的确认制 gate 不放松）。
5. 应用自动收尾/重 pin（沿用 `finalize.ts` 的既有路径），把新角色边界纳入 pin；新角色随即可被 Convener 派发。
6. 若客户选择新建角色，Nominator 仍只是提名人；**角色卡内容与边界由 Nominator 在客户确认后写**，不是由客户手写，也不是由 Rapporteur/Convener 代写。

### 4.3 与 `openRoleSession` / dispatch 的关系

- `openRoleSession` 继续服务项目角色，行为不变；三人经 `openGovernanceSession` 走同一底层入口（现状即如此）。
- `dispatch_task` 仍由应用投递机执行（`app/desktop/session.ts::routeDispatch`），不新建第二套队列；变化只有两点：
  1. 工具只注入给 **Convener**，不再注入给所有内置治理角色；
  2. 派发增加流程上下文校验（`flowId`/`stepId` + 已接受提案/提名），不满足则拒投并如实回执。
- 现有 `routeDispatch` 已拒绝 `builtIn === true` 的目标；扩展到三人后继续保持：**三人不是派发目标**，派发对象只能是项目角色。
- 回交路由从「投给主入口 su」改为「投给 Convener + 镜像 Rapporteur」；旧模型仍投 su。

### 4.4 能力矩阵（V1 推荐）

| 能力 | Rapporteur | Nominator | Convener | 说明 |
| --- | --- | --- | --- | --- |
| 客户确认通道 `customerInput` | 是 | 是 | 是 | 三人各自的写盘/决定请求都经客户卡；客户仍是最终批准者 |
| `dispatch_task` | 否 | 否 | **是** | 只有编排权能派发；且仅限已接受范围 |
| `role_status` / `session_tail` | 否 | 否 | **是** | 只读看护归流程主人 |
| `propose_recovery` | 否 | 否 | **是** | 只能提议，执行由客户确认 |
| `install_skill` / `install_mcp` | 否 | **是** | 否 | 团队能力装配属提名权；沿用「仅客户明示时安装」 |
| `run_shell` | 否 | 否 | 仅只读档（V1 推荐） | 三人都不接 su 的 risky/deny 审批档；执行类 shell 留给项目角色三层链 |
| 回交接收 | 镜像查看 | 否 | **是** | Convener 推进流程，Rapporteur 面向客户 |
| 自动重 pin / finalize | 否 | 否 | 否（应用行为） | 治理记录始终由应用写，不是角色能力 |

## 五、权限与治理记录

### 5.1 路径级写权矩阵

图例：**预授权** = 会话初始 writeSet 内、无需逐次确认；**确认后** = 必须 `request_confirmation` 逐路径列明并 `confirmed:true`；**禁写** = 边界拒绝；**只读** = 可读不可写；**应用** = 只由应用侧写，角色不可写。

| 路径 | Rapporteur | Nominator | Convener | 项目角色 | 应用 |
| --- | --- | --- | --- | --- | --- |
| `docs/proposals/**` | **预授权** | 只读 | 只读 | 只读 | 只读 |
| `docs/contracts/**` | **预授权** | 只读 | 只读 | 只读 | 只读 |
| `docs/nominations/**` | 只读 | **预授权** | 只读 | 只读 | 只读 |
| `docs/flows/**` | 只读 | 只读 | **预授权** | 只读 | 只读 |
| `docs/workflow.md` | 只读 | 只读 | **预授权**（文件级） | 只读 | 只读 |
| `docs/skills/**` | 只读 | **预授权** | 只读 | 只读 | 只读 |
| `docs/mcp/**` | 只读 | **预授权** | 只读 | 只读 | 只读 |
| `docs/governance/rapporteur/**` | **预授权** | 只读 | 只读 | 只读 | 只读 |
| `docs/governance/nominator/**` | 只读 | **预授权** | 只读 | 只读 | 只读 |
| `docs/governance/convener/**` | 只读 | 只读 | **预授权** | 只读 | 只读 |
| `角色卡/<id>/role-card.md` | 禁写 | **确认后** | 禁写 | 只读 | 只读 |
| `角色卡/<id>/boundary.yaml` | 禁写 | **确认后** | 禁写 | 只读 | 只读 |
| `角色卡/governance-boundary.yaml` | 禁写 | 禁写 | 禁写 | 禁写 | **应用** |
| `.ans/**` | 禁写 | 禁写 | 禁写 | 禁写 | **应用** |
| `docs/bootstrap-manifest.md` | 禁写 | 禁写 | 禁写 | 禁写 | **应用** |
| `docs/audit/**` | 只读 | 只读 | 只读 | 只读 | **应用追加** |
| `temp/<role>/**` | 自己的草稿区 | 自己的草稿区 | 自己的草稿区 | 自己的草稿区 | — |
| `app/**`、`src/**`、`test/**` | 禁写 | 禁写 | 禁写 | 按各自边界 | — |

**关键点**：
- 三人都不写 `.ans`、治理边界文档、manifest；治理记录永远由应用在客户发起的 establish/reaccept 动作中写。
- Nominator 的 `角色卡/**` 写权不是预授权，而是**客户确认后的发行**；确认卡必须列出每个文件路径（不只是目录）。
- Convener 的 `docs/workflow.md` 是单文件，V1 需要文件级预授权或逐次确认；推荐文件级预授权，并在实现时把「文件级预授权」做成通用小机制（避免每次改工作流都弹卡）。
- `docs/audit/**` 只由应用追加；角色只能读，防止「自己写审计洗白」。

### 5.2 内置角色边界的实现建议

现状是**单 id + 单卡文本 + 单边界**：
- `src/common/门禁引擎/boundary-core.ts`：`BUILT_IN_GOVERNANCE_ROLE_ID = "su"`、`BUILT_IN_ROLE_CARD_TEXT`、`builtInBoundarySection()`；
- `src/service/role/resolve-role.ts`：`resolveRole` 对不在 `project.roles` 的角色下沉为 `built-in-governance`；`listProject` 把 su 放首位并返回 `primaryRoleId = su`；
- `src/pipeline/orchestration/govern-session.ts`：`discoverGovernanceRoleId` 找唯一 `builtIn`；`withGovernanceRole` 只并一个 id；
- `app/desktop/session.ts`：多处 `role.builtIn === true` 决定是否注入客户通道/派发/看护/安装/审批档。

V1 建议把这些收敛为**内置治理角色注册表**：

```
BUILT_IN_GOVERNANCE_ROLES = [
  { id: "rapporteur", display: "Rapporteur 报告员", function: "proposal",
    cardText, boundaryEntries, preauthorizedDirs: ["docs/proposals", "docs/contracts", "docs/governance/rapporteur"],
    capabilities: ["customerInput"] },
  { id: "nominator", display: "Nominator 提名官", function: "nomination",
    cardText, boundaryEntries, preauthorizedDirs: ["docs/nominations", "docs/skills", "docs/mcp", "docs/governance/nominator"],
    capabilities: ["customerInput", "installSkill", "installMcp"] },
  { id: "convener", display: "Convener 召集人", function: "schedule",
    cardText, boundaryEntries, preauthorizedDirs: ["docs/flows", "docs/workflow.md", "docs/governance/convener"],
    capabilities: ["customerInput", "dispatchTask", "roleStatus", "sessionTail", "proposeRecovery", "shellReadonly"] },
]
```

- `resolveBoundarySection` 对内置角色返回**该角色的条目集 + 项目治理记录里的 acceptance**；空项目创世仍走 `buildGovernanceSeedBoundaryForGate`，但按角色裁剪（不是三人都拿 `角色卡/`+`docs/`+`.ans/` 全量）。
- `listProject` 返回三条内置记录，`primaryRoleId` 为 `rapporteur`；`hasRoles` 仍只统计项目角色。
- `resolveRole` 的 `kind` 仍可为 `built-in-governance`，新增 `governanceFunction` 字段；渲染侧按 function 分组/标注。
- `openGovernanceSession` 用 `governanceRoleId`（已有入参）或新增 `governanceFunction` 选择；`withGovernanceRole` 并入三人的 id，`builtInRoles` 成为三元素数组。
- `run-role.ts` / `app/desktop/session.ts` 的 `suppressHandback` 布尔不能再代表所有能力；改为按 `governanceFunction` 查能力矩阵。`suppressHandback` 仍可表示「三人都自我不回交」。

### 5.3 治理记录与 pin 的归属

- `.ans/project.json` 仍是**应用独占**的授权证据；三人只读。
- V1 建议在 `.ans` 增加（或由应用派生）：
  - `governanceModel: "single" | "trio"`（缺省/缺失 = `single`，兼容旧项目）；
  - `governanceRoles: { rapporteur, nominator, convener }` 或 `governanceRoleIds: string[]`；
  - `primaryRoleId: "rapporteur"`（三模型）。
- pin 集合不变：`角色卡/governance-boundary.yaml` + 每个项目角色的 `boundary.yaml`（沿用 `finalize.ts` 的 scanRoles/precheck）。内置角色定义不在 pin 内；用 `governanceModel` 版本与内置 id 校验补足诚实说明。
- `establishGovernanceRecord` / `reacceptGovernancePins` 仍是唯一治理记录写入口；新项目建立时写 `trio`，旧项目保持 `single` 直到显式迁移。
- 三人都不参与「接受自己的提名/提案」；任命/提案接受由客户决定，应用记账。

### 5.4 F6 / 写门禁如何按角色区分

- 每个内置角色有独立的 `BoundarySection1` 条目集；`resolveWrite` 仍复用同一个判定链（F4 精确 writeSet、F6 接受/pin、F7 真实路径逃逸），不为三人写第二套门禁。
- 预授权目录只是「初始 writeSet 的一部分」，仍然要过边界条目与 F6 接受；不能因为有预授权就写边界外路径（沿 `run-role.ts::SU_PREAUTHORIZED_WRITE_DIRS` 的既有口径）。
- 角色卡/边界写入必须过确认发行器；确认卡上的路径逐条列出，未列出的路径写不进去（现有机制，不放宽）。
- 拒绝文案要指路：例如「该路径属提名权范畴，须由 Nominator 在客户确认后写入」「治理记录只能由应用在客户发起时写入」，避免角色反复撞墙或绕路。
- `角色卡/` 的写权限只给 Nominator 且仅确认后；`docs/` 按 §5.1 子目录切分，不再给任何治理角色整棵 `docs/` 的预授权。

### 5.5 审计：谁提的案、谁提的名、谁排的程、客户批了什么

新增**应用独占**的决定/事务账本（建议 `docs/audit/governance.jsonl`，append-only；与既有 `docs/audit/shell-gate.jsonl` 并列，不混用）：

每条至少包含：

```
at, kind, flowId, stepId?, actorRoleId, power（proposal|nomination|schedule|app|customer）,
artifactId/path, artifactVersion, artifactSha256?,
targetRoleId?, proposalPath?, nominationPath?, flowPath?,
customerDecision（accepted|rejected|changes-requested|timeout|none）,
decisionEvidence（确认卡 id / 会话 id / establish 或 reaccept 回执）,
messageSummary, runtime, sessionId
```

事件类型建议：`proposal.created`、`proposal.decided`、`nomination.created`、`nomination.decided`、`appointment.written`、`flow.opened`、`step.dispatched`、`step.blocked`、`step.done`、`handback.received`、`recovery.proposed`、`recovery.decided`、`governance.migrated`。

- 账本由应用写，三人只读；角色文档里的 `status` 不作为权威。
- UI 的「谁提的/谁提的名/谁排的程/客户批了什么」直接读账本，不靠角色自述。
- 既有 shell 审计保留；一条 flow 可以引用 shell 审批事件，但 shell 审批不等于提案/任命/验收。

## 六、兼容与迁移

### 6.1 现状事实（不另起结论）

- 当前 `su` 是唯一内置治理角色：`boundary-core.ts` 的 `BUILT_IN_GOVERNANCE_ROLE_ID`、`BUILT_IN_ROLE_CARD_TEXT`；
- `listProject` 固定把 su 放首位并返回 `primaryRoleId = su`（`resolve-role.ts`）；
- `openGovernanceSession` 只发现一个内置治理角色（`govern-session.ts::discoverGovernanceRoleId`）；
- `.ans/project.json` 的治理记录、pin、治理边界都围绕这一个角色；
- 桌面左树「主入口」、治理记录建立/重新接受、su 命令审批档都按 su 设计。

### 6.2 旧项目：默认兼容模式，不强制迁移

**V1 推荐**：
- `.ans` 无 `governanceModel` 或值为 `single` → 进入**旧治理模型**：仍只有 su 一个内置治理角色，行为与今天完全一致（审批档、`docs/su` 预授权、派发、看护都不变）。
- 左树显示一条非模态提示：「本项目使用旧治理模型（su）。可升级为三权模型。」，并给出「查看差异 / 升级」入口。
- **不自动把 su 改为只读**：强制只读会打断现有项目；客户未同意前不改变现有能力。
- 旧项目的历史会话、`docs/su/**`、`.ans`、pin 全部保留可读。

### 6.3 显式迁移（客户发起，一次性）

入口放在 su 的状态行/空态，沿用现有治理记录的「非模态预览 → 确认」模式（与 `previewGovernanceRecord` / `establishGovernanceRecord` / `previewGovernanceReacceptance` / `reacceptGovernancePins` 同构）：

1. **预览（零写入）**：显示旧模型/新模型、三个角色 id、将写入的 `.ans` 字段、manifest 追加内容、pin 是否变化、历史文档保留范围、回滚方式。
2. **确认**：客户明确确认后，应用写：
   - `.ans/project.json`：`governanceModel: "trio"`、`governanceRoles`/`primaryRoleId`；
   - `docs/bootstrap-manifest.md`：追加一条「治理模型升级（su → trio）」记录（时间、旧/新角色、变更文件、哈希）；
   - 必要时更新 pin（若未改治理边界/角色边界，pin 不变；若变了，走既有 reaccept 复核，不静默）。
3. **su 退役方式**：升级后 su 从主入口与角色树隐藏，标为**归档只读**；不禁用历史、不删 `docs/su/**`。**不创建 `角色卡/su/` 目录**（沿用现有红线：该目录会被角色枚举误判）。
4. **回滚**：V1 至少保留迁移前的 `.ans` 快照与 manifest 记录；是否提供一键回滚为开放问题。

**迁移不重写**：
- 不重写项目角色卡/边界（pin 不受影响）；
- 不重写 `docs/workflow.md`、`docs/contracts/**`（G-1 产物保留；新流程单另建 `docs/flows/`）；
- 不删除旧会话；旧 su 会话保留可读。

### 6.4 新项目：从零就是三人

- 空项目导入后，`listProject` 返回三条内置治理角色，`primaryRoleId = rapporteur`；`hasRoles:false` 仍表示「尚无项目角色」。
- 空态 CTA 从「开始与 su 对话」变为「开始与 Rapporteur 对话」；治理记录建立/重新接受入口仍在 Rapporteur 空态。
- 首次建立的 `.ans` 写 `governanceModel: "trio"`；三人不写角色卡（内置），项目角色由后续提名创建。
- 创世种子边界按角色裁剪：Rapporteur 拿提案/契约目录，Nominator 拿提名/技能/MCP 目录，Convener 拿流程/工作流目录；不再让三人共享整棵 `docs/`+`角色卡/`+`.ans/` 的写权。

### 6.5 与「替我审」judge、审批卡共存

- `docs/design/2026-10-17_design_shell-auto-approve.md` 的 judge 仍只处理 **shell 放行**，是独立的只读判断 agent；它**不参与**提案接受、任命、验收、治理记录。
- 三人的客户确认卡与 judge 的 shell 结果行是两种面：卡上必须写明「治理决定 · 客户最终批准」，judge 侧写明「shell 放行 · 非治理决定」。
- 客户仍是最终批准者：judge 的 D1–D5 例外不扩展到治理决定；任何角色不得把 judge 的 allow 当成提案/任命/验收的批准。
- 旧 su 模型下 judge/审批卡行为不变；trio 下 V1 不给三人 risky/deny 审批档（见 §4.4），减少「治理角色兼执行批准」的混淆。

## 七、入口与 UI

### 7.1 左树

V1 推荐三组：

1. **主入口**：Rapporteur（沿用现有主入口区域框与默认选中）；
2. **治理职能（内置）**：Nominator、Convener；
3. **其他角色**：项目角色，沿用现有 `group`/`groupDuty` 分组。

每行显示：
- 中文名 + 英文名（如「报告员 Rapporteur」）；
- 一行权力说明：「提案权 · 不拥有最终批准权」「提名权 · 不拥有最终批准权」「编排权 · 不拥有最终批准权」；
- 内置标识：「内置角色：随应用发布，无角色目录」。

不新增独立「权限说明」模态；说明放在行副标题 + 角色卡（`docs/governance/<role>/` 或内置卡文本）+ 提案/流程文档链接里。

### 7.2 是否需要「提案」「提名」「流程」面板

**V1 最小 UI：不做三个独立面板。**
- 提案/提名/流程都是 Markdown 文件，复用现有文档预览/资料入口打开；
- 每个角色的空态/状态行提供「当前提案 / 当前提名 / 当前流程」链接（若有）；
- 确认卡显示：`flowId`、权力类型、将写路径、摘要/哈希、接受/退回/要求修改；
- 状态行显示：`等待客户决定`、`进行中`、`阻塞`、`已升级客户`（从决定账本/流程单派生，不读角色自述）。

**V2 候选**：一个只读「流程」侧栏，按 `flowId` 展示步骤、负责人、状态、待客户决定；V1 不承诺。

### 7.3 空态与治理记录

- Rapporteur 空态保留「建立治理记录 / 检查并重新接受」入口（现有 I3/I4 位置与谓词沿用，`ui-labels.js::governanceActionFor` 单一谓词）；
- Nominator 空态说明「通常由流程单提名步骤打开；仅在客户明确要求时直接使用」；
- Convener 空态说明「通常由已接受提案开启流程；只负责排步骤与派发，不批准方案」；
- 旧项目显示迁移提示条；迁移预览复用现有非模态面板位置。

### 7.4 文案纪律

- 不用「已授权」「已批准」描述提名/派发/流程推进；用「已受理」「已派发」「等待客户决定」；
- 不把「推荐」写成「决定」；
- 所有角色状态都由应用事实派生：会话状态、队列、决定账本、流程单；不读 Markdown 自述。

## 八、验收口径（可测量）

以下每条都应在实现后由测试/真机证据判定，而不是靠文案自述：

1. **新项目默认**：`listProject` 恰返回 3 个 `builtIn === true` 的角色；`primaryRoleId === "rapporteur"`；左树出现「主入口 / 治理职能」两组；CTA 打开 Rapporteur。
2. **三人可开**：客户可分别打开三人会话；默认只选中 Rapporteur；直接打开 Nominator/Convener 不改变其权限约束。
3. **写权矩阵**：Rapporteur 写 `角色卡/**` 被拒；Nominator 未确认写 `角色卡/**` 被拒；Convener 写 `角色卡/**`、`.ans/**` 被拒；三人写 `.ans/**`、治理边界、manifest 全部被拒；拒绝文案给出正确归属角色。测试覆盖至少 3 个角色的边界求值。
4. **提案门禁**：没有客户接受记录的提案 → 不能进入提名/派发；提案文件里写 `status: accepted` 不改变门禁判定。
5. **任命门禁**：没有客户任命令 → Nominator 不能写任何 `角色卡/**`；确认卡未列出的路径写不进去。
6. **派发门禁**：没有已接受提案 + 已接受提名 + 流程步骤 → `dispatch_task` 拒投；目标为三人之一 → 拒投；同一 `flowId+stepId` 重复派发被去重；每次成功派发在账本有 `step.dispatched`。
7. **回交路由**：项目角色回交进 Convener 并在 Rapporteur 聊天流镜像；旧 su 项目仍进 su。
8. **一次一个待决定**：同一 flow 同时只允许一个待客户决定；第二张卡排队并在流程单可见。
9. **审计可还原**：给定一个完整 flow，能从 `docs/audit/governance.jsonl` 还原「谁提的案、谁提的名、谁排的程、客户批了什么」；每个候选物有作者与版本。
10. **迁移**：旧项目默认进入兼容模式且行为不变；迁移预览零写入；确认后 `.ans` 有 `governanceModel: "trio"`、manifest 有升级记录；旧角色卡/边界/pin/历史会话保留；su 隐藏且不可再开治理会话（或按最终裁定保留只读）。
11. **UI 最小面**：无三个新面板；主入口/治理职能分组、权力副标题、等待客户决定状态行、迁移提示条可见；现有治理记录入口仍可用。
12. **全量回归**：实现侧须跑 `node --test "test/**/*.test.ts"`（三层 glob，不能漏测）；不跑真实模型/凭据/`.env`。

## 九、风险

| 风险 | 表现 | 缓解 |
| --- | --- | --- |
| **三权空转** | 提案→提名→流程→退回循环，客户看不到进展 | §2.5 的步骤单主人、最多退回一次、提案最多 v2、无进展熔断；流程单强制显示下一步 |
| **提案无主** | 客户说了需求，没人写提案；或提案质量差无法验收 | Rapporteur 是主入口与唯一提案作者；提案必须有验收口径与需要的决定；空态直接引导 |
| **提名越权** | Nominator 自行写角色卡/扩边界 | 提名≠任命；角色卡仅在客户确认后写；确认卡逐路径；边界 diff 必须展示 |
| **编排越权** | Convener 派发未批准任务/给三人派活/自行改需求 | 派发门禁（提案+提名+步骤）；目标 builtIn 拒绝；流程图/账本留痕；越权拒投 |
| **审批旁路** | 角色在 Markdown 自称 accepted，或把 judge 的 allow 当治理批准 | 门禁只认应用决定账本；judge 仅 shell；卡上标明治理决定 |
| **迁移丢记录** | 升级时丢 `.ans`/pin/历史 | 显式迁移、预览零写入、manifest 追加、保留旧文件；pin 不变则不重算；回滚待定 |
| **成本/延迟** | 三个会话、多次落盘，简单任务也要三轮 | 客户快捷路径；V1 不自动让三人互聊；一次只推进一步；提案/提名模板化；简单任务可直接由客户指令派发 |
| **客户认知负担** | 三个角色、三种权力、多张卡 | 默认只面对 Rapporteur；权力副标题；同 flow 一次只一张决定卡；旧项目提示条 |
| **内置边界漂移** | 代码里的三人边界变化，pin 不覆盖 | 记录 `governanceModel` 版本；启动校验角色 id/能力矩阵；文档如实说明 pin 不钉代码 |
| **能力误配** | 派发/安装/看护给错角色 | §4.4 能力矩阵 + 单一注册表；测试按角色逐项断言 |
| **旧项目长期不迁移** | 两套模型并存，文档/UI 分叉 | 兼容模式只维持 su 行为，不新增 trio 能力；迁移入口常驻；是否强制迁移由客户定 |

## 十、文件归属建议

| 归属 | 需要改/新增的内容（建议，不构成实施授权） |
| --- | --- |
| **门禁引擎** | 内置治理角色注册表（`boundary-core.ts` 的 id/卡文本/边界从单值扩为三值）；`resolveBoundarySection` 按角色返回条目；`listProject` 返回三条内置与 `primaryRoleId = rapporteur`；`resolveRole` 增加 `governanceFunction`；pin/acceptance 口径不变 |
| **编排** | `openGovernanceSession` 支持按 function 打开；`withGovernanceRole` 并入三人；能力矩阵替代 `suppressHandback` 单布尔；流程门禁（提案/提名/流程步骤校验）；回交路由到 Convener + 镜像 Rapporteur；确认发行与 `docs/` 子目录预授权；迁移/收尾调用 |
| **运行时核心** | `DispatchTaskPayload` 可选 `flowId`/`stepId`（或等价流程上下文）；`resolveRole`/能力类型扩展；三人的工具注册矩阵 |
| **桌面窗口** | `listProject` 映射三条内置；`role.builtIn` 注入条件改为按 function；`routeDispatch` 增加流程门禁与 builtIn 三人拒绝；`suRoleIdOf` 改为主入口/Convener/flow owner 数据驱动；迁移预览与写入；旧模型检测 |
| **桌面UI** | 左树三组与权力副标题；CTA 用 `primaryRoleId`；空态/状态行链接；一次一个待决定；迁移提示条；确认卡字段；不新增三个面板 |
| **测试** | 门禁按角色写权矩阵；协议门禁（提案/任命/派发）；迁移；审计还原；UI e2e；全量 `node --test "test/**/*.test.ts"` |

## 十一、最小 V1 交付定义

V1 只交付「能分辨三权、能阻止越权、能兼容旧项目」的最小闭环：

1. **三人内置 + Rapporteur 主入口**：注册表、`listProject`、`primaryRoleId`、左树分组、CTA。
2. **三份候选物 + 决定账本**：提案/提名/流程模板与目录；应用写 `docs/audit/governance.jsonl`；UI 读账本。
3. **三道门禁**：提案接受门、任命写入门、派发范围门；拒绝文案指路。
4. **能力矩阵**：Convener 独享派发/看护；Nominator 独享技能/MCP 安装；三人客户通道；三人不接 risky shell。
5. **兼容模式**：旧项目保持 su 行为，显示迁移提示；新项目写 `governanceModel: "trio"`。
6. **显式迁移**：预览 → 确认 → 写 `.ans` + manifest；su 隐藏/归档只读；历史保留。
7. **UI 最小面**：主入口/治理职能分组、权力副标题、等待客户决定、迁移提示；不做三个新面板。
8. **验收**：§八 1–12；全量测试三层 glob。

**不在 V1**：自动让三人互相聊天、自动推进流程、独立提案/提名/流程面板、批量迁移工具、三人各自独立模型、judge 扩展到治理决定。

## 十二、待 PM / 客户拍板的开放问题

1. **三人是否都是内置角色？** 推荐：是（空项目悖论 + 权限稳定性 + 与 su 现状一致）。若客户希望三人是项目角色，需要先解决「谁在空项目里创建它们」。
2. **Rapporteur 是否唯一主入口？** 推荐：是；Nominator/Convener 可被直接打开，但默认只在流程需要时打开。
3. **提名权是否包含写角色卡/边界？** 推荐：提名本身不写；客户作出任命决定后，由 Nominator 按确认卡逐路径写入。是否改为「任命由应用写、Nominator 只提名」需客户裁定（后者更保守，但角色卡内容仍需有人写）。
4. **Convener 是否能直接派发？** 推荐：能，但仅限「已接受提案 + 已接受提名 + 流程步骤」；不得派给三人；不得派发范围外任务。是否允许客户快捷路径直接派发（客户指令即批准）需确认。
5. **旧 su 是否保留？** 推荐：旧项目默认保留 su 全功能兼容模式；显式迁移后 su 归档只读、隐藏、不删历史。是否允许长期双模型并存、是否提供一键回滚，需确认。
6. **是否三期分批？** 推荐：V1 = 三人内置 + 三候选物 + 三道门禁 + 能力矩阵 + 兼容/迁移 + 最小 UI；V2 = 流程面板/自动推进/批量迁移；V3 = 更细的权限策略与跨项目治理。客户是否接受分批需确认。
7. **契约归属**：`docs/contracts/**` 推荐归 Rapporteur（提案的冻结表达）；若客户认为契约应由 Convener 管，需调整 §5.1。
8. **技能/MCP 归属**：推荐归 Nominator（组队能力装配）；若客户希望 Convener 管，需调整能力矩阵。
9. **Convener 的 shell 面**：推荐只读档；是否允许 Convener 接 su 的 risky/deny 审批档（客户逐条批）需确认。
10. **审计账本位置/保留期**：推荐 `docs/audit/governance.jsonl`、append-only、V1 不轮转；是否并入既有 shell 审计或另设导出需确认。
11. **旧 su 的 `docs/su/**` 迁移后写权**：推荐只读保留；是否允许三人读取/引用、是否允许继续写需确认。
12. **迁移是否自动**：推荐仅新项目自动 trio，旧项目必须客户显式迁移；是否提供命令行/批量迁移需确认。

## 十三、明确声明

**本文件只是设计提案，未实施。** 它不构成对任何源码、测试、边界、`.ans`、UI 或治理记录的改动授权；实施须经项目管理评审，按门禁引擎/编排/运行时核心/桌面窗口/桌面UI/测试的角色边界拆发，并由客户对 §十二 的开放问题作出裁定。

引用的源码行号与行为均为写作时点工作树读数（含在飞修改），实施前须重新核对；本提案不声称已经过真机验证，也不声称三权模型已经在任何项目中生效。
