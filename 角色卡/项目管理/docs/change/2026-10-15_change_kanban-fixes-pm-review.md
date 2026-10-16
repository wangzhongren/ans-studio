---
id: kanban-fixes-pm-review
type: change
title: kanban-live 修复提案 PM 评审批次（客户已批准；实施轮已派发）
created: "2026-10-15"
updated: "2026-10-16"
status: approved-implementation-dispatched
---

# 客户批准记录（2026-10-16）

**客户裁定：按推荐批准（§三 全部必需项 + 推荐勾选的可选件 + 两个立项评估），G-1 一并细化。** 批准范围＝各提案文档所载拟改动，不含未勾选项（F-2-opt1、F-4-opt3、F-5-opt3、F-6-opt2/opt3 不实施）。据此进入实施轮。

## 实施派发记录（2026-10-16，各角色独立固定上下文）

| 上下文 | 批准的实施项 | 依据提案 |
|---|---|---|
| 运行时核心 | F-1 必需全套 + F-1-opt1；F-7 必需 + opt1 + opt2；F-8-a；F-3-c；F-5-opt2；F-9-opt2（立项评估） | 本角色提案 + Pi适配器/门禁引擎提案对应节 |
| 桌面窗口 | F-2-M1 + opt2 + opt3；F-4-M1 + M2 + opt1 + opt2；F-8-b（session-history/runtime-history）；F-5-opt1（桌面侧） | 本角色提案 + 运行时核心/门禁引擎提案对应节 |
| Pi适配器 | F-3-a + F-3-b（补发默认开启、env 可关；截断事实外推） | 本角色提案 |
| 门禁引擎 | F-5-main | 本角色提案 |
| 编排 | F-6-1 + F-6-2；F-4-X1；F-3-d；F-5-opt1（编排侧） | 本角色提案 + 桌面窗口/Pi适配器提案对应节 |
| 桌面UI | F-8-b（tool-rows 行分类，判据用 display.process） | 运行时核心提案 F-8-b 节 |
| 产品 | G-1 细化成正式提案（契约/工作流落盘 + 派发按地址引用） | 本评审 §六 |
| Claude适配器 | 截断同构评估（对照 F-3） | Pi适配器提案跨边界节 |
| Codex适配器 | 截断同构评估（对照 F-3） | 同上 |

后续（实施回交后）：独立验证上下文复验 + 真机 E2E 复跑（含 F-2/F-3/F-4 断点观测项）。

## PM 收口记录（2026-10-16）

- 九个上下文全部交回（六个实施：运行时核心/桌面窗口/Pi适配器/门禁引擎/编排/桌面UI；一个细化：产品 G-1；两个评估：Claude/Codex 截断同构，均结论「无同构缺陷」）。
- 改动定格：63 文件修改 + 9 新增（+2502/-120 行），typecheck 0 错；**PM 亲自全量复跑：1470 计 / 1469 过 / 0 红 / 1 跳过（Windows 专用）**；记忆中「2 条基线红」在当前 HEAD 确已不复现（多个上下文独立报告一致）。
- 收尾小项（运行时核心/桌面窗口 双报，已派项目管理角色补齐）：`timeoutMs` 已纳入 `src/common/shared/diagnostics.ts` FIELD_NAMES（生产落盘不再丢弃）。
- **PM 裁定（登记）**：F-7-c 的 `excerpt`（命中命令摘要）**不落盘**——2026-10-13 已核验设计契约《运行时诊断与汇报》明令禁止命令原文/argv 落盘，`scrub` 仅尽力脱敏；「命中 token」已由 reasonCode 满足告知需求，excerpt 在 record 层保留供注入 logger/测试。此为对 F-7-c 字面的一处**受更高阶契约约束的偏差**，予以接受。
- 下一步：独立验证上下文（测试角色）交叉复验（含范围审计与对抗性行为核对）→ 真机 E2E 复跑（开发版 + 新空项目，断点观测 F-2 并行投递 / F-3 截断补发 / F-4 确认窗口）。

## 独立验证结论（2026-10-16，测试角色）

**整体通过（0 项不通过）**。报告：`角色卡/测试/docs/change/2026-10-16_change_kanban-fixes-independent-verification.md`；证据 raw/ 12 份；独立用例 7 文件 25 例（test/测试/kanban-fixes-verify/）。
- 冻结绑定：77 条目全量 sha256，复验结束复检逐字节一致；全量 1471/1470/0 红/1 skip（+1＝diagnostics 收尾小项新用例，与 PM 计数差异已精确对账）；typecheck 0 错。
- 范围审计：26 项批准项全落地；6 组未勾选项均未实施；边界抽查全合规；测试无放水（唯一删除断言处（F-4-X1 措辞）改后更严）。
- 对抗 25/25 + 编排 F-6 回归 29/29；F-1 孙进程终止、F-2「A 挂起时 B <1s 送达且同目标并发≤1」、F-8 三级分类链一致性均实证。
- 留白（如实）：① Windows taskkill 分支未真机执行（darwin 本机）；② F-5-opt1 真机链路观测属 E2E 轮——**已于 run-3 现场补上**（重建提示实达模型，见 run-3 观察日志）；③ F-4-V1 渲染可见性与真机断点属 E2E 轮（run-3 进行中）。

## 真机 E2E 复跑（run-3，带修复的开发版）进行中

首次观测即已实证三项修复：**F-2-M1 并行投递（验收者距派发 15ms 开跑，实现者同轮仍在运行——真并行）**、F-5-opt1（重建后写权提示实达 su）、F-8-a（「已执行完成（退出码 1）」）。观察日志：`/private/tmp/ans-kanban-dev3-ad1bdf3b/observations.md`。待观察：F-1/F-3/F-4/F-6 断点与交付闭环。

## 客户新裁定（2026-10-16）：su 写 `docs/su/**` 免审批

**原文**：「这个 su 可以写 docs/su 的目录，不需要我审批」。**追加**（同日）：「还有个契约目录也可以给他写。」——预授权范围 = **`docs/su/**` + `docs/contracts/**`**（后者为 G-1 提案约定的跨角色契约落盘目录；其目录约定随 G-1 本体实施，预授权先行装好）。授权与派发：
- 编排：su 会话初始 writeSet 预置上述两目录（开会话/重建均生效；仅 su、仅该两目录树；其余写盘与其角色行为不变，fail-closed 不放松）——实现 + dated 记录同批。
- 门禁引擎：su 卡「确认制要点」段配套修订（注明两目录预授权例外，其余仍逐路径确认）。
- 性质：对 F-5 确认制设计的一次**客户明示例外**（限定两目录），非机制放宽。

## 新增候选（2026-10-16 客户讨论提出，待细化成提案）

**G-2「角色看护与收束：su 定时/按需看到运行日志，卡死有排查与恢复路径，完成态有终局总结」**——重跑轮复盘后客户提出（同日追加第二支柱）。现状与缺口：
- 已有基础：F-1 命令级时限（挂起命令自动终止、轮次继续——最硬的"卡死"已可自愈）；「停止本轮」人工兜底；状态/诊断在主进程已有权威快照（roleBusy/queueItems/running + ans-diagnostics.jsonl，第一轮破案即靠它）；su 有全项目读权（读不受边界约束）。
- 缺口：su 没有**状态可见性**（无结构化状态工具、无异常通知，只靠人看界面）；没有**排查入口**（不知道去读哪份日志）；没有**恢复动作**（停止本轮/重建/重投只有人能做）。**且"完成态"无任何系统侧判定**——全部角色空闲、队列全空后 su 不会自醒、不会交终局总结（run-3 实测：实质完成后静默 6 分钟无收束，需人问）。
- 建议形态（待细化）：a) **异常态**：轮次逼近超时/投递排队超阈值/命令超时限/重复失败 → 去重后自动投系统消息给 su + su 只读状态工具（role_status / session_tail 类）；b) su 据状态与会话日志定位并留证；c) **完成态收束**：系统侧静默态判定（全角色空闲 + 队列全空 + 无在途投递/待确认，持续 N 分钟、去重、有活动即重新武装）→ 投一条系统提示给 su（"已无进行中任务，请核对是否达到收尾条件并出最终总结"）→ su 出终局总结（交付物/验证结论/遗留项）或继续派活；d) 恢复动作**不静默**：su 只能提议（带证据），经客户一键确认后由应用执行（复用确认卡），执行回执给 su。
- 待办：细化成正式提案（阈值、工具形状、确认流、静默判定与去重的滞回口径、与 F-1/F-2/F-5-opt1 的衔接）；归属预判 编排 + 桌面窗口（+产品设计）。

