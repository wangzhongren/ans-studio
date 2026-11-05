# 运行时核心 P1 实现提案：治理权力矩阵运行时契约、只读工具与提示通道（C2，governance-authority-matrix）

- **任务 / 角色 / 阶段**：`2026-11-05-governance-authority-matrix`（T3）；运行时核心（独立固定上下文）；**P1 实现提案**（团队计划 §4.3「运行时核心（C2：能力位 / 提示通道 / 工具表面）」、§5.1 C2 节点）。
- **日期 / 状态**：2026-11-05 提案；2026-11-05 文档收口为 **`implemented-unverified`**（C2 已实施、未独立验收通过）：候选快照 `839b922f…`；T2 证据：`npm run typecheck` exit 0（0 error）、T3 全量回归 **4,130 tests / 4,103 pass / 9 fail（既有环境失败）/ 18 skip**、新增确定性失败 0、新增 skip 0。未 commit/push/merge/release。状态以本行为准；逐文件差异、原始计数与偏差见 [实施记录](2026-11-05_governance-authority-matrix-runtime-core-implementation.md)。
- **写盘范围**：提案阶段只写本文件；2026-11-05 文档收口另更新本角色 [实施记录](2026-11-05_governance-authority-matrix-runtime-core-implementation.md) 与 [api-spec.md](../../api-spec.md)（见状态行），均在本角色 Section 1 的 `docs/change/` 与单文件授权内；不改 `memo.md`、功能文档或代码。
- **实施契约基线（唯一判定依据）**：`docs/planning/2026-11-05_design_governance-authority-matrix.md` **P1.1**：**1056 行 / SHA-256 `1f6518b898aa33b649c21124e26816cd05715a5eba6a147aed8b8cab9cfb26d6`**（本 worktree 实测，与闸门 1/团队计划记录一致）。
- **验收标准**：`docs/acceptance/governance-authority-matrix-criteria-v1.md` **v1**：**327 行 / SHA-256 `f672052882f4937eac69fed617c309bb6cc6d4ed0cc68f280fe280797a5f3a2f`**（实测；AC-1–AC-18 逐条）。
- **团队计划**：`docs/scheduling/2026-11-05_team-plan_governance-authority-matrix.md`：**660 行 / SHA-256 `07378444cb62fc714a7cce0a492ce5a12b5b7d0a0868f4602edb0be134fc7805`**（实测；§4.3 精确写集、§5.3 C2 出口、§6.2 检查命令）。
- **闸门记录**：`docs/communication/2026-11-05_intent_governance-authority-matrix.md`，当前 **76 行 / SHA-256 `b8d7a18f38b86ae366f7ec1302f061bc2e478943025256161631758239eb3bbb`**（闸门 0/1/2 + IA + V1 沟通核对）。V1 头部引用的 70 行 / `b41d0e9d…` 为追加「V1 沟通核对」节之前的快照；内容不冲突（见 §9-1）。
- **基线**：worktree `trunk-amendment`，分支 `feat/governance-authority-matrix`；**HEAD `dc21fc1f634dd21bc54ccde258f8d2b0f44bfd03`**（`git rev-parse HEAD` 实测）；`git status --porcelain -- src app test` **为空**；`node_modules` 存在；Node `v24.22.1` / npm `11.19.1`。方案/团队计划/V1 的基线分别为 `7b48cff` / `b5b21d1` / `7ba8a33`，本提案按团队计划 §1.4 以当前 HEAD 只读核对，实施入口仍须更新基线并重记 B0（旧证据不复用）。
- **标注约定**：**[事实]** 只读实测；**[方案已定]** 取自 P1.1 / 团队计划 / V1 / 闸门记录；**[候选·待审核]** 本提案为 C2 提出的形状/命名/校验细节，尚未获项目管理 P1 审核确认，请审核裁决（§8）；未实施内容一律不写成已实现。

**版本记录**

| 版本 | 日期 | 变更 | 状态 |
| --- | --- | --- | --- |
| r1 | 2026-11-05 | 初版：C2 契约（`RuntimeSessionOptions.contextSections`、`GovernedToolsOptions.governanceMatrix`、`RuntimeProviderOptions.contextSections`、`governance_matrix` 工具注册/参数/回执、schema 文案）、测试映射与偏差披露 | `implemented-unverified`（C2 已实施；候选快照 `839b922f…`；见实施记录） |

---

## 0. 摘要（给审核与后续实施者）

