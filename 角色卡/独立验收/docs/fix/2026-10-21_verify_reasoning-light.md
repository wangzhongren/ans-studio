---
id: reasoning-light-independent-acceptance
type: fix
title: 思考等级轻量兼容独立验收
created: "2026-10-21"
updated: "2026-10-21"
status: passed-macos-localhost-r2
---

# D1 + E1 按 R2 通过本机范围独立验收

本次只读审验依据用户批准的 [D1](../../../项目管理/docs/design/2026-10-21_design_reasoning-effort-lightweight-repairs.md)、[E1 差额](../../../项目管理/docs/design/2026-10-21_design_reasoning-light-codex-addendum.md)与本角色 [R2 标准](../design/2026-10-21_design_reasoning-light-criteria.md)。目标是普通接口可用、只有等级/字段被拒时，提示并自动完成同一任务，不改变保存设置、不重放已有工具。

**最终结论：通过（pass），范围为 macOS/darwin arm64、当前固定 SDK/CLI、localhost 假网关与当前 R2 授权候选。** 五阶段和 V1–V8/E1 必需观察已齐：Codex 完整 20/20、独立三平台真实回环 3/3，最终全量 **3455 项：3453 通过、0 失败、2 平台条件跳过**，`npm run typecheck` 退出 0；未发现未解决的本任务返工项。

本结论不声明所有 OS、任意真实网关或线上模型已验证；这些未测范围不是 D1 新增门槛。UI 只交意见，本轮没有实施或验证 UI/Electron。原生模型限档、Codex 整个 reasoning 对象拒绝及已有输出/工具后的透明恢复限制保持公开。下文保留先前阶段审验与首红收口过程，最终判断以末尾的当前候选证据为准。

## 候选、范围与证据来源

固定角色仍是独立验收，仅写本报告；没有修改产品、测试或其他角色证据，没有自行执行产品测试。读取了两适配器的 Section 1 与精确范围，实际新增实现均在各自 Provider/私有 common 范围，测试在各自目录。

| 生产文件 | 当前 SHA-256（已独立复算） |
| --- | --- |
| `src/common/pi-adapter/real-adapter.ts` | `ef0f8353aa3bb5fd2efcc733cdd41754ff9062447a1d0b47dbdd8809c392e965` |
| `src/provider/claude/session.ts` | `d5b4a252e8d51f0ed9ce58c6e9a25b1ac7c5cac23974c9069c0ffd996da45a2f` |
| `src/model/runtime.ts` | `571e13c6b180ae31b21c4bfcd5804f902365674d75dd2a697040b2a905432d7a` |
| `src/service/runtime/session.ts` | `cc4a09df86ab71c8255a5c27d002e10cc479213ce1ec92437cfc8359b8e61717` |

Pi 四个变更测试、Claude 两个测试/探针的摘要也与所有者记录一致。Claude manifest 所记 Model/Service 摘要早于核心最后注释更新；当前两文件 diff 均为注释，不改变字段、值域、归一或运行行为。最终集成仍须记录当前摘要，不能把早期 typecheck 失败改写为通过。

前一 D3 的写入修复、其他聊天 UI 平台化文件/配置/边界并发变化不是本任务产物。本轮不修改保存 env、模型、endpoint、SDK、依赖或 UI；只读核对系统消息路径不等于桌面验证，不新增跨所有 OS 或真实网关门槛。

## Pi：请求级兼容与默认恢复

依据 [Pi 所有者报告](../../../Pi适配器/docs/fix/2026-10-21_fix_reasoning-compatibility-and-default.md)，并读取实际 diff、真实 SDK 测试与 [/tmp/ans-pi-d1-focused-final.log](/tmp/ans-pi-d1-focused-final.log)、[/tmp/ans-pi-d1-suite-final.log](/tmp/ans-pi-d1-suite-final.log)：macOS Node 24.14.0、Pi SDK 1.1.0，窄测 39/39、专项 331/331，无跳过。日志中的真实请求摘要与断言相符。

