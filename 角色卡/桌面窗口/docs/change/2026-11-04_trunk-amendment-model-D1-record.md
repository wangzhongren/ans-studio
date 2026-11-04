# 桌面窗口 D1 实现记录：版本变更/冻结/stable/重构/trunk 接线

- **任务 / 角色 / 节点**：`2026-11-04-trunk-amendment-model`（T3）；桌面窗口（独立固定上下文）；Batch 3 **D1（桌面接线）**。
- **日期 / 状态**：2026-11-05；**D1 完成（本节点派发写集内）**。本文件是本节点唯一管理文档写盘；未改角色卡/边界/communication/acceptance/scheduling；**未 commit / 未 push / 未 merge**。
- **实施契约基线**：`docs/planning/2026-11-04_design_trunk-amendment-model.md` **P1.6**（1151 行 / 实际字节 `fccb1f54060e6688bbc5248e7a14ec9e6258d43302b61067df13a9ca97ec3226`），§4.4/§4.5/§4.5.1/§4.7/§4.8/§4.9/§4.10；§5.5 事件归属。
- **D1 P1 提案**：`角色卡/桌面窗口/docs/change/2026-11-04_trunk-amendment-model-P1.md`（461 行 / `1a0b5c9a6bcbcb165e3c45c7c70408aee22d4f3f77d046a66a5b0f0219549c42`）。
- **PM 复审**：`角色卡/项目管理/docs/change/2026-11-04_trunk-amendment-model-P1.6-review.md`（451 行 / `1a73ebc6…`）；本节点按 **F13/F15/F16/F17** 落实。
- **前置节点**：C1/C1b/C1c/C2a/C2b/C2c/C3/S1–S4 已冻结/落地；S4 交接见 `角色卡/编排/docs/change/2026-11-04_trunk-amendment-model-S4-record.md` §五。
- **基线**：worktree `trunk-amendment`，分支 `feat/trunk-amendment-model`，HEAD `89b1fb2751d74c607b3a17d1b522b88061943a14`。
- **写集**：仅 `app/desktop/version-change.ts`（新）、`app/desktop/trunk.ts`（新）、`app/desktop/session.ts`、`app/desktop/customer-input.ts`、`app/desktop/interface.ts`、`app/main.ts`、`app/preload.cjs`、`test/桌面应用/version-change.test.ts`（新，B-10）、`test/桌面应用/trunk.test.ts`（新，B-4）与本记录。**未改 `src/**`/`app/renderer/**`/`package.json`/构建配置/角色卡/边界/其它角色测试。**

## 一、结论

- **IPC 面冻结**（U1 只消费本表；**无** `version-change:submit` / `refactor:request` / `stable-write:request`）：
  - `version-change:list` / `version-change:present`
  - `stable-write:list` / `refactor:list` / `doc-freeze:list`
  - `trunk:state`（**主→渲唯一推送源**）/ `trunk:list` / `trunk:upgrade-request` / `trunk:upgrade-confirm` / `trunk:refreeze-request` / `trunk:abandon-upgrade` / `trunk:recover-request`
- **客户卡**（客户本人；不进判断器/委托/`@决策`；无通道 fail-closed、VCA 保持 submitted 可重试）：
  - VCA 批准/拒绝卡：application-owned `decision` + 真实 flowId；选项 `approve-version-change` / `reject-version-change`（推荐 reject 安全项）；卡面含 kind/发起者/targets path/version/sha256/摘要/语义说明。
  - 修正案逐项卡：`item-apply` / `item-keep` / `item-cancel-amendment`；只对实际变更项（`change:none` 不发卡）；边界扩大以 `acknowledgments` 对象数组呈现并由 `respondUnsafe` 按 `required` 必选结算。
  - stable workflow 卡：app-owned `cardKind:"stable-write"`（无 flowId）；preview 含 path/base/target sha256 + diff；推荐 `reject-stable-write`；D1 以 `validateStableWriteCardShape` 做独立最小结构校验（`validateDecisionCardRequest` 对 `stable-write` 返回 `applicable:false`）。
  - role-card/boundary：沿用既有 appointment-write 卡（语义不变）；确认后 D1 仅签发一次性 stable 许可，不写盘。
