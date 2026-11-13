# B7 配套：`operator-channel.test.ts` 源码钉并入 B0 聚合读取器（Q1 口径扩展）

- 日期：2026-11-13
- 角色：ANS 测试（B7 配套源码钉改指）
- 工作树：`.claude/worktrees/refactor-session-ts-b7`（分支 `refactor/session-ts-b7`，起点 `e37da80`）
- 方案依据：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §4.4（聚合读取器）、§5 B7（barrel 切换）、§6.2
- 桌面角色 B7 第一段记录：`角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-lifecycle.md` §7 D2 / §8.2 第 2 条
  （明确建议「把该文件并入 `readSessionSource()`（或将 14 钉清单扩为 15），然后删除迁移指针注释」）
- 边界：只改 `test/桌面应用/operator-channel.test.ts` 的读取方式 + 本记录；生产代码 / `session-source.ts` /
  其他测试 / boundary 均未触碰；未 commit/push、未触发 CI、未 tag、未触碰 `main`；未读 `.env`；未占用 9222/9223/9224。
- 状态：**改指完成；桶切换前/后均已验证（58/59，失败名与基线逐名一致）**；pin1–7 在终态聚合源码中全部成立（§3.1 / §4.4）。

## 1. 背景与任务

`test/桌面应用/operator-channel.test.ts`（「arm 决策（I-1 + 补丁）」用例，第 212 行起）在约第 232 行直接读取
裸 `app/desktop/session.ts` 源码文本（`sessSrc = fs.readFileSync(path.join(APP_DIR, "desktop", "session.ts"), "utf8")`），
随后对 7 段 shell 装配源码文本做钉住断言。B0 的 Q1 批准覆盖 14 个钉子文件，**不含本文件**；B7 桶切换后
`session.ts` 将成为 ≤50 行 barrel，直接读取将失效。本任务按 Q1 同口径（**只改读取方式、断言文本逐字不变**）
迁移到 B0 聚合读取器 `test/桌面应用/session-source.ts` 的 `readSessionSource()`。

## 2. 改指清单（唯一读取点）

| # | 位置（改后行号） | 原读取 | 新读取 |
| --- | --- | --- | --- |
| 1 | `test/桌面应用/operator-channel.test.ts:54` | —（新增 import） | `import { readSessionSource } from "./session-source.ts";` |
| 2 | `test/桌面应用/operator-channel.test.ts:233` | `fs.readFileSync(path.join(APP_DIR, "desktop", "session.ts"), "utf8")` | `readSessionSource()` |

`grep -n 'session.ts\|readSessionSource\|sessSrc'` 核对：本文件对 `app/desktop/session.ts` 的直接读取**仅此一处**；
其余 `readFileSync` 目标为 `main.ts` / `interface.ts` / `run-role.ts` / `preload.cjs` / `operator-channel.ts` /
`recovery-channel.ts`，不属本任务范围，未动。变量名 `sessSrc` 与后续全部断言逐字未变。

### 2.1 diff（`git diff -- test/桌面应用/operator-channel.test.ts`，2 insertions / 1 deletion）

