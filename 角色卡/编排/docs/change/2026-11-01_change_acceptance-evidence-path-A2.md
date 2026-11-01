---
id: acceptance-evidence-path-a2
type: change
title: 验收物证路径修复 A2——requiredArtifactPaths 缺证文案对齐 + facts 单测
created: "2026-11-01"
updated: "2026-11-01"
timezone: Asia/Shanghai
status: implemented-unverified
related: [acceptance-evidence-path]
events:
  - date: "2026-11-01"
    kind: implemented
    summary: expectedProposal 改为 docs/proposals/<flowId>-proposal-v1.md 并同步注释；新增 facts 单测 6 例；acceptance-judge-minimal 增补 reason 路径断言；受影响 39/39、test/编排 644/645（唯一红为既有 Windows symlink EPERM）、typecheck exit 0
---

# 变更记录：验收物证路径修复 A2（缺证文案对齐 + facts 测试）

- 角色：编排（orchestration）
- 任务：`2026-11-01-acceptance-evidence-path`（T2），节点 **A2**
- 日期：2026-11-01
- 状态：**implemented-unverified**（本节点实现与自测完成；跨模块验收、桌面 A1 集成、D1/D2 与独立验收不在本节点，未 commit/push、未启动/停止应用）
- 依据（只读，B0 冻结口径）：
  - 客户确认方案 P1.2：`docs/planning/2026-11-01_design_acceptance-evidence-path.md`（396 行 / SHA-256 `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9`；§3.2、§4.2、§5.1、§6 AC-3/AC-4、§7/§9）
  - 团队计划：`docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md`（431 行 / `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3`；§4.3 A2）
  - V1 实施前验收标准：`docs/acceptance/acceptance-evidence-path-criteria-v1.md`（580 行 / `8f3e4b73d967d0572c2fda2bffb3ff968ba09303a33546e6b16a0c1b48c76179`；§3.3/§3.4）
  - B0 基线记录：`角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-B0.md`（261 行 / `147c04fddb66a2fd86345a721b8dcd45d323e8bbdc40831fa55ff0b389543fc3`）
- 基线身份：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；分支 `feat/flow-improvements-wave1`；HEAD `eb77fadafc4df40594938798645da111665027c3`；写前 `git status --short -- src app test` 为空。
- 环境：Windows 11 Pro 10.0.26300（MINGW64 / Git Bash 5.3.15）、Node v24.22.1、npm 11.19.1、Git 2.55.0.windows.5。

## 一、改动文件（写集内）与写前/写后身份

哈希口径：`git hash-object`（blob）＋ `sha256sum`（文件字节）；行数为 `wc -l`。原始输出见证据 `03-before-hashes.log`、`07-after-hashes.log`。

| 文件 | 写前 blob / SHA-256（字节 / 行） | 写后 blob / SHA-256（字节 / 行） |
| --- | --- | --- |
| `src/common/编排/governance-judge-facts.ts` | `6d5d368c5f7dd3e00c5fe9840bcab3503d7e0f12` / `72fd06f52c262d7338f851438fc76f68722099ae25dd68c4b57fc669edb9e5d1`（17,023 / 328） | `49b960c377945ce8a3d442fdd8218840816ab5df` / `e3ed3ad1e5435a00d6b8029b4bd68da84255a904160d801c29e80ee33696eb67`（17,457 / 332） |
| `test/编排/acceptance-judge-minimal.test.ts` | `8bdc4db76ddcd4390922a49bc380c930be61d427` / `dc3c33bb73e788b89ea8b6db1a5370654c550fd611e8f0b3dd968cb54e8fc772`（4,913 / 140） | `db3987669d9a4da741fc854ed9e6e020febc4127` / `39a11243973109f4b9ff5c7d0bce3198687c5d6ea40fea3fc3e1bb0ddc993415`（5,326 / 145） |
| `test/编排/governance-judge-facts.test.ts`（**新增**） | —（absent） | `6346f811bb5736b0f3b5f98fffe2441df7b812f3` / `6eb082445702223b5f9e44ea6bf51679279d46b885eecf4199b313f7b815e65b`（5,401 / 133） |

`git diff --stat -- src app test`：2 files changed, 10 insertions(+), 1 deletion(-)；新文件 133 行（未跟踪）。完整 diff 见证据 `09-diff.log`。

## 二、实现内容

### 2.1 `requiredArtifactPaths`（`src/common/编排/governance-judge-facts.ts`）

- 约定缺失文案修正（原第 181 行）：

  ```ts
  const expectedProposal = flowId !== undefined ? `docs/proposals/${flowId}-proposal-v1.md` : "提案";
  ```

