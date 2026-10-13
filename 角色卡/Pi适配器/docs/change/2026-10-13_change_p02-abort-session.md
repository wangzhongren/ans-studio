---
id: change_p02-abort-session
type: change
title: P0-2「停当前轮次」第一环——RoleSession 契约增可选 abort?()，真适配器透传 Pi SDK session.abort()
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: implemented
role: Pi适配器
design: 角色卡/产品/docs/design/2026-10-13_design_desktop-ux-improvement-proposal.md（P0-2，客户批准）
scope: P0-2 中属于 Pi适配器的最底环（契约 + 真适配器）；编排句柄与桌面停止入口为后续环节
events:
  - date: "2026-10-13"
    kind: implemented
    summary: RoleSession 增可选 abort?(): Promise<void> | void（§4 冻结契约家，同 PromptOptions 演进先例）；makeRoleSession 抽出并实现 abort 透传；契约形状钉（可选性/双态返回型）+ 桩件透传/dispose 顺序 + SDK 级端到端（settled 恰 1、交互 fail-closed、会话可继续、空轮次 no-op）；typecheck 全仓零错误、本目录 171 全绿、全量 2 红恰为既有基线
---

# P0-2「停当前轮次」第一环：契约与真适配器

## 一、问题与范围

客户批准的 P0-2：桌面删了「结束会话」按钮后，客户对跑飞的轮次（真模型一轮数分钟、几十次工具调用）没有任何停止手段。链路是「桌面停止入口 → 编排句柄 `RoleSessionHandle` → 适配器会话 → Pi SDK」。本角色负责**最底环**：

1. **契约**（`src/provider/pi/session.ts`，§4 冻结契约家）：给会话接口加**可选**中止能力；
2. **真适配器**（`src/common/pi-adapter/real-adapter.ts`）：实现它——透传 Pi SDK `session.abort()`；
3. 上层接线（编排句柄 `abort()`、桌面停止入口）**不在本轮**，契约形状以本条钉死为准。

## 二、契约形状裁定

**落点：`RoleSession`（会话对象），不是派工文本字面写的 `RuntimeAdapter`（工厂）。**

- 中止语义是**会话级**的——「中止当前进行中的 prompt 轮次，不销毁会话，本会话仍可继续发下一条」只对 `bindRole` 返回的会话对象有意义；`RuntimeAdapter` 是工厂（`composeContext`/`bindRole`），没有「当前轮次」可言。
- 产品提案钉的链路是「编排句柄 → 适配器 `session.abort()`」；编排句柄（`openRoleSession`）包装的恰是 `bindRole` 返回的 `RoleSession`（`src/pipeline/orchestration/run-role.ts:370` `const session = await adapter.bindRole(setup.role)`、`:381` 起的 handle）。
- 契约演进先例一致：`PromptOptions`（K-2）同样落在 `RoleSession.prompt` 的可选参数上。
- 处置：钉在 `RoleSession`；`RuntimeAdapter` 处留一行指引注释（不重复、不改变其成员）。此裁定已如实登记于 changelog，供编排/桌面环节照此消费。

**冻结形状**：

```ts
abort?(): Promise<void> | void;
```

- **可选**：既有实现/替身不实现也完全合法（假适配器即不实现）；消费方必须 `session.abort?.()`，**缺席 = 该运行时不支持停止，上层须如实告知（如「当前运行时不支持停止」），不得静默装作已停**（提案的 fail-closed 口径；demo 替身会话即此形态）。
- **语义**（文档注释逐条写死）：停当前轮（模型生成与工具执行一并停）；**不销毁会话**（abort 后可继续发下一条，历史与模型上下文保留）；与 `dispose`（收口整只会话）不同；**无进行中轮次 = no-op 不抛错**；**中止后 settled 仍会发射**（既有行为，消费方不会挂起）；**等待中的客户确认/交互一并 fail-closed**；错误如实上抛。
- **返回型两态**：同步 `void` 或 `Promise<void>`（真适配器是 async；替身可同步）。

## 三、真适配器实现

- **`PromptCapableSession` 补 `dispose(): void`**——该接口自述「结构上兼容 AgentSession」，会话收口需要它。
- **会话组装抽为导出工厂 `makeRoleSession(deps)`**（同 K-2 把 prompt 包装抽为 `makeRolePrompt` 的桩件接缝先例）：`prompt` 逐字复用 `makeRolePrompt`；`events` 逐字不变（队列流）；`dispose` 顺序逐字不变（**退订 settled → SDK `session.dispose()` → `queue.close()`**）；新增 `abort(): Promise<void> { await deps.session.abort(); }`。`bindRole` 改用该工厂——纯提取 + 一项新增，行为零回归（dispose 顺序有桩件用例钉住）。
- **不吞错**：`abort` 把 SDK 的错误如实上抛；与 `makeRolePrompt` 失败路径里防御性的 `await session.abort()`（catch 内忽略次级错误）职责不同、互不干扰。

## 四、Pi SDK 语义核实（读安装包 dist 源码，非文档转述）

