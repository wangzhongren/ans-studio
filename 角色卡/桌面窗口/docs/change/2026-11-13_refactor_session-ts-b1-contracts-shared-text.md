# B1（提交 1/2）：session.ts 契约目录 + 顶层函数搬移到 shared/*

- 日期：2026-11-13
- 角色：桌面窗口
- 工作树：`.claude/worktrees/refactor-session-ts-b1`（分支 `refactor/session-ts-b1`）
- 起点：`cf63cc7`（= origin/main，含 B0）
- 方案：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §3.1–§3.3、§4.1、§5 B1、附录 A/B
- 范围：**B1 第一段（提交 1/2）**——契约目录 + 顶层类型/接口搬移 + 11 个顶层函数搬移 + 导入区重构。
  22 个类方法的委托化（B1 提交 2/2）**未做**，留给后续同角色上下文。

## 1. 结果摘要

| 项 | 值 |
| --- | --- |
| `app/desktop/session.ts` 行数 | 13,491 → **12,421**（-1,070） |
| 新增文件 | 6 个（contracts 4 + shared 2），共 1,224 行（`wc -l`） |
| 搬移块 | **41 块**（类型 31 块 + 文本函数 9 段 + 库存状态/函数 1 段；逐字比对见证据） |
| 导出面 | 运行时 6 值（逐字不变）＋ 类型 45（typecheck 编译期钉住） |
| 类方法改动 | **仅 1 行**（`inventoryChanged` 的计数器自增改经 inventory 模块函数，见 §4） |

新增文件与行数：

| 文件 | 行数 | 内容 |
| --- | ---: | --- |
| `app/desktop/session/contracts/session-types.ts` | 480 | 会话/事件/运行/投递/安装/库存契约（32 个声明块） |
| `app/desktop/session/contracts/persistence.ts` | 13 | 持久化面契约（5 个类型） |
| `app/desktop/session/contracts/tasks.ts` | 163 | 后台任务/任务账本/终止/重派/收口契约（15 个类型） |
| `app/desktop/session/contracts/deps.ts` | 360 | `SessionManagerDeps`（1 个声明，325 行块） |
| `app/desktop/session/shared/text.ts` | 173 | 9 个顶层纯函数（含仅被其使用的私有常量） |
| `app/desktop/session/shared/inventory.ts` | 35 | 2 个顶层库存函数 + 单例状态（注册表/revision/listener） |

## 2. 搬出块清单（源行号 → 目标文件）

完整逐块清单（含 sha256、目标起止行、适配标签）：`…_evidence/moved-blocks.json`；人读摘要：`…_evidence/moved-blocks-summary.md`。

| 源（`session.ts` @ cf63cc7） | 目标 |
| --- | --- |
| 358–362 | `contracts/persistence.ts` |
| 353–357、363–370、372–395、404–411、413–422、424–436、441–456、458–469、471、473–491、493–523、525–533、534–539、541–547、1030–1043、1045–1049、1051–1070、1072–1073、1075–1174、1176–1231、1233–1267、1269–1280、1407–1436 | `contracts/session-types.ts` |
| 549–598、600–625、627–654、656–678、680–693、695–702 | `contracts/tasks.ts` |
| 704–1028 | `contracts/deps.ts`（`SessionManagerDeps`） |
| 1282–1302、1306–1308、1310–1322、1324–1340、1342–1360、1371–1401、13439–13455、13457–13462、13464–13491 | `shared/text.ts`（9 函数） |
| 1437–1455 | `shared/inventory.ts`（2 函数 + 单例状态） |

搬移口径：**连续代码块切割**，块文本按原样嵌入目标文件（含 JSDoc/注释）；哈希证明见 §5。

保留在 `session.ts` 的值（未搬）：

