---
id: view-image-same-turn-contract-change
type: change
title: "图片查看 view_image 同轮交付共享契约（第一阶段 + Gate 3：Pi/Claude/Codex 已启用 tool-result，demo 未启用）"
created: "2026-10-27"
updated: "2026-10-27"
timezone: Asia/Shanghai
status: implemented-unverified
related: [runtime-core]
events:
  - date: "2026-10-27"
    kind: implemented
    summary: 按设计 2026-10-27_design_view-image-same-turn.md 落地第一阶段（零行为变化）：Model 增 ViewImageDeliveryMode/ViewImageReceipt/ViewImageInput.turnId/ToolResult.images+imageDelivery/RuntimeViewImagePolicy+RUNTIME_VIEW_IMAGE_POLICY（初始四项全 next-turn）；tools.ts 的 view_image 按 policy 分支（tool-result 结果带图、message 走共享 i18n key main.viewImage.sameTurn；next-turn 逐字保持 2026-10-26 行为），新增每轮预算（仅 tool-result 计数）与 view_image.result 审计（不落 base64）；schema 文案改为同轮优先/回退/不假看；session.ts 按 runtime 注入 policy（tool-result 用内联受理回执、不触达桌面能力；未注入 viewImage 仍不注册）；中止兜底文案按交付方式分支（tool-result 不再声称排队/下一轮）；新增/更新 12 例测试（view-image-tool 10→20、新增 view-image-policy 2 例）；npm run typecheck exit 0；runtime-core 366 计/359 过/3 既有 Windows symlink 红/4 skip（较 2026-10-26 基线 +22 计 +22 过、零新红；其中本改动 +12，另 +10 来自同工作树其它角色在飞用例）
  - date: "2026-10-27"
    kind: implemented
    summary: "Gate 3（Pi 真实视觉探针通过，证据 角色卡/Pi适配器/docs/change/2026-10-27_probe_pi-tool-result-images.md）：仅把 RUNTIME_VIEW_IMAGE_POLICY.pi.delivery 翻为 tool-result，Pi 的 maxImageBytes=10MB/4 张/20MB 维持；Claude/Codex/demo 保持 next-turn（未动 Claude 5MB）。policy 契约测试改为 Pi tool-result+其余 next-turn；新增 Service+pi 用例（工具结果带 images、不触达桌面能力、message 走共享 i18n key）。npm run typecheck exit 0；runtime-core 367 计/360 过/3 既有 Windows symlink 红/4 skip；编排 view-image 3/3、桌面 message-queue 18/18（均 demo，仍 next-turn）。"
  - date: "2026-10-27"
    kind: implemented
    summary: "Gate 3（Claude 真实探针通过，证据 test/claude-adapter/tool-result-images-live.probe.ts 与 角色卡/Claude适配器/docs/change/2026-10-27_change_tool-result-images-claude.md：单次 prompt、工具调用 1 次、2906ms，第二次模型请求 tool_result 带 image/png 178 bytes、sha16 匹配，模型回答“主色调红色”）：把 RUNTIME_VIEW_IMAGE_POLICY.claude.delivery 翻为 tool-result，并按设计 §5.2 把 maxImageBytes 收紧为 5MB（5242880），4 张/20MB 维持；Pi 不动，demo/codex 仍 next-turn。policy 契约测试改为 Pi/Claude tool-result+5MB、demo/codex next-turn；新增 Service+claude 用例（同轮附图、不触达桌面能力、5MB 超限失败无图）。npm run typecheck exit 0；runtime-core 368 计/361 过/3 既有 Windows symlink 红/4 skip；编排 view-image 3/3、桌面 message-queue 18/18（均 demo，仍 next-turn）。"
  - date: "2026-10-27"
    kind: implemented
    summary: "Gate 3（Codex 以客户确认的 Chat Completions/Pi 网关为主路径，真实探针 3/3 通过，证据 角色卡/Codex适配器/docs/change/2026-10-27_change_tool-result-images-codex.md 与 test/codex-adapter/chat-completions.probe.ts：工具消息 data URL 图片被真实模型看到；Responses/app-server 真实模型仍 blocked——Pi 网关无 /v1/responses，传输回环 4/4 绿但无真实模型证据）：把 RUNTIME_VIEW_IMAGE_POLICY.codex.delivery 翻为 tool-result，maxImageBytes=10MB/4 张/20MB 维持；Pi/Claude 不动，demo 仍 next-turn。注意 policy 是 runtime 级单开关（不区分 wire），应用需配置 ANS_CODEX_WIRE_API=chat 才走已验证路径。policy 契约测试改为 Pi/Claude/Codex tool-result、demo next-turn；新增 Service+codex 用例（同轮附图、不触达桌面能力）。npm run typecheck exit 0；runtime-core 369 计/362 过/3 既有 Windows symlink 红/4 skip；编排 view-image 3/3、桌面 message-queue 18/18（均 demo，仍 next-turn）。"
