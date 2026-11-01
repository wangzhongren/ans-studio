# 验收报告 v2（E2b 复判）：验收判断的提案物证路径修复（acceptance evidence proposal path）

- 风险档位：**T2**（客户闸门 1 确认；跨 `app/desktop` 与 `src/common/编排`；不改判断规则、fail-closed、代批口径、契约形状与发布面）。
- 判定依据（唯一判据，未变）：`docs/acceptance/acceptance-evidence-path-criteria-v1.md`（**580 行** / SHA-256 `8f3e4b73d967d0572c2fda2bffb3ff968ba09303a33546e6b16a0c1b48c76179`），AC-1–AC-8；**AC-8 只以方法 A 为充分证据**。
- 方案与确认链：P1.2 `docs/planning/2026-11-01_design_acceptance-evidence-path.md`（**396 行** / `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9`）；复核 **124 行** / `25bc602ec8993c9e4bfa73b07d8cd521d730be875d66d121d662f12fe42ad3b6`；团队计划 **431 行** / `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3`；E1 变更包 **125 行** / `ce66e25a9b356aba54752ddff542eab5c01c4e1a7af4c868ac144735c5442936`。
- 首次判定：`docs/acceptance/acceptance-evidence-path-report-v1.md`（**249 行** / `cc274259e008dca7a87997250112dfa27d1e27a95365697826f4a37b1d24b946`；**v1 不改**）：AC-1–AC-7 pass、AC-8 insufficient evidence（E1：缺少试跑项目所有者/客户现场确认记录）、总体「证据不足」。
- E2b 触发：沟通记录新增**「方法 A 现场确认记录（2026-11-01）」**小节（客户原话「确认方法 A 现场执行记录（按报告时间线与哈希）」）。本复判只核对该补证及候选/证据未变性，然后按同一 V1 重判 AC-8。
- 复判主体：内置独立验收**唯一主上下文（E2）**；未启动子上下文；只写 `docs/acceptance/`。
- **总体结论：通过（pass）**——AC-1–AC-8 全部 pass；通过仅对当前候选有效，不授权提交/推送/合并/发布/发行。

---

## 一、判据与输入（E2b 实测）

| 项 | 路径 | 行数 | SHA-256 | 核对 |
| --- | --- | --- | --- | --- |
| V1 标准（唯一判据） | `docs/acceptance/acceptance-evidence-path-criteria-v1.md` | 580 | `8f3e4b73d967d0572c2fda2bffb3ff968ba09303a33546e6b16a0c1b48c76179` | 与 v1 判定一致；未变 |
| 客户确认方案 P1.2 | `docs/planning/2026-11-01_design_acceptance-evidence-path.md` | 396 | `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9` | 未变 |
| 独立复核 | `docs/planning/2026-11-01_review_acceptance-evidence-path.md` | 124 | `25bc602ec8993c9e4bfa73b07d8cd521d730be875d66d121d662f12fe42ad3b6` | 未变 |
| 团队计划 | `docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md` | 431 | `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3` | 未变 |
| E1 变更包 | `docs/scheduling/acceptance-evidence-path-change-v1.md` | 125 | `ce66e25a9b356aba54752ddff542eab5c01c4e1a7af4c868ac144735c5442936` | 未变 |
| E1 候选清单 | `%TEMP%\ans-acceptance-evidence-path-evidence\E1\candidate-manifest-final.tsv` | 23 | `c78f66e76c8863a733f50ff579ce763a2f33380d2acd20bf9315bac5d2bcaa5d` | 未变 |
| 沟通记录（管理记录） | `docs/communication/2026-11-01_intent_acceptance-evidence-path.md` | **102** | **`d85a14c3429baa70453ad2bf5940ec7001898fa0f6bb1a636141e2fee5102006`** | `head -89` 复算 = `e23505dc…`（E2 v1 时快照），**纯追加**；新增 E2 结论回执与方法 A 现场确认记录 |
| 首次报告 v1 | `docs/acceptance/acceptance-evidence-path-report-v1.md` | 249 | `cc274259e008dca7a87997250112dfa27d1e27a95365697826f4a37b1d24b946` | 未修改 |

