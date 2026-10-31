# 独立验收报告 v1：shell 判拒后的客户确认通道 + 例行命令白名单扩容 + 回执/开关粒度（T3）

- 风险档位：**T3（治理/权限/审批语义变更）**（方案 v1.3 定档，团队计划 §1.2；本报告不降档）。
- 判定依据（唯一判据）：**实施前完成标准 V1** `docs/acceptance/shell-escalation-criteria-v1.md`（**1320 行 / SHA-256 `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b`**，AC-01–AC-35）；上位依据为客户闸门 1 确认的方案 v1.3（**857 行 / `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`**）、readonly 客户裁定 A 澄清（**124 行 / `6c568ee626b8e4fa6487562364e23927c2812f64ae8c8753cc7ad9bfb2588dd4`**）与闸门 0/1/2 + 实施/提交授权记录（`docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`，当前 **93 行 / `32338c84…`**）；团队计划（**575 行 / `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203`**）只作范围/写集/证据口径依据。E1 变更包 `docs/scheduling/shell-escalation-change-v1.md`（**182 行 / `c9ff12b062fb5782aeca2672dbfa3c1a0342712003901c00480a081d80baac3c`**）与候选全集清单（**80 行 / `c649e35eb79472e8f77c0a901e695917fe0044e0e239f060a1d6fe00d354040d`**）。
- 选定检查：受影响角色层套件（门禁引擎/编排/运行时核心/桌面窗口/桌面UI/项目管理 shared）+ 跨层集成 `test/测试/shell-escalation-integration.test.ts` + **T3 全量适用回归**（`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`）+ `npm run typecheck`/`typecheck:renderer`/`build:renderer` + **真实 Electron E2E 独立复跑**（E2E_PASS）+ 截图/审计 JSONL 哈希核对 + 只读实验探针。
- 复用证据：B0 仅作基线对照（`%TEMP%\ans-shell-escalation-evidence\b0`）；各节点套件与 D1/D2 证据按同一候选（HEAD `9f670fb`、产品/测试 51 文件与 E1 哈希一致）复用；本报告在 E2 侧对关键套件、全量回归与真实 E2E 做了**独立复跑**（见 §三），未跨候选复用。
- 消费者重测结论：`src/model/runtime.ts` 消费方（编排/运行时核心 tools/桌面窗口）、`src/common/门禁引擎`（分类器/写守卫/Service 出口）、`src/common/shared/i18n` 消费方均在本报告独立复跑范围（编排 637、runtime-core 281、桌面应用 443、桌面UI 350、shared 155、全量 3337）；typecheck 全绿。
- 全量回归：**已执行**（命令 `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`；工作目录 = worktree 根；结果 **tests 3337 / pass 3310 / fail 9 / skipped 18 / todo 0 / cancelled 0**，exit 1，duration 245866.4472ms；9 项失败全部为既有 Windows symlink `EPERM`，与 B0 逐名相同；日志 `%TEMP%\ans-acceptance-e2\full-suite.log` / `ecaa5980…`）。排除 `test/pi-adapter/write-sequencing.test.ts` 的理由按团队计划 §6.3 / V1 AC-27（历史串行写测试）。
- 总体结论：**返工**（3 项返工 R#、1 项证据不足 E#；通过 = 全部 AC 通过且无证据不足阻断项，故不通过）。本报告只判定当前候选，不授权提交/推送/合并/发布；不涉及客户沟通。

> 证据根目录：`EV0 = C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence`（各节点原始证据）；`EV2 = C:\Users\51054\AppData\Local\Temp\ans-acceptance-e2`（本报告 E2 独立复跑证据）。下文 `%TEMP%` 指向 `C:\Users\51054\AppData\Local\Temp`。

---

## 一、判据、版本与冻结哈希核对（E2 只读实测）

| 文档 | 要求（任务/标准） | 实测 | 结果 |
| --- | --- | --- | --- |
| V1 完成标准 | 1320 行 / `0b724fa2…` | 1320 行 / `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b` | 一致 |
| 方案 v1.3 | 857 行 / `6bd12a99…` | 857 行 / `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de` | 一致 |
| readonly 澄清 A | 124 行 / `6c568ee6…` | 124 行 / `6c568ee626b8e4fa6487562364e23927c2812f64ae8c8753cc7ad9bfb2588dd4` | 一致 |
| 独立复核记录 | 148 行 / `617d9a7f…` | 148 行 / `617d9a7f84599ade1837934a5fb86ee93e95cf13dfca2d37911bc11e0de9c586` | 一致 |
| 团队计划 | 575 行 / `4d52bdf4…` | 575 行 / `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203` | 一致 |
| E1 变更包 | 182 行 / `c9ff12b0…` | 182 行 / `c9ff12b062fb5782aeca2672dbfa3c1a0342712003901c00480a081d80baac3c` | 一致 |
| 候选全集清单（含 E1） | 80 行 / `c649e35e…` | 80 行 / `c649e35eb79472e8f77c0a901e695917fe0044e0e239f060a1d6fe00d354040d` | 一致 |
| 沟通记录（E1 冻结引用） | 84 行 / `84692e0ad260a353b9ca79297318dd0c8a46abe2abe6fa0d4c731e746eb2a89a`（E1 §1.1/§四） | **93 行 / `32338c84e9d551352ccde7b4979b7fbc3762ee35c51ea707c3970e31fbb59c19`**（blob `60b492ae3cfbd78b6badc61a15b69446d1e4876e`） | **不一致（见 §二.2、§八.1）** |

环境：Windows 11 Pro 10.0.26300 / Git Bash；Node `v24.22.1` / npm `11.19.1`；HEAD `9f670fb2c7d403baf995071055d697c50714c905`（与任务/E1 一致，无新提交）。

## 二、候选核对结果

### 2.1 逐文件 blob/sha256（E1 清单 80 项）

