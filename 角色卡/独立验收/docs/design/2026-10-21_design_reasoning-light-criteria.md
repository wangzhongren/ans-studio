---
id: reasoning-light-acceptance-criteria
type: design
title: 思考等级轻量兼容独立验收标准
version: R2
created: "2026-10-21"
updated: "2026-10-21"
status: ready
---

# 仅等级不支持时，同一任务应提示并自动完成

用户已经明确“按 D1 轻量方案，用 ANS 各角色实施测试。不支持等级提示并兼容继续，UI 只意见不要改”。本标准复用 [ANS-REASONING-LIGHT D1](../../../项目管理/docs/design/2026-10-21_design_reasoning-effort-lightweight-repairs.md) 的八条验证要求；R2 仅追加用户随后明确批准的 E1 差额，不新增平台门槛。D1 批准文件 SHA-256 已核对为 `30eb803b2482eea9a308ca2bf51507bb2a8d9c56dc2137fdc5749d85a4dcda09`；设计正文的待实施状态不否认后续同版授权。

独立验收继续使用自身 [Section 1](../../boundary.md)，只写标准与结论，不改生产/测试、不代跑全套、不修改他人证据或任务权限。前一 D3 与同期 UI 平台化工作不是本任务交付，相关未提交差异仅作为候选环境分别记录。当前只完成标准，尚未验收实现。

## 复用八条验证要求

| 编号 | 当前候选必须提供的观察 |
| --- | --- |
| V1 | 固定普通请求可成功的本地网关，仅拒指定等级/字段后，自动兼容使**同一用户任务 completed**，不能只发提示或要求用户重提；保存设置、模型、endpoint 与运行时不变。鉴权、限流、普通 5xx、运输及 `param:model` 等负例不误触发兼容 |
| V2 | Pi 在请求级重试，同一 user 输入与已有 tool_result 保持、工具计数仍为 1，不第二次调用 session.prompt；一次 provider 调用最多一次兼容切换，SDK 传输重试沿用去参请求；整次失败不改变下一轮原策略，不因普通错误丢参数 |
| V3 | Pi high→清空→恢复，与同版本 SDK 无历史新会话默认一致且保留历史/身份；按显式→模型默认→全局默认→版本绑定 medium 选择。默认与显式档均有预算合法性保护；high/xhigh 相同预算如实记录，不擅增预算或 maxTokens；ANS 钳位/空间不足关闭时提示 |
| V4 | Claude 用真实安装 SDK/CLI 捕获请求，兼容子进程局部 `CLAUDE_CODE_EFFORT_LEVEL=unset` 和 `CLAUDE_CODE_DISABLE_THINKING=1`，同时不传显式选项，使 thinking/output_config 确实缺席；不是 low 被拒后暗换 high。当前轮、下一轮成功，主进程 env 与保存配置不变，不能仅测 fake SDK options |
| V5 | Codex 原四档/恢复出站不变；精确 model/list 匹配后同线程默认档继续；必要去覆盖重建在持久/非持久首轮真正产生第二次请求并 completed，resume/start 成功后采用正确 native ID；unknown model 等负例不误触发。最多两个不同候选，相同候选不重复 |
| V6 | 兼容重试前后只最终结算一次，不重复用户可见回声或工具；取消/超时不被重试覆盖。Claude/Codex 已有正常输出或原生 MCP/webSearch started、ANS handler 执行前即禁止整轮重放；合成 API 错误帧不误计正常输出。SDK 自有运输重试单独计数，不要求所有 HTTP 恰一次 |
| V7 | 设置改变后按既有链重建，兼容记忆只属于旧实例/model/endpoint；未设/default/off 分别核对。Codex 真实捕获 high→默认兼容失败/取消/超时→下一轮仍 high，只有 completed 后下一轮才沿用默认；去覆盖失败也需恢复原策略，恢复未确认不复用状态不明引擎。Pi 失败/运输重试语义同 V2。配置/尝试/成功提示均在 active prompt 内，以现有 message summary 和 `detail.source:"system"` 可见/回放，成功提示晚于正常结果，不伪装 reasoning 或进入助手反馈镜像，不泄露原始错误/凭据 |
| V8 | 全量类型检查及受影响回归通过；旧降级用例按具体新行为同步，保留映射、推理事实、普通失败/取消断言。真实 SDK/CLI localhost 证据说明旧模型限档、Codex 整个 reasoning 对象拒绝等已知边界，不用 fake 代替、不伪造通过 |

## 阶段映射与证据

| 阶段 | 对应标准与放行范围 |
| --- | --- |
| Pi 所有者 | V1–V3、V6–V8 的 Pi 部分；真实请求级兼容、恢复默认独立对照、预算和工具不重放，含原始请求字段摘要与输入/工具计数 |
| Claude 所有者 | V1、V4、V6–V8 的 Claude 部分；真实 SDK 子进程双 env 去参、当前及后续轮、无副作用安全重试和失败/取消 |
| Codex 所有者 | V1、V5–V8 的 Codex 部分；真实 CLI 同线程默认、必要去覆盖与 ID、策略恢复和 started 阻止重放 |
| 核心/说明 | V7–V8 的公共契约及 system 消息转发/回放/反馈排除；值域、字段和 env 归一不扩展；UI 仅明确意见交接，**本任务 UI 代码/测试零修改，不要求 Electron 验证** |
| 独立集成 | 对同一候选汇总三平台真实 SDK/CLI localhost 请求、当前/下一轮结果、负例及副作用计数；类型检查与受影响回归均提供命令、退出码及原始输出；逐条核对 V1–V8 |

