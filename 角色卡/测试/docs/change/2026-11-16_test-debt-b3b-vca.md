# B3b（2026-11-16）：VCA 流程/通道族 13 名测试债定性/治理

- 角色：ANS「测试」（roleId: 测试）。
- 任务：测试债 B3b——VCA 流程/通道族 13 名（`test/测试/version-change-integration.test.ts` 9 名 +
  `test/桌面应用/version-change.test.ts` 4 名）。依据 `角色卡/测试/docs/change/2026-11-16_remediation-plan-r3-update.md`
  §4.5/§5.1 与 `2026-11-16_remediation-plan_r3-evidence/`（`11-families.json` 的 `vca-flow` 族、`01/02/03/04`、`10-block-codes.json`）。
- 工作树/分支：`.claude/worktrees/fix-test-debt-b3b` / `fix/test-debt-b3b`，起点 `8d6a35e`（= `origin/main`）。
- 协调者裁定：**默认维持 fail-closed；先调查定性**——若存在「受支持语义被移除」确凿证据则停改、报产品候选；
  否则判定测试装配过时，按当前真实语义更新装配/期望，断言不放宽、用例不删。
- 范围：只改上述 2 个测试文件 + 本记录/同前缀 `_evidence/`。未改产品代码/其它测试/workflow/release.yml/
  角色卡/边界；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 本机环境：Windows 11 Pro 10.0.26300，Node v24.22.1（CI 为 Node 24.14.0）；仅 Windows 本机验证，
  未跑 macOS/CI（平台结论沿用 R3 证据：该族 13 名在 arm64/x64 同集合同名复发，见 `02/03` 失败名清单）。

## 〇、结论摘要（先读）

1. **定性结论：13/13 均为「测试装配过时」，无产品候选。** 当前产品真实语义（自 `e71501c` 起）是
   **role-direct 直接提交**：product/rapporteur 以真实会话角色 + `operationId` + 显式 `baseTrunk`
   （`TrunkCommitRef`）与逐目标 `expectedFromSha256` 经 `submitDirect` 一步提交并应用；
   **旧客户批准卡通道（`submit`/`present`/`approve`/`reject`/`runAmendmentItems`）已按产品裁决关闭**，
   历史请求只读，需显式 `supersedesApplicationId` 才能重提。13 名失败用例全部仍在调用旧通道、
   或未给 direct 提交提供真实 operation/base/expectedFrom/父任务/run 事实——不是能力被错误关闭。
2. **关闭有产品记录与契约锚点**（非误关）：
   - `角色卡/编排/api-spec.md:1227`：「ordinary submit/present no longer create customer approval cards」；
   - `角色卡/桌面窗口/api-spec.md:605`：「VCA submitVersionChange 改 submitDirect」；
   - `角色卡/桌面窗口/docs/change/2026-11-05_change_direct-role-capabilities.md`：
     「submitVersionChange 接 submitDirect 而非旧批准卡」；
   - `app/desktop/version-change.ts:1247-1250`：`submitVersionChange` 直接转发 `versionChangeRuntime.submitDirect`；
   - `src/pipeline/orchestration/version-change-runtime.ts:766-815`：`submit/present/approve/reject/runAmendmentItems`
     全部 fail-closed（`vca-channel-unavailable` / `vca-conflict`）；
   - 同文件已存在的绿色用例 `W2 ordinary submit uses real direct validation and never revives the former approval card`
     即为当前语义的钉住测试。
3. **真实能力仍在**：`submitDirect` 完整保留（product version-upgrade / rapporteur detail-amendment 整单），
   role-direct 冻结（`role-direct-applied`）、R9、trunk CAS、`notifyDirect` 固定 key 通知、fail-closed 链校验
   全部可用。api-spec 明示 direct「不经过客户 approved、不填 decisionId、不重 pin 旧 run」。