- 复核命令：按 `%TEMP%\ans-shell-escalation-evidence\E1\candidate-manifest-with-E1.tsv` 逐项 `git hash-object` + `sha256sum`，日志 `%TEMP%\ans-acceptance-e2\manifest-check.log`。以下为 **E2 入口实测（写入本报告与 memo 之前）**；E2 自身按职责写入的 `docs/acceptance/shell-escalation-report-v1.md`、`docs/acceptance/memo.md` 为验收产物（管理记录），不属于 E1 产品候选，E3 提交前需按 §八.1 重新冻结治理记录清单。
- 结果：**79/80 一致，1 项不一致**：
  - `docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`：E1 期望 blob `b775399b…` / sha256 `84692e0a…`；实测 blob `60b492ae…` / sha256 `32338c84…`。
  - **产品/测试 51 文件全部一致（51/51 = `app/**` 14 + `src/**` 17 + `test/**` 20）**（逐项见清单），治理/记录其余 28 文件全部一致（含 E1 自身）。
- 不一致文件的性质（E2 核实）：当前文件为**追加**「独立验收 E2 启动（2026-10-31）」小节（第 89–93 行），记录 E1 哈希 `c9ff12b0…` 与候选清单 `c649e35e…` 均与实测一致；闸门 0/1/2、实施授权、提交授权、readonly 裁定记录的正文（第 1–88 行）与 V1 §1.1/§九.2 引用的原话一致。该文件属 V1 §2.7 所列**管理记录**（不混入产品候选），其变化不改变任何产品/测试证据；但按 E1 §一「任何文件在 E2 前发生变化即本候选失效」的字面冻结规则，该清单项已过期（见 §八.1；本报告按 V1 §2.7 将产品候选与治理记录分离，不据此改变产品 AC 判定）。

### 2.2 工作树/暂存区/写集

| 检查 | 结果 |
| --- | --- |
| `git status --porcelain` 行数 / 状态码 | 80 行 = 55 `M` + 25 `??`；与 E1 清单**路径集合完全相同**（无新增、无遗漏、无改名/删除 `D`/`R`） |
| `git diff --cached --name-only` | 空（未暂存） |
| HEAD | `9f670fb2c7d403baf995071055d697c50714c905`（未 commit） |
| 发布/构建面零改动 | `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`electron-builder.yml`、`.github/workflows/release.yml`、`src/common/装配/release-policy.mjs` 均无 diff |
| 候选隔离 | 产品/测试 51 文件均落在团队计划 §4.1/§4.3 写集；管理记录（`docs/**`、`角色卡/**`）未混入产品候选；`app/renderer/dist/` 为忽略产物 |
| task_ops/verification | `.ans/project.json` 不存在；`docs/verification/` 不存在；未伪造机器状态 |
| 边界变更 | 仅 B-1/B-2/B-3：`角色卡/门禁引擎/boundary.md`（+`src/service/gate/shell-rules.ts` 单文件行）、`角色卡/编排/boundary.md`（+`src/pipeline/orchestration/shell-arming.ts` 单文件行）、`角色卡/桌面窗口/boundary.md`+`boundary.yaml`（+`test/桌面应用/shell-escalation.test.ts` 精确条目）；无角色 id/显示名/职责描述改动 |

## 三、E2 独立复核（本报告自跑，只读；未改代码/测试）

### 3.1 角色层套件与跨层集成（EV2）

| 套件 | 命令 | 退出码 | 结果 | 日志（EV2） |
| --- | --- | --- | --- | --- |
| 门禁引擎 | `node --test "test/门禁引擎/**/*.test.ts"` | 0 | tests 288 / pass 287 / fail 0 / skipped 1 / todo 0 | `gate.log`（`858a4879…`） |
| 编排 | `node --test "test/编排/**/*.test.ts"` | 1 | 637 / 636 / **1** / 0 / 0；唯一失败 = `shell-authorized-routine.test.ts:184`（既有 EPERM symlink；B0 同名测试在 :103） | `orchestration.log`（`977a0e5b…`） |
| 运行时核心 | `node --test "test/runtime-core/**/*.test.ts"` | 1 | 281 / 274 / **3** / 4 / 0；3 项 = `file-write-safety:97`、`session-store:46/:58`（B0 同项 EPERM） | `runtime-core.log`（`d042ac81…`） |
| 项目管理/shared | `node --test "test/项目管理/shared/**/*.test.ts"` | 0 | 155 / 150 / 0 / 5 / 0 | `pm-shared.log`（`e136c894…`） |
| 桌面应用（全部） | `node --test "test/桌面应用/*.test.ts"` | 0 | 443 / 443 / 0 / 0 / 0 | `desktop-app.log`（`1e3cf770…`） |
| 桌面UI | `node --test "test/桌面UI/**/*.test.ts"` | 0 | 350 / 350 / 0 / 0 / 0 | `desktop-ui.log`（`de97a86a…`） |
| 跨层集成 | `node --test --test-concurrency=1 "test/测试/shell-escalation-integration.test.ts"` | 0 | 14 / 14 / 0 / 0 / 0 | `integration.log`（`2fdb13de…`） |
| shell-judge-verify | `node --test --test-concurrency=1 "test/测试/shell-judge-verify/*.test.ts"` | 0 | 38 / 38 / 0 / 0 / 0 | `judge-verify.log`（`5d3fe090…`） |
| 只读档既有断言 | `node --test "test/编排/shell-readonly.test.ts"` | 0 | 9 / 9；两项原断言（`ls/git status/node --version` 放行、`node --test→readonly-deny`）通过 | `readonly.log`（`cf877064…`） |

只读档复核：`test/编排/shell-readonly.test.ts` **文件未改**（blob `243f2d4f06ebea842e434602a677dfebc9c52d28`，与 B1 报告一致），客户裁定 A 的「既有 2 项断言原样通过」成立；`shell-gate.test.ts` 的只读档例行白名单拒绝矩阵（5 类 id + 8 形态）与 E2E `SE_READONLY_A_ROUTINE_DENY_MATRIX` 均通过，五类例行形态（`npm test`/`npm run test|typecheck|lint|check`/`node --test`/`tsc --noEmit`/`npm ci`）在只读档均 `readonly-deny`、reason 档位按 A2 之前（review/risky），未注入/调用 `takeGrant`（构造期守卫测试通过）。

### 3.2 白名单 0 卡 0 judge 与单一谓词

