# B2 适配清单与行为等价论证（evidence / persistence 模块壳）

- 日期：2026-11-13
- 范围：`app/desktop/session/evidence.ts`（9 方法）、`app/desktop/session/persistence.ts`（6 方法）
- 结论：**15/15 方法文本在记录化适配下逐字节相等**（`moved-methods.json.allMethodsIdenticalUnderDocumentedAdaptations=true`；
  方法体花括号切片 sha256 亦全部相等：`allMethodBodiesIdentical=true`）。

## 1. 方法 → 模块

| 模块 | 方法 | HEAD 源行（7519e6f） | 目标行 | 记录化适配 |
| --- | --- | --- | --- | --- |
| evidence.ts | findFixedReviewArtifact | 9703-9719 | 56-72 | 可见性 private→public |
| evidence.ts | buildFixedCloseEvidence | 9729-9835 | 82-188 | 可见性 private→public |
| evidence.ts | collectFixedProposalDocumentRefs | 9841-9880 | 194-233 | 可见性 private→public |
| evidence.ts | fixedReleaseAutoEvidence | 10396-10441 | 240-285 | 可见性 private→public |
| evidence.ts | evidenceCheckText | 11088-11185 | 291-388 | 可见性 private→public |
| evidence.ts | evidenceScopeRoots | 11193-11274 | 396-477 | 可见性 private→public |
| evidence.ts | contractCheckText | 11284-11399 | 487-602 | 可见性 private→public |
| evidence.ts | contractCheckTextFixed | 11408-11492 | 611-695 | 可见性 private→public |
| evidence.ts | docFormatText | 11503-11506 | 706-709 | 可见性 private→public |
| persistence.ts | persistenceScope | 7572 | 68 | 可见性 private→public |
| persistence.ts | persistenceKey | 7573 | 70 | 可见性 private→public |
| persistence.ts | mergeReportState | 7578-7602 | 72-96 | 可见性 private→public |
| persistence.ts | rememberReceipt | 7603-7606 | 98-101 | 可见性 private→public |
| persistence.ts | registerPersistenceHistory | 7607-7614 | 103-110 | inline import 路径 `./runtime-history.ts` → `../runtime-history.ts`（`private` 本就不存在） |
| persistence.ts | persistenceOperation | 7615-7652 | 112-149 | 无 |

可见性适配仅为门面委托可调用（模块类方法不进入 `session.ts` 公开导出面，导出面仍 51 符号）。

## 2. receiver/state 面重建（类外壳，方法体零改动）

### evidence.ts `class Evidence`

| 原 receiver 引用 | 模块实现 | 等价性 |
| --- | --- | --- |
| `this.deps.getListing(...)` | 构造注入的 `deps: Pick<SessionManagerDeps,"getListing"|"refreshListing">`（**同一 deps 对象引用**） | 仍以 `deps.getListing(...)` 方法调用形式执行；receiver（deps 对象）不变 |
| `this.refreshListingNow(projectRoot)` | 同名 private 方法 → `shared/roles.ts::refreshListingNow(projectRoot, this.deps)` | 与原门面委托调用的共享函数、入参完全相同 |
| `this.readTasks(projectRoot)` | 同名 private 方法 → `shared/tasks-store.ts::readTasks(projectRoot)` | 同上 |
| `this.evidenceScopeRoots(...)` / `this.contractCheckTextFixed(...)` / `this.findFixedReviewArtifact(...)` | 模块类内同名方法 | 模块内互调解析到同一实现（原为类内互调） |

### persistence.ts `class Persistence`

| 原 receiver 引用 | 模块实现 | 等价性 |
| --- | --- | --- |
| `this.sessions` | `PersistenceState.sessions`（`ReadonlyMap`，**同一 Map 实例**）经 getter 暴露 | 仅调用 `.get(...)`（只读），键由同一 `sessionKey` 生成 |
| `this.reportStates` / `this.attemptStates` / `this.knownReports` / `this.knownAttempts` / `this.persistenceInFlight` | `PersistenceState` 五项（**同一 Map/Set 实例**）经 getter 暴露 | 读/写落到原实例；门面其他路径（如 `disposeEntry`）读写的是同一对象 |
| `this.persistenceScope(...)` / `this.persistenceKey(...)` | 模块类内同名方法（逐字搬移） | 同实现 |
| `this.mergeReportState(...)` / `this.rememberReceipt(...)` | 模块类内同名方法（逐字搬移） | 同实现 |
| `this.sessionKey(...)` | 同名 private 方法 → `shared/keys.ts::sessionKey(...)` | 与原门面委托的共享函数相同 |
| `this.handleHandback(...)` | `PersistenceHandbackPort.handleHandback` → 门面构造时以箭头回调注入 `this.handleHandback(...)`，**7 个位置参数逐个原样转发** | `this` 绑定为 SessionManager（箭头捕获）；参数（含显式 `undefined`）逐位一致 |
| `this.handbackFlowId(...)` | `PersistenceHandbackPort.handbackFlowId` → 门面箭头回调 | 同上（2 参数） |

## 3. 状态归属（方案 §3.6）

`reportStates` / `attemptStates` / `knownReports` / `knownAttempts` / `persistenceInFlight` 五项**仍声明在
`SessionManager`**（与 B1 同款口径：状态暂留门面），构造时以**同一实例引用**装入 `PersistenceState`；
`persistence.ts` 只在 getter 后读写这些对象。因此多 `SessionManager` 实例的隔离性与迁移前完全一致
（每个实例一组 Map/Set）；不存在模块单例、无跨实例共享。`sessions` 亦为门面字段（方案 §3.6：门面保留），
以只读视图传入。

## 4. 无行为变化的其他证据

- 条件/顺序/错误码/文案/返回值：方法文本逐字相等（见 `moved-methods.json` 的 sha256），不存在改写点。
- `structuredClone`、`mainT`、`fs`、`path`、`createHash`、`Buffer` 等均为与原文件相同的运行时绑定。
- 门面 15 个委托**同名、同签名（含泛型/默认参数/可选参数）、同可见性**；调用方（类内、`interface.ts`、
  `b3-fixed-baseline-pathb.test.ts` 的运行时 cast 等）路径不变。
- 装配时机：`Evidence`/`Persistence` 在 `SessionManager` 构造体内构造；端口方法只在运行期被调用
  （两阶段装配原则），不改变构造期语义；状态字段均为字段初始化器，构造体内已就绪。
