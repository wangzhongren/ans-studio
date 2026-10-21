---
id: reasoning-light-delivery
type: fix
title: 三平台思考等级轻量修复实施记录
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: complete
related: [ans-reasoning-effort-lightweight-repairs]
---

# 参数不支持时兼容继续，保存的设置保持不变

用户已确认：“可以，就按 D1 轻量方案，用 ANS 技能安排各角色实施，改完测试一下。不支持的等级要提示并兼容继续，UI 只给修改意见，不要改。”

依据 [ANS-REASONING-LIGHT D1](../design/2026-10-21_design_reasoning-effort-lightweight-repairs.md)，批准内容 SHA-256 为 `30eb803b2482eea9a308ca2bf51507bb2a8d9c56dc2137fdc5749d85a4dcda09`。基线 HEAD 为 `fc1a39c14e119faccf442fc8e22bbbbd978d1a04`；已有 D3 修复和其他聊天的 UI 平台化改动保留，不纳入本任务产物。批准方案原文不改，本记录只记实施事实。

## 角色与范围

| 固定角色 | 实施范围 | 当前状态 |
| --- | --- | --- |
| 团队组建 | Claude/Codex 已有边界表达对齐，保持业务范围及旧展示元数据 | 已完成，边界/元数据30项通过 |
| 独立验收 | 复用 D1 八项验证标准，最终核对同一候选 | R2最终通过，V1–V8及E1齐备 |
| Pi适配器 | 单请求兼容重试、默认恢复、预算保护、相关自测及文档 | 已实现，自测39/39及专项331/331 |
| Claude适配器 | SDK 子进程局部无参数兼容、安全重试、相关自测及文档 | 已实现，自测57/57及真实SDK回环 |
| Codex适配器 | 同线程默认、去覆盖重建、原生策略恢复与工具开始保护；E1单模型临时目录 | 已冻结，自测80/80、真实CLI矩阵20/20 |
| 运行时核心 | 默认语义注释与契约说明；不改变字段/环境归一/公共消息协议 | 已完成，既有契约17/17 |
| 测试 | 独立 SDK/CLI 回环与现有 reasoning 套件、完整回归 | 最终全量3453通过/0失败/2平台跳过；独立真实3/3；typecheck通过 |
| 项目管理 | 同版合同、范围预留、交接与证据核对 | 已完成交付核对 |

本聊天保持项目管理角色，按用户明确指令作为可信启动端安排互不重叠的固定角色上下文，复用既有人工精确写集交接路线。不生成虚假 task_ops 配置、批准哈希或验收凭据。角色定义由团队组建处理，独立验收与实现分开。

UI 不派发实现：本方案的 UI 修改意见章节作为交接，不修改 `app/renderer/`、UI 测试、真实 `.env`、依赖、网关或用户模型选择，不调用真实模型服务。

## 关键交付约束

- 明确的等级/思考参数拒绝且普通请求可用，必须兼容后继续完成；不能只发提示后返回失败。
- 普通鉴权、限流、服务错误不取消思考配置；SDK 传输重试保留。
- 兼容状态只属于当前活会话；成功才保留，失败/取消/超时不能让下一轮粘在未经确认的原生默认策略。
- Pi 不再次调用 prompt 追加相同用户输入；Claude/Codex 有正常输出或工具启动后不整轮重放。
- 系统提示在活动 prompt 中通过既有 `message + source:system` 输出，不当作模型思考或助手反馈正文。
- D1 公开的基础协议和中途恢复限制保留，不把不支持整个接口或普通请求不可用伪装成成功。

## 验证与当前结论

实现、独立测试和R2整项独立验收均已完成。最终全量3455项：3453通过、0失败、2个Windows专用跳过；类型检查通过，独立三平台真实SDK/CLI localhost回环3/3。本机回环只证明实际 SDK 请求/恢复行为，不证明任意真实第三方网关都采纳了指定推理等级。

- [独立测试记录](../../../测试/docs/fix/2026-10-21_fix_reasoning-light-verification.md)：现有消费者15+11+42项通过，最终独立三平台真实回环3/3；Codex原红例保留，E1产品已经在同一目录内模型上通过成功断言。
- [独立验收结论](../../../独立验收/docs/fix/2026-10-21_verify_reasoning-light.md)：R2为pass；V1–V8与E1齐备，当前候选、真实请求、策略恢复、完整回归及范围均匹配，无未解决返工或本机必需缺证。


## 实施期新发现与 E1 授权

Codex 当前CLI对目录内gpt-5.5强制补默认effort；D1去覆盖在目录外probe-model成功，在该目录内模型仍失败。原红证据已保留，没有改为预期通过。临时单模型SDK元数据探针已验证同model/endpoint下可省effort并completed，产品尚未加入时向用户提交了 [E1差额方案](../design/2026-10-21_design_reasoning-light-codex-addendum.md)。

用户明确回复：**“允许加入 E1，补齐兼容”**。批准 E1 SHA-256：`817870bec7474f61fcf61ba4e6bcd56fd2ea744450e6626d18e26731deb3a5d9`。新增范围仅Codex私有reasoning-catalog辅助、现有session接线、对应原生/独立测试及清理/版本保护；不改SDK文件、保存配置、模型/endpoint或UI。独立验收据此追加R2，不覆盖已有失败证据，也不把私有内嵌元数据来源说成稳定公共API。

