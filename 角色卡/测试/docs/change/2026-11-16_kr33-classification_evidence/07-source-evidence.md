KR-33 逐项源码/文档/历史证据（只读核查；日期 2026-11-16；基线 d1f256f）
说明：本文件只摘录定位所需的最小证据；原始日志/大段文案见 06-real-six-ci-error-bodies.txt。

## 1. dispatch_task 文案 ×2（#4/#5）——测试假设过时

- 测试：`test/runtime-core/dispatch-workflow-writer-copy.test.ts:10`（文案）、`:29`（promptGuidelines）。
  断言（第一处即失败）：
  - `:13` / `:32` `/工作流由\*\*运营（convener）\*\*落盘到 `docs\/workflow\.md`/`
  - `:14` / `:33` `/运营的 Section 1 预授权、直接写即可/`
  - `:15` / `:34` `/先落盘再派发/`；`:16` `/**再**派发任务/`
  - `:18-21` / `:35` 反断言“写盘经确认制”“列入规划确认 preview”
- 当前产品文案：`src/provider/runtime/schema.ts:752` 起（describeTool("dispatch_task")），
  相关句在 `:758`（“需要跨角色实现时…准备适用契约…与运营职责内的 `docs/workflow.md`”）、
  `:761`（`docs/workflow.md` 缺失不拒投）、`:774`（promptGuidelines 同口径）。
  当前文案不再包含上述四处旧句；仍保留“运营负责 workflow、按地址引用不内嵌、缺失容忍”的语义。
- 变更来源：`git show e71501c -- src/provider/runtime/schema.ts`（2026-11-07 checkpoint）明确删除
  “先落盘再派发/Section 1 预授权、直接写即可/再派发”并改写为 Chief 协调口径；文案测试未同批更新。
- 后续契约：`角色卡/运行时核心/docs/change/2026-11-04_trunk-amendment-model-C1d-record.md:104`（AC-33：
  `request_stable_write` 只提交 docs/workflow.md，客户 stable-write 确认卡批准后才写，工具不直接写）；
  `src/provider/runtime/schema.ts:1818-1840` 的 request_stable_write 文案与之一致。
- 结论：该测试钉的是 e71501c 前的旧文案与旧“直接写”模型；现行产品/契约已变化 ⇒ 更新断言（K3）。
  建议断言现文案的语义核心：运营职责内 `docs/workflow.md`、跨角色实现前准备、按地址引用不内嵌、
  缺失（旧项目过渡期）不拒投；保留“不得声称写盘经确认制”的反向断言时需先由 owner 确认该条是否
  已被 stable-write 契约取代（当前 request_stable_write 就是客户确认卡路径，旧反断言已不成立）。
- 约束：**不得改测试名**（冻结 33 名必须逐名转绿，不能用重命名/重建基线代替）；在测试体内加注释说明标题为历史名。

## 2. D3 linked workspace root（#9）——测试假设过时（+ symlink 能力前置）

- 测试：`test/runtime-core/file-write-safety.test.ts:97`；断言 `:108` `assert.match(result.message, /符号链接/)`。
- 当前产品：`src/provider/runtime/tools.ts:597-609` `finalFileProtection` 返回
  `[file-write-protection] symbolic-link target`（英文 reason code；外层 `write_file 拒绝写入：` 前缀为中文）。
  该函数由 e71501c 引入（`git show e71501c -- src/provider/runtime/tools.ts`，新增 rejected 系列英文 reason）。
- CI 证据（R5 arm64/x64、R6 x64/win 同形）：actual
  `write_file 拒绝写入：[file-write-protection] symbolic-link target`，expected `/符号链接/`
  （06-real-six-ci-error-bodies.txt）。
- 本机：Windows 无符号链接权限，`symlink()` 先 EPERM，断言不可达（04-root-cause-probe.txt §5）。
- 同文件 `D3 lstat ENOTDIR`（file-write-safety.test.ts:113-130，B6a 2026-11-16 更新）在非 Windows
  分支已断言英文 `canonical identity unavailable; no write (ENOTDIR…`，证明英文 reason code 已是
  该守卫的现行测试口径；#9 的 `/符号链接/` 是唯一残留中文断言。
- 结论：断言更新为稳定的保护码（如 `/\[file-write-protection\] symbolic-link target/`），
  保留“目标未被替换/原内容不变”的强断言；测试内增加 symlink 能力探测（win32 用 junction 或诊断跳过），
  不因平台权限伪红。若 owner 要求用户可见中文文案，则改为产品侧 reason 本地化（运行时核心），
  但从现行 reason-code 约定看测试更新是最小修复。

## 3. Core-managed binding rejects…（#29）——产品回归（重复 dispose）

- 测试：`test/runtime-core/session.test.ts:439`；`:446` `assert.equal(native,0); assert.equal(disposed,1);`
- 当前产品：`src/service/runtime/session.ts:750-765`
  - `:751` `constructed = inner;`
  - `:752` `try { provider.display.assertReady(); } catch (error) { await inner.dispose(); throw error; }`
  - `:763` `try { await constructed?.dispose(); } catch { … }`（外层 catch）
  ⇒ assertReady 失败时同一 inner 被 dispose 两次（fixture 计数 2）。
