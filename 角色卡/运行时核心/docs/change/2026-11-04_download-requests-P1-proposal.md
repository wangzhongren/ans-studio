# 运行时核心 P1 实现提案：下载申请 Model / 工具契约 / 运行时透传（A1，download-requests）

- **任务 / 角色 / 阶段**：`2026-11-04-download-requests`（flowId `download-requests`，T3）；运行时核心（独立固定上下文）；P1 实现提案（团队计划 §4.3 A1：Model / 工具契约 / 运行时透传）。
- **日期 / 状态**：2026-11-04；**`proposal-only, no code`**——只写本文件，**未改任何产品/测试代码，未运行产品测试，未 commit/push/merge/release**。状态以本行为准：`proposal-only`。
- **写入路径（本阶段唯一写盘文件）**：`角色卡/运行时核心/docs/change/2026-11-04_download-requests-P1-proposal.md`。
- **基线**：worktree `download-requests`，分支 `feat/download-requests`，HEAD `c2f163087aaf11616e5be01f80d305bf6f25af57`（PR #57、PR #58 均已合入）。
- **标注约定**：**[事实]** 只读实测；**[方案已定]** 取自客户闸门 1 确认的 P1.1 / 团队计划 / V1；**[候选·待审核]** 为 A1 需要新裁的冻结细节（§3.8 列出），请 P1 审核确认；未实施内容一律不写成已实现。

---

## 1. 输入与基线（只读实测）

| 输入 | 行数 | SHA-256 | 说明 |
| --- | --- | --- | --- |
| 方案 P1.1 正文（`head -n 1017`） | 1017 | `2590b5604d17d67fea7526b0895f7fcef70a92c495fb5828e6782d86fef0d26d` | 客户闸门 1 确认的唯一实施与验收基线；本 worktree 重算一致 |
| 验收标准 V1 | 1056 | `4a7c66ab51b5e1152407b57ce866056500933fb58480ba053c3a7e72c08f8d49` | V1（实施前标准，冻结 v1） |
| 团队计划 | 693 | `d9760755e80aa95cd548fd994ca7a1f448321427002eddfe1957397de4efec8e` | §4.3 A1 写集 / §5.3 A1 出口 / §6.2 检查命令 |
| B0 基线 v2 | 239 | `73c660c6356ce0350a26e677d68081c2d03a738475bfad1836874b95224d2b36` | 干净树认证：T3 3665/3638/9/18，新增确定性失败 0、新增 skip 0 |
| 闸门 2 / IA 记录 | 13 / 13 | `d4f00c07…` / `3250dfd4…` | 已确认；实施授权不含提交/推送/合并/发布 |

- **[事实]** `git rev-parse HEAD` = `c2f163087aaf11616e5be01f80d305bf6f25af57`；`git branch --show-current` = `feat/download-requests`；`git status --porcelain -- src app test` **为空**；H1 的 9 个治理文件修改保留（本提案不触碰）。
- **[事实]** 目标路径现状：`src/model/download.ts`、`test/runtime-core/download-contract.test.ts`、`test/runtime-core/download-tool.test.ts` 均不存在；拟加法文件现状（行数 / SHA-256，写前基线）：
  - `src/model/runtime.ts` 2769 / `911c617920e11bd2b61c851c9f39817fea4a4c59cfeab3366b640082bc4004c5`
  - `src/model/directive.ts` 316 / `b04aac321836da5ba30dc0101d2c37d2c34fd5a9c8a6a9ab9197eb8ad21b800d`
  - `src/provider/runtime/tools.ts` 3667 / `2d2f8b10cafecb1e9c65871faa5c64862f71a2fa94bc29135bb79812933be159`
  - `src/provider/runtime/schema.ts` 1422 / `0cb1f6f4dcd7b6a7b6e8ec52c68d5ad593ca0b58f07bc66b15a6a1408bbe987e`
  - `src/service/runtime/session.ts` 721 / `e36ffc226cc95ba7d25fd643b1c182c2e0694ef55f36d0b6b6a74ccd284d4d60`
  （A1 实施时另记 `git hash-object`；本表仅为提案基线披露。）
- **[事实]** 当前符号锚点（c2f1630；行号会漂移，实施以符号/文本锚点为准）：
  - `GovernanceChoiceCardKind`、`GovernanceConfirmCardKind`、`GovernanceCardKind`：`src/model/runtime.ts:414/420/423`；
  - `GOVERNANCE_CARD_GROUP` / `governanceCardGroup`：`:446-463`；
  - `GovernanceJudgeRequest`：`:1745-1803`；`GovernanceJudgeContext`：`:1868-1906`；`GovernedToolsOptions`：`:2208-2352`；
  - `CustomerDirectiveView.consumer`：`src/model/directive.ts:174`（PR #57 解释器类型在 `:64-102`，additive、不重叠）；
  - `CONFIRM_CARD_KINDS`：`src/provider/runtime/tools.ts:269`；`readGovernanceCardArgs`：`:297-308`；`buildGovernedTools`：`:3424`；客户交互注册：`:3477-3486`；`abortedToolResult`：`:1643-1689`；
  - `describeTool`：`src/provider/runtime/schema.ts:28`；`request_confirmation` 分支：`:184-320`；
  - `RuntimeSessionOptions`（`Omit<GovernedToolsOptions,…>`）：`src/service/runtime/session.ts:38`；`buildGovernedTools(options.gate, {…options})`：`:186-208`。
- **[事实]** `src/pipeline/orchestration/run-role.ts:2125` 的 `CARD_KIND_ROUTE_HINTS: Readonly<Record<GovernanceCardKind, string>>` 是对 `GovernanceCardKind` 的**穷尽 Record**；`test/编排/decision-card.test.ts:36-43` 断言 `Object.keys(GOVERNANCE_CARD_GROUP).sort()` 的精确键集。二者构成 A1 变更的跨角色影响（见 §6.3 R-1/R-2；R-1 为阻断项）。
- **[事实]** 派生白名单不需要另改：`src/common/编排/task-state.ts:79-81` 的 `request.*.cardKind` 白名单直接来自 `GOVERNANCE_CARD_GROUP` 键集；`src/common/编排/governance-judge-evidence.ts` 的 `artifactRequired` 对未知 cardKind 走 `default:false`，但其 `requiredArtifactPaths` 的 `default` 返回 `missing:true`（B1 的 W-6 必须新增 `case "download"`，见 §4/§6.3）。

