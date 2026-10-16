---
id: core-kanban-shell-exec-proposal
type: fix
title: "kanban-live 真机轮修复提案：F-1 命令级执行时限、F-7 shell 语法 UX 守卫、F-8 非零退出语义"
created: "2026-10-15"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [kanban-runtime-fixes-dispatch]
---

# F-1 / F-7 / F-8 修复提案（已实施待验证）

> **2026-10-16 实施轮更新：** 客户已按推荐批准（见 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §客户批准记录）；本提案 F-1 必需全套 + opt1、F-7 必需 + opt1 + opt2、F-8-a 已按批准范围实施（另含跨提案的 F-3-c / F-5-opt2 两处 schema 文案，见文末「实施摘要」）。状态＝**已实施待验证（未部署）**；独立验证与真机复跑待后续轮次。以下正文保留提案轮原文（历史记录）。
>
> **提案轮原文（未实施 / 未测试）：** 本轮为提案轮：不改任何 src/app/test 代码，不提交 git，不改 `/Users/wangzhongren/code/vibeingcode/ans-testbed/kanban-live` 与测试角色的证据目录。以下「拟改动」全部是待客户批准后才实施的候选；涉及其他角色边界的内容只做只读定位与影响列举，绝不修改。
>
> 来源派发：`角色卡/项目管理/docs/change/2026-10-15_change_kanban-runtime-fixes-dispatch.md`（F-1/F-7/F-8 属主＝运行时核心）。证据目录：`角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/`。

---

## ① 问题与证据（全部来自真机轮真实记录）

### F-1（P0）外壳命令无执行时限：挂起的命令使角色停摆

**读码定位到的执行现状**：`src/provider/runtime/tools.ts:379-438` 的 `runShell()` 是唯一 spawn 点（`spawn(argv[0], argv.slice(1), { cwd, shell: false, windowsHide: true, env })`，`tools.ts:384`），**没有任何执行阶段计时器**；已有的 kill 逻辑只挂在 AbortSignal 上（`tools.ts:408-413`，SIGTERM→250ms→SIGKILL→1000ms 清理上限），即只服务「停止本轮」路径。

**真机实测（kanban-live 会话逐事件记录）**：

| 时间（UTC） | 事件 | 记录位置 |
|---|---|---|
| 13:40:28.723 | 实现者 `run_shell` 发起 `node temp/实现者/selfcheck-413.js` | 实现者 `replay.jsonl` L154 |
| 13:50:11.886 | 该命令返回：`durationMs=583174`，`exit 1`，脚本输出 `curl 退出码 = null`、`结论：FAIL` —— **583 秒无任何自动中止**，靠人工杀掉脚本的 `curl` 子进程才收尾 | 实现者 `replay.jsonl` L155 |
| 13:50:17.851 | 改脚本后重跑同一命令，再次死锁 | 实现者 `replay.jsonl` L158 |
| 13:52:30.169 | 仅能靠界面「停止本轮」终止：`errorCode:"ABORTED"`、`process:{"signal":"SIGTERM"}`、`durationMs=132320`、文案「会话已中止，命令已请求终止」 | 实现者 `replay.jsonl` L159-161 |

- 挂死机理（已归因，非产品缺陷）：脚本用 `spawnSync(curl)` 同步阻塞了**同进程内**测试服务器的事件循环；`raw/hung-selfcheck-413-sample.txt` 采样显示 `node::SyncProcessRunner::Spawn → uv_run → kevent` 全栈卡死；`problem-summary.md` A1 的 netstat 取证（服务端 Recv-Q 1,045,579B / 客户端 Send-Q 3,258B）为双方互等。**但产品侧缺的是命令级时限/自动解除**。
- 连带阻塞：`raw/queue-timeline.json`——su 13:43:19 派给测试者的任务已受理且测试者空闲，直到 13:52:30（实现者轮被停止）才投递（约 9 分钟）；13:46:00 快照 `queueItemsByRole: {测试者: ["复跑复核（等待投递）"]}` 证明卡点就是该挂起命令所在轮次。
- 本轮配置（`problem-summary.md` §四，测试条件透明）：轮次硬超时已放宽 `ANS_PI_PROMPT_TIMEOUT_MS=900000`。**583s < 900s，轮次超时未触发**；「无自动中止」的准确含义是：命令级没有任何时限，唯一兜底是轮次时限，而它既被放宽以容忍长命令、一旦触发又以「整轮中止」为代价（详见 ② 根因）。

### F-7（P2）管道/重定向误导报错

| 时间（UTC） | 命令 | 结果 | 记录位置 |
|---|---|---|---|
| 13:21:41.965 | 实现者：`find . -type f -not -path "./.git/*" -not -path "./node_modules/*" | head -50` | exit 1，`stderr: find: |: unknown primary or operator`（管道被当普通参数传给 find），`durationMs=2604` | 实现者 `replay.jsonl` L7 |
| 13:28:37.374 | 测试者：`find . -type f -not -path "./node_modules/*" -not -path "./.git/*" | sort` | exit 1，同一误导 stderr，`durationMs=2688`；随后（13:28:38）去掉管道重跑即正常 | 测试者 `replay.jsonl` L7-L11 |

**必须保护的负例（防误杀）**：测试者 13:31:36.931 `grep -n "sort=createdAt\|sort=priority\|listTasks(ctx.url))" test/03-http-api.test.js`（被引号包裹的 `\|`）**exit 0 正常执行**（测试者 `replay.jsonl` L57）；实现者 13:27:00.093 `grep -rn "innerHTML" --include=* .` exit 0（L91）。任何新守卫都不得把这些当前可用命令变成误报。su 已把「不支持管道」写进派发文本（`problem-summary.md` C1），但每个新角色都会重新踩一遍——需要执行层显式拒绝 + 明确文案。

### F-8（P2）非零退出显示为「执行失败」

- 实现者 13:27:00.102：`grep -rn "http" src/public` 无匹配，exit 1（实现者 `replay.jsonl` L90）：工具结果 `ok:false, status:"failed", errorCode:"TOOL_FAILED"`，事件 `kind:"denied"`，摘要「run_shell 执行失败：…（run_shell 已执行：…（exit 1）…）」。命令**已正常执行完成**，只是退出码非零（grep 无匹配是合法结果），被标红为「执行失败」属语义噪声（`problem-summary.md` C2）。
- 对照正例：exit 0 同命令（L91）为 `kind:"accepted", status:"completed"`。

---

## ② 根因（读实际代码，file:line 与现状行为）

### F-1 根因：执行阶段没有任何时限计时器，唯一兜底是轮次超时（用错了尺子）

- `runShell()`（`src/provider/runtime/tools.ts:379-438`）在 spawn 之后只监听 `close`/`error`/`AbortSignal`；**没有 deadline 定时器**。`settle()`（L399-407）与 `abort()`（L408-413）是仅有的两条收口路径，后者只由 `signal` 驱动。
- 轮次硬超时的真实行为（`src/service/runtime/session.ts:259`）：`withPausableTimeout(raceAbort(work, turn.controller.signal), promptTimeoutMs, …)`；超时时（L260-265）`turn.outcome="timed_out"`、`turn.controller.abort()`，该 signal 经 handler 包装（`session.ts:114-118`）传到 `runShell` 的 abort 监听 → 命令会被杀。**即：若轮次超时触发，命令是会被终止的**——本轮未触发只因 583s < 放宽后的 900s（第二次 132s 后人工停止）。因此准确缺口是：
  1. **没有命令级时限**：命令的挂起窗口 = 轮次时限（本轮 900s；未来若为长任务继续放宽则同步放大），且中止语义是「整轮 timed_out」而非「命令超时、本轮继续」；
  2. **轮次时限当命令时限的固有矛盾**：默认 120s 会把超过 2 分钟的正常长命令（`npm test`、构建）连轮次一起掐掉；要容纳长命令就得放宽轮次预算（如本轮 900s），放宽后又失去了对挂起的细粒度兜底——两头不讨好；
  3. 缺少「命令超时」这一档**诚实结果**：模型收不到「超时已终止（N ms）」，只能等人工缓解（583s 人工杀 curl / 133s 人工停止本轮），且停摆期间整轮与投递链被阻塞（F-2 的连带面）。

