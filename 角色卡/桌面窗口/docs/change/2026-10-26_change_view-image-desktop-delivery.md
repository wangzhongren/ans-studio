# 变更记录：view_image 桌面投递能力（两轮附件，2026-10-26）

- **状态**：implemented-unverified（桌面单元/集成测试 + 全仓 typecheck 通过；真实窗口/真实模型端到端与独立验收未做）
- **依据**：客户 2026-10-26 要求「让角色能看项目里的图片」；运行时核心已落两轮附件契约（`角色卡/运行时核心/docs/change/2026-10-26_change_view-image-two-round-attachment.md`）与工具 `view_image`。本批只做**桌面侧能力实现与注入**。
- **范围**：`app/desktop/view-image.ts`（新增）、`app/desktop/session.ts`（开会话时构造并注入 `viewImage`）、`test/桌面应用/message-queue.test.ts`（新增 4 例）。**未改** `app/main.ts`/`app/preload.cjs`（无 IPC 变化——能力在会话装配内部注入）、`src/**`、渲染器、编排、门禁卡与 i18n。

## 以前怎样、现在怎样

**以前**：`view_image` 工具在运行时核心已实现（读取/校验项目内图片并调用注入的 `ViewImageFn`），但桌面开会话时不注入该能力 ⇒ `view_image` 结构性不注册，角色无法看图。

**现在**：`SessionManager.openInternal` 在开会话/重建时构造 `viewImage: ViewImageFn`（目标 `projectRoot/roleId/runtime` 当场定格），随 `openRoleSession` 入参注入；真实编排原样转交运行时核心，工具据此注册。工具本轮内调用能力时：

1. 能力把图片转成一条**后台系统提示**：文字「这是 view_image 请求的图片：`<path>`；请查看后判断」，`PromptOptions.images = [input.image]`（工具生成的 `PromptImage` 对象原引用，不重新编码/不复制），metadata `background:true` + `kind:"system"`；
2. 经**既有 `SessionManager.send` → 同一投递机**投递给同一角色：工具在本轮内 ⇒ 角色必然 busy ⇒ 按到达序入队，settle 后按序投递；不会并发插入到当前轮；
3. 直发/入队成功 ⇒ `{ok:true}`；会话不可用、传输失败、载荷非法（无路径/图片数据不合法）⇒ `{ok:false,message}`（带底层原因），**不谎称已提供**；非法载荷不投任何文本；
4. 不按 `activeRoleId` 改投，不接受调用方指定别的角色；不冒充客户消息（`kind:"system"`，UI 队列显示「系统」、不可撤回）；真实客户消息与 handback/dispatch 的图片语义零变化（`send` 的 `images` 引用保持）。

## 行为与纪律

| 项 | 契约 |
| --- | --- |
| 契约形状 | 单一来源＝`src/model/runtime.ts`：`ViewImageInput { path, image: PromptImage }`、`ViewImageFn = (input) => Promise<{ok,message?}>`；桌面不复制第二份 |
| 注入判据 | **通用只读能力**：所有角色会话（项目角色与内置治理角色）都注入；未注入 ⇒ 工具不注册（fail-closed） |
| 投递目标 | 开会话时定格的 `projectRoot/roleId/runtime`；不按活动角色/调用方上下文改投 |
| 投递类别 | `background:true` + `kind:"system"`（后台系统提示；不抢 pane、不冒充客户消息） |
| 忙时 | 既有投递队列（同一套机），按到达序；settle 后按序投递 |
| 图片载荷 | `PromptOptions.images = [input.image]`；`PromptImage` 对象原引用 |
| 回执 | 成功仅 `{ok:true}`（已交给投递机，含入队）；失败 `{ok:false,message}`；不谎报已提供 |
| 非法载荷 | 空路径 / 无图片 / 图片结构非法 ⇒ `{ok:false,message}`，零投递、零文本 |

## 明确不做 / 风险

1. **不持久化排队中的图片载荷**：既有投递队列持久化只存 JSON 安全字段（`opts` 不落盘）；应用在「已入队、未投递」之间重启时，该条按文本恢复、图片附件丢失。这是 P0-1 以来既有语义，本批未扩张。
2. **不做 UI/文案呈现**：排队成功/失败的聊天呈现、下一轮图片在聊天中的展示属「桌面UI」；本批只保证投递与回执事实。
3. **不做图片内容校验**：扩展名/MIME、10 MB 上限、realpath 越界、路径句法均在运行时核心工具层；桌面能力只做结构与投递。
4. **未跑真实模型端到端**：下一轮模型实际收到图片、各引擎编码预算/请求体限制未在本机验证；未做真实窗口验收。
5. **并发契约漂移已收敛**：本批初期曾按本地复数 `images` 形状起草，运行时核心冻结契约落树后已对齐为单数 `{path,image}`；桌面不再保留本地 `ViewImageFn` 定义（只读导入契约家）。

## 验证

- `npm run typecheck`：通过（exit 0）。
- `node --test "test/桌面应用/**/*.test.ts"`：**675/675 通过**（一次全量运行中 `interface.test.ts` 的「可重入门禁」用例因并行负载超时抖动失败，单独重跑与再次全量均通过；与本批改动无关）。
- 新增用例（`test/桌面应用/message-queue.test.ts`）：
  1. 工具本轮调用 ⇒ system 入队、settle 后按序投给同一角色、图片对象原引用；不投当前活动角色；
  2. 发送失败/会话不可用/非法载荷如实失败，忙态如实复位；
  3. 真实客户消息 `images` 原引用与直达语义不变；
  4. **真实 `openRoleSession` + 真实 `view_image` 工具**集成：桌面注入 ⇒ 工具注册；本轮读取真实 PNG、排队为 system 条目，settle 后把同一 base64+MIME 的 `PromptImage` 投回同一角色。
