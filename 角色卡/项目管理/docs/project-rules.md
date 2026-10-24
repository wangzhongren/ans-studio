# 全项目工程法案（草稿）

本文件是全项目唯一的工程约束记录。**它是草稿**：只写本阶段**确凿**的事实与已经客户确认的要求；未确认项单独标注为「方案/待确认」，不混入已生效规则。

**本文件不扩张任何角色的文件权限。** 一个角色能改哪些文件，只看它自己 `boundary.md` 的 Section 1。法案只描述共同约束，不构成写入授权。

**缺失不等于阻塞**：本项目由 ANS Governance 从零 bootstrap，法案尚未定稿；技能规则明确"缺法案不阻止启动"。已授权的工作照常进行。

## 一、现状（确凿事实）

这些来自**已验收的角色定义与边界**，以及 `ans-governed-construction` 技能的全局规则。

1. **语言**：TypeScript。各角色边界列出的源码均为 `.ts`（如 `src/interface/cli/run.ts`、`src/service/gate/resolve-write.ts`、`src/provider/pi/session.ts`）。
2. **五层调用方向**：
   ```text
   Interface -> Pipeline -> Service -> Provider -> 外部基础设施
   Model: 由上面四个运行层共享
   ```
   - 只允许**相邻层**调用；不得向上、跳层或平级互调。
   - Interface 只调 Pipeline；不直接触达 Service / Provider。
   - Service / Provider 层内部三段式 `abstract/` / `public/` / `impl/`；上层只依赖 `abstract/` 与 `public/` 入口，不直接依赖 `impl/`。
3. **Model 共享**：共享类型、值对象与不变量由四个运行层共同引用，不属于调用链中的一环。
4. **固定角色隔离**：一个上下文从绑定到结束只承担一个角色，不能中途切换。跨角色工作必须用**独立上下文**。本次客户明确授权专属角色与并行开发，项目管理按技能 `group-leadership.md` 的 Without task_ops 路径核对每角色授权、文档、边界、依赖与写集冲突后启动 fresh worker。普通组员不自行调度同伴。没有客户 pin 的 `.ans/project.json` 时，不伪造 task_ops 配置/审批，也不手写 scheduling 机器日志。
5. **单一主属主**：共享抽象（Model 类型、公共入口、跨模块契约）只能有一个主属主角色，其他角色只读引用。本项目：
   - `src/model/boundary.ts`、`src/model/role.ts`、`src/model/decision.ts` 的主属主是**门禁引擎**。改动它们会让所有引用方的既有证据失效，须先经项目管理协调。
   - `src/common/shared/`（跨角色共享组件）的唯一写入者是**项目管理**。**现有共享组件**（登记于 `docs/architecture/shared-components.md`）：`config-loader.ts`（`.ans/project.json` 有效配置加载 + pin-backed acceptance 校验）、`path-primitives.ts`（跨角色路径原语，安全相关）、`runtime-shared.ts`（`RuntimeKind` / `PI_CREDENTIAL_ENV_VARS` / `resolveSkillRoot`）、`argv-primitives.ts`（argv 规范化 `normalizeArgv`——**编排**写审计与**桌面窗口**展示操作者所见须**同源**，否则审计的 argv ≠ 操作者看到的 argv）、`env-file.ts`（`.env` 读写模块——**逐行**只改相关键、**原子写**（temp+`rename`）、**凭据不回显**；`.env` 仍归**装配**，本模块是它的**指定写入者**（设计 §11，经 Governance 记档 **G-2**））、`atomic-write.ts`（跨角色共享**原子写**原语——同目录 temp + `fsync` + `rename` **覆盖目标**，并对 rename 的 **Windows 瞬时 `EPERM`**（实时防护/索引器短暂持有目标句柄）做**有界重试**（仅瞬时码 `EPERM`/`EBUSY`/`EACCES`、≤200 次（`RENAME_MAX_ATTEMPTS`，由实测尾部≈63 定）、次数间只 `setImmediate` 让出事件循环、非瞬时立即抛）；抽自 `env-file.ts` 与 **Pi适配器** `fs-write.ts` 两处**同源**写法，消除该处 §6 镜像）。**消费方更新规则**：消费方（**装配**、**桌面窗口**、**编排**、**Pi适配器**、**门禁引擎**）**只读导入**该等模块，**不得复制第二份实现**；组件增删由 pm 在 `docs/architecture/shared-components.md` 登记。**加载器逻辑须单一实现**——已由 `src/common/装配/config-loader.ts` **整体搬迁**至 `src/common/shared/config-loader.ts`（T11，**搬迁非 fork**，逐字等价）；装配侧的本地副本须由 **T12** 改为从共享模块导入并**删除**。在 T12 完成前存在一段**过渡性「两处并存窗口」**（两份代码**逐字相同、行为不分叉**）；此窗口是搬迁的中间态，**不**构成对「不得复制第二份实现」的长期许可。**argv-primitives 消费方动作**：**编排**（`src/common/编排/shell-gate.ts`，**写审计侧**）与**桌面窗口**（`app/desktop/operator-channel.ts`，**呈现操作者侧**）各自删去本地 `normalizeArgv`、改从 `src/common/shared/argv-primitives.ts` 导入（**T21 / T22**）；二者完成前同样处于**过渡性「两处并存窗口」**（两份**逐字相同、行为不分叉**）。
