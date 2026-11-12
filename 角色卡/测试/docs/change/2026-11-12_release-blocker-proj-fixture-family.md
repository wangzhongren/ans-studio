# v2.0.0 发布阻断（第七批）：/proj 夹具族批量修复 + request-timeout-wiring 挂起清除（2026-11-12）

- 角色：ANS「测试」（roleId: 测试）。
- 任务：v2.0.0 发布阻断第七批 B7-1 + B7-2——`/proj` 夹具族批量修复；`request-timeout-wiring.test.ts`
  为当前 CI 45 分钟挂起的真正文件，最高优先。
- 工作树/分支：`.claude/worktrees/release-v2.0.0-blockers-7` / `release/v2.0.0-blockers-7`，
  从 `origin/main`（`2578203`，PR #91 已合并）切出。
- 授权：客户已授权；若发现真实产品回归则停下报告、不夹带。**本批判定：2 个文件暴露产品回归，
  已停止修改并报告（§五）；其余 8 个文件按夹具/等待/清理口径修复并验证。**
- 声明：未运行 Electron、未占用 9224、未触发 CI、未打 tag、未 push main；只提交/推送本分支。

## 〇、结论摘要（先读）

1. **B7-1 已修**：`test/桌面应用/request-timeout-wiring.test.ts` 的 3 例在不可解析项目根下**立即失败
   并自然退出（0s）**，不再无界挂起（修复前本机 45s 被杀仍未退出，B6 证据
   `probe-request-timeout-wiring-hang-45s.txt`；CI Windows 文件级 2,151,333ms）。
2. **B7-2 已修 8 个文件**（含 B7-1）：夹具根统一为 `fs.mkdtemp` 真实临时根（listing/open/lastTurnOf/
   快照同一根，结束删除）、`open.ok === true` 断言、全部回执/开跑等待加 10s 上限、finally/after 统一
   清理（放夹具门 → 有界 `mgr.stop(null)` → 逐句柄 dispose → 有界等 send）。**断言未放宽**。
3. **两个文件暴露产品回归，按指令停下、未改、未入 overlay**：
   - `test/桌面应用/handback-delivery.test.ts`：v2.0.0 冻结源（`e71501c`）把单模型回交合批条件从
     「回交主人或 chief」改为**仅 chief**（`app/desktop/session.ts:13174-13179`；上一行注释仍写
     「仅回交主人队首连续回交合批」，且 `handbackOwner` 变量被计算后未使用）；
   - 同文件 `handleHandback`（`session.ts:8720-8726`）在形状防御前读取 `hb.taskId`，坏形状回交事件
     从「形状不符」如实系统行退化为 `会话事件流异常：Cannot read properties of undefined (reading
     'taskId')`；
   - `test/桌面应用/queue-visibility.test.ts` 仅因同一合批回归失败（`回交合批后队列清空`）。
   逐项清单见 §五。
4. **验证**：8 个文件各连续 3 次全绿、自然退出（`--test-timeout=120000`）；`npm run typecheck` exit 0；
   三套冻结 known-red（runtime-core 33 / 门禁 5 / 编排 24）逐名 diff 空。
5. **overlay**：`src/common/装配/release-policy.mjs` 精确加入 8 个测试文件（每文件 1 条、单文件不开
   目录）；`test/装配/release-packaging.test.ts` 新增同批精确路径钉（20/20 pass），并把第六批钉中对
   `request-timeout-wiring.test.ts` 的 excluded 预期替换为另一未列名样本。

## 一、根因（与第六批一致，已由本批逐文件复现）

这些测试以字面量 `/proj`（message-queue 另有 `/proj2`）作 `projectRoot`。v2.0.0 B3-2b 起
`recordGitHostInventory` 以 native realpath 规范化根，不可解析即 fail-closed
（`git-host-project-root-unresolvable`）⇒ `SessionManager.open` 返回「会话库存登记失败」⇒ 回合从未
开跑。CI runner 无该路径（macOS 为根目录下 `/proj`；Windows 为当前盘符根下 `\proj`）。本机遗留
`C:\proj`（2026-10-28）掩盖了依赖，因此基线在本地「全绿」、在 CI 红/挂。

`request-timeout-wiring.test.ts` 在 open 失败后仍有 8 处无界 `await *.started/pending`；CI 命令
`node --test --test-concurrency=1 "test/**/*.test.ts"` **未设 `--test-timeout`** ⇒ 文件子进程永久挂起。

## 二、逐文件改法与本地结果（/proj 族核对表）