**G-2 客户批准与派发（2026-10-16）**：客户按推荐批准实施（9 个待裁点全部采纳：静默 5min/tick 30s 仅 env；阈值按 §3.2 默认表；恢复动作集 {abort-turn, rebuild-session, redeliver}；恢复卡不设限；去重口径沿 F-6；工具名 role_status/session_tail/propose_recovery；system 呈现细节交实现层；完成态不排除客户活跃；V1 不做界面级提示），**V1a+V1b 同轮实施**。设计规格＝`角色卡/产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md`。派发：桌面窗口 W1-W5、运行时核心 R1/R2、编排 O1、门禁引擎 G、桌面UI U1。实施后走独立验证 + 真机 E2E（观测「卡住有告警、完成会收束」）。

## G-2 实施收口（2026-10-16）

- **五上下文全部交回**：桌面窗口 W1-W5（新 `app/desktop/watchdog.ts`/`confirm-card.ts`/`recovery-channel.ts`+session 集成，345/345）；运行时核心 R1/R2（三工具+能力位+schema，104/104）；编排 O1（文案单一来源 `common/编排/watchdog.ts`+能力位，299/299）；门禁引擎 G（su 卡看护职责段，183/182）；桌面UI U1（恢复卡渲染+system 行，e2e G2_RECOVERY_UI_PASS 5 + 回归全过）。
- 全量定格 **1603 计/1602 过/0 红/1 跳过**（各上下文终跑；PM 复跑核对中）；typecheck 0 错。批次规模：76 路径、+3669/-199。
- 集成按**落树真实契约**收敛（非草案）：承载契约物理单一来源＝`model/runtime.ts`（编排仅 re-export 同符号）；`[系统·看护]`/`[系统·收束]`/`[系统·恢复]` 三前缀与渲染侧逐字节对齐（中点 U+00B7）；三能力字段名＝契约（改名=工具静默零注册/标记静默回落，验证轮专项核对）。
- 批准裁定逐项落地核实点：恢复卡零计时器（裁定 4）；风暴护栏 15min≤5；「正确等待不报」（挂起确认卡角色排除 #1、su 自身忙不报）；滞回防骚扰（system 投递 settle 与 su 对收束的回复均不重武装）；V1 无界面级告警（裁定 9）。
- 登记（非阻塞）：编排 `api-spec.md:53` 行尾空行（属主待清）；桌面窗口曾误改渲染钉、已**完整撤回**并如实登记；运行时核心与编排间的契约形状中间态（字符串/回执两版）已收敛无残迹，建议今后并行改契约先锁「物理单一来源」。
- G-2 独立验证**已完成：整体通过（0 不通过、7 备注）**——报告 `角色卡/测试/docs/change/2026-10-16_change_g2-independent-verification.md`；独立用例 64/64（四信号边界/风暴护栏/滞回反骚扰/恢复四值回执/两工具纯读/契约冻结四链）；范围审计 11/11（9 项裁定逐条落地、V1 无界面级告警实证）；冻结绑定 68/68 复算一致；全量 1603/1602/0 与 PM 逐位一致（含其用例后 1667/1666/0）。
- 真机 E2E（run-4）已启动：确定性观测「完成静默 5min → 看护自动投收束提示 → su 自主出终局总结」+ 全流程回归 + 自然触发告警如实记录。

## 客户裁定修订（2026-10-16，run-5 观察后）：收束阈值 5min → 30s

**原文**：「没有任务就应该直接收束啊，还等 5 分钟，是不是尬，应该是 su 自动收束」。裁定：完成态收束的静默阈值默认值改为 **30 秒（一个 tick 的最小防抖）**，env `ANS_DESKTOP_WATCHDOG_SILENCE_MS` 可调保留；推理（PM 记录）：全角色空闲+队列全空+无在途+无待确认时，系统已不可能产生新的自动活动——5 分钟纯属延迟，一个 tick 的防抖足以防同一事件簇竞态。冻结接口：`renderClosurePrompt(silentMs)`（文案自适应 N 秒/N 分钟）。派发：桌面窗口（默认值与判定）、编排（文案渲染器与常量）；随下一版运行包发布。修订前的原裁定 1（5min/tick 30s）其余部分仍有效。

## 客户批准（2026-10-16）：v3 界面收敛实施