4. **改法**：只更新 2 个测试文件的装配/期望至当前语义——补真实 operation/base/expectedFrom、真实
   intent-confirmed 证据、真实父任务/parentTaskRef/pinned run、`notifyDirect` sink、G 公共冻结快照刷新；
   **断言零放宽、用例零删除**（旧语义用例按当前语义改名并逐条记录理由）。
5. **验证**：两文件各 **3× 自然退出 EXIT=0**（integration 12/12 pass；desktop 46/46 pass）；原 13 名全部转绿、
   **其余失败名 0（无剩余）、零新增**；`npm run typecheck` **EXIT=0**。详见 §四。
6. **产品候选：无**（见 §五）。两处实现细节按当前契约如实记录：direct 首建 manifest `source:"upgrade"`
   （`previous:null`）；direct 升级不 re-pin 旧 run——与 api-spec 明文一致，不是缺陷。

## 一、证据来源与错误面

### 1.1 R3 家族证据（`2026-11-16_remediation-plan_r3-evidence/`）

- `11-families.json` → `vca-flow`：13 名（arm64 13 / x64 13；win 0），文件分布
  `test/测试/version-change-integration.test.ts` 9 + `test/桌面应用/version-change.test.ts` 4；
  错误码计数 `ERR_ASSERTION 13 / vca-role-not-allowed 3 / vca-channel-unavailable 4`。
- `02-failnames-macos-arm64.txt` / `03-failnames-macos-x64.txt`：13 名双平台同名复发；
  `10-block-codes.json`：逐名首错（见 §二表格「R3 首错」列）。

### 1.2 产品语义锚点（代码/契约）

| 锚点 | 事实 |
| --- | --- |
| `src/pipeline/orchestration/version-change-runtime.ts:633-765` | `submitDirect(input,trustedActorRoleId)`：要求 `operationId`、`baseTrunk !== undefined`、`initiatorRoleId === trustedActorRoleId` 且角色 = product（version-upgrade）/ rapporteur（detail-amendment）；前置 product/rapporteur 模块 preflight；真实 complete-snapshot CAS + `executeGitDocumentPublication`/`executeDirect`；`notifyDirect` 固定 key 通知 chief/convener/发起角色。 |
| 同文件 `:766-815` | `submit()` 恒返回 `vca-channel-unavailable`（「the former customer approval channel is closed」）；`present()` 恒 `vca-channel-unavailable`；`approve()` 仅允许恢复既有真实客户批准（否则 `vca-conflict`）；`reject()` 历史只读；`runAmendmentItems()` 逐项卡关闭。 |
| `src/service/trunk/impl/apply-journal.ts:1357-1430` | `prepareDirectSubmission`：逐目标必须带 `expectedFromSha256`；targets 必须已在快照中存在；bootstrap 需真实 `intent-confirmed` 冻结记录 + baseline 闭合证据。 |
| 同文件 `:646-700` | direct 提交的 R9 冻结 reason = `role-direct-applied`、origin = `role-direct`、带 `actorRoleId/source/snapshotRef`、无 `decidedBy/decisionId`。 |
| 同文件 `:910+`（`executeDirect`） | direct 升级/修正案提交点前执行 schema/roster/D3/版本链/execution 文档校验；失败 fail-closed、不提交、不冻结；**不重 pin 旧 run**（api-spec 明文）。 |
| `src/provider/version-change/impl/guard-freeze-registry.ts`（e71501c 头部） | 「O-owned R9 storage … G owns parsing/validation and **installs its own snapshots**」：Provider 不再安装 C2b 全局守卫快照；同步快照由 G 公共刷新（`refreshAndInstallVersionedDocFreezeSnapshot`）安装——生产路径 = 桌面栈 `initialize()`（`app/desktop/version-change.ts:995`）与会话边界解析（`resolve-boundary.ts`）。 |
| `app/desktop/version-change.ts:1247-1250`、`interface.ts:2218-2245` | 桌面 `submitVersionChange` = `submitDirect(input, input.initiatorRoleId)`；栈注入 `notifyDirect`（缺省 ⇒ committed-pending-recovery）。 |
| `角色卡/桌面窗口/api-spec.md:605`、`角色卡/编排/api-spec.md:1227`、`2026-11-05_change_direct-role-capabilities.md` | 旧批准卡关闭、`submitDirect` 为真实入口；direct 不经客户 approved、不填 decisionId、不重 pin 旧 run。 |

