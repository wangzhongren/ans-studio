# 外置工作流定义与路径 A 接入 Dapr · 团队计划

日期 2026-11-17。工作类型为变更，风险档位为 T3。候选分支为 `feat/dapr-path-b-workflow`，工作区为 `C:/Users/51054/Desktop/work/gptwork2/ans-studio-durable`，冻结对照为 `7f4cf4e380f4a2b1e6f47572b5a4eeb5a3087a0e`。

客户确认 A、B 是外置定义预设，后续可导入新的合法定义，由应用执行及授权。客户授权在同分支自主安排、开发、测试和独立验收。新 A 显式启用，既有在途实例由各自执行器收尾。沟通已按该授权冻结 [策划 v1.1](../planning/2026-11-17_design_path-a-dapr-workflow.md)，SHA-256 为 `d629ae779c58f36dc5b9c9bcab85b586de7d2ab8a2ad01ca70e42fc8e5b1db41`。[独立策划复核](../planning/2026-11-17_review_path-a-dapr-workflow.md) 的 F1–F6 已关闭。分工沿 [客户范围及执行授权](../communication/2026-11-17_intent_path-a-dapr-workflow.md) 施行，持续限本分支与隔离测试项目。

## 角色判断与写集授权

复用编排、桌面窗口、桌面UI、装配、测试及独立验收。编排拥有持久运行时公有契约及既有流程领域规则，桌面窗口拥有真实会话、卡、Git 与项目窗口接线，桌面UI拥有渲染层。允许为该原型使用下表中的现有专用模块和精确新增路径。既有门禁、运行时核心和 shared-code 保有自己的常态边界。调度只写本计划。代码库角色卡、边界及权限设置由原属主保有。

| 判断维度 | 本轮依据 |
| --- | --- |
| 责任独立性 | 通用执行与持久权限、既有 A 工具的宿主接线、客户界面和发行取证各有现有责任。 |
| Section 1 覆盖 | 编排已有 `src/common/编排/`、`src/pipeline/orchestration/run-role.ts`、`test/编排/`，其余通用执行路径复用上一轮分支专用预留。桌面窗口、桌面UI、装配、测试、验收使用各自现行角色边界。 |
| 契约影响 | Model、能力注册及 Pipeline 操作由 W1 唯一负责。受信的 Electron 输入、实际作用门及内部 IPC 由 W2 唯一负责。W4 只适配投影与客户操作。 |
| 证据独立性 | W0 冻结标准，W1/W2/W4 自测，W5 使用组合候选取证，W6 独立核对通过、返工或证据不足。 |
| 协调成本 | 现有角色能覆盖，采用精确任务分工与阶段接力。新增长设角色、常态扩边界或拆分源模块的协调代价大于并行收益。 |

下表路径均以候选分支为根。花括号仅指明列文件，生成物放已有隔离输出目录。允许因实际需求只使用写集子集。发现其他路径或实际属主，先向调度报精确路径及依赖。沟通按表代启固定角色。W0 形成正式 B1 后才开放代码写入。所有结果交检查命令、原始证据、实际 paths 和阻塞项。

