# UI/UX 设计师交付导航

本角色不直接拥有运行中的系统业务功能，下表仅导航本角色的设计交付。角色创建记录不代表桌面界面已改变。

| 交付 | 用途 | 状态 | 文档 |
| --- | --- | --- | --- |
| 角色与交付约定 | 明确设计职责、文档权限与实现交接 | 已建立治理文件与初始元数据 | [创建记录](docs/design/2026-10-13_design_uiux-role-setup.md)、[交付约定](api-spec.md) |
| 桌面布局、交互与 HTML 原型 | 覆盖 UI-1/UI-2/UI-3，两档受控画布与本地演示交互 | v2 两轮设计评审完成；客户已授权属主实施；2026-10-14 四项澄清裁定增补，实施后独立复核通过 | [当前 v2 原型](docs/design/2026-10-13_design_ans-uiux-prototype-v1.html)、[交互说明（含 2026-10-14 增补）](docs/design/2026-10-13_design_ans-uiux-interaction-v1.md) |
| 设计规范与联合评审 | 具体尺寸、状态、阅读保持和验收口径 | 第二轮修订已复核；焦点环取色与四项裁定已生效；产品推荐设计方向 | [当前 v2 交互说明](docs/design/2026-10-13_design_ans-uiux-interaction-v1.md)、[PM 议程](../项目管理/docs/meetings/2026-10-13_meeting_product-uiux-redesign.md) |
| 引擎选择器 | 统一会话头触发器与三项应用内浅色菜单，保留引擎/缺配业务 | v1设计与本地双宽原型检查完成；生产未实施 | [规范](docs/design/2026-10-14_design_engine-selector.md)、[原型](docs/design/2026-10-14_design_engine-selector-prototype.html) |
| 完整桌面流程走查与原型 | 从导入/缺配/聊天到正式派发、待处理、运行、成果阅读和失败恢复 | v2已按第二轮修正草稿/保存/停止阅读/待选择映射，真实与原型检查完成，待最终评审；正式未实施 | [规范与证据](docs/design/2026-10-15_design_desktop-complete-flow.md)、[完整流原型](docs/design/2026-10-15_design_desktop-complete-flow-prototype.html) |
| 三接口两项UX差异短评 | 来源文档显选与仅保存报告/历史恢复的文案、回焦和能力边界 | 设计接受，具体差异待本次客户确认；冻结v2未改、未实施 | [接口UX短评](docs/design/2026-10-15_design_complete-flow-interface-ux-review.md) |
| UI/UX 实现验收 | 对实际候选核对布局、信息层次、阅读保持与操作可达 | 旧不通过保留；最终候选第二版（47703d0b／69b2ea02 等五文件，含行距缓存加固）设计面复核通过并补签，R1–R5 未回退 | [最终候选复核（含第二版补签）](docs/design/2026-10-14_design_uiux-final-acceptance.md)、[返工复验（旧指纹）](docs/design/2026-10-13_design_uiux-rework-acceptance.md)、[旧重验收](docs/design/2026-10-13_design_uiux-reacceptance.md)、[此前验收准备](docs/design/2026-10-13_design_ans-uiux-implementation-acceptance.md) |
| UI 平台化设计规范（Nova × 深色石墨） | Phase 0：令牌映射、组件清单、状态矩阵、动效/图标规范、One-shot 施工契约与 960/1360 两档静态原型 | 设计完成（status: designed）；未实施、未测试；待客户观感门与 PM 派发 | [规范](docs/design/2026-10-21_design_ui-platform-nova.md)、[原型](docs/design/2026-10-21_design_ui-platform-nova-prototype.html)、[检查证据](docs/design/2026-10-21-nova-prototype-evidence/) |
| Phase 2 React 骨架设计对齐评审 | 只读复核 shadcn 令牌落地、Nova 密度、组件/图标/Motion、确认卡/抽屉/侧栏状态与已知偏差；含 Phase 2b 修正复核 | Phase 2 当轮 needs-work（3 项 Phase 3 前必须 + 1 项契约决定）；**Phase 2b 复核 pass**，剩余项按 Phase 3/4/5 处理 | [评审记录](docs/design/2026-10-21_design_ui-platform-phase2-review.md) |
| Phase 3A 聊天流核心设计对齐评审 | 只读复核 15/27/900/16、Markdown、工具行、状态徽标、operator 卡、虚拟窗口/滚动与动效纪律；含 3A2 修正复核 | Phase 3A 当轮 needs-work（7 项 Phase 3B 前必须）；**3A2 复核 pass**（Markdown、回放/受阻、工具时间/异常/chevron、choice 40px、虚拟状态、CTA、sys-config），剩余为 Phase 4 打磨 | [评审记录](docs/design/2026-10-21_design_ui-platform-phase3a-review.md) |
| Phase 3B 卡族与输入区设计对齐评审 | 只读复核 shell/su/恢复卡、judge 双开关/结果行、发送/停止/附件/队列、system 行与视觉纪律；含 3B 修正复核 | Phase 3B 当轮 needs-work（5 项 Phase 4 前必须）；**3B 修正复核 pass**（SU 600/琥珀警告、shell 详情 Lucide chevron、拖入反馈、撤回 28px、缩略图 8/4/12），剩余为 Phase 4/5 | [评审记录](docs/design/2026-10-21_design_ui-platform-phase3b-review.md) |
| Phase 4A 设计确认（引擎/设置/角色资料/工作概览/队列） | 真实引擎三态、三引擎设置面板、角色资料/文档、工作概览/角标、队列抽屉、组件与旧语义边界 | 设计完成（status: designed，revision 3，PM §十二 裁定已回填）；静态原型 1360/960 自检通过（抽屉 424、无横溢、对比度过门槛）；未实施、未接真实 IPC/屏读；固定保存条/960 待真机验收 | [设计附录](docs/design/2026-10-21_design_ui-platform-phase4a-design.md)、[原型](docs/design/2026-10-21_design_ui-platform-phase4a-prototype.html)、[证据](docs/design/2026-10-21-phase4a-prototype-evidence/) |
| Phase 4A 实现设计对齐评审 | 只读复核引擎真实状态、三引擎设置、资料/文档、工作概览、队列、左树单计数与失效 operator 卡；含 M1–M6 修正复核 | **M1–M6 复核 pass**（99/99 冒烟、28 张截图；队列子视图/撤回回执/Tabs 键盘/保存条两行/资料状态-only/960 焦点 Esc inert 与 200% 均通过）；剩余菜单状态文字、当前引擎点语义、当前工作「进行中」、时间秒、待办定位、关闭按钮 ×、设置草稿等 4B/5 打磨 | [评审记录](docs/design/2026-10-21_design_ui-platform-phase4a-review.md) |
| Phase 4B 设计确认（治理三权/镜像/治理记录/报告回执） | 治理三权卡/镜像/排队聚合、治理记录建立/重新接受/迁移预览、报告全文/persistence/delivery、菜单配置状态、single 警告刷新、queueView tab 清理 | 设计完成（status: designed，revision 1）；无新 shadcn 原语，登记 3 个项目组合组件；未实施、未接真实 IPC | [设计附录](docs/design/2026-10-21_design_ui-platform-phase4b-design.md) |
| Phase 4B 实现设计对齐评审 | 只读复核治理三权/镜像/排队、治理记录预览、报告/persistence/delivery、菜单状态、queueView、single 警告、judge 重放与 anchor；含最终 70/70 冒烟与 1360/960/200% 10 张截图 | **200% 收口复核 pass**（70/70 冒烟、10 张截图；200% 左树可见可滚动、缺配条全宽、报告/完整摘要/治理预览可见且逐容器无横溢；960 报告 facts 可见；C2/锚点/VISUAL/RUNTIME 无回退）；剩余为 Phase 5/真机与视觉打磨 | [评审记录](docs/design/2026-10-21_design_ui-platform-phase4b-review.md) |
| Phase 5 最终视觉审计计划 | 生产入口候选 1360/960/200% 关键面、Nova 基线、真实 Electron/计算样式/键盘焦点、旧新对照、证据格式与设计/测试/验收分工 | 计划完成（status: designed，revision 1）；5A 旧快照与 5B 新端审计已执行；5B 结论 needs-work（P0/P1 未清零），候选冻结后需复测 | [审计计划](docs/design/2026-10-21_design_ui-platform-phase5-visual-audit-plan.md) |
| Phase 5A 旧入口视觉快照 | 旧入口真实 Electron A–L 关键面 1360/960/200% 快照、computed/rect/scrollWidth/键盘焦点/Esc/inert 证据 | 快照任务 pass（75 张三档 +17 张标准 1360、75 metrics、11 keyboard）；旧端 1360/960 基本 pass、200% needs-work；旧 e2e E2E_PASS=false（既有）；仅作旧端对照，新端待候选 | [审计报告](docs/design/2026-10-21_design_ui-platform-phase5a-old-visual-audit.md)、[证据](docs/design/2026-10-21-phase5a-old-visual-evidence/) |
| Phase 5B 新入口视觉审计与两条裁定 | 新入口 1360/960/200% A–L 审计；旧端对照；12 条 design audit 重锚复核；PM §十八 可见行/0.9s 转轮裁定 | **needs-work**（P0 200% 输入区不可达；P1 200% 错误态横滚、W10/W11 缺转轮、密度等价未立；P2 注入行高/多层状态条/200% 镜像交付目标/证据命名）；裁定可见行不退役（≥9/≥8/≥4）与转轮保留 0.9s；候选审计后已重建，需冻结后复测 | [审计报告](docs/design/2026-10-21_design_ui-platform-phase5b-new-visual-audit.md)、[证据](docs/design/2026-10-21-phase5b-new-visual-evidence/)、[评审追加](docs/design/2026-10-21_design_ui-platform-phase4b-review.md) |
| Phase 5B BOOTSTRAP 空态设计依据（PM §十九） | 区分旧「完成 bootstrap」入口条（有意删除）与 S0「项目尚未 bootstrap」唯一提及/中心 CTA（非有意删除）；给补回规格与新区断言 | **needs-work（P1）**：`hasRoles===false` 需恢复 S0 标题/说明/`#btn-start-primary`「开始与 <主入口> 对话」，单一提及、无左栏提示、无治理 CTA；旧入口条保持删除 | [设计依据](docs/design/2026-10-21_design_ui-platform-phase5b-bootstrap-empty-state.md) |
| Phase 5B design audit 重锚落地复核（PM §十九） | 复核 12 条重锚的桌面UI 落地；新候选 5A 冒烟 19/19 验证 200% P0/P1 修复 | **needs-work**：W1/S3/W6b/W6/W9-12px/W10/W11/reduced-motion 设计口径基本成立；**W9/W10/W11 被改为 CSS keyframes 而非 Motion**（违反 Nova §7.1/PM 要求）；密度规范夹具、S2 右缘、旧审计选择器未落地；完整 A–L 待新 hash 重跑 | [复核记录](docs/design/2026-10-21_design_ui-platform-phase5b-reanchor-review.md)、[证据](docs/design/2026-10-21-phase5b-reanchor-evidence/) |
| Phase 5B 唯一生产入口最终视觉审计 | `app/renderer/dist/index.html`（HTML `3c4da2a2`/JS `f568e2aa`/CSS `76fad7ce`）1360/960/200% A–L；36/36 5A 冒烟、70/70 4B 冒烟、31/31 design audit、32/32 带提示条密度、S0 25/25、main E2E_PASS + 51 张三档 | **pass（P0 0、P1 0、P2 5）**：旧渲染器/vendor 已删；200% 左树/输入区/composer 95、report/details/preview/mirror/delivery/S0 目标 bottom ≤ composer.top；治理预览 ≤900 + Esc 回焦；P2 为 480 镜像 chip/动作重叠、480 完整卡片标题在视口外、480 缺配条下半/按钮被 composer 覆盖、main 3× 200 截图位/命名、harness 标记注记 | [最终审计](docs/design/2026-10-21_design_ui-platform-phase5b-final-audit.md) §十二、[证据](docs/design/2026-10-21-phase5b-production-entry-audit-evidence/) |


