---
id: global-task-state-b0-baseline
type: change
title: global task state B0 基线记录
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-11-02"
    kind: created
    summary: 记录 B0 基线环境、工作树状态、typecheck、三组受影响套件与 phase4b Electron smoke 结果
---

# B0 基线记录：global task state（全局任务状态 / 版本决策）

- **任务 ID**：`2026-11-02-global-task-state`（团队计划/方案/复核同 slug `global-task-state`）
- **记录角色**：测试（worker，独立角色上下文）
- **日期 / 节点**：2026-11-02 / 团队计划 §五 **B0（基线）**
- **状态**：**B0 完成（基线命令、三组受影响套件、Electron smoke 全部通过）**。本记录只记录事实，**不实施、不验收、不判通过/返工**；不是独立验收结论。
- **入口**：按调度派发说明，闸门 2 + 客户实施授权已确认；团队计划 §5.3 规定 B0 入口仅为 G2。本记录不重新判定闸门，也不把闸门确认当实施授权本身。
- **一句话事实**：HEAD `0a123109a6b10e9b60fd1aee5f08f861455c48de` / 分支 `feat/acceptance-return-card`；`src app test` 无本任务改动；`npm run typecheck` 退出码 0；三组受影响套件合计 **44 tests / 44 pass / 0 fail / 0 skipped / 0 todo**；`phase4b-electron-smoke.mjs` 按仓库既有方式运行 **PASS 64 checks / 0 failures**、13 张截图、零 console/CSP；未 commit/push。

---

## 一、入口输入快照（只读核对）

| 项 | 实测值 | 说明 |
| --- | --- | --- |
| 团队计划 | `docs/scheduling/2026-11-02_team-plan_global-task-state.md`，**477 行 / SHA-256 `06d29aaf940b9b66062420a9926c9c1764b0aaf12757f785383ce5c0d6359d62`** | 与本记录依据一致 |
| 方案 P1.1 | `docs/planning/2026-11-02_design_global-task-state-version-authority.md`，**1283 行 / `369f666acb76ac88fe30854d84b2f08f3148a55c9ff53958185310ef5c3af910`** | 与团队计划 §7.1 引用的「P1.1 1283/`369f666a…`」一致 |
| 复核记录 | `docs/planning/2026-11-02_review_global-task-state-version-authority.md`，**148 行 / `22128e59904ab8de10ede64f7acc478069c752198fc3b87c043f5dab4434c5a8`** | 与 R5 的「当前复核 148 / `22128e59…`」一致 |
| 沟通记录（观察值） | `docs/communication/2026-11-02_intent_global-task-state.md`，**123 行 / `fa42148eeb56509a0ff9967270b98198d80c08764414b0ec43f44f87ed5cbfad`** | 管理记录可能继续追加，只留观察值，不用其哈希判定入口 |
| 实施前验收标准 V1 | `docs/acceptance/global-task-state-criteria-v1.md` | **读取时点不存在**（18:57:55）。V1 由内置独立验收并行产出；B0 入口不依赖 V1（§5.3 只要求 G2），但 **P1 入口要求 V1 + B0 + H1 + P1.2 齐全**，此观察项交统筹核对 |
| 计划基线 HEAD | 团队计划 §8.12 记 `HEAD 0a12310` | 与本次实测 HEAD 一致 |

---

## 二、代码与工作树基线

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 分支 | `git branch --show-current` | `feat/acceptance-return-card`（不是旧记录里的 `feat/flow-improvements-wave1`；以实测为准） |
| HEAD | `git rev-parse HEAD` | `0a123109a6b10e9b60fd1aee5f08f861455c48de` |
| 产品/测试改动 | `git status --porcelain -- src app test` | **空**（基线采集前、全部命令执行后各测一次，均空） |
| 暂存区 | `git diff --cached --name-only` | **空** |
| 工作树其它改动（非本角色） | `git status --short` | 采集开始时：`docs/communication/memo.md`、`docs/planning/memo.md` 修改；`角色卡/桌面窗口/boundary.md|yaml`、`角色卡/运行时核心/boundary.md|yaml` 修改（H1 人事并行）；4 个未跟踪管理记录（沟通/方案/复核/团队计划）。采集结束时另见 `角色卡/桌面窗口/changelog.md`、`角色卡/运行时核心/changelog.md` 变为修改——**属其他角色并行 H1 活动，非本角色写入** |
| 本角色新增 | `git status --short` | 仅 `角色卡/测试/docs/change/2026-11-02_global-task-state-B0-baseline-evidence/`（未跟踪证据目录）与随后写盘的记录文件，均在测试角色写区内 |
| 计划新增测试文件 | 逐路径检查 | 5 个计划新文件 **全部不存在**（基线预期）：`test/编排/project-state.test.ts`、`test/编排/version-decision.test.ts`、`test/桌面应用/project-state.test.ts`、`test/桌面应用/version-decision.test.ts`、`test/桌面UI/project-state.test.ts` |

