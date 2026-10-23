# 变更记录：目录级授权 — 运行时核心 judge facts 契约扩展（D4）

- **任务 ID**：`2026-10-23-directory-ownership`（产品 flowId：`directory-ownership`；节点 D4 / map-core）
- **执行者/角色**：运行时核心（独立固定角色上下文）
- **日期**：2026-10-23
- **状态**：`implemented-unverified`（契约与定向测试完成；未提交、未推送、未合并、未发布、**未验收**）
- **依据**：客户闸门 2 已确认的团队计划 `docs/scheduling/2026-10-23-directory-ownership-team-plan.md` §4.3（运行时核心）/§5 D4/§6；策划方案 `docs/planning/2026-10-23_design_directory-ownership.md` §8.1/§8.2（`GovernanceJudgeFacts` 可选扩展；不新增 artifact kind/枚举）；验收标准 `docs/acceptance/directory-ownership-criteria-v1.md` P1/P13。
- **授权写集（实际只动这些）**：`src/model/runtime.ts`（仅 `GovernanceJudgeFacts` 可选字段/字面量）、`test/runtime-core/governance-flow-metadata.test.ts`、`角色卡/运行时核心/api-spec.md`、`角色卡/运行时核心/memo.md`、本文件与证据目录。
- **环境**：Windows 11 Pro 10.0.26300 / Git Bash 3.6.10（MINGW64）；Node **v24.22.1**、npm **11.19.1**（每条命令先 `export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`）；仓库根 `C:\Users\51054\Desktop\work\ans-studio`。

## 1. 写前基线（2026-10-23 11:36 +08:00）

- `git rev-parse HEAD` = `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（与团队计划 §1.4 基线一致）。
- `git status --short`（写前）：工作树已有**并行 i18n 变更**（`app/desktop/interface.ts`、`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`test/桌面应用/interface.test.ts`、`test/桌面UI/source-guard.test.ts`、i18n 相关角色文档/未跟踪文件等）与写前 memo 改动；**无 `src/model/runtime.ts`、`test/runtime-core/` 改动**。以上均非本角色产物，本角色未触碰。
- `git diff --cached --name-only`（写前）：空。

