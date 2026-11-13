# B2：session.ts 证据与持久化 15 个类方法迁出（纯搬运 + 薄委托）

- 日期：2026-11-13
- 角色：桌面窗口
- 工作树：`.claude/worktrees/refactor-session-ts-b2`（分支 `refactor/session-ts-b2`）
- 起点：`7519e6f`（= origin/main，含 B0/B1；`session.ts` 12,388 行）
- 方案：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §3.3 / §3.6 / §4.2 / §5 B2、附录 A
- 范围：**B2 单批**——按附录 A 归属，把 evidence 组 9 方法 → `app/desktop/session/evidence.ts`、
  persistence 组 6 方法 → `app/desktop/session/persistence.ts`；`SessionManager` 保留**同名同签名同可见性**
  的薄委托。方法体**逐字节搬移**（仅记录化 receiver/state 适配，见 §3）。

## 1. 结果摘要

| 项 | 值 |
| --- | --- |
| `app/desktop/session.ts` 行数 | **12,388 → 11,756**（-632；`wc -l` 口径） |
| 搬出方法 | **15 个**（15/15 归一化逐字节相等；方法体 sha256 亦全部相等，见 `…_evidence/moved-methods.json`） |
| 新增模块 | `session/evidence.ts`（710 行，9 方法）、`session/persistence.ts`（150 行，6 方法） |
| 公开导出面 | 运行时 6 值 + 类型 45 **逐字不变**（结构测试 8/8） |
| 模块边界 | evidence/persistence 均 L1、feature 白名单 `[]`；只导入 contracts/shared 与外部 src（结构测试强制通过） |
| typecheck | **EXIT=0** |
| 六文件 | 与干净 7519e6f 基线**逐名一致、零新增**（唯一失败为 task-restart 既有 1 项） |
| 14 源码钉子 | 失败名与干净 7519e6f 基线**逐名一致、零新增**（directive-input 5 / chief-workflow 8 / h-scope-audit 3 为既有） |
| 结构预算 | `SESSION_TS_FROZEN_BASELINE_LINES` 13,491 → **12,388**；实测 11,756 ≤ 12,388 |

## 2. 15 方法 → 模块清单（HEAD 源行 · 目标行）

| 模块 | 方法 |
| --- | --- |
| `session/evidence.ts` | `findFixedReviewArtifact`（9703 · 56）、`buildFixedCloseEvidence`（9729 · 82）、`collectFixedProposalDocumentRefs`（9841 · 194）、`fixedReleaseAutoEvidence`（10396 · 240）、`evidenceCheckText`（11088 · 291）、`evidenceScopeRoots`（11193 · 396）、`contractCheckText`（11284 · 487）、`contractCheckTextFixed`（11408 · 611）、`docFormatText`（11503 · 706） |
| `session/persistence.ts` | `persistenceScope`（7572 · 68）、`persistenceKey`（7573 · 70）、`mergeReportState`（7578 · 72）、`rememberReceipt`（7603 · 98）、`registerPersistenceHistory`（7607 · 103）、`persistenceOperation`（7615 · 112） |

逐方法证据（HEAD 源行/目标行、适配标签、归一化 sha256、方法体 sha256）：`…_evidence/moved-methods.json`；
人读摘要：`…_evidence/moved-methods-summary.md`。

## 3. 适配清单（方法体仅做 receiver/state 适配；条件、顺序、错误码、文案、返回值不变）

1. **模块类外壳**（方案 §3.3 草案即 `class Evidence` / `class Persistence`）：模块方法以同名成员重建原
   `this` 面，因此 **15 个方法文本（签名+体）逐字节搬移**，唯一文本适配：
   - `private` → 模块内 public（仅 14 个原私有方法；`persistenceOperation` 原即 public），供门面委托调用；
     门面侧可见性不变。模块类方法不进入 `session.ts` 公开导出面。
   - `registerPersistenceHistory` 的内联类型 `import('./runtime-history.ts')` →
     `import('../runtime-history.ts')`（模块目录深度变化，纯 import 适配）。
2. **Evidence 的 deps 面**：构造注入 `deps: Pick<SessionManagerDeps,"getListing"|"refreshListing">`
   （**同一 deps 对象引用**）；`this.deps.getListing(...)` 调用形式与 receiver 语义不变。