- 分支/HEAD：`feat/flow-improvements-wave1` / `eb77fadafc4df40594938798645da111665027c3`（未变）。
- 环境：Windows 11 Pro 10.0.26300（MINGW64 / Git Bash）、Node v24.22.1、npm 11.19.1；应用已停止；无 task_ops。
- 沟通记录新增小节按管理记录处理：`docs/communication/` 变更不纳入产品候选；产品/测试 5 文件不受影响。

---

## 二、候选与原始证据未变性核对

### 2.1 产品/测试候选（5 文件，与 v1 判定相同）

| 文件 | git blob | SHA-256 | 行数 |
| --- | --- | --- | --- |
| `app/desktop/session.ts` | `ca3d96b3b1feb5d004e914a31bbed2f6216a682c` | `d60ba7c86228063ac851df416bda8db2072ac11d5a79be7affe0cc149faa2676` | 7794 |
| `src/common/编排/governance-judge-facts.ts` | `49b960c377945ce8a3d442fdd8218840816ab5df` | `e3ed3ad1e5435a00d6b8029b4bd68da84255a904160d801c29e80ee33696eb67` | 332 |
| `test/编排/acceptance-judge-minimal.test.ts` | `db3987669d9a4da741fc854ed9e6e020febc4127` | `39a11243973109f4b9ff5c7d0bce3198687c5d6ea40fea3fc3e1bb0ddc993415` | 145 |
| `test/桌面应用/acceptance-proposal-path.test.ts` | `ff2db774c26b824793da5458fc03d9f8c7172a8b` | `a1be01dd9c525b0394bf0a73b817d0e7d3dea6230f853f06e4eb09eb395de355` | 419 |
| `test/编排/governance-judge-facts.test.ts` | `6346f811bb5736b0f3b5f98fffe2441df7b812f3` | `6eb082445702223b5f9e44ea6bf51679279d46b885eecf4199b313f7b815e65b` | 133 |

- E2b 复算 **5/5 与 v1 报告 §八 完全一致**；HEAD 未变；`git diff --cached --name-only` 为空。
- E1 清单 23 行复算：**21/23 完全一致**；变化仅两处管理记录——`docs/acceptance/memo.md`（E2 v1 写盘后更新为 72→79 行 / `6467c6c4…`；本报告写盘后再次更新，最终值以 memo/回报为准）与沟通记录（83→102 行 / `d85a14c3…`，纯追加）。产品/测试 5 文件不受影响。
- 发布/构建面（`package.json`/锁/`tsconfig`/`vite`/`electron-builder`/release workflow/`release-policy.mjs`）与 `src/common/shared/**` 相对 HEAD **零 diff**；既有 4 个测试、`governance-judge.ts`/`governance-judge-evidence.ts`/`run-role`/`customer-input` 仍零 diff（与 v1 一致）。

### 2.2 D2 原始证据与试跑项目（未变）

| 项 | 实测（E2b） | 与 v1/D2 对照 |
| --- | --- | --- |
| 试跑项目 | `C:\Users\51054\Desktop\work\trial-shell-escalation` | 未改 |
| 别名 `docs/proposals/textkit-cli-v1.md` | 7,035 B / `d6cad5f2f03981e4ad25109933cb9170f74726d5d30d2375741e6029b325cbef` | 与 v1/D2 一致 |
| 真提案 `docs/proposals/textkit-cli-proposal-v1.md` | 15,952 B / `a2bdbee2882d788947808743d7d2a6d1e053ed97035df907012b34d60d4ce185` | 一致 |
| 质检报告 `docs/quality/textkit-cli-report-v1.md` | `eb1b18c00317b49858e60ff2925d295b3572a0d10a7274fcaaca9df4857dcf1e` | 一致 |
| run manifest `run-20261101-textkit-cli-87325f96` | `c7fcfbf2a057115bd75370f5aa82e7dcd7ac36cf77e8c1d89f9d51c4f5a97b36`；`state=pinned`；`documents.proposal.path=docs/proposals/textkit-cli-proposal-v1.md` | 一致 |
| `.ans/state/tasks.jsonl` | 80 行 / `684860e66b0a06ffb5d5eb111de4ac3ef7fae50d67fcff792c931f30b823da6b`；`request.created=8`、`request.resolved=8` | 一致 |
| D2 证据关键文件 | `evidence-manifest.txt` `7a25ab69…`、`25-new-request.log` `813e9ee1…`、`26-resolved-parsed.json` `5afc7e41…`、`20-alias-move.log` `e98e3134…`、`27-alias-restore.log` `246bf280…`、`28-post-restore-state.log` `049f0349…`、`05-phase0-conclusion.log` `60a71f20…`、`13-candidate-launch.log` `93cab2a4…`、`29-app-final-state.log` `bfc9440e…`、`30-app-stop.log` `64289765…`、`31-verifier-receipt.log` `bdf7f1b5…`、`32-final-worktree-check.log` `be59bf30…`、`33-input-binding.log` `6b17ce13…` | 均与 v1/D2 记录一致 |
| 新 `request.resolved` | `req-bbeb75a3009b6c32` `2026-11-01T02:22:13.112Z`；`by=judge`/`operatorId=judge:pi`/`choice=accept`/`reasonCode=sufficient`；`judge.evidence` 含真提案、不含别名、无「物证不可读」 | 一致 |

