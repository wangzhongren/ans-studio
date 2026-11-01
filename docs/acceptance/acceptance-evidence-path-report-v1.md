# 验收报告 v1：验收判断的提案物证路径修复（acceptance evidence proposal path）

- 风险档位：**T2**（客户闸门 1 确认；跨 `app/desktop` 与 `src/common/编排` 的缺陷修复；不改判断规则、fail-closed 语义、代批口径、`GovernanceJudgeContext/Request` 契约字段形状与发布面）。
- 判定依据（唯一判据，不得增删）：`docs/acceptance/acceptance-evidence-path-criteria-v1.md`（**580 行** / SHA-256 `8f3e4b73d967d0572c2fda2bffb3ff968ba09303a33546e6b16a0c1b48c76179`），AC-1–AC-8；**AC-8 只以方法 A 为充分证据**。
- 方案与确认链：客户闸门 1 确认的 P1.2 `docs/planning/2026-11-01_design_acceptance-evidence-path.md`（**396 行** / `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9`）；复核 `docs/planning/2026-11-01_review_acceptance-evidence-path.md`（**124 行** / `25bc602ec8993c9e4bfa73b07d8cd521d730be875d66d121d662f12fe42ad3b6`）；闸门 2 确认的团队计划 `docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md`（**431 行** / `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3`）；沟通/授权记录 `docs/communication/2026-11-01_intent_acceptance-evidence-path.md`（评审时 **89 行** / `e23505dce49237dca26830d06a531f609436971f4e9c0547426add2f8cdef0a7`；管理记录会追加，引用其确认小节）。
- 变更包：`docs/scheduling/acceptance-evidence-path-change-v1.md`（**125 行** / `ce66e25a9b356aba54752ddff542eab5c01c4e1a7af4c868ac144735c5442936`）；候选清单 `C:\Users\51054\AppData\Local\Temp\ans-acceptance-evidence-path-evidence\E1\candidate-manifest-final.tsv`（**23 行** / `c78f66e76c8863a733f50ff579ce763a2f33380d2acd20bf9315bac5d2bcaa5d`）。
- 验收主体：内置独立验收**唯一主上下文（E2）**；本上下文未启动子上下文，只合并证据、复核并作唯一判断；只写 `docs/acceptance/`。
- 检查面：T2——受影响层测试（7 文件）+ `test/桌面应用/**`、`test/编排/**` 补充 + `npm run typecheck` + AC-8 方法 A 原始证据复核；**未执行全量回归**（T2 不默认要求，V1 §2.3/§6.2）；渲染层未改，未重跑 `typecheck:renderer`/`build:renderer`（理由见 §六）。
- **总体结论：证据不足**——AC-1–AC-7 全部 pass；AC-8 为 `insufficient evidence`（E1，缺少试跑项目所有者/客户现场确认记录）；无 fail，故不判返工，但不得判通过。

---

## 一、判据、输入与版本冻结核对

| 项 | 路径 | 行数 | SHA-256（本次实测） | 与冻结/任务输入 |
| --- | --- | --- | --- | --- |
| V1 标准（唯一判据） | `docs/acceptance/acceptance-evidence-path-criteria-v1.md` | 580 | `8f3e4b73d967d0572c2fda2bffb3ff968ba09303a33546e6b16a0c1b48c76179` | 一致 |
| 客户确认方案 P1.2 | `docs/planning/2026-11-01_design_acceptance-evidence-path.md` | 396 | `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9` | 一致 |
| 独立复核 | `docs/planning/2026-11-01_review_acceptance-evidence-path.md` | 124 | `25bc602ec8993c9e4bfa73b07d8cd521d730be875d66d121d662f12fe42ad3b6` | 一致 |
| 团队计划（闸门 2） | `docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md` | 431 | `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3` | 一致 |
| E1 变更包 | `docs/scheduling/acceptance-evidence-path-change-v1.md` | 125 | `ce66e25a9b356aba54752ddff542eab5c01c4e1a7af4c868ac144735c5442936` | 一致 |
| E1 候选清单 | `%TEMP%\ans-acceptance-evidence-path-evidence\E1\candidate-manifest-final.tsv` | 23 | `c78f66e76c8863a733f50ff579ce763a2f33380d2acd20bf9315bac5d2bcaa5d` | 一致 |
| 沟通记录（管理记录） | `docs/communication/2026-11-01_intent_acceptance-evidence-path.md` | 89 | `e23505dce49237dca26830d06a531f609436971f4e9c0547426add2f8cdef0a7` | E1 冻结时 83 行 / `f7967434…`；本次复算 `head -83` 的 SHA-256 仍为 `f7967434106014eb7346b1731b74a1127155ae070c7d7ff1c6812613eaa6a37c`，追加部分仅为「独立验收 E2 启动」管理记录 |

- 分支/HEAD：`feat/flow-improvements-wave1` / `eb77fadafc4df40594938798645da111665027c3`（全程未变、无新提交）。
- 环境：Windows 11 Pro 10.0.26300（MINGW64 / Git Bash）、Node **v24.22.1**、npm **11.19.1**；应用当前已停止（无 `app/main.ts` Electron 实例）。
- 无 task_ops：仓库无 `.ans/project.json`、无 `docs/verification/`；未伪造任务令牌/锁/审批。