### F-7 根因：命令串→argv 在 `tools.ts:306 splitCommand`，管道成为普通 argv 元素且无前置守卫

- **「命令串→argv」唯一发生处＝`src/provider/runtime/tools.ts:306-328` 的 `splitCommand`**（本角色边界内；`grep -rn` 确认全仓唯一调用点在 `tools.ts:457`，随后 `spawn(argv[0], argv.slice(1), …)`，`ShellGate` 收到的 `argv` 也来自同一处 `tools.ts:469`）。它「按空白切分，单/双引号内不切分（引号移除）」——因此 `find . | sort` 的 `|` 变为独立的普通参数 token 传给 find，find 报 `unknown primary or operator`。**误导来自把既成事实的 argv 直接喂给命令**，而工具描述（`src/provider/runtime/schema.ts:19-31`：已写明「不经 shell、`|`/重定向/变量展开不按 shell 语法执行」）无法阻止不读描述的模型。
- `src/common/门禁引擎/classify-shell.ts:220-222` 的立场是**明确设计**：`executionModel === "argv-noshell"` 时**不扫** shell 元字符（避免假安全感与误杀 `grep 'a|b'` 一类正常参数）。该文件与策略归门禁引擎，本提案**不动**；提案的是**执行层 UX 守卫**（在 spawn 之前、以与 `splitCommand` 完全一致的口径识别「独立操作符 token」）。
- 引号内内容防误伤的事实依据：`splitCommand` 引号内不切分且移除引号——这既是执行的现实，也是守卫必须复用的同一口径（见 ③ 设计）。

### F-8 根因：`ok: code === 0` 一刀切成「调用失败」，下游把 `!ok` 一律当失败渲染

- 工具层（`tools.ts:492-499`）：进程正常跑完、退出码非零时返回 `ok:false`，而 `execution` 已如实携带 `exitCode`（现状正确保留）。
- 适配层（**Pi适配器，只读**）：`src/common/pi-adapter/real-adapter.ts:386` 把一切 `!result.ok`（非 ABORTED）映为 `errorCode:"TOOL_FAILED"`、`isError:true`；native 结果路径同（`real-adapter.ts:531-542`，并有 `summary: "${toolName} 执行${isError?'失败':'完成'}"`）。
- 投影层（本角色 `src/common/runtime-core/tool-display.ts`）：`L121-123` 由 `ok` 定 kind（accepted/denied）、`L138` 定 `status:'failed'`、`L149` 生成摘要「…执行失败…」；`display.error`（L143）填入完整消息，致摘要里再叠一条「run_shell 已执行：…（exit 1）」。
- 桌面呈现（**桌面窗口/桌面UI，只读**）：`app/desktop/session-history.ts:188-191` 把 `ok===false||status==='failed'` 归为 `kind='denied'` 行；`app/renderer/tool-rows.js:106-118` 由 `knownFailure || d.status==="failed" || ok===false` 定 `failed` → 标签「执行失败」、`exceptional`（标红）。注意其 `knownFailure` 另有一条**正则解析消息头** `/^run_shell 已执行：…（exit N)/`（L104-106），说明「消息文本」事实上被 UI 当格式契约使用——本提案不破坏该文本（见 ③）。

---

## ③ 最小拟改动（仅本角色边界；行为变化与 fail-closed / 契约不变性）

### F-1 拟改动

**文件清单（全部在本角色 Section 1 内）**：

1. `src/common/runtime-core/timeout.ts`：新增 `DEFAULT_SHELL_EXEC_TIMEOUT_MS = 600000` 与 `SHELL_EXEC_TIMEOUT_ENV = "ANS_PI_SHELL_EXEC_TIMEOUT_MS"`（命名对齐既有 `ANS_PI_SHELL_REVIEW_TIMEOUT_MS`；注释记录默认值取舍，见 ④）。
2. `src/model/runtime.ts`：
   - `GovernedToolsOptions` 增加可选 `shellExecTimeoutMs?: number`（对齐 `shellReviewTimeoutMs`，`L275` 旁）。因 `RuntimeSessionOptions extends Omit<GovernedToolsOptions,…>`（`session.ts:22`）且 `session.ts:105-113` 以 `...options` 透传，**无需改 session.ts**。
   - `RuntimeToolExecutionFactsV1`（`L377-381`）增加可选 `timedOut?: boolean`、`timeoutMs?: number`（向后兼容的可选字段，沿用既有「ToolResult 兼容增加 execution」先例）。
   - `ToolDisplayV1.process`（`L360-365`）增加可选 `timedOut?: boolean`，供桌面端不解析文本即可区分「超时终止」。
3. `src/provider/runtime/tools.ts`：
   - `runShell()` 增加 `execTimeoutMs` 参数；spawn 成功后挂**一次性 deadline 定时器**；把现有 `abort()`（L408-413）重构成共享的 `terminate()`（幂等：`settled` 或 `terminating` 后直接返回；SIGTERM→250ms→SIGKILL→1000ms 清理上限**预算不变**）；`settle()` 清除 deadline 定时器并把 `timedOut` 带进 outcome。
   - 生效值解析同 review 先例（`tools.ts:921-925`）：`options?.shellExecTimeoutMs ?? readTimeoutMs(process.env, SHELL_EXEC_TIMEOUT_ENV, DEFAULT_SHELL_EXEC_TIMEOUT_MS)`，构建工具时读一次。
   - handler 增加**超时分支**（在 `outcome.error !== undefined` 分支之前，`tools.ts:489` 附近）：返回
     `ok:false`，`message` 含**「超时已终止（N ms）」**字样 + 已收集的部分 stdout/stderr + 一句中性指引；`execution` 携带 `{timedOut:true, timeoutMs:N, signal, stdout, stderr, …Truncated}`（保留过程事实，不吞输出）。
   - 新增 diagnostics：`shell.exec.timeout`（含 `timeoutMs/durationMs`）；可用 `shell.exec.start`（含生效 `timeoutMs`）供观测与测试快速断言解析值（不必真等 600s）。
4. `src/common/runtime-core/tool-display.ts`：摘要分类（`L142-149`）——`execution.timedOut` 时用「超时终止」措辞（不再落入「执行失败」兜底），并把 `execution.timedOut` 抄入 `display.process`（生成 `L146` 与再投影 `L110` 两处）。
5. `src/service/runtime/session.ts`：**不改**（选项自动透传；生效值环境变量即可配置，桌面端不显式传参——`grep` 证实桌面/编排当前均不显式传 timeout 类选项，全部走 env）。