1. **这次只做 C2（运行时核心）**：给运行时公共契约加两个**可选**加法——六个内置治理角色可获得的只读能力位 `governanceMatrix`（工具名 `governance_matrix`），以及幕僚提示块用的纯展示通道 `contextSections`；Provider 工具层实现「注入才注册」和严格参数面；Service 只做透传。矩阵怎么算、给谁注入、提示块何时注入，分别属 C1a/C1b（门禁引擎）与 C3（编排），**不在本层实现**。
2. **行为变化只在注入后发生**：没有注入 `governanceMatrix` / `contextSections` 的会话（worker、su、判断会话、single 旧模型、以及当前所有既有会话）工具集合与系统提示**逐字不变**。这就是本层"零权限影响"的落点：能力缺席 = 工具不存在；字段缺席 = 提示不变。
3. **工具只转达、不判定**：`governance_matrix` 的 handler 只做参数形状校验（`roleId` / `section`，`additionalProperties:false`），调用 Pipeline 注入的 `GovernanceMatrixFn`，把 `ok/message` **原样**返回。它不读文件、不组装矩阵、不写盘、不写账本、不缓存、不产生 `allowed`/`denied` 之类的判定。矩阵不可用时 `ok:false` 表示"矩阵不可用"，**不是"没有权限"**。
4. **结构化快照与 unknown/来源语义不在本层**：结构化矩阵由 C1b 的纯组装器持有，工具结果是其**有界渲染文本**；本层不解析、不改写、不增加 `ToolResult` 字段。unknown（带原因）与 known（带来源）的展示纪律由 C1b 渲染器保证，本层在 schema/guidelines 中声明语义并原样转达。
5. **依赖顺序**：C2 依赖 **C1a 冻结** `src/model/governance-matrix.ts` 的 `GovernanceMatrixFn` 类型（本层只 `import type`，不复制、不重定义）；C2 与 **C1b** 写集不相交可并行；**C3** 在 C1b+C2 冻结后注入能力并构造提示段；**C4a/b/c** 只消费 `RuntimeProviderOptions.contextSections`，本层不改适配器。
6. **现在做没做**：C2 已实施（**`implemented-unverified`**，候选快照 `839b922f…`）并通过 T2/T3 检查；**未独立验收通过**——E2 结论 AC-1–AC-17 pass，唯一 fail 为 AC-18 文档状态收口，本次修订（提案状态 + [实施记录](2026-11-05_governance-authority-matrix-runtime-core-implementation.md) + api-spec 增量）用于该收口，最终判定以 E2 复判为准。

---

## 1. 输入与基线（只读实测）

| 输入 | 行数 | SHA-256 | 说明 |
| --- | --- | --- | --- |
| 方案 P1.1 | 1056 | `1f6518b8…b26d6` | 唯一实施/验收基线；§4.3.2/§5.2/§5.3/§9.1 定义本层职责 |
| 验收标准 V1 | 327 | `f6720528…a2f` | AC-1–AC-18；本层主映射 AC-2/AC-10/AC-15/AC-16/AC-17 |
| 团队计划 | 660 | `07378444…7805` | §4.3 C2 写集与可观察交付；§5.3 C2 出口；§6.2/§6.3 检查与 T3 口径 |
| 闸门记录（含 IA） | 76 | `b8d7a18f…3bbb` | 闸门 0/1/2 已确认；IA 已授权；V1 沟通核对已追加（§9-1） |
| 本角色卡片 / 边界 | — | — | [role-card.md](../../role-card.md)、[boundary.md](../../boundary.md)（只读加载；Section 1 覆盖本提案全部目标路径） |

**[事实] 目标文件写前基线（当前 HEAD，逐文件 `wc -l` / `git hash-object` / `sha256sum`）：**

| 文件 | 行数 | git blob | sha256 |
| --- | --- | --- | --- |
| `src/model/runtime.ts` | 3189 | `3cab4897f6b76b004e90ceb21f655a6f0a913ddd` | `ceb27df8857066ccaabd982eb80a87a7160eb00c321295f853c124442c415baa` |
| `src/service/runtime/session.ts` | 721 | `003d15928ff27b9427cef00ed30541ebe9395426` | `e36ffc226cc95ba7d25fd643b1c182c2e0694ef55f36d0b6b6a74ccd284d4d60` |
| `src/provider/runtime/tools.ts` | 4458 | `39449f80dbe5a5785128c98aee58f1936084b449` | `edce1b2f02674ba9fae8ba4a781d523bdcd8f1a5054a13f6eb545af0eff0eb65` |
| `src/provider/runtime/schema.ts` | 1655 | `18215b4e6f05b0b1e13bb82214a167d2ec880a55` | `0e93d3caa047507944eda9b6855563e8d106aca2bf4bdaacf184279f48062577` |

**[事实]** `src/model/governance-matrix.ts`、`src/service/governance-matrix/` 均**不存在**（C1a/C1b 待实施）；`GovernanceMatrixFn` 当前不可导入——这是 C2 必须先等 C1a 冻结的硬依赖（§5 第 1 条）。

**[事实] 当前符号锚点（行号会随基线漂移，实施以符号名/文本锚点为准）：**

- `src/model/runtime.ts`：Model 内部类型导入区 `:3-48`（已有多份 `import type` 先例）；`ToolResult` `:2575-2592`；`GovernedToolsOptions` `:2604-2772`（`projectState?` `:2704`、`submitVersionChange?` `:2723` 等「注入才注册」能力位先例）；`RuntimeProviderOptions` `:2818-2923`。
- `src/service/runtime/session.ts`：`RuntimeSessionOptions extends Omit<GovernedToolsOptions,…>` `:38-85`；`createRuntimeAdapter` `:142`；`buildGovernedTools(options.gate, {…options,…})` `:186-208`；`providerOptions` 显式构造 `:217-247`。
- `src/provider/runtime/tools.ts`：`unknownGovernanceArg` `:2507-2516`（严格参数面先例）；`makeProjectStateTool` `:3463-3505`（只读工具 + `raceAbort` + 回执归一先例）；`buildGovernedTools` `:4194-4420`；`project_state` 注册 `:4363-4366`；`abortedToolResult` `:1707`；`GovernanceMatrixFn` 类型导入方向沿 `RequestDownloadFn`（自 `model/download.ts` 直接导入，`:56-66`）。
- `src/provider/runtime/schema.ts`：`describeTool` `:40`；`project_state` 分支 `:1307-1333`（只读摘要工具 schema 文案先例）。

---

## 2. 以前怎样、现在怎样（触发场景）

### 2.1 触发场景：六角色调用只读矩阵 / 幕僚会话带提示块

