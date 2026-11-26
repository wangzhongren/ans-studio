# 幕僚提议与客户本人启用外置工作流 · 团队计划

日期 2026-11-17。工作类型为变更，风险档位为 T3。候选分支 `feat/dapr-path-b-workflow` 位于 `C:/Users/51054/Desktop/work/gptwork2/ans-studio-durable`。工作区基线 `371bcc480bee0527ce3fbffad302a562745cb001`，上一产品候选 `4c6efec34182563e3fa8b1ef6ef6372fe282d220`，组合取证 `87b3c0f154814ba2598ee3ce262778126b043c8c`，以及[上一轮独立验收](../../角色卡/独立验收/docs/change/2026-11-17_path-a-dapr-b2.md)作为对照。

[客户确认及分支授权](../communication/2026-11-17_intent-workflow-chief-start.md)覆盖由普通幕僚按需求选用并提出启动、客户本人确认启用，以及在同分支自主安排、开发、复测和独立验收。[补充方案 v1.1](../planning/2026-11-17_workflow-chief-start-handoff.md) SHA-256 为 `2b3737901aeb974c4522ab7236320824ffee82237b775fbc4a70cb483e978f0a`，已按[独立再复核](../planning/2026-11-17_workflow-chief-start-review.md)关闭 F1–F6。发布、角色制度和客户既有生产项目在本轮写入授权之外。

## 角色判断

沿用现有固定角色。编排承担持久提议与批准的公有契约，桌面窗口承担真实客户来源、幕僚会话、本人卡和入口控制，运行时核心、门禁引擎及 chief-code 各承担原有工具链的一段。桌面UI与 shared-code 维护界面及词条，装配、测试、独立验收分别出包、取证和判断。

| 维度 | 依据 |
| --- | --- |
| 责任独立性 | 业务事实与执行、输入可信性、运行时注册和纯角色工具声明各有原责任，按各自实际边界处理。 |
| Section 1 覆盖 | 复用路径 A/B 已有专用代码授权和各现有角色边界。表内精确新增文件仅属本轮，角色卡及常态边界保持原版。 |
| 契约影响 | W1 唯一拥有持久启动提议及启动许可契约；W7 负责实际运行时工具和应用本人卡种；W10 和 W11 分别维护工具登记与纯声明。W2 绑定并复核实况。 |
| 证据独立性 | W6 先冻结增量 B1，再按同一标准独立判断实际候选；W5 在组合候选上取证并核对旧包基线。 |
| 协调成本 | W1、W2 分成两条独立长路径；第三槽让小节点接力。复用原角色和基础设施，无常态边界扩张。 |

## 精确预留和派发

路径相对于候选分支，花括号只代表明列文件。W6 的 B1 先于实现写入，沟通按调度预留代启固定角色。需要增加文件时，执行者向调度交文件、原属主和具体理由。统一交实际 paths、候选、命令、原始证据及缺项。调度只写本计划。

