---
id: k-input-capsule-and-images
type: change
title: K-1 胶囊输入框 + K-2 图片发送（到主进程为止；送模型未接）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [operator-card-delivery-and-tool-rows, message-queue-and-role-state]
events:
  - date: "2026-10-12"
    kind: created
    summary: 客户裁定 K-1（输入框改圆角胶囊、发送箭头内嵌）+ K-2（图片选/贴/拖入、可移除缩略图；字节交主进程按真实内容校验）
  - date: "2026-10-12"
    kind: implemented
    summary: index.html/styles.css 胶囊输入区（attach-row + capsule：附件键+textarea+内嵌发送键）；composer-images.ts 纯逻辑（魔数嗅探/≤5MB/白名单/名称清洗）；main.ts 两个新 IPC（读文件在**主进程**）；renderer 粘贴/拖入/选图 + 缩略图与移除
  - date: "2026-10-12"
    kind: verified
    summary: test/桌面应用 136 计/135 过/1 红（唯一红为既有环境红）；全量 830/827/2 红（两红均既有环境红）；typecheck 0 错
---

# K-1 胶囊输入框 + K-2 图片发送（桌面侧的一半）

**来源**：客户裁定（2026-10-12，设计稿 K 组）。**属本角色边界内**（只动 `app/**` + `test/桌面应用/**` + 本页）。

## K-1：输入区改版（圆角胶囊 + 内嵌发送箭头）

- **结构**（`app/renderer/index.html`）：`.composer` = `#attach-row`（附件缩略图行，空则 `hidden`）+ `#composer-capsule.capsule`
  （`#btn-attach-image` 附件键 + `#inp-message` 无边框 textarea + `#btn-send` 内嵌圆形发送箭头）。
  旧「输入框 + 独立发送钮」行结构（`.composer-row`/`.btn-send`）**退役**。
- **样式**（`styles.css`）：`.capsule`（`border-radius:999px` + `:focus-within` 描边）、`.cap-icon`、`.cap-send`
  （圆形深底箭头；禁用态 `.35` 透明度）、`.attach-row/.attach-chip/.attach-rm`。
- **行为逐字保留**：Enter 发送 / Shift+Enter 换行、`btn-send` 禁用口径（未开会话禁用）、
  `#composer-hint`/`#session-state` 状态位仍在 chat-head 可达、onSend 守卫不变（空输入不发）。

## K-2：图片发送（**到主进程为止**；送进模型那一段**未接**）

- **渲染进程不碰文件系统**：选图走新 IPC `app:pick-image`（主进程 `dialog.showOpenDialog` + `fs.promises.readFile`
  → base64）；粘贴/拖入经浏览器 File API 读 base64 后走 `app:attach-image`。preload 只加这两个白名单方法。
- **字节为准（声明值不可信）**：校验全在 Interface 层纯逻辑 `app/desktop/composer-images.ts`——
  **魔数嗅探**真实类型（PNG/JPEG/GIF87a-89a/WEBP）、≤5MB（`MAX_IMAGE_BYTES`）、类型白名单
  （png/jpeg/webp/gif）、文件名清洗；**扩展名不作数**（注释钉死）。取消是 `cancelled:true`（不是失败）。
- **交互**：缩略图 chips + 移除键（`revokeObjectURL` 防泄漏）；失败如实提示（超限/非图片/读取失败都在
  hint 与聊天流双落）。
- **⚠ 未接（如实登记）**：**图片随消息送进模型的能力未接线**（Pi适配器正在核实 SDK 图片内容块）——
  发送时如实说明「随消息附加的 N 张图片**未发送**」（图片保留在输入区），**绝不假装已读图**；
  网关多模态支持未知 ⇒ 届时若模型不能读图，界面须如实说「未能识别图片」（登记为后续义务）。
- **持久化影响（登记）**：图片 base64 不落 `app` 侧任何文件；但**一旦**接上送模型，D-1 会话 JSONL
  体积将随图片增长（属 Pi适配器会话文件；提示在其接线时常量上界/压缩策略，跨角色提案）。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin arm64 / HEAD d933537）

- `test/桌面应用/composer-images.test.ts`（3 例）：魔数嗅探（声明 mime 不可信）、≤5MB 上界与白名单、
  base64 解码防御（近似体积预检、坏输入不炸）。
- `renderer.test.ts`：**K-1 结构/样式钉**（胶囊容器、发送键在胶囊**之内**、旧行退役、快捷键与状态位可达）+
  **K-2 钉**（两 IPC 两端、渲染侧不碰 fs、`FileReader`、未接如实文案、样式钩子、纯逻辑模块单一来源）。
- `test/桌面应用` 全套 **136 计 / 135 过 / 1 红**（唯一红＝既有环境红 pi-config）；全量 **830/827 · 2 红**
  （两红均既有环境红）。`npm run typecheck` 0 错。e2e 探针已同步（`COMPOSER_ROWS_ARE_ATTACH_AND_CAPSULE` 等；
  e2e 未在本机跑——如实登记）。
