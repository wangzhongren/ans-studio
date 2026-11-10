# W2（B2 批）：`doc_format` 工具契约实施记录（文档格式权威说明与全员可读）

- 日期：2026-11-09；角色：ans-studio 固定 worker「运行时核心」（roleId: 运行时核心）。
- 变更：`每个文档格式的权威说明与全员可读（T2）` 的 **B2 工具契约批次**（`GovernedToolsOptions.docFormat?` + `doc_format` 工具 + schema + 本角色 pin 测试）。
- 团队计划：`docs/scheduling/2026-11-09_team-plan_document-format-specifications.md`（§三/§四：写集 #3–#6 owner=运行时核心；串行「提案卡修复 → judge → 团队计划 run → 本变更」；Q13 默认 T2 + 全量受影响回归）。
- 方案 P1.2：`docs/planning/2026-11-09_design_document-format-specifications.md`（`886fef84…`；§3.1/§3.2/§4.1/§4.6/§7.1）。
- B1 v1（冻结判据）：`docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md`（`bec45edf…`；§2.1 #3–#6、§3.8/§3.9 AC-8/AC-9、§4.1 TM-7/TM-11、§4.3、§9.3 G1/S1）。
- 工作目录：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/document-format-specifications`；基线 HEAD **`3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`**（tree `e05d68ad…`；团队计划 run 已合并）。
- 状态：**B2 批四文件已实施；定向测试、全量 runtime-core 与 `npm run typecheck` 均已运行并记录；未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223；未验收。**

## 1. 范围（只本批 4 文件）

| # | 文件 | 改动 | 方案/B1 条目 |
| --- | --- | --- | --- |
| 1 | `src/model/runtime.ts` | 加法：`DocFormatPart` / `DocFormatInput` / `DocFormatResult` / `DocFormatFn`；`GovernedToolsOptions.docFormat?`（`:3609` 区域，`contractCheck` 相邻）。**仅新增 36 行，0 删除** | §3.1/§4.1、F11/G1/S1；AC-8/AC-9/AC-16 |
| 2 | `src/provider/runtime/tools.ts` | 新增 `DOC_FORMAT_TOOL_NAME`、预算常量、`makeDocFormatTool`；`buildGovernedTools` 在 `contractCheck` 相邻**注入才注册**（+95 行，0 删除） | §4.1/§4.6；AC-8/AC-9 |
| 3 | `src/provider/runtime/schema.ts` | 新增 `describeTool("doc_format")`：扁平 schema + description + `promptGuidelines`（+26 行，0 删除） | §4.3/§4.6；AC-8/AC-9 |
| 4 | `test/runtime-core/doc-format-specs-pin.test.ts`（新建） | 11 个用例：扁平 schema/注入才注册/未知与非字符串/数据源 null·空·抛错/`tools/list` 形状/`toPiTool`/MCP 声明交叉钉住/预算与截断 | TM-7/TM-11；AC-8/AC-9/AC-17 |

**未改**（写集外 diff = 0，逐项只读）：B1 的 `src/common/编排/doc-format-specs.ts`（`f141e4ba…`）与 `test/编排/doc-format-specs.test.ts`（`f9abe8f3…`）哈希与派发给定一致（证据 `08-candidate-hashes.txt`）；`workflow-preconditions.ts`、`run-role.ts`、`app/desktop/**`、`app/renderer/**`、`角色卡/**` 的 role-card/boundary、其它角色测试与文档均未改。`git status --porcelain -- src app test` 仅：本批 3 个 M + 1 个新测试；B1 2 个未跟踪文件（既有在飞）；**另有 `test/门禁引擎/doc-format-specs-pin.test.ts`（门禁引擎 B3 批的未跟踪文件，非本角色、非本批候选，未触碰）**。

## 2. 实现要点

### 2.1 Model 契约（`src/model/runtime.ts`，加法可选、non-breaking）

```ts
export type DocFormatPart = "fields" | "example" | "errors";
export interface DocFormatInput { format?: string; part?: DocFormatPart }
export type DocFormatResult = string | null | undefined | void | Promise<string | null | undefined | void>;
export type DocFormatFn = (
  input: DocFormatInput,
  metadata?: { roleId?: string; turnId?: string; runtime?: RuntimeKind },
) => DocFormatResult;
```

- `DocFormatResult`/`DocFormatFn` 采用派发允许的「与 `ContractCheckFn` 完全同型」变体（S1：数据源返回纯文本，工具层统一 `{ok:true,message}`/`{ok:false,message}` 信封）；未采用 `signal?: AbortSignal` 变体——中止由工具层 `raceAbort(..., call.signal, ...)` 保证（与 `contract_check` 一致），静态文本数据源无需接收信号。
- `GovernedToolsOptions.docFormat?` 注释明示：**注入才注册**、只读（不写盘/不入队/不改权限/状态）、静态公开文本、不构成放行/授权。
- 仅新增；未触碰 judge/团队计划 run 已合并区域（`DocFreeze*`、`requestResolvedD3DecisionId` 等）与其它类型。

### 2.2 工具（`src/provider/runtime/tools.ts`：`makeDocFormatTool`，模式对齐 `makeContractCheckTool`）

- 输入（扁平对象）：`format?: string`、`part?: "fields"|"example"|"errors"`。
  - `format`：`null`/缺省/空串/仅空白 ⇒ 索引模式；**非字符串拒绝**；**未知 id 在本层 fail-closed 拒绝**，消息 `未知格式 <回显≤40字符>；可用：<全部 id>`（与 B1 注册表未知-id 纯文本逐字同口径，测试以 `docFormatSpecText("no-such/v1")` 全等断言）。
  - `part`：缺省 ⇒ 全部；非字符串/未知值拒绝（`fields|example|errors`）。
- 数据源：`raceAbort(Promise.resolve().then(() => fn(input, metadata)), call.signal, ...)`；metadata 传 `roleId`（scope）+ `turnId`（`currentTurnId()` 捕获）+ `runtime`（scope），与 `contract_check` 同型。
- 信封：数据源抛错 ⇒ `{ok:false}`（「格式说明读取未完成（原因…）；不要据此猜测」）；null/空/非字符串 ⇒ `{ok:false}`（「数据源未返回格式说明（结果不明）」）；非空文本 ⇒ `{ok:true, message}`。
- 注册：`buildGovernedTools` 中 `if (options?.docFormat !== undefined) tools.push(makeDocFormatTool(...))`，位于 `contractCheck` 与 `evidenceCheck` 之间；**未注入 ⇒ 工具不存在、既有工具 schema/描述/准则逐字不变**（测试逐工具 deepEqual 钉住）。
- 已知 id 来源：`import { docFormatKnownIds } from "../../common/编排/doc-format-specs.ts"`——该模块自述为「稳定公开只读入口」，且 `tools.ts` 已从 `common/编排/` 导入 `mechanical-rejection.ts`/`write-journal.ts`/`evidence-check.ts`（依赖方向有先例；已核对无循环：`doc-format-specs` 的传递依赖不反向 import `provider/**`）。

### 2.3 Schema（`src/provider/runtime/schema.ts`）

```jsonc
// describeTool("doc_format").parameters（顶层扁平；required 可为空数组；无顶层 oneOf/anyOf）
{ "type": "object",
  "properties": {
    "format": { "type": "string", "description": "Optional format id (e.g. \"project-intent/v1\")…" },
    "part": { "type": "string", "enum": ["fields", "example", "errors"], "description": "Optional narrowing…" } },
  "required": [], "additionalProperties": true }
```

- `description` 明示：写任何治理文档/角色卡/边界/验收标准/提案/意图前**先查**；**无参数调用返回全部格式索引**；`format=<id>` 详情、`part` 缩小；超 8 KiB 截断并如实标注；**纯读、不构成放行/授权**；未知 format 返回可用 id 列表、不猜测。
- `promptGuidelines` 3 条（非空）：写前先查/不凭记忆猜 schema；不知 id 先取索引；只读不构成放行、查询成功≠校验通过。
- 未改其它任何工具的 schema/描述。

### 2.4 注入矩阵（本批实现面；其余注入层属并行批次）

| 会话/调用方 | 行为 | 依据 |
| --- | --- | --- |
| 注入 `GovernedToolsOptions.docFormat`（桌面将给 6 内置 + 项目角色会话注入） | 注册一只 `doc_format` | 本批 `buildGovernedTools`「注入才注册」 |
| CLI/旧调用方/未注入（含 judge 会话，不经 `buildGovernedTools`） | **工具不存在**，既有行为逐字不变 | fail-closed；测试覆盖 |
| `openRoleSession` 输入 / `AdapterCapabilities` / 桌面 `docFormatText` 数据源 | **不在本批**（编排/桌面窗口批次），本批只定义消费契约 `DocFormatFn` | 团队计划写集 #7–#9 |

## 3. 预算与截断

- 数据源正常路径实测（Node v24.22.1，`Buffer.byteLength`）：**索引 5,223 B；最大详情 4,089 B（`project-roster/v3`，part=all）**——与派发引用的 B1 实测一致，均 ≤8192 B；测试循环断言全部 54 个 spec 的详情 ≤8192 B，并把实测值写入 TAP diagnostic。
- 工具层防御性上限 `8 * 1024` B：超限用 `truncateUtf8` 按 UTF-8 字节截断（不劈开多字节码点/代理对），尾部附 `…（已截断；用 part=fields|example|errors 缩小范围）`；测试以 9,000 B ASCII 与 9,000 B 多字节（`文`×3000）验证总输出 ≤8192 B、标注在场、无替换字符。

## 4. 测试与运行记录

Node **v24.22.1**；worktree 根执行；TAP 日志见 §6。

| 套件/命令 | 结果 | 日志 |
| --- | --- | --- |
| `node --test --test-concurrency=1 test/runtime-core/doc-format-specs-pin.test.ts`（**新建**） | **before：文件在 HEAD 不存在**（`git ls-tree HEAD` 无记录）；**after：11 tests / 11 pass / 0 fail / 0 skip / exit 0** | `01-pin-tap.txt` |
| `node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"` | 554 / 517 pass / **33 fail** / 0 cancelled / 4 skip / exit 1；33 条失败标题集合（`09-failure-set.txt`）与本基线既有红同类（judge B2 报告记录 runtime-core 既有红 **33**、含 `doc-freeze reason 九类… 10 !== 9` 陈旧断言）；新增 11 条全过 ⇒ 除本批新增文件外零变化、**新增确定性失败 0、新 skip 0** | `02-runtime-core-dir-tap.txt` |
| `node --test --test-concurrency=1 test/runtime-core/mcp-declarations.test.ts` | 6 / 6 pass / exit 0（既有断言原样全过） | `03-mcp-declarations-tap.txt` |
| `node --test --test-concurrency=1 test/编排/doc-format-specs.test.ts`（B1 只读） | 24 / 24 pass / exit 0 | `04-doc-format-specs-registry-tap.txt` |
| `node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts`（contract topic 回归） | 29 / 29 pass / exit 0 | `05-workflow-preconditions-tap.txt` |
| `node --test --test-concurrency=1 test/桌面应用/rejection-copy.test.ts`（`contract_check` 既有工具测试，只读回归） | 17 / 17 pass / exit 0 | `06-rejection-copy-tap.txt` |
| `npm run typecheck`（`tsc --noEmit`） | **exit 0** | `07-typecheck.txt` |

pin 测试覆盖（11 用例，均不使用 skip/force-exit）：① `describeTool("doc_format")` 顶层 object + 非空 properties（恰 `format`/`part`）+ `required` 数组 + 无顶层 `oneOf`/`anyOf` + 描述含「先查/无参数调用返回全部格式索引/只读/不构成放行/授权」+ `promptGuidelines` 非空；② 注入才注册（无 ⇒ 不存在；有 ⇒ 恰多一只；既有工具 schema/description/promptGuidelines/executionMode 逐项 deepEqual 不变）；③ 正常索引/详情（消息与注册表同源、首行固定 `doc_format（只读；不构成放行/授权；doc-format-specs/v1）`、含 `specRevision`）；④ 未知 format（`{ok:false}`、消息与 `docFormatSpecText` 未知文本逐字一致、回显 ≤40+省略号、零数据源调用）；⑤ 非字符串 `format`/非字符串与未知 `part`（拒绝、零数据源调用）；⑥ 数据源 null/undefined/空白/抛错（`{ok:false}`、不抛不猜）与正常 `{ok:true}`；⑦ 扁平输入与 metadata（`roleId`/`turnId`/`runtime`）透传；⑧ MCP `tools/list` 形状（按 `codex/session.ts:693` 同映射：`inputSchema.properties` 非空、无顶层 union）；⑨ `toPiTool` 参数/描述/准则与 `describeTool` 同源且非空；⑩ MCP 声明 A21 七键/`installed|uninstalled`/`ans_codex`/`[A-Za-z0-9_-]+` 与 `mcp-declarations.ts` 私有常量（源码文本）+ 读取器行为（保留名/名非法/env 名非法 ⇒ undefined）交叉钉住；⑪ 预算（索引 5,223 B、最大详情 4,089 B、全 spec ≤8192 B；超限截断标注；多字节安全）。

## 5. 候选身份（4 文件，raw SHA-256；聚合按 `path + "\0" + sha256` 排序后 SHA-256）

| 文件 | 行数 | 字节 | SHA-256 | numstat |
| --- | --- | --- | --- | --- |
| `src/model/runtime.ts` | 4,183 | 212,397 | `89e5fbc97b3a3f6994cf858696750fe6d3acfbe45ed1d0cf571b8a35037f4959` | +36/−0 |
| `src/provider/runtime/tools.ts` | 5,482 | 335,868 | `b07c3f805ab9eb88f13d4a6d4098b001d101e04b59b6162f57eda1e47a06ba79` | +95/−0 |
| `src/provider/runtime/schema.ts` | 1,861 | 147,921 | `fd3ee646e07e6d6beb3ba006a5f3079de5fb92c2fc08909dc6c9f4322e7a13a6` | +26/−0 |
| `test/runtime-core/doc-format-specs-pin.test.ts` | 281 | 19,754 | `f05471e38ca83f626856352ce85d914ec0ff85a1035c111eadc5e43659592003` | 新建 |

**聚合：`16a5fadf3da013d8536177dd762630f654952ffdf11a2c090cfa78d1c606e043`**（复算见 `08-candidate-hashes.txt`）。基线 HEAD `3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1` / tree `e05d68ad26d768297cb076af4f8e24316c7d71b7` / 分支 `feat/document-format-specifications`。

## 6. 证据

目录：`角色卡/运行时核心/docs/change/2026-11-09_W2_document-format-specifications/`

| 文件 | 内容 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| `01-pin-tap.txt` | 新测试 TAP（11/11） | 3,353 | `514686663d5133326d7ab47e85c6b35a0e860019ae736b26be857ba9b03d6ba9` |
| `02-runtime-core-dir-tap.txt` | 全量 runtime-core TAP（554/517/33/4） | 194,522 | `bf79cf15ee2c6095575374843aee51289ee67e934c5a63ab48ca34bdd2108cef` |
| `03-mcp-declarations-tap.txt` | MCP 声明既有套件 TAP（6/6） | 2,059 | `4e87a522a2ba50c301c1d071975537b9301e0217203d2f49d133aa98f3c67871` |
| `04-doc-format-specs-registry-tap.txt` | B1 注册表 TAP（24/24） | 6,619 | `f481bf54ad4959d72d3afb573c39a4c5ed98ae189202e99196b4bf33bdf09a32` |
| `05-workflow-preconditions-tap.txt` | contract topic 回归 TAP（29/29） | 7,439 | `d528c1c339b3ef8b21dd90fbe4608ebdf72a4ae4084e3a5ac9ac90efc2e3f48f` |
| `06-rejection-copy-tap.txt` | `contract_check` 工具回归 TAP（17/17） | 4,281 | `fe58d6a35bf64f0a5e2a68528df4e8bce75fc17e7972ac9a6dfd58a661ad3643` |
| `07-typecheck.txt` | typecheck 输出（exit 0） | 43 | `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` |
| `08-candidate-hashes.txt` | HEAD/分支/status/numstat/4 文件 hash/聚合/B1 参考 hash | — | — |
| `09-failure-set.txt` | 33 条既有红失败标题集合 | — | — |

## 7. 限制与披露（如实）

1. **未知 format 的层归属（相对 P1.2 §4.1 的实施解释）**：方案 §4.1 描述「未知 id 由数据源返回纯文本」；派发测试要求与 B1 TM-12 均要求「未知 format ⇒ `{ok:false,message}`」。本实现选择**工具层 fail-closed 拒绝**（消息与注册表未知文本逐字一致，测试全等断言），数据源仍保留未知-id 防御路径（B1 TM-1 覆盖）。两层合并保证：消息口径不变、信封符合 TM-12、未知 id 不触数据源。
2. **`DocFormatFn` 形状**：采用派发允许的 `ContractCheckFn` 同型变体（metadata 第二参），未采用 `signal?: AbortSignal` 变体；中止由工具层 `raceAbort` 保证。
3. **已知 id 依赖**：`tools.ts` 静态导入 B1 公开只读入口 `docFormatKnownIds()`（同类先例：`mechanical-rejection`/`write-journal`/`evidence-check`）；无循环、无 I/O。若验收认为 Provider 不应依赖注册表，可改为由数据源报未知（将不满足 TM-12 的 ok:false 口径）——需验收裁决。
4. **MCP 私有常量 pin 的残余风险（AC-17 text-shape）**：`NAME_PATTERN`/`RESERVED_NAMES`/`ENV_NAME_PATTERN` 未导出，本测试以源码文本断言 + 公开读取器行为双向钉住；不宣称「import 私有常量」。与门禁引擎 B3 批同一处置。
5. **已知红不回归**：全量 runtime-core 33 fail / 4 skip 为本基线既有红（judge B2 报告记录 33；含 `doc-freeze` `10 !== 9` 陈旧断言）；本批未修改任何相关断言、未求绿；新增 11 条全过。未运行 `test/编排/**` 全量（T2 全量受影响回归属 D1/E3，由协调方按 B1 §4.2 执行）。
6. **并行/串行**：B1 2 文件为既有在飞（哈希未变）；`test/门禁引擎/doc-format-specs-pin.test.ts` 为门禁引擎 B3 批在飞文件（非本批候选，未触碰）；`src/model/runtime.ts` 的 judge/团队计划 run 区域未触碰（本批仅 `ContractCheckFn` 之后与 `GovernedToolsOptions.contractCheck` 相邻）。
7. **披露（Pi/Codex）**：只做确定性覆盖（schema/`tools/list`/`toPiTool`），不承诺真实模型行为；真实运行（Claude/9223）不在本批。
8. **未完成面**：`openRoleSession` 输入 `docFormat?`、`AdapterCapabilities.docFormat?`、桌面 `docFormatText` 注入与 `session.test.ts` 属编排/桌面窗口批次；本批只保证契约与「注入才注册」。
9. **未提交/推送/合并/发布**；未运行真实模型/Electron；未占用 9222/9223；未改角色卡/边界/其它文档。
