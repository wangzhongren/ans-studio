# 独立验收报告 v2（E2b 复判）：shell 判拒后的客户确认通道 + 例行命令白名单扩容 + 回执/开关粒度（T3）

- 风险档位：**T3（治理/权限/审批语义变更）**（方案 v1.3 定档、团队计划 §1.2；本报告不降档）。
- 判定依据（唯一判据）：**实施前完成标准 V1** `docs/acceptance/shell-escalation-criteria-v1.md`（**1320 行 / SHA-256 `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b`**，AC-01–AC-35，未变更）；上位依据为方案 v1.3（857 / `6bd12a99…`）、readonly 客户裁定 A 澄清（124 / `6c568ee6…`）、团队计划（575 / `4d52bdf4…`）与闸门 0/1/2 + 实施/提交授权记录（`docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`，当前 **102 行 / `c69fef1f1a43bcd0b7b9786b027b45da0cf862ab9f498b089902dc50ea3a0c70`**）。
- 本轮对象：**E2b 复判**。首判报告 `docs/acceptance/shell-escalation-report-v1.md`（**193 行 / `464bec6a6cf2705495e812e5622e0521aa370b2e352e9404cb605370d5405a25`**，本报告**不修改**）判返工（31 pass / 3 fail / 1 insufficient）。本轮核对 R1/R2/R3/AC-19-E1 闭合后的**重冻候选**：E1 变更包 v2 `docs/scheduling/shell-escalation-change-v1.md`（**184 行 / SHA-256 `3803668387a25efbb7924b00ba09debcf259dbdb15430b93762e6ceb1b953061`**；首轮 182/`c9ff12b0…` 已被取代）与候选全集清单 v2 `C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\E1\candidate-manifest-final-v2.tsv`（**82 行 / `faaa87747d4f779fc770c27295f8648a2d9bca63d4abae2976e64c31acc31a84`**）。
- 选定检查：受影响角色层套件（门禁引擎/编排/运行时核心/桌面窗口/桌面UI/项目管理 shared）+ 跨层集成 + **T3 全量适用回归** + `npm run typecheck`/`typecheck:renderer`/`build:renderer` + **真实 Electron E2E 独立复跑**（E2E_PASS）+ 截图/审计 JSONL 哈希与内容核对 + R2 pending 只读探针。
- 复用证据：v2 的 52 个产品/测试文件中 **34 个与首轮清单逐字节相同**（blob+sha256 一致；首轮 51 + 新增 `test/桌面UI/judge.test.ts` = 52，其中 18 个变更/新增），未变文件的首轮证据按 V1 复用证据规则（同一文件字节、同一输入/依赖/命令；变更部分重验）复用；**18 个变更/新增文件**（R1/R2/AC-19/E2b 测试与 harness）全部在 E2b 重新验证。E1 v1/首判报告为返工依据，不冒充 v2 证据；B0 仅作基线对照。
- 消费者重测结论：`src/model/runtime.ts`（新增 `pending` 契约支）消费方、门禁引擎、编排、桌面窗口、桌面UI、shared i18n 均在 E2b 独立复跑范围（编排 639、runtime-core 282、桌面应用 444、桌面UI 352、shared 155、全量 3345）；typecheck 全绿。
- 全量回归：**已执行**（`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`；worktree 根；**tests 3345 / pass 3318 / fail 9 / skipped 18 / todo 0 / cancelled 0**，exit 1，duration 247234.4634ms；9 项失败全部为既有 Windows symlink `EPERM`，与 B0 逐名相同；日志 `%TEMP%\ans-acceptance-e2b\full-suite.log`（4439 行 / `377f7dd8…`））。排除 `test/pi-adapter/write-sequencing.test.ts` 理由按团队计划 §6.3 / V1 AC-27。
- 总体结论：**通过（pass）**——AC-01–AC-35 **全部 pass**，无返工项、无证据不足阻断项；返工 R1/R2/R3 与补证 E1 均已独立核对闭合。本结论只判定当前候选，不授权提交/推送/合并/发布/发行。

> 证据根目录：`EV0 = C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence`（节点原始证据；D2b 在 `EV0\D2\09-run`）；`EV2b = C:\Users\51054\AppData\Local\Temp\ans-acceptance-e2b`（本轮 E2b 独立复跑证据）；`EV1 = C:\Users\51054\AppData\Local\Temp\ans-acceptance-e2`（首轮 E2 证据）。

---

## 一、判据、版本与冻结哈希核对（E2b 只读实测）

| 文档 | 要求（任务/E1 v2） | 实测 | 结果 |
| --- | --- | --- | --- |
| V1 完成标准 | 1320 / `0b724fa2…` | 1320 / `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b` | 一致（未变） |
| 方案 v1.3 | 857 / `6bd12a99…` | 857 / `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de` | 一致（未变） |
| readonly 澄清 A | 124 / `6c568ee6…` | 124 / `6c568ee626b8e4fa6487562364e23927c2812f64ae8c8753cc7ad9bfb2588dd4` | 一致（未变） |
| 团队计划 | 575 / `4d52bdf4…` | 575 / `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203` | 一致（未变） |
| E1 变更包 v2（重冻） | 184 / `38036683…` | 184 / `3803668387a25efbb7924b00ba09debcf259dbdb15430b93762e6ceb1b953061` | 一致 |
| 候选清单 v2 | 82 行 / `faaa8774…` | 82 / `faaa87747d4f779fc770c27295f8648a2d9bca63d4abae2976e64c31acc31a84` | 一致 |
| 首判报告 v1 | 193 / `464bec6a…`（E1 v2 引用） | 193 / `464bec6a6cf2705495e812e5622e0521aa370b2e352e9404cb605370d5405a25` | 一致（未被修改） |
| 沟通记录 | 102 / `c69fef1f…` | 102 / `c69fef1f1a43bcd0b7b9786b027b45da0cf862ab9f498b089902dc50ea3a0c70` | 一致 |

