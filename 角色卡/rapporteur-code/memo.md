# rapporteur-code 工作备忘录

## 2026-11-07：E1 rapporteur 角色模块（greenfield）

**任务**：按 E0.3 冻结契约开发 `src/common/roles/rapporteur/` + `test/roles/rapporteur/`，提供模块单测、差分 fixture、边界/import 扫描、候选哈希与证据；不提交/不推送/不跑真实模型。

**输入核对**
- E0.3 契约：685 行 / SHA-256 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3` ✅（与冻结记录一致）。
- 旧规格 oracle：`src/common/门禁引擎/governance-roles.ts` 794 行 / `fddda111…`；`run-role.ts` 3333 行 / `026f5e99…`；`apply-journal.ts` 3723 行 / `fd778342…`；`schema.ts` 1829 行 / `6f528a88…`；`decision-card.ts` 145 行 / `ef90c209…`；`workflow-preconditions.ts` 1609 行 / `6c2349a5…`；`role-tool-registry.ts` 157 行 / `9aca72a5…`。
- 差分 fixture 的 provenance 哈希写进 `test/roles/rapporteur/oracle-fixture.ts`，并在测试中校验（E1 冻结期旧文件不得漂移）。（E2 X-R2 起改为冻结金样，不再读取旧文件；见文末 E2 节。）

**交付**
- 模块（唯一 entry `index.ts`）：规格数据、`tools()`、`dispatch()`、`preflight.checkAction()`、`context()`。
- 测试：`spec/tools/dispatch/preflight/context/differential/module-boundary` 共 67 项；差分 fixture 24 个动作前置用例 + 6 个派发用例 + 规格/卡文本/工具集合。
- 文档：`api-spec.md`（含动作事实键/错误码/Service 最终校验对照）、`functional-description.md`、`feature-map.md`、本 memo、`docs/change/2026-11-07_E1_rapporteur-module-evidence.md`。

**关键决定**
1. **tools()**：`governanceModel === "trio"` 返回 `[requestRequirementChange, submitVersionChange, selectRunChange]`；其它/未知/畸形输入返回空 + 稳定 reason。三 id 与旧 run-role 注入门控一致；`capabilities` 直接返回 spec 同一冻结对象（D10）。
2. **dispatch()**：rapporteur 不是可派发来源（旧 `evaluateDispatchAuthorization` 只有 chief/convener）；R-2 下只检查来源身份 → 目标身份/类别 → 目标存在性，随后 deny `rapporteur-dispatch-not-authorized`。任何分支不返回 `reportToRoleId`。
3. **preflight()**：事实键按 Q13 由本角色 api-spec 登记；缺键/未知键/类型不符一律 deny。detail-amendment 要求整单 + `legacyCardPath:"none"`；run-change 要求三模式 + 绑定事实（停稳证据不进模块）；requirement-change 要求归因键/changeKind/summary/rationale，且 `claimsApproved`/`selfApproval` 出现时必须 false。
4. **context()**：4 个静态 section（角色 / 决策上下文 / 报告期望 / decision 卡数据），未登记 context fact 键（非空 facts ⇒ 单一拒绝性 section）；非 trio 只返回不可用声明。
5. **测试不 import 旧引擎**：差分使用静态 fixture（开发期用 probe/读取捕获）；`module-boundary.test.ts` 静态扫描根目录、import 方向、纯度与唯一入口。

**自测**
- `node --test "test/roles/rapporteur/*.test.ts"` → 67/67 pass / 0 fail / 0 skip。
- `node --test test/门禁引擎/role-module-contract.test.ts` → 14/14 pass。
- `node --test test/编排/run-role-submit-capabilities.test.ts` → 14/14 pass。
- 隔离 tsc（模块 + 测试）exit 0；`npm run typecheck` exit 0（执行时其他角色模块已就位）。
- 差分：规格 8 字段 / 卡文本 sha256 / 工具集合 / 派发 allow 位 / preflight allow 位差异均为 0；差异仅限 `KNOWN_DELTAS` 6 项。

**注意/遗留**
- 工作树为 8 角色并行共享；开发期间 `src/common/roles/{chief,product,nominator,convener,verifier}/` 由同伴写入，曾短暂导致仓级 typecheck 红（非本模块文件），最终复跑绿。本角色未修改任何他人文件。
- 未提交/未推送；未改角色卡/边界/YAML/changelog；未改旧引擎/Model/shared/gates。
- E2 交接：门禁引擎门面装配本模块并删除内联规格；run-role 改读 `tools()`；Service 接 `preflight`；桌面/编排接 `context()`。切换时更新差分 provenance（旧文件删除后哈希校验需按删除清单调整）。
- 未登记共享 i18n 条目（写集不含 shared）；messageKey 已在 `api-spec.md` 登记，消费者按需映射。

**候选哈希（本备忘录写盘时）**
- 模块：`index.ts` `9fd7f422…`（63 行）；`internal/spec.ts` `9d19d1ce…`（108 行）；`tools.ts` `5a8323b9…`（61 行）；`dispatch.ts` `099313f8…`（72 行）；`preflight.ts` `526cfb88…`（401 行）；`context.ts` `29902ee4…`（85 行）；`codes.ts` `bb724b22…`（65 行）。
- 测试：`oracle-fixture.ts` `e7256e56…`（531 行）；`spec.test.ts` `65085ff4…`；`tools.test.ts` `1e02f729…`；`dispatch.test.ts` `c09880be…`；`preflight.test.ts` `01bb382a…`；`context.test.ts` `423d43b5…`；`differential.test.ts` `a5e976e2…`；`module-boundary.test.ts` `f7982c55…`。
- 证据与 api-spec 哈希见完成报告（写盘后复算）。

## 2026-11-07：E2 X-R2 差分 fixture 金样化（G9）

- 触发：X-R1/X-R2 切换后旧文件哈希锚点失效（67/66/1）；按 E2 检查单 G9 改为冻结金样，不再读取工作树旧文件。
- 改动：`oracle-fixture.ts` `OLD_ORACLE_PROVENANCE` → `ORACLE_GOLDEN_META` + `ORACLE_GOLDEN_PAYLOAD`（捕获期/切换后/未变文件/计数/覆盖映射/载荷哈希）；`differential.test.ts` provenance 测试改为金样自洽 + 载荷哈希 + 无旧引擎依赖扫描。差分矩阵 42 项 + 6 项 `KNOWN_DELTAS` 未弱化。
- 现行哈希：`oracle-fixture.ts` 653 行 / `21c0220a…`；`differential.test.ts` 223 行 / `0894dd2a…`；payload `c1062fc2…`。证据 §10。
- 测试：67/67 pass / 0 fail / 0 skip；`npm run typecheck` exit 0。
- 遗留：旧实现删除后本差分无需再改；编排 S2/S4 若改变 rapporteur 注入行为，须重取 fixture 并同步更新 payload 哈希。
