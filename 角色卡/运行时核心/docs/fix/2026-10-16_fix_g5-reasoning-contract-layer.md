---
id: core-g5-reasoning-contract-layer
type: fix
title: "G-5 wave 1：推理与推理强度契约层（ReasoningEffortV1 / Service env 归一注入 / 推理事实通道与投影单点）"
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [reasoning-and-effort-assessment, reasoning-and-effort, reasoning-effort-metadata]
---

# G-5 wave 1：推理与推理强度契约层（运行时核心实施记录）

**状态：已实施待验证（未部署）。** 依据：客户 2026-10-16「按推荐批准，开始实施」＝ G-5（推理与推理强度）；评估＝本角色 [三平台技术评估](2026-10-16_assess_reasoning-and-effort.md)（§五 请求面/§六 呈现面）、产品设计＝`角色卡/产品/docs/design/2026-10-16_design_reasoning-and-effort.md`。PM 派发：运行时核心＝ **wave 1 契约层**（冻结符号＋Service 接线＋事实通道形状）；**三平台适配器原生接线（wave 2）、桌面渲染/设置面板（wave 2/并行）、A 组探针（wave 2 各适配器）均不在本记录**。并行切片（已核）：项目管理「设置元数据」（`RUNTIME_SETTINGS` 三字段＋`choices?`，键名/choices 逐字与本波一致）。

## 冻结符号（逐名清单；`src/model/runtime.ts` 为**单一来源**）

| 符号 | 形状 |
|---|---|
| `ReasoningEffortV1` | `"off" \| "low" \| "medium" \| "high" \| "xhigh"`（PM 冻结恰五值；`xhigh`＝「极高」） |
| `RuntimeProviderOptions.reasoningEffort?` | `ReasoningEffortV1`；**未设（字段缺席）＝逐字现状**；适配器**纯消费**（三平台原生接线＝wave 2；各平台落点见字段注释冻结表） |
| `RuntimeReasoningFactsV1` | `{ text: string; status: "complete" \| "omitted"; durationMs?: number }`——适配器产出的**原始事实**（text 可能为空串；omitted＝平台省略正文；durationMs 仅真实信号） |
| `RuntimeReasoningEventDetailV1` | `{ version: 1; source: "reasoning"; reasoning: RuntimeReasoningFactsV1 }`——`kind:"message"` 事件的 `detail` 承载形 |
| `RuntimeReasoningDisplayDetailV1` | `{ version: 1; source: "reasoning"; reasoning: { text: DisplayTextV1; status: "complete"\|"omitted"; durationMs? } }`——**投影冻结点**（桌面渲染/回放消费的唯一形状） |
| `RuntimeReasoningDisplayDiagnosticDetailV1` | `{ version: 1; source: "reasoning-diagnostic"; code: "PROJECTION_FAILED" }`——投影失败如实诊断形 |
| `RuntimeReasoningDetailProjector` | `(detail, redactText?) => DisplayDetail \| DisplayDiagnosticDetail`——实现＝display context 的 **`projectReasoningDetail`**（核心投影单点） |
| 归一器（`src/common/runtime-core/reasoning.ts`，新增） | `REASONING_EFFORT_VALUES`（五值恰序）/ `REASONING_EFFORT_ENV_KEYS`（三键逐字）/ `isReasoningEffortV1`（规范形、大小写敏感）/ `normalizeReasoningEffortValue`（三态 `unset\|set\|invalid`）/ `resolveReasoningEffort(runtime, env?)` / `REASONING_EVENT_SUMMARY = "已思考"` / `REASONING_DIAGNOSTIC_SUMMARY = "推理内容无法安全显示"` |

## 事实通道形状（冻结点，逐字）

三段式（沿工具事件「事实 → 核心投影 → 呈现」纪律）：

1. **适配器只产事实**：`{kind:"message", summary:<任意>, detail:{version:1, source:"reasoning", reasoning: RuntimeReasoningFactsV1}}`——**不自行脱敏、不自行定型**；
2. **核心投影单点**（唯一入口）：Service 在 `emit`（实时与持久化同口）与历史读取（`readRuntimeSessionHistory`）对 `detail.source==="reasoning"` 恰一次调用 `provider.display.projectReasoningDetail`：
   - 正文过 `protectText`（凭据值替换 + cleanPatterns + UTF-8 字节预算，**与工具面同管道同预算＝16384 字节**；超限 `truncated:true`）；
   - `omitted` ⇒ 正文一律归一为空（违规随载荷带正文也不呈现——如实优先）；
   - `durationMs` 仅有限且 ≥0 时透传（0＝真实保留）；缺失/负数/NaN/Infinity/非数字一律丢弃——**绝不发明时间**；
   - `summary` 被**定格覆盖**为 `"已思考"`（承载语义全在 detail；随载荷 summary 绝不外流）；病理输入 ⇒ `"推理内容无法安全显示"` + 诊断 detail；
   - pump 并入的 `detail.turnId` 在投影后原样保留；**重复投影幂等**（历史读取对存量投影形再投影形状不变）；