**行为变化（仅此四点）**：① 命令超过时限被自动终止，工具以「超时已终止（N ms）」如实返回；② **轮次不因命令超时中止**（工具结果返回后模型可继续：重试/换脚本/如实报告）——这与「停止本轮」的 ABORTED 语义明确区分；③ 超时值的生效来源链：显式选项 > env > 默认（非法/空缺回退默认，沿用 `readTimeoutMs` 语义，**不支持 0=禁用**，见 ④）；④ 新 diagnostics 两条。

**fail-closed 与既有契约不变性**：
- spawn 前置链不变：未 `allow:true` 绝不 spawn（`tools.ts:462-485` 原样）；超时是 spawn **之后**的收口，不放行任何新命令。
- `ToolResult.ok` 语义不变（超时是失败），`ToolEventDetailV1` 的 status/errorCode 枚举不变，新增字段全部可选（旧消费者忽略即兼容）。
- 「停止本轮」路径行为不变：共享 `terminate()` 后 SIGTERM→SIGKILL→清理上限与现有文案「会话已中止，命令已请求终止」保持一致（不含超时标记）；两路径幂等互斥（先到者生效，后到者因 settled/terminating 直接返回）。
- 若中止与超时同刻竞争：超时定时器在 settle 时被清除；无论谁先收口，结果只发一次、事件只发一次（沿用 `settled` 单点收口）。

### F-7 拟改动（执行层 UX 守卫，不触碰门禁引擎）

**文件清单（本角色）**：

1. `src/provider/runtime/tools.ts`：
   - 把 `splitCommand` 内部重构成**同时返回每个 token 的「未加引号片段」**（执行用 tokens 逐字不变；未加引号片段仅用于判定）。回归锚点：现有全部 run_shell 用例与「引号内 `\|`」类命令行为不变。
   - 新增 `detectUnsupportedShellSyntax(command)`（私有，或并入 `src/common/runtime-core/` 便于单测）：
     - **必需级（F-7 本体）**：某 token 的**未加引号片段**恰为独立操作符之一 `|`、`||`、`&&`、`&`、`;`、`>`、`>>`、`<`、`<<`、`2>`、`2>>`、`2>&1`、`&>`、`&>>`、`1>`、`1>>`、`>&`；或其未加引号片段以「可选数字 + 重定向符号」开头（紧贴目标形态：`>out.txt`、`>>log`、`2>err.log`、`<in.txt`）——两者都只在**未加引号**时才判中。反斜杠前导的操作符字符（如未加引号 `a\|b`）**视为字面量不判**（与当前 grep BRE 实际可用行为一致）。
   - handler 在 `argv` 非空校验之后、ShellGate 审核**之前**调用守卫（`tools.ts:458` 与 `462` 之间）：命中 → **不调用 gate、不 spawn**，返回 `ok:false` + 必需文案（下方），并记 diagnostics `shell.guard.blocked`（含命中 token 与 excerpt）。
2. 文案（必需，逐字建议；复述派发要求并附命中详情）：
   `run_shell 未执行：本环境命令未经 shell 解释，不支持管道/重定向/变量展开（检测到 "|"）。请拆分为多条命令，或把逻辑写成脚本文件后执行。`
   （「检测到」后填实际命中 token；文案属本角色工具消息，不含任何执行结果声称。）
3. `src/provider/runtime/schema.ts`：**不改**——`run_shell` 描述（`L19-31`）已明示「不经 shell、管道/重定向/变量展开不会执行、多条命令分开调用」；守卫是给不读描述的模型兜底，两者互补。

**行为变化与不变性**：
- 变化：仅对「未加引号的操作符 token」由「喂给命令造成误导性报错」改为「明确拒绝 + 指引」；引号包裹内容、URL 形态参数、`--include=*`、正常 argv 命令（含单/双引号、反斜杠）逐字不变。
- 守卫在 gate 之前返回 ⇒ **治理判定链不变**（无新增放行；被拒命令本就什么都不会执行；是否需要对「被守卫拦截的尝试」留 shell-gate 审计属编排侧语义，默认仅 diagnostics，列为跨边界备注见 ⑥）。
- 门禁立场文件（`classify-shell.ts`）与任何 `src/common/shared/` 文件**不动**。

### F-8 拟改动（保持 ok/errorCode 不变，只让「退出码非零」不再长得像「工具调用失败」）

**文件清单（本角色）**：

1. `src/common/runtime-core/tool-display.ts`：摘要分类（`L142-149`）增加一支——当结果来源于进程且 `execution.exitCode !== undefined && execution.error === undefined && execution.signal === undefined && !execution.timedOut`（即「进程跑完、退出码非零、无异常」）时，摘要用**「已执行完成（退出码 N）」**替代「执行失败」；`ok:false`、`status:'failed'`、`kind:'denied'`、`errorCode` **全部不变**（投影契约不动，仅措辞与事实呈现）。工具消息文本（`tools.ts:492-499` 的「run_shell 已执行：…（exit N）」）**不改**——桌面 UI 的既有 `knownFailure` 正则依赖它（`tool-rows.js:104-106`）。
2. （必需、但属**别人边界，本提案只列不改、需协调派发**）`app/renderer/tool-rows.js:104-118`：对 run_shell「进程跑完、退出码非零」一类，状态标签由「执行失败」改为「已执行完成（退出码 N）」且 `exceptional` 不置位（红→中性）；判据改用结构化事实（`display.process.exitCode` 存在且无 `error/signal`，`timedOut` 单独一类），不再依赖消息文本正则。同理 `app/desktop/session-history.ts:188-191`、`app/desktop/runtime-history.ts:63-67` 的 `failed→kind:'denied'` 归类需对该类放行/单独分类，否则历史行仍是「已拒绝」样式。
3. （**不推荐**的替代，及理由）
   - 把 `ok` 改为 `true`（「进程跑了就算成功」）：向模型谎报成功，破坏 ok 语义与既有用例（`test/runtime-core/tools.test.ts` 的 exit 7 用例断言 `ok:false`），违反「不得把失败伪装成成功」。**不采用**。
   - 新增 `status` 枚举值（如 `'exited-nonzero'`）：动 `ToolEventDetailV1` 联合类型，全部消费方未同步时桌面端会落入「状态未记录」兜底（`tool-rows.js:108`），契约面大收益小。**不采用**。
   - 在 `real-adapter.ts` 里把退出码非零重映射为新 errorCode（如 `SHELL_EXITED_NONZERO`）：errorCode 语义（本次工具调用未成功）本就成立，改码只换标签不改语义，还扩散新契约值到全部消费方；**不推荐**（若未来确有需要，属 Pi适配器边界，由其评估）。
   - 对 `grep` 等命令做「magic 特判」：不可维护且欺骗性，**不采用**。

---

## ④ 必需项 vs 可选加固项（可选项默认勾选，待客户选择）

### F-1 必需项