---

## 2. 精确写集（逐文件）

> A1 只写下列 8 个路径（6 产品/测试 + 2 新测试）；`src/service/runtime/session.ts` 为预留写集但**不改**（0 行）。不写 `app/**`、`src/common/**`、`src/pipeline/**`、`src/provider/download/**`、`src/service/download/**`、`src/service/directive/**`、其他角色测试目录、`docs/{planning,scheduling,acceptance,communication}`、角色卡/边界/YAML/changelog（含 H1 九文件）。

| # | 路径 | 性质 | 改动内容 |
| --- | --- | --- | --- |
| 1 | `src/model/download.ts` | **新增**（B-1） | 下载申请/结果/错误码/判断事实共享 Model 类型与常量；无 I/O、无运行层依赖 |
| 2 | `src/model/runtime.ts` | **加法** | `GovernanceCardKind` 增 `"download"`；`GOVERNANCE_CARD_GROUP` 增 `download:"approval"`；`GovernedToolsOptions.requestDownload?`；`GovernanceJudgeRequest.download?`；`GovernanceJudgeContext.download?`；一个 type-only import。**不扩 `GovernanceConfirmCardKind`** |
| 3 | `src/model/directive.ts` | **加法** | `CustomerDirectiveView.consumer` 增 `"download"`；同步注释（`none` 收窄为 path 等）。**不改**指令创建/撤销/高危语义与 PR #57 解释器类型 |
| 4 | `src/provider/runtime/tools.ts` | **加法** | `REQUEST_DOWNLOAD_TOOL_NAME`、`makeRequestDownloadTool`、形状校验、`buildGovernedTools` 注入注册、`abortedToolResult` 下载分支。**不改** `CONFIRM_CARD_KINDS` / `request_confirmation` 语义 |
| 5 | `src/provider/runtime/schema.ts` | **加法** | `describeTool("request_download")` 分支（单一来源） |
| 6 | `src/service/runtime/session.ts` | **不改（0 行）** | W-1 Service 段由既有 `RuntimeSessionOptions extends Omit<GovernedToolsOptions,…>` + `buildGovernedTools(options.gate, {…options})` 结构性透传；A1 以 Service 级测试证明。**若审核要求显式接线，也只允许 0 行行为变化的注释/类型整理；不新增第二份透传逻辑** |
| 7 | `test/runtime-core/download-contract.test.ts` | **新增** | Model 契约/常量/类型边界（编译期 + 运行时） |
| 8 | `test/runtime-core/download-tool.test.ts` | **新增** | 工具注册/参数形状/回执转达/AC-23/中止/Service 透传 |

**既有 runtime-core 测试**：预期**不改**。核对过 `test/runtime-core/view-image-tool.test.ts:53-62`（默认工具面恰 4 只；未注入 `requestDownload` 时不变）、`test/runtime-core/request-requirement-change-tool.test.ts`（注入才注册的既有断言）、`test/runtime-core/confirmation-paths.test.ts`（`request_confirmation` 行为不变）等。若 A1 后出现必须更新的既有 runtime-core 测试，逐条理由写完成报告；**不改写断言以保绿**。

**A1 不写（归属其他角色/其他阶段）**：`src/common/编排/mechanical-rejection.ts`（`RejectionOwner:"requester"`、`download-*` 入 `RULES`/`UNVERIFIABLE_REJECTION_CODES`）、`governance-judge-facts.ts`（W-6）、`governance-judge-prompt.ts`（W-7）、`service/directive/impl/directive-service.ts`（`consumerOf`）、`pipeline/orchestration/*`（B1）、`app/desktop/*` 与 `app/main.ts`（C1）、`app/renderer/*`（C2）、i18n（A2）、`src/common/runtime-core/**`（无需改动；若确需改动，停止回报）。

---

## 3. 契约（冻结候选，请 P1 审核）

### 3.1 `src/model/download.ts`（新；primary owner：运行时核心）

