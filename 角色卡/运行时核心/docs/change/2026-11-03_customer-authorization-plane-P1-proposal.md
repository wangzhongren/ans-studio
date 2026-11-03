# 运行时核心 P1 实现提案：客户授权平面 Model 契约（A1，Revision 1）

- **任务 / 角色 / 阶段**：`2026-11-03-customer-authorization-plane`（flowId `customer-authorization-plane`，T3）；运行时核心（独立固定上下文）；P1 实现提案（团队计划 §4.3：A1 Model 契约/解析器/高危谓词）。
- **日期 / 状态**：2026-11-03（Revision 1）；`proposal-only, no code`——只写本文件，**未改任何产品/测试代码，未运行测试/应用，未 commit/push/merge/release**。项目管理 P1 审核非 `recommend approval` 前 A1 不开工。
- **写入路径**：`角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-P1-proposal.md`（本阶段唯一写盘文件）。
- **标注约定**：**[事实]** 只读实测；**[候选·方案已定]** 直接取自 P1.1/团队计划已确认口径；**[候选·待审核]** 为冻结形状新裁的细节，请 P1 审核确认。未实施内容不写成已实现。

## 1. 输入与基线（只读实测）

| 输入 | 行数 | SHA-256 |
| --- | --- | --- |
| 团队计划 v1（闸门 2 确认） | 653 | `37e6bd0dcf63a29fde654ded9a1425272692b95483bab5c276cbdd16f4122fe3` |
| 团队计划 §十三增补（C2 写集；不改 A1） | 664 | `ecac818c705b97203aa6b711c34934be0bc324f21f9e24ed949ebf915ecd56b8` |
| 方案 P1.2（当前，R1/R2 编辑性收口） | 1209 | `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688` |
| 方案 P1.1（闸门 1 客户确认版；E2 基线） | 1199 | `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229` |
| V1 验收标准（含 §1.2.1 P1.2 版本注记） | 1171 | `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069` |
| B0 基线记录 | 239 | `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441` |
| 沟通记录（当前，含闸门 0/1/2、IA、V1/P1.2/B0/H1、W-1 裁决） | 168 | `9f19821e2bc725d24b66d73029fb08f1b7f2c3bd8ac92a32adcbce8ed54c0e0c` |
| 独立复核 | 132 | `d258844527c382aeb1b575f9f0401a87422d557acc94fe2ea181924c6b5aa1b3` |

- **[事实]** HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；`git status --porcelain -- src app test` 为空；H1 已落地（boundary Section 1 含两新 Model 单文件）；`src/model/directive.ts`、`src/model/directive-marker.ts` 不存在；`src/app/test` 中 `@审批` 零命中。目标文件：`runtime.ts` 2734 行、`project-state.ts` 417 行；行号锚点为 `4c3a6e4` 快照，实施以符号名/文本锚点为准（AC-19）。
- **[事实·版本披露，非阻断]** 派发说明引用 P1.1（1199 / `7875ad6a…`）；worktree 现为 P1.2（1209 / `1748ad2d…`），系团队计划 §1.5 预告的 R1/R2 编辑性收口；沟通记录「P1.2 编辑性收口记录」与 V1 §1.2.1 均确认语义等价、不重开闸门 1。本提案以 P1.1 确认文本为准，P1.2 仅作澄清引用。派发说明另引用沟通 150 / `5d2858cd…` 与团队计划 653 / `37e6bd0d…`；实测当前为沟通 168 / `9f19821e…`（新增 W-1 裁决）与团队计划 664 / `ecac818c…`（§十三 C2 写集增补），二者均不改变 A1 写集/语义。**无停止项。**

## 2. 契约形状与单一来源

### 2.1 `src/model/directive-marker.ts`（新；primary owner：运行时核心）

```ts
export type DirectiveMarkerTarget = "approval" | "decision";
export interface DirectiveMarkerHit { readonly target: DirectiveMarkerTarget; readonly body: string }
export function parseDirectiveMarker(text: string): DirectiveMarkerHit | undefined;
```

