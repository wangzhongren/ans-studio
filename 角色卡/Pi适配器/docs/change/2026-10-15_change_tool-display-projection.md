---
id: pi-tool-display-projection
type: change
title: Pi 接入统一工具详情投影
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: verified
related: [pi-tool-display-report-consumer, runtime-tool-display-contract-a]
---

# 工具详情带真实目标、结果和执行事实

客户批准总方案 revision2 / P1–P7 后，PM预留 PI-A-1 范围、root转发实施。依据批准的[Pi consumer r2](../design/2026-10-15_design_tool-display-and-report-consumer.md)、Core A/r4 与 C/r2.tp1；批准13份文件manifest逐项SHA核对全部匹配，未修改批准提案或manifest。当前功能见[Pi角色任务](../feature/pi-runtime.md)。本次仅Pi生产接线与自有验证，不代替Window/UI、独立测试或最终全套验收。

用户展开新工具记录时，Pi将真实start/hook拒绝/native结果交Core注入的唯一投影器，得到受保护、有预算和缺失标记的显示值。read失败继续是失败，shell执行/审核语义不变；blocked与result分开记录。给模型的原始结果文本和native安全details保持既有格式，不把展示结构或C报告元数据塞进SDK。

## 实际源码和API

生产只改 `src/common/pi-adapter/real-adapter.ts`，无新增生产文件、无Core私有导入。消费Model实际 `RuntimeToolEventProjector` / `RuntimeToolEventSource` / `RuntimeToolResultFactsV1` / `RuntimeToolInputFactsV1` 与 `ToolDefinition.displayInputRule`。RuntimeProviderOptions实际消费 `toolDisplayMode`、`projectToolEvent`、`registerToolDisplayProfile`、`toolDisplayCredentialEnvNames`。

required-v1缺projector/register函数在SDK load前拒绝；本次cfg及同次profile env快照选中键/值通过register纯内存登记，不发送完整env、不复制Core脱敏器。Pi没有自有profile redactor。legacy-standalone/省略mode保旧直接入口兼容。

唯一SDK execution_start捕获原turn/call及已声明input rule；仅保展示允许的path别名或command键跨hook，不保write正文/任意args。nullish和首string规则保持Core原选择语义，Pi不依同名工具猜rule。共享私有callFacts把handler真实message/execution/Error.message交native end投影后删除，dispose清空；execution不进入SDK content/details。native-only失败只转换原text块及unsupported标记，不JSON展开原生对象、不反解exit/stdout。SDK明确isError决定最终状态，原ABORTED/TOOL_FAILED机器码保留。未知旧hook没有同call上下文只发固定诊断，旧native end不借当前新turn补身份；真实身份不scrub。

全部新工具summary/detail只经投影出口。注入projector异常产生固定PROJECTION_FAILED消息，无raw fallback、不改变handler和模型结果。emit的未知身份保护仅限projected工具/诊断，无关压缩、恢复、助手和legacy事件保原行为。Core最终pump保护仍是独立防线。

Core-only输入metadata继续由Core先剥离，Pi makeRolePrompt再明确只重建images；原text和图片引用不变。A不改变C持久化、队列、attempt/receipt或重新投递策略。

## 真实验证与范围

新增 `test/pi-adapter/tool-display-projection.test.ts` 七项真实离线faux SDK测试：required缺函数0 SDK，cfg override登记在SDK前；真实read成功/ENOENT和实际shell exit7，结果结构仅出display、SDK原message/native details保真；handler throw、native unsupported/unknown hook、真实旧turn/call和秘密片段ID不改；projector throw安全诊断且handler一次成功；九个真实工具名start/result各一次、declared rule、nonstring path不回退/空command不回退/null path别名、blocked+result、UTF-8及总事件预算；实际SDK只收到原prompt和同引用images，无Core metadata sentinel；真实shell exit0、spawn ENOENT、SIGTERM子进程和review拒绝不造exit。shell测试只本地受控子进程，无shell:true、无外网模型/凭据调用。

必要更新 `test/pi-adapter/prompt-images.test.ts` 一项Core metadata窄allowlist验证；tool-call-events/injected-runtime原测试保持严格断言不改。真实模型、用户ANS窗口、目标p-limit项目未操作。UI层没有纳入本角色测试声明。

最终命令、退出码、当前依赖与自有候选SHA及日志见[候选证据](2026-10-15-pi-tool-display-evidence/candidate-manifest.json)。sandbox全Pi初跑唯一失败为现有本地loopback服务listen EPERM；同套件受管提升后在本地假HTTP服务完成。未删测试、未放宽断言或门禁。

Core Model/Service/投影器在stageA放行后仍可因C与审核修正增长，本记录只证明manifest所列实际依赖候选，不能把stageA A52或root controlled结果当作Pi最终验收。后续依赖变化需重测调用方，最终跨角色桌面由PM安排独立验证。

最终本角色结果：全Pi **217/217通过**；当前稳定依赖hash前后相同的四文件专项 **39/39通过**，typecheck及diff-check均exit0。生产SHA-256 `4be2cd47e5b8888efb8f9c483274c44da8049bbe71ca7692272d7c60ccb8fcc5`。此verified仅指Pi及所列无网络验证，不代表总r2/用户桌面已验收。
