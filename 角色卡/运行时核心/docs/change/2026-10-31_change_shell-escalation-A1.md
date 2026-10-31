# 运行时核心 A1 完成报告：shell 判拒客户升级契约与工具

- **任务 ID**：`2026-10-31-shell-deny-customer-escalation`（节点 A1）
- **角色**：运行时核心（独立固定上下文）
- **日期**：2026-10-31
- **状态**：`implemented-unverified`（契约/工具/schema 已实施；无提交、无推送、未启动应用；端到端由 B1/C1/D 批次接线并验证）。**含 E2 返工 R2 契约加法（`pending` 支，见 §7）**。
- **实施基线**：客户确认方案 v1.3 `docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`（857 行 / SHA-256 `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`）§6.3/§7.1/§7.4/§9；团队计划（575 行 / `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203`）A1；实施前标准（1320 行 / `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b`）。
- **代码基线**：分支 `feat/flow-improvements-wave1`，HEAD `9f670fb2c7d403baf995071055d697c50714c905`（与派发基线一致）。
- **环境**：Node `v24.22.1` / npm `11.19.1` / win32 x64 / Git Bash（MINGW64_NT-10.0-26300）。

## 1. 写集与逐文件哈希

写集严格限定在 A1 授权内：`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/`（新增 1 个测试文件）、自身根文档与 `角色卡/运行时核心/docs/change/`。

### 1.1 产品与测试文件（before / after）

| 文件 | 写前 `git hash-object`（HEAD blob） | 写前 `sha256sum`（工作区） | 写后 `git hash-object` | 写后 `sha256sum` |
| --- | --- | --- | --- | --- |
| `src/model/runtime.ts` | `b065292c1c6d541d7d0c4b35c5e6a3ad65138fb6` | `2d8b4d9f752259e5b8c5a5d82b43268d0d14653a099c1341804c2a24a6bd906b` | `5b39807b7e81809fe37e0ecf34f4173dbfc64261`（E2 R2 后） | `5602c36ffc61a1477d6a3af17e07f38763370d1239bdf31098bcc19a230abecf`（E2 R2 后） |
| `src/provider/runtime/tools.ts` | `1c451558415403f70dd430ff2b94d912485c7ed4` | `a6440f9b62f15aa0c10bc7e6b191cef8fedec421e58b05b77b93fbe64bdef103` | `8ee042e48d393b556df3f890967d083b259eafc1` | `a04cf4d974332cb0a09db37e68165b2909af0cb7843f23dfb06154a39193c4a1` |
| `src/provider/runtime/schema.ts` | `47898d2d13ec071b6bc67ac360cf9015dd51c6d1` | `8ff03669f6017f51f0be6acc41c69665da281036afa06ba7c0e6443c19db8a34` | `5a63db425cf1e9279a46695c656e8141e8789205` | `c98de0af017636437234fee44ea0b7fee0c2dd4eadc74710a3bc6a61a4d8d566` |
| `test/runtime-core/shell-escalation-contract.test.ts`（新增） | 无（新文件） | 无 | `141d1196152db3ea356209dba994b3d7b397e8b4`（E2 R2 后） | `f510b84eca9acc0350f2f0d7cc6c30cab6ef651144d4fcc7cd1361b7131580a7`（E2 R2 后） |

> 写前 blob 与派发基线一致。写前工作区 `sha256` 与派发记录一致（工作区为 CRLF，`git cat-file` 的 LF 视图哈希不同，不混用两种口径）。

### 1.2 自身文档（角色根文档；非产品候选）