所有修改文件均：真实 mkdtemp 根（文件级或每例，视测试结构）；`open.ok` 断言；回执/开跑等待
`settledWithin(…, 10s)`；失败路径统一清理（放夹具门 → 有界 stop → dispose → 有界等 send）；
未删用例、未加 skip。

| 文件 | 原 `/proj` 风险点 | 改法 | 本地结果（连续 3 次） |
| --- | --- | --- | --- |
| `request-timeout-wiring.test.ts` | listing/open/lastTurnOf；open 失败后 8 处无界 `await *.started/pending` | `withDiagnostics(dir, projectRoot)` 双临时目录；harness 追踪门/句柄/send；`settledWithin` 全部无界等待；`cleanup()` | 3/3、3/3、3/3，EXIT=0；**不可解析根探针 0s 失败退出** |
| `abort-unwedge.test.ts` | listing/open/abort/snapshot | 同法（诊断目录 + 项目根）；3 例 try/finally → `cleanup()` | 3/3 × 3，EXIT=0 |
| `message-queue.test.ts` | listing/getListing/open/send 作用域/watchdog 快照/lastTurnOf/持久化 store 键（含 `/proj2`） | 文件级 `PROJECT_ROOT`（before/after）；17 处 open 经 `openSession` 统一断言；`/proj2` 改真实 `otherRoot`；manager/门 after 统一清理 | 20/20 × 3，EXIT=0 |
| `operator-channel.test.ts` | FAKE_LISTING 与 2 个局部 listing 的 projectRoot；3 处 open；I-1 源钉 | 文件级 `FIXTURE_ROOT`；`openOk`；`stopBounded`；manager after 清理；**B4.1 源钉更新**（`projectShellArming`，行为断言未放宽） | clean checkout（普通 `.git` 目录）59/59 × 3，EXIT=0（链接工作树中仅 I-1 一例受 `.git` 文件保护判定影响，见 §七） |
| `p0-halt-and-images.test.ts` | 4 例 listing/baseDeps/open/sendSession | `withProjectRoot`；`baseDeps(projectRoot, …)`；`open.ok`；cleanups after；**失败语义按 v2.0.0 钉**：客户入口只认幕僚 ⇒ 图片用例开 chief + 显式 `target`（图片嗅探/透传断言逐字保留） | clean checkout 5/5 × 3，EXIT=0 |
| `queue-withdraw-lru.test.ts` | listing/getListing/12 处 open/sendBackground 作用域 | 文件级 `PROJECT_ROOT`；`openOk`；`settledWithin(p1/send/running)`；harness `cleanup()` + after 兜底 | 5/5 × 3，EXIT=0 |
| `dispatch-fresh-enum.test.ts` | EMPTY/GROWN listing、open、Interface list/open | 文件级 `FIXTURE_ROOT`；cleanups after（两个 manager + desktop） | 2/2 × 3，EXIT=0 |
| `turn-lease.test.ts` | listing/open/lastTurnOf/watchdogSnapshot；4 处 `await pending*` | `withDiagnostics(dir, projectRoot)`；harness 门/句柄/send；3 例 `cleanup()` + 1 例临时根 finally 删除 | 4/4 × 3，EXIT=0 |

证据：`_evidence/after-3x_<file>.txt`（每文件 RUN 1/2/3 + EXIT）、
`_evidence/after-3x-clean-checkout_<file>.txt`（operator-channel / p0 的 CI 形态）。

## 三、失败语义裁定（v2.0.0 如实钉）

