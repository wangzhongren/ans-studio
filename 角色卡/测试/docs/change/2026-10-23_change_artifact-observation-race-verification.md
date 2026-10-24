# 验证记录：flow_step_update 的 artifact.observed 时序修复（T2 小变更）

- 日期：2026-10-23
- 角色：测试（Testing worker，独立子代理上下文）
- 状态：**`verified-by-tests-only`**（独立复算候选 + 复跑受影响套件 + 独立场景核对完成；**不是验收通过**，独立验收仍待进行）
- 风险档位：**T2**（客户闸门 1 授权；实施写集只含 `flow-service.ts` 与其测试）
- 目标版本：v1.7.0（独立小变更，不与角色根文档展示、i18n、目录 v3、治理写卡门禁、验收返工路由合并验收）
- 任务：独立验证客户要求的 artifact 观测时序修复，并重新冻结角色根文档 S1 上游 `src app test` 快照

## 一、依据与确认对象

| 文档 | 版本/哈希 | 用途 |
| --- | --- | --- |
| `docs/communication/2026-10-23_intent_artifact-observation-race.md` | 当前 54 行；SHA-256 `d3dc7474…`（S1 基线时 46 行 `3ee1f45a…`，之后补充了闸门 1 授权段） | 闸门 0 已确认；闸门 1 客户授权「确认 Q1–Q5 A；按方案 A 实施，只改 flow-service 与 flow-service 测试。」 |
| `docs/planning/2026-10-23_design_artifact-observation-race.md` | 方案 v1，282 行；SHA-256 `d464fb70d7022daad61f7837f1c6cd3b7ce478cbafca55a79fb747e3b85de2c1`（独立复算一致） | §4 方案 A、§5 不变量、§6 A1–A13、§10 Q1–Q5 A |
| `角色卡/编排/docs/change/2026-10-23_change_artifact-observation-race.md` | 103 行；SHA-256 `bda43a7b…`；状态 `implemented-unverified` | 实施摘要、写集、自测结果、残余 |
| `角色卡/编排/docs/change/2026-10-23_change_artifact-observation-race-evidence/` | `baseline.txt`、`candidate-hashes.txt`、`candidate.diff`、5 份日志 | 实施角色自测原始证据（只读复核） |
| `角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display-baseline.md` | 271 行；SHA-256 `a6aa70d5…`（复核未改） | S1 上游快照基线；本任务重新冻结其 `src app test` 部分 |

