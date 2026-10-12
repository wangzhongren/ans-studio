# 装配 变更记录

## 2026-10-12 — README 更新到当前状态（客户直接指示；逐条读实件核实）

重写 `README.md` 的过时面：**收口已废**（改确认制：su 写盘前经 `request_confirmation` 预览获客户同意，编排把已预览且校验在边界内的路径发行进本次会话 writeSet、F4 拒未确认路径；**客户确认不设超时**，等待期间该轮硬超时暂停；同意且写入后 **settle 自动收尾**写 `.ans`(pin)+治理边界文档+manifest）；**回交/派发/队列/重启恢复**（`submit_report` 自动投递 su 验收；su `dispatch_task` 落盘后自动开工、每角色一条队列、客户消息同样入队、右栏「待办/队列」+ 徽标待办数；D-1 `<项目>/.ans/sessions/<角色>/` 恢复历史与上下文，已 gitignore）；**shell 闸改写**（桌面已 arm 三层链 (c)→(b) su 审读→(a) 客户确认；不可解析 ⇒ 直接拒、不打扰客户；只对项目角色 arm；**已知风险：无 OS 沙箱**；**CLI 入口仍未 arm**——实读 `src/index.ts`）；**边界格式**（散文 ⇒ 响亮报错；改边界需重开会话，拒写提示带「旧边界快照」线索）；**桌面呈现**（胶囊输入框 + 图片采集 ≤5MB、**送模型未接**；虚拟渲染 >150 行；Markdown 化 = vendored markdown-it 15.0.2 + sha256 pin；七态徽标；取消 runtime 选择器即默认 pi——旧 README 的「顶栏 runtime 选择器」已删）；文档纪律（文档面随边界授予 + 代码与文档同批交回 + `temp/<角色>/` 暂存区）。「已知范围外」节按实件重写（图片送模型未接、多任务派发引擎仍二期、真机 shell 语义未验、真实 Pi 会话未复验、CLI 与桌面差异）。**只改 `README.md`**。验证：`test/装配/` **52/52**；全量 **859/856/2/1**（两红=既有环境红）；`npm run typecheck` **0 错**；Node v24.14.0 / HEAD d933537。来源：客户「修改 readme.md」直接指示。


## 2026-10-12 — 修复 `ans govern <目标目录>` 的「治理边界解析失败」（M1+M2+O1，客户批准）

客户报障：`ans govern /tmp/ans-pi-e2e`（空目录）→ `治理边界解析失败：读取边界文件失败：ENOENT …/角色卡/门禁引擎/boundary.yaml`，退出码 1。**根因（已核对到源码）**：T34 只把注入配置的 `projectRoot` 换成目标目录，而**无 `.ans` 时回退的内置演示配置**里的 `governanceBoundary.path`（`src/index.ts:120`）与六个角色的 `card`/`boundary` 全是**相对 ans-cli 自身**的项目相对路径——su 不在 `project.roles` ⇒ `resolveBoundarySection` 走「治理边界覆盖」分支，去**目标目录**下读该文件 ⇒ ENOENT ⇒ `govern-session.ts` 以 `parseError` 抛错。

- **M1（`src/index.ts`，`loadInjection`）**：目标目录 ≠ ans-cli 根（`path.resolve` 比较，新私有函数 `isSelfProjectRoot`）且 `configSource.kind === "builtin-fallback"` 时，改注入目标项目的**如实形态**——`roles = {}`、`governanceBoundary = { path: "", acceptance: DEMO_ACCEPTANCE }`（回到既有约定：空串不参与治理边界覆盖分支；finalize 落点由 `path || DEFAULT_GOVERNANCE_BOUNDARY_REL` 给出——与桌面「无 `.ans` 传空串」同款）。`ans govern`（无目录）与 `ans govern <ans-cli 根>` 行为逐字不变。
- **O1（客户批准）**：同一分支补 `genesisBootstrap`（source = `cli:ans govern <目录> = 操作者发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）`）——`ans govern <空目录>` 真能 bootstrap（与桌面「导入空文件夹」同一条有界创世授权；项目自己的治理边界文档一经写出并经 pin 接受即**结构性自终止**）。不加则命令「成功」但 su 一个字也写不了。
- **M2（`test/装配/govern-target.test.ts`，49 → 52 例）**：新增「注入合同」「自根不变」；原第 6 例拆为两条更严用例——`governCommand` + 假适配器驱动（`EXIT_OK`、边界解析不再失败、创世授权下骨架写入**真落盘**）与 `main` 入口（**先清空 Pi 相关环境变量**：非 0、不含边界/目录错、如实报缺 provider 配置）。**未放宽、未删除原断言**；注释里「非 0 因缺 Pi 凭据」的旧说法一并纠正（适配器**惰性构造**，真实原因就是边界 ENOENT）。
- **证据**：`test/装配/` **52/52**；全量 `node --test "test/**/*.test.ts"` **681 tests / 678 pass / 2 fail / 1 skipped**（两红与基线完全相同、均他角色环境红，无新增红）；`npm run typecheck` **0 错**。复现对照：修复前（`--env-file=.env`）ENOENT、退出码 1 → 修复后（无凭据环境）`缺少 base URL…`、退出码 1。真实模型端到端（有凭据）**未跑**，属「客户跑」。
- **未做**：未改 README（O1 已批准，原措辞准确，O3 未触发）；未动他角色文件；未读 `.env`；未发真实模型请求。修复记录：`角色卡/装配/docs/fix/2026-10-12_fix_govern-target-boundary.md`（status: verified，确定性范围）。
> **注（2026-10-12 同日更晚）：本 bullet 所述机制已被 A 组确认制替换删除，证据失效，保留为实录。**
- **同日后续轮（2026-10-12）**：编排在 `src/interface/cli/govern.ts` arm 创世收口（注入带 `genesisBootstrap` ⇒ `finalizeBootstrap: true`；新增可选 `GovernDeps.operatorChannel`）后，本角色 `test/装配/govern-target.test.ts` 的 `governCommand` 用例因缺省 CLI 终端通道读 stdin 而**挂起**（实测：45 s 看门狗杀死、退出码 142）。应对：给该例注入**放行桩** `operatorChannel` 并断言挂起**恰好一次**；原断言全部保留（加强，非放宽）。复跑：`test/装配/` **52/52**；全量 **687 tests / 684 pass / 2 fail / 1 skipped**（两红=既有环境红）**自然退出**；`npm run typecheck` **0 错**。

