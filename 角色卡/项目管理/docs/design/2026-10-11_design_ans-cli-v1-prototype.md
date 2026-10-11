---
id: ans-cli-v1-prototype-contract
type: design
title: v1 原型冻结对接设计：受治理会话链路
created: "2026-10-11"
updated: "2026-10-11"
timezone: Asia/Shanghai
status: accepted
related: [ans-cli-pi-runtime, ans-cli-pi-runtime-review]
events:
  - date: "2026-10-11"
    kind: designed
    summary: 客户经调度方确认实施 v1 原型；本文件冻结跨角色接口与写集，供四角色并行实现
  - date: "2026-10-11"
    kind: designed
    summary: 契约与实现对齐——边界改 YAML 固定格式、条件 slug、fail-closed 解析、配置单一来源；修正 §9 的 Pi 陈述为已核实事实
  - date: "2026-10-11"
    kind: designed
    summary: 会话形态裁决——resolveWrite 的 scope 改可选（无任务收窄）、新增 openRoleSession 多轮会话接口、桌面端每会话一次确认的授权模型
  - date: "2026-10-11"
    kind: designed
    summary: 契约追加（问题→修复）——ProjectConfig 增可选 builtInRoles（会话式入口可开启的内置治理角色）；setupRole 以「入口意图闸 + 该清单」双重约束，CLI role run 语义结构性不变。见 §2 与 docs/change/2026-10-11_change_su-session-open.md
---

# v1 原型冻结对接设计：受治理会话链路

> **状态**：客户经调度方确认实施第一版（原型）。本文件是**冻结的跨角色对接契约**，四个实现角色据此并行实现，写集互不重叠。
> 本文件吸收评审记录 `2026-10-11_design_ans-cli-pi-runtime-review.md` 的发现，并把其中 F4/F5/F6/F7/F9/F10 定为本次实现的接口约束。
> **凡本文件与已被客户确认的原设计冲突之处，以本文件为准**；原设计未在本文件重述的部分不构成实施依据。

## 0. 本期范围与非范围

**范围**：一条能跑通的受治理会话链路——`ans role run <角色> --task T-1` 走通：
解析角色 → 解析边界 → 建受治理工具集 → 假 runtime 尝试越界写入 → **在写之前被拒绝** → 给出可读拒绝信息（含**按根分组**的允许路径）。另交付 `resolveWrite` 单元测试。

**非范围（本版明确不做，已在回报中如实标注）**：
- **F1（2026-10-11 更正）**：Pi **真实存在且可安装**（包 `@earendil-works/pi-coding-agent@1.1.0`）。Pi 适配器须交付**真实适配器**——写成 Pi 的**扩展（extension）**，因为拦截只能经扩展的 `on("tool_call")` 注册；假适配器**仅留给单元测试**。已验证 API 事实见**附录 A**。
- **F2：§2.6 创建权不下放。** v1 之后由 ANS Governance 单独走流程；本版不涉及。
- **F3：不建立调度记录。** 本期无客户 pin 的 `.ans/project.json`，**不调用 task_ops、不写 `docs/scheduling/<task-id>.md`**，进度以对话回报为准。**这是已知偏离**：真实流程里该记录由 task_ops 唯一写入，编排不得直接写。
- 不做容器/OS 级沙箱（设计 §5.5 已知代价）；不做治理 `ans govern` 的完整 bootstrap（`govern-session.ts` 只做最小占位链路，见 §5）。

## 1. 分层与本项目角色

调用方向（已验收）：`Interface -> Pipeline -> Service -> Provider`；`Model` 由四层共享。**只允许相邻层调用**。

