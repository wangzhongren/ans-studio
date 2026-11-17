# 路径 B 持久化工作流原型团队计划

日期 2026-11-17。工作类型为新建，验证风险为 T3。唯一候选分支 `feat/dapr-path-b-workflow` 位于 `C:/Users/51054/Desktop/work/gptwork2/ans-studio-durable`。冻结对照为 `ffe75ce623a659320e9caf1079ef7e9d81330b02`。

## 任务授权与起步条件

- 意图为 G0 v1.2。沟通在 [意图与后续实施授权](../communication/2026-11-17_intent_path-b-durable-workflow.md) 记录客户原话「你在分支里面，完全自主开发，开发测试完成了，通知我。」该授权覆盖独立分支内方案细化、分工、以下临时写集、实现和测试，沟通据此处理本轮方案及分工。客户逐项确认的状态以该记录为准。产品合并与发布、线上仓库、现用项目和 RR34 原目录在本轮范围之外。
- 计划按 [策划 v1.1](../planning/2026-11-17_design_path-b-dapr-workflow.md) 排程，文件 SHA-256 为 `1b782ba822b8c2feb54b0b45e3abd7d79e114f8c9c411966259495beb994b174`。[独立复核](../planning/2026-11-17_review_path-b-dapr-workflow.md) 再复核已关闭 F1–F7，沟通据此启动独立验收冻结 B1。B1 冻结后，按下表授权启动产品写入。资料阅读、已授权只读调查、核对基线和写入范围可以提前完成。
- 调度预留并派发，沟通按表代启对应固定角色上下文。任务只在本文件规定的分支、范围和用途中有效。新路径属于本次有名授权，角色卡、Section 1、边界 YAML、门禁、共享目录、对照仓库与原工作区源码保持冻结。缺路径时，执行者向调度报告必要性与精确路径，调度核对归属、冲突和授权后追加派发。阶段交接先确认上一写入者已结束。无需修改 `.ans/`、创建产品任务或手工写 task_ops 状态。

## 团队判断

保留现有角色。桌面应用是已归档的历史职责，当前属主为桌面窗口与桌面UI。编排承接既有工作流事实、定义约束和推进契约。装配负责包、依赖及控制面的进程基础设施。桌面窗口负责 Electron 生命周期接线及现有主进程作用门，桌面UI负责渲染层接线。测试执行真实验证，独立验收先冻结标准再判断同一候选。

| 维度 | 依据 |
| --- | --- |
| 责任独立性 | 流程语义、主进程授权面、进程与发行物、界面和测试各有原有职责。复用固定角色承担一次性原型。 |
| 范围归属 | 编排已有 `src/common/编排/` 与 `test/编排/`，装配已有包与私有辅助目录，桌面窗口已有 `app/desktop/`、main、preload，桌面UI已有 `app/renderer/`，测试及验收各有私有范围。以下标有「临时」的路径补足专用新模块或文件，按分支任务到期。 |
| 契约影响 | 编排是持久化工作流 Model 与操作契约的唯一主属主。装配是宿主基础设施入口的唯一主属主。桌面窗口负责 IPC 项及客户动作来源。消费方从公开入口获得类型和普通结果。 |
| 证据独立性 | 角色自测证明自身契约。测试用组合后的实际候选取证。独立验收依据 B1 给 B2。原型同时涉及公共契约、权限链和发行包，按 T3 执行全量适用回归。 |
| 协调成本 | 优先并行编排、桌面窗口和装配，随后桌面UI与测试。常态扩边界、另建角色、交叉编辑会增加移交成本，改用以下专用写集与有序接线。工作量随作用门和平台环境调查更新。 |

## 预留与逐角色派发

表内路径一律相对于候选分支。带 `/**` 的路径只覆盖专用子模块或本节点的功能文件。读取和执行检查按任务需要。每位执行者交回实际路径、检查命令与原始输出、候选或工作树状态、已知失败与待验证项。生成物用各节点隔离目录，禁止提交二进制、运行日志和凭据。

