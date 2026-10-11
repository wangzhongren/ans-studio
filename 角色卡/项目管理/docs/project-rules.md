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
4. **固定角色隔离**：一个上下文从绑定到结束只承担一个角色，不能中途切换。跨角色工作必须用**独立上下文**；任何角色都**不派生下游 agent**、不自行调度同伴。
5. **单一主属主**：共享抽象（Model 类型、公共入口、跨模块契约）只能有一个主属主角色，其他角色只读引用。本项目：
   - `src/model/boundary.ts`、`src/model/role.ts`、`src/model/decision.ts` 的主属主是**门禁引擎**。改动它们会让所有引用方的既有证据失效，须先经项目管理协调。
   - `src/common/shared/`（跨角色共享组件）的唯一写入者是**项目管理**。**现有共享组件**（登记于 `docs/architecture/shared-components.md`）：`config-loader.ts`（`.ans/project.json` 有效配置加载 + pin-backed acceptance 校验）、`path-primitives.ts`（跨角色路径原语，安全相关）、`runtime-shared.ts`（`RuntimeKind` / `PI_CREDENTIAL_ENV_VARS` / `resolveSkillRoot`）、`argv-primitives.ts`（argv 规范化 `normalizeArgv`——**编排**写审计与**桌面应用**展示操作者所见须**同源**，否则审计的 argv ≠ 操作者看到的 argv）、`env-file.ts`（`.env` 读写模块——**逐行**只改相关键、**原子写**（temp+`rename`）、**凭据不回显**；`.env` 仍归**装配**，本模块是它的**指定写入者**（设计 §11，经 Governance 记档 **G-2**））、`atomic-write.ts`（跨角色共享**原子写**原语——同目录 temp + `fsync` + `rename` **覆盖目标**，并对 rename 的 **Windows 瞬时 `EPERM`**（实时防护/索引器短暂持有目标句柄）做**有界重试**（仅瞬时码 `EPERM`/`EBUSY`/`EACCES`、≤20 次、次数间只 `setImmediate` 让出事件循环、非瞬时立即抛）；抽自 `env-file.ts` 与 **Pi适配器** `fs-write.ts` 两处**同源**写法，消除该处 §6 镜像）。**消费方更新规则**：消费方（**装配**、**桌面应用**、**编排**、**Pi适配器**、**门禁引擎**）**只读导入**该等模块，**不得复制第二份实现**；组件增删由 pm 在 `docs/architecture/shared-components.md` 登记。**加载器逻辑须单一实现**——已由 `src/common/装配/config-loader.ts` **整体搬迁**至 `src/common/shared/config-loader.ts`（T11，**搬迁非 fork**，逐字等价）；装配侧的本地副本须由 **T12** 改为从共享模块导入并**删除**。在 T12 完成前存在一段**过渡性「两处并存窗口」**（两份代码**逐字相同、行为不分叉**）；此窗口是搬迁的中间态，**不**构成对「不得复制第二份实现」的长期许可。**argv-primitives 消费方动作**：**编排**（`src/common/编排/shell-gate.ts`，**写审计侧**）与**桌面应用**（`app/desktop/operator-channel.ts`，**呈现操作者侧**）各自删去本地 `normalizeArgv`、改从 `src/common/shared/argv-primitives.ts` 导入（**T21 / T22**）；二者完成前同样处于**过渡性「两处并存窗口」**（两份**逐字相同、行为不分叉**）。
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

## 三、方案/待确认（未生效）

以下来自待确认的设计文档 `2026-10-11_design_ans-cli-pi-runtime.md`，**尚未实现、未经客户确认**，因此不是生效规则，仅供参考：

- 「一个角色 = 一个 worker 进程，进程内嵌入 Pi SDK」的运行时结构；
- 「构造优于拦截」的门禁策略，及其依赖的未实测前提（V1 同名工具覆盖、V3 `run_shell` 取舍）；
- `resolveWrite` 路径判定的接口与测试清单；
- `ans role run` / `ans govern` / `ans init` 命令名与参数；
- 治理边界覆盖键 `governanceBoundary` 放进 `.ans/project.json`。

这些在评审通过并经客户确认前，不写入任何生效规则。评审记录见 `docs/design/2026-10-11_design_ans-cli-pi-runtime-review.md`（结论：`needs revision`）。

## 四、待解决冲突与已裁定项

本节记冲突：**未解决的**逐条列；**已由客户裁定解决的**就地标注「已裁定」并指向生效规则所在处。

- **§2.6 创建权**：设计提出"角色与角色空间由 pm 创建"，与 SKILL.md「角色由 ANS Governance 创建」「角色从不创建自己」「不允许 blanket 授权」冲突。在 Governance 完成规则改动并经客户确认前，项目管理不假定该权限已存在。
- **调度记录归属（2026-10-11 已裁定，冲突已解决）**：早期设计让 CLI（编排）直接写 `docs/scheduling/<task-id>.md`，会绕过 `task_ops` 的校验与锁。**客户裁定「调度权归 pm」后已定**：目录 `docs/scheduling/` **归项目管理（pm）**（其 Section 1 已含该条目，`purpose: 任务调度记录（内容由 task_ops 写入）`）；**内容唯一写入者是 `task_ops`**（技能 `scripts/task_ops.py` + `coordination_store.py`，含 hash 链式机器段）；**编排不得直接写**（机制 `runRole`/`openRoleSession` 留编排，**权力**归 pm）。**使用约定**见 `docs/design/2026-10-11_design_scheduling-record-convention.md`。**注：调度「执行」路径不在 V1（设计 §3.7），本项只落约定与记录格式。**

