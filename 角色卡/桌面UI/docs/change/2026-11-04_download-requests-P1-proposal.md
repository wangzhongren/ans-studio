---
id: download-requests-desktop-ui-p1-proposal
type: change
title: 下载文件申请 P1 桌面UI实现提案（C2，proposal-only）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: proposal-only
related: [download-requests]
events:
  - date: "2026-11-04"
    kind: created
    summary: 写 C2 渲染层 proposal-only 实现提案（judge 结果行下载标签 / 指令面板 consumer「下载」与 G8 A 旧指令标注 / 复用既有 confirm 卡 / 测试计划）；未改产品代码/测试/样式
  - date: "2026-11-04"
    kind: revised
    summary: 按 P1 审核（340 行 / 503aaf34…）修订：F5 将 directive-store.ts 列为闸门 2 写集增补条件；F3 明确只消费 B1/C1 冻结的 epoch-aware 视图与降级显示；F17 frontmatter 改 proposal-only/[download-requests]；F8 逐字对齐 A2 冻结的 ui.directive.panel.consumer.* 与 ui.judge.mode.approval 复用；F16 补 project-rules 对照。未改产品/测试代码
  - date: "2026-11-04"
    kind: revised
    summary: 按 P1 复审 Revision 1（501 行 / 7f8a3ea5…）做非阻断编辑：删除/更正全部 downloadStartsNow 与 A2 key 编号过期引用，按 A2 最终 37 key（main 35 + ui 2；download/downloadLegacyOff）对齐；F5 addendum 已确认、F3 形状 A 三方同形、F8 对齐；frontmatter 保持 proposal-only。未改产品/测试代码
---

# 下载文件申请 P1 桌面UI实现提案（C2）

- **任务 / flowId / 档位**：`2026-11-04-download-requests` / `download-requests` / **T3**（团队计划 §1.2）。
- **角色 / 节点**：桌面UI（渲染层 `app/renderer/`）；团队计划 §5.1 **P1（实现提案）** 的 **C2（渲染消费）** 侧。
- **状态**：**`proposal-only, no code`**。只写本文件；未改产品/测试/样式/其他角色文档，未运行测试/typecheck/构建，未启动应用，未 commit/push，未接触客户。本提案经项目管理 P1 审核通过、且 C1 卡片/面板形状与 A2 key 集合冻结后才进入 C2 实施。
- **一句话**：渲染层只做三件事——把主进程已判定的 `cardKind:"download"` 结果行转写成 A2 冻结的 i18n 标签；在既有指令面板消费 `consumer:"download"` 与 G8 A 旧指令标注；复用既有 confirm 卡渲染下载卡。**不实现 IPC、不判 URL/路径、不调用判断器、不新增卡队列/判断器/账本，不做第二份 cardKind→分组映射。**

## 一、输入、基线与只读事实

### 1.1 基线与冻结输入（写本提案前实测）

| 项 | 值 | 说明 |
| --- | --- | --- |
| 分支 / HEAD | `feat/download-requests` / `c2f163087aaf11616e5be01f80d305bf6f25af57` | 与 B0 v2 认证基线一致 |
| 产品/测试区 | `git status --porcelain -- src app test` **为空**（写本提案前实测） | 本角色未改任何产品/测试文件 |
| B0 v2 | `角色卡/测试/docs/change/2026-11-04_download-requests-B0-baseline-v2.md` **239 行 / `73c660c6356ce0350a26e677d68081c2d03a738475bfad1836874b95224d2b36`** | T3 3665/3638/9/18；新增确定性失败 0、新增 skip 0 |
| 团队计划 | `docs/scheduling/2026-11-04_team-plan_download-requests.md` **693 行 / `d9760755e80aa95cd548fd994ca7a1f448321427002eddfe1957397de4efec8e`** | §4.1/§4.3 C2 写集、§5.3、§6.2 |
| 方案 P1.1 | `docs/planning/2026-11-04_design_download-requests.md` 全文 **1018 行 / `de838c26766e26c9bc2124240e253385e8b95a397e0ff663e98e2893e9cea832`**（正文 1017 行 / `2590b560…`，闸门 1 确认基线） | §3.1 Interface/Renderer、§8.3、§10 AC-3/14/19/27、§11 |
| 验收标准 V1 | `docs/acceptance/download-requests-criteria-v1.md` **1056 行 / `4a7c66ab51b5e1152407b57ce866056500933fb58480ba053c3a7e72c08f8d49`** | AC-3/14/19/27 与 §4.2/§4.6/§4.7 |
| PR #57/#58 披露 | `git diff --stat f394cfb..HEAD -- app/renderer/` **为空** | PR #57（指令自然语言）/PR #58（决策卡不被代选）均未触 `app/renderer/**` |

### 1.2 渲染层现状（只读核实；行号为 `c2f1630` 快照，实施以符号名为准）

- **judge 结果行**（`app/renderer/src/chat/judge.ts`）：
  - `judgeGroupLabel()`（`:22-34`）只把 `group` 映射为 `ui.judge.mode.approval` / `ui.judge.mode.decision`；`group` 由主进程载荷给出（下载卡在 `GOVERNANCE_CARD_GROUP` 中属 `approval`，A1 冻结）。
  - `governanceJudgeKindClass()`（`:819-827`）只识别 `proposal/acceptance/appointment/appointment-write`；其余（含 `download`）→ `"generic"`。
  - `governanceJudgeResultView()`（`:829-957`）的 headline 分支（`:862-890`）无 `download` 分支：`cardKind:"download"` 落入 `ui.judge.headline.autoApprovedWithKind`，会把**原始协议 token**（`{cardKind}` = `"download"`）嵌进用户可见行。`requestTitle`/`engineText`/`operatorText`/`details` 与既有卡种同路径。