- **[候选·方案已定]** 规则唯一来源：方案 §3.1 第 1–6 条。跳过开头 Unicode 空白（JS `\s`/`trimStart`，含全角空格）；首个非空白位置须为 `@审批` 或 `@决策`；标记后须为空白或文本结束（`@审批员`/`@审批-允许`/`@审批，允许`/`@决策X` 不命中）；多行正文；半角 `@`；`@边界` 不命中；空正文**命中**且 `body === ""`（面板留空、确认禁用）。
- **[候选·待审核]** `body = text.slice(token 结束).trim()`；`rawText` 由调用方保留全文，解析 `body` 只是面板预填建议。非字符串入参返回 `undefined`、不抛错。
- **[候选·方案已定]** 第 7 条“带图拒绝”不是解析器职责：解析器无图片入参；Interface 在命中且图片非空时拒绝（C1 实现与测试）。渲染侧只用本文件做回显抑制；**零 import**（无 `import`/`require`/Node 全局），可被渲染侧相对导入（沿用 `app/renderer/src/i18n/index.ts:14-29` 先例；不改 Vite/tsconfig）。

### 2.2 `src/model/directive.ts`（新；primary owner：运行时核心）

```ts
import type { DirectiveMarkerTarget } from "./directive-marker.ts";
import type { GovernanceFlowId } from "./runtime.ts";
import { GOVERNANCE_SLUG_PATTERN } from "./runtime.ts"; // flowId 校验唯一来源（runtime.ts:376）
export const CUSTOMER_DIRECTIVE_SCHEMA = "customer-directive/v1";
export const CUSTOMER_DIRECTIVES_REL = ".ans/state/customer-directives.jsonl";
export const CUSTOMER_DIRECTIVE_ID_PATTERN = "^d-[1-9][0-9]*$";
export const CUSTOMER_DIRECTIVE_RAW_TEXT_MAX_BYTES = 4096; export const CUSTOMER_DIRECTIVE_COMMAND_MAX_BYTES = 1024;
export const CUSTOMER_DIRECTIVE_HOST_MAX_LENGTH = 253; export const CUSTOMER_DIRECTIVE_PATH_MAX_BYTES = 512; export const CUSTOMER_DIRECTIVE_SELECTOR_MAX_BYTES = 256;
export type CustomerDirectiveTarget = DirectiveMarkerTarget; // 字面集合唯一物理定义在 marker
export type CustomerDirectiveUntil = "once" | "session" | "forever";
export interface DirectiveScope { flowId?: GovernanceFlowId } // decision only；approval 事件 scope 为 {}
export type ApprovalResource = { type: "shell"; command: string; cwd: string } | { type: "domain"; host: string; wildcard: boolean } | { type: "path"; path: string };
export type ApprovalAction = { kind: "allow"; resource: ApprovalResource } | { kind: "deny"; resource: ApprovalResource };
export type DecisionAction = { kind: "select-recommended" } | { kind: "select-option"; selector: string } | { kind: "reject" };
export interface DirectiveHighRiskRecord { reasons: string[]; acknowledged: true; acknowledgedAt: string }
export type DirectiveCreatedEventV1 = { version: 1; kind: "directive.created"; id: string; seq: number; until: CustomerDirectiveUntil; rawText: string; highRisk?: DirectiveHighRiskRecord; sessionId: string; createdAt: string; createdBy: "customer"; source: "desktop-input" } & ({ target: "approval"; action: ApprovalAction; scope: {} } | { target: "decision"; action: DecisionAction; scope: DirectiveScope });
export type DirectiveEventV1 = DirectiveCreatedEventV1 | { version: 1; kind: "directive.consumed"; id: string; seq: number; at: string; via: { requestId?: string; toolCallId?: string; flowId?: string } } | { version: 1; kind: "directive.revoked"; id: string; seq: number; at: string; by: "customer" } | { version: 1; kind: "directive.expired"; id: string; seq: number; at: string; reason: "app-restart" | "unused-once" | "ttl" };
```

