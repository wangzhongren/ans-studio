# 阶段 E 完成记录：测试终验、T3 全量回归、真实启动/演示与变更包数据（治理分工第 1、3、5 项）

- **任务 ID**：`2026-10-22-governance-split-1-3-5`（flowId `governance-split-1-3-5`）
- **记录角色**：测试（独立固定角色上下文；只承担本角色）
- **日期**：2026-10-22
- **阶段**：阶段 E（N9 终验 + N10 变更包数据准备）
- **状态**：**`verified-by-tests-only`（测试证据已完成；未做独立验收判定，不宣布通过）**
- **授权依据**：闸门 2 确认与实施授权（`docs/communication/2026-10-22_intent_governance-split-1-3-5.md`「闸门 2 确认与实施授权记录」）；团队计划 `docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md` §4.2「测试」、§5.1 N9–N10、§6、§11.12；验收标准 `docs/acceptance/governance-split-1-3-5-criteria-v1.md` §3.4/§4.2/§6
- **结论摘要**：`real-entry` F3 断言已按新事实改为「演示不产生新的 scheduling 记录、也不改写既有记录」并通过；四个跨角色 e2e 套件 154/154 通过（e2e-auto 68、trio 22、judge 36、liaison 28）；T3 全量回归两次均为 **3448 / 3421 pass / 9 fail / 18 skipped**，9 项红全部为基线既有 Windows symlink EPERM，**零本次新增红**；`typecheck`、`typecheck:renderer`、`build:renderer` 均 exit 0；真实 Electron 总自检 `E2E_PASS=true`，并在真实 Electron 窗口内跑通「appointment 卡 → Crew 写卡 → Convener readiness → 实施派发 → 标准/变更包 → Verifier acceptance」演示（`DEMO_PASS=true`，7 张截图）。

---

## 一、环境

| 项 | 值 |
| --- | --- |
| OS | Windows 11 Pro 10.0.26300（Git Bash 5.3.15） |
| Node | v24.22.1（`C:\Users\51054\AppData\Local\Programs\nodejs\node.exe`；每条命令前 `export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`） |
| npm | 11.19.1 |
| Electron | 44.7.0（`node_modules/electron/dist/electron.exe`） |
| 仓库/分支 | `C:\Users\51054\Desktop\work\ans-studio` / `feat/background-tasks-governance-and-reasoning` |
| HEAD | `c3693ecdcb78bd83def351c0f2967571dad7174c`（阶段 E 开始与结束时一致） |

---

## 二、`real-entry` F3 断言更新（任务 1）

### 2.1 原断言失效的事实

`test/测试/real-entry.test.ts` 原用例断言仓库根**不存在** `docs/scheduling/`。本任务合法新建了统筹管理记录 `docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md`，阶段 A 基线已将其记为确定性既有失败（A2 项）。删除管理记录或放宽断言都不允许。

### 2.2 新断言（保留 F3 强度）

- 运行 `runCli(["role","run","编排","--task","T-1"])` 前后对 `docs/scheduling/` 做**递归快照**（目录不存在视为空集；每个文件记录 SHA-256）；
- 断言演示后**没有新增文件**（新记录）且**既有文件内容逐字节不变**（可捕获覆盖写）；
- 反向守卫：目录存在时快照必须至少读到 1 条记录，防止路径算错导致空集恒等假通过；
- 不删除 `docs/scheduling/`、不跳过、不放宽为永远通过。

结果：`node --test test/测试/real-entry.test.ts` → exit 0，16/16 通过；F3 用例单列通过（见 `real-entry.log`）。全量回归中该项不再出现（基线确定性红由 10 项降为 9 项）。

---

## 三、`test/测试/**` 内受新行为影响的用例更新（任务 4）

> 原则：不得删除测试或放松断言保绿。旧断言与客户确认方案冲突时按方案更新，并记录理由。所有更新均保留原有负例/强度，新增了第 1/3 项要求的负例。

