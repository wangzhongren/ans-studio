# 桌面窗口 D1b 实现记录：三能力注入 + trunk refreeze/abandon/history

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；桌面窗口（独立固定上下文）；Batch 3.5 **D1b（三能力注入 + trunk 客户动作 IPC）**。
- **日期 / 状态**：2026-11-05；**D1b 完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push / 未 merge**。
- **批准记录**：`docs/communication/2026-11-05_gate_closure_batch-3.5.md`（12 行 / SHA-256 `43220baf3f8c41ed9c17727d66688266501373a474643595804ed465cc341692`）。
- **前置节点**：D1（本角色，`2026-11-04_trunk-amendment-model-D1-record.md`）；C1d（`角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-C1d-record.md`）；S5（`角色卡/编排/docs/change/2026-11-05_trunk-amendment-model-S5-record.md`）；S1–S4/C1–C3 冻结契约未改。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。
- **写集**：`app/desktop/version-change.ts`、`app/desktop/session.ts`、`app/desktop/interface.ts`、`app/preload.cjs`；`test/桌面应用/version-change.test.ts`、`test/桌面应用/trunk.test.ts`、`test/桌面应用/run-change-entry.test.ts`；本记录。**未改 `src/**`、`app/renderer/**`（U1）、其它角色测试、角色卡/边界/communication/acceptance/scheduling。**

## 一、结论

- **三能力已注入**（`openRoleSession` 顶层字段；run-role 二次门控仍生效）：
  - `submitVersionChange`：仅 `product`（version-upgrade）/ `rapporteur`（detail-amendment）；调用 S4 `version-change-runtime.submit`（创建+提交；**不批准/不发卡**）；回执 `{ok, applicationId:"vc-<n>", status:"submitted"}`。
  - `submitRefactor`：仅 `convener`；调用 S4 `refactor-runtime.submit`（记录/校验；不派发/不写代码）；回执 `{ok, requestId:"rf-<n>", status:"requested"}`。
  - `requestStableWrite`：仅 `convener`；调用 S4 `stable-write-runtime.requestWorkflowWrite`（记录请求 + 客户 `stable-write` 轻量确认卡；**能力本身不签发许可/不批准**）；成功回执 `{ok, requestId:"sw-<n>", status:"requested"}`（客户确认后 S2 已签发一次性许可）。
  - 其他角色（chief/nominator/verifier/项目角色）一律不注入（工具不存在 = fail-closed）；身份以会话 `req.roleId` **强制覆盖**工具载荷自报值（模型不可自报身份）。
- **trunk 客户动作已接 S5**（不再返回 `trunk-operation-unavailable`）：
  - `trunk:refreeze-request` → S5 `refreeze`：只更新 **stable 快照**（workflow/roleCards/boundaries；磁盘字节复核），客户 `decisionId` + 高危 `acknowledged:true`；**不升 trunkVersion**；audit 由应用侧 `appendTaskEvent` 写 `trunk.state(op:"refrozen")`（origin/decidedBy customer）。
  - `trunk:abandon-upgrade` → S5 `abandonUpgrade`：关闭解冻窗口、不 re-pin/不改指针；audit 写 `trunk.state(op:"refrozen-cancelled")`。
  - `trunk:list` / 面板历史 → S5 `history()`：`{versions:number[], currentTrunkVersion:number|null}`（只读；不虚构归档内容）。