---

## 二、候选核对（独立复算）

### 2.1 工作树、状态与写集

- `git status --porcelain=v1` 共 **23** 个路径（9 `M` + 14 `??`），与 E1 候选清单路径集合**逐路径一致**；无改名、无删除；`git diff --cached --name-only` 为空（未暂存）；HEAD 未变。该快照为 E2 写盘前的候选状态；E2 写盘后新增本报告（`??`）并更新 `docs/acceptance/memo.md`，二者为验收产物/管理记录（见 §六.2），不影响上述产品/测试候选核对。
- 产品/测试候选 **5 文件**（其余 18 项为治理/记录）：
  - `app/desktop/session.ts`（M，7794 行，blob `ca3d96b3b1feb5d004e914a31bbed2f6216a682c`，sha256 `d60ba7c86228063ac851df416bda8db2072ac11d5a79be7affe0cc149faa2676`）
  - `src/common/编排/governance-judge-facts.ts`（M，332 行，blob `49b960c377945ce8a3d442fdd8218840816ab5df`，sha256 `e3ed3ad1e5435a00d6b8029b4bd68da84255a904160d801c29e80ee33696eb67`）
  - `test/编排/acceptance-judge-minimal.test.ts`（M，145 行，blob `db3987669d9a4da741fc854ed9e6e020febc4127`，sha256 `39a11243973109f4b9ff5c7d0bce3198687c5d6ea40fea3fc3e1bb0ddc993415`）
  - `test/桌面应用/acceptance-proposal-path.test.ts`（新增，419 行，blob `ff2db774c26b824793da5458fc03d9f8c7172a8b`，sha256 `a1be01dd9c525b0394bf0a73b817d0e7d3dea6230f853f06e4eb09eb395de355`）
  - `test/编排/governance-judge-facts.test.ts`（新增，133 行，blob `6346f811bb5736b0f3b5f98fffe2441df7b812f3`，sha256 `6eb082445702223b5f9e44ea6bf51679279d46b885eecf4199b313f7b815e65b`）
- 23 项逐项复算：**22/23 完全一致**；唯一不一致为 `docs/communication/2026-11-01_intent_acceptance-evidence-path.md`（E1 冻结 83 行 / `f7967434…` → 当前 89 行 / `e23505dc…`）。`head -83` 复算仍等于冻结值，追加内容仅为沟通在 E2 启动时写的「独立验收 E2 启动」小节（管理记录，非产品候选；E1 §六已预告该行可能变化）。**产品/测试 5 文件 5/5 一致，候选未失效**。
- B-1 边界：`角色卡/桌面窗口/boundary.md`/`boundary.yaml` 各新增 `test/桌面应用/acceptance-proposal-path.test.ts` 精确条目、`changelog.md` 记录；合计 **7 行新增**（md 1 + yaml 4 + changelog 2），md/yaml 用途文字一致；除 B-1 外无边界变更。

### 2.2 零 diff 面（发布/构建/共享/既有测试）

以下相对 HEAD **零 diff**（命令 `git diff --stat HEAD -- <paths>` 为空）：

