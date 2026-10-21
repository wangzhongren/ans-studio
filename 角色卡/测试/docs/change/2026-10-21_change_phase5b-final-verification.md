---
id: change-ui-platform-phase5b-final-verification
type: change
title: Phase 5B 最终全量独立验证——新入口全量/打包 smoke/双端台账；5B 门 pass
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [design-ui-platform-phase5-test-plan, change-ui-platform-phase5a-final-verification, change-ui-platform-phase5b-test-domain-cleanup]
events:
  - date: "2026-10-21"
    kind: verified
    summary: 5B 旧端删除、入口统一 dist/index.html 后，clean rebuild 哈希与冻结一致；uiux 23 段、main、ime、design audit、单测/基线/测试域、懒挂载、bench、packaged smoke 14/14 全跑；5A/5B 397 名逐名一致（仅 20 环境/诊断值差异）；G1–G5 补正 OPEN_CARD 行后 G3 26、无未批准、MATCH-FAIL=0；记录旧 uiux 套件版本限制、探针口径与候选分离；5B 门 pass
  - date: "2026-10-21"
    kind: corrected
    summary: 独立验收 AC3/AC8 补正——OPEN_CARD_AT_ARRIVAL 207→206 补列 G3 并修正台账；统一 679/681/683/504 计数；RELATIVE_ASSET_REFS 按 5B ./assets/ 重跑为 true；记录旧 uiux 套件版本限制；补候选分离清单；未改产品/测试/配置
---

# Phase 5B 最终全量独立验证

**候选**：HEAD `224cf83`；入口 `app/renderer/dist/index.html`；HTML `3c4da2a2…`、JS `f568e2aa…`、CSS `76fad7ce…`。clean rebuild 后哈希与冻结值逐字节一致；本角色 gzip9 **289,095B ≤307,200B**，CSP 严格（单外链脚本/样式，无 inline/unsafe）。证据：[2026-10-21-phase5b-new-entry-evidence](2026-10-21-phase5b-new-entry-evidence/index.md)。

## 一、结论

**5B 门：pass。** 新入口全量套件、打包 smoke、台账与快照完整性均通过；唯一测试红为 `test/测试` 的 D3 AC4 环境缺真实 `rg` 二进制，已如实登记，不影响产品结论。旧端已删除且**不可复跑**，只引用 5A 冻结快照。独立验收（另一角色）仍按 AC1–AC8 另行判断。2026-10-21 的 AC3/AC8 补正仅改测试角色台账/文档/probe，未改产品、测试断言或构建配置，故不重跑产品门，按标准只需重判 AC3/AC8 受影响部分。测试侧补正项（F1/F5/F6/F7/F4 分离）已完成；AC8 的契约面/产品复核（F2/F3）与 `.ti-badge` 残留（F8）属桌面UI/产品角色，本角色未越权修改。

## 二、全量结果

| 套件 | 结果 |
| --- | --- |
| uiux-v2 默认 + 22 模式 | **23/23 exit 0**：DEFAULT **110/110**、MERGE **12/12**、COMPLETE_FLOW **41/41**、VISUAL **54/54**、TOOLFOLD **19/19**（C1 **Δ=20**）、其余全绿 |
| main.mjs 新入口 | exit 0，**E2E_PASS=true，E2E_FAILURES 空**；397 名 |
| ime-enter | 26 true / 0 false / `E2E_DONE=1` |
| uiux-design-audit | exit 0；31/31 v3 true（含 12 条重锚、S2 右缘、S1 超长目标、Motion 0.9s/reduced-motion） |
| test/桌面UI | **142/142** |
| test/桌面应用 | **504/504**；计数口径 **679 → 683 → 504**：679 为 5A 前基线，+4 桌面窗口 5A 检查（入口接线/dev 回退/导航兜底/导航守卫）= **683/683**（5A raw `baseline.txt`），5B 删除 178 项旧四测试 + 1 个 hot-path ④ 段 = **504/504**（683−178−1）。注：桌面UI 迁移台账写 **681**（当时只新增 2 项 `ans-wiring`/`diagnostics`），属其角色文档的时点值；最终以 raw **683** 为准，测试角色未越权修改该文档。 |
| test/测试 | **715 tests / 714 pass / 1 fail**；唯一红 D3 AC4 因本机 `spawnSync("rg")` 无真实二进制（status null；`rg` 为 shell function，`/opt/homebrew/opt/ripgrep/bin` 无文件），环境红，未改断言/未 skip |
| 懒挂载 | **10/10** |
| packaged smoke（`verify:local`） | **14/14 true**：entry/rootMounted/driver/csp/cspViolations/dom/preload/ipc/importDisabled/missingConfiguration/settingsEntryDisabled/envPathMatches/console/load；`isPackaged=true`、arm64、archive SHA256 已记录 |

