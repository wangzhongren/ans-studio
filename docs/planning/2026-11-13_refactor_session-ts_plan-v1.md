# 方案（v1）：`app/desktop/session.ts` 大文件重构——门面 + 协作模块

- 日期：2026-11-13
- 角色：ANS 策划（Planning，独立上下文）
- 状态：**方案 v1，待客户确认；未实施、未测试、未改任何代码/测试/角色卡/边界（本轮仅方案文档）。** 实施须在 v2.0.0 发布完成后启动（见 §1.4）。
- 依据：客户 2026-11-13 明确要求「这个文件太大了，出个方案，重构一下」。
- 本方案是实施前契约，不是验收标准；实施批次的质量门与独立验收口径见 §5、§6。

**版本记录**

| 版本 | 日期 | 变更 | 状态 |
| --- | --- | --- | --- |
| v1 | 2026-11-13 | 初稿：现状盘点、目标架构（13 个协作模块 + 共享底座）、兼容与迁移、B0–B7 批次、风险与工作量 | 待客户确认 |

## 0. 输入与已核锚点

本方案全部数字来自 2026-11-13 对 **origin/main（`e0c5e01`）** 的只读统计；工作树与 main 的 `session.ts` 逐字节相同（见下表哈希）。

| 输入 | 路径 | 锚点（2026-11-13 核对） |
| --- | --- | --- |
| 被重构文件 | `app/desktop/session.ts` | **13,466 行 / 868,951 字节 / SHA-256 `ad9679c7ff7ceab56fceca862aabf86fbc098e6e428c10bfad8a4381bbe77c7f`**；UTF-8、LF、无 BOM；最长行 749 字符（第 300 行） |
| 生产导入方 | `app/desktop/interface.ts`、`app/main.ts` | interface.ts 导入 29 个符号并转出 4 个；main.ts 仅导入 `SessionEventEnvelope` 类型 |
| 测试导入方 | `test/**` | **70 个测试文件**导入本文件（共 121 处 import 出现；72 个文件合计，含生产 2 个） |
| 导出面 | `app/desktop/session.ts` | **51 个导出符号**（全部清单见附录 B） |
| 测试规模 | `test/**/*.test.ts` | 627 个测试文件；`test/桌面应用` 76 个、41,267 行 |
| 三套冻结 known-red | 按 2026-11-10 验收基线口径（`docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.1.md` §二/T-18） | **runtime-core 33 / 门禁引擎 5 / 编排 24**，逐名比对 |
| CI | `.github/workflows/release.yml` | `node --test --test-concurrency=1 "test/**/*.test.ts"`；macOS arm64 / macOS x64 / Windows x64；45 分钟超时；workflow_dispatch-only |
| 策划记录 | `docs/planning/memo.md` | 本方案登记为 2026-11-13 条目 |
| 运行约束 | `tsconfig.json` | `strict`、`verbatimModuleSyntax`、`erasableSyntaxOnly`、`isolatedModules`、`allowImportingTsExtensions`；测试直接 `node --test` 跑 `.ts`（Node 类型剥离），**不得使用 enum/namespace/参数属性/装饰器**，import 必须带 `.ts` 后缀、类型导入必须 `import type` |

统计方法（可复现）：以临时只读脚本按类体成员边界（字符串/注释/模板字面量感知的大括号配对）解析 `SessionManager`，得到 **234 个方法 + 72 个字段**；方法行数按「方法起始行到体闭合行」计，不含紧邻的 JSDoc（JSDoc 计入相邻方法前导注释）。脚本不写入仓库。

## 1. 目的、范围与非目标

### 1.1 目的

1. 把 13,466 行、单类 11,956 行的 `session.ts` 拆成**门面 + 若干协作模块**，让每个文件可读、可测、可并行修改；
2. **外部行为零变化**：所有既有 import 路径、导出符号、协议、存储格式、事件顺序、幂等/重放语义逐字不变；
3. 为 v2.0.0 之后的产品迭代降低热点文件冲突与回归风险（近几日发布阻断修复连续落在本文件）。

### 1.2 范围

- 只做**结构性搬运**：移动代码、拆分类、引入模块边界与显式端口；
- 允许为搬运做**机械适配**：`this.x` → 宿主/上下文注入、import 路径、类型导入；
- 允许**唯一一类测试改动**：对直接读取 `app/desktop/session.ts` 源码文本的 14 个「源码钉子」测试做**只改读取路径/聚合读取**的机械改指（断言语义不变；见 §4.4 与 Q1）。

### 1.3 非目标

- 不改任何外部行为、错误码、i18n 文案、卡片形状、工具注册面、协议/账本/存储格式；
- 不修复既有缺陷、不新增特性、不做性能优化；
- 不改 v2.0.0 发布流程、不改三平台 CI 配置、不改角色卡/边界/治理模型；
- 不重命名公开方法、不改变 `SessionManager` 公开构造签名与 `SessionManagerDeps` 形状；
- 不做「顺手清理」型重构（命名、目录美学、抽象合并）；任何语义改进另立方案。

### 1.4 启动条件（硬门槛）

1. **v2.0.0 已发布**：三平台 release workflow 全绿、tag/发布完成，当前 `release/v2.0.0-blockers-*` 分支全部合并或关闭；
2. `main` 上 `session.ts` 无在途热修；每个批次执行期间 `session.ts` 所在区域**单一 owner**（同一时间只允许一个重构批次修改本文件）；
3. B0 在启动 commit 上冻结基线（文件哈希、导出面、导入面、三套 known-red、全量 TAP before）；
4. 客户确认本方案与 Q1（源码钉子机械改指）、Q2/Q3（模块粒度与状态归属）的默认项。

## 2. 现状盘点

### 2.1 文件解剖

| 区段 | 行范围 | 行数 | 内容 |
| --- | --- | --- | --- |
| 导入区 | 1–347 | 347 | 81 条 import，含大量中文契约注释 |
| 顶层类型/接口 | 351–1279 | ~929 | 51 个导出符号中的绝大多数；`SessionManagerDeps` 独占 333 行（704–1036），`DeliveryOrigin`/`DeliveryItem` 共 250 行（1053–1302） |
| 顶层函数 | 1283–1455 | ~170 | 11 个函数：`shortenText`、`isAppTaskClientMessageId`、`boundTurnText`、`withStageDeadline`、`filePrint`、`isAssistantTextEvent`、`subscribeDesktopExecutionInventory`、`desktopProjectExecutionInventory`、`shouldSuppressStarTaskReport`、`isProjectRelativeFileRef`、`latestVersionedDoc` |
| `SessionManager` 类 | 1457–13412 | **11,956** | 72 个字段 + 234 个方法（方法体合计 **10,759 行**，其余为字段注释/空行/类内注释） |
| 文件尾 | 13421–13466 | 46 | `shouldSuppressStarTaskReport`、`isProjectRelativeFileRef`、`latestVersionedDoc` 与版本扫描常量 |

### 2.2 职责簇与行数分布（现状统计）

按方法名、JSDoc 语义与调用关系人工归簇（每方法只归一个簇；行数=方法体行数，不含前导 JSDoc）：

| 职责簇 | 方法数 | 方法体行数 | 最大方法（行数） | 主要职责 |
| --- | --- | ---: | --- | --- |
| cards-decisions | 43 | 2,177 | `withRequestLifecycle`(391) | 客户卡呈现、申请生命周期、版本决策、方案升级、任命/stable 写卡、验收 judge 事实、`@审批/@决策` 指令解释 |
| lifecycle | 46 | 2,014 | `openInternalUnsafe`(1,090) | 开会话/续接/重建、取消与 LRU、事件消费循环、直接 send、后台任务、会话目录 |
| delivery-queue | 36 | 1,359 | `drainQueueUnsafe`(585) | 入队/排队/drain、去重键、撤回、停止/恢复、队列持久化与重启恢复、发送管线与 origin |
| fixed-workflow | 18 | 1,208 | `routeFixedPathDispatch`(492) | 两条固定工作流路径的派发、fixed 收口/卡裁决、merge-main 与发布合并 |
| dispatch | 8 | 1,090 | `routeStarDispatch`(648) | 星形/legacy 派发路由、五步链事实、幕僚控制器恢复 |
| tasks | 22 | 766 | `redispatchTask`(165) | 任务账本读写、卡死重派/终止/升级、角色活动日志、项目备注/状态、部分产物隔离 |
| evidence | 8 | 578 | `contractCheckText`(116) | 证据检查、契约检查、固定收口证据、提案文档引用、发布自动证据、doc_format |
| diagnostics | 20 | 525 | `mirrorGovernanceFeedback`(126) | 看护快照/投递、角色状态文本、诊断尾部、治理反馈镜像与客户投影、网络状态 |
| session-env | 11 | 426 | `applySkillChange`(133) | 边界/画像陈旧重建、技能/MCP 安装卸载、激活刷新、安装拒执观测 |
| run-change | 11 | 296 | `stopExactController`(96) | run 停止栅栏、控制器停止、执行库存事实、延迟运行变更 |
| handback | 5 | 243 | `commitHandback`(209) | 回交事件提交、回交主人路由、回交展示 |
| persistence | 6 | 77 | `persistenceOperation`(38) | 报告/投递持久化状态、回执、历史注册 |
| **合计** | **234** | **10,759** | — | 类内其余 ~1,197 行为字段/注释/空行 |

> 说明：簇行数之和 10,759 ≠ 文件 13,466，差额为导入区、顶层类型、顶层函数、字段声明与注释。该表用于判断搬运批量与风险，不代表目标模块归属（目标模块对发送管线等有 7 个方法的归属调整，见 §3.5）。各簇完整方法清单（含起始行/行数）见**附录 A**（按目标模块分组；簇→模块差异已在 §3.3 注明）。