## 二、逐名定性（13 名）

判定口径：**产品语义** = 当前产品明确支持/关闭的行为；**测试假设** = 用例对旧通道/旧夹具事实的依赖。
所有 13 名判定为**测试假设过时**；产品语义均按现状保留（不修改产品）。「改法」均在 2 个测试文件内。

| # | 文件 | R3 首错/错误码 | 定性依据（产品语义 vs 测试假设） | 改法（当前语义，断言不放宽） |
| --- | --- | --- | --- | --- |
| 1 | `test/测试/version-change-integration.test.ts`：`VCA：product version-upgrade 经真实客户卡提交/批准 …` | `vca-channel-unavailable`（`submit` 关闭） | 测试走 `runtime.submit`+`present`（旧两阶段客户卡）；产品自 e71501c 仅保留 `submitDirect` 一步提交。旧语义「提交→客户批准→applied」不存在。 | 改名「经真实直接提交（role-direct）」；`submitDirect`（operationId/base/expectedFrom）→ applied；断言 role-direct 冻结 reason/origin/actor、R9、t2、守卫拒绝覆盖、单 applied 事件、`notifyDirect` 三收件人；并显式断言 `submit/present` 仍 `vca-channel-unavailable`。 |
| 2 | 同文件：`VCA：detail-amendment 提交冻结修正案 → 批准 → 逐项 apply/keep + acknowledgments …` | `vca-channel-unavailable` | 旧「批准+逐项卡 apply/keep」能力已被产品关闭（`runAmendmentItems` fail-closed）；当前 detail-amendment = 整单直接提交。 | 改名「整单直接提交」；`submitDirect`（rapporteur + amendmentId/doc）→ applied、全 target 生效；修正案与 contract 目标 `role-direct-applied` 冻结、execution 不冻结；`runAmendmentItems`/`present` 断言 `vca-channel-unavailable`（通道关闭本身成为被测语义）。 |
| 3 | 同文件：`VCA：客户拒绝 ⇒ 目标保持草稿、不 re-pin；修正案保持冻结 …` | `ERR_ASSERTION`（旧 submit/reject 流程） | 客户拒绝入口关闭；当前 `reject/approve` 对历史 pending 只读，重提需显式 supersede。 | 改名「历史客户拒绝/批准入口只读 + 显式 supersede」；用真实 `create`+Service `submit` 造历史 pending；`runtime.reject/approve` 断言 `vca-conflict`、目标草稿/不冻结/trunk 不变；显式 supersede 后 applied 且旧记录视图 `superseded`。 |
| 4 | 同文件：`VCA：发起角色、目标范围、base 匹配、并发与幂等（真实错误码）` | `vca-channel-unavailable`（尾段 `runtime.submit`） | 角色/目标/base 矩阵走 Service `create` 仍有效；但并发/幂等/`vca-pending` 应按 direct `operationId` 语义，而非旧客户卡 `submit`。 | 保留 Service 矩阵断言；尾段改 `submitDirect`：同 operation/同请求幂等（trunk 不重复推进）；历史 pending（`create`+Service `submit`）阻断新 direct（`vca-pending`）；显式 supersede 后 applied/t3。 |
| 5 | 同文件：`VCA：批准前 toSha256 重验（提交后目标漂移 ⇒ vca-hash-drift …）` | `ERR_ASSERTION` | 「批准前重验」属于已关闭的两阶段通道；当前重验在 direct 提交点：`expectedFromSha256` 必须等于实际旧基线 hash。 | 改名「直接提交 expectedFrom 重验」；错误 hash ⇒ `vca-target-invalid`、无记录/冻结/re-pin；正确 hash ⇒ applied/t2。 |
| 6 | 同文件：`VCA AC-5：无效 roster / D3 越界 / 版本链不匹配 ⇒ 批准前 fail-closed …` | `vca-channel-unavailable` | AC-5 校验点随通道迁移到 **direct 提交点**（`prepareDirectSubmission`+`executeDirect`），错误面为 `vca-apply-failed`（提交点前拒绝）。 | 三子案改 `submitDirect` fail-closed：`vca-apply-failed`；trunk/run/冻结不变、目标保持草稿；第三案补齐 roster/proposal/architecture/modules 四文档，命中真实版本链不匹配。 |
| 7 | 同文件：`VCA AC-5：apply 前重验（批准后链损坏 ⇒ vca-apply-failed …；修复后可重试）` | `ERR_ASSERTION` | 无「批准后 apply」阶段；当前等价语义 = direct 提交时链校验 fail-closed，修复后以新 operation 重试（direct 不重 pin 旧 run，api-spec 明文）。 | 改名「直接提交 apply 前重验」；链损坏 ⇒ `vca-apply-failed`、draft/不冻结/trunk 不变；修复（roster/architecture 引用 proposal v2）后新 operation ⇒ applied/t2；断言 run 无 repins。 |
| 8 | 同文件：`bootstrap：无 trunk VCA（baseTrunk:null + bootstrap:true）批准 → 冻结目标并建立 trunk v1` | `vca-channel-unavailable` | 旧「提交后批准建立 t1」通道关闭；当前 bootstrap = 显式 `baseTrunk:null` + 真实 `intent-confirmed` 冻结证据的 direct 首建。 | 改名「显式 baseTrunk:null + 真实 intent-confirmed 直接建立 t1」；先断缺证据 `vca-target-invalid`/不建 trunk，再以真实 intent-confirmed 提交 ⇒ applied/t1；断言 `role-direct-applied` 冻结、`bootstrap:true` 事件、direct 不写 doc.freeze 事件。 |
| 9 | 同文件：`冻结：missing ⇒ 既有文档一律冻结；corrupt ⇒ fail-closed；doc-freezes 派生缓存可重建且以 R9 为准` | 严格相等：`unknown` ≠ `frozen`（第 1118 行） | e71501c 后 Provider 只维护自身 R9 视图，**不再安装 C2b 全局守卫快照**；测试直接查询 `versionedDocFreezeState` 却未走 G 公共刷新。生产由桌面栈 `initialize()` 安装（`version-change.ts:995`）。属装配缺一步，不是产品回归。 | 在迁移/ensureReady 与 draft-marker 之后调用 `refreshAndInstallVersionedDocFreezeSnapshot`（G 公共路径）再断言；corrupt 案同样经公共刷新断言 `unknown`（fail-closed）。断言文本不变。 |
| 10 | `test/桌面应用/version-change.test.ts`：`Batch 3.5 能力实现：VCA submit（submitted）/ …` | `vca-role-not-allowed`（缺真实 role/operation/base） | 桌面 `submitVersionChange` 已接 `submitDirect`；测试仍按旧通道只给 kind/targets，缺 operationId/base/expectedFrom 与 `notifyDirect` sink。 | 改名「VCA submitDirect（applied）」；补 operationId/base/expectedFrom + `notifyDirect`；断言 applied、无客户卡（presenter 零调用）、账本 version.change `applied/role-direct/op`；refactor/stable 断言保持。 |
| 11 | 同文件：`VCA 基线修复：无已落盘 trunk ⇒ submitVersionChange 自动按 bootstrap 提交 …` | `vca-role-not-allowed` | 「无 base 自动推导 bootstrap」是旧应用侧便利语义，已被 direct 的显式 base 要求关闭；bootstrap 必须显式 `baseTrunk:null` 且带真实 `intent-confirmed`。 | 改名「显式 baseTrunk:null + 真实 intent-confirmed 才建立 t1；缺显式 base 一律拒绝」；缺 base ⇒ `vca-role-not-allowed`/不建 trunk；显式 null+证据 ⇒ applied/t1，断言 record `bootstrap:true`、`baseTrunk:null`、账本 applied。 |
| 12 | 同文件：`VCA 自动呈现：提交成功即自动调用客户批准卡（不阻塞回执；无通道保持 submitted）` | `vca-role-not-allowed` | 「提交后自动呈现客户批准卡」已随旧通道关闭（api-spec：ordinary submit/present no longer create customer approval cards）；当前 direct 提交即 applied。 | 改名「直接提交不复活客户批准卡」；补真实 direct 输入；断言 applied、presenter 零调用、无第二张卡、列表 status applied。 |
| 13 | 同文件：`SessionManager blocked 提示：无客户卡通道 ⇒ 只记诊断、不提示；报告路由照常` | `/\[工作结果\]/` 不匹配（convener 未收到） | 回交投递的 `resolveDeliveryAssignment(child-report)` 要求真实分配事实：child `parentTaskRef`、父任务 `to=convener` 同 flow/run、run 记录 draft/pinned、child 的 `task.reported`。测试只 seed 了无父/无 run 的子任务 ⇒ `delivery-child-source-invalid`，消息保留但未投递。属夹具缺真实轮次事实，不是路由回归。 | 用 `createTrunkProject()`（带 pinned run）+ 补真实父任务 `T-parent-1`（chief→convener）与子任务 `parentTaskRef`（ledgerSha256 真实 hash）；断言不变（`[工作结果]`/摘要/不提示/诊断三项）。 |

