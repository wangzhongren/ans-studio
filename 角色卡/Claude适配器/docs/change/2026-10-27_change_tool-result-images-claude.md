# 2026-10-27 Claude 适配器：工具结果附图（`view_image` 同轮可见）

**依据**：编排设计 [`2026-10-27_design_view-image-same-turn.md`](../../../编排/docs/design/2026-10-27_design_view-image-same-turn.md) §5.2（Claude 规范兼容、待探针）、§6.4（Claude 映射）、§9.2（映射异常 fail-closed）、§10.2/§10.5（适配器单测 + 真实探针）；运行时核心已落地 `ToolResult.images` / `ViewImageDeliveryMode` 契约（`src/model/runtime.ts`）。客户 2026-10-27 要求其他引擎同样实现同轮看图；协调者补充：Claude 探针使用 **Pi 的现有凭据**，不另找 Claude key。

**范围**：仅本角色边界内文件——`src/common/claude-adapter/tool-result-images.ts`（新增）、`src/provider/claude/session.ts`、`test/claude-adapter/tool-result-images.test.ts`（新增）、`test/claude-adapter/session.test.ts`、`test/claude-adapter/tool-result-images-live.probe.ts`（新增探针）、本角色文档。**未改** `src/model/runtime.ts`、`src/provider/runtime/**`、Pi/Codex/桌面/PM/门禁/i18n；未改 policy（`RUNTIME_VIEW_IMAGE_POLICY.claude` 仍为 `next-turn`，翻表属运行时核心）；未 commit/push、未重启应用。

## 一、实现

### 1. `src/common/claude-adapter/tool-result-images.ts`（新增，本角色私有辅助）

- `CLAUDE_IMAGE_MIME_TYPES = image/png, image/jpeg, image/gif, image/webp` 与 `isClaudeImageMimeType`：**与 Claude 用户提示图片同一白名单**（`session.ts` 的 `promptOptions.images` 校验改为引用同一常量，行为逐字不变）。
- `mapClaudeToolResultImages(result)`：只在 `ok:true` 时映射 `ToolResult.images` 为 MCP image 内容块 `{type:"image", data, mimeType}`；`data` **原引用透传**（不重编码、不重新 base64、不缩放）。
- fail-closed 判据（任一条命中 ⇒ `invalid:true`，**整批零交付**，不做部分交付）：
  - `images` 非数组；条目非对象；`type !== "image"`；
  - `data` 缺失/空/非字符串/非标准 base64（严格：长度 4 倍数、标准字母表、带填充）；
  - `mimeType` 非白名单。
- `ok:false` 时即使 `images` 意外非空也**绝不附图**（直接返回空映射）。

### 2. `src/provider/claude/session.ts`（进程内 MCP tool handler）

- 成功分支（原 `content: [{type:"text"}]`）改为：文本 + 映射后的 image 块并列：
  ```ts
  const imageMapping = mapClaudeToolResultImages(result);
  const text = imageMapping.invalid
    ? `${redact(result.message)}（Claude 适配器：工具结果中的图片数据非法，未向模型提供任何图片；本轮不要假装已看到。）`
    : redact(result.message);
  const effectiveOk = result.ok && !imageMapping.invalid;
  ```
  - `isError: !effectiveOk`；非法载荷 ⇒ `isError:true` + 诚实注记，绝不自称「已附上」。
  - 中止/异常/无效上下文三个既有返回点保持纯文本、`isError:true`，**绝不附图**。
- **图片不进 redact/日志/诊断/展示事件**：
  - 文本仍经 `redact`；`data`/`mimeType` 不经过 `redact`。
  - 交给 `emitTool` / `projectToolEvent` 的事件 facts 先剔除 `images`（`const { images: _toolResultImages, ...resultFacts } = result`），其余字段（含 `execution`/`backgroundTask`/`imageDelivery` 元数据）与既有行为一致；非法映射时 facts `ok:false` 并带同一诚实注记。
  - MCP 返回体只有 `{content, isError}`，无 `details` 字段；图片字节不进入任何 ANS 事件/诊断/回放。
- 图片 `source`/`media_type` 映射沿用既有用户图片写法（`PromptImage` 与 MCP image 同形）。

## 二、测试与类型检查（本机 2026-10-27）

- 新增 `test/claude-adapter/tool-result-images.test.ts`（8 例）：白名单四 MIME；ok+图片逐张映射且 data 原引用；无图/空图；`ok:false` 不附图；非数组/条目非对象/`type` 非 image；data 缺失/空/非字符串/非标准 base64；MIME 非白名单；**混合批次一条合法一条非法 ⇒ 整批零交付**。
- 扩展 `test/claude-adapter/session.test.ts`（1 例，真实 MCP Client/Server 内存回环）：`view_image_ok` 返回 text+image 两块且 data 与源逐字相同；多图顺序与 MIME 正确；`view_image_fail` 仅文本、`isError:true`；`view_image_invalid`/`bad_mime`/`mixed` 一律仅诚实注记文本、无 image 块、`isError:true`；**sentinel 断言**：投影 facts 与会话事件 JSON 均不含任何图片 base64（含 `not base64!` 夹具串）；facts 中 `images` 键被剔除、`imageDelivery:"tool-result"` 作为允许的交付方式元数据保留。
- `node --test "test/claude-adapter/**/*.test.ts"`：**66 例 / 65 过 / 1 红**；唯一红＝既有环境问题 `native symlink and storage runtime mismatch fail before SDK query`（Windows 无符号链接权限，EPERM，setup 阶段；本批未触碰该用例，历史记录同样登记该既有红）。
- `npm run typecheck`：退出 0（期间曾观测到另一角色在飞的 `test/codex-adapter/tool-result-images.test.ts` 临时错误，随后自行收敛；最终整仓 tsc 零错误）。

