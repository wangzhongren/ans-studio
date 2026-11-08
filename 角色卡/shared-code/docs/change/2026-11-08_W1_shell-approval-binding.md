# W1 共享证据件 `shell-approval-binding`：证据

- **任务**：W1（共享证据件）——实现 `src/common/shared/shell-approval-binding.ts` + 配套共享单测 + 共享组件目录更新（任务 ID `2026-11-08-session-admission-approval`，flowId `session-admission-approval-based`）
- **角色**：`shared-code`（共享代码维护角色，固定 worker 上下文）
- **日期**：2026-11-08
- **检出**：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（worktree；分支 `feat/plan-escalation-card`；HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`）
- **性质**：本角色自证证据，**不是验收结论**（B2 独立验收按 B1 v1 判定）；不授权/不执行提交、推送、合并、发布；未运行真实模型。
- **自引用声明**：本文件不嵌入自身 SHA-256（落盘后由完成报告/验收复算）；其余文件 hash 均为写盘后原字节复算（`sha256sum`）。

---

## 1. 输入（本批开工时实测）

| 输入 | 路径 | 行数 / 字节 / SHA-256（本次实测） |
| --- | --- | --- |
| 派发与接口评审（I0） | `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md` | 81 / 12046 / `88938f29cfb25e92f16b4f3fb2057e92c769875105749019fb2c0a22369a9968` |
| 设计 **P1.3**（当前基线） | `docs/planning/2026-11-08_design_session-admission-approval-based.md` | 855 / 130013 / `2553b97ac2338c786f17c860153c1b30abc874c4ffc84392954a5d7f949166e3`（与派发记录一致） |
| 复核记录（F8/R1–R3/R8a–R8c） | `docs/planning/2026-11-08_review_session-admission-approval-based.md` | 193 / 53879 / `817ebc9de73f825f474b42a8f714866bd1d5ddd9b0348e14a2c6f0b3b44d122d`（一致） |
| B1 v1（唯一判据） | `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md` | 185 / 29020 / `fb88112627c3a5361934a1d3810bea2866b60305d67af6dd8cf39307cce8e1c1`（一致） |
| 现状只读参考 | `src/common/编排/shell-gate.ts`（`CreateShellGateOptions`/构造期守卫/`buildShellGate`）、`src/common/编排/shell-audit.ts`（`ShellAuditSink`/`createFileAuditSink`/`createMemoryAuditSink`）、`src/service/runtime/session.ts:319-329`（WeakMap 先例 `blockedRoleCapabilities`） | 只读，未修改 |

---

## 2. 写集与产出（逐文件 SHA-256，写盘后复算）

| # | 文件 | 类型 | 行数 | 字节 | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/common/shared/shell-approval-binding.ts` | 新增共享组件 | 287 | 13627 | `8fdcda39f74a1c06a954703d20e083e46bba8f539903485e934ec7d2e395926d` |
| 2 | `test/项目管理/shared/shell-approval-binding.test.ts` | 新增专属单测（19 例） | 386 | 16653 | `1ea506b67532cfb012c82111214c88dfe86364f0e80e68363ad99199400b56e4` |
| 3 | `角色卡/shared-code/docs/architecture/shared-components.md` | 共享组件目录更新（11→12 项；§2.12；§3.2/§4/§6） | 231 | 48810 | `4c0fbe162d788e1ff77d8bd74fd20a7c89e84864a5d526e96f12e30f318a4b59` |
| 4 | `角色卡/shared-code/docs/change/2026-11-08_W1_shell-approval-binding.md` | 本证据 | 见落盘报告 | 见落盘报告 | 见落盘报告 |

**写集核对**：仅上述路径变更；`git status --porcelain` 对本角色写集显示为 `M shared-components.md` + 两个 `??` 新文件，无写集外改动（工作树既有其它角色的未提交改动与本批无关，未触碰）。未修改任何既有共享组件、编排/门禁/引擎代码、角色卡/边界/方案/验收/沟通/调度文件。

---

## 3. 实现摘要（模块语义）

