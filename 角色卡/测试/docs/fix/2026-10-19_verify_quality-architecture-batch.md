---
id: quality-architecture-batch-independent-verification
type: fix
title: 工程质量基线 + 架构要求等六批未提交改动全仓独立复核（测试角色）
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: verified
related: [engineering-quality-baseline, architecture-requirement, all-roles-shell-approval, write-confirm-preview-completeness, shell-judge-concurrency, flow-step-status-normalization]
events:
  - date: "2026-10-19"
    kind: created
    summary: 对工作树六批未提交改动（写盘 preview 完整性闸、shell 判断有界并发池、五角色 shell 审批档、流程单状态首词/显式 stepId、工程质量基线+真实启动演示、架构方案/影响分析）做全仓回归与跨角色一致性只读核对：全量 3064/3058 pass/4 fail/2 skip；4 红经 git archive HEAD（6d40eee）复跑逐一确认为 HEAD 既有（新增红 0）；typecheck exit 0；五角色审批档三处一致、基线副本逐字一致；README 架构条为概述非逐字（登记）
---

# 工程质量基线 + 架构要求等六批改动：全仓独立复核

## 结论

- 复核对象为工作树中积累的六批未提交改动，覆盖门禁引擎、编排、桌面窗口/桌面应用、运行时核心、装配与 README：
  1. 写盘确认卡 preview 完整性闸（编排 `confirmed-writes.ts` / 运行时工具适配）；
  2. shell 判断器单飞 → 有界并发池（`shell-judge.ts`）；
  3. 五个内置治理角色统一 shell 审批档（门禁引擎角色卡 + 桌面接线 + 编排装配 + README）；
  4. 流程单状态首词解析与显式 stepId 列（桌面 `governance-advance.ts` + 编排判断 `governance-judge-facts.ts`）；
  5. 工程质量基线 + 验收前真实启动演示（门禁引擎角色卡、编排提示、桌面验收任务、README）；
  6. 架构方案/架构影响分析要求（门禁引擎、编排 judge/提示、桌面验收任务、README）。
- **全仓** `node --test "test/**/*.test.ts"`：**3064 计 / 3058 过 / 4 红 / 2 skip / 0 cancelled / 0 todo**，退出码 **1**（27.85s）。相对上一批全仓 3050/3044/4/2：**+14 tests、+14 pass，失败与跳过数不变**，与本批新增用例规模一致，**本批新增红 0**。
- 4 红经 `git archive HEAD`（6d40eee）干净基线**逐条复现**（33 计 / 29 过 / 4 红 / 0 skip，失败签名逐字相同），全部为 HEAD 既有、与本批无交集；四个测试文件及其钉住的产品文件在工作树中均未被本批修改。
- `npm run typecheck`：**exit 0，0 错**。
- 跨角色一致性核对通过：基线两副本**逐字一致**（各 11 行，程序化比较 `identical:true`）；五张治理角色卡均含质量基线 + 架构职责 + 审批档行 + 「你的质量职责」段；编排提示 single/su 三个返回分支与 trio 分支均追加基线与架构要求；桌面验收任务五项硬要求齐备；五角色 shell 审批档在能力矩阵/编排装配/桌面接线三处一致。
- 唯一登记项：README 质量基线列表**未逐字包含**「架构与可扩展性」基线条，而以独立小节概述（内容覆盖主要要求，省略「无环/兼容弃用/回滚/新增状态·角色·导出格式·统计维度」等细节）。属表述层差异，无功能冲突；只登记，不越界修改。
- 本角色本批**未改任何测试或产品文件**（四个红均非本批行为变更，按任务口径不更新夹具）；未 git 提交；未读 `.env`、未跑真实模型、未启动 Electron。

## 1. 冻结绑定

