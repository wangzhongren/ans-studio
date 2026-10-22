---
id: change-background-tasks-acceptance
type: change
title: 后台任务 B1–B4 独立验收——候选、S/F/CC 逐条判断与 missing-evidence 边界
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: verified
related: [background-tasks-acceptance, background-tasks, background-tasks-runtime-core-change, change-background-tasks-test-verify]
events:
  - date: "2026-10-22"
    kind: verified
    summary: 按 A1 对候选 HEAD 4d944e75+工作树逐条判定；B1–B4、S1–S6、F1–F10、CC1–CC3、E1–E7 全部满足，总体 pass（Windows 11、运行时核心单测/契约与真实 Pipeline→Service→只读档 ShellGate 装配范围）；P3-1 已修正，P3-2 记为非阻断已知边缘；真实入口+真实模型、非 Windows、真实不可杀进程、O5 退出残留未判
---

# 后台任务 B1–B4 独立验收：候选通过，范围与未判项已列明

**标准**：[后台任务 B1–B4 验收标准 A1](../design/2026-10-22_design_background-tasks-acceptance.md)，version A1，本角色复算 SHA-256 `4f248b16d284576d82973af8b111653c007d5c0891446398a67d2edc949ee1d0`。本报告按该文件的 S1–S6、F1–F10、CC1–CC3、E1–E7 逐条判断，不另造标准。

**设计**：[后台任务设计](../../../项目管理/docs/design/2026-10-22_design_background-tasks.md)，`status: accepted`，SHA-256 `4471bd831c739010163f857ba58eb2496ea3e1a62d164e36b3ea560358f9f5f1`，与 A1 §一一致。

**候选**：HEAD `4d944e7587f10be29b6356c42539e06219ed88fc`（未提交、未切分支）+ 未提交工作树。环境：Windows 11 Pro 10.0.26300（MINGW64_NT-10.0-26300 x86_64）、Node v24.22.1、npm 11.19.1。

**总体结论：通过（pass）**——B1–B4 交付齐全；S1–S6、F1–F10、CC1–CC3 全部满足；E1–E7 必要证据完整并绑定当前候选；未发现阻断性缺陷。通过范围限 **Windows 11 上运行时核心的单元/契约测试，以及真实 Pipeline→Service→只读档 ShellGate 装配路径（引擎用替身）**。真实 CLI/桌面 + 真实模型、非 Windows 平台、真实 OS 级不可杀进程、O5 应用退出残留不在本轮通过范围内，逐项列于 §九。P3-1 已修正；P3-2 按 A1 判断为非阻断已知边缘（§八）。

**权限声明**：本结论不授予提交、推送、合并、部署或发布。本角色未修改产品代码、测试、断言、他人报告、权限或调度状态，未提交 Git。

## 一、候选身份与证据绑定

### 1.1 候选与工作树