| 语义 | 依据（文件:行） |
| --- | --- |
| 无在飞轮次 abort = no-op 不抛错 | `agent.abort()` = `this.activeRun?.abortController.abort()`（pi-agent-core `agent.js:218-220`，可选链）；`waitForIdle()` 在 `isIdle` 时立即返回（agent-session.js:1922-1925、`isIdle` :1053）；`abortRetry/abortCompaction/abortBranchSummary` 均 `?.` 守护（:1913-1915、:3067、:2298-2300、:2305-2307） |
| abort 后 settled 仍发射 | `_emitAgentSettled`（agent-session.js:684-691）无论 `_agentRunAbortRequested` 与否都发 `agent_settled`（带 `aborted` 标志）；**先发射后解 idle**（:703/:707）⇒ `abort()` 返回时 settled 必已入队 |
| 进行中的 `prompt()` 正常返回（不 reject） | agent 层 `runWithLifecycle` 把中止落成 `handleRunFailure` 的 `stopReason:"aborted"` 收尾消息、不向上抛（agent.js:344-376）；`prompt()` 末尾 `await _runAgentPrompt(messages)`（agent-session.js:1643）随之正常 resolve |
| abort 带动等待中的交互 fail-closed | run 级 signal 逐层传入工具 `execute` 第三参（agent-loop.js:574、agent.js:428-434）；`agent.abort()` 中止该 controller ⇒ 交互工具内 `raceAbort`（timeout.ts:121-138，设计 A-6）立即以「未获客户同意（…被中止…）」返回，`askCustomer` 的 `finally` 收 `InteractionGate` 闸（tools.ts:640-672） |

**A-6 交互中止核查结论（派工要求核实项）：SDK abort 已天然带动，无需补接线，本层只注明并钉住。**

## 五、测试（`test/pi-adapter/abort.test.ts`，6 条）

1. **契约形状钉（无 Pi）**：无 `abort` 的会话对象（含**假适配器替身**）仍满足 `RoleSession`——编译期 + 运行期断言可选性成立；`abort` 返回型允许「同步 void / Promise / async 函数」三态。
2. **makeRoleSession 桩件（无 Pi）**：`abort()` 恰好透传一次到底层 `session.abort()`、反复调用不抛错；`dispose` 顺序与提取前逐字一致；`events()` 流同一性。
3. **SDK 级主用例（faux provider，离线）**：boot 逐字复刻 `bindRole` 接线（含**出厂治理扩展**），走**生产 `makeRoleSession`**——确认卡挂起中（客户永不作答，即 P0-2 要停的「跑飞轮次」）`abort?.()`：不抛错；进行中的 prompt promise 正常返回；gate 收闸（等待中的客户确认 fail-closed 返回）；**settled 恰 1**；随后会话可继续发下一条（settled 第 2 次 + 助手消息「收尾」进事件流 = 不销毁会话）。
4. **SDK 级 no-op 用例（faux，离线）**：prompt 前 / 两轮之间 abort 均不抛错、不产生也不吞掉轮次（settled 计数 0 → 1 → 3），会话随后照常工作。

配套小改：`test/pi-adapter/prompt-images.test.ts` 的桩件会话补 `dispose`（随 `PromptCapableSession` 接口补齐，无行为断言变化）。

## 六、验证

- `npm run typecheck` → **全仓零错误**。
- `node --test "test/pi-adapter/**/*.test.ts"`（带引号）→ **171 pass / 0 fail**（166 既有全绿 + 5 新增）。
- 全量 `node --test "test/**/*.test.ts"`（带引号）→ **919 计 / 916 pass / 2 fail / 1 skip**；2 红恰为既有基线红（`test/桌面应用/pi-config.test.ts` 检出目录名断言、`test/项目管理/shared/path-primitives.test.ts` macOS `/private/var` 环境红），均在本角色边界之外。
- 环境：Node v24.14.0 / macOS（darwin 25.6.0）；未 git 操作、未重启桌面应用、未读 `.env`、未发真实模型请求（faux 进程内、keyless）、未打印凭据值。

## 七、边界 / 跨角色

- 只写本角色 Section 1：`src/provider/pi/session.ts`、`src/common/pi-adapter/real-adapter.ts`、`test/pi-adapter/**`、`角色卡/Pi适配器/**`。
- **供编排（后续环节）**：`openRoleSession` 的 `RoleSessionHandle` 增 `abort()` → `session.abort?.()`；缺席（demo 替身）时如实回「当前运行时不支持停止」。进行中的 `send()` promise 在 abort 后正常返回（SDK 不 reject），`settled` 照常收尾。
- **供桌面（后续环节）**：停止入口按提案 P0-2 交互口径（工作中才出钮、点击后聊天流如实一行「已请求停止当前轮次」、轮次以 settled 收尾后徽标回「空闲」、重复点击幂等——`abort()` 的 no-op 语义天然幂等）。
- **不碰**已裁定的删除（不恢复「结束会话」按钮）；程序化 `dispose`/`stop()` 语义不变。