环境：Windows 11 Pro 10.0.26300 / Git Bash；Node `v24.22.1` / npm `11.19.1`；HEAD `9f670fb2c7d403baf995071055d697c50714c905`（无新提交）。

## 二、候选核对结果（E2b 入口实测）

- **逐文件复算**：按 v2 清单逐项 `git hash-object` + `sha256sum`，**82/82 一致，0 mismatch**（日志 `EV2b\manifest-check.log`）。其中产品/测试 **52**（app 14 + src 17 + test 21）、治理/记录 **30**（含 E1 v2 自身）。
- **工作树/暂存区**：`git status --porcelain` 82 行 = 56 `M` + 26 `??`，与 v2 清单**路径集合完全相同**（无新增、无遗漏、无改名/删除）；`git diff --cached --name-only` 为空；HEAD 未变。
- **发布/构建面**：`package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`electron-builder.yml`、`.github/workflows/release.yml`、`src/common/装配/release-policy.mjs` 均无 diff；`app/renderer/dist/` 为忽略产物、非候选。
- **边界**：B-1/B-2/B-3 三项与首轮一致（md/yaml 与 changelog 哈希同 v1 清单项）；无角色 id/显示名/职责描述变化。
- **task_ops/verification**：`.ans/project.json` 不存在；`docs/verification/` 不存在；未伪造机器状态。
- **E2b 自身写入**：本报告 `docs/acceptance/shell-escalation-report-v2.md` 与更新后的 memo 为 E2b 验收产物（写于 v2 冻结之后；v2 清单中的 memo 仍是首判版本 `d1be8d8a…`，且不含 v2 报告）。按 E1 v2 §一冻结规则，E3 提交前需重新冻结治理记录清单（见 §九）。

## 三、返工闭合独立核对（不信任回报）

| ID | 首判差异 | 修复实现（E2b 只读核对） | 新增/更新证据（E2b 实测） | 结论 |
| --- | --- | --- | --- | --- |
| **R1（AC-04）** | 升级卡缺脚本上下文摘要 | `app/renderer/src/chat/judge.ts` 新增 `escalationContextView`：把卡载荷 `approvalContext` 转为 header/note/npm/路径/label/sha256/写区外警示/有界内容（缺失/空 ⇒ 不渲染；`inWriteArea===false` 复用既有边界警示 key，不新增 key、不硬编码中文）；`ConfirmCard.tsx` 在 judge 与必要性区块之间渲染 `#se-context`/`se-context-*`（React 文本节点转义）；IPC 卡仍由 C1 原样携带 `approvalContext` | E2E D2b `SE_CONTEXT_BLOCK_*` 8 项 true（header/note/npm/path/sha/content/warning + 旧卡不渲染）；截图 `39-escalation-script-context.png`（`32520e7c…`）人工查看：header「脚本上下文（judge 判拒时所依据）」、说明、npm 脚本、路径、label、sha256、写区外警示、有界内容逐字可见；桌面UI 352/352（视图新增 2 条 + 源码合同断言）。E2b 独立 E2E 复跑同样 true | **闭合** |
| **R2（AC-09）** | 审批卡待答时升级申请被误判 expired、消耗申请权/额度 | A1 契约 `ShellEscalationDecision` 增第三支 `{action:"pending"; reason?}`（`src/model/runtime.ts:256`）；B1 registry 收到 pending 时**回滚** `requestedKeys`/`requestCount`、记录回 `recorded`、清除 `requestId`、**不写** `escalation-decision` 审计，回执稳定句「当前有 pending shell 确认卡，请稍后再申请（本次未弹卡）；未执行任何命令。」（`src/common/编排/shell-escalation.ts:485-491`）；C1 presenter 槽占用时返回 `{action:"pending", reason: main.operator.escalation.pending}`（`app/desktop/shell-escalation.ts:220-221`） | **独立只读探针**（`EV2b\probe-pending-v2.mjs` / `e2a954da…`）：第一次 → `state=pending`、消息含「当前有 pending shell 确认卡」「请稍后再申请」、无审计；审批解除后第二次 → presenter 再次调用、`state=denied`、恰 1 条 `escalation:denied` 审计（证明申请权/额度未被 pending 吞掉）。E2E D2b `SE_PENDING_*`（回执/非 expired-denied/无卡无审计/presenter 一次/审批释放/二次 allow-once/presenter 两次/卡带上下文/审计仅 allow）全部 true；截图 `41-escalation-pending-then-allow.png`（`a3ae7e1a…`）；集成 K 16/16；编排 639/638/1；桌面应用 444/444 | **闭合** |
| **R3（AC-35）** | A2/B1 报告缺状态行 | `角色卡/门禁引擎/.../A2.md` 首部新增「状态：`implemented-unverified`…」；`角色卡/编排/.../B1.md` 首部新增「状态：**implemented-unverified**（E2 返工 R3 要求补登…）」；两份报告其余内容为实现记录更新（A2 130 行 / `d56b8e06…`；B1 203 行 / `1ea61951…`，与 v2 清单一致）；无提前 `verified` 宣称 | 9 份 change 报告核对：A1/A2/A3/B1/C1/C2/D1/D2 均含 `implemented-unverified`，B0 为 `baseline-recorded`；`grep` 无「状态 verified」 | **闭合** |
| **E1（AC-19）** | 客户可见 retryHint 新措辞缺真实证据/断言 | `test/桌面UI/judge.test.ts:68` 与 `judge-row-view.test.ts:141` 在保留旧子串「关闭「替我审批」后重试」的同时新增「可让角色申请客户确认」断言；D1b 集成新增 L 跨层断言 | E2E D2b `SE_JUDGE_RETRY_HINT_NEW_WORDING=true`；截图 `40-judge-retry-hint.png`（`cf0d2e29…`）人工查看：判拒行详情展开显示「可让角色申请客户确认（允许一次 / 本会话允许该命令 / 拒绝），或关闭「替我审批」后重试（改为手动确认）。」；桌面UI 352/352；E2b 独立 E2E 复跑同样 true | **闭合** |

