# v2.0.0 发布阻断第二批分析：疑似新引入 35 名的查证归类（2026-11-12）

- 角色：ANS「测试」（roleId: 测试）；本文件只做只读分析，**未修改任何测试/产品代码，未 commit，未触发 CI，未 push**。
- 工作树：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；分支 `release-v2.0.0-pointer`；HEAD `3edf2e5`（`git diff 7cb9eea 3edf2e5` 仅 `.github/workflows/release.yml` +1 行，`test/`、`src/`、`app/` 与 CI 运行提交 `7cb9eea` 一致）。
- 输入：分流报告 `角色卡/测试/docs/change/2026-11-12_release-blocker-triage.md`（sha256 `98edcb1445ef39e6eed45cbf1aeb1daefddecd6e43a8e2d9ff7f623045992f36`）；CI run `43138943189` / job `130920941222`（macOS arm64，`cancelled`）；Windows 对照为 B8.2 证据（2026-11-11）。
- 范围：只分析分流报告 G3「疑似新引入 35 名」= `chain-enforcement.test.ts` 6 + `chief-workflow.test.ts` 19 父 + 9 子 + `boundary-refresh.test.ts` 1；不含 P0 的 120 名、冻结 known-red 31 名、挂起文件。

---

## 〇、结论摘要（先读）

1. **「疑似新引入」标签不成立。** 35 名中 34 名在 B8.2 **before** 失败名单中；唯一例外 `W14` 是 B8.2 after-only、文档已归 Windows `ENOTEMPTY` 环境竞态。E3 / E3-F / D1 证据已把 `chief-workflow` 的清理/时序失败族登记为**既存非确定性族**（ENOTEMPTY/AggregateError/`waitFor`/慢机超时），`chain-enforcement` 6 与 `boundary-refresh` G-4 则是更早已存在的确定性测试假设失败（B8.1 after 已有同名）。没有证据表明它们由 v2.0.0 新增改动引入；它们是**未冻结的既有红/波动**，不是新回归。
2. **P0 同根因判定：12 名**（`W5` 子 4 + `W10` 子 2 + `W14`/`W22`/`W23`/`W28`×2/`W47 revise`）在 macOS 上的直接失败点就是 P0（`openSession`/`manager.open` 因 `runtime-protection-scope-unknown` 失败，或 scope `unknown` ≠ `unmanaged`），**P0 修复后预期转绿，不列第二批**。
3. **P0 掩盖 16 名**：P0 是 macOS 当前直接失败点，但 Windows 同代码另有失败面，P0 后仍需处理：
   - **1 名确定性**：`W19` —— 产品 `closeCreatedTask` 按设计不发通知（`src/pipeline/orchestration/trunk-runtime.ts:818-823`），测试却断言必须有通知（`chief-workflow.test.ts:1424`）。
   - **15 名**：底层属 E3/E3-F/D1 已登记的**非确定性清理/时序族**（`W5` 父/`selected`/`commit-race`、`W10` 父/`required`、`W29`×4、`W30`×2、`W33`/`W34`/`W35`、`W36`），必须 P0 后在 macOS 逐名隔离复跑才能判定，当前不列确定性代码修复。
4. **与 P0 无关的确定性测试假设 7 名**：`chain-enforcement` 6（legacy 直接派发被新产品 source 门 `document-planning-source-unavailable` 拒绝；MAC 与 Windows 同因）+ `boundary-refresh` G-4（源码文本钉 `this.applySkillChange("installed"` 已被实现改为变量 `action`，断言过时）。
5. **macOS 特有（非 P0）0 名；未知 0 名。**
6. **第二批建议**：先做 3 个确定性项（B2-1 boundary 文本钉、B2-2 chain-enforcement 语义裁决、B2-3 W19 通知契约），再做 P0 后 15 名定向复跑门（B2-4）；不建议在复跑前对 15 名展开产品代码修改。若 owner 选择不修，则按「桌面 known-red 冻结」处理（B2-6）。

计数：`35 = 12（P0 同根因，预期转绿）+ 16（P0 掩盖：1 确定性 + 15 非确定/待复跑）+ 7（与 P0 无关的确定性测试假设）`。

---

## 一、数据来源与提取方法

