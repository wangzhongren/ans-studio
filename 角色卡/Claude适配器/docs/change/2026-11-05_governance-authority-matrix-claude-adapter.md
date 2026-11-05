# 2026-11-05 Claude适配器：治理权力矩阵提示块固定插入（C4b 变更提案）

- **状态**：**implemented-unverified（已实施、未验收；未 commit/push）**。C4b 已按本提案 v2 + PM 裁决（C-1/R-5/R-6/R-7）实施；E2 独立验收 AC-1–AC-17 全部 pass，AC-18 的文档状态收口由本文件与实施记录完成，**不写 verified**。候选快照 `839b922f…`；T2：`npm run typecheck` exit 0；T3 全量 4,130 tests / 4,103 pass / 9 fail（既有 Windows EPERM 基线）/ 18 skip，新增失败=0、新增 skip=0。验收/通过不授权提交、推送、合并、发布。
- **实施记录**：[`2026-11-05_governance-authority-matrix-claude-adapter-implementation.md`](2026-11-05_governance-authority-matrix-claude-adapter-implementation.md)（改动文件/哈希、测试与 T2/T3 证据、偏差披露）。
- **版本**：v1（2026-11-05，214 行 / `541ee055d2552d5eaacc372f7654cfba3558abd765ce380226fa0475b95f1894`）→ **v2（2026-11-05，本文件当前版本）**：仅按 P1 审核 C-1 补 `contextSections` 空串元素过滤（与 Pi/Codex 口径统一）；判断会话守卫、固定插入位置、逐字透传拼接均维持，不扩大写集。
- **P1 审核记录**：`角色卡/项目管理/docs/change/2026-11-05_governance-authority-matrix-P1-review.md`（358 行 / SHA-256 `0128f615a7cfe52df36351036f4246d1b91efc236c7cce3852325639eccc762f`，写本版前实测；§6.5 Claude 需修订项 C-1、§7.1 R-7、§7.2 跨适配器空串口径）。
- **任务 ID**：`2026-11-05-governance-authority-matrix`
- **批次/节点**：P1 实现提案 → **C4b（Claude 系统提示固定位置拼接）**；团队计划 §5.1：`C4b | Claude 提示拼接 | Claude适配器 | claude/session.ts + test/claude-adapter/ | C2（可与 C3 并行）`。
- **角色**：Claude适配器（独立固定上下文；工作目录 `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`）。角色卡见 [`../../role-card.md`](../../role-card.md)，写入白名单见 [`../../boundary.md`](../../boundary.md) Section 1；本提案只写本文件。
- **日期**：2026-11-05
- **唯一实施与验收基线**：策划方案 P1.1 [`docs/planning/2026-11-05_design_governance-authority-matrix.md`](../../../../docs/planning/2026-11-05_design_governance-authority-matrix.md)，**1056 行 / SHA-256 `1f6518b898aa33b649c21124e26816cd05715a5eba6a147aed8b8cab9cfb26d6`**（写本文件前实测，与闸门 1/团队计划记录一致）。
- **团队计划**：[`docs/scheduling/2026-11-05_team-plan_governance-authority-matrix.md`](../../../../docs/scheduling/2026-11-05_team-plan_governance-authority-matrix.md)，**660 行 / SHA-256 `07378444cb62fc714a7cce0a492ce5a12b5b7d0a0868f4602edb0be134fc7805`**（写本文件前实测）。本角色执行其 §4.3「Claude适配器（C4b）」写集与 §5.1 C4b 节点、§6.2/§6.4 证据口径。
- **闸门与验收记录**：[`docs/communication/2026-11-05_intent_governance-authority-matrix.md`](../../../../docs/communication/2026-11-05_intent_governance-authority-matrix.md)（闸门 0/1/2 + IA，**76 行 / SHA-256 `b8d7a18f38b86ae366f7ec1302f061bc2e478943025256161631758239eb3bbb`**，写本文件前实测）；实施前标准 V1 [`docs/acceptance/governance-authority-matrix-criteria-v1.md`](../../../../docs/acceptance/governance-authority-matrix-criteria-v1.md)，**327 行 / SHA-256 `f672052882f4937eac69fed617c309bb6cc6d4ed0cc68f280fe280797a5f3a2f`**（只读引用）。
- **客户已确认口径**（闸门 1/2，不重开）：P1.1 为唯一实施方案；OQ-1 single/su 不启用矩阵；OQ-2 按强制力分层（结构硬拒/许可条件/宿主注入/约定 + 固定句）；OQ-3 接受注册表只读展示字段；O-1–O-8 全部未选、不实施。
- **风险档位**：**T3**（批次定档：共享 Model/Service 公开入口、`model/runtime.ts` 共享契约、`ProjectListing` 形状、治理注册表展示字段、跨角色提示/工具通道；本角色改动本身为局部提示拼接，但不自行降档，按 T3 批次证据口径执行）。
- **本角色写集（团队计划 §4.3 C4b）**：`src/provider/claude/session.ts`（单文件）、`test/claude-adapter/`（目录）。**不写** `src/model/**`、`src/service/**`、`src/provider/runtime/**`、`src/pipeline/**`、`src/common/**`、`app/**`、其他角色 `test/**`、`docs/**`、角色卡/边界。
- **只读基线（写本文件前实测，HEAD `dc21fc1`）**：`src/provider/claude/session.ts` 1000 行 / SHA-256 `d4d6410b94c4d1bd0b5e83e368c83fb18573069dbc536f077f8b04bfc62f93e1`；`test/claude-adapter/session.test.ts` 1737 行 / SHA-256 `edb68af20f701a7bab665c19b21342ddd1e3fbf2cf4dc8a4589a64836f072903`；`test/claude-adapter/` 现有 5 个 `*.test.ts`。全仓当前**不存在** `contextSections` 与 `governance_matrix`（`grep` 实测零命中），二者分别由 C2/C3 与 C1b/C2/C3 引入。