- `registerShellApproval(gate, facts, sink)`：仅登记函数、`facts`、sink。登记时执行：
  1. gate 必须是函数；同一 gate 重复登记 ⇒ 抛错（登记点唯一在 `createShellGate` 构造成功后）；
  2. **白名单投影**：只复制 `source/version/projectRoot/mode/classifier/rules/pmAsk/operatorChannel/takeGrant/takeDirective/routinePolicy/audit/escalation`；白名单外字段（含凭据/环境）⇒ 抛错，不静默携带；
  3. 形状校验 fail-closed：`source==="orchestration-shell-gate"`、`version===1`、`mode` ∈ 四档、8 个通道布尔、`projectRoot`/`relPath` 非空字符串或省略、`audit.sink` ∈ {file,memory,custom}、`durable` boolean；
  4. **拒绝 probe 回填**：`facts.audit.probe` 必须为 `"unknown"`（`"ok"`/`"unavailable"` 均拒绝）；
  5. 生成**新对象**（不保存调用方引用）并**深度冻结**（外层 + `audit`）；sink 引用只存模块私有 WeakMap，不出现在任何返回 facts 中。
- `inspectShellApproval(gate)`：同步返回冻结基础事实（`probe` 恒 `"unknown"`）；未登记/非函数 ⇒ `undefined`。
- `probeShellApproval(gate)`：**无值入参**（仅 gate；额外实参被忽略，测试钉死 `length===1` 与附带值不生效）。未登记 ⇒ `undefined`；已登记：内部 `await sink.probe()`，无 sink / 无 `probe()` / 抛错（异步或同步）/ 返回非三态值 ⇒ `"unavailable"`；结果生成新的冻结事实副本（`inspect` 仍返回 `"unknown"` 基础事实）；同一 gate **并发共享同一 promise**、**结果冻结 memoize**（后续调用返回同一 promise，`sink.probe` 仅执行一次；失败结果同样 memoize——恢复需新 gate/新会话）。
- `SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE`（`Symbol.for("ans.shell-approval-binding.SHELL_APPROVAL_TEST_ALLOW_NON_DURABLE")`）：测试私有；载体 = **sink 对象**的非枚举自有属性；`hasShellApprovalTestNonDurableAllowance(sink)` 只认非枚举自有属性（可枚举设置不构成通道）；**生产装配不得设置**、生产公共出口不得再导出。
- 模块**零 import**（自包含结构类型 `ShellApprovalProbeSink` 等），不依赖 `src/model/` 之外的任何层（I0-9）。

---

## 4. I0 确认（逐条）

| # | 结论 | 本批实现/证据 |
| --- | --- | --- |
| I0-1 | `registerShellApproval(gate, facts, sink)` 签名与唯一登记点 | 签名逐字一致；模块无其它登记入口；文档/头注写明「仅由 `createShellGate` 在构造成功后调用一次」；重复登记抛错并以单测覆盖。`buildShellGate`/`assemble*` 不参与 probe 值传递——本模块不存在 probe 值入口，后续接线（W1b）只能传 `projectRoot`/sink。 |
| I0-2 | 测试私有 Symbol 挂 **sink 对象**非枚举属性；宿主=本模块；不得经生产出口再导出；生产装配不得设置 | Symbol 由本模块导出；`hasShellApprovalTestNonDurableAllowance` 只认自有非枚举描述符；单测断言 Symbol 仅出现在 `src/common/shared/shell-approval-binding.ts`（定义）与允许的 `src/common/编排/shell-gate.ts`（内部只读检查），并断言非宿主文件不得 `Object.defineProperty`/对象字面量设置；`src/service/gate/shell-rules.ts` 不含 Symbol 名与 `shell-approval-binding` 引用。模块注释与测试均写明「生产装配不得设置」。 |
| I0-3 | 未登记 ⇒ `undefined`；已登记但无 sink/无 probe()/抛错 ⇒ 冻结 facts 且 `probe:"unavailable"`；并发共享同一 promise、冻结 memoize；无接受 probe 结果值的 API | 单测覆盖：未登记 inspect/probe 均 `undefined`；无 sink、custom 缺 probe、异步/同步抛错、非法返回值 ⇒ `"unavailable"`；并发 `p1===p2` 且 `probe` 调用 1 次，完成后同 promise；导出面固定断言（仅 5 个运行时导出，无 finalize 类 API）；`audit.probe` 登记时非 `"unknown"` 一律拒绝。 |
| I0-9 | 只依赖 `src/model/` 或自包含结构类型；不 import 编排/门禁私有 | 模块零 import（静态断言：无 `import` 语句/动态 `import(`/`from "…"`）；事实与 sink 类型在本文件定义；消费方按结构类型兼容（后续 W1b/W2-R 接线）。 |
| I0-8（E3） | 本件 owner=shared-code，路径 `src/common/shared/shell-approval-binding.ts` | 路径与 owner 一致。 |
| I0-10 | 不重开 I0；新增偏差须停止回报 | 本批**无偏差**（见 §8）。 |

