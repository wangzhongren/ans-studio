# 验收完成标准：全局任务状态与幕僚版本决策权（global task state / version authority）——实施前标准 v1.1

- 风险档位：**T3**（方案 §10.3 定档、闸门 2 与客户实施授权确认；新增治理决策权、共享账本契约加法扩展、跨角色工具/UI/run 生命周期，不是纯文档或局部实现；不压档、不降档）。T3 依据与升档/停止条件见 §五。
- 判定依据：客户闸门 0、闸门 2 与实施授权记录 `docs/communication/2026-11-02_intent_global-task-state.md`（写标准时 **134 行** / SHA-256 `0ef4ba72f652d695c706cd411d299572fcd25e30ebb53d2e64bd3d0d8aaaad53`；该文件是沟通管理记录、可能继续追加，验收引用其**确认小节**而不引用固定行号；团队计划文件头引用的 91 行 / `a25e6cf8…` 与方案文件头引用的 83 行 / `baf327b9…` 均为历史快照）；客户闸门 2 确认的团队计划所授权实施、并经沟通 P1.2 核对记录确认为实施/V1 基线的策划方案 **P1.2** `docs/planning/2026-11-02_design_global-task-state-version-authority.md`（**1302 行** / SHA-256 `1573e1ef7b88dece485f6eab29d657181e1afd61a02849a29c7a7592af5bebfb`，含 R1–R5 窄收口；历史 P1.1 为 1283 行 / `369f666acb76ac88fe30854d84b2f08f3148a55c9ff53958185310ef5c3af910`）的 §3（全局状态设计）、§4（版本决策）、§6（架构）、§7（共享契约）、§8（兼容/并发/恢复）、§9（测试与 AC）、§10.3（T3）与 §13（F1–F13、R1–R5 处置）；独立复核 `docs/planning/2026-11-02_review_global-task-state-version-authority.md`（**148 行** / `22128e59904ab8de10ede64f7acc478069c752198fc3b87c043f5dab4434c5a8`，P1.0 复核快照 **103 行** / `3b8d3a3ad407a1da71940d9d26b8aaa98665f50fc2759daafc27c57a8ae3fc07`；结论「建议提交客户确认」）；闸门 2 确认的团队计划 `docs/scheduling/2026-11-02_team-plan_global-task-state.md`（**477 行** / `06d29aaf940b9b66062420a9926c9c1764b0aaf12757f785383ce5c0d6359d62`）§1.2（R1–R5）、§5.3（V1 出口）、§6（实现约束）、§7（验收安排与证据要求）、§8（闸门 2 确认项）；测试 B0 基线 `角色卡/测试/docs/change/2026-11-02_global-task-state-B0-baseline.md`（**167 行** / `5c275332f38ba3c8c3f1ad51dcd72df62ef92e2a2523779441d678f6bf02aa58`）。本文件的 AC 不得弱于方案 §9.2；团队计划只作范围、写集、阶段、证据口径与 R1–R5 来源，不是标准来源。
- 选定检查：**T3 口径**——受影响层测试（编排纯逻辑、桌面集成、项目管理 i18n、桌面UI）+ 跨角色/完整流程回归 + **T3 全量适用回归** + `npm run typecheck` + `npm run typecheck:renderer` + `npm run build:renderer` + 真实 Electron E2E（不可跑时须有可复核原因）；另核 R1–R5（§四）。全量回归是 T3 的必需项，不是可选项（`references/testing.md` T3 定义、方案 §9.3、团队计划 §7.3）。
- 录屏与截图：**不要求录屏**。验收证据**最多使用截图**，**不得要求或提供录屏/屏幕录像作为验收要求或选项**；缺少录屏不构成 `fail` 或 `insufficient evidence`（2026-10-27 客户规则，`references/acceptance-role.md`）。如使用截图，必须来自当前候选真实运行、关闭 DEBUG 覆盖层，并记录 SHA-256、候选版本与拍摄命令/窗口尺寸；E2E 以原始输出与 `report.json` 为主，截图只作辅助。
- 复用证据：仅同一候选、同一输入/依赖/夹具、同一命令、同一配置、同一环境的证据可复用；候选、输入、依赖、契约、夹具、构建或配置变化时，受影响证据失效，只补失效部分；不得跨候选复用，也不得用其它变更（如 acceptance-return-card、dispatch-guardrail-relax、i18n、shell-escalation 等）的通过结论或证据替本变更背书。
- 任务 ID / flowId：`2026-11-02-global-task-state` / `global-task-state`。
- 标准路径 / 版本 / 日期：`docs/acceptance/global-task-state-criteria-v1.md` / **v1.1** / **2026-11-02**（实施前冻结；v1.1 为 v1 的窄更正，见 §1.6）。
- 阶段与状态：**实施前完成标准**。本文件只建立标准，不判定候选；写标准时**未实施、未测试、未验收**——HEAD `0a123109a6b10e9b60fd1aee5f08f861455c48de` 仍是旧实现（`src/model/project-state.ts`、`src/common/编排/project-state.ts`、`src/common/编排/version-decision.ts` 及五个计划新增测试文件均不存在）。闸门 0/2 已确认，客户实施授权已给（按团队计划与 P1.1/P1.2 实施，不含提交/推送/发布，以沟通记录为准）；前置节点 H1（B-1/B-2 边界）与 B0（基线）已完成。
- **本文件由内置独立验收（技能内置管理角色，不是项目 `角色卡/独立验收` worker）的唯一验收主上下文在实施前写盘；实施后的 E2 由同一主上下文按本文件判定并另写 `docs/acceptance/global-task-state-report-v1.md`。** 本文件不是验收报告，不含任何通过/返工/证据不足结论。
- 适用变更：仅本任务（全局任务状态 + 幕僚版本决策权，基线 P1.2）。提交/推送/合并/发布不属本任务，也不因验收通过而授权；验收通过只表示当前候选满足本标准。

---

## 一、基线、版本冻结与范围

### 1.1 客户确认链与冻结版本

| 项 | 状态 | 记录与版本 |
| --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-11-02） | 沟通记录「闸门 0 确认记录」：全局任务状态（跨 flow 的当前 flow/阶段/任务/阻塞/版本指针/下一步）+ 幕僚版本决策权（版本修改 vs 新版本开发），以「发卡确认」方式行使；保留申请≠批准、审计、验收/证据/写权边界。历史快照 83 行 / `baf327b9…`（方案文件头引用） |
| 客户预授权 | 已给（2026-11-02） | 沟通记录「客户预授权」：客户原话「我都同意，等下搞好了，直接安排去修改」；条件为不越出已确认意图、推荐选项、写权/边界；提交/推送/合并/发布另行授权 |
| 闸门 2：角色/写集/边界/档位/阶段/验收安排/证据口径 | 已确认（2026-11-02） | 沟通记录「闸门 2 确认与实施授权记录」：客户原话「确认闸门 2：团队计划含 B-1/B-2；按该计划与 P1.1 实施；不含提交/推送/发布。」；确认对象含团队计划 **477 行 / `06d29aaf…`**、**B-1**（运行时核心新增 `src/model/project-state.ts`）与 **B-2**（桌面窗口新增 `test/桌面应用/project-state.test.ts`、`test/桌面应用/version-decision.test.ts`）、T3、阶段顺序、V1/E2 与证据口径 |
| 实施授权 | 已给（2026-11-02） | 沟通记录同上：按团队计划与 P1.1/P1.2 实施；不扩大写集/边界/方案默认项；**提交、推送、合并、发布不在本次授权内** |
| 方案 P1.2 沟通核对 | 已核对（2026-11-02） | 沟通记录「P1.2 核对记录」：1302 行 / `1573e1ef…`；只属 R1–R5 窄收口；Q1–Q6 仍全 A、C1–C7 推荐不变、O1–O11 默认不实施、§1.4 非目标与 §10.3 T3 未变；作为实施与 V1 的基线版本（与团队计划一并）；无需重开闸门 1 |
| 前置节点 H1（B-1/B-2 边界） | 已完成（2026-11-02） | 沟通记录「前置节点核对记录」：6 个边界文件 +20/−0；运行时核心 16/16 条、桌面窗口 79/79 条，md/yaml 同序一致；`boundary-yaml`/`boundary-yaml-validation` 测试 17/17 通过；`src app test` 无改动。H1 是人事治理变更，不纳入产品候选 |
| 前置节点 B0（基线） | 已完成（2026-11-02） | `角色卡/测试/docs/change/2026-11-02_global-task-state-B0-baseline.md`（167 行 / `5c275332…`）：HEAD `0a12310`；`src app test` 无改动；`npm run typecheck` exit 0；受影响套件 44/44；`phase4b` Electron smoke 64 checks / 0 failures、13 张截图；`write-sequencing.test.ts` 按既有决定排除并记为未验证 |
| 本验收标准 | 实施前写盘并冻结 | 本文件 v1（2026-11-02）；v1.1 窄更正（2026-11-02，§1.6：blocker kind 内部枚举 id `acceptance-rework`→`rework-pending`） |

**引用快照说明**：方案 P1.2 文件头仍写「待沟通核对 P1.2」，团队计划文件头仍写「B-1/B-2 未确认、闸门 2 前不派发」——这些是写于对应确认之前的**历史状态行**，不作为当前判定依据；当前判定以 `docs/communication/` 的确认小节、方案 P1.2 冻结哈希、团队计划冻结哈希、复核记录 148 行 / `22128e59…`（P1.0 快照另计 103 行 / `3b8d3a3a…`）与 B0 记录为准（另见 §九.2/§九.3）。

### 1.2 版本冻结与变更规则

- 本文件写盘即冻结为 **v1**（v1.1 为其窄更正，见 §1.6）；实施开始后，不得为迁就候选而改写标准、放宽或加严实质。
- 确需变更标准（客户改变范围、方案/契约实质变更、发现标准本身不可执行/自相矛盾）时：递增版本（v2…）、记录理由与受影响条目、交沟通/统筹确认，并重新核对受影响证据；未确认前仍按 v1 判定。
- 方案/契约的**实质变化**（改范围、Q1–Q6/C1–C7/O 选项、写集、边界、T3、`project-state/v1`/`version-decision/v1`/`task-state` 事件语义、AC、pinned/run-change 边界、验收/证据/写权/闸门）按方案 §7.4/§10.3 与团队计划 §5.4 停止并重开对应闸门；本文件随之重判。仅文档编辑性更正（例如 R5 引用标注）不改变已确认语义。
- 候选变化不改变标准；只使该候选上的证据失效，需按本文件重取。
- 本文件不是验收结论，也不是实施/提交/推送/合并/发布授权；实施授权以沟通记录为准，验收结论只写在 `docs/acceptance/global-task-state-report-v1.md`。
- 本文件写盘后的行数与 SHA-256 由沟通/E1 在**外部**记录（变更包/沟通记录）；本文件不自引用最终哈希（避免自指循环）。

### 1.3 本轮范围（判定边界，不重复方案正文）

本文件判定覆盖（对应方案 §1/§3/§4/§7/§8/§9 与团队计划 §1.1/§7.1）：

1. **全局任务状态（只读派生视图）**：focus、flows/runs、tasks、blockers、versions、evidence、notes、nextStep、errors、generatedAt；由 `.ans/state/tasks.jsonl`、`.ans/runs/*/manifest.json`、版本化文档即时派生，不落第二份状态；读操作零写入；部分可读（坏行/坏 manifest 不阻塞）；按角色裁剪；有界（truncated/计数）；多 flow 不猜 focus、不猜最新 `-c`。
2. **幕僚受控备注**：`project_note` 的 set-focus / blocker / next-step；append-only `project.focus`/`project.note` 事件；校验 flow 存在性、文本长度、noteKey；不改任务状态/run manifest/文档；可审计、重启可重建。
3. **版本决策**：仅幕僚工具发起；复用 application-owned `decision` 卡（不新增 cardKind）；两个固定选项、恰一个 recommended（幕僚提议）；客户或「替我决策」判断 agent 决定；拒绝/通道超时/不可用/发起中止/晚到答案/重试/并发的审计语义；版本修改执行；新版本开发执行（新 flow/run、关闭旧 flow 全部活动 run、orphan 旧未决申请、保留旧产物、不自动关任务/不自动派发）。
4. **边界与不变面**：pinned run 走既有 run-change；版本决策不替代 run-change/需求变更/验收/证据/写权/客户闸门；旧账本/旧 flow/旧 run/legacy 兼容；重启/崩溃窗口/部分失败/轮转保留窗口如实。
5. **UI 与文档**：项目状态区只读、同 builder、计数与任务中心一致；聊天系统行；i18n 两语言；README 中英事件清单；文档状态如实。
6. **跨任务核对项**：R1–R5（团队计划 §1.2/§6、复核披露）；T3 全量回归/typecheck/build/E2E/证据口径（§五）。

**明确不判定为本轮缺陷或范围的边界**（依据闸门 2 已确认版本，不是放宽）：

- **O1/O3–O11 默认不实施**（O2/O8 默认不做）：完整状态页、只读快照文档、worker 只读工具、面板写操作、pinned 转呈 run-change、二次确认、自动终止/关闭旧任务、决策持久化到任务卡、run-change 审计补全、single/su 版本决策、自动派首步。未实施不构成 fail；若实施则按越权/范围偏差判返工。
- **角色卡文本/工具描述对齐属独立事项**：本任务只改 `src/provider/runtime/schema.ts` 的工具描述，不改 `角色卡/**` 文本（H1 的 B-1/B-2 边界补登除外；它是闸门 2 确认的人事治理变更，不是角色卡文本对齐，也不属产品候选）。
- **不改写权/边界（Section 1、`resolveWrite`、`TaskScope`、forbiddenWritePaths）、shell 守卫、版本化文档只读保护、验收判定/验收卡/证据路径/`evidence_check`、客户三道闸门、人事 D3/`appointment-write`、run-change 三模式、`request_requirement_change`**。
- **不自动修复当前修仙 run**；不追溯修改 `xianxia-brotato-b/-c` 或 proposal/roster 历史；roster/引用循环、demo 重复投递为独立事项。
- **不 commit/push/merge/release**；不接触客户；不伪造 task_ops 机器状态或审批（本项目无 `.ans/project.json`，未启用 task_ops）。

### 1.4 写标准时的只读基线与输入哈希

