---
id: change-background-tasks-e2e-real-model
type: change
title: 后台任务 B1–B4 真实项目 + 真实模型端到端测试——Pi 引擎经客户网关驱动四工具
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: verified
related: [background-tasks, background-tasks-acceptance, background-tasks-test-verify]
events:
  - date: "2026-10-22"
    kind: verified
    summary: 真实 Pi 引擎 + 真实客户网关 + 临时真实项目经 openRoleSession 全链装配；真实模型成功调用四个后台工具；启动 7ms/4ms 返回、回合结束服务器存活、下一轮读出真实端口日志、stop 后 pid/端口消失、dispose 清理第二实例；12/12 断言通过；run_shell 3s 阻塞对照成立
---

# 后台任务 B1–B4 真实项目 + 真实模型端到端测试

**结论先行：在下列候选、Windows 环境、真实 Pi 引擎与客户网关、单次运行范围内，端到端测试通过。** 真实模型（`deepseek-v4-flash[1m]`）经真实 `openRoleSession` → Service → Pi 适配器成功调用 `start_background_task`、`list_background_tasks`、`read_background_task`、`stop_background_task` 四个工具；12/12 断言全部通过，以真实进程、真实端口和真实工具事件为准，未依赖模型自述。唯一替身是 ShellGate 的审批/分类通道（记录并返回 allow），其余链路均为真实实现。本报告只说明测过的场景，不代替独立验收结论或客户业务确认；未提交 Git、未改产品代码。

## 一、候选与环境

| 项 | 值 |
| --- | --- |
| 仓库 | `C:\Users\51054\Desktop\work\ans-studio`（Windows 11 Pro 10.0.26300，win32 x64，Git Bash） |
| HEAD | `4d944e7587f10be29b6356c42539e06219ed88fc`（未提交、未切分支） |
| 工作树（产品） | 修改：`src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、`src/service/runtime/session.ts`；新增：`src/common/runtime-core/background-tasks.ts`、`src/common/runtime-core/process-tree.ts`（与上一次测试报告相同的候选） |
| 设计依据 | `角色卡/项目管理/docs/design/2026-10-22_design_background-tasks.md`，`status: accepted`；实测 SHA-256 `4471bd831c739010163f857ba58eb2496ea3e1a62d164e36b3ea560358f9f5f1`，与验收标准 A1 引用一致 |
| 验收标准 | `角色卡/独立验收/docs/design/2026-10-22_design_background-tasks-acceptance.md`（A1） |
| 引擎 | **Pi**（默认工厂 `createPiRuntimeAdapter` → `src/common/pi-adapter/real-adapter.ts` → Pi SDK 真实网关）；未使用 Claude/Codex |
| Node / npm | Node v24.22.1 / npm 11.19.1（未入 PATH，命令前显式导出） |
| 测试代码 | `test/测试/background-tasks-e2e-real-model/{pi-smoke.ts,e2e-background-real-model.ts,run-shell-comparison.ts}`；SHA-256 见第六节 |
| 仓库外临时目录 | `%TEMP%\ans-e2e-*`（临时项目、证据）；测试结束后项目目录已删除，仅保留证据目录与客户环境文件 |

本轮未修改产品代码、其他角色测试或构建配置；受保护路径 `src/provider/claude`、`src/provider/codex`、`src/provider/pi`、`src/common/pi-adapter`、`src/common/shared/diagnostics.ts`、`app/` 的 `git diff --stat` 为空。

## 二、安全与脱敏

- 每次 Bash 调用前执行 `. /c/Users/51054/AppData/Local/Temp/ans-e2e-model.env`；**未 cat/echo/复制该文件内容**，测试代码、日志与报告均不含令牌。
- 环境文件只记录**变量名与状态**：`ANTHROPIC_AUTH_TOKEN=已设置（值未记录）`、`ANTHROPIC_BASE_URL=已设置（值未记录）`、`ANS_PI_BASE_URL=已设置（值未记录）`、`ANS_PI_MODEL=deepseek-v4-flash[1m]`（任务已提供）、`ANS_PI_CONTEXT_WINDOW=1000000`。
- 对三份原始日志做了令牌字面量扫描，结果均为 `clean`（只输出 clean/FOUND，不输出令牌）。原始日志：[smoke.log](../../../../test/测试/background-tasks-e2e-real-model/evidence/smoke.log)、[e2e.log](../../../../test/测试/background-tasks-e2e-real-model/evidence/e2e.log)、[run-shell-comparison.log](../../../../test/测试/background-tasks-e2e-real-model/evidence/run-shell-comparison.log)。
- 观察（非阻断）：任务说明称环境文件权限 0600，Git Bash `stat` 实测为 `644`。该文件在仓库外、当前用户私有 Temp 目录；未修改其权限，如实记录。

## 三、连通性冒烟（真实网关）

命令（仓库根，已导出 Node PATH 并加载环境文件）：

```bash
node "test/测试/background-tasks-e2e-real-model/pi-smoke.ts"
```

退出码 **0**，耗时 **1487ms**。真实模型回复 `OK`，事件流包含 `message:OK` 与 `settled:会话结束`。这说明鉴权（Bearer `ANTHROPIC_AUTH_TOKEN`）、端点（`ANS_PI_BASE_URL`）、模型名与网络均可用。原始日志见证据目录 `smoke.log`。

## 四、真实项目 E2E

### 4.1 装配与替身边界

- 入口：真实 Pipeline `openRoleSession`（`src/pipeline/orchestration/run-role.ts`）→ 真实 Service `createRuntimeAdapter`（管理器创建、四工具注册、回合包装、`dispose` 接线）→ 默认 Pi 工厂 `createPiRuntimeAdapter` → Pi SDK → 客户网关。
- 临时项目位于仓库外 `%TEMP%\ans-e2e-bg-*`：合法 `角色卡/dev/role-card.md`、`boundary.yaml`，以及 `server.js`（`http.createServer` 监听 `127.0.0.1:0`，stdout 打印 `ANS_E2E_LISTENING http://127.0.0.1:<port> PID=<pid>`，写 `server.state.json`，注册 SIGTERM 处理，持续运行）。
- **唯一替身**：`shellReadonly` 的真实只读档装配中，`classifyShell` 为记录 argv 并返回 `allow` 的测试替身，`auditSink` 为内存审计。它只替代审批/分类决策通道，使无人值守脚本能通过审核；`splitCommand`、F-7 守卫、`buildShellEnv`、cwd、真实 spawn、管理器、日志缓冲、停止与 dispose 均为产品真实实现。审核请求实测 argv 为 `["node","server.js"]`（每次启动恰好一次）。
- 模型：真实 `deepseek-v4-flash[1m]`；每轮上限 180s，实际每轮 2.5–6.1s。