| 项 | 值 / 命令 |
| --- | --- |
| CI 日志 | `gh run view 43138943189 --repo wangzhongren/ans-studio --job 130920941222 --log`；落盘 561,891 bytes / 3,359 行；sha256 `9d3bfff4cf007f2393e39eccf2760668d4de53807312f396e9d6f787924a417d`（临时目录，不入库） |
| 运行提交 | `7cb9eea7519238973455f8c5a7bd4010f29d19f8`（`main`，`ci(release): point pipeline at v2.0.0`） |
| 测试命令 | `working-directory: .release/source` + `node --test --test-concurrency=1 "test/**/*.test.ts"` |
| 失败提取 | 对 `✖` 行定位 35 名；对 `W52 ... primary failure ...`、`✖ failing tests:`、`test at ...` 提取 `Error/actual/expected/堆栈`；`node --test` spec reporter 的主文件 `failing tests:` 因挂起取消从未输出，故非 W52 子进程的失败**没有内联断言体** |
| Windows 对照 | `角色卡/桌面窗口/docs/change/2026-11-11_B8.2_two-fixed-workflow-paths-desktop_evidence/06-after-desktop.tap`（sha256 `100abbb09c69e4b86871600c74bad66717e0003e73635e9a9117fd397948feb4`，Node TAP 带 YAML `error/expected/actual/stack`）与 `10-after-fail-names.txt`（sha256 `8657f62493abf0dec4cf434d8b9711df7e257edfced941eb568e174c8a8396c9`） |
| 更早证据 | B8.2 `09-before-fail-names.txt`、B8.1 `10-after-fail-names.txt`、`角色卡/测试/docs/change/2026-11-08_E3-T3-full-regression.md`、`2026-11-09_E3-F_judge-delegated-effectiveness.md`、`2026-11-08_D1_remove-predictive-gates.md` |
| 源码定位 | `app/desktop/session.ts`（9628/9656 `document-planning-source-unavailable`；4157-4158 `applySkillChange/applyMcpChange`；3977 `createDirectRoleRuntime`）、`src/pipeline/orchestration/trunk-runtime.ts`（233-238 `git-file-final-guard-unproven`；818-823 `closeCreatedTask`）、`src/service/runtime/session.ts`（1012-1016 `fileWriteProtection`；1262/1283/1294 `runtime-protection-scope-unknown`）、`src/provider/trunk/impl/git-command.ts:925`（`noncanonical-project-root`） |
| 未做的事 | 未跑全量/单文件测试；未改代码/测试；未 commit/push/触发 CI |

---

## 二、逐名证据表

### 2.1 `test/桌面应用/chain-enforcement.test.ts`（6 名）

这 6 名在 macOS CI 日志中**没有断言体**（仅 `✖ 名称 (耗时)`，行 2729-2736）；Windows B8.2 TAP 给出确定性错误。两者耗时高度一致（例：M1/M2 macOS 47.9ms vs Windows 48.1ms；D3 116.2/99.4ms vs 116.6/110.6ms），代码路径不含真实 Core 准入（harness 在 `chain-enforcement.test.ts:227` 直接构造 `SessionManager` 并桩掉 `openRoleSession`），故 macOS 与 Windows 同因、非 P0。

| # | 名称 | Windows B8.2 证据（TAP） | macOS CI 证据 | P0 关系 | 归类 |
| --- | --- | --- | --- | --- | --- |
| 1 | D3 卡种收口（2026-10-31）：后续 decision/intent-confirm 裁决不覆盖真实 D3（选项与角色同名也不覆盖） | `document-planning-source-unavailable：缺少当前客户输入与真实项目选择，未登记文档任务。` `false !== true`，`chain-enforcement.test.ts:591:14` | `✖` 116.2ms，无内联断言（日志 2731） | 无关（harness 无真实 Core bind） | 测试装配假设 vs 产品 source 门 |
| 2 | D3 卡种收口（2026-10-31）：新格式 appointment 被接受；无 cardKind 且无 roster 戳的裁决被忽略 | 同上，`:631:14` | `✖` 99.4ms（日志 2732） | 无关 | 同上 |
| 3 | F4：质检报告按任务创建者路由——运营发起回运营；幕僚调度回幕僚 | 同上，`:819:14` | `✖` 59.6ms（日志 2736） | 无关 | 同上 |
| 4 | M1/M2：状态缺失受理 + advisory（意图/名单）；同文幂等；基线漂移受理 | 同上，`:364:14` | `✖` 47.9ms（日志 2729） | 无关 | 同上 |
| 5 | M5/M6/M7 + 交付标记：状态缺失受理 + advisory；verifier/文件型模块元数据 | 同上，`:437:14` | `✖` 78.9ms（日志 2730） | 无关 | 同上 |
| 6 | M9 报告路由：运营派的 worker 报告回运营；幕僚派的任务报告回幕僚 | 同上，`:680:14` | `✖` 56.8ms（日志 2733） | 无关 | 同上 |

**根因链**：产品在 `app/desktop/session.ts:9628/9656` 要求「已登记项目生命周期 + 当前 accepted 客户轮次（`entry.handle.sessionId`、`origin.turnId`、`inputAccepted === true`、`sourceIsCurrent()`）」才允许文档准备派发；该套件 harness 用桩 `openRoleSession` 返回无 `sessionId` 的假句柄，且没有 `getRegisteredProjectLifecycle`，因此恒返回 `document-planning-source-unavailable`。这不是 macOS 路径问题；真实桌面入口是否满足该门需 owner 判断（见 §五 B2-2）。

### 2.2 `test/桌面应用/boundary-refresh.test.ts`（1 名）