```ts
// 下载申请共享 Model 契约（download-request/v1，2026-11-04 A1 冻结）。
// 依赖方向：只允许 import type { RuntimeKind } from "../common/shared/runtime-shared.ts"
// （与 runtime.ts 同一单一来源）；不 import ./runtime.ts，避免 type-only 双向循环。
// 无 I/O、无运行层依赖；不执行判定、不读写账本。

export const DOWNLOAD_REQUEST_SCHEMA = "download-request/v1";

export const DOWNLOAD_DEFAULT_MAX_BYTES = 104_857_600;        // 100 MB（G2 A）
export const DOWNLOAD_URL_MAX_BYTES = 2048;                    // §3.3 url 上限（UTF-8 字节）
export const DOWNLOAD_PURPOSE_MAX_BYTES = 1024;                // §3.3 purpose 上限（UTF-8 字节）
export const DOWNLOAD_FILENAME_MAX_CHARS = 128;                // §3.3/§6.2 文件名上限（Unicode 码点）
export const DOWNLOAD_FILENAME_MAX_BYTES = 200;                // §6.2 整名 UTF-8 上限（B1 净化消费）
export const DOWNLOAD_JUDGE_FACTS_MAX_BYTES = 2048;            // §4.1 request.download ≤2 KiB（独立于 8 KiB）
export const DOWNLOAD_DEFAULT_CONNECT_TIMEOUT_MS = 15_000;     // §5.4 默认连接超时
export const DOWNLOAD_DEFAULT_IDLE_TIMEOUT_MS = 30_000;        // §5.4 默认空闲超时
export const DOWNLOAD_DEFAULT_TOTAL_TIMEOUT_MS = 300_000;      // §5.4 默认总超时

export type DownloadErrorCode =
  | "download-invalid-arguments" | "download-unsafe-url" | "download-dns-failed"
  | "download-denied-by-directive" | "download-declined" | "download-unavailable"
  | "download-facts-missing" | "download-rebinding-detected" | "download-redirect-cross-host"
  | "download-http-error" | "download-too-large" | "download-unsupported-encoding"
  | "download-timeout" | "download-network-error" | "download-write-failed"
  | "download-busy" | "download-aborted";

export const DOWNLOAD_ERROR_CODES: readonly DownloadErrorCode[] = Object.freeze([/* 上述 17 码，顺序同上 */]);

export interface DownloadRequestInput {
  url: string;
  filename?: string;
  purpose: string;
}

export interface DownloadRequestMetadata {
  signal?: AbortSignal;
  roleId?: string;
  runtime?: RuntimeKind;
  turnId?: string;
  toolCallId?: string;
}

export type DownloadApprovalSource =
  | { by: "customer" }
  | { by: "judge"; engine: RuntimeKind; model?: string }
  | { by: "directive"; directiveId: string };

export type DownloadRequestResult =
  | { ok: true; message: string; path: string; bytes: number; sha256: string;
      finalUrl: string; approval: DownloadApprovalSource }
  | { ok: false; message: string; code: DownloadErrorCode };

export type RequestDownloadFn = (
  input: DownloadRequestInput,
  metadata?: DownloadRequestMetadata,
) => Promise<DownloadRequestResult> | DownloadRequestResult;

export interface DownloadJudgeFacts {
  url: string;                 // 归一化、无 userinfo；≤2048 字节
  scheme: "http" | "https";
  host: string;                // punycode 小写、去尾点；≤253
  port?: number;               // 仅显式非默认端口；1–65535
  resolvedIps: string[];       // 展示上限 8；校验/钉扎作用于全部结果
  resolvedIpsTotal: number;    // 解析结果总数
  resolvedIpsTruncated: boolean;
  filename: string;            // 净化后的预期文件名；≤128 字符
  filenameSource: "url-basename" | "caller" | "fallback";
  purpose: string;             // ≤1024 字节
  maxBytes: number;            // 默认 104857600；模型不可改
  mechanical: {
    schemeOk: boolean;
    credentialsAbsent: boolean;
    hostPublic: boolean;
    ipsPublic: boolean;
    filenameSafe: boolean;
  };
}
```

- **[方案已定]** 字段/上限/错误码逐条取自方案 §3.3、§4.1、§5.4、§6.2；`DownloadJudgeFacts` 只在 `cardKind==="download"` 时作为请求级事实出现，**不进 `GovernanceJudgeFacts`（账本级）**。
- **[候选·待审核]** `RequestDownloadResult` 用**判别联合**（成功必带 path/bytes/sha256/finalUrl/approval；失败必带 code），而不是扁平 `{ok,code?,...}`：让「成功必须 rename 完成后才返回」「失败必带稳定 code」在类型层可锁（AC-15），并让工具层能对契约外回执 fail-closed。替代：扁平接口（沿 `RequestRequirementChangeResult` 风格）；若审核选扁平，A1 测试改用运行时形状校验。
- **[候选·待审核]** `RequestDownloadMetadata` 单独定义（不复用 `CustomerInputMetadata`）：携带 `signal/roleId/runtime/turnId/toolCallId`；`projectRoot` **不经工具参数、也不经本 metadata**——由注入能力的闭包绑定（见 §3.4），防止模型指定下载根。
- **[候选·待审核]** `DOWNLOAD_ERROR_CODES` 冻结数组作为错误码单一来源；B1 的 `mechanical-rejection.ts` 必须由它派生/对照，**不复制第二份字面量**（与 `CUSTOMER_DIRECTIVE_*` 常量先例一致）。`DOWNLOAD_FILENAME_MAX_BYTES`（200）与超时常量按团队计划 A1「大小/超时/文件名常量」纳入，供 B1 消费。

### 3.2 `src/model/runtime.ts` 精确增量（加法，不动既有语义）

1. 文件头 import 区新增一行 type-only：
   ```ts
   import type { DownloadJudgeFacts, RequestDownloadFn } from "./download.ts";
   ```
   `runtime.ts` 不 re-export 这两个符号；消费方（B1/C1）从 `download.ts` 导入，保持单一来源。
2. `GovernanceCardKind`（当前 `:423`）增应用自有 confirm 种：
   ```ts
   /**
    * 2026-11-04 下载申请：`"download"` 是**应用自有 confirm 种**（只由 `request_download` 能力路径构造），
    * **不是** `request_confirmation` 可发卡种——`GovernanceConfirmCardKind` 仍只有 `appointment-write`，
    * `CONFIRM_CARD_KINDS` 字面量不动；`request_confirmation` 以 `cardKind:"download"` 调用被工具层拒绝。
    */
   export type GovernanceCardKind = GovernanceChoiceCardKind | GovernanceConfirmCardKind | "download";
   ```
3. `GOVERNANCE_CARD_GROUP`（`:446-453`）增一行：`download: "approval"`。该表是 `cardKind → 开关分组` 与 `task-state` 白名单的唯一来源；`governanceCardGroup("download") === "approval"`，`request.created.cardKind:"download"` 因此可被任务账本接受（`task-state.ts` 无需改动）。
4. `GovernedToolsOptions`（`:2208-2352`）新增能力位（放在 `customerInput` 附近，注释说明与 `customerInput` 独立）：
   ```ts
   /**
    * 2026-11-04 下载申请（`request_download`）：**注入才注册**——未注入 ⇒ 工具不存在
    * （能力缺席 = 最强 fail-closed）。形状单一来源＝`model/download.ts`（`RequestDownloadFn`）。
    * CLI/判断会话不注入（结构性无工具）；普通角色与内置治理角色由桌面注入。
    * 能力实现负责安全检查/预授权/审批/执行/审计；本层只做参数形状校验并如实转达。
    */
   requestDownload?: RequestDownloadFn;
   ```
5. `GovernanceJudgeRequest`（`:1745-1803`）新增可选字段（W-5）：
   ```ts
   /** 下载卡请求级事实（仅 `cardKind==="download"` 填充；其他卡种不携带）。 */
   download?: DownloadJudgeFacts;
   ```