### 4.2 实际提示（关键内容）

- 第 1 轮：要求调用 `start_background_task`，`command` 必须为 `node server.js`，不要用 `run_shell`，不要 stop。
- 第 2 轮：把真实任务号 `bg-1` 与真实端口 `64445` 明确给模型，要求按顺序调用 `list_background_tasks` → `read_background_task`（`stream:stdout`, `tailLines:40`）→ `stop_background_task`。
- 第 3 轮：再次 `start_background_task` 启动 `node server.js`，不 stop；随后由测试调用会话 `dispose()` 验证清理。
- 模型首轮即按指令执行，未触发重试条件（脚本内置“模型未调用工具时重试 1 次”未使用）。

### 4.3 真实工具调用序列与耗时

| 轮次 | 模型实际调用（按事件顺序） | 关键结果 | 回合耗时 |
| --- | --- | --- | --- |
| 1-start | `start_background_task("node server.js")`；额外调用 `list_background_tasks`；`submit_report` 首次 schema 校验失败后重试成功 | `bg-1`，pid **19680**，`running`；**start 工具耗时 7ms**；list 显示 `bg-1 running` | 6128ms |
| 2-list-read-stop | `list_background_tasks` → `read_background_task(bg-1, stdout, 40)` → `stop_background_task(bg-1)` | list/running；read 读到 `ANS_E2E_LISTENING http://127.0.0.1:64445 PID=19680`，状态 running、已运行 7366ms；stop 耗时 **135ms**，`state: stopped`、exitCode 1 | 4630ms |
| 3-start-for-dispose | `start_background_task("node server.js")`；`submit_report` 成功 | `bg-2`，pid **18716**，`running`；**start 工具耗时 4ms** | 2549ms |