---

# 图片查看 `view_image`：同轮交付共享契约（第一阶段）

**状态分开写，不混说：**

- **已实现**：`src/model/runtime.ts` 的共享增量契约；`src/provider/runtime/tools.ts` 的 policy 分支、每轮预算（仅 `tool-result` 计数）、结构化审计；`src/provider/runtime/schema.ts` 的同轮优先/回退文案；`src/service/runtime/session.ts` 的 policy/能力门接线；`test/runtime-core/` 新增与更新测试。
- **已启用（Pi + Claude + Codex，Gate 3）**：2026-10-27 三项真实探针通过后，`RUNTIME_VIEW_IMAGE_POLICY.pi/.claude/.codex` 的 `delivery` 已从 `next-turn` 翻为 `tool-result`——对应会话的 `view_image` 成功结果直接携带模型可见图片，不再排队下一轮附件。Pi 维持 `maxImageBytes=10 MB`/4 张/20 MB；**Claude 按设计 §5.2 收紧为 5 MB**（5242880 字节）/4 张/20 MB；**Codex 维持 10 MB**/4 张/20 MB，以客户确认的 Chat Completions/Pi 网关为主路径启用（**Responses/app-server 真实模型仍缺证据**：Pi 网关无 `/v1/responses`，仅传输回环 4/4 绿）。**demo 仍为 `next-turn`**（无模型，桌面回退路径不变）。注意 `RUNTIME_VIEW_IMAGE_POLICY` 是 **runtime 级单开关**（不区分 Codex wire）；应用需配置 `ANS_CODEX_WIRE_API=chat` 才走已验证路径，Responses 部署的同轮可见性未证实。
- **未真实验证（本角色）**：Pi/Claude/Codex 探针分别由各自适配器角色用真实模型/网关完成并记录（证据见下方链接），**本角色未复跑探针**；Codex Responses 真实模型证据仍缺；真实 Electron 端到端、独立验收仍未做；本记录只证明本角色边界内的契约、工具、Service 接线、翻表与单元测试。

依据：`角色卡/编排/docs/design/2026-10-27_design_view-image-same-turn.md`（客户 2026-10-27 已要求并授权「同轮看图修复」）。第一阶段目标：先把共享契约与 policy 骨架落稳，**零行为变化**，供适配器角色并行对接；逐引擎启用（Gate 3）由适配器探针证据驱动，本角色只负责翻 `RUNTIME_VIEW_IMAGE_POLICY`。**Gate 3 已完成 Pi、Claude、Codex 三项**：Pi 证据 `角色卡/Pi适配器/docs/change/2026-10-27_probe_pi-tool-result-images.md`（真实模型四轮：蓝/黄棋盘 PNG + 同图 JPEG/WebP + 纯红辅助；第二次模型请求的 toolResult 带同字节/SHA 图片；SDK 归一化 ≤2000×2000、≤4.5 MB base64 已离线核实）；Claude 证据 `角色卡/Claude适配器/docs/change/2026-10-27_change_tool-result-images-claude.md` 与探针脚本 `test/claude-adapter/tool-result-images-live.probe.ts`（单次 prompt、工具调用 1 次、2906ms，第二次模型请求 tool_result 带 image/png 178 bytes、sha16 匹配，模型回答“主色调红色”）；Codex 证据 `角色卡/Codex适配器/docs/change/2026-10-27_change_tool-result-images-codex.md` 与探针脚本 `test/codex-adapter/chat-completions.probe.ts`（客户确认 Chat Completions/Pi 网关为主路径，真实探针 3/3：工具消息 data URL 图片被模型实际看到；Responses/app-server 真实模型因 Pi 网关无 `/v1/responses` 仍 blocked，传输回环 4/4 绿）。功能说明见 [runtime-core](../feature/runtime-core.md)（其中 `view_image` 段落仍为 2026-10-26 两轮描述，按设计 §8.1 的文档收尾待合并后更新）。

