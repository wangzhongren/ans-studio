---
id: g5-reasoning-independent-verification
type: change
title: G-5（推理与推理强度）——独立验证报告
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: verified
related: [kanban-fixes-pm-review, reasoning-and-effort, reasoning-and-effort-assessment, g4v2-mcp-install-independent-verification]
events:
  - date: "2026-10-16"
    kind: verified
    summary: 测试角色独立验证：G-5（推理与推理强度）全链——契约与归一、事实通道与投影单点、Claude/Codex/Pi 三适配器接线与降级、设置链、桌面渲染与回放载体、范围审计——**整体通过（0 不通过、6 备注）**；自建 65 例全绿；G-5 改动面 33 条目冻结绑定开工/收工逐字节一致（两次复算）；全量 2112/2111/0红/1skip（＝基线 2047/2046/0/1＋本批 65）＋typecheck 0
---

# G-5（推理与推理强度）——独立验证报告

**结论：整体通过（0 不通过、6 备注）。** 独立自建 65 例全绿（`test/测试/g5-reasoning-verify/`，8 个测试文件＋1 个自建夹具，不复用实施方断言）；G-5 改动面冻结绑定 33 条目开工/收工逐字节一致（两次复算）；全量 `node --test "test/**/*.test.ts"` **2112 计 / 2111 过 / 0 红 / 1 skip**（＝基线 2047/2046/0/1 ＋ 本批 65；1 skip＝既有「仅 Windows」项 `test/门禁引擎/resolve-write.test.ts:173` 邻域 `规范化：Windows 大小写不敏感`）；`npm run typecheck` 0 错。批准口径逐项对照：档位六档（默认/关/低/中/高/极高）✅、未设＝逐字现状 ✅、每平台一字段 ✅、折叠行「已思考 N 秒 ▸」（默认折叠含运行中）✅、新会话生效 ✅、降级＝网关拒恰一次去参数重发＋如实一行 ✅、计费如实（help 文案「思考计入输出 tokens」在位）✅。

方法：对抗性独立构造、逐项取证（自建夹具＝真 Service 装配捕获工厂＋自建假 Claude SDK/假 Codex 引擎/loopback 假网关驱动真实 Pi SDK＋真 tool-rows.js 纯函数执行＋真 getSessionHistory 回放驱动），只写 `test/测试/**` 与 `角色卡/测试/**`；未改任何产品文件与探针；未 git 提交；**零真实网关请求**（仅 127.0.0.1 loopback）。

---

## 一、结论逐项（A–J）