结论：产品/测试候选、D2 原始证据、试跑项目内容均未变化；v1 对 AC-1–AC-7 的证据继续有效（V1 §2.5 同候选复用），无需重跑。

---

## 三、E2b 补证核对（方法 A 现场确认记录）

沟通记录新增小节（`docs/communication/2026-11-01_intent_acceptance-evidence-path.md` 第 91–102 行，纯追加）内容与 V1/团队计划要求逐项对应：

| 要求 | 记录/实测 | 核对 |
| --- | --- | --- |
| 试跑项目所有者/客户现场确认记录（V1 §2.4 第 9 项、§3.8、§九.7；团队计划 §九.8） | 沟通记录「方法 A 现场确认记录（2026-11-01）」：客户原话「确认方法 A 现场执行记录（按报告时间线与哈希）」；确认对象为试跑项目上方法 A 的完整执行 | **满足**：客户确认已写入 `docs/communication/` 管理记录，引用 V1 报告与 D2 证据根 |
| 别名移出/还原与 sha256 | 别名 7,035 B / `d6cad5f2…`，10:17:53 移出；10:27:21 按原字节还原、sha 一致 | **一致**（D2 `20-alias-move.log`/`27-alias-restore.log`） |
| 新 `request.resolved`（id/时间、by/choice/reasonCode、evidence） | `req-bbeb75a3009b6c32` / `2026-11-01T02:22:13.112Z`；`by=judge`/`choice=accept`/`reasonCode=sufficient`；`judge.evidence` 含 `docs/proposals/textkit-cli-proposal-v1.md`、不含别名、无「物证不可读」 | **一致**（`25-new-request.log`/`26-resolved-parsed.json`） |
| 真提案/质检报告/manifest/台账哈希未变 | `a2bdbee2…` / `eb1b18c0…` / `c7fcfbf2…` / `684860e6…` | **一致** |
| 未使用方法 B、未关闭「替我决策」、未客户手批 | 记录明确；开关 approval/decision 均 true；verifier 回执为 judge 代批 | **一致** |

- 该记录属管理记录追加；产品/测试 5 文件与 D2 原始证据未变。V1 对「现场确认记录」的要求已由客户确认小节满足；未发现与 D2 证据矛盾之处。
- 时间线：别名移出 10:17:53 < 请求创建 10:22:03 < 判断 10:22:13 < 别名还原 10:27:21（D2 原始日志；E2b 复核台账/哈希未变）。

---

## 四、AC 总判定表（E2b）

