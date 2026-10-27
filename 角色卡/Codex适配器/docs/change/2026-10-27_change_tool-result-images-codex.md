---
id: codex-tool-result-images-change
type: change
title: Codex 适配器：view_image 工具结果同轮附图映射（inputImage data URL）+ 最小 Chat Completions 传输
created: "2026-10-27"
updated: "2026-10-27"
timezone: Asia/Shanghai
status: implemented-unverified
related: [codex-governed-session]
---

# Codex 适配器：工具结果同轮附图映射（含 Chat Completions 兼容传输）

依据：客户 2026-10-27 要求“其他引擎也需要实现同轮看图”；设计 `角色卡/编排/docs/design/2026-10-27_design_view-image-same-turn.md` §五.3/§六/§九/§十.5。客户同日补充约束：Codex 应复用现有 Pi 网关/模型/凭据的 **OpenAI Chat Completions** 面，而不是只走 Codex app-server Responses。运行时核心已提供 `ToolResult.images: readonly PromptImage[]` 与 `ViewImageDeliveryMode`；Pi 已翻 `tool-result`，Codex policy 仍为 `next-turn`（翻表属运行时核心，本角色不改 policy）。

## 以前 / 现在（触发场景）

`view_image` 成功且运行时核心在 `tool-result` 交付方式下返回 `{ok:true, images:[...]}` 时：

- **以前**：Codex 适配器只把 `result.message` 转成 `inputText`，图片被丢弃（即便拿到 `images`）——模型本轮看不到图。
- **现在**：适配器把图片映射为两层原生内容，图片随**本次工具结果**进入同一模型工具循环：
  - 进程内 MCP handler 追加 MCP `image` 内容块 `{type:"image",data,mimeType}`；
  - 动态工具响应把 image 块转成 `{type:"inputImage",imageUrl:"data:<mime>;base64,<data>"}`。
  模型紧接着的下一次模型调用即可看到图片，不产生队列/系统行。
- **客户当前可见行为不变**：`RUNTIME_VIEW_IMAGE_POLICY.codex.delivery` 仍是 `next-turn`，工具层不会产生 `images`；本记录只把适配器映射准备好。

### Chat Completions 兼容路径（客户 2026-10-27 补充约束）

- **新网关事实**：现有 Pi 配置的 OpenAI 兼容面为 `POST /v1/chat/completions`（具体值不记录）；两个兼容模型均返回 200，function calling 正常。
- **app-server 限制**：固定 `@openai/codex 0.162.1` 原生二进制明文拒绝 `` `wire_api = "chat"` is no longer supported.``；无法把 app-server 指向 Chat 端点。因此新增**显式 opt-in** 的最小传输 `src/common/codex-adapter/chat-transport.ts`：直接调用 Chat Completions，用注入的 ANS 工具做 function calling；默认 Responses/app-server 路径逐字不变。
- **激活方式**：`ANS_CODEX_WIRE_API=chat`（或适配器选项 `wireApi:"chat"`）。产品路径只读 Codex/OpenAI 自己的配置（`ANS_CODEX_MODEL`/`ANS_CODEX_BASE_URL`/`CODEX_API_KEY`/`OPENAI_API_KEY`）；**不做任何 Pi 自动回退**（见下节客户纠正）。临时测试/探针必须把基址/模型/凭据**显式**传给适配器。
- **同轮附图消息形状**（Pi 网关真机探针接受，模型实际看到 1×1 半透明红色像素）：
  - 工具消息：`{role:"tool", tool_call_id, content:[{type:"text",text},{type:"image_url",image_url:{url:"data:<mime>;base64,<data>"}}]}`
  - 用户图片：`{role:"user", content:[{type:"text",text},{type:"image_url",...}]}`
  - DeepSeek thinking 模式要求回传 `reasoning_content`；传输原样保留 assistant 消息上的该字段，否则网关 400。
- **fail-closed**：chat 模式不启动原生 app-server；`installedMcpServers` 非空或 `webSearch` 开启即装配前拒绝；失败/非法图片不附图并附诚实注记；失败/中止/超时轮次回滚本轮历史，避免半截 `tool_calls` 悬空。

### 客户纠正（2026-10-27）：Pi 仅临时测试，撤销自动回退

客户明确纠正：**Pi 只能作为临时测试配置，不得把“Codex 缺配置时自动回退 Pi”做成长期产品行为**。据此：

- **已撤销** `src/common/codex-adapter/config.ts` 中 chat 模式自动读取 `ANS_PI_MODEL` / `ANS_PI_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` 的产品逻辑；chat 与 responses 现在都只读 Codex/OpenAI 配置（或显式测试注入）。
- **保留** `ANS_CODEX_WIRE_API=chat` 显式 opt-in、Chat 传输本身、`tool-result-images` 映射与 fail-closed 行为。
- **测试/探针**改为显式传入临时基址/模型/凭据（test-only）；`chat-completions.probe.ts` 不再读取 `.env`，只接受显式测试环境变量 `ANS_CODEX_CHAT_PROBE_BASE_URL` / `ANS_CODEX_CHAT_PROBE_MODEL` / `ANS_CODEX_CHAT_PROBE_API_KEY`，未设置即 `blocked-config`。