- **同日第三轮（2026-10-12）**：编排按客户批准的 A 组以**确认制**替换收口（删句柄 `settled`/`finalize`/`operatorChannel`；新增 `request_confirmation`/`request_choice`，确认后**发行 writeSet**、未确认路径被 F4 拒；settle 时**自动收尾**写 `.ans`+治理边界文档+manifest）。本角色 `test/装配/govern-target.test.ts` 第 7 例改为：脚本先 `request_confirmation`（预览列出将写路径）再写；deps 注入放行桩 `customerInput`（计次）；适配器工厂转发 `capabilities`；新增「确认恰好一次」「`.ans` 收尾产物存在」断言，原断言全部保留。证据：`test/装配/` **52/52**；全量 **715 tests / 700 pass / 14 fail / 1 skipped**（14 红=他人在途 12 + 既有环境红 2，本目录零红）**自然退出**；typecheck 我方零错。

## 2026-10-11 — 改准 README「两道门」用例数（621 → 677），并全核数字类陈述

上一轮同步 README「Pi 配置」节时，本角色**如实报出**一处不在当时范围内的过时：`README.md:71`
的「**621 用例、621 通过**」与实际不符。本任务处理它，并连同**同类过时数字 / 事实陈述**一并核。

- **实测（以实测为准，不照抄简报给的 677）**：`node --test "test/**/*.test.ts"`（**必须带引号**，
  走 Node 原生 glob、覆盖三层测试路径）→ **677 tests / 677 pass / 0 fail**。**连跑 3 次，三次皆
  677/677/0、稳定**——**未撞到**项目管理正在查的并发 flake（`test/项目管理/shared/atomic-write.test.ts`，
  仅全量并发下偶发挂），**观测到的波动 = 0**；未动该文件。
- **改动（唯一一处）**：`README.md:71` 注释 `全量测试：621 用例、621 通过` → **`677 用例、677 通过`**。
- **数字类全核（实读比对，逐条列结论）**：
  - `README:137` **全项目 7 个角色** —— 实测 `角色卡/` 下 **7** 个目录（项目管理/编排/门禁引擎/Pi适配器/
    桌面应用/测试/装配），与正文表 7 行**一致**。**准**，未动。
  - `README:35` **Node ≥ 23.6（本机 v24.11.1）** —— 实测 `node --version` = **v24.11.1**、`package.json`
    `engines.node` = **`>=23.6`**。**准**，未动。
  - `README:79` **3 项必填 + 1 项可选** —— 实读 `app/desktop/pi-config.ts`：`PI_PANEL_KEYS` = **4**、
    `PI_REQUIRED_KEYS` = **3**（可选者为 `ANS_PI_CONTEXT_WINDOW`）。**准**，未动。
  - `README:84-85` **默认 32768、reserveTokens 16384** —— 实读 `src/common/pi-adapter/provider-config.ts`：
    `DEFAULT_PI_CONTEXT_WINDOW = 32768`；`settings.ts` `reserveTokens = 16384`。**准**，未动。
  - `README:37` 依赖 `yaml` / `@earendil-works/pi-coding-agent`（桌面 devDependency `electron`）——
    实读 `package.json` dependencies/devDependencies。**准**，未动。
  - **未发现**其他过时数字或事实陈述（无「角色数 / 命令 / 路径 / 能力有无」类过时）。
- **未改**：`README` 除第 71 行外一字未动；未碰任何他角色文件；未读 `.env`、未发真实网络请求、未打印凭据值。
- **验证（两道门，改后复跑）**：`node --test "test/**/*.test.ts"` → **677 / 677 / 0**；
  `npm run typecheck` → **0 错**。来源：派发任务「处理上一轮报出的 README 过时用例数」。

## 2026-10-11 — 同步 README「Pi 配置」节 + `.env.example` 到桌面面板新语义（5→4：3 必填 + 1 可选）

客户问「这个 pi 为啥需要配置 5 个呢」→ 桌面应用据此改了「Pi 设置」面板（属**桌面角色**：`app/`、`test/桌面应用/`），
`README.md` 的「Pi 配置」节随之**过时**（仍把 `ANS_PI_PROVIDER` 列为面板键、把 `ANS_PI_CONTEXT_WINDOW` 写成
「必填、无默认值」）。本角色据**代码核实**同步 README 该节与对应的 `.env.example`（均在装配边界内）。
**不照抄简报——凡核实后不符者如实纠正。**

- **核实（实读，只读）**：
  - `app/desktop/pi-config.ts`：`PI_PANEL_KEYS` = **4 键**（`ANTHROPIC_AUTH_TOKEN` / `ANS_PI_BASE_URL` /
    `ANS_PI_MODEL` / `ANS_PI_CONTEXT_WINDOW`）；`PI_REQUIRED_KEYS` = **3 键**（token / base URL / model）。
    `ANS_PI_PROVIDER` **不在**面板键集合、保存时**不写**它。
  - `src/common/pi-adapter/provider-config.ts`：`DEFAULT_PI_CONTEXT_WINDOW = 32768`；`contextWindow` **可选**
    （优先级：显式 > 环境变量 > 保守默认），缺失**不硬失败**、回落 32768，`renderContextWindowNotice` 产出可见提示；
    非法值（0 / 负 / 非数）**仍明确失败**。`ANS_PI_PROVIDER` **仍被读取**（`resolvePiProviderConfig`，缺省 `ans-gateway`）。
- **README「Pi 配置」节改后要点**：**3 项必填 + 1 项可选（收在「高级」）**——必填 = `ANTHROPIC_AUTH_TOKEN`（掩码）/
  `ANS_PI_BASE_URL`（拒回落默认端点）/ `ANS_PI_MODEL`；可选 = `ANS_PI_CONTEXT_WINDOW`（**可留空**，留空 = 不下发该键、
  Pi适配器回落**保守默认 `32768`**，缺失不硬失败、只在日志与事件流提示，填了就覆盖）；**`ANS_PI_PROVIDER` 不进面板**
  （代码有默认 `ans-gateway`、是**内部标签**；底层仍支持该环境变量，`.env` 里已有那行原样保留）。附一句默认值理由
  （须**严格大于** `reserveTokens` 16384，否则压缩阈值 ≤ 0 而退化；宁可偏小不可偏大）。「从哪填」段补一句：
  `ANS_PI_CONTEXT_WINDOW` 收在可折叠「高级」、可留空。
