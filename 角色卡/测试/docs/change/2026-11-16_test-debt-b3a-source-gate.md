# B3a（测试债治理）：source 门测试装配族 — 夹具修正与阻塞报告

- 日期：2026-11-16
- 角色：测试
- 工作树：`.claude/worktrees/fix-test-debt-b3a`（分支 `fix/test-debt-b3a`，起点 `8d6a35e` = `origin/main`）
- 范围：source-gate 族 23 名（CI R3 `11-families.json`），仅写本记录 + 同名 `_evidence/` 与下列测试文件：
  - `test/桌面应用/run-pin.test.ts`
  - `test/桌面应用/run-change-trigger.test.ts`
  - （未改）`test/测试/governance-e2e-auto/i-full-chain.test.ts`、`test/claude-adapter/schema.test.ts`
- 约束遵守：未改产品/workflow/release.yml/角色卡/边界/其他测试；未 commit/push；未触发 CI；未 tag；未碰 main；
  未读 `.env`；未占 9222/9223/9224。

## 0. 摘要

1. **本机逐文件复现与 CI 名单一致**：run-pin 11、run-change-trigger 9、i-full-chain 2 均确定性复发
   （1× 复现 + 3× 验证，见 `01-reproduction-3x.txt`）；`schema.test.ts` 本机 **3× 10/10 全绿**。
2. **族名单修正**：族 JSON 把裸名 `selected` 启发式挂到 `test/claude-adapter/schema.test.ts` 是伪影；
   CI 块级日志与 `logFiles` 均指向 `test/桌面应用/chief-workflow.test.ts`（e71501c 漂移族）。
   **实际 source-gate 可修面为 3 文件 22 名**。证据：`03-schema-attribution.txt`、`02-family-vs-local.tsv`。
3. **按裁定补真实前置事实后，8 名 3× 转绿**（断言逐字不变）：
   - run-change-trigger 7 名：三模式显式入口 ×3、显式入口无会话兜底、宁可不弹、提案卡、AC-17。
   - run-pin 1 名：F2 版本化文档基线违规受理 + advisory。
4. **其余 15 名（14 名本机红 + 1 名伪影）在「断言逐字不变、不改产品」下不可修**：第一层 source 门
   背后是 e71501c/v2.0.0 有意替换的旧 legacy 语义（handoff 提前 pin 删除、hub 必须带 flowId、
   worker 执行改由 trunk execution preflight 冻结）。原型 P2/P3 证明确实前置事实齐备后仍被当前
   门禁硬拒或行为不同（见 `04-root-cause-evidence.md`、`05-prototype-outputs.txt`）。
   **未发现产品缺陷**：不改产品，按要求停手报告并建议重归类（记录 §6）。
5. `npm run typecheck` **EXIT=0**（`07-typecheck.log`）。

## 1. 复现与 3× 结果

命令：`node --test --test-timeout=120000 <file>`（Node v24.22.1，Windows x64）。每文件连续 3 次，
进程均自然退出（无 120s 超时、无挂起）。

| 文件 | 3× 结果（tests/pass/fail） | wall（run1–3） | exit |
| --- | --- | --- | --- |
| `test/桌面应用/run-pin.test.ts` | 20/10/10 ×3（确定性） | 3.76s / 3.75s / 3.72s | 1（剩余红） |
| `test/桌面应用/run-change-trigger.test.ts` | 10/8/2 ×3（确定性） | 1.92s / 1.93s / 1.95s | 1（剩余红） |
| `test/测试/governance-e2e-auto/i-full-chain.test.ts` | 2/0/2 ×3（未改，确定性） | 2.13s / 2.12s / 2.12s | 1（未改） |
| `test/claude-adapter/schema.test.ts` | 10/10/0 ×3（未改） | 0.23s / 0.23s / 0.22s | 0 |

逐名失败清单与错误码：`01-reproduction-3x.txt`（run1 日志）与 `02-family-vs-local.tsv`。
改动前后对比：run-pin 9 pass/11 fail → **10 pass/10 fail**（仅 F2 转绿，零新增失败）；
run-change 1 pass/9 fail → **8 pass/2 fail**（7 名 target 转绿，零新增失败）。

## 2. 转绿名单（8 名，3× 全绿；断言未改）

run-change-trigger：

