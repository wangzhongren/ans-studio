---
id: background-tasks-runtime-core-change
type: change
title: 会话级后台任务 B1–B4：四工具、同源审核、管理器与诊断
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [background-tasks, background-tasks-acceptance]
events:
  - date: "2026-10-22"
    kind: implemented
    summary: 按客户确认的 B1–B4 实施四工具、会话级管理器、process-tree 搬迁、Service 注入/释放与诊断；新增 31 个测试与 typecheck 通过；独立验收未进行
---

# 会话级后台任务 B1–B4（运行时核心实施）

**状态分开写**：已实现（下列改动路径全部落盘）；已验证（本机 Windows 上的新增测试、E3 回归与 typecheck，见「验证」）；**未验证**（独立验收、真实入口跨角色联调、非 Windows 平台、应用退出残留等，见「未验证 / 未覆盖」）。

## 用户会看到什么

在注入了 `ShellGate` 的普通受治理角色会话里，模型多了四个工具：`start_background_task` / `list_background_tasks` / `read_background_task` / `stop_background_task`。模型调用 `start_background_task("npm run dev")` 后，工具在确认子进程真的启动（拿到 pid）后**立即返回**任务号与 pid；随后可以读日志尾部、列出任务、显式停止。关闭角色会话时，仍在运行的任务被并行终止。

判断会话（`shellJudge` / `governanceJudge`）与没有注入 `ShellGate` 的会话**看不到**这四个工具（结构性隔离，不是运行时开关）。

## 改动路径（位置 → 改动）

| 文件 | 改动 |
| --- | --- |
| `src/model/runtime.ts` | 新增中立类型 `BackgroundTaskState` / `BackgroundTaskSnapshot` / `BackgroundTaskStreamRead` / `BackgroundTaskReadOptions` / `BackgroundTaskReadResult` / `BackgroundTaskStartInput` / `BackgroundTaskStartResult` / `BackgroundTaskStopOptions` / `BackgroundTaskStopResult` / `BackgroundTaskCapability` / `BackgroundTaskToolFactsV1`；`GovernedToolsOptions.backgroundTasks`；`ToolResult.backgroundTask?`（可选、向后兼容）。 |
| `src/common/runtime-core/background-tasks.ts`（新增） | 会话级管理器：状态机、并发 8、保留 32、每路 256 KiB 环形缓冲、`read` 默认 40/上限 200、SIGTERM→250ms→SIGKILL→1s、dispose 并行终止且幂等、spawn/error 事件约 2 秒确认、spawn 失败不留任务。`start` 是唯一 spawn 入口。 |
| `src/common/runtime-core/process-tree.ts`（新增） | 从 `src/provider/runtime/tools.ts` **逐字搬迁** `killProcessTree` 并导出；平台分支、taskkill 回退、异常不抛出均不变。 |
| `src/provider/runtime/tools.ts` | 新增四工具常量与 handler；启动工具复用同文件 `splitCommand`、`detectUnsupportedShellSyntax`、`ShellGate`、`buildShellEnv` 与 `shellCwd`；注册条件＝`ShellGate` + `backgroundTasks` 同时存在；`start_background_task` 显示规则 `core-command-v1`，其余 `none`；复用 `shell.guard.blocked` / `shell.review.*`，新增 `background.start/exit/stop/stop.timeout/limit`；`run_shell` 改为导入 `killProcessTree`（行为/预算/文案不变）。 |
| `src/provider/runtime/schema.ts` | 四工具的 JSON Schema 与说明（含「只属于当前会话、不跨重启、日志不落盘、轮次结束不终止、并发 8/保留 32、kill-timeout 可能仍在运行」等如实口径）。 |
| `src/service/runtime/session.ts` | `providerFor` 在走 `buildGovernedTools` 且注入 `ShellGate` 时创建管理器并注入；`RuntimeSessionOptions` 的 `Omit` 排除 `backgroundTasks`（外部不能自行注入）；绑定会话 `dispose` 释放管理器；构造/工厂失败与 `bindRole`/`assertReady` 失败路径也释放。 |
| `test/runtime-core/background-tasks.test.ts`（新增） | 管理器单元测试 12 例（真实子进程 + 受控 spawn 替身）。 |
| `test/runtime-core/background-review.test.ts`（新增） | 四工具与 Service 接线测试 15 例。 |
| `test/runtime-core/background-engines.test.ts`（新增） | S5 三引擎可见性测试 3 例（Claude/Codex/Pi 实际注册路径）。 |
| `test/runtime-core/background-contract.test.ts`（新增） | E7 静态契约测试 1 例（kill 逻辑单一实现、`RuntimeSessionOptions` 排除注入）。 |
| `test/runtime-core/background-fixtures.ts`（新增） | 测试共享夹具（受控 spawn/kill、诊断 spy、临时目录、等待）。 |
| `test/runtime-core/tools.test.ts` | **仅测试环境适配**：Windows 无 Developer Mode 时 `symlink(..., "dir")` 报 EPERM，目录逃逸夹具改用等价的 `junction`（POSIX 仍用 symlink）；逃逸断言未放宽。 |
| `角色卡/运行时核心/docs/feature/background-tasks.md`（新增） | 独立功能文档（用途、实际流程图、输入输出、失败/边界、限制、历史链接）。 |
| `角色卡/运行时核心/feature-map.md` | 增加本功能导航行。 |