- 发布/构建面：`package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`electron-builder.yml`、`.github/workflows/release.yml`、`src/common/装配/release-policy.mjs`。
- 共享层：`src/common/shared/**`（`intent-entry-contract.ts` blob `40bf6b47…` / sha256 `73478f2e…`，与 B0 一致）。
- 判断控制流：`src/common/编排/governance-judge.ts`（blob `20bbfdfc…` / sha256 `053c8fa8…`）、`src/common/编排/governance-judge-evidence.ts`（`cf1e9f88…` / `c9062a37…`）、`src/pipeline/orchestration/run-role.ts`、`app/desktop/customer-input.ts`（后两者 `git status` 为空）。
- 既有测试零 diff：`test/桌面应用/acceptance-evidence.test.ts`（`27abc2b8…` / `c6009dcb…`）、`test/桌面应用/run-pin.test.ts`（`7e4ddabb…` / `bdf1fb6e…`）、`test/编排/decision-evidence-packet.test.ts`（`7864a802…` / `86d79cfd…`）、`test/编排/workflow-preconditions.test.ts`（`cfde02b7…` / `74a1e3d9…`）；以上 blob/sha256 均与 B0 相同。
- `app/renderer/dist/` 为 `.gitignore` 忽略产物，非候选。

### 2.3 候选身份

候选身份以 §2.1 的 5 文件 blob+sha256 为准；E2 复算前后一致。D2 启动日志记录的 `session.ts`/`facts.ts` sha256 与上述一致（`d60ba7c8…`/`e3ed3ad1…`），启动时间（10:14:26）晚于 A1/A2 修改与 D1，HEAD `eb77fad`。

---

## 三、独立复跑与原始证据（E2）

证据目录：`C:\Users\51054\AppData\Local\Temp\ans-acceptance-evidence-path-evidence\E2\`（下称 `$E2`）。

| # | 命令 | 退出码 | 结果 | 证据（行数 / SHA-256） |
| --- | --- | --- | --- | --- |
| 1 | `node --test --test-concurrency=1 "test/桌面应用/acceptance-proposal-path.test.ts" "test/桌面应用/acceptance-evidence.test.ts" "test/桌面应用/run-pin.test.ts" "test/编排/acceptance-judge-minimal.test.ts" "test/编排/governance-judge-facts.test.ts" "test/编排/decision-evidence-packet.test.ts" "test/编排/workflow-preconditions.test.ts"` | **0** | **tests 61 / pass 61 / fail 0 / skipped 0 / todo 0** | `$E2/10-suite-affected.log`（69 行 / `fd49a0c5079321a7147014b3d1b88c7aa622e152e4ce270c2c91bc9f9db50a02`） |
| 2 | `node --test "test/桌面应用/*.test.ts"` | **0** | **tests 451 / pass 451 / fail 0 / skipped 0 / todo 0** | `$E2/11-suite-desktop-dir.log`（472 行 / `46e47d7fb1bf9882d1bb3b210801b640dcff3f8843420017e3933371d98be76e`） |
| 3 | `node --test "test/编排/**/*.test.ts"` | **1** | **tests 645 / pass 644 / fail 1 / skipped 0 / todo 0**；唯一失败 `shell-authorized-routine.test.ts:184` 既有 Windows symlink EPERM（与 B0/A2/D1 同项同因，errno -4048） | `$E2/12-suite-orchestration-dir.log`（1219 行 / `c660a30c5acac3570081b8ee19a8331289fdab8c4570682cc4b3f44527dc2f4f`） |
| 4 | `npm run typecheck`（`tsc --noEmit`） | **0** | 无输出、0 错误 | `$E2/13-typecheck.log`（4 行 / `2d13ff10c940fd38eb2c89e44a741f3dc7767f14607b7ee80ded981a0d900435`） |
| 5 | E2 独立只读抽样脚本（复现 T3/T4/T5 夹具配方，打印捕获值与证据包原文） | **0** | T3：`capturedProposalPath=null`、`packetOk=false`、`reasonCode=artifact-missing`、reason 原文 `规范物证缺失：docs/proposals/focus-proposal-v1.md（判断无法核对）；请按上述原因修正后重新提交。`；T4：捕获 `docs/proposals/focus-proposal-v2.md`、proposal 条目 sha256 `317f27f3…`/bytes 139 与夹具实测一致、`aliasInEvidence=false`；T5：捕获仍为 pinned 路径、`packetOk=false`、`artifact-missing`、reason 原文 `物证不可读：docs/proposals/focus-proposal-v2.md；请按上述原因修正后重新提交。`、不含 v3/别名 | `$E2/14-raw-sample.log`（47 行 / `c5e85d8939a5b11fd422614dff0492bdf570e83b590e931ced67c2f42ed1432a`）；脚本 `$E2/e2-raw-sample.mjs`（264 行 / `4337356a45192feb562efac206cabb8910be21f4c75684185fc5f7fd802285ea`） |

失败分类：唯一红为 B0 已记录的环境失败（Windows 账户无符号链接创建权限，`EPERM`，独立探针可复现）；新增确定性失败 **0**；新增 skip/todo **0**。编排目录 645 = B0 639 + A2 新增 6；桌面目录 451 = B0 444 + A1 新增 7；受影响 61 = B0 48 + 13 新增，计数自洽。

未重跑项：`npm run typecheck:renderer`、`npm run build:renderer`。理由：渲染层零 diff（`app/renderer/**` 不在写集、`git status` 为空），V1 §3.7 明确「渲染层未改时未执行不算 fail，但须说明未执行理由」；D1 在同一候选上已记录两者 exit 0。E2 不重跑以避免写入 `app/renderer/dist/`（验收写权仅 `docs/acceptance/`）。

---

