# shell 判拒后的客户确认通道 —— 编排核心（B1）变更记录

- 日期：2026-10-31｜任务：`2026-10-31-shell-deny-customer-escalation`（T3）｜节点：**B1 编排核心**
- 依据（只读）：客户确认方案 v1.3（857 行 / sha256 `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`）；团队计划（575 行 / `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203`）；V1 标准（1320 行 / `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b`）。
- 基线：worktree `flow-improvements-wave1` HEAD `9f670fb`（已合并 main `32d8f0d` / v1.8.3）。未 commit / 未 push / 未启动应用。
- 状态：**implemented-unverified**（E2 返工 R3 要求补登；实现与自测完成，待独立验收；未 commit/push、未启动应用）。
- 冻结契约（只读消费）：A1 `src/model/runtime.ts` + `src/provider/runtime/tools.ts|schema.ts`；A2 `matchRoutineShellCommand` 经 `src/service/gate/shell-rules.ts` 公开出口；A3 i18n key。本节点未改这些文件。

## 一、改动文件（写集内）与写前/写后哈希

哈希口径：`git hash-object`（blob 哈希）＋ `sha256sum`（文件字节）。写前记录见证据目录 `before-hashes.txt`（写前文件均由 HEAD 快照获取；`shell-judge.test.ts` 的写前哈希从 HEAD blob 复算——B1 开始时该文件未被修改）。