- **stable-write**：`installStableWritePermitSnapshot`（重启后从 S2 `stableWrite.list()` + `findPermit(path)` 重建并安装 C2b 许可快照）；`stablePermitOf` 注入每个 role session（候选 = S4 runtime 缓存 ∪ 重启重建 map）；`completeWrite(actualSha)` 由 **after-write 钩子**（运行时核心 `versionedDocAfterWrite` 接缝，write/edit 成功后）调用，复核/消费/mini re-pin（不升 trunkVersion）；`migrationCompleted` 在迁移成功后置 true 并重建冻结快照。
- **F16**：appointment-write 的真实写入仍在 run-role 的 write/edit gate（B-11 `completeWrite` 复核）；D1 只提取 preview 正文、签发许可、外显结果——**无直接写盘路径**；测试断言签发许可前后目标文件字节不变。
- **F17**：不提供渲→主 `refactor:request`；重构只经 convener 能力（S4 `refactorRuntime.submit` 再校验角色）。本节点未新增条件性通道。
- **F15**：`trunk:state` 载荷 `stable` 同时含 `workflow` / `roleCards`（role-card.md）/ `boundaries`（boundary.yaml）三类快照；`trunk:state` 是唯一推送源（无 `doc-freeze:state`/`stable-write:state`/`version-change:state`/`refactor:state`）。
- **事件/账本**：经 S4 `emitEvent` → 生产 `appendTaskEvent(projectRoot, event)`；D1 不直接写账本、不伪造客户决定；幕僚/运营通知走 `delivery-note` 系统行（`noteVersionChange`），不使用 `request.notified`。
- **detail-amendment 闭环**：`version-change:present` 返回 `needsItems:true` 后，D1 在后台驱动 S4 `runAmendmentItems`（逐项卡）→ 全部作答后 `applyAmendmentItems`（只冻结 applied 项 → trunk apply → applied 事件）；取消 ⇒ 保持 approved、不改 trunk。无独立 IPC（不扩通道类别）。
- **测试**：D1 专项 **27 / 27 pass**；`test/桌面应用` 全量 **589 / 589 pass / 0 fail / 0 skip**（B0 基线 562 + 新增 27）；i18n 守护 **13 / 13**；跨节点源码钉（g1 文案/i18n 集成）**13 / 13**；`npm run typecheck` **exit 0**。未改断言、未新增 skip。

## 二、改动文件与哈希（写盘后实测）

| # | 路径 | 性质 | 行数 | SHA-256 | git hash-object |
| --- | --- | --- | --- | --- | --- |
| 1 | `app/desktop/version-change.ts` | 新增（卡/面板/许可/栈） | — | `e4ebd990756c303c32b0daf454165730f28df6e8d9e9de2d2dbc0c49b65de567` | `86d900297a71478248037df3ceed03ee6c3bce74` |
| 2 | `app/desktop/trunk.ts` | 新增（trunk 载荷 F15） | — | `abba5b4fbc82c143a40e8c13d29027a798deee849e2b85b06bef654b59d2d861` | `848878495fb3603ef56d9aadfe5c292b71e442ea` |
| 3 | `app/desktop/session.ts` | 改（卡通道/许可注入/after-write/appointment 钩子） | — | `dd7c1ba0eabf92304cd170b5bae213cd858acdf0fe29165243c7838eff260863` | `ca034786473619a26ff9432ccbf68398b3102a90` |
| 4 | `app/desktop/customer-input.ts` | 改（主权/`@决策` 排除/acknowledgments） | — | `c96b1383ebe35617e60a0e0d94f710fa5f36f0cd89bc497800e86571a47443b9` | `a38cbd41131086a9450277b3392162ebeff732d2` |
| 5 | `app/desktop/interface.ts` | 改（栈组合/IPC 方法/trunk:state 推送） | — | `d1db9fdbdfa74b8dd5b6d6cf3e73e1f618e84f9f41b96dcbe89ad2ec626a8f2c` | `a9340f6c64df119a0ea996eb60bb83c1ebac5a59` |
| 6 | `app/main.ts` | 改（通道注册/推送） | — | `4d82e7eba9ec166497f86a0dced786745654244874e3504f1929d20aeb9f3d8b` | `68a29d9d3f8eeb2c089f67825004174e1ffe031a` |
| 7 | `app/preload.cjs` | 改（白名单/onTrunkState 回放） | — | `c9c327e231034850d5aec6884578586942c4db09aa3e22c52f46015a5744ed25` | `a97d628a8157a7d9148662a4ebd00d42c863f48c` |
| 8 | `test/桌面应用/version-change.test.ts` | 新增（B-10；21 tests） | — | `33c4d416ddcb4694c7397e8adb848ee4eda119137f9ebf6772f5d9cb0c62cc56` | `c0cb254fa5ed4a241cb2a000a8aea091d5c3de60` |
| 9 | `test/桌面应用/trunk.test.ts` | 新增（B-4；6 tests） | — | `1f5adbbc04598ee0db992072aa12bcc6603e4a1db6b2ef14e7e20aa5ee950e76` | `ccf954d661b04960cc3efa482fa17170eb8534f0` |

