# Pi适配器 变更记录

## 2026-10-11 — `finalize_bootstrap` 收口提议工具（T36，设计 §13.1）

**来源**：本角色（Pi适配器）独立实现，落点全在本角色边界内（`src/provider/pi/tools.ts`、`src/provider/pi/session.ts`、`src/common/pi-adapter/real-adapter.ts`、`test/pi-adapter/finalize-bootstrap.test.ts`）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` **§13.1**（客户 2026-10-11 裁定：bootstrap 完成＝**su 主动提议 → 客户确认 → 才 finalize**）与派发清单 **T36**。前提 **T37**（编排那半）已完成，并给出要接的确切形状：`FinalizeBootstrapFn = (opts?) => Promise<FinalizeResult>`，**调用即「提议收口并等客户确认」，不是立即完成**。

**改了什么**
- **`tools.ts`**：新增 `FINALIZE_BOOTSTRAP_TOOL_NAME="finalize_bootstrap"` 与 `makeFinalizeBootstrapTool(fn)`，与 `read_file`/`write_file`/`edit_file`/`run_shell` **并列**。
  - **注册条件照 `run_shell` 先例**：`GovernedToolsOptions` 增可选 `finalizeBootstrap`；`buildGovernedTools` **仅当注入时才 push**（**未注入即不注册**，能力缺席 = 最强 fail-closed）。
  - **「创世态」怎么表达**：工具层**同步**、不查文件系统——「是否创世态」由**调用方**（编排/装配，持 `isGenesisState`）以**是否注入**表达（只在创世态注入；非创世态不注入 ⇒ 工具不在集合里）。**另有的显式非创世态守卫在注入的 finalize 本身**（编排 `createFinalizeProposer` 守卫 1 → 返回 `not-genesis`）。
  - **handler**：`await finalizeBootstrap()`（**无参**——`acceptanceSource`/`now` 由编排侧决定，模型不该提供），把 `{ok, message}` **如实**转达模型。
  - **措辞（关键）**：`ok:true` → 「**收口完成**（客户已确认）——项目由「创世态」进入「正式态」」；`ok:false` → 「**收口未完成**（项目仍处于创世态，边界尚未 pin）」+ 能力自身原因 + 「本工具语义是「提议收口、等待客户确认」——未获确认即不完成」。**绝不**把「未完成」说成「已完成」（有断言锁死）。能力抛错 → fail-closed（未完成）。
  - **本层不写盘**：真正的写（`.ans`/治理边界文档/manifest）全在**编排的 finalize** 侧、每笔先经 `resolveWrite`；本层只调用注入的能力。**绝不加入 `GOVERNED_WRITE_TOOLS` 之类写类集合**（它本身不改文件）。扩展层 `tool_call` 钩子对它**放行**（非 `run_shell`、无 `path`，`shellKillSwitch` 与写类判据都不命中）。
- **`real-adapter.ts`**：`RealPiAdapterOptions` 增 `finalizeBootstrap?`，透传给 `buildGovernedTools`；**给 `describeTool` 补 `finalize_bootstrap` 分支**（**无参** JSON-Schema）——否则会落进 write/edit/read 的 **`path` 必填** schema（模型会被误导去传 path）。描述文案明确「调用即**提议收口并等待客户确认**，**不是立即完成**；仅在创世态可用」。
- **`session.ts`（§4 冻结契约家）**：**逐字**声明 `FinalizeStatus` / `FinalizeResult` / `FinalizeBootstrapFn`（读编排私有 `src/common/编排/finalize.ts` **确认形状、不导入**）；`PiRuntimeAdapterOptions` 与 `createFakeRuntimeAdapter` 各增 `finalizeBootstrap?` 并透传。**为何声明在此**：§6 禁导入他人私有 `common/`、§一.2 禁 Provider 向上导入 Pipeline（编排公开面）；依设计 §3.11「唯一正当落点是 `common/shared/` 或 **§4 冻结契约家**」与 **T20 先例**（operator 三型逐字入本文件）。编排的 `FinalizeBootstrapFn` 由**结构类型**保证可注入（逐字一致）。**后续收敛（供编排）**：编排宜改为从本文件导入这两个形状，使来源唯一（同 T20→T21）。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **71 pass / 0 fail / 0 skipped**（新增 `test/pi-adapter/finalize-bootstrap.test.ts` **8 条**：未注入→不注册、非创世态以「不注入」表达→不存在、注入→存在、handler 真调 fn 且失败措辞不含「已完成」、ok:true 才说「收口完成」、unavailable→不谎报、fn 抛错→fail-closed、**不写盘**（writeRoot/gate 就绪也零文件系统变化））。
- `npm run typecheck` → **零错误**（全仓）。
- 全量 `node --test "test/**/*.test.ts"`（带引号、走 Node glob）→ **616 pass / 2 fail / 618 计**。**2 处红均在他人边界**：`test/桌面应用/finalize-wiring.test.ts`（2 条，归**桌面应用**角色；按**旧语义**「调用即完成」断言，未接客户确认通道 ⇒ 现按新语义「未确认不完成」被判红，**非本角色**）。**注**：任务下发时基线为 609/606/3，其中 1 红（`test/测试/t9-block1-bootstrap.test.ts`）**现已转绿**（11 pass，测试角色已修），故当前为 2 红。
- **未读 `.env`、未发任何网络请求、未打印任何凭据值**。

**边界 / 跨角色（未越界改）**
- 只改本角色 Section 1 内文件；**未**改编排的 `src/common/编排/finalize.ts`（**只读确认形状**）。`test/桌面应用/finalize-wiring.test.ts`、`test/测试/t9-block1-bootstrap.test.ts` 属他人边界，**未动**，如实回报其红/绿状态。

## 2026-10-11 — 凭据红线改写：可写指定的 `.env`，绝不写入库文件 / 绝不回显（T27）

**来源**：本角色（Pi适配器）独立实现，落点在 `src/common/pi-adapter/provider-config.ts`（本角色边界内）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` **§11.1**（客户 2026-10-11 确认的红线改写）与派发清单 **T27**。**客户已确认**：桌面应用要做 Pi 配置界面，把设置（**含 token**）**保存到 `.env`**；`.env` 已 gitignore、不入库、已在装配边界内、token 也确实住在那里——故这是给**已有落点**加一个**自动写入**，不是新增落点。

