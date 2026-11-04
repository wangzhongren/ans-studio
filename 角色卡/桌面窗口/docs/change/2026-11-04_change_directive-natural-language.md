# `@审批`/`@决策` 自然语言解释——桌面窗口角色变更记录（2026-11-04，客户直修）

- 角色：桌面窗口（desktop window）
- worktree：`.claude/worktrees/directive-nl-fix`
- 分支：`fix/directive-natural-language`（基于 fetch 后 `origin/main` `c8a9394`，v1.9.2 已并入）
- 方式：客户直修（跳过调研/方案），只做桌面窗口角色边界内的接线、测试、探针与记录
- 未提交：worktree 内未 commit / push

## 1. 客户直修依据

依据：`docs/communication/2026-11-04_intent_directive-natural-language.md`（客户使用反馈；未跟踪文件，读取自相邻 worktree `customer-authorization-plane`）。客户原话：「这个个不是纯扯淡吗，这么复杂谁写啊。直接@审批，之后写自然语言，然后发给审批AI」。

桌面侧目标（行为规格 1-6 的落点）：

- `@审批`/`@决策` 标记识别规则与 IPC/面板冻结载荷**不变**；
- 命中标记时仍只走指令控制器（绝不回退普通聊天）；
- 自然语言解释只预填**现有确认面板**；客户确认后经 B1 落账；失败/不可用/低置信回退现有面板；
- 不新增用户可见文案（i18n 停止规则），不改 renderer 组件。

## 2. 改动清单（桌面窗口）

### 2.1 `app/desktop/directive-input.ts`（812 → 820 行，+8）

- `CreateDirectiveInputControllerOptions` 增可选 `interpret?: DirectiveInterpretFn`（缺省 ⇒ 只走既有确定性解析）。
- `runtimeFor` 构造 B1 运行时（`createCustomerDirectiveRuntime`，每次项目懒创建一份）时透传 `interpretDirective`；解释器是只读预填能力，不改变控制器的恢复/撤销/高危复核/幂等逻辑。
- 面板冻结载荷 `DirectiveConfirmRequestPayload` **未改**（原文/预填/高危/confirmable/decisionGroupEnabled 逐字不变）；AI 解释只体现为预填字段 + `unrecognized: []`。

### 2.2 `app/desktop/session.ts`（8827 → 8907 行，+80）

- `SessionManagerDeps` 增可选 `createDirectiveInterpreter?: typeof realCreateDirectiveInterpreter`（缺省经 Pipeline 公共出口 `govern-session.ts`；测试可注入桩件）。
- 新增公开方法 `SessionManager.interpretDirective(request)`（1885 行起）：
  - 形状/target/正文/项目根校验；引擎解析顺序 = 请求显式 runtime > 该角色活会话引擎 > 本项目最近治理引擎；demo/未知 ⇒ `unsupported-engine`（在构造项目配置/adapter 之前返回）。
  - 复用与两个 judge **同一套** `runtimeOptions` 与 adapter 工厂（`createRuntimeAdapterFactory(project, runtime, {…runtimeOptions, shellGate})`，含 `prepareRuntimeProfile`），按需构造一次性解释器；不打开角色会话、不写聊天/账本、不改权限。
  - 失败（项目未枚举/配置构建失败/adapter 构造失败/解释器失败）一律 `{ok:false}`，不外抛。

### 2.3 `app/desktop/interface.ts`（2719 → 2738 行，+20/-1）

- `createDesktopInterface` deps 增 `createDirectiveInterpreterFn?: typeof realCreateDirectiveInterpreter`（缺省真实实现；桌面不直接导入 `common/编排/` 私有模块）。
- `DesktopInterface` 增主进程内部方法 `interpretDirective(request)`（**不挂 IPC、不暴露给渲染侧**），委托 `manager.interpretDirective`；构造 `SessionManager` 时注入工厂。

### 2.4 `app/main.ts`（1222 → 1228 行，+6）

- `createDirectiveInputController` 增 `interpret`：`desktopRef?.interpretDirective(request)`；desktop 尚未创建时返回 `{ok:false, reasonCode:"unavailable"}`（fail-closed 回退）。
- 其余指令接线（`directive:state` 握手/重推/关窗取消/项目切换）逐字不变。

## 3. 行为变化（桌面侧）

- Composer/卡内入口输入 `@审批 让 npm install 跑一次`：控制器 → B1 → 解释器（同一 runtimeOptions/adapter 工厂）→ 现有确认面板预填（原文 + 动作/范围/资源/期限），确认启用；客户一键确认后落账并回执 `#d-N`。
- 结构化写法（如 `@审批 允许 shell "…" once`）：B1 确定性解析优先，解释器不调用；行为逐字不变。
- 解释失败/不可用/低置信：面板原文 + 未识别片段，确认禁用（与改动前一致）；取消/关窗/项目切换仍 fail-closed。
- 撤销快路径（`@审批 撤销 #d-N`）不经过解释器；同 target/active/回执逻辑不变。
- 高危（forever/宽范围/项目级等）仍由 B1 用最终预填复算；面板二次勾选保留（探针覆盖「替我决策」关闭时的项目级自动代选高危）。
- **未改**：preload 五个白名单方法、IPC 通道名/载荷、renderer 组件/样式/文案、B1 账本/消费者/撤销语义。

## 4. 测试与证据（原始输出）

