# W：B28 A12a/A12b 项目验收角色绑定模块与禁止 shell 建目录（门禁引擎，2026-11-11）

- 角色：ANS 固定 worker「门禁引擎」（roleId: 门禁引擎），独立上下文。
- 任务：T3「两条固定工作流路径」B28——RR25 失败修复（A12a 未绑定模块 + review 角色 `mkdir` shell 卡）。
- 依据：RR25 记录 `角色卡/测试/docs/change/2026-11-11_RR25_two-fixed-workflow-paths.md`（`6e857f20e0949d6b1a2967bc302c6424dfcfcca0b70848e7fd24cd64704049c2`）；协调方 B28 授权与 RR26 预算批准。
- 基线：HEAD `59d24c6`（RR25 记录提交）。

## 一、RR25 失败事实（根因）

- A1–A10 完成；A12a 首派 qa-reviewer（项目验收角色）**未带 modulePaths** ⇒ 写 `docs/acceptance/snake-game-criteria-v1.md` 被拒（冻结模块/当前授权交集为空）→ blocked → chief 重派并绑定 `acceptance-record`/`docs/acceptance/`。
- 重派后 qa-reviewer 为“确保目录存在”以 `run_shell` 执行 `cmd /c mkdir docs\acceptance` → shell 审计 deny/未执行 + 「shell 命令请求」审批卡 → 驱动失败即停；A11 未到达。
- 文本根因：`chief-workflow-v2.md` A12a/A12b 未要求给项目验收角色绑定 roster 模块（B26 下无 modulePaths ⇒ 空写集）；review 任务只禁「shell 环境探测」，未禁一般 shell（mkdir）；worker 不知道 `write_file`/`edit_file` 会自动创建目录、`docs/acceptance` 归档由应用完成。

## 二、实施

### 2.1 `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md`（M）

- A12a 段：内置 verifier 保持 `docs/quality/<flowId>-criteria-vN.md`；**项目验收角色（`workflow.reviewRoleId`）必须在任务上绑定其 roster 模块（moduleId + modulePaths，取自模块清单），验收文件路径写在该模块内**（未绑定 ⇒ 写集为空、write_file 被拒，RR25 实测）；review 任务文本须写明：**不得运行任何 shell 命令（含 mkdir/目录创建）**，`write_file`/`edit_file` 会自动创建目录；`docs/acceptance/` 的应用归档由应用完成，不由 review worker 创建。
- A12b 段：项目验收角色同样必须绑定其 roster 模块（moduleId + modulePaths），报告路径在模块内；review 任务文本同样禁止任何 shell（含 mkdir），write_file/edit_file 自动建目录；其它 A12b 完成条件（report hash 应用计算、应用归档）不变。

### 2.2 测试 `test/门禁引擎/chief-workflow-v2-stage-task-separation.test.ts`（M）

- 新增 B28 用例：A12a/A12b bullet 断言模块绑定（moduleId + modulePaths）、验收/报告路径在模块内、禁止 shell/mkdir、write_file/edit_file 自动建目录、docs/acceptance 应用归档。

## 三、验证（D1）

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b28-01-typecheck.txt`（`92ef7d09…`） |
| 受影响集（chief v2 四个测试、convener fixed/differential、chief fixed、run-role fixed b2/b121/b31、桌面 b61/b51；12 文件） | **117/117 pass** | `_evidence/b28-02-affected.tap`（`1a657809…`） |
| 确定性全链 | **3/3 pass** | `_evidence/b28-03-full-chain.tap`（`7c7be697…`） |
| 全量 `test/门禁引擎/*.test.ts` | **548 pass / 5 fail / 1 skip**；5 条失败名与 B2 冻结门禁 known-red **逐名一致**（diff 空） | `_evidence/b28-04-gates-suite.tap`（`cd509e3e…`）、`b28-05-gates-known-red-failnames.txt`（`8325f9d8…`）、`b28-06-gates-known-red-diff.txt`（`e3b0c442…`，空） |
| 全量 `test/编排/*.test.ts` | **1346 pass / 24 fail / 2 skip**；24 条与 B17 冻结 known-red **逐名一致**（diff 空） | `_evidence/b28-07-orchestration-suite.tap`（`ef3e8bdd…`）、`b28-08-orchestration-known-red-failnames.txt`（`f9513fb0…`）、`b28-09-orchestration-known-red-diff.txt`（`e3b0c442…`，空） |

- 抖动披露：首次全量编排运行出现 `download-provider.test.ts` 时序抖动（1345/25），复跑恢复 **1346/24**（冻结 known-red）；该文件单独运行历史 14/14 pass，判定环境抖动，B28 无确定性新增失败。详见 `_evidence/b28-10-flake-disclosure.txt`（`28ab1641…`）。

## 四、候选（门禁引擎）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md` | M | 25,738 / 130 | `5f170913f8886de42451ac52a0ba35a321f82ad5dea9385e8c8e5d82745841ce` | +2/−2 |
| `test/门禁引擎/chief-workflow-v2-stage-task-separation.test.ts` | M | — | `fad386b49fba592c2ca9cb6623b46d5685587350087a2c15c78818699c835c2f` | +16/−0 |

- convener 候选见 `角色卡/convener-code/docs/change/2026-11-11_B28_two-fixed-workflow-paths.md`；共同证据在 `角色卡/门禁引擎/docs/change/2026-11-11_B28_two-fixed-workflow-paths_evidence/`。

## 五、限制与披露

- 文本级修复，未改 shell 门禁/写授权/工具面；未运行真实 Electron/模型，不声称 RR/B2 通过；真实效果待 RR26 行使。
- **B25 回执根因（RR25 新证据）**：桌面 `completeTeamPlanFixedForHandle`（`app/desktop/session.ts`）把 fixed 服务成功结果包装成 legacy `DirectActionReceipt`（`status:"applied"`、`targetDigest: completed.basisId`=`bas-…`）；`isDirectActionReceipt` 要求 `targetDigest` 为 64-hex digest，B25 的 fixed validator 又要求 fixed 服务形状 ⇒ 两侧都不匹配，工具层始终回「结果未知或回执不完整」（RR22/RR25 实测 4 次）。**修复方向（B29 候选，待授权）**：桌面包装改为返回 fixed 服务形状（operationId/flowId/workflowId/basisId/plan/documents/replay/stageCompleted），或工具层接受该包装回执；本批未改。