- F-1-a 命令级执行时限：spawn 后按生效值计时；到期经共享 `terminate()` 终止命令；结果如实返回「超时已终止（N ms）」+ 部分输出 + `execution.timedOut/timeoutMs`；**轮次继续**。
- F-1-b 共享与幂等：超时与「停止本轮」共用同一终止函数（SIGTERM→250ms→SIGKILL→1000ms 清理上限不变），先到先收口；超时定时器在 settle 清除。
- F-1-c 配置：`ANS_PI_SHELL_EXEC_TIMEOUT_MS` 环境变量可配（桌面端无需改线，env 即可起效）；`GovernedToolsOptions.shellExecTimeoutMs` 供程序化注入；非法值回退默认。
- **默认值取舍（推荐 600000 ms＝10 分钟）**：候选与理由——
  - `120000`（= 既有三类时限）：会误杀中型项目 `npm test`/构建，否决；
  - `300000`：覆盖多数常规套件，仍有偏紧风险；
  - **`600000`（推荐）**：覆盖常见 `npm test`/构建时长上限；无人值守挂起的兜底为 10 分钟（相对「无时限」是量级改善）；再长的合法任务由客户/项目按需调大；
  - `900000`：本轮测试用的轮次放宽值，作为默认偏松；
  - **不可禁用（0/负数/非法一律回退默认，只允许调大）**：P0 的意义就是「永远有一条兜底」；确需超长任务用显式调大表达。
  - 与轮次时限的显式关系（如实写明）：默认轮次 120s 下，超过 120s 的命令仍会先被**轮次**中止（现状行为，本提案不改轮次默认，属超范围）；命令时限在轮次预算被放宽（如本轮 900s）或未来调整后成为操作性约束——本轮 583s 挂起在 600s 默认下将自行以「超时已终止」收口（对照：人工介入发生在 583s，仅早约 17s，但语义从「人工杀进程 + 整轮停摆」变为「自动 + 诚实结果 + 轮次继续」）。**此项与默认值一并提请客户裁定。**
- F-1-d 观测：diagnostics `shell.exec.timeout`（及建议 `shell.exec.start`）。

### F-1-opt1（默认勾选，待客户选择）：进程树终止（POSIX 进程组 / Windows `taskkill /T`）

- 理由/收益：现有 `child.kill()` 只发直接子进程；`npm test` 等会派生孙进程（worker/子脚本），直杀可能留孤儿（占端口/CPU）。本轮挂死样本的孙进程 `curl` 正是靠人工处理。
- 成本：spawn 增加 POSIX `detached: true` + `process.kill(-pid, SIG)`（失败回退 `child.kill`）；Windows 分支用 `taskkill /pid <pid> /T /F`；新增平台分叉的测试与注释。
- 取舍说明：直杀直接子进程已足以收脚本类挂起（本轮第二次运行「停止本轮」的 SIGTERM 即成功收口，replay L159），故本项标为可选；建议默认勾选以获得工程上正确的进程卫生。

### F-7 必需项

- F-7-a 独立操作符 token 守卫（集合见 ③），命中即「不 spawn + 明确文案」。
- F-7-b 口径与执行一致：判定只基于**与 `splitCommand` 同源的 token 及其未加引号片段**——引号内内容永不明中（保 `grep "a\|b"` 、`grep -F '|'` 等）；反斜杠前导操作符按字面量放行。
- F-7-c diagnostics `shell.guard.blocked`。

### F-7-opt1（默认勾选，待客户选择）：内嵌未加引号操作符与复合重定向

- 范围：token 的未加引号片段**内嵌**出现 `|`/`;`/反引号，或结尾 `&`（如 `find . -name x|sort`、`a;b`、`cmd&`）。`&` 的**词中**形态（URL 查询串 `?a=1&b=2`）**不判**（当前直通即模型意图的常见形态）。
- 理由/收益：与 F-7 同类「静默地不等价于 shell 意图」的风险面，无空格写法同样误导。
- 成本/行为变化（须客户知晓）：**未加引号的 `grep a|b` 这类当前可用命令将从「可用」变为「明确阻断」**（文案会给出「加引号或拆分」指引，如 `grep -e a -e b`）；误报面由「引号感知」兜底，但接受度需客户确认。

### F-7-opt2（默认勾选，待客户选择）：变量展开/命令替换检测

- 范围：未加引号片段含 `$(`、`${`、反引号、或 `$NAME` 词法。文案已声明「不支持变量展开」，检测使其不再静默直传（如 `echo $HOME` 直传会打印字面 `$HOME`）。
- 成本：`$` 在合法命令中未加引号出现较少但存在（如未加引号的 `awk {print $1}`），审慎起见同样走「引号/脚本」指引；`*` 通配不在本项范围（误报面过大，明确列为非目标）。

### F-8 必需项

- F-8-a（本角色）投影层措辞分类：进程跑完 + 退出码非零 → 「已执行完成（退出码 N）」；ok/status/kind/errorCode 契约不变。
- F-8-b（**跨角色，必需才会消红**）桌面行分类同步：`tool-rows.js` 标签与 `exceptional`、`session-history.ts`/`runtime-history.ts` 的行归类改用结构化事实（`display.process.exitCode` / `timedOut`）。本角色不改这两个文件。
- F-8-c `real-adapter.ts` errorCode 保持现状（`!ok → TOOL_FAILED`，ABORTED 除外）——语义仍成立，无需改动（只读评估结论）。

---

## ⑤ 测试计划（`test/runtime-core/`，本角色边界）

实施轮执行：`node --test 'test/runtime-core/**/*.test.ts'` + `npx tsc --noEmit`（已知全量基线 2 红——检出目录名 ans-cli 断言、macOS `/var` 符号链接——不在本目录，非回归）。夹具沿用 `tools(allow, { shellGate, shellCwd, shellExecTimeoutMs, diagnostics })` 与 `fixtures.ts` 的 `temp/until`。

**F-1（新增 `shell-exec-timeout.test.ts`，全部用短时限，不真等分钟级）**：
1. 挂起命令 + `shellExecTimeoutMs: 300`：约 300ms 内返回；`ok:false`；`message` 匹配 `/超时已终止（300 ms）/`；`execution.timedOut===true`、`timeoutMs===300`；总耗时上界断言（< 5s）。
2. 部分输出保留：子进程先 `stdout.write("started")` 再挂起 → 结果 `execution.stdout` 含 `started`（不吞证据）。
3. SIGTERM 免疫子进程（`process.on("SIGTERM",()=>{})` + 定时写 late 文件，仿既有 abort 用例）：SIGKILL 升级生效，`late` 文件不出现，`signal` 如实。
4. 正常快命令 + 大时限 → `ok:true`、无 `timedOut`（不误杀）。
5. 解析链：env `ANS_PI_SHELL_EXEC_TIMEOUT_MS=250`（临时设置/还原）→ diagnostics `shell.exec.start.timeoutMs===250` 且超时按 250ms 收口；env 非法 + 无选项 → `shell.exec.start.timeoutMs===600000`（只断言解析值，不等待）；显式选项优先于 env。
6. 中止优先：挂起命令 + 大时限，100ms 后 `controller.abort()` → 结果为中止文案（「会话已中止，命令已请求终止」），不出现 `timedOut`；反向：超时收口后再 abort → 仅一条结果、无二次事件（幂等）。
7. 既有回归不动：exit 7 结构化用例（`tools.test.ts` L134-142）、abort 杀子进程用例、gate deny/throw/timeout 零副作用用例全部保持通过（消息文本未改）。

