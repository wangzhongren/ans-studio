# B34 两条固定工作流路径：路径 B 的 B2 范围决定记录时序 + 禁止 shell 读应用源码（门禁引擎，2026-11-11）

- 角色：ANS 固定 worker「门禁引擎」（roleId: 门禁引擎），独立上下文。
- 任务：T3「两条固定工作流路径」B34.2——RR31 失败修复（路径 B 的 B2 `change.scope-decided` 记录死状态；幕僚用 shell 读应用源码并触发预算外 shell 审批卡）。
- 依据：RR31 真机记录 `角色卡/测试/docs/change/2026-11-11_RR31_wuxia-roguelike-fix.md`（B2 stage-request 两次被应用受理 ⇒ 视图进入 B2(requested)；`change.scope-decided` 只在受理 B3 advance 且视图仍为 B1 completed + B2 pending 时由应用记录，此后 B3 advance 被拒「B2 范围决定未记录：当前 B2(requested)」，不可恢复；幕僚卡死后以 13 条 `findstr` 读应用源码、PowerShell 触发 shell 审批卡早停）；协调方 B34 授权。
- 基线：HEAD `faa5c497c3a67dd5438d9bb3a2570c4774f95d3c`（RR31 记录；本批未触碰其他角色记录）。

## 一、RR31 失败事实（根因）

- 应用只在**受理 B3 advance stage-request** 时记录 `change.scope-decided`：要求视图 `view.stage === "B1" && B1 completed && (B2 pending || failed)`，从 B1 生产任务 done 报告的 evidence 取影响面报告、重算 hash、按 roster 属主派生写集（`app/desktop/workflow.ts`）。
- 幕僚按旧资源文字「**B2**：你发范围决定（`change.scope-decided`：…）」先发 **B2 stage-request**：应用受理（`stage.requested B2`），视图进入 **B2(requested)**，B3 自动记录窗口被关闭；随后 B3 生产派发被拒 `b-change-scope-invalid`，B3 advance 被拒 `stage-transition-invalid`（「B2 范围决定未记录：当前 B2(requested)」），无恢复通道。
- 旧资源没有写清：B2 不是可请求的阶段，`change.scope-decided` 由应用在 B3 受理时隐式记录；也没有 B2 卡住时的停止纪律。
- 附带事实：幕僚卡死后用只读 `findstr` 跨出 target 读应用源码（shell 门自动放行），再以 PowerShell 触发 shell 审批卡——固定路径卡预算外的客户门，属行为/文本缺陷。

## 二、实施

### 2.1 `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`（M，+6/−4）

- **两条固定路径（路径 B 摘要）**：B2 范围决定标注「**应用在受理 B3 advance 时记录；B2 不发 stage-request**」；写明 **B1 completed 后直接发 B3 advance stage-request**（`taskKind:"stage-request"`、`workflowAction:"advance"`、`stage:"B3"`、`workflowId`），应用在受理 B3 时校验 B1 影响面报告并记录 `change.scope-decided`，B2 由该记录完成。
- **首个动作段**：字段口径末追加「**路径 B 不发 B2 stage-request**：B1 completed 后直接发 B3 advance」；既有 `workflowPath`/`stage:"A1"`（路径 B 首请求为 `"B1"`）口径逐字保留。
- **各阶段 fixed 任务字段与卡节奏段**：`stage` 合法转移句后追加「**路径 B 例外：B2 不是可请求的阶段——不发 B2 stage-request，B1 completed 后直接发 B3 advance**」。
- **§路径 B 要点**：
  - B2 条目改为「**B2（不发 stage-request）**」：应用对 `stage:"B2"` 的 advance 请求直接拒绝（稳定码 `b2-stage-request-forbidden`，文案「路径 B 不发 B2 stage-request；B1 完成后直接发 B3 advance stage-request（应用在 B3 受理时记录 B2 change.scope-decided）；B2 保持 pending」）；B1 completed 后直接发 B3 advance；应用受理 B3 时校验 B1 影响面报告（应用计算的 impactReport hash）、按 roster 属主 ∩ 角色边界派生写集、记录 `change.scope-decided`，B2 由该记录完成；越界/无法唯一归属 ⇒ `b-change-scope-invalid`。
  - 新增「**B2 卡住时如实上报/停止**」：收到 `b2-stage-request-forbidden` / `stage-transition-invalid`（「B2 范围决定未记录：当前 B2(requested)」）/ `b-change-scope-invalid` 等真实拒绝码时按真实 code 处置并如实上报；不得反复重发 B2 stage-request、不得伪造范围决定或自造 `scope.files`/hash；无法恢复时先收口 open advance 请求，再按停止流程发 `workflowAction:"stop"` 的 stage-request。
  - 新增「**禁止用 shell 探测或读取应用源码**」：不得用 `findstr`/`grep`/`Get-Content`/PowerShell 等 shell 探测或读取应用源码/实现（含跨出项目 target 目录）；应用源码/实现事实不可作为项目证据；项目证据只取本资源、应用真实回执与项目内证据文件；任何 shell 都会触发 shell 审批/拒绝面，固定路径不应产生额外客户卡。