## 四、AC 判定表（AC-1–AC-8）

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1 | pinned 优先、磁盘更新版本不覆盖、pinned 无 proposal（null/缺失/空串）不回退 | T1/T1b 原始输出 + 捕获的 `proposalPath` + diff | `test/桌面应用/acceptance-proposal-path.test.ts` T1（`267-282`）/T1b（`284-305`）；`$E2/10-suite-affected.log:4-5` pass；session.ts diff +10/−1 | 5 文件候选（`d60ba7c8…` 等） | 桌面窗口 | T1 捕获 v2（非 v3/别名）；T1b 三变体均 `undefined`，夹具同时放 v2/v3+别名 | **pass** |
| AC-2 | 无 pin 取数字最大 `-proposal-vN`、别名不选、仅别名缺失 | T2/T2b 原始输出 + 捕获值 + diff | 同文件 T2（`309-323`）/T2b（`325-331`）；`$E2/10-suite-affected.log:6-7` pass；`session.ts` 仅调用既有 `readIntentEntryFacts`，无新增 readdir/regex；shared 零 diff | 同上 | 桌面窗口 | T2 取 v3 且 ≠ `<flowId>-v1.md`；T2b 为 `undefined` | **pass** |
| AC-3 | 无提案 `undefined`（继承旧值被覆盖）、证据包 `ok=false`/`artifact-missing`、reason 含正确路径且不含旧路径 | T3 原始输出（含 `buildDecisionEvidencePacket` 直接断言）+ reason 原文 + diff | T3（`335-357`）；`$E2/10-suite-affected.log:8` pass；`$E2/14-raw-sample.log` 原始 reason（见 §三 #5）；`test/编排/acceptance-judge-minimal.test.ts` 仅 +5 行新增断言；facts 单测 | 同上 | 桌面窗口、编排 | 捕获 `null`、旧别名被覆盖；证据包 `ok=false`/`artifact-missing`/reason 原文正确 | **pass** |
| AC-4 | `requiredArtifactPaths` 缺 proposal 文案 `docs/proposals/<flowId>-proposal-v1.md`；flowId 缺失「提案」；`expectedQualityReport` 不变 | facts 单测原始输出 + diff | `test/编排/governance-judge-facts.test.ts` 6 例（`51-133`）；`$E2/10-suite-affected.log:38-43` 全 pass；facts.ts diff 仅 `expectedProposal` 1 行 + 注释 | 同上（`e3ed3ad1…`） | 编排 | missingPaths 精确；flowId 缺失「提案」；qualityReport 回归通过；无旧路径 | **pass** |
| AC-5 | 试跑形状：证据包 proposal 真实路径与 `sha256`/`bytes`；别名不进入 `evidence` | T4 原始输出 + `evidence` 摘要 + fixture 哈希 | T4（`361-389`）；`$E2/10-suite-affected.log:9` pass；`$E2/14-raw-sample.log` 原始 `evidence`（path `docs/proposals/focus-proposal-v2.md`、sha256 `317f27f3…`、bytes 139、`aliasInEvidence=false`） | 同上 | 桌面窗口 | 真实路径/sha256/bytes 与夹具一致；别名、v3 均不在 evidence | **pass** |
| AC-6 | pinned 路径不可读：`manual/artifact-missing`、detail「物证不可读：<pinned path>」、不回退 | T5 原始输出（含 detail 原文）+ `governance-judge.ts:324-339` 零改动 | T5（`393-419`）；`$E2/10-suite-affected.log:10` pass；`$E2/14-raw-sample.log` reason 原文 `物证不可读：docs/proposals/focus-proposal-v2.md；…`，不含 v3/别名；`governance-judge.ts` 零 diff（`20bbfdfc…`/`053c8fa8…`） | 同上 | 桌面窗口、编排 | 证据包失败且 detail 精确；既有控制流未改 | **pass** |
| AC-7 | 无回归、typecheck 0、既有断言不弱化、写集 5 文件、无新增 skip/todo | typecheck/受影响测试原始输出 + 补充套件 + B0 + diff/哈希 | §三 #1–#4；B0 `147c04fd…`；D1 `f3654135…`；`git status` 产品/测试恰 5 路径；既有 4 测试零 diff；minimal 仅 +5 行；release/build/shared 零 diff | 5 文件候选 + 治理记录 | 桌面窗口、编排、测试 | typecheck 0；61/61；451/451；645/644/1（B0 同项 EPERM）；新增失败/skip/todo 0 | **pass** |
| AC-8 | 真实试跑方法 A（唯一充分证据）：新 `request.resolved` 为 `by=judge`/`choice=accept`/`reasonCode=sufficient`、`judge.evidence` 真实提案且不含别名、无「物证不可读」、别名移出/还原 sha256 一致、候选/run id、`tasks.jsonl` 原始摘录 | `tasks.jsonl` 新记录、别名哈希、run manifest、候选身份、方法 A 时间线 | `$E2/15-ac8-verification.log`（29 行 / `cade39ffda3f187242f0578a49ffc10d213ed963c82e1db2642eb999cf9d8d77`）；D2 记录 `0a125838…` 与 `$D2` 证据（`25-new-request.log` `813e9ee1…`、`26-resolved-parsed.json` `5afc7e41…`、`20-alias-move.log` `e98e3134…`、`27-alias-restore.log` `246bf280…`）；trial `tasks.jsonl` 80 行 / `684860e6…` | HEAD `eb77fad` + 5 文件候选；试跑 `run-20261101-textkit-cli-87325f96` | 测试（D2）；E2 复核 | 实质字段全部满足（见 §4.8）；**但缺少试跑项目所有者/客户现场确认记录** | **insufficient evidence（E1）** |

### 4.1 AC-1 pass 依据

- T1：pinned manifest 钉 `docs/proposals/focus-proposal-v2.md`，磁盘同时有 v3 与别名 `<flowId>-v1.md`；捕获恰为 v2，且断言 ≠ v3、≠ 别名（`$E2/10-suite-affected.log:4`）。
- T1b：pinned 但 manifest 无 proposal 的 `null`/缺失/空串三变体；夹具同时放 v2/v3 与别名；捕获均为 `undefined`（`$E2/10-suite-affected.log:5`）。若实现回退扫描或选别名，捕获不可能为 `undefined`。
- 实现 diff：pinned 分支只取 manifest `documents.proposal.path`（trim 后非空），否则 `undefined`；`artifacts.proposalPath: proposalRel` 显式覆盖继承旧值；未新增 import/IO/readdir/regex。
- T5 另证 pinned 路径不可读时捕获仍保留 pinned 路径（`$E2/10-suite-affected.log:10`）。

