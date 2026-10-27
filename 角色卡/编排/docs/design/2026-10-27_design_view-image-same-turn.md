# view_image 同轮可见设计（同轮工具结果附图 + 下一轮附件回退）

- **角色**：编排（本设计记录 owner）
- **日期**：2026-10-27
- **状态**：**设计稿，未实现、未授权实施**；需客户确认，并先由项目管理修订生效工程法案 §二.14（当前仍把“两轮附件”写成硬规则）
- **基线**：worktree `lead-governance-coordination`，分支 `feat/scaffold-first-governance`，HEAD `99bbbe2`；工作树中已有其他角色的 `view_image` 在飞改动（本设计只读核对，未修改、未运行、未验收）
- **本次范围**：只做设计；不改应用源码、不改测试、不 commit、不重启应用；不触碰 `C:/Users/51054/Downloads/pixel-roguelike` 与 `demos/` 下游戏项目

---

## 一、背景与客户不满

客户明确不满的现状：

1. `view_image` 是**两轮附件**——工具本轮只回“已排队”，桌面把图片作为**下一轮用户提示**排队；角色在本轮看不到图片。
2. 长任务中一次角色轮次内多次 `view_image`，会为每张图生成一条独立队列消息，堆成一串；角色要等整轮结束、再被下一轮提示唤醒后才看到图，核对画面被严重延迟。
3. 客户要求**同轮看图修复**：工具调用后，模型紧接着的下一次调用就能看到图片，而不是等角色整轮结束。

原始两轮设计（`src/model/runtime.ts:42-60`、`src/provider/runtime/tools.ts:565-572`）的理由是“各引擎对工具结果附图的支持不一致”。本次只读核实后，这个前提在三个真实引擎上都已不成立或可验证：

- **Pi**：SDK 的 `AgentToolResult.content` 与 `ToolResultMessage.content` 类型均为 `(TextContent | ImageContent)[]`；agent loop 把工具结果消息 push 进 `messages`，下一次 provider 请求即可看到（`@earendil-works/pi-agent-core/dist/types.d.ts:370`、`dist/agent-loop.js` 的 `createToolResultMessage`/`messages.push`）。
- **Codex**：本机固定版本 `@openai/codex 0.162.1` 的 `app-server generate-json-schema --experimental` 生成结果中，`DynamicToolCallOutputContentItem` 已含 `{ type: "inputImage", imageUrl: string }`；动态工具响应可把图片作为 data URL 直接回给模型。
- **Claude**：适配器走进程内 MCP server（`server.instance.registerTool`），MCP `CallToolResult.content` 规范支持 `{ type: "image", data, mimeType }`；Anthropic `tool_result` 内容块也支持图片。但**本仓尚未做真实端到端探针**，必须按“规范兼容、待实测”对待。

同时存在一个**生效规则冲突**：`角色卡/项目管理/docs/project-rules.md` §二.14 当前明文规定“图片内容不进入本轮工具结果，排队为下一轮用户提示的图片附件”。本设计要改为“同轮工具结果附图优先、下一轮附件回退”，属于对已确认规则的实质修改；**必须由客户确认，并由项目管理修订 §二.14 后才能实施**。这是 gate 0，不是实现细节。

---

## 二、现状（只读核实）

### 2.1 调用链

| 层 | 现状 | 关键位置 |
| --- | --- | --- |
| 契约 | `ViewImageInput { path, image: PromptImage }`；`ViewImageFn` 返回 `{ok, message?}`；注释写明两轮附件 | `src/model/runtime.ts:42-60`、`GovernedToolsOptions.viewImage` 在 `:1903-1910` |
| 工具 | 路径句法/realpath 根内/普通文件/扩展名/≤10 MB/回读字节复核；调用 `ViewImageFn`；本轮工具结果只回文本 | `src/provider/runtime/tools.ts:565-729`、`:3523-3527` |
| 编排 | 能力面 `AdapterCapabilities.viewImage` 纯透传；`createRuntimeAdapterFactory` 透传到 Service/provider options | `src/pipeline/orchestration/run-role.ts:239-306`、`:786-794`、`:1602-1608`、`:3617-3621` |
| Service | `createRuntimeAdapter` 以 `...options` 交给 `buildGovernedTools`；未注入 ⇒ 不注册 | `src/service/runtime/session.ts:110-195`、`:148-163` |
| 桌面能力 | `createViewImageDelivery` 经 `SessionManager.send(..., {background:true,kind:"system"})` 把图片作为**下一轮**用户提示排队；`buildViewImagePrompt` 生成“这是 view_image 请求的图片：…” | `app/desktop/view-image.ts:42-92` |
| 桌面注入 | 开会话时按 `projectRoot/roleId/runtime` 定格，全部角色注入 | `app/desktop/session.ts:202-204`、`:438-443`、`:2488-2495`、`:2731-2732` |
| Pi 适配器 | `toPiTool.execute` 返回 `content: [{type:"text", text: result.message}]`，只回文本 | `src/common/pi-adapter/real-adapter.ts:398-438` |
| Claude 适配器 | MCP handler 返回 `content: [{type:"text", text: message}]` | `src/provider/claude/session.ts:346-388` |
| Codex 适配器 | 进程内 MCP handler 只回 text；动态工具 `contentItems` 只映射 `inputText` | `src/provider/codex/session.ts:42`、`:502-540`、`:578-579` |
| 门禁角色卡 | Proof/Steward/Lead 角色卡文本明确写“两轮附件”“本轮只回已排队” | `src/common/门禁引擎/governance-roles.ts:195-204`、`:486`、`:881`、`:1103-1108`、`:1168` |
| 测试 | 两轮行为被多处钉住 | `test/桌面应用/message-queue.test.ts:720-1094`、`test/runtime-core/view-image-tool.test.ts:54-178`、`test/编排/view-image.test.ts:119-178`、`test/门禁引擎/view-image-cards.test.ts` |

### 2.2 UI 现状

- 工具行缩略图已按 `view_image` 的**输入路径**渲染（`app/renderer/src/chat/ChatRow.tsx:224-228`、`:317-360`、`:457`），不依赖工具结果里的图片字节。
- 原生会话历史解析只取 text 块，忽略 image 块（`app/desktop/session-history.ts:146-157`、`:211-245`），因此工具结果附图不会破坏历史回放。
- 两轮模式下，图片提示是一条 `system` 后台投递，出现在队列/系统行；同轮模式不应再产生这条系统行。

### 2.3 两轮行为被测试钉住的位置

- 桌面投递：角色忙 ⇒ 图片系统提示入队；settle 后按序投递；`PromptOptions.images` 原引用（`test/桌面应用/message-queue.test.ts:836-884`）。
- 真实编排 + 假 provider：工具本轮回“已读取并排队”，settle 后投递下一轮附件（`test/桌面应用/message-queue.test.ts:935-1094`）。
- 运行时核心：成功回执逐字“已读取并排队；下一轮以图片附件提供；本轮不要假装已看到”；schema 文案钉住“两轮附件”（`test/runtime-core/view-image-tool.test.ts:54-178`）。
- 编排：`openRoleSession` 透传能力、工具注册、工具结果文本（`test/编排/view-image.test.ts:119-178`）。
- 门禁角色卡：Proof/Steward/Lead 的“两轮附件”文本（`test/门禁引擎/view-image-cards.test.ts`）。

**结论**：同轮方案必须把这些测试按新契约改写；不能只改实现而保留旧断言。

---

## 三、目标与非目标

### 3.1 目标