- 原 `makeRolePrompt` 的再次 `session.prompt` 已移除。公开 provider stream/fetch 包装只在 400/422 且明确指向实际 thinking 字段时复制请求删除该字段，messages、tool_result、地址、认证头与取消信号保持；没有以普通 500 或出现 reasoning 单词触发兼容。
- 请求内状态在 provider 调用闭包内，SDK 运输重试不会恢复已拒字段或无限获得新切换。真实记录为 `[high, 无, 无, 无]`；全部兼容失败后下一轮为原 high，记录 `[high, 无, 无, high]` 与 `[failed, completed]`。HTTP 200 流内报错、取消和超时同样不虚报确认。
- 已执行工具后的下一模型请求被拒时，真实记录 `[high, high, 无]`，toolEffects=1、nativePrompts=1、userHistory=1，兼容请求保留 tool_result；属于单请求继续，未重放整轮。
- 正常助手结果到达后才确认当前 profile 的兼容状态。默认/显式/重建及无关参数/模型/网络负例均有真实 handler 断言。SettingsManager 是内存实例，不保存用户全局偏好。
- 默认恢复测试与独立无历史 SDK 会话对照 medium；原 native ID 和历史仍在，high→清空→恢复真实预算从 16384 回到 8192。模型/全局/版本默认优先级、默认与显式预算保护、high/xhigh 同预算均按真实 SDK 验证。
- 配置、预算、尝试与确认消息通过活动 lifecycle 的 `source:system` 发射；正常正文先于确认兼容消息，不伪装推理正文。

新增默认保护使旧 MCP 测试需同时预期 governance 与 reasoning 扩展，实际 diff 保留活动工具为空和不加载 MCP 断言；超时夹具仅增加关闭所有连接并等待 server.close，原超时断言未放宽。两项均有可信启动端精确追加授权。初跑失败与残留连接诊断保留，后续完整 Pi 专项正常退出。

**阶段判断：V1–V3 及 V6–V8 的 Pi 所有者已执行范围符合；待最终独立集成复核同一候选。**

## Claude：双 env 去参及安全重放

依据 [Claude 所有者报告](../../../Claude适配器/docs/fix/2026-10-21_fix_reasoning-compatibility.md)、[manifest](../../../Claude适配器/docs/fix/2026-10-21-reasoning-light-evidence/manifest.json)、[unit.log](../../../Claude适配器/docs/fix/2026-10-21-reasoning-light-evidence/unit.log)与 [probe.json](../../../Claude适配器/docs/fix/2026-10-21-reasoning-light-evidence/probe.json)。已独立复算四个证据文件摘要，均匹配 manifest。macOS SDK 0.3.299 / CLI 2.1.299：57/57 单测；19 个直接 SDK、1 个 Service 装配及 6 个兼容相位均有结果记录。

- 源码只在兼容子进程局部 env 设置 `CLAUDE_CODE_EFFORT_LEVEL=unset`、`CLAUDE_CODE_DISABLE_THINKING=1`，同时不传显式 thinking/effort；没有写主进程环境或用户保存配置。
- 真实 effort/thinking 拒绝场景中，前三次 SDK 原生请求仍为 low，随后兼容请求和下一轮的 thinking/output_config 均缺席，两轮 completed。model 保持 `claude-sonnet-4-6`，不是 low 暗换 high 后误称去参。
- 失败、取消和超时记录均显示：先 low→无字段，下一普通轮恢复 low；outcome 分别为 failed/aborted/timed_out 后 completed，未出现 compatible 成功提示。
- replayUnsafe 在 ANS handler 执行前、ANS/外来 MCP/WebSearch 放行时及正常文本/思考/tool_use 帧时设置。SDK 合成 message.error 只记录错误而不当作正常输出。真实工具相位只有一个引擎、工具计数 1，没有兼容重放；六种正常输出/工具启动分支另有单测。
- 参数拒绝识别收窄到 400/422 明确对象，普通鉴权/限流/模型/网络负例不改策略；每 prompt 至多一次兼容。compatible 状态只在成功完成后提交，清理/取消按原生命周期执行，最终结算一次。
- 系统提示均在 active prompt 内，配置、尝试、成功分阶段发射；不输出原始 API 错误正文。不将旧模型忽略 effort 或 xhigh 钳 high 伪装为新增能力。

原 `npx tsc --noEmit` 的三条 QA Pi 旧契约消费错误已如实保存，属于当时未通过记录。启动端回交 QA 已更新 c/d/e 与窄测/typecheck 成功，但最终验收仍等其当前候选原始报告，不把口头结果替代证据。

**阶段判断：V1、V4、V6–V8 的 Claude 所有者已执行范围符合；当前/下一轮真实 wire 和无副作用证据成立，待最终独立集成。**

