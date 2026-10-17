---
id: shell-judge-and-abort-independent-verification
type: fix
title: 「替我审」判断 agent 与中止隔离修复独立验证（测试角色）
created: "2026-10-17"
updated: "2026-10-17"
timezone: Asia/Shanghai
status: verified
related: [shell-auto-approve-review, turn-watch-and-recover-review]
events:
  - date: "2026-10-17"
    kind: created
    summary: 按 PM 评审 §6–§12 独立验证「替我审」全链与卡死修复；自建 40 例离线端到端（36 例判断链 + 4 例中止隔离/Claude 已关闭查询）；首轮 39 通过 / 1 失败；失败项为真实读取预算耗尽被误报为 read-denied（设计要求 manual/budget，属运行时核心缺陷，未改实现）；全量 2495/2471 pass/21 fail/3 skip；typecheck 0 错
  - date: "2026-10-17"
    kind: reverified
    summary: 运行时核心/编排修复预算误报（budgetDenied 不再计入 deniedReads；damageCode 顺序改为 budget→read-truncated→read-denied，以 budgetExceeded 为准）后复审——原唯一失败用例转绿，本批 40/40 通过；全量 2496/2473 pass/20 fail/3 skip（20 红全为既有）；typecheck 0 错；未发现其他缺陷
---

# 「替我审」判断 agent 与中止隔离修复独立验证（测试角色）

**验证对象**：PM 评审 [2026-10-17_design_shell-auto-approve-review.md](../../../项目管理/docs/design/2026-10-17_design_shell-auto-approve-review.md)（approved，revision 2；客户 D1/D2 已拍板）§6–§12，以及 2026-10-17 卡死修复（abort 清理失败后的隔离解除、Claude `Query closed before response received`）。

**验证范围**：判断 agent 只读工具与读取策略、编排 `createShellJudge` 三态/替代方案/防循环/超时、三引擎判断模式工具面、桌面开关/IPC/通道三态/结果行/手动回落、审计与诊断归因、deny 档放行标记、结果行失败分叉、已挂起卡与开关时点、中止隔离生命周期。

**纪律**：只写 `test/测试/` 与 `角色卡/测试/` 自有文档；未改 `src/`、`app/`、其他角色测试；未读取 `.env`、未使用真实凭据/网络、未启动真实模型、未 git 提交。

## 一、环境

| 项 | 值 |
| --- | --- |
| 平台 | Windows 11 Home China（win32） |
| Node | v24.11.1 |
| 分支 | `main`（工作树含本轮各角色在途改动） |
| 全量命令 | `node --test "test/**/*.test.ts"`（**三层 glob**） |
| 类型检查 | `npm run typecheck` |
| 网络/模型 | 全部离线；判断适配器为桩、Claude/Codex 用假 SDK/假引擎、Pi 用进程内 pi-ai faux provider（keyless） |

## 二、夹具

新增：

- `test/测试/shell-judge-verify/`（`fixture.ts` + 7 个用例文件，**36 例**）
- `test/测试/abort-cleanup-verify.test.ts`（**4 例**）

判断链夹具（全部离线）：

- **临时项目**：`README.md` / `src/app.ts` / `docs/plan.md` + 敏感哨兵 `.env`（只用于证明拒绝时不泄漏）；
- **真实三级链**：`createShellGate`（真实闸，桩分类器 + 内存审计 sink）→ `createDesktopOperatorChannel`（真实通道，桩 presenter/假结果行投达）→ `createShellJudge`（经 `govern-session.ts` 公共出口，真实驱动 + 假 `createAdapter`）→ `buildShellJudgeTools`（真实只读工具）；
- **假 IPC/开关**：真实 `createShellJudgeSwitch` + `isShellJudgeIpcSender`（默认 false、非法请求不改状态、sender 同一性）；
- **假渲染**：按 renderer 同序装载**真 `ui-labels.js`**，用 `shellJudgeToggleView`/`shellJudgeWarningLines`/`shellJudgeResultView`/`shellJudgeNoticeText` 断言复选框/警告/结果行/手动提示文案；
- **读损伤**：假模型在 `report` 前用真实 judge 工具读 `.env` / 连续读 9 次 / 读 70KB 文件，驱动据真实 `stats` 做「allow 必须无损」检查；
- **三引擎**：Service 假 provider 捕获注入选项；Claude 假 SDK 捕获 `Options`；Codex 假引擎 + 内存 MCP 桩；Pi 真实适配器 + pi-ai faux provider；Pi 另有假适配器脚本面。