| 检查 | 命令 | 结果（2026-11-02 写标准时实测） |
| --- | --- | --- |
| 分支 / HEAD | `git branch --show-current` / `git rev-parse HEAD` | `feat/acceptance-return-card` / `0a123109a6b10e9b60fd1aee5f08f861455c48de`（与团队计划/B0 的基线 HEAD `0a12310` 一致；团队计划以 worktree 名 `flow-improvements-wave1` 指代本工作区，实际分支名见 §九.1） |
| 工作树（写标准前快照） | `git status --porcelain -uall \| sort` 及其 SHA-256 | **16 条**：2 个管理 memo 修改（`docs/communication/memo.md`、`docs/planning/memo.md`）；6 个 H1 边界文件修改（`角色卡/运行时核心/{boundary.md,boundary.yaml,changelog.md}`、`角色卡/桌面窗口/{boundary.md,boundary.yaml,changelog.md}`）；4 个未跟踪管理记录（沟通/方案/复核/团队计划）；B0 记录与证据目录中未被忽略的 4 个文件（未跟踪；其余日志/截图为既有忽略项）。快照 SHA-256 `024d5c473afa239bf79a29fa0b95f3ff3b8b3ec1d21db45cfa09beda85e83d0c`（本文件写盘前；本文件写入后快照会变化，本文件属管理记录、不属产品候选） |
| 产品/测试改动 | `git status --porcelain -- src app test` | **空**（写标准时实测 0 条） |
| 方案 P1.2 | `wc -l` / `sha256sum` | **1302 行** / `1573e1ef7b88dece485f6eab29d657181e1afd61a02849a29c7a7592af5bebfb` |
| 复核记录 | 同上 | **148 行** / `22128e59904ab8de10ede64f7acc478069c752198fc3b87c043f5dab4434c5a8`；P1.0 复核快照 **103 行** / `3b8d3a3ad407a1da71940d9d26b8aaa98665f50fc2759daafc27c57a8ae3fc07`（两者不混用） |
| 团队计划 | 同上 | **477 行** / `06d29aaf940b9b66062420a9926c9c1764b0aaf12757f785383ce5c0d6359d62` |
| 沟通记录（当前） | 同上 | **134 行** / `0ef4ba72f652d695c706cd411d299572fcd25e30ebb53d2e64bd3d0d8aaaad53`；含闸门 0/闸门 2/实施授权/H1/B0/P1.2 核对小节；团队计划文件头 91 行 / `a25e6cf8…` 与方案文件头 83 行 / `baf327b9…` 为历史快照 |
| B0 基线 | 同上 | **167 行** / `5c275332f38ba3c8c3f1ad51dcd72df62ef92e2a2523779441d678f6bf02aa58` |
| Node / npm | `node --version` / `npm --version` | `v24.22.1` / `11.19.1`（实施/取证仍须记录实测版本） |
| 任务配置 | `ls .ans/project.json` | 不存在；未启用 task_ops；不伪造任务令牌/锁/预检 |
| npm 脚本存在性 | `package.json` | `typecheck`=`tsc --noEmit`；`typecheck:renderer`=`tsc -p app/renderer/tsconfig.json`；`build:renderer`=`vite build --config vite.config.ts`；`test:assembly` 存在 |
| 计划新增文件（实施前应为不存在） | `ls` | `src/model/project-state.ts`、`src/common/编排/project-state.ts`、`src/common/编排/version-decision.ts`、`test/编排/project-state.test.ts`、`test/编排/version-decision.test.ts`、`test/桌面应用/project-state.test.ts`、`test/桌面应用/version-decision.test.ts`、`test/桌面UI/project-state.test.ts` **均不存在**（符合实施前状态） |
| 关键现状锚点（只读核对） | Grep/Read（只读，不运行） | `src/common/编排/task-state.ts:39` `TASK_EVENT_KINDS`、`:227` `appendTaskEvent`、`:280` 未知 kind 拒绝、`:542` `taskStatusOf`、`:551` `TaskCardView`、`:605` `taskCards`、`:631` `redispatchCountOf`；`src/common/编排/run-manifest.ts:221` `listRunManifestsResult`、`:240` `findActiveRun`、`:254` `ensureDraftRun`、`:546` `closeRun`、`:616` `applyRunChange`、`:696` `buildRunChangeCard`、`:832` `findNewerContractDocs`；`src/common/编排/decision-card.ts:36` `DECISION_CARD_ALLOWED_ROLES`、`:86` `validateDecisionCardRequest`；`src/model/runtime.ts:420` `GOVERNANCE_CARD_GROUP`、`:836` `RequestOrphanedEvent`、`:2054` `GovernedToolsOptions`；`app/desktop/session.ts:1140` `requestNotifiedKeys`、`:1912` `requestRunChangeDecision`、`:3882` `withRequestLifecycle`、`:4073` `restoreRequestState`、`:4665` `escalateStuckTask`；`src/provider/runtime/tools.ts:1668` `judgeReceipt`、`:2275` `ROLE_STATUS_MAX_BYTES`、`:3070` `buildGovernedTools`；`README.md:133` `TaskStateEvent` 事件清单（中英两文件同处） |
| 既有测试/夹具锚点 | `ls` | `test/编排/{task-state,run-manifest,decision-card}.test.ts`、`test/桌面应用/{chief-workflow,run-change,run-change-entry}.test.ts`、`test/项目管理/shared/{i18n,i18n-guard}.test.ts`、`test/桌面UI/phase4b-electron-smoke.mjs`、`test/桌面应用/e2e/main.mjs`、`test/pi-adapter/write-sequencing.test.ts` 均存在 |

以上只读核对用于确认基线与约束；本文件写盘未改方案、复核、团队计划、沟通记录、角色卡、产品源码或测试，也未启动应用、未运行实施测试（仅只读核对 B0 既有记录与仓库文件）。H1 边界补登是闸门 2 确认的人事治理变更（团队计划 §4.5），记录但不计入产品候选；除 B-1/B-2 外无边界变更。

### 1.5 本文件不产生的授权

本文件不授权提交、推送、合并、发布，不授权派发 worker，不授权修改写集、边界或档位，不授权启动应用做「已验收」声明。实施按闸门 2 确认的写集与团队计划阶段执行；实施授权范围以沟通记录为准。验收通过只表示当前候选满足本标准。

### 1.6 v1.1 窄更正记录（2026-11-02）

- **触发**：D1 发现既有 D-04 撤除残留守卫命中新 blocker kind `acceptance-rework`；PM 裁决改名为 `rework-pending`（不改守卫/断言，不重开闸门，语义/范围/T3 不变）。
- **更正**：仅将 AC-1.1 枚举的 blocker kind `acceptance-rework` 更正为 `rework-pending`。`rework-pending` 与方案 §3.4 的 `acceptance-rework` 语义相同（验收卡退回/返工循环信号），只是内部枚举 id 为通过 2026-10-28 D-04 撤除残留守卫（禁止旧 token）而改名；本文件其它 AC、判定规则、T3、证据口径、版本冻结/变更规则、写集/授权边界均不变。
- **E2 要求**：按 `rework-pending` 判定；在 E2 报告注明旧 id `acceptance-rework` → 新 id `rework-pending` 的映射，并核对本更正是 V1 的唯一实质差异（其余 AC 强度不变）。
- **未改变**：方案/团队计划/复核/沟通记录/代码/测试均未因本更正修改；未 commit/push。

---

## 二、判定口径与证据规则

### 2.1 四种判断与报告表

每条验收项（AC）与核对项只能判：

| 判断 | 含义 |
| --- | --- |
| `pass` | 当前候选满足该条标准，证据为该候选的原始、可复算证据 |
| `fail` | 已有证据表明不满足标准，或证据显示以弱化断言/超范围改动/绕过标准达到表面通过 |
| `insufficient evidence` | 缺少必要证据、证据属于另一候选/另一输入、无法复算、只给摘要、只凭自述，或关键结论无法成立 |
| `not applicable` | 该条对本轮范围不适用；必须写明依据（客户书面确认的范围变更），不得用来回避必需证据 |

本任务 AC-1–AC-10 与 R1–R5 全部适用，均应给出 `pass`/`fail`/`insufficient evidence`；默认不使用 `not applicable`。E2E 等检查若因环境不可用，按 `insufficient evidence` 记录可复核原因，不写成通过，也不因缺少录屏扣分。

验收报告 `docs/acceptance/global-task-state-report-v1.md` 的核心是逐项验收表，列至少为：

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1–AC-10、R1–R5 | 本文件条目与方案 §9.2 AC-1–AC-10 | 本文件各条「所需证据」 | 原始输出/账本摘录/哈希路径 | E1 变更包候选（HEAD + 逐文件 hash-object/sha256 + status 快照 SHA-256） | 编排/桌面窗口/桌面UI/项目管理/测试/统筹 | 实际观察摘要 | pass/fail/insufficient evidence |

总体结论：**AC-1–AC-10 全部 pass，且 R1–R5 均满足或按 §4.6 如实记录（无阻断项），才算通过**；任一项 `fail` → 返工；无 `fail` 但有任一项 `insufficient evidence` → 证据不足，不得判 pass。

### 2.2 原始证据原则（不得以「字段齐全」代替实际行为）

- 文件存在、字段名齐全、测试文件存在、断言存在，**只是必要条件，不是通过依据**。每条必须观察实际行为：`project-state:get` 载荷原文、工具文本投影、`tasks.jsonl` 新行原文、run manifest 前后状态、`version.decision` 事件序列、客户卡载荷、回执原文、诊断记录、UI 渲染结果、计数与截断标记。
- 开发者自述、测试角色转述、工具「成功」、计划文字、摘要、完成报告/进度报告，都不算原始证据，也不能代替独立验收；验收读取原始命令输出、文件哈希、diff/status、测试计数与失败原文、账本原始摘录。
- 不得修改断言以保绿；不得跳过失败用例或把 `skip`/`todo` 计为通过；不得把失败归为「环境问题」而不做 B0 对照与分类。
- 不得用纯函数单测代替桌面集成/真实 IPC，也不得用桌面集成代替纯函数矩阵；两侧证据都要。
- 不得用其它变更的通过结论、摘要或测试计数替本变更背书。

### 2.3 T3 证据口径

- 按 `references/testing.md` 的唯一定义，本变更 **T3**：发布、共享抽象（Model/公共入口/跨模块契约）、治理或权限变更，或证据基础不确定；默认验证为「全量适用回归 + 发布/共享抽象检查」。方案 §10.3 与闸门 2 均已定档 T3，本文件不压档。
- 受影响层与跨角色回归：Model（`src/model/runtime.ts`、新增 `src/model/project-state.ts`）、编排（`task-state.ts`、新增 `project-state.ts`/`version-decision.ts`、`run-role.ts`）、桌面会话/IPC（`app/desktop/session.ts`、`interface.ts`、`app/main.ts`、`preload.cjs`）、桌面UI（`TaskCenterPanel.tsx`/`ProjectStatePanel.tsx`/`platform.ts`/CSS）、i18n、README、装配与测试。跨角色/完整流程回归由测试角色执行（D1）。
- **T3 全量适用回归是必需证据**（§5.4）；`test/pi-adapter/write-sequencing.test.ts` 为既有已知挂起，允许排除但必须记录可复现命令、原因与既有验收依据（`docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604`），不得静默跳过，也不得把排除当通过。
- `npm run typecheck` 必须通过；本任务改渲染层，必须同时执行 `npm run typecheck:renderer` 与 `npm run build:renderer` 并记录退出码。
- Electron E2E：可跑则记录原始输出/`report.json`/截图（最多）/候选哈希/命令/窗口尺寸；不可跑则如实记录可复核的不可用原因（命令、错误原文、环境），不得把不可用写成通过，也不得因缺录屏扣分。
- 证据不足或候选不可复算时按 §5.8 升档补证；升档不降档。

### 2.4 「证据不足」判定口径（不弱化）

出现下列任一情形，对应 AC/核对项判 `insufficient evidence`，不得判 `pass`：

1. 缺少该 AC「所需证据」中的任何原始输出/文件（只给摘要、转述、口头自述、工具成功提示、完成报告）。
2. 证据与候选不匹配：文件哈希/diff 无法复算，或证据来自另一候选、另一 HEAD、另一输入/夹具；E1 变更包候选哈希与工作区不一致。
3. 新测试文件缺失、未运行、被 `skip`/`todo`，或断言被删除/放宽以保绿；既有测试被改弱。
4. 全局状态只由纯函数单测证明，桌面集成未断言 `project-state:get` 真实 IPC 形状/零写入；或反过来只有桌面测试、没有编排派生矩阵覆盖。
5. R1 缺「1 个坏 manifest + 1 个好 manifest 时合法 flow 的 active 标记仍正确」；R2 缺「通道超时/不可用 → resolved」或「发起中止 → orphaned」任一侧；R3 缺执行期 pinned 的 `failed/run-change-required` 或 F5 排除 orphaned；R4 缺「关闭旧 flow 全部活动 run」断言；R5 缺两个复核快照的区分与未被改写证据。
6. AC-7.1 只有 `version.decision` 无 `request.*`，或拒绝/中止路径出现 `version.decision`/`request.resolved` 双写；AC-8.3 崩溃窗口只有实现自述、无账本事件与通知证据。
7. AC-7.3 计数只有 UI 文案、没有 `counts.unclosed === state.unclosed.length` 断言与 superseded/active 差值证据。
8. AC-9 缺 `npm run typecheck`、`typecheck:renderer`、`build:renderer` 退出码 0；缺 T3 全量回归原始输出/计数/失败分类；新 skip/todo 未清零；或测试删除/弱化无逐条说明。
9. E2E 未执行且无可复核原因；或声称 E2E 通过但无原始输出/候选哈希/入口哈希。
10. 写集外改动（产品/测试/共享层/构建/发布/角色卡超出 B-1/B-2）或并发混入未隔离。
11. E1 变更包/证据缺方案版本、标准版本、候选哈希或节点对应关系。
12. 用其它变更（acceptance-return-card、dispatch-guardrail-relax、i18n、shell-escalation 等）的通过结论或证据为本变更背书。
13. 实施/测试自评即验收结论，或实施角色自写验收报告。
14. `not applicable` 未写明依据。
15. AC-10 文档状态/复核引用与实际不符（例如把 P1.0 复核快照 103 行当作当前 148 行记录，或声称已验收/已发布但无记录）。

**不得放宽的具体禁令**：不以时间紧降档；不以纯函数单测替代桌面集成；不以桌面集成替代纯函数矩阵；不以「工具成功」「全部通过」摘要替代原始输出；不把 `skip`/`todo` 计为 pass；不因缺少录屏或截图扣分（反过来也不得把录屏/截图当作必需证据要求提供）；不因文档/披露项而把其证据要求归零。

### 2.5 证据复用与失效

- 同候选、同输入/依赖/夹具、同命令、同环境、同配置的证据可以复用；候选、输入、依赖、契约、夹具、构建或配置变化时，受影响证据失效，只补失效部分。
- 复用必须在 E1 变更包中列出「复用理由 + 未失效依据」；验收核对候选哈希一致后才接受。
- 不得跨候选复用；不得用其它变更的证据替本变更背书；B0 基线证据只作对照，**B0 的 `phase4b` 截图与 `app/renderer/dist/` 入口不得作为当前候选证据**（B0 明确记录其入口为既有忽略产物、D1 必须按当前候选重建后重跑）。
- 管理记录（`docs/planning/`、`docs/scheduling/`、`docs/communication/`、`docs/acceptance/`、各角色 `docs/change/`）不纳入产品候选，其哈希变化不影响产品候选有效性；但 E1 变更包须把「产品候选」与「治理/证据记录」分开列明。
- 测试整体性：一个测试套件作为一条命令整体运行；不得把同一套件拆给多个角色再拼成「全量通过」。

### 2.6 无 task_ops

本项目没有 `.ans/project.json` 任务配置（§1.4），未启用 task_ops。取证以文件哈希、原始命令输出、diff/status、`tasks.jsonl` 摘录、Electron E2E 输出为准；**不得伪造任务令牌、锁、审批、机器预检、验收凭证或 `docs/verification/` 记录**。