## 以前怎样、现在怎样

**以前（2026-10-26，两轮附件）**：`view_image` 读取/校验项目内图片后，调用注入的 `ViewImageFn` 把图片排队为**同一角色下一轮用户提示的图片附件**；工具本轮只返回文本「已读取并排队；下一轮以图片附件提供；本轮不要假装已看到」，模型本轮看不到图片。

**现在（2026-10-27，Gate 3 后）**：契约与工具按运行时策略选择两种交付方式；**Pi、Claude、Codex 已启用 `tool-result`**，demo 仍 `next-turn`：

| 交付方式 | 工具行为（已实现） | 当前是否生效 |
| --- | --- | --- |
| `next-turn` | 与 2026-10-26 逐字一致：调用注入能力排队、成功/失败文案不变、结果不带图片 | **demo**（无模型，回退路径，行为与 2026-10-26 一致） |
| `tool-result` | 成功时结果带 `images:[PromptImage]` 与 `imageDelivery:"tool-result"`，`message` 来自共享 i18n key `main.viewImage.sameTurn`；能力回执必须声明 `mode:"tool-result"` 且与策略一致，否则 fail-closed | **pi / claude / codex**（Gate 3 真实探针通过后启用；Claude 有效单图上限 5 MB；Codex 需 `ANS_CODEX_WIRE_API=chat` 走已验证的 Chat/Pi 路径） |

**不改什么**：`next-turn` 的固定成功句、失败文案、路径/类型/大小校验顺序与注册门（未注入 `viewImage` ⇒ 工具不存在）逐字保留；`read_file`、`run_shell`、客户交互、后台任务等其它工具零变化；不写盘/不联网/不过写门禁；不改变任何写权。

## 契约字段（`src/model/runtime.ts`）

| 符号 | 形状 | 说明 |
| --- | --- | --- |
| `ViewImageDeliveryMode` | `"tool-result" \| "next-turn"` | 交付方式；**表值即唯一开关** |
| `ViewImageReceipt` | `{ ok: boolean; mode?: ViewImageDeliveryMode; message?: string }` | 能力回执；`mode` 缺省按 `next-turn` 处理（旧实现零破坏）；非法 `mode` 按契约外回执 fail-closed |
| `ViewImageInput` | `{ path: string; image: PromptImage; turnId?: string }` | 新增可选 `turnId`（工具从 `options.currentTurnId()` 取；回退批量按轮分组用） |
| `ViewImageFn` | `(input: ViewImageInput) => Promise<ViewImageReceipt>` | 兼容旧返回 `{ok:true}` |
| `ToolResult.images?` | `readonly PromptImage[]` | **仅 `ok:true` 且交付方式为 `tool-result` 时非空**；属模型面，不得进入诊断/展示事件/ANS 回放 |
| `ToolResult.imageDelivery?` | `ViewImageDeliveryMode` | 审计/展示用交付方式；不携带图片字节 |
| `RuntimeViewImagePolicy` | `{ delivery; maxImageBytes; maxImagesPerTurn; maxBytesPerTurn }` | 每运行时有效策略 |
| `RUNTIME_VIEW_IMAGE_POLICY` | `Readonly<Record<RuntimeKind, RuntimeViewImagePolicy>>`（冻结） | 当前 `pi/claude/codex=tool-result`（Claude 5 MB、其余 10 MB）、`demo=next-turn`；4 张/20 MB |

`GovernedToolsOptions` 新增 `viewImagePolicy?`（缺省＝`next-turn` + 10 MB/4 张/20 MB，工具层 fallback）；`RuntimeSessionOptions` 以 `Omit<…, "viewImagePolicy">` 排除，外部调用方不能自行改策略（与 `backgroundTasks` 同款）。

## policy 当前取值

| runtime | delivery | maxImageBytes | maxImagesPerTurn | maxBytesPerTurn |
| --- | --- | --- | --- | --- |
| demo | `next-turn` | 10 MB | 4 | 20 MB |
| pi | **`tool-result`** | 10 MB | 4 | 20 MB |
| claude | **`tool-result`** | **5 MB（5242880 字节）** | 4 | 20 MB |
| codex | **`tool-result`** | 10 MB | 4 | 20 MB |

