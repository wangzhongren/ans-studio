# ANS —— 受治理会话链路（v1：CLI + 桌面应用）

一个**基于 role-first（RFSG）结合 Pi agent** 的 **agent 系统**：
**role-first（RFSG）管「谁负责、允许改什么」，Pi 管「执行」，两者结合 = 一个受治理的 agent 系统。**
它把「角色 + 边界」变成一次可审计、fail-closed 的会话：写入**在发生之前**被拦截，
边界（角色的 Section 1 写入白名单）是**唯一的写授权来源**。

## ANS 是什么

- **ANS 是一套受 [Role-First Software Governance（RFSG）](https://zenodo.org/records/22824700) 论文启发的
  AI 开发技能**（技能仓库名就叫 **ANS Skill**——它是个名字，**不是缩写**）。本仓库是把它落成一个
  **可运行的工具**：CLI（`ans`）与 Electron 桌面应用——**执行层用 Pi**。
- **它从 RFSG 吸收的三点**（技能 README 原文）：
  1. **先确定责任，再确定代码归属。** 先问谁对这项业务行为负责，再明确它需要哪些模块和文件。
  2. **按需广泛阅读，在授权范围内修改。** 排查时可以在实际读取权限内跨模块了解情况，当前上下文只加载任务需要的内容。
  3. **发现问题后，交给负责的角色处理。** 理解另一个模块的问题，不会自动获得修改它的权限。
- **在本项目里，这三点落成了**：**角色卡**（谁负责）+ **`boundary.yaml` 的 Section 1**（允许改什么）
  + **门禁**（在写之前拒绝越界）+ **跨角色协作规则**。论文出处：Wang, Zhongren. 2026.
  *Role-First Software Governance: Asymmetric Authority Boundaries for AI-Native Agent Systems*（DOI 10.5281/zenodo.22824700）。

## 这是什么

- **核心主张**：每个角色只能写它 Section 1（`角色卡/<角色>/boundary.yaml`）里列出的路径。
  完全越界的写、以及「边界内但不在本次任务 writeSet 内」的写，都在**写入之前被拒**，
  拒绝信息按根（`skill:` / `project:`）分组列出允许路径。凡不能确证的，一律 **fail-closed**：拒绝，而不是放行。
- **分层**（相邻层单向调用）：
  **入口（装配）→ Interface → Pipeline → Service → Provider**；`Model` 为各层共享的冻结类型。
  入口只持有 Interface 层句柄（`runRoleCommand` / `governCommand`），不导入 Service/Provider 对象、
  不建「导入全部层」的中央工厂；下游模块按需**动态导入**。
- **两个前端，一个引擎**：CLI（`ans`）与桌面应用共用同一套 Pipeline / Service / Provider；
  治理会话引擎（`openGovernanceSession`）对二者是**同一个**（杜绝两份实现）。

## 快速开始

运行环境：**Node ≥ 23.6**（本机验证 **v24.11.1**）。CLI **免构建**——`bin/ans.js` 直接
`import('../src/index.ts')`，由 Node 原生 TypeScript 类型擦除运行。**依赖仍需安装**：
`npm install`（依赖 `yaml`、`@earendil-works/pi-coding-agent`；桌面另需 devDependency `electron`）。

### 桌面应用（主推路径）

```bash
npm install
npm run app        # 等价于 electron app/main.ts
```

桌面应用是一个**治理会话工作台**：

1. **导入项目**（系统文件夹选择器）。导入即授权；对已有角色的项目，点左侧任意角色即开启会话（**无确认弹窗**），
   聊天多轮续接。写入由门禁引擎静默约束，**越界写入在聊天流里内联提示**（不弹窗）。
2. **空文件夹 = 与 su 对话**：导入一个（尚无 `角色卡/` 的）空目录时，左树显示内置治理角色 **su**，
   并给出「项目尚未 bootstrap」提示。你与 su 对话，su 据对话**决定并建出角色**（有界创世，见「角色链」）；
   su 每轮结束，左树自动刷新、长出新建的角色。
3. **su 提议收口 → 你确认 → 项目转正**：su 觉得差不多了会**主动提议收口**，界面把这件提议作为一张
   **聊天流里的确认卡**摆给你（`[确认完成]` / `[暂不]`）。确认后写入 `.ans/project.json`（SHA-256 pin）
   与项目治理边界文档，项目由「创世态」进入「正式态」。**fail-closed**：拒绝 / 超时 / 通道不可用 → **不完成**。
4. **Pi 设置**：右上「Pi 设置」面板填 Pi 配置并**保存到 `.env`**（见「Pi 配置」）。
5. 右侧栏展示当前角色的**角色卡 / 边界条目 / 变更记录 / 文档索引**；顶栏有 runtime 选择器（demo / pi）。

### CLI

```bash
node bin/ans.js doctor                              # 装配自检（无需其余角色落盘）
node bin/ans.js role run 编排 --task T-1            # 受治理角色会话（默认 demo 假 runtime）
node bin/ans.js govern <空目录>                      # 真治理会话：对目标目录发起 bootstrap
node bin/ans.js --help
```

### 两道门（交付前必过）

```bash
node --test "test/**/*.test.ts"   # 全量测试：677 用例、677 通过（引号必须带——走 Node 原生 glob，覆盖三层测试路径）
npm run typecheck                 # tsc --noEmit，零类型错误
```

> `test/*/*.test.ts` 这类**两层**写法会漏掉 `test/项目管理/shared/` 等**三层**路径，必须带引号走 Node glob。

## Pi 配置

**需要哪几项**（桌面面板键 == `.env` 键名；**3 项必填 + 1 项可选，收在「高级」里**）：

- **必填**——凭据（机密）：`ANTHROPIC_AUTH_TOKEN`（掩码）；
  非机密：`ANS_PI_BASE_URL`（**拒绝回落任何默认端点**，故必须显式给）、`ANS_PI_MODEL`。
- **可选、可留空**：`ANS_PI_CONTEXT_WINDOW`——**可选 + 保守默认**：留空 = 不下发该键，Pi适配器回落到
  默认 **`32768`**（缺失**不硬失败**，只在日志与事件流给一条可见提示）；知道确切值可用它覆盖。取 32768 是
  因为它须**严格大于** Pi 压缩的 `reserveTokens`（16384），否则压缩阈值 ≤ 0、几乎每轮都触发而退化；且宁可
  偏小（压缩提前，良性）不可偏大（窗口设大使长会话炸掉）。
- **`ANS_PI_PROVIDER` 不在面板里**：它在代码里**有默认值**（`ans-gateway`）、是**内部标签**，不是用户该做的
  决定；底层**仍支持该环境变量**（`resolvePiProviderConfig` 照读），只是不再占一个输入框——保存面板时也不写它
  （`.env` 里已有的那行原样保留）。

**从哪填**：

- **桌面**：右上「Pi 设置」面板 → **保存到仓库根 `.env`**。只改面板键、**保留注释与未知键**、原子写；
  token 字段掩码且**绝不回显**（只示「已设置 / 未设置」）；`ANS_PI_CONTEXT_WINDOW` 收在可折叠的「高级」里、
  **可留空**（留空 = 用保守默认）；保存后即时重载，**下一会话生效**。
- 桌面**启动时**会把仓库根 `.env` 载入 `process.env`（补上 Electron 进程缺失的 `--env-file`），
  之后 `resolvePiProviderConfig(opts, process.env)` 原样复用（单一来源，无第二份读取逻辑）。

**CLI 怎么读**（同一个 `.env` 文件）：

```bash
node --env-file=.env bin/ans.js role run 编排 --task T-1 --runtime pi
```

`.env` 已被 `.gitignore` 忽略；仓库只提供占位符 `.env.example`。凭据纪律见「安全与凭据」。

## 角色链

- **客户 ↔ su**：`su` 是内置治理角色（id 由门禁引擎枚举给出，**代码不硬编码**）。桌面里 su 是主入口
  （置顶、默认选中）；其他角色保留可聊，定位为次级（查看 / 调试）。
- **su 主导的 bootstrap（有界创世）**：**导入空文件夹 → 与 su 对话 → su 建角色 → su 提议收口 →
  客户确认 → 项目转正**。空项目上 su 的写权限来自「项目根治理种子边界」，**只**允许 `角色卡/`、`docs/`、`.ans/`——
  写 `src/` 或项目根之外一律被拒。这是一次性、有界、条件化的创世授权，**不是** blanket；su 一旦写出项目
  自己的治理边界文档并经确认，创世授权**结构性自终止**，此后 su 改由该文档治理。
- **收口需客户确认**：su 主动提议「可以收口了」→ 界面摆给客户 → **客户确认才落盘**（写入照样先经门禁判定）。
  确认不可用 / 超时 / 拒绝 → 不完成。收口**不影响 su 后续工作**——此后 su **仍可增删改**角色；
  **每轮 su 会话结束（settle）后，pin 自动重算刷新**，所以「加一个角色」不会让 pin 过时。
- **回交（handback）**：角色会话完成一个任务时产出结构化回交（`TaskHandback`：角色 / 任务 / 状态 / 摘要 / 证据），
  交回 su 汇总。V1 只做**事件 + 界面呈现**；自动多角色派发-回收属二期。
- **`ans init` 已废除**：建项目只保留 su 对话这一条路（CLI `ans govern` 与桌面 su 是**同一个治理会话引擎**的两个前端）。

## 命令表

| 命令 | 说明 |
| --- | --- |
| `ans role run <角色> --task <任务> [--runtime demo\|pi]` | 运行一个受治理角色会话。默认 `demo`（装配自有的演示假 runtime，脚本化发起写入并经门禁判定）；`--runtime pi` 用真实 Pi 适配器（需 Pi 凭据，缺凭据时非 0 退出、**不静默降级**）。 |
| `ans govern [<目录>] [--task <任务>] [--role <角色id>]…` | **真治理会话**（CLI 前端，与桌面 su 同一引擎）。**接受目标目录**——对 `<目录>` 发起 bootstrap，缺省 = ans-cli 自身；目标目录不存在 / 非目录 → 码 2、明确报错（**不新建、不回退** ans-cli）。 |
| `ans doctor` | 装配自检：打印运行时及其来源、`projectRoot` / `skillRoot`、配置来源（`.ans` 或内置回退）、pin 来源、内嵌演示角色表。 |
| `ans help` | 用法（含当前运行时）。 |

`ans init` **不存在**（客户决定废除；现落到「未知命令」分支，退出码 2）。

运行时选择优先级：命令行 `--runtime` > 环境变量 `ANS_RUNTIME` > 默认 `demo`。

## 目录与职责

全项目共 **7 个角色**。每个角色只写自己 Section 1（`角色卡/<角色>/boundary.yaml`）内列出的路径。

| 角色 | 主要路径 |
| --- | --- |
| **项目管理（pm）** | `src/common/shared/`（**跨角色共享组件，唯一属主**）、`test/项目管理/shared/`、`docs/scheduling/`、`docs/audit/`（条件 `shell-gate`）、`角色卡/项目管理/docs/**`（整体架构、全项目工程法案、设计 / 变更 / 修复记录） |
| **编排** | `src/interface/cli/run.ts`、`src/interface/cli/govern.ts`、`src/pipeline/orchestration/**`（含 `govern-session.ts` 唯一治理会话引擎、`pm-reviewer.ts`）、`src/common/编排/**`、`test/编排/**` |
| **门禁引擎** | `src/model/**`（跨层共享类型）、`src/service/**`（`resolve-role` / `resolve-boundary` / `resolve-write`）、`src/common/门禁引擎/**`、`test/门禁引擎/**` |
| **Pi适配器** | `src/provider/pi/session.ts`、`src/provider/pi/tools.ts`、`src/common/pi-adapter/**`、`test/pi-adapter/**` |
| **桌面应用** | `app/**`（Electron 主进程、preload 桥、渲染进程）、`test/桌面应用/**` |
| **测试** | `test/测试/**`（跨角色联调、完整流程与回归用例） |
| **装配** | `src/index.ts`、`bin/ans.js`、`package.json`、`tsconfig.json`、`README.md`、`.env` / `.env.example` / `.gitignore`、`src/common/装配/**`、`test/装配/**`、`.ans/`（条件 `project-init`） |

- **共享组件 `src/common/shared/`**：跨角色共享的**单一来源**——`.ans` 载入器（`config-loader.ts`）、
  `.env` 读写（`env-file.ts`）、以及路径 / argv / runtime 原语（`path-primitives.ts`、`argv-primitives.ts`、
  `runtime-shared.ts`）。**属主 pm**；消费方（**装配、桌面应用**）**只读导入、不得留第二份实现**，
  登记在 `角色卡/项目管理/docs/architecture/shared-components.md`。
- 层间调用方向：**入口（装配）→ Interface → Pipeline → Service → Provider**（`Model` 各层共享）；**仅相邻层可调用**。

## 安全与凭据

- 凭据**只**放 `.env`（已被 `.gitignore` 忽略），**绝不**写进任何入库文件；`.env.example` 只含占位符、可入库。
- 凭据**绝不回显**：桌面 Pi 面板对机密键恒返回空串，只给「已设置 / 未设置」；保存回报只含**键名**；
  日志 / 错误信息只记键名、不记值。
- `.env` 读写的**唯一实现**在共享模块：逐行解析、只替换命中键、保留注释与未知键、原子写（同目录临时文件 + rename）、失败显式报错。
- 写入落盘在门禁之上还有一道 `writeRoot = projectRoot` 的硬收窄：门禁即便放行某条 **skill 根**的写，写层仍会拒绝
  （只可能更严，不会让边界之外的写通过——有意的纵深防御）。

## 已知范围外 / 未验证

- **多任务派发引擎**（pm 产出派发计划 → 编排按拓扑序逐条开会话）：**二期，不在 V1**。
  V1 只到「单角色受治理会话真落盘 + bootstrap / 创建权 + `.ans` pin + shell 闸（三层链已实现，但 V1 两个入口均未接线，见下）」；「调度权归 pm」
  在 V1 只落到**纸面归属 + 使用约定**，不实现、不演示多任务派发。
- **shell 闸三层链已实现并测试，但 V1 两个入口均未接线**：`run_shell` **仅在会话构造路径注入 `ShellGate`
  时才注册**（能力缺席 = 最强的 fail-closed）。三层链——**(c) 确定性硬地板 → (b) pm 模型审读 → (a) 操作者确认**
  ——**已实现并经测试**，但 V1 **两个入口都不注入** `ShellGate`：**桌面刻意不 arm**
  （`DESKTOP_SHELL_GATE_ARMED === false`，理由见 `app/desktop/operator-channel.ts`），**CLI 入口从未注入**
  （`src/index.ts` 的 `buildRoleRunDeps` 对任一 runtime 都不注入）。因此**模型在任何入口都没有 shell 能力**，
  这条链**当前不影响任何运行时行为**。这是**客户确认的 V1 范围**（V1 无 OS 沙箱，`run_shell` 起的子进程写入
  **不受 `resolveWrite` 约束**，arm 风险大）——不是缺陷、不是欠账；将来启用需**新的裁定**，**不会自行生效**。
- **真实模型轮次本机不可自动验收**：su「据对话决定并建出角色」、su 是否 / 如何提议收口等
  **模型行为**，须**客户本人**用真实凭据 + 已配 provider 运行；自动化测试覆盖的是**确定性部分**
  （门禁判定、fail-closed 各退路、pin 刷新等）。
- **真实 Pi 适配器路径**：已落地。据项目记录，**真实 Pi 会话此前已跑通一次**，但此后改动很多、
  **未再复验**——当前端到端状态**未验证**，不夸大也不沿用旧的「尚未跑通」说法。
