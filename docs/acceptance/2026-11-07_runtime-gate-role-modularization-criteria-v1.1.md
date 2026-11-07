# 运行时派发门与角色模块化：实施前验收标准 B1 v1.1 增补（冻结脏基线分类 / 挂起处理）

- 日期：2026-11-07；固定身份：ANS 独立验收唯一主上下文（本文件只做验收标准增补，不实施、不派发、不运行真实模型、不授权提交/推送/合并/发布）。
- 状态：**实施前冻结标准 v1.1（增补）**；本文件只取代/补充 **v1 §3.5 E3.1** 的“基线分类与挂起处理”口径，**不改验证实质**；v1 其余全部条目（E0/P1/E1/E2/E3 其他、M/R/D/E-A/L、证据与判定规则、阶段出口）保持不变，继续按 v1 执行。
- v1 冻结不动：`docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md`，273 行 / 38456 bytes / SHA-256 `a999dc1961c9ebe4727f0796d6baefd24a23e75b1a6cc1d215a9c0e2f63b4999`。
- 依据（全部只读）：
  - v1（同上）；P1.6 `241502075ff57d6534d7b2c807a2726f1a4c261381e3b0f968b6be468c64e9ce`（1242 行）；复核 `59b2c81c0bbb306dac0cf68911eb9ae0158e4551924554e05e83b165dae77762`（305 行）；团队计划 `00e1f76b6a527a1237ac1467bb4100805750606904ce6960bb56a013a4ba565c`（687 行）。
  - **B0 冻结脏基线**：`角色卡/测试/docs/change/2026-11-07_runtime-gate-role-modularization-B0-baseline.md`（910 行 / SHA-256 `135535055abfe2e4b4f3c4c34d207618272b98fe5b5cfefc7b23e70cec483101`）+ 同名证据目录 `2026-11-07_runtime-gate-role-modularization-B0-evidence/`（**67 文件**，含原始日志/探针/失败逐条清单/索引；`evidence-index.md` `65039f3d77b33af2c88c5d94a749460d96dba3085c5a2c03439dd0db7026a6d7`）。
  - 统筹登记：`docs/scheduling/2026-11-07_dispatch-log_runtime-gate-role-modularization.md`（116 行 / `e2dbf4bfef008621a59a79ff9e0fee98a9d5255e6c02b28920ca6c08cfc2cac2`）§二「B0 基线」与 §六事项 1/7。
- 编制说明：本增补按统筹 B0 完成后的“冻结脏基线”登记要求撰写；只补 E3.1 的分类、挂起与对照口径，不新增、不改写、不放宽 P1.6 §11 与 v1 的 P/N/M/R/D/E-A/RR 系列。

## 1. 为什么需要本增补

v1 §3.5 E3.1 只写“Windows 既有环境失败按 B0 基线分类”。B0 完成后确认：HEAD `e71501c` 本身即为**非绿色**（B0 §9.1/§9.3）：

- 全量 **4,452 tests / 4,221 pass / 198 fail / 1 cancelled / 32 skipped / 0 todo**（B0 §6.2；权威批量 464 文件 + `installed-mcp-servers.test.ts` 隔离补入）。
- 失败构成：Windows 环境 19（EPERM 7 + ENOTEMPTY 12）、系统性 `runtime-protection-scope-unknown` 24、断言/行为漂移 143、等待/超时/前置 10、文件级/空错误 3（合计 199 条 = 198 fail + 1 cancelled；B0 §7.2）。
- **6 个挂起文件**（§2、B0 §7.3）：`write-sequencing.test.ts`（历史）+ `customer-authorization-plane-integration.test.ts`、`directive-decision.test.ts`、`optional-acceptance.test.ts`、`session-rebuild-race.test.ts`、`stuck-redispatch.test.ts`（本次新发现；其中多份经客户卡/judge/decision 通道，属 checkpoint 在途实现）。
- 另有 1 个非确定性停摆（`installed-mcp-servers.test.ts`，隔离 8/8）与 1 个 post-test 泄漏（`chief-workflow.test.ts`，B0 仅在权威批量用 `--test-force-exit` 绕过）。
- 这些失败/挂起在 B0 开工前即存在，**不是本变更引入**；本变更不修 checkpoint 的既有失败（不属本变更写集，另立变更）。

