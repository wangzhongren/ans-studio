# 变更记录：gate 复核 `flow-busy` 可重试语义（运营 / Convener 卡）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-10-27
- 角色：门禁引擎（Gate Engine）
- 任务：客户要求——gate 复核「流程仍有在途工作」返回**可重试**的 `flow-busy`（不是 `unavailable`）并告知原因；运营 / Convener 收到后视为「暂时有在途交付 / 运行轮次 / 回交」，**稍后重试**，不得当 gate 失败 / 已派发 / 验收失败，不得反复刷请求；在途工作结束后再请求同一 gate；保留 gate 独立性 / 不代批 / 不改状态（lead-governance-coordination；门禁引擎任务）。
- 依据：客户本轮要求；现有 Convener 卡「Gate 复核」回执处理段（`dispatched` / `already-dispatched` / `gate-not-found` / `criteria-missing` / `flow-incomplete` / `unavailable` / `rejected`）与「主动请求 gate 复核」步骤。
- 范围：只改本角色授权写集——`src/common/门禁引擎/governance-roles.ts` 的 `CONVENER_CARD_TEXT` 产品数据文本 + 文件头注、`test/门禁引擎/governance-trio.test.ts`（既有 gate 回执断言更新）、`test/门禁引擎/gate-review-flow-busy.test.ts`（新增）、本角色 changelog 与本变更记录。未改工具 / 桌面 / 运行时 / 编排 / PM / i18n / 游戏项目；未新增角色 / `FlowStepKind` / cardKind / 写权 / 能力位；未 commit / push；未重启应用。

## 1. 写前核对与基线

- 工作树：`gate-review-flow-busy`（分支 `feat/gate-review-flow-busy`），`git rev-parse --short HEAD` = `43372e4`（已含前几批 `report_artifact_ready` / 客户卡化 / 截图-only 卡文本与测试）。
- 本批写前本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **362 计 / 361 过 / 0 失败 / 1 Windows 既有 skip**。
- 写后本角色候选哈希（`git hash-object` / `sha256sum`）：
  - `src/common/门禁引擎/governance-roles.ts` = `c89baf60607edb9fdc682b5fd380ae6ca748c23f` / `86ceb7422db6c420584f0f872134a10d51ef5bcf31fe002ee53e0561f5fd9981`
  - `test/门禁引擎/governance-trio.test.ts` = `06e692d01e87f08474ce79e59aa58dc322af8953` / `ddf37e18c24a2903521753ca33f0954ec9eddf9c553526dce7ec2684d5318dd6`
  - `test/门禁引擎/gate-review-flow-busy.test.ts` = `e60ed37cf56b427751889d3ce3b6cb089587bba1` / `35e05a714894cafd7711ae2faa42c8540a2095019dadbeacdf69b5b75f8f2e0a`

## 2. Convener 卡文本变化

### 2.1 主动请求 gate 复核（第 4 步）

- 追加：**若流程仍有在途交付 / 运行轮次 / 回交，应用会返回可重试的 `flow-busy`——稍后重试，不反复刷请求；在途工作结束后再请求同一 gate。**
- 保留：完成即主动调用 `request_gate_review({ flowId, gateId })`；gate `done` 只能由应用按 Proof 报告收口；不得用 `flow_step_update` 标 gate `done` / `dispatched` / `delivered`；不得代写 gate 报告。

### 2.2 回执处理（第 5 步）

- 新增 `flow-busy` 条目：
  - **可重试**——表示流程仍有在途交付 / 运行轮次 / 回交，gate 复核暂不受理；
  - **不是 `unavailable`、不是 gate 失败、不是已派发、不是验收失败**；
  - 按 `message` 了解原因，**稍后重试**，不得反复刷请求；
  - 等在途工作结束后再 `request_gate_review` 同一 gate；
  - 不据此标 gate `done` / `failed` / `delivered`、不代批、不改 flow 状态。
- `flow-incomplete` 条目：移除「有在途工作」这一缺口示例（在途工作现由 `flow-busy` 表达），保留依赖未 `done`、账本对不上、证据路径缺失等缺口；补「在途工作属 `flow-busy`，按该条稍后重试」。
- 既有 `dispatched` / `already-dispatched` / `gate-not-found` / `criteria-missing` / `unavailable` / `rejected` 语义逐字保留；`unavailable` 仍为「通道不可用 / 可能已派发，以 `flow_get` 核对为准」。
- gate 独立性、不代批、不改状态、不写客户决定等规则不变。

## 3. 测试

- 新增 `test/门禁引擎/gate-review-flow-busy.test.ts`（3 例）：
  1. Convener 卡把 `flow-busy` 视为可重试的在途状态：在途交付 / 轮次 / 回交、按 `message` 了解原因、稍后重试、不刷请求、在途结束后再请求同一 gate；不是 `unavailable` / gate 失败 / 已派发 / 验收失败；不标 `done` / `failed` / `delivered`、不代批、不改 flow 状态；gate 独立性保留。反向禁止「flow-busy 是 gate 失败 / 即已派发 / 即验收失败 / 不可用 / 需要重新派发」等肯定式。
  2. `flow-incomplete` 与 `flow-busy` 语义分开：`flow-incomplete` 不再把在途工作当缺口，明确指向 `flow-busy`；`unavailable` 语义保留；反向禁止旧「证据路径缺失、有在途工作）」文案复现。
  3. 只有 Convener 卡定义 gate `flow-busy`（其余四卡不得定义）；不得写成 cardKind；角色顺序 / Convener entries / 预授权 / 能力位零变化。
- 更新 `test/门禁引擎/governance-trio.test.ts` 既有「主动 request_gate_review 与回执」断言：加入 `flow-busy` 可重试、在途原因、与 unavailable / gate 失败 / 已派发 / 验收失败区分、稍后重试、不刷请求、同 gate 重试、不标状态 / 不代批 / 不改 flow 状态等断言。

## 4. 验证结果（本批写后）

- 定向：`node --test "test/门禁引擎/gate-review-flow-busy.test.ts"` ⇒ **3 计 / 3 过 / 0 失败 / 0 skip，exit 0**。
- 本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **365 计 / 364 过 / 0 失败 / 1 Windows 既有 skip，exit 0**（写前 362 计；新增 3 例）。
- `npm run typecheck` ⇒ **exit 0，0 诊断**。
- 未跑跨角色端到端 / 真机 Electron / 浏览器；未独立验收。

## 5. 未做 / 依赖其他角色 / 残余风险

- **本批只改 Convener 卡文本与测试**：`flow-busy` 的返回条件、原因文案与实际返回码由运行时核心 / 编排 / 桌面角色实现；卡文本是行为约束，不是实现证据。
- 应用是否机械区分 `flow-busy` / `unavailable` / `flow-incomplete` 取决于运行时实现；本批未新增判定逻辑。
- 模型是否严格「稍后重试、不刷请求」无机械保证；应用回执与 gate 门禁仍是硬保证。
- 未 commit / push、未重启应用、未改工具 / 桌面 / 运行时 / 编排 / PM / i18n / 游戏项目；未独立验收。