## 四、E2b 独立复跑证据

### 4.1 角色层套件与跨层集成（EV2b）

| 套件 | 命令 | 退出码 | 结果 | 日志（EV2b） |
| --- | --- | --- | --- | --- |
| 门禁引擎 | `node --test "test/门禁引擎/**/*.test.ts"` | 0 | 288 / 287 / 0 / 1 / 0 | `gate.log`（`fac8b8fe…`） |
| 编排 | `node --test "test/编排/**/*.test.ts"` | 1 | 639 / 638 / **1** / 0 / 0；唯一失败 = `shell-authorized-routine.test.ts:184`（既有 EPERM；B0 同名 :103） | `orchestration.log`（`a4cbc952…`） |
| 运行时核心 | `node --test "test/runtime-core/**/*.test.ts"` | 1 | 282 / 275 / **3** / 4 / 0（B0 同项 EPERM） | `runtime-core.log`（`fe249f70…`） |
| 项目管理/shared | `node --test "test/项目管理/shared/**/*.test.ts"` | 0 | 155 / 150 / 0 / 5 / 0 | `pm-shared.log`（`b5cecc6a…`） |
| 桌面应用（全部） | `node --test "test/桌面应用/*.test.ts"` | 0 | 444 / 444 / 0 / 0 / 0 | `desktop-app.log`（`f3ddd3a3…`） |
| 桌面UI | `node --test "test/桌面UI/**/*.test.ts"` | 0 | 352 / 352 / 0 / 0 / 0 | `desktop-ui.log`（`cc2eb58d…`） |
| 跨层集成 | `node --test --test-concurrency=1 "test/测试/shell-escalation-integration.test.ts"` | 0 | 16 / 16 / 0 / 0 / 0（含 K pending、L 措辞） | `integration.log`（`2fe85278…`） |
| shell-judge-verify | `node --test --test-concurrency=1 "test/测试/shell-judge-verify/*.test.ts"` | 0 | 38 / 38 / 0 / 0 / 0 | `judge-verify.log`（`f74ce25b…`） |
| 只读档既有断言 | `node --test "test/编排/shell-readonly.test.ts"` | 0 | 9 / 9；`ls/git status/node --version` 放行、`node --test→readonly-deny` 两项原断言通过；**文件未改**（blob `243f2d4f06ebea842e434602a677dfebc9c52d28`，同 v1） | `readonly.log`（`2fdb2cc5…`） |

只读档复核（客户裁定 A）：五类例行形态在只读档 `readonly-deny`、reason 档位按 A2 之前（review/risky）、不注入/不调用 `takeGrant`；`shell-gate.test.ts` 只读矩阵与 E2E `SE_READONLY_A_ROUTINE_DENY_MATRIX=true` 一致；`shell-readonly.test.ts` 未改且原断言原样通过。

### 4.2 白名单 0 卡 0 judge 与单一谓词（沿用 v1 结论 + E2b 复跑）

- `rg`：`matchRoutineShellCommand` 唯一定义 `classify-shell.ts:341`；分类器 `:508`、写守卫 `:540`、Service 出口 `shell-rules.ts:17`；无第二份实现；委托策略只接受原三 id。
- 门禁 288/287 全过；跨层集成 G；E2E `SE_WHITELIST_*`（项目/内置档 0 judge、审计 c-allow、非命中仍审核、无卡）全部 true。

### 4.3 审计字段与三类/四类可区分

- D2b 审计样例（`EV0\D2\09-run\gate-fixture-project\docs\audit\shell-gate.jsonl`，6 行 / `84a2198c…`，与 D2 报告一致）：`c-allow`、judge 放行（`by … → operator:judge:pi`）、客户手批（无 judge/customerGrant、`branch:c-review→a-allow`、`by … → operator:e2e-manual`）、judge 判拒、`escalation-decision`（`escalation:granted-once`、`conclusion:allow`、`execution:"未执行"`、`conditions:["shell-gate"]`、`escalation:{requestId,action,roleId}`）、客户升级授权放行（`customer-escalation:allow-once`、`customerGrant`、无 judge、`by:"customer:…（grant:…）"`）。
- pending 场景：真实 registry + 内存 sink 断言 **0 条 escalation-decision**；allow-once 后恰 1 条（E2E `SE_PENDING_NO_CARD_NO_AUDIT=true`、`SE_PENDING_AUDIT_ONLY_ON_ALLOW=true`）。
- E2b 独立 E2E 复跑生成 6 行同结构样例（`EV2b\e2e-run\...`，`092d501a…`）。

### 4.4 真实 Electron E2E：D2b 证据核对 + E2b 独立复跑