- **旧按钮测试收口**：`run-change-entry.test.ts` 跨层源码钉由「ChatHeader 存在 `#run-change` 按钮」改为「旧按钮/旧桥调用已移除 + `version-change`/`trunk-upgrade` 入口存在 + 低层 `run:change-request`/preload/Interface/SessionManager API 保留」；未弱化其它断言、未新增 skip。
- **客户主权不变**：三能力只提交请求；VCA 批准仍走客户卡（`version-change:present`/`session:operator-response`）；stable 写入仍由客户 `stable-write` 确认卡生成许可；**无渲→主提交 IPC**（F10/F11 保持）。
- **测试 / 类型检查**：D1b 专项 **36 / 36 pass**；`test/桌面应用` 全量 **593 / 593 pass / 0 fail / 0 skip**；cross-node 源码钉 + i18n **26 / 26 pass**；`npm run typecheck` **exit 0**。未改断言保绿、未新增 skip。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | SHA-256 | git hash-object |
| --- | --- | --- | --- | --- |
| 1 | `app/desktop/version-change.ts` | 改（三能力 + refreeze/abandon/history） | `6937873141c534aa7124d768608b15312d84e4af5e911d17cc6ba02af42a0988` | `5e8f7dd7e1639fa7dfd6c8332f522ab771ce795e` |
| 2 | `app/desktop/session.ts` | 改（注入三能力；身份强制） | `6945740d157227e3a278f74583508159d937ff85afae96568e64c6f2028f474b` | `ed984742552774f78feffb490d9051557a865849` |
| 3 | `app/desktop/interface.ts` | 改（refreeze/abandon/history IPC 接线） | `a536025f352e226d547d6c6e6ae54c33ce485eb6ee35e519142d805a13b6c1d2` | `51e052ce207601aab6404f8dc70e39947cbc8661` |
| 4 | `app/preload.cjs` | 改（refreeze/abandon 入参加 reason/acknowledged） | `ae9189e2e19a7f9203c8bec0d8fdeed48d858a8e99539a5cb88b8be0b31425f5` | `7f87f988a0945408ea4f99211a431e5c0dd3af85` |
| 5 | `test/桌面应用/version-change.test.ts` | 改（+4 D1b tests；25 total） | `0f3861944e03437490b696e1ab835dc4110a7834530b5fecaf89ef08a15798c0` | `9fb01626ab5c8f570ed9081e47f51da9593c078f` |
| 6 | `test/桌面应用/trunk.test.ts` | 改（refreeze/abandon/history 回执） | `302754fcf89e8faa9b6bb7e5d2e49538e9a420696db18c6242e643f02e1e27ae` | `c29e3d729374cf80071e3725a575489ed06c57dd` |
| 7 | `test/桌面应用/run-change-entry.test.ts` | 改（旧按钮移除源码钉） | `5faae09898da1bd57c8506b148d7d66219da32c382c44b105fbfc4df24579ac5` | `61d7d6cdd86bb589dc053182eb135ef45512ecf7` |

**明确未改**：`src/**`（C1d/S5 已提供能力类型/工具/trunk API）、`app/renderer/**`（U1）、`package.json`/构建配置、角色卡/边界/`docs/scheduling|acceptance|communication|planning`、其它角色测试。`app/desktop/trunk.ts` 本节点无需改动（`trunk:state` 载荷形状不变）。

## 三、三能力注入矩阵与实现

| 会话角色 | submitVersionChange | submitRefactor | requestStableWrite |
| --- | --- | --- | --- |
| product | ✅（S2 只允许 version-upgrade） | — | — |
| rapporteur | ✅（S2 只允许 detail-amendment） | — | — |
| convener | — | ✅ | ✅ |
| chief / nominator / verifier / 项目角色 | — | — | — |