---

## 5. 受影响套件实施前后对照

命令（共享测试单源；Node `v24.22.1`，npm `11.19.1`，Windows 11）：

```
node --test "test/项目管理/shared/**/*.test.ts"
```

| 时点 | tests | pass | fail | cancelled | skipped | todo | 退出码 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **实施前**（本批开工时，未改任何文件） | 199 | 194 | 0 | 0 | 5 | 0 | 0 |
| **实施后** | 218 | 213 | 0 | 0 | 5 | 0 | 0 |
| 增量 | **+19** | **+19** | **0** | 0 | **0** | 0 | — |

- 新增测试文件单跑：`node --test "test/项目管理/shared/shell-approval-binding.test.ts"` → **19 tests / 19 pass / 0 fail / 0 skipped**，退出码 0。
- skipped 5 为 `atomic-write.test.ts` 既有 Windows 平台按设计跳过，前后一致；**新增确定性失败 = 0、新增 skip = 0**；未删除/放宽任何既有断言，未加 skip/force-exit。
- 说明：按派发纪律，本批只做**受影响套件**对照；全量 T3 回归由 D1/E3 按团队计划执行，不在 W1 范围。

---

## 6. `npm run typecheck`

```
> ans-cli@1.9.2 typecheck
> tsc --noEmit
```

- 退出码 **0**，无诊断输出（覆盖 `src`/`test`/`app`，`app/renderer` 除外）。

---

## 7. 共享单测覆盖清单（19 例）

| 组 | 用例 |
| --- | --- |
| 登记/身份 | 未登记 inspect/probe 均 `undefined`（含非函数入参不抛错）；登记后白名单事实逐项（`probe:"unknown"`、`relPath` 省略时无该键）；不同 gate 事实互不串用（同形不同函数=不同身份）；重复登记拒绝；gate 非函数 TypeError 且失败登记不写入 |
| 投影/冻结 | 外层与 `audit` 深度冻结（赋值/删除抛 TypeError）；登记后再改调用方原对象不影响副本；白名单外字段（凭据/环境）拒绝；`audit.probe` 回填 `ok`/`unavailable` 拒绝；非法形状（source/version/mode/boolean/projectRoot/sink/durable/relPath）逐项拒绝 |
| probe | 无值入参（`length===1`、附带 `"ok"` 被忽略、`sink.probe` 不接收参数）；并发共享同一 promise（`p1===p2`、probe 1 次）；完成后 memoize（同 promise）；结果另成冻结事实（inspect 仍 `unknown`，其余字段与基础事实一致） |
| sink 三态 | memory 事实透传（probe ok）；custom 缺 probe、无 sink、异步抛错、同步抛错、非法返回值 ⇒ `unavailable`；`unavailable`/`unknown` 透传；memory/durable:false 事实如实投影（准入策略不在本模块） |
| Symbol/静态断言 | Symbol 非枚举载具（`Object.keys`/`JSON.stringify`/展开均不出现）；可枚举设置不认可；非对象/缺失 ⇒ false；Symbol 不得经生产公共出口导出、非宿主生产文件不得设置（扫描 `src/**`）；`shell-rules.ts` 不含 Symbol/模块名；模块导出面固定（无 finalize 类 API）；模块零 import（依赖方向） |

---

## 8. 消费者影响清单与偏差声明

**消费者（只读导入；接线在后续批次）**：
1. 编排 `src/common/编排/shell-gate.ts`（W1b）：`createShellGate` 构造成功后 `registerShellApproval(gate, baseFacts, opts.audit)`；`buildShellGate`/`assemble*` 只传 `projectRoot`/sink。
2. 运行时核心 `src/service/runtime/session.ts`（W2-R）：`prepareRole` 先 `inspectShellApproval`（绑定/项目根）再 `await probeShellApproval`（`file+durable+probe ok`）；`bindPreparedRole`/`verifyScope` 复用同一冻结结果（`protected-scope-approval-chain-changed`）。
3. 测试：`test/项目管理/shared/shell-approval-binding.test.ts`（本批）；后续 W1b/W2-R 的装配/准入测试可经 public entry 只读消费。

**偏差声明：0**。本批未发现需要偏离 I0/设计 P1.3 的事项；模块形状/语义逐条按 I0-1/I0-2/I0-3/I0-9 实现。