- D2b（`EV0\D2\09-run`）：`report.txt` sha256 `770a9aab…`（与 D2 报告一致）、**E2E_PASS=true、E2E_FAILURES= 空、E2E_DONE=1**、**90/90 counted `SE_*` true**；29 张截图；新增截图 `39`（`32520e7c…`）/`40`（`cf0d2e29…`）/`41`（`a3ae7e1a…`）哈希与报告一致；人工查看 39（脚本上下文区块）、40（判拒行详情 retryHint 新措辞）、41（pending 后重试卡 + 脚本上下文）内容符合；窗口 1360×860、临时 userData、无 DEBUG；审计 6 行（`84a2198c…`）。
- **E2b 独立复跑**（当前候选、真实 Electron、临时 userData、真实 build）：`ANS_E2E_OUTDIR=%TEMP%\ans-acceptance-e2b\e2e-run node_modules/.bin/electron test/桌面应用/e2e/main.mjs` → **exit 0；E2E_PASS=true；E2E_FAILURES= 空；E2E_DONE=1；90/90 SE 布尔检查 true**；`report.txt` `1ddfc66a…`；审计 6 行（`092d501a…`）；`SE_CONTEXT_BLOCK_VISIBLE`、`SE_JUDGE_RETRY_HINT_NEW_WORDING`、`SE_PENDING_RECEIPT`、`SE_PENDING_RETRY_ALLOW_ONCE`、`SE_PENDING_CARD_CARRIES_CONTEXT` 等均 true。

### 4.5 类型检查、构建与全量回归

| 检查 | 命令 | 退出码 | 结果 | 日志（EV2b） |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 0 | 无输出 | `typecheck.log`（`2d13ff10…`） |
| 渲染类型检查 | `npm run typecheck:renderer` | 0 | 无输出 | `typecheck_renderer.log`（`dddee1c8…`） |
| 渲染构建 | `npm run build:renderer` | 0 | `✓ built in 334ms`（既有 chunk/INEFFECTIVE_DYNAMIC_IMPORT 提示） | `build_renderer.log`（`9d15d763…`） |
| T3 全量 | 见报告头部 | 1 | 3345 / 3318 / 9 / 18 / 0；9 项与 B0 逐名相同（`shell-authorized-routine` :103→:184），全部 `EPERM symlink`；新增确定性失败 0、新增 skip/todo 0 | `full-suite.log`（`377f7dd8…`，4439 行） |

## 五、AC 判定表（AC-01–AC-35）

> 候选版本列统一为：HEAD `9f670fb2c7d403baf995071055d697c50714c905` + v2 82 文件候选（52 产品/测试 + 30 治理/记录，逐项 blob+sha256 一致）。"v1 证据"指首判报告 §四中在**字节未变文件**上的证据（V1 §2.3 复用）；所有受影响套件本轮已独立复跑。

