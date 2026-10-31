# shell-escalation 实施：B0 基线与逐角色预留/派发记录 v1

- 任务 ID / flowId：`2026-10-31-shell-deny-customer-escalation` / `shell-deny-customer-escalation`
- 记录角色：ANS 统筹调度（Scheduler，独立上下文）
- 日期：2026-10-31
- 性质：统筹的任务记录（非 task_ops 机器状态；本项目无 `.ans/project.json`，未启用 task_ops）
- 依据：客户确认方案 v1.3（857 行 / `6bd12a99…`）、闸门 2 确认团队计划（575 行 / `4d52bdf4…`）、实施授权记录（`docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`「实施授权记录」）、实施前验收标准 V1（1320 行 / `0b724fa2…`）
- 当前状态：**E2b 通过（35/35，报告 v2：174 行 / `e3efa36363895b2a81839ad86e94971d73bd654e7aa21f2df31363695ccc29e2`）**；R1/R2/R3/AC-19 均已闭合；E1 已按 E3 重冻（188 行 / `6b8706ff…`）；待沟通按客户授权执行最终提交与推送；**不发行**；实施/验收期间不 commit/push（见 §5.3）

## 一、派发前置核验（2026-10-31，盘上实测）

| 项 | 状态 | 实测 |
| --- | --- | --- |
| 闸门 2 | 已确认 | 沟通记录「闸门 2 记录（2026-10-31）」：客户原话「确认闸门 2：参与角色、写集与 3 项边界变更」；对象团队计划 575 行 / `4d52bdf4…` |
| 实施授权 | 已给 | 同文件「实施授权记录（2026-10-31）」：客户原话「授权开始实施」；提交/推送/合并/发布不在授权内 |
| H1 边界条目 | 已落地并核验 | 7 个治理文件 / 17 行新增：门禁引擎 `boundary.md` 补 `src/service/gate/shell-rules.ts`；编排 `boundary.md` 补 `src/pipeline/orchestration/shell-arming.ts`；桌面窗口 `boundary.md`+`boundary.yaml` 新增 `test/桌面应用/shell-escalation.test.ts` 精确条目；三个根 changelog 已记 |
| V1 验收标准 | 已写盘并经沟通确认 | `docs/acceptance/shell-escalation-criteria-v1.md` 1320 行 / SHA-256 `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b`（AC-01–AC-35 覆盖 P1–P12/G1–G5） |
| 实施前工作树 | 无产品代码/测试改动 | `git status --short -- src app test` 为空；`git diff --cached --name-only` 为空；既有变更仅 7 个 H1 治理文件、两份 memo、5 份未跟踪管理文档 + B0 证据 |
| task_ops | 未启用 | 无 `.ans/project.json`；证据以文件哈希与原始输出为准 |

## 二、B0 基线（测试角色，独立上下文；节点 B0）

- 证据记录：`角色卡/测试/docs/change/2026-10-31_change_shell-escalation-B0.md`（194 行，SHA-256 `0032e375ade1fcb48d3fc9e1b57f84008edf56bca26ffde820aceb3e9040bb2d`）
- 原始日志目录（仓库外）：`C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\b0\`（含 manifest 与各命令日志；全量 `full-suite.log` 4285 行 / `7cd10bb0…`）
- 环境：HEAD `9f670fb2c7d403baf995071055d697c50714c905`；Node v24.22.1 / npm 11.19.1 / win32 x64；`npm ci --no-audit --no-fund` exit 0（526 packages，31s；日志 `f45de6aa…`）。npm allowScripts 阻止 4 个依赖 install script；**electron 二进制缺失**（见 §五）。
- `npm run typecheck`：exit 0；`npm run typecheck:renderer`：exit 0；`npm run build:renderer`：exit 0（vite v8.3.4，2793 modules，`dist/` 为忽略产物）。
- 受影响层基线：门禁引擎 277/276/0/1；编排 563/562/**1**/0（`shell-authorized-routine.test.ts:103` EPERM symlink）；运行时核心 272/265/**3**/4（`file-write-safety.test.ts:97`、`session-store.test.ts:46/58` EPERM）；项目管理/shared 154/149/0/5；桌面UI 337/337/0/0；桌面应用/operator-channel 56/56/0/0。
- **T3 全量基线**（排除历史 `test/pi-adapter/write-sequencing.test.ts`，理由按团队计划 §6.3/V1 AC-27）：**tests 3193 / pass 3166 / fail 9 / skipped 18 / todo 0**，exit 1，264049 ms。9 个 fail 全部为既有 Windows symlink EPERM；其它确定性失败 0；新增 skip/todo 0。与团队计划 §1.2 参考基线完全一致。
- 结论：B0 建立成功；D1 的全量失败分类以本基线为准。

## 三、逐角色预留（写集 / 冲突 / 热点单写者）

> 预留按具体 roleId 与精确路径；同一文件同一时间只有一个写入者。所有 worker 的通用禁止：写 `docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界/其他角色资料；commit/push；启动应用做「已验收」声明（D2 除外，仍不判验收）；弱化断言/新增 skip。

