# Codex适配器工作备忘录

2026-10-14：客户确认运行时接入组并指示新建角色、开发。职责与边界已由 ANS Governance 建立；当前尚未实现或验证。

2026-10-14 X0：已永久绑定本角色；读完治理技能、角色边界、项目规则与 ANS-RUNTIME-V2 revision 1。实际 SDK 0.162.1 可传 MCP config，但本机 alpha local config/read 探针发现根 map 覆盖合并而非替换。PM 已授权必要 app-server 运输；第二轮枚举逐个 disabled 后只有 ANS 启用，假外部 MCP 未启动。源码仍未写入。X1 依赖 `src/model/runtime.ts` 已冻结契约；说明与独立影响评估见 `docs/design/2026-10-14_design_codex-governed-transport.md`。装配应添加 CLI 0.162.1 与 MCP SDK 1.32.1，安装后刷新 alpha 来源的协议/隔离证据。

2026-10-14 X1：PM 接受动态代理精确轮 ID -> 真实内存 MCP 的必要细化。当前禁用全部 native MCP，再通过 dynamicTools/item/tool/call 调用唯一注入 handler。原始 signal 在排队前捕获；上游 resolved、停止、失败、dispose 和 settled 都使其失效。实现及 14 项自有测试完成；Codex 自有 tsc0，全仓缺 Claude 依赖而失败。持久探针 `test/codex-adapter/native-probe.mjs` 已按真实 alpha 验证全部安全配置和动态类型，安装 CLI 0.162.1 后默认运行，不把 alpha 冒充稳定版。最终原证据与候选见 change 文档。

2026-10-14 X1S：API 地址选中值 trim 后空白 -> 官方默认；显式空白覆盖环境，显式非空优先，required model/key 和 URL 安全检查保持。当前安装库自有16/16、全仓tsc0。已读取装配稳定CLI探针通过的原证据，运输未变不重复probe；当前源码/测试组合a1c40099de0496efa8452aacf3f944fc462bdb90ac3c185421b88161bc642ede，详见fix记录。