**F-7（新增 `shell-guard.test.ts`）**：
1. 阻断集：`find . -type f | sort`（证据原样）、`… | head -50`、`echo hi > out.txt`、`echo hi >out.txt`、`a && b`、`a; b`、`a || b`、`cmd 2>&1`、`cmd &` —— 皆 `ok:false`；`message` 匹配 `/未经 shell 解释/` 与 `/不支持管道\/重定向\/变量展开/` 且含命中 token；**shellGate 未被调用**（spy 断言）；`touch pwned | sort` 后 `pwned` 不存在（零副作用）。
2. 放行集（必须照旧执行）：`find . -type f`；`grep -n "sort=createdAt\|sort=priority" file`（引号内 `\|`，证据命令）；`grep -F '|' file`（完全引号包裹的 `|`）；`grep a\|b`（未加引号反斜杠前导）；`node -e 'process.stdout.write("a|b")'`（引号内）。
3. opt1 启用时：`find . -name x|sort`、`a;b` 阻断；`curl http://127.0.0.1:4173/api?a=1&b=2`（词中 `&`）放行——并按客户选择保留「opt1 关闭则上述内嵌形态放行」的对照开关测试。
4. opt2 启用时：`echo $HOME`、`echo $(pwd)` 阻断；`echo "$HOME"`、`awk '{print $1}' f` 放行。
5. 守卫先于审核：阻断用例的 diagnostics 含 `shell.guard.blocked` 且不含 `shell.review.start`。

**F-8（`tool-display.test.ts` 扩充）**：
1. handler-result 源：`{ok:false, message:"run_shell 已执行：…（exit 1）…", execution:{exitCode:1,…}}` → 投影摘要匹配 `/已执行完成（退出码 1）/`；且 `detail.ok===false`、`detail.status==='failed'`、`kind==='denied'`、`errorCode` 原样（契约不变断言）。
2. native-result 源同形断言。
3. `execution:{timedOut:true, timeoutMs:600000, signal:"SIGTERM"}` → 摘要含「超时终止」、`display.process.timedOut===true`。
4. spawn 失败（`execution.error` 存在）→ 仍为「执行失败」措辞（不得被新分支吞掉）。
5. `display.process.exitCode` 在 persisted 事件再投影路径中保留（重放一致性）。

**执行/编排层（不改其代码）**：本提案实施后建议由编排/测试角色在下一轮真机复验「命令超时后轮次继续、后续投递不被阻塞、工具行文案分类正确」；本角色只提供单元与契约证据，不宣称桌面端整体已验。

---

## ⑥ 跨角色影响（只读定位，绝不修改）

| 角色 | 文件（只读定位） | 影响 |
|---|---|---|
| Pi适配器 | `src/common/pi-adapter/real-adapter.ts:382-389, 531-542` | `!ok→TOOL_FAILED`、native `isError` 与「执行失败」摘要；新 `execution.timedOut/timeoutMs` 经 facts 透传（无需改码）。**不改**；F-8 不建议改 errorCode（见 ③）。 |
| 桌面窗口 | `app/desktop/session-history.ts:188-191`（`failed→kind:'denied'`）、`app/desktop/runtime-history.ts:37,63-67` | F-8/F-1 的「不标红、独立标签」需其配合改行归类；不改则投影文案已修正、行样式仍红（部分改善，非回归）。**不改**。 |
| 桌面UI | `app/renderer/tool-rows.js:104-118`（`knownFailure`/`failed`/「执行失败」/`exceptional`）、`app/renderer/renderer.js:1041`（error preview） | 同上；判据建议改用 `display.process`（`exitCode`/`timedOut`）而非消息正则。**不改**。 |
| 门禁引擎 | `src/common/门禁引擎/classify-shell.ts:220-222` | 其「argv-noshell 不扫元字符」立场是明确设计，与 F-7 守卫不冲突、不重叠；本提案**不触碰**该文件与策略。 |
| 编排 | `src/common/编排/shell-gate.ts:181`（审核超时注释）；审计语义 | F-7 守卫在 gate 之前，被拦截尝试**默认只进本角色 diagnostics、不进 shell-gate 审计**；若客户希望此类尝试也留审计，属编排侧扩展，本提案不要求。**不改**。 |
| 项目管理 | `src/common/shared/*` | 本提案不新增/修改任何共享组件，不触碰 `src/model/boundary.ts`/`role.ts`/`decision.ts`。 |

跨边界根因说明：F-1/F-7 的全部根因与改动落点都在本角色文件内（命令串→argv 在 `tools.ts:306`，唯一 spawn 点在 `tools.ts:384`）；F-8 的工具层事实已齐备，但「消红」需要桌面两角色同步改各自文件（上文已列，未动）。

---

## ⑦ 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| F-1 定时器误杀正常命令 | deadline 只在 spawn 后启动、settle 即清除；`settled`/`terminating` 幂等；新增「快命令 + 大时限不误杀」用例 | 单点 revert（超时分支与计时器）；env 调大即临时缓解 |
| F-1 超时与停止竞争 | 共享 `terminate()` 先到先得；单点 settle；用例 6 覆盖两向竞争 | 同上 |
| F-1-opt1 进程组/`taskkill` 平台差异 | POSIX 分支失败回退 `child.kill`；Windows 分支独立；CI（含 Windows）跑守卫/超时用例 | 关掉 opt1 即回退为直杀（必需项不受影响） |
| F-7 误伤当前可用命令 | 必需级只判「独立 token + 未加引号」；反斜杠字面量放行；引号内永不明中（证据命令入回归）；opt1/opt2 独立开关 | 逐级关闭 opt；必需级误报可按同口径收窄后重发 |
| F-8 文案变化与 UI/投影分叉 | 只改投影措辞、契约与消息文本不动；UI 未同步时最坏为「文案已修正、行标仍红」，非回归 | 单点 revert 措辞分类 |
| 通用 | 全部改动为「不 spawn 即拒绝 / 结果如实标注」，无任何放行面扩大；未部署、无数据迁移；不触碰治理与共享文件 | 按文件级 revert；提案未批准则不实施 |

**需客户裁定事项**（汇总）：(1) F-1 命令时限默认值（推荐 600000ms；候选 300000/900000）与「不可禁用、只可调大」语义；(2) F-1-opt1 进程树终止是否纳入实施（默认勾选）；(3) F-7-opt1 内嵌操作符 / F-7-opt2 变量展开检测是否启用（默认勾选；会改变未加引号的 `grep a|b` 等当前可用命令为明确阻断）；(4) F-8-b 桌面两角色的行分类改动是否本轮一并派发。

---

## 附录 A：本提案引用的证据清单（均为只读引用）

- 派发：`角色卡/项目管理/docs/change/2026-10-15_change_kanban-runtime-fixes-dispatch.md`（F-1/F-7/F-8 行）
- 问题总评：`角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/problem-summary.md`（A1、C1、C2、§三、§四）
- 挂死采样：同目录 `raw/hung-selfcheck-413-sample.txt`（`SyncProcessRunner::Spawn→uv_run→kevent`）
- 队列时间线：同目录 `raw/queue-timeline.json`（13:43:19 受理 / 13:46:00 快照 / 13:52:30 投递）
- 应用日志：同目录 `app-redacted.log`（F-6 审计未落盘重复——供上下文，属编排）
- 真机会话：`/Users/wangzhongren/code/vibeingcode/ans-testbed/kanban-live/.ans/sessions/实现者/pi/ans/replay.jsonl` L7、L88-92、L101-102、L150-161；`测试者/pi/ans/replay.jsonl` L4-11、L49-61
- 现状代码锚点（本仓）：`tools.ts:306/379-438/448-501/921-925`、`timeout.ts:10-34/72-83`、`model/runtime.ts:253/265-282/355-381`、`session.ts:22/105-118/259-270`、`tool-display.ts:110/121-123/138-149`、`real-adapter.ts:382-389/531-542`、`tool-rows.js:104-118`、`session-history.ts:188-191`、`runtime-history.ts:63-67`、`classify-shell.ts:220-222`、`schema.ts:19-31`、`shell-gate.ts:181`