**以前（当前基线）：** 打开任意角色会话（`chief` 或其他内置治理角色、worker、`su`、判断会话）时，工具集合只有既有工具；`governance_matrix` 不存在。系统提示只含角色卡、边界来源、技能节（以及 Claude/Codex 的固定行与工具 guidelines）。角色对"谁有什么权力"没有可查通道。

**现在（C2 实施、且 C3 完成注入后）：**
1. **六个内置治理角色**的会话（`chief`/`product`/`rapporteur`/`nominator`/`convener`/`verifier`）可获得只读工具 `governance_matrix`：无参数返回全量有界摘要；`{section:"roles"}` 只看角色段，`{section:"routing"}` 只看派发导航；`{roleId:"<矩阵中已有 id>"}` 只看该角色。每次调用由 Pipeline 注入的函数重新取数、重新渲染（无缓存），文本含 `generatedAt`。未知 `roleId` 返回"未找到"类回执（`ok:false`），不枚举其他角色；非法 `section`/未知参数在触达函数前被工具层拒绝。
2. **幕僚（`chief`）**会话在启动时由 Pipeline 计算一次矩阵，经 `contextSections` 传给适配器，由各适配器在**固定位置**拼接进系统提示（Pi 在 `## 边界来源` 之后、技能节之前；Claude/Codex 在边界 JSON 之后、promptGuidelines 之前——拼接属 C4，本层只提供通道）。提示块是当次快照，带生成时间与"只是摘要"声明；会话中刷新靠工具，不自动改写系统提示。
3. **worker / `su` / 判断会话 / single 旧模型**：没有注入 ⇒ 工具不存在；没有 `contextSections` ⇒ 系统提示逐字不变。worker 的任务文本、派发链、边界完全不变。

**本层在场景中的位置：** 第 1 条的工具注册/参数/回执由本层（C2）实现；第 2 条中"提示段如何进入适配器"的通道字段由本层提供，**取数与内容生成是 C3+C1b**；"给谁注入"是 C3 的判据，本层不硬编码角色 id。

### 2.2 这次改什么、不改什么

**改（C2 写集，四处源码 + 一处测试）：**

1. `src/model/runtime.ts`：`GovernedToolsOptions.governanceMatrix?: GovernanceMatrixFn`（注入才注册的只读能力位）；`RuntimeProviderOptions.contextSections?: readonly string[]`（纯展示通道）。均为加法，不删除、不改既有字段语义。
2. `src/service/runtime/session.ts`：`RuntimeSessionOptions` 增可选 `contextSections`，并在 `providerOptions` 构造处条件透传；`governanceMatrix` 经既有 `Omit` 继承与 `{…options}` 透传进入 `buildGovernedTools`（不新增判定分支）。
3. `src/provider/runtime/tools.ts`：新增 `makeGovernanceMatrixTool` 与 `buildGovernedTools` 注册块；严格参数校验；只调用注入函数并原样转达 `ok/message`；不读盘、不写盘、不写账本、不缓存。
4. `src/provider/runtime/schema.ts`：`describeTool("governance_matrix")` 的 JSON Schema、描述与 promptGuidelines（只读摘要、unknown 语义、强制力分层提醒、刷新语义、非批准/非验收证据）。
5. `test/runtime-core/governance-matrix-tool.test.ts`（新增）：注册/参数矩阵/回执/无副作用/描述纪律/Service 透传。

实施完成后（同一 C2 节点内）另按团队计划更新本角色 `api-spec.md` 与 `docs/feature/runtime-core.md` 历史（文档，不影响本提案范围）。

**不改：**

- 不改任何角色的写权/禁写/预授权/派发权/客户卡能力/shell 档位；不新增角色/卡种/客户闸门。
- 不改矩阵的数据组装与渲染（C1a/C1b）、不改 Pipeline 取数与注入判据（C3）、不改三个适配器的提示拼接实现（C4a/b/c）。
- 不改既有工具的行为、schema 或注册条件；不改 `ToolResult` 形状；不改 `CHOICE_CARD_KINDS`/`CONFIRM_CARD_KINDS`/`TRIO_CARD_KINDS` 等单一来源。
- 不把矩阵接入门禁/派发预检/客户卡/冻结/trunk/VCA/stable-write；不落盘、不产生 trunk 版本、不写治理账本。
- 不新增 i18n key；不改 `app/**`、`src/common/**`、`src/pipeline/**`、`src/provider/{pi,claude,codex}/**`、`src/service/role/**`、其他角色 `test/**`。
- 不提交、不推送、不合并、不发布。

---

## 3. C2 契约设计（候选·待 P1 审核）

### 3.1 `src/model/runtime.ts`：共享契约加法（T3）

**a) 能力位（加法，单一来源类型引用）：**

```ts
// 顶部 Model 内部类型导入区，沿 ./download.ts / ./project-state.ts 先例：
import type { GovernanceMatrixFn } from "./governance-matrix.ts";

// GovernedToolsOptions 内（只读能力位）：
/**
 * 治理权力矩阵只读能力（governance-authority-matrix，C2）。
 * **注入才注册**：未注入 ⇒ `governance_matrix` 工具不存在（能力缺席 = 最强 fail-closed）。
 * 注入面由编排（C3）决定：仅 trio 六个内置治理角色；worker、`su`、判断会话、single 旧模型不注入。
 * 类型单一来源＝`src/model/governance-matrix.ts`（C1a 冻结）；本文件只读引用，不复制、不重定义。
 * 纯读：不写盘、不写账本、不产生 trunk/VCA/stable-write 事件；工具输出不是批准/验收证据。
 */
governanceMatrix?: GovernanceMatrixFn;
```