| 节点 | roleId / 角色 | 预留写集（本节点） | 独占/热点 | 冲突结论 | 状态 |
| --- | --- | --- | --- | --- | --- |
| B0 | 测试 | `角色卡/测试/docs/change/` 证据记录 | 自身 docs | 无 | **已完成** |
| A1 | 运行时核心 | `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/`（按需）、自身 docs | **`src/model/runtime.ts` 契约单一写者**（B1/C1 只读消费）；tools/schema 独占 | 与 A2/A3 写集不相交 | **派发中** |
| A2 | 门禁引擎 | `src/common/门禁引擎/classify-shell.ts`、`shell-write-guard.ts`、`governance-roles.ts`、`src/service/gate/shell-rules.ts`、`test/门禁引擎/classify-shell.test.ts`、`shell-write-guard.test.ts`、新增 `shell-routine.test.ts`、`shell-rules-public-reexport.test.ts`、自身 docs | **`shell-rules.ts` 公开出口单一写者**（B1 仅经此导入）；谓词唯一实现 | 与 A1/A3 不相交；H1 已完成 | **派发中** |
| A3 | 项目管理 | `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`、`test/项目管理/shared/i18n.test.ts`、自身 docs | **i18n 消息目录单一写者**（C1/C2 只读消费）；计数 1501 基线 | 与 A1/A2 不相交 | **派发中** |
| B1 | 编排 | `src/common/编排/shell-escalation.ts`（新增）、`shell-gate.ts`、`shell-audit.ts`、`shell-judge-verdict.ts`、`routine-shell-policy.ts`、`src/pipeline/orchestration/shell-arming.ts`、`run-role.ts`、`govern-session.ts`、`test/编排/` 相关（新增 `shell-escalation.test.ts` + 受影响套件）、自身 docs | **`shell-gate.ts`/`shell-arming.ts`/`run-role.ts` 单一写者**；消费 A1 契约 + A2 谓词（冻结后） | 等 A1+A2 完成；不得与 C1 并发写 `src/pipeline/` | 排队 |
| C1 | 桌面窗口 | `app/desktop/shell-escalation.ts`（新增）、`confirm-card.ts`、`recovery-channel.ts`（条件）、`session.ts`、`interface.ts`、`operator-channel.ts`、`app/main.ts`、`app/preload.cjs`、`test/桌面应用/operator-channel.test.ts`、`test/桌面应用/shell-escalation.test.ts`（新增，H1 已授权）、条件 `test/桌面应用/e2e/main.mjs`、自身 docs | **`app/desktop/**`、`app/main.ts`、`app/preload.cjs` 单一写者**；`test/桌面应用/` 只写上述两个精确文件 | 等 A1+B1+A3；不得新建 `test/桌面应用/e2e/` 脚本 | 排队 |
| C2 | 桌面UI | `app/renderer/src/shell/ConfirmCard.tsx`、`stores/confirm-store.ts`、`chat/ipc.ts`、`lib/platform.ts`、`chat/judge.ts`、`chat/judge-row-view.ts`、`shell/shell.css`、`test/桌面UI/` 相关（可新增视图测试）、自身 docs | **`app/renderer/**` 单一写者**；`test/桌面UI/` 独占 | 等 C1 IPC/preload 冻结 + A3；不得写 `app/desktop/` | 排队 |
| D1 | 测试 | `test/测试/`（新增跨层集成 + 受影响套件）、自身 docs | `test/测试/` 独占 | 等 A1/A2/A3/B1/C1/C2 | 排队 |
| D2 | 测试 + 桌面窗口（e2e 夹具）+ 桌面UI（截图） | 条件 `test/桌面应用/e2e/main.mjs`（已授权）、`test/桌面UI/` 冒烟（目录授权）、`test/测试/` 复跑 | 同 C1/C2 热点但按节点串行 | 等 D1 入口条件；electron 缺口需先补 | 排队 |
| E1 | 统筹 | `docs/scheduling/` | 自身写区 | 等 D1+D2 | 排队 |
| E2 | 内置独立验收 | `docs/acceptance/` | 自身写区 | 等 E1 | 排队 |
| E3 | 统筹 → 沟通 | `docs/scheduling/`、`docs/communication/`（沟通） | — | 等 E2 | 排队 |