1. **同轮可见**：`view_image` 工具调用完成后，图片作为**本工具结果的一部分**进入同一模型工具循环；模型紧接着的下一次调用即可看到，不等角色整轮结束。
2. **不污染队列、不伪装客户消息**：支持同轮的引擎不产生任何 `SessionManager.send` 队列条目；不支持同轮的引擎回退为“下一轮附件”，且同一轮多次调用**合并为一条**系统投递。
3. **引擎无关的最小契约**：工具层只输出模型可见的图片附件；各适配器负责映射到原生工具结果内容；不在工具层写引擎分支。
4. **保留全部安全语义**：路径/扩展名/≤10 MB 校验、realpath 根内、普通文件、fail-closed、未注入不注册、审计事实、注入失败不谎称已看到。
5. **UI 可展示**：图片继续以工具行缩略图展示；同轮模式不新增假客户消息；回退模式最多一条系统行。
6. **可回退**：按引擎逐项开关；任何引擎探针失败即回退两轮附件，不需要数据迁移。

### 3.2 非目标

- 不新增角色、`FlowStepKind`、cardKind。
- 不改变 `view_image` 的任何写权；工具仍然只读项目内图片。
- 不做图片编辑、OCR、自动缩图（引擎侧已有能力按引擎处理；工具侧不新增图像库）。
- 不把图片字节写入 ANS 回放、诊断、工具展示事件或日志。
- 不改变客户带图消息、派发、回交、验收等既有投递语义。
- 不负责客户模型是否多模态；适配器只负责把图片送到引擎，是否可读由模型/网关决定，失败必须如实呈现。

---

## 四、方案比较与推荐

### 方案 A（推荐）：工具结果同轮附图

`view_image` 成功时把 `PromptImage` 放进本次 `ToolResult.images`；各适配器把 `ToolResult.images` 映射为原生工具结果内容块：

- Pi：`{ type: "image", data, mimeType }` 追加到 `content`；
- Claude：MCP `CallToolResult.content` 追加 `{ type: "image", data, mimeType }`；
- Codex：动态工具 `contentItems` 追加 `{ type: "inputImage", imageUrl: "data:<mime>;base64,<data>" }`。

工具循环本身负责把工具结果送回模型；Pi/Claude/Codex 都是同一轮内完成，不需要新的用户消息、队列或角色轮次。

**优点**：
- 引擎原生机制，最接近“工具结果附图”的标准语义；不需要自定义循环。
- 同轮可见，长任务不再堆队列。
- 工具结果与图片一一对应，因果清晰，不产生假用户消息。
- 回退路径可以完整保留两轮附件。

**代价**：
- 需要运行时核心新增 `ToolResult.images` 契约；三个适配器各加少量映射代码；Claude/Codex 需要探针。
- 工具结果附图会增大原生会话历史（base64），需要预算与审计纪律。

### 方案 B（评估后不推荐）：同一工具循环内注入用户消息

- Pi 有 `session.steer(text, images)`：在“当前 assistant 轮次执行完工具调用之后、下一次 LLM 调用之前”注入一条用户消息（`pi-coding-agent/dist/core/agent-session.d.ts:540-575`、`docs/sdk.md:68`）。这确实是同轮可见。
- Claude 适配器有 streaming input 队列（`current.input`），但工具 handler 内部把用户消息塞进队列的 drain 时机由 SDK 控制，无法保证“下一次模型调用前”看到；Codex 的 `turn/start` steering 也不是动态工具输出的直接语义。
- **致命问题**：它会向转录里加入一条**用户消息**，容易被模型/UI 当成客户发言；客户明确要求“不得伪装成客户消息或污染队列”。同时 Pi/Claude/Codex 的时机与语义不一致，不是引擎无关的最小路径。

**结论**：不采用 B。Pi 的 `steer` 只作为 SDK 能力登记，不作为本方案实现路径。

### 方案 C（只作为回退）：维持两轮附件

保留现有 `ViewImageFn` 队列投递，作为不支持同轮引擎的兼容路径；但按客户要求做**同轮批量**：同一角色同一轮多次 `view_image` 合并为一条系统投递，不再每图一条。

### 对比表

| 维度 | A 工具结果附图（推荐） | B 同轮用户消息注入 | C 两轮附件（回退） |
| --- | --- | --- | --- |
| 同轮可见 | 是（下一次模型调用） | 是（Pi 可保证，Claude/Codex 不可控） | 否（下一轮） |
| 引擎一致性 | 三引擎都是原生工具结果机制 | 各引擎时机/语义不一致 | 一致但延迟 |
| 假客户消息 | 否 | **是**（用户消息） | 否（system） |
| 队列污染 | 无 | 可能 | 每图一条（需批量修复） |
| 实现复杂度 | 中（契约 + 3 个适配器映射） | 高（自定义循环/队列控制） | 低（现状） |
| 回退能力 | 可逐引擎回退到 C | 难回退 | 即回退 |
| 推荐 | **采用** | 不采用 | 仅回退 |

---

## 五、引擎兼容性

### 5.1 Pi（证据最强）

- `AgentToolResult.content: (TextContent | ImageContent)[]`，`ToolResultMessage.content` 同形（`@earendil-works/pi-agent-core/dist/types.d.ts:370`、`pi-coding-agent/docs/message-types.md:161-169`）。
- agent loop 把工具结果消息 push 进 `messages`（`pi-agent-core/dist/agent-loop.js` 的 `createToolResultMessage` 与 `messages.push(toolResultMessage)`），下一次 provider 请求即包含图片；这是同一 `session.prompt()` 调用内，不是新轮次。
- `ImageContent` 形状与 `PromptImage` 逐字一致（`{type:"image",data,mimeType}`）。
- Pi 包内的 `processImage` 工具函数对用户附件有自动缩放/转 PNG 逻辑（`pi-coding-agent/dist/utils/image-process.js`），但**工具结果附图是否同样经过该管线尚未实测**；探针需覆盖 png/jpeg/webp/gif 与大图。
- **需要改的**：仅 `src/common/pi-adapter/real-adapter.ts::toPiTool` 的 `execute` 返回值；不需要改 Pi 的自定义循环（本来就不存在），也不需要改 `src/provider/pi/session.ts` 的 prompt 包装（图片走工具结果，不走用户 prompt）。

### 5.2 Claude（规范兼容，待探针）

- 适配器用进程内 MCP server 注册工具（`src/provider/claude/session.ts:343-389`）；MCP `CallToolResultSchema.content` 支持 `image` 块（`@modelcontextprotocol/sdk/dist/esm/types.d.ts` 的 `CallToolResultSchema`）。
- Anthropic `tool_result` 内容块支持图片；按 MCP/Anthropic 规范**预期** Claude Code 的 MCP 客户端会把 MCP image 块转成模型可见的 `tool_result` 图片块（这是待证结论，不是本仓已验证事实）。
- **本仓没有真实端到端证据**：MCP 客户端是否原样转发、是否受图片大小/MIME 限制、是否被 `PreToolUse` 钩子影响，都需要一个受控探针（见 §10.5）。在探针通过前，Claude 的 policy 必须保持 `next-turn`。
- 已知的提示图片 MIME 白名单为 png/jpeg/gif/webp（`src/provider/claude/session.ts:573`）；工具结果图片复用同一白名单。
- Anthropic API 对单图大小有上限（通常约 5 MB，base64/请求面；以官方文档与探针为准），因此 Claude 的有效单图上限应小于工具的 10 MB 全局上限。

### 5.3 Codex（schema 已确认，待真实回环探针）

