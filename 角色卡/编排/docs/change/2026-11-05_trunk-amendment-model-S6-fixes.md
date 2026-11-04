# 编排 S6 修复记录：T1 返工两缺陷（reconcile 客户 op / stable 裸探测与创世）

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；编排（独立固定上下文）；Batch 5 **S6 修复节点**（T1 返工发现 D1/D2）。
- **日期 / 状态**：2026-11-05；**S6 完成（最小修复，写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push / 未 merge**。
- **依据**：T1 失败报告（`test/测试/trunk-stable-write-integration.test.ts`「trunk 对账：phase 滞后…」；`test/测试/t9-block1-bootstrap.test.ts:226/:258`）；C1/C2a 事件归属契约（`trunk.state` 客户 op 必须 `origin/decidedBy:"customer"` + decisionId；`gap` 才是 application op）；C2b `stableWriteDecision`（无内容 hash/shell 一律拒绝；stable 真实执行点 = run-role write/edit gate）。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。

## 一、D1（S4 trunk-runtime reconcile）修复

**缺陷**：`reconcile()` 在「内容已过提交点、phase 滞后」时直接把 journal 载荷（`op:"switched"`、`origin:"application"`、无 `decidedBy`/`decisionId`）补写账本，被 C2a 拒绝（客户 op 必须 customer）。

**修复**（`src/pipeline/orchestration/trunk-runtime.ts`）：
- 补写前先判定**客户绑定可解析**：`origin==="customer" && decidedBy==="customer" && (decisionId||confirmationId)`。
- 可解析 ⇒ 按 customer 补写（幂等载荷含 journalId；含 `confirmationId` 分支）。
- 不可解析（当前 journal 形状无 decisionId 字段）⇒ **不补写任何客户 op**，只 `log` 诊断并返回 `split`（应用侧可见）；不新增 C1/C2a 未定义事件/op，不伪造 `switched`。
- 结果：T1 测试 `ledger()` 零错误、`state:"committed"`/`split:true`/phase 断言全部成立；反向分裂态仍不补写/不改指针。

## 二、D2（S3 run-role stable gate 裸探测/创世）修复

**缺陷**：`stablePermitOf` 注入后，stable gate 对所有 stable 路径强制一次性许可——包括无 `contentSha256` 的裸 gate 探测（创世/切回 su 的边界判定）与创世会话的真实 `write_file`（governance 产物如 `角色卡/R/role-card.md`），导致 B0 genesis/switch-back 用例被 `stable-write-invalid/permit-missing` 拒绝。

**修复**（`src/pipeline/orchestration/run-role.ts`）：
- **创世 bootstrap 会话**（`input.project.genesisBootstrap !== undefined`，运营授权的一次性初始治理产物写路径，尚无项目边界/appointment-write）⇒ stable 路径回到既有 `baseGate`/边界判定（与既有 genesis 语义一致）。
- **正常会话**（非创世）⇒ 只要注入 `stablePermitOf` 即**一律**严格 `stableWriteDecision`：真实 write/edit 带 `contentSha256`（C1c）；**裸探测/无内容 hash ⇒ 拒绝**（shell/opaque 不得绕过，T1 契约）。
- 未注入 `stablePermitOf`（B-11 未接）⇒ 保留既有 appointment-write 确认制路径（与 S3 分阶段披露一致）。
- 未为无确认直写开口：实际写入工具总是带 `contentSha256`；创世是既有运营授权路径，切回后不再带 `genesisBootstrap` ⇒ 严格判定恢复。

**D1b 交接点**：`stablePermitOf` 可继续全局注入（run-role 已按 genesis/会话判定）；若 D1b 希望进一步收窄，可在**非创世**会话才注入——非必需，不改 `app/**`。role-card/boundary 的正常写入仍须 appointment-write 确认 → 许可 → `stableWriteDecision`。

## 三、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | `src/pipeline/orchestration/trunk-runtime.ts` | 修改（D1：reconcile 不伪造客户 op） | 325 | `5938746eeb7f801049a010eca9cfff6d9c07559b00976c3a70cb23901985670c` |
| 2 | `src/pipeline/orchestration/run-role.ts` | 修改（D2：创世绕过 + 正常会话严格） | 2622 | `121f47d7169007c0253297a19efe1b592524073505b77acaca9e929a767afc3d` |
| 3 | `test/编排/trunk-runtime.test.ts` | 更新（S4 自有测试对齐 S6 语义：split 不补写） | 370 | `3e0df2046a7a5acfe9f089caefb99c85102ac807f2e557d0082a4da3839c0f90` |
| 4 | `角色卡/编排/docs/change/2026-11-05_trunk-amendment-model-S6-fixes.md` | 新增（本记录） | — | — |

**明确未改**：`test/测试/**`（测试角色属主）、`src/model/**`、`src/common/门禁引擎/**`、`src/service/**`、`src/provider/**`、`app/**`、桌面测试、其它角色测试/文档。

## 四、验证与失败分类

1. **T1 指定用例**：`node --test test/测试/trunk-stable-write-integration.test.ts test/测试/t9-block1-bootstrap.test.ts` → **tests 19 / pass 19 / fail 0 / skipped 0**。
   - `trunk 对账：phase 滞后可识别分裂态，且补写事件必须通过 C2a 账本校验` ✔（ledger 零错误、split 成立、反向不补写）。
   - `用户入口/创世边界：未 bootstrap 时 su 的 gate 放行/拒绝` ✔；`切回：真实 write_file 写出角色` ✔；`stable workflow 全链路` ✔（allowed/denied/无内容 hash 拒绝）。
2. **`test/编排` 全量**：**897 / 895 pass / 2 fail / 0 skipped**：
   - 既有 Windows symlink `EPERM`（`shell-authorized-routine.test.ts`）；
   - `download-provider.test.ts`「provider：空闲/总超时…」**偶发时序失败**（单文件重跑 14/14 pass；与本修复无关）。
3. **`test/桌面应用`**：**593 / 593 pass**（并行 D1b/U1 改动已收口；S6 后无回归）。
4. **`npm run typecheck`**：**exit 0**。未改断言、未新增 skip。

## 五、声明

- 本修复不改变任何冻结契约（Model/门禁/Service/Provider）；仅调整 Pipeline 的事件补写判定与 stable gate 的会话/内容上下文条件。
- D1：reconcile 仍识别并如实报告分裂态；只有客户绑定可解析时才补写客户 `trunk.state`。若要「一律补写」，需 journal/Service 携带 decisionId（跨节点契约，属停止项）。
- D2：创世 bootstrap 会话绕过 stable 许可是**既有运营授权路径**；正常会话与真实写入仍严格经一次性许可（无确认直写不开新口子）。
- 未运行应用；**未 commit / push / merge / release**。
