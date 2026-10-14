---
id: runtime-selector-design-meeting
type: design
title: 引擎选择器产品与 UIUX 联合设计评审
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: designed
related: [runtime-config-entry-review]
---

# 让引擎菜单与当前工作台协调

客户要求产品和 UI/UX 重新设计下拉选择框。项目管理主持、产品 `/root/product_selector` 与 UIUX `/root/ux_selector` 在独立固定角色上下文参与，root 保持测试角色提供真实当前界面观察。本任务已经授权设计及有边界讨论，不再次请求设计任务授权；没有授权 app 实施。

议程限于引擎控件关闭/展开/禁用/键盘焦点的样式与交互，最多两轮：独立观点、针对真实观察与具体原型的回应。保持未导入禁选、导入后 Pi/Codex/Claude、缺配置主条及设置按钮，不能新增配置政策、发送限制或业务能力。

## 输入与独立观点

源码当前原生 select 为 max-width 95px、padding 3px 5px、6px圆角。root 真实观察当前已导入 p-limit、缺配置 Claude：关闭控件小 bordered，focus 双边框；展开菜单深色磨砂、蓝 selected 与白 check，与浅白/灰及 olivegray 工作台失配，向上跨头覆盖缺配条。截图仅在 root 会话显示，没有本地证据路径。禁用 AX 与点击不展开来自前轮实际验证，本轮未重新验证无项目状态；参与设计角色不得冒称自身真机自验。

首轮 UIUX 独立推荐：头部保留引擎标签、104×28px 应用内触发器，160px宽弹层、三项32px，白/中性灰、已选勾与临时 hover 区分；select-only combobox/listbox，焦点保留触发器、aria-activedescendant 描述临时项，Enter/Space提交、Esc/外击取消、Tab自然前进。仅改 native appearance 无法统一系统弹出样式，分段控件占头部空间，均不推荐。原型在 UIUX 自身目录准备。

首轮产品独立观点见[产品 brief](../../../产品/docs/design/2026-10-14_design_engine-selector-product-brief.md)：同意轻量自绘方向，仅引擎名称及已选勾，不增加模型/账号/服务可用性认知；自定义键盘与焦点的代价合理但必须完整。未导入原因借已有空态，不加常驻第二提示；菜单临时覆盖主区不是业务损坏，不立“不能覆盖缺配条”的硬约束。

第二轮产品只读[UIUX 原型源码](../../../UIUX设计师/docs/design/2026-10-14_design_engine-selector-prototype.html)，明确未亲自操作浏览器或 ANS：尺寸、active/selected 分离、导入禁用、取消/Tab 与视口翻转符合方向。提出正式设置按钮仍显示“打开 <引擎> 设置”、确认当前项只关闭不重复切换、辅助技术当前值不被泛化 aria-label 遮蔽、演示控制与正文不得入产品。PM将这几项归属意见交 UIUX 定稿，没有替产品发言。UIUX 对真实观察与最终原型实测的回应待收到后追加。

第二轮 UIUX 收束：保留“打开 <引擎> 设置”，同项确认仅关层；原型动态可访问名称含当前值，AX 描述与值可读，但未测屏幕阅读器软件。其自验覆盖 1360×640 / 960×620、临时与已选分离、Esc/外击/Tab/ShiftTab、Home/End/方向键/Enter/Space、禁用与对应设置入口。默认下开、视口不足翻转；接受临时覆盖主条，不增加强制避让政策。证据位于 UIUX `2026-10-14-engine-selector-evidence/`。设计师只改自己的设计与原型，无生产修改。

产品最终 brief 对方向给 **recommend approval（设计方向）**，无剩余方向阻塞；已实际只读最终 paint/commit 并查看四张双宽原型图，动态键盘来自 UIUX 自验经PM转述。PM也只读源码与查看1360/960截图；root亲自打开本地原型并展开观察浅色弹层，此证据只证明原型视觉。生产者与覆盖不混同。

会议在两轮内结束：推荐应用内轻量选择器，保持现有业务，交付可操作 HTML 原型及[UIUX规范v1](../../../UIUX设计师/docs/design/2026-10-14_design_engine-selector.md)。没有app/src/test变更；客户只授权本轮重新设计与联合评审，会议共识不构成具体生产实施授权。后续若实施，由桌面UI独立按确认版本接入现有切换流程，测试角色验证生产键盘/辅助技术、未导入禁选、缺配入口与引擎隔离，不把原型当实装验收。屏读软件和长名压力未验，最终UIUX补200px极矮视口翻转/限高检查，活动项自动滚入可见仍留生产验收；精确hover及窗口失焦仅源码核对。正式方向审查见[项目管理审核](../design/2026-10-14_design_engine-selector-review.md)。
