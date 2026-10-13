# 桌面应用 API 规格（IPC 通道与导出）

> 实现报告。源码在 `app/`，归「桌面应用」角色。

## 2026-10-13：UI/UX v2内部展示事实

`ReplayRow.activity?`是本角色内部IPC展示数据：toolName、target、phase、status及可选toolCallId/turnId/ok。JSONL仍在主进程只读解析，renderer不接SDK或文件系统。SessionEvent、role-state、图片/发送/撤回IPC均保持不变；缺事实明确未知，accepted不等于执行完成。详情见[变更记录](docs/change/2026-10-13_change_uiux-v2.md)。新解析需要主进程重启，由PM安排；布局可仅重载renderer。

## 2026-10-13：诊断与显式恢复（canonical v1）

main先配置唯一共享 `src/common/shared/diagnostics.ts`，路径 `app.getPath('userData')/ans/diagnostics`；滚动24小时留存由共享模块维护。窗口加载/故障/IPC、会话/回交、交互等待节点只记录白名单元信息，不保存正文、图片、命令参数或凭据；退出flush/dispose。main自己的IPC由 `createWindowIpcRegistrar` 在窗口关闭时只释放该窗口注册的通道，macOS再建窗可以正常接线。

| 新内部IPC | 输入/输出与边界 |
| --- | --- |
| `app:renderer-diagnostic` | 页面提交固定事件名及有限元信息；宿主校验来源窗口、字段类型/限长，组件和项目上下文由main绑定，不能指定path/component/日志目录 |
| `app:recovery-state` | 只返回宿主已知 `{projectRoot,roleId}`，无任意读取路径 |
| `app:reload-interface` | 同窗口显式按钮动作，重新加载固定renderer文件；没有自动循环或任意导航URL |
| `app:recovery-ready` | 恢复界面就绪后，只重推customer/shell仍pending的同id请求，不作答、不延长许可、不复活结束请求 |

renderer恢复用list+select续接已有会话，不走会关闭所有句柄的loadProject。`customer-input`与`operator-channel`新增角色内部 `replayPending():number`。项目角色的 `openRoleSession` 顶层实际注入公开 `RoutineShellPolicy`，仅生效配置已接受且非built-in；su只读/未接受项目不传。精确命令匹配和b允许要求仍由编排控制，桌面不自行批准。

回交状态原样显示 completed/blocked/unreported/failed/aborted；主入口不提前镜像卡片，只显示默认收起的真实投递详情和助手汇总。su队首连续回交经编排 `renderHandbackBatchPrompt` 一次投递，客户消息/派发为屏障，失败整批同序保留。公开队列/发送载荷没有扩展。验证与候选哈希见[修复记录](docs/fix/2026-10-13_fix_viewport-reports-diagnostics.md)。

## 运行

```bash
npm run app            # = electron app/main.ts（Electron 44 自带 Node 24.21，直接跑 .ts）
```

`package.json` 的 `main` / `app` 脚本 / devDependency `electron` 属**装配**角色（已在位）。

## 运行时关键结论（Electron 与 TS）

- Electron 44.7.0 自带 **Node 24.21.0**，其原生 **TS 类型擦除**在 GUI 主进程内同样生效：
  主进程可**直接** `import` 仓库内的 `.ts`（实测 GUI 主进程 `import('./x.ts')` 成功）。
- 因此**无需构建步骤**：与零构建的 CLI 路径一致。
- 前提：主进程以 **ESM** 运行（`package.json` `"type": "module"`），源文件只用**可擦除语法**（无 enum/namespace/参数属性）。
- preload 例外：由 Electron 自行按 CJS 加载，不经类型擦除，故为 `app/preload.cjs`（无类型）。

## 分层

