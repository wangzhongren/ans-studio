---
id: change-background-tasks-test-verify
type: change
title: 后台任务 B1–B4 独立测试验证——新增/回归/类型检查与真实装配路径跨角色联调
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: verified
related: [background-tasks, background-tasks-acceptance, background-tasks-runtime-core-change]
events:
  - date: "2026-10-22"
    kind: verified
    summary: 独立重跑新增 31 例与 shell 回归 44 例全过、typecheck 0；自建 12 例经真实 openRoleSession/Service/ShellGate 装配验证启动-跨轮-读取-停止、并发顺序、拒绝零 spawn、未知任务、截断、Windows 进程树、回合中止与 dispose；范围与 O1–O5 核对通过；发现 2 项低严重度观察（文档陈旧、bindRole 失败后同角色重试的管理器生命周期），真实 CLI/桌面+模型与 POSIX 平台缺失证据
---

# 后台任务 B1–B4 独立测试验证

**结论先行：在下列候选、环境与已列证据范围内，运行时核心交付的 B1–B4 通过测试角色的独立验证。** 没有发现阻断性问题；2 项低严重度观察（文档、极端重试路径）见第八节；真实 CLI/桌面 + 真实引擎/模型轮次与非 Windows 平台属**缺失证据**（第九节），本报告不把它们当成通过。测试通过只说明测过的场景通过，不代替独立验收结论与客户业务确认。

## 一、候选身份

| 项 | 值 |
| --- | --- |
| 仓库 | `C:\Users\51054\Desktop\work\ans-studio`（Windows 11 Pro 10.0.26300，Git Bash / MINGW64_NT-10.0-26300 x86_64） |
| HEAD | `4d944e7587f10be29b6356c42539e06219ed88fc`（未提交、未切分支） |
| 设计版本 | `角色卡/项目管理/docs/design/2026-10-22_design_background-tasks.md`，`status: accepted`；实测 SHA-256 `4471bd831c739010163f857ba58eb2496ea3e1a62d164e36b3ea560358f9f5f1`，与验收标准 A1 引用一致 |
| 测试依据 | 设计 §九；独立验收标准 A1（S1–S6 / F1–F10 / CC1–CC3 / E1–E7）；运行时核心 change 记录 |
| 环境 | Node v24.22.1 / npm 11.19.1；`node_modules` 为既有 `npm ci` 结果；未使用真实凭据/API key；仓库无 `.env` |
| 工作树（产品） | 修改：`src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、`src/service/runtime/session.ts`；新增：`src/common/runtime-core/background-tasks.ts`、`src/common/runtime-core/process-tree.ts` |
| 工作树（测试） | 修改：`test/runtime-core/tools.test.ts`（Windows junction 夹具适配）；新增：`test/runtime-core/background-{tasks,review,engines,contract}.test.ts`、`background-fixtures.ts`；本角色新增 `test/测试/background-tasks-entry/` |
| 工作树（文档） | 运行时核心 feature-map / memo / feature / change；独立验收与项目管理的设计/导航；均属各自角色文件，非产品代码 |
| 证据目录 | [2026-10-22-background-tasks-verify-evidence](2026-10-22-background-tasks-verify-evidence/)（原始输出、范围与静态核对） |

## 二、实际执行的命令与结果

所有命令 cwd 均为仓库根；Node/npm 通过 `export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"` 引入。

| # | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| 1 | `node --test --test-timeout=120000 test/runtime-core/background-tasks.test.ts test/runtime-core/background-review.test.ts test/runtime-core/background-engines.test.ts test/runtime-core/background-contract.test.ts` | **0** | **31 tests / 31 pass / 0 fail / 0 skip / 0 todo**（与实施自报一致） |
| 2 | `node --test --test-timeout=120000 test/runtime-core/shell-exec-timeout.test.ts test/runtime-core/shell-guard.test.ts test/runtime-core/tools.test.ts test/runtime-core/session.test.ts` | **0** | **44 tests / 44 pass / 0 fail / 0 skip**（与自报一致；`killProcessTree` 搬迁回归） |
| 3 | `npm run typecheck` | **0** | 输出仅 `> ans-cli@1.5.0 typecheck` / `> tsc --noEmit`，无诊断 |
| 4 | `node --test --test-timeout=120000 "test/测试/background-tasks-entry/background-entry.test.ts"`（本角色独立用例） | **0** | **12 tests / 12 pass / 0 fail / 0 skip**（见第三节） |
| 5 | `node --test --test-timeout=120000 "test/runtime-core/*.test.ts"`（可选全量） | **1** | **282 计 / 275 过 / 3 失败 / 4 跳过**；3 红均为 Windows 无 symlink 权限的既有环境红（`file-write-safety.test.ts` 1、`session-store.test.ts` 2，均 `EPERM: symlink`；两文件相对 HEAD **零 diff**）；4 skip 为平台条件（`file-write-safety` 3 条 POSIX 专属 + `boundary-write-guard` 1 条 Windows 专属）。与自报数字一致，未把红算作通过 |

原始输出：[new-tests.log](2026-10-22-background-tasks-verify-evidence/new-tests.log)、[shell-regression.log](2026-10-22-background-tasks-verify-evidence/shell-regression.log)、[typecheck.log](2026-10-22-background-tasks-verify-evidence/typecheck.log)、[independent-entry-tests.log](2026-10-22-background-tasks-verify-evidence/independent-entry-tests.log)、[runtime-core-full.log](2026-10-22-background-tasks-verify-evidence/runtime-core-full.log)、[exit-codes.txt](2026-10-22-background-tasks-verify-evidence/exit-codes.txt)。

新增四件套逐条测试名与通过状态已在原始日志；新增文件无 `.skip`/`todo`（静态核查）。第 1 条命令属于**复跑开发者自测**，不是本角色独立设计，结论只证明其所述场景在当前候选上确实通过。

## 三、跨角色/真实装配路径独立验证（`test/测试/background-tasks-entry/`）

目的：不用真实模型/API key，走**真实 Pipeline `openRoleSession` → 真实 Service `createRuntimeAdapter`（管理器创建、四工具注册、回合包装、dispose 接线）→ 真实只读档 `ShellGate` 装配**，只在引擎处用替身 `RuntimeAdapter`（记录并调用注入的 `options.tools`）。文件：`test/测试/background-tasks-entry/{fixture.ts,background-entry.test.ts}`。