| # | 名称 | Windows B8.2 证据（TAP） | macOS CI 证据 | P0 关系 | 归类 |
| --- | --- | --- | --- | --- | --- |
| 7 | G-4 接线钉（裁定④⑤＋I3）：集合重推导单一来源；注入才注册；护栏读活状态；重建行技能措辞 | `error: '两工具同名同形（共用 handler）'`，`boundary-refresh.test.ts:498:10`，`expected true / actual false` | `✖` 3.08ms（日志 2728）——纯同步源码文本断言 | 无关（不触运行期） | 测试自身假设（源码文本钉过时） |

**证据**：测试在 `boundary-refresh.test.ts:498` 断言 `SESSION_SRC.includes('this.applySkillChange("installed"')` 与 `'this.applySkillChange("uninstalled"'`；当前实现 `app/desktop/session.ts:4157-4158` 已改为 `this.applySkillChange(action, …)` / `this.applyMcpChange(action, …)`（`action` 为 `installed`/`uninstalled` 变量），字面量不存在；但 `scopedInstallation("install_skill"/"uninstall_skill")` 仍共用同一 handler，功能语义未变。第 500 行同款 MCP 断言同样会失败。

### 2.3 `test/桌面应用/chief-workflow.test.ts`（19 父 + 9 子）

> **先更正分流报告的一处父子归属**：分流报告称 9 个通用子测试名全部属于 `W5`；日志堆栈显示 `enumerated/selected/cancelled/changed/model-source/commit-race` 属于 `W5`（`chief-workflow.test.ts:787` 循环，父测试 780 行），`unmanaged/unmanaged-system/required` 属于 `W10`（`:944` 循环，父测试 943 行）。**父 19 + 子 9 的计数不变，仅父子归属修正。**

日志证据来源：`W52 ... primary failure ...` 控制台转储（W5/W10/W14/W22/W23/W28/W29/W30/W33/W34/W35）、`failing tests:` 块（W19）、以及 Windows B8.2 TAP。

