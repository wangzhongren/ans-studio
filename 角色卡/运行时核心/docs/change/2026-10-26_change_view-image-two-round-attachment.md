---
id: view-image-two-round-attachment-change
type: change
title: "图片查看 view_image（两轮附件设计）Model/Provider 契约"
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: implemented-unverified
related: [runtime-core]
events:
  - date: "2026-10-26"
    kind: implemented
    summary: 客户要求新增 view_image：工具读取项目内图片、校验后调用注入的 ViewImageFn，把图片排队为同一角色下一轮用户提示的图片附件；工具本轮只返回文本。Model 增 ViewImageInput/ViewImageFn/GovernedToolsOptions.viewImage；tools.ts 增注入才注册的 view_image（项目相对路径、realpath 根内复核、目录拒绝、png/jpg/jpeg/webp/gif + MIME、10MB 上限、base64→PromptImage、能力回执如实转达）；schema.ts 增两轮附件/能力存在性/路径/类型/大小/不假装已看文案；新增 view-image-tool.test.ts 10 例；runtime-core 全目录 344 计/337 过/3 既有 Windows symlink 红/4 skip（较基线 +10 计 +10 过零新红）；npm run typecheck exit 0
---

# 图片查看 `view_image`（两轮附件设计）

**状态分开写**：已实现（下列改动路径全部落盘）；已验证（本机 Windows 上的新增测试、runtime-core 全目录回归与 `npm run typecheck`，见「验证」）；**未验证**（下游注入后的图片实际投递、真实模型端到端、独立验收——下游并行接线在工作树中已出现，本角色只读核对形状一致，未运行其测试）。

依据：客户 2026-10-26 要求「让角色能看项目里的图片」。各引擎对**工具结果附图**的支持不一致（有的原生支持、有的不支持），因此采用**两轮附件**：工具只读取/校验图片并调用注入能力把图片排队为**同一角色下一轮用户提示的图片附件**；本轮工具结果只返回文本，明确要求模型不要假装本轮已看到。本轮范围只有运行时核心的 Model/Provider 契约、工具、schema、测试与本角色文档；能力实现（把图片写入下一轮 `PromptOptions.images`）与注入判据属 Service/编排/桌面侧。

## 以前怎样、现在怎样

**以前**：受治理工具集没有图片查看能力；模型只能通过 `read_file`（UTF-8 文本）读取文件，二进制图片会被按文本解码产生乱码，无法真正「看」图片。

**现在**：

- `src/model/runtime.ts`：
  - `ViewImageInput { path: string; image: PromptImage }`——能力入参（路径原样回显 + 已转好的 base64/MIME）；
  - `ViewImageFn = (input: ViewImageInput) => Promise<{ ok: boolean; message?: string }>`——成功表示**已排队**，`ok:false` 的 message 原样转达；
  - `GovernedToolsOptions.viewImage?: ViewImageFn`——**未注入 ⇒ 工具不注册**（结构性 fail-closed，沿 `dispatch_task`/`flowGet` 先例）。
- `src/provider/runtime/tools.ts`：
  - 新增工具 `view_image`（常量 `VIEW_IMAGE_TOOL_NAME`）与 `VIEW_IMAGE_MAX_BYTES = 10 * 1024 * 1024`；
  - 只在 `options.viewImage` 存在时注册；
  - 参数 `{path: string}`（handler 经与 `read_file` 同一 `readTargetPath` 取值，兼容 `file_path`/`filePath` 别名；schema 只声明 `path`）；
  - 路径安全：拒绝空/NUL/绝对路径/盘符路径（含盘符相对 `C:foo`）/任何 `..` 段；`realpath(readRoot)` 与 `realpath(target)` 后用共享 `isWithinReal` 复核读取根（挡符号链接/junction 逃逸）；必须是普通文件（目录明确指路 `list_dir`）；
  - 类型：按**真实文件**扩展名（小写化）映射 `.png→image/png`、`.jpg/.jpeg→image/jpeg`、`.webp→image/webp`、`.gif→image/gif`；其它扩展名拒绝；
  - 大小：`stat.size > 10 MB` 拒绝；读取后按实际字节数复核（挡 stat/read 之间被替换/增长），不截断、不缩图；
  - 读二进制 → `Buffer.toString("base64")` → `PromptImage {type:"image",data,mimeType}`；
  - 调用 `viewImage({path, image})`；成功回执逐字为
    `view_image: <path> 已读取并排队；下一轮以图片附件提供；本轮不要假装已看到。`（可附 callback message）；
  - 能力 `ok:false`/抛错/契约外回执 ⇒ `ok:false` 并如实说明「未能排队 / 未返回明确回执」、下一轮不会收到附件；中止时按「排队未获确认」处理（raceAbort 不取消底层 promise，不谎称已提供或未提供）；
  - 能力未注入时的注册缺失在 `buildGovernedTools` 结构性保证；`displayInputRule` 为 `core-path-v1`；
  - 不写盘、不联网、不过写门禁；`read_file`/其它工具零行为变化。
- `src/provider/runtime/schema.ts`：`view_image` 的 schema（仅 `path`，必填，`additionalProperties:false`）与描述/指引钉住：**两轮附件**、本轮只返回文本、下一轮才是图片附件、**不要假装本轮已看到**；仅在注入图片能力时存在；项目相对路径、拒绝绝对/`..`/越界/目录；5 种扩展名 + 10 MB；失败不谎报已提供；不写盘/不联网/不过写门禁。

## 行为与纪律