| 用例 | v2.0.0 语义 | 裁定 |
| --- | --- | --- |
| p0-halt-and-images 图片 3 例 | 客户消息入口只接受 `target.roleId === "chief"`（`app/desktop/interface.ts:3019-3021`，`ui.composer.customerEntryChiefOnly`）；`sendSession` 需显式 `target`（`resolveDirectiveTarget`） | **测试夹具按新入口更新**：listing 的 primaryRoleId=chief、开 chief 会话、`sendSession` 带 `{projectRoot, roleId:"chief", runtime:"demo"}`。坏 MIME/超 5MB/合法图嗅探/图片原引用等**主断言逐字未改**。不是产品回归。 |
| operator-channel I-1 源钉 | v2.0.0 B4.1：`shellArming` 先经任务级 Git 分类包装为 `projectShellArming`，再 `...(projectShellArming ?? {})` 展开进 `assembleProjectShellGate` | **只读源钉更新为当前实现**；运行时「能力面产出 ShellGate」与「`capabilities?.shellGate ?? shellGate` 优先」断言不变。不是产品回归。 |
| handback-delivery 合批 3 例 + queue-visibility 1 例 | 冻结源实际语义：单模型（su/primaryRoleId）**不再合批**，仅 trio chief 合批 | **判定为产品回归候选，不改断言、不入列**（§五.1）。 |
| handback-delivery 坏形状 1 例 | 冻结源实际行为：`handleHandback` 先读 `hb.taskId` ⇒ TypeError 被消费环捕获为通用「会话事件流异常」 | **判定为产品回归，不改断言、不入列**（§五.2）。 |
| handback-delivery trio / 星形 2 例 | trio 裸回交夹具触发 `delivery-child-source-invalid`（新来源门 fail-closed）；星形回交正文新增 `[收口依据…]` 后缀 | trio：来源门属 v2.0.0 有意 fail-closed，夹具需补真实任务账本（下一批）；星形：新增后缀属新语义，期望可改「原文 + 后缀」（不属回归）。但因同文件已因 §五 回归停下，未在本批改。 |

## 四、验证

1. 8 个文件各连续 3 次全绿、自然退出，`--test-timeout=120000`：
   - request-timeout-wiring 3/3；abort-unwedge 3/3；message-queue 20/20；queue-withdraw-lru 5/5；
     dispatch-fresh-enum 2/2；turn-lease 4/4；operator-channel 59/59（clean checkout）；
     p0-halt-and-images 5/5（clean checkout）。
2. `npm run typecheck` → `tsc --noEmit`，EXIT=0（证据 `typecheck.txt`）。
3. 冻结 known-red 逐名 diff 空：runtime-core 604/567/33/4；门禁 577/571/5/1（资源 LF 归一后还原，
   `file` 确认 CRLF、status 干净）；编排 1386/1360/24/2（`--test-timeout=120000`）。
   证据 `knownred-*`、`knownred-diffs.txt`。
4. 不可解析根探针：修复后的 request-timeout-wiring 在 0s 内 3 例失败退出（`open.ok` 断言），
   证明无界挂起已消除（`probe-fixed-request-timeout-wiring-nonexistent-root.txt`）。

## 五、产品回归清单（停止项；未改产品代码、未夹带）

### 5.1 单模型回交合批被移除（合批仅剩 chief）

- 用例/期望：`handback-delivery.test.ts` 的
  「E-1 排队：su 忙时保留，settle 后连续回交按原序合成一次验收输入」、
  「连续回交投递失败：整批保留同序，重试送达一次，原报告键不丢」、
  「C frozen batch retries keep members and delivery ID while later reports stay separate」；
  `queue-visibility.test.ts` 的「回交合批后队列清空」。
- 期望：同一目标队首连续回交合批为一次输入（`renderHandbackBatchPrompt`），队列一次清空。
- 实际：单模型（primaryRoleId=su）每轮只投 1 条，其余留在队列（探针
  `probe-handback-delivery-original.txt`、`probe-queue-visibility-original.txt`）。
- 代码点：`app/desktop/session.ts:13174-13179`——注释仍写「仅回交主人队首连续回交合批」，实际条件
  为 `resolvedTarget === chiefRoleId`；上一行 `handbackOwner` 计算后未使用。
- 引入：`e71501c`（2026-11-07 `chore: checkpoint Chief workflow and Git role integration`），
  `merge-base --is-ancestor e71501c 752953c` = yes（已入 v2.0.0 冻结源）。
- 对照：同一提交前（`e5a533d`）条件为
  `resolvedTarget === handbackOwner || resolvedTarget === chiefRoleId`。
- 建议：产品确认单模型是否仍应合批；若应，恢复 `handbackOwner` 分支并补回归测试；若确认新语义，
  由产品/测试另立变更明确「单模型逐条投递」，再更新上述 4 例标题与主断言（不在本批擅自改）。

### 5.2 坏形状回交事件防线失效（TypeError）

- 用例/期望：`handback-delivery.test.ts`「真机崩溃修复：坏形状回交事件（缺载荷/缺 roleId）→
  不投递、如实系统行、零未捕获拒绝」；期望「收到一条**形状不符**的交付事件…」系统行。
- 实际：`会话事件流异常：Cannot read properties of undefined (reading 'taskId')`（未捕获拒绝仍为 0；
  消费环兜底捕获，但专用防线未生效，系统行不再是形状说明）。
- 代码点：`app/desktop/session.ts:8720-8726` `handleHandback` 在 `if (!hb.taskId)` 处直接读取；
  形状防御在 `commitHandback`（`8739+`）。同样由 `e71501c` 引入。
