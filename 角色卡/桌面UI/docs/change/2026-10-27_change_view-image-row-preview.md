# 变更记录：view_image 独立工具行与缩略图预览（桌面UI）

- **日期**：2026-10-27
- **角色**：桌面UI（渲染前端）
- **状态**：**implemented-unverified**（渲染层实现、单测、渲染层/根 typecheck、renderer build 通过；未跑真实 Electron 视觉核验；按任务要求未重启应用，运行中的实例仍是旧构建）
- **授权依据**：
  - 客户 2026-10-27 反馈（经项目管理/主理会话转达）：桌面聊天流里 `view_image` 的命令被折叠在工具组里，且看不到角色实际查看的图片；要求显示这条命令（工具名 + 项目内路径 + 状态）并显示查看的是哪张图。
  - 角色边界：`角色卡/桌面UI/boundary.yaml` Section 1（`app/renderer/**`、`test/桌面UI/**`、本角色 docs）。本任务明确要求 i18n 走共享目录并更新守卫/计数，故同时改动 `src/common/shared/i18n/messages/{zh-CN,en-US}.ts` 与 `test/项目管理/shared/i18n.test.ts` 的 key 计数断言（共享目录属主为项目管理；此处为任务明确授权的跨角色配合，未改其实现与语义）。
- **写集**：`app/renderer/**`、`test/桌面UI/**`、上述共享 i18n 两个消息目录与计数断言、本角色 docs；**未改** `app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/provider/**`、`src/pipeline/**`、`src/model/**`、`test/桌面应用/**`；未 commit/push；未重启/关闭应用。

---

## 一、现状核对（只读）

| 事实 | 位置 |
| --- | --- |
| 渲染器 `SPECIAL_TOOLS` 不含 `view_image`，实时与历史工具行都归入可折叠 `activities` 工具组 | `app/renderer/src/chat/events.ts::SPECIAL_TOOLS`、`describeEvent`、`historyRowToDescriptor` |
| 会话历史行已有 `activity.toolName = "view_image"` 与项目相对 `target`（如 `docs/verification/pixel-snake/gate-vertical-slice/vs-ready.png`） | `app/desktop/session-history.ts`（主进程只读消费；未改） |
| 工具行（生命周期/工具组）只显示工具名、target、状态，没有图片 | `app/renderer/src/chat/ChatRow.tsx::ToolLifecycleRow`、`ActivityRow` |
| 渲染器当前是 `file://` 页面；客户已实测 `new Image().src = 'file:///…/ready.png'` 可加载（naturalWidth 1280） | 本任务输入；未改 CSP |

## 二、实现内容

