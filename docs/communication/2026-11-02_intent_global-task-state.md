# 意图确认：给幕僚一个可管理的全局任务状态

- 日期：2026-11-02
- 提出人：客户
- 记录角色：ANS 沟通（Communication）
- 闸门 0 状态：**已确认（2026-11-02）**
- 闸门 2 状态：**已确认 + 实施授权（2026-11-02）**
- 变更类型：产品工作流/任务状态能力修订；预计风险档位 **T2/T3**（由策划定档）

## 客户原话

> 这个没有全局的任务状态吗，这个全局的任务状态，让幕僚来管理，不然的话，一直出现这种情况也是尬

## 意图理解

给内置幕僚（chief）一个**项目级、跨 flow 的全局任务状态**，由幕僚管理：能看到当前生效的 flow/run、阶段、所有任务及状态、阻塞与卡点、版本/证据指针和下一步；能据此停止重复换 flow、避免版本/验收循环，并把工作流推进到收口。其他角色只读或按需读取；应用仍是机器事实的权威来源。

## 现状（只读核查，2026-11-02）

- 已有项目级任务账本 `.ans/state/tasks.jsonl`（app-only、append-only；事件含 task/request/approval；角色不可写；`src/common/编排/task-state.ts`）。
- 幕僚现有工具/能力：`dispatch_task`、`redispatch_task`、`terminate_role_run`、`role_status`、`session_tail`、`role_activity_log`、`contract_check`；**没有直接读取/管理全局任务账本的入口**。
- run manifest 按 flow/run 分开；没有跨 flow 的「当前生效 flow/阶段/阻塞」项目级状态。
- 本次修仙游戏 dogfooding 中，幕僚在方案验收卡被 judge 以「规范物证缺失」退回后，连续新建 `xianxia-brotato`、`xianxia-brotato-b`、`xianxia-brotato-c` 三个 flow；文档版本堆到 proposal v1–v7、roster v1–v14，但没有一个全局状态告诉它「当前哪个 flow 生效、卡在哪个阶段、应该修什么而不是换 flow」。

## 补充：幕僚能否选择「重开」（2026-11-02）

- 现状：run-change 三模式卡（`continue-frozen` 推荐 / `stop-and-restart` / `stop`）由应用构造，决定者是客户或「替我决策」判断 agent；**chief 没有 run-change 决策工具**；`request_requirement_change` 只注入 rapporteur/convener，chief 只有 `dispatch_task`/`redispatch_task`/`terminate_role_run`。
- 本次修仙 run 的三个 run manifest 都是 `draft`，不是 pinned，run-change 不适用；方案卡被 judge 以「规范物证缺失」退回属于验收物证问题，chief 没有 sanctioned restart，只能新建 flowId（`-b`/`-c`）。
- 待方案决定：全局任务状态是否包含幕僚可发起的**受控重开/修复**动作（仍受申请≠批准、客户/judge 决定、审计约束），以及它与 run-change、新 flow 的关系。

## 补充：幕僚的版本决策权（2026-11-02）

- **客户原话**：「给幕僚一定的权力，选择是版本修改，还是新版本开发。给幕僚一定的权力把」
- **意图理解**：在流程因版本/引用/验收证据卡住时，给幕僚一个受控的决策权——
  - **版本修改**：在同一 flow/run 内让策划出 `-vN+1`、修引用/名单/架构，继续当前 run；
  - **新版本开发**：新建 flow/run/版本，重新走流程；
  - 选择时记录理由、依据与审计；不再用 ad hoc 新建 flowId、反复 redispatch 或空转绕行。
- **现状**：chief 只有 `dispatch_task`/`redispatch_task`/`terminate_role_run`/`role_status`/`session_tail`/`role_activity_log`；没有 run-change 决策权，不能直接选择重开/新版本；版本化文档由角色写，chief 禁写 `docs/proposals|contracts`；本次修仙 run 的 `xianxia-brotato-b/-c` 就是 ad hoc 新建 flowId。
- **待方案决定**：
  - **权限层级**：幕僚直接决定 / 幕僚发卡由客户或「替我决策」代选 / 仅向客户建议；
  - **触发条件**：版本/引用/验收证据卡住、当前 run 为 draft/pinned、失败/拒绝达到什么阈值；
  - **作用域与边界**：同 flow 版本修改 vs 新 flow/run；与 run-change 三模式、客户闸门、申请≠批准、验收/证据规则的关系；
  - **审计/回滚/UI**：记录选择理由与依据、可回看、可撤销/切换；卡片或状态面板如何呈现。
- **非目标（默认）**：不改变验收结论、证据规则、写权/边界；不自动修复当前修仙 run；不把「新版本开发」变成绕过客户确认或规避验收。