- 适配器把 ANS 工具注册为动态工具（`dynamicTools`），模型侧通过 `item/tool/call` 请求，宿主用 `contentItems` 响应（`src/provider/codex/session.ts:502-540`、`:549-583`、`:602`）。
- 本机 `@openai/codex 0.162.1` 的 `app-server generate-json-schema --experimental` 已生成 `DynamicToolCallOutputContentItem`：
  - `inputText { text }`
  - `inputImage { imageUrl }`
  - `inputAudio { audioUrl }`
- 上游 Codex PR #10567 的语义：动态工具输出支持 text + image；**远程 HTTP(S) 图片 URL 会被拒绝，只接受 data URL**。因此实现必须用 `data:<mime>;base64,<data>`，不能写临时文件或远程 URL。
- 现有适配器的本地 `callTool` 类型只声明 `{type,text?}`（`src/provider/codex/session.ts:42`），需要扩出 `data`/`mimeType`，并同时改进程内 MCP handler 的返回内容与动态工具的 `contentItems` 映射。
- 图片数据**不得经过 `config.redact`**（否则 base64 可能被破坏）；只对文本块做 redaction。
- 需要探针确认 0.162.1 的 app-server 实际接受 `inputImage` data URL、单图/总请求大小上限，以及下一轮 Responses 请求确实包含图片。

### 5.4 demo / 未知运行时

- `demo` 是无模型的装配替身；没有“模型看到图片”的概念。`demo` 保持 `next-turn`，继续走桌面队列（但按本设计批量）。
- 任何未列入支持矩阵或探针失败的运行时，默认 `next-turn`。

### 5.5 兼容性矩阵（目标态）

| 引擎 | 同轮工具结果附图 | 证据状态 | 回退 |
| --- | --- | --- | --- |
| Pi | 是 | SDK 类型 + agent loop 已核实；图像管线待探针 | 下一轮附件 |
| Claude | 规范支持 | MCP/Anthropic 规范；本仓未实测，必须探针 | 下一轮附件 |
| Codex | 是 | 0.162.1 本机 schema 已含 `inputImage`；真实回环待探针 | 下一轮附件 |
| demo | 否 | 无模型 | 下一轮附件 |

---

## 六、契约设计

### 6.1 共享类型（运行时核心属主）

在 `src/model/runtime.ts` 增量定义（字段均可选，保持向后兼容）：

```ts
/** view_image 的交付方式：工具结果同轮附图 / 下一轮用户提示附件（回退）。 */
export type ViewImageDeliveryMode = "tool-result" | "next-turn";

export interface ViewImageReceipt {
  ok: boolean;
  /** 缺省按 "next-turn" 处理（旧能力实现零破坏）。 */
  mode?: ViewImageDeliveryMode;
  message?: string;
}

export interface ViewImageInput {
  path: string;
  image: PromptImage;
  /** 当前模型轮次 id（工具从 options.currentTurnId() 取；回退批量按轮分组用；可选）。 */
  turnId?: string;
}

export type ViewImageFn = (input: ViewImageInput) => Promise<ViewImageReceipt>;

export interface ToolResult {
  ok: boolean;
  message: string;
  /** 本轮工具结果附带的模型可见图片；仅 ok:true 且 mode:"tool-result" 时非空。 */
  images?: readonly PromptImage[];
  /** 审计/展示用交付方式；不携带图片字节。 */
  imageDelivery?: ViewImageDeliveryMode;
  execution?: RuntimeToolExecutionFactsV1;
  backgroundTask?: BackgroundTaskToolFactsV1;
}

/** 每个运行时的有效图片策略（单一来源；不在工具层写引擎分支）。 */
export interface RuntimeViewImagePolicy {
  delivery: ViewImageDeliveryMode;
  /** 有效单图上限（字节）；必须 ≤ VIEW_IMAGE_MAX_BYTES。 */
  maxImageBytes: number;
  /** 每模型轮次最多图片数。 */
  maxImagesPerTurn: number;
  /** 每模型轮次图片原始字节总预算。 */
  maxBytesPerTurn: number;
}

// 目标态；初始落地时四项先全部 next-turn（见 §9.1），逐引擎探针通过后再翻。
export const RUNTIME_VIEW_IMAGE_POLICY: Readonly<Record<RuntimeKind, RuntimeViewImagePolicy>> = Object.freeze({
  demo:   { delivery: "next-turn",   maxImageBytes: 10 * 1024 * 1024, maxImagesPerTurn: 4, maxBytesPerTurn: 20 * 1024 * 1024 },
  pi:     { delivery: "tool-result", maxImageBytes: 10 * 1024 * 1024, maxImagesPerTurn: 4, maxBytesPerTurn: 20 * 1024 * 1024 },
  claude: { delivery: "tool-result", maxImageBytes: 5 * 1024 * 1024,  maxImagesPerTurn: 4, maxBytesPerTurn: 20 * 1024 * 1024 },
  codex:  { delivery: "tool-result", maxImageBytes: 10 * 1024 * 1024, maxImagesPerTurn: 4, maxBytesPerTurn: 20 * 1024 * 1024 },
});
```

说明：

- **初始落地时四个 runtime 全部先设 `next-turn`**；每个适配器完成映射 + 探针证据后，再由运行时核心逐项翻成 `tool-result`。翻表是唯一开关，也是回滚开关。
- `maxImageBytes` 是**有效上限**，工具取 `min(VIEW_IMAGE_MAX_BYTES, policy.maxImageBytes)`；全局 10 MB 校验保留，Claude 等更严格的引擎提前拒绝，绝不把超限图塞给引擎。
- 每轮上限（建议 4 张 / 20 MB 原始字节）是材料性选择，需客户确认；可通过 `ANS_VIEW_IMAGE_MAX_PER_TURN` / `ANS_VIEW_IMAGE_MAX_TOTAL_BYTES` 覆盖（建议，非契约必需）。
- `ToolResult.images` 属于模型面；**不得**进入 `details`、诊断、工具展示事件或 ANS 回放。

### 6.2 工具行为（`src/provider/runtime/tools.ts`）

保留现有全部校验顺序：

1. `readTargetPath` → 路径句法（空、NUL、绝对/盘符、`..`）。
2. `realpath` 根内复核（符号链接/junction 逃逸）。
3. 必须是普通文件；目录指路 `list_dir`。
4. 扩展名/MIME：`.png/.jpg/.jpeg/.webp/.gif`。
5. 大小：`stat` 后先按有效上限拒绝；读入后按实际字节数复核。
6. 轮次中止检查。
7. 构造 `PromptImage`。

新增策略与交付：

- 工具构造时接收 `viewImagePolicy`（由 Service 注入，默认 `next-turn` + 10 MB/4 张/20 MB）。
- **每轮预算**：按 `options.currentTurnId()` 的变化重置 `{count, bytes}`；调用前**预留**名额/字节，失败/中止时释放；超限在读取/交付前失败。`currentTurnId` 缺省时按会话级预算处理，避免无界。
- 调用 `ViewImageFn` 后按回执归一：
  - `ok:false` / 抛错 / 非法回执 ⇒ 工具失败，`images` 为空，message 如实写明“未提供图片；本轮不要假装已看到”。
  - `ok:true` + `mode:"tool-result"`（且 policy 也是 `tool-result`）⇒ 成功，`images:[image]`、`imageDelivery:"tool-result"`；message 明确“图片已随本工具结果附上（同一轮可见）；若你的上下文未包含图片，请明确说明未看到，不要假装已看到”。
  - `ok:true` + `mode:"next-turn"`（或 mode 缺省）⇒ 成功，`images` 为空、`imageDelivery:"next-turn"`；message 明确“已读取并排队；下一轮以图片附件提供；本轮不要假装已看到”。
  - `mode:"tool-result"` 与 policy `next-turn` 不一致 ⇒ **契约违规，fail-closed**（不交付、不谎称）。
