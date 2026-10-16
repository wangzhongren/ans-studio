---
id: g3-search-and-fold-independent-verification
type: change
title: 2026-10-16 G-3 三平台联网搜索 ＋ 工具行折叠批次独立验证报告（测试角色）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: verified
related: [pi-server-side-tools-proposal, claude-web-search-integration-proposal, claude-web-search-implementation, codex-web-search-change, desktop-ui-toolrow-turn-collapse, kanban-fixes-pm-review]
events:
  - date: "2026-10-16"
    kind: verified
    summary: G-3 三适配器＋工具行折叠独立复验完成——冻结绑定（HEAD 2c70e5b；9 改动面文件＋产品测试/夹具 47 条目全量 sha256，两次逐字节一致）；全量 1723/1722/0红/1skip＋typecheck 0（含我 50 例后 1773/1772/0/1）；对抗 50/50 全绿（隔离/fail-closed/零泄漏 spy/配对/降级链/权限面/行映射/审计）＋独立 Electron 折叠探针 16/16＋声明项复跑全数命中（Pi 264、Claude 32、Codex 33、桌面 71、TOOLFOLD 19、Claude loopback probe exit 0〔开-成功/开-侧查询 400/关-对照 三相位〕）；范围审计六口径＋九项全落地、未批准项零实施；发现 0 项不通过、5 项备注（1 呈现面缺陷候选：既有 URL 贪吃口径吞第 2 条起标题；4 项窄边界/措辞，均如实登记不影响判定）
---

# 2026-10-16 G-3 三平台联网搜索 ＋ 工具行折叠批次独立验证报告（测试角色）

