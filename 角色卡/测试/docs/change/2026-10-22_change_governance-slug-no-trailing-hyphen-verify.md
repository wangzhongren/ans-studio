---
id: governance-slug-no-trailing-hyphen-verify
type: change
title: 共享治理 slug 收紧（禁止尾连字符）S5 跨角色独立验证
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: verified-in-scope
related: [governance-slug-no-trailing-hyphen, invalid-governance-card-guard]
events:
  - date: "2026-10-22"
    kind: verified
    summary: 测试角色新增 S5 跨角色用例 7 例并实跑；五工具尾连字符零副作用、Flow YAML 非法文件名显式拒绝、旧账本/提案非法 intentId fail-closed、合法 slug 全链路可用；governance-e2e-auto 60/60、runtime-core 23/23、编排 78/78、门禁 16/16、typecheck exit 0；排除 write-sequencing 的全量基线 3398 计/3371 过/9 失败（均为既有 Windows symlink EPERM）/18 跳过；真机与真实模型未跑，不代替独立验收
---

# 2026-10-22 验证：共享治理 slug 收紧（S5）

- 角色：测试（独立验证，不改产品代码、不改其他角色单元测试）
- 依据：客户 2026-10-22 确认按[收紧共享治理 slug 契约——禁止尾连字符](../../../项目管理/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen.md)（status: accepted, revision: 1）的 **S1–S5** 实施，O1–O4 均不选；验收标准 [A1](../../../独立验收/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen-acceptance.md) 的 S10/E6/E7 与 S12/E8。本文只覆盖测试角色 **S5** 与回归/全量证据，**不代替独立验收**。
- 被测实现（其他角色已交回、工作树未提交）：S1 `src/model/runtime.ts` 的 `GOVERNANCE_SLUG_PATTERN` 收紧为 `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`；S2 编排 5 个私有副本单一来源化 + 旧意图值 fail-closed；S3 `run-role.ts` 正则单一来源 + Flow YAML 路径宽捕获显式拒绝；S4 门禁测试引用 Model 常量。

## 1. 候选与环境

| 项 | 值 |
| --- | --- |
| 候选 | HEAD `4d944e7587f10be29b6356c42539e06219ed88fc` + 工作树（S1–S4 与在途守卫/后台任务改动未提交） |
| 候选捕获 | `…/2026-10-22-slug-verify-evidence/candidate.txt`，时间 **2026-10-22T15:20:27+08:00** |
| 环境 | Windows 11 Pro（10.0.26300）、Git Bash、Node v24.22.1、npm 11.19.1 |
| 本角色改动 | 新增 `test/测试/governance-e2e-auto/o-slug-trailing-hyphen.test.ts`（7 例）；`fixture.ts` 沿用上一任务已加的只读观测点，本任务未改 |
| 未做 | 未改产品/`test/装配/`/其他角色文件；未提交 Git；未重启应用；未触碰 `todo-demo`；未读 `.env`；未跑真实模型/网络 |

## 2. 实际命令与结果

| 命令（cwd = 项目根） | 退出码 | 结果 | 原始输出 |
| --- | --- | --- | --- |
| `node --test --test-timeout=120000 "test/测试/governance-e2e-auto/"*.test.ts` | **0** | **60 tests / 60 pass / 0 fail / 0 skip**（既有 53 + 新增 7） | `…/slug-verify-evidence/e2e-suite.log` |
| `node --test --test-timeout=120000 "test/测试/governance-e2e-auto/o-slug-trailing-hyphen.test.ts"` | **0** | **7 tests / 7 pass / 0 fail** | `…/slug-tests-final.log`（首轮 run1/run2 亦全绿，含补强记录） |
| `node --test --test-timeout=120000 "test/runtime-core/governance-slug-pattern.test.ts" "test/runtime-core/governance-flow-metadata.test.ts" "test/runtime-core/liaison-handoff-tools.test.ts"` | **0** | **23 tests / 23 pass** | `…/runtime-core-slug-metadata.log` |
| `node --test --test-timeout=120000 "test/编排/governance-judge.test.ts"` | **0** | **78 tests / 78 pass** | `…/orchestration-judge.log` |
| `node --test --test-timeout=120000 "test/门禁引擎/governance-standard-workflow.test.ts"` | **0** | **16 tests / 16 pass** | `…/gate-standard-workflow.log` |
| `npm run typecheck`（`tsc --noEmit`） | **0** | **0 错** | `…/typecheck-final.log` |
| `node --test --test-timeout=120000 <344 个文件>`（排除 `test/pi-adapter/write-sequencing.test.ts`） | **1** | **3398 tests / 3371 pass / 9 fail / 18 skip**；9 失败均为既有 Windows symlink EPERM 环境红 | `…/full-suite.log`、`…/full-suite-exit.txt`、`…/full-suite-meta.txt` |