## 改动位置

- **`src/common/codex-adapter/tool-result-images.ts`（新增，本角色私有辅助）**
  - MIME 白名单 `image/png|jpeg|gif|webp`；
  - `mapCodexToolResultImages`：只信任 `ok:true` 的 `images`；缺省/空数组不附图；任一条非法（非数组、缺/空/非 base64 形态的 `data`、非白名单 MIME）⇒ **整批不交付**（`invalid:true`），不做部分交付；
  - `mapCodexDynamicContent`：text → `inputText`（经 `redact`）、image → `inputImage` data URL（**不经** `redact`）；未知块/非法图片 ⇒ `invalid:true`；`includeImages:false`（MCP 结果已 `isError`）时不转发任何 image；
  - `CODEX_IMAGE_UNAVAILABLE_NOTE`：映射失败时追加给模型的诚实注记（“未向模型提供任何图片；本轮不要假装已看到”）。
- **`src/provider/codex/session.ts`**
  - `McpClient.callTool` 内容项类型增加 `data?`/`mimeType?`（`:47`）；
  - 进程内 MCP handler（`:567-581`）：成功且有 `result.images` 时返回 text + image 块；映射非法 ⇒ `isError:true` + 注记；事件事实 `RuntimeToolResultFactsV1` 只保留 `{ok,message,execution}`，**图片字节不进入投影/事件**；
  - 动态工具 `contentItems`（`:621-626`）：MCP content → `inputItems`；`success` 与 `isError` 对齐；非法载荷返回 `success:false` + 注记，绝不部分交付。
- **`test/codex-adapter/tool-result-images.test.ts`（新增，7 例）**：text+image 形状、MIME 白名单四种、文本 redact 而图片不 redact、失败/无图不附图、非法载荷矩阵、事件与投影事实无 base64 审计。
- **`test/codex-adapter/images-loopback.probe.ts`（新增显式探针）**：本机 0.162.1 真实 app-server + localhost 假 Responses 服务（假凭据、零外网）验证 `inputImage` data URL 被接受并进入同轮下一请求；失败/非法场景不附图。
- **`test/codex-adapter/native-probe.mjs`**：`generate-ts` 产物断言 `DynamicToolCallOutputContentItem` 含 `{type:"inputImage",imageUrl:string}` 与 `inputText`。
- **`src/common/codex-adapter/chat-transport.ts`（新增，客户补充约束）**：最小 Chat Completions 会话传输（system/history/function calling/同轮附图/abort/超时/历史回滚/工具投影）；图片 data URL 不过 redact，不写临时文件。
- **`src/common/codex-adapter/config.ts`**：`ANS_CODEX_WIRE_API`（responses 默认 / chat）与 `chatCompletionsEndpoint`；chat 模式同样只读 Codex/OpenAI 配置，**无 Pi 自动回退**（客户纠正）。
- **`src/provider/codex/session.ts`（补充）**：`wireApi`/`chatFetch` 选项与 chat 分支（`:396`）；chat 模式下原生 MCP/联网搜索非空即装配前拒绝。
- **`test/codex-adapter/chat-transport.test.ts`（新增，9 例）**：文本轮次、工具循环与 `reasoning_content` 回传、工具消息附图 data URL、失败/非法载荷不附图、用户图片、abort 历史回滚、redact、chat 模式不支持能力、显式配置/无 Pi 自动回退与端点形状。
- **`test/codex-adapter/chat-completions.probe.ts`（新增真实探针）**：经适配器真实调用 Chat Completions（显式临时测试配置；不读 `.env`）；只输出响应形状摘要（无正文/base64/密钥）。

## 安全边界（与 Pi 适配器同口径）

- 图片 `data`/`data:` URL 绝不经过 `config.redact`、日志、诊断、事件或 `details`；只有文本经 `redact`。
- 工具结果附图**不写临时文件、不用远程 URL**（0.162.1 上游只接受 data URL）；现有客户带图消息的 `localImage` 临时文件路径**未改动**。
- 失败/中止/无图/非法载荷 ⇒ 零图片、`isError`/`success:false`、诚实文本；绝不保留“已附上”的假象。
- 每轮预算/单图上限/交付方式仍由运行时核心 policy 单点决定；适配器不复制策略。