中止隔离夹具：假 provider（`abort` 抛错、底层轮次由测试控制何时 settle）+ 假 Claude SDK（`interrupt` 注入不同错误）。

## 三、逐项结果

| # | 场景 | 结果 | 证据（本套件用例） |
| --- | --- | --- | --- |
| 1 | 开关默认关：请求走原确认卡；判断 agent 0 次调用；无结果行；审计人工、无 `judge` | **通过** | `a`：默认 false、卡片 1 次、`fake.binds===0`、诊断 0 条、`by → operator:客户`、无 `judge` |
| 2 | 开启后 judge allow：0 卡、1 行、审计 `operator:judge:<引擎>` + `judge` 字段、诊断 allow | **通过** | `a`：`policy=su-approval,tier=risky` 与 `policy=project,tier=null` 两路；`by` 以 `→ operator:judge:claude` 结尾；`judge{engine,verdict,reasonCode:"necessary",tier,reason}`；`shell-judge.started/allow` 各 1 |
| 3 | 当前轮 `turnText` 交给判断驱动 | **通过** | `a`：判断提示含「请运行测试并修复失败用例。」与命令原文 |
| 4 | judge deny + 替代方案：0 卡、deny 文本含原因/替代方案、返回请求角色 | **通过** | `b`：`branch c-risky→a-deny`、`reason` 首句「判断 agent 未放行该命令。」+ 替代方案行；结果行 `reasonCode:"safer-alternative"`；审计同构 |
| 5 | judge deny 无替代方案：0 卡、合成 `customerMessage` + 标准出路、仍 deny | **通过** | `b`：`customerMessageSynthesized:true`、含「关闭「替我审」后重试」、`reasonCode:"no-alternative"`、`alternative` 缺席 |
| 6 | deny 结果行投达失败：仍 deny、0 卡、审计归判断 agent | **通过** | `b`：`emitJudgeResult` 抛错后 `allow===false`、`displays===0`、`by → operator:judge:claude` |
| 7 | 不自动重试/不自动执行替代方案 | **通过** | `b`：一次 gate 调用恰 1 次判断、1 条结果行、0 卡 |
| 8 | manual：不可用 / 超时 / 解析失败 / 读取被拒 / 读取截断 / 防循环 / 引擎不支持 / 模型自报 / 上下文过大 | **通过**（除预算，见 §六） | `c`：各自原卡 1 张 + `judgeNotice`；审计人工无 `judge`；超时会话被 abort+dispose；解析失败不猜结论；读取损伤 allow 降级；防循环第 3 次不调模型 |
| 9 | manual：真实读取**调用预算耗尽** | **通过（修复后复审）** | `c`：第 9 次读取返回独立码 `budget`（不再计入 `deniedReads`）；驱动按 `budgetExceeded` 判 `manual/budget`；卡片「读取预算已用尽」、提示「判断未完成」；修复前实测为 `read-denied`，详见 §六 |
| 10 | allow 结果行投达失败 → `manual/row-failed` 卡片、不自动放行 | **通过** | `c`：结果行 0、原卡 1、`judgeNotice` 逐字「判断 agent 已完成判断，但结果无法在聊天中显示；已转你手动确认。」；人工批准后审计归人工 |
| 11 | 已挂起卡 + 切换开关：卡不受影响；之后新请求才判断 | **通过** | `d`：挂起后开启，判断 0 次；手批审计人工；下一请求 0 卡 + 1 行 |
| 12 | 判断进行中关闭开关：以通道调用时点为准；之后恢复手动 | **通过** | `d`：本次 allow 仍生效；下一请求弹卡、判断 0 次 |
| 13 | 关闭开关后恢复手动 | **通过** | `a`：开启 allow 后关闭，下一请求弹卡、判断不再调用；`reset()` 回 false |
| 14 | deny 档 + judge allow：放行、0 卡、三处标「deny 档 · judge 放行」 | **通过** | `e`：审计 `tier:"deny"`+`hardDenyOverride:true`+`label`；诊断同三字段；结果行标题「已替你放行（判断 agent · deny 档）」+「硬拒类」「请复核」 |
| 15 | deny 档 + judge deny：仍 deny、0 卡、无 `hardDenyOverride` | **通过** | `e`：`branch c-deny→a-deny`、`judge.tier:"deny"`、无标记 |
| 16 | 普通 risky/review 放行不带 deny 档标记 | **通过** | `e`：两档均无 `hardDenyOverride`/`label`，UI `denyOverride:false` |
| 17 | 敏感文件/目录、项目外、符号链接/junction、二进制、超预算读取被拒且不泄露 | **通过** | `f`：8 类敏感路径拒绝且无哨兵/绝对路径；junction 逃逸拒绝；二进制拒绝；第 3 次读取预算拒绝并置 `budgetExceeded`；单文件超限按设计截断并标记 |
| 18 | Prompt injection 文件不直接 allow | **通过（结构性）** | `f`：系统提示含不可信数据禁令；工具集无写/执行/网络入口；注入文本只能作为工具结果出现（结论仍由结构化 report 交回） |
| 19 | 三引擎工具面逐引擎恰三项、无写/shell/网络 | **通过** | `g`：Service 对 claude/pi/codex 均 `judgeMode:true`、`installedMcpServers:[]`、工具恰三项；Claude 原生 `tools:[]` + `allowedTools` 恰三项 + `WebSearch` 禁用；Pi 真实 agent 工具面恰三项、`noTools:"builtin"`、MCP 不装配；Codex `dynamicTools` 恰三项、只读沙箱/`networkAccess:false` |
| 20 | 判断会话写门禁 deny-all | **通过** | `g`：假适配器收到的 gate 对任意路径 `allowed:false`，理由含「判断 agent 只读」 |
| 21 | abort 清理失败 + 底层稍后 settle → 后续 prompt 可再次进入 | **通过** | `abort`：清理失败事件如实出现；隔离期间拒绝；底层 settle 后第三轮进入（provider 恰 2 次进入）；两轮 settled 依次 `aborted/completed` |
| 22 | 底层永不 settle → 仍拒绝（fail-closed） | **通过** | `abort`：50ms 后仍「中止清理中」，provider 仅进入 1 次 |
| 23 | Claude `Query closed before response received` 视为已中止 | **通过** | `abort`：`abort()` 不抛错、prompt 以 AbortError 结束、settled `aborted`；判据逐字（带前缀不匹配） |
| 24 | Claude 其他 interrupt 错误仍如实上抛 | **通过** | `abort`：`abort()` 抛 `interrupt boom`，不被吞掉 |

