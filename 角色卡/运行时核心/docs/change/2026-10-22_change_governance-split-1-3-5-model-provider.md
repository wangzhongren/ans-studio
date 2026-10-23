# 变更记录：治理分工第 1/3/5 项 — 阶段 B Model/Provider 契约冻结

- **任务 ID**：`2026-10-22-governance-split-1-3-5`（节点 N4，阶段 B）
- **执行者/角色**：运行时核心（独立固定角色上下文）
- **日期**：2026-10-22
- **状态**：`implemented-unverified`（实现完成、本角色自测通过；未提交、未推送、未验收）
- **依据**：客户确认的策划方案 `docs/planning/2026-10-22_design_governance-split-1-3-5.md` §8.2/§10.1、团队计划 `docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md` §4.2/§5.1 N4/§11.5、实施前验收标准 `docs/acceptance/governance-split-1-3-5-criteria-v1.md`（P5/P10/P13/P14/P15 与 §4.3）。
- **授权写集（实际只动这些）**：`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/governance-flow-metadata.test.ts`、`角色卡/运行时核心/api-spec.md`、`角色卡/运行时核心/memo.md`、本文件。
- **环境**：Windows 11 Pro 10.0.26300 / Git Bash；Node **v24.22.1**、npm **11.19.1**（`export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`，每条命令先设置）。

## 1. 写前基线（2026-10-22）

- `git rev-parse HEAD` = `c3693ecdcb78bd83def351c0f2967571dad7174c`（与任务书一致）。
- `git status --short`（写前）：` M docs/communication/memo.md` 及既有未跟踪文档（`docs/acceptance/…criteria-v1.md`、`docs/communication/2026-10-22_intent_governance-split-1-3-5.md`、`docs/planning/`、`docs/scheduling/…team-plan.md`、`角色卡/测试/docs/change/2026-10-22-…baseline-evidence/`、`角色卡/测试/docs/change/2026-10-22_change_…baseline.md`）。其中 `docs/communication/memo.md` 为**沟通角色**在闸门 2 记录中已有的修改（属其写区，本角色未触碰）；既有未跟踪文档均为统筹/测试/沟通产物。
- `git diff --name-only`（写前）：`docs/communication/memo.md`（外在预置改动，非本角色）。
- `git diff --cached --name-only`（写前）：空。