| ID | 方案条目/标准 | 需要的证据（V1 最低） | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-01 | P1 判拒后申请通道的触发与入口资格 | 资格矩阵、onReviewed、工具注册、diff | `test/编排/shell-escalation.test.ts`（编排 639/638/1）；集成 16/16（EV2b `integration.log`）；`shell-escalation.ts`/`shell-gate.ts`/`run-role.ts`/`tools.ts` 静态核对 | 9f670fb + v2 82 | 编排/运行时核心 | 仅 judge 主动 deny（非 c-deny 档、tier 非 deny）或 manual/retry-capped 可申请；其它 manual/row-failed/后台/只读/硬地板均不可；工具仅注入才注册；键含 roleId/projectRoot/cwd/entry/argv | **pass** |
| AC-02 | P2 不可申请档矩阵与硬地板 | 五路径授权顺序、资格矩阵、readonly 守卫、通道测试 | `shell-gate.test.ts`（五路径+只读矩阵）；`shell-readonly.test.ts` 9/9 未改（blob `243f2d4f…`）；E2E `SE_READONLY_*` true；构造期 `readonlyOnly+takeGrant` 抛错；c=deny/preblock/write-guard 不消费 | 同上 | 编排/桌面窗口/门禁引擎 | 不可申请档全部拒绝且无卡；脚本 c=deny 全模式终结；advisory 非 script c=deny 不消费不放行；readonly 不注入/不调用 takeGrant；陈旧授权不能越过 | **pass** |
| AC-03 | P1/G3 申请工具与精确命令匹配 | runtime-core 工具/schema/argv、registry/限流/回执 | runtime-core 282/275/3/4；contract 10/10；schema `{command, necessity?}`、`additionalProperties:false`；处理器无 fs/exec、argv 由 `splitCommand` 生成；**pending 回执现已如实**（§三 R2）；5/1 限流测试 | 同上 | 运行时核心/编排 | 注入+shell arm 才注册；模型不能供 argv/授权；申请不执行不写盘；超限/待答不弹卡、回执如实（含跨卡待答） | **pass** |
| AC-04 | P1/P10 升级卡内容与三选项 | presenter/渲染测试、真实截图、payload、必要性超限 | 桌面应用 444/444、桌面UI 352/352；E2E `SE_CONTEXT_BLOCK_*` 8 项 true + 截图 39（`32520e7c…`）；`ShellEscalationIpcCard` 含 command 逐字/argv/cwd/judge 三字段/**approvalContext → 脚本上下文区块**/necessity+note/customerNotJudgeNote/actions；R1 已闭合 | 同上 | 桌面窗口/桌面UI | 命令/judge 事实/脚本上下文摘要（路径+sha256+有界内容+写区外警示）/必要性标注/三选项/客户手批声明/默认拒绝焦点均在 | **pass** |
| AC-05 | P1/G3 客户决定、回执与授权创建 | 桌面/编排回执、授权创建、真实回执 | 桌面应用 444/444；集成 16/16；E2E 决策线（`SE_ALLOW_*_WIRE`）与 registry 回执 `ok`；授权仅回包后由 registry 创建；回执文案逐字核对 | 同上 | 桌面窗口/编排 | 三决定回执如实；未知/过期/重复不放行；工具/角色不能造授权；真实模型回执记录缺失但 E2E 以真实 registry/文件 sink 驱动（边界见 §六） | **pass** |
| AC-06 | P1/P10/G1 无答复/通道不可用默认拒绝 | 假时钟/通道/中止、真实超时 | `shell-escalation.test.ts` 超时/不可用/中止；桌面四组时序；E2E `SE_TIMEOUT_DEFAULT_DENY`/`SE_TIMEOUT_UI_EXPIRED`（受控 400ms 清理） | 同上 | 桌面窗口/编排 | 超时/不可用/推达失败 → expired/unavailable（默认拒绝）；不重试/不二卡；窗口关闭/轮次中止失效；超时链代码实现（env → 审核 → 120s） | **pass** |
| AC-07 | P3 授权作用域、消费与脚本时效 | once/session/键/stale/c=allow 不消费 | 集成 A/A2/E/I（16/16）；`shell-gate.test.ts` 授权顺序；`takeGrant` 位置（classify 后仅 review/risky；script c=deny→重载→授权）；stale 作废终态 | 同上 | 编排/桌面窗口 | once 原子消费、session 反复、键各维度不匹配不生效、dispose 失效；c=allow/c=deny 不消费；脚本变化 stale 拒绝且不可再申请；开关关闭后授权仍有效 | **pass** |
| AC-08 | P4 每命令每会话一次、限流与旧记录清理 | 状态机/矩阵/限流/清理 | `shell-escalation.test.ts`（含 R2 pending 回滚、额度不累计）；集成 C/K；Probe 证明 pending 不消耗、稍后可申请 | 同上 | 编排 | 每命令一次（允许/拒绝/超时/消费均终态）；上限 5/同会话 1 张；旧记录清理；后台只忽略；**pending 属呈现前拒绝，按声明口径不消耗且测试固定** | **pass** |
| AC-09 | P4/G1 升级卡与审批卡仲裁 | 四组时序、单槽、回执 | 桌面测试四组时序（升级先到/审批先到/等待超时/中止）；E2E 仲裁检查/截图 37；**R2 修复**：`SE_PENDING_*` 9 项 true + 截图 41（`a3ae7e1a…`）；探针回执「当前有 pending shell 确认卡，请稍后再申请」、不消耗、解除后可 allow-once | 同上 | 桌面窗口/桌面UI | 升级卡排他、审批卡等待、等待上限 fail-closed、单槽不覆盖；**审批卡待答时升级申请直接拒绝、回执如实、稍后可重试** | **pass** |
| AC-10 | G1/P5 不丢、不重放与决定审计 | replay/窗口关闭、escalation-decision 记录 | 桌面 replay/关窗测试；`shell-escalation.test.ts` 审计断言；D2b/E2b JSONL 的 `escalation-decision`（branch/conclusion/execution/conditions/escalation）；pending 无审计、allow-once 后恰 1 条（`SE_PENDING_AUDIT_ONLY_ON_ALLOW=true`）；审计失败不翻转 | 同上 | 编排/桌面窗口 | pending/replay/expire、未知/重复 id、关窗/中止默认拒绝；允许/拒绝/超时均写完整记录（拒绝/超时由单测覆盖）；append-only 同文件 | **pass** |
| AC-11 | P10/G2 judge 不参与升级、onReviewed 只读 | spy/行为、onReviewed 只读、治理零关联 | `shell-escalation.test.ts` spy（judge 零调用）、`onReviewed` 抛错不影响判定；升级卡不写治理记录、不读「替我决策」 | 同上 | 编排/桌面窗口 | 升级全过程 judge 调用 0；onReviewed 不改变 ShellReviewResult；升级卡与治理 approval 组无关 | **pass** |
| AC-12 | P7/P10 单一谓词与两处消费 | diff、同引用、rg、单测 | `rg` 单一定义（classify-shell.ts:341）；分类器 :508、写守卫 :540、Service 再导出 :17；`shell-rules-public-reexport.test.ts` 同引用；委托经 Service 出口 | 同上 | 门禁引擎/编排 | 唯一纯函数、两处消费同一引用、无第二份实现；委托只认原三 id | **pass** |
| AC-13 | P7 白名单命中 → c-allow、0 卡、0 judge | 分类器/写守卫/委托、judge 计数、真实运行 | 门禁 288/287；集成 G；E2E `SE_WHITELIST_*` 全部 true；审计样例 `c-allow` 无 judge | 同上 | 门禁引擎/测试 | §5.1 全部精确形态命中并 0 卡 0 judge（含内置角色）；原委托三形态分支变 c-allow；`npm install` 不命中 | **pass** |
| AC-14 | P7 非命中形态与 fail-closed | 负例矩阵、gate 集成 | `shell-routine.test.ts`（npm install/npx/tsc 裸/tsc -p/越界或带 flag node --test/npm ci flags/任意脚本名不命中）；gate 集成 judge/客户卡路径 | 同上 | 门禁引擎/编排 | 非命中形态均不是 c-allow，落既有链；硬拒/封堵优先；`npm install` 保留判拒+申请 | **pass** |
| AC-15 | P7/P11 委托策略只保留原三 id | 委托测试、断言变更逐条 | `shell-authorized-routine.test.ts`（编排 639/638/1，唯一 EPERM）；委托三 id 命中、`npm ci`/`tsc --noEmit`/`npm run test|lint|check` 不继承；变更理由在 B1 §五 | 同上 | 门禁引擎/编排 | 委托只接受三 id 且保留项目根/cwd/realpath 校验；断言变更逐条列明、无其它弱化 | **pass** |
| AC-16 | P7/P10 自定义规则集与硬拒优先 | 规则集注入测试、gate | `shell-routine.test.ts` 自定义更严格 risky 下白名单仍 allow、硬拒/记号仍 deny；分类器调用位置（硬拒/记号后、risky 前） | 同上 | 门禁引擎 | 断言显式；硬拒优先；行为符合客户闸门 1 接受口径 | **pass** |
| AC-17 | P6 开关关闭路径逐字不变 | operator-channel 既有测试、回归、真实截图 | `operator-channel.test.ts`（桌面应用 444/444 含）；`shell-escalation.test.ts`「开关关闭」用例；E2E 截图 38/`SE_PAUSE_SHELL_REQUEST_GOES_TO_CUSTOMER`；presentConfirmed 既有文案/超时/拒绝未改 | 同上 | 桌面窗口/编排 | 开关关闭时非白名单命令走既有卡（显示/超时/拒绝/可用性不变）；无升级卡/无 judge；客户手批审计形状不变 | **pass** |
| AC-18 | P6/P1 开关开启时 manual 仍拒绝、retry-capped 可申请 | operator-channel/desktop、资格、真实应用 | `operator-channel.test.ts` retry-capped 回归；`shell-escalation.test.ts` 资格；集成；E2E S5（retry-capped 卡+页脚） | 同上 | 桌面窗口/编排 | 其它 manual/row-failed 仍拒绝且不弹卡；retry-capped 判拒记录可申请；无新增 manual 结果行 | **pass** |
| AC-19 | P8/P9 回执措辞 | zh/en 断言、containsExitLine、真实回执截图 | i18n 测试（三词兼容、judgeWayOut/retryCapped 含 request_shell_escalation）；`judge.test.ts:68`/`judge-row-view.test.ts:141` 新措辞断言（旧子串保留）；集成 L；E2E `SE_JUDGE_RETRY_HINT_NEW_WORDING=true` + 截图 40（`cf0d2e29…`，详情展开显示新句）；**E1 已闭合** | 同上 | 编排/桌面窗口/项目管理 | 角色可见回执全句断言；客户可见 retryHint 新措辞有真实截图与断言；保留「关闭/替我审批/重试」兜底 | **pass** |
| AC-20 | P8/G4 暂停语义与持久化隔离 | interface/desktop、真实窗口重开/重启/治理组、偏好 | interface/shell-escalation 暂停状态机；E2E `SE_PAUSE_*`（模块级、shell-only、治理组不变、偏好不存在、窗口重开保留、第二进程重启清零、恢复后开关不变） | 同上 | 桌面窗口/桌面UI | `shellSessionPaused` 模块级/shell-only/不写偏好/跨窗口重开保留/重启清零；治理 approval 组仍只看全局开关；白名单不被暂停 | **pass** |
| AC-21 | P8 暂停入口与 UI 状态 | 渲染测试、真实截图（行按钮/页脚/徽标/恢复）、i18n | 桌面UI 352/352；截图 32/34/35/36/39；i18n 键成对 | 同上 | 桌面UI | 判拒行暂停按钮、升级卡页脚暂停（非第四决定项）、徽标/恢复、中英均具备 | **pass** |
| AC-22 | P5 审计三类可区分与 escalation-decision | 当前候选 JSONL 样例、单测、grep、diff | D2b/E2b JSONL 6 行（§4.3，`84a2198c…`/`092d501a…`）；单测审计字段；命令/argv 逐字未改；无凭据模式（E2E `SE_AUDIT_NO_CREDENTIAL_PATTERN`） | 同上 | 编排/测试 | judge 放行/客户手批/客户升级授权/申请决定四类可机读区分；新增字段无凭据；既有 command/argv 逐字不变 | **pass** |
| AC-23 | P5 审计共享 sink 与不丢记录 | diff、fake sink、真实 JSONL、回调 | `createShellGate` 构造期 `onAuditSinkCreated` 以实际 sink 回调；arming/run-role 透传；集成/单测 fake sink；D2b 真实默认文件 sink 同文件 | 同上 | 编排 | 升级决定与 review 同 sink/同文件 append-only；外部注入 sink 同样触发；失败不翻转判定并如实 stderr | **pass** |
| AC-24 | P9 i18n 中英成对、计数、零泄漏 | i18n 测试、key diff、渲染消费 | i18n 测试：计数 **ui 907 / main 559 / shared 62 / preferences 3 = 1531**（+5 context key）；parity；英文值零中文泄漏；全量无 missing-key；SHELL_ESCALATION_KEYS 32 项中英成对 | 同上 | 项目管理/桌面UI | 30 新 key + 2 改写中英成对；计数显式更新；既有 key 语义不变；渲染消费正确 | **pass** |
| AC-25 | P11/G2 受影响套件与断言不弱化 | 各角色原始输出、`git diff -U0`、B0、分类 | 本报告 §4.1 全部复跑；新增测试均为增强（pending/context/新措辞）；既有断言保留（旧子串/旧负例），pending 回执措辞更新有理由；无新增 skip/todo；B0 失败分类一致 | 同上 | 各实施角色/测试 | 受影响层全过（除既有 EPERM）；断言变更逐条有理由、未删除测试覆盖、未新增 skip/todo | **pass** |
| AC-26 | P11 跨层集成 | `test/测试/` 集成原始输出、test diff | `test/测试/shell-escalation-integration.test.ts` **16/16**（EV2b），新增 K（pending→allow-once、无审计、额度/申请权不消耗）与 L（新措辞）；原六类覆盖保留 | 同上 | 测试 | 跨层覆盖授权顺序/资格/限流/审计/暂停/白名单 0 judge + R2/AC-19 增量；注入替身、不启动 Electron/模型 | **pass** |
| AC-27 | P11 T3 全量回归与失败分类 | 全量原始输出、B0、消费者重测 | 本报告头部/§4.5：3345/3318/9/18/0；9 项与 B0 逐名相同（行号移位）；新增确定性失败 0、新增 skip 0、新增 todo 0；消费者重测（编排/runtime-core/桌面/shared/全量） | 同上 | 测试 | T3 全量已执行并按基线分类；新增失败/skip/todo = 0 | **pass** |
| AC-28 | P1/P5/P7/P8/P11 真实 Electron E2E 与截图 | 场景矩阵、截图元数据、E2E 日志、审计 | D2b 证据核验（§4.4）＋ **E2b 独立复跑 E2E_PASS=true、90/90**；截图 39/40/41 哈希与内容核对；审计 6 类；窗口 1360×860、临时 userData、无 DEBUG；多引擎缺口如实记录 | 同上 | 测试/桌面窗口/桌面UI | S1–S12 客户可见面（卡/三选项/仲裁/暂停/窗口重开/重启清零/白名单 0 judge/只读 A/审计/pending→allow）有真实 Electron 证据；整机 app/main 与真实模型链缺口如实披露（§六） | **pass** |
| AC-29 | P11 typecheck 与构建 | 三条命令原始输出/退出码 | EV2b：`npm run typecheck` 0、`typecheck:renderer` 0、`build:renderer` 0（§4.5）；`app/renderer/dist/` 忽略产物非候选 | 同上 | 各角色/测试 | 三条命令 exit 0；dist 未进入候选 | **pass** |
| AC-30 | 回滚开关语义 | 环境开关测试、diff、行为声明 | `shellEscalationDisabled` 仅精确 `"1"`；`openRoleSession` 测试（编排套件）registry 不创建、工具不注入；`takeGrant` 不注入；白名单不受开关；方案 §13.2 口径 | 同上 | 编排/运行时核心 | 开关关闭时工具不注册、无 registry、既有授权全部失效；白名单需代码回退（如实声明） | **pass** |
| AC-31 | P12 无越权改动与发布边界 | diff/枚举、package/build/release 零改动、边界三项 | §二：52 产品/测试均写集内；82 文件与清单 82/82；发布/构建面零 diff；边界仅 B-1/B-2/B-3（哈希同 v1）；管理记录不混入产品候选；角色 id/显示名/职责未改；overlay 子项 N/A（新小版本） | 同上 | 统筹/测试/人事 | 无范围外改动；无越权；发布边界守住 | **pass** |
| AC-32 | G3 权限不扩张 | diff、对抗注入、单测 | 工具处理器无 fs/exec；授权仅精确 argv/cwd/role/project/entry；伪造 id/回包/非法动作 → expired；跨角色/项目不生效；post-audit/写守卫/审计边界零 diff；pending 不创建授权 | 同上 | 运行时核心/编排/桌面窗口 | 工具只申请；授权最小化；伪造不放行；硬地板不可越过 | **pass** |
| AC-33 | G2 judge 既有行为不回归 | 既有 judge 套件、diff | `test/编排/shell-judge.test.ts` 等在 639 套件内通过；shell-judge-verify 38/38；deny 档 `hardDenyOverride`、结果行、retry-capped manualAsDeny 事实保留；判定无变化 | 同上 | 编排/测试 | 既有 judge 判定/结果行/deny 标记无回归 | **pass** |
| AC-34 | G4 开关持久化不回归 | interface/preferences、偏好文件 | interface 测试；E2E `SE_PAUSE_NO_PREFERENCE_FILE`/`SE_RESTART_PREFERENCES_UNTOUCHED`/`SE_RESUME_PERSISTENT_SWITCH_UNCHANGED`；无新偏好键；setShellJudgeEnabled 未改 | 同上 | 桌面窗口/测试 | 全局开关持久化/重载不变；暂停不写偏好；`shell:judge-set` 校验不变 | **pass** |
| AC-35 | G5 文档状态与基线可追溯 | 文档链接/哈希、状态行、变更包、git status | §一/§二；9 份 change 报告：A1/A2/A3/B1/C1/C2/D1/D2 均有 `implemented-unverified`，B0 为 `baseline-recorded`；无提前 `verified`；E1 v2 重冻 82/82；首判报告 v1 未被修改；无 `docs/verification/`；无 commit/push；变更包列出方案/标准/候选/节点/证据 | 同上 | 统筹/独立验收 | 基线/确认链/写集/候选可追溯；R3 状态行已补；治理记录随返工更新并重冻 | **pass** |

