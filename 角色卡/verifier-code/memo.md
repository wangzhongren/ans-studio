# verifier-code 工作备忘录

## 当前状态（2026-11-07，E1 + E2 P5 + E2 X-R5 fixture 金样化）

- 模块：`src/common/roles/verifier/index.ts`（唯一 public entry）已实现 E1 交付；单测 + 差分 **29/29 pass**；全仓 `npm run typecheck` exit 0。
- **E2 接口评审 P5 已修复**：preflight facts 只允许 `reviewTarget`/`criteria`，任何未登记顶层键（`accepted`/`passed`/`approved` 等）⇒ deny `review-facts-unknown-key`；负例与差分 `documented` 已补，证据见 `docs/change/2026-11-07_E1_verifier-module-evidence.md` §九。
- **E2 X-R5 fixture 金样化已完成**：差分期望冻结在 `test/roles/verifier/oracle-fixture.ts`（spec/cards/tools D1 catalog/dispatch 15/preflight 24/`KNOWN_DELTAS`/来源身份/`payloadSha256`）；差分测试不再 import/读取旧引擎，旧实现删除后仍可运行；证据见同文件 §十。
- 契约：E0.3 已冻结（`067e3d2e…`，685 行）；E1 前旧引擎为权威/oracle，本模块不改旧引擎。
- 文档：`api-spec.md`（public API/事实键/错误码/差分）、`docs/change/2026-11-07_E1_verifier-module-evidence.md`（证据/哈希/自检）。
- 未做（按闸门）：E2 X-R5 的 S2–S4（编排卡种/工具注入、Service review 路由/preflight 接线、桌面呈现）、旧实现删除、i18n 资源登记（shared-code/i18n owner）、提交/推送/验收。

## 关键决策（后续勿无意推翻）

1. **dispatch 语义 = 向 verifier 派发的硬身份/存在性**（E0 R-2）：target 必须是内置 `verifier`；来源只允许旧硬授权可表达的 `chief`（hub 新任务）与 `convener`（历史路径）；`targetExists` 必须显式 true（契约要求缺省即拒绝）。允许时 `reportToRoleId = sourceRoleId`，仅作差分期望，不驱动实际路由。
   - 旧函数 `workflow-preconditions.ts::evaluateDispatchAuthorization` 对内置目标不读 `targetExists`；4 条 documented 差异已在 api-spec §4 与证据登记。若 E0/E1 接口评审要求改变，先改契约再改本模块与 fixture。
2. **preflight 事实键 = `reviewTarget`（`{operationId, candidate}`）+ `criteria`**：`operationId`=期望 CID、`candidate`=最终候选完整 OID、`criteria`=1..16 冻结 `GitEvidenceRef`。形状校验复用 Model `isDispatchTaskReviewTarget` / `isTaskReviewBasisRef`（单一真源），不复制 Service/Provider、不做验收判定/证据内容核验。
   - **事实包白名单（E2 P5）**：只允许上述两个顶层键；`accepted`/`passed`/`approved` 等未登记键（含值为 false/undefined）一律 deny `review-facts-unknown-key`，先于缺键/形状判定；模块不读取其值。不得回退为「忽略额外键」。
3. **tools 空声明**：14 项 `RoleToolId` 无一允许 verifier；`validateRoleToolDeclaration("verifier", [])` 合法。不得为「对称」而虚报工具。
4. **数据逐字迁移**：卡文本/边界/预授权/禁写/capabilities/cards 必须与旧 `governance-roles.ts`、`run-role.ts::TRIO_CARD_KINDS.verifier` 零差异；差分测试会拦住漂移。
5. **capabilities 单一真源**（D10）：`tools().capabilities` 必须与 spec 同引用；不要复制第二份。

## 旧 oracle 锚点（历史捕获来源；测试运行期不得 import/读取）

- `test/roles/verifier/oracle-fixture.ts::ORACLE_GOLDEN_META.capture` 冻结了以下文件的捕获期行数/SHA-256/锚点：`governance-roles.ts`（verifier 规格）、`run-role.ts`（`TRIO_CARD_KINDS`）、`workflow-preconditions.ts`（`evaluateDispatchAuthorization`/`reportTargetForTaskCreator`）、`role-tool-registry.ts`（D1 14 项）、`model/runtime.ts`（review 形状真源）、`model/role.ts`、E0.3 契约。
- 差分测试与 fixture 不再 import 上述旧引擎模块、不读取其字节；`switch.changed` 记录 X-R5 切换后实测身份。
- 重新捕获须运行 `角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_golden-capture.mjs`，同步更新 `payloadSha256` 并在证据 §十登记原因（不得删断言/删矩阵/整文件替换）。

## 续接线索

- E2 X-R5 数据门面已切换（`specOf(verifierRoleModule)` 零复制投影）；剩余 S2–S4：`run-role.ts` acceptance 卡种/默认卡数据/工具注入、Service review 路由/preflight 接线、桌面 review/acceptance 呈现，单写者顺序按团队计划 §7.5。
- 金样是冻结快照：若后续 S2–S4 改变模块行为或矩阵，必须先重取金样并同步 `payloadSha256`，在证据 §十登记；不得只改期望值或删用例。
- 若消费方需要 acceptance 卡结构化数据（而非 context 文本），走 E0 §4.4 接口评审新增字段/共享类型；本版不扩 `RoleContextSection`。
- 若要在运行时呈现 `messageKey`，由 shared-code/i18n owner 登记 `role.verifier.*` 键；本模块不写 `src/common/shared/i18n/`。
- 全仓 typecheck 受其它角色并发文件影响时，用 verifier 作用域 tsc 复核；不要修改他人写集来「修绿」。