| 域 | 结论 | 要点 |
| --- | --- | --- |
| A. 契约与归一 | ✅ | 五值冻结（恰 off/low/medium/high/xhigh、顺序＝档位梯、本体 Object.freeze——push/索引写抛 TypeError）；未设＝字段缺席（`"reasoningEffort" in options` 判据，Service 面实证）；三态归一全分支（未设 9 形静默 unset；合法大小写/trim 15 形规范小写；非法 13 类含 minimal/max/ultra/中文/数字/布尔/组合/全角/emoji 一律 invalid 绝不猜档）；invalid.raw trim＋64 截断（恰 64 不截）；三 env 键逐字（`ANS_CLAUDE/CODEX/PI_REASONING_EFFORT`）＋跨键不串＋demo 恒缺席；**非法⇒按未设（字段缺席）＋诊断 `reasoning.effort.invalid`（mode/supported:false/invalid-value）＋会话照开照跑，绝不毁会话**；重建（新适配器＝新会话）重读当刻 env——改设置下次会话生效 |
| B. 事实通道与投影单点 | ✅ | 单点投影形状恰等（version/source/DisplayTextV1）；脱敏（凭据真值/api_key/Bearer/URL userinfo 剥离，redacted 标记如实）＋16384 B UTF-8 边界预算（原文前缀、无半截字符）；`omitted`⇒正文恒空（raw/投影形违规带正文一律清空、标记清白，时长不丢）；`durationMs` 防伪矩阵（0/0.5 透传；负/NaN/±Infinity/串/布尔/对象一律**键缺席**）；**随载荷 summary 绝不外流**（live/持久化全事件面零泄漏）＋**summary 定格**（投影成功「已思考」/失败「推理内容无法安全显示」）；重复投影幂等（截断/脱敏/omitted 三形态 project(project(x))≡project(x)；存量投影形再投影形状不变——历史路实证）；坏件 13 类绝不抛⇒诊断形 PROJECTION_FAILED；**emit 与历史两路同单点**（同输入三路 deepEqual：live≡历史≡单点直调；盘面 detail≡队列 detail 逐字）；违规/坏件经单点归一（omitted 清空、诊断行 summary 定格） |
| C. Claude 接线 | ✅ | 映射：未设零参数（无 thinking/effort 键）；off⇒`{type:'disabled'}`；low/medium/high/xhigh⇒effort 直通；`max` 越界值不收编（零参数）；捕获：thinking 正文⇒complete 原始事实（**不预脱敏**——凭据逐字交给单点）、空串/redacted_thinking⇒omitted、**durationMs 恒不携带**、text 行零改动；降级：4xx＋词元（thinking/effort/output_config）共现才识别；负例双向（5xx 带词元不识别/4xx 无词元不识别/非 API Error 不识别/未设会话同文案不降级）全实证；**会话级恰一次**（重发再拒不第三次重建）；**同输入原地重推**（同 uuid＋同 message 含 `[ANS_INPUT_CONTEXT]` 前缀逐字）；此后零参数（含 off 档）；失败尝试不产 settled（settled 单点） |
| D. Codex 接线 | ✅ | settings 五值校验：越界（max/minimal/none/大小写/数字/空串/布尔）**装配前抛错且 engineFactory 从未调用（零副作用）**；单条 `-c model_reasoning_effort="<值>"`（恰一条、独立顶层标量、不与 mcp_servers 同条）；未设/off 零注入；off 如实文案逐字（「无「关」档…推理未关闭」，构造期会话级恰一行、turnId 缺席）；reasoning 事件：完成态恰一行；content 优先/仅摘要回退/全空与仅空串⇒omitted/非串项过滤/坏形状 content 安全回退；durationMs **仅 started+completed 双信号**（仅完成信号/NaN 起点不携带、倒序 clamp 0）；增量帧零行不误报；错轮帧（threadId/turnId 不符）丢弃；不进隔离；降级闸：首请求被拒（产出前）恰一次去参数重建重发（同输入逐字、其余 -c 覆盖不变）＋本轮继续；负例四格（重发再拒/无锚/已产出（含**仅增量帧**对抗增强）/未注入）+跨轮闸已关（会话级恰一次） |
| E. Pi 接线 | ✅ | off 前置修复：克隆模型 `thinkingLevelMap.off` null→undefined（xhigh 原样），clamp 真返回 off；**修复前对照＝minimal 假关闭**（对同构模型实证）；wire 层 off⇒`{type:"disabled"}`＋interleaved beta 头消失、生效档位 off（非 minimal）；未设＝**零 setThinkingLevel 调用**（medium 隐式原样、零 ans-reasoning 扩展）＋显式 medium 恰一次调用（对照）；R1 修复（**自证网关**：非法组合必 400）：cw=5000⇒转 disabled、cw=5700⇒预算钳入 [1024,max_tokens)、cw=9000⇒SDK 自合法（无需修复）——三窗全 200 放行、修复诊断逐窗如实（thinking-disabled/budget-clamped）；**未设路径逐字现状**（同一严格网关下 wire 原样 enabled、如实失败、零修复诊断——修复只属显式设档会话）；捕获（raw 事实形态、正文逐字、thinking_start/end 真实信号时长、thinking 行先于 text 行、text 行零改动、redacted⇒omitted；extractReasoningFacts 坏形状 8 类不抛）；降级：400⇒恰一次去参数重发成功（**通知行先于 settled＝终态前消费**、settled 每轮恰一、次轮零参数）；不二次（带/不带均 400⇒首轮恰 2、次轮 1、通知与诊断各一）；429 排除窗零降级；**中断守卫**（stub 接缝：轮次被锁定⇒连消费询问都短路、零重发） |
| F. 设置链 | ✅ | 注册表三字段：键＝冻结 env 键逐字、label「推理强度」、可选非机密、**choices 值域与冻结五值单一来源**（claude/pi 全五值、codex 无 off）；help 三平台逐字统一（含「留空＝维持平台默认」「关/低/中/高/极高」「**思考计入输出 tokens**」——计费如实在位）；保存链：choices 拒（ok:false、**零落盘**、错误**不回显提交值原文**、错误列出值域；值域按运行时——codex 拒 off/claude 收 off）；trim 规范形写盘（非规范大小写如实拒）；空串/纯空白清除合法（回落 default 态）；**批量原子**（同批含非法⇒整批拒绝、合法键也不落盘）；未知键静默过滤现状不动；URL/类型校验现状回归钉不动；读取链 choices 透传＋来源四态如实；pi-config 与注册表**逐键对齐**（漂移守卫现值）＋旧面板路径无值域校验**如实现状**（单一来源、不复制第二份判定） |
| G. 桌面渲染 | ✅ | 折叠行文案四态（**真实执行 tool-rows.js**）：complete＋时长⇒「已思考 N 秒」（四舍五入、**下限 1**：400ms/0ms/999ms 皆「1 秒」）；无时长⇒「推理内容」；omitted⇒「已思考（内容由平台省略）」/带真实时长并存；非法 durationMs 按无信号；可展开性仅 complete 且正文非空（omitted/空正文/坏形不摆空展开器）；choices⇒select 控件（首项**留空（平台默认）**＝未设态、值域即 esc 选项、**域外现值如实附选项**、自由文本字段逐字现状、select 分支无机密按钮）；折叠行：实时/回放**同一 appendReasoningFromDetail**（恰一份实现）、默认折叠（初始 open 仅手动态、**零自动置开**＝含运行中）、esc 纯文本零丢失（label/text/flags 全 esc＋pre-wrap）、独立成行不进工具组（kind:"reasoning"）、诊断形如实一行；**回放载体**（真驱动 getSessionHistory）：投影形逐字透传（幂等）、原始形态过读取侧单点归一、坏件⇒诊断不携带（回落既有文本行）、旧数据零影响；实时/回放形状同解 |
| H. 范围审计 | ✅ | 探针纯本地（**动态枚举**不点名引用：G-5 探针 URL 字面量仅 127.0.0.1、listen 绑定 loopback、公共主机名零出现——与既有零引用钉兼容）；env 键读取面单点（三键只出现在定义/注册表/面板/模型注释四处，**适配器零直读**——纯消费纪律）；归一模块零网络零 IO（仅类型级依赖）；渲染/桌面 G-5 面零 fetch/XHR/WebSocket；未设＝逐字现状三平台对照组全绿（C1/D2/E2/E4）；「关」如实三方（Claude disabled 实发、Codex 不假装＋如实一行、Pi 修复后真 disabled）；计费文案在位（F2）；旧「已思考」回落路径保留（G5 ③④——坏件/旧数据走既有文本行） |
| I. 冻结绑定 | ✅ | G-5 改动面 **33 条目** sha256 开工（22:43）/收工逐字节一致（两次复算，`diff` 为空）——清单＝`git status` G-5 面全量：model/runtime、runtime-core/reasoning（新增）、tool-display、service/runtime、runtime-settings、三适配器 6 文件（Claude session；Codex session/config/protocol；Pi real-adapter/lifecycle）、app/desktop 4 文件（runtime-config/pi-config/session-history/runtime-history）、app/renderer 3 文件（renderer.js/tool-rows.js/styles.css）＋对应测试与探针 13 件。见 §四 |
| J. 全量 | ✅ | `node --test "test/**/*.test.ts"` → **2112 计 / 2111 过 / 0 红 / 1 skip**（基线 2047/2046/0/1＋本批 65）；见证性复跑两次（终态一致；中途一次暴露的旧钉交互见备注 1）；`npm run typecheck` **0 错**（含本批 9 文件） |

