# W：B27 fixed A11 实现 worker 不执行 shell/自测（门禁引擎，2026-11-11）

- 角色：ANS 固定 worker「门禁引擎」（roleId: 门禁引擎），独立上下文。
- 任务：T3「两条固定工作流路径」B27——RR24 失败修复（实现 worker 为自测执行 `node` 触发 shell 审批卡）。
- 依据：RR24 记录 `角色卡/测试/docs/change/2026-11-11_RR24_two-fixed-workflow-paths.md`（`74e5f59e3ec8769d5c8c2ba0f64c443def5f862c10074e42a67fe57d2416a952`）；协调方 B27 授权与 RR25 预算批准。
- 基线：HEAD `c55453f`（RR24 记录提交）。

## 一、RR24 失败事实（根因）

- B26 首次真实生效：A11 game-core 任务成功写入 `src/core/game-core.js` 与 `src/core/self-test.js`（`?? src/`），写授权正确。
- 随后 worker 以 `run_shell` 执行 `node src/core/self-test.js`（07:54:59），shell 审计 deny/未执行并弹「shell 命令请求」审批卡；驱动按「额外门失败即停」停止。无 git add/commit。
- 文本根因：`chief-workflow-v2.md` A11 口径要求「变更与**测试结论**」，convener 据此在任务文本写「可加最小单测/自测脚本」「**如何自测**」；worker 为产出测试结论尝试执行 node ⇒ shell 卡。fixed 路径下 worker 只有写文件 + 字面 `git add`/`git commit`（taskGit）通道，任何 `run_shell` 都会触发额外审批门。

## 二、实施

### 2.1 `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`（M）

- A11 段（阶段清单与「A10 与 A11 的顺序」两处）：报告口径改为「变更要点与**静态自检结论（读码核对；不运行 shell/node/npm、不执行测试脚本，执行/验证由 A12 验收承担）**」；新增硬性：「**实现 worker 只写本模块文件 + 字面 `git add`/`git commit`；不得运行任何 shell 命令（含 `node`/`npm`/自测脚本）。**」
- 策略段（## 任务文本与哈希口径）：首个 bullet 的「测试结论」改为「静态自检结论（读码核对，不运行 shell/node/npm、不执行测试脚本）」；新增 bullet「**实现 worker 不执行 shell/自测**」——任务文本不得建议/要求 worker 添加后运行自测脚本，不得以「如何自测」「测试结论」为报告项，任何 `run_shell`（含 `node`/`npm`/自测脚本）都会触发 shell 审批卡（RR24 实测）。
- legacy `chief-workflow.md` 未改（B9.1 冻结 hash 断言保持通过）。

### 2.2 测试

- `test/门禁引擎/chief-workflow-v2-no-shell-hash.test.ts`（M）：B9.1 A2/A7/A11 用例更新为 B27 口径（静态自检结论 + 应用 hash）；新增 B27 用例断言静态自检结论、不运行 shell/node/npm、worker 只写文件 + 字面 git、禁止「如何自测/测试结论」为报告项，且旧「变更与测试结论」措辞不再出现。
- `test/门禁引擎/chief-workflow-v2-stage-task-separation.test.ts`（M）：修复 B17 遗留的陈旧断言——A8 activation 现为「proposalDecisionId + roster + 三文档，**只传 path**；hash 由应用回填」，旧断言仍要求「三文档 hash」而失败（非 B27 引入；D1 中暴露后按 B17 已批准口径更正，不放宽其它断言）。

## 三、验证（D1）

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b27-01-typecheck.txt`（`92ef7d09…`） |
| 受影响集（chief v2 四个测试、convener fixed/differential、chief fixed、run-role fixed b2/b121/b31、桌面 b61/b51；12 文件） | **115/115 pass** | `_evidence/b27-02-affected.tap`（`6d1cbb32…`） |
| 确定性全链 | **3/3 pass** | `_evidence/b27-03-full-chain.tap`（`fc11575b…`） |
| 全量 `test/门禁引擎/*.test.ts` | **547 pass / 5 fail / 1 skip**；5 条失败名与 B2 冻结门禁 known-red **逐名一致**（diff 空） | `_evidence/b27-04-gates-suite.tap`（`23c2ce07…`）、`b27-05-gates-known-red-failnames.txt`（`8325f9d8…`）、`b27-06-gates-known-red-diff.txt`（`e3b0c442…`，空） |
| 全量 `test/编排/*.test.ts` | **1346 pass / 24 fail / 2 skip**；24 条与 B17 冻结 known-red **逐名一致**（diff 空） | `_evidence/b27-07-orchestration-suite.tap`（`669a05fd…`）、`b27-08-orchestration-known-red-failnames.txt`（`f9513fb0…`）、`b27-09-orchestration-known-red-diff.txt`（`e3b0c442…`，空） |

## 四、候选（门禁引擎）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md` | M | 25,093 / 130 | `f6ad5016ef30d68ab434d67f300c91d58a4bceb033a458f992f54b1b4f641ed1` | +4/−3 |
| `test/门禁引擎/chief-workflow-v2-no-shell-hash.test.ts` | M | — | `e6d186b584ba7a9fde1ec95c00378301bed150f760fad1c585f2c9d3fb2127fc` | +19/−2 |
| `test/门禁引擎/chief-workflow-v2-stage-task-separation.test.ts` | M | — | `46779dc677a1ed63449fb444b57f332f0b5049205cbb73bb174832886d979f01` | +1/−1 |

- convener 候选见 `角色卡/convener-code/docs/change/2026-11-11_B27_two-fixed-workflow-paths.md`；共同证据在 `角色卡/门禁引擎/docs/change/2026-11-11_B27_two-fixed-workflow-paths_evidence/`。

## 五、限制与披露

- 文本级修复，未改 shell 门禁/工具面/写授权；未运行真实 Electron/模型，不声称 RR/B2 通过；真实效果待 RR25 行使。
- B9.2 陈旧断言（B17 path-only 口径未同步）非 B27 引入，本批一并更正并披露；其余既有断言未放宽。