- `rg -n "matchRoutineShellCommand" src test`：**唯一定义** `src/common/门禁引擎/classify-shell.ts:341`；分类器调用 `:508`；写守卫导入/调用 `shell-write-guard.ts:17/:540`；Service 出口 `src/service/gate/shell-rules.ts:17` 再导出；无第二份实现。
- `shell-rules-public-reexport.test.ts` 同引用断言（`public === priv`）通过；委托策略 `routine-shell-policy.ts` 经 Service 出口复用同一函数，只接受原三 id（`npm-test`/`npm-run-typecheck`/`node-test`），不继承 `npm ci`/`tsc --noEmit`/`npm run test|lint|check`。
- 跨层集成 G：8 形态在项目角色 advisory 与内置审批档均 `c-allow`、判断通道 0 调用、审计无 judge/customerGrant；`npm install lodash` 仍走判断。E2E `SE_WHITELIST_*`（项目/内置档 0 judge、审计 c-allow、非命中仍审核、无卡推达/无卡可见）全部 true。

### 3.3 审计字段与三类/四类可区分

- 复核 D2 审计样例：`EV0\D2\06-run\gate-fixture-project\docs\audit\shell-gate.jsonl`（6 行 / sha256 `1a4f0555adba7f77d779557983583d1b6a03b5bfa680fd52a7b210912ad2a54f`，与 D2 报告一致）；逐行含：`c-allow`（白名单，无 judge/customerGrant）、judge 放行（`judge.verdict="allow"`、`by … → operator:judge:pi`）、客户手批（无 judge/customerGrant、`branch:"c-review→a-allow"`、`by … → operator:e2e-manual`）、judge 判拒（`c-review→a-deny`）、`event:"escalation-decision"`（`branch:"escalation:granted-once"`、`conclusion:"allow"`、`execution:"未执行"`、`conditions:["shell-gate"]`、`escalation:{requestId,action,roleId}`、`toolCallId:""`）、客户升级授权放行（`branch:"customer-escalation:allow-once"`、`customerGrant:{requestId,scope,operatorId:"cust-e2e"}`、无 judge、`by:"customer:cust-e2e（grant:…）"`）。四个类别与申请决定可机读区分。
- 独立 E2E 复跑同样生成 6 行样例（`EV2\e2e-run\gate-fixture-project\docs\audit\shell-gate.jsonl` / `d61ded32…`），类别结构相同。
- 拒绝/超时的 `escalation-decision` 记录不在 JSONL 样例中，由 `test/编排/shell-escalation.test.ts` 与跨层集成覆盖（B1/D1 已证）；样例要求按 AC-22「三类 review + escalation-decision」满足（限制见 §七.4）。

### 3.4 真实 Electron E2E：证据核对 + 独立复跑

- 对 D2 最终证据（`EV0\D2\06-run`）：`report.txt` sha256 `31395ee0992fd60b8f20cb9bf01c4af43d03b9cead75e81b3a40a0de8f8390b1`（与 D2 报告一致）；`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`；9 张新增截图 `30`–`38` 的 sha256 **逐张与 D2 报告一致**（如 30 `f93deab8…`、34 `3f0db4fa…`、37 `4113a73d…`、38 `8fd07934…`）；截图人工查看 30（升级卡：命令原文/judge 理由与替代方案/必要性独立区块+「由角色提供，未经验证」/客户手批声明/三按钮/默认焦点拒绝/页脚暂停）、32（判拒结果行 + 暂停入口）、35（暂停徽标/恢复 + 治理代批行）均无 DEBUG 覆盖层。
- **独立复跑**（当前候选、真实 Electron、临时 userData、真实 build）：`ANS_E2E_OUTDIR=%TEMP%\ans-acceptance-e2\e2e-run node_modules/.bin/electron test/桌面应用/e2e/main.mjs` → **exit 0；E2E_PASS=true；E2E_FAILURES= 空；E2E_DONE=1**；新增 `SE_*` 布尔检查 **70/70 = true**；`report.txt` sha256 `2fafff8704296da657b2a2216d073accb4013ea18f21937c9e7cdf50a7dac002`；审计样例 6 行（`d61ded32…`）。日志 `EV2\e2e-stdout.log`（`6c48ee29…`）。

### 3.5 独立只读探针（AC-09 关键交互）

- 用仓库外临时脚本 `EV2\probe-pending.mjs`（只读导入产品模块，不写仓库）构造真实 `createShellEscalationSession`：先 `recordReview` 一条 judge 判拒，`present` 在「审批卡待答」时返回 `{action:"unavailable", reason:"当前已有待答复的 shell 确认/升级卡，请稍后再申请（不排队）"}`。实测输出：
  - 第一次：`FIRST_PRESENTS=1`、`FIRST_OK=false`、`FIRST_STATE=expired`、`FIRST_MESSAGE=未获客户允许（超时/通道不可用，默认拒绝）。本会话不再受理同一命令的申请；命令未执行。`
  - 审批卡解决后第二次：`SECOND_PRESENTS=1`（未再调用 presenter）、`SECOND_STATE=expired`、`SECOND_MESSAGE=该命令本会话已申请过（结果：超时/通道不可用），本会话不再受理同一命令的申请；未执行任何命令。`
- 结论：与 AC-09「有 shell 审批卡待答时……回执如实提示『当前有 pending shell 确认卡，请稍后再申请』」不符，且记录被判终态、无法「稍后再申请」（返工 R2）。

### 3.6 typecheck / 构建与全量回归

| 检查 | 命令 | 退出码 | 结果 | 日志（EV2） |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 0 | 无输出 | `typecheck.log`（`2d13ff10…`） |
| 渲染类型检查 | `npm run typecheck:renderer` | 0 | 无输出 | `typecheck_renderer.log`（`dddee1c8…`） |
| 渲染构建 | `npm run build:renderer` | 0 | `✓ built in 335ms`（既有 chunk/INEFFECTIVE_DYNAMIC_IMPORT 提示，非失败） | `build_renderer.log`（`80226780…`） |
| T3 全量 | 见报告头部 | 1 | 3337 / 3310 / 9 / 18 / 0；9 项与 B0 逐名相同（`shell-authorized-routine` 行号因 B1 合法更新断言由 :103 移至 :184），全部 `EPERM symlink` | `full-suite.log`（`ecaa5980…`，4431 行） |

## 四、AC 判定表（AC-01–AC-35）