### 3.1 冲突与热点结论

- A1/A2/A3 三节点写集**完全不相交**，可并行；无共享文件。
- 唯一跨节点热点由**单一写者 + 冻结顺序**处理：`src/model/runtime.ts`（A1）→ 被 B1/C1 消费；`src/service/gate/shell-rules.ts`（A2）→ 被 B1 消费；i18n 消息（A3）→ 被 C1/C2 消费；`src/pipeline/orchestration/{shell-arming,run-role}.ts`（B1）→ 被 C1 消费；`app/desktop/**`/`main.ts`/`preload.cjs`（C1）→ 被 C2 消费。
- 当前工作树无产品代码改动、无其它活动写者；7 个治理文件与 memo 为既有状态（非候选），任何 worker 不得触碰。
- 逐节点启动前再执行一次 `git status --short -- <写集>` 与哈希核对；发现写集外改动立即停止并回报统筹。

## 四、派发顺序与门

- 已完成：G2（闸门 2）→ H1（边界）→ V1（标准）→ B0（基线）。
- 进行中：**A1 / A2 / A3 并行**（契约先行；完成后各自 `冻结声明`）。
- 后续：B1（A1+A2 冻结）→ C1（A1+B1+A3 冻结；H1 已含新测试条目）→ C2（C1 IPC 冻结 + A3）→ D1（全部实现节点）→ D2（真实 Electron E2E/截图；先补 electron）→ E1（变更包）→ E2（独立验收）→ E3（放行/回报）。
- 每节点入口核对：前置节点退出条件、写集预留、基线哈希一致、无并发写；缺一不启动。

## 五、环境缺口与应对

1. **electron 二进制缺失**：`electron@44.7.0` 包存在但 `dist/`/`path.txt` 缺失（npm allowScripts 策略）。D2 入口前由桌面窗口/装配按发布环境要求补装（`node node_modules/electron/install.js` 或等价的批准安装方式），并记录版本/哈希；未补齐前 D2 不启动，D1 单测不受影响。
2. **allowScripts 4 个依赖**：`@google/genai`（no-op）、`electron-winstaller`（7z arch）、`esbuild`（postinstall；平台包已存在，build 已通过）、`protobufjs`（postinstall）。当前 typecheck/build 与全量单测不受影响；D2/打包若需要，由装配确认并记录。
3. **无 task_ops**：不伪造机器状态；以本记录、B0 证据、各角色完成报告与原始日志为记录链。

### 5.1 A1/A2/A3 完成与冻结（2026-10-31）