- **注册条件不变**：`options.viewImage === undefined` ⇒ `view_image` 根本不注册（结构性 fail-closed）。Service 的 inline wrapper 只在能力已注入时存在。
- **审计**：工具通过 `options.diagnostics` 记录结构化事实（`view_image.result` 或等价）：
  - `path`（项目相对路径）、`mimeType`、`bytes`、`delivery`、`turnId`、`roleId`（可用时）、`ok`；
  - 失败记录稳定 reason code（缺 path/路径语法/越界/目录/非普通文件/扩展名/超限/读取失败/中止/能力拒绝/回执非法/预算超限）；
  - **绝不记录 base64、`data`、图片字节或可还原图片的片段**。
- 工具 schema 描述更新：从“两轮附件”改为“优先同轮工具结果附图；引擎不支持时回退下一轮附件；无论哪种，未收到图片不得假装已看到”。`describeTool` 的 `promptGuidelines` 同步。

### 6.3 Service 接线（`src/service/runtime/session.ts`）

在 `createRuntimeAdapter` 的 `providerFor` 中，按 `options.runtime` 读取 `RUNTIME_VIEW_IMAGE_POLICY`：

```ts
const policy = RUNTIME_VIEW_IMAGE_POLICY[options.runtime];
const toolViewImage = options.viewImage === undefined
  ? undefined
  : policy.delivery === "tool-result"
    ? async () => ({ ok: true, mode: "tool-result" as const })
    : options.viewImage;
const tools = buildGovernedTools(options.gate, {
  ...options,
  viewImage: toolViewImage,
  viewImagePolicy: policy,
  // ...既有 backgroundTasks/readRoot/... 不变
});
```

- `viewImagePolicy` 加入 `GovernedToolsOptions`，并在 `RuntimeSessionOptions` 中 `Omit`，避免外部调用方绕过 Service 自行改策略（与 `backgroundTasks` 同款）。
- inline 模式下**不调用**桌面 `viewImage`；能力只作为“host 支持项目图片查看”的注册门。回退模式下才调用桌面实现。
- 判断会话（`shellJudge`/`governanceJudge`）不走 `buildGovernedTools`，天然没有 `view_image`，不受影响。
- 其他能力注入矩阵零变化；`requestAcceptance`/`requestGateReview`/`shellGate` 等仍按既有判据。

### 6.4 适配器映射

**Pi（`src/common/pi-adapter/real-adapter.ts::toPiTool`）**

```ts
const content: Array<
  { type: "text"; text: string } |
  { type: "image"; data: string; mimeType: string }
> = [{ type: "text", text: result.message }];
if (result.ok) for (const image of result.images ?? []) {
  content.push({ type: "image", data: image.data, mimeType: image.mimeType });
}
return { content, details, isError: !result.ok };
```

- `details` 增补 `images: { count, bytes, mimeTypes }`（无字节）；`facts.result` 同步。
- 不改 Pi 的 agent loop，不改 `makeRolePrompt` 的图片透传；`src/provider/pi/session.ts` 的 fake/legacy 路径如需展示测试事实，只做类型/测试补丁。

**Claude（`src/provider/claude/session.ts`）**

```ts
const content: Array<
  { type: "text"; text: string } |
  { type: "image"; data: string; mimeType: string }
> = [{ type: "text", text: redact(result.message) }];
if (result.ok) for (const image of result.images ?? []) {
  content.push({ type: "image", data: image.data, mimeType: image.mimeType });
}
return { content, isError: !result.ok };
```

- 三个返回点（无效上下文/成功/异常）保持语义：只有真实成功才附图；中止/异常不带图。
- MIME 白名单复用 `image/png|jpeg|gif|webp`；非白名单直接失败，不把非法图片交给 MCP。
- 文本走 `redact`；图片 `data`/`mimeType` 不走 redact。

**Codex（`src/provider/codex/session.ts`）**

- 本地 `callTool` 返回类型扩为 `{ content: Array<{type:string; text?:string; data?:string; mimeType?:string}>; isError?: boolean }`。
- 进程内 MCP handler 返回：

```ts
const content = [
  { type: "text" as const, text: config.redact(result.message) },
  ...(result.ok ? (result.images ?? []).map((image) => ({
    type: "image" as const, data: image.data, mimeType: image.mimeType,
  })) : []),
];
return { isError: !result.ok, content };
```

- 动态工具响应把 MCP content 映射为 `contentItems`：

```ts
const contentItems = result.content.map((item) =>
  item.type === "image" && typeof item.data === "string" && typeof item.mimeType === "string"
    ? { type: "inputImage" as const, imageUrl: `data:${item.mimeType};base64,${item.data}` }
    : { type: "inputText" as const, text: config.redact(item.text ?? "") }
);
return { success: !result.isError, contentItems };
```

- **只接受 data URL**，不写临时文件、不传远程 URL（上游明确拒绝远程图片 URL）。
- 图片数据不经过 `config.redact`；只有文本经过。
- `RuntimeToolResultFactsV1` 增补图片事实（count/bytes/mimeTypes），供展示/审计；不把 data URL 放进事件。

**demo（`src/provider/runtime/tools.ts::createDemoRuntimeAdapter`）**

- policy 为 `next-turn`，所以工具不会产生 `images`；demo 的脚本执行路径不需要图片映射。测试可断言“demo 不会走同轮附图”。

### 6.5 桌面回退批量（`app/desktop/view-image.ts` + `app/desktop/session.ts`）

仅当 `policy.delivery === "next-turn"` 时，桌面 `ViewImageFn` 被调用。目标行为：

- **同一角色、同一轮**多次 `view_image` ⇒ 只产生**一条**系统投递，`images` 包含本轮所有图片（顺序与文本路径顺序一致），文本列出所有路径。
- 单图时保持现有文本 `buildViewImagePrompt(path)` 以兼容；多图时新增 `buildViewImageBatchPrompt(paths)`：
  `这是 view_image 请求的图片（共 N 张）：path1；path2；…；请查看后判断。`
- 投递类别必须是 `background:true` + `kind:"system"`；**绝不**用 `kind:"message"`，不冒充客户消息，不抢活动角色。
- 目标仍按开会话时定格的 `{projectRoot, roleId, runtime}`，不认 `activeRoleId`。
- **批量落地机制（二选一，桌面窗口在边界内决定）**：
  1. **首选（保序 + 尽早入队）**：第一次 `view_image` 即经 `SessionManager` 入队（角色在本轮内必忙），后续同轮图片合并进同一条队列项的 `text`/`opts.images`；settle 后由既有投递机一次性送出。队列项可按 `dedupKey = view-image-batch:<roleId>:<runtime>:<turnId>` 查找并原地合并（`turnId` 由工具从 `options.currentTurnId()` 传入 `ViewImageInput.turnId`）；同一会话同一轮只可能有一条活跃批次，跨轮不合并。
     - **持久化边界如实**：现有 `PersistedDeliveryItemV1` 有意不落 `opts`（含 images；见 `app/desktop/session.ts:900-928`），所以图片跨应用重启仍会丢失；本设计不改变这一点，工具/桌面回执也不得声称图片已持久化。
  2. **备选（实现更小）**：桌面能力先在内存累积，SessionManager 在 settle 路径、`drainAllQueuesFor` 之前调用 `takeBatch()`，一次 `enqueueDelivery` 后走既有投递机。风险是应用崩溃时该轮图片丢失（与现有未持久化队列项同级的如实风险），需诊断记录。