模型最终回复分别报告了任务号/pid/状态、端口与最终状态。模型自述只作参考，断言以下面的真实进程/端口/事件为准。`submit_report` 的首次 schema 失败与后台任务无关（模型把 `evidence` 传成字符串，重试后成功），不影响本测试结论。

### 4.4 断言结果（12/12 通过）

| 编号 | 断言 | 结果 | 原始证据 |
| --- | --- | --- | --- |
| a1 | 模型调用 `start_background_task` | 通过 | 第 1 轮 1 次调用（第 3 轮再次调用） |
| a2 | 启动返回任务号、真实 pid、`running` | 通过 | `已启动任务 bg-1（pid 19680，运行中）` |
| a3 | 启动工具明显短于进程生命周期（阈值 <5s） | 通过 | 工具事件 `durationMs=7`（第 3 轮 4ms） |
| a4 | 工具 pid 与真实 server.js pid 一致 | 通过 | 工具 pid 19680 = `server.state.json` pid 19680 |
| b1 | 回合在服务器运行期间结束（非阻塞） | 通过 | 第 1 轮 `timedOut=false`；回合后 pid 存活、`http://127.0.0.1:64445` 返回 HTTP 200 |
| c1 | 下一轮 `list` 看到任务与 running | 通过 | `- bg-1 running pid 19680 命令：node server.js` |
| c2 | 下一轮 `read` 读到服务器真实日志 | 通过 | `ANS_E2E_LISTENING http://127.0.0.1:64445 PID=19680`，状态 running |
| d1 | `stop` 返回 stopped | 通过 | `已停止任务 bg-1（state: stopped，pid 19680，exitCode 1；已在终止预算内观察到进程退出）` |
| d2 | stop 后进程/端口消失 | 通过 | pid 19680 `alive=false`；端口 64445 `ECONNREFUSED` |
| a5 | 审核通道每次启动恰好一次 | 通过 | 分类器共 2 次调用（对应 2 次成功启动），argv 均为 `["node","server.js"]` |
| e1 | 第二次启动用于 dispose 场景 | 通过 | `bg-2`，pid 18716，存活 |
| e2 | 会话 dispose 后无残留后台进程 | 通过 | `dispose=ok`；pid 18716 `alive=false`；端口 64463 `ECONNREFUSED` |

诊断事件佐证（内存 spy，非落盘）：`shell.review.start/end`、`background.start`（pid 19680/18716，state running）、`background.exit`（state stopped，exitCode 1）、`background.stop`（durationMs 134/86）按真实事件顺序出现，字段与白名单一致。

### 4.5 为什么 exitCode 是 1

Windows 上 `killProcessTree` 走 `taskkill /pid <pid> /T /F`（`src/common/runtime-core/process-tree.ts`），是强制终止而非 POSIX 的优雅 SIGTERM；Node 被杀后退出码为 1。管理器如实返回 `state: stopped` 与真实 `exitCode 1`，并在预算内观察到 `close`，不构成失败。`server.js` 的 SIGTERM 优雅退出处理在 Windows 上未被触发；POSIX 分支本轮未测试。模型在第 2 轮把这解释为“SIGTERM 终止”，属于模型叙述不准确，产品返回本身没有谎称信号名。

## 五、`run_shell` 阻塞对照（可选补充）

同一真实链路与同一 `node server.js`，向会话注入 `shellExecTimeoutMs: 3000`，提示真实模型只能使用 `run_shell`：

```bash
node "test/测试/background-tasks-e2e-real-model/run-shell-comparison.ts"
```

退出码 **0**，回合耗时 9906ms。真实模型只调用了 `run_shell`（未调用 `start_background_task`）；工具阻塞 **3107ms** 后返回：

```text
run_shell 超时已终止（3000 ms）：命令超过本次执行时限，已被终止。
stdout:
ANS_E2E_LISTENING http://127.0.0.1:64524/ PID=6752
```

回合结束后 pid 6752 已消失、端口 64524 已关闭。对照结论：`run_shell` 必须等到命令结束或被 3s 时限终止才返回，服务器无法跨回合存活；同场景下 `start_background_task` 4–7ms 即返回且服务器持续运行。

## 六、实际命令、退出码与证据身份

所有命令 cwd 为仓库根；每次执行前均 `export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"` 并 `. /c/Users/51054/AppData/Local/Temp/ans-e2e-model.env`。

| # | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| 1 | `node "test/测试/background-tasks-e2e-real-model/pi-smoke.ts"` | 0 | 真实模型回复 OK，1487ms |
| 2 | `node "test/测试/background-tasks-e2e-real-model/e2e-background-real-model.ts"` | 0 | 12/12 断言通过，13930ms（三轮模型调用总计） |
| 3 | `node "test/测试/background-tasks-e2e-real-model/run-shell-comparison.ts"` | 0 | `run_shell` 阻塞 3107ms 后超时终止，服务器未存活 |

测试产物 SHA-256：

- `e2e-background-real-model.ts`：`605ab24a93c0940de2d444f5db79bfa164b48ad748b3f7d7484cb4ff6d65a2f1`
- `pi-smoke.ts`：`d0ab4f504d6b8ea40166d6b88d0d81b7fd0d68bbe9aa8ae3bb9ebb348ccd2431`
- `run-shell-comparison.ts`：`2ce34de756ff20c78f3f89bea143eb6b5f7b6bf1b61f9d5167592f32f8815855`
- 证据日志哈希见 `sha256sum` 输出：`e2e.log 14d88ba9…`、`run-shell-comparison.log 1d777905…`、`smoke.log ebc028ac…`。

## 七、失败、限制与缺失证据

1. **未发现产品失败**：12/12 断言通过，无失败分支。
2. **平台限制**：仅 Windows 11 实测；POSIX `detached` 进程组终止与 SIGTERM 优雅路径未运行。Windows 使用 `taskkill /T /F`，因此 stop 的 exitCode 为 1，SIGTERM 处理未被触发。
3. **入口范围**：使用任务指定的真实 `openRoleSession` 全链装配，未启动 Electron 桌面或 CLI 交互界面；O1 桌面任务面板不在本轮范围且未实施。
4. **替身范围**：仅 ShellGate 审批/分类通道为记录并允许的替身；真实模型、真实网关、真实进程、真实端口、真实管理器与 dispose 均为实测。审核卡/客户确认 UI 未参与，不能据此宣称桌面审批体验已验证。
5. **模型/网关行为**：单模型（`deepseek-v4-flash[1m]`）、单次运行；模型首轮即正确调用工具，未使用重试。模型在 `submit_report` 上出现一次参数类型错误后自行重试成功，与本功能无关；模型对 exitCode 1 的“SIGTERM”解释不准确。换模型/多次运行的行为未覆盖。
6. **O5 应用直接退出残留**：未授权、未实施，也未测试；本报告只验证显式 `stop` 与 `dispose` 清理。
7. **环境文件权限**：任务说明 0600，实测 644；未改权限。
8. **清理核查**：测试结束后独立检查 pid 19680/18716/6752 均不存在，端口 64445/64463/64524 均拒绝连接；首个冒烟失败遗留的 `%TEMP%\ans-e2e-smoke-*` 已删除，临时项目目录已清理。

## 八、结论

**测试角色结论：通过（限于本报告候选、Windows 11、真实 Pi 引擎 + 客户网关、单次运行与已列证据范围）。** 真实模型成功调用了四个后台工具；启动工具 4–7ms 返回任务号与真实 pid，回合结束时服务器仍存活；下一轮 `list`/`read` 能看到任务与真实端口日志；`stop` 后进程与端口消失；`dispose` 清理了第二个运行中实例。`run_shell` 对照证明前台执行会阻塞并在 3s 时限被终止。未发现阻断性缺陷。

本结论不代替独立验收（A1 三态判定）与客户业务确认，也不授权提交、推送、发布或部署。缺失证据与平台限制见第七节，未把它们算作通过。

## 关联

- 所属功能：[会话级后台任务](../../../运行时核心/docs/feature/background-tasks.md)
- 权威设计：[后台任务设计](../../../项目管理/docs/design/2026-10-22_design_background-tasks.md)
- 验收标准 A1：[验收标准](../../../独立验收/docs/design/2026-10-22_design_background-tasks-acceptance.md)
- 上一次独立测试验证：[测试验证报告](2026-10-22_change_background-tasks-verify.md)
- 本次测试代码与证据：`test/测试/background-tasks-e2e-real-model/`（含 `evidence/`）