## 范围与待确认
- **Q1 形态**：
  - A. 扩展现有 `tasks.jsonl`：给幕僚一个应用代理的只读全局视图 + 受控动作（关闭/重开/标记阻塞），单一事实源；
  - B. 新增幕僚-owned 项目状态文档（当前 flow/阶段/阻塞/下一步），机器账本仍由应用写；
  - C. 只给幕僚只读全局视图（不改写权）；
  - D. A+B 结合。
- **Q2 管理动作**：只读、注释/标记阻塞、推进阶段、关闭任务、切换/放弃 flow——哪些允许，哪些仍需客户/应用？
- **Q3 写入权威**：继续 app-only 账本 + 幕僚通过应用工具提交受控事件，还是允许幕僚直接写状态文档？不得绕过审计。
- **Q4 作用域**：项目级（跨 flow）还是 per-flow；与 run manifest / 现有 flow 的关系。
- **Q5 展示**：UI 任务/决策面板、聊天系统行、幕僚卡文本如何呈现；其他角色如何读取。
- **Q6 兼容**：旧任务账本/旧 flow/旧 run 迁移；不改验收判定/证据规则/写权边界。

## 非目标（默认）

- 不改验收判定、规范物证/证据路径规则、写权与角色边界；不自动修复当前修仙游戏 run；不改变客户闸门/审批链；不把沉默/默认当客户确认。

## 已授权边界

- **已授权**：闸门 0 意图确认与只读调查。
- **未授权**：方案（闸门 1）、团队计划（闸门 2）、实施、提交/推送/发布。

## 下一步

1. 客户确认/修正本意图（闸门 0）。
2. 沟通启动策划上下文出方案（形态、写入权威、管理动作、与 tasks.jsonl/run manifest 的契约、UI/角色卡、测试与验收标准）。
3. 独立复核 → 闸门 1；统筹团队计划 → 闸门 2；实施授权后派发。

## 闸门 0 确认记录（2026-11-02）

- **客户确认**：原话「给幕僚一定的权力，选择是版本修改，还是新版本开发。给幕僚一定的权力把」；权限层级选择 **「发卡确认」**（幕僚提出选择，应用发 decision 卡，由客户或「替我决策」代选后执行）。
- **确认内容**：全局任务状态（跨 flow 的当前 flow/阶段/任务/阻塞/版本指针/下一步）+ 幕僚的版本决策权（版本修改 vs 新版本开发），以发卡确认方式行使；保留申请≠批准、审计、验收/证据/写权边界；不自动修复当前修仙 run；不把新版本开发变成绕过客户确认。
- **授权状态**：已确认意图并授权启动策划方案；未授权实施、提交、推送、发布。

## 客户预授权（2026-11-02）

- **客户原话**：「我都同意，等下搞好了，直接安排去修改」
- **解读**：客户同意本次「全局任务状态 + 幕僚版本决策权」按方案推荐项推进；方案与团队计划写盘后，不再单独请示闸门 1/2 与实施授权，直接安排实施。
- **条件**：方案/团队计划必须保持在已确认意图、推荐选项、既定写权/边界内；如出现实质范围、角色/边界、权限、风险档位或未确认选装变化，停止并重新请示；**提交/推送/合并/发布仍另行授权**。
- **记录**：作为闸门 1/2 与实施授权的客户预确认；方案/团队计划写盘后由沟通核对一致再引用。

## 再复核与预授权核对（2026-11-02）

- **方案 P1.1**：1283 行 / `369f666acb76ac88fe30854d84b2f08f3148a55c9ff53958185310ef5c3af910`。
- **复核记录**：148 行 / `22128e59904ab8de10ede64f7acc478069c752198fc3b87c043f5dab4434c5a8`（P1.0 快照 103 / `3b8d3a3a…` + P1.1 再复核节；结论 **建议提交客户确认**）。
- **关闭情况**：F1–F13 基本关闭；剩余 R1/R2 一般（active run 仍依赖 all-or-nothing 的 `findActiveRun`；中止/超时审计语义在时序图/契约/AC 间仍漂移），R3–R5 建议（执行期 pinned 的 uncertain、关闭旧 run「全部」措辞、复核记录引用更新）。均不改变方案范围、Q1–Q6 A、O1–O11 默认不实施、T3。
- **预授权核对**：客户「我都同意，等下搞好了，直接安排去修改」覆盖本方案与推荐项；R1–R5 如实披露并作为实施约束；若团队计划需要新增角色、改边界/权限或改变风险档位，停止并重新请示。
- **下一步**：直接交统筹写团队计划；不需要重复闸门 1 请示（预授权范围内）。