- `GovernanceMatrixFn` 的冻结形状（C1a 定义，P1.1 §5.2）：
  `(input?: { roleId?: string; section?: "all" | "roles" | "routing" }) => Promise<{ ok: boolean; message: string }>`。
- 本文件**不声明**该类型；若 C1a 未冻结，C2 不开始写引用代码（§5 第 1 条）。
- `RuntimeSessionOptions extends Omit<GovernedToolsOptions,…>`，`governanceMatrix` 不在 `Omit` 列表内 ⇒ 自动继承、经既有 `{…options}` 进入 `buildGovernedTools`（与 `shellEscalation`/`projectState`/`requestRequirementChange` 同款），**Service 无需为该字段新增一行代码**。

**b) 提示通道（加法）：**

```ts
// RuntimeProviderOptions 内：
/**
 * 会话启动时由 Pipeline 注入的**纯展示文本段**（当前仅幕僚会话的「治理权力矩阵」必读块）。
 * 只允许编排在会话绑定时注入；适配器按固定位置拼接，不改写、不重排、不判定。
 * 不是能力、不是工具、不是判定输入；空数组/缺省 ⇒ 系统提示逐字不变。
 */
contextSections?: readonly string[];
```

- **T3 披露**：`src/model/runtime.ts` 是共享运行时契约（Model）。两个字段均为**可选加法**，但会构成新的公共形状：
  - 消费方重测：`createRuntimeAdapter`/`buildGovernedTools` 调用方、三个适配器（读取 `RuntimeProviderOptions`）、`test/runtime-core/` 既有工具集/会话断言、桌面会话路径测试（只读导入）。
  - 证据失效规则：本文件变更使上述消费方既有测试证据失效，按团队计划 §6.3 由消费方重跑；T2 全量回归 + `npm run typecheck` 为 T3 必需项（V1 §4.5）。
  - 不新增字段语义歧义：`contextSections` 不是能力位，不进 `GovernedToolsOptions`；`governanceMatrix` 不是提示段，不进 `RuntimeProviderOptions`。

### 3.2 `src/service/runtime/session.ts`：透传（不新增判定分支）

1. `RuntimeSessionOptions` 增：

```ts
/** 纯展示文本段（见 RuntimeProviderOptions.contextSections）：由编排在会话绑定时注入；缺省 ⇒ 逐字现状。 */
contextSections?: readonly string[];
```

2. `providerOptions` 显式构造处（`:217-247`）条件透传（空/缺省不注入字段，保持"字段缺席 = 逐字现状"）：

```ts
...(options.contextSections !== undefined ? { contextSections: options.contextSections } : {}),
```

3. `governanceMatrix`：**不改** `RuntimeSessionOptions` 声明、**不改** `providerFor` 代码——它经 `Omit` 继承，经既有 `buildGovernedTools(options.gate, {…options,…})` 自动到达工具层（团队计划 §4.3 C2「沿既有透传纪律，不新增判定分支」）。
4. 判断会话：注入 `shellJudge`/`governanceJudge` 时 Service 只走 judge 工具集、**不经过 `buildGovernedTools`**，因此即使调用方误传 `governanceMatrix`，判断会话也结构性看不到该工具（§6 测试钉住）。本层不为该保证新增分支。
5. `RuntimeSessionOptions` 是 `src/service/runtime/session.ts` 的公开类型，属于 `src/model/runtime.ts` 之外的第二个文件；二者都在本角色写集内。方案 §5.2 把两个 options 并列写在 `model/runtime.ts` 语境属文字性定位，团队计划 §八-1 已记录实际位置（§9-3）。

### 3.3 `src/provider/runtime/tools.ts`：工具表面（注入才注册 + 严格参数 + 原样转达）

**a) 常量与工厂：**

```ts
export const GOVERNANCE_MATRIX_TOOL_NAME = "governance_matrix";
const GOVERNANCE_MATRIX_ARG_KEYS: ReadonlySet<string> = new Set(["roleId", "section"]);
const GOVERNANCE_MATRIX_SECTIONS = ["all", "roles", "routing"] as const;
```

`makeGovernanceMatrixTool(fn: GovernanceMatrixFn): ExecutableTool` 的 handler 顺序（沿 `makeProjectStateTool` 先例）：

1. **未知参数拒绝**：`unknownGovernanceArg(call.args, GOVERNANCE_MATRIX_ARG_KEYS, name)` —— 任何未声明键 ⇒ `ok:false`，不调用 `fn`。
2. **`roleId` 解析（读原始值）**：缺省/`undefined`/`null` ⇒ 不携带；非字符串 ⇒ `ok:false`（消息说明应为字符串，不调用 `fn`）；字符串 `trim()` 后为空 ⇒ `ok:false`（不调用 `fn`）；否则携带 `trim()` 后的值（首尾空白归一，**精确匹配**交由注入函数判定）。
3. **`section` 解析（读原始值）**：缺省/`undefined`/`null` ⇒ 不携带（默认 `all`）；非字符串 ⇒ `ok:false`；`trim()` 后不在 `all|roles|routing` ⇒ `ok:false` 并列出三个合法值（不调用 `fn`）；合法值原样（trim 后）透传。
4. **调用注入函数**：始终以对象调用（至少 `{}`）：`raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return fn(input); }), call.signal, `${name} 读取治理权力矩阵`)`。**构造/注册时不调用 `fn`**（启动不计算）。
5. **回执归一（fail-closed，不虚构）**：
   - 抛错/中止 ⇒ `ok:false`，消息如实：「矩阵读取**未完成**（原因：…）——不要据此推断任何权限，也不要对客户声称已知权限」。
   - 回执不是对象、`ok` 不是布尔、`message` 不是非空字符串 ⇒ `ok:false`「数据源未返回明确结果——不要据此判断权限」。
   - `ok:true` ⇒ `{ ok:true, message }` **逐字转达**（文本中有界/截断/unknown/来源/固定句由 C1b 负责）。
   - `ok:false` ⇒ `{ ok:false, message }` **逐字转达**（`ok:false` 语义 = 矩阵不可用，不是没有权限；由 C1b 文本 + schema/guidelines 说明）。
   - 不增加前缀/后缀改写，不把 `message` 解析成结构化字段，不追加 `allowed`/`denied`/授权结论。