---

## 二、范围审计明细

1. **未设＝逐字现状（硬口径）**：三平台对照组各自独立实证——Claude `queryOptions` 零 thinking/effort 键（C1）；Codex `configOverrides` 零 `model_reasoning_effort`（D2）＋未设会话零 reasoning-effort 如实行（D2b）；Pi 零 `setThinkingLevel` 调用＋零 ans-reasoning 扩展装载（E2）＋未设路径在严格自证网关上 wire 原样（E4）。Service 面：未设/非法皆**字段缺席**（B11）。四态无偷跑。
2. **无真实网关调用面**：两个 G-5 探针全部 URL 字面量仅 `http://127.0.0.1:`（`probe-url-hosts.txt`），listen 绑定 loopback；归一模块无 URL/无 IO import；渲染/桌面 G-5 面零网络原语；本批全部 65 例离线（回环或纯内存）。实施方探针（`reasoning-loopback.probe.ts`/`reasoning-wire.probe.ts`）同口径纯本地。
3. **「关」如实三方**：Claude off⇒SDK `thinking:{type:'disabled'}` 实发（C1）；Codex 无该档——零注入＋「未注入推理强度参数（维持平台默认，**推理未关闭**）」如实一行（D2b）；Pi 修复后**真 disabled**（wire＋生效档位双重实证，且修复前假关闭（钳 minimal）被单元级对照实锤消除）（E1/E2）。
4. **计费如实**：三平台 help 逐字含「思考计入输出 tokens」（F2）；Codex 目录面提示语登记于评估件，未在面板冒充。
5. **探针纯本地**：见第 2 条；H1 以动态枚举（分片拼接扩展名）覆盖 G-5 探针，与既有「零引用钉」（`test/测试/g4-skill-verify/h-scope-audit.test.ts` 范围⑥）兼容（备注 1）。
6. **旧「已思考」回落路径保留**：回放坏件/旧数据行下落为既有 assistant 文本行（G5）；渲染侧无吞行/改文案的其它路径（G4 结构钉）。
7. **降级链纪律**：全部「恰一次」由行为实证（Claude C3/C3c、Codex D4/D4b/D4c、Pi E6/E6b/E6d），无循环重试；诊断单点各恰一条。