- **[候选·方案已定]** `CustomerDirectiveView`（id/seq/target/action/scope/until/status `active|consumed|revoked|expired`/rawText/createdAt/consumedAt?/revokedAt?/expiredAt?/expiredReason?/highRisk?/consumer `shell-gate|decision-card|none`）与字段约束（字段名、上限、`seq` 正整数单调、`action` 与 target 匹配、`rawText` 不打印到诊断/模型）逐字按方案 §5.2。
- **[候选·待审核]** 事件用可判别联合强化 §5.2 的 `action/target` 匹配约束（JSON 形状不变，仅增强编译期检查）。事实类型 `ApprovalDirectiveFact`/`DecisionDirectiveFact` 为两个不兼容类型（`target` 字面判别 + 互斥 `action.kind`），快照 `ApprovalDirectiveSnapshot`/`DecisionDirectiveSnapshot` 各为 `{ ledgerErrors; active: 本 target facts[] }`（方案 §5.4/§6.4 I-1/I-2）。
- **[候选·待审核]** `CUSTOMER_DIRECTIVES_REL` 放 Model 作单一来源（方案 §5.1 允许 Provider/Model 常量）；不 import `config-loader.ts`（避免 Model↔shared/运行层耦合）。`reasons` 保持 `string[]` 存储形状；谓词返回稳定码（2.3），未知码保留不吞。
- **[候选·方案已定·P1-CAP-13]** `CUSTOMER_DIRECTIVE_ID_PATTERN`、`CUSTOMER_DIRECTIVES_REL` 与全部字段上限常量（`RAW_TEXT_MAX_BYTES`/`COMMAND_MAX_BYTES`/`HOST_MAX_LENGTH`/`PATH_MAX_BYTES`/`SELECTOR_MAX_BYTES`）由本文件单一来源导出；B1 的 Provider/Service/`task-state`/`run-manifest` 直接 `import`，**不复制字面量**；无法 import 处须加 A1/B1 双向契约断言（§2.7）。

### 2.3 高危谓词（`directive.ts`，纯函数，方案 §4.3）

```ts
export const DIRECTIVE_HIGH_RISK_REASONS = ["forever", "project-decision-reject", "project-decision-select-option", "wildcard-domain", "wide-path", "wide-command", "switch-off-project-recommended"] as const;
export type DirectiveHighRiskReason = (typeof DIRECTIVE_HIGH_RISK_REASONS)[number];
export type DirectiveHighRiskInput = { target: "approval"; action: ApprovalAction; until: CustomerDirectiveUntil; projectRoot: string } | { target: "decision"; action: DecisionAction; until: CustomerDirectiveUntil; scope: DirectiveScope; decisionGroupEnabled: boolean };
export function directiveHighRiskReasons(input: DirectiveHighRiskInput): DirectiveHighRiskReason[];
```

- **[候选·方案已定]** 真值表：`forever`；decision `reject` + 无 `flowId`；decision `select-option` + 无 `flowId`；approval `domain` host 空/`*`/`*.` 前缀；approval `path` 盘符根/`/`/含 `**`/等于项目根/项目根祖先；approval `shell` 含 `;`/`&&`/`||`/`|`/`>`/`<`/反引号/`$(`/`*`/换行；decision `select-recommended` + 无 `flowId` + `decisionGroupEnabled === false`（Q7 A，R2）。
- **[候选·待审核]** 稳定 reason 码入账（面板文案由 A3 i18n 映射，Model 不含用户可见字符串）；`projectRoot` 与 `path` 由调用方按账本校验同一规则规范化后传入，谓词只做纯字符串比较（不做 OS 判定/IO）。

### 2.4 `src/model/runtime.ts` 加法（Q9 A；[候选·方案已定]）

