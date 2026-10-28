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
| 真实 Electron（**F6：临时夹具项目**） | `ANS_E2E_PROJECT=<临时夹具：仅 角色卡/桌面窗口/ >`、`ANS_E2E_OUTDIR=<临时>`、`node_modules/electron/dist/electron.exe test/桌面应用/e2e/main.mjs` | **exit 0；`E2E_PASS=true`；`E2E_DONE=1`；`E2E_FAILURES=` 空；`PROJECT=<%TEMP%>\ans-e2e-a2-fixture-P2wK`；`ROLE_COUNT=2`；`PRIMARY_ROLE_ID=su`（single 夹具）；`BOOTSTRAP_PRIMARY=chief`；17 截图（1360x860，逐图 sha256 见 §六）**；报告 `%TEMP%\ans-e2e-a2-out-Xoxa\report.txt`（sha256 `973c7d705818daf2ba84ba1c11e6d01a0e4d4128f168761d37569530313ed87b`） |
| 结构检查 | 注册表/列表快照、`rg`、`git diff --name-only`、`package.json` 零改动 | 通过（§二/§六） |

> 说明：首提交 `f4aa073` 的 Electron 证据曾以 worktree 作为导入项目（验收 F6 指出）；本返工版按 P3 改为**临时夹具项目**重跑，夹具在 `%TEMP%`、未指向仓库/目标项目/演示，报告与 17 截图见 §六。两轮均 `E2E_PASS=true`；以夹具轮为准。

### 3.2 基线与本批对照（测试差异）

- **S1 基线（`8fc673e`）**：409 个 `*.test.ts` 枚举 / 408 执行（排除 hang 的 `write-sequencing`）；tests **4495** / pass **4460** / fail **16** / skip **19** / exit 1。
- **基线 16 红分类**：9 条 Windows symlink EPERM（`claude-adapter/session`、`codex-adapter/session`、`pi-adapter/injected-runtime`×2、`runtime-core/file-write-safety`、`runtime-core/session-store`×2、`测试/g4-skill-verify/b-render-double-check`、`编排/shell-authorized-routine`）+ 7 条断言既红（`桌面应用/acceptance-dispatch:7756`、`测试/governance-e2e-auto/k-governance-feedback`、`测试/governance-e2e-auto/s-acceptance-rework-routing` S7-F、`测试/governance-liaison-verify/e-audit`、`测试/t1-pipeline-integration`×3）。

- **本批最终运行（2026-10-28，rework 最终候选）**：文件枚举 **409** / 执行 **408**（与 S1 同口径排除 `write-sequencing`）；tests **4499** / pass **4463** / fail **17** / skip **19** / exit 1；原始日志 `/tmp/final3-tests.log`（sha256 `55efc7654ba72ef17bbff5512904ebe64c15b54d07a6c4a52fc0d4d7088fe2c3`）。
- **失败分类（17）**：**9 条 Windows symlink EPERM**（`claude-adapter/session`、`codex-adapter/session`、`pi-adapter/injected-runtime`×2、`runtime-core/file-write-safety`、`runtime-core/session-store`×2、`测试/g4-skill-verify/b-render-double-check`、`编排/shell-authorized-routine`）+ **6 条稳定基线断言既红**（`测试/governance-e2e-auto/s-acceptance-rework-routing` S7-F、`测试/t1-pipeline-integration`×3、`测试/governance-e2e-auto/k-governance-feedback`、`测试/governance-liaison-verify/e-audit`）+ **2 条 `test/桌面应用/acceptance-dispatch.test.ts` 环境/时序敏感项**（`2026-10-23 重派门` 与 S1 既红 `2026-10-27 gate 路由记录写失败`）——该文件在最终候选上**单独运行 143/143 pass**（日志 `/tmp/acceptance-dispatch-alone.log`），说明为全量负载下的非确定性，非本批行为回归。**新增确定性失败 = 0；无新增 skip；未删除/弱化测试断言保绿。**
- **对照 S1（4495/4460/16/19）**：tests **+4**（`liaison-role.test.ts` 重写 9→13 个 `test()`）；skip **19 不变**；fail 16→17、pass 4460→4463 的差异来自上述 acceptance-dispatch 时序敏感项（其 7756 为 S1 既红；本轮全量再次红、单独运行绿）。此前同一批代码区域的全量运行（amendment-2 前的 rework 候选）为 4499/4465/15/19，失败集为 9 symlink + 6 稳定断言既红，可作为同候选对照。
- **基线红转绿/复红说明**：`test/桌面应用/acceptance-dispatch.test.ts:7756` 在 S1 为既红；在本候选的多次运行中与全量负载相关地摆动（单独运行 143/143 全绿）。本批未以它为目标、未据此声明修复；D 批随 `acceptance-dispatch` 重写。
- **静态/构建**：`npm run typecheck` exit 0（`aee16865…`）；`typecheck:renderer` exit 0（`914780f6…`）；`build:renderer` exit 0（`397e0c68…`）。

### 3.3 测试差异表（逐文件；含断言数前后对照）

| 文件 | 处置 | 断言数（基线→候选） | 原因/说明 |
| --- | --- | --- | --- |
| `test/门禁引擎/governance-trio.test.ts` | 重写 | 472 → 485 | 六角色注册/显示名/职能；A 批快照「当前旧态 + 目标态」；product 承接旧 liaison 现行写区；旧卡文本断言收窄到旧五名。 |
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

**测试数变化**：`test()` 用例 +4（`liaison-role.test.ts` 9→13）；断言数全部持平或增加（F3 已补回：93→95）。

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

- **提交 SHA**：首提交 `f4aa073a7032d35afc2e964dc22b4d171f1d26dc`；**rework 提交** `<!-- REWORK_SHA -->`（追加提交；本文件随 rework 证据提交 `<!-- DOC_COMMIT_SHA -->`）。
- **整树标识（可复算口径）**：
  - 首提交批次差异：`git diff --binary 8fc673e f4aa073a | sha256sum` = `35167593ace525d1cc6ef139684a4344766a0fe91cc6a58f9775025fd118dbd4`（含变更包）。
  - **rework 候选**：`git diff --binary 8fc673e <rework commit> | sha256sum` = `<!-- TREE_HASH -->`（含变更包与属主记录）。
  - 口径说明：首版 change-package 曾记录 `46af3a06…`，那是**提交前 `git diff --binary`（tracked-only，未含未跟踪的 change-package 文件）**；验收按提交后整批差异复算为 `35167593…`。本版统一以「提交后 `git diff --binary 8fc673e <commit>`」为准并记录。
- **属主 change 记录（P7）**：`角色卡/{门禁引擎,编排,桌面窗口,桌面UI,项目管理,测试}/docs/change/2026-10-28_change_entry-role-minimal-A.md`。
- **全量/静态日志**：`/tmp/final3-tests.log`（sha256 见 §3.2）、`/tmp/final3-typecheck.log`、`/tmp/final3-typecheck-renderer.log`、`/tmp/final3-build-renderer.log`（sha256 见 §3.1/§3.2 与复审记录）。
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

<!-- HASHES -->

> change-package 自身随提交写入，无法自含自身哈希；其最终行数/SHA-256 见提交后的复审报告与最终报告。

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