---

## 三、用例计数与关键对抗

- **本批自建**：`test/测试/g5-reasoning-verify/`（8 测试文件＋`helpers.ts` 夹具），**65 例全绿**：A 契约与归一 10、B 投影单点＋Service 两路＋注入 14、C Claude 5、D Codex 8、E Pi 10、F 设置链 8、G 桌面 5、H 范围审计 5。日志 `g5-verify-dir.log`。
- **关键对抗（区别于实施方用例的独立构造）**：Service 注入四态捕获（B11/B11b——实施方无 Service env→options 注入面用例）；live/持久化/历史三路同形 deepEqual（B8c/B9/B10）；Claude 越界 `max` 零参数、未设会话同文案不降级、重发再拒无第三次（C1/C3b/C3c）；Codex 仅增量帧计作已产出⇒不降级、429 排除、错轮帧丢弃、非串摘要过滤、倒序时间 clamp 0、`"High"` 大小写越界抛（D1/D3/D4b）；Pi cw=9000 第三窗＋自证网关（E3）、未设路径在同一严格网关下的逐字现状（E4）、**中断守卫**与 429 排除窗（E6c/E6d）、`extractReasoningFacts` 非串正文/缺字段边界（E5b）；设置批量原子拒绝与批内合法键不落盘、大写字样不回显（F4/F6）；tool-rows 纯函数下限 1 与三态防伪矩阵（G1/G2）、回放载体坏件回落（G5）。
- **全量证据**：基线（改动前）2047/2046/0/1（`baseline-full-suite.log`）；本批后 2112/2111/0/1（`full-suite-after.log`）；typecheck 0（`typecheck-final.log`）。

### 备注（6 条，均非不通过）

1. **「零引用钉」与审计的交互（流程发现）**：本批 H1 初版以字面点名读取两枚 G-5 探针，触发既有钉（`test/测试/g4-skill-verify/h-scope-audit.test.ts` 范围⑥：「任何 `*.test.ts` 不得含 `.probe` 字面」——该钉的既定意图是「不得 import 探针」）。已按 G-4 V2 K3 的既定先例（**分片拼接扩展名＋动态枚举、不点名引用**，枚举面更宽＝更严）改写 H1；两钉并立全绿。**非产品缺陷**；供后续验证批次注意：在 `test/测试/**` 写审计须先兼容该钉。
2. **Pi R1 修复触发窗口（边界观察）**：cw=9000 窗下 SDK 自身产出的组合已合法（无修复、无修复诊断）——修复逻辑「需要才触发」，与设计一致；三窗实证的修复态恰两枚（thinking-disabled/budget-clamped）。
3. **Pi 429 排除窗的 SDK 层重试（观测）**：pi-ai `retryProviderRequest` 对 429 自身有有限重试且**重试请求原样携带思考参数**（非去参数重发——ANS 零降级判据成立：各请求均带 thinking、零通知、零诊断）。耗时约 14s 为 SDK 重试退避（fail-fast 头不透传其重试决策面），登记为观测。
4. **Codex 降级闸把 reasoning 增量帧计作「已产出」**（`outputSeen=true`）：保守方向（任何帧证据都关闸、宁不重发），与设计 §七「产出任何内容前」口径一致（增量即内容）；登记为口径注释。
5. **Service emit 的 summary 定格仅对 `kind==="message"` 生效**：三适配器均以 message 承载推理事实（本轮逐平台实证：C2/D3/E5 皆 kind message）；现状无越界面，登记为防线说明（若未来有其它 kind 承载，需补判）。
6. **Claude 降级判据的词元集与形态**：`API Error: 4\d\d` ＋ `thinking|effort|output_config`（大小写不敏感）——负例「network reset while streaming thinking」（无 API Error 前缀）不识别，实证保守；词元集为探针 A2 定格口径，登记。