因此 E3.1 必须以“**相对 B0 冻结失败名单逐条对照**”代替“绿色基线比较”；否则“新增确定性失败 = 0”无法成立，也无法把 checkpoint 失败误算作本变更的 pass/fail。

## 2. 冻结脏基线定义与身份

**定义**：B0 记录及其 67 个证据文件是“**冻结脏基线**”，只用于本变更 P1/E1/E2/E3 的**失败集合对照**，不得当作绿色基线、不得用于任何“全绿/零失败”声明。

| 项 | 冻结值 |
| --- | --- |
| B0 记录 | `角色卡/测试/docs/change/2026-11-07_runtime-gate-role-modularization-B0-baseline.md`（910 行 / `13553505…`） |
| B0 证据目录 | `角色卡/测试/docs/change/2026-11-07_runtime-gate-role-modularization-B0-evidence/`（**67 文件**；`evidence-index.md` `65039f3d…`） |
| 基线候选 | HEAD `e71501cae7fc563b63c63944d45d0d3114ec18a5`（tree `6840d1cb…`）+ B0 开工时工作树（含 T1 未提交三文件、21 个角色卡/边界/文档修改、102 个未跟踪文件；B0 §9.2-1） |
| 全量基线计数 | **4,452 tests / 4,221 pass / 198 fail / 1 cancelled / 32 skipped / 0 todo**（B0 §6.2/§9.1） |
| 失败权威清单 | B0 **附录 A**（全量失败逐条清单，199 条 = 198 fail + 1 cancelled）；证据 `23-failures-detail.txt`～`26-failures-detail.txt`、`37-full-failing-section.txt`、`38-full-failures-detail.txt`、`38b/38c-full-failing-pairs(-sorted).txt`、`40-full-failure-classes.txt`、`41/41b-full-first-errors.tsv` |
| skip 权威清单 | B0 **附录 B**（32 项）与 §7.5（受影响套件 26 项）；证据 `39-full-skips.txt`、`39b-full-skip-names.txt` |
| 6 个挂起文件 | `test/pi-adapter/write-sequencing.test.ts`（历史）；`test/测试/customer-authorization-plane-integration.test.ts`、`test/桌面应用/directive-decision.test.ts`、`test/桌面应用/optional-acceptance.test.ts`、`test/桌面应用/session-rebuild-race.test.ts`、`test/桌面应用/stuck-redispatch.test.ts`（B0 §7.3 行 1/2/3/6/7/8） |
| 2 个特别项（不得混入 6 挂起） | `test/pi-adapter/installed-mcp-servers.test.ts`（全量串行非确定性停摆；隔离 8/8 pass/3.97s）；`test/桌面应用/chief-workflow.test.ts`（post-test 句柄泄漏；权威批量仅以 `--test-force-exit` 绕过） |
| 有效期 | 仅对应上述 HEAD + B0 工作树；T1 差异、checkpoint 修复、分支更新、依赖锁/夹具/构建配置变化 → B0 失效，须重记（B0 §9.2-7） |

## 3. E3.1 增补判定条目（E3.1-A～E3.1-H）

> 这些条目**替换 v1 §3.5 E3.1 的“Windows 既有失败按 B0 分类”单一表述**；v1 E3.1 的其余要求（T3 全量、自然 EXIT/CLOSE、新增确定性失败 0、新 skip 0、`write-sequencing` 排除须记理由、`typecheck:renderer` N/A 依据等）继续有效。当前全部 `未取证`。

### E3.1-A 冻结脏基线身份与权威清单（pass 前提）