- `ShellReviewResult`（:242-244）两个分支各加可选 `directive?: { id: string; scope: "once" | "session" | "forever" }`（`scope` 沿用既有 `ShellGrant.scope` 命名，值即账本 `until`；与 `grant?` 并列互斥来源；团队计划 §4.3 冻结为 `{id, scope}`）。
- `CustomerInputOutcome` 的 `answered`（:523-539）与 `declined`（:540-552）分支各加可选 `directive?: { id: string; action: "select-recommended" | "select-option" | "reject" }`；`unavailable` 不加；`operatorId:"directive:<id>"` 由 C1 写入；P1.1 §6.2 第 8 条 `{id, action, scope}` 的 `scope` 不入本字段（W-2 以 `{id, action}` 冻结）。
- **Q9 A 归属字段（P1-CAP-01）**：`RequestResolvedEvent`（:804-836）`by: "judge" | "customer" | "directive"`，并新增可选 `directiveId?: string`（仅 `by === "directive"` 时由 C1 写 `d-<seq>`；旧事件无该字段仍可读）；`VersionDecisionEvent`（:918-938）新增可选 `directiveId?: string`，其 `decidedBy`（:930）经 `project-state.ts:91` 的 `VersionDecisionDecidedBy` 加 `"directive"`（§2.5）。字段为普通 `string`，不 import `directive.ts`（避免双向 type-only 循环）。
- **不改**：`RequestPresentedEvent.to`（:797-801）仍为 `"customer" | "judge"`（W-6：代选/拒绝在 present 前完成，不伪造通道）；`ApprovalResolvedEvent.by`（:875）不在本平面；`GovernanceJudgeFacts`（:1874-1941，O3 未实施）。
- 依据方案 §9.2/Q9 A、V1 AC-10/AC-15；不改既有字段/默认值/联合分支语义；不新增第二份 until/action 类型定义（结构字面量由契约测试双向可赋值断言锁定，§2.7）。

### 2.5 `src/model/project-state.ts` 加法（[候选·方案已定]）

- `VersionDecisionDecidedBy`（:91）：`"customer" | "judge"` → `"customer" | "judge" | "directive"`；邻接注释同步。文件保持“纯类型/常量、不 import `runtime.ts`”的既有依赖方向；`runtime.ts:13-17` 已单向 type-import 本文件。`VersionDecisionEvent.directiveId?` 属事件字段，放 `runtime.ts`（§2.4），本文件不新增事件字段。

### 2.6 单一 primary owner（消费方只读）

| 契约 | primary owner | 消费方（只读引用） |
| --- | --- | --- |
| `parseDirectiveMarker` / `DirectiveMarkerTarget` | `directive-marker.ts`（运行时核心） | C1 主进程权威识别、C2 回显抑制 |
| 事件/视图/facts/高危谓词/常量 | `directive.ts`（运行时核心） | B1 Provider/Service/Pipeline、C1、C2、D1 |
| `ShellReviewResult` / `CustomerInputOutcome` | `runtime.ts`（运行时核心） | B1 gate/audit、C1 decision 消费者 |
| `VersionDecisionDecidedBy` | `project-state.ts`（运行时核心） | B1 `task-state`/`version-decision`/`run-manifest`、C1 读者 |
| `SendResult`（含 `directive?`）/ Pipeline 句柄 / i18n | C1（`app/desktop/session.ts`）/ B1（`customer-directive.ts`）/ A3 | 不在 A1 写集，A1 不代写 |

### 2.7 `test/runtime-core/directive-contract.test.ts` 断言计划（P1-CAP-01/13）

