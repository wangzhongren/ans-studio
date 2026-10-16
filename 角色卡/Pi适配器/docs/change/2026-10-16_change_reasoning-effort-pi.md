---
id: pi-reasoning-effort-wave2
type: change
title: G-5 wave 2（Pi）——推理强度请求接线／off 前置修复／思考捕获发射／R1 修复／降级恰一次重发
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [pi-probe-reasoning-wire, role-reasoning-effort]
---

# G-5 wave 2（Pi）：已实施待验证

**状态：已实施 / 待验证**（独立验证与真机复验未进行；未 git 提交）。依据＝客户 2026-10-16 批准 G-5；契约面＝`src/model/runtime.ts`（`ReasoningEffortV1`／`RuntimeProviderOptions.reasoningEffort`／`RuntimeReasoningFactsV1`／`RuntimeReasoningEventDetailV1`，**形状以契约文件为准**）；"先探针、后接线"＝本批探针 `docs/fix/2026-10-16_probe_reasoning-wire.md`（A5/A6/A7 定格，含 R1 实锤）。纯本地：测试与探针全走 `127.0.0.1` loopback；**零真实网关请求**。

## 一、改了什么（本角色 Section 1 内）

### 1.1 `src/common/pi-adapter/real-adapter.ts`（唯一产品文件；`src/provider/pi/session.ts` 零改动——`reasoningEffort` 经 `RuntimeProviderOptions` 原样流入）

- **:150 off 前置修复**（`buildExplicitRuntime` 克隆）：`thinkingLevelMap: { ...templateModel.thinkingLevelMap, off: undefined }`——模板 `off:null` 被 SDK 视为不可用、钳到 minimal＝假关闭（A5 实锤）；收窄后 off 真实可用（wire `{type:"disabled"}`、beta 头消失）。仅影响 off 档（xhigh/max 原样；模板无 sampling 面）。
- **请求接线（:1489-1492）**：`opts.reasoningEffort !== undefined` 时 `session.setThinkingLevel(opts.reasoningEffort)`（**未设＝不调用**，medium 隐式原样）；五档直映射（xhigh 预算由 SDK 钳到 high=16384、档位语义保留——A5 实测）；诊断 `session.thinking_level{state:<档>}`。如实注记：档位变化随 SDK 语义进转录（`thinking_level_change`），恢复会话按原生恢复面沿用（同模型选择恢复）。
- **思考捕获与发射（:677-713，`buildGovernanceExtension` 内、**无条件**）**：`message_start` 清计时、`message_update` 按 `contentIndex` 收 `thinking_start/end` 真实起止（总时长为各块之和；**测得 0ms 亦为真事实**、无 part 信号则不携带）、`message_end` 产 `{version:1, source:"reasoning", reasoning:{text,status,durationMs?}}`（思考行**先于**文本行；`extractMessageText` **零改动**——既有 text 行为逐字保留）。
- **:845-958 G-5 节（导出面）**：`REASONING_SUMMARY`（"已思考"——Service 投影单点强制覆盖；此处只作无投影路径标签）、`REASONING_DEGRADED_SUMMARY`（降级如实行文案）、`extractReasoningFacts`（纯函数：无块⇒undefined；全 redacted⇒`{text:"",status:"omitted"}`；可读块⇒complete、`"\n\n"` 拼接）、`ReasoningDegradeState`、`ReasoningDegradeOptions`、`buildReasoningExtension`（**仅设档时装配**）：
  - `before_provider_request`：①降级剥离（suppressed⇒删 `thinking`）；②**R1 请求前修复**——enabled 且不满足 `1024 ≤ budget < max_tokens`：`max_tokens>1024`⇒预算钳入 `[1024, max_tokens−1]`（诊断 `reasoning.repaired{state:"budget-clamped"}`）；`max_tokens≤1024`⇒改 `{type:"disabled"}`（诊断 `state:"thinking-disabled"`）；③逐请求记录携带面（降级识别的保守前提）。
  - `message_end`：降级检测——携带思考参数 ∧ `stopReason=error` ∧ `requestRejectionStatus`（≥400 排除 408/429，同 server-tools 口径）∧ 未降级过 ⇒ 置位恰一次（诊断 `reasoning.degraded{errorCode:"GATEWAY_REJECTED_HTTP_<码>", state:"retry-once"}`）。
- **:1079-1087 降级重发（`makeRolePrompt`）**：终态发射前消费——`!lifecycle.isInterrupted()` ∧ `consumeRetry(turnId)` ⇒ `suppress()`（先于重发）→ 如实一行（`detail.source:"reasoning-degrade"`）→ 同文本直调底层 `session.prompt` 重发（不递归包装、**settled 仍单点**；重发再失败走既有失败路径、不二次）。`RoleSessionDeps`/`makeRolePrompt` 各加 `reasoningDegrade?` 接缝（**缺省不传＝逐字旧行为**）。
- **:1408/:1548 装配**：`reasoningState`＋`reasoningExtension` 仅设档时进 `extensionFactories`；`reasoningDegrade` 仅在设档时传给 `makeRoleSession`。