- **`.env.example`（本角色边界）同步**：Pi provider 段标题由泛指的「无默认值；缺失即明确失败」收窄为**端点/模型**的性质；
  `ANS_PI_CONTEXT_WINDOW` 注释由「**必填，无默认值**」改为「**可选**：留空 = 保守默认 32768、缺失不硬失败」；
  `ANS_PI_PROVIDER` 注明是**内部标签、不在面板**、底层仍支持该环境变量。
- **别处描述 Pi 配置/面板的核对**：
  - `README.md` 第 56 行「**Pi 设置**：右上「Pi 设置」面板填 Pi 配置并保存到 `.env`」——**仍准确**，未动。
  - `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` 第 715 行**仍把 `ANS_PI_PROVIDER`
    列为面板键**——**非本角色边界（pm 属主），未动、如实回报**，需 pm 同步（桌面角色 changelog 亦有同条旁注）。
  - 本角色 `角色卡/装配/{memo,changelog}.md` 里的历史 Pi 记录属**既往事实**，不回改。
- **测试同步**：`test/装配/` **无**断言 README / `.env.example` 内容的用例（grep 确认：仅读边界 YAML 与自建临时文件），**无需同步**。
- **验证（两道门）**：`npm run typecheck` → **0 错**；`node --test "test/**/*.test.ts"`（**带引号**）→ **675 tests /
  673 pass / 2 fail**；**本角色 `test/装配/` 49 pass / 0 fail**。2 红在 `test/测试/t29-pi-config-roundtrip.test.ts:75`
  与 `test/测试/t29-write-discipline.test.ts:151`（**测试角色**：因桌面把 `ANS_PI_PROVIDER` 移出 `PI_PANEL_KEYS` 而失效的旧断言，
  已排该角色修复）——**落我边界之外、未动、如实回报**。**未读 `.env`、未发真实网络请求、未打印任何凭据值**。
  来源：客户提问 + 协调方定位。

## 2026-10-11 — T42：如实登记「V1 shell 闸未接线」（两个入口；只加说明与注释，零行为改动）

派发任务 T42。背景：shell 闸三层链——**(c) 确定性硬地板 → (b) pm 审读 → (a) 客户确认**——**已实现、已测试、
逻辑验过**，但**从任何入口都到不了**：桌面**刻意不 arm**（`DESKTOP_SHELL_GATE_ARMED === false`，不注入
`ShellGate`），**CLI 入口从未注入**。**客户裁定 V1 就这样——不 arm**（V1 无 OS 沙箱，`run_shell` 起的子进程
写入**不受 `resolveWrite` 约束**，arm 风险大）。风险是那段代码**看起来像在生效**（绿灯测试加深误解）。本任务
**不删代码**（该链为将来备），只让**文档与代码都读得出来「现在没接」**。

- **`src/index.ts`（唯一运行时说明落点）**：在 `buildRoleRunDeps` 的函数文档注释内新增一段**明注**（该函数正是
  构造 `createAdapter` 的接线点）：本 CLI 入口对**任一** runtime 都**不注入 `ShellGate`**——pi 分支调
  `createPiAdapterFactory(project)` **只传 project、略去第二参 `shellGate`**（其签名 `(project, shellGate?)`），
  demo 假替身本不涉 shell；据设计 §7.5.1「能力缺席 = 最强 fail-closed」，**未注入 `ShellGate` ⇒ Pi 适配器
  根本不注册 `run_shell`** ⇒ **本入口下模型没有 shell 能力**；三层链**已实现并已测试**但**从本入口到不了**、
  **运行时不影响任何行为**。措辞显式写明：**这是客户确认的 V1 范围**（非缺陷 / 欠账）、**将来要启用须新的
  裁定**（另行评审并在此显式接线）、**不会自行启用**——并明说「别把这段读成『已经在跑』」。**无任何行为改动**
  （不注入就是不注入；未动 `createPiAdapterFactory` 调用）。
- **`README.md`「已知范围外 / 未验证」**：原条目 **`- **桌面 shell 闸 V1 不 arm**` 改写为**涵盖**两个入口**的
  条目 **`- **shell 闸三层链已实现并测试，但 V1 两个入口均未接线**`**——如实写清：`run_shell` 仅在会话构造
  路径注入 `ShellGate` 时才注册；三层链**已实现并经测试**；但 V1 **两个入口都不注入**（**桌面刻意不 arm**，
  `DESKTOP_SHELL_GATE_ARMED === false`；**CLI 入口从未注入**，见 `src/index.ts` 的 `buildRoleRunDeps`）；
  因此**模型在任何入口都没有 shell 能力**、这条链**当前不影响任何运行时行为**；并注明**客户确认的 V1 范围**
  （V1 无 OS 沙箱、`run_shell` 子进程写入不受 `resolveWrite` 约束）、**将来启用需新裁定、不会自行生效**。
  **为何改写而非另加一条**：原条目已在本节、且近义，另加会造成近乎重复——改写为**入口中立**的一条更准更省。
- **README 别处「把 shell 闸说成生效」的核对与修正**：grep README 全部 `shell`/`闸` 命中（第 134/160/162/164 行）。
  第 134 行是 pm 角色路径里的**条件名** `shell-gate`（非「已启用」主张，**未动**）；第 **160 行**「多任务派发引擎」
  条目把 `shell 闸` 列为 V1 已达成的清单项（`V1 只到「… + shell 闸」`）——**这是唯一一处读起来像「V1 含 shell 闸」**，
  已**加限定**为「`shell 闸`（三层链已实现，但 V1 两个入口均未接线，见下）」。**未发现**其他把 shell 闸写成
  「生效 / 已启用」的措辞。
- **只读核实（未动他角色文件）**：`app/main.ts`（桌面侧 `DESKTOP_SHELL_GATE_ARMED === false` ⇒ 会话构造路径
  不注入 `ShellGate`，第 265–273 行的 arm 分支恒为死分支）；`app/desktop/operator-channel.ts`（客户确认的
  「不 arm」裁定原文与理由）；`src/pipeline/orchestration/run-role.ts`（只读：`createPiAdapterFactory(project, shellGate?)`
  具接缝，`selectAdapterFactory` 经 `deps.shellGate` 转发）；`src/provider/pi/tools.ts`（只读：`buildGovernedTools`
  **仅 `shellGate !== undefined`** 时 `push(makeRunShellTool(...))`——能力缺席即不注册的结构性保证）。