## 验证（Windows 11 / Node v24.22.1 / 固定 CLI 0.162.1）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 新增单测（附图映射） | `node --test test/codex-adapter/tool-result-images.test.ts` | **7/7 绿** |
| 新增单测（Chat 传输） | `node --test test/codex-adapter/chat-transport.test.ts` | **9/9 绿** |
| 适配器全量 | `node --test "test/codex-adapter/**/*.test.ts"` | **97 计 / 95 过 / 1 skip / 1 红**；唯一红＝`session.test.ts:351` Windows 无符号链接权限 `EPERM`（**既有环境红**，2026-10-18 记录已登记同一红；与本批文件无关），skip＝POSIX-only 进程组清理用例（平台既有） |
| 类型检查 | `npm run typecheck` | **通过（0 错）** |
| 结构探针 | `node test/codex-adapter/native-probe.mjs` | 绿；`dynamicToolImage: "inputImage imageUrl schema verified"`，版本 `codex-cli 0.162.1` |
| Responses 回环 | `node test/codex-adapter/images-loopback.probe.ts` | **4/4 绿**：`success-image` 的第二条 Responses 请求逐字包含 `data:image/png;base64,<PNG>`；`text-only`/`failed-image`/`invalid-mime` 均不含图片；非法 MIME 场景模型收到 fail-closed 注记；全部 `outcome=completed`；假凭据、localhost、0 外部模型调用 |
| Chat 真实探针 | `node test/codex-adapter/chat-completions.probe.ts` | **3/3 绿**（显式临时测试配置：调用前操作者注入 Pi 网关/模型/凭据；**非产品自动回退**）：`text-turn` 200 返回 `pong`；`tool-result-image` 工具被调用 1 次，第二轮模型回复命中 red/pink 色系（`colorMatched:true`）⇒ 工具消息内 data URL 图片被真实模型看到；`tool-result-text-control` 通过 |

探针证据说明：Chat 真实探针运行于“自动 Pi 回退撤销前”，但当时探针本身就是把临时基址/模型/凭据**显式**传给适配器，未依赖产品回退；撤销仅改 `config.ts` 的配置解析与探针的环境读取方式，`chat-transport.ts`/`session.ts` 传输代码未变。撤销后按客户要求不读 `.env`，且无显式测试 env，因此**未重跑真实探针**；离线契约测试与 typecheck 已复跑。

## 真实探针结果（两条路径分开记录）

### Responses / app-server 路径

- 结构：0.162.1 schema 含 `inputImage{imageUrl}`（结构探针绿）。
- 回环：本地假 Responses 服务 + 真实 app-server，`inputImage` data URL 被接受并进入同轮下一请求（4/4 绿）。
- **真实模型探针 blocked-config**：Pi 网关的 Responses 路由在携带凭据时返回 **404**（未鉴权统一 401），Codex app-server 固定 `wire_api="responses"`，无法用 Pi 网关做真实模型调用；未另找 Codex key、未伪造。

### Chat Completions 路径（客户补充约束 + 纠正）

- **网关可用**：Pi 配置的 Chat Completions 端点携带显式临时凭据，两个兼容模型均 200；function calling 返回标准 `tool_calls`（具体值不记录）。
- **app-server 不可用**：0.162.1 二进制明文拒绝 `` `wire_api = "chat"` is no longer supported.`` ⇒ 采用适配器内最小 Chat 传输（显式 opt-in）。
- **真实模型同轮看图通过**：`chat-completions.probe.ts` 3/3；工具消息 data URL 图片被模型实际看到（1×1 RGBA `ff0000/7f` 被描述为 red/pink 系颜色）。消息形状见上文。
- **产品默认**：Chat 传输需 `ANS_CODEX_WIRE_API=chat` 显式开启，并读显式 Codex/OpenAI 配置；Pi 只是临时测试配置，产品不做自动回退（客户纠正）。

## 是否可翻 Codex policy

- **Chat Completions 部署**：真实模型证据已具备（工具消息图片被看到），适配器映射与 fail-closed 测试齐全；产品路径需显式 Codex/OpenAI 配置，Pi 仅临时测试。
- **Responses/app-server 部署**：传输回环证据已具备；真实模型探针仍缺（无 Responses 兼容网关/凭据）。
- **剩余限制**：`RUNTIME_VIEW_IMAGE_POLICY.codex` 是**整个 runtime** 的单一开关，无法区分 wire；翻表会同时影响两条路径。建议运行时核心在客户确认“Codex 以 Chat 为产品路径且配置齐备”后翻为 `tool-result`；否则保持 `next-turn`，等待 Responses 真实模型证据。本角色未改 policy，翻表属运行时核心写权。
- Chat 模式其他限制：无原生线程恢复（`nativeSessionId` 不存在、`contextSource:"in-memory"`）、无原生 MCP、无联网搜索、不应用思考等级、不产 reasoning 事件；这些在装配/配置面如实拒绝或声明。

## 未做 / 声明

- 未改 `src/model/runtime.ts`、`src/provider/runtime/**`、Pi/Claude/桌面/PM/门禁/i18n；未 commit/push；未重启应用；未触碰 `C:/Users/51054/Downloads/pixel-roguelike` 或 `demos/`。
- **未写 `.env`、未读 `.env`（纠正后）**：Chat 探针只接受显式测试环境变量到进程内存；密钥/base64 未打印、未落盘、未提交。真实探针的模型调用使用显式临时测试配置，未另找 Codex key，也未把 Pi 回退做成产品行为。
- `RuntimeToolResultFactsV1` 无图片事实字段（共享契约属运行时核心），故 Codex 事件只保留 `{ok,message,execution}`；未在适配器内另造第二套事件字段。
- Chat 传输是**显式 opt-in**（`ANS_CODEX_WIRE_API=chat`）；默认 Codex 仍走 app-server Responses，原有测试逐字通过。桌面设置面板仍要求 Codex 专属 model/key（属其他角色边界），本次未改 UI。
