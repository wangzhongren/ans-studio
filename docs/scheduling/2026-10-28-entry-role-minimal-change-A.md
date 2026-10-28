# 变更包：批次 A —— 角色集与注册表（entry-role-minimal）

- **任务 ID**：`2026-10-28-entry-role-minimal`｜**批次**：A（角色集与注册表）｜**档位**：T3
- **记录角色**：实施执行者（门禁引擎/运行时核心/编排/桌面窗口/桌面UI/项目管理写集）｜**日期**：2026-10-28
- **候选**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\entry-role-minimal`，分支 `feat/entry-role-minimal`，基线 main `8fc673e23fb192793455ea0a6d50df21a3a854e0`（开工时 `git status --porcelain` 为空）。
- **提交**：本文件与全部改动在同一批次本地 commit（SHA 见提交后 `git log -1`；不 push、不合并 main）。
- **依据**：方案 v9.2（`docs/planning/2026-10-28_design_entry-role-product-builtin.md`，`300ad63c…`）；团队计划（`docs/scheduling/2026-10-28-entry-role-minimal-team-plan.md`，`08967531…`）§3/§4.1/§八；实施前验收标准 v1（`docs/acceptance/entry-role-minimal-criteria-v1.md`，`02b4885f…`）A-01–A-08；闸门 2 确认记录（`docs/communication/2026-10-28_intent_entry-role-product-builtin.md` 末节）。
- **团队计划 amendment-1（2026-10-28 沟通裁定，本批适用）**：
  1. **A 批只做身份层**：现行（旧）写区与能力矩阵保持不变（convener 仍保留 dispatch 与 `docs/flows/`、`docs/workflow.md` 等旧写区；verifier 旧写区不变）；**目标写区（A-04 快照）与 convener 去 dispatch 在 D 批切换**；chief 的 `role_activity_log` 等新能力在 B 批新增。本文件同时记录「当前态」与「目标态（D 生效）」。
  2. 允许对既有测试做**最小角色集/主入口/显示名/列表/能力矩阵断言同步**（不提前做 C/D/F 的实质重写/删除）。
- **状态**：候选已实现并本地验证；**未 push、未合并 main、未发布**；交独立验收（T3，本仓库 ANS 交付流程不变）。

---

## 一、改动清单（按层）

| 层 | 文件 | 改动 |
| --- | --- | --- |
| 门禁引擎 | `src/model/role.ts` | `GovernanceFunction` 扩为 `chief/product/proposal/nomination/schedule/verification`；旧 `liaison` 标注 `@deprecated` 仅作编译期只读别名（D 删除）；注释/主入口说明改为六角色。 |
| 门禁引擎 | `src/common/门禁引擎/governance-roles.ts` | `BUILT_IN_GOVERNANCE_ROLES` 切为六角色（chief→product→rapporteur→nominator→convener→verifier；显示名幕僚/产品/策划/人事/运营/质检）；新增 `CHIEF_CARD_TEXT`/`PRODUCT_CARD_TEXT`；旧 `liaison` 改为不进入数组的 `DeprecatedLiaisonRoleSpec` 只读别名；`governanceRoleOf`/`isTrioGovernanceRoleId` 等查询面同步；主入口越界写文案归属指引接受 `chief`。 |
| 门禁引擎 | `src/service/role/resolve-role.ts` | `listProject` trio 枚举六角色、`primaryRoleId="chief"`；`resolveGovernanceRole` 六角色 roleId/function 解析、缺省仍 `proposal→rapporteur`；旧 `liaison` 可按显式 roleId/function 解析（别名，不进入列表）；错误文案列六角色。 |
| 门禁引擎（shim） | `src/service/boundary/resolve-boundary.ts` | 仅类型 re-export 增加 `GovernanceRoleSpec`/`DeprecatedLiaisonRoleSpec`（供编排/桌面按别名规格消费；无行为变化）。 |
| 编排 | `src/pipeline/orchestration/run-role.ts` | 六角色 `TRIO_CARD_KINDS`（chief=intent-confirm、product=空、其余旧值不变）；主入口（chief/旧 liaison）共用旧 intent-confirm/交接/coordinate 路径；旧 ledger `power` 保持 `liaison`（chief）/`project`（product）审计标签；旧 gate 的 coordinate 对 chief 归一为旧 liaison 值。 |
| 编排（shim） | `src/pipeline/orchestration/govern-session.ts` | `GOVERNANCE_FUNCTION_LABEL` 增加 chief/product（类型 shim）；`governanceFunctionDiscipline` 增加 chief/product 两段最小纪律并放宽为 `GovernanceRoleSpec`（旧 flow/gate 卡文本路径不变）。 |
| 桌面窗口 | `app/desktop/session.ts` | 主入口/协调者按角色列表解析（`governanceFunction==="chief"` 优先、旧 `liaison` 回退）；`canLiaise` 接受 chief；旧 liaison 会话按注册表别名合成展示条目（不进入列表/不新增状态）；coordinate 门沿用旧 liaison 值。 |
| 桌面窗口（shim） | `app/desktop/project.ts` | trio 下把旧 `liaison` 登记进 `builtInRoles`（只读别名，允许存量旧会话开会话；不进入 `roles`/列表；D 删除）。 |
| 桌面UI | `app/renderer/src/chat/role-view.ts` | `GovernanceFunction` 改为六值；`GOVERNANCE_KEYS` 新增 chief/product、删除 liaison。 |
| 桌面UI | `app/renderer/src/chat/judge.ts` | shell 确认标题映射改为 `chief/product/verifier` 专用 key（删除 liaison）。 |
| 桌面UI | `app/renderer/src/chat/governance-view.ts` | roleIntro 映射改为 chief/product（删除 liaison）。 |
| 项目管理 | `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` | 新增 `ui.role.governance.chief/product.*`、`ui.governance.roleIntro.chief/product`、`ui.judge.roleName.chief/product`；删除 liaison 对应 key；flow/triage/gate/ledger key 未动（留 D）。 |
| 测试（A 写集重写） | `test/门禁引擎/governance-trio.test.ts`、`list-project.test.ts`、`liaison-role.test.ts`；`test/桌面UI/role-view.test.ts`、`judge.test.ts`、`i18n-b1-b2.test.ts`；`test/项目管理/shared/i18n.test.ts`；`test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts`；`test/测试/t9-block1-bootstrap.test.ts`；`test/测试/real-entry.test.ts`（复核无需改）；`test/桌面应用/genesis-bootstrap.test.ts`；`test/测试/governance-e2e-auto/q-role-granularity.test.ts`（复核无需改） | 六角色/主入口/显示名/能力/写区/UI/i18n 断言重写；`liaison-role.test.ts` 由 liaison 覆盖退役为 chief/product 覆盖（见 §四测试差异表）。 |
| 测试（amendment-1 最小断言同步） | `test/门禁引擎/{customer-card-rules,gate-review-flow-busy,governance-standard-workflow,requirement-change-cards,screenshot-only-evidence,verifier-artifact-report,view-image-cards}.test.ts`；`test/测试/governance-liaison-verify/{a-roles-writes-caps,b-intent-handoff,c-clarification}.test.ts`、`governance-liaison-verify/fixture.ts`；`test/测试/governance-trio-verify/c-migration.test.ts`；`test/测试/governance-e2e-auto/{i-full-chain,acceptance-triage-e2e,k-governance-feedback,l-crew-write-validation,m-lead-internal-choice,s-acceptance-rework-routing,t-gate-review-return-routing}.test.ts` | 仅改角色集/主入口/显示名/列表/能力矩阵与「主入口系统行接收角色」断言（liaison→chief/六角色）；不提前做 C/D/F 的实质重写/删除。 |

**零改动核对**：`package.json`/`package-lock.json` 零改动；未新增依赖；未改 `src/model/runtime.ts` 的 cardKind/卡组（本批不需要）；未改主检出、refactor-b1、gate-review-flow-busy、目标项目/演示；未新增仓库目录/文件（本变更包除外）。

### 1.1 目标写区（A-04 目标态，D 生效；本批不切换）

| 角色 | 目标写区（D） |
| --- | --- |
| chief | `docs/intents/`（可选） |
| product | `docs/product/` |
| rapporteur | `docs/proposals/`、`docs/contracts/` |
| nominator | `角色卡/`、`docs/skills/`、`docs/mcp/` |
| convener | `docs/scheduling/`（去 dispatch） |
| verifier | `docs/quality/`、`docs/verification/`（可选） |

**当前态（本批实测快照）**：chief=`docs/intents/`（承接旧 liaison）、product=`docs/product/`；rapporteur/nominator/convener/verifier 的 Section 1/预授权/禁写/能力位**逐字保留基线旧值**（含 convener `docs/flows/`、`docs/workflow.md`、`docs/scheduling/` 与 dispatch/status/tail/recovery 能力）。目标写区/去 dispatch 在 D 批随旧 flow/gate 与旧 e2e 删除同步切换。

---

## 二、结构与契约快照

六角色注册表（`node` 读注册表实测；完整 JSON 见验证日志）：

| 顺序 | id | 显示名 | 职能 | 当前写区（Section 1） | 当前能力位（简） |
| --- | --- | --- | --- | --- | --- |
| 1 | `chief` | 幕僚 | `chief` | `docs/intents/` | customerInput/handOffIntent/dispatchTask；无看护/安装；shell 审批档 |
| 2 | `product` | 产品 | `product` | `docs/product/` | 仅 customerInput；shell 审批档 |
| 3 | `rapporteur` | 策划 | `proposal` | `docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/` | requestClarification；shell 审批档 |
| 4 | `nominator` | 人事 | `nomination` | `角色卡/`、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` | installSkill/installMcp；shell 审批档 |
| 5 | `convener` | 运营 | `schedule` | `docs/flows/`、`docs/workflow.md`、`docs/scheduling/`、`docs/governance/convener/` | dispatch/roleStatus/sessionTail/proposeRecovery（保留到 D）；shell 审批档 |
| 6 | `verifier` | 质检 | `verification` | `docs/acceptance/`、`docs/verification/`、`docs/governance/verifier/` | 无附加能力；shell 审批档 |

