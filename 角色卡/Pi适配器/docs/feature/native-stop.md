# Pi 原生停止事实

Service 从真实 Pi RoleSession.nativeLifecycle 读取本次 bind 的实例身份、实际 native session ID、raw SDK prompt 开始时捕获并保留的 Core turn，以及可见工具和 MCP 主进程终态。公开 legacy wrapper 透传同一 hook；假适配器与没有 nativeObservation 的旧测试 helper 不制造 hook。

```mermaid
flowchart TD
  A[真实 bind 创建 instanceId] --> B[raw SDK prompt 捕获 Core turn]
  B --> C[公开 SDK tool start/end 和 idle getters]
  C --> D[inspect 返回当前事实]
  D --> E{stop 的 instance/turn 匹配?}
  E -- 否 --> F[拒绝且不请求停止]
  E -- 是 --> G[共享 abort/shutdown/owned transport close]
  G --> H{raw 已终结/工具排空/实际 child close?}
  H -- 否 --> I[有界等待; 超时或取消返回当前 pending 事实]
  I --> D
  H -- 是 --> J[主进程 exited; 全树/HTTP close 无证据仍 unknown]
```

SDK agent_settled、abort 成功、外层 prompt timeout、dispose void 或 transport.close 提前返回均不能替代 raw promise 与真实 child close。停止后旧 native instance 不再接新 prompt；迟到的 raw 终结与 MCP close 仍更新 inspect。每 bind 的 transport 列表包含真正创建的每次 transport，保留 PID；没有启动 PID 的 close 事件仍 unknown。

当前没有完整子进程树或模型 HTTP close 公共事实；processCoverage/treeStatus 仍 unknown，即便无 MCP/工具且 SDK idle 也不报告 quiescent。此限制包含 Git 受管 surface，Core 必须阻塞依赖完整停稳的重启。

实现、离线测试、首红与证据见[变更记录](../change/2026-11-05_change_direct-role-capabilities-native-stop.md)。未独立验收，未宣三引擎完成。