3. **消费方只渲染**：桌面渲染/回放按 `detail.source` 分发（「已思考 N 秒 ▸」文案由消费方从 `status`/`durationMs` 合成——**有真实时长才显示秒数、平台省略内容时不假装**；文案终形归桌面UI，本层只冻数据面）。

**投影实现位置**：`src/common/runtime-core/tool-display.ts`（`createToolDisplayContext().projectReasoningDetail`）——与 `protectText`/凭据清单/清洁管道**同源**；坏件**绝不抛**（一律诊断形）；不依赖 profile 就绪（历史读路径无 profile；正文在 emit 时已全量脱敏，重投影＝同管道归一）。

## Claude effort 值集映射（按 sdk.d.ts 实据定格）＋三平台落点

依据 `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`：`EffortLevel = 'low'|'medium'|'high'|'xhigh'|'max'`（`:692`）；`Options.thinking?: ThinkingConfig`（`{type:'adaptive',display?}`｜`{type:'enabled',budgetTokens?,display?}`｜`{type:'disabled'}`，`:1901-1919`/`:9833-9852`）；`Options.effort?: EffortLevel`（同 `:1914-1919`）。**冻结映射表**（wave 2 各适配器逐字实施）：

| 中立值 | Claude | Codex | Pi |
| --- | --- | --- | --- |
| **未设（字段缺席）** | 零参数（逐字现状） | 零参数（逐字现状） | 零参数（现状＝SDK 缺省 thinkingLevel=medium 隐式路径原样保留——**不调用** `setThinkingLevel`） |
| `off` | `queryOptions.thinking:{type:'disabled'}` | **平台无「关」档**——不注入 `model_reasoning_effort`（零参数）＋如实说明（不假装关闭） | `setThinkingLevel("off")`（**前置**修 `thinkingLevelMap.off` null→undefined，否则被钳到 minimal＝假关闭——评估 §4.3/R6） |
| `low` | `queryOptions.effort:'low'`（thinking 缺省＝支持模型 adaptive） | `-c model_reasoning_effort="low"` | `setThinkingLevel("low")`（预算 2048） |
| `medium` | `effort:'medium'` | `-c model_reasoning_effort="medium"` | `setThinkingLevel("medium")`（预算 8192） |
| `high` | `effort:'high'` | `-c model_reasoning_effort="high"` | `setThinkingLevel("high")`（预算 16384） |
| `xhigh`（极高） | `effort:'xhigh'`（EffortLevel 原生直通；`max` 不取自中立 v1） | `-c model_reasoning_effort="xhigh"`（内置目录实测含；同版 `max`/`ultra` 不取自中立 v1） | `setThinkingLevel("xhigh")`（档位语义保留；**预算映射钳到 high＝16384**） |

归一规则（env → 中立值，读取侧）：恰五值（trim＋忽略大小写⇒规范小写形）；**未设/空串/纯空白＝未设**（留空＝平台默认，静默）；其余（`minimal`/`max`/`ultra`/中文标签/任意串）＝**invalid ⇒ 按未设处理**（零参数、零行为变化）＋诊断 `reasoning.effort.invalid`（fields：`mode`=runtime、`supported:false`、`reasonCode:"invalid-value"`）；**绝不毁会话**。UI 标签→规范值的映射归写入侧（桌面面板 choices 即规范值，与并行项目管理切片逐字一致）。

## 改动文件清单（全部在本角色边界内）

