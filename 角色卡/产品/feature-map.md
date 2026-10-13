# 产品 功能导航

本角色负责的**系统功能**导航。本角色没有直接负责的用户可操作业务功能（职责对象是产品整体，见 role-card）；本表登记的是**本角色产出的两类工作**的落点与状态，以及产品审视所依赖的只读参考入口。

> 注：本文件 2026-10-13 由本角色首轮工作建立（role-card 已引用本路径）。产品视角的功能全貌（各能力角色的功能面）见各角色自己的 feature-map（如[桌面应用](../桌面应用/feature-map.md)）——本表不复制。

| 功能 | 一句话用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| 产品提案 | 对产品整体（当前焦点=桌面应用）做系统审视，产出带优先级的改进提案（P0/P1/P2），交客户拍板后经协调方派发实现 | 已建立（首轮：桌面应用 UX 改进提案，12 条） | [2026-10-13 桌面 UX 改进提案](docs/design/2026-10-13_design_desktop-ux-improvement-proposal.md) |
| 产品评审 | 对实现角色的提案/交付做产品视角评审（口味五条=裁判标准），结论为 recommend approval / needs revision / not ready | 能力已立（依 role-card 与 proposal-review 参考），尚无已交付评审记录 | 评审纪律见 `ans-governed-construction` 技能 `references/proposal-review.md` |

## 只读参考入口（产品审视的事实来源）

- **客户口味五条**（界面要干净 / 信息在对的上下文 / 常规提示不打扰 / 每样东西要有用 / 诚实呈现）：提炼自近两轮客户反馈轨迹，完整表述在首轮提案文档第一节。
- 桌面应用功能全貌：[桌面应用 feature-map](../桌面应用/feature-map.md)、[functional-description](../桌面应用/functional-description.md)。
- 真机实测教训（120s 超时、工具集无列目录）：会话记忆 `real-model-desktop-test-findings`。
- 真机截图：`/tmp/ans-drive/shots/`（final-ui.png、pi-drawer.png 等）。

## 说明

- 功能点 = 用户或外部系统能触发并得到结果的行为；本角色不自编业务功能，上表登记的是本角色的产出物类型。
- 提案文档按 `docs/design/` 规范：每条含 问题/现状 → 依据（客户反馈/代码位置/真机）→ 提案（交互与验收口径）→ 优先级；P0 不超过 3 条。