| 层 / 位置 | 文件 | 所属角色 |
| --- | --- | --- |
| Model | `src/model/boundary.ts`、`src/model/role.ts`、`src/model/decision.ts` | 门禁引擎（**唯一主属主**） |
| Service | `src/service/boundary/resolve-boundary.ts`、`src/service/role/resolve-role.ts`、`src/service/gate/resolve-write.ts` | 门禁引擎 |
| Provider | `src/provider/pi/session.ts`、`src/provider/pi/tools.ts` | Pi适配器 |
| Pipeline | `src/pipeline/orchestration/run-role.ts`、`src/pipeline/orchestration/govern-session.ts` | 编排 |
| Interface | `src/interface/cli/run.ts`、`src/interface/cli/govern.ts`、`src/interface/cli/init.ts` | 编排 |
| 入口/配置 | `src/index.ts`、`bin/ans.js`、`package.json`、`tsconfig.json`、`README.md` | 装配 |
| 测试 | `test/门禁引擎/`（门禁引擎自测）、`test/测试/`（跨角色联调） | 各自 |

**写集互不重叠**。任何角色只写自己边界 Section 1 内文件，不改他人文件、角色卡、边界或权限。

## 2. 冻结接口（Model，门禁引擎所有 / 全员只读引用）

```ts
// ---- src/model/boundary.ts ----
export type Root = "skill" | "project";

// F5：条目要能表达内置边界里的 Conditional directory 条件语义
export type EntryKind = "file" | "directory" | "conditional-directory";

export interface BoundaryEntry {
  root: Root;
  path: string;          // 相对该根的路径
  kind: EntryKind;
  // kind === "conditional-directory" 时必填：**固定格式 slug**（^[a-z][a-z0-9-]*$，
  // 如 role-restructuring），供 resolveWrite 机械判定；边界文档里的散文说明不参与判定。
  condition?: string;
  purpose: string;
}

// 条件 slug 的固定格式（客户裁决）：小写字母开头，后接小写字母/数字/连字符
export const CONDITION_SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;
export function isValidConditionSlug(value: unknown): value is string;

// F6：accepted 必须有证据来源，不得由程序自授权
export interface Acceptance {
  accepted: boolean;     // 证据充分且已接受时为 true
  source: string;        // 必填（accepted 为 true 时）：证据说明，如客户 pin 或配置来源
}

export interface BoundarySection1 {
  entries: BoundaryEntry[];
  boundarySource: string;    // 实际使用的边界文件路径
  acceptance: Acceptance;
  parseError?: string;       // 边界解析失败的原因；存在时 resolveWrite 拒绝一切写入（fail-closed）
}

// ---- src/model/role.ts ----
export type RoleKind = "project" | "built-in-governance";

export interface RoleLocation {     // F8：角色路径来自配置，不硬编码 角色卡/<角色>/
  card: string;                     // 项目相对路径，如 角色卡/编排/role-card.md
  boundary: string;                 // 项目相对路径
}

export interface ResolvedRole {
  id: string;
  kind: RoleKind;
  cardText: string;
  boundary: BoundarySection1;
  boundarySource: string;
  location: RoleLocation;
}

export interface ProjectConfig {
  projectRoot: string;
  skillRoot: string;
  roles: Record<string, RoleLocation>;                 // F8：由配置提供
  // 2026-10-11 追加：允许**会话式入口**（openRoleSession / 桌面聊天）开启的内置治理角色 id。
  // 这些角色无角色目录、不登记在 roles（登记会让 resolveRole 去读空路径）；由调用方据 listProject
  // 枚举（builtIn===true）填充。缺省/未设置 = 不额外允许任何内置角色——CLI `ans role run` 即此情形。
  builtInRoles?: string[];
  governanceBoundary?: { path: string; acceptance: Acceptance };
}

// ---- src/model/decision.ts ----
export interface AllowedPathsByRoot {   // F10：按根分组，拒绝信息无歧义
  skill: string[];
  project: string[];
}

export type WriteDecision =
  | { allowed: true; matchedEntry: BoundaryEntry }
  | { allowed: false; reason: string; allowedByRoot: AllowedPathsByRoot };

export interface TaskScope {            // F4：任务级收窄
  writeSet: string[];                   // 本项目相对路径的精确集合，必须是角色边界的子集
  conditions: string[];                 // 本次任务声明满足的条件 slug（用于放开 conditional-directory）
}
```