## 六、限制与未覆盖（如实记录，不据此改判）

1. **E2E harness 非 `app/main.ts` 整机进程**（D2b §9.7）：真实 Electron、真实 build、临时 userData、真实产品模块与 IPC；窗口/主进程由 harness 自建。暂停模块级归属、shell-only 组合与治理组表达式由源码事实 + C1/D1 单测钉住。
2. **无真实模型/网络会话**：「模型 → `request_shell_escalation` → registry → presenter」整链由 D1 真实 registry/工具/闸 + 替身覆盖；D2b pending 由真实 registry/presenter/槽/IPC 验证但未由真实 `run_shell` 工具调用触发（D1 覆盖工具链）；角色可见 `judgeWayOut` 回执未在 E2E 生成（D1 逐字断言）。
3. **脚本上下文为夹具**：D2b 的 `approvalContext` 为受控夹具（有界内容 37 字节、写区外警示）；真实读取/有界来源由编排与 D1 stale 用例覆盖。
4. **多引擎覆盖边界**：真实 E2E 只走默认 `pi` 视图路径；Claude/Codex 未跑（团队计划 §10.2 第 5 项 / V1 §1.3 允许，缺口已如实记录）。
5. **审计 JSONL 三决定齐全性**：样例含 judge 放行/客户手批/客户升级授权/`escalation-decision`（allow-once）；拒绝/超时的 `escalation-decision` 由单测覆盖；pending 无审计（无客户决定）。
6. **真实超时口径**：E2E 用受控 `cleanupAfterMs=400`（同一产品核心）而非 `ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS`；生产超时链语义由代码与单测覆盖。
7. **窗口重开 vs 重启**：Windows 单窗口下由 harness 同一进程重开窗口（暂停保留）+ 第二独立 Electron 进程（重启清零）分别验证。
8. **T3 全量排除 `write-sequencing.test.ts`**：历史串行写测试，按团队计划 §6.3 / V1 AC-27 排除；9 项 EPERM 为 B0 既有环境失败。
9. **「已有升级卡待答」分支**：D2b 未单独构造（C1/D1 单测覆盖）；D2b 的 pending 场景为待答审批卡（目标场景）。