**验证对象**：两个**未提交工作树批次**——① G-3「三平台联网搜索」：Pi（`src/common/pi-adapter/server-tools.ts`〔新〕＋`real-adapter.ts`）、Claude（`src/provider/claude/session.ts`）、Codex（`src/common/codex-adapter/config.ts`＋`protocol.ts`、`src/provider/codex/session.ts`）；② 桌面UI「工具行折叠」（`app/renderer/renderer.js`＋`styles.css`＋`tool-rows.js`）。批准口径＝`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-3 客户批准与实施派发」（①默认关＋三开关／②首批工具集／③查询串不进诊断落盘／④如实失败不毁轮次、自动剥离重试后置／⑤行样式与工具行/折叠口径合流／⑥live 探针由客户运行）与 §伴随项「工具行折叠（客户批准口径，2026-10-16 定稿）」；实施规格与记录＝Pi/Claude/Codex 三份提案与实施记录、桌面UI `docs/fix/2026-10-16_fix_toolrow-turn-collapse.md`。

**整体结论：通过（0 项不通过；5 项备注，均如实列明、不影响批准范围的落地判定）。**

本报告全部原始证据落在 `角色卡/测试/docs/change/2026-10-16-g3-verification-evidence/`（下称「证据目录」；`raw/` 下为原始输出）；独立用例＝`test/测试/g3-search-verify/`（**50 例** 5 个用例文件＋1 个独立 Electron 折叠探针〔16 项断言〕）。**独立构造**：loopback 服务器、SSE 素材、fake SDK query、fake codex engine、事件素材与全部断言本角色自建；对产品测试文件**零 import**（仅 import `src/**`、`app/renderer/tool-rows.js` 与已装依赖）；不复用实施方断言。全程只写 `test/测试/` 与 `角色卡/测试/`；未改任何产品文件与他方在飞文件；未 git 提交；**未发任何真实网关请求**（`test/pi-adapter/server-tools-probe.ts` 客户 live 探针禁跑未跑；本地 127.0.0.1 loopback 与 in-process 假件即全部网络面）。

---

## ① 冻结绑定（本结论对应哪一版代码）

- HEAD＝`2c70e5bed0e7ef71d53c3b0447d9adee60594cf6`（branch `main`；两批改动**全部未 commit**、停在**工作树**；`raw/environment.txt`）。
- **冻结集＝9 个改动面文件＋产品测试/夹具**（`raw/sha256-freeze-begin.txt` / `raw/sha256-freeze-end.txt`，共 47 条目＋3 行注释＝50 行）：9 改动面文件、6 个适配器产品测试/夹具（`test/pi-adapter/server-tools*.test.ts`、`test/claude-adapter/session.test.ts`、`test/codex-adapter/web-search.test.ts`、`test/codex-adapter/fixtures.ts`、`test/codex-adapter/fixtures/native-cli.mjs`）、`test/桌面应用/**` 全量 32 文件（含 e2e 5 件）。
- **两次清单逐字节一致**（开工/收工复算 `diff` 为空，`FREEZE-MATCH 47/47`）。验证者自身产出（`test/测试/g3-search-verify/`、证据目录、本报告）不在冻结集内；其指纹单列（`raw/g3-verify-harness-sha256.txt`）。

关键实现文件指纹（sha256 前 16；完整 47 条见冻结清单）：

| 文件 | sha256（前 16） | 备注 |
|---|---|---|
| `src/common/pi-adapter/server-tools.ts`（新） | `092cceda16f2b577` | 注册表/解析/声明追加/观察状态机 |
| `src/common/pi-adapter/real-adapter.ts` | `d7d7667ff0e7b3eb` | 三 handler（启用才注册）＋启用行＋降级判定 |
| `src/provider/claude/session.ts` | `30b3c0474bd375a1` | 能力位/PreToolUse 放行/消息泵 |
| `src/common/codex-adapter/config.ts` | `f73cf1b7c57e2c0b` | webSearchEnabled＋三钉参数化 |
| `src/common/codex-adapter/protocol.ts` | `d16d2ea4446c7e84` | webSearchRow 白名单投影 |
| `src/provider/codex/session.ts` | `4af2577254beb4ad` | 能力位传递＋webSearch item 行＋searchCalls |
| `app/renderer/renderer.js` | `27d72e8ee35c6553` | 折叠状态机/文案/批尾挂点（与折叠记录自报前 8 位一致） |
| `app/renderer/styles.css` | `7cf067d40b0e2673` | record-count 自适应（同记录自报一致） |
| `app/renderer/tool-rows.js` | `2fd2335f5681fee6` | callSummary 拆分 denied/failed＋tools 分解（一致） |
| `test/桌面应用/tool-rows.test.ts` | `a599d1da600d9d42` | 同记录自报一致 |
| `test/桌面应用/renderer.test.ts` | `db80beeec765628889` | 同记录自报一致 |
| `test/桌面应用/e2e/uiux-v2.mjs` | `0a1439dee53ce707` | 同记录自报一致 |

## ② 全量复跑（与声明数逐位对账）

| 命令 | 原始计数 | 证据 |
|---|---|---|
| `node --test "test/**/*.test.ts"`（冻结版本，**不含**我的用例） | **1723 / 1722 过 / 0 红 / 1 skip / exit 0** | `raw/full-suite-frozen-only.txt` |
| `node --test "test/**/*.test.ts"`（**含**我 50 例） | **1773 / 1772 / 0 / 1 skip / exit 0**（= 1723 + 50，零相互干扰） | `raw/full-suite-with-g3-verify.txt` |
| `npm run typecheck`（含我 6 个新文件） | **0 错误**（exit 0） | `raw/typecheck.txt` |
| `node --test "test/测试/g3-search-verify/*.test.ts"`（本批独立用例） | **50 / 50 / 0 红** | `raw/g3-verify-suite.txt` |
| 分目录复核 | Pi **264/264**、Claude **32/32**、Codex **33/33**、runtime-core 104/104、桌面应用 **354/354**、编排 300/300、门禁 183/182/0/1（唯一 skip＝既有 Windows 专用）；`test/测试` 全区 **320/320**（= 既有 270 + 本批 50 个 node 用例；Electron 探针另计） | `raw/per-dir-counts.txt` |