## 闸门 2 材料（2026-11-02，待客户确认）

- **团队计划**：`docs/scheduling/2026-11-02_team-plan_global-task-state.md`，477 行，SHA-256 `06d29aaf940b9b66062420a9926c9c1764b0aaf12757f785383ce5c0d6359d62`。
- **五维结论**：**保留现有角色，不新增/拆分/合并；T3 不降档**；另有 **B-1/B-2 两项精确边界变更**与 P1.2 文档收口。
- **角色与写集（摘要）**：
  - 运行时核心 A0：`src/model/project-state.ts`（新，B-1）、`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`schema.ts`。
  - 编排 A1：`src/common/编排/{task-state,project-state,version-decision}.ts`、`src/pipeline/orchestration/run-role.ts`；`test/编排/{project-state,version-decision,task-state,run-manifest,decision-card}.test.ts`。
  - 桌面窗口 A2：`app/desktop/{session,interface}.ts`、`app/main.ts`、`app/preload.cjs`；`test/桌面应用/{project-state,version-decision,chief-workflow}.test.ts`（前两个新，B-2）。
  - 桌面UI A4：`app/renderer/src/chat/{TaskCenterPanel,ProjectStatePanel}.tsx`、`lib/platform.ts`、`shell/shell.css`；`test/桌面UI/project-state.test.ts` + phase4b E2E 夹具按需。
  - 项目管理 A3：i18n 中英 + `test/项目管理/shared/i18n.test.ts`；P1 实现提案审核。
  - 装配 A5：`README.md`/`README.en.md` 事件清单；测试 D1 T3 全量/E2E/证据；人事 H1 边界；策划 P1.2 方案收口；内置独立验收 V1/E2；统筹/沟通。
  - 不参与：产品/宣传/UIUX/门禁引擎/各适配器/项目独立验收 worker；角色卡文本不改（独立事项）。
- **边界变更（闸门 2 对象）**：
  - **B-1**：运行时核心 `boundary.md` + `boundary.yaml` + `changelog.md` 新增 `src/model/project-state.ts`（共享 Model 类型）。
  - **B-2**：桌面窗口 `boundary.md` + `boundary.yaml` + `changelog.md` 新增 `test/桌面应用/project-state.test.ts`、`test/桌面应用/version-decision.test.ts` 两个精确测试文件。
  - 除 B-1/B-2 外无其它边界变更；无新增角色/id/显示名/职责变更，无其它权限扩大。
- **阶段**：G2 → H1/P1.2/V1/B0（并行）→ P1 实现提案+项目管理审核 → A0 运行时核心契约 → A1 编排纯逻辑 → A2 桌面窗口接线（A3 i18n 可并行）→ A4 桌面UI → A5 README/E2E → D1 T3 回归 → E1 变更包 → E2 独立验收 → E3 记录；契约先行、共享文件单写者；B-1/B-2 前不创建新文件。
- **R1–R5 实施约束**：R1 部分 manifest 扫描/active 派生，补坏+好 manifest 测试；R2 超时 resolved vs 中止 orphaned 语义统一到时序图/契约/AC；R3 执行期 pinned 明确 failed/uncertain 终态并排除 orphaned；R4 关闭旧 flow 全部活动 run；R5 引用标注 P1.0 快照 103/`3b8d…`。均已写入团队计划 §1.2/§六/§七。
- **验收安排**：T3；V1 由内置独立验收在实施前按 P1.1 写盘（沟通另起唯一验收主上下文）；E2 判定；证据含 T3 全量回归 + 双端 typecheck/build + 可跑 Electron E2E；最多截图、不录屏。
- **预授权核对**：方案范围、Q1–Q6 A、C1–C7 推荐、O1–O11 不实施、T3 均在预授权内；**B-1/B-2 是边界变更，超出既有 Section 1，需要本次客户确认**。P1.2 仅方案 doc-only 窄收口，需沟通核对；若实质改范围/契约/AC/档位则重开闸门 1。
- **替代方案**：若客户不接受 B-1/B-2，团队计划 §9.2 给出 fallback（类型放编排目录/扩展现有桌面测试），需重新核对写集与闸门 2，不默认切换。

## 闸门 2 确认与实施授权记录（2026-11-02）

- **客户确认**：原话「确认闸门 2：团队计划含 B-1/B-2；按该计划与 P1.1 实施；不含提交/推送/发布。」
- **确认对象**：团队计划 `docs/scheduling/2026-11-02_team-plan_global-task-state.md`（477 行 / SHA-256 `06d29aaf940b9b66062420a9926c9c1764b0aaf12757f785383ce5c0d6359d62`）。
- **确认内容**：参与角色与精确写集（§4.1/§4.3）；**B-1**（运行时核心新增 `src/model/project-state.ts`）与 **B-2**（桌面窗口新增 `test/桌面应用/project-state.test.ts`、`version-decision.test.ts`）（§4.5）；T3；阶段顺序（§五）；P1.2 窄收口；V1/E2 与证据口径（§七）；非目标与越界规则（§八）。
- **实施授权**：已给出——按团队计划与 P1.1 实施，阶段 G2 → H1/P1.2/V1/B0 → P1（提案+项目管理审核）→ A0 → A1 → A2（A3 并行）→ A4 → A5 → D1 → E1 → E2 → E3；不扩大写集/边界/方案默认项；**提交、推送、合并、发布不在本次授权内**。
- **派发前置核验**：闸门 2 ✔；B-1/B-2 客户已确认 ✔；P1.2 由策划窄收口后经沟通核对；V1 由内置独立验收在实施前写盘；B0 基线由测试角色采集；H1 按 §4.5 执行。
- **下一步**：启动 H1/P1.2/B0（并行）；P1.2 核对后启动 V1；V1+B0+H1+P1.2 齐备后进入 P1 实现提案与项目管理审核，随后 A0→A1→A2→A4→A5→D1→E1→E2→E3。

## 前置节点核对记录（沟通，2026-11-02）

- **H1（人事）放行**：6 个边界文件 +20/−0；运行时核心 16/16 条、桌面窗口 79/79 条，md/yaml 同序一致；`boundary-yaml` 与 `boundary-yaml-validation` 测试 **17/17 通过**；`src app test` 无改动；变更内容与团队计划 §4.5 B-1/B-2 完全一致。
- **B0（测试）放行**：记录 `角色卡/测试/docs/change/2026-11-02_global-task-state-B0-baseline.md`（167 行 / SHA-256 `5c275332f38ba3c8c3f1ad51dcd72df62ef92e2a2523779441d678f6bf02aa58`）；HEAD `0a12310`；`src app test` 无改动；`npm run typecheck` exit 0；受影响套件 **44/44**；phase4b Electron smoke **64 checks / 0 failures**（13 张截图）；`test/pi-adapter/write-sequencing.test.ts` 按既有决定排除并记为未验证。

## P1.2 核对记录（沟通，2026-11-02）

- **对象**：`docs/planning/2026-11-02_design_global-task-state-version-authority.md` P1.2，**1302 行**（原 1283，+19），SHA-256 `1573e1ef7b88dece485f6eab29d657181e1afd61a02849a29c7a7592af5bebfb`。
- **核对结论**：只属 R1–R5 窄收口；Q1–Q6 仍全 A、C1–C7 推荐不变、O1–O11 默认不实施、§1.4 非目标与 §10.3 T3 未变；R2/R4/R5 与 R1/R3 披露落在团队计划 §六要求的位置（§4.3/§4.4/§4.6/§7.2/§8.4/AC-1.4/AC-5.2/AC-5.6/AC-7.1/AC-8.3/AC-8.5/§9.1/§13）；复核记录 148 行 / `22128e59…` 未被改写。
- **判定**：P1.2 通过沟通核对，作为实施与 V1 的基线版本（与团队计划一并）；无需重开闸门 1；客户实施授权覆盖本窄收口。V1 已按此启动。

## V1 核对记录（沟通，2026-11-02）

- **对象**：`docs/acceptance/global-task-state-criteria-v1.md`，**907 行**，SHA-256 `b6c23c78486239a6aec1abe3f6118a2d3a83716dcc9d443299cabd58598b77ab`。
- **核对结论**：AC-1–AC-10 与方案 P1.2 §9.2 一一对应，子项（AC-1.1–1.8、2.1–2.4、3.1–3.8、4.1–4.6、5.1–5.6、6.1–6.7、7.1–7.5、8.1–8.6、9.1–9.5、10.1–10.3）未拆分/删减/弱化；R1–R5 逐条映射到 AC 与测试证据（§四）；T3 全量回归（受影响套件 + 全量 + 双端 typecheck/build + Electron E2E，排除项须记录）与证据复用/失效、pass/fail/insufficient evidence/not applicable 判定、版本冻结齐备；`src app test` 无改动。
- **判定**：V1 通过沟通核对，作为实施前验收标准；E2 由同一内置独立验收主上下文判定并写唯一报告。P1 入口（V1+B0+H1+P1.2）已齐备。

## P1 提案与审核记录（沟通，2026-11-02）

- **提案归档**：`docs/communication/2026-11-02_p1-proposals_global-task-state.md`（358 行 / SHA-256 `00e334f7694cfcd49c6defd21f5336696b8e2f38fea2935dacf45a3b79c1173c`）——A0/A1/A2/A4 四份 P1 短提案 V0（均只读报告、未写文件）。
- **项目管理审核**：`角色卡/项目管理/docs/change/2026-11-02_global-task-state-P1-review.md`（271 行 / SHA-256 `cca102df50cbd3783f614c7913b0137cf72282768280bf13b40996317d4e78ce`），总体结论 **`needs revision`**（四份均需窄修订；未发现范围/T3 实质扩张）。
- **沟通裁决（写集内，非客户事项）**：
  - **A4 写集缺口**：不新增 `app/renderer/src/chat/project-state-view.ts`（团队计划 §8.11 未列路径，不重开闸门 2）；采用 PM 首选列内替代——纯解析/视图函数放 `app/renderer/src/lib/platform.ts`（在写集内、Node 可导入）。风险档位与权限不变。
  - **A2 IPC 收窄**：本任务 preload/main 只新增 `project-state:get`；不暴露 `project:note`/`version-decision:request` 写桥（O4 未选，避免渲染层绕过幕僚会话形成第二写路径）。这是对团队计划括号项的收窄，不是权限扩大；沟通记录在案。
  - **PM 技术裁决 31 点**（A0-1–9、A1-1–8、A2-1–6、A4-1–8）全部采纳，作为返工依据；其中 A1-5 `acceptance-rework` 收窄（只按 acceptance reject/可选 task.closed(rework) 派生）与 A2-3 执行侧 `ensureDraftRun` all-or-nothing 限制，需在 E1/E2 披露，若 V1 解释不同则停止澄清。
- **返工**：已按审核 §二/§七向 A0/A1/A2/A4 发出窄修订要求（A4 走 `platform.ts` 替代）；修订完成后交项目管理窄复审，通过前不进入 A0 实施。

## P1 复审记录（沟通，2026-11-02）

- **复审对象**：四份窄修订（归档 `docs/communication/2026-11-02_p1-proposals_global-task-state.md`，454 行 / SHA-256 `cf1eb8942fa93932da3c8cf33e63fa53b1e6c914e35ab414c926b91f1ac33dcd` 的「修订记录」节）。
- **审核记录更新**：`角色卡/项目管理/docs/change/2026-11-02_global-task-state-P1-review.md` 追加复审节后 **315 行 / SHA-256 `339c875b0f032243c77f055f18c70705ab89195fd19878794ee3e1ff2479790a`**（原文未改写）。
- **复审结论**：**`recommend approval`**，可进入 A0。A0/A2/A4 通过；A1 有条件通过。
- **唯一剩余必须项（不阻断 A0，A1 开工前落实）**：
  - **P1-GTS2-01**：A1 必须 `import type { ProjectStateError } from "../../model/project-state.ts"` 并删除本地定义；`scanRunManifestsForState.errors`/`buildProjectStateView.errors[]` 统一用 A0 类型（source 五值 `tasks|run-manifest|docs|roster|modules`，`{source;message;file?;line?}`）；A1 实施报告提供 import/typecheck 证据，D1/E1 核对；不需再次 P1 复审。
- **非阻断实施注意**：
  - P1-GTS2-02：A1 `versionDecisionRequestId` 需接受无 run subject（或 A2 直接生成两式）；`ProjectStateTask.from` 按必填对齐。
  - P1-GTS2-03：A4 按 PM §六冻结的 62 个 `ui.projectState.*` 名称实施，不用 V0 §4 的别名列表。
  - P1-GTS2-04：A4 用 `counts.unclosed` 对任务中心/listTasks fixture 断言，不引用不存在的 `payload.unclosed`。
- **下一步**：A0 实施（运行时核心 4 文件）；完成后 A1（先落实 P1-GTS2-01）→ A2 → A3/A4 → A5 → D1。

## 实施记录 A0–A5（沟通，2026-11-02）

- **A0 运行时核心**：`src/model/project-state.ts`（新，414 行 / `8e5a9145120e6778711bd721f1ebc494f49ba04c2d63095b265bbcc1e74d4945`）；`src/model/runtime.ts` 2728 / `014e0b0cf214f765f3b700335976d904109b8facf0d88f3f4323aef117dccc4e`；`src/provider/runtime/tools.ts` 3648 / `dfa3fb4fe1fa58bc92fdceac0d6eef5862c39c2534add372c00662bb78e3bac0`；`src/provider/runtime/schema.ts` 1418 / `2da78f7c6462875c6789067ca9cfd7e814dd527f71cd4de993d611c2f6106654`。类型 0 错误；事件接口在 `runtime.ts`，`project-state.ts` 无 runtime 反向依赖；三工具注入才注册、schema 三支、`note`/`version` sequential。
- **A1 编排**：`task-state.ts` 839 / `4cb100b1…`；`project-state.ts` 1155 / `6f9e6467…`；`version-decision.ts` 493 / `978e6d9f…`；`run-role.ts` 2473 / `e8c1cf26…`；5 个测试文件（新 2 + 扩展 3）。**45/45 测试、typecheck 0**；`run-manifest.ts`/`decision-card.ts` 零改动；P1-GTS2-01 已改为 `import type { ProjectStateError } from "../../model/project-state.ts"`；R1 坏+好 manifest、R2 四类、R3 F5、R4 全部活动 run 用例均过。
- **A2 桌面窗口**：`session.ts` 8790 / `86c84c4d…`；`interface.ts` 2636 / `8d981705…`；`main.ts` 1127 / `1e5cf23a…`；`preload.cjs` 419 / `f1c38c1f…`；`chief-workflow.test.ts` 202 / `8cc03eac…`；`project-state.test.ts` 330 / `104c8fb3…`；`version-decision.test.ts` 750 / `53b85c29…`。**要求套件 27/27、全部桌面应用测试 489/489、typecheck 0**；IPC 只新增 `project-state:get`；`run-change*.test.ts` 零改动。
- **A3 项目管理 i18n**：`zh-CN.ts` 2072 / `299e619c…`；`en-US.ts` 2340 / `4aa73f8f…`；`i18n.test.ts` 415 / `71108865…`。新增 97 key（62+18+17），计数 **ui 1001 / main 576 / shared 62 / preferences 3 = 1642**；i18n/guard **16/16**，violations 0；typecheck 0。
- **A4 桌面UI**：`TaskCenterPanel.tsx` 317 / `6616d4a8…`；`ProjectStatePanel.tsx`（新）261 / `749d5468…`；`lib/platform.ts` 590 / `b7c2c7a2…`；`shell.css` 3506 / `2b76fa8f…`；`test/桌面UI/project-state.test.ts`（新）474 / `e47ea39b…`；phase4b smoke/preload 夹具按需更新（未运行，留 D1）。UI 测试 **10/10**；`typecheck:renderer`/`build:renderer` 0；未新建 `project-state-view.ts`、未加 `projectNote?`。
- **A5 装配**：`README.md` 339 / `d2c77e78…`；`README.en.md` 339 / `51b1796b…`；仅事件清单行加入 `project.focus`/`project.note`/`version.decision`，其余未动。
- **已披露限制（E1/E2 须核对）**：
  1. A1 `acceptance-rework` 只按机器事实（acceptance request reject；可选 `task.closed(rework)`）派生，不实现设计 §3.4「未收口返工任务」文本推断（PM A1-5 裁决）。
  2. A2 新版本开发创建侧 `ensureDraftRun` 仍经 all-or-nothing `findActiveRun`：无关坏 manifest 时如实 `execution-failed`（PM A2-3 接受）；崩溃对账更保守（要求新 flow/run 存在、旧 flow 无 active、且存在 `project.focus(sourceDecisionId)`，否则 `uncertain`）。
  3. A4 面板未单列 `notes[]`（PM §六 62 key 无 `section.notes`）；notes 信息由 blockers `chief-note` 与 nextStep 覆盖，payload 契约不变。
  4. A2 `project_state` 工具摘要用 A1 默认机器可读标签；A3 未冻结摘要标签 key（UI/卡面/系统行已走 A3 key）；`projectNote` 回执沿用既有中文风格并通过 i18n-guard。
- **下一步**：D1（T3 全量回归 + Electron E2E + 证据），随后 E1/E2/E3。

## D1 记录（沟通，2026-11-02）

- **记录**：`角色卡/测试/docs/change/2026-11-02_global-task-state-D1-regression.md`（316 行 / SHA-256 `8a75e5996fd49ab7b57041b9e66be93582567b7ca0c8a7a2df7abd45fd21b13c`；status `needs-work`）+ 证据目录 37 文件。
- **候选**：HEAD `0a12310`，32 文件（30 src/app/test + README 2）与团队计划写集精确匹配；逐文件哈希 32/32 稳定；staged 空。
- **门禁/受影响套件**：`typecheck`/`typecheck:renderer`/`build:renderer` 均 0；受影响套件 **98/98**（编排 45、桌面窗口 27、i18n 16、桌面UI 10）；i18n 计数 1642、guard violations 0。
- **T3 全量**：393 文件、**3461 tests / 3433 pass / 10 fail / 18 skipped**（289.2s，exit 1）。9 项为既有 Windows symlink EPERM（与 2026-10-30 基线一致）；**1 项本次新增确定性失败**：`test/测试/entry-role-minimal-d.test.ts:153` D-04「撤除残留」，候选在 `src/model/project-state.ts`、`src/common/编排/project-state.ts`、`app/renderer/src/lib/platform.ts` 引入 blocker kind 名 `acceptance-rework`，命中 2026-10-28 D 批治理机器撤除的残留守卫正则；`git grep HEAD -- src app` 为 NONE，单文件复跑确认确定性。**未修复、未改断言**。
- **Electron E2E**：exit 0，**PASS 69 checks / 0 failures**（含 A4 新增 project-state 断言），console/CSP 0，14 张截图（新增 `phase4b-project-state.png`）。
- **处置**：不放宽 D-04 守卫；已请项目管理裁决将 blocker kind 重命名为不冲突 id（建议 `rework-pending`）及受影响 owner/文档更正。修复后 D1 证据失效，须重跑全量/E2E 重新出包。E1/E2 暂缓。

## D-04 裁决与返工记录（沟通，2026-11-02）

- **项目管理裁决**：**采用改名，不改守卫、不放宽断言**。`acceptance-rework` → **`rework-pending`**（blocker kind id 与 `blockers[].id` 前缀同步改；语义仍为验收退回/返工信号，UI 文案不变）；i18n key `ui.projectState.blocker.kind.acceptanceRework` **保留**（key 名不含被禁 token，A3 的 62+18+17 冻结表与 i18n 测试不动）；**不重开闸门 1/2**（内部枚举 id 命名更正，行为/范围/权限/写集/T3/UI 文案/i18n key 均不变）。
- **返工 owner 与范围**：
  - A0：`src/model/project-state.ts` 的 `ProjectStateBlockerKind` 改 `"rework-pending"`；typecheck。
  - A1：`src/common/编排/project-state.ts` 的 `BLOCKER_KIND_ORDER`/注释/`blockers[].id` 前缀/`kind` 字面量；`test/编排/project-state.test.ts` 字面量；测试 + typecheck。
  - A4：`app/renderer/src/lib/platform.ts` 的 `BLOCKER_KIND_KEYS` key 改 `"rework-pending"`（value 仍 `ui.projectState.blocker.kind.acceptanceRework`）；补 id→key 映射断言；UI 测试 + `typecheck:renderer`/`build:renderer`。
  - A2：源码/测试无该字面量，不改；仅跑 `test/桌面应用/project-state.test.ts` 回归。
  - A3：不改。
  - 策划：P1.3 窄更正（设计 §3.4 的 kind 字面量 + 注记；语义/范围/T3 不变）。
  - 独立验收：V1.1 窄更正或书面解释（AC-1.1 枚举旧 id；接受 `rework-pending` 为同一 blocker，不弱化 AC；E2 报告注记映射）。
  - 沟通/统筹：本记录；提案归档追加 D1 注记；E1 列改名与新候选哈希，E2 引用。
- **D1 重跑**：旧 D1 证据对旧候选失效。重跑 `test/测试/entry-role-minimal-d.test.ts`（预期 6/6）、`grep -R "acceptance-rework" src app` 必须 NONE、三处 project-state 套件、双端 typecheck/build、T3 全量（排除 `write-sequencing.test.ts` 并记原因）、重建后 Electron E2E；E1/E2 记录新候选哈希与失败分类。

## D1 重跑结果（D-04 返工后，2026-11-02）

- **新记录**：`角色卡/测试/docs/change/2026-11-02_global-task-state-D1-rerun-regression.md`（323 行 / SHA-256 `c36b72776d954323784932d608f770f0642f8f0b42e173c208c73efda107bb96`，status `verified`）；旧 D1 记录与证据已标 `superseded`，结论不得沿用。
- **候选**：HEAD `0a12310`；32 文件与团队计划写集精确匹配；相对第一次 D1 仅 5 文件变化（A0 `project-state.ts` 417/`61d77932…`；A1 `project-state.ts` 1156/`a082f0d2…`、测试 465/`ba996417…`；A4 `platform.ts` 590/`604a0aef…`、UI 测试 493/`d0b6d244…`）；P1.3 1303/`7faa3e8b…`、V1.1 915/`fe48dc32…`。
- **门禁/套件**：`typecheck`/`typecheck:renderer`/`build:renderer` 均 0；受影响套件 **99/99**；D-04 守卫 **6/6**；dist 旧 token 0、新 token 1。
- **T3 全量**：393 文件、**3462 tests / 3434 pass / 10 fail / 18 skipped**；失败 = 9 项既有 Windows symlink EPERM + 1 项间歇性 TEMP cleanup EPERM（单文件复跑 12/12 与 11/12、第一次 D1 通过、不涉候选 → 非确定性环境 flake）；**新增确定性失败 0**；`write-sequencing.test.ts` 排除并记原因。
- **E2E**：**PASS 69 checks / 0 failures**，14 张截图，console/CSP 0。
- **下一步**：E1 变更包（统筹）→ E2 独立验收（V1.1）→ E3。提交/推送/合并/发布仍未授权。

## E1/E2/E3 记录（沟通，2026-11-02）

- **E1 变更包**：`docs/scheduling/global-task-state-change-v1.md`，**401 行 / SHA-256 `8f94d66a3b8986a0a8b2fdf3b08ea18fcf3025fbfc200e9d73d365d432ff6f91`**；候选 32 文件、快照 `c767983094cadd2948f346ffd66c2de0ad2977dc7248c987ac5853f90e834ea9`；节点 G2–E3、证据链接、T3、复用/失效、已知限制齐备。
- **E2 独立验收**：`docs/acceptance/global-task-state-report-v1.md`，**304 行 / SHA-256 `ec5212923cde3109ee57fae2c1d984dbe1354354e82b19d503222634d9efaa6d`**；结论 **通过（当前候选满足 V1 v1.1）**；AC-1–AC-10 全部 pass、R1–R5 全部满足，无 fail/insufficient evidence。E2 独立复跑受影响套件 **99/99**、D-04 守卫 **6/6**、`typecheck`/`typecheck:renderer`/`build:renderer` 均 0、phase4b Electron E2E **69/0**（14 截图）；复用 D1 重跑同候选 T3 **3462/3434/10/18**（9 既有 symlink EPERM + 1 间歇 TEMP cleanup EPERM，新增确定性 0）。
- **E3 放行/回报**：`docs/scheduling/global-task-state-status-e3.md`，**69 行 / SHA-256 `1fdaaac5444cec65e5265001d39e81e7f1569bfcf0aeb1e6897483743f087f78`**；放行边界：E3 只表示当前候选满足 V1 v1.1，**不授权提交、推送、合并、发布**。
- **最终状态**：G2→E3 全部完成；实施与独立验收通过；**未提交、未推送、未合并、未发布**；下一步需客户单独授权提交/推送/PR/合并。

## 提交/推送/PR 授权记录（2026-11-02）

- **客户授权**：原话「授权提交本次全局任务状态改动并推送、创建 PR；不合并、不发布。」
- **范围**：当前候选 32 个产品/测试文件（30 `src/app/test` + README 2）+ 本任务治理/记录/证据（H1 6 个边界文件、P1 审核、B0/D1/D1 重跑记录与证据、方案 P1.3/复核/团队计划/V1.1/E1/E2/E3、沟通记录、各 memo）。
- **不含**：合并、发布、打 tag、删除分支；不含其它项目/其它任务改动。
- **执行方式**：从 HEAD `0a12310` 新建分支 `feat/global-task-state`；按「产品/测试」与「治理/记录」分组提交；推送并创建 PR（base `main`）；PR 创建后回报链接与提交哈希。

## 提交/推送/PR 结果（2026-11-02）

- **分支**：`feat/global-task-state`（从 `0a12310` 新建，已推送并跟踪 origin）。
- **Commit 1（产品/测试）**：`728c4e1dcb26fa0943d83eb5a2171953b94618a5` — `feat(global-task-state): 全局任务状态与幕僚版本决策权`；32 files changed, +7784/−22。
- **Commit 2（治理/记录/证据）**：`27162ca` — `docs(global-task-state): 治理、记录、证据与边界登记`；51 files changed, +11029/−0。
- **PR #33**：https://github.com/wangzhongren/ans-studio/pull/33（base `main`，head `feat/global-task-state`）。
- **状态**：工作树干净（仅忽略的 `*.log`/截图产物）；**未合并、未发布、未打 tag**；未启用自动合并。

## 合并授权记录（2026-11-02）

- **客户授权**：原话「PR 也合并一下把」。
- **对象**：PR #33（base `main`，head `feat/global-task-state`；Commit 1 `728c4e1…`、Commit 2 `27162ca`）。
- **范围**：合并到 main；不发布、不打 tag、不删除分支、不启用自动合并。merge 方式按仓库既有惯例（merge commit）。

## 合并结果（2026-11-02）

- **PR #33 状态**：**MERGED**（`gh pr view` 实测），mergedAt `2026-11-02T12:57:02Z`，merge commit `05d9414a43562cd0e701e0017ebf093aa858df71`。
- **main 已包含**：Commit 1 `728c4e1…`（产品/测试 32 文件）与 Commit 2 `27162ca`（治理/记录/证据 51 文件）。
- **未做**：未发布、未打 tag、未删除分支、未启用自动合并。