- `MAX_LIVE_SESSIONS`（导出值）、`CAPABILITY_INSTALL_SYSTEM_PREFIX`（导出值）——类方法直接使用，目标文件非 shared 归属；
- `MAX_DELIVERED_APP_TASK_IDS`、治理去重/投影常量、`PROOF_STATUS_TEXT`——类方法私有面。
- `export type { RuntimeKind }` / `export type { RunChangeMode }`——既有「自 src 只读转出」语句原位置保留。

## 3. 适配清单（仅 import/导出/组装，声明体与函数体逐字不变）

1. **导出适配**：契约中的内部类型（`InternalSessionOpenRequest`、`DeliveryAssignment`、`DeliveryOrigin`、
   `ActualDispatchSource`、`ControllerDisposalLease`、`LiveSession`、`ControllerResumeDelivery`、`DeliveryItem`、
   `DesktopRunStopFact`、`DesktopControllerStopFact`）与 9 个函数、`APP_TASK_CLIENT_MESSAGE_ID_PREFIX`、
   库存状态三元组加 `export` 前缀（供 `session.ts` 导入；其中仅 `shouldSuppressStarTaskReport` 与两个库存函数
   从 `session.ts` 再导出，其余仍为内部面）。
2. **内联 `import("…")` 相对路径**（随目录深度调整，仅 4 处）：
   - `session-types.ts`：`import("../../src/model/trunk.ts")` → `import("../../../../src/model/trunk.ts")`（2 处）；
   - `deps.ts`：`import("../../src/model/boundary.ts")` → `…/…/src/…`（4 级）、`import("./watchdog.ts")` →
     `import("../../watchdog.ts")`。
3. **契约文件 import 解析**：`DownloadRequestRuntime`/`DownloadRequestOptions` 从
   `src/pipeline/orchestration/download-request.ts` 只读导入；`RoleStatusFn`/`SessionTailFn` 从
   `src/common/编排/watchdog.ts`；`createDirectiveInterpreter as realCreateDirectiveInterpreter` 别名保留。
4. **库存单例状态迁出**（`shared/inventory.ts`，三处声明适配）：
   - `desktopSessionManagers`：`Set<SessionManager>` → `Set<DesktopSessionManagersSource>`（结构最小面；
     会话类在 `session.ts` 以 `as unknown as Set<SessionManager>` 别名收窄，**运行时同一 Set 实例**）；
   - `desktopExecutionRevision` 迁出为 `export let`，新增 `bumpDesktopExecutionRevision()`；
   - `inventoryListeners` 加 `export`（会话类 `inventoryChanged` 迭代同一 Set）。

## 4. 唯一类方法适配（行为等价，逐行可核）

`inventoryChanged` 中：

```diff
-    desktopExecutionRevision++;
+    bumpDesktopExecutionRevision();
```

原因：计数器随状态**单例迁入 `shared/inventory.ts`**（方案 §5 B1「内部状态一并搬入并保持单例」），ESM
导入绑定不可赋值；`revision: desktopExecutionRevision` 的读取仍走导入绑定（live binding，值不变）。
其余类方法体与 HEAD **逐字一致**——证据：`moved-blocks.json.classRegion`（HEAD 1457–13437 vs 新文件
归一化后 `sha256` 相等；原始差异恰 1 行，即上述 diff）。行为由 W3「revision 严格递增」集成用例覆盖（通过）。

## 5. 「逐字移动」证明

脚本（temp）对 41 个块逐一：

1. 从 `git show HEAD:app/desktop/session.ts` 取原块（1-based 闭区间）；
2. 仅应用上表**声明适配**（export 前缀 / 内联路径 / 库存三声明），得到归一化块；
3. 在目标文件中 `indexOf` 归一化块并断言命中；对块与命中切片分别计算 `sha256`；
4. 输出源行号 → 目标行号、适配标签、`adaptationLineChanges`（无适配块 = 0）。

结果（`moved-blocks.json`）：`allBlocksIdenticalUnderDocumentedAdaptations = true`；
`classRegionNormalizedEqual = true`；`singleClassMethodLineAdaptation = true`；
`sessionTs 13491 → 12421`；运行时导出键 6 个逐字一致。