| 文件 | 变更摘要 | 理由 |
| --- | --- | --- |
| `governance-e2e-auto/b-proposal-accept-timing.test.ts` | 重写为「proposal accept ⇒ Convener 一条任务写流程 YAML + 团队计划并**直接发 appointment 卡**；任命后应用派 Crew 写卡」；2b 改为「无团队计划发任命卡 ⇒ 卡前守卫拒绝（无客户卡/无判断/无账本/不派 Crew/不循环）」 | 第 1 项：团队判断/团队计划归 Convener；Crew 不再提名/发 appointment |
| `governance-e2e-auto/c-appointment-timing.test.ts` | 重写为「Convener 依团队计划发 appointment 卡 → 应用派 Crew 写卡（第 5 项完整产物）→ 结构校验通过才派 Convener role-readiness 恰一次」；3b 改为 Crew 未写卡 ⇒ 不派 readiness、有界修正反馈不循环；新增 3c 客户取消任命 ⇒ 不派 Crew | 第 1/5 项；保留「写卡前不派 Convener」「恰一次」强度 |
| `governance-e2e-auto/d-dispatch-listing.test.ts` | 任命后应用派 **Crew**（role-cards）而非 Convener；新增 O2 负例（缺实施前标准 ⇒ 派发拒绝）、补标准后受理；账本断言改为 app→nominator role-cards + Convener impl | 第 1/3 项；O2 硬门槛 |
| `governance-e2e-auto/f-acceptance-gate.test.ts` | runCase/6f 预置结构合格的标准/报告/变更包（T1），其余负例（缺 dispatch/阻塞/未结算/非法 YAML）继续由产品门槛产生 | 第 3 项：验收卡机械门槛要求三类物证与档位一致；未放宽 |
| `governance-e2e-auto/i-full-chain.test.ts` | 重写为 canonical 正链：意图→提案→**Convener 团队计划+appointment**→Crew 写卡→readiness→实施→标准/变更包→Verifier 报告+acceptance；含账本/顺序/0 手卡断言 | 第 1/3/5 项完整链路；离线无真实凭据时产品自动验收派发按设计不派，用例用真实 Verifier 会话显式驱动（真实 gate/judge/账本/预授权写区不变） |
| `governance-e2e-auto/p-team-plan-guard.test.ts`（新增） | 卡前守卫 7 负例：计划缺失、flowId 不符、推荐集空、推荐集含内置角色、选项未覆盖、选项含内置角色、推荐角色缺职责行；每个都断言无客户卡/无判断/无账本/不派 Crew | 方案 §8.6/P2 负例矩阵 |
| `governance-trio-verify/b-gates-dispatch-ledger.test.ts` | 派发场景先写结构合格标准（O2）；账本契约改为 Convener 写团队计划+发 appointment（actor=convener/power=schedule/绑定计划），Crew 只写卡；还原口径改为「谁组队/写团队计划」 | 第 1/3 项；不删除门槛 |
| `governance-judge-cards-verify/fixture.ts` | 增加 `CRITERIA_REL/REPORT_REL/CHANGE_PACKAGE_REL` 与三类文档助手；`seedProject` 写入；acceptance 请求 artifacts 带三类路径 | 第 3 项验收机械门槛 |
| `governance-judge-cards-verify/b-card-kinds.test.ts` | 新增第 3 项负例：标准不可读（artifact-missing）、报告首行缺五项、报告档位低于变更包 ⇒ manual；报告升档可批 | P10/降档被拒与证据不足 |
| `governance-judge-cards-verify/d-audit-ledger.test.ts`、`e-queue-once.test.ts` | 断言 accept 后 `nextFunction=schedule` 且**不再有** `nomination-after-flow` followUp | 第 1 项：取消两段式提名 |
| `governance-liaison-verify/e-audit.test.ts` | 链路改为 Convener 写团队计划+任命 → Crew 写卡 → Verifier 写标准 → Convener 派发；还原口径改为「谁组队」；仍断言客户决定证据与交接不混用 | 第 1/3 项；审计可还原性保留 |
| `test/测试/governance-e2e-auto/fixture.ts` | 新增团队计划/角色卡/工作文档/标准/报告/变更包夹具助手 | 支撑上述用例 |
| `test/测试/phase-e-governance-demo.mjs`（新增，仅演示脚本，非 `*.test.ts`） | 真实 Electron 窗口治理链演示（见 §七） | 真实启动/演示证据 |

**未删除任何测试文件，未跳过用例，未放宽门禁**；旧断言对应的行为变化均在客户确认方案内。

---

## 四、canonical e2e 与负例结果（任务 4）

| 套件 | 命令 | 计数 | 退出码 |
| --- | --- | --- | --- |
| governance-e2e-auto | `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` | tests 68 / pass 68 / fail 0 / skip 0 | 0 |
| governance-trio-verify | 同目录 glob | 22 / 22 / 0 / 0 | 0 |
| governance-judge-cards-verify | 同目录 glob | 36 / 36 / 0 / 0 | 0 |
| governance-liaison-verify | 同目录 glob | 28 / 28 / 0 / 0 | 0 |
| `test/测试/**` 全域 | `node --test "test/测试/**/*.test.ts"` | 752 / 745 / **1 fail** / 6 skip | 1（唯一红为基线 EPERM：`test/测试/g4-skill-verify/b-render-double-check.test.ts:182`） |

