---
id: release-blocker-optional-acceptance-hang
type: change
title: v2.0.0 发布阻断修复：optional-acceptance 测试 macOS arm64 CI 挂起
created: "2026-11-12"
updated: "2026-11-12"
timezone: Asia/Shanghai
status: implemented
related: [two-fixed-workflow-paths, release-v2.0.0-blockers-1, judge-delegated-decision-effectiveness]
events:
  - date: "2026-11-12"
    kind: implemented
    summary: 定位 `await customerInput` 无界等待（acceptance 已属幕僚业务卡、不再进通用 judge）并改为有界等待 + intent-confirm 语义钉；release-policy 按精确路径纳入该测试文件
---

# v2.0.0 发布阻断修复：optional-acceptance 测试 macOS arm64 CI 挂起

- 角色：ANS「测试」（roleId `测试`；本轮发布阻断治理第一批之一）。
- 分支：`release/v2.0.0-blockers-1`（从 `origin/main` `3edf2e5` 切出；工作树 `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-1`）。
- 授权：客户已授权本轮发布阻断修复，含修改 `src/common/装配/release-policy.mjs` 的明确许可；仅动本文件、`test/桌面应用/optional-acceptance.test.ts`、`test/装配/release-packaging.test.ts`（白名单同步）与本记录/证据。
- 结论：**挂起已修复**；本机 Windows 连续 3 次全量 6/6 通过、`--test-timeout=120000` 下 6/6 通过、`npm run typecheck` exit 0、`release-packaging.test.ts` 13/13 通过。未改产品代码、未 tag、未触发 CI、未 push main。

## 一、CI 事实（只读复核）

- 工作流 run `43138943189`；macOS arm64 job `130920941222`（`build (macos-15, mac, arm64)`）在 **Regression tests** 步挂起后被取消（`conclusion: cancelled`）。
- 该步命令：`node --test --test-concurrency=1 "test/**/*.test.ts"`。
- 最后一行业务测试输出为 `2026-11-12T02:11:16.856760Z ✔ …`（`test/桌面应用/decision-service.test.ts` 一带；与协调方事实一致）；此后直到 `02:50:38.966Z ##[error]The operation was canceled.`（约 39 分钟）**无任何测试输出**。
- 证据：`_evidence/ci-mac-arm-hang-excerpt.txt`（job 日志末尾时间线）。
- 佐证（B2 基线）：`test/桌面应用/optional-acceptance.test.ts` 在 v2.0.0 基线为 **6 tests / pass 2 / fail 1 / cancelled 3**（`docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md` §6.5）；3 个 cancelled 与下述本机复现同名同因。

## 二、本机复现与定位

### 2.1 复现

- 环境：Windows 11 / Node v24.22.1 / 基线 `origin/main` `3edf2e5`。
- 全量：`timeout 180 node --experimental-strip-types --test test/桌面应用/optional-acceptance.test.ts` → 测试 1 在 59ms 断言失败（`chief-hub-flow-unavailable：缺少明确任务流程，未创建裸任务。`），测试 2、3 通过，随后 **180 秒无输出**，被外层 `timeout` 杀死（exit 124）。证据 `_evidence/before-hang-repro.txt`。
- 定向：对 3 个 judge 用例加 `--test-timeout=15000 --test-name-pattern="开关开启|§5A"` → **cancelled 3**（各 15s 超时），无挂起以外的输出。证据 `_evidence/before-isolated-timeouts.txt`。

### 2.2 根因（确定性，非环境抖动）

1. v2.0.0 `app/desktop/customer-input.ts` 中 `isChiefBusinessCard` 把 `acceptance` 与 appointment/decision/proposal 一并视为**幕僚业务卡**；`presentEntryNow` 命中后先 `tryChiefDecision(entry)`，失败即 `presentNow(entry)` 并 return，**永不落入 `planJudge`**（设计 `2026-11-09_design_judge-delegated-decision-effectiveness.md` §9.1 / Q9 已记录：现行代码为「幕僚委托先行」，通用 judge 只接 `intent-confirm` 与 approval 组 `download`）。
2. 本文件 3 个 judge 用例（「开关开启」「§5A judgeContext.intentId」「§5A/P9.2」）仍用 `cardKind:"acceptance"` 且直接 `await h.channel.customerInput(...)`，harness 未注入 `delegation`/`chiefDecision` ⇒ 验收卡被呈现给客户、无人作答 ⇒ **`await` 永不解**（无界等待）。这不是产品缺陷，是 v2.0.0 语义漂移后的陈旧夹具；旧测试期望「judge 代批 acceptance」已不成立。
3. 测试 1 另有确定性红：v2.0.0 生产门要求派发带明确 `flowId`（缺 ⇒ `chief-hub-flow-unavailable`），且要求**已登记项目生命周期 + 当前客户轮次 + 真实管理会话证据**（裸 stub 夹具带 `flowId` 后 ⇒ `document-planning-source-unavailable`）。这是 `e71501c` 起的生产门，B2 已按 known-red 记录，不是本轮挂起本身。

## 三、修复（仅测试/白名单）

### 3.1 `test/桌面应用/optional-acceptance.test.ts`