> 候选版本列统一为：HEAD `9f670fb2c7d403baf995071055d697c50714c905` + E1 80 文件候选（产品/测试 51 文件 blob+sha256 全匹配）。产出角色按团队计划节点。

| ID | 方案条目/标准 | 需要的证据（V1 最低） | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-01 | P1 判拒后申请通道的触发与入口资格 | 资格矩阵、onReviewed、工具注册、diff | `test/编排/shell-escalation.test.ts` 57/57（`EV0\B1\escalation-tests.log`）；集成 14/14（EV2 `integration.log`）；`shell-escalation.ts`/`shell-gate.ts`/`run-role.ts`/`tools.ts` diff；E1 哈希 | 9f670fb + 51 产品/测试 | 编排/运行时核心 | 仅 judge 主动 deny（非 c-deny 档、tier 非 deny）或 manual/retry-capped 可申请；其它 manual/row-failed/后台/只读/硬地板均不可；工具仅注入才注册；键含 roleId/projectRoot/cwd/entry/argv | **pass** |
| AC-02 | P2 不可申请档矩阵与硬地板 | 五路径授权顺序、资格矩阵、readonly 守卫、通道测试 | `test/编排/shell-gate.test.ts`（五路径+只读矩阵）、`shell-readonly.test.ts` 9/9（未改）、`shell-escalation.test.ts` 资格矩阵；E2E `SE_READONLY_*`；构造期 `readonlyOnly+takeGrant` 抛错；c=deny/preblock/write-guard 不消费 | 同上 | 编排/桌面窗口/门禁引擎 | 不可申请档全部拒绝且无卡；脚本 c=deny 全模式终结；advisory 非 script c=deny 不消费不放行；readonly 不注入/不调用 takeGrant；陈旧授权不能越过 | **pass** |
| AC-03 | P1/G3 申请工具与精确命令匹配 | runtime-core 工具/schema/argv、registry/限流/回执 | `test/runtime-core/shell-escalation-contract.test.ts` 9/9（runtime-core 281/274/3 中 3 fail 为 B0 EPERM）；schema `{command, necessity?}`、`additionalProperties:false`；处理器无 fs/exec，argv 由 `splitCommand` 生成；5/1 限流与 pending 拒绝测试通过 | 同上 | 运行时核心/编排 | 注入+shell arm 才注册；模型不能供 argv/授权；申请不执行不写盘；超限/待答不弹卡；**待答回执在本会话 pending 路径如实**；跨卡待答缺陷见 AC-09 R2 | **pass**（跨卡待答回执缺陷归 R2） |
| AC-04 | P1/P10 升级卡内容与三选项 | presenter/渲染测试、真实截图、payload、必要性超限 | `test/桌面应用/shell-escalation.test.ts` 21/21、桌面UI 350/350、E2E 截图 30/31 与检查；`ShellEscalationIpcCard` 含 command 逐字/argv/cwd/judge 三字段/necessity+necessityNote/customerNotJudgeNote/actions | 同上 | 桌面窗口/桌面UI | 命令/judge 事实/必要性标注/三选项/客户手批声明/默认拒绝焦点均在；**但客户可见卡未展示「脚本上下文摘要（路径 + sha256 + 有界内容，如有）」**：IPC 已带 `approvalContext`（`test/桌面应用/shell-escalation.test.ts:101`），渲染侧 `shellEscalationView`/`ConfirmCard.tsx` 无该区块（`grep approvalContext app/renderer/src` 零命中），E2E `seRequest()` 不含 approvalContext，截图 30/31 无该内容 | **fail（R1）** |
| AC-05 | P1/G3 客户决定、回执与授权创建 | 桌面/编排回执、授权创建、真实回执 | `test/桌面应用/shell-escalation.test.ts`（三动作/重复回包/未知 id）、集成 A/A2、E2E 决策线（SE_ALLOW_*_WIRE）与 registry 回执 `ok`；授权仅回包后由 registry 创建；回执文案逐字核对 | 同上 | 桌面窗口/编排 | 三决定回执如实；未知/过期/重复不放行；工具/角色不能造授权；真实模型回执记录缺失但 E2E 以真实 registry/文件 sink 驱动了回执（边界见 §七） | **pass** |
| AC-06 | P1/P10/G1 无答复/通道不可用默认拒绝 | 假时钟/通道/中止、真实超时 | `test/编排/shell-escalation.test.ts` 超时/不可用/中止；桌面测试四组时序；E2E `SE_TIMEOUT_DEFAULT_DENY`/`SE_TIMEOUT_UI_EXPIRED`（受控 400ms 清理） | 同上 | 桌面窗口/编排 | 超时/不可用/推达失败 → expired/unavailable（默认拒绝）并消耗；不重试/不二卡；窗口关闭/轮次中止失效；超时链代码实现（env → 审核 → 120s） | **pass**（真实超时用受控 400ms，见 §八.4） |
| AC-07 | P3 授权作用域、消费与脚本时效 | once/session/键/stale/c=allow 不消费、两次调用 | 集成 A/A2/E/I；`shell-gate.test.ts` 授权顺序；`takeGrant` 位置（classify 后仅 review/risky；script c=deny→重载→授权）；stale 作废终态 | 同上 | 编排/桌面窗口 | once 原子消费、session 反复、键各维度不匹配不生效、dispose 失效；c=allow/c=deny 不消费；脚本变化 stale 拒绝且不可再申请；开关关闭后授权仍有效 | **pass** |
| AC-08 | P4 每命令每会话一次、限流与旧记录清理 | 状态机/矩阵/限流/清理 | `shell-escalation.test.ts` 状态机/矩阵/清理/限流；集成 C（5 次上限、pending 1 张、旧记录清理）；后台不清写台账 | 同上 | 编排 | 每命令一次（允许/拒绝/超时/消费均终态）；上限 5/同会话 1 张；旧记录随非可申请审核删除；后台 review 只忽略 | **pass**（跨卡待答计数口径不一致见 R2） |
| AC-09 | P4/G1 升级卡与审批卡仲裁 | 四组时序、单槽、回执 | `test/桌面应用/shell-escalation.test.ts` 四组时序（升级先到/审批先到/等待超时/中止）；E2E 仲裁检查/截图 37；等待期间不启动确认超时（代码顺序） | 同上 | 桌面窗口/桌面UI | 升级卡排他、审批卡等待、等待上限 fail-closed、单槽不覆盖均通过；**「审批卡待答 → 升级申请直接拒绝」的角色回执不合格**：presenter 返回原因「…请稍后再申请」，registry 却回「未获客户允许（超时/通道不可用，默认拒绝）。本会话不再受理同一命令的申请」并把记录判终态、消耗申请权（探针实测，§3.5），与标准要求的「当前有 pending shell 确认卡，请稍后再申请」不符，也与 B1 声明计数口径「呈现前待答拒绝不消耗」不一致 | **fail（R2）** |
| AC-10 | G1/P5 不丢、不重放与决定审计 | replay/窗口关闭、escalation-decision 记录 | 桌面 replay/关窗测试；`shell-escalation.test.ts` 审计断言；D2/E2E JSONL 的 `escalation-decision`（branch/conclusion/execution/conditions/escalation）；审计失败不翻转 | 同上 | 编排/桌面窗口 | pending/replay/expire、未知/重复 id、关窗/中止默认拒绝；允许/拒绝/超时均写完整记录（拒绝/超时由单测覆盖）；append-only 同文件 | **pass** |
| AC-11 | P10/G2 judge 不参与升级、onReviewed 只读 | spy/行为、onReviewed 只读、治理零关联 | `shell-escalation.test.ts` spy（judge 零调用）、`onReviewed` 抛错不影响判定；升级卡不写治理记录、不读「替我决策」 | 同上 | 编排/桌面窗口 | 升级全过程 judge 调用 0；onReviewed 不改变 ShellReviewResult；升级卡与治理 approval 组无关 | **pass** |
| AC-12 | P7/P10 单一谓词与两处消费 | diff、同引用、rg、单测 | `rg` 单一定义（classify-shell.ts:341）；分类器 :508、写守卫 :540、Service 再导出 :17；`shell-rules-public-reexport.test.ts` 同引用；委托经 Service 出口 | 同上 | 门禁引擎/编排 | 唯一纯函数、两处消费同一引用、无第二份实现；委托只认原三 id | **pass** |
| AC-13 | P7 白名单命中 → c-allow、0 卡、0 judge | 分类器/写守卫/委托、judge 计数、真实运行 | 门禁引擎 288/287；集成 G；E2E `SE_WHITELIST_*`（项目/内置档 0 judge、审计 c-allow、非命中仍审核）；审计样例 `c-allow` 无 judge | 同上 | 门禁引擎/测试 | §5.1 全部精确形态命中并 0 卡 0 judge（含内置角色）；项目角色原委托三形态分支变 c-allow；`npm install` 不在命中 | **pass** |
| AC-14 | P7 非命中形态与 fail-closed | 负例矩阵、gate 集成 | `test/门禁引擎/shell-routine.test.ts`（npm install/npx/tsc 裸/tsc -p/越界或带 flag node --test/npm ci flags/任意脚本名不命中）；gate 集成 judge/客户卡路径 | 同上 | 门禁引擎/编排 | 非命中形态均不是 c-allow，落既有链；硬拒/封堵优先；`npm install` 保留判拒+申请 | **pass** |
| AC-15 | P7/P11 委托策略只保留原三 id | 委托测试、断言变更逐条 | `shell-authorized-routine.test.ts` 更新后 637/636/1（唯一 EPERM）；委托三 id 命中、`npm ci`/`tsc --noEmit`/`npm run test|lint|check` 不继承；diff 逐条理由在 B1 §五 | 同上 | 门禁引擎/编排 | 委托只接受三 id 且保留项目根/cwd/realpath 校验；断言变更逐条列明、无其它弱化 | **pass** |
| AC-16 | P7/P10 自定义规则集与硬拒优先 | 规则集注入测试、gate | `shell-routine.test.ts` 自定义更严格 risky 下白名单仍 allow、硬拒/记号仍 deny；分类器调用位置（硬拒/记号后、risky 前） | 同上 | 门禁引擎 | 断言显式；硬拒优先；行为符合客户闸门 1 接受口径 | **pass** |
| AC-17 | P6 开关关闭路径逐字不变 | operator-channel 既有测试、回归、真实截图 | `operator-channel.test.ts` 57/57；桌面应用 443/443；`shell-escalation.test.ts`「开关关闭」用例；E2E 截图 38 与 `SE_PAUSE_SHELL_REQUEST_GOES_TO_CUSTOMER`；diff 显示 presentConfirmed 既有文案/超时/拒绝未改 | 同上 | 桌面窗口/编排 | 开关关闭时非白名单命令走既有卡（显示/超时/拒绝/可用性不变）；无升级卡/无 judge；客户手批审计形状不变 | **pass** |
| AC-18 | P6/P1 开关开启时 manual 仍拒绝、retry-capped 可申请 | operator-channel/desktop、资格、真实应用 | `operator-channel.test.ts` 新增 retry-capped 回归；`shell-escalation.test.ts` 资格；集成 C；E2E S5（retry-capped 卡+页脚） | 同上 | 桌面窗口/编排 | 其它 manual/row-failed 仍拒绝且不弹卡；retry-capped 判拒记录可申请；无新增 manual 结果行 | **pass** |
| AC-19 | P8/P9 回执措辞 | zh/en 断言、containsExitLine、真实回执截图 | i18n 测试（三词兼容、judgeWayOut/retryCapped 含 request_shell_escalation）；b-deny/c-manual 全句断言（D1）；`ui.judge.closeAndRetry` 新句在目录；**真实运行只见判拒行折叠态（截图 32/35），retryHint 文本与聊天回执未展示；渲染测试只断言旧子串，未断言新措辞** | 同上 | 编排/桌面窗口/项目管理 | 文案本身正确、角色可见回执有全句断言；客户可见 retryHint 的新措辞缺少真实运行截图/记录与新措辞断言 | **insufficient evidence（E1）** |
| AC-20 | P8/G4 暂停语义与持久化隔离 | interface/desktop、真实窗口重开/重启/治理组、偏好 | `interface.test.ts`/`shell-escalation.test.ts` 暂停状态机；E2E `SE_PAUSE_*`（模块级、shell-only、治理组不变、偏好不存在、窗口重开保留、第二进程重启清零、恢复后开关不变） | 同上 | 桌面窗口/桌面UI | `shellSessionPaused` 模块级/shell-only/不写偏好/跨窗口重开保留/重启清零；治理 approval 组仍只看全局开关；白名单不被暂停 | **pass** |
| AC-21 | P8 暂停入口与 UI 状态 | 渲染测试、真实截图（行按钮/页脚/徽标/恢复）、i18n | 桌面UI 350/350（judge-row 新增 2 条、升级卡视图 11 条）；截图 32/34/35/36；i18n 键成对 | 同上 | 桌面UI | 判拒行暂停按钮、升级卡页脚暂停（非第四决定项）、徽标/恢复、中英均具备 | **pass** |
| AC-22 | P5 审计三类可区分与 escalation-decision | 当前候选 JSONL 样例、单测、grep、diff | D2 JSONL 6 行（§3.3，sha256 匹配）；独立复跑同结构；单测审计字段；命令/argv 逐字未改；无凭据模式（E2E `SE_AUDIT_NO_CREDENTIAL_PATTERN`） | 同上 | 编排/测试 | judge 放行/客户手批/客户升级授权/申请决定四类可机读区分；新增字段无凭据；既有 command/argv 逐字不变 | **pass** |
| AC-23 | P5 审计共享 sink 与不丢记录 | diff、fake sink、真实 JSONL、回调 | `createShellGate` 构造期 `onAuditSinkCreated` 以实际 sink 回调；run-role/shell-arming 透传；集成/单测 fake sink；D2 真实默认文件 sink 同文件 | 同上 | 编排 | 升级决定与 review 同 sink/同文件 append-only；外部注入 sink 同样触发回调；失败不翻转判定并如实 stderr | **pass** |
| AC-24 | P9 i18n 中英成对、计数、零泄漏 | i18n 测试、key diff、渲染消费 | i18n 测试通过：计数 **ui 902 / main 559 / shared 62 / preferences 3 = 1526**；parity；英文值零中文泄漏；全量无 missing-key；SHELL_ESCALATION_KEYS 27 项中英成对 | 同上 | 项目管理/桌面UI | 25 新 key + 2 改写中英成对；计数显式更新；既有 key 语义不变；渲染消费正确 | **pass** |
| AC-25 | P11/G2 受影响套件与断言不弱化 | 各角色原始输出、`git diff -U0`、B0、分类 | 本报告 §3.1 全部复跑；`git diff -U0 -- test`：删除 14 行旧断言/新增 160 行断言，逐条变更对应方案 §5.4/§4.6 并已在 A2/B1/C1/D1 报告列明理由（尤其委托形态→c-allow、`npm ci` 负例、旧文案），无新增 skip/todo；B0 失败分类一致 | 同上 | 各实施角色/测试 | 受影响层全过（除既有 EPERM）；断言变更逐条有理由、未删除测试覆盖、未新增 skip/todo | **pass** |
| AC-26 | P11 跨层集成 | `test/测试/` 集成原始输出、test diff | `test/测试/shell-escalation-integration.test.ts` 14/14（EV2）；覆盖授权顺序五路径、资格矩阵、限流/去重、审计区分、暂停不波及治理组、白名单 0 judge；注入替身、不启动 Electron/模型 | 同上 | 测试 | 跨层六类断言全部覆盖并通过；结论非单测拼凑 | **pass** |
| AC-27 | P11 T3 全量回归与失败分类 | 全量原始输出、B0、消费者重测 | 本报告头部/§3.6：3337/3310/9/18/0；9 项与 B0 逐名相同（行号移位）；新增确定性失败 0、新增 skip 0、新增 todo 0；消费者清单见项目文件（run-role/tools/session 等实际消费方均在套件内） | 同上 | 测试 | T3 全量已执行并按基线分类；新增失败/skip/todo = 0 | **pass** |
| AC-28 | P1/P5/P7/P8/P11 真实 Electron E2E 与截图 | 场景矩阵、截图元数据、E2E 日志、审计 | D2 证据核验（§3.4）＋ **E2 独立复跑 E2E_PASS=true、70/70**；截图 30–38 哈希与报告一致；审计 6 类；窗口 1360×860、临时 userData、无 DEBUG；多引擎缺口如实记录 | 同上 | 测试/桌面窗口/桌面UI | S1–S12 的客户可见面（卡/三选项/仲裁/暂停/窗口重开/重启清零/白名单 0 judge/只读 A/审计）有真实 Electron 证据；整机 app/main 与真实模型链缺口如实披露（§七） | **pass** |
| AC-29 | P11 typecheck 与构建 | 三条命令原始输出/退出码 | EV2：`npm run typecheck` 0、`typecheck:renderer` 0、`build:renderer` 0（§3.6）；`app/renderer/dist/` 忽略产物非候选 | 同上 | 各角色/测试 | 三条命令 exit 0；dist 未进入候选 | **pass** |
| AC-30 | 回滚开关语义 | 环境开关测试、diff、行为声明 | `shellEscalationDisabled` 仅精确 `"1"`；`openRoleSession` 测试 `ANS_SHELL_ESCALATION_DISABLED=1` ⇒ registry 不创建、工具能力不注入；`takeGrant` 不注入（escalationWiring 为空）；白名单不受开关（classify 独立）；方案 §13.2 口径 | 同上 | 编排/运行时核心 | 开关关闭时工具不注册、无 registry、既有授权全部失效；白名单需代码回退（如实声明） | **pass** |
| AC-31 | P12 无越权改动与发布边界 | diff/枚举、package/build/release 零改动、边界三项 | §2.2：产品/测试 51 均写集内；发布/构建面零 diff；边界仅 B-1/B-2/B-3；管理记录不混入；角色 id/显示名/职责描述未改；overlay 子项 N/A（新小版本，依据团队计划 §八/§九.10） | 同上 | 统筹/测试/人事 | 无范围外改动；无越权；发布边界守住 | **pass** |
| AC-32 | G3 权限不扩张 | diff、对抗注入、单测 | 工具处理器无 fs/exec；授权仅精确 argv/cwd/role/project/entry；伪造 id/回包/非法动作 → expired；跨角色/项目不生效；post-audit/写守卫/审计边界零 diff | 同上 | 运行时核心/编排/桌面窗口 | 工具只申请；授权最小化；伪造不放行；硬地板不可越过 | **pass** |
| AC-33 | G2 judge 既有行为不回归 | 既有 judge 套件、diff | `test/编排/shell-judge.test.ts` 等在 637 套件内通过；shell-judge-verify 38/38；deny 档 `hardDenyOverride`、结果行、retry-capped manualAsDeny 事实保留；无判定变化 | 同上 | 编排/测试 | 既有 judge 判定/结果行/deny 标记无回归 | **pass** |
| AC-34 | G4 开关持久化不回归 | interface/preferences、偏好文件 | interface 测试（69 行新增、1 行调整，setShellJudgeEnabled 未改）；E2E `SE_PAUSE_NO_PREFERENCE_FILE`/`SE_RESTART_PREFERENCES_UNTOUCHED`/`SE_RESUME_PERSISTENT_SWITCH_UNCHANGED`；无新偏好键 | 同上 | 桌面窗口/测试 | 全局开关持久化/重载不变；暂停不写偏好；`shell:judge-set` 校验不变 | **pass** |
| AC-35 | G5 文档状态与基线可追溯 | 文档链接/哈希、状态行、变更包、git status | §一/§二；9 份 change 报告中 **A1/A3/C1/C2/D1/D2 有 `implemented-unverified`、B0 为 `baseline-recorded`；A2、B1 无状态行**；无提前 `verified`；无 `docs/verification/`；无 commit/push；变更包列出方案/标准/候选/节点/证据 | 同上 | 统筹/独立验收 | 基线/确认链/写集/候选可追溯；**A2/B1 完成报告缺 `implemented-unverified` 状态行**，与 AC-35「实现完成未验收标 implemented-unverified」及判定方法第 2 条不符 | **fail（R3）** |

