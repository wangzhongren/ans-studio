# 变更记录：治理分工第 1/3/5 项（门禁引擎角色卡文本与注册表写权）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-10-22
- 角色：门禁引擎（Gate Engine）
- 任务 ID：`2026-10-22-governance-split-1-3-5`；阶段 C（门禁引擎角色卡文本与注册表写权）
- 依据：客户闸门 2 确认与实施授权（`docs/communication/2026-10-22_intent_governance-split-1-3-5.md`）；团队计划 `docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md` §4.2/§5.1 N5/§6/§11.7；策划方案 v1 `docs/planning/2026-10-22_design_governance-split-1-3-5.md` §5.2/§6.1/§10.1/§11/§12；验收标准 v1 `docs/acceptance/governance-split-1-3-5-criteria-v1.md` P1/P2/P4/P6/P7/P8/P14。
- 范围：只改本角色授权写集；未开始阶段 D，未改编排文件，未提交/暂存/推送/发布。

## 1. 写前基线核对（2026-10-22）

- `git rev-parse HEAD` = `c3693ecdcb78bd83def351c0f2967571dad7174c`（与任务预期一致）。
- `git hash-object`：
  - `src/common/门禁引擎/governance-roles.ts` = `551b082d50ae4915e4440098c094a495773c79c3`（与任务预期一致）
  - `test/门禁引擎/governance-trio.test.ts` = `ead88b0363c4c63271232b01412aadc0eda3cc3d`（一致）
  - `test/门禁引擎/governance-standard-workflow.test.ts` = `bc044de053deeeb127dffef129a327ff48b12572`（一致）