- 同步更新函数上方注释（方案 §3.2）：明确本函数**不扫盘、不做版本选择**；实际版本路径由 app（验收 judgeContext）传入；`expectedProposal`/`expectedQualityReport` 只是 flowId 存在时的**约定缺失文案**，与 `mechanical-rejection`/`workflow-preconditions`/`governance-judge-prompt` 同一命名（部分位置用 `-proposal-v1.md` 示例、部分用 `-proposal-vN.md` 正则），不表示该版本存在。
- **未改**：`expectedQualityReport`（仍为 `docs/quality/<flowId>-report-v1.md`）；契约形状（`GovernanceJudgeContext/Request.artifacts`）、逐卡种判断规则、缺失即 `missing:true` 的 fail-closed 语义；无扫盘/readdir/新增版本解析。
- 调用方（只读核对）：`governance-judge.ts:456`、`governance-judge-verdict.ts:614`、`governance-judge-evidence.ts:1072`；未改其逻辑。

### 2.2 新增 `test/编排/governance-judge-facts.test.ts`（6 例）

覆盖方案 §5.1 / V1 §3.4：

1. acceptance 缺 proposal（报告已给）⇒ `missingPaths` 恰为 `["docs/proposals/focus-proposal-v1.md"]`，`paths` 恰为已给报告；
2. proposal 卡缺 proposal ⇒ `missingPaths` 恰为同一路径，`paths` 为空；
3. flowId 缺失（`""` 与纯空白）⇒ `missingPaths` 为「提案」（仅缺报告时为「质检报告」），不编造路径；
4. `expectedQualityReport` 回归：仍为 `docs/quality/focus-report-v1.md`；
5. 不扫盘/不做版本选择：显式给出但磁盘不存在的 `docs/proposals/focus-proposal-v9.md` 仍视为已给（`missing=false`）；
6. 对 7 种 cardKind/flowId/artifacts 组合的结果序列化断言：均不含旧错误约定 `docs/proposals/focus-v1.md`。

### 2.3 更新 `test/编排/acceptance-judge-minimal.test.ts`

在既有「物证缺失/未读 ⇒ manual」用例上新增（既有 5 条断言原样保留，未删除/未放宽）：

```ts
const missingReason = missingArtifact.reason ?? "";
assert.match(missingReason, /docs\/proposals\/focus-proposal-v1\.md/);
assert.ok(!missingReason.includes("focus-v1.md"), missingReason);
```

reason 原文抽样（`10-reason-sample.log`）：`拒绝：缺少 规范物证缺失：docs/proposals/focus-proposal-v1.md（判断无法核对）；请补齐物证后重新提交。。下一步：补齐规范物证/证据后重新提交验收。 谁来做：verifier。 修正后可原样重试。 [技术 code：artifact-missing]`。

## 三、检查与结果

### 3.1 受影响测试（必需）

```
node --test --test-concurrency=1 test/编排/governance-judge-facts.test.ts test/编排/acceptance-judge-minimal.test.ts test/编排/decision-evidence-packet.test.ts test/编排/workflow-preconditions.test.ts
```

- 退出码 **0**；tests **39** / pass **39** / fail **0** / skipped **0** / todo **0**；duration 563.7717 ms。
- 计数自洽：B0 基线 33/33 + 新增 facts 6 例 = 39/39（`04-affected-tests.log`，52 行 / `883477659ff0b290df34e86f661a17abc91731f70c5ad3429206511c10150baa`）。

### 3.2 类型检查

`npm run typecheck`（`tsc --noEmit`）：退出码 **0**，无输出（`05-typecheck.log`，8 行 / `3c48bc977f04b51193b87b400d7aa6801865b1c8103fbc40bf916ef53d91123b`）。

### 3.3 补充：`test/编排/**` 全目录

`node --test "test/编排/**/*.test.ts"`：退出码 **1**；tests **645** / pass **644** / fail **1** / skipped **0** / todo **0**；duration 1561.1469 ms（`06-suite-orchestration-dir.log`，1223 行 / `b2c36deb93fd181325af8afd7538c6844a36518eb14b991ea5b1286dc196d5dd`）。

### 3.4 失败分类

| 分类 | 数量 | 明细 |
| --- | --- | --- |
| 既有环境失败（Windows symlink EPERM） | **1** | `test/编排/shell-authorized-routine.test.ts:184`「node test外指符号链接路径不获委托；项目内测试路径获委托」：`Error: EPERM: operation not permitted, symlink '…\Temp\ans-routine-outside-F7a9JY\outside.test.ts' -> '…\Temp\ans-routine-paths-b9ZlOz\test\external.test.ts'`（errno -4048、syscall symlink）。与 B0 基线同一失败同因（B0 为 639/638/1），非本节点引入。 |
| 新增确定性失败 | **0** | — |
| 新增 skip/todo | **0** | 所有套件 skipped=0、todo=0 |
| 无法分类 | **0** | — |

