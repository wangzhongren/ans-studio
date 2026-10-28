# 变更包：批次 A —— 角色集与注册表（entry-role-minimal；rework 版）

- **任务 ID**：`2026-10-28-entry-role-minimal`｜**批次**：A（角色集与注册表；身份层）｜**档位**：T3
- **记录角色**：实施执行者（门禁引擎/运行时核心/编排/桌面窗口/桌面UI/项目管理写集）｜**日期**：2026-10-28
- **候选**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\entry-role-minimal`，分支 `feat/entry-role-minimal`，基线 main `8fc673e23fb192793455ea0a6d50df21a3a854e0`。
- **提交（本地，不 push/不合并 main）**：首提交 `f4aa073a7032d35afc2e964dc22b4d171f1d26dc`（父 `8fc673e`）；rework 提交见 §六（追加提交，不 rebase/不 amend）。
- **依据（现行版本）**：
  - 方案 v9.2：`docs/planning/2026-10-28_design_entry-role-product-builtin.md`（1372 行，`300ad63c…`）。
  - 团队计划：`docs/scheduling/2026-10-28-entry-role-minimal-team-plan.md`（710 行，`08967531…`）+ 闸门 2 amendment-1：`docs/scheduling/2026-10-28-entry-role-minimal-gate2-amendment-1.md`（117 行，`5a4dd423c8b9fc2d7ba570bef744efe0f93175d4003aaeebdbf8df0983b9d417`）。
  - **实施前验收标准 v1.1**：`docs/acceptance/entry-role-minimal-criteria-v1.md`（**295 行**，SHA-256 `0bcfe1ea339c007d391c99d5eb245c8199667758b36092825c7df227f49a3130`；含 A-04a 与批次 A 修订记录；取代 v1 285 行 `02b4885f…` 的批次口径，终态不变）。
  - 闸门 2 确认记录：`docs/communication/2026-10-28_intent_entry-role-product-builtin.md` 末节（173 行，`7bbdbe995bf9fbf922304cab5b0b9bc7d676138e11b8ca458b8311fc0fa14273`）。
  - **闸门 2 amendment-2（已落盘）**：`docs/scheduling/2026-10-28-entry-role-minimal-gate2-amendment-2.md`（110 行，SHA-256 `8d5ddeb5d45690d34ac5ef9031cae80768f47b8e07ecd37685d61e940395aaae`）——书面授权三个写集外最小 shim（`src/service/boundary/resolve-boundary.ts`、`src/pipeline/orchestration/govern-session.ts`、`app/desktop/project.ts`），并澄清 F5 运行期只读别名与 F2 product/chief 写区口径。
  - 独立验收 A 批报告（rework）：`docs/acceptance/entry-role-minimal-a-acceptance-report-v1.md`（168 行，`7cd3dfbf…`）；本版按 F1–F7 逐项返工。
- **状态**：候选已返工并本地验证；**未 push、未合并 main、未发布**；交独立验收复审。

---

## 一、改动清单（按层；rework 版）

| 层 | 文件 | 改动 |
| --- | --- | --- |
| 门禁引擎 | `src/model/role.ts` | `GovernanceFunction` 扩为 `chief/product/proposal/nomination/schedule/verification`；旧 `liaison` 仅 `@deprecated` 编译期 + 运行期只读别名（D 删除；amendment-2 §2.2）；注释/主入口说明改六角色。 |
| 门禁引擎 | `src/common/门禁引擎/governance-roles.ts` | 六角色注册表（chief→product→rapporteur→nominator→convener→verifier；显示名幕僚/产品/策划/人事/运营/质检）；新增 `CHIEF_CARD_TEXT`/`PRODUCT_CARD_TEXT`（**A 批现状表述 + B/C/D 生效标注**，F7）；旧 `liaison` 改为不进入数组的只读别名；**F2 返工（amendment-2 §2.3）**：product 的 Section 1/预授权承接旧 liaison 现行值 `docs/intents/`（`docs/product/` 目标写区 D 生效）；chief 的 `forbiddenWritePaths` 恢复为基线 liaison 逐字清单（不提前扩张目标写区）。 |
| 门禁引擎 | `src/service/role/resolve-role.ts` | `listProject` 枚举六角色、`primaryRoleId="chief"`；`resolveGovernanceRole` 六角色解析；旧 `liaison` 按显式 roleId/function 解析只读别名（不进入列表）；错误文案列六角色。 |
| 门禁引擎（amendment-2 §2.1 授权） | `src/service/boundary/resolve-boundary.ts` | **仅**新增 `DeprecatedLiaisonRoleSpec`/`GovernanceRoleSpec` 类型 re-export（+2 行，无运行期行为）。 |
| 编排 | `src/pipeline/orchestration/run-role.ts` | 六角色 `TRIO_CARD_KINDS`（chief=intent-confirm、product=占位空、其余旧值）；主入口 chief 承接旧 liaison 的 intent-confirm/交接/coordinate（内部仅做旧字面值归一，行为不变）；旧 ledger `power` 保持 `liaison`/`project` 审计标签；**未新增** chief 新能力（B）、**未移除** convener 旧 dispatch（D）。 |
| 编排（amendment-2 §2.1 授权） | `src/pipeline/orchestration/govern-session.ts` | `GOVERNANCE_FUNCTION_LABEL` 增加 chief/product（类型 shim）；`governanceFunctionDiscipline` 增加 chief/product 两段 **A 批现状 + B/C/D 生效标注**（F7）；类型放宽为 `GovernanceRoleSpec`；既有角色文案/行为不变。 |
| 桌面窗口 | `app/desktop/session.ts` | 主入口/协调者按角色列表解析（chief 优先、旧 liaison 回退）；`canLiaise` 接受 chief；旧 liaison 会话按注册表只读别名合成展示条目（不进列表/不新增状态）；coordinate 门沿用旧 liaison 字面值。 |
| 桌面窗口（amendment-2 §2.1 授权） | `app/desktop/project.ts` | trio 下把旧 `liaison` 登记进 `builtInRoles`（只读别名，允许存量旧会话开会话；不进 `roles`/列表；D 删除）。 |
| 桌面UI | `app/renderer/src/chat/role-view.ts`、`judge.ts`、`governance-view.ts` | 六角色映射（chief/product 新增，liaison 删除）；roleIntro/judge roleName 同步。 |
| 项目管理 | `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` | 新增 `ui.role.governance.chief/product.*`、`ui.governance.roleIntro.chief/product`、`ui.judge.roleName.chief/product`；删除 liaison 对应 key；flow/triage/gate/ledger key 留 D。 |
| 测试（A 写集重写） | `test/门禁引擎/{governance-trio,list-project,liaison-role}.test.ts`；`test/桌面UI/{role-view,judge,i18n-b1-b2}.test.ts`；`test/项目管理/shared/i18n.test.ts`；`test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts`；`test/测试/t9-block1-bootstrap.test.ts`；`test/桌面应用/genesis-bootstrap.test.ts` | 六角色/主入口/显示名/能力/写区/UI/i18n 断言；`liaison-role.test.ts` 退役为 chief/product 覆盖（断言 93→96，见 §3.3）；F2 后同步 product 当前写区断言。 |
| 测试（amendment-1 最小断言同步） | `test/门禁引擎/{customer-card-rules,gate-review-flow-busy,governance-standard-workflow,requirement-change-cards,screenshot-only-evidence,verifier-artifact-report,view-image-cards}.test.ts`；`test/测试/governance-liaison-verify/{a-roles-writes-caps,b-intent-handoff,c-clarification}.test.ts` 与 `fixture.ts`；`test/测试/governance-trio-verify/c-migration.test.ts`；`test/测试/governance-e2e-auto/{i-full-chain,acceptance-triage-e2e,k-governance-feedback,l-crew-write-validation,m-lead-internal-choice,s-acceptance-rework-routing,t-gate-review-return-routing}.test.ts` | 仅角色集/主入口/显示名/列表/能力矩阵与「主入口系统行接收角色」断言；逐文件断言数见 §3.3。 |
| 属主变更记录（P7；rework 补） | `角色卡/{门禁引擎,编排,桌面窗口,桌面UI,项目管理,测试}/docs/change/2026-10-28_change_entry-role-minimal-A.md` | 各属主批次变更记录（改动/验证/证据/回滚）。 |

**零改动核对**：`package.json`/`package-lock.json` 零改动；未新增依赖；未改 `src/model/runtime.ts` 的 cardKind/卡组；未改主检出、refactor-b1、gate-review-flow-busy、目标项目/演示；未新增仓库目录（属主 change 记录文件落在既有 `docs/change/` 目录）。

### 1.1 目标写区（A-04 目标态，D 生效；本批不切换）

| 角色 | 目标写区（D） |
| --- | --- |
| chief | `docs/intents/`（可选） |
| product | `docs/product/` |
| rapporteur | `docs/proposals/`、`docs/contracts/` |
| nominator | `角色卡/`、`docs/skills/`、`docs/mcp/` |
| convener | `docs/scheduling/`（去 dispatch） |
| verifier | `docs/quality/`、`docs/verification/`（可选） |

---

## 二、结构快照（当前旧态 + 目标态；A-04a）

| 顺序 | id | 显示名 | 职能 | 当前 Section 1 / 预授权（A 实测） | 当前能力位（A 实测） | 目标态（D/B 生效） |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `chief` | 幕僚 | `chief` | `docs/intents/`（承接旧 liaison） | customerInput/handOffIntent/dispatchTask（旧 coordinate）；roleStatus/sessionTail/proposeRecovery=false；shell 审批档 | 新 dispatch/role_status/session_tail/role_activity_log 在 **B**；目标写区 `docs/intents/`（可选）D |
| 2 | `product` | 产品 | `product` | `docs/intents/`（承接旧 liaison 现行值） | 全部 false（customerInput=false）；shell 审批档 | 写区 `docs/product/` **D**；申请线 C；星形汇报 B |
| 3 | `rapporteur` | 策划 | `proposal` | `docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/` | requestClarification；shell 审批档 | 写区 proposals+contracts **D** |
| 4 | `nominator` | 人事 | `nomination` | `角色卡/`、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` | installSkill/installMcp；shell 审批档 | 写区 角色卡+skills+mcp **D** |
| 5 | `convener` | 运营 | `schedule` | `docs/flows/`、`docs/workflow.md`、`docs/scheduling/`、`docs/governance/convener/` | dispatch/roleStatus/sessionTail/proposeRecovery（保留至 D）；shell 审批档 | 写区 `docs/scheduling/`、去 dispatch **D** |
| 6 | `verifier` | 质检 | `verification` | `docs/acceptance/`、`docs/verification/`、`docs/governance/verifier/` | 无附加能力；shell 审批档 | 写区 quality+verification（可选）**D** |