- **测试同步**：`test/装配/` **无**断言 README 内容或 `src/index.ts` 注释文本的用例（grep 确认：仅 `import`/调用
  `main()` 断言 stdout 行为，注释不进输出），**无需同步**。
- **验证（两道门）**：`npm run typecheck` → **0 错**（含 `src/index.ts`，注释段类型合法）。`node --test
  "test/**/*.test.ts"`（**必须带引号**，走 Node glob）→ **621 tests / 600 pass / 21 fail**——**本角色
  `test/装配/` 全绿（49 pass / 0 fail）**；**21 个失败全在他角色边界**：`test/门禁引擎/classify-shell.test.ts`
  （15，门禁引擎）+ `test/测试/t9-block3-pin-shell.test.ts`（6，测试）。失败形态为 `classifyShellDetailed`
  返回 `deny:rules-invalid`（规则集不可用），与「shell 规则集正在被门禁引擎角色并行改动」吻合——**落在我边界
  之外，未动、如实回报**（上一轮 README 更新时基线为 621/0，故此为**并行改动的中间态**，非本任务引入；
  本任务只加注释/文档，理论与实测均不触碰 classify-shell）。**未读 `.env`、未发真实网络请求、未打印任何凭据值**。
  来源：派发任务 T42 + 客户「V1 不 arm」裁定。

## 2026-10-11 — 更新 README 至当今状态（客户指出并放行）

客户指出「readme.MD 没有更新」，`README.md` 已严重过时。本任务逐条**按代码核实后重写** README，并补定位与新增章节。
不照抄旧 README（过时）、也不照抄简报（同样可能有错）——**凡核实后与简报不符，如实纠正并回报**。

- **重写依据（实读）**：`package.json` scripts、`src/index.ts`（命令面）、`src/interface/cli/{run,govern}.ts`、
  `app/{main.ts,desktop/*}`、七个角色 `boundary.yaml`、`src/pipeline/orchestration/govern-session.ts`、
  `src/common/编排/{finalize,shell-gate}.ts`、`src/common/门禁引擎/classify-shell.ts`、设计文档
  `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md`、以及既有 changelog。
- **新 README 结构**：①`ANS 是什么`（role-first/RFSG × Pi，三点逐字取自技能 README，`ANS` 是名字非缩写）
  ②`这是什么`（核心主张 + 分层：入口→Interface→Pipeline→Service→Provider）
  ③`快速开始`（桌面主推路径 / CLI / **两道门**）④`Pi 配置`（面板键、从哪填、CLI 怎么读）
  ⑤`角色链`（su 对话式 bootstrap、收口需确认、每轮 settle 自动重 pin、回交）
  ⑥`命令表`（删 `ans init`）⑦`目录与职责`（**全 7 角色** + `src/common/shared/` 共享组件）
  ⑧`安全与凭据` ⑨`已知范围外 / 未验证`。
- **删掉的不成立说法**：`ans govern`「最小占位链路」→ 已是**真治理会话**且**接受目标目录**；
  「真实 Pi 适配器**尚未真实跑通**」→ 改为如实（此前已跑通一次、此后改动多、**未再复验**，标「未验证」）；
  「不产生 `docs/scheduling/` 记录（F3 偏离）」→ 该偏离已被取代，删去该段与整节「契约 §7 演示输出」；
  「免 `npm install`」→ **不成立**（运行需 `yaml`，Pi 路径需 Pi SDK）；旧「桌面应用（Electron）」那节只讲
  怎么跑起来 → 改为讲**产品本身**（工作台：导入 / su 对话 / 收口确认 / Pi 设置 / 角色资料栏）。
- **核实后纠正旧 README 与简报**：①项目**全 7 个角色**（多「桌面应用」）——但 `src/index.ts` 的
  **内嵌演示配置确为 6 角色**（`DEMO_ROLES` 不含桌面应用，`test/装配/config.test.ts` 亦如此断言）；
  故旧 README 两处「六角色」描述的是**演示配置**、**并不算错**（简报称两处都应改 7，实为只有
  「项目角色数」那层需讲成 7）。②shell 闸三层链**已实现**，但**默认入口未 arm**：桌面 V1 刻意不注入
  `ShellGate`（`DESKTOP_SHELL_GATE_ARMED === false`），**CLI 入口当前亦未注入**——故写「未注入即
  `run_shell` 不注册」，**不夸大成「已 arm」**。
- **顺带修（本角色文件、纯文案）**：`src/index.ts` 的 `USAGE` 里 `ans govern [...]  治理 bootstrap 会话（占位链路）`
  与首行「（v1 原型）」仍陈旧——改为**真治理会话**、**接受目标目录**的描述。**无行为改动**（无测试断言该文案；
  `test/测试/real-entry.test.ts` 仅断言 govern 用法错误的**退出码**）。
- **验证（两道门）**：`node --test "test/**/*.test.ts"`（**必须带引号**）→ **621 tests / 621 pass / 0 fail**；
  `npm run typecheck` → **0 错**。`test/装配/` 内**无**断言 README 内容的用例（grep 确认），无需同步。
- **未读 `.env`、未发真实网络请求、未打印任何凭据值**。来源：客户「readme.MD 没有更新」+ 协调方补充定位（role-first × Pi）。

## 2026-10-11 — T34：`ans govern <目标目录>` 的 `projectRoot` 真正生效（缺目录即明确报错）

派发任务 T34（设计 §12.3/§12.7）。原 `ans govern` **不取目标目录**——只在装配注入的 project
（`resolveProjectRoot()` = ans-cli 自身）上工作，CLI 连「对某个空文件夹做 bootstrap」都办不到（§12.1-3）。
T32（编排）已解析位置参数并导出 §6 安全的出口 `resolveGovernTargetDir(argv, deps?)`（argv 位置参数优先于
`deps.targetDir`）。装配的作用是**据它把注入的 `project.projectRoot` 设为 `path.resolve(dir)`**。

- **接线（`src/index.ts` govern 分支）**：`const targetDir = mod.resolveGovernTargetDir(invocation.argv)`——
  经由**动态导入**的 `govern.ts` 出口取值，**不**导入编排私有的 `src/common/编排/args.ts`（入口本已动态导入
  `govern.ts`，故该出口用起来 §6 安全）。据此 `loadInjection(targetDir)` 注入；`governCommand` 照原样调用。