**b) 注册（`buildGovernedTools` 内，沿 `project_state` 块）：**

```ts
// 治理权力矩阵（C1/C2）：注入才注册；未注入 ⇒ 工具不存在（fail-closed）。
// 角色门控在编排（C3）注入端；本层不硬编码角色 id，不读项目文件，不组装矩阵。
const governanceMatrix = options?.governanceMatrix;
if (governanceMatrix !== undefined) tools.push(makeGovernanceMatrixTool(governanceMatrix));
```

**c) 分层与副作用：**

- 只 import `GovernanceMatrixFn` 类型（`import type`，自 `model/governance-matrix.ts`，沿 `RequestDownloadFn` 先例）；不 import `src/service/**`、`src/common/门禁引擎/**`、冻结/trunk/VCA/stable-write 模块。
- 本文件既有 `node:fs/promises` 等 import 服务于其他工具；**`governance_matrix` handler 不读盘、不写盘、不联网、不写账本、不产生状态事件**，仅调用注入函数。
- 不缓存：每次调用都调用 `fn`；`generatedAt` 由 fn 文本携带（C1b）。

### 3.4 `src/provider/runtime/schema.ts`：schema / 描述 / guidelines

`describeTool` 增加分支（沿 `project_state` `:1307-1333` 文案先例）：

```ts
if (name === "governance_matrix") {
  return {
    parameters: {
      type: "object",
      properties: {
        roleId: { type: "string", description: "Optional role id to filter one role; must exactly match an id present in the matrix" },
        section: { type: "string", enum: ["all", "roles", "routing"], description: "Optional section: all (default), roles, or routing navigation" },
      },
      required: [],
      additionalProperties: false,
    },
    description: "**只读**治理权力矩阵摘要（内置治理角色工具，注入才存在）：…",
    promptGuidelines: ["…", "…"],
  };
}
```

描述与 guidelines 必须钉住的语义（逐项）：

1. **只读/非权威**：矩阵只是运行时派生摘要；不新增、不改变任何权限；权威在治理角色注册表、`角色卡/<role>/boundary.yaml` 与 `role-card.md`、以及门禁判定本身。
2. **unknown 语义**：`unknown（原因）` 表示来源缺失/损坏/未声明，**不等于允许，也不等于禁止**；不要自行补默认权限。
3. **强制力分层**：结构硬拒 / 许可条件 / 宿主注入 / 约定分开标注；宿主未注入 ≠ 角色无权；worker `.ans/` 不是内置角色的硬拒规则（worker 无逐角色硬拒清单）。
4. **刷新语义**：工具每次调用重新取数（无缓存）；文本中的 `generatedAt` 是当次计算时间；幕僚启动提示块是快照，需要最新值时调用本工具。
5. **非批准/非验收证据**：`ok:false` 表示矩阵不可用、不是没有权限；工具结果不得作为批准、授权、验收或放行证据。
6. **过滤参数**：`roleId` 必须用矩阵中出现的精确角色 id；未知 id 会返回未找到；`section` 只接受 `all|roles|routing`。
7. 不出现任何 `allowed`/`denied`/`approved` 类字段或措辞。

### 3.5 工具结果契约（结构化快照 / unknown / 来源 / fail-closed）

| 维度 | 契约（本层职责） | 不在本层 |
| --- | --- | --- |
| 结构化矩阵快照 | **不进入 `ToolResult`**：`GovernanceMatrixFn` 返回的 `message` 是 C1b 对结构化 `GovernanceMatrix` 的**有界渲染文本**；本层不解析、不重排、不增删字段 | 结构化类型/字段/枚举（C1a）、组装与渲染（C1b） |
| unknown 语义 | 原样转达含 `unknown（原因）` 的文本；schema/guidelines 声明 unknown ≠ 允许/禁止 | unknown 的判定与展示（C1b） |
| 来源标注 | 原样转达带 source 的文本；本层不生成来源、不伪造来源 | 每个 known 带 source、复合字段分量来源（C1b） |
| fail-closed | 能力缺席 ⇒ 工具不存在；抛错/回执畸形 ⇒ `ok:false` + 诚实原因；绝不合成已知值、绝不输出允许/拒绝结论 | `ok:false` 的触发条件由 fn 决定（注册表不可用等） |
| 有界性 | 不在工具层做第二次截断（避免出现第二套 `truncated` 语义）；48,000 字工具文本上限由 C1b 渲染器保证（AC-13） | 渲染上限/截断标注（C1b） |
| 只读性 | handler 不写盘/不写账本/不缓存/不产生状态事件；不返回授权令牌或判定字段 | — |

**与 P1.1 的对齐**：方案 §4.3.2「结果：`ToolResult`，`message` 为有界矩阵文本；`ok:false` 仅当连内置角色行都无法生成」——本层不改变该语义，只负责把 fn 的结果**如实**放进 `ToolResult`。