## 七、观察与非阻断事项（不改判）

1. **E2b 产物晚于 v2 冻结**：本报告与更新后的 memo 写于 E1 v2 冻结之后；v2 清单中的 memo 仍是首判版本（`d1be8d8a…`）且无 v2 报告。E3 提交前需按 E1 v2 §一重新冻结治理记录清单（见 §九）；产品/测试 52 文件哈希不受影响。
2. **C2 报告的历史表与增量节**：C2 报告 §一 保留首轮"`test/桌面UI/judge.test.ts` 未改"的历史行，§八 明确记录 R1/AC-19 增量与新哈希（`9304b3ef…`/`4c26fe28…`），与 v2 清单一致；属"首轮记录 + 增量节"写法，最终哈希以 §八/清单为准，不影响 AC-35 判定。建议 E3 提交前如需统一表述可一并更新（更新则重新冻结）。
3. **D2b 既有未计数日志抖动**：`HANDBACK_CARD_PRESENT` 等 10 条未计入通过门的 `log()` 行在 D2b 为 false；D2b 已用未改动 HEAD harness 对照复现（`EV0\D2\10-head-control`，E2E_PASS=true），分类为既有抖动，非新增失败。
4. **首轮报告的通过项未在 v2 重写**：首判报告 v1 保持不变（E1 v2 与沟通记录引用其哈希）；本报告对未变文件复用其结论并注明本轮已复跑，不构成"另一候选"证据混用（34/52 文件字节未变，其余 18 个在 E2b 重新验证）。

