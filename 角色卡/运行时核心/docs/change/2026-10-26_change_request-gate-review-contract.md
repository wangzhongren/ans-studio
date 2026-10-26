---
id: request-gate-review-contract-change
type: change
title: "Gate 复核请求契约与工具：request_gate_review（Model/Provider 层）"
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: implemented-unverified
related: [runtime-core]
events:
  - date: "2026-10-26"
    kind: implemented
    summary: 客户授权后落 RequestGateReviewInput/Result/Fn 与 GovernedToolsOptions.requestGateReview、request_gate_review 工具与 schema；工具只做形状校验并原样转达回执，契约外 code fail-closed；request_acceptance 形状/语义/文案零变化；新增 request-gate-review-tool.test.ts 10 例；runtime-core 全目录 329 计/322 过/3 既有 Windows symlink 红/4 skip（较基线 +10 计 +10 过零新红）；npm run typecheck exit 0
---

# Gate 复核请求契约与工具（`request_gate_review`）

**状态分开写**：已实现（下列改动路径全部落盘）；已验证（本机 Windows 上的新增测试、runtime-core 全目录回归与 `npm run typecheck`，见「验证」）；**未验证**（应用侧 gate 校验/派发、注入端接线、真实桌面/模型端到端、独立验收、非 Windows 平台）。

依据：客户 2026-10-26 确认「独立复核的权威只放在验收角色（Proof）；统筹只协调与检查证据完整性；对关键节点设置验收门禁（gate），由 Proof 独立判定」，并授权实施 `request_gate_review` 的 **Model/Provider 契约与工具**；设计基线为 `角色卡/项目管理/docs/design/2026-10-26_design_proof-gate-reviews.md` §5.2、§5.5、§10（A4）、§12。客户追加要求：

1. gate 复核是**独立于最终验收**的通道（`request_acceptance` 语义不变，仍只用于最终验收）；
2. gate `fail` 必须至少一个 blocker/major；只有 minor/nit 的 fail 不得触发返工（防吹毛求疵）；
3. 工具回执必须如实，**不把 `dispatched` 说成通过**（gate 复核 ≠ 验收通过 ≠ 客户批准）。

本任务范围只有运行时核心的契约、工具、schema、测试与本角色文档；应用侧实现（`requestGateReviewForProject`、gate 记录/报告处置/返工路由）与注入端（编排/桌面）不在本轮写集。

## 以前怎样、现在怎样

**以前**：运行时契约只有 `request_acceptance`（最终验收唯一主动通道）；关键节点 gate 复核没有专用请求通道——统筹即使做了证据完整性检查，也没有工具可请应用派 Proof 做 gate 复核。

**现在**：新增与 `request_acceptance` 同模式的独立通道：

- `src/model/runtime.ts` 冻结三符号＋一个能力位：
  - `RequestGateReviewInput { flowId?: string; gateId: string; note?: string }`（`gateId` 必填＝gate 步骤 id；`flowId` 省略＝当前/默认流程，由应用归一；`note` 可选有界说明，不写账本、不参与判定）；
  - `RequestGateReviewResult { ok; code: "dispatched" | "already-dispatched" | "gate-not-found" | "criteria-missing" | "flow-incomplete" | "unavailable" | "rejected"; message; flowId?; gateId?; runtime?: RuntimeKind }`；
  - `RequestGateReviewFn = (input) => Promise<RequestGateReviewResult>`；
  - `GovernedToolsOptions.requestGateReview?: RequestGateReviewFn`（与 `requestAcceptance` 同模式；未注入 ⇒ 工具不注册）。
- `src/provider/runtime/tools.ts` 注册 `request_gate_review`：
  - handler **只做参数形状校验**并**原样转达**应用回执（`ok`/`code`/`message`，可选 `flowId`/`gateId`/`runtime`）；
  - 契约外回执（缺失/非对象/缺 `ok`/`code`/`message`/未知 code）⇒ fail-closed「未返回明确结果」，按未派发/失败处理；所谓 `passed`/`done` 等契约外 code 同样**绝不当成功**；
  - 能力抛错/会话中止 ⇒ 如实「未完成/未获结果」，不假设已派发。
