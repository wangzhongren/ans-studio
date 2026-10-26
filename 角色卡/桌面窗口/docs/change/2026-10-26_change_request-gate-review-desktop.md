# 桌面窗口：`request_gate_review` 应用侧实现（gate 复核请求 + 报告处置 + 重启恢复）

- 日期：2026-10-26
- 角色：桌面窗口
- 依据：客户 2026-10-26 追加授权实现 `request_gate_review`；设计 `角色卡/项目管理/docs/design/2026-10-26_design_proof-gate-reviews.md` §5.3–§8、§9.3、§10（A3/A4/A6/A7/A8）；客户追加要求：gate 复核独立于最终验收、防吹毛求疵（fail 必须有 blocker/major；只有 minor/nit 的 fail 退回 Proof、不返工；pass 可带 minor/nit）。
- 状态：实现完成，桌面套件全绿；**未独立验收、未运行真实 Electron e2e、未 commit/push、未重启应用**（代码改动下次启动生效）。

## 一、范围与写集

只改本角色边界内文件：

- `app/desktop/interface.ts`：`requestGateReviewForProject` 能力、gate 记录/返工路由读写、gate 报告处置与重启恢复、`runAcceptanceCheck` 接线；
- `app/desktop/session.ts`：`SessionManagerDeps.requestGateReview` 与 **仅 convener（`governanceFunction === "schedule"`）** 会话注入；
- `app/desktop/governance-advance.ts`：gate 报告路径、gate 复核任务文案、gate 返工任务追加 `gateId`/报告指针；并按客户追加规则改写治理协调系统消息（见 §六）；
- `test/桌面应用/acceptance-dispatch.test.ts`：gate 复核/处置/恢复测试（含扩展 YAML 夹具 `gateKind`/`dependsOn`）；
- `test/桌面应用/interface.test.ts`：协调系统消息断言同步；
- 本角色 changelog / feature-map / docs/change。

未改 `src/**`（flow/model/provider/门禁卡/i18n）、`app/main.ts`（`requestAcceptance` 同模式无显式接线，缺省即用 Interface 实现）、`app/preload.cjs`、`app/renderer/**`、`demos/**`。

## 二、`request_gate_review` 应用侧能力（`interface.ts`）

`DesktopDeps.requestGateReview?: (projectRoot, input) => Promise<RequestGateReviewResult>` +
`requestGateReviewLimits?`；缺省实现为 `requestGateReviewForProject`。校验顺序按设计 §5.3：

1. **flowId 归一**：显式优先（slug 校验）；省略时仅当 `docs/flows` 恰有一个 YAML 才采用；多流程/无流程 ⇒ `gate-not-found` 并提示显式指定（不猜）。
2. **flow 读取/解析**：不存在/不可读/校验失败 ⇒ `gate-not-found`。
3. **gate 查找**：步骤存在、`kind: artifact`、`gateKind` 合法（`FLOW_GATE_KINDS`）且 `gateId` 形状为 `gate-<slug>`；否则 `gate-not-found`。
4. **状态**：`done` ⇒ `already-dispatched`（重验需 `flow_step_supersede` 新 gate id）；非 `pending`（superseded/failed/blocked/delivered/dispatched/aborted/cancelled）⇒ `rejected`。
5. **gate 记录/在途幂等**：记录损坏 ⇒ `rejected`（fail-closed）；`passed` ⇒ `already-dispatched`；`dispatched` 且同 `flowRevision` ⇒ `already-dispatched`；同 gate 在途请求（`projectRoot\0flowId\0gateId`）⇒ `already-dispatched`；`failed` 且返工路由未 `sent` ⇒ `rejected`（先完成返工协调）；`superseded`/`unavailable` ⇒ `rejected`；`dispatched` 且 flow revision 已变化 / `returned-to-proof` ⇒ 允许新一轮；**账本已有该 gate 的 `dispatch.accepted{stepId=gateId,targetRoleId:"verifier"}` 但记录缺失 ⇒ `already-dispatched`**（不重复派发）。
6. **dependsOn**：逐项沿 `supersededBy` 链解析到最终非 superseded 步骤；缺失/未知/成环 ⇒ `flow-incomplete`；未全部 `done` ⇒ `flow-incomplete`（列出未 done 项）；依赖步骤声明的证据用 `validateFlowEvidence` 同一口径与账本对账，缺失 ⇒ `flow-incomplete`。
7. **最新 criteria**：`latestAcceptanceCriteriaRelPath` 同口径的版本扫描（`readAcceptanceCriteriaInfo`，不回退旧版本）；不存在/为空 ⇒ `criteria-missing`；机械检查含**精确 `gateId` 的 Markdown 标题**与 `| ID |` 判定表 ⇒ 缺 Gate 标准节 ⇒ `criteria-missing`。
8. **种类证据完整性**（设计 §5.4）：
   - `visual-baseline`：需 `verification-evidence`（或切片/版本变体、`demo*`/`run-evidence*`/`visual-evidence*`/`screenshot*`）步骤 `done` 且证据与账本对账；artifact 证据路径须存在（关闭 DEBUG 与否归 Proof 判定）；
   - `integration-performance`：需集成/e2e/Reduce 步骤 `done` 且证据对账；风险档 T2/T3 或变更包声明性能时还需性能证据步骤 `done` 且对账。