| 节点、角色 | 本轮精确写集 | 交付及依赖 |
| --- | --- | --- |
| W6 独立验收，先冻结 B1 | `角色卡/独立验收/docs/design/2026-11-17_workflow-chief-start-b1.md`；实施后写 `角色卡/独立验收/docs/change/2026-11-17_workflow-chief-start-b2.md` | 立即由沟通启动 B1，基于 v1.1 明确启用链、反绕过、重放/恢复及旧候选可比证据。B1 文件及哈希回交后实施。最后用变更包及同版 B1 给唯一结论。 |
| W1 编排，提议、决定和受信定版启动 | `src/model/durable-workflow.ts`、`src/pipeline/orchestration/{durable-workflow,run-role}.ts`、`src/service/durable-workflow/{public,activation}.ts`、`src/provider/durable-workflow/{ledger,public}.ts`、`test/编排/durable-workflow/workflow-chief-start.test.ts`、`test/编排/chief-module-consumption.test.ts` | B1。先交可编译业务 Model 与 Pipeline 入口，供 W2 使用。持久记录宿主输入、有效定义选择、代次和不变启动键；待决答复按当前有效源与图校验，批准与待办同事务固定完整图，领取同一批准，经原占用和权限门创建唯一实例。按持久项目上下文透传普通幕僚能力，当前实例保有续办指引。与 W7 对齐工具回执及上下文，交事务、幂等、漂移和兼容单测。 |
| W2 桌面窗口，真实来源、本人卡及入口约束 | `app/main.ts`、`app/preload.cjs`、`app/desktop/{interface,durable-workflow,customer-input,workflow}.ts`、`app/desktop/workflow-chief-start.ts`、`app/desktop/session/{index,tasks,card-gateway}.ts`、`app/desktop/session/contracts/{deps,ports,session-types}.ts`、`app/desktop/session/delivery/{queue,store}.ts`、`app/desktop/session/fixed-workflow/route.ts`、`app/desktop/session/lifecycle/{index,open,send,consume}.ts`、`test/桌面应用/{durable-workflow,workflow-chief-start}.test.ts` | B1，与 W1 并行。受信主框接收普通 send 时由宿主定客户输入 ID、规范项目、需求与摘要，让真实直发/排队统一绑定幕僚 handle 和 ACK 回合；保存提议再次查真实来源。提供有界 `project_state` 目录；应用自有 Choice 按既有项目队列处理、本人大入口校验，并接回合结束/重开补办。关闭所有旧直启 IPC 及该桌面模式的首次 A1/B1 旁路，可信账本及真实任务共同绑定的旧在途仍可续。交 W4 可查状态 DTO、主框/卡/重开/旧入口证据。 |
| W10 门禁引擎，工具登记 | `src/model/role.ts`、`src/common/门禁引擎/role-tool-registry.ts`、`test/门禁引擎/{role-module-contract,fixed-role-module-surface}.test.ts` | B1，第三槽先行。以补充方案及定向再复核作为 E0.2 §3.1 一行的版本增量，只增加 `requestWorkflowStart → request_workflow_start → chief`；按 §4.4 与 chief-code/编排/运行时核心核对消费影响、兼容及测试。保留已冻结的原文及旧 14 项的断言，严格追加第 15 项，保留独立决定工具和发布工具的禁止条款。交 Model/登记完成与门禁定向检查。 |
| W11 chief-code，普通幕僚纯工具声明 | `src/common/roles/chief/internal/tools.ts`、`test/roles/chief/{module,differential}.test.ts` | W10 的 ID 类型/注册表。给 trio 幕僚增加同一项纯声明，旧六项仍按黄金样本核对，另核对新的一项。保留 single、未知、独立决定工作面与历史 oracle。真实项目和回合判定归 W1/W2。交角色模块差分检查。 |
| W7 运行时核心，工具装配及应用卡契约 | `src/model/runtime.ts`、`src/provider/runtime/{schema,tools}.ts`、`test/runtime-core/{workflow-chief-start-tool,stable-write-card-kind}.test.ts` | B1；与 W1 对齐最小输入及 pending 回执，接 W10/W11 登记。绑定宿主提供的函数才注册，严格解析选择字段，普通通用 Choice 及独立决定不能伪造应用专有 `workflow-start`。更新卡闭集精确断言，卡型不进入 judge 分组。既有 `RuntimeSessionOptions` 展开透传，`src/service/runtime/session.ts` 继续只读。交实际工具注册、调用、缺能力及卡种隔离检查。 |
| W4 桌面UI，任务中心和本人卡 | `app/renderer/src/chat/{DurableWorkflowPanel,TaskCenterPanel,DecisionDialog}.tsx`、`app/renderer/src/chat/{ipc,decision-card,card-meta}.ts`、`test/桌面UI/durable-workflow.test.ts` | W2 的真实状态及卡 DTO。保留预设、复制、导入、校验、待确认及现有实例；移除直启表单、启用开关和草稿重试。沿现有 Choice 项目队列显示需求、选择理由、定版摘要、本人才可作答与实际回执。交 renderer 类型、构建和界面交互证据；词条交 W9。 |
| W9 shared-code，必要双语词条 | `src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n.test.ts` | W2/W4/W7 列出需要的实际键、参数和归属。沿现有词条系统交双语与精确分区计数，不放宽断言。 |
| W5 测试，增量组合和旧候选复测 | `test/测试/durable-workflow/{fixture,desktop-chief-start.test,desktop-native.test,desktop-config.test,desktop-followup.test,desktop-audit-delivery-rework.test,desktop-external-workflow.test,desktop-path-a.test}.ts`、`角色卡/测试/docs/change/2026-11-17_workflow-chief-start-evidence.md` 及对应 `-evidence/` 子目录 | B1 后可准备。受影响旧测试的启动正例接真实幕僚输入和本人卡，旧直启保留为拒绝负例，旧候选结果单列。同一组合候选走 A、B、导入图及恢复/阻断矩阵，至少一项从实际 Windows 包普通 UI 输入、本人作答到查询并有真实 Dapr/SQLite 证据。 |
| W3 装配，Windows 实包 | 已有 `release-output/` 下构建及校验产物 | W1/W2/W7/W10/W11/W4 与所需词条汇合后，用既有装配流程构建、解包并执行 Windows x64 候选验证。交候选 commit、ZIP/二进制哈希、真实 Electron 启动和控制面；仅包产物。 |

