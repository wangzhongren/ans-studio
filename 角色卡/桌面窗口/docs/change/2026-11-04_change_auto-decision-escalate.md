# 变更记录：自动决策「无法核对」升级客户 + 自动拒绝去重（2026-11-04，客户直修）

- 角色：桌面窗口（desktop window）
- 分支：`fix/auto-decision-escalate`（worktree `.claude/worktrees/auto-decision-escalate-fix`；基于 origin/main `61bb0b2`）
- 依据：`docs/communication/2026-11-04_issue-auto-decision-proposal-sidecar.md`
  （问题记录 P1：自动判断无法核对提案导致连续拒绝 4 次）
- 边界：只改 `app/desktop/customer-input.ts`、`test/桌面应用/decision-service.test.ts` 与本变更记录/证据；
  未触碰 `src/common/编排/**`、`src/common/shared/i18n/**`、`app/renderer/**`、`src/model/**`。

## 一、客户直修依据

问题记录「客户处置与修复范围（2026-11-04）」：客户原话「这个也要修复」，本轮直接修第 1、3 条：

1. 自动判断遇到「无法核对」类条件（如 `criteria-ref-mismatch`、规范物证缺失、提案缺 sidecar）时
   **不自动拒绝**，把卡**原样转给客户确认**并在卡上说明无法核对的原因；**judge 绝不自动放行无物证的卡**
   （fail-safe 方向不变）。
2. **拒绝去重**：同一卡指纹的自动拒绝不重复发生（一次后即转客户，不再重复轰炸）。
3. 既有**可核对卡**的自动判定行为不变；客户卡呈现/决策链路不变（只是不再被自动拒绝）。

说明：该依据文档在仓库中为**未跟踪文件**；本 worktree 未见，读取自相邻 worktree
`customer-authorization-plane` 的同路径副本（内容与客户问题记录一致）。

## 二、根因（origin/main 基线行号）

- `src/common/编排/governance-judge-facts.ts:173-225`（`requiredArtifactPaths`）：proposal 卡要求
  `artifacts.proposalPath`；该值由 app 从 pinned run manifest 解析，manifest 未登记 ⇒ `missing:true`。
- `src/common/编排/governance-judge-verdict.ts:613-617`：required artifacts 缺失 ⇒
  `manualOutcome("artifact-missing")`，不调模型。
- `src/common/编排/governance-judge-evidence.ts:1072-1078`：证据包记 `artifact-missing`。
- `src/common/编排/governance-judge.ts:324-339`：证据包失败 ⇒ 直接返回 `manual`（fail-closed，不调模型）。
- `app/desktop/customer-input.ts`（origin/main）`settleJudgeOutcome` 1362-1396：`manual` 除 `switch-off`
  外一律 `settleEntry(declined)` 自动退回 ⇒ 同一张卡被反复拒绝。

## 三、改动清单（`app/desktop/customer-input.ts`，行号为改后工作区）

1. **导入**：`node:crypto` 的 `createHash`（L34）；`isUnverifiableRejectionCode`（L96-98，
   单一来源 = 编排 `src/common/编排/mechanical-rejection.ts`，只读消费、不复制码表）。
2. **模块级卡指纹 `cardFingerprint`**（L667-689）：kind/title/question/multiple/preview/
   options（id/label/description/recommended）/flowId/cardKind/sourceRoleId/application 组成 sha256；
   每项字符串 16KiB 截断；只用于去重，不写盘、不进账本、不参与呈现。
3. **工厂内去重状态**（L783-795）：`autoRejectedCards: Set<string>`；
   键 = `` `${entry.projectKey}\u0000${cardFingerprint(entry.request)}` ``；
   `markAutoRejected(entry)` 返回 false = 该指纹此前已自动拒绝过 ⇒ 本次必须升级客户。
4. **`judgeEscalationNotice`**（L1263-1279）：复用既有 `main.customerInput.judgeNotDelegated` 模板
   （「自动代理未代批（{label}）：{reason}；已转你手动确认。」）；reason 用
   `judgeReworkHumanReason(outcome)`，驱动给出的具体原因以括注保留
   （如「规范物证缺失（规范物证缺失：docs/proposals/…（判断无法核对）…）」）。
5. **`escalateJudgeOutcomeToCustomer`**（L1281-1303）：删 `judging`、写 `payload.judgeNotice`、
   记 `governance-judge.escalated`（decision = `present-to-customer-unverifiable` /
   `present-to-customer-duplicate`，outcome = `manual`，eventKind = trigger）、`presentNow(entry)`；
   不写客户决定、不发结果行、不触发验收返工路由（没有发生拒绝）。
6. **三处插入点**：
   - **deny 分支**（L1332-1338）：状态守卫之后、算 `reason` 之前，同指纹重复 ⇒ 升级；
     **不做**无法核对升级（approval 写卡的既有退回重做语义保持不变）。
   - **manual 收尾**（L1478-1487）：`aborted`/`switch-off` 分支之后——`isUnverifiableRejectionCode`
     ⇒ 升级；同指纹重复 ⇒ 升级；其后既有 `reworkReason` / `diagnostic.record("governance-judge.manual-as-rework")`
     / `settleEntry(declined)` / `notifyAutoRework` 逐字不变。
   - **`presentEntryNow` 的 ledger-unavailable 预检**（L1804-1810）：同指纹重复 ⇒ 用既有
     `manualOutcome("ledger-unavailable")` 生成说明并原卡呈现客户；首次仍按既有 decline。
7. **注释同步**：`judgeManualNotice` 文档（L1252-1256）、`settleJudgeOutcome` 文档（L1305-1317）、
   manual 分支注释（L1457-1463）、ledger 预检注释（L1799-1801）。

