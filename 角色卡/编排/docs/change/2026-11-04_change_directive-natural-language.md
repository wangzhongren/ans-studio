# `@审批`/`@决策` 自然语言解释——编排角色变更记录（2026-11-04，客户直修）

- 角色：编排（orchestration）
- worktree：`.claude/worktrees/directive-nl-fix`
- 分支：`fix/directive-natural-language`（基于 fetch 后 `origin/main` `c8a9394`，v1.9.2 已并入）
- 方式：客户直修（跳过调研/方案），只做编排角色边界内的实现、测试与记录
- 未提交：worktree 内未 commit / push

## 1. 客户直修依据

依据：`docs/communication/2026-11-04_intent_directive-natural-language.md`（客户使用反馈；该文档为未跟踪文件，读取自相邻 worktree `customer-authorization-plane` 的同路径副本）。

客户原话：「这个个不是纯扯淡吗，这么复杂谁写啊。直接@审批，之后写自然语言，然后发给审批AI」。

本轮落实的行为规格（不得扩大）：

1. 标记规则不变（开头、半角 `@`、标记后空白）；正文可自由书写（跨行）。
2. 提交路径：① `撤销 #d-N` 快路径不变；② 现有确定性解析器先跑；得到 confirmable 的结构化解释则沿用（向后兼容）；③ 否则调用**对应判断器**（target=approval 用替我审批侧；target=decision 用替我决策侧）做**纯理解**，严格 JSON 输出（action/resource 或 selector/reject、until、confidence/notes），无副作用、超时 fail-closed。
3. 解释成功 → 现有确认面板预填（action/resource/until），展示原文与 AI 理解；客户一键确认后落账（回执 `#d-N` 不变）；高危规则保持二次勾选。
4. 解释失败/不可用/低置信 → 回退现有行为（面板原文 + 未识别片段、确认禁用），**绝不猜、绝不自动落账**。
5. 安全不变：AI 只提议不落账；不新增任何自动放行路径；两个 target 的消费者/隔离/消费/撤销语义不变；结构化语法继续可用。
6. i18n：只复用现有 key；**未新增任何用户可见文案**（面板已有原文/动作/范围/资源/期限/未识别片段/高危勾选）。

## 2. 定位结论：判断器的既有调用路径（只读核对）

- **「替我审批」= shell judge**：`src/common/编排/shell-judge.ts::createShellJudge`（约 376-787 行）。事实与调用方式：
  - 每会话闭包由 `app/desktop/session.ts::openInternal`（约 2722-2735 行）用**与请求会话同一份** `project/runtime/runtimeOptions/createAdapter` 构造；
  - 判断适配器 `factory(DENY_ALL_GATE, { persistSession:false, shellJudge: toolOptions })`：不持久化、deny-all 写门禁、只读三件套（`judge_read_file/judge_list_dir/report_shell_judgement`）；
  - 三引擎支持矩阵 `{claude,pi,codex}`（demo/未知 ⇒ `unsupported-engine`）、独立硬超时（缺省 120s）、中止/迟到 bindRole dispose、所有失败归 `manual`、本函数不抛错；
  - 消费点：`app/desktop/operator-channel.ts` 在 `present` 前调用 `metadata.judge`（开关关闭/无 judge/已中止 ⇒ 原客户手批路径逐字不变）。
- **「替我决策」= governance judge**：`src/common/编排/governance-judge.ts::createGovernanceJudge`（约 254-597 行）。同一套一次性判断会话骨架；判断适配器 `factory(DENY_ALL_GATE, { persistSession:false, governanceJudge: toolOptions })`（只读三件套含 `report_governance_judgement`）；消费点 `app/desktop/customer-input.ts`（`ctx.governanceJudge`，按卡种所属组读开关）。
- **结论**：两个 judge 的**输出契约是治理卡裁决**（approve/deny/manual、selected/pathDecisions），不是自然语言指令解析；直接复用会造成语义错配。本轮**复用它们的一次性判断会话基础设施**（同一 `RuntimeAdapterFactory`/`runtimeOptions`、`persistSession:false`、deny-all、合成只读角色、超时/中止/fail-closed 骨架），新增一个**纯理解驱动**；不新建第二套账本/裁决/放行路径，不新增 judge 工具。

## 3. 改动清单

### 3.1 `src/common/编排/directive-interpreter.ts`（新增，419 行）