- **confirm 卡渲染**（`app/renderer/src/chat/decision-dialog.ts` + `DecisionDialog.tsx`）：
  - `decisionView()`（`:135-180`）对任意 `request.kind !== "choice"` 一律按 `confirm` 呈现（`:137-138`）；`answerable = kind === "confirm" || options.length > 0`（`:178`）；`cardKind` 只做展示字段（`:157-167`），**无按 cardKind 的丢弃/筛选**。
  - `decisionPriority()`（`:115-123`）：`download` 不在 `DECISION_KINDS`（`:58`）⇒ 优先级 3（低风险确认）；不触发破坏性二次确认（`isDestructiveDecision` 为 false）；不影响既有 shell/decision 卡。
  - `DecisionDialog.tsx` 的 confirm 分支已渲染：标题 `request.title`（`:208-210`）、来源角色（`:236-238`）、`judgeNotice`（`:249`）、`preview`（`<pre>` 保留换行，`:251-260`）、`detail`（`:289`）、`cardKind` 徽标（`:211-218`，现有 `proposal`/`appointment` 等同样显示原始协议 token，非中文文案）、确认/拒绝按钮（`:363-377`）。回包走 `chat-store.respondOperator` → preload `operatorRespond` → `session:operator-response`（`app/preload.cjs:283`）。
  - 下载卡按方案 §3.2 复用既有 `session:operator-request/response`（`app/preload.cjs:272-275`）；渲染侧**无需**新通道、新组件。
- **decision 卡面**（`app/renderer/src/chat/decision-card.ts`）：唯一判据 `request.cardKind === "decision"`（`:61`），其它卡种返回空视图；`download` 自然走普通 confirm，**无需改**。
- **指令面板**（`app/renderer/src/stores/directive-store.ts` + `chat/directive-panel.tsx`）：
  - `DirectiveConsumer = "shell-gate" | "decision-card" | "none"`（`:39`）；`asDirectiveConsumer()`（`:218-224`）严格白名单，**未知 consumer 会让整条指令被 `asDirectiveItem()` 丢弃**（`:239-244`）。
  - `CONSUMER_KEYS`（`:340-344`）为 `Record<DirectiveConsumer, MessageKey>`（新增枚举值时编译期强制补映射）；`consumerLabelKey()`（`:366-368`）供面板行使用。
  - `resourceView()`（`:410-435`）对所有 `domain`/`path` 资源都附加 `main.directive.receipt.noConsumerSuffix`（「暂无消费者」）——下载落地后该文案对 domain 已失真（方案 §7.3）。
  - `directiveRowView()`（`:574-591`）输出 `consumerKey`；`directive-panel.tsx` 已渲染 `t(view.consumerKey)`（`:91-93`）与 `view.resourceNoteKey`（`:95-97`），无需新增渲染行。
- **i18n 消费**：渲染层经 `app/renderer/src/i18n/index.ts` 复用 `src/common/shared/i18n` 的 `translate`/`MessageKey`；**key 不存在时 `MessageKey` 类型不成立**，故 C2 必须在 A2 冻结后开工，不预造 key。

### 1.3 目标文件基线指纹（`c2f1630` 工作区实测；未改动）

| 文件 | `git hash-object`（blob） | SHA-256 |
| --- | --- | --- |
| `app/renderer/src/chat/judge.ts` | `705b6b3b22e56b7fd7f08b17f72244e2c7637517` | `52d0556e3ce65f57d0eab47bb37ae1619e998ca043ef357645bee4790280d938` |
| `app/renderer/src/chat/decision-dialog.ts` | `1548f1d452ce84b2796687afe974e4280f2730fc` | `c62d44b4e34308255ed8217539a4ec3f238429512cfd556c223f7f6c3b4d1679` |
| `app/renderer/src/chat/decision-card.ts` | `9c1d36b4aa561981b48e58a0a6fe9aff6fba76c8` | `6ff3f120b5efcf4bfca8e299d7fbee5df4a4d85bbca8e8458736c85c00f11753` |
| `app/renderer/src/stores/directive-store.ts` | `4bb498cac277485dacae8353b95c7fb12d3c5bb8` | `8437190eb94b9cfe2751964894b4f0a1b73dbf43300f9ce84e153a9ad8f149cc` |
| `app/renderer/src/chat/directive-panel.tsx` | `6cc87500d1820118706b576891900b69d6340f5f` | `c97505c7a1bed3c3ee9fb7cde3af70bde1c880595a35d21f718c84cfc2c971b2` |
| `app/renderer/src/chat/DecisionDialog.tsx` | `1301ca0f3594a7f079d7fbaf352ec2473632f749` | `f7969e3f1e2f112a3d7b8ec9964ddaa258460f489251a3aafaa22a514e4e4355` |
| `app/renderer/src/shell/ConfirmCard.tsx` | `ab01730e6a4e026b9bc7a6400e1b684503079f96` | `e997aa3c44e2dd1f72a30e9167042682d57d4670be0b37248b4ec2e3d9e21011` |
| `app/renderer/src/chat/ChatRow.tsx` | `b777d0d83b8e80ee4b91ba5ff5d134a16d2dbc6e` | `d3c07e0202f5c19c6ef3751d43742c5a6af54db110e3864fb1659cc5b303b30b` |
| `test/桌面UI/judge.test.ts` | — | `4c26fe284e08d935fb2b16ee863719c31f1e272ad88da7550880367955bdc29e` |
| `test/桌面UI/decision-dialog.test.ts` | — | `50c7797220c2de27f457ac1678fe84c6c63948f429ac3e142282add38a72e062` |
| `test/桌面UI/directive-panel.test.ts` | — | `40a31b5724aaa0a8c26f50dcb5a8f09533168dffdd705c9254c70d22b94ccec5` |

## 二、消费契约（只按 preload 白名单通道与主→渲染事件）

1. **下载卡**：主进程经既有 `session:operator-request` 推达，`chat/ipc.ts::handleOperatorRequest` 路由到 `chat-store.pendingOperator`，`DecisionDialog` 以 confirm 呈现；客户选择经 `respondOperator` → `session:operator-response` 回主进程。渲染侧**不新增 IPC/preload 方法/事件类别**。
2. **不可信输入纪律**：`title`/`preview`/`detail`/`judgeNotice`/`roleId`/`cardKind` 等均为**展示数据**；渲染侧只做文本转写（React 转义；`preview` 用 `<pre>`），不当作授权/判定依据。
3. **不做判定**：不解析/校验 URL、主机、IP、文件名、路径；不判断「能不能写/能不能下载」；不调用判断器；不读 `.ans/`、不读文件系统、不计算 `enabledAt`/`createdAt` 门槛。所有事实由 C1/B1/A1 计算并冻结。
4. **未知 cardKind 策略**：沿用既有「非 choice ⇒ confirm」的通用回落（`decision-dialog.ts:137-138`）；**不新增第二份 cardKind→分组/权限映射**。下载卡不特殊化卡壳，只特殊化文案（§3.1）与面板 consumer（§3.2）。
5. **主进程字段组装**：AC-3 要求的卡片字段（角色/用途/URL/主机/已解析 IP 与 `resolvedIpsTruncated`/`resolvedIpsTotal`/`mechanical` 安全摘要/预期文件名/上限/重定向策略）由 **C1 组装为多行 `preview`**（及可选 `detail`）并经 `mainT`（`main.download.card.*`）本地化；渲染侧逐字显示、不重排、不截断。渲染侧可显示的容器只有：`title`（单行）、`preview`（**保留换行**）、`detail`（一段）、`judgeNotice`。若 C1 需要超出这四处的结构化表格，属新组件，**停止回报**。