### 2.7 候选隔离与管理记录

- **产品候选**只列相对 B0 基线 HEAD `0a12310` 变化的闸门 2 写集路径（团队计划 §4.1/§4.3）：Model/事件/工具（`src/model/project-state.ts`（新，B-1）、`src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts`）；编排（`src/common/编排/{task-state,project-state,version-decision}.ts`、`src/pipeline/orchestration/run-role.ts`）；桌面窗口（`app/desktop/{session,interface}.ts`、`app/main.ts`、`app/preload.cjs`）；桌面UI（`app/renderer/src/chat/{TaskCenterPanel,ProjectStatePanel}.tsx`、`app/renderer/src/lib/platform.ts`、`app/renderer/src/shell/shell.css`；`app/renderer/src/chat/ipc.ts` 仅现有刷新钩子不足时按需）；i18n（`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`）；README（`README.md`、`README.en.md`）；测试（`test/编排/{project-state,version-decision,task-state,run-manifest,decision-card}.test.ts`、`test/桌面应用/{project-state,version-decision,chief-workflow}.test.ts`、`test/项目管理/shared/i18n.test.ts`、`test/桌面UI/project-state.test.ts`、`test/桌面UI/phase4b-electron-smoke.mjs`/`phase4b-smoke-preload.cjs` 按需）。
- **候选标识**：E1 变更包中的候选快照——HEAD、`git status --porcelain -uall | sort` 快照 SHA-256、逐文件 `git hash-object` + `sha256sum`；新增文件同。验收在分发前与合并后各核对一次（E2 时执行）。
- **B-1/B-2 边界条目**（`角色卡/运行时核心/*`、`角色卡/桌面窗口/*`）是闸门 2 确认的人事治理变更（H1），记录但不计入产品候选；除 B-1/B-2 外无边界变更。
- **管理记录**（`docs/planning/`、`docs/scheduling/`、`docs/communication/`、`docs/acceptance/`、角色 `docs/change/` 证据目录）不混入产品候选；本 V1 本身是管理记录；`app/renderer/dist/` 为忽略产物、非候选。
- 并发写同一产品文件且未隔离的，按候选不可复算处理；不得把他人改动算入本候选，也不得用混入候选的证据判 pass。

---

## 三、验收项（AC-1–AC-10）

### 3.0 总表与方案映射

| ID | 可核对标准 | 所需证据 | 证据路径（计划） | 候选标识 | 产出角色 | 结果 | 判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1 | 全局状态视图正确、只读、部分结果、裁剪、有界、零写入（AC-1.1–AC-1.8） | `project-state:get` 载荷原文；`project_state` 工具文本；账本/manifest/文档前后哈希；坏行/坏 manifest 错误计数；裁剪/截断/字节数；计数断言 | E1 变更包引用的原始日志/JSON；D1 记录；测试原始输出 | E1 候选快照 | 编排（A1）、桌面窗口（A2）、桌面UI（A4）、测试（D1） | 未实施/未判定 | 待 E2 |
| AC-2 | 幕僚备注受控、可审计、不改机器事实（AC-2.1–AC-2.4） | `project.focus`/`project.note` 账本行；前后哈希；视图更新；重启重建；非法输入回执 | 同上 | E1 候选快照 | 桌面窗口（A2）、测试（D1） | 未实施/未判定 | 待 E2 |
| AC-3 | 版本决策卡与决定层级（AC-3.1–AC-3.8） | 工具注入清单；卡载荷；`request.created/presented/resolved`；judge 字段；拒绝/中止回执；requestId/attempt/通知去重 | 同上 | E1 候选快照 | 运行时核心（A0）、编排（A1）、桌面窗口（A2）、测试（D1） | 未实施/未判定 | 待 E2 |
| AC-4 | 版本修改执行（AC-4.1–AC-4.6） | `version.decision` 事件；targetVersions；manifest/文档前后哈希；版本化守卫回归；legacy 锚点 | 同上 | E1 候选快照 | 编排（A1）、桌面窗口（A2）、测试（D1） | 未实施/未判定 | 待 E2 |
| AC-5 | 新版本开发执行（AC-5.1–AC-5.6） | 新 flow/run manifest；旧 flow 全部活动 run 的 `closed`/`closeReason`；orphan 事件；旧产物哈希；focus 事件；执行期 pinned 失败终态 | 同上 | E1 候选快照 | 编排（A1）、桌面窗口（A2）、测试（D1） | 未实施/未判定 | 待 E2 |
| AC-6 | 边界：不绕过验收/证据/写权/闸门/其他机制（AC-6.1–AC-6.7） | 既有验收/证据/写守卫/run-change 套件原始输出；保护路径零 diff/哈希对照；卡面文案 | 同上 + T3 全量回归 | E1 候选快照 | 桌面窗口、编排、测试、验收 | 未实施/未判定 | 待 E2 |
| AC-7 | 审计与 UI 一致性（AC-7.1–AC-7.5） | 账本事件序列；系统行原文；`project-state:get` 与任务中心计数；UI 测试；i18n 两语言 | 同上 | E1 候选快照 | 桌面窗口（A2）、桌面UI（A4）、项目管理（A3）、测试（D1） | 未实施/未判定 | 待 E2 |
| AC-8 | 兼容、并发、恢复（AC-8.1–AC-8.6） | 旧账本/旧白名单重放；重启对账事件；并发/重试/通知去重；部分失败记录；轮转测试 | 同上 | E1 候选快照 | 编排（A1）、桌面窗口（A2）、测试（D1） | 未实施/未判定 | 待 E2 |
| AC-9 | 测试、构建、证据（AC-9.1–AC-9.5） | 测试 diff/计数；`typecheck`/`typecheck:renderer`/`build:renderer` 退出码；T3 全量回归；E2E 原始输出/截图；候选哈希 | D1 记录 + E1 变更包 + E2 报告 | E1 候选快照 | 各实施角色、项目管理（A3）、测试（D1）、独立验收（V1/E2） | 未实施/未判定 | 待 E2 |
| AC-10 | 文档与状态如实（AC-10.1–AC-10.3） | 方案/复核/团队计划哈希与状态行；沟通确认小节；README 中英事件清单；角色卡零改动；旧记录零改动 | 文档哈希/diff；E1 变更包 | E1 候选快照 | 策划（P1.2）、装配（A5）、统筹、验收 | 未实施/未判定 | 待 E2 |

**映射自检**：AC-1–AC-10 与方案 §9.2 的 AC-1–AC-10 **一一对应**；子项编号与内容逐条保留（AC-1.1–1.8、AC-2.1–2.4、AC-3.1–3.8、AC-4.1–4.6、AC-5.1–5.6、AC-6.1–6.7、AC-7.1–7.5、AC-8.1–8.6、AC-9.1–9.5、AC-10.1–10.3），未拆分、未合并、未删减、未弱化。本文件新增的只是证据记录字段、判定方法、R1–R5 核对项（来自闸门 2 确认的团队计划与复核披露）与 T3 证据口径；这些**不新增产品行为要求**，不得被用来扩大范围或加严方案。

**团队计划 §7.1 覆盖自检**：project-state 只读/部分结果/裁剪/有界/零写入 → AC-1.4/1.5/1.6/1.7；focus/备注/审计 → AC-1.2、AC-2、AC-7.1/7.2；版本决策卡/拒绝/超时/中止/重试/新版本开发/全部旧 run 关闭/orphan/保留 → AC-3、AC-4、AC-5、AC-8.4/8.5；pinned/run-change 边界 → AC-3.3、AC-4.6、AC-6.6；审计/重试/崩溃窗口 → AC-7.1、AC-8.3/8.4；UI/i18n → AC-7.3/7.4、AC-9.1/9.2；验收/证据/写权/闸门不变 → AC-6。

### 3.1 AC-1 全局状态视图正确且只读（方案 §9.2 AC-1）

**标准（可核对语句）**

- **AC-1.1 载荷字段**：`project-state:get`（UI 完整结构化视图）与 `project_state`（幕僚/治理角色工具文本摘要投影）返回 focus、flows、tasks、blockers、versions、evidence、notes、nextStep、generatedAt（工具含 errors/truncated 摘要），字段与方案 §3.3 一致；UI 与工具使用同一 `buildProjectStateView`，不各自派生；`blockers` 按 §3.4 的 kind（`task-blocked`/`task-failed`/`request-pending`/`rework-pending`/`redispatch-exhausted`/`version-drift`/`reference-invalid`/`run-ambiguous`/`focus-stale`/`chief-note`）派生（`rework-pending` 即方案 §3.4 的 `acceptance-rework`，v1.1 起按 D-04 撤除残留守卫要求改用的内部枚举 id；语义不变，见 §1.6）；证据指针只是指针，不读正文、不判断有效性；缺失版本化文档按 `latest:undefined`，不误报 `reference-invalid`。
- **AC-1.2 focus 规则**：最新有效 `project.focus` → 使用，`selectedBy:"chief"` 或 `"application"`；`cleared:true` → `focus:none`（尊重清除，不再自动派生）；无事件且**恰好一个**有活跃 run/未收口任务的 flow → `selectedBy:"derived"`；多个候选或无候选 → `selectedBy:"none"` 并列出候选；**不得**自动选最新创建的 `-c`；指针指向已关闭/不存在 flow/run → `focus.stale=true` 并列出候选，不自动改。
- **AC-1.3 多活跃 run**：同一 flow 多个活跃 run 全部列出；active 标记由 `deriveActiveRunFromManifests` 按冲突/优先级规则派生（pinned 优先；多 pinned 冲突）；版本决策未带 `runId` → `run-ambiguous`，不发卡；带有效 `runId` → 正常进入决策；视图不擅自只选一个。
- **AC-1.4 部分结果**：坏账本行/manifest 不可读/文档扫描失败 → 返回可读部分 + `errors[]`，错误计数准确，不抛、不阻塞；**1 个非法 manifest + 1 个合法 manifest** 时，合法 flow 仍返回且其 active run 标记仍正确（由 `scanRunManifestsForState` 部分结果经 `deriveActiveRunFromManifests` 派生，不调用 all-or-nothing 的 `findActiveRun`）；非法项进 `errors[]`；既有 `listRunManifestsResult` 的 all-or-nothing 语义不被本视图改变。
- **AC-1.5 读操作零写入**：调用前/后 `tasks.jsonl`、`.ans/runs/*/manifest.json`、相关文档哈希不变；不产生 `.ans/state/project*.json` 等第二状态文件；读路径不调用 `appendTaskEvent`；不缓存为第二份状态；`generatedAt` 标明快照时间。
- **AC-1.6 裁剪**：chief 完整视图；其他内置治理角色只看到 focus flow/run/阶段、自己的任务（`targetRoleId===roleId` 或 `from===roleId`）、相关 flow 的未收口计数与阻塞摘要、focus 版本/证据指针、公开 nextStep；看不到其他角色任务正文、全部 flow 明细、幕僚私有备注全文（`chief-note` 只给 kind+摘要，除非 `refs` 指向该角色）；项目 worker 默认**无** `project_state` 工具（O3 未选）。
- **AC-1.7 有界**：超过默认上限（50 个 flow、500 条任务、每 flow 20 条版本指针、50 条证据指针）时 `truncated=true` 且计数保留；幕僚工具文本输出 ≤8 KiB（沿 `ROLE_STATUS_MAX_BYTES`），超出有截断标注；不得无界返回全量账本。
- **AC-1.8 blocked/failed 分离**：`tasks[].blocked` 只在最后报告 `status==="blocked"` 时为 true；`tasks[].failed` 只在最后报告 `status==="failed"` 时为 true；`blockers` 的 `task-blocked`/`task-failed` 分开；计数不合并；`counts.blocked`/`counts.failed` 只统计活动 flow（不含 superseded），UI 文案标明「活动」；`counts.unclosed = state.unclosed.length`（含 superseded），`supersededUnclosed` 为其中子集，`activeUnclosed = unclosed - supersededUnclosed`（与 AC-7.3 一致）。

**判定方法**

1. 运行 `test/编排/project-state.test.ts`：覆盖 flow 合并、focus 规则（含 cleared/derived/none/`-c` 不猜）、多 run 歧义、blockers 各 kind、blocked/failed 分离、versions/evidence 指针、notes/nextStep、坏行/坏 manifest + 好 manifest、有界/裁剪、零写入（前后哈希）、轮转后视图、unclosed/superseded 计数。
2. 运行 `test/桌面应用/project-state.test.ts`：`project-state:get` 真实 IPC 形状、chief 工具注入、其他角色裁剪、备注事件、零写入、UI IPC 形状；读取 `project-state:get` 返回 JSON 原文核对字段与计数。
3. 对账本、manifest、版本化文档在读取前后计算 `sha256sum`；确认无第二状态文件（`ls .ans/state/` 对照）；确认读路径无 `appendTaskEvent`。
4. 构造/读取坏 manifest + 好 manifest 用例：断言好 flow 返回、active 标记正确、错误计数准确；读取 `run-manifest.ts` 确认 `listRunManifestsResult` 未被改写（或既有调用方语义不变）。
5. 对工具文本测量字节数（≤8 KiB）并检查截断标记；对默认上限之外的夹具断言 `truncated=true` 与计数。
6. 以不同治理角色（非 chief）与项目 worker 检查工具注入清单/裁剪视图；确认 worker 默认无工具。

**所需证据**

- `test/编排/project-state.test.ts`、`test/桌面应用/project-state.test.ts` 原始输出（命令、退出码、计数、逐断言）。
- `project-state:get` 返回 JSON 原文（含 focus/flows/tasks/blockers/versions/evidence/notes/nextStep/counts/truncated/errors）与工具文本原文/字节数。
- 读取前后账本/manifest/文档的 SHA-256 对照；`.ans/state/` 文件清单；无 `appendTaskEvent` 的代码/调用证据。
- 坏+好 manifest 用例的原始输出与 active 标记断言；`listRunManifestsResult` 未改动的 diff/哈希证据。
- 裁剪/注入矩阵的测试输出；轮转测试输出。

**失败示例/反例（任一即 fail）**

- 视图自动选最新 `-c`，或 focus 无事件/多候选时猜一个；`cleared:true` 后仍自动派生。
- 多活跃 run 未全部列出，或未带 `runId` 仍发版本决策卡。
- 坏 manifest 导致整个视图失败/合法 flow 丢失/active 标记错误；调用 all-or-nothing 的 `findActiveRun` 派生 active。
- 读取产生账本/manifest/文档写入或第二状态文件；读路径追加事件。
- 其他角色看到他人任务正文/全部 flow 明细；项目 worker 默认获得 `project_state`。
- 超上限无 `truncated`/计数丢失；工具文本超过 8 KiB 无截断。
- blocked/failed 合并计数，或 blocked/failed 统计包含 superseded flow；`counts.unclosed` 与任务中心 `unclosed` 不一致。
- 证据指针被写成证据有效性结论，或缺失文档被误报 `reference-invalid`。
- 只有纯函数测试、没有 `project-state:get` 真实 IPC 形状/零写入证据（按 §2.4 判 insufficient）。

