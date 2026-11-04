# `@审批`/`@决策` 自然语言解释——运行时核心类型变更记录（2026-11-04，客户直修）

- 角色：运行时核心（runtime core，仅 Model 类型）
- worktree：`.claude/worktrees/directive-nl-fix`
- 分支：`fix/directive-natural-language`（基于 `origin/main` `c8a9394`）
- 方式：客户直修；只做类型契约的最小新增，不改工具/策略/运行时行为
- 未提交：worktree 内未 commit / push

## 1. 变更内容

文件：`src/model/directive.ts`（276 → 316 行，+41/-1）

新增（均为 type-only 契约，不参与 I/O、不授予写权）：

- `DirectiveInterpretRequest`：`target` / `body`（标记后正文，可跨行）/ `rawText`（含标记原文）/ `projectRoot` / `roleId` / 可选 `runtime`（请求会话引擎）。
- `DirectiveInterpretFailureCode`：`context-missing` / `unsupported-engine` / `aborted` / `timeout` / `unavailable` / `parse-failed` / `low-confidence`（稳定码，只用于诊断/测试，不面向客户）。
- `DirectiveInterpretResult`：成功 `{ok:true, candidate: unknown, confidence: number, notes?}`；失败 `{ok:false, reasonCode, reason?}`。
- `DirectiveInterpretFn`：`(request, signal?) => Promise<DirectiveInterpretResult>`；契约上不抛错。
- 仅新增 `RuntimeKind` 的 **type-only** 导入（来自 `./runtime.ts`）；`runtime.ts` 仍不 import 本文件，双向循环未引入。

## 2. 纪律核对

- 本层不做 I/O、不读盘、不写盘、不调用模型；解释器驱动在编排（`src/common/编排/directive-interpreter.ts`），桌面只消费类型。
- 未新增 judge 工具 schema、未改 `runtime-core` 工具注册、未改 `GovernedToolsOptions`/`AdapterCapabilities`/任何运行时行为。
- 未改 `CustomerDirectiveView`/账本事件/高危谓词/消费者 fact 类型；两个 target 的隔离与消费语义不变。
- 最终落账校验仍在 Service（`validateCreateInput`），本类型层不复制校验器。

## 3. 验证

- `npm run typecheck` → exit 0（`角色卡/测试/docs/change/2026-11-04_customer-authorization-plane-nl-evidence/05-typecheck.log`）。
- 相关套件（编排 B1 / 桌面指令 / 授权平面集成 / 新增解释器与预填测试）→ 89/89 pass（同证据目录 `04-affected-suites.log`）。
- 候选哈希：`src/model/directive.ts` sha256 `b04aac321836da5ba30dc0101d2c37d2c34fd5a9c8a6a9ab9197eb8ad21b800d`。
- 本记录自身：哈希无法自引用内嵌，写定后的 sha256 随最终回报给出。

## 4. 风险/停止项

- **门控口径（客户已确认，2026-11-04）**：按 A 口径，解释**不受**「替我审批」/「替我决策」两个开关门控；依据为客户授权原话「授权提交并合并指令自然语言修复（不含发布），解释器门控口径按 A（不受两开关门控）。」本层仅类型，不涉及门控代码。
- 无运行时行为变化。若后续需要给解释器增加只读工具/结论工具，属于运行时核心工具面变更（另立任务），本批未做。