覆盖的**正链**（i-full-chain + c-appointment-timing）：`提案接受 → Convener 团队计划+appointment 卡 → 客户任命 → 应用派 Crew 写卡（第 5 项完整产物）→ 结构校验通过 → Convener readiness → 实施派发（O2 标准已存在）→ 变更包 → Verifier 报告/acceptance → 客户验收`，账本可还原、0 张手动卡。

覆盖的**负例**：

- 客户拒绝/取消任命 ⇒ 不派 Crew、无 Crew 派发账本（c 3c）；
- 团队计划缺失 / flowId 不符 / 推荐集空 / 推荐集含内置角色 / 选项未覆盖 / 选项含内置角色 / 角色行缺职责 ⇒ 卡前守卫拒绝，无客户卡、无判断、无账本、不派 Crew（p-team-plan-guard + b 2b）；
- Crew 未写卡 ⇒ 不派 Convener readiness、有界修正反馈、不循环（c 3b）；
- 写卡结构校验失败按来源分流（Crew 文件 vs 团队计划）与 `existing/legacy` warning 不阻塞（l-crew-write-validation，沿用既有 9 例）；
- 缺实施前标准 ⇒ 派发拒绝；标准结构不合格/不可读 ⇒ 验收 manual（d、b-card-kinds）；
- 报告首行缺五项、报告档位低于变更包 ⇒ manual；升档允许（b-card-kinds 新增）。

原始日志：`suite-governance-*.log`。

---

## 五、T3 全量回归（任务 2）

### 5.1 命令、计数与耗时（最终候选）

| # | 命令（仓库根） | 退出码 | 耗时 | tests | pass | fail | skipped | todo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `node --test "test/**/*.test.ts"`（run1） | 1 | 22,610 ms | 3448 | 3421 | **9** | 18 | 0 |
| 2 | 同命令（run2） | 1 | 22,989 ms | 3448 | 3421 | **9** | 18 | 0 |
| 3 | `npm run typecheck` | **0** | 1,410 ms | — | — | — | — | — |
| 4 | `npm run typecheck:renderer` | **0** | 604 ms | — | — | — | — | — |
| 5 | `npm run build:renderer` | **0** | 898 ms | — | — | — | — | — |

`build:renderer` 写 `app/renderer/dist/`（`.gitignore` 忽略），只是验证命令，不是候选路径。

### 5.2 与阶段 A 基线逐项对照

| 项 | 阶段 A 基线（HEAD c3693ec） | 最终候选 |
| --- | --- | --- |
| tests / pass / fail / skipped | run1 3416/3386/12/18；run2 3416/3388/10/18 | run1 3448/3421/9/18；run2 3448/3421/9/18 |
| 确定性既有失败 | 10 = 9 EPERM + `real-entry.test.ts:38`（管理记录导致） | **9 = 9 EPERM**；real-entry 已修 |
| 偶发（仅 run1） | `acceptance-dispatch:1265`、`dispatch-delivery:1023` | 两次全量均未复现 |
| 新增红 | — | **0** |

tests 总数 +32：来自阶段 B/C/D 的测试更新/新增（各角色测试文件）与阶段 E 的 `test/测试` 新增用例（e2e-auto +8、judge +1、其余更新未改变用例数或为角色测试），未删除整文件；`test/测试` 区域 745/752 通过、唯一红为基线 EPERM。

### 5.3 9 项 Windows symlink EPERM（逐条指名，环境既有）

`Error: EPERM: operation not permitted, symlink`（errno -4048），与基线逐条一致：

1. `test/claude-adapter/session.test.ts:637`
2. `test/codex-adapter/session.test.ts:351`
3. `test/pi-adapter/injected-runtime.test.ts:185`
4. `test/pi-adapter/injected-runtime.test.ts:193`
5. `test/runtime-core/file-write-safety.test.ts:97`
6. `test/runtime-core/session-store.test.ts:46`
7. `test/runtime-core/session-store.test.ts:58`
8. `test/测试/g4-skill-verify/b-render-double-check.test.ts:182`
9. `test/编排/shell-authorized-routine.test.ts:103`

### 5.4 全量运行中的一次瞬时挂起（如实登记）

最终候选的第一次全量尝试在 `test/pi-adapter/write-sequencing.test.ts`（非本任务候选文件，`git status` 未修改）处挂起超过 10 分钟；终止后立即以**同一命令**重跑即正常完成（22.6s），随后 run2 也正常。该文件当次已把 A/B 组 3 轮结果跑完，挂起点不在本任务改动面；判为宿主/并发瞬时问题，**不是候选新增红**，但作为残余观察项交独立验收知悉（基线也记录过并发负载下的时序敏感项）。

### 5.5 skipped 18 项

与基线一致：1 项 SIGTERM 进程组、1 项 chmod 语义、15 项 D3 权限/umask/chmod/sync、1 项 unreadable 权限；均为平台/环境型按设计跳过，无「缺依赖导致整文件无法运行」、无命令超时。