**来源**：方案 §3.1–§3.6、§5.1、§5.6、§6.2、§6.6、§7.1、§9.2 AC-1；复核 F2/F3/F4/F7/F9、R1；团队计划 §6.1/§6.12、§7.1、§7.3.2。

### 3.2 AC-2 幕僚备注受控、可审计、不改机器事实（方案 §9.2 AC-2）

**标准（可核对语句）**

- **AC-2.1 set-focus**：指向存在的 flow（有 run/任务/文档任一）→ 追加 `project.focus` 事件；视图 focus 更新；指向不存在的 flow → `ok:false`、无事件；`cleared:true` 清除 focus 且视图为 `none`（不自动派生）；`runId` 可选，若给出则校验属于该 flow。
- **AC-2.2 blocker/next-step**：`noteKey` 最新 active 事件为准；`active:false` 解除；同 key/同文本幂等不产生语义重复（不新增第二条 active 语义）；文本超长（blocker ≤500、next-step ≤1000）拒绝、不截断；`refs` ≤5 个项目相对路径/任务 id。
- **AC-2.3 不改机器事实**：备注不能改变任务 status/closed、不能改变 run state/pin、不能写文档/manifest；视图把 `source:"chief"` 的备注与机器事实分列；备注不是批准、不是验收证据。
- **AC-2.4 审计与重建**：事件含 `roleId:"chief"`、时间、文本、`noteKey`/`refs` 可核对；重启后视图按当前账本重建备注/focus；账本轮转后只保证保留窗口内可回看（按 §4.7/§8.5，不声称永久审计）。

**判定方法**

1. 运行桌面/编排测试：set-focus 存在/不存在/清除；blocker/next-step active true/false/幂等/超长/refs 上限；断言 `tasks.jsonl` 事件行、视图 focus/notes/nextStep、任务/run/文档哈希不变。
2. 读取 `tasks.jsonl` 原始摘录：事件 kind、`roleId`、`at`、`noteKey`、`text`、`active`、`refs`；确认 append-only，无覆盖/删除。
3. 重启恢复测试：重建视图后 focus/notes/nextStep 与重启前一致（在保留窗口内）。
4. 检查 `project_note` 工具注入：仅幕僚；其他角色无写意图工具。

**所需证据**

- `project_note` 各 op 的测试原始输出与回执原文；`tasks.jsonl` 事件摘录。
- 前后账本/manifest/文档哈希对照；任务中心/视图前后状态对照。
- 重启重建测试输出；工具注入矩阵测试输出。

**失败示例/反例（任一即 fail）**

- 备注写入改变了任务 status/closed、run state/pin、manifest 或文档。
- 不存在的 flow 被接受；超长文本被截断而非拒绝；同 key 重复产生多条 active 语义。
- 事件缺 `roleId:"chief"`/时间/文本/refs 或不可核对；重启后备注丢失。
- 其他角色获得写意图工具。
- 备注被当作客户批准/验收证据。

**来源**：方案 §3.3、§3.5、§3.8、§5.2、§6.3、§9.2 AC-2；团队计划 §7.1。

### 3.3 AC-3 版本决策卡与决定层级（方案 §9.2 AC-3）

**标准（可核对语句）**

- **AC-3.1 工具注入与卡型**：`request_version_decision` 只注入幕僚会话（`governanceFunction==="chief"`）；其他内置角色/项目 worker 无该工具；不新增 `cardKind`（仍为 `decision`）；`DECISION_CARD_ALLOWED_ROLES` 仍为 `convener`/`rapporteur`，不扩大。
- **AC-3.2 参数校验**：`flowId` slug、`action` ∈ {`version-modify`,`new-version-development`}、`reason` 必填且 ≤1000 字、`refs` ≤5；非法 → `version-decision-invalid`，不发卡、不落 `request.created`。
- **AC-3.3 pinned 边界**：当前 run 为 pinned → `run-change-required`；不发版本决策卡；不改 run/manifest/文档；既有 run-change 三模式/显式入口行为不变。
- **AC-3.4 多 run 歧义**：同 flow 多个活跃 run 且未带 `runId` → `run-ambiguous`，不发卡；带有效 `runId` → 正常发卡；多 pinned 冲突按 `deriveActiveRunFromManifests`/既有规则 fail-closed。
- **AC-3.5 pending/重试/唯一 requestId**：同一 flow/run 未决版本决策 → `decision-pending`，只呈现一张卡；拒绝/中止后重试生成**新** requestId（永不复用），`attempt` 递增且仅作展示/审计；`requestNotifiedKeys` 不吞新请求的 created/resolved 通知；第二次未决时重启按 requestId 独立 orphan/resolve。
- **AC-3.6 卡形状与审计**：`request.created`/卡为 `application:true`、`sourceRoleId:"application"`、`cardKind:"decision"`、`flowId`、两个固定选项（`version-modify`/`new-version-development`）、恰一个 `recommended:true`（幕僚提议）；`validateDecisionCardRequest` 通过；客户/判断 agent 决定；`request.created`→`presented`→`resolved` 审计完整；卡面列事实清单，不生成应用第二建议。
- **AC-3.7 judge 代批**：判断 agent 代选时 `request.resolved.by="judge"`、`operatorId` 以 `judge:` 开头、`judge` 审计随行；回执/系统行写「判断 agent 代批，不是客户本人点击」。
- **AC-3.8 拒绝/超时/不可用/中止**：客户拒绝/关闭卡/通道超时/通道不可用/发起轮次中止 → `ok:false`，零执行；无 `version.decision(executed)`；拒绝/超时/不可用写 `request.resolved`（`declined`/`unavailable`）且不写 `version.decision`；发起中止写 `request.orphaned(reason:"initiator-aborted")` 且不写 `request.resolved`/`version.decision`；无部分机器效果。

**判定方法**

1. 检查工具注入清单：chief 有 `request_version_decision`；其他内置角色/worker 无；`request_choice` 不能发 decision 卡；`DECISION_CARD_ALLOWED_ROLES` 未变。
2. 运行 `test/编排/version-decision.test.ts`：参数校验、卡形状、答案映射、pinned/多 run/pending 拒绝、requestId/attempt、拒绝/中止/晚到、执行计划。
3. 运行 `test/桌面应用/version-decision.test.ts`：发卡/客户选择/judge 代批/拒绝/通道超时/通道不可用/发起中止/重试/第二未决重启/通知不被吞；读取 `request.*` 账本行与卡载荷。
4. 捕获回执/系统行原文：judge 措辞、拒绝「未执行任何改动」、中止「发起轮次已中止；未执行」。
5. 对账本断言：拒绝/超时/不可用无 `version.decision`；中止无 `request.resolved`；晚到答案无 `request.resolved`、只诊断/角色日志。

**所需证据**

- 工具注入/裁剪测试原始输出；`DECISION_CARD_ALLOWED_ROLES` 与卡型枚举的 diff/零改动证据。
- `version-decision.test.ts` 两层原始输出（命令、退出码、计数、逐断言）。
- `request.created/presented/resolved/orphaned` 账本摘录与卡载荷原文；judge 字段/回执原文。
- 重试/第二未决重启/通知去重测试输出；requestId 唯一性断言。

**失败示例/反例（任一即 fail）**

- 非幕僚获得 `request_version_decision`，或新增 cardKind/扩大 `DECISION_CARD_ALLOWED_ROLES`。
- 非法参数发卡/落 `request.created`；pinned/多 run/未决仍发卡。
- 拒绝/中止后复用 requestId，或通知被去重吞掉；`attempt` 参与 requestId 唯一性。
- 卡缺 `application:true`/`sourceRoleId`/flowId/两选项/恰一 recommended；`validateDecisionCardRequest` 失败仍呈现。
- judge 被写成客户本人，或回执缺「判断 agent 代批」。
- 拒绝/超时/中止产生机器效果或 `version.decision(executed)`；中止路径写 `request.resolved`。

**来源**：方案 §4.1–§4.4、§4.7、§4.8、§6.3、§7.2、§8.3、§8.4、§9.2 AC-3；复核 F1/F6/F10/F11/F12、R2；团队计划 §6.4/§6.9、§7.1。

### 3.4 AC-4 版本修改执行（方案 §9.2 AC-4）

**标准（可核对语句）**

- **AC-4.1 同一 flow/run**：执行后仍是同一 flow、同一 draft run；不创建新 flow/run；不改变 manifest state/文档/hashes。
- **AC-4.2 targetVersions**：`targetVersions` = 已存在文档的最新版本 + 1（intent/proposal/modules/roster/architecture/assets；topology 随 roster）；不存在的 kind 按 v1 建议；写入 `version.decision`（`status:"executing"`→`"executed"`）；不写任何文档。
- **AC-4.3 返回派发指令**：返回 `{action:"version-modify", decisionId, flowId, runId?, targetVersions, reason}`；应用不派发、不创建任务、不写文档、不 pin。
- **AC-4.4 版本化守卫**：角色随后新建 `-vN+1` 仍受 `versioned-doc-guard`：覆盖旧版被 `versioned-doc-overwrite` 拒绝，新增 vN+1 允许；旧版保留。
- **AC-4.5 legacy/无 run**：应用可尽力 `ensureDraftRun(flowId)` 作为后续锚点并写入 `version.decision.runId`；失败如实返回 `runAnchor:"unavailable"`，不伪造；旧 legacy 任务不变。
- **AC-4.6 不自动 pin/激活**：不自动 pin、不自动激活新版本；draft run 后续 pin 时仍按 `prepareRunPin` 取最新文档（既有行为）。

**判定方法**

1. 运行 `test/编排/version-decision.test.ts` 与桌面集成：版本修改执行前后 manifest/文档哈希、run 列表、flow 列表；断言无新 flow/run、state 不变、文档零写入。
2. 读取 `version.decision` 事件：`action`、`targetVersions`、`oldFlowId`/`oldRunId`、`status`、`decidedBy`/`operatorId`/`reason`。
3. 运行 `versioned-doc-guard` 既有测试：覆盖旧版被拒、新 vN+1 允许、旧版保留。
4. legacy 用例：`ensureDraftRun` 成功/失败两种路径的回执与账本记录。
5. 检查是否自动 pin/激活（无对应事件/状态变化）。

**所需证据**

- 版本修改测试原始输出；manifest/文档前后 SHA-256；`version.decision` 摘录。
- `targetVersions` 计算断言；返回派发指令原文。
- `versioned-doc-guard` 回归输出；legacy 锚点测试输出。

**失败示例/反例（任一即 fail）**

- 版本修改创建了新 flow/run，或改变 manifest state/文档/hashes。
- targetVersions 不是最新+1/缺失 kind 未按 v1 建议；写文档/自动 pin/激活。
- 覆盖旧版未被拒，或新增 vN+1 被误拒。
- legacy 锚点伪造/失败未如实返回；旧 legacy 任务被改动。
- 应用自动派发/创建任务。

**来源**：方案 §4.5、§4.9、§7.2、§9.2 AC-4；团队计划 §6.8/§6.11。

### 3.5 AC-5 新版本开发执行（方案 §9.2 AC-5）

**标准（可核对语句）**

- **AC-5.1 命名**：应用生成 `<oldFlowId>-next`；已存在依次 `-next2`、`-next3`…；校验 slug 合法且 ≤64 字符；超长尝试更短后缀 `-n2`/`-n3`，仍不合法 fail-closed（不截断）；幕僚不能自带任意 newFlowId；不产生 `-b/-c` 式 ad hoc 名称。
- **AC-5.2 新建与关闭范围**：`ensureDraftRun(newFlowId)` 创建新 draft；正常路径下旧 flow 的**全部**活动 run（含多个 draft）都 `closed`，`closeReason` 含 `superseded-by:<newFlowId>/<newRunId>`；请求的 `runId` 只作决策上下文（targetVersions/oldRunId），不限制关闭范围。执行前复核发现任一 `pinned`（异常前置或并发新 pin）→ fail-closed `run-change-required`，**不创建新 flow/run、不关闭任何 run、不 orphan 任何申请**；若关闭阶段并发出现 pinned 或关闭失败 → 停止关闭其余 run，按 §8.4 记 `failed`/`uncertain`，如实回报已关闭/未关闭项，不谎称旧 flow 已关闭。
- **AC-5.3 保留与 orphan**：旧 flow 文档/任务/manifest 保留（不删/不改）；未收口旧任务**不自动关闭**（视图按 supersede 标记，仍可核对）；旧未决申请追加 `request.orphaned(reason:"superseded")`；旧 `request.created` 保留。
- **AC-5.4 审计与 focus**：`version.decision(status:"executed")` 记录 old/new flow/run、`closedRunIds`、`orphanedRequestIds`、`targetVersions`（如适用）、`decidedBy`/`operatorId`/`reason`；追加 `project.focus` 指向 `newFlowId`/`newRunId`（`roleId:"application"`、`sourceDecisionId:decisionId`）；视图显示新旧映射。
- **AC-5.5 不越权**：应用不创建新 flow 的文档/角色/任务，不自动派发；幕僚从产品意图开始走五步链；客户闸门照旧；路线卡不是内容批准。
- **AC-5.6 执行期 pinned fail-closed（R3）**：旧 flow 有 pinned（异常前置）→ 执行前 fail-closed `run-change-required`，写 `version.decision(status:"failed", message:"run-change-required")` 作为可审计终态；不创建新 flow/run、不关闭任何 run、不 orphan 任何申请；重启对账不把它误判为 `uncertain`。

**判定方法**

1. 运行 `test/编排/version-decision.test.ts` 与 `test/桌面应用/version-decision.test.ts`：命名（`-next`/`-next2`/超长/非法）、新 draft、多个 draft 全部关闭、`closeReason`、runId 只作上下文、orphan、保留、不自动关任务/派发。
2. 读取旧 flow 全部 manifest：断言所有活动 run 的 `state:"closed"` 且 `closeReason` 含 `superseded-by:<newFlowId>/<newRunId>`；`closedRunIds` 与 manifest 集合一致。
3. 计算旧文档/任务/manifest 前后 SHA-256；确认保留且未改写；旧未收口任务未被 `task.closed`。
4. 读取 `version.decision` 与 `project.focus` 事件；核对字段与归属。
5. 构造执行前 pinned 用例：断言 `failed/run-change-required`、无新 flow/run、无关闭、无 orphan；重启对账不写 `uncertain`。
6. 构造关闭阶段并发 pinned/关闭失败用例：断言停止其余关闭、`failed`/`uncertain`、已关闭/未关闭列表如实。

**所需证据**

- 新版本开发测试原始输出；新/旧 manifest 原文与 `closedRunIds` 断言。
- 旧文档/任务/manifest 前后哈希；旧未收口任务账本摘录。
- `version.decision`/`project.focus`/`request.orphaned` 账本摘录。
- 执行前 pinned 与关闭阶段失败的测试输出；重启对账输出。

**失败示例/反例（任一即 fail）**