注 1（Claude）：启用 `tool-result` 时已按设计 §5.2 把 `maxImageBytes` 收紧为 5 MB；工具在读取前即 fail-closed 拒绝 5 MB 以上单图（绝不把超限图交给引擎）。
注 2（Pi）：SDK 会在工具结果进入历史前自动归一化附图到 ≤2000×2000、≤4.5 MB base64（Pi 适配器角色离线核实，见探针记录 §四）；工具层 10 MB 源文件上限保留，归一化由 SDK 负责。
注 3（Codex）：客户确认 Codex 以 **Chat Completions/Pi 网关为主路径**；真实探针 3/3 证明工具消息 data URL 图片被真实模型看到。**Responses/app-server 真实模型证据仍缺**（Pi 网关无 `/v1/responses`，仅传输回环 4/4）。policy 是 **runtime 级单开关**，不区分 wire——Responses 部署的同轮可见性未证实；应用需配置 `ANS_CODEX_WIRE_API=chat` 才走已验证路径。适配器对 Chat 的其它限制（无原生线程恢复/MCP/联网搜索等）由适配器记录声明。

## 工具分支（`src/provider/runtime/tools.ts::makeViewImageTool`）

1. 校验顺序与 2026-10-26 完全一致：`readTargetPath` → 路径句法（空/NUL/绝对/盘符/`..`）→ `realpath` 根内复核（符号链接/junction 逃逸）→ 普通文件（目录指路 `list_dir`）→ 扩展名/MIME（`.png/.jpg/.jpeg/.webp/.gif`）→ 有效单图上限 `min(10 MB, policy.maxImageBytes)` → 读二进制 → 按实际字节复核。
2. **仅 `tool-result`**：读取前按 `currentTurnId()` 的轮次预留每轮预算（张数/原始字节）；失败/中止/回退/契约不一致时释放预留；超限在读取或交付前失败。`next-turn` **不计数、不引入新拒绝**（零行为变化）。
3. 调用注入能力（`tool-result` 时 Service 注入的是内联受理回执，不触达桌面实现），按回执归一：
   - `ok:false` / 抛错 / 回执缺失或非法 / `mode` 非法 ⇒ 失败，**无图**，文案如实写「未提供图片」；
   - `ok:true` + `mode:"tool-result"` 且 policy 也是 `tool-result` ⇒ 成功，`images:[image]`、`imageDelivery:"tool-result"`、`message`＝共享 i18n key `main.viewImage.sameTurn`；
   - `ok:true` + `mode:"next-turn"`（或 `mode` 缺省）⇒ 成功，无图、`imageDelivery:"next-turn"`，固定排队文案；
   - policy `next-turn` + 回执 `mode:"tool-result"` ⇒ **契约不一致，fail-closed**（不交付、不谎称）。
4. 审计：`options.diagnostics.record("view_image.result", …)`，只组装 `path/mimeType/bytes/mode(交付方式)/turnId/reasonCode/ok/toolName`；**不落 base64、`data:` URL 或图片字节**（测试用 sentinel 断言）。
5. 注册门不变：`options.viewImage === undefined` ⇒ `view_image` 根本不注册（即便 policy 为 `tool-result`）；同轮模式只是不再调用桌面实现。
6. 中止兜底（工具包装层 `abortedToolResult`，含「handler 成功后恰好中止」的改写）：按当前交付方式分支——`next-turn` 保持「图片附件排队**未获确认**；下一轮是否收到图片以系统为准」原意；`tool-result` 只说「图片交付**未获确认**」，**不得声称排队或下一轮附件**，且改写结果不保留 `images`。

## Service 接线（`src/service/runtime/session.ts`）

`providerFor` 按 `options.runtime` 读取 `RUNTIME_VIEW_IMAGE_POLICY`：

- `viewImage` 未注入 ⇒ `toolViewImage = undefined` ⇒ 工具不注册；
- policy `next-turn` ⇒ `toolViewImage = options.viewImage`（原引用透传，行为零变化）；
- policy `tool-result` ⇒ 注入内联回执 `async () => ({ ok: true, mode: "tool-result" })`，**不调用桌面能力**；
- 无论哪种，都向 `buildGovernedTools` 注入 `viewImagePolicy`；判断会话（`shellJudge`/`governanceJudge`）不走 `buildGovernedTools`，天然无 `view_image`。