| 文件 | 实施内容 |
|---|---|
| `src/model/runtime.ts` | G-5 节：上表类型/投影器签名＋`RuntimeProviderOptions.reasoningEffort?`（含三平台落点冻结注释与「未设＝逐字现状/纯消费」纪律） |
| `src/common/runtime-core/reasoning.ts` | **新增**：五值全集（唯一来源）/三 env 键/规范校验/三态归一/按运行时解析/两条 summary 常量 |
| `src/common/runtime-core/tool-display.ts` | `createToolDisplayContext` 增 `projectReasoningDetail`（核心投影单点；protectText 同管道；幂等；坏件诊断形；绝不抛） |
| `src/service/runtime/session.ts` | ①`providerFor`：`resolveReasoningEffort(options.runtime)` 纯读（每次重建重读）→ 仅 `set` 态以条件展开注入 `reasoningEffort`（`unset`/`invalid` 字段缺席）＋`invalid` 诊断（`try` 包裹，诊断故障不改变执行）；②`emit`：推理载体单点投影（summary 定格＋turnId 保留）；③`readRuntimeSessionHistory`：同一单点对 `detail.source==="reasoning"` 再投影（幂等） |
| `test/runtime-core/reasoning-effort.test.ts` | **新增 8 用例**：值集/键映射/规范校验/归一（合法/大小写/空白变体/非法/未设/空串/64 字符截断）/resolve 三键互不串/Service 三键注入/未设与空串＝字段缺席/demo 恒缺席/非法⇒零参数＋诊断逐字段/空串静默/诊断抛错不毁会话/跨键不串 |
| `test/runtime-core/reasoning-facts.test.ts` | **新增 9 用例**：文案常量定格/投影形状钉（deepEqual 全形）/omitted 归一与 status 未知诊断/durationMs 真实信号六档丢弃矩阵/保护面（凭据＋Bearer＋URL＋16384 字节预算＋无截断鬼影）/幂等/坏件 11 档诊断/Service 单点全链（summary 定格、turnId 保留、原始凭据与随载荷 summary 绝不外流、诊断行、非推理事件逐字现状）/持久化＋回放同形（盘面无凭据、手编原始事实过同一单点） |
| 本记录 + `changelog.md` + `memo.md` + `feature-map.md` + `api-spec.md` | dated 记录与导航 |

## 行为钉点（测试逐条钉住）

- **未设＝逐字现状（机读形态）**：`unset`/`invalid`/空串 ⇒ `providerOptions` **字段缺席**（`hasOwnProperty` 假），非 `undefined` 赋值。
- **三键各自生效**：`ANS_CLAUDE_REASONING_EFFORT`/`ANS_CODEX_REASONING_EFFORT`/`ANS_PI_REASONING_EFFORT` 分别注入各自 runtime；大小写/空白归一后以规范小写形注入；跨键不串。
- **坏值不毁会话**：非法值 ⇒ 零参数＋恰一条诊断（`reasoning.effort.invalid`）；诊断器自身抛错也被吞；`composeContext` 正常返回。
- **投影单点**：发射前的原始事实（string 正文/含凭据/随载荷 summary）在事件流、持久化盘面、历史读取三层都只以投影形（DisplayTextV1＋固定 summary）出现；`turnId` 保留；坏件走 `reasoning-diagnostic` 行且不毁轮次；非推理事件逐字现状。
- **幂等**：`project(project(x)) === project(x)` 全形相等（历史读取再投影路径的依赖性质）。

## 实测（本机 macOS arm64 / Node v24.14.0）

- `test/runtime-core/**` → **142/142**（基线 125＋本批 8＋9）。
- `npm run typecheck` → **0 错**。
- 全量 `node --test "test/**/*.test.ts"` → **2019 计 / 2018 过 / 0 红 / 1 skip**（基线 2002/2001/0/1——含并行项目管理切片 4 用例；本批 +17，**零新红**）。
- 未 git 提交；未跑真实网关（A 组探针归 wave 2 各适配器）；未触碰 `test/测试/**`、`src/provider/**` 三适配器、`app/**` 桌面面与 `src/common/shared/runtime-settings.ts`（项目管理并行切片）。

## 未验边界

- **两侧消费方均未接线（wave 1 定义即零行为变化）**：`reasoningEffort` 目前无适配器读取（三平台原生接线＝wave 2）；`detail.source==="reasoning"` 目前无适配器产出（事实通道休眠）——因此桌面渲染/回放即便未加分发分支也零影响（现无此类事件）。
- **A 组探针未跑**（归 wave 2 各适配器）：Claude 网关上 `thinking`/`output_config.effort` 的接受性、Codex `-c model_reasoning_effort` 请求期形态、Pi off 收窄后 wire 形态、Pi 预算×上下文钳制（评估 R1）——本波不含。
- **Codex `off` 的「如实说明」义务**（wave 2 适配器落地：不注入＋一句如实）与 Pi `thinkingLevelMap.off` 收窄（Pi适配器角色实施注记）未实施。
- **呈现纪律终形**（运行中态/多段序位/文案措辞/回放折叠）归产品裁定＋桌面UI wave 2；本层只冻数据面（status/durationMs/text 三字段语义）。
- F-9 thinking-only 轮次回放语义复核、计费提示文案——各自批次。