| 文件 | 改动 |
| --- | --- |
| `app/renderer/src/chat/view-image-preview.ts`（新增，纯逻辑） | `isSafeProjectImagePath(path)`：拒绝非字符串/空串/NUL 与控制字符、绝对路径/UNC/盘符/协议形式、`..`/`.`/空段/尾斜杠、含冒号段（NTFS ADS）、非 png/jpeg/jpg/webp/gif 扩展名；Windows 反斜杠归一。`viewImagePreviewUrl(projectRoot, target)`：项目根为空/非绝对路径或 target 非法时返回 `null`；支持盘符（`file:///C:/…`）、POSIX（`file:///home/…`）与 UNC（`file://server/share/…`）；项目根与 target 均逐段百分号编码（空格/中文/`#`/`?`/`%`）。 |
| `app/renderer/src/chat/events.ts` | `SPECIAL_TOOLS` 增加 `view_image`——实时 `tool_call`/`accepted`/`denied` 与历史 `tool`/`denied` 行统一成为独立 `tool-lifecycle` 行，不再进入折叠工具组；其他工具的既有分组与工具生命周期语义不变。 |
| `app/renderer/src/chat/ChatRow.tsx` | `ToolLifecycleRow`（即 `.tool-call-record` `<details>` 的渲染组件；当前源码无独立 `ToolCallRecord` 组件）拆出原始 `rawTarget`；行下方（`<details>` 之外）新增 `ViewImagePreview`：`projectRoot + target` 构造 file URL，`<img className="view-image-preview" alt={target} loading="lazy" decoding="async">`；**工具组兜底路径 `ActivityRow` 同样接入**（`ActivitiesRow` 从 `useChatStore` 取 `projectRoot` 传入，仅成功/进行中的 `view_image` 在展开组内显示缩略图）；项目根缺失/路径非法/加载失败分别显示 `ui.viewImage.previewNoProject` / `previewPathUnsafe` / `previewLoadFailed`，不显示破图；未放行/失败的调用不显示缩略图（角色并未看到图片），只保留命令行与状态；不提供点击放大（现有导航规则只放行 http/https 外链，`file:` 导航不安全，宁可不做假入口）。 |
| `app/renderer/src/chat/chat-store.ts` | 新增 `touchPane(roleId)`：只 bump 该 pane 版本，供缩略图 `onLoad`/`onError` 后触发 `VirtualPane` 重新测量行高（异步图片改变行高时保持 spacer 记账与贴底行为）。不改变行模型/虚拟窗口算法。 |
| `app/renderer/src/shell/shell.css` | 新增 `.view-image-preview`（`max-width: min(420px, calc(100% - 12px))`、左缩进 12px）与 `.view-image-preview img`（`max-width:100%`、`max-height:240px`、`object-fit:contain`、`image-rendering:pixelated`、`border`、`border-radius:var(--radius-micro)`）；`.view-image-note` 复用 `--text-3`。不覆盖既有工具行布局。 |
| `src/common/shared/i18n/messages/zh-CN.ts` / `en-US.ts` | 新增 3 个 `ui.viewImage.preview*` key（成对、en-US 无中文）；`ui.viewImage.attachmentLabel` 既有 key 未动。 |
| `test/项目管理/shared/i18n.test.ts` | 按该测试自身约定更新 key 分区计数：`ui` 787→790、总数 1381→1384、ui 增量 782→785（仅计数与注释）。 |

## 三、用户可见行为

- **独立命令行**：聊天流中 `view_image` 不再收进「本轮 N 个调用」折叠组；行内显示时间、`view_image`、项目相对路径（超长省略、title 保留全文）与状态（运行中/执行完成/未放行/失败等，沿用既有 `ui.tool.status.*` 文案）。
- **缩略图**：成功/进行中的调用在行下方显示缩略图（最大约 420×240、contain、像素化、描边）；点击不导航、不放大。缩略图 `img` 自身带 `view-image-preview` class（容器同名），e2e/探针既可按 `img.view-image-preview` 也可按容器定位。
- **两条渲染路径**：主路径为 `.tool-call-record`（`ToolLifecycleRow`，历史回放与实时事件同一行类型）；若旧数据/异常数据仍把 `view_image` 留在工具组，展开组后 `ActivityRow` 也显示同一缩略图（兜底，不重复）。
- **如实标注**：项目未加载、target 不是项目内图片路径、图片加载失败时保留命令行，分别显示对应说明，不显示破图。
- **历史与实时一致**：历史回放行与实时事件走同一 `isSpecialTool` 判定与同一 `ToolLifecycleRow` 渲染。
- **语义边界**：未放行/失败的 `view_image` 不显示缩略图——只显示命令、路径与失败/未放行状态，避免暗示角色看到了图片。

## 四、安全与契约

- **不做第二份边界判定**：本模块只判断「能否安全地作为 `<img>` 预览」，不判定写入资格；写入/读取边界仍唯一来自主进程/门禁引擎。
- **target 按不可信输入处理**：拒绝绝对路径、盘符、UNC、协议、`..`、`.`、空段、NUL/控制字符、ADS 冒号段与非图片扩展名；只允许 png/jpeg/jpg/webp/gif。
- **projectRoot 视为受信**（主进程列举结果）：拼接前归一化分隔符/尾斜杠并逐段编码；非绝对路径返回 `null`，不猜。
- **CSP 未改**：`index.html` 的 `img-src 'self' data:` 保持原样；客户已在 `file://` 页面实测 file 图片可加载。若未来 CSP 收紧到显式 `file:`，需另行评估（桌面窗口/装配属主）。
- **IPC/DOM 契约**：未新增/修改 preload 通道；新增 DOM 为 `.view-image-preview`/`.view-image-note`，不改既有工具行选择器与 `data-*`。

