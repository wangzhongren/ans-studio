# 2026-10-27 变更记录：工具结果附图映射（Pi 适配器，同轮看图设计 §6.4）

归属角色：Pi适配器（Section 1 边界内）。
客户/评审依据：客户 2026-10-27 要求并授权「同轮看图修复」；设计文档
`角色卡/编排/docs/design/2026-10-27_design_view-image-same-turn.md` §五.1（Pi 兼容性）、§六（契约与适配器映射）、§九.2（映射异常 fail-closed）、§十.2（适配器测试）。
运行时核心已落地契约：`ToolResult.images?: readonly PromptImage[]`、`ToolResult.imageDelivery?: ViewImageDeliveryMode`、
`RUNTIME_VIEW_IMAGE_POLICY`（当前 **四个 runtime 全部 `next-turn`**，尚未启用同轮交付）。
本角色只做**适配器映射**；不改 policy、不改运行时核心、不改工具实现。

## 一、问题与目标

`toPiTool.execute` 此前只把 `ToolResult.message` 映射为 Pi 工具结果内容
（`content: [{type:"text",text}]`）。运行时核心切换到 `tool-result` 交付后，`view_image` 的成功结果会携带
`images`（模型可见图片、base64 + MIME），但适配器不映射 ⇒ 图片被丢弃，模型同轮看不到图。

目标：把 `ToolResult.images` 映射为 Pi SDK 原生工具结果内容块 `ImageContent`
（`{type:"image",data,mimeType}`，与 `PromptImage` 逐字同形），让 agent loop 把图片随工具结果消息
送进同一次模型循环；同时保持 fail-closed 与「诊断/详情不含 base64」的硬纪律。

## 二、改动（仅本角色边界内文件）

### 1. `src/common/pi-adapter/real-adapter.ts`

新增（`toPiTool` 之前的工具结果附图小节）：

- `PI_TOOL_RESULT_IMAGE_MIMES`：MIME 白名单 `image/png|jpeg|webp|gif`（与工具层 `view_image` 同一集合）；
- `base64ByteLength`：按 base64 长度推算原始字节数（不解码、不重编码）；
- `piImageContentOf` / `mapToolResultImages`：`ToolResult.images` → Pi `ImageContent[]` 纯映射；
- 类型 `PiToolResultImageFacts`（`{count,bytes,mimeTypes}`）与 `PiToolResultContent`（`{type:"text"}|ImageContent`）。

`toPiTool.execute` 的返回：

```ts
const imageMapping = mapToolResultImages(result);
const content = [{ type: "text", text }, ...imageMapping.images];
return { content, details, isError };
```

映射规则（逐条钉死）：

1. **保留 text 块**：`text` 以 `result.message` 为主体（运行时核心返回 same-turn 文案）；正常路径逐字不改。
2. **成功附图**：`result.ok === true` 且 `images` 非空、全部合法时，按原顺序追加
   `{type:"image", data, mimeType}`——`data`/`mimeType` **原引用**透传（不重编码、不缩放、不转 PNG）。
3. **失败绝不附图**：`result.ok === false` 时即使 `images` 意外非空也不交付（只有 text，`isError:true`）。
4. **非法载荷整批不交付（fail-closed）**：`images` 非数组 / 条目非对象 / `data` 缺失或空串 /
   MIME 非白名单 ⇒ 一张都不交付（不做部分交付），本次结果标 `isError:true`，并在 `result.message` 后追加
   诚实注记：「（Pi 适配器：工具结果中的图片数据非法，未向模型提供任何图片；本轮不要假装已看到。）」——
   对应设计 §9.2「绝不只返回文本却保留『已附上』的假象」。
5. **`details`/诊断只记元数据**：成功附图时增补
   `images: {count, bytes, mimeTypes}` 与 `imageDelivery`；失败或映射失败时不记 `imageDelivery`、
   记 `errorCode: "IMAGE_MAPPING_FAILED"`。`details`/诊断**绝不**包含 base64、`data:` URL 或图片字节。
   注：本地诊断落盘还有共享 `FIELD_NAMES` 白名单，嵌套 `images` 对象不会写入磁盘（更严）。
6. **不改 policy**：交付方式仍由运行时核心 `RUNTIME_VIEW_IMAGE_POLICY[runtime].delivery` 单一决定；
   适配器只是「有 `images` 就映射」。

### 2. `test/pi-adapter/tool-result-images.test.ts`（新增，12 例）

- 成功单图/多图：content = text + image（顺序、原引用、`mimeType` 逐字）；details 的
  `count/bytes/mimeTypes` 精确；details JSON 不含 base64；