## 三、实现方案

### 3.1 judge 结果行：`cardKind:"download"` 的 i18n 标签（`app/renderer/src/chat/judge.ts`）

- **[已冻结] 组标签**：A2 冻结**复用既有** `ui.judge.mode.approval`（P1 审核 F8 已闭合：A2 不新增下载专用组标签 key）。C2 的 `groupLabel`/`title`/`badge` 沿用现有 `judgeGroupLabel()` 结果，**不为 `download` 增加组标签分支**；`GOVERNANCE_CARD_GROUP` 的 `download → approval` 映射由 A1 冻结。
- **[设计候选] headline**：为 `cardKind === "download"` 增加分支，**复用既有** `ui.judge.headline.autoApproved`（「已代批」/「Auto-approved」，无 `{cardKind}` 插值；A2 未新增专用 headline key）。不得硬编码中文、不拼协议 token；其它未知卡种仍走 `ui.judge.headline.autoApprovedWithKind`，行为零变化。
- **[冻结说明]** A2 最终 key 集合为 **37 个**（main 35 + ui 2；P1 复审 F8 口径）。`downloadStartsNow`（G8 B）**不在 A2 key 集合内**（A2 已删除、B/C 未实施），C2 **不消费、不引用该 key**；未来若客户改选 B/C，由 A2 按 key 增量补充后再消费。
- **[设计候选] 样式分类**：`kindClass` 保持 `"generic"`（`ChatRow.tsx:822` 生成 `is-generic`），不新增 CSS；可选 `is-download` 样式仅在 UIUX/验收明确要求时由 `app/renderer/src/shell/shell.css` 追加（只引现有令牌，不改既有规则）。
- **不变**：`group`/`cardKind`/`requestTitle`/`engineText`/`operatorText`/`lines`/`details`/自动代批标识（`sourceLabel`/`customerNote`）全部沿用既有口径；`autoApprovedWithKind` 的既有其它未知卡种行为零变化。

### 3.2 指令面板：consumer「下载」与 G8 A 旧指令标注（`app/renderer/src/stores/directive-store.ts`）

> 这是 AC-14（面板 consumer 显示「下载」）与 AC-27（旧指令标注「不作用于下载」）的渲染侧消费点；消费的仍是既有 `directive:list`/`directive:state` 双视图，**不新增通道、不判 epoch**。
>
> **[F5 — addendum 已确认]** 本文件在 C2 Section 1 的 `app/renderer/` 目录授权内（非边界变更），但团队计划 §4.3 C2 的精确写集未枚举 `stores/`。按 P1 审核 §2.2/F5 与复审 §1.2（闸门 2 写集增补 + V1 确认记录 **28 行 / `aeff744cb852c1e2c3ac718d4640c1803c0628c826a68fbcdb260eeb91f84212`**）：该文件已纳入 C2 写集（目录内、非边界变更）；**C2 可在统筹派发后实施本文件**（仍按团队计划顺序，不提前开工）。

- **[精确改动 1 — 类型/校验] `DirectiveConsumer`**：联合类型增加 `"download"`（`"shell-gate" | "decision-card" | "download" | "none"`）。
- **[精确改动 2 — 严格解析] `asDirectiveConsumer()`**：白名单增加 `value === "download"` 分支；否则 A1 新增枚举值后，整条 domain 指令会被 `asDirectiveItem()` 静默丢弃（方案 §13.2 未决 #4 的穷尽处理）。
- **[精确改动 3 — key 映射] `CONSUMER_KEYS`**：增加 `download: "ui.directive.panel.consumer.download"`（**A2 最终 37 key 中的 ui key**；不是方案建议名 `ui.directive.consumer.download`）。`consumerLabelKey("download")` 返回该 key；面板既有行渲染 `t(view.consumerKey)` 直接显示，**无需改 `directive-panel.tsx`**。
- **[精确改动 4 — G8 A 旧指令标注（F3）] 唯一数据来源 = B1/C1 冻结的 epoch-aware 视图**。C2 只接受以下两种冻结形状之一，**不比较 `createdAt`、不读 `.ans/state/download-consumer.json`、不在渲染侧计算 `enabledAt`**：
  - **形状 A（已同形冻结；无需 A1 新字段）**：B1 在 `customer-directive.ts::list()` 按 epoch 派生视图——作用于下载的 domain 指令返回 `consumer:"download"`；早于 `enabledAt` 的旧 domain 指令返回 `consumer:"none"`。C2 的 `directiveRowView()` 映射：`download` ⇒ `ui.directive.panel.consumer.download`；`none` + `domain` ⇒ `ui.directive.panel.consumer.downloadLegacyOff`；`none` + `path` ⇒ `ui.directive.panel.consumer.none`（path 仍无消费者）；其它不变。P1 复审 §二 F3 已确认 **B1/C1/C2 三方同形选择形状 A**（B1 `list()` 投影、C1 原样透传、C2 消费）。
  - **形状 B（独立视图字段）**：A1 `CustomerDirectiveView` 增加可选 `downloadApplies?: boolean`（视图字段，非账本事件）；B1 在 `list()` 用 epoch 计算 `true/false/unknown`；C1 把该字段原样放进 `directive:list`/`directive:state` 载荷（若需改 `app/desktop/directive-input.ts`，属 C1 精确写集增补，非 C2）。C2 只按冻结字段映射：`domain && downloadApplies === false` ⇒ `ui.directive.panel.consumer.downloadLegacyOff`；`domain && downloadApplies !== false` ⇒ `ui.directive.panel.consumer.download`；`path` ⇒ `ui.directive.panel.consumer.none`。
  - **降级显示（两种形状统一）**：① `download` 且无 `downloadApplies`/`consumer` 无法区分 ⇒ 只显示 `ui.directive.panel.consumer.download`，**不标注旧指令**（不猜测）；② `none` + `domain` ⇒ 显示 `downloadLegacyOff`（形状 A 的语义）；③ 字段值非布尔/未知（`downloadApplies` 非 `true|false` 或缺失）⇒ 按「未知」处理：忽略该字段、只显示主进程 `consumer` 对应标签，**不冒充已知**；④ 渲染侧无法识别旧指令时，AC-27 的旧指令标注由 C1/B1 的冻结失败负责，C2 在 C1 冻结评审时以「上游未提供 epoch-aware 字段」为由**停止回报**。