## 三、真实探针（Pi 凭据 → Claude 适配器，**PASS**）

探针脚本：`test/claude-adapter/tool-result-images-live.probe.ts`（非 `*.test.ts`，不进常规套件；`node test/claude-adapter/tool-result-images-live.probe.ts`）。

**凭据纪律（客户 2026-10-27：Claude 探针使用 Pi 的现有凭据）**：

- 只经现有加载路径：`loadEnvFileInto(env, resolve(".env"))` → `resolvePiProviderConfig({}, env)`；**只读配置，未写 `.env`**。
- 全程未打印/未落盘/未提交任何密钥、`.env` 值、base64 或 data URL；探针输出只含键名、布尔、数量、MIME、字节数、SHA-256 前 16 位、HTTP 状态与模型回答文本。
- 临时目录位于系统 `%TEMP%`，用后删除（CLI 释放滞后时记录并重试，不掩盖结论）。

**配置可用性（不打印值）**：`.env` 存在，载入键名 `ANS_PI_BASE_URL, ANS_PI_MODEL, ANS_PI_REASONING_EFFORT, ANTHROPIC_AUTH_TOKEN`；`resolvePiProviderConfig` 成功；Pi 配置的网关（非 `api.anthropic.com`）与模型（具体值不记录）。

**构造**：本地 `127.0.0.1` 记录代理转发到 Pi 网关；Claude 适配器以 `runtime:"claude"`、`apiKeyEnvVar:"ANTHROPIC_AUTH_TOKEN"`、`baseUrl`=记录代理、`modelId`=`ANS_PI_MODEL` 启动真实 bundled CLI 会话；注册 MCP 工具 `view_image_probe`，handler 返回 `ToolResult{ok:true, images:[1 张 64×64 纯红 PNG], imageDelivery:"tool-result"}`；提示词只要求「先调用工具再回答图片主色调」，不含颜色线索。

**证据（单次 `session.prompt()`，工具调用 1 次，耗时 2906 ms）**：

| 请求 | 角色序列 | tools | tool_result 图片 | 上游状态 |
| --- | --- | --- | --- | --- |
| #0 | user | （空） | — | 200 |
| #1 | user, system | `mcp__ans__view_image_probe` | — | 200 |
| #2 | user, system, assistant, user | `mcp__ans__view_image_probe` | `image/png`，178 bytes，sha16 `64836b7f26ab8929` | 200 |

- 生成图字节数 178、sha16 `64836b7f26ab8929`；请求 #2 的 tool_result 图片块 MIME/字节/SHA **逐一相等**（原样到达，未被替换/丢弃/重编码）。
- 请求 #2 的 tool_result 文本为工具消息原文；模型回答：「图片的主色调是红色（接近纯红的单色）。」——与图像一致。
- 判定：**同轮工具结果附图进入 Anthropic `tool_result` 通过**（协议层 + 视觉理解层）；无新用户提示、无队列/系统消息、单轮内完成。
- 观察：SDK 打印既有 `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` 警告（裸 `allowedTools` 先于 `canUseTool` 自动放行，既有已知行为，与图片无关）。

## 四、结论与建议

1. **实现完成**：Claude 适配器已把 `ToolResult.images` 映射为 MCP image 内容块并在真实网关上验证同轮可见；fail-closed 与「无字节落日志」纪律由单测/回环/sentinel 覆盖。
2. **可翻 policy**：证据满足设计 §10.5 Claude 行（真实 SDK/CLI 的 `tool_result` 含 image block）。建议运行时核心把 `RUNTIME_VIEW_IMAGE_POLICY.claude.delivery` 从 `next-turn` 翻为 `tool-result`（翻表是运行时核心唯一写权；本角色未改）。
3. **限制与剩余风险**（如实登记）：
   - 单网关/单模型：仅验证当前 `.env` 指向的 Pi 模型；不同网关/模型的图片接受度与多模态能力需各自探针（设计 §5.5/R4）。
   - 仅 PNG：jpeg/gif/webp 走同一白名单与同一映射代码，但真实网关未逐一探针（jpeg/webp 由 Pi 侧探针独立验证过同一网关的图片接受度，可作为间接参考）。
   - 单次样本：无重复运行/抖动数据；请求 #0 为 CLI 预检（无 tools），不影响判定。
   - Claude 品牌模型未验证：Pi 模型经 Anthropic Messages 兼容网关服务，Claude 适配器的协议路径已证；若客户后续切换模型/网关，应复跑本探针。
   - 每次真实运行会消耗网关额度；本探针只跑一次主证据。
   - 代理为探针专用（本地 HTTP 记录 + 上游 TLS），不是产品组件；生产 `baseUrl` 直连由既有适配器路径负责。
