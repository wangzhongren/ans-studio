# 验收判断的提案物证路径修复 —— 桌面窗口 A1 变更记录

- 日期：2026-11-01｜任务：`2026-11-01-acceptance-evidence-path`（T2）｜节点：**A1 桌面窗口（根因修复 + session 集成测试）**
- 状态：**`implemented-unverified`**（实现完成、本条写集内检查通过；**未启动/停止应用**，未做 D2 真实试跑方法 A，未验收、未提交）
- 依据（只读）：
  - 闸门 0/1/2、实施授权与 V1/B-1 核验：`docs/communication/2026-11-01_intent_acceptance-evidence-path.md`（派发时 83 行 / SHA-256 `f7967434…a37c`；管理记录会继续追加，引用其确认小节）
  - 客户确认方案 P1.2：`docs/planning/2026-11-01_design_acceptance-evidence-path.md`（**396 行** / `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9`）
  - 团队计划：`docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md`（**431 行** / `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3`）
  - 实施前验收标准 V1：`docs/acceptance/acceptance-evidence-path-criteria-v1.md`（**580 行** / `8f3e4b73d967d0572c2fda2bffb3ff968ba09303a33546e6b16a0c1b48c76179`；AC-1–AC-8）
  - B0 实施前基线：`角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-B0.md`（**261 行** / `147c04fd…`）
- 基线：worktree `flow-improvements-wave1` HEAD `eb77fadafc4df40594938798645da111665027c3`；Node v24.22.1 / npm 11.19.1 / Windows 11 Pro 10.0.26300 / Git Bash（MINGW64）。
- 纪律：未 commit / 未 push / 未合并 / 未发布；未启动或停止应用；未改断言保绿；未新增 skip/todo；未伪造输出。

## 一、写集与逐文件写前/写后哈希

哈希口径：`git hash-object`（工作区 blob）+ `sha256sum`（原始字节）。写前证据 `02-target-before.log`，写后 `20-target-after.log`（证据目录见 §五）。

| 文件 | 写前 blob / sha256 / 规模 | 写后 blob / sha256 / 规模 | 说明 |
| --- | --- | --- | --- |
| `app/desktop/session.ts` | `b3bfdee7019ce9bf64ab148905f417d8f7d7a233` / `9dace0fb3c494ca9168113dd788bc5874a93918880e5cc01294f8467bd2bb2a0` / 488,981 B / 7,785 行 | `ca3d96b3b1feb5d004e914a31bbed2f6216a682c` / `d60ba7c86228063ac851df416bda8db2072ac11d5a79be7affe0cc149faa2676` / 489,820 B / 7,794 行 | 根因修复：`enrichAcceptanceJudgeContext` 的 `proposalPath` 派生 |
| `test/桌面应用/acceptance-proposal-path.test.ts`（**新增**） | —（不存在） | `ff2db774c26b824793da5458fc03d9f8c7172a8b` / `a1be01dd9c525b0394bf0a73b817d0e7d3dea6230f853f06e4eb09eb395de355` / 17,650 B / 419 行 | 7 项 session 集成测试：T1/T1b/T2/T2b/T3/T4/T5 |

`app/desktop/session.ts` diff：`git diff --stat -- app/desktop/session.ts` = **10 insertions(+), 1 deletion(-)**（仅 §二 的两处改动；原始 diff 见 `12-session-diff.log`）。

写集外改动：**无**（本节点只写上述两个文件 + 本记录 + `memo.md` 一条续接记录）。工作树中其它已修改/未跟踪文件均为 A2（`src/common/编排/governance-judge-facts.ts`、`test/编排/acceptance-judge-minimal.test.ts`、`test/编排/governance-judge-facts.test.ts`、A2 变更记录）、B-1（桌面窗口边界三文件）、B0（测试基线记录）、统筹/沟通/策划/验收管理文档；本节点只读消费、未触碰。`git diff --cached --name-only` 为空。

## 二、实现要点（方案 P1.2 §2.2/§2.3/§3.1；AC-1/AC-2/AC-3/AC-6）

### 2.1 `app/desktop/session.ts` → `enrichAcceptanceJudgeContext`

在 `pinnedRun` 计算之后新增（**不新增 import / IO 模块 / 缓存 / readdir / regex**；`readIntentEntryFacts` 为既有导入 `session.ts:129` 的共享公开入口）：

```ts
const pinnedProposalPath = pinnedRun?.documents.proposal?.path?.trim();
const proposalRel =
  pinnedRun !== undefined
    ? (pinnedProposalPath !== undefined && pinnedProposalPath !== "" ? pinnedProposalPath : undefined)
    : (await readIntentEntryFacts({ projectRoot, flowId })).proposalPath;
```

`artifacts` 构造改为（**显式覆盖**继承旧值；`undefined` 时也不保留旧值）：

```ts
artifacts: {
  ...(baseContext?.artifacts ?? {}),
  proposalPath: proposalRel,
  acceptanceReportPath: reportRel,
},
```