- **注入点**：`session.ts::open()` 按 `req.roleId` 构造闭包，传入 `openRoleSession` 顶层字段；run-role 再按 `setup.role.id` 二次门控并转交适配器（C1d「注入才注册」）。构造/调用异常 ⇒ 结构化 `{ok:false, errorCode, message}`（只诊断，不伪造成功）。
- **身份强制**：`submitVersionChange` 以 `initiatorRoleId: req.roleId` 覆盖输入；`submitRefactor`/`requestStableWrite` 以 `roleId: req.roleId` 覆盖。工具自报角色不参与授权。
- **submitVersionChange**：`baseTrunk = bootstrap ? null : trunkService.current()`；detail-amendment 先经 `trunkService.validateAmendment` 解析修正案并注入 `amendmentItems`（targets↔items 一致性，F36/AC-28）；调用 `versionChangeRuntime.submit`（create+submit + `version.change(submitted)` + 提交冻结 + 通知）。非 `submitted` 结果（如已存在的 applied 申请）⇒ `vca-conflict`，不重复提交。
- **submitRefactor**：分配 `rf-<max+1>`；调用 `refactorRuntime.submit`（S2 校验/记录 + `refactor.request` 事件；`managedBy:"application-scheduler"`）；回执 requested。单进程 `max+1` 分配；并发冲突由 S1 store 拒绝（`refactor-invalid`，可重试）。
- **requestStableWrite**：调用 `stableWriteRuntime.requestWorkflowWrite`（记录 `stable.write.requested` → 会话客户卡通道呈现 `stable-write` 卡 → 客户批准后 S2 签发一次性许可并安装 C2b 快照）。成功（record `approved`/`requested`）回填工具冻结成功状态 `requested`；客户拒绝 ⇒ `{ok:false, status:"rejected", errorCode:"stable-write-write-failed"}`；无卡通道 ⇒ `{ok:false, errorCode:"stable-write-write-failed", message:"无客户确认卡通道…"}`（请求已记录，可重试）。**能力本身不签发许可、不写盘**。
- **阻塞语义（披露）**：`requestStableWrite` 与既有 `request_confirmation` 一样**等待客户卡作答**后返回（批准 ⇒ 许可已在同一轮可用，模型可继续写；拒绝 ⇒ 失败）。C1d 工具成功状态只接受 `requested`，故批准后仍回传 `requested`（工具语义 = 已提交申请；`successHint` 中「尚未生成许可」在批准场景下已过时，模型应以许可存在为准继续写入）。若产品更希望「先回执、批准后再由应用提醒角色写」，需另加通知轮次（跨节点，不在本节点）。

## 四、trunk 客户动作（S5 API）

| IPC | 行为 | 返回 |
| --- | --- | --- |
| `trunk:refreeze-request` | 预检 `acknowledged===true` + `reason`；从当前 manifest + **磁盘 stable 哈希**构造 target；`trunkService.refreeze({decisionId:"trunk-refreeze-<ts>", reason, highRisk:{acknowledged:true}, target, at})`；成功后 `appendTaskEvent(trunk.state(op:"refrozen"))` | `{ok:true,status:"refrozen",trunkVersion,changed:string[]}` / `{ok:false,code,error}` |
| `trunk:abandon-upgrade` | 预检 `acknowledged===true` + `reason`；`trunkService.abandonUpgrade({decisionId:"trunk-abandon-<ts>", reason, at})`；成功后写 `trunk.state(op:"refrozen-cancelled")` | `{ok:true,status:"refrozen-cancelled",trunkVersion}` / `{ok:false,code,error}` |
| `trunk:list` | 当前 manifest 摘要 + `trunkService.history()` | `{ok:true,trunks:TrunkListEntry[],history:{versions:number[],currentTrunkVersion:number|null},historyError?}` |
| `trunk:state` | 不受影响；refreeze/abandon 事件经 `onEvent` 去抖推送刷新 | 单一状态源 |
- 高危二次确认：IPC 层要求 `acknowledged:true`（U1 的确认 UI 负责让客户显式确认）；`decisionId` 由 D1b 合成并绑定本次动作（非卡通道、不可复用于 VCA/stable 批准）。`refreeze` 无 stable 变化/含版本化文档 ⇒ S5 拒绝（`trunk-apply-failed`），指针不变。
- 审计归属：S5 audit 自带 `origin:"customer"`/`decidedBy:"customer"`/`decisionId`；D1b 只写账本，不改写归属。

## 五、旧按钮测试收口

- `test/桌面应用/run-change-entry.test.ts`「跨层源码钉」更新（U1 已移除 `#run-change`/旧按钮，P1.6 §4.10）：
  - 断言 `ChatHeader.tsx` **不再**含 `id="run-change"` / `bridge.requestRunChange` / `runChangeButtonView`；
  - 断言新的 `id="version-change"` 与 `id="trunk-upgrade"` 入口存在；
  - 保留低层 API 钉：`main.ts` 的 `run:change-request` handler、`preload.requestRunChange`、`platform.requestRunChange?`、Interface `requestRunChange`/`activeRunViews`、SessionManager `requestRunChangeDecision`、提案冻结卡自动尝试。