```diff
@@ -51,6 +51,7 @@ import type { ShellJudgeFn, ShellJudgeOutcome, ShellJudgeRequest } from "../../s
 // G-2/W5（2026-10-16 客户批准）：恢复确认卡呈现端（与 shell 卡共享 `confirm-card.ts` 通用件——本组钉住
 // **恰 allow:true 才为真、等待不设限（裁定 4）、关窗/中止=未获执行** 的卡侧语义；执行桥在 dispatch-delivery 组）。
 import { createRecoveryConfirmPresenter } from "../../app/desktop/recovery-channel.ts";
+import { readSessionSource } from "./session-source.ts";
 
 /** 造一个请求（`OperatorPrompt`）——命令原文含 shell 元字符（本执行模型下只是普通参数，但人仍应逐字看到）。 */
 function req(command: string, argv: string[], cwd = "D:/proj", reason?: string): OperatorPrompt {
@@ -229,7 +230,7 @@ test("arm 决策（I-1 + 补丁）：DESKTOP_SHELL_GATE_ARMED === true——(c)
   const ifaceSrc = fs.readFileSync(path.join(APP_DIR, "desktop", "interface.ts"), "utf8");
   assert.ok(ifaceSrc.includes("shellOperatorChannel: deps.shellOperatorChannel"), "Interface 应把 (a) 通道透传给会话管理器");
   assert.ok(ifaceSrc.includes("shellArming: deps.shellArming"), "Interface 应把 (c) 实件透传给会话管理器");
-  const sessSrc = fs.readFileSync(path.join(APP_DIR, "desktop", "session.ts"), "utf8");
+  const sessSrc = readSessionSource();
   assert.ok(
     /if \(this\.deps\.shellOperatorChannel\) \{/.test(sessSrc),
     "session.ts：**(a) 通道对 su 也构造**（2026-10-17 审批档；不再有 role.builtIn 条件）"
```

结论：仅「新增 import + 读取构造替换」；断言文本、顺序、消息字符串零改动。

## 3. 断言清单与命中位置

`sessSrc` 上共 7 个 `assert.ok`（源码钉）。命中核验方法：用与读取器相同的拼接顺序枚举
`session.ts` + `session/**/*.ts` 各段（切换前 43 段 / 终态 44 段），逐 pin 求命中文件与行号；聚合结果同时以
`readSessionSource()` 实测（`ALL_PINS_PASS`）。

| # | 断言（逐字） | 期望 | 切换前命中（18:37 实测） |
| --- | --- | --- | --- |
| 1 | `/if \(this\.deps\.shellOperatorChannel\) \{/` | 命中 | `app/desktop/session.ts:420`（桌面角色迁移指针注释）；**真实实现** `app/desktop/session/lifecycle/open.ts:805` |
| 2 | `/role\.builtIn === true \? undefined : this\.deps\.shellArming/` | 命中 | `session.ts:421`（注释）；**真实实现** `lifecycle/open.ts:824` |
| 3 | `/const shellOperatorOnly =\s*role\.builtIn === true && this\.deps\.shellArming && shellOperatorChannel/` | 命中 | `session.ts:422`（注释）；**真实实现** `lifecycle/open.ts:848–849`（跨行构造，`\s*` 跨行命中） |
| 4 | `/\.\.\.\(shellOperatorOnly \? \{ shellOperatorOnly \} : \{\}\)/` | 命中 | `session.ts:423`（注释）；**真实实现** `lifecycle/open.ts:1291` |
| 5 | `!/const shellReadonly =/` | 不命中 | 全 43 段无命中（负钉成立） |
| 6 | `!/\.\.\.\(shellReadonly \? \{ shellReadonly \} : \{\}\)/` | 不命中 | 全 43 段无命中（负钉成立） |
| 7 | `/import type \{ AssembleOperatorShellGateOptions, AssembleReadonlyShellGateOptions, RoutineShellPolicy \} from "\.\.\/\.\.\/src\/pipeline\/orchestration\/shell-arming\.ts"/` | 命中 | **仅** `app/desktop/session.ts:303`（两级相对路径）；模块内同 import 为四级路径 `../../../../src/...`（`contracts/deps.ts:16`、`lifecycle/open-context.ts:58`、`lifecycle/open.ts:82`），**不匹配该字面正则** |

当前（切换前）聚合规模：43 段 / 1,314,535 字节。pin1–4 当时同时命中桌面角色在 `session.ts` 顶部保留的
「迁移指针」注释（其 D2 项）；该注释已随第二段桶切换删除，删除后 pin1–4 由 `lifecycle/open.ts` 真实实现承载
（见 §3.1）。

### 3.1 桶切换后命中（终态：2026-11-13 18:47，桌面角色第二段落盘后）

