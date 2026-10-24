# 变更包：主理统一协调 + 应用门禁 + Proof 独立（lead-governance-coordination v1）

- **风险档位**：T3（内置治理角色汇报/派发关系、应用会话路由、门禁、Proof 独立性、flow release 标记、跨层测试）
- **是否发布版本**：**否**
- **是否启动独立验收**：**否**（项目规则 §二.11；本非发布变更不启动独立验收/Proof）
- **依据**：团队计划 v1（504 行，SHA-256 `70cd5536…`）+ 客户实施授权（S1–S6；P0-2 另做；不含 commit/push/发布/目标/演示）+ gate 2 delta（`release` trigger）
- **候选位置**：独立 worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination`，detached HEAD `eec92ad`；**已提交到 worktree 分支 `lead-governance-coordination`（未 push）**；主工作树 flow 骨架 S2/S4 未提交改动未进入本候选。
- **替代检查**：T3 受影响套件 + 全量串行回归 + `tsc --noEmit` + 真实 Electron + 目标/演示只读前后哈希；**未覆盖**：P0-2（步骤 done 后自动推进）、P1-5/P1-6/P1-7、Provider 对 `release` 的文本渲染、Windows 符号链接环境用例。

## 1. 候选范围

- `git diff --stat`：**32 files changed, 2830 insertions(+), 367 deletions(-)**（另有 3 份未跟踪管理文档：gate2 delta、S1 worktree、本变更包）。
- 源码 11 个，测试/e2e 21 个；无新增角色、无边界/Section 1 变更、无新工具/能力位/卡种/命令/UI/i18n、无新 flow step kind/账本 kind/字段（仅新增 flow 顶层 `release: boolean`，见 §3）。
- 非发布：不写 `docs/acceptance/**`，`verification`/`acceptance` 保持 pending；不启动独立验收/Proof。

## 2. 按角色改动

### 2.1 门禁引擎（1 源 + 3 测）

- `governance-roles.ts`：
  - Lead/Liaison 卡新增“治理协调”：接报 Draft/Steward/Crew/Proof 状态/回交；闸门 0 后 `hand_off_intent` 交 Draft；闸门 1 后 `dispatch_task` coordinate 交 Steward；**不直接派 Crew/Proof/项目 worker**；项目 worker 由 Steward 派；Proof 只收状态+报告指针；协调≠客户批准；应用门禁仍执行。
  - Steward 卡：内置状态/回交向 Lead 汇总；返工由 Lead 协调；**只有发布版本（flow.release=true）才由应用派 Proof，非发布不派**；发布用既有 schedule-write 卡只把 flow 顶层 `release` 从 false/缺省→true，其余不变。
  - `STANDARD_WORKFLOW_PRINCIPLE` 同步；能力位/Section 1/预授权/禁写/导出签名零变化。
- 测试：`governance-trio`、`governance-standard-workflow`、`liaison-role` 更新；74/74。

### 2.2 编排（5 源 + 6 测 + 1 导出）

- `governance-gate.ts`：
  - **P0-3**：`dependsOn` 前置 superseded 沿 `supersededBy` 链解析到最终非 superseded 步骤再判 done；缺失/未知/成环 → `dependencies-unresolved`（与 `dependencies-not-done` 区分）。
  - **P1-4**：结构化步骤 `owner` 非空且 ≠ 派发目标 → `owner-mismatch`；legacy 无 owner/coordinate/app-only 例外。
  - **闸门 1**：coordinate 要求最新提案 accept/accept-quick；不要求步骤/任命/未派发。
- `flow-state.ts`：新增可选顶层 `release?: boolean`（缺省 false/非发布）；parse/serialize/未知字段校验；`release` 非布尔 fail-closed。
- `flow-service.ts`：
  - `flow_get` 视图带 `release`（`FlowToolViewWithRelease`）；serialize 保留。
  - `validateReleaseOnlyExtension`：**仅当 previous.release 或 next.release 为 true** 时限制；false/缺省→true 且其余逐字段不变通过；false→true/true→true 带其他变化拒绝；true→false 拒绝；**双方非发布的普通 flow 写卡保持原 parse/扩展校验**（不误拒普通扩展/修正）。
- `run-role.ts`：flow YAML 写卡 preview 层最小接线调用 release-only 校验；不加工具/能力位，`suppressHandback` 未动。
- `govern-session.ts`：发布版本才派 Proof、非发布不派；内置状态/回交向 Lead；主理只协调不批准；Steward 用 schedule-write 标 release；不承诺自动推进。
- `acceptance-rework.ts`：仅注释/文案（coordinator 为报告建议，实际接收方由应用决定）；schema/字段/枚举/items 零改动。
- 测试：`governance-gate`、`flow-state`、`flow-service`、`governance-session`、`governance-judge`、`acceptance-rework`；P0-3/P1-4/coordinate/release 正负例；既有断言只按收紧口径替换，不放松。

### 2.3 桌面窗口（3 源 + 7 测/e2e）

- `session.ts`：
  - 来源感知回交：内置（Draft/Steward/Crew/Proof）→ Lead（trio primaryRoleId）；项目 worker → Steward；Lead 自身不自我回交；single/su 保持原行为；不解除 run-role `suppressHandback`。
  - `mirrorGovernanceFeedback`：Proof 只投状态+报告/治理路径指针，不转全文、不摘要替代、不伪造结论；内置状态投 Lead；内置回交与同轮 settle 短时去重。
- `interface.ts`：
  - 治理协调唤醒：settle/回交/账本/导入入口；独立去重键 `projectRoot+flowId+revision+stage`；与 delivered 唤醒共享 revision 指纹；Lead busy/队列/在途跳过；内存预算 24 次/flow、同阶段 2 次、连续无进展 2 次；不轮询/不自动推进/不写 flow/账本。
  - **P0-1 release 门**：`dispatchAcceptanceForFlow` 与 verifier 写 acceptance-criteria 自动派发只在 `flow.release === true` 时执行；非发布停在 `awaiting-release-acceptance`，不派 verifier/Proof、不写标准、不标 acceptance done；返工后自动重派 Proof 同样受门；`noteVerifierSettle` 报告/治理路径指针保留；无新 IPC/卡种/UI。
  - 返工：客户 reject / judge auto-rework → Lead（trio primaryRoleId）；single/su 保持；审计 `dispatch.accepted.targetRoleId` 和系统行写实际接收方；schema/items 不变。
- `governance-advance.ts`：返工任务文案/实际接收方按模型 Lead/原行为；release 提示；`deriveGovernanceNextStep` 未改。
- 测试：`acceptance-dispatch`、`dispatch-delivery`（coordinate 夹具补 proposal-accept）、`e2e/main.mjs`（真实 Electron 非发布/ release 断言）、`handback-delivery`、`interface`、`runtime-resolution`、`session`；585/585。

### 2.4 测试角色（5 测）

- `test/测试/governance-e2e-auto/{fixture,i-full-chain,m-lead-internal-choice,r-mapreduce-parallel,s-acceptance-rework-routing}.test.ts`：非发布不派 Proof/不写标准；release:true 才派；返工实际接收方 Lead；coordinate 闸门 1 seed；P0-3/P1-4 正负例；142/142。

## 3. 发布验收 trigger（P0-1）

- flow 顶层 `release?: boolean`，缺省 false/非发布；只有 `true` 允许应用按发布验收门派 verifier/Proof。
- Steward 在 change-package 后用既有 `request_confirmation(cardKind=schedule-write)` 写一份只把 `release` false/缺省→true、其余字段/步骤逐字不变的 YAML；客户/判断 agent 按既有审批卡确认。
- 应用 release-only 校验：**只约束涉及 release 的写卡**；普通 flow 扩展/修正（release 缺省/false）保持原校验；true→false/带其他变化拒绝。
- 非发布：change-package done 后停 `awaiting-release-acceptance`；不派 verifier/Proof、不写 acceptance-criteria、不标 acceptance done。
- 发布：release true 后下一次真实 settle 才派 Proof/标准；派 Proof ≠ 验收通过；客户最终决定不变。
- 不新增卡片种类/命令/按钮/UI/i18n/工具/能力位；不改变 Proof 独立性。

## 4. 证据

### 4.1 测试

| 套件 | 结果 |
| --- | --- |
| `test/测试/governance-e2e-auto/*` | **142 tests / 142 pass / 0 fail / 0 skip**（基线 139/129/10 fail 已修） |
| `test/门禁引擎/*` | 319 tests / 318 pass / 0 fail / 1 skipped（既有 Windows 权限用例） |
| `test/编排/*` | 873 tests / 871 pass / **1 fail** / 1 skipped；唯一失败 `shell-authorized-routine.test.ts:103` Windows `symlink EPERM` 环境失败，非产品断言 |
| `test/桌面应用/*` | **585 tests / 585 pass / 0 fail** |
| T3 全量串行（排除已知挂起） | **3852 tests / 3824 pass / 9 fail / 19 skipped / 0 cancelled**，351,593 ms；9 fail 全为 Windows 符号链接 EPERM 环境失败（`claude-adapter/session:637`、`codex-adapter/session:351`、`pi-adapter/injected-runtime:185/193`、`runtime-core/file-write-safety:97`、`runtime-core/session-store:46/58`、`测试/g4-skill-verify/b-render-double-check:182`、`编排/shell-authorized-routine:103`），**无产品断言失败** |
| 已知挂起 | `test/pi-adapter/write-sequencing.test.ts` 按已知问题排除；命令：`find test -name '*.test.ts' ! -path 'test/pi-adapter/write-sequencing.test.ts' -print0 \| sort -z \| xargs -0 node --test --test-concurrency=1` |
| Typecheck | `node ../../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` → **exit 0** |
| Electron | `ANS_RENDERER_ENTRY=.../app/renderer/dist/index.html node ../../../node_modules/electron/cli.js test/桌面应用/e2e/main.mjs` → **E2E_PASS=true / E2E_FAILURES=**；`GOVERNANCE_AWAITING_RELEASE_SYSTEM_LINE`、`NON_RELEASE_NO_PROOF`、`NON_RELEASE_FLOW_UNCHANGED`、`NON_RELEASE_NO_CRITERIA_FILE`、`RELEASE_DISPATCHES_PROOF`、`RELEASE_FLOW_UNCHANGED`、`RELEASE_NO_ACCEPTANCE_DONE` 全 true；`GOVERNANCE_COORDINATION={"leadNotes":2,"verifierSends":1}` |

### 4.2 目标/演示只读（前后一致，零写入）

- `C:/Users/51054/Desktop/work/ans-gateway`：10670 files，sha256 `74a30e75…`
- `C:/Users/51054/Desktop/work/ans-studio/demos/expense-tracker`：430 files，sha256 `9e3a9c2e…`
- `C:/Users/51054/Desktop/work/ans-studio/demos/tower-defense`：171 files，sha256 `4b0858c3…`
- 计算：`find <dir> -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum`；前后相同。

### 4.3 候选哈希（sha256sum，最终工作树）

**源码（11）**

| 文件 | sha256 |
| --- | --- |
| `app/desktop/governance-advance.ts` | `e048041d…e40e` |
| `app/desktop/interface.ts` | `f7b1c1c0…0dc3` |
| `app/desktop/session.ts` | `be9c2cf5…570c` |
| `src/common/编排/acceptance-rework.ts` | `ec790e89…7223` |
| `src/common/编排/flow-service.ts` | `6948d015…181e` |
| `src/common/编排/flow-state.ts` | `aaeccb27…d249` |
| `src/common/编排/governance-gate.ts` | `a5bfff3d…2c89` |
| `src/common/门禁引擎/governance-roles.ts` | `f1622329…1f8c` |
| `src/pipeline/orchestration/flow-state.ts` | `ed5ca1da…bbf9` |
| `src/pipeline/orchestration/govern-session.ts` | `163d71c7…341e7` |
| `src/pipeline/orchestration/run-role.ts` | `3b0bfde5…233b` |

**测试/e2e（21，全量见 S5 报告）**：`test/测试/governance-e2e-auto/{fixture,i-full-chain,m-lead-internal-choice,r-mapreduce-parallel,s-acceptance-rework-routing}.test.ts`；`test/桌面应用/{acceptance-dispatch,dispatch-delivery,e2e/main.mjs,handback-delivery,interface,runtime-resolution,session}`；`test/编排/{acceptance-rework,flow-service,flow-state,governance-gate,governance-judge,governance-session}.test.ts`；`test/门禁引擎/{governance-standard-workflow,governance-trio,liaison-role}.test.ts`。

## 5. 残余/未覆盖

1. **P0-2 未做**：步骤 done 后自动推进下一步仍未实现；演示仍可能停在 done 后，按客户决定另做 T3。
2. **P1-5/P1-6/P1-7 未做**：验收标准双源/版本、schedule-write 后 revision 新鲜度、dispatch.accepted 入队≠交付；本批不宣称闭环。
3. **Provider 文本渲染**：`flow_get` 服务视图已带 `release`，但 `src/provider/runtime/tools.ts::renderFlowView` 未渲染该字段；模型需读 flow YAML 才能看到 release。运行时核心不在本计划写集；如需模型可见，另做最小变更/闸门确认。
4. **`closeAcceptedFlow`**：仍只在账本已有客户/判断 accepted 决定时收口；P0-1 拦的是自动派发入口；历史 accepted 不回改。
5. **Windows 环境**：T3 全量 9 个 symlink EPERM + 1 个编排 symlink 失败；19 skipped；已知挂起 `write-sequencing` 排除。均为环境/既有，不是产品断言失败。
6. **release 标记**：需要 Steward 在 change-package 后用既有 schedule-write 卡显式标记；没有新增 UI/命令；若客户希望更直观的发布按钮，另做 UI 变更。
7. **共享文件**：主工作树 flow 骨架 v1.1 仍未提交且与本候选共享 `flow-state/flow-service/governance-roles/session/interface` 等；本候选在独立 worktree 基于 eec92ad，不包含 S2/S4；合并/提交需客户另行授权并处理重基。
8. **非发布验收**：未写 `docs/acceptance/**`，未启动独立验收/Proof；`verification`/`acceptance` 保持 pending。

## 6. 结论

本候选在独立 worktree 完成 S1–S6（非发布；已提交到 worktree 分支 `lead-governance-coordination`，未 push），实现 P0-1（release 发布验收门）、P0-3（supersededBy 依赖解析）、P1-4（owner 校验）、主理协调/汇报/返工路由、Proof 状态+指针、非发布不派 Proof；T3 全量 3824 pass、9 个 Windows symlink 环境失败、19 skip，typecheck 0，Electron 全绿，目标/演示零写入。P0-2、P1-5/6/7 未做，变更包不宣称这些闭环。请客户评审候选；push/合并需另行授权。
