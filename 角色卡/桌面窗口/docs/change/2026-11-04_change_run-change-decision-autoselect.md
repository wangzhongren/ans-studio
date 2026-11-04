# 实施记录（修复）：run-change 与版本决策卡不被「替我决策」确定性代选（2026-11-04，客户直修）

- 角色：桌面窗口（desktop window）——按 `角色卡/桌面窗口/boundary.md` Section 1，`app/desktop/` 与 `test/桌面应用/` 属本角色
- 分支：`fix/run-change-decision-autoselect`（worktree `.claude/worktrees/run-change-decision-fix`；基于 origin/main `f394cfb`）
- 定性：**修复**（已确认行为偏离；无新行为/契约/边界/权限变化；单角色 T1）
- 依据（客户问题记录）：`docs/communication/2026-11-04_issue-run-change-decision-autoselect.md`
  （Communication 记录；该文件在派发 worktree 为未跟踪文件，本记录读取自相邻 worktree `download-requests` 的同路径副本）
- 客户原话（两轮）：
  1. 「现在点击会被替我决策给拦住啊」——run-change 三模式卡被代选为「继续冻结」。
  2. 「新建版本，修改版本，这个必须弹出客户确认。不能自动替我待批。」——版本决策卡同样必须客户本人选择。
- 边界（写集）：`app/desktop/customer-input.ts`、`test/桌面应用/decision-service.test.ts`、
  `test/桌面应用/run-change-entry.test.ts`、`test/桌面应用/version-decision.test.ts`、本记录与同目录 evidence；
  未改 `src/common/编排/**`（run-manifest / version-decision / decision-card 校验）、`src/pipeline/**`、
  `src/model/**`、`app/renderer/**`、`app/main.ts`、`app/desktop/session.ts`、`test/测试/**`

## 一、症状与触发条件

1. 客户在应用里开启「替我决策」（`decision` 组开关）。
2. 触发任一应用自有 decision 卡：
   - run-change：点击会话头「契约变更 · 重开 run」，或应用在检测到更新契约后自动弹卡；
   - 版本决策：幕僚（chief）调用 `request_version_decision`（修改版本 / 新建版本开发）。
3. **实际**：卡不呈现、不可作答——「替我决策」的确定性默认推荐直接结算为
   `answered{selected:[推荐项]}`（`operatorId:"judge:<engine>"` + judge 代批审计）。
   run-change 被选为 `continue-frozen`（继续冻结）；版本决策被选为幕僚行动作
   （`version-modify` 或 `new-version-development`）。
4. **预期**：这两类应用自有 decision 卡必须呈现给客户本人选择；客户作答后按既有链路结算
   （run-change：`mapRunChangeAnswer`/`applyRunChange`；版本决策：`mapVersionDecisionAnswer`/
   `planVersionDecisionExecution`）。客户作答时归属 `customer`，不得产生 judge 代批审计。

来源：客户问题记录（上引）＋既有设计口径——run-change 三模式卡是「应用自有、由客户选择模式」
（`app/desktop/interface.ts`「三模式卡……不代选模式」）；版本决策卡执行前必须由客户/judge 二选一，
且 2026-11-04 客户明确要求改为客户本人确认。

## 二、根因（origin/main `f394cfb` 行号）

调用链与逐点结论（已亲自读码核实）：

1. **卡构造**：
   - run-change：`src/common/编排/run-manifest.ts:721-755` `buildRunChangeCard` ——
     `cardKind:"decision"`、`application:true`、`sourceRoleId:"application"`，三选项
     `continue-frozen`（`recommended:true`）/ `stop-and-restart` / `stop`。
   - 版本决策：`src/common/编排/version-decision.ts:181-224` `buildVersionDecisionCard` →
     `versionDecisionCardToRequest` —— 同一形状；选项 `version-modify` / `new-version-development`
     （`src/model/project-state.ts:15`），幕僚行动作带 `recommended:true`。
2. **呈现通道**：
   - run-change：`app/desktop/session.ts:2077-2196` `requestRunChangeDecision` 只把 `card.request`
     交给会话的 `requirementChangeCard` 通道（:2129-2142）；通道在 :2984-3002 绑定会话客户卡上下文
     （`roleId`/`sessionSignal`/`governanceJudge`）。显式入口（`run:change-request` →
     `Interface.requestRunChange`）与提案卡冻结冲突的自动弹卡（`proposalCardFrozenRejection` →
     `this.requestRunChangeDecision`）**共用这一条通道**。
   - 版本决策：`app/desktop/session.ts:4640-4837` `requestVersionDecision` 经
     `withRequestLifecycle` → `deps.customerInput`，上下文来自 `entry.governedCardContext`
     （= `buildCustomerInputContext`，:2836-2859）。