只读输入：[产品导航](../产品/feature-map.md)、[桌面UI 导航](../桌面UI/feature-map.md)、[桌面窗口 导航](../桌面窗口/feature-map.md)、冻结归档 [桌面应用 导航](../桌面应用/feature-map.md)（2026-10-14 拆分，只读）、[项目整体架构](../项目管理/docs/architecture.md)。具体任务以项目管理交付的议程、产品目标和证据为准。

| 页面统一布局与视觉层级 | 收紧导航、统一字阶节奏、报告先声明/事实/摘录后证据，来源入口可发现 | 首版原型已自验，产品/PM第二轮待审；正式应用未实施 | [方案](docs/design/2026-10-15_design_visual-convergence.md)、[可点击原型](docs/design/2026-10-15_design_visual-convergence-prototype.html) |

2026-10-15 视觉收敛第二轮：V2 dcc614d0…已修普通聊天概览假报告、清单返回资料链、完整summary可达与reading重绘展开；自身IAB实测三档，原型不代产品亲测。规范含逐项回应，待root/PM具体版复核。

2026-10-15 本轮视觉设计V2收口：HTML e95b363d…，root正常IAB已完成分版实际检查（dcc主修/e95状态窄修与最终三档），产品静态最终推荐；本角色不代签产品原型亲测。自身新manifest绑定最终规范、原型和root canonical。正式应用未实施，等待客户确认。

