---
id: contract-schema-query-p1-csq-02-verification
type: change
title: contract schema query P1-CSQ-02 补测独立验证
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: verified
related: [contract-schema-query-d1-regression, contract-schema-query-p1-csq-02]
events:
  - date: "2026-11-03"
    kind: created
    summary: 独立复核 topic 超长注入截断补测：diff 单一追加 hunk +17/−0；定向 17/17；受影响套件 89/89；双端 typecheck exit 0
---

# P1-CSQ-02 补测独立验证：contract_check topic 超长注入截断用例

- **任务 / flowId**：`2026-11-03-contract-schema-query` / `contract-schema-query`（P1-CSQ-02 / A2-5 补测，post-merge 独立变更）
- **记录角色**：测试（worker，独立角色上下文；只承担本角色）
- **日期 / 节点**：2026-11-03 / P1-CSQ-02 补测的独立验证（E3 记录为后续单独授权项）
- **状态**：**已验证（verified）**。本记录只记录本角色独立复核的测试事实与证据，**不代替独立验收判定**，**不构成提交/推送/合并/发布授权**。

---

## 一、来源与授权（只读核对）

| 来源 | 读取内容 |
| --- | --- |
| 客户授权 | `docs/communication/2026-11-03_intent_contract-schema-query.md:242-248`「## P1-CSQ-02 补测授权（2026-11-03）」：客户原话「这个来搞一下」；范围：按 P1-CSQ-02 / A2-5，在 `test/桌面应用/rejection-copy.test.ts` 用超长注入 `fn`（`{topic:"roster"}`，如 `"x".repeat(10_000)`）补一条 topic 专用截断标记测试（输出 ≤4096 B、含 `…（已截断）`、不含 `run manifest` 标记）；不改产品代码、AC、V1 与既有断言；性质为 E3 之后的**单独授权**、**post-merge 独立变更**、不混入已合并候选；**不含**提交/推送/合并/发布。`docs/communication/memo.md` 同日条目同口径（+1 行）。 |
| PM P1 审核 | `角色卡/项目管理/docs/change/2026-11-03_contract-schema-query-P1-review-approved-recovered.md`（生效 293 行 / `d547b90d…`）：P1-CSQ-02 与 §8.3 A2-5「`rejection-copy.test.ts` 用超长注入 `fn` 验证 topic 专用截断标记 `\n…（已截断）`（不是 `run manifest` 标记）」 |
| E2 验收报告 | `docs/acceptance/contract-schema-query-report-v1.md` §六.8 / §七.4：仓库现有 `rejection-copy.test.ts:193-207` 只覆盖 legacy 超长；topic 分支已由 E2 探针验证；V1 未列为 AC/K 条件，**非阻断**过程提示，建议统筹安排补测，不改变候选与结论 |
| E3 放行 | 沟通记录：P1-CSQ-02 测试缺口为**后续单独授权补测项**（会改候选哈希，需重新取证）；E3 结论不授权提交/推送/合并/发布 |
| 实施方记录 | `角色卡/桌面窗口/docs/change/2026-11-03_contract-schema-query-P1-CSQ-02.md`（桌面窗口，`status: implemented-unverified`） |
| 本角色 D1 口径 | `角色卡/测试/docs/change/2026-11-03_contract-schema-query-D1-regression.md` §五「受影响套件」：6 文件、三组、`node --test --test-concurrency=1`、88/88 |

---

## 二、候选范围与只读核对（基线 HEAD `55a4916`）

### 2.1 基线与 diff

| 检查 | 命令 | 实测结果 |
| --- | --- | --- |
| HEAD / 分支 | `git rev-parse HEAD`；`git branch --show-current` | `55a4916b7f600e588ea73b244002a7a7740ce7dc` / `feat/contract-schema-query`（与任务基线 `55a4916` 一致） |
| 行数变更 | `git diff --numstat -- test/桌面应用/rejection-copy.test.ts` | **17	0**（+17/−0） |
| hunk 数 | `git diff -U0 -- … | grep -c '^@@'` | **1**（单一追加 hunk；默认上下文下为 `@@ -206,6 +206,23 @@`，紧接既有 legacy 截断用例 `:193-207` 之后） |
| 改前基线哈希 | `git show HEAD:"test/桌面应用/rejection-copy.test.ts" | sha256sum` | **`71388f9f734309074a8e6bd8a3c5a14853def4309a656b2878274e9c65d3cb91`**（410 行；blob `b372d88b`；与 D1 §二 #9 记录一致） |
| 改后工作区哈希 | `sha256sum`；`git hash-object`；`wc -l` | **`c272f843f60be3798f3232939c55de3a6d62229d11a328bcdb55406605cc2792`**（427 行；blob `6b8da27c`；与实施方记录一致） |
| 既有断言未改 | diff 内容逐行核对 | diff 只含新增行，**无删除行**；上下文中的既有用例与断言原样保留；无 skip/todo 新增 |

### 2.2 新增用例（与授权范围逐条对照）

新增 1 条用例「contract_check topic 输出超长由工具层截断：topic 专用标记、不含 run manifest（P1-CSQ-02）」：

