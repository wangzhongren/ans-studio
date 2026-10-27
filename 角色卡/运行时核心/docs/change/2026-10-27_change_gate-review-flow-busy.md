---
id: gate-review-flow-busy-change
type: change
title: "request_gate_review 新增可重试的 flow-busy 返回码（流程在途时不再笼统 unavailable）"
created: "2026-10-27"
updated: "2026-10-27"
timezone: Asia/Shanghai
status: implemented-unverified
related: [runtime-core]
events:
  - date: "2026-10-27"
    kind: implemented
    summary: 客户要求 gate 复核遇「流程仍有在途工作」不得返回笼统 unavailable。Model 的 RequestGateReviewResult.code 新增 "flow-busy"（既有码不变）；tools.ts 的 REQUEST_GATE_REVIEW_CODES 冻结枚举加入该码，回执文案明确「流程仍有在途工作（交付/轮次/回交），gate 暂不派发、可稍后重试；不是故障、不是 gate 失败、不要当已派发」，原因原样可见；矛盾回执 ok:true+flow-busy 按未派发处理（ok:false），绝不说成已派发/已受理。schema 描述/promptGuidelines 同步。新增/更新测试；npm run typecheck exit 0；runtime-core 380 计/373 过/3 既有 Windows symlink 红/4 skip（零新红）。
---

# `request_gate_review`：新增 `flow-busy` 可重试返回码

**状态分开写：** 已实现（本角色写集内的 Model 契约、工具回执与测试）；**未验证**（应用注入侧尚未改为在「流程在途」时返回 `flow-busy`——不在本角色写集；真实桌面端到端与独立验收未做）。

## 以前怎样、现在怎样

**触发场景**：统筹（Steward）在流程仍有在途交付/轮次/回交时请求 gate 复核。

- **以前**：应用只能用笼统的 `unavailable`（含义是「无法解析运行时/可能已派发/请求异常」）表达流程在途。对模型和客户来说，这看起来像**故障**或不确定状态，容易被误当成 gate 失败或已派发，也看不出「过一会儿再试就行」。
- **现在**：回执契约新增独立、可重试的 `code:"flow-busy"`。工具回执明确：
  - 流程仍有在途工作（交付/轮次/回交），**gate 暂不派发**；
  - 这是**可重试**的独立状态——**不是故障、不是 gate 失败**，也**不要当已派发**；
  - 等当前在途工作结束后**稍后重试**，并如实告知客户；不要据此判断 gate 通过或失败；
  - 应用回执的 `message`（原因）原样可见。

**不改什么**：既有码（`dispatched`/`already-dispatched`/`gate-not-found`/`criteria-missing`/`flow-incomplete`/`unavailable`/`rejected`）语义与文案不变；参数形状（`flowId?`/`gateId`/`note?`）、gate 校验/派发/账本写入仍全部在应用注入侧；本工具仍不写 flow/账本、不做治理判定；gate 复核 ≠ 验收通过 ≠ 客户批准。

## 内部契约细节

| 位置 | 改动 |
| --- | --- |
| `src/model/runtime.ts` · `RequestGateReviewResult.code` | 联合类型新增 `"flow-busy"`（既有码保持）。注释写明：可重试的独立返回码，不是故障、不是 gate 失败、不代表已派发，`message` 必须带原因。 |
| `src/provider/runtime/tools.ts` · `REQUEST_GATE_REVIEW_CODES` | 冻结枚举加入 `"flow-busy"`；契约外 code（含形近 `flow_busy`/`FLOW-BUSY`）仍 fail-closed。 |
| `src/provider/runtime/tools.ts` · `requestGateReviewResultMessage` | `flow-busy` 分支先于 `ok` 分支判定：一律返回 `ok:false` + 可重试说明；若应用给出矛盾回执 `ok:true + flow-busy`，按「暂未派发」处理并注明矛盾，绝不伪造成功/已派发/已受理。 |
| `src/provider/runtime/schema.ts` · `request_gate_review` 描述/指引 | 代码清单加入 `flow-busy`，说明其「在途、暂不派发、可稍后重试、不是故障/不是 gate 失败」；指引区分「flow-busy 可稍后重试」与「其它失败不要无脑重复请求」。 |

## 跨角色依赖（如实登记）

- **应用注入侧需配合**：`RequestGateReviewFn` 的实现（编排/桌面注入端）在检测到「流程仍有在途交付/轮次/回交」时，应返回 `{ ok:false, code:"flow-busy", message:"<可读原因>" }`，而不是笼统 `unavailable`。该实现不在本角色写集，本记录**未改、未验证**；在应用侧改完之前，客户可见行为仍是旧码。
- **同工作树的并行配套（只读核对，未改、未验收）**：门禁引擎角色卡已加入 `flow-busy` 可重试语义（`src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/gate-review-flow-busy.test.ts`），PM 已加入相关 i18n 文案；截至本记录时，编排/桌面注入侧的 `flow-busy` 返回逻辑尚未出现在本工作树（`grep flow-busy src app` 仅命中注释/角色卡文本与运行时核心实现）。相邻套件只读复跑：编排 `request-gate-review` 2/2、门禁 `gate-review-flow-busy` 3/3 通过。
- 未改 `app/desktop/`、`src/pipeline/orchestration/`、门禁/PM/i18n；未 commit/push；未重启应用。

## 验证（本机 Windows 11，worktree `gate-review-flow-busy`，2026-10-27）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` | **exit 0**，0 错 |
| gate 复核工具单测 | `node --test test/runtime-core/request-gate-review-tool.test.ts` | **11/11 通过**，exit 0（新增 flow-busy 合法回执、矛盾回执、形近非法码用例） |
| runtime-core 全目录回归 | `node --test "test/runtime-core/**/*.test.ts"` | **380 计 / 373 过 / 3 红 / 4 skip**；3 红均为既有 Windows symlink `EPERM`（`file-write-safety` D3 ×1、`session-store` ×2），零新红 |

## 测试覆盖点

- 合法 `flow-busy`（`ok:false`）：结果 `ok:false`；文案含 `code=flow-busy`、「流程仍有在途工作（交付/轮次/回交）」「暂不派发」「可重试」「不是故障」「不是 gate 失败」「不要当已派发」；回执 `message` 原样出现；`flowId`/`gateId` 如实呈现；**不出现**「gate 复核已派发」「请求已受理」。
- 矛盾回执 `ok:true + flow-busy`：按暂未派发处理（`ok:false`），注明矛盾，不得伪造成功。
- 非法码：`flow_busy` / `FLOW-BUSY` / 其它未知码 → 仍走契约外 fail-closed「未返回明确结果」。
- schema 文案钉住 `flow-busy` 与「可稍后重试」。