3. **Evidence 的同义委托**：`refreshListingNow`/`readTasks` 两个 private 成员分别委托
   `shared/roles.ts::refreshListingNow(projectRoot, this.deps)`、`shared/tasks-store.ts::readTasks(projectRoot)`
   ——与门面同名委托调用**同一个共享函数、同一入参**。
4. **Persistence 状态面**：`reportStates`/`attemptStates`/`knownReports`/`knownAttempts`/`persistenceInFlight`
   按方案 §3.6 **仍声明在门面**，构造时以**同一 Map/Set 实例引用**装入 `PersistenceState`；`sessions`
   为门面字段（方案 §3.6），以只读 `ReadonlyMap` 视图传入。模块内 getter 每处读取都落到原实例。
5. **Persistence 的回交端口**：`handleHandback`/`handbackFlowId`（B2 范围外的门面方法）经
   `PersistenceHandbackPort` 箭头回调注入；`this` 绑定为 SessionManager（箭头捕获），**位置参数逐一原样
   转发**（含显式 `undefined`），返回 Promise 原样返回。
6. **类内互调**：`mergeReportState`↔`rememberReceipt`、`persistenceOperation`→两者、
   `evidenceCheckText`→`evidenceScopeRoots`、`contractCheckText`→`contractCheckTextFixed`、
   `buildFixedCloseEvidence`→`findFixedReviewArtifact` 均为模块类内同名方法互调（原为类内 `this.` 互调）。
7. **门面委托**：15 个方法全部保留原签名（泛型、默认参数、可选参数、多行返回类型逐字）与可见性；
   类内既有调用点（`disposeEntry`、`consume` 持久化变更分支、`interface.ts`、
   `b3-fixed-baseline-pathb.test.ts` 的运行时 cast 等）零改动。

方法体逐一哈希证明与等价性论证：`…_evidence/adapters-and-equivalence.md`。

## 4. 状态归属（与 B1 同款口径）

- `reportStates`/`attemptStates`/`knownReports`/`knownAttempts`/`persistenceInFlight` **暂留门面**（方案
  §3.6 最终归属 persistence，后续批次再迁）；以显式状态参数（同一实例引用）传入模块。
  **多实例等价**：状态随 `SessionManager` 实例各自创建，模块不持有模块单例，跨实例隔离性与迁移前一致。
- `sessions` 为门面保留字段（方案 §3.6），模块只读。

## 5. 结构预算收紧

`test/桌面应用/session-structure.test.ts`：

```diff
-const SESSION_TS_FROZEN_BASELINE_LINES = 13491;
+const SESSION_TS_FROZEN_BASELINE_LINES = 12388;
```

同步更新该常量上方注释与文件头第 3 条说明（B2 起按当前实际收紧、只降不升）；测试标题中的数字随
常量同步（**非断言改动**，断言条件/消息模板零改动）。其余断言、白名单、层次表逐字未动。

## 6. 验证结果（最终候选）