| 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- |
| B0 记录 `13553505…`（910 行）与 67 个证据文件齐备、hash 一致；基线候选（HEAD/工作树）、全量计数（4,452/4,221/198/1/32/0）、失败构成（19 环境 + 24 rpsu + 143 漂移 + 10 等待/超时 + 3 文件级/空错误）与 B0 §6/§7/§9 一致；失败/ skip 权威清单指向 B0 附录 A/B 与对应证据文件。 | B0 记录 + 证据目录索引/逐文件 hash；统计口径与分类表；与 B0 正文交叉核对 | 未取证 |
| B0 有效期未被破坏：实施前/ E3 前再次核对 HEAD、T1 三文件、分支、依赖锁、夹具、构建配置；若变化则必须重记 B0 并重新冻结（不得沿用旧 B0）。 | B0 复记记录（如发生）；候选/依赖/配置核对日志 | 未取证 |

### E3.1-B 逐条对照规则（不以总数判定）

| 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- |
| 失败集合按 **(文件 + 测试名 [+ 失败类别])** 与 B0 附录 A 逐条比对；**不以 fail 总数单独判断**（新增测试会改变总数）；既有失败集合变化（数量/名单/行为/类别）必须逐条说明；新增测试单独列出其 pass/fail 归属，不得混入既有失败集合。 | 机器可读 diff 报告（新增/消失/变化的失败条目）+ 原始日志；B0 附录 A 对照表；新增测试清单 | 未取证 |
| skip 集合按 **(文件 + 测试名)** 与 B0 附录 B/§7.5 逐条比对；skip/todo 不计通过；既有 skip 变化须逐条说明。 | skip diff 报告 + B0 附录 B 对照 | 未取证 |

### E3.1-C 挂起文件处理（登记 / 隔离复跑 / 不得求绿）

| 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- |
| 6 个挂起文件按 B0 §7.3 登记：默认从权威全量排除（或按登记单独运行并记录）；**不得计入通过**；不得为收口而临时改断言/加 skip/改 timeout 求绿；不得以 force-exit/timeout 冒充自然通过。 | E3 全量文件集/排除清单及理由；挂起文件单独运行记录（命令、超时、退出码、输出、是否仍挂起）；无断言/skip 改动证明 | 未取证 |
| 若挂起文件在本变更期间被修复：须作为**另立变更**的报告与证据，单独重跑并更新 B0；本变更的 E3.1 不能把“修复挂起”当作自己的 pass 项；若修复属本变更写集并改变行为，另按 v1 变更/接口评审处理并重新判受影响条目。 | 修复记录/变更分类、重跑证据、B0 更新记录 | 未取证（或按 E0/计划判定） |
| 若挂起文件在 E3 全量中被包含并挂起：不得当作“新确定性失败”（它是 B0 登记项），但必须如实记录并说明是否仍与 B0 一致；若行为变化（新挂起/新通过）须逐条披露。 | 原始日志 + 与 B0 §7.3 对照 | 未取证 |

### E3.1-D 非确定性停摆与 post-test 泄漏

| 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- |
| `installed-mcp-servers.test.ts` 按 B0 方式隔离运行并记录（8/8 pass/3.97s 或当前等价结果）；不得把全量串行中的停摆当作新失败，也不得把隔离绿冒充全量绿。 | 隔离运行原始输出；全量停摆记录（如有） | 未取证 |
| `chief-workflow.test.ts` 的 post-test 泄漏只允许以 `--test-force-exit` 绕过（B0 唯一用途）；其他文件使用 `--test-force-exit` 必须逐项列明理由；**任何 force-exit 都不得用于把挂起/失败转成 pass**；`skip`/`todo` 不计通过。 | 命令/参数记录 + 逐文件理由；自然退出记录与 force-exit 记录分开 | 未取证 |

### E3.1-E 新增确定性失败 / 新 skip = 0（判定与证据）