| 文件 | 层 | 说明 |
| --- | --- | --- |
| `app/main.ts` | 根入口 + Interface 生命周期 | 建窗、注册 IPC；只持 Interface 句柄，不直接导入 Service/Provider 的 impl |
| `app/preload.cjs` | Interface | `contextBridge` 只暴露白名单 IPC，不暴露任何 Node 能力 |
| `app/desktop/interface.ts` | 桌面 Interface | IPC 背后的处理器（纯逻辑，可单测）；调门禁引擎 `listProject` 与编排 `openRoleSession` |
| `app/desktop/session.ts` | 桌面 Interface | 会话管理器：点角色即开、多轮 send、事件消费、demo/pi 适配器选择 |
| `app/desktop/chat-adapter.ts` | 桌面 Interface | 多轮演示运行时适配器（脚本化写入，经 gate 判定） |
| `app/desktop/project.ts` | 桌面 Interface | 由枚举构造 `ProjectConfig`；读变更记录与 docs 索引（展示用） |
| `app/desktop/pi-config.ts` | 桌面 Interface | Pi 配置面板逻辑（纯逻辑）：读写仓库根 `.env`（**经共享模块 `env-file`，只读导入**）、掩码机密键、保存后重载 |
| `app/renderer/**` | 视图 | 三栏界面；**不接触** Node/文件系统，只经 `window.desktop` |

## IPC 通道

| 通道 | 方向 | 参数 → 返回 |
| --- | --- | --- |
| `app:pick-project` | 渲染 → 主 | `()` → `string \| null`（系统文件夹选择器） |
| `app:list-project` | 渲染 → 主 | `{ projectRoot }` → `ListProjectResult`（角色清单 + 卡片正文 + 边界条目 + 变更记录/docs 索引 + warnings） |
| `session:open` | 渲染 → 主 | `{ projectRoot, roleId, runtime }` → `OpenResult`（**点角色即开**：一次调用直接建立会话，无确认步骤） |
| `session:send` | 渲染 → 主 | `{ text }` → `SendResult`（**可反复调用**；**L-1**：角色忙时消息**入队**而非直接失败——`{ok:true, queued:true, position:N}`，界面如实提示「已入队：等它完成当前任务后处理（第 N 位）」） |
| `session:stop` | 渲染 → 主 | `{ roleId? }` → `StopResult`（**B-2 定向**：给定 `roleId` 只关它、历史留在界面；缺省/`null` 关全部） |
| `session:live` | 渲染 → 主 | `()` → `string[]`（保活中的角色 id；B-2 左树「有活动会话」小圆点数据源；纯读） |
| `session:operator-request` | 主 → 渲染 | `{ id, roleId, request }`（**A-5 交互卡**：confirm〔可带预览〕/ choice〔单选/多选〕——su 的确认制工具挂起时推达；`request` 为冻结形状） |
| `session:operator-response` | 渲染 → 主 | `{ id, decision }` → `{ ok, error?, expired? }`（主进程**按请求快照校验**后解挂为冻结三态；`expired`=应用重启后旧回包——**不按时间过期**） |
| `session:history` | 主 → 渲染 | `{ roleId, projectRoot, rows, error }`（**D-1 重启恢复**：主进程只读解析 `<project>/.ans/sessions/<roleId>/` 的规范化界面行；渲染侧不碰 JSONL——解析失败如实携带 error、不阻断导入） |
| `session:role-state` | 主 → 渲染 | `{ roleId, busy, summaries, queue, running }`（**L-1 + 状态准确性 + 右栏待办**：**真实状态快照**——会话 busy（含 B-2 后台轮次）× 队列；`queue`=结构化排队条目（`{kind, sourceRoleId, summary, at}`——与 summaries 同源）；`running`=正在跑的那条投递（若有）。徽标「工作中 · N 待办」、聊天流队列行与**右栏「待办 / 队列」组**都只信它，界面不做推测） |
| `shell:confirm-request` | 主 → 渲染 | `{ id, command, summary, reasonPlain, reasonRaw, argvLines, cwd }`（**M-1**：(a) 层**应用内确认卡**数据面——命令**逐字**；summary/reasonPlain 已由主进程翻人话；argv/cwd/原文在折叠详情） |
| `shell:confirm-response` | 渲染 → 主 | `{ id, allow }` → `{ ok, error?, expired? }`（**M-1**：**恰 `allow:true` 才放行**；拒绝/Esc/关闭=false；`expired`=已失效——未获放行） |
| `session:event` | 主 → 渲染 | `SessionEvent`（`tool_call` / `denied` / `accepted` / `message` / `settled`）——单发通道（探针/直发）。 |
| `session:events` | 主 → 渲染 | `SessionEventEnvelope[]`（**Q-1 合帧批量**：16ms（≈一帧）窗口内的事件数组、顺序不变；preload 两通道同解）。 |
| `project:changed` | 主 → 渲染 | `()`（主入口角色一轮结束时发送）→ 渲染侧重取 `listProject` 让左树刷新 |
| `app:open-external` | 渲染 → 主 | `{ url }` → `{ ok, error? }`（**B-1**：仅 http/https——渲染输入不可信；Markdown 链接外开） |
| `app:pick-image` | 渲染 → 主 | `()` → `PickImageResult`（**K-2 选图**：主进程 dialog + fs 读——渲染进程不碰文件；按**真实字节**校验〔魔数嗅探/≤5MB〕；取消=`cancelled:true`≠失败） |
| `app:attach-image` | 渲染 → 主 | `{ name?, mime?, dataBase64? }` → `AttachImageResult`（**K-2 粘贴/拖入**：声明值不可信、按真实字节校验；**图片送进模型未接**——只收下与校验） |
| `pi-config:get` | 渲染 → 主 | `()` → `PiConfigView`（`{ path, fields:[{key,secret,value,isSet}] }`；**机密键 value 恒空串**，只给 `isSet`） |
| `pi-config:save` | 渲染 → 主 | `{ updates: {键:值} }` → `PiConfigSaveResult`（`{ ok, appliedKeys, error? }`；**只含键名、不含值**；成功则写 `.env` 并重载 env） |
| `window:minimize` | 渲染 → 主 | `()` → `void`（自绘标题栏·最小化 → `win.minimize()`） |
| `window:toggle-maximize` | 渲染 → 主 | `()` → `boolean`（自绘标题栏·最大化/还原切换，返回**目标**态；→ `win.maximize()\|unmaximize()`） |
| `window:close` | 渲染 → 主 | `()` → `void`（自绘标题栏·关闭 → `win.close()`） |
| `window:is-maximized` | 渲染 → 主 | `()` → `boolean`（读当前最大化态；初始化按钮图标用，纯读） |
| `window:maximized-changed` | 主 → 渲染 | `boolean`（`maximize`/`unmaximize` 时外推 → 按钮图标在「最大化 / 还原」间切换） |