- **[精确改动 5 — 过期文案清理]** `resourceView()` 对 `domain` 资源不再附加 `main.directive.receipt.noConsumerSuffix`（方案 §7.3「删除 domain/path 暂无消费者旧文案」）；`path` 保留该 note。该函数同时服务创建确认对话框与面板行，改动后新 domain 指令不再显示失真文案；`directive-dialog.ts` 无需改代码（继承该行为）。
- **A2 key 对齐（F8）**：A2 最终 **37 key**（main 35 = card 13 + notice 5 + error 17；ui 2）。C2 逐字消费其中两个 ui key：`ui.directive.panel.consumer.download`、`ui.directive.panel.consumer.downloadLegacyOff`；`ui.directive.panel.consumer.none` 沿用既有 key。`downloadStartsNow` 不存在于 A2 最终集合（G8 B 未选），C2 不消费、不引用。C2 不消费 A2 的 main 侧 35 key（卡片/回执/错误文案由 C1 生成），也不引用 A2 Revision 1 的其它中间 key。
- **依赖/停止条件**：以上成立的前提是 B1/C1 冻结声明形状 A 或 B 之一。若冻结形状与本提案两种都不等价（例如旧指令仍返回 `"download"` 且无独立字段），**C2 在 C1 冻结评审时停止回报**——不在渲染侧自行判 epoch、不自造字段/语义。

### 3.3 下载卡卡面：复用既有 confirm 渲染（`decision-dialog.ts` / `decision-card.ts` / `DecisionDialog.tsx`）

- **[P1 静态实测结论] 无需改动**（P1 审核 §7.5 已接受）：下载卡是 `CustomerInputRequest{kind:"confirm", cardKind:"download"}`；`decisionView()` 的通用 confirm 路径 + `DecisionDialog` 的 confirm 分支已覆盖标题/来源/预览/详情/`judgeNotice`/确认拒绝，且无任何按 cardKind 的过滤。`decision-card.ts` 只在 `cardKind === "decision"` 时生效，下载卡自然返回空视图（普通 confirm 卡面）。静态依据：`decision-dialog.ts:58`（`DECISION_KINDS` 无 download）、`:115-123`（→ 优先级 3）、`:137-138`（非 choice ⇒ confirm）、`:178`（`answerable`）、`DecisionDialog.tsx:208-289`（标题/来源/`judgeNotice`/`preview`/`detail`）、`:363-377`（confirm/reject 按钮）。
- **AC-3 卡面可读的渲染侧保证**：`preview` 以 `<pre>` 原样保留换行；`detail`/`judgeNotice` 以段落显示；`cardKind` 徽标如实显示协议 token（与既有 `proposal`/`appointment` 同口径，不硬编码中文）；角色名经既有 `findRole/roleDisplayName` 显示。字段内容与格式化由 C1 负责。
- **失败条件**：若 C1 冻结的卡片形状无法用上述四处文本完整承载 AC-3 字段（需表格/结构化区块/新徽标文案），属**新组件/新 key**，停止回报，不在本提案内扩写。

## 四、精确写集