| 节点 | 本轮写集 | 入口与可观察交付 |
| --- | --- | --- |
| W0 独立验收，冻结 B1 | `角色卡/独立验收/docs/design/2026-11-17_path-a-dapr-b1.md` | 立即由沟通启动。按 v1.1 的 T1–T5 冻结通过、次数和证据门槛，列明原 B 历史证据的可复用条件，交 B1 路径、SHA-256 和还需实际取证的入口。 |
| W1 编排，通用执行器及领域校验 | `src/model/durable-workflow.ts`、`src/pipeline/orchestration/{durable-workflow,run-role}.ts`、`src/service/durable-workflow/{definition,effects,facts,public,rules}.ts`、`src/provider/durable-workflow/{files,ledger,public}.ts`、`src/common/编排/{workflow-service,workflow-state,workflow-dispatch}.ts`、`docs/workflows/{path-a,path-b}.yaml`、`test/编排/durable-workflow/fixture.ts`、`test/编排/durable-workflow/{definition-ledger,authority-git,real-worker,external-definition}.test.ts`。可按职责拆出新文件 `src/service/durable-workflow/{capabilities,path-a}.ts`。 | W0。首项交可编译的 Model/操作签名与 W2 共核，接着实现能力登记、严格图准入、旧 v1 与新契约共存、稳定目录身份与无空窗双占用、事务/outbox、外置 A/B 预设。使用现有领域校验及产出，旧函数的推进保持旧实例路径。W2 提供真实宿主输入与效果证据。交结构自测和真实 Worker 原位续跑证据。 |
| W2 桌面窗口，受信应用及 A 领域接线 | `app/{main.ts,preload.cjs}`、`app/desktop/{durable-workflow,durable-workflow-a,interface,project,customer-input,workflow,workflow-git}.ts`、`app/desktop/session/{index,card-gateway,dispatch,evidence,git-ports,handback,session-env,tasks}.ts`、`app/desktop/session/contracts/{deps,ports}.ts`、`app/desktop/session/delivery/{queue,store}.ts`、`app/desktop/session/fixed-workflow/{route,cards,release-merge,panel}.ts`、`app/desktop/session/lifecycle/{index,open,host,send,background,consume}.ts`、`test/桌面应用/durable-workflow.test.ts`、`test/桌面应用/durable-path-a.test.ts` | W0，和 W1 同时开始。复用项目注册、可信用途/角色路由、原角色工具、三卡、任命、A9 基线 Git、A12a 实际任务、A12b 归档、A13 客户本人及交付回执。新实例按 Dapr 当前节点和独立待办受理，旧派发与自动推进守同一写占用。提供项目目标的预设复制、受控导入和实例 IPC，DTO 交 W4。交实际入口、作用认领、恢复及反绕过证据。 |
| W4 桌面UI，定义入口及投影 | `app/renderer/src/chat/{DurableWorkflowPanel,TaskCenterPanel,ProjectStatePanel,DecisionDialog}.tsx`、`app/renderer/src/chat/ipc.ts`、`test/桌面UI/durable-workflow.test.ts` | W0、W2 的 DTO 与受信调用就绪。沿原任务导航呈现 A/B 随包预设、选择和导入，显示版本、来源、校验/占用失败和 A9 前可查实例，复用原客户卡、证据和交付入口。交 renderer 类型检查、构建及真实界面操作。 |
| W9 shared-code，双语词条，按需 | `src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n.test.ts` | W4 交不能复用的键和参数后安排。仅写本功能词条及对应测试名称、精确计数，验证两语言的键、参数和严格等值。 |
| W5 测试，组合与旧链验证 | `test/测试/durable-workflow/{fixture,desktop-native.test,desktop-config.test,desktop-path-a.test,desktop-external-workflow.test}.ts`、`test/测试/durable-workflow/fixtures/external-existing-change.yaml`、`角色卡/测试/docs/change/2026-11-17_path-a-dapr-evidence.md` 与同名证据子目录 | 可先读基线和准备环境。W0 后可写测试。用有真实既有模块的隔离仓、空目录隔离项目、同包导入第三图及同一候选覆盖 T1–T5。角色脚本作为输入，实走桌面工具、受信卡、Dapr、SQLite、Git。第三图由测试通过导入入口提供，保存包哈希并对照合法写分支与只读分支。 |
| W3 装配，Windows 候选包 | 已有 `release-output/` 下候选构建与运行输出，初始不预留新的构建源码 | W1/W2/W4 与所需词条接齐后 build 同一 Windows x64 ZIP。现成打包规则已包含 `docs/workflows/**/*.yaml`。按现有装配、自检命令取证，交候选 commit、包及组件哈希、实际预设条目。 |
| W6 独立验收，当前候选 | `角色卡/独立验收/docs/change/2026-11-17_path-a-dapr-b2.md` | W0 的同一验收角色接续。收到 T3 变更包后核对 B1 与 T1–T5、冻结基线和受影响回归，记录唯一结论。 |

合规文件作用门复用 W8 已接入的真实 `claimFileWrite`。W1/W2 按核定用途、当前节点和真实任务绑定合法写区。若核实宿主真实作用门或构建现有规则必须改动，调度再按原职责增补精确文件，原 writer 先保留相应依赖。

## 先行对齐和候选验证

1. W1/W2 先对齐受信项目 ID、业务 flowId、实例、父任务、尝试、定义快照和预留申请键的来源。W1 的能力前置、结果事实、动作意图、认领及结算沿公开 Pipeline 入口，W2 从现有应用工具接入事实。应用核定工作用途、角色和作用范围。额外定义、能力名和步骤 ID 由 YAML 描述，已有权限继续由真实宿主门核验。
2. W1 提供项目/仓库占用和恢复操作，W2 提供真实目录、A9 作用前后受控 Git 证据及旧入口占用核验。可能写的图在任何业务派发前取得共享占用。复验无 Git、已创建尚未绑定及已绑定三个窗口，以及同键恢复、不同数据根、旧 A/B 活跃和另一 worktree。第三图先只读分析；进入写分支再核验 Git 状态并准备任务分支。
3. W1/W2 明确 A12a 独立待办可跨 A11 和应用重开，A12b 归档绑定同一标准及候选。A3/A6/A10 独立请求、快照、决定与来源须由实际旧工具链进入，W5 核对实际卡和复原。A13 与 B4 仍走客户本人及真实 Git 门。模拟角色只能发送其正常入口接受的输入，真实业务端口产生角色任务、卡、范围、归档、提交和回执。
4. 四上下文上限含沟通。W0 优先冻结。调度交计划后释放；W0 交证后，沟通同时代启 W1/W2，W5 可使用空槽准备用例。W4 等 DTO，W9 仅有词条需要时接续。组合源齐备再交 W3 构建，W5 运行已标识的 Windows 包和同候选控制器用例，W6 独立核对。已有对照 `node --test 'test/测试/fixed-path-full-chain.test.ts'` 为 3/3，实际 Git 配 mock 角色，日志 `release-output/path-a-before-full-chain.tap`。
5. 验证至少执行主进程及 renderer 类型检查、编排和桌面定向测试、W5 组合及旧 A/B 受影响回归、现有装配测试及 Windows 本地包验证。保存同候选原始证据，包括实体 YAML 快照、原 v1 候选的数据升级、实际进程、Git、SQLite 及 Dapr 的关联 ID。分开记录角色替身、桌面控制器、真实 Electron/Renderer、Windows ZIP、未实测平台与失败项。候选变化按影响重测，B1 未核准的覆盖保持实际状态。产品主干、远程发布和现用项目在本轮授权之外。