写前目标文件哈希（工作区）：

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/model/runtime.ts` | `4b96ae9db3f8f962913e2d010d5ab47bba110389` | `6d3299920982cb1191b7d9f18dc31b74d1b94e200c7acd8af7ec9bfc3cd54cfc` |
| `test/runtime-core/governance-flow-metadata.test.ts` | `1ba4b621c682b3fb81e9cfe977ed2e8d2080697b` | `c7ef45c3e917de1570add346f01654ebc7030440025488fd67216864a3d8fa66` |
| `角色卡/运行时核心/api-spec.md` | `a331b868aaebf8c1cca96c494793ba97b50f6e09` | `85b689d2a7c85f2f27100f54beaee5de22450553d635354bf0159db4f205820f` |
| `角色卡/运行时核心/memo.md` | `5c45ee94cd3ae8f085143f76f4ea98fe4958ec6e` | `b248df9c76dc069f679ddc0860d62297996b842796dddd48233ca02b83a4ace7` |

写前检查（供失败分类，不作为本阶段交付证据；原始输出见证据目录）：

| 命令 | 退出码 | tests/pass/fail/skip/todo | 备注 |
| --- | --- | --- | --- |
| `node --test test/runtime-core/governance-flow-metadata.test.ts` | 0 | 13/13/0/0/0 | 基线 |
| `node --test "test/runtime-core/**/*.test.ts"` | 1 | 292/285/3/4/0 | 3 红为既有 Windows symlink EPERM（`file-write-safety` D3 ×1、`session-store` ×2），与上轮记录一致 |
| `npm run typecheck`（`tsc --noEmit`） | 0 | — | 0 诊断 |

## 2. 改动摘要

本阶段只做 **Model 契约层的可选加法**：v3 值可原样进入 judge facts（不丢信息、不伪装成 v2），并给编排一个可选的有界目录摘要字段。**不实现** v3 解析/校验（编排）、V12（桌面）、卡文本（门禁引擎）、布局核对（编排/测试）；不新增 artifact kind、枚举或协议字段。

### 2.1 `src/model/runtime.ts`

1. **`GovernanceJudgeFacts.teamPlanSchema?`**：`1 | 2` → `1 | 2 | 3`。
   - `1` = legacy 缺省；`2` = 角色粒度/MapReduce v2；`3` = 目录级授权 v3（v2 字段 + 授权目录/目录规范）。
   - 注释同步：缺失＝应用未提供/未解析，**不得据此假定任何版本（尤其不得假定 v3）**；物证仍沿用 `artifacts.teamPlanPath`。
2. **新增可选 `GovernanceJudgeFacts.teamPlanDirectories?: string[]`**：
   - v3 授权目录摘要；有界、去重；长度/内容由生产方（编排）裁剪。
   - 只作 judge 事实摘要，供 prompt/审计；**不构成写权、授权或语义结论**（目录是否合规仍由 V-D/V12/布局核对与 readiness 判定）。
   - 缺失＝应用未提供，不得据此假定 v3（v1/v2 计划通常无目录列）。
3. **未改**：`GovernanceStepKind`/`cardKind`/`GovernancePower`/`GovernanceDecisionKind`/`FlowToolStepKind`/`FLOW_TOOL_STEP_KINDS` 等枚举与值；`GovernanceJudgeRequest/Context.artifacts`（仍只用 `teamPlanPath`，不新增 evidence artifact kind）；`GovernanceJudgeFacts` 其他既有字段；`src/model/{boundary,role,decision}.ts`；`src/service/gate/resolve-write.ts`；`src/provider/runtime/{tools,schema}.ts`；`app/**`。

**冻结给下游的签名（以实际代码为准）：**

```ts
interface GovernanceJudgeFacts {
  // 既有字段不变
  teamPlanSchema?: 1 | 2 | 3;
  teamPlanModules?: string[];
  teamPlanDirectories?: string[];
}
```

### 2.2 `test/runtime-core/governance-flow-metadata.test.ts`

新增 1 例（13 → 14），**未改**既有 13 例断言：

- **2026-10-23 目录级授权**：`GovernanceJudgeFacts` 接受 `teamPlanSchema: 1`/`2`/`3`（v3 原样承载）；接受有界 `teamPlanDirectories`；旧 facts 形状仍合法且不凭空造值（`Object.hasOwn` 为 false、读取为 `undefined`，**缺失不假定 v3**）；v2 facts 不凭空出现目录摘要；物证仍恰为 `teamPlanPath`（不新增 artifact kind）；旧枚举 `GovernanceStepKind`/`FLOW_TOOL_STEP_KINDS` 值不变。
- 类型层负例：`teamPlanSchema: 4` 以 `@ts-expect-error` 标注，由 `tsc` 校验必须报错（若将来接受 4，`@ts-expect-error` 未使用会使 `npm run typecheck` 失败）。

### 2.3 文档

- `角色卡/运行时核心/api-spec.md`：追加 v3 契约扩展段（字段、状态 `implemented-unverified`、下游未接线边界）。
- `角色卡/运行时核心/memo.md`：追加本阶段实施记录。

## 3. 类型闭环核对（只读核对消费方，未改他人文件）

**实际把 `plan.teamPlanSchema` 写入 judge facts 的是编排 `src/pipeline/orchestration/run-role.ts`（不是 `app/desktop/interface.ts`）。**

| 消费/生产点 | 现状（只读核实） | 与本次扩展的关系 |
| --- | --- | --- |
| `src/pipeline/orchestration/run-role.ts:2762-2770`（appointment 分支） | `const parsedPlan = parseTeamPlan(text); context.facts = { ...context.facts, teamPlanSchema: parsedPlan.teamPlanSchema, ... }` | `parsedPlan.teamPlanSchema` 现为 `1\|2`（`src/common/编排/team-plan.ts` 的 `TeamPlanParseResult`）；编排在 D4 扩为 `1\|2\|3` 后，此赋值只有在本 Model 字段接受 `3` 时才能通过 `tsc`。**这是本扩展的必要性来源**：若不扩展，编排只能丢弃 v3 或伪装成 v2。 |
| `app/desktop/interface.ts:1125/3107/3947`（`parseTeamPlanInfo` 返回值与任务文案） | `plan.teamPlanSchema` 只传给桌面私有 `TeamPlanInfo.teamPlanSchema: 1 \| 2`（第 972 行）与 `governance-advance.ts` 的 `teamPlanSchema?: 1 \| 2` 选项（781/962/1002 行）；**不经 judge facts** | 本 Model 扩展对 `interface.ts` 当前类型无冲突。编排把解析结果扩为 `1\|2\|3` 后，桌面这两个私有类型需由桌面窗口在其 D5 写集内同步扩展——这是既定的跨角色契约同步，不是本次改动引入的冲突。 |
| `src/common/编排/governance-judge-facts.ts::buildGovernanceJudgeFacts` | 只从账本快照构造 facts，不设置 `teamPlanSchema`/`teamPlanModules`/`teamPlanDirectories` | 本扩展不改变其行为；`boundFactsSize` 按 JSON 字节裁剪，新增可选字段不参与特定分支。 |

**结论：本任务不是 N/A。** 扩展后 v3 值可原样进入 judge facts，缺失字段仍为 `undefined`（不假定 v3）；未产生对 `app/desktop/interface.ts` 的 TS 冲突或信息伪装。

## 4. 检查命令与原始结果（写后）

| # | 命令 | 退出码 | 结果 | 原始日志 |
| --- | --- | --- | --- | --- |
| 1 | `node --test test/runtime-core/governance-flow-metadata.test.ts` | **0** | `tests 14` / `pass 14` / `fail 0` / `skipped 0` / `todo 0`（147.2403 ms） | `evidence/10-after-targeted.log` |
| 2 | `node --test "test/runtime-core/**/*.test.ts"` | **1** | `tests 293` / `pass 286` / `fail 3` / `skipped 4` / `todo 0`（14572.3228 ms） | `evidence/11-after-runtime-core.log` |
| 3 | `npm run typecheck`（`tsc --noEmit`） | **0** | 0 诊断（含 `@ts-expect-error` 校验） | `evidence/12-after-typecheck.log` |