## 启动条件与验证顺序

1. B1 冻结后优先并行 W1、W2。W1 固定由规范项目、受信客户输入和提议代次派生的 `activationId`、卡和启动键，W2 固定发行入口的客户 input/handle/ACK 证明与本人答复来源。Tool 只接受定义 ID、有效来源、预期摘要和理由。读取目录和保存提议均发生在业务实例、派发、Git owner 与排程之前。只有已保存本人批准进入内部启动；原回合结束且当前项目、运行与 owner 检查通过才启动。启动使用批准图，待决显示使用当前有效源。
2. 同一项目的旧直启 IPC 与首次旧阶段请求由 W2 同时封住，不能靠改 flowId、伪造 workflowId 或补交替代 token 开实例。控制面暂不可用、无待决提议或客户拒绝仍保有此约束。旧实例兼容须实证宿主识别的旧账本与真实任务。CLI、single 和适用的原模式按 v1.1 保持旧入口。
3. 最多四个活跃上下文含沟通。W6 交 B1 后释放活动槽。调度交计划后释放活动槽。W1/W2 占两个槽，第三槽由 W10、W11、W7 依次接力；已交接且文件隔离时可按签名依赖调整先后。W4 等 W2 DTO，W9 等真实词条。W5 等空槽准备及运行。两条长路径完成后由 W3 构建，W5 用该组合候选取证，再给 W6 同一候选和变更包。
4. 复测实际普通直发与排队、幕僚工具曝光和 handle 绑定、A/B/第三图本人卡、无假来源/跨窗口/错项目/委托批准、首次旧 A1/B1 和旧 IPC。覆盖单次提议、同键、明确撤销/批准竞争、换源同字节、隔日重开、批准后 YAML 改删换源、已批准未启动和已建未回包。记录 SQLite、Dapr、窗口回执及 owner，明确等待与已启动的区别。
5. W5 核对上一候选全链与 B2 判定，现候选执行类型检查、运行时/门禁/chief 定向检查、renderer、装配、旧 A/B、第三图、旧实例查询回交/卡恢复/v1 与文件校验。对旧包及新包注明真实入口、构建和执行范围。候选哈希或受影响依赖变化时补测；其他平台、真实线上的模型、OS 重启按实际证据记录。W6 收证包应含 SHA、实际改动、节点、方案哈希、B1、原始证据及 T3 档位。

## 实施期精确文件追加与检查记录

沟通已确认以下两项同属主补充，适用原冻结范围和角色卡。

| 节点 | 追加单文件 | 限定交付 |
| --- | --- | --- |
| W2 桌面窗口 | `app/desktop/session/dispatch.ts` | 在 `ensureFixedPathStarted` 触碰项目状态前拒绝持久桌面模式的新 legacy A1/B1。保留原途中的合法续办。反例核对零项目状态写入。 |
| W11 chief-code | `test/roles/chief/fixed.test.ts` | 现行 Section 1 内同步固定模式断言，严格核对原六项与本次唯一新增工具。 |

产品候选为 `4fb066385607d4c860beb93a2eb05561115e91ff`。W10/W11 联合检查在 Windows 实际通过 78/78。冻结 E0.3 文档的本地 CRLF 检出恢复到 Git blob 精确字节，索引与产品 diff 均为零。原始结果为 `release-output/workflow-chief-start-w11-canonical.tap`。W5 和 W3 正在复测，独立验收结论待同一候选与证据齐备后给出。