**明确未改**：`src/model/**`、`src/common/**`、`src/service/**`、`src/provider/**`、`src/pipeline/**`、`app/renderer/**`、`package.json`、构建配置、角色卡/边界/`docs/scheduling|acceptance|communication/`、其它角色测试。

> 装配说明：`app/desktop/interface.ts` 直接使用 S4 交接的公共组合入口
> `src/service/version-change/public/version-change-integration.ts::createVersionChangeIntegration`（S1 存储 + S2 Service + trunk service）与四个 S4 Pipeline 公共句柄；
> 沿既有 Interface → Service **公共出口**先例（`resolve-role.ts`）；不 import Service/Provider 私有实现，不复制判定。

## 三、IPC 面（D1 冻结点；U1 只消费本表）

| 通道 | 方向 | 入参 | 回执/载荷 | 语义 |
| --- | --- | --- | --- | --- |
| `version-change:list` | 渲→主 invoke | `{projectRoot}` | `{ok:true, items: VcaSummary[]}` / `{ok:false, code, error}` | 待批/历史 VCA 只读摘要（≤200；applicationId/kind/initiator/flow/targets/status/trunk 结果） |
| `version-change:present` | 渲→主 invoke | `{projectRoot, applicationId}` | `{ok:true, status:"presented"\|"answered"\|"declined"\|"pending", applicationId, recordStatus?, needsItems?, resultTrunkVersion?, code?}` / `{ok:false, code, error}` | 对 **submitted** VCA 重发批准卡；无通道 ⇒ `pending` + `vca-channel-unavailable`（保持 submitted 可重试）；客户作答后由 S4 推进状态；detail 批准后后台驱动逐项卡 |
| `stable-write:list` | 渲→主 invoke | `{projectRoot, limit?}` | `{ok:true, items: StableWriteSummary[]}` | stable 确认/续接记录（path/kind/base/target/status/decisionId/confirmationId/approvedAt/expiresAt/writtenAt；**无 drift 字段**；expiresAt 仅外显） |
| `refactor:list` | 渲→主 invoke | `{projectRoot}` | `{ok:true, items: RefactorSummary[]}` | 重构审计（客户只读；无批准卡；提交只经 convener 能力） |
| `doc-freeze:list` | 渲→主 invoke | `{projectRoot, limit?}` | `{ok:true, freezes: DocFreezeSummary[], cacheHealth}` / `{ok:false, code, error, freezes:[], cacheHealth}` | 冻结清单 + 派生缓存健康；权威=R9 baseline，缓存由 Provider 对账/重建；桌面不解冻/不重建 |
| `trunk:state` | **主→渲 push** | `TrunkStatePayloadV1` | — | **单一状态源**：trunkVersion/source/runId/digest/availability/**stable{workflow, roleCards, boundaries}**/amendment/journal/pendingReattach/issues/freezes(cacheHealth)/pendingVersionChanges/refactors/disables |
| `trunk:list` | 渲→主 invoke | `{projectRoot}` | `{ok:true, trunks: TrunkListEntry[]}` | 当前 manifest 摘要（S2 未暴露历史；不虚构） |
| `trunk:upgrade-request` | 渲→主 invoke | `{projectRoot, reason:"emergency"\|"recovery", scope?: string[]}` | `{ok:true, previewId, preview}` / `{ok:false, code, error}` | **仅紧急/恢复**；preview 绑定当前 manifest + 磁盘 stable 哈希差异；一次性、10 分钟 TTL；常规内容变更拒绝并提示 stable-write/VCA |
| `trunk:upgrade-confirm` | 渲→主 invoke | `{projectRoot, previewId, acknowledged:true}` | `{ok:true, status:"applied", trunkVersion}` / `{ok:false, code, error}` | **仅 = 客户 UI 对同一 preview 的紧急/恢复二次确认**（一次性/过期/sender 校验；审计 `highRisk.acknowledged:true`）；**不是** VCA/stable 批准捷径 |
| `trunk:refreeze-request` | 渲→主 invoke | `{projectRoot}` | `{ok:false, code:"trunk-operation-unavailable", error}` | S2 未提供 refreeze API；P1.6 已移除 drift；**结构化不可用，不虚构动作** |
| `trunk:abandon-upgrade` | 渲→主 invoke | `{projectRoot}` | 同上 | S2 未提供 abandon API；不虚构清理 |
| `trunk:recover-request` | 渲→主 invoke | `{projectRoot, reason, acknowledged:true}` | `{ok:true, status:"recovered", trunkVersion}` / `{ok:false, code, error}` | 客户确认的受控恢复（tN+1）；reason 必填 |
| `session:operator-response` | 渲→主（既有） | 既有 + `payload.acknowledged: string[]` | 既有 | **VCA/逐项/stable 卡的唯一客户批准/拒绝通道**（请求快照校验） |
| `session:operator-request` / `-expired` / `-judge` | 主↔渲（既有） | 既有 + `request.acknowledgments` 对象数组 | 既有 | 复用；**不新增卡 IPC 类别**；主权卡不产生 judge 结果行 |