| ID | 标准摘要 | 证据 | 候选 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- |
| AC-1 | pinned 优先、更新版本不覆盖、pinned 无 proposal 不回退 | v1 报告 §4.1；T1/T1b（`10-suite-affected.log` pass）；session diff | 5 文件候选（`d60ba7c8…` 等） | T1 捕获 v2；T1b null/缺失/空串均 `undefined` | **pass** |
| AC-2 | 无 pin 取数字最大 `-proposal-vN`、别名不选、仅别名缺失 | v1 报告 §4.2；T2/T2b pass；复用 `readIntentEntryFacts`、shared 零 diff | 同上 | T2 取 v3、≠别名；T2b `undefined` | **pass** |
| AC-3 | 无提案 `undefined`（旧值覆盖）、证据包 `artifact-missing`、reason 正确 | v1 报告 §4.3；T3 + `14-raw-sample.log` reason 原文 | 同上 | 旧别名被覆盖；`ok=false`/`artifact-missing`/reason 含正确路径、不含旧路径 | **pass** |
| AC-4 | `requiredArtifactPaths` 缺证文案正确、`expectedQualityReport` 不变 | v1 报告 §4.4；facts 6 例 pass；diff 仅文案+注释 | 同上（`e3ed3ad1…`） | missingPaths 精确；flowId 缺失「提案」；无旧路径 | **pass** |
| AC-5 | 试跑形状证据包真实路径/sha256/bytes、别名不入 evidence | v1 报告 §4.5；T4 + `14-raw-sample.log` evidence | 同上 | proposal 条目 path/sha/bytes 与夹具一致；`aliasInEvidence=false` | **pass** |
| AC-6 | pinned 路径不可读 `artifact-missing`、detail「物证不可读：<pinned path>」、不回退 | v1 报告 §4.6；T5 + `14-raw-sample.log` reason 原文；`governance-judge.ts` 零 diff | 同上 | reason `物证不可读：docs/proposals/focus-proposal-v2.md…`；不含 v3/别名 | **pass** |
| AC-7 | 无回归、typecheck 0、既有断言不弱化、写集 | v1 报告 §4.7；E2 复跑 61/61、451/451、645/644/1（B0 EPERM）、typecheck 0；5 文件写集；既有测试零 diff | 同上 + 管理记录 | 新增失败/skip/todo 0；渲染层未改、未重跑 build（D1 已记录 0） | **pass** |
| AC-8 | 真实方法 A：judge accept、evidence 真提案、无「物证不可读」、别名 sha 一致、候选/run id、**现场确认记录** | v1 报告 §4.8 全部实质字段 + §三 客户现场确认记录（沟通 102 行 / `d85a14c3…`；纯追加） | HEAD `eb77fad` + 5 文件；run `run-20261101-textkit-cli-87325f96` | 请求 `req-bbeb75a3009b6c32` by=judge/accept/sufficient；真提案；别名 `d6cad5f2…` 移出/还原一致；客户确认记录已补齐；未方法 B/未关「替我决策」/未客户手批 | **pass** |

**汇总：AC-1–AC-8 全部 pass（8/8）；返工 0；证据不足 0。**

---

## 五、限制与披露

1. **E2b 为增量复判**：未重跑测试/方法 A/应用；依据 V1 §2.5 复用 E2 v1 同候选证据（5 文件哈希、输入/夹具/环境未变），并重新核对 D2 原始台账与哈希。若提交前候选、输入、依赖、夹具或环境变化，按 V1 §2.5 证据失效并重取。
2. **管理记录追加**：沟通记录 83→102 行（`f7967434…`→`d85a14c3…`），`head -89` 复算 = `e23505dc…`（E2 v1 快照），新增内容仅 E2 v1 结论回执与「方法 A 现场确认记录」；`docs/acceptance/memo.md` 由 E2 更新。二者不纳入产品候选。
3. **D2 既有披露**：首次发送因应用 recovery 竞态失败（无 request 事件，台账 74 行不变）、重试成功；试跑项目固有写入（tasks 74→80、会话/日志、`.ans/project.json`、`docs/bootstrap-manifest.md`）；单 runtime pi/外部网关；均按 V1 口径已披露，不改变本次通过结论。
4. **未执行全量回归**（T2 不默认要求）；编排目录唯一红为 B0 既有 Windows symlink EPERM；渲染层未改、未重跑 `typecheck:renderer`/`build:renderer`（D1 同候选已记录 0）。
5. **不要求录屏/截图**：方案与 V1 未要求，本次未使用。
6. 本报告与 memo 为 E2b 写于候选冻结后的验收产物（管理记录）；v1 报告保持 **249 行 / `cc274259…`** 未改。

---

## 六、总体结论与提交前回执要点