6. `GovernanceJudgeContext`（`:1868-1906`）新增同名可选字段（W-5），注释注明计算点：
   ```ts
   /**
    * 下载卡请求级事实（仅 `cardKind==="download"`）。计算点＝应用自有的下载卡构造
    * （`app/desktop/download-request.ts`，C1/W-3），不是 `run-role.ts::governedInput`；
    * 桌面 `planJudge` 原样并入 `GovernanceJudgeRequest.download`（W-4）。
    */
   download?: DownloadJudgeFacts;
   ```
- **[方案已定]** 不新增未使用字段：`GovernanceJudgeFacts` 不加 `download`；`RequestCreatedEvent.cardKind` 与 `RequestResolvedEvent.cardKind` 已用 `GovernanceCardKind`，自动接受 `"download"`（`RequestPresentedEvent` 无 cardKind 字段，`to` 仍取 `customer|judge`），无需改事件形状；`GovernanceJudgeAudit/Outcome.cardKind` 同理。
- **[事实]** 加法导致的预期跨角色编译影响见 §6.3 R-1（`run-role.ts` 穷尽 Record），A1 不自行修。

### 3.3 `src/model/directive.ts` 精确增量（加法）

- `CustomerDirectiveView.consumer`（`:174`）：
  ```ts
  consumer: "shell-gate" | "decision-card" | "download" | "none";
  ```
- 同步上方注释（当前写「`consumer:"none"` 表示 domain/path 等当前无消费者」）：改为「`none` 表示 path 等当前无消费者；domain 由下载消费者消费（B1 `consumerOf` 返回 `"download"`）」。
- **[方案已定]** 指令创建/撤销/高危语义、`DirectiveInterpret*`（PR #57 加法）、`ApprovalResource`/`ApprovalAction`/`DirectiveEventV1` 均**不改**；A1 只加视图枚举值。

### 3.4 `src/provider/runtime/tools.ts`（工具层；加法）

- 常量：`export const REQUEST_DOWNLOAD_TOOL_NAME = "request_download";`
- 注入注册（`buildGovernedTools` 内，客户交互块附近）：
  ```ts
  const requestDownload = options?.requestDownload;
  if (requestDownload !== undefined) {
    tools.push(makeRequestDownloadTool(requestDownload, { roleId: options?.roleId, runtime: options?.runtime }, options?.currentTurnId));
  }
  ```
  未注入 ⇒ 工具不在集合；判断会话不经过本函数；CLI 不注入 ⇒ 结构性无工具。
- **参数形状校验（全部在触达能力之前；非法 ⇒ `ok:false`、不发卡、不联网、不落盘）**：
  - 未知参数：只允许 `url` / `filename` / `purpose`（`REQUEST_DOWNLOAD_ARG_KEYS`）；其余一律拒绝（沿 `unknownGovernanceArg` 先例）。
  - `url`：字符串；`trim()` 后非空；UTF-8 字节 ≤ `DOWNLOAD_URL_MAX_BYTES`；`new URL()` 可解析；scheme 仅 `http:`/`https:`；`hostname` 非空；`username`/`password` 均为空（拒绝 `user:pass@`）。
  - `purpose`：字符串；`trim()` 后非空；UTF-8 字节 ≤ `DOWNLOAD_PURPOSE_MAX_BYTES`。
  - `filename`（可选）：缺席/`null`/纯空白 ⇒ 视为未提供（不造键）；给出时须为字符串、Unicode 码点 ≤ `DOWNLOAD_FILENAME_MAX_CHARS`、不含 NUL、`/`、`\`、控制字符（`\u0000-\u001F`、`\u007F`）。更深净化（保留名/尾点/ADS 等）在 B1 Service。
  - 非法回执：`request_download: <detail>——未发卡、未联网，请更正后重试（不要猜测参数） [技术 code：download-invalid-arguments]`。
- **调用与回执**：
  - 合法 ⇒ 组装 `DownloadRequestInput`（传 `trim` 后的 `url`/`purpose` 与可选 `filename`）与 `DownloadRequestMetadata`（`signal`、`roleId`、`runtime`、`turnId`（`currentTurnId()`）、`toolCallId`）；调用注入能力**一次**，不做任何重试。
  - 能力抛错 ⇒ fail-closed：`request_download：未下载（下载能力异常，未产生文件）。下一步：稍后重试或反馈。谁来做：应用（app）。[技术 code：download-unavailable]`（不携带原始异常文本，避免 URL/路径/凭据进入模型消息）。
  - 成功（`ok:true`）⇒ 运行时形状复核（`message` 非空；`path` 形如 `download/<单文件名>`，不含 `..`/绝对路径/反斜杠/多级目录；`bytes` 非负整数；`sha256` 恰 64 位小写 hex；`finalUrl` 非空；`approval` 为三形状之一）⇒ 原样转达 `{ok:true, message}`。形状不符 ⇒ fail-closed「未获明确结果——不要当已下载；以应用审计/系统行为为准」。
  - 失败（`ok:false`）⇒ `code` 必须属于 `DOWNLOAD_ERROR_CODES`；回执 `{ok:false, message}`，若 `message` 未含 code 则追加 `[技术 code：<code>]`。契约外 code/缺失 ⇒ fail-closed，不伪装成功。
  - `abortedToolResult` 增分支：`request_download：本轮已中止，下载申请**未获最终结果**——不要假设已下载或未下载；以应用审计/系统行为为准。`
- **[方案已定]** `CONFIRM_CARD_KINDS` 保持 `["appointment-write"]`；`request_confirmation` 以 `cardKind:"download"` 调用即被 `readGovernanceCardArgs` 拒绝（未发卡）——这是 AC-23 的既有结构性保证，A1 只加测试钉住，**不改其实现**。
- **[候选·待审核]** 不额外包 `raceAbort`：能力契约要求观察 `metadata.signal` 并在中止时结算（返回 `download-aborted` 或清理）；外层 race 会让能力在工具已返回后继续执行，风险更大。工具层保留 `buildGovernedTools` 现有的调用前中止检查。

### 3.5 `src/provider/runtime/schema.ts`（加法）

新增 `if (name === "request_download")` 分支（`describeTool` 单一来源）：

```ts
parameters: {
  type: "object",
  properties: {
    url: { type: "string", minLength: 1, maxLength: DOWNLOAD_URL_MAX_BYTES,
      description: "http(s) URL; no userinfo (user:pass@); host required" },
    filename: { type: "string", maxLength: DOWNLOAD_FILENAME_MAX_CHARS,
      description: "Optional filename suggestion; no NUL/path separators/control chars; may be overridden by Content-Disposition" },
    purpose: { type: "string", minLength: 1, maxLength: DOWNLOAD_PURPOSE_MAX_BYTES,
      description: "Why this download is needed (shown to the customer/judge)" },
  },
  required: ["url", "purpose"],
  additionalProperties: false,
},
description: /* 中文模型文案：申请≠批准；确定性安全检查；三条审批路径；成功回执字段；
                失败 ok:false + 稳定 download-* code；不自动重试；跨域重定向需对新 URL 重新申请；
                不返回文件内容；不写 download/ 外目录；不要用 request_confirmation 伪造下载卡 */,