所有阶段须附实际 OS/架构、Node/SDK/CLI 版本、隔离临时目录和 localhost 端点用途、测试输入/请求字段摘要、命令、退出码、日志以及生产与测试文件摘要。未提交工作区不能只用 HEAD 标识；共享依赖或配置变化后补受影响验证。正常路径不得增加远程能力探测；无需真实模型额度，不连接用户网关、不修改用户真实配置。

只承认已运行平台的证据，公开其范围；**不把所有 OS 或线上模型新增为 D1 完成门槛**。fake 单元测试可补充分支证据，不能代替 D1 必要的真实安装 SDK/CLI 本地请求与恢复证据。前期诊断/修复前探针不自动证明当前候选。

## R2：已批准 E1 的最小差额

授权来源为用户明确“**允许加入 E1，补齐兼容**”，由可信启动端交接。差额方案见 [Codex 已知模型强制 effort 的兼容差额](../../../项目管理/docs/design/2026-10-21_design_reasoning-light-codex-addendum.md)，读取时 SHA-256 为 `817870bec7474f61fcf61ba4e6bcd56fd2ea744450e6626d18e26731deb3a5d9`。方案中待客户决定的旧状态由这次后续授权补足；D1 原文和 V1–V8 不改写，以下仅补 Codex 所有者与独立集成阶段的 E1 观察。

固定 CLI 0.162.1 对目录内 gpt-5.5 自动补默认 medium，原去覆盖仍遭 effort 字段拒绝，属于本次应补齐的未完成项。[隔离可行性证据](/tmp/ans-codex-single-model-catalog.result.json)已显示同 model/localhost endpoint 的请求无 effort 且 completed，但只是探针，不代替产品接入后的通过。

| 补充检查 | 必须观察到的结果 |
| --- | --- |
| E1a 来源与精确范围 | 私有 `src/common/codex-adapter/reasoning-catalog.ts` 和 session 接入，仅从已安装固定 CLI 0.162.1 二进制中有界读取并验证完整内嵌元数据，精确选择当前模型；未知版本/格式/缺匹配不能猜造，也不从任意项目文本或输入建立可信模型目录。记录来源、版本和验证证据，不包装为通用模型库 |
| E1b 最小字段差异 | 临时目录只有当前模型，取消默认 level 及必要 summary 能力字段；测试对比完整原条目，除明确列出的 `default_reasoning_level`、`default_reasoning_summary`、`supports_reasoning_summary_parameter`、`supports_reasoning_summaries` 外，其余工具能力、上下文和模型说明等保持。SDK 文件、模型、endpoint、保存 env/设置及 UI 不改 |
| E1c 真实完成与清理 | 产品接入后用真实 CLI 的目录内模型（包括本次红例 gpt-5.5）复现字段拒绝，再自动兼容使同任务 completed；真实请求确认同 model/endpoint 且 effort 缺席，并验证下一轮。保留原 high→medium 仍被拒的红证据，不能删掉或换目录外模型冒充修复；临时文件归当前实例/临时引擎，正常结束、失败和取消生命周期清理 |
| E1d 策略与副作用 | 只有最终 completed 才保留兼容策略；失败/取消后的下一普通轮仍发送原策略，超时与 started/已有输出禁止重放仍按 V6/V7 核对。兼容目录不写用户全局配置、不跨实例缓存，不增加无限尝试；同线程默认与必要去覆盖的既定候选上限不变 |

精确新增写集为 Codex 私有目录辅助、原 session 接入及其所有者/独立测试回归；以真实 Section 1 和启动端任务写集共同约束。E1 不把拒整个 reasoning 对象或工具启动后的流内恢复改成已解决，不新增代理、SDK 修改或跨平台全能力框架。没有当前候选的上述真实完成与恢复证据时，E1 判证据不足；已证实仍失败则返工，不能以已公开的整个 reasoning 协议限制掩盖仅 effort 字段拒绝。

## 公开限制与最终判断

Codex CLI 去 effort 后仍可能发送 reasoning 对象，拒绝整个对象属于基础协议兼容限制；非持久后续轮重建不能保证全部历史恢复，已输出/工具 started 后不整轮回放。Claude 旧模型可能忽略或钳位 effort，双 env 证据不涵盖任意 beta header/网关；Pi high/xhigh 预算可能一致。这些是 D1 已公开边界，不作为新增功能要求，也不得说已透明解决。它们不豁免普通接口可用、只拒等级/字段且处于安全重试阶段必须自动 completed 的场景。

- **通过（pass）**：当前授权候选在声明的平台满足 V1–V8 与已批准 E1 的必需观察，真实 SDK/CLI 证据、类型/回归与说明齐全，无未解决失败，UI 只交意见。
- **返工（needs-work）**：已证实出现等级拒绝后本可兼容却失败、伪成功、参数未真正改变、工具/最终结算重放、策略残留、修改保存配置或越界 UI 等不符；回交原所有者修复，保留原失败。
- **证据不足（missing-evidence）**：仅 fake、仅提示、缺当前/下一轮或真实策略恢复观察、缺版本/日志/候选身份，或受影响依赖改变未复测；明确补证者，不降标准促成通过。

最终报告写在自身 docs/fix，链接 D1、本标准、同一候选和原生产者证据；验收不授权提交、推送、发布或部署。