**内置治理角色可寻址（2026-10-11 追加，问题→修复）**：`ProjectConfig.builtInRoles` 是「会话式入口闸」的**数据面**——它只声明**哪些**内置治理角色可被会话式入口开启；**哪个入口能开**由编排的入口意图决定（`runRole` 恒 `allowBuiltInRoles:false`，`openRoleSession` 恒 `true`）。两个约束**正交**，缺一不放行。内置治理角色（su）无角色目录、不进 `roles`（登记会让 `resolveRole` 去读空路径），由门禁引擎 `listProject` 以 `builtIn:true` 枚举，调用方（桌面应用）据此填 `builtInRoles`——**不硬编码 id**。`role run`（CLI）只接受 `roles` 登记的项目角色，行为**不变**。详见 `docs/change/2026-10-11_change_su-session-open.md`。

**边界文档格式（客户裁决，2026-10-11）**：六个项目角色边界已由 Governance 迁移为 **YAML 固定格式** `角色卡/<角色>/boundary.yaml`，角色卡链接同步更新。技能自带 `references/built-in-boundary.md` 仍是 Markdown，位于技能安装目录、**改不了**，**保留为 legacy 回退**。YAML schema（解析**严格且 fail-closed**）：

- 顶层键只允许 `role`、`entries`；`entries` 必填且为数组。
- 条目键只允许 `kind`、`path`、`purpose`、`root`、`condition`；`kind`/`path`/`purpose` 必填。
- `kind` ∈ `file` | `directory` | `conditional-directory`；`root` ∈ `project` | `skill`，缺省 `project`。
- `kind: conditional-directory` 必填 `condition`，且必须匹配 `CONDITION_SLUG_PATTERN`。
- **未知键、缺必填、`kind` 非法、`condition` 缺或非法 → 整份边界解析失败**，写入 `parseError`、视为未接受，一切写入拒绝，理由「边界解析失败」。**不再「丢掉坏条目继续放行」。**

## 3. 冻结接口（Service，门禁引擎）

```ts
// src/service/boundary/resolve-boundary.ts
export function resolveBoundary(
  roleId: string,
  project: ProjectConfig
): Promise<BoundarySection1>;   // 项目覆盖（若已接受）优先，否则内置；返回 boundarySource 与 acceptance

// src/service/role/resolve-role.ts
export function resolveRole(
  roleId: string,
  project: ProjectConfig
): Promise<ResolvedRole>;       // 路径取自 project.roles[roleId]（F8）

// src/service/gate/resolve-write.ts —— 本版心脏
export function resolveWrite(
  targetPath: string,
  boundary: BoundarySection1,
  scope: TaskScope | undefined,   // 可选：undefined = 无任务收窄（chat / standalone）
  ctx: { skillRoot: string; projectRoot: string }
): WriteDecision;
```

