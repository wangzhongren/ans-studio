# 桌面窗口 B8 记录：v2.0.0 回交两处产品回归修复（单模型合批 / 坏形状防御）

- 日期：2026-11-12（证据采集）；2026-11-13（会话重启后续做核验定稿）
- 角色：ANS「桌面窗口」（roleId: 桌面窗口；独立固定上下文）
- 任务：v2.0.0 发布阻断 **B8 产品回归**——(a) 单模型（single/su）连续回交不再合批、队列不清空；(b) 坏形状回交事件在形状防御前读 `hb.taskId` 抛 TypeError、专用「形状不符」防线失效
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-8`
- 分支：`release/v2.0.0-blockers-8`；基线 HEAD：`e0c5e01`（PR #92 合并后 main）
- 性质：产品修复 + 自检记录（不替代独立验收与独立测试角色验证）；**未 commit / 未 push / 未打 tag / 未触发 CI**；未运行 Electron，未占用 9224/9223/9222。

## 一、事实与依据

证据文件均在 `角色卡/桌面窗口/docs/change/2026-11-12_release-blocker-handback-regressions_evidence/` 下（§四同）。

| 依据 | 路径 / 来源 | 与 B8 的关系 |
| --- | --- | --- |
| 回归引入点 | `git show e71501c -- app/desktop/session.ts`（合批 hunk：`-（resolvedTarget === handbackOwner \|\| resolvedTarget === chiefRoleId）` → `+resolvedTarget === chiefRoleId`） | 2026-11-07 v2.0.0 Chief 工作流 checkpoint 误删回交主人合批分支；`handbackOwner` 保留计算但不再使用 |
| 旧实现对照 | `git show e71501c^:app/desktop/session.ts`（合批条件在 `:9426-9428`；渲染分支 `:9430-9438`） | 修复必须恢复「回交主人 **或** 幕僚 chief」的合批语义 |
| 契约 | `src/common/编排/handback.ts`（`TaskHandback`） | `status` 五枚举（含 `unreported`）；`roleId`/`summary`/`evidence: string[]`/`at` 必填；`taskId`/`turnId` 可选 string；`round` 可选 number |
| 修复前测试（handback-delivery） | `b8-01-before-handback-delivery.txt`（sha256 `720f8ed8…`） | **12 pass / 6 fail**（含「E-1 排队」「连续回交投递失败」「坏形状」「C frozen batch retries」「trio 回交路由」「B 星形回交」） |
| 修复前测试（queue-visibility） | `b8-02-before-queue-visibility.txt`（`e0e2da82…`） | **1/2**：「回交合批后队列清空」断言 8 !== 0 |
| 坏形状真机形态 | 事件载荷缺失（`handback: undefined`） | 修复前 `handleHandback` 首行读 `hb.taskId` ⇒ `Cannot read properties of undefined (reading 'taskId')`，被事件消费环兜底为通用「会话事件流异常」，`commitHandback` 既有 `handbackMalformed` fail-closed 分支不可达 |

## 二、根因（已核实）

1. **单模型回交合批回归（e71501c 引入）**：`drainQueueUnsafe` 认领段合批条件由
   `headIndex === 0 && (resolvedTarget === handbackOwner || resolvedTarget === chiefRoleId) && item.kind === "handback" && …`
   误改为仅 `resolvedTarget === chiefRoleId`。`handbackOwner` 计算保留但不再使用（紧邻注释与下方批量渲染分支仍按「回交主人 / 幕僚」两者写）。single 模型下回交主人 = `primaryRoleId`（su），trio 下 = Convener——两者都不等于 chief ⇒ 队首连续回交不合批、逐条投递，队列不清空（queue-visibility 失败断言 `8 !== 0`）。
2. **坏形状防御缺失**：`handleHandback` 在既有形状防御（`commitHandback` 的 `handbackMalformed` 如实系统行 + fail-closed 返回）之前即读 `hb.taskId`；坏载荷（如 `handback: undefined`）直接抛 TypeError 退出，事务循环只剩通用兜底。且 `commitHandback` 原入口检查只验 `roleId` 是否为 string，未按 `TaskHandback` 契约校验。

## 三、修复（只改 `app/desktop/session.ts`，+27/−2）

1. 新增私有 `isTaskHandbackShape(value): value is TaskHandback`：按契约校验 `roleId`（必填 string）、`status`（五枚举含 `unreported`）、`summary`（string）、`evidence`（string[] 逐项 string）、`at`（string）；可选 `taskId`/`turnId` 出现时必须 string、`round` 出现时必须 number；可选 `runtime`/`origin` 不参与（契约本身允许缺席）。
2. `handleHandback` **首行**先 `isTaskHandbackShape`；坏形状直接转 `commitHandback` 既有 fail-closed 分支（`main.session.handbackMalformed` 如实系统行、`return false`），不再触碰 `hb.taskId`——「Cannot read properties of undefined (reading 'taskId')」路径关闭。
3. `commitHandback` 入口检查由「仅 roleId」升级为同一 `isTaskHandbackShape`（与第 2 条同一契约、单一实现）；其后的 `structuredClone`/渲染/落账只在完整契约上进行。
4. 合批条件恢复为「`resolvedTarget === handbackOwner` **或** `resolvedTarget === chiefRoleId`」；`handbackOwner` 计算保留。新增 `handbackOwner !== null` 守卫与 e71501c 之前语义**等价**（`resolvedTarget: string`，旧式 `string === null` 恒 false）——对照旧实现逐字一致（见 §一）。

文件：`app/desktop/session.ts`（M，13,491 行，raw sha256 `e7288b2e…`，numstat +27/−2）。i18n 键 `main.session.handbackMalformed` / `main.common.unknownRole` 沿用既有（zh-CN/en-US 均在册）。

## 四、验证（证据目录：`角色卡/桌面窗口/docs/change/2026-11-12_release-blocker-handback-regressions_evidence/`）

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck`（`tsc --noEmit`） | **exit 0**（无错误输出） | `b8-03-typecheck.txt`（`9d1adbac…`；mtime 19:10:59，晚于 session.ts mtime 19:10:55 ⇒ 对应当前内容） |
| `test/桌面应用/handback-delivery.test.ts` 修复前 | 12 pass / 6 fail | `b8-01-before-handback-delivery.txt` |
| 同文件修复后 ×3 轮 | **16 pass / 2 fail**（三轮一致） | `b8-04-after-handback-delivery-run1/2/3.txt`（`ea5cab33…`/`77f625d7…`/`3686c68c…`） |
| 其中剩余 2 红 | **已登记下一批非回归项**：① trio 裸回交来源门（「2026-10-24 trio 回交路由：项目 worker 回交→Steward；内置来源回交→Lead；同轮 settle 不双发」）② 星形回交 `[收口依据]` 后缀（「B 星形回交：tasks.jsonl 已知 taskId ⇒ 只投幕僚、`[工作结果]` 固定字段、写 task.reported」）——两例修复前亦红，非本批改动引起 | run1/2/3 失败段 |
| 坏形状用例 | **转绿 3/3**（修复前必红）：「真机崩溃修复：坏形状回交事件（缺载荷/缺 roleId）→ 不投递、如实系统行、零未捕获拒绝」 | run1/2/3 |
| `test/桌面应用/queue-visibility.test.ts` 修复前 | 1 pass / 1 fail（「回交合批后队列清空」8 !== 0） | `b8-02-before-queue-visibility.txt` |
| 同文件修复后 ×3 轮 | **2/2 全过 ×3** | `b8-05-after-queue-visibility-run1/2/3.txt`（`f410d47c…`/`8a339eee…`/`a57d66d8…`） |
| b8-04b 单轮 15/18 抖动 | 「连续回交投递失败：整批保留同序，重试送达一次，原报告键不丢」单次红（36.8ms）；产品探针显示：首投 `delivery.failed`（count=2，队列剩 1）→ 重试 `delivery.claim.start/start(count=1)/end ok:true` **恰一次成功**；`b8-07`（文件名标注 pre-e71501c）同用例 1/1 通过 ⇒ 非产品逻辑回归，**交测试角色在夹具/等待清理后复核** | `b8-04b-after-handback-delivery-timing-flake-15of18.txt`（`7261bb4b…`）、`b8-06-probe-retry-timing.txt`（`7966bd19…`）、`b8-07-pre-e71501c-retry-test.txt`（`d786cd55…`） |
| 受影响桌面套件 | **tests 119 / pass 118 / fail 1**；唯一失败 = `I-1 补丁（真正接通核查）`，属**已登记 worktree 拓扑环境问题**（`2026-11-10_B3_two-fixed-workflow-paths-desktop.md` §3.4：linked-worktree `.git` 为文件 ⇒ `runtime-creation-prepared-api-unavailable`；纯净 HEAD 同拓扑复现同名失败），非 B8 回归 | `b8-08-affected-suites.txt`（`6a359bf3…`） |
| known-red 基线对照（统筹统一复跑口径） | gates：基线失败名 diff **为空**（577 tests / 571 pass / 5 fail / 1 skip）；runtime-core：diff **为空**（604 / 567 / 33 / 4）；orchestration：失败名 diff **+1 条文件级条目** `test\编排\git-trunk-store.test.ts`（exitCode 134 崩溃，非测试名级差异，产品文件不触及该路径），**交统筹/测试侧统一分类** | `b8-09-knownred-gates.tap`/`-orchestration.tap`/`-runtime-core.tap` 与对应 `-diff.txt`（gates/runtime-core diff 均为空文件 `e3b0c442…`） |