| 类别 | 路径 | 内容 | 说明 |
| --- | --- | --- | --- |
| **修改** | `app/renderer/src/chat/judge.ts` | `governanceJudgeResultView()` 增加 `cardKind:"download"` 组标签/headline 分支；`kindClass` 保持 `generic` | 唯一必需的 judge 结果行改动；只消费 A2 key |
| **修改（F5 写集增补，已确认）** | `app/renderer/src/stores/directive-store.ts` | ① `DirectiveConsumer` 增加 `"download"`；② `asDirectiveConsumer()` 白名单增加 `"download"`；③ `CONSUMER_KEYS` 增加 `download: "ui.directive.panel.consumer.download"`（A2 最终 37 key 名称）；④ `directiveRowView()` 的 domain 旧指令标注映射（形状 A `consumer:"none"` 或形状 B `downloadApplies:false`，以 B1/C1 冻结为准）；⑤ `resourceView()` 去掉 domain 的 `noConsumerSuffix` | **在 `app/renderer/` 目录授权内（非边界变更）**；团队计划 §4.3 C2 精确写集未枚举 `stores/` ⇒ P1 审核 §2.2/F5 确认必要性，复审 §1.2 addendum（28 行 / `aeff744c…`）**已确认该文件纳入 C2 写集**；C2 可在派发后实施。不新增权限/通道/key |
| **闸门 2 写集增补记录** | 统筹/沟通记录（非本角色写区） | `docs/communication/2026-11-04_gate2-writeset-addendum_download-requests.md` **28 行 / `aeff744cb852c1e2c3ac718d4640c1803c0628c826a68fbcdb260eeb91f84212`**：F4/F5 写集增补确认 | 已记录；C2 可在派发后实施 `directive-store.ts` |
| **新增** | `test/桌面UI/download-card.test.ts` | 纯逻辑单测（Node 直接 import `.ts`，无 DOM） | 覆盖 §五列出的用例 |
| **按需更新** | `test/桌面UI/directive-dialog.test.ts` | domain 资源的 `resourceNoteKey` 断言改为 `null`（path 保留） | 仅因 §3.2 去掉失真文案；逐条理由在 C2 完成报告列出；不弱化其它断言 |
| **条件（预计不改）** | `app/renderer/src/chat/decision-dialog.ts`、`app/renderer/src/chat/decision-card.ts`、`app/renderer/src/chat/DecisionDialog.tsx` | P1 静态实测无需改；仅当实测发现未知 cardKind 不能走既有 confirm 渲染时最小改动 | 优先复用；不新增组件/卡壳 |
| **可选（预计不改）** | `app/renderer/src/shell/shell.css` | 可选 `is-download` 样式（仅 UIUX/验收要求时） | 只追加、只引现有令牌，不改既有 `.sc-*`/`.gj-*` 规则 |
| **不写** | `app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`test/桌面应用/**`、`package.json`/`tsconfig*`/`vite.config.ts`/发布配置、`docs/scheduling|acceptance|communication`、角色卡/边界/changelog、其它角色文件 | — | 任何需要上述路径的工作：停止回报 |

**写集缺口披露（F5，已由 addendum 关闭）**：团队计划 §4.3 C2 的枚举写集为 `judge.ts` + 条件 `decision-dialog.ts`/`decision-card.ts` + 按需样式 + 新测试；但 AC-14/AC-27 的渲染侧消费（`consumer:"download"` 的接受、标签映射、旧指令标注）**必须**修改 `directive-store.ts`（`app/renderer/src/stores/`）。该文件在本角色 Section 1 的 `app/renderer/` **目录授权内**，不涉及边界变更、不新增 key（使用 A2 最终集合）、不新增通道/依赖。**处置**：P1 审核 §2.2/F5 确认必要性；复审 §1.2 的闸门 2 写集增补记录（28 行 / `aeff744c…`）**已确认该文件纳入 C2 写集**——C2 可在统筹派发后实施，不需要再等额外记录；未按团队计划派发前不提前开工。

## 五、测试计划

### 5.1 命令与基线（团队计划 §6.2 / V1 §4.2）

| 命令 | 基线（B0 v2 §6） | C2 出口 |
| --- | --- | --- |
| `node --test "test/桌面UI/**/*.test.ts"` | 54 文件 / 405 tests / 405 pass / 0 fail / 0 skip | 55 文件（+1 新增）；新增确定性失败 = 0、新增 skip = 0；受影响断言按 §5.3 更新 |
| `npm run typecheck:renderer` | exit 0 | exit 0（证明 A2 `MessageKey` 与 `directive-store` 联合类型消费成立） |
| `npm run build:renderer` | exit 0（458ms，仅 chunk 提示） | exit 0；`app/renderer/dist/` 为忽略产物、非候选 |

- 环境：Node v24.22.1 / npm 11.19.1 / Windows 11 Pro 10.0.26300（同 B0 v2）。
- 候选：每改动/新增文件 `git hash-object` + `sha256sum`；`git status --short` 必须落在本角色写集内；不暂存、不 commit/push。
- 本 C2 单测阶段**不启动 Electron**；视觉/真实运行证据由 D2 统一执行（C2 参与截图，见 §5.4）。

### 5.2 新增 `test/桌面UI/download-card.test.ts`（纯逻辑，无 DOM）

1. **judge 结果行（AC-14 标签 / AC-19 i18n）**：
   - `governanceJudgeResultView({group:"approval", cardKind:"download", engine:"claude", requestTitle:"下载 …"}, locale)` 在 `zh-CN`/`en-US` 均返回非空 `groupLabel`/`headline`/`badge`；
   - `groupLabel`/`badge` 等于 `translate(locale, "ui.judge.mode.approval")`（A2 复用）；`headline` 等于 `translate(locale, "ui.judge.headline.autoApproved")`，且**不含**原始 token `"download"`；
   - `kindClass === "generic"`；`group === "approval"`；`requestTitle`/`details` 原样透传；其它未知卡种（`mystery`/`schedule-write`）仍走 `autoApprovedWithKind`，行为不变。
2. **指令 consumer 消费（AC-14 / AC-27）**：
   - A2 最终 key 集合为 **37 个**（main 35 + ui 2）；测试只断言两个 ui key，断言 `downloadStartsNow` 不存在/不消费（G8 B 未选）；
   - `consumerLabelKey("download") === "ui.directive.panel.consumer.download"`（A2 最终名）；
   - `asDirectiveListView()` 对 `consumer:"download"` 的 domain 条目**保留**（不被严格解析丢弃）；
   - `directiveRowView()`：`consumer:"download"` ⇒ `consumerKey === "ui.directive.panel.consumer.download"`；`none` + domain ⇒ `consumerKey === "ui.directive.panel.consumer.downloadLegacyOff"`；`none` + path ⇒ `consumerKey === "ui.directive.panel.consumer.none"` 且 `resourceNoteKey === "main.directive.receipt.noConsumerSuffix"`；
   - **形状 B 覆盖**（若 C1 冻结选择 `downloadApplies`）：`domain + downloadApplies:false` ⇒ legacy key；`domain + downloadApplies:true` ⇒ download key；`domain + downloadApplies` 缺失/非布尔 ⇒ 只显示 `consumer` 标签、**无旧指令标注**（降级不猜测）；
   - `directiveDialogView()` 对 domain 资源 `resourceNoteKey === null`（path 仍为 `noConsumerSuffix`）。
3. **confirm 卡复用（AC-3 渲染侧）**：
   - 构造下载卡 payload（`id/roleId/request:{kind:"confirm", cardKind:"download", title, preview, detail}` + `judgeNotice`），`decisionView()` 返回 `kind:"confirm"`、`cardKind:"download"`、`answerable === true`、`priority === 3`、`destructive === false`、`acceptance === false`；
   - `title`/`preview`/`detail`/`judgeNotice` **逐字保留**（含多行 preview）；`decisionCardView({cardKind:"download"})` 返回 `decision:false`（不引入第二套卡面）。

### 5.3 既有测试更新（仅列必要项）

- `test/桌面UI/directive-dialog.test.ts`：`domain.resourceNoteKey` 由 `main.directive.receipt.noConsumerSuffix` 改为 `null`；`path.resourceNoteKey` 不变。理由：方案 §7.3 要求删除 domain「暂无消费者」旧文案。其余断言不弱化。
- `test/桌面UI/judge.test.ts`、`test/桌面UI/directive-panel.test.ts`：预计**不改**（新增用例集中在 `download-card.test.ts`）；若实施需要补充 locale/consumer 断言，逐条在 C2 完成报告列理由。
- 其它 `test/桌面UI/**` 只运行、不修改；如需新增第三个非计划文件或修改其它测试，停止回报。