## 核心：契约注释及已有消息路径

[核心报告](../../../运行时核心/docs/fix/2026-10-21_fix_reasoning-default-contract.md)与 [/tmp/ans-reasoning-light-core.log](/tmp/ans-reasoning-light-core.log)为 17/17、退出 0。实际 Model/Service diff 仅将“未设零行为”修正为“字段缺席交平台默认”，没有新增公共字段、改变归一或运行接线。

只读核对 Service 的活动轮 pump、普通消息转发/保存和回放，以及 `app/desktop/session.ts` 的 `NON_ASSISTANT_DETAIL_SOURCES` / `isAssistantTextEvent`：system 已明确排除助手反馈正文；适配器采用该现有来源，无需本轮 UI 或窗口代码修改。核心既有推理事实/回放测试通过，不宣称进行了 Electron 或新 UI 验证。

**阶段判断：本轮核心注释/契约范围符合；V7 的实际跨角色提示链由最终独立集成证据补齐。**

## Codex E1：源码初审与首批五格

本次读取 Codex Section 1、`reasoning-catalog.ts`、session/protocol 实际差异、六项 catalog 回归源码和 [所有者原 D1 报告](../../../Codex适配器/docs/fix/2026-10-21_fix_reasoning-compatibility.md)。E1 新生产 helper 属既有私有目录授权，未改 config.ts、SDK、模型/endpoint 或保存 env；只把已批准 E1 接入必要去覆盖候选，不增加第三种候选。

| 文件 | 当前 SHA-256 |
| --- | --- |
| `src/provider/codex/session.ts` | `3cb3db0fb36fac81926926bc9b80c6ed4987782db07637374545ccef858dcbdd` |
| `src/common/codex-adapter/reasoning-catalog.ts` | `5a94e74264ec67bac1e3f06f3e89752106ab9103d1759ce8aa8114cb084a3e49` |
| `src/common/codex-adapter/protocol.ts` | `31ab8a1b65a0cf5623931730225ed813f23c06b5184b23a3f04122ef611fa468` |
| `src/common/codex-adapter/config.ts`（未改） | `4194d3f430e0563c99befa70f887c785994554a5b6651980076b3a712f2347e7` |

- helper 从安装包及平台包定位真实原生二进制，校验 CLI 0.162.1、目录格式、真实路径和文件大小；分块搜索上限 512 MiB、目录片段上限 4 MiB，当前模型必须精确单一匹配，版本/格式未知或重复匹配拒绝，缺模型不猜造。调用方不能指定元数据来源路径。
- 单模型条目仅覆盖默认 level 与三项 summary 字段。测试将完整输出与 `{...original, 四字段}` 深比较，并确认原条目不被修改；临时文件在本实例 workRoot、0600、独占创建，普通路径无覆盖。不是通用模型能力库。
- session 先等旧 native turn terminal，重建先清会话/轮 ID，resume/start 成功后才采用返回 ID，对外 nativeSessionId 为 getter。原生 MCP/webSearch/dynamicTool started 及正常输出设置不可重放标记，ANS handler 前已有 native 请求标记。
- 只有 completed 才提交新策略。E1 未完成时设恢复标记，下一轮先重建原目录并显式恢复 high，成功后删除旧临时目录；重建未确认则隔离引擎。dispose 清整个 workRoot，失败/取消恢复与清理有精确单测，普通模式/模型不修改。
- error 分类基于 effort 字段/值与状态/类型，整个 reasoning 对象、模型、鉴权/限流/运输错误不误当兼容；提示均在 active turn 中使用 source:system，尝试与 completed 分开。

已读取 [/tmp/ans-codex-e1-first.json](/tmp/ans-codex-e1-first.json) 的真实 CLI 0.162.1 localhost 五格，而非只看 passed：目录内 gpt-5.5 字段拒绝后 `[high, 无, 无]` 且两轮 completed；默认值再被拒后 `[high, medium, 无, 无]` 且两轮 completed；E1 500/取消/超时后下一轮重新发送 high，分别 failed/aborted/timed_out 后 completed。500 的 SDK 多次运输重试均保持去 effort，未误作多次 ANS 候选。所有 wire 仍是同 gpt-5.5，保留 reasoning 对象，未把整个协议限制说成已移除。