### 2.3 最大方法（Top 20）

| 方法 | 行范围 | 行数 | 方法 | 行范围 | 行数 |
| --- | --- | ---: | --- | --- | ---: |
| `openInternalUnsafe` | 3663–4752 | 1,090 | `routeDispatch` | 8968–9195 | 223 |
| `routeStarDispatch` | 9415–10081 | 648 | `enrichAcceptanceJudgeContext` | 5679–5903 | 220 |
| `drainQueueUnsafe` | 12827–13411 | 585 | `commitHandback` | 8733–8967 | 209 |
| `routeFixedPathDispatch` | 10082–10591 | 492 | `redispatchTask` | 7551–7720 | 165 |
| `withRequestLifecycle` | 5904–6296 | 391 | `chainDispatchFacts` | 9196–9356 | 152 |
| `requestVersionDecision` | 6609–6958 | 345 | `applySkillChange` | 11828–11978 | 133 |
| `consume` | 4758–4997 | 233 | `applyMcpChange` | 11979–12115 | 130 |
| `mirrorGovernanceFeedback` | 7946–8076 | 126 | `send` | 4998–5132 | 125 |
| `terminateRoleRun` | 7419–7532 | 113 | `restorePersistedDeliveries` | 8363–8486 | 112 |
| `appointmentWriteApplicationRejection` | 5561–5678 | 112 | `requestRunChangeDecision` | 2808–2927 | 120 |

> 仅这 20 个方法就占 **5,724 行（≈ 类方法体的 53%）**。`openInternalUnsafe` 单方法是全文件最大风险点。

### 2.4 对外导出面与导入面

**导出（51 个符号）**：`SessionManager`（唯一值类）、`MAX_LIVE_SESSIONS`、`CAPABILITY_INSTALL_SYSTEM_PREFIX`、`desktopProjectExecutionInventory`、`subscribeDesktopExecutionInventory`、`shouldSuppressStarTaskReport`、`RuntimeKind`（再导出）等；其余 45 个为接口/类型（完整清单见附录 B）。

**生产导入方（2 个文件）**：

| 文件 | 导入内容 |
| --- | --- |
| `app/desktop/interface.ts` | `SessionManager` + 24 个公开类型（`ActiveRunView`、`RunChangeMode`、`SessionOpenRequest`、`SessionTarget`、`SessionMessageMetadata`、`SessionManagerDeps`、`OpenResult`、`SendResult`、`StopResult`、`WithdrawResult`、`SessionEventEnvelope`、`BackgroundTask*`、`TaskListView`、`TaskRestoreReport`、`TerminateRoleRun*`、`RedispatchTask*`、`CloseTask*`）+ 4 个持久化类型；并转出 `desktopProjectExecutionInventory`/`subscribeDesktopExecutionInventory`（值）与 `DesktopProjectExecutionInventory`/`DesktopSessionInventoryFact`（类型） |
| `app/main.ts` | 仅 `type SessionEventEnvelope` |

**测试导入方（70 个文件，121 处 import）**：`SessionManager` 70 处、`SessionEventEnvelope` 11、`SessionManagerDeps` 4、`DesktopOrchestrationEvent` 4、`PersistenceUpdated`/`OpenResult`/`StopResult` 各 2，其余 27 个符号各 1 处。**测试直接依赖的私有内部面**（通过结构化 cast 访问，见 §4.3）：`sessions`(19)、`sessionKey`(18)、`openInternal`(5)、`drainQueue`(4)、`enqueueDelivery`(3)、`activeDeliveries`(1)、`queueKey`(1)、`deliveryQueues`(1)、`deliveryStoreArmed`(1)。

**结论**：生产面很窄（2 文件），兼容成本主要在 **70 个测试文件 + 14 个源码文本钉子 + 9 个私有内部访问名**。这决定了迁移策略必须是「barrel + 门面 + 兼容内部面」而不是大爆炸改名。

### 2.5 跨簇共享状态

`SessionManager` 共 72 个字段，70 个被至少一个方法引用。按引用广度（引用方法数/簇数）：

| 字段 | 引用方法数 | 引用簇数 | 语义 | 建议归属 |
| --- | ---: | ---: | --- | --- |
| `sessions` | 59 | 10 | 保活会话表 `project×role×runtime → LiveSession` | **门面保留**（全模块只读端口；lifecycle 写） |
| `deps` | 43 | 10 | 注入的依赖容器（配置/事件/通道/端口） | **门面保留**（按模块切分只读切片注入） |
| `lastGovernanceRuntime` | 18 | 7 | 回交主人最近 runtime（择路提示） | lifecycle（会话目录） |
| `deliveryQueues` | 23 | 6 | 每队列待投条目 | delivery-queue |
| `activeDeliveries` | 17 | 6 | 正在跑的投递条目 | delivery-queue |
| `starTaskIds` | 7 | 5 | 星形任务内存索引 | shared/tasks-store |
| `openChains` | 5 | 4 | 开会话按会话键互斥链 | lifecycle |
| `taskCreators` | 5 | 4 | 任务创建者索引 | shared/tasks-store |
| `activeDispatchKeys` | 6 | 4 | 队列期派发窗口去重 | delivery-queue + tasks 共享（见 Q3） |
| `observedHandles` | 6 | 3 | 句柄库存 | lifecycle + run-change（库存事实） |
| `deliveredAppTaskIds` / `deliveredDeliveryKeys` | 7/7 | 3 | 应用任务/投递已送达去重 | delivery-queue |
| `taskDeliveryCommits` / `taskHandbackCommits` | 3/3 | 3 | 投递/回交提交屏障 | delivery-queue（handback 只读端口） |
| `planEscalations` / `planEscalationPrompted` | 2/2 | 2 | 方案升级卡去重 | cards-decisions |
| `reportStates` / `attemptStates` / `knownReports` / `knownAttempts` | 2–4 | 2 | 报告保存状态 | persistence |
| `governanceClientProjections` 等 | 2 | 2 | 治理投影缓存 | diagnostics |
| 其余 40+ 字段 | 1–2 | 1 | 各簇私有 | 各自模块 |

**完整字段归属表见 §3.6。** 原则：**每个可变字段只有一个写 owner**；跨模块只读通过端口；禁止在模块内复制第二份状态。

### 2.6 内在耦合点（重构必须逐字保真的语义）

1. **投递队列顺序与认领原子性**（最高风险）
   - `drainChains` 每项目一条串行链；`drainQueueUnsafe` 的**认领段**（读队首/合批 → shift → 置忙 + `activeDeliveries` 登记 + `delivery.start` → 调 `sendDelivery` 取 promise）必须同步完成，随后立即释放链（F-2-M1，注释在 12809–12826）。
   - `entry.busy = true` 必须在 `await sendDelivery(...)` **之前**（`test/桌面应用/message-queue.test.ts:400-405` 以源码顺序钉死；快适配器的 settled 可能在 await 返回前被消费）。
   - 队列认领跳过 system 看护项、优先非 system；客户消息屏障语义保留（12832–12840）。
   - 同一个 `drainQueue` 若拆到不同模块后被两个触发点并发进入，会重现「su 被重复开启」「坏条目误报形状不符」真机缺陷（字段注释 1774–1790）。
2. **回交/派发去重与重放**
   - 回交：`enqueuedHandbackKeys`/`pendingHandbackKeys` + 编排 `handbackKey`（单一来源）；一条回交只投一次、永不放行重投。
   - 派发：`activeDispatchKeys` **队列期窗口去重、送达即释放**（返工可再派同文任务）；`deliveredAppTaskIds` 内容稳定键跨重启认亲；`MAX_DELIVERED_APP_TASK_IDS` 有界 FIFO。
   - 重启：`restorePersistedDeliveries`（8363）+ `deliveryPersistSeq`/`committedSeq` + `deliveryStoreArmed`（恢复前禁止空快照覆盖磁盘）；`restoreRequestState`（7062）、`restoreVersionDecisions`（6959）、`restoreTasks`（7116）的 `request.orphaned`/`approval.expired`/`uncertain` 语义。
3. **turn 结算与提交屏障**
   - `consume`（4758）是每会话拉驱动事件循环：`settled` 时写 `lastTurns`/`lastAssistantText`、触发 `mirrorGovernanceFeedback`、回交入队、边界重建、`resumeDeferredRunChanges`；顺序不可交换。
   - `origins.running`/`busy`/`activeDeliveries` 的复位与 `forceResetDeliveryState`（5169）、`waitForRunStopDeliveryClaims`（12757）、`taskHandbackCommits`/`taskDeliveryCommits` 构成「停止/终止不丢终态」的屏障。
4. **证据哈希**
   - `filePrint`（sha256 + mtime/size 缓存，1346）、`boundaryDiff`（2402）、`evidenceScopeRoots`（12221）、`contractCheckText`（12312）、`buildFixedCloseEvidence`（10757）、`fixedReleaseAutoEvidence`（11424）均以内容哈希为可信信号；`boundary-refresh.test.ts:290` 以源码钉 `createHash("sha256")`。
   - 任何把「哈希计算」与「读取/路径解析」拆到不同模块的改动，都必须保证**同一输入字节 → 同一哈希**、缺失文件 `<missing>` 哨兵语义不变。
5. **闭包与工具面（`openInternalUnsafe`）**
   - 1,090 行内同时完成：workflow 模式解析与 fixed 会话重绑（B8.1/B10.1）、授权/边界载入、内置治理角色能力路由、客户交互通道注入、shell 审批档、派发/看板/安装/图片/需求变更/run-change/版本卡等工具注入、指纹定格、git/dispatch/plan 绑定、句柄创建与库存登记。
   - **能力缺席 = 工具不注册 = fail-closed**；任一 builder 顺序/条件变化都可能放宽或收窄工具面。必须按连续代码块切分，不得重写条件。