- 所有渲→主入站 handler 校验 `event.sender === win.webContents`，非法 ⇒ `{ok:false, code:"invalid-sender"}`；Interface 仅接受当前导入项目根（未导入时允许单测直用）。
- **无** `version-change:submit` / `refactor:request` / `stable-write:request` 渲→主通道（F10/F17；结构断言见 `version-change.test.ts` 与 `trunk.test.ts` 源码钉）。
- 推送单一来源：仅 `trunk:state`；`preload.onTrunkState` 注册时回放最后一条（首帧可渲染）。

## 四、客户卡与客户主权（AC-4/AC-18/AC-33）

1. **通道选择**：`SessionManager.pickGovernedCardEntry` 顺序 convener → rapporteur → chief（与会话 `handbackOwnerRoleId`/`chiefTaskRoleIdOf` 同源；需本会话已构造 `governedCardContext`）。无治理会话/无客户通道 ⇒ presenter 返回 `unavailable`（VCA 保持 submitted；stable 不签发许可）。
2. **生命周期**：`withRequestLifecycle(sourceRoleId:"application", requestId=vc-<applicationId> / vc-item-<applicationId>-<itemId> / sw-card-<requestId>, notify:"none")`；`request.resolved.by` 只可能是 customer；`request.resolved` **不加** `acknowledged` 字段。
3. **排除**：
   - `isApplicationDecisionReservedForCustomer` 扩展识别 VCA（`approve/reject-version-change`）、逐项/最终修正案词汇与 app-owned `stable-write` 卡种；
   - `tryApplyDirectiveDecision` 在进入 `applyDecisionDirective` 前对主权卡返回 false（不消费指令、不写 `directive:<id>`、不结算）——**F9 缺口已修**；
   - `tryAutoSelectDecision` 既有早退继续覆盖；`planJudge` 对 decision/stable-write 均不判断；
   - `settleEntry` 出口最后防线：主权卡 outcome 带 judge 审计或 operatorId 以 `judge:`/`directive:` 开头 ⇒ 拒绝结算并诊断；
   - presenter 结果再做 `toVersionChangeOutcome`/`toStableWriteOutcome` 二次校验（非 customer ⇒ unavailable）。