**`resolveWrite` 必须遵守**（判定顺序：解析失败 → 接受门 F6 → 根归属与 F7 逃逸 → 匹配条目（含条件 slug F5）→ F4 writeSet 收窄（仅当给了 `scope`）；每条对应一个评审发现，测试须覆盖）：
- **边界解析失败优先**：`boundary.parseError` 非空 → 拒绝一切写入，理由「边界解析失败」（fail-closed）。
- 若 `boundary.acceptance.accepted !== true` 或 `acceptance.source` 为空 → 拒绝（F6）。
- 匹配 `entries`：`file` 精确、`directory` 目录下、`conditional-directory` **仅当 `scope.conditions` 含其 slug** 才激活（F5）；**命中条件目录路径但未声明条件 → 以独立理由「缺少条件 `slug`」拒绝**（与「未匹配任何条目」是两种不同理由）；未匹配 → 拒绝，并在 `allowedByRoot` 中**按根分组**列出允许路径（F10，未激活的条件目录不计入）。
- **任务收窄（F4，仅当给了 `scope`）**：`scope` 有值时，路径还须落在 `scope.writeSet` 内——角色边界是上界，`writeSet` 是其子集，在边界内但不在 `writeSet` 内 → 拒绝。**`scope === undefined`（chat / standalone 会话）→ 不做任务收窄**，只用角色边界判定。
- 根归属：按 `ctx.skillRoot` / `ctx.projectRoot` 判断目标属于哪个根；**跨根混淆**（用项目路径去命中技能条目，反之亦然）→ 拒绝。
- 规范化：`../` 路径穿越、大小写（Windows 不区分大小写）、Windows 反斜杠、绝对/相对混合 → 归一到根内相对路径后再判定。
- **符号链接 / junction 逃逸（F7）**：若目标路径（或其任一父目录）解析后落在允许根之外 → 拒绝。测试须含该情形。

**为什么「无任务收窄」不是放松**（客户裁决 2026-10-11）：角色边界本身就是该角色长期工作的**常设授权**；`writeSet` 是正式计划（plan / task_ops）在常设授权之上**额外**加的一层收窄，**只在有计划时才有意义**。对话里的任务在交谈中产生，不该要求先声明范围——故缺 `scope` 不等于漏掉 F4，授权上界仍是角色边界本身。（实现侧已核对：`src/service/gate/resolve-write.ts` 的 `scope` 已为可选，`scope === undefined` 时跳过 F4。）

## 4. 冻结接口（Provider，Pi适配器）

```ts
// ---- src/provider/pi/session.ts ----
export interface ToolCall { name: string; args: Record<string, unknown>; }

export interface SessionEvent {
  kind: "tool_call" | "denied" | "accepted" | "message" | "settled";
  summary: string;
  detail?: unknown;
}

export interface RoleSession {
  prompt(text: string): Promise<void>;
  events(): AsyncIterable<SessionEvent>;
  dispose(): Promise<void>;
}

export type WriteGate = (targetPath: string) => WriteDecision;   // 由 Pipeline 注入，绑定 resolveWrite

export interface RuntimeAdapter {
  composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }>;
  bindRole(role: ResolvedRole): Promise<RoleSession>;
}

// 假适配器：不调用任何真实 SDK，按 script 模拟模型动作，经受治理工具执行（**仅单元测试用**）
export function createFakeRuntimeAdapter(opts: {
  gate: WriteGate;
  script?: ToolCall[];       // 缺省：一次越界写（如 write_file 到 src/evil.ts）
}): RuntimeAdapter;

// 真实 Pi 适配器（F1 更正后）：基于 @earendil-works/pi-coding-agent@1.1.0 实现。
// 拦截只能经 **Pi 扩展** 的 on("tool_call") 注册（见附录 A）。
export function createPiRuntimeAdapter(opts: {
  gate: WriteGate;
  projectRoot: string;
  skillRoot: string;
}): RuntimeAdapter;
```

**真实适配器的实现要点（附录 A 为依据）**：
- 用 `createAgentSession({ noTools: "builtin", customTools: [...] })` 关掉内置 read/bash/edit/write，同时注册我们自己的受治理工具（V1 已答：可同时"内置不存在 + 注册自定义"）。
- 把 `buildGovernedTools(gate)` 的工具以 `customTools` 传入；拦截再经注册的 **Pi 扩展** `on("tool_call")` 兜底，处理器返回 `{ block: true, reason }`（第二层，V4 的 fail-closed 已确认）。
- `event.input` 可变，可改写参数；本版只需拦截。
- **命名陷阱（附录 A）**：Pi 自带的 `BoundaryState`/`BoundaryResult` 等指**会话上下文/压缩边界**，与本项目角色边界无关，**不要**据此改 `BoundaryEntry`。