| 文件 | 写前 blob / sha256 | 写后 blob / sha256 | 说明 |
| --- | --- | --- | --- |
| `src/common/编排/shell-escalation.ts`（**新增**） | —（不存在） | `c86d91c1d483127ac28480a0d9155d88b0ab899b` / `0ba2df5bdec8633a2103a0b1689c8a43c38beef9f33b45ca5f559f81300542b0` | 判拒台账/资格/状态机/授权/时效/申请/审计；**E2 R2 pending 回滚** |
| `src/common/编排/shell-gate.ts` | `d9fbdf2d77c82602c0a570a7f57015f9feb67ac8` / `93b795f80a52e6ef9888cce24ef70046432a2e194071113a4940fd2497c5530e` | `1b184445ae2cb27bd364077a8bc057d5e81c7e58` / `0fad836ee5e21e4177a30a24cd717f0b8c83f104335ea14f9a4e7d7e86a38ce6` | `onReviewed`/`takeGrant`/`onAuditSinkCreated`、授权顺序、分支常量、`customerGrant` 审计、readonly 构造期守卫、**只读档例行白名单过滤（裁定 A 增量）** |
| `src/common/编排/shell-audit.ts` | `6a848a2d93c198bc6ee09327d08871a90a4f84fb` / `599a5f3896b08dddd37cd209113f2accd1df0f9303cc8a8be0e0e111dcc300fd` | `d814c07b1f51e74144325f3f3352ba381c4d07e9` / `a35f7312bfedf626d270d5c29787ee82fa2fd1404663e195154f53680f3b8125` | 可选 `event`/`customerGrant`/`escalation`/`entry`（append-only 加法） |
| `src/common/编排/shell-judge-verdict.ts` | `7d11ec75c32aab8cc7667c7d7d18dae223158612` / `b2e1365e35c8b3668740c026326eef419ff831496ffc220d88cf8f8ea9624b75` | `eea4cb6cb13fed48403f99da07ae5333a6b8b84a` / `d33850987208f23469924b1390cfe53dcd8e9095806e6475a78ad448e03f32c1` | 出路句改写；`containsExitLine` 兼容旧/新表述 |
| `src/common/编排/routine-shell-policy.ts` | `dbd02bc27c6d8c7ff70d41c586a728cab106dde0` / `46f8727ea1aa2d38cb26585020425c2719180b63aed7c6a24a6bd673b0c10b79` | `8165a975d5e0c89e038a8a93bb43a09c74fd320d` / `483f5e5a10fe9443420a33bb4aeb2cb32dd6fc447d55a40858a674e9878d57a7` | 经 Service 出口复用谓词；仅接受原三 id |
| `src/pipeline/orchestration/shell-arming.ts` | `87c3922ba4ebf06838eb517f71f371bfbabb3bf9` / `81ecc54040a877667d234e48305954fa3c18ab39e3ea258bbbb0224ae1bd85ca` | `c38930436869afc71411671bb4721d526945cf6b` / `cfc5fbb49913fb40ef414306f6315f1e4afe944678f38eab3400af32328a8e9a` | `ShellEscalationWiring` 透传（project/operator；readonly 不接） |
| `src/pipeline/orchestration/run-role.ts` | `76a4a6553de3ab59a0594e4f41ee66688fb0ee0b` / `d30bf26f8a425c7db200b3a23a4732c8ce4723df0b0958af11da00cd12713b0e` | `8cb9d580c39a1ed38c787e2a8c7b02a30fe77358` / `66082ec4b2817f0b241fba1bc9b5d60a86c647fe909ed6dcb08f51f40cc90a83` | 每会话 registry、能力注入、dispose 清理、回滚开关 |
| `src/pipeline/orchestration/govern-session.ts` | `871835ec66de6db7f2900402f6883167135b507a` / `e909a04f9f59f5c691dc94e7fd8d6c7ae9aeeba4d7a7dde170eace2315d72ebd` | `48b06e61218806efebc3507eba99e89a77cec589` / `ee5f2d791a5f178cb1b4b4f9f8d446fc6321dd8a8ac786a9dd972f2237487eb4` | 薄再导出（registry 工厂/类型） |
| `test/编排/shell-escalation.test.ts`（**新增**） | —（不存在） | `fbc7514552b72d9de68d8695198437f8c5b60af2` / `d01aac9e7d42913581e1f2c8da2452ad8427f716251982d48355c79ef0646a28` | 59 项：资格矩阵/清理/状态机/限流/键/stale/审计/开关/接线/pending 回滚 |
| `test/编排/shell-gate.test.ts` | `be444b9b0a97d4fd126deead2aab87d3b9a0c594` / `d0b33c7e2c426317e875907dfd0a9daf74342cc4833c52d7302e73d65d8f5378` | `5541426ac2b0391b16dbef520d8172f6adc8e312` / `943a5c4f83d1c78fff56149d3a5d575b1776b5c69954e9185992329b872b7546` | 五路径授权顺序 + onReviewed 形状 + readonly 守卫 + **只读档例行白名单拒绝矩阵（裁定 A）** |
| `test/编排/shell-arming.test.ts` | `1285901e9fd422787ece1367cadc41fe2257ad1b` / `3b3f67ce5fe7dc6bf4080128dbfebe8e4fedf3f2513aac255b308cdc84345800` | `3b2f37902018f88330fd8c0a572fe6863757a0d5` / `e03c6302d74d076bb88b0e97bd97cbeff81a6509f3aa0d13f9bb4a470ed231d7` | 装配层透传（共享 sink） |
| `test/编排/shell-authorized-routine.test.ts` | `e6fdd1a8b62a3d62d096be4016be79a4542ed87b` / `562b8bd390607678b4e5b4e034f6d8f1a72255f6bd7f9639c9cadf9ae057348e` | `74befe8cce9f39b20949555a0475c249a8a55760` / `73ff85be4bf03e190b0f2fa514cbab06c941714ef5375ffd84b31ce1aadfb44e` | A2 §5.4 断言同步（见 §五） |
| `test/编排/shell-judge.test.ts` | `8c60a7b542585fdf956aa4e923d5e68183da7a1a` / `1ced1bae989d48e47b7de1a2a86984b949491873728367a5ccf469cf59a79c64`（HEAD blob 复算） | `8b53c79bd02cb25d7b8b8749497186faeaed6ba2` / `f9ebddf89cb1654eda63872fa21447f713f658633a062a7cca169fc570414517` | 出路句精确断言更新 + 旧/新表述兼容 |
| `test/编排/shell-operator-only.test.ts` | `41ce77f293f99a414a7db9a59a014870ce2b5a9a` / `b10a68d4df97337599c35d04885ee259ba6124223a9501002c437dc0c6420132` | 同左（**未改**） | 按影响评估：无行为变化 |
| `test/编排/shell-advisory-ruleset.test.ts` | `d445b51e4293687bfc8be2ba75d1244741229716` / `d55733e0c9e91377179edfb1486c66e8144c65d7ac8b1b06ccb4d00141d106b4` | 同左（**未改**） | 按影响评估：无行为变化 |
| `test/编排/shell-review-chain.test.ts` | `805635134daa5dc9bbe06ba24f85fffe7a8339b8` / `19650cff57ae6e64e5770a6c4e9c74c8aaa50b6a8b244e3cdc058297c4170737` | 同左（**未改**） | 同上 |
| `test/编排/shell-risky-order.test.ts` | `5a12ae4ada7061780f06f29392c97eaa703c0f4b` / `d611b9060a734141b8c52ef575b564a6f7afc761f004a32e7a6ae087f90318dc` | 同左（**未改**） | 同上 |
| `test/编排/shell-command-guard.test.ts` | `8070056a9c53f7052ede577a5075058ec7eacec1` / `7eb2f8dbd35e919126096ed4bb66d836d8a1f67eff9943edf57abbdeb2b2cc22` | 同左（**未改**） | 同上 |
| `test/编排/shell-post-audit.test.ts` | `e57ed269949eae9c62be1fc2add1c98d7095148d` / `d1c5ffbecc986b85f9e9d9262c6661e6a8f49660d80818de34c175bb994810e6` | 同左（**未改**） | 同上 |
| `test/编排/shell-readonly.test.ts` | `243f2d4f06ebea842e434602a677dfebc9c52d28` / `5f0ec2016b8f7d8ee8e41b248e6d22faa6aa2c07c0e4ab8515379b0799cb2906` | 同左（**未改**；裁定 A 下 2 项断言原样通过） | 只读档既有断言，见 §六 |

写集外改动：**无**。工作树中其余已修改/未跟踪文件（`src/model/runtime.ts`、`src/provider/runtime/**`、`src/common/门禁引擎/**`、`src/service/gate/shell-rules.ts`、`test/门禁引擎/**`、`src/common/shared/i18n/**`、`test/项目管理/**`、`test/runtime-core/**`、角色卡/边界等）均为 A1/A2/A3/B0/H1 在 B1 开始前已存在的改动，本节点只读消费、未触碰。