## 八、总体结论

**通过（pass）**。

- AC-01–AC-35 **全部 pass**（35/35），无 fail、无 insufficient evidence、无 `not applicable` 项；首判 R1（AC-04）、R2（AC-09）、R3（AC-35）与补证 E1（AC-19）均独立核对闭合。
- 通过仅对**当前候选**（HEAD `9f670fb2c7d403baf995071055d697c50714c905` + v2 82 文件候选，82/82 哈希一致）成立；候选变化后本结论失效，需按 V1 重取受影响证据并重新判定。
- 本报告**不授权**提交、推送、合并、发布、发行；不声称客户已批准；验收报告仅由独立验收（E2b）写，本报告即该唯一判定。

## 九、提交前候选哈希回执要点（供沟通执行；提交本身另行授权）

- **HEAD / 工作树**：`feat/flow-improvements-wave1` / `9f670fb2c7d403baf995071055d697c50714c905`（无新提交）；候选 **82 文件** = 产品/测试 **52**（app 14 + src 17 + test 21）+ 治理/记录 **30**；`git diff --cached --name-only` 为空；无改名/删除。
- **冻结依据**：E1 变更包 v2 `docs/scheduling/shell-escalation-change-v1.md`（184 行 / `3803668387a25efbb7924b00ba09debcf259dbdb15430b93762e6ceb1b953061`）；候选清单 v2 `%TEMP%\ans-shell-escalation-evidence\E1\candidate-manifest-final-v2.tsv`（82 行 / `faaa87747d4f779fc770c27295f8648a2d9bca63d4abae2976e64c31acc31a84`）；逐文件 blob/sha256 见清单，E2b 复算 **82/82 一致**。
- **验收依据**：V1 `0b724fa2…`；首判报告 v1 193 / `464bec6a…`；本报告 v2（哈希见交付回报）。
- **提交前须再冻结**：E2b 已写入 `docs/acceptance/shell-escalation-report-v2.md`（新文件）并更新 `docs/acceptance/memo.md`（新哈希见回报）；二者为验收产物，不在 v2 清单内/清单中 memo 为旧哈希。E3 应在提交前重新生成候选清单：v2 的 82 文件中 memo 哈希更新、外加 v2 报告 = **83 文件**（若 E3 同时更新 E1 变更包状态行则为 84 文件）并复算；产品/测试 52 文件哈希不变。
- **建议拆分**：① 实施与测试 **52 文件**（`app/**`、`src/**`、`test/**`）建议信息 `feat(shell-escalation): 判拒客户确认通道 + 例行命令白名单 + 回执/暂停（T3）`；② 治理与记录 **30+2 文件**（`docs/**`、`角色卡/**`、E1、v1/v2 报告、memo）建议信息 `docs(shell-escalation): 方案/闸门/团队计划/验收标准/返工记录与角色记录`。备选单提交（84 文件）。
- **发布口径**：**不发行**——不打 tag、不升 `package.json` 版本、不构建/上传发布包、不写发布说明；`release-policy.mjs`/发布工作流保持 `v1.8.3` 不动。`app/renderer/dist/` 为忽略产物、非候选。
- **禁止项**：验收通过不授权提交/推送/合并/发布；提交/推送按客户既有授权由沟通在执行阶段进行；实施角色与统筹不自行 commit/push。

---

- 报告路径：`docs/acceptance/shell-escalation-report-v2.md`（本文件）；报告 SHA-256 于交付回报中给出（避免自引用不写入正文）。
- 判定角色：ANS 内置独立验收（E2/E2b，同一唯一主验收上下文）；未启动子上下文；未改代码/测试/方案/计划/角色卡/沟通记录；未 `git add/commit/push/stash`；未联系客户。