| 项 | 值 | 核对 |
| --- | --- | --- |
| HEAD | `4d944e7587f10be29b6356c42539e06219ed88fc` | `git rev-parse HEAD` 与实施/测试证据记录一致 |
| 产品改动（修改） | `src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、`src/service/runtime/session.ts` | 本角色 `git diff --stat` 与测试证据 `scope/status-and-scope.txt` 逐项一致：123/102/333/151 行，5 文件共 623 insertions、92 deletions |
| 产品改动（新增） | `src/common/runtime-core/background-tasks.ts`、`src/common/runtime-core/process-tree.ts` | 均为运行时核心 Section 1 的 `src/common/runtime-core/` 目录内 |
| 测试改动 | 新增 `test/runtime-core/background-{tasks,review,engines,contract}.test.ts`、`background-fixtures.ts`；修改 `test/runtime-core/tools.test.ts`（仅 Windows junction 夹具） | 属运行时核心 `test/runtime-core/` 边界；测试角色另有 `test/测试/background-tasks-entry/`，属测试角色边界 |
| 文档改动 | 运行时核心 feature-map / memo / feature / change；测试报告与证据；独立验收与本标准；项目管理设计 | 各自角色文件，非产品代码 |
| 时间绑定 | 产品文件 mtime 11:45–11:56；测试证据日志 12:07；测试报告 12:09；运行时核心文档修正 12:10 | 产品/测试代码早于测试与证据；12:10 仅文档 P3-1/P3-2 修正，未再动产品/测试 |
| 设计版本 | `status: accepted`，SHA-256 `4471bd83…f9f5f1` | 本角色独立复算一致 |

### 1.2 关键文件摘要（本角色独立计算）

```text
e43a7e208b8f04cb01bec9b068b7c87fbf6ddf82fb230f1c0863c8b1c25b1eb9  src/model/runtime.ts
74c6adcc1f8cef66e8dc4ed6b1c29bd52ea67e8011b2b92127eed142e28f8019  src/provider/runtime/schema.ts
6254ca9debc8d4a47aba3f84e95a97f2e84e942db727b2676baa60dac01e7747  src/provider/runtime/tools.ts
76a665bdc3952a94d9b45f2a71d2b1d52b1db1ad6397d2710f498886770559b2  src/service/runtime/session.ts
56daa0c29e704103bd12a085168e3eac3d20c0e63c276efd0e9ae2b190f3ad3a  src/common/runtime-core/background-tasks.ts
1bd094cb2fc04fa5dd92ee3acb269ad314908f4795774b762378586a4cd8a12d  src/common/runtime-core/process-tree.ts
a99c52cea45661a63910182d4df0502691d29eef08a627e431fbf964afcd1ef6  test/runtime-core/tools.test.ts
```

### 1.3 证据来源

| 来源 | 内容 | 本角色核对方式 |
| --- | --- | --- |
| 运行时核心 change | [2026-10-22_change_background-tasks.md](../../../运行时核心/docs/change/2026-10-22_change_background-tasks.md)，SHA-256 `c86ad9297cfb9fb5111c4429ec854d6cd88d069fe104343a9877f71ac8f598e8` | 逐节阅读；改动路径、验证命令、偏差、已知边缘与未覆盖项 |
| 运行时核心 feature | [background-tasks.md](../../../运行时核心/docs/feature/background-tasks.md)，SHA-256 `93c5418567bc2acea8317fb62859b38c6d5581dcdc87c0620836d8c0a6dbaa1c` | 流程图、实际顺序、限制与历史链接 |
| 测试角色报告 | [2026-10-22_change_background-tasks-verify.md](../../../测试/docs/change/2026-10-22_change_background-tasks-verify.md)，SHA-256 `7618055ba12d1f685af91dde8d6b6f9e3b31b8aaeebcf9c3d4f37a298d0bf4e3` | 候选、命令、覆盖矩阵、问题与缺失证据 |
| 测试原始日志 | `new-tests.log`（31/31）、`shell-regression.log`（44/44）、`typecheck.log`（0）、`independent-entry-tests.log`（12/12）、`exit-codes.txt`、`scope/*` | 逐行读取，计数与退出码一致；日志摘要 `42bce981…`、`34ca107e…`、`e938f6ed…`、`14817cf9…` |
| 协调方重跑 | 新增 31/31、独立入口 12/12、typecheck 0、范围零 diff | 作为补充证据，不替代本角色判断 |
| 本角色独立抽查 | `npm run typecheck`、新增 31 例、测试角色入口 12 例 | 见 §七，均通过 |

## 二、范围核对

### 2.1 改动范围

- 产品改动全部落在 `角色卡/运行时核心/boundary.md` Section 1：`src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts`、`src/service/runtime/session.ts`、`src/common/runtime-core/`、`test/runtime-core/`。
- 测试角色的 `test/测试/background-tasks-entry/` 与证据目录属于测试角色自身边界；独立验收文件属于本角色边界。二者都不是运行时核心产品代码，不扩大 B1–B4 产品范围。

### 2.2 零 diff 与未授权项

本角色独立执行 `git diff --stat`（输出为空）核对以下路径：

```text
src/provider/claude/session.ts
src/provider/codex/session.ts
src/provider/pi/session.ts
src/common/pi-adapter/real-adapter.ts
src/common/shared/diagnostics.ts
app/
```

- **适配器零改动**：四个适配器路径零 diff，符合 S5 与 §2.5。
- **诊断共享文件只读**：`src/common/shared/diagnostics.ts` 零 diff，符合 CC3。
- **O1/O5**：`app/` 零 diff；无新增桌面任务面板、无应用退出钩子。
- **O2**：管理器只 import `node:child_process`、`process-tree.ts` 与 Model 类型，无 `node:fs`、无 `.ans` 写盘。
- **O3**：`read_background_task` schema 无 cursor/wait 参数。
- **O4**：`ShellReviewRequest` 在 `git diff HEAD -- src/model/runtime.ts` 中无变化；审核请求形状不变。
- `ShellReviewRequest` 不变、无 `process.on("exit")`/`beforeExit` 退出钩子，均有静态核对输出支持。

### 2.3 设计 §5.1 与独立功能文档的差异

设计 §5.1 仍写更新 `docs/feature/runtime-core.md`；客户任务与 A1 CC2 要求独立 `docs/feature/background-tasks.md`。按 su 协调决定与本标准 CC2，以**独立功能文档**为准，不要求设计重新版本化（避免哈希/证据失效）；实际落点已写入运行时核心 change 记录。本角色核对该决定不改变任何 B1–B4 行为判据，记为非阻断文档差异。

## 三、成功标准 S1–S6

| 标准 | 结论 | 主要证据 |
| --- | --- | --- |
| **S1 启动立即返回任务号与 pid** | **通过** | 真实子进程测试「S1/S2：真实子进程启动立即返回任务号与 pid…」；测试角色入口主流程；代码 `manager.start` 等 `spawn`/`error`（约 2s 上界）后返回，不等待 `close` |
| **S2 列表、读取（尾部行、截断）、停止可用** | **通过** | list/read/stop 真实子进程用例；自然退出 `exited` + 真实退出码；256 KiB 截断 + UTF-8 安全；stop 观察到 close 才 `stopped`、进程/进程组消失；入口测试再次覆盖 |
| **S3 会话 dispose 清理** | **通过** | 管理器 dispose 并行终止、幂等、清空并拒绝后续 start；Service dispose 用例；入口 `handle.abort()` + 双 dispose；代码 `session.ts` dispose 调 `provider.backgroundTasks?.dispose()`；关闭后 start 测试证明零 spawn |
| **S4 轮次中止不杀后台任务** | **通过** | 管理器/入口测试：`handle.abort()` 后 pid 仍存活、下一轮 list 仍 running；代码无轮次 signal→管理器终止接线；只有 stop/dispose 终止 |
| **S5 三引擎经 `options.tools` 可见四工具** | **通过** | `background-engines.test.ts` 分别走 Claude SDK 假端、Codex thread/start dynamicTools、Pi 生产入口 customTools；四适配器零 diff |
| **S6 上限、淘汰与缓冲按设计默认值** | **通过** | 代码常量 8/32/256 KiB/40/200/250 ms/1 s；测试覆盖第 9 个拒绝、并行原子性、32 淘汰、运行中不淘汰、截断与行数钳制；无客户调整意见，按设计默认值验收 |

## 四、失败与边界标准 F1–F10

| 标准 | 结论 | 主要证据 |
| --- | --- | --- |
| **F1 空命令/纯空白** | **通过** | 测试「F1/F2：空命令与 F-7 守卫在审核之前拒绝，零 spawn、无任务」；代码先于 split/审核返回失败 |
| **F2 F-7 守卫** | **通过** | 同上；`npm run dev &`、`a && b`、`echo $(x)` 在审核前被拒；`shellGate` 零调用；诊断 `shell.guard.blocked` |
| **F3 审核拒绝/undefined/抛错/超时** | **通过** | 测试「F3：审核拒绝/undefined/抛错/超时四类均零 spawn、无任务、无日志」；入口只读档 deny 独立复验；代码仅在恰 `allow:true` 后调 `manager.start` |
| **F4 第 9 个在 ShellGate 之前被拒** | **通过** | 代码顺序：空命令→split→F-7→并发检查→ShellGate；测试 F4/CC1 与入口用例均证明第 9 个分类器零调用、零 spawn、`background.limit`（`reasonCode` + `count`）；并行 start 原子性测试 |
| **F5 spawn 失败不留半成品** | **通过** | 管理器单元测试与入口真实不存在可执行文件用例：`ok:false`、list 为空、随后可正常启动；代码删除任务并释放名额 |
| **F6 未知任务号** | **通过** | 测试与入口：read/stop 均明确「未知任务」「不要假设它运行过」；跨管理器/会话不可见；代码不猜测状态 |
| **F7 kill-timeout 诚实文案** | **通过** | 受控 spawn/kill 替身不产生 close，走真实计时与事件路径：等待 ≥1200 ms、`state=kill-timeout`、文案含「可能仍在运行，请如实告知客户」且不含「已停止任务」；诊断 `background.stop.timeout`。真实 OS 级不可杀进程未制造，列 §九 |
| **F8 凭据剥离与 cwd** | **通过** | 测试与入口：哨兵凭据不在子进程 env；cwd=会话 shellCwd；schema 无 cwd 参数；代码复用 `buildShellEnv` 与 `shellCwd` |
| **F9 判断/无 ShellGate 会话不可见** | **通过** | 管理器注册条件测试；Service 用例；入口三场景（无 ShellGate、shellJudge、governanceJudge）均不含四工具；代码注册条件与判断工具集结构性绕开 |
| **F10 已结束任务 stop 不谎报** | **通过** | 测试「S2.5/F10」与入口第二次 stop：返回原状态与退出码，文案明确「早已结束」「本次未发送终止信号，不声称刚刚停止」 |

## 五、su 三条核对点 CC1–CC3

| 核对点 | 结论 | 主要证据 |
| --- | --- | --- |
| **CC1 并发检查在 ShellGate 之前** | **通过** | 代码顺序见 F4；测试与入口均以分类器/审核事件计数证明第 9 个零审核请求、零 spawn、`background.limit`；设计 §3.2/§3.3/§3.6/§9.2.4 已统一，运行时核心文档已按现状描述 |
| **CC2 独立功能文档存在并在 feature-map 可导航** | **通过** | `角色卡/运行时核心/docs/feature/background-tasks.md` 存在：用途、Mermaid 流程图、实际顺序、四工具、上限/预算、失败文案、不承诺限制、历史链接；`feature-map.md` 有导航行；change 记录链接功能与 A1。P3-1 陈旧措辞已修正 |
| **CC3 诊断白名单/不改共享文件/不依赖 taskId** | **通过** | `diagnostics.ts` 零 diff；`background.start/exit/stop/stop.timeout/limit` 使用字段 `{turnId, toolCallId, toolName, pid, state, exitCode, signal, durationMs, reasonCode, count}` 全部在白名单；无 `taskId`；`background.limit` 用 `reasonCode`+`count`；测试 B4/CC3 与静态核对双重支持 |

## 六、必须的证据 E1–E7

| 证据 | 结论 | 核对 |
| --- | --- | --- |
| **E1 新增行为测试命令与原始输出** | **通过** | 实施与测试角色均记录同一命令、退出码 0、31/31；`new-tests.log` 逐条测试名与计数一致；S1–S6/F1–F10 均有映射；本角色独立复跑 31/31 通过 |
| **E2 `npm run typecheck`** | **通过** | 测试记录退出码 0；本角色独立复跑退出码 0，输出无诊断 |
| **E3 既有 shell 回归** | **通过** | `shell-regression.log` 44/44（shell-exec-timeout 7、shell-guard 5、tools 11、session 21），退出码 0；测试角色复跑一致。本角色未复跑该组，读取原始日志与测试报告判断 |
| **E4 改动路径清单与范围核对** | **通过** | `git status --porcelain`、diffstat 与零 diff 核对见 §二；O1–O5 未实施；无越权产品改动 |
| **E5 文档** | **通过** | 独立 feature 文档、feature-map 导航、change 记录齐全；状态区分 implemented/verified/unverified；限制与非承诺如实；P3-1 已修正 |
| **E6 候选身份与环境** | **通过** | HEAD、工作树、diffstat、mtime、环境与命令均已记录；产品/测试代码早于证据日志；本角色复算关键摘要与 diffstat 一致 |
| **E7 静态契约核对** | **通过** | 注册条件、判断会话隔离、显示规则（start=`core-command-v1`，其余 `none`）、`killProcessTree` 单一实现且与 HEAD 私有函数逐字一致、`RuntimeSessionOptions` Omit、诊断字段；均有代码与测试支持 |

## 七、本角色独立抽查与复算

以下命令均在当前候选上由本角色实际执行（cwd=仓库根，Node 通过本机安装路径引入）：

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 退出码 0，无诊断 |
| `node --test --test-timeout=120000 test/runtime-core/background-tasks.test.ts test/runtime-core/background-review.test.ts test/runtime-core/background-engines.test.ts test/runtime-core/background-contract.test.ts` | 退出码 0；31 tests / 31 pass / 0 fail / 0 skip |
| `node --test --test-timeout=120000 "test/测试/background-tasks-entry/background-entry.test.ts"` | 退出码 0；12 tests / 12 pass / 0 fail / 0 skip |

代码/静态抽查：

- **并发顺序**：`tools.ts` 启动 handler 顺序为空命令→split→F-7→`manager.runningCount >= 8`→ShellGate→`buildShellEnv`→`manager.start`；第 9 个在 ShellGate 前返回，`shell.review.start` 不会发出。
- **零 spawn**：审核拒绝/undefined/抛错/超时均在 `manager.start` 之前返回；管理器 `start` 在 spawn 失败时删除任务并收掉迟到进程。
- **注册与显示**：`buildGovernedTools` 仅在 `shellGate !== undefined && backgroundTasks !== undefined` 时注册四工具；显示映射 start 为 `core-command-v1`，其余为 `none`。
- **管理器**：`BACKGROUND_TASK_MAX_RUNNING=8`、`MAX_RETAINED=32`、`STREAM_LIMIT_BYTES=256*1024`、`DEFAULT_TAIL_LINES=40`、`MAX_TAIL_LINES=200`、`KILL_GRACE_MS=250`、`KILL_SETTLE_MS=1000`；dispose 并行终止且幂等；无文件系统 IO。
- **进程树搬迁**：以 `git show HEAD:src/provider/runtime/tools.ts` 中的 `killProcessTree` 与新文件逐字比对，结果完全一致（`VERBATIM_MATCH`）。
- **诊断**：六处 `background.*` 记录字段均逐项落在白名单内；无 `taskId`；`diagnostics.ts` 零 diff。
- **候选绑定**：当前产品 diffstat 与测试证据记录完全一致；产品文件 mtime 早于测试日志；文档修正晚于测试且未包含产品/测试改动。

**未由本角色复跑**：44 例 shell 回归、全量 `test/runtime-core`。前者读取测试角色原始日志与报告；后者测试角色记录 282 计/275 过/3 失败/4 跳过，3 个失败均为本机 Windows 无符号链接权限的既有 EPERM（`file-write-safety.test.ts` 1、`session-store.test.ts` 2），失败文件相对 HEAD 零 diff，不属本任务引入，未计入通过，也未用于掩盖失败。

## 八、问题与限制

### 8.1 P3-1 文档陈旧：已修正

测试角色指出运行时核心 change/feature 曾称「设计 §3.6 流程图与 §9.2.4 不一致」。当前文档已更新为「设计已统一为 F-7 之后、ShellGate 之前，实施与之一致」；本角色阅读确认措辞与 accepted 设计一致。属文档修正，不改判据。

### 8.2 P3-2 `bindRole` 失败后同 adapter 重试：非阻断已知边缘

- **现象**：`bindRole`/`assertReady` 失败路径 `dispose` 后台任务管理器，但 `providers.delete(role)` 只在成功路径执行；同一 adapter 对同一角色失败后重试会复用已关闭的管理器，四工具仍注册，`start_background_task` 返回「会话已关闭，未启动」。
- **本角色判断：不阻断 A1 通过**。理由：A1 S3.3 明确允许「即使审核在此前恰好通过」也以零 spawn 失败；该边缘在新回合中会先调用 ShellGate，再在 `manager.start` 因 closed 拒绝，**不 spawn、不产生任务、不谎报**，属 fail-closed。正常入口（`openRoleSession` 每次新建 adapter）不受影响；没有 A1 条款要求失败后同一 adapter 必须可复用。
- **记录**：运行时核心 change/feature 已如实写明该边缘与建议修复（失败 catch 中同步 `providers.delete(role)`，并补重试测试）。建议后续在相关生命周期批次修复，不改变本次 B1–B4 判定。

### 8.3 全量 runtime-core 的 3 个既有环境红

`file-write-safety.test.ts` 1 例、`session-store.test.ts` 2 例 `EPERM: symlink`，均为本机 Windows 无符号链接权限导致；两文件相对 HEAD 零 diff，不在本任务改动内。测试角色与实施方均未把红算作通过；本角色同样不将其计入通过，也不据此判返工。

### 8.4 无阻断性缺陷

在上述候选与范围内，未发现违反 A1 的阻断性缺陷；S/F/CC/E 全部满足。

## 九、missing-evidence / 本轮不判

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 真实 CLI/桌面入口 + 真实引擎/模型轮次 | **未判（缺失证据）** | A1 §2.4 已写明测试角色真实入口跨角色联调本轮不判。本轮测试角色走的是真实 Pipeline→Service→只读档 ShellGate + 替身引擎，不等同于真实 CLI/桌面 + 真实模型；不能据此声称真实入口已验证 |
| 非 Windows（POSIX `detached`/进程组终止） | **未判（缺失证据）** | 全部动态证据来自 Windows 11；POSIX 分支只有代码与测试形态。通过结论只覆盖 Windows |
| 真实 OS 级不可终止进程 | **未判（缺失证据）** | kill-timeout 用受控 spawn/kill 替身制造「预算内无 close」，走真实计时/事件路径；未制造真实不可杀进程 |
| 应用直接退出后的进程残留（O5） | **未判（未授权/已知限制）** | O5 未授权未实施；功能文档已如实登记直接退出可能残留进程 |
| O1 桌面任务面板、O2 日志落盘、O3 增量读取、O4 审核卡标注 | **未实施（符合预期）** | 均未授权；范围核对确认无相关改动 |
| 线上模型/账户、桌面 UI、签名/打包/发布 | **不属本任务** | 未验证，也不由本通过结论推定 |

**边界规则**：这些项不阻塞 B1–B4 在已列范围内的通过，但报告不把它们写成「已通过」。若后续要声称覆盖真实入口、非 Windows 或 O5，需要另立授权、证据与判定。

## 十、结论与后续

- **结论：通过（pass）**。B1–B4、S1–S6、F1–F10、CC1–CC3、E1–E7 在当前候选（HEAD `4d944e75…` + 工作树）上全部满足；范围限 Windows 11 的运行时核心单元/契约测试与真实 Pipeline→Service→只读档 ShellGate 装配路径（替身引擎）。P3-1 已修正；P3-2 为非阻断已知边缘；3 个全量环境红不计入通过；§九各项未判。
- **建议**：运行时核心可在自身 change/feature 中把状态从 implemented-pending-verification / implemented-unverified 更新为已验证（以本报告为独立验收依据）；P3-2 可在后续生命周期批次修复并补重试测试；真实 CLI/桌面 + 真实模型与 POSIX 平台另立测试阶段。
- **权限**：本结论不授权提交、推送、合并、部署或发布；发布决定属客户。本角色只写自身边界内文档，未修改产品、测试或他人报告。
- **标准版本**：A1，SHA-256 `4f248b16d284576d82973af8b111653c007d5c0891446398a67d2edc949ee1d0`。

## 关联

- 验收标准：[后台任务 B1–B4 验收标准 A1](../design/2026-10-22_design_background-tasks-acceptance.md)
- 权威设计：[后台任务设计](../../../项目管理/docs/design/2026-10-22_design_background-tasks.md)
- 实施记录：[运行时核心 change](../../../运行时核心/docs/change/2026-10-22_change_background-tasks.md)
- 当前功能：[会话级后台任务](../../../运行时核心/docs/feature/background-tasks.md)
- 测试验证：[测试角色报告](../../../测试/docs/change/2026-10-22_change_background-tasks-verify.md) 与 [原始证据目录](../../../测试/docs/change/2026-10-22-background-tasks-verify-evidence/)