---

## 一、触发场景（以前怎样 / 准备改成怎样）

**以前（现状，HEAD `dc21fc1`）。** Claude 角色会话的系统提示由 `src/provider/claude/session.ts::systemPrompt(role)`（`:187-200`）一个函数生成，元素顺序固定：

```text
role.cardText
→ 固定角色行（判断会话为 judge 行）
→ 当前角色边界：<boundary JSON>
→ 各工具 promptGuidelines（按 options.tools 顺序展开）
→ 已安装技能节（仅非空时拼接，判断会话不拼接）
```

全部元素以 `"\n\n"` 连接；`composeContext`（`:233`）与 `startEngine` 的 `queryOptions.systemPrompt`（`:559`）共用同一函数，因此两条路径天然同源。系统提示中没有任何「治理权力矩阵」段。

**准备改成。** 当（且仅当）Pipeline 按 P1.1 §4.3.1 在 `openRoleSession` 里把已渲染的矩阵文本作为 `contextSections` 注入 Claude 会话时，Claude 的系统提示在**边界 JSON 之后、工具 promptGuidelines 与已安装技能节之前**多出一段（或多段，按给定顺序）矩阵提示块。对没有注入 `contextSections` 的会话（worker、`su`、判断会话、非幕僚内置角色），系统提示**逐字不变**。

**用户可见结果。** 幕僚（`chief`）新会话开局即可在系统提示中看到「治理权力矩阵」快照（内容与上限由 C1b 渲染、C3 注入，本角色不改一字）；其他会话没有任何可见变化。本角色不新增工具、不新增权限、不读写任何项目文件。

---

## 二、位置 → 改动（逐项写死）

### 2.1 唯一代码改动点