## 附录 B：状态标注

- **未实施 / 未测试 / 未部署。** 本文档为提案；未运行任何被测改动（无改动可测）。基线说明：全量测试 2 条已知红（检出目录名 ans-cli 断言、macOS `/var` 符号链接）为基线非回归；本角色 `test/runtime-core/` 当时证据 77/77 绿，实施轮将重跑并列新指纹。

---

## 实施摘要（2026-10-16 实施轮）

**状态：已实施待验证（未部署）。** 批准依据：客户 2026-10-16 按推荐批准（PM 评审文档 §客户批准记录与 §三）；派发项＝F-1 必需全套（F-1-a/b/c/d）+ F-1-opt1、F-7 必需 + opt1 + opt2、F-8-a；另按批准实施跨提案小项 **F-3-c**（submit_report 提示词引导，Pi适配器提案 §4.1）与 **F-5-opt2**（request_confirmation 误导文案，门禁引擎提案 §四）——两处落点均在本角色文件 `schema.ts`。**F-9-opt2** 评估文档另出（`docs/design/2026-10-16_design_f9-opt2-tool-result-size-window-linkage.md`），无代码改动。

### 改动文件清单（全部在本角色 boundary.yaml Section 1 内）

| 文件 | 实施内容 |
|---|---|
| `src/common/runtime-core/timeout.ts` | 新增 `DEFAULT_SHELL_EXEC_TIMEOUT_MS = 600000` 与 `SHELL_EXEC_TIMEOUT_ENV = "ANS_PI_SHELL_EXEC_TIMEOUT_MS"`（注释记录默认值取舍；非法/0/负回退默认＝不可禁用） |
| `src/model/runtime.ts` | `GovernedToolsOptions.shellExecTimeoutMs?`（对齐 shellReviewTimeoutMs）；`RuntimeToolExecutionFactsV1` 增可选 `timedOut?/timeoutMs?`；`ToolDisplayV1.process` 增可选 `timedOut?` |
| `src/provider/runtime/tools.ts` | ①`splitCommand` 重构为「argv ＋ 每 token 未加引号片段」同源返回（执行用 argv 逐字不变）；②F-7 守卫：独立操作符 token 集（`\|`、`\|\|`、`&&`、`&`、`;`、`>`、`>>`、`<`、`<<`、`2>`、`2>>`、`2>&1`、`&>`、`&>>`、`1>`、`1>>`、`>&`）＋紧贴/复合重定向前缀（`>out.txt`、`2>err.log`、`&>>log`、`<in.txt` 等）＋opt1（内嵌未转义 `\|`/`;`/反引号、结尾 `&`）＋opt2（`$(`、`${`、反引号、`$NAME`）；引号内永不明中、反斜杠前导按字面量；命中在 ShellGate **之前**返回（不调 gate、不 spawn）＋逐字文案＋diagnostics `shell.guard.blocked`；③`runShell` 增 `execTimeoutMs`：spawn 成功后一次性 deadline 定时器；`abort()` 重构为共享幂等 `terminate(origin)`（SIGTERM→250ms→SIGKILL→1000ms 清理上限预算不变，先到先收口）；settle 清定时器并带 `timedOut/timeoutMs`；④F-1-opt1 进程树终止：POSIX `detached:true`＋`process.kill(-pid)`（失败回退 `child.kill`）、Windows `taskkill /pid <pid> /T /F`（不可用回退）；⑤handler 超时分支（在 error 分支之前）：「超时已终止（N ms）」＋部分 stdout/stderr＋中性指引，`execution` 携带 `{timedOut:true, timeoutMs, signal, stdout, stderr, …Truncated}`；⑥diagnostics `shell.exec.start`（含生效 `timeoutMs`）/ `shell.exec.timeout`（含 `timeoutMs/durationMs`）；⑦构建时解析链＝显式选项 ?? env ?? 默认（readTimeoutMs 语义，与 reviewMs 同址） |
| `src/common/runtime-core/tool-display.ts` | F-8-a 措辞分类：进程跑完＋退出码非零＋无 error/signal/未超时 → 「已执行完成（退出码 N）」（ok/status/kind/errorCode 与工具消息文本全不变）；`execution.timedOut===true` → 「超时终止」；`display.process` 增 `timedOut`（正向投影与再投影两处） |
| `src/provider/runtime/schema.ts` | F-5-opt2：request_confirmation 描述与 guideline[0] 改为「读取与检查无需逐次确认；**写盘一律先经本工具确认**」（保留「preview 必须列出路径」与「confirmed:true 是唯一凭据」两句；「无需逐次确认」子串保留，既有断言兼容）；F-3-c：submit_report 增第三条 promptGuideline（接近输出上限前优先交报告）；**同日配套修订**（客户 su 预置裁定，见下「配套修订」）：补「唯一例外（仅内置治理角色 su）」的预置许可句 |
| `test/runtime-core/shell-exec-timeout.test.ts`（新，7 用例） | 短时限收口（300ms）/部分输出保留/SIGTERM 免疫→SIGKILL 升级且 late 不出现/快命令不误杀/解析链（env=250 生效；非法/0/负回退 600000；显式优先）/中止优先与超时后迟到中止幂等/「停止本轮」既有语义回归 |
| `test/runtime-core/shell-guard.test.ts`（新，5 用例） | 阻断集（含紧贴与复合重定向；gate 零调用、diagnostics 记 `shell.guard.blocked` 且无 `shell.review.start`、零副作用）/放行集（引号内 `\|` 证据命令、`grep -F '|'`、未加引号反斜杠前导、引号内 `\|` 实执行）/opt1（内嵌与结尾 `&` 阻断；URL 词中 `&` 与转义 `&` 放行）/opt2（`$HOME`、`${HOME}`、`$(pwd)`、反引号阻断；引号内与常规 argv 放行）/守卫先于审核不 spawn |
| `test/runtime-core/tool-display.test.ts`（扩充，+5 用例） | handler-result 退出码 1 →「已执行完成（退出码 1）」且 ok/status/kind/errorCode 与消息文本原样；native-result 同形；timedOut → 「超时终止」＋`process.timedOut`；spawn 失败仍「执行失败」；再投影保留 `exitCode/timedOut` |

### 实测结果（2026-10-16，Node v24.14.0 / macOS arm64；本工作树最终状态）

- `node --test 'test/runtime-core/**/*.test.ts'`：**94 用例 / 94 通过 / 0 失败**（提案轮基线 77；本实施新增 17）。
- `npm run typecheck`：**0 错误**。
- 全量 `node --test 'test/**/*.test.ts'`：**0 失败**（最终复跑 1459 用例 / 1458 通过 / 1 跳过；工作树同时含其他角色并行实施中的改动，用例数随其新增；记忆中「检出目录名 ans-cli、macOS /var 符号链接」两条基线红在本检出、本次运行未复现）。
- 既有回归确认：exit 7 结构化用例、abort 杀子进程用例、gate deny/throw/timeout 零副作用用例、run_shell 描述/argv 断言、request_confirmation 文案断言（`无需逐次确认`/`必须列出.*路径`/`confirmed:true`/`不等于`）、submit_report 文案断言全部保持通过。
- 未 git 提交；未部署。

### 与提案的差异与如实标注