## 与设计的偏差 / 实施取舍（如实）

1. **并发检查位置**：项目管理已于 2026-10-22 补正设计并置 `status: accepted`（SHA-256 `4471bd831c739010163f857ba58eb2496ea3e1a62d164e36b3ea560358f9f5f1`），四处已统一为「F-7 守卫之后、ShellGate 之前」。本实现按该顺序：**空命令 → splitCommand → F-7 守卫 → 并发检查（runningCount < 8）→ ShellGate**。超限直接拒绝，零 spawn、无审核请求，记 `background.limit`（`reasonCode` + `count`）。管理器 `start` 内仍原子复查一次，防止并行调用突破上限。功能文档已写明实际顺序。
2. **独立功能文档**：按客户任务与 su 核对点，新建 `docs/feature/background-tasks.md` 并在 `feature-map.md` 导航，而不是只更新 `docs/feature/runtime-core.md`。
3. **中止诚实性补充**：四工具成功结果携带 `backgroundTask` 结构化事实；`buildGovernedTools` 的统一中止包装对「已真实启动/已停止」的后台任务结果**不**改写为「未启动/未停止」（避免回合信号恰好中止时说谎）。其他工具的中止语义不变。
4. **kill-timeout 测试方式**：真实 SIGKILL 无法被进程忽略，无法在 POSIX/Windows 上稳定制造「预算内未收口」。测试用受控 spawn/kill 替身（不产生真实 close）走管理器**真实计时与事件路径**，断言等待 ≥1200ms、状态 `kill-timeout` 与诊断 `background.stop.timeout`；没有预置文案。真实停止/进程消失由真实子进程测试覆盖。
5. **`tools.test.ts` 的 Windows 夹具**：这是为了让 E3 的既有回归在本机 Windows 真正跑完（原夹具因无符号链接权限在建立链接时就 EPERM，与产品代码无关）。改为 junction 后仍验证「根外链接逃逸必须被拒绝」，断言未删除、未放宽。
6. **不实现的选项**：O1–O5 全部未实施（无桌面任务面板、无日志落盘、无 cursor/wait、`ShellReviewRequest` 不变、无应用退出钩子）。

## 验证（同一候选；本机 Windows 11 / Git Bash）

环境：`Node v24.22.1` / `npm 11.19.1`；OS `Windows 11 Pro 10.0.26300`（MINGW64_NT-10.0-26300 x86_64）；`HEAD=4d944e7587f10be29b6356c42539e06219ed88fc`；未 commit、未切分支。`npm ci` 退出码 0。

### E1 新增行为测试

命令（cwd=`C:\Users\51054\Desktop\work\ans-studio`）：

```text
node --test --test-timeout=120000 test/runtime-core/background-tasks.test.ts test/runtime-core/background-review.test.ts test/runtime-core/background-engines.test.ts test/runtime-core/background-contract.test.ts
```

结果：**退出码 0；31 个测试，31 通过，0 失败，0 跳过**。逐条测试名与 S/F 映射：

