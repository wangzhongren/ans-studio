---
flowId: flow-a
version: 1
riskTier: T2
---

# 验收标准：flow-a

| ID | 标准 | 需要的证据 | 判定 |
| --- | --- | --- | --- |
| P1 | 交付实现（impl） | 单元测试与真实启动演示 | pass |

风险档位：T2（流程 flow-a；依据：跨角色集成变更）。
判定规则：pass / fail / insufficient evidence / not applicable。
证据计划：受影响单测 + 真实启动演示日志与截图。
版本：v1；实施开始后冻结，变更须递增版本。