### 4.2 AC-2 pass 依据

- T2：无 pin，v1/v2/v3 + 别名并存 ⇒ 捕获 v3 且 ≠ 别名（`$E2/10-suite-affected.log:6`）。
- T2b：无 pin 仅别名 ⇒ `undefined`（`$E2/10-suite-affected.log:7`）。
- 实现复用共享 `readIntentEntryFacts` → `latestVersioned`；正则 `^<flowId>-<kind>-v(\d+)\.md$` 不匹配 `<flowId>-v1.md`（shared 实现只读核对，`intent-entry-contract.ts` 零 diff）。`session.ts` diff 无新增 readdir/regex。

### 4.3 AC-3 pass 依据

- T3：metadata 预置旧 `proposalPath: docs/proposals/focus-v1.md`；捕获 `undefined`（旧值被覆盖）。
- E2 独立抽样（`$E2/14-raw-sample.log`）：`capturedProposalPath=null`、`capturedArtifacts={acceptanceReportPath: docs/quality/focus-report-v1.md}`；`buildDecisionEvidencePacket` `ok=false`、`reasonCode=artifact-missing`；reason 原文 `规范物证缺失：docs/proposals/focus-proposal-v1.md（判断无法核对）；请按上述原因修正后重新提交。`——含正确约定路径与「判断无法核对」，不含旧路径 `docs/proposals/focus-v1.md`。
- 既有 fail-closed 控制流未改（`governance-judge.ts` 零 diff）；无 approve/交客户手选兜底。

### 4.4 AC-4 pass 依据

- facts 单测 6 例全 pass：acceptance/proposal 缺 proposal ⇒ `missingPaths` 恰为 `["docs/proposals/focus-proposal-v1.md"]`；flowId 缺失（`""`/空白）⇒ `["提案"]`（仅缺报告时 `["质检报告"]`）；`expectedQualityReport` 仍为 `docs/quality/focus-report-v1.md`；显式给出但不存在的 `focus-proposal-v9.md` 视为已给（不扫盘）；7 种组合序列化均不含 `docs/proposals/focus-v1.md`。
- diff 仅 `expectedProposal` 1 行 + 函数上方注释；`expectedQualityReport` 不变；无扫盘/版本选择。

### 4.5 AC-5 pass 依据

- T4：pinned 真提案 v2 + 磁盘 v3 + 别名；捕获 v2；证据包 `ok=true`，proposal 条目 `path=docs/proposals/focus-proposal-v2.md`、`sha256=317f27f3…`、`bytes=139`，与 fixture 实测一致；`aliasInEvidence=false`，v3 亦不在 evidence（E2 独立抽样，`$E2/14-raw-sample.log`）。

### 4.6 AC-6 pass 依据

- T5：pin 后删除 pinned 提案（磁盘仍有 v3/别名）；捕获仍为 `docs/proposals/focus-proposal-v2.md`；证据包 `ok=false`、`reasonCode=artifact-missing`；E2 独立抽样 reason 原文 `物证不可读：docs/proposals/focus-proposal-v2.md；请按上述原因修正后重新提交。`，含精确 detail，不含 v3/别名。
- `governance-judge.ts:324-339` 既有控制流零 diff（blob `20bbfdfc…` / sha256 `053c8fa8…`）；证据包失败先于模型调用（既有语义，未改）。

### 4.7 AC-7 pass 依据

- `npm run typecheck` exit 0；受影响 7 文件 61/61；桌面目录 451/451；编排目录 645/644/1（唯一失败为 B0 同项 Windows symlink EPERM；新增确定性失败 0、新增 skip/todo 0）。
- 既有断言未弱化：`acceptance-evidence`、`run-pin`、`decision-evidence-packet`、`workflow-preconditions` 零 diff（哈希与 B0 一致）；`acceptance-judge-minimal` diff 仅 +5 行新增断言，既有断言原样。
- 写集：产品/测试 `git status` 恰为 5 路径；`src/common/shared/**` 零 diff；release/build 面零 diff；`session.ts` 无第二份版本扫描；无 `docs/verification/`、无 `.ans/project.json`。
- D1 补充套件与 B0 分类一致；E2 独立复跑计数与 D1 一致；未虚报全量回归。

### 4.8 AC-8 复核与 E1

以下实质字段已由 E2 独立核对（`$E2/15-ac8-verification.log`、trial `tasks.jsonl`、`$D2` 原始日志）：

