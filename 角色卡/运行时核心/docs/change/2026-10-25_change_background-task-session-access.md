---
id: background-task-session-access-change
type: change
title: 会话级后台任务访问面：list/read/stop 三个绑定会话方法
created: "2026-10-25"
updated: "2026-10-25"
timezone: Asia/Shanghai
status: implemented-unverified
related: [background-tasks]
events:
  - date: "2026-10-25"
    kind: implemented
    summary: RoleSession 新增 listBackgroundTasks/readBackgroundTask/stopBackgroundTask，Service 只转调同一管理器；新增 3 例测试通过，定向 typecheck 0 错；独立验收未进行
---

# 会话级后台任务访问面（桌面展示用）

**状态分开写**：已实现（下列改动路径全部落盘）；已验证（本机 Windows 上的新增测试与定向 typecheck，见「验证」）；**未验证**（独立验收、桌面/Pipeline 消费方接线、非 Windows 平台与真实模型入口）。

## 以前怎样、现在怎样

**以前**：后台任务只在模型工具面可见。桌面应用要展示任务，只能自己造一套状态，或让模型调用工具再把文本转出来；没有稳定的会话对象访问面。

**现在**：`RuntimeAdapter.bindRole()` 返回的绑定会话（`RoleSession`）提供三个**可选**方法，直接转调当前会话已有的后台任务管理器：

```ts
listBackgroundTasks(): BackgroundTaskSnapshot[];
readBackgroundTask(taskId: string, options?: BackgroundTaskReadOptions): BackgroundTaskReadResult | undefined;
stopBackgroundTask(taskId: string, options?: BackgroundTaskStopOptions): Promise<BackgroundTaskStopResult>;
```

典型用法：桌面任务面板打开时 `listBackgroundTasks()`；展开某任务时 `readBackgroundTask(taskId, { stream: "stdout", tailLines: 100 })`；用户点停止时 `stopBackgroundTask(taskId)`，并按返回值如实显示 `stopped` / `alreadyEnded` / `kill-timeout` / `unknown-task` / `closed`。

## 行为契约

| 场景 | `list` | `read` | `stop` |
| --- | --- | --- | --- |
| 普通受治理会话（注入了 `ShellGate`） | 当前保留任务快照数组 | 管理器语义（默认 both / 40 行，上限 200，`tailClamped`、UTF-8 安全截断） | 管理器语义（观察到 `close` 才 `stopped`；已结束 `alreadyEnded:true`；预算内未收口 `kill-timeout`；未知 taskId `unknown-task`） |
| 无管理器（未注入 `ShellGate`、判断会话） | `[]` | `undefined` | `{ ok:false, reason:"closed", message:… }`，不抛异常 |
| 会话 `dispose()` 开始后 | `[]` | `undefined` | 同上（`reason:"closed"`），不抛异常 |

其他约束：

- 管理器仍是 `providerFor` 在「普通受治理会话 + `ShellGate`」时创建的**那一个**实例；三个方法不新建管理器、不引入第二套任务表，也不改变四个模型工具、schema、门禁或模型协议。
- `dispose()` 统一终止并清空任务；dispose 后再调用这三个方法不会重建管理器或复活任务。
- 任务表/日志/pid 只在内存，任务只存在于会话生命周期内；应用重启或会话关闭后 `list` 为空，旧任务号只返回「未知任务」。桌面不得把 `kill-timeout` 或 `unknown-task` 显示成「已停止」。

## 改动路径（位置 → 改动）

| 文件 | 改动 |
| --- | --- |
| `src/model/runtime.ts` | `RoleSession` 增三个可选方法与契约注释（只读快照、无管理器/关闭后的明确返回、`kill-timeout` 如实）；复用既有 `BackgroundTask*` 类型，不新增第二份形状。 |
| `src/service/runtime/session.ts` | 绑定会话包装器实现三个方法：`disposed` 前置检查 + 转调 `provider.backgroundTasks`；无管理器返回空/`undefined`/明确 `closed` 失败；不创建新管理器。 |
| `test/runtime-core/background-session-access.test.ts`（新增） | 3 例：无管理器（含判断会话）、有管理器转调与选项钳制/未知任务、dispose 后终止任务且三个方法失效不复活。 |
| `角色卡/运行时核心/api-spec.md` | 登记方法签名、返回语义、生命周期与桌面展示约束。 |
| `角色卡/运行时核心/functional-description.md` | 模块说明补充会话访问面。 |
| `角色卡/运行时核心/docs/feature/background-tasks.md` | 新增「会话访问面（桌面任务面板）」节与历史记录。 |
| `角色卡/运行时核心/feature-map.md` | 更新后台任务导航行的范围与证据链接。 |

