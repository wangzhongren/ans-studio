# 桌面应用 API 规格（IPC 通道与导出）

> 实现报告。源码在 `app/`，归「桌面应用」角色。

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
| `session:send` | 渲染 → 主 | `{ text }` → `SendResult`（**可反复调用**：多轮聊天） |
| `session:stop` | 渲染 → 主 | `()` → `StopResult`（关闭会话；切换角色/关窗时调用） |
| `session:bootstrap-state` | 渲染 → 主 | `()` → `BootstrapState`（`{available, settled, finalized}`；**仅创世 su 会话**可能 `available`；纯读、无副作用） |
| `session:finalize` | 渲染 → 主 | `()` → `FinalizeResult`（`{ok, status?, wrote, pins, roles, reason?, message?, projectJsonRel, manifestRel}`；**T37 语义**：su **提议收口、挂起等客户确认**——成功示 wrote/pins/roles，未完成示 reason） |
| `session:finalize-proposal` | 主 → 渲染 | `{ toolCallId, proposal, reason }`（**su 提议收口**——渲染成聊天流里的确认卡，`[确认完成]`/`[暂不]`） |
| `session:finalize-confirm` | 渲染 → 主 | `{ toolCallId, allow }` → `{ ok, error? }`（客户对提议的选择：`allow:true`=[确认完成] → 落盘；`false`=[暂不] → 不完成） |
| `session:event` | 主 → 渲染 | `SessionEvent`（`tool_call` / `denied` / `accepted` / `message` / `settled`） |
| `project:changed` | 主 → 渲染 | `()`（主入口角色一轮结束时发送）→ 渲染侧重取 `listProject` 让左树刷新 |
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
同角色重复点击 = 续接（`OpenResult.note` 说明，不重建）；切换角色 = 先 `dispose()` 旧会话再开新会话。
**不存在任何「请求摘要 → 确认」序列**——`DispatchSummary` / `nonce` 已随授权模型一并删除。

## bootstrap 收口的确认面（T38；设计 §13）

**完成 bootstrap = su 提议「可以收口了」→ 界面把这件事摆给客户 → 客户确认 → 才 finalize**（客户 2026-10-11 裁定）。

- **确认通道**：finalize 收口经**既有 (a) `OperatorChannelFn`**（§4 冻结契约家 `src/provider/pi/session.ts`，**不造第二套**）。主进程 `app/main.ts` 用**渲染侧 presenter** 构造，经 `DesktopDeps.operatorChannel` → `SessionManagerDeps.operatorChannel` → **仅创世 finalize 会话**透传给 `openRoleSession`。presenter 把 `OperatorPrompt`（`command` = 提议原文、`reason` = 将写出什么）经 `session:finalize-proposal` 推达渲染侧，挂起等 `session:finalize-confirm` 回传。**fail-closed**：未接通道 / 不可用 / 超时（默认 120s）/ 拒绝 → **不完成**（零副作用）。
- **确认面**：`renderer.js::appendFinalizeProposal` 渲染聊天流里的一张卡——「su 提议：可以收口了（完成 bootstrap）」+ 将写出什么 + `[确认完成]` / `[暂不]`。**只在 su 已提议时才出现**。触发入口 `#bootstrap-action`（仅创世 su 会话显示）的按钮为「**让 su 提议收口**」。
- **导出/类型的单一来源**：`OperatorChannelFn` / `OperatorPrompt` / `OperatorOutcome` 从 `src/provider/pi/session.ts` 只读导入（`app/desktop/operator-channel.ts` 原样转出）；`FinalizeResult` 从编排公开句柄 `RoleSessionHandle["finalize"]` 派生（**不导入编排私有 `common/编排/`**）。
- **测试替身**：确认通道**全用注入替身**（`test/桌面应用/finalize-wiring.test.ts` 注入 allow/deny/unavailable/timeout 通道；e2e 经 `session:finalize-proposal` 推提议 + 注入 `session:finalize-confirm` 收集器），**绝不弹系统对话框**。

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
- **面板键**（5 项）：`ANTHROPIC_AUTH_TOKEN`（**机密，掩码**）+ `ANS_PI_BASE_URL` / `ANS_PI_MODEL` / `ANS_PI_PROVIDER` / `ANS_PI_CONTEXT_WINDOW`。
- **落点**：`app/desktop/pi-config.ts` 为**逻辑唯一落点**，只读导入 pm 属主的共享 `src/common/shared/env-file.ts`（`getPiConfig` 用 `readEnvFile`+`isSecretKey`；`savePiConfig` 用 `saveEnvFile`+`loadEnvFileInto`）——**未复制 `.env` 读写实现**。
- **凭据纪律**：`getPiConfig` 对机密键**恒返空 `value`**、只给 `isSet`（值绝不外发到渲染进程）；保存/读取回报**只含键名**；错误文本由共享模块 redact、本模块再兜底。
- **注入点**：`DesktopDeps.envFilePath`（默认仓库根 `.env`；**测试/e2e 必须传系统临时目录假路径**）、`DesktopDeps.piConfigEnv`（保存后重载目标，默认 `process.env`）。
- **UI**：**「Pi 设置」按钮在**中栏横栏右侧（客户 2026-10-11 裁定去掉运行时选择器后，入口从输入区上移到横栏）+ 可收起面板 `#pi-panel`；token 字段 `type=password`、可显式「显示」；缺项时状态行明确告警。