### 1.2 `src/common/pi-adapter/lifecycle.ts`

- **:36** 新增只读谓词 `isInterrupted()`（`forced || settled`）——降级重发的守卫：被 abort/失败锁定的轮次不重发。

## 二、测试（`test/pi-adapter/reasoning-effort.test.ts`，**8 例**；单元格＝探针转正）

| 例 | 要点 |
|---|---|
| 全档映射（loopback 捕获） | 未设⇒medium/8192、零 ans-reasoning 扩展（逐字现状对照）；off⇒`{disabled}`＋零 beta 头＋effective=off；low/high/xhigh⇒2048/16384/16384；xhigh effective 保留 |
| off 前置修复单元 | 克隆 `map.off===undefined`；`clampThinkingLevel("off")==="off"`；**修复前对照**（`off:null`）钳到 `"minimal"` |
| R1 修复（自证网关） | cw=5000⇒`disabled`＋诊断 `thinking-disabled`；cw=5700⇒预算钳入合法窗＋诊断 `budget-clamped`；两轮均正常 completed（非法组合被网关 400 ⇒ 若未修复必红） |
| 思考捕获（complete/redacted） | 正文逐字＋`status:"complete"`＋durationMs 为真实数字；**过投影单点**（`projectReasoningDetail` 保真）；思考行先于文本行；redacted⇒`omitted`＋空正文 |
| extractReasoningFacts 单元 | 缺失/非助手/空正文 complete/全 redacted omitted/多块拼接/混合取可读 |
| 降级恰一次（成功） | 恰 2 请求（带→不带）＋后续轮次 0 携带；settled×2 completed；如实一行×1；诊断×1 |
| 降级不二次 | 重发仍 400⇒如实 failed、请求 2+1（次轮不重发）、通知 1；**未设会话零降级对照**（恰 1 请求、无降级行） |
| 降级接缝（stub 单测） | consume⇒suppress 先于重发、同文本恰两次、settled 单点、consume 恰一次；重发失败⇒既有失败路径（failed 终态恰一）；不命中⇒单次调用 |

## 三、验证与归因

- `node --test test/pi-adapter/reasoning-effort.test.ts` → **8/8**；`node --test "test/pi-adapter/"*.test.ts` → **286/286**（基线 278＋8）。
- `npm run typecheck` → **本角色文件 0 错**；如实登记：全仓仅存错误在 `test/codex-adapter/reasoning.test.ts`（6 处，**Codex 角色 G-5 在飞文件**，非本批）。
- 全量 `node --test "test/**/*.test.ts"` → **2044 计 / 2042 过 / 1 红 / 1 跳**。唯一红＝`test/测试/t29-pi-config-roundtrip.test.ts`「T29 往返」——期望键集未含 `ANS_PI_REASONING_EFFORT`，而 `app/desktop/pi-config.ts`（**桌面窗口角色 G-5 在飞**）已把该键加入 `PI_PANEL_KEYS` ⇒ **在飞产物×旧钉**（本批零交集：本角色源/测均不引该键）。
- 排查中修复一处本批触碰：`test/测试/g3-search-verify/scope-audit-and-fold`「审计④」按**文件序**断言「首个 `pi.on("before_provider_request"` 在 server-tools 启用判据之后」——本批 G-5 节初版置于其前 ⇒ 将该节整体移至 `buildGovernanceExtension` **之后**（真实不变量不变：两处 handler 均条件注册；定义先于使用成立）⇒ 该钉转绿。

## 四、未验边界（如实）

1. **真网关接受面**：`thinking:{type:"disabled"}`、interleaved-thinking beta 头、五档预算组合的真网关接受性＝B1 系列真网关探针（本批禁真实网关请求）。
2. adaptive 方向未翻旗（`forceAdaptiveThinking` 保持 false——评估 B1/B4 待裁）。
3. `reasoning.repaired` 为静默诊断修复（无用户行）；紧窗边缘语义登记于探针记录。
4. R1 修复仅覆盖"设档"会话（未设＝逐字现状硬口径）；未设路径同一潜在窗如实登记（PM 可一行扩展）。
5. 真机端到端（桌面面板设档→会话行为→思考行呈现→计费提示）与独立验证属后续轮。

## 五、边界声明与回滚

只写：`src/common/pi-adapter/real-adapter.ts`、`src/common/pi-adapter/lifecycle.ts`、`test/pi-adapter/**`（新增测试＋探针）、本记录/探针记录/changelog/memo。**未碰** `src/provider/pi/session.ts`、`src/model/runtime.ts`、`src/common/runtime-core/**`、桌面/门禁/他适配器在飞文件。未 git 提交。

**回滚**：`real-adapter.ts`/`lifecycle.ts` 回滚本批 diff（未设路径零行为变化：无调用、无扩展、无接缝；设档路径＝整体摘除「映射调用＋ans-reasoning＋捕获行」）；删新测试/探针/记录。无数据/状态迁移（`thinking_level_change` 转录条目由 SDK 自管，属既有语义）。