---

## 三、环境

| 项 | 实测值 |
| --- | --- |
| Node | `v24.22.1`（原生 TypeScript strip 支持，`.test.ts` 可直接 `node --test`） |
| npm | `11.19.1` |
| OS / shell | Windows 11 Pro 10.0.26300（`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64`）；Git Bash `/bin/bash.exe` |
| 时区 | Asia/Shanghai（记录内时间均 +08:00） |
| `node_modules` | 存在；`electron` **44.7.0**，二进制 `node_modules/electron/dist/electron.exe` 存在 |
| 渲染入口（忽略产物） | `app/renderer/dist/index.html` 存在（16:35 由既有会话构建，非 B0 构建），SHA-256 `833b1034467e5629d422806962e8bede587f458a195883cf624586ef34dbc006`；`assets/index-HVgRWhIZ.js` 1,300,357 B、`assets/index-76pNUf-s.css` 150,740 B；`git check-ignore` 确认属 `.gitignore:9` |
| 本 worktree 应用运行状态 | 无本 worktree 的 `electron.exe` 进程（B0 前检查为空） |

---

## 四、门禁命令结果

命令均在 worktree 根目录执行；日志含 command/cwd/start/end/exit_code 与原始输出。

| # | 命令 | 起止（+08:00） | 退出码 | 结果 | 原始日志 |
| --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck`（`tsc --noEmit`） | 18:58:07–18:58:08 | **0** | 0 类型错误，无错误输出 | `01-npm-run-typecheck.log` |

---

## 五、受影响套件基线

全部使用 `node --test --test-concurrency=1`，文件清单与派发说明逐字一致，未增删用例文件。新测试文件按计划尚未创建，只跑已存在套件。

| # | 套件（文件组） | 起止（+08:00） | 退出码 | tests | pass | fail | cancelled | skipped | todo | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 编排：`test/编排/task-state.test.ts`、`run-manifest.test.ts`、`decision-card.test.ts` | 18:58:10–18:58:13 | **0** | 20 | **20** | 0 | 0 | **0** | **0** | `02-suite-orchestration.log` |
| B | 桌面应用：`test/桌面应用/chief-workflow.test.ts`、`run-change.test.ts`、`run-change-entry.test.ts` | 18:58:16–18:58:17 | **0** | 10 | **10** | 0 | 0 | **0** | **0** | `03-suite-desktop-app.log` |
| C | 项目管理：`test/项目管理/shared/i18n.test.ts`、`i18n-guard.test.ts` | 18:58:19–18:58:21 | **0** | 14 | **14** | 0 | 0 | **0** | **0** | `04-suite-i18n.log` |
| **合计** | — | 18:58:10–18:58:21 | **0** | **44** | **44** | **0** | **0** | **0** | **0** | — |

关键基线观察（供 A/D1 对照，不判验收）：

- **i18n 计数**：`ui 921 / main 559 / shared 62 / preferences 3，总计 1545`（acceptance-return-card 已合入后的当前基线）。
- **i18n 守卫**：`[i18n-guard] scanned=131 allowlisted=20 violations=0`。
- **run-change 不变面**：`run-change`/`run-change-entry`/`chief-workflow` 基线全过（R3/R4 实施后需保持）。
- **task-state/run-manifest/decision-card**：编排侧既有契约（事件重放、幂等、轮转、任务卡字段、runId/runState、F5 fail-closed 等）基线全过。

---

## 六、失败清单与分类

- 本 B0 三组受影响套件：**失败 0、skip 0、todo 0**；typecheck 0；smoke 0 failures。
- **已知排除项（未运行）**：`test/pi-adapter/write-sequencing.test.ts` —— 既有挂起（历史记录：39+ 分钟无进展、CPU 约 2339s；客户已决定排除），本 B0 未运行、行为未验证，不得视为通过。
- **既有环境失败（未触发）**：Windows symlink `EPERM` 为既有环境红（历史全量基线 9 项，分布于 claude/codex/pi/runtime-core/编排），本三组套件未触发、本次未运行其他套件，故不对其重新分类。
- **无未知失败**；未为保绿改动任何断言；未新增 skip/todo。

---

## 七、Electron / E2E 可运行性（已实际运行）

1. **派发字面命令的可用性**：`node test/桌面UI/phase4b-electron-smoke.mjs` **不能运行**——harness 以 ESM 命名导入 `electron` 的 `app/BrowserWindow/ipcMain`，plain Node 下该 CJS 包不支持命名导出，立即 `SyntaxError`、exit 1（原始输出见 `05a-plain-node-attempt.log`）。该形式不是仓库既有运行方式。
2. **按仓库既有说明运行**（文件头注释：`./node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs [entry.html] [outDir]`）：
   - 命令：`./node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs app/renderer/dist/index.html <ASCII 临时 outDir>`
   - 起止：18:58:38–18:58:52；**退出码 0**；末行 `PHASE4B_SMOKE PASS 64 checks / 0 failures`
   - `report.json`：checks **64 / 64 true、failures 0**；console errors 0；CSP violations 0；**截图 13 张**；entry 为当前 worktree 的 `app/renderer/dist/index.html`（哈希见 §三）
   - 截图与 `report.json` 已复制入 `phase4b-out/`，逐文件 SHA-256 见 `phase4b-out/SHA256SUMS` 与 §八
3. **口径说明**：本 B0 使用既有忽略产物 `app/renderer/dist/` 作为入口，**未重建**；它只证明 harness 与真实 Electron 环境可运行。D1 必须按当前候选重新 `build:renderer` 后重跑并重新记录候选/入口哈希，不得复用本 B0 截图作为候选证据。
4. 未录屏；截图数量即 harness 既有 13 张，未额外扩展。

---

## 八、证据清单

原始日志目录：`角色卡/测试/docs/change/2026-11-02_global-task-state-B0-baseline-evidence/`

| 文件 | 行数 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| `00-baseline.txt` | 78 | 4,355 | `0fad61e73ce880edd3ce00b5ead68aee65ae389f7a7e4ef30769e1cea193d0c1` |
| `01-npm-run-typecheck.log` | 9 | 233 | `ab159a5ccc80cb8e5e4033fee175a7d52ed99f533b2c0c2e0d0093fc83096b68` |
| `02-suite-orchestration.log` | 33 | 2,553 | `3a66800c6a0322334f809edb17624c2a48c31d35d7730282e9cb5b4d69bed4c2` |
| `03-suite-desktop-app.log` | 23 | 1,607 | `88b20ac278225e85ed29d5c7a55e57b1dbbec1bf9c472e5c9ad33239ae50dcce` |
| `04-suite-i18n.log` | 28 | 1,739 | `7d101eb38184297a710d4e992a4e54118dd2e0898275bcd9e7d8ef0488bf65e6` |
| `05-phase4b-electron-smoke.log` | 77 | 6,718 | `524cd71e9d9b6c257163af9904dbf07d171c257ead3c1204129464baa72c5150` |
| `05a-plain-node-attempt.log` | 21 | 1,153 | `89e950baf32cd55e49ea49690a7d45614dfabc9ded20662c66f1e28d0e0d19f6` |
| `06-post-run-verification.log` | 33 | 2,323 | `0f6b95881fb9c83205dcb9c2fd26d1f1f5c5a58990fb7306ff051697a491883c` |
| `phase4b-out/SHA256SUMS` | 14 | 1,278 | `a5c17f0addd0b3c6813c821f0de67750c6b85968b9345f9d39496e709a8446fd` |
| `phase4b-out/report.json` | 777 | 17,902 | `07a3c90047a80603a924fafb8ce72d269a349379527155e3ecd139801445e60e` |
| `phase4b-out/phase4b-1360.png` | — | 91,052 | `68fac7a8bb50309d2f64d9cfb6020d22ee71c314839f78b08095308b4273cdcf` |
| `phase4b-out/phase4b-960.png` | — | 69,430 | `ca376de37d0c4d174977712e3ea30a62ad6fe061abd407fa2c96b54e2c27e2e5` |
| `phase4b-out/phase4b-960-five-role-tree.png` | — | 69,419 | `c3c8b0d68734c9f7ad086da8e5f23c83c6a6981fafb91801a4b1359ca3462844` |
| `phase4b-out/phase4b-1360-report.png` | — | 98,195 | `019028c756921a8b68d4b1610d8ce7f6f70f4f1727847424543b6fdffdb5e994` |
| `phase4b-out/phase4b-960-report.png` | — | 74,769 | `8ece6a5d59a3fb8013010ecb894b6fcd2f937ba67884e65f6bd7d2bd48aecb5e` |
| `phase4b-out/phase4b-200pct.png` | — | 65,214 | `65e1ff3e32d09f97f2cd783eddab783d7d4957b92eb1715bec69914f4c6c77b8` |
| `phase4b-out/phase4b-200pct-five-role-tree.png` | — | 64,014 | `8f84cf57033abf37177db7a99726fd89e2c9397758d843507523e8e852b8513f` |
| `phase4b-out/phase4b-200pct-report.png` | — | 60,733 | `4d0d00b5495494cfdf08bdc8c628857785a5cacbd20b33c5fb5ac7e7bfdc4b6c` |
| `phase4b-out/phase4b-200pct-report-details.png` | — | 70,877 | `77450f8e0e281b339f41662096ee67b5f0e0fd2a00646e1000d483c67cef29b2` |
| `phase4b-out/a5-acceptance-handback.png` | — | 66,734 | `f3539e05f87e130af26e3d2bd4f9b905fb5b815fad13295d7e177538556e97f8` |
| `phase4b-out/a5-acceptance-delivery.png` | — | 66,712 | `933a5bd3b02169384c269f43f60db6076b37cf49f611d3d84a543ba781570c14` |
| `phase4b-out/a5-acceptance-dialog-200pct.png` | — | 53,503 | `fb5ebf3ecb89cf274671088b4bf3a231e98acf43ae0080d9faa52b706ecfa190` |
| `phase4b-out/a5-acceptance-report-200pct.png` | — | 79,627 | `da01eceab0aabc1e5c27ec0af04a07c8717dc733b071e2c068da430bb616716e` |

---

## 九、口径与偏差说明（交统筹知悉）

1. **证据目录命名**：派发建议 `evidence/2026-11-02-global-task-state-B0/`；按本目录既定规范（近例 `2026-11-02_acceptance-return-card-B0-baseline-evidence/`）调整为 `2026-11-02_global-task-state-B0-baseline-evidence/`，记录文件名 `2026-11-02_global-task-state-B0-baseline.md` 与既定 `YYYY-MM-DD_<slug>-B0-baseline.md` 一致。
2. **E2E 运行方式**：派发写的是 `node test/桌面UI/phase4b-electron-smoke.mjs`；该 harness 按文件头既有说明必须用 Electron 二进制运行，plain node 形式 exit 1（原始输出已留证）。本次按仓库既有方式执行，未改 harness。
3. **V1 缺失观察**：读取时点 `docs/acceptance/global-task-state-criteria-v1.md` 不存在（V1 并行产出中）；B0 入口不受影响，但 P1 入口需 V1 到位。
4. **分支名**：实测 `feat/acceptance-return-card`；HEAD 与团队计划基线 `0a12310` 一致。

---

## 十、B0 出口核对（只报事实）

- 基线命令/环境/计数/失败分类可复算：**是**（命令、cwd、时间、Node/npm、OS、退出码、计数与原始日志均在 §三–§六、§八）。
- 确认产品/测试无本任务改动：**是**（采集前后 `git status --porcelain -- src app test` 均空；本角色只写 `角色卡/测试/docs/change/`）。
- Electron/E2E 可运行性：**已实际运行并记录**（phase4b smoke 64/64、0 failures、13 截图、零 console/CSP；入口为既有忽略产物，D1 需按当前候选重建后重跑）。
- 未 commit / 未 push / 未改产品代码 / 未改其他角色或治理文档 / 未接触客户。
- 本记录不是验收结论；AC/R1–R5 的判定属独立验收（E2）。