| 位置 | 改动 |
| --- | --- |
| `src/provider/claude/session.ts::systemPrompt`（当前 `:187-200`） | 在数组的「边界 JSON」元素之后、`...options.tools.flatMap(...)` 之前，插入 `...contextSections`（见 §2.2/§2.6）。**不改**该函数其他元素、连接符、判断模式分支与技能节逻辑。 |
| `test/claude-adapter/governance-matrix-context.test.ts`（**新增**，或等价文件名） | 固定位置/缺省逐字不变/判断会话/透传不二次处理的测试（见 §四）。 |
| 既有 `test/claude-adapter/session.test.ts` | **预计不改**；其中 installed-skills 用例的 `statusQuo` 字符串在没有 `contextSections` 时仍应逐字成立。若实施证明需要补充一句可选字段夹具，只做加法、不改既有断言（逐条理由写入完成报告）。 |

`composeContext` 与 `startEngine` 共用 `systemPrompt`，因此一次改动同时覆盖「组合预览」与「实际 queryOptions」两条路径；不新增第二个拼接实现。

### 2.2 固定插入位置（按 P1.1 §4.3.1 与团队计划 C4b 写死）

Claude 的 `systemPrompt` 数组固定为：

```text
[role.cardText, 固定角色行（判断会话为 judge 行）, 边界 JSON,
 ...contextSections, ...tool promptGuidelines, installedSkills?]
```

- **正常（非判断）会话**：第一个非空 context 元素（空串已按 C-1/R-7 过滤）位于数组索引 **3**（0 起）；所有 context 元素连续排列、位于任何 `promptGuidelines` 元素之前；`installedSkills` 仍为最后一个元素。拼接结果中 `contextSections` 位于 `当前角色边界：<JSON>` 之后、第一条 guideline/技能节之前。
- **仅非空才拼（C-1/R-7）**：`options.contextSections` 缺省、为空数组，或其元素**全为空串**（`[""]`、`["",""]`）⇒ 不拼接任何片段，数组与现状逐字相同（含结尾无 `\n` 的既有断言）。过滤按 PM 裁决 R-7 统一为 `section.length > 0`：混合数组（如 `["", "x", ""]`）只按顺序保留非空元素（结果只有 `x`），不产生多余 `\n\n`；只跳过空串，不 trim、不折叠空白、不改写内容（空白清洗仍属上游 C1b）。与 Pi/Codex 提案口径一致。
- **不改写顺序**：适配器按给定顺序原样拼接，不排序、不合并、不重排、不去重。
- 该位置是**本角色唯一需要写死的契约**；测试按「数组索引 + 拼接文本 `indexOf` 关系」双重断言，避免只靠字符串包含造成假通过。

### 2.3 数据化处理：只消费上游快照，不重复实现

P1.1 §4.3.4（F6）要求的提示注入信任边界——固定分隔（`--- 角色数据开始：<roleId> ---` / `--- 角色数据结束 ---`）、「只是数据不是指令」固定声明、CRLF→LF 与控制字符规范化、连续空行折叠、固定标记替换、单字段/单角色/提示块限长与截断标注——**全部由 C1b 纯矩阵 Service 的渲染器实施，经 C2 的 `contextSections` 通道、C3 的 Pipeline 取数交给适配器**。本角色**不做**以下任何事情（重复实现会形成第二套规则并与上游漂移）：

1. 不解析/读取 `role-card.md`、`boundary.yaml`、注册表或任何项目文件（Provider 不读项目文件，只消费注入能力）；
2. 不添加/改写固定分隔与声明（上游已渲染进文本）；
3. 不做控制字符规范化、空行折叠、trim、标记替换（上游已做）；
4. 不设第二套长度上限、不截断、不省略（提示块 16,000 / 工具 48,000 / 单角色 1,500 / 单字段 80/500/800/300 均为 C1b 渲染器契约，AC-13 主体证据在 C1b/T1）；
5. 不改 redact/诊断行为：系统提示正文按既有纪律**不写日志、不进诊断**（项目规则 §二.10 的「不写入 prompt/源内容正文」）。