**限制（如实）**：
- 本批**未**修改 `shell-gate.ts`/`session.ts`/`shell-arming.ts`/`run-role.ts`（属 W1b/W2-R 写集）；file sink 的 `probe()`/`describe()`（含一次 F-6-1 refresh 重试）由编排在 W1b 实现并在那时测试，本批测试以注入桩件覆盖 memory/custom/缺失/抛错三态。
- 未运行全量 T3、未做真实运行（D1/E3/RR 阶段）；未提交/推送/合并/发布。
- 证据边界：本模块只证明「当前进程内 gate 由 `createShellGate` 构造并登记了这些事实/sink」，不证明 native 效果闭包，不覆盖其它进程/绕过，不防御恶意宿主代码。

**共享 API 变更评审记录位置**：`docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md` §二 I0（I0-1/I0-2/I0-3/I0-9）；设计 `docs/planning/2026-11-08_design_session-admission-approval-based.md` §2.3/§4.1/§4.4；复核 `docs/planning/2026-11-08_review_session-admission-approval-based.md` §F8/R1–R3/R8a–R8c；B1 `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md` §0.3/AC-12/AC-27。组件目录登记：`角色卡/shared-code/docs/architecture/shared-components.md` §1 #12/§2.12/§4。

---

## 9. D1 修复：i18n `entryForeground` 键（2026-11-08 追加）

- **触发（D1 实测，本角色复现一致）**：W5-U 在 `app/renderer/src/chat/judge.ts:106` 硬编码中文「前台命令」，shared 套件出现 1 个确定性失败：`[i18n-guard] scanned=146 allowlisted=23 violations=1`（`test/项目管理/shared/i18n-guard.test.ts`「硬编码守卫」用例红；修复前 shared 套件 218 tests / 212 pass / 1 fail / 5 skipped）。该文件不在 shared-code 写集，**未由本角色修改**；**allowlist 未改动**（守卫未放宽）。
- **修复（仅 shared-code 写集，最小加法）**：
  1. `src/common/shared/i18n/messages/zh-CN.ts`：成对新增 `"ui.judge.entryForeground": "前台命令"`；
  2. `src/common/shared/i18n/messages/en-US.ts`：成对新增 `"ui.judge.entryForeground": "Foreground command"`；
  3. `test/项目管理/shared/i18n.test.ts`「key 分区计数」同步（该用例自身规则：新增 key 必须显式更新断言）：ui 1211→1212、总计 1916→1917（标题与断言同步；未放宽任何断言）。
  4. 命名沿用既有 `ui.judge.*` 约定；未新增其它 key。
- **验证（当前快照；W5-U 已把 `judge.ts` 改为 `translate(locale, "ui.judge.entryForeground")`——该修改由桌面UI角色完成，不在本角色写集）**：
  - `node --test "test/项目管理/shared/**/*.test.ts"` → **218 tests / 213 pass / 0 fail / 0 cancelled / 5 skipped / 0 todo，exit 0**；`[i18n-guard] scanned=146 allowlisted=23 violations=0`。
  - `node --test "test/项目管理/shared/i18n.test.ts"` → 13/13 pass（含 zh/en parity、英文零 Han、分区计数）。
  - key 解析实测：`translate("zh-CN", "ui.judge.entryForeground")` → 「前台命令」；`translate("en-US", …)` → "Foreground command"。
  - `npm run typecheck` → **exit 0**。
- **D1 修复文件（写盘后原字节复算）**：

| 文件 | 行数 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | 2379 | 184580 | `6d5b1ef45261e86e8292e4981086807191a23a357507ff26355d1cbdadac51a3` |
| `src/common/shared/i18n/messages/en-US.ts` | 2647 | 198014 | `4c63f9b5e7ec1c3ae89abc41b089bb744b2af69ca1f7a1f77f34c9acea608dc7` |
| `test/项目管理/shared/i18n.test.ts` | 1204 | 63347 | `914db2a2bc23f86dfd8a8b3070612894d496cdb27116390c7729832dcf1cd9f4` |

- **计数口径核对**：新增恰 1 个 `ui.*` 键 ⇒ ui 1211→1212、总计 1916→1917；已用 `Object.keys(zhCN)` 直接计数复核（`{"ui":1212,"main":640,"shared":62,"preferences":3}`，total 1917），并与 `i18n.test.ts` 13/13 绿一致（协调消息曾提及 1213/1918，经更正为 1212/1917，以实测为准）。
- **偏差**：D1 修复为授权的最小测试同步（+1 键 = 计数 +1；未删/未放宽任何断言），**偏差=0**；仍未提交/推送/合并/发布，未修改 `app/renderer/` 与 allowlist。