- `src/provider/runtime/schema.ts` 登记工具描述：**仅统筹可用**、gate 复核独立于最终验收、`dispatched` 只表示已派 Proof、gate fail 只按 blocker/major、minor/nit 不返工、失败不伪装。

`request_acceptance` 的工具、输入输出、冻结 code、文案、注入条件与行为**逐字未改**（零回归由测试钉住）。

## 工具层校验（触达能力之前，不猜测、不截断）

| 参数 | 规则 | 非法时 |
| --- | --- | --- |
| `gateId` | **必填**字符串，匹配 `GOVERNANCE_SLUG_PATTERN`（`^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`，2–64 位、首尾小写字母/数字） | 拒绝（`ok:false`，`未执行`）；能力零调用 |
| `flowId` | 可选；缺省/`null`/空白＝当前流程（由应用归一）；给出时须为字符串 | 拒绝；能力零调用 |
| `note` | 可选；缺省/`null`＝未提供；给出时须为非空字符串且 ≤ 2000 字（按 Unicode 码点计，超长拒绝、不截断） | 拒绝；能力零调用 |

`gateId` 只校验 slug 形状；它是否是真 gate 步骤、是否 pending、`gateKind` 是否合法等**全部由应用能力校验**（本层不读 flow、不判治理）。`note` 上限 2000 字为工具层有界文本约束（设计未定数值；本层选保守上限并在 schema 描述中公开），超长拒绝而非静默截断。

## 回执语义（冻结 code；工具原样转达）

| code | 工具呈现 | 纪律 |
| --- | --- | --- |
| `dispatched` | `ok:true`：gate 复核已派发（已请 Proof 独立复核） | **只表示已派 Proof**；不代表 gate 已通过、不代表最终验收通过、不代表客户批准 |
| `already-dispatched` | 按应用 `ok` 原样转达（受理/此前已派） | 不重复派发；是否通过以 Proof 报告与 flow 步骤状态为准 |
| `gate-not-found` | `ok:false`：未成功 | 不声称已派发；如实告知 |
| `criteria-missing` | `ok:false`：未成功 | 统筹不写 `docs/acceptance/**`；由 Proof 补/递增 criteria 后重交 |
| `flow-incomplete` | `ok:false`：未成功 | 按 message 补前置/证据；不得用提交代替缺步骤 |
| `unavailable` | `ok:false`：未成功（可能已派发） | 不绕过、不自判、不伪造通过；用 `flow_get` 核对后如实说明 |
| `rejected` | `ok:false`：被应用**退回** | 按 message 区分「gate 已 done / 已 superseded / 返工未完成」；协调修复后重交，不原样死循环 |
| 契约外（未知） | `ok:false`：应用未返回明确结果，按未派发/失败 | 绝不当已派发，更不当 gate 已通过 |

成功回执文案固定重申：**gate 复核 ≠ 验收通过 ≠ 客户批准**；`dispatched` 只表示已派 Proof；gate 失败只按 blocker/major 判定，只有 minor/nit 不构成返工依据。

## 改动路径（位置 → 改动）