## 五、返工清单（R#）

| ID | 对应 AC | 差异与依据 | 应回所有者 | 修复/复测要求 |
| --- | --- | --- | --- | --- |
| **R1** | AC-04 | 升级卡客户可见面缺少「脚本上下文摘要（路径 + sha256 + 有界内容，如有）」。IPC 卡已带 `approvalContext`（`app/desktop/shell-escalation.ts` 构建；`test/桌面应用/shell-escalation.test.ts:101` 断言转抄），但 `app/renderer/src/chat/judge.ts::shellEscalationView` 与 `app/renderer/src/shell/ConfirmCard.tsx` 无任何 approvalContext/脚本上下文区块（`grep approvalContext app/renderer/src` 零命中）；E2E `seRequest()` 也未带 approvalContext，截图 30/31 无该内容——客户看不到 judge 判拒时所依据的脚本上下文 | 桌面UI（渲染）；桌面窗口（E2E/截图证据） | 在升级卡增加独立脚本上下文摘要区块（路径/sha256/有界内容，沿用既有脚本上下文安全展示边界，不引入新权限）；补渲染断言与真实 Electron 截图/检查（含 approvalContext 的脚本类判拒样例）；重取受影响证据 |
| **R2** | AC-09（并影响 AC-03/AC-08 的实现声明计数口径） | 「审批卡待答 → 升级申请直接拒绝」的角色回执与重试语义不符合标准。`createShellEscalationPresenter` 在有审批卡待答时返回 `{action:"unavailable", reason: mainT("main.operator.escalation.pending")}`（`app/desktop/shell-escalation.ts:219`，文案含「请稍后再申请」），但 `createShellEscalationSession.request()` 只按 action 归纳，落 `expiredMessage()`（`src/common/编排/shell-escalation.ts:509-512,596`）：角色收到「未获客户允许（超时/通道不可用，默认拒绝）。本会话不再受理同一命令的申请」，且记录转 `expired` 终态、消耗每命令申请权与会话额度；审批卡解决后再申请仍被拒、presenter 不再被调用（§3.5 探针实证）。与 AC-09「回执如实提示『当前有 pending shell 确认卡，请稍后再申请』」不符；也与 B1 完成报告 §三.6 声明的「因已有待答在呈现前被拒的调用不消耗会话额度/申请权」不一致 | 编排（registry）；桌面窗口（presenter 契约配合） | 约定可区分的「待答」结果（而非泛化为 unavailable），registry 在呈现前因待答被拒不消耗申请权/额度、保持 `recorded` 可稍后重试、回执如实；补跨卡待答的集成/E2E 断言（含「稍后再申请成功」路径）；同步修正完成报告的计数口径表述 |
| **R3** | AC-35 | `角色卡/门禁引擎/docs/change/2026-10-31_change_shell-escalation-A2.md` 与 `角色卡/编排/docs/change/2026-10-31_change_shell-escalation-B1.md` 无 `implemented-unverified` 状态行（其余 7 份具备；未见提前 `verified`）。按 AC-35「实现完成未验收标 implemented-unverified」与判定方法第 2 条 | 门禁引擎（A2 报告）；编排（B1 报告） | 在两份完成报告补状态行 `implemented-unverified`（不改实现内容）；随后由统筹重新冻结 E1/候选清单受影响治理记录哈希，并重取受影响文档证据 |

