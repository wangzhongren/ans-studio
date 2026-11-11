# 门禁引擎 B14 记录：fixed A1 禁止 shell 环境探测（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS 固定角色「门禁引擎」（独立固定上下文；B14 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3）；批次：**B14**（RR9 失败修复）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`743abbc`（RR9 记录提交）
- 性质：D1 实现批次记录（自检，不替代独立验收）；**未提交/未推送/未合并/未发布**；未运行真实模型/Electron。

## 一、依据

| 依据 | 路径 | 与 B14 的关系 |
| --- | --- | --- |
| RR9 真机记录（失败事实） | `角色卡/测试/docs/change/2026-11-11_RR9_two-fixed-workflow-paths.md`（`0764e77f…`） | 幕僚 A1 stage-request 任务文本要求运营探测 Node/Python ⇒ 运营执行 `node -v`/`python --version` ⇒ shell 审批/拒绝面（fixed 卡预算外额外门）⇒ 驱动失败即停 |
| RR9 tasks.jsonl（`t-mwbevpz7-e8b6bb93` 文本） | `角色卡/测试/docs/change/2026-11-11_RR9_two-fixed-workflow-paths_evidence/tasks.jsonl`（`84c11f6f…`） | 任务文本原文含「可用的运行时/工具链（Node/Python 等是否可用）」 |
| 实现级方案 v1.3 §4.2 A1 / §6.2 / §8 | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | fixed 卡预算 3 确认 + merge-main；shell 审批保留；A1 只受理/准备 |
| B9.1 chief v2 记录 | `角色卡/门禁引擎/docs/change/2026-11-11_B9.1_two-fixed-workflow-paths.md` | chief-workflow-v2 资源基线（禁止 shell hash） |

## 二、实施内容

### 2.1 `chief-workflow-v2.md`（M；门禁引擎资源）

1. **A1 段**（「A1 生产任务用 `stage:"A1"`」条目）追加：
   - **A1 任务文本不得要求运营用 shell 做环境/工具链探测**：`node -v`、`python --version`、`which node` 等会触发 shell 审批/拒绝面（fixed 卡预算之外的额外门，RR9 实测）；环境事实以应用 `project_state`/项目配置的只读事实为准，不运行 shell。
2. **「任务文本与哈希口径」段**新增条目：
   - **任务文本不得要求 shell 环境探测**：A1 及任何 stage-request 不得要求运营/worker 用 shell 探测环境或工具链（`node -v`、`python --version`、`which`、`where` 等）；环境事实以应用 `project_state`/项目配置的只读事实为准；环境探测类 shell 会触发 shell 审批/拒绝面，属 fixed 卡预算之外的额外门（RR9 实测）。
- legacy `chief-workflow.md` 与模块 pin 未改（资源测试通过）。

### 2.2 测试（`test/门禁引擎/chief-workflow-v2-no-shell-hash.test.ts`，M）

- 新增 1 个 test：`B14 A1 环境探测禁令：任务文本不得要求 shell 环境/工具链探测（RR9 实测根因）`。
  断言 A1 段与政策段均含：A1 任务文本禁令、`node -v`、`python --version`、shell 审批/拒绝面、fixed 卡预算之外的额外门、`project_state`。
- 既有 B9.1 测试（哈希口径、禁 shell hash、卡预算、资源冻结）全部保留并通过。

## 三、验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `chief-workflow-v2-no-shell-hash.test.ts` + `chief-workflow-v2-resource.test.ts` | **12/12 pass** | `_evidence/b14-01-chief-workflow-v2.tap`（`ddcb7c64…`） |
| D1 受影响集（B13.1/B13.2/B14 + run-role fixed + product/convener/chief 资源） | **84/84 pass** | `_evidence/b14-02-d1-affected.tap`（`3c3a1398…`） |
| `npm run typecheck` | **exit 0** | `_evidence/b14-03-typecheck.txt`（`22d52cc9…`） |
| 确定性全链 `fixed-path-full-chain.test.ts` | **3/3 pass** | `_evidence/b14-04-full-chain.tap`（`4588c3d2…`） |
| 桌面 fixed 定向 10 文件 | **80/80 pass** | `_evidence/b14-05-desktop-fixed.tap`（`12b73576…`） |

## 四、候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md` | M | 23,697 / 129 | `5db84ac034d2b4299e781e5975bd36448954c60fb0a0106446f5cd2780e66062` | +2/−1 |
| `test/门禁引擎/chief-workflow-v2-no-shell-hash.test.ts` | M | 10,916 / 166 | `3a6f43165dfa7b679b22836e5c94f8248d022c8aa3c27df783bf766d03dfe92d` | +18/−0 |

- 写集外改动=0（本角色仅上述 2 文件 + 本记录与 `_evidence/`）；`chief-workflow.md`（legacy）字节与模块 pin 未变。
- 基线/改动状态：`_evidence/b14-00-baseline-head.txt`（`743abbc`）、`b14-00-change-status.txt`。

## 五、限制与披露

- 本批只改 fixed v2 资源静态文本与测试；**未运行**真实模型/Electron，不声称 RR/B2 通过；真实效果待 RR10 复验。
- shell 审批面行为（ruleset allow/deny、UI 呈现）不在本批改动范围；本批只消除任务文本对 shell 探测的诱导。