4. **acknowledgments（F1）**：`CustomerInputRequest.acknowledgments` 对象数组原样透传；`respondUnsafe` 按 `required` 校验（非数组/缺失/多余 ⇒ `{ok:false}`、pending 保留）；结算回传 `CustomerInputOutcome.acknowledged: string[]`；逐项卡结果映射为 `AmendmentItemOutcome.acknowledgments: {id,label}[]`。
5. **appointment-write**：语义/审批链/D3 校验/写入路径**零变化**；D1 只在确认后从卡 preview 的逐路径正文（`declaredPathBodies`，与呈现前完整性闸同一口径）提取 role-card/boundary 正文，调用 S4 `onAppointmentWriteApproved` 签发许可；真实写入由角色 `write_file`/`edit_file` 经 run-role gate 执行（**F16**）。

## 五、stable-write / 冻结缓存 / trunk（F13/F15/F16）

1. **许可安装与重建**：S2 approve 经 `StablePermitPort.installSnapshot` 安装 C2b 许可快照（唯一实现）；D1 `ensureInitialized` 在每次栈创建/重启后：
   - `integration.ensureMigration(at)`（missing ⇒ 既有版本化文档一律冻结；corrupt ⇒ fail-closed）；
   - `migrationDone = true` → `refreshVersionedDocFreezeSnapshot(root, {migrationCompleted:true})`（避免 missing 迁移后停留在 migration-required）；
   - `services.stableWrite.list()` → 对每个 `approved` 记录 `findPermit(path)` → `installStableWritePermitSnapshot(root, permits)`，并填充重启候选 map。
2. **`stablePermitOf`**：注入 `openRoleSession` 的同步候选 = `stableWriteRuntime.stablePermitOf(rel)` ∪ 重启重建 map（按 canonical stable path 小写键）；`stableWriteDecision` 仍以已安装快照逐字段校验（一次性/过期/伪造/哈希不符 fail-closed）。
3. **completeWrite**：`versionedDocAfterWrite` 接缝（运行时核心 write/edit 成功后）先执行既有 R9 版本登记，再对 stable 路径计算实际字节 sha256 并调用 `completeWrite(actualSha)`：
   - 成功 ⇒ 消费许可、mini re-pin（更新 trunk manifest workflow/roleCards/boundaries 快照，绑定 decisionId/confirmationId）、`trunk.state(op:"stable-repinned")`、**trunkVersion 不变**；
   - 不符/异常 ⇒ `failed`、许可作废、不更新快照、无 drift；D1 只投一条系统行/诊断（写入已成事实，不静默回滚）。
4. **F16 边界**：D1 **不直接写盘**；所有 `.ans` 写入在 Provider/Service；stable 写入真实执行点在 run-role gate（write/edit 带 `contentSha256`）+ B-11 `completeWrite`。
5. **F15**：`buildTrunkStatePayload` 投影 `stable.workflow` / `stable.roleCards` / `stable.boundaries` 三类（`TrunkStableView {kind,path,sha256}`）；`trunk:state` 为唯一推送源；无 `*-state` 第二源。
6. **trunk 升级**：`requestTrunkUpgrade` 只接受 emergency/recovery；目标 = 当前 manifest documents/execution + 磁盘重算的 stable 哈希；preview 一次性 10 分钟；`confirm` 以 `decisionId:"trunk-upgrade-<previewId>"` + `highRisk.acknowledged:true` 调 S4 `mainUpgrade`（提交点/失败不改指针由 S2 保证）。常规内容变更由 S2 scope 校验拒绝。
7. **对账**：`trunkState` 每个栈**首次**调用 `reconcile()`（crash 后相位滞后补写幂等事件）；避免「split → 事件 → 推送」循环。

## 六、F15 / F16 / F17 关闭证据

