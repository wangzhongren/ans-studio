---
id: scaffold-governance-and-wake-dedupe-acceptance
type: change
title: 脚手架先行治理 / delivered 唤醒去重 / 统筹主动 request_acceptance 三笔提交独立验收——A1–A8 逐项判定
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: verified-limited
related: [scaffold-first-governance, delivered-step-wake-dedupe, request-acceptance-proactive]
events:
  - date: "2026-10-26"
    kind: verified
    summary: 对 HEAD ea0fff0（三笔提交，对比 main 182a631）按客户交接口径 A1–A8 独立判定；typecheck 0、门禁 325（324 过/1 Windows 平台 skip）、team-plan 32/32、acceptance-dispatch 67/67、桌面全量 640/640、治理 e2e 复跑 155/155×2（首跑 154/155，一例既有 request_acceptance e2e 并发 flaky，隔离 10/10 且两次全量复跑通过）；V11 行为探针 6/6、A8 回执枚举探针、注册表结构对比均通过；总体有条件通过，无 FAIL；运行中 Electron 仍旧代码、真实模型对卡文本的遵从未验证
---

# 脚手架先行治理 / delivered 唤醒去重 / 统筹主动 request_acceptance 独立验收

**总体结论：有条件通过。** 三笔提交在 A1–A8 上未发现行为性 FAIL；独立实测的类型检查与各套件全部通过（e2e 有一例既有并发 flaky，已隔离并两次复跑确认）。条件与未验证项见 §六、§七：运行中的 Electron 进程仍是旧代码，唤醒去重与主动提交卡在新进程中的真机行为需重启后复核；A5 的并发/失败回滚目前只有代码审查，没有专门注入用例。

**权限声明**：本结论不授予提交、推送、合并、部署或发布。本角色只写了自身 `docs/change/` 下的报告与证据；未修改实现、测试、共享 i18n 或他人文档，未 commit/push。

## 一、标准与依据

本批是**实施完成后**按客户「所有变更都要独立验收」补做的验收。仓库中没有本批实施前由本角色固定的设计/验收标准（`docs/` 与 `角色卡/项目管理/docs/` 下无 2026-10-26 对应设计）。为使判定可复核，本报告把客户交接口径与协调端追加要求固定为 **A1–A8**（下表），并明确这是**事后标准**（post-hoc criteria），不是实施前冻结的标准；这是本批次的过程限制，不因本次通过而消失。

| 编号 | 验收项 | 主要判据 |
| --- | --- | --- |
| A1 | 团队计划必须有 build-scaffold，未 done 不派实现 | Steward/Crew 卡文本 + 单测断言 |
| A2 | 唯一构建配置 owner；专职基础设施角色不默认新增 | 卡文本 + 单测断言 + 注册表零变化 |
| A3 | 多步骤角色逐步骤交付检查点；脚手架独立交付 | Crew 卡文本 + 单测断言 |
| A4 | V11 允许 build-scaffold 依赖，其余约束不变、旧计划兼容 | 代码 + 单测 + 独立探针 |
| A5 | delivered 唤醒按 stepId 去重的新语义 | 代码 + 单测；逐子项判定 |
| A6 | 无权限/边界扩大（角色卡 registry、能力位、i18n 零变化） | 独立结构对比 + 单测 |
| A7 | 未验证项如实列出 | 报告 §六 |
| A8 | 统筹完成即主动 `request_acceptance` 的规则与回执处理完整，未弱化既有规则 | 卡文本 + 单测 + 回执枚举独立探针 |

## 二、候选身份与环境