9. **在途工作**：`manager.hasActiveWorkForFlow` ⇒ `unavailable`（稍后重试，不抢跑）。
10. **引擎解析**：`resolveAcceptanceRuntime`（有界）失败 ⇒ `unavailable`（绝不回退桌面默认引擎）。
11. **派发**：后台开 Proof（`verifier`）并投递自足任务（`buildGateReviewTaskMessage`：flowId/gateId/gateKind/标题/标准路径/dependsOn 证据指针/flow revision/报告路径与版本/重验不覆盖；要求只做 gate 复核、不发验收卡、不写 `customer.decision`、亲自运行或打开真实输出、visual 关闭 DEBUG、报告复用 `acceptance-triage/v1`、fail 必须 blocker/major、失败不改代码不派发、不标 done）。open/send 失败或超时 ⇒ `unavailable`（超时文案写「可能已派发，请用 flow_get 核对」）。
12. **持久化**：**先原子写 gate 记录** `.ans/governance/acceptance/<flowId>/gates/<gateId>.json`（`gate-review-record/v1`；重启恢复的唯一扫描源），再写账本 `dispatch.accepted{stepId=<gateId>, targetRoleId:"verifier", trigger:"settle", actorRoleId/power:"app"}`。任一写失败 ⇒ `unavailable`，不声称已派发（任务可能已投递则如实提示核对）。

预算：总预算缺省 60s、单阶段缺省 20s（`requestGateReviewLimits` 可注入），外层仍有总预算兜底；超时不取消底层动作、不伪造结果。

## 三、gate 报告处置（settle / 导入 / 账本事件，复用 `runAcceptanceCheck`）

`runAcceptanceCheck` 在 trio 项目里先对每个 flow 调 `processGateReviewsForFlow`（扫描 `gates/*.json`），再跑既有最终验收门。只读 flow/记录/报告，机械判定：

| 记录/报告事实 | 处置 |
| --- | --- |
| `dispatched` + 无最新报告 | 不自动通过；30 分钟陈旧阈值内记录保持 `dispatched`；主理一条 `main.gateReview.reportMissing`（去重）；超过阈值 ⇒ `returned-to-proof`（统筹可重新请求，**不自动重派/不自动通过**） |
| `dispatched` + 最新报告版本早于派发要求 | `returned-to-proof` + `returnedToProof` 系统行（不按旧报告通过） |
| `dispatched` + 当前 flow revision ≠ 记录 revision | `returned-to-proof`（候选不符，不按旧候选报告放行；需对新候选重新请求） |
| 报告缺 `acceptance-triage/v1` / 段坏 / 矛盾 | `returned-to-proof`（`reportMissing` 或 `returnedToProof`）；不返工、不标 done、不猜 |
| `pass`（可带 minor/nit） | `completeGateStep`（应用专用：最新报告复核 + `artifact.observed{app,app}` + gate 步骤 done，幂等）⇒ 记录 `passed` + 账本 `gate.review(pass)`（`gateId+reportSha256` 幂等）+ `passNote` 系统行；下游 `dependsOn` 放行（应用不自动派下游） |
| `fail`/`conditional` 含 blocker/major | 记录 `failed` + 账本 `gate.review(fail)` + `failNote`；按 gate 独立返工路由 `.ans/.../gates/<gateId>-rework-routing.json`（`gate-rework-routing/v1`，`source:"proof"`, `sourceDetail:"gate-review"`, 报告 sha/items/严重度）把唯一一条返工任务交主理（`buildAcceptanceReworkTaskMessage` + `gate` 指针，要求返工后**显式**再次 `request_gate_review`）；gate **保持 pending**、不标 done |
| `fail` 仅 minor/nit | 记录 `returned-to-proof` + `nitOnly` 系统行；**不返工**、不判通过、不写 `gate.review`（客户防吹毛求疵） |
| `passed` + gate 步骤仍 pending（崩溃窗口） | 导入/真实事件时幂等重跑 `completeGateStep`；补 `gate.review`（若缺） |
| `failed` + 返工路由未写/未发送 | 下一次真实事件补写/重试一次（记录 `failed`/`pending`）；已 `sent` 不重复任务 |
| `returned-to-proof` | 同报告不重复退回；出现新版本/新路径/新 sha 时按新一轮处置 |
| `superseded`（gate 步骤已被 supersede/移除） | 不执行旧处置；新 gate id 走新记录 |
| 记录损坏/未知 schema | fail-closed：不自动执行、不派发、不标记通过；主理如实系统行 + 诊断 |