- **失败语义**：能力受理只代表“已交给批量/投递机”，不代表模型已看到；工具文本仍写“下一轮以图片附件提供”。若批量入队或后续投递失败，桌面必须走既有 `delivery-note`/诊断如实报告，**不得**补一句“已提供”。
- **不改变**客户带图消息的 `send` 语义；批量只作用于 `view_image` 的 `system` 后台投递。
- 现有 `test/桌面应用/message-queue.test.ts:720-1094` 的两轮用例按新语义改写：
  - 单图：settle 后一条 system 投递，文本与 `buildViewImagePrompt` 逐字一致；
  - 多图：settle 后**恰一条** system 投递，`images.length === N`，文本列出 N 个路径；
  - 失败/非法载荷：零投递、零伪造；
  - 目标定格、不抢活动角色等既有断言保留。
- 现有测试中“调用后立即 `queue.length === 1`”的断言会改为“settle 后恰一条”或“同轮合并后一条”；这是有意的契约变更，测试属主需同步。

### 6.6 UI

- **不需要改桌面UI**：
  - 工具行缩略图已按 `view_image` 输入路径渲染，同轮/回退都显示；
  - 同轮模式不产生任何系统/客户行；
  - 回退模式最多一条系统行（批量）。
- 如果客户要求“同轮已看”/“下一轮待看”的状态徽标，才需要桌面UI角色新增展示字段；本设计不把它作为必需项，避免扩大写集。
- 原生历史解析已忽略 image 块，不需要改。

### 6.7 审计事实（结构化、无字节）

| 事实 | 来源 | 内容 |
| --- | --- | --- |
| 工具读取/校验 | `view_image` 工具 diagnostics | `path`、`mimeType`、`bytes`、`ok`、reason code、`turnId`/`roleId`（可用时） |
| 交付方式 | 工具 diagnostics + `ToolResult.imageDelivery` | `tool-result` / `next-turn` |
| 适配器映射 | 各适配器 `details` / `RuntimeToolResultFactsV1` | `images: {count, bytes, mimeTypes}`；无 data |
| 回退批量 | 桌面队列/诊断 | 批次 `path` 列表、图片数、投递成功/失败；无 data |

**硬纪律**：任何日志/事件/回放/队列摘要都不得包含 base64 或 `data:` URL；测试用 sentinel 断言（例如用一段可识别的 base64 片段，断言不出现在诊断/事件 JSON 中）。

---

## 七、数据流

### 7.1 同轮附图（推荐主路径）

```text
第 N 轮（同一模型轮次）
role ── view_image(path) ──▶ 校验(path/类型/大小/预算)
                              │
                              ├─ 失败 ──▶ ToolResult{ok:false}（无图；不得假装已看）
                              │
                              └─ 成功 ──▶ ToolResult{ok:true, images:[PromptImage]}
                                            │
                         适配器把 images 映射为原生工具结果内容
                         （Pi ImageContent / Claude MCP image / Codex inputImage）
                                            │
                         工具循环把工具结果送回同一模型
                                            │
                        role 在下一次模型调用中直接看到图片（本轮内）
```

### 7.2 回退批量（不支持同轮的引擎）

```text
第 N 轮
role ── view_image(path1) ──▶ 工具校验成功 ──▶ ViewImageFn(mode:next-turn) ──▶ 批量待发
role ── view_image(path2) ──▶ 工具校验成功 ──▶ 同一批次追加（不产生第二条队列项）
...
第 N 轮 settle ──▶ 桌面把批次合并为一条 system 投递（N 张图 + N 个路径）
                     │
                     └─▶ 同一角色下一轮用户提示（此时才看到图片）
```

### 7.3 多次调用的合并

- 同轮模式：每次调用各自带一张图；模型在下一次调用看到全部工具结果（工具结果消息按调用顺序进入上下文），不存在队列。
- 回退模式：同一轮所有调用合并为一条系统投递；跨轮不合并（不同轮次语义不同）。

---

## 八、跨角色写集与实施顺序

> 原则：`boundary.md` Section 1 是唯一写权来源；未列路径只能只读。以下写集均在各角色现有边界内；若实施时发现缺口，先交 ANS Governance 更新边界并经客户确认，不得自行扩权。

### 8.1 写集

| 角色 | 文件/目录 | 变更 | 依赖 |
| --- | --- | --- | --- |
| **运行时核心** | `src/model/runtime.ts` | 新增 `ViewImageReceipt`/`ViewImageDeliveryMode`、`ToolResult.images`/`imageDelivery`、`RuntimeViewImagePolicy`、`RUNTIME_VIEW_IMAGE_POLICY`；更新两轮注释 | 无；契约首发 |
| 运行时核心 | `src/provider/runtime/tools.ts` | `view_image` 按 policy 返回 `images`/`next-turn`；预算；审计；消息与 fail-closed | 上项 |
| 运行时核心 | `src/provider/runtime/schema.ts` | 更新 `view_image` 描述/`promptGuidelines`（同轮优先 + 回退 + 不假看） | 上项 |
| 运行时核心 | `src/service/runtime/session.ts` | 按 runtime policy 包装 `viewImage`；向 `buildGovernedTools` 注入 `viewImagePolicy`；`RuntimeSessionOptions` `Omit` 该字段 | 上项 |
| 运行时核心 | `test/runtime-core/view-image-tool.test.ts` 等 | 同轮/回退/预算/审计/不一致 fail-closed 单测 | 上项 |
| **Pi适配器** | `src/common/pi-adapter/real-adapter.ts` | `toPiTool` 映射 `result.images` 为 Pi `ImageContent`；details/facts 计数 | 运行时核心契约 |
| Pi适配器 | `test/pi-adapter/` | 映射单测/桩件；SDK faux/真实探针证据 | 上项 |
| **Claude适配器** | `src/provider/claude/session.ts` | MCP handler 返回 image content；MIME 校验；文本 redact、图片不 redact | 运行时核心契约 |
| Claude适配器 | `test/claude-adapter/` | 受控传输断言 + 真实回环探针证据 | 上项 |
| **Codex适配器** | `src/provider/codex/session.ts` | `callTool` 类型；MCP handler image content；动态工具 `contentItems` 映射 `inputImage` data URL；图片不 redact | 运行时核心契约 |
| Codex适配器 | `test/codex-adapter/` | `contentItems` 断言 + 0.162.1 真实回环探针证据 | 上项 |
| **桌面窗口** | `app/desktop/view-image.ts` | `mode:"next-turn"` 回执；同轮批量；单图兼容文本；失败如实 | 运行时核心契约 |
| 桌面窗口 | `app/desktop/session.ts` | 批量入队/合并或 settle 前 flush；`background:true,kind:"system"`；失败 note；不抢 activity | 上项 |
| 桌面窗口 | `test/桌面应用/message-queue.test.ts` 等 | 两轮用例改为批量语义；新增多图合并/失败用例 | 上项 |
| **门禁引擎** | `src/common/门禁引擎/governance-roles.ts` | Proof/Steward/Lead 角色卡从“两轮附件”改为“同轮工具结果附图优先；回退时等下一轮附件；未收到不得假装” | 运行时核心契约 |
| 门禁引擎 | `test/门禁引擎/view-image-cards.test.ts` | 角色卡文本契约同步 | 上项 |
| **项目管理** | `角色卡/项目管理/docs/project-rules.md` §二.14 | 客户确认后把“两轮附件”改为“同轮工具结果附图优先 + 下一轮回退”；保留 fail-closed/注册条件/不扩权 | 客户确认（gate 0） |
| 项目管理 | `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` | 如采用用户可见批量文案：新增/修订 `main.viewImage.*`（批量 paths/count）、保留 `failed`/`attachmentLabel` 语义 | 客户/文案确认 |
| 项目管理 | `test/项目管理/shared/i18n*.ts`、`i18n-guard-allowlist.ts` | 新 key 契约；allowlist 理由若语义变化则同步 | 上项 |
| 项目管理 | `角色卡/项目管理/docs/change/2026-10-27_change_view-image-same-turn.md` | 规则变更/实施记录 | 实施后 |
| **编排** | `src/pipeline/orchestration/run-role.ts` | **只更新契约注释/能力面说明，不改透传逻辑**（`viewImage` 仍原样透传；policy 由 Service 决定） | 运行时核心契约 |
| 编排 | `test/编排/view-image.test.ts` | 增加 inline policy 下 fake provider 收到 `images`、回退仍透传、其他能力矩阵不变 | 运行时核心 |
| 编排 | `角色卡/编排/docs/design/2026-10-27_design_view-image-same-turn.md` | 本设计 | 无 |
| **测试** | `test/测试/` | 跨角色联调：三引擎 fake provider 同轮附图、回退批量、失败诚实；真实 Electron e2e 运行证据 | 所有实现 |
| **独立验收** | 无产品写权 | 核对证据、gate 复核、最终验收 | 测试证据 |