客户指示「按推荐批准，开始实施」——对 `角色卡/UIUX设计师/docs/design/2026-10-16_design_visual-convergence-v3.md` 的裁定：①间距收紧 W1–W6 按**默认档**（16/10/28 等，对 v2 基线为有意修订）；②W7 正文行高**不动**；③W6b 系统行去重前缀 ✅；④S1 工具相位合并 ✅；⑤S2/S3 对齐与去噪 ✅；⑥W9–W11 运行指示按 **SVG 弧线转轮**方案 ✅；⑦「等待确认卡零动效、不打字光标」确认为长期约束 ✅。实施派发：桌面UI（app/renderer/** 及其测试与 e2e；含 12 条数值验收断言与 before/after 截图对照）；完成后独立验证 + 随下一版运行包发布。

### 伴随项（2026-10-16）

- U1 缺陷（V2 批引入的"切回会话提示撑开顶底 18px"）已由桌面UI 修复：断言 18→0 转绿、其余粘性语义未动；桌面窗口自检台同步（26 类断言对齐 + 9 条 IPC 接线 + 空指针修复）同批完成。
- **登记待排（低-中、呈现层）**：回放路径的"手输仿前缀被归为注入行"残余——历史行缺投递身份（实时路径已有身份绑定保护、不成立）；最小修复需历史行携带投递身份（桌面窗口 + 编排侧），是否排期由客户/PM 后续定。
- **工具行折叠（客户批准口径，2026-10-16 定稿）**：同一轮内连续工具行、**轮结束后折叠成一行**（「▸ 本轮 N 个调用：role_status / run_shell ×5 / …」）；**运行中不折叠**（实时可见）；点击展开为逐条一行完整列表（每条自身详情折叠保留，信息零丢失）；**折叠态显式标出未放行/失败调用**（如"含 1 条未放行"）。属主 桌面UI（口径微调如需 UIUX 复核）；**派发时机＝v1.2.0 CI 触发之后**（避免混入已冻结的发布 overlay，`app/` 路径会触发 release-prepare 未评审生产变更门禁）。

## 候选 G-3「联网能力」（2026-10-16 探针实证后升级为实施方向）

- **探针实证**（客户本机直连网关）：声明 Anthropic 服务端工具 `web_search_20250305` → HTTP 200，服务端真实执行（`server_tool_use`/`web_search_tool_result`/`max_uses_exceeded` 优雅；`usage.server_tool_use.web_search_requests` 计量）。**网关完整支持服务端工具族声明**。
- **客户要求「其他的都要接上」**：不止 web_search——按**可配置的服务端工具集**接入（web_fetch、code_execution 等待追加探针确认）。
- 派发：Pi适配器 出实施方案提案（SDK 注入点、块类型映射、能力位/计费/注入面策略、失败边界、测试与分期）；提案经 PM 评审与客户批准后实施。主属主 Pi适配器（+桌面UI 行样式、运行时核心 文案若需要）。

**G-3 客户批准与实施派发（2026-10-16）**：三份提案到齐后客户「按推荐批准，开始实施」。批准口径：①默认关 + 开关开启（`ANS_PI_SERVER_TOOLS` / `ANS_CLAUDE_WEB_SEARCH` / `ANS_CODEX_WEB_SEARCH`）；②首批工具集 web_search + web_fetch（Pi 侧；Claude 侧 WebSearch，其 WebFetch 客户端形态另行评估；code_execution 缓）；③搜索查询串不进诊断落盘（会话内可见）；④网关不认声明时如实失败、不毁轮次（自动剥离重试后置）；⑤搜索行样式与工具行/折叠口径合流；⑥live 探针由客户在实施验证阶段运行。实施派发：Pi适配器、Claude适配器、Codex适配器 三个独立上下文（各自提案为实施规格）；行样式如需桌面UI 配合由适配器回交列出、PM 路由。随下一版运行包发布。

## v1.2.0 发布解阻（overlay-3）与归因更正（2026-10-16）

- CI run `38881759770`（overlay-2，headSha 21351a7）：**Windows ✅**（Codex EBUSY 生产修复生效）、mac arm64 ✅、**macos-15-intel ✗ 2 红**。
- **归因更正**：2 红**不在** `test/runtime-core/shell-exec-timeout.test.ts`（该文件在同 run 7/7 全绿），而在 `test/测试/kanban-fixes-verify/f1-timeout.test.ts:40/76`——测试角色独立复验套件中**镜像**的 F-1 用例（250ms 微时限与 pid 消失等待窗未适配慢 runner；非产品缺陷）。overlay-2 白名单注释与任务书同款误归属，由装配随本批更正。
- **overlay-3 最小差集口径（PM 裁定）**：白名单**增** `test/测试/kanban-fixes-verify/f1-timeout.test.ts`（真凶文件，经测试角色同口径时序健壮化：微时限抬高、有界轮询、语义零放松），**减** `test/runtime-core/shell-exec-timeout.test.ts`（原条目唯一依据＝误归属；该文件 intel 本就全绿；其硬化调用 `until(pred, boundMs)` 依赖 fixtures.ts 新增可选形参，若只列测试文件不列夹具则「新测试配旧夹具」静默失效——列两件又属非必需扩面，故整组随发布后 main 常规批次提交，不入本 overlay）。selected 预期：8 − 1 + 1 = 8。
- **派发**：测试（f1-timeout 硬化）；装配（白名单增一减一 + 注释更正 + packaging 测试精确同步 + selected 复算）。运行时核心硬化件按上述口径延迟入 main。
- **提交纪律（选择性提交）**：overlay-3 只含 policy/装配测试面/f1-timeout/相关角色文档；**排除**在飞的折叠批（app/renderer×3、test/桌面应用×3）与三平台搜索批（src/provider/*、test/*-adapter、相关角色卡）——`selectOverlay`（release-policy.mjs:19）对未列 `app/`、`src/` 路径**硬拒**（Unreviewed production overlay），混入即发布门禁失败。
- **已执行**：提交 `2c70e5b`（19 文件）已推 main；提交后以同一 `selectOverlay` 复算 selected 恰 8（含 f1-timeout、不含 shell-exec，零意外路径）；CI 重跑 run `38894559186`（headSha 2c70e5b）**四 job 全绿**（build ×3 + release）。
- **发布完成（2026-10-16 11:47Z）**：draft 12 资产独立验收全过——存证摘要逐项一致、mac-arm64 ZIP 三方摘要一致、三 manifest 同源且 smoke.ok=true、provenance overlayPaths 恰 8 / excludedChanges 30 项全文档面；公开后未登录核验（发布页/三平台 ZIP/SHA256SUMS 全 200；README 指向 v1.2.0）。验收记录：`角色卡/测试/docs/change/2026-10-16_change_v1.2-release-verification.md`。发布页 https://github.com/wangzhongren/ans-studio/releases/tag/v1.2.0 。**冻结解除**：此后 main 可接收发布后批次（搜索批/折叠批/运行时核心硬化对），下版发布换新 SOURCE_REF。

## G-3 实施收口（2026-10-16）

- **三上下文全部交回**（均工作树改动、零 git 提交；开关默认关、关时逐字旧行为）：
  - Pi适配器：`ANS_PI_SERVER_TOOLS`（白名单解析；未知 id/非法 max_uses/重复 id 构造期抛错）；新 `src/common/pi-adapter/server-tools.ts` ＋ real-adapter 三 handler（**仅启用时注册、未启用零开销**）；专项 264/264、全量 0 新红、typecheck 0。
  - Claude适配器：`ANS_CLAUDE_WEB_SEARCH` 三处（tools 声明＋PreToolUse 放行分支（**不注入 updatedInput**）＋消息泵 native-start/result 配对）；32/32；loopback probe 6/6 实证 PreToolUse 对内置 WebSearch **实分发**、侧查询形态、400 不毁轮次。
  - Codex适配器：`ANS_CODEX_WEB_SEARCH`；键形态经 T3 回环矩阵实证＝顶层 `web_search="live"` → 出站 `{"type":"web_search","external_web_access":true}`；webSearch item→message 行＋`detail.source:"web-search"`；settled 附 searchCalls；33/33。
- **实施轮关键修正（已入各记录）**：Pi 发现 `after_provider_response` 仅 2xx 后回调（非 2xx 在 fetch 层 throw）——降级判据改从 SDK 错误消息**前缀**取状码（不读正文、不落诊断）；服务端块流忠实通道＝loopback 真 SSE（faux 不经扩展事件）。
- **跨边界登记（本轮不实施）**：桌面UI v1 三路径**零改动**（行经既有口径渲染；「查询作为行目标/搜索行图标徽标」列期 2 候选）；运行时核心 `serverTools?`/`webSearch?` 透传字段（v2 角色级授予）非 v1；`settled.searchCalls` 是否上 UI/计费面待裁定；Claude 路径发现的 `dispose()` 临时目录清理 ENOTEMPTY 竞态（≈2/36、既有问题、非本特性引入）→ 另行立项评估。
- **客户 live 探针（Pi 路径，2026-10-16 客户本机实跑）**：`web_search` ✅ **真网关实时执行**（server_tool_use/web_search_tool_result/usage 计量 1–3 次/轮）；`web_fetch` ✗ 网关 500 拒（unknown variant；该网关支持变体仅 web_search 两版——**配置指引：本网关只应启用 web_search**）；`code_execution` ✗（维持不解缓）；**两轮复放 round2 被拒经 Pi适配器 判定为探针构造产物（高置信）**——探针丢失流式文本增量、组装空内容助手消息；真实链路 `convertMessages` 对空内容助手消息**整条跳过**（dist 只读实证）⇒ 该 500 形态不可构造；网关对剥离转录的接受度**仍属未验**（待探针修复后客户补跑 §②）；方案 P 维持未启动（条件性评估已归档）；残余风险登记：剥离后为空 ⇒ 相邻 user 消息形态未验。max_uses 未见强制（不构成成本护栏，计费以 usage 计量为准）、pause_turn 未见（如实登记）。证据：`角色卡/Pi适配器/docs/fix/2026-10-16_probe_server-side-tools-live-results.md`（端点/请求 id 已按公开仓库纪律隐去）。
- **G-3 独立验证完成（测试角色）：整体通过（0 不通过、5 备注）**——报告 `角色卡/测试/docs/change/2026-10-16_change_g3-search-and-fold-independent-verification.md`；独立自建 50 例（含对抗）＋自建 Electron 折叠探针 16/16；冻结绑定 47 条目开工/收工逐字节一致；全量 1773/1772/0/1、typecheck 0。备注（均非不通过）：①`cleanPatterns` URL 贪婪匹配吞「URL 紧贴文本」——Pi 搜索行多条目（「；」连接）第 2 条起标题被吞（呈现面小缺陷、丢文本不泄文本；**已派运行时核心出轻修提案**）；②max_uses 经 Number() 宽容 0x2/1e2（值仍正整数、安全侧）；③server-tools.ts 注释「大小写不敏感」与实现不符（措辞误、行为安全侧）；④网关 start 回传 count=0 且响应含调用块时 from-blocks 兜底被抑制（记账窄界、已钉）；⑤Claude/Codex live 探针与真机 E2E 留白（如实）。
- **探针修复完成（Pi适配器）**：两处构造偏差修复＋`--self-test` 离线自检 PASS（A/B 承重证明：注回旧偏差恰转红）＋守卫烟测与 typecheck 0；客户补跑命令不变（`node test/pi-adapter/server-tools-probe.ts`，读 .env、只打键名、结构化摘要可整段转达）；其证据文件「待办修复」条一行为**待排轻项**（下次该角色 docs 轮同步）。
- **发布后批次入 main（2026-10-16）**：运行时核心时序健壮化对／G-3 搜索批（三适配器＋含修复后探针）／工具行折叠批／验证与验收记录／G-4 评审记录——按批提交推送（`9c42651`/`3826f76`/`f1da234`/`56de09a`/`d8eaa1c`）；下版发布换新 SOURCE_REF。
- **备注①轻修提案已交回（运行时核心，2026-10-16）**：`角色卡/运行时核心/docs/fix/2026-10-16_proposal_cleanpatterns-url-greedy.md`——推荐**核心收窄排除集**（`tool-display.ts:38` 单行正则增 CJK 标点块 `　-〿` 与全角块 `＀-￯`；纯非贪婪实测剥除整体失效不可行；正向 ASCII 字符集被模拟证伪——URL 含非 ASCII 查询值时漏真 secret，违反零泄漏口径）。影响面＝唯一生产消费方为显示投影（历史/实时/报告/回交全走 protectText）、唯一钉住旧行为处＝测试角色 loopback 用例 L255（须翻转，归测试角色同批）。**未决点 PM 口径（呈客户）**：A-base 范围（A-ext 通用标点登记备用）；无分隔符紧贴 CJK 的固有歧义**保留现状**；Codex 诊断 redact（config.ts L44）同类贪婪模式**同批检查（只紧不松）**；Pi 连接符间距（B）不做。**已呈客户，与 G-4 简表同轮批准。**

## 客户批准（2026-10-16）：「都按推荐批准，开始实施」＝G-4 十项裁定全采纳 ＋ cleanPatterns 轻修批准

- **G-4 V1（技能安装全链）实施派发——wave 1（契约层先行）**：①运行时核心（I1/I2：`src/model/runtime.ts` 契约单一来源＝`InstallSkillFn`/`UninstallSkillFn`＋回执形状＋`GovernedToolsOptions.installSkill`/`uninstallSkill`；schema 两工具；tools 两 maker[只路由载荷、不写盘]）；②编排（I4 `renderInstalledSkillsSection(projectRoot, roleId)` 渲染单一来源[读登记、算 digest、坏件跳过、零技能空串]＋I5 `SU_PREAUTHORIZED_WRITE_DIRS` 增 `docs/skills`）；③门禁引擎（I6 su 卡「安装纪律」段，J-1 守卫避让）。
- **wave 2（契约落盘后派）**：桌面窗口（I3 handler[校验/激活复用 rebuildSession/三态回执/系统行/诊断]＋裁定④轮次护栏[仅客户消息发起的轮次可执行]＋裁定⑤ O-1 指纹扩展[登记＋内容文件，settle 收敛]）；三适配器（系统提示各拼一行＋**V2 P0 探针轮**，各自离线/loopback）；桌面UI（I7 行样式最小面）。
- **冻结符号（PM 定，落盘即契约）**：工具名 `install_skill`/`uninstall_skill`；能力位/字段 `installSkill`/`uninstallSkill`；回执三态形状 `{ok:true, action:"installed"|"uninstalled", roleId, name, path, digest, effective:"rebuilt"|"next-session", note?}` / `{ok:false, reason, message}`；护栏拒绝 `reason:"not-customer-turn"`；系统行 `[系统·安装]`；注入节标题「## 本角色已安装技能（动手前先读，按序）」；登记文件 `docs/skills/<name>/{SKILL.md,install.md}`。
- **cleanPatterns 轻修实施派发**：运行时核心（A-base 收窄＋Codex 诊断同批检查[只紧不松]＋单测增补[复现转正/后缀/括号/对抗零泄漏/`;`不回归]）→ 测试角色（loopback L255 断言随修翻转＋补跑复验）。
- 两者完成后：**独立验证轮**（测试角色，含 V1 全链与轻修）→ 随下一版运行包发布。

### G-4 V1 实施收口（2026-10-16）

- **九件全部交回**：运行时核心（cleanPatterns A-base 收窄＋Codex 诊断同批＋G-4 I1/I2 契约[`InstallSkillFn`/`InstallSkillReceipt`/`installSkill?` 等，`src/model/runtime.ts` 单一来源]＋schema/n工具 maker[只路由载荷、不写盘]＋request_confirmation 三棵树文案同步）；编排（I4 `renderInstalledSkillsSection(projectRoot, roleId, onDiagnostic?)` 单一来源＋`readSkillRegistration` 读取器[与渲染器同解析、双向核]＋I5 三棵树预授权＋收口件[`AdapterCapabilities`/输入型/工厂六处逐名透传点亮两工具]）；门禁引擎（I6 卡「安装纪律」段＋三棵树话术，J-1 守卫 185/186 全过）；桌面窗口（I3 handler 全分支[护栏→校验→激活→回执＋`[系统·安装]` 系统行＋诊断]＋裁定④轮次护栏＋裁定⑤ O-1 指纹扩展[登记＋内容文件、settle 收敛、坏件不误重建]）；三适配器（注入节拼接×3＋**V2 P0 探针轮**）；桌面UI（I7 三层实证零改动）；测试（4 处钉子同步/翻转，强度未放宽）。
- 全量定格 **1829/1828/0 红/1 skip**（各上下文终跑一致）、typecheck 0 错；两工具自此**注册点亮**（未注入仍零注册）。
- **三平台 P0 探针结论（V2 输入要点）**：Claude——spawn 成立但**子进程 env 未收窄**（含网关凭据，V2 必修为自持收窄）；`mcp_server.source="dynamic"`（放行判据以此为准）；hook-allow 后 `canUseTool` 不被咨询（`:239` 无需动）；首轮等待受 CLI 内部 ~27s 界。Codex——连续 `-c` 同根键**覆盖非合并**（定义与禁用集须编入单条）；namespace 桥＋`mcpToolCall` item 形状定格；ANS 姿态下白名单 server 需 `default_tools_approval_mode:"approve"` 才可执行、零审批请求；env 无全量继承（三平台中安全）。Pi——`bindExtensions` 接通＋治理回归钉住；**`dispose()` 不收回 MCP 子进程（V2 必做）**；放行判据草案（前缀式，快照式实测误伤）；自持传输收窄实证（91→3 键）。
- **下一步**：独立验证轮（已派：V1 全链＋cleanPatterns 轻修＋范围审计＋冻结绑定）→ 提交入 main → **V2 分批呈批**（用探针结论回填产品提案 §五占位后按平台呈裁）。

## 客户批准（2026-10-16）：「按推荐批准，开始实施」＝V2（MCP 安装）分批实施

- **四项裁定全采纳**：①Pi 资源工具三名 V1 不接（限 tools-only）；②server 名含特殊字符**直接拒绝安装**（防清洗碰撞，名仅 `[A-Za-z0-9_-]`）；③HTTP/OAuth 型 V1 **只接 stdio**；④分期 P1 Claude→P2 Codex→P3 Pi（可并行实施、验证分批）。批准件＝产品提案 revision 2（§五已回填探针结论）。
- **V2 wave A 派发（契约/独立面并行）**：运行时核心（契约：`InstalledMcpServerV1`[stdio：name/command/args/env 引用式、值不出文件]＋`InstallMcpFn`/`UninstallMcpFn`＋回执[沿 InstallSkillReceipt 体格；path＝`docs/mcp/<name>.md`、digest＝声明文件 sha256]＋`GovernedToolsOptions.installMcp?/uninstallMcp?`＋`RuntimeProviderOptions.installedMcpServers?`；**声明读取器单一来源** `src/common/runtime-core/mcp-declarations.ts`（`readMcpDeclaration`/`listInstalledMcpServers`，坏件防御）；**Service 接线**（providerFor 按角色注入、坏件跳过）；schema 两工具[能力级授予如实文案]；tools 两 maker）；编排（**预授权第四棵树 `docs/mcp`**＋话术同步）；门禁引擎（卡文本增 MCP 安装纪律段：能力级授予如实/先落盘再激活/卸载下次会话摘除且已发生副作用不可撤，J-1 避让）；桌面UI（MCP 使用/安装行渲染最小确认面）。
- **V2 wave B（待 A 落盘）**：编排（能力位透传链点亮两工具）；桌面窗口（MCP handler，沿技能 handler 同构）；三适配器（**P1 Claude**：hook 放行[source="dynamic"]＋审计两行＋status 行＋env 收窄方案定实；**P2 Codex**：白名单化＋单条 root map＋名字集恰等＋`mcpToolCall` 映射＋`default_tools_approval_mode:"approve"`；**P3 Pi**：扩展接入＋bindExtensions＋前缀判据＋自持 transport＋dispose 收口）。
- 完成后：独立验证（按平台分批）→ 提交 → 随运行包发布。

## 候选 G-5「推理与推理强度」（2026-10-16 客户提出，已派细化）

- **客户原话**：「你这个需要支持推理，需要支持推理强度。」
- **PM 现状核（2026-10-16）**：Pi 路径模型响应**已有 thinking 块**（G-3 探针实证）但 ANS 观察面只取白名单字段⇒**不呈现**；Claude 路径 `queryOptions` **零 thinking 配置**（SDK 支持面未接线）；Codex 路径**无 `model_reasoning_effort` 配置面**（走 CLI 默认）；设置面（`RUNTIME_SETTINGS`）仅凭据/地址/模型/上下文窗口——**无推理强度字段**。`forceAdaptiveThinking:false`（Pi compat 收窄）为请求格式安全值，与「能否请求推理」待评估区分。
- **三件配套**：①三平台推理请求接线（Claude thinking 选项／Codex reasoning effort 键／Pi thinking 级）；②推理强度档位（设置面板落位、档位语汇与默认口径）；③思考内容的聊天呈现（现状仅「正在思考」指示、无内容）。
- **派发**：产品（设计提案：档位与默认、设置面落位、呈现形态、按角色覆写候选）＋运行时核心（跨平台机制评估：三 SDK 实据、配置注入面、事件面事实、探针清单——loopback 可决项与需客户真网关项分列）；经 PM 评审后呈客户批准。
- **两文档交回与 PM 评审（2026-10-16）**：产品 `角色卡/产品/docs/design/2026-10-16_design_reasoning-and-effort.md`（322 行）＋运行时核心 `角色卡/运行时核心/docs/fix/2026-10-16_assess_reasoning-and-effort.md`（255 行，逐处行级实证）。**关键发现：Pi 现状已在隐式请求推理**（缺省 thinkingLevel=medium ⇒ 每轮 `budget_tokens:8192`＋max_tokens 抬升；thinking 块在 `real-adapter.ts:796-810` 丢弃）；Claude `Options.thinking`/`Options.effort` 现成、块在 `claude/session.ts:361` 丢弃；Codex pinned 0.162.1 确有 `model_reasoning_effort`（目录值 low/medium/high/xhigh/max/ultra，无 off/minimal；config 层不校验）＋完整 `item/reasoning/*` 事件面（适配器现忽略）。`forceAdaptiveThinking:false` 语义澄清＝不伪造 adaptive 形态、推理照发（非禁用）。建议字段：`reasoningEffort?: "off"|"low"|"medium"|"high"|"xhigh"`＋三 env 键（走 runtime-settings 面板链）。探针 A 组（loopback）＋B 组（客户真网关）分列；首要风险 R1＝Pi 预算抬升×上下文钳制可产非法组合（A5 先行定格）。
- **PM 批准简表已呈客户**：档位六档（默认/关/低/中/高/极高；Codex 无「关」⇒该选项灰置如实）；未设＝逐字现状；每平台一字段；呈现＝折叠行「已思考 N 秒 ▸」（默认折叠含运行中，展开零丢失）；生效＝新会话生效/在跑不打断；按角色覆写 V1 不做（登记）；降级链＝网关拒有界一次去参数重发＋如实一行；计费如实（思考计入输出 tokens）；实施序＝A 探针→契约＋接线→独立验证→B 探针（客户）→随运行包。

## G-4 V2 收口与提交（2026-10-16）

- **V2 独立验证：整体通过（0 不通过、6 备注）**——报告 `角色卡/测试/docs/change/2026-10-16_change_g4v2-mcp-install-independent-verification.md`；自建 64 例（A–M 全过：契约/读取器/接线/工具/四棵树/卡文本/handler/三平台装配对抗/范围审计）；冻结绑定 82 条目逐字节一致；全量 1998/1997/0红/1skip、typecheck 0。
- **提交入 main（四批）**：`bd97e53`（契约层与工具面）／`ff0fd44`（装配面：四棵树/透传/卡文本/handler/行确认）／`3951ed2`（三平台装配 P1/P2/P3＋pi-mcp 显式依赖）／`02747aa`（验证＋钉子翻新＋G-5 文档＋PM 记录）。**G-4 全案（V1＋V2）实施收口。**
- **备注登记（6 条非不通过）**：其中⑥空 name 文案 `docs/mcp/.md` 小瑕列**待排轻项**；⑤Codex 碰撞判据大小写敏感（边界登记）；②`CAN_USE_TOOL_SHADOWED` 提示与设计一致（hook 先行）。
- **G-4 全案待办**：真机 E2E（装-看-用-撤，含三平台；V1/V2）；Codex namespace 桥对真网关的接受性（验收轮）；B 组推理探针（归 G-5 实施序）；随下一版运行包发布。

## 客户批准（2026-10-16）：「按推荐批准，开始实施」＝G-5（推理与推理强度）实施

- **批准范围＝六项推荐裁定**（档位六档/未设＝逐字现状/每平台一字段/折叠行呈现/新会话生效/降级链＋计费如实）。
- **冻结符号（PM 定，落盘即契约）**：`ReasoningEffortV1 = "off"|"low"|"medium"|"high"|"xhigh"`；`RuntimeProviderOptions.reasoningEffort?`（未设＝逐字现状）；env 键 `ANS_CLAUDE_REASONING_EFFORT`/`ANS_CODEX_REASONING_EFFORT`/`ANS_PI_REASONING_EFFORT`（Codex 字段 choices **无 off**——平台无该档，如实不假装）；推理呈现事实通道（折叠行数据面：内容/时长/平台省略态）单一来源 `model/runtime.ts`；行文案「已思考 N 秒 ▸」。
- **Wave 1 派发**：运行时核心（契约＋Service env 归一注入[非法值＝视为未设＋诊断如实、不毁会话]＋推理事实通道契约＋Claude effort 值集映射按 sdk.d.ts 定格）；项目管理（`RUNTIME_SETTINGS` 增 `choices?` 元数据面＋三字段注册）。
- **Wave 2（待 wave 1 落盘）**：三适配器（各自 A 组探针先行——Claude wire 捕获/Codex reasoning item/Pi 全档＋R1 预算×钳制非法组合定格→请求接线＋thinking 内容捕获发射＋网关拒⇒恰一次去参数重发＋如实一行）；桌面窗口（推理事实投递＋设置保存接受新字段）；桌面UI（面板档位控件[select]＋折叠行「已思考 N 秒 ▸」渲染）。
- 完成后：独立验证 → B 组真网关探针（客户）→ 随下一版运行包。

### G-5 wave 1 收口与 wave 2 派发（2026-10-16）

- **wave 1 两件交回**：运行时核心（`ReasoningEffortV1`＋`RuntimeProviderOptions.reasoningEffort?`[未设=字段缺席＝逐字现状]；事实通道五符号冻结[`RuntimeReasoningFactsV1`/EventDetail/DisplayDetail/DiagnosticDetail/Projector，投影单点 `projectReasoningDetail` 于 tool-display.ts，protect/预算/omitted 归一/duration 防伪/幂等]；归一器 `runtime-core/reasoning.ts`[三 env 键/三态/非法＝按未设＋诊断不毁会]；Service 读注入＋emit/历史单点投影；**Claude 值集映射表冻结**：low/medium/high/xhigh 直通、`max` 不收编、Codex 无 off[不注入＋如实说明]、Pi off 需前置修 `thinkingLevelMap.off`[否则钳 minimal＝假关闭]；142/142、全量 2019/2018/0/1）＋项目管理（三字段＋`choices?` 元数据，2002/2001/0/1）。
- **wave 2 派发**：三适配器（各自 A 组探针先行→按映射表接请求强度→thinking 内容捕获发射 reasoning 事件→网关拒⇒恰一次去参数重发＋如实一行）；桌面窗口（设置保存链接受三新键[值域校验]＋旧 Pi 面板与注册表关系核实）；桌面UI（档位 select 控件＋折叠行「已思考 N 秒 ▸」[默认折叠含运行中、omitted 如实、纯文本展开、复用折叠状态机]）。
- 完成后：独立验证 → B 探针（客户）→ 随运行包。

## v1.3.0 发布（2026-10-16 客户「发布新运行包」）

- **冻结源 = tag `v1.3.0` = `16963ee`**（已推送；含 G-3 三平台搜索＋工具行折叠＋G-4 全案[技能/MCP 安装]＋G-5 全案[推理与推理强度]＋cleanPatterns 修复——**源内已含全部产品代码**）。
- overlay 准备（装配）＝版本 1.3.0＋README＋release-policy（SOURCE 改钉＋白名单重置基础集＋v1.2.0 一次性条目移除）＋装配测试/文档＋selected 复算与干跑。
- 流程（沿 v1.1.0/v1.2.0 runbook）：root 审验 → 选择性提交 overlay → push → `gh workflow run … -f source_ref=v1.3.0 -f publish=false` → 三平台绿 → 资产独立验收（12 项/摘要/manifest/provenance/本地 ZIP 核验）→ 公开（notes＝功能摘要）→ 未登录核验。
- **CI 首跑 run `38924209553`（headSha 74a34c9）：mac arm64 ✅、mac x64 ✅、Windows ❌（7 红）**——本批测试（G-3/G-4/G-5）**首次上 Windows CI**，红全为平台语义类：Claude launcher env 平台注入键＋POSIX 信号（×2）、Pi env 收窄平台注入键（×1）、Codex native 夹具（×1）、验证套件（双向核/指纹三触发路径分隔符/H2 键面扫描 ×3）。**修复四路已派**（各属主：先判别「测试适配 vs 产品缺口」，平台适配只做真值分支沿 v1.1.0 先例）；修复文件清单回收后由装配更新 overlay 白名单（overlay-2）→ 重跑 CI。release job 按设计跳过（未发布任何东西）。
- **Windows 修复轮收口（2026-10-16）**：四路判别全部交回——**产品修复仅 1 处**（Codex win32 taskkill 上界 120ms→2000ms：CI 峰值负载下同秒姊妹用例 212ms 通过为证；仍为有界）；其余 6 处为验证套件平台真值分支（Windows 注入十键＝libuv required_vars 构造性强补[同 CI 三处互异 spawn 实现同集互证]、路径原生分隔符、无 POSIX 信号面、控制字符建盘）；断言本体零放宽。**流程备注（登记）**：`test/测试/g4v2-mcp-verify/g-claude-launcher.test.ts` 由 Claude适配器属主做 launcher 机制级平台分支（判别依赖 libuv 实证，合理分工、如实登记）。overlay-2 白名单＝基础 6＋本 7（1 生产＋6 测试）＝selected 13；装配准备中。

## 候选 G-4「角色能力安装（技能＋MCP）」（2026-10-16 客户讨论提出，已派细化）

- **客户原问**：「这个 su 应该有个工具，可以给其他的角色安装 mcp……或者安装技能」。
- **客户裁定（授权模型）**：**不设二次确认卡**——「这两个都是我确认他让他安装他才去给其他的角色安装，这个确认也没必要啊」＝客户会话中指令 su 安装即完成授权；su 不自主发起；安装可见、可撤即可。
- **现状事实（PM 核）**：技能——`skillRoot` 机制已有（`ANS_SKILL_ROOT`、门禁独立写权根），G-1 裁定 #5「技能文档增补另行治理」为该方向已登记事项；MCP——ANS 自身即以 MCP 通道向 Claude/Codex 注入内置工具（管道已验证），外来 MCP 现被三重封死（Claude `strictMcpConfig`＋hook 兜底＋canUseTool deny-all；Codex 全量 disable＋空目录硬校验；Pi 无 MCP 面）。
- **待解设计点**：su 工具面（install/uninstall、技能与 MCP 是否统一）；技能落盘位置与角色加载路径（含 su 预授权写权是否扩列）；MCP 三平台机制（Claude 放行面／Codex 白名单化／Pi 支持性）；产物可见性、留痕与卸载；第三方 MCP 进程的环境/凭据面。
- **派发**：产品（正式设计提案，体格沿 G-2）＋运行时核心（MCP 跨平台可行性评估，行级实证）并行；经 PM 评审后呈客户批准。
- **产品提案已交回（2026-10-16）**：`角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md`（410 行）。核心设计：工具＝**校验＋激活＋回执、不写盘**（「先落盘再激活」镜像 G-1；write_file 仍唯一写路径）；技能落 `docs/skills/<name>/`＋**会话开局注入**加载（复用 G-2 rebuildSession 激活、在跑不打断）；技能**可迭代**（刻意区别于契约冻结版本化）；MCP 部分落 `docs/mcp/<name>.md` 声明白名单、程序化注入零平台残留，**三平台机制留占位待运行时核心评估回填**；未决点 ①–⑩（含 su 预授权是否扩列 `docs/skills`、轮次触发护栏、命名）列 §十一。运行时核心评估在跑——两份齐后 PM 评审并呈客户批准简表。
- **运行时核心评估交回（2026-10-16）**：`角色卡/运行时核心/docs/fix/2026-10-16_assess_role-mcp-install.md`。三平台均**可行**；**事实更正入档：Pi 并非「无 MCP 面」**——SDK 内置 MCP 扩展（`createMcpExtension`/`registerMcpServer`），`bindExtensions` 全仓 0 调用＝现未加载；**Pi 默认传输把全量 env 交给第三方 server 子进程＝三平台中唯一默认不安全（V2 必须自持 transport 收窄）**。Claude 最小 4 处（注入面＋hook 放行分支[否则兜底 deny 会把外来工具一并拦掉]＋两审计发射点）；Codex 最小 4 处（白名单化＋`-c` 定义注入＋三处校验改「恰等」＋`mcpToolCall` item 映射），**原生 MCP 调用不经 ANS 门禁＝能力级授予**（批文与卡文案须如实，不得宣称逐调用受审）；P0 探针 12 条（§九）实施前先行。
- **G-4 PM 评审完成、批准简表已呈客户（2026-10-16）**：评审结论——架构沿用既有先例（预授权直写／rebuildSession／注入才注册／系统提示单一来源）；零新增写路径；唯一写权变化＝预授权扩列（裁定①）。10 项推荐裁定随简表呈客户：①扩 `docs/skills`（候选 1；V2 再议 `docs/mcp`）；②加载＝会话开局注入、派发必读块扩面不做（登记候选）；③两文件登记（SKILL.md＋install.md）、按角色列表；④轮次触发护栏**加**（仅客户消息发起的轮次可执行，非卡）；⑤next-session 口径接受＋**O-1 指纹集扩展本期做**（登记＋内容文件，settle 即收敛）；⑥技能可迭代确认；⑦V1 卸载＝效果已撤/文件保留、删除原语登记；⑧V2 三平台分批（P0 探针→Claude→Codex→Pi）＋能力级授予如实＋Pi env 收窄为必须项＋放行粒度＝server 级白名单；⑨凭据值不入声明文件/对话/诊断（只收 `env:NAME` 引用与字面量）；⑩命名按提案。**批准范围**：V1 技能安装全链实施（I1–I4＋I6＋I7，含裁定①⑤）＋V2 先批口径与 P0 探针轮（实施分批另呈）。

## G-1 客户批准与 PM 裁定（2026-10-16）

客户指示「这些开始启动」＝**批准 G-1 按提案实施** + 批准 G-2 细化 + 上下文窗口由 128K 调至 256K + 关闭 run-3 应用。PM 对提案 §十一 六项裁定（采纳提案推荐）：

1. 契约主属主 V1＝**su**（规划时落盘、冻结先于实现）；「转 PM」不预留实现、必要时走治理变更（登记）。
2. 契约**不并入** `.ans/project.json` pin 集合，走 manifest 留痕——采纳（编排/门禁引擎评估一致）。
3. 失败口径——采纳：契约缺失→**拒投**并如实回执（fail-closed）；workflow 缺失→**降级标注**。
4. A6（O-1 指纹集扩展）/A7（write_file 回执附 sha256）**不入 V1**（登记待评估）。
5. 技能文档（仓库外）增补属另行治理（登记）。
6. workflow.md 旧版：历次版本以变更记录节为准，快照可选不强制——采纳。

**实施派发（V1 最小闭环，四个独立上下文）**：编排（`renderDispatchPrompt` 必读块单一来源渲染）；桌面窗口（投递时算 sha256、契约缺失拒投、渲染切单一来源并收口本地副本）；门禁引擎（su 卡文本：规划落盘契约/工作流、派发引用地址）；运行时核心（`dispatch_task` 描述同步）。**G-2 细化**派 产品（设计成文，不实施）。

## G-1 实施收口（2026-10-16）

- **四件全部交回**：A1 编排（`renderDispatchPrompt`/`extractDispatchReadPaths`/`planDispatchDelivery` 单一来源于 `handback.ts`，288/288）；A2 桌面窗口（routeDispatch 接线、契约缺失 fail-closed 拒投且**判据先于去重登记**、本地副本删除，241/241）；A3 门禁引擎（su 卡「规划纪律」段 + J-1 按地址引用扩展，180/179）；A4 运行时核心（`dispatch_task` 描述同步，96/96）。
- **两个小跟进**：测试角色把 F-2 复验套件金文本接回单一来源（附非放松证据：逐字 deepEqual 未弱化、时序断言未动）；桌面UI 过期注释更新。全量定格 **1528 计/1527 过/0 红/1 跳过**（测试角色复跑，PM 复跑核对中）；typecheck 0 错。
- **两分写盘口径确认**（四上下文独立同解一致）：契约 `docs/contracts/**` 预授权直写；`docs/workflow.md` 走同一次规划确认的 preview + confirmed:true。若客户要把 workflow.md 并入预授权，属编排机制扩列表的另一变更，须同批回改卡文本与测试。
- 已知残余（设计 §八 登记）：su 内嵌契约全文 V1 无机械拦截；「不内嵌」靠文案 + 评审约束。
- G-1 独立验证**已完成：整体通过（0 不通过、5 备注）**——报告 `角色卡/测试/docs/change/2026-10-16_change_g1-independent-verification.md`；冻结绑定 37/37 复算一致；对抗 24/24（含去重键陷阱「拒投→补齐→重派必须受理」、哈希定格语义）；范围审计确认未勾选项零实施、断言无放水（fresh-enum includes→===）。备注摘要：拒投措辞字面差（语义一致）、提取正则保守面（V1 登记残余）、su 内嵌契约全文 V1 无机械拦截（设计 §八）。

# PM 评审：kanban-live 修复提案批次（2026-10-15）

派发：[2026-10-15_change_kanban-runtime-fixes-dispatch.md](2026-10-15_change_kanban-runtime-fixes-dispatch.md)。五份提案（各属主角色独立上下文产出，全部标注「未实施/未测试」，零代码改动、零 git 提交）：

| 项 | 提案 | 属主 |
|---|---|---|
| F-1/F-7/F-8 | `角色卡/运行时核心/docs/fix/2026-10-15_fix_kanban-runtime-shell-exec.md` | 运行时核心 |
| F-2/F-4 | `角色卡/桌面窗口/docs/fix/2026-10-15_fix_kanban-delivery-and-operator.md` | 桌面窗口 |
| F-3/F-9 | `角色卡/Pi适配器/docs/fix/2026-10-15_fix_kanban-turn-truncation.md` | Pi适配器 |
| F-5 | `角色卡/门禁引擎/docs/fix/2026-10-15_fix_kanban-f4-governance-note.md` | 门禁引擎 |
| F-6 | `角色卡/编排/docs/fix/2026-10-15_fix_kanban-shell-audit-f6.md` | 编排 |

## 一、抽查核验（PM 独立复核）

- F-1：583s/132s 两段时间线、`runShell` 无执行计时器（tools.ts:379-438）、`ok: code === 0`（tools.ts:492）——属实。
- F-2：`drainChains` 每项目一条、持有贯穿整轮（session.ts:1610-1629）——属实。
- F-3：`clampMaxTokensToContext` 下限 1（pi-ai simple-options.js）；native 原始行 idx96/idx99 `stop=length, output=1, input 465496/338687`；`lifecycle.ts:45` 把 length 归 completed——属实。
- F-4：`DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS=120000`、env `ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS`（app/desktop/operator-channel.ts:68/70/228）——属实；拒绝文案由编排 shell-gate.ts:562-567 固定成「无人值守？」。
- F-5：su 13:21:29 先写成功、13:28:22 同路径被拒（replay 逐条核实）；F4 拒绝文案列边界允许路径而非写权集（resolve-write.ts:44-57/137）——属实。
- F-6：审计 53 条、缺 17 条与 stderr 17 行一一对应；创世过渡窗（13:21:29→13:21:42）内会话快照 acceptance 未接受——属实。

对派发初始假设的三处修正（以属主证据为准）：F-3「输出太长」实为输出预算被钳到 1 token；F-4「后台角色通道判定」实为桌面确认通道自身 120s 超时被误报「无人值守」；F-5「任务写集未发行」实为创世重钉触发 O-1 会话重建、已发行写权被静默清零。

## 二、证据保全

- 破案关键诊断日志已转存：`角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/raw/diagnostics/ans-diagnostics-2026-10-15.jsonl`（739,797B，原路径在 /private/tmp 会被清理）。
- 派发文档 F-6 行证据路径更正为「证据目录顶层 app-redacted.log」。

## 三、推荐实施范围（待客户批准）

必需项全数 + 下列推荐勾选（其余不勾）：

| 编号 | 内容 | 建议 |
|---|---|---|
| F-1（必需全套） | 命令级时限（默认 600000ms，只可调大不可禁用；超时=如实「超时已终止（N ms）」+轮次继续） | 勾选 |
| F-1-opt1 | 进程树终止（POSIX 进程组 / Windows taskkill /T） | 勾选 |
| F-2-M1 | 投递链持有收窄到「认领段」 | 勾选 |
| F-2-opt2 / opt3 | openInternal 同键互斥（闭合既有双开窗口）/ 认领段诊断 | 勾选；opt1（链键降为每队列）不勾（先稳） |
| F-3-a / b | 截断后限一次「收尾补发」（默认开启、env 可关）+ 截断事实外推系统行 | 勾选 |
| F-3-c / d | schema 文案修正（运行时核心）/ 回交摘要截断注记（编排） | 勾选（小项） |
| F-4-M1 / M2 | 桌面确认超时与 shell 审核预算对齐 + 超时/中止原因分流 | 勾选 |
| F-4-opt1 / opt2 | 窗口 focus/show 重推挂起确认卡 / 取消-超时诊断补录 | 勾选；opt3（提高默认值）不勾 |
| F-4-X1 | 编排把通道真实 reason（超时）转达给模型，不再固定「无人值守？」 | 勾选（编排小改） |
| F-5-main | F4 拒绝信息可操作化 + allowedByRoot 语义修正 | 勾选 |
| F-5-opt1 / opt2 | 重建如实行模型可见化（跨桌面窗口/编排）/ schema.ts 那句误导文案修正（运行时核心） | 勾选；opt3（写权跨重建保留）不勾 |
| F-6-1 / 2 | 审计写遇拒刷新边界快照重试 + 提示去重与如实话术 | 勾选；opt2/opt3 暂不排期（登记） |
| F-7（必需）+ opt1/opt2 | 独立操作符 token 守卫 + 内嵌操作符/变量展开检测（未加引号的 `grep a\|b` 类命令将从可用变为明确阻断——文案给「加引号或拆分」指引） | 勾选 |
| F-8-a + b | 投影层「已执行完成（退出码 N）」+ 桌面窗口/桌面UI 行分类同步（跨角色派发） | 勾选 |
| 新增评估 | F-9-opt2：1 MiB 工具结果上限与上下文窗口/钳制的联动评估（运行时核心） | 立项评估 |
| 新增评估 | Claude/Codex 适配器截断同构评估（各自角色） | 立项评估 |

## 四、未决事项（非阻塞，实施轮内自行回答）

1. F-4：**已由客户（操作者本人）亲历证实（2026-10-15 晚）：cp 确认卡确实弹出过，但因 120s 超时后无法点击**——渲染存在，不存在「未渲染」缺陷；问题确认为「超时窗口过短 + 过期后卡片静默失活」。F-4-M1/M2 即为对症修法；F-4-M2 的到期文案应让过期卡显示明确原因（「操作者确认超时，未获放行——可让角色重新发起。」）而非静默变灰，实施后真机复验专门观测此项。F-4-V1 e2e 降级为回归项（原「未渲染则转派桌面UI」分支关闭）。
2. F-4：派发时引用的「另一处 cp 出现可放行确认卡」在三份 replay 中未复现，按跨轮混淆撤回，不影响修法。
3. F-5：`writeSetContains` 字符串比对不区分根（理论窗口、真机未复现）——登记观察，不动。
4. PM 观察：`SHELL_REVIEW_TIMEOUT_ENV` 同名常量分居 编排 `shell-deadline.ts` 与 运行时核心 `timeout.ts` 两处 common——登记，另行评估归并。
5. F-6 残留：17 条缺失中 1 条（13:21:39.359，任何授权落地前发生）物理不可恢复，属 fail-closed 应有残留——请客户确认可接受。

## 五、影响面与风险（摘要）

- 全部改动为「拒绝更多/如实标注」，无任何权限放行面扩大；fail-closed 语义全部保留。
- 实施跨六个上下文：运行时核心、桌面窗口、Pi适配器、门禁引擎、编排、桌面UI（仅 F-8-b 行分类，若 F-4-V1 证实问题再追加）。
- 高敏感面：F-2 投递链重构（桌面核心路径，提案含 6 个既有测试文件的完整回归计划）；F-5-main 触及 decision.ts（单一主属主，按法案经本评审并呈客户批准后方可实施）。
- 回滚：各提案均为单文件/小面积 revert，F-3 另有 env 即时关闭开关。

## 六、新增候选（2026-10-16 客户讨论提出，待细化成提案）

**G-1「契约与工作流落盘 + 派发按地址引用」**——重跑轮复盘时客户提出的设计方向，三个组成：

1. **契约落盘**：su 在规划时把跨角色冻结契约写入项目内单一来源（如 `docs/contracts/<name>-v1.md`），经确认卡授权后落盘；此后禁止以「派发文本副本」作为契约的平行载体。前置事实已核实：角色的**读**不受边界约束（写才受门禁），任何角色都能直接读项目内契约文件。
2. **派发按地址引用**：派发文本只引用 `路径 + sha256`（「契约以该文件为准」），不再内嵌全文；角色动手前必须先读契约与工作流。收益：消灭多份文本漂移、降低派发体积、版本可绑定、契约变更可走「谁改谁触发调用方重验」（对应治理不变量 #6）。
3. **workflow.md（由 su 生成）**：把「谁做什么、先后依赖、交接物、验收口令」落成项目内文档，作为并行的**握手协议**——即各角色间的依赖图与交接契约；客户在规划确认时一并确认，变更走治理。该文档同时是「多任务依赖的自动调度（README 明确尚未实现）」的先行输入。

**动机**：重跑轮三角色严格串行但拼装成功，靠的是两份派发文本**恰好一致**的运气；修完 F-2 后角色将真正并行，共享契约与交接协议从「聊天里的事实」变成**承重结构**。

**待办**：细化成正式提案（含落盘位置/属主——跨角色契约属单一主属主、确认与变更流程、模板结构、以及与 pin/回交机制的衔接），定位实施归属（su 派发指引/产品侧 + 治理约定）。

## 七、下一步

1. 客户批准本表的建议范围（或逐项点名调整）。
2. 按批准范围向各属主角色派发实施上下文（仍是「一个上下文一个固定角色」），各带测试与证据回交要求。
3. 实施完成后由独立验证上下文（测试角色）复验 + 真机 E2E 复跑（含 F-2/F-4/F-3 断点观测项）。
