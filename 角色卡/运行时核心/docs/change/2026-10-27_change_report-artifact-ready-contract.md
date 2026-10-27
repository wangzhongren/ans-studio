---
id: report-artifact-ready-contract-change
type: change
title: "验收标准产物汇报契约与工具：report_artifact_ready（Model/Provider 层）"
created: "2026-10-27"
updated: "2026-10-27"
timezone: Asia/Shanghai
status: implemented-unverified
related: [runtime-core]
events:
  - date: "2026-10-27"
    kind: implemented
    summary: 按客户 2026-10-27 设计落 ReportArtifactInput/Receipt/Fn 与 GovernedToolsOptions.reportArtifact、report_artifact_ready 工具与 schema；质检只向应用汇报、应用校验后决定是否收口；工具不写盘/不写 flow/不假装已接受，契约外回执与未声明 accepted 一律按未接受 fail-closed；新增 report-artifact-tool.test.ts 10 例；runtime-core 全目录 379 计/372 过/3 既有 Windows symlink 红/4 skip（基线 369/362/3/4，+10 计 +10 过零新红）；npm run typecheck exit 0
---

# 验收标准产物汇报契约与工具（`report_artifact_ready`）

**状态分开写**：已实现（下列改动路径全部落盘）；已验证（本机 Windows 上的新增测试、runtime-core 全目录回归与 `npm run typecheck`，见「验证」）；**未验证**（应用侧校验/收口实现、注入端接线、真实桌面/模型端到端、独立验收、非 Windows 平台）。

依据：客户 2026-10-27 新设计——**验收标准由质检写完后，质检只向应用汇报，应用校验后决定是否收口**；不要让应用盯文件自动勾卡，也不要让质检自己改 flow 状态。调度将本任务派发给运行时核心，负责 Model/Provider 契约与工具层。本任务范围只有运行时核心的契约、工具、schema、测试与本角色文档；应用侧实现与注入端（编排/桌面）不在本轮写集。

## 以前怎样、现在怎样

**以前**：验收标准写完后没有面向应用的专用汇报通道；质检若想推进流程只能依赖既有的 `flow_step_update`（改 flow 状态），或由应用旁路盯文件/事件自动判断——两都与「应用校验后收口」的新设计不符。

**现在**：新增应用中介的汇报工具：

- `src/model/runtime.ts` 冻结三符号＋一个能力位：
  - `ReportArtifactInput { flowId: string; stepId: string; path: string; summary?: string; sha256?: string }`；
  - `ReportArtifactReceipt { ok: boolean; accepted?: boolean; message?: string }`；
  - `ReportArtifactFn = (input) => Promise<ReportArtifactReceipt>`；
  - `GovernedToolsOptions.reportArtifact?: ReportArtifactFn`（未注入 ⇒ 工具不注册；`RuntimeSessionOptions` 经 `Omit` 继承＋Service `...options` 自动透传，Service 无需改动）。
- `src/provider/runtime/tools.ts` 注册 `report_artifact_ready`：
  - handler **只做基本参数形状校验**（`flowId`/`stepId`/`path` 非空字符串；`summary`/`sha256` 可选非空字符串；未知参数拒绝）并把载荷**原样**交给注入能力；
  - **不写盘、不读写 flow、不做治理判定、不假装应用已接受**；具体路径/步骤归属/哈希一致性与**是否收口**全部由应用能力校验；
  - 回执 `ok`/`accepted`/`message` **原样如实转达**；契约外回执（缺失/非对象/`ok` 非布尔/`accepted` 给出但非布尔）与 `ok:true` 但 `accepted` 缺席/为 false 一律按**未接受** fail-closed；能力抛错/中止 ⇒ 如实「未获结果」。
- `src/provider/runtime/schema.ts` 登记工具描述：应用中介、应用校验后决定收口、工具不改 flow/不写盘、`accepted:true` 不等于自动完成、回执原样转达、未注入即不存在。

现有 `view_image`、`dispatch_task`、`request_acceptance` 等能力/工具形状、注册条件与文案**逐字未改**（零回归由测试钉住）。

## 工具层校验（触达能力之前，不猜测、不截断）

| 参数 | 规则 | 非法时 |
| --- | --- | --- |
| `flowId` | **必填**非空字符串（工具层不做 slug/存在性校验——归属由能力侧） | 拒绝（`ok:false`，`未执行`）；能力零调用 |
| `stepId` | **必填**非空字符串（是否为该 flow 的验收标准步骤由能力侧校验） | 拒绝；能力零调用 |
| `path` | **必填**非空字符串（是否项目相对、存在、与约定产物一致由能力侧校验） | 拒绝；能力零调用 |
| `summary` | 可选；缺席/`null`＝未提供；给出时须为非空字符串 | 拒绝；能力零调用 |
| `sha256` | 可选；缺席/`null`＝未提供；给出时须为非空字符串（**格式与内容一致性由能力侧校验**，工具不重算） | 拒绝；能力零调用 |
| 未知参数 | 本工具不接受任何未声明参数（尤其 `status`/`evidence`/`expectedRevision` 等 flow 变更面） | 拒绝；能力零调用 |

## 回执语义（工具原样转达）