- **声明项复跑全数命中**（`raw/declared-suites-rerun.txt`）：Pi 两文件 **32/32**（24+8）、Claude 目录 **32/32**、Codex 目录 **33/33**、桌面 `tool-rows.test.ts`＋`renderer.test.ts` **71/71**（18+53）——与各实施记录自报逐位一致。
- **声明 e2e 复跑**：`ANS_TOOLFOLD_UI_ONLY=1 ANS_UIUX_OUTDIR=/private/tmp/ans-g3-toolfold node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs` → **TOOLFOLD_UI_PASS 19**（exit 0），与折叠记录自报一致（`raw/toolfold-declared-e2e.txt`＋全量 `raw/toolfold-declared-e2e-report.json`）。
- **声明 Claude loopback probe 复跑**：`node test/claude-adapter/web-search-loopback.probe.ts` → **exit 0**（真实 bundled CLI 2.1.299＋127.0.0.1 假 Messages、假凭据、零外部调用；`raw/claude-websearch-loopback-probe.txt` 全量 JSON 归档）。复跑亲见关键事实：PreToolUse 对内置 WebSearch **实分发**恰 1 次（decision=allow、updatedInput=false）；侧查询声明 `web_search_20250305 max_uses:8、tool_choice 指向、无 web-search beta 头`；主轮不带声明；400 相位 `is_error` 如实且 `controlSettled=completed`；`externalApiCalls: 0`、`credentials: fake-only`。
- **我自建 Electron 折叠探针复跑**：`G3_FOLD_PROBE_PASS 16 /private/tmp/ans-g3-fold-probe2`（exit 0；`raw/independent-fold-probe-report.json`＋证据目录截图 3 张）。
- 1 skip 归属＝既有 Windows 专用用例（`规范化：Windows 大小写不敏感（仅 win32）`），与既往一致（darwin 本机）。

## ③ 范围审计（批准口径逐条；未批准项零实施）

| # | 口径 | 独立核实 | 结论 |
|---|---|---|---|
| ① | 默认关＋`ANS_PI_SERVER_TOOLS`/`ANS_CLAUDE_WEB_SEARCH`/`ANS_CODEX_WEB_SEARCH` | 三开关缺省/空/关闭值全关（行为实证＋全链零声明）；三个 env 名在全仓仅存在于对应适配器源码（`grep` 点查：`app/`、`src/common/shared`、`src/service` 零命中）；`runtime-settings.ts` **无**设置项元数据（设置面板字段＝期 2 未做） | ✅ |
| ② | 首批工具集 | Pi 注册表恰 `web_search_20250305`＋`web_fetch_20250910`、`code_execution` 未列入（配置即「未知 id」抛错）；Claude 仅升 `WebSearch`（源码零 `WebFetch`/`code_execution`）；Codex 仅顶层 `web_search="live"` 键（无 `tools.web_search` 键） | ✅ |
| ③ | 查询串不进诊断落盘（会话内可见） | Pi loopback spy 全量断言：诊断落盘文件逐字节不含查询串/标题/加密诱饵/URL 参数；`server_tool.*` 诊断记录点字段面全在共享白名单内（源码键提取审计）；聊天流行**确有**查询与标题（会话内可见的另一面同刻断言） | ✅ |
| ④ | 不认声明如实失败、不毁轮次；V1 无自动剥离重试 | Pi：400 降级链实测（本轮 failed 既有口径＋降级行恰一次＋此后含第 2 轮零声明且正常完成）；全仓 src 零 `agent_before_settle`/`suppressNext`；Claude：is_error 如实 denied 且 settled completed；Codex：error 通知 ⇒ 轮次如实 failed 且会话不隔离 | ✅ |
| ⑤ | 行样式与工具行/折叠口径合流 | Pi/Claude 行经既有 `projectToolEvent`（native-start/result 同形状）；Codex message 行＋`detail.source:"web-search"`；`app/renderer/**` 三文件对 `web_search`/`WebSearch`/`联网搜索`/`server_tool` **零引用**（合流即桌面零改动） | ✅ |
| ⑥ | live 探针由客户运行 | 本角色零真实网关请求（套件网络面=127.0.0.1＋in-process）；客户 Pi live 探针结果已由 PM 转达并归档（见 ⑥ 边界节引述；本角色不代跑） | ✅ |