- 只关闭请求带的 runId，未关闭旧 flow 全部活动 run；`closeReason` 缺 `superseded-by:<newFlowId>/<newRunId>`。
- 执行前发现 pinned 仍创建/关闭/orphan，或未写 `failed/run-change-required`，或被 F5 误判 `uncertain`。
- 删除/改写旧文档/任务/manifest；自动关闭旧未收口任务；未 orphan 旧未决申请。
- 新 flow 文档/角色/任务被应用自动创建或自动派发；幕僚可自带 newFlowId/ad hoc `-b/-c`。
- focus 未切到新 flow/run，或 `version.decision` 缺 old/new/closedRunIds/orphanedRequestIds。
- 关闭失败仍声称旧 flow 已关闭/成功。

**来源**：方案 §4.3、§4.6、§4.7、§4.9、§7.2、§8.4、§9.2 AC-5；复核 F8、R3/R4；团队计划 §6.4/§6.5/§6.11。

### 3.6 AC-6 边界：不绕过验收/证据/写权/闸门/其他机制（方案 §9.2 AC-6）

**标准（可核对语句）**

- **AC-6.1 不是验收卡**：版本决策卡不是验收卡；不产生验收结论/客户批准；新版本仍需独立验收按确认版本写标准并判断；卡面明确「路线≠内容批准/不是验收」。
- **AC-6.2 验收/证据不变**：`evidence_check`、证据路径/规范物证规则、验收卡/返工路由、`request_requirement_change` 的既有测试通过；相关受保护文件零改动（除非本任务明确授权的事件 schema 加法扩展，且不改变验收语义）。
- **AC-6.3 写权/边界不变**：幕僚仍不能写 `.ans/**`、`docs/proposals|contracts`、角色卡；应用只写账本/manifest；角色写文档仍受 Section 1/`resolveWrite`/版本化守卫；shell 守卫不变。
- **AC-6.4 客户闸门不变**：意图/方案/角色指派实质变化仍重开闸门 0/1/2；路线卡不替代；同对象/同版本/同范围的有效确认可复用，但路线卡本身不是确认。
- **AC-6.5 需求变更通道不变**：`request_requirement_change` 通道/语义不变；版本决策不能批准范围/授权/成本变化。
- **AC-6.6 run-change 不变**：三模式/显式入口/提案卡冻结路径不变；不新增 run-change 自动批准；不复活 `run-change-auto-approve`；版本决策不触发/不替代 run-change。
- **AC-6.7 不自动修复/不追溯**：不自动修复当前修仙 run；不追溯改 `xianxia-brotato-b/-c` 或 proposal/roster 历史；不自动删除/覆盖旧产物。

**判定方法**

1. 运行既有验收/证据/写守卫/版本化只读/run-change 套件（如 `test/桌面应用/run-change.test.ts`、`run-change-entry.test.ts`、验收相关套件、`test/门禁引擎/versioned-doc-guard*.test.ts`、`test/编排/task-state.test.ts` 等）并记录结果。
2. 对受保护文件做 `git diff`/哈希对照：`src/common/编排/run-manifest.ts`、`decision-card.ts`（默认只读）、`versioned-doc-guard.ts`、`governance-roles.ts`、验收/证据相关文件；确认零改动或仅有本任务授权的加法扩展且语义不变。
3. 检查卡面/工具描述：写明只读/申请≠批准/路线≠内容批准/不写文档/不派发；检查判 judge 语义未变（仍选唯一 recommended）。
4. 检查 run-change 触发点：版本决策不调用 run-change；无自动批准分支。
5. 检查 diff：无自动修复/追溯/删除旧产物逻辑。

**所需证据**

- 既有护栏套件原始输出（命令、退出码、计数、失败原文）。
- 受保护文件零改动清单与基线/候选哈希对照。
- 卡面/工具描述原文；run-change 触发/自动批准相关 diff。
- 旧产物/历史文件零改动证据。

**失败示例/反例（任一即 fail）**

- 版本决策卡被当成验收结论/客户批准，或新 flow 绕过验收/证据规则。
- `evidence_check`/证据路径/验收卡/返工路由被改动或弱化；受保护文件被越权修改。
- 幕僚获得 `.ans/**`/`docs/proposals|contracts`/角色卡写权；应用写文档。
- 路线卡替代客户闸门/需求变更批准；run-change 自动批准被新增/复活。
- 自动关闭/删除/改写旧产物，或自动修复当前修仙 run。

**来源**：方案 §1.4、§4.8、§4.9、§7.4、§9.2 AC-6、§10.3；团队计划 §1.3、§8.10。

### 3.7 AC-7 审计与 UI 一致性（方案 §9.2 AC-7）

**标准（可核对语句）**

- **AC-7.1 审计序列**：**每次进入执行**的版本决策有 `request.created`/`presented`/`resolved` + `version.decision`（`executing`→终态）；客户拒绝/通道超时/通道不可用只要求 `request.created` + `request.resolved`（`declined`/`unavailable`，不执行、无 `version.decision`）；发起轮次中止要求 `request.created` + `request.orphaned(initiator-aborted)`（不写 `request.resolved`、无 `version.decision`、不执行）；晚到答案只记诊断/角色日志，不写 `request.resolved`；append-only；不含密钥/完整 prompt/隐私（任务正文只以摘要出现）。
- **AC-7.2 judge/customer 可区分**：判断代批与客户决定在账本/系统行可区分；`by`/`operatorId`/`judge` 字段随行；不把 judge 写成客户。
- **AC-7.3 UI 数据同源与计数**：UI 项目状态区数据只来自 `project-state:get`；不重新扫描文件或重新派生；`counts.unclosed === state.unclosed.length`（含 superseded，与任务中心一致）；`supersededUnclosed` 是子集；`activeUnclosed = unclosed - supersededUnclosed`；`blocked/failed` 只算活动 flow 并在 UI 标「活动」；UI 文案/标签经 i18n，中英成对、无中文泄漏。
- **AC-7.4 聊天系统行**：覆盖请求/决定/拒绝/执行结果/部分失败；判断代批写「判断 agent 代批，不是客户本人」；拒绝/超时写「未获选择；未执行任何改动」；新版本开发完成写新建 flow/run、旧 flow 活动 run 已关闭（superseded）、请从产品意图开始；部分失败如实写哪一步成功/失败，不写「已完成」除非机器部分确认完成；噪声控制：不为 created/presented 各发一条系统通知（只发 resolved 结果行或等价）。
- **AC-7.5 任务中心边界**：任务中心仍是逐任务动作面（收口/终止/重派）；全局面板只做聚合/导航；面板动作不直接改账本（O4 未选）；两者是同一账本的两个投影，不是两套状态。

**判定方法**

1. 读取 `tasks.jsonl` 原始事件序列：执行/拒绝/超时/中止/晚到分别核对 AC-7.1 的组合；断言 append-only、无密钥/完整 prompt。
2. 读取 `request.resolved` 与系统行原文：`by`/`operatorId`/`judge` 字段；judge 措辞。
3. 读取 `project-state:get` 返回 JSON 与任务中心 `unclosed`：断言计数公式；UI 测试断言不重新扫描/派生；i18n 两语言 key/文案。
4. 捕获系统行：请求/决定/拒绝/执行/部分失败；检查噪声控制（created/presented 是否刷屏）。
5. 检查面板与任务中心职责：无面板直接写账本路径（O4 未选）。

**所需证据**

- `tasks.jsonl` 事件序列摘录（执行/拒绝/超时/中止/晚到）；
- 系统行原文；`request.resolved` 字段摘录。
- `project-state:get` JSON 与任务中心计数断言；UI/ i18n 测试原始输出。
- 面板/任务中心职责的代码/diff 证据。

**失败示例/反例（任一即 fail）**

- 拒绝/超时/中止出现 `version.decision` 或错误组合（中止写 resolved、拒绝写 orphaned、晚到写 resolved）。
- judge 被写成客户，或系统行缺代批措辞。
- UI 重新扫描/派生；`counts.unclosed` 与任务中心不一致；superseded/active 差值错误；blocked/failed 计入 superseded。
- 系统行把部分失败写成「已完成」，或缺少拒绝/执行结果覆盖；created/presented 刷屏。
- 面板直接改账本，或任务中心被改造成聚合面。

**来源**：方案 §4.4、§4.7、§5.1–§5.6、§7.2、§9.2 AC-7；复核 F4/F6/F11、R2；团队计划 §6.7/§6.10/§6.12。

### 3.8 AC-8 兼容、并发、恢复（方案 §9.2 AC-8）

**标准（可核对语句）**

- **AC-8.1 旧账本/旧 flow/legacy/轮转**：旧 `tasks.jsonl`（无新事件）可读；旧任务无 flow/run 归「未归属」；legacy/draft/pinned 显示正确；不迁移、不改旧文件；账本 5 MB × 3 轮转后视图按当前账本重建，focus 可能回退到 derived/none（不声称永久审计）；轮转后视图行为测试通过。
- **AC-8.2 旧 app 读新账本**：新 kind 被旧白名单记为坏行/错误计数，不阻塞、不丢数据；升级回来可读（用测试模拟旧白名单）。
- **AC-8.3 重启/崩溃窗口**：重启视图重建；未决申请 orphaned(restart)；`version.decision(executing)` 对账为 executed/uncertain；「`request.resolved` 已写、无 `version.decision`」崩溃窗口写 `uncertain`（message `resolved-without-execution-record`）并通知幕僚、不自动执行；扫描排除已 `request.orphaned` 的请求；执行期 pinned 的 `version.decision(failed/run-change-required)` 不被误判为 uncertain；不重复创建新 flow/run。
- **AC-8.4 并发/重试**：同一 flow/run 只一张未决卡；并发第二个 `decision-pending`；拒绝/中止后重试使用新 requestId，`requestNotifiedKeys` 不吞通知；第二个未决时重启按 requestId 独立 orphan/resolve；执行串行；新 flow 命名唯一。
- **AC-8.5 超时/中止（R2）**：通道超时/通道不可用 → 零执行，写 `request.resolved`（`declined`/`unavailable`），不写 `version.decision`；发起轮次中止 → 零执行，未决申请 `request.orphaned(reason:"initiator-aborted")`，不写 `request.resolved`、不写 `version.decision`；晚到答案不写 `request.resolved`、只记诊断/角色日志；无部分机器效果。
- **AC-8.6 部分失败**：`failed`/`uncertain` 如实记录已完成/未完成（如新 flow 已建、旧 run 关闭失败）；视图显示；不声称成功；可重试/人工处理。

**判定方法**

1. 运行兼容/轮转测试：旧账本/旧白名单模拟、legacy/draft/pinned 视图、轮转后 focus 行为。
2. 运行重启恢复测试：未决 orphaned(restart)、executing 对账、resolved→executing 崩溃窗口、F5 排除 orphaned、执行期 pinned failed 不误判、不重复建 flow。
3. 运行并发/重试测试：pending 去重、第二未决重启、requestId 唯一、通知不吞、执行串行、命名唯一。
4. 运行超时/中止测试：核对 `request.resolved` vs `request.orphaned` 组合与零执行。
5. 运行部分失败测试：核对 `failed`/`uncertain` 记录与回执/视图。

**所需证据**

- 兼容/轮转/重启/并发/超时中止/部分失败测试原始输出。
- `tasks.jsonl`/manifest 事件摘录；通知记录；回执原文。
- 旧账本/旧白名单模拟输出；轮转后视图输出。

**失败示例/反例（任一即 fail）**

- 旧账本不可读/被迁移/旧文件被改；新 kind 阻塞旧 app 或丢数据。
- 重启重复创建新 flow/run；executing 未对账；resolved→executing 崩溃窗口无 uncertain/通知；F5 把执行期 pinned failed 误判 uncertain；F5 扫描未排除 orphaned。
- 并发产生两张未决卡/重复执行；重试复用 requestId/通知被吞。
- 超时/中止语义错误（AC-8.5 任一组合错误）；有部分机器效果却声称零执行。
- 部分失败写成成功。

**来源**：方案 §8.1–§8.5、§9.2 AC-8；复核 F1/F5/F6/F7、R2/R3；团队计划 §6.3/§6.4/§6.9/§6.10。

### 3.9 AC-9 测试、构建、证据（方案 §9.2 AC-9）

**标准（可核对语句）**

- **AC-9.1 测试覆盖与不弱化**：新增/扩展测试覆盖方案 §9.1：`test/编排/project-state.test.ts`、`test/编排/version-decision.test.ts`、扩展 `task-state.test.ts`/`run-manifest.test.ts`/`decision-card.test.ts`；`test/桌面应用/project-state.test.ts`、`version-decision.test.ts`、扩展 `chief-workflow.test.ts`；`test/项目管理/shared/i18n.test.ts`；`test/桌面UI/project-state.test.ts`。不删除测试文件、不新增 `skip`/`todo`、不放宽断言保绿；R1–R4 专项用例存在。
- **AC-9.2 typecheck/build**：`npm run typecheck` 通过；因改渲染层，`npm run typecheck:renderer` 与 `npm run build:renderer` 通过；记录退出码与原始输出。
- **AC-9.3 T3 全量回归**：对当前候选执行 §5.4 全量回归；新增确定性失败为 0；既有失败（Windows symlink EPERM、`write-sequencing.test.ts` 挂起）按 B0 基线单独列出；排除 `write-sequencing.test.ts` 必须记录命令与原因。
- **AC-9.4 证据记录**：记录候选版本/改动路径/哈希/命令/环境/退出码/计数；截图最多、不得要求录屏；缺录屏不判失败；证据来自当前候选真实运行、关闭 DEBUG 覆盖层。
- **AC-9.5 独立验收**：独立验收按客户确认的同一版本（P1.1 + P1.2 窄收口 + 团队计划）写标准并判断；本方案不声称通过；V1 不声称通过；E2 由同一验收主上下文判定并写唯一 B2。

**判定方法**

1. 对测试 diff 逐文件核对：`git diff --diff-filter=D --name-only` 无删除；`git diff -U0` 无新增 `skip(`/`todo(`；断言强度不降低；R1–R4 用例逐项存在。
2. 运行受影响套件（§5.3）与 T3 全量（§5.4），记录命令、环境、退出码、计数、失败原文；与 B0 对照。
3. 运行 `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`，记录退出码与输出。
4. 运行 Electron E2E（§5.6），记录 `report.json`/原始输出/截图/入口哈希；不可跑记录可复核原因。
5. 核对 E1 变更包候选身份与证据路径；核对 V1/E2 记录。

**所需证据**

- 测试 diff 与迁移/新增映射；R1–R4 用例位置与断言。
- 受影响套件 + T3 全量回归原始日志（命令、cwd、环境、退出码、计数、失败原文）。
- 三个 npm 命令原始输出与退出码。
- E2E 原始输出/`report.json`/截图哈希/入口哈希；不可跑原因（如有）。
- E1 变更包；E2 报告；V1 路径/版本。

**失败示例/反例（任一即 fail）**

- 删除测试文件、新增 `skip`/`todo`、放宽断言或删除负例以保绿。
- `npm run typecheck`/`typecheck:renderer`/`build:renderer` 非 0 或未执行（未执行按 insufficient，视原因）。
- T3 全量未在当前候选执行、计数不可复算、新增确定性失败 > 0、或把既有失败算作通过。
- 排除 `write-sequencing.test.ts` 未记录命令/原因/既有依据。
- 声称 E2E 通过但无原始输出/候选/入口哈希，或未跑且无可复核原因。
- 以录屏作为证据或要求提供录屏。
- 本方案/V1 声称已通过。