- **`projectRoot` 设置（`loadInjection(targetDir?)`）**：给出目录 → `projectRoot = path.resolve(targetDir)`
  （绝对化）；缺省 → `resolveProjectRoot()`（ans-cli 自身，行为不变）。显式目标目录**优先于** `.ans/project.json`
  自带的 `projectRoot`——用户 `ans govern <dir>` 意在为「那个」目录 bootstrap。为便于测试直接断言注入结果，
  `loadInjection` 由私有改为**导出**（main 的 govern 分支缺 Pi 凭据会先失败，测试无法走完整链路）。
- **回退根（`loadConfig(projectRoot)`）**：`projectRoot` 改为入参（缺省仍 `resolveProjectRoot()`）；无 `.ans`
  时的**内置回退**也把 `projectRoot` 覆为该生效根——否则 `ans govern <空目录>`（尚无 `.ans`）会回退到 ans-cli，
  写入落在工具自身而非目标目录（正是本任务要修的）。doctor / role run 不传参，行为逐字不变。
- **目录不存在/非目录——判断与选择（`validateGovernTargetDir`）**：**明确报错、返回退出码 2、不静默回退 ans-cli**。
  理由：①「空文件夹 → 与 su 对话 → su 建角色」这一客户场景里，目标目录**本就存在**（用户导入/新建的空目录），
  目录不存在**多半是笔误**；②静默回退会把「对空目录 bootstrap」变成「对工具自身（ans-cli 仓库）bootstrap」——
  这是最坏的一类静默降级（§12.1 的根因正是它）；③**不新建目录**——建目录本身亦是一次应受治理的写，且会让
  拼写错误的路径被静默创建。给出但**不是目录**（是文件）同样报错。退出码取 2（用法/入参错误），与既有
  「非法 `--runtime` → 2」同档。
- **顺带清注释（本角色文件）**：`src/common/装配/config-loader.ts` 顶部文档注释里的**导入点清单**仍列着
  **已删**的 `test/编排/bootstrap.test.ts`（T32 删）——移除之；并据现状把清单校正为**现存两处**
  （`src/index.ts`、`test/装配/config-loader.test.ts`；原列的 `test/编排/govern.test.ts`、
  `test/编排/govern-engine.test.ts` 已改从共享模块导入，不再是本转发路径的消费点）。
- **测试（`test/装配/govern-target.test.ts`，新增 8 例）**：①目标目录 → `projectRoot` 即该目录（绝对化）；
  ②相对路径 → 绝对化（相对 cwd）；③缺省 → 仍 ans-cli 自身；④目标目录含 `.ans/project.json` → 角色照常载入且
  `projectRoot` 仍取目标目录；⑤显式目录优先于 `.ans` 自带 `projectRoot`；⑥不存在的目录 → 码 2 且 stderr 明说
  「不会回退 ans-cli」；⑦非目录（文件）→ 码 2；⑧存在的目录 → 目录校验放行、缺 Pi 凭据时如实非 0。
  该测试的 `capture()` **只劫持 stderr**——`node:test` 报告器自己也写 `process.stdout`，替换它会令报告器丢行、
  表现为「测试数偏少」（已实证并规避）。
- **验证**：`node --test test/装配/*.test.ts` → **49 pass / 0 fail**；全量 `node --test "test/**/*.test.ts"`
  （带引号）→ **572 tests / 570 pass / 2 fail**（2 失败均在 `test/测试/t9-block1-bootstrap.test.ts`——测试角色
  边界、用已退役的 `bootstrap` 选项，属 **T35**，未改他角色文件）；`npm run typecheck` → **装配边界 0 错**
  （1 错在 `test/测试/t9-block1-bootstrap.test.ts:90`，他角色）。来源：设计 §12.3/§12.7 T34。

## 2026-10-11 — T24 消费共享模块：`runtime.ts`/`index.ts` 删本地副本，改从 `runtime-shared.ts` 导入

派发任务 T24（设计 §3.11-2/3/4）。pm（T23）已建 `src/common/shared/runtime-shared.ts`（**属主项目管理，只读**），
把 §6 逼出的三处镜像收成单一来源：`RuntimeKind`/`RUNTIME_KINDS`/`DEFAULT_RUNTIME`、`PI_CREDENTIAL_ENV_VARS`、
`resolveSkillRoot(env?)`。装配改为只读导入并**删本地副本**，行为逐字不变。

- **`src/common/装配/runtime.ts`**：删本地 `export type RuntimeKind = "demo" | "pi"`、`export const DEFAULT_RUNTIME`、
  `export const PI_CREDENTIAL_ENV_VARS`。改从 `../shared/runtime-shared.ts` 导入后**按原名再导出**
  （`export type { RuntimeKind }` / `export { DEFAULT_RUNTIME, PI_CREDENTIAL_ENV_VARS }`），使本模块公开面不变。
  `RUNTIME_VALUES`（非 pm 点名项，但同物）改为 `RUNTIME_KINDS` 的别名：`export const RUNTIME_VALUES: readonly RuntimeKind[] = RUNTIME_KINDS;`
  ——**不再自持第二份取值**。`extractRuntimeArg`/`resolveRuntime`/`hasPiCredential` 逻辑一字未动。
- **`src/index.ts`**：删本地 `resolveSkillRoot()`（连同只服务于它的 `import os from "node:os"`），改从
  `./common/shared/runtime-shared.ts` 导入并在原位置 `export { resolveSkillRoot }`（公开面不变）；`PI_CREDENTIAL_ENV_VARS`
  的导入由 `./common/装配/runtime.ts` 改指共享模块。两处调用点（`buildDemoProjectConfig`/`loadConfig`）仍写 `resolveSkillRoot()`，
  走 shared 默认参数读 `process.env`，语义不变。
- **为何用「再导出」而非彻底删除导出**：pm 的收敛窗口期一致性核对测试 `test/项目管理/shared/runtime-shared.test.ts`
  （**非本角色边界，未动**）**只读导入** `RUNTIME_VALUES`/`DEFAULT_RUNTIME`/`PI_CREDENTIAL_ENV_VARS` 自本模块以核对旧副本取值。
  再导出使其**照旧解析**，且因指向单一来源，取值天然不分叉。**未新增任何第三形状**。
- **行为逐字不变的确认**：①原 `test/装配/runtime.test.ts`、`test/装配/entry.test.ts`（经 `PI_CREDENTIAL_ENV_VARS` 清洗凭据）未改即通过；
  ②pm 的 `runtime-shared.test.ts` 6 例（含「shared 与装配旧副本一致」）全过——证明再导出取值等于 shared；
  ③全量测试通过数与基线一致（445）。