- `next-turn`（无 images）/ 空数组：只有 text，details 记 `imageDelivery:"next-turn"`；
- `ok:false` 且携带 images：只有 text、`isError:true`、无图、无 `imageDelivery`；
- 非法载荷矩阵（缺 data / 空 data / 非白名单 MIME `image/svg+xml` / 非对象条目 / `images` 非数组）：
  无图、`isError:true`、注记含「未向模型提供任何图片」「不要假装已看到」、details 无 base64（sentinel 断言）；
- 诊断 sentinel：`tool.start`/`tool.result` 记录不含图片 base64 或 `data:` URL；
- **SDK 级（faux provider，离线）结构回环**：真实 `createAgentSession` + `toPiTool` 自定义工具，
  第一次响应触发 `view_image`，响应工厂捕获**第二次模型请求**的 `TranscriptContext`，断言
  `role:"toolResult"` 消息 `toolName:"view_image"` 的 content 同时含 text 块与
  `{type:"image",data,mimeType}` 图片块（data 原样）。证明工具结果图片会进入同一 `session.prompt()`
  的下一次模型请求（Pi messages），**未做真实模型调用**。

## 三、明确未改动（不越界）

- `src/model/runtime.ts`（契约）、`src/provider/runtime/tools.ts` / `schema.ts`（工具实现）、
  `src/service/runtime/session.ts`（policy 接线）——均属运行时核心；
- `RUNTIME_VIEW_IMAGE_POLICY.pi` 仍为 `next-turn`：**适配器已实现，但同轮交付尚未启用**；
- `app/desktop/**`、门禁/PM/i18n/编排/桌面/测试角色的文件；
- 未改任何既有测试断言；未 commit/push；未重启应用；未触碰 `C:/Users/51054/Downloads/pixel-roguelike` 与 `demos/`。

## 四、验证证据（真实输出）

### 1. 新增用例

```
$ node --test test/pi-adapter/tool-result-images.test.ts
ℹ tests 12
ℹ pass 12
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 740.9443
```

12 例全部通过，含 faux SDK 回环用例（620ms）。

### 2. 角色全量测试

```
$ node --test "test/pi-adapter/**/*.test.ts"
ℹ tests 343
ℹ pass 340
ℹ fail 2
ℹ skipped 1
```

2 个失败均在 `test/pi-adapter/injected-runtime.test.ts`（「store validate callback rejects directory symlink…」
与「Pi storage refuses file symlink…」），失败点是 `fs.symlink` 本身报 **EPERM**（Windows 未开开发者模式/
无创建符号链接权限）。独立探针确认本机临时目录中目录/文件符号链接一律 EPERM；该文件与
`native-session.ts` 本角色本轮均未修改，属**环境性既有失败**，与本次改动无关。1 skipped 为既有
`mcp-probe-server.probe.ts` 类跳过项。

### 3. 类型检查

```
$ npm run typecheck
> ans-cli@1.7.0 typecheck
> tsc --noEmit
```

退出码 0，无错误输出（工作树含其他角色在飞改动，仍通过）。

## 五、未验边界 / 风险（探针缺口）

> **2026-10-27 补记**：本记录初稿时尚未做真实模型探针；随后已完成 Gate 3 真实探针（png/jpeg/webp
> 三种 MIME 均通过，模型同轮看到图片并正确描述），证据见
> [2026-10-27_probe_pi-tool-result-images.md](2026-10-27_probe_pi-tool-result-images.md)。
> 下列第 1、2 条据此更新，其余保留。

- ~~**未做真实模型视觉探针**~~ → **已完成**：真实模型/网关下工具结果图片进入同一 `prompt` 的下一次
  请求，回答与图一致；详见探针记录。GIF 未探（无编码器）、大图仅做 SDK 归一化离线验证、单模型/单网关、
  单次样本等剩余缺口见探针记录 §五。
- **工具结果附图是否经过 Pi 的 `processImage` 管线**：已核实本机 `pi-coding-agent@1.1.0` 在
  `agent-session.js:368` 调用 `normalizeToolResultImages` → `processImage`（autoResize 缺省开，
  上限 2000×2000 / 4.5MB base64），超限图片会被缩放重编码并附提示文本；离线大图验证见探针记录 §四。
- **启用条件**：适配器映射 + 真实探针均已就绪；`RUNTIME_VIEW_IMAGE_POLICY.pi` 仍为 `next-turn`，
  是否翻表由运行时核心按 Gate 3 证据决定（本角色未改 policy）。探针失败应保持 `next-turn`，
  本适配器改动不改变回退路径。
- 未 git 提交；未读 `.env` 值；探针只发往客户已配置的网关；未重启应用。