**工具行折叠口径九项逐条**：轮结束才折叠（运行中不折叠——e2e 19 项＋我探针 S1/S4 实证）；展开逐条零丢失（S3：下标/相位/文本逐条全等）；摘要含工具构成＋未放行/失败标记（「本轮 N 个调用：a / b ×k · 含 X 条未放行 · 含 Y 条失败 · 含状态未记录」——单测 18 项＋探针 S2/S6）；**无计时器**（renderer 全文零 `setTimeout/setInterval` 调用＋settle 批尾挂点源码钉；行为面 settled 到达即折叠）；未放行相位并入同轮同 callId 组行且组不切断、独立未放行行直显不折叠（探针 S2/S6）；手动开合优先并在会话内保持（S4）；焦点在组内不自动收起（S5，我自加对抗）；无法关联例外维持断组＋独立行（S6）。**未批准项零实施**：无 `code_execution`、无设置面板字段、无自动剥离重试、产品默认关、渲染侧零搜索专属代码。

## ④ 对抗性核对（独立用例 50 例 / 5 文件＋Electron 探针 16 项 / 全绿）

| 域 | 文件 | 例数 | 结果 | 关键实证 |
|---|---|---|---|---|
| Pi 纯函数 | `pi-parse-verify.test.ts` | 18 | ✅ | 关闭值大小写/空白全变体；声明逐字形状；`WEB_SEARCH`/`code_execution`/空 id/`1:2` 抛错；`0x2`/`1e2` 宽容（备注④）；追加幂等（部分在场只补缺＋原引用透传）；`requestRejectionStatus` 边界（408/429/399/「API Error: 400」不在前缀/4 位数 `\b` 拒绝）；观察状态机两形状、错误码大写归一/未知码占位、usage 两来源去重、pause 每响应恰一次、未知停因、非对象事件零抛 |
| Pi 端到端 loopback | `pi-loopback-verify.test.ts` | 6 | ✅ | off/0 隔离（零声明/零诊断/零工具行）；构造期抛错先于网络（loopback 零请求）；开启成功往返（声明尾部、恰对、URL query 剥、**加密诱饵事件＋诊断双缺席**、诊断白名单键审计）；自选 `unavailable` 错误变体 denied 且轮次 completed；跨轮配对（turnId 归属、id 不串、结果文本互不渗透）；400 降级链（降级恰一次、响应体零落盘、第 2 轮零声明正常完成） |
| Claude 适配器 | `claude-websearch-verify.test.ts` | 6 | ✅ | 隔离（4 关闭值 `tools=[]`＋hook 仍 deny＋帧零消费）；开启（恰 `["WebSearch"]`＋canUseTool 仍 deny）；放行分支**恰** `{hookEventName,permissionDecision:"allow"}`（无 updatedInput——deepEqual 全等）＋伪造名/mcp_server/未绑定/跨轮延后/中止信号皆 deny＋unattributed 诊断；ANS 工具分支不回退（updatedInput 令牌＋真实执行）；泵配对（恰对、同轮 id 关联、text/unsupported 归一、400 is_error 如实且 settled completed、查询串不进 message 行）；跨轮未配对收尾（迟到结果不跨界补配） |
| Codex 适配器 | `codex-websearch-verify.test.ts` | 7 | ✅ | 能力位白名单（`ON`/`yes`/`1`/`live` 显式抛错）；三钉默认关逐字节＋开会只翻该值＋回读双向 fail-closed；`webSearchRow` 白名单逐字全等（snippet/status/extra 不携带、queries 混合类型整体不投影、21→20＋显式截断标记）；自建 fake engine 全链（disabled/live 覆盖＋线程双落＋**turn/start 沙箱保持 readOnly+networkAccess:false**；item→行＋逐轮 searchCalls〔1→2〕＋不隔离；零搜索轮无 searchCalls 键＋item/started 不接；回读不符关停 engine；error 通知轮次如实 failed＋会话续用；凭据/URL query 脱敏） |
| 范围审计＋折叠单测 | `scope-audit-and-fold.test.ts` | 13 | ✅ | 口径 ①-⑥ 源码级审计（含诊断字段白名单键提取、handler 在启用判据内、零计时器、默认态三判据/手动优先/焦点守卫/文案模板/相位并入判据逐钉）；callSummary 对抗（turnId 参与身份、终态取名/回退、denied 优先、timed-out 并入 failed、exited-nonzero 中性、×k 仅 k>1、非数组容忍） |
| 折叠 Electron 探针（独立） | `fold-probe.mjs` | 16 项 | ✅ | 运行中不折叠＋摘要口径；未放行并入不切断＋独立行直显；settled 折叠＋展开零丢失；手动开收优先（运行中与 settled 后）；**焦点在组内 settle 不自动收起**（我自加）；失败标记＋无 callId 断组；截图 3 张 |