| 项 | 值 |
| --- | --- |
| 仓库 | `/Users/wangzhongren/code/vibeingcode/解压/ans-runtime` |
| HEAD | **6d40eee6ea0a84ecbad6884141bfe75e28e90a5a**（`main`，`fix: 推理强度恢复下拉并显示中文档位`） |
| 工作树快照 | **82 条**（58 M + 24 ??）；tracked diff **58 文件 / +2053 / -285**；核对期间其他角色上下文可能继续写入，本记录只绑定下述哈希快照 |
| 快照哈希 | `git status --porcelain \| sort` → `27b7127ac5b0ad54d1b7d666527c1149f968824f7a1b2c0b743c05badba8de36`；`git diff` → `6d2190b17b3be3e8484fdc358bfdf9a3104180da7014996f4eeeb25a00204c51`；`git diff` + 24 个 untracked 文件全文 → `0f76c88dd82ade49ff508a7deb49e3c867fc9258bb80b6a4999daf1e323ace3f` |
| 干净基线 | `git archive HEAD \| tar -x -C /tmp/ans-head-baseline-6d40eee`，符号链接本仓 `node_modules`（Node 解析与工作树一致） |
| 本角色本批改动 | 无（仅本记录与 `changelog.md` 追加） |

关键文件 sha256（本机实测，供后续判断工作树是否漂移）：

| sha256 | 文件 |
| --- | --- |
| `cc4d7e46a725ebca2852406ce839e9e408eadd7bbcded99596d2fcf8cbefe2fa` | `src/common/门禁引擎/governance-roles.ts` |
| `110e41dcaa7d0bb8aafe9a021c5f4f257719829713f82d40fa8094f14470cdf5` | `src/pipeline/orchestration/govern-session.ts` |
| `cd1fcf66186c9cc8f38331ab81977cde56d84e269b3752520817ed3afa067d0e` | `src/pipeline/orchestration/run-role.ts` |
| `fe1278b6fd393d3d068cd78f59fda711fe595d162369af6c74efdade85ddba12` | `src/pipeline/orchestration/shell-arming.ts` |
| `4d876ff0c58bc6c48664cb4220de693807afab3417fb6c5f212f9b54b780a4cc` | `app/desktop/governance-advance.ts` |
| `7eef478731555f3a2d7020a0c12b2ce095069e3d72121ae6884b642b0b1fb1ac` | `app/desktop/session.ts` |
| `87cd98fe52d814f52bdaa7c6c3dcdff5bd93194355e152212138029b1d0e7109` | `app/desktop/interface.ts` |
| `19ce3ec08a41b787291d8aebdc55af73d066add9da58096bef5ccf4d7281a722` | `app/main.ts` |
| `4073fb14158107a8d1b409f3e41e84b8d6633198dd8f240184f1029511e85589` | `README.md` |

## 2. 环境与口径

| 项 | 值 |
| --- | --- |
| 平台 | Darwin 25.6.0（arm64 macOS） |
| Node | **v24.14.0**（`node --test` 原生收集 `test/**/*.test.ts`，含 2 个 untracked 新文件） |
| 全仓命令 | `node --test "test/**/*.test.ts"`（工作树；输出 `/tmp/ans-fulltest-20261019.log`，末行 `EXIT=1`） |
| 类型检查 | `npm run typecheck` → `tsc --noEmit`，`EXIT=0` |
| 干净基线复跑 | 仅 4 个红文件：`node --test test/桌面应用/runtime-ui.test.ts test/测试/g2-verify/u1-renderer.test.ts test/测试/g5-reasoning-verify/g-desktop.test.ts test/测试/t29-pi-config-roundtrip.test.ts` → 33/29/4/0，`EXIT=1` |
| 本批定向套件 | `confirm-preview-completeness`、`shell-judge-concurrency`、`governance-trio`（门禁）、`governance-judge`、`governance-session`、`operator-wiring`、`governance-trio-verify/a,b`、`governance-liaison-verify/a`、`governance-e2e-auto/i` → **189/189 过 / 0 红 / 0 skip** |
| 未做 | 未读 `.env`、未跑真实模型或网络、未启动 Electron、未 git 提交/推送 |

## 3. 全仓计数

| tests | pass | fail | skipped | cancelled | todo | duration | exit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **3064** | **3058** | **4** | **2** | 0 | 0 | 27852ms | **1** |