3. **发卡前校验**：`app/desktop/customer-input.ts:336-384` `evaluateDecisionCardRequest` →
   `src/common/编排/decision-card.ts:98-107` `validateDecisionCardRequest`：应用自有 decision 卡
   （`application:true`）合法，返回 `allow` + `flowId` + `recommendedOptionId`；通道据此在
   `customer-input.ts:2124-2131` 写入 `entry.decisionCard`。
4. **确定性代选（缺陷点）**：`app/desktop/customer-input.ts:1580-1640` `tryAutoSelectDecision`——
   `entry.decisionCard` 存在、`governanceModel==="trio"`、`isGroupEnabled("decision")===true`、
   推荐项仍在选项内、结果行可投达 ⇒ 直接 `settleActive(answered{selected:[推荐项]},
   operatorId:"judge:<engine>")`，**不呈现客户卡**。它没有排除这两类应用自有卡 ⇒ 即客户所遇拦截。
5. **无其它拦截点**：`planJudge`（`customer-input.ts:1156-1213`）对 `cardKind==="decision"` 一律
   返回 `undefined`（decision 卡不调模型判断）；`preauthorizeWrite` 只作用于写盘确认请求；
   管道/账本侧（`mapRunChangeAnswer`/`applyRunChange`、`mapVersionDecisionAnswer`/
   `planVersionDecisionExecution`）只消费已结算答案，不提前干预。
   因此**唯一拦截点**是 `tryAutoSelectDecision`；修复它即同时覆盖 run-change 两条入口与版本决策两动作。

## 三、修复方案与判据（拟实施）

在 `app/desktop/customer-input.ts` 的 `tryAutoSelectDecision` 开头新增一条排除：

- 新增模块内判定 `isApplicationDecisionReservedForCustomer(request)`：
  1. `request.kind === "choice"`；
  2. `request.cardKind === "decision"`；
  3. `request.application === true`（应用自有卡；角色工具载荷不能设置该标志）；
  4. 选项覆盖任一**冻结动作词汇**：
     - run-change：`continue-frozen` / `stop-and-restart` / `stop`（`run-manifest.ts` 的
       `RunChangeMode`/`mapRunChangeChoice`）；
     - 版本决策：`version-modify` / `new-version-development`（`model/project-state.ts` 的
       `VERSION_DECISION_ACTIONS`）。
- 命中 ⇒ `return false`（不代选），由既有路径 `presentNow` 原卡呈现客户；客户作答后按既有链路结算。
- **判据说明**：`payload.schema`/`payload.requestId` 只存在于卡结构 `payload`，**不随
  `card.request` 进入客户卡通道**（`session.ts:2142`、`versionDecisionCardToRequest` 只传 request），
  在拦截点不可得；选项 id 是两类卡各自冻结的动作词汇，与界面语言无关，且由真实构造器产物测试钉住。

### 与「application:true 一律不代选」的偏差（需协调者确认）

协调者扩权指令要求判据统一为「`application:true` + `cardKind:"decision"` 一律不代选」，并判断产品代码
中只有 run-change 与版本决策两类应用 decision 卡。**该前提经读码核实不成立**：

- `app/desktop/session.ts:5688-5800` `escalateStuckTask` 是**真实产品路径**，构造第三类
  `application:true` decision 卡（任务连续卡死后升级：选项 `continue`/`redispatch`/`replace`/
  `terminate`，推荐 `terminate`，requestId `task-escalation-…`）。协调者只 grep 了 `src/`，该卡在
  `app/desktop/` 中构造。
- 若按「一律」实现，将同时改变该任务升级卡在「替我决策」开启时的既有行为（现由
  `test/桌面应用/stuck-redispatch.test.ts:346-386` C-04 守护：judge 代选 terminate、不呈现卡），
  并会使 `test/测试/customer-authorization-plane-integration.test.ts:537-568` 的坏账本
  「decision 卡走默认推荐」断言失败——该文件属**测试角色** Section 1，本角色无权修改。