| 项 | 值 |
| --- | --- |
| 工作树 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination` |
| 分支 | `feat/scaffold-first-governance` |
| HEAD（最终候选） | `ea0fff0e4a334012a5eef02924fb5e0c3547fa66`（三笔提交：`c7c3f0e` → `4d415db` → `ea0fff0`） |
| 基线 | `182a631dde83a866416a098faf72700be5472c09` |
| 候选状态 | 验收与全部复跑时 HEAD 固定为 `ea0fff0`；工作树仅未跟踪 `demos/`（他任务）与本角色证据目录，无 tracked 修改 |
| 操作系统 | Windows 11 Pro 10.0.26300（win32 x64） |
| Node / npm | v24.22.1 / 11.19.1（Node 绝对路径执行；未用 PowerShell） |

**候选范围在验收期间扩展过一次**：协调端先交两笔提交（`c7c3f0e`、`4d415db`），验收中途于 10:30 追加第三笔 `ea0fff0` 并要求并入。本报告的全部原始日志均在最终 HEAD `ea0fff0` 上**重新采集**；扩展前的旧日志未作为本报告证据。证据明细与 SHA-256 见 [`2026-10-26_scaffold-governance-and-wake-dedupe-evidence/00_candidate-and-commands.md`](2026-10-26_scaffold-governance-and-wake-dedupe-evidence/00_candidate-and-commands.md)。

## 三、改动范围复核（`git diff 182a631..HEAD`）

### 3.1 范围

7 个文件，+708/−62；`--summary` 无重命名/模式变化，`--check` exit 0。逐提交：`c7c3f0e` 5 文件 +375/−23；`4d415db` 2 文件 +177/−39；`ea0fff0` 2 文件 +157/−1。

| 文件 | +/− | 归属 |
| --- | --- | --- |
| `app/desktop/interface.ts` | +73/−35 | `4d415db`：delivered 唤醒去重 |
| `src/common/编排/team-plan.ts` | +14/−6 | `c7c3f0e`：V11 放宽 |
| `src/common/门禁引擎/governance-roles.ts` | +72/−10 | `c7c3f0e` Steward/Crew 卡文本 + `ea0fff0` Steward 主动提交卡文本 |
| `test/桌面应用/acceptance-dispatch.test.ts` | +104/−4 | `4d415db` |
| `test/编排/team-plan.test.ts` | +146/−0 | `c7c3f0e` |
| `test/门禁引擎/governance-standard-workflow.test.ts` | +155/−5 | `c7c3f0e` |
| `test/门禁引擎/governance-trio.test.ts` | +144/−2 | `c7c3f0e` + `ea0fff0` |

未发现夹带无关改动：没有配置、文档、i18n、依赖清单或其它产品模块的改动；未新增/删除文件。

### 3.2 是否弱化测试/断言

逐文件复核 diff 后：**未发现弱化**。

- `test/编排/team-plan.test.ts`：纯新增（+146/−0），三个 V11 build-scaffold 用例。
- `test/门禁引擎/governance-standard-workflow.test.ts`：既有标准工作流断言把第 8 步改为第 9 步（因新插入「基础设施先行」为第 4 步，卡文本同步顺延），并新增 `build-scaffold` 模板与前置/owner 断言；无断言删除。
- `test/门禁引擎/governance-trio.test.ts`：模板断言新增 `build-scaffold` 步骤并把 `delivery-*` 的 `dependsOn` 更新为含 `build-scaffold`（与卡文本一致）；`ea0fff0` 追加一组新测试（+136），无旧断言修改。
- `test/桌面应用/acceptance-dispatch.test.ts`：一处既有期望按**新语义**改写——旧断言「revision 变化⇒再派一次」与新修复「同一已通知 stepId 集合不重发」直接矛盾，属于被修复行为本身；改写同时新增「同集合 revision 变化不重发」「新步骤只报新步骤」「前缀同名不误判」等更强断言。这是行为变更的同步更新，不是降低标准。
- 其余测试改动均为新增断言。

### 3.3 V11 代码与角色卡文本一致性

`team-plan.ts` 的 `validateTeamPlanFlowConsistency` 现为：`required = {contract-freeze} ∪ 依赖角色的 delivery-*`；`allowed = required ∪ {build-scaffold}` **仅当 flow 存在 `build-scaffold` 步骤**。缺 `required` 仍报错、`allowed` 之外仍报「多」、未知 id/成环仍由 flow 静态校验拒绝。与卡文本「`dependsOn` 至少包含 `{contract-freeze} ∪ 依赖角色的 delivery-*`，并可显式加入 `build-scaffold`（V11 已允许）」一致。

**文案瑕疵（非阻断）**：报错 message 仍以「必须精确等于 {contract-freeze} ∪ 依赖角色的 delivery-*」开头，只在末尾补充「flow 已含 build-scaffold 步骤，允许额外依赖 build-scaffold」。行为正确，但「精确等于」在允许额外依赖时措辞已陈旧，排障时可能误导。归属：编排。

## 四、独立实测（本角色实际执行）

工作目录为工作树根；Node 绝对路径；关键计数与退出码如下，原始 stdout/stderr 见证据目录。

| # | 命令 | 退出码 | 实测结果 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck` | **0** | 无诊断（`tsc --noEmit`） |
| 2 | `node --test "test/门禁引擎/**/*.test.ts"` | **0** | **325 tests / 324 pass / 0 fail / 1 skip**；skip 为 `unreadable（权限）` Windows 平台用例 |
| 3 | `node --test "test/编排/team-plan.test.ts"` | **0** | **32 / 32 pass** |
| 4 | `node --test "test/桌面应用/acceptance-dispatch.test.ts"` | **0** | **67 / 67 pass**（含 delivered 去重新旧用例） |
| 5 | `node --test "test/桌面应用/**/*.test.ts"` | **0** | **640 tests / 640 pass / 0 fail / 0 skip** |
| 6 | `node --test "test/测试/governance-e2e-auto/*.test.ts"`（首跑） | **1** | **155 tests / 154 pass / 1 fail**（flaky，见下） |
| 7 | 同上（全量复跑 ×2） | **0 / 0** | **155 / 155 pass**（两次均） |
| 8 | 失败用例文件隔离复跑 | **0** | **10 / 10 pass** |
| 9 | `governance-trio.test.ts` 焦点 | **0** | **46 / 46 pass**（与提交自述一致） |
| 10 | `governance-standard-workflow.test.ts` 焦点 | **0** | **25 / 25 pass** |
| 11 | 独立 V11 行为探针（6 例） | **0** | 6/6 断言通过（含/不含 scaffold、未知 id、缺 contract-freeze、漏依赖角色、可选不强制） |
| 12 | 独立注册表结构对比（`182a631` vs HEAD） | **0** | 五角色 id/显示名/function/entries/preauthorizedDirs/forbiddenWritePaths/capabilities 全等；具名常量全等；仅 nominator/convener cardText 变化 |
| 13 | 独立 A8 卡文本/回执枚举探针 | **0** | 9 个回执 code 与 `tools.ts` 冻结枚举一致；既有自动验收门语句逐字保留；仅 Steward 卡定义该通道 |