| 要求 | 实测 |
| --- | --- |
| 新 `request.resolved` 请求 id/时间 | `req-bbeb75a3009b6c32`，`2026-11-01T02:22:13.112Z`（本地 10:22:13；created `02:22:03.431Z`、presented `02:22:13.111Z`） |
| `by=judge` / `choice=accept` / `judge.reasonCode=sufficient` | 全部满足（`operatorId=judge:pi`；`decisionId=decision-req-bbeb75a3009b6c32`） |
| `judge.evidence` 引用真实提案、不含别名 | 含 `docs/proposals/textkit-cli-proposal-v1.md`；不含 `docs/proposals/textkit-cli-v1.md`；`integrity.complete=true`、`conflicts=0` |
| 无「物证不可读」 | reason 不含该字样；证据包完整性为 complete |
| 别名移出/还原 sha256 一致 | 移出前/移出期间/还原后均 `d6cad5f2f03981e4ad25109933cb9170f74726d5d30d2375741e6029b325cbef`（7,035 B，mtime 保持）；移出 `10:17:53` 早于请求，还原 `10:27:21` 晚于判断；移出期间 `docs/proposals` 无别名（`20-alias-move.log`/`27-alias-restore.log`） |
| 候选/应用身份 | 启动命令 `node node_modules/electron/cli.js app/main.ts --remote-debugging-port=9235`；Electron 44.7.0；启动 10:14:26（PID 23844，晚于 A1/A2/D1）；启动时 `session.ts` `d60ba7c8…`、`facts.ts` `e3ed3ad1…` 与候选一致；HEAD `eb77fad`；10:28:46 停止，当前无实例 |
| run id 与 manifest | `run-20261101-textkit-cli-87325f96`；`state=pinned`；`documents.proposal.path=docs/proposals/textkit-cli-proposal-v1.md`；manifest sha256 `c7fcfbf2…`；提案实测 `a2bdbee2…` |
| `tasks.jsonl` 原始摘录 | 80 行 / `684860e6…`；`request.created/resolved` 各 8；D2 原始摘录 `$D2/25-new-request.log`（`813e9ee1…`）与解析 `26-resolved-parsed.json`（`5afc7e41…`） |
| 未使用方法 B、未关闭「替我决策」、未客户手批 | 开关 `approval=true`/`decision=true`（`04-model-and-switches.log`、`29-app-final-state.log`）；verifier 回执明确为 judge 代批、不是客户点击；未发现方法 B 记录 |

**E1（AC-8 insufficient evidence）**：V1 要求方法 A 执行时具备「试跑项目所有者/客户现场确认记录」（V1 §2.4 第 9 项、§3.8、§5「未获现场确认 → AC-8 insufficient evidence」、§九.7；团队计划 §九.8「执行时仍需试跑项目所有者/客户现场确认」）。现有证据中没有该记录：

- D2 记录「授权依据」自述：客户闸门 1 已授权方法 A；本节点派发卡（统筹）明确应用启动/停止与别名临时移出/还原是经授权的验证动作；**「未另行单独联系客户——按派发卡记录如实说明」**（`角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-D2.md` 第 8–10 行）。
- D2 阶段 0 结论同样写明「按派发卡记录执行，未另行单独联系客户」（`$D2/05-phase0-conclusion.log`）。
- `docs/communication/` 当前 89 行记录中只有闸门 0/1/2、实施授权、V1/B-1 核验与 E2 启动小节；**没有**试跑项目所有者/客户对方法 A 执行（别名移出/还原、候选构建启动、重发验收卡）的现场确认小节。
- 派发卡由统筹发出，不是试跑项目所有者/客户；按 V1 口径不能替代现场确认记录。

因此 AC-8 判 `insufficient evidence`（E1），不是 `fail`：请求/证据/别名/候选/run id 等实质字段均通过复核，缺的是 V1 明确要求的现场确认**记录**。

---

## 五、返工 / 证据不足清单

### 5.1 返工（R#）

**无。** AC-1–AC-7 全部 pass；AC-8 无 fail 证据（实质字段通过，见 §4.8），不构成返工。

### 5.2 证据不足（E#）

| ID | 条目 | 缺什么 | 依据 | 需要谁补什么 |
| --- | --- | --- | --- | --- |
| E1 | AC-8 | 试跑项目所有者/客户对方法 A 执行的现场确认记录（覆盖：别名移出/还原、候选构建/启动、重发验收卡；记录写入管理记录并可核对时间/内容） | V1 §2.4 第 9 项、§3.8（含「缺少现场确认记录 → insufficient evidence」）、§5（「未获现场确认 → AC-8 insufficient evidence」）、§九.7；团队计划 §九.8；D2 记录自述未另行联系客户 | 沟通/统筹向试跑项目所有者/客户取得并记录该确认（建议写入 `docs/communication/` 管理记录），随后由内置独立验收按 V1 复判 AC-8；验收不自行放宽，也不判定追溯确认是否等同于「执行时」确认——该判断属于客户/沟通依据团队计划的处置 |

说明：D2 首次发送失败重试、试跑项目固有写入（`tasks.jsonl` 74→80、会话/日志、`.ans/project.json`/`docs/bootstrap-manifest.md`）已在 E1 §六/D2 §五披露；E2 复核确认别名/真提案/manifest/质检报告内容哈希未变，不据此改判、也不作为 E#。方法 B/客户手批未被使用，不构成 AC-8 的替代证据。