| 测试名 | 覆盖 |
| --- | --- |
| S1/S2：真实子进程启动立即返回任务号与 pid；list/read 可见；stop 后 stopped 且进程消失 | S1、S2.1/2.4、F10 |
| S2.5：自然退出显示 exited 与真实退出码；read 默认 40 行、上限 200（如实标 tailClamped） | S2.2/2.5、S6.3 |
| S2.3：单路超过 256 KiB → truncated，仅保留尾部，且不返回损坏的多字节字符 | S2.3、S6.3 |
| F5：spawn 失败不保留半成品任务、名额释放，后续仍可启动 | F5 |
| F4/S6.1：并发上限 8，第 9 个被拒且名额不被突破 | F4、S6.1 |
| F4.4：并行 start 不会一起突破 8 个名额 | F4.4、CC1 原子性 |
| S6.2：保留上限 32，最老已结束任务优先淘汰；运行中任务永不淘汰；淘汰任务号返回未知 | S6.2 |
| F7：终止预算内未观察到 close → kill-timeout；诊断 background.stop.timeout（证明真实等待到期） | F7、S6.3 |
| S3：dispose 并行终止全部任务、幂等、清空任务并拒绝后续 start | S3.1/3.2 |
| S3.1：dispose 并行发起终止（两个任务的终止信号在同一批同步发出） | S3.1 |
| 启动后运行错误 → failed（启动失败不建任务） | B3 状态机、F5 |
| F9/B1：四工具只在 ShellGate 与管理器同时注入时注册；显示规则与判断会话隔离（结构面） | B1、B4、F9 |
| F1/F2：空命令与 F-7 守卫在审核之前拒绝，零 spawn、无任务 | F1、F2 |
| F3：审核拒绝/undefined/抛错/超时四类均零 spawn、无任务、无日志 | F3 |
| F4/CC1：第 9 个在 ShellGate 之前被拒，无审核请求、零 spawn、诊断 background.limit | F4、CC1 |
| S1/S2：启动立即返回并含任务号/pid；list/read/stop 可用；再次 stop 如实返回已结束 | S1、S2、F10 |
| S2.5/F10：自然退出如实显示 exited 与退出码；对已结束任务 stop 不谎报刚刚停止 | S2.5、F10 |
| F6/O3：未知任务、非法参数与 schema 边界；tailLines 超上限如实钳制 | F6、O3 未授权核对 |
| F8：后台进程 cwd=会话 shellCwd，凭据环境变量被剥离；schema 不接受调用方指定 cwd | F8 |
| S4：轮次中止不杀后台任务；启动成功结果不因信号中止被改写成「未启动」 | S4 |
| S3：管理器已关闭后 start 明确失败且零 spawn（审核通过后才发现会话关闭的竞态） | S3.3 |
| F6：任务不跨管理器/会话可见（另一个管理器读/停旧任务号均为未知） | F6 |

| B4/CC3：background.* 诊断事件齐全且字段全部落在共享白名单内（不含 taskId） | B4、CC3 |
| Service：仅 ShellGate 会话注入四工具；判断会话与无 ShellGate 会话不可见 | B1、F9 |
| Service dispose：终止运行中任务、管理器失效、dispose 幂等 | S3.1/3.2、B3 |
| Service：bindRole 失败如实拒绝（管理器释放在无回合时为空操作；释放接线见代码/构造失败路径） | B3 失败释放（部分静态） |
| Service：assertReady 失败如实拒绝并关闭已绑定 inner 会话（管理器释放路径已接线） | B3 失败释放（部分静态） |
| S5 Claude：SDK MCP registerTool 实际收到四个后台工具 | S5（Claude 装配路径） |
| S5 Codex：thread/start 的 dynamicTools 实际包含四个后台工具 | S5（Codex 装配路径） |
| S5 Pi：生产入口（"tools" in adapterInput）把四个后台工具注册为 customTools | S5（Pi 装配路径） |
| E7：killProcessTree 只保留一份实现，run_shell 从 process-tree.ts 导入 | E7 |

### E2 类型检查

```text
npm run typecheck
```

结果：**退出码 0**；输出只有 `> ans-cli@1.5.0 typecheck` / `> tsc --noEmit`，无错误。

### E3 既有 shell 回归

```text
node --test --test-timeout=60000 test/runtime-core/shell-exec-timeout.test.ts test/runtime-core/shell-guard.test.ts test/runtime-core/tools.test.ts test/runtime-core/session.test.ts
```

结果：**退出码 0；44 个测试，44 通过，0 失败，0 跳过**（`shell-exec-timeout` 7、`shell-guard` 5、`tools` 11、`session` 21）。

### 更宽回归（不作为通过证据）

```text
node --test --test-timeout=120000 "test/runtime-core/*.test.ts"
```

结果：282 个测试，275 通过，3 失败，4 跳过。3 个失败均为本机 Windows 无符号链接权限的 **既有环境红**（`file-write-safety.test.ts` 的 `symlink(..., "file")`、`session-store.test.ts` 的两处 `symlink(..., "dir")`，均 EPERM），不在本任务改动文件内、与 B1–B4 无关；本批新增 31 个测试全部通过。**没有把这些失败算作通过。**