| 节点 | 完成报告（路径 / 行数 / SHA-256） | 关键结果 | 冻结声明 |
| --- | --- | --- | --- |
| A1 运行时核心 | `角色卡/运行时核心/docs/change/2026-10-31_change_shell-escalation-A1.md` / 104 行 / `36d2cd12…` | 模型加法契约 + 新工具（注入且 shell arm 才注册）+ schema；runtime-core 281/274/3/4（3 fail 与 B0 相同，+9 tests 全过）；typecheck 0 | 升级六类型 + `entry`/`manualAsDeny`/`grant`/`shellEscalation` 加法冻结；B1/C1 只读消费 |
| A2 门禁引擎 | `角色卡/门禁引擎/docs/change/2026-10-31_change_shell-escalation-A2.md` / 129 行 / `cd5e16a8…` | 唯一谓词 `matchRoutineShellCommand` + 分类器/写守卫同源 + `shell-rules.ts` 同引用再导出 + 审批卡文案；门禁引擎 288/287/0/1；typecheck 0 | 命中 id 冻结：`npm-test`/`npm-run-test`/`npm-run-typecheck`/`npm-run-lint`/`npm-run-check`/`node-test`/`tsc-noemit`/`npm-ci`；委托策略只认原三 id（`npm-test`/`npm-run-typecheck`/`node-test`） |
| A3 项目管理 | `角色卡/项目管理/docs/change/2026-10-31_change_shell-escalation-A3.md` / 142 行 / `2385b14e…` | 25 新 key + 2 改写；计数 `ui 902 / main 559 / shared 62 / preferences 3 = 1526`；shared 155/150/0/5；typecheck 0 | 27 个 key 名称与中英文案冻结；C1/C2 只读消费 |

- 三节点写集不相交；工作树产品/测试 diff 仅上述三节点文件（13 modified + 2 new）。
- **readonly 例行白名单语义：客户已裁定 A（2026-10-31，沟通留档原文「A」）**——只读档不适用例行白名单：`node --test` 等在 `readonlyOnly` 下仍按 `readonly-deny` 拒绝；`test/编排/shell-readonly.test.ts` 2 项既有断言原样保留、不得放宽；实现需在只读档对例行白名单命中加过滤（不得放行、不注入 `takeGrant`、只读档其余行为与文案不变）。澄清记录：`docs/planning/2026-10-31_clarification_shell-escalation-readonly.md`（124 行 / SHA-256 `6c568ee626b8e4fa6487562364e23927c2812f64ae8c8753cc7ad9bfb2588dd4`；不重开闸门 1；方案 v1.3 正文与确认哈希 `6bd12a99…` 不变）。
- **过滤归属（调度判定）**：归 **B1 增量**，在 `src/common/编排/shell-gate.ts` 只读分支实现——当 `detail.decision === "allow"` 且 `detail.ruleId` 以 `allow:routine:` 开头时返回既有 `BRANCH_READONLY_DENY`（reason 含 `review` 以保持既有断言；`by`/文案结构不变）；**不修改 A2 冻结的谓词/分类器、不复制第二份判定**，不改 `boundary`/写集。`test/编排/shell-readonly.test.ts` 既有 2 项断言不改，另增只读档过滤的聚焦测试；D1/E2 的只读档相关 AC 按 A 判。
- **其它跨节点事项**：A3 发现 `test/测试/shell-judge-verify/b-deny-flow.test.ts:62` 仍断言旧 `judgeWayOut` 全句（1 fail），由测试角色 D1 按 §4.6/AC-19 更新；`app/desktop/operator-channel.ts` 的 `manualDenyAdvice()` 尚无 retry-capped 分支，C1 消费 `main.operator.manualDenyAdvice.retryCapped`。

### 5.2 B1（含 readonly 增量）与 C1 完成与冻结（2026-10-31）