| 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- |
| **新增确定性失败 = 0**：E3 全量（按 B0 口径的文件集/串行/隔离）中不出现 B0 §7.1/§7.2 名单之外、且非 §7.3 挂起文件的失败；错误类型不得笼统归为“环境”；出现任一即 `fail`。 | 全量原始日志/逐文件记录/退出码/计数；与 B0 附录 A 的逐条 diff；失败分类证据 | 未取证 |
| **新 skip = 0**：不出现 B0 §7.5/附录 B 名单之外的 skip；不得新增 skip 或把失败改成 skip；skip/todo 不计通过；出现任一即 `fail`（客户/验收另行批准的范围变化除外，且须记录）。 | skip diff 报告 + 原始日志 | 未取证 |
| 本变更新增的测试单独列出并通过其自身断言；新增测试的失败计入“本变更失败”，不得以 B0 既有失败名单豁免；新增测试的 skip 计入新 skip。 | 新增测试清单 + 原始输出 | 未取证 |
| 任何既有失败/挂起的行为变化（数量/名单/类别/通过与否）逐条说明；变差 = 新增确定性失败（`fail`）；变好只记录，不替代本变更自身检查。 | 逐条变化清单 + 原始证据 | 未取证 |

### E3.1-F checkpoint 既有失败的排除口径与披露

| 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- |
| B0 §7.2 的非环境失败（系统性 `runtime-protection-scope-unknown` 24 + 断言/行为漂移等）与 §7.3 挂起属 **checkpoint 既有事实**（HEAD `e71501c` 开工前已存在），**不属本变更、不计入本变更 pass/fail**；不得把它们当作本变更的通过项，也不得因它们判本变更 fail（除非本变更使其变差，见 E3.1-E）。 | B0 §7.2/§7.3/§7.4/§9.1 对照；本变更写集/声明；最终变更包披露 | 未取证 |
| 最终变更包/B2 必须显式披露：基线为“冻结脏基线”、198 fail + 1 cancelled + 32 skip + 6 挂起仍按登记处理、本变更不修 checkpoint 失败、如需要绿色基线另立变更；不得把 B0 的 198 fail 写成“本变更失败”，也不得写成“已清零/已通过”。 | 变更包披露节 + B2 报告 §披露核对 | 未取证 |
| 排除口径仅适用于本变更 E3.1；不改变 I6 B1、旧 A/J、T1 或其它标准的判定；checkpoint 失败在其它标准下仍需各自处理。 | 本 B1 范围声明 + 其它标准引用 | 未取证 |

### E3.1-G 证据要求（E3.1 专项）

1. **基线证据**：B0 记录 `13553505…` + 67 文件 + `evidence-index.md` `65039f3d…`；失败/ skip 权威清单（附录 A/B 与 §7.5）；失败构成分类与计数。
2. **运行证据**：E3 全量精确命令/argv、cwd、Node/npm、OS、执行角色、开始/结束 UTC、退出码/signal/watchdog、tests/pass/fail/cancelled/skip/todo、stdout/stderr 原字节 SHA-256 与日志路径；权威批量 + 隔离文件分别记录；`--test-force-exit` 使用理由；无重试或重试记录。
3. **对照证据**：机器可读失败 diff（文件+测试名+类别）、skip diff（文件+测试名）、新增测试清单、既有失败逐条变化说明。
4. **挂起证据**：6 文件排除/单独运行记录、隔离命令/超时/退出/输出、无断言/skip 改动证明；非确定性停摆与 post-test 泄漏记录。
5. **候选证据**：E3 候选身份（HEAD/分支/changedPaths/逐文件 sha256/聚合算法/稳定性）；B0 有效期核对（T1/依赖/夹具/配置）；变更包披露。
6. **禁止**：以局部绿、watchdog 结束、force-exit、空列表/closed/abort、总数比较、旧候选/旧阶段证据冒充 E3 结论。

### E3.1-H 阶段出口与复判

| 项 | 规则 |
| --- | --- |
| E3.1 pass | E3.1-A～E3.1-G 全部满足：B0 身份有效、逐条对照完成、新增确定性失败 0、新 skip 0、6 挂起按登记处理、checkpoint 失败如实披露且未变差、证据完整。 |
| E3.1 fail | 新增确定性失败/新 skip 出现；既有失败/挂起变差；以 force-exit/timeout/改 skip/改断言求绿；把 checkpoint 失败清零或冒充通过；候选与证据不符。 |
| E3.1 insufficient evidence | B0 记录/67 证据缺失或 hash 不符；B0 失效未重记；无机器可读 diff/原始日志；挂起/停摆处理未记录；计数/命令/环境/退出不全。 |
| E3 出口 | 仅当 E3.1-A～H 与 v1 E3.2–E3.12、M/R/D/E-A 全部满足时，E3 出口成立；否则不进入 E3-B/E3-V。 |
| 复判触发 | B0 重记、T1 变化、checkpoint 修复落地、候选/依赖/夹具/构建变化、挂起状态变化、E3 全量口径变化，均触发 E3.1 重新判定；受影响证据不得复用。 |