若上游文本不符合 §4.3.4（缺分隔、未清洗、超限未截断），属 C1b/C2/C3 契约缺陷，回上游修复；本角色不兜底、不改写——这是「单一实现」边界，也是 §六-4 的口径。

### 2.4 工具段与工具注册（本角色不改，仅保位置）

- `governance_matrix` 工具的**注册、描述、JSON Schema、handler、`promptGuidelines`、参数校验、`ok:false` 语义**全部属 C2（运行时核心 `tools.ts`/`schema.ts`）与 C3（Pipeline 注入门控）。Claude 适配器沿用既有「按 `options.tools` 通用注册」逻辑：工具存在与否只取决于运行时核心是否注入，适配器**不按工具名分支、不新增工具特判**。
- 系统提示里的「工具段」即各工具贡献的 `promptGuidelines`；其位置保持现状（在 `contextSections` 之后、技能节之前）。`governance_matrix` 的 guidelines 与其他工具走同一条展开路径，本角色不加特殊处理。
- 测试钉住「工具表面不因 `contextSections` 变化」：注入同一组工具时，有无 `contextSections` 的 `allowedTools`、`mcpServers`、注册工具名集合一致；`governance_matrix` 风格工具的 guideline 出现在 context 之后。

### 2.5 判断会话、缺省与注入范围

- **`judgeMode === true`（shell/治理判断会话）**：不渲染 `contextSections`——即使上游误传也置空。这与现有判断会话收口完全同型：判断模式已强制 `installedMcpServers` 置空、技能节不拼接，理由是「不让角色/技能等项目派生文本进入判断提示」（`session.ts:188-190`、`:217-219`，api-spec「判断模式」节）。矩阵文本含 worker 角色卡摘录，属项目派生数据，同样不得进入判断会话。
- **缺省/空数组/全空串数组**：逐字不变（断言 `composeContext` 与 engine `queryOptions.systemPrompt` 均等于基线拼接结果，结尾无多余 `\n`；`[""]`、`["",""]` 与缺省等价，C-1/R-7）。
- **注入范围不在本角色判定**：适配器**不按 `role.id`/`role.kind` 过滤**注入——「只有幕僚会话携带该段、五个非幕僚内置角色仅注册工具、worker/`su` 不注入、single 不启用」是 C3 Pipeline 的单点职责（P1.1 §4.3.1/§4.3.3、AC-1/AC-15）。本角色只负责「给了就按固定位置渲染、没给就逐字不变」。这样注入口径只有一处（C3），适配器不成为第二个门。

### 2.6 代码草案（最小改动；新增代码不用三元）

```ts
const systemPrompt = (role: ResolvedRole) => {
  const installedSkills = judgeMode ? "" : renderInstalledSkillsSection(options.projectRoot, role.id);
  let contextSections: readonly string[] = [];
  if (!judgeMode) {
    contextSections = (options.contextSections ?? []).filter((section) => section.length > 0);
  }
  return [
    role.cardText,
    judgeMode
      ? claudeJudgeSystemPromptLine(role.id, claudeJudgeReportToolName(options.tools))
      : `你始终绑定角色 ${role.id}。只能通过 mcp__ans__ 工具操作环境；所有写入、shell 和交互由 ANS 的注入能力判断。`,
    `当前角色边界：${JSON.stringify(role.boundary)}`,
    ...contextSections,
    ...options.tools.flatMap((tool) => tool.promptGuidelines ?? []),
    ...(installedSkills === "" ? [] : [installedSkills]),
  ].join("\n\n");
};
```

- 字段 `options.contextSections?: readonly string[]` 由 **C2 在 `RuntimeProviderOptions` 冻结**（`src/model/runtime.ts`，运行时核心写区）；若 C2 冻结时字段名不同，本角色按冻结名消费，属契约对接、不是方案偏差（§六-5）。
- 空串过滤按 PM 裁决 R-7 使用 `section.length > 0`（C-1）：只跳过 `""`，不做 trim/空白折叠/内容改写，仍属单一拼接职责。
- 新增代码使用 `if/else`，不新增三元（项目规则与角色卡质量约束）；既有三元行保持不动。
- 不新增私有辅助文件（`src/common/claude-adapter/` 虽在角色边界内，但团队计划 C4b 写集不含它，本提案不扩写集）。