## 二、实现要点（方案 §4/§6.3/§7/§9）

### 2.1 `src/common/编排/shell-escalation.ts`（新增）

- **判拒台账**：键 `(roleId, projectRoot, cwd, entry, 规范化 argv)`（`normalizeArgv` 与闸/审计同源）；只记录 `entry="run_shell"`；`start_background_task` 的 review **只忽略**——不写入、不清除、不消费 `run_shell` 记录。记录保存判拒逐字原文、argv、cwd、branch、`ShellJudgeAudit`（tier/reasonCode/manualAsDeny）与判拒时的有界 `approvalContext`，带 `at`/`seq`。
- **资格（只读已记录结果，不重做风险判定、不调 judge）**：judge 主动 `deny`（非 `manualAsDeny`）或 `manual/retry-capped`（`manualAsDeny===true && reasonCode==="retry-capped"`）可申请；`branch` 以 `c-deny` 开头（含审批档 `tier==="deny"` 与 advisory 非 script 的 `c-deny→a-*`）、`preblock:*`、`write-guard:deny`、`script:context-unavailable`、`approvalContext.failClosed`、`readonly-deny`/`script:readonly-deny`、无 judge 的拒绝（客户手拒 / b-deny）、其它 manual、row-failed、`review-timeout`/`ruleset-load-failed`/`no-classifier`/`classify-error` 全部不可申请。
- **旧记录清理**：同一 key 的后续审核若不再是可申请判拒（judge allow、客户手拒、其它 manual、硬拒等），立即删除该 key 的 `recorded` 记录；在途/已授权/终态记录不被后续审核覆盖（终态与授权不会被误清）。客户升级授权放行是消费事件，不清除记录。
- **状态机**：`recorded → requested → granted-once/granted-session/denied/expired`；`granted-once` 由下一次精确匹配消费转 `consumed`；`granted-session` 到 `dispose`；`denied/expired/consumed` 本会话不可再申请。
- **授权**：`allow-once` 原子 check-and-consume（下一次完全匹配的 `run_shell` 消费）；`allow-session` 同会话同 cwd/argv 反复放行；不跨角色/项目/cwd/entry；`dispose` 清空。脚本类授权（判拒记录带 `approvalContext`）消费时以**重载后的上下文**比对 sha256（摘要覆盖 scriptPaths/scripts.path/label/sha256/bytes/npmScriptName/failClosed/note）；不一致/不可读 ⇒ `"stale"`，授权作废、记录转终态。
- **限流**：同命令每会话一次（申请权在呈现开始时消耗，无论结果）；会话总上限默认 5（`maxRequestsPerSession` 可注入）；同会话同时最多 1 张待答；待答/超限/不可申请一律直接拒绝、不弹卡。`necessity` ≤500 字符且 ≤1KB，超限拒绝不截断。
- **申请接口**：`request({command, argv, necessity?}, signal)`；cwd 固定会话项目根；卡片请求字段全部取自判拒记录；presenter 超时按既有确认超时链（`ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS` → `ANS_PI_SHELL_REVIEW_TIMEOUT_MS` → 120s）兜底；超时/通道不可用/非法回包/轮次中止 ⇒ `expired`（默认拒绝）；presenter 返回 `pending`（已有待答 shell 卡）⇒ **回滚呈现前消耗、保持 recorded、不写审计、可稍后再申请**（E2 R2，见 §七）；回执按 §4.3。
- **审计**：`bindAudit(sink)`（经闸 `onAuditSinkCreated` 共享同一 sink）；申请决定写 `event:"escalation-decision"`，必填 `timestamp`/`toolCallId:""`/`command`/`argv`/`cwd`（判拒原文）/`conclusion`（allow/deny/timeout）/`execution:"未执行"`/`conditions:["shell-gate"]`/`escalation:{requestId,action,roleId}`/稳定 `branch`/`by`。审计失败不翻转决定（如实 stderr，一次）。
- **回滚开关**：`shellEscalationDisabled(env)`（`ANS_SHELL_ESCALATION_DISABLED === "1"`）；由 `run-role` 在创建 registry 前读取。

### 2.2 `src/common/编排/shell-gate.ts`

- 新增 `CreateShellGateOptions`/`ShellGateBuildDeps`：`onReviewed`（最终判定后、与审计同址；script 分支以带 `approvalContext` 的有效请求回调）、`takeGrant`、`onAuditSinkCreated`（构造期以实际 sink 回调一次）；全部缺省 = 旧行为逐字不变。
- **授权消费精确顺序**：preblock → write-guard deny → classify → 仅 `detail.decision` 为 `review`/`risky`（非 deny、非 allow）：非 script 直查授权；script 分支内 c=deny 检查 → `approvalContextLoader` 重载（加载失败/不可读时若有授权按 `stale` 作废）→ 查授权 → 既有委托/审批链。**任何 c=deny 不消费/不放行；c=allow 不消费**。
- `readonlyOnly === true` 且注入 `takeGrant` ⇒ **构造期抛错**；调用点亦跳过（双保险）。只读装配（`assembleReadonlyShellGate`）不提供本组注入。
- **只读档 × 例行白名单（客户裁定 A，§六）**：`detail.decision === "allow"` 且命中 `allow:routine:*` 时在只读档改返回 `readonly-deny`（既有 reason 模板、档位按 A2 之前）；分类器不带 ruleId 时以同一冻结谓词兜底。普通模式 c-allow 不变。
- 授权放行：`ShellReviewResult` 带 `grant`；审计 `branch` = `customer-escalation:allow-once|allow-session`、`by` = `customer:<operatorId>（grant:<requestId>）`、写 `customerGrant`、**不写** `judge`。新增 `customer-escalation:stale-context` 拒绝分支。评审记录新增可选 `entry`（`req.entry ?? "run_shell"`）。