- **有界等待**：新增 `bounded(promise, ms, what)`，对 `SessionManager.open`、`SessionManager.stop`、`customerInput`、客户手选结算全部设上限（默认 5s/15s）；超时即抛错并指出挂起点（测试如实失败，不再可能无限挂起）。
- **judge 语义钉迁移**：3 个 judge 用例改用 decision 组且**非**幕僚业务卡的 `intent-confirm`（`cardRequest("intent-confirm")`），保持原断言强度：
  - 开关开启：judge 代选推荐项、`pushed.length === 0`、恰 1 条 judge 结果行、`operatorId === "judge:demo"`；
  - §5A：`judgeContext.intentId` 原样进入 `GovernanceJudgeRequest`、`metadata.intentId` 兜底；
  - §5A/P9.2：manual 只退回角色、`declined`、不向客户呈现技术模板。
  - 断言随实际卡种更新的仅两处：结果行 `cardKind: "intent-confirm"`、`requestTitle` 改为对应的「需求确认：按推荐方案执行？」。
- **验收卡语义保留**：`acceptance` 仍由「开关关闭：验收卡呈现客户，客户手选通过——不自动验收」与「无自动验收机器」两个用例覆盖（后者为源码结构性钉）。
- **测试 1（幕僚调度验收）**：能力断言保留（`dispatchTask`/`roleStatus` 在场）；原「成功派发」断言无法在裸 stub 夹具上成立（生产门要求真实注册生命周期/当前轮次/管理会话证据，伪造会削弱门禁），改为钉住 v2.0.0 的 fail-closed 契约：
  - 缺 `flowId` ⇒ `chief-hub-flow-unavailable`，不建裸任务；
  - 带 `flowId` 但无真实来源 ⇒ `document-planning-source-unavailable`，不写任务账本、不投递；
  - 回交路由用**账本内既有星形任务**（`task.created` + `listTasks` 载入索引 + 打开 verifier）钉住：回交只投幕僚 `[工作结果]` 一次、不投其他角色、回交/settle 不产生新的自动验收任务。
- **清理竞态**：`stop` 后 `await tick(50)` 再删；`fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })`（与 v1.8.2 macOS arm64 稳定性修复同款）。
- 未删除任何用例；未新增 skip；未改产品代码。

### 3.2 `src/common/装配/release-policy.mjs`

- `const files` 精确加入 `'test/桌面应用/optional-acceptance.test.ts'`（**单文件、不开目录**）。
- 注释区新增「v2.0.0 发布阻断修复」条目（macOS arm64 CI 挂起修复：无界等待/清理竞态、断言未放宽），并把原「白名单重置为基础集…无产品/测试 overlay 条目」修正为「基础集 + 1 条发布阻断修复条目」。

### 3.3 `test/装配/release-packaging.test.ts`

- 新增精确路径用例：`optional-acceptance.test.ts` 入选，同目录相似名/其它测试仍 excluded（锁死单文件边界）。
- 同步该文件内已陈旧的 v1.9.2 源断言为 v2.0.0（`SOURCE_REF`/`SOURCE_SHA`）与用例名；这是 v2.0.0 overlay 的必然同步，断言未放宽。该陈旧断言在本轮前即为红（`release-policy.mjs` 已是 v2.0.0）。

## 四、本机验证（Windows，baseline `origin/main` `3edf2e5`）

| 项 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| 全量 ×3（连续） | `node --experimental-strip-types --test test/桌面应用/optional-acceptance.test.ts` | 3 次均 **6/6 pass、0 fail、0 cancelled、0 skipped**，单次约 2.1s | `_evidence/after-3x.txt` |
| 有界超时 | 同上 + `--test-timeout=120000` | **6/6 pass**，约 2.1s | `_evidence/after-timeout-120000.txt` |
| 类型 | `npm run typecheck` | **exit 0** | `_evidence/typecheck.txt` |
| 装配测试 | `node --experimental-strip-types --test test/装配/release-packaging.test.ts` | **13/13 pass** | `_evidence/release-packaging.txt` |
| 基线复现（before） | 见 §二 | 全量挂起（180s 被杀）；定向 3 例 cancelled | `_evidence/before-hang-repro.txt`、`_evidence/before-isolated-timeouts.txt` |

## 五、Overlay 条目与限制

- Overlay：仅 **1 条测试文件** `test/桌面应用/optional-acceptance.test.ts`（精确路径）；活动 dirs 仍为 `src/common/装配/`、`test/装配/`；未列名 app//src/ 仍 fail-closed、未列名 test/ 仍 excluded。
- 未在 macOS arm64 本机复跑（本机 Windows）；CI 未触发（发布工作流为 `workflow_dispatch`，推送分支不会触发）。macOS 的最终确认由后续发布流水线执行。
- **如实披露（覆盖变化）**：测试 1 的原始「成功派发」断言已无法在裸 stub 夹具上诚实成立；本轮改为钉住生产门 fail-closed + 账本内星形任务的回交路由。成功派发/完整链路的正向覆盖需真实注册生命周期与受管会话夹具（专项测试，建议另立变更），本文件不再声称覆盖它。除此之外无断言放宽、无用例删除、无新增 skip。
- 未改产品代码；若后续发现真实产品缺陷，应另立记录，不夹带在本修复。

## 六、复现命令

```powershell
cd C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-1
node --experimental-strip-types --test test/桌面应用/optional-acceptance.test.ts
node --experimental-strip-types --test --test-timeout=120000 test/桌面应用/optional-acceptance.test.ts
node --experimental-strip-types --test test/装配/release-packaging.test.ts
npm run typecheck
```