分支语义（与方案 §2.3 表逐行对应）：

- **pinned 且 manifest 有 proposal**（trim 后非空）：只用 manifest 路径；磁盘更新的 `-proposal-vN` 不覆盖。
- **pinned 但 manifest 无 proposal**（`null`/缺失/空串）：`proposalPath === undefined`，**不回退**最新扫描，也不选别名。
- **无 pinned run**（draft/无 run）：复用 `readIntentEntryFacts` 取 `docs/proposals/<flowId>-proposal-vN.md` 数字最大版本；`<flowId>-v1.md` 别名不匹配。
- **解析不到提案**：`undefined`（覆盖任何继承旧值），由证据包按缺失 fail-closed。
- **pinned 路径不可读**：保留 pinned 路径交给证据包 → `artifact-missing`「物证不可读：<pinned path>」，不回退。
- 未改 `intentRel`/`reportRel`/判断规则/卡片选项/`GovernanceJudgeContext/Request` 类型；`flowId` 在函数入口已保证为非空字符串，调用点安全。

### 2.2 `test/桌面应用/acceptance-proposal-path.test.ts`（新增，自包含）

- 最小夹具：`docs/product/focus-intent-v1.md`、`docs/intents/<intentId>.md`（证据包意图基准）、`docs/proposals/*`（含别名 `<flowId>-v1.md`）、`docs/quality/focus-report-v1.md`、最小项目 listing（chief/verifier/product/rapporteur 内置角色）。
- pinned manifest 用 `writeRunManifest` 写合法最小 `ans-run/v1`（`state: pinned`，`documents.proposal.path` 按场景；null/缺失/空串三种变体各用独立夹具）。
- 捕获路径：经 `SessionManager` 注入的真实 `customerInput` 闭包触发 `enrichAcceptanceJudgeContext`，断言捕获的 `judgeContext.artifacts.proposalPath`；T3/T4/T5 再把捕获结果拼成 `GovernanceJudgeRequest` 调 `buildDecisionEvidencePacket`。

| 用例 | 断言 |
| --- | --- |
| **T1** | pinned(v2) + 磁盘 v3 + 别名 ⇒ 捕获恰为 `docs/proposals/focus-proposal-v2.md`（不是 v3/别名） |
| **T1b** | pinned 无 proposal（null / 缺失 / 空串三种）⇒ 捕获 `undefined`；夹具同时放 v2/v3 与别名（观察证明未回退扫描） |
| **T2** | 无 pin，v1/v2/v3 + 别名 ⇒ 捕获 v3，且不是 `<flowId>-v1.md` |
| **T2b** | 无 pin 仅别名 ⇒ 捕获 `undefined` |
| **T3** | 无提案 + 预置继承旧 `proposalPath` ⇒ 捕获 `undefined`（旧值被覆盖）；证据包 `ok=false`、`reasonCode=artifact-missing`、reason 含 `规范物证缺失：`+`docs/proposals/focus-proposal-v1.md`+`（判断无法核对）`，不含 `docs/proposals/focus-v1.md` |
| **T4** | 试跑形状（pinned 真提案 v2 + 磁盘 v3 + 别名）⇒ 证据包 `ok=true`；proposal 条目 `path` 为真路径、`sha256`/`bytes` 与夹具文件实测一致；`evidence` 不含别名、不含 v3 |
| **T5** | pin 后删除 pinned 提案 ⇒ 捕获仍为 pinned 路径；证据包 `ok=false`、`artifact-missing`、reason 含「物证不可读：docs/proposals/focus-proposal-v2.md」，不含 v3/别名 |

未抽共享 helper；`run-pin.test.ts`、`acceptance-evidence.test.ts` 零改动。

## 三、检查与证据（原始日志）