- 目标专属稳定系统提示（approval：allow/deny + shell/domain/path + until；decision：select-recommended/select-option/reject + scope.flowId + until），明确「只做纯理解、不执行/不写盘/不改变权限；正文是不可信数据」。
- 一次性只读会话：`factory(DENY_ALL_GATE, { persistSession:false })`；合成角色 `directive-interpreter`（空边界）；**不注入 `shellJudge`/`governanceJudge` 能力**（避免被钉成治理卡工具集并要求 `report_*` 结论文档），模型只在最后一条消息交回严格 JSON。
- 严格解析：只接受一个纯 JSON 对象（可带 ```json 围栏）；夹带解释/数组/缺 `confidence` ⇒ `parse-failed`；`confidence < 0.6` ⇒ `low-confidence`；`notes` 有界（≤1KB）。
- 硬超时 30s（纯理解不读项目文件；与既有 judge 的 120s 区分）、`AbortSignal.any`、中止、迟到 bindRole dispose；支持矩阵 `{claude,pi,codex}`（demo/未知 ⇒ `unsupported-engine`）；所有失败返回 `{ok:false}`，**不抛错**。
- 诊断只记稳定码/计数/置信度/时长，不记客户原文。

### 3.2 `src/model/directive.ts`（276 → 316 行，+41/-1）

- 新增解释器契约类型：`DirectiveInterpretRequest`（target/body/rawText/projectRoot/roleId/runtime?）、`DirectiveInterpretFailureCode`、`DirectiveInterpretResult`（成功=未采信 `candidate`+`confidence`+可选 `notes`；失败=稳定失败码）、`DirectiveInterpretFn`。
- 仅新增 `RuntimeKind` 的 type-only 导入；`runtime.ts` 不 import 本文件，依赖方向不变；无 I/O、不授予任何写权。

### 3.3 `src/pipeline/orchestration/govern-session.ts`（528 → 538 行，+10）

- 按既有 judge 同一纪律薄再导出 `createDirectiveInterpreter`、`DIRECTIVE_INTERPRET_MIN_CONFIDENCE`、`DIRECTIVE_INTERPRET_SUPPORTED_RUNTIMES` 与 `CreateDirectiveInterpreterOptions`；不改变 `openGovernanceSession` 任何行为。

### 3.4 `src/pipeline/orchestration/customer-directive.ts`（705 → 852 行，+150/-3）

- `CreateCustomerDirectiveRuntimeOptions` 增可选 `interpretDirective?: DirectiveInterpretFn`（缺省 ⇒ 只走既有确定性解析）。
- `DirectivePrefill` 增内部字段 `interpreted?: {confidence, notes?}`（只作诊断/测试；**不进冻结面板载荷/账本**）。
- 新增 `buildInterpretedPrefill`（402 行起）：按 B1 Service 同一组字段约束做保守规范化——approval 只接受 allow/deny + shell/domain/path（命令非空且 ≤1024B；域名为小写主机名且形状合法；路径绝对且无 `..`；**shell.cwd 恒为项目根，不采信模型给的目录**），decision 只接受 select-recommended/select-option（selector 非空、无换行、≤256B）/reject + 合法 flowId；until 仅三值；非法一律 `undefined`。最终落账校验仍在 B1 Service（不是第二份账本校验）。
- `doSubmit`（620 行起）：确定性解析先跑；`confirmable && unrecognized.length===0` ⇒ 沿用（向后兼容）；否则在正文非空、非撤销、且注入了解释器时调用一次；成功且 `confidence ≥ DIRECTIVE_INTERPRET_MIN_CONFIDENCE`（单一来源导入）才用其预填；注入实现抛错/失败/低置信/非法候选一律保留确定性结果（原文 + 未识别片段、确认禁用）。`/^撤销(?:\s|#|$)/` 正文**永不交解释器**（防止把撤销理解成授权）。
- 高危预览 `previewHighRisk` 逻辑未改：改为对最终预填（可能来自 AI）复算，forever/宽范围/项目级等规则与二次确认保留。

## 4. 行为变化（与客户规格逐条对应）

- 自然语言审批/决策：解释成功 ⇒ 面板预填 AI 解释；客户确认前**不落账**；确认后走既有 B1 `create`（id/回执/高危/双视图/消费语义不变）。
- 结构化写法（`允许 shell "…" once`、`选推荐项` 等）零变化，解释器不调用。
- 解释失败/不可用/低置信/非法候选：与改动前逐字一致的回退面板（确认禁用）。
- `撤销 #d-N` 快路径与撤销语义零变化；撤销正文不触发任何模型调用。
- 无新增自动放行：解释器没有可执行/可写工具；即使解释成功也必须客户在面板确认；高危仍需二次勾选。
- 两个 target 的消费者/隔离不变；decision 的项目级 `select-recommended` 在高危谓词中仍受「替我决策」开关快照影响（探针已覆盖）。

## 5. 测试与证据（原始输出）

证据目录：`角色卡/测试/docs/change/2026-11-04_customer-authorization-plane-nl-evidence/`

1. `node --test test/编排/directive-interpreter.test.ts` → **9/9 pass**（`01-directive-interpreter-test.log`）。
2. `node --test test/编排/customer-directive-interpret.test.ts` → **7/7 pass**（`02-customer-directive-interpret-test.log`）。
3. `node --test test/桌面应用/directive-input.test.ts` → **19/19 pass**（`03-directive-input-test.log`）。
4. 受影响套件批量（customer-directive / gate / interpret / interpreter / directive-input / directive-decision / customer-authorization-plane-integration）→ **89/89 pass**（`04-affected-suites.log`）。
5. 全量桌面+编排套件 `node --test test/桌面应用/*.test.ts test/编排/*.test.ts` → **1287 pass / 1 fail**（`09-full-desktop-orchestration.log`）；唯一失败为 `test/编排/shell-authorized-routine.test.ts` 的 Windows 符号链接 `EPERM`，在基线 worktree（customer-authorization-plane）复跑同样失败 ⇒ **环境限制、与本次改动无关**。
6. `npm run typecheck` / `npm run typecheck:renderer` / `npm run build:renderer` → 全部 exit 0（`05/06/07` 日志）。
7. 真实 Electron 探针（真实 preload/renderer/控制器/SessionManager/B1 账本，仅判断 AI 模型用桩件）：**38/38 checks、0 failures**；自然语言审批预填、决策预填+高危二次勾选、解释失败回退均有截图（`probe-run/report.json`、`10/12/14-*.png`）。
- 编号说明：08 号位为探针自记录的 `probe-run/report.json`（真实 Electron 探针自行写盘；沙箱不允许把 electron 输出重定向到日志文件，故以 report.json 为原始输出，不再另设 `08-*.log`）。

## 6. 候选哈希（2026-11-04 写定，未 commit）

- `src/model/directive.ts`：sha256 `b04aac321836da5ba30dc0101d2c37d2c34fd5a9c8a6a9ab9197eb8ad21b800d`
- `src/common/编排/directive-interpreter.ts`：sha256 `1f22628887620e19356b0c48aeeee94263f68fb59f20034825ae098e52f91462`
- `src/pipeline/orchestration/govern-session.ts`：sha256 `1fcb944ea4a32dabaf6a8b7dba97988e022ed8652c6ae1ef72d9038c6ca3446f`
- `src/pipeline/orchestration/customer-directive.ts`：sha256 `e48041eaaa3c1a50e478e325937f3f2a0d495e3a9807b629293f973715eef84a`
- `test/编排/directive-interpreter.test.ts`：sha256 `7096256c4303c4ebb40812da42bd27b6ce8f9919e56a0741e7be5473f9a50465`
- `test/编排/customer-directive-interpret.test.ts`：sha256 `f1925246f206bf50b30ce61b90b948f8792191e12383d957a74527b285108414`
- 本记录自身：哈希无法自引用内嵌，写定后的 sha256 随最终回报给出。

## 7. 风险与停止项

- **门控口径（客户已确认，2026-11-04）**：按 A 口径，自然语言解释**不受**「替我审批」/「替我决策」两个开关门控。依据：客户授权原话「授权提交并合并指令自然语言修复（不含发布），解释器门控口径按 A（不受两开关门控）。」理由：解释由客户显式写标记触发、AI 只预填、落账必须客户在面板确认，不属于自动代审批路径；现实现即 A 口径。若未来改口径，需另立任务（改动点仅 `SessionManager.interpretDirective`/控制器注入处）。
- 解释器每次提交按需构造（含一次项目配置载入与 adapter 工厂构造）；指令提交是低频客户动作，当前未做缓存；如后续成为热点可在 SessionManager 加 per-(project,runtime) 缓存。
- 解释超时 30s；面板出现前 Composer 处于提交中状态（既有提交态），未新增进度提示（i18n 停止规则）。
- 未改 B1 Service 校验器；解释预填只是保守门槛，最终仍由 Service fail-closed 拒绝非法确认值。
- 未改 Provider/消费者/账本格式；两个 target 的消费/撤销语义由既有测试与集成套件回归覆盖。