**总体结论：通过（pass）。** AC-1–AC-8 全部 pass（8/8），无 fail、无 insufficient evidence。通过仅对当前候选（HEAD `eb77fad` + 5 文件产品/测试候选 + 管理记录）有效；不授权提交、推送、合并、发布或发行。

### 6.1 提交前候选哈希回执要点

产品/测试候选（5 文件，E2b 复算）：

| 文件 | git blob | SHA-256 |
| --- | --- | --- |
| `app/desktop/session.ts` | `ca3d96b3b1feb5d004e914a31bbed2f6216a682c` | `d60ba7c86228063ac851df416bda8db2072ac11d5a79be7affe0cc149faa2676` |
| `src/common/编排/governance-judge-facts.ts` | `49b960c377945ce8a3d442fdd8218840816ab5df` | `e3ed3ad1e5435a00d6b8029b4bd68da84255a904160d801c29e80ee33696eb67` |
| `test/编排/acceptance-judge-minimal.test.ts` | `db3987669d9a4da741fc854ed9e6e020febc4127` | `39a11243973109f4b9ff5c7d0bce3198687c5d6ea40fea3fc3e1bb0ddc993415` |
| `test/桌面应用/acceptance-proposal-path.test.ts` | `ff2db774c26b824793da5458fc03d9f8c7172a8b` | `a1be01dd9c525b0394bf0a73b817d0e7d3dea6230f853f06e4eb09eb395de355` |
| `test/编排/governance-judge-facts.test.ts` | `6346f811bb5736b0f3b5f98fffe2441df7b812f3` | `6eb082445702223b5f9e44ea6bf51679279d46b885eecf4199b313f7b815e65b` |

关键判据/管理记录：V1 `8f3e4b73…`（580）；P1.2 `355cbf1c…`（396）；复核 `25bc602e…`（124）；团队计划 `94f80cff…`（431）；E1 `ce66e25a…`（125）；沟通记录 **102 行 / `d85a14c3…`**；v1 报告 **249 / `cc274259…`**；v2 报告与本 memo 写盘后由 E2 在回报/memo 登记最终哈希。

### 6.2 E3 重冻提示

- **候选路径集**：E1 清单 23 路径 + v1 报告 + v2 报告 = **25 路径**；其中沟通记录（83→102 行）与 `docs/acceptance/memo.md`（72→79 行，再写 v2/memo 后更新）为管理记录内容变化，路径不变；产品/测试 5 文件不变。
- E3 写变更包/提交前应重新逐路径复算 blob+sha256（含 v2 报告与最终 memo），并注明 v1 报告未改、沟通记录为纯追加（E2 v1 快照 `e23505dc…`；当前 `d85a14c3…`）。
- 建议提交拆分：产品/测试 5 文件 + 治理/记录 20 文件；不发行、不打 tag、不写 release 配方。提交/推送/合并需客户另行授权；E2 结论不构成上述授权。
- 若 E3 之后候选/记录再变，按 V1 §2.5 重新冻结并按需复判；本通过结论只绑定当前 25 路径内容。

---

## 七、证据索引

- 首次判定：`docs/acceptance/acceptance-evidence-path-report-v1.md`（249 / `cc274259…`）。
- E2b 核对原始输出：沟通记录第 90–102 行（`docs/communication/2026-11-01_intent_acceptance-evidence-path.md`，102 / `d85a14c3…`；`head -89` = `e23505dc…`）；试跑 `tasks.jsonl` 80 / `684860e6…`；别名 `d6cad5f2…`；真提案 `a2bdbee2…`；manifest `c7fcfbf2…`；质检报告 `eb1b18c0…`；D2 证据关键文件哈希见 §2.2。
- E2 v1 原始证据：`%TEMP%\ans-acceptance-evidence-path-evidence\E2\{10,11,12,13,14,15}*`（哈希见 v1 报告 §九）；D2：`%TEMP%\ans-acceptance-evidence-path-evidence\D2\`（`evidence-manifest.txt` `7a25ab69…`）。
- 角色记录：B0 `147c04fd…`、A1 `92151e9d…`、A2 `7964d5fb…`、D1 `f3654135…`、D2 `0a125838…`（行数见 E1 清单）。

---

**本报告状态：E2b 复判；总体结论「通过」；不构成提交/推送/合并/发布/发行授权。**
