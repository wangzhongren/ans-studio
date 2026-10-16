---
id: claude-reasoning-wire-probe
type: fix
title: G-5 wave 2（Claude）——thinking/effort 接线、推理捕获与降级链（A 组探针＋实施记录）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: 已实施待独立验证（未 git 提交）
related: [claude-session, claude-mcp-install-implementation]
---

# G-5 wave 2（Claude）：推理强度接线＋推理内容捕获＋降级链

客 2026-10-16 批准 G-5；本批＝PM 派发「先探针、后接线」的 wave 2（Claude 路径）。契约（运行时核心 wave 1 已落盘、本批纯消费）：`ReasoningEffortV1`（恰五值）/`RuntimeProviderOptions.reasoningEffort`（字段缺席＝未设）/事实通道五符号（`src/model/runtime.ts:490-560`）；归一器 `src/common/runtime-core/reasoning.ts`；投影单点在 Service（本适配器**只产原始事实**）。行号基于落盘后工作树。

## 一、方法与环境

- 探针 `test/claude-adapter/reasoning-loopback.probe.ts`：**真 bundled CLI 2.1.299**（SDK 0.3.299）＋127.0.0.1 假网关（逐请求断言来源地址与假凭据；零真实网关请求）＋**假 SSE 混块**（签名 thinking 块＋redacted_thinking 块＋text 块）。**14 个直连相位**（control/thinking×4/effort×5/capture-empty/reject×2）**＋1 个生产装配相位**（env→Service→适配器→wire 闭环），全部通过。证据目录：[2026-10-16-reasoning-evidence](2026-10-16-reasoning-evidence/)（`probe-reasoning.json` 全量报告、`probe-stderr.txt`、`unit-claude-adapter.txt`、`typecheck.txt`、`full-suite.txt`、`diff-check.txt`）。

## 二、A1——`Options.thinking`/`Options.effort` 的 wire 捕获（冻结）

| 相位（Options） | wire 实测（/v1/messages 请求体） | 备注 |
| --- | --- | --- |
| 未设（control） | `thinking:{type:"adaptive",display:"updates"}`＋`output_config:{effort:"medium"}` | **CLI 自有缺省**；适配器未设＝零参数（选项面），wire 仍带 CLI 缺省——「未设逐字现状」的准确含义 |
| `thinking:{type:"disabled"}`（`off` 落点） | **`thinking` 字段整体缺席**；effort 仍 medium | CLI 把 disabled 翻译为「不发该字段」 |
| `thinking:{type:"enabled",budgetTokens:8000}` | `thinking:{type:"adaptive",display:"updates"}`（缺省模型 opus-5-5 与 `claude-sonnet-4-6` 两测同） | 当前代模型上 **budgetTokens 不上 wire**（CLI 折算为 adaptive；SDK 文档「On Opus 4.6 视为 on/off」的实测确认） |
| `thinking:{type:"adaptive"}` | 同上 adaptive | — |
| `thinking:{type:"adaptive",display:"omitted"}` | `display:"updates"` | **`display:'omitted'` 未被该构建透传**（CLI 发自有 display 缺省）——display 面不在本批映射表，如实登记 |
| `effort:"low/medium/high/xhigh"` | `output_config:{effort:"<值>"}` 四值**逐字直通** | 扁平 `body.effort` 恒不出现（全部请求断言） |
| `effort:"xhigh"`＋`model:"claude-sonnet-4-6"` | `output_config:{effort:"high"}` | **模型上限钳制**：sonnet-4-6 把 xhigh 钳到 high（缺省模型不钳）；模型目录行为属 CLI 面 |
| 混块捕获 | assistant 帧逐块送达：`{type:"thinking",thinking,signature}`（完整正文）／`{type:"redacted_thinking",data}`／空 thinking 块原样 `thinking:""` | 「平台省略」两种形态都被捕获面如实区分（见 §四） |
| （旁证）system 帧 | 每相位见 `thinking_tokens`（estimated_tokens 进度）与 informational 帧 | 进度/提示帧**不消费**（无正文语义、无时长语义） |

## 三、A2——假网关 400 时 CLI 行为（冻结）

对 `thinking` 或 `effort` 任一被 400 拒绝（错误文案点名被拒参数）：

- CLI **自动重试共 3 次**：第 1 次原样（`display:"updates"`）→ 第 2、3 次**只剥 `display` 提示**，**`thinking`/`output_config.effort` 参数从不剥离**；随后放弃。
- 放弃形态：assistant 文本帧 `API Error: 400 <网关文案>`＋result 帧（subtype `"success"`、`is_error:true`）＋SDK 迭代抛出 `Claude Code returned an error result: …`。
- ⇒ **降级不能指望 CLI**（它不丢参数）；要降级必须由适配器自持（见 §五）。

## 四、请求接线（实施，映射表逐字）

`src/provider/claude/session.ts` 新增 `reasoningOptions()`（bindRole 内、随 `reasoningDegraded` 冻结）：未设⇒`{}`（**零参数逐字现状**）；`off`⇒`{thinking:{type:"disabled"}}`；`low/medium/high/xhigh`⇒`{effort:"<值>"}`；`max` 不收编（类型层即不可达）。`queryOptions` 以 `...reasoningOptions()` 展开（`:359` 一带）。

