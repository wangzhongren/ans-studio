# 2026-10-27 Gate 3 真实探针：Pi 工具结果附图（`view_image` 同轮可见）

归属角色：Pi适配器（Section 1 边界内）。
目的：为运行时核心把 `RUNTIME_VIEW_IMAGE_POLICY.pi` 从 `next-turn` 翻为 `tool-result` 提供**真实模型/网关**证据
（设计 `角色卡/编排/docs/design/2026-10-27_design_view-image-same-turn.md` §10.5 Pi 行、§8.2 Gate 3）。
前置实现：`docs/change/2026-10-27_change_tool-result-images-pi.md`（适配器映射已落地）。

## 一、安全性（凭据纪律）

- 配置**只经现有加载路径**：`loadEnvFileInto(process.env, resolveRepoEnvPath())`（桌面启动同款；
  只回报键名/数量）+ `resolvePiProviderConfig({}, process.env)`（只检查存在性）。
- 全程**未打印/未提交** `.env` 内容、凭据、base64 或 data URL：探针输出只含布尔、字节数、
  SHA-256 前 16 位、MIME 与模型回答文本。
- 临时脚本与生成的图片全部位于系统临时目录（`%TEMP%`），运行结束即删除；未改产品源码/测试、未 commit、
  未重启应用、未触碰 pixel-roguelike / demos。

## 二、探针构造

1. **配置可用性**（不打印值）：`.env` 存在，载入 4 个键；`ANTHROPIC_AUTH_TOKEN` / `ANS_PI_BASE_URL` /
   `ANS_PI_MODEL` 三键均存在（`true`）；`resolvePiProviderConfig` 成功；base URL **不是** `api.anthropic.com`。
2. **图像**：系统临时目录生成 64×64、8px 方格、蓝（30,60,220）/黄（230,210,40）棋盘 PNG；
   JPEG（quality 95）与 WebP 用 Pi SDK 自身依赖的 photon WASM 转码，并**离线回读校验**（photon 解码、
   尺寸 64×64）后才发送。文件名 `probe.<ext>`、提示词不含颜色，避免答案泄漏。
3. **工具**：`toPiTool` 包装假 `view_image`，handler 返回
   `{ ok:true, message:"…已读取并随本工具结果附上（同一轮可见）…", images:[PromptImage], imageDelivery:"tool-result" }`
   ——图片走 `ToolResult.images`，与运行时核心同轮交付的同形契约。
4. **真实 SDK agent loop**：与 `buildExplicitRuntime` 同源构造 provider（模型克隆自 anthropic-messages 模板、
   显式 baseUrl/model/contextWindow、compat 收窄），`ModelRuntime.create` + `InMemoryCredentialStore`；
   `createAgentSession({ noTools:"builtin", customTools:[toPiTool(…)] })`；settings 用
   `SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES + retry:false)`、resourceLoader 全关闭技能/上下文文件。
5. **请求捕获**：包装 `anthropicMessagesApi().stream/streamSimple`，对每次真实模型请求的
   `TranscriptContext` 记录消息角色、toolResult 的图片数量/字节/MIME/SHA-16（**不记录 base64**）。
6. **判定标准**：模型调用 `view_image`；同一 `session.prompt()` 的**第二次**模型请求含 `toolResult`
   图片块且 SHA 与生成图一致；最终回答与图像内容一致。

## 三、结果（真实模型调用）

| 轮次 | 图像 | 字节 | 是否调工具 | 第二次请求带图（SHA 匹配） | 模型回答 | 耗时 | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1（辅助） | 64×64 纯红 PNG | 136 | 是 | 是（`e3ebfe9845cd7b0f`） | 「红」 | 1750 ms | 通过 |
| 2（主证据） | 64×64 蓝/黄 8px 棋盘 PNG | 166 | 是 | 是（`70d422680d905cf3`） | 「图案；棋盘格（蓝、黄交替的方格）；蓝色与黄色」 | 2061 ms | 通过 |
| 3 | 同一棋盘，image/jpeg（q95） | 1078 | 是 | 是（`1d10f9ee499099ba`，mime `image/jpeg`） | 「图案（不是纯色）；棋盘格；蓝紫调与黄色」 | 2063 ms | 通过 |
| 4 | 同一棋盘，image/webp | 256 | 是 | 是（`c9d592adb18abba9`，mime `image/webp`） | 「图案；棋盘格；亮黄与深蓝」 | 2107 ms | 通过 |