- 对比上一批（全角色 shell 审批档后）：**3050 / 3044 / 4 / 2** → 本批 **+14 tests、+14 pass、fail/skip 不变**。
- 2 skip 均为平台条件用例：`test/门禁引擎/...`「Windows 反斜杠路径也识别为角色边界文件（平台条件）」与「规范化：Windows 大小写不敏感（仅 win32）」，非本批引入。

## 4. 逐红判定

四个红在工作树与干净 HEAD 上**失败签名逐字相同**（test 名与 AssertionError 文案一致），且四个测试文件与其钉住的产品文件均不在本批 82 条变更中（`git status --porcelain -- <file>` 为空）。判定：**全部 HEAD 既有，本批新增回归 0**。按任务口径不更新夹具/断言（非本批行为变更），登记给对应属主另批同步。

| # | 测试（位置） | 失败断言 | 实际成因（HEAD 既有提交） | 判定 |
| --- | --- | --- | --- | --- |
| 1 | `test/桌面应用/runtime-ui.test.ts:65`（断言 :69） | `doesNotMatch(renderer, /localStorage\|sessionStorage\|node:fs\|require\("fs"\)\|import\(/)` | `renderer.js` 为左栏宽度/折叠持久化使用 `window.localStorage`（`923206f feat: 左树角色分组折叠` 引入）；测试的「整文件禁用 localStorage」是旧不变量，未随该功能更新 | HEAD 既有；无本批交集；不改 |
| 2 | `test/测试/g2-verify/u1-renderer.test.ts:96`（断言 :100） | 期望源码含 `inj.label + (inj.sourceRoleId ? " · 来自 " + inj.sourceRoleId : "")` | `renderer.js` 现先经 `displayNameOf(roleById(inj.sourceRoleId))` 解析来源显示名（`be3ab2c fix: 聊天与右侧标题使用治理角色显示名`），原精确串不再存在 | HEAD 既有；无本批交集；不改（本角色目录内，建议另批同步） |
| 3 | `test/测试/g5-reasoning-verify/g-desktop.test.ts:65`（断言 :69） | 期望旧单行 `choices.map(function (c) { return '<option value="' + esc(String(c)) + '">' + esc(String(c)) + "</option>"; })` | `renderer.js` 现为 `choices.map(function (c, index) { ... choiceLabels[index] ... })`：option 文本用中文档位标签、`value` 保留 raw 值（`ff6dcbf`/`6d40eee` 推理强度控件改造） | HEAD 既有；无本批交集；不改（本角色目录内，建议另批同步） |
| 4 | `test/测试/t29-pi-config-roundtrip.test.ts:273`（断言 :286） | 期望错误含 `off / low / medium / high / xhigh` | `runtime-config.ts` 现按字段标签输出「推理强度取值无效：仅接受 关 / 低 / 中 / 高 / 极高（或留空维持平台默认）。」，中文档位标签由 `ff6dcbf`/`6d40eee` 引入（错误文案机制源自 `204d306`） | HEAD 既有；无本批交集；不改（本角色目录内，建议另批同步） |

复现证据：

- 工作树：`/tmp/ans-fulltest-20261019.log`，`ℹ tests 3064 / pass 3058 / fail 4 / skipped 2`，四个 `✖` 名称同上。
- 干净 HEAD：`/tmp/ans-head-baseline-4red.log`，`ℹ tests 33 / pass 29 / fail 4 / skipped 0`，四个 `✖` 名称与 AssertionError 逐条相同。
- 未放宽任何断言；本角色未改 `test/测试/**` 任何文件。

## 5. 跨角色一致性核对（只读）

### 5.1 基线两副本逐字一致 ✅

- 门禁引擎 `src/common/门禁引擎/governance-roles.ts:136` `ENGINEERING_QUALITY_BASELINE` 与编排 `src/pipeline/orchestration/govern-session.ts:528` 同名副本：程序化抽取数组字面量比较，**各 11 行、`identical: true`**（10 条基线条 + 标题行；含「架构与可扩展性」条）。
- 两处注释均明确「改文案须两处同步」；编排未跨层导入门禁引擎私有常量（分层约束保持）。

### 5.2 五张治理角色卡 + 编排提示 ✅