### E7 静态契约核对

- 注册条件：`buildGovernedTools` 中四工具仅在 `shellGate !== undefined && backgroundTasks !== undefined` 时一起注册；判断会话走 `buildShellJudgeTools` / `buildGovernanceJudgeTools`，不经过该函数（测试 `F9/B1`、`Service：仅 ShellGate 会话注入四工具…`）。
- 显示规则：`start_background_task` = `core-command-v1`；`list/read/stop` = `none`（测试 `F9/B1`）。
- `killProcessTree`：`tools.ts` 无第二份实现、从 `process-tree.ts` 导入；`process-tree.ts` 恰一份实现（测试 `E7`）。
- `RuntimeSessionOptions`：`Omit<…, "backgroundTasks">` 编译期断言（测试 `E7`）。
- 诊断：`background.*` 与复用的 `shell.*` 字段全部落在白名单集合 `{turnId, toolCallId, toolName, pid, state, exitCode, signal, durationMs, reasonCode, count, decision}` 内，未使用 `taskId`（测试 `B4/CC3`、`F4/CC1`）。
- `src/common/shared/diagnostics.ts` 零 diff（见下）。

### E4 范围核对

`git status --porcelain` 中本任务改动全部落在 `角色卡/运行时核心/boundary.md` Section 1：`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`src/service/runtime/session.ts`、`src/common/runtime-core/`（新增两文件）、`test/runtime-core/`（新增测试与夹具）、`角色卡/运行时核心/feature-map.md`、`docs/feature/`、`docs/change/`。

以下零 diff（已用 `git diff --stat -- <paths>` 核对，输出为空）：

```text
src/provider/claude/session.ts
src/provider/codex/session.ts
src/provider/pi/session.ts
src/common/pi-adapter/real-adapter.ts
src/common/shared/diagnostics.ts
app/
```

O2/O3/O4/O5 对应面：管理器不写盘不读盘；`read_background_task` schema 无 cursor/wait；`ShellReviewRequest` 未改；无 `process.on("exit")` 兜底。

## 已知边缘 / 后续（未修复）

- **`bindRole` 失败后的同 adapter 重试**：`bindRole` 失败路径当前只 `dispose` 后台任务管理器，未 `providers.delete(role)`。同一 adapter 对同一角色重试会复用已 dispose 的 provider/管理器；四个工具虽仍注册，但 `start_background_task` 一律 fail-closed「会话已关闭，未启动」（不 spawn 任何进程）。当前 `openRoleSession` 每次新建 adapter，正常入口不受影响。**本轮 B1–B4 未修复**；后续建议在 `bindRole` 的 catch 中删除 `providers` 缓存，并补一条「失败后对同一 adapter 重试」的测试。

## 未验证 / 未覆盖（如实）

1. **真实入口跨角色联调**（CLI/桌面、测试角色）未进行；本记录只覆盖运行时核心自身单元/装配测试。
2. **非 Windows 平台**未在本机执行：POSIX `detached`/进程组终止路径只有代码与既有测试形态，未在本轮实际跑 POSIX。
3. **`bindRole` / `assertReady` 失败时管理器释放**：代码已接线；但 Service 工具在无活动回合时结构性拒绝调用，无法在失败路径上先启动真实任务再观察清理，因此只有「失败被如实拒绝 / inner 会话被关闭」的动态证据，管理器释放本身属代码核对。构造/工厂失败路径同样已接线。
4. **kill-timeout** 用受控 spawn/kill 替身（真实 SIGKILL 不可被忽略）；真实 OS 级「不可杀」进程未制造。
5. **应用直接退出**的后台进程残留风险未消除（O5 未授权），功能文档已如实登记。
6. 三引擎可见性用离线假 SDK/假引擎证明（符合验收 S5 允许范围）；真实线上模型轮次未验证。
7. 全量 `test/runtime-core` 的 3 个 Windows symlink EPERM 既有环境红未修复（不在本任务范围）。

## 关联

- 所属功能：[会话级后台任务](../feature/background-tasks.md)
- 权威设计（项目管理）：[2026-10-22 后台任务设计](../../../项目管理/docs/design/2026-10-22_design_background-tasks.md)
- 独立验收标准 A1：[2026-10-22 验收标准](../../../独立验收/docs/design/2026-10-22_design_background-tasks-acceptance.md)