**Flaky 记录（必须保留）**：e2e 首跑唯一失败为 `acceptance-triage-e2e.test.ts` 的 R2 `request_acceptance` 用例——首请求返回 `code=already-dispatched`（运行期去重），断言期望 `code=dispatched`。该文件隔离复跑 10/10、全量复跑两次 155/155 通过；该用例走 main `bda65f4` 已合入的应用通道，本批三笔提交未改该路径，失败形态属测试内「自动验收门先于显式请求派发」的时序竞争。**未将首跑失败计入通过**，也未用复跑掩盖其它失败（首跑无其它失败项）。

**与提交自述的差异**：作者称门禁 325（324 过/1 skip）、team-plan 32/32、trio 46/46、桌面 640/640，实测全部一致；治理 e2e 作者未给计数，本角色实测见上。

## 五、A1–A8 逐项结论

| 项 | 结论 | 核心证据 |
| --- | --- | --- |
| **A1** build-scaffold 前置与未 done 不派实现 | **PASS（卡文本+测试）**，确定性硬门有限（见 §六） | `governance-roles.ts` Convener 团队计划章节/基础设施先行第 4 步/流程模板/原则清单；Nominator 读计划与质量职责；`governance-standard-workflow.test.ts` 文件 25/25 过（含 2026-10-26 新用例）；`governance-trio.test.ts` 46/46 过 |
| **A2** 唯一构建配置 owner；专职基础设施角色不默认新增 | **PASS** | 卡文本明确 package/lock/tsconfig/vite/vitest/playwright/index.html/src/main.ts/构建 CI 根文件由唯一 owner 独占、其他角色只读；按五维/复杂度决定是否新增专职角色、不默认新增；单测逐字断言；结构对比显示注册表零变化 |
| **A3** 多步骤角色逐步骤交付检查点、脚手架独立交付 | **PASS** | Crew 卡「逐步骤交付检查点（必须，多步骤角色）」+ 外壳/工程角色模板：每步验证并标 delivered 回交、脚手架独立于 `delivery-app-shell`、附真实安装/编译/最小测试证据、「文件写了」不算 done；单测断言 |
| **A4** V11 放宽且其余约束不破、旧计划兼容 | **PASS** | `team-plan.ts:2865-2891`；V11 新增 3 用例（32/32）；独立探针 6 例：含 scaffold 依赖/不依赖均合法；无 scaffold 时依赖它仍报「多」；未知 id、缺 contract-freeze、漏依赖角色仍报错；无 scaffold 既有 flow 不回归；成环由 flow 静态解析拒绝 |
| **A5** delivered 唤醒按 stepId 去重 | **PASS（代码+测试）**；并发/失败回滚仅代码审查 | `interface.ts:4150-4263`；`acceptance-dispatch.test.ts` 新用例覆盖 revision-only 不重发、A→A+B 只报 B、重复集合不发、不同 flow 隔离、重启内存清空重发一次；旧用例覆盖 owner 活跃不抢跑、accepted/done 不收口 |
| **A6** 无权限/边界扩大 | **PASS** | 独立注册表结构对比：仅 nominator/convener cardText 变化，id/显示名/function/entries/preauthorizedDirs/forbiddenWritePaths/capabilities 与具名常量全等；无 i18n/配置改动；`governance-trio.test.ts`/`governance-standard-workflow.test.ts` 亦钉住 convener entries/preauthorized/capabilities 与内置五角色 id |
| **A7** 未验证项如实列出 | **PASS** | §六 |
| **A8** 完成即主动 request_acceptance 规则与回执处理完整 | **PASS** | Step 9 增「完成即主动提交」+ 专属章节；前置条件、`dispatched ≠ 验收通过`、`already-dispatched` 不重复、criteria/change-package/flow/runtime 各 code 如实处理、`unavailable`/超时用 `flow_get` 核对；9 个 code 与 `tools.ts` 冻结枚举一致；既有自动验收门语句逐字保留；仅 Steward 卡定义该通道；trio 46/46、标准工作流 25/25 过 |