- 注入 `contractCheck: () => "x".repeat(10_000)`，以 `{ args: { topic: "roster" } }` 调用 `contract_check` handler（超长注入 `fn`，符合授权）；
- 断言 `result.ok === true`；
- 断言 `Buffer.byteLength(result.message, "utf8") <= 4096`（≤4096 B）；
- 断言含 topic 专用标记 `"\n…（已截断）"`；
- 断言**不含** `"run manifest"`（不得落到 legacy 截断标记）。

### 2.3 `git status --porcelain` 范围核对

| # | 状态 | 文件 | 说明 |
| --- | --- | --- | --- |
| 1 | `M` | `test/桌面应用/rejection-copy.test.ts` | **本补测候选**（唯一产品/测试文件改动） |
| 2 | `??` | `角色卡/桌面窗口/docs/change/2026-11-03_contract-schema-query-P1-CSQ-02.md` | 实施方变更记录（预期内） |
| 3 | `M` | `docs/communication/2026-11-03_intent_contract-schema-query.md`（+7 行） | 沟通记录的**授权补记**（§P1-CSQ-02 补测授权），不属补测候选 |
| 4 | `M` | `docs/communication/memo.md`（+1 行） | 沟通记录（同日授权条目），不属补测候选 |
| 5 | `??` | `docs/communication/2026-11-03_intent_customer-authorization-plane.md` | 另一任务材料，**不相关** |
| 6 | `??` | `角色卡/测试/docs/change/2026-11-03_contract-schema-query-P1-CSQ-02-verification-evidence/` | 本验证**新建的证据目录**（本角色写集 `docs/change/` 之下） |

- `git status --porcelain -- src app test`：**仅 1 条 `M`**（上述测试文件）；`src/`、`app/` **零改动**。
- `git diff --cached --stat`：**空**（无暂存）。
- **超出项：无**（第 3–5 项属沟通/他任务记录，第 6 项为本验证自身证据目录）。

---

## 三、环境