## 三、改动摘要（仅 2 文件）

- `test/测试/version-change-integration.test.ts`（+538/−349 行）：
  - 装配：`notifyDirect` sink、`directBaseOf()`（`TrunkVersionRef`→`TrunkCommitRef`）、`refreshGuardSnapshot()`（G 公共
    守卫快照）、`refreshFreezeRegistry()`（direct 提交后刷新集成层冻结查询）、真实 direct 输入构造。
  - 9 名按 §二 改写；补充/保留断言：role-direct 冻结归属（无客户字段）、R9、trunk 版本、run 无 repins、
    旧通道 `vca-channel-unavailable`/`vca-conflict`、单 applied 事件、`notifyDirect` 收件人、AC-5 三类链错误、
     bootstrap 证据闭合、guard 快照与 corrupt fail-closed。
  - 头部注释同步为当前语义（旧「客户卡批准」覆盖描述移除）。
- `test/桌面应用/version-change.test.ts`（+176/−76 行）：
  - 3 名 VCA 能力用例改 direct（operationId/base/expectedFrom/`notifyDirect`）；1 名 blocked 回交用例补真实
    `createTrunkProject` 根、父任务与 `parentTaskRef`；`seedPlanTask` 增加可选 `runId` 与真实父任务。
  - 断言零放宽：容量用例由 status「submitted」改为「applied」，同时新增「presenter 零调用」「账本
    role-direct 事件」「bootstrap 记录事实」等严格断言；blocked 用例断言逐字保留。