- `listProject`（新空项目）：`primaryRoleId="chief"`；六角色顺序稳定；`liaison`/`su` 不枚举；product 的展示边界承接旧 liaison 现行写区 `docs/intents/`。
- 旧 `liaison`：编译期 + 运行期只读别名（**F5**，amendment-2 §2.2）——`governanceRoleOf("liaison")`/`resolveRole("liaison")`/显式 `resolveGovernanceRole` 仍返回基线卡文本/边界/能力，桌面可开旧会话；**不进入** `BUILT_IN_GOVERNANCE_ROLES`/列表/UI/i18n/六角色能力矩阵，D 删除。amendment-2 澄清允许该只读兼容。
- 渲染层/shared i18n：`rg "liaison"` 零命中（A-05）。
- 保留 id：`角色卡/chief|product|liaison|su/` 项目目录被跳过并警告；`roles` 映射不得遮蔽内置角色。

---

## 三、验证（2026-10-28，worktree 内）

### 3.1 命令与结果

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 依赖 | `npm ci`（锁文件）＋ `node node_modules/electron/install.js`（取 Electron 二进制，仅 node_modules） | exit 0 |
| 全量测试 | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')` | **见 §3.2** |
| 主 typecheck | `npm run typecheck` | exit 0 |
| 渲染 typecheck | `npm run typecheck:renderer` | exit 0 |
| 渲染构建 | `npm run build:renderer` | exit 0（产物不入候选） |
| 真实 Electron（**F6：临时夹具项目**） | `ANS_E2E_PROJECT=<临时夹具：仅 角色卡/桌面窗口/ >`、`ANS_E2E_OUTDIR=<临时>`、`node_modules/electron/dist/electron.exe test/桌面应用/e2e/main.mjs` | **exit 0；`E2E_PASS=true`；`E2E_DONE=1`；`E2E_FAILURES=` 空；`PROJECT=<%TEMP%>\ans-e2e-a5-fixture-4isC`；`ROLE_COUNT=2`；`PRIMARY_ROLE_ID=su`（single 夹具）；`BOOTSTRAP_PRIMARY=chief`；16/17 截图（00-titlebar 捕获偶发 `UnknownVizError`，环境性；其余 16 张 1360x860）**；最终候选报告 `%TEMP%\ans-e2e-a5-out-UrDy\report.txt`（sha256 `20ea7880cfcd53e4713b6280e53e3a1779a1c49f696b466358b58b099d802734`）；canonical C2 17/17 截图证据仍为 `%TEMP%\ans-e2e-a2-out-Xoxa\report.txt`（`973c7d70…`，逐图 sha256 见 §六） |
| 结构检查 | 注册表/列表快照、`rg`、`git diff --name-only`、`package.json` 零改动 | 通过（§二/§六） |