### 2.3 其余

- `shell-audit.ts`：`ShellAuditRecord` 加可选 `event`/`customerGrant`/`escalation`/`entry`（append-only、向后兼容）；`ShellAuditEscalation.action` 为三选一 + `expired|unavailable`（超时无客户动作，如实记录，不伪装成 deny）。
- `shell-judge-verdict.ts`：`SHELL_JUDGE_EXIT_LINE` =「如确属推进必需，可调用 request_shell_escalation 对这条精确命令申请客户确认（每会话一次）；或关闭「替我审批」后重试。」——保留「关闭」「替我审批」「重试」三词；`containsExitLine` 判据逐字不变（旧/新表述都识别）；`synthesizeCustomerMessage`/`withSynthesizedExitLine` 语义保持。
- `routine-shell-policy.ts`：形态判断改为经 `src/service/gate/shell-rules.ts` 调用 `matchRoutineShellCommand`（复制 readonly 数组），只接受 `npm-test`/`npm-run-typecheck`/`node-test`；保留 projectRoot/cwd 相等校验与 `node --test` 的 realpath/越界/后缀校验；不继承 `npm ci`/`tsc --noEmit`/`npm run test|lint|check`。
- `shell-arming.ts`：`ShellEscalationWiring` 透传到 `buildShellGate`（project/operator）；readonly 选项面不含该组字段。
- `run-role.ts`：`openRoleSession` 每会话构造 registry（roleId/projectRoot 闭包绑定）；`onReviewed`/`takeGrant`/`onAuditSinkCreated` 交给 project/operator 装配；`request` 经 `AdapterCapabilities.shellEscalation` 交给适配器（工具只在 shellGate + 本能力同时注入时注册）；`ANS_SHELL_ESCALATION_DISABLED=1` 或未给 presenter ⇒ 不创建/不注入；`handle.dispose()` 清理台账与授权（fail-closed）。`createRuntimeAdapterFactory` 透传 `shellEscalation`。
- `govern-session.ts`：薄再导出 `createShellEscalationSession`/`shellEscalationDisabled` 与相关类型。

## 三、registry / 注入接口冻结声明（供 C1 消费）

1. **`openRoleSession` 新输入字段**（`src/pipeline/orchestration/run-role.ts`）：
   - `shellEscalationPresenter?: ShellEscalationPresentFn` —— **C1 唯一必接字段**。类型单一来源 `src/model/runtime.ts`：
     `(request: ShellEscalationCardRequest, signal?: AbortSignal) => Promise<ShellEscalationDecision>`。
   - `shellEscalationOptions?: { env?; now?; presentTimeoutMs?; maxRequestsPerSession?; idFactory? }`（测试/装配用；生产可省）。
   - **开关**：`ANS_SHELL_ESCALATION_DISABLED=1`（读取顺序：`shellEscalationOptions.env` → `shellArming.env` → `process.env`）⇒ 不创建 registry、`caps.shellEscalation` 不注入、`takeGrant` 不注入。
2. **`AdapterCapabilities.shellEscalation?: ShellEscalationFn`**（工具能力位；运行时核心 `GovernedToolsOptions.shellEscalation` 同名）。只在 shell 已 arm 且 registry 已创建时注入；未注入 ⇒ `request_shell_escalation` 不注册（A1 工具只在同时注入 shellGate 时注册）。
3. **闸注入点**（`CreateShellGateOptions`/`ShellEscalationWiring`；仅 project/operator 装配，readonly **不接**）：
   - `onReviewed(req, { result, conclusion, branch, judge? })`：最终判定后、与审计同址；只记录/清理，不改变判定；script 分支的 `req` 带 `approvalContext`。
   - `takeGrant(req, context?) => ShellGrant | "stale" | undefined`：精确位置见 §2.2；`"stale"` ⇒ 拒绝且授权作废。
   - `onAuditSinkCreated(sink)`：闸构造后以实际 sink 回调一次（升级决定记录写同一 `docs/audit/shell-gate.jsonl`、同一 `shell-gate` 条件）。