- 运行时导入 `BUILT_IN_GOVERNANCE_ROLES` 逐卡核验（liaison/rapporteur/nominator/convener/verifier）：`baseline=true`、`arch=true`、`shell 审批档行=true`、`你的质量职责=true`，五卡全中。
- 五卡能力位 `shell` 均为 `"operator-approve"`（`governance-roles.ts:497/527/564/596/631`）；旧 su `LEGACY_SU_CAPABILITIES.shell` 同为 `"operator-approve"`（:659）。
- 五卡架构职责分别落位：Lead 不替客户决定架构、只把演进诉求写入 acceptance（:191）；Draft 必须含「架构方案」/「架构影响分析」且缺章节不得建议 accept、提案卡内容必须含该章节（:252-253）；Crew 写区与架构模块一一对应且禁止重叠（:327）；Steward 流程/派发引用架构模块与边界并含 contract-freeze 与集成/端到端步骤（:396-397）；Proof 核对实现与架构声明一致、缺章节或偏离不得 accept（:447-448）。
- 编排提示 `buildGovernPrompt`（`govern-session.ts:588`）：single/su 三个返回分支均追加 `ENGINEERING_QUALITY_BASELINE + ENGINEERING_QUALITY_STAGE_REQUIREMENTS + ARCHITECTURE_EXTENSIBILITY_REQUIREMENTS`；trio 返回在角色纪律后追加 `ENGINEERING_QUALITY_BASELINE + ARCHITECTURE_EXTENSIBILITY_REQUIREMENTS + SHELL_APPROVAL_PROMPT_LINE`（:609、:641-655）。两套要求（质量/架构）在两类提示中均在场。

### 5.3 桌面验收任务 ✅

- 函数级核验 `app/desktop/governance-advance.ts:221 buildAcceptanceTaskMessage(flowId, evidence)`：输出含五项硬要求 `①②③④⑤`，关键字检查全部为真——工程质量基线、真实启动应用并向客户演示、未演示/无证据不得建议 accept、证据写入 `docs/verification/<flowId>-v1.md`、按「架构方案或架构影响分析」核对实现。
- ① 列举 8 个质量维度（正确性/健壮性/安全/可维护性/可观测性/性能/前端可访问性/测试矩阵）；架构由 ⑤、交付与演示由 ②③④ 覆盖，与基线 10 条语义闭合，无缺口。

### 5.4 五角色 shell 审批档三处一致 ✅

- **能力矩阵**：`governance-roles.ts` 五角色 `shell: "operator-approve"`（su 同档，见 5.2）。
- **编排装配**：`run-role.ts:1055-1066` 以能力位而非角色 id 守卫——`input.shellOperatorOnly` 存在且 `cap?.shell === "operator-approve"` 才 `assembleOperatorShellGate`；冲突/能力不符记诊断且不 arm（fail-closed）。审批档提示文案在 `govern-session.ts:507 SHELL_APPROVAL_PROMPT_LINE`，single/su 与 trio 均追加。
- **桌面接线**：`app/desktop/session.ts:1747-1762` 对 `role.builtIn === true`（su + trio 五人）用**同一份** `(c)` 实件（`deps.shellArming.classifyShell/rules`）+ `(a)` 通道（`shellOperatorChannel`）装配 `shellOperatorOnly`；缺件不传、不 arm。`app/main.ts:415/489/621` 同处提供两件并注明单一来源。
- 三处口径一致：只读白名单直放（0 卡），risky/review/deny 逐条客户/判断 agent 审批，拒绝/超时/通道不可用一律不放行；审批不改变写边界。角色卡文案与编排提示措辞不同但语义相同（源码注释互指，未跨层导入）。

### 5.5 README 与角色卡/提示口径 ⚠️（登记 1 项表述差异）