- **编译期（`npm run typecheck` 覆盖 `test/`）**：`RequestResolvedEvent["by"]` 可赋 `"directive"` 且 `"judge" | "customer"` 不回归；`directiveId?: string` 可省略/可赋值、传 `number` 报错；`VersionDecisionEvent["decidedBy"]` 可赋 `"directive"`，`directiveId?: string` 同上；`RequestPresentedEvent["to"]` 仍恰为 `"customer" | "judge"`，用 `@ts-expect-error` 断言 `to:"directive"` 不可赋值（W-6）。
- **形状锁**：`ShellReviewResult` 两分支的 `directive?: { id: string; scope: "once" | "session" | "forever" }`、`CustomerInputOutcome` 的 `answered`/`declined` 分支的 `directive?: { id: string; action: "select-recommended" | "select-option" | "reject" }` 与冻结字面量做双向可赋值断言（任一侧漂移即 typecheck 失败）；`unavailable` 无 `directive`。
- **B1/C1 可 typecheck 的冻结声明**（仅验证 A1 冻结面可被下游编译，不实现下游行为）：B1 侧声明 `const r: RequestResolvedEvent = { …, by: "directive", directiveId: "d-1" }` 并以 `CUSTOMER_DIRECTIVE_ID_PATTERN` 编译正则；C1 侧对 `CustomerInputOutcome.directive`、`VersionDecisionDecidedBy`（含 `"directive"` 分支）与 `ShellReviewResult.directive.scope` 写消费式声明/穷举 `switch`。
- **运行时（`node --test`）**：`CUSTOMER_DIRECTIVE_ID_PATTERN` 构造 `RegExp` 接受 `d-1`/`d-999`、拒绝 `d-0`/`d-01`/`D-1`/`#d-1`；`CUSTOMER_DIRECTIVES_REL === ".ans/state/customer-directives.jsonl"`；上限常量为正整数；带/不带 `directiveId` 的事件 JSON 往返且旧事件仍通过（加法兼容）。
- **边界**：不复制 B1 字面量（常量断言只读 A1 导出）；不测 B1/C1 运行时行为（跨层归 D1/D2）。

## 3. 分层依赖（[候选·方案已定]）

- Model 不依赖 Provider/Service/Pipeline/Interface/`src/common/编排/**`；`directive-marker.ts` 零 import；`directive.ts` → `directive-marker.ts` / `runtime.ts` 单向；`runtime.ts` **不** import `directive.ts`（避免 type-only 双向循环，沿用 `project-state.ts` 首行纪律）。
- Provider/Service/Pipeline/Interface 只 import Model；`shell-gate.ts` 只经注入回调与 Pipeline 交互，不 import Service/Provider；渲染侧只导入 marker 文件，不把 `runtime.ts`/`directive.ts` 打进渲染包；无 Vite alias/tsconfig 改动。

## 4. 精确写集与非目标

- **产品（4，路径不变）**：`src/model/directive-marker.ts`（新）、`src/model/directive.ts`（新）、`src/model/runtime.ts`（含 Q9 A：`RequestResolvedEvent.by/directiveId`、`VersionDecisionEvent.directiveId`）、`src/model/project-state.ts`（`VersionDecisionDecidedBy`）。
- **测试（2，路径不变）**：`test/runtime-core/directive-marker.test.ts`（新）、`test/runtime-core/directive-contract.test.ts`（新；断言计划见 §2.7）。均在 B-1 + `test/runtime-core/` 目录授权内，**不超出 B-1**。
- **自身文档**：A1 完成记录与证据 `角色卡/运行时核心/docs/change/…-evidence/`（非产品候选）；不写其他角色文件、角色卡/边界/YAML/changelog、`docs/{planning,scheduling,communication,acceptance}`。
- **不做**：新依赖/新工具/CLI 入口/网络或目录审批闸/模型解释字段/`@边界`/英文别名/全角 `＠`/第二份解析器；不改 `package.json`/`tsconfig*`/`vite.config.ts`/发布配方；不 commit/push。

## 5. AC 映射（A1 直接承担/提供证据）