4. **卡片请求（presenter 收到）**：`version:1`、`requestId`、`roleId`、`projectRoot`、`runtime`、`command`（判拒原文）、`argv`、`cwd`、可选 `judgeReason`/`judgeCustomerMessage`/`judgeAlternative`/`necessity`/`approvalContext`、`expiresAt`。命令/argv/judge 事实全部由应用从判拒记录生成；角色只提供 `necessity`（≤1KB，不可信，卡面须独立标注）。**选项必须且只有** `allow-once`/`allow-session`/`deny`；回包 `{action, operatorId?}`；`expired`/`unavailable`（含超时/窗口关闭/轮次中止）必须解析为默认拒绝；**已有待答 shell 卡（审批/升级）时返回 `{action:"pending"}`（E2 R2 / A1 契约第三支）**：registry **回滚呈现前的消耗**（申请权与会话额度归还、记录回 `recorded`、不写 `escalation-decision` 审计），可稍后再申请，**不视为拒绝**。未知动作/非法回包 ⇒ registry 按 `expired` 处理。
5. **审计事件形状**（`docs/audit/shell-gate.jsonl`）：
   - 客户升级授权放行的 review：有 `customerGrant:{requestId,scope,operatorId?}`、**无** `judge`、`branch` 为 `customer-escalation:allow-once|allow-session`、`by` 以 `customer:` 开头、`entry` 有值。
   - 申请决定：`event:"escalation-decision"` + `timestamp`/`toolCallId:""`/`command`/`argv`/`cwd`（判拒原文）/`conclusion`（allow|deny|timeout）/`execution:"未执行"`/`conditions:["shell-gate"]`/`escalation:{requestId,action,roleId}`/`branch` ∈ `escalation:granted-once|granted-session|denied|expired`/`by` 为 `operator:<id>`（无 id 时 `operator:未知操作者`）或 `operator:unavailable`（超时/不可用）/`entry:"run_shell"`。
6. **计数口径声明（AC-03/§九.11；E2 R2 修正）**：会话总上限只统计**实际开始呈现且未被 `pending` 回滚**的申请（通过资格/每命令一次/待答/上限检查后）。**呈现前**因不可申请、本会话已有待答、超限而被拒的调用**不消耗**会话额度，也不消耗该命令的申请权。**presenter 返回 `pending`（窗口已有待答 shell 卡）时回滚呈现前的消耗**：`requestedKeys` 删除、`requestCount` 减回、记录恢复 `recorded`、清除 `requestId`、不写 `escalation-decision` 审计——同一命令稍后可再次申请并正常呈现。**只有呈现后**超时/通道不可用（`expired`/`unavailable`）才消耗该命令申请权与额度。「同命令每会话一次」在呈现开始时消耗、`pending` 时回滚；允许/拒绝/超时后不再受理。

## 四、验证与证据