---

## 三、明确不改什么（范围）

1. **不改工具面**：SDK 加载、MCP server 注册、`allowedTools`、`disallowedTools`、`tools:[]`、hooks（UserPromptSubmit/PreToolUse）、`canUseTool`、`mcpServers`、`strictMcpConfig`、`settingSources`、`settings`、`extraArgs` 全部逐字不变；`governance_matrix` 的注册与语义属 C2/C3。
2. **不改会话行为**：请求超时/网络暂停/replay-safe 重试/最后兜底/停止/恢复/持久化/判断模式/图片/WebSearch/外来 MCP 均不变；本改动只影响系统提示的一个数组元素。
3. **不改上游**：不做矩阵计算、取数、渲染、unknown/来源/强制力/截断/导航；不调用 `listProject`/`resolveBoundary`/共享解析；不导入 `src/service/**`（Provider 不向上调用）。
4. **不落盘**：不读写项目文件、不写 `.ans`、不写账本、不产生 trunk/VCA/stable-write 事件、不加缓存；无新依赖。
5. **不改其他角色/层/入口**：其他两个适配器、运行时核心、编排、Model/Service、桌面/渲染层、i18n（无新 key）、`package.json`/锁文件/tsconfig 均不写；`runRole`（CLI 一次性路径）不注入的现状不变。
6. **不放宽既有测试**：不删除、不弱化、不新增 skip；既有 `statusQuo` 断言在没有新字段时必须继续成立。

---

## 四、测试计划（本角色层）

### 4.1 新增测试文件与用例

新增 `test/claude-adapter/governance-matrix-context.test.ts`（或等价文件名），用本角色既有测试风格（假 SDK 仅替换 transport；`composeContext` 直接断言 + 一次 engine `queryOptions.systemPrompt` 捕获）：

| # | 用例 | 断言要点 |
| --- | --- | --- |
| T-1 | 缺省/空数组/空串元素逐字不变 | `composeContext` 与 engine prompt 均等于「cardText + 角色行 + 边界 JSON」基线（含无结尾 `\n`）；空数组与缺省等价；`[""]`、`["",""]` 与缺省逐字相等（无多余 `\n\n`，C-1/R-7）；混合 `["", "x", ""]` 只渲染 `x`，顺序不变 |
| T-2 | 单段/多段 `contextSections` 固定位置 | 正常会话中第一段位于数组索引 3；多段顺序保持；以 `"\n\n"` 拼接；文本**原样**出现（含矩阵标题/生成时间/摘要声明/固定句样例） |
| T-3 | 与 `promptGuidelines` 的相对位置 | 所有 context 元素索引 < 所有 guideline 元素索引；`governance_matrix` 风格工具（名称/schema/description/guidelines）出现时，其 guideline 在 context 之后；`allowedTools`/注册工具名/`mcpServers` 与无 context 时一致 |
| T-4 | 与技能节的相对位置 | 安装一个有效技能夹具时，context 在技能节之前，技能节仍为最后一段；技能节文本逐字不变 |
| T-5 | 判断会话不变 | `judgeMode:true` 且（构造上误传）提供 `contextSections` 时，系统提示不含矩阵文本；与无字段基线逐字相同（技能节仍不拼接） |
| T-6 | 上游文本透传（不二次清洗/不截断） | 提供含固定分隔声明、CRLF、控制字符与超长尾部的**已渲染形状**夹具，断言适配器逐字拼接、长度不变——钉住「清洗/限长只在 C1b，单一实现」；不在此断言控制字符被清洗（那是 C1b 测试的职责） |