---

## 六、真实启动/演示证据（任务 3，团队计划 §6.4）

### 6.1 真实 Electron 总自检（既有 `test/桌面应用/e2e/main.mjs`）

- 命令：`ANS_E2E_OUTDIR=<证据目录>/electron-e2e ANS_E2E_PROJECT=<repo> node_modules/electron/dist/electron.exe test/桌面应用/e2e/main.mjs`
- 结果：**exit 0**；`E2E_PASS=true`、`E2E_FAILURES=`、`E2E_DONE=1`（report.txt 398 行）；17 张截图（titlebar/import/chat/denied/profile/bootstrap/refresh/handback/su-pane/pi-panel/pi-saved/operator-card/composer/restore/crosspane/anchor 等）。
- 说明：该既有自检以仓库根为导入项目；应用按既有行为自动写入了 `.ans/sessions/su/claude/ans/{index.json,replay.jsonl}`（`.gitignore` 的 `**/.ans/sessions/` 覆盖，未写源码/文档/治理记录）。这是既有 e2e 的已知副作用，不进入候选。
- 证据：`electron-e2e/report.txt`、`electron-e2e/stdout.log`、`electron-e2e/*.png`。

### 6.2 治理链真实 Electron 窗口演示（新增 `test/测试/phase-e-governance-demo.mjs`）

- 启动方式：`ANS_DEMO_OUTDIR=<证据目录>/governance-demo node_modules/electron/dist/electron.exe test/测试/phase-e-governance-demo.mjs`
- 真实件：Electron 窗口、真实 `app/preload.cjs`、真实渲染器 `app/renderer/dist/index.html`、真实 `app/desktop/interface.ts`、真实 run-role/gate/账本/客户通道；**只有模型适配器是脚本桩**（离线、无凭据、不触网，与既有 e2e 总自检同一注入纪律）。
- 演示链路与结果（`governance-demo/report.txt`）：
  - `DEMO_PASS=true`、`DEMO_DONE=1`；
  - `DEMO_APPOINTMENT_CARD_VISIBLE=true`（Convener 依团队计划发 appointment 卡）；
  - `DEMO_CREW_WRITE_CARD_VISIBLE=true`（应用派 Crew 写卡，appointment-write 逐路径确认）；
  - `DEMO_READINESS_RECORD=true`、`DEMO_CHANGE_PACKAGE=true`（Convener role-readiness + 变更包）；
  - `DEMO_IMPL_DISPATCH=true`（O2 标准存在后 `dispatch_task` 受理入账，actor=convener）；
  - `DEMO_ACCEPTANCE_CARD_VISIBLE=true`（Verifier 写报告并发 acceptance 卡）；
  - `DEMO_DECISIONS=proposal-accept:accepted,appointment:appointed:executor,appointment-write:accepted,acceptance:accepted`；
  - 产物全部落盘（团队计划/流程 YAML/标准/报告/变更包/readiness/角色卡/边界）。
- 截图清单（7 张）：`demo-00-launch.png`、`demo-01-project-imported.png`、`demo-02-appointment-card.png`、`demo-03-crew-write-card.png`、`demo-04-convener-readiness.png`、`demo-05-acceptance-card.png`、`demo-06-accepted.png`。其中 `demo-02` 可见 appointment 卡（流程 flow-demo / 权力类型：任命 / Executor），`demo-03` 可见 Crew 写卡的逐路径清单与「依据团队计划…role-cards」任务，`demo-05` 可见验收卡（通过/不通过）。
- 证据：`governance-demo/report.txt`、`governance-demo/stdout.log`、`governance-demo/*.png`、`governance-demo/project/`（临时演示项目，含账本与产物）。

> 说明：产品在“无真实凭据”环境下不会自动派 Verifier（运行时解析按设计不猜引擎），演示用例因此用真实 Verifier 会话显式驱动标准/报告；门禁/判断/账本/预授权写区仍是真实产品代码。真实 Electron 总自检的 UI 面与治理链窗口演示互补，均不是单元测试替身。

---

## 七、候选与变更包数据（任务 5）

### 7.1 基线/候选身份

- HEAD：`c3693ecdcb78bd83def351c0f2967571dad7174c`（前后一致）
- `git diff --cached --name-only`：**空**（未暂存）
- 候选路径（53 个，`src/**` + `app/**` + `test/**`）：见 `candidate/candidate-paths.txt`
- 候选哈希（`git hash-object` + `sha256sum`）：见 `candidate/hashes.tsv`（下表同源）
- 原始 diff/status：`candidate/status-short.txt`、`candidate/diff-name-only.txt`、`candidate/diff-stat.txt`（**62 files changed, 6282 insertions(+), 1379 deletions(-)**，含角色文档/沟通 memo；产品/测试候选子集 53 个）、`candidate/full.diff`（11,092 行）
- 管理记录（顶层 `docs/`）与角色证据文档**不混入产品候选**；`角色卡/**` 本任务只由各角色写自身文档，未作为产品候选哈希。