**来源**：方案 §9.1–§9.3、§10.2、§10.3、§9.2 AC-9；复核 F7/F13；团队计划 §7.3。

### 3.10 AC-10 文档与状态如实（方案 §9.2 AC-10）

**标准（可核对语句）**

- **AC-10.1 方案状态如实**：方案 P1.2 标注版本 P1.2、日期、草案状态、R1–R5 窄修订、F1–F13 处置、P1.0 复核快照 103 行 / `3b8d3a3a…` 与再复核记录 148 行 / `22128e59…` 分开；方案写盘时未实施/未测试；不声称复核结论/复核批准、客户闸门 1 或实施授权（以沟通记录为准）；沟通 P1.2 核对记录存在（1302 行 / `1573e1ef…`）；历史状态行（如「待沟通核对 P1.2」）不作为 fail 依据，也不得被引用为当前未确认的依据。
- **AC-10.2 角色卡/README 对齐**：角色卡/工具描述与新行为的对齐列为后续独立事项（方案 §11.2）；本任务只改 `src/provider/runtime/schema.ts` 的工具描述，不改 `角色卡/**` 文本（H1 B-1/B-2 除外）；README 中英事件清单（`README.md`/`README.en.md` 的 `TaskStateEvent` 清单）按实施阶段同步新增 `project.focus`/`project.note`/`version.decision`，中英一致。
- **AC-10.3 旧记录不改写/关系披露**：旧设计/旧验收记录/旧团队计划不改写；与 run-change/需求变更/验收返工的关系按方案 §4.8/§4.9 披露；复核记录未被作者改写。

**判定方法**

1. 读取方案 P1.2 头/§13 与沟通确认小节：版本/行数/哈希/状态；确认未把复核/团队计划/V1 当客户确认或实施授权；历史状态行按 §九.3 处理。
2. 对 `角色卡/**` 做 `git diff`：除 H1 的 B-1/B-2 条目 + changelog 外无改动；`src/provider/runtime/schema.ts` 工具描述与方案一致。
3. 对 `README.md`/`README.en.md` 做 diff：事件清单同步、中英一致、无旧形状。
4. 对旧设计/旧验收/旧团队计划/复核记录做 diff/哈希对照：零改动；方案 §4.8/§4.9 关系披露存在。

**所需证据**

- 方案/复核/团队计划/沟通记录哈希与状态核对记录。
- `角色卡/**`、`schema.ts` diff/哈希对照；README 中英 diff。
- 旧文件零改动证据；关系披露原文位置。

**失败示例/反例（任一即 fail）**

- 实施/验收文档声称已验收、已发布、已获客户确认或实施授权，但无对应记录。
- 把复核结论、团队计划或 V1 当成客户确认或实施授权。
- 角色卡文本被改动（除 H1 B-1/B-2 外），或 README 只改一种语言/未同步事件清单。
- 旧设计/旧验收/旧团队计划被改写或删除；复核记录被改写。
- 把 P1.0 复核快照 103 行 / `3b8d3a3a…` 当作当前 148 行 / `22128e59…` 记录。

**来源**：方案 §4.8/§4.9、§11.2、§13、§9.2 AC-10；复核 R5/F13；团队计划 §7.1/§7.3、§4.3（A5）。

---

## 四、跨任务核对项（R1–R5）

### 4.0 总表与来源

| 核对项 | 来源 | 主题 | 最低证据 | 负责节点 | 映射 AC |
| --- | --- | --- | --- | --- | --- |
| R1 | 团队计划 §1.2/§6.2；复核 R1/F2 | active run 从部分扫描结果派生；坏+好 manifest 时合法 flow 的 active 标记仍正确；`listRunManifestsResult` 语义不变 | `scanRunManifestsForState`/`deriveActiveRunFromManifests` 测试输出；1 坏 + 1 好 manifest 用例；`run-manifest.ts` 零改动/既有测试 | A1、A2、D1 | AC-1.3、AC-1.4、AC-3.4、AC-5.2、AC-9.1 |
| R2 | 团队计划 §1.2/§6.3；复核 R2/F6 | 通道超时/不可用 → `request.resolved`（`declined`/`unavailable`）；发起中止 → `request.orphaned(initiator-aborted)`；晚到答案只诊断/角色日志 | 两层 `version-decision.test.ts` 输出；账本事件组合；晚到答案测试 | A1、A2、D1 | AC-3.8、AC-7.1、AC-8.5、AC-9.1 |
| R3 | 团队计划 §1.2/§6.4；复核 R3/F5 | 执行期 pinned → `version.decision(failed/run-change-required)`；F5 扫描排除已 orphaned 的请求；不误判 uncertain | 执行期 pinned 测试；F5 崩溃窗口测试；账本事件；重启对账 | A1、A2、D1 | AC-5.6、AC-8.3、AC-9.1 |
| R4 | 团队计划 §1.2/§6.5；复核 R4/F8 | `new-version-development` 关闭旧 flow 全部活动 run（含多个 draft）；`closeReason` 含 `superseded-by:<newFlowId>/<newRunId>`；`runId` 只作决策上下文 | 多 draft 用例；`closedRunIds`/manifest 断言；卡面文案 | A1、A2、D1 | AC-5.2、AC-9.1 |
| R5 | 团队计划 §1.2/§6.6；复核 R5 | P1.0 复核快照 103 行 / `3b8d3a3a…` 与再复核记录 148 行 / `22128e59…` 分开；复核记录未被改写 | 方案头/§13 文本与哈希；复核文件哈希；团队计划/沟通记录引用 | P1.2、沟通、D1/E2 | AC-10.1、AC-10.3 |

这些核对项来自闸门 2 确认的团队计划与复核披露，用于核对已确认方案的实施口径；**不新增产品 AC，也不得替代或弱化 AC-1–AC-10**。

### 4.1 R1 active run 从部分扫描结果派生（坏+好 manifest）

**标准（可核对语句）**

- **R1-a 部分扫描**：`scanRunManifestsForState` 逐 manifest 读取，返回可读 manifests + `errors[]`；单个非法/不可读 manifest 不丢弃其他 flow。
- **R1-b 活跃 run 派生**：`deriveActiveRunFromManifests` 从部分结果派生 active run，复用 `findActiveRun` 的冲突/优先级规则（draft/pinned；多 pinned 冲突；pinned 优先；否则最新 draft）；**不调用** all-or-nothing 的 `findActiveRun` 来派生视图 active 标记。
- **R1-c 既有 API 不变**：`listRunManifestsResult` 的 all-or-nothing 语义与既有调用方（`activeRunViews`/run-change 等）保持不变；`run-manifest.ts` 默认只读，若实施必须改需在 P1 报告（团队计划 §4.1）。
- **R1-d 测试**：1 个非法 manifest + 1 个合法 manifest：合法 flow 仍返回、其 active run 标记仍正确（按 draft/pinned 规则）、非法项进 `errors[]`、错误计数准确；另有多个 draft、多 pinned 冲突用例。
- **R1-e 版本决策前置**：`run-ambiguous`/`pinned`/多 run 判定使用部分派生结果；一个与 focus flow 无关的坏 manifest 不得使合法 focus flow 的版本决策前置整体失败。

**判定方法**

1. 读取 `src/common/编排/project-state.ts` 实现/测试：确认 `scanRunManifestsForState` 与 `deriveActiveRunFromManifests` 存在且被视图使用；grep 确认视图路径不调用 `findActiveRun`（或仅在非 active 标记用途）。
2. 运行 1 坏 + 1 好 manifest 用例：捕获返回的 flows/active 标记/`errors[]`/计数；断言合法 flow 完整。
3. 运行既有 `test/编排/run-manifest.test.ts`：确认 `listRunManifestsResult`/`findActiveRun` 既有语义不变。
4. 检查 `run-manifest.ts` diff/哈希：默认零改动；若改动有 P1 报告与语义不变证据。

**所需证据**

- `test/编排/project-state.test.ts` 的 R1 用例原始输出（命令、退出码、计数、断言）。
- 视图返回 JSON/文本中的 flows/active 标记/errors 摘录。
- `run-manifest.ts` diff/哈希；既有 `run-manifest.test.ts` 输出。
- 代码 grep/调用图证据（视图不调用 `findActiveRun`）。

**失败示例/反例（任一即 fail）**

- 坏 manifest 使合法 flow 丢失/active 标记错误，或视图仍调用 all-or-nothing `findActiveRun`。
- 修改 `listRunManifestsResult` 语义导致既有调用方回归，且无 P1 报告/兼容证据。
- 只有实现自述，无 1 坏 + 1 好 manifest 的测试输出。
- 无关坏 manifest 阻断版本决策前置。

**来源**：团队计划 §1.2/§6.2；复核 R1/F2；方案 §3.2 规则 3/10、§6.1、§6.4、§7.1、AC-1.4。

### 4.2 R2 通道超时/不可用 vs 发起中止的审计语义

**标准（可核对语句）**

- **R2-a 通道超时/不可用**：卡已呈现后通道超时/不可用 → 零执行；写 `request.resolved`（`choice:"unavailable"` 或方案等价 `declined` 分支，按实际原因区分），`by` 为 customer/judge；**不写 `version.decision`**；发卡前失败 → 不发卡、无 `request.created`。
- **R2-b 发起轮次中止**：发起轮次中止（含中止后才收到答案）→ 零执行；未决申请写 `request.orphaned(reason:"initiator-aborted")`；**不写 `request.resolved`、不写 `version.decision`**；晚到答案只记诊断/角色日志；幕僚可重新发起（新 requestId）。
- **R2-c 术语区分**：验收明确区分「通道超时/不可用」与「发起轮次中止」；时序图/契约/AC/测试口径一致；不得把「超时」笼统归入 resolved 或 orphaned。
- **R2-d 测试**：纯逻辑答案映射 + 桌面集成均覆盖 timeout/unavailable/initiator-aborted/late-answer；账本事件组合符合上述规则。

**判定方法**

1. 读取 `version-decision.ts` 的 `mapVersionDecisionAnswer`/执行计划与 `session.ts` 的 request 生命周期：确认 timeout/unavailable 与 abort 分支分开。
2. 运行 `test/编排/version-decision.test.ts` 与 `test/桌面应用/version-decision.test.ts`：捕获每类结果的事件组合。
3. 读取账本：断言 timeout/unavailable 有 `request.resolved` 无 `version.decision`；abort 有 `request.orphaned(initiator-aborted)` 无 `request.resolved`/`version.decision`；晚到无 `request.resolved`。
4. 对照方案 §4.4/§7.2/AC-7.1/AC-8.5 与实现，确认术语一致。

**所需证据**

- 两层测试原始输出；账本事件摘录（requestId、choice、reason、selectedOptionIds）。
- 回执/系统行原文；晚到答案诊断/角色日志。
- 代码 diff 与方案条款对照记录。

**失败示例/反例（任一即 fail）**

- timeout/unavailable 写 `request.orphaned`，或 abort 写 `request.resolved`。
- 任一零执行路径写 `version.decision` 或有机器效果。
- 晚到答案写 `request.resolved` 或执行。
- 术语/测试口径混用，只测一类。
- 只有实现自述、无账本事件证据。

**来源**：团队计划 §1.2/§6.3；复核 R2/F6；方案 §4.4、§4.7、§7.2、AC-7.1、AC-8.5。

### 4.3 R3 执行期 pinned 失败终态与 F5 排除 orphaned

**标准（可核对语句）**

- **R3-a 执行前复核**：开始执行时重读旧 flow 全部活动 run；发现任一 `pinned`（异常前置或与复核并发的新 pin）→ 立即返回 `run-change-required`；写 `version.decision(status:"failed", message:"run-change-required")` 作为可审计终态；**不创建新 flow/run、不关闭任何 run、不 orphan 任何申请**。
- **R3-b F5 排除 orphaned**：重启「resolved 无执行记录」扫描只纳入 answered 的 `request.resolved`（有 `decisionId`、`selectedOptionIds` 为 `version-modify`/`new-version-development`）且**无对应 `request.orphaned`** 的请求；已 orphaned 的请求不进入推断。
- **R3-c 不误判**：执行期 pinned 的 `failed/run-change-required` 不被 F5 误判为 `uncertain`；无同 decisionId 的 `version.decision` 才写 `uncertain`（message `resolved-without-execution-record`）并通知幕僚，不自动执行。
- **R3-d 测试**：两层测试覆盖执行期 pinned fail-closed、F5 排除 orphaned、failed 终态不被误判 uncertain。

**判定方法**

1. 运行执行期 pinned 用例：捕获返回码、`version.decision` 事件、新/旧 flow/run 状态、关闭/orphan 记录。
2. 运行 F5 崩溃窗口用例：构造 `request.resolved` + 已 `request.orphaned`、以及未 orphaned 两种；断言前者不进 F5、后者写 `uncertain` 并通知；执行期 pinned `failed` 不写 `uncertain`。
3. 读取重启对账代码/diff：扫描条件按 R3-b；不自动执行/不重复创建 flow。
4. 对照方案 §4.6/§8.4/AC-5.6/AC-8.3。

**所需证据**

- 执行期 pinned 测试原始输出；`version.decision`/`request.*` 账本摘录。
- F5 两种请求的测试输出与通知记录；重启对账输出。
- 代码 diff 与条款对照。

**失败示例/反例（任一即 fail）**

- 执行期 pinned 仍创建/关闭/orphan，或未写 `failed/run-change-required`。
- F5 把已 orphaned 请求当 answered，或把执行期 pinned failed 误判 uncertain。
- F5 自动执行/重复创建第二个 flow。
- 缺测试或只有自述。

**来源**：团队计划 §1.2/§6.4；复核 R3/F5；方案 §4.6、§8.4、AC-5.6、AC-8.3。

### 4.4 R4 关闭旧 flow 的全部活动 run

**标准（可核对语句）**

- **R4-a 关闭范围**：`new-version-development` 关闭旧 flow 的**全部**活动 run（含多个 draft），不只请求带的 `runId`；每个关闭的 run `state:"closed"` 且 `closeReason` 含 `superseded-by:<newFlowId>/<newRunId>`。
- **R4-b runId 作用**：请求 `runId` 只作决策上下文（识别当前 run、计算 `targetVersions`/`oldRunId`），不限制关闭范围；卡面明确写「关闭旧 flow 的全部活动 run」。
- **R4-c pinned 异常**：执行前发现 pinned → fail-closed，不关闭任何 run（AC-5.2/AC-5.6）；关闭阶段并发出现 pinned 或关闭失败 → 停止其余关闭，`failed`/`uncertain`，如实回报。
- **R4-d 测试**：多 draft 用例断言 `closedRunIds` 含全部旧活动 run；单个请求 runId 不限制范围；卡面文案有「全部活动 run」。

**判定方法**

1. 运行多 draft 用例：读取旧 flow 全部 manifest 与 `version.decision.closedRunIds`；断言集合相等、全部 `closed`、`closeReason` 正确。
2. 检查请求只带其中一个 runId 时仍关闭全部。
3. 检查卡载荷/文案：含「关闭旧 flow 的全部活动 run」。
4. 运行 close 阶段失败/并发 pinned 用例：核对 `failed`/`uncertain` 与已关闭/未关闭列表。