**如实结论：本批未「全绿」。** 坏形状与单模型合批两条目标回归已修复并经三轮复跑；handback-delivery 仍余 2 项已登记下一批非回归项，另有一轮时序抖动交测试侧复核；known-red 由统筹统一裁决。全程未跑重型套件（按统筹分工）。

## 五、候选

| 文件 | 状态 | 行数 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `app/desktop/session.ts` | M | 13,491 | `e7288b2eee2a5aa31393a6f39e6a32676610215c64d78b4a793b52ef4d5fb453` | +27/−2 |

- 写集外改动 = 0：本角色只改该产品文件与 `角色卡/桌面窗口/` 下文档；**未改测试文件**。
- 工作树中 `test/桌面应用/handback-delivery.test.ts` 与 `角色卡/测试/docs/change/_evidence/` 属**测试角色**同工作树的并发改动（夹具清理：真实临时项目根 / 有界等待 / `after` 清理），本角色未触碰、未审核其最终形态（即 §四「抖动交测试侧复核」的落实）。
- **未 commit**：由统筹/测试角色统一处置；未 push、未 tag、未触发 CI、未碰 main。

## 六、风险与遗留

1. **2 项待批**：handback-delivery 剩余 2 红为已登记的下一批非回归项（trio 裸回交来源门、星形回交 `[收口依据]` 后缀），本批不修、待统筹批准后再动。
2. **flake 交测试侧复核**：b8-04b 的「连续回交投递失败」一轮 15/18 为时序抖动；产品探针（b8-06）显示 `delivery.failed` 后重试恰一次成功、原报告键不丢——请在测试角色完成夹具/等待清理后复跑确认（同工作树已见其改动，未由本角色验证）。
3. **known-red 待分类**：orchestration 对照基线新增 1 条文件级崩溃条目 `test\编排\git-trunk-store.test.ts`（exitCode 134）；本批产品改动不触及该路径，交统筹/测试侧统一分类。
4. **未做真机验证**：未运行 Electron、未验证 trio 生产链真机形态；未跑全量套件（按分工由统筹统一跑）。
5. **契约收紧的披露**：`commitHandback` 形状校验按 `TaskHandback` 契约 fail-closed——理论上的不完整自造回交会被如实系统行拒绝而不再投递；生产端 `buildTaskHandback`/`buildReportHandback` 恒填 `roleId`/`status`/`summary`/`evidence`/`at`（`src/common/编排/handback.ts:136-181`），无合法路径被误拒。