- **桌面侧镜像（只回报，未动）**：`app/desktop/project.ts:22` 仍有一份**逐字** `resolveSkillRoot(env = process.env)`
  本地实现（第 22–26 行），与 `runtime-shared.ts` 的第 45–49 行同源；另有 `app/desktop/session.ts:36` 的本地
  `RuntimeKind`。**归 T22（桌面应用）**，非本角色边界，不改。
- **验证**：`node --test test/装配/*.test.ts` → **41 pass / 0 fail**；全量 `node --test "test/**/*.test.ts"` →
  **445 pass / 0 fail**；`npm run typecheck` → **装配边界 0 错**（余错在 `src/common/pi-adapter/real-adapter.ts`、
  `test/桌面应用/*`、`test/编排/*`，均他角色，未动）。来源：设计 §3.11-2/3/4 与派发清单 T24。

## 2026-10-11 — 建立类型门禁：装 `typescript`、跑通 `typecheck`、清掉 `src/index.ts` 对已删 `init` 模块的引用

派发任务「把类型门禁真正建起来」。此前 `package.json` 早有 `"typecheck": "tsc --noEmit"`，但 `typescript`
**从未安装**——脚本是**空承诺**，从未生效（`node --test` 靠类型擦除，不看类型；T14 给 `ProjectListing`
加字段后桌面应用构造处未同步，无人报错）。

- **安装 `typescript`（诚实交代）**：本机 `registry.npmjs.org` **不可达**——`npm install` 报
  `ECONNRESET`；`curl` 直连亦 `failed to receive handshake`，`npmmirror` 报 `CRYPT_E_REVOCATION_OFFLINE`
  （证书吊销在线校验失败）。**关沙箱重试仍失败**，故为真实网络限制而非沙箱所致。改用可达的镜像
  `npm install -D typescript --registry https://registry.npmmirror.com` → 装得 **`typescript@7.0.2`**
  （即 npm `latest`，已核对 dist-tags `latest: '7.0.2'`）。`node_modules/.bin/tsc --version` → `Version 7.0.2`。
  **替代方案（若客户网络同样受限）**：在可联网机 `npm install -D typescript` 后提交 lockfile，或
  为该机配置可达的 npm 镜像。**未伪造“已装好”**。
- **`package-lock.json` 归一**：镜像安装把 **21 条** `resolved` 写成 `registry.npmmirror.com`
  （typescript 7 的 `@typescript/typescript-<platform>` 平台包 + `typescript` 本体），而 lockfile 其余
  **176 条仍为 `registry.npmjs.org`**——混注册表会使 `npm ci` 不可移植。已用脚本**逐条归一**回
  `registry.npmjs.org`（路径结构与 npmjs 一致，`integrity` 不变），JSON 校验通过。**边界说明**：
  `package-lock.json` **未列在** `角色卡/装配/boundary.yaml` Section 1，但它是 `package.json`（本角色，
  用途「依赖与脚本」）依赖管理的必然产物；已在报告中请 Governance 考虑显式纳入边界。
- **`tsconfig.json`（改动最小、不降档）**：核对现实——零构建、直接跑 `.ts`、Node 原生擦除、ESM。
  既有配置**已正确**：`allowImportingTsExtensions: true`（源码 import 带 `.ts` 后缀）、`noEmit: true`、
  `module`/`moduleResolution: nodenext`、`verbatimModuleSyntax`、`erasableSyntaxOnly`（与 Node 只擦除
  「可擦除语法」一致）、`isolatedModules`、`types: ["node"]`（`@types/node@26.6.5` 在位）。**唯一改动：
  `include` 由 `["src","test"]` 增为 `["src","test","app"]`**——此前 `app/` 仅经传递导入被检查，未导入
  的桌面应用文件会**漏检**；显式纳入后覆盖面与 T14 漏网那类错误对齐（实测加入后错误数**不变**，即
  `app/` 本已基本被覆盖，此举仅堵住未来的漏网）。**strict 档位：保持 `strict: true`，不降档**——实测
  全仓仅 **12 处**错误，不构成“海量噪声”，**没有理由关到底**；若强开 `noUncheckedIndexedAccess` 才会
  引入成片索引噪声，故**未加**。
- **`npm run typecheck` 结果：全部错误在他角色边界；装配边界 0 处**。首跑 **12 处**；会话期间（本仓多角色并行）**编排**自修了 `bootstrap.test.ts` 的 init 引用 → **末跑 11 处**。以下按角色归类（末跑快照）：
  - **桌面应用 1**：`app/desktop/session.ts:239` `TS2345` `OrchestrationEvent` 不能赋给 `SessionEvent`（`kind` 判别不兼容）。
  - **Pi适配器 1**：`src/common/pi-adapter/real-adapter.ts:234` `TS2353` 字面量含未知属性 `toolCallId`（目标类型 `{name,args}`）。
  - **测试 2**：`test/测试/f7-symlink.test.ts:58,64` `TS2345` `entries[].root: string` 不是 `Root`。
  - **编排 5→4**：`test/编排/bootstrap.test.ts:198` `TS2307` 找不到**已删**的 `src/interface/cli/init.ts`（**会话期间已由编排自行修复**）；`test/编排/shell-review-chain.test.ts:418,421,424` `TS18049` 值可能为 null/undefined（×3）、`:487` `TS2769` 重载不匹配。
  - **门禁引擎 3**：`test/门禁引擎/pin-acceptance.test.ts:129,145,154` `TS2345` `string|undefined` 不能赋给 `string`。
  - **装配 0**：本角色边界内**无错误**（下述 init 清理即修掉了 `src/index.ts:382` 唯一一处）。
- **清除对已删 `init` 模块的引用（协调方同批指令，编排 T16 已删 `src/interface/cli/init.ts`）**：
  - `src/common/装配/cli-parse.ts`：`Invocation` 联合**删除 `init` kind**、删 `"init"` 解析分支与文档行。
    结果 `ans init` 落到**既有**「未知命令」分支（`未知命令：init` → 退出码 **2**）。
  - `src/index.ts`：删 `case "init"` 分发块（含 `mod.initCommand` 强转与 `reportUnavailable("init")`）；
    help 文本删 `ans init [...] 初始化` 行；头部职责注释、`loadInjection`/`ConfigInjection` 注释同步为「仅 govern」。
  - `test/装配/cli-parse.test.ts`：把 `init → {kind:"init"}` 断言改为 `init → unknown`。
  - `README.md`（命令表 + 层间句柄句）与 `src/common/装配/config-loader.ts`（转发点清单，原列了已不存在
    的 `init.ts` / `test/编排/init.test.ts`）一并去 init。
  - **未动** `test/测试/real-entry.test.ts` 的 init 断言（属测试角色，已排 T18）。
