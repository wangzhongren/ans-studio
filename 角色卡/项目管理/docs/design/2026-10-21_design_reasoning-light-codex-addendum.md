---
id: reasoning-light-codex-addendum
type: design
title: Codex 已知模型强制 effort 的兼容差额
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: draft
related: [ans-reasoning-effort-lightweight-repairs]
---

# 一个实施期新发现，需要明确是否扩大 D1

用户已批准 [D1](2026-10-21_design_reasoning-effort-lightweight-repairs.md)，要求“不支持的等级要提示并兼容继续”，且 UI 不改。实施中发现：**Codex CLI 0.162.1 对 gpt-5.5 等已知模型，即使 ANS 不传等级，CLI 仍自动补默认 effort。** 因此 D1 现有的“去覆盖重建”不能保证这类模型在网关拒 effort 字段时继续。

此前用目录外 `probe-model` 取证，去覆盖确实省略 effort；实施期扩大到目录内真实模型才发现差异。不是普通网络故障，不能把新红例改成通过，也不能只补成功提示。

## 已完成的隔离验证

均为同一模型、同一 localhost 假 Responses 端点、假 key，无外部模型调用：

| 请求方式 | gpt-5.5 实际字段 | 仅拒 effort 字段的假网关 |
| --- | --- | --- |
| 用户选择 high | effort: high | 拒绝 |
| 当前 D1 去掉 ANS 等级覆盖 | effort: medium（CLI 自动补） | 仍拒绝 |
| 临时单模型 SDK 元数据覆盖 | reasoning 空对象，无 effort | completed |

证据：[当前产品红例](/tmp/ans-codex-current-field-check.json)、[隔离可行性结果](/tmp/ans-codex-single-model-catalog.result.json)、[临时探针](/tmp/ans-codex-single-model-catalog.probe.mjs)。第三行仅在 `/tmp` 探针验证，**没有加入产品**。

## 可选的最小扩展 E1（待客户决定）

允许 Codex 适配器在已明确拒绝 effort 字段、正常默认路径仍不兼容时，为**当前模型和当前临时引擎**生成一份单模型兼容元数据文件，使用现有 `model_catalog_json` 入口。仅调整默认思考等级及相关 summary 能力字段，保留其他模型说明、工具能力、上下文等原值，不换模型/端点、不改保存设置、不改 SDK 文件或 UI。

拟追加范围：

- `src/common/codex-adapter/reasoning-catalog.ts`：私有辅助，读取/验证当前固定 CLI 的模型元数据，只选择精确匹配项，生成隔离临时兼容文件；不得从任意项目文本或用户输入构造可信模型定义。
- `src/provider/codex/session.ts`：复用现有去覆盖重建和生命周期，必要时传上述临时文件；与当前实例一起清理，不写用户全局 config。
- `test/codex-adapter/reasoning-catalog.test.ts` 及已有真实回环：验证精确字段差异、版本/格式不符不套用、临时清理、同模型出站不含 effort、正常完成及下一轮策略。
- 测试角色的独立兼容回环与验收标准补入目录内模型真实场景。UI 仍只交意见。

**实际成本与风险：**公开 `model/list` 只给摘要，不能提供完整 ModelInfo。本次完整元数据取自已安装原生二进制中的内嵌 JSON，属于与 CLI 版本耦合的来源，不是稳定公共 API。产品实现须绑定当前 0.162.1 的可验证格式、对元数据做有界读取和精确匹配，并以升级回归检测变化；无法识别时不能猜造目录。不能把该扩展包装成普遍稳定的模型能力库。

即使加入 E1，网关拒绝整个 reasoning 对象、已有工具副作用后无法安全重放等 D1 原有边界仍存在，不能无限重试或伪造成功。

## 不扩展的结果

维持 D1 可以交付 Pi/Claude 兼容、Codex 具体档位默认回退及目录外模型去覆盖等修复；**目录内模型遇到 effort 字段整体拒绝这一项仍未满足自动继续要求**，须明确列为未完成/接入限制，不能给无保留的整项通过。

## 当前授权状态

D1 明确排除了“模型目录覆盖”。因此 E1 尚未实施，需客户明确选择是否纳入。已授权的其他代码和测试继续完成，不重做 D1、不改原批准内容；若批准 E1，独立验收另记本次范围差额和真实测试，不覆盖已有失败证据。