## 变更记录

- 2026-10-11：首次建立，草稿。依已验收角色定义记录现状，区分已确认要求与未确认方案。来源：治理 bootstrap 后续的项目管理任务。
- 2026-10-11：§一.5 补记**首个跨角色共享组件** `src/common/shared/config-loader.ts` 与其**消费方更新规则**（装配/桌面只读导入、不复制第二份、`shared-components.md` 登记；逻辑由装配私有 `config-loader.ts` **搬迁**而非 fork）。依据：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.10。来源：T10 回报的共享阻塞裁决。
- 2026-10-11：**T11 落地后核对 §一.5**——搬迁已完成（`loadEffectiveConfig`/`enforcePinBackedAcceptance` 及全部依赖现于 `src/common/shared/config-loader.ts`，逐字等价；登记见 `docs/architecture/shared-components.md`），规则与实现一致；补记**过渡性「两处并存窗口」**（装配本地副本由 T12 删除；窗口内两份逐字相同、行为不分叉，非长期许可）。来源：T11（pm 执行）。
- 2026-10-11：**T6 落地后核对 §四「调度记录归属」**——该条原写「归属与分工待定」（已陈旧）；客户已裁定「调度权归 pm」，故把它改为**已裁定**并修好与 `docs/scheduling/` 归属/唯一写入者的一致性：**目录归 pm、内容唯一写入者 `task_ops`、编排不得直接写**，指针指向约定文档 `docs/design/2026-10-11_design_scheduling-record-convention.md`；如实标注**调度「执行」路径不在 V1**（设计 §3.7）。§四标题随之由「待解决冲突」改为「待解决冲突与已裁定项」。来源：本项目任务 T6。
- 2026-10-11：**T23 落地后核对 §一.5**——补记共享组件 `argv-primitives.ts`（argv 规范化 `normalizeArgv`，设计 §3.11 **行 7**，全仓**最后一处**跨角色镜像：编排写审计 ↔ 桌面呈现操作者所见，须**同源**），并把 §一.5「现有共享组件」清单补全为现行**四个**（`config-loader` / `path-primitives` / `runtime-shared` / `argv-primitives`）、消费方更新规则扩为「装配/桌面/编排/Pi适配器/门禁引擎只读导入」。**argv-primitives 消费方动作**：编排（`shell-gate.ts`）与桌面（`operator-channel.ts`）各自删本地 `normalizeArgv` 改导入（T21/T22），完成前处**过渡性「两处并存窗口」**（逐字相同、行为不分叉）。依据：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.11 行 7；登记见 `docs/architecture/shared-components.md` 组件 4。来源：本项目任务 T23。
- 2026-10-11：**T26 落地后核对 §一.5**——补记共享组件 `env-file.ts`（**`.env` 读写模块**：逐行只改相关键、原子写 temp+`rename`、凭据不回显；**`.env` 仍归装配、本模块为其指定写入者**，设计 §11，经 **Governance 记档 G-2**），并把 §一.5「现有共享组件」清单补为现行**五个**（`config-loader` / `path-primitives` / `runtime-shared` / `argv-primitives` / `env-file`）。**env-file 消费方**：**桌面应用**（T28 面板+载入/保存、T29 测试）**只读导入**，`.env` 读写逻辑**全仓唯一**（此前无任何此实现，不存在第二份）。依据：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §11；登记见 `docs/architecture/shared-components.md` 组件 5。来源：本项目任务 T26。
- 2026-10-11：**抽共享原子写原语后核对 §一.5**——补记共享组件 `atomic-write.ts`（跨角色共享**原子写**原语；对 rename 的 **Windows 瞬时 `EPERM`** 做**有界重试**；抽自 `env-file.ts` 与 **Pi适配器** `fs-write.ts` 两处同源写法，消除该处 §6 镜像），并把 §一.5「现有共享组件」清单补为现行**六个**（`config-loader` / `path-primitives` / `runtime-shared` / `argv-primitives` / `env-file` / `atomic-write`）。**atomic-write 消费方**：**`env-file.ts`**（`atomicWriteText` 已改委托 `atomicWrite`，签名/行为不变）与 **Pi适配器**（`fs-write.ts::atomicWriteFile` **待改导入**为 `atomicWrite(abs, data, { mode: 0o600 })`），完成前处**过渡性「两处并存窗口」**（两处 rename-重试语义**逐字同源**、行为不分叉）。依据：`角色卡/Pi适配器/changelog.md`（根因与量化证据）；登记见 `docs/architecture/shared-components.md` 组件 6。来源：本项目任务（pm：抽共享原子写原语）。