**授权模型（客户定稿 + T13）**：导入项目 = 授权。`session:open` 内部先经**共享载入器** `loadEffectiveConfig`（`src/common/shared/config-loader.ts`，**只读导入，不复制**）判定生效 acceptance：
- 项目带**可用**的 `.ans/project.json` → 用其 **pin-backed acceptance**（pin 生效、受 pin 约束）；
- **无** `.ans` → 回退**运行期同意** `acceptance = { accepted: true, source: "desktop-app:导入项目即授权该角色按其完整边界工作（原型，无客户 pin，已知偏离）" }`（登记的非-pin 例外）；
- `.ans` **存在但不可用** → 载入器 **fail-closed 未接受**（**不回退**运行期同意）。
再以该 acceptance 构造项目配置，经 `openRoleSession`（`scope` 传 `undefined`）建立会话。`OpenResult.config` 如实带回 `{kind, accepted, acceptanceSource, pinCount, reason}`——渲染进程据此在未授权时内联 `sys-config` 明示「不是已授权状态」。
同角色重复点击 = 续接（`OpenResult.note` 说明，不重建）；**切换角色 = 各自保活（B-2）**——切走**不** dispose、
切回直接续，超出 `MAX_LIVE_SESSIONS`（LRU）才淘汰最久未用者；`session:stop` 为**定向**关闭（缺省/`null` 关全部）。
**不存在任何「请求摘要 → 确认」序列**——`DispatchSummary` / `nonce` 已随授权模型一并删除。

## 客户确认面（**收口已删**；A-5 后的现状 / 2026-10-12）

