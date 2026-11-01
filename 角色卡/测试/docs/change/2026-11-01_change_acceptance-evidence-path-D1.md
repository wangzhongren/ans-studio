# 跨模块回归 D1：验收判断的提案物证路径修复（acceptance-evidence-path）

- **任务 ID**：`2026-11-01-acceptance-evidence-path`（T2）
- **记录角色**：测试（Testing）
- **节点**：**D1 跨模块回归**（团队计划 §5.1/§5.3；方案 P1.2 §5.3；V1 §2.3/§4.2）
- **日期**：2026-11-01
- **状态**：**D1-complete（测试节点完成，证据已记录）**；A1/A2 记录仍为 `implemented-unverified`；本节点**不是验收结论**，AC-8 属 D2 未判；未 commit/push/merge/release；未启动/停止应用。
- **依据（只读，D1 复核哈希）**：
  - 方案 P1.2：`docs/planning/2026-11-01_design_acceptance-evidence-path.md`（**396 行** / `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9`）§5.1/§5.3/§5.4/§6
  - V1：`docs/acceptance/acceptance-evidence-path-criteria-v1.md`（**580 行** / `8f3e4b73d967d0572c2fda2bffb3ff968ba09303a33546e6b16a0c1b48c76179`）AC-1–AC-8
  - 团队计划：`docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md`（**431 行** / `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3`）
  - B0：`角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-B0.md`（**261 行** / `147c04fddb66a2fd86345a721b8dcd45d323e8bbdc40831fa55ff0b389543fc3`）
  - A1：`角色卡/桌面窗口/docs/change/2026-11-01_change_acceptance-evidence-path-A1.md`（**121 行** / `92151e9d79c258d0b872c6edc16cb5d326cc8fe51f48853bac15e9ff83684b8d`）
  - A2：`角色卡/编排/docs/change/2026-11-01_change_acceptance-evidence-path-A2.md`（**147 行** / `7964d5fbdcac6db66b1845e3534877279c09d6ad6c983c5438d7ff5fc3a356db`）