**所需证据**

- 多 draft 测试原始输出；旧 manifest 原文；`closedRunIds` 断言。
- 卡载荷/文案原文。
- close 阶段失败/并发 pinned 输出。

**失败示例/反例（任一即 fail）**

- 只关闭请求的 runId，遗漏其他 draft。
- `closeReason` 不含 `superseded-by:<newFlowId>/<newRunId>`。
- `runId` 被当作关闭范围限制；卡面未写「全部活动 run」。
- 关闭阶段失败仍声称全部关闭。

**来源**：团队计划 §1.2/§6.5；复核 R4/F8；方案 §4.3、§4.6、§7.2、AC-5.2。

### 4.5 R5 复核快照引用口径

**标准（可核对语句）**

- **R5-a 两个快照分开**：方案 P1.2 文件头/§13 将 **103 行 / `3b8d3a3ad407a1da71940d9d26b8aaa98665f50fc2759daafc27c57a8ae3fc07`** 标为「P1.0 复核快照」；**148 行 / `22128e59904ab8de10ede64f7acc478069c752198fc3b87c043f5dab4434c5a8`** 标为「P1.1 再复核记录」；两者不混用。
- **R5-b 复核记录不改写**：复核记录保持原文（未被作者改写）；方案只在自身文件更新引用。
- **R5-c 团队计划/沟通一致**：团队计划 §1/§二与沟通 P1.2 核对记录同样区分两个快照；P1.2 哈希 `1573e1ef…` 为实施/V1 基线。
- **R5-d 验收核对**：E2 核对方案/复核/团队计划/沟通记录中的行数与 SHA-256；把 P1.0 快照当当前记录判 `insufficient evidence`/fail（AC-10.1）。

**判定方法**

1. 读取方案 P1.2 头/§13、复核记录、团队计划 §1/§二、沟通 P1.2 核对记录：核对行数/哈希/称谓。
2. 计算复核记录与方案当前 SHA-256；与上述值对照；确认复核记录未被改写（与历史快照一致或仅追加再复核节）。
3. 检查是否有把 103 行 / `3b8d3a3a…` 当作当前记录的引用。

**所需证据**

- 四份文档的行数/SHA-256 实测记录与引用原文。
- 复核记录未被改写的 diff/哈希证据。

**失败示例/反例（任一即 fail）**

- 把 P1.0 快照 103 行 / `3b8d3a3a…` 当作当前复核记录，或把 148 行 / `22128e59…` 冒充 P1.0 快照。
- 复核记录被作者改写。
- 方案/团队计划/沟通引用互相矛盾且无历史说明。

**来源**：团队计划 §1.2/§6.6；复核 R5；方案 §13；沟通 P1.2 核对记录。

### 4.6 核对项与 AC 的关系及总体判定

- R1 支撑 AC-1.3/AC-1.4/AC-3.4/AC-5.2；R1 证据缺失/不满足 → 相关 AC 判 `insufficient evidence`/`fail`，总体不得通过。
- R2 支撑 AC-3.8/AC-7.1/AC-8.5；任一语义组合缺失 → 相关 AC `insufficient evidence`；出现 resolved/orphaned 双写或错误组合 → `fail`。
- R3 支撑 AC-5.6/AC-8.3；缺执行期 pinned 终态或 F5 排除 → 相关 AC `insufficient evidence`；误判/重复创建 flow → `fail`。
- R4 支撑 AC-5.2；未关闭全部活动 run → AC-5.2 `fail`（总体返工）。
- R5 支撑 AC-10.1/AC-10.3；引用混用/复核记录被改写 → AC-10 `fail`/`insufficient`。
- 总体结论要求：AC-1–AC-10 全部 pass，且 R1–R5 满足或按本节如实记录（无阻断项）；任何 `fail` → 返工；无 `fail` 但有 `insufficient evidence` → 证据不足，不得判 pass。

---

## 五、T3 依据与全量回归计划

### 5.1 T3 依据

- 技能 `references/testing.md` 的唯一定义：**T3 = 发布、共享抽象（Model/公共入口/跨模块契约）、治理或权限变更，或证据基础不确定；默认验证为全量适用回归 + 发布/共享抽象检查**。
- 方案 §10.3 定档 **T3**：新增治理决策权（幕僚提议、客户/judge 决定、应用执行 flow/run 生命周期）、任务账本共享契约加法扩展（`project.focus`/`project.note`/`version.decision`、`request.orphaned.reason`）、跨角色工具/UI/run 生命周期。
- 变更触及共享 Model（`src/model/runtime.ts`、新增 `src/model/project-state.ts`）、编排公共逻辑（`src/common/编排/`）、桌面 IPC/会话、渲染层与 i18n，符合 T3 的共享抽象/跨模块契约与治理变更判据。
- 闸门 2 已确认 T3 与验证口径（团队计划 §1.2/§8.4）；不把「大部分是只读视图/文档」当作降档理由；升档不降档。

### 5.2 受影响层与跨角色回归

| 层/角色 | 受影响内容 | 检查 |
| --- | --- | --- |
| 运行时核心（A0） | `src/model/project-state.ts`（新，B-1）、`src/model/runtime.ts` 事件/能力、`src/provider/runtime/{tools,schema}.ts` 三工具与描述 | 类型/事件/能力编译；工具注入才注册；`npm run typecheck` |
| 编排（A1） | `src/common/编排/task-state.ts`（新 kind/校验）、`project-state.ts`（派生/partial scan/active derive）、`version-decision.ts`（纯逻辑）、`src/pipeline/orchestration/run-role.ts` 透传；5 个编排测试 | 5 个测试文件 + `npm run typecheck`；R1–R4 专项 |
| 桌面窗口（A2） | `app/desktop/session.ts`（projectStateView/projectNote/requestVersionDecision/执行/审计）、`interface.ts`（IPC）、`app/main.ts`、`app/preload.cjs`；3 个桌面测试 | 3 个测试文件 + `npm run typecheck`；R2/R3/F5 |
| 桌面UI（A4） | `TaskCenterPanel.tsx`/`ProjectStatePanel.tsx`/`platform.ts`/`shell.css`；`test/桌面UI/project-state.test.ts`；phase4b 夹具按需 | UI 测试 + `npm run typecheck:renderer` + `npm run build:renderer`；E2E |
| 项目管理（A3） | `src/common/shared/i18n/messages/{zh-CN,en-US}.ts`；`test/项目管理/shared/i18n.test.ts`；P1 审核 | i18n 计数/parity/占位符；`i18n-guard` 回归；`npm run typecheck` |
| 装配（A5） | `README.md`/`README.en.md` 事件清单 | 中英一致、无旧形状；`npm run test:assembly`（如适用） |
| 测试（D1） | T3 全量回归/E2E/证据 | 全量命令、typecheck/build、E2E、失败分类、候选哈希 |
| 人事（H1） | B-1/B-2 边界（治理，非产品候选） | md/yaml/changelog 一致；boundary 校验；不计入产品 AC 但记录 |
| 独立验收（V1/E2） | 本文件、E2 报告 | 按本文件判定；唯一 B2 |

跨角色回归必须覆盖：全局状态派生（flow/focus/task/blocker/version/evidence）、备注事件、版本决策卡/决定/拒绝/超时/中止/重试、版本修改/新版本开发、旧 flow 全部 run 关闭/orphan/保留、pinned/run-change 边界、审计/重启/崩溃/部分失败、UI 同源/计数/i18n、旧账本兼容、验收/证据/写权/闸门不变。

### 5.3 受影响套件命令（团队计划 §7.3.2；实际以仓库脚本/runner 为准）