### 3.6 角色门控与注入面的分工（本层 vs C3）

- **本层（C2）**：只实现"注入才注册"；不硬编码 `chief`/`product`/…/`verifier` 等角色 id；不判断 `governanceModel`；不决定五个非幕僚是否启动计算。
- **C3（编排）**：在 `openRoleSession` 中按 `governanceModel==="trio"` + `role.kind==="built-in-governance"` + `role.id∈六角色` 注入 `governanceMatrix`；仅 `chief` 额外注入 `contextSections`；worker/`su`/判断会话/single 不注入；`runRole`（CLI 一次性路径）保持逐字不变。
- **可核对的结构性后果**：worker/`su`/single 走的也是 `buildGovernedTools`，但没有注入 ⇒ 工具不存在；判断会话走 judge 工具集 ⇒ 结构性看不到；本层的注入测试与 C3/T1 的行为测试共同证明 AC-2/AC-15。

---

## 4. 写集与非目标

**精确写集（团队计划 §4.3 C2；本角色 boundary.md Section 1 已覆盖）：**

| 路径 | 变化 |
| --- | --- |
| `src/model/runtime.ts` | 两处可选加法 + 类型引用（§3.1） |
| `src/service/runtime/session.ts` | `RuntimeSessionOptions.contextSections?` + `providerOptions` 条件透传（§3.2） |
| `src/provider/runtime/tools.ts` | 常量 + `makeGovernanceMatrixTool` + 注册块（§3.3） |
| `src/provider/runtime/schema.ts` | `governance_matrix` schema/描述/guidelines（§3.4） |
| `test/runtime-core/governance-matrix-tool.test.ts`（新） | 注册/参数/回执/无副作用/描述/透传测试（§6） |
| `角色卡/运行时核心/api-spec.md`、`docs/feature/runtime-core.md`、`docs/change/…`（本文件） | 实施后按实际行为更新公共契约与功能历史（文档；本阶段只写本文件） |

**不写**：`src/model/governance-matrix.ts`（C1a 主属，只读引用类型）、`src/common/**`、`src/service/role/**`、`src/service/governance-matrix/**`（C1b）、`src/pipeline/**`（C3）、`src/provider/{pi,claude,codex}/**` 与 `src/common/pi-adapter/**`（C4）、`app/**`、i18n、`src/common/shared/**`、其他角色 `test/**`、`test/桌面应用/**`、角色卡/边界/YAML/changelog、`package.json`/lock/tsconfig/构建发布配置。

**不做**：不新增工具名以外的公开能力；不加角色门控硬编码；不加缓存/落盘/账本；不改任何判定链；不实现 O-1–O-8；不实现 single/su 矩阵（OQ-1 不启用）。

---

## 5. 依赖与接口（C1a / C1b / C3 / C4）

1. **依赖 C1a（硬前置）**：`src/model/governance-matrix.ts` 由门禁引擎在 C1a 冻结，`GovernanceMatrixFn` 是其中唯一声明。C2 只 `import type`；**C1a 未冻结前不写引用代码**（团队计划 §5.2「C1a 冻结前消费方不写引用代码（尤其 runtime.ts 引用 GovernanceMatrixFn 前 C1a 必须冻结）」）。C1a 形状若变更：回 C1a 并重跑 C2 受影响证据，不静默漂移。
2. **与 C1b 并行**：C1b（纯矩阵 Service）写集 `src/service/governance-matrix/**` 与本层不相交；C2 只依赖 C1a 的类型，不依赖 C1b 的实现；C3 才同时消费两者。
3. **接口给 C3（编排注册）**：C3 在 `RuntimeSessionOptions` 上注入 `governanceMatrix`（六个内置治理角色）与 `contextSections`（仅 `chief`）；C3 负责取数、组装/渲染调用、`generatedAt`、unknown/降级文本与固定句；C3 不期望本层做角色门控、缓存、矩阵计算或文本加工。工具 handler 每次调用都会调用注入函数（C3 在函数内部重新取数）。
4. **接口给 C4a/b/c（提示通道；不改本层）**：C4 从 `RuntimeProviderOptions.contextSections` 读取并按其固定位置拼接；本层只保证字段可选、透传、空/缺省不注入。C4 不消费 `governanceMatrix`；工具面对三适配器同源（`tools` 数组相同），适配器无需知道矩阵。
5. **与 C3/C4 的边界**：`runRole`（CLI 一次性路径）不注入——本层不为其加分支；若实施证明需要触达 `runRole` 注入，属范围变化，停止回报并按团队计划 §9.3/§十处理。
6. **冻结声明（C2 出口）**：`GovernedToolsOptions.governanceMatrix`、`RuntimeProviderOptions.contextSections`、`RuntimeSessionOptions.contextSections`、`governance_matrix` 工具 schema/描述/回执语义在本节点完成后冻结；C3/C4/T1 只按冻结形状消费，变更须回运行时核心并重跑受影响证据。

---

## 6. 测试映射（V1 AC-2/10/15/16/17 等）

**新增测试文件（唯一新文件）**：`test/runtime-core/governance-matrix-tool.test.ts`。复用 `test/runtime-core/fixtures.ts` 的 `allow`/`role`/`registerControlledDisplayProfile` 与会话 fake factory 先例（同 `download-tool.test.ts`），不新建第二个测试文件。