6. **`common/` 是支撑目录，不是第六层**：
   - 每个角色拥有私有 `common/<role-id>/`，可在已批准任务内增删内部文件，不必逐文件改边界；不得导入其他角色的私有 `common/`。
   - 跨角色共享走项目管理的 `common/shared/`。
   - `common/` 不得反向调用运行层；共享代码不得依赖某个角色的私有 `common/`。
7. **未列即只读**：不在某角色 `boundary.md` Section 1 中列出、也不落在已授权目录内的文件，默认只读。要修改须先由 ANS Governance 更新 Section 1 并经客户确认。
8. **构建与配置归属**：`src/index.ts`、`bin/ans.js`、`package.json`、`tsconfig.json`、`README.md` 归**装配**角色；其他角色不修改构建配置。

### 命名现状（如实记录，不是新规则）

技能 `references/architecture.md` 的示例树用复数层名（`models/`、`services/`、`providers/`、`pipelines/`）；本项目已验收边界用单数：`src/model/`、`src/service/`、`src/provider/`、`src/pipeline/`、`src/interface/`。职责不变，仅词形不同，以本项目实际路径为准。

## 二、已确认要求（来自技能全局规则）

1. **编辑只限允许的文件**：文件必须在本任务写入范围内，否则先申请范围变更。
2. **遵守层规则**：代码只能调用本层与已约定公共接口允许的能力。
3. **补丁不等于完成**：先跑所需的结构检查与行为测试。
4. **测试只证明它实际跑过的**：记录代码版本、环境、输入与所用规则。
5. **改动依赖后重测调用方**：受影响代码的旧结果不再当前有效。
6. **不得把失败伪装成成功**：不得为让测试通过而删测试、放松断言、放宽权限或隐藏错误。
7. **业务代码需在客户确认文档并授意实施后再改**：设计文档先写拟采用方案。
8. **文档区分"未实施 / 未测试 / 未部署"**三个状态，不把计划写成结果；未确认内容标为候选。
9. **验收先判风险档位**：统筹调度必须在交给独立验收的变更包中标注风险档位 **T0–T3**，档位定义以技能 `references/testing.md` 的「Risk-Based Verification and Change Packages」为唯一口径，不得为省检查而压低档位。**独立验收必须先核对档位与改动是否相符并记录，再决定证据与检查**；档位与改动不符时，退回统筹，或按更高档位补证。检查强度：**T0 只查文档；T1 只跑受影响单测；T2 补受影响集成检查；全量回归只在 T3（发布、共享抽象、治理或权限变更）或证据不足时执行**；其余档位只做受影响检查，并复用未受影响且仍有效的证据。验收报告首行必须写明：**风险档位、判定依据、选定检查、复用证据、全量回归理由**（未执行全量回归时写明 N/A 理由）。**本规则不扩张任何角色的文件写权。**
10. **打印/日志-01：代码/文档工作在必要处添加打印/日志**（客户 **2026-10-23 确认，立即生效**）：
    - **范围**：本项目全部角色的代码、测试、脚本，以及生成/校验/迁移/复算类文档工作；自本条生效起适用于当前正在进行的角色根文档展示实现及后续全部变更；不追溯要求重写未受影响的历史代码。
    - **要求**：在必要处添加打印/日志，便于运行观察与排障。不要求每行、每个函数或热循环逐项刷屏；不得打印密钥、令牌、真实 `.env` 内容或个人敏感信息；不得用日志伪造成功、掩盖失败或代替测试证据；日志不得改变控制流或业务结果。
    - **正确办法**：
      - **代码**：优先使用项目既有诊断设施（`src/common/shared/diagnostics.ts` 的 `createDiagnosticLogger`，以及既有 `log.record` / `log.error` 写法）或既有 CLI/用户可见输出，不另起日志框架、不新增依赖；在入口/出口、状态迁移、外部 I/O、失败/重试/跳过、批处理开始/结束与跳过原因、证据写入、配置来源选择等必要处记录；热循环按聚合/摘要记录，不逐项刷屏；用户可见输出与诊断日志分开，诊断日志沿用既有字段白名单与净化，不写入命令原文、prompt/源内容等正文。
      - **文档/脚本**：生成、校验、迁移、复算脚本在关键步骤打印命令、输入、输出路径、退出码/计数与证据位置；变更/验收记录引用真实输出，不把摘要当原始证据。
    - **检查方式**：代码审查/差异检查核对必要日志是否存在，且无秘密、无噪声、无伪造；运行受影响脚本/测试，确认输出可复现；行为相关处可在测试中断言日志；不以噪声日志冒充可观察性。