| # | 名称（父/子） | macOS CI 直接证据 | Windows B8.2 证据 | P0 关系 | 归类 |
| --- | --- | --- | --- | --- | --- |
| 8 | W5 专字段真实workSourceRef：空目录native来源、父轮结束/焦点切换不撤child、伪来源拒绝（父） | 6 个子全部在 `assert.ok((await desktop.openSession({projectRoot: root, roleId:"chief", runtime:"codex"})).ok)`（`:840`）失败（日志 2844-2947） | `2 subtests failed`：`selected` + `commit-race`（TAP 1267-1274） | P0 掩盖 | 父级聚合；P0 后仍红（见子项） |
| 9 | `enumerated`（W5 子） | 同上 `:840`（日志 2861） | **ok**（TAP 1167） | P0 同根因 | P0 后预期转绿 |
| 10 | `selected`（W5 子） | 同上 `:840`（日志 2878） | `0 !== 1`；`dispatch_task` 回执 `stage-request-required`（TAP 1172-1209） | P0 掩盖 | 非确定性/固定路径语义（E3-F 记录红绿漂移） |
| 11 | `cancelled`（W5 子） | 同上 `:840`（日志 2895） | **ok**（TAP 1210） | P0 同根因 | P0 后预期转绿 |
| 12 | `changed`（W5 子） | 同上 `:840`（日志 2912） | **ok**（TAP 1216） | P0 同根因 | P0 后预期转绿 |
| 13 | `model-source`（W5 子） | 同上 `:840`（日志 2929） | **ok**（TAP 1222） | P0 同根因 | P0 后预期转绿 |
| 14 | `commit-race`（W5 子） | 同上 `:840`（日志 2946） | `Observed the actual dispatch/ledger await lease…` `false !== true`（TAP 1228-1265） | P0 掩盖 | 非确定性/时序（E3-F/D1 记录红绿漂移） |
| 15 | W10 fresh scope分流：unmanaged原四路径/轮次护栏；required私有guard；unknown拒bind（父） | unmanaged/unmanaged-system `'unknown' !== 'unmanaged'`（`:1014`，日志 2948-2988）；required `openSession` false（`:989`，日志 2989-3005） | `2 subtests failed`：unmanaged（AggregateError，清理期）+ required（`workSourceRef` 缺失，TAP 1276-1339） | P0 掩盖 | 父级聚合；P0 后仍红（required） |
| 16 | `unmanaged`（W10 子） | `actual:'unknown' expected:'unmanaged'`（日志 2948-2966） | `AggregateError: W10 primary/owned cleanup failures retained`（TAP 1277-1293；E3-T3 隔离复跑未复现） | P0 同根因（Windows 仅清理期环境错误） | P0 后预期转绿 |
| 17 | `unmanaged-system`（W10 子） | 同 `unmanaged`（日志 2969-2986） | **ok**（TAP 1294-1299） | P0 同根因 | P0 后预期转绿 |
| 18 | `required`（W10 子） | `openSession` false（日志 2991） | `The required scope comes from an actual accepted customer turn and child ledger…` `actual:undefined expected:true`（`:993:14`，TAP 1300-1330） | P0 掩盖 | 固定路径派发语义/非确定性（见 §四） |
| 19 | W14 convener按本次真实任务冻结；缺完整执行闭包保stage/code且零worker任务/HTTP | `openSession` false（`:1152:12`，日志 3010） | `ENOTEMPTY: … ans-w14-worker-freeze-…`（TAP 1349-1358） | P0 同根因（Windows 红为清理竞态） | P0 后预期转绿 |
| 20 | W22 Convener显式review也不能越Chief创建Verifier，零任务零HTTP | `openSession` false（`:1152:12`，日志 3040） | 同 W14 `ENOTEMPTY`（TAP 1371-1379） | P0 同根因（Windows 清理竞态） | P0 后预期转绿 |
| 21 | W23 Convener不能越Chief新建普通Verifier，零任务零HTTP | `openSession` false（`:1152:12`，日志 3025） | 同 W14 `ENOTEMPTY`（TAP 1360-1369） | P0 同根因（Windows 清理竞态） | P0 后预期转绿 |
| 22 | W19 实际Core回报与Git回调同assignment；报告续父/通知/新chat/关闭父边界 | `AssertionError: runtime-creation-admission-unproven:runtime-protection-scope-unknown,custom-provider-factory-unverified`，`:1388:90`（日志 3071-3083） | `The actual creator receipt must supply notification source`，`:1424:12`（TAP W19 块） | P0 掩盖 | **确定性**测试/产品契约不一致（close 不发通知，见 §四） |
| 23 | W28 默认Core/Chat真实受派策划缺不可变pin stop 拒绝且零停止 | fixture `openSession` false（`:1682:12`，日志 3116-3130） | `ENOTEMPTY: … ans-w21-notice-…`（TAP W28 块） | P0 同根因（Windows 清理竞态） | P0 后预期转绿 |
| 24 | W28 … stop-and-restart 拒绝且零停止 | 同上（日志 3131-3145） | 同上（TAP W28 块） | 同上 | P0 后预期转绿 |
| 25 | W29 … document-change 保专业规划scope不授旧执行pin | fixture `openSession` false（`:1682:12`，日志 3146-3160） | `test timed out after 12000ms`（TAP W29 块；D1 记录慢机阈值，W4 基线 5.5-6.7s 通过） | P0 掩盖 | 环境性能阈值/时序（非确定性族） |
| 26 | W29 … document-change-missing-confirmation … | 同上（日志 3161-3175） | `git-file-final-guard-unproven`（`:1625:99`，TAP W29 块；W29 主变体超时后的级联） | P0 掩盖 | 超时级联/非确定性（见 §四） |
| 27 | W29 … document-change-source-loss … | 同上（日志 3176-3190） | 同上 | P0 掩盖 | 同上 |
| 28 | W29 … document-change-wrong-flow … | 同上（日志 3191-3205） | 同上 | P0 掩盖 | 同上 |
| 29 | W30 … 真实重启迁移后 | fixture `openSession` false（日志 3206-3220） | `git-file-final-guard-unproven`（TAP W30 块） | P0 掩盖 | 非确定性族（E3-F 记录 W30 红绿漂移） |
| 30 | W30 … 连续写入后 | 同上（日志 3221-3235） | 同上 | P0 掩盖 | 同上 |
| 31 | W33 真实DocRun关闭通知退休旧InitRun绑定且后续合法任务继续 | fixture `openSession` false（日志 3236-3250） | `git-file-final-guard-unproven`（TAP W33 块） | P0 掩盖 | 非确定性/级联（E3-F 两轮同名） |
| 32 | W34 真实首文档发布与原创建者关闭后派团队规划保独立scope | fixture `openSession` false（日志 3251-3265） | `git-file-final-guard-unproven`（TAP W34 块） | P0 掩盖 | 非确定性/级联（E3-F 两轮同名） |
| 33 | W35 缺team仍可真实Chief报告派人事准备但D3写动作拒绝 | fixture `openSession` false（日志 3266-3280） | `git-file-final-guard-unproven`（TAP W35 块） | P0 掩盖 | 非确定性族（E3-F 记录红绿漂移） |
| 34 | W36 真实Chief可无M0-plan-D3派五builtin准备；人事写动作仍拒 | 无 W52 转储；`openSession` 在 `:2017`（推断 P0，日志仅 ✖ 24.0ms，3283） | `TypeError: Cannot read properties of undefined (reading 'name')`，测试 HTTP 桩 `:1995:117`（TAP W36 块） | P0 掩盖 | 测试桩假设/产品请求形状，需复跑 |
| 35 | W47 默认Core/Codex本地HTTP：忙Chief独立revise释放真实卡调用 | 无 W52 转储；`manager.open` 走真实工厂（推断 P0，日志仅 ✖ 48.6ms，3291） | `ENOTEMPTY: … ans-w47-default-chief-…`（TAP W47 块） | P0 同根因（Windows 清理竞态） | P0 后预期转绿 |

> 说明：`W47 … select` 是分流报告的 MAC 名（不在本批 35 内），但同属该测试族；D1/E3-F 记录其红绿漂移，P0 后须一并复跑。

---

## 三、分组结论

### 3.1 `chain-enforcement` 6 名：确定性、跨平台、与 P0 无关