- 第 2 条较写前基线 **+1 计 / +1 过 / 同 3 红 / 同 4 skip**；3 红与基线逐项相同，均为既有 Windows symlink `EPERM` 环境失败（`test/runtime-core/file-write-safety.test.ts`「D3 linked workspace root remains usable…」×1、`test/runtime-core/session-store.test.ts`「store: traversal…」×1、「store: native validation…」×1），**无本次新增失败**。退出码 1 由这 3 条既有环境红导致。
- 第 3 条同时证明：`teamPlanSchema: 4` 被类型拒绝（`@ts-expect-error` 有效，否则 `tsc` 报未使用指令）。
- 并行 transient（如实记录）：工作树中的 i18n 改动在写前已存在（另一变更 T2），本角色未写 `app/**`；上述命令与本角色写集一致，`typecheck` 实测 0 诊断。若合流后其它角色未完成改动导致 `typecheck` 失败，属跨角色 transient，需在统筹合流后按其写集复跑。

## 5. 旧字段 / 枚举零变化证明

- `git diff -- src/model/runtime.ts` 只落在 `GovernanceJudgeFacts` 块内：1 处联合类型扩宽（`1 | 2` → `1 | 2 | 3`）、1 个新增可选字段（`teamPlanDirectories?`）及其注释；文件其余部分零改动（diff 见 `evidence/20-after-hashes-and-diff.txt`）。
- `git status --short`（本角色写集）只有：`M src/model/runtime.ts`、`M test/runtime-core/governance-flow-metadata.test.ts`、`M 角色卡/运行时核心/api-spec.md`、`M 角色卡/运行时核心/memo.md`，以及未跟踪的证据目录。
- 未改：`src/model/boundary.ts`、`src/model/role.ts`、`src/model/decision.ts`、`src/service/gate/resolve-write.ts`、`src/provider/runtime/{tools,schema}.ts`、`src/common/**`、`src/pipeline/**`、`app/**`、`test/桌面应用/**`、`test/测试/**`、其他角色卡/边界、`docs/scheduling|acceptance|communication`。
- 未新增：artifact kind、`cardKind`、`FlowStepKind`、`GovernancePower`、`GovernanceDecisionKind`、协议字段、Provider 参数/schema、依赖、测试 runner/配置。
- 测试内的旧枚举断言（`GovernanceStepKind` 四值、`FLOW_TOOL_STEP_KINDS` 四值）逐字不变并通过。