说明：T-6 只证明「适配器不做第二套处理」；真正的恶意/超长角色卡注入安全证据由 C1b 单测与 T1 跨层集成提供（团队计划 §6.5、V1 §4.7），本角色不重复造夹具，也不冒充安全验收。

### 4.2 命令与通过标准（对照 B0）

- 命令：`node --test --test-concurrency=1 "test/claude-adapter/**/*.test.ts"`；`npm run typecheck`。
- 实施后 T3 全量回归归 T2（测试角色）；本角色只跑自己的套件与 typecheck，并在完成报告中如实给出候选哈希/原始计数。
- **B0 基线（测试角色 2026-11-05 记录，HEAD `7ba8a33`）**：claude-adapter 5 个测试文件 / 90 tests / 89 pass / 1 fail / 0 skip；唯一红＝既有 Windows symlink EPERM（`test/claude-adapter/session.test.ts:639`，环境类）。实施判据：新增文件全部通过；套件失败集合不变（仍为该 1 项同名 EPERM）；新增 skip=0；若实施入口按团队计划重记 B0（见 §六-1），以新 B0 对照。
- `typecheck:renderer`/`build:renderer`：本改动不触渲染面，按团队计划 §1.2 记录 N/A 与理由。

### 4.3 AC 映射（本角色贡献的验收证据）

| AC | 本角色相关部分 | 证据 |
| --- | --- | --- |
| **AC-1（注入范围；Claude 侧固定位置）** | chief 会话语义由 C3 注入；本角色证明：有 `contextSections` 时 Claude 提示在边界 JSON 之后、guidelines/技能节之前；无字段时逐字不变；worker/`su` 无字段 ⇒ 无段；判断会话不变 | T-1~T-5 |
| **AC-2（工具注册；适配器侧边界）** | 工具是否注册只由 C2/C3 决定；`contextSections` 不改变 Claude 侧工具面 | T-3（工具面一致性）；主体证据 C2/C3 |
| **AC-8（刷新与快照；适配器侧）** | 适配器只读取会话构造时注入的只读数组，不在每轮重算/刷新；`composeContext` 与 engine prompt 同源同值 | T-1/T-2 + 代码事实（单一 `systemPrompt` 函数） |
| **AC-10（权限零变化）** | 改动仅为系统提示文本元素插入；不触碰工具面/hooks/边界/判定；无第二权威源 | 代码 diff + T-3 |
| **AC-13（有界渲染；适配器侧）** | 上限与截断全部在 C1b 渲染器；适配器不设第二上限、不二次截断（T-6 透传）；不注入「执行原则」长文属上游渲染规则 | T-6；主体证据 C1b/T1 |
| **AC-15（single/su 兼容）** | single 不启用矩阵（OQ-1）；`su` 会话无 `contextSections` ⇒ 逐字不变；判断会话防御性不拼接 | T-1/T-5 |
| **AC-17（测试覆盖/注入安全）** | 本角色贡献适配器固定位置断言与缺省回归；跨层集成/恶意夹具/桌面端到端由 T1/T2 承担 | 本节测试 + 原始输出 |
| **AC-18（文档与披露）** | 本提案如实声明未实施/未测试/未验收；实施后更新 `api-spec.md`/`memo.md`/功能文档并链接本记录 | 本文件状态与后续更新 |

---

## 五、与项目规则对照（`角色卡/项目管理/docs/project-rules.md`，只读核对）

1. **五层调用方向**：改动只在 Provider 层内部；仅读取 Model 的 `RuntimeProviderOptions` 字段，不调用 Service/Pipeline，不向上、不跳层、不平级互调；无新增 import 方向。
2. **单一主属**：`RuntimeProviderOptions.contextSections` 的唯一主属是运行时核心（C2），本角色只读消费；矩阵文本唯一渲染实现是 C1b；本角色不复制第二份字段/渲染/清洗/上限。
3. **文档先行**：本提案先写、供 P1 审核；未确认前不改产品代码（当前 `src/ app/ test/` 无本任务改动）。
4. **状态如实**：本文件明确「未实施/未测试/未验收」，不把计划写成结果。
5. **打印/日志-01**：本改动无状态迁移、无外部 I/O、无可观察分支；系统提示正文按该规则「不写入 prompt/源内容等正文」不落日志，故不新增日志，也不以日志代替证据。
6. **代码质量**：新增代码用 `if/else`（不用三元）、无空 `catch`、无占位 stub、不访问外部对象内部属性；既有代码不动。
7. **i18n**：矩阵文本是模型可见文本，不进入 i18n；本角色零 key 变更。
8. **证据与风险档位**：按 T3 批次口径执行；本角色交单测原始输出、候选哈希；不自行验收。