### 未验边界（如实）

- **真实网关（B 列探针）**：Claude/Pi 网关接受性、Codex `reasoning.effort` 落点——禁真实网关约束，全部 loopback/离线；归客户 B 列探针与真机轮。
- **Electron 真机渲染 e2e（DOM 行为）**：G 域钉「结构不变式＋纯函数真实执行＋回放数据通道真驱动」；点击展开/焦点保护/阅读锚点等 DOM 交互行为归既有 Electron e2e 面（本轮未扩夹具）。
- **Claude 真 CLI（2.1.299）wire 级行为**：本轮以自建假 SDK 直驱适配器验证逻辑分支（含 UserPromptSubmit 关联、双引擎重建）；CLI 级证据为实施方探针文件（`reasoning-loopback.probe.ts`，loopback）。
- **Codex 降级闸 `!turn.controller.signal.aborted` 竞态窗**：未构造确定性用例（`outcome==="failed"` 已排除常规 aborted 路径；该守卫为「错误到达与中止竞争」的防御窗，读码确认语义）。
- **Pi R1 更细窗口**（如 max_tokens∈(1024,2048) 的连续区间）未穷举：覆盖 cw=5000/5700/9000 三窗＋两修复态。
- **Windows 平台路径**（大小写/行尾）未在本机演练（darwin 平台）。

---

## 四、冻结绑定（G-5 改动面 33 条目，开工＝收工逐字节一致）

开工（`freeze-start.sha256`，22:43）与收工（`freeze-end.sha256`，两次复算）`diff` 为空。清单＝工作树 `git status` 的 G-5 面全量（代码/桌面/渲染＋对应测试与探针 13 件）。