2026-10-15 客户已授权视觉V2实施，新增[落地独立评审](docs/design/2026-10-15_design_visual-v2-implementation-review.md)。仅自身新文档/证据写权；accepted视觉规范/原型与r2冻结不改。当前首轮只读准备、待稳定候选与root串行GUI，未签通过。

2026-10-15 V2正式落地严格UIUX范围通过：renderer5324b786/stylesdf554f87/index7beda，SV1–SV13及真实batch/资料阅读差距均关闭。依据本角色源码/看图与root真实native截图/AX，未冒签亲操作；accepted原件不变，详见[最终评审](docs/design/2026-10-15_design_visual-v2-implementation-review.md)。无新增设计项或明确待修阻点。

2026-10-16 视觉收敛 v3（审计+提案，未实施/未测试）：客户「聊天太松散/思考没动画/运行图标丑」。产出[审计与收敛提案](docs/design/2026-10-16_design_visual-convergence-v3.md)（快速赢 W1–W11 + 结构级 S1–S4 + 不动作清单 + 12 条数值验收断言）与[证据清单](docs/design/2026-10-16-visual-convergence-v3-evidence/manifest.json)（38 件：before/after 示意截图、逐值度量、renderer 哈希）。等 PM 评审与客户逐项勾选后由桌面UI 实施。

2026-10-17 企业级稳定感提案（未实施/未测试/未部署）：客户「太轻飘飘/不稳定/没有企业稳定感」。输出[设计说明](docs/design/2026-10-17_design_enterprise-stability.md)（问题诊断、A/B 两档、token、布局稳定性、组件状态、可访问性、实施映射、9 条验收口径、D1–D8）与[单文件原型](docs/design/2026-10-17_design_enterprise-stability-prototype.html)（现状/A/B × 1362×862/1280×800/1440×900/960×620，演示数据）。推荐 **A 轻量加固**（A1 框与同列 → A2 重量 → A3 密度），B 企业化重构作为后续独立提案。原型 Playwright 本地自检通过同列 0.0px、固定区 0 位移、宽表内滚、输入增高宽不变、对比度达标；真实 Electron/屏读/640–959 未测。等 PM 评审与客户 D1–D8。