计数对照：B0 `test/编排/**` 639 tests（638 pass / 1 fail）→ 本节点 645 tests（644 pass / 1 fail），+6 全部为新增 facts 用例且全部通过。

## 四、AC 覆盖（本节点视角）

| AC | 本节点证据 | 说明 |
| --- | --- | --- |
| AC-4 | 新增 facts 单测 6/6 通过；`expectedProposal` diff 仅约定路径与注释；`expectedQualityReport` 回归断言通过 | **本节点完整覆盖**（V1 §3.4） |
| AC-3 | `acceptance-judge-minimal` 增补 reason 含 `docs/proposals/focus-proposal-v1.md`、不含 `focus-v1.md`；reason 原文抽样 | 本节点覆盖 facts/minimal-verdict 部分；`buildDecisionEvidencePacket` 直接断言（`ok=false`/`reasonCode=artifact-missing`）属桌面 A1 的 T3（V1 §3.3/方案 §5.1），不在本节点 |
| AC-7（节点部分） | typecheck 0；受影响 39/39；既有断言未删除/未放宽（diff 仅 +5 行，均新增）；改动仅写集三文件 | 跨模块/全量部分由 D1 汇总 |

## 五、证据文件（仓库外临时目录）

目录：`C:\Users\51054\AppData\Local\Temp\ans-acceptance-evidence-path-evidence\A2\`

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `00-environment.txt` | 6 | `cce877b9c4ed39de660dfd1db310cd27e904f4cc27fedfb5dac9af7db157465b` |
| `01-git-baseline.log` | 5 | `cdc0043c82117a5ff02c3af66d7649d42a868a4d8e6690b64c1ed1fba4312cb6` |
| `02-scope-pre.log` | 16 | `daa3992f802cc55c2d2c4b7fa66f69d8e6bf9506f0f72d544844cd3f3285efc9` |
| `03-before-hashes.log` | 26 | `a7740b6144dbe367331e97b310842d5ca397c9834945fd29d9a548cc25e3b62f` |
| `04-affected-tests.log` | 52 | `883477659ff0b290df34e86f661a17abc91731f70c5ad3429206511c10150baa` |
| `05-typecheck.log` | 8 | `3c48bc977f04b51193b87b400d7aa6801865b1c8103fbc40bf916ef53d91123b` |
| `06-suite-orchestration-dir.log` | 1223 | `b2c36deb93fd181325af8afd7538c6844a36518eb14b991ea5b1286dc196d5dd` |
| `07-after-hashes.log` | 16 | `28dc1a10f055643ebebf4de71b54770c8d8e4739de1aafcb4d81a7ae6bfab467` |
| `08-scope-post.log` | 22 | `ce90c0fea790a57c03c1873e1c3312ed9af96d4f971824220e8cbf75713dada7` |
| `09-diff.log` | 192 | `4bc107c5cc795048bfd1431063f4b25932ba5ef4f43f59cd6136e09cc79cabb6` |
| `10-reason-sample.log` | 8 | `bf52a44d5889f92f956f1836bba1b50178571c8bcfbde1912107f2a073eefd06` |

## 六、未解决项与限制

1. 本节点只覆盖编排侧文案与单测；验收卡真实链路的根因修复在 `app/desktop/session.ts`（A1，桌面窗口），本节点未改也无法验证其接线。
2. AC-3 的 `buildDecisionEvidencePacket` 直接断言、AC-1/AC-2/AC-5/AC-6 的 session 集成断言、AC-8 的真实试跑回归（D2 方法 A）均不在本节点；由 A1/D1/D2 覆盖。
3. 未执行全仓库全量回归（T2 不默认要求）；只跑了任务指定的四个测试文件与 `test/编排/**` 补充。
4. 工作树对 `src/common/编排/governance-judge-facts.ts` 与新增测试有 Git `LF will be replaced by CRLF` 提示（`core.autocrlf` 行为）；文件实际字节以 `07-after-hashes.log` 的 SHA-256 为准。
5. 未 commit/push/merge；未启动/停止应用；未修改试跑项目。

## 七、写入边界声明

- 本节点实际写入仅：`src/common/编排/governance-judge-facts.ts`、`test/编排/acceptance-judge-minimal.test.ts`、`test/编排/governance-judge-facts.test.ts`（新增）、本记录。
- 未写：`src/common/shared/**`、`app/**`、`src/model/**`、`src/common/门禁引擎/**`、`src/pipeline/**`、`src/provider/**`、`test/桌面应用/**`、其他角色测试、`docs/scheduling|acceptance|communication`、角色卡/边界/YAML。
- 写集外改动：**无**。`git status` 中其余已修改/未跟踪文件均为本任务开始前既有状态（两份 memo、桌面窗口 B-1 边界三文件、5 份管理文档与 B0 记录），本节点只读、未触碰。