## 四、三引擎矩阵明细

| 引擎 | 验证方式 | 结果 |
| --- | --- | --- |
| Claude | 假 SDK 捕获真实适配器 `Options`：`tools:[]`、`allowedTools` 恰三只 `mcp__ans__judge_*`、`disallowedTools` 含 WebSearch/Bash/Write/Edit/Read/Glob/Grep/Task、`strictMcpConfig:true`、`settingSources:[]`、`mcpServers` 仅 `ans`、`persistSession:false`；误注入写工具在 SDK 加载前抛错（`loadSdk` 0 次） | 通过 |
| Pi | 真实适配器 + pi-ai faux provider（进程内、无网络）：`getActiveToolNames()` 恰三只、`noTools:"builtin"`、`createMcpExtension` 0 次、`report` 原样回调、`contextSource:"in-memory"`、不创建 `.ans`；另有假适配器脚本面：写/编辑/shell/交互/回交/派发均「未知工具」 | 通过 |
| Codex | 真实适配器 + 假引擎/内存 MCP 桩：`thread/start.dynamicTools` 恰三只 `ans_*`、`sandbox:"read-only"`、`turn/start.sandboxPolicy={type:"readOnly",networkAccess:false}`、`web_search="disabled"`、`ephemeral:true`；写/shell/搜索/派发工具未注册 | 通过 |

三引擎均只消费运行时核心同一份 `buildShellJudgeTools`；未跨引擎替代。

## 五、全量与类型检查（修复后复审）

- 本批新增：`test/测试/shell-judge-verify/` **36 例**＋ `test/测试/abort-cleanup-verify.test.ts` **4 例**；合计 **40 例 / 40 通过 / 0 失败**（预算缺陷修复后原唯一失败用例转绿）。
- 全量 `node --test "test/**/*.test.ts"`：**2496 tests / 2473 pass / 20 fail / 3 skip**。
  - **本批新增红：0**。
  - **既有红：20**（与本批文件无关）：
    - Windows `symlink` EPERM **8**：`test/claude-adapter/session.test.ts` 1、`test/codex-adapter/session.test.ts` 1、`test/pi-adapter/injected-runtime.test.ts` 2、`test/runtime-core/session-store.test.ts` 2、`test/runtime-core/tools.test.ts` 1、`test/编排/shell-authorized-routine.test.ts` 1；
    - 运行时核心 shell 子进程竞态 **1**：`test/runtime-core/tools.test.ts:161`（延迟写入文件仍出现）；
    - 其他角色在途改动的源码/文案钉 **11**：`test/桌面应用/markdown.test.ts` 1（vendor sha256）、`test/桌面应用/renderer.test.ts` 4、`test/桌面应用/runtime-ui.test.ts` 1、`test/测试/g2-verify/*` 3、`test/测试/g4-skill-verify/b-render-double-check.test.ts` 1、`test/测试/g4v2-mcp-verify/k-scope-audit.test.ts` 1。