- 一致项：README「所有角色都具备 shell 能力」（:75）与五卡/编排提示一致；「工程质量基线与验收演示」（:82-102）覆盖默认生产级、原型档需客户明确选择、真实启动演示为硬要求、Proof 逐条核对与不得建议 accept。
- 程序化比对：README **逐字包含**基线全部 10 行非架构条目（10/10）；**未逐字包含**「架构与可扩展性」基线条——README 以独立小节「架构与可扩展性（同一基线的组成部分，提案与验收都核对）」概述，覆盖模块分解/依赖方向/数据流/扩展点/schema 与 API 版本迁移/横切关注点/权衡，但省略「无环」「兼容/弃用」「回滚」「新增状态/角色/导出格式/统计维度」等细节，且加入「权衡」措辞。
- 判定：内容方向一致、无功能冲突；属**表述层差异**（README 非逐字副本，也未声称逐字）。若要求 README 与常量逐字一致，需装配/README 属主另批统一。只登记，未修改。

### 5.6 附加核对：流程状态首词/显式 stepId（本批第 4 项）✅

- 桌面 `app/desktop/governance-advance.ts:88 normalizeFlowStepStatus` / `:103 parseFlowStepStatuses` 与编排 `src/common/编排/governance-judge-facts.ts:289 normalizeFlowStepStatus` / `:318 parseFlowSteps` 的首词正则（`/^[^\s（(：:]+/`）、大小写处理、显式 id 列表头（`stepId/step-id/步骤id/id` 优先）、单元格剥离与分隔行处理**同规则**；两侧注释互指「成对同步」。
- Steward 卡内 canonical 流程单模板为 `| stepId | 步骤 | 状态 |`（`governance-roles.ts:371`），与派发门禁 `parseFlowStepIds`（首格为步骤 id）约定一致。

## 6. 残余风险

1. **四个 HEAD 既有红仍在**（见 §4）：均为测试侧源码钉落后于 HEAD 已提交的 UI 展示变更（localStorage/显示名/中文档位）。它们使全仓无法全绿；其中 3 个位于 `test/测试/**`（本角色白名单），但因非本批行为变更、按任务口径未改，建议另开批次同步（本角色可承接 g2/g5/t29；`test/桌面应用/runtime-ui` 属桌面属主）。
2. **架构门槛不是机械文本匹配**：编排 judge 的确定性底线是 `proposalPath` 必须在 requiredReadPaths 且实际读过全文；「架构章节缺失 ⇒ manual」依赖判断 agent 按 rubric 自报（`governance-judge-verdict.ts:333-338` 注释明确不做标题/关键词机械匹配以避免长文误伤）。模型未遵守 rubric 时可能漏判，客户/Proof 仍是最后防线。
3. **「真实启动演示」为行为约束**：`evaluateAcceptanceCompletion` 只机械核对流程步骤 done、每步有 `dispatch.accepted`、无未结算决定/未闭环澄清、账本可读，**不核对**演示证据是否存在或真实；演示证据可伪造，依赖 Proof 核对与客户验收。
4. **架构模块 ↔ 角色写区一一对应无机械检查**：门禁层不解析提案架构章节与 `boundary.yaml` 的模块对应关系，仅靠 Draft/Crew/Proof 提示与人工核对。
5. **shell 副作用不受文件写入门禁约束**：审批链是唯一控制（角色卡/README 已披露）；批准后的命令可写到项目外，`allow` 白名单命令免审批，审计为 best-effort（上一批复核已登记，本批未改变该面）。
6. **README 架构条非逐字**（见 §5.5）：若后续要求文档与常量逐字同步，需在 README 属主批次处理。
7. **工作树为多角色并行在途状态**：本记录绑定 82 条变更快照与 §1 哈希；其他上下文继续写入后计数/哈希可能漂移，复验时以哈希比对。

## 7. 结论

- 六批未提交改动在测试角色视角**未引入新回归**：全仓 3064/3058/4/2（新增红 0），本批定向套件 189/189，typecheck exit 0。
- 四个红全部经干净 HEAD 复跑确认既有，且失败签名与工作树逐字相同；本批未修改它们钉住的产品文件。
- 跨角色一致性五项核对通过，仅 README 架构条存在非逐字表述差异（已登记，未越界修改）。
- 本角色未改产品代码与其他角色文件，未 git 提交。建议：归档前由对应属主另批处理四个 HEAD 既有红与 README 逐字同步（如需要）。