四个基线文件哈希（与任务书逐字一致）：

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/model/runtime.ts` | `f639e91d382990d83be25bf7fb77dfe3e6b25812` | `cf42391948762876d8ccb571d7bf70d1d53ebdb22764bb9272ed0325c9b37f05` |
| `src/provider/runtime/tools.ts` | `f352984d03ef7f24fe3dcb6a20bd3cbf6a62e8e2` | `464c5a4a73b7a5d3fc8d2882e137d1d3ba496975ee8f0ab3c15f3f860ef4da63` |
| `src/provider/runtime/schema.ts` | `c7e36956021fa40ddf08623584a907b7c76c330e` | `ccc41388f0976f1bad31602871eb59eb6d07f3093c7660cd83fe96fcbe3b529d` |
| `test/runtime-core/governance-flow-metadata.test.ts` | `22b44f8405773cbc7e2ba405d2b619574fccb8fd` | `60893a5cd740724ca4f90d783a1642c4232e3bfc1dfa8c3551fd060261493d6e` |

写前基线测试（用于分类既有失败，不是本阶段交付证据）：`node --test "test/runtime-core/**/*.test.ts"` → exit 1；**288 计 / 281 过 / 3 红 / 4 skip**；3 红均为本机 Windows 无 symlink 权限的既有环境失败（`test/runtime-core/file-write-safety.test.ts` D3 linked workspace ×1、`test/runtime-core/session-store.test.ts` ×2）。

## 2. 改动摘要

本阶段只做**契约层可选加法 + Provider 文案**；不实现门禁/编排/桌面（阶段 C/D），不改任何角色 id/显示名/`GovernanceFunction`，不改工程基线文本。

### 2.1 `src/model/runtime.ts`

1. `GovernanceAppointmentStepPayload` 增可选 `teamPlanPath?: string`（团队计划 `docs/scheduling/<flowId>-team-v<n>.md`，第 1 项）；`nominationPath?: string` 保留为 **legacy**（`@deprecated` 注释）。
2. `GovernanceJudgeRequest.artifacts` 与 `GovernanceJudgeContext.artifacts` 增可选：
   - `teamPlanPath?`（第 1 项）
   - `acceptanceCriteriaPath?`（第 3 项，`docs/acceptance/<flowId>-criteria-v1.md`）
   - `acceptanceReportPath?`（第 3 项，`docs/acceptance/<flowId>-report-v1.md`）
   - `changePackagePath?`（第 3 项，`docs/scheduling/<flowId>-change-v1.md`）
   - 两处保持同形（单一字段集，不另建第二份具名类型）；`nominationPath?` 保留 legacy；`proposalPath?`/`flowPath?` 原义不变。
3. `GovernanceJudgeFacts` 可选增 `riskTier?: "T0" | "T1" | "T2" | "T3"` 与 `teamPlanConfirmed?: boolean`；注释明确 `riskTier` 以 `references/testing.md` 为唯一口径、不是 `qualityTier`，缺失＝应用未提供。
4. `GovernanceStepKind` 保留现有四值并保持联合形状；`nomination` 标 `@deprecated`/legacy；注释写明本层**不新增** `team-plan`、**不得改** `FlowStepKind`（Q4 A）。
5. 相关注释同步（`recommendedRoleIds` 的来源为团队计划，legacy 为提名文件）。

所有新增字段均可选：旧调用（不带新字段）类型与行为零变化；不新增第二份类型/枚举。

### 2.2 `src/provider/runtime/schema.ts`（仅文案）

- `request_choice`：
  - `cardKind` 字段说明增卡种语义：`proposal`＝接受提案；`appointment`＝**任命**推荐团队（由 Convener 依客户确认的团队计划发起；旧 `nomination` 流程为 legacy）；`acceptance`＝验收；`intent-confirm`＝需求确认；并写明「角色允许卡种由应用判定，字段本身不授权」。
  - 工具说明中 `appointment` 改为**任命**卡语义（Convener 发起、任命 Crew；Crew 收到任命后才写卡；旧「提名」卡 legacy）。
  - 新增一条 promptGuideline：`cardKind=appointment` 由 Convener 依团队计划发起，Crew 不自行任命/选角色。
- `request_confirmation`：
  - `cardKind` 字段说明增卡种语义：`write`＝一般写盘确认；`appointment-write`＝客户**任命**后的角色卡/边界写入确认（Crew 按任命名单发起；旧「提名后写卡」为 legacy）；`schedule-write`＝排程/流程写入确认（Convener 发起）；角色允许卡种由应用判定。
  - 工具说明补一句 `appointment-write` 的任命后写卡语义（保留原有五个内置治理角色必须同时携带 `flowId`+`cardKind`、缺失不发卡等逐字语义，T13 断言不回归）。
- **未改**：`cardKind` 枚举值与参数形状、`required`、`additionalProperties`、handler 校验/行为、工具名、executionMode。

### 2.3 `src/provider/runtime/tools.ts`（仅注释）

- 在 `CHOICE_CARD_KINDS` 上方补注释：`appointment` 语义改为「任命」（Convener 依团队计划发起、Crew 任命后写卡）；角色→允许卡种映射由编排判定；白名单形状不变、不新增卡种。

### 2.4 `test/runtime-core/governance-flow-metadata.test.ts`

新增 2 例（9 → 11）：

1. **契约冻结**：`GovernanceAppointmentStepPayload` 同时接受 `teamPlanPath` 与 legacy `nominationPath`；`GovernanceJudgeRequest/Context.artifacts` 接受四个新物证路径且两处同形；`GovernanceJudgeFacts` 接受 `riskTier`/`teamPlanConfirmed`，旧 facts 形状仍合法；`GovernanceStepKind` 保留 `proposal/nomination/dispatch/acceptance`（不新增 `team-plan`）。
2. **Schema 文案**：`request_choice`/`request_confirmation` 写明任命语义、Convener/Crew 分工与 legacy 提名；两工具 `cardKind.enum` 逐字不变（不新增 cardKind）。

## 3. 检查命令与原始结果

所有命令在仓库根 `C:\Users\51054\Desktop\work\ans-studio` 执行，先 `export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`。

| # | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| 1 | `node --test test/runtime-core/governance-flow-metadata.test.ts` | **0** | `tests 11` / `pass 11` / `fail 0` / `skipped 0`；`duration_ms 156.9219` |
| 2 | `node --test "test/runtime-core/**/*.test.ts"` | **1** | `tests 290` / `pass 283` / `fail 3` / `cancelled 0` / `skipped 4` / `todo 0`；`duration_ms 14567.9988` |
| 3 | `npm run typecheck`（`tsc --noEmit`） | **0** | 0 错（无输出） |

- 第 2 条的 3 红与写前基线**逐项相同**（Windows 无 symlink 权限的既有环境失败）：`file-write-safety.test.ts`「D3 linked workspace root remains usable…」×1、`session-store.test.ts`「store: traversal…」×1、「store: native validation…」×1。较基线 288/281/3/4 为 **+2 计 / +2 过 / 同 3 红 / 同 4 skip**，无新增失败。退出码 1 由这 3 条既有环境红导致，非本批新增。
- 原始日志（本机临时文件，不随仓库交付）：`/tmp/gfm-test-final.log`、`/tmp/typecheck-final.log`、`/tmp/rc-post-final.log`；写前基线 `/tmp/rc-baseline.log`。

## 4. 写后候选哈希（工作区）

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/model/runtime.ts` | `120db534d7952f3320d34f21afe222067b2b744c` | `d19c1ab9da354b2a616530a7067a88c12a0375c8763a350719af7a7b5a3b89c9` |
| `src/provider/runtime/tools.ts` | `2023e9f08be24c577f8c1adc91fc8f5d8792271b` | `c2e09c875b2fc633d4b1991379c1ccfdc12e32547e63ad344b96f5178463560c` |
| `src/provider/runtime/schema.ts` | `cefd13ea40700fc8d5f5f6b37f4aa63b79fb52ab` | `4c3c7a710f5d6a3995440ad7fe68a677110d3850cbc3282647bb28fe396d24c3` |
| `test/runtime-core/governance-flow-metadata.test.ts` | `becc8b899cae085fe0ccc8acbca82b5646bfbb43` | `ce2d018f4449398e27ac0184faf5b13be3138655b2bb5fc86885941e6495077b` |
| `角色卡/运行时核心/api-spec.md`（文档） | `c59ba9236c87b5131fab035e2917f6ea75d9af0c` | `cb56700814c0f8748875b48ab53a9a1ad296b8734f35b62bd48999becd166cc3` |
| `角色卡/运行时核心/memo.md`（文档） | `7eae69b60fea575a86194c6d133691c68bd7ecea` | `5a94020eed195a42b42ca77c4f6285d95a3321511f23e750c5ee4bbc92439a77` |