## 明确不做 / 未覆盖

1. 不改 `app/**`、`app/renderer/**`、共享 i18n；桌面 UI 与 Pipeline/`RoleSessionHandle` 的消费方接线属各自属主。
2. 不改四工具、schema、管理器实现、审核/门禁与模型协议；没有新增任务能力或权限。
3. 不提供跨会话/跨重启查询、日志落盘或增量读取；这些仍是原功能明确不承诺的限制。
4. 未跑真实模型/凭据/网络，未做独立验收；本机为 Windows 11。

## 验证（同一候选；本机 Windows 11 / Git Bash）

环境：`Node v24.22.1` / `npm 11.19.1`；工作树 `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination`；`HEAD=2a634144b61a358b67fc3fe37c17c0e7fbdaf6f7`；候选 blob：`src/model/runtime.ts` `93920299737c53a1408208b4988c48c027ae54f0`、`src/service/runtime/session.ts` `ee4eb1ef9cc0fdc53e852a3d9b28c446564660a9`、`test/runtime-core/background-session-access.test.ts` `796a267a229a628c25d88a0aa24885197c850d8f`；未 commit、未 push。

### 新增行为测试

命令（工作树根）：

```text
node --test --test-concurrency=1 "test/runtime-core/background-session-access.test.ts"
```

结果：**退出码 0；3 个测试，3 通过，0 失败，0 跳过**。

| 测试名 | 覆盖 |
| --- | --- |
| 无管理器：list 为空、read 未找到、stop 明确失败且不抛（含判断会话） | 无 `ShellGate` 会话与 `shellJudge` 会话均无管理器；`stop` 返回 `closed` 且无伪造快照 |
| 有管理器：list/read/stop 与选项转调当前会话管理器 | 真实子进程；list 快照；read 的 stream/tailLines/`tailClamped`；未知 taskId；stop `force`、`stopped`、`alreadyEnded` |
| dispose 后：运行中任务终止，list/read/stop 明确失效且不复活管理器 | dispose 终止真实进程；之后 list 空、read `undefined`、stop `closed`，重复调用仍不复活 |

### 受影响目录回归

后台任务相关文件（既有管理器/工具/Service 接线 + 本批）：

```text
node --test --test-concurrency=1 test/runtime-core/background-tasks.test.ts test/runtime-core/background-review.test.ts test/runtime-core/background-engines.test.ts test/runtime-core/background-contract.test.ts test/runtime-core/background-session-access.test.ts
```

结果：**退出码 0；34 个测试，34 通过，0 失败，0 跳过**（既有 31 + 本批 3）。

完整运行时核心目录：

```text
node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"
```

结果：**298 个测试，291 通过，3 失败，4 跳过；退出码 1**。本文件 3 例全过。3 个失败与 2026-10-23 备忘录登记的既有 Windows 环境红一致：`file-write-safety.test.ts` 1 例、`session-store.test.ts` 2 例，均为 `symlink` 报 `EPERM`（当前 Windows 无符号链接权限），不是本批引入；4 跳过同基线。

### 类型检查

- 全仓 `npm run typecheck`：**退出码 1**，仅 2 条错误，均在本任务写集之外的未跟踪文件 `test/桌面UI/tool-error-view.test.ts`（`Record<string, unknown>` 传给 `ToolErrorSummaryProps`、`unknown` 不能作 `ReactNode`）。该文件在本次工作开始前已存在（`git status` 为 `??`），属桌面 UI 在飞工作，本角色不改。
- 定向检查（`src/**` + `test/runtime-core/**`，临时 tsconfig 继承根配置，检查后删除）：**退出码 0，0 错**。

## 从哪里继续看

- 当前功能与完整流程：[后台任务](../feature/background-tasks.md)
- 原始设计与验收：[后台任务设计](../../../项目管理/docs/design/2026-10-22_design_background-tasks.md) · [验收标准](../../../独立验收/docs/design/2026-10-22_design_background-tasks-acceptance.md)
- 首次实施记录：[2026-10-22 change](2026-10-22_change_background-tasks.md)
- 契约：[api-spec](../../api-spec.md)