## 创世 finalize（「完成 bootstrap」，设计 §12.5 / T36）

**背景**：su（模型）**不会算 hash**，故 pin **只能由代码在 su 写完「之后」** 算。编排（T36）已把该能力挂到 `RoleSessionHandle.finalize`（经 `openRoleSession` 的**可选**入参 `genesisFinalize: true` 开启，句柄据它附 `settled` + `finalize()`）。桌面此前**无任何 finalize 调用**，故从用户入口走完 su 建角色后**无 pin**——本步接线。

- **接线点**：`app/desktop/session.ts::SessionManager.open` 对**仅创世 su 会话**（`listing.hasRoles === false && role.builtIn === true`，**不硬编码 "su"**）开 `genesisFinalize: true`；**有角色的普通聊天逐字不传**（行为不变）。
- **触发时机＝显式**（编排裁定）：su 建角色**可多轮**、每轮都 settle；「settle 就 finalize」会 pin **半成品**。本层**绝不自动调用** `finalize()`，只在 settle 时刷新入口「就绪」提示。**多轮建角色必须全在创世态内完成，finalize 是 bootstrap 的最后一步。**
- **状态/触发**：`SessionManager.bootstrapState()` 返回 `{available, settled, finalized}`；`SessionManager.finalizeBootstrap()` 转调句柄 `finalize()`（**失败如实返回 `{ok:false, reason}`**，不静默、不假装成功；成功后记 `finalized`）。Interface 层**只透传**（`getBootstrapState()` / `finalizeBootstrap()`）。
- **`FinalizeResult` 类型来源**：**从编排公开句柄类型派生**（`Awaited<ReturnType<NonNullable<RoleSessionHandle["finalize"]>>>`）——**不导入编排私有 `src/common/编排/finalize.ts`**（§6 禁跨角色导入他人私有 `common/`）。形状由编排**公开面**唯一决定。
- **不绕门**：finalize 的两笔写（`.ans/project.json`、`docs/bootstrap-manifest.md`）**同样经门禁 `resolveWrite`**（与 su 同一授权边界）；被拒即整批中止、**零副作用**。本层只转调编排实现，**无第二份落盘/边界判定**。
- **UI**：`#bootstrap-action` 动作条（`index.html`）——**仅** `bootstrapState().available` 为真时显示（创世 su 会话且未 finalize 过）；`settled` 决定就绪态（`.is-pending` 警示「现在点会被拒」/ `.is-ready` 主色「可以完成」）。点「完成 bootstrap」→ `d.finalizeBootstrap()` → `appendFinalizeResult` **如实呈现**：成功示 **写出路径 + Pin 的边界文件与 SHA-256 + Pin 的角色**，被拒示 **完整 reason**。渲染侧**不作判定**（只读主进程状态）。

## 对外导出（主进程侧）

- `app/desktop/interface.ts`：`createDesktopInterface(deps)`、`RoleView`、`ListProjectResult`、`DesktopDeps`、`DesktopInterface`（`SessionOpenRequest`/`OpenResult` 等类型自 `session.ts` 引入使用）。
- `app/desktop/session.ts`：`SessionManager`、`SessionOpenRequest`、`OpenResult`、`EffectiveConfigInfo`、`SendResult`、`StopResult`、`RuntimeKind`、**`BootstrapState`、`FinalizeResult`**（`FinalizeResult` 从编排公开句柄类型派生）。`SessionManager` 增 `bootstrapState()` / `finalizeBootstrap()`。
- `app/desktop/chat-adapter.ts`：`createChatDemoAdapter`、`firstProjectFilePath`。
- `app/desktop/project.ts`：`buildProjectConfig`、`readRoleDocsIndex`、`resolveSkillRoot`。
- `app/desktop/pi-config.ts`：`PI_PANEL_KEYS`、`resolveRepoEnvPath`、`getPiConfig`、`savePiConfig`、`loadPiEnv`、`missingPiKeys`（及类型 `PiConfigView` / `PiConfigField` / `PiConfigSaveResult`）——**只读导入**共享 `env-file`，**无第二份 `.env` 实现**。
- `app/desktop/interface.ts` 的 `DesktopInterface` 增 `getPiConfig()` / `savePiConfig({updates})`；`DesktopDeps` 增 `envFilePath?` / `piConfigEnv?`。
- `app/desktop/interface.ts` 的 `DesktopInterface` 增 **`getBootstrapState()` / `finalizeBootstrap()`**（T36，创世 finalize 入口）；`DesktopDeps.openRoleSessionFn` 入参增可选 `genesisFinalize?`。

## 硬约束落实

1. 渲染进程内**无**第二份边界判断/解析：枚举经 `app:list-project` → 主进程 `listProject`（门禁引擎）。
2. 渲染进程**不接触** Node/fs：仅经 preload 白名单通道。
3. 会话**点角色即开、多轮直发**：`SessionManager.open` 一次调用经 `openRoleSession` 建立会话（`scope` 不传）；此后 `send` 反复调用；同角色续接、异角色先 dispose。
4. 主进程只持 Interface 句柄：`main.ts` 调用 `app/desktop/*`，不导入 `src/` 下 Service/Provider 的 impl 内部。
5. 聊天 `scope` 传 `undefined`：授权上界 = 角色边界本身（门禁引擎据此不做任务收窄）；判定唯一来源仍是门禁引擎。