| 文件 | 改动 |
| --- | --- |
| `src/model/runtime.ts` | 新增 `RequestGateReviewInput/Result/Fn`（含章节注释与纪律）与 `GovernedToolsOptions.requestGateReview?`；既有类型/`requestAcceptance` 形状未动。 |
| `src/provider/runtime/tools.ts` | 新增 `REQUEST_GATE_REVIEW_TOOL_NAME`；`REQUEST_GATE_REVIEW_CODES` 冻结枚举、`REQUEST_GATE_REVIEW_NOTE_MAX_CHARS=2000`、`readGateReviewNote`、`requestGateReviewResultMessage`、`makeRequestGateReviewTool`；`abortedToolResult` 增本工具中止文案；`buildGovernedTools` 注入才注册（不新增第二份能力注册）。 |
| `src/provider/runtime/schema.ts` | 新增 `request_gate_review` 分支：`{flowId?, gateId, note?}`，`required:["gateId"]`、`additionalProperties:false`；描述/指引钉住独立通道、仅统筹、`dispatched` 语义、blocker/major 与 minor/nit 规则、失败不伪装。 |
| `test/runtime-core/request-gate-review-tool.test.ts` | 新增 10 例：未注入不注册（且不影响 `request_acceptance`）、注入只新增本工具且 schema/文案钉点、载荷原样透传与缺省不造键、非法参数前置拒绝（含 64/65 字符 slug 与 2000/2001 字 note 边界）、回执 code 矩阵原样转达、未知 code（含 `passed`/`done`）fail-closed、抛错/中止不假设已派发、`request_acceptance` 零回归、Service `...options` 透传。 |
| `角色卡/运行时核心/docs/feature/runtime-core.md` | 记录本通道行为、回执纪律与当前接线状态。 |
| `角色卡/运行时核心/feature-map.md` | 新增功能导航行与证据链接。 |
| `角色卡/运行时核心/memo.md` | 追加本轮实施摘要。 |

## 明确不做 / 未覆盖（跨角色缺口）

1. **应用侧未实现**：`requestGateReviewForProject`（gate 存在/pending/前置/证据/标准校验、Proof 派发、gate 记录 `gate-review-record/v1`、账本 `dispatch.accepted`/`gate.review`、返工路由、重启恢复）全部属桌面窗口/编排后续波次（设计 §5.3–§5.7、§8）。本层不写 flow/账本、不派发。
2. **注入端未接线**：`src/pipeline/orchestration/run-role.ts` 仅 convener 注入、`app/desktop/session.ts`/`interface.ts`/`main.ts` 能力接线均未落 ⇒ **当前生产会话不会注册 `request_gate_review`**（能力缺席＝fail-safe toward 现状，不改变任何现有行为）。
3. **未改 Flow 契约**：无 `gateKind`、无 `awaiting-gate`、无新 `FlowStepKind`、无账本 kind、无客户卡种类、无 i18n 文案（均属其他角色/后续波次）。
4. **未改 `request_acceptance`**：形状、冻结 code、校验、注入范围、文案逐字不变；gate 未完成时它仍由既有 `evaluateFlowCompletion` 返回 `flow-incomplete`。
5. **仅统筹可用是注入端判据**：本层不硬编码角色 id（沿 `requestAcceptance` 先例）；若注入端错误地注入给其他角色，工具层不会按角色拒绝——注入范围测试属注入端。
6. 未跑真实模型/凭据/网络，未做独立验收；本机为 Windows 11。

## 验证（本机，2026-10-26）

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0，0 错 |
| 新增文件 `node --test test/runtime-core/request-gate-review-tool.test.ts` | **10/10 通过**，exit 0 |
| `node --test "test/runtime-core/**/*.test.ts"` | **329 计 / 322 过 / 3 红 / 4 skip**；3 红均为既有 Windows symlink EPERM（`file-write-safety` D3 链接用例 ×1、`session-store` ×2），与改动前基线 **319 计 / 312 过 / 3 红 / 4 skip** 相比 +10 计 +10 过、零新红 |

## 风险与后续

- **门禁只能靠注入端收紧**：工具层不判角色；若未来把能力注入给非统筹会话，需在注入端修正（与 `request_acceptance` 同风险面）。
- **note 上限为本地约定**：设计未给数值；本层取 2000 字并在 schema 公开，应用侧派发文案若需更严可再收紧（但不要静默截断）。
- **回执依赖应用如实**：`unavailable` 时应用应写明「可能已派发，请用 flow_get 核对」；工具层只如实转达，不重试、不猜测。
- **端到端未验**：gate 记录、报告解析、返工、重启恢复与真实 Proof 会话未接线，A4/A7/A8 的完整证据需应用侧实现后由独立验收补齐。