```ts
// ---- src/provider/pi/tools.ts ----
export interface ToolResult { ok: boolean; message: string; }   // message 可读；拒绝时含按根分组的允许路径

export interface ToolDefinition {
  name: string;                              // 至少含 "write_file" 与 "edit_file"
  handler(call: ToolCall): Promise<ToolResult>;
}

// gate 由调用方（Pipeline）注入并绑定 resolveWrite；工具处理器在"写之前"调 gate
export function buildGovernedTools(gate: WriteGate): ToolDefinition[];
```

要点：受治理工具**由本角色注册**；`buildGovernedTools` 的 `write_file`/`edit_file` 处理器**先调 `gate(path)`**，`allowed:false` 时**不执行写入**，返回含允许路径的可读信息；`allowed:true` 时才"执行"（原型可不真正落盘或落盘到临时区，装配与 Pi适配器约定）。

## 5. 冻结接口（Interface + Pipeline，编排）

```ts
// ---- src/pipeline/orchestration/run-role.ts ----
export interface RunRoleInput {
  roleId: string;
  taskId: string;
  project: ProjectConfig;
  scope: TaskScope;
}
export interface RunRoleResult { code: number; transcript: SessionEvent[]; }
export function runRole(
  input: RunRoleInput,
  deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter }
): Promise<RunRoleResult>;

// ---- src/pipeline/orchestration/govern-session.ts ----
export function runGovernSession(
  input: { taskId: string; project: ProjectConfig },
  deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter }
): Promise<{ code: number }>;

// ---- src/interface/cli/run.ts ----
export function runRoleCommand(
  argv: string[],
  deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter }
): Promise<number>;

// ---- src/interface/cli/govern.ts / init.ts ----
export function governCommand(argv: string[]): Promise<number>;
export function initCommand(argv: string[]): Promise<number>;
```

### 多轮会话（新增，客户裁决 2026-10-11）

```ts
// src/pipeline/orchestration/（编排层；具体文件由编排实现时确定——待核实）
export interface RoleSessionHandle {
  send(text: string): Promise<void>;
  events(): AsyncIterable<SessionEvent>;
  dispose(): Promise<void>;
}
export function openRoleSession(
  input: { roleId: string; project: ProjectConfig; taskId?: string; scope?: TaskScope },
  deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter }
): Promise<RoleSessionHandle>;
// runRole 保持不动（CLI 一次性路径继续用它）。
```

`taskId` / `scope` 均可选：chat / standalone 会话不传 `scope`（无任务收窄，见 §3）；传入则恢复 F4。同一会话内连续 `send()` 多轮，`events()` 流式返回。（实现进度待核实：`openRoleSession` / `RoleSessionHandle` 目前**尚未在 `src/` 中找到**。）

**分工（F9 修正）**：编排**只做**命令解析、会话生命周期与编排（解析角色 → 解析边界 → 建 gate/tools → 建 adapter → bindRole → prompt → 收集事件）。**角色解析、边界解析、路径判定全部调门禁引擎**；Pi 调用全部经 Pi适配器。编排**不导入** `src/model/` / `src/service/` / `src/provider/` 的 `impl` 内部——只经它们导出的函数与类型。编排**不写任何 `docs/scheduling/` 记录**（F3 偏离）。

编排构造 gate：
```ts
const gate: WriteGate = (p) => resolveWrite(p, role.boundary, input.scope, {
  skillRoot: input.project.skillRoot, projectRoot: input.project.projectRoot,
});
```

**配置单一来源（2026-10-11 修正）**：演示配置（`projectRoot` / `skillRoot` / `roles` 及 `T-1` 的 `scope`）的**唯一来源在装配入口**（`src/index.ts`），经 `runRoleCommand(argv, deps)` 的**超集字段** `deps.project` / `deps.scope` 以纯值注入。编排**不自持第二份副本**：有注入即用注入值，缺失时以清晰错误结束（`requireProjectConfig` / `requireTaskScope`）。此前装配与编排各有一份、运行期实际生效的是编排那份——已消除该分裂。