| 项 | 落点 | 证据 |
| --- | --- | --- |
| **F15** `trunk:state` roleCards | `app/desktop/trunk.ts::buildTrunkStatePayload`（`stable.roleCards`）；`version-change.ts::trunkState` 从 S2 `status().stable.roleCards` 投影 | `trunk.test.ts`「trunk:state 载荷：F15 workflow/roleCards/boundaries 三类」；`version-change.test.ts`「trunk:state（F15）」真实 bootstrap manifest 断言 `roleCards.impl` |
| **F16** appointment-write 执行点 | `session.ts::afterAppointmentWriteApproved`（只签发许可）+ `afterStableWrite`（post-write 复核）；无任何桌面 fs 写入稳定文件 | `version-change.test.ts`「appointment-write 钩子（F16）：只提取 preview 正文/签发许可；桌面不写盘」前后字节相等；`write-safety.test.ts`/`operator-channel.test.ts` 回归 |
| **F17** 无 `refactor:request` | `VERSION_CHANGE_IPC_CHANNELS` 不含 `refactor:request`；Interface 无 `requestRefactor`；main.ts 不注册；preload 不暴露 | `version-change.test.ts`「IPC 冻结集」；`trunk.test.ts`「接线源码钉」与 Interface 方法结构断言 |
| **F13** 许可形状 | 仅消费 C1 `StableWritePermit`（S2 `PermitFact` 别名）；D1 不另造 permit/status | `version-change.test.ts` 重启重建 + `stableWriteDecision` 放行断言 |
| **F9** `@决策` 排除 | `customer-input.ts::tryApplyDirectiveDecision` 早退 + `settleEntry` 最后防线 | `version-change.test.ts`「客户主权：VCA 卡 @决策 指令不消费」；`directive-decision.test.ts` 回归 |

## 七、测试与类型检查（原始结果）

1. **D1 专项**：`node --test test/桌面应用/trunk.test.ts test/桌面应用/version-change.test.ts` → **tests 27 / pass 27 / fail 0 / skipped 0**。
   - B-10（21）：卡组装/结构校验/主权/acknowledgments/会话生命周期/无通道 fail-closed/stable 许可与 mini re-pin/拒绝/哈希不符/重启重建/appointment 钩子（F16）/迁移与损坏/trunk:state F15/主干升级一次性/refactor 审计/IPC 冻结集/列表面。
   - B-4（6）：trunk:state 载荷 F15/Interface 只读与受控回执/VCA present 回执与无 submit/detail 逐项闭环/trunk 升级与恢复/接线源码钉。
2. **`test/桌面应用` 全量**：`node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"` → **tests 589 / pass 589 / fail 0 / skipped 0**（B0 基线 562 + 新增 27；无新增失败、无新增 skip）。
3. **i18n 守护**：`node --test test/项目管理/shared/i18n.test.ts` → **13 / 13 pass**（C3 99 key 未改）。
4. **跨节点源码钉**：`node --test test/测试/g1-verify/g1-copy-and-nails.test.ts test/测试/i18n-integration.test.ts` → **13 / 13 pass**。
5. **`npm run typecheck`**：`tsc --noEmit` **exit 0**。
6. 未改任何断言以保绿、未新增 skip；既有失败无新增（本节点未触及 `test/编排`/全量 T3 套件；S4 记录的既有 Windows symlink EPERM 等分类不变）。

## 八、U1 消费契约（D1 冻结）

- **入口**：客户侧「版本变更」面板/「主干与版本变更」面板 + 收窄「主干升级」；运营「重构申请」（能力工具，不在渲染表单）；产品/策划「在会话中提交」（只读指引）。
- **只读拉取**：`listVersionChanges` / `listStableWrites` / `listRefactorRequests` / `listDocFreezes` / `listTrunks`；打开面板时拉取，**不订阅** `version-change:state`/`stable-write:state`/`refactor:state`（不存在）。
- **唯一推送**：`onTrunkState(cb)`（preload 已回放最后一条）；按钮禁用只读 `payload.disables`，不自行推导。
- **重发卡**：`presentVersionChange({applicationId})`；`status:"presented"` 后等待事件/`trunk:state`/列表刷新，不轮询。
- **客户决定**：只经既有交互卡 `onOperatorRequest` + `operatorRespond`（`request.acknowledgments` 对象数组 → 回传 `acknowledged: string[]`）；U1 不新增批准按钮/IPC。
- **主干升级**：`requestTrunkUpgrade({reason:"emergency"|"recovery", scope})` → 展示 `preview.changes` → `confirmTrunkUpgrade({previewId, acknowledged:true})`（同一 previewId，一次性）。
- **错误外显**：结构化 `{ok:false, code, error}`；冻结缓存 corrupt ⇒ `cacheHealth:"corrupt-failclosed"` + `disables` 文案（fail-closed，不自动重建）。
- **无 drift**：面板只展示 stable 确认/续接记录（path/decisionId/old-new hash/时间）；不展示「带着漂移继续」。

## 九、遗留与如实披露（交 T1/T2/E1）