- **测试**：`node --test test/装配/*.test.ts` — **41 pass / 0 fail**（较前 40 增 1，即新增的 `init→unknown` 用例）。
  全量 `node --test "test/**/*.test.ts"`：**本角色跑时为 446 总 / 445 pass / 1 fail**，**该失败** = `test/测试/real-entry.test.ts:97`
  「`ans init <临时目录>` 以 0 结束」正例——即删除 init 子命令的**预期后果**，**归测试角色 T18**（同文件 `:89`
  「无参 init 以 2 结束」因 unknown 恰好也是 2 而**仍通过**）。**会话末**测试角色已并行落地 T18（改写 init 断言）→
  全量转为 **445 总 / 445 pass / 0 fail**。未读 `.env`、未打印凭据。
- **两道门（本仓库）**：①**全量测试** `node --test "test/**/*.test.ts"`（**必须带引号**，走 Node 自身 glob，覆盖
  `test/项目管理/shared/` 等三层路径；`test/*/*.test.ts` 两层写法会漏）；②**`npm run typecheck`**。二者是
  装配每次交付的验证基线。
- **建议（未擅自改他角色文件；`package.json` 属本角色，此处**仅建议**不改）**：在 `package.json` 加组合脚本
  如 `"verify": "npm run typecheck && node --test \"test/**/*.test.ts\""`，或将其接入 CI/提交钩子，令两道门
  一键可跑。**现状**：`verify` 会因 ~11 处他角色类型错误（随他角色修复递减）与 1 处 T18 测试失败而**为红**——这正是门禁**在做本职**
  （在上述错误派发修复前不应变绿）。

## 2026-10-11 — T12：去掉 `config-loader` 的重复实现（旧路径改纯转发，采方案 (a)）

按设计 `2026-10-11_design_v1-full-implementation.md` §3.10 与派发清单 T12 行实现。
共享组件 `src/common/shared/config-loader.ts` 由 T11 从装配私有 `src/common/装配/config-loader.ts`
**整体搬迁**而来（搬迁非 fork）。工程法案 §一.5 与 `docs/architecture/shared-components.md` 要求消费方
**只读导入、不得留第二份实现**。本任务由装配收敛旧路径（pm 不能动装配边界）。

- **采用的方案：(a) 薄转发**。`src/common/装配/config-loader.ts` 改为一行
  `export * from "../shared/config-loader.ts";`（上方为说明性注释），**删除本地全部实现**
  （`loadEffectiveConfig` / `enforcePinBackedAcceptance` / `ansProjectPath` / 常量 / 类型 / 全部私有解析函数）。
- **不采 (b)（删文件 + 改导入）的理由**：方案 (b) 需改 4 处 import，其中 `src/interface/cli/init.ts`
  **不属于装配边界**、`test/编排/init.test.ts` **属编排边界**——选 (b) 须回报并请编排自查；而 (a) 只动
  **本角色边界内**的一个文件，四个消费点（`src/index.ts`、`src/interface/cli/init.ts`、
  `test/装配/config-loader.test.ts`、`test/编排/init.test.ts`）导入路径**照旧解析、零改动**。设计 §3.10 与 pm 的
  change 记录亦明列「re-export 薄转发」为许可选项。故 (a) 面上更小、兼容更好、免跨角色协调。
- **搬迁前逐字核实**：`diff` 比对两文件代码体（旧自第 20 行、新自第 30 行起）→ **逐字相同**，仅顶部 `//` 头注释不同。
- **行为不变（硬要求）**：转发使消费方解析到的正是共享文件——即搬迁前**同一份代码**。两条 fail-closed 原样保留：
  ①`.ans` 存在且 `accepted:true` 无 pin → 置未接受并清空 source；②`.ans` 存在但不可解析 → 未接受、**绝不**回退演示 acceptance。
  `test/装配/config-loader.test.ts`（经旧路径导入）**未改一行**仍全绿，即证转发解析正确、行为等价。
- **无第二份实现**：grep 确认 `loadEffectiveConfig`、`enforcePinBackedAcceptance`、`ansProjectPath` 及
  `parseAcceptance`/`parsePin`/`parseRoles`/`buildFromAns`/`invalidConfig`/`fallbackSource` **仅存于**共享文件。
- **测试**：`node --test test/装配/*.test.ts` — **40 pass / 0 fail**；
  全量 `node --test "test/**/*.test.ts"`（含三层路径如 `test/项目管理/shared/`）— **343 pass / 0 fail**（与基线一致）。
- **跨角色协调**：**无**（采 (a)，未触碰编排边界）。若日后要彻底删除旧路径（方案 b），须另请编排同步改 `test/编排/init.test.ts`。

## 2026-10-11 — T2：加载 `.ans/project.json` + 为 init/govern 补配置注入（含「无 pin 即未接受」fail-closed）

按设计 `2026-10-11_design_v1-full-implementation.md` §3.3/§3.8/§5.3/§2.5 与派发清单 T2 行实现。

- **`.ans` 加载落点**：新增 `src/common/装配/config-loader.ts`——`loadEffectiveConfig()` 读 `<projectRoot>/.ans/project.json`，
  取出 `roles`（仅保留 card/boundary 均为非空字符串的条目）、`governanceBoundary`、`pins`、`acceptance` 注入为
  `ProjectConfig`；`LoadConfigOptions.fallback` 为缺文件时的现行为兜底。形状：`governanceBoundary:{path,acceptance}`，
  `acceptance` 可内联 `pin`，也可顶层 `pins` 兜底（`PinEntry={path,sha256}`，与门禁引擎 T1 形状一致）。
- **「无 pin 即未接受」的强制点**：`config-loader.ts::enforcePinBackedAcceptance()`——`accepted===true` 且 `pin` 非非空数组 →
  置于 `{accepted:false, source:""}`（同时清空 source，与引擎 `unaccepted()` 一致），并在 `ConfigSource.downgradeReason` 留因。
  **凡经 `.ans` 载入的 acceptance 一律适用**，无自填例外标记——`parseAcceptance()` 在载入路径上无条件调用它。
  本层只判「**有没有 pin**」；「**pin 对不对**」（逐文件 SHA-256）仍是门禁引擎 `boundary-core.ts::verifyPins` 在其上加的一层。