- **基线身份**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；分支 `feat/flow-improvements-wave1`；HEAD `eb77fadafc4df40594938798645da111665027c3`（D1 全程未变）。
- **环境**：Windows 11 Pro 10.0.26300（MINGW64 / Git Bash 5.3.15）、Node **v24.22.1**、npm **11.19.1**、Git 2.55.0.windows.5、win32 x64。D1 执行窗口 2026-11-01T10:05:32+08:00 – 10:07:53+08:00。
- **证据目录（仓库外）**：`C:\Users\51054\AppData\Local\Temp\ans-acceptance-evidence-path-evidence\D1\`（下称 `$D1`；清单见 §七）。

---

## 一、候选哈希与写集核对（D1 复算）

### 1.1 候选文件（与派发哈希一致）

哈希口径：`git hash-object`（工作区 blob）+ `sha256sum`（原始字节）+ `wc`。原始输出：`$D1/02-target-hashes.log`（21 行 / `0105a35616d71ec3625dd7c3acf246035da29d87cc62e8fc26b14d6a7468ba3d`）。

| 文件 | 规模 | `git hash-object` | SHA-256 | 与派发 |
| --- | --- | --- | --- | --- |
| `app/desktop/session.ts`（A1 改） | 489,820 B / 7,794 行 | `ca3d96b3b1feb5d004e914a31bbed2f6216a682c` | `d60ba7c86228063ac851df416bda8db2072ac11d5a79be7affe0cc149faa2676` | 一致 |
| `src/common/编排/governance-judge-facts.ts`（A2 改） | 17,457 B / 332 行 | `49b960c377945ce8a3d442fdd8218840816ab5df` | `e3ed3ad1e5435a00d6b8029b4bd68da84255a904160d801c29e80ee33696eb67` | 一致 |
| `test/桌面应用/acceptance-proposal-path.test.ts`（A1 新增） | 17,650 B / 419 行 | `ff2db774c26b824793da5458fc03d9f8c7172a8b` | `a1be01dd9c525b0394bf0a73b817d0e7d3dea6230f853f06e4eb09eb395de355` | 一致 |
| `test/编排/governance-judge-facts.test.ts`（A2 新增） | 5,401 B / 133 行 | `6346f811bb5736b0f3b5f98fffe2441df7b812f3` | `6eb082445702223b5f9e44ea6bf51679279d46b885eecf4199b313f7b815e65b` | 一致 |
| `test/编排/acceptance-judge-minimal.test.ts`（A2 改） | 5,326 B / 145 行 | `db3987669d9a4da741fc854ed9e6e020febc4127` | `39a11243973109f4b9ff5c7d0bce3198687c5d6ea40fea3fc3e1bb0ddc993415` | 一致 |

D1 全部命令运行前后两次复算哈希相同（`$D1/05-final-verification.log`，24 行 / `7f765667f93f08da05ab5eceaadc999e18cd90139f953911c6d247810b5964ae`）。

### 1.2 改动范围

- `git status --short -- src app test` **恰为上述 5 个候选路径**（2 改 + 1 改 + 2 新增）；`git diff --cached --name-only` **为空**（未暂存）；HEAD 未变。
- `git diff --name-only` 其余已修改路径均为治理/管理记录（`docs/acceptance/memo.md`、`docs/scheduling/memo.md`、桌面窗口 B-1 边界三文件、桌面窗口 `memo.md`），与 B0 记录的既有状态一致；未跟踪文件为管理文档、A1/A2/B0 记录与两个新测试文件。
- 写集外参考文件零 diff（哈希与 B0 完全一致，`$D1/03-zero-diff-reference.log`，20 行 / `f74fc6c16c80c40bb55929c02cfe8dcf2683c857cb18ee182a91e7151f0145ac`）：
  - `src/common/shared/intent-entry-contract.ts` `40bf6b47…`/`73478f2e…`
  - `src/common/编排/governance-judge-evidence.ts` `cf1e9f88…`/`c9062a37…`
  - `src/common/编排/governance-judge.ts` `20bbfdfc…`/`053c8fa8…`
  - `test/桌面应用/acceptance-evidence.test.ts` `27abc2b8…`/`c6009dcb…`
  - `test/桌面应用/run-pin.test.ts` `7e4ddabb…`/`bdf1fb6e…`
  - `test/编排/decision-evidence-packet.test.ts` `7864a802…`/`86d79cfd…`
  - `test/编排/workflow-preconditions.test.ts` `cfde02b7…`/`74a1e3d9…`
  - `package.json` / `package-lock.json` / `vite.config.ts` / `tsconfig.json` / `electron-builder.yml` 的 SHA-256 与 B0 一致。
- `src/common/shared` 对 HEAD 的 diff 为空；`app/renderer/dist/` 仍被 `.gitignore:9` 忽略（构建产物非候选）。
- 结论：**改动仅在 A1/A2 写集**（方案 §7 / 团队计划 §4.1、§10.3 的实际归属）；B-1 边界三文件为闸门 2 确认的人事治理变更（B0 已记录），不计产品候选。

---

## 二、命令、计数与失败分类

### 2.1 方案 §5.3 受影响测试（`--test-concurrency=1`，7 文件）

```
node --test --test-concurrency=1 \
  "test/桌面应用/acceptance-proposal-path.test.ts" \
  "test/桌面应用/acceptance-evidence.test.ts" \
  "test/桌面应用/run-pin.test.ts" \
  "test/编排/acceptance-judge-minimal.test.ts" \
  "test/编排/governance-judge-facts.test.ts" \
  "test/编排/decision-evidence-packet.test.ts" \
  "test/编排/workflow-preconditions.test.ts"
