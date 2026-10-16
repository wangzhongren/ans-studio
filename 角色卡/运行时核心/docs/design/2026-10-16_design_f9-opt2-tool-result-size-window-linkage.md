---
id: f9-opt2-tool-result-size-window-linkage-assessment
type: design
title: "F-9-opt2 立项评估：1 MiB 工具结果上限 × 上下文窗口 × 输出预算钳制的联动"
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: draft
related: [pi-kanban-turn-truncation-fix-proposal, kanban-fixes-pm-review]
---

# 立项评估：单条工具结果的尺寸与上下文窗口/输出预算的联动

**状态：评估（立项）。** 本文只整编既有实测证据与只读代码定位，**未实施任何代码改动、未运行新的行为测试**。是否立项实施（及方案取舍）待后续评审与客户裁定；本文不改变任何现行为，不构成对 `MAX_SHELL_OUTPUT_BYTES` 或任何时限/权限的改动授权。

来源：PM 评审批次中「F-9-opt2：1 MiB 工具结果上限与上下文窗口/钳制的联动评估（运行时核心）」立项行；问题与证据原始出处为 Pi适配器提案 [输出上限截断吞正式报告（F-3）与压缩频次观察（F-9）](../../../Pi适配器/docs/fix/2026-10-15_fix_kanban-turn-truncation.md) §3/§八（真机 kanban-live 2026-10-15 轮，replay/native 行号引用见该文）。

## 一、被评估的单点

`src/provider/runtime/tools.ts:298`（本角色边界）：

```ts
/** 单条流的输出上限（1 MiB）；超出即截断，避免内存被大输出撑爆。 */
const MAX_SHELL_OUTPUT_BYTES = 1_048_576;
```

它约束的是**单条工具结果**（stdout/stderr 各自 1 MiB）的采集上限。提出评估的问题：这一上限与「上下文窗口配置」「压缩触发」「SDK 输出预算钳制」之间存在放大联动——单条合法上限的工具结果，是否足以把一次请求顶到「输出预算被钳到 1 token」的截断态（F-3 的机械根因）？

## 二、事实链（全部来自既有证据，未新增测量）

按时间顺序，同一会话（kanban-live 测试者，模型 `ans-gateway / deepseek-v4-flash[1m]`，`ANS_PI_CONTEXT_WINDOW` 取保守配置值，估值口径见下）：

| # | 事实 | 数值/出处 |
|---|---|---|
| 1 | 一次 `run_shell` 的返回被 1 MiB 上限**恰好顶满** | 1,048,671 字符（native idx 94，13:34:36.872Z）——即该工具结果处在**合法上限**的最大档 |
| 2 | 该结果按 SDK 估算口径计入上下文 | chars/4 ⇒ 约 **262,168 估算 tokens**（与 replay 的 threshold 压缩 `tokensBefore=375596` 与「上一请求 usage 113,282 + ≈262,168」的吻合差 <0.1%，见 Pi 提案 §3.2） |
| 3 | 配置的上下文窗口（估算口径）被触发 threshold 压缩 | 判据 `shouldCompact = contextTokens > contextWindow − reserveTokens`（`compaction/compaction.js:173-176`；`reserveTokens=16384`）。压缩在估算 375,596 时触发 ⇒ 反推配置窗口 `CW ≤ 375,596 + 16,384 ≈ 391,980`（`ANS_PI_CONTEXT_WINDOW` 实测值未留档；**粗算、待确认**） |
| 4 | 压缩**没有**把真实请求拉回安全区 | 压缩后下一个真实请求 `input=465,496, cacheRead=2,176`（真实 prompt ≈ **467,672 tokens**，13:34:48.413Z）——比估算值高约 **+24.5%**（chars/4 对 CJK 欠计为最可能来源） |
| 5 | 该请求的输出预算被钳到下限 **1 token** | `clampMaxTokensToContext`（`node_modules/@earendil-works/pi-ai/dist/api/simple-options.js:3-9`）：`max_tokens = min(model.maxTokens, max(1, CW − estimateContextTokens(context) − 4096))`，`MIN_MAX_TOKENS=1`、`CONTEXT_SAFETY_TOKENS=4096`；调用点 `anthropic-messages.js:740`。观测：`stopReason=length / rawStopReason=max_tokens`、`output=1`、正文只有 thinking「The」 |
| 6 | 截断掐断报告通道（F-3） | 系统如实降级 `unreported / terminal-fallback`；同会话第二轮再次出现（真实 prompt 468,735，output=1），靠 SDK 的 overflow 恢复重试才继续 |
| 7 | 该轮 threshold 压缩对真实尺寸近乎零收缩 | 压缩前估算 375,596、压缩后下一个真实请求仍 467,672——**单条 1 MiB 工具结果没有被压掉**（`keepRecentTokens=20000` 按估算计，且分割受「不可在工具调用与其结果之间切分/转向起点」等约束影响，具体构成**待确认**，Pi 提案 §3.4） |
| 8 | 同会话异轨对照：overflow 压缩能大幅收缩 | 9 分钟内真实 ≈468k → 重试后 ≈6,704 tokens（native idx 102）——压缩本身有效，问题在 threshold 路径的**保留策略与估算口径** |

## 三、联动的量化关系（把四把尺子摆在一起）

四把尺子：

1. **单条工具结果上限**：1 MiB（≈26.2 万估算 tokens，chars/4）。
2. **配置上下文窗口 `CW`**：估算口径的保守值（本会话反推 ≈≤392k；项目缺省 `DEFAULT_PI_CONTEXT_WINDOW=32768`，`provider-config.ts:81`；显式 `ANS_PI_CONTEXT_WINDOW` 覆盖优先级：显式 > env > 缺省）。
3. **压缩触发线**：`CW − reserveTokens(16,384)`（threshold 路径）。
4. **输出钳制线**：`estimate(context) ≥ CW − 4096 − 1` 即 `max_tokens` 落到下限 1 —— 拿估算**减**，拿真实**发**。

