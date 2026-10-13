---
id: su-readonly-shell-arming
type: change
title: su 只读 shell——桌面侧接线（同一份 (c) 实件经 shellReadonly 直连只读档；su 不接 (b)/(a)）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [shell-arm]
events:
  - date: "2026-10-12"
    kind: designed
    summary: 客户裁定「su 也要有 shell，但是只读」；编排侧已落地（run-role 的 shellReadonly 入参 + shell-arming 的 assembleReadonlyShellGate），本页为派发给桌面角色的后半——SessionManager 对内置治理角色注入只读档
  - date: "2026-10-12"
    kind: implemented
    summary: session.ts 对 role.builtIn 复用同一份 deps.shellArming 经 shellReadonly 下发（缺省不传 = su 不 arm）；interface.ts 透传面镜像同一形状（Omit<AssembleReadonlyShellGateOptions,"project">，只读导入自编排）；operator-channel/main 注释按新语义更新（su 不接 (b)/(a)）；main/interface 构造链零新增（同一对象复用）
  - date: "2026-10-12"
    kind: verified
    summary: test/桌面应用 159 计/158 过/1 红（唯一红=既有环境红 pi-config 检出目录名）；全量 903/900/2 红（两红均既有环境红）；typecheck 0 错
---

# su 只读 shell——桌面侧接线（客户裁定 2026-10-12）

**来源**：客户裁定「**su 也要有 shell，但是只读**」。编排侧已落地（设计/装配/arm 判据/测试见
`角色卡/编排/docs/change/2026-10-12_change_su-readonly-shell.md`）：`openRoleSession` 增入参
`shellReadonly?: Omit<AssembleReadonlyShellGateOptions, "project">`——给出即经 `assembleReadonlyShellGate`
装配**只读档** `ShellGate` 并注入能力面（`run_shell` 注册）；**只接 (c)**（命中只读白名单放行；
`risky`/`review`/`deny` 一律拒），**不接 (b)/(a)**（su 自己就是审读者、不自审；只读外的命令直接拒、
不打扰客户、**不弹任何对话框**——选项面没有这两件即是结构保证）。本页是派发给**桌面角色**的**后半**：
桌面会话构造路径把 (c) 实件按角色种类分发给两档闸。

## 以前怎样 / 现在怎样

- **以前**：`session.ts` 对内置治理角色（su，判据 `role.builtIn === true`）**一律不注入**任何 shell 件
  （`shellOperatorChannel` 与 `shellArming` 都为 `undefined`）——su 的会话**没有 `run_shell`**
  （真机里连 `ls`/`cat` 都跑不了，诊断只能靠猜读）；
- **现在**：su 的会话经**新字段 `shellReadonly`** 拿到**(c) 规则集实件**（**复用同一份
  `this.deps.shellArming`**——即 `buildDesktopShellArming()` 产出的 `{classifyShell, rules}`；
  **单一来源、与项目角色永不漂移**）⇒ 编排装配只读档 ⇒ su 的 `run_shell`**注册**、但**只执行 (c)
  只读白名单命令**；缺省/构造失败 ⇒ **不传** ⇒ su 不 arm（能力缺席 = fail-closed，绝不放宽）。
- **项目角色逐字不变**：仍收 `shellOperatorChannel` + `shellArming` 走 (c)/(b)/(a) 三层链；**不带**
  `shellReadonly`。

## 改在哪（文件 → 改动）

- **`app/desktop/session.ts`**（分发点与透传）：
  - 新增判据 `const shellReadonly = role.builtIn === true ? this.deps.shellArming : undefined;`
    ——**原引用复用**（非拷贝、非重组装件）；`...(shellReadonly ? { shellReadonly } : {})` 透传进
    `openRoleSession`。`shellOperatorChannel`/`shellArming` 两行**逐字未动**（仍只给项目角色；
    su **不接 (b)/(a)**——「审读者不给自己开闸」保留其义）。
  - `SessionManagerDeps.openRoleSession` 入参类型增 `shellReadonly?`（形状**只读导入自编排**
    `AssembleReadonlyShellGateOptions`，`Omit` 掉 `project`——**不另立第二形状**）。
  - **arm 判据（写死，防误导）**：只读档是「**给出即 arm**」——编排的只读档分支（`run-role.ts` 的
    `if (input.shellReadonly !== undefined)`）**不带 `!suppressHandback` 前缀**；而 su 的会话**恒**
    `suppressHandback === true`（`run-role.ts:310` 的 `kind === "built-in-governance"` 判据）。带上该前缀
    的话 su 永远 arm 不上——注释已按此写明。
