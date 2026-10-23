# Bootstrap 留痕（创世 finalize）

> 本文件由**代码**在 su 的治理会话 settle **之后**生成（su 不会算 hash，故 pin 只能事后算）。
> **pin 每轮 su settle 后自动刷新**（§13.3）：本文件钉的是「**本轮结束时的边界面**」——
> 对**外部**（非经 su 会话）的边界改动，**下一次 su settle 会吸收进 pin**（tamper 检测窗口 = 到下次 settle 为止）。

- 生成时间：2026-10-22T13:34:15.019Z
- 目标项目：C:/Users/51054/Desktop/work/ans-studio/角色卡/测试/docs/change/2026-10-22-role-granularity-parallel-testing-phase-e-evidence/tmp-full-parallel/ans-governance-e2e-appointment-timing-AlxGed
- 授权来源：test:governance-e2e
- 角色（1）：executor

## Pin 的边界文件（SHA-256）

| 路径 | SHA-256 |
| --- | --- |
| 角色卡/governance-boundary.yaml | e5f1afbce6f2cad17dee48a1031530f7e2f40b8a2925d7e5d231cdd9d946f4b7 |
| 角色卡/executor/boundary.yaml | a04dfc5a7b6da27b020c6ad3922646d1b1f871099ab25f6a1a40e6b9b9fd635e |

## 实际创建路径（逐条留痕）

- 角色卡/executor/api-spec.md
- 角色卡/executor/boundary.yaml
- 角色卡/executor/feature-map.md
- 角色卡/executor/functional-description.md
- 角色卡/executor/memo.md
- 角色卡/executor/role-card.md
- 角色卡/governance-boundary.yaml
- docs/flows/flow-a.yaml
- docs/intents/intent-a.md
- .ans/project.json（本 finalize 写出）
- docs/bootstrap-manifest.md（本 finalize 写出）
