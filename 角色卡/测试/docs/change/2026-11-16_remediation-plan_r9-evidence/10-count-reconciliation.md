# R9 计数与协调者口径对账

## 1. 三平台汇总（工件权威）

| 平台 | job 结果 | job 起止（UTC） | job 耗时 | `ℹ tests` | pass | fail | cancelled | skipped | `duration_ms` | 唯一失败名 | 行级 ✖（含 section 头） |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| macOS arm64 | failure（仅测试步骤） | 14:44:01–15:15:32 | 31m31s | 5,828 | 5,806 | **3** | 0 | 19 | 1,811,212.5 | **3** | **4** |
| macOS x64 | failure（仅测试步骤） | 14:39:03–15:37:36 | 58m33s | 5,828 | 5,798 | **6** | **5** | 19 | 3,364,129.7 | **11** | **12** |
| Windows x64 | failure（仅测试步骤） | 14:39:00–15:17:40 | 38m40s | 5,828 | 5,788 | **8** | 0 | 32 | 2,235,170.0 | **8** | **9** |

- x64 的 **fail 6 + cancelled 5 = 11**：cancelled 5 即 5 个测试级超时（W34 18s、W35 30s、W-J5 180s、AC-4 300s、Q2 P2 300s）。
- 行级 ✖ = 唯一名 + 1（每平台恰 1 个 `✖ failing tests:` section 头）。
- 三平台均无 file-level 条目（R8 Windows 的 compatibility-loopback 原生崩溃未再现；plat 子进程隔离生效）。
- `ℹ skipped`：arm64 19 / x64 19 / Windows 32（与 R8 相同）。
- 测试集合大小 5,828（三平台一致）；R8 Windows 因 file-level 崩溃条目为 5,829。Typecheck 三平台 success。

## 2. 平台矩阵（13 个唯一名）

| 组合 | 数量 | 名（缩写） |
| --- | ---: | --- |
| 三平台同红 | **2** | Git team plan publication、Q2 P2 |
| x64+Windows | **5** | W29 document-change / wrong-flow / source-loss、W30 真实重启迁移后、W34 |
| x64 only | **4** | W-J5、AC-4、W30 连续写入后、W35 |
| arm64 only | **1** | Git final spawn fence |
| Windows only | **1** | 重启：未决申请 orphaned / 未决审批 expired… |
| **合计** | **13** | — |

## 3. 协调者残差清单 vs 工件（逐项）

| 协调者口径 | 工件实际 | 差异说明 |
| --- | --- | --- |
| 三平台共同：Git team plan publication（arm64 60s / x64 111s / Windows 63s，确定性） | ✔ 精确一致（60,228.8 / 111,347.3 / 62,859.6ms，同错误体） | 无 |
| 三平台共同：Q2 P2（arm64 258s 自然失败、x64 300s 触顶；“本轮跑在 #137 前 300s 上限”） | ✔ arm64 258,059.9ms 断言；x64 300,000.3ms 超时；**Windows 278,365.6ms 断言（也是自然失败）** | 协调者未列 Windows 的自然失败体；三平台均红，但只有 x64 是触顶 |
| x64 + Windows：W29×3 | ✔ x64 21.0/21.2/21.3s；Windows 16.6/16.8/14.8s | 无 |
| x64 + Windows：W30×2 | **Windows 只有 1 名**（真实重启迁移后 16.7s）；“连续写入后”Windows **通过**（10.5s）；x64 两名都红（21.3/20.2s） | 协调者“W30×2”对 Windows 多算 1 名 |
| x64 + Windows：W34（16–21s 快速失败） | x64 18,001.1ms **测试级超时**（预算 18s）；Windows 9,535.4ms 断言（`:1915`） | 16–21s 区间更贴合 W29/W30；W34 x64 是超时而非快失败 |
| x64 + Windows：W35（x64 30s） | x64 30,001.6ms 超时；**Windows 通过**（4,083.7ms） | Windows 未红；x64 是 W34 级联 |
| x64 单独：AC-4（300,002ms 触顶）、W-J5（180,002ms 触顶） | ✔ | 无（但 #137 覆盖性不同，见 §5） |
| arm64 单独：spawn fence（227ms） | ✔ 227.4ms | 无 |
| Windows 单独：重启 orphaned/expired（149ms） | ✔ 149.3ms ENOTEMPTY | 无 |
| （未列）R8 的 compatibility-loopback | 三平台**通过** | plat 生效，非残差 |
| （未列）R8 的 task-restart / independent C Window / W33 / W29 missing-confirmation | 三平台通过 | x64fu / misc / w19 生效，非残差 |

## 4. R8 → R9 名称级迁移（详见 `08-r8-r9-transition.json`）

| 平台 | R8 唯一红名 | R9 唯一红名 | 保留 | 新红 | 转绿 |
| --- | ---: | ---: | ---: | ---: | ---: |
| arm64 | 30 | 3 | 2（team plan、spawn fence） | 1（Q2 P2） | 28 |
| x64 | 40 | 11 | 10 | 1（AC-4） | 30 |
| Windows | 28 | 8 | 1（team plan） | 7（Q2 P2、W29×3、W30 restart、W34、restart-orphaned） | 27 |

- x64 保留的 10 名错误体已从 R8 的 `git-core-in-flight-unproven`（0.4–0.6s）前移到发布通知/回交形态（16–21s）——x64fu 已解决 core-in-flight 共享阻塞，本轮失败面是新的（见主文档 §3.3）。
- Windows 7 名“新红”全部是 R8 已绿、R9 在更慢 runner 上重新触发的发布回合/清理时序问题；不是 kr29b/plat/x64fu 的目标回归（这些批次只改测试夹具/文档，唯一产品改动是 `run-role.ts` 空根短路，不作用于非空根）。
- arm64 28 名转绿中包括全部 KR-29 门禁/编排（除 team plan）与 R8 arm64 的 W29/W30/W34/W35。

## 5. #137 覆盖范围（重要修正）

- #137 只改 `.github/workflows/test-ci.yml` 的 CLI `--test-timeout 300000→600000`（仅开发反馈通道）。
- Node 语义（本机 v24.22.1 实证，见 `09-budget-evidence.md`）：**显式 per-test `{ timeout }` 覆盖 CLI 默认**。
- AC-4：无显式 timeout → **#137 覆盖**；R8 x64 已以 246.3s 在 300s 内通过，预算-only。
- W-J5：显式 **180000** → **#137 不覆盖**；需改该用例选项并复跑。
- Q2 P2：显式 **300000** + 子进程硬编码 300s 绝对预算 + 阶段 90s → **#137 不覆盖**；且 arm64/Windows 已自然失败。
- 因此“600s 口径下 AC-4/W-J5 大概率自然通过”只对 AC-4 成立；W-J5 与 Q2 P2 必须分别处理。

## 6. known-red 三套核对（详见 `07-knownred-r9.json`）

| 冻结名单 | 目标数 | R9 命中 | 结论 |
| --- | ---: | ---: | --- |
| runtime-core-33 | 33 | **0** | 保持 0（kr33 修复稳定） |
| gates-5 | 5 | **0** | kr29a 生效 |
| orchestration-24 | 24 | **1** | 仅 `Git team plan publication…` 仍红（同名、新错误体 `git-journal-directory-invalid`）——kr29b 修复了旧断言，但该测试在 CI 规范路径上仍红 |

即 R9 的 known-red 为 **0 / 0 / 1**，不是 0/0/0；修掉 Git team plan 的夹具根规范形后可达 0/0/0。