6. **共享可变状态**：见 §2.5；`sessions`/`deps` 被 10 个簇引用，是天然的「门面保留」对象。

### 2.7 测试保护面与「源码钉子」（必须在方案里正面处理）

**行为保护面**：70 个测试文件导入 `SessionManager`；桌面套件 76 文件、41k 行，覆盖排队/回交/派发/固定路径/卡片/重放/看门狗/网络/多 runtime。三套冻结 known-red（33/5/24）提供「同名不恶化」的差分基线。

**源码钉子（14 个测试文件读取 `app/desktop/session.ts` 文本并断言字符串/顺序/计数）**：

| 文件 | 钉子性质 |
| --- | --- |
| `test/桌面UI/evidence-markers.test.ts` | 断言 `acceptanceFacts`/`evidenceMismatch`/`criteriaRef` 出现在源码 |
| `test/桌面UI/queue-status.test.ts` | 断言 `headKind`/`blockedReason`/`activeTurnId`/`"watchdog.notice.bypass"` |
| `test/桌面UI/request-status.test.ts` | 断言 5 个 i18n key 与 `emitDeliveryNote(...)` 调用形状 |
| `test/桌面应用/boundary-refresh.test.ts` | **约 24 条**：`private async boundaryDiff(`、`private async currentSkillPaths(`、`private async activateRoleRefresh(`、`private isCustomerInitiatedTurn(`、`this.applySkillChange("installed"` 等 |
| `test/桌面应用/chief-workflow.test.ts` | 以 `slice("private ownedRunStopMembers", "private async executeOwnedRunStop")` 等**方法边界+相邻顺序**切源码 |
| `test/桌面应用/directive-input.test.ts` | 统计 `directiveIdFromOperatorId` 出现次数 ≥3 |
| `test/桌面应用/dispatch-fresh-enum.test.ts` | 断言 `await this.deps.refreshListing(projectRoot);` 与「首轮寻址修复」 |
| `test/桌面应用/hot-path.test.ts` | 断言 `hit.mtimeMs === st.mtimeMs && hit.size === st.size`（filePrint 缓存判据） |
| `test/桌面应用/interface.test.ts` | 断言 `broadcastRoleStates(): void` |
| `test/桌面应用/message-queue.test.ts` | **顺序钉**：`entry.busy = true;` 出现在 `await this.sendDelivery(entry, origin, text, opts);` 之前 |
| `test/桌面应用/run-change-entry.test.ts` | 断言 `this.requestRunChangeDecision({`、`proposalCardFrozenRejection`，且**不得出现** `runChangeRejectionForDispatch(` |
| `test/测试/g1-verify/g1-copy-and-nails.test.ts` | 断言源码无本地派发模板/副本实现 |
| `test/测试/g4-skill-verify/h-scope-audit.test.ts` | 4 处读取，断言技能/MCP 接线字符串 |
| `test/测试/governance-matrix-integration.test.ts` | 断言 desktop session 源码不引用 `governance-matrix` 能力 |

**结论**：如果代码搬走而 `session.ts` 只剩 barrel，这 14 个文件的文本断言必然失效。**「移动代码 + 原测试完全不动」在本仓库不可行**——这是本方案最重要的诚实结论，必须由客户在 Q1 裁决。推荐：B0 引入 `readSessionSource()` 聚合读取器（按固定顺序读 `session.ts` + `session/**/*.ts`），14 个文件只改「从哪读」，断言文本/顺序/计数一律不改；对 2 处跨文件顺序钉（message-queue、chief-workflow）使用按模块读取或固定拼接顺序保序。**不允许**以「删断言/放宽断言」的方式过关。

## 3. 目标架构

### 3.1 设计原则

1. **Barrel 不变**：`app/desktop/session.ts` 保留为唯一公开入口（约 30 行的显式再导出）；51 个导出符号逐字不变。
2. **门面只做编排**：`SessionManager` 保留全部 66 个公开方法作为薄委托；仅保留跨模块编排胶水（构造/装配/兼容内部面），目标 ≤800 行。
3. **状态单一 owner**：每个可变字段只有一个模块写；跨模块只读走端口。例外：`sessions`/`deps` 由门面持有（10 个簇引用 + 测试直接 cast），以只读端口暴露。
4. **单向依赖、无环**：feature 模块只允许导入 `contracts`/`shared`/显式列出的下层模块；所有上行/同层调用通过 `contracts.ts` 中的端口，由门面或适配器实现。
5. **端口后置、按批增量**：`contracts.ts` 的端口清单随批次追加，不在 B1 一次性设计成「大接口」；每批只引入该批必需的端口。
6. **两阶段装配**：模块构造时注入端口对象；端口方法只在运行期调用。门面构造完成后 `bindHost(facade)` 完成闭环，避免构造期循环调用。
7. **搬运保真**：每批以「连续代码块切割」为主，先搬后整；禁止在搬运批次里改条件、改顺序、改错误码。

### 3.2 目录结构

```
app/desktop/session.ts                  # barrel（~30 行，51 个导出逐字不变）
app/desktop/session/
  index.ts                              # SessionManager 门面 + 两阶段装配（≤800 行）
  contracts.ts                          # 共享类型 + 端口接口（只导入 src/model 与基础类型）
  shared/
    keys.ts                             # sessionKey/targetKey/queueKey
    clock.ts                            # now()
    text.ts                             # shortenText/boundTurnText/withStageDeadline/filePrint/
                                        #   isAssistantTextEvent/isAppTaskClientMessageId/
                                        #   isProjectRelativeFileRef/latestVersionedDoc/shouldSuppressStarTaskReport
    roles.ts                            # handbackOwnerRoleId/chiefTaskRoleIdOf/dispatcherRoleIdOf/
                                        #   roleDisplayName/findListingForFeedback/resolveProofFlowIds/refreshListing
    notifier.ts                         # emitDeliveryNote
    session-views.ts                    # contextInfo/角色状态纯投影
    tasks-store.ts                      # readTasks/isFixedTask/appendTaskState[Result]/recordTaskFailure/
                                        #   appendRoleActivity/rememberTaskCreator + taskCreators
    inventory.ts                        # inventoryChanged/publishDeliveryInventory + 顶层库存订阅
  lifecycle/                            # 会话生命周期（open/send/consume/stop/LRU/background）
    index.ts
    open.ts                             # openInternalUnsafe 的 8 个 builder + 主流程
    send.ts                             # send/sendDelivery/sendFacts/origin 处理
    consume.ts                          # 事件循环与 settle 钩子
    background.ts                       # 后台任务三方法
    directory.ts                        # 会话目录只读视图（端口实现侧）
  session-env.ts                        # 边界/画像/技能/MCP/激活刷新
  delivery/
    queue.ts                            # 入队/drain/停止/恢复/撤回/状态外推
    store.ts                            # 队列快照序列化/原子写/重启恢复
    origin.ts                           # 发送 origin 的建立/裁剪/失败复位（供 lifecycle/send 使用）
  handback.ts
  dispatch.ts
  fixed-workflow/
    route.ts                            # routeFixedPathDispatch + 路径 B 写集/启动门
    cards.ts                            # fixed 卡请求/裁决/阶段推进
    release-merge.ts                    # merge-main 卡/发布合并/自动呈卡
    panel.ts                            # fixedPanelState/dispatchAdvisorySummary
  evidence.ts
  cards/
    cards.ts                            # 应用卡呈现 + 申请生命周期 + 方案升级 + 任命/stable
    version-decisions.ts                # 版本决策全链 + 恢复
    acceptance-facts.ts                 # 验收 judge 事实与 appointment-write 校验
  run-change.ts
  tasks.ts
  diagnostics.ts
  persistence.ts
  git-ports.ts                          # git runtime/lease/信号端口装配（薄）
```

> 模块数：**13 个协作模块**（lifecycle、session-env、delivery、handback、dispatch、fixed-workflow、evidence、cards、run-change、tasks、diagnostics、persistence、git-ports），**约 25 个文件**；另加 `contracts.ts`、6 个 `shared/*`、`index.ts`/barrel。

### 3.3 模块职责、依赖方向与迁出规模

依赖层次（下层可被上层导入；同层/上行只走端口）：

```
L7  index.ts（SessionManager 门面）
L6  lifecycle
L5  fixed-workflow
L4  dispatch            cards
L3  delivery            handback            (card-gateway)
L2  tasks   run-change  session-env         diagnostics
L1  persistence   evidence   delivery/store   git-ports
L0  contracts + shared/*（keys/clock/text/roles/notifier/session-views/tasks-store/inventory）
```

| 模块 | 职责（一句话） | 迁出方法数 | 方法体行数 | 允许导入（除 L0） |
| --- | --- | ---: | ---: | --- |
| `lifecycle` | 会话打开/续接/重建/发送/消费/停止与 LRU 的全生命周期 | 47 | 2,142 | delivery、session-env、tasks、evidence、git-ports |
| `fixed-workflow` | 两条固定路径（新增/修改）的派发、卡裁决、收口与发布合并 | 16 | 1,185 | card-gateway、evidence、run-change、git-ports |
| `dispatch` | 星形/legacy 派发路由与幕僚控制器恢复 | 5 | 1,079 | shared（其余经端口） |
| `cards` | 客户卡呈现、申请生命周期、版本决策、验收事实 | 43 | 2,177 | card-gateway、evidence、shared（其余经端口） |
| `delivery` | 队列/drain/去重/停止恢复/持久化/发送 origin | 27 | 1,188 | delivery/store、session-env、run-change、shared（其余经端口） |
| `tasks` | 任务账本业务、重派/终止/升级、项目备注与状态 | 17 | 728 | shared（其余经端口） |
| `evidence` | 证据/契约/文档格式检查与固定收口证据构建 | 9 | 595 | shared |
| `diagnostics` | 看护/状态文本/诊断尾部/治理投影/网络状态 | 17 | 506 | shared（其余经端口） |
| `session-env` | 边界/画像重建、技能/MCP 安装卸载、激活刷新 | 11 | 426 | shared（其余经端口） |
| `run-change` | run 停止栅栏、控制器停止、执行库存事实 | 9 | 282 | shared（其余经端口） |
| `handback` | 回交提交、回交主人路由与展示 | 4 | 233 | shared（其余经端口） |
| `persistence` | 报告/投递持久化状态与回执操作 | 6 | 77 | shared（其余经端口） |
| `git-ports` | Git runtime/lease/信号端口装配 | 0（片段提取） | ~150（估计） | `workflow-git.ts`、shared |
| 共享底座 | keys/clock/text/roles/notifier/session-views/tasks-store/inventory | 22 | ~136 + 顶层函数 ~170 | contracts |