**角色卡文案建议（门禁引擎实施时采用/微调）**：

> 需要核对截图 / 录屏画面时，必须对项目内证据图片调用 `view_image`。工具结果含图片（同轮附图）时可直接核对；若当前引擎回退为下一轮附件，收到附件后再判断；图片未提供或未收到时不得假装已看，不得据此判 pass / fail；工具不可用或未收到附件时如实写 `insufficient evidence`，不得用「文件存在」冒充看过图。UI / 游戏截图仍必须关闭 DEBUG 覆盖层；只写「已看图」而不写看到什么不算核对。

**实施后的文档收尾（各角色边界内，不覆盖历史）**：

- 运行时核心：在 `角色卡/运行时核心/docs/change/` 追加同轮变更记录（现有 `2026-10-26_change_view-image-two-round-attachment.md` 保留为历史）；更新 `docs/feature/runtime-core.md`、feature-map、memo、api-spec。
- 桌面窗口：更新 `角色卡/桌面窗口/docs/feature/view-image-delivery.md`、`docs/change/2026-10-26_change_view-image-desktop-delivery.md`（追加，不覆盖）、functional-description。
- 编排：更新 `角色卡/编排/api-spec.md`、`docs/change/2026-10-26_change_view-image-orchestration-wiring.md`（追加）、feature-map、memo。
- 门禁引擎：更新 `角色卡/门禁引擎/docs/change/2026-10-26_change_view-image-cards.md`（追加）、feature-map、memo。
- 独立验收：既有 `角色卡/独立验收/docs/change/2026-10-26_view-image-acceptance.md` 只作为历史证据；同轮验收另立新记录/新证据，不把旧结论当新结论。
- `demos/` 下的 intent/acceptance 文档也提到两轮 view_image，但**本次明确不改 demos**；如 demo 流程需要按新语义重跑，由对应项目 owner 另立任务。

### 8.2 顺序（gate 0/1/2）

- **Gate 0（客户确认 + 规则）**：客户确认本设计的材料性选择（见 §12）；项目管理修订 §二.14 与相关 i18n/变更记录。**未完成前不得实施**（否则与生效规则冲突）。
- **Gate 1（契约首发，运行时核心）**：
  1. 合入 `src/model/runtime.ts` 契约 + `RUNTIME_VIEW_IMAGE_POLICY`（四项全 `next-turn`）。
  2. 合入 `src/provider/runtime/tools.ts`/`schema.ts` 的同轮/回退/预算/审计逻辑（此时行为仍是回退，零客户可见变化）。
  3. 合入 `src/service/runtime/session.ts` 包装。
  4. 运行时核心单测通过；其他角色可开始对接。
- **Gate 2（并行实现）**：
  - 桌面窗口批量回退 + 测试（可立即开始；不依赖适配器）。
  - Pi/Claude/Codex 适配器映射 + 单测（可并行；互不依赖）。
  - 门禁引擎角色卡文本 + 测试（依赖契约冻结）。
  - 项目管理 i18n/规则最终文案（依赖 Gate 0）。
  - 编排注释 + 测试（依赖契约）。
- **Gate 3（逐引擎启用）**：
  - 每个适配器提交探针证据（§10.5）；运行时核心把对应 policy 从 `next-turn` 翻为 `tool-result`；跑该引擎的契约测试。
  - 任一探针失败 ⇒ 保持 `next-turn`，记录原因；不影响其他引擎。
- **Gate 4（联调/验收）**：
  - 测试角色跑跨角色 + 真实 Electron e2e（假 provider 或真实引擎）；
  - 独立验收核对证据；客户在真实桌面做同轮看图验收。

### 8.3 编排为什么几乎不改代码

`viewImage` 在 `run-role.ts` 是纯透传：`openRoleSession` 收到能力 → `AdapterCapabilities.viewImage` → `createRuntimeAdapterFactory` → `createRuntimeAdapter`。同轮/回退的选择在 Service（运行时核心）按 runtime policy 完成；工具与适配器各自消费契约。编排只需更新注释与测试，避免在编排层复制引擎能力判断。

---

## 九、兼容与回退

### 9.1 逐引擎开关

`RUNTIME_VIEW_IMAGE_POLICY[runtime].delivery` 是唯一开关：

- `"next-turn"`：工具调用桌面 `ViewImageFn`，走两轮批量回退；与旧行为兼容（文本可能从“排队”微调为“未提供图片”）。
- `"tool-result"`：工具直接返回 `images`；适配器映射；不触达桌面队列。
- 翻表必须伴随该引擎的适配器契约测试 + 探针证据；运行时核心是唯一写入者。

### 9.2 回退策略

- **探针失败**：保持 `next-turn`，客户仍能在下一轮看到图片；不会更差。
- **线上异常**（某引擎升级后丢弃工具结果图片）：把该引擎翻回 `next-turn`；无需数据迁移、无需回滚其他引擎。
- **适配器映射异常**（抛错/非法 MIME）：适配器必须把工具结果标为 `isError:true` 并给出“图片未提供”文本，**绝不**只返回文本却保留“已附上”的假象；最坏情况由引擎报错/轮次失败，不会静默假看。
- **桌面批量异常**：本批不投递，走既有 `delivery-note`/诊断如实报告；默认**不**退回逐图堆队列（避免客户痛点回潮）。是否允许降级逐图由客户确认。
- **完全回滚**：把四个 policy 全部设回 `next-turn`，即回到“两轮附件 + 批量”；代码保留，无 schema/数据迁移。

### 9.3 兼容旧能力实现

- `ViewImageReceipt.mode` 可选；旧实现返回 `{ok:true}` ⇒ 按 `next-turn` 处理，零破坏。
- `ToolResult.images` 可选；未实现的适配器看不到该字段，不会改变旧行为（但 policy 不应在适配器未实现时翻为 `tool-result`）。
- `view_image` 的注册门仍是 `options.viewImage !== undefined`；CLI/无桌面宿主不注入 ⇒ 工具不存在（原有语义）。

---

## 十、测试矩阵

### 10.1 单元（运行时核心）