1. **超时清理边缘**：cleanup 计时器兜底时（SIGKILL 后 1000ms 仍未确认退出）文案为「超时已触发（N ms），但终止清理未在预算内完成（…）——进程可能仍在运行，请如实向客户说明」，不宣称「已终止」；`execution.timedOut` 仍为 true（如实：终止已触发）。正常超时路径为「超时已终止（N ms）」逐字。
2. **守卫文案**：必需级逐字（`run_shell 未执行：本环境命令未经 shell 解释，不支持管道/重定向/变量展开（检测到 "<token>"）。请拆分为多条命令，或把逻辑写成脚本文件后执行。`）；opt1/opt2 命中在保持上述前缀的同时附「若这些符号是字面量，请加引号或改用等价写法（如 grep -e a -e b）」指引句（对应 PM 勾选说明「文案给「加引号或拆分」指引」）。
3. **紧贴/复合重定向**：实现覆盖 `>x`、`>>x`、`2>x`、`&>x`、`&>>x`、`<x`、`<<x` 等「符号＋紧贴目标」形态；词中 `&`（URL 查询串）不判、反斜杠前导不判——与提案口径一致。
4. **F-1-opt1 Windows 分支未真机执行**：本机为 darwin；`taskkill /T /F` 分支为代码路径存在＋类型检查通过，**未实际跑过**；POSIX 进程组分支有真实用例（SIGTERM 免疫子进程被 SIGKILL 升级收口、late 写入不出现）。
5. **diagnostics 字段**：`shell.exec.start.timeoutMs` 与 `shell.exec.timeout.timeoutMs`、守卫的 `excerpt` 经注入 logger 原样传递并可断言；共享 `src/common/shared/diagnostics.ts` 的 FIELD_NAMES 白名单当前**不含** `timeoutMs`/`excerpt`，生产落盘会丢弃这两个字段（`reasonCode` 已含守卫命中 token；`durationMs` 正常落盘）——共享文件属项目管理，**只回报不改**。
6. **F-8-a 保真边界**：只改投影措辞与结构化字段；`display.error` 回填（消息在摘要括号里再现）**未动**——该同文重复的去重属可选优化、不在批准范围（桌面UI 已确认两种行为都兼容）。F-8-b 需要的结构化事实已如实提供：`display.process.exitCode`（既有）与 `timedOut`（本实施新增，正向与再投影两处）。
7. **`detached: true`（POSIX）的行为说明**：run_shell 子进程成为新进程组组长（这正是进程组终止的实现基础）；ANS 对子进程的终止路径不变（仍只经 AbortSignal/超时显式 kill），未发现对既有用例的可见影响（全量回归已跑）。

### 跨边界备注（只读定位、未改）

- 桌面窗口/桌面UI（F-8-b 消费方）：`display.process` 结构化字段为冻结接口——`exitCode`/`signal`/`stdout`/`stderr` 既有，`timedOut` 本实施新增。
- 门禁引擎 `src/common/门禁引擎/classify-shell.ts:220-222`（argv-noshell 不扫元字符）立场未触碰；F-7 守卫是执行层 UX 兜底（gate 之前），被拦尝试默认只进本角色 diagnostics、不进 shell-gate 审计。
- Pi适配器提案（F-3-c）与门禁引擎提案（F-5-opt2）的**文档状态回填属各自角色**；本实施仅在其指出的本角色文件落文案，未改他角色文档/代码。
- `schema.ts` 中 request_choice / dispatch_task 文案里的同类「无需（逐次/重复）确认」措辞不在 F-5-opt2 范围内，未改（登记观察）。
- `src/common/shared/diagnostics.ts` FIELD_NAMES 建议增列 `timeoutMs`（如需 `shell.exec.start/timeout` 生产落盘观测）——属项目管理共享文件。

### 配套修订（2026-10-16，客户 su 预置许可裁定的文案衔接）

- 客户 2026-10-16 裁定 su 写 `docs/su/**` 与 `docs/contracts/**` 免逐次审批（编排预置机制、门禁引擎 su 卡「确认制要点」文本同日各自落地）后，F-5-opt2 落点的 `src/provider/runtime/schema.ts` request_confirmation 描述与 guideline[0] 同步补「**唯一例外（仅内置治理角色 su）**：两棵目录树写盘许可**已预置**——无需逐次确认、直接写即可（开会话与重建后均生效）；两棵树之外的一切写盘仍须逐条确认」；既有必备语义（写盘一律先经本工具确认、preview 逐条列路径、`confirmed:true` 唯一凭据、未获同意不写盘、列出路径≠获准）逐字保留，非 su 角色语义不变（例外显式限定 su）。
- 同步 `test/runtime-core/tools.test.ts` 新增 1 例文案断言（钉住 su 专属例外 + 必备语义 + 「其余仍须确认」）。实测（2026-10-16）：`node --test 'test/runtime-core/**/*.test.ts'` **95/95**；`npm run typecheck` **0 错**；pi-adapter 既有文案断言用例（`必须列出.*路径`/`未列出的路径`/`不等于`/`confirmed:true`/`无需逐次确认`/`扩张.*边界`，未改属其边界）**5/5** 不回归；全量 `node --test 'test/**/*.test.ts'` **1504 计 / 1503 过 / 0 红 / 1 skipped**。未 git 提交；未触碰真机轮目录（`kanban-live-3`、`/private/tmp/ans-kanban-dev3-ad1bdf3b`）。

### CI 复跑修订（2026-10-16，Windows 信号断言平台分支化——纯测试面，`src/` 一行未动）

- **CI 实证（v1.1.0 发布 CI，Windows runner）**：全量回归 1667 计出现 **3 红**，全部在本角色 `test/runtime-core/shell-exec-timeout.test.ts`（:45 F-1-a「signal 如实（SIGTERM 生效）」、:76 F-1-opt1「SIGTERM 免疫 → 升级 SIGKILL」、:171 F-1-b abort 路径）。根因单一：`signal === 'SIGTERM'/'SIGKILL'` 断言假定 POSIX 语义——Windows 上 `taskkill /T /F` 与 `child.kill()` 均走 TerminateProcess，被终止进程 close 事件的 signal 恒为 null（结果里 `execution.signal` 缺省）。三条失败的落点之前各实质断言均通过——**产品行为无缺陷，是测试的平台断言问题**。
- **修点（最小）**：新增 `assertKillSignal(actual, posixExpected, why)` 平台分支助手——POSIX 逐字断言不变（`'SIGTERM'`/`'SIGKILL'`）；Windows（`process.platform === 'win32'`）只断言「signal 为空（undefined）」，**进程确已终止**由各用例既有的等价证据承担（F-1-a「超时已终止（300 ms）」文案仅 close 事件路径产出——清理超时兜底另有文案 + 短收口耗时；F-1-opt1 late 写入不出现；F-1-b 中止文案）。三处调用点（原 :45/:76/:171）改为调用该助手；用例不 skip、实质断言全平台照跑，只分支「信号名」这一点；助手上方注释说明 Windows 语义。同目录 `tools.test.ts` 的同类 SIGTERM-免疫 abort 用例（:156）无信号名断言（CI 亦绿），无需改。
- **本机复跑（2026-10-16，macOS arm64 / Node v24.14.0）**：`node --test 'test/runtime-core/**/*.test.ts'` **104/104 全绿**；`npm run typecheck` **0 错**；全量 `node --test "test/**/*.test.ts"` **1667 计 / 1666 过 / 0 红 / 1 skip**。
- **分支激活抽查（本机模拟，非真机；只证分支粒度，不替代真机）**：以 `--import` 预置 `process.platform='win32'`（TEMP/TMP 指向本机临时目录）复跑该文件——**恰 3 红，与原 CI 同三例**，失败点均只落信号名断言（失败信息带「Windows 语义：TerminateProcess 无信号名，signal 应为空」注记）；各例信号断言**之前**的实质断言（超时文案/timedOut/timeoutMs/中止文案/两处竞争收口例）在 Windows 终止路径（taskkill 缺失 → `child.kill` 回退）下全部通过；信号断言**之后**的行（F-1-a 的短收口耗时/diagnostics、F-1-opt1 的 late 写入不出现、F-1-b 的 timedOut 保持 undefined）在本模拟中因先失败未到达——修好后将在 CI Windows 上首次照常执行（晚写入时序论证：子进程 ~300ms 被收口，600ms 的迟到写入不可能落盘；abort 路径 timedOut undefined 已由模拟中通过的 F-1-b(a)/竞争例覆盖）。**未发现文件内其他平台假定被压住。**
- **如实标注**：本机为 darwin，Windows 真机 TerminateProcess / close signal=null 的真实行为无法在本机直证；**Windows 侧验证仍以 CI 复跑为准**。未 git 提交；未触碰 `kanban-live-*` 与 `/private/tmp`。