**T38 时代的「完成 bootstrap」收口面（`session:bootstrap-state`/`session:finalize`/`session:finalize-proposal`/`session:finalize-confirm` 与 `#bootstrap-action`）已全部退役**（A-5「删收口面」：产物收尾由编排在 su 会话 settle 后**自动**完成，桌面不再有 finalize 读写/触发面；历史记录见 `docs/change/2026-10-12_change_operator-cards-and-finalize-removal.md`）。

**取代它的是交互卡（A-5）**：su 的 `request_confirmation` / `request_choice` 经 `session:operator-request` 摆成**聊天流里的交互卡**、客户决定经 `session:operator-response` 回传（按请求快照校验）；「客户确定了才加、才落盘」由编排的确认制 writeSet 发行承接（`common/编排/confirmed-writes.ts`，桌面不复制）。**已删面的旧断言保留为「它不存在」守卫**（e2e `OP_OLD_ENTRY_REMOVED`/`OP_OLD_CARD_REMOVED`）。

**shell 闸 arm（I-1，2026-10-12；**M-1 起 (a) 层为应用内确认卡**）**：`DESKTOP_SHELL_GATE_ARMED=true`——(a) 操作者确认通道（`createDesktopOperatorChannel`；呈现端 `createShellConfirmPresenter`：**应用内卡**——命令逐字等宽块 + 人话摘要/原因 + 折叠详情，**拒绝为默认焦点**，Esc/关闭 = 不放行；M-1 前为原生对话框，客户裁定「这个太丑了」后退役）+ **(c) 规则集实件**（`buildDesktopShellArming`：只读导入 `src/service/gate/shell-rules.ts` 的 `classifyShell`/`defaultShellRules`）**两件同备才 arm**，经 `shellOperatorChannel`/`shellArming` 透传给编排装配 (c)/(b)/(a) `ShellGate`（**仅项目角色**；su 不 arm；(c) 加载失败 ⇒ 连 (a) 也不注入——`run_shell` 不注册）。详见 `docs/change/2026-10-12_change_shell-arm.md`（含补丁节与已知风险「无沙箱」）。

## 自绘标题栏（窗口装饰：由原生改为自绘 / 2026-10-11 客户裁定）

**来源**：客户「顶部需要去除 electron 原本的，自己搞一个」——去掉**原生 OS 标题栏**与**默认菜单栏**两样 chrome，自绘一条。

- **无边框**：`app/main.ts` 的 `BrowserWindow` **`frame: false`**；**`resizable` 不动**（默认 `true`）⇒ Windows 上**缩放边框仍在**（`thickFrame` 默认 true）。
- **去默认菜单栏**：`app.whenReady()` 里 **`Menu.setApplicationMenu(null)`**。编辑类快捷键由 Chromium 原生处理、不依赖菜单，故**未失效**；默认菜单的加速键（Ctrl+R/F12/Ctrl+Q）**非必要**，**不补**。
- **渲染侧**：顶部 `#titlebar`——左＝应用标识（`ANS 治理会话工作台`）、右＝`#win-min`/`#win-max`/`#win-close` 三按钮；整条 `-webkit-app-region: drag`、按钮 `no-drag`。**双击拖动区最大化＝系统原生**（拖动区按 HTCAPTION 处理），渲染侧**不挂 `dblclick`**。
- **IPC**：见上表 5 条 `window:*` 通道；主进程侧 `registerIpc` 内注册，无治理判定、纯窗口操作。
- **e2e**：`test/桌面应用/e2e/main.mjs` 自建窗口也 `frame:false` + `setApplicationMenu(null)`；接线验证用**注入替身**（临时把三个动作通道换成只记录者），**绝不真点关闭/最小化/最大化**。

## Pi 配置面板（设计 §11 / T28）

**前提**：桌面 pi 路径此前不可达（`app` 脚本无 `--env-file` ⇒ 进程 `process.env` 无 `ANS_PI_*`/token；桌面亦无通道把配置交给适配器，设计裁定**不扩** `createPiAdapterFactory` 签名）。本面板补上该缺口。

