# B31 A12b blocked 报告当回合三选一处置纪律（门禁引擎，2026-11-11）

- 角色：ANS 固定 worker「门禁引擎」（roleId: 门禁引擎），独立上下文。
- 任务：T3「两条固定工作流路径」B31——RR26 失败修复（A12b blocked 报告后幕僚空转 stall）。
- 依据：RR26 记录 `角色卡/测试/docs/change/2026-11-11_RR26_two-fixed-workflow-paths.md`（真机 08:45:08 verifier 以 `status=blocked` 交回 A12b v2 报告；幕僚 08:45:08/08:45:33 两次唤醒未收口/未判定/未归档，12 分钟无进度 stall）；协调方 B31 授权。
- 基线：HEAD `9cce927`（B30 提交 `fix(runtime-core): B30 allow repo-local [user] name/email in readonly git config`）。

## 一、RR26 失败事实（根因）

- A1–A11 完成（A11 真实模块写入 + 4 commits），A12a 完成，A12b v1 不通过 → 返工 → v2 静态修复确认。
- verifier 的 v2 报告以 `status=blocked` 提交：fixed 任务 shell 被禁用、无浏览器/运行器工具，多数 AC 的**运行期检查无法执行**，报告如实标「未执行/证据不足」。
- 报告到达幕僚后，幕僚被唤醒两次均未动作：**未收口 A12b、未做业务判定/归档、未推进 A13**；12 分钟无账本进度 → `stalled-no-progress-12min`。
- 文本根因：fixed A12b 段只写「不通过 ⇒ 回 A11」「缺证 ⇒ blocked」，**未规定 blocked 报告到达后的当回合处置**（通过/返工/停止三选一），幕僚可空转。

## 二、实施

### 2.1 `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`（M，+6/−2）

- **A12b 阶段清单段**：新增「A12b 报告以 `status=blocked` 交回时（如 verifier 无受认可运行期验证通道），你必须在当回合三选一并留痕，**禁止空转**（轻量验收 / 有限返工 / 停止上报；细则见「A12 独立验收」段）」。
- **A13 段**：新增「若 A12b 以轻量验收（`acceptanceIntensity=lightweight`）收口，A13 交付说明中必须向客户披露「运行期未验证」」。
- **A12 独立验收段**：新增「A12b blocked 报告的当回合处置（禁止空转）」三选一细则：
  1. **轻量验收通过**：接受静态证据 + 如实记录「运行期未验证」——对 A12b 调 `close_created_task`、`outcome:"accepted"`，`note` 必须写明 `acceptanceIntensity=lightweight；运行期未验证（静态证据接受）`；应用归档 `docs/acceptance/` 会把 `note` 记为 `staffDecision`，A12b 完成并推进 A13；A13 交付说明必须向客户披露「运行期未验证」。
  2. **返工/补证**：给出可执行的有限补证要求——**不得要求 shell 自测**（`run_shell`/`node`/`npm`/测试脚本不得写入要求），可要求静态证据（具体文件与字段、逐条 AC 静态核对结论）；以 `outcome:"rework"` 收口并回 A11（新 attempt，`reworkOf:"A12b"`）。
  3. **停止并如实上报客户**：说明阻塞事实与所需客户决策；按停止流程先收口 open advance 请求，再发 `workflowAction:"stop"` 的 stage-request；不伪造通过、不静默归档。
- **受支持动作边界（文本不越权放宽）**：A12b 最后报告为 blocked 时，`accepted` 必须同时有应用归档证据（`acceptanceArchive`）与非空 `note`；其余阶段、缺归档或缺 note 仍 fail-closed（`close-report-missing`）。既有 hash（应用计算/禁止 shell hash）、shell 门禁、写区绑定（moduleId + modulePaths）、卡预算（3 确认卡 + merge-main）语义逐字保留；legacy `chief-workflow.md` 未改。

### 2.2 测试 `test/门禁引擎/chief-workflow-v2-a12b-blocked-decision.test.ts`（A，6 用例）

- A12b 阶段清单含 `status=blocked` 与「当回合三选一并留痕，禁止空转」及三选项；
- 轻量验收含 `close_created_task` / `outcome:"accepted"` / `note` 标记（逐字 `acceptanceIntensity=lightweight；运行期未验证（静态证据接受）`）/ `staffDecision` / A13 披露；
- 受支持动作边界：`acceptanceArchive` + 非空 `note`，其余阶段/缺归档/缺 note 仍 fail-closed；
- 返工/补证不得要求 shell 自测，`outcome:"rework"` 回 A11；
- 停止并如实上报客户（阻塞事实/客户决策/stop stage-request/不伪造通过/不静默归档）；
- 既有安全语义不放宽 + legacy 版本/模块 pin 不变 + v2 版本行/规模/编码有界。