### 7.2 候选哈希表

| `git hash-object` | `sha256sum` | 路径 |
| --- | --- | --- |
| 98ed6fc3bdae3a4f252478fd2b0755cbcd2225d5 | 91604cf07178ac68378439d77eefe4e80058e7fb25fb4c0ad9fd831cc00967b3 | app/desktop/customer-input.ts |
| 39f8d391f962f7e58edbfd757f02278dc0cdaa7d | 64680dabc69b1b9e42b68411fcc1f85b4120a6b2dadfbca97a738b5256313319 | app/desktop/governance-advance.ts |
| 2f0282d827ed6a76b42021a7fd52757d891838b9 | d3992ab9b74d571ac834630b506784c2853ba75ed27031f364ed428fa8782512 | app/desktop/interface.ts |
| f72188bd8737c6056727062f3b3487a9960d2f62 | 4f5e62a8f529e69eefb9c1b7314a87f78c0157f0bcb5cf63efed6f9bf7d6ce48 | app/renderer/src/chat/governance-view.ts |
| a3ad631cf0e9d76b40598effd8270f5c8fabe766 | 268a0999015d7bd2f022799fee66e7a035989f8f6a3fdf11c471ef5623b3341b | app/renderer/src/chat/role-view.ts |
| 2679703027850c948772fd59f93cc1ed171d08d1 | 828d0c9cbc8800631d20af7e976748c98d31999ecc551ec659978ea8ad31d5e4 | src/common/编排/flow-service.ts |
| 02ee95429e00c4c9f98534bfa21e950c40523013 | baeb2e4a7ab4d2842db63d918433dc6ca4d649249f8f41ed3f54a3f7a0dc28bd | src/common/编排/flow-state.ts |
| d932a6e5b3fe4e1e0193a26bb5a764c7c1b1a40e | 5cc9d25ae87c1f92081bf64b7f3214e56fdaa27b3d49ff8dadfd4d093c22a820 | src/common/编排/governance-gate.ts |
| 803dc791271a31278ccf333eac31124551eefa2a | aedffe9cc67dc487d4777dad0d4d867e69ca1aaf4f73e4b583559457196f15d9 | src/common/编排/governance-judge-evidence.ts |
| 66cd2ad15c78392a27a02047c06d19f56d25fc67 | b921bf3a1b0dce76c4269db9419657e7550f2ca58147aa61e55c5ced1fb482ac | src/common/编排/governance-judge-facts.ts |
| e6eb723424045ab00add38241fa94a10e9597042 | e97597f0098693477899bd522a4a15f87c5fed6af2c3657fbefb8df63ada71cf | src/common/编排/governance-judge-prompt.ts |
| ed14a98d9800df5debf6bb6f8aa49b204a8dfca6 | 0228962b7ea131f05e900cbcd3db5295bfde298449c91e70ecd707686d4570f7 | src/common/编排/governance-judge-verdict.ts |
| a0d315e60579dbcd11e21ec72e816eecaecda7d8 | e398ada20751cf087c685574fd3c27a97c54aae0521d00fc7bfaa03dec768e93 | src/common/编排/governance-judge.ts |
| c29a78ae763769f9e204c7dc59a5eb2667df8b61 | 5fd7750c94db65fdc8a10b7155ffa4aec6fa3a99919c3d7a7bd4cb18e225c96b | src/common/编排/governance-ledger.ts |
| 4573b5cc2da48f79e5abd3ed5e76503ac120a471 | d82f6fae973dd08e56aee1a4e081115a6444482f2786ec33b4796faeec0a3d1f | src/common/门禁引擎/governance-roles.ts |
| 120db534d7952f3320d34f21afe222067b2b744c | d19c1ab9da354b2a616530a7067a88c12a0375c8763a350719af7a7b5a3b89c9 | src/model/runtime.ts |
| c6723b8c9d9da14ea554b4ed081936ab6edc32fa | 103dff0c1e555963e8ac7217da7adc06fac0f8764308989bdccdac0c33c56eb1 | src/pipeline/orchestration/govern-session.ts |
| e77e9ffd34304a4f0c47708f15223dea5544bd6e | 55f11d2dca9696cd5036e67e9748f4789ae1fb04bca7fc6aa30eb0ecd64a86db | src/pipeline/orchestration/run-role.ts |
| cefd13ea40700fc8d5f5f6b37f4aa63b79fb52ab | 4c3c7a710f5d6a3995440ad7fe68a677110d3850cbc3282647bb28fe396d24c3 | src/provider/runtime/schema.ts |
| 2023e9f08be24c577f8c1adc91fc8f5d8792271b | c2e09c875b2fc633d4b1991379c1ccfdc12e32547e63ad344b96f5178463560c | src/provider/runtime/tools.ts |
| becc8b899cae085fe0ccc8acbca82b5646bfbb43 | ce2d018f4449398e27ac0184faf5b13be3138655b2bb5fc86885941e6495077b | test/runtime-core/governance-flow-metadata.test.ts |
| 38634fec1a4db39d07534752517e8395d2e489ba | 1dc1a82e4db1b268f46095398dcf07664a3c47d048a02774e93c249afdf0aac6 | test/桌面UI/governance-view.test.ts |
| 7cbccd4a00fca9cc55d42c5badd9e15c95999f72 | 6f98d780213a921cba13402e1f3fa58df8377d95fcd4be5f2f6ed067fc597e3d | test/桌面UI/role-view.test.ts |
| 0b4a1ca63425cf6fdec3323d53add34a5234ea10 | c87341ec7c76864c86d0be88b618c7e16d370df09041e19ab0fa3b34a9eb1149 | test/桌面应用/acceptance-dispatch.test.ts |
| 73bdb768ff3d9634ebeb2c1bc0af1d9f86179232 | c3117b2586dc71939f338dae6fee30a08f0c89c255c0512587d1f1616a02554a | test/桌面应用/dispatch-delivery.test.ts |
| 0244d9da29b5c799df56ed841149595636e4a25b | ea4425786e809055e2faab6e0e51986777396d599cf1c9099a77d7ea17a0dae1 | test/桌面应用/interface.test.ts |
| ac8e5dbd7f30dc978e8fdd09978fa485a382b226 | 937274166c4ff45904c97bae8ff5cfa8aacfcefff42825254b97a067990c3c34 | test/桌面应用/operator-wiring.test.ts |
| 19ce26b0819aaeb10f4e59f308fecd9f9db53f2e | 05f2c6015d58bee2f34d40a8de2afad35fc0b303d48c103862e1bf9b7c6c187d | test/桌面应用/session.test.ts |
| fac7232bedffe6b5deabf00791f288cc1283bbb9 | 47caabcf0435d19c2c568c7ad72800147f9ec222cf10666ca8a3aeae60efc4b6 | test/测试/governance-e2e-auto/b-proposal-accept-timing.test.ts |
| b8ca13891c37c639fb88aa63a8c939c8912752a7 | dd1239edc9f2a053c56a9dafbc20e1273f65eaea8e064a84d2864d9f54327fa1 | test/测试/governance-e2e-auto/c-appointment-timing.test.ts |
| 83200081391dc97bd03230ab2df0b93eb3522234 | 3e7273a62c541aae35d1e065f7434c3be4a8fde26604fb25ffe2bef33173a762 | test/测试/governance-e2e-auto/d-dispatch-listing.test.ts |
| b8ebde757d9ceb5483146114cc7e1d6f3fdba76c | 97af55e68337b468eb180db23c6e90f6adaef54aa013c7a65c677a54988e7e3a | test/测试/governance-e2e-auto/f-acceptance-gate.test.ts |
| 2683fe29f7da60c09dd810391c6c621d813b46aa | 87f8c3a98d8cc8786abce8ebc7ad751a15fc6760960a0568240310297efb3ace | test/测试/governance-e2e-auto/fixture.ts |
| 908bedcdabddb207652104905dcf4c3720b87c4e | de1d132322cfc3a42a5219c729504d0586027291ec7b39e5dc333eb6e55a06de | test/测试/governance-e2e-auto/i-full-chain.test.ts |
| 3675e3e3957e3e83f74f810d0d4dd3ffac2f68cb | 78e526b2f2caf2bcbd40255f2444c8e26da47fe44e37e44e3d17a03cd8eefc3a | test/测试/governance-e2e-auto/p-team-plan-guard.test.ts |
| a584c737c0818cb998eedb1b9cd39e0251b7658d | 6dddb7d714226a7269aa510cf1865dfd7238700c45e36f4af5c99a92107a96a6 | test/测试/governance-judge-cards-verify/b-card-kinds.test.ts |
| 66b2e9928d2a4d5ae65c3466c2cf7d94a882bf87 | fd71ce11b49e86fe324580e8b18a16092361d0e7d1b2bc255da5a0d476c88474 | test/测试/governance-judge-cards-verify/d-audit-ledger.test.ts |
| e225a367b08cfa17db9e4c4a2a7c268698cc7de6 | be3bca279a55d384ed37466cecd7880680e6bf26a8432cd4e6aed541fc92ec7c | test/测试/governance-judge-cards-verify/e-queue-once.test.ts |
| 10c147deea3dbdfd459bfab1a8ebed41028709e3 | e984f7b95e3bdb3ec9ba6b636536055194af669d1d6fedd7a9d1ceea82f3bc94 | test/测试/governance-judge-cards-verify/fixture.ts |
| 032372f19afe30e02ef757a4746b958287f36c03 | e5a1609c9031c5599b8de262569b9a9256fd329ebd14012d24120839dd2dc82b | test/测试/governance-liaison-verify/e-audit.test.ts |
| 0127c1c90d4d6981827057845015e001256ab3ee | 3c947c0aedb4716f9f323c883d6a62da0e874d18e8a7ebdfa44a50eee82da931 | test/测试/governance-trio-verify/b-gates-dispatch-ledger.test.ts |
| b6c9ffbbc6f0f1d70ba2116339fa40a416baa5dd | 5d37b2d8fba0311df73b8b0b8f32256a6a03aa36152e3cafb1da545bd9cd7057 | test/测试/phase-e-governance-demo.mjs |
| d331de90dbfe37f8c2236760466920d4700308dd | 5e858496d436b8c9e620a3ffed1d0e674d09e6dc60be875fb9cb523d94507884 | test/测试/real-entry.test.ts |
| 3c6b189d95f97dac5e7330d45095b53633780bb5 | 06a085e279c1fcee0da9d667fab7814c3a9e49337e53e437fcdddc0f4589f250 | test/编排/decision-evidence-packet.test.ts |
| e620aa957e6b016bdab602daf81a4e50b9f2ed3b | 0132c780a6adb86219d6ec0f7e758cee03b133fba8097c8aaaa97f648934cd4e | test/编排/decision-intent-drift.test.ts |
| 0c5353087f498641003f6bcb65b3e4ebdc968716 | 5496b31f51dffd09742ce3700e13eb15085c4a27e76771447f951e6aeb941772 | test/编排/flow-service.test.ts |
| b4f3965ceee4a1a68e5daf359f50d03ddf2b5a03 | 7d4320c02d1d1101243921065ca9dbd7dc8c1e0af4e20c1906a323bfe3da9a04 | test/编排/flow-state.test.ts |
| edec4821982a0fa437f736a9bf25e39caa64213a | 81e191d8730eaad684b56d9e492e1c8a29c9a8248a0a77907d31835dca996c09 | test/编排/governance-gate.test.ts |
| 97d320f4d0ecdee5bcceab6f574a81543f589453 | c5c4a2651ad89e2ed514ffb279f27d93e46c408cb13bc16823fed57d1f201457 | test/编排/governance-judge.test.ts |
| 37c5398468a6cb6b57e416fc3e7fdd9d7319ea1d | b02436e4eef8b3724042fb19c5f330e63d164044b56c966f0aa277c37488da16 | test/编排/governance-session.test.ts |
| 813b46939417c93c52d02e982e5a5a219a06d884 | 0b0ec21366b587d038d5b1f3b8af8559943b24a489d5a2fdf5632cfa88d15b02 | test/门禁引擎/governance-standard-workflow.test.ts |
| daaa9f4f7e01a499b4929a5b3470688d28bb2f08 | 880e9442f2fc76c9ea64e56d8022fd68e26ce24c4db9f11be0bd8d0e14acb09e | test/门禁引擎/governance-trio.test.ts |
| 7721c99f7de3d15ff38a248b6f1d1f6f0f7ea353 | bdf24561cd87061b61cb7793f57044cf2c074989b5501d9076062156c43a38b8 | test/门禁引擎/liaison-role.test.ts |