其他必要测试范围同步：Pi的installed-mcp-servers默认扩展断言保留无MCP约束并加入默认预算保护扩展；real-adapter.timeout夹具关闭空闲TCP连接，原超时断言保持。Codex web-search测试按真实搜索source过滤，避免新增system配置行污染旧计数，原搜索内容/数量断言不减少。生产职责与用户行为不因此扩张。

## E1 产品验证结果

Codex所有者完整真实CLI矩阵20/20，自测80/80，详见[最终证据清单](../../../Codex适配器/docs/fix/2026-10-21-reasoning-compatibility-e1-evidence/manifest.json)及[实际请求与结果](../../../Codex适配器/docs/fix/2026-10-21-reasoning-compatibility-e1-evidence/native-loopback.json)。原D1 15/16中的真实失败证据保留在原目录，不覆盖。

- 同一gpt-5.5：high被拒后，产品E1真实发送不含effort的请求并完成，下一轮沿用已成功策略。
- high值被拒、目录默认medium也被拒时，既有第二候选同样用E1保证无effort并完成；不增加候选次数。
- E1尝试遇500、取消或超时，下一轮重建原目录并真实发送high；只在成功后保留兼容策略。
- 仅当前临时引擎读取固定CLI 0.162.1内嵌目录，精确单模型、四字段差异、0600文件及生命周期清理均有测试。SDK/模型/端点/保存设置不变。

冻结生产摘要：session `3cb3db0fb36fac81926926bc9b80c6ed4987782db07637374545ccef858dcbdd`，protocol `31ab8a1b65a0cf5623931730225ed813f23c06b5184b23a3f04122ef611fa468`，reasoning-catalog `5a94e74264ec67bac1e3f06f3e89752106ab9103d1759ce8aa8114cb084a3e49`。早期五格session摘要不同仅因目录读取注释后来同步；完整20格和独立测试采用上述当前候选。

## 全量首轮发现的测试夹具问题

首次全量3435项，3408通过、25失败、2个Windows专用跳过；失败日志保留，不当作通过。其中Pi所有者的新增回环夹具假凭据路径不符导致18项失败，另有100ms超时先发生、无界等待第二请求的挂起。Pi所有者仅修自身夹具：真实模板假token且恢复、有限等待、用既有InteractionGate让100ms从被测兼容阶段起算，并加入200ms前置延迟确定性覆盖竞态；不改生产或放松超时/下一轮原参数断言。

另外7项属于测试角色既有消费者，按D1必要依赖同步增加以下精确写集，均保留原业务断言：

- `test/测试/g3-search-verify/codex-websearch-verify.test.ts`：按搜索来源筛选，避免system配置提示计入搜索结果；搜索内容/数量/脱敏断言不减。
- `test/测试/g4v2-mcp-verify/j-pi.test.ts`：精确扩展集合加入默认reasoning保护，工具与结算断言保留。
- `test/测试/t1-external-engines.mjs`：Pi SDK替身补真实SDK已有的setThinkingLevel状态接口，越界拒绝断言不变。

这是批准方案对受影响测试的同步，不引入新产品行为或UI写集。修复后重跑同一候选的全量及类型检查；最终结论以新的真实结果为准。

夹具修复已冻结：Pi测试摘要 `89b7a2dec5bd4834e96c4008f55c03d4a89f6234b4f7b3676b79d058b69a0879`，清空认证环境仅保留PATH的独立运行23/23，生产摘要不变。先前Pi所有者331/331的命令外补了假token，证明当时行为但未揭示夹具不自足；本次修正后不再依赖调用者提供token。测试角色三个消费者文件定向20/20，最终全量重跑结果见下节。

## 最终独立测试证据

[验证清单](../../../测试/docs/fix/2026-10-21-reasoning-light-evidence/verification-manifest.json)记录实际命令、原始日志摘要、环境和候选身份：

| 验证 | 结果 |
| --- | --- |
| `node --test "test/**/*.test.ts"`，无外部假token注入 | 3455项，3453通过、0失败、2跳过，退出0 |
| `npm run typecheck` | 退出0 |
| 独立三平台真实SDK/CLI回环 | 3/3，同样在最终全量重跑 |
| Codex所有者真实CLI矩阵 | 20/20，源码/测试hash与最终现场相符 |
| 最终候选前后摘要核验 | 617文件；本任务代码/测试/配置及安装SDK/CLI入口稳定 |

测试时唯一在飞文件为其他聊天的 `app/renderer/src/chat/ChatStream.tsx`，单独记录，不宣称整仓冻结，也不计入本轮交付。未执行Electron或改UI。最终证据平台为macOS arm64、Node24.14.0、Pi1.1.0、Claude SDK0.3.299及CLI2.1.299、Codex CLI0.162.1；无真实网关调用。

用户可继续按原方式选择等级。接口只拒等级/字段且处于安全重试阶段时，后台提示并兼容完成，保存设置不变；Pi清空等级恢复实际默认。E1依赖当前固定CLI内嵌格式，升级需回归；拒绝整个reasoning协议、已有输出/工具副作用后不能安全整轮重放等已披露边界仍保留。UI修改意见仍在[D1的交接章节](../design/2026-10-21_design_reasoning-effort-lightweight-repairs.md#交给-ui-负责人的意见本轮不改)。本轮未提交、推送或发布。