- 用例数不变：integration 12、desktop 46；无删除、无 skip、无断言放宽。
- 未改产品/其它测试/配置/workflow。未 commit/push。

## 四、验证（本机 Windows，Node 24.22.1）

### 4.1 命令与结果

```bash
node --test --test-timeout=120000 "test/测试/version-change-integration.test.ts"   # 3×
node --test --test-timeout=120000 "test/桌面应用/version-change.test.ts"          # 3×
npm run typecheck
```

| 轮次 | integration | desktop | 自然退出 |
| --- | --- | --- | --- |
| run1 | 12 tests / 12 pass / 0 fail | 46 tests / 46 pass / 0 fail | EXIT=0 / EXIT=0 |
| run2 | 12 / 12 / 0 | 46 / 46 / 0 | EXIT=0 / EXIT=0 |
| run3 | 12 / 12 / 0 | 46 / 46 / 0 | EXIT=0 / EXIT=0 |

日志：`_evidence/03..05-after-integration-run{1,2,3}.txt`、`_evidence/06..08-after-desktop-run{1,2,3}.txt`；
`npm run typecheck` EXIT=0（`_evidence/09-typecheck.txt`）。

### 4.2 原 13 名 → 转绿名（逐名，含改名）

1. （原）`VCA：product version-upgrade 经真实客户卡提交/批准 → 冻结+R9+trunk t2；冻结后守卫拒绝同版本覆盖`
   → `VCA：product version-upgrade 经真实直接提交（role-direct）→ 冻结+R9+trunk t2；冻结后守卫拒绝同版本覆盖`