- **启动载入**：`app/main.ts` 在 `app.whenReady()` 里 `await loadEnvFileInto(process.env, resolveRepoEnvPath())`——**补 Electron 缺失的 `--env-file`**（只回报**键名**，绝不打印值）。此后 `resolvePiProviderConfig(opts, process.env)` **原样复用**（单一来源，无第二份读取逻辑）。
- **面板键**（**3 项必填 + 1 项「高级」可选**）：必填 `ANTHROPIC_AUTH_TOKEN`（**机密，掩码**）/ `ANS_PI_BASE_URL`（拒绝回落默认端点，故必须显式给）/ `ANS_PI_MODEL`；可选 `ANS_PI_CONTEXT_WINDOW`（收进**可折叠的「高级」**、**可留空**——留空 = 不下发该键，Pi适配器回落**保守默认** `DEFAULT_PI_CONTEXT_WINDOW=32768`，缺失不再硬失败）。**`ANS_PI_PROVIDER` 不在面板里**（客户 2026-10-11：它在代码里有默认值 `ans-gateway`、是内部标签、不是用户该做的决定；底层仍支持该环境变量，只是不再占输入框、`savePiConfig` 也不写它；`.env` 里**已有**的那行原样保留）。必填键集合 = `PI_REQUIRED_KEYS`（3 项）；`missingPiKeys`/界面告警**只数必填**。
- **落点**：`app/desktop/pi-config.ts` 为**逻辑唯一落点**，只读导入 pm 属主的共享 `src/common/shared/env-file.ts`（`getPiConfig` 用 `readEnvFile`+`isSecretKey`；`savePiConfig` 用 `saveEnvFile`+`loadEnvFileInto`）——**未复制 `.env` 读写实现**。
- **凭据纪律**：`getPiConfig` 对机密键**恒返空 `value`**、只给 `isSet`（值绝不外发到渲染进程）；保存/读取回报**只含键名**；错误文本由共享模块 redact、本模块再兜底。
- **注入点**：`DesktopDeps.envFilePath`（默认仓库根 `.env`；**测试/e2e 必须传系统临时目录假路径**）、`DesktopDeps.piConfigEnv`（保存后重载目标，默认 `process.env`）。
- **UI**：**「Pi 设置」按钮在**中栏横栏右侧（客户 2026-10-11 裁定去掉运行时选择器后，入口从输入区上移到横栏）+ 可收起面板 `#pi-panel`；token 字段 `type=password`、可显式「显示」；**3 项必填**字段 + 可折叠的「高级」（`<details class="pi-advanced">`，内含可选的 `ANS_PI_CONTEXT_WINDOW` 与一行说明「留空 = 用默认值（偏保守：压缩会提前触发，不会炸会话）；知道确切值就填」）；**必填缺项**时状态行明确告警（可选缺失不算缺）。

## 创世收口（**已退役** / A-5，2026-10-12）

**T36 的「创世 finalize 接线」（`genesisFinalize` 入参、`bootstrapState()`/`finalizeBootstrap()`、
`#bootstrap-action` 动作条）已随 A-5「删收口面」整体删除**——桌面**不再有任何 finalize 读写/触发面**；
产物收尾由**编排**在 su 会话 settle 后自动完成（客户裁定：见 `docs/change/2026-10-12_change_operator-cards-and-finalize-removal.md`）。
本页上文历史版本中关于它的描述已不适用；`test/桌面应用/finalize-wiring.test.ts` 亦已删除（其断言并入
「它不存在」守卫）。su 建角色后的产物仍受门禁约束（写判定唯一来源不变）。

## 对外导出（主进程侧）