### 慢 runner 时序健壮化（2026-10-16，v1.2.0 发布 CI run 38881759770 macos-15-intel；纯测试面，`src/` 一行未动）

- **CI 实证**：v1.2.0 发布 CI 的 macos-15-intel runner「Regression tests」2 红（mac arm64 / Windows 同 run 全绿；v1.1.0 轮同 runner 曾绿——**runner 速度变异性，非产品缺陷**）。CI 日志逐字：`✖ F-1 env 250ms：到期终止、如实文案、execution.timedOut；轮次信号不受影响、后续命令照常 (760ms)` → `test at test/测试/kanban-fixes-verify/f1-timeout.test.ts:40:1` → `AssertionError: 超时后后续命令须可继续：run_shell 超时已终止（250 ms）…`（**后续快命令也撞了同一条 250ms 时限**——该 runner 上裸 node 启动开销 >250ms）；`✖ F-1 孙进程终止：超时后进程组一并收口（孙进程 pid 消失） (433ms)` → `test at test/测试/kanban-fixes-verify/f1-timeout.test.ts:76:1` → `ENOENT … grandchild.pid`（400ms 时限先于父脚本「启动＋派生＋写盘」收口）。**本角色 `test/runtime-core/shell-exec-timeout.test.ts` 在同 run 7/7 全绿**（300ms 级时限用例侥幸未撞；文件内存在同类紧假设）。
- **修点（本角色文件；不放松语义、不 skip）**：① 微小时限统一 `microMs=2000`（远高于最坏启动开销；挂起场景仍由 `setInterval` 长挂起照触发、到期必终止），原 300ms 各处同步；② 等待/收口上界统一 `boundMs=8000`（= 2000 + SIGTERM→250→SIGKILL→1000 清理预算 + 慢 runner 抖动余量；原 `elapsed < 5000` 系按 300ms 口径的余量）；③ F-1-opt1 重定时：late 写入 600→3200ms（仍晚于时限 2000+250 的收口、早于检查点）、检查前等待 400→2800ms（**检查点晚于写入点，断言非空转**——若进程未被收口 late 必在检查时刻前落盘）；④ 解析链 env 250→2000（`assert` 同步，文案 regex 由常量构造）；⑤ `fixtures.until()` 增可选上界参数（**默认 1500 不变——其余调用方逐字不变**），本文件两处「子进程先写盘」等待显式传 `boundMs=8000`（原 1500 默认对慢 runner 启动同样偏紧）。**Windows 平台分支信号断言（`assertKillSignal`）逐字保留**。
- **为什么非放松（逐条对照）**：「到期必终止」= 挂起命令仍由 timeout 分支收口，文案/`timedOut`/`timeoutMs`/signal 断言逐字不变（仅 N 随值同步）；「如实文案」=「超时已终止（N ms）」/「本轮可继续」断言不变；「timedOut 事实」与「轮次继续」= 中止竞态、幂等、`timedOut===undefined` 断言不变；收口上界 5000→8000 与语义同口径（有限、近时限处收口，非挂起——8000 ≪ 默认 600000）。无 skip、无用例删减、无断言反向、无新用例（计数稳定）。
- **本机复跑（2026-10-16，macOS arm64 / Node v24.14.0）**：`node --test test/runtime-core/shell-exec-timeout.test.ts` **7/7 全绿 ×3（两次干净复跑 + 一次 2×CPU 竞争压测）**；`node --test 'test/runtime-core/**/*.test.ts'` **104/104 全绿**；`npm run typecheck` **0 错**；全量 `node --test "test/**/*.test.ts"` **1679 计 / 1678 过 / 0 红 / 1 skip**（改前基线同计数，**0 新红**）。旁证：`test/测试/kanban-fixes-verify/f1-timeout.test.ts` 本机 4/4 绿——其 CI 红确为 runner 速度特异。
- **如实标注（关键发现，供编排裁定）**：v1.2.0 CI 那两条红经逐字核验**不在本文件**，而在 `test/测试/kanban-fixes-verify/f1-timeout.test.ts`（测试角色独立复验文件，见上 CI 日志行号）。本文件健壮化已按任务完成；**原列入 overlay 的决定因归因更正撤销（2026-10-16，真红＝测试角色 `f1-timeout.test.ts` 镜像用例；且本文件硬化调用 `fixtures.ts` 新增的可选第二参——单列测试文件会「新测试配旧夹具」、第二参被静默忽略、硬化名存实亡）**；装配已按最小差集将本文件移出白名单并更正 `release-policy.mjs` 注释（本角色未动 policy）——**本文件硬化与 `fixtures.ts` 配合改动随 v1.2.0 发布后的 main 常规批次提交，不入本 overlay**。**macos-15-intel 复跑全绿的剩余前提**：(a) 对 `f1-timeout.test.ts` 同口径健壮化——env 250→2000 并同步断言（message/timeoutMs/两处 diag）+ `wall < 5000`→`< 8000`；孙进程例 `shellExecTimeoutMs` 400→2000（父脚本「启动＋派生＋写盘」稳在预算内）＋ pid 消失改**有界轮询 ≤10s**；SIGKILL 升级例 350→2000 ＋ late 4000→3200 ＋ 检查前等待 1200→2800（同样使检查点晚于写入点）——该 spec 已在**临时验证副本**上执行核验（本机高 CPU 竞争负载下 4/4 ×2 通过；副本已删、原文件未动）；(b) 由装配将 `test/测试/kanban-fixes-verify/f1-timeout.test.ts` **显式列入 release overlay files**——**已完成**（装配 2026-10-16 归因更正后按最小差集以精确路径列入、同时移出误列的本文件；不经白名单的 `test/` 文件会静默落 excluded、构建树沿用 tag 旧断言）。(a) 已由属主（测试角色）推进——工作树已见同口径硬化（microMs=2000 / boundMs=8000 / pid 消失有界轮询 ≤10s，与本记录 spec 同口径）；本角色对 (a) 无写入授权（该文件不在 boundary.yaml），spec 副本验证结果（4/4 ×2）供其复核。**慢 runner 消解最终以 CI 复跑为准。** 未 git 提交；未触碰 `kanban-live-*`、`/private/tmp` 与在飞他方改动（app/renderer、装配 policy）。