### 5.4 D2 真实运行截图（C2 参与，非本提案执行）

- 场景（团队计划 §6.4 / V1 §4.6）：下载确认卡卡面（角色/用途/URL/主机/已解析 IP 与截断标记/mechanical/文件名/上限/重定向策略）；judge 结果行（`cardKind:"download"` 的下载标签、`presented.to:"judge"`）；judge manual 转客户卡并附 `judgeNotice`；指令面板 consumer「下载」与旧指令「不作用于下载」标注；中文/英文切换（AC-19）。
- 规则：**最多截图、不得要求或提供录屏**；关闭 DEBUG 覆盖层；记录 sha256、候选版本、窗口尺寸、拍摄命令；存 `角色卡/桌面UI/docs/change/2026-11-04-download-requests-evidence/`（D2 时创建）。

## 六、AC 映射（C2 侧）

| AC | C2 提供 | 依赖/交接 |
| --- | --- | --- |
| **AC-3**（卡面可读） | 复用既有 confirm 渲染：`title`/`preview`（保留换行）/`detail`/`judgeNotice`/角色名/`cardKind` 徽标逐字呈现（§3.3）；单测证明 `decisionView` 不丢弃/不改写字段；D2 截图 | C1 负责把 AC-3 字段组装为多行 `preview`/`detail` 并本地化；C1 卡片形状冻结 |
| **AC-14**（标签） | 指令面板 consumer「下载」：`DirectiveConsumer` 接受 `download`、`CONSUMER_KEYS` 映射 `ui.directive.panel.consumer.download`（A2 冻结名）、面板既有渲染直接显示（§3.2）；单测 + D2 面板截图 | B1 对适用下载的 domain 返回 `"download"`（形状 A）或 C1 冻结字段为 true（形状 B）；C1 面板数据冻结；A2 `ui.directive.panel.consumer.download*` key 冻结；**F5 写集增补已记录** |
| **AC-19**（i18n） | 所有新增/变更文案只经 `translate`/A2 冻结 key（含 `ui.judge.mode.approval`、`ui.judge.headline.autoApproved` 复用）；无硬编码中英文、无原始 token；`zh-CN`/`en-US` 单测 + D2 语言切换截图；`test/项目管理/shared/i18n-guard.test.ts` 零违规（扫描含 `app/renderer/src/**`，由 A2/D1 运行） | A2 key 集合与计数冻结；C2 不新增 key（缺 key ⇒ 停止回报） |
| **AC-27**（旧指令标注） | domain 旧指令 ⇒ A2 `ui.directive.panel.consumer.downloadLegacyOff` 标注（§3.2 形状 A `consumer:"none"` 或形状 B `downloadApplies:false`）；G8 B 标注 key 不在 A2 最终集合内（未选），C2 不消费；单测（含字段缺失/非布尔降级）+ D2 面板截图 | B1/C1 冻结 epoch-aware 视图语义（形状 A 已同形；形状 B 为备选）；若两者都不成立，C2 停止回报并等冻结形状 |
| AC-18（回归/非目标） | C2 改动仅在 `app/renderer/**` + `test/桌面UI/**`；无新 IPC/依赖/构建改动；既有 `test/桌面UI/**` 全量运行 | D1 T3 全量；E1 核对 diff |
| AC-20（证据） | 候选哈希/命令/退出码/计数/截图元数据；未实施状态如实 | E1 汇总 |
| AC-4/5/6/7–13/15–17/21–26/28/29 | 非 C2 主责（C1/B1/A1/D1/D2）；C2 只保证卡面/结果行/面板消费不伪造、不判定、不额外拦截 | 各 owner 与 V1 |

## 七、依赖、冻结与顺序

1. **强依赖**：C1 卡片形状（`metadata.judgeContext`/`cardId`/`title`/`preview`/`detail`/`judgeNotice`/`cardKind`）冻结 + **B1/C1 的 epoch-aware 面板视图（F3：复审已确认形状 A `consumer:"none"` 三方同形；形状 B `downloadApplies` 仅作冻结变更备选）** + A2 最终 i18n key 集合冻结（37 key = main 35 + ui 2，含 `ui.directive.panel.consumer.download*`；judge 侧复用 `ui.judge.mode.approval`/`ui.judge.headline.autoApproved`）。任一未冻结，C2 不写引用代码（`MessageKey` 类型也不成立）。
2. **F5 写集增补已确认**：`directive-store.ts` 已由闸门 2 写集增补记录（复审 §1.2，28 行 / `aeff744c…`）纳入 C2 写集；C2 可在统筹派发后实施该文件，无额外记录前置。团队计划派发顺序仍适用。
3. **不依赖**：A1/B1 的内部实现；C2 只消费冻结后的通道载荷与枚举值。
4. **实施顺序**：新增测试（可先写失败用例）→ `judge.ts` → `directive-store.ts`（F5 增补记录后）→ 按需既有测试更新 → `typecheck:renderer` / `build:renderer` / `test/桌面UI` → 候选哈希。**C2 完成（消费实现与证据齐备）后，D1 才做跨层集成与 T3 全量回归**（团队计划 §5.1）。
5. **失效规则**：C1 形状、A2 key、C2 改动任一变化 ⇒ C2 证据失效并重跑；`app/renderer/dist/` 非候选。
6. **纪律**：不 commit/push/合并/发布；不改 `app/desktop/**`、`src/**`、`app/main.ts`、`app/preload.cjs`；不改任何边界/角色卡/治理文档。

## 八、风险、替代、必要 vs 可选、停止条件

### 8.1 必要 vs 可选

- **必要**：`judge.ts` 的 download 结果行标签（消除原始 token）；`directive-store.ts` 的 `download` consumer 接受与标签映射（否则条目被丢弃、AC-14 失败）；G8 A 旧指令标注映射（AC-27）；新增纯逻辑测试。
- **可选**：`kindClass:"download"`/`is-download` 样式；`cardKind` 徽标的中文标签（需 A2 新 key，当前不在集合内，默认不做）；面板标注的视觉强化（现有 `directive-row-value` 样式已可承载）。

### 8.2 替代方案（考虑后不采用）