> 说明：首提交 `f4aa073` 的 Electron 证据曾以 worktree 作为导入项目（验收 F6 指出）；本返工版按 P3 改为**临时夹具项目**重跑，夹具在 `%TEMP%`、未指向仓库/目标项目/演示，报告与 17 截图见 §六。两轮均 `E2E_PASS=true`；以夹具轮为准。
>
> **C3 后复跑（2026-10-28）**：第三轮窄修候选 `ae702eb` 按同一临时夹具口径额外复跑 2 次（`%TEMP%\ans-e2e-a3-out-keEE`、`%TEMP%\ans-e2e-a3b-out-f2YY`）——均 exit 0、`E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空、`BOOTSTRAP_PRIMARY=chief`；`00-titlebar.png` 截图捕获偶发 `UnknownVizError`（16/17 PNG，不影响 E2E_PASS）。C3 仅改卡文本/测试/属主记录/本文件，未改路由/UI 行为；17/17 截图证据仍以 §六 的 C2 临时夹具轮为准（报告 `973c7d70…`）。

### 3.2 基线与本批对照（测试差异）

- **S1 基线（`8fc673e`）**：409 个 `*.test.ts` 枚举 / 408 执行（排除 hang 的 `write-sequencing`）；tests **4495** / pass **4460** / fail **16** / skip **19** / exit 1。
- **基线 16 红分类**：9 条 Windows symlink EPERM（`claude-adapter/session`、`codex-adapter/session`、`pi-adapter/injected-runtime`×2、`runtime-core/file-write-safety`、`runtime-core/session-store`×2、`测试/g4-skill-verify/b-render-double-check`、`编排/shell-authorized-routine`）+ 7 条断言既红（`桌面应用/acceptance-dispatch:7756`、`测试/governance-e2e-auto/k-governance-feedback`、`测试/governance-e2e-auto/s-acceptance-rework-routing` S7-F、`测试/governance-liaison-verify/e-audit`、`测试/t1-pipeline-integration`×3）。

- **本批最终运行（2026-10-28，最终 A 候选；clean 全量）**：文件枚举 **409** / 执行 **408**（与 S1 同口径排除 `write-sequencing`）；tests **4500** / pass **4465** / fail **16** / skip **19** / exit 1；原始日志 `/tmp/ab-clean-tests.log`（sha256 `4af9cadd09d4c022a290c3f7eaf5c15eedb235ee102735fb99989c9b2ece73f8`）。
- **失败分类（16）**：**9 条 Windows symlink EPERM**（`claude-adapter/session`、`codex-adapter/session`、`pi-adapter/injected-runtime`×2、`runtime-core/file-write-safety`、`runtime-core/session-store`×2、`测试/g4-skill-verify/b-render-double-check`、`编排/shell-authorized-routine`）+ **6 条稳定基线断言既红**（`测试/governance-e2e-auto/s-acceptance-rework-routing` S7-F、`测试/t1-pipeline-integration`×3、`测试/governance-e2e-auto/k-governance-feedback`、`测试/governance-liaison-verify/e-audit`）+ **1 条 `test/桌面应用/acceptance-dispatch.test.ts` 环境/时序敏感项**（本轮为 `2026-10-26 gate 处置：报告 pass …` 的 gate.review 审计条数 0≠1；该文件不在本批改动）。**新增确定性失败 = 0；无新增 skip；未删除/弱化测试断言保绿。**
- **R4 全量/单文件 flake 登记**：该文件单跑 3 次为 `142/143`（R2b）、`143/143`、`142/143`（7756），本轮全量又出现第 4 个不同失败项（gate.review 审计计数），逐轮不同——确认**环境/时序敏感 flake**，不作为稳定全绿证据；全量 16 红与 S1 的 16 红数量相同但构成不同（1 条 acceptance-dispatch flake 替换了 C2 运行中的 2 条 acceptance-dispatch flake，其余 15 条分类一致）。
- **对照 S1（4495/4460/16/19）**：tests **+5**（`liaison-role.test.ts` 重写 9→13 的 +4，R1 卡文本一致性测试 +1）；pass **+5**（4465）；fail **16 与 S1 相同**；skip **19 不变**。C2 候选 `/tmp/final3-tests.log`（`55efc765…`，4499/4463/17/19）作为 C2 证据保留；C3 新增 1 个测试后由本轮 clean 全量覆盖（`/tmp/ab-clean-tests.log`）。
- **基线红转绿/复红说明**：`test/桌面应用/acceptance-dispatch.test.ts:7756` 在 S1 为既红；在本候选的多次运行中与全量负载相关地摆动（单跑 3 次见 R4；本轮全量未命中该条，命中同文件另一条时序敏感项）。本批未以它为目标、未据此声明修复；D 批随 `acceptance-dispatch` 重写；发布前 gate 需 clean 运行。
- **静态/构建**：`npm run typecheck` exit 0（`aee16865…`）；`typecheck:renderer` exit 0（`914780f6…`）；`build:renderer` exit 0（`397e0c68…`；第三轮窄修后重跑 `/tmp/a3-build-renderer.log` = `0a148231…`）。

### 3.3 测试差异表（逐文件；含断言数前后对照）

| 文件 | 处置 | 断言数（基线→候选） | 原因/说明 |
| --- | --- | --- | --- |
| `test/门禁引擎/governance-trio.test.ts` | 重写 | 472 → 489 | 六角色注册/显示名/职能；A 批快照「当前旧态 + 目标态」；product 承接旧 liaison 现行写区；旧卡文本断言收窄到旧五名。 |
| `test/门禁引擎/list-project.test.ts` | 重写 | 84 → 87 | trio 六角色/`primaryRoleId=chief`；product `docs/intents/` 现行写区断言。 |
| `test/门禁引擎/liaison-role.test.ts` | 重写/退役 | **93 → 96**（test() 9→13） | 由 liaison 覆盖改为 chief/product 覆盖；补 product 当前写区/写权/卡文本断言，覆盖未弱化（+3）。 |
| `test/门禁引擎/customer-card-rules.test.ts` | 最小断言同步 | 10 → 10 | 仅「注册表五角色」→六角色。 |
| `test/门禁引擎/gate-review-flow-busy.test.ts` | 最小断言同步 | 11 → 11 | 同上。 |
| `test/门禁引擎/governance-standard-workflow.test.ts` | 最小断言同步 | 142 → 142 | 注册表六角色；旧卡文本循环收窄到旧五名。 |
| `test/门禁引擎/requirement-change-cards.test.ts` | 最小断言同步 | 33 → 33 | 注册表六角色。 |
| `test/门禁引擎/screenshot-only-evidence.test.ts` | 最小断言同步 | 11 → 11 | 注册表六角色。 |
| `test/门禁引擎/verifier-artifact-report.test.ts` | 最小断言同步 | 16 → 16 | 注册表六角色。 |
| `test/门禁引擎/view-image-cards.test.ts` | 最小断言同步 | 17 → 17 | 注册表六角色。 |
| `test/桌面UI/role-view.test.ts` | 重写 | 30 → 30 | 六角色映射；主入口 fixture 改 chief。 |
| `test/桌面UI/judge.test.ts` | 最小同步 | 75 → 77 | 新增 chief/product shell 标题断言。 |
| `test/桌面UI/i18n-b1-b2.test.ts` | 最小同步 | 55 → 57 | judge roleName/governanceView 改 chief/product。 |
| `test/项目管理/shared/i18n.test.ts` | 重写（key 计数） | 609 → 611 | 总 key 1395→1399；ui 792→796；judge 增补 10→11。 |
| `test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts` | 重写 | 61 → 62 | 列表六角色/primary=chief；chief/product 会话；写区/能力保持旧态。 |
| `test/测试/governance-trio-verify/c-migration.test.ts` | 最小断言同步 | 79 → 79 | 迁移后六角色/primary=chief。 |
| `test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts` | 最小断言同步 | 110 → 114 | 列表六角色/primary=chief；liaison 卡文本经别名断言。 |
| `test/测试/governance-liaison-verify/b-intent-handoff.test.ts` | 最小断言同步 | 89 → 89 | 主入口/系统行 liaison→chief；ledger `power` 仍断言旧 `liaison`。 |
| `test/测试/governance-liaison-verify/c-clarification.test.ts` | 最小断言同步 | 33 → 33 | 系统行接收角色 liaison→chief。 |
| `test/测试/governance-liaison-verify/fixture.ts` | 最小同步（夹具） | — | `builtInRoles` 增 chief/product（旧 liaison 保留别名）。 |
| `test/测试/governance-e2e-auto/i-full-chain.test.ts` | 最小断言同步 | 167 → 167 | 主入口/系统行 liaison→chief；流程/卡/门禁逻辑断言不变。 |
| `test/测试/governance-e2e-auto/acceptance-triage-e2e.test.ts` | 最小断言同步 | 155 → 155 | 分诊卡镜像/系统行接收角色 liaison→chief；文本断言改「幕僚（chief）」。 |
| `test/测试/governance-e2e-auto/k-governance-feedback.test.ts` | 最小断言同步 | 6 → 6 | 内部角色 settle 的 Lead 接收角色 liaison→chief（仍为 S1 基线既红：显示名断言）。 |
| `test/测试/governance-e2e-auto/l-crew-write-validation.test.ts` | 最小断言同步 | 23 → 23 | Lead 系统行接收角色 liaison→chief。 |
| `test/测试/governance-e2e-auto/m-lead-internal-choice.test.ts` | 最小断言同步 | 39 → 39 | 主入口 liaison→chief；coordinate 门行为不变。 |
| `test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts` | 最小断言同步 | 158 → 158 | 返工路由/文本断言 liaison→chief；S7-F 仍为 S1 基线既红。 |
| `test/测试/governance-e2e-auto/t-gate-review-return-routing.test.ts` | 最小断言同步 | 98 → 98 | 主入口系统行 liaison→chief。 |
| `test/测试/t9-block1-bootstrap.test.ts` | 重写 | 87 → 87 | IPC listProject 六角色/chief。 |
| `test/桌面应用/genesis-bootstrap.test.ts` | 最小断言同步 | 28 → 28 | trio 主入口 liaison→chief。 |
| `test/测试/governance-e2e-auto/q-role-granularity.test.ts`、`test/测试/real-entry.test.ts` | 复核（未改） | — | 无旧角色集断言，实际运行通过。 |

**测试数变化**：`test()` 用例 +5（`liaison-role.test.ts` 9→13 的 +4；R1 卡文本一致性测试 +1，计入 `governance-trio.test.ts` 472→489）；断言数全部持平或增加（F3 已补回：93→96）。

---

## 四、行为保持与中间态限制（如实披露）

1. **旧 gate/flow/ledger 代码与旧写区/能力矩阵保留到 D**（amendment-1/A-04a）：convener 仍可 dispatch/写 `docs/flows/` 等；verifier 旧写区不变；旧 e2e 全链路在 A 下保持通过（除基线既红）。
2. **chief 承接旧 liaison 的旧流程路径**：intent-confirm/`hand_off_intent`/旧 coordinate 门；`validateIntentHandoff` 与旧 gate 内部仍认 `liaison` 字面值——由编排/桌面在入口处归一为只读别名值（不改变旧门行为）。
3. **chief 的新能力（星形派发任意角色、role_status/session_tail 注入、role_activity_log）在 B 批新增**；convener 去 dispatch 在 D 批。本批 chief 能力位=旧 liaison 值，convener=旧值。
4. **product 在 A 批承接旧 liaison 现行写区**：Section 1/预授权为 `docs/intents/`；目标写区 `docs/product/` 在 **D 批**生效；不得按目标写区写入（F2 返工）。
5. **目标写区**（§1.1）本批不生效；A-04 判定按 v1.1 为「目标态已定义并记录、D 生效」；§二同时记录当前态与目标态，二者不矛盾（F2 已修正）。
6. **F5（只读运行期别名）**：旧 `liaison` 仅用于存量旧会话的只读兼容（不进入列表/UI/i18n/六角色能力矩阵），按 amendment-2 §2.2 澄清（编译期 + 运行期只读兼容，允许只读兼容、不得进入列表/UI/i18n/能力矩阵）；D 删除。
7. **F7（卡文本批次标注）**：`CHIEF_CARD_TEXT`/`PRODUCT_CARD_TEXT`/`govern-session` 纪律已改为「A 批现状 + B/C/D 生效」表述；不宣称未注入的工具/未启用的写区已可用。
8. 本批未改申请/决策/flow 行为；未新增 cardKind（`write`/`schedule-write` 仍留到 C/D）。

## 五、回滚

- **已提交**：按顺序 `git revert` rework 提交与 `f4aa073a`（或整体 revert 本批提交），重跑 A 全部验证（全量测试 + 双 typecheck + build:renderer + Electron 临时夹具 + 结构检查）。
- **未提交**：将 §一文件恢复到基线 `8fc673e` 并重跑同组验证。
- **数据**：无数据/schema 迁移；旧账本/flow 文件未写入、未迁移；旧 `liaison` 别名随 revert 消失；`.ans` 无新增状态。
- **范围**：仅 worktree/分支；main 未被触碰；不 push/不合并。

## 六、证据、环境与整树标识

- **提交 SHA**：首提交 `f4aa073a7032d35afc2e964dc22b4d171f1d26dc`；返工提交（代码/测试/属主记录/change-package 初版）`83f2d2e30fd8df0c51a50f809f61fc9b28a05097`；证据补录提交（C2）`b6ff88734c4b5f743c639582d22daaf57509a691`；第三轮窄修提交（C3）`ae702eb67ca8cb408d6541cb40893375a6b4dc14`；C4（仅补 C3 后 E2E 说明）`b1addff20aa56ef024fa3dd2b8f51110f0dd90ad`；**C5（本文件最终版：clean 全量/E2E/记录小修；SHA 见 `git log --format=%H -1`）**。
- **分支附加提交（非 A 批写集）**：C4 之后出现 `c64fe98`（chore(governance): add batch B/C/F desktop test files to boundary (Delta-1)，人事按 Delta-1 为 B 批前置写入 `角色卡/桌面窗口/boundary.{md,yaml}` + `changelog.md` 三文件）；**该提交属 B 批边界更新，不在 A 批 50 路径写集/候选内，C5 不包含也不修改该三文件**；A 批验收候选仍为 `b1addff`（C5 仅文档/属主记录小修）。
- **整树标识（可复算口径）**：
  - 首提交批次差异：`git diff --binary 8fc673e f4aa073a | sha256sum` = `35167593ace525d1cc6ef139684a4344766a0fe91cc6a58f9775025fd118dbd4`（含变更包）。
  - **rework 候选（C1）**：`git diff --binary 8fc673e 83f2d2e30fd8df0c51a50f809f61fc9b28a05097 | sha256sum` = `fbcc6e8448576f48adc2bc0467641d98fc9db946c62810008c4cc62b05cd5311`（含 C1 版变更包与属主记录）。
  - **证据补录提交（C2 `b6ff8873`）**：只更新 change-package（文档）；`git diff --binary 8fc673e b6ff8873 | sha256sum` = `60133ba8a68d8c8059d220e032eddce66f51f21365f117a1bff1e8de0b608671`（复审已记录）。
  - **第三轮窄修提交（C3 `ae702eb`）**：修正 R1 卡文本、R2 属主记录、R3 文字、R4 证据口径/R5 附录口径；只改卡文本/测试/记录/本文件；`git diff --binary 8fc673e ae702eb67ca8cb408d6541cb40893375a6b4dc14 | sha256sum` = `ff6051e24951782b4e7f23ac7443f314cd05918ed276a8e1e7d7dfb47cda5a5d`。
  - **C4 `b1addff`**：仅补 C3 后 E2E 复跑说明；`git diff --binary 8fc673e b1addff20aa56ef024fa3dd2b8f51110f0dd90ad | sha256sum` = `37fb6563bb4ba32a685e01201a97c8aaa74e4d7b5e33c3b114e0a8618c1d2fce`。
  - **C5（本文件最终版）**：clean 全量/E2E/change-package 与属主记录小修；仅文档/卡文本一致性测试与记录变更；其 `git diff --binary 8fc673e <C5>` 由最终报告/复审按 `git log` 取 C5 后复算（自引用限制）。
  - 口径说明：首版 change-package 曾记录 `46af3a06…`，那是**提交前 `git diff --binary`（tracked-only，未含未跟踪的 change-package 文件）**；验收按提交后整批差异复算为 `35167593…`。本版统一以「提交后 `git diff --binary 8fc673e <commit>`」为准并记录。
- **属主 change 记录（P7）**：`角色卡/{门禁引擎,编排,桌面窗口,桌面UI,项目管理,测试}/docs/change/2026-10-28_change_entry-role-minimal-A.md`。
- **全量/静态日志**：最终 clean 全量 `/tmp/ab-clean-tests.log`（`4af9cadd…`，C5 候选）；C2 全量 `/tmp/final3-tests.log`（`55efc765…`）；静态 `/tmp/a3-typecheck.log`、`/tmp/a3-typecheck-renderer.log`、`/tmp/a3-build-renderer.log`（sha256 见 §3.1/§3.2）。
- **Electron（临时夹具）**：报告 `%TEMP%\ans-e2e-a2-out-Xoxa\report.txt` sha256 `973c7d705818daf2ba84ba1c11e6d01a0e4d4128f168761d37569530313ed87b`；17 张截图逐图 sha256/尺寸：

| 文件 | 尺寸 | sha256 |
| --- | --- | --- |
| 00-titlebar.png | 1360x860 | 271f616eb1fa41cb3cca548d69289907f21c7a168b58e8f37b816531b5be7000 |
| 01-import.png | 1360x860 | 7fb5ee02b51932dc2a434da4cf7a68c720900aee3b93f55b6633a1edca095b60 |
| 01b-su.png | 1360x860 | 7fb5ee02b51932dc2a434da4cf7a68c720900aee3b93f55b6633a1edca095b60 |
| 02-chat.png | 1360x860 | 0d62b25271954e024002df16e859cd9b3fa34181933396ce7272838d3364bf3a |
| 03-denied.png | 1360x860 | ef155981d1b5a632cdedc37edd7c9c310d8e0f5da6a9bbde9500fd319a484e5d |
| 04-profile.png | 1360x860 | d08d55d1a91b273c0221202aa1ecc5ba8f1138da700745399ab87fd15db80cd6 |
| 05-bootstrap.png | 1360x860 | eb7b1f633ebe44b67475369f51b3966ee5e5736f37d06fa5b3c6e1128310eabc |
| 06-refresh.png | 1360x860 | b4e2630a0915e4b9372685a3cea7391c01eef15ec0037d701d351c668f60d8d0 |
| 07-handback.png | 1360x860 | 15174046a71447007beb920f7906560842f2c6e427dc906c3df488de5ad073ef |
| 08-su-pane.png | 1360x860 | 4d0d98eaebf8a2b5790272629cece181ecd7a405be862f66fbad2c53716e65ac |
| 09-pi-panel.png | 1360x860 | fb56554ab4f8c11516708fc977aa803417e5cc1be5197d3180e4eeea4403ff7b |
| 10-pi-saved.png | 1360x860 | 146e40290950df556693eb0560723cebe84bd4019ae73ac8d5d6f4d5e2b91488 |
| 11-operator-card.png | 1360x860 | cb5c169ace146627ab62987b30b8c81cf0f4725843dd761e71b3f4cd2f62181f |
| 12-composer.png | 1360x860 | d08d55d1a91b273c0221202aa1ecc5ba8f1138da700745399ab87fd15db80cd6 |
| 12-restore.png | 1360x860 | 1e5676fe543f964fbdab44262f8a5a68447048836dde8e814b49e19d14e9dc4c |
| 14-operator-crosspane.png | 1360x860 | 3ed05651fc95d436a009bf164d0f7b03395072b035b2cb5c4de128fe5c02131d |
| 15-anchor-reanchor.png | 1360x860 | cf1a45e94a0627cdbb4ff3d54b4d24a64fa1b222aa55de50e00e52af34aa400f |

- **环境**：Windows 11 专业版 10.0.26300（build 26300）；Node `v24.22.1`；npm `11.19.1`；Electron `44.7.0`；worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\entry-role-minimal`；基线 `8fc673e`；无 `.env` 读取/写入。

