# README 与桌面多运行时保持一致

README 前段仍把执行层与桌面描述为 Pi 单引擎，重启恢复仍写旧 Pi 单目录；后面的三引擎配置表已经更新，读者会得到互相冲突的用法。本次按已获客户实施授权的 [ANS-RUNTIME-V2 revision 1](../../../项目管理/docs/design/2026-10-14_design_multi-runtime-integration.md) 与项目管理 B1D 派发，只修正 README 和装配自有文档，不改产品、依赖、超时逻辑、实际 `.env` 或其他角色文件。[既有装配与原证据](2026-10-14_change_multi-runtime-assembly.md) 保持历史来源。

## 修改前核对与准备修改

已只读核对 `app/renderer/index.html`：正式选择器只提供 Pi/Codex/Claude；demo 是 CLI 与测试兼容入口，不新增桌面选项。`src/common/shared/runtime-settings.ts` 与 [桌面窗口公开报告](../../../桌面窗口/api-spec.md) 提供当前引擎字段、掩码、有效来源和 profile 应用状态；Pi 仍有自身 token/base/model 与可选 contextWindow。持久化公共实现为 `src/provider/runtime/session-store.ts` 的角色/runtime 隔离根，`ans/index.json`、`ans/replay.jsonl` 和 `native/` 分开；Pi 才提供旧角色目录 legacyDirectory。窗口从实际适配器上下文属性转换恢复状态，不能根据文件存在承诺模型恢复。

准备修正开头、桌面说明与步骤5/6、Pi设置入口称呼、安全/存储摘要和等待措辞。CLI 保持四个合法值，默认 role run=demo、govern=Pi；桌面默认 Pi、正式可选三个真实引擎。ANS层确认等待不设超时并暂停该轮计时，Claude native MCP 约24.8天上限与Codex上游期限未知仍准确披露。保留实际Codex固定app-server实验代理、Claude no-bare/settings.disableAllHooks和已有原生回环来源。桌面history/live去重、主进程和独立T1最终门槛尚在接续，不把文档核对写成产品验收。

## 首轮文档核对

本文件先于README改动写成可审阅的修改说明，使用同范围已有授权，没有新增产品决策。README已修改：开头不再将执行层限定Pi；桌面准确写三个正式选项、当前引擎设置/有效来源/掩码与安全应用；存储写角色/runtime下的ans与native，旧Pi JSONL仅Pi兼容，恢复以适配器实际状态为准。ANS等待与上游期限分别表述；四CLI值/两个默认和三引擎真实配置、运输与限制保持。`.env.example`已经准确，本次没有改动。

只做文档检查，没有重复测试/编译/原生探针。对照HTML的正式selector精确为pi/codex/claude；旧Pi-only、文件即恢复与无限等待措辞已消除；README三个本地Markdown目标全部存在、代码围栏配对，diff空白检查通过。21份自有生产/配置/测试文件逐项SHA与写前一致；未读实际`.env`，没有改产品、依赖、测试或同伴资料。原始写前指纹见[保护范围](2026-10-14-multi-runtime-evidence/b1d-before.json)，最终README指纹和各检查见[文档结果](2026-10-14-multi-runtime-evidence/b1d-doc-checks.json)。

该首轮结果只证明README与读取的实现/公开契约一致；当时history/live重复、主进程交互与最终T1合并门槛仍待原属主。项目管理阶段记录见[整合报告](../../../项目管理/docs/change/2026-10-14_change_multi-runtime-integration.md)，最终结果见下节。

## 最终已通过候选的文档核对

T1当前[独立报告](../../../测试/docs/change/2026-10-14_change_multi-runtime-independent-verification.md)已标verified，原始最终记录为实际入口23/23、旧界面119/119、锚点14/14，全仓1226总/1225通过/0失败/1既有Windows跳过，类型/diff均0。项目管理要求将README“最终T1仍在接续”更新为这份已通过的无网络候选结果，并链接测试与[整合报告](../../../项目管理/docs/change/2026-10-14_change_multi-runtime-integration.md)。本阶段仍只改文档；不会把假外部引擎、本地真实MCP或有限原生探针写成线上模型全验证。

**B1D最终状态：verified，验证范围仅文档。** README已反映上述T1结果，保留线上模型未验证和所有原生限制。21份自有源码/配置/测试逐项SHA仍与写前一致，README五个本地链接均存在、围栏配对、作用域diff格式检查通过；没有改产品、依赖、测试或实际`.env`，没有重跑动态检查/native probes。最终README SHA-256为 `44941e78c117b14983debdc48bea8fc77c81b514c7a1f3cacc725a3e3071d0d7`，证据见[最终文档核对](2026-10-14-multi-runtime-evidence/b1d-doc-checks-final.json)。实际产品验证由T1原报告证明，本文没有另造一次验收。