11. **独立验收-01：所有变更默认独立验收**（客户 **2026-10-24 确认，立即生效**；取代此前“独立验收仅随发布版本启动、非发布不派”的口径）：
    - **范围**：**T0–T3 的代码/文档/测试变更**——**包括非发布变更、修复与演示**——在 change-package 与证据齐备后，由应用按验收门**自动派发 Proof/独立验收**（含验收标准/报告与验收卡）；**发布版本只是其中一种变更，不是启动独立验收的条件**。
    - **`release` 标记**：`release` 仅为**发布元数据**，**不再作为独立验收门**；非发布 flow/变更**不得停在 `awaiting-release-acceptance`**，满足流程完成与证据条件即进入独立验收。
    - **独立性不变**：Proof/独立验收独立于实施方，**不自动 accept/reject、不代批、不伪造证据**；**客户保留最终决定权**。
    - **检查强度**：仍按**第 9 条风险档位**执行——T0 只查文档、T1 只跑受影响单测、T2 补受影响集成检查、全量回归只在 T3 或证据不足时执行；本条不改变第 9 条任何内容。
    - **本规则不扩张任何角色的文件写权。**

## 三、方案/待确认（未生效）

以下来自待确认的设计文档 `2026-10-11_design_ans-cli-pi-runtime.md`，**尚未实现、未经客户确认**，因此不是生效规则，仅供参考：

- 「一个角色 = 一个 worker 进程，进程内嵌入 Pi SDK」的运行时结构；
- 「构造优于拦截」的门禁策略，及其依赖的未实测前提（V1 同名工具覆盖、V3 `run_shell` 取舍）；
- `resolveWrite` 路径判定的接口与测试清单；
- `ans role run` / `ans govern` / `ans init` 命令名与参数；
- 治理边界覆盖键 `governanceBoundary` 放进 `.ans/project.json`。

这些在评审通过并经客户确认前，不写入任何生效规则。评审记录见 `docs/design/2026-10-11_design_ans-cli-pi-runtime-review.md`（结论：`needs revision`）。

另有一批 **UI 平台化候选约束**（客户 2026-10-21 已确认方向，实施前候选；尚未写成现状）：