## 改动路径（位置 → 改动）

| 文件 | 改动 |
| --- | --- |
| `src/model/runtime.ts` | 新增 `ViewImageDeliveryMode`/`ViewImageReceipt`/`ViewImageInput.turnId`/`ViewImageFn` 新回执形状/`ToolResult.images`+`imageDelivery`/`RuntimeViewImagePolicy`/`RUNTIME_VIEW_IMAGE_POLICY`（初始四项 `next-turn`；Gate 3 后 `pi/claude/codex=tool-result`，Claude 5 MB）/`GovernedToolsOptions.viewImagePolicy`；更新两轮附件注释为「同轮优先 + 回退」。 |
| `src/provider/runtime/tools.ts` | 重写 `makeViewImageTool`：policy 分支、回执 `mode` 归一与一致性 fail-closed、每轮预算（仅 tool-result、按轮重置、失败释放）、`view_image.result` 审计；`abortedToolResult` 按交付方式分支（tool-result 不声称排队/下一轮）；新增 `VIEW_IMAGE_MAX_IMAGES_PER_TURN`/`VIEW_IMAGE_MAX_BYTES_PER_TURN`/`VIEW_IMAGE_DEFAULT_POLICY`；`next-turn` 成功/失败文案逐字保留。 |
| `src/provider/runtime/schema.ts` | `view_image` 描述/`promptGuidelines` 改为「同轮工具结果附图优先；回退时下一轮附件；未收到图片不得假装已看到」，保留路径/类型/大小/不写盘/不联网/不过写门禁声明。 |
| `src/service/runtime/session.ts` | `providerFor` 读 `RUNTIME_VIEW_IMAGE_POLICY` 接线 `viewImage`/`viewImagePolicy`；`RuntimeSessionOptions` `Omit` `viewImagePolicy`。 |
| `test/runtime-core/view-image-tool.test.ts` | schema 文案断言更新；新增 10 例：policy 表冻结/Pi/Claude/Codex tool-result+Claude 5MB+demo next-turn、显式 next-turn 零回归+turnId、tool-result 成功带图+i18n 文案、旧回执无 mode 回退、契约不一致/非法 mode fail-closed、tool-result 校验失败无图、每轮张数预算（重置/释放）、字节预算与更严单图上限、审计无 base64、中止兜底按交付方式分支（next-turn 原文保留 + tool-result 不声称排队/下一轮，含成功后恰好中止的改写）。 |
| `test/runtime-core/view-image-policy.test.ts` | 新增 5 例：四个运行时注册门不变（注入才注册/未注入不存在）；Service + demo 仍 next-turn 端到端（能力被调用、turnId 透传、结果无 images、交付 next-turn）；Service + pi / claude（5 MB 上限）/ codex 已翻 tool-result（结果带 images、不触达桌面能力、message 走共享 i18n key）。 |
| `角色卡/运行时核心/docs/change/2026-10-27_change_view-image-same-turn-contract.md` | 本记录。 |

## 明确不做 / 跨角色缺口

