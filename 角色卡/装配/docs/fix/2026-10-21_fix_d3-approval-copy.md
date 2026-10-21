---
id: assembly-d3-approval-copy-fix
type: fix
title: README 说明现行需求确认代批与失败处置
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [ans-permission-boundary-repairs]
events:
  - date: "2026-10-21"
    kind: implemented
    summary: 按已批准 D3 R5 修正 README 首次使用和代批说明，未改产品行为
  - date: "2026-10-21"
    kind: verified
    summary: 文档差异、七个相对链接及新旧口径核对通过；不代表产品回归或独立验收
---

# 开启代决策后，需求确认也可以自动处理

README 原先写“需求确认卡不代批”“失败回落手动确认”，首次使用也暗示必须本人点击。这与当前实现不符：需求确认已归入“替我决策”，适用自动判断的治理卡失败后退回发起角色修正。

本次按已批准的 [D3 R5 方案](../../../项目管理/docs/design/2026-10-21_design_permission-boundary-repairs.md)修正 [README](../../../../README.md)；文档入口见[装配功能导航](../../feature-map.md)。没有修改运行时代码、测试、包版本、依赖或发布配置。

README 现在说明：

- 首次使用的需求确认、提案、任命、写盘及验收按对应开关处理。需求确认自动判断只能代选 `confirm`，不能代选 `revise`。
- 开关开启且适用自动判断时，证据不足、读取失败、判断不可用、超时或解析失败均不自动放行；shell 不执行，写入与决策请求退回修正，不因此弹出手动卡。
- 开关关闭、未接入自动判断或不适用的请求保留原手动路径；治理判断期间关闭开关可恢复原卡，轮次中止按取消处理。
- 只说明成功代批有“judge 代批”标识，不承诺所有失败都会产生 judge 结果行。

行为依据为 [`GOVERNANCE_CARD_GROUP`](../../../../src/model/runtime.ts)、[客户输入通道](../../../../app/desktop/customer-input.ts)及现有 [intent-confirm 编排用例](../../../../test/编排/governance-judge.test.ts)、[桌面接线用例](../../../../test/桌面应用/operator-wiring.test.ts)。这些源码与测试仅只读核对，没有由装配修改。

## 验证范围

本次是文档修复，仅检查差异范围、旧口径残留、相对链接及文案与现行分支的一致性。产品测试和全量测试由对应实施、测试角色另行取证；本记录不宣称产品回归或独立验收通过。未调用模型、未提交 Git、未打包或发布。

文档核对基线为 `fc1a39c14e119faccf442fc8e22bbbbd978d1a04`；D3 SHA-256 为 `a81908e2486f88cacb4efe284dc030cd888e11c99619099def30217771b71e77`，与批准记录相同。`git diff --check` 对 README 和本角色导航、备忘录通过；本修复记录的七个相对链接全部存在；README 中“客户专属”“需求确认卡不代批”“只有你确认后”“一律转手动确认”等旧说法已移除。差异仅涉及 README 五处相关段落及本角色修复记录、导航、备忘录。