### A5 细节（逐子项）

| 子项 | 结论 | 证据 |
| --- | --- | --- |
| revision-only 变化不重发 | PASS | 新用例 ①；既有用例改写断言「同集合 revision 变化：已通知步骤不重复派/提示」 |
| A→A+B 只发 B | PASS | 新用例 ②：第二条消息含 `verification-evidence`、不含 `integration-e2e`；既有用例还覆盖前缀同名 `verification-evidence-2` 不误判 |
| 重复集合不发 | PASS | 新用例 ③ |
| 不同 flow 隔离 | PASS | 新用例 ④（key = `projectRoot\0flowId`） |
| 重启语义 | PASS | 新用例 ⑤：内存集合清空后按当前状态再通知一次，之后仍去重；与代码注释一致 |
| 并发单发 | **代码审查 PASS；无注入用例** | `deliveredWakePendingSteps` 在第一个 `await` 前同步占位；并发路径读到 pending 即不发（`interface.ts:4190-4214`） |
| 失败不漏发 | **代码审查 PASS；无注入用例** | runtime 未解析/open 失败/send 失败/异常四条路径均 `rollback()`；`identitySeed` 用本批新步骤集合，重试同批同键（`interface.ts:4229-4253`） |

### A8 细节（逐要求）

- **主动提交**：Step 9 与专属章节都写明「全部实现/交付步骤核证 done + `verification-evidence` + change-package（含 `riskTier`）+ 验收标准存在 ⇒ 必须主动调用 `request_acceptance({flowId})`，不得等应用事件/客户催办/主理转达」。
- **边界**：不得提前提交、不得用提交代替缺步骤/缺证据；提交 ≠ 验收通过；不替 Proof/验收判定、不写客户决定；验收标准缺失交 Proof/验收补写（Steward 不写 `docs/acceptance/**`，与其边界一致）。
- **回执**：9 个冻结 code（`dispatched` / `already-dispatched` / `criteria-missing` / `change-package-missing` / `change-package-no-risk` / `flow-incomplete` / `flow-not-found` / `runtime-unresolved` / `unavailable`）全部覆盖，且与 `src/provider/runtime/tools.ts` 的 `REQUEST_ACCEPTANCE_CODES` 逐项一致（独立探针）。
- **与自动门幂等**：卡文本说明自动验收门仍可触发、已有在途/已派发返回 `already-dispatched` 不重复派发；应用实现 `requestAcceptanceForProject` 的 in-flight 去重与 `dispatchAcceptanceForFlow` 的 already-dispatched 分支与之对应（main `bda65f4` 既有能力，本批未改）。
- **未弱化既有规则**：自动验收门「所有变更（含非发布）…应用按验收门自动派 Proof / 验收」「Steward 不派发治理角色、不代替验收、不催办」「release 不是验收启动条件」逐字保留，独立探针断言通过。

## 六、残余风险与未验证项（A7 如实清单）