2. （原）`VCA：detail-amendment 提交冻结修正案 → 批准 → 逐项 apply/keep + acknowledgments → 只冻结 applied`
   → `VCA：detail-amendment 整单直接提交（role-direct）→ 修正案与 applied 目标冻结 + trunk t2；逐项客户卡通道关闭`
3. （原）`VCA：客户拒绝 ⇒ 目标保持草稿、不 re-pin；修正案保持冻结（不可原地复用）`
   → `VCA：历史客户拒绝/批准入口只读（vca-conflict）⇒ 不冻结/不 re-pin；显式 supersede 才可重提`
4. `VCA：发起角色、目标范围、base 匹配、并发与幂等（真实错误码）`（名称保留）
5. （原）`VCA：批准前 toSha256 重验（提交后目标漂移 ⇒ vca-hash-drift，不冻结/不 re-pin）`
   → `VCA：直接提交 expectedFrom 重验（声明旧基线 hash 不符 ⇒ vca-target-invalid，不冻结/不 re-pin）`
6. （原）`VCA AC-5：无效 roster / D3 越界 / 版本链不匹配 ⇒ 批准前 fail-closed（不冻结/不 re-pin/trunk 不变）`
   → `VCA AC-5：无效 roster / D3 越界 / 版本链不匹配 ⇒ 直接提交 fail-closed（不冻结/不 re-pin/trunk 不变）`
7. （原）`VCA AC-5：apply 前重验（批准后链损坏 ⇒ vca-apply-failed，不 re-pin；修复后可重试）`
   → `VCA AC-5：直接提交 apply 前重验（链损坏 ⇒ vca-apply-failed，不 re-pin；修复后新 operation 重试成功）`
8. （原）`bootstrap：无 trunk VCA（baseTrunk:null + bootstrap:true）批准 → 冻结目标并建立 trunk v1`
   → `bootstrap：无 trunk ⇒ 显式 baseTrunk:null + 真实 intent-confirmed 直接建立 trunk v1；缺证据 fail-closed`
9. `冻结：missing ⇒ 既有文档一律冻结；corrupt ⇒ fail-closed；doc-freezes 派生缓存可重建且以 R9 为准`（名称保留）
10. （原）`Batch 3.5 能力实现：VCA submit（submitted）/ refactor（requested）/ stable write request（requested+许可）`
    → `Batch 3.5 能力实现：VCA submitDirect（applied）/ refactor（requested）/ stable write request（requested+许可）`
11. （原）`VCA 基线修复：无已落盘 trunk ⇒ submitVersionChange 自动按 bootstrap 提交（不允许角色自报“伪装”）`
    → `VCA bootstrap：无已落盘 trunk ⇒ 显式 baseTrunk:null + 真实 intent-confirmed 才建立 t1；缺显式 base 一律拒绝`