- 未注入 `viewImage` ⇒ `view_image` 不注册；工具集/其他 schema 零变化。
- policy `next-turn`：能力收到 `{path,image}`；成功回执不含 `images`；消息写“下一轮/不要假装”。
- policy `tool-result`：成功回执含 `images:[image]`、`imageDelivery:"tool-result"`；消息写“同轮附上/未包含图片则明确说未看到”。
- 旧回执 `{ok:true}`（无 mode）⇒ 按 `next-turn`；非法 mode/非法回执 ⇒ fail-closed。
- policy 与回执不一致（policy `next-turn` + mode `tool-result`）⇒ fail-closed。
- 失败矩阵：空 path/NUL/绝对/盘符/`..`/realpath 越界/目录/非普通文件/不支持扩展名/超 10 MB/读入后超限/中止/能力抛错/能力拒绝/预算超限 ⇒ 无图、无排队、文本如实。
- 继承校验：符号链接/junction 逃逸、大小写扩展名、实际字节复核。
- 预算：同轮 4 张/20 MB 上限；第 5 张失败；下一轮重置；失败/中止释放预留。
- 审计：诊断只含 path/mime/bytes/delivery/reason，不含 base64（sentinel 断言）。

### 10.2 单元（适配器）

- **Pi**：`toPiTool` execute 成功返回 text + image content；`details` 含 count/bytes/mimeTypes；`ok:false` 不带图；桩件断言 `PromptImage.data` 原样进入 `ImageContent`；如可行，用 faux AgentSession 断言下一请求包含图片块。
- **Claude**：`registerTool` handler 返回 text + image content；文本 redact、图片不 redact；异常/中止不带图；MIME 非白名单拒绝；受控传输断言 `tool_result` 内容块。
- **Codex**：进程内 MCP handler 返回 image content；动态响应 `contentItems` 含 `{type:"inputImage",imageUrl:"data:..."}`；文本 redact、图片不 redact；`success` 与 `isError` 对齐；错误/中止不带图。
- **一致性**：三个适配器的支持声明必须与 `RUNTIME_VIEW_IMAGE_POLICY` 对应；运行时核心/测试角色交叉断言。

### 10.3 桌面窗口（回退批量）

- 单图：settle 后一条 `system` 投递，文本 = `buildViewImagePrompt(path)`，`images` 原引用。
- 多图：同轮 N 次调用 ⇒ settle 后**恰一条** `system` 投递，`images.length=N`，文本含 N 个路径；队列不出现 N 条。
- 目标定格：A 会话调用、当前活动角色切到 su ⇒ 仍投 A。
- 非法载荷/投递失败/会话不可用 ⇒ 零投递/零伪造；失败如实。
- 客户带图消息：`opts.images` 原引用、不入批量、不改变既有路径。
- 崩溃/重启：批量条目的持久化语义按所选机制如实测试；未持久化时诊断记录“图片可能未送达”，不谎称。

### 10.4 编排/跨角色

- `openRoleSession` 透传 `viewImage`；runtime `pi` + fake provider ⇒ policy tool-result ⇒ fake provider 的 `options.tools` 中 `view_image` 返回 `images`；runtime `demo` ⇒ policy next-turn ⇒ 能力被调用。
- `viewImage` 不改变其他能力矩阵（`requestAcceptance`/`requestGateReview`/`shellGate` 等）。
- 测试角色：三引擎 fake provider 端到端（工具结果 content 含图 / 回退队列一条 / 失败无图）；真实 Electron e2e 用生成的 1×1 PNG：
  - 同轮：工具行缩略图可见；队列面板无 view_image 条目；假 provider 记录下一次请求含图片；
  - 回退：工具行缩略图 + settle 后一条 system 行，N 张图；
  - 多图：同轮 N 条工具结果 / 回退一条批量；
  - 失败：denied 行、无图、无队列。
- 门禁引擎：Proof/Steward/Lead 角色卡文本更新后，`view-image-cards.test.ts` 通过；反向断言“不得假装已看”仍在。
- 项目管理：i18n key/占位符/中英 parity；`project-rules.md` §二.14 修订后规则文本与实现一致。

### 10.5 真实引擎探针（逐引擎）

| 引擎 | 探针 | 通过标准 | 失败处理 |
| --- | --- | --- | --- |
| Pi | 受控 faux 会话 +（可选）真实模型：调用返回 image 的 `view_image` 工具，检查下一次请求/转录 | 图片块进入下一次模型请求；四种 MIME 至少 png/jpeg；大图行为如实 | policy 保持 `next-turn` |
| Claude | 本地回环/受控传输：MCP 工具返回 1×1 PNG，检查 SDK/CLI 的 tool_result | 模型请求包含 image block；文本不被污染；异常路径不带图 | 保持 `next-turn`，记录“Claude 未证实” |
| Codex | 固定 0.162.1 app-server + 真实动态工具回环：返回 `inputImage` data URL | 下一轮 Responses 请求含图片；data URL 被接受；远程 URL 拒绝行为不被误用 | 保持 `next-turn` |
| demo | 不适用 | 回退路径测试 | — |

探针证据写入各适配器 `docs/change/` 或 `docs/fix/`；运行时核心只按证据翻表。

### 10.6 回归

- 既有 `view_image` 校验/注册/能力矩阵测试全部保留（按新消息/字段更新）。
- 既有客户带图消息、派发、回交、验收、停止、队列测试不受影响。
- `npm run typecheck`、相关 `node --test` 套件、真实 Electron e2e 全部通过；未跑项如实登记。

---

## 十一、风险与缓解

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | Claude MCP 客户端丢弃/不转发工具结果图片 | 同轮不可见，文本可能诱导假看 | 探针门槛；失败保持 `next-turn`；工具文本条件化“若未包含图片则明确说未看到” |
| R2 | Codex 0.162.1 接受 schema 但实际拒绝 data URL/超限 | 本轮失败 | 真实回环探针；有效单图上限；失败保持 `next-turn` |
| R3 | Pi 工具结果图片不走自动缩放，超过 provider 限制 | 请求失败 | 有效上限（10 MB 全局 + policy）；探针；失败回退 |
| R4 | 模型非多模态 | 图片送达但模型无法理解 | 不假装；角色卡要求如实说未看到；由客户/引擎配置负责；回退不解决 |
| R5 | 同轮多图导致上下文/费用暴涨 | 成本/截断 | 每轮 4 张/20 MB 预算；工具提示“只查看必要图片”；客户可调低 |
| R6 | 原生会话历史因 base64 变大 | 磁盘/恢复变慢 | 不把图片写入 ANS 回放/诊断；原生历史大小如实登记；后续可做历史清理（不在本设计） |
| R7 | 审计/日志泄露 base64 | 安全/隐私 | 只记录 count/bytes/mime/path；sentinel 测试；图片不 redact 但也不落日志 |
| R8 | 回退批量丢失（崩溃/重启） | 客户以为已排队但没收到 | 首选“首图即入队 + 合并”保序并尽早交给投递机；现有持久化有意不落 images，跨重启仍会丢失，回执只说“已排队”不承诺已看到/已持久化；备选内存批量需诊断“可能未送达” |
| R9 | 回退批量抢占客户消息顺序 | 客户消息延迟 | 批量在 settle 时、`drainAllQueuesFor` 前入队/合并，保持“本轮图片先于后续客户消息”的语义；测试覆盖 |
| R10 | policy 表与适配器能力漂移 | 工具返回图但适配器不映射 | policy 唯一来源 + 每引擎契约测试 + 翻表需证据；适配器未知 `images` 时不得静默丢弃（可 fail-closed） |
| R11 | Claude 单图 5 MB 限制与全局 10 MB 冲突 | 大图请求失败 | policy `maxImageBytes` 更严格；工具提前拒绝；必要时后续评估缩图 |
| R12 | 生效规则 §二.14 未改就实施 | 违规 | Gate 0：客户确认 + PM 修订；本设计不替代授权 |
| R13 | 图片路径被替换/删除后 UI 缩略图失效 | 展示失败 | 既有行为；缩略图失败有 `previewLoadFailed` 文案；不影响模型已看到的图片 |
| R14 | 重复查看同一图消耗预算 | 上下文浪费 | 预算上限；可选按内容哈希去重（后续，不在本设计） |

