# 多运行时的安装与 CLI 接线

本次让 CLI 用户选择 demo、Pi、Codex 或 Claude，并让该选择真正到达受治理会话。设计依据是项目管理已获客户实施授权的 [ANS-RUNTIME-V2 revision 1](../../../项目管理/docs/design/2026-10-14_design_multi-runtime-integration.md)。本文只细化同一批准范围，不新增选装。

## 独立评估与边界

装配固定承担入口、依赖和启动检查。只修改本角色 `boundary.yaml` 中的 package/lock、`src/index.ts`、私有 common、私有测试、README、`.env.example` 与自有文档。实际 `.env`、角色定义、Model、共享模块及其他角色实现只读。入口当前通过动态导入 Pipeline 创建 Pi 工厂，且 govern 没传入选择结果；本次移除该跳层接线，把纯值 `project/scope/runtime/runtimeOptions` 交给 Interface。保留现有 demo 假运行时注入和 CLI shell 能力缺席，失败不切换引擎。

核心统一 Model 与 Service/Provider 工具已有单一实现；编排的 [接口报告](../../../编排/api-spec.md) 提供 root 所需的 Interface 接缝，root 无需选择具体 Provider。Codex 用实际 CLI app-server 与 MCP bridge，不能写成 TS SDK callback。Claude 用官方 Agent SDK + SDK MCP，原生工具等待仍有约 24.8 天上限。三种 SDK 均应按需加载，help/doctor/import 不启动会话。

## B0 先准备准确依赖

安装固定版本 `@openai/codex@0.162.1`、`@modelcontextprotocol/sdk@1.32.1`、`@anthropic-ai/claude-agent-sdk@0.3.299`、`zod@4.6.7`、`@anthropic-ai/sdk@0.93.0`。保持 Pi `1.1.0`、yaml `2.9.0` 和 Node `>=23.6` 不变；npm 缓存使用临时目录，不改 npm 账户、用户环境或凭据。

安装后运行原属主 durable Codex probe：版本、experimental schema、strict config、原生 MCP 全禁用和 initialize/config-read，假配置/独立临时根，不做 login、thread-start 或真实模型请求。使用正常依赖重新运行核心、Pi、Codex、Claude 测试与全仓 strict tsc。原始失败保留并按文件属主交项目管理，不改同伴源码或弱化断言。

## B1 接线与使用说明

实际依赖通过后，根据编排最终契约把 root runtime 选择传入 role run/govern。显式 `--runtime` 优先于 `ANS_RUNTIME`，role run 保持 demo 默认，govern 保持 Pi 默认。帮助与 doctor 支持全部合法值；缺配置在选定引擎明确失败。root 不导入 Service/Provider/Pipeline 运行对象，类型仅从共享 Model 读取。

B1 已由项目管理依据 P1 199/199、O1 238/238 和核心实际契约释放。为验证真实 root→Interface→Pipeline→Service 接线，`main` 增加可选第三参 `{runtimeOptions}`，形状引用 Interface 输入；测试通过其正常 `providerFactories` 注入假外部引擎，执行实际公共 handlers。这个超集入口不改变原两参调用。默认 demo 仍注入原装配假运行时，显式注入 runtimeOptions 时才按编排契约走 Service。无 `.ans` 的仓库内置回退补登记本次已接受的运行时核心/Codex/Claude 三份真实角色卡与各自边界；现有演示 writeSet 不扩大，不授予目录 blanket 权限。

README 和 `.env.example` 按实际实现写配置：Pi 必填 token/base/model；Codex 必填 CODEX_API_KEY 或 OPENAI_API_KEY 与模型、base 可选且默认 OpenAI Responses；Claude 必填 ANTHROPIC_API_KEY、模型可选使用 SDK 默认、base 可选。所有示例秘密值均为空或占位符，不读取实际 `.env`。

## 验证与当前状态

本文件创建于 2026-10-14。B0 依赖安装已成功，稳定 Codex 原生探针通过。B1 已实施，自有 67 项和窗口受影响 11 项共 78/78、全仓 tsc0；当前全仓原结果1165/1168、2失败、1跳过，两失败分别交D1以及Governance修边界顺序后精确重测通过。初次诊断语言与缺SDK测试钩子失败保留。[当前原始结果](../change/2026-10-14_change_multi-runtime-assembly.md)。选择优先级、两个命令的实际Service接线、未知/缺配置错误、demo兼容、SDK import懒加载和实际Node入口均有当前自测。功能见[当前CLI接线](../feature/cli-runtime-assembly.md)；本角色冒烟不替代固定测试角色的独立合并验证，线上模型未验证。