### 会话授权模型（桌面应用，客户裁决 2026-10-11）

- **每会话一次确认**：打开一个角色的聊天时确认**一次**，显示角色、边界来源（`boundarySource`）、`acceptance`（含 `source`）与运行时；并明确告知「授权该角色按其**完整边界**工作」。
- **之后每条消息不再询问范围**——不再逐条派发弹确认显示 `writeSet`。这**取代**原先「每次派发弹确认并显示 writeSet」的写法。
- 写入由门禁按**角色边界**实时拦截（§3）。

（本节为目标形态的约定；`app/` 桌面端当前落地情况我未逐处核对，实现进度标为待核实。）

## 6. 入口与配置（装配）

```ts
// src/index.ts
export async function main(argv: string[]): Promise<number>;
```
`main` 只持有**Interface 层句柄**：解析 `argv` 后调用 `runRoleCommand` / `governCommand` / `initCommand`，不导入 Service/Provider 对象，不建导入全部层的中央工厂。

`bin/ans.js` 调 `main`。构建方式由装配决定，但**必须满足**：一条命令在本机（Node v24.11.1 / npm 11.6.2）实际跑通并打印输出。

**共同约定（全员遵守，避免接线漂移）**：
- **ESM**：`package.json` 用 `"type": "module"`。
- **原生 TS 类型擦除**：`bin/ans.js` 动态 `import('../src/index.ts')`，Node 24 直接擦除类型，**免 `npm install`**。
- **只用可擦除语法**：不得用 `enum`、`namespace`、构造函数参数属性、`declare` 类仅声明语法。
- **本地导入带显式 `.ts` 扩展名**：如 `import { resolveWrite } from "../../service/gate/resolve-write.ts";`。
- 若装配判定原生擦除不可行，退回 `tsc` 出 `dist/`——但**必须由装配统一处理所有导入扩展名**并在回报中说明。
- **依赖（F1 更正）**：`package.json` 声明依赖 `@earendil-works/pi-coding-agent@1.1.0`（Node v24.11.1 / npm 11.6.2 可安装）。真实 Pi 适配器需要它；纯单元测试仍可用假适配器（不依赖真实包）。

**默认演示配置**（`src/index.ts` 内嵌，属**配置数据**，不是解析逻辑硬编码；F8）：`projectRoot` 取仓库根，`skillRoot` 取 `process.env.ANS_SKILL_ROOT` 或默认技能目录；`roles` 为六个项目角色的 `{roleId: {card, boundary}}` 映射：

| roleId | card | boundary |
| --- | --- | --- |
| 项目管理 | `角色卡/项目管理/role-card.md` | `角色卡/项目管理/boundary.yaml` |
| 编排 | `角色卡/编排/role-card.md` | `角色卡/编排/boundary.yaml` |
| 门禁引擎 | `角色卡/门禁引擎/role-card.md` | `角色卡/门禁引擎/boundary.yaml` |
| Pi适配器 | `角色卡/Pi适配器/role-card.md` | `角色卡/Pi适配器/boundary.yaml` |
| 装配 | `角色卡/装配/role-card.md` | `角色卡/装配/boundary.yaml` |
| 测试 | `角色卡/测试/role-card.md` | `角色卡/测试/boundary.yaml` |

边界路径由 Governance 由 Markdown 表格迁移为 **`boundary.yaml`（YAML 固定格式，见 §2）**；`.md` 仅作技能内置边界的 legacy 回退。`governanceBoundary` 也指向 `角色卡/门禁引擎/boundary.yaml`。