## 四、行为变化

- **无法核对类 manual**（`artifact-missing`/`artifact-not-read`/全部 `criteria-*`/
  `evidence-mismatch`/`evidence-path-invalid`/`context-missing`/`evidence-packet-*`/
  `evidence-conflict`/`evidence-hash-mismatch`）：原卡 + `judgeNotice` 呈现客户；
  无结果行、无客户决定账本、无验收返工路由；judge 仍不 approve（fail-closed 方向不变）。
- **同卡指纹第二次自动拒绝**：改为原卡呈现客户，不再重复退回；第一次保持旧行为。
- **可核对卡**：approve/deny/manual 的既有判定路径与文案零变化。
- **无新增自动放行**：升级只是把决定权交回客户，judge 的物证/核对门槛原样。

## 五、测试与证据

必跑命令与原始结果（完整日志在 `2026-11-04_change_auto-decision-escalate-evidence/`）：

1. `node --test test/桌面应用/decision-service.test.ts`：**8/8 pass**（4 既有 + 4 新增，exit=0）
   → `01-decision-service.log`
2. 受影响套件批量（decision-service / acceptance-return-card / application-line / diagnostics /
   directive-decision / directive-input / multi-runtime / optional-acceptance / stuck-redispatch /
   write-safety）：**111/111 pass**（exit=0）→ `02-affected-suites.log`
3. `npm run typecheck`：exit=0 → `03-typecheck.log`
4. `npm run typecheck:renderer`：exit=0 → `04-typecheck-renderer.log`
5. `npm run build:renderer`：exit=0（仅既有 chunk>500kB / INEFFECTIVE_DYNAMIC_IMPORT 警告）
   → `05-build-renderer.log`

新增用例（`test/桌面应用/decision-service.test.ts`）：

- ① 无法核对（`artifact-missing`）⇒ 原卡呈现客户、无结果行、promise 未结算；`judgeNotice` 含
  「规范物证缺失」「（判断无法核对）」「已转你手动确认」；judge 只调用一次；客户手批 accept 后
  `answered` / `operatorId=tester`（不是 judge）。
- ② 可核对卡 `approve` ⇒ `answered`、无客户卡、1 条结果行（group=decision / cardKind=proposal）、
  `operatorId=judge:demo`、`judge.group=decision`。
- ③ 同指纹第二次 `manual(timeout)` ⇒ 首次 `declined`/`judge:demo`/无卡；第二次原卡 + `judgeNotice`
  且未结算；客户手选 reject ⇒ `answered`。
- ④ 诊断审计：恰一条 `governance-judge.escalated`
  （decision=`present-to-customer-unverifiable`、reasonCode=`artifact-missing`、outcome=`manual`），
  且零条 `governance-judge.manual-as-rework`。

Diff 基线对照（`diff -u --strip-trailing-cr` 对 origin/main）：`06-diff-customer-input.patch`、
`07-diff-decision-service-test.patch`。
行数：`customer-input.ts` **+121 / −6**；`decision-service.test.ts` **+192 / −13**。

## 六、i18n 披露

- **未新增 i18n key**。升级说明复用既有 `main.customerInput.judgeNotDelegated`
  （「自动代理未代批（{label}）：{reason}；已转你手动确认。」）。
- 共享文案目录 `src/common/shared/i18n/**` 属项目管理角色边界，本轮不动；如客户坚持逐字
  「自动判断无法核对」措辞，需项目管理另立补键任务。

## 七、去重范围披露

- `autoRejectedCards` 为**进程内、通道实例级**（应用每次启动重新开始）：重启后同指纹允许再自动拒绝一次。
- 不写盘、不进账本；键含项目（`projectRoot`）与卡内容指纹，不含请求 id/时间。

## 八、风险与披露

- 分类器白名单（`UNVERIFIABLE_REJECTION_CODES`）由编排角色维护；未来新增核对类 code 需同步加入，
  否则按旧行为自动退回（本轮不越界修改）。
- 未知 reasonCode 维持旧行为（自动退回一次，第二次起按同指纹去重升级）。
- deny 分支只做去重、不做「无法核对」升级：approval 写卡的既有退回重做语义不变
  （客户本轮要求只针对无法核对类 manual）。
- `governance-judge.escalated` 只使用共享诊断白名单字段（requestId/reasonCode/decision/outcome/eventKind），
  未新增字段名。
- 去重命中时不再记 `governance-judge.manual-as-rework` 诊断；升级事件与旧退回事件互斥。

## 九、未提交声明

- 本 worktree **未 commit、未 push**；未改动其他角色文件。
- 仅改：`app/desktop/customer-input.ts`、`test/桌面应用/decision-service.test.ts`、本记录与 evidence 目录。
- `npm run build:renderer` 生成 `app/renderer/dist/`（`.gitignore` 已忽略，不属源码改动）。

## 十、候选哈希

| 文件 | sha256sum | git hash-object --stdin |
| --- | --- | --- |
| `app/desktop/customer-input.ts` | `cefc53a8f61952e19a887490601b19abe6fd7a0e80597276895c6ce18221aae0` | `3fb55afa936d7298736f0e378d99948602850d5b` |
| `test/桌面应用/decision-service.test.ts` | `8a92e6be5cc54dd7b08c27a74b413fed7142576f3e3597f94a18d1dee06539f4` | `39a57fb0e73fcd03fe1d7230eb19e5df09b35d60` |

（本变更记录的自身哈希在交付回报中给出——写入后再计算，无法自嵌。）
