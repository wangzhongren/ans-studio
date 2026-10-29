# 2026-10-29 — entry-role-minimal 客户真机缺陷：复核、补测、BUG-2 开关持久化与真机回归

- 日期：2026-10-29｜任务：客户真机测试问题处置（沟通紧急处置后的实施批次）｜风险档位：T2（跨编排/桌面窗口/桌面UI 三个属主写集，涉及 IPC 与渲染布局）
- 分支/worktree：`feat/entry-role-minimal` @ `.claude/worktrees/entry-role-minimal`｜基线 HEAD：`2499c01`（本批未 push、未合并 main）
- 性质：实施与验证记录（**不是验收结论**）。测试基线沿用 change-F 规范口径（排除基线挂起 `write-sequencing.test.ts`）。

## 1. 复核对象与结论

客户真机测试后在 `feat/entry-role-minimal` 上已有 4 个无配套测试的修复提交，本批逐一复核并补测：

| 提交 | 内容 | 复核结论 |
| --- | --- | --- |
| `928cd62` | Composer 两开关溢出页面：`.composer-bottom` 可换行、胶囊可收缩 + 省略号 | 结构正确；真正定稿在 `19331b2`（两行结构），本批以结构/CSS 钉 + 1360/200% 实测补证 |
| `e410e6b` | 两个 judge 开关移到独立一行（`.composer-trust-text`/`.composer-trust-actions`） | 中间态被 `19331b2` 取代；无残留引用 |
| `19331b2` | 输入区两行：`.composer-trust-line`（标题+说明）+ `.composer-controls`（附件 + `.composer-trust` 两胶囊 + 范围 + 键盘 + 动作） | 结构与切图一致；补结构化断言与窄屏实测 |
| `2499c01` | ① `suppressHandback` 改为 `builtInGovernance && (trioSpec === undefined \|\| trioSpec.id === "chief")`（trio worker 注入 `submit_report`）；② 幕僚卡「派发后立即结束本轮、禁止 sleep/轮询」；5 张 worker 卡「必须 submit_report」；③ `broadcastRoleStates()` + `session:role-states` 重放 | 逻辑正确；补注入矩阵、卡文本、重放行为测试；真机验证通过 |

复核中发现的遗留问题 **BUG-2**：`setShellJudgeEnabled` / `setDecisionJudgeEnabled` 状态在 `reloadInterface` 后被 `loadInterface()` 无条件 `reset()` 复位为关。客户要求持久化并在刷新后恢复——本批已修（§2）。

## 2. 代码改动（BUG-2 修复 + 收口）

写集：`app/desktop/preferences.ts`、`app/desktop/interface.ts`、`app/main.ts`、`test/桌面应用/e2e/main.mjs`（桌面窗口）；`test/桌面UI/phase5a-electron-smoke.mjs`（桌面UI）；无生产渲染代码改动。

1. **偏好文件扩展**（`app/desktop/preferences.ts`）：`preferences.json`（userData）新增可选 `judgeSwitches:{approval,decision}`。
   - 仅当至少一个为开时写入，全关省略字段——旧形状 `{version:1, locale}` 逐字保持（i18n 集成测试不动且全过）；
   - 读取归一化：缺失=全关；非法形状回退全关 + 稳定诊断 `preferences.judge.invalid / invalid-judge-switches`，locale 仍按有效值读取；
   - `setLocale` 与 `setJudgeSwitch` 共用串行写链（连点两开关不互相覆盖，后写带最新镜像值）。
2. **Interface**（`app/desktop/interface.ts`）：`setShellJudgeEnabled` / `setDecisionJudgeEnabled` 改为异步：状态机接受后经偏好服务持久化，再回 `{version:1, ok:true, enabled, available:true}`；写盘失败只记诊断，本次会话内开关仍生效（不假装重启后仍开）。`createShellJudgeSwitch(initialEnabled=false)` 支持启动种子。
3. **主进程**（`app/main.ts`）：`whenReady` 读盘后 `initialJudgeSwitches = preferencesRead.judgeSwitches`；建窗时按持久值创建两个共享状态机；`loadInterface()` **删除两处 `reset()`**（渲染重载保持当前值）；`shell:judge-set`/`decision:judge-set` handler 改为 await Interface。
4. **E2E 夹具同步**（`test/桌面应用/e2e/main.mjs`）：注册 `session:role-states` handler（与 `app/main.ts` 同形），消除渲染侧「无 handler」未捕获拒绝；judge-set 改 await。