| 用例 | 覆盖 | 实际观察 |
| --- | --- | --- |
| 入口主流程（项目角色 X + 只读档 ShellGate） | S1、S2、S4、F8、F10、B1/B4 | `start_background_task` 立即返回 `ok:true`、`bg-1`、真实 pid、`running`；回合结束（settled）后进程仍存活；下一轮 `list` 显示 running、`read` 读到 stdout/stderr 尾部且状态 running；`stop` 返回 stopped 并观察到进程消失；再次 stop 返回「早已结束」且不含「已停止任务」。审核请求 argv 与 `splitCommand` 同源（`argv[0]=node`、`argv[1]=-e`）；子进程 cwd=项目根、哨兵凭据未泄漏。显示规则：start=`core-command-v1`，list/read/stop=`none`；schema：start 仅 required `command` 且无 `cwd`，read required `taskId` 且无 `cursor`/`wait` |
| 无 ShellGate 会话 | F9 | 四工具与 `run_shell` 均不存在；`write_file` 等普通工具正常存在（对照） |
| shellJudge 判断会话（`createShellJudge` 真实构造） | F9 | 工具集含 `judge_read_file`/`judge_list_dir`/`report_shell_judgement`，不含四后台工具与 `run_shell`；未交结论时 verdict=`manual`（不伪造 allow/deny） |
| governanceJudge 判断会话（Service 装配） | F9 | 含 `report_governance_judgement`，不含四后台工具与 `run_shell` |
| 第 9 个并发启动 | F4、CC1、S6.1 | 前 8 个全部启动；第 9 个 `ok:false`（上限文案）；分类器调用数恰 8、`shell.review.start` 恰 8 条（第 9 个**零审核请求**）；诊断 `background.limit` 带 `reasonCode=concurrency-limit`、`count=8`；同一回合 list 计数仍为 8 |
| 真实只读档分类 deny | F2/F3、B2 | 工具返回「未启动/审核拒绝」，分类器恰调用 1 次，哨兵文件未创建（零 spawn），无 `background.start`，list 为「没有后台任务」 |
| 未知任务号 | F6 | `read`/`stop("bg-404")` 均 `ok:false`，文案含「未知任务」「不要假设它运行过」 |
| 日志截断 | S2.3、S6.3 | 单路 270 KB（90,000×「汉」）+尾标记：工具读取标 `truncated`，保留 `TAIL-END`，无 U+FFFD 损坏字符，状态 exited |
| 进程树终止（Windows 实测） | B3、S2.4 | 父进程另起孙进程并打印其 pid；`stop` 后父与孙均消失（`taskkill /T /F` 路径实际执行） |
| 回合中止 + dispose | S3、S4 | 回合进行中 `handle.abort()`：send 以中止拒绝，后台 pid 仍存活；下一轮 list 仍 running；连续两次 `dispose()` 均成功且 pid 被清理 |
| spawn 失败 | F5 | 不存在的可执行文件：`ok:false`「进程启动失败/未启动」，list 为空（无半成品任务），随后正常启动成功 |
| kill-timeout 诚实文案 | F7 | 受控 spawn/kill 替身（不产生 close）：stop 实际等待 ≥1200ms 后 `ok:false`、state=`kill-timeout`、文案含「可能仍在运行，请如实告知客户」且不含「已停止任务」；诊断记录 `background.stop.timeout` |

## 四、覆盖矩阵（对照 A1，区分证据性质）

| 标准 | 覆盖方式 | 状态 |
| --- | --- | --- |
| S1 立即返回任务号/pid | 独立入口主流程；复跑开发者 S1/S2 | 通过 |
| S2 list/read/stop/截断/自然退出 | 独立入口主流程 + 截断用例；复跑开发者 S2/S2.5/S2.3 | 通过 |
| S3 dispose 清理/幂等/关闭后拒绝 | 独立回合中止+双 dispose；复跑开发者 S3 两例 | 通过（关闭后 start 的拒绝由开发者 manager 用例覆盖，见第 1 条命令） |
| S4 轮次中止不杀任务 | 独立 `handle.abort()` 场景 + 复跑开发者 S4 | 通过 |
| S5 三引擎可见性 | 复跑开发者 `background-engines.test.ts`（Claude/Codex/Pi 实际注册路径，离线假引擎）；适配器零 diff 静态核对 | 通过（开发者设计，本角色仅复跑+静态核对） |
| S6 上限/淘汰/缓冲/预算 | 并发独立；保留 32、并行原子性、kill-timeout 预算由开发者用例复跑；256 KiB/200 行独立 | 通过 |
| F1 空命令 | 复跑开发者 F1/F2 | 通过（开发者设计） |
| F2 F-7 守卫 | 复跑开发者；入口 deny 独立 | 通过 |
| F3 审核拒绝/undefined/抛错/超时 | 复跑开发者四类；入口只读档 deny 独立 | 通过 |
| F4/CC1 并发在 ShellGate 前 | **独立**入口场景（分类器与审核事件双计数） | 通过 |
| F5 spawn 失败 | **独立**入口场景 | 通过 |
| F6 未知任务 | **独立**入口场景 | 通过 |
| F7 kill-timeout 文案 | **独立**受控替身用例（真实计时路径） | 通过 |
| F8 凭据剥离/cwd | **独立**入口场景（哨兵变量 + cwd 实测） | 通过 |
| F9 判断/无 ShellGate 不可见 | **独立**三场景（无 ShellGate、shellJudge、governanceJudge） | 通过 |
| F10 已结束任务 stop | **独立**第二次 stop + 复跑开发者自然退出用例 | 通过 |
| CC1 并发顺序 | 同 F4 | 通过 |
| CC2 功能文档可导航 | 阅读核对：`docs/feature/background-tasks.md` 存在、含流程图/分支/限制/历史链接；`feature-map.md` 有导航行；change 链接功能与 A1 | 通过（含第八节 P3-1 文档陈旧说明） |
| CC3 诊断白名单/不改共享文件 | 静态核对 `FIELD_NAMES` 含全部使用字段、无 `taskId`；`diagnostics.ts` 零 diff；复跑开发者 CC3 用例 | 通过 |