### 7.3 任务节点与证据链接（N1–N11）

| 节点 | 状态 | 证据 |
| --- | --- | --- |
| N1 闸门 2/实施授权 | 已完成（统筹/沟通） | `docs/communication/2026-10-22_intent_governance-split-1-3-5.md` |
| N2 实施前标准 | 已完成（内置独立验收） | `docs/acceptance/governance-split-1-3-5-criteria-v1.md`（hash `85f50a7…`） |
| N3 基线回归 | 已完成（本角色阶段 A） | `2026-10-22_change_governance-split-1-3-5-baseline.md` + `…-baseline-evidence/` |
| N4 Model/Provider 契约 | 已完成（运行时核心） | `角色卡/运行时核心/docs/change/2026-10-22_change_governance-split-1-3-5-model-provider.md` |
| N5 门禁引擎 | 已完成 | `角色卡/门禁引擎/docs/change/2026-10-22_change_governance-split-1-3-5-roles.md` |
| N6 编排 | 已完成 | `角色卡/编排/docs/change/2026-10-22_change_governance-split-1-3-5-flow.md` |
| N7 桌面窗口 | 已完成 | `角色卡/桌面窗口/docs/change/2026-10-22_change_governance-split-1-3-5-desktop.md` |
| N8 桌面UI | 已完成 | `角色卡/桌面UI/docs/change/2026-10-22_change_governance-split-1-3-5-ui-copy.md` |
| N9 终验 | **本轮完成（测试证据）** | 本文件 + `phase-e-evidence/`（全量回归/套件/真实启动/演示/候选哈希） |
| N10 变更包与独立验收 | 待统筹/内置独立验收 | 本文件 §七 提供数据；`docs/scheduling/governance-split-1-3-5-change-v1.md` 由统筹写 |
| N11 放行 | 未开始 | — |

