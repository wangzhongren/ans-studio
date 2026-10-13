# 桌面应用 模块笔记与代码位置

## 代码位置

```
app/
  main.ts                     Electron 主进程入口（根入口 + Interface 生命周期）
  preload.cjs                 受限 IPC 桥（CJS，contextBridge 白名单）
  desktop/
    interface.ts              桌面 Interface：IPC 处理器（纯逻辑，可单测）
    session.ts                会话管理器（点角色即开、多轮 send、事件消费、demo/pi 选择；shell 闸两档分发）
    session-history.ts        会话记录恢复（D-1）：只读解析 `<project>/.ans/sessions/<roleId>/` 的最近 JSONL
                              → 规范化界面行（交互工具的调用行/结论行带 requestId/anchor/anchorKey 锚点标识）
    request-anchor.ts         交互请求锚点键的单一算法（kind+title；请求侧 customer-input 与回放侧
                              session-history 两侧同源拼键——卡（重）物化的锚点关联）
    customer-input.ts         客户确认制交互通道（A-5）：请求推达渲染侧（载荷带 anchorKey）+ 按请求快照校验回包
    chat-adapter.ts           多轮演示运行时适配器（脚本化写入，经 gate 判定）
    project.ts                由枚举构造 ProjectConfig；读变更记录/docs 索引
    operator-channel.ts       操作者确认通道 (a)（纯逻辑；shell 三层链的 (a) 层：应用内确认卡数据面 + presenter；fail-closed 三条）
    pi-config.ts              Pi 配置面板逻辑（读写仓库根 .env，经共享 env-file 模块）
  renderer/
    index.html / styles.css / renderer.js   视图（无 Node）：顶部自绘标题栏（右上角图标簇 #right-tabs）+ 两栏骨架 + 右抽屉 #right-drawer
test/桌面应用/
  project.test.ts / session.test.ts / interface.test.ts   单元与集成测试
  session-history.test.ts    D-1 解析/恢复测试（含锚点标识：调用行/结论行配对、非交互/缺 title/孤儿不着锚）
  operator-wiring.test.ts    确认制交互通道 + 注入判据测试（原 finalize-wiring.test.ts，A-5 按新语义重写）
  renderer.test.ts           渲染源码不变式守卫（含锚点物化三级落位/兜底落尾源码钉）
  e2e/main.mjs                端到端自检（真实 Electron 驱动真实界面，截图+报告；含「回放重建+已决卡」时序断言）
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
- **shell 闸两档分发（I-1 + su 只读档；客户裁定 2026-10-12「su 也要有 shell，但是只读」）**：
  `session.ts::open` 按 `role.builtIn`（数据驱动，不硬编码 "su"）分发——**项目角色**收
  `shellOperatorChannel`+`shellArming` 走 (c)/(b)/(a) 三层链（(a) = 应用内确认卡）；**内置治理角色（su）**
  收 `shellReadonly`（**复用同一份 (c) 实件** `deps.shellArming`——单一来源、与项目角色永不漂移）⇒ 编排
  `assembleReadonlyShellGate` 装配**只读档**：su 的 `run_shell` 只执行 (c) 只读白名单命令，
  `risky`/`review`/`deny` 一律拒；**不接 (b)/(a)**（不自审、不弹框、不打扰客户）。**给出即 arm**
  （su 会话恒 `suppressHandback === true`，只读档分支**不带**该前缀——旧注释联想会误导）；缺省/构造失败
  （`deps.shellArming` undefined）⇒ 不传 ⇒ 不 arm（能力缺席 = fail-closed，绝不放宽）。`main.ts` 每窗口在
  建 Interface 之前构造**同一份** `shellArming`（arm 开关 `DESKTOP_SHELL_GATE_ARMED`）经 Interface 透传；
  测试见 `operator-channel.test.ts`（含真实装配**接通核查**：ls 放行 / rm、node --test 拒）。
  详见 `docs/change/2026-10-12_change_su-readonly-shell-arming.md`。
- **右栏抽屉 + 右上角图标簇（客户裁定 2026-10-13：右栏不常驻、点了才展示）**：栅格两列、抽屉 `#right-drawer` 为
  覆盖层（不占列宽、聊天流不 reflow；CSS 120ms 过渡、无计时器）；`#right-tabs` 四枚图标（角色资料/待办/队列概览/
  Pi 设置）+ 数字角标（待办=视图行数、队列=排队深度——同 role-state 快照）；同图标再点/×/Esc 收起、至多开一块；
  内容跟随选中角色（角色资料四组与「待办 / 队列」组逐字保留；队列概览=仅排队位次）。Pi 面板整体迁入抽屉
  （保存/掩码纪律一字不动）；「结束会话」按钮删除（停止能力保留在程序化路径 `d.stopSession(null)`）；
  「聊天中/空闲」pill 删除（kind 程序化保留在 `#chat` 的 `data-state`）。
- **交互卡锚点物化（真机缺陷修复，2026-10-12「已确认的卡切走再切回跑到最下面」）**：卡的（重）物化按
  **时序锚点**落位，open 与 decided 一视同仁——① 主修复＝`materializeOperatorCard` 先按 `requestId` 查行表，
  卡行仍在（Q-2 窗口化下 keepEl 行**离屏脱挂≠丢失**，旧 `cardInPane` 判据误判）⇒ **复用、绝不重建落尾**
  （旧实现每次重建+追加行表尾，且旧行仍持旧元素=潜在双份）；② 防线＝同表首物化位（`entry.anchorIndex` +
  行表 `seq` 校验）或**回放锚点表**插入（回放行带请求标识：`session-history.ts` 把 request_confirmation /
  request_choice 的调用行与结论行带上同一 `requestId`＝pi toolCallId + `anchorKey`＝kind+title 单一算法键
  `request-anchor.ts`；`customer-input.ts` 载荷同法带 `anchorKey`——两侧逐字可对上；`registerRow` 新增
  `atIndex` 锚点插入 + index 右移重编号）；③ **兜底＝追加行表尾，绝不丢卡**（代码写明）。首次到达不加锚
  （卡=当下最新事件，行表尾即它发生的位置）。详见 `docs/fix/2026-10-12_fix_decided-card-reanchor.md`。
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