该五格记录的 session 摘要为 `a3095a5b8c5e916dd4fd36c54f17803f171123bc10216deaecbf22e93f506ccd`，其余四个记录摘要按探针文件相对路径解析后与当前吻合。已向启动端报告差异；启动端解释后续仅修正 catalogDefaultEffort 上方注释，明确 E1 field 也使用该逻辑。**五格仍保留原候选身份，终验须以完整 20 格和最终 QA 对当前摘要的记录收口**，不改写原证据。原目录内 high→medium 仍失败的 D1 日志与 manifest 保持原样；所有者旧报告的 incomplete 是历史阶段，待追加 E1 真实收口。

**阶段判断：E1 代码与获准最小范围一致，首批真实场景有效，未发现具体生产返工项；完整矩阵、80/80 原始日志与最终独立证据仍待接收。**

### 当前完整矩阵补证

随后收到 [E1 当前 manifest](../../../Codex适配器/docs/fix/2026-10-21-reasoning-compatibility-e1-evidence/manifest.json)、[完整 20 格](../../../Codex适配器/docs/fix/2026-10-21-reasoning-compatibility-e1-evidence/native-loopback.json)与 [80/80 自测](../../../Codex适配器/docs/fix/2026-10-21-reasoning-compatibility-e1-evidence/unit-tests.txt)。独立重新计算 manifest 中 10 个源码/测试和 4 个证据文件摘要，全部与当前一致，session 为当前 `3cb3db0f…cbdd`，前述五格旧摘要问题已由当前完整证据补齐。原 D1 15/16 红档没有覆盖。

已逐格核对 wire/outcomes：四档/off、同线程默认保留历史、持久与非持久首轮去覆盖、默认/E1 路径 500/取消/超时后恢复 high、目录内字段拒绝与两次值拒绝均满足标准。未知模型与整个 reasoning 对象拒绝、已执行工具后禁止整轮重放按原限制如实 failed，属于正确边界对照，不把目录内字段红例重分类。E1 所有者阶段现在可接受。

独立 [三平台真实日志](../../../测试/docs/fix/2026-10-21-reasoning-light-evidence/independent-native-final.log)为 3/3：Claude 实际双字段缺席并继续，Codex gpt-5.5 high→reasoning:{}→下一轮 reasoning:{}，Pi 工具和原生 prompt 各一次且保留 tool_result。最终全量中的同场景记录还应覆盖本次消费者修正后的稳定候选。

### 全量首红后的测试修正核对

测试角色保留首轮 3435 项、3408 过、25 失败、2 跳过及 [挂起终止记录](../../../测试/docs/fix/2026-10-21-reasoning-light-evidence/full-interruption.json)，该轮不是通过。已读取当前修正，不改生产与 R2：

- Pi `compatibility-loopback.test.ts` 现在自行设置并恢复测试进程假 `ANTHROPIC_AUTH_TOKEN`，不依赖外部注入；生产摘要仍为 `ef0f8353…e965`。等待 arrived 与后续完成均有独立上限和提前失败分支。超时场景仅暂停前置建连/首次拒绝阶段，刻意延迟 200ms 后才恢复原 100ms 有效预算，并断言真实 TimeoutError、100ms 提示、到达后至少 80ms；下一轮只检查策略恢复，不以该轮特设短预算衡量机器负载。参数序列 `[有, 无, 有]`、无成功提示及 timed_out→completed 断言保留。当前测试摘要 `89b7a2dec5bd4834e96c4008f55c03d4a89f6234b4f7b3676b79d058b69a0879`。
- `g3-search-verify/codex-websearch-verify.test.ts` 只按 `source:web-search` 选搜索行，原搜索文本、次数、结算与脱敏断言保留，新增 system 配置行不再误计搜索。
- `g4v2-mcp-verify/j-pi.test.ts` 同步默认 reasoning 保护扩展，保留 MCP 接通/不搭车、活动工具和单结算断言。
- `t1-external-engines.mjs` 的 SDK 替身补实际 `setThinkingLevel` 与合法值校验，不修改真实适配器或越界写拒绝断言。

后三项已获启动端在测试角色既有目录内精确授权；[20/20 消费者回归](../../../测试/docs/fix/2026-10-21-reasoning-light-evidence/consumer-regression-fixes.log)已核对。上述是夹具自足、确定性阶段等待和真实契约消费修正，没有删掉失败场景或放宽业务要求。最终全量/typecheck/607 文件及实际 SDK 入口稳定性仍等测试角色完整记录。