## 3. 新增/更新测试（+11 tests）

| 文件 | 类型 | tests | 覆盖 |
| --- | --- | ---: | --- |
| `test/桌面UI/composer-layout.test.ts` | 新增（桌面UI） | 3 | 两行结构（trust-line/controls 及子元素归属）、控件一行 CSS 前提、胶囊/范围/提示省略与可收缩、无固定像素宽度 |
| `test/编排/trio-worker-report.test.ts` | 新增（编排） | 3 | submit_report 注入矩阵（5 worker 有 / chief 无 / su 无）、worker 报告端到端取报告值、幕僚卡与 5 张 worker 卡文本钉 |
| `test/桌面应用/interface.test.ts` | 新增（桌面窗口，Section 1 既有授权路径） | 5 | 偏好形状/合并/归一化/并发写；设置→写盘→重载保持→新启动恢复→available 语义；`requestRoleStates` 两角色忙态重放两条、结束后重放为闲；`session:role-states` 接线源码钉 |
| `test/桌面UI/phase5a-electron-smoke.mjs` | 更新 | 30→34 checks | Composer 两行结构、控件同一行（1360）、无横向溢出（1360 与 200%/960 物理） |

定向结果：`test/桌面UI` 311/311、`test/桌面应用` 335/335、`test/编排` 480 计（479 过 / 1 红＝既有 Windows symlink EPERM）、`test/门禁引擎` 254 计（253 过 / 1 skip）、`test/测试/i18n-integration.test.ts` 8/8。

## 4. 全量验证（串行，规范口径）