- **直接证据**：Windows B8.2 TAP 全部为 `document-planning-source-unavailable：缺少当前客户输入与真实项目选择，未登记文档任务。`（`chain-enforcement.test.ts:364/437/591/631/680/819`）；macOS CI 无内联断言，但耗时与 Windows 同量级（M1/M2 47.9 vs 48.1ms、D3 116.2/99.4 vs 116.6/110.6ms，M5/M6/M7 78.9 vs 62.3ms），且该套件 harness（`:227-277`）桩掉 `openRoleSession`、无 `createRuntimeAdapterFactory`，不经过 macOS 的 Core 准入路径，故不可能由 P0 的 `noncanonical-project-root` 触发。
- **机制**：产品 `app/desktop/session.ts:9628/9656` 的文档准备门要求「已登记项目生命周期 + 当前 accepted 客户轮次 + 来源仍 current」；harness 直接调用 `mgr.open` 后从 captured capability 调 `dispatch`，没有真实 `sessionId`/`turnId`/`inputAccepted`，门恒拒绝。
- **判定**：**不是 macOS 特有，不是 P0，也不是已证实的真实产品缺陷**；是「测试装配假设（直接调用 dispatch 能力、无真实客户轮次）与产品 source 门冲突」。若 owner 认为 legacy 项目允许「无真实轮次的直接派发」是受支持路径，则应视为产品缺陷；否则应更新测试装配。两种处置见 B2-2。

### 3.2 `chief-workflow` 28 名：P0 是 macOS 当前直接失败点，但分三类

1. **12 名 P0-only**（P0 后预期转绿）：`enumerated`、`cancelled`、`changed`、`model-source`、`unmanaged`、`unmanaged-system`、`W14`、`W22`、`W23`、`W28`×2、`W47 revise`。
   - macOS 失败点：`openSession(...).ok === false`（`:840`/`:1152`/`:1682`）或 `scope 'unknown' !== 'unmanaged'`（`:1014`）。
   - Windows 对照：4 个 W5 子 + `unmanaged-system` 为 `ok`；其余为 `ENOTEMPTY` 清理竞态或 `unmanaged` 的 AggregateError 清理期错误（E3-T3 隔离复跑未复现）。ENOTEMPTY 是 Windows `rmdir` 语义，不会在 macOS 出现。**P0 修复后应转绿，不列第二批。**
2. **1 名 P0 掩盖的确定性问题**：`W19`。产品 `createDirectRoleRuntime.closeCreatedTask`（`src/pipeline/orchestration/trunk-runtime.ts:818-823`）按注释「close 不是文档/权限效果，不得启动无关模型回合」**不调用 `notifyDirect`**；测试却在 `chief-workflow.test.ts:1424` 断言 `actualCloseNotice` 必须存在。Windows 在两轮 E3-F 运行中同名红，属确定性契约冲突。P0 修复后 macOS 仍会红。
3. **15 名 P0 掩盖的已登记非确定性族/待复跑**：`W5` 父、`selected`、`commit-race`、`W10` 父、`required`、`W29`×4、`W30`×2、`W33`、`W34`、`W35`、`W36`。
   - 证据：E3-F（2026-11-09）明确记录 `chief-workflow` 为「ENOTEMPTY 清理竞态」族：63/48/15 与复跑 63/51/12 失败集合漂移（`W20`/`revise`/`unmanaged` 转绿、`commit-race` 转红；`W14/W19/W22/W23/W28×2/W33/W34` 两轮同名）；E3-T3（2026-11-08）记录 `unmanaged` AggregateError/ENOTEMPTY、`W29`/`commit-race` 清理类；D1（2026-11-08）记录 W29 主变体 12s 超时属慢机性能阈值，3 个变体级联 `git-file-final-guard-unproven`，同一候选在 W4 基线 5.5-6.7s 通过。
   - Windows 失败面：`ENOTEMPTY`（W28×2、W47 revise 已归 P0-only；W14/W22/W23 同）、`stage-request-required`（`selected`）、lease 观察失败（`commit-race`）、`workSourceRef` 缺失（`required`）、12s 超时（W29 主变体）、`git-file-final-guard-unproven`（W29 3 变体 + W30/W33/W34/W35）、测试 HTTP 桩 `TypeError`（W36）。
   - **判定**：既有非确定性族；P0 后在 macOS 快速机逐名隔离复跑前，不应认定为产品缺陷或展开确定性修复。

### 3.3 `boundary-refresh` 1 名：确定性测试源码文本钉过时，与 P0 无关

- `boundary-refresh.test.ts:498/500` 断言 `SESSION_SRC.includes('this.applySkillChange("installed"')` 等字面量；当前实现 `app/desktop/session.ts:4157-4158` 传入 `action` 变量，字面量不存在。`scopedInstallation` 仍让 install/uninstall 共用同一 handler，功能未变。
- macOS CI 3.08ms 同步失败与 Windows TAP `'两工具同名同形（共用 handler）'` 完全一致，属测试自身假设（源码文本钉），不是产品缺陷。