1. **适配器映射与探针归属**：Pi/Claude/Codex 适配器映射与探针分别由各自适配器角色完成（`角色卡/Pi适配器/docs/change/`、`角色卡/Claude适配器/docs/change/`、`角色卡/Codex适配器/docs/change/2026-10-27_change_tool-result-images-codex.md`）；本角色只按证据翻表，未改/未跑适配器测试。Codex 的 Responses 真实模型证据仍缺（Pi 网关无 `/v1/responses`），由客户/适配器侧另找环境后可补；本表是 runtime 级单开关，无法按 wire 分开。
2. **`main.viewImage.sameTurn` 由项目管理添加**：本角色开始实施时工作树尚无该 key；实施期间项目管理角色已在同一工作树合入 zh-CN/en-US（**本角色未改任何 i18n 文件**）。工具按共享 i18n 访问方式（`translate(DEFAULT_LOCALE, …)`）引用；测试以 `translate` 输出为期望值断言（不复制文案成第二来源），key 缺失时按既有缺失语义回退为 key 名（当时生产不可达——四项 policy 全 `next-turn`），key 存在时直接使用正式文案。文案契约由 PM 的 i18n 测试钉住。
3. **诊断落盘白名单缺口**：`src/common/shared/diagnostics.ts`（项目管理属主）的 `FIELD_NAMES` 当前不含 `mimeType`/`bytes`（交付方式以 `mode` 字段记录）。工具按设计 §6.2/§6.7 如实组装这些字段，单元测试以诊断替身断言；实际落盘只能保留白名单内字段——需要 PM 扩白名单后 mime/bytes 才会持久化。任何路径都不落 base64。
4. **中止兜底已按交付方式收尾（2026-10-27 追加）**：`abortedToolResult("view_image")` 现按当前 policy 分支——`next-turn` 保持原文（「图片附件排队未获确认；下一轮是否收到图片以系统为准」），`tool-result` 只说「图片交付未获确认」，不声称排队/下一轮，改写时不保留 `images`；对应测试已补（next-turn 原文保留 + tool-result 无排队/下一轮措辞 + 成功后恰好中止的包装层改写）。
5. **预算口径**：每轮 4 张/20 MB 只在 `tool-result` 计数（设计 R5 的同轮成本风险）；`next-turn` 保持既有排队行为。`currentTurnId` 缺省按会话级单桶。失败/中止/回退释放预留；工具包装层的「成功后恰好中止」改写在预算上会保守多计，不放大风险。
6. **未改**：`app/desktop/`、`src/pipeline/orchestration/`、门禁/PM/i18n、demo 项目；未 commit/push；未重启应用。设计 §8.1 要求的 feature-map/memo/api-spec/feature 文档收尾**未在本任务内完成**，留给实施收尾。

## 验证（本机 Windows 11，worktree `lead-governance-coordination`，2026-10-27）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` | **exit 0**，0 错 |
| 本角色图片工具单测 | `node --test test/runtime-core/view-image-tool.test.ts` | **20/20 通过**，exit 0 |
| Service 接线单测 | `node --test test/runtime-core/view-image-policy.test.ts` | **5/5 通过**，exit 0 |
| runtime-core 全目录回归 | `node --test "test/runtime-core/**/*.test.ts"` | **369 计 / 362 过 / 3 红 / 4 skip**；3 红均为既有 Windows symlink `EPERM`（`file-write-safety` D3 ×1、`session-store` ×2），与 2026-10-26 记录的基线 **344 计 / 337 过 / 3 红 / 4 skip** 相比 **+25 计 +25 过、零新红**。增量归属：本改动 **+15**（`view-image-tool` 10→20 共 10 例；新增 `view-image-policy` 5 例），其余 **+10** 来自同工作树其它角色的在飞用例（`request-requirement-change-tool`，本角色只读、未验收） |
| 编排零回归（demo，仍 next-turn） | `node --test "test/编排/view-image.test.ts"` | **3/3 通过**，exit 0 |
| 桌面零回归（demo，仍 next-turn） | `node --test "test/桌面应用/message-queue.test.ts"` | **18/18 通过**，exit 0（含真实 openRoleSession + view_image 集成） |

## 后续（Gate 3 收口后）

1. **适配器映射与探针归属**：Pi/Claude/Codex 均已完成映射与真实探针（Codex 走客户确认的 Chat Completions/Pi 网关主路径；Responses 真实模型证据仍缺）。证据分别在各适配器 `docs/change/`；本角色只按证据翻表，未改/未跑适配器测试。运行 core 的 `RUNTIME_VIEW_IMAGE_POLICY` 是 **runtime 级单开关**：Codex 应用需配置 `ANS_CODEX_WIRE_API=chat` 才走已验证路径。
2. **剩余前置依赖**：`main.viewImage.sameTurn` 已由项目管理角色在工作树合入（zh-CN + en-US）；仍待办的是扩展诊断白名单（`mimeType`/`bytes`）。桌面回退批量与门禁角色卡文案由各自角色按设计 §6.5/§8.1 并行完成；设计 §8.1 的 feature-map/memo/api-spec/feature 文档收尾待合并后更新。
3. **真实 Electron 端到端与独立验收**：由测试角色/独立验收在真实桌面补齐；本角色未做。