- B3/B4 条目、既有安全语义（应用计算 hash、禁止 shell hash、写区/写集派生、卡预算 3 确认卡 + `merge-main`、fail-closed、`b-repository-required`）逐字保留；legacy `chief-workflow.md` 未改（字节 pin 由测试断言）。

### 2.2 测试（`test/门禁引擎/chief-workflow-v2-path-b-b2-record.test.ts`，A，7 用例）

- 路径 B 概要：B1 completed → B3 advance 字段齐全、应用记录 `change.scope-decided`、B2 由该记录完成、不发 B2。
- 首个动作段/阶段段重申 B2 不是可请求阶段；B7.1 首请求字段口径不回归。
- §路径 B 要点 B2：`b2-stage-request-forbidden`、应用拒绝文案、B3 受理校验影响面报告/派生写集/记录 scope、B3 条目写集拒绝语义保留。
- 旧「B2：你发范围决定」措辞移除（旧条目/旧括号文案均不得出现）。
- B2 卡住处置：三类真实拒绝码、如实上报、不重发/不伪造、stop 流程。
- 禁止 shell 探测/读取应用源码：`findstr`/`grep`/`Get-Content`/PowerShell、源码非项目证据、不产生额外卡、RR31 实测。
- 既有安全语义与 legacy：hash/卡预算/写集/fail-closed 保留；v1 字节 pin、模块 pin、v2 版本行/规模/编码有界。
- 未新增 skip/force-exit；未删除/弱化既有安全断言。

## 三、验证（D1）

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `2026-11-11_B34_two-fixed-workflow-paths_evidence/b34-01-typecheck.txt` |
| 受影响集（7 个 chief v2 测试文件：resource/a1-dispatch-fields/no-shell-hash/stage-task-separation/a12b-blocked-decision/git-commit-argv/path-b-b2-record） | **47/47 pass** | `2026-11-11_B34_two-fixed-workflow-paths_evidence/b34-02-affected.tap` |
| 确定性全链 `test/测试/fixed-path-full-chain.test.ts` | **3/3 pass** | `2026-11-11_B34_two-fixed-workflow-paths_evidence/b34-03-full-chain.tap` |
| 全量 `test/门禁引擎/*.test.ts` | **571 pass / 5 fail / 1 skip（577 tests）**；5 条失败名与 B2/B28 冻结 known-red **逐名一致**（diff 空；pass = B32 564 + B34 新增 7） | `2026-11-11_B34_two-fixed-workflow-paths_evidence/b34-04-gates-knownred.txt` |
| 全量 `test/编排/*.test.ts`（只读交叉运行；本角色未改 `src/common/编排/**`） | **1352 pass / 24 fail / 2 skip（1378 tests）**；24 条与 B17/B28 冻结 known-red **逐名一致**（diff 空） | `2026-11-11_B34_two-fixed-workflow-paths_evidence/b34-05-orchestration-knownred.txt` |

## 四、候选（门禁引擎）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md` | M | 30,999 / 136 | `26c922255cab8c4878402184217f6b816b1ee28c7274151562eec2a36138df7f` | +6/−4 |
| `test/门禁引擎/chief-workflow-v2-path-b-b2-record.test.ts` | A | 12,791 / 158 | `ce4a7ea75a8c4ce863ad6d9c74ff6953d294c9405df74f45d86c2508c57b3f1e` | +158/−0 |

- 证据文件 SHA-256：`b34-00-baseline-head.txt` `c972ef36…`、`b34-01-typecheck.txt` `26431e66…`、`b34-02-affected.tap` `a3d6d7b9…`、`b34-03-full-chain.tap` `c7b7d21c…`、`b34-04-gates-knownred.txt` `86d58975…`、`b34-05-orchestration-knownred.txt` `edf508d4…`。

## 五、限制与披露

- **文本级修复**：未改应用路由、编排实现、shell 白名单、写授权、工具面或卡预算；不运行 Electron/真实模型，不声称 RR31 或 B34 真机通过。真实效果待下一轮 RR 行使（B1 completed → 直接 B3 advance → 应用记录 `change.scope-decided` → B3 实现 → B4）。
- **并行实施披露**：编排角色并行实施方案 (b)——`requestStage` 对路径 B `stage:"B2"` advance 直接拒绝（稳定码 `b2-stage-request-forbidden`，文案即本资源所引）。本角色未改 `src/common/编排/**`、`app/desktop/**`，其代码事实不在本批写区与证据内；本资源按约定文案先行写死，待编排提交后由全链/真机核对。
- **写区纪律**：本角色只改 `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`、`test/门禁引擎/**`、`角色卡/门禁引擎/docs/change/**`；未改 `app/desktop/**`、`src/common/编排/**`、`src/provider/**`、`src/pipeline/**`、`src/model/**`、其他角色记录。**无跨写区需求**。
- 未 commit、未 push、未合并 main、未打 tag（由调度统一提交）。
