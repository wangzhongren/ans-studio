# 2026-10-30 §5A 意图入口契约可见性（实施记录 / P9.3 返工）

- 批次：§5A（意图入口契约可见性；P9.1–P9.5），worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\intent-contract-visibility`（分支 `feat/intent-contract-visibility`，父 `abb0f6f`）。
- 首轮实施提交：`dbb33b5`（13 files +547/−14）；本记录随 P9.3 返工提交。
- 范围：四张内置角色卡（chief/product/rapporteur/nominator）、`contract_check`、判断意图解析/拒绝文案；不改判官判定逻辑、五步链、角色权限/边界、run/manifest 契约。

## 1. 单一契约与解析器

- 共享常量/解析：`src/common/shared/intent-entry-contract.ts`
  - `INTENT_ENTRY_TEMPLATE`、`INTENT_ENTRY_NAMING_RULE`、`INTENT_ENTRY_ID_RULE`；
  - `intentEntryContractText(role)`（四卡同源）、`intentEntryRejectionHint()`（拒绝文案同源）；
  - `resolveIntentEntryReference()`（**唯一解析器**）、`readIntentEntryFacts()`（只读事实）、`intentIdFromFrontmatter()`。
- 解析优先级（合同口径）：**请求显式 `intentId` → 提案 frontmatter → 产品意图 frontmatter → flow-id 回落**；source 分别为 `request` / `proposal` / `product` / `flow-id`，随合同事实与判断证据保留。
- `IntentReferenceSource` 增 `product`；`readIntentEntryFacts` 与 `run-role` 的 judgeContext 均调用同一解析器，不再各写一套 `productIntentId ?? proposalIntentId` 或 `proposalIntentId ?? productIntentId`。

## 2. 冲突决策（P9.3）

- **选择 fail-closed**：产品意图 frontmatter 的 intentId 与提案 frontmatter 不一致 ⇒ `intent-ambiguous`；请求显式 intentId 与提案/产品任一不一致 ⇒ `intent-ambiguous`；任一来源非空但不是合法 slug ⇒ `intent-unconfirmed`。
- 理由：与四卡“产品意图/提案/入口文件名三者一致”的职责一致；避免在冲突时按任一优先级静默选源、让 contract_check 与判断取源再次分叉；判断侧不因此调用模型或落到 flow-id 猜测。
- 冲突在 `contract_check` 事实中显式显示 `意图入口解析：intent-ambiguous｜...` 与 `一致性=no`；judgeContext 携带 `intentResolutionError`，证据 builder 将其转为问题并附带同源模板/命名规则，判官 fail-closed。
- 只有三者皆缺时才按 `flow-id` 回落，且 source 如实为 `flow-id`，不把 flowId 冒充 intentId。

## 3. 文件

- 生产：`src/common/shared/intent-entry-contract.ts`（新增）、`src/common/门禁引擎/governance-roles.ts`、`src/common/编排/governance-judge-intent.ts`、`src/common/编排/governance-judge-evidence.ts`、`src/model/runtime.ts`、`src/pipeline/orchestration/run-role.ts`、`app/desktop/customer-input.ts`、`app/desktop/session.ts`。
- 测试（均既有文件，无新增测试文件）：`test/测试/entry-role-minimal-d.test.ts`、`test/编排/decision-evidence-packet.test.ts`、`test/编排/appointment-roster.test.ts`、`test/桌面应用/optional-acceptance.test.ts`、`test/桌面应用/run-pin.test.ts`。

## 4. 验证（返工最终代码）

- 定向五文件：43/43 pass（卡片契约、product-only/冲突/request 覆盖、contract_check 4KB、客户卡人话）。
- 全量：**3077 tests / 3050 pass / 9 fail / 18 skip**（相对首轮 +3 测试；9 红仍为本地 Windows symlink EPERM）；日志 `%TEMP%\ans-intent-contract-rework-full1.log`，sha256 `776b091340f7d022a0cf2ea62a785868f0857b513bc6aa1952b43365db66db28`。
- `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` exit 0。
- 未删测试、未放宽断言、未新增 skip；无新增测试文件；`src/provider/runtime/` 无新文件。

## 5. 已知边界

- `contract_check` 不知道“请求显式 intentId”（该值只在具体判断请求里）；它展示产品/提案/入口文件三者事实与一致性；请求显式与其它来源的冲突由 judgeContext（`intentResolutionError`）fail-closed。
- 非 P0 的旧项目若产品/提案都没有 intentId，仍按 flow-id 回落（source 如实标注）；这是兼容旧项目的唯一回落，不伪造 frontmatter。