**边界接受证据（F6）**：因无客户 pin 的 `.ans/project.json`，演示配置给各角色边界一个**如实标注为演示来源**的 `Acceptance`，例如 `{ accepted: true, source: "demo:embedded-config (无客户 pin，已知偏离)" }`。程序不自行判定接受——`accepted` 由配置提供，演示里如实标明来源非客户确认。

演示任务 `T-1` 的 `TaskScope.writeSet`：设为**某演示角色的边界子集**，以便同时演示 F4（边界内、writeSet 外的写入也被拒）。

## 7. 演示应看到什么

运行演示命令 `npm run demo`（等价于 `ans role run 编排 --task T-1`），应看到：
1. 解析出角色与边界来源；
2. 假 runtime 发起两次**写入**，每次都在**写入之前**先问 gate；
3. 第一笔 `src/evil.ts`（落在「编排」边界之外）→ 被拒，打印可读拒绝信息并**按根分组**列出允许路径（`skill:` / `project:`）；
4. 第二笔 `src/common/编排/output.ts`（在边界内、但不在任务 `writeSet` 内）→ 被拒（演示 F4 任务收窄）；
5. 进程以 `settled` 结束。**不产生** `docs/scheduling/` 记录（F3）。

注：演示用的假 runtime 是**装配自有的演示替身**（`src/common/装配/demo-runtime.ts`），**不是** §4 Provider 的 `createFakeRuntimeAdapter`（后者**仅单元测试用**），也不是真实 Pi 适配器。演示不需 API key，也不调用任何真实 SDK。

## 8. 各角色写集（汇总，互不重叠）

- **门禁引擎**：`src/model/*.ts`、`src/service/boundary/resolve-boundary.ts`、`src/service/role/resolve-role.ts`、`src/service/gate/resolve-write.ts`、`src/common/门禁引擎/`、`test/门禁引擎/`。
- **编排**：`src/interface/cli/{run,govern,init}.ts`、`src/pipeline/orchestration/{run-role,govern-session}.ts`、`src/common/编排/`、`test/编排/`。
- **Pi适配器**：`src/provider/pi/{session,tools}.ts`、`src/common/pi-adapter/`、`test/pi-adapter/`。
- **装配**：`src/index.ts`、`bin/ans.js`、`package.json`、`tsconfig.json`、`README.md`、`src/common/装配/`、`test/装配/`。
- **测试**：`test/测试/`。

## 9. 已知偏离与剩余风险

以下偏离**均未被 `ans-governed-construction` 技能认可**，如实记录，需由 Governance / 客户后续处置：

1. **边界文档格式 `boundary.yaml` 偏离技能的 `boundary.md` 约定。** 技能假设边界为 `boundary.md`（Section 1 Markdown 表格）；本项目六个角色边界已由 Governance 迁移为 YAML 固定格式（客户裁决，见 §2）。技能自带 `references/built-in-boundary.md` 位于技能安装目录、**改不了**，保留为 legacy 回退。
2. **无客户 pin 的 `.ans/project.json`。** `acceptance` 只带**演示来源**（`demo:embedded-config (无客户 pin，已知偏离)`），**不是**客户确认；程序不自行判定接受（F6），但也没有真实 pin 支撑。
3. **不建立 task_ops 调度记录。** 本版不调用 task_ops、不写 `docs/scheduling/<task-id>.md`（F3 偏离）；真实流程里该记录由 task_ops 唯一写入。
4. **§2.6「pm 创建角色」仍未走治理流程。** 该权限未取得，本版不涉及。

**仍未被验证（不得写成既成事实）**：
- **真实模型轮次未验证。** 真实 Pi 会话**可构造**（真实适配器冒烟测试通过：懒加载 Pi 包、`bindRole` 成功建会话），但**没跑过真实模型轮次**——本机无 API key。
- **容器 / OS 沙箱未做。** 门禁只在工具集层面生效；Pi 无内置沙箱。
- **`npm run typecheck` 跑不通。** 未安装 `typescript`，`tsc` 不在 PATH。
- **多轮会话 `openRoleSession` 未落地。** 客户裁决的冻结签名尚**未在 `src/` 中出现**（`grep openRoleSession` 无命中）；桌面端 `app/` 的会话授权模型落地情况未逐处核对。