- **风险档位**：T3（治理/权限变更），全量回归已执行；档位依据见团队计划 §1.2 与验收标准 §3.4。
- **证据复用与失效**：阶段 A 基线日志只用于失败分类；阶段 B/C/D 的角色证据只作交叉核对；**最终候选变化后**，本报告的全量回归、套件与真实启动证据均为本轮重新执行（同候选、同命令）。任何候选文件再变化，本报告对应证据失效，需重跑受影响部分/全量。
- **未包含项**：`docs/` 管理记录、角色文档不作为产品候选；`app/renderer/dist/` 为构建产物（忽略，非候选）。

---

## 八、未做项与限制

- **未做独立验收判定**（阶段 F）；本文件只提供测试证据与结论建议，不写「通过」。
- 未做真实模型/网络/凭据验证（离线夹具与脚本适配器；真实启动的是 Electron 应用本体）。
- 真实 Electron 治理演示使用脚本化模型适配器（无真实凭据时产品自动验收派发不会启动）；交付/回交的真实模型行为仍由既有 e2e/真机流程覆盖，本演示只覆盖第 1/3 项的治理卡与推进链。
- 全量回归出现一次瞬时挂起（§5.4），重跑正常；列为残余观察项。
- 未运行 `npm install`；未改 `package.json`/lock；未提交/暂存/推送/合并/发布；未写 `docs/scheduling/`、`docs/acceptance/`；未新建 `test/桌面应用/` 文件。