环境：Windows 11 Pro 10.0.26300；Git Bash；仓库 `C:\Users\51054\Desktop\work\ans-studio`；分支 `main`，HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`；Node **v24.22.1**（`C:/Users/51054/AppData/Local/Programs/nodejs/node.exe`）；npm **11.19.1**（`npm.cmd`）；暂存区为空；未 commit/push。

## 二、候选独立复算

命令（仓库根，2026-10-23 22:25:36 +0800）：

```sh
git hash-object "src/common/编排/flow-service.ts" "test/编排/flow-service.test.ts"
sha256sum "src/common/编排/flow-service.ts" "test/编排/flow-service.test.ts"
wc -l "src/common/编排/flow-service.ts" "test/编排/flow-service.test.ts"
```

| 文件 | `git hash-object` | `sha256sum` | 行数 | 字节 | 与预期 |
| --- | --- | --- | --- | --- | --- |
| `src/common/编排/flow-service.ts` | `1faff2c6ba1e46875fb977aae2f998d11b9e5a96` | `43511d2afa5e24cdfedfb1709e75dec83eebfed24f5efa8b01243f88365ccc1f` | 1857 | 80,212 | **一致** |
| `test/编排/flow-service.test.ts` | `61f04d009336b87f63025c2081e6ac75bab659e4` | `42881027a5c9eca2a0c9008e72241dfc6c5880145c19410dbb1eaaaf38313d33` | 2388 | 104,698 | **一致** |

- 实施前基线（编排证据 `baseline.txt` 声明）：`8d783e991b885c6d72b7e269c8e9f1a012c9be1a` / `6aa7af358bc71ad4771998eac070d98a1fdf4e56`；候选与基线不同，候选哈希与实施记录一致。
- 实施前字节不可由 git 独立取回（两文件在修复前已有未提交改动）；本记录以声明的基线 blob id、S1 上游快照对照与文件 mtime 三者交叉确认写集，见 §三。

## 三、写集与边界核对（只读）

1. **`src app test` 范围内修复窗口改动仅 2 文件**：`find src app test -type f -newermt "2026-10-23 21:56:30"`（S1 基线冻结时点）只返回 `src/common/编排/flow-service.ts`（22:20:20）与 `test/编排/flow-service.test.ts`（22:22:03）；其余 127 个 `src app test` 改动/新增文件均早于该时点。
2. **编排候选 diff 只含 2 个文件头**：`candidate.diff` 中 `^diff --git` 计数为 2（正是上述两文件）。
3. **对照 S1 基线逐文件哈希**：`src app test` 129 个文件清单与 S1 完全一致；S1 有内容哈希的 82 个文件 **82/82 完全一致**；其余 47 个非 ASCII 路径在 S1 证据中只有 `DELETED_OR_MISSING` 标记（S1 生成缺陷，见重冻记录），其中仅上述 2 文件 mtime 晚于 S1 冻结，另 45 个均早于（最晚 20:52 +0800）。详见 `…-upstream-refreeze-evidence/s1-comparison.txt`。
4. **角色卡/边界未改**：S1 `final-check.txt` 记录的 8 个边界文件（桌面窗口/桌面UI/项目管理/测试的 `boundary.md` 与 `boundary.yaml`）当前 SHA-256 **8/8 一致**。
5. **全仓修复窗口**：2026-10-23 21:56:30 之后变化的非证据文件只有：两处源码/测试、`docs/planning/2026-10-23_design_artifact-observation-race.md`、`docs/planning/memo.md`、`docs/communication/2026-10-23_intent_artifact-observation-race.md`、`docs/communication/memo.md`、编排 change 记录与证据目录。后五类均为管理/角色记录，不是产品/测试/角色卡/边界。
6. **未新增公共出口**：`ensureArtifactObserved`、`inspectObservableArtifact`、`normalizeObservedRelPath`、`ObservableArtifactInspection`、`EnsureArtifactObservedResult` 均为模块私有（无 `export`）；`flow-service.ts` 导出集合未新增；新增 helper 区域无 `customer.decision` 写入。
7. 未访问/未写入目标项目 `ans-gateway`；未使用真实 `.env`/凭据/在线模型。

## 四、复跑结果（原始日志见证据目录）

命令均在仓库根、按上述 Node/npm 执行；串行、互不并发。

| # | 命令 | 退出码 | tests | pass | fail | skipped | todo | Node 自报耗时 | 日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `node --test --test-concurrency=1 test/编排/flow-service.test.ts` | **0** | 63 | 62 | 0 | **1** | 0 | 869.0 ms | `flow-service.test.log` |
| 2 | `node --test --test-concurrency=1 test/编排/flow-state.test.ts` | **0** | 53 | 53 | 0 | 0 | 0 | 247.9 ms | `flow-state.test.log` |
| 3 | `node --test --test-concurrency=1 test/runtime-core/flow-tools.test.ts` | **0** | 11 | 11 | 0 | 0 | 0 | 147.4 ms | `runtime-core-flow-tools.test.log` |
| 4 | `node --test --test-concurrency=1 test/pi-adapter/flow-tools.test.ts` | **0** | 4 | 4 | 0 | 0 | 0 | 134.8 ms | `pi-adapter-flow-tools.test.log` |
| 5 | `npm.cmd run typecheck`（`tsc --noEmit`） | **0** | – | – | **0 错误** | – | – | 约 1 s | `typecheck.log` |
| 6 | `node --test --test-concurrency=1 --test-name-pattern "artifact 补登（真实编排出口）" test/桌面应用/acceptance-dispatch.test.ts` | **0** | 1 | 1 | 0 | 0 | 0 | 407.3 ms（进程 6.8 s） | `desktop-artifact-backfill-targeted.log` |

**唯一 skip**：`A5b（2026-10-23）符号链接（项目内/外）⇒ insufficient-evidence，零新 observation（无权限创建时 skip）`，原因 `当前平台/权限无法创建符号链接`。**该行记为 skipped，不记为 pass。** 独立探针 `symlink-capability-probe.txt`：Git Bash `ln -s` 实际退化为复制（生成普通文件，不是符号链接），`cmd /c mklink` 返回「没有足够的权限」（exit 1），Node `symlinkSync` 在本机同样会抛 `EPERM`；skip 属实。非普通文件分支由 A5（目录）与独立 S15 覆盖。

未运行：全量 T3、Electron/e2e、真实 run-role 全链路、目标项目命令。理由与残余见 §七。

## 五、A1–A13 独立核对

「实施用例」指 `test/编排/flow-service.test.ts` 中的定向用例（独立复跑通过）；「独立场景」指本角色在系统临时目录用真实 `src` 模块自建的脚本（`scenarios-independent.mjs`，不导入实施测试的 helper）。

| ID | 核对内容 | 实施用例 | 独立场景 | 结论 |
| --- | --- | --- | --- | --- |
| A1 | 文件存在、账本无 observation ⇒ done + 恰一条 observation（owner/power/path/sha/flowId；无 stepId/customer.decision） | A1 pass | S1 pass（entry: convener/schedule/path/sha/flowId；`stepId` 缺省；无 `customer.decision`） | **pass** |
| A2 | 已有同 path observation ⇒ 不重复、不读文件；扩展既有用例 | 既有 `artifact 证据：delivered→done…` + A2 pass | S2 pass（不同 sha + 文件缺失，条数不变）；S12 pass（无 flowId 的 observation 仍匹配） | **pass** |
| A3 | 并发 `observeFlowArtifacts` + done ⇒ 不死锁、最终恰一条同 path+sha | A3 pass | S14 pass（`Promise.all` 正常结束，恰一条） | **pass** |
| A4 | 文件缺失 ⇒ `insufficient-evidence`、flow 不变、零新 observation、error 带原因、issues 形状不变 | A4 pass | S3 pass（error 含 `无法安全补观测（missing）`；`steps[0].evidence: …`） | **pass** |
| A5 | 非普通文件（目录）⇒ fail-closed | A5 pass | S15 pass | **pass** |
| A5b | 符号链接（项目内/外）⇒ fail-closed | A5b **skip**（Windows 权限；见 §四探针） | 未执行（无法创建真实符号链接） | **skip（未验证，不计通过）** |
| A6 | 排除段 `.ans/`、`角色卡/`、`.git/`、`node_modules/` ⇒ `insufficient-evidence`、零新 observation | A6 pass | S5 四例全 pass（reason `path-invalid`） | **pass** |
| A7 | 2 MiB + 1 B ⇒ `insufficient-evidence`、零新 observation | A7 pass | S6 pass（reason `too-large`） | **pass** |
| A8 | 非图片扩展含 NUL ⇒ `insufficient-evidence`、零新 observation | A8 pass | S7 pass（reason `binary`） | **pass** |
| A9 | 账本只读 append 失败 ⇒ `ledger-write-failed`、flow 不变；恢复后重试成功且恰一条 | A9 pass | S8 pass（首次 `ledger-write-failed`（EPERM），恢复后重试 ok、恰一条） | **pass** |
| A10 | 补观测成功但 flow 写失败 ⇒ `write-failed`；重试成功且不重复 | A10 pass | S16 pass（首次 flow 不变、账本 1 条；重试 ok、仍 1 条） | **pass** |
| A11 | dispatch/customer-decision/acceptance 的 done 不触发补观测 | A11 pass | S9 pass（三步 done；账本仍 3 条；0 条 artifact.observed） | **pass** |
| A12 | 批量观察 `observeFlowArtifacts` 不回归（skipped/幂等语义） | 既有 4 例 pass | S10 pass（首次 observed 1、skipped missing/path-invalid/too-large/binary；第二次 observed 0、账本仍 1） | **pass** |
| A13 | 不可对账 ref（首尾空格）⇒ 失败且零新 observation；`../` 解析阶段拒绝 | A13 pass | S17 pass（padded → `insufficient-evidence`/`path-invalid`）；S4 pass（`../outside.md` → `invalid-flow`） | **pass** |

补充独立场景：

| ID | 内容 | 结果 |
| --- | --- | --- |
| S1–S18 | 见 `scenarios-independent-run.log`；含 S11（不同 flowId observation 不满足对账，文件缺失时仍 fail-closed）、S13（`./` 前缀归一化后可观察、追加 path 规范）、S18（已 done 步骤幂等短路，不补历史） | **21/21 PASS，exit 0** |

## 六、角色根文档 S1 上游快照重冻（摘要）

- 修复改变了 `src/common/编排/flow-service.ts` 与 `test/编排/flow-service.test.ts`，S1 的 `src app test` 129 文件快照 `af53fea6…` 已过期。
- **新快照（2026-10-23 22:26 +0800）**：129 个改动/新增文件；整体快照 **`36ae8c046bf61ec8d87b0c18983c2bc725db184343eacd0eea294f3297a3ec5c`**（`sha256sum current-src-app-test-hashes.txt` 可复算一致）；文件清单快照 `26d5f4d0d71c08c8db0dfe514cb9d47580b106180e3c177f70550e2118677c48`（`sha256sum current-src-app-test-files.txt` 可复算一致）。
- **对照 S1**：文件清单 129/129 一致；S1 可核算的 82/82 内容哈希一致；其余 47 个非 ASCII 路径在 S1 证据中无内容哈希（S1 生成缺陷）；这 47 个中仅本次修复的 2 个文件 mtime 晚于 S1 冻结，另 45 个早于。**结论：S1 之后 `src app test` 的变化仅来自本次 artifact 修复的 2 个文件。**
- **角色根文档展示目标文件**：S1 `target-hashes.txt` 的 34 个条目中 33 个当前文件哈希逐字节一致、1 个（`app/renderer/src/chat/profile-docs.ts`）仍按预期不存在；**0 个变化**。含 `app/desktop/project.ts`、`app/desktop/interface.ts`、`src/model/project-document.ts`、Service/Pipeline/Provider 文件、renderer 文件与相关测试。
- **边界文件 8/8 未变**。
- 详细记录：`角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display-baseline-upstream-refreeze.md`；证据目录 `角色卡/测试/docs/change/2026-10-23-role-root-docs-display-baseline-upstream-refreeze-evidence/`。
- **S2 使用新快照 `36ae8c04…`**；原 S1 基线记录保持原样（历史哈希 `a6aa70d5…` 未改写）。

## 七、残余、未验证与阻塞

1. **A5b 符号链接未验证**：本机无法创建真实符号链接（见探针）；`insufficient-evidence` 的符号链接分支未取得运行证据，记为 **skip**，不得当成通过。`!isFile()` 分支由 A5/S15 覆盖；建议在具备符号链接权限的 POSIX/开发者模式环境补跑。
2. **并发重复审计行理论可能**：`run-role` 的 settle 扫描不经过 flow 的 per-project serialize，理论上仍可能在「update 读账本」与「append」之间插入同 path+sha 的 observation，产生重复审计行（append-only 可接受，门禁不读重复数）。本次未观察到，也未用真实 run-role 全链路复现；S14 只验证了 `observeFlowArtifacts` 与 done 并发不死锁且最终恰一条。
3. **已 done 步骤不补历史**：S18 确认幂等短路仍返回 `idempotent: true` 且零 observation。目标现场 `change-package-v5` 不在本次修复中回溯；v1.7.0 部署后仍需客户/Convener 对同一 `flow_update(done)` 重试一次。
4. **修复增量与既有上下文的分离**：两文件在本任务前已有未提交改动，修复前字节不可由 git 取回；写集结论基于声明的基线 blob id、`candidate.diff` 仅 2 个文件头、S1 快照对照与 mtime，非修复前后整树逐字节 diff。
5. **未跑全量 T3/Electron/e2e/真实 run-role 全链路**：按 T2 与任务书只跑受影响套件、相邻对账套件、调用方转发、typecheck，并额外跑一条真实桌面/管线公共出口定向用例；`run-role.ts` 在 S1 的 82 个可核算哈希中逐字节未变（`46204a7e…`），其批量观察语义未被本次修改触碰；共享的 `observeFlowArtifacts` 由 A12/S10 覆盖。
6. **S1 基线证据缺陷（外部记录问题）**：S1 的 `src app test` 哈希清单对 47 个非 ASCII 路径生成了 `DELETED_OR_MISSING` 标记而非内容哈希，导致旧快照 `af53fea6…` 实际是证据文件哈希而非 129 文件内容快照。本记录不改写 S1；重冻记录已提供可复算的规范快照，S2 起使用新快照。
7. **目标现场未修复**：目标项目零写入；本验证只证明 ans-studio 候选行为，不声称 `ans-gateway` 的现场账本/flow 已恢复。
8. **未提交/未推送**：本记录与证据目录不进入暂存；未 commit、push、合并或发布。

## 八、证据

目录：`角色卡/测试/docs/change/2026-10-23_change_artifact-observation-race-verification-evidence/`

| 文件 | 内容 |
| --- | --- |
| `environment.txt` | 时间、cwd、Node/npm、HEAD/分支 |
| `candidate-hashes.txt` | 两候选文件的 `git hash-object`/`sha256sum`/行数独立复算 |
| `document-identity.txt` | 方案 v1、intent、编排记录、S1 基线的 SHA-256/行数；候选 diff 文件头计数 |
| `flow-service.test.log` | 63 tests / 62 pass / 0 fail / 1 skip（A5b）/ exit 0 |
| `flow-state.test.log` | 53/53 / exit 0 |
| `runtime-core-flow-tools.test.log` | 11/11 / exit 0 |
| `pi-adapter-flow-tools.test.log` | 4/4 / exit 0 |
| `typecheck.log` | `tsc --noEmit` / exit 0 / 无错误 |
| `desktop-artifact-backfill-targeted.log` | 真实桌面/管线公共出口补登用例 1/1 / exit 0 |
| `scenarios-independent-run.log` | S1–S18 独立场景 21/21 PASS / exit 0 |
| `scenarios-independent.mjs` | 独立场景脚本（真实 `src` 模块 + 系统临时目录） |
| `symlink-capability-probe.txt` | 本机符号链接能力探针（`ln -s` 退化复制、`mklink` 权限不足） |
| `final-integrity-check.txt` | 写记录后复核：候选哈希、快照身份、`src app test` 计数、工作树状态增量（仅新增两条测试角色记录） |
| `sha256.txt` | 本证据目录全部文件与本记录的 SHA-256（收尾生成） |

## 九、结论

- 候选哈希与期望一致；修复写集（相对 S1 上游快照）只含 `src/common/编排/flow-service.ts` 与 `test/编排/flow-service.test.ts`。
- 四个受影响/相邻套件与 typecheck 全部通过；唯一 skip 为 A5b（Windows 符号链接权限），如实记录、未计为通过。
- A1–A4、A5、A6–A13 独立核对通过；A5b skip；独立场景 21/21 通过。
- 角色根文档 S1 上游 `src app test` 快照重新冻结为 `36ae8c04…`（129 文件），差异仅本次修复 2 文件；展示目标文件与边界文件未变；S2 使用新快照。
- **状态：`verified-by-tests-only`。不是验收通过，不代替客户业务确认；目标现场仍需 v1.7.0 后重试一次。**