环境：Windows 11 Pro 10.0.26300；Node v24.22.1；npm 11.19.1；HEAD `9f670fb`。原始日志目录：
`C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\B1\`（下称 `$EV`）。

| 命令 | 退出码 | 结果 | 日志（行数 / sha256） |
| --- | --- | --- | --- |
| （基线，B1 写前）`node --test "test/编排/**/*.test.ts"` | 1 | 563 tests / 547 pass / **16 fail** / 0 skip | `baseline-tests.log`（1398 / `ae260564fc5b0d7d5d2f13b423ddb6273fa680e010b63e829594c11abbd22244`） |
| （代码完成后、测试更新前）同命令 | 1 | 563 / 546 / 17 / 0 | `after-code-tests.log`（1421 / `bb76ad7a5eab5e52ef2b4efe75f04a6f1b2aa87d6bf0fd0c88ce0d03647bd74a`） |
| **最终（B1 首轮，readonly 裁定 A 前）** `node --test "test/编排/**/*.test.ts"` | 1 | **634 tests / 631 pass / 3 fail / 0 skip / 0 todo** | `final-tests.log`（1242 / `3c6003ea00687d68552ea5104512665920c9ec8450f7f276920c1c6f8efafb52`） |
| **最终（readonly 裁定 A 增量后、E2 R2 前）** `node --test "test/编排/**/*.test.ts"` | 1 | **637 tests / 636 pass / 1 fail / 0 skip / 0 todo** | `final-tests-readonly-fix.log`（1211 / `5a2d8d56d86963ea7e93d27d2f38c8450ca7864a848001e1f4273021e52f16b8`） |
| **最终（E2 R2 增量后）** `node --test "test/编排/**/*.test.ts"` | 1 | **639 tests / 638 pass / 1 fail / 0 skip / 0 todo** | `final-tests-e2-r2.log`（1213 / `b7ee608b8b9e3f052a08d0c4ab6beb0890351c684afb8a4c6c75fc3d65713c13`） |
| 新增套件 `node --test test/编排/shell-escalation.test.ts` | 0 | **59 / 59 pass / 0 fail / 0 skip / 0 todo** | `final-tests-e2-r2.log` 同轮；历史 57/57：`escalation-tests.log`（66 / `fbe1251fe5f8d218673b49b737bb2082e8529d6611e9d1221eb76ec06824e7fa`） |
| **`npm run typecheck`** | **0** | `tsc --noEmit` 无输出 | `typecheck.log`（4 / `2d13ff10c940fd38eb2c89e44a741f3dc7767f14607b7ee80ded981a0d900435`）；readonly 增量后与 E2 R2 后复跑同结果（`typecheck-readonly-fix.log` / `typecheck-e2-r2.log`，均 4 行同哈希） |
| （对照）`node --test test/runtime-core/shell-escalation-contract.test.ts`（A1） | 0 | 9 / 9 pass | 现场输出（未单独落盘） |
| 环境记录 | — | — | `environment.txt`（4 / `0660f33052796cb09905dedb7d16558b918cdb83a21416de88cc39618e55c399`） |
| 写前哈希清单 | — | 17 行 | `before-hashes.txt`（17 / 复算见文件） |
| 写后哈希清单（B1 首轮） | — | 20 行 | `after-hashes.txt`（20 / 复算见文件） |
| 写后哈希清单（裁定 A 增量） | — | 3 行 | `after-hashes-readonly-fix.txt`（3 / 复算见文件） |

**最终 1 个失败（确定性新增失败 = 0）**：

1. `test/编排/shell-authorized-routine.test.ts:184`「node test外指符号链接路径不获委托」——**既有 Windows EPERM 基线失败**（`fs.symlinkSync` 无符号链接权限；B0/A2 基线同红，非本变更引入）。

原 B1 首轮的 2 项 readonly blocked 失败已按**客户裁定 A** 修复并转为通过（见 §六）。新增 skip/todo = 0；未修改任何断言以保绿（除 §五 逐条列明的方案要求同步外）。

## 五、按 A2/方案 §5.4 的断言同步（逐条理由，不弱化其它断言）

`test/编排/shell-authorized-routine.test.ts`：

1. 4 个「宿主委托+b允许」正例（`npm test`/`npm run typecheck`/`node --test`/`node --test <受限路径>`）：A2 把它们提升为 (c) 确定性白名单 ⇒ 分支由 `b-allow`/委托变为 **`c-allow`**；断言改为 c-allow + operator/pm 均零调用（**更强**：证明连 judge 都不调），并保留 `matchesDelegatedRoutineCheck===true` 的委托子集事实。审计 `by` 断言放宽为 `^ruleset:`（本测试注入的是四态封装的裸串出口，不带 `allow:routine:<id>` ruleId；id 由 A2 自身测试覆盖）。
2. 通配 `test/**/*.test.ts`：保持负例（不命中谓词/不获委托），断言不是 c-allow、未借政策免 a、仍走 `b-allow`。
3. 新增「委托只认原三 id」：`npm ci`/`tsc --noEmit`/`npm run test|lint|check` 谓词命中但委托拒绝；`npm install` 谓词不命中。
4. 「没有宿主委托或 cwd 不一致」：`npm test` 现由 (c) 白名单放行（与政策无关，P7「所有角色」）；委托的 cwd 等值校验保留为单测断言（`matchesDelegatedRoutineCheck(...) === false`）。
5. 「常规检查的 b=deny/invalid/unsure/error/timeout 不会被宿主政策擅自允许」：改用 **stub 分类器 `risky`** 驱动委托路径（真实分类器下三 id 已是 c-allow、到不了 b）——保留原断言：b=deny/invalid → 0 次 operator；b=unsure/error/timeout → 1 次 operator 且非委托分支。
6. 「c硬拒组合…」的只读子断言：改用**非白名单**命令 `node --test ../outside.test.ts`（政策不匹配、classify 为 risky）仍 `readonly-deny`——验证委托政策不能改变只读档「只映射 (c)」的判定（routine 白名单在只读档的归属已由客户裁定 A 统一为拒绝，见 §六）。
7. `openRoleSession` 用例：项目角色 `npm test` 现为 c-allow（allow / opCalls 0 保持）；su 只读段改用非白名单命令断言仍拒。「su 仍只读」的语义不变。
8. 诊断用例：改用 stub 分类器 risky 触发 `script/‥` 委托路径以验证 `shell.routine.delegated` 诊断（真实分类器下 c-allow 不产生委托诊断）；仍断言日志不含 command/argv。
9. 外指符号链接用例：**未改动**（EPERM 为基线环境失败；`node --test` 的 realpath/越界/后缀校验保留）。

`test/编排/shell-judge.test.ts`：出路句精确断言更新为新表述（方案 §4.6）；新增旧表述（含三词）不被重复追加、新表述不重复追加的兼容断言。

## 六、readonly 档 × 例行白名单：客户裁定 A 增量（已解决）

### 6.1 裁定与生效依据

- **客户裁定 A（2026-10-31）**：只读档**不适用**例行命令白名单——`node --test` 等在只读档仍按 `readonly-deny` 拒绝；既有断言原样保留；实现需在只读档对例行白名单命中加过滤，不改动只读档其余语义（不注入 `takeGrant`）。
- 澄清记录：`docs/planning/2026-10-31_clarification_shell-escalation-readonly.md`（124 行 / SHA-256 `6c568ee626b8e4fa6487562364e23927c2812f64ae8c8753cc7ad9bfb2588dd4`），属方案 v1.3 澄清、不重开闸门 1；客户沟通记录 §「方案空白裁定：只读档与例行白名单」。
- 澄清的 [实现约束] S1–S8：只读档永不因例行白名单命中 allow；视为白名单不存在、**按 A2 之前的分类档位**复用既有 reason 模板（`node --test`/`tsc --noEmit` → `review`；`npm test`/`npm run 例行脚本`/`npm ci` → `risky`）；过滤位置自由但须单一实现（编排经 Service 公开出口导入谓词合法）；不注入/不调用 `takeGrant`；只读其余语义与普通模式行为逐字不变；`shell-readonly.test.ts` 2 项断言不得放宽；建议补只读矩阵。

### 6.2 改动位置与实现口径

- 位置：`src/common/编排/shell-gate.ts` 的 `if (detail.decision === "allow")` 分支内、返回 `BRANCH_C_ALLOW` 之前。
- 条件：`opts.readonlyOnly === true` 且命中例行白名单——(1) 分类器明细 `ruleId` 以 `allow:routine:` 开头（`classifyShellDetailed` 注入路径）；(2) 分类器只回裸串、无 `ruleId` 时（**生产桌面经 Service 出口注入的四态封装 `classifyShell` 不带 ruleId**），以**同一个**冻结谓词 `matchRoutineShellCommand`（`src/service/gate/shell-rules.ts` 公开出口、同一函数引用）按 argv 形状判定。**未复制第二份判定**；未修改 A2 的分类器/写守卫。
- 返回：既有 `BRANCH_READONLY_DENY`（`conclusion:"deny"`、`by: byTagged` 即 `…（su 只读档）`），**既有 reason 模板逐字保留**、档位按 A2 之前（review/risky）；不新增分支常量。
- 只读档仍不注入/不调用 `takeGrant`（构造期守卫 + 调用点跳过不变）。
- 普通模式（项目角色三层链/advisory、内置审批档）不受影响：`allow:routine:*` 仍 `c-allow`（0 卡、0 judge）。

### 6.3 增量 before/after 哈希

增量前 = B1 首轮完成态；增量后 = 当前。

| 文件 | 增量前 blob / sha256 | 增量后 blob / sha256 |
| --- | --- | --- |
| `src/common/编排/shell-gate.ts` | `ba1a624f1baede86eff19eec39737c34a505931e` / `dc62ab9e4ec6c3e6ae3bd0d9b601110f3ec3e589dc8da7428a252d26306e97d7` | `1b184445ae2cb27bd364077a8bc057d5e81c7e58` / `0fad836ee5e21e4177a30a24cd717f0b8c83f104335ea14f9a4e7d7e86a38ce6` |
| `test/编排/shell-gate.test.ts` | `813f5b15669a6e11cae1142d2a6937eada0a960f` / `289de93471bfa6d820ccc24c62eed100333f0e4febaa2a3dc8e4c1f1a78268f3` | `5541426ac2b0391b16dbef520d8172f6adc8e312` / `943a5c4f83d1c78fff56149d3a5d575b1776b5c69954e9185992329b872b7546` |
| `test/编排/shell-readonly.test.ts` | `243f2d4f06ebea842e434602a677dfebc9c52d28` / `5f0ec2016b8f7d8ee8e41b248e6d22faa6aa2c07c0e4ab8515379b0799cb2906` | 同左（**未改**；2 项断言原样通过） |

### 6.4 增量测试与结果

- 新增 3 项测试（`test/编排/shell-gate.test.ts`）：① 分类器明细 ruleId 路径的 5 个 routine id（npm-test/npm-run-typecheck/node-test/tsc-noemit/npm-ci）→ `allow:false`、`branch=readonly-deny`、reason **逐字等于既有模板**且档位按 A2 之前；非 routine 的 c-allow（`read:git-status`）仍放行。② 裸串分类器（生产形态）下 8 个 routine 形态（`npm test`、`npm run test|typecheck|lint|check`、`npm ci`、`tsc --noEmit`、`node --test`）→ 拒绝且 reason 档位正确；`ls -la`/`git status`/`node --version` 仍放行；审计分支序列断言。③ 非只读档 `allow:routine:*` 仍 c-allow 且不消费授权。
- **既有 `test/编排/shell-readonly.test.ts` 2 项断言未改、原样通过**（`:350-380` 集成断言与 `:452-470` run-role 断言）。
- 增量后 `node --test "test/编排/**/*.test.ts"`：**637 tests / 636 pass / 1 fail / 0 skip / 0 todo**——唯一失败为既有 Windows symlink EPERM 基线；原 2 项 readonly blocked 失败转为通过。`npm run typecheck` exit 0。
- 证据：`final-tests-readonly-fix.log`（1211 行 / `5a2d8d56d86963ea7e93d27d2f38c8450ca7864a848001e1f4273021e52f16b8`）、`typecheck-readonly-fix.log`（4 / `2d13ff10c940fd38eb2c89e44a741f3dc7767f14607b7ee80ded981a0d900435`）、`after-hashes-readonly-fix.txt`（3 行）。

## 七、E2 R2 增量（`pending` 回滚）

### 7.1 契约引用

- A1（运行时核心，已落盘）：`ShellEscalationDecision` 增第三支 `{ action: "pending"; reason?: string }`（`src/model/runtime.ts`；呈现端在**已有待答 shell 卡（审批/升级）**时返回 pending，非客户决定、非默认拒绝）。本节点只读消费。

### 7.2 改动位置与语义

- `src/common/编排/shell-escalation.ts`：
  - `NormalizedDecision`/`normalizeDecision` 接受 `pending`（保留可选 `reason`）。
  - `request()`：presenter 返回 `pending` 且未 disposed 时**回滚呈现前的消耗**——`requestedKeys.delete(key)`、`requestCount = Math.max(0, requestCount-1)`、`record.state="recorded"`、清除 `record.requestId`（`pending` 槽已清）；**不写 `escalation-decision` 审计**；返回 `receipt(false, "pending", "当前有 pending shell 确认卡，请稍后再申请（本次未弹卡）；未执行任何命令。")`。
  - 呈现前因本会话已有待答被拒的调用与 presenter 返回 pending 共用同一稳定回执文案（`PENDING_RECEIPT_MESSAGE`），两者都不消耗申请权/额度。
  - 同一命令稍后可再次申请并正常呈现；pending **不得**当 expired/unavailable/deny，不消耗每命令申请权或 5 次额度。

### 7.3 增量 before/after 哈希

增量前 = readonly 裁定 A 完成态。

| 文件 | 增量前 blob / sha256 | 增量后 blob / sha256 |
| --- | --- | --- |
| `src/common/编排/shell-escalation.ts` | `fec2859f9df685f66fc480ed210fbcfac7b58075` / `2e459dba3eafb31c0263c0932b17057ab76cb32d9a921842d98f9319e990d8e6` | `c86d91c1d483127ac28480a0d9155d88b0ab899b` / `0ba2df5bdec8633a2103a0b1689c8a43c38beef9f33b45ca5f559f81300542b0` |
| `test/编排/shell-escalation.test.ts` | `36432f9612fd6042db7b2ab909f4b33a0d4b2c7b` / `b9e2703ac42a5c4e44e4ea72e242eb3fec52e2656722967be2a90628d4b8f49d` | `fbc7514552b72d9de68d8695198437f8c5b60af2` / `d01aac9e7d42913581e1f2c8da2452ad8427f716251982d48355c79ef0646a28` |

### 7.4 增量测试与结果

- 新增 2 项测试（`test/编排/shell-escalation.test.ts`）：① presenter 返回 pending → 回执 `state=pending`/`ok=false`、presenter 调用一次、**无 escalation-decision 审计**；随后同一命令第二次申请（模拟审批卡解决）返回 `allow-once` → `granted-once`，presenter 第二次调用，审计恰一条 `escalation:granted-once`，授权可被 `takeGrant` 消费（同时以 `maxRequestsPerSession=1` 证明额度未被 pending 消耗）。② 连续 6 次 pending 后再做一次真实申请（deny）成功——证明多次 pending 不累计消耗 5 次额度与每命令申请权，且全部 pending 无审计。
- 增量后 `node --test "test/编排/**/*.test.ts"`：**639 tests / 638 pass / 1 fail / 0 skip / 0 todo**——唯一失败仍为既有 Windows symlink EPERM（`shell-authorized-routine.test.ts:184`）；新增确定性失败 = 0、新增 skip = 0。`npm run typecheck` exit 0。
- 证据：`final-tests-e2-r2.log`（1213 行 / `b7ee608b8b9e3f052a08d0c4ab6beb0890351c684afb8a4c6c75fc3d65713c13`）、`typecheck-e2-r2.log`（4 / `2d13ff10c940fd38eb2c89e44a741f3dc7767f14607b7ee80ded981a0d900435`）、`after-hashes-e2-r2.txt`（2 行）。

## 八、未解决项 / 偏差披露

1. **readonly 空白**（原 blocked）：已由**客户裁定 A** 解决（§六）：只读档对例行白名单命中一律 `readonly-deny`，既有 2 项断言原样通过；当前无 blocked 项。
2. **`ShellAuditEscalation.action`** 在超时/不可用时记 `"expired"|"unavailable"`（而非伪装成 `"deny"`）——方案 §7.1 只列客户三动作，此处为如实披露的加法值；如验收要求严格三值，可改为以 `branch` 区分并在报告声明。
3. **script 分支的上下文重载提前到委托检查之前**（方案要求的精确顺序：c=deny → 重载 → 授权 → 既有链）。对既有真实装配无行为影响（A2 后例行命令由写守卫 `pass`，不再进入 script 分支；委托在 script 分支仅在旧自定义写守卫装配下可达）；旧装配下若脚本不可读且命中委托，现按 fail-closed 拒绝（更严，不放宽）。
4. **计数口径**（§三.6，E2 R2 修正）：呈现前被拒（不可申请/本会话待答/超限）不消耗额度与每命令申请权；**presenter 返回 pending 时回滚**呈现前消耗（额度/申请权归还、记录回 `recorded`、无审计）；**呈现后**超时/不可用才消耗。
5. `operator:<id>` 缺 id 时审计记 `operator:未知操作者`（沿用 shell-gate 既有 `operatorBy` 口径）；超时/不可用固定 `operator:unavailable`。

## 九、纪律声明

- 未 commit / 未 push；未启动应用；未修改 `src/model/runtime.ts`、`src/provider/runtime/**`、`src/common/门禁引擎/**`、`src/service/**`、`app/**`、`docs/scheduling|acceptance|communication`、角色卡/边界/YAML；未改 A1/A2/A3 冻结文件（裁定 A 增量只经 Service 公开出口**消费**同一 `matchRoutineShellCommand`，未改其实现）。
- 未新增 skip/todo；未以修改断言保绿（§五为方案 §5.4/§4.6 要求的同步，逐条列明；`test/编排/shell-readonly.test.ts` 零改动）。
- 未伪造输出；上述日志路径/行数/sha256 均可在证据目录复核。