## 六、证据不足清单（E#）

| ID | 对应 AC | 缺口与依据 | 补证责任 | 建议补证 |
| --- | --- | --- | --- | --- |
| **E1** | AC-19 | 客户可见判拒结果行 `retryHint` 的新措辞缺少真实运行证据与新措辞断言：(a) i18n `ui.judge.closeAndRetry` 已正确改写并由 `app/renderer/src/chat/judge.ts` 消费、`judge-row-view.ts` 在判拒行详情内渲染；(b) 但渲染测试仅断言旧子串「关闭『替我审批』后重试」（`test/桌面UI/judge.test.ts:66`、`judge-row-view.test.ts:139`），未断言新措辞「可让角色申请客户确认（允许一次 / 本会话允许该命令 / 拒绝）…」；(c) D2 截图 32/35 的判拒行详情为折叠态，未展示 retryHint 文本，E2E 无该文本检查，也无聊天/工具回执记录。按 AC-19 最低证据「真实应用回执截图/聊天记录」与 V1 §2.3.3 | 桌面UI（截图/渲染断言）；桌面窗口（E2E）；测试（断言） | 真实 Electron 截图（判拒行详情展开显示 retryHint）或真实回执/聊天记录（含候选哈希/步骤），并补新措辞断言；无需改文案（目录与消费点正确） |