- **两个登记的非-pin 例外（写死理由）**：(1) `src/index.ts::DEMO_ACCEPTANCE`——CLI 演示内嵌配置，**注释里写死**其为
  设计 §3.3 登记例外（原型演示替身、本进程内嵌纯值、不经 `.ans` 载入、故无也不该有客户 pin）；(2) 桌面应用导入的运行期同意
  （属 T10，非本角色）。二者外**没有第三档**。
- **缺 `.ans` 回退**：无 `.ans/project.json` → 回退 `buildDemoProjectConfig()`（现行为，**不放松**）；`.ans` 存在但不可解析
  → **fail-closed** 未接受（**不**回退演示 acceptance，避免「损坏的 .ans 换来一份已接受」）。全项目当前无 `.ans`，故既有测试照常。
- **配置注入通道**：`src/index.ts` 为 `govern` / `init` 以**超集第二参** `ConfigInjection{project, configSource}` 注入（`governCommand`/`initCommand`
  的契约 §5 冻结签名只收 argv，是 govern 占位码 2 的根因；按设计 §3.2 由装配补通道，编排侧 T4/T5 接收）。**编排接收前占位行为不变**——`ans govern` 仍码 2、`ans init` 仍码 0（`test/测试/real-entry.test.ts` 明列此二断言）。
- **doctor 打印 pin 来源**：新增行 `配置来源:`（`.ans` 路径 / 内置回退）、`acceptance: accepted=...`、`pin 来源:`（N 条 pin 及路径，或如实标注非-pin 例外 / 已降级）；保留既有 `边界接受来源:` 行与角色表。
- **测试**：新增 `test/装配/config-loader.test.ts`（10 例）：`.ans` 合法带 pin → 注入正确；`accepted:true` 无 pin → 置为未接受；
  pin 与 hash 不符 → 引擎判未接受（载入层保留 pin）；无 `.ans` → 回退不崩；`.ans` 不可解析 → fail-closed；doctor 打印来源与 pin。
- **验证**：`node --test test/装配/*.test.ts` — **40 pass / 0 fail**；全量 `node --test test/*/*.test.ts` — **271 pass / 0 fail**。
  手动 `doctor` 在临时 `.ans` 下打印「配置来源: .ans/project.json」「pin 来源: 1 条 pin」，核后已 `rm -rf .ans`（未留残留）。未读 `.env`、未打印凭据。
- **跨角色协调**：T4（编排）产出的 `.ans/project.json` **shape 须与本 T2 载入器一致**（`roles`/`governanceBoundary.path`/`acceptance.pin`，且按 §3.3 写 `accepted:true`+逐文件 `pin`）；`governCommand`/`initCommand` 须由 T5/T4 加收该第二参方能「不再码 2」。

## 2026-10-11 — 同步 .env.example 的 ANS_PI_CONTEXT_WINDOW 注释到 Pi 适配器新策略（必填 / fail-closed）

Pi适配器角色把 `ANS_PI_CONTEXT_WINDOW` 由「可选、缺失沿用模板值并告警」改为**必填、缺失即明确失败**
（与 `ANS_PI_BASE_URL`/`ANS_PI_MODEL` 同一 fail-closed 策略）。本角色据其实现
`src/common/pi-adapter/provider-config.ts` 的 `resolvePiProviderConfig`（**只读**）同步 `.env.example` 注释。

- **改后注释**（`` `` 省略反引号包裹）：
  「真实模型的上下文窗口（tokens）。**必填，无默认值**：缺失即明确失败（fail-closed），
  与 baseUrl/model 同一策略，绝不回落到模板值。模型克隆自 anthropic 模板，其 contextWindow
  为 1,000,000，与网关上的真实模型无关；沿用模板值会让 Pi 的自动上下文压缩阈值永远够不着，
  长会话会先收到服务端超长报错，而不是优雅压缩。请填写网关真实模型的上下文窗口。示例：131072」
- **依据**：`resolvePiProviderConfig` 在缺 `contextWindow` 时抛错（位置紧跟缺 `modelId` 之后、缺凭据之前），
  错误信息让用户设 `opts.contextWindow` / 环境变量 `ANS_PI_CONTEXT_WINDOW`，并说明模板值 1,000,000 与网关真实模型无关。
  删除了原文「不设则沿用模板的 1,000,000」的表述，改为与 baseUrl/model 同风格的 fail-closed。
- **透传**：无需改动 `bin/ans.js` / `src/index.ts`（沿 `node --env-file=.env` + `resolvePiProviderConfig(opts, process.env)` 的既有路径）。
- **测试**：`test/装配/` 下无断言 `.env.example` 内容的用例，**无需同步**（未改测试）。
- **验证**：`node --test test/装配/*.test.ts` — **34 pass / 0 fail**。未读 `.env`，未打印任何凭据。

## 2026-10-11 — .env.example 记录 ANS_PI_CONTEXT_WINDOW（顶层越界改动，经本角色复核采纳）

顶层会话越过角色边界，直接改了本角色所属的 `.env.example`（「Pi provider」段新增 `ANS_PI_CONTEXT_WINDOW`）。
按客户决定「代码保留、由负责角色复核并补记录」，本角色独立复核后采纳，并补此记录。

- **要点**：`.env.example` 新增 `ANS_PI_CONTEXT_WINDOW=`（真实模型的上下文窗口，tokens；注释示例 131072），
  与 `src/common/pi-adapter/provider-config.ts` 读取的环境变量名 `ANS_PI_CONTEXT_WINDOW` **拼写一致**。
  行为与 `parseContextWindow` 一致：未设（或空白）→ 返回 undefined → real-adapter 沿用 anthropic 模板的
  1,000,000 并告警；非法值（非正数/非有限）→ 明确抛错、fail-closed。
- **透传**：**无需改动** `bin/ans.js` / `src/index.ts`。`src/provider/pi/session.ts` 以
  `resolvePiProviderConfig(opts, process.env)` 直读 `process.env`，配合 `node --env-file=.env` 自然生效
  （与 `ANS_PI_BASE_URL`/`ANS_PI_MODEL`/`ANS_PI_PROVIDER` 同一路径）。
- **安全**：`.gitignore` 第 2 行确为 `.env`——凭据只落 `.env`、不入库；`.env.example` 仅含占位符，可入库。
- **验证**：`node --test test/装配/*.test.ts` — 34 pass / 0 fail。