| 节点 | 完成报告（路径 / 行数 / SHA-256） | 关键结果 | 冻结/消费面 |
| --- | --- | --- | --- |
| B1 编排核心（含 readonly 裁定 A 增量） | `角色卡/编排/docs/change/2026-10-31_change_shell-escalation-B1.md` / 172 行 / `68334d5e72a51b197a66960c31a7e0a4d418f6a512dfaa5af42246f6e141779f` | 新增 registry（台账/资格/状态机/授权/时效/限流/审计/回滚开关）+ 闸注入与五路径授权顺序 + 审计加法 + 回执句 + routine policy 复用 + arming/run-role/govern-session；**readonly 过滤**：只读档 `allow:routine:*` ⇒ 既有 `BRANCH_READONLY_DENY`（ruleId 缺失时用同一冻结谓词兜底，单一实现）；编排测试 **637/636/1/0**（唯一失败为既有 `shell-authorized-routine.test.ts:184` EPERM；readonly 2 项原样通过）；typecheck 0 | `openRoleSession.shellEscalationPresenter?`、`AdapterCapabilities.shellEscalation?`、`onReviewed`/`takeGrant`/`onAuditSinkCreated` 语义、审计分支形状冻结（C1 消费）；`ANS_SHELL_ESCALATION_DISABLED` 关闭时不建 registry/不注入能力 |
| C1 桌面窗口 | `角色卡/桌面窗口/docs/change/2026-10-31_change_shell-escalation-C1.md` / 141 行 / `e970346c303929584a29272b7b10a01f2a16c46afdadde6cf55eb0d6d7212f0f` | 新增升级卡 presenter/仲裁/暂停 IPC/preload/session；`operator-channel` 接 retry-capped 新 key；recovery-channel 未改（共享核心只做加法，恢复卡回归证据）；`operator-channel + shell-escalation` **78/78**，`test/桌面应用/*` **443/443**，typecheck 0；新增测试 21 项 | IPC/preload 形状冻结（C2 消费）：`shell:confirm-request`（审批 `kind:"approval"`；升级 `kind:"escalation"` + 字段/`actions`）、`shell:confirm-response`（`{id,allow}` 或 `{kind:"escalation",id,action}`；过期/重复/非法 → `{ok:false,expired:true}`）、`shell:judge-pause`、`shell:judge-state/get.paused`、preload `shellEscalationRespond`/`setShellJudgePaused` |
| C2 桌面UI | `角色卡/桌面UI/docs/change/2026-10-31_change_shell-escalation-C2.md` / 130 行 / `d0a88a44416b5da3dc54c9165e48e93b77e4034d021e2acba67811cc7435bb53` | 升级卡 UI（命令原文/argv/cwd/judge 理由/必要性标注/客户手批声明/三按钮/页脚暂停）+ 判拒行暂停控件 + 旧桥降级；`test/桌面UI/**` **350/350**；typecheck:renderer/typecheck/build 0；phase5a 真实构建冒烟 **47/47 checks / 0 failures / 7 截图**（新桥三动作由单测桩件覆盖） | 渲染消费面按 C1 IPC/preload 与 A3 key 冻结；不新增 key；真实应用验收归 D2 |
| D1 测试 | `角色卡/测试/docs/change/2026-10-31_change_shell-escalation-D1.md` / 115 行 / `324cfd334afb91d4935b889db4d37697fbdfa27a583a174d81a7e4238cb4f6ec` | 新增 `test/测试/shell-escalation-integration.test.ts`（1092 行，14 项跨层集成 14/14）；更新 `shell-judge-verify/b-deny-flow`、`c-manual-flow` 两处旧文案断言（逐条理由）；**T3 全量 3337/3310/9/18**（9 fail 与 B0 逐名相同，全部既有 Windows symlink EPERM；新增确定性失败 0、新增 skip/todo 0）；双 typecheck + build 0 | 跨层集成与全量回归证据；其他角色测试无合法受影响失败 |
| D2 桌面窗口（真实 E2E） | `角色卡/桌面窗口/docs/change/2026-10-31_change_shell-escalation-D2.md` / 152 行 / `094d720b2028a944e36182b5b653959d8ad2ae7ca72f3f5086eee15ce16958b6` | 仅扩展 `test/桌面应用/e2e/main.mjs`；真实 Electron（Electron 44.7.0）`E2E_PASS=true`、`E2E_FAILURES=` 空、新增 **70/70** 检查；9 张截图（关闭 DEBUG、1360×860、逐图 sha256）；审计 JSONL 6 行覆盖 c-allow/judge 放行/客户手批/judge 判拒/escalation-decision/customerGrant；暂停窗口重开保留、第二进程重启清零、偏好未写；白名单 9 形态 0 judge；只读档 A 五类 routine→readonly-deny；无产品代码改动 | 真实应用证据；限制（报告 §六）：未启真实模型/网络（整链由 B1/D1 覆盖）、多引擎只走 pi 视图、harness 自建窗口非 `app/main.ts` 整机、审批卡等待由 C1 单测覆盖、治理组为状态/UI+源码事实 |