（哈希按工作区当前字节计算；上述两行为文档哈希，不计入产品候选；本文件为自述记录，自哈希会随写盘变化，故不列入。）

## 5. 改动范围（写后原始输出）

- `git diff --name-only`：
  - `docs/communication/memo.md`（**写前已存在**，属沟通角色，本角色未改）
  - `src/model/runtime.ts`
  - `src/provider/runtime/schema.ts`
  - `src/provider/runtime/tools.ts`
  - `test/runtime-core/governance-flow-metadata.test.ts`
  - `角色卡/运行时核心/api-spec.md`
  - `角色卡/运行时核心/memo.md`
- `git diff --stat`：上述 7 个文件，`182 insertions(+), 11 deletions(-)`（其中 `docs/communication/memo.md` 的 5 行差异为写前预置）。
- `git diff --cached --name-only`：**空**（未暂存）。
- `git status --short`：本角色新增未跟踪文档仅本文件；其余未跟踪项均为写前既有的统筹/沟通/测试文档与基线证据。
- 越界声明：未修改 `src/model/{boundary,role,decision}.ts`、`src/service/runtime/session.ts`、任何其他角色目录、`app/`、`test/桌面应用/`、`docs/scheduling/`、`docs/acceptance/`；未改角色 id/显示名/`GovernanceFunction`；未改 `FlowStepKind`；未改 `package.json`/`package-lock.json`；未运行 `npm install`；未提交/暂存/推送/合并/发布。