- `git status --short`：工作树已有阶段 B 运行时核心改动（`src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、`test/runtime-core/governance-flow-metadata.test.ts` 及运行时核心自身文档）与治理文档未跟踪文件；**不含本角色目标文件**，属计划预期。
- `git diff --name-only`：上述已跟踪改动；`git diff --cached --name-only`：空。目标文件无他人改动，未覆盖任何并发工作。

## 2. 改动摘要

### 2.1 五张卡文本（`governance-roles.ts`）

| 卡 | 改动 |
| --- | --- |
| `NOMINATOR_CARD_TEXT`（Crew / 组队） | 移除「提名权——选择角色、组建团队」、`docs/nominations/**` 与 appointment 卡发起；改为「写卡权（客户任命后）」：读客户确认后的团队计划 → 只对任命名单内角色发 `appointment-write` → 逐路径写卡/工作文档；新增「第 5 项内容清单（必须）」1–7 条（覆盖 role-card 九章节、boundary 必填条目、feature-map、functional-description、memo、api-spec/not-applicable、feature/design/change/fix 按实际）；保留技能/MCP 安装、declined 重发、写后应用校验、边界模板与 flow 工具纪律。 |
| `CONVENER_CARD_TEXT`（Steward / 统筹） | 新增「团队判断与团队计划（必须）」6 条：团队判断、团队计划 `docs/scheduling/<flowId>-team-v1.md`（唯一作者）、机器字段（flowId/version/riskTier/`recommended: [role-a, role-b]` 内联数组/角色行）、`request_choice(cardKind=appointment)` 卡与校验、`role-readiness`（pass/gaps 记录与 gap 回路）、变更包 `docs/scheduling/<flowId>-change-v1.md`；标准工作流扩为 8 步；保留不写角色卡/不创建角色；写区与预授权 +`docs/scheduling/`；卡参数纪律允许 appointment 这一种治理选择卡。 |
| `VERIFIER_CARD_TEXT`（Proof / 验收） | 增加实施前完成标准 `docs/acceptance/<flowId>-criteria-v1.md`（验收表/档位/判定规则/证据计划/冻结规则）、风险档位 T0–T3、变更包核对与证据复用/失效、只补缺失/失效/高风险检查、只能升档不能降档、报告 `docs/acceptance/<flowId>-report-v1.md` 首行五项、insufficient evidence 不弹卡；写区 +`docs/acceptance/`（`docs/verification/` 保留为详细证据附件）；真实启动/演示基线要求不变，明确证据由实施/装配/测试角色按团队计划产出、Verifier 核对并可亲自复跑。 |
| `LIAISON_CARD_TEXT` / `RAPPORTEUR_CARD_TEXT` | 治理文件命名段增加团队计划路径；旧提名 `docs/nominations/<flowId>-v1.md` 标为 legacy（只读历史/过渡）；提案/流程/意图命名规则不变。 |
| 五卡共同 | 命名段统一为「提案 / 团队计划 / 流程 YAML / 意图 / legacy 提名」；其余既有纪律（shell 审批档、质量基线、判断代批、卡参数纪律、写区/禁写）逐字保留。 |

### 2.2 注册表 `BUILT_IN_GOVERNANCE_ROLES`

| 角色 | entries | preauthorizedDirs | forbiddenWritePaths |
| --- | --- | --- | --- |
| `liaison` | 不变（`docs/intents/`） | 不变 | 不变 |
| `rapporteur` | 不变 | 不变 | 不变 |
| `nominator` | 移除 `docs/nominations/`；`角色卡/`、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` 保留 | 移除 `docs/nominations/`；其余保留 | 新增 `docs/scheduling/`；其余保留 |
| `convener` | 新增 `docs/scheduling/`（团队计划 / readiness / 变更包）；其余保留 | 新增 `docs/scheduling/`；其余保留 | 不变（仍禁写 `角色卡/`、`docs/nominations/` 等） |
| `verifier` | 新增 `docs/acceptance/`；`docs/verification/`、`docs/governance/verifier/` 保留 | 新增 `docs/acceptance/`；其余保留 | 不变 |

未改：内部 id、显示名、`GovernanceFunction` 值、`GovernanceCapabilities` 能力位、`ENGINEERING_QUALITY_BASELINE` 文本、`appGovernanceBoundary` 四项、所有导出函数签名；未新增 `cardKind`。

### 2.3 越界归属提示 `LIAISON_WRITE_OWNER_HINTS`

- 新增 `docs/scheduling/` → Steward / 统筹（流程/团队计划/变更包/编排）。
- 新增 `docs/acceptance/` → Proof / 验收（验收标准/报告/核对报告）。
- Crew 提示移除 `docs/nominations/`，仅为 `角色卡/`、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` 指路。
- legacy `docs/nominations/**` 不再归属 Crew 写区；Liaison 越界拒绝文案对其只保留通用拒绝头。
- 其他角色提示逐字不变。

### 2.4 写权前后对照

| 角色 | 改动前可写（Section 1） | 改动后可写（Section 1） | 关键禁区 |
| --- | --- | --- | --- |
| Convener | `docs/flows/`、`docs/workflow.md`、`docs/governance/convener/` | 上述 + `docs/scheduling/` | 仍不授予 `角色卡/`；`docs/acceptance/` 仍拒 |
| Crew | `角色卡/`、`docs/nominations/`、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` | `角色卡/`、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` | 移除 `docs/nominations/`；新增禁写 `docs/scheduling/` |
| Verifier | `docs/verification/`、`docs/governance/verifier/` | 上述 + `docs/acceptance/` | `docs/scheduling/`、`角色卡/` 仍拒 |
| Liaison / Rapporteur | 不变 | 不变 | `docs/scheduling/`、`docs/acceptance/` 均拒 |

## 3. 检查命令与结果

环境：Windows 11 Pro（10.0.26300）、Git Bash、Node v24.22.1、npm 11.19.1；cwd `C:\Users\51054\Desktop\work\ans-studio`；`PATH` 前置 `/c/Users/51054/AppData/Local/Programs/nodejs`。

| # | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| 1 | 改动前 `node --test test/门禁引擎/governance-trio.test.ts test/门禁引擎/governance-standard-workflow.test.ts` | 未单独留证（经管道） | 49 计 / 49 过 / 0 失败 / 0 skip（node 输出） |
| 2 | 改动后同上（定向） | 0 | **52 计 / 52 过 / 0 失败 / 0 skip** |
| 3 | `node --test "test/门禁引擎/**/*.test.ts"`（全角色套件） | 0 | **305 计 / 304 过 / 0 失败 / 1 skip**（Windows 既有 skip） |
| 4 | `npm run typecheck`（首次，改动后立即） | 0 | `tsc --noEmit` 通过 |
| 5 | `npm run typecheck`（写文档前复跑） | 1 → 最终 0 | 中途复跑曾因并发编排改动 `src/pipeline/orchestration/run-role.ts(2129,96) TS2554` exit 1（边界外，未改）；编排属主修复后**最终复跑 exit 0**（`tsc --noEmit` 通过）。本角色改动文件始终 0 错。 |

定向用例覆盖：卡文本断言（Crew 无提名权/不发 appointment、Convener 团队计划/appointment/readiness/变更包、Verifier 标准/档位/复用/报告）、注册表 entries/preauthorized/forbidden、写权正负例（Convener 不能写角色卡、Crew 不能写 nominations/scheduling、Verifier 能写 acceptance、Liaison/Rapporteur 不获得新目录）、P6 矩阵、P7 内容清单、P8 readiness、liaison 越界归属提示（scheduling/acceptance/legacy nominations）。未删除测试、未放松既有断言；旧断言按真实行为变化同步更新。