- **`app/desktop/interface.ts`**（透传面）：
  - `DesktopDeps.openRoleSessionFn` 入参镜像增 `shellReadonly?: Omit<AssembleReadonlyShellGateOptions,
    "project">`（同法只读导入自编排）；`shellOperatorChannel`/`shellArming` 字段说明按新语义更新
    （「su 不接 (b)/(a)」；「应用内确认卡」措辞与 M-1 实件对齐）。
- **`app/desktop/operator-channel.ts`** / **`app/main.ts`**（注释与 arm 文档，**代码零改**）：
  `DESKTOP_SHELL_GATE_ARMED` 的接线口径补一行「项目角色走三层链；su 用**同一份 (c) 实件**经
  `shellReadonly` 直连只读档；缺件时两边都不 arm」；main 的三处注释同步。
- **构造链核对（任务点名项）**：`main.ts::registerIpc` 的
  `shellArming = DESKTOP_SHELL_GATE_ARMED ? buildDesktopShellArming() : undefined`（每窗口、建
  `createDesktopInterface` **之前**构造）→ `createDesktopInterface({ shellArming })` →
  `SessionManager` 的 `deps.shellArming`——链上**无需新增**：su 只读档**复用同一对象**（引用同一性有测试钉）。
  **未发现 arm 开关对 su 不生效的时机问题**（构造在开会话之前，且与项目角色同一对象）。

## 不改什么（范围）

- **`src/**` 一行未改**（编排侧改动为同仓未提交工作区，本角色只读核实）；**CLI 未动**；**渲染进程未动**
  （su 的只读档**不弹框**——既有应用内确认卡只服务项目角色的 (a) 层；su 侧没有新界面面）。
- **`shellOperatorChannel`/`shellArming` 的现状逐字不变**（仍只给项目角色）；`DESKTOP_SHELL_GATE_ARMED`
  的值与语义未动（I-1 已 arm——本轮只是让 su 在「已 arm」的伞下拿到**更严**的只读档）。
- **不新增 deps 字段**：只读档的实件来源就是 `deps.shellArming`（「同一份」是任务口径，也避免两处漂移）。

## 如何确认（实际证据）

- **`test/桌面应用/operator-channel.test.ts` 25/25**（+2 新用例；3 处既有用例按新语义扩断言，不为变绿放宽）：
  ① **注入判据**：su 会话收到 `shellReadonly` 且**恰为同一份 (c) 实件**（`=== armingStub` 引用同一性，
  内含 `classifyShell`/`rules` 两件），且**不含** `shellOperatorChannel`/`shellArming`；项目角色照旧收到
  `shellOperatorChannel`+`shellArming` 且**不含** `shellReadonly`；
  ② **fail-closed**：`deps.shellArming` 缺省 ⇒ 项目角色三字段全不出现（既有例扩断言）+ **su 专门例**
  （连 `shellReadonly` 都不注入——不降级、不半装）；源码钉：`role.builtIn === true ? this.deps.shellArming
  : undefined` / `...(shellReadonly ? { shellReadonly } : {})` / 只读档形状只读导入自编排 /
  run-role 的 `if (input.shellReadonly !== undefined)`（「给出即 arm」）；
  ③ **真正接通核查（端到端）**：临时项目 + **真实** `openRoleSession` + **真实** `buildDesktopShellArming()`
  ⇒ su 会话能力面 `capabilities.shellGate` 产出，且判定就是只读档——`ls -la` **放行**；`rm -rf` **拒**
  （理由含「su 只读档」）；`node --test` **拒**（review，不在白名单——现状）。全程不触网、不真跑命令；
  项目落系统临时目录，审计若落盘只在临时目录（**绝不碰仓库**）。
- `node --test "test/桌面应用/**/*.test.ts"`（引号带）：**159 计 / 158 过 / 1 红**——唯一红为**既有环境红**
  （`pi-config.test.ts` 检出目录名断言：本机检出目录是 `ans-runtime` 而非 `ans-cli`；与本次改动无关）。
- 全量 `node --test "test/**/*.test.ts"`：**903 计 / 900 过 / 2 红**——两红均**既有环境红**
  （上一处 + `test/项目管理/shared/path-primitives.test.ts` 的 macOS /var 符号链接）。
- `npm run typecheck`：**全仓零错**。