promptGuidelines: [ /* 3 条：何时用；失败处理；成功判据 */ ],
executionMode: "sequential",
```

- **[方案已定]** 参数名/必填/上限与 §3.4 一致；`executionMode:"sequential"` 沿 `request_confirmation`/`request_requirement_change` 的交互工具先例（同批不并行发起多个申请；跨轮/跨会话的并发策略仍由 B1 Pipeline 的每项目 ≤2 执行上限负责）。
- **[候选·待审核]** schema 的 `maxLength` 按字符计（JSON Schema 语义），权威上限在 handler 按 UTF-8 字节/码点执行；`additionalProperties:false` 与 handler 的未知参数拒绝一致。

### 3.6 W-1：运行时透传与不注入面

- **[事实]** `RuntimeSessionOptions`（`src/service/runtime/session.ts:38`）以 `extends Omit<GovernedToolsOptions, …>` 继承新字段；`providerFor` 以 `buildGovernedTools(options.gate, { …options, … })` 展开全部选项（`:190-208`）⇒ `requestDownload` **零改动**透传到工具层。因此 `src/service/runtime/session.ts` **A1 不改（0 行）**；若审核要求显式接线，只允许 0 行行为变化的注释整理。
- **[方案已定]** 注入面（谁注入）不在 A1：编排 `run-role.ts` 的 `AdapterCapabilities.requestDownload` 与 `createAdapter` 显式字段属 **B1** 写集；桌面注入属 **C1**。A1 只冻结字段名与形状。
- **[方案已定]** 判断会话（`shellJudge`/`governanceJudge`）只走 `buildShellJudgeTools`/`buildGovernanceJudgeTools`，不经 `buildGovernedTools` ⇒ 结构性无 `request_download`；CLI 不注入 ⇒ 无工具。A1 用 Service 级测试钉住判断会话，CLI 归 D1。

### 3.7 单一来源与依赖方向

- `download.ts` 是下载申请契约的**唯一**物理定义（types/constants）；`runtime.ts` 只 type-import，不 re-export、不复制字段。
- `download.ts` 不 import `runtime.ts`（避免 type-only 双向循环，沿 `directive.ts` 纪律）；`RuntimeKind` 与 `runtime.ts` 同源取自 `src/common/shared/runtime-shared.ts`。
- Provider（`tools.ts`/`schema.ts`）只 import Model；不 import 桌面/Service/Pipeline/`src/common/编排/**`；`request_confirmation` 的发卡面零变化。
- 用户可见文案/i18n key 不在 A1（A2）；错误码是机器值，不是用户文案。

### 3.8 需 P1 审核确认的冻结细节（[候选·待审核]）

| ID | 事项 | 提案口径 | 替代 |
| --- | --- | --- | --- |
| D-1 | 结果形状 | 判别联合（成功/失败强约束） | 扁平 `{ok,code?,message,...}`；若选扁平，A1 用运行期形状校验替代类型强约束 |
| D-2 | 工具 metadata | `download.ts` 内 `DownloadRequestMetadata`（signal/roleId/runtime/turnId/toolCallId） | `signal` 作第二位置参数（沿 `RequestVersionDecisionFn`），但会丢 turnId/toolCallId |
| D-3 | `filename` 空串 | 纯空白视作未提供（不造键） | 判为非法 |
| D-4 | url/purpose 传值 | 传 `trim()` 后的值 | 原样传；由 B1 再 trim |
| D-5 | 未知参数 | 工具层拒绝（`additionalProperties:false` + handler 检查） | 忽略未知参数（宽松） |
| D-6 | 执行模式 | `sequential` | 不设（平台默认） |
| D-7 | 回调异常文案 | 固定 `download-unavailable`、不带原始异常文本 | 带 `reasonOf(err)`（可能泄漏 URL/路径） |
| D-8 | 常量集合 | 见 §3.1（含 200 字节文件名上限与三组超时默认值） | 缩到工具层实际使用的 4 个常量，其余由 B1 自持（会与团队计划 A1 写集描述不一致） |

---

## 4. 实施顺序与依赖

1. **Model 段**：新增 `src/model/download.ts` → 加法 `runtime.ts` → 加法 `directive.ts` → `npm run typecheck`。此步会暴露 §6.3 R-1 的已知跨角色错误（`run-role.ts` 穷尽 Record），按统筹裁决处理（见 R-1 的 R1/R2/R3），**A1 不自行修改 `run-role.ts`**。
2. **工具层**：`tools.ts`（注册/校验/回执/中止分支）→ `schema.ts` → 新测试 `download-contract.test.ts`、`download-tool.test.ts`。
3. **运行时段**：`session.ts` 只做不改验证（Service 级测试证明普通会话透传、判断会话无工具）；如审核要求显式接线，按 §3.6 约束执行。
4. **A1 出口**：`node --test "test/runtime-core/**/*.test.ts"` + `npm run typecheck` 原始输出 + 候选哈希 + 冻结声明（§8）；旧证据不复用。
5. **冻结后消费**：A1 完成即冻结（团队计划 §5.3）。B1（编排）只按冻结形状实现 `AdapterCapabilities.requestDownload`/`takeDownloadDirective`/`consumerOf`/错误码与 judge 集成；C1（桌面窗口）实现能力注入、下载卡 `judgeContext.download`、W-2/W-3/W-4；C2/D1 消费。**A1 不写 Pipeline/Provider/Desktop，不代 B1/C1 接线，不实现 P1–P9。**
6. 若 `origin/main` 在 A1 期间前进：按团队计划 §1.5/§5.4 更新基线并重跑 A1 证据；`src/model/directive.ts` 冲突由运行时核心解决（团队计划 §1.5.3 冲突归属）。