证据目录：`角色卡/测试/docs/change/2026-11-04_customer-authorization-plane-nl-evidence/`

1. `node --test test/桌面应用/directive-input.test.ts` → **19/19 pass**（既有 14 + 新增 5；`03-directive-input-test.log`）。新增覆盖：
   - 控制器：自然语言解释成功 ⇒ 面板预填 + 解释器收到 target/正文/原文/项目/角色/引擎；确认后落账；
   - 控制器：解释失败 ⇒ 回退面板（confirmable=false、未识别片段）；伪造确认也不落账；
   - 控制器：撤销快路径不调用解释器；确认后 durable revoked；
   - `sendSession` 集成：经 `desktop.interpretDirective` → `SessionManager`（同一套 runtimeOptions/adapter 工厂）→ 面板预填 → 确认落账；
   - `sendSession`：demo 引擎 ⇒ 解释不可用、回退面板，不构造解释器。
2. `node --test test/编排/customer-directive.test.ts test/编排/customer-directive-gate.test.ts test/编排/customer-directive-interpret.test.ts test/编排/directive-interpreter.test.ts test/桌面应用/directive-input.test.ts test/桌面应用/directive-decision.test.ts test/测试/customer-authorization-plane-integration.test.ts` → **89/89 pass**（`04-affected-suites.log`）。
3. 全量桌面+编排套件 → **1287 pass / 1 fail**（`09-full-desktop-orchestration.log`）；唯一失败为 Windows 符号链接 `EPERM`（`test/编排/shell-authorized-routine.test.ts`），基线 worktree 同样失败 ⇒ 环境限制、与本次改动无关。
4. `npm run typecheck` / `npm run typecheck:renderer` / `npm run build:renderer` → 全部 exit 0（`05/06/07`）。

5. **真实 Electron 探针** `test/测试/customer-authorization-plane-nl-probe.mjs`（真实 preload/renderer bundle/DesktopInterface/directive-input/SessionManager/B1 账本；**只把判断 AI 模型替换成桩件**）：**38/38 checks、0 failures**（`probe-run/report.json`）。场景与截图：
   - `10-nl-approval-prefill.png`：`@审批 让 npm install 跑一次` → 原文保留；动作=允许、资源=`shell 命令：npm install`、期限=本会话；确认启用；确认后账本条 `d-1`（allow/shell/`npm install`/session）+ 回执「已记录审批指令 #d-1」；
   - `12-nl-decision-prefill.png`：`@决策 以后都选推荐项` → 动作=选推荐项；「替我决策」关闭 ⇒ 高危原因「项目级自动代选」、确认禁用直到勾选；勾选后账本 `d-2`（select-recommended + highRisk acknowledged）+ 回执「已记录决策指令 #d-2」；
   - `14-nl-fallback-disabled.png`：`@审批 这个不需要了` → 解释失败回退：原文 + 未识别片段、`指令解析不完整`、确认禁用；取消后账本仍为 2 条（未落账）。
- 编号说明：08 号位为探针自记录的 `probe-run/report.json`（真实 Electron 探针自行写盘；沙箱不允许把 electron 输出重定向到日志文件，故以 report.json 为原始输出，不再另设 `08-*.log`）。
6. 候选哈希（未 commit）：
   - `app/desktop/directive-input.ts`：sha256 `9499ca53ee74540865f03602adbc57d0afef4f922ff8d2f44a07e0aa47e46a2c`
   - `app/desktop/session.ts`：sha256 `28ab179970fa2ef99795e24abbaef3b8c6ca5fbca90ca5759d4919026fbf122a`
   - `app/desktop/interface.ts`：sha256 `a0e000b56c50ea490e27cd384adbc29670b8890420e341cd93a28386ccdc5504`
   - `app/main.ts`：sha256 `c61a0f7f8535307c72f7adf7e6970f92e0a58a3e54c0974f427e1a5caaab52dd`
   - `test/桌面应用/directive-input.test.ts`：sha256 `e43b1a506073c6e53b97f2c26744bfd57ac978971e138eba7be38f26937b3e6f`
   - `test/测试/customer-authorization-plane-nl-probe.mjs`：sha256 `eac2eef370855b0b151ec3377a94c1545bc638a3664a7fb5644d9f5a2d359d21`
   - 本记录自身：哈希无法自引用内嵌，写定后的 sha256 随最终回报给出。

## 5. 风险与停止项

- **门控口径（客户已确认，2026-11-04）**：按 A 口径，解释**不受**两个 judge 开关门控（客户显式标记触发、AI 只预填、落账必须面板确认）。依据：客户授权原话「授权提交并合并指令自然语言修复（不含发布），解释器门控口径按 A（不受两开关门控）。」现实现即 A；若未来改口径，改动点在 `main.ts` 的 `interpret` 注入或 `SessionManager.interpretDirective`，不影响 B1/账本。
- 解释超时 30s：面板出现前 Composer 保持既有「提交中」状态；未新增进度提示（i18n 停止规则）。
- 解释引擎可用性：request.runtime 由 Composer target 提供；缺失时依次回退活会话引擎/最近治理引擎；仍无 ⇒ demo/不可用 ⇒ 回退面板。
- 探针用桩件只替代「判断 AI 模型」这一步；解释器驱动、SessionManager、控制器、面板、账本均走真实实现。未提交/未打包。
