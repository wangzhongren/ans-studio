# 变更记录：会话创建准入按操作审批 B0 新基线（冻结脏基线，2026-11-08）

- 任务节点：**B0 新基线**（团队计划 §5.1/§5.2；B1 v1 §1 B0-1–B0-5）
- 角色：测试（独立上下文；不判验收）
- 日期：2026-11-08
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree；未进入主检出）
- 纪律：只读产品/测试源码；只写 `角色卡/测试/docs/change/` 本记录与同名证据目录；未修改产品源码、其他角色测试、角色卡/边界/YAML、构建配置、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`；未 commit / push / 暂存 / 合并 / 发布；未运行真实模型、Electron 或 CDP；未执行 `npm install`；**未使用 `--test-force-exit`**；未删除/放宽断言、未新增 skip。

## 1. 前置核对（开工实测）

| 项 | 计划/标准引用值 | 实测 | 结论 |
| --- | --- | --- | --- |
| 团队计划 `docs/scheduling/2026-11-08_team-plan_session-admission-approval.md` | 本计划（未自记哈希） | `ce30fad6f0cb48d948007de97d553a1362836eb77dbcff67a10382388c1ad421`；449 行 / 61,983 bytes | 记录 |
| B1 v1 `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md` | `fb88112627c3a5361934a1d3810bea2866b60305d67af6dd8cf39307cce8e1c1`；185 行 / 29,020 bytes | 一致 | ✓ |
| B1 v1.1 `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.1.md` | `e5027742d4ae36b5f71a090d7ceb956ae3046f06da6d9f4252cf60153776e867`；137 行 / 17,749 bytes | 一致 | ✓ |
| 上一变更 B0 记录 | `135535055abfe2e4b4f3c4c34d207618272b98fe5b5cfefc7b23e70cec483101`；910 行 / 81,484 bytes | 一致 | ✓（仅格式参考，数据不沿用） |
| 上一变更 B0 证据索引 | `65039f3d77b33af2c88c5d94a749460d96dba3085c5a2c03439dd0db7026a6d7`；68 行 / 7,410 bytes | 一致 | ✓ |
| 设计文件 `docs/planning/2026-11-08_design_session-admission-approval-based.md` | 团队计划引用 **P1.2**：`b13e2fe7…`；844 行 / 128,528 bytes | 实测 **P1.3**：`2553b97ac2338c786f17c860153c1b30abc874c4ffc84392954a5d7f949166e3`；855 行 / 130,013 bytes（标题「方案（P1.3）」，§8 为「复核处置（P1.3…）」） | **不一致（如实记录）**：设计文件在团队计划写盘后已递增版本。本角色只读记录、不判其效力；本 B0 只绑定测试基线（HEAD `a1b2f66` + 工作树） |

## 2. 环境

| 项 | 值 |
| --- | --- |
| OS | Windows 11 Pro 10.0.26300（MINGW64_NT-10.0-26300，MSYS 3.6.10） |
| Shell | `/usr/bin/bash` 5.3.15（Git Bash / MinGW64） |
| Node | v24.22.1（win32 x64） |
| npm | 11.19.1 |
| git | 2.55.0.windows.5 |
| `node_modules` | 存在；顶层 377 项（未执行安装） |
| 仓库根 `.env` | 存在（**未读取/未打印/未复制内容**） |
| `.ans/` | 存在；**无** `.ans/project.json`（未启用 task_ops） |
| 相关环境变量（仅记录名称） | `ANTHROPIC_BASE_URL`、`ANTHROPIC_DEFAULT_{FABLE,HAIKU,MYTHOS,OPUS,SONNET}_MODEL`；无 `ANS_*` 变量 |

## 3. 身份与工作树快照（B0-1）

- HEAD：`a1b2f662bf951ad039365bbbfe64caad9283fcd1`；tree：`3aa82fb72ddd80a1c9306b8479e43a342ea60dfa`；分支：`feat/plan-escalation-card`；`origin/main`：`c06942530f80e5cb394246dcb82e0ab3ad2d781f`（HEAD 已被其包含，0 ahead / 1 behind；与团队计划所述 PR #72 merge tree 相同）。
- 暂存区：**空**（`git diff --cached --stat` 0 行）。
- 开工 `git status --porcelain`（本角色写入前）：**202 项 = 3 tracked 修改 + 1 未暂存删除 + 198 未跟踪**。

### 3.1 tracked 修改与删除（4 项）

| 状态 | 文件 | 说明 |
| --- | --- | --- |
| ` M` | `docs/communication/memo.md` | 管理 memo（非本角色写入） |
| ` M` | `src/common/claude-adapter/schema.ts` | **T1**（只读、不属本变更写集） |
| ` M` | `test/claude-adapter/session.test.ts` | **T1**（只读） |
| ` D` | `角色卡/项目管理/docs/architecture/shared-components.md` | 未暂存删除（上一变更 E1 迁移窗口删旧副本动作，非本变更写集）；numstat `0 216` |

### 3.2 T1 实际 3 文件（只读、不入候选；SHA-256 与上一 B0 完全一致）

| 文件 | 状态 | numstat | SHA-256 |
| --- | --- | --- | --- |
| `src/common/claude-adapter/schema.ts` | M（tracked） | +205 / -7 | `afe70c622786a0a43da8831e3f8a0cd1618af254a21da59555191a780fe7f3b6` |
| `test/claude-adapter/session.test.ts` | M（tracked） | +105 / -28 | `f0db260e99c739d7fef889ae0931e574da9aa730f9bafdbb90d1159f87577746` |
| `test/claude-adapter/schema.test.ts` | ??（untracked） | —（276 行） | `358ac967b271a4a026e38b2f463abc44e5086343bfc92fdfe934c79f3cc4f162` |

`git status --porcelain -- src app test` 恰为上述 3 项（无其他 src/app/test 改动）。

### 3.3 未跟踪文件（198 项，按类别；以本角色实测为准，团队计划写盘时为 197）

| 类别 | 数量 | 说明 |
| --- | --- | --- |
| `角色卡/`（含各角色 `docs/change` 证据与角色卡文档） | 121 | 上一变更/历史留存证据；**不入本变更候选** |
| `docs/`（管理文档：acceptance/communication/planning/scheduling 等） | 43 | 管理记录；**不入候选** |
| `.tmp-*`（临时脚本/截图） | 14 | 临时产物；**不入候选** |
| `.commit-msg-*` | 10 | 临时提交信息；**不入候选** |
| `.pr-body-*` | 9 | 临时 PR 描述；**不入候选** |
| `test/claude-adapter/schema.test.ts` | 1 | T1 未跟踪测试（只读） |
| **合计** | **198** | |

证据目录落盘后、本记录写盘前快照（`38b-git-status-porcelain-closing.txt`）：**203 项** = 202 + 本证据目录 1 项（目录内文件折叠为 1 条）。本记录写盘后最终快照（`38c-git-status-porcelain-final.txt`）：**205 项** = 202 + 本证据目录 1 项 + 本记录 1 项 + 会话期间由**其他角色**新增的 `docs/communication/2026-11-08_waiver_baseline_session-admission.md` 1 项（非本角色写入、位于 `docs/` 管理区、不在候选 manifest 内；见 §13.6）；`src app test` 仍仅 T1 三项。

### 3.4 工作树指纹

- `git diff`（文本）SHA-256：`168c333a98b5f0a1578bcaa370ef22f8bb4a443d0cb3f9e2704834148d0ce84a`；`git diff --binary` 同哈希；`git diff --cached` 为空（`e3b0c442…`）。
- 收工时同上（HEAD/tree/分支/diff 哈希均未变；见 §4/§13）。

## 4. 候选稳定性（B0-5）

**manifest 算法（明文）**：

1. 文件集：`find src app test -type f ! -path 'app/renderer/dist/*'`（`app/renderer/dist` 存在，构建产物，排除）。
2. 路径按 `LC_ALL=C sort`（字节序）排序；每行格式 `<sha256-hex-lowercase>` + 两个空格 + `<repo-relative-path-forward-slash>` + LF。
3. 聚合身份 = 上述 manifest 文件字节流的 SHA-256。

| 时点 | 文件数 | 聚合 SHA-256 |
| --- | --- | --- |
| 运行前（`34-worktree-src-app-test-sha256.txt`） | 1,066 | `5cbdbb9483cbc64d56de7e7649e0466cf956298ff354993b0d6e6d21cb2765fb` |
| 运行后（`36-worktree-src-app-test-sha256-postrun.txt`） | 1,066 | `5cbdbb9483cbc64d56de7e7649e0466cf956298ff354993b0d6e6d21cb2765fb` |
| 逐行 diff（`37b-manifest-diff.txt`） | — | **空（0 行）** |

- 运行前后 HEAD/tree/分支/`git diff` 哈希/`src app test` scope status 均未变（§13）。**未发现并发改动；未触发停止条件。**
- T1 三文件哈希与上一 B0 记录值逐字一致（`afe70c62…`/`f0db260e…`/`358ac967…`），T1 未被修改。

## 5. 全量测试方法（B0-2 口径）

- 文件枚举：`find test -type f -name '*.test.ts' | LC_ALL=C sort` → **510 个**（较上一 B0 的 471 增加；新增 `test/roles/` 18、`test/gates/` 4 等模块化提交带来的目录/文件）。逐目录计数见 `08b-test-file-counts.log`。
- **逐文件自然 EXIT/CLOSE**：每个测试文件由**独立** `node --test` 进程运行（与批量口径的 per-file 子进程隔离等价，且逐文件退出码可直接观察）；命令：
  `timeout -k 5 <TO> node --test --test-concurrency=1 <file>`（cwd=仓库根）。
- watchdog：默认 `TO=300s`；上一 B0 登记的 6 个挂起嫌疑文件按既有口径 `TO=90s` 隔离（`test/pi-adapter/write-sequencing.test.ts`、`test/测试/customer-authorization-plane-integration.test.ts`、`test/桌面应用/{directive-decision,optional-acceptance,session-rebuild-race,stuck-redispatch}.test.ts`）。
- **未使用 `--test-force-exit`**：先对上一 B0 登记的 post-test 泄漏文件 `test/桌面应用/chief-workflow.test.ts` 做 300s 自然尝试 → **自然退出**（exit 1，58 tests / 42 pass / 16 fail，66.4s，summary 完整；`31-chief-workflow-natural-attempt.*`），因此权威运行无需 force-exit；其余文件全部自然退出或 watchdog 终止。
- 运行器脚本：`run-per-file.sh`（证据目录内，含逐文件 `exit_code/watchdog_killed/summary_present/tests/pass/fail/cancelled/skipped/todo/duration_ms/wall_ms` 采集）；后处理脚本：`postprocess-results.sh`。
- 结果解析：计数取 spec reporter 末行 `ℹ tests|pass|fail|cancelled|skipped|todo`；失败名取**最后一个行首 `✖ failing tests:` 段**（避免测试内子进程 reporter 输出混入），逐条抽取后与 summary `fail` 对账：**200/200 全对，mismatch=0**（`25d-failure-extraction-mismatch.txt` 为空；唯一多段文件为 chief-workflow，按最后段解析）。
- 运行区间：2026-11-08 10:23:56 → 10:49:07（本地；DONE 行 `2026-11-08T02:49:07Z`），墙钟约 **25.2 分钟**；逐文件 wall 合计 1,409,540 ms（含 6×~90s watchdog = 540,520 ms；自然完成部分 869,020 ms）。

## 6. 全量结果（B0-2）

### 6.1 权威计数（504 个自然完成文件）

| 指标 | 值 |
| --- | --- |
| 自然完成文件 | **504**（exit 0：431；exit 1：73；其他退出码：0） |
| tests | **4,885** |
| pass | **4,652** |
| fail | **200** |
| cancelled | **1** |
| skipped | **32** |
| todo | **0** |

### 6.2 watchdog 挂起文件（6 个，不计通过、不计入 6.1）

`90s` watchdog → `exit 124`；SIGTERM 时 reporter 打印的部分计数（**残段，非自然完成**）：合计 33 tests / 23 pass / 10 fail（逐文件见 `26-hang-details.txt`）。

> 若把残段并入总数会得到 4,918 / 4,675 / 210 / 1 / 32 / 0 —— 该毛数**不是**权威基线口径；权威口径为「自然完成 504 文件」+「6 挂起单列」。

### 6.3 逐文件结果

完整逐文件表（文件、watchdog、exit、是否 watchdog、summary、六项计数、duration、wall）：`22-per-file-results-with-header.tsv`（510 行 + 表头）与原始 `21-per-file-results.tsv`（含 `DONE` 行）。

## 7. 失败/skip 权威清单与分类（B0-3）

- **失败权威清单**：附录 A（逐条 = 文件 + 测试名 + 文件级类别标签）。自然失败 **200 条**（72 个文件）+ 6 个挂起文件残段 **10 条**（单列，不计通过）。
- **skip 权威清单**：附录 B（31 条打印名 + 1 条源内条件跳过未打印名 = 32）；**cancelled 1 条**（turn-watch b-last-resort，10s 超时，不计通过）。
- 逐文件失败数分布（自然）：`test/runtime-core` 12 文件/33 条；`test/桌面应用` 20 文件/85 条（含 chief-workflow 16）；`test/测试` 16 文件/39 条；`test/编排` 15 文件/24 条；`test/装配` 3 文件/12 条；`test/门禁引擎` 5 文件/5 条；`test/pi-adapter` 1 文件/2 条（`23c-failure-counts-by-suite.txt`）。
- **逐条目错误分类**（按每条失败的错误块；`23d-entry-classification.tsv`，200 条）：

| 类别 | 条数 | 说明 |
| --- | --- | --- |
| `assertion`（AssertionError/行为或文本漂移） | 139 | 含文本/时延断言漂移 |
| `rpsu`（`Error: runtime-protection-scope-unknown`） | 28（其中 4 条同时含 AssertionError） | 集中在 runtime-core 7 文件与 `test/测试/abort-cleanup-verify.test.ts`（真实 Error 行：runtime-core 30 次 + 该文件 2 次） |
| `ENOTEMPTY` | 13 | 全部在 `test/桌面应用/chief-workflow.test.ts`（fixture 清理期 rmdir） |
| `EPERM` | 7 | Windows symlink（5 文件；与上一 B0 同族） |
| `timeout_or_wait` | 4（其中 1 条同时含断言） | `handback-delivery` 1、`multi-runtime` 3（桌面应用） |
| `other` | 9 | 无标准错误签名（含 1 条 W19 嵌套重复、`装配/main.test.ts` 文件级 `test failed` 等） |

> 说明：类别为**错误块标记归因**，同一测试可能命中多类（表中标注）；与上一 B0 的「环境/系统性/漂移/等待/文件级」五分法同族，便于下游逐条 diff。

## 8. 既有红/绿核对（设计 §4.5/§6.1 点名项）

| 文件 | 设计口径 | 本基线实测（HEAD `a1b2f66`） | 核对 |
| --- | --- | --- | --- |
| `test/编排/shell-readonly.test.ts:350` | **既有红**（只读档 `git status` 放行断言当前失败） | 9 tests / 8 pass / **1 fail**；失败名见附录 A；`AssertionError: 只读命令应放行：git status` | **既有红确认** |
| `test/编排/shell-gate.test.ts:884` | **既有红**（readonly 裁定 A 的 `git status` 放行断言当前失败） | 35 / 34 / **1 fail**；`AssertionError: git status（非 routine c-allow）在只读档仍放行` | **既有红确认** |
| `test/门禁引擎/classify-shell.test.ts` | 既有绿（当前断言 `git status/log/diff` deny 等） | 53 / 53 pass，exit 0 | **既有绿确认** |
| `test/门禁引擎/shell-write-guard.test.ts` | 既有绿 | 12 / 12 pass | 绿 |
| `test/门禁引擎/git-shell-acl.test.ts` | 设计 §4.5 将改为「只读精确形态 allow」 | **36 / 36 pass（exit 0）**；上一 B0 为文件级 `test failed`，本基线已转绿 | 记录（相对上一 B0 的变化） |
| `test/编排/shell-risky-order.test.ts:39` | 硬编码 `version:"3"`/`ans-default-v3` | 20 / 20 pass | 绿 |
| `test/编排/shell-escalation.test.ts` / `shell-judge.test.ts` | §6.1 回归 | 59 / 59、34 / 34 pass | 绿 |
| `test/编排/trunk-dispatch-parent.test.ts`（PR #72） | §6.1 回归 | 19 / 19 pass | 绿 |
| `test/编排/trunk-runtime.test.ts`（PR #72） | §6.1 回归 | 7 / 7 pass | 绿 |
| `test/runtime-core/application-mediation.test.ts`（PR #72） | §6.1 回归 | 8 / 8 pass | 绿 |
| `test/runtime-core/git-capability-tools.test.ts`（R14 等） | §4.5 将改新 reason | 45 tests / 38 pass / **7 fail**（R8/R12 系列；逐条见附录 A） | 既有红（checkpoint 同族） |
| `test/测试/lightweight-permission-repairs.test.ts:182` | POSIX skip 将同步 | 10 tests / 4 pass / **6 skipped**（D3 POSIX-only），exit 0 | 绿 + 既有 skip |
| `test/桌面应用/operator-channel.test.ts` | 既有断言不得破坏 | 57 tests / 56 pass / **1 fail**（`I-1 补丁（真正接通核查）…`，与上一 B0 同名既有红） | 既有红（非本变更） |

## 9. 挂起与特别项登记（B0-2）

### 9.1 挂起文件（6 个，90s watchdog，exit 124，不计通过）

`test/pi-adapter/write-sequencing.test.ts`（残段 4/3/1）、`test/测试/customer-authorization-plane-integration.test.ts`（1/0/1）、`test/桌面应用/directive-decision.test.ts`（1/0/1）、`test/桌面应用/optional-acceptance.test.ts`（3/2/1）、`test/桌面应用/session-rebuild-race.test.ts`（17/14/3）、`test/桌面应用/stuck-redispatch.test.ts`（7/4/3）。**与上一 B0 登记的 6 个挂起文件完全相同**（行为仍复现；逐文件细节与日志见 `26-hang-details.txt`、`22c-watchdog-killed.txt`）。

### 9.2 特别项

- `test/pi-adapter/installed-mcp-servers.test.ts`：逐文件隔离运行 **8 / 8 pass、3.9s、exit 0**（上一 B0 的「全量串行非确定性停摆、隔离 8/8」在本口径下未复现；隔离绿不等于全量绿，仍单列记录）。
- `test/桌面应用/chief-workflow.test.ts`：**自然退出**（exit 1，66.4s）；上一 B0 的 post-test 句柄泄漏（CPU 空转不退出）**在本基线未复现**；**全程未使用 `--test-force-exit`**（`31-chief-workflow-natural-attempt.meta.txt`）。
- 其余文件无信号终止、无 no-summary 文件（`22d-no-summary-files.txt` 为空）；watchdog 终止后 `tasklist` 检查与收工快照一致（见 §13.5）。

## 10. 与上一变更 B0（HEAD `e71501c`）的对照分类（不属本变更；数据不沿用）

> 本节是**分类参考**（上一 B0 为旧 HEAD + 旧方法；其数据不作为本基线），用于满足团队计划 §5.2「上一变更 B0 的 checkpoint 系统性失败/挂起若仍存在，逐条记录并分类（不属本变更）」。本基线全部数字均为本轮实测。

| 目录/类别 | 上一 B0（e71501c，批量口径） | 本 B0（a1b2f66，逐文件口径） | 差异 |
| --- | --- | --- | --- |
| 自然完成文件/失败条目 | 465 文件 / 198 fail + 1 cancelled | 504 文件 / 200 fail + 1 cancelled | 文件集随 HEAD 变化（+39 文件）；失败 +2 |
| runtime-core | 33 fail | 33 fail（12 文件） | 逐文件计数一致 |
| 编排 | 24 fail | 24 fail（15 文件） | 一致 |
| 测试（不含 cancelled） | 39 fail | 39 fail（16 文件） | 一致 |
| 桌面应用 | 82 fail | 85 fail（20 文件） | **+3：chief-workflow 13→16**（13 ENOTEMPTY + 2 断言 + 1 其他 = 16 条，其中 W19 有 3 条含嵌套重复） |
| 装配 | 12 fail | 12 fail（3 文件） | 一致 |
| 门禁引擎 | 6 fail | 5 fail（5 文件） | **-1：`git-shell-acl.test.ts` 文件级红转绿（36/36）** |
| pi-adapter | 2 fail（注入运行时 2；write-sequencing 单列） | 2 fail（注入运行时 2；write-sequencing 单列） | 一致 |
| 挂起文件 | 6 个 | **同 6 个** | 行为仍复现 |
| 特别项 | installed-mcp 串行停摆（隔离 8/8）；chief-workflow post-test 泄漏 | 逐文件隔离下 installed-mcp 8/8 无停摆；chief-workflow 自然退出 | 记录（口径差异 + 行为变化），均不改变「冻结脏基线」性质 |
| `turn-watch-verify/b-last-resort` | cancelled 1（10s 超时） | cancelled 1（10s 超时） | 一致（该条目在附录 A 的 spec 输出中以 `✖` 显示，但 summary 计 cancelled） |
| 失败构成 | 7 EPERM + 12 ENOTEMPTY + 24 rpsu + 143 漂移 + 10 等待/超时 + 3 文件级/空错误 | 7 EPERM + 13 ENOTEMPTY + 28 rpsu（含 4 条带断言）+ 139+9 断言/其他 + 4 等待/超时 | 同族；计数随 chief-workflow/解析口径微调 |

## 11. B0-1–B0-5 对照

| 条目 | 本记录/证据 |
| --- | --- |
| B0-1 身份与证据 | §2/§3；`00-opening-state.log`、`00b-head-commits.log`、`00d-input-hashes.log`、`01-git-status-porcelain.txt`、`01a-git-status-porcelain-utf8.txt`、`01b-status-summary.log`、`01d-scope-status.log`、`02b-t1-and-diff-facts.log` |
| B0-2 全量/逐文件/挂起/退出 | §5/§6/§9；`08-all-test-files.txt`、`20-main-pass-files.txt`、`21-per-file-results.tsv`、`22-per-file-results-with-header.tsv`、`22b-totals.log`、`22c-watchdog-killed.txt`、`26-hang-details.txt`、`logs-per-file/`（511 个原始日志）、`31-chief-workflow-natural-attempt.*` |
| B0-3 失败/skip 权威清单与既有红/绿 | §7/§8 + 附录 A/B；`23-failures-by-file.txt`、`23b-failures-with-class.txt`、`23d-entry-classification.tsv`、`24-skips-by-file.txt`、`24c-cancelled.txt`、`25-failing-first-errors.tsv` |
| B0-4 有效期 | §12（绑定 HEAD/tree/分支/T1/依赖锁/夹具/构建；本记录 SHA-256 由统筹登记入变更包） |
| B0-5 候选稳定性 | §4；`34*`/`35*`/`36*`/`37*`（manifest 前后同哈希、diff 空）、`38*`（收工状态） |

## 12. 有效期与下游判据

1. **本 B0 只对应**：HEAD `a1b2f66`（tree `3aa82fb7…`）+ 本节 §3 工作树（T1 三文件只读、`shared-components.md` 未暂存删除、198 项未跟踪、暂存空）。HEAD/分支/T1 文件/依赖锁（`package-lock.json`）/夹具/构建配置/命令/环境任一变化 → **B0 失效须重记**；不得沿用本记录数据。
2. **失败集合按（文件 + 测试名 [+ 类别]）逐条对照**，不以 fail 总数单独判断（新增测试会改变总数）；附录 A 为权威名单。
3. **新增确定性失败** = 附录 A 之外且非 §9 挂起残段的新失败；**新 skip** = 附录 B 之外的新 skip；skip/todo 不计通过。
4. **6 个挂起文件**（§9.1）不得计入通过；下游（D1/E3）默认按登记排除或单列隔离复跑；不得为收口改断言/加 skip/改 timeout；不得以 `--test-force-exit` 冒充自然通过（本基线全程未用）。
5. 本 B0 是**冻结脏基线**，不是绿色基线：§7 的 200 fail + 1 cancelled + 32 skip + 6 挂起均为 HEAD `a1b2f66` 开工前既有事实（含 checkpoint 系统性失败），**不属本变更**；本变更不得把它们写成「已清零」。
6. 候选范围：`src app test`（逐文件 SHA-256 + 聚合算法见 §4）；T1 三文件只读、不入候选；管理文档/角色卡 evidence/临时脚本不入候选。

## 13. 纪律声明与偏差（必须披露）

1. **工作树非干净**：基线包含 T1 未提交差异（3 文件）、`docs/communication/memo.md` 修改、`shared-components.md` 未暂存删除、198 项未跟踪文件；所有计数均在此状态下取得。
2. **执行方式**：全部测试为**逐文件独立进程自然运行**（等价于批量口径的 per-file 子进程；不并发），非单批 `node --test` 汇总；因此与上一 B0 的批量统计在「文件启动开销/汇总展示」上不完全可比，但逐文件计数口径更直接。逐文件 wall 合计与墙钟差异见 §5（进程/日期命令等 harness 开销）。
3. **未运行项**：6 个挂起文件（整文件 watchdog 终止，未验证）；真实模型调用、Electron/CDP/E2E、打包、真实 Git 远端操作均未执行。
4. **输入版本偏差**：设计文件实测为 P1.3（`2553b97a…`），与团队计划引用的 P1.2（`b13e2fe7…`）不同；本角色只读记录，不判效力；B0 不依赖设计版本，仅提示统筹/沟通核对。
5. **进程残留检查**：watchdog 终止后与收工时 `tasklist` 中 `node.exe` 均为同一既有进程（PID 19856，非本任务创建；前后一致）；无测试残留进程可辨。限制：`tasklist` 为系统级快照，无法区分其他会话进程。
6. **外部并发改动**：运行前后 `src app test` manifest 逐文件一致（聚合同哈希、diff 空），HEAD/tree/分支/diff 哈希未变；`src app test` 未发现外部改动，未触发停止条件。**另如实披露**：会话期间出现 1 个**非本角色写入**的管理文档 `docs/communication/2026-11-08_waiver_baseline_session-admission.md`（18 行 / 1,314 bytes / SHA-256 `d7a699d2819213cad60645fa0ffbce126fc1d5da290078f4dbcb6f6ab6b8e2fd`；文件标题自述「客户决定：跳过 B0 基线重新登记，直接实施」）。该文件位于 `docs/`（管理区、不入候选），不影响候选 manifest 与 B0 事实有效性；其效力与是否影响 B0 使用由统筹/沟通核对，本角色不判、不据此停止或改变任务（`00f-external-concurrent-change.log`、`38c-git-status-porcelain-final.txt`）。
7. **未提交/推送/暂存**；未改产品/测试/角色卡/边界/方案/验收/沟通/调度文档；本角色只写本记录与同名证据目录。

## 14. 证据目录与索引

证据目录：`角色卡/测试/docs/change/2026-11-08_session-admission-approval-B0-evidence/`，共 **563** 个文件（含 `logs-per-file/` 511 个原始逐文件日志：509 主运行 + chief-workflow 自然尝试副本 + 1 试点）。索引 `evidence-index.md`：SHA-256 `225a3ee77734122abfa4bbc8e43132d3b5815076ca692bee1cbfdd9230504ca8`（571 行 / 82,740 bytes）。

> 本记录 SHA-256 于写盘后由测试角色计算并在交付回报中给出（不写入正文以避免自指）；由统筹登记入变更包。

---

（附录见下）
### 附录 A：失败逐条权威清单（文件 + 测试名 [+ 文件级错误类别]）

> 类别标签为**文件级错误标记**（EPERM/ENOTEMPTY/rpsu=runtime-protection-scope-unknown/timeout_or_wait/assertion_or_behavior），非逐条归因；名称保留 spec reporter 原文（含耗时）。自然完成文件按字母序；最后 6 个 watchdog 文件为**挂起残段**（90s SIGTERM 时的部分计数，不计通过、不计自然完成）。

**test/pi-adapter/injected-runtime.test.ts**（2 条）
- [EPERM] store validate callback rejects directory symlink before Pi parse or new native write (10.58ms)
- [EPERM] Pi storage refuses file symlink and role/runtime mismatch without touching other storage (7.8167ms)

**test/runtime-core/abort-quarantine.test.ts**（3 条）
- [rpsu] abort rejection no longer quarantines forever once the underlying turn settles later (2.9093ms)
- [rpsu] abort rejection keeps quarantine when the underlying turn never settles (1.1167ms)
- [rpsu] normal abort without cleanup failure keeps its existing quarantine lifecycle (0.7494ms)

**test/runtime-core/dispatch-workflow-writer-copy.test.ts**（2 条）
- [assertion_or_behavior] dispatch_task 文案：工作流由运营（convener）落盘（直接写）后再派发；保留工作流先行 (1.7336ms)
- [assertion_or_behavior] dispatch_task promptGuidelines：同步运营写者口径，保留「先落盘再派发」 (0.2219ms)

**test/runtime-core/effective-timeouts.test.ts**（3 条）
- [rpsu] Pi env 300s/310s reach the Provider inspection option while the Service turn timer uses the fixed 1h last resort (3.513ms)
- [rpsu] Service explicit Pi timing overrides env, including the legacy disabled-timer values (1.2649ms)
- [rpsu] all runtimes read the same inspection env; Service still uses the fixed 1h last resort (1.1001ms)

**test/runtime-core/file-write-safety.test.ts**（1 条）
- [EPERM] D3 linked workspace root remains usable; linked target itself is not replaced (6.9226ms)

**test/runtime-core/git-capability-tools.test.ts**（7 条）
- [rpsu] R12 every real Core bind shares the host lease and registry; in-progress/active/disposed actors remain visible (0.8102ms)
- [rpsu] R12 interruption during async factory preparation prevents the subsequent native bind (0.8385ms)
- [rpsu] R12 actual shell/governance judge tool modes and a direct interpretation actor all enter the Core registry (0.6051ms)
- [rpsu] actual Service registry snapshots bind the instance and do not convert empty capabilities into confinement proof (1.0809ms)
- [rpsu] R8 a custom factory cannot self-report the default Codex Chat production provenance (0.6522ms)
- [rpsu] R8 native registry/instance/role/runtime/activity mismatches remain unknown (0.5176ms)
- [rpsu] R8 active HTTP inference alone is not treated as an uncontrolled execution program (0.4599ms)

**test/runtime-core/prompt-start-acknowledgement.test.ts**（4 条）
- [rpsu] active and disposed prompt rejections have no turn acknowledgement (0.7151ms)
- [rpsu] quarantined prompt rejection has no acknowledgement after one stopped actual turn (1.8616ms)
- [rpsu] synchronous acknowledgement throw yields one failed terminal, zero native work, and releases the turn (0.597ms)
- [rpsu] acknowledged turns keep aborted/timed_out outcomes and single matching terminal (0.5792ms)

**test/runtime-core/reasoning-effort.test.ts**（4 条）
- [rpsu] Service 三键读取注入：set ⇒ 注入 RuntimeProviderOptions.reasoningEffort（规范形） (3.2702ms)
- [rpsu] 未设/空串 ⇒ 字段缺席（逐字现状的机读形态，而非 undefined 值）；demo 恒缺席 (1.1955ms)
- [rpsu] 非法值 ⇒ 按未设处理（零参数）＋诊断如实；空串静默不诊断；绝不毁会话 (0.7142ms)
- [rpsu] 诊断自身故障不改变执行（绝不毁会话）；跨键不串（设 claude 键对 codex 会话零影响） (0.7708ms)

**test/runtime-core/session-store.test.ts**（2 条）
- [EPERM] store: traversal, mismatched scope and symlinked runtime directories rejected (2.3442ms)
- [EPERM] store: native validation stays lazy and native symlink is rejected before effects (2.9458ms)

**test/runtime-core/session.test.ts**（3 条）
- [rpsu] outer timeout remains timed_out when abort cleanup emits inner aborted terminals (0.6793ms)
- [rpsu] outer aborted result stays aborted and a settled underlying lifts quarantine despite failing cleanup (0.9964ms)
- [rpsu] Core-managed binding rejects a provider that did not register its display profile before first prompt (0.7502ms)

**test/runtime-core/submit-capability-tools.test.ts**（2 条）
- [rpsu] R2 Service real-chief context isolates all production tools/MCP and enforces role and turn budget (5.0134ms)
- [rpsu] R2 chief timeout is finite and normal sessions still receive injected narrow capabilities (0.7696ms)

**test/runtime-core/trunk-contract.test.ts**（1 条）
- [assertion_or_behavior] 主干来源：含 bootstrap/recovery/upgrade；不新造 main-upgrade（PM 复审 §4.10-3） (0.7716ms)

**test/runtime-core/version-change-contract.test.ts**（1 条）
- [assertion_or_behavior] doc-freeze reason 九类：customer/application 两分区并集恰等于全集、交集为空；migrated-draft 不是 reason（F29/F35/Q6） (0.501ms)

**test/桌面应用/application-line.test.ts**（1 条）
- [assertion_or_behavior] 申请直达：来源角色=rapporteur，卡片不镜像，裁决回来源；request.* 事件写 tasks.jsonl (177.4813ms)

**test/桌面应用/boundary-refresh.test.ts**（1 条）
- [assertion_or_behavior] G-4 接线钉（裁定④⑤＋I3）：集合重推导单一来源；注入才注册；护栏读活状态；重建行技能措辞 (1.4955ms)

**test/桌面应用/chain-enforcement.test.ts**（6 条）
- [assertion_or_behavior] M1/M2：状态缺失受理 + advisory（意图/名单）；同文幂等；基线漂移受理 (52.46ms)
- [assertion_or_behavior] M5/M6/M7 + 交付标记：状态缺失受理 + advisory；verifier/文件型模块元数据 (79.8968ms)
- [assertion_or_behavior] D3 卡种收口（2026-10-31）：后续 decision/intent-confirm 裁决不覆盖真实 D3（选项与角色同名也不覆盖） (119.7079ms)
- [assertion_or_behavior] D3 卡种收口（2026-10-31）：新格式 appointment 被接受；无 cardKind 且无 roster 戳的裁决被忽略 (125.2883ms)
- [assertion_or_behavior] M9 报告路由：运营派的 worker 报告回运营；幕僚派的任务报告回幕僚 (50.985ms)
- [assertion_or_behavior] F4：质检报告按任务创建者路由——运营发起回运营；幕僚调度回幕僚 (62.6369ms)

**test/桌面应用/chief-workflow.test.ts**（16 条）
- [ENOTEMPTY] selected (528.9382ms)
- [ENOTEMPTY] commit-race (510.9898ms)
- [ENOTEMPTY] unmanaged (159.186ms)
- [ENOTEMPTY] W14 convener按本次真实任务冻结；缺完整执行闭包保stage/code且零worker任务/HTTP (229.6366ms)
- [ENOTEMPTY] W23 Convener不能越Chief新建普通Verifier，零任务零HTTP (197.148ms)
- [ENOTEMPTY] W22 Convener显式review也不能越Chief创建Verifier，零任务零HTTP (203.4411ms)
- [ENOTEMPTY] W19 实际Core回报与Git回调同assignment；报告续父/通知/新chat/关闭父边界 (851.7466ms)
- [ENOTEMPTY] W19 实际Core回报与Git回调同assignment；报告续父/通知/新chat/关闭父边界 (370.6254ms)
- [ENOTEMPTY] W19 实际Core回报与Git回调同assignment；报告续父/通知/新chat/关闭父边界 (370.6254ms)
- [ENOTEMPTY] W20 默认Core/Chat产品真实报告落账并到chief 真实R9竞争 (404.764ms)
- [ENOTEMPTY] W28 默认Core/Chat真实受派策划缺不可变pin stop 拒绝且零停止 (622.2659ms)
- [ENOTEMPTY] W28 默认Core/Chat真实受派策划缺不可变pin stop-and-restart 拒绝且零停止 (576.9504ms)
- [ENOTEMPTY] W33 真实DocRun关闭通知退休旧InitRun绑定且后续合法任务继续 (8063.652ms)
- [ENOTEMPTY] W34 真实首文档发布与原创建者关闭后派团队规划保独立scope (6352.5414ms)
- [ENOTEMPTY] W47 默认Core/Codex本地HTTP：忙Chief独立select释放真实卡调用 (270.9575ms)
- [ENOTEMPTY] W47 默认Core/Codex本地HTTP：忙Chief独立revise释放真实卡调用 (226.2937ms)

**test/桌面应用/directive-input.test.ts**（5 条）
- [assertion_or_behavior] sendSession 命中：不调用 manager.send/handle.send、不产生角色轮次；Composer 未开会话仍走指令通道 (49.5375ms)
- [assertion_or_behavior] sendSession：命中带图直接拒绝（不解码/不投递）；未命中走既有普通聊天（逐字不变） (3.3207ms)
- [assertion_or_behavior] sendSession：未注入指令控制器时命中标记 fail-closed（不回退普通聊天/能力缺席） (3.6062ms)
- [assertion_or_behavior] sendSession：自然语言经 desktop.interpretDirective（SessionManager 同一套 runtimeOptions/adapter 工厂）⇒ 面板预填；确认落账 (4011.2025ms)
- [assertion_or_behavior] sendSession：demo 引擎无判断 AI ⇒ 解释不可用，回退面板（confirmable=false）；不调用解释器工厂 (4011.785ms)

**test/桌面应用/download-decision.test.ts**（1 条）
- [assertion_or_behavior] 同指纹重复 judge deny：第二次升级客户卡（不重复自动拒绝） (3096.5174ms)

**test/桌面应用/download-request.test.ts**（1 条）
- [assertion_or_behavior] 一项目一卡：前一张未决时下载卡排队，不呈现 (3008.4992ms)

**test/桌面应用/genesis-bootstrap.test.ts**（1 条）
- [assertion_or_behavior] 已 bootstrap（有角色）：su 的 gate 拒绝 角色卡/<新角色>/role-card.md（不再有创世授权） (155.3247ms)

**test/桌面应用/handback-delivery.test.ts**（6 条）
- [timeout_or_wait] E-1 排队：su 忙时保留，settle 后连续回交按原序合成一次验收输入 (393.3611ms)
- [timeout_or_wait] 连续回交投递失败：整批保留同序，重试送达一次，原报告键不丢 (79.9499ms)
- [timeout_or_wait] 真机崩溃修复：坏形状回交事件（缺载荷/缺 roleId）→ 不投递、如实系统行、**零未捕获拒绝** (308.1829ms)
- [timeout_or_wait] C frozen batch retries keep members and delivery ID while later reports stay separate (77.8009ms)
- [timeout_or_wait] 2026-10-24 trio 回交路由：项目 worker 回交→Steward；内置来源回交→Lead；同轮 settle 不双发 (3234.2702ms)
- [timeout_or_wait] B 星形回交：tasks.jsonl 已知 taskId ⇒ 只投幕僚、[工作结果] 固定字段、写 task.reported (3131.6022ms)

**test/桌面应用/log-actions.test.ts**（1 条）
- [assertion_or_behavior] listTasks / readRoleActivityLog / terminateRoleRun / redispatchTask 参数校验与如实回执 (93.3523ms)

**test/桌面应用/multi-runtime.test.ts**（8 条）
- [timeout_or_wait] D1 actual Pipeline/Service chooses demo, writes isolated replay and converts native context honestly (34.4333ms)
- [timeout_or_wait] D1 actual Pipeline/Service chooses pi, writes isolated replay and converts native context honestly (17.4994ms)
- [timeout_or_wait] D1 actual Pipeline/Service chooses codex, writes isolated replay and converts native context honestly (17.9148ms)
- [timeout_or_wait] D1 actual Pipeline/Service chooses claude, writes isolated replay and converts native context honestly (17.3184ms)
- [timeout_or_wait] D1 profile success rebuilds same engine after busy old Pi finishes; ambient token remains old until safe; failure is unchanged (10.0082ms)
- [timeout_or_wait] D1R2 actual Pipeline/Service returns original client IDs and real distinct turn IDs for same text (1534.6594ms)
- [timeout_or_wait] D1R2 actual ack preserves a failed delayed terminal and the next aborted original client (1535.3182ms)
- [timeout_or_wait] actual Core request_choice abort preserves accepted/current facts, expires the old decision and allows one explicit next prompt (1515.1318ms)

**test/桌面应用/operator-channel.test.ts**（1 条）
- [assertion_or_behavior] I-1 补丁（**真正接通**核查）：真实 openRoleSession + 真实装配——(c) 实件在场时能力面产出 ShellGate（Pi 适配器 run_shell 注册条件成立） (97.7921ms)

**test/桌面应用/p0-halt-and-images.test.ts**（3 条）
- [assertion_or_behavior] P0-2 abort 三态：demo 替身 ⇒ supported:false（「当前运行时不支持停止」如实，绝不假装已停） (78.6314ms)
- [assertion_or_behavior] P0-1 重校验拒绝路径：坏 MIME（真字节非图）与超 5MB 都**整条拒发**（句柄不被触碰；错误如实） (7.8577ms)
- [assertion_or_behavior] P0-1 合法图：组契约 PromptOptions（mimeType 以**嗅探**为准）→ 句柄图片载荷保真并明确聊天来源 (4.188ms)

**test/桌面应用/project.test.ts**（1 条）
- [assertion_or_behavior] buildProjectConfig：由枚举结果构造角色表，acceptance 透传 (44.3431ms)

**test/桌面应用/queue-visibility.test.ts**（1 条）
- [assertion_or_behavior] P0 队列可见：ageMs/headKind/blockedReason/activeTurnId 随真实快照外推（忙时等待） (103.6483ms)

**test/桌面应用/run-change-trigger.test.ts**（9 条）
- [assertion_or_behavior] 派发不再自动弹 run-change：pinned + 新版本 → 受理 + advisory；客户卡请求数 0 (97.9897ms)
- [assertion_or_behavior] 显式入口（continue-frozen）：requestRunChangeDecision 三模式落账不变 (88.2365ms)
- [assertion_or_behavior] 显式入口（stop-and-restart）：requestRunChangeDecision 三模式落账不变 (74.9114ms)
- [assertion_or_behavior] 显式入口（stop）：requestRunChangeDecision 三模式落账不变 (92.3506ms)
- [assertion_or_behavior] stop-and-restart 后：新 draft run 可按 v2 文档重新 pin，并恢复派发新角色 (76.3255ms)
- [assertion_or_behavior] 显式入口无会话兜底：没有可呈现的客户卡会话 ⇒ 如实失败（不弹卡） (78.3176ms)
- [assertion_or_behavior] 宁可不弹（B1）：目标不存在 ⇒ 硬 target-card-missing，不呈现 run-change (80.5625ms)
- [assertion_or_behavior] 提案卡：冻结 run 上出现更高版本 proposal ⇒ 先尝试 run-change 卡，提案卡 notPresented 拒发 (74.8376ms)
- [assertion_or_behavior] AC-17：VCA submitted/approved 在途 ⇒ 抑制自动 run-change（系统行）；结束后恢复；显式入口保留 (81.3089ms)

**test/桌面应用/run-pin.test.ts**（11 条）
- [assertion_or_behavior] run-pin：M1/M2/M3 共享 draft runId；handoff 前 pin 同一 runId；任务锚定 pinned (90.2337ms)
- [assertion_or_behavior] D3 卡种收口（2026-10-31）：真实 D3 + 后续 decision 裁决后 pin，manifest.d3 为真实角色集 (129.973ms)
- [assertion_or_behavior] run-pin：缺 D3 时 pin 失败仍受理；任务锚定 draft、不伪造 pinned (65.4911ms)
- [assertion_or_behavior] P1.1：M1 缺 flowId 也生成 pending draft；M2 带 flowId 时领养同一 runId (39.3487ms)
- [assertion_or_behavior] F2：版本化文档基线违规受理 + advisory；基线/文档未被改写 (67.4523ms)
- [assertion_or_behavior] R2：handoff 无 flowId 受理、省略锚点、run-ledger-unavailable (43.3837ms)
- [assertion_or_behavior] R2：run 账本不可用时 handoff 受理、无锚点、run-ledger-unavailable (84.4804ms)
- [assertion_or_behavior] AC-2.8：会话级 pinned 哈希漂移受理、advisory、manifest 未改写、任务无锚点 (75.6266ms)
- [assertion_or_behavior] AC-2.8/R2：pinned roster 失败受理、advisory、manifest 未改写、任务无锚点 (95.1855ms)
- [assertion_or_behavior] AC-2.6：legacy flow 派发受理 + run-legacy-readonly + draft 锚点、旧记录可读 (77.9715ms)
- [assertion_or_behavior] P1-R-08-R1：pinned run 未声明 roles 时不产 run-role-missing、不锚定 (76.1872ms)

**test/桌面应用/star-routing.test.ts**（7 条）
- [assertion_or_behavior] 星形目标（v4.1）：chief → 产品受理（链首）；chief → 运营缺 D3 受理 + advisory；幕僚自身拒绝 (45.0531ms)
- [assertion_or_behavior] convener 拥有 dispatch（v4.1）：未接交付时派项目 worker 受理 + advisory，建任务 (45.0892ms)
- [assertion_or_behavior] BUG-5：任务已报告/已收口后，同一幂等键重复派发被抑制（不建新任务、不投递） (49.3258ms)
- [assertion_or_behavior] BUG-5：派发到无会话角色会先 open/resume；打开失败则如实拒绝且不入队 (45.5389ms)
- [assertion_or_behavior] BUG-5：排队期间任务已完成 ⇒ 已出队前不再投递/不补写 delivered（只记诊断） (59.1277ms)
- [assertion_or_behavior] BUG-5：任务已报告后的重复回交被抑制（不同 handbackKey 也不重复投递） (47.5347ms)
- [assertion_or_behavior] AC-4.3：洁净派发无 advisory、无诊断噪声 (49.3437ms)

**test/桌面应用/task-restart.test.ts**（1 条）
- [assertion_or_behavior] 重启恢复：未投递任务重新入队一次；已投递不前移；重复调用不重复投；坏行跳过 (2044.6244ms)

**test/桌面应用/version-change.test.ts**（4 条）
- [assertion_or_behavior] Batch 3.5 能力实现：VCA submit（submitted）/ refactor（requested）/ stable write request（requested+许可） (44.0141ms)
- [assertion_or_behavior] VCA 基线修复：无已落盘 trunk ⇒ submitVersionChange 自动按 bootstrap 提交（不允许角色自报“伪装”） (29.0943ms)
- [assertion_or_behavior] VCA 自动呈现：提交成功即自动调用客户批准卡（不阻塞回执；无通道保持 submitted） (45.7402ms)
- [assertion_or_behavior] SessionManager blocked 提示：无客户卡通道 ⇒ 只记诊断、不提示；报告路由照常 (4767.2705ms)

**test/测试/abort-cleanup-verify.test.ts**（2 条）
- [rpsu] abort 抛错但底层稍后 settle：隔离解除，后续 prompt 可再次进入，不永久卡在「中止清理中」 (3.1551ms)
- [rpsu] 底层永不 settle：仍需拒绝后续 prompt（fail-closed），清理失败不等于放行 (1.1564ms)

**test/测试/direct-role-capabilities-e2e.test.ts**（1 条）
- [assertion_or_behavior] Q normal-new early chain: actual chief customer request -> formal product dispatch -> product write/report; no seeded freeze (82.1873ms)

**test/测试/download-requests-integration.test.ts**（1 条）
- [assertion_or_behavior] 审计坏行：downloads.jsonl/tasks.jsonl 坏行不影响主路径；小上限账本轮转仍可读 (26.539ms)

**test/测试/entry-role-minimal-d.test.ts**（1 条）
- [assertion_or_behavior] D-04 撤除残留：src/app 生产源码零命中（排除 dist/node_modules） (64.9484ms)

**test/测试/g3-search-verify/pi-loopback-verify.test.ts**（1 条）
- [assertion_or_behavior] 跨轮配对：两轮各一次检索 ⇒ 每轮恰一对、turnId 归各自轮、结果文本各自对应（id 不串） (13.9306ms)

**test/测试/g4-skill-verify/b-render-double-check.test.ts**（1 条）
- [EPERM] 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 (6.5799ms)

**test/测试/g4-skill-verify/e-handler.test.ts**（1 条）
- [assertion_or_behavior] 护栏矩阵：无轮次/回交轮/系统轮/派发轮 ⇒ not-customer-turn（零副作用）；直聊与排队客户消息轮 ⇒ 放行 (28.3188ms)

**test/测试/g4-skill-verify/h-scope-audit.test.ts**（3 条）
- [assertion_or_behavior] 范围②：MCP V2 已实施——install_mcp/uninstall_mcp 在 src（工具＋schema 可描述）；docs/mcp 预授权且被声明读取器消费；三适配器装配；能力位仅 su (3.4782ms)
- [assertion_or_behavior] 范围③补＋⑤：编排判据——installSkill 由能力矩阵透传（single=su / trio=Nominator）；项目角色即便误给也零注册 (0.7037ms)
- [assertion_or_behavior] 范围⑥：mcp-surface 探针为 scratch 评估物——不在产品路径/不被 test 全局匹配/无真实网端/零引用 (3.6919ms)

**test/测试/g4v2-mcp-verify/f-handler.test.ts**（2 条）
- [assertion_or_behavior] F3 护栏矩阵：无轮次/非客户轮（派发或系统 kind）⇒ not-customer-turn 逐字＋零副作用；客户轮与排队客户消息轮放行 (6.6559ms)
- [assertion_or_behavior] F7 拒绝路径诊断：mcp.refused 落盘（reasonCode 如实）；系统行零投递已由 F2 覆盖 (15.305ms)

**test/测试/governance-e2e-auto/i-full-chain.test.ts**（2 条）
- [assertion_or_behavior] 最小系统全链（v4.1）：六角色枚举 + 幕僚链首派发落 tasks.jsonl + 无 flow/gate/ledger + 运营派发作用域 (54.9392ms)
- [assertion_or_behavior] F 终态收口：幕僚调度验收（review 任务→质检回交→工作结果）且无自动验收派发 (32.6011ms)

**test/测试/real-entry.test.ts**（5 条）
- [rpsu] 真实入口:ans role run 编排 --task T-1 以 0 结束 (308.7407ms)
- [rpsu] 真实入口:演示输出含角色/边界来源、两笔写入、按根分组、settled (310.1332ms)
- [rpsu] 真实入口:演示**不产生新的** docs/scheduling 记录、也不改写既有管理记录(F3) (322.2281ms)
- [rpsu] 真实入口失败路径非 0:govern 缺真实 Pi 适配器 provider 配置（环境已擦洗：ANS_PI_*/凭据/ANS_RUNTIME 不入子进程） (353.1135ms)
- [rpsu] 真实入口:runCli 默认擦洗——跑测进程的 ANS_RUNTIME 与 Pi 凭据不传给子进程（哨兵值实测） (379.1494ms)

**test/测试/t1-pipeline-integration.test.ts**（3 条）
- [assertion_or_behavior] T1 pi: real Pipeline confirmation pause → abort → stale yes → next write denied → current yes permits exact path/report (86.6682ms)
- [assertion_or_behavior] T1 codex: real Pipeline confirmation pause → abort → stale yes → next write denied → current yes permits exact path/report (59.8246ms)
- [assertion_or_behavior] T1 claude: real Pipeline confirmation pause → abort → stale yes → next write denied → current yes permits exact path/report (52.6357ms)

**test/测试/t1-real-cli.test.ts**（4 条）
- [rpsu] T1 actual bin role/pi: actual adapter and registered handler reject an out-of-boundary write (330.9086ms)
- [rpsu] T1 actual bin role/codex: actual adapter and registered handler reject an out-of-boundary write (473.8732ms)
- [rpsu] T1 actual bin govern/codex: actual adapter and registered handler reject an out-of-boundary write (463.6102ms)
- [rpsu] T1 actual bin role/claude: actual adapter and registered handler reject an out-of-boundary write (472.3683ms)

**test/测试/trunk-stable-write-integration.test.ts**（2 条）
- [assertion_or_behavior] stable workflow：确认卡 → 许可安装 → run-role gate 放行/拒绝 → completeWrite → mini re-pin（不升版本、无 drift） (94.2223ms)
- [assertion_or_behavior] appointment-write：role-card 钩子 → 许可 → gate → mini re-pin roleCards（F15 三类快照、不升版本） (96.5735ms)

**test/测试/version-change-integration.test.ts**（9 条）
- [assertion_or_behavior] VCA：product version-upgrade 经真实客户卡提交/批准 → 冻结+R9+trunk t2；冻结后守卫拒绝同版本覆盖 (70.0504ms)
- [assertion_or_behavior] VCA：detail-amendment 提交冻结修正案 → 批准 → 逐项 apply/keep + acknowledgments → 只冻结 applied (64.7494ms)
- [assertion_or_behavior] VCA：客户拒绝 ⇒ 目标保持草稿、不 re-pin；修正案保持冻结（不可原地复用） (63.6099ms)
- [assertion_or_behavior] VCA：发起角色、目标范围、base 匹配、并发与幂等（真实错误码） (66.7818ms)
- [assertion_or_behavior] VCA：批准前 toSha256 重验（提交后目标漂移 ⇒ vca-hash-drift，不冻结/不 re-pin） (55.3929ms)
- [assertion_or_behavior] VCA AC-5：无效 roster / D3 越界 / 版本链不匹配 ⇒ 批准前 fail-closed（不冻结/不 re-pin/trunk 不变） (57.1278ms)
- [assertion_or_behavior] VCA AC-5：apply 前重验（批准后链损坏 ⇒ vca-apply-failed，不 re-pin；修复后可重试） (47.7786ms)
- [assertion_or_behavior] bootstrap：无 trunk VCA（baseTrunk:null + bootstrap:true）批准 → 冻结目标并建立 trunk v1 (10.5028ms)
- [assertion_or_behavior] 冻结：missing ⇒ 既有文档一律冻结；corrupt ⇒ fail-closed；doc-freezes 派生缓存可重建且以 R9 为准 (27.3246ms)

**test/测试/wiring.test.ts**（1 条）
- [assertion_or_behavior] 接线:门禁引擎的 F4 收窄经真实装配配置生效(判定来自 resolveWrite) (29.1988ms)

**test/编排/appointment-roster.test.ts**（2 条）
- [assertion_or_behavior] BUG-3：appointment-write judge 事实含角色可写根（角色卡/<target>/ ∪ 名单目录）与 allowed 探针 (13.6446ms)
- [assertion_or_behavior] BUG-3：角色卡 role-card.md 与 boundary.yaml 均经同一 resolveWrite 探测为 allowed (15.1448ms)

**test/编排/chat-handback-scope.test.ts**（1 条）
- [assertion_or_behavior] real ACK binds task → Q1/Q2 chat → next task even with delayed consumption; chat report drops old taskId (25.6494ms)

**test/编排/direct-role-capabilities.test.ts**（1 条）
- [assertion_or_behavior] Retained intent confirmation: real migration keeps history and only the exact persisted customer decision adds confirmation (103.2812ms)

**test/编排/git-capabilities.test.ts**（1 条）
- [assertion_or_behavior] Git team plan publication and active-only activation: real tasks and structured bytes preserve document/execution authority (2518.2692ms)

**test/编排/governance-matrix-injection.test.ts**（1 条）
- [assertion_or_behavior] A5 runRole 一次性 CLI：createAdapter 不收到 capabilities（矩阵不注入） (10.1999ms)

**test/编排/handback.test.ts**（1 条）
- [assertion_or_behavior] openRoleSession：普通角色 settle → 发出 handback（形状正确） (25.9985ms)

**test/编排/section1-write-preauthorization.test.ts**（2 条）
- [assertion_or_behavior] 有任务 writeSet 时 trio 不并入 Section 1：Nominator 角色卡条目仍被 F4 收窄拒 (9.3191ms)
- [assertion_or_behavior] 人事（Nominator）：无任务收窄时 Section 1 条目直接放行；他人写区/应用目录仍拒 (8.2736ms)

**test/编排/session-dir.test.ts**（2 条）
- [assertion_or_behavior] D-1：projectRoot 为空 → 不传 sessionDir（旧行为） (0.408ms)
- [assertion_or_behavior] D-1：一次性路径 runRole **不传**能力面（一局即止，无持久化/恢复语义） (9.8833ms)

**test/编排/shell-authorized-routine.test.ts**（1 条）
- [EPERM] node test外指符号链接路径不获委托；项目内测试路径获委托 (1.6958ms)

**test/编排/shell-gate.test.ts**（1 条）
- [assertion_or_behavior] readonly 裁定 A：裸串分类器（生产四态封装不带 ruleId）⇒ 同一冻结谓词兜底；非 routine c-allow 仍放行 (1.741ms)

**test/编排/shell-operator-only.test.ts**（1 条）
- [assertion_or_behavior] P6 集成（Q1/Q2 口径修正）：可静态证明越界 ⇒ deny；不可解析 ⇒ 交判断并附脚本内容；plain 仍按边界 (3.0954ms)

**test/编排/shell-readonly.test.ts**（1 条）
- [assertion_or_behavior] 只读档集成（门禁引擎实件）：ls/git status/node --version 放行；rm→readonly-deny；node --test→readonly-deny（不在白名单，本任务接受的现状）；sh -c→c-deny (4.0113ms)

**test/编排/trio-worker-report.test.ts**（3 条）
- [assertion_or_behavior] 卡片文本：幕僚卡要求派发后结束本轮、禁止 sleep/轮询空转；五张 worker 卡要求完成任务必须 submit_report (0.4975ms)
- [assertion_or_behavior] v4.1 工作流卡文本：幕僚主链顺序一步一派；产品/策划/人事/运营/质检含各自产物与回报目标；convener 获得 dispatch 能力 (0.3678ms)
- [assertion_or_behavior] 卡片文本：验收卡发起权归质检——运营只可 dispatch 质检，幕僚不得要求运营提交验收卡 (0.2334ms)

**test/编排/trunk-service.test.ts**（1 条）
- [assertion_or_behavior] applyStableSnapshot：mini re-pin 不升 trunkVersion、旧哈希不符/无 manifest 待续接 (73.2024ms)

**test/编排/trunk-upgrade-validation.test.ts**（5 条）
- [assertion_or_behavior] AC-5：无效 roster ⇒ 批准前拒绝（vca-target-invalid，不冻结/不 re-pin） (69.1542ms)
- [assertion_or_behavior] AC-5：D3 targetRoleIds 不在 roster ⇒ 批准前拒绝（vca-target-invalid） (61.9086ms)
- [assertion_or_behavior] AC-5：契约版本链不匹配（roster 引用 proposal v1 + target proposal v2）⇒ 拒绝 (53.115ms)
- [assertion_or_behavior] AC-5：role-card 缺失 ⇒ 批准前拒绝（fail-closed） (54.5233ms)
- [assertion_or_behavior] AC-5：合法单契约升级仍可通过（roster 未变更 ⇒ 不做磁盘最新版强链校验） (54.8683ms)

**test/装配/entry.test.ts**（1 条）
- [timeout_or_wait] 入口退出码可靠：demo 路径以 0 退出且无警告 (320.0422ms)

**test/装配/main.test.ts**（1 条）
- [assertion_or_behavior] test\装配\main.test.ts (341.1172ms)

**test/装配/multi-runtime.test.ts**（10 条）
- [rpsu] root flag and env reach demo through actual Interface/Pipeline/Service handlers in both commands (250.1148ms)
- [rpsu] root flag and env reach pi through actual Interface/Pipeline/Service handlers in both commands (28.1811ms)
- [rpsu] root flag and env reach codex through actual Interface/Pipeline/Service handlers in both commands (25.6948ms)
- [rpsu] root flag and env reach claude through actual Interface/Pipeline/Service handlers in both commands (23.5668ms)
- [rpsu] root command defaults reach demo and Pi respectively through actual Service injection (24.801ms)
- [rpsu] new accepted runtime role cards can be reached from root fallback without adding task writes (23.2814ms)
- [rpsu] actual bin default pi Provider fails honestly for missing configuration in role and govern (314.8609ms)
- [rpsu] actual bin default codex Provider fails honestly for missing configuration in role and govern (336.6682ms)
- [rpsu] actual bin default claude Provider fails honestly for missing configuration in role and govern (327.4055ms)
- [rpsu] actual bin missing SDK errors are honest and masked without starting model requests (324.115ms)

**test/门禁引擎/convener-workflow-write.test.ts**（1 条）
- [assertion_or_behavior] 卡文本：运营负责落盘工作流，幕僚不再被暗示为写者 (0.5262ms)

**test/门禁引擎/governance-matrix-service.test.ts**（1 条）
- [assertion_or_behavior] 渲染过滤：section=roles/routing 与注册表展示字段出现在文本中 (1.3545ms)

**test/门禁引擎/list-project.test.ts**（1 条）
- [assertion_or_behavior] listProject：枚举真实项目（本仓库）全部角色，边界均解析成功且无警告 (47.0215ms)

**test/门禁引擎/role-group-metadata.test.ts**（1 条）
- [assertion_or_behavior] listProject：实际已接受的四份运行时组卡返回组别，15 个活项目角色和归档约定保留 (44.5288ms)

**test/门禁引擎/view-image-cards.test.ts**（1 条）
- [assertion_or_behavior] D-10：质检卡保留可选质量核对与截图上限，不要求录屏 (0.5705ms)

**以下为 6 个 watchdog 挂起文件的残段失败（SIGTERM 时部分计数，非自然完成；不计通过）**

**test/pi-adapter/write-sequencing.test.ts**（残段 1 条，watchdog=90s，exit=124）
- [assertion_or_behavior] test\pi-adapter\write-sequencing.test.ts (90018.8068ms)

**test/桌面应用/directive-decision.test.ts**（残段 1 条，watchdog=90s，exit=124）
- [assertion_or_behavior] test\桌面应用\directive-decision.test.ts (89992.2522ms)

**test/桌面应用/optional-acceptance.test.ts**（残段 1 条，watchdog=90s，exit=124）
- [assertion_or_behavior] 幕僚调度验收：chief 可自行核对（role_status）并可把 review 任务派给质检；回交只回幕僚 (42.0105ms)

**test/桌面应用/session-rebuild-race.test.ts**（残段 3 条，watchdog=90s，exit=124）
- [assertion_or_behavior] 重建 dispose 等待窗口：stop A 保持用户目标/关闭契约 (5.3692ms)
- [assertion_or_behavior] 重建 dispose 等待窗口：stop all 保持用户目标/关闭契约 (9.8242ms)
- [assertion_or_behavior] 重建 open 等待窗口：stop A 保持用户目标/关闭契约 (5.0535ms)

**test/桌面应用/stuck-redispatch.test.ts**（残段 3 条，watchdog=90s，exit=124）
- [assertion_or_behavior] safe 重派：新 taskId + retryOf + 同 idempotencyKey；原任务 closed/rework；新任务投递 (116.341ms)
- [assertion_or_behavior] B-07 自动换人：同链第 2 次重派自动选择替代角色，并缩窄任务 (234.0686ms)
- [assertion_or_behavior] B-07 升级卡：连续 2 次重派仍卡死 ⇒ 经 customerInput 提交继续/重派/换人/终止（唯一推荐） (88.9317ms)

**test/测试/customer-authorization-plane-integration.test.ts**（残段 1 条，watchdog=90s，exit=124）
- [assertion_or_behavior] test\测试\customer-authorization-plane-integration.test.ts (89997.7366ms)

### 附录 B：skip 权威清单与 cancelled 条目

自然完成文件 skipped 合计 **32**；spec 输出打印名的 **31** 项如下（第 32 项为源内条件跳过，未打印具体名：`test/pi-adapter/session-persistence.test.ts` skipped=1 / printed=0）。

- `test/codex-adapter/session.test.ts` | ﹣ owned native process group cleanup kills a wrapper and child that ignore SIGTERM (0.1166ms) # SKIP
- `test/runtime-core/file-write-safety.test.ts` | ﹣ D3 write and edit preserve existing ordinary modes and strip special bits (0.1135ms) # SKIP
- `test/runtime-core/file-write-safety.test.ts` | ﹣ D3 handler under strict umask retains existing mode and keeps new files private (0.0479ms) # SKIP
- `test/runtime-core/file-write-safety.test.ts` | ﹣ D3 chmod failure reaches the handler without committing file or mode (0.0579ms) # SKIP
- `test/runtime-core/file-write-safety.test.ts` | ﹣ D3 sync failure reaches the handler without committing file or mode (0.0839ms) # SKIP
- `test/测试/git-role-workflows-e2e.test.ts` | ﹣ Q75 persisted governance status pointer is information only and bound across Desktop rebuild (0.1119ms) # SKIP
- `test/测试/git-role-workflows-e2e.test.ts` | ﹣ Q87 quality document filename version keeps schema and actual metadata bindings (0.0571ms) # SKIP
- `test/测试/git-role-workflows-e2e.test.ts` | ﹣ Q22 explicit outer failure after real blocked cleanup (0.1197ms) # SKIP
- `test/测试/git-role-workflows-e2e.test.ts` | ﹣ Q37 CHANGE existing-delivery entry to actual product draft creator-close (0.0914ms) # SKIP
- `test/测试/git-role-workflows-e2e.test.ts` | ﹣ Q43 CHANGE real intent confirmation and version2 planning creator-close (0.0289ms) # SKIP
- `test/测试/git-role-workflows-e2e.test.ts` | ﹣ CHANGE actual v2 publication and frozen-run mode (0.0197ms) # SKIP
- `test/测试/git-role-workflows-e2e.test.ts` | ﹣ CHANGE standalone replacement admission diagnostic, not creator-report continuity (0.0144ms) # SKIP
- `test/测试/git-role-workflows-e2e.test.ts` | ﹣ Q48 hub ordinary no-Git product draft report and Chief typed close (0.0152ms) # SKIP
- `test/测试/git-role-workflows-e2e.test.ts` | ﹣ Q59 Product same-candidate denied write recovers within original task (0.0132ms) # SKIP
- `test/测试/git-role-workflows-e2e.test.ts` | ﹣ Q70 workflow formal Product blocked Chief rework and real same-goal draft recovery (0.0144ms) # SKIP
- `test/测试/git-role-workflows-e2e.test.ts` | ﹣ Q71 Nominator formal blocked Chief rework and customer-visible stop (0.013ms) # SKIP
- `test/测试/git-role-workflows-e2e.test.ts` | ﹣ Q72 Convener ordinary preparation formal blocked Chief rework and visible stop (0.0129ms) # SKIP
- `test/测试/lightweight-permission-repairs.test.ts` | ﹣ D3 AC3/5: explicit cat executable requires existing approval; refusal, unavailable, timeout and abort never execute (0.0675ms) # SKIP
- `test/测试/lightweight-permission-repairs.test.ts` | ﹣ D3 AC4: ordinary cat/ls/rg/git reads remain fast; rg --pre forms need approval without pattern/filename false positives (0.0614ms) # SKIP
- `test/测试/lightweight-permission-repairs.test.ts` | ﹣ D3 AC5: review follows ordinary/operator/advisory policy; readonly refuses without asking (0.0369ms) # SKIP
- `test/测试/lightweight-permission-repairs.test.ts` | ﹣ D3 AC6: real write/edit preserve regular modes and new files use safe creation (0.0436ms) # SKIP
- `test/测试/lightweight-permission-repairs.test.ts` | ﹣ D3 AC6: strict umask in isolated child cannot strip old executable mode (0.0398ms) # SKIP
- `test/测试/lightweight-permission-repairs.test.ts` | ﹣ D3 AC7: chmod/fsync failure and abort do not commit or leave a temp (0.0796ms) # SKIP
- `test/编排/git-capabilities.test.ts` | ﹣ Delivered Hub code provenance: an explicit real read-only trace keeps its original quality creator and frozen sources (0.4651ms) # SKIP
- `test/编排/git-capabilities.test.ts` | ﹣ Delivered legacy code provenance: an explicit real read-only trace keeps its original quality creator and frozen sources (0.0571ms) # SKIP
- `test/门禁引擎/pin-evidence.test.ts` | ﹣ unreadable（权限）：文件不可读 → status=unreadable、actual=null (0.0834ms) # SKIP
- `test/项目管理/shared/atomic-write.test.ts` | ﹣ D3 finalMode 应用普通权限位，未传时保持既有安全创建行为 (0.0764ms) # SKIP
- `test/项目管理/shared/atomic-write.test.ts` | ﹣ D3 严格 umask 下 finalMode 不丢执行位（独立子进程） (0.0257ms) # SKIP
- `test/项目管理/shared/atomic-write.test.ts` | ﹣ D3 chmod 失败不提交内容或权限，并清理临时文件 (0.0138ms) # SKIP
- `test/项目管理/shared/atomic-write.test.ts` | ﹣ D3 sync 失败不提交内容或权限，并清理临时文件 (0.0135ms) # SKIP
- `test/项目管理/shared/atomic-write.test.ts` | ﹣ D3 chmod 完成后中止仍保留原文件及权限 (0.0133ms) # SKIP

**cancelled（1 项，不计通过）**

- `test/测试/turn-watch-verify/b-last-resort.test.ts` | B1 检查时限到点不中止；turnLastResortMs 到点才中止，文案明确「最后兜底」 | cancelled=1 fail=0；错误行 `test timed out after 10000ms`