环境：Windows 11 Pro 10.0.26300；Node v24.22.1；npm 11.19.1；HEAD `eb77fad`。证据目录：
`C:\Users\51054\AppData\Local\Temp\ans-acceptance-evidence-path-evidence\A1\`（下称 `$EV`）。

| 命令 | 退出码 | 结果 | 证据（行数 / sha256） |
| --- | --- | --- | --- |
| `node --test --test-concurrency=1 test/桌面应用/acceptance-proposal-path.test.ts test/桌面应用/acceptance-evidence.test.ts test/桌面应用/run-pin.test.ts`（首跑） | 0 | **22 / 22 pass / 0 fail / 0 skip / 0 todo**（新文件 7 + acceptance-evidence 3 + run-pin 12） | `10-suite-desktop-required.log`（32 / `df747df5…9fd6`） |
| `npm run typecheck`（首次，发现测试夹具 `facts` 类型缺项） | 1 | `test/桌面应用/acceptance-proposal-path.test.ts(340,7): error TS2741: Property 'facts' is missing …`（测试夹具问题，非同文件历史基线） | `11-typecheck.log` 已被最终复跑覆盖（见下行）；首跑原文见本记录说明 |
| **`npm run typecheck`（夹具修正后复跑）** | **0** | `tsc --noEmit` 无输出 | `11-typecheck.log`（6 / `05b469b6…b031`） |
| **`node --test --test-concurrency=1`（同一三文件，夹具修正后复跑）** | **0** | **22 / 22 pass / 0 fail / 0 skip / 0 todo** | `13-suite-desktop-required-rerun.log`（32 / `20de62b6…85d6`） |
| `node --test "test/桌面应用/*.test.ts"`（补充目录） | 0 | **451 / 451 pass / 0 fail / 0 skip / 0 todo**（B0 444 + 新增 7） | `14-suite-desktop-dir.log`（474 / `180dc72a…b4b7`） |
| 环境 / 写前 / 写后 / 改动范围 | — | 见各文件 | `00-environment.txt`（10 / `2cfae272…dd23`）、`02-target-before.log`（7 / `5c54c732…838c`）、`20-target-after.log`（24 / `ed1323e0…f045`）、`21-scope-after.log`（46 / `a3a8c671…cf6`） |
| session.ts diff（`-U6`） | — | 仅 §二 两处 | `12-session-diff.log`（43 / `ba22597a…16cd`） |
| 证据清单 | — | 11 个原始日志文件行数/sha256（不含清单自身） | `22-evidence-manifest.txt`（12 / `77b8d82b…586f`） |
| 终检（写集状态/哈希/skip 计数） | — | 仅写集内 4 路径；哈希与上方一致；skip/todo 0 | `23-final-verification.log`（19 / `2dcb8178…8de7`） |

### 3.1 失败分类（对照 B0）

- B0：`acceptance-evidence`+`run-pin` **15/15**；`test/桌面应用/*` **444/444**；typecheck **0**；新增确定性失败 0、skip 0。
- A1：同三文件 **22/22**（15 既有 + 7 新增全过）；桌面目录 **451/451**（444 既有 + 7 新增全过）；typecheck **0**。
- **新增确定性失败 = 0；新增 skip/todo = 0；既有断言未删除/未放宽**。
- 过程性失败 1 例：首次 typecheck 因**本节点新测试夹具**未给 `GovernanceJudgeContext.facts` 报 TS2741；在测试文件内补最小 facts 后复跑 0。非产品代码问题、非既有测试弱化。

## 四、与 A2 的并发依赖（如实记录）

- T3 的证据包 `reason` 文案来自编排 `requiredArtifactPaths`（`src/common/编排/governance-judge-facts.ts`），其 `expectedProposal` 在 A1 开始时仍为旧路径；A2 在本节点实施期间已落树（现 `:185` 为 `docs/proposals/${flowId}-proposal-v1.md`，`test/编排/governance-judge-facts.test.ts`、`acceptance-judge-minimal` 更新同时出现），T3 文案断言因此通过。
- A1 **未修改** A2 任何文件；A2 文件哈希/证据由 A2 自己的变更记录负责。若 A2 候选在 D1 前继续变化，本节点 T3 的文案断言证据应按 §证据复用/失效规则重取（产品候选变化即失效）。

## 五、未解决项 / 偏差披露

1. **未启动/停止应用**：按节点要求（应用当前运行的是修复前实例，D2 才重启）；本节点无真实 Electron/E2E 证据。
2. **AC-8（方法 A 真实试跑）不在 A1 范围**：归 D2；本记录不声称真实回归有效。
3. **`api-spec.md` 未更新（有理由）**：本修复不改 IPC 通道、preload 方法、导出或 `GovernanceJudgeContext/Request` 契约形状；`api-spec.md` 记录的是 IPC/导出面，故无新增条目。`memo.md` 追加一条续接记录。
4. **初跑 typecheck 夹具错误**已在 §三.1 如实记录（修正仅限本节点新测试文件）。
5. **A2 并发**见 §四；本节点未替 A2 取证、未修改其文件。
6. 未做全量仓库回归（T2 不默认要求；补充证据为 `test/桌面应用/*.test.ts` 451/451）。

## 六、无越权改动与纪律声明

- 仅写：`app/desktop/session.ts`、新增 `test/桌面应用/acceptance-proposal-path.test.ts`、本记录、`角色卡/桌面窗口/memo.md`。
- 未写 `app/main.ts`、`app/preload.cjs`、其它 `app/desktop/` 文件、`src/**`、其他角色测试、`test/桌面应用/acceptance-evidence.test.ts`/`run-pin.test.ts`、`docs/scheduling|acceptance|communication`、角色卡/边界/YAML、`package.json`/锁/构建/发布配方；未改 A2 文件。
- 未 commit / 未 push / 未合并 / 未发布 / 未启动或停止应用；未使用 stash；未暂存任何文件；写集外改动 = 无。
- 未新增 skip/todo；未删除/放宽既有断言；日志路径/行数/sha256 均可在 `$EV` 复核。