硬边界：gate 结论**不写** `customer.decision`、不进 `latestAcceptanceDecision`/验收分诊/验收卡；gate `pass` ≠ 最终验收通过；`gate.review` 只做审计与幂等，不是完成证据的替代（完成事实是 flow 步骤 `done` + `artifact.observed`）。

## 四、会话注入

`SessionManagerDeps.requestGateReview` + `openRoleSession` 入参能力位；注入判据 `role.builtIn === true` 且 `governanceFunction === "schedule"`（convener）。项目角色、Liaison/Rapporteur/Nominator/Verifier、single/su 一律不注入（能力缺席＝工具不注册＝最强 fail-closed；编排侧再按内置角色/治理职能收口）。`request_acceptance` 的既有注入范围与语义**零变化**。

## 五、与设计的取舍/偏差（如实登记）

1. **记录先于账本写**：设计 §5.3 第 12 条列「账本 + gate 记录」，未固定先后。本实现先原子写 gate 记录、再写账本——记录是重启恢复的唯一扫描源；若账本写失败而记录已写，仍可处置报告且重复请求不会重派（记录 `dispatched` + 同 revision ⇒ `already-dispatched`）。写失败一律 `unavailable`，不声称已派发。
2. **criteria「结构合格」采用机械子集**：桌面未复制编排 `validateAcceptanceCriteriaText` 的完整 7 条规则（该函数未在 Pipeline 公共出口提供）；本实现检查「存在/非空 + 含精确 gateId 的标题 + `| ID |` 判定表」，完整标准结构仍由既有派发门/标准收口路径保证。未改编排文件（按任务要求先如实报告）。
3. **policy：gate 处置仅在 trio 项目执行**（gate 通道只注入 convener，记录只能由本能力创建）；不改变 single/su 行为。
4. **`reportVersion` 期望**：新派发取「现有最新报告版本 + 1」；报告版本早于期望 ⇒ 退回 Proof（不按旧报告通过）。
5. **visual/integration 证据步骤 id 采用机械形状匹配**（`verification-evidence*`/`demo*` 等；`integration|e2e|reduce`；`performance|perf|性能`）；内容/截图质量归 Proof。

## 六、客户追加规则：主理收到系统消息只向客户汇报（同批）

- `buildGovernanceCoordinationTaskMessage` 末行由「请按你的职责协调统筹与项目 worker…」改为「**这是系统通知：只向客户汇报；不要给统筹 / 项目 worker 派发任务，等客户指示。** 不要替客户批准、不要自行标 done、不要编辑/代批/改判验收结论。」；标题改为「阶段通知」；revision 行改为「供核对；如需事实可 flow_get 读取」（不再要求先协调）。
- gate pass/fail/returned/nitOnly/reportMissing 等系统行均只陈述事实与报告路径，不含要求 Lead 派任务/派统筹的措辞；`main.gateReview.reworkTask` 文案作为 gate 返工**任务**首行（不是系统行）。gate 返工任务仍按设计 §8.2 交主理组织（复用既有验收返工接收方语义），返工任务要求统筹在返工后显式重新请求 gate 复核，并在任务中标注 minor/nit 非阻断。
- 未改门禁角色卡/编排 prompt（其他属主在改；`governance-roles.ts` 的 Lead 卡已由门禁属主同步新规则）。

## 七、验证

- `npm run typecheck`：0 错。
- `node --test "test/桌面应用/**/*.test.ts"`：**663/663 通过**（含 `acceptance-dispatch.test.ts` 86/86，本批新增 12 例：路径单一来源、派发成功/幂等、校验矩阵、注入矩阵、visual/integration 证据、pass 处置、fail 返工、minor/nit 退回、缺/坏报告、重启恢复 ×2）。
- `test/桌面应用/interface.test.ts`：137/137（协调系统消息断言已按新文案更新）。
- 既有 `request_acceptance` 用例零修改通过；未新增 `FlowStepKind`（`FLOW_STEP_KINDS` 不含 `gate`）与 cardKind。
- 未运行真实 Electron e2e；未重启应用；未 commit/push。

## 八、残余风险

- 报告无机器字段绑定候选：以路径 + gate 记录 `flowRevision` + flow 变更即退回 Proof 缓解；flow 变更后旧候选报告不会放行，但需重新请求 gate 复核（设计 §9.5 已接受）。
- 账本/gate 记录/gate.review 写入失败按 `unavailable`/诊断如实降级；报告已存在但写盘持续失败会停留在 `dispatched`，需下一次真实事件或人工核对。
- 在途工作检查可能因 Lead→Steward 派发轮次（origin 带 flowId）暂时返回 `unavailable`（设计允许稍后重试）。
- 系统行去重为进程内存；重启后同一事实会再提示一次（如实、不伪造）。
