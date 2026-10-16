# Codex适配器工作备忘录

2026-10-14：客户确认运行时接入组并指示新建角色、开发。职责与边界已由 ANS Governance 建立；当前尚未实现或验证。

2026-10-14 X0：已永久绑定本角色；读完治理技能、角色边界、项目规则与 ANS-RUNTIME-V2 revision 1。实际 SDK 0.162.1 可传 MCP config，但本机 alpha local config/read 探针发现根 map 覆盖合并而非替换。PM 已授权必要 app-server 运输；第二轮枚举逐个 disabled 后只有 ANS 启用，假外部 MCP 未启动。源码仍未写入。X1 依赖 `src/model/runtime.ts` 已冻结契约；说明与独立影响评估见 `docs/design/2026-10-14_design_codex-governed-transport.md`。装配应添加 CLI 0.162.1 与 MCP SDK 1.32.1，安装后刷新 alpha 来源的协议/隔离证据。

2026-10-14 X1：PM 接受动态代理精确轮 ID -> 真实内存 MCP 的必要细化。当前禁用全部 native MCP，再通过 dynamicTools/item/tool/call 调用唯一注入 handler。原始 signal 在排队前捕获；上游 resolved、停止、失败、dispose 和 settled 都使其失效。实现及 14 项自有测试完成；Codex 自有 tsc0，全仓缺 Claude 依赖而失败。持久探针 `test/codex-adapter/native-probe.mjs` 已按真实 alpha 验证全部安全配置和动态类型，安装 CLI 0.162.1 后默认运行，不把 alpha 冒充稳定版。最终原证据与候选见 change 文档。

2026-10-14 X1S：API 地址选中值 trim 后空白 -> 官方默认；显式空白覆盖环境，显式非空优先，required model/key 和 URL 安全检查保持。当前安装库自有16/16、全仓tsc0。已读取装配稳定CLI探针通过的原证据，运输未变不重复probe；当前源码/测试组合a1c40099de0496efa8452aacf3f944fc462bdb90ac3c185421b88161bc642ede，详见fix记录。


2026-10-15 Codex-A-1：固定本角色实施A4/C2.tp1 consumer r2；批准13/Core14均MATCH。生产仅session.ts，自有session.test.ts；22/22，实际命令6/6，pinned CLI0.162.1+realMCP本地假SSE回环绿，外部模型0。最终全仓typecheck0。候选/依赖与复跑脚本见docs/change/2026-10-15_change_tool-display-projection.md；不触protocol/config/他人文件。

2026-10-15 v1.0发行必要修复：仅session.ts默认JS CLI+Electron宿主时，spawn隔离env副本增加ELECTRON_RUN_AS_NODE=1。Node/显式native CLI不变。新增3实际spawn断言，自有25/25、tsc0、diffcheck0；真实Electron44.7+CLI0.162.1本地initialize/config/受限thread/start/dispose通过，模型0。生产SHA0b603897...，见docs/fix/2026-10-15_fix_packaged-electron-node-launch.md。装配必须保持runAsNode fuse并实际packaged测试；owner未在Windows验收，不动tag/commit。

2026-10-16 截断同构评估（对照Pi F-3，批准记录派发）：结论(b)无同构缺陷——Codex/Responses未完成终态在外部层即判错误（上游 issue openai/codex#38831），适配器如实映射failed（session.ts:515/519-521/447-448/457），无Pi式「完成」静默；零代码改动。残余：外部重试成本（R1）、结构化程度（R2/codexErrorInfo未消费）、网关误标风险（R3）；F-3-a/b建议不立同构修复（概念可复用、代码不可复用）；待确认4项+验证方案V1/V2/V3。见docs/fix/2026-10-16_assess-truncation-parity.md（未实施/未测试）。
