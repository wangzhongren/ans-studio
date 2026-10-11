# 桌面应用 模块笔记与代码位置

## 代码位置

```
app/
  main.ts                     Electron 主进程入口（根入口 + Interface 生命周期）
  preload.cjs                 受限 IPC 桥（CJS，contextBridge 白名单）
  desktop/
    interface.ts              桌面 Interface：IPC 处理器（纯逻辑，可单测）
    session.ts                会话管理器（点角色即开、多轮 send、事件消费、demo/pi 选择）
    chat-adapter.ts           多轮演示运行时适配器（脚本化写入，经 gate 判定）
    project.ts                由枚举构造 ProjectConfig；读变更记录/docs 索引
    operator-channel.ts       操作者/客户确认通道 (a)（纯逻辑；shell 闸 + finalize 收口确认共用，复用不造第二套）
    pi-config.ts              Pi 配置面板逻辑（读写仓库根 .env，经共享 env-file 模块）
  renderer/
    index.html / styles.css / renderer.js   视图（无 Node）：顶部自绘标题栏 + 三栏骨架
test/桌面应用/
  project.test.ts / session.test.ts / interface.test.ts   单元与集成测试
  finalize-wiring.test.ts    创世 finalize 接线 + 收口确认面测试（T36/T38）
  e2e/main.mjs                端到端自检（真实 Electron 驱动真实界面，截图+报告）
```

## 依赖方向

`app/main.ts`（入口）→ `app/desktop/*`（Interface）→ 编排 `openRoleSession` / 门禁引擎 `listProject` → 下游。
主进程**不导入** `src/` 下 Service/Provider 的 impl；只经冻结导出调用。

## 关键实现点

- **枚举**：`app/desktop/interface.ts::listProject` 调门禁引擎 `listProject(projectRoot)`；界面不重写解析。
- **构造 ProjectConfig**：`project.ts::buildProjectConfig` 用枚举到的 `cardPath/boundaryPath` 拼 `roles`；
  `governanceBoundary = { path: "", acceptance }`——`acceptance` 已**不再恒为「导入即授权」**：
  `session.ts::open` 先经**共享载入器** `loadEffectiveConfig`（`src/common/shared/config-loader.ts`，
  只读导入、不复制）判定**生效** acceptance（**有 `.ans` 优先用其 pin-backed 值；无 `.ans` 回退运行期同意；
  `.ans` 不可用则未接受**），再据此开会话（T13）。
- **会话驱动**：经编排 `openRoleSession(input, deps)` 建会话（**只建一次**）；`scope` 传 `undefined`
  （聊天无任务收窄，授权上界 = 角色边界本身）。`send` 反复调；`SessionManager` 有事件消费循环，
  把 `handle.events()` 持续外推到渲染侧；切换角色先 `dispose` 旧会话，关窗 `dispose`。
- **授权来源分档（T13）**：`SessionManager.open` 用 `loadEffectiveConfig({projectRoot, skillRoot, fallback})`
  取回 `source.acceptance`，`fallback = buildProjectConfig(listing, 运行期同意)`。`OpenResult.config`
  如实带回 `{kind, accepted, acceptanceSource, pinCount, reason}`；渲染进程在**未授权**（`ans-invalid` 或缺 pin）
  时内联 `sys-config` 明示「不是已授权状态」。判定链**唯一实现**在共享模块，桌面**未自写第二份**。
- **点角色即开（客户定稿）**：`SessionManager.open` 一次调用直接建会话，**无任何确认弹窗/摘要/nonce**；
  同角色重复点击 = 续接（返回 `note` 说明，不重建）；切换角色 = 先 `dispose` 再开。
  越界写入被门禁照常拦截，拒绝信息（含按根分组的允许路径）作为 `denied` 事件内联显示在聊天流里。
- **演示运行时（demo）——现仅作测试替身**：`chat-adapter.ts::createChatDemoAdapter`（多轮，自建——`createFakeRuntimeAdapter` 单轮即关队列）。
  每次 `send` 脚本化发起"边界内 + 越界"两笔写入，均经受治理 `buildGovernedTools(gate)` 判定，**不真正落盘**（未传 `writeRoot` → 写层 fail-closed）。
  **客户 2026-10-11 裁定去掉运行时选择器、桌面一律跑 pi** 后，界面**不再**暴露 demo；它只在**测试注入缝**上使用——e2e 注入它顶掉真实 pi 工厂以离线跑完整流程（界面无后门开关）。
- **写入语义（客户 2026-10-11 定稿：去掉运行时选择器、桌面一律跑 pi）**：「只判不写」**只是 demo 路径的属性**、**已不在界面出现**。
  桌面一律走 **pi 路径**（经编排 `createPiAdapterFactory` → 真实适配器，`writeRoot = projectRoot`）**会真正写入被导入项目**，但**受门禁约束**
  （角色边界 Section 1 + acceptance，与 CLI 同一套 `resolveWrite`），越界写在**写之前**被拒。
  界面**单一句**（`renderer.js::WRITE_NOTE` → 常驻 `#runtime-note`）落在**中栏横栏**（不再随运行时切换、不再在输入区）；会话头副标题为中性「会话由治理引擎全程把关，写入受该角色边界约束」。