## 4. 候选哈希（工作区，写文档前）

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/common/门禁引擎/governance-roles.ts` | `4573b5cc2da48f79e5abd3ed5e76503ac120a471` | `d82f6fae973dd08e56aee1a4e081115a6444482f2786ec33b4796faeec0a3d1f` |
| `test/门禁引擎/governance-trio.test.ts` | `daaa9f4f7e01a499b4929a5b3470688d28bb2f08` | `880e9442f2fc76c9ea64e56d8022fd68e26ce24c4db9f11be0bd8d0e14acb09e` |
| `test/门禁引擎/governance-standard-workflow.test.ts` | `813b46939417c93c52d02e982e5a5a219a06d884` | `0b0ec21366b587d038d5b1f3b8af8559943b24a489d5a2fdf5632cfa88d15b02` |
| `test/门禁引擎/liaison-role.test.ts` | `7721c99f7de3d15ff38a248b6f1d1f6f0f7ea353` | `bdf24561cd87061b61cb7793f57044cf2c074989b5501d9076062156c43a38b8` |
| `角色卡/门禁引擎/api-spec.md` | `78a569264f4d10bf84e2f5d6565c5bcc465a1976` | `ad79ffabb899126c66bb1d86a1be66f639545fc974b6a55909826de81472fe6f` |
| `角色卡/门禁引擎/memo.md` | `c67e4af1d77cfe203d9e48fa264d3f129bad6d6b` | `8ee9a27eb5436e19e4c53410a42839b2dfe7743bddc2fd4c01fa3dd6d2417a3a` |

本变更记录自身的最终哈希由角色交付报告记录（自引用无法在文内稳定列出）。

写后 `git diff --name-only -- src/common/门禁引擎 test/门禁引擎`：仅上述四个文件；`git diff --stat -- src/common/门禁引擎 test/门禁引擎`：4 files changed，364 insertions(+)，161 deletions(-)；`git diff --cached --name-only`：空（未暂存）。本角色文档改动另见第 4 节哈希表；完整写集状态见角色交付报告。

## 5. 未做项与跨角色影响（未越界）

- **编排**：`TRIO_CARD_KINDS`（nominator 去 appointment、convener 加 appointment）、Convener appointment 卡前团队计划守卫、`write-team-plan` 门禁动作、`governanceActionForPath` 对 `docs/scheduling/<flowId>-team-vN.md` 路由、appointment→Crew / 写卡→Convener 回路、`validateAppointmentArtifacts` 第 5 项结构校验、criteria/change-package/riskTier 判断门槛、报告路径。
- **桌面窗口**：`deriveGovernanceNextStep`/`advanceGovernanceFlow` 的 appointment→Crew 与写卡→Convener、去重/重启、`dispatchAcceptanceForFlow` 标准门槛、`noteVerifierSettle` 报告路径。
- **桌面UI**：appointment 徽标/提示、Crew 提示、Verifier 提示与报告路径文案。
- **测试角色（阶段 E）**：`test/测试/**` 旧断言需同步，已知可能转红：`test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts`（nominations 归属 Crew）、`test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts`（旧 registry 值）、`test/编排/governance-session.test.ts`（Crew 提名权提示）等；这些文件不在本角色写集，未修改。
- **运行时核心**：阶段 B 已完成；本批未改 `src/model/runtime.ts` 等冻结文件。
- 未进行真机端到端、未独立验收；未提交、未暂存、未推送、未合并、未发布；未运行 `npm install`，未改 `package.json`/`package-lock.json`，未新建 `test/桌面应用/` 文件，未写 `docs/scheduling/` 或 `docs/acceptance/`，未开始阶段 D。

## 6. 与方案的偏差

- 无功能性偏差。实现细节与方案一致；`api-spec.md` 采用增量章节记录，不改写历史段落（历史快照仍保留旧日期口径）。
- 方案 §5.6 提到五张卡的文件命名段统一增加团队计划路径并把 nominations 标 legacy；本批按该口径在五张卡统一落地（任务书第 4 条点名 Liaison/Rapporteur，其余三卡按同一设计口径同步，未改提案/flow/intent 命名）。

## 7. 声明

本角色只在授权写集内修改：`src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-trio.test.ts`、`test/门禁引擎/governance-standard-workflow.test.ts`、`test/门禁引擎/liaison-role.test.ts`、`角色卡/门禁引擎/api-spec.md`、`角色卡/门禁引擎/memo.md` 与本文件。未越界、未提交/暂存/推送；统筹可复核并安排独立验收。
