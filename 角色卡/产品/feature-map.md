# 产品 功能导航

本角色负责的**系统功能**导航。本角色没有直接负责的用户可操作业务功能（职责对象是产品整体，见 role-card）；本表登记的是**本角色产出的两类工作**的落点与状态，以及产品审视所依赖的只读参考入口。

> 注：本文件 2026-10-13 由本角色首轮工作建立（role-card 已引用本路径）。产品视角的功能全貌（各能力角色的功能面）见各角色自己的 feature-map（如现在的渲染前端角色[桌面UI](../桌面UI/feature-map.md)；2026-10-14 起「桌面应用」拆分为桌面UI/桌面窗口，旧目录冻结归档）——本表不复制。

| 功能 | 一句话用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| 产品提案 | 对产品整体（当前焦点=桌面应用）提出带依据与验收的交互方案，交客户选择并经项目管理评审后派发实现 | 首轮历史保留；图片/停止/P1队列管理、LRU、防呆、CLI指路已由属主完成，当前状态见新评审对照 | [首轮提案](docs/design/2026-10-13_design_desktop-ux-improvement-proposal.md)、[当前状态与新建议](docs/design/2026-10-13_design_current-ui-reassessment.md) |
| 产品评审 | 从用户流程评价当前 UI，区分观察、代码事实与建议，附优先级/属主/成本/验收；不授予实施权 | 已交付当前 UI 重新评审：4张真实窗口截图+AX、已提交源码；限当时仅su空闲的状态（历史保留） | [2026-10-13 当前 UI 重新评审](docs/design/2026-10-13_design_current-ui-reassessment.md) |
| 产品与UI/UX联合设计 | 把产品目标转为页面层级、状态行为和验收约束，收到设计师方案后逐轮评价 | 两轮已收口：v2停止保留排队、角色独立状态、实际本地刷新修订已源码核对，产品推荐设计方向；不含O1–O4或业务代码实施（历史保留） | [第一轮简报](docs/design/2026-10-13_design_product-uiux-meeting-brief.md)、[第二轮评审](docs/design/2026-10-13_design_product-uiux-round2-review.md) |
| v2实际实现产品验收 | 读取实际候选源码、生产渲染器截图与操作证据，判断UI-1/2/3是否达到已确认目标 | 历史：9e50aac上唯一结论不通过、五项必要返工（已由后续轮次闭合，记录保留不改写） | [初次验收清单](docs/design/2026-10-13_design_product-ui-implementation-acceptance.md)、[当前重新验收](docs/design/2026-10-13_design_product-ui-reacceptance.md) |
| 五项返工独立复验 | 核对新候选五项实际体验及同版证据，客户要求产品/UI都通过后才提交GitHub | 已收口：最终结论由本轮最终复验取代——五项在最终候选（含漂移修复）上全部保持，历史记录保留 | [返工复验](docs/design/2026-10-13_design_product-ui-rework-acceptance.md) |
| 设计对齐最终产品复验 | 对「按 UI/UX v2 设计对齐 + 虚拟行锚点漂移修复」的最终冻结候选做产品面独立复核（R1–R5 保持 + 对齐的产品面评估），给出提交前置的唯一结论 | **通过（限产品面）**：测试三套件（119/11/14）哈希绑定全绿、PM 两档 A/B/C 图与读数逐项核对、桌面两记录与我方源码只读核对；无阻断缺陷，观察项与限制如实列明。**第二版候选（renderer 47703d0b，行距缓存加固）补签维持通过**：无产品面受影响项，新增 detached 路径独立探针（rowGap=16、零漂移、U1 60/60） | [2026-10-14 最终产品复验（含第二版补签）](docs/design/2026-10-14_design_product-design-alignment-final-signoff.md) |

## 只读参考入口（产品审视的事实来源）

- **客户口味五条**（界面要干净 / 信息在对的上下文 / 常规提示不打扰 / 每样东西要有用 / 诚实呈现）：提炼自近两轮客户反馈轨迹，完整表述在首轮提案文档第一节。
- 桌面应用功能全貌：[桌面应用 feature-map](../桌面应用/feature-map.md)（旧目录已冻结归档）、[桌面UI feature-map](../桌面UI/feature-map.md)、[functional-description](../桌面应用/functional-description.md)。
- 最终冻结候选证据（2026-10-14）：[PM 两档验收图与读数](../项目管理/docs/fix/2026-10-14-design-alignment-evidence/)、[测试角色最终独立复测记录](../测试/docs/change/2026-10-14_change_uiux-design-alignment-regression.md)与[证据目录](../测试/docs/change/2026-10-14-driftfix-recheck-evidence/)、桌面[对齐记录（归档）](../桌面应用/docs/fix/2026-10-13_fix_uiux-design-alignment.md)与[漂移修复记录](../桌面UI/docs/fix/2026-10-14_fix_virtual-row-anchor-drift.md)。
- 真机实测教训（120s 超时、工具集无列目录）：会话记忆 `real-model-desktop-test-findings`。
- 真机截图：`/tmp/ans-drive/shots/`（final-ui.png、pi-drawer.png 等）；历史一轮：`/private/tmp/ans-product-ui-review-20261013/`（01–04 与同名 AX）。临时文件不等于仓库长期存档。

## 说明

- 功能点 = 用户或外部系统能触发并得到结果的行为；本角色不自编业务功能，上表登记的是本角色的产出物类型。
- 提案文档按 `docs/design/` 规范：每条含问题/现状、依据、交互、验收、优先级；本轮最高建议仅三项P1，没有当前证据支持新增P0。源码推断不当作真机观察，已修旧问题不重新开单。