> 与 §2.2 的差异：发送管线 7 个方法（`sendDelivery`、`sendFacts`、`begin/capture/trim/failDeliveryOrigin`、`healStaleOrigin`）从 delivery 簇归入 `lifecycle`（它们直接读写 `LiveSession`/origin 状态）；`findFixedReviewArtifact` 从 fixed 簇归入 `evidence`；`isFixedTask`、`readTasks`、`append*` 等 7 个任务账本方法归入 `shared/tasks-store`；`sessionKey/targetKey/queueKey`、`now`、`emitDeliveryNote`、角色路由 6 方法归入 `shared/*`。

**关键跨模块端口（`contracts.ts`，按批次增量添加）**：

```ts
// 会话只读视图（lifecycle 实现；全模块可用）
export interface SessionDirectory {
  key(projectRoot: string, roleId: string, runtime: RuntimeKind): string;
  find(projectRoot: string, roleId: string, runtime: RuntimeKind): LiveSession | undefined;
  activeRoleId(): string | null;
  governanceOwner(projectRoot: string): string | null;
  governanceRuntime(projectRoot: string): RuntimeKind | undefined;
  isBusy(runtime: RuntimeKind): boolean;
  views(): LiveSessionView[];
  lastTurn(projectRoot: string, roleId: string, runtime: RuntimeKind): TurnFact | undefined;
}

// 会话控制（lifecycle 实现；delivery/tasks/run-change 使用）
export interface SessionControl {
  openInternal(req: SessionOpenRequest, userInitiated: boolean): Promise<OpenResult>;
  ensureFresh(projectRoot: string, roleId: string, runtime: RuntimeKind): Promise<void>;
  disposeEntry(entry: LiveSession, reason: string): Promise<void>;
  abortTurn(entry: LiveSession, reason: string): Promise<RoleSessionAbortResult>;
}

// 投递控制（delivery 实现；cards/handback/dispatch/fixed/diagnostics 使用）
export interface DeliveryControl {
  enqueue(projectRoot: string, targetRoleId: string, item: DeliveryItem): void;
  drain(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind, claim?: DeliveryClaim): Promise<void>;
  drainAll(projectRoot: string, reason: string): Promise<void>;
  isStopped(key: string): boolean;
  queueKey(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): string;
  persist(): void;
  activeDelivery(projectRoot: string, targetRoleId: string): DeliveryItem | undefined;
}

// 实际发送（lifecycle 实现；delivery 使用）
export interface DeliverySink {
  deliver(entry: LiveSession, origin: TurnOrigin, text: string, opts: SendDeliveryOptions): Promise<DeliverySendFacts>;
}

// 卡片通道（cards + card-gateway 实现；fixed/lifecycle 使用）
export interface CardGateway {
  presentAppCard(request: AppCardRequest): Promise<CardDecision | undefined>;
  withRequestLifecycle<T>(request: RequestLifecycleInput<T>): Promise<T>;
  offerRunChangeOnFrozenContract(input: RunChangeOfferInput): Promise<RunChangeOfferResult>;
  reportPlanEscalation(input: PlanEscalationInput): Promise<PlanEscalationResult>;
}

// 事件路由（门面/router 实现；lifecycle 的 consume 使用）
export interface EventRouter {
  onEvent(envelope: SessionEventEnvelope): Promise<void>;
  onSettled(entry: LiveSession, outcome: RuntimeTurnOutcome): Promise<void>;
}

// 任务账本（shared/tasks-store 实现；所有模块可导入——它是 L0 具体模块，不是端口）
export interface TaskBook {
  read(projectRoot: string): Promise<TaskReplay>;
  isFixed(projectRoot: string, taskId: string | undefined): Promise<boolean>;
  appendState(projectRoot: string, event: TaskStateEvent): Promise<void>;
  appendActivity(projectRoot: string, roleId: string, kind: string, summary: string): Promise<void>;
  rememberCreator(taskId: string, created?: { from?: "chief" | "convener" }): void;
}

// 通知（shared/notifier 实现）
export interface Notifier {
  note(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void;
}

// 其余端口（按批次添加）：FixedDispatchPort { routeFixedPathDispatch; dispatchAdvisorySummary }
// FixedCardHooks { prepareFixedAppointmentCardRequest; recordFixedCardWorkflowResolution }
// HandbackSink { handleHandback; handbackFlowId }
// ControllerStopPort { stopExactController }
// InventoryPort、WatchdogPort、ListingRefreshPort、PersistencePort、DiagnosticsSink
```

**模块类签名草案（节选公开方法；完整签名以原方法为准）**：

```ts
class Lifecycle {
  constructor(ctx: LifecycleContext);
  open(req: SessionOpenRequest): Promise<OpenResult>;
  send(target: SessionTarget | undefined, text: string, metadata?: SessionMessageMetadata): Promise<SendResult>;
  consume(entry: LiveSession): Promise<void>;
  abort(target: SessionTarget): Promise<RoleSessionAbortResult>;
  stop(target?: SessionTarget): Promise<StopResult>;
  directory(): SessionDirectory;
  deliver(entry: LiveSession, origin: TurnOrigin, text: string, opts: SendDeliveryOptions): Promise<DeliverySendFacts>;
}
class DeliveryQueue {
  constructor(ctx: DeliveryContext);
  enqueue(projectRoot: string, targetRoleId: string, item: DeliveryItem): void;
  drain(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind, claim?: DeliveryClaim): Promise<void>;
  stop(input: StopTarget): Promise<StopResult>;
  withdraw(input: WithdrawInput): Promise<WithdrawResult>;
  restore(projectRoot: string): Promise<DeliveryQueueRestoreReport>;
}
class Handback { commit(ev: HandbackEvent): Promise<void>; display(ev: HandbackEvent): void; }
class Dispatch { route(input: DispatchRouteInput): Promise<DispatchReceipt | undefined>; }
class FixedWorkflow {
  routeFixedPathDispatch(input: FixedDispatchInput): Promise<FixedDispatchReceipt>;
  runFixedReleaseMerge(input: ReleaseMergeInput): Promise<ReleaseMergeResult>;
  fixedPanelState(projectRoot: string): Promise<FixedPanelState>;
}
class Cards {
  presentAppCard(request: AppCardRequest): Promise<CardDecision | undefined>;
  withRequestLifecycle<T>(input: RequestLifecycleInput<T>): Promise<T>;
  requestVersionDecision(input: VersionDecisionInput): Promise<VersionDecisionResult>;
}
class Evidence {
  buildFixedCloseEvidence(input: FixedCloseEvidenceInput): Promise<FixedCloseEvidence>;
  evidenceCheckText(input: EvidenceCheckInput): Promise<string>;
  contractCheckText(input: ContractCheckInput): Promise<string>;
}
class RunChange {
  selectRunChangeForHandle(projectRoot: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined, request: Parameters<SelectRunChangeFn>[0], signal?: AbortSignal): Promise<Awaited<ReturnType<SelectRunChangeFn>>>;
  stopExactController(input: ControllerStopInput): Promise<ControllerStopResult>;
  executionInventoryFacts(projectRoot: string): DesktopProjectExecutionInventory;
}
class Tasks {
  redispatchTask(input: RedispatchTaskInput): Promise<RedispatchTaskResult>;
  terminateRoleRun(input: TerminateRoleRunInput): Promise<TerminateRoleRunResult>;
  closeTask(input: CloseTaskInput): Promise<CloseTaskResult>;
  escalateStuckTask(input: object): Promise<object>;
}
class Diagnostics {
  watchdogSnapshot(): object | undefined;
  watchdogDeliver(input: object): Promise<void>;
  roleStatusText(projectRoot: string): Promise<string>;
}
class SessionEnv {
  rebuildIfBoundaryStale(key: string, userInitiated: boolean, selectionVersion?: number, forcedWorkflowMode?: string): Promise<boolean>;
  applySkillChange(kind: "installed" | "uninstalled", input: object): Promise<object>;
  applyMcpChange(kind: "installed" | "uninstalled", input: object): Promise<object>;
}
class Persistence {
  persistenceOperation<T>(scope: PersistenceScope, operation: (value: unknown) => Promise<T>): Promise<PersistenceReply<T>>;
  mergeReportState(projectRoot: string, state: ReportSaveStateV1): Promise<void>;
}
class GitPorts {
  currentRuntime(projectRoot: string): Promise<object>;
  taskGitShellPort(projectRoot: string): object;
}
```

> 这些是**搬运后的模块边界**，不是新抽象：方法名、参数形状、返回类型均取自现行代码；类名仅为占位（可按实现习惯改为函数命名空间，但导入图与依赖规则不变）。未在草案中列出的类型（`StopTarget`、`FixedDispatchInput` 等）在实现批次中从现有方法签名内联提取，不新造业务语义。