## 五、验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 纯逻辑 + 接线守卫单测 | `node --test "test/桌面UI/view-image-preview.test.ts"` | **13/13 pass**（10 纯逻辑 + 3 接线/ CSS 守卫） |
| `SPECIAL_TOOLS` 路由测试 | `node --test "test/桌面UI/event-routing.test.ts"` | **9/9 pass**（新增 view_image 实时/历史/denied 用例；其余工具仍 `activities`） |
| 桌面UI 套件 | `node --test "test/桌面UI/**/*.test.ts"` | **310/310 pass / 0 fail**（原 296 + 新增 14） |
| 共享 i18n 与守卫 | `node --test "test/项目管理/shared/i18n.test.ts"` / 单独 `i18n-guard.test.ts` | **62/62 + 6/6 pass（合并运行 68/68）**（key 全集 parity、计数、无硬编码中文回潮） |
| 渲染层 typecheck | `npm run typecheck:renderer` | **exit 0** |
| 根 typecheck | `npm run typecheck` | **exit 0** |
| 渲染器构建 | `npm run build:renderer` | **成功**（Vite，2679 modules；产物 `dist/assets/index-DpP258Yg.js` 含 `view-image-preview` 容器+`img` class、`ui.viewImage.preview*` key 与 ActivityRow 兜底接线；CSS 133.99kB / JS 1,141.07kB） |
| 真实历史行只读回放（逻辑级） | 以 `demos/tiny-snake/.ans/sessions/verifier/pi/ans/replay.jsonl` 中真实 `view_image` 事件构造 `ReplayRow` 并导入渲染层纯逻辑 | `historyRowToDescriptor` → `tool-lifecycle`；target = `docs/verification/pixel-snake/gate-vertical-slice/vs-ready.png`；`viewImagePreviewUrl` → `file:///C:/Users/51054/Desktop/work/ans-studio/demos/tiny-snake/docs/verification/pixel-snake/gate-vertical-slice/vs-ready.png`；源文件存在（15,784B） |

真实历史行核验的命令（只读，不写盘）：

```bash
node --input-type=module -e "…读取 verifier/pi/ans/replay.jsonl 的 view_image tool_call 行…"
```

补记（2026-10-27 主上下文实测反馈）：历史回放的 `view_image` 行是 `details.tool-call-record`；该 DOM 在当前源码由 `ToolLifecycleRow` 产出（源码中没有独立命名的 `ToolCallRecord` 组件）。已确认缩略图就挂在该组件 `<details>` 之外，并补上 `ActivityRow` 工具组兜底与 `img.view-image-preview` 自身 class，便于 `img.view-image-preview` 探针定位。

未执行：真实 Electron e2e/截图/视觉核验（应用未重启；运行中的实例仍是旧构建，需由主上下文用新 `dist/` 受控启动/重载后核验）。

## 六、残余与风险（如实登记）