1. **运行中的 Electron 仍是旧代码**：本次验收**未重启**桌面应用。delivered 唤醒去重（`4d415db`）与主动 `request_acceptance` 卡文本（`ea0fff0`）在真实进程中的效果需重启/新会话后复核；当前证据是进程内测试与卡文本断言，不是真机复现。城堡项目（castle-2d-game-v1）现场行为不在本批范围，未在真实项目重放。
2. **真实模型对卡文本的遵从未实测**：A1–A3、A8 的约束载体是角色卡（提示词数据）；单测只钉「文本存在且与实现口径一致」，不能证明真实 Steward/Crew/模型会话必然按新卡执行。需真实会话/模型样本才能声称行为合规。
3. **A5 并发单发、失败不漏发没有专门测试**：仅有代码审查（占位先于 await、各失败路径回滚）。若后续改动该段，回归风险仍在；建议补并发触发与 open/send 失败注入用例（归属：桌面窗口）。
4. **A1 的硬门强度有限**：`build-scaffold` 的「必须有、未 done 不派实现」目前是**卡文本要求 + 通用 `dependsOn` 派发门**；应用没有「含代码/测试计划缺 `build-scaffold` 即拒绝 appointment 卡」的确定性校验，V11 也把 `build-scaffold` 依赖定为可选。若客户要硬门，需另行实现并验收。
5. **V11 诊断文案陈旧**：允许额外依赖 `build-scaffold` 时 message 仍写「必须精确等于…」，行为无误但措辞误导（归属：编排）。
6. **平台覆盖**：仅在 Windows 11 x64 + Node v24.22.1 实测；1 例 chmod/权限用例为 Windows 平台跳过。macOS/Linux 未验证。
7. **e2e 一例并发 flaky**：`acceptance-triage-e2e.test.ts` R2 首跑出现 `already-dispatched` 期望不符，隔离与两次全量复跑通过；该用例属 main 既有 `request_acceptance` 通道（测试归属：测试），与本批三笔提交无代码关联，但会污染全量重复运行的稳定性。
8. **三笔提交缺少责任角色的 change 记录**：仓库中没有 2026-10-26 由门禁引擎/编排/桌面窗口撰写的变更记录（`角色卡/*/docs/change/` 最新分别为 10-23、10-25、10-25），与项目既有「每个角色写自身变更记录」的流程要求有缺口；不影响本次行为判定，但影响后续追溯。
9. **主动提交的端到端真实联动未验证**：`request_acceptance` 工具面在 `acceptance-dispatch.test.ts` 有 67/67 通过（含超时/不可用/发阶段超时），但真实 Steward 会话在真实流程中「完成即提交」的端到端链路（含分诊路由）未在本批实测。

## 七、返工归属与后续动作

本批**无强制返工项**（无 FAIL）。条件/建议项归属如下：

| 项 | 归属 | 说明 |
| --- | --- | --- |
| 重启桌面应用后复核 delivered 去重与主动提交真机行为 | 协调 / 桌面窗口 | 本角色未获重启授权；重启后应确认不再出现同一 stepId 的重复核证任务 |
| 补 delivered 唤醒并发/失败注入测试（建议，非阻断） | 桌面窗口 | 现仅代码审查；`interface.ts:4150-4263` |
| V11 诊断文案改为「至少包含…并仅可额外包含 build-scaffold」 | 编排 | 仅 message 文案，无行为影响 |
| 三笔提交的角色变更记录 | 门禁引擎 / 编排 / 桌面窗口 | 经 Steward/协调补齐；不改变本结论 |
| e2e R2 并发 flaky 加固（建议） | 测试 | 首跑失败日志已保留；隔离与两次全量复跑通过 |
| 若客户要求「缺 build-scaffold 计划硬拒」的确定性门 | 门禁引擎 / 编排（新任务） | 现有范围是卡文本 + V11 允许性；硬门不在本批实现内 |

## 八、结论

**有条件通过。** 三笔提交的实现与卡文本一致、范围干净、未弱化测试与既有规则；A1–A8 全部有可复核证据且无 FAIL。条件为 §六 的未验证项，主要是：**运行中 Electron 未重启，真机行为待复核**；**A5 并发/失败回滚仅有代码审查**；**真实模型对卡文本的遵从未实测**。在完成重启后真机复核前，本结论不得被引用为「真机效果已验证」。

本报告链接的证据：[`00_candidate-and-commands.md`](2026-10-26_scaffold-governance-and-wake-dedupe-evidence/00_candidate-and-commands.md) 及同目录 `01`–`10` 原始日志/探针。