- `listProject`（新空项目）：`primaryRoleId="chief"`；六角色顺序稳定；`liaison` 不枚举；`su` 不枚举。
- 旧 `liaison`：**只读别名**——`governanceRoleOf("liaison")`/`resolveRole("liaison")`/显式 `resolveGovernanceRole` 仍返回基线卡文本/边界/能力（存量旧会话兼容）；不进入 `BUILT_IN_GOVERNANCE_ROLES`/列表/UI/i18n；D 删除。
- 渲染层与 shared i18n：`rg "liaison" app/renderer src/common/shared/i18n` **零命中**（A-05）。
- 保留 id：`角色卡/chief|product|liaison|su/` 项目目录被跳过并警告，`roles` 映射不得遮蔽内置角色。

---

## 三、验证（2026-10-28，worktree 内）

### 3.1 命令与结果

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 依赖 | `npm ci`（锁文件安装；随后 `node node_modules/electron/install.js` 取 Electron 二进制，仅 node_modules） | exit 0 |
| 全量测试 | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`（仓库无 `npm test`；`write-sequencing` 与 S1 口径一致排除） | **见 §3.2（最终运行）** |
| 主 typecheck | `npm run typecheck` | exit 0 |
| 渲染 typecheck | `npm run typecheck:renderer` | exit 0 |
| 渲染构建 | `npm run build:renderer` | exit 0（产物不入候选） |
| 真实 Electron | `ANS_E2E_PROJECT=<worktree> node_modules/electron/dist/electron.exe test/桌面应用/e2e/main.mjs`（E2E 自建 fresh 临时 OUTDIR/userData，不指向目标项目） | **exit 0；`E2E_PASS=true`；`E2E_DONE=1`；`E2E_FAILURES=` 空；`BOOTSTRAP_PRIMARY=chief`**；报告 `C:\Users\51054\AppData\Local\Temp\ans-e2e-yikHmR\report.txt`（sha256 `34be31a3fea39d82d7ac87aed44da394b27e80eda4e145b675f76f780f9ef19e`；17 张截图同目录） |
| 结构检查 | 注册表快照/`rg`/`git diff --name-only`/`package.json` 零改动 | 通过（见 §二/§1） |

### 3.2 基线与本批对照（测试差异）

- **S1 基线（`8fc673e`）**：409 个 `*.test.ts` 枚举 / 408 执行（排除 hang 的 `test/pi-adapter/write-sequencing.test.ts`）；tests **4495** / pass **4460** / fail **16** / skip **19** / exit 1；双 typecheck + build exit 0；Electron `E2E_PASS=true`。
- **基线 16 红分类**：9 条 Windows symlink EPERM（`claude-adapter/session`、`codex-adapter/session`、`pi-adapter/injected-runtime`×2、`runtime-core/file-write-safety`、`runtime-core/session-store`×2、`测试/g4-skill-verify/b-render-double-check`、`编排/shell-authorized-routine`）+ 7 条断言既红（`桌面应用/acceptance-dispatch:7756`、`测试/governance-e2e-auto/k-governance-feedback`、`测试/governance-e2e-auto/s-acceptance-rework-routing` S7-F、`测试/governance-liaison-verify/e-audit`、`测试/t1-pipeline-integration`×3）。
- **本批最终运行**：**新增确定性失败 = 0**；无新增 skip（skip 19）；基线 16 红逐项复核（其中 1 条在本候选转绿，见下；其余分类不变、未掩盖）。

- **本批最终运行（2026-10-28，worktree 当前候选）**：文件枚举 **409** / 执行 **408**（与 S1 同口径排除 `write-sequencing`）；tests **4499** / pass **4465** / fail **15** / skip **19** / exit 1；原始日志 `/tmp/final-tests.log`（sha256 `3b85624e34599c882edff766a3a0b0bcf4a45391447e51236b513f4bf02c2042`）。
- **对照 S1（4495/4460/16/19）**：tests **+4**（`liaison-role.test.ts` 重写 9→13 个 `test()`）；pass **+5**；fail **−1**（16→15）；skip **19 不变**。
- **本批 15 红分类**：**9 条 Windows symlink EPERM**（`claude-adapter/session`、`codex-adapter/session`、`pi-adapter/injected-runtime`×2、`runtime-core/file-write-safety`、`runtime-core/session-store`×2、`测试/g4-skill-verify/b-render-double-check`、`编排/shell-authorized-routine`）+ **6 条基线断言既红**（`测试/governance-e2e-auto/s-acceptance-rework-routing` S7-F、`测试/t1-pipeline-integration`×3、`测试/governance-e2e-auto/k-governance-feedback`、`测试/governance-liaison-verify/e-audit`）。**新增确定性失败 = 0；无新增 skip；未删除/弱化测试断言保绿。**
- **基线红转绿 1 条**：`test/桌面应用/acceptance-dispatch.test.ts:7756`（gate 路由记录写失败）在本候选实测通过——基线既有红属环境/时序敏感，本批未以它为目标、也未据此声明修复；D 批随 `acceptance-dispatch` 重写。故 fail 16→15、pass 相应 +1（另 +4 为新增 `test()` 用例）。

### 3.3 测试差异表（逐文件）

| 文件 | 处置 | 原因/断言变化 |
| --- | --- | --- |
| `test/门禁引擎/governance-trio.test.ts` | 重写 | 注册表六角色/显示名/职能；Section 1/预授权/禁写/能力位快照改为「现行旧态」；旧角色卡文本断言收窄到旧五名（含 liaison 别名）。 |
| `test/门禁引擎/list-project.test.ts` | 重写 | trio 列表六角色/`primaryRoleId=chief`/reserved ids 增加 chief/product；single 断言不变。 |
| `test/门禁引擎/liaison-role.test.ts` | 重写/退役 | 由 liaison 覆盖改为 chief/product 覆盖（列表/写权/能力/卡文本/保留 id/旧 liaison 别名/`resolveGovernanceRole`），测试数 9→13。 |
| `test/门禁引擎/{customer-card-rules,gate-review-flow-busy,governance-standard-workflow,requirement-change-cards,screenshot-only-evidence,verifier-artifact-report,view-image-cards}.test.ts` | 最小断言同步 | 仅「注册表恰为旧五角色」改为六角色；governance-standard-workflow 旧卡文本循环收窄到旧五名；其余断言不变。 |
| `test/桌面UI/role-view.test.ts` | 重写 | 六角色映射（chief/product）；主入口分组 fixture 改用 chief。 |
| `test/桌面UI/judge.test.ts` | 最小同步 | 新增 chief/product shell 标题断言；其余不变。 |
| `test/桌面UI/i18n-b1-b2.test.ts` | 最小同步 | judge roleName key 改 chief/product；governanceView 改 chief/product；其余不变。 |
| `test/项目管理/shared/i18n.test.ts` | 重写（key 计数） | 总 key 1395→1399；ui 792→796；judge/roleName 与治理角色名断言改六角色；补 judge 增补 key 数 10→11。 |
| `test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts` | 重写 | 列表六角色/primary=chief；governanceFunction 会话新增 chief/product；写权/能力/审批档断言保持现行旧态。 |
| `test/测试/governance-trio-verify/c-migration.test.ts` | 最小断言同步 | 迁移后列表六角色/primary=chief；其余不变。 |
| `test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts` | 最小断言同步 | 列表六角色/primary=chief；旧 liaison 卡文本改经只读别名断言；写权/能力矩阵保持旧值。 |
| `test/测试/governance-liaison-verify/{b-intent-handoff,c-clarification}.test.ts`、`fixture.ts` | 最小断言同步 | 主入口/系统行接收角色 liaison→chief；fixture `builtInRoles` 增 chief/product（旧 liaison 仍保留别名）；ledger `power` 仍断言旧 `liaison` 审计标签。 |
| `test/测试/governance-e2e-auto/{i-full-chain,acceptance-triage-e2e,k-governance-feedback,l-crew-write-validation,m-lead-internal-choice,s-acceptance-rework-routing,t-gate-review-return-routing}.test.ts` | 最小断言同步 | 主入口/系统行/返工路由接收角色 liaison→chief；文本断言「产品（liaison）」→「幕僚（chief）」；流程/卡/门禁逻辑断言不变。 |
| `test/测试/governance-e2e-auto/q-role-granularity.test.ts`、`test/测试/real-entry.test.ts` | 复核（未改） | 无旧角色集断言，实际运行通过。 |
| `test/桌面应用/genesis-bootstrap.test.ts` | 最小断言同步 | trio 主入口断言 liaison→chief；source 仍含 primaryRoleId。 |
| `test/测试/t9-block1-bootstrap.test.ts` | 重写 | IPC listProject 六角色/chief/职能列表；其余不变。 |

**测试数变化**：+4 个 `test()` 用例（`liaison-role.test.ts` 9→13），加上既有用例不变；最终 tests 计数与 S1 的差值须与此一致（见 §3.2）。

---

## 四、行为保持与中间态限制（如实披露）

1. **旧 gate/flow/ledger 代码与旧写区/能力矩阵保留到 D**（amendment-1）：convener 仍可 dispatch/写 `docs/flows/` 等；verifier 旧写区不变；旧 e2e 全链路在 A 下保持通过（除基线既红）。
2. **chief 承接旧 liaison 的旧流程路径**：intent-confirm/`hand_off_intent`/旧 coordinate 门；`validateIntentHandoff` 与旧 gate 内部仍认 `liaison` 字面值——由编排/桌面在入口处归一为只读别名值（不改变旧门行为）。
3. **chief 的新能力（星形派发任意角色、role_status/session_tail 注入、role_activity_log）在 B 批新增**；convener 去 dispatch 在 D 批。本批 chief 的能力位=旧 liaison 值，convener=旧值。
4. **旧 `liaison` 只读别名仍可解析/开会话**（不进入列表/UI/i18n）；D 批随旧角色/旧流程删除。
5. **目标写区**（§1.1）未在本批生效，D 批切换；A-04 判定口径按 amendment-1 记录为「目标态已定义、D 生效」。
6. 本批未改申请/决策/flow 行为；未新增 cardKind（`write`/`schedule-write` 仍留到 C/D）。

## 五、回滚

- **已提交**：`git revert` 本批提交（单一提交，含源码/测试/本文件），重跑批次 A 全部验证（全量测试 + 双 typecheck + build:renderer + Electron E2E + 结构检查）。
- **未提交**：将 §一列出的文件恢复到基线 `8fc673e` 并重跑同组验证。
- **数据**：无数据/schema 迁移；旧账本/flow 文件未写入、未迁移；旧 `liaison` 别名随 revert 消失；`.ans` 无新增状态。
- **范围**：仅 worktree/分支；main 未被触碰；不 push/不合并。

## 六、证据路径

- 最终全量测试原始输出：`/tmp/final-tests.log`（sha256 `3b85624e34599c882edff766a3a0b0bcf4a45391447e51236b513f4bf02c2042`；Windows 临时目录同一文件）。
- 双 typecheck / build 输出：`/tmp/final-typecheck.log`（sha256 `aee168652259817d015b93dfeec328925fe0dc72c59b689ed06560ab0abe6cbd`，exit 0）、`/tmp/final-typecheck-renderer.log`（sha256 `914780f65ceb172dd3e1640d8c55a7cc6911a6dc8cd7d5680f1d5f35f46fad72`，exit 0）、`/tmp/final-build-renderer.log`（sha256 `02eb53c55e6d71a1741c900848c63134bbe8bc6cd49e644c7000b54f878c0830`，exit 0）。
- Electron 报告与截图：`C:\Users\51054\AppData\Local\Temp\ans-e2e-yikHmR\report.txt`（sha256 `34be31a3…`）及同目录 `*.png`。
- 注册表快照/`rg`/`git diff --name-only`：见 §二与命令输出；逐文件哈希见附录。

## 附录 A：候选逐文件哈希（`git hash-object` + `sha256sum`）

| 文件 | git hash-object | sha256 |
| --- | --- | --- |
| `app/desktop/project.ts` | `607f26217d3024fc501b95b004ab5ce6855a1b11` | `3b7a1498dd9d894b54af7cdb2b42913b2320edd50387fa17dfb1c2504554737a` |
| `app/desktop/session.ts` | `cb97f4c34a70ba091bf8d7dc2c24d59456c98b68` | `da8666f014d020cca9df4c3ce3aa4896c1201881431d8c9774b1ae303da83793` |
| `app/renderer/src/chat/governance-view.ts` | `f9ced12ed29b667649411167227d4e0cf0d22349` | `3cd193550f2cdcd849cb74ea008a59024483dcfbe3906abfcb7a5e5b7cdd13af` |
| `app/renderer/src/chat/judge.ts` | `4c2c73a2e86792bbef63847a84200d3778e7b5fc` | `ecd8a333b7a42d55ab9334970987f972b6f71d19e69893f95b4f1f903786676c` |
| `app/renderer/src/chat/role-view.ts` | `e0925eda7188fa549e903c3323a3f3e40c9279a1` | `830a760f0809ddef133337729b1fd25fce9733b895264a87ff5f95f4f1408896` |
| `src/common/shared/i18n/messages/en-US.ts` | `99ca2d4be920057a6562fd7ee7b7a3010fe9c342` | `fc5231dfaaada3663ddcbd1250c81b143f5e6b8278d96a2cd1f4d91d8c3877b9` |
| `src/common/shared/i18n/messages/zh-CN.ts` | `5c37936879a01ad3ae1db097ff63d28082fba5d1` | `e11f1756db36118c26d7f9c5b858918a5d1c8e7e5d21e6aba7a60ee013ddc03d` |
| `src/common/门禁引擎/governance-roles.ts` | `5f068ade221adbb4373954ee2010f7ed00cceca3` | `3c58ebdd20b49cd0108de6064c5b05f51c803f14978faf8aa072467d5695d15d` |
| `src/model/role.ts` | `fbc8527cf05e16a946431e00eb8448e3cf9f0bd2` | `cd2cb31fd73d268d706e1ff77fbdfb45d751583fa8a70efb54b2690de98838cd` |
| `src/pipeline/orchestration/govern-session.ts` | `80ed4199aa234b9487f2376c84ac0322cc1cbd63` | `e6e2a953d301f0852a9ceeaae416074625e92174b830001d73060e1da5987a04` |
| `src/pipeline/orchestration/run-role.ts` | `cd6e91a414dfb540849279c60fd09ce987c8a52d` | `39c8b789b1c4a533791042af45745e5f6420f3d9b09a2468a31572c43bcc0dae` |
| `src/service/boundary/resolve-boundary.ts` | `ad9ba8bf158f084d351bd50350864b008517e0af` | `546b21c5fa00a005b3ace4f90e58b1085f32b0da7f976c5e0da7f1260674e6e3` |
| `src/service/role/resolve-role.ts` | `63b57b0a36a2ff72ac6663aa81b4f93e31d9a245` | `00dfd5ec0b24822d238cafe7ebd2ffd068ef370b2fa80557132a9b3fc06f6df7` |
| `test/桌面UI/i18n-b1-b2.test.ts` | `1cb8105904747234d9f18cf3d499e2df71d34e9b` | `d755e07f5cc08934cddbc40fd4290a6ba96c121e3497d72808d39625c8c112d4` |
| `test/桌面UI/judge.test.ts` | `2e03944f8421af41babb23cf40b094676d6baecd` | `78fa73ccd05357cbfe5e41344e34295a8a6b95c3854e98158fdcf0d653314768` |
| `test/桌面UI/role-view.test.ts` | `99071b1b70e65fc768b0c3c4d7fca0808be0f6e8` | `e2cd6dc6ffef8150844c2f6baef937784fd06a3a1f93731e31fc70d9c25e3c94` |
| `test/桌面应用/genesis-bootstrap.test.ts` | `2fd53a177042a4c763038a217ff5723fe492529f` | `f67c626a7e8474e5303eb2cc6c1548674fbd2a32d36a05fd76dce7f937bdc55c` |
| `test/测试/governance-e2e-auto/acceptance-triage-e2e.test.ts` | `0cdcfd81dc96ff7d9b8a93dae0a5514c9aad0ff5` | `7dc43a92b9175ee24dec3da24d52cbd349c769dc46c2adc5da5345885b74b217` |
| `test/测试/governance-e2e-auto/i-full-chain.test.ts` | `e32e543beae0ccf15ae234da8288f61ed1822266` | `eaeccb59e4fada5ad05e9da94364fef4dfbe5d493df76d9504882c9f5f07c067` |
| `test/测试/governance-e2e-auto/k-governance-feedback.test.ts` | `34c8cbae83947e1decc99885d1c5b190fd3fbf9d` | `286e083ffb8b089a9a6bf6633be4d7efbdf8f085d4ddcd091f36190818d2f12b` |
| `test/测试/governance-e2e-auto/l-crew-write-validation.test.ts` | `69f21035a349a4d9f0b8633a562e695d877753da` | `be4aadc13d1264b58b8fda9834e7fa7a77ead17bc29d16436e20f3b74cb48c2d` |
| `test/测试/governance-e2e-auto/m-lead-internal-choice.test.ts` | `5ecd346331eb8d56115d5a90c5442dfc3acfea0a` | `60e01a2f937b672f234cd2d425bc1c226cba4fc2b37fd60fa09ff573d0ce6bf4` |
| `test/测试/governance-e2e-auto/s-acceptance-rework-routing.test.ts` | `d29f8704da95bbda9182a1691a0d73805d5464f7` | `36f14ee29d27e7daf4ab9b2b5ff22c234da5e5c642660d302c13c0dcc37e4d45` |
| `test/测试/governance-e2e-auto/t-gate-review-return-routing.test.ts` | `7aad837e3f684b6656876e569979771e34d6a2a2` | `e872541e7428c6c9202dbc6b530982d2ba89e5635618c51c385583fd1b8e304a` |
| `test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts` | `bb017cfe9d5ac165631e2319ee87ad72c06579a7` | `4f7f1540e949a72a8e2cd9bbb1f5bc917afa7e18ea24b807e6e31586bcabb6c9` |
| `test/测试/governance-liaison-verify/b-intent-handoff.test.ts` | `52983e6ff68540306d163e957aed0ed8b741de1c` | `0164cbcd515bddc339046fc2d83462f18c263ec877293f55893e9e2445ec6813` |
| `test/测试/governance-liaison-verify/c-clarification.test.ts` | `ff58ab9e9d16851fdb366eaa219b9adf301813dd` | `3c40a4e26bf15983cfe7e3c1a36f23284be3a2acbc9fe4494729528aefc258b8` |
| `test/测试/governance-liaison-verify/fixture.ts` | `86462995e6bb3851cd6dd1ca72fb6b9fed25fd4e` | `06ae10d258d6fcbd88a9a2a7650770c1c3bca465d942b0b78fb0a7e9862a4332` |
| `test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts` | `c034456b8e56132e0568fc123b6b2792fa82a6cb` | `a4eb213292802e4062f69033b6cf0b406906540bb332af4666fe82b80b036efa` |
| `test/测试/governance-trio-verify/c-migration.test.ts` | `28f3a2969fa2efd1323792402ccac8deb2d75802` | `65a3a404c6bdc55270ed7cb5e001160740a9ed94b16e02563fb139ab46f873d6` |
| `test/测试/t9-block1-bootstrap.test.ts` | `40fb481052479237b3169b9f2e576f6c77cb4a24` | `120df9c43d6852f90947a8eda09533f8d58e2106f8b20213086ae098f38728b1` |
| `test/门禁引擎/customer-card-rules.test.ts` | `834b0f5b5f27102fd38dd9e085a16db5f55e5cf4` | `281dd4eed6b019365bddec865bcad0975e78dd8ab84c3fa1dc027a3a7d245499` |
| `test/门禁引擎/gate-review-flow-busy.test.ts` | `95da322926b8413f09def6901b6f0e489adb1a2f` | `7a25227e9c07ded20d203502a7f85b12e4ee6567fe955bb8e665bdb946dfe6e8` |
| `test/门禁引擎/governance-standard-workflow.test.ts` | `63fb15fe8776d383c26ec12544f644a36c0bc650` | `2870e5ee3b93b26ef9e79a9dc66694335289a205dda4f008a6c2007f5ef2256a` |
| `test/门禁引擎/governance-trio.test.ts` | `e27d01dcee9a2fdf0ed0612ee9ac8087329dd913` | `c8cb94287ef622050e2bfd791e94a7334bcaf4f6e2a37a6d57b309ea19904d17` |
| `test/门禁引擎/liaison-role.test.ts` | `ee6af666a87aa70deec82664199daba68ede9da7` | `061637ffdc25834726472c9a03add768cbcd94592e568e46a6e49eca17e3eb24` |
| `test/门禁引擎/list-project.test.ts` | `93970af47636742881a3835f49fbd30c6ba9596f` | `5949963b8dc114d91c8e47b947f036af52ed5e0aa01f1bf70f77fb24df70282d` |
| `test/门禁引擎/requirement-change-cards.test.ts` | `074bbac8afe305cb6ab096ce65cd092e16f0bd03` | `4927b683515e813942b3bf09cb0301df22422fabed19d77783d3087c14d69cca` |
| `test/门禁引擎/screenshot-only-evidence.test.ts` | `74ded6aafc2d382420b726ca8cda14c62a4e93b8` | `7a97d6f92faa90b80ca54ab11f0cd3d7fae1b953fefbfa29f043218ee2620b54` |
| `test/门禁引擎/verifier-artifact-report.test.ts` | `9a586998c383679b5b4f2cb817ea4f759b677190` | `74d1e22fe201680a314d06fb407f95ac22f2ae467d05db474090ea333f5aec93` |
| `test/门禁引擎/view-image-cards.test.ts` | `47d09aba5bf2c4ba782a42d5400b3f1617fb0b46` | `f53aa4da689c51741268c7ee2b5ffed6659a2f0082c424a4e878f3c3c5b7d056` |
| `test/项目管理/shared/i18n.test.ts` | `24aa5dc3e63c7ae2cbaeec12185f332d6864c4f2` | `4c1a71ddd8e455dc54d6584c6d7b26a464cb4bc81831ef0b1e918d5c19d908b4` |

- 整树标识：`git diff --binary | sha256sum` = `46af3a06c1811547663bf949e849cd8a81c0ced2fb2ac3444f39d91f5a2a4661`（本文件生成后若再次编辑，见提交前重算记录）。

## 附录 B：发现项/需决策点

1. **写集外最小 shim（已实施并登记）**：`src/service/boundary/resolve-boundary.ts`（类型 re-export）、`src/pipeline/orchestration/govern-session.ts`（label/discipline 类型 shim）、`app/desktop/project.ts`（旧 liaison 登记 builtInRoles）。均为「旧 liaison 只读别名 + typecheck」所需，无行为变更；若统筹/验收认为应回到严格写集，需在 B 批前重新裁定。
2. **旧测试最小断言同步（amendment-1 授权）**：见 §3.3；C/D/F 的实质重写/删除仍留在附录 A 指定批次。
3. **基线既红 7 条断言**：本批未修复、未掩盖；其中 `k-governance-feedback`/`e-audit`/S7-F 等涉及旧 liaison/旧文案，D 批删除或重写。