1. **真实视觉未核验**：缩略图的实际尺寸、像素化效果、暗色描边与 1360/960/200% 布局需真实渲染器确认。`dist/` 已按本批源码重建（Vite 成功），但运行中的应用未重启/未重载，仍是旧构建；需主上下文用新 `dist/` 受控启动或重载后核验。
2. **file:// 依赖运行形态**：开发服务器（http://localhost）下 `file:` 图片会被 CSP/来源策略拦截；生产 `file://` 页面按客户实测可加载。若未来改为自定义协议或 http 入口，预览需改由主进程通道提供（属跨角色设计）。
3. **仅成功/进行中的调用显示图片**：未放行/失败的调用只显示命令行与状态；这是有意的如实呈现，若客户希望「失败也看到尝试的图」，需另行确认语义。
4. **大图不预处理**：`<img>` 直接读取原图（`view_image` 工具本身限 10 MB、仅图片扩展名）；极端大图会占用解码内存，但浏览器承担缩放，`loading="lazy"` 降低离屏开销。
5. **旧历史数据**：只有携带 `activity.toolName="view_image"` 的行才会成为独立行；缺少工具身份、仅靠摘要文本的旧行仍按原工具组语义呈现（不猜）。
6. **跨角色文件**：共享 i18n 消息目录与 `test/项目管理/shared/i18n.test.ts` 计数断言由项目管理属主维护；本批按任务明确要求做最小增改（3 个 key + 计数），建议项目管理复核登记。
7. **未提交**：工作树候选，未 commit/push/暂存。

## 七、改动文件清单

- 新增：`app/renderer/src/chat/view-image-preview.ts`、`app/renderer/src/chat/view-image-lightbox.ts`、`app/renderer/src/chat/ViewImageLightbox.tsx`、`test/桌面UI/view-image-preview.test.ts`、`test/桌面UI/view-image-lightbox.test.ts`、本文件。
- 修改：`app/renderer/src/chat/events.ts`、`app/renderer/src/chat/ChatRow.tsx`、`app/renderer/src/chat/ChatStream.tsx`、`app/renderer/src/chat/chat-store.ts`、`app/renderer/src/shell/shell.css`、`test/桌面UI/event-routing.test.ts`、`src/common/shared/i18n/messages/zh-CN.ts`、`src/common/shared/i18n/messages/en-US.ts`、`test/项目管理/shared/i18n.test.ts`、`角色卡/桌面UI/{changelog,feature-map,memo}.md`。

## 八、客户追加：点击缩略图应用内放大（lightbox，2026-10-27）

**需求**：缩略图可点击弹出放大层；同一安全 file URL 大图 + 路径 + 关闭按钮；点击遮罩/Esc 关闭；`role="dialog"` + `aria-modal="true"` + 可读标签；关闭后焦点回到触发按钮；不导航 file://、不打开新窗口、不改 CSP；同一时刻只开一个；切换角色/卸载关闭；不影响虚拟窗口行高/滚动。

**实现**：

| 文件 | 改动 |
| --- | --- |
| `app/renderer/src/chat/view-image-lightbox.ts`（新增，纯状态） | 模块级 zustand 单例 store：`open({src,target,ownerId})` 打开/替换（非法载荷 fail-closed）、`close(ownerId?)`（带 owner 只关自己的）；`isLightboxCloseKey` 纯判定（只认未被 `preventDefault` 的 `Escape`）。不拼 URL、不导航。 |
| `app/renderer/src/chat/ViewImageLightbox.tsx`（新增，组件） | 全局唯一放大层：`createPortal(..., document.body)` + `position: fixed`；`role="dialog"`、`aria-modal="true"`、`aria-label=ui.viewImage.lightboxLabel({path})`；头部显示路径 + 关闭按钮（`shared.common.close`）；`onMouseDown` 仅点击遮罩（target===currentTarget）关闭；document 捕获 `keydown` 用 `isLightboxCloseKey` 关闭；打开时记录 `document.activeElement` 并把焦点移到关闭按钮，关闭/卸载时焦点归还触发按钮；大图加载失败在弹层内显示 `ui.viewImage.previewLoadFailed`，不显示破图。 |
| `app/renderer/src/chat/ChatRow.tsx` | `ViewImagePreview` 的缩略图包进 `<button type="button" class="view-image-preview-trigger" aria-label=ui.viewImage.openPreview({path}) aria-haspopup="dialog">`；点击 `useViewImageLightbox.open({src,target,ownerId})`；`ownerId=useId()`；卸载 cleanup `close(ownerId)`。**ToolLifecycleRow 与 ActivityRow 共用该组件**，点击逻辑只有一份。 |
| `app/renderer/src/chat/ChatStream.tsx` | 挂载唯一 `<ViewImageLightbox />`；`useEffect([selectedRoleId, projectRoot])` 无条件关闭放大层（切换角色/项目）。 |
| `app/renderer/src/shell/shell.css` | `.view-image-preview-trigger`（reset、`cursor:zoom-in`、`:focus-visible` 可见环、hover/focus 边框高亮、`img pointer-events:none`）；`.view-image-lightbox`（`position:fixed; inset:0; z-index:80; background:var(--backdrop-strong)`）；dialog/head/path/close/body；`.view-image-lightbox-image`（`max-width:calc(90vw - 26px)`、`max-height:calc(80vh - 60px)`、`object-fit:contain`、`image-rendering:pixelated`、描边）。 |
| `src/common/shared/i18n/messages/*` | 新增 2 个 key：`ui.viewImage.openPreview`（{path}）、`ui.viewImage.lightboxLabel`（{path}）；关闭按钮复用 `shared.common.close`。计数 1384→1386（ui 790→792）。 |