| 文件 | 写前 HEAD blob | 写后 `git hash-object` | 写后 `sha256sum` |
| --- | --- | --- | --- |
| `角色卡/运行时核心/api-spec.md` | `87ea4896af94a4d15bd502713dc9fef5a309d9ae` | `45e67767e5e909a6cb159b8ace665a81ec8760ca` | `dd0df5e9b1ba892d6f6ab9510bdb4a2c51f96c2122224834433491366364aec6` |
| `角色卡/运行时核心/memo.md` | `097aa353bad23601292e1489361ea507a0276609` | `6c96d317b1b846d832363b9a8a4a456c81142ee2` | `61d8d3b5295c8ce4b15c076433805287c2c13dd9203e54dede6c2388d541a02d` |
| `角色卡/运行时核心/feature-map.md` | `35beb7acd5e10cc0c3f9a221f384fb91aed11721` | `a61263c497cd93bef76b6e0f24a07fc4e60a2023` | `7ede6c8e91b2468d5ed7d2587fb0c60a89a36ef19699aae87101e5db1a22ac7e` |

## 2. 实现内容（严格按方案 §6.3/§7.1 的加法）

### 2.1 `src/model/runtime.ts`（契约冻结）

- 新增 `ShellEscalationAction`（`"allow-once" | "allow-session" | "deny"`）、`ShellEscalationDecision`（三选一 + `operatorId?`；或 `expired`/`unavailable` + `reason?`；**E2 R2 增 `pending` + `reason?`**，见 §7）、`ShellEscalationCardRequest`（`version:1`/`requestId`/`roleId`/`projectRoot`/`runtime`/`command`/`argv`/`cwd`/`judgeReason?`/`judgeCustomerMessage?`/`judgeAlternative?`/`necessity?`/`approvalContext?`/`expiresAt?`）、`ShellEscalationPresentFn`、`ShellEscalationFn`（入参 `{command, argv, necessity?}`，返回 `{ok, message, state?}`）、`ShellGrant`（`scope:"once"|"session"`/`requestId`/`operatorId?`）。
- `ShellReviewRequest` 增可选 `entry?: "run_shell" | "start_background_task"`（缺省按 `run_shell` 兼容旧调用）。
- `ShellReviewResult` 允许分支增可选 `grant?: ShellGrant`（不改变 `allow` 语义）。
- `ShellJudgeAudit` 增可选 `manualAsDeny?: true`（与桌面侧既有本地扩展 `ShellJudgeAuditWithManual` 同类型，不冲突）。
- `GovernedToolsOptions` 增 `shellEscalation?: ShellEscalationFn`；`RuntimeSessionOptions` 经 `...options` 自动透传，`src/service/runtime/session.ts` 无需改动（本节点未写该文件）。
- 模型层不依赖桌面/Node；既有字段不删除、不改语义。

### 2.2 `src/provider/runtime/tools.ts`

- 新工具 `request_shell_escalation`（常量 `REQUEST_SHELL_ESCALATION_TOOL_NAME`）：**只在 `shellGate` 已注入（shell 已 arm）且 `shellEscalation` 注入时注册**；任一缺席 ⇒ 工具不存在（fail-closed）。判断会话不经 `buildGovernedTools`，天然不可见。
- 处理器只取 `command`（`core-command-v1`）与可选 `necessity`；`argv` 由本文件唯一 `splitCommand` 生成后交 registry；模型提供的 `argv`/`grant` 等字段不被读取。
- `necessity` 按方案 §4.3 双上限（≤500 字符且 UTF-8 ≤1024 字节）在工具层校验：超限**拒绝、不截断**；非字符串/空白分别拒绝/视为未提供。
- 回执原样转达 `ok`/`message`；`ShellEscalationFn.state` 不在 `ToolResult` 契约内，故不向模型透出（registry/桌面消费）；异常、缺失/非法回执一律按「未获客户允许」fail-closed，绝不写成已批准。
- `run_shell` 与 `start_background_task` 在 `ShellReviewRequest` 中填 `entry`（`run_shell` 的执行后写审计请求同填 `entry:"run_shell"`）。
- `ShellReviewResult.grant` 存在时，在结果末尾附「客户已允许一次（allow-once）」/「客户已允许本会话执行该精确命令（allow-session）」说明；无 grant 时既有文案逐字不变。