- 环境补充：Electron 二进制已于 2026-10-31 安装（`node node_modules/electron/install.js` exit 0；`node_modules/electron/dist/electron.exe` 与 `path.txt` 存在；日志 0 行 / `e3b0c442…`，electron 包版本 `44.7.0`）。D2 真实 E2E 不再被二进制缺失阻塞。
- 证据目录：`C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\{B1,C1}\`（各含日志/哈希清单）。
- 写集外改动：B1/C1 报告均声明无；`test/编排/shell-readonly.test.ts` 未改（blob `243f2d4f…` / `5f0ec201…`）。

### 5.3 客户补充授权：验收通过后由沟通提交推送、不发行（2026-10-31）

- **客户原话**：「搞好之后提交到github，暂时不发行」。
- **口径**：
  1. **实施/验收期间仍不 commit/push**（团队计划口径不变；证据持续以工作树文件与哈希为准）。
  2. 全部阶段完成且 E2 独立验收**通过**后：由**沟通**执行最终提交与推送（当前工作树分支 `feat/flow-improvements-wave1`，含全部代码/测试/治理文档；如有 PR/合并流程按仓库惯例走）；**实施角色与统筹不自行提交**。
  3. **不发行**：不打 tag、不升版本号、不构建/上传发布包、不写发布说明；方案 §13/团队计划 §八 的「新小版本发布」仍属另行授权。
  4. 统筹在 E2 报告后向沟通提交：**候选清单**（改动文件全集与哈希）、**验收结论**、**建议的提交拆分**（如单提交或多提交）；沟通据此执行提交并回填记录。

### 5.4 E2 首判返工（2026-10-31）与修复归属

- 验收报告：`docs/acceptance/shell-escalation-report-v1.md`（193 行 / SHA-256 `464bec6a6cf2705495e812e5622e0521aa370b2e352e9404cb605370d5405a25`）；总体 **返工**（31 pass / 3 fail / 1 insufficient evidence）。
- **R1（AC-04）升级卡缺脚本上下文摘要**：owner **A3（新增 `ui.confirm.escalation.context*` i18n key，5 个中英成对）+ C2（渲染 approvalContext：路径/sha256/有界内容/note/npmScript）+ D2（E2E `seRequest()` 带 approvalContext、真实截图/检查）**。A3 的必要性说明：渲染层不得硬编码中文，新增 key 属项目管理写集；不引入新权限，沿用既有脚本上下文展示边界。
- **R2（AC-09）审批卡待答时升级申请被误判 expired 并消耗**：owner **A1（`ShellEscalationDecision` 加法第三支 `{action:"pending"}`）→ B1（registry 识别 pending：不消耗每命令申请权/会话额度，保持 `recorded`，回执如实「当前有 pending shell 确认卡，请稍后再申请」；不写终态审计）+ C1（presenter 在 `!canPresent()` 时返回 pending）+ D1/D2（跨卡待答集成/E2E 含「稍后申请成功」路径）**；B1 报告同步修正计数口径表述。
- **R3（AC-35）A2/B1 报告缺状态行**：owner **A2/B1** 在各自完成报告补 `implemented-unverified`；不改实现；之后由统筹重冻 E1。
- **E1 补证（AC-19）**：owner **C2（test/桌面UI 新增 retryHint 新措辞断言）+ D2（真实 Electron 判拒行详情展开截图/检查）+ D1（跨层/回执断言复核）**；文案本身不改。
- **E1 候选重冻**：全部修复后，统筹重新生成 80+ 文件清单（含沟通记录 93 行 / `32338c84…`、A2/B1/C2/D2/E1 报告更新、新增/修改文件），更新 `docs/scheduling/shell-escalation-change-v1.md`，并把各类报告哈希回填；随后交沟通启动 E2b 复判。
- **验收报告 §八 的其它观察**（真实模型回执、超时缩短方式、harness 整机边界）按报告口径记录，不构成返工；E2b 不据此改判。
- **返工进度（2026-10-31，全部完成）**：
  - R3：A2 报告已补 `implemented-unverified`（130 行 / `d56b8e06…`）；B1 已补（203 行 / `1ea61951…`）。
  - R2：A1 契约加法完成（`runtime.ts` blob `5b39807b…` / sha `5602c36f…`；报告 120 行 / `8d32377d…`）；B1 完成（pending 回滚/不消耗/可重试；`shell-escalation.ts` `c86d91c1…`/`0ba2df5b…`；编排 639/638/1）；C1 完成（presenter pending；`app/desktop/shell-escalation.ts` `0ced2ad8…`/`d0d0fa12…`；79/79、444/444）；D1b 集成 16/16（pending→allow-once、无审计、额度/申请权不消耗）；D2b 真实 E2E pending→allow-once 成功。
  - R1：A3 新 key 完成（5 个 `ui.confirm.escalation.context*`；计数 907/559/62/3=1531；报告 198 行 / `ef5d08e3…`）；C2 完成（`judge.ts` `705b6b3b…`/`52d0556e…`、`ConfirmCard.tsx` `d3301f5c…`/`e4d28400…`；桌面UI 352/352、phase5a 48/48）；D2b 真实 E2E 脚本上下文区块截图/检查通过。
  - AC-19：C2 已加新措辞断言（`judge.test.ts:68`、`judge-row-view.test.ts:141`）；D1b 跨层断言（集成 L）；D2b 判拒行详情真实截图 `40-judge-retry-hint.png` 与检查通过。
  - D1b 全量复跑：**3345/3318/9/18**（9 fail 与 B0 逐名相同；新增确定性失败 0、新增 skip 0）；双 typecheck + build 0；报告 176 行 / `3235feda…`。
  - D2b：`E2E_PASS=true`、`E2E_FAILURES=` 空、**90/90** counted 检查、29 张截图（新增 39/40/41）、pending 场景无审计且稍后 allow-once 成功；报告 218 行 / `2b31c239…`；e2e/main.mjs `8cf1c00c…`/`8c88c911…`。
  - **E1 重冻**：`docs/scheduling/shell-escalation-change-v1.md` 已按最终候选更新（候选清单、节点报告哈希、验证摘要、返工闭合说明）；重冻后哈希由统筹回报沟通。

---

## 六、状态与下一步

- **已完成**：B0、A1、A2、A3、B1（含 readonly 裁定 A 增量）、C1、C2、D1、D2、E1、E2（首判返工→E2b 通过 35/35）、E3（提交前重冻与核对）。
- **E1 最终版**：`docs/scheduling/shell-escalation-change-v1.md`（188 行 / `6b8706ff…`；82 项表 + E1 自身 = 83 文件候选；提交拆分建议）。
- **E2b 报告**：`docs/acceptance/shell-escalation-report-v2.md`（174 行 / `e3efa363…`；AC-01–AC-35 全 pass；仅对 v2 82 文件候选成立，产品/测试 52 文件在 E3 未变）。
- **提交前核对**：HEAD `9f670fb`；83 文件（56 M + 27 ??）；staged 空；无改名/删除；发布/构建面零 diff；`release-policy.mjs` 保持 `v1.8.3`。
- **下一步**：由**沟通**按客户授权执行最终提交与推送（推荐 2 提交：52 产品/测试 + 31 治理/记录；备选单提交）；**不发行**（不打 tag/不升版本/不构建上传/不写发布说明）。实施角色与统筹不自行 commit/push。
- 本记录不改变已确认的团队计划/方案/标准；任何范围或写集变化停止并回报沟通/客户，重开对应闸门。