| 项 | 实测值 |
| --- | --- |
| 工作树 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1` |
| Node / npm | **v24.22.1** / **11.19.1** |
| OS / shell | Windows 11 Pro 10.0.26300；Git Bash |
| 时区 | Asia/Shanghai（+0800） |

---

## 四、命令与原始结果

### 4.1 定向测试

| # | 命令 | 起止（+08:00） | 退出码 | tests | pass | fail | cancelled | skipped | todo | duration_ms | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `node --test test/桌面应用/rejection-copy.test.ts` | 13:02:23–13:02:23 | **0** | **17** | **17** | **0** | 0 | 0 | 0 | 216.808 | `01-node-test-rejection-copy.log` |

- 日志同时出现既有 legacy 用例与新用例的通过行：
  - `✔ contract_check 输出超长由工具层截断到 4KB 内`
  - `✔ contract_check topic 输出超长由工具层截断：topic 专用标记、不含 run manifest（P1-CSQ-02）`

### 4.2 受影响套件（D1 口径的 6 文件，三组）

全部 `node --test --test-concurrency=1`，文件清单与 D1 §五逐字一致；三组以独立进程并发执行、各自留日志（与 D1 并发口径一致）。

| # | 层 | 文件组 | 起止（+08:00） | 退出码 | tests | pass | fail | cancelled | skipped | todo | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 编排（A1） | `test/编排/workflow-preconditions.test.ts`、`trio-worker-report.test.ts` | 13:02:28–13:02:28 | **0** | 34 | **34** | 0 | 0 | 0 | 0 | `02-suite-orchestration.log` |
| B | 桌面应用（A2） | `test/桌面应用/rejection-copy.test.ts`、`run-pin.test.ts` | 13:02:29–13:02:34 | **0** | **37** | **37** | 0 | 0 | 0 | 0 | `03-suite-desktop-app.log` |
| C | 门禁引擎（A3） | `test/门禁引擎/view-image-cards.test.ts`、`list-project.test.ts` | 13:02:34–13:02:35 | **0** | 18 | **18** | 0 | 0 | 0 | 0 | `04-suite-gate-engine.log` |
| **合计** | — | — | — | — | **89** | **89** | **0** | 0 | 0 | 0 | — |

- 与 D1 对比：编排 34→34、桌面应用 36→**37**（+1，即本补测新用例）、门禁引擎 18→18；**合计 88→89**，全部通过。

### 4.3 门禁命令（typecheck）

| # | 命令 | 起止（+08:00） | 退出码 | 结果 | 原始日志 |
| --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck`（`tsc --noEmit`，ans-cli@1.8.4） | 13:02:38–13:02:40 | **0** | 0 类型错误 | `05-npm-run-typecheck.log` |
| 2 | `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） | 13:02:41–13:02:42 | **0** | 0 类型错误 | `06-npm-run-typecheck-renderer.log` |

### 4.4 运行后复核

`08-post-run-verification.txt`（13:02:46 +0800）：HEAD 不变（`55a4916b…`）；`git status --porcelain -- src app test` 仍仅 1 条 `M`；测试文件复算 SHA-256 `c272f843…` / blob `6b8da27c` 与运行前一致；`numstat` 仍 `17	0`；staged 空。

---

## 五、结论

1. **补测闭合 P1-CSQ-02**：授权要求的 topic 专用超长截断用例已存在于 `test/桌面应用/rejection-copy.test.ts`（单一追加 hunk，+17/−0），独立复跑**定向 17/17**、**受影响套件 89/89** 通过，判定条件（≤4096 B、含 `\n…（已截断）`、不含 `run manifest`）与授权逐条一致。
2. **未改产品代码 / AC / V1**：`src/`、`app/` 零改动；唯一产品/测试文件改动为上述测试文件的纯追加；既有断言未改、无删除、无新增 skip/todo；双端 typecheck 均 exit 0。
3. **E2 结论不受影响**：E2 判定针对已合并候选（PR #38 / merge commit `9f1a894…`）；本补测为 post-merge 独立变更，纯测试追加、不改动被测产品行为，E2 的 AC/K 判定依据与证据不变（符合 E2 §六.8「不改变当前候选与结论」口径）。
4. **本记录不构成提交/推送/合并/发布/验收授权**：授权明文「不含」；E3 的「不授权提交/推送/合并/发布」继续适用；后续动作另行授权。

---

## 六、检查取舍（未跑 T3 全量）

- **未跑 T3 全量**。理由：本变更**纯测试追加、未触产品代码**；按 E2 §六.8 建议「后续补测试后重跑受影响套件」，以及 `docs/project-rules.md` §二.9 风险档位口径（T1/T2 只做受影响检查，全量回归只在 T3 或证据不足时）——本变更为 post-merge 独立测试追加，不发布、不涉及共享抽象/治理/权限。
- 因此本记录结论**只覆盖实际运行的命令**；T3 未运行、**不得视为通过**。D1/E2 的 T3 证据对应当前已合并候选（不含本补测），不得表述为本补测后的全量结果。

---

## 七、偏离与限制

1. **受影响套件口径**：沿用 D1 §五的 6 文件清单（三组），非三个目录全量；目录内其余测试文件本**未运行、未验证**。
2. **并发执行**：三组套件并发运行（各自独立进程与日志），与 D1 口径一致；计数为 `node --test` 自身汇总。
3. **未跑 Electron/E2E**：V1 不要求，本补测亦不涉及 UI 行为。
4. **基线哈希复算**：改前以 `git show HEAD:… | sha256sum` 实测为 `71388f9f…`（与 D1、实施方记录一致）；改后工作区 `c272f843…`（与任务派发、实施方记录一致）。
5. 本记录只记录测试事实，不判验收；AC/V1 判定属质检/独立验收。
6. **未 commit/push、未接触客户**；写集仅本角色 `角色卡/测试/docs/change/` 下本记录与证据目录，未改测试文件、src 或其他角色文档。
7. 沟通记录（`docs/communication/*`）的 `M` 属其他窗口的记录性改动，本角色只读引用、未修改。
8. 证据时效：若后续改动 `src/provider/runtime/tools.ts` 的 topic 截断标记 / `CONTRACT_CHECK_MAX_BYTES`，或改动本测试文件，本次证据失效，需重跑受影响套件。

---

## 八、证据清单

目录：`角色卡/测试/docs/change/2026-11-03_contract-schema-query-P1-CSQ-02-verification-evidence/`

| 文件 | 行数 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| `00-precheck.txt` | 41 | 2,047 | `659d16e16c4c101ea833f4e4cff2c4cc445e1d0bb62ec3bf88add3ffa47d5af2` |
| `01-node-test-rejection-copy.log` | 32 | 2,014 | `0c4d53643bd4eb7937dde8aef9d0dbc1f95735c2cbd5aa660a023b6d3a0a9b97` |
| `02-suite-orchestration.log` | 49 | 4,128 | `f8de9d898eec6fe90a7133107062ecc25bc7f5dd1157809ded77425a267baf54` |
| `03-suite-desktop-app.log` | 52 | 4,174 | `8a7f6bc85c2a761eb6a93c4ad906c1407185376a1ca113819e57b0d458b2ebf8` |
| `04-suite-gate-engine.log` | 33 | 2,244 | `95c357510219826d57fef0e1966db0d86f25aaf0148f26a324e45a9f4c5250cc` |
| `05-npm-run-typecheck.log` | 11 | 147 | `060eb9cd2d981437fad75b769c3201aa439748b62eb5c3905a5c586ef3762342` |
| `06-npm-run-typecheck-renderer.log` | 11 | 186 | `20cb47d33fa939910d3daf7d8ba77020d938f4754e1a958b0546a6383701e45a` |
| `07-test-diff.txt` | 29 | 1,682 | `d88d2b12f19161aae166dabe80b073a4c7b78076c46fc425a523b7f65ac0a356` |
| `08-post-run-verification.txt` | 19 | 679 | `2a157c99f9cf5617f35d1b47075d6de34a4078c4f2814185db3eac93c732f362` |