## 6. 写后候选哈希（工作区）

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/model/runtime.ts`（产品候选） | `c50e1f44dab21d035b1a8e296f0e3749e470b9b0` | `ca6c0f09e65e4b1a4bdcae00144e13e0c313c025dfc0ec0f0ad102e0f57492f3` |
| `test/runtime-core/governance-flow-metadata.test.ts`（产品候选） | `d1e1ca2c66a363cdab8a9f1bebf12b6d768e2f78` | `9253e55945bfdb1cc2c120ab2e8d73bb67415b6afe39e438f56e9fb0208200f1` |
| `角色卡/运行时核心/api-spec.md`（角色文档，不计产品候选） | `fd5738b0697ee1b80e2ff441afa24d82f127b949` | `f37801e8e4f18b74f2a18b6bdf0eebea5aa51d3fa309f5c0396370b34fcd3609` |
| `角色卡/运行时核心/memo.md`（角色文档，不计产品候选） | `a0d829ee618905b082c761e4cb6dfbd57048fb42` | `09667506c6390e8e3f041ae1f7c44d0c74c4daf72b7f606522936a9427aff8bc` |

（哈希按工作区当前字节计算；本文件为自述记录，自哈希会随写盘变化，不列入。证据目录内容见 `evidence/`。）

## 7. 未做项 / 已知边界 / 未解决问题

- **编排尚未扩展**：`src/common/编排/team-plan.ts` 的 `TeamPlanParseResult.teamPlanSchema` 仍为 `1 | 2`，`run-role.ts` 尚未传 v3，也未填 `teamPlanDirectories`。**字段存在不等于已接线**；v3 解析、V-D1–D9、卡前守卫属编排写集。
- **桌面私有类型待同步（D5）**：编排扩为 `1|2|3` 后，`app/desktop/interface.ts` 的 `TeamPlanInfo.teamPlanSchema`（`1|2`）与 `app/desktop/governance-advance.ts` 的选项类型需由桌面窗口在其写集内扩展；否则其文件会出现 `tsc` 错误。本角色未改 `app/**`。
- **judge facts 生产点**：目前唯一写入 `teamPlanSchema` 的是 `run-role.ts` appointment 分支；`buildGovernanceJudgeFacts` 不设置该字段。若编排需要目录摘要，应在其写集内按有界规则（如 `slice`/长度上限）填充 `teamPlanDirectories`；本层只冻结可选形状。
- 未跑 v3/V-D/V12/布局核对/卡文本/e2e/全量回归/真实启动演示（属编排、门禁引擎、桌面窗口、测试角色与 Reduce）；不声称产品端到端已支持目录授权。
- 未提交、未暂存、未推送、未合并、未发布；未运行 `npm install`；未改 `package.json`/`package-lock.json`。

## 8. 结论

运行时核心 D4 契约扩展完成：`GovernanceJudgeFacts.teamPlanSchema?` 接受 `1 | 2 | 3`（v3 值不丢、不伪装），新增可选有界 `teamPlanDirectories?: string[]`；旧字段/枚举/Provider/写权零变化。定向测试 14/14、`npm run typecheck` 0 诊断、runtime-core 无新增失败（293/286/3/4，较基线 +1 计 +1 过）。状态 `implemented-unverified`，等待统筹/独立验收按当前候选判定；本角色不声称已验收、已提交或已发布。