| 替代 | 结论 | 理由 |
| --- | --- | --- |
| 新建专用下载卡组件/表格卡面 | 否决 | 方案 §3.1 要求优先复用既有 confirm 渲染；新组件扩大写集与回归面，且 C1 已用 `mainT` 组装文案 |
| 在渲染侧解析 URL/路径/epoch 做展示判定 | 否决 | 违反「渲染进程不出现第二份判定实现」；epoch 属主在 B1/C1 |
| 下载 judge 行继续用 `autoApprovedWithKind` 原始 token | 否决 | 用户可见行出现协议 token；违反 AC-19 的可读/i18n 口径 |
| 新增专用 headline/组标签 key | 不采用 | A2 已冻结复用既有 `ui.judge.headline.autoApproved` 与 `ui.judge.mode.approval`（F8 闭合），C2 不新增 key |
| 渲染侧比较 `createdAt` 与某个时间门槛 | 否决 | 渲染侧无 `enabledAt`、不得读 `.ans/`；旧指令语义由 B1 冻结视图表达 |
| 在 `directive-panel.tsx` 新增独立标注行 | 非首选 | `directiveRowView().consumerKey` 已能承载 `downloadLegacyOff` 文案，零 TSX 改动 |

### 8.3 风险与停止条件

1. **[F5 — 已关闭] `directive-store.ts` 写集增补已确认**：P1 审核确认必要性；复审 §1.2 addendum（28 行 / `aeff744c…`）已确认该文件纳入 C2 写集（目录内、非边界变更）。C2 可在统筹派发后实施；仍不得在派发前开工。
2. **[B1/C1 语义 — F3] 旧指令区分形状**：C2 只消费冻结形状 A（B1 `list()` 对旧 domain 返回 `consumer:"none"`；复审已确认三方同形）或形状 B（A1/C1 冻结 `downloadApplies?: boolean`；仅作备选）。若最终冻结形状两者都不等价、导致渲染侧无法区分旧指令，C2 在 C1 冻结评审时停止回报；**不得**在渲染侧自判 epoch、比较 `createdAt`、读 `.ans/` 或自造字段。字段缺失/非布尔时按 §3.2 降级显示（不猜测、不冒充已知）。
3. **[A2 key — F8] 逐字消费最终 key 集合**：A2 最终 37 key（main 35 + ui 2）；C2 只消费两个 ui key `ui.directive.panel.consumer.download`、`ui.directive.panel.consumer.downloadLegacyOff`；judge 侧复用 `ui.judge.mode.approval`/`ui.judge.headline.autoApproved`。`downloadStartsNow` 不在 A2 最终集合内（G8 B 未选），C2 不消费、不引用。若 A2 最终集合缺上述必需 key，C2 停止回报；不得硬编码中文或自造 key。
4. **[C1 卡面] 结构化字段**：若 AC-3 字段无法用 `title`/`preview`/`detail`/`judgeNotice` 承载，属新组件/新 key，停止回报。
5. **[未知 cardKind]**：不新增第二套 confirm 分支；若实测发现下载卡被既有通用路径丢弃/误判，停止回报（优先找 C1 形状问题）。
6. **[i18n 守卫]**：C2 改动不得引入硬编码中文；`i18n-guard` 零违规由 A2/D1 运行核对。
7. **[选装]** P1–P9 全部不实施（无进度条/去重/启动清理/`.gitignore` 维护/代理/解压/`expectedSha256`/病毒扫描/后台下载/回滚开关）；C2 不新增相关 UI。
8. **[窄屏/样式]** 默认零样式改动；若需样式，只追加、不引裸色值/新依赖，并过既有 200% 窄屏冒烟（D2）。

## 九、声明

本文件仅为 **C2 实现提案（proposal-only）**。未写产品代码、测试代码或样式，未改任何角色卡/边界/其他角色文档，未运行测试/typecheck/构建，未启动应用，未 commit/push，未接触客户。本修订（Revision 2）按 P1 复审 R5 完成非阻断编辑（`downloadStartsNow`/A2 key 编号等过期引用校正）；F5 已由 addendum 确认、F3 形状 A 已三方同形。C2 开工前置：A2 最终 37 key 冻结、C1 卡片/面板形状冻结、统筹派发；派发前不实施。

## 十、修订记录（Revision 1，2026-11-04，按 P1 审核）

- **触发/范围**：P1 审核 `角色卡/项目管理/docs/change/2026-11-04_download-requests-P1-review.md`（340 行 / `503aaf347be69b67bf7bc0bb6e426151f71f5f4a572dbdc32203ff711be0e530`）结论 `needs revision`；C2 侧阻断 F5/F3、非阻断 F17/F8/F16。本修订只改本文件；未改产品/测试代码、其他角色文档、角色卡/边界/`docs/scheduling|acceptance|communication`；未 commit/push。基线 HEAD `c2f163087aaf11616e5be01f80d305bf6f25af57`；`git status --porcelain -- src app test` 为空。
- **上一版本（审核对象）**：216 行 / `93f6798b700ac13cb10cacfc6e506274d2e16093599638f1c76d20d1a1432e6d`；复审使用本修订版的新行数/SHA-256（见交付报告），旧哈希不得复用。

| 项 | 处置（修订后位置） | 测试/证据（计划） |
| --- | --- | --- |
| **F5**（阻断，闸门 2 写集增补） | §四：`directive-store.ts` 列入正式写集的**闸门 2 写集增补条件**并附精确改动五条（`DirectiveConsumer`/`asDirectiveConsumer`/`CONSUMER_KEYS`/旧指令映射/domain 旧文案）；新增「闸门 2 写集增补记录」行；§三.2/§七/§八.3 同步「未记录不实施、不以其它文件绕过」 | 统筹/沟通写集增补记录；记录前 C2 不开工；单测覆盖 consumer/legacy |
| **F3**（阻断，G8 A 面板视图） | §三.2：只消费 B1/C1 冻结形状 A（`consumer:"none"`）或 B（`downloadApplies?: boolean`）；明确输入字段、优先级与四种降级显示；不比较时间/不读 `.ans`；§七/§八.3 同步停止条件；§五.2 增补形状 B/缺失/非布尔用例 | B1/C1 冻结声明 + C2 单测 + D2 面板截图 |
| **F17**（非阻断） | frontmatter：`status: proposal-only`、`related: [download-requests]`；补 `revised` 事件 | 复审读取新 frontmatter |
| **F8**（条件项） | §三.1：judge 组标签改为 A2 冻结的 `ui.judge.mode.approval` 复用（不新增组标签分支）；headline 复用 `ui.judge.headline.autoApproved`；§三.2/§五/§六/§八.3 全部改用 A2 最终 37 key（main 35 + ui 2）中的 `ui.directive.panel.consumer.download*`；A2 已删除 `downloadStartsNow`（G8 B 未选），C2 不消费、不引用 | 单测断言最终 key；A2 计数/parity |
| **F16**（可选文档） | 附录 A 补 project-rules 对照表 | 复审对照 |