1. **能力工具缺口（`src/**`，非 D1 写集）**：C1/S4 未提供 `submit_version_change` / `request_stable_write` / `submit_refactor` 的 model 能力类型与运行时工具注册（全仓无同名符号）。后果：VCA 提交、workflow stable 写入、重构提交在本批**没有模型可达的发起入口**；D1 已把栈方法（`presentVersionChange`/`requestWorkflowWrite`/`refactorRuntime.submit`）、卡与许可全部接通并用测试直调验证。需后续节点在 `src/model/runtime.ts` + `src/provider/runtime/tools.ts` + `run-role.ts` 透传 + `session.ts` 注入补能力位（届时移除本披露）。
   - 重要副作用：D1 为所有会话注入 `stablePermitOf` ⇒ convener 对 `docs/workflow.md` 的**预授权直写被门禁拒绝**（P1.6 预期：必须经 stable 确认卡）；在能力工具落地前，workflow 写入不可完成（fail-closed，不是静默放行）。
2. **`trunk:refreeze-request` / `trunk:abandon-upgrade`**：S2 无 refreeze/abandon API（P1.6 已移除 drift），D1 保留通道名但返回 `trunk-operation-unavailable`（不虚构动作）。U1 应禁用/隐藏或显示「不可用」；若必须实现，需 S2 契约追加（跨节点停止项）。
3. **`trunk:list` 历史**：S2 只暴露当前 manifest；D1 返回当前摘要（`current:true`），不虚构历史。历史面板需 S2 公开 `listHistory`。
4. **appointment-write 正文来源**：许可 targetSha256 用确认卡 preview 的逐路径正文（末尾补一个 `\n`，文本文件惯例）。若 owner 实际写入字节不同 ⇒ 门禁 hash 拒绝（fail-closed），面板 `failed`；不静默回滚。该「预览内容 ≠ 写出内容」残余风险沿既有 `confirmed-writes.ts` 披露。
5. **`trunk:upgrade-confirm` / `trunk:recover-request` 的 decisionId**：D1 以 `trunk-upgrade-<previewId>` / `trunk-recovery-<ts>` 绑定客户 UI 二次确认（previewId 一次性 + `acknowledged:true` + sender 校验）；非卡通道、不可复用于 VCA/stable 批准。S2 因提供 decisionId 将审计记 customer（操作确为客户 UI 确认）。
6. **detail 逐项闭环**：S4 无最终 `apply-amendment` 卡；D1 在逐项全部作答后直接调用 `applyAmendmentItems`。若客户在逐项卡上取消 ⇒ 保持 approved、不改 trunk（无 apply）；重试需重新 `version-change:present`。
7. **i18n 缺口（C3）**：C3 未提供逐项选项 label 与 acknowledgment 校验专用 key；D1 复用 `ui.confirm.approve`/`ui.confirm.reject`/`shared.common.cancel` 与 `main.customerInput.selectionMustBeArray`/`selectionNotInRequest`。U1 原样展示；如需更精确文案由 C3 追加 key（D1 不硬编码中文）。
8. **冻结清单 `decidedBy`**：`doc-freezes.json` 派生缓存条目不含 `decidedBy`；`doc-freeze:list` 只展示 reason/applicationId/迁移标记（不虚构客户归属）。
9. **通知**：VCA/stable/refactor 的 S4 `notify` 文案经 `noteVersionChange` 以 `delivery-note` 系统行投幕僚/运营；未使用 `request.notified`（VCA/stable 卡 `notify:"none"`）。S4 文案本身在其写集，D1 原样透传。
10. **T1/T2**：真实 Electron 截图/全量 T3 回归/双端 `typecheck:renderer`+`build:renderer` 属 U1/T1/T2；本记录不声称通过。

## 十、声明

- 本记录不是实施授权、不是客户闸门、不是契约冻结、不是验收结论；不替代 T1/T2/E2。
- 本节点仅写 §二列出的文件；**未改 `src/**`/`app/renderer/**`/`package.json`/构建配置/角色卡/边界/`docs/scheduling|acceptance|communication|planning`/其它角色测试**。
- 未运行应用（无 Electron 截图）；**未 commit / push / merge / release**。
- 若后续需要改冻结契约/服务/守卫或新增 B-x，按停止项回报，不自行扩写集。