| 门槛 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npm run typecheck` | **EXIT=0** |
| 结构保护 | `node --test test/桌面应用/session-structure.test.ts` | **8/8**（导出面 51；导入图无环/分层/白名单；体量 11,756 ≤ 12,388；工具面快照 7 角色） |
| 聚合读取器 | `node --test test/桌面应用/session-source.test.ts` | **5/5** |
| acceptance-evidence | 单文件 | **3/3** |
| b21-basis-gate-desktop | 单文件 | **6/6** |
| doc-format-all-roles | 单文件（实际路径 `test/测试/doc-format-all-roles.test.ts`） | **5/5** |
| replay-safe-retry | 单文件 | **4/4** |
| task-restart | 单文件 | 2 tests / 1 pass / **1 既有失败**（`重启恢复：未投递任务重新入队一次；已投递不前移；重复调用不重复投；坏行跳过`；干净 7519e6f 基线同值复现） |
| pending-card-restart | 单文件 | **1/1** |
| 钉子·evidence-markers / queue-status / request-status | 单文件 | 1/1、5/5、4/4 |
| 钉子·boundary-refresh | 单文件 | **14/14** |
| 钉子·chief-workflow | 单文件（`--test-force-exit`，本机口径） | 66 tests / 58 pass / **8 既有失败**（W5/W10/W19/W33/W34/commit-race/required/selected），与干净基线**逐名相同** |
| 钉子·directive-input | 单文件 | 19 tests / 14 pass / **5 既有失败**，与基线逐名相同 |
| 钉子·dispatch-fresh-enum / hot-path / interface / message-queue / run-change-entry | 单文件 | 2/2、3/3、8/8、20/20、5/5 |
| 钉子·g1-copy-and-nails / h-scope-audit / governance-matrix | 单文件 | 5/5、7 tests 4 pass / **3 既有失败**（逐名同基线）、18/18 |
| 追加·handback-delivery（直接覆盖 `persistenceOperation`/`mergeReportState` 路径；非任务指定门槛） | 单文件 | 18 tests / 16 pass / **2 既有失败**；临时换回干净 7519e6f 重跑基线得到**完全相同的 2 个失败名**（换回后 sha256 校验与 B2 版本一致） |

失败名机械比对：`…_evidence/final/failure-name-diff.txt`（baseline vs final，全部 `NO_DIFF`）。
原始日志：`…_evidence/baseline/`、`…_evidence/final/`。

## 7. 偏差说明（与任务/方案不完全一致之处）

1. **模块形态采用类**而非自由函数：方案 §3.3 的模块类签名草案即 `class Evidence` / `class Persistence`；
   类外壳使原 `this.*` 成员引用全部同名保留，方法文本可达**零改写**（自由函数需逐处适配 receiver 参数，
   文本差异面更大）。依赖规则与导出面不受影响（模块类不导出到 barrel 公开面之外的语义）。
2. **`doc-format-all-roles.test.ts` 路径**：任务写 `test/桌面应用/…`，仓库实际路径为
   `test/测试/doc-format-all-roles.test.ts`（`test/桌面应用/` 下不存在该文件）；已按实际路径运行并与
   干净基线对照，结果 5/5。
3. **结构测试标题数字同步**：除常量与注释外，测试标题中的旧数字 13,491 一并更新为 B2 收紧口径；
   断言、消息模板、白名单、层次表零改动（见 §5）。
4. **session.ts 死导入清理**：搬出后仅被移动方法使用的导入（`archiveAcceptance`、`findAcceptanceArchive`、
   `taskBranchName`、`contractSchemaText`、`docFormatIndexText`/`docFormatSpecText`、
   `intentEntryContractText`/`IntentContractRole`、`rejectionMapSnapshot`、evidence-check 7 个符号、
   `isProjectRelativeFileRef`、`latestVersionedDoc`）一并移除（纯 import 清理；类型检查通过）。移除了
   `doc_format` 数据源的三行历史注释（该说明随方法迁入 evidence.ts 的语义面）。
5. **chief-workflow 本机口径**：按任务披露，单文件运行加 `--test-force-exit`（测试结束强制退出，防
   async_hooks 清理期挂起）；CI 权威命令不变。基线（干净 7519e6f）与最终运行均用同一口径。
6. **已知失败基线**：本批在**修改前**跑干净 7519e6f 全量基线（six + structure/source + 14 钉子），
   修改后在同一工作树重跑；失败名集合逐名 diff 为空（`NO_DIFF`）。task-restart 的 1 项既有失败
   在基线同值复现（2 个运行均约 2s 超时断言，非本批引入）。
   `handback-delivery.test.ts`（追加检查）的 2 个失败先在 B2 工作树观察，再**临时换回干净 7519e6f
   重跑**（`git checkout --` + 暂移新模块，结束后从备份恢复；恢复后 `sha256sum` 与 B2 版本逐字一致），
   干净基线为**完全相同的 2 个失败名**（trio 回交路由 / B 星形回交 task.reported），零新增。

## 8. 边界声明

- 只改：`app/desktop/session.ts`、`app/desktop/session/evidence.ts`（新）、`app/desktop/session/persistence.ts`（新）、
  `test/桌面应用/session-structure.test.ts`（仅预算常量/注释/标题数字）、`角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b2-evidence-persistence*`。
- 未动：`session/contracts/**`、`session/shared/**`、14 个钉子文件、`test/桌面应用/session-source.ts`、
  boundary 文件、其他测试/生产代码/角色目录。
- 未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占 9222/9223/9224；未启动 Electron/真实模型。