| 文件 | sha256 |
| --- | --- |
| src/model/runtime.ts | 1a2f0935b93609f3ff91b9de01eecf388fea7a6720dcfd121255f863025712b8 |
| src/common/runtime-core/reasoning.ts | e729dbe27ed4c264c47fed3415f9b19d2451c1d989f8db268a3c08eabbb1ad77 |
| src/common/runtime-core/tool-display.ts | 604ba0a283539bc28bf7c044ab32b43a566b0265208a6ced43bcfb7b5c5e1fdb |
| src/service/runtime/session.ts | d83909d94c59de730dd558cd3b64fcf984ae700b2146643e3998c7fd1eb7c087 |
| src/common/shared/runtime-settings.ts | 2f8ddf02b902dbdd3f3deef1be6a9684ddbcfeff1741876dadef015489f7628f |
| src/common/codex-adapter/config.ts | 4194d3f430e0563c99befa70f887c785994554a5b6651980076b3a712f2347e7 |
| src/common/codex-adapter/protocol.ts | c1ec9ce94aa38b7a619cc670b932e3462beca9c463a32b8026396065392612a9 |
| src/common/pi-adapter/lifecycle.ts | 6455350693a6656dc7c1481d285f72645e434cf58925f4d0b4b38d733ce50a6d |
| src/common/pi-adapter/real-adapter.ts | ad582763a0ff0faedbb2387cad2258d6873cd940430f691e26c8d68a2d4cfea5 |
| src/provider/claude/session.ts | 846e96311415798b7fbe30f16ecdc663d983e58471838d3eff85ad390ac79baa |
| src/provider/codex/session.ts | 8328ed6c5ada770f5f728a1ab081f96e4cc96a0b6880c77035269c7cc09f0c31 |
| app/desktop/runtime-config.ts | 76e8619f98ea799d725628addbb19970f48474d423369a3e234c45944ffe45e6 |
| app/desktop/pi-config.ts | 90d5526440198fae10ffe331fe7bc6cfa7fe60f42c068bcdd3e3daa1cd502cdb |
| app/desktop/session-history.ts | 6e6d054c77ec481815e64d7dbaa1b6ed2d1c166cdcdf092b58941058a9b8bb79 |
| app/desktop/runtime-history.ts | 19228a42c13eab2a4176e8b5c87609b139b6752fac615d57fc84cc48d702ab46 |
| app/renderer/renderer.js | 7d18858b9ed17e52f7c1d2c621021372b41646d8137914e340a29c0fc42567e5 |
| app/renderer/tool-rows.js | a116119edb455d69251b097b4d79309e6154f398f0bc717b9dedd89496c14d41 |
| app/renderer/styles.css | 6029a281460bf8906c1686dcbed26a1e7b7cac418e54dced5e7b3382564d9744 |
| test/claude-adapter/session.test.ts | 30a2a1c6bdc2a51146d1c42652584bb31730e95b0d28684c65d3b41ceb5b71a6 |
| test/claude-adapter/reasoning-loopback.probe.ts | c1b8db276cfa39a52537bbcf645a1f29c2643a5b7f02bebf63109b810bebc4cd |
| test/codex-adapter/fixtures.ts | bd1663efca4f3a1f812fd80cdbb443c4e100237b98f1a1e30ecef7075aa3f7ac |
| test/codex-adapter/reasoning.test.ts | 7f745a6312fa9ef31e2170bb90b65d17efb19ba597d0bf2a13493de2345a2937 |
| test/runtime-core/reasoning-effort.test.ts | 738f80a7aa7103b10ae501a3a2e5ced0319ff45690ca385a6bdf5541d7d6b42b |
| test/runtime-core/reasoning-facts.test.ts | 1cac69324f02280c1247f4e7ea3e25d2ea9791ec6ac60ffc6fa896a8a7128277 |
| test/pi-adapter/reasoning-effort.test.ts | 083ee7013b99776b254072a20de932203f02997cea3ef07bc3b36a5a7ec0067f |
| test/pi-adapter/reasoning-wire.probe.ts | 6985a6d9d96369f11ca42afdd9a3a8e7ba79fa3cb75c3ea594e10a22f2161b5f |
| test/桌面应用/multi-runtime.test.ts | eb0342b23d75131ff20a905568712d640d6c5da2a40793d33441299317026be2 |
| test/桌面应用/pi-config.test.ts | 9e52002c994fb2d92c4b5be693fe779b24ebe4aabe813436f7f14ec4512c8ff8 |
| test/桌面应用/renderer.test.ts | 6d164c91675b1c0add834fac87dd1b41d3649216c2860d4cefb456f9659ce24b |
| test/桌面应用/tool-rows.test.ts | fbca614374ee72711df4e5f7edbd3ff43e347e1e05af5adad9ef537b050485aa |
| test/测试/t29-pi-config-roundtrip.test.ts | 4e93c9928dcb23917839029b258c9a6d76535e61ecfcde39b34bcc9875c877df |
| test/测试/ui-reacceptance-renderer-regression.mjs | ceaa8bda84c4fbbdcac4acdaa44bc9dc3de6930b611fa28ffdf240848ac1f534 |
| test/项目管理/shared/runtime-settings.test.ts | 2a8d949abf3a533c38e1b56a7415c4f1d4ba48459d97d947ef43bbd60b7c4db2 |

---

## 五、证据索引

目录 `角色卡/测试/docs/change/2026-10-16-g5-verification-evidence/`：

- `baseline-full-suite.log`——基线（改动前）全量 2047/2046/0/1；
- `freeze-start.sha256` / `freeze-end.sha256`——G-5 改动面 33 条目开工/收工（`diff` 为空，收工两次复算）；
- `g5-verify-dir.log`——本批自建 65/65 全绿（8 文件逐例）；
- `full-suite-after.log`——本批后全量 2112/2111/0/1；
- `typecheck.log` / `typecheck-final.log`——`tsc --noEmit` 0 错（初/终两跑）；
- `probe-url-hosts.txt`——G-5 探针 URL 主机字面量清点（仅 `http://127.0.0.1:`）。

本报告为**独立验证记录**：未改任何产品文件与探针、未 git 提交、零真实网关请求。用例目录 `test/测试/g5-reasoning-verify/`（`a-contract`/`b-projection`/`c-claude`/`d-codex`/`e-pi`/`f-settings`/`g-desktop`/`h-scope-audit`＋`helpers.ts`）。相关导航见[测试角色备忘](../../memo.md)与 [G-4 V2 独立验证](2026-10-16_change_g4v2-mcp-install-independent-verification.md)。