## 4. 与 v1 其他条目的关系

1. **v1 冻结不动**：本文件不修改 v1 正文；v1 的 E0/P1/E1/E2、E3.2–E3.12、M1–M8、R1–R7、D1–D9、E-A1–E-A10、L1–L6 及证据/判定/阶段规则继续按 v1 执行。
2. **仅 E3.1 补充**：若 v1 E3.1 与本文件冲突，以本文件为准（仅限基线分类/挂起处理）；其余冲突以 v1 为准。
3. **不改变验证实质**：本文件不放宽 T3 全量、自然 EXIT/CLOSE、新增失败/新 skip=0、不得 force-exit 冒充、不得改断言/skip、B0 失效重记等要求；只把“对照对象”明确为冻结脏基线。
4. **不替代 I6/旧 A/J/T1**：本文件与 v1 的范围关系不变；checkpoint 失败排除仅用于本变更 E3.1。

## 5. 判定规则（与 v1 相同，适用于 E3.1-A～H）

- 只用 `pass / fail / insufficient evidence / not applicable`；N/A 必须引用范围依据（本文件不新增 N/A 项；v1 的 N/A 规则继续）。
- **pass** 需当前阶段候选上全部观察有完整、可复算的原始证据，且 B0 身份有效、逐条对照完成、证据不跨阶段混用。
- **fail** 见 E3.1-H。
- **insufficient evidence** 见 E3.1-H；不得以“B0 本来就有失败”作为 pass 理由，也不得因此把本变更的检查省略。
- 不得按工具退出 0/团队自述/模型自评判 pass；不得拼接不同候选/环境/阶段的绿色结果。

## 6. 披露与限制

1. **冻结脏基线不是绿色基线**：B0 的 198 fail + 1 cancelled + 32 skip + 6 挂起 + 2 特别项均为 HEAD `e71501c` 开工前事实；本变更不修 checkpoint 失败；如需绿色基线，另立变更。
2. **checkpoint 失败不属本变更**：`customer-authorization-plane-integration` 等 5 个新挂起与 198 fail 中 checkpoint 相关项，均不由本变更引入、不计入本变更 pass/fail（除非本变更使其变差）；须在最终变更包/B2 逐项披露。
3. **挂起文件未运行即不计通过**：6 文件默认排除或按登记单独运行；`write-sequencing.test.ts` 按既有验收文档排除并记录；隔离复跑不等于全量通过。
4. **force-exit 仅限登记用途**：`chief-workflow.test.ts` post-test 泄漏的 `--test-force-exit` 是 B0 已有例外；其他用途须逐项记录理由；不得以 force-exit/timeout/改 skip/改断言求绿。
5. **B0 有效期**：B0 只对应 HEAD `e71501c` + B0 工作树；T1 三文件不得修改；T1/依赖/夹具/构建/checkpoint 修复变化使 B0 失效，必须先重记 B0，再判 E3.1。
6. **范围**：本文件只补 E3.1 基线分类与挂起处理；不改变 v1 其他条目，不替代 I6 B1/旧 A/J/T1，不授权实施/提交/推送/合并/发布。

## 7. 当前状态

- **B1 v1.1 增补完成、已冻结（实施前）**；E3.1-A～E3.1-H 当前均为 `未取证`，不得判 pass。
- v1 保持冻结（`a999dc19…`）；后续 B2 同时引用 v1 与 v1.1，E3.1 部分以本文件为准。
- 本文件只写 `docs/acceptance/`，未改产品/测试/方案/角色卡/边界/沟通/调度；未运行真实模型。