## ⑤ 契约与关键行为核对（含零泄漏 spy）

- **零泄漏（口径③）全量 spy**：loopback 成功往返的**全部 SessionEvent JSON＋诊断落盘全文**对查询串/结果标题/`encrypted_content` 诱饵/URL 秘密参数四类标记逐字节断言缺席；同时断言查询与首条标题**确实**出现在显示结果文本（会话内可见的另一半）；诊断 `server_tool.*` 行键集合 ⊆ 共享白名单（`turnId/toolName/toolCallId/count/state/errorCode/reasonCode/ok`）。
- **配对口径**：Pi 每调用恰一对（block id 关联；两轮 turnId 各自归属）；Claude `toolCallId=turnId:tool_use_id` 同轮成对、跨轮不串、迟到结果不跨界；Codex 同轮行同 turnId、逐轮计数。
- **降级链**：400／500 类状码判定来自 SDK 错误消息**前缀**（不读正文；`408/429` 排除已钉）——实测 400 请求恰 1 个带声明、降级行恰一次、后续零声明；**未见任何自动剥离重试实现**（路径 A 未实施被源码钉死）。
- **权限面（Claude）**：放行分支返回对象**逐键全等**证明不注入 `updatedInput`（模型原文 query 不改写）；`canUseTool` 拒一切兜底不动；伪造四类对抗全 deny；`ANS` 工具分支不受影响。
- **冻结版本 vs 工作树在飞**：验证期间工作树新出现他方在飞文件（Pi live 探针结果归档等，见边界节），**均不在** G-3/折叠两批冻结集内；冻结集 47/47 两次逐字节一致，结论仅绑定该版本。

## ⑥ 备注/缺陷候选与留白（如实登记；均不影响判定）