**改了什么（`src/common/pi-adapter/provider-config.ts` 头部红线第 1 条）**
- **新红线（客户确认措辞，逐字）**：「凭据**可写入指定的本地配置 `.env`（已 gitignore、不入库）**；但**绝不可写入任何入库文件**，也**绝不可被打印/回显到日志或界面之外**。」三点并列写明：① 可写 `.env`（gitignore、不入库）；② 绝不写入库文件；③ 绝不打印或回显到日志或界面之外。
- **原措辞留痕（不删）**：原「绝不把凭据写入任何文件——凭据只在运行时从环境变量读取，经内存 CredentialStore 注入。」**逐字保留**，就地标注**「已被本决定取代」**，并附改写原因。**未抹除原文**——后人不得误以为这条从未变过。
- 红线第 2 条（绝不带凭据请求默认 `api.anthropic.com`）**不变**。

**顺带核对（实现与新红线是否一致）——一致，无需改逻辑**
- `resolvePiProviderConfig` 只做凭据**存在性**检查（`env[apiKeyEnvVar] === undefined || === ""`），**从不读取、从不打印**其值；返回的 `PiProviderConfig` 只含 `apiKeyEnvVar`（环境变量**名**，非值）——与「绝不打印/回显」一致。
- `src/common/pi-adapter/real-adapter.ts` 只 `log.trace` `provider/model/baseUrl/contextWindow`（:437-438），**不打印凭据值**——与红线一致。
- **唯一文本改动（非逻辑）**：`resolvePiProviderConfig` 抛「缺少凭据」时那句原写「…也不把凭据写入任何文件。」**改写后已不成立**（程序现会写 `.env`），故改为「本程序只检查其存在性，不读取、不打印其值；凭据绝不写入入库文件、绝不回显到日志或界面之外。」——**只改消息文本，不改任何判定/分支**。
- **判断：未补新的代码保护。** 理由：本条红线的两个**新增**约束（「绝不写入库文件」「绝不回显」）的实际写入点在**共享 `env-file` 模块（pm 的 T26）+ 桌面（T28）**，均**不在本角色边界**；本文件**不写任何文件**（纯解析/校验），已天然满足。在此处加「保护」既无对象（无写入、无回显）也是空转。真正的写入纪律（只改相关键、token 掩码、原子写、失败显式，§11.4）归 T26/T28。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **63 pass / 0 fail / 0 skipped**（未增删用例；错误信息的正则断言 `/凭据/` 不受文本改写影响）。
- 全量 `node --test "test/**/*.test.ts"`（带引号、走 Node glob）→ **492 pass / 0 fail / 0 skipped**（与基线一致）。
- `npm run typecheck` → **零错误**（全仓，与改前一致）。
- **未读 `.env`、未发网络请求、未打印任何凭据值**（测试用值为假造字符串）。

**边界 / 跨角色（未越界改）**
- 红线第 1 条**只在本角色文件改写**；设计 doc §11.1 明确「本文不改该文件，归 T27」——本角色**未**改设计 doc。
- `.env` 的写入实现、桌面面板、`savePiConfig` 写入纪律归 **pm（T26）/桌面（T28）/测试（T29）**，**不在本角色**。

## 2026-10-11 — 消费共享路径/运行时原语（删本地镜像）+ operator 三型入冻结契约家 + 修本角色 typecheck（T20）