---

## 5. 测试计划

### 5.1 新测试文件与用例

**`test/runtime-core/download-contract.test.ts`（Model 契约）**

- 常量真值：`DOWNLOAD_DEFAULT_MAX_BYTES===104857600`、URL 2048、purpose 1024、filename 128 字符 / 200 字节、judge facts 2048、超时 15000/30000/300000；`DOWNLOAD_ERROR_CODES` 恰 17 项、无重复、与 §3.3 表逐项一致。
- 卡种边界（AC-23 类型侧）：`GovernanceCardKind` 可赋 `"download"`；`GovernanceConfirmCardKind` 仍只有 `"appointment-write"`（`@ts-expect-error` 拒绝 `"download"`）；`governanceCardGroup("download")==="approval"`；`GOVERNANCE_CARD_GROUP` 含 `download` 自有键；`request.created.cardKind` 与 `request.resolved.cardKind` 可赋 `"download"`（`request.presented` 无 cardKind 字段，不涉及）。
- 指令视图（AC-14 Model 侧）：`CustomerDirectiveView.consumer` 可赋 `"download"`，且 `"shell-gate" | "decision-card" | "none"` 不回归；`@ts-expect-error` 拒绝未知值。PR #57 兼容：`DirectiveInterpretRequest/Result/Fn` 仍导出且可赋值（本文件不改变其语义）。
- judge 字段（AC-25 Model 侧）：`GovernanceJudgeContext.download`/`GovernanceJudgeRequest.download` 可选、可省略、双向结构可赋值；`GovernanceJudgeFacts` **没有** `download` 字段（`@ts-expect-error`）；`DownloadJudgeFacts` 的 `filenameSource`/`mechanical` 形状与字段名锁定。
- 结果联合（D-1）：成功必带 `path/bytes/sha256/finalUrl/approval`；失败必带 `code`；`@ts-expect-error` 失败缺 code / 成功缺 sha256 / 未知 code。
- `GovernedToolsOptions.requestDownload`：可省略、可赋 `RequestDownloadFn`；`download.ts` 不 import `runtime.ts`（结构检查/编译事实）。
- 无未使用字段：`GovernedToolsOptions` 只新增 `requestDownload` 一个键（用类型键集断言/编译期检查），`GovernanceJudgeRequest`/`Context` 只新增 `download`。

**`test/runtime-core/download-tool.test.ts`（工具层 + Service 透传）**