- **未改项（保持已通过）**：confirm 卡复用与 `decision-dialog.ts`/`decision-card.ts` 不改的静态结论（§3.3，审核 §7.5 已接受）；`judge.ts` 的 `kindClass:"generic"`；`directive-dialog.test.ts` 的 domain `resourceNoteKey` 更新；AC-3/14/19/27 映射；零新 IPC/组件/依赖。
- **停止项/裁决**：修订后 C2 侧无新增阻断；开工前仍需 A2 最终 key 冻结、C1 卡片/面板形状冻结与统筹派发（F5 已由 addendum 确认、F3 形状 A 已同形，见 Revision 2）。任一未满足，C2 停止回报统筹，不自行扩写集/改语义。
- **状态**：仍为 `proposal-only, no code`；未运行测试/typecheck/应用；待项目管理复审（使用新行数/SHA-256）。

### Revision 2（2026-11-04，按 P1 复审 R5 非阻断编辑）

- **触发/范围**：P1 复审 Revision 1（`角色卡/项目管理/docs/change/2026-11-04_download-requests-P1-review.md` 追加节，全文 **501 行 / `7f8a3ea58782f74245aa1151ab29805fcafb73ddfa4822c84fb7d48620d99a01`**）R5：C2 的 `downloadStartsNow`/A2 key 编号为过期引用。本修订只改本文件；未改产品/测试代码、其他角色文档、角色卡/边界/`docs/scheduling|acceptance|communication`；未 commit/push。基线 HEAD `c2f1630…`；`git status --porcelain -- src app test` 为空。
- **上一版本（复审对象）**：255 行 / `52a560a5b16f5904133bea8b316b115932abced2142f72b4ecde261abea47767`；复审使用本修订版新行数/SHA-256（见交付报告），旧哈希不复用。

| 项 | 处置（修订后位置） | 测试/证据（计划） |
| --- | --- | --- |
| **R5（`downloadStartsNow` 过期引用）** | §三.1 冻结说明、§三.2 A2 key 对齐、§六 AC-27、§八.3 #3、Revision 1 表：全部改为「A2 不提供 `downloadStartsNow`（G8 B 未选），C2 不消费、不引用」；不再把它列为 A2 key 或 key 编号 | 全文零命中消费/编号引用（仅保留「不存在/不消费」的更正说明）；单测不断言该 key |
| **R5（A2 key 编号/口径）** | 删除 A2 Revision 1 的过期 key 编号引用；统一为「A2 最终 **37 key**（main 35 = card 13 + notice 5 + error 17；ui 2）」；C2 只消费两个 ui key `ui.directive.panel.consumer.download` / `downloadLegacyOff`；不以 A2 Revision 1 的中间集合作为消费依据 | 复审对照 A2 Revision 2 最终集合；单测断言两个 ui key |
| **F5（写集增补）** | §三.2/§四/§七/§八.3：改为「addendum 已确认（28 行 / `aeff744c…`），C2 可在派发后实施 `directive-store.ts`」，不再保留「未记录不实施」的过期前置 | addendum 记录；派发后实施 |
| **F3（形状 A）** | §三.2/§六/§七/§八.3：标注 P1 复审 §二 F3 已确认 **B1/C1/C2 三方同形选择形状 A**（B1 `list()` epoch 投影、C1 原样透传、C2 消费）；形状 B 仅作冻结变更备选 | B1/C1 冻结声明 + C2 单测 |
| **F8/F17/F16（保持）** | judge 复用 `ui.judge.mode.approval`/`ui.judge.headline.autoApproved`；frontmatter `proposal-only` + `related: [download-requests]`；附录 A 保留 | 复审读取新 frontmatter/正文 |

- **未改项（保持已通过）**：confirm 卡复用与 `decision-dialog.ts`/`decision-card.ts` 不改的静态结论；`kindClass:"generic"`；`directive-dialog.test.ts` 的 domain `resourceNoteKey` 更新；AC-3/14/19/27 映射；零新 IPC/组件/依赖。
- **状态**：仍为 `proposal-only, no code`；未运行测试/typecheck/应用；待项目管理复审（使用新行数/SHA-256）。

## 附录 A：project-rules 对照（F16，可选补表）

| 规则 | C2 对照 |
| --- | --- |
| §一.2 五层方向/相邻层 | C2 只消费 preload 通道与 A2 i18n；不 import Service/Provider/Pipeline；不实现 IPC |
| §一.5 共享组件唯一实现 | 复用 `src/common/shared/i18n`（`translate`/`MessageKey`），不复制消息目录/插值实现 |
| §一.7 未列即只读 | 只改 `app/renderer/**`（目录授权）与 `test/桌面UI/**`（目录授权）+ 本文件；`directive-store.ts` 先经 F5 写集增补 |
| §二.3/4/5 补丁/证据/重测 | 候选哈希、原始命令输出、B0 对照、受影响测试更新理由 |
| §二.6 不得伪装成功 | 不伪造卡面/回执/标签；缺 key/冻结形状即停止回报 |
| §二.9 风险档位 | T3（任务级）；C2 只跑 `test/桌面UI` + renderer 静态门，全量 T3 归 D1 |
| §二.10 打印/日志 | 渲染纯映射无 I/O；不新增日志框架；不打印敏感数据 |
| §二.17 截图上限 | D2 最多截图、不录屏 |
| §三 UI 平台化 | 渲染层单测只测无 DOM 纯逻辑 `.ts`（`download-card.test.ts`）；DOM/真实渲染证据交 D2 Electron；不新增 vitest/jsdom/依赖 |