**来源**：本角色（Pi适配器）独立实现，全部落点在本角色边界内（`src/provider/pi/session.ts`、`src/common/pi-adapter/`）。依据：设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` §3.11 / §6（写根与 gate 同源）/ §4（冻结契约家 `src/provider/pi/session.ts`）/ §6（禁跨角色导入私有 `common/`）；消费 pm 的 T23 产物 `src/common/shared/path-primitives.ts` 与 `runtime-shared.ts`（**只读**）。

**改了什么**
- **operator 三型入冻结契约家**：`src/provider/pi/session.ts` **新增**（仅类型，**不改既有导出**）：
  - `OperatorPrompt { command: string; argv: string[]; cwd: string; toolCallId: string; reason?: string }`
  - `OperatorOutcome = { outcome:"allow"; operatorId?:string } | { outcome:"deny"; operatorId?:string; reason?:string } | { outcome:"unavailable"; reason?:string }`
  - `OperatorChannelFn = (prompt: OperatorPrompt) => Promise<OperatorOutcome | null | undefined> | OperatorOutcome | null | undefined`
  形状**逐字**取自编排私有 `src/common/编排/shell-gate.ts`（读之确认）。编排（T21）/桌面（T22）改为从本文件导入后，即消除桌面的**逐字镜像**。
- **删本地路径镜像**：`src/common/pi-adapter/fs-write.ts` 删除本地 `IS_WINDOWS` / `toPosix` / `normalizeLexical` / `compareKey` / `absRelLexical` / `isWithinReal` / `realResolveAsync`，改从 `src/common/shared/path-primitives.ts` **只读导入**（`absRelLexical`→`absRel`；`isWithinReal` / `realResolveAsync` 同名）；`guardWriteTarget` 的调用点由 `absRelLexical(abs, writeRoot)` 改为 `absRel(abs, writeRoot)`。**保留** `checkRelativePathSafe`（写层专有名称安全校验：Windows 保留名/尾点空格/ADS 等，门禁无对应物，非镜像）。
- **删本地运行时镜像**：`src/provider/pi/tools.ts` 删除 `PI_CREDENTIAL_ENV_VARS` 本地副本，改从 `src/common/shared/runtime-shared.ts` **只读导入**（`buildShellEnv` 仍据其剥离）。
- **修 typecheck**：`src/common/pi-adapter/real-adapter.ts` 本地 `GovernedTool.handler` 参数类型补 `toolCallId?: string`（与 `tools.ts` 的 `ToolDefinition` 结构对齐），消除 `real-adapter.ts:234` 的 TS2353（`toolCallId` 未知属性）。

**关键落实**
- **安全要素逐字不变**：删除本地镜像后，`absRel` / `isWithinReal` / `realResolveAsync` 与门禁引擎**来自同一份** `path-primitives.ts`——「gate 认为在根内」与「写入层认为在根内」不再可能漂移（设计 §6 风险 2–3）。`PI_CREDENTIAL_ENV_VARS` 亦单一来源：「装配判凭据」与「Pi适配器 spawn 时剥离」引同一常量。
- **兼容再导出（不越界）**：为**不越界**修改 `test/项目管理/shared/` 的收敛窗口期一致性用例（该目录属 pm），`fs-write.ts` 以 `export { absRel as absRelLexical }; export { isWithinReal, realResolveAsync };` 保留旧名、`tools.ts` 以 `export { PI_CREDENTIAL_ENV_VARS };` 保留旧导出表面——三者**直接指向共享实现**（单一来源、**非第二份实现**），故行为逐字不变、既有用例仍绿。pm 更新其收敛用例后可随时删除这些别名。
- **行为逐字不变**：本角色未新增/删除任何逻辑；`guardWriteTarget` / `recheckParentInsideWriteRoot` / `buildShellEnv` 的语义与删除前一致（现调用共享实现）。**未发现** pm 共享模块与本角色旧实现在任何输入上的差异。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **63 pass / 0 fail / 0 skipped**。
- 全量 `node --test "test/**/*.test.ts"`（**带引号、走 Node glob**）→ **448 pass / 0 fail / 0 skipped**（含 pm 的 `test/项目管理/shared/path-primitives.test.ts`、`runtime-shared.test.ts`，因兼容再导出仍全绿）。
- `npm run typecheck` → 本角色错误**归零**（`src/common/pi-adapter/real-adapter.ts:234` 的 TS2353 已消）；全仓余 11 处属**编排 / 桌面对话测试**，不在本角色边界，**未动**。

**边界 / 跨角色（未越界改）**
- 编排（T21）/桌面（T22）待本任务把 operator 三型放入 `session.ts` 后，改为从该文件导入——本任务已**优先**落盘。
- `test/项目管理/shared/*.test.ts` 的收敛窗口期用例（pm 属主）仍导入本角色旧名；本角色以兼容再导出使其保持通过，**未编辑 pm 文件**。pm 完成收敛（删旧副本比对）后，可移除这些别名。
- 未读 `.env`、未发网络请求、未打印任何凭据值。

## 2026-10-11 — 扩展层降级为能力级 kill-switch + spawn 剥离凭据（T8a；删除 token 机制）

**来源**：本角色（Pi适配器）独立实现，全部落点在本角色边界内（`src/provider/pi/tools.ts`、`src/provider/pi/session.ts`、`src/common/pi-adapter/`、`test/pi-adapter/`）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` **§7.1 第 3 条**（扩展层原设计是错的）、**§7.5 第 4 条**（扩展层=能力级 kill-switch）、**§7.9**（env 凭据剥离）、**§7.10**（argv/`shell:false` 前提）。**PM 裁定**：上一轮（T7b）的「扩展层凭 token 放行」机制是错的——token 可由公开输入（`toolCallId` + `command`）**确定性推导**，「token 一致」只证明「调用方会算哈希」，**证明不了审核发生过**，模型照方案即可伪造。故**整个 token 机制删除**。

**改了什么**
- **删除** `src/common/pi-adapter/shell-token.ts`（`SHELL_TOOL_NAME` / `SHELL_TOKEN_ARG` / `createShellTokenStore` / `guardShellToolCall` 与 `ShellTokenStore` 类型**全部移除**）。`SHELL_TOOL_NAME` 移入 `src/provider/pi/tools.ts`。
- `src/provider/pi/session.ts`：`ShellReviewResult` **去掉 `token` 字段** → `{ allow: true; by: string } | { allow: false; reason: string; by: string }`（票据机制已废）。`ShellReviewRequest` 保留 `toolCallId`（供留痕）。
- `src/provider/pi/tools.ts`：`GovernedToolsOptions` 去掉 `shellTokens?`；`makeRunShellTool` 去掉 token 形参，`execute` 只校验「恰好 `allow:true`」（不再要求非空 token，不再 `issue`/`revoke`）。新增 `SHELL_TOOL_NAME`、`shellKillSwitch()`、`PI_CREDENTIAL_ENV_VARS`、`buildShellEnv()`；`runShell` 新增 `env` 形参，`spawn(..., { env })` 用**过滤后的 env**。
- `src/common/pi-adapter/real-adapter.ts`：去掉 shell-token 导入与 token 存储；`buildGovernanceExtension(gate, emit, shellArmed)` 对 `run_shell` 从「token 兜底」改为**能力级 kill-switch**（`shellKillSwitch`）；`run_shell` 的 JSON-Schema 去掉 `ans_allow_token`；`bindRole` 以 `shellArmed = opts.shellGate !== undefined` 驱动扩展与工具注册。

**关键设计落实**
- **扩展层 = 能力级 kill-switch（不是第二道审，如实记录）**：`on("tool_call")` 对 `run_shell` 只做**同步粗判**——**未 arm（未注入 `ShellGate`）→ 整只 `{block:true}`；arm 了即放行**，交 `execute` 细审。**不再做每调用 token 校验**。**因「唯一 shell 入口 = 我们的自定义 `run_shell`」，扩展层对它已不再是独立的第二道审**；独立价值仅剩该 kill-switch。**真正的每调用保证在 `execute`**（唯一 spawn 点，未返回明确 `allow` 绝不 spawn）。**本条降级已写入代码注释、memo 与本 changelog**，不再宣称「双层防护」。
- **「未走完审核链就绝不执行」靠两条同址结构性 fail-closed**（§7.5）：① 未 arm → `run_shell` **不注册**（能力缺席）；② `execute` 是唯一 spawn 点，只在审核返回 `allow` 后 spawn。二者**均不阻断正常调用**（arm 且审核通过即执行）——既保证、又可用，无需「默认 block 掉一切」。
- **spawn 剥离凭据（§7.9，执行环境收窄）**：`buildShellEnv(process.env)` 删除 `PI_CREDENTIAL_ENV_VARS`（大小写不敏感），其余透传；`spawn` 用过滤后 env，**绝不直接传 `process.env`**。归「执行环境收窄」，与「是否允许执行」的审核层**正交**。`PI_CREDENTIAL_ENV_VARS` = `[ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, OPENAI_API_KEY, GEMINI_API_KEY, PI_API_KEY]`，与装配 `src/common/装配/runtime.ts` **逐字一致但本角色自持一份**（§6 禁跨角色导入他人私有 `common/`；剥离点在本角色唯一 spawn 处）。**V1 取黑名单**（白名单易漏项、打断正常命令；黑名单直击凭据外泄且不误伤），**收窄白名单列为目标态**（理由见 tools.ts 注释）。
- **`shell:false` + argv 直传确认（§7.10）**：`spawn(argv[0], argv.slice(1), { shell:false, windowsHide:true, env })`——命令**不经 shell 解释**，`>`/`|`/`$()`/反引号等只作**普通参数**。故 §7.10 的「元字符硬拒空转」前提成立，与门禁引擎按「程序 + argv」重述规则集**一致**（规则集不在本角色）。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **63 pass / 0 fail / 0 skipped**（删 5 条 token 用例、新增 4 条：3 kill-switch + 1 env 凭据剥离；较删前 64 净 −1）。
- 全量 `node --test "test/**/*.test.ts"`（**带引号、走 Node glob**）→ **360 pass / 0 fail / 0 skipped**。
- **env 凭据剥离验收**：给子进程一个假凭据 `ANTHROPIC_AUTH_TOKEN=<哨兵>`（父进程 `process.env` 内），跑一条**回显该 env** 的命令，断言**命令输出不含该哨兵值**、且该变量在子进程内为 `undefined`；同时设一个**非凭据**变量 `ANS_SHELL_ENV_PASSTHROUGH`，断言它**原样透传**（证黑名单不误伤）。全部在系统临时目录，绝不写仓库；未读 `.env`、未发网络请求、**未打印任何凭据值**（送测值为假造哨兵）。