| V1 AC | 本层（C2）覆盖 | 用例要点 | 其余证据归属 |
| --- | --- | --- | --- |
| **AC-2（只读工具注册）** | 主责（Provider 侧） | ①未注入 ⇒ 无 `governance_matrix`；注入 ⇒ 只新增这一只，既有工具 `inputSchema`/`description`/`displayInputRule`/`executionMode` 零变化；②构造时不调用 fn（启动不计算）；③参数矩阵：无参/`roleId`/`section` 合法透传；未知参数、非字符串/空 `roleId`、非法 `section` 在调用 fn 前 `ok:false`；未知 `roleId` 由 fn 回 `ok:false` 并原样转达、不枚举其他角色；④抛错/畸形回执 ⇒ `ok:false` 诚实原因；⑤临时目录前后快照一致（无写盘/无账本事件；完整文件/账本扫描由 T1 覆盖） | C3 角色门控、T1 跨层与文件/账本快照 |
| **AC-10（权限零变化）** | 部分（Provider 侧） | 不新增能力位语义/卡种/角色；工具只读；不 import 门禁/派发/冻结模块；注册不改变既有工具集合（除注入时新增一只） | T2 diff/导入检查 + 全量回归 |
| **AC-15（single/su 兼容）** | 部分（结构性） | 未注入 ⇒ 工具不存在；判断会话即使误传 `governanceMatrix` 也只走 judge 工具集、无该工具；`su`/single 由 C3 不注入 ⇒ 本层零变化 | C3/T1 su/single 提示/工具快照 |
| **AC-16（摘要声明/非权威/固定句）** | 部分（工具/描述侧） | 工具结果只有 `ok/message`，无 `allowed`/`denied`/批准/验收字段；schema/guidelines 钉「只读/非权威/unknown/非批准」；不回显契约外信息 | C1b 渲染文本固定句 + T1 字符串断言 |
| **AC-17（测试覆盖/注入安全）** | 部分（本角色单测） | 本文件全部用例通过；`node --test "test/runtime-core/**/*.test.ts"` 与 `npm run typecheck` 原始输出 | C1b/C3/C4/T1/T2 的恶意夹具、集成与全量回归 |
| **AC-1（注入范围）** | 部分（通道） | `contextSections` 经 `createRuntimeAdapter` 进入 `RuntimeProviderOptions`（有/无两态）；字段缺席不改 providerOptions 其它字段 | C3 注入点 + C4a/b/c 固定位置断言 |
| **AC-8/AC-9（刷新/降级）** | 间接 | handler 每次调用 fn（无缓存）；降级文本由 fn/C1b 提供并原样转达 | C3/T1 两次调用、会话中途新增角色、故障注入 |
| **AC-11（不落盘/不产生版本）** | 部分 | 本层 handler 无文件/账本/状态副作用 | T1 前后文件系统与账本扫描 |
| **AC-13（有界渲染）** | 间接 | 工具层不做第二套截断，原样转达 C1b 文本；不注入"执行原则"长文属 C1b | C1b 上限/截断测试 |
| **AC-3/4/5/6/7/12/14/18** | 非本层主责 | — | C1a/C1b/C3/文档所有者 |

**检查命令（C2 退出，团队计划 §6.2）：**

- `node --test "test/runtime-core/**/*.test.ts"`（含新增用例；记录 pass/fail/skip 计数与失败原文）
- `npm run typecheck`（exit 0）
- `git status --porcelain -- src app test`（仅 4 个源码文件 + 1 个新测试文件）

**未跑或失败项如实披露**，不以单测替代 C3/T1 的集成与端到端证据（AC-17 反例）。

---

## 7. T3 证据计划（C2 退出）

1. **写前基线**：本文件 §1 的 HEAD、四文件 `wc -l`/`git hash-object`/`sha256sum`；实施时复测并与本表一致，否则停止回报。
2. **候选身份**：改动文件的 `git hash-object` + `sha256sum`（工作区；CRLF/LF 分别记录）；新增测试文件同；`git diff --cached --name-only` 为空（不暂存）。
3. **写集隔离**：`git diff --name-only` / `git status --short` 仅落入 §4 写集；无授权外已跟踪变化。
4. **原始检查输出**：上述检查命令、退出码、环境（Node v24.22.1 / Windows / bash）、测试计数、失败原文；跳过项写明原因。
5. **契约一致性**：`GovernanceMatrixFn` 定义只在 `src/model/governance-matrix.ts`（C1a）；`src/model/runtime.ts` 只 import，无第二份形状；`GOVERNANCE_MATRIX_TOOL_NAME` 只在 `tools.ts` 定义、schema 用字面量但由测试对照。
6. **分层**：`tools.ts`/`schema.ts` 不 import `src/service/**`、`src/common/门禁引擎/**`、`src/pipeline/**`；`governance_matrix` handler 不读项目文件。
7. **无副作用**：临时目录前后快照一致；不产生 `.ans` 账本事件；完整扫描由 T1 复核。
8. **冻结声明**：C2 出口写明确的符号/字段/工具 schema/回执语义冻结声明；C3/C4/T1 只按冻结面消费。
9. **文档状态**：实施完成但未验收的文档状态如实写 `implemented-unverified`；本提案原为 `proposal-only`，2026-11-05 收口后状态为 `implemented-unverified`（候选快照 `839b922f…`）。

---

## 8. 风险与审核裁决点