| 节点与固定执行角色 | 本次精确写集 | 入口及可观察交付 |
| --- | --- | --- |
| W0 独立验收，冻结标准 | `角色卡/独立验收/docs/design/2026-11-17_path-b-dapr-b1.md` | 由沟通启动独立上下文。基于 G0、经复核的 v1.1 和计划，冻结 V1–V11b、适用回归、次数、真实/替身区分及证据索引要求。回交版本与文件哈希，放行实现。 |
| W1 编排，定义、权威账本与 Workflow | `src/pipeline/orchestration/run-role.ts`、`src/common/编排/workflow-service.ts`、`src/common/编排/workflow-state.ts`、`src/common/编排/workflow-dispatch.ts`、`test/编排/durable-workflow/**`。临时 `src/model/durable-workflow.ts`、`src/pipeline/orchestration/durable-workflow.ts`、`src/service/durable-workflow/**`、`src/provider/durable-workflow/**`、`docs/workflows/path-b.yaml`、`docs/workflows/read-only-example.yaml` | W0。先发出公开端口与可编译 Model，回报组件与事件注册名。交付严格 YAML 、固定图与兼容检查、经 SQLite 原子写入的业务事实和 outbox、引擎登记及仓库身份、原始作用门认领与换代互斥、Dapr Workflow/Worker/恢复逻辑及对照测试。既有编排文件只接必要复用端口和所有者护栏。用 `npm run typecheck`、`node --test "test/编排/durable-workflow/**/*.test.ts"` 验证。 |
| W2 桌面窗口，主进程与现有入口 | `app/main.ts`、`app/preload.cjs`、`app/desktop/interface.ts`、`app/desktop/customer-input.ts`、`app/desktop/workflow.ts`、`app/desktop/workflow-git.ts`、`app/desktop/session/index.ts`、`app/desktop/session/card-gateway.ts`、`app/desktop/session/dispatch.ts`、`app/desktop/session/evidence.ts`、`app/desktop/session/git-ports.ts`、`app/desktop/session/handback.ts`、`app/desktop/session/persistence.ts`、`app/desktop/session/tasks.ts`、`app/desktop/session/contracts/{deps,persistence}.ts`、`app/desktop/session/delivery/queue.ts`、`app/desktop/session/delivery/store.ts`、`app/desktop/session/fixed-workflow/{route,cards,panel,release-merge}.ts`、`app/desktop/session/lifecycle/{background,consume,host,open,send}.ts`。临时 `app/desktop/durable-workflow.ts`、`test/桌面应用/durable-workflow.test.ts` | W0，端口准备与 W1/W3 并行。有关联端口后接 Desktop 路由、受限 IPC、客户卡、恢复扫描和实际作用门。逐处列出旧 A/B、恢复扫描、队列、派发、回交、写入及 Git 最终入口的 owner 判定证据；若作用门实际落到运行时核心或门禁引擎，回报精确路径供调度启动原属主。用 `npm run typecheck` 和受影响桌面用例验证。 |
| W3 装配，Dapr 子进程、依赖与候选包 | `package.json`、`package-lock.json`、`electron-builder.yml`、`tsconfig.json`（仅 SQLite 类型编译确有必要时）、`src/common/装配/dapr-assets.mjs`、`test/装配/dapr-host.test.ts`。临时 `src/pipeline/orchestration/dapr-host.ts`、`src/provider/dapr-host/**` | W0。固定 Dapr Runtime 1.19.1、SDK 3.19.0 并核对原生资产哈希、许可证和平台。先交环回宿主启动端口、资源布局、进程标识和就绪错误约定。监督 Scheduler（内嵌 Placement）和 daprd，给出端口冲突及正常退出证据。交只构建候选 ZIP 的命令及哈希，区分三平台构建与持久重启主机。完成 W1/W2/W4 后构建组合候选。用 `npm run test:assembly`、`npm run package:local` 和本地包验证取证。 |
| W4 桌面UI，工作流入口与投影 | `app/renderer/src/App.tsx`、`app/renderer/src/chat/ipc.ts`、`app/renderer/src/chat/ProjectStatePanel.tsx`、`app/renderer/src/chat/TaskCenterPanel.tsx`、`app/renderer/src/chat/DurableWorkflowPanel.tsx`、`app/renderer/src/chat/DecisionDialog.tsx`、`app/renderer/src/i18n/index.ts`、`test/桌面UI/durable-workflow.test.ts` | W0、W2 IPC/DTO 字段对齐且有槽位。把显式启用、选图、验证错误、实例/定义版本/摘要、等待项和可诊断阻塞接入现有项目界面；通过现有客户卡通道呈现批准动作。只有当底部拒绝动作取自 `application: true`、`cardKind: 'merge-main'` 且卡内显式列有 `reject-merge-main` 时，提交该选项，其他卡沿用现有映射。把 `ui.durableWorkflow.*` 词条清单交 W9。用 `npm run typecheck:renderer`、`npm run build:renderer` 和本例测试。 |
| W5 测试，真实联调与平台证据 | `test/测试/durable-workflow/**`、`角色卡/测试/docs/change/2026-11-17_path-b-dapr-evidence.md` 及同名 `-evidence/` 原始证据子目录 | W0 后可准备基线、隔离仓、用例和平台能力清单。实际证据使用 W1–W4 组合候选包。现有 `test/测试/fixed-path-full-chain.test.ts` 只读对照。交 V1–V11b 结果、失败/跳过、平台证据及确认匹配的冻结基线比较。 |
| W6 独立验收，候选结论 | `角色卡/独立验收/docs/change/2026-11-17_path-b-dapr-b2.md` | 沟通将同一独立验收角色接续 W0。收到候选 SHA、实际改动路径、节点、策划确认版、B1、证据链接和 T3 风险后，核对覆盖并给出通过、返工或证据不足。调度只对同一候选的验收结论放行。 |
| W7 统筹调度，依赖与交接 | `docs/scheduling/2026-11-17_path-b-dapr-team-plan.md` | 调度记录派发、返工与依赖，汇总变更包交沟通。 |
| W8 运行时核心，任务文件写入认领 | `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`test/runtime-core/durable-file-write.test.ts` | W0 已冻结，W2 已定位真实副作用，W3 释放阶段槽位。授权运行时核心按现有 Section 1 执行，验证通过后与 W1/W2 透传联调。用 `npm run typecheck`、`node --test test/runtime-core/durable-file-write.test.ts`。W5 的 V6 与受影响回归以包含 W8 的组合候选取证。 |
| W9 shared-code，共享双语词条 | `src/common/shared/i18n/messages/zh-CN.ts`、`src/common/shared/i18n/messages/en-US.ts`、`test/项目管理/shared/i18n.test.ts` | W4 提供词条与参数清单，W1 已释放槽位。按现有 Section 1 添加 `ui.durableWorkflow.*`，核对两语言键及插值参数一致，沿用共享 i18n 目录与消费入口。测试仅按本次实际新增键数同步测试名称、`ui` 分区计数与总数，保留严格等值断言。交实际路径、双语合同检查和 renderer 类型检查结果。 |

### W8 实际文件写入门

W8 的公共契约是 `GovernedToolsOptions.claimFileWrite({ operationId, targetPath, operation, contentSha256, signal }): Promise<DurableResult<{ finish(outcome: 'not-started' | 'succeeded' | 'unknown', evidence: string): Promise<void> }>>`。从宿主创建的真实 `FileInvocation` 取操作 ID、目标及操作类型，摘要来自最终写入字节。初始文件保护和目标 guard 通过后、建目录及任何文件变更前认领，持有到原子写和审计完成，继续执行现有最终复核。认领拒绝、旧尝试失效或所需调用事实缺失即停止写入。已证明无作用才提交 `not-started`，证实写入及审计完成才提交 `succeeded`，无法确认结果或回执提交时保留待核对，继续阻止换代和重派。

W8 覆盖 `write_file`、`edit_file` 的实际门、认领拒绝、认领期间的旧执行竞争、失败回执状态及旧会话行为。W2 在其 `app/desktop/session/lifecycle/open.ts` 接入可信项目、实例和尝试上下文，W1 在其 `src/pipeline/orchestration/run-role.ts` 透传，不改变 W8 的写集。`src/service/runtime/session.ts` 的 `RuntimeSessionOptions` 继承该选项，`buildGovernedTools` 经 `...options` 透传，维持只读。此节点使用既有角色及写入边界，交证后释放预留。

## 并行端口和依赖

1. 编排从 `src/model/durable-workflow.ts` 给出纯类型和身份字段，从 `src/pipeline/orchestration/durable-workflow.ts` 提供桌面可调用的公开操作。建议首轮覆盖列出并验证项目定义、显式启动、查询项目独占与实例所有者、读取投影、接收可信业务事实、认领实际副作用与记录回执、启动和关闭 Worker。所有提交以项目、实例、定义/摘要、尝试和持久业务键定位，重复请求查同一结果。运行时注册名及活动契约与 YAML 版本分开核对。工作流及状态图只依赖冻结输入，实际模型、文件或 Git 操作通过已有授权入口执行。可信来源应由应用根据既有会话或客户通道确定。
2. 装配从 `src/pipeline/orchestration/dapr-host.ts` 给出本地宿主的启动、状态和停止操作。桌面窗口传已选定的专用应用数据根与随包资源根，宿主返回这次启动的普通状态、诊断和环回连接信息。桌面窗口把受信连接参数交编排 Pipeline 配置 Worker。Renderer 与角色工具仅接收状态投影。包资源目录、宿主数据目录以及由谁分配应用 ID 和端口，由 W1/W2/W3 先回报一致约定。
3. 桌面窗口与桌面UI对齐列出/校验定义、启动、读投影和既有决定卡的 IPC 请求与安全裁剪。权威查询区分工作流所有者、步骤、业务阻塞和控制面健康。B2 来自同一次真实 B3 advance，B4 卡身份绑定具体审批快照；模型发送、任务写入、Git 执行各在实际作用边界认领并与换代串行。早到、迟到、未知副作用及重连按 v1.1 处理。首先核对真实作用门，发现其他原属主路径即回调度。
4. 多上下文上限为四（含沟通）。W0 优先，冻结后释放其运行槽。调度交出预留后释放运行槽，沟通在腾出的三个工作槽中并行代启 W1/W2/W3。三者先锁定端口再实现各自独立模块。W4、W5 按依赖和空槽以独立上下文启动。若工具仍计入已完成上下文，用平台允许的释放或顺序启动，所有上下文保留固定角色。组合验证前核对 `git diff` 的 writer 和所有者；暂不向生产仓、Release 流程或产品 main 推送。

## 合并候选与证据

Windows x64 已通过依赖安装及初始类型检查。原工作区 `.dapr-prototype-cache` 的只读先导证据核对了 Windows v1.19.1 二进制及其校验值，用 `probe/runtime.ps1` 与配套 CJS 验证真实 Workflow、SQLite、Scheduler 内嵌 Placement、SDK 3.19.0 和外部事件。同一探针的等待实例在 Worker、daprd 和 Scheduler 停止并重启后恢复，收到外部事件后完成，原始运行约 23 秒重新就绪。候选发行包、候选进程及 OS 重启和验收矩阵仍待实际取证。先跑持久等待、durable timer、Worker 注册及不兼容恢复门，再跑完整矩阵。

W3 交回 Windows 装配检查 101/101，以及原生 Dapr 定时器、跨进程重启、正常退出和包内 Electron 宿主的首轮证据。组合候选构建及 W5 最终联调仍待完成。

W1 已交编排检查 108/108 及 Windows 原生 Dapr 1/1。W2 最终类型检查通过，Windows 定向检查共 52/52（旧行为 48/48 和新局部 4/4）。W8 已交实际任务文件检查 5/5。接线闭合后优先 W5 组合联调及最终 ZIP，使用组合候选哈希关联各项证据。

W5 将构建 runner 与实际可重启宿主分别记录。每次故障窗口在至少一个原生候选包独立复现两次，三原生平台各一次候选包和独立 OS 重启，用同一持久数据卷与测试 Git 仓库。每项用同一关联 ID 串联 UI、ANS 事务/outbox、Dapr 历史、进程状态、授权/回执以及实际 Git 结果。健康恢复后的判据沿用 v1.1 的 60 秒与起算条件。候选发生变化时按影响重测。缺失实测平台、无法消歧的副作用、安全不变量失败或证据不足，均按 B1/B2 记录实际结论。

## B2 范围审计与 B4 交付说明返工

沟通已登记[本轮客户授权](../communication/2026-11-17_path-b-audit-and-delivery-rework.md)。本轮是对 [B2 独立验收 V1 的两项确证偏差](../../角色卡/独立验收/docs/change/2026-11-17_path-b-dapr-b2.md#v1-已证实的差异) 的分支内返工。接续原策划 v1.1、[已冻结 B1](../../角色卡/独立验收/docs/design/2026-11-17_path-b-dapr-b1.md) 与 T3 变更包口径，保留历史证据，复用固定职责和原预留路径。确认同一实际候选后，分别记录这两项返工判定和整套 B1 的状态。

| 原节点及固定角色 | 本轮最小写集 | 依赖、交付及验证 |
| --- | --- | --- |
| W1 编排 | `src/model/durable-workflow.ts`、`src/pipeline/orchestration/durable-workflow.ts`、`src/service/durable-workflow/{facts,public}.ts`、`src/provider/durable-workflow/{ledger,public}.ts`、`test/编排/durable-workflow/audit-delivery-rework.test.ts` | 与 W2 同时启动并先对齐公开输入、投影及回执端口。按实例和原 B3 请求建立正式 `change.scope-decided`，与同一原 B3 来源、有效 B1 证据、基线、派生写集、决策及 outbox 在一笔 ANS 事务关联，重复请求及恢复只写一条。为已保存 scope 从既有可核验来源补记。根据已核验的合并事实生成独立、稳定身份的交付说明，与合并、关闭及送达事实关联，初始待送达。支持已合并可核验实例补齐、重启恢复和同键重复回执，记录证据能支持的事实及运行期验证缺口。交单测、事务与查询证据。 |
| W2 桌面窗口 | `app/main.ts`、`app/preload.cjs`、`app/desktop/{durable-workflow,interface,workflow-git}.ts`、`app/desktop/session/fixed-workflow/{route,release-merge}.ts`、`test/桌面应用/durable-workflow.test.ts` | 与 W1 并行准备。传入实际 B3 受理来源、关联证据和既有已核验合并事实，使用现有权限与 Git 只读核验入口。在既有项目作用域和受信客户窗口的 IPC 开放交付说明的查询和持久回执；仅实际打开说明的用户操作可使待送达转已送达，重复投递或打开保持原回执。恢复补齐业务记录；实际 Git 执行次数保持原结果。交 IPC 作用域、兼容与恢复检查，并把 DTO 交给 W4。 |
| W4 桌面UI | `app/renderer/src/chat/{DurableWorkflowPanel,TaskCenterPanel,ProjectStatePanel}.tsx`、`app/renderer/src/chat/ipc.ts`、`test/桌面UI/durable-workflow.test.ts` | W1/W2 的读投影与回执字段齐备后启动。在原任务导航及证据区公开范围证据与交付说明入口，展示待送达、已送达和实际说明。用真实受信窗口的明确查看操作交回执。待回执写成前沿用待送达展示。交 renderer 类型/构建检查及交互证据。 |
| W9 shared-code（仅所需词条） | `src/common/shared/i18n/messages/zh-CN.ts`、`src/common/shared/i18n/messages/en-US.ts`、`test/项目管理/shared/i18n.test.ts` | W4 报出复用现有词条后仍需的键和参数时启动。仅增加所需双语 `ui.durableWorkflow.*`，按实际新增量同步严格计数，交双语键与参数检查。 |
| W3 装配 | 已有 Windows 本地包输出目录，仅生成返工 ZIP 与验证产物 | W1/W2/W4 及所用词条合为一版后，沿已有打包、原生宿主与本地包验证命令构建同一 Windows x64 实包，交候选 SHA、ZIP/二进制哈希和实际运行证据。 |
| W5 测试 | `test/测试/durable-workflow/desktop-native.test.ts`、`test/测试/durable-workflow/fixture.ts`、`test/测试/durable-workflow/desktop-audit-delivery-rework.test.ts`、`角色卡/测试/docs/change/2026-11-17_path-b-audit-and-delivery-rework.md` 及同名证据子目录 | 可先准备测试。对 W3 已标识的同机 Windows 候选，走真实桌面、持久数据、Dapr 和隔离 Git，核对新实例及保存 scope/已合并存量原型实例。覆盖 B3 同请求补投、合并已完成但说明未生成或回执未写的重启、界面明确查看、重复回执、影响原有 B2/B4 门的负例。用 SQLite 审计与回执、界面状态和 Git 前后 OID 及执行计数证明范围决定、说明、回执各只生效一次。记候选、命令、用例、替身、失败或缺证。 |
| W6 独立验收 | `角色卡/独立验收/docs/change/2026-11-17_path-b-audit-and-delivery-rework.md` | 先接收 W5 用例并核对已冻结的 B1。候选、实际路径、W5 新证据和历史证据的可复用性齐备后，按同版 B1 复验 V1 两项及受影响证据，独立给出返工结论与整体状态。 |

W1 与 W2 先派发，沟通按预留代启；W4、W9 随契约与空槽接续，W5 准备可与实现并行。W3 以完成接线的实际候选出包，W5 按该包取证，W6 对同一候选复验。原产品仓、本机正在使用的项目和发布仍在本轮授权之外。仅凭部分通过不得将原 B1 的其他缺证或平台结果标为达成。