---

## 九、边界声明

本阶段只修改：

- `test/测试/**`（real-entry 断言、四个 e2e 套件与夹具、`p-team-plan-guard.test.ts`、`phase-e-governance-demo.mjs`）；
- 自身文档 `角色卡/测试/docs/change/2026-10-22_change_governance-split-1-3-5-phase-e.md` 与证据目录 `…-phase-e-evidence/`。

未修改产品源码、其他角色测试目录、角色卡/边界、`docs/scheduling/`、`docs/acceptance/`、`package.json`/lock；未在 `test/桌面应用/` 新建文件；未暂存、提交、推送。唯一仓库内非候选副作用：既有 `test/桌面应用/e2e/main.mjs` 以仓库根为项目时，应用自动写入了 gitignore 覆盖的 `.ans/sessions/su/claude/ans/`（既有 e2e 行为，未改源码/文档/治理记录）。

---

## 十、证据文件索引（`角色卡/测试/docs/change/2026-10-22-governance-split-1-3-5-phase-e-evidence/`）

| 文件/目录 | 内容 |
| --- | --- |
| `full-test-node-run1.log` / `full-test-summary-run1.txt` | 全量 run1（3448/3421/9/18，exit 1，22,610 ms） |
| `full-test-node-run2.log` / `full-test-summary-run2.txt` | 全量 run2（同计数，exit 1，22,989 ms） |
| `typecheck.log` / `typecheck-renderer.log` / `build-renderer.log` | 三条检查（均 exit 0） |
| `suite-governance-e2e-auto.log` 等 4 份 | 四个跨角色套件原始输出（68/22/36/28 全过） |
| `test-domain.log` | `test/测试/**` 全域（752/745/1 fail/6 skip；唯一红为基线 EPERM） |
| `real-entry.log` | real-entry 16/16（含 F3 更新用例） |
| `electron-e2e/` | 真实 Electron 总自检 report.txt、stdout、17 张截图 |
| `governance-demo/` | 治理链 Electron 演示 report.txt（DEMO_PASS=true）、stdout、7 张截图、临时项目（含账本/产物） |
| `candidate/head.txt`、`status-short.txt`、`diff-name-only.txt`、`diff-stat.txt`、`diff-cached-name-only.txt`、`full.diff`、`candidate-paths.txt`、`hashes.tsv` | 候选身份与原始 diff/status/哈希 |

本记录：`角色卡/测试/docs/change/2026-10-22_change_governance-split-1-3-5-phase-e.md`