## 五、推理捕获与发射（实施）

- 消息泵 assistant 分支（`:373-375` 一带）新增两路：`thinking` 块 ⇒ 正文非空 `{text,status:"complete"}`、正文空串 `{text:"",status:"omitted"}`；`redacted_thinking` ⇒ `{text:"",status:"omitted"}`。**durationMs 恒不携带**（探针：2.1.299 消息面无任何真实时长信号；契约禁止猜测）。
- 经 `emitReasoning` 以既有 `kind:"message"` 通道发射，detail＝`{version:1,source:"reasoning",reasoning:{…}}`（契约形状逐字）；summary＝`REASONING_EVENT_SUMMARY`（「已思考」，Service 投影单点会再覆写）。**适配器绝不自行脱敏**——原始正文直入 detail，脱敏＋预算在 Service 的 `projectReasoningDetail` 单点（单测以含凭据值正文钉住「未预脱敏」）。

## 六、降级链（实施，恰一次）

- **识别判据（保守）**：仅当失败文本同时含 `API Error: 4\d\d` 且点名推理参数（`thinking`/`effort`/`output_config` 词元）⇒ 判定「网关因推理参数拒绝」。5xx、无参数词元的 4xx、其他失败一律**不识别**（单测双向钉住；「不确定就不识别」）。
- **动作（恰一次/会话）**：置 `reasoningDegraded` → 关闭旧引擎 → 发如实一行（「网关不支持推理参数，已去掉参数重试一次（本会话之后不再携带）」）→ 诊断 `reasoning.degraded`（字段 `mode/reasonCode/decision/attempt` 均在白名单）→ **同轮原地重试**：引擎重建（`reasoningOptions()` 已返空）＋**同输入逐字重推**（同 `turn.sdkUuid`、wire 文本字节相同）→ 后续轮次同会话引擎一律无参数。
- 失败文本载体：泵 result 分支落 `lastFailureText`（result.result，探针实证字段）＋泵 catch 兜底（抛错文本）；prompt 尝试循环每次重置（防陈旧串扰）。
- 重试实现要点：每尝试独立 done/resolve/reject 三元组（泵会把上一三元组 reject）；`turn.id` 不变（业务轮身份稳定）。

## 七、测试与证据

- 单测 `test/claude-adapter/session.test.ts` **+4（37→41）**：①接线六档逐字（未设两键缺席/off=disabled/四档 effort）；②捕获（complete/omitted×2、原始正文不预脱敏、无 durationMs、文本帧不受扰）；③降级恰一次（两次 engine 构造、第二次零参数、同输入字节重推、如实行、后轮仍无参数、settled 全 completed）；④负例（5xx、无参数词元 4xx ⇒ 零重试、照常失败）。含 launcher 3 例合计 **44/44**。
- 常备回环探针 14 相位＋生产装配闭环相位全绿：闭环断言 env `ANS_CLAUDE_REASONING_EFFORT=high` → Service 注入 `options.reasoningEffort` → wire `output_config.effort:"high"` → 混块经投影单点出 `已思考` 行（complete＋omitted 各一）。
- `npm run typecheck`：**0**；`git diff --check` 干净；全量 `node --test "test/**/*.test.ts"`＝**2025 计 / 2023 过 / 1 红 / 1 skip**——唯一红 `test/测试/t29-pi-config-roundtrip.test.ts`（「临时 .env 载入后进程 env …」一例；该文件只 import Pi/桌面/装配模块，**与本批零 import 交集**、隔离复跑同样红，属 Pi 配置 wave 在飞；基线 2019/2018/0/1 于本批开始后由并行批次引入，非本批，未处理）。
- 未 git 提交；唯一包裹＝免扰流量 flags；零真实网关请求。

## 八、未验边界（如实）

1. **真网关错误文案形态**：识别判据按探针假件文案固化（`API Error: 4xx`＋参数词元）；客户真网关/代理的 400 文案若不点名参数 ⇒ 保守不识别（退化为如实失败，不重试）——正式批的防误伤面即此。
2. **budget 透传面**：当前代模型（探针两模型）budgetTokens 不上 wire；旧代模型 API 可能原生支持 `budget_tokens`（未探、亦不在本批映射表——`off`/四档之外不强加）。
3. **display 控制**（summarized/omitted/highlights）未接线（契约未收编；探针记其未透传）。
4. **部分流（--include-partial-messages）**未启用；捕获基于完整块。
5. 降级**不自动恢复**：会话内参数一去不返（换会话/清 env 即恢复）；「网关修复后再启用」未做（属产品面）。
6. 派发平台面重复项（Pi 预算钳制、Codex 无「关」档）属各自角色记录。

## 九、边界声明

只写本角色边界内文件：`src/provider/claude/session.ts`、`test/claude-adapter/{session.test.ts,reasoning-loopback.probe.ts}`（后者新增；常备探针）、本记录与 changelog/memo/证据目录。**未碰** `src/model/runtime.ts`、`src/common/runtime-core/**`、`src/service/**`（契约/归一器/投影单点均为 wave 1 已落盘产物，本批纯消费）、其它角色在飞文件；未 git 提交。
