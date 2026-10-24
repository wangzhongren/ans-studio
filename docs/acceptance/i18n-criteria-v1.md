# 验收完成标准：国际化（i18n，T2）——实施前标准 v1

- 风险档位：**T2（跨角色/接口/契约/shared 变更）**。本变更触及渲染层、主进程、共享元数据与新增 IPC 契约，不是 T1 局部实现；它不改变治理/权限/角色边界，因此不是 T3。若实施中出现改 shared 属主/角色边界、改治理权限、新增机器枚举、扩大 IPC/偏好契约或 CLI 纳入等情形，按 §六 升档；升档不降档。
- 判定依据：客户闸门 0/1/2 记录 `docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`（闸门 0/1/2 均已确认）；客户在闸门 1 确认的 i18n 方案 v1 `docs/planning/2026-10-23_design_i18n.md`（SHA-256 `844db4798033ba09d8a6c7d3d4eb49b6a90a37a7b803853e5771ed45e1146eac`）的 §4–§6、§9、§10、§11 P1–P12、§12–§14；闸门 2 确认的团队计划 `docs/scheduling/2026-10-23-i18n-team-plan.md`（SHA-256 `5ccc758fef0f900cc113cd82b51d9cfb722f9da9bd67790d03eefc5211c6551f`，blob `26dd276d2f3157986fefbfbcf3614d5cd0dd5d6b`）的 §1.2、§4、§5、§6、§7、§8、§9。本文件的 P1–P12 不得弱于方案 §11。
- 选定检查：受影响角色的单测/层测试（`test/项目管理/shared/`、`test/桌面UI/`、`test/桌面应用/interface.test.ts` 及条件精确文件）+ 跨层集成（主进程↔渲染层 IPC、shared 目录↔渲染层/主进程两个消费方）+ 真实 Electron（临时 userData）切换/重启/最小尺寸/200% zoom + `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` + `src/common/shared` 实际消费者重测；T2 不默认全量回归。
- 复用证据：仅同一候选、同一输入/依赖、同一命令、同一配置/夹具的证据可复用；候选、输入、依赖、契约、夹具或配置变化时，受影响证据失效，只补失效部分；不得跨候选复用，也不得用目录授权变更（T3）的证据替本变更背书。
- 全量回归：**N/A（T2 默认不全量回归）**。理由：本变更不改变治理/权限/角色边界，按 T2 执行受影响检查与消费者重测；若证据不足、候选不可复算、跨层结论不成立或触发升档条件，则升 T3 并执行适用全量回归，报告中记录理由；升档不降档。
- 任务 ID / flowId：`2026-10-23-i18n` / `i18n`。
- 标准路径 / 版本 / 日期：`docs/acceptance/i18n-criteria-v1.md` / **v1** / **2026-10-23**（实施前冻结）。
- 阶段与状态：**实施前完成标准**。本文件只建立标准，不判定候选；当前**未实施、未测试、未验收**，不声称任何能力已具备。
- 验收报告：**另写 `docs/acceptance/i18n-report-v1.md`，本文件不是报告**。报告由独立验收在实施后按本标准与统筹变更包判定，结论只能是通过/返工/证据不足。
- 适用变更：**仅变更 A（国际化，i18n，T2）**。变更 B（目录级授权 + 目录规范，T3）按 `docs/acceptance/directory-ownership-criteria-v1.md` 另行判定；两者不合并报告、不合并结论（见 §七）。

---

## 一、基线、版本冻结与范围

### 1.1 客户确认链与冻结版本

| 项 | 状态 | 记录与版本 |
| --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-10-23） | `docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`；SHA-256 `f3098298f19ef21db2d473b88321e7ac18df23fee0cbea3813ba55fcb5d776a6` |
| 闸门 1：方案确认 | 已确认（2026-10-23，客户选择「都确认，按推荐」） | i18n 方案 v1 `docs/planning/2026-10-23_design_i18n.md`；SHA-256 `844db4798033ba09d8a6c7d3d4eb49b6a90a37a7b803853e5771ed45e1146eac` |
| 闸门 2：角色指派/写集/顺序/验收安排 | 已确认（2026-10-23） | 团队计划 `docs/scheduling/2026-10-23-i18n-team-plan.md`；SHA-256 `5ccc758fef0f900cc113cd82b51d9cfb722f9da9bd67790d03eefc5211c6551f`；blob `26dd276d2f3157986fefbfbcf3614d5cd0dd5d6b`（与沟通记录一致） |
| 实施授权 | 已给（2026-10-23，沟通记录） | 同上文件「闸门 2 确认记录」；实施授权与闸门 2 分开记录 |
| 本验收标准 | 实施前写盘并冻结 | 本文件 v1（2026-10-23） |

本文件的验收基线是客户在闸门 1 确认的**方案 v1 内容**与闸门 0 的意图；团队计划只作范围、写集、阶段性、证据口径依据，不是标准来源。方案/计划文件头的历史状态字样若与沟通确认记录不一致，以 `docs/communication/` 的确认记录与冻结哈希为准（已知不一致见 §九）。

### 1.2 版本冻结与变更规则

- 本文件在实施开始前冻结为 v1；实施开始后，不得为迁就候选而改写标准、放宽或加严实质。
- 确需变更标准（例如客户改变范围、方案实质变更、发现标准本身不可执行）时：递增版本（v2…）、记录理由与受影响条目、交沟通/统筹确认，并重新核对受影响证据；未确认前仍按 v1 判定。
- 候选变化不改变标准；只使该候选上的证据失效，需按本文件重取。
- 本文件不是验收结论，也不是实施授权；任何通过/返工/证据不足结论只写在 `docs/acceptance/i18n-report-v1.md`。

### 1.3 本轮范围（仅列判定边界，不重复方案正文）

本轮判定覆盖：

- 单一消息目录与单一翻译实现：`src/common/shared/i18n/`（项目管理唯一写入），渲染层 facade `app/renderer/src/i18n/` 只再导出。
- 默认 `zh-CN`；新增 `en-US`；运行时切换；`<userData>/ans/preferences.json` 权威持久化与 `localStorage["ans.locale"]` 首屏镜像；重启保持；项目切换保持；缺失 key/参数回退与稳定诊断码；插值；复数（`Intl.PluralRules`）。
- 桌面渲染层用户可见 chrome 与聊天/面板文案；桌面主进程生成、最终显示给用户的文本（系统行、应用错误、对话框标题、窗口标题、设置元数据）。
- 共享设置元数据 `src/common/shared/runtime-settings.ts` 的 label/help/choiceLabels key 化，主进程解析，渲染层视图契约不变；`runtime-shared.ts` 的 `demo` 显示名走 key 或语言中性值。
- 英文变长布局：960×620、侧栏 208、标题栏 36px、设置保存条 64px、200% zoom；截断有 `title`/`aria`；真实 Electron 切换/重启证据。
- 机器标识不翻译；CLI、角色提示词、角色卡、系统提示、文档、模型输出本轮不翻译；旧 zh-CN 断言逐字不变；AST 硬编码守卫与允许清单逐批收紧。

**明确不在本轮判定为缺陷的边界**（依据方案 Q1–Q9 推荐 A 与团队计划 §1.3）：

- en-US 界面中项目 `roleId`（本仓库为中文）仍显示中文；只翻译内置治理角色标签。
- CLI（`src/index.ts`、`src/interface/cli/*`）仍为中文；en-US 用户使用 CLI 见到中文是已确认边界。
- 已持久化的系统行/会话历史/报告不随切换追溯翻译。
- 当前单窗口；多窗口联动测试 N/A（依据团队计划 §9.24），但广播通道代码与单窗口订阅须可见。

### 1.4 写标准时的只读基线（2026-10-23）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 当前 HEAD | `git rev-parse HEAD` | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1` |
| 工作树（写标准前） | `git status --short` | `M docs/communication/memo.md`、`M docs/planning/memo.md`；未跟踪 `.claude/`、`demos/`、`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`、`docs/planning/2026-10-23_design_i18n.md`、`docs/planning/2026-10-23_design_directory-ownership.md`、`docs/scheduling/2026-10-23-i18n-team-plan.md`、`docs/scheduling/2026-10-23-directory-ownership-team-plan.md`、`docs/scheduling/memo.md`；无已跟踪产品代码/测试改动 |
| 方案哈希 | `sha256sum docs/planning/2026-10-23_design_i18n.md` | `844db4798033ba09d8a6c7d3d4eb49b6a90a37a7b803853e5771ed45e1146eac` |
| 团队计划哈希 | `sha256sum docs/scheduling/2026-10-23-i18n-team-plan.md` | `5ccc758fef0f900cc113cd82b51d9cfb722f9da9bd67790d03eefc5211c6551f` |
| 团队计划 blob | `git hash-object docs/scheduling/2026-10-23-i18n-team-plan.md` | `26dd276d2f3157986fefbfbcf3614d5cd0dd5d6b` |
| 意图记录哈希 | `sha256sum docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md` | `f3098298f19ef21db2d473b88321e7ac18df23fee0cbea3813ba55fcb5d776a6` |
| Node 可用性 | `node --version` / `npm --version`；I3 基线 `environment.txt` | 写标准 shell PATH **未包含 Node**（`node: command not found`）；测试角色 I3 基线经 PATH 导入后记录 Node **v24.22.1** / npm **11.19.1**；实施/取证前须按团队计划 §1.4 加入 PATH 并记录实测版本，不得伪造输出 |
| 现有渲染层守卫 | `test/桌面UI/source-guard.test.ts` | 禁止渲染层 import `node:`/`electron`/`fs`/`path`/网络；只允许经 `lib/platform.ts` 访问 `window.desktop` |
| 共享依赖纯度 | `src/common/shared/runtime-shared.ts` | 顶层 import `node:os`/`node:path`；渲染层**不得**导入该文件；i18n shared 模块必须是纯模块 |
| 现有偏好先例 | `app/main.ts` | `<userData>/ans/runtime-selection.json` 等先例；当前**无** `preferences.json` |
| 现有窗口约束 | `app/main.ts` | 默认 1360×860；`minWidth: 960`、`minHeight: 620`；标题 `"ANS 桌面应用（受治理会话）"`；`dialog.showErrorBox("应用启动失败", ...)` |
| 现有设置保存条 | `app/renderer/src/shell/SettingsPanel.tsx` | 保存条固定 64px；面板为 Pi/Codex/Claude 三引擎 tab，当前无语言区 |
| 现有测试冻结中文 | `test/桌面UI/status.test.ts`、`role-view.test.ts`、`runtime-config.test.ts` | 如 `working.label === "工作中 · 2 待办"`、`roleDisplayName(null) === "未选择角色"`、`fieldLabelText(...) === "访问令牌 · 必填"` |