### 3.4 `openInternalUnsafe` 分解（B7 的核心）

将 1,090 行按**连续代码块**切为 8 个 builder（`session/lifecycle/open.ts`），主流程缩为约 120–150 行，保持原顺序与条件：

| builder | 职责 | 约行数 |
| --- | --- | --- |
| `resolveWorkflowMode(req)` | T3 B1/B8.1/B10.1：按真实 task/flow 解析 legacy/fixed，处理 forcedWorkflowMode 与 fixed 会话重绑 | ~80 |
| `reuseOrRebindEntry(ctx)` | B-2 续接、busy/assignedTaskId 校验、fixed/legacy 不混用 | ~70 |
| `loadAuthorization(ctx)` | `.ans` pin-backed 优先 / 运行期同意回退 / fail-closed；边界快照与指纹 | ~110 |
| `assembleGovernanceCapabilities(ctx)` | 内置治理角色能力路由（legacyBuiltIn/schedule/nomination/liaison/proposal/verification）、客户交互通道、shell 审批档 | ~180 |
| `assembleProjectCapabilities(ctx)` | 项目角色能力：写盘确认兜底、`view_image`、需求变更、run-change、版本卡、role_status/session_tail、技能/MCP 安装 | ~190 |
| `assembleToolSurface(ctx)` | 由能力对象组装 governed tools；**缺席即不注册**；keep same spread order | ~70 |
| `freezeBindings(ctx)` | gitBinding/dispatchBinding/plan-run 绑定、边界指纹、contextSource 映射 | ~90 |
| `postOpenWiring(ctx)` | 句柄创建、observedHandles/库存、客户卡通道、request 生命周期、stable/fixed 钩子接线 | ~160 |

验收要求：同一输入下 builder 产生的工具名集合、handler 形状、注册顺序与迁移前**逐项相同**；由 `boundary-refresh`/`ans-wiring`/`operator-channel`/`download-*`/`acceptance-*` 套件与新增「工具面快照测试」共同保护。

### 3.5 方法迁出清单

完整 234 个方法的「模块 + 起始行 + 行数」清单见**附录 A**；各模块方法与行数汇总见 §3.3。搬运顺序按批次（§5），不按本表顺序。

### 3.6 状态归属表（72 字段）

| 归属 | 字段 |
| --- | --- |
| 门面保留 | `deps`、`loadEffectiveConfig`、`sessions`（只读端口；lifecycle 写） |
| lifecycle | `messageSeq`、`lruClock`、`activeRoleId`、`selectionVersion`、`selectionTargetRoleId`、`openChains`、`observedHandles`、`observedHandleIds`、`lastGovernanceRuntime`、`inventoryRegistration`、`managerId` |
| session-env | `boundaryRefreshVersion`、`profileRevisions`、`rebuildChains`、`installationRefusals` |
| delivery | `deliveryQueues`、`drainChains`、`drainClaimRecords`、`deliveryStopVersion`、`deliveryStoppedAll`、`stoppedDeliveryKeys`、`resumedDeliveryKeys`、`deliveryKeyStopVersions`、`activeDeliveries`、`deliveryQueueStorePath`、`deliveryPersistOutcome`、`deliveryPersistChain`、`deliveryPersistSeq`、`deliveredDeliveryKeys`、`deliveredAppTaskIds`、`deliveryStoreArmed`、`suDeliveryBlockedNoted`、`taskDeliveryCommits`、`taskHandbackCommits` |
| shared/tasks-store | `starTaskIds`、`taskCreators`、`reportedTaskKeys`、`escalationRequests`、`activeDispatchKeys`、`lastRoleActivity` |
| cards | `planEscalations`、`planEscalationPrompted`、`requestNotifiedKeys`、`versionDecisionPending`、`versionDecisionChains`、`requestPresentedKeys`、`runChangeAutoPrompted` |
| persistence | `reportStates`、`attemptStates`、`knownReports`、`knownAttempts`、`persistenceInFlight` |
| handback | `enqueuedHandbackKeys`、`pendingHandbackKeys` |
| diagnostics | `lastTurns`、`lastAssistantText`、`governanceHandbackMirrored`、`governanceClientProjections`、`networkState` |
| run-change | `runStopGeneration`、`fencedRunTasks`、`fencedRuns`、`runStopFacts`、`controllerStopFacts`、`controllerDisposalOwners`、`deferredRunChanges`、`runChangeOperations`、`inventoryPublicationErrors`、`observedInventoryRoots` |

> 合计：门面 3 + lifecycle 11 + session-env 4 + delivery 19 + shared/tasks-store 6 + cards 7 + persistence 5 + handback 2 + diagnostics 5 + run-change 10 = 72。`activeDispatchKeys` 由 delivery 在送达时释放、tasks 在恢复/派发时写入——归属 shared/tasks-store，delivery 通过 `TaskBook` 端口操作，避免双写（Q3）。

## 4. 兼容与迁移

### 4.1 Barrel 契约

`app/desktop/session.ts` 目标内容（顺序与注释可调整，导出名逐字不变）：

```ts
export { SessionManager } from "./session/index.ts";
export {
  MAX_LIVE_SESSIONS,
  CAPABILITY_INSTALL_SYSTEM_PREFIX,
  desktopProjectExecutionInventory,
  subscribeDesktopExecutionInventory,
  shouldSuppressStarTaskReport,
} from "./session/index.ts";
export type {
  RuntimeKind, DesktopOrchestrationEvent, PersistenceScope, PersistenceReply, PersistenceCapabilities,
  PersistenceValues, PersistenceUpdated, SessionEventEnvelope, GovernanceClientProjectionV1,
  SessionOpenRequest, ActiveRunView, RunChangeMode, EffectiveConfigInfo, SessionMessageMetadata,
  SessionTarget, OpenResult, SendResult, DeliveryQueuePersistenceOutcome, DeliveryQueuePersistenceFacts,
  StopResult, WithdrawResult, BackgroundTaskView, BackgroundTasksListReply, BackgroundTaskReadInput,
  BackgroundTaskReadReply, BackgroundTaskStopInput, BackgroundTaskStopReply, TaskListView,
  TaskRestoreReport, TerminateRoleRunInput, TerminateRoleRunResult, RedispatchTaskInput,
  RedispatchTaskResult, CloseTaskInput, CloseTaskResult, NativeProjectRegistration, SessionManagerDeps,
  RebuildSessionResult, RedeliverResult, PersistedDeliveryItemV1, DeliveryQueueRestoreReport,
  InstallationCapabilityTool, InstallationEffectRefusalObservation, DesktopSessionInventoryFact,
  DesktopProjectExecutionInventory,
} from "./session/index.ts";
```

门面 `SessionManager` 保留：
- **66 个公开方法**（逐个委托；签名逐字不变）；
- 测试使用的私有内部面：`sessions`、`sessionKey`、`queueKey`、`openInternal`、`drainQueue`、`enqueueDelivery`、`activeDeliveries`、`deliveryQueues`、`deliveryStoreArmed`——字段保留真实对象引用，方法保留薄委托；
- `constructor(deps: SessionManagerDeps)`：先构造共享底座与各模块，再两阶段绑定端口；不改变 deps 形状与默认值。

### 4.2 迁移手法

每批统一执行：

1. **连续块切割**：从 `SessionManager` 中剪出完整方法（含体），放入新模块；把 `this.foo` 改成显式上下文（`ctx.foo` / 注入端口），不做条件重写。
2. **门面委托**：原方法体替换为一行委托（或删除私有方法并更新同类内调用点）；公开方法一律保留委托。
3. **状态随主**：该批模块拥有的字段一并迁入模块；`sessions`/`deps` 不动。
4. **端口最小化**：只为本批出现的新跨模块调用新增端口，不预造大接口。
5. **搬运审计**：`git diff -M --stat` + `git diff -M` 检查 rename/move；对每个被搬方法做「归一化方法体比对」（仅允许 `this.` → `ctx.`/`host.` 的机械替换），**任何额外差异必须由复核者逐行确认**。
6. **测试不动**（除 B0 的源码钉子读取路径改指）：行为测试逐字保留；新增结构测试只增不改。

### 4.3 测试内部访问兼容面

| 内部名 | 访问方式（测试） | 兼容策略 |
| --- | --- | --- |
| `sessions` | 结构化 cast 后 `.get/.set` 与条目字段改写（19 处） | 字段保留在门面，Map 实例即 lifecycle 使用的同一实例 |
| `sessionKey` | cast 后调用（18 处） | 门面保留私有薄委托（或字段级绑定） |
| `openInternal` | cast 后调用（5 处） | 门面保留私有薄委托 → lifecycle |
| `drainQueue` / `enqueueDelivery` | cast 后调用（4+3 处） | 门面保留私有薄委托 → delivery |
| `activeDeliveries` / `deliveryQueues` / `deliveryStoreArmed` | cast 读取（各 1 处） | 字段保留在门面（引用 delivery 的同名状态对象） |

> 兼容面在 B7 后仍保留；是否在未来清理测试内部访问属于独立事项（Q4），不在本次范围。

### 4.4 源码钉子迁移（唯一允许的测试改动）

B0 新增 `test/桌面应用/session-source.ts`（或 `test/helpers/`）导出：

```ts
export function readSessionSource(): string;              // 按固定顺序拼接 barrel + session/**/*.ts
export function readSessionModule(name: string): string;  // 读取指定模块（顺序/相邻性钉子用）
```

14 个钉子文件只做「读取方式」替换：`fs.readFileSync(...session.ts...)` → `readSessionSource()`；`chief-workflow`/`message-queue` 的顺序/相邻性断言改用 `readSessionModule("run-change"|"lifecycle/send")` 或固定拼接顺序。**断言文本、顺序关系、计数阈值逐字不变**。B0 合并前由客户/验收确认该机械改指清单（Q1）。