### 3.4 P0 同根因判定汇总

| 归类 | 数量 | 名单 |
| --- | --- | --- |
| P0 同根因（P0 后预期转绿，不列第二批） | **12** | W5 子 `enumerated`/`cancelled`/`changed`/`model-source`；W10 子 `unmanaged`/`unmanaged-system`；`W14`、`W22`、`W23`、`W28`×2、`W47 revise` |
| P0 掩盖 + 确定性问题（P0 后仍红） | **1** | `W19` |
| P0 掩盖 + 已登记非确定性族/待复跑 | **15** | `W5` 父、`selected`、`commit-race`、`W10` 父、`required`、`W29`×4、`W30`×2、`W33`、`W34`、`W35`、`W36` |
| 与 P0 无关的确定性测试假设 | **7** | `chain-enforcement` 6；`boundary-refresh` G-4 |
| macOS 特有（非 P0） | **0** | — |
| 未知 | **0** | — |

> 注：15 名中 `W5` 父、`W10` 父为聚合项，子项转绿后父项是否转绿取决于其剩余子项；`W29` 主变体是超时/性能阈值，3 个变体是其后的 `git-file-final-guard-unproven` 级联（D1 已记录同一形态）。

---

## 四、关键机制说明（为什么这些不是 macOS 特有非 P0）

1. **P0 机制（12 名直接命中）**：macOS `os.tmpdir()` = `/var/folders/...`，`realpath` = `/private/var/folders/...`；`src/provider/trunk/impl/git-command.ts:925` 的 `hostProjectKey(root) !== hostProjectKey(input.projectRoot)` 或 `lstat(input.projectRoot).isSymbolicLink()` 抛 `noncanonical-project-root` → 保护范围 `unknown` → `src/service/runtime/session.ts:1262/1283/1294` 抛/记 `runtime-protection-scope-unknown`。`chief-workflow` 的 12 名直接死在 `openSession`/`manager.open` 或 `readRoleCapabilityProtectionScope` 的 `unknown` 上，符合该链。
2. **为什么 16 名 P0 后不一定绿**：这些测试在 Windows canonical 根上仍能进入业务断言（或进入业务前的清理/超时面），说明其失败面与 symlink 根无关；P0 修复只解除 macOS 的准入阻断，不会自动修复 `stage-request-required`、`ENOTEMPTY`、12s 超时、`git-file-final-guard-unproven`、`TypeError`、close-notify 等。
3. **为什么 `git-file-final-guard-unproven` 被归为「非确定性/级联」而不是产品缺陷**：
   - 守卫在 `src/pipeline/orchestration/trunk-runtime.ts:233-238`：任一 active Core 条目的 `toolSurface.appTools` 含 `write_file`/`edit_file` 时，必须带 `fileWriteProtection`（`src/service/runtime/session.ts:1012-1016`，仅在 `options.writeRoot !== undefined` 时产生）。
   - D1/E3-T3 记录同一候选在 W4 基线通过（W29 组 5.5-6.7s），且 W29 主变体 12s 超时后 3 变体才级联该错误；这更像「超时后会话/注册表残留导致的测试隔离问题」，而不是稳定的产品拒绝。Windows B8.2 的 W33/W34 两轮同名红提示也可能有确定性成分，故列为「待复跑」而非直接判产品缺陷。
4. **`W19` 是确定性问题**：`closeCreatedTask` 的实现（`trunk-runtime.ts:818-823`）明确不调用 `notify`，只在 `selectRunChange`/`activateRoleDocuments` 调用；测试要求 close 也产生 direct notification。两者必有一方需要修改；这不是时序问题。
5. **`W36` 的 `TypeError`**：发生在测试自己的 HTTP 桩 `body.tools.some(tool => tool.function.name)`（`:1995:117`），说明至少一个 tool 条目没有 `function`。可能是产品请求形状（如 native/MCP 条目）与测试桩假设不一致；需 P0 后复跑并用日志确认实际请求体，暂不判产品缺陷。

---

## 五、第二批修复清单

> 原则：先把「确定性且与 P0 无关」的 3 项处理掉；15 名非确定族必须先做 P0 后 macOS 定向复跑门，复跑前不写产品代码。所有测试期望修正只可走精确测试文件 overlay；产品修复不得 overlay。

### B2-1 `boundary-refresh` G-4 源码文本钉（确定性，低风险）

- **文件**：`test/桌面应用/boundary-refresh.test.ts`（498、500 行）。
- **改法一句话**：把 `this.applySkillChange("installed"/"uninstalled")` 与 `this.applyMcpChange(...)` 的字面量断言改为对当前实现的断言（如 `this.applySkillChange(action,` + `scopedInstallation("install_skill")`/`"uninstall_skill"` 共用同一 handler，MCP 同理），或由 owner 决定在产品中恢复可读字面量。
- **验证方式**：`node --test test/桌面应用/boundary-refresh.test.ts`（Windows 与 macOS/P0 后各一次），确认 G-4 通过且其余 G-4 断言不回退。
- **overlay**：测试文件精确条目 overlay（若 owner 批准测试期望修正）；产品字面量恢复走正常变更，不允许 overlay。