- `npm run typecheck`：**0 错**（本批新增文件 0 错；当前工作树依赖可解析，先前记录中的依赖缺件错误本轮未出现）。

## 六、发现的实现缺陷与复审（已修复）

**预算耗尽被误报为读取被拒（`manual/budget` → 修复前实测 `manual/read-denied`）**

- **首轮复现**：假模型用真实 `judge_read_file` 连续读取第 9 次（默认预算 8 次），第 9 次被拒绝并置 `stats.budgetExceeded=true`；随后交回 `allow`。驱动在 `damageCode` 中**先判 `deniedReads > 0`**，而 `policy.ts::budgetDenied` 又通过 `denied(...)` 把 `deniedReads` 加 1，于是返回 `reasonCode:"read-denied"`。
- **首轮实测**（直接调用真实 `createShellJudge`）：`{"verdict":"manual","reasonCode":"read-denied",...}`；通道卡片提示「判断 agent 未能完成判断：所需项目文件无法读取。已转你手动确认。」
- **设计期望**：§6.4/§8.3/A20 明确「预算阻止判断 → `manual/budget`」「超 8 次/192KB/64KB：后续读取报错；若模型仍 allow → `manual/budget` 或 `read-truncated`」；§10.4 对 `budget` 的文案是「读取预算已用尽」。
- **修复（运行时核心/编排属主）**：`budgetDenied` 不再计入 `deniedReads`；`damageCode` 顺序改为 `budgetExceeded → budget`、`truncatedReads → read-truncated`、`deniedReads → read-denied`；驱动 manual 理由改为「判断预算耗尽（读取次数/总读取字节达上限）…」。
- **复审结果**：第 9 次读取返回独立码 `budget`；驱动 `manual/budget`；卡片「读取预算已用尽」；本批 40/40 通过。**未发现其他缺陷。**
- **本角色处置**：首轮失败断言保留未放宽/未跳过；修复后原用例自然转绿，本报告与 changelog/memo/feature-map 同步复审结果。

## 七、未覆盖项

1. **真实模型往返**：全部用桩/假 SDK/faux provider；真实 Claude/Pi/Codex 必要性判断质量、延迟、误判率需客户本人凭据在验收环境手跑（设计明确不进入自动测试）。
2. **真实 Electron 目检**：复选框常驻/焦点、警告样式、卡片 `#sc-judge-notice`、结果行落 pane/锚定、渲染重载复位等只在本套件用真 `ui-labels` 纯函数与开关状态机验证；真实窗口外观与交互未由本套件目检。
3. **真实 IPC 跨进程**：`shell:judge-get/set` 的 Electron `event.sender` 路径未跨进程执行；本套件验证了 `isShellJudgeIpcSender` 纯逻辑、开关状态机与 preload 契约形状，未启动 Electron 主进程。
4. **后台角色结果行分 pane**（§12.2-12）：未在本批独立验证（不在本次任务清单）。
5. **应用重启/关窗复位**（§12.2-11）：仅验证 `reset()` 与纯状态机；真实关窗/重启未跑。
6. **真实网络/凭据**：按纪律未读 `.env`、未跑任何真实请求。

## 八、结论

判断链核心行为（开/关、allow/deny/manual、替代方案、deny 档放行标记、结果行失败分叉、已挂起卡、防循环、只读沙箱、三引擎工具面）与卡死修复（隔离解除、fail-closed、Claude 已关闭查询）**40/40 通过**。首轮发现的**读取调用预算耗尽原因码/卡片文案误报**已由运行时核心/编排修复（`budget` 独立码 + `damageCode` 优先级 + 人话），复审原失败用例转绿，**未发现其他缺陷**；全量 20 条红均为既有环境/在途改动问题，与本批无关。

## 九、复跑

```bash
node --test "test/测试/shell-judge-verify/*.test.ts"
node --test "test/测试/abort-cleanup-verify.test.ts"
node --test "test/**/*.test.ts"     # 三层 glob，全量
npm run typecheck
```