> 说明：E1 是取证缺口而非已证失败；按 V1 §2.3.1 判 `insufficient evidence`，不得判 pass；修复后按受影响证据重取即可，不需全量 T3（若无代码变化）。

## 七、限制与未覆盖（如实记录，不据此改判）

1. **E2E harness 非 `app/main.ts` 整机进程**（D2 §六.3）：真实 Electron、真实 build、临时 userData、真实产品模块与 IPC；但窗口/主进程由 harness 自建。暂停的模块级归属、shell-only 组合与治理组表达式另由源码事实与 C1/D1 单测钉住。属团队计划既有 E2E 设计；本报告接受为证据边界，不据此判 fail。
2. **无真实模型/网络会话**（D2 §六.1）：升级卡由真实呈现端直接收到卡请求；「模型 → `request_shell_escalation` → registry → presenter」整链由 B1/D1 真实 registry/工具/闸 + 替身覆盖。AC-05 的真实工具回执因此仅有 registry/文件 sink 级记录，不是聊天截图（见 §八.2 观察）。
3. **多引擎覆盖边界**：真实 E2E 只走默认 `pi` 视图路径；Claude/Codex 未跑（团队计划 §10.2 第 5 项 / V1 §1.3 允许，缺口已如实记录）。
4. **审计 JSONL 的三决定齐全性**：样例含 judge 放行/客户手批/客户升级授权/`escalation-decision`（allow-once）；拒绝/超时的 `escalation-decision` 由 B1/D1 单测覆盖，未在 JSONL 中再生成（D2 §六.5 已披露）。
5. **真实超时口径**：E2E 用受控 `cleanupAfterMs=400`（同一产品核心）而非 `ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS`；生产超时链语义由代码与单测覆盖（D2 §六.6；见 §八.4）。
6. **窗口重开 vs 重启**：Windows 单窗口下由 harness 同一进程重开窗口（暂停保留）+ 第二独立 Electron 进程（重启清零）分别验证（V1 §九.5 程序；D2 `SE_PAUSE_PRESERVED_ACROSS_WINDOW_REOPEN`/`SE_RESTART_PAUSED_CLEARED`）。
7. **T3 全量排除 `write-sequencing.test.ts`**：历史串行写测试，按团队计划 §6.3 / V1 AC-27 排除并记录理由；9 项 EPERM 为 B0 既有环境失败，未新增。
8. **候选管理记录漂移**：E1 冻结后沟通记录被追加 E2 启动记录（§八.1）；产品/测试候选不受影响。