### 2.3 `src/provider/runtime/schema.ts`

- 新工具 schema：参数仅 `command`（必填）+ `necessity?`（`maxLength:500`），`additionalProperties:false`；**不暴露 argv/授权字段**。
- 描述与 promptGuidelines 明确：只申请、不执行命令、不写盘、不创建/消费授权；选项仅三选一；无答复默认拒绝；同一命令每角色会话最多一次；会话上限默认 5；硬拒/封堵/写守卫/只读档/后台入口不可申请；申请≠批准。

## 3. 检查与证据

原始日志目录：`C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\A1\`（不在仓库内）。

| # | 命令 | 退出码 | 摘要 | 证据文件 / 行数 / SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | `node --test "test/runtime-core/**/*.test.ts"` | 1 | 281 tests / 274 pass / 3 fail / 4 skip / 0 todo | `01-runtime-core-tests.txt`（340 行，`e246eb…f1df`）；`01-runtime-core-tests.exit.txt`（1 行，`840895…3326`） |
| 2 | `node --test test/runtime-core/shell-escalation-contract.test.ts` | 0 | 9 tests / 9 pass / 0 fail / 0 skip / 0 todo | `03-new-test-file.txt`（17 行，`d08a61…df99`）；exit（`194ff5…6106`） |
| 3 | `npm run typecheck` | 0 | `tsc --noEmit` 无输出 | `02-typecheck.txt`（4 行，`2d13ff…0435`）；exit（`194ff5…6106`） |
| 4 | `node --test "test/runtime-core/**/*.test.ts"`（E2 R2 后） | 1 | 282 tests / 275 pass / 3 fail / 4 skip / 0 todo | `07-runtime-core-tests-r2.txt`（341 行，`04a291…19e1`）；exit（`840895…3326`） |
| 5 | `node --test test/runtime-core/shell-escalation-contract.test.ts`（E2 R2 后） | 0 | 10 tests / 10 pass / 0 fail / 0 skip / 0 todo | `08-new-test-file-r2.txt`（18 行，`a25d46…8fe1`）；exit（`194ff5…6106`） |
| 6 | `npm run typecheck`（E2 R2 后） | 0 | `tsc --noEmit` 无输出 | `09-typecheck-r2.txt`（4 行，`2d13ff…0435`）；exit（`850a69…731b`） |

其他证据：`00-pre-environment.txt`（36 行，`a9bc18…2ccf`；HEAD/Node/npm/OS/初始 `git status`）、`00-pre-hashes.txt`（8 行，`ccece0…1bdb`）、`00b-before-from-HEAD.txt`（8 行，`c60941…2c20`；HEAD blob 与 `git cat-file` LF 视图 sha256）、`04-git-scope.txt`（68 行，`7c7372…67e3`；`git diff --name-only` / `git status --short` / 写集过滤 / 暂存区）、`05-post-hashes.txt`（8 行，`ccece0…1bdb`，与 `00-pre-hashes` 一致，证明检查后无改动）。

### 3.1 失败分类（对照 B0）

- B0 基线（测试角色）：272 tests / 265 pass / 3 fail / 4 skip；3 fail 均为既有 Windows symlink EPERM：`file-write-safety.test.ts:97`、`session-store.test.ts:46`、`session-store.test.ts:58`。
- 本次：281 tests / 274 pass / 3 fail / 4 skip ⇒ **+9 计 +9 过**（新增测试文件 9 例），失败仍恰为上述 3 条，原文同为 `EPERM: operation not permitted, symlink`；**新增确定性失败 = 0，新增 skip = 0**，无新增 todo。
- E2 R2 后：282 tests / 275 pass / 3 fail / 4 skip ⇒ 在 A1 基础上 **+1 计 +1 过**（新增 pending 契约用例），失败仍恰为上述同 3 条；**新增确定性失败 = 0，新增 skip = 0**。
- `npm run typecheck` exit 0（全仓；此结果同时覆盖工作树中其他角色并行改动）。

### 3.2 工作区范围的如实说明

`04-git-scope.txt` 的完整 `git status --short` 还包含**其他角色在本共享 worktree 的并行改动**（如 `src/common/门禁引擎/*`、`src/common/shared/i18n/messages/*`、`src/service/gate/shell-rules.ts`、`test/门禁引擎/*`、`test/项目管理/shared/i18n.test.ts`、`角色卡/{桌面窗口,编排,门禁引擎}/boundary*` 等）。这些**不是本节点写入**；A1 的已跟踪改动仅 `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`，新增仅 `test/runtime-core/shell-escalation-contract.test.ts` 与本节文档。`git diff --cached --name-only` 为空（未暂存）。

## 4. 契约冻结声明（供 B1/C1 消费）

本节点完成即冻结以下形状；B1/C1 只按此消费，任何变更回到运行时核心并重跑受影响证据：

1. **升级通道类型**：`ShellEscalationAction` / `ShellEscalationDecision` / `ShellEscalationCardRequest` / `ShellEscalationPresentFn` / `ShellEscalationFn` / `ShellGrant` 与方案 §6.3 逐字段一致；**E2 R2 在 `ShellEscalationDecision` 追加 `{ action:"pending"; reason? }` 第三支（见 §7）**。`ShellEscalationCardRequest` **不含** `kind`——IPC 信封的 `kind:"escalation"` 由桌面窗口按其类型扩展（方案 §7.1；团队计划 A1「kind 由桌面侧扩展」）。
2. **加法字段**：`ShellReviewRequest.entry?`；`ShellReviewResult` 允许分支 `grant?`；`ShellJudgeAudit.manualAsDeny?: true`；`GovernedToolsOptions.shellEscalation?`。旧调用/旧形状零变化（`test/runtime-core/shell-escalation-contract.test.ts` 最后一例钉住）。
3. **工具面**：`request_shell_escalation` 仅 `shellGate` + `shellEscalation` 双注入时注册；参数 `{command, necessity?}`；`argv` 只由工具侧 `splitCommand` 生成；`necessity` 双上限由工具层拒绝（不截断）；回执只转达 `ok`/`message`，`state` 不进入 `ToolResult`。
4. **入口与授权说明**：`run_shell`/`start_background_task` 均在 `ShellReviewRequest` 填 `entry`；`review.grant` 存在时结果附「客户已允许一次/本会话」说明；v1 只有 `run_shell` 会实际收到 grant（B1 保证后台不消费）。
5. **职责分界**：判拒台账/资格/状态机/限流/授权存储/脚本上下文时效/审计事件（`event:"escalation-decision"`）在编排 B1；升级卡呈现/仲裁/IPC/暂停在桌面 C1；`ANS_SHELL_ESCALATION_DISABLED=1` 的回滚由 B1 在注入端实现，本层以「未注入 ⇒ 不注册」承接。

## 5. 实现声明、未解决项与风险

- **necessity 超限行为（AC-04 要求的实现声明）**：采用「拒绝、不截断」；双上限为「≤500 字符（Unicode 码点）且 UTF-8 ≤1024 字节」。
- **`state` 不透出**：`ShellEscalationFn` 的 `state?` 保留在能力契约中供 registry/桌面消费；`ToolResult` 无对应字段，工具层不向模型展示（模型只按 `message` 行动）。
- **显示规则**：新工具未加入 `core-command-v1` 显示投影（保持 `none`）。这是为避免在 A1 扩大尚未确认的工具行展示契约；若 C1/C2 需要命令展示，应作为显式变更协调，而非本节点顺带扩大。
- **端到端未验证**：B1 registry/资格/授权/审计与 C1 卡片/IPC 未接线，工具当前不会被注入 ⇒ 不注册（fail-safe toward 现状）。`ANS_SHELL_ESCALATION_DISABLED` 语义只能由 B1 的注入端测试最终核对。
- **共享 worktree 并发**：检查结果包含其他角色并行改动（路径见 §3.2），B0 对照仍成立；若其他角色的改动后续影响 `shellGate` 的 `entry`/`grant` 消费，需在 B1 联合回归。
- **无阻塞项**，未发现需要改设计或扩大写集的问题。

## 6. 无越权改动声明

- 未写 `src/common/**`、`src/pipeline/**`、`src/service/**`、`app/**`、其他角色测试目录、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、任何角色卡/边界/YAML；未写 `package.json`/锁文件/构建与发布配方/`release-policy.mjs`。
- 未 commit、未 push、未合并、未发布、未启动应用、未使用 stash；未暂存任何文件。
- 未修改/弱化既有断言（既有测试文件未改动）；未新增 skip/todo；未伪造输出；所有证据为原始命令输出与文件哈希。

## 7. E2 R2 契约加法（`pending`）

- **来源**：E2 返工 R2 经调度会话提出的最小加法请求（2026-10-31）；不改变既有字段语义，不新增设计外类型。
- **改动**：`src/model/runtime.ts` 的 `ShellEscalationDecision` 增第三支 `{ action: "pending"; reason?: string }`，与现有 `allow-once`/`allow-session`/`deny` 及 `expired`/`unavailable` 并列。
- **语义（供 B1/C1 消费）**：呈现端在**已有待答 shell 卡（审批/升级）**时返回 `pending`；registry 据此**不消耗申请权/额度、保持 `recorded`、可稍后再申请**。它不是默认拒绝，也不是客户做出的决定——不得据此放行、不得写客户决定审计/`customerGrant`。既有「无答复/通道失败 ⇒ `expired`/`unavailable` 默认拒绝」语义不变。
- **测试**：`test/runtime-core/shell-escalation-contract.test.ts` 增 1 例「E2 R2：ShellEscalationDecision 增 pending 支（reason 可选）；既有三支形状不变」——覆盖 `{action:"pending"}`、带 `reason` 的 pending、pending 不带 `operatorId`，并回归 allow-once/allow-session/deny/expired/unavailable 既有形状；未弱化断言、未新增 skip。
- **改动文件与哈希（E2 R2 后）**：
  - `src/model/runtime.ts`：`git hash-object` `5b39807b7e81809fe37e0ecf34f4173dbfc64261` / `sha256sum` `5602c36ffc61a1477d6a3af17e07f38763370d1239bdf31098bcc19a230abecf`。
  - `test/runtime-core/shell-escalation-contract.test.ts`：`git hash-object` `141d1196152db3ea356209dba994b3d7b397e8b4` / `sha256sum` `f510b84eca9acc0350f2f0d7cc6c30cab6ef651144d4fcc7cd1361b7131580a7`。
- **检查**：`node --test test/runtime-core/shell-escalation-contract.test.ts` exit 0（10/10）；`node --test "test/runtime-core/**/*.test.ts"` exit 1（282/275/3/4/0；3 fail 仍为 B0 同项 Windows symlink EPERM）；`npm run typecheck` exit 0。证据 `07-runtime-core-tests-r2.txt`（341 行 / `04a291…19e1`）、`08-new-test-file-r2.txt`（18 行 / `a25d46…8fe1`）、`09-typecheck-r2.txt`（4 行 / `2d13ff…0435`）、`10-r2-hashes.txt`（13 行 / `13feed…0982`）。
- **范围**：按 E2 R2 指令只改 `src/model/runtime.ts`、该测试文件与本报告；`api-spec.md`/`memo.md`/`feature-map.md` 保持 A1 快照未动（其中 `ShellEscalationDecision` 描述尚未含 `pending`，如需同步请另行派发或由本角色后续更新）。未 commit/push、未改其他文件、未新增设计外类型。
