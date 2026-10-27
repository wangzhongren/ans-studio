# 桌面窗口：ready 唤醒误用 Claude（项目已选 Pi）

- 日期：2026-10-27
- 角色：桌面窗口
- 触发：客户反馈应用重启后导入 tiny-snake，项目 UI/角色已选 Pi，但 `flow.ready-wake` 自动唤醒用了
  Claude，诊断 `flow.ready-wake.send.failed`：`Claude SDK 运行失败：Claude 缺少 API key：
  ANTHROPIC_API_KEY`（roleId liaison）；随后靠客户消息才让运营继续。gate 恢复
  （`gate.review.recovered/recovered-pass`）本身成功。
- 状态：实现完成，桌面 interface/验收派发套件通过；未跑真实 Electron e2e、未独立验收、未 commit/push、
  未重启运行中的应用。

## 症状与根因

导入/重启后的同一次验收扫描中：

1. gate 恢复先生成一条**应用系统行**（`delivery-note`）。系统行为 UI 展示在缺少引擎事实时用兜底
   `runtime:"claude"` 发出。
2. `emitSessionEvent` 把**任何**事件信封的 runtime 写进 `acceptanceRuntimeHints`——包括这类 UI 兜底系统行。
3. 随后的 `wakeStewardForReadySteps` 经 `resolveNoteRuntime` 先读 `acceptanceRuntimeHints`，于是拿到
   被污染的 `claude`；尽管项目持久化选择/已选/当前会话都是 Pi，仍以 Claude 打开运营会话，缺
   `ANTHROPIC_API_KEY` 时直接失败。

根因两点：**UI 兜底 runtime 被当成项目真实引擎**；**弱提示优先于强证据**（持久化选择/已选/当前会话）。

## 修复后的行为

### 1. `resolveNoteRuntime`（`app/desktop/interface.ts`）

治理唤醒/系统行的引擎择路优先级改为：

1. 显式 `preferred`（事件/调用方给出的真实 runtime）；
2. **当前角色会话 runtime**（`manager.activeRuntimeFor(projectRoot)`）；
3. **本进程治理会话 runtime**（`manager.governanceRuntimeFor(projectRoot)`）；
4. 持久化 per-project 选择 / `.ans/sessions` 磁盘证据 / 凭据可用性（`resolveAcceptanceRuntime`，沿用
   “绝不无凭据回退 claude”的共享解析器）；
5. 最后才用真实会话事件留下的弱提示（`acceptanceRuntimeHints`）。

因此项目已选 Pi 时，ready/delivered/coordination 唤醒与系统行都会用 Pi；只有解析器确实找不到可用引擎时
才返回 undefined（调用方如实 `runtime-unresolved`，不派发、不重试）。

### 2. `acceptanceRuntimeHints` 只接受真实会话事件

`emitSessionEvent` 不再把 `event.kind === "message" && detail.source === "delivery-note"` 的应用系统行写入
提示表——它们是 UI 展示行（常用 `"claude"` 兜底），不代表项目引擎；真实会话事件（assistant/tool/
settled/prompt 输入回执等）仍照旧更新。

## 回归验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` | exit 0 |
| 新增回归用例 | `node --test --test-name-pattern="2026-10-27 重启/导入" "test/桌面应用/interface.test.ts"` | **1/1 通过** |
| 桌面 Interface | `node --test "test/桌面应用/interface.test.ts"` | **141/141 通过** |
| 桌面验收/派发/gate | `node --test "test/桌面应用/acceptance-dispatch.test.ts"` | **99/99 通过** |

回归用例（`test/桌面应用/interface.test.ts`）模拟真实重启/导入：

- 真实持久化 `runtime-selection` 写 Pi；`resolveRuntimeFn` 只按真实优先级（活跃/已选/持久化）返回 Pi，
  不再无条件返回；
- 同一 flow 同时有 pending gate + pass 报告（触发 gate 恢复系统行，`runtime:"claude"` 兜底）与 ready
  步骤（触发 ready 唤醒）；
- 打开 `runtime === "claude"` 的会话时抛“缺少 ANTHROPIC_API_KEY”以复现真机；
- 断言：运营会话以 **Pi** 打开、无任何 Claude 打开尝试、解析器收到持久化 Pi、`[自动推进]` 成功投递；
  同时确认夹具有 claude 的系统行（证明污染源存在但已不再影响择路）。

## 残余风险

- `resolveNoteRuntime` 现在每次未命中活跃/治理会话时要读持久化文件、会话目录与凭据（异步只读）；
  治理唤醒频率低，可接受。
- 若项目持久化选择与实际可用凭据不一致（如 Pi 选择但 Pi 凭据缺失），共享解析器会按既有策略选择其它
  有凭据引擎或如实失败；本修复不改变该共享策略。
- 未跑真实 Electron e2e；重启后 tiny-snake 的 ready 唤醒待主上下文统一重启验证。