**CSP/静态扫描探针口径补正（AC8）**：5B 复用的 `dist-static-scan-5b.cjs` 原按 5A `dist/src/index.html` 的 `../assets/` 检查相对资源，5B 入口上移为 `dist/index.html` 后 Vite 产物引用 `./assets/`，旧口径因此输出 `RELATIVE_ASSET_REFS=false`。这是 **probe 判断口径过期，不是 CSP 失败**（HTML 相对引用、packaged smoke 加载正常）。已改为接受 `./assets/`（并兼容 5A `../assets/`），重跑输出 `RELATIVE_ASSET_REFS=true`、`TOTAL_GZIP9=289095 ≤307200`、CSP 各项为 false/严格：证据 [candidate/csp-gzip-recheck.txt](2026-10-21-phase5b-new-entry-evidence/candidate/csp-gzip-recheck.txt)。

## 三、5B 双端对照

- 5A 新入口 main 397 名 vs 5B 新入口 397 名：**common 397 / only-old 0 / only-new 0**；值差异 20，仅 `OUTDIR`/`RENDERER_ENTRY`/17 `SHOT_*`/`PENDING_DIAG`（路径与诊断实例值）；所有行为/契约 check 名与值逐名一致。
- 5A 旧端快照 391 名，唯一 C 类 `RECOVERY_SAME_PENDING_CARD_ONCE=false`；旧端不再复跑。
- uiux 23 段：5A final3 与 5B 报告逐模式、逐 check 名和值完全一致（0 差异，全部 pass）。
- **旧端 uiux 套件版本限制（AC3 记录，不再声称「同套件源码」）**：5A 旧端 uiux 报告生成于 **18:04–18:05**，套件 `test/桌面应用/e2e/uiux-v2.mjs` = `d568bf82…`（`manifest-old-entry-before/after.sha256`）；最终新端报告生成于 **20:44**，套件 = `fa3f74d4…`（final3 `candidate/core-sha256.txt`）。旧端 main 已于 **20:44** 用最终套件重跑（`final3/raw/main-old/report.txt`，391 名），但旧端 uiux 未在删除前用最终套件重跑；旧端已删除、不可补跑。实质对照仍成立：旧端 uiux 通过名 **424** 个在新端全部存在且仍为 true（逐报告脚本核对，**0 个旧通过→新失败**，证据 [main-diff/5a-old-vs-final3-uiux.txt](2026-10-21-phase5b-new-entry-evidence/main-diff/5a-old-vs-final3-uiux.txt)）；旧端 5 个失败名逐条登记（`old-red-status.md`）；新端新增检查来自 PM 已批准的重锚/五角色/C2/C1。故记录为「旧套件版本限制 + 已证实质等价」，不把旧端快照当作同套件严格对照。
- G1–G5：G1 19（整组批准）、G2 12（逐名批准）、G3 **26**（精确新检查名/路径；含 2026-10-21 补正的 `OPEN_CARD_AT_ARRIVAL` 旧 207→新 206，索引归一化，PM §19.3，`OPEN_CARD_STABLE_AT_ANCHOR=true`）、G4 21（全部关闭/批准/重锚）、G4-RESOLVED 1、G5 2、NEW-ONLY 7、OLD-ONLY 1；**无未批准行、MATCH-FAIL=0**。final3 的 75 条值差异已全部登记（补正前漏 `OPEN_CARD_AT_ARRIVAL`；机器核对 [ledger-audit.txt](2026-10-21-phase5a-new-entry-evidence/final3/main-diff/ledger-audit.txt)：值不匹配 0、G0 值差异 0、无 proposed/not-approved）。完整：[FINAL-G1-G5-5B.md](2026-10-21-phase5b-new-entry-evidence/main-diff/FINAL-G1-G5-5B.md)。
- 5A 快照完整性：`2026-10-21-phase5a-old-baseline-evidence/snapshot-manifest.sha256` 复算 `shasum -c` exit 0；旧入口/套件稳定 manifest（`manifest-old-entry-before/after.sha256`）diff 空；raw 证据未改。本轮补正仅修改旧快照说明 `old-red-status.md` 的过期计数（679→683）并重算该清单；final3 与 5B 清单也因补正 `FINAL-G1-G5.md`/`index.md`/probe 重算，均 `shasum -c` exit 0。
- 5A 遗留 `BOOTSTRAP_S0_*` 命名说明：main 仍无六个官方名；S0 行为由 5A smoke 36/36（S0 3 项）+ 独立 S0 9/9 覆盖；按 5A 记录待 PM 接受等价或作为纯命名补项（不改变行为结论）。

## 三之二、候选分离（AC8 §2.3）

冻结候选同时包含同期无关改动。已单独列名并说明影响，**交 PM**：[candidate/candidate-separation.md](2026-10-21-phase5b-new-entry-evidence/candidate/candidate-separation.md)。