---

## 十二、需要客户确认的点（建议 decision 卡）

以下均为材料性选择，按工程法案 §二.13 应由统筹发 `request_choice(cardKind="decision")`，推荐项唯一；本设计不替代客户决定。规则修订本身若按 §二.15 走需求变更，应由运营/提案发起、独立审批，本设计不替代该流程。

1. **同轮语义与规则修订（必须）**：是否批准“工具结果同轮附图优先、下一轮附件回退”，并授权项目管理修订 `project-rules.md` §二.14。**这是实施前置条件。**（建议：批准。）
2. **同轮模式不产生队列/系统行**：同轮附图只在工具行显示缩略图，不再出现“这是 view_image 请求的图片…”系统行；是否接受？（建议：接受；工具行缩略图已足够。）
3. **回退批量**：不支持同轮的引擎，同一轮多次调用合并为**一条**系统投递、轮末送达；是否接受（相较现状每图一条）？（建议：接受。）
4. **每轮预算**：默认 4 张 / 20 MB 原始字节；超过即如实失败。是否接受？是否要不同默认值？（建议：4 张 / 20 MB。）
5. **引擎有效单图上限**：Pi/Codex 10 MB、Claude 约 5 MB（以探针为准）；超限 fail-closed，不做自动缩图。是否接受？是否要求缩图？（建议：fail-closed、不缩图，保留证据保真；缩图另立需求。）
6. **启用顺序**：Pi/Codex 在适配器映射 + 探针通过后启用；Claude 仅在真实探针通过后启用；demo 保持回退。是否接受“探针失败即回退”的逐引擎策略？（建议：接受。）
7. **审计与历史**：图片不写入 ANS 回放/诊断/日志；原生会话历史可能因图片变大；是否接受？（建议：接受；原生历史大小如实登记。）
8. **探针成本**：Claude/Codex 真实探针可能需要账号/模型调用；由谁提供环境与费用？（建议：客户/项目提供一次受控探针；无法提供时 Claude 保持回退。）
9. **UI 状态**：是否需要“同轮已看/下一轮待看”的额外徽标？本设计默认不加（工具行缩略图 + 文本已足够），如需要则扩大桌面UI写集。（建议：暂不加。）
10. **回退文案/ i18n**：回退批量系统行使用 agent-facing 文本还是共享 i18n key（`main.viewImage.*`）？是否新增批量 key？（建议：系统行用共享 i18n 批量 key；工具发给模型的文本保留桌面 allowlist。）
11. **角色卡文本**：Proof/Steward/Lead 的“两轮附件”纪律改为“同轮附图优先 + 回退等附件”；是否接受？（建议：接受。）
12. **验收口径**：同轮验收以“假 provider 断言下一次模型请求含图片 + 真实 Electron 工具行缩略图/无队列行”为准；真实模型画面核对由客户在真实桌面完成。是否接受？（建议：接受。）

---

## 十三、验收标准（建议）

1. **同轮**：在支持引擎上，模型在一次工具调用后的下一次模型调用中收到图片内容；不产生 view_image 队列/系统行；工具行缩略图可见。
2. **多图**：同一轮 N 次 `view_image`，同轮模式 N 张图都进入后续模型上下文；回退模式恰一条系统投递含 N 张图，不出现 N 条队列消息。
3. **安全**：路径/扩展名/≤10 MB/realpath/普通文件校验全部保留；失败无图、无排队、文本如实；未注入 `viewImage` 时工具不存在。
4. **诚实**：任何失败/中止/未映射都不出现“已看到”的肯定表述；回退文本明确“下一轮”；同轮文本带“若未包含图片请明确说未看到”。
5. **审计**：结构化事实可查（path/mime/bytes/delivery/reason），任何日志/事件/回放无 base64。
6. **兼容**：不支持引擎回退后仍能下一轮看图；逐引擎开关可单独回滚；客户带图消息、派发、回交、验收零回归。
7. **测试**：单元/集成/真实 Electron/引擎探针证据齐全；`npm run typecheck` 与相关套件通过；未跑项如实登记。

---

## 十四、参考（只读核实）

- `src/model/runtime.ts:42-60`（两轮契约注释）、`:34-40`（`PromptImage`）、`:68-75`（`PromptOptions.images`）、`:1752-1771`（`ToolResult`/`ToolDefinition`）、`:1903-1910`（`GovernedToolsOptions.viewImage`）、`:1957-2020`（`RuntimeProviderOptions`）。
- `src/provider/runtime/tools.ts:180-184`（工具名/10 MB）、`:565-729`（`makeViewImageTool`）、`:3523-3527`（注册门）。
- `src/provider/runtime/schema.ts`（`describeTool` 的 `view_image` 文案）。
- `src/service/runtime/session.ts:110-195`（Provider 装配、`buildGovernedTools`）。
- `src/pipeline/orchestration/run-role.ts:239-306`、`:786-794`、`:1602-1608`、`:3617-3621`。
- `app/desktop/view-image.ts:42-92`；`app/desktop/session.ts:202-204`、`:438-443`、`:2488-2495`、`:2731-2732`、`:2889-2979`（settle/drain）。
- `src/common/pi-adapter/real-adapter.ts:389-438`（`toPiTool`）；`src/provider/pi/session.ts`（fake/legacy）。
- `src/provider/claude/session.ts:335-389`（MCP 注册与 handler）。
- `src/provider/codex/session.ts:42`、`:502-540`、`:549-583`、`:761-769`。
- `src/common/门禁引擎/governance-roles.ts:195-204`、`:486`、`:881`、`:1103-1108`、`:1168`。
- `角色卡/项目管理/docs/project-rules.md` §二.14（现行两轮规则）；`角色卡/项目管理/docs/change/2026-10-26_change_view-image-tool.md`（原始决策记录）。
- 测试：`test/桌面应用/message-queue.test.ts:720-1094`；`test/runtime-core/view-image-tool.test.ts`；`test/编排/view-image.test.ts`；`test/门禁引擎/view-image-cards.test.ts`；`test/桌面UI/view-image-preview.test.ts`。
- SDK 证据：`@earendil-works/pi-agent-core/dist/types.d.ts:370`、`dist/agent-loop.js`（toolResult 消息进入 messages）；`@earendil-works/pi-coding-agent/docs/message-types.md:161-169`；`@modelcontextprotocol/sdk/dist/esm/types.d.ts`（`CallToolResultSchema` image）；本机 `@openai/codex 0.162.1` `app-server generate-json-schema --experimental` 的 `DynamicToolCallOutputContentItem`（含 `inputImage`）；上游 openai/codex PR #10567（dynamic tool text+image，data URL，拒绝远程 URL）。

---

## 十五、结论

推荐**方案 A：工具结果同轮附图**。它是最小、引擎无关的实现路径：运行时核心只加一个可选 `ToolResult.images` 契约与逐引擎 policy；Pi/Claude/Codex 各自把图片映射到原生工具结果内容；桌面保留 `ViewImageFn` 作为“未注入不注册”的门和下一轮回退，并把回退批量化为每轮一条。

在客户确认并修订 §二.14 之前，本设计只是方案，不构成实施授权。逐引擎启用与回滚都以 `RUNTIME_VIEW_IMAGE_POLICY` 为唯一开关；任何引擎探针失败都回退两轮，不影响其他引擎。