以上只读核对用于确认基线与约束；本文件写盘未改方案、计划、沟通记录、角色卡、产品源码或测试。

**写标准期间观察到的并发变化（非本验收写入）**：`角色卡/桌面窗口/boundary.md` 与 `changelog.md` 被修改（按闸门 2「授权人事补边界条目」，把 `test/桌面应用/acceptance-dispatch.test.ts`、`runtime-resolution.test.ts` 补入 Section 1）；新增未跟踪 `角色卡/测试/docs/change/2026-10-23-baseline-evidence/`（测试角色 I3 基线，含环境记录、`test/**/*.test.ts` 清单与基线日志）。I3 记录 `src/`、`app/`、`test/` 零改动，HEAD 与本文件一致。上述属于并发授权上下文，不纳入 i18n 产品候选；候选隔离按 §4.1 处理。

### 1.5 本文件不产生的授权

本文件不授权提交、推送、合并、发布，不授权派发 worker，不授权修改写集或档位。写标准只完成实施前验收准备；实施仍按闸门 2 确认的写集与团队计划阶段执行。

---

## 二、判定口径与证据规则

### 2.1 四种判断与报告表

每条验收项（P1–P12）只能判：

| 判断 | 含义 |
| --- | --- |
| `pass` | 当前候选满足该条标准，证据为该候选的原始、可复算证据 |
| `fail` | 已有证据表明不满足标准，或证据显示以弱化断言/超范围改动达到表面通过 |
| `insufficient evidence` | 缺少必要证据、证据属于另一候选/另一输入、无法复算、只给摘要、只凭自述，或关键结论无法成立 |
| `not applicable` | 该条对本轮范围不适用；必须写明依据（如 CLI 未纳入、多窗口当前不存在） |

验收报告 `docs/acceptance/i18n-report-v1.md` 的核心是逐项验收表，列至少为：

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1–P12 | 对应本文件条目与方案 §11 | 本文件要求的最低证据 | 原始输出/截图/几何/哈希路径 | `git hash-object` + `sha256sum` | 项目管理/桌面UI/桌面窗口/测试 | 实际观察摘要 | pass/fail/insufficient evidence/not applicable |

### 2.2 行为证据原则（不得以“字段齐全”代替实际行为）

- 文件存在、目录齐全、key 数量对、字段名齐全、测试文件存在，**只是必要条件，不是通过依据**。每条必须观察实际行为：翻译后的输出文本、回退结果、诊断触发、IPC 往返返回、偏好文件内容与重启后的行为、DOM `lang`、真实 Electron 的几何/截图、消费者测试的实际结果。
- 开发者自述、测试角色转述、工具“成功”、计划文字、截图缩略图、摘要，都不算原始证据；验收读取原始命令输出、文件哈希、diff/status、e2e 日志/截图/几何 JSON。
- 不得用“只跑了单测”代替跨层集成；不得用“只跑了 zh-CN”代替 en-US 行为；不得用“代码看起来已调用 `t()`”代替实际输出观察。
- 不得修改断言以保绿；不得跳过失败用例或把 `skip`/`todo` 计为通过；不得把失败归为“环境问题”而不做基线对照与分类。

### 2.3 证据有效性与复用

- 有效证据必须绑定：候选哈希（`git hash-object` + `sha256sum`）、命令、工作目录、环境（Node/npm、OS/Shell）、输入/夹具、退出码、测试计数（pass/fail/skip/todo）、失败原文。
- 同一候选、同一输入/依赖、同一命令、同一配置/夹具的证据可复用；以下任一变化使受影响证据失效：候选文件、依赖、契约、IPC/偏好格式、测试夹具、构建配置、locale 目录内容。
- 复用只补未失效部分；不得用其他变更（尤其目录授权 T3）的证据替本变更背书。
- 证据不足时，按 `references/testing.md` 升档补证；能建立结论的最低档优先，但升档不降档。

### 2.4 档位与检查面（T2）

- 默认检查面：受影响角色的单元/层测试 + 跨层集成（主进程↔渲染层 IPC；shared 目录↔渲染层、主进程两个消费方）+ 受影响的渲染构建/typecheck + 真实 UI（布局/切换/重启）+ `src/common/shared` 实际消费者重测。
- **不默认全量回归**；但不得以“T2 不全量”为由遗漏受影响调用方。
- 发现以下任一情形，停止并按升档处理，回报统筹/沟通：改 `src/common/shared/` 属主或角色边界；改治理/权限/角色定义；新增/修改 `cardKind`、`FlowStepKind`、`GovernancePower`、`GovernanceDecisionKind`；改 `src/model/**`、`src/service/**`、`src/provider/**`、`src/pipeline/**` 产品语义；偏好文件或 IPC 超出方案 §5.2/§5.3 契约（如系统行改 key+params、追溯历史）；CLI 纳入本轮；证据不足以建立跨层结论。

### 2.5 与目录授权（T3）的隔离