### B2-2 `chain-enforcement` 6 名 legacy 直接派发语义（确定性，需 owner 裁决）

- **文件**：二选一——产品 `app/desktop/session.ts`（`document-planning-source-unavailable` 两处：9628/9656）或测试 `test/桌面应用/chain-enforcement.test.ts`（harness 227-277 与各失败用例）。
- **改法一句话**：若「legacy 项目允许真实 capability 直接派发、无需真实客户轮次」是受支持语义，则在 source 门对 legacy/v1 或显式测试/宿主路径放行；否则更新 harness，让 `openRoleSession` 返回带真实 `sessionId` 的句柄并提供当前 accepted 客户 origin（或改走 `desktop.sendSession` 真实轮次）。
- **验证方式**：`node --test test/桌面应用/chain-enforcement.test.ts` 全绿；同时跑 `test/桌面应用/fixed-path-routing.test.ts`、`test/测试/mode-switch.test.ts` 确认 legacy/fixed 分流未回退。
- **overlay**：若选产品修复——**不允许 overlay**，走正常变更；若选测试装配修正——允许该测试文件精确条目 overlay。

### B2-3 `W19` close 通知契约（确定性，需 owner 裁决）

- **文件**：产品 `src/pipeline/orchestration/trunk-runtime.ts`（`closeCreatedTask` 818-823，及 `notify` 771-789）或测试 `test/桌面应用/chief-workflow.test.ts`（1424 行）。
- **改法一句话**：明确「close 是否应产生 direct notification」——若要，则在 `closeCreatedTask` 成功回执后调用 `notify`（并保证幂等键/`directDeliveryRecorded` 语义）；若不要，则删除/改写测试的 `actualCloseNotice` 断言与后续 `queueDirectNotification` 依赖。
- **验证方式**：P0 后在 macOS 与 Windows 各跑 `node --test --test-name-pattern "W19" test/桌面应用/chief-workflow.test.ts`，确认 W19 单测通过且无新增通知副作用；再跑 W33（close notice）回归。
- **overlay**：产品修复不允许 overlay；测试期望修正允许该测试文件精确条目 overlay。

### B2-4 P0 后 15 名定向复跑门（先复跑，不写代码）

- **文件**：`test/桌面应用/chief-workflow.test.ts`（W5/W10/W29/W30/W33/W34/W35/W36 相关用例）；无代码改动。
- **改法一句话**：P0 合并后在 macOS arm64（必要时 x64）用 `node --test --test-concurrency=1 --test-name-pattern "W5|W10|W29|W30|W33|W34|W35|W36" test/桌面应用/chief-workflow.test.ts` 逐名隔离复跑，记录「确定性红 / 红绿漂移 / 绿」；同时在本机 Windows HEAD 复跑 B8.2 的同一组以区分平台。
- **验证方式**：每个名字至少 2 次隔离运行 + 1 次整文件运行；确定性红才进入后续产品/测试修复，漂移项按既有非确定性族登记。
- **overlay**：无（只产出证据记录）。

### B2-5 测试清理/桩硬化（可选，降低 Windows 基线与 macOS 复跑噪声）

- **文件**：`test/桌面应用/chief-workflow.test.ts`（清理 `fs.rm(root, …)` 处：776、1085、2244 及 W29 共享 fixture 的 finally；W36 桩 1995 行；W29/W30 组 12s 超时）。
- **改法一句话**：清理统一加 `maxRetries: 10, retryDelay: 50`（与 `chain-enforcement` 一致）；W36 桩用 `tool?.function?.name`；W29 主变体超时按 owner 决定提高到 18-30s 或改为性能断言。
- **验证方式**：Windows 连续 3 次跑 `chief-workflow.test.ts`，ENOTEMPTY/TypeError/超时类失败不重复出现；macOS P0 后同文件跑一次。
- **overlay**：测试文件精确条目 overlay。

### B2-6 若 owner 选择「不修则冻结」：桌面 known-red 基线（仅文档）

- **文件**：新增 `角色卡/测试/docs/change/2026-11-12_desktop-known-red-baseline.md`（或 owner 指定的基线文件），列 `chain-enforcement` 6 + `boundary-refresh` G-4 的确定性命中，以及 15 名非确定族「按平台/运行记录、不按名冻结」的口径；不改测试。
- **改法一句话**：把确定性 7 名写成冻结基线（文件+日期+hash），非确定族只登记「族」与复跑要求，避免把漂移名误当稳定 known-red。
- **验证方式**：下一次全量/桌面套件的失败名与基线逐名 diff；非确定族按「同族允许漂移、但不得新增族外名」判定。
- **overlay**：无（仅文档）。

---

## 六、风险与限制