## 3. S5 用例映射与实际断言

文件：`test/测试/governance-e2e-auto/o-slug-trailing-hyphen.test.ts`（全部经真实桌面 Interface/`openRoleSession`/write gate/确认写集发行器/客户通道/判断 driver；模型为脚本桩，判断会话为「真实 driver + 假判断模型」）。

| 编号 | 测试名 | 关键断言 | 结果 |
| --- | --- | --- | --- |
| S5-1a | rapporteur 五工具中的 confirm/choice/clarification 传尾连字符 slug ⇒ 工具失败、零通道/零判断/零账本 | `request_confirmation` 给 `flowId:"flow-"`、`stepId:"impl-"`；`request_choice` 给 `flowId:"a-"`、`stepId:"impl-"`；`request_clarification` 给 `flowId:"a-"`、`intentId:"intent-"` ⇒ 6 次调用全部 `ok:false`，回执点名字段并逐字包含新正则 `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`；raw 通道/presenter/request id/pending/queued/judging 全 0；判断驱动 0 次；诊断中两处 `governance-judge.started` 均 0；无 `customer.decision` | ✅ |
| S5-1b | liaison 的 hand_off_intent 传 intentId「intent-」/flowId「flow-」⇒ 工具失败、不交接 | 两次均 `ok:false`，分别点名 `intentId`/`flowId` 并含新正则；不打开/投递 Rapporteur；无 `intent.handed-off` 账本 | ✅ |
| S5-1c | convener 的 dispatch_task 传 flowId「flow-」/stepId「impl-」⇒ 工具失败、不派发 | 两次均 `ok:false`，分别点名 `flowId`/`stepId` 并含新正则；未打开 executor 会话；无 `dispatch.accepted` 账本 | ✅ |
| S5-2 | 确认卡声明 docs/flows/flow-.yaml 或 docs/flows/a-.yml ⇒ Flow YAML 闸显式拒绝、raw 0、不落盘 | 两张 `schedule-write` 卡（卡片 `flowId:"flow-a"` 合法）均 `ok:false`；文案含具体路径、「flow-」/「a-」不是合法 slug、新正则与「拒绝该卡（不得跳过 YAML 校验）」；raw/presenter/request id 0；两个文件均不落盘；无客户决定账本 | ✅ |
| S5-3a | 旧账本 intent.handed-off 的 intentId「intent-」⇒ 判断证据 fail-closed、不调用模型、不回落 | 提案决定卡 `ok:false`；文案点名「intentId（intent-）不符合现行 slug 规则」并含新正则与「不得静默跳过或回落」；presented=0、judgeRows=0、模型调用 0 次；诊断 `governance-judge.manual.reasonCode="intent-unconfirmed"` 恰 +1；无客户决定账本 | ✅ |
| S5-3b | 提案 frontmatter intentId「intent-」⇒ 判断证据 fail-closed、不回落 flow-id | 同上；文案点名「提案 frontmatter 的 intentId「intent-」不符合现行 slug 规则」与「不得静默回落」；诊断 `intent-unconfirmed` 恰 +1 | ✅ |
| S5-4 | 合法 slug（flow-a、a--b、ab、64 位）经确认/判断/发行/写盘全链路可用 | 四张合法 `write` 卡（其中 flow-a 另带 `stepId:"impl"`）全部 `ok:true`；presented=0、judgeRows=4、raw/request id 各 4；诊断通道 started 恰 +4；文件落盘；账本 4 条 `customer.decision` 且 flowId 原样保留 | ✅ |

## 4. 零回归

- N1–N5 守卫既有 53 例全部保留并通过（e2e 60/60 = 53 + 7 新增；既有用例未删除、未 skip、未放宽）。
- 编排 `governance-judge.test.ts` 78/78、运行时核心 slug/metadata/handoff 23/23、门禁 `governance-standard-workflow.test.ts` 16/16，均与各角色变更记录一致。
- `npm run typecheck` exit 0（全仓，含测试文件）。

## 5. 全量基线（E8，沿用客户已确认口径）