---

## 六、限制、披露与证据复用

1. **沟通记录为并发追加的管理记录**：E1 冻结 83 行 / `f7967434…`；评审时 89 行 / `e23505dc…`；`head -83` 复算与冻结值一致，追加部分仅为「独立验收 E2 启动」小节。产品/测试 5 文件不受影响（E1 §六已预告）。
2. **本报告与 memo 写于候选冻结之后**：二者是验收产物/管理记录，不混入产品候选；E2 未改代码、测试、方案、团队计划、角色卡、沟通记录或试跑项目。E3 提交前应按 E1 §一重新冻结治理/记录清单（产品/测试 5 文件不变；`docs/acceptance/memo.md` 与新增报告、沟通记录的变化属管理记录）。
3. **D2 限制（按 V1 口径判定，不放宽/不加码）**：首次向 verifier 发送因应用 recovery 竞态失败（`ok:false`「会话尚未开启」，未产生任何 request 事件，台账仍 74 行）；重新打开 verifier 会话后重试成功。该重试不改变新 `request.resolved` 与别名时间线。
4. **试跑项目固有写入**：`tasks.jsonl` 74→80 行（6 条 `request.*`）、`.ans/sessions/**`、`.ans/state/logs/**`、`.ans/project.json`、`docs/bootstrap-manifest.md` 由应用/角色在重发验收卡过程中写入（非 D2 手工改文件）；别名 `d6cad5f2…`、真提案 `a2bdbee2…`、manifest `c7fcfbf2…`、质检报告 `eb1b18c0…` 内容哈希均未变（E2 复核）。
5. **单 runtime/外部模型**：试跑 runtime 为 pi（`deepseek-v4-flash`，外部网关），verifier/judge 为真实模型调用；模型/网关波动是复现性限制，不改变本次原始记录的真实性；E2 未重跑方法 A（只读边界；重跑需启动应用并移动别名，超出本验收写权），以 D2 原始台账 + 哈希复核为准。
6. **未执行全量回归**：T2 不默认要求；D1 补充目录 451/451、645/644/1 与 E2 复跑一致；不虚报为全量回归。编排目录唯一红为 B0 既有 Windows symlink EPERM（非本任务引入，未修改该测试）。
7. **渲染层**：未重跑 `typecheck:renderer`/`build:renderer`；渲染层零 diff（`app/renderer/**` 不在写集），V1 §3.7 允许未执行并说明理由；D1 同候选已记录 exit 0。
8. **别名历史 sha**：复核记录的历史前缀 `d6cad5f2…` 与本次实测移出前/还原后一致；真提案 `a2bdbee2…`、manifest `c7fcfbf2…` 与 V1 §4.5/方案快照一致。
9. **截图/录屏**：方案与 V1 未要求；未使用，不构成 fail/insufficient。
10. **证据复用**：A1/A2/B0/D1/D2 与 E2 使用同一候选（5 文件哈希一致）；E2 独立复跑受影响层并复核 D2 原始台账；未跨候选复用，未用其它变更结论背书。无 task_ops，未伪造机器状态。

---

## 七、总体结论

**证据不足。**

- **AC-1–AC-7：pass（7/7）**；**AC-8：insufficient evidence（E1）**；**fail：0**。
- 按 V1 §2.1：无 fail 但存在 insufficient evidence ⇒ 总体结论为**证据不足**，不得判通过。
- 产品/测试候选本身未发现不满足 AC-1–AC-7 的证据，也未发现 AC-8 的 fail 证据；剩余缺口是 V1 要求的试跑项目所有者/客户现场确认**记录**（E1），不是产品行为缺陷。
- 后续：由沟通/统筹按 E1 补记录，E2 按 V1 复判 AC-8；若候选（5 文件）、输入/夹具/环境变化，受影响证据按 V1 §2.5 失效并重取。补证前本结论保持「证据不足」。
- 本报告不授权提交、推送、合并、发布或发行；即使后续 AC-8 复判通过，也不自动产生上述授权（团队计划 §八、角色定义）。

---

## 八、候选哈希回执（未通过，提交回执不适用）

本次总体结论为证据不足，**不附提交前候选哈希回执**。为便于 E3/复判重新冻结，当前产品/测试候选身份如下（E2 复算，HEAD `eb77fad`）：

| 文件 | git blob | SHA-256 | 行数 |
| --- | --- | --- | --- |
| `app/desktop/session.ts` | `ca3d96b3b1feb5d004e914a31bbed2f6216a682c` | `d60ba7c86228063ac851df416bda8db2072ac11d5a79be7affe0cc149faa2676` | 7794 |
| `src/common/编排/governance-judge-facts.ts` | `49b960c377945ce8a3d442fdd8218840816ab5df` | `e3ed3ad1e5435a00d6b8029b4bd68da84255a904160d801c29e80ee33696eb67` | 332 |
| `test/编排/acceptance-judge-minimal.test.ts` | `db3987669d9a4da741fc854ed9e6e020febc4127` | `39a11243973109f4b9ff5c7d0bce3198687c5d6ea40fea3fc3e1bb0ddc993415` | 145 |
| `test/桌面应用/acceptance-proposal-path.test.ts` | `ff2db774c26b824793da5458fc03d9f8c7172a8b` | `a1be01dd9c525b0394bf0a73b817d0e7d3dea6230f853f06e4eb09eb395de355` | 419 |
| `test/编排/governance-judge-facts.test.ts` | `6346f811bb5736b0f3b5f98fffe2441df7b812f3` | `6eb082445702223b5f9e44ea6bf51679279d46b885eecf4199b313f7b815e65b` | 133 |

