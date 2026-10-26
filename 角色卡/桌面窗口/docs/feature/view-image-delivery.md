# 图片查看投递（view_image，桌面侧）

状态：**implemented-unverified**（桌面测试与 typecheck 通过；真实窗口/真实模型端到端与独立验收未做）。变更记录见 [2026-10-26_change_view-image-desktop-delivery.md](../change/2026-10-26_change_view-image-desktop-delivery.md)。

## 用途

角色在会话里调用运行时核心的 `view_image` 工具查看项目内图片。各引擎对「工具结果附图」支持不一致，因此采用**两轮附件**：工具本轮只读取/校验图片并回文本「已排队」；图片由桌面排成一条**下一轮用户提示的图片附件**，投给**同一角色**。

本角色负责的是「图片已经读出来后，怎么把它排队并投递给同一角色」；图片读取、路径/类型/大小校验属运行时核心工具（`src/provider/runtime/tools.ts`），能力契约属 `src/model/runtime.ts`。

## 当前流程

```
角色会话（工具本轮）
  └─ view_image 工具读取 docs/…/shot.png（扩展名/MIME、≤10 MB、realpath 根内）
       └─ ViewImageFn({ path, image: {type:"image",data,mimeType} })
            └─ app/desktop/view-image.ts::createViewImageDelivery（开会话时注入，目标定格）
                 └─ SessionManager.send(text, { images:[image] }, 同角色, {background:true,kind:"system"})
                      ├─ 角色忙（工具在本轮内必然如此）⇒ 既有投递队列按到达序入队
                      └─ settle ⇒ 既有投递机按序投递下一轮
                               └─ PromptOptions.images = [同一条 PromptImage]
```

投递后队列/UI：`kind:"system"` ⇒ 显示「系统」、不可撤回；摘要不带「你：」；真实客户消息语义不变。

## 不变量

- 目标就是**开会话时**的 `projectRoot/roleId/runtime`；不看 `activeRoleId`，调用方不能改投。
- `send` 的 `images` 元素保持工具给的 `PromptImage` 对象引用（字节不重新编码、不复制）。
- 回执只表达事实：`{ok:true}` = 已交给投递机（直发或入队）；失败 `{ok:false,message}` 带原始原因。
- 非法载荷（空路径/无图片/图片结构非法）⇒ 不投任何文本，避免「说了有图、实际无图」。
- 不改变客户消息、handback、dispatch 的图片语义；不改变其他能力的注入矩阵。
- 未注入能力 ⇒ `view_image` 工具不注册（运行时核心 fail-closed）。

## 代码位置

- `app/desktop/view-image.ts`：`buildViewImagePrompt`（提示文本单一来源）、`createViewImageDelivery`（结构校验 + 包装 `send`）。
- `app/desktop/session.ts`：`SessionManagerDeps.openRoleSession` 入参 `viewImage?`；`openInternal` 构造（`target` 定格）并注入。
- 测试：`test/桌面应用/message-queue.test.ts` 的 4 个 `2026-10-26 view_image` 用例（含真实 `openRoleSession` + 真实 `view_image` 工具的集成例）。

## 已知限制

- 排队里的图片载荷不落盘：应用在「已入队、未投递」之间重启时，该条按文本恢复、图片丢失（P0-1 以来既有语义）。
- 图片在聊天中的呈现、失败/排队提示的 UI 文案属「桌面UI」，不在本功能面。
- 10 MB 上限、MIME/扩展名与路径越界校验在工具层；本层不重复判定。
- 未验证真实模型/各引擎的请求体与图片编码预算，未做真实窗口端到端。
