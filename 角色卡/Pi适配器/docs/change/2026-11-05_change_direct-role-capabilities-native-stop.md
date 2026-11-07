# Pi 原生停止事实增补

- 日期：2026-11-05；owner：Pi适配器；类型：已确认 T1.1 的 owner 实施细化；风险 T3。
- 授权：根 communication 的客户原话「确认 T1.1，补三引擎停止事实」，团队计划 SHA256 `D2AFC929DF7D1AFD8294C50582E159449EB58C143454DF63F948615FBD2DF064`。本记录不改变共同接口或验收口径。
- 用户入口：Service 对真实 Pi RoleSession.nativeLifecycle 调用 inspect/stopAndInspect；共同类型只消费 `src/model/runtime.ts`。

## 实施提案（源码前）

在 `src/common/pi-adapter/real-adapter.ts::makeRoleSession` 保持原有 prompt/abort/dispose API，生产额外传角色、实际 native session ID、Core currentTurnId 和 owned MCP transport 观察器。每 bind 创建独立 instanceId；在每次 raw SDK prompt 开始捕获 Core turn，跟踪真实 promise 最终返回，外层 timeout、SDK agent_settled、主动 abort 或 dispose void 均不能替代 raw 终结。SDK 公开 tool start/end 跟踪在途工具，并读 isStreaming/isCompacting/pendingMessageCount；stop 对实例与轮次做匹配，使用有界等待且保留迟到事实。

MCP 只从自持 StdioTransport 的公开 pid/onClose 读取主进程事实：源码核实 onClose 来自真实 child close；close promise 或 session_shutdown 完成不能替代此事件。实际 SDK 不给主进程 exitCode/signal 与完整后代树证明，故 treeStatus 与 processCoverage 始终 unknown；即便无 MCP 也不凭 runtime 名或空数组推 complete。Git 受管 surface 仍 unknown。不能宣三引擎或整体停止完成。

精确源写仅已授权 `real-adapter.ts` / `session.ts`，测试仅 `abort.test.ts` / `settled-once.test.ts` / `mcp-fixture-server.ts`。`session.ts` 实际需要一行 getter，让 legacy wrapSession 保留真实 hook（原提案预计无需改；只在已授源内细化）。不新增源测文件、依赖、权限、OS helper 或真实模型请求；保全部旧差异。

## 离线验证计划

原 makeRoleSession 定向桩测覆盖 raw 未终结、迟到终结、工具在途、超时、重复 abort、dispose 早返、身份与轮次不符、无进程覆盖；真实 StdioTransport + owned Node MCP fixture 覆盖真实 close、延迟 close、close 不回报的负例。正例只断言实际观测字段，树覆盖缺失仍阻塞。运行精确测试、主 typecheck 与 diff-check；原始首红/复测/环境/自然退出及 source before/after SHA 保存本人证据目录。跨角色链与独验交后继。

## 结果

已实施 owner 事实接线，未独立验收，未证明 Pi 停稳。`real-adapter.ts::makeRoleSession` 跟踪真实 raw promise、公开 SDK idle getters/tool events；生产 `bindRole` 给出真实角色/native session/Core turn，MCP transport 每次创建即加入本 bind 的观察列表；`session.ts::wrapSession` 原样返回同一 hook。stop 校验身份与轮次，停止后禁止复用旧 native instance，重复 stop 共享同一原生清理，timeout/取消只结束等待并保留迟到事实。空 process list 与未启动无 PID 的 transport close 仍不能证明退出。

最终精确 `node --test test/pi-adapter/abort.test.ts test/pi-adapter/settled-once.test.ts` **16/16**、exit0（新增6例）；其中真公开生产入口→真实 SDK faux→真实 owned Node MCP 的 raw turn/PID/close，以及 legacy wrapper 的 hook 透传已贯通。相关 MCP/last-resort/followup/images **35/35**，legacy judge **7/7**。无新增 skip、cancelled 或 force-exit。首红及最终 typecheck/diff/source 指纹见[有界原证据](../change/2026-11-05_native-stop-evidence/manifest.json)。

首红保留于 `07-production-hook-final.log`：测试把 lazy MCP 的 bind 返回误当子进程已 spawn，实际首 prompt 才创建 transport。将同一 PID/running 断言移动到实际首 raw prompt 后；未削弱断言，`08-production-hook-final.log` 16/16。随后 `09-typecheck-delivery.log` 暴露测试误把 MCP 选项写入 legacy 公共参数（TS2769），没有扩公共类型，而把 MCP 链改经正式 RuntimeProviderOptions 生产分支，legacy 单独验证 hook 透传；`11-production-legacy-final.log` 16/16、`12-typecheck-final.log` exit0。`10-diff-check.log` 发现本人 memo/map 新增 EOF 空行（exit2），已精确收尾并复测。最初基线10/10。未做真实模型/账户、依赖/角色边界/Git写、全仓回归或跨角色 stop/restart 独验。

明确缺口：SDK 只公开主 PID 与 child close 事件，不公开主 exitCode/signal、完整后代树、模型 HTTP transport close 或 SDK 未注册后台子进程覆盖。`processCoverage` 和每个 `treeStatus` 固定 unknown，静止表象不提升 quiescent；Git 受管 surface 也仍 unknown。后继 Core/O/Q 必须按此阻止停稳后重启，不得用本角色自测或 native SDK 的名字代替完整停止证明。当前说明见[Pi 原生停止事实](../feature/native-stop.md)。