## 6. 契约偏差（逐条对照方案 §8.2/§10.1）

| 方案条目 | 实施 | 偏差 |
| --- | --- | --- |
| `GovernanceAppointmentStepPayload.teamPlanPath?`，保留 `nominationPath?` legacy | 已按此实现 | 无 |
| `GovernanceJudgeRequest.artifacts` 增 `teamPlanPath?`/`acceptanceCriteriaPath?`/`acceptanceReportPath?`/`changePackagePath?` | 已按此实现 | 无 |
| `GovernanceJudgeContext.artifacts` 同上 | 已按此实现（与 Request 同形） | 无 |
| `GovernanceJudgeFacts` 可选 `riskTier?`/`teamPlanConfirmed?` | 已按此实现 | 无。方案 §8.2 写「`riskTier?` … 或 facts.riskTier」，任务书明确落在 Facts；本实现只放 Facts（属判断上下文快照的一部分），未在 `GovernanceJudgeContext` 顶层另加重复字段 |
| `GovernanceStepKind` 保留/标注 legacy；推荐不新增 `team-plan` | 保留四值，`nomination` 标 `@deprecated`，注释明确不新增；未改 `FlowStepKind` | 无 |
| Provider 只更新 `request_choice`/`request_confirmation` 描述/文案；不新增 `cardKind`、不改参数形状/校验/handler | 仅 schema 文案 + tools 注释；枚举/形状/校验/handler 未变 | 无 |
| 所有新增字段向后兼容；不改现有字段含义；不新增第二份类型/枚举 | 全部可选；现有字段与枚举值未变；未新增具名类型/枚举 | 无 |

**跨阶段说明（非偏差）**：`appointment` 已由 Convener 发起、Crew 不再发 appointment 等**行为**在阶段 C（编排/门禁）与阶段 D（桌面）实施；本阶段只冻结契约与面向模型的文案，现网行为在阶段 C/D 落地前不变。`riskTier`/`teamPlanConfirmed` 的判定与使用属编排（P10/P12），本阶段未接线。

## 7. 未做项 / 未验证边界

- 阶段 C/D 全部未开始：门禁引擎角色卡/注册表、编排物证/推荐集/风险档位/卡前守卫、桌面 appointment→Crew 回路、桌面UI 文案均未改。
- 未跑真实模型/凭据/网络；未跑全量 `test/**` 与 e2e（属阶段 E/测试角色）；未做 Windows 原生 symlink 相关修复（既有环境红，非本批）。
- 未验证下游消费方（编排/桌面）对新字段的实际使用——阶段 C/D 接线后需其属主测试。
- 本候选未提交、未暂存、未推送、未合并、未发布；验收状态不由本角色给出。

## 8. 结论

阶段 B（N4）契约冻结完成：Model 可选字段与 Provider 文案按方案 §8.2/§10.1 落地，定向测试 11/11、`typecheck` 0 错、runtime-core 无新增失败；状态 `implemented-unverified`，等待统筹/独立验收按当前候选判定。