终态实测：`app/desktop/session.ts` = **30 行 barrel**（≤50 预算）、`app/desktop/session/index.ts` = 790 行门面；
聚合 44 段 / 1,289,260 字节；`readSessionSource()` 对 7 pin 实测 `ALL_PINS_PASS`。

| # | 终态命中位置 |
| --- | --- |
| 1 | `app/desktop/session/lifecycle/open.ts:805`（真实实现） |
| 2 | `app/desktop/session/lifecycle/open.ts:824` |
| 3 | `app/desktop/session/lifecycle/open.ts:848–849`（跨行构造，`\s*` 跨行命中） |
| 4 | `app/desktop/session/lifecycle/open.ts:1291` |
| 5 / 6 | 全段无命中（负钉成立） |
| 7 | `app/desktop/session.ts:6`——桌面角色在 barrel 中保留**真实** `import type { … } from "../../src/pipeline/orchestration/shell-arming.ts"` 行（纯类型、运行期擦除；barrel 注释注明 pin7 依赖该字面行） |

即：桶切换后 **pin1–6 全部由协作模块真实代码承载，pin7 由 barrel 本体的真实（非注释）import 行承载**；
「迁移指针」注释块已不存在。

### 3.2 后桶态模拟（切换前风险量化；终态未发生）

在系统临时目录构造「当前模块快照 + 纯再导出 barrel（无迁移指针注释、无两级 shell-arming import）」，
用 `readSessionSource(baseDir)` 实测 7 pin：**pin1–6 全部通过；pin7 失败**（`POST_BARREL_SIM_HAS_FAILURES`）。
原因：pin7 的正则要求**两级**相对路径 `from "../../src/pipeline/orchestration/shell-arming.ts"`，该字面行只可能
出现在 `app/desktop/` 层（即 `session.ts` 本体）。B7 第一段后该 import 在 `session.ts` 已无运行期使用
（原使用点 `RoutineShellPolicy` 随 `openInternalUnsafe` 迁至 `lifecycle/open.ts:472`），第二段 barrel 化时若删除，
pin7 将失效。处置建议见 §5，**断言文本未按本任务约束改动**。

> 模拟基于切换前模块快照、非桌面角色第二段最终产物。**终态实际结果：该最坏假设未发生**——第二段 barrel
> 在 `session.ts:6` 保留了该 import 行（见 §3.1），pin7 逐字成立。

## 4. 验证日志（本机）

环境：Windows 11 Pro 10.0.26300 / Git Bash。§4.1–§4.3 执行于 18:35–18:39，工作树处于 B7 第一段后、
**桶切换前**态（`app/desktop/session.ts` 实测 2,662 行门面类，`lifecycle/` 模块未跟踪；桌面角色并行写区为
本工作树 `app/desktop/session.ts` / `session/contracts/ports.ts` / `session/lifecycle/`，本角色未触碰）。
§4.4 执行于 18:48，桌面角色第二段（`session/index.ts` + 30 行 barrel）落盘并修正后。

### 4.1 基线（改指前，原测试直接读 session.ts）

```
node --test --test-timeout=120000 "test/桌面应用/operator-channel.test.ts"
ℹ tests 59 / pass 58 / fail 1 / cancelled 0 / skipped 0 / todo 0   (EXIT=1)
✖ I-1 补丁（**真正接通**核查）：真实 openRoleSession + 真实装配——(c) 实件在场时能力面产出 ShellGate（Pi 适配器 run_shell 注册条件成立）
  test at test\桌面应用\operator-channel.test.ts:298:1
  AssertionError: 会话应能开启（真实装配在此路径不触网）  false !== true
```

### 4.2 改指后（同一工作树、桶切换前）

```
node --test --test-timeout=120000 "test/桌面应用/operator-channel.test.ts"
ℹ tests 59 / pass 58 / fail 1 / cancelled 0 / skipped 0 / todo 0   (EXIT=1)
✖ 同名同一用例（行号因新增 import 顺延为 :299）——断言: 会话应能开启（真实装配在此路径不触网）
```