1. `宁可不弹（B1）：目标不存在 ⇒ 硬 target-card-missing，不呈现 run-change`
2. `显式入口（continue-frozen）：requestRunChangeDecision 三模式落账不变`
3. `显式入口（stop-and-restart）：requestRunChangeDecision 三模式落账不变`
4. `显式入口（stop）：requestRunChangeDecision 三模式落账不变`
5. `显式入口无会话兜底：没有可呈现的客户卡会话 ⇒ 如实失败（不弹卡）`
6. `提案卡：冻结 run 上出现更高版本 proposal ⇒ 先尝试 run-change 卡，提案卡 notPresented 拒发`
7. `AC-17：VCA submitted/approved 在途 ⇒ 抑制自动 run-change（系统行）；结束后恢复；显式入口保留`

run-pin：

8. `F2：版本化文档基线违规受理 + advisory；基线/文档未被改写`

（run-change 的 `J12：judge 代批 intent-confirm …` 为文件内既有绿，保持绿，不计入族。）

## 3. 每文件根因与改法

### 3.1 `test/桌面应用/run-change-trigger.test.ts`（9 名：7 绿 / 2 红）

- **根因**：`setupPinnedRun` 以 `chief→convener` handoff 触发 pin（旧行为）。e71501c 起 handoff **不再
  提前 pin**（`git show e71501c -- app/desktop/session.ts`；桌面窗口变更记录 2026-11-05 第 47 行明确
  「删除handoff提前pin」）。因此 9 名全在夹具阶段被 source 门拒绝。
- **改法（纯夹具）**：`setupPinnedRun` 改用产品真实 `ensureDraftRun` + `pinRun` + 真实 D3 事实建立
  pinned run（真实 manifest/hash/D3），仍按真实会话入口打开 convener 供客户卡通道使用；删除
  “handoff 必然 pin”的过时 helper 断言。**测试体断言逐字未改**。
- **剩余 2 名**：`派发不再自动弹 run-change…`、`stop-and-restart 后…` 在 pinned run 上做
  convener→项目角色派发；补当前运营真实受派任务后仍会落入 trunk execution freeze 硬拒
  （原型 P2/P3），旧「受理 + advisory」断言与当前 execution preflight 冲突。

### 3.2 `test/桌面应用/run-pin.test.ts`（11 名：1 绿 / 10 红）

- **根因（第一层）**：v2.0.0 source 门要求文档/团队准备派发来自「已登记项目生命周期 + 当前 accepted
  客户轮次 + 真实管理会话证据」；worker 派发要求「当前运营真实受派任务」。
- **改法（F2 专用夹具）**：新增 `sourceGatedHarness`：
  - `getRegisteredProjectLifecycle` 提供本项目真实注册事实（selectionId/listingGeneration）；
  - chief 会话走产品真实 `openRoleSession`（`createRuntimeAdapterFactory` + demo script），经
    `mgr.send` 开真实客户回合（core 发布 `prompt-input` + turn ack），在该回合内由脚本调用
    `dispatch_task`——与生产模型工具调用同路径（真实 managed 证据、真实 turn 绑定）；
  - 其他角色保持最小 fake 句柄（ACK + prompt-input + dispose 感知轮询），不伪造 managed 证据。
  - F2 的 `harness(root)` 改为 `sourceGatedHarness(root)`，派发改为
    `dispatchViaAcceptedTurn(...)`；**receipt 后续断言逐字未改**。其余 10 名未改。
- **剩余 10 名**：
  - 3 名 handoff/pin 组（M1/M2/M3+handoff pin、D3 卡种、缺 D3 pin 失败受理）：handoff 不再 pin；
    hub 派发走 trunk planning run（`run-hub-*`），旧 run-manifest 断言不成立。
  - 2 名无 flowId hub（P1.1、R2 handoff 无 flowId）：`chief-hub-flow-unavailable` 为现行门
    （chief-workflow W36 同款门被钉为预期），断言与门禁冲突。
  - 1 名 run 账本不可用 handoff：真实事实后任务会锚定 planning run（flowId/runId 出现），与
    「无锚点」断言相反。
  - 4 名 worker 组（AC-2.8 ×2、AC-2.6、P1-R-08-R1）：补真实受派任务后 freeze 硬拒
    （legacy pinned/draft run 无 trunk 历史证据，`Old run lacks its historical evidence` / `effective-manifest-missing`）。