**行为细节**：

- 遮罩/大图均 fixed portal，不在聊天行 DOM 内，不触发行高测量；缩略图按钮 reset 后与图片同尺寸，不改变行高。
- 同一时刻只有一个弹层；打开新图替换旧图（实际 UI 中遮罩已阻止点击其它缩略图）。
- 切换角色/项目时 ChatStream 关闭弹层；缩略图因虚拟窗口卸载时按 owner 关闭自己的弹层（不误关别人的）。
- 不产生 `href`/`window.open`/`location`/`openExternal`；不放宽 CSP；大图 URL 仍是 `viewImagePreviewUrl` 的结果。
- 焦点：打开时从触发按钮移到关闭按钮（rAF），关闭后回到触发按钮；未实现完整 Tab 焦点陷阱（当前弹层唯一可聚焦项是关闭按钮）。

**验证（追加批次）**：

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 放大层纯状态/键/接线测试 | `node --test "test/桌面UI/view-image-lightbox.test.ts"` | **8/8 pass**（单例替换、owner 关闭、非法载荷、Esc 判定、button/portal/aria/焦点/遮罩/无导航源码守卫、CSS 钩子） |
| 桌面UI 套件 | `node --test "test/桌面UI/**/*.test.ts"` | **318/318 pass / 0 fail**（原 310 + 8） |
| 共享 i18n 与守卫 | `node --test "test/项目管理/shared/i18n.test.ts"`；`i18n-guard.test.ts` | **62/62 + 6/6 pass**（key 1386/ui 792 parity；guard scanned=130 violations=0） |
| 渲染层/根 typecheck | `npm run typecheck:renderer` / `npm run typecheck` | **exit 0 / exit 0** |
| 渲染器构建 | `npm run build:renderer` | **成功**；bundle `index-CH9TC3N_.js` 含 `view-image-lightbox`/`aria-modal`/触发按钮/两个新 key；CSS `index-CcOIDUh5.css` 含 fixed 遮罩、90vw×80vh、pixelated、zoom-in |

**残余（追加）**：

- 真实点击/截图核验未做（应用未重启/未重载）；需主上下文用新 `dist/` 受控启动后点击缩略图核验遮罩、大图与焦点。
- 大图按原图尺寸显示，仅受 90vw×80vh 上限约束；小图不会强制放大超过原尺寸（避免像素图模糊；如客户要求强制放大可再调整）。
- 未显式锁定背景滚动；当前应用 shell 为固定布局、聊天滚动容器不是弹层祖先，fixed 遮罩覆盖期间滚轮不会滚动聊天；若未来页面 body 可滚动需补 overflow lock。
- 未实现完整 Tab 焦点陷阱（弹层当前只有关闭按钮可聚焦）；Esc/遮罩/关闭按钮三条关闭路径与焦点归还已覆盖。