**边界 / 跨角色（未越界改）**
- **规则引擎 (c)**（`src/common/门禁引擎/classify-shell.ts` 及其 `test/门禁引擎/classify-shell.test.ts`）按 §7.10 由**门禁引擎**重述为「程序 + argv」——**不在本角色**，未动。
- `src/common/编排/shell-gate.ts` 的 `bindShellToken` 由**编排**删除（§7.4）；本角色只删自己侧（`shell-token.ts` + `ShellReviewResult.token`）。`ShellReviewResult` 定义在本角色 `session.ts`，其 `token` 字段**由本角色删除**（编排等待中）。

## 2026-10-11 — T7 第一步：run_shell（V3 命令级闸）+ 扩展层 token 兜底

**来源**：本角色（Pi适配器）独立实现，全部落点在本角色边界内（`src/provider/pi/tools.ts`、`src/provider/pi/session.ts`、`src/common/pi-adapter/`、`test/pi-adapter/`）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` §7.1（安全实质）、§7.2（机制骨架）、§7.5（fail-closed 四点半）、§7.7（与 `GOVERNED_WRITE_TOOLS` 的关系）。客户裁定「给 shell，但任何执行前必须过 pm 审核」；本步实现 **(c) 硬地板 + fail-closed 三条退路 + 扩展兜底** 的 Pi适配器侧（判定策略 `classifyShell` 归门禁引擎、`ShellGate` 装配归编排，均不在本角色）。

**改了什么**
- `src/provider/pi/session.ts`：新增冻结类型 `ShellReviewRequest` / `ShellReviewResult` / `ShellGate`（与 `WriteGate` 并列；仅类型，无策略）。`createFakeRuntimeAdapter` 与 `PiRuntimeAdapterOptions` 新增可选 `shellGate` / `shellCwd` / `shellReviewTimeoutMs` 并透传。
- `src/provider/pi/tools.ts`：新增 `run_shell`（`buildGovernedTools` 内，与 write_file/edit_file 并列）。`GovernedToolsOptions` 加 `shellGate?` / `shellCwd?` / `shellTokens?` / `shellReviewTimeoutMs?`。`ToolDefinition.handler` 的 call 参数加可选 `toolCallId`。新增 `splitCommand`（best-effort tokenizer）、`runShell`（`spawn(argv[0], argv.slice(1), {shell:false, windowsHide:true})`）、`makeRunShellTool`。
- 新增 `src/common/pi-adapter/shell-token.ts`（私有，不 import Pi/门禁引擎）：`SHELL_TOOL_NAME`、`SHELL_TOKEN_ARG`、`createShellTokenStore()`、`guardShellToolCall()`。
- `src/common/pi-adapter/timeout.ts`：新增 `DEFAULT_SHELL_REVIEW_TIMEOUT_MS` / `SHELL_REVIEW_TIMEOUT_ENV`。
- `src/common/pi-adapter/real-adapter.ts`：`bindRole` 建一份 `ShellTokenStore` 同时交给工具层与扩展层；`buildGovernedTools` 传 `shellGate/shellCwd(=projectRoot)/shellTokens/shellReviewTimeoutMs`；`buildGovernanceExtension` 对 `run_shell` 加**独立 token 兜底**分支（**不喂 resolveWrite**）；`toPiTool` 按工具名给 Schema（run_shell 用 `{command, ans_allow_token?}`，**无 path**）并把 `toolCallId` 透传给 handler。

**关键设计落实**
- **execute 顺序**：取 `command` → `await withTimeout(shellGate(req), 时限)` → **仅当恰好 `allow:true` 且带非空 token** 才 `spawn`；`allow:false`/`undefined`/抛错/超时 → 在任何 spawn 之前返回 `ok:false` + 原因。
- **结构性 fail-closed（§7.5.1）**：`shellGate === undefined` 时 `buildGovernedTools` **不 push** run_shell——工具根本不存在（非 execute 内判空）。
- **cwd 钉在 projectRoot**（`shellCwd`）；`toolCallId` 透传，token 与之绑定。
- **不加入 `GOVERNED_WRITE_TOOLS`**（§7.7）：其 input 无 `path`，加了等于没加；扩展兜底走独立 token handler。
- **执行层不经 shell**（`shell:false`）：argv 直接 exec，`>`/`|`/`$()` 只作普通参数——即使 tokenizer 拆分有偏差也不会造成 shell 注入。
- **审核超时 = 拒绝**：复用 `timeout.ts` 的 `withTimeout`。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **64 pass / 0 fail / 0 skipped**（新增 `test/pi-adapter/run-shell.test.ts` 15 用例）。
- `node --test test/*/*.test.ts`（全量）→ **286 pass / 0 fail / 0 skipped**。
- 「拒绝时进程从未启动」的证明：用例让命令写一个**临时痕迹文件**（`process.env.ANS_TRACE_FILE`），拒绝/抛错/超时后断言该文件**不存在**；allow 用例断言它**存在**。全部在系统临时目录，绝不写仓库、用完即清理。未读 `.env`、未发网络请求、未打印凭据。

**跨角色构造点（如实标注，未越界改）**
- **两层在真实 Pi 单次调用里不自动闭合**：扩展 `on("tool_call")` 在执行**前**触发（agent-session.js:322-347），而 run_shell 的 `execute`（`shellGate` + token 登记）在其**后**才跑——故扩展层在正常路径上看不到 execute 刚登记的 token，会**默认 block**。本角色按规格实现了**两层各自正确**；**闭合须编排（T8）协调**：由扩展层（或更早的 handler）先跑审核并把 token 写入 mutable `event.input`（types.d.ts:957）后放行、execute 复用，或由审核在工具调用前预置 token。已上报。
- **run_shell 继承 `process.env`**（含凭据变量）：是否剥离属**权限策略**，归审核层/编排，不在本角色。

## 2026-10-11 — 写入真正落盘（T3）：写根、原子写、TOCTOU/符号链接复核、未配置写根 fail-closed

**来源**：本角色（Pi适配器）独立实现，全部落点在本角色边界内（`src/provider/pi/tools.ts`、`src/provider/pi/session.ts`、`src/common/pi-adapter/`、`test/pi-adapter/`）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` §3.1（块2 落盘）、§5.1（验收）、§6（风险）。此前 `tools.ts` 的 `write_file`/`edit_file` 是**占位**（只 `import` 了 `readFile`，获准后仅回一句「原型阶段未真正落盘」）——受治理会话无法真正改代码。

**改了什么**
- `src/provider/pi/tools.ts`：`GovernedToolsOptions` 新增 `writeRoot?`。写类工具在调 gate **之前**把 `path` 解析为 `abs = isAbsolute(path) ? path : resolve(writeRoot, path)`，**把 abs 传给 gate**，写入用**同一个 abs**（与 `resolveWrite` 把相对路径按项目根解释同源）。`write_file`：获准后 `mkdir -p` 父目录 → **原子写**（同目录 temp + `rename`）。`edit_file`：读原文件 → `old_string`/`new_string` 替换（未命中 → `ok:false` 且**不写**）→ 原子写回。`read_file` 保持不变（读不过写门禁）。**未配置 `writeRoot` 时写类工具只判定、不落盘**（fail-closed）。
- 新增 `src/common/pi-adapter/fs-write.ts`（私有，不 import Pi、不 import 门禁引擎）：`guardWriteTarget`（词法 + 名称安全 + 真实路径复核 + 目标本身非链接）、`recheckParentInsideWriteRoot`（`rename` 前的二次复核）、`ensureParentDir`、`atomicWriteFile`、`resolveWriteAbs`、以及门禁引擎路径语义的**镜像副本**（`normalizeLexical`/`absRelLexical`/`realResolveAsync`）。
- `src/common/pi-adapter/real-adapter.ts`：`buildGovernedTools(opts.gate, { readRoot: opts.projectRoot, writeRoot: opts.projectRoot })`——**写根恒等于 projectRoot**（写根 ≠ 读根）。
- `src/provider/pi/session.ts`：`createFakeRuntimeAdapter` 新增可选 `readRoot`/`writeRoot` 并透传（缺省仍不落盘，测试可显式指向临时目录）。
- 测试：`test/pi-adapter/tools.test.ts` 扩到 **22 用例**，覆盖 §5.1 全项；`test/pi-adapter/fake-adapter.test.ts` 更新「allowed 写」用例并新增「配置 writeRoot 后真正落盘」用例。

**验证（本角色执行）**
- `node --test test/pi-adapter/*.test.ts` → **49 pass / 0 fail / 0 skipped**。
- `node --test test/*/*.test.ts`（全量）→ **253 pass / 0 fail / 0 skipped**。
- 落盘用例均在**系统临时目录**内做真实 FS 操作，绝不写仓库、用完即清理；未运行需网络/凭据的探针，未读 `.env`，未打印凭据值。
- 直接证据（脱离测试框架，独立复核守卫）：目录 junction `root/escape -> outside` 目标 `root/escape/evil.txt` → `guardWriteTarget` 返回 `{ok:false, reason:"...逃逸出写根：<outside>/evil.txt"}`；指向写根**之内**的 junction `root/inside -> root/real` 目标 `root/inside` → `{ok:false, reason:"目标为符号链接，拒绝写入..."}`。两分支均真实触发。

**已知限制（如实标注）**
- Windows 建**文件**符号链接需管理员/开发者模式（本机 EPERM），故「目标本身是链接」用例以目录 junction 覆盖；文件符号链接逃逸的直测被跳过。
- 「真实父目录复核」与 `rename` 之间若被**主动竞态**把祖先换成写根外链接，`mkdir` 可能已在写根外建目录（不回收）——纯竞态；写入本身仍被 `rename` 前的复核拦下。
- `edit_file` 仅 UTF-8（UTF-16 拒绝以免损坏）；**BOM 原样保留**；**EOL 不归一化**（old_string 须逐字节匹配，含 CRLF）；仅替换**首个**匹配；整文件读入内存（不处理超大文件）。
- **写根恒为 projectRoot**：写类工具拒绝一切落在 `writeRoot` 之外的写入，**即使 gate 放行了 skill 根的路径**（按设计 §3.1/§6.2「写根 ≠ 读根、写根恒为项目根」）。受治理角色会话的写入目标是项目根内的文件，故这是有意的收窄；若日后需要技能根写入，须另行设计而非复用本写根。

**跨角色待办（不在本角色边界内，未改）**
- `app/desktop/chat-adapter.ts`（桌面应用边界）与 `src/common/装配/` 之外的演示替身调用 `buildGovernedTools(gate)` **未传 `writeRoot`**。因 fail-closed 默认，它们现仍是「只判定、不落盘」（安全，既有演示与全量测试均未受影响）。若要让桌面 demo 真正落盘，须由**桌面应用角色**传入 `writeRoot`，且**应指向沙箱目录**（其 demo 内容若写进 projectRoot 会覆盖真实文件，如 `角色卡/桌面应用/feature-map.md`）。

## 2026-10-11 — 显式配置模型上下文窗口（contextWindow），打通 Pi 自动压缩并使其可见（复核通过）

**来源**：本改动由**顶层会话越界**直接写入本角色边界内文件（未走本角色）；客户判定流程不对，决定「代码保留、由本角色复核并补记录」。以下为本角色独立复核与独立验证。

**改了什么（复核所见）**
- `src/common/pi-adapter/provider-config.ts`：`PiProviderConfigInput` / `PiProviderConfig` 新增 `contextWindow?: number`；新增 `parseContextWindow(explicit, envValue)`——显式值优先，其次环境变量 `ANS_PI_CONTEXT_WINDOW`，都缺则 `undefined`，给了但 ≤0 或非数则**抛错**（fail-closed）；`resolvePiProviderConfig` 返回值新增 `contextWindow`。
- `src/common/pi-adapter/real-adapter.ts`：`buildExplicitRuntime` 返回类型新增 `contextWindowSource: "configured" | "template"`，克隆模板模型时在配置了 `contextWindow` 时**覆盖**它；新增与既有 baseUrl 同风格的安全护栏——配置了 `contextWindow` 时断言 `selected.contextWindow === cfg.contextWindow`，不等即抛错；`bindRole` 在 `contextWindowSource === "template"` 时 `log.stage` 告警**并** `emit({kind:"message"})` 一条可见告警；`buildGovernanceExtension` 新增三个压缩钩子，映射到**既有** SessionEvent kind（`message`/`message`/失败时 `denied`），不新增 kind（尊重契约 §4 冻结类型）。
- `test/pi-adapter/provider-config.test.ts`：新增 3 用例（未配置为 undefined / 显式与环境变量都能取到 / 非法值抛错）。

**复核结论：接受（附一条保留）。**
- 通过——根因成立：Pi **确自带自动压缩**（`DEFAULT_COMPACTION_SETTINGS.enabled=true`，compaction.js:54-58；`shouldCompact` 条件 compaction.js:173）。原适配器克隆模板时不改写 `contextWindow`，模板模型 `claude-fable-5` 的值为 **1,000,000**，阈值 983,616 真实网关模型够不着——长会话先吃服务端超长报错。本改动正对此。
- 通过——钩子名与字段与安装包**逐字一致**（详见下方验证）。
- 通过——**自动路径确实会发出这三个压缩事件**，可见性改动不是空转（agent-session.js:2482/2532/2576）。
- 通过——护栏 fail-closed，风格与既有 baseUrl 护栏一致。

**验证（本角色独立执行，对照 `node_modules/@earendil-works/pi-coding-agent/dist/`）**
- 钩子名：`session_before_compact`/`session_compact`/`session_compact_failed`（extensions/types.d.ts:1169-1171）。
- 事件字段：`SessionBeforeCompactEvent{reason,willRetry}`、`SessionCompactEvent{compactionEntry,reason,willRetry}`、`SessionCompactFailedEvent{reason,errorMessage?,aborted,willRetry,fromExtension}`（types.d.ts:585-625）；`CompactionEntry.tokensBefore:number`（session-manager.d.ts:50）。
- 压缩常量与触发点：compaction.js:54-58、:173；agent-session.js:1445（工具结果后）、:1586（新 prompt 前）。
- 模板模型：`anthropicProvider().getModels()[0]` = `claude-fable-5`，`contextWindow=1000000`（实测）。
- **in-memory 会话下压缩可跑**：`SessionManager.inMemory(cwd)` = `new SessionManager(cwd,"",undefined,false,…)`（session-manager.js:1364）；`appendCompaction`→`_appendEntry`→`_persist` 在 `!persist` 时早返回（session-manager.js:794-795）；`getBranch`/`buildSessionProjection` 读内存。结论：**能跑**，改动价值成立。
- 实测：`node --test test/pi-adapter/*.test.ts` → **30 pass / 0 fail**（含本角色补加的优先级用例「contextWindow：显式值优先于环境变量（含显式非法时不回落到环境变量）」，结果通过）。未运行 `wire-probe.ts`，未读 `.env`，未打印任何凭据值。

**保留（既有问题，非本次改动引入，未修改代码）**
- 适配器未向 `createAgentSession` 传 `settingsManager`，SDK 回落到 `SettingsManager.create(cwd, getAgentDir())`（sdk.js:76），即读 `~/.pi/agent/settings.json`（或 `$PI_CODING_AGENT_DIR`）与 `<项目>/.pi/settings.json`。默认安全（`compaction.enabled` 缺省 true），但用户全局若设 `compaction.enabled=false` 或改阈值会改变行为——运行时环境未彻底封闭。建议后续传入固定的/in-memory settingsManager。

## 2026-10-11 — 封闭运行时设置来源；统一 contextWindow 缺失为硬失败

**来源**：本角色（Pi适配器）独立实现，属本角色边界内。任务 A 封闭设置来源、任务 B 统一失败策略；均先对照安装包 `node_modules/@earendil-works/pi-coding-agent/dist/` 核实 API 再落地。

**任务 A：把设置来源显式化（环境封闭）**
- 新增 `src/common/pi-adapter/settings.ts`（**不 import Pi**）：导出 `ANS_SETTINGS_OVERRIDES`——固定的压缩覆盖常量。
- `src/common/pi-adapter/real-adapter.ts`：
  - 新增导出 `buildIsolatedSettingsManager()`：`SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES)`；
  - `bindRole` 中把该 manager **同时**交给 `DefaultResourceLoader`（否则其回落 `SettingsManager.create`，resource-loader.js:243）与 `createAgentSession`（否则回落 `SettingsManager.create(cwd, agentDir)`，sdk.js:76）。
- 选定值（依据：**均等同 Pi 内置缺省**，故与干净安装行为一致；显式钉住只为让压缩行为只由我们给出的值决定，既不受用户文件影响，也不受 SDK 未来改默认值影响）：
  - `compaction.enabled = true`（自动压缩是我们**要**的行为，不关闭）；
  - `compaction.reserveTokens = 16384`、`compaction.keepRecentTokens = 20000`；
  - `branchSummary.reserveTokens = 16384`。

**任务 B：统一配置缺失的失败策略**
- `src/common/pi-adapter/provider-config.ts`：`PiProviderConfig.contextWindow` 由可选改**必需** `number`；`resolvePiProviderConfig` 在缺 contextWindow 时**硬失败**（错误信息说明该设 `opts.contextWindow` / `ANS_PI_CONTEXT_WINDOW` 及原因），位置紧跟缺 modelId 之后、缺凭据之前。
- `src/common/pi-adapter/real-adapter.ts`：`buildExplicitRuntime` 返回类型去掉 `contextWindowSource`，**无条件**覆盖 `contextWindow`；删除不会再触发的 "template" 告警分支。
- **判断：同意硬失败。** 理由：模板值 1,000,000 使 Pi 自动压缩阈值（contextWindow − reserveTokens）永远够不着，长会话先吃服务端超长报错——正是上一小节刚修缺陷的根因，静默回落等于把它放回来；且与既有 baseUrl/modelId/凭据的 fail-closed 一致。**替代方案（未采用）**：若客户确已跑通短会话而不便新增环境变量，可改为「缺 contextWindow 时仍硬失败，但允许一个显式逃生阀 `ANS_PI_CONTEXT_WINDOW_OPTIONAL=1` 退回告警」——但那只能靠另一次代码变更，不是本次范围，故先按最保守的硬失败落地。

**API 依据（文件:行）**
- `createAgentSession` 接受 `options.settingsManager`（sdk.js:76 取用；sdk.js:306 传入 AgentSession）。
- `SettingsManager.inMemory(settings?, options?)`：「Create an in-memory SettingsManager (no file I/O)」（settings-manager.d.ts:213；实现 settings-manager.js:251-256，用 `InMemorySettingsStorage`）。
- `SettingsManager.create(cwd, agentDir?)` 的回落对象（settings-manager.js:222-231），项目设置路径 `<cwd>/.pi/settings.json`（js:229）。
- 压缩缺省：`DEFAULT_COMPACTION_TOKEN_SETTINGS = {reserveTokens:16384, keepRecentTokens:20000}`（settings-manager.js:10-13）；`getCompactionEnabled()`→`?? true`（js:621-623）；`getCompactionSettings(model?)`（js:655-662）；`DEFAULT_COMPACTION_SETTINGS`（compaction.js:53-57）；`getBranchSummarySettings` 缺省 reserveTokens 16384（js:663-668）。
- `DefaultResourceLoader` 构造回落（resource-loader.js:243）。

**测试**
- `test/pi-adapter/settings.test.ts`（新增）：纯值断言不依赖 Pi；Pi 在场时断言 `buildIsolatedSettingsManager().getCompactionSettings()` 恒为钉住值，并**对照组**演示文件式合并会读到埋在 `<tmp>/.pi/settings.json` 的敌意设置（enabled:false）——直接证明本改动堵住了该泄漏。
- `test/pi-adapter/provider-config.test.ts`：原「未配置为 undefined」用例改为「未配置 → 抛错」；新增「构造适配器时缺 contextWindow 即抛错」；补齐既有用例的 contextWindow。
- `test/pi-adapter/real-adapter.smoke.test.ts`、`real-adapter.timeout.test.ts`、`wire-probe.ts`：构造/解析处补 `contextWindow`（wire-probe 并同步传入 settingsManager，保持与实现接线一致）。
- 实测：`node --test test/pi-adapter/*.test.ts` → **34 pass / 0 fail**。未运行 `wire-probe.ts` 的真实 turn，未读 `.env`，未打印任何凭据值。`npm run typecheck` 在本环境不可用（未安装 typescript），故仅有运行时证据。

**需装配同步（未改，属其边界）**
- `.env.example`：`ANS_PI_CONTEXT_WINDOW` 的注释目前写明「不设则沿用模板的 1,000,000」，与新行为不符。应改为与 baseUrl/model 同风格：**缺失即明确失败**（必填），删除「沿用模板值」的表述。

**边界说明**
- 未改动 `src/pipeline/orchestration/run-role.ts`（编排边界）：其 `createPiAdapterFactory` 只传 gate/root，靠环境变量取配置，故本次改动后若 `.env` 无 `ANS_PI_CONTEXT_WINDOW`，该工厂构造适配器时会**硬失败**——这是预期行为，已在 memo 记录。