1. **缺陷候选（呈现面质量，非本批改动面；建议 PM 路由）**：`cleanPatterns`（`src/common/runtime-core/tool-display.ts`，本批**未改**）的 URL 清洗 `https?://[^\s<>"']+` 为**贪婪匹配**且排除集不含全角「；」——Pi 搜索结果行以「；」连接多条目、URL 后无 ASCII 空白时，**第 2 条起的标题被整段吞掉**并以归一 URL 替换。最小复现（原始输入/输出逐字）＝`raw/cleanpatterns-url-greedy-repro.txt`（如 `…独立标题-ALPHA — https://…/entry?token=…；独立标题-BETA — …` → `…独立标题-ALPHA — https://…/entry — …`）。属性：**丢文本、不泄文本**（`new URL` 归一 + 剥离）；本地浏览器可见行即如此，真实用户会看到「2 条结果:但只见 1 个标题」。本批实施记录未覆盖该交互（其 T3 只断首标题）；我已在 loopback 用例中以注释＋断言如实钉住现状。修复方向（供属主权衡，本角色不修）：Pi 观察者连接符改带空格（`；` → `; `）或运行时核心收窄匹配（把全角标点并入排除集）。
2. **备注（解析宽容面）**：`max_uses` 经 `Number()` 解析，`0x2`/`1e2`/前后空白会被宽容接受（值仍是正整数，声明形状不变）——「非法值抛错」的字面口径在非十进制字面量上放行；已入用例注释。
3. **备注（注释措辞）**：`server-tools.ts` 模块注释称 env 解析「大小写/空白不敏感」，实际仅关闭值不敏感；**id 匹配区分大小写**（`WEB_SEARCH` ⇒ 「未知 id」抛错）。行为在 fail-closed 安全侧（宁抛不错开），仅注释易误导。
4. **备注（记账窄边界已钉）**：若网关在 `message_start` 回传 `web_search_requests:0` 且响应内确有调用块、后续无 usage 回传，`from-blocks` 兜底被 0 条目抑制（该次调用不计）。面窄（正常网关在 `message_delta` 给最终计数）；仅记账、无行为/泄漏影响；已入对抗用例。
5. **留白（如实，不声称）**：① **Claude/Codex 客户 live 探针未跑**（口径⑥由客户运行；本次只复跑了声明中的 Claude 本地 loopback probe）；Pi 侧客户 live 探针已运行并归档于他角色文档（见下）；② 真机端到端（真模型/真网关的桌面全链观感）未做——按 PM 安排属后续轮；③ Windows 未动态验证（darwin 本机）；④ Claude 实施记录登记的 `dispose()` 临时目录 `ENOTEMPTY` 竞态（≈2/36）本轮复跑**未见**（不否定其存在）。
6. **客户 live 事实引述（非本角色工作，供口径对读）**：`角色卡/Pi适配器/docs/fix/2026-10-16_probe_server-side-tools-live-results.md`（客户实跑、PM 转达、属主归档）——`web_search_20250305` 网关 200 真实执行；`web_fetch_20250910`/`code_execution_20250825` 本网关 500 `unknown variant`（前者保留于注册表＋记配置指引「本网关只配 web_search」，后者维持缓）；`max_uses` 本网关未见强制（理解为请求意图）；两轮复放 round2 500 经属主判定为**探针构造产物**、剥离转录接受度仍待探针修复后补验（方案 P 条件性评估，未启动）。上述均属批准口径⑥的客户验证面，**不改变**本批「通过」判定。

## ⑦ 证据索引（均为原始输出）

- 冻结：`raw/sha256-freeze-begin.txt`｜`raw/sha256-freeze-end.txt`（两次 diff 空＝47/47 逐字节一致）｜`raw/g3-verify-harness-sha256.txt`（我方 6 文件指纹）｜`raw/batch-file-list.txt`（两批工作树文件清单）
- 环境：`raw/environment.txt`（HEAD/ node / 平台 / 时刻）
- 全量：`raw/full-suite-frozen-only.txt`（1723/1722/0/1）｜`raw/full-suite-with-g3-verify.txt`（1773/1772/0/1）｜`raw/per-dir-counts.txt`（七目录逐位对账）｜`raw/declared-suites-rerun.txt`（声明专项复跑）
- typecheck：`raw/typecheck.txt`（0 错）
- 本批独立用例：`raw/g3-verify-suite.txt`（50/50）
- e2e/探针：`raw/toolfold-declared-e2e.txt`＋`raw/toolfold-declared-e2e-report.json`（TOOLFOLD 19）｜`raw/claude-websearch-loopback-probe.txt`（Claude loopback probe 全量 JSON）｜`raw/independent-fold-probe-report.json`＋证据目录截图 `fold-probe-{1,2,3}.png`（自建折叠探针 16/16）
- 缺陷候选复现：`raw/cleanpatterns-url-greedy-repro.txt`
- 批准/规格依据：`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §G-3＋§伴随项；三适配器提案/实施记录；`角色卡/桌面UI/docs/fix/2026-10-16_fix_toolrow-turn-collapse.md`

---

**签署**：测试角色（独立验证上下文，2026-10-16）。本报告只证明「测过的场景通过」，不代替客户的业务确认与 live 探针结论；未做的真机 E2E/未验边界按上表留白如实交付。