- 注册（AC-1）：未注入 ⇒ `request_download` 不在工具面；注入 ⇒ 只新增这一只，既有工具的 `inputSchema`/`description`/`displayInputRule`/`executionMode` 逐个不变（沿 `request-requirement-change-tool.test.ts` 的对比法）。
- schema/描述：`required:["url","purpose"]`；properties 恰 `url/filename/purpose`；`additionalProperties:false`；上限数值；描述含 http/https、无凭据、审批路径、成功字段、稳定 code、无自动重试、跨域重申请、`download/` 限定、不得用 `request_confirmation`；guidelines 与 `executionMode:"sequential"`。
- 参数校验（AC-2）：表驱动非法样例（缺 url/空/空白/超 2048 字节/不可解析/`ftp:`/`file:`/`data:`/userinfo/空 host；purpose 缺/空/空白/超 1024 字节；filename 超 128 码点/含 NUL/`/`/`\`/控制字符；未知参数）⇒ `ok:false`、消息含 `download-invalid-arguments` 与「未发卡、未联网」、能力调用计数 **0**。边界：恰 2048 字节 url、恰 1024 字节 purpose、恰 128 码点 filename 合法。
- 载荷与 metadata：合法样例传给能力的 `url`/`purpose` 为 trim 后值、`filename` 缺席不造键；metadata 含 `signal/roleId/runtime/turnId/toolCallId`。
- 回执（AC-15 工具层）：成功联合原样转达 `{ok:true,message}`；17 个失败码逐个转达为 `ok:false` 且消息含 code（缺失时工具追加）；契约外回执（缺字段/坏 path/坏 sha256/未知 code/非对象）⇒ fail-closed，不出现成功措辞；能力抛错 ⇒ `download-unavailable`；每次 handler 调用能力恰一次（无自动重试）。
- 中止：预中止 signal ⇒ `ok:false`、能力调用 0、消息为「未获最终结果」分支。
- AC-23 工具侧：`request_confirmation` 以 `cardKind:"download"` 调用 ⇒ `ok:false`（`cardKind 非法`）、客户通道调用 0；`describeTool("request_confirmation").parameters.cardKind.enum` 仍为 `["appointment-write"]`。
- Service W-1：`createRuntimeAdapter` 注入 `requestDownload` ⇒ 捕获的 provider 工具面含 `request_download`；未注入 ⇒ 不含；`governanceJudge`/`shellJudge` 会话 ⇒ 工具面恰为 judge 三工具、不含 `request_download`（AC-1 判断会话部分）。临时目录夹具、`registerControlledDisplayProfile` 沿既有先例。

### 5.2 精确命令与基线对照

```bash
node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"
npm run typecheck
```

- **B0 v2 对照**：runtime-core 39 文件 / tests 309 / pass 302 / fail 3 / skip 4（3 项失败均为既有 Windows symlink EPERM：`file-write-safety.test.ts:97`、`session-store.test.ts:46`、`:58`）。A1 后：**新增确定性失败 = 0、新增 skip = 0**，既有 3 项按名对应；新增测试计入 tests/pass。原始输出、退出码、Node/npm/OS、候选哈希入证据。
- **typecheck**：`npm run typecheck` 退出码 0（`tsconfig.json` 的 `include:["src","test","app"]` 覆盖 `test/runtime-core/`，`@ts-expect-error` 负例真实生效）。**注意 R-1**：在 `run-role.ts` 的一行键补齐落地前，repo-wide typecheck 会因该 B1 文件报错；A1 出口证据的采集时机按统筹裁决执行。
- 不做：全量 T3（D1）、真实 Electron（D2）、`test/编排/**`（B1）、桌面/渲染测试（C1/C2）；不在 A1 冒充跨层结论。

### 5.3 AC 映射（A1 承担部分）

| AC | A1 交付 | 其他角色 |
| --- | --- | --- |
| AC-1 | `download-tool.test.ts`：注入才注册、未注入不可见、Service 透传、判断会话不可见 | C1 注入面、D1 CLI 会话 |
| AC-2 | `download-tool.test.ts`：逐项非法 ⇒ `ok:false` + `download-invalid-arguments` + 调用计数 0 | B1 私网/DNS 等执行侧（AC-7）、D1 |
| AC-15（工具层） | 回执转达/契约外 fail-closed/成功只在能力 `ok:true` 且形状完整时返回/单次调用无重试 | B1 rename 完成后才成功、`once` 不重复消费；D1 |
| AC-23 | `download-contract.test.ts`：`GovernanceConfirmCardKind`/`CONFIRM_CARD_KINDS` 不变；`request_confirmation` 拒绝 download；`request_download` 是唯一下载卡工具路径 | C1/C2 卡面、D1 结构检查 |
| AC-25（Model 侧） | `download-contract.test.ts`：`GovernanceJudgeContext.download`→`GovernanceJudgeRequest.download` 可选/双向可赋值；`DownloadJudgeFacts` 字段与 ≤2 KiB 常量；`GovernanceJudgeFacts` 不带 download | B1 facts 构造/截断、C1 W-3/W-4、D1 |
| AC-14（Model 侧） | `consumer` 枚举加法与既有值不回归 | B1 `consumerOf`、C1/C2 面板、A2 文案、D1 |
| AC-24（Model/工具侧） | W-1 字段、W-5 字段、工具注册 | W-2/W-3/W-4/W-6/W-7/W-8 归 C1/B1；D1 调用计数 |

### 5.4 PR #57 兼容

- `src/model/directive.ts` 的 `DirectiveInterpretRequest` / `DirectiveInterpretFailureCode` / `DirectiveInterpretResult` / `DirectiveInterpretFn`（`2672208` 加法，约 +42 行）保持逐字不变；A1 只改 `CustomerDirectiveView.consumer`（不同区域）。
- `download-contract.test.ts` 对这四个类型做可赋值断言；`npm run typecheck` 覆盖 `src/pipeline/orchestration/directive-interpreter.ts` 等消费方，证明无回归。
- 若基线更新导致 `directive.ts` 冲突：按团队计划 §1.5.3 由运行时核心解决并重跑 A1 证据；不复用旧证据。

---

## 6. 风险、替代与必要 vs 可选

### 6.1 必要项（本提案全部为必要）

- 五个产品文件的新增/加法（`src/model/download.ts`、`src/model/runtime.ts`、`src/model/directive.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`）与两个新测试的改动，逐项对应团队计划 §4.3 A1 与方案 §3.1/§3.1.1/§3.3/§4.1/§4.3；`src/service/runtime/session.ts` 为不改验证。
- `request_confirmation` 的 `CONFIRM_CARD_KINDS`、`GovernanceConfirmCardKind` 保持不变（AC-23）。
- 不在 A1 实现 P1–P9；不新增未使用字段；不写 `RejectionOwner:"requester"`（属 B1 的 `mechanical-rejection.ts`）；不写 Pipeline/Provider/Desktop。

### 6.2 可选范围

- **无可选项**：P1–P9 全部未选（闸门 1 记录），A1 不实现任一；不以「顺手」方式加入下载进度、去重、重试、代理、解压、`expectedSha256`、后台下载或回滚开关。
- §3.8 的 D-1..D-8 是冻结细节裁决，不是客户可选范围；审核选择后按该口径冻结。

### 6.3 风险与替代

| # | 风险 | 事实/影响 | 处置 |
| --- | --- | --- | --- |
| **R-1（阻断/协调）** | 跨角色穷尽 Record 编译依赖 | `src/pipeline/orchestration/run-role.ts:2125` `CARD_KIND_ROUTE_HINTS: Readonly<Record<GovernanceCardKind, string>>`；`GovernanceCardKind` 增 `"download"` 后该对象缺键 ⇒ `npm run typecheck` 在 **B1 文件**报错。A1 写集不含该文件 | **A1 不自行修**。建议统筹裁决：R1（推荐）A1 落地 Model 后，授权 B1 立即只补一行 `download: "下载卡由应用在 request_download 流程中构造，角色不直接发起（请勿用 request_confirmation）"`，随后 A1 在合并树上跑最终 `npm run typecheck` 并记录；A1 冻结声明附该文件哈希与「编译解锁」注记。R2（不推荐）：把 A1 出口降为「Model 文件 clean + 恰一条预期下游错误」，属计划偏离。R3：先声明 model-shape 冻结（typecheck-red 如实记录），B1 补键后 A1 重跑复核——等同 R1 的正式化。**未裁决前 A1 不宣称 typecheck 通过。** |
| **R-2（下游测试）** | `test/编排/decision-card.test.ts:36-43` 断言 `GOVERNANCE_CARD_GROUP` 精确键集 | A1 后该测试失败（运行时断言，不影响 A1 的 runtime-core 命令与 typecheck） | B1 在自身写集内更新该断言（加入 `download`）并重跑 `test/编排/**`；T3 消费者重测要求（团队计划 §6.3）。A1 不写该文件 |
| R-3 | 其他穷尽 switch / 映射 | 已检索：`governance-judge-evidence.ts` 的 `switch` 有 `default`；渲染侧用 `string`；其余为运行时集合 | `npm run typecheck` 若暴露新的非 A1 文件错误 ⇒ **停止并回报**，不越界修 |
| R-4 | `directive.ts` 与 PR #57 重叠 | 不同区域、均为加法；PR #57 已合入 c2f1630 | 冲突归运行时核心（团队计划 §1.5.3）；解决后重跑 typecheck/契约测试 |
| R-5 | 工具层与 B1 策略重复校验 | 工具层做形状校验（AC-2：不发卡/不联网），B1 做协议/IP/DNS/文件名净化（AC-7/11/13） | 有意纵深；URL/purpose/filename 上限从 `download.ts` 常量取，不复制字面量 |
| R-6 | `session.ts` 不改的假设 | `Omit` 继承 + `…options` 展开已覆盖 | Service 级测试钉住；若审核要求显式接线，只加 0 行行为变化的注释 |
| R-7 | 判别联合可能导致 C1/B1 实现摩擦 | 成功字段强制齐全，契约外回执 fail-closed | D-1 供审核选择；若选扁平，用运行期校验保持 fail-closed |
| R-8 | 请求级事实 ≤2 KiB 未在 A1 强制 | A1 只提供类型与常量 | B1/C1 在构造/透传处强制并记诊断；D1 验证（AC-25） |
| R-9 | `RejectionOwner:"requester"` 可行性 | 属 B1；方案已给回退（`app` + 文本） | A1 的 `DownloadErrorCode` 不受影响；若 B1 回退由统筹在 E1 披露 |
| R-10 | A1 期间基线前进 | 旧 Model 证据失效 | 重跑 A1；`directive.ts` 冲突本角色解决 |

### 6.4 边界纪律

- 需要修改 `src/common/runtime-core/**` 或本提案写集之外的任何路径（含 R-1 的 `run-role.ts`、R-2 的编排测试）时：**停止并回报**，由统筹按闸门 2 增补/裁决；本角色不自行扩边界、不代写。
- 不触碰 H1 九文件、其他角色文件、`.tmp-*` 文件、`docs/{scheduling,acceptance,communication}`；不 commit/push。

---

## 7. 基线披露

1. **HEAD/工作树**：`c2f1630`（含 PR #57 `2672208`、PR #58 `61a5889`）；`git status --porcelain -- src app test` 为空；H1 九文件修改存在且不触碰。
2. **PR #57**：对 `src/model/directive.ts` 增加解释器类型（`DirectiveInterpretRequest/FailureCode/Result/Fn`，约 +42 行）；A1 的 `consumer` 枚举加法与其不同区域、无冲突；A1 测试包含 PR #57 类型兼容断言。
3. **PR #58**：diff 仅 `app/desktop/customer-input.ts` 与 `test/桌面应用/**`；**不触 A1 写集**。
4. **设计行号漂移**：方案 P1.1 行号以 `c8a9394` 快照为准；当前基线 `c2f1630` 下行号已漂移，实施以**符号名/文本锚点**为准（本提案 §1 已列当前锚点）。
5. **B0 记录版本**：任务基线使用 B0 v2（239 行 / `73c660c6…`，T3 3665/3638/9/18，干净树认证）；V1 头部引用的是 B0 v1（`86e25add…`）。两者均为 239 行但内容不同；D1/E2 以 B0 v2 为准。该差异是记录口径问题，**不属于本角色写权**，仅披露。
6. **设计/标准哈希已复算**：方案正文 `2590b560…`、V1 `4a7c66ab…` 与任务给出的输入一致。

---

## 8. 冻结声明格式（A1 完成时填写，非本阶段）

```text
A1-download-request-model freeze v1
| baseline HEAD: <40 位>
| files: src/model/download.ts <git hash-object> <sha256>; src/model/runtime.ts …; src/model/directive.ts …; src/provider/runtime/tools.ts …; src/provider/runtime/schema.ts …; src/service/runtime/session.ts <unchanged hash>; test/runtime-core/download-contract.test.ts …; test/runtime-core/download-tool.test.ts …
| compile-unblock: src/pipeline/orchestration/run-role.ts <hash>（若 R-1 R1 被执行；否则注明未执行及裁决）
| commands: node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"（exit/counts）；npm run typecheck（exit）
| surface: DownloadErrorCode/DownloadRequestInput/DownloadRequestResult/DownloadJudgeFacts/RequestDownloadFn/常量；GovernanceCardKind+"download"；GOVERNANCE_CARD_GROUP.download=approval；GovernedToolsOptions.requestDownload；GovernanceJudgeContext/Request.download；CustomerDirectiveView.consumer+"download"；request_download schema/注册/校验
| status: implemented-unverified
| change rule: 任何形状变化回运行时核心重跑 A1 并使其消费方证据失效
```

---

## 9. 声明

- 本提案**不写产品代码、不写测试代码、不运行产品测试、不 commit/push/merge/release**；仅写本文件。
- 完成状态：**`proposal-only`**。A1 开工条件：P1 审核 `recommend approval` + 实施授权 + R-1 裁决；A1 完成后状态为 `implemented-unverified`，最终判定归独立验收。
- 本提案不重开闸门 1/2、不改变方案口径；若审核认为需要改变写集、契约形状或实施顺序，按团队计划 §1.6 停止并回报统筹。

---

## 10. 请审核/统筹裁决事项（汇总）

1. **R-1（阻断）**：`run-role.ts` 穷尽 Record 的一行编译解锁由谁、在何时执行（建议 R1，见 §6.3）。
2. **D-1..D-8**（§3.8）：结果形状、metadata 形状、filename 空串、trim 语义、未知参数、执行模式、异常文案、常量集合。
3. **R-2**：`test/编排/decision-card.test.ts` 精确键集断言由 B1 更新（确认属其写集）。
4. 如审核认为 `src/service/runtime/session.ts` 必须显式改动（而非 0 行透传），请明确改动形状；否则按不改执行。