| # | 事项 | 本提案口径（请 P1 审核裁决） |
| --- | --- | --- |
| R1 | 工具文本安全边界 | 本层不做第二次截断（避免第二套 `truncated` 语义），信任 C1b 的 48,000 字上限；若审核要求工具层防御性兜底，须同时定义与 C1b 一致的截断标记语义（本提案不默认加）。 |
| R2 | `roleId` 空白处理 | 工具层 `trim()` 后透传；注入函数做**精确**（大小写敏感、非前缀）匹配。备选：空白即拒绝。属候选细节，请裁决。 |
| R3 | `section` 缺省语义 | 缺省 = `all`（由注入函数渲染决定；工具层不携带字段）；`section` 与 `roleId` 可同时给出（二者由 C1b 渲染器组合）。 |
| R4 | `ok:false` 的转达 | 原样转达 fn 的 `message`，不加"不代表无权限"前后缀（该语义由 C1b 文本与 schema/guidelines 承担）；仅当 fn 抛错/畸形回执时由工具层生成含"不要推断权限"的诚实文案。 |
| R5 | 是否在 `ToolResult` 增加结构化矩阵字段 | **不加**：方案 §4.3.2/§5.2 的工具结果就是 `{ok,message}`；加字段会扩大公共契约并诱导消费方把矩阵当数据源/判定依据。 |
| R6 | `contextSections` 空数组 | Service 只透传"已定义"的值；空数组是否视为"缺席"由 C4 适配器保证（"非空才拼"）；本层不在 Service 做空数组判定。 |
| R7 | 判断会话误传能力 | 判断会话结构上走 judge 工具集，不经过 `buildGovernedTools`；本层不为该保证新增分支，由测试钉住。 |
| R8 | 与 C1a 的等待 | C1a 冻结前 C2 不动 `runtime.ts` 引用代码；若审核希望先落其余三文件，需说明违反"引用前冻结"的例外依据（本提案不默认）。 |

---

## 9. 与方案/计划的偏差（如实）

1. **闸门记录哈希代次**：V1 头部引用 70 行 / `b41d0e9d…`；当前文件 76 行 / `b8d7a18f…`，差值为追加的「V1（验收标准）沟通核对」节（`:72-76`，确认 V1 与 P1.1/闸门口径一致）。属记录追加，不是方案/标准内容变化；本提案引用当前版本，并在 §1 保留两代哈希。
2. **`GovernanceMatrixFn` 的声明位置**：P1.1 §9.1 影响面表曾写「`src/model/runtime.ts` 增加 `GovernanceMatrixFn` 能力类型」，而 §5.2 把该类型列在 `governance-matrix/v1` 契约块；团队计划 §4.2/C1a 明确**单一来源在 `src/model/governance-matrix.ts`**（B-1，门禁引擎），`src/model/runtime.ts` 只读引用。本提案按团队计划执行：**不**在 `runtime.ts` 重定义该类型（避免第二份形状，符合 AC-6 单一来源）。属归属口径对齐，非语义变更。
3. **`RuntimeSessionOptions` 位置**：P1.1 §5.2 把 `RuntimeProviderOptions` / `RuntimeSessionOptions` 并列写在 `src/model/runtime.ts` 语境；实际 `RuntimeSessionOptions` 定义在 `src/service/runtime/session.ts:38`。团队计划 §八-1、V1 §七-5 已记录；两文件均在写集内，不构成边界变化。
4. **基线漂移**：方案 `7b48cff` → 团队计划 `b5b21d1` → V1 `7ba8a33` → 当前 `dc21fc1`（PR #65 已合入）；本提案按当前 HEAD 只读核对，行号锚点仅作定位，实施以符号名/文本锚点为准；实施入口仍须更新基线并重记 B0，旧证据不复用（团队计划 §1.4/§八-7）。
5. **`contextSections` 的"空/缺省"落点**：方案 §5.2 要求"空数组/缺省 ⇒ 系统提示逐字不变"；本提案在 Service 侧只做"未定义才不注入"，把"空数组不拼接"留给 C4 适配器（方案 §4.3.1"非空才拼"）。属实现分工细化，不改变语义。
6. **工具层截断**：方案把 48,000 字上限归渲染器（C1b，AC-13）；本提案明确工具层不加第二套截断（§3.5/§8-R1）。若验收要求工具层兜底，属契约加严，需 P1/验收确认。
7. **`roleId`/`section` 的空白归一**：P1.1 只写"必须精确匹配矩阵中已有 roleId"与枚举值，未规定首尾空白；本提案取"trim 后精确匹配"（§8-R2），属未决细节，请审核裁决。
8. **`api-spec.md` / 功能文档更新时点**：本提案只写变更记录；`api-spec.md` 与 `docs/feature/runtime-core.md` 的实际更新放在 C2 实施完成后按实际行为进行（未实施前不改，避免把计划写成结果）。

**未发现**其它与 P1.1/团队计划冲突的影响面：`buildGovernedTools`、`describeTool`、`RuntimeSessionOptions`、`RuntimeProviderOptions` 的锚点均与当前代码一致；本层不触达的模块（门禁、派发、冻结/trunk/VCA/stable-write、三适配器实现）行为不变。

---

## 10. 声明

本提案已按本文与 PM 裁决（R1–R8）实施：C2 产物为 `src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts` 与 `test/runtime-core/governance-matrix-tool.test.ts`；状态 **`implemented-unverified`**（候选快照 `839b922f…`），未 commit/push/merge/release。T2/T3 证据（typecheck 0；T3 4,130/4,103/9/18，新增失败/skip 0）、runtime-core 子集计数与偏差见 [实施记录](2026-11-05_governance-authority-matrix-runtime-core-implementation.md)。独立验收的 AC-18 文档收口由本次修订（提案状态 + 实施记录 + api-spec 增量）完成，最终判定以 E2 复判为准；提交/推送/合并/发布另需客户授权。