## 五、范围核对（E4）

原始输出：[status-and-scope.txt](2026-10-22-background-tasks-verify-evidence/scope/status-and-scope.txt)。

- **产品改动全部落在运行时核心 Section 1**：`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`src/service/runtime/session.ts`、`src/common/runtime-core/`（两个新文件）、`test/runtime-core/`（本角色自有测试）。`角色卡/测试/...` 为本角色新增，属本角色边界。
- **零 diff 已核对（`git diff --stat` 输出为空）**：`src/provider/claude/`、`src/provider/codex/`、`src/provider/pi/`、`src/common/pi-adapter/`、`src/common/shared/diagnostics.ts`、`app/`（O1/O5 相关面）。
- **O1–O5 未实施**：`app/` 无任何改动；管理器无 `node:fs`/写盘/`.ans` 访问（O2 日志不落盘）；`read_background_task` schema 无 `cursor`/`wait`（O3）；`ShellReviewRequest` 无字段变化（O4，`git diff` 无相关行）；运行时核心与 `app/` 无 `process.on("exit")`/`beforeExit` 退出钩子（O5）。静态证据：[static-checks.txt](2026-10-22-background-tasks-verify-evidence/scope/static-checks.txt)。
- 其他角色文件（运行时核心 feature/memo/change、独立验收与项目管理文档）由各自角色维护，非产品代码，不计入运行时核心产品范围。

## 六、静态契约核对（E7 补充）

| 项 | 观察 |
| --- | --- |
| `killProcessTree` 单一实现 | 全 `src/` 恰一处定义（`src/common/runtime-core/process-tree.ts:12`）；`src/provider/runtime/tools.ts:81` 从该模块导入，`run_shell` 与后台管理器共用；搬迁代码与删除的私有函数逐字一致 |
| 注册条件 | `buildGovernedTools` 中四工具仅在 `shellGate !== undefined` 且 `options.backgroundTasks !== undefined` 时一起注册；判断会话走 `buildShellJudgeTools`/`buildGovernanceJudgeTools` 结构性绕开（入口独立测试三场景实证） |
| 外部不能注入管理器 | `RuntimeSessionOptions` 以 `Omit<…, "backgroundTasks">` 排除；Service 在 `providerFor` 用自建实例覆盖 spread 中的同名字段 |
| 诊断字段 | `background.start/exit/stop/stop.timeout/limit` 使用字段 `{turnId, toolCallId, toolName, pid, state, exitCode, signal, durationMs, reasonCode, count}`，全部在共享白名单内；未使用 `taskId` |
| 显示规则 | `start_background_task=core-command-v1`，`list/read/stop=none`（代码映射 + 入口捕获的工具定义双证） |
| 测试未弱化 | `test/runtime-core/tools.test.ts` 仅在 win32 把目录 symlink 夹具换成 junction（同一重解析点、根外逃逸），逃逸断言与「零写入」断言逐字保留；无删除/放宽 |

## 七、发现的问题（按严重度）

### P3-1（低，文档准确性）：change/feature 文档对设计顺序的说明已陈旧

`角色卡/运行时核心/docs/change/2026-10-22_change_background-tasks.md`「与设计的偏差 / 实施取舍」第 1 条与 `docs/feature/background-tasks.md` 关键顺序第 4 点称「设计 §3.6 流程图把并发检查画在 ShellGate 之后，与 §9.2.4 文字不一致」。实测当前已接受设计（SHA-256 `4471bd83…`）§3.6 流程图与 §9.2.4 已统一为「F-7 之后、ShellGate 之前」；独立验收标准 A1 §8.1.2 也记录了该补正。两处文档应按现状更新为「设计已统一，实施与之一致」。不影响实际行为与判据。

### P3-2（低，生命周期边缘）：`bindRole` 失败后同一 adapter 对同一角色重试会复用已关闭的管理器

Service `bindRole` 失败路径会 `dispose` 后台任务管理器，但缓存 `providers` 只在成功路径 `providers.delete(role)`；若调用方对**同一个** `RuntimeAdapter`、**同一角色**在失败后重试 `bindRole`，会复用已 dispose 的 provider，四工具仍注册但 `start` 一律返回「会话已关闭，未启动」。当前生产路径（`openRoleSession` 每次新建 adapter）不受影响，也不构成安全放宽（fail-closed），故不按阻断处理；建议属主评估在 catch 中同步 `providers.delete(role)`。

### 记录（非问题）

- spawn 失败会消耗一个任务序号（失败后下一个成功任务可能为 `bg-2`）；设计只要求任务号可用于操作，未要求连续，未见功能影响。
- 全量 runtime-core 的 3 个失败与 4 个跳过均为本机 Windows 环境/平台条件（第 2 节第 5 条），失败文件相对 HEAD 零 diff，不属本任务引入。

## 八、无法执行 / 缺失证据

1. **真实 CLI/桌面入口 + 真实引擎/模型轮次**：本机不配置真实模型/API key，也未启动 Electron 桌面或 `node bin/ans.js` 的角色会话；第三节验证的是真实 Pipeline→Service→Provider 装配路径 + 替身引擎，不等同于设计 §9.3.8 的「真实入口跨角色联调」。此项仍缺失。
2. **非 Windows 平台**：本轮全部动态证据来自 Windows 11；POSIX 的 `detached` 进程组终止分支未在本机运行（同一测试代码在 POSIX 会走该分支，但本次未执行）。
3. **真实 OS 级不可终止进程**：kill-timeout 由受控 spawn/kill 替身制造「预算内无 close」，未制造真实不可杀进程（与实施记录一致）。
4. **应用退出残留**：O5 未授权、未实施，按设计属已知限制；本报告未测试应用直接退出后的进程残留。
5. **线上模型/账户、桌面 UI、非本机签名/打包**：不在本任务范围，未验证。

## 九、结论

**测试角色结论：通过（限于本报告候选、Windows 环境与已列证据范围）。** B1–B4 的四工具、注册隔离、同源审核与零 spawn、会话级管理器、并发/保留/缓冲/终止预算、dispose 清理、状态诚实文案与诊断白名单均经实际运行验证；范围核对与 O1–O5 未实施核对通过；未发现阻断性缺陷。2 项低严重度观察（P3-1 文档陈旧、P3-2 重试生命周期边缘）交运行时核心评估。第 1、2、4 节命令均在本候选上实际执行，未声称未运行的测试通过；第八节缺失证据仍待补。本结论不代替独立验收（A1 三态判定）与客户业务确认，也不授权提交/推送/发布。

## 关联

- 所属功能：[会话级后台任务](../../../运行时核心/docs/feature/background-tasks.md)
- 权威设计：[后台任务设计](../../../项目管理/docs/design/2026-10-22_design_background-tasks.md)
- 验收标准 A1：[验收标准](../../../独立验收/docs/design/2026-10-22_design_background-tasks-acceptance.md)
- 实施记录：[运行时核心 change](../../../运行时核心/docs/change/2026-10-22_change_background-tasks.md)
- 独立用例：`test/测试/background-tasks-entry/`