复现命令（脚本不入库，位于系统 temp）：见 `…_evidence/moved-blocks.json` 的 `ref`/`generatedAt` 字段与
`moved-blocks-summary.md` 的块清单。

## 6. 结构测试适配（仅测试骨架映射）

`test/桌面应用/session-structure.test.ts`：`moduleOf` 增加一行

```ts
if (top === "contracts") return "contracts";
```

`MODULE_LAYERS.contracts = 0`、`FEATURE_IMPORT_WHITELIST.contracts = []` 与全部断言/白名单/规则**逐字未动**。
（`L0 contracts 只可依赖 src/model 与基础类型`规则由既有 `sourceModule === "contracts"` 分支自动生效。）

## 7. 验证结果

| 门槛 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npm run typecheck` | **EXIT=0** |
| 结构保护 | `node --test --test-timeout=120000 "test/桌面应用/session-structure.test.ts"` | **8/8 通过**（导出面 6 值 + 45 类型、导入图无环、分层/白名单、体量预算、工具面快照 7 角色逐字一致） |
| 聚合读取器 | 同上 + `session-source.test.ts` | **13/13 通过** |
| 行为主套件 | `node --test … "test/桌面应用/session.test.ts"` | 6/7 通过；**1 个既有失败**（AC-8 doc-format 字节 pin：实测 5244 ≠ 5223，**基线 cf63cc7 同样失败**；pin 与 `doc-format-specs.ts` 同源于 `ecf9ead`，其后 `24af13d`/`6482387` 改动 specs 未同步 pin——与 B1 无关） |
| 钉子·message-queue | 同批运行 | 全绿 |
| 钉子·boundary-refresh | 同批运行 | 全绿 |
| 钉子·directive-input | 同批运行 | 14/19 通过；**5 个既有失败**（sendSession 指令面板用例，**基线 cf63cc7 逐名相同**；与 B1 无关） |
| 钉子·chief-workflow | 同批运行（约 25 分钟） | **58/66 通过**；失败集与基线**逐名相同或更少**（基线 57/66，多 1 个 `unmanaged` 子测不稳定失败；B1 **无新增失败**） |
| 其他受影响套件 | `hot-path`、`interface`、`role-log` | **16/16 通过** |
| 其余源码钉子 | `queue-status`、`request-status`、`evidence-markers`、`dispatch-fresh-enum`、`run-change-entry` | **17/17 通过** |

已知失败均为基线既有（附基线原始日志于证据目录），B1 无新增失败。三套 known-red（runtime-core/门禁引擎/编排）
不在本段执行范围。

## 8. 边界声明

- 只改：`app/desktop/session.ts`、`app/desktop/session/contracts/**`、`app/desktop/session/shared/{text,inventory}.ts`、
  `test/桌面应用/session-structure.test.ts`（仅 `moduleOf` 一行）、`角色卡/桌面窗口/` 下本记录与证据。
- 未动：类方法（除 §4 一行）、其他 shared 模块、14 个钉子文件、`test/桌面应用/session-source.ts`、其他生产代码。
- 未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占 9222/9223/9224；未启动 Electron/真实模型。
- 注：`角色卡/桌面窗口/boundary.{md,yaml}` 的两处 `Delta-B0-1`（补登 `session-structure.test.ts` 逐文件授权）
  在本次会话期间由**其他上下文**写入（2026-11-13 12:34），非本段产出，未改动、未回滚。

## 9. 后续（B1 提交 2/2 提示）

- 22 个类方法委托化（shared/keys、clock、roles、notifier、session-views、tasks-store、inventory 的
  `inventoryChanged`/`publishDeliveryInventory`）在第二段进行；届时 `inventoryChanged` 的临时 bump 适配
  将随方法体迁入 `shared/inventory.ts` 一并收口（`desktopSessionManagers` 的类型收窄别名也可退化为端口）。