### 3.3 `test/测试/governance-e2e-auto/i-full-chain.test.ts`（2 名：0 绿 / 2 红，未改）

- 空 trio 项目聊天自 B6.1/B7.1 起默认 fixed ⇒ `stage-request-required`。改为 fixed 合法
  stage-request 会改变场景/目标/回执/advisory 全部断言；改为显式 legacy + 补 flowId/事实后，仍在
  convener 派 worker（handoff-missing advisory 受理）上落入同一 freeze 硬拒。需按当前语义重写
  期望（B4 类），不是夹具级修复。

### 3.4 `test/claude-adapter/schema.test.ts`（0 名，未改）

- 本机 3× 10/10 全绿；族内 `selected` 为 chief-workflow 日志块的启发式误挂。简报提到的「该文件另有
  1 个 B0-other 既有红」同源：b0-existing-other 族把裸名 `required` 挂到该文件，但 CI 块级日志
  （`10-block-codes.json`）同样归属 `test/桌面应用/chief-workflow.test.ts`。见
  `03-schema-attribution.txt`。

## 4. 断言未变证明

- 完整 patch：`06-test-diff.patch`（仅 2 文件，+117/−14）。
- 断言文本零改动：`git diff -U0 -- test/ | grep "^[+-].*assert\."` 只显示 **fixture helper 内部**
  的新旧辅助断言（旧 helper 的 handoff-pin 断言被替换为真实 `pinRun` 断言；新 harness 的
  send/receipt 辅助断言）。所有 `test(...)` 体内的业务断言（ok/message/records/manifest/hash 等）
  逐字未变。
- F2 唯一测试体改动是把「直接调用 caps.chief」改为「经 accepted 回合派发」的夹具调用行；
  其后的断言块逐字未变（见 patch hunk）。

## 5. 剩余名清单（15 名 = 14 红 + 1 伪影）

详见 `08-remaining-names.txt`（逐名 + 本机码）与 `02-family-vs-local.tsv`。按当前语义分类：

| 类别 | 数量 | 名（文件） | 建议 |
| --- | ---: | --- | --- |
| A handoff-pin 删除 | 3 | run-pin：M1/M2/M3+handoff pin；D3 卡种；缺 D3 pin 失败受理 | B4 类：按「handoff 不提前 pin；hub 走 planning run」更新期望 |
| B hub flowId 门 | 2 | run-pin：P1.1；R2 handoff 无 flowId | 断言与现行门冲突；需 owner 确认旧语义是否保留（若保留=产品候选） |
| C trunk execution freeze | 6 | run-pin：AC-2.8 ×2、AC-2.6、P1-R-08-R1；run-change：派发不再自动弹、stop-and-restart 后 | B4 类：按 execution preflight 更新期望（补真实受派任务只会更硬拒绝） |
| D fixed/legacy 场景漂移 | 3 | run-pin：R2 run 账本不可用 handoff；i-full-chain ×2 | 按当前 fixed/legacy 定位重写场景与期望 |
| E 族归属伪影 | 1 | schema `selected`（实为 chief-workflow 块） | 从 B3a 名单移除；归 e71501c 漂移族 |

未发现需要改产品的缺陷；以上均需协调者/owner 决定「当前语义下更新断言」的授权（B3a 裁定明确
要求断言逐字不变，故本批停手）。

## 6. 边界与未做事项

- 未改 `i-full-chain.test.ts` 与 `schema.test.ts`（前者需重写期望；后者已全绿）。
- 未给 2 个 run-change 派发用例补「真实受派任务」：原型 P3 证明补后 freeze 会硬拒，仍无法满足
  原断言，且会改变失败码；留给 B4/owner 一次性按当前语义处理。
- 未触发 CI、未 commit/push、未 tag、未碰 main、未读 `.env`、未占 9222/9223/9224。
- 证据索引见 `_evidence/`：
  `01-reproduction-3x.txt`、`02-family-vs-local.tsv`、`03-schema-attribution.txt`、
  `04-root-cause-evidence.md`、`05-prototype-outputs.txt`、`06-test-diff.patch`、
  `07-typecheck.log`、`08-remaining-names.txt`、`make-family-crosscheck.mjs`、
  `run-{pin,change-trigger,i-full-chain,schema}-run{1,2,3}.log`。