| 层 | 命令（worktree 根执行） | 证据 |
| --- | --- | --- |
| 编排（A1） | `node --test --test-concurrency=1 test/编排/project-state.test.ts test/编排/version-decision.test.ts test/编排/task-state.test.ts test/编排/run-manifest.test.ts test/编排/decision-card.test.ts`；`npm run typecheck` | R1 坏+好 manifest/active；focus/裁剪/有界/零写入；R2/R3/R4；新事件/旧行；卡形状；typecheck |
| 桌面窗口（A2） | `node --test --test-concurrency=1 test/桌面应用/project-state.test.ts test/桌面应用/version-decision.test.ts test/桌面应用/chief-workflow.test.ts test/桌面应用/run-change.test.ts test/桌面应用/run-change-entry.test.ts`；`npm run typecheck` | IPC/裁剪/备注/零写入；发卡/决定/拒绝/超时/中止/重试/通知/新版本开发/恢复；run-change 不变 |
| 项目管理（A3） | `node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts test/项目管理/shared/i18n-guard.test.ts`；`npm run typecheck` | i18n 成对/占位符/计数/P1 审核 |
| 桌面UI（A4） | `node --test --test-concurrency=1 test/桌面UI/project-state.test.ts`；`npm run typecheck:renderer`；`npm run build:renderer` | 面板只读/同 builder/两语言/无本地派生 |
| 装配（A5） | README diff/中英事件清单核对；`npm run test:assembly`（如适用） | 事件列表同步 |
| 测试/T3（D1） | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`；`npm run typecheck`；`npm run typecheck:renderer`；`npm run build:renderer`；Electron E2E（§5.6） | 全量 pass/fail/skip、既有失败分类、新增确定性失败 0；E2E 输出/截图（至多、不录屏） |

命令若因仓库实际脚本/runner 不同而调整，须在 E1 变更包中记录实际命令、原因与等价性；不得用不可运行的示例命令冒充结果。

### 5.4 T3 全量回归口径

- 命令（worktree 根执行；实际 runner 以仓库脚本为准）：

```bash
node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')
```

- **排除项**：`test/pi-adapter/write-sequencing.test.ts` 是仓库既有已知挂起测试（历史记录 39+ 分钟无进展、CPU 约 2339s；客户已决定排除）。排除时必须记录可复现命令、原因与既有验收依据（`docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604`）；**不得静默跳过，不得把排除当通过**。
- **Windows symlink EPERM**：仓库既有环境失败（历史全量基线 9 项，分布于 claude/codex/pi/runtime-core/编排），与本变更无关；报告中必须单列并区分「既有失败」与「本次新增确定性失败」；不得把既有失败算作通过，也不得算作本变更新增失败。
- 记录：命令、工作目录、环境（Node/npm、OS/Shell）、退出码、测试计数（pass/fail/skip/todo）、失败原文（不截断关键堆栈）、执行时间；按 B0 基线（受影响套件 44/44、typecheck 0、smoke 64/0）对照；**新增确定性失败必须为 0，新 skip 必须为 0**。
- 全量回归必须针对**当前候选**执行；候选变化（代码/测试/夹具/配置/构建）使结果失效，需重跑受影响部分或全量。

### 5.5 typecheck、typecheck:renderer、build:renderer

- `npm run typecheck` 必须通过并记录退出码 0 与原始输出。
- 本任务改渲染层（`app/renderer/**`、UI 测试、i18n、preload/IPC 类型），必须执行 `npm run typecheck:renderer` 与 `npm run build:renderer` 并记录退出码 0、构建产物与入口哈希；不得只跑主进程 typecheck。
- 构建产物 `app/renderer/dist/` 为忽略产物、非产品候选；E2E 入口必须由当前候选重新构建，记录 `index.html`/asset 哈希。

### 5.6 Electron E2E 与截图规则

- **运行形式**：按 B0 记录，`node test/桌面UI/phase4b-electron-smoke.mjs` **不能运行**（harness 以 ESM 命名导入 electron 的 `app/BrowserWindow/ipcMain`，plain Node 下 CJS 包不支持命名导出，立即 `SyntaxError`、exit 1）；必须按 harness 文件头既有方式用 Electron 二进制：
  `./node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs app/renderer/dist/index.html <ASCII 临时 outDir>`
  必要时只读执行 `node_modules/.bin/electron test/桌面应用/e2e/main.mjs`（桌面窗口所有）；不新建 e2e 脚本。
- **候选要求**：D1 必须按当前候选重新 `npm run build:renderer` 后运行；记录入口 `app/renderer/dist/index.html` 与关键 asset 的 SHA-256、候选哈希、命令、窗口尺寸、`report.json`（checks/failures/console/CSP）。
- **截图规则**：最多截图，不要求录屏；截图来自当前候选真实运行、关闭 DEBUG 覆盖层，记录 SHA-256、候选版本、拍摄命令/窗口尺寸；不得以录屏作为验收要求或选项；缺少录屏不构成 fail/insufficient。
- **不可跑**：记录可复核原因（命令、错误原文、环境）；相关 AC 判 `insufficient evidence`（除非客户书面确认不再需要），不得把不可用写成通过。B0 已证明 harness 与真实 Electron 环境可运行，实施后默认不存在「不可跑」的正当理由。

### 5.7 原始输出、哈希与证据路径

- 每次检查记录：命令原文、工作目录、环境（Node/npm、OS/Shell）、退出码、测试计数（pass/fail/skip/todo）、失败原文（不截断关键堆栈）、执行时间；跳过项写明原因。只给「全部通过」摘要不算原始证据。
- 候选身份：每个改动/新增文件 `git hash-object` + `sha256sum`（工作区；CRLF/LF 差异分别记录）；新增文件同。
- 改动范围：`git status --short`、`git diff --name-only`、`git diff --cached --name-only`；逐路径核对团队计划 §4.1/§4.3 写集与 B-1/B-2；写集外改动记录基线/候选哈希对照，证明零改动。
- 测试 diff 用 `git diff -U0` 片段证明无弱化断言；测试删除/迁移逐条列明。
- 证据路径：D1 记录 `角色卡/测试/docs/change/2026-11-02-global-task-state-D1-regression.md` + 证据目录；各实施角色原始证据随 E1 变更包提交（路径 + SHA-256；如落仓库仅限该角色既有 `docs/change/` 写区）；项目管理 P1 审核 `角色卡/项目管理/docs/change/2026-11-02-global-task-state-P1-review.md`；E1 变更包 `docs/scheduling/global-task-state-change-v1.md`；E2 报告 `docs/acceptance/global-task-state-report-v1.md`；`docs/acceptance/` 只放标准与报告。
- 禁止：伪造命令/输出/令牌/锁/审批；改断言保绿；跳过来源；把设计/计划写成已实施；把摘要当原始证据；用其它变更证据替本变更背书；写 `docs/verification/`；要求或提供录屏。

### 5.8 升档与停止条件

- 实施中出现以下任一，停止并回报统筹/沟通，按方案 §10.3/团队计划 §5.4 处理（重开闸门、升档）：
  - 改验收判定/验收卡/证据路径/`evidence_check`、写权/边界/`resolveWrite`/`TaskScope`/forbiddenWritePaths、shell 守卫、版本化文档只读保护；
  - 改客户三道闸门、人事 D3/`appointment-write`、run-change 三模式/自动批准、`request_requirement_change`；
  - 给幕僚直接决定权、让应用自动派发/自动写文档/自动创建角色/任务、让新版本开发绕过客户闸门或验收；
  - 新增 `cardKind`、扩大 `DECISION_CARD_ALLOWED_ROLES`、新增未列路径（含额外 Model、`test/桌面应用/` 其他新文件、新 e2e 脚本、`package.json`、共享导出）；
  - 写集/边界/档位变化，或需要新增未列角色；
  - 证据不足以建立跨模块/全量/E2E 结论（候选不可复算、R1–R5 缺失、全量失败未分类）。
- 升档后本文件标准不因升档而放宽；标准变更按 §1.2 处理（递增版本、记录理由、交沟通/统筹确认）。
- 证据不足时按 `references/testing.md` 升到更高档补证，最高至全量回归；不得以时间紧降档。

---

## 六、成功、失败与边界情形（判定观察点）

| 情形 | 预期观察 | 判定 |
| --- | --- | --- |
| 无 focus、多个活动 flow | `selectedBy:"none"` + 候选列表；不猜最新 `-c`；不发起版本决策 | 自动选 `-c`/猜 focus → AC-1.2 fail |
| 有 focus、多个 draft run | 全部列出；版本决策未带 runId → `run-ambiguous`，不发卡 | 擅自选一个/发卡 → AC-1.3/AC-3.4 fail |
| focus run 为 pinned | `run-change-required`；不发版本决策卡；指向既有 run-change 入口 | 发版本决策卡/改 run → AC-3.3 fail |
| 1 个坏 manifest + 1 个好 manifest | 好 flow 返回、active 标记正确；坏项进 `errors[]`；错误计数准确 | 好 flow 丢失/active 错 → AC-1.4/R1 fail |
| 读全局状态 | 前后账本/manifest/文档哈希不变；无第二状态文件 | 产生写入/第二状态 → AC-1.5 fail |
| 非 chief 读视图/worker | 只看到自己任务 + focus 聚合；worker 无工具 | 越权可见/worker 有工具 → AC-1.6 fail |
| 超上限 | `truncated=true`；计数保留；工具文本 ≤8 KiB | 无界/超 8 KiB → AC-1.7 fail |
| blocked/failed | 分开计数；blocked/failed 只算活动 flow；unclosed 含 superseded、superseded 子集、active 差值 | 合并/口径错 → AC-1.8/AC-7.3 fail |
| set-focus/blocker/next-step | 追加事件；视图更新；任务/run/文档哈希不变；重启重建 | 改机器事实/丢备注 → AC-2 fail |
| 客户拒绝/通道超时/不可用 | `ok:false`；`request.resolved`（declined/unavailable）；无 `version.decision`；零执行 | 写 version.decision/执行 → AC-3.8/AC-8.5/ R2 fail |
| 发起轮次中止 | `request.orphaned(initiator-aborted)`；无 `request.resolved`/`version.decision`；晚到只诊断/角色日志；零执行 | 写 resolved/执行 → AC-3.8/AC-8.5/R2 fail |
| judge 代选 | `by:"judge"`、`operatorId` 以 `judge:` 开头；回执「判断 agent 代批，不是客户本人」 | 写成客户/缺措辞 → AC-3.7 fail |
| 拒绝/中止后重试 | 新 requestId；attempt 递增；通知不被吞；第二未决重启独立 | 复用 requestId/吞通知 → AC-3.5/AC-8.4 fail |
| 版本修改 | 同一 flow/run；targetVersions 最新+1；不写文档/不 pin/不派发 | 新 flow/写文档/自动 pin → AC-4 fail |
| 新版本开发 | 新 flow/run；旧 flow 全部活动 run closed + `superseded-by:<newFlowId>/<newRunId>`；旧申请 orphaned(superseded)；旧产物保留；旧任务不自动关闭；focus 切新 | 只关一个 run/删旧产物/自动关任务 → AC-5/R4 fail |
| 执行期 pinned（异常前置） | `failed/run-change-required`；不创建/不关闭/不 orphan；F5 不误判 uncertain | 仍执行/误判 uncertain → AC-5.6/AC-8.3/R3 fail |
| 关闭阶段并发 pinned/关闭失败 | 停止其余关闭；`failed`/`uncertain`；如实回报已关闭/未关闭 | 谎称全部关闭 → AC-5.2/AC-8.6 fail |
| resolved→executing 崩溃 | 重启写 `uncertain`（`resolved-without-execution-record`）+ 通知；不自动执行；排除已 orphaned | 自动执行/无记录 → AC-8.3/R3 fail |
| 部分失败 | `failed`/`uncertain` 如实记录已完成/未完成；视图显示；不称成功 | 写成功/隐藏 → AC-8.6 fail |
| UI 计数 | `counts.unclosed === state.unclosed.length`；superseded 子集；active 差值；blocked/failed 标「活动」 | 与任务中心不一致 → AC-7.3 fail |
| UI/聊天 | 数据只经 `project-state:get`；系统行覆盖请求/决定/拒绝/执行/部分失败；judge 代批措辞；不刷屏 | 重扫派生/缺系统行/写成客户 → AC-7.4/7.5 fail |
| 旧账本/旧白名单 | 旧记录可读；新 kind 在旧白名单记坏行但不阻塞、不丢数据；升级可读 | 迁移/阻塞/丢数据 → AC-8.1/8.2 fail |
| 旧 flow/legacy/轮转 | legacy/draft/pinned 正确；轮转后视图重建、focus 可回退；不声称永久审计 | 崩溃/伪造 → AC-8.1 fail |
| 验收/证据/写权/闸门 | 既有测试通过；受保护文件零改动；卡面明确路线≠批准 | 弱化/越权/替代闸门 → AC-6 fail |
| 测试质量 | 无删测/新 skip/放宽；R1–R4 用例存在 | 删测/放宽 → AC-9.1 fail |
| typecheck/build | `typecheck`、`typecheck:renderer`、`build:renderer` 均 exit 0 | 非 0/未执行 → AC-9.2 fail/insufficient |
| T3 全量回归 | 当前候选执行；新增确定性失败 0；新 skip 0；既有失败分类 | 未执行/计数不可复算/新增失败 → AC-9.3 fail/insufficient |
| E2E | 当前候选重建后用 Electron 二进制运行；原始输出/`report.json`/截图/入口哈希 | 伪造/无原因/plain node 冒称 → AC-9.4 insufficient/fail |
| 写集 | 仅在团队计划 §4.1/§4.3；B-1/B-2 外无边界改动 | 越界 → AC-10/总体 fail |
| 文档状态 | P1.2/复核/团队计划/沟通引用如实；README 中英同步；角色卡零改动；旧记录保留 | 虚假声明/混用快照/改写旧记录 → AC-10 fail |
| 录屏/截图缺失 | 方案未要求录屏 | 不构成 fail/insufficient |

---

## 七、与团队计划、写集与授权边界

- 写集以闸门 2 确认的团队计划 §4.1/§4.3 为准：运行时核心（`src/model/project-state.ts`（新，B-1）、`src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts`）；编排（`src/common/编排/{task-state,project-state,version-decision}.ts`、`src/pipeline/orchestration/run-role.ts`、5 个 `test/编排/*` 文件）；桌面窗口（`app/desktop/{session,interface}.ts`、`app/main.ts`、`app/preload.cjs`、3 个 `test/桌面应用/*` 文件，其中两个新文件为 B-2）；桌面UI（`app/renderer/src/chat/{TaskCenterPanel,ProjectStatePanel}.tsx`、`lib/platform.ts`、`shell/shell.css`、`test/桌面UI/project-state.test.ts`、phase4b 夹具按需）；项目管理（i18n 两文件 + `test/项目管理/shared/i18n.test.ts` + P1 审核记录）；装配（`README.md`/`README.en.md`）；测试（`角色卡/测试/docs/change/` 证据，`test/测试/` 默认不新增）；人事（H1 B-1/B-2 边界）。验收按该写集核对 `git diff --name-only`/`git status --short`；任何角色不得写其他角色路径、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界（B-1/B-2 由人事执行）。
- **B-1**：运行时核心新增 `src/model/project-state.ts`；**B-2**：桌面窗口新增 `test/桌面应用/project-state.test.ts`、`test/桌面应用/version-decision.test.ts`；两者已由客户在闸门 2 确认（团队计划 §4.5）。除 B-1/B-2 外无边界变更；无新增/拆分/合并角色、无 id/显示名/职责变更。
- **默认只读**：`src/common/编排/run-manifest.ts`、`decision-card.ts`、`workflow-preconditions.ts`、`versioned-doc-guard.ts`；R1 partial scan/active derive 放 `project-state.ts`，不改 `listRunManifestsResult` 的 all-or-nothing 语义。若实施必须改 `run-manifest.ts`/`decision-card.ts`，仍在编排目录内但需在 P1 报告并附语义不变证据。
- **不改** `package.json`/锁/构建/发布配方；不改 `app/renderer/dist/`（忽略产物）；不 commit/push/merge/release（团队计划 §八）。验收通过只表示当前候选满足本标准，不授权提交/推送/合并/发布。
- **无 task_ops**；不伪造机器状态、凭证、锁或审批。H1 边界补登是闸门 2 确认的人事治理变更，不计入产品候选；其完成状态由统筹/人事确认。

---

## 八、版本冻结与报告安排

- 本文件路径固定为 `docs/acceptance/global-task-state-criteria-v1.md`，版本 **v1.1**（v1 的窄更正，见 §1.6），日期 **2026-11-02**；写盘即冻结，标准先于实施。
- **本文件由内置独立验收（技能内置管理角色，不是项目 `角色卡/独立验收` worker）的唯一验收主上下文撰写；实施后的 E2 由同一主上下文判定**，只写一份 `docs/acceptance/global-task-state-report-v1.md`、一个总体结论。若采用并行取证，E1–E4 是同一验收角色的只读上下文编号，不是角色/子验收；判断与 B2 仍由主上下文唯一作出（`references/acceptance-parallel-evidence.md`）。
- 实施前：沟通确认本文件路径/版本（团队计划 §5.3 V1 出口）；未确认不派实施。本文件不因实施授权已给而失效；实施授权另记。
- 实施后：统筹提交 E1 变更包（`docs/scheduling/global-task-state-change-v1.md`：候选哈希、改动路径、节点 G2–E3、证据链接、T3、复用/失效说明）；独立验收按本文件判定并另写 E2 报告；报告首行至少含风险档位 T3、判定依据、选定检查、复用证据、消费者重测结论、T3 全量回归结果（含排除项）、E2E 状态、候选哈希、结论。
- 报告核心为逐项验收表（§2.1）；总体结论只能是**通过 / 返工 / 证据不足**，不得用「基本完成」「全部通过」等模糊措辞替代。
- 本文件不包含任何候选判定、通过/返工/证据不足结论；不做验收结论的提前预告。
- 本文件写盘后的行数与 SHA-256 由沟通/E1 在外部记录（沟通记录/变更包）；不写入本文件自引用最终哈希。
- 标准变更：递增版本、记录理由、交沟通/统筹确认；候选变化不改变标准，只使受影响证据失效并补证。
- 验收通过不授权提交、推送、合并、发布；这些另行授权（团队计划 §八）。验收通过只表示当前候选满足 V1。

---

## 九、写标准时发现的待澄清项与只读核对结果（只报告，不修改）

以下为只读核对发现的事实/文档状态/口径问题，供统筹/沟通/策划处理；本文件**未修改**方案、复核、团队计划、沟通记录、角色卡、产品源码或测试，也未自行放宽标准。除明确说明外，这些问题不改变本文件的判定力度；如方案/客户后续澄清与本文件理解不同，按 §1.2 递增版本重判。

1. **分支名与 worktree 名差异**：团队计划以 worktree `flow-improvements-wave1` 指代本工作区，实际 `git branch --show-current` 为 `feat/acceptance-return-card`，HEAD `0a12310…` 与团队计划/B0 一致；B0 已记录该事实。不是产品/基线缺口；验收以 HEAD + 候选哈希为准，不以分支名判定。
2. **沟通记录为并发追加的管理记录**：写标准时 134 行 / `0ef4ba72…`；团队计划文件头引用「91 行 / `a25e6cf8…`」，方案文件头引用闸门 0 快照「83 行 / `baf327b9…`」。验收引用其确认小节（闸门 0/闸门 2/实施授权/H1/B0/P1.2 核对），不以旧快照哈希替当前记录，也不混用。
3. **方案 P1.2 文件头历史状态行**：方案 P1.2 头仍写「待沟通核对 P1.2」；沟通记录已有「P1.2 核对记录」（1302 行 / `1573e1ef…`，通过核对，作为实施/V1 基线）。该状态行是写于核对之前的历史事实；验收以沟通记录与方案冻结哈希为准，不把历史状态行当虚假声明，也不要求方案回写。
4. **E2E 命令形式**：团队计划 §7.3.2 写 `node test/桌面UI/phase4b-electron-smoke.mjs`；B0 实测 plain node 立即 `SyntaxError`/exit 1，必须按 harness 文件头用 `./node_modules/.bin/electron ...`（B0 §七）。本文件 §5.6 采用可运行形式并要求记录实际命令；这不是标准变更，而是对既有 harness 运行方式的如实核对。D1 不得用 plain node 形式冒充 E2E。
5. **B0 的 V1 缺失观察**：B0 记录读取时点 V1 不存在（并行产出中）；本文件写盘后该观察项关闭；P1 入口要求 V1 + B0 + H1 + P1.2 齐全，由统筹核对。
6. **`write-sequencing.test.ts` 与 Windows symlink EPERM**：均为既有基线问题，不属本变更；T3 全量回归按 §5.4 排除并记录，EPERM 单列分类；不得把排除/既有失败算作通过，也不得算作本变更新增失败。
7. **P1.2 与 P1.1 关系**：P1.1 1283 行 / `369f666a…` 是历史闸门 2 提到的版本；P1.2 1302 行 / `1573e1ef…` 是 R1–R5 窄收口后经沟通核对的实施/V1 基线；两者不是同一快照，不混用。复核记录 148 行 / `22128e59…` 未被改写；P1.0 复核快照 103 行 / `3b8d3a3a…` 另计。
8. **`test:assembly` 存在性**：`package.json` 存在 `test:assembly` 脚本；团队计划 §7.3.2 的「如适用」按仓库实际执行，不虚构结果。
9. **写标准时产品/测试零改动**：`git status --porcelain -- src app test` 为空；计划新增的 8 个源码/测试文件均不存在；HEAD 仍是旧实现。这些是「实施前标准」的基线事实，不构成任何实现判断。
10. **blocker kind 内部枚举 id 更正（v1.1，2026-11-02）**：D1 发现既有 D-04 撤除残留守卫命中新 blocker kind `acceptance-rework`，PM 裁决改名为 `rework-pending`；本文件 v1.1 仅把 AC-1.1 的枚举 id 更正为 `rework-pending`，语义/AC 强度/判定规则/T3/证据口径不变；E2 按 `rework-pending` 判定并在报告记录旧→新映射（详见 §1.6）。
11. **非阻断观察汇总**：以上 1–10 均为文档/命令形式/历史状态/基线事实/内部枚举 id 类观察，未发现阻断性设计或基线缺口；若 E2 时发现方案/契约实质变化，按 §1.2 停止并重开 V1。

---

**本文件状态：标准 v1.1 已冻结（v1 的窄更正，见 §1.6）；未判定任何候选；未声称本变更已实施、已测试或已验收。**