## 最终当前候选与 R2 判断

已接收 [QA 最终 manifest](../../../测试/docs/fix/2026-10-21-reasoning-light-evidence/verification-manifest.json)、[最终候选快照](../../../测试/docs/fix/2026-10-21-reasoning-light-evidence/candidate-final-before.json)、[完整 Node 回归](../../../测试/docs/fix/2026-10-21-reasoning-light-evidence/full-final-self-contained.log)和 [类型检查](../../../测试/docs/fix/2026-10-21-reasoning-light-evidence/typecheck-final-self-contained.log)。全量无需外部假 token 注入，测试夹具自足；两命令退出 0，原始输出分别为 3453 pass / 0 fail / 2 skip、无 TypeScript 诊断，仅既有 npm 用户配置警告。

独立验收重新计算 **617 个候选文件**及实际依赖：唯一差异是 `app/renderer/src/chat/ChatStream.tsx`，与 QA 记录相同，来自明确排除的并行 UI 工作。D1/E1 生产、消费者/测试、配置和其余候选文件均一致；8 个安装包 manifest、5 个关键 SDK/CLI/tsc 实际入口均吻合。此 UI 差异不形成 D1/E1 的代码或测试依赖变化，不扩张为 UI 重跑门槛，也不把它纳入本任务修改清单。

最终 manifest 的 **16 个原始日志 SHA-256 均独立复算匹配**。全量日志为 `d29395eb45d14d6b845b18ba369fe26ff543477eee2b10bb3e474e405c41860f`；typecheck 为 `6540d00ab4c2c686b6351a1ac075f5272c5b7f7ea191645a2e091dc6962c08d8`。R2 文件摘要仍为 `5369945208196cf36a643ce859f5ea58095316d909c284dad3f03bb74b6e8730`，没有为通过而修改标准。

| R2 标准 | 最终结论与依据 |
| --- | --- |
| V1 | 通过：三平台真实请求在仅等级/字段拒绝后自动完成同任务，保存设置、模型及 endpoint 不变；普通接口故障负例保留 |
| V2 | 通过：Pi 真实同请求 messages/tool_result 保留，prompt/工具不重放，运输重试沿用去参，失败不污染下一轮 |
| V3 | 通过：Pi 恢复默认与真实无历史 SDK 对照、历史/ID 保持、默认/显式预算保护及 high/xhigh 预算事实由当前全量再次覆盖 |
| V4 | 通过：Claude 真实双 env 局部作用，thinking/output_config 缺席，当前及下一轮完成；非 fake options 独证 |
| V5 | 通过：Codex 四档/恢复、同线程默认、持久/非持久去覆盖、当前 ID、unknown model 负例及 E1 目录内模型均有当前 20 格/单测证据 |
| V6 | 通过：单终态、取消/超时、started/正常输出禁止整轮重放，真实工具计数与既有模式断言保留；SDK 运输重试如实单列 |
| V7 | 通过：兼容成功后才沿用，失败/取消/超时下一轮真实回原策略；设置重建清除旧状态。active prompt 的 system 提示不冒充 reasoning，既有转发/回放及反馈排除已核对 |
| V8 | 通过：最终 typecheck、全量受影响回归及三平台真实 SDK/CLI 独立测试齐备；旧红保留，原生能力/协议负例不伪造成功 |
| E1a–d | 通过：固定 0.162.1 来源、精确单模型和四字段差异、未知版本/格式拒绝、临时清理、目录内字段拒绝 completed、失败恢复及不重放均有代码与当前测试证据 |

各阶段（Pi、Claude、Codex、核心/说明、独立集成）在以上范围均通过。首轮 25 失败/挂起已通过有界夹具与消费者同步处理并实际全量复测，没有删除失败记录、绕过生产守卫或降低断言。两项平台条件跳过不计通过，也不声称 Windows 已验证。

没有尚待修复或补证的 R2 本机必需项。后续 SDK/CLI、相关生产、配置或依赖变化需重新判断受影响证据，尤其 E1 的二进制内嵌格式并非稳定公共 API。整个 reasoning 对象拒绝、非持久后续轮的历史恢复以及已有工具副作用后的中途继续仍是公开限制；UI 建议由其他负责人处理。本报告不授权提交、推送、发布或部署。