### 4.5 每批独立可提交、可发布

- 每批一个 PR/合并提交；barrel 与公开面不变，合并即可发布；
- 每批结束 `main` 可回退到该批之前（revert 单提交），无数据/格式迁移；
- 批内允许 2–3 个提交（搬代码 / 接线 / 测试骨架），PR 合并前 squash 或保留均可，回滚点取合并提交。

## 5. 分阶段计划（B0–B7）

> 「改动行数」为预计移动行 + 接线行（`+新增/−删除`，含新文件）；实际以 `git diff --stat` 为准。每批验证门槛默认包含：`npm run typecheck`、受影响套件、三套 known-red 逐名 diff 空、搬运审计。全量套件/三平台只在标注的波次边界执行。

### B0 基线与钉子治理（不改生产代码）

| 项 | 内容 |
| --- | --- |
| 搬运内容 | 无；冻结基线：`session.ts` 哈希/行数、51 导出快照、72 导入方/121 import 出现、三套 known-red 名单、全量 TAP before |
| 测试基础设施 | 新增 `readSessionSource`/`readSessionModule`；14 个钉子文件机械改指（Q1）；新增 `session-structure.test.ts`：导出面快照、导入图无环检查（当前单文件也应通过）、文件体量预算 |
| 预期改动 | 测试文件 +200/−40（仅读取方式与结构测试），生产 0 |
| 验证门槛 | `npm run typecheck`；14 个钉子测试全过；桌面套件失败名与基线逐名相同；三套 known-red diff 空 |
| 回滚点 | 单提交 revert；无生产代码影响 |

### B1 契约与共享底座（纯函数/低耦合）

| 项 | 内容 |
| --- | --- |
| 搬运内容 | 顶层类型/接口 → `session/contracts/`（`SessionManagerDeps`、DeliveryOrigin/Item、所有公开类型）；11 个顶层函数 → `session/shared/text.ts`；`shared/keys`、`shared/clock`、`shared/roles`、`shared/notifier`、`shared/session-views`、`shared/tasks-store`、`shared/inventory` |
| 方法/行数 | 22 个类方法（~136 行）+ 顶层函数 ~170 行 + 类型 ~929 行 + 导入区重构；预计 +1,700/−1,600 |
| 验证门槛 | typecheck；`session.test.ts`、`message-queue.test.ts`、`boundary-refresh.test.ts`、`role-log.test.ts`、`hot-path.test.ts`、`interface.test.ts`；known-red diff 空；导出面快照（51）不变；导入图无环 |
| 回滚点 | 批次合并提交 revert |

### B2 证据与持久化

| 项 | 内容 |
| --- | --- |
| 搬运内容 | `session/evidence.ts`（9 方法 / 595 行，含 `findFixedReviewArtifact`）；`session/persistence.ts`（6 方法 / 77 行） |
| 预期改动 | +700/−650 |
| 验证门槛 | typecheck；`acceptance-evidence.test.ts`、`b21-basis-gate-desktop.test.ts`、`doc-format-all-roles.test.ts`、`replay-safe-retry.test.ts`、`task-restart.test.ts`、`pending-card-restart.test.ts`；known-red diff 空 |
| 回滚点 | 批次合并提交 revert |

### B3 任务账本、诊断与运行环境

| 项 | 内容 |
| --- | --- |
| 搬运内容 | `session/tasks.ts`（17 / 728）；`session/diagnostics.ts`（17 / 506）；`session/session-env.ts`（11 / 426） |
| 预期改动 | +1,700/−1,600 |
| 验证门槛 | typecheck；`task-restart.test.ts`、`stuck-redispatch.test.ts`、`project-state.test.ts`、`role-log.test.ts`、`watchdog-reuse.test.ts`、`network-state-e2e.test.ts`、`boundary-refresh.test.ts`、`queue-status.test.ts`、`request-status.test.ts`、`evidence-markers.test.ts`；known-red diff 空 |
| 回滚点 | 批次合并提交 revert |

### B4 投递队列（第一高风险批）

| 项 | 内容 |
| --- | --- |
| 搬运内容 | `session/delivery/queue.ts`（27 / 1,188，含 `drainQueueUnsafe`）、`delivery/store.ts`（快照/恢复）、`delivery/origin.ts`；`DeliverySink` 端口接回门面 |
| 预期改动 | +1,500/−1,400 |
| 验证门槛 | typecheck；`message-queue.test.ts`（顺序钉）、`handback-delivery.test.ts`、`queue-visibility.test.ts`、`queue-withdraw-lru.test.ts`、`replay-safe-retry.test.ts`、`queue-recovery-e2e.test.ts`、`network-state-e2e.test.ts`、`abort-unwedge.test.ts`、`b101-*`、`b111-*`、`turn-lease.test.ts`；known-red diff 空；**本地全量桌面套件** |
| 回滚点 | 批次合并提交 revert；本批后建议跑一次单平台 release 冒烟（Windows） |

### B5 卡片决策与 run-change

| 项 | 内容 |
| --- | --- |
| 搬运内容 | `session/cards/`（43 / 2,177，拆 3 文件）、`session/run-change.ts`（9 / 282）、`card-gateway.ts`；`FixedCardHooks`/`ControllerStopPort` 端口 |
| 预期改动 | +2,600/−2,450 |
| 验证门槛 | typecheck；`version-decision.test.ts`、`version-change.test.ts`、`run-change.test.ts`、`run-change-trigger.test.ts`、`run-change-entry.test.ts`、`acceptance-*`、`pending-card-restart.test.ts`、`turn-lease.test.ts`、`optional-acceptance.test.ts`、`request-timeout-wiring.test.ts`；known-red diff 空；桌面全量套件 |
| 回滚点 | 批次合并提交 revert |

### B6 回交、派发、固定工作流与 Git 端口

| 项 | 内容 |
| --- | --- |
| 搬运内容 | `session/handback.ts`（4 / 233）、`session/dispatch.ts`（5 / 1,079）、`session/fixed-workflow/`（16 / 1,185，拆 4 文件）、`session/git-ports.ts`（片段 ~150）；`FixedDispatchPort`/`HandbackSink` 端口 |
| 预期改动 | +2,900/−2,700 |
| 验证门槛 | typecheck；`handback-delivery.test.ts`、`chat-handback-integration.test.ts`、`star-routing.test.ts`、`fixed-path-routing.test.ts`、`b101-*`、`b111-*`、`b3-*`、`b31-*`、`b42-*`、`b51-*`、`b61-*`、`b71-*`、`b81-*`、`b82-*`、`fixed-path-full-chain.test.ts`、`g1-*`、`dispatch-fresh-enum.test.ts`；known-red diff 空；桌面全量套件 |
| 回滚点 | 批次合并提交 revert；本批后跑三平台 release 冒烟（波次边界） |

### B7 生命周期收口与 barrel 切换

| 项 | 内容 |
| --- | --- |
| 搬运内容 | `session/lifecycle/`（47 / 2,142：open/send/consume/background/directory）；`openInternalUnsafe` 8 builder 分解；门面 `index.ts`；`session.ts` 改 barrel |
| 预期改动 | +2,900/−2,700；`session.ts` ≤30 行、`index.ts` ≤800 行 |
| 验证门槛 | typecheck + `typecheck:renderer`；**全量 627 测试文件**；三套 known-red 逐名 diff 空；桌面全链定向（`fixed-path-full-chain`、`queue-recovery-e2e`、`network-state-e2e`、`turn-watch-verify`）；导出面 51 符号逐字相同；导入图无环；文件体量预算（每模块 ≤1,500 行、`session.ts` ≤50 行）；三平台 release 冒烟 |
| 回滚点 | B7 合并提交 revert（barrel 切回单文件上一版）；这是唯一改变 import 解析的批次，回滚需整体 revert |

**执行顺序建议**：B0 → B1 →（B2、B3 可并行，若并行需两个 worktree，合并时按 B2→B3 顺序 rebase）→ B4 → B5 → B6 → B7。**B4 与 B7 之间不建议插入 session.ts 热修**；紧急修复走 owner 协调、rebase 后重新跑该批门槛。

## 6. 测试与风险

### 6.1 现有测试如何保护「无行为变化」

| 保护层 | 机制 | 覆盖 |
| --- | --- | --- |
| 类型层 | `npm run typecheck`（627 测试文件全部在 tsconfig include 内） | 签名/导入/端口形状 |
| 行为层 | 70 个导入 `SessionManager` 的测试；桌面套件 76 文件 / 41k 行 | 排队顺序、回交去重、派发、固定路径、卡片、重放、看门狗、网络、多 runtime |
| 差分基线 | 三套冻结 known-red（runtime-core 33 / 门禁引擎 5 / 编排 24）逐名 diff | 防「修好一个坏掉一个」与新增失败 |
| 源码钉子 | 14 个文件的字符串/顺序/计数断言（B0 聚合读取后继续有效） | 关键接线与顺序不被搬丢 |
| 全链定向 | `fixed-path-full-chain.test.ts` 等端到端假会话链路 | 跨模块接线的整体语义 |
| 搬运审计 | `git diff -M` + 归一化方法体比对 | 防「搬运时顺手改逻辑」 |

### 6.2 需要新增的结构性测试（B0 建骨、后续增量）