## 八、标准外风险观察（不改判，供调度/沟通处理）

1. **变更包与工作区的一处账面不一致**：`docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md` 在 E1 冻结后由沟通追加「独立验收 E2 启动（2026-10-31）」（84→93 行；blob `b775399b…`→`60b492ae…`；sha256 `84692e0a…`→`32338c84…`），E1 清单该项已过期。追加内容与 E1/V1 哈希一致，闸门正文未变，且属 V1 §2.7 管理记录、不混入产品候选；但按 E1 §一「任何文件在 E2 前发生变化即本候选失效」的字面规则，E1 的 80 文件清单已不能逐项复算。建议 E3 在提交拆分时重新冻结清单（治理记录提交前再复算），避免后续候选复算歧义。本报告按 V1 §2.7 将产品候选（51/51 一致）与管理记录分离，不据此改变 AC 判定。
2. **AC-05 真实工具回执形态**：标准最低证据要求「真实应用回执截图或聊天记录」；当前真实 E2E 以真实 registry + 文件 sink 捕获回执（`auditEscalateReceipt.ok=true`），但未在真实聊天/模型链路展示。建议后续补一次真实模型会话的升级回执截图（若组织允许），否则在变更包中明确该证据以 registry 级记录替代的理由。
3. **AC-06 真实超时缩短方式**：建议后续 E2E 用 `ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS` 缩短超时以完全贴合 AC-06 判定方法第 3 条（当前用受控 400ms 清理）。
4. **D2 harness 既有日志抖动**：`background-tasks:list` 无 handler 等既有日志在 B0 与最终运行同样出现（`00-baseline-stdout.log` 54 处 vs `06-run-stdout.log` 57 处），非本变更新增；`HANDBACK_CARD_PRESENT` 等未计数日志行在负载下抖动，D2 已用未改动 HEAD 复现（`E2E_PASS` 均 true）。不构成 fail。
5. **A2/B1 完成报告状态行缺项**已在 R3 记录（标准内），此处不重复。

## 九、总体结论

**返工（rework）**。

- 35 项 AC 中：**31 项 pass**；**3 项 fail**（AC-04/R1、AC-09/R2、AC-35/R3）；**1 项 insufficient evidence**（AC-19/E1）。
- 按 V1 §2.1/§八：通过要求全部 AC 通过且无证据不足阻断项；本候选不满足，故总体结论为**返工**。
- 返工交原所有者：R1 → 桌面UI（+桌面窗口补证）；R2 → 编排（+桌面窗口契约配合）；R3 → 门禁引擎/编排（文档）；E1 → 桌面UI/桌面窗口/测试（补证）。
- 本报告只判定 HEAD `9f670fb` + E1 80 文件候选（产品/测试 51 文件哈希一致）；候选变化后本结论失效，需按 V1 重取受影响证据并重新判定。
- 本报告**不授权**提交、推送、合并、发布；不声称已验收通过；验收报告仅由独立验收（E2）写，本报告即该唯一判定。

---

- 报告路径：`docs/acceptance/shell-escalation-report-v1.md`（本文件）；报告 SHA-256 于交付回报中给出（避免自引用不写入正文）。
- 判定角色：ANS 内置独立验收（E2，唯一主验收上下文）；未启动子上下文；未改代码/测试/方案/计划/角色卡/沟通记录；未 `git add/commit/push/stash`。