| 项 | 契约 |
| --- | --- |
| 注册 | 仅 `options.viewImage !== undefined` 时注册；未注入 ⇒ 工具不存在（模型无法请求） |
| 参数 | `{path: string}`；缺 path / 非字符串 / 空串 ⇒ 失败且**不调用能力** |
| 路径 | 项目相对；NUL/绝对/盘符/`..` 在触碰文件系统前拒绝；realpath 复核读取根（win32 大小写不敏感）；目录/非普通文件拒绝 |
| 类型 | 仅 `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif`（真实文件扩展名，大小写不敏感）；MIME 映射固定 |
| 大小 | 单文件 ≤ **10 MB（10485760 字节）**；超限拒绝，不截断、不缩图 |
| 本轮回执 | 成功只表示**已排队**；固定句「已读取并排队；下一轮以图片附件提供；本轮不要假装已看到」 |
| 失败 | 路径/类型/大小非法 ⇒ 工具失败且不调能力；能力拒绝/抛错/契约外 ⇒ 如实「未排队」，**绝不谎报已提供** |
| 中止 | 不谎称已提供或未提供：回执为「排队未获确认，下一轮是否收到以系统为准」 |
| 副作用 | 不写盘、不联网、不过写门禁、不改变任何写权；不影响其它工具 |

## 改动路径（位置 → 改动）

| 文件 | 改动 |
| --- | --- |
| `src/model/runtime.ts` | 新增 `ViewImageInput` / `ViewImageFn`（两轮附件契约）与 `GovernedToolsOptions.viewImage?`；仅类型/注释，无行为实现。 |
| `src/provider/runtime/tools.ts` | 新增 `VIEW_IMAGE_TOOL_NAME` / `VIEW_IMAGE_MAX_BYTES` / `VIEW_IMAGE_MIME` / `viewImagePathSyntaxError` / `viewImageReceiptOf` / `makeViewImageTool`；`buildGovernedTools` 注入才注册；`displayInputRule` 增 `core-path-v1`；`abortedToolResult` 增中止如实回执。 |
| `src/provider/runtime/schema.ts` | 新增 `view_image` 的 schema/description/promptGuidelines；其它工具文案零变化。 |
| `test/runtime-core/view-image-tool.test.ts` | 新增 10 例：未注入不注册；注入只新增且既有工具零变化；schema 形状与文案；合法 png/jpeg（含大写扩展名）/webp/gif 的 base64+MIME；成功回执附 callback message；路径非法矩阵不调能力；不支持类型/无扩展名/超 10 MB 不调能力；能力失败/抛错/契约外回执如实；中止不调能力且不谎称已提供；read_file 与 request_gate_review/request_acceptance 零回归。 |
| `角色卡/运行时核心/docs/feature/runtime-core.md` | 记录两轮附件行为与接线状态。 |
| `角色卡/运行时核心/feature-map.md` | 新增功能导航行与证据链接。 |
| `角色卡/运行时核心/memo.md` | 追加本轮实施摘要。 |

## 明确不做 / 未覆盖（跨角色缺口）

1. **下游接线不在本角色写集**：工作树中桌面/编排的并行改动已按冻结契约为 `viewImage` 接线（桌面 `app/desktop/view-image.ts` 已改用契约家的 `ViewImageFn`/`ViewImageInput`，把工具给的 `PromptImage` 装入 `PromptOptions.images`；`run-role.ts` 透传、`SessionManager` 对全部角色会话注入），本角色只读核对名称/形状一致，**未运行其测试、未验证真实投递**；未注入时工具仍不注册（fail-safe）。
2. **注入判据归下游**：哪些角色/会话获得 `view_image` 由注入端决定（并行实现为全部角色会话）；本层不硬编码角色 id，也不授予额外动作面。
3. **图片内容未校验**：只按扩展名映射 MIME，不做魔数/内容嗅探与恶意图片清洗；读取根内的任意支持类型文件都会被排队（与 `read_file` 的读取面同性质，但不解析内容）。
4. **大小/内存边界**：10 MB 图片 base64 后约 13.3 MB 字符串，加上下一轮附件传输与各引擎编码开销，内存/请求体预算由能力侧与适配器保证；本层只按 10 MB 源文件设限。
5. **桌面呈现未接线**：排队成功/失败、下一轮附件在聊天中的展示属桌面窗口角色；本轮不做 UI/i18n。
6. **未跑真实模型/端到端**，未做独立验收；本机为 Windows 11（仅单元测试与类型检查证据）。

## 验证（本机，2026-10-26）

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0，0 错 |
| 新增文件 `node --test test/runtime-core/view-image-tool.test.ts` | **10/10 通过**，exit 0 |
| `node --test "test/runtime-core/**/*.test.ts"` | **344 计 / 337 过 / 3 红 / 4 skip**；3 红均为既有 Windows symlink EPERM（`file-write-safety` D3 ×1、`session-store` ×2），与改动前基线 **334 计 / 327 过 / 3 红 / 4 skip** 相比 +10 计 +10 过、零新红 |

## 风险与后续

- **MIME 仅按扩展名**：扩展名与真实字节不一致时会被按声明 MIME 排队；若引擎严格校验会报错，属能力/适配器侧如实反馈，本层不猜内容。
- **TOCTOU**：`stat` 与 `readFile` 之间文件可能被替换；读取后按实际字节数复核上限，但内容一致性不保证（只读工具，风险与 `read_file` 同类）。
- **raceAbort 不取消底层排队**：中止瞬间能力可能已受理；回执按「未获确认」如实陈述，消费方不要据此断言未排队。
- **跨层接线是可用性前提**：能力未注入时工具不存在；真实可用性、下一轮附件投递与端到端体验需 Service/编排/桌面接线后由独立验收补齐。