联动算式（用本会话实际数字代入，估算口径）：

```text
配置窗口（反推）           CW   ≈ 392,000
压缩触发线                      ≈ 375,616       ← 估算 375,596 时触发（事实链 #3）
本次请求估算 = 前次 usage 113,282 + 单条 1 MiB 结果 ≈262,168 ≈ 375,450
输出钳制条件  estimate ≥ CW − 4,097 ≈ 387,900
真实请求 = 估算 × 1.245（CJK 欠计，事实链 #4）  ≈ 467,672 ≥ CW        ← 钳到 1
```

即：**单条最大档的合法工具结果，本身就占了（反推）配置窗口的约 68%**（262,168 / 392,000）；叠加此前 usage 与 chars/4 对中文输出的欠计，单条结果即可把「估算刚好触线 → 压缩触发 → 真实口径仍超高 → 输出钳到 1 → 截断（F-3）」整条链一级级顶穿。1 MiB 上限不是唯一原因，但是这条链上**唯一由 ANS 自己设置的放大器参数**，且它现在是**绝对值**——与配置窗口无任何联动（窗口可被算子调到任意值，上限恒定 1 MiB）。

附带事实（同源、供评估完整性）：该上限同时是**两条流各自**的 1 MiB（stdout 与 stderr 独立），单次工具结果的合计上界因此是 2 MiB（≈52.4 万估算 tokens）。实测触发案例用的是 stdout 一条。

## 四、候选方案（评估用；全部未实施，按成本/取舍并排）

| 方案 | 内容 | 收益 | 成本/风险 |
|---|---|---|---|
| A 窗口比例限幅 | 单条结果上限改为 `min(1 MiB, 配置窗口某比例)`（如 CW/4） | 让上限随窗口自适应；保守窗口下显著降低单条占比 | 需要把「配置窗口」传入工具层（新依赖面/新参数）；比例值属产品口径；限幅是**更早截断**——丢失更多证据 |
| B 超限落盘 + 摘要 + 指针 | 超过阈值的结果整体写入项目内临时文件（如 `.ans/tmp/`），工具返回「截断预览 + 文件路径」，模型可按需分片读取 | 证据**不丢**（与「不得把失败伪装成成功」同向：全部保留、如实标注截断）；上下文预算受控 | 新增落盘面（路径归属/清理/权限——写盘路径与门禁语义需设计评审）；模型多一次读取往返；属跨组件小系统 |
| C 全局调低硬上限 | 如 1 MiB → 256 KiB | 一行参数改动 | 常量拍脑袋，仍与窗口无联动；对合法大输出（构建日志、diff 全量）过早截断；治标不治本 |
| D 维持现状 + 已批准缓解 | 上限不动；依赖本轮已实施的 F-3-a/b（截断收尾补发 + 截断事实外推，Pi适配器）与 F-3-c（submit_report 输出上限引导，本角色） | 零新增面；报告通道有有界兜底；截断事实可见 | 放大链仍在：极端尺寸仍可能触发钳制（代价被有界化：限一次补发、如实标注） |

**倾向（供评审，非结论）**：本评估建议**不急于实施 A/C**（两者都只是把「截断点」挪位置，且引入新的配置传播面）；若要立项，**B 是最不丢证据的方向**，但它跨「工具层落盘面 × 门禁口径 × 临时目录生命周期」，应先出一份最小设计（阈值、目录、清理、权限、模型读取路径、桌面呈现）再评。D 为本轮的自然基线（F-3 缓解已落地）。

## 五、边界与前置（评估结论的一部分）

- **窗口配置不在本角色**：`ANS_PI_CONTEXT_WINDOW` 的解析/校验在 Pi适配器（`src/common/pi-adapter/provider-config.ts:29-38/81/119-149`）；压缩参数（`reserveTokens/keepRecentTokens`）亦由其注入（`settings.ts:48-57`）。任何「上限随窗口联动」（方案 A）都需要与 Pi适配器共同设计参数传递，不能单侧实施。
- **估算口径属 SDK**（chars/4、`estimateContextTokens`），ANS 侧无直接修法；F-9-opt3（估算口径对齐）为观察项。
- **本角色可单侧实施的部分仅**：`MAX_SHELL_OUTPUT_BYTES` 及其截断语义（`tools.ts`）+ 结果事实字段（`execution.*Truncated`）。若实施 B 的「落盘」部分，落点在本角色与门禁/编排的边界协商后另立最小设计。
- **fail-closed 方向不变**：四个候选都只会**减少**进入模型的内容或**更如实地标注**截断，没有任何一条放宽执行/写权/门禁；与「不得把失败伪装成成功」一致。
- **证据完整性是产品口径**：日志/构建输出「整段保留 vs 预算优先」是取舍，不是对错；需要客户侧明确偏好后再实施。

## 六、状态标注

- **未实施 / 未测试。** 本文为立项评估；产出后未改任何 `src/` `app/` `test/` 文件（评估轮零代码改动）。
- 文中所有数字均引自既有证据（kanban-live 真机会话记录、native/replay 行号、SDK 包内只读代码），未新增测量；`ANS_PI_CONTEXT_WINDOW` 实测值未留档处（反推值）已如实标注「粗算、待确认」。
- 与本评估同轮的 F-3 相关缓解（F-3-a/b 属 Pi适配器、F-3-c 属本角色）状态以各自文档为准。