- 四轮均为 `messageRoles: system,user,assistant,toolResult,assistant`；第二次请求的 toolResult
  图片字节数/ SHA 与生成图**逐一相等**（说明数据原样进入请求，未被替换/丢失）。
- 第 1 轮提示词/文件名含 “red”，有猜中风险，故仅作辅助；第 2–4 轮文件名与提示词均不含颜色/图案线索，
  模型仍准确识别棋盘格与蓝黄两色，构成主证据。
- 命令：`node <TEMP>/ans-pi-visual-probe.mjs [--mime=png|jpeg|webp]`（脚本用后删除；构造见本记录 §二）。

## 四、SDK 行为核实（离线、无模型调用）

设计 §5.1 原先遗留「工具结果附图是否经过 Pi 图像管线未实测」。本机 `pi-coding-agent@1.1.0` 证据：

- `dist/core/agent-session.js:368` 在工具结果进入历史前调用
  `normalizeToolResultImages(content, { … })`（`dist/utils/tool-result-images.js`）。
- 该函数对每个 image 块调用 `processImage(Buffer.from(data,"base64"), mimeType, { autoResizeImages: true })`；
  若处理后尺寸/编码有变化，就改写图片块并追加模型可见的提示文本；`processImage` 失败则**保留原块**
  （不静默删图）。
- `dist/utils/image-resize-core.js`：上限 `maxWidth/maxHeight = 2000`、`maxBytes = 4.5 MB base64`
  （为 Anthropic 5MB 限制留余量）；超限时先按尺寸缩放，再在 PNG/JPEG 与多档 JPEG 质量中取更小者，
  仍超限则逐步缩小尺寸。
- **离线大图验证**：2400×2400 真随机噪声 PNG（17,287,738 字节，base64 约 23 MB）经
  `normalizeToolResultImages` → `2000×2000 image/jpeg`（2,882,612 字节）+ 提示
  「original 2400x2400, displayed at 2000x2000…」，耗时 1559 ms。证明工具结果附图**会被** SDK 归一化/缩放，
  不会把超大 base64 原样塞进 provider 请求。

## 五、结论与建议

- **探针通过**：在现有客户配置的真实模型/网关上，`ToolResult.images` 经 `toPiTool` 映射后，
  图片块在同一 `session.prompt()` 的下一次模型请求中真实到达，模型回答与图像内容一致；
  png/jpeg/webp 三种 MIME 均通过。
- **建议**：运行时可把 `RUNTIME_VIEW_IMAGE_POLICY.pi` 翻为 `tool-result`（翻表属运行时核心；
  本角色未改 policy）。翻表后可删除/保留 `next-turn` 回退路径作为回滚开关（设计 §9.2）。
- **限制与剩余风险**：
  1. **GIF 未探**：本机无 GIF 编码器（photon 不支持 GIF 编码），未做真实模型 GIF 探针；
     SDK 的 MIME 归一清单包含 `image/gif`，但真实网关对 GIF 的接受度未证。若需完整四 MIME，
     建议提供一张小 GIF 夹具后补跑。
  2. **单模型/单网关**：仅验证当前 `.env` 指向的网关与模型；其他模型/网关的多模态能力需各自探针。
  3. **小图 + 离线大图**：真实模型只验证了 136–1078 字节的小图；大图只做了 SDK 归一化离线验证
     （未把缩放后的 2.88MB JPEG 发给真实模型——缩放后仍在 4.5MB 内，预期可接受，但未经真实请求验证）。
  4. **单次样本**：每种 MIME 各 1 次；无重复运行/抖动数据；模型被提示词明确要求先调工具。
  5. **模型能力依赖**：同轮可见 ≠ 所有模型都能理解图片；非多模态模型会如实报错/看不到，
     不属于适配器缺陷（设计 R4）。
- 安全性：未打印/提交任何密钥、`.env` 值或 base64；探针脚本与临时图片已清理。