1. **导出面快照**：`Object.keys(await import("app/desktop/session.ts"))` 与 51 符号清单逐字比对（类型导出用 `import type` 的编译期检查补足）。
2. **导入图无环**：扫描 `app/desktop/session/**/*.ts` 的 import，构建图并断言：无环；feature 模块只导入 L0 或白名单下层；只有 `index.ts`/`session.ts` 导入 feature 模块。
3. **门面兼容面快照**：`SessionManager.prototype` 的公开方法名集合 + 九个私有内部名（物理属性）仍在。
4. **文件体量预算**：`session.ts` ≤50 行；单模块 ≤1,500 行（`lifecycle/open.ts` 拆 builder 后达标）；超限即失败。
5. **工具面快照**（B7 前）：对同一 fixture 记录 `openRoleSession` 注入的工具名集合与顺序，迁移前后逐项相同。
6. **搬运等价性脚本**（不入库或作为测试工具）：对每批方法做归一化 body diff，输出差异清单供复核。

### 6.3 风险清单与对策

| # | 风险 | 等级 | 对策 |
| --- | --- | --- | --- |
| R1 | **源码钉子**（14 文件、~45 断言）在代码搬走后失效；「原测试完全不动」不可行 | 高 | B0 聚合读取器 + 机械改指（Q1）；顺序/相邻性钉子按模块读取；禁止删/弱化断言；客户与验收确认清单 |
| R2 | **投递时序/队列顺序**：`busy` 置位、认领段、drain 链、settled 复位被拆散 | **最高** | 状态单 owner（delivery）；`DeliverySink` 只暴露「发送」；保留 `entry.busy = true` 先于 `await` 的源码顺序；message-queue/handback-delivery/queue-recovery/turn-lease/replay-safe-retry 全过；B4 单独成批 |
| R3 | **幂等/重放**：回交/派发/应用任务/恢复的键与屏障分散 | 高 | 键与状态随主迁移（delivery/handback/tasks-store）；`restore*` 按整段搬；task-restart/pending-card-restart/queue-recovery 门禁；禁止重排恢复顺序 |
| R4 | **turn 结算/停止屏障**：origins、commit maps、fence、deferred run change | 高 | 原样搬运 `consume`/`forceResetDeliveryState`/`waitForRunStopDeliveryClaims`；run-change 单独成批；run-stop/full-chain 套件 |
| R5 | **共享可变状态**：72 字段、`sessions`/`deps` 跨 10 簇 | 高 | §3.6 归属表；单写 owner；只读端口；code review 检查「无第二份状态」 |
| R6 | **循环依赖** | 中 | contracts-only 跨模块规则；导入图结构测试；端口由门面实现；两阶段装配 |
| R7 | **`openInternalUnsafe` 闭包/工具面**：条件/顺序微变导致能力放宽或收窄 | 高 | 8 builder 连续块切割；工具面快照；boundary-refresh/ans-wiring/operator-channel/download/acceptance 套件；B7 最后做 |
| R8 | **三平台 CI 成本**：627 文件 × 3 平台 × 每批一次不可接受 | 中 | 批内只跑本地 typecheck+受影响套件；B4/B6/B7 波次边界跑单平台/三平台 release 冒烟；不触发无关 release workflow |
| R9 | **与发布期热修冲突**：session.ts 是热点 | 中 | §1.4 启动条件；单批单 owner；批间 rebase；热修优先并重跑该批门槛 |
| R10 | **TS 运行约束**：type stripping/erasableSyntaxOnly | 低 | 不用 enum/namespace/参数属性；import 带 `.ts`；`import type`；typecheck 门禁 |
| R11 | **模块体量回涨**：cards/fixed/lifecycle 仍 >1,200 行 | 中 | 目录级拆分（cards/、fixed-workflow/、lifecycle/）；文件体量预算测试 |

### 6.4 非目标（再次明确）

不改外部行为/协议/存储格式；不改 v2.0.0 发布流程；不改 UI；不新增/删除工具与卡片；不修缺陷；不优化性能；不重命名公开 API；不改角色卡/边界/治理。

## 7. 工作量估算

| 批次 | 人日（1 名实现 + 复核） | 代理轮次 | 说明 |
| --- | ---: | ---: | --- |
| B0 | 0.5–1 | 1–2 | 基线/钉子/结构测试骨架 |
| B1 | 1.5–2 | 2–3 | 类型与共享叶，机械但面广 |
| B2 | 1–1.5 | 2–3 | 证据/持久化，低耦合 |
| B3 | 2–3 | 3–4 | 任务/诊断/运行环境 |
| B4 | 2.5–3.5 | 3–5 | 投递队列，第一高风险 |
| B5 | 3–4 | 4–5 | 卡片/版本决策/run-change，最大簇 |
| B6 | 3.5–4.5 | 5–6 | 派发/固定/回交，接线最多 |
| B7 | 3.5–5 | 5–7 | 生命周期/open 分解/barrel |
| **合计** | **17.5–24.5 人日** | **25–35 轮** | 单轨串行约 5–6 周；B2/B3 并行可省 1–2 周 |

估算前提：实现角色熟悉本文件；每批有独立复核（搬运审计 + 套件复跑）；不含发布窗口等待与外部阻塞。若客户要求「原测试完全不动」，B0 的钉子治理无法进行，整体不可行——需先解决 Q1。

## 8. 开放问题（默认项供客户确认）

| # | 问题 | 推荐默认 |
| --- | --- | --- |
| Q1 | 是否允许 14 个源码钉子测试做「只改读取路径」的机械改指？ | **允许**（否则重构不可行；断言语义不变，不删不弱化） |
| Q2 | 模块粒度：13 模块 / ~25 文件，还是更少/更多？ | **13 / ~25**（按职责与依赖层次） |
| Q3 | `activeDispatchKeys` 的写归属（delivery 送达释放 vs tasks 派发写入） | **shared/tasks-store 单写**，delivery 经 `TaskBook` 端口释放；避免双写 |
| Q4 | `sessions` 是否在 v1 就迁入 lifecycle？ | **否**，门面保留 + 只读端口；后续独立事项再收紧 |
| Q5 | 是否保留九个私有内部名作为测试兼容面？ | **是**（否则 15 个测试文件要改内部访问，超出「原测试不改」） |
| Q6 | CI 节奏：每批三平台，还是只在 B4/B6/B7 波次边界跑？ | **波次边界**（B4/B6 单平台冒烟，B7 三平台） |
| Q7 | 是否保留 `git-ports` 独立模块（仅 ~150 行）？ | **保留**（接线集中，避免散落 lifecycle/fixed） |
| Q8 | 启动时点：v2.0.0 发布后立即开始，还是等一个观察窗口？ | **发布后 + 3 个工作日观察窗**，确认无 release 阻断回流 |

## 9. 状态与下一步

- 本方案只读产出；未实施、未测试、未改任何代码/测试/角色卡/边界。
- 下一步：客户确认 §8（重点 Q1/Q2/Q3），确认后由统筹安排 v2.0.0 发布后的 B0 启动与团队计划。
- 本方案实质变更递增版本并重开确认；实施中的任何语义偏离（非纯搬运）必须回到本方案评审。

---

## 附录 A：234 方法迁出清单（模块 / 起始行 / 行数）

> 行数为方法体行数（不含前导 JSDoc）；起始行为当前文件行号。用于搬运核对，不构成实施顺序。`constructor(1940,5)` 归门面（不计入下列模块），合计 234。

### lifecycle — 47 方法 / 2,142 行
openObservedRoleSession(1698,32)、ownsControllerDisposal(1730,5)、disposeObservedHandle(1735,17)、observeWatchdog(1954,7)、noteWatchdogActivity(1963,4)、profileRevision(1981,1)、profileChanged(1982,5)、hasBusyRuntime(1987,1)、hasStaleProfile(1988,1)、liveSessionViews(1989,3)、listBackgroundTasks(1998,24)、readBackgroundTask(2027,31)、stopBackgroundTask(2064,21)、healStaleOrigin(2096,16)、beginDeliveryOrigin(2118,7)、captureDeliveryOrigin(2126,7)、sendDelivery(2134,111)、sendFacts(2246,9)、trimDeliveryOrigins(2256,8)、failDeliveryOrigin(2265,6)、activeEntry(2273,3)、disposeEntry(2282,66)、evictBeyondLimit(2360,19)、isPrimarySession(2386,4)、open(2576,13)、openBackground(2661,14)、sendBackground(2691,15)、isRoleBusy(2727,3)、hasLiveSession(2732,3)、wasLastTurnAborted(2737,3)、hasPendingDelivery(2742,5)、waitForRoleSettle(3567,22)、waitForRoleIdle(3602,35)、openInternal(3638,19)、openInternalUnsafe(3663,1090)、consume(4758,233)、send(4998,125)、abort(5133,28)、stop(5221,53)、isOpen(5276,3)、openForRoleId(5281,3)、liveRoleIds(5286,3)、findLiveRuntime(7184,6)、ensureFreshRoleSession(7287,11)、rebuildSession(11691,12)、rebuildSessionUnsafe(11705,29)、isCustomerInitiatedTurn(11789,6)

### session-env — 11 方法 / 426 行
installationEffectObservations(1473,3)、refuseUnprovenInstallation(1476,16)、boundaryDiff(2402,15)、currentSkillPaths(2429,19)、rebuildIfBoundaryStale(2459,20)、rebuildIfBoundaryStaleUnsafe(2480,52)、queueRebuildWritePermitsNotice(2542,10)、refreshStaleBoundaries(2558,14)、activateRoleRefresh(11805,14)、applySkillChange(11828,133)、applyMcpChange(11979,130)