| AC | A1 交付 | 其他角色 |
| --- | --- | --- |
| AC-1 识别规则 | `directive-marker.test.ts` §3.1 全示例 + 近失配/多行/全角/空正文真值表；带图命中判定依据（解析器命中 + C1 图片校验） | C1/C2/D2 面板与截图 |
| AC-6 schema 部分 | 事件/视图/facts 类型、`customer-directive/v1`、`d-<seq>` 模式、字段上限常量、`seq/action/target/until` 约束 | B1 行为/账本样例、D1 |
| AC-7 类型隔离 | `ApprovalDirectiveFact`/`DecisionDirectiveFact` 不兼容 + `@ts-expect-error` 编译期负例（I-1）；契约测试断言目标判别 | B1 运行时过滤/撤销、C1 facts 消费、D1 提示词快照 |
| AC-10 归属/枚举部分 | `RequestResolvedEvent.by` 加 `"directive"` + `directiveId?`、`VersionDecisionEvent.directiveId?`、`VersionDecisionDecidedBy` 加 `"directive"`；`CustomerInputOutcome.directive` 形状 | B1/C1 四处归属、A3 文案、D2 |
| AC-13 谓词 | §4.3 真值表（7 项 + 非高危示例；Q7 A 布尔入参） | C1 主进程复核、C2 截图、D2 |
| AC-14 结构部分 | 资源仅 `shell/domain/path`、动作仅选择/拒绝，无写权目标；无新工具 | B1/C1 行为负例、D1 |
| AC-15 加法兼容 | 仅可选字段/枚举扩展（含 `runtime.ts` Q9 A 字段，旧事件可读）；不改既有字段语义；契约测试双向可赋值 | 各消费方重测、D1 T3 全量 |
| AC-18 T3 | A1 原始输出、候选哈希、冻结声明 | E1 汇总、D1/D2 |
| AC-19 / AC-20 支持 | `runtime.ts` 冲突归本角色、rebase 后重跑 A1 证据；Model diff 结构检查（无 `@边界`/别名/模型字段/CLI） | 统筹/桌面窗口、E1/E2 |

## 6. T3 验证与冻结声明（A1 退出）

- **单测**：`node --test --test-concurrency=1 "test/runtime-core/*.test.ts"`（B0 逐字命令；B0 基线 37 文件 / 282 tests / 275 pass / 3 fail / 4 skip，3 fail 为既有 Windows symlink `EPERM`）。A1 后对比：**新增确定性失败 0、新增 skip 0**，既有失败逐名对应，不宣称整组全绿。
- **类型**：`npm run typecheck` 退出码 0（tsconfig `include:["src","test","app"]` 覆盖 `test/runtime-core/`，故 `@ts-expect-error` 负例与 §2.7 的 B1/C1 冻结声明真实生效）。
- **候选哈希**：六个文件逐一 `git hash-object` + `sha256sum`；`git status --porcelain -- src app test` 仅上述六路径；`git diff --cached --name-only` 为空；命令/退出码/Node/npm/OS 入证据。
- **冻结声明格式**（A1 完成记录与交 B1/C1/C2 的通知同文）：
  `A1-customer-directive-model freeze v1 | baseline HEAD: <40位> | files: <path> <git hash-object> <sha256>… | commands: <命令+退出码> | surface: parseDirectiveMarker / directive.ts 导出 / runtime.ts 两可选字段 / project-state.ts 枚举 | status: implemented-unverified | change rule: 任何形状变化回运行时核心重跑 A1 并使其消费方证据失效`

## 7. 实施顺序与交接

- 入口：P1 审核 `recommend approval` + IA（已给）→ A1；A1 冻结先于 B1（需 A1+A2）、C1（A1+B1+A3）、C2。A1/A2/A3 写集不相交可并行，但 A1 冻结前 B1/C1/C2 不写引用代码。
- A1 只写上述六文件；`SendResult`、gate 注入、decision 消费者、IPC/preload 均归 C1/B1，A1 不代写。若 `origin/main` 前进，按团队计划 §八 rebase 并重跑 A1 证据（旧证据不复用）。

## 8. 风险与开放点（请 P1 审核裁决）