**失败名与基线逐名一致（NO_DIFF）**：唯一失败为该套件既有环境问题——链接工作树 `.git` 为文件，
「I-1 补丁（真正接通核查）」路径无法开启会话（桌面角色首线验证记录同样标注为 e37da80 基线既有）。
其余 58 项全绿，含本任务维护的「arm 决策（I-1 + 补丁）」源码钉用例。

### 4.3 读取器自测与 pin 覆盖

```
node --test --test-timeout=120000 "test/桌面应用/session-source.test.ts"
ℹ tests 5 / pass 5 / fail 0   (EXIT=0)
```

`readSessionSource()` 实测（见 §3）：`ALL_PINS_PASS`，43 段聚合含 pin1–7 所需全部文本（pin5/6 为负钉，
聚合中无命中即通过）。

### 4.4 桶切换后复跑（终态，18:48）

```
node --test --test-timeout=120000 "test/桌面应用/operator-channel.test.ts"
ℹ tests 59 / pass 58 / fail 1 / cancelled 0 / skipped 0 / todo 0   (EXIT=1)
✖ I-1 补丁（**真正接通**核查）…（test at :299:1）
  AssertionError: 会话应能开启（真实装配在此路径不触网）  false !== true   （断言点 :339:10）
```

与基线**逐名一致（NO_DIFF）**；行号 +1 仅因新增 import 行（基线 :298 / 断言 :338）。其余 58 项全绿，
含本任务维护的「arm 决策（I-1 + 补丁）」源码钉用例（7 个 pin 全过）。终态 pin 覆盖见 §3.1（`ALL_PINS_PASS`）。

**并行瞬时态披露（如实，不计入结果）**：18:42 早信号复跑时桌面角色第二段刚落盘（`session/index.ts`
首版写于 18:41:51），其中 28 处 `from "../../src/…"` 相对路径未按新目录深度调整（从 `app/desktop/session/`
解析到 `app/src/...`），导致 `ERR_MODULE_NOT_FOUND`、文件级 1 test / 1 fail；属搬运瞬时态。桌面角色于
18:44:46 修正路径（终态该两层级 import = 0 处）后，复跑恢复 58/59。本角色未触碰其写区文件。

## 5. Q1 扩展披露与待决项

1. **Q1 扩展**：本文件**不在** B0 已批准的 14 个源码钉子清单（`2026-11-13_refactor-session-ts-b0-baseline.md` §6）
   内。B7 桶切换使直接读取 `session.ts` 必然失效，本改指为该批次的**必要收口**；口径与 14 钉完全一致
   （只改读取方式、断言文本逐字不变），相当于将钉子清单扩为 **15**（桌面角色 D2 建议的两种方案之一）。
2. **pin7 依赖（已按方案 a 解决）**：pin7 字面要求两级路径 import 行。第二段 barrel 已在
   `app/desktop/session.ts:6` 保留**真实** `import type { … } from "../../src/pipeline/orchestration/shell-arming.ts";`
   行（纯类型、运行期擦除、无行为影响），pin7 在终态逐字成立（§3.1）。剩余约束：该行若日后被删除，pin7 将失效；
   届时应按 Q1 扩展另行批准路径适配（如 `(?:\.\.\/)+src\/pipeline\/orchestration\/shell-arming\.ts`，断言语义不变）
   或另行裁定，不得静默删除。本任务约束不允许改断言文本，故未实施任何断言改动。
3. 桌面角色「迁移指针」注释（切换前位于 `session.ts:415–423` 一带）已随第二段删除（终态 barrel 中不再存在）；
   pin1–4 由 `lifecycle/open.ts` 的真实实现承载（§3.1 已核验）。

## 6. 写入清单

- 修改：`test/桌面应用/operator-channel.test.ts`（+2/−1，见 §2.1）
- 新增：本记录
- 未触碰：生产代码、`session-source.ts`、其他测试、boundary；未 commit/push/CI/tag。