治理/记录 18 项以 E1 清单为准；其中沟通记录已因 E2 启动小节变为 89 行 / `e23505dc…`，`docs/acceptance/memo.md` 与新增本报告将在 E2 写盘后变化（管理记录）。产品/测试 5 文件未变。

---

## 九、证据索引

### 9.1 E2 独立证据（`%TEMP%\ans-acceptance-evidence-path-evidence\E2\`）

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `10-suite-affected.log` | 69 | `fd49a0c5079321a7147014b3d1b88c7aa622e152e4ce270c2c91bc9f9db50a02` |
| `11-suite-desktop-dir.log` | 472 | `46e47d7fb1bf9882d1bb3b210801b640dcff3f8843420017e3933371d98be76e` |
| `12-suite-orchestration-dir.log` | 1219 | `c660a30c5acac3570081b8ee19a8331289fdab8c4570682cc4b3f44527dc2f4f` |
| `13-typecheck.log` | 4 | `2d13ff10c940fd38eb2c89e44a741f3dc7767f14607b7ee80ded981a0d900435` |
| `14-raw-sample.log` | 47 | `c5e85d8939a5b11fd422614dff0492bdf570e83b590e931ced67c2f42ed1432a` |
| `15-ac8-verification.log` | 29 | `cade39ffda3f187242f0578a49ffc10d213ed963c82e1db2642eb999cf9d8d77` |
| `e2-raw-sample.mjs`（只读抽样脚本） | 264 | `4337356a45192feb562efac206cabb8910be21f4c75684185fc5f7fd802285ea` |

### 9.2 D2 真实试跑证据（`%TEMP%\ans-acceptance-evidence-path-evidence\D2\`）

- `25-new-request.log`（6 行 / `813e9ee1d036b4f2dbd544558d1e4c2cc00044e66e93ea00896e1ba605cb6301`）、`26-resolved-parsed.json`（27 / `5afc7e41bd5967357a25854043465cc867d4e1f6bae71cd6cdd0bdc346f29d32`）。
- `20-alias-move.log`（32 / `e98e31341113cffe7f492bfb41a594acb7c55185c2d7d4d2e373556ad74d39f2`）、`27-alias-restore.log`（22 / `246bf280b85777023bf66fcef08c2b2ececc9291562eda1c5e01876f15eb5202`）、`28-post-restore-state.log`（46 / `049f03490ba3d8faaab7c7acb37cd53c76c665cd67db8c305e858a831e67e996`）。
- `05-phase0-conclusion.log`、`13-candidate-launch.log`、`29-app-final-state.log`、`30-app-stop.log`、`31-verifier-receipt.log`、`32-final-worktree-check.log`、`33-input-binding.log`；清单 `evidence-manifest.txt`（34 / `7a25ab697578539c94d48f750ebd9e8eb61074286efc9bdf42a2c930547c9818`）。
- 试跑项目：`C:\Users\51054\Desktop\work\trial-shell-escalation`；run `run-20261101-textkit-cli-87325f96`；别名 `docs/proposals/textkit-cli-v1.md`（`d6cad5f2…`）；真提案 `docs/proposals/textkit-cli-proposal-v1.md`（`a2bdbee2…`）；manifest `c7fcfbf2…`；`tasks.jsonl` 80 行 / `684860e6…`。

### 9.3 角色/基线记录

- B0：`角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-B0.md`（261 / `147c04fddb66a2fd86345a721b8dcd45d323e8bbdc40831fa55ff0b389543fc3`）。
- A1：`角色卡/桌面窗口/docs/change/2026-11-01_change_acceptance-evidence-path-A1.md`（121 / `92151e9d79c258d0b872c6edc16cb5d326cc8fe51f48853bac15e9ff83684b8d`）。
- A2：`角色卡/编排/docs/change/2026-11-01_change_acceptance-evidence-path-A2.md`（147 / `7964d5fbdcac6db66b1845e3534877279c09d6ad6c983c5438d7ff5fc3a356db`）。
- D1：`角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-D1.md`（206 / `f3654135fc38d903ebf7665d42c79cc15f3e37e41242cec7d63497b09f0386dd`）。
- D2：`角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-D2.md`（250 / `0a125838fd16a6c30eaf29a6d6c1f48fa0d5d9b03dd93f7f2fa34ec3486c6b67`）。

---

**本报告状态：E2 独立验收判定；总体结论为「证据不足」；不构成提交/推送/合并/发布/发行授权。**