1. **macOS 直接证据有限**：CI 主文件在挂起前被取消，`node --test` 的 `failing tests:` 汇总未输出；`chain-enforcement` 6 名与 `W36`/`W47` 的 macOS 断言体缺失。本报告用「Windows TAP 同因 + macOS 耗时/代码路径/无 P0 路径」推断，置信度高但不是逐条断言级直接证据。
2. **Windows 基线时点**：B8.2 是 2026-11-11（HEAD `c38b171` + B8.2 工作树）在 Windows 的结果；CI HEAD `7cb9eea` 还包含 B18-B34、B10.1/B11.1/B15/B19/B21/B29/B31 等对 `app/desktop/session.ts` 的改动。B29 只改了 `chief-workflow.test.ts` 的 W6/T5 五行为 legacy 项目钉，不影响本批 35 名；但其他 B 批可能改变 W29-W35 等的行为，故 Windows 失败面只作线索，最终以 macOS P0 后复跑为准。
3. **非确定性族**：E3/E3-F/D1 已记录 `chief-workflow` 失败集合逐次漂移（15/14/11/14；`W20`/`revise`/`unmanaged`/`commit-race` 进出）。因此**不能**把 B8.2 的 16 个名字当成稳定的「必然红」；本报告把 15 名列入「P0 后复跑门」，正是为了避免把 flake 误修为产品缺陷。
4. **12 名 P0-only 是预测**：P0 修复把 `unknown` 变成 `unmanaged`/`required` 后，下游可能暴露新的业务断言；B2-4 的整文件复跑应覆盖这 12 名，确认转绿。
5. **W29 超时阈值**：12s 在慢机/全量并发下不足（D1 记录 12,009-12,017ms 稳定超时；W4 基线 5.5-6.7s 通过）。若 macOS runner 也出现接近 12s，按 B2-5 调整或隔离运行；不要把它当作产品挂起。
6. **父子归属更正**：9 个通用子测试名实际为 W5 6 + W10 3（日志堆栈 `:787` 与 `:944` 可证）；分流报告 A.1 把它们全部标给 W5，父 19+子 9 的总数不变，但统计 W5/W10 家族时应按本报告修正。
7. **未做的事**：未跑全量/定向测试（除只读证据读取）；未改任何测试/产品/角色卡/基线；未 commit/push；未触发 CI。本文件由调度决定是否随 P0 PR 提交。

---

## 附录 A：CI 日志关键行索引（`/tmp/ci-job-130920941222.log`，3,359 行）

| 证据 | 行号 |
| --- | --- |
| `G-4 接线钉` / `M1/M2` / `M5/M6/M7` / `D3`×2 / `M9` / `F4` 的 ✖ | 2728-2736 |
| W5 子 W52 转储与 ✖ | 2844-2947（`openSession` 断言在 2846/2864/2881/2898/2915/2932；✖ 2861/2878/2895/2912/2929/2946） |
| W10 子 W52 转储与 ✖ | 2948-3007（`unknown` vs `unmanaged` 2951-2952/2972-2973；`openSession` 2991；✖ 2968/2988/3005） |
| W14/W23/W22 ✖ 与 `openSession` 断言 | 3008-3052（断言 3010/3025/3040；✖ 3022/3037/3052） |
| W19 `runtime-creation-admission-unproven:runtime-protection-scope-unknown,…` | 3071-3083（✖ 3057/3070/3083） |
| fixture `openSession` 失败与 W28/W29/W30/W33/W34/W35 ✖ | 3086-3283（断言 `:1682:12` 反复出现；✖ 3130/3145/3160/3175/3190/3205/3220/3235/3250/3265/3280） |
| W36 / W47 revise ✖（无 W52 明细） | 3283 / 3291 |
| 取消点 | 3307 |

## 附录 B：B8.2 TAP / 文档引用

| 证据 | 位置 |
| --- | --- |
| `G-4` / `M1/M2` / `M5/M6/M7` / `D3`×2 的 Windows 断言 | `06-after-desktop.tap:872-981` |
| `W5` 父与子（selected/commit-race 失败；其余 ok） | `06-after-desktop.tap:1165-1274` |
| `W10` 父与子（unmanaged AggregateError；unmanaged-system ok；required 失败） | `06-after-desktop.tap:1276-1347` |
| `W14/W23/W22` ENOTEMPTY | `06-after-desktop.tap:1349-1379` |
| `W19` close 通知断言 | `06-after-desktop.tap` W19 块（error `The actual creator receipt must supply notification source`，`:1424:12`） |
| `W28/W29/W30/W33/W34/W35/W36/W47` 失败面 | `06-after-desktop.tap` 对应 `not ok` 块（ENOTEMPTY / 12s timeout / `git-file-final-guard-unproven` / `TypeError`） |
| B8.2 非确定性说明 | `角色卡/桌面窗口/docs/change/2026-11-11_B8.2_two-fixed-workflow-paths-desktop.md` §5.3 |
| E3-F 非确定性族 | `角色卡/测试/docs/change/2026-11-09_E3-F_judge-delegated-effectiveness.md:156,215,221` |
| E3-T3 / D1 | `2026-11-08_E3-T3-full-regression.md:17,74,82,86,107-116`；`2026-11-08_D1_remove-predictive-gates.md:106-112,150-155` |