命令：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`（338 文件）

- **2919 tests / 2889 pass / 12 fail / 18 skip**，exit 1（基线红）。相对 change-F 基线 2908/2878/12/18 ⇒ **+11 tests / +11 pass、fail 0 增、skip 0 增**。
- 12 fail 全部为既有 Windows 环境性：9 × symlink EPERM（claude/codex/pi adapter、runtime-core file-write-safety/session-store、g4-skill-verify、编排 shell-authorized-routine）+ T1×3（pi/codex/claude 真实 Pipeline 中止链）。日志 `%TEMP%\ans-full-1029.log` sha256 `9cbd3c7fafb3f2e16892db0da2b8596fac4747ee251b41feeb7e06e52fc05657`。
- `npm run typecheck` exit 0；`npm run typecheck:renderer` exit 0；`npm run build:renderer` exit 0。
- phase5a 真实 Electron：**34/34 checks、failures=0、console/CSP 0**，5 张截图；report.json sha256 `7b08b227886e936bbf5a688334e8b52e6f3176d3da169eacf9b54b312b3b70d8`。
- 桌面 E2E（临时夹具 `%TEMP%\ans-e2e-g-fixture-1029` 仅 `角色卡/桌面窗口/`；fresh userData；`ANS_E2E_OUTDIR=%TEMP%\ans-e2e-g-out-1029b`）：**exit 0、`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`、18 PNG**；`ROLE_COUNT=2`、`PRIMARY_ROLE_ID=su`、`BOOTSTRAP_PRIMARY=chief`、`BOOTSTRAP_ROLE_COUNT=6`；`OP_CANCEL_DECLINED/OPX_EXPIRED_HISTORY/E_*`/`GOVERNANCE_DISABLED_*` 全 true；`report.txt` sha256 `1a5ac4961d6f9d8d8d807af5e504f28598caa01598159589970b0d1e500da8ce`。日志中 `session:role-states` 未注册错误 0（`background-tasks:list` 为既有噪声，与本批无关）。

## 5. 真机回归（客户场景，worktree 内 `npm run app -- --remote-debugging-port=9235`）

证据目录：`%TEMP%\ans-regress-1029\`（截图 01–07、timeline.txt、app.log、app-restart.log、tasks.after.jsonl、chief.tail.jsonl、convener.tail.jsonl、preferences.pre/on.json；旧 delivery-queue 备份 `delivery-queue.pre.json`）。

时间线（UTC）：

| 时刻 | 事实 |
| --- | --- |
| 01:47:25 | 重启应用（新代码）；导入 `trial-focus-timer`（trio；chief 主入口）；打开幕僚会话（Pi） |
| 01:47:32 | 经 UI 开启两开关（此前 both false）→ `preferences.json` 出现 `"judgeSwitches":{"approval":true,"decision":true}`（截图 02） |
| 01:47:33 | `reloadInterface()` → 两开关**仍为开**（截图 03）；存量缺陷（刷新复位）消失 |
| 01:47:33 | 发客户原文：「请让运营（convener）补交一份上一轮番茄钟任务的工作短报，并汇总结果给我」 |
| 01:47:38.976 | `tasks.jsonl` `task.created` `t-mvsvvmg0-2bccb6ae`：chief → convener |
| 01:47:39 | 侧栏运营「Pi工作中」（截图 04）；**工作途中 01:47:54 再次 `reloadInterface()` → 运营仍显示「Pi工作中」**（role-state 重放，截图 05） |
| 01:48:11.978 | 运营 `submit_report` tool.call → tool.result completed；01:48:16.095 `report.received`；01:48:16.119 `turn.end` |
| 01:48:16.076 | `tasks.jsonl` `task.reported`（from convener, status done） |
| 01:48:16.149 | 幕僚收到 `[工作结果]` 消息并自动开启新一轮 |
| 01:48:16–34 | 幕僚仅 `list_dir`×2 + `run_shell node --test`（独立复核，10s）；**`role_status` 0 次、sleep 0 次** |
| 01:48:34.438 | 幕僚汇总报告（"运营已交回工作短报…"）并 `turn.end`（不空转、不轮询） |
| 01:48:xx | 侧栏幕僚/运营均回「Pi空闲」（截图 06） |
| 01:51:38 | **完整重启应用**后两开关仍为开（截图 07）——新启动按持久值恢复 |

逐条对照客户 4 类问题：① 布局两行/胶囊、1360 与 200% 均无横向溢出（phase5a 34/34 + 真机截图）；② 运营收到任务并真实调用 `submit_report`，`task.reported` 落盘、幕僚收到 `[工作结果]`；③ 幕僚派发后结束回合，收到回报才开启新一轮，无 sleep/role_status 空转；④ 刷新后角色忙/闲状态重放正确、两开关保持开启，完整重启后仍恢复。

## 6. 改动文件清单（本地提交）

- 生产：`app/desktop/preferences.ts`、`app/desktop/interface.ts`、`app/main.ts`
- 测试：`test/桌面UI/composer-layout.test.ts`（新）、`test/桌面UI/phase5a-electron-smoke.mjs`、`test/编排/trio-worker-report.test.ts`（新）、`test/桌面应用/interface.test.ts`（新，Section 1 既有授权路径，F 批曾删除）、`test/桌面应用/e2e/main.mjs`
- 文档：本文件 + 三个属主 changelog

## 7. 遗留问题

1. **基线 12 红**（9 Windows symlink EPERM + T1×3）为环境性既有问题，本批未处理（与 change-F 相同）。
2. `test/桌面应用/e2e/main.mjs` 仍会输出既有 `background-tasks:list` 未注册噪声（与本批无关，未修）。
3. 真机回归中渲染侧引擎初始回落到 Claude（UI 默认），需手动切到 Pi 后开会话；`persistProjectRuntime` 会把 UI 当前引擎写回 per-project 选择。这是既有交互（非本批引入），已如实登记，建议由桌面窗口属主另行评估「按项目已持久化引擎初始化 UI 选择」。
4. 真机回归前为隔离旧测试消息，备份并清空了 `<userData>/ans/delivery-queue.json`（原文件见证据目录 `delivery-queue.pre.json`）。