- 历史：`git blame`：`:752` 的 inner.dispose 来自 6e515893（2026-10-22）；`:751/:763` 的
  constructed + 外层 dispose 来自 e71501ca（2026-11-07）。测试的 disposed=1 早于 e71501c。
- CI 证据：R5 arm64/x64/win 与 R6 x64/win 均 `2 !== 1`（session.test.ts:446:33）。
- 结论：产品侧最小修复 = 删除 `:752` 的 `await inner.dispose()`（外层 catch 已覆盖 constructed），
  保持 native=0、dispose 恰一次；不改测试。若 owner 裁定 dispose 可重复调用且测试应接受 2，
  需在契约中明确并说明为何放弃 exactly-once 清理断言（默认不采用）。

## 4. 主干来源（#32）——测试假设过时

- 测试：`test/runtime-core/trunk-contract.test.ts:80`；`:81-90` 期望
  `["adopted","amendment","bootstrap","post-run-change","recovery","upgrade"]`（6）。
- 当前产品：`src/model/trunk.ts:36` 类型与 `:37-45` `TRUNK_SOURCES` 含第 7 个来源 `team-plan`。
- 文档：`角色卡/运行时核心/api-spec.md:217`（R5 A/B 实际签名）
  “TrunkSource/TRUNK_SOURCES 增 team-plan 真实计划发布来源，不能伪产品 upgrade”。
- 变更来源：e71501c 引入 `team-plan`（`git log -S 'team-plan' -- src/model/trunk.ts`）。
- 结论：期望集加入 `team-plan`（7 项，排序后）；保留 `main-upgrade` 负例与 bootstrap/recovery/upgrade 显式断言。

## 5. doc-freeze reason 九类（#33）——测试假设过时

- 测试：`test/runtime-core/version-change-contract.test.ts:176`；`:177-190` 断言
  `DOC_FREEZE_REASONS.length === 9`，customer ∪ application == all 且互斥，`migrated-draft` 非 reason。
- 当前产品：`src/model/version-change.ts:196-206` 共 10 个 reason（新增 `role-direct-applied`）；
  `:208-213` customer 5；`:215-220` application 4；`:235` `DOC_FREEZE_DIRECT_REASONS = ["role-direct-applied"]`。
- 文档：`角色卡/运行时核心/api-spec.md:187`（R3）与 `:209`：
  “新增 `role-direct-applied` 原因及 DirectDocFreezeRecord 强写入形状”；`DOC_FREEZE_JUDGE_DELEGATED_REASONS`
  仍是 customer 子集，不构成第三分区。
- 既有新测试：`test/runtime-core/direct-role-capabilities.test.ts:128` 已断言 direct freeze 的 reason。
- 结论：测试改为 10 类、三分区互斥且并集 == 全集（customer 5 + application 4 + direct 1），
  保留 `migrated-draft` 非 reason 与 migration marks/baseline event kinds 断言；标题“九类”为历史名，不改名。

## 6. 25 名 ENV-worktree —— 环境（linked worktree `.git` 文件）

- 机制与探针：见 04-root-cause-probe.txt；B7.1 NOTES（`…B7.1…/09-readonly-suites/NOTES.txt` 第 8 行）
  已记录：工作树 cwd 586/549/33/4，中性 cwd 586/574/8/4，25 个额外失败同因。
- 触发文件/行（7 个文件，全部属运行时核心写区 test/runtime-core/）：
  abort-quarantine.test.ts:18；effective-timeouts.test.ts:44,65,130；
  git-capability-tools.test.ts:671,742,772,784,987,1004；prompt-start-acknowledgement.test.ts:76,95,111,131；
  reasoning-effort.test.ts:47；session.test.ts:395,424,445；submit-capability-tools.test.ts:505,541,551。
- 修复建议：用中性临时根（mkdtemp，无 .git）或共享 helper 替代 process.cwd() 作为 projectRoot/skillRoot；
  不改断言、不放宽保护语义。这样同一测试在 canonical 与 linked worktree 都可执行；CI 已绿不构成障碍。
- 证据：规范根对照 604/592/8/4（25 名全绿）；R5/R6 25 名全 ✔（05-ci-status-matrix.tsv）。

## 7. 2 名 ENV-symlink —— 环境/平台（本机符号链接权限）

- test/runtime-core/session-store.test.ts:46 与 :58 在构造阶段 `fs.symlink(..., "dir")`；
  本机 EPERM（无 SeCreateSymbolicLinkPrivilege）；规范根复跑仍 EPERM；R5/R6 三个 CI 平台均 ✔。
- 修复建议：创建链接前做能力探测；win32 优先用 `junction`（lstat().isSymbolicLink() 对 junction 为 true，
  仍覆盖“链接目录被拒绝”语义），无权限时以诊断跳过；断言不放宽。D3 测试同批复用该探测。

## 8. 风险边界

- 全部 33 名的文件（src + test/runtime-core）均在 `角色卡/运行时核心/boundary.yaml` 的写区内；
  测试角色（本专项）只读分析并写 `角色卡/测试/docs/change/`。
- 禁止重命名冻结测试名；否则等于重建基线，违反发布门禁。
- 三套冻结 known-red 中，本专项只处理 runtime-core 33；gates 5 / 编排 24 不在本轮范围，必须保持其
  既有状态（不得因本轮改动新增红）。