12. （原）`VCA 自动呈现：提交成功即自动调用客户批准卡（不阻塞回执；无通道保持 submitted）`
    → `VCA 直接提交不复活客户批准卡：presenter 零调用；成功即 applied（无第二张卡）`
13. `SessionManager blocked 提示：无客户卡通道 ⇒ 只记诊断、不提示；报告路由照常`（名称保留）

### 4.3 剩余失败名 / 新增

- 两文件内**剩余失败名 = 0**（原 13 名全部转绿）。
- **零新增失败**：两文件 3× 全绿；不在本批的 `test/编排/trunk-upgrade-validation.test.ts` 5 名 AC-5 KR
  跨列未运行/未修改（按计划只复跑确认，随 B7 重冻结处理）。

## 五、产品候选清单

**无。** 逐项复核结论：

1. **旧客户批准卡通道关闭**不是「受支持语义被移除」：有产品裁决/契约（2026-11-05 direct-role-capabilities、
   api-spec 1227/605、e71501c）与同文件绿色用例 `W2` 钉住；真实提交能力由 `submitDirect` 完整提供。
2. **direct 首建 manifest `source:"upgrade"`（`previous:null`）**：`executeDirect` 按 kind 派生 source（upgrade/amendment），
   属 direct 提交路径现状；不影响能力/安全（首建以 `previous:null` 与真实 intent-confirmed 闭合证据为判据）。
   本批按现状断言，不作为产品候选（如未来要求 source 语义区分 bootstrap，需另立产品裁决）。
3. **direct 不 re-pin 旧 run**：api-spec 明示「不重 pin 旧 run」；测试按现状断言 `repins === undefined`。
4. **G 守卫快照安装责任**：Provider 自装快照 + G 公共刷新安装 C2b 快照是 e71501c 明确的防层间私有 I/O 设计；
   生产桌面栈 `initialize()` 已调用 G 公共刷新。测试只补同一公共路径调用，不是产品缺口。

## 六、边界与披露

1. 只改 `test/测试/version-change-integration.test.ts` 与 `test/桌面应用/version-change.test.ts` + 本记录/证据；
   `git status` 仅这两个 tracked 文件（另有本批 `.tmp-b3b/` 临时目录，未入库）。
2. 未改产品代码/workflow/release.yml/角色卡/边界/其它测试；未 commit/push；未触发 CI；未 tag；未碰 main；
   未读 `.env`；未占用 9222/9223/9224。
3. 本机仅 Windows（与 CI Windows x64 同平台）；macOS 平台结论沿用 R3 证据（13 名双 macOS 同名复发），
   本批未在 macOS 复跑。
4. 旧通道断言（`vca-channel-unavailable`/`vca-conflict`）被保留为**显式断言**，防止客户批准卡被无意复活；
   不是放宽。改名用例均已在上表登记旧名→新名与理由。
5. 验证口径：两文件各自 3 次**自然退出**（无 `--test-force-exit`），未出现挂起/超时。

## 附录：证据索引（`2026-11-16_test-debt-b3b-vca_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `01-before-integration.tap` | 修复前 integration 文件复现（3 pass / 9 fail，含逐名错误体与 `vca-channel-unavailable`/`unknown≠frozen`） |
| `02-before-desktop.tap` | 修复前 desktop 文件复现（42 pass / 4 fail，含 `vca-role-not-allowed` 与 blocked 报告正则失败） |
| `03..05-after-integration-run{1,2,3}.txt` | 修复后 integration 3× 日志（12/12 pass，EXIT=0） |
| `06..08-after-desktop-run{1,2,3}.txt` | 修复后 desktop 3× 日志（46/46 pass，EXIT=0） |
| `09-typecheck.txt` | `npm run typecheck` EXIT=0 |
| `10-modifications.patch` | 两测试文件完整 diff（可复核断言未放宽） |
| `11-diffstat.txt` | diff 统计 |