**本版已亲自核对（有实际运行输出，非转述）**：Node `v24.11.1`；`node --test test/门禁引擎/*.test.ts` → **40 通过 / 0 失败**（含 F4/F5/F6/F7/F10、规范化、跨根）；`@earendil-works/pi-coding-agent` 已安装于 `node_modules`；真实适配器冒烟测试 **2 通过 / 0 失败**；`npm run typecheck` 实际报 `'tsc' 不是内部或外部命令`。

## 附录 A：已核实的 Pi API 事实（2026-10-11，来自实际包产物）

来源：包 `@earendil-works/pi-coding-agent@1.1.0`（仓库 `github.com/earendil-works/pi`，文档 `https://pi.dev/docs/latest/sdk`）。以下引用其随包的 `.d.ts` / `.js`，**不是文档转述**。（此事实集由客户/调度方提供并核实。）

- `createAgentSession(options)` → `{ session, extensionsResult, modelFallbackMessage? }`（`dist/core/sdk.d.ts`）。
- 选项（同文件）：
  - `noTools?: "all" | "builtin"`——`"builtin"` 关掉默认内置工具（read/bash/edit/write），**保留 extension/custom 工具**；
  - `tools?: string[]`——白名单，支持 `*`；纯 `+name`/`-name` 为增删默认选择；
  - `excludeTools?: string[]`——黑名单，在 `tools` 之后生效；
  - `customTools?: ToolDefinition[]`——注册自定义工具。
- 内置工具是**工厂函数**：`createReadTool`/`createWriteTool`/`createEditTool`/`createBashTool`/`createPowerShellTool`/`createGrepTool`/`createFindTool`/`createLsTool`/`createCodingTools`/`createReadOnlyTools`（`dist/core/tools/index.ts`）。
- **拦截经「扩展（extension）」体系**（设计文档此前未提）：`dist/core/extensions/types.d.ts:1200` 的 `on(event: "tool_call", handler)` → `ToolCallEventResult { block?: boolean; reason?: string; terminate?: boolean }`（:1065）；另有 `on("tool_result")`、`on("user_bash")`、`on("input")`；`registerTool(tool)` 注册工具。`ToolCallEvent` 按工具分型（`Bash`/`PowerShell`/`Read`/`Edit`/`Write`/`Grep`/`Find`/`Ls`/`Custom`，:960）。`event.input` **可变**（可改写参数）。
- **V 表更新**：**V1 已答**——`noTools:"builtin"` + `customTools`/`tools` 白名单能同时"内置不存在 + 注册自定义"，§5.1「构造」前提在 API 层成立。**V4 已确认且更硬**——`dist/core/agent-session.js:327-347` 的 `_beforeToolCall` 捕获后重新抛出，信息为 `Extension failed, blocking execution`，即处理器出错 → 工具在执行前被阻断，**fail-closed 属实**。**V3 是政策选择**——`bash` 可被 `noTools`/`excludeTools` 关掉；用户手敲 shell 另有 `on("user_bash")`；`createLocalBashOperations` 可替换。
- **命名陷阱**：Pi 自带 `BoundaryState` / `BoundaryResult` / `BoundaryContextPreview` / `SessionBoundaryDraft`（`dist/core/extensions/types.d.ts:762-771`）指**会话上下文/压缩边界**（`turn_end`、`agent_before_settle` 触发），**不是文件写入边界**，勿与本项目角色边界混淆，勿据此改 `BoundaryEntry` 设计。

仍未实测：真实 `createAgentSession` 在本机的端到端运行（含 `customTools` 与扩展注册的实际接线）。本版尽量跑通；跑不通的部分如实标注为未验证。