- 文件收集：`find test -name '*.test.ts' ! -path '*/pi-adapter/write-sequencing.test.ts' | sort` → **344 个文件**；执行 `node --test --test-timeout=120000 "${files[@]}"`；cwd = 项目根；2026-10-22T15:19:53 → 15:20:15。
- 结果：**exit 1；3398 tests / 3371 pass / 9 fail / 18 skip / 0 cancelled**；原始输出 `…/full-suite.log`。
- **9 个失败全部为既有 Windows symlink EPERM 环境红**（`EPERM: operation not permitted, symlink`；文件均未被本任务触碰）：
  1. `test/claude-adapter/session.test.ts:637`
  2. `test/codex-adapter/session.test.ts:351`
  3. `test/pi-adapter/injected-runtime.test.ts:185`
  4. `test/pi-adapter/injected-runtime.test.ts:193`
  5. `test/runtime-core/file-write-safety.test.ts:97`
  6. `test/runtime-core/session-store.test.ts:46`
  7. `test/runtime-core/session-store.test.ts:58`
  8. `test/测试/g4-skill-verify/b-render-double-check.test.ts:182`
  9. `test/编排/shell-authorized-routine.test.ts:103`
- **无本改动引入的新失败**：S5 七例与既有一切治理相关套件在全量中均通过；`test/装配/govern-target.test.ts` 在装配角色适配后继续通过。
- **口径限制**：`test/pi-adapter/write-sequencing.test.ts` 因挂起被客户决定排除（上一轮记录：39+ 分钟无进展、CPU 约 2339s），其行为**未验证**；全量基线不是全绿，不能声称「全量通过」。

## 6. 发现的问题

- **未发现产品缺陷**：S5 要求的五个工具入口、Flow YAML 路径闸、旧账本/提案非法 intentId、合法 slug 全链路均符合设计；无新增红。
- **覆盖边界（如实登记，交验收判断）**：本轮 S5 e2e 覆盖任务清单要求的负例/正例；验收标准 E7 中「多段路径/反斜杠/`..` 不被宽捕获为目标」「盘上既有 `docs/flows/flow-.yaml` 的解析错误 path」属于 S2/S3 单元与验收层证据，本轮 e2e 未单独重测（S3 侧已有 `test/编排/governance-judge.test.ts` 相关用例；本报告不把未跑项算作通过）。
- 调试期无产品返工：新增 7 例首次运行即通过；后续仅补强了 `request_clarification` 的非法 `flowId` 覆盖与 `intent-unconfirmed` 诊断直接断言。

## 7. 缺失证据 / 未执行

1. 真机与真实模型（桌面/CLI + 真实凭据）未跑；脚本化模型结果不冒充真机行为。
2. `test/pi-adapter/write-sequencing.test.ts` 按客户决定排除，行为未验证。
3. 真实项目旧值审计（O4 未授权）不判；仓库外是否存在尾连字符 id 未审计。
4. 桌面 UI 呈现/镜像/排队行为未做 UI 级断言（负例在 raw 通道前即被拒，结构性不可达；正例判断链已由既有 53 例覆盖）。
5. 未 git 提交；候选为工作树状态，任何后续产品/测试变化会使本证据失效。

## 8. 结论

- 在本文候选、环境与命令下，**S5 的跨角色负例/正例全部通过**：尾连字符在五个工具入口被拒绝且零副作用；`docs/flows/flow-.yaml`/`.yml` 被 Flow YAML 闸显式拒绝；旧账本/提案的非空非法 `intentId` 显式 `intent-unconfirmed` fail-closed；合法 slug（含 `a--b`、64 位）全链路可用；N1–N5 与相关角色套件零回归；`npm run typecheck` exit 0。
- 全量基线与上一轮同口径：9 个既有 Windows symlink EPERM 环境红，无新增失败；`write-sequencing` 按客户决定排除且未验证。**不声称全量通过**。
- 本报告只代表测试结果，**不代替独立验收**。

## 9. 相关链接与原始证据

- 设计：[收紧共享治理 slug 契约——禁止尾连字符](../../../项目管理/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen.md)
- 验收标准 A1：[独立验收标准](../../../独立验收/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen-acceptance.md)
- 实施变更：[S1 运行时核心](../../../运行时核心/docs/change/2026-10-22_change_governance-slug-no-trailing-hyphen.md)、[S2/S3 编排](../../../编排/docs/change/2026-10-22_change_governance-slug-no-trailing-hyphen-s2-s3.md)、[S4 门禁引擎](../../../门禁引擎/docs/change/2026-10-22_change_governance-slug-no-trailing-hyphen-s4.md)
- 本角色用例：`test/测试/governance-e2e-auto/o-slug-trailing-hyphen.test.ts`、`test/测试/governance-e2e-auto/fixture.ts`
- 证据目录：`角色卡/测试/docs/change/2026-10-22-slug-verify-evidence/`（candidate.txt、e2e-suite.log、slug-tests-final.log、runtime-core-slug-metadata.log、orchestration-judge.log、gate-standard-workflow.log、typecheck-final.log、full-suite.log、full-suite-exit.txt、full-suite-meta.txt）