---

## 六、偏差、口径说明与风险（如实报告）

1. **基线漂移（需在实施入口处置，不改变本提案口径）**：测试角色 B0 记录于 HEAD `7ba8a33`；本提案写盘时工作区 HEAD 为 **`dc21fc1`**（2026-11-05 10:00 合并 PR #65）。`7ba8a33..dc21fc1` 的改动为：`app/renderer/src/chat/DecisionDialog.tsx`、`src/pipeline/orchestration/version-change-runtime.ts`、**`src/provider/runtime/schema.ts`**、`test/桌面UI/.../decision-dialog.test.ts`、`test/编排/version-change-runtime.test.ts`。其中 `schema.ts` 属 C2 写集。处置：按团队计划 §1.4/§5.3/§1.5，C4b 实施前须确认实施基线并**重记 B0**（旧证据不复用）；本角色文件（`claude/session.ts`、`test/claude-adapter/`）未被该漂移触碰。若基线更新暴露方案未覆盖的语义冲突，停止回报，按技能重开闸门。
2. **「工具段」的归属口径**：团队计划/任务描述中的「矩阵提示块/工具段」在 Claude 侧拆为两件事——（a）矩阵提示块＝`contextSections`（本角色插入，C1b 渲染、C3 注入）；（b）工具段＝`governance_matrix` 的注册/描述/promptGuidelines（C2/C3 属主，本角色只保持其在系统提示中的既有位置，不做任何工具特判）。本角色不实施工具段内容，这是与团队计划写集一致的口径，不是遗漏。
3. **判断会话防御性置空（实现取舍，请审核确认）**：本提案在 `judgeMode` 下不渲染 `contextSections`（即使误传）。P1.1 的固定数组写法未单独写这一分支，但设计 §4.3.3 要求判断会话不可见，且既有代码已用同一模式收口 `installedMcpServers`/技能节。若审核认为应保持纯拼接（仅依赖 C3 不注入），可去掉该分支；两种做法对正常会话与现有测试等价。本提案默认采用防御性置空，测试 T-5 钉住。
4. **适配器不做二次清洗/限长（单一实现边界）**：§4.3.4 的数据化与 AC-13 的上限由 C1b 实施；适配器逐字透传。若审核要求适配器里再做清洗或截断，等于改变方案的单点实现口径且会与 C1b 双份规则漂移——应停止回报、按技能重开闸门，而不是在本角色自行加码。
5. **字段名/类型以 C2 冻结为准**：`contextSections?: readonly string[]` 是设计候选形状；C2 冻结时若命名/承载类型不同，本角色按冻结契约消费并重跑本套件，不另造字段、不在适配器扩展契约。
6. **测试索引断言的写法**：正常路径断言「第一个 context 元素在索引 3」，其余用相对顺序（context < guidelines < skills）与拼接文本 `indexOf` 双证；`options.tools` 的 guideline 数量可变，不使用单一全局固定索引代替相对断言。
7. **B0 计数仅作对照**：§4.2 的 90/89/1/0 来自测试角色 B0 记录（HEAD `7ba8a33`）；本提案未运行任何测试，不对新文件例数、通过数作任何声称；实施后以实际原始输出为准，并按 §六-1 对照重记后的 B0。
8. **不新增私有辅助文件**：`src/common/claude-adapter/` 在角色边界内，但不在团队计划 C4b 写集；本提案不扩写集。若实施证明需要辅助文件，停止回报统筹。
9. **提案自身不改任何其他文档**：`api-spec.md`/`memo.md`/`docs/feature/claude-session.md` 的更新属 C4b 实施完成后的交付物（团队计划 §4.3 C4b「可观察交付」），本文件不提前改写；本文件也不构成实施授权。
10. **空串元素过滤（P1 审核 must-fix C-1 / PM 裁决 R-7，v1→v2 唯一修订）**：`contextSections` 中空串元素视为无片段；`[""]`/`["",""]` 渲染结果与缺省逐字相等；混合数组只保留非空元素、按序拼接且不产生额外分隔。实现按 R-7 统一为 `section.length > 0`，与 Pi/Codex 提案口径一致；该过滤只跳过空串，不做 trim/空白折叠/内容改写，不构成第二套清洗规则，也不扩大本角色写集。