- **创世 finalize「完成 bootstrap」（T36/T38）**：su（模型）**不会算 hash**，pin 只能由**代码**在 su 写完后算。
  `SessionManager.open` 对**仅创世 su 会话**（`!hasRoles && role.builtIn`，不硬编码 "su"）开 `genesisFinalize: true`
  ⇒ 句柄附 `settled` + `finalize()`；**有角色的普通聊天不传**（行为不变）。**触发＝显式**（不自动跑，避免多轮中途
  pin 半成品）。`SessionManager.bootstrapState()`/`finalizeBootstrap()` → Interface → IPC `session:bootstrap-state`/
  `session:finalize`。
  **T37 语义**：`finalize()` **不再「调用即完成」**——是「**su 提议收口 → 挂起等客户确认 → 确认通过才落盘**」。
  **确认通道（T38）复用既有 (a)** `operator-channel.ts::createDesktopOperatorChannel`（同一 `OperatorChannelFn` 契约、**不造第二套**）——
  `DesktopDeps.operatorChannel` → `SessionManagerDeps.operatorChannel` → **仅创世 finalize 会话**透传给编排 `openRoleSession`；
  主进程 `main.ts` 用**渲染侧 presenter** 构造（提议经 `session:finalize-proposal` 主→渲染、`session:finalize-confirm` 渲染→主回传），**不弹系统对话框**。
  **确认面**：提议渲染为**聊天流里的一张卡**（`renderer.js::appendFinalizeProposal`）——「su 提议：可以收口了（完成 bootstrap）」+
  将写出什么 + `[确认完成]`/`[暂不]`（**只在 su 已提议时才出现**）；触发入口 `#bootstrap-action` 按钮＝「让 su 提议收口」。
  **fail-closed**：未接通道 / 不可用 / 超时（默认 120s）/ 拒绝 → **不完成且零副作用**。**确认后**读作「项目已转正、su 仍可继续增改角色」；
  未完成示完整 reason（不假装成功）。写入经门禁 `resolveWrite`（不绕门）。`FinalizeResult` 类型从编排公开句柄派生（不导入其私有 `common/编排/`）。
- **自绘标题栏（窗口装饰，2026-10-11 客户裁定）**：去掉**原生 OS 标题栏**与**默认菜单栏**两样 chrome。
  主进程 `main.ts`：`BrowserWindow` **`frame: false`**（**`resizable` 不动** ⇒ Windows 缩放边框仍在）+
  `app.whenReady()` 里 **`Menu.setApplicationMenu(null)`**（去默认菜单栏；编辑类快捷键由 Chromium 原生处理、
  不依赖菜单）。渲染侧顶部 `#titlebar`：左＝应用标识（原左栏重复的品牌已上移，左栏头改「项目」分区标签）、
  右＝`#win-min`/`#win-max`/`#win-close` 三按钮；整条 `-webkit-app-region: drag`、按钮 `no-drag`。
  **双击拖动区最大化＝系统原生**（拖动区按 HTCAPTION 处理），渲染侧**不挂 `dblclick`**（叠加会抵消）。
  三按钮经 `window:minimize`/`window:toggle-maximize`/`window:close` IPC 驱动窗口；最大化态经
  `window:is-maximized`（初始化）+ `window:maximized-changed`（外推）反映到按钮图标（`.win-btn.is-maximized`）。
  纯窗口操作、**无治理判定**。e2e 自建窗口同步 `frame:false`+`setApplicationMenu(null)`，接线用**注入替身**验证
  （绝不真点关闭/最小化/最大化）。

## 已知偏离

- **acceptance 来源（T13 后分档）**：（a）项目带**可用** `.ans/project.json` → 用其 **pin-backed acceptance**
  （pin 生效，篡改即由门禁 `verifyPins` 判未接受 → 拒写）；（b）**无** `.ans` → 回退**运行期同意**，
  `acceptance.source` 如实标注为「desktop-app:导入项目即授权该角色按其完整边界工作（原型，无客户 pin，已知偏离）」
  （设计 §3.3 登记的非-pin 例外）；（c）`.ans` **存在但不可用** → 载入器 fail-closed **未接受**、
  **不回退**运行期同意，界面内联 `sys-config` 如实明示「不是已授权状态」。门禁对未接受边界的 fail-closed 语义不变（不更松）。
- **类型检查**：仓库已装 `typescript`（7.x）；`npm run typecheck`（`tsc --noEmit`）**全仓零错误**，是常规验证手段之一（另有 `node --test` 与真实运行）。