## 三、验证（D1）

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b31-01-typecheck.txt`（`abbd80ae…`） |
| 受影响集（chief v2 五个测试、chief fixed、convener fixed/differential、run-role fixed b2/b121/b31、桌面 b61/b51；13 文件） | **123/123 pass** | `_evidence/b31-02-affected.tap`（`e9f3c539…`） |
| 确定性全链 `test/测试/fixed-path-full-chain.test.ts` | **3/3 pass** | `_evidence/b31-03-full-chain.tap`（`9dc8cc69…`） |
| 全量 `test/门禁引擎/*.test.ts` | **554 pass / 5 fail / 1 skip（560 tests）**；5 条失败名与 B2/B28 冻结 known-red **逐名一致**（diff 空；pass = B28 548 + B31 新增 6） | `_evidence/b31-04-gates-knownred.txt`（`d7fbe35c…`） |
| 编排 known-red（24 条） | **由编排角色运行**：1352 pass / 24 fail / 2 skip（1378 tests），24 条与 B17 冻结 known-red 逐名一致（见 `角色卡/编排/docs/change/2026-11-11_B31_two-fixed-workflow-paths.md` §三）；本角色未改 `src/common/编排/**`，另将三处非门禁 v2 资源消费者（`run-role-fixed-b2` / `b61-chat-entry-fixed` / 全链）纳入受影响集与全链验证 | — |

## 四、候选（门禁引擎）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md` | M | 27,811 / 134 | `85ff6dea432d79b526b92fe448ec89849dc6a9cdf02f5f974b8725ed827332c7` | +6/−2 |
| `test/门禁引擎/chief-workflow-v2-a12b-blocked-decision.test.ts` | A | 8,884 / 123 | `7e1ec54f135db91329165cea71fca1287cb59863dc643669085fc06ec4b16bd4` | +123/−0 |

- 证据文件 SHA-256：`b31-00-baseline-head.txt` `4a9c4333…`、`b31-01-typecheck.txt` `abbd80ae…`、`b31-02-affected.tap` `e9f3c539…`、`b31-03-full-chain.tap` `9dc8cc69…`、`b31-04-gates-knownred.txt` `d7fbe35c…`。

## 五、限制与披露

- **文本级修复**：未改 shell 门禁/写授权/工具面/卡预算；未运行真实 Electron/模型，不声称 RR/B31 真机通过；真实效果待下一轮 RR 行使。
- **应用侧依赖（不在本角色写区；按授权停手说明）**：资源描述的轻量验收动作要求两处应用配套——① `closeTask` 允许 A12b `accepted` 在最后报告为 blocked 时收口（必须同时有 `acceptanceArchive` 与非空 note；编排 B31 候选已在共享工作树实现，见 `角色卡/编排/docs/change/2026-11-11_B31_two-fixed-workflow-paths.md`）；② 桌面 `app/desktop/session.ts` 的 `buildFixedCloseEvidence` 在最后报告 blocked 时仍返回 `evidence: undefined`、不会生成 `acceptanceArchive`，需**桌面窗口角色**扩展该函数（A12b blocked + accepted 时按 criteria/report 生成归档，`staffDecision=note`）。两处全部合入前，轻量验收在真实桌面链路仍会 `close-report-missing` fail-closed；本角色未改 `app/desktop/**`、`src/common/编排/**`，文本不构成越权放行。
- 测试只读断言资源字节；未新增 skip/force-exit；legacy `chief-workflow.md` 字节与模块 pin 未变。
- **共享工作树并行改动（非本角色）**：生成证据时工作树另有编排角色并行未提交的 B31 应用侧改动（`src/common/编排/workflow-service.ts`、`test/编排/acceptance-archive.test.ts`）及桌面/运行时核心 boundary 改动。本角色未修改、未暂存这些文件；只读交叉运行 `test/编排/acceptance-archive.test.ts` 为 **6/6 pass**（其 B31 用例与文本 note 标记 `acceptanceIntensity=lightweight；运行期未验证（静态证据接受）` 一致）。最终提交范围由调度裁定。
- 未 commit、未 push、未合并 main、未打 tag（由调度统一提交）。