### delivery — 27 方法 / 1,188 行
deliveryIsStopped(1790,3)、deliveryLifecycle(1793,3)、resumeDelivery(1796,3)、queueDirectNotification(2708,17)、forceResetDeliveryState(5169,47)、appTaskClientMessageId(8107,6)、appTaskClientMessageIdFromSeed(8115,4)、appDispatchClientMessageId(8121,4)、rememberAppTaskDelivered(8127,9)、pendingAppTaskDelivery(8138,15)、enqueueDelivery(8154,20)、persistableDeliveryItem(8178,30)、deliveryStoreItems(8210,20)、deliveryQueuePersistenceFacts(8231,6)、finishStopPersistence(8238,11)、persistDeliveryQueues(8251,27)、parsePersistedDeliveryItem(8280,74)、restorePersistedDeliveries(8363,112)、withdraw(8487,39)、notifyRoleState(8532,46)、broadcastRoleStates(8580,5)、redeliverNudge(11740,34)、drainAllQueuesFor(12728,11)、drainPiQueuesAcrossProjects(12740,9)、waitForRunStopDeliveryClaims(12757,23)、drainQueue(12781,25)、drainQueueUnsafe(12827,585)

### handback — 4 方法 / 233 行
displayHandback(8623,4)、handbackFlowId(8711,8)、handleHandback(8720,12)、commitHandback(8733,209)

### dispatch — 5 方法 / 1,079 行
routeDispatch(8968,223)、chainDispatchFacts(9196,152)、captureChiefDispatchSource(9357,17)、resumeChiefController(9375,39)、routeStarDispatch(9415,648)

### fixed-workflow — 16 方法 / 1,185 行
inspectFixedHandbackChild(5352,45)、routeFixedPathDispatch(10082,492)、completeTeamPlanFixedForHandle(10592,45)、closeCreatedTaskFixedForSession(10643,53)、verifyFixedReviewCloseBasis(10704,21)、prepareFixedAppointmentCardRequest(10914,36)、recordFixedCardWorkflowResolution(10960,114)、ensurePathBStartForDispatch(11076,22)、checkPathBWriteSetForDispatch(11104,41)、presentMergeMainCard(11147,25)、runFixedReleaseMerge(11184,33)、settleMergeMainCard(11224,85)、autoPresentFixedReleaseMerge(11321,97)、noteFixedReleaseAutoTrigger(11472,10)、fixedPanelState(11488,60)、dispatchAdvisorySummary(11550,6)

### evidence — 9 方法 / 595 行
findFixedReviewArtifact(10731,17)、buildFixedCloseEvidence(10757,107)、collectFixedProposalDocumentRefs(10869,40)、fixedReleaseAutoEvidence(11424,46)、evidenceCheckText(12116,98)、evidenceScopeRoots(12221,82)、contractCheckText(12312,116)、contractCheckTextFixed(12436,85)、docFormatText(12531,4)

### cards — 43 方法 / 2,177 行
interpretDirective(2597,58)、requestRequirementChangeDecision(2757,44)、requestRunChangeDecision(2808,120)、pickGovernedCardEntry(2935,18)、presentAppCard(2961,32)、presentVersionChangeCard(2995,16)、presentAmendmentItemCard(3013,20)、presentStableWriteCard(3035,25)、noteVersionChange(3062,9)、noteVersionChangeInitiator(3073,8)、reportPlanEscalation(3089,44)、afterPlanEscalation(3135,66)、afterStableWrite(3207,26)、enrichAppointmentWriteBoundaryCard(3239,42)、afterAppointmentWriteApproved(3288,56)、activeRunViews(3350,18)、proposalCardFrozenRejection(3375,25)、pendingVersionChangesFor(3405,21)、offerRunChangeOnFrozenContract(3434,90)、requestIdFor(5487,16)、notifyRequest(5505,35)、recordRequestPresented(5541,7)、appointmentWriteApplicationRejection(5561,112)、enrichAcceptanceJudgeContext(5679,220)、withRequestLifecycle(5904,391)、versionDecisionSubjectKey(6426,3)、isVersionDecisionRequestIdForSubject(6431,8)、findPendingVersionDecision(6440,15)、pendingRequestIdsForFlow(6456,9)、countAcceptanceRejections(6466,13)、countPriorVersionDecisions(6480,9)、buildVersionDecisionFacts(6490,36)、versionDecisionCardLabels(6527,20)、decidedByText(6548,4)、formatTargetVersions(6553,3)、stripVersionDecisionPrefix(6557,3)、nextVersionFlowId(6561,17)、mapVersionDecisionRawOutcome(6579,12)、appendVersionDecisionAudit(6592,3)、emitVersionDecisionResolved(6596,8)、requestVersionDecision(6609,345)、restoreVersionDecisions(6959,97)、restoreRequestState(7062,53)

### run-change — 9 方法 / 282 行
runTaskIsFenced(1493,3)、selectRunChangeForHandle(1497,36)、completeTeamPlanForHandle(1542,20)、ownedRunStopMembers(1563,25)、executeOwnedRunStop(1589,47)、resumeDeferredRunChanges(1637,15)、executionInventoryFacts(1667,31)、controllerProducerFacts(7312,9)、stopExactController(7322,96)

### tasks — 17 方法 / 728 行
observeRoleEvent(5434,36)、roleActivityLogText(5472,11)、readRoleActivityLog(6297,3)、listTasks(6302,14)、projectStateView(6323,3)、projectStateTool(6328,11)、projectNote(6344,81)、restoreTasks(7116,67)、partialArtifactsFor(7191,10)、roleTempDir(7203,8)、isolatePartialArtifacts(7217,68)、chooseRedispatchTarget(7300,7)、terminateRoleRun(7419,113)、taskChainRootOf(7533,11)、redispatchTask(7551,165)、closeTask(7721,3)、escalateStuckTask(7729,117)

### diagnostics — 17 方法 / 506 行
governanceOwnerRoleId(3526,3)、governanceRuntimeFor(3531,3)、activeRuntimeFor(3539,5)、governanceProjectionKey(7862,3)、governanceProjectionFingerprint(7870,22)、registerGovernanceClientProjection(7894,16)、lookupGovernanceClientProjection(7912,15)、mirrorGovernanceFeedback(7946,126)、isNetworkOffline(8589,4)、applyNetworkState(8600,20)、watchdogSnapshot(11566,57)、projectRootsWithActivity(11625,7)、lastTurnOf(11634,3)、watchdogDeliver(11644,41)、roleStatusText(12539,96)、diagnosticsTailText(12637,40)、sessionTailText(12681,45)

### persistence — 6 方法 / 77 行
persistenceScope(8621,1)、persistenceKey(8622,1)、mergeReportState(8627,25)、rememberReceipt(8652,4)、registerPersistenceHistory(8656,8)、persistenceOperation(8664,38)

### shared/keys — 3 方法 / 16 行
sessionKey(1968,3)、targetKey(1971,10)、queueKey(8102,3)

### shared/clock — 1 方法 / 3 行
now(1949,3)

### shared/roles — 7 方法 / 47 行
handbackOwnerRoleId(5299,10)、chiefTaskRoleIdOf(5316,5)、dispatcherRoleIdOf(7851,3)、resolveProofFlowIds(8077,3)、findListingForFeedback(8082,10)、roleDisplayName(8094,6)、refreshListingNow(3549,10)

### shared/session-views — 1 方法 / 5 行
contextInfo(2085,5)

### shared/notifier — 1 方法 / 4 行
emitDeliveryNote(7856,4)

### shared/tasks-store — 7 方法 / 47 行
rememberTaskCreator(5312,3)、readTasks(5323,8)、isFixedTask(5333,6)、appendTaskStateResult(5399,6)、appendTaskState(5405,3)、recordTaskFailure(5409,7)、appendRoleActivity(5418,14)

### shared/inventory — 2 方法 / 14 行
inventoryChanged(1653,11)、publishDeliveryInventory(1664,3)

## 附录 B：51 个导出符号清单

| 类别 | 符号 |
| --- | --- |
| 值/类（6） | `SessionManager`、`MAX_LIVE_SESSIONS`、`CAPABILITY_INSTALL_SYSTEM_PREFIX`、`desktopProjectExecutionInventory`、`subscribeDesktopExecutionInventory`、`shouldSuppressStarTaskReport` |
| 会话/事件/运行（13） | `RuntimeKind`、`SessionEventEnvelope`、`DesktopOrchestrationEvent`、`SessionOpenRequest`、`OpenResult`、`SendResult`、`StopResult`、`WithdrawResult`、`SessionTarget`、`SessionMessageMetadata`、`ActiveRunView`、`RunChangeMode`、`EffectiveConfigInfo` |
| 持久化（9） | `PersistenceScope`、`PersistenceReply`、`PersistenceCapabilities`、`PersistenceValues`、`PersistenceUpdated`、`DeliveryQueuePersistenceOutcome`、`DeliveryQueuePersistenceFacts`、`DeliveryQueueRestoreReport`、`PersistedDeliveryItemV1` |
| 后台任务（6） | `BackgroundTaskView`、`BackgroundTasksListReply`、`BackgroundTaskReadInput`、`BackgroundTaskReadReply`、`BackgroundTaskStopInput`、`BackgroundTaskStopReply` |
| 任务/终止（10） | `TaskListView`、`TaskRestoreReport`、`TerminateRoleRunInput`、`TerminateRoleRunResult`、`RedispatchTaskInput`、`RedispatchTaskResult`、`CloseTaskInput`、`CloseTaskResult`、`RebuildSessionResult`、`RedeliverResult` |
| 治理/安装/库存/登记（7） | `GovernanceClientProjectionV1`、`SessionManagerDeps`、`NativeProjectRegistration`、`InstallationCapabilityTool`、`InstallationEffectRefusalObservation`、`DesktopSessionInventoryFact`、`DesktopProjectExecutionInventory` |

> 合计 6+13+9+6+10+7 = **51**；`SessionManagerDeps` 含 20+ 子类型但只导出自身形状（子类型保持内部）。附录 B 是 §4.1 barrel 的逐字清单来源；结构测试以本清单为准。