- **UI 平台化阶段验证口径（2026-10-21 PM 裁定，Phase 3 门起生效）**：阶段门按**枚举 check 清单**判定——范围内双端同名同值、因功能未实现而延期的 check 按阶段列名、既有基线红单独登记且不计新红；计数不能代替名单。bench 规则：每目标首轮预热不计、有效测量 ≥3 轮，`stormA/stormB.maxGap` 新中位 ≤ max(旧中位, 25ms) 且有效轮 p95 ≤35ms、单轮 ≤50ms；热路径变更后同机同日重基线。DOM 契约：`>40` 行且闭合的大工具组延迟挂载明细为**唯一已登记例外**（摘要/失败直显保持、展开即挂载、≤40 行不变），其他 DOM 差异须 PM 批准。全量双端等价仍是 Phase 5 切换判据。
- **UI 平台化构建与依赖宪法（2026-10-21 客户已确认方向；Phase 5 已实施并独立验收，范围内）**：渲染层构建采用 Vite，**仅覆盖渲染层**（`root=app/renderer`、`base='./'`、产物 `app/renderer/dist/`、`modulePreload.polyfill=false`）；主进程与 preload 保持无构建。根级 `vite.config.ts` 归**装配**（已由 ANS Team Formation 更新装配 Section 1）；`app/renderer/` 内的 `components.json`、`tsconfig.json`、`src/`、构建产物 `dist/` 在**桌面UI** 的目录授权内；根 `tsconfig.json` exclude `app/renderer`，渲染层独立 `app/renderer/tsconfig.json` 归桌面UI；`typecheck:renderer` 脚本归装配。渲染层单测只测**无 DOM 的纯逻辑 `.ts`**，DOM 行为交真实 Electron e2e；不引 vitest，jsdom/testing-library 仅为经项目管理逐项批准的备选。依赖：渲染打包库（含 React/react-dom）放 `devDependencies`，`dependencies` 只保留主进程运行时 require 的包；新增/升级依赖由**项目管理**按四问批准、**装配**落 `package.json` 并精确锁版（无 `^`/`~`）；Markdown 保持 `markdown-it` 单一实现，npm 精确版本（现 **15.0.3**，安全升级）并已删除 vendor。**发布接入不在本轮**：v1.4.0 冻结源与 overlay 白名单不接受 `app/` 变更，接入属下一次冻结源/新发布轮。以上已随 Phase 5 实施并独立验收（AC1–AC8 pass，范围限 macOS 本机离线夹具/本地构建/本地打包；真实模型/网络、Windows/DPI/屏读、签名/公证/安装器、发布流水线与 CI、Linux/其他平台、真实主进程通道/真实引擎会话六类 missing-evidence 另列）；发布接入仍待客户决定。评审见 `docs/design/2026-10-21_review_ui-platform-round.md`（revision 19；§二十/§二十一/§二十二）。

## 四、待解决冲突与已裁定项

本节记冲突：**未解决的**逐条列；**已由客户裁定解决的**就地标注「已裁定」并指向生效规则所在处。

- **§2.6 创建权**：设计提出"角色与角色空间由 pm 创建"，与 SKILL.md「角色由 ANS Governance 创建」「角色从不创建自己」「不允许 blanket 授权」冲突。在 Governance 完成规则改动并经客户确认前，项目管理不假定该权限已存在。
- **调度记录归属（2026-10-11 已裁定，冲突已解决）**：早期设计让 CLI（编排）直接写 `docs/scheduling/<task-id>.md`，会绕过 `task_ops` 的校验与锁。**客户裁定「调度权归 pm」后已定**：目录 `docs/scheduling/` **归项目管理（pm）**（其 Section 1 已含该条目，`purpose: 任务调度记录（内容由 task_ops 写入）`）；**内容唯一写入者是 `task_ops`**（技能 `scripts/task_ops.py` + `coordination_store.py`，含 hash 链式机器段）；**编排不得直接写**（机制 `runRole`/`openRoleSession` 留编排，**权力**归 pm）。**使用约定**见 `docs/design/2026-10-11_design_scheduling-record-convention.md`。**注：调度「执行」路径不在 V1（设计 §3.7），本项只落约定与记录格式。**

## 变更记录

- 2026-10-14：客户确认运行时接入组与开发；中立契约主属运行时核心、Pi/Codex/Claude 为专属适配器。允许本次必要的 v1 冻结契约迁移：Model 中立形状、Pi 兼容转出、公共工具/schema 单一实现、Pipeline 改走 Service、桌面 runtime 隔离和公共回放。具体范围、阶段与验证见 [ANS-RUNTIME-V2](design/2026-10-14_design_multi-runtime-integration.md)；不授权全仓层结构清理或任何所有权扩张。每个精确边界缺口先交 Governance 更新。