- 本变更与目录授权变更**分别闸门、分别实施、分别验收、分别报告**；本文件只判定 i18n。不得把两个变更合并为一个结论，不得用本文件的通过结论为目录授权 T3 背书，反之亦然。
- 本文件不改变闸门 2 确认的写集与档位；实施中若触碰共享文件（`app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`test/桌面应用/interface.test.ts`），按团队计划 §4.7 串行写入，候选隔离；并发写造成的混入按候选不可复算处理（证据不足/返工）。

### 2.6 无 task_ops

本项目没有 `.ans/project.json` 任务配置，未启用 task_ops。取证以文件哈希、原始命令输出、diff/status、跨层集成输出、真实 Electron 截图/几何、消费者重测清单为准；**不得伪造任务令牌、锁、审批、机器预检或 `docs/verification/` 记录**。

---

## 三、验收项 P1–P12

### 3.0 总表

| ID | 覆盖主题（方案 §11 条目） | 标准摘要 | 最低证据 | 产出角色 |
| --- | --- | --- | --- | --- |
| P1 | 单一目录/单一实现 | `src/common/shared/i18n/` 唯一目录与唯一 resolver；en-US 类型齐全；渲染层 facade 只再导出；项目管理唯一写入并登记共享组件 | 文件/目录 diff、facade 内容、parity/类型测试、typecheck、build、source-guard、共享组件登记 diff、哈希 | 项目管理、桌面UI |
| P2 | 运行时切换/持久化 | 设置可切换并立即生效；`preferences.json` 权威；localStorage 仅镜像；重启/项目切换保持；原子写/损坏降级；首次启动不写文件 | store/preferences/IPC 单测、真实 Electron 切换→重启→项目切换日志、偏好文件内容与哈希、localStorage 观察、临时 userData 路径 | 桌面窗口、桌面UI、测试 |
| P3 | 默认语言/渲染层消费/覆盖范围 | 默认 zh-CN 不跟随 OS；`document.documentElement.lang` 随 locale；渲染层经 facade 消费；AST 守卫与允许清单逐批收紧；范围外零误改 | resolveLocale 测试、lang 值、AST 扫描清单与允许清单 diff、守卫测试、import 扫描、diff | 桌面UI、项目管理 |
| P4 | 插值/复数/回退/诊断 | `{param}`、`Intl.PluralRules` 复数、en→zh→key 回退、缺失参数/缺 key 诊断稳定且不翻译 | 单元矩阵原始输出（存在/缺/非法/0/1/2/多）、诊断捕获、parity 输出、注入日志 | 项目管理 |
| P5 | 机器标识不变 | roleId/cardKind/GovernanceFunction/flow step id/事件/日志码/诊断码/协议字段/测试标识保持原样 | 范围外 diff、grep、相关测试/夹具输出、IPC 通道清单 | 项目管理、桌面窗口、桌面UI |
| P6 | 布局/截断/200% | en-US 在 960×620、侧栏 208、标题栏 36、保存条 64、200% zoom 无关键溢出；截断有 title/aria；按钮可操作 | 真实 Electron 几何 JSON、截图组、title/aria 清单、可点击性检查 | 桌面UI |
| P7 | zh-CN 逐字不变 | 迁移只 key 化；旧中文断言不改且通过；默认参数 zh-CN | 旧测试原始输出、测试 diff（无断言改写）、目录值对照、默认 locale 测试 | 项目管理、桌面UI、桌面窗口 |
| P8 | 主进程覆盖 | preferences IPC/preload、窗口标题、对话框、系统行、应用错误按 locale；外部错误原文保留；历史不追溯；既有 IPC 载荷形状不变 | `interface.test.ts` 等原始输出、preload/main diff、标题/对话框断言、系统行 e2e、历史切换测试 | 桌面窗口 |
| P9 | 共享元数据 | `RUNTIME_SETTINGS` label/help/choiceLabels key 化且仅一份；主进程解析；渲染层契约不变；字段集/必填/choices 不变；消费者重测 | runtime-settings diff、字段集对比、zh/en 视图测试、设置面板 e2e、消费者套件原始输出 | 项目管理、桌面窗口、测试 |
| P10 | 测试与证据 | 选定检查在当前候选全部执行；原始输出可复算；不弱化断言；e2e/typecheck/build 齐全 | 命令/退出码/环境/计数、失败原文、候选哈希、diff/status、证据清单 | 测试、统筹 |
| P11 | 非目标与范围外零改动 | CLI/提示词/文档/模型输出不翻译；治理/权限/边界/发布配置不改；无新依赖/新枚举 | 路径 diff、package.json diff、范围外文件哈希、grep、依赖清单 | 项目管理、桌面UI、桌面窗口 |
| P12 | 文档状态如实 | 实施/测试/验收状态区分；不把设计写成已实施；不提前声称 verified | 文档 diff、状态行、交付说明、报告路径分离 | 各实施角色、统筹 |

### 3.1 P1 单一消息目录与唯一实现（项目管理唯一写入；渲染层 facade 只再导出）

**标准**

- `src/common/shared/i18n/` 是唯一物理消息目录；`messages/zh-CN.ts` 为 key 全集参考；`messages/en-US.ts` 为 `Record<MessageKey, MessageTemplate>`，缺 key/多 key 编译失败；`translate`、插值、复数、回退、格式化只有一个实现，位于 shared。
- 渲染层 `app/renderer/src/i18n/index.ts` 只 `export ... from` shared（可加 `useT`/context 绑定与 locale-store），不得复制目录、插值/复数/回退实现或第二份 messages。
- 主进程、渲染层、CLI 均不维护第二份消息目录；CLI 未纳入时不得出现 `cli.*` 的消费实现。
- `src/common/shared/**` 的唯一写入者是项目管理；`src/common/shared/i18n/` 作为共享组件登记到 `角色卡/项目管理/docs/architecture/shared-components.md`。
- shared i18n 不依赖 Node/DOM/Electron；渲染层源码守卫继续通过。

**判定方法**

1. 用写前基线到候选的 `git diff --name-only` 与 `git status --short` 列出所有改动；核对 shared 目录改动只来自项目管理写集，渲染层 facade/store 在桌面UI 写集，主进程偏好/IPC 在桌面窗口写集。
2. 阅读 facade diff：只有再导出与渲染层 store/绑定；仓库内不存在第二份 `messages/`、第二份 `translate`/`Intl.PluralRules`/占位符替换实现（用 `rg` 扫描 `app/`、`src/` 中的 `PluralRules`、`missing-key`、`MessageTemplate` 等符号，确认只在 shared 实现）。
3. 运行 `npm run typecheck`、`npm run typecheck:renderer`；运行目录 parity 测试（遍历 `MessageKey` 断言 en-US 齐全、无多余 key）；运行类型负例测试（测试内类型断言或临时目录 `tsc`，**不得**为制造负例改动生产目录）。类型负例须证明“en-US 缺 key 不被类型系统接受”。
4. 运行 `test/项目管理/shared/` 下 i18n 测试与 `test/桌面UI/source-guard.test.ts`；运行 `npm run build:renderer`，确认 Vite 能解析并打包 facade→shared 相对导入（若失败且触发装配条件，按 §六/团队计划处理，记录 `vite.config.ts` 最小改动与闸门 2 条件参与）。
5. 核对 `角色卡/项目管理/docs/architecture/shared-components.md` 的登记 diff。

**最低证据**

- 写前基线哈希与候选哈希（所有新增/改动文件）；`git diff --name-only`、`git status --short`、`git diff --cached --name-only`（应为空）。
- facade 文件的完整 diff；共享目录文件清单；两次 `rg` 扫描的原始结果（无第二份 resolver/messages）。
- `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` 的原始输出、退出码、环境。
- parity 测试与类型负例测试的原始输出；`test/桌面UI/source-guard.test.ts` 原始输出。
- shared-components.md 登记 diff。

**判定**

- `pass`：上述检查全部满足当前候选，且 facade 无第二份实现、en-US 类型齐全可编译、shared 写入者与登记符合写集。
- `fail`：出现第二份目录/resolver/messages；en-US 缺 key 仍编译通过；渲染层复制翻译逻辑；非项目管理写入 shared；未登记共享组件；shared i18n 依赖 Node/DOM 导致守卫或构建失败。
- `insufficient evidence`：只给出文件存在/字段齐全；无 typecheck/build/parity 原始输出；无法从 diff/status 判断写入者；facade 内容未提供；类型负例未做或只凭口头描述。

### 3.2 P2 运行时切换与持久化（preferences.json 权威、localStorage 镜像、重启/项目切换保持）

**标准**

- 设置面板存在语言选择（zh-CN/English），切换后立即生效，无需重启。
- `<userData>/ans/preferences.json` 为权威，形状 `{ "version": 1, "locale": "zh-CN" | "en-US" }`；使用 `atomicWrite`；首次启动无偏好时不写文件（Q6 A），用户切换时写；文件损坏/不可读/非法 locale/不可写时回退 `zh-CN` + 稳定诊断，不阻塞启动。
- `localStorage["ans.locale"]` 仅作首屏镜像；启动顺序为读镜像→`preferences:get` 校正→订阅广播；文件与镜像不一致时以文件为准并回写镜像。
- 重启保持上次 locale；项目切换不清空 locale（设置视图状态可清空，但 locale 不清空）。
- 多窗口联动当前 N/A（单窗口）；但 `preferences:locale-changed` 广播与单窗口订阅代码须可见。

**判定方法**

1. 运行 preferences 模块单测（注入临时目录）：缺失文件、合法文件、损坏 JSON、非法 locale、未知 version、不可写/权限失败、原子写调用；断言不写项目 `.ans`/`.env`/治理账本。
2. 运行 `test/桌面应用/interface.test.ts` 中新增的 IPC/偏好断言：`preferences:get` 返回 `{version:1, locale, supported}`；`preferences:set-locale` 合法值持久化并广播；非法值 `{ok:false, locale:当前, error}` 且不改内存/文件；写失败返回 `ok:false`。
3. 运行渲染层 locale-store 测试：镜像读取、`preferences:get` 校正、订阅广播、切换失败回滚、IPC 不可用降级、`document.documentElement.lang` 更新。
4. 真实 Electron e2e（临时 userData；记录路径）：启动无偏好→默认 zh-CN 且无文件；切换 en-US→UI 立即变化→读取 `preferences.json` 确认 `{version:1, locale:"en-US"}`；关闭重启（同一临时 userData）→仍 en-US；项目切换→locale 不变；切回 zh-CN→重启仍 zh-CN；检查 localStorage 镜像值与文件一致。
5. 负例：损坏偏好文件后启动→zh-CN + 诊断且窗口可用；不可写目录→本次可切换、重启回旧值/默认、出现本地化“无法保存语言偏好”提示（或方案约定的降级行为）；非法 `setLocale` 不改文件。

**最低证据**

- 单测/层测试原始输出（命令、退出码、计数、失败原文）。
- e2e 日志：临时 userData 绝对路径、启动/切换/重启/项目切换的时间线、偏好文件内容与 SHA-256、localStorage 观察值、截图组。
- `preferences.json` 采样（路径 + 内容 + 哈希）；项目目录与仓库根无 `.ans`/`.env` 新写入的检查输出。
- 多窗口 N/A 依据（团队计划 §9.24）与广播代码/订阅代码位置。

**判定**

- `pass`：切换立即生效；文件内容/路径正确；重启与项目切换行为符合；镜像校正符合；损坏/不可写/非法值降级不阻塞且可观察；不写项目治理文件。
- `fail`：只改 localStorage 无文件持久化；重启回中文；项目切换重置；偏好损坏阻止启动；写入项目 `.ans`/`.env`/治理账本；跟随 OS 语言改变默认；`setLocale` 非法值被持久化或静默接受。
- `insufficient evidence`：无重启证据；无临时 userData 路径；只断言 UI 文本而未读文件；无损坏/不可写/非法值负例；多窗口结论无依据。

### 3.3 P3 默认语言、渲染层消费与覆盖范围（zh-CN 默认、en-US、facade、`document.documentElement.lang`）

**标准**

- `Locale` 仅为 `zh-CN`/`en-US`；`DEFAULT_LOCALE = "zh-CN"`；`resolveLocale` 只接受支持值，非法/缺失回退默认并记诊断；默认不跟随 OS 语言（不以 `app.getLocale()`/`navigator.language` 作为默认来源）。
- 渲染层组件/纯逻辑经 `app/renderer/src/i18n/` facade 消费；`document.documentElement.lang` 随当前 locale 更新（默认 `zh-CN`，切换 `en-US`）；`app/renderer/index.html` 静态默认保留 `lang="zh-CN"`。
- B1/B2 范围内的渲染层用户可见 chrome 与聊天/面板文案全部 key 化；AST 硬编码守卫在 B0 落地，允许清单逐批收紧；重复文案检查生效；范围外（模型输出、角色卡/提示词、测试夹具）未误改。

**判定方法**

1. 运行 `resolveLocale` 单测（合法/非法/缺失）；grep 主进程与渲染层确认默认来源不是 OS locale（`app.getLocale`/`navigator.language` 不作为默认）。
2. 真实 Electron e2e：默认启动后执行 `document.documentElement.lang` 观察为 `zh-CN`；切换 en-US 后为 `en-US`；重启后仍为 `en-US`；切回后为 `zh-CN`。
3. 运行 B0 落地的 AST 扫描/守卫测试：输出扫描清单（文件→中文字面量数量）、允许清单 before/after diff、失败用例（新增未允许中文字面量应失败）；核对每批完成时对应文件从允许清单移除。
4. 运行重复文案检查（长度 ≥4、非白名单的相同文案出现在不同 key 时应合并或记录理由）。
5. 扫描渲染层 import：组件只从 facade 消费；除 facade 外无 `src/common/shared/i18n` 直接导入；无第二份 messages。
6. 核对 B1/B2 文件清单的 diff 与扫描清单一致，未迁移文件仍在允许清单且未被误标为完成；范围外文件零改动（与 P11 交叉核对）。

**最低证据**

- `resolveLocale` 测试输出；OS locale 来源检查的 grep 输出。
- e2e 的 `document.documentElement.lang` 四个观察值（默认/切换/重启/切回）与截图。
- AST 扫描清单、允许清单 before/after、守卫测试原始输出、重复文案检查输出。
- 渲染层 import 扫描结果；B1/B2 diff 清单。

**判定**

- `pass`：默认与切换/重启的 `lang` 正确；默认不跟随 OS；facade 消费唯一；守卫落地且允许清单按批收紧；范围外零误改。
- `fail`：默认跟随 OS；`lang` 不更新或更新错误；组件直接复制/导入第二份目录；守卫未落地或允许清单未收紧；迁移范围外文案（模型输出/提示词/角色卡）。
- `insufficient evidence`：只有静态 `index.html` 的 `lang`，无运行时观察；无扫描清单/允许清单；只凭“组件已调用 t”无实际输出；e2e 未记录观察方式。

### 3.4 P4 插值、复数、回退与诊断

**标准**

- 插值 `{name}`：参数值 `String()`；缺失参数保留占位符原文并记 `i18n.missing-param`；不拼 HTML、不做 `dangerouslySetInnerHTML`。
- 复数：模板可为 `{one, other}` 等；用 `Intl.PluralRules(locale).select(count)`；zh 恒 `other`，en 按 `one/other`；变体缺失回退 `other`；参数必须含可格式化的 `count`。
- 回退顺序：当前 locale → `zh-CN` → key 本身；en-US 缺 key 回退中文并记 `i18n.missing-key`（warning）；zh-CN 也缺返回 key 并记 error；诊断码/字段不翻译。
- `resolveLocale` 非法 → `zh-CN` + `preferences.locale.invalid`；偏好文件损坏 → `zh-CN` + `preferences.read.invalid`。
- 新增文案的数字/日期使用 `Intl.NumberFormat`/`Intl.DateTimeFormat` 薄封装；不硬拼中文单位/千分位。

**判定方法**

1. 运行 shared i18n 单元矩阵（允许测试注入合成 catalog；不得为测试缺 key 改动生产目录）：
   - key 在 en-US 存在 → 返回 en-US 文案；
   - en-US 缺、zh-CN 有 → 返回 zh-CN 文案 + `i18n.missing-key`；
   - 两目录都缺 → 返回 key + `i18n.missing-key`；
   - 参数存在 → 正确替换；参数缺失 → 保留 `{param}` + `i18n.missing-param`；
   - 复数 0/1/2/多：en 选 `one/other`，zh 选 `other`；变体缺失回退 `other`；
   - 非法 locale → `zh-CN` + `preferences.locale.invalid`；
   - 损坏偏好 → `zh-CN` + `preferences.read.invalid`。
2. 校验诊断钩子记录 locale/key/param 且不翻译；生产目录 parity 测试零缺失；正常套件运行无 `i18n.missing-key`/`i18n.missing-param`。
3. 若 e2e 做 en-US 缺 key 回退，须使用测试注入（测试专用 catalog/替身），不得改生产 `en-US.ts`；记录注入方式与观察值。
4. 核对新增数字/日期文案调用封装（grep/测试），不硬拼单位。

**最低证据**

- 单元矩阵原始输出（用例名 + 实际返回值 + 诊断码）；诊断捕获输出。
- parity 测试输出；正常套件无缺失诊断的输出。
- e2e 注入日志（若做）或合成 catalog 测试代码与输出。
- 数字/日期封装使用检查结果。

**判定**

- `pass`：矩阵行为全部符合；回退与诊断稳定；生产目录零缺失；正常路径无缺失诊断。
- `fail`：缺 key 显示空白/抛错；回退顺序错误；复数选错变体；参数未替换/未诊断；诊断码被翻译；为测试缺 key 改生产目录。
- `insufficient evidence`：只测存在 key；无缺失/非法/复数矩阵；只看诊断码不看实际输出；无原始输出。

### 3.5 P5 机器标识不变（roleId、cardKind、GovernanceFunction、flow step id、协议字段、事件/日志/诊断码、测试标识）

**标准**

- 不国际化：`roleId`、`cardKind`、`GovernanceFunction`、`GovernancePower`、`GovernanceDecisionKind`、`FlowStepKind`、flow step id、`evidence.kind`、事件名、日志/诊断码、环境变量、文件路径、工具名、IPC 通道名（新增 `preferences:*` 除外）、协议字段、测试断言标识、fixture id。
- 项目 `roleId` 在 en-US 界面仍显示原值（本仓库为中文）；只翻译内置治理角色标签。
- 测试名称/fixture id/断言标识保持原样；新增 en-US 测试独立命名（如 `... en-US`），不改旧标识。

**判定方法**

1. 对照写前基线，检查 `src/model/**`、`src/common/门禁引擎/**`、`src/pipeline/**`、`src/service/**`、`src/provider/**`、`src/index.ts`、`src/interface/cli/*` 的 diff 为零（CLI 未纳入）。
2. 扫描两类错误：目录 key 或文案中出现机器标识作为 key 片段（如 `ui.role.编排`）；渲染层/主进程把 `cardKind`/`GovernanceFunction`/flow step id/事件码/诊断码映射成人类文案后回写协议。
3. 运行相关治理/协议/角色测试与夹具测试；对比 fixture 与 IPC 通道清单（既有通道名不变，只新增三个 preferences 通道）。
4. 检查测试文件 diff：既有测试标题、fixture id、断言标识未被改名；新增断言只增不改。
5. 在 en-US e2e 中观察普通角色显示名仍为 `roleId` 原值；内置治理角色标签为英文。

**最低证据**

- 范围外目录/文件 diff（零改动）与哈希。
- grep 原始结果（机器标识未出现在目录 key/翻译值；协议回写未被本地化）。
- 相关测试/夹具原始输出；IPC 通道清单 diff；测试标题/标识 diff。
- en-US 角色名观察截图/文本。

**判定**

- `pass`：机器标识与协议字段原样；测试标识不改；en-US 下 `roleId` 原值；仅新增约定的 preferences 通道。
- `fail`：翻译/改名 roleId、cardKind、GovernanceFunction、flow step id、事件/日志/诊断码、协议字段或测试标识；把机器值映射后回写；测试改名导致旧断言失效。
- `insufficient evidence`：无范围外 diff/哈希；只声明“没改”无证据；未检查协议回写与测试标识。

### 3.6 P6 英文布局（960×620、侧栏 208、200% zoom、截断 title/aria）

**标准**

- en-US 在最小窗口 960×620、侧栏宽 208、标题栏 36px、设置保存条 64px 下无关键溢出/裁切；200% zoom 下重复检查。
- 主区域无水平滚动：`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`。
- 关键容器（titlebar、sidebar、header、settings save bar、confirm card、drawer tabs）`scrollWidth <= clientWidth + 1`；允许有意的内部滚动容器，但须可见/可操作并记录。
- 被截断文本必须有 `title` 或 `aria-label`；关键操作按钮文字不被裁切、可点击区域不被遮挡；允许非关键文本换行，换行后容器增高/可滚动而非裁切。
- 不为英文单独写一套布局；同一布局兼容 zh-CN/en-US。

**判定方法**

1. 真实 Electron e2e（临时 userData）：加载 en-US；将窗口设为 960×620（或最小尺寸）；将侧栏设为 208（通过合法视图偏好或 UI 调整，记录方式）；执行几何断言（`scrollWidth/clientWidth`、`getBoundingClientRect`、`elementFromPoint` 检查关键按钮中心命中）。
2. 以 `webContents.setZoomFactor(2)` 重复同一组几何断言；记录 zoomFactor、devicePixelRatio、窗口内容尺寸。
3. 枚举被截断元素（比较 `scrollWidth > clientWidth` 或 CSS 省略号），核对其 `title`/`aria-label`；列出关键操作按钮及其 rect/可见性。
4. 截图：en-US 默认尺寸、960×620 + 侧栏 208、200% zoom；附 zh-CN 对应截图作对照。
5. 若设计允许换行，断言换行后容器高度增长或内部滚动可见，而不是裁切；若必须改固定高度/最小窗口/侧栏，停止并按团队计划 UIUX/客户条件处理（不在本文件放宽）。

**最低证据**

- 几何 JSON/日志：窗口尺寸、zoomFactor、sidebar 宽度、`scrollWidth/clientWidth` 值、关键容器/按钮 rect、`elementFromPoint` 结果；每条带候选哈希与临时 userData 路径。
- 三组 en-US 截图 + zh-CN 对照；截图路径与生成命令。
- 截断元素与 `title`/`aria-label` 对照清单。

**判定**

- `pass`：两种 zoom 下几何断言满足；关键容器无溢出；截断有 title/aria；按钮可操作；截图可核对。
- `fail`：保存按钮被挤出；tab/徽标裁切无 title；200% 下无法操作；主区域水平滚动；为英文改设计基线未经确认。
- `insufficient evidence`：只有截图缩略图无几何数据；未记录窗口/zoom/sidebar；只测 100% zoom；只测默认窗口未测 960×620/208；无候选哈希/临时 userData。

### 3.7 P7 zh-CN 输出逐字不变、旧断言不改

**标准**

- 迁移只做 key 化，不改 zh-CN 文案；旧测试中的中文断言逐字不变并通过；纯逻辑函数的 `locale` 参数默认 `DEFAULT_LOCALE`（zh-CN），现有调用不传 locale 时输出与现状一致。
- 若某条中文必须改写（例如英文语法拆句），须按方案 §7.4 作为单独小批记录、更新对应测试并说明，不混入 key 化批；未记录/未批准的改写视为 `fail`。
- 新增 en-US 断言独立命名；不把 zh 断言改成 en-US 或弱化。

**判定方法**

1. 写前基线（I3）记录受影响测试文件的 `git hash-object`、`sha256sum` 与原始输出；候选后 `git diff` 既有测试文件，检查被删除/修改的期望中文行：应仅在新增测试/新增 en-US 断言/导入调整，不得改写既有期望。
2. 对照目录：旧代码中的中文字面量迁移到 zh-CN 目录时值必须逐字相同；抽查关键文案（标题栏、设置保存条、状态徽标、确认卡、系统行、错误提示）并给出旧字符串→目录 key→值的对照。
3. 运行受影响旧测试（`test/桌面UI/`、`test/桌面应用/` 精确文件、`test/项目管理/shared/`、`test/测试/` 相关套件），记录测试名称/计数/失败原文；与基线对照，新增失败必须分类。
4. 真实 Electron 默认 zh-CN 截图/文本观察与基线对照（关键页面标题、按钮、状态、保存条、确认卡）。

**最低证据**

- 基线测试文件哈希与原始输出；候选 diff 中既有断言零改写的证据（`git diff -U0` 片段）。
- 旧字符串→key→zh-CN 值对照表（抽查 + 守卫/测试覆盖）。
- 旧测试原始输出与基线对照；zh-CN e2e 截图。
- 若有改写：单独批次记录、对应测试更新说明与批准依据；否则不纳入。

**判定**

- `pass`：既有中文断言零改写且通过；目录值与旧文案一致；默认 zh-CN 输出一致；新增 en-US 断言独立。
- `fail`：为保绿改写/删除旧中文断言；顺手润色中文导致断言变化且无记录；默认输出变化；把旧测试改成 en-US。
- `insufficient evidence`：只跑新测试未跑旧测试；无基线输出；只声明“没改”无 diff；改写有记录但无批准依据（按 fail/需回报处理）。

### 3.8 P8 主进程覆盖（preferences IPC/preload、窗口标题、对话框、系统行、历史不追溯）

**标准**

- `preferences:get`、`preferences:set-locale`、`preferences:locale-changed` 三通道按方案 §5.3 工作；preload 只新增 `getPreferences`、`setLocale`、`onLocaleChanged` 三个白名单方法；渲染层 `DesktopBridge` 类型同步；既有 IPC 载荷形状不变。
- 主进程生成、用户可见的文本按当前 locale：系统行、派发失败/未受理原因、写卡反馈、验收推进提示、会话历史错误、应用错误、对话框标题（导入项目、选择图片）、窗口标题、启动错误框。
- 外部错误（Provider/SDK/文件系统）原文作为参数保留，外面套本地化前缀/后缀；稳定错误码不翻译。
- 历史不追溯：切换语言后，已持久化的系统行/会话历史/报告保持生成时语言；新生成文本使用新语言。
- 历史切换测试覆盖“旧行不变、新行变”。

**判定方法**

1. 运行 `test/桌面应用/interface.test.ts`（及方案 B3/B4 使其断言受影响的既有精确文件）：偏好 IPC 形状/校验/持久化/降级；主进程文本在 zh-CN 输出与基线逐字一致、在 en-US 输出正确；外部错误原文保留；错误码断言。
2. preload diff：只新增三个方法；`app/renderer/src/lib/platform.ts` 类型同步；grep 确认无其他新通道/无宽泛 `ipcRenderer` 暴露。
3. 窗口标题：通过主进程测试或 e2e `win.getTitle()` 观察 zh-CN/en-US；对话框：通过注入 `pickDirectory`/`pickImageFileFn` 或测试替身断言标题参数按 locale；启动错误框：检查使用持久化 locale，读不到时 zh-CN。
4. 真实 Electron e2e：切换 en-US 后触发一个用户可见主进程文本（如派发失败系统行/应用错误），观察英文；切回 zh-CN 后新文本中文；既有历史行保持切换前语言；重启后窗口标题/对话框标题为 en-US。
5. diff 检查既有 IPC 载荷/协议字段零变化；`app/desktop/governance-advance.ts` 只改用户可见系统行/提示，发给 agent 的任务文案不改（人工 diff 核对）。

**最低证据**

- `interface.test.ts` 等原始输出（命令、计数、失败原文）；zh 基线对照；en-US 断言。
- preload/main/platform diff；IPC 通道清单；窗口标题/对话框标题观察值。
- 系统行 e2e 日志与截图；历史切换前后对照；外部错误原文保留的测试输出。
- 既有 IPC 载荷形状 diff（零变化）与 agent 任务文案零改动 diff。

**判定**

- `pass`：三通道工作、preload 白名单精确、标题/对话框/系统行按 locale、外部原文保留、历史不追溯、既有载荷不变。
- `fail`：主进程仍硬编码中文系统行；切换后新系统行仍旧语言；把 SDK 错误机翻；新增宽泛 IPC 暴露；改既有协议载荷；翻译 agent 任务文案。
- `insufficient evidence`：只测渲染层未测主进程；无标题/对话框观察；无历史切换证据；无 preload diff；只凭代码阅读。

### 3.9 P9 共享元数据 key 化与消费者重测（`RUNTIME_SETTINGS`）

**标准**

- `src/common/shared/runtime-settings.ts` 的 `label`/`help`/`choiceLabels` 改为 key 字段（或等价 key 表达），不再由共享模块直接携带唯一中文文案；主进程在构造设置视图时用当前 locale 的 `t` 解析回 `label`/`help`/`choiceLabels` 推给渲染层；渲染层视图契约不变。
- 字段 key 集、必填、choices、`fallbackKeys`、`secret` 语义不变；`RUNTIME_SETTINGS` 的字段集/必填/choices 与基线一致。
- `runtime-shared.ts` 的 `demo: "演示"` 改为 key 或语言中性值；Pi/Codex/Claude 品牌名不变；渲染层不得导入 `runtime-shared.ts`（其顶层 `node:os`/`node:path`）。
- 所有实际消费者重测通过：`app/desktop/pi-config.ts`、`app/desktop/runtime-config.ts`、`app/desktop/runtime-resolution.ts`、`src/model/runtime.ts`、`src/common/装配/runtime.ts`、`src/index.ts`/CLI（只读导入、typecheck）、`src/provider/runtime/*`、`src/common/编排/*` 等导入 shared 的模块；测试至少含 `test/项目管理/shared/runtime-settings.test.ts`、`runtime-shared.test.ts`、`test/桌面应用/multi-runtime.test.ts`、`pi-config.test.ts`、`test/测试/g5-reasoning-verify/f-settings.test.ts`、`t29-pi-config-roundtrip.test.ts`、`turn-watch-verify/c-cross-runtime-settings.test.ts`、`test/装配/multi-runtime.test.ts`、`test/编排/*` 相关套件。

**判定方法**

1. diff `runtime-settings.ts`/`runtime-shared.ts`：确认中文 label/help/choiceLabels 不再作为第二份唯一来源；key 在 zh-CN/en-US 目录中存在；字段机器键/必填/choices/fallback/secret 未变。
2. 运行字段集对比测试/脚本：基线字段集 vs 候选字段集（键、必填、choices、secret、fallbackKeys）一致；`getRuntimeSettingsDefinition` 行为一致。
3. 主进程视图测试：注入 zh-CN/en-US 构建 `getRuntimeConfig`，断言 `label/help/choiceLabels` 已本地化且形状与基线渲染层契约一致；渲染层现有测试不改字段名。
4. 真实 Electron：设置面板在 zh-CN 与 en-US 下打开，字段 label/help/choices 正确；截图对照。
5. 消费者重测命令按 §四.6 逐一执行，记录计数/失败分类；对照基线确认无新增失败。

**最低证据**

- `runtime-settings.ts`/`runtime-shared.ts` diff；目录中对应 key；字段集对比输出。
- zh/en 主进程视图测试原始输出；设置面板 e2e 截图。
- 消费者套件原始输出清单（命令、计数、失败原文）；基线对照。
- 渲染层未导入 `runtime-shared.ts` 的扫描结果。

**判定**

- `pass`：只有一份元数据文案；key 化且主进程解析；字段集/必填/choices 不变；渲染层契约不变；消费者全部重测通过。
- `fail`：渲染层仍显示中文 label；字段集变化；`RUNTIME_SETTINGS` 出现两份文案；渲染层导入 `runtime-shared.ts`；消费者漏测或新增失败。
- `insufficient evidence`：只改字段未跑消费者；只测设置面板未核对字段集；无 zh/en 视图输出；未证明无第二份文案。

### 3.10 P10 测试与证据（选定检查、原始输出、不弱化断言）

**标准**

- §四 选定的受影响单测/层测试、跨层集成、真实 Electron、typecheck/build、消费者重测全部在当前候选上执行；命令、退出码、环境、计数、失败原文可复算。
- 不以只跑单测代替集成/e2e；不跳过失败用例；不把 `skip`/`todo` 无理由计为通过；不修改断言以保绿；不伪造输出。
- 证据包含候选哈希、diff/status、证据路径；摘要不能代替原始输出。
- T2 不默认全量回归；若升档，记录全量回归命令与输出。

**判定方法**

1. 核对变更包中的命令清单与 §四.2 对照：受影响角色套件、`i18n-integration.test.ts`、真实 Electron smoke、`npm run typecheck`、`typecheck:renderer`、`build:renderer`、消费者清单。
2. 抽查证据：命令是否在候选上执行、退出码是否为 0、测试计数与失败原文是否齐全；用候选哈希复算文件身份。
3. 检查测试 diff 是否存在删除断言、放宽比较、跳过用例、改 fixture 以适配失败；存在则 `fail`。
4. 检查失败分类：新增失败 vs 基线既有失败 vs 环境不可用；新增失败未修复为 `fail`；环境不可用但无替代证据为 `insufficient evidence`。
5. 若升档，核对全量回归命令、范围、输出与理由。

**最低证据**

- 完整命令清单与原始输出（含 cwd、环境、Node/npm、退出码、计数、失败原文）。
- 候选哈希清单、`git status --short`、`git diff --name-only`、`git diff --cached --name-only`。
- 测试 diff（无弱化）与失败分类表。
- 升档时的全量回归输出与理由（如适用）。

**判定**

- `pass`：选定检查齐全、原始输出可复算、无弱化断言、无新增失败。
- `fail`：只跑单测/跳过 e2e；改断言保绿；伪造/转述输出；新增失败未处理；候选哈希不可复算。
- `insufficient evidence`：输出缺失/摘要化；环境不可用且无替代；命令与候选不匹配；证据路径不可打开。

### 3.11 P11 非目标与范围外零改动（CLI/提示词/文档/模型输出/治理/依赖）

**标准**

- CLI 本轮不翻译：`src/index.ts`、`src/interface/cli/*` 零改动（en-US 用户见中文是已确认边界）。
- 角色提示词、角色卡文本、系统提示、工程法案、文档、README、`site/`、发布说明、模型输出、卡片标题/预览/报告正文/flow 标题/任务文本不翻译、不改写。
- `src/model/**`、`src/common/门禁引擎/**`、`src/pipeline/**`、`src/service/**`、`src/provider/**` 零改动；`roleId`/`cardKind`/`GovernanceFunction`/`FlowStepKind`/`GovernancePower`/`GovernanceDecisionKind` 不新增/不修改。
- 不改治理/权限/角色边界；不改 `package.json`（不新增依赖）；默认不改 `vite.config.ts`/`tsconfig.json`/`app/renderer/tsconfig.json`（仅 B0 解析失败且闸门 2 条件确认时由装配最小改动并记录）；不改发布配方/冻结源。
- 角色卡侧仅允许 `角色卡/项目管理/docs/architecture/shared-components.md` 的登记与各角色 `docs/change/...-evidence/` 证据；不得改 `boundary.md`/`boundary.yaml`/`role-card.md`。
- 管理记录（`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`）不混入产品候选；不写 `docs/verification/`。

**判定方法**

1. 对照写前基线，列出候选 `git diff --name-only`；逐路径核对是否在闸门 2 写集/允许文档/证据目录；范围外路径必须零改动。
2. 对比 `package.json` diff（应为空）；列出新增依赖（应为零）；检查 `vite.config.ts`/tsconfig diff（默认空；若条件触发，核对闸门 2 条件确认记录与最小改动）。
3. grep/扫描提示词与角色卡文本是否被翻译或进入目录；检查 `src/common/门禁引擎/governance-roles.ts`、`src/pipeline/orchestration/govern-session.ts` 零改动。
4. 检查治理枚举/协议字段/flow step id 无新增/改名；检查发布配方/冻结源零改动。
5. 检查 `角色卡/*/boundary.md`、`boundary.yaml`、`role-card.md` 零改动；证据目录仅为截图/日志。

**最低证据**

- 写前基线哈希 + 候选路径 diff；范围外文件哈希对照（零变化）。
- `package.json` diff；依赖清单；构建配置 diff。
- 提示词/角色卡/治理文件 grep 与 diff；枚举/协议清单。
- 角色卡边界文件零改动证据；证据目录内容清单。

**判定**

- `pass`：范围外零改动；无新依赖/新枚举/治理变更；CLI/提示词/文档/模型输出未翻译。
- `fail`：顺手改治理/边界/测试/发布配置；新增依赖或枚举；翻译提示词/角色卡/文档/模型输出；CLI 被纳入但未经闸门。
- `insufficient evidence`：无基线/路径 diff；只声明“未改”；无法区分管理记录与产品候选。

### 3.12 P12 文档状态如实（实施/测试/验收状态区分）

**标准**

- 实施文档/变更记录/状态行如实标注 `implemented-unverified`（实现完成但未验收）或等价状态；未验收前不得写 `verified`、不得声称“已支持 i18n/已完成国际化”。
- 方案仍是设计候选（客户确认的是方案 v1 内容，但方案文件头的历史状态字样不改成实施结果）；实施记录、测试证据、验收报告分别存放、互相链接，不混为一份。
- 不把计划写成结果；不写 `docs/verification/` 伪造记录；验收报告只能由独立验收写 `docs/acceptance/i18n-report-v1.md`。
- 若某批未做/未测，如实写“未做/未测”；不用“尚未实施或测试”绕开具体状态。

**判定方法**

1. 阅读各角色 `docs/change/` 记录与状态行，核对是否写 `implemented-unverified`、是否声明已验证；与 `i18n-report-v1.md` 是否存在的状态分离。
2. 检查文档中的链接指向实际证据路径；检查没有把设计候选写成已实施；检查没有伪造 `docs/verification/`。
3. 检查交付说明/变更包是否区分方案、实施、测试、验收四个状态；是否列出未完成项与证据不足项。
4. 检查验收报告是否由独立验收产出，而非实施角色自评。

**最低证据**

- 文档 diff 与状态行原文；变更包/交付说明；证据链接清单。
- 报告路径与作者记录（独立验收）；未实施/未测声明。

**判定**

- `pass`：状态如实、文档分离、链接有效、无提前 verified。
- `fail`：声称“已支持/已验证”但无验收；把设计写成实施；实施角色自写验收结论；伪造 verification 记录。
- `insufficient evidence`：无文档/状态行；无法区分状态；链接失效。

### 3.13 覆盖对照（任务要求 → 验收项）

| 要求主题 | 落点 |
| --- | --- |
| 单一 shared 消息目录 / 项目管理唯一写入 | P1 |
| zh-CN 默认与 en-US | P3（默认/支持集）、P4（目录/回退） |
| 缺失 key/参数回退与诊断 | P4 |
| 插值/复数 | P4 |
| 运行时切换与 `<userData>/ans/preferences.json` 持久化/重启恢复/localStorage 镜像 | P2 |
| preferences IPC/preload/窗口标题/对话框/系统行 | P8（P2 覆盖持久化侧） |
| 渲染层 facade 与 `document.documentElement.lang` | P1（facade）、P3（lang） |
| 不国际化机器标识/协议/日志码/测试标识 | P5 |
| CLI/角色提示词/文档本轮不翻译 | P11 |
| 旧 zh-CN 断言逐字不变 | P7 |
| 英文布局 960×620、侧栏 208、200% zoom 无关键溢出/截断有 title/aria | P6 |
| 真实 Electron 切换/重启证据 | P2（切换/重启）、P6（布局/zoom）、P10（证据完整性） |
| 共享元数据 `runtime-settings` key 化且消费者重测 | P9 |

---

## 四、证据计划

### 4.1 候选身份、基线与环境

- 写前基线：`git rev-parse HEAD`、`git status --short`、目标文件 `git hash-object` + `sha256sum`；实施阶段入口记录一次，每批入口记录受影响文件基线。
- 候选身份：所有新增/改动文件（产品代码、测试、目录、配置）的 `git hash-object` 与 `sha256sum`；CRLF/LF 差异分别记录，不互相误判。
- 改动范围：`git diff --name-only` 与 `git status --short` 必须落在写集内；`git diff --cached --name-only` 为空（不暂存）；无授权外已跟踪变化。
- 环境：Node/npm 实测版本、OS/Shell、命令工作目录；当前 shell PATH 无 Node 时先按团队计划 §1.4 加入并记录，不得伪造。
- 候选隔离：本变更候选只列相对本变更阶段入口基线变化的路径；目录授权 T3 的既有改动声明为「既有上下文」，不纳入本变更候选；共享文件按团队计划 §4.7 串行写入。
- I3 基线证据：`角色卡/测试/docs/change/2026-10-23-baseline-evidence/`（环境、test 清单、受影响套件与全量基线日志）用于失败分类与既有失败对照；它不是 i18n 实施的通过证据，也不能替代当前候选的复跑。T2 的 `full-regression-serial.log` 只作基线对照，不因存在该日志而把全量回归改为默认要求。

### 4.2 命令清单（最低要求，实际以仓库脚本/runner 为准）

| 范围 | 命令 | 产出角色 |
| --- | --- | --- |
| shared 目录/回退/守卫 | `node --test "test/项目管理/shared/**/*.test.ts"`（至少含 `i18n.test.ts`、`i18n-guard.test.ts`、`runtime-settings.test.ts`、`runtime-shared.test.ts`） | 项目管理 |
| 渲染层单测/层测试 | `node --test "test/桌面UI/**/*.test.ts"` | 桌面UI |
| 渲染 typecheck/build | `npm run typecheck:renderer`、`npm run build:renderer` | 桌面UI |
| 主进程 Interface/偏好 IPC | `node --test test/桌面应用/interface.test.ts`（+ 条件精确文件：`multi-runtime.test.ts`、`pi-config.test.ts`、`session.test.ts`、`dispatch-delivery.test.ts`、`composer-images.test.ts`、`operator-channel.test.ts`，仅当受影响） | 桌面窗口 |
| 根 typecheck | `npm run typecheck` | 桌面窗口/项目管理/装配条件 |
| 跨层集成 | `node --test test/测试/i18n-integration.test.ts` | 测试 |
| 真实 Electron 冒烟 | `node test/桌面UI/i18n-electron-smoke.mjs`（临时 userData；切换/重启/最小尺寸/200% zoom/几何/截图） | 桌面UI |
| 真实 Electron 总自检（条件） | `node test/桌面应用/e2e/main.mjs`（仅当总自检需扩展） | 桌面窗口 |
| 构建解析（条件） | `npm run dev:renderer` 加载验证（仅装配条件触发时） | 装配 |
| 消费者重测 | 见 §4.6 | 测试 |

命令若因仓库实际脚本/runner 不同而调整，须在变更包中记录实际命令、原因与等价性；不得用不可运行的示例命令冒充结果。

### 4.3 原始输出要求

每项检查记录：命令原文、工作目录、环境（Node/npm、OS/Shell）、退出码、测试计数（pass/fail/skip/todo）、失败原文（不截断关键堆栈）、执行时间；跳过项写明原因。只给“全部通过”摘要不算原始证据。截图/几何文件附生成命令、候选哈希、窗口尺寸/zoom、临时 userData 路径。

### 4.4 文件哈希与 diff/status

- 每个候选文件：`git hash-object <path>` + `sha256sum <path>`；新增文件同。
- `git status --short`、`git diff --name-only`、`git diff --cached --name-only`；逐路径核对写集。
- 范围外文件（`src/model/**`、`src/common/门禁引擎/**`、`src/pipeline/**`、`src/service/**`、`src/provider/**`、`src/index.ts`、`src/interface/cli/*`、`package.json`、发布配方、角色卡边界）记录基线/候选哈希对照，证明零改动。
- 测试 diff 用 `git diff -U0` 片段证明既有中文断言未被改写。

### 4.5 截图/几何

- 三组 en-US：默认尺寸、960×620 + 侧栏 208、200% zoom；一组 zh-CN 对照；设置面板 zh/en；确认卡/抽屉/保存条等关键区域。
- 几何输出：`document.documentElement` 的 `scrollWidth/clientWidth`；关键容器 `scrollWidth/clientWidth`；关键按钮 `getBoundingClientRect` + `elementFromPoint`；截断元素与 `title`/`aria-label` 对照；窗口尺寸、sidebar 宽度、zoomFactor。
- 截图/日志路径按团队计划：桌面UI `角色卡/桌面UI/docs/change/2026-10-23_change_i18n-evidence/`；测试角色 `角色卡/测试/docs/change/`；不写 `docs/verification/`。

### 4.6 消费者重测清单（`src/common/shared` 实际消费者）

至少包含：

- 项目管理：`test/项目管理/shared/runtime-settings.test.ts`、`runtime-shared.test.ts`、`i18n.test.ts`、`i18n-guard.test.ts`。
- 桌面窗口：`test/桌面应用/multi-runtime.test.ts`、`pi-config.test.ts`、`interface.test.ts`，以及 B3/B4 使其断言受影响的既有精确文件。
- 跨角色/装配/编排：`test/测试/g5-reasoning-verify/f-settings.test.ts`、`test/测试/t29-pi-config-roundtrip.test.ts`、`test/测试/turn-watch-verify/c-cross-runtime-settings.test.ts`、`test/装配/multi-runtime.test.ts`、`test/装配/governance-model-injection.test.ts`、`test/编排/finalize.test.ts`、`test/编排/installed-skills.test.ts`、`test/编排/handback-lifecycle.test.ts`、`test/编排/runtime-orchestration.test.ts`。
- 其他实际导入 shared 的套件（以实施前 `rg` 扫描 `src/`、`app/` 的导入清单为准，如 `test/pi-adapter/*`、`test/runtime-core/*`、`test/服务/*` 中实际受影响者）；扫描清单与套件映射须写入变更包。

消费者重测须记录：导入点、受影响 shared 模块、命令、计数、失败分类；不得只列“已重测”。

### 4.7 真实 Electron 要求

- 使用临时 userData（记录绝对路径），不写真实用户目录/仓库根 `.env`；不依赖真实模型凭据；离线可运行。
- 覆盖：默认 zh-CN → 切换 en-US → 立即生效 → 重启仍 en-US → 切回 zh-CN → 项目切换 locale 不变 → en-US 缺 key 回退（测试注入或合成 catalog）→ 960×620/侧栏 208/200% zoom 几何 → 截图组。
- 记录 Electron 版本、窗口尺寸、zoomFactor、sideBar 宽度、临时 userData、候选哈希；截图/几何不能只有缩略图或口头摘要。
- 如果真实 Electron 因环境不可用无法执行，按 `insufficient evidence` 处理，不得以单测替代布局/切换/重启结论；记录环境边界。

### 4.8 证据路径与禁止事项

- 证据路径按团队计划 §6.4：桌面UI/桌面窗口/测试角色的 `角色卡/<role>/docs/change/...-evidence/`；`docs/acceptance/` 只放标准与报告；管理记录不混入产品候选。
- 禁止：伪造命令/输出/令牌/锁/审批；改断言保绿；跳过来源；把设计/计划写成已实施；把摘要当原始证据；用目录授权 T3 证据替本变更背书；写 `docs/verification/`。

---

## 五、成功、失败与边界情形（判定观察点）

| 情形 | 预期观察 | 判定 |
| --- | --- | --- |
| 首次启动无偏好 | 默认 zh-CN；不写 `preferences.json` 直到用户切换 | P2 pass 观察点；写文件且无记录 → 与 Q6 A 不符，需说明 |
| 偏好文件损坏/不可读 | zh-CN + `preferences.read.invalid`；窗口可用；不阻塞启动 | 阻塞/崩溃 → P2 fail |
| 偏好文件不可写 | 本次运行可切换；重启回默认/旧值；本地化“无法保存语言偏好”提示 | 静默失败或崩溃 → P2 fail/证据不足 |
| 非法 locale（文件或 `setLocale`） | 文件值回退/规范化 zh-CN + `preferences.locale.invalid`；`setLocale` 返回 `ok:false` 且不改内存/文件 | 接受非法值/写坏文件 → P2 fail |
| en-US 缺 key、zh 有 | 显示 zh-CN + `i18n.missing-key` warning；测试注入或合成 catalog | 空白/抛错 → P4 fail |
| 两目录都缺 key | 显示 key + `i18n.missing-key` error；生产目录测试应零缺失 | 空白/静默 → P4 fail |
| 缺参数 | 保留 `{param}` + `i18n.missing-param` | 空串/`undefined` → P4 fail |
| 复数 0/1/2/多 | en `one/other` 正确；zh `other`；缺变体回退 `other` | 英文单复数错误 → P4 fail |
| 切换语言时已有历史 | 旧行/历史保持原语言；新行/新系统行用新语言 | 追溯翻译或新旧都变 → P8 fail |
| 项目切换 | locale 不变；设置视图状态可清空 | locale 重置 → P2 fail |
| IPC 不可用（旧 preload/测试替身） | 渲染层用 localStorage 镜像 + 默认，不阻塞 UI；诊断 | 崩溃/空白 → P2/P8 fail |
| 960×620 + 侧栏 208 | 主区域无水平滚动；关键容器无溢出；截断有 title/aria；按钮可操作 | 溢出/裁切/不可点 → P6 fail |
| 200% zoom | 同上重复满足；允许换行/内部滚动但不裁切 | 关键操作不可达 → P6 fail |
| 多窗口 | 当前 N/A（团队计划 §9.24）；广播通道与单窗口订阅代码可见 | 无依据的 N/A → 证据不足 |
| CLI/提示词/文档 | N/A（本轮不纳入）；零改动 | 被翻译/改动 → P11 fail |
| 外部 SDK 错误 | 原文保留为参数 + 本地化前缀/后缀；错误码不翻译 | 机翻原文/丢错误码 → P8 fail |
| 启动错误框 | 使用持久化 locale；读不到时 zh-CN | 固定中文/固定英文 → P8 fail |
| 基线既有失败 | 与基线对照分类；不得算作本次新增失败，也不得掩盖新增失败 | 未分类 → P10 证据不足 |

---

## 六、T2 检查面、升档与全量回归

### 6.1 T2 选定检查面

- 受影响单测/层测试：shared i18n、renderer 纯逻辑/组件、desktop Interface/preferences、受影响的精确主进程测试。
- 跨层集成：主进程↔渲染层 preferences IPC；shared 目录↔渲染层 facade/主进程消费；`test/测试/i18n-integration.test.ts`。
- 真实 UI：真实 Electron 切换/重启/最小尺寸/侧栏 208/200% zoom/截图/几何。
- 构建/类型：`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`。
- 消费者重测：§4.6 清单；共享元数据变更必须逐个重测实际消费者。

### 6.2 升档与全量回归

- 升档触发：§2.4 所列任一情形；证据不足/候选不可复算/跨层结论不成立；实施中需要改 `src/common/shared` 属主或角色边界；新增/修改机器枚举；偏好/IPC 超出方案 §5.2/§5.3；CLI 纳入；客户改变方案默认项。
- 升档后：停止当前派发，回报统筹/沟通，按 T3 重开闸门 2（如涉及写集/档位），执行适用全量回归 + 治理/共享抽象检查；本文件标准不因升档而放宽。
- 全量回归在报告首行记录：已执行（命令/范围/输出）或 N/A（理由）。本文件首行默认 N/A，理由为 T2 且无治理/权限变更；不得用 N/A 跳过受影响检查与消费者重测。

---

## 七、与目录授权（T3）及闸门 2 的边界

- 本文件只判定变更 A（i18n，T2）；变更 B（目录级授权/目录规范，T3）按 `docs/acceptance/directory-ownership-criteria-v1.md` 单独判定、单独报告。
- 不合并报告、不合并结论、不互相背书；两个变更的候选哈希、证据与放行分别记录。
- 本文件不改变闸门 2 已确认的写集、参与角色、阶段顺序与档位；实施中发现需要变更写集/档位时，按团队计划回报统筹并重开闸门 2，不在验收标准中自行调整。
- 共享文件（`app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`test/桌面应用/interface.test.ts`）按团队计划 §4.7 串行写入；本文件不授权并发写，也不为并发造成的候选混入提供任何豁免。

---

## 八、版本冻结与报告安排

- 本文件路径固定为 `docs/acceptance/i18n-criteria-v1.md`，版本 **v1**，日期 **2026-10-23**；写盘即冻结，标准先于实施。
- 实施前：沟通确认本文件路径/版本；未确认不派实施（团队计划 I2 出口）。
- 实施后：统筹提交变更包（候选哈希、改动路径、节点、证据链接、T2），独立验收按本文件判定并**另写** `docs/acceptance/i18n-report-v1.md`；报告首行至少含风险档位、判定依据、选定检查、复用证据、消费者重测结论、全量回归（已执行或 N/A + 理由）。
- 本文件不包含任何候选判定、通过/返工/证据不足结论；不做验收结论的提前预告。
- 标准变更：递增版本、记录理由、交沟通/统筹确认；候选变化不改变标准，只使受影响证据失效并补证。

---

## 九、写标准时发现的缺口与已知不一致（只报告，不修改）

以下为只读核对发现的事实/文档状态问题，供统筹/沟通处理；本文件未修改方案、计划、沟通记录、角色卡、产品源码或测试。

1. **方案文件头状态漂移**：`docs/planning/2026-10-23_design_i18n.md` 文件头与 §2.1 仍写「草案 v1（待闸门 1 方案确认）」「闸门 1：待确认」，而沟通记录已确认闸门 1（2026-10-23「都确认，按推荐」）。团队计划 §2.2 已记录同类不一致。判定以沟通记录与方案冻结内容为准；不影响本标准的条目，但建议由策划/沟通在后续版本中校正状态行。
2. **团队计划状态漂移**：`docs/scheduling/2026-10-23-i18n-team-plan.md` 文件头与 §二仍写「闸门 2 未确认、实施授权未给」，而沟通记录「闸门 2 确认记录」已确认闸门 2 与实施授权；团队计划哈希与沟通记录确认的 SHA-256/blob 完全一致。判定以沟通记录为准；建议统筹/沟通校正计划状态行，避免后续误读。
3. **Node 不在当前 PATH**：`node --version`/`npm --version` 在当前 shell 不可用；实施/取证前须按团队计划 §1.4 加入 PATH 并记录实测版本，不得伪造命令输出。基线 I3 必须先于实施完成。
4. **渲染层守卫与 shared 纯度约束**：`test/桌面UI/source-guard.test.ts` 禁止渲染层导入 `node:`/`electron`/`fs`/`path`/网络；`src/common/shared/runtime-shared.ts` 顶层导入 `node:os`/`node:path`，渲染层不得导入。i18n shared 必须是纯模块，`demo` 标签只能走 i18n key 或语言中性值；这属于实现约束，不是验收项冲突。
5. **`test/桌面应用/` 逐文件授权**：该目录对桌面窗口不是目录授权；主进程新断言必须并入 `interface.test.ts` 等既有精确文件，默认不新建文件。`acceptance-dispatch.test.ts`/`runtime-resolution.test.ts` 仅出现在 `boundary.yaml`、不在 `boundary.md`，属 Markdown/YAML 漂移，默认不改、不派发；若确需修改，先交人事按闸门 2 补精确单文件条目。本文件不授权改写边界。
6. **多窗口测试 N/A**：当前应用单窗口；团队计划 §9.24 明确本轮不实现多窗口联动测试。本文件按 N/A 处理，但要求 `preferences:locale-changed` 广播与单窗口订阅代码可见；若未来引入多窗口，另行补标准。
7. **原生对话框自动化限制**：`dialog.showOpenDialog`/`showErrorBox` 的原生 UI 难以在无头 e2e 中直接断言；允许通过主进程测试注入/替身（如 `pickDirectory`、`pickImageFileFn`）断言标题参数，或真实 Electron hook 记录调用；不得以“原生对话框无法测试”为由跳过 P8 的对话框标题证据。
8. **启动错误框位置**：`app/main.ts` 现有 `dialog.showErrorBox("应用启动失败", ...)` 为固定中文；方案要求启动早期错误框使用持久化 locale（读不到时默认中文）。实施须在调用前初始化偏好读取或显式降级；本文件只按行为判定，不规定实现位置。
9. **`app/desktop/runtime-config.ts` 现有中文错误**：如“未知运行时。”“演示运行时无需配置。”等属于主进程用户可见应用错误，B3/B4 需按 locale 处理；这是现状事实，不是标准新增需求（方案 §4.11/§9.1 B3 已覆盖）。
10. **设计 §9.1 B0 允许 zh-CN 目录为空骨架**：这是 B0 阶段性允许；最终验收仍要求本轮范围内 key 齐全、en-US 类型齐全（P1/P4/P7）。不构成标准冲突，但 B0 阶段不能以“空骨架”冒充最终覆盖。
11. **P9 的 CLI 部分 N/A**：CLI 未纳入本轮（方案 Q3 A），`src/index.ts`/`src/interface/cli/*` 的 CLI 输出不翻译；但 shared 元数据变更仍可能影响 CLI 的只读导入/typecheck（`RUNTIME_KINDS` 等），故 `npm run typecheck` 与消费者重测仍需覆盖，不能把 CLI 整体 N/A。
12. **无 task_ops**：本项目无 `.ans/project.json`，未启用 task_ops；所有验收证据以文件与原始输出为准，不伪造令牌/锁/审批/机器预检。
13. **现有 Interface 测试面与 preferences IPC 的落点**：当前 `test/桌面应用/interface.test.ts` 以 `createDesktopInterface` 的下游注入为主，未覆盖 IPC 通道注册；`app/main.ts` 的 `registerIpc` 通过 `createWindowIpcRegistrar` 注册窗口 IPC。团队计划要求把 preferences IPC 断言并入既有 `interface.test.ts`（不新建文件），因此实施需把偏好处理器/路径做成可注入（团队计划 §4.3 桌面窗口 B0 已要求“注入路径供测试”）。若实施无法在不新建文件的前提下覆盖 P8，须先回报统筹并按逐文件授权补边界，不得默认新建 `test/桌面应用/` 文件，也不得用未覆盖 IPC 的单测冒充 P8 证据。

---

**本文件状态：标准 v1 已冻结；未判定任何候选；未声称 i18n 已实施、已测试或已验收。**