```

| 退出码 | tests | pass | fail | skipped | todo | duration_ms | 失败 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **0** | **61** | **61** | **0** | **0** | **0** | 5092.932 | 无 |

日志：`$D1/10-suite-affected-concurrency1.log`（74 行 / `a7bee1e21474c607db288b0eb865733d814313b2857d0e46242a02c40e3dba34`）。

计数自洽：B0 的既有五文件受测 48（15 桌面 + 33 编排）+ A1 新增 7（T1/T1b/T2/T2b/T3/T4/T5）+ A2 新增 6（facts 用例）= **61**；`acceptance-judge-minimal` 为追加断言、不增加用例数。

### 2.2 补充目录回归

| 目录 | 命令 | 文件数 | 退出码 | tests | pass | fail | skipped | todo | duration_ms | 日志（行 / SHA-256） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 桌面应用 | `node --test "test/桌面应用/*.test.ts"` | 50（B0 49 + 1 新增） | **0** | **451** | **451** | **0** | **0** | **0** | 7702.7068 | `11-suite-desktop-dir.log`（477 / `fa69191891eb9fc6bd7d0c75ba529b2e19a5914248b3d11aba15e217ddc63418`） |
| 编排 | `node --test "test/编排/**/*.test.ts"` | 52（B0 51 + 1 新增） | **1** | **645** | **644** | **1** | **0** | **0** | 1675.0439 | `12-suite-orchestration-dir.log`（1224 / `6a229375c57f4644645016dbab702e115841bf3addbb35e4771973a25f5fd66d`） |

文件清点：`$D1/04-suite-inventory.log`（105 行 / `e3fd2a024010d8c69419687ae71f466a662028f4a0210a234ee7ff5c037bf128`）。

**编排唯一失败（既有环境失败，非本任务引入）**：

- 用例：`test/编排/shell-authorized-routine.test.ts:184`「node test外指符号链接路径不获委托；项目内测试路径获委托」（symlink 调用在 `:191`）。
- 原文：`Error: EPERM: operation not permitted, symlink 'C:\Users\51054\AppData\Local\Temp\ans-routine-outside-DZASCg\outside.test.ts' -> 'C:\Users\51054\AppData\Local\Temp\ans-routine-paths-KPeW9U\test\external.test.ts'`（`errno: -4048`、`code: 'EPERM'`、`syscall: 'symlink'`）。
- 对照：与 B0（`shell-authorized-routine.test.ts:184`，639/638/1）及 A2（645/644/1）同一用例、同因；属本机账户无符号链接创建权限，B0 已用独立探针复现。该测试属编排角色文件，D1 **只报告不修改**。

### 2.3 类型检查与补充构建

| 命令 | 退出码 | 结果 | 日志（行 / SHA-256） |
| --- | --- | --- | --- |
| `npm run typecheck`（`tsc --noEmit`） | **0** | 无输出、0 错误 | `13-typecheck.log`（9 / `03e92ac1f486bdd3ee8a037224cb7cc4cdf6f43239d1537d1cf196ac76d3082e`） |
| `npm run typecheck:renderer` | **0** | 无输出、0 错误（补充） | `14-typecheck-renderer.log`（9 / `73a00fba577ba52d68d002794756cf45b47382aa35f584df6c2ea8099a26f17c`） |
| `npm run build:renderer` | **0** | vite v8.3.4；2793 modules；built in 354ms；输出文件名/规模与 B0 一致（`index-1P177gky.js` 1,295.09 kB、`index-CWivz_4o.css` 148.47 kB、icon 55.05 kB、`index.html` 0.59 kB）；`app/renderer/dist/` 为 git 忽略产物（补充） | `15-build-renderer.log`（27 / `414e34971d0815c9a2c2f8adb5a48d0d3cfa50611ec81660e111eee986f137de7`） |

### 2.4 失败分类（对照 B0）

| 分类 | 数量 | 明细 |
| --- | --- | --- |
| 既有环境失败（Windows symlink EPERM） | **1** | `test/编排/shell-authorized-routine.test.ts:184`（同上）；B0/A2 同因同用例 |
| 其它确定性失败 | **0** | — |
| 新增确定性失败（相对 B0） | **0** | 三个套件共 61 + 451 + 645 次用例执行，除既有 EPERM 外零失败 |
| 新增 skip/todo | **0** | 三个套件 skipped=0、todo=0 |
| 无法分类 | **0** | — |

---

## 三、AC-1–AC-7 测试证据映射（D1 视角；AC-8 属 D2，不判）

说明：以下为「证据来源」核对，**不是验收判定**。测试文件均为当前候选（哈希 §1.1）；session 派生断言经 `SessionManager` 注入的 `customerInput` 通道触发（`app/desktop/session.ts:3914` `withRequestLifecycle` 对 `cardKind === "acceptance"` 调用 `enrichAcceptanceJudgeContext`；测试捕获 `metadata.judgeContext.artifacts.proposalPath`），不是直接构造 `artifacts`。§5.3 原始输出中 T1–T5 与 facts 用例逐条 pass（`10-…log` 第 7–13、29、41–46 行）。

| AC | 测试/断言来源（当前候选） | D1 观察（原始输出） |
| --- | --- | --- |
| **AC-1** | `test/桌面应用/acceptance-proposal-path.test.ts` **T1**（`267-282`）：pinned manifest 钉 `focus-proposal-v2.md`、磁盘另有 v3 + 别名 ⇒ 捕获恰为 v2，且 ≠ v3、≠ 别名；**T1b**（`284-305`）：pinned 无 proposal 的 `null`/缺失/空串三变体 ⇒ 捕获 `undefined`，夹具同时放 v2/v3 + 别名（不扫描 / 不回退 / 不保留旧值）；T5 另证 pinned 路径不可读时捕获仍保留 pinned 路径（`409`） | `10-…log:7-8` ✔ T1、T1b pass |
| **AC-2** | 同文件 **T2**（`309-323`）：无 pin、v1/v2/v3 + 别名 ⇒ 捕获 v3 且 ≠ 别名；**T2b**（`325-331`）：无 pin 仅别名 ⇒ `undefined`。`session.ts` diff 仅调用既有 `readIntentEntryFacts`（`:129` 既有导入），无新增 readdir/regex；`src/common/shared/**` 零 diff | `10-…log:9-10` ✔ T2、T2b pass |
| **AC-3** | 同文件 **T3**（`335-357`）：metadata 预置旧 `proposalPath` ⇒ 捕获 `undefined`（显式覆盖）；`buildDecisionEvidencePacket` **直接断言** `ok=false`、`reasonCode=artifact-missing`、reason 含 `规范物证缺失：` + `docs/proposals/focus-proposal-v1.md` + `（判断无法核对）`、不含 `docs/proposals/focus-v1.md`。佐证：`test/编排/acceptance-judge-minimal.test.ts:131-135` 追加 reason 断言；facts 单测精度断言 | `10-…log:11` ✔ T3 pass；补充原始抽样（§3.1）：捕获 `null`、`artifacts` 只剩 `acceptanceReportPath`，`reason` 原文 = `规范物证缺失：docs/proposals/focus-proposal-v1.md（判断无法核对）；请按上述原因修正后重新提交。` |
| **AC-4** | `test/编排/governance-judge-facts.test.ts`（6 例，`51-133`）：acceptance/proposal 缺 proposal ⇒ `missingPaths` 恰为 `["docs/proposals/focus-proposal-v1.md"]`；flowId 缺失（`""` 与纯空白）⇒ `["提案"]`（仅缺报告时 `["质检报告"]`）；`expectedQualityReport` 仍为 `docs/quality/focus-report-v1.md`；显式但不存在的 `focus-proposal-v9.md` 视为已给（`missing=false`，不扫盘）；7 种组合序列化均不含 `docs/proposals/focus-v1.md`。facts diff 仅 `expectedProposal` 1 行 + 注释 | `10-…log:41-46` ✔ 6 例全 pass |
| **AC-5** | 同 session 文件 **T4**（`361-389`）：试跑形状（pinned 真提案 v2 + 磁盘 v3 + 别名）⇒ 证据包 `ok=true`；proposal 条目 `path` 为真路径、`sha256` 与夹具文件实测一致、`bytes` 一致；`evidence` 不含别名、不含 v3 | `10-…log:12` ✔ T4 pass；补充原始抽样（§3.2）：`evidence` proposal 条目 `{path: docs/proposals/focus-proposal-v2.md, sha256: 317f27f3…, bytes: 139}` 与夹具实测一致，`aliasInEvidence=false` |
| **AC-6** | 同 session 文件 **T5**（`393-419`）：pin 后删除 pinned 提案 ⇒ 捕获仍为 pinned 路径；证据包 `ok=false`、`reasonCode=artifact-missing`、reason 含 `物证不可读：docs/proposals/focus-proposal-v2.md`、不含 v3/别名。`src/common/编排/governance-judge.ts` 零 diff（哈希与 B0 一致），证据包失败仍走既有 `:324-339` 控制流（本修复未改） | `10-…log:13` ✔ T5 pass |
| **AC-7** | typecheck 0；§5.3 受影响 7 文件 61/61 pass；补充目录桌面 451/451、编排 645/644/1（唯一失败为 B0 既有 EPERM）；既有测试零 diff（§1.2 哈希）；`acceptance-judge-minimal` diff 仅 +5 行新增断言（既有 5 条断言原样）；写集恰 5 文件；无新增 skip/todo | `13-…log` exit 0；`11-…log`、`12-…log`；`05-final-verification.log` |

补充：**AC-8 不在 D1 判定**（团队计划 §5.3 D2；本节点未移动别名、未重发验收卡、未启动/停止应用）。D1 不宣称真实试跑有效。

### 3.1 AC-3 原始抽样（补充证据，非测试替身）

`$D1/16-ac3-ac5-raw-sample.log`（43 行 / `40ee1a08b137a623d078a04ebafb489b7a981b7d1edc06e51bd67a957b5c5353`）由仓库外只读脚本 `$D1/supplement-ac-raw.mjs`（232 行 / `d405df77982f074e8ac6138200dbada94c3e0df5de9946304ddec27f4d0cb91b`）按 T3 夹具配方复现（fixture 在 `os.tmpdir`，不写仓库）：

- `capturedProposalPath: null`（旧值 `docs/proposals/focus-v1.md` 被显式覆盖）；`capturedArtifacts` 仅 `{ acceptanceReportPath: docs/quality/focus-report-v1.md }`；
- `packetOk: false`、`reasonCode: "artifact-missing"`；
- `reason` 原文：`规范物证缺失：docs/proposals/focus-proposal-v1.md（判断无法核对）；请按上述原因修正后重新提交。`（含正确约定路径，不含旧别名）。

### 3.2 AC-5 原始抽样（补充证据，非测试替身）

同一日志第二个场景（T4 夹具配方：pinned 真提案 v2 + 磁盘 v3 + 别名）：

- `capturedProposalPath: "docs/proposals/focus-proposal-v2.md"`；`packetOk: true`；
- `evidence`：`[{kind:"proposal", path:"docs/proposals/focus-proposal-v2.md", sha256:"317f27f3c38eb67555837aa6a1e7ba9b0ed4b0be0fdecb19a5be3a5916138325", bytes:139}, {kind:"acceptance-report", path:"docs/quality/focus-report-v1.md", sha256:"54a665ef…", bytes:37}]`；`aliasInEvidence: false`；
- 与夹具文件实测 `sha256=317f27f3…`、`bytes=139` 一致。

说明：抽样脚本为补充观察；**首要证据**仍是候选测试文件中的直接断言及其 pass 输出（上文映射）。脚本不修改仓库、不替代测试，E2 可按需取舍。

---

## 四、B0 对照

| 项 | B0（实施前） | D1（当前候选） | 差值/分类 |
| --- | --- | --- | --- |
| §5.3 五文件受影响套件（concurrency=1） | 48/48/0（exit 0） | **61/61/0（exit 0）** | +13 = A1 7 + A2 6，全部 pass |
| 桌面应用目录 `test/桌面应用/*.test.ts` | 49 文件 / **444/444/0**（exit 0） | 50 文件 / **451/451/0**（exit 0） | +1 文件 / +7 用例，全部 pass |
| 编排目录 `test/编排/**/*.test.ts` | 51 文件 / **639/638/1**（exit 1） | 52 文件 / **645/644/1**（exit 1） | +1 文件 / +6 用例（pass）；唯一失败与 B0 同一 EPERM |
| `npm run typecheck` | 0 | **0** | 无回归 |
| `typecheck:renderer` / `build:renderer` | 0 / 0 | **0 / 0**（补充） | 无回归；构建文件名/规模一致 |
| 新增确定性失败 | — | **0** | — |
| 新增 skip/todo | 0 / 0 | **0 / 0** | — |
| 产品代码/测试写集 | 无（基线） | 仅 5 候选路径；暂存为空 | 写集内 |

结论：D1 计数与 B0 基线自洽（444+7=451；639+6=645；48+13=61）；唯一失败经分类为既有 Windows symlink EPERM（非本任务引入，未修改该测试）。

---

## 五、状态、未解决项与限制

1. **测试完成状态**：D1 节点按团队计划 §5.3 出口完成——§5.3 命令全过、补充目录结果与计数、typecheck（0）、候选哈希/失败分类/写集核对齐备。A1/A2 记录仍为 `implemented-unverified`；本记录**不是验收结论**，最终判定属 E2（内置独立验收）按 V1 执行。
2. **AC-8 未执行（属 D2）**：未移动/还原试跑别名、未重发验收卡、未重新构建/启动应用；D1 不对真实试跑作任何有效性声明。
3. **全量回归未执行**：T2 不默认要求（V1 §2.3/§6.2、团队计划 §1.2）；本记录不把补充目录证据虚报为全量回归。全仓库其它目录（适配器、运行时核心、门禁引擎等）未运行。
4. **既有失败**：`test/编排/shell-authorized-routine.test.ts:184` EPERM 为环境限制（B0 已探针复现），D1 只报告不修改，交编排角色/环境负责人处理（如需要）。
5. **补充抽样脚本**：`$D1/supplement-ac-raw.mjs` 为仓库外只读证据脚本，按 T3/T4 夹具配方复现并打印原始值；其结果与测试断言一致，但**不能替代**候选测试的断言输出，也不构成新的测试文件或产品改动。
6. **候选变化即失效**：若 HEAD、五个候选文件、Node/npm、依赖或夹具变化，本记录全部证据失效并需按团队计划 §5.4/§6 重取；不得跨候选复用。
7. **未做**：commit/push/merge/release；启动/停止应用；修改试跑项目；修改 `api-spec.md`/角色卡/边界。

---

## 六、写入边界与无越权改动声明

- **写入**：仅本文件（`角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-D1.md`）；原始日志与补充抽样脚本位于仓库外 `$D1`。本节点**未新增/修改 `test/测试/` 用例**（团队计划 §4.3 测试角色默认不加）。
- **未写**：产品源码（`app/**`、`src/**`）、其他角色测试（`test/桌面应用/**`、`test/编排/**`）、构建/锁/发布配置、`src/common/shared/**`、角色卡/边界/YAML、`docs/scheduling|acceptance|communication|planning/`、试跑项目文件。
- **纪律**：未 commit / 未 push / 未合并 / 未发布；未暂存任何文件（`git diff --cached` 为空）；未使用 stash；未启动/停止应用；未移动/还原试跑别名；未新增 skip/todo；未删除/放宽断言；未伪造命令、输出或哈希。
- **写集外改动 = 无**：`git status --short -- src app test` 恰为方案 §7 / 团队计划 §4.1 的 5 个候选路径（见 §1.2）。

---

## 七、证据文件清单（仓库外临时目录 `$D1`）

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `00-environment.txt` | 8 | `3b8db392d837b926c7703855d74d570e9b2415e7f33e570428f5306049956abd` |
| `01-git-baseline.log` | 44 | `59f3261361c0eada6090ec80c22c1e8f2b4218ac27cc2da85e47c62b91369a69` |
| `02-target-hashes.log` | 21 | `0105a35616d71ec3625dd7c3acf246035da29d87cc62e8fc26b14d6a7468ba3d` |
| `03-zero-diff-reference.log` | 20 | `f74fc6c16c80c40bb55929c02cfe8dcf2683c857cb18ee182a91e7151f0145ac` |
| `04-suite-inventory.log` | 105 | `e3fd2a024010d8c69419687ae71f466a662028f4a0210a234ee7ff5c037bf128` |
| `05-final-verification.log` | 24 | `7f765667f93f08da05ab5eceaadc999e18cd90139f953911c6d247810b5964ae` |
| `10-suite-affected-concurrency1.log` | 74 | `a7bee1e21474c607db288b0eb865733d814313b2857d0e46242a02c40e3dba34` |
| `11-suite-desktop-dir.log` | 477 | `fa69191891eb9fc6bd7d0c75ba529b2e19a5914248b3d11aba15e217ddc63418` |
| `12-suite-orchestration-dir.log` | 1224 | `6a229375c57f4644645016dbab702e115841bf3addbb35e4771973a25f5fd66d` |
| `13-typecheck.log` | 9 | `03e92ac1f486bdd3ee8a037224cb7cc4cdf6f43239d1537d1cf196ac76d3082e` |
| `14-typecheck-renderer.log` | 9 | `73a00fba577ba52d68d002794756cf45b47382aa35f584df6c2ea8099a26f17c` |
| `15-build-renderer.log` | 27 | `414e34971d0815c9a2c2f8adb5a48d0d3cfa50611ec81660e111eee986f137de7` |
| `16-ac3-ac5-raw-sample.log` | 43 | `40ee1a08b137a623d078a04ebafb489b7a981b7d1edc06e51bd67a957b5c5353` |
| `supplement-ac-raw.mjs`（补充抽样脚本，仓库外） | 232 | `d405df77982f074e8ac6138200dbada94c3e0df5de9946304ddec27f4d0cb91b` |

路径、行数、SHA-256 均可在 `$D1` 复核；若本记录写盘后证据目录被追加/改写，以证据文件自身哈希为准并需重新记录。