---

## 七、状态声明与实施后交付

- **本提案 + 实施记录**：C4b 已实施，状态 `implemented-unverified`；E2 判定 AC-1–AC-17 pass、AC-18 需文档状态收口，本文件与实施记录完成收口，**不写 verified**；未 commit/push。验收通过不替代提交/推送/合并/发布授权。
- **实施交付**（详见[实施记录](2026-11-05_governance-authority-matrix-claude-adapter-implementation.md)）：
  1. `src/provider/claude/session.ts` 最小改动：sha256 `6db0c08448c43867a8c1bc742e89bc6d850b1bd468548dd96ff2de183aa3abbe` / git hash-object `2ea522b794b1e1220334c8085a477682455577ee`；
  2. 新增 `test/claude-adapter/governance-matrix-context.test.ts`：sha256 `947c55522eedd626b2cfbebf4bae7e581949d86a41b72391a5994a942fc481f3` / git hash-object `599fee4bde9146e17a7cde8d8a0cb8594c5af96b`；新测 6/6 pass；claude 全套 96/95/1（既有 Windows symlink EPERM，无新增失败/skip）；
  3. `api-spec.md` 已补 `contextSections` 消费与固定插入位置；
  4. 偏差/未做项如实清单见实施记录；`memo.md`/功能文档未在本轮文档收口中更新（如需另行授权）。
- **本文件不授权**：提交、推送、合并、发布；不授权写本角色写集之外的任何路径。

---

## 附录：本提案引用的关键锚点

| 主题 | 锚点 |
| --- | --- |
| 方案 P1.1 注入点/固定位置 | §4.3.1（三适配器固定位置；Claude 数组顺序）、§4.3.3（判断会话不可见）、§4.3.4（F6 数据化/清洗/限长）、§5.2（`contextSections` 通道） |
| 方案 AC | §6 AC-1/AC-2/AC-8/AC-10/AC-13/AC-15/AC-17/AC-18 |
| 团队计划 C4b | §3.2、§4.3「Claude适配器（C4b）」、§5.1 C4b、§5.3 C4b 出口、§6.2 逐角色检查 |
| 验收标准 V1 | AC-1/AC-2/AC-10/AC-13/AC-15/AC-17/AC-18 行；§2.2 证据原则；§4.3 角色检查表 |
| P1 审核（C-1/R-7） | `角色卡/项目管理/docs/change/2026-11-05_governance-authority-matrix-P1-review.md`：358 行 / `0128f615a7cfe52df36351036f4246d1b91efc236c7cce3852325639eccc762f`；§6.5 C-1、§7.1 R-7、§7.2 跨适配器空串口径 |
| 现状代码 | `src/provider/claude/session.ts:187-200`（systemPrompt）、`:233`（composeContext）、`:559`（queryOptions.systemPrompt）、`:188-190`/`:217-219`（判断会话收口） |
| 既有测试同型先例 | `test/claude-adapter/session.test.ts:1045-1095`（installed-skills 固定位置/逐字不变断言） |