- `app/desktop/interface.ts`：`createDesktopInterface(deps)`、`RoleView`、`ListProjectResult`、`DesktopDeps`、`DesktopInterface`（`SessionOpenRequest`/`OpenResult` 等类型自 `session.ts` 引入使用）。
- `app/desktop/session.ts`：`SessionManager`、`SessionOpenRequest`、`OpenResult`、`EffectiveConfigInfo`、`SendResult`（**L-1**：增 `queued?`/`position?`）、`StopResult`、`RuntimeKind`、`SessionEventEnvelope`（B-2 信封）、`MAX_LIVE_SESSIONS`。`SessionManagerDeps` 现有注入面：`openRoleSession`/`createPiAdapterFactory`/`createDemoAdapter`/`buildProjectConfig`/`getListing`/`emitEvent`/**`emitRoleState`（L-1 真实状态快照）**/`shellGate`/`shellOperatorChannel`/**`shellArming`（I-1 补丁）**/`customerInput`。
- `app/desktop/chat-adapter.ts`：`createChatDemoAdapter`、`firstProjectFilePath`（**L-1**：每轮结束发 `settled`——忙态复位依赖它）。
- `app/desktop/operator-channel.ts`：`DESKTOP_SHELL_GATE_ARMED`、(**I-1 补丁**) **`buildDesktopShellArming`**、**`DesktopShellArming`**（`Omit` 自编排 `AssembleShellGateOptions`）、`createDesktopOperatorChannel`、`describeShellCommand`、`DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS` 及其类型转出。
- `app/desktop/customer-input.ts`：`createCustomerInputChannel`、`DesktopCustomerInputFn`（A-5；`respond` 回报 `{ok, error?, expired?}`——`expired`＝应用重启，**非超时**）。
- `app/desktop/session-history.ts`：`readRoleSessionHistory`、`probeSessionFile`、`ReplayRow`（D-1，只读解析）。
- `app/desktop/composer-images.ts`：`validateImage`、`sniffImageMime`、`decodeImageBase64`、`sanitizeImageName`、`MAX_IMAGE_BYTES`、`ALLOWED_IMAGE_MIMES`（K-2 纯逻辑）。
- `app/desktop/project.ts`：`buildProjectConfig`、`buildEffectiveProjectConfig`、`readRoleDocsIndex`、`resolveSkillRoot`。
- `app/desktop/pi-config.ts`：`PI_PANEL_KEYS`（4 键：3 必填 + 1 可选）、`PI_REQUIRED_KEYS`（3 必填）、`resolveRepoEnvPath`、`getPiConfig`、`savePiConfig`、`loadPiEnv`、`missingPiKeys`（只数必填）（及类型 `PiConfigView` / `PiConfigField` / `PiConfigSaveResult`）——**只读导入**共享 `env-file`，**无第二份 `.env` 实现**。
- `app/desktop/interface.ts` 的 `DesktopInterface` 增 `getPiConfig()` / `savePiConfig({updates})`；`DesktopDeps` 增 `envFilePath?` / `piConfigEnv?`。
- `app/desktop/interface.ts` 的 `DesktopInterface` 增 **`openExternal`（B-1）/ `pickImage`·`attachImage`（K-2）**；`DesktopDeps` 增 **`emitRoleState?`（L-1）/ `customerInput?`（A-5）/ `shellOperatorChannel?` 与 `shellArming?`（I-1）/ `openExternalFn?` / `pickImageFileFn?`（K-2）**；`openRoleSessionFn` 入参含 `customerInput?`/`dispatchTask?`/`shellOperatorChannel?`/`shellArming?`（收口相关的 `genesisFinalize?` **已退役**）。

## 硬约束落实

1. 渲染进程内**无**第二份边界判断/解析：枚举经 `app:list-project` → 主进程 `listProject`（门禁引擎）。
2. 渲染进程**不接触** Node/fs：仅经 preload 白名单通道。
3. 会话**点角色即开、多轮直发**：`SessionManager.open` 一次调用经 `openRoleSession` 建立会话（`scope` 不传）；此后 `send` 反复调用；同角色续接、异角色先 dispose。
4. 主进程只持 Interface 句柄：`main.ts` 调用 `app/desktop/*`，不导入 `src/` 下 Service/Provider 的 impl 内部。
5. 聊天 `scope` 传 `undefined`：授权上界 = 角色边界本身（门禁引擎据此不做任务收窄）；判定唯一来源仍是门禁引擎。