## 附录 A：候选逐文件哈希（`git hash-object` + `sha256sum`）

| 文件 | git hash-object | sha256 |
| --- | --- | --- |
| `app/desktop/project.ts` | `607f26217d3024fc501b95b004ab5ce6855a1b11` | `c8b3b476c51b394a93ff832838472c24d90c6a6a01d411b357f172522276e486` |
| `app/desktop/session.ts` | `cb97f4c34a70ba091bf8d7dc2c24d59456c98b68` | `6e4a9493e94f6bfb8be324ea30c80a8ab86fef2c58865b8fc1b7e3f191bd2241` |
| `app/renderer/src/chat/governance-view.ts` | `f9ced12ed29b667649411167227d4e0cf0d22349` | `6ab039f3448552a546446441779db9a5e69ef395ff1dd9c9f5f7ac05d95c028f` |
| `app/renderer/src/chat/judge.ts` | `4c2c73a2e86792bbef63847a84200d3778e7b5fc` | `e677b661ee9f19a7a990c7f347fdb19c6442018254a5263e6cdacb6d6909a334` |
| `app/renderer/src/chat/role-view.ts` | `e0925eda7188fa549e903c3323a3f3e40c9279a1` | `d56f5b92a070150bddcba1151befcade18759d0454ca74ad18f32c75fb64fc0b` |
| `docs/scheduling/2026-10-28-entry-role-minimal-gate2-amendment-2.md` | `64f237cfea811a9ce7e211bf33d26c2ca375b2c5` | `8d5ddeb5d45690d34ac5ef9031cae80768f47b8e07ecd37685d61e940395aaae` |
| `src/common/shared/i18n/messages/en-US.ts` | `99ca2d4be920057a6562fd7ee7b7a3010fe9c342` | `dca8c7b7a91e7aa3e3bc7dd359f8144ccb0d11a203fc0ce3f3e4c33994eadc02` |
| `src/common/shared/i18n/messages/zh-CN.ts` | `5c37936879a01ad3ae1db097ff63d28082fba5d1` | `e0c070077ffacb365698ae1fb1d3dc6d0030e1bf9aff14f73fa8f092b63384d5` |
| `src/common/门禁引擎/governance-roles.ts` | `0fb47b6f9f62a40b2476d0fbec37818ad5fa9eef` | `401c2a66f32a2fd526965a18fa12b05c5225c5dfd5e97fe5b6510906b65d733e` |
| `src/model/role.ts` | `fbc8527cf05e16a946431e00eb8448e3cf9f0bd2` | `7c8ccc91942b4c2e423d4ef0c39baae7a820e47ae66b23ed4ca4f1a3f0fd1b52` |
| `src/pipeline/orchestration/govern-session.ts` | `34a654ac91d89e2bb8dc993fa761c1b8d8a58e3c` | `f5aa6ce1c33e763b27be3ab5feb5676f1aa611e420c67a93fbd40fe743d33109` |
| `src/pipeline/orchestration/run-role.ts` | `cd6e91a414dfb540849279c60fd09ce987c8a52d` | `10ecc61ac485b73508feece8f7f92a039247ab4aca2351fa7ccbccac0c836433` |
| `src/service/boundary/resolve-boundary.ts` | `ad9ba8bf158f084d351bd50350864b008517e0af` | `7faaf83ec5d63a9c374aef2e9a0a64cb454559aec50e6868ef56e46368673b53` |
| `src/service/role/resolve-role.ts` | `63b57b0a36a2ff72ac6663aa81b4f93e31d9a245` | `c935cdf213f06a0b3d64bb00f41381ec5a9058162d4f6e3ac3e050724923868f` |
| `test/桌面UI/i18n-b1-b2.test.ts` | `1cb8105904747234d9f18cf3d499e2df71d34e9b` | `3f36ffc3facf8a2158a30fb215a1ba1456fbe30077c082af3aef2e83bded2f83` |
| `test/桌面UI/judge.test.ts` | `2e03944f8421af41babb23cf40b094676d6baecd` | `96f3ed70a470204171accc49d99ed20c70f282bc6371ba2daa02898b24672ab3` |
| `test/桌面UI/role-view.test.ts` | `99071b1b70e65fc768b0c3c4d7fca0808be0f6e8` | `97b5ea7b6c2581cb91cac71dc480a374cc8107c059cfaff8178e58e90af1223d` |
| `test/桌面应用/genesis-bootstrap.test.ts` | `2fd53a177042a4c763038a217ff5723fe492529f` | `dc049d59a67ea6403c450b4a15d786a7c99e7d04951bb000f5ff3339c92630fc` |
| `test/测试/governance-e2e-auto/acceptance-triage-e2e.test.ts` | `0cdcfd81dc96ff7d9b8a93dae0a5514c9aad0ff5` | `2882cf5ebbe8b1896ca42b72b36e6e8fa255bace3a026d8011612cceb2cc8787` |
| `test/测试/governance-e2e-auto/i-full-chain.test.ts` | `e32e543beae0ccf15ae234da8288f61ed1822266` | `df977681f3a39fe994ae07e730628663134cba6d0d771e42b8324c5fe7da0529` |
| `test/测试/governance-e2e-auto/k-governance-feedback.test.ts` | `34c8cbae83947e1decc99885d1c5b190fd3fbf9d` | `24cf4cdef4da519ca3b34bb66e79cb49e6d8e26c89805b161dddec0362aab378` |
| `test/测试/governance-e2e-auto/l-crew-write-validation.test.ts` | `69f21035a349a4d9f0b8633a562e695d877753da` | `8528545c79051044caa09b8aa00ff14148a7fc8317277c65927b5b25bae6ab58` |
| `test/测试/governance-e2e-auto/m-lead-internal-choice.test.ts` | `5ecd346331eb8d56115d5a90c5442dfc3acfea0a` | `5d6c713960640c081d788089dd01d32e0c84c37ff68a99830b009965ead07e39` |
| `test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts` | `d29f8704da95bbda9182a1691a0d73805d5464f7` | `1b5341590e08f3d87602799236ecfbf27286292aef20bb22f010000be96f09cf` |
| `test/测试/governance-e2e-auto/t-gate-review-return-routing.test.ts` | `7aad837e3f684b6656876e569979771e34d6a2a2` | `b3f2a8f87b8e2f1e9efbeab4dc5d2d5c4723fc7f8a05b0cba49f06b3b2d0bc7c` |
| `test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts` | `bb017cfe9d5ac165631e2319ee87ad72c06579a7` | `ff7365191c79d007712b1b2fd26c678c4df08c0e0c1f0d032caa842b76a49c90` |
| `test/测试/governance-liaison-verify/b-intent-handoff.test.ts` | `52983e6ff68540306d163e957aed0ed8b741de1c` | `afd511c19cdf82f376e440b9a9b32e4f31d02d5bf51443435b09f8eb03c5ec28` |
| `test/测试/governance-liaison-verify/c-clarification.test.ts` | `ff58ab9e9d16851fdb366eaa219b9adf301813dd` | `7fae68b81357dda8191485f2ed7ca5d1adb04c9df91c9d06389da00a46b3c477` |
| `test/测试/governance-liaison-verify/fixture.ts` | `86462995e6bb3851cd6dd1ca72fb6b9fed25fd4e` | `f7597819e08d69cdf32e4dfc014c89eeb6b388cce28f688ad38da9bde755d050` |
| `test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts` | `c034456b8e56132e0568fc123b6b2792fa82a6cb` | `033d0a539b09d7b8805e9f07e90434d24ff0986d368022c35e5d491da0e1d0c0` |
| `test/测试/governance-trio-verify/c-migration.test.ts` | `28f3a2969fa2efd1323792402ccac8deb2d75802` | `2a38c00e4e164f1b66a5564dfe810e05df194ad404ada514cf56f42afd2d405c` |
| `test/测试/t9-block1-bootstrap.test.ts` | `40fb481052479237b3169b9f2e576f6c77cb4a24` | `3c6cbeaeb90798e744b46ef1138ab0a38d4b662ff3719fe7e7956e018c0c48dd` |
| `test/门禁引擎/customer-card-rules.test.ts` | `834b0f5b5f27102fd38dd9e085a16db5f55e5cf4` | `89e4f3bae6d919674368abbb0dc0b9f509b6f019b4d502aaee182795599a431c` |
| `test/门禁引擎/gate-review-flow-busy.test.ts` | `95da322926b8413f09def6901b6f0e489adb1a2f` | `e4ba3d73f60558fc995da4bab836d7c63f500cad022ce4b009f8e3101effe756` |
| `test/门禁引擎/governance-standard-workflow.test.ts` | `63fb15fe8776d383c26ec12544f644a36c0bc650` | `48205f350cfac4992f4bb49f46bab2ebaf29c53812a75408fd963494b2369323` |
| `test/门禁引擎/governance-trio.test.ts` | `169890c372e36065a55db8327d07a0d74d931420` | `0fd041861775eef16897fc9e4f450992105ed36b34034580317a9912ecd4af0e` |
| `test/门禁引擎/liaison-role.test.ts` | `204aa561308a4b51e4a6345c8b5837723004c891` | `988cf048d82c3124d6885d8ab9cb73b566235596ab7609fd53eba544b4e0ebec` |
| `test/门禁引擎/list-project.test.ts` | `a9160bb2427a5b9960ef6dbaca506b19e5a3c6bc` | `a5421874a020c5d1eb2bc4b3c2e27069c755aedd865a0dd6314fddad0c549b5d` |
| `test/门禁引擎/requirement-change-cards.test.ts` | `074bbac8afe305cb6ab096ce65cd092e16f0bd03` | `bc01a46a0282a951904b51d7c8dcbdc74c2e53782cc3276140eb139d6f79cc4e` |
| `test/门禁引擎/screenshot-only-evidence.test.ts` | `74ded6aafc2d382420b726ca8cda14c62a4e93b8` | `511b6551ab25fa89e32a8e54ef5d21076e60cc84decfa37c7ea684159b77e7aa` |
| `test/门禁引擎/verifier-artifact-report.test.ts` | `9a586998c383679b5b4f2cb817ea4f759b677190` | `965d030746448146ef20147e6e70ea07163eb086ffab6d510346ba14f32d1182` |
| `test/门禁引擎/view-image-cards.test.ts` | `47d09aba5bf2c4ba782a42d5400b3f1617fb0b46` | `bb6f7e08730af82392d8cdce672fb8418257012c649e81510ed663ce2dfc4da2` |
| `test/项目管理/shared/i18n.test.ts` | `24aa5dc3e63c7ae2cbaeec12185f332d6864c4f2` | `3267eb6fcf360cb9bfda5f2f57e6d2af32ce667819d7e3c0a1f9edd97159a6ed` |
| `角色卡/桌面UI/docs/change/2026-10-28_change_entry-role-minimal-A.md` | `c242c4267a54ece052fe3cc340b3b0c005c06240` | `6c9c77ca182cb0442300117fbb45b50aca0371b12b676b232797bbad2d5c8e47` |
| `角色卡/桌面窗口/docs/change/2026-10-28_change_entry-role-minimal-A.md` | `dddd18635d07cba19ae8c8453df005fcb6b79d65` | `604b2cf09a51ea023ba0b5e5cb7b7abcf515de23858726b41f18d2e3dfe36993` |
| `角色卡/测试/docs/change/2026-10-28_change_entry-role-minimal-A.md` | `3e1a205d19d896b454a569101b15b7ab7548f8a6` | `38f1991148a888e86f5ae41e6e3a9c2a97ebf553cbe538188b292714ccbb78f0` |
| `角色卡/编排/docs/change/2026-10-28_change_entry-role-minimal-A.md` | `b1147707667f7bf6d9d6ffec26c2744df34709b2` | `d060039fff402ee52f5fefc52f024b81226796aed28c58a904369c836312ecad` |
| `角色卡/门禁引擎/docs/change/2026-10-28_change_entry-role-minimal-A.md` | `118b9f80203a794970860dd6c3b56779a09b98d5` | `72928884f209d1056d8051c7696437aa7bdf212defb330fce44d30e5ce56be33` |
| `角色卡/项目管理/docs/change/2026-10-28_change_entry-role-minimal-A.md` | `93f2ffec01f386a6a7373599cc30eb1a96fd1150` | `49bc09221efc368cc3b334dbb9054a2f8a516606b81f200841b9dfddc2506250` |

