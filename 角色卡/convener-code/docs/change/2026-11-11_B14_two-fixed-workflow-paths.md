# convener-code B14 记录：fixed 不得为环境探测运行 shell（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS 固定角色「convener-code」（独立固定上下文；B14 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3）；批次：**B14**（RR9 失败修复）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`743abbc`（RR9 记录提交）
- 性质：D1 实现批次记录（自检，不替代独立验收）；**未提交/未推送/未合并/未发布**；未运行真实模型/Electron。

## 一、依据

| 依据 | 路径 | 与 B14 的关系 |
| --- | --- | --- |
| RR9 真机记录（失败事实） | `角色卡/测试/docs/change/2026-11-11_RR9_two-fixed-workflow-paths.md`（`0764e77f…`） | 运营在受派回合执行 `node -v`/`python --version` 做环境探测 ⇒ shell 审批/拒绝面（fixed 卡预算外额外门）⇒ 驱动失败即停 |
| RR9 shell-gate 审计 | `角色卡/测试/docs/change/2026-11-11_RR9_two-fixed-workflow-paths_evidence/shell-gate.jsonl`（`6844234a…`） | `node -v` allow / `python --version` deny，均 `execution:"未执行"` |
| B13.2 convener 记录 | `角色卡/convener-code/docs/change/2026-11-11_B13.2_two-fixed-workflow-paths.md` | fixed 生产线段/证据段基线 |

## 二、实施内容

### 2.1 `convener-fixed-production-line` 段（`src/common/roles/convener/index.ts`，M）

- section id/顺序/数量不变（fixed 5 段；legacy 3 段逐字未改）。
- 新增一条：
  - 环境/工具链事实以应用只读事实（`project_state`/项目配置）为准；
  - **不得为探测环境运行 shell**（`node -v`、`python --version`、`which`、`where` 等会触发 shell 审批/拒绝面，属 fixed 卡预算之外的额外门，RR9 实测）；
  - 任务文本要求环境探测时，按应用事实报告并如实说明，不运行 shell。
- fixed context 注释同步 B14。

### 2.2 测试（`test/roles/convener/convener-fixed.test.ts`，M）

- 新增 1 个 test：`B14 fixed 环境探测纪律：不得为环境/工具链探测运行 shell；环境事实从应用只读事实读取`。
  断言覆盖：production-line 段含禁令、`node -v`、`python --version`、shell 审批/拒绝面、fixed 卡预算之外的额外门、`project_state`、按应用事实报告不运行 shell；legacy 不含 fixed-only token；同输入同引用。
- 既有 B9.1/B13.2 convener fixed tests 保留并全部通过。

## 三、验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `test/roles/convener/convener-fixed.test.ts` | **12/12 pass**，0 fail/0 skip | `_evidence/b14-01-convener-fixed.tap`（`762832b9…`） |
| D1 受影响集（含 B13.1/B13.2/B14、run-role fixed、product/convener/chief） | **84/84 pass** | `角色卡/门禁引擎/docs/change/2026-11-11_B14_two-fixed-workflow-paths_evidence/b14-02-d1-affected.tap`（`3c3a1398…`） |
| `npm run typecheck` | exit 0 | 同目录 `b14-03-typecheck.txt`（`22d52cc9…`） |
| 确定性全链 | 3/3 pass | 同目录 `b14-04-full-chain.tap`（`4588c3d2…`） |

## 四、候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/roles/convener/index.ts` | M | 46,683 / 822 | `9d36b324e152e88a0313c6ada474c46501878b73cb73e91be17bde13373306b1` | +3/−0 |
| `test/roles/convener/convener-fixed.test.ts` | M | 18,151 / 321 | `cf22c5f2aee0d4ee47c3fcdc2c5fc02a8fdb225ef06aa3abc4a12378df741de5` | +23/−0 |

- 写集外改动=0（本角色仅上述 2 文件 + 本记录与 `_evidence/`）；legacy context/card/dispatch/preflight/tools 未改。

## 五、限制与披露

- 本批只改 fixed context 静态文本与测试；**未运行**真实模型/Electron，不声称 RR/B2 通过；真实效果待 RR10 复验。
- shell 审批/拒绝面与 ruleset 行为未改（仍按高风险清单）；本批只要求运营不把 shell 用作环境探测。