- 客户本轮明确点名的只有 run-change 与版本决策（新建/修改版本）。为避免改变客户未要求的第三类行为、
  避免跨角色改测试，本实现按「应用标志 + 两类卡冻结选项集合」识别；若协调者/客户确认要对**全部**
  应用 decision 卡（含任务升级）取消默认代选，属行为变更：需客户确认后把条件放宽为
  `application === true && cardKind === "decision"`（一行），并由调度把 `test/测试/` 用例更新派给
  测试角色。

不变项：

- 其它 `request_choice` decision 卡（含非 application 角色卡、应用任务升级卡）的确定性默认代选、
  开关关闭回落客户卡、无推荐项/结果行投达失败等 fail-closed 语义**逐字不变**；
- 客户指令消费者（`tryApplyDirectiveDecision`）语义不变（客户显式指令授权，不属本轮缺陷）；
- 不新增任何自动放行；不改两类卡的构造、账本、`customer.decision`、`applyRunChange`、
  `version.decision` 语义。

## 四、范围与非目标

- 只改：`app/desktop/customer-input.ts`、`test/桌面应用/decision-service.test.ts`、
  `test/桌面应用/run-change-entry.test.ts`、`test/桌面应用/version-decision.test.ts`、本记录/证据。
- 非目标：不改 `src/common/编排/**`（run-manifest / version-decision / decision-card 校验，均无需改）、
  不改 `app/desktop/session.ts`、不改 UI 文案/渲染层、不改卡选项或推荐项、不调整「替我决策」开关本身、
  不改任务升级卡行为。

## 五、回归场景（测试计划）

1. `test/桌面应用/decision-service.test.ts`（真实 channel harness，卡由真实构造器生成）：
   - (a) 开关开启 + run-change 卡 ⇒ 原卡呈现、作答前不结算（promise 未 resolve）、无 judge 结果行、
     judge 未被调用；作答 `stop-and-restart` 后 `answered`、`operatorId` 为客户（`tester`）、无 judge 审计。
   - (b) 客户分别选三个模式 ⇒ `answered` 且 `selected` 原样交回；版本决策两动作各一例 ⇒ 呈现、
     不代选、作答前无 judge 代批，客户作答后 `selected` 原样交回。
   - (c) 守护既有行为：非 application（convener 发行）decision 卡在开关开启时仍被确定性代选；
     既有应用「任务升级」卡代选用例保持通过。
   - (d) 开关关闭 + run-change / 版本决策卡 ⇒ 与现状一致（原卡呈现、客户手选、无 judge 审计）。
2. `test/桌面应用/run-change-entry.test.ts`：真实 `createCustomerInputChannel`（开关开启）经
   `desktop.requestRunChange` ⇒ `status:"presented"`、恰一张卡、零 judge 结果行；客户选
   `stop-and-restart` 后 manifest 落 `runChange{decidedBy:"customer", mode:"stop-and-restart"}`。
3. `test/桌面应用/version-decision.test.ts`：真实 channel（开关开启）经 `requestVersionDecision`
   ⇒ 卡呈现、零 judge 结果行；客户选 `version-modify` 后按既有 `planVersionDecisionExecution`
   结算（`version.decision.decidedBy:"customer"`、`request.resolved.by:"customer"`）。
4. 受影响套件 + `npm run typecheck`；真实 Electron 探针视可行性尝试（不可行则说明）。
5. 复核「其它自动通过路径」：planJudge 跳过 decision 卡、写盘预授权不适用 choice 卡、
   `validateDecisionCardRequest` 仅放行不代选；客户指令消费者属客户显式预授权，保持既有语义。

## 六、测试与证据（原始输出）

环境：Windows 11 / Node v24.22.1 / npm 11.19.1；worktree `.claude/worktrees/run-change-decision-fix`；
候选 = 本 worktree 工作区（未 commit）。以下命令全部 exit=0。

| 序号 | 命令 | 结果 | 原始日志 |
| --- | --- | --- | --- |
| 01 | `node --test test/桌面应用/decision-service.test.ts` | **13/13 pass**（8 既有 + 5 新增） | `2026-11-04_change_run-change-decision-autoselect-evidence/01-decision-service.log` |
| 02 | `node --test test/桌面应用/run-change-entry.test.ts` | **5/5 pass**（4 既有 + 1 新增真实通道） | `.../02-run-change-entry.log` |
| 03 | `node --test test/桌面应用/version-decision.test.ts` | **15/15 pass**（13 既有 + 2 新增真实通道） | `.../03-version-decision.log` |
| 04 | 受影响桌面套件（decision-service / run-change-entry / run-change-trigger / run-change / version-decision / directive-decision / stuck-redispatch / application-line / optional-acceptance） | **72/72 pass** | `.../04-affected-desktop-suites.log` |
| 05 | 共享校验与跨角色回归（编排 decision-card / run-manifest、门禁引擎 decision-card、测试角色 customer-authorization-plane-integration） | **22/22 pass** | `.../05-shared-and-cross-role.log` |
| 06 | `npm run typecheck` | **exit=0**（无输出） | `.../06-typecheck.log` |