- 2026-10-11：首次建立，草稿。依已验收角色定义记录现状，区分已确认要求与未确认方案。来源：治理 bootstrap 后续的项目管理任务。
- 2026-10-11：§一.5 补记**首个跨角色共享组件** `src/common/shared/config-loader.ts` 与其**消费方更新规则**（装配/桌面只读导入、不复制第二份、`shared-components.md` 登记；逻辑由装配私有 `config-loader.ts` **搬迁**而非 fork）。依据：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.10。来源：T10 回报的共享阻塞裁决。
- 2026-10-11：**T11 落地后核对 §一.5**——搬迁已完成（`loadEffectiveConfig`/`enforcePinBackedAcceptance` 及全部依赖现于 `src/common/shared/config-loader.ts`，逐字等价；登记见 `docs/architecture/shared-components.md`），规则与实现一致；补记**过渡性「两处并存窗口」**（装配本地副本由 T12 删除；窗口内两份逐字相同、行为不分叉，非长期许可）。来源：T11（pm 执行）。
- 2026-10-11：**T6 落地后核对 §四「调度记录归属」**——该条原写「归属与分工待定」（已陈旧）；客户已裁定「调度权归 pm」，故把它改为**已裁定**并修好与 `docs/scheduling/` 归属/唯一写入者的一致性：**目录归 pm、内容唯一写入者 `task_ops`、编排不得直接写**，指针指向约定文档 `docs/design/2026-10-11_design_scheduling-record-convention.md`；如实标注**调度「执行」路径不在 V1**（设计 §3.7）。§四标题随之由「待解决冲突」改为「待解决冲突与已裁定项」。来源：本项目任务 T6。
- 2026-10-11：**T23 落地后核对 §一.5**——补记共享组件 `argv-primitives.ts`（argv 规范化 `normalizeArgv`，设计 §3.11 **行 7**，全仓**最后一处**跨角色镜像：编排写审计 ↔ 桌面呈现操作者所见，须**同源**），并把 §一.5「现有共享组件」清单补全为现行**四个**（`config-loader` / `path-primitives` / `runtime-shared` / `argv-primitives`）、消费方更新规则扩为「装配/桌面/编排/Pi适配器/门禁引擎只读导入」。**argv-primitives 消费方动作**：编排（`shell-gate.ts`）与桌面（`operator-channel.ts`）各自删本地 `normalizeArgv` 改导入（T21/T22），完成前处**过渡性「两处并存窗口」**（逐字相同、行为不分叉）。依据：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.11 行 7；登记见 `docs/architecture/shared-components.md` 组件 4。来源：本项目任务 T23。
- 2026-10-11：**T26 落地后核对 §一.5**——补记共享组件 `env-file.ts`（**`.env` 读写模块**：逐行只改相关键、原子写 temp+`rename`、凭据不回显；**`.env` 仍归装配、本模块为其指定写入者**，设计 §11，经 **Governance 记档 G-2**），并把 §一.5「现有共享组件」清单补为现行**五个**（`config-loader` / `path-primitives` / `runtime-shared` / `argv-primitives` / `env-file`）。**env-file 消费方**：**桌面应用**（T28 面板+载入/保存、T29 测试）**只读导入**，`.env` 读写逻辑**全仓唯一**（此前无任何此实现，不存在第二份）。依据：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §11；登记见 `docs/architecture/shared-components.md` 组件 5。来源：本项目任务 T26。
- 2026-10-11：**抽共享原子写原语后核对 §一.5**——补记共享组件 `atomic-write.ts`（跨角色共享**原子写**原语；对 rename 的 **Windows 瞬时 `EPERM`** 做**有界重试**；抽自 `env-file.ts` 与 **Pi适配器** `fs-write.ts` 两处同源写法，消除该处 §6 镜像），并把 §一.5「现有共享组件」清单补为现行**六个**（`config-loader` / `path-primitives` / `runtime-shared` / `argv-primitives` / `env-file` / `atomic-write`）。**atomic-write 消费方**：**`env-file.ts`**（`atomicWriteText` 已改委托 `atomicWrite`，签名/行为不变）与 **Pi适配器**（`fs-write.ts::atomicWriteFile` **待改导入**为 `atomicWrite(abs, data, { mode: 0o600 })`），完成前处**过渡性「两处并存窗口」**（两处 rename-重试语义**逐字同源**、行为不分叉）。依据：`角色卡/Pi适配器/changelog.md`（根因与量化证据）；登记见 `docs/architecture/shared-components.md` 组件 6。来源：本项目任务（pm：抽共享原子写原语）。
- 2026-10-14：**角色拆分后核对 §一.5 消费方名单**——原「桌面应用」拆分为 **桌面UI**（渲染前端）/ **桌面窗口**（主进程、preload、桌面会话装配），客户确认名称。共享组件（`config-loader`、`argv-primitives`、`env-file`、`atomic-write` 等）的 app 侧消费方现为**桌面窗口**；§一.5 中三处「桌面应用」角色名已同步改为「桌面窗口」，引用文件与模块不变。依据：客户确认的角色拆分（`角色卡/桌面应用/归档说明.md`、`角色卡/桌面UI/`、`角色卡/桌面窗口/`）。
- 2026-10-21：依 [UI 平台化评审](design/2026-10-21_review_ui-platform-round.md) 在 §三 记录**候选约束**：渲染层 Vite 构建归属（根 `vite.config.ts` 归装配，须先由 Team Formation 更新边界）、tsconfig 拆分与 `typecheck:renderer` 归属、渲染库放 `devDependencies`、依赖宪法（PM 批准、装配落盘、精确锁版）、markdown-it 改 npm 精确版本并删 vendor、测试机制（纯逻辑单测 + Electron e2e）。同条如实记录：v1.4.0 冻结发布配方（`SOURCE_SHA=83eec7e` + overlay 白名单）不接受 `app/` 变更，发布流水线接入属下一次冻结源/新发布轮。边界更新与实施完成前均为候选，不写成现状。
- 2026-10-22：依客户原话「把验收必须先判断风险档位的口径固化到项目规则或验收角色卡」，在 §二「已确认要求」新增第 9 条「验收先判风险档位」；只改本工程法案，未改产品代码、测试、角色卡、边界，未改变任何角色写权。来源：`docs/communication/2026-10-22_intent_acceptance-risk-tier.md`（闸门 0 已确认；角色指派见 `docs/scheduling/2026-10-22-acceptance-risk-tier.md`）。
- 2026-10-23：依客户原话「现在这个工作流应该要求对于代码类或者文档类的工作，应该在必要处添加打印。」（**2026-10-23 确认、立即生效**），在 §二「已确认要求」末尾新增**第 10 条「打印/日志-01：代码/文档工作在必要处添加打印/日志」**（范围/要求/正确办法/检查方式）；第 1–9 条原文保留、未重排未删改。只改本工程法案，未改产品代码、测试、角色卡、边界，未改变任何角色写权；影响本项目**全部角色**的代码、测试、脚本与生成/校验/迁移/复算类文档工作。依据：`docs/communication/2026-10-23_intent-print-logging-rule.md`（闸门 0 已确认）；变更记录见 [`docs/change/2026-10-23_change_print-logging-rule.md`](change/2026-10-23_change_print-logging-rule.md)。
- 2026-10-24：依客户 **2026-10-24 明确选择“独立验收的所有变更范围＝所有变更”**（取代此前“仅发布版本”口径；闸门 0 已确认），在 §二「已确认要求」第 10 条后新增**第 11 条「独立验收-01：所有变更默认独立验收」**：T0–T3 的代码/文档/测试变更（含非发布、修复、演示）在 change-package/证据齐备后，由应用按验收门自动派 Proof/独立验收；发布版本只是其中一种、不是启动条件；`release` 仅为发布元数据、不再作为独立验收门；非发布不得停在 `awaiting-release-acceptance`；Proof 独立、客户最终决定；检查强度仍按第 9 条风险档位。第 1–10 条原文保留、未重排未删改；经全文关键词核查，本文件无其他“仅发布版本/非发布不派”冲突表述。只改本工程法案，未改产品代码、测试、角色卡、边界，未改变任何角色写权。依据：`docs/communication/2026-10-24_intent_independent-acceptance-all-changes.md`（闸门 0 已确认）。
