---
id: acceptance-redispatch-on-flow-update
type: change
title: 验收复核按 flow 版本重派（flow 更新后可再派 verifier）＋ verifier settle 回 Lead 可见性
created: "2026-10-20"
status: implemented
---

# 验收复核按 flow 版本重派（真机：结果没回 Lead）

## 真机根因

- `dispatchAcceptanceForFlow` 的去重是 `acceptanceDispatchedFlows`（运行期每 flow 一次）＋
  `acceptanceDispatchRecorded`（账本只要**有过** verifier dispatch 就永久 true）。
- 真机 04:06:53 派过 verifier；之后 Lead/Steward 又加 D7 修复与 `delivery-frontend-v4` /
  `verification-evidence-v4`，flow YAML 在 12:11:58 更新。应用仍按旧去重不再派 verifier；verifier 会话
  空闲、旧报告停在盘上，最终验收结果没有回到 Lead。

## 改动

### 1. `app/desktop/interface.ts`：运行期去重带 flow 版本（mtime）

- `acceptanceDispatchedFlows` 从 `Set<string>` 改为 `Map<flowKey, flowMtimeMs>`（`-1`＝无 YAML/不可读，
  维持 legacy「每进程一次」）。
- `dispatchAcceptanceForFlow` 每次先 `stat` `docs/flows/<flowId>.yaml`：
  - 记录 mtime == 当前 mtime ⇒ 同版本已派，跳过；
  - 记录 mtime ≠ 当前 mtime ⇒ 旧占位作废（`delete`），`flowUpdatedSinceReview = true`，允许重派；
  - 无 YAML/stat 失败 ⇒ 旧语义（每进程一次）。
- 持久化去重改为**时间比较**：`acceptanceLastDispatchAtMs(flowId, ledger)` 取该 flow 最近一次 verifier
  dispatch 的 `at`（ms）。**最后一次派发 >= flow mtime** ⇒ 已派（重启后同样成立）；flow 比派发新 ⇒ stale，
  允许再派一次。无 `at`/不可解析的**旧记录** ⇒ 走旧布尔口径（有记录即不派，不猜）。flow YAML 不存在/
  不可读 ⇒ 保持旧行为（有记录即不派），其余原因路径不变。
- 重派任务文本沿用 `buildAcceptanceTaskMessage(flowId, evidence, { flowUpdatedSinceReview })`，开头注明
  「流程在上次验收复核后有更新，请复核最新版本。」；仍只派 verifier，不弹客户卡、不自动验收。
- 成功后再 append 一条 `dispatch.accepted{targetRoleId:"verifier", stepId:"verification", trigger:"settle"}`
  （`at` 晚于 flow mtime），后续同版本：运行期 mtime 相等 + 账本时间 >= mtime ⇒ 去重成立。

### 2. `app/desktop/governance-advance.ts`

- 新增 `acceptanceLastDispatchAtMs(flowId, ledger)`：返回最近一次 verifier dispatch 的 `at`（ms；忽略
  不可解析/其它 flow/其它步骤），无 ⇒ undefined。
- `acceptanceDispatchRecorded` 保留原布尔口径（旧记录兜底，供无 `at` 的旧账本）。
- `buildAcceptanceTaskMessage` 新增可选第三参 `{ flowUpdatedSinceReview?: boolean }`（缺省文案逐字不变）。
- `FlowCompletionLedgerEntryLike` 增 `at?: string`（时间比较用）。

### 3. `app/desktop/interface.ts`：verifier settle ⇒ Lead 可见性

- verifier（`governanceFunction === "verification"`）settle 时，若该 flow 有最近一次验收派发（账本
  verifier dispatch），向 Lead（主入口）落一条 delivery-note 系统行：
  「Proof / 验收复核已结束（flowId=…）；报告见 `docs/verification/<flowId>-v1.md` 与
  `docs/governance/verifier/<flowId>.md`；验收卡/客户决定由应用继续（本行不构成验收结论或客户批准）。」
- **同 flow + 报告版本（报告文件 mtime）只提示一次**；报告未落盘也提示一次（版本记 missing）；投递失败
  不记去重（下次 settle 可再试）。**不伪造结论、不把报告当客户批准**。

## 测试与证据（真实输出）

- `test/桌面应用/acceptance-dispatch.test.ts` 新增/更新 4 例：
  - 单元：旧布尔口径保留；`acceptanceLastDispatchAtMs` 取该 flow 最近一条 verifier dispatch（忽略其它
    步骤/其它 flow、无 `at` ⇒ undefined）。
  - 派 verifier 一次 → flow 不更新 ⇒ verifier settle 触发检查仍不重派；
  - flow YAML 在派发后更新（mtime 变化）⇒ 重派恰一次、任务开头含「流程在上次验收复核后有更新」、新
    `dispatch.accepted.at >= flow mtime`、随后同版本 settle 不再重派；
  - 重启（新 Interface）＋旧 verifier 记录＋flow 已更新 ⇒ 重派一次；flow 未更新 ⇒ 不重派；
  - verifier settle ⇒ Lead 恰一条含两条报告路径的系统行（不伪造结论）；同报告版本再 settle 不刷屏；
    报告版本更新可再提示；flow 未更新 ⇒ 不重派 verifier。
- `node --test "test/桌面应用/acceptance-dispatch.test.ts"` ⇒ **22/22 过**。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **665 计 / 665 过 / 0 红**。
- `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` ⇒ **44/44 过**（一次并发运行命中已知的
  `b-proposal-accept-timing` 尾部时序断言抖动，串行与随后并发重跑均全绿——非本改动路径）。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险

- 版本判定依赖 flow YAML **文件 mtime**：内容被回写但 mtime 被刻意保持（如 `utimes` 还原）时不会触发重派。
- 派发 `at`（应用时钟）与 flow mtime（文件系统时钟）同机比较；跨时区不影响 ms 绝对值，但系统时钟回拨
  会推迟重派。
- 旧账本记录无 `at` 时保持永久去重（不猜、不重派）——如需迁移，需人工补 `at` 或换新 flow/step。
- verifier settle 系统行与既有 `[系统·治理反馈]` 镜像可能同轮出现（两条不同用途：一条是本层状态行，
  一条是内部反馈汇总任务）；已按 flow+报告版本去重。
- 报告版本按文件 mtime 判定；verifier 未写报告时只提示一次（missing 版本）。