改动补丁（对照改动前文件，`diff -u --strip-trailing-cr`）：`07-diff-customer-input.patch`、
`08-diff-decision-service.patch`、`09-diff-run-change-entry.patch`、`10-diff-version-decision.patch`。

新增用例（`test/桌面应用/decision-service.test.ts`，卡由真实 `buildRunChangeCard` /
`buildVersionDecisionCard` 构造，防构造器漂移）：

- (a) 开关开启 + run-change 卡 ⇒ 呈现 1 张、作答前不结算（promise 未 resolve）、无 judge 结果行、
  judge 未被调用；客户答 `stop-and-restart` ⇒ `answered`、`operatorId:"tester"`、无 judge 审计。
- (b) run-change 三模式各一例、版本决策两动作各一例 ⇒ 呈现、不代选、客户作答后 `selected` 原样交回。
- (c) convener 发行的普通 decision 卡在开关开启时仍确定性代选（0 卡 + 1 结果行 + `judge:demo`）。
- (d) 开关关闭 + run-change / 版本决策卡 ⇒ 原卡呈现、客户手选、无 judge 审计（与现状一致）。

真实链路用例（真实 `createCustomerInputChannel` + 真实 `SessionManager`，非 mock 通道）：

- `run-change-entry.test.ts`：开关开启 → `desktop.requestRunChange` 返回 `status:"presented"`、
  恰 1 张卡、0 judge 行；客户选 `stop-and-restart` 后 manifest 落
  `runChange{decidedBy:"customer", mode:"stop-and-restart"}`、run 关闭。
- `version-decision.test.ts`：开关开启 → 版本修改 / 新建版本开发卡均呈现、0 judge 行；客户作答后按既有
  `mapVersionDecisionAnswer` / `planVersionDecisionExecution` 执行（`version.decision.decidedBy:"customer"`、
  `operatorId:"tester"`；新建版本开发关闭旧 run、orphan 旧申请、旧产物保留）。

### 真实 Electron 探针：未添加（说明）

- 本次拦截点位于 Electron **主进程**客户卡通道。新增的 session 级用例已使用**真实**
  `createCustomerInputChannel` 与真实 `SessionManager.requestRunChangeDecision` /
  `requestVersionDecision`（未 mock 通道），与 `app/main.ts` 的接线是同一实现；再往上只剩 GUI 呈现与点击。
- 真实 Electron 探针需要可用的图形会话与既定 e2e 验收台（`test/桌面应用/e2e/main.mjs` 为跨角色验收台，
  本任务授权写集只允许修复相关文件，未含该验收台；另建探针文件也超出 Section 1 的逐文件授权）。
  故以「单测 + 真实通道 session 级用例 + 代码审查」为准。如需 GUI 级复核，请验收侧在真实 Electron 运行中
  按「开启替我决策 → 点击『契约变更 · 重开 run』或触发版本决策 → 卡呈现且不自动结算 → 客户选择 → 落账」执行。

## 七、候选哈希

| 文件 | sha256 |
| --- | --- |
| `app/desktop/customer-input.ts` | `1bace32b03cc137600fcd644c0feb2ef06bf142f9dcf45f7b89e3e4c8d5a1e2b` |
| `test/桌面应用/decision-service.test.ts` | `7e2faa4484d6f05cfc49a2ce18238018a6793a30f47c6dfc83964dd9a0b007a2` |
| `test/桌面应用/run-change-entry.test.ts` | `5f614580c825a1340c2d7d0ffaa36e30035d78f05e88ed89bc74e3ca612d86cb` |
| `test/桌面应用/version-decision.test.ts` | `b438a807360301ae605f8999b210144b9714ee49edb1af0cdc305e06b0d97abb` |

## 八、未提交声明

- 本 worktree **未 commit、未 push、未发布**；等待独立验收与客户授权。
- 未改其他角色文件；`test/测试/**` 仅读取运行，未修改。