- 证据：`probe-malformed-and-star.txt`（MALFORMED_DEBUG 行）。
- 建议：`handleHandback` 先把 `hb` 形状校验（或 `if (!hb || typeof hb !== "object" || !hb.taskId)`），
  再进入 detach/commit；恢复「形状不符」如实系统行。

### 5.3 其余同文件失败（非回归，下一批处理）

- trio 回交路由：裸回交夹具缺 v2.0.0 来源门所需的真实任务账本事实 ⇒
  `delivery-child-source-invalid: The persisted child report does not belong to this original creator`
  （与 B3-4 chain-enforcement 同类 fail-closed）。建议补 `task.created`/`task.reported` 账本夹具，
  或按来源门钉 fail-closed；需产品/编排确认。
- 星形回交：投递已发生，正文新增 `[收口依据尚不可用] …` 后缀（`session.ts:8901-8906`
  `prepareCreatedTaskClose` 接入）。建议期望改为「`renderWorkReportPrompt` 原文 + 收口依据后缀」，
  不属回归。

## 六、overlay

- `src/common/装配/release-policy.mjs`：`files` Set 精确加入 8 个测试文件（每文件 1 条、单文件不开
  目录、注释理由、断言未放宽）：
  `request-timeout-wiring` / `abort-unwedge` / `message-queue` / `operator-channel` /
  `p0-halt-and-images` / `queue-withdraw-lru` / `dispatch-fresh-enum` / `turn-lease`（均 `test/桌面应用/`）。
- `test/装配/release-packaging.test.ts`：新增
  `release overlay selects the v2.0.0 /proj fixture-family blocker tests by exact path only`，
  断言 8 条精确入列、相似名/`handback-delivery`/`queue-visibility`/`decision-service` 仍 excluded；
  第六批钉中对 `request-timeout-wiring.test.ts` 的 excluded 预期改为另一未列名样本（精确边界未放宽）。
  该文件 `20/20` pass。
- **未入列**：`handback-delivery.test.ts`、`queue-visibility.test.ts`（§五 回归停止项）。

## 七、限制与披露

1. 本机为 Windows 11；macOS 平台由发布流水线最终确认（本批未触发 CI、未打 tag）。
2. 链接工作树根 `.git` 为文件，`readGitHostProtectionRequirement` 对其 fail-closed；因此
   operator-channel I-1 与 p0 P0-2 首例在链接工作树内会于 open 失败（与 CI 无关）。本批以普通检出
   （`git clone --shared`，`.git` 为目录）完成这两文件 3× 全绿验证（§四；`ci-shape-clean-checkout.txt`）。
3. 本机遗留 `C:\proj` 使修复前基线在本地「全绿」；本批修复后所有夹具不再读取该目录，删除与否不影响
   测试。
4. 本批未改产品代码；§五 两项若确认需修，应由产品/实现角色另立变更，并同步更新相应测试断言。
5. 未删除用例、未新增 skip、未放宽主断言；`until` 预算与既有语义断言保留。
6. `message-queue` 的 `await h.mgr.send(...)` 等产品直发调用保留原形（不会在 open 失败后悬挂）；
   显式 promise 变量（`send`/`s1`/`p1`/`running`/`pending*`）全部加 10s 上限。

## 八、复现命令

```powershell
cd C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-7
node --test --test-timeout=120000 "test/桌面应用/request-timeout-wiring.test.ts"
node --test --test-timeout=120000 "test/桌面应用/abort-unwedge.test.ts"
node --test --test-timeout=120000 "test/桌面应用/message-queue.test.ts"
node --test --test-timeout=120000 "test/桌面应用/queue-withdraw-lru.test.ts"
node --test --test-timeout=120000 "test/桌面应用/dispatch-fresh-enum.test.ts"
node --test --test-timeout=120000 "test/桌面应用/turn-lease.test.ts"
# 普通检出（CI 形态）：
node --test --test-timeout=120000 "test/桌面应用/operator-channel.test.ts"
node --test --test-timeout=120000 "test/桌面应用/p0-halt-and-images.test.ts"
node --test --test-timeout=120000 "test/装配/release-packaging.test.ts"
npm run typecheck

# known-red（门禁需先 LF 归一、运行后还原）
node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"
node --test --test-concurrency=1 "test/门禁引擎/**/*.test.ts"
node --test --test-concurrency=1 --test-timeout=120000 "test/编排/**/*.test.ts"
```