- **不进入 Phase 5 判定**：`src/common/{codex-adapter,pi-adapter,runtime-core,shared,门禁引擎}`、`src/model/runtime.ts`、`src/provider/{claude,codex,runtime}`、`src/service/{gate,runtime}`，以及 `test/{claude,codex,pi}-adapter/`、`test/门禁引擎/`、`test/项目管理/shared/`、`test/测试/` 下同期 reasoning/权限/文件写安全修复与其测试。
- **构建/共享配置影响**：§一列出的无关改动不涉及 `vite.config.ts`/`tsconfig.json`/`package.json`/`package-lock.json`（这些文件的改动属 Phase 5 UI 工具链范围）；`app/renderer/src/**` 未 import 上述运行时目录（仅 `@/` 与第三方依赖），故无关改动不进入 renderer dist，不改变入口/CSP/gzip/静态扫描结论。dist 哈希与冻结值一致。
- **候选包含但不算 Phase 5 签字**：它们在候选与本地包内，已被全量单测、旧基线、main E2E、packaged smoke 间接执行；通过不等同于测试角色对其业务正确性签字，缺陷归主角色。
- **共享代码风险边界**：`src/common/shared/atomic-write.ts`、`src/common/runtime-core/fs-write.ts` 等共享持久化代码若语义变化，可能间接影响 UI 流程；5B 只覆盖既有场景，未对新语义做专门验收。该风险交 PM/属主，不并入 Phase 5 通过结论。

## 四、bench（阈值沿用 5A 旧端基线）

| 指标 | 新 3 轮 | 新中位 | 5A 旧中位 | 阈值 | 结论 |
| --- | --- | --- | --- | --- | --- |
| stormA.maxGap | 21.8 / 20.5 / 18.3 | 20.5ms | 21.5ms | 25 | pass |
| stormB.maxGap | 18.2 / 17.7 / 21.9 | 18.2ms | 17.8ms | 25 | pass |
| stormA_handler.maxMs | 1.4 / 0.9 / 1.2 | 1.2ms | 10.7ms | 15.7 | pass |
| stormB_handler.maxBatchMs | 0.5 / 1.6 / 1.5 | 1.5ms | 1.3ms | 6.3 | pass |
| replay.replayMs | 8.4 / 10.5 / 12.0 | 10.5ms | 19.4ms | 24.4 | pass |
| scrollToBottom.ms | 15.8 / 1.7 / 3.4 | 3.4ms | 18.6ms | 23.6 | pass |

新端 `histDirect=true` 3/3；C1 **150→170，Δ=20**（目标≤20/硬门≤32）。

## 四之二、独立验收 AC3/AC8 补正对照

| 项 | 补正 | 证据/结果 |
| --- | --- | --- |
| 1. `OPEN_CARD_AT_ARRIVAL` 207→206 | final3 G3 补行（PM §19.3 索引归一化；`OPEN_CARD_STABLE_AT_ANCHOR=true`），G3 25→26；post-fix3 JSON/MD 由 G0-MATCH 207/207 改为 G3 207/206；final3 机器台账重取值 | [FINAL-G1-G5.md](2026-10-21-phase5a-new-entry-evidence/final3/main-diff/FINAL-G1-G5.md)、[ledger-audit.txt](2026-10-21-phase5a-new-entry-evidence/final3/main-diff/ledger-audit.txt)、post-fix3 `final-allowed-diff-ledger.json`/`final-regroup-ledger.md`；75 条值差异全登记、无未批准、MATCH-FAIL=0 |
| 2. 679/681/683/504 计数 | 统一为 679（5A 前）→683（+4 桌面窗口 5A 检查，raw）→504（删 178 旧四测试+1 hot-path ④ 段） | 5A 最终报告 §二、5B 报告 §二、`old-red-status.md`、旧基线报告；桌面UI 迁移台账 681 属其时点值，未越权修改 |
| 3. `RELATIVE_ASSET_REFS` | 5B 探针改为接受 `./assets/`（兼容 5A `../assets/`）并重跑 | [csp-gzip-recheck.txt](2026-10-21-phase5b-new-entry-evidence/candidate/csp-gzip-recheck.txt)：`RELATIVE_ASSET_REFS=true`、gzip 289,095B、严格 CSP；非 CSP 失败 |
| 4. 旧 uiux 套件版本限制 | 记录 `d568bf82…`（18:04–18:05）vs `fa3f74d4…`（20:44）；旧端 main 已用最终套件复跑 391 名，旧 uiux 未复跑且已删不可补；不再声称同套件源码 | 本报告 §三；[5a-old-vs-final3-uiux.txt](2026-10-21-phase5b-new-entry-evidence/main-diff/5a-old-vs-final3-uiux.txt)：旧通过名 424、0 旧通过→新失败 |
| 5. 候选分离（AC8 §2.3） | 单列 `src/common|provider|model|service`、adapter 测试等同期无关改动，说明不进入 Phase 5 判定、不改变构建/共享配置结论、不进 renderer dist | [candidate-separation.md](2026-10-21-phase5b-new-entry-evidence/candidate/candidate-separation.md)（交 PM） |
| 6. 报告/台账/证据同步 | 更新 5A/5B 报告、G1–G5、机器台账、索引与快照清单；仅写 `角色卡/测试/` | 5B/final3/post-fix3/old-baseline `shasum -c` 均 exit 0；未改产品/测试/配置 |

## 五、边界

- 候选冻结后未再改代码；旧渲染器/vendor/旧守卫测试已删除，5B 不含旧端复跑。
- 未改产品/产品测试/配置；未读 `.env`；未 commit/push。证据 `user-data` 已删除。
- 5B 通过不等于最终发布验收；独立验收角色按 AC1–AC8、Windows/DPI/屏读等另判。