| # | 事项 | 提案口径 |
| --- | --- | --- |
| 1 | 方案版本 | 以 P1.1 确认文本为准，P1.2 仅 R1/R2 澄清（沟通/V1 已确认等价）；若审核认为 P1.2 改变语义，停止并回报统筹。 |
| 2 | `ShellReviewResult.directive.scope` 命名 | 团队计划冻结字段名为 `scope`（值=until），与既有 `ShellGrant.scope` 同风格；**不改名**，文档写清语义。 |
| 3 | until/action 字面量在 `runtime.ts` 内联 | 避免 `runtime.ts ↔ directive.ts` 双向 import；契约测试双向可赋值锁定，任一侧漂移即报错。 |
| 4 | 高危 reason 码 | 码表随 A1 冻结并成为账本持久值；A3 i18n 必须映射全部码，未知码透传不吞。 |
| 5 | 高危 `decisionGroupEnabled` | 必填入参（无默认），C1 传主进程 `isGroupEnabled("decision")`；Q7 A 已确认，Q7 若变更须重开闸门 1。 |
| 6 | body 语义 / 类型隔离证据 | `trim()` 后作面板预填、空正文命中、`rawText` 全文由 C1 保存；`@ts-expect-error` 由 `npm run typecheck` 验证，`node --test` 只跑运行时断言。 |
| 7 | 冻结后变更 | 任何字段/枚举/常量/谓词变化回运行时核心，重跑 A1 并通知 B1/C1/C2 重取受影响证据；不静默漂移。 |

## 9. 修订记录（Revision 1，2026-11-03）

- **触发**：P1 审核（193 行 / `65f888a6…`）结论 `needs revision`；本轮只做窄修订，不重写全文、不改已通过项。W-1 已由客户裁决 A（闸门 2 增补仅 C2 写集；团队计划 §十三 664 / `ecac818c…`、沟通 168 / `9f19821e…`），A1 写集/边界不变。
- **P1-CAP-01（阻断）——已处置**：
  - 改动位置：§2.4（`RequestResolvedEvent.by` 加 `"directive"` + `directiveId?: string`；`VersionDecisionEvent.directiveId?: string`；`decidedBy` 经 §2.5 扩展）、§2.5（`VersionDecisionDecidedBy` 加 `"directive"`）、§4（写集注明 `runtime.ts` 含 Q9 A 字段）、§2.7（断言计划）。
  - 依据：方案 §9.2/Q9 A、V1 AC-10/AC-15；`RequestPresentedEvent.to` 按 W-6 保持 `"customer" | "judge"`，`ApprovalResolvedEvent.by` 不动。
  - 证据/测试计划：`directive-contract.test.ts` 编译期正/负例 + B1/C1 冻结声明 + 常量运行时断言；`npm run typecheck` 0、`node --test` 新增确定性失败 0。
  - 范围：仅在 A1 既有 `src/model/runtime.ts` 单文件内加法，不新增路径/边界/文件/依赖。
- **P1-CAP-13（非阻断）——已处置**：§2.2/§2.7 明确 `CUSTOMER_DIRECTIVE_ID_PATTERN`、`CUSTOMER_DIRECTIVES_REL`、字段上限常量由 A1 `directive.ts` 单一来源导出；B1 的 Provider/Service/`task-state`/`run-manifest` 直接 `import`，不复制字面量；无法 import 处须加 A1/B1 双向契约断言。
- **未改项（保持已通过口径）**：`decisionGroupEnabled` 高危必填入参（Q7 A/R2；§2.3、§8 #5）；`ShellReviewResult.directive = {id, scope}`（scope=until）、`CustomerInputOutcome.directive = {id, action}`（P1.1 §6.2 第 8 条 `{id, action, scope}` 按审核 W-2 不采用）；`GovernanceJudgeFacts` 不加 O3 字段；六文件写集、分层依赖、T3/冻结声明口径不变。
- **状态**：仍为 `proposal-only, no code`；未运行测试/typecheck/应用，未改产品/测试代码/其他角色文档，未 commit/push。待项目管理窄复审；复审 `recommend approval` 前 A1 不开工。

## 10. 声明

本提案未写产品/测试代码，未运行测试/应用，未 commit/push/merge/release；只写本文件。不是实施、不是验收；A1 待 P1 审核 `recommend approval` 后按团队计划串行执行。无计划外新文件/新依赖/写集扩张；无实质冲突。