- 其它 `test/桌面应用` 旧文案/选择器断言未发现需改；未改 U1 的 `test/桌面UI`（其写集）。
- 结果：`test/桌面应用` 全量由 Batch 3.5 前 589/588/1（旧按钮失败）回到 **593 / 593 / 0 fail / 0 skip**。

## 六、测试与类型检查（原始结果）

1. D1b 专项：`node --test test/桌面应用/trunk.test.ts test/桌面应用/version-change.test.ts test/桌面应用/run-change-entry.test.ts` → **tests 36 / pass 36 / fail 0 / skipped 0**。
   - 新增：三能力注入矩阵/身份强制；VCA submit/refactor/stable write request 真实栈；stable 拒绝；refreeze（不升版本/无变化拒绝/高危拒绝/事件归属）/abandon（不改指针）/history。
2. `node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"` → **tests 593 / pass 593 / fail 0 / skipped 0**（D1 基线 589；+4 D1b 测试；旧按钮失败已收口）。
3. cross-node：`node --test test/测试/g1-verify/g1-copy-and-nails.test.ts test/测试/i18n-integration.test.ts test/项目管理/shared/i18n.test.ts` → **26 / 26 pass**。
4. `npm run typecheck` → **exit 0**。未改断言保绿、未新增 skip；无既有失败新增。

## 七、U1 消费契约（D1b 增量）

- **模型侧（非 U1）**：三能力工具由 C1d 在对应角色会话注册（`submit_version_change` / `submit_refactor` / `request_stable_write`）；U1 不提供表单式提交、不新增渲→主提交 IPC。
- **trunk 动作**：`requestTrunkRefreeze({projectRoot, reason, acknowledged:true})` 与 `abandonTrunkUpgrade({projectRoot, reason, acknowledged:true})`；缺 reason/acknowledged 时主进程结构化拒绝。`listTrunks` 回执新增 `history:{versions,currentTrunkVersion}`（`historyError` 可选）；`trunk:state` 形状不变。
- **客户主权**：refreeze/abandon 的客户二次确认 UI 在 U1；VCA/stable 批准仍走客户卡（`onOperatorRequest`/`operatorRespond`）。
- **面板刷新**：refreeze/abandon 成功写 `trunk.state` 事件 → Interface 去抖推 `trunk:state`；U1 无需轮询。

## 八、遗留与披露（交 T1/T2/E1）

1. **`requestStableWrite` 阻塞/回执语义**（§三）：批准后仍回传 `requested`（C1d 冻结成功状态）；若需「批准后自动提醒角色写入」的通知轮次，属跨节点追加。
2. **refreeze/abandon 的 decisionId**：D1b 合成 `trunk-refreeze-<ts>`/`trunk-abandon-<ts>`，绑定 U1 高危确认（`acknowledged:true`）；不是客户卡决定。
3. **refreeze 目标**：只 stable；版本化文档/execution 变更必须走 VCA（S5 拒绝）。无 stable 变化时 refreeze 返回 `trunk-apply-failed`（不伪造成功）。
4. **history**：仅归档版本号 + 当前版本（S5 只读 API）；归档 manifest 内容读取需 S1 Provider 扩展（跨节点）。
5. **submitRefactor requestId**：单进程 `rf-<max+1>`；并发冲突由 S1 store 拒绝，模型可重试；无跨进程分配器。
6. **submitVersionChange**：detail-amendment 依赖修正案文档可解析（`validateAmendment`）；失败 `vca-invalid`。不自动发 VCA 卡（按 D1b 派发「不批准/不发卡」）；客户卡经 `version-change:present`/面板重发。
7. 未运行 Electron 截图/全量 T3/双端 renderer 构建（U1/T1/T2）。

## 九、声明

- 本记录不是实施授权、不是客户闸门、不是验收结论；不替代 T1/T2/E2。
- 本节点仅写 §二列出的文件；**未改 `src/**`/`app/renderer/**`/package.json/构建配置/角色卡/边界/`docs/scheduling|acceptance|communication|planning`/其它角色测试**。
- 未运行应用；**未 commit / push / merge / release**。
- 若后续需要改 C1d/S5 冻结契约或新增 B-x，按停止项回报，不自行扩写集。
