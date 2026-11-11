# convener-code B27 记录：fixed A11 实现任务不得诱导 shell/自测（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「convener-code」（独立固定上下文；B27 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 **B27**（RR24 失败修复）
- 基线 HEAD：`c55453f`（RR24 记录提交）
- 依据：RR24 记录 `74e5f59e…`（A11 worker 执行 `node src/core/self-test.js` ⇒ shell 审批卡；task 文本含「可加最小单测/自测脚本」「如何自测」）

## 实施

`src/common/roles/convener/index.ts` `convener-fixed-production-line` 段新增一条：

- A11/B3 实现任务文本：**不得建议或要求 worker 添加后运行自测脚本**，不得以「如何自测」「测试结论」作为报告项；报告只要求**静态自检结论（读码核对，不运行 shell/node/npm、不执行测试脚本）**；执行/验证归 A12 验收角色承担；worker 只写本模块文件 + 字面 `git add`/`git commit`；任何 `run_shell`（含 `node`/`npm`/自测脚本）都会触发 shell 审批卡（RR24 实测：`node src/core/self-test.js` ⇒ shell 门早停）。

legacy 三段、fixed 其它段与 card.text 未改。

## 验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `test/roles/convener/convener-fixed.test.ts`（新增 B27 用例 + legacy 隔离 token 增补） | 含在受影响集 **115/115 pass** | `角色卡/门禁引擎/docs/change/2026-11-11_B27_two-fixed-workflow-paths_evidence/b27-02-affected.tap` |
| `npm run typecheck` | exit 0 | 同目录 `b27-01-typecheck.txt` |

## 候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/roles/convener/index.ts` | M | 48,049 / 825 | `5ce799fb8a4032a4a708ab2878fc8ce58ca03da0ddb260e6a26b7c2c13380b2a` | +1/−0 |
| `test/roles/convener/convener-fixed.test.ts` | M | — | `a94ab77f71b109a80212974ef8b97cd1b81098a7fdf54b48e0ea216de7565b5f` | +22/−1 |

## 限制

- 只改 fixed 静态文本；未运行真实模型/Electron，不声称 RR/B2 通过；真实效果待 RR25 行使。