| 应用回执 | 工具呈现 | 纪律 |
| --- | --- | --- |
| `{ok:true, accepted:true, message?}` | `ok:true`：应用已收到并**接受**该产物汇报 | **汇报成功 ≠ 自动完成**；是否收口/推进 flow 由应用决定并写入，质检不得自行改 flow，也不得说成验收已通过 |
| `{ok:true, accepted:false, message?}` | `ok:false`：应用已收到但**未接受** | 不宣称已收口；按 message 修正后重试或如实告知 |
| `{ok:false, ...}` | `ok:false`：未受理/未通过应用校验 | 按回执原因修正；不重试撒谎、不自行改 flow |
| `{ok:true}`（accepted 缺席） | `ok:false`：无法确认已接受（`accepted=未声明`） | fail-closed；不宣称已接受/已收口 |
| 契约外（缺失/非对象/`ok` 非布尔/`accepted` 非布尔） | `ok:false`：应用未返回明确结果 | 按未受理/未接受处理 |
| 能力抛错/会话中止 | `ok:false`：未获结果 | 不假设应用已收到/已接受 |

成功回执文案固定重申：**汇报成功不等于自动完成**——是否收口/推进 flow 步骤由应用校验后决定并写入；**不要自行修改 flow 状态**。

## 改动路径（位置 → 改动）

| 文件 | 改动 |
| --- | --- |
| `src/model/runtime.ts` | 新增 `ReportArtifactInput/Receipt/Fn`（含章节注释与纪律）与 `GovernedToolsOptions.reportArtifact?`；既有类型/工具能力位形状未动。 |
| `src/provider/runtime/tools.ts` | 新增 `REPORT_ARTIFACT_READY_TOOL_NAME`；`REPORT_ARTIFACT_READY_ARG_KEYS`、`reportArtifactResultMessage`、`makeReportArtifactReadyTool`；`abortedToolResult` 增本工具中止文案；`buildGovernedTools` 注入才注册。 |
| `src/provider/runtime/schema.ts` | 新增 `report_artifact_ready` 分支：`{flowId, stepId, path, summary?, sha256?}`，`required:["flowId","stepId","path"]`、`additionalProperties:false`；描述/指引钉住应用中介、应用校验后收口、不写 flow/不写盘、成功不等于自动完成、回执原样、未注入即不存在。 |
| `test/runtime-core/report-artifact-tool.test.ts` | 新增 10 例：未注入不注册（且其它能力不连带）、注入只新增本工具且既有工具零变化、schema 形状/无 flow 变更面/文案钉点、载荷原样透传与缺省不造键、非法参数矩阵前置拒绝零调用、回执矩阵（accepted/rejected/failure/未声明）、契约外与抛错 fail-closed、中止不触达、不改 flow（不调用 flow 读/更新/替代能力）、Service `...options` 透传。 |
| `角色卡/运行时核心/docs/feature/runtime-core.md` | 记录本通道行为、回执纪律与当前接线状态。 |
| `角色卡/运行时核心/feature-map.md` | 新增功能导航行与证据链接。 |
| `角色卡/运行时核心/api-spec.md` | 登记公开契约与工具说明。 |
| `角色卡/运行时核心/memo.md` | 追加本轮实施摘要。 |

## 明确不做 / 未覆盖（跨角色缺口）

1. **应用侧未实现**：产物校验（`flowId`/`stepId` 归属、步骤状态、`path` 是否约定产物、`sha256` 与文件当刻字节是否一致）与**是否收口**（是否调用 `completeAcceptanceCriteriaStep` 或等价收口路径）全部属桌面窗口/编排后续波次。本层不读文件、不写 flow/账本、不判定。
2. **注入端未接线**：`src/pipeline/orchestration/run-role.ts` 与 `app/desktop/session.ts`/`interface.ts`/`main.ts` 尚未注入 `reportArtifact` ⇒ **当前生产会话不会注册 `report_artifact_ready`**（能力缺席＝fail-safe toward 现状，不改变任何现有行为）。注入判据应为「内置质检（verifier/Proof）会话」；本层不硬编码角色 id。
3. **未改 Flow 契约**：无新 `FlowStepKind`、无新步骤状态、无账本 kind、无客户卡种类、无 i18n 文案。
4. **未改既有工具**：`view_image`、`dispatch_task`、`request_acceptance`、`request_gate_review`、`request_boundary_change`、`request_requirement_change` 的形状、校验、注入条件与文案逐字不变。
5. **工具不含 flow 变更面**：参数面没有 `status`/`evidence`/`expectedRevision` 等字段；未知参数（含这些）在触达能力前拒绝——质检不能借本工具改 flow。
6. 未跑真实模型/凭据/网络，未做独立验收；本机为 Windows 11。

## 验证（本机，2026-10-27）

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0，0 错 |
| 新增文件 `node --test test/runtime-core/report-artifact-tool.test.ts` | **10/10 通过**，exit 0 |
| `node --test "test/runtime-core/**/*.test.ts"` | **379 计 / 372 过 / 3 红 / 4 skip**；3 红均为既有 Windows symlink EPERM（`file-write-safety` D3 链接用例 ×1、`session-store` ×2），与改动前基线 **369 计 / 362 过 / 3 红 / 4 skip** 相比 +10 计 +10 过、零新红 |

## 风险与后续

- **门禁只能靠注入端收紧**：工具层不判角色；若未来把能力注入给非质检会话，需在注入端修正（与 `request_acceptance` 同风险面）。
- **`accepted` 语义冻结**：`ok:true` 但 `accepted` 缺席按未接受处理——应用若想表达「已受理但未决」，应同时给出 `accepted`（false）或在 `message` 说明；不要依赖工具层猜测。
- **应用回执必须如实**：`accepted:true` 表示「应用已校验并接受」，应用不得在未校验路径/哈希/步骤时回 accepted；收口写入仍须走应用既有收口路径（幂等/原子写）。
- **端到端未验**：桌面/编排注入、真实 Proof 会话与真实产物收口未接线，独立验收需应用侧实现后补齐。