> **sha256 口径（R5）**：附录 A 的 sha256 为**提交 blob 内容**口径（`git cat-file blob <git hash> | sha256sum`），与工作区文件字节（CRLF）的 `sha256sum` 可能不同；逐文件 `git hash-object` 为提交 blob id，两者均可复算。附录 A 只覆盖 A 批 50 路径（不含 change-A 自身）；分支附加提交 `c64fe98` 的 `角色卡/桌面窗口/{boundary.md,boundary.yaml,changelog.md}` 属 B 批 Delta-1、不在 A 批候选，未计入本附录。
>
> change-package 自身随提交写入，无法自含自身哈希；其最终行数/SHA-256 见提交后的复审报告与最终报告。

## 附录 B-1：v2 复审 R1–R5 处置对照

| Finding | 处置 |
| --- | --- |
| **R1 卡文本/代码不一致** | `CHIEF_CARD_TEXT` 移除 `docs/verification/**`、`PRODUCT_CARD_TEXT` 移除 `docs/intents/**`；新增 `governance-trio` R1 卡文本一致性测试（Section 1 不得出现在禁写段、`forbiddenWritePaths` 全覆盖、不得提前列目标写区）；断言 472→489。 |
| **R2 属主记录过期** | 6 份记录全部刷新到最终候选/证据（product `docs/intents/`、amendment-2 已落盘、最终计数、93→96、R4 多次登记、最终 E2E）；显式记录 `ae702eb`/`b1addff`。 |
| **R3 93→95/96 不一致** | 统一为 **93→96**；change-package §3.3 末句与测试属主记录一致。 |
| **R4 acceptance-dispatch 稳定性** | 单跑 3 次逐次登记（142/143、143/143、142/143，失败项不同）+ 最终 clean 全量的第 4 个不同失败项；固定为环境/时序敏感 flake，不作为稳定全绿证据；clean 全量已在本候选执行（4500/4465/16/19）。 |
| **R5 附录 sha256 口径** | 标注为提交 blob 内容口径（`git cat-file blob | sha256sum`，与工作区 CRLF 字节可能不同）；C2 `60133ba8…`、C3 `ff6051e2…`、C4 `37fb6563…` 已记录，C5 由外部复算。 |

## 附录 B：返工处置对照（F1–F7）

| Finding | 处置 |
| --- | --- |
| **F1 写集越界（阻断）** | 引用 **amendment-2 §2.1（已落盘，110 行 / `8d5ddeb5…`）** 书面授权三个最小 shim（`resolve-boundary.ts` 类型 re-export、`govern-session.ts` label/discipline/类型 shim、`project.ts` 旧 liaison `builtInRoles` 只读兼容）；三文件保持最小、行为不变、不承载新行为；D 批清理。 |
| **F2 product 写区提前生效（阻断）** | product Section 1/预授权改为承接旧 liaison 现行值 `docs/intents/`（amendment-2 §2.3），卡文本移除「写入 `docs/product/`」生效表述并标注 D 生效；chief `forbiddenWritePaths` 恢复基线 liaison 逐字清单；同步 §二/§四.5 与测试快照。 |
| **F3 断言数 93→91（阻断）** | 重写后断言 **93→96**（+3，覆盖不弱化）；§3.3 补逐文件断言数前后对照并说明 `test()` 9→13。 |
| **F4 证据包（阻断证据链）** | 记录首提交/ **rework 提交** SHA；整树标识改用可复算「提交后 `git diff --binary 8fc673e <commit>`」并说明首版口径差异；补 6 份属主 change 记录；补 17 张截图逐图 sha256/尺寸；补环境记录；引用标准改为 v1.1（295 行 `0bcfe1ea…`）。 |
| **F5 运行期只读别名（非阻断）** | 按 amendment-2 §2.2 澄清：**编译期 + 运行期只读兼容**（允许只读兼容）；不进入列表/UI/i18n/六角色能力矩阵；D 删除（§二/§四.6）。 |
| **F6 Electron 指向 worktree（非阻断）** | 已改为**临时夹具项目**（`%TEMP%\ans-e2e-a2-fixture-P2wK`，仅 `角色卡/桌面窗口/`）重跑：`E2E_PASS=true`、`E2E_DONE=1`、`E2E_FAILURES=` 空、`BOOTSTRAP_PRIMARY=chief`；17 截图逐图 sha256 见 §六。 |
| **F7 卡文本提前描述 B/C（非阻断）** | chief/product 卡文本与 `govern-session` 纪律改为「A 批现状 + B/C/D 生效」标注；不再宣称未注入工具/未启用写区已可用。 |
