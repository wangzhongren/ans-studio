---
id: engine-selector-design-review
type: design
title: 引擎选择器重新设计的项目管理审查
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
revision: 1
related: [runtime-selector-design-meeting, engine-selector-product-brief]
---

# 推荐统一浅色的引擎选择菜单

用户授权产品与 UI/UX 重新设计现有样式不协调的下拉框，本轮设计已完成两轮有边界联合评审。随后客户明确确认选择器设计 v1 并授权桌面UI实施与测试角色真实桌面验证；该授权仅覆盖已审查版本的必要控件/样式/测试，不扩大窗口、配置或业务规则范围。项目管理保持只读实现对照并维护本记录，等待当前候选与最终证据。

唯一结论：**recommend approval（仅设计方向）**。审查对象为[产品 brief](../../../产品/docs/design/2026-10-14_design_engine-selector-product-brief.md)、[UIUX 规范 v1](../../../UIUX设计师/docs/design/2026-10-14_design_engine-selector.md)与[UIUX 可操作原型](../../../UIUX设计师/docs/design/2026-10-14_design_engine-selector-prototype.html)，独立角色观点、证据归因与会议过程见[联合纪要](../meetings/2026-10-14_meeting_runtime-selector-design.md)。最终原型 SHA-256 `aab42cf7c533027798bf50c26e05b4791ce1e3da69980b72773826e98eb10cd3`；后续实质修改须复核对应证据。

root真实当前ANS观察表明原生下拉展开使用深色磨砂、蓝色选中与白勾，触发器出现双焦点边框，与现工作台浅白/中性灰及 olivegray 选择色不一致。只改 native appearance 无法统一系统菜单的展开观感；三个分段按钮增加头部占用。应用内单一触发器与三项菜单能对应用户指出的问题，维护代价是必须完整实现焦点、取消和可访问语义，原型与规格已有明确路径。

推荐保留头部“引擎”标签，以104×28px白底6px圆角触发器显示当前名称与箭头；弹层160px宽、8px圆角、32px三项行，灰色临时活动与 olivegray 已选及勾分别表达。主区不增加模型/账号/可用性信息。默认下开、视口不足翻转，临时遮盖缺配置文案不是业务损坏，不加“不得覆盖主条”的额外政策。

业务保持：未导入禁止打开；成功导入空文件夹也允许 Pi/Codex/Claude；方向键只浏览，Enter/Space/点击提交一次，确认当前项只关闭；Escape/外击/Tab取消临时浏览，Tab按自然顺序离开。切换接入现有 selectRuntime，不停止原引擎后台任务、不改变草稿、附件、待办或确认隔离；缺配引擎仍可选，主区现有missingKeys提示及“打开 <引擎> 设置”入口保留。动态可访问名称包括当前值；原型顶部模拟控制、正文与硬编码缺项不进入产品，不替代现有配置摘要。

项目管理独立只读最终原型源码并查看1360/960截图，确认当前值与临时活动分离、浅色一致、同项只关层及设置按钮命名。UIUX自验双宽与键盘/禁用/设置入口并记录图片；产品只读源码和图片，root亲操原型展开视觉。上述都是本地原型证据，无IPC、真实会话或配置读写；屏幕阅读器软件、长名压力未实测，不宣称生产兼容通过。最终 UIUX 另检查200px极矮视口翻转及限高，但临时活动项自动滚入可见尚留生产验收；鼠标精确hover与窗口失焦分支仅源码核对。规范明确这些覆盖限制，不能扩大原型已有结论。

设计阶段仅文档、原型和评审交付；同版实施现在已获客户确认，必要实施归桌面UI的renderer控件、样式和相关自有测试，仍需独立生产验证键盘/辅助技术、未导入禁选、三引擎与缺配置入口、后台及草稿/附件隔离。无需新增IPC、配置规则、写权或发送政策；没有可选增强项。实现及最终验证待当前候选证据，不以原型推荐代替验证。

## 已授权实施对照

已只读检查当前 `app/renderer/engine-selector.js` 和 renderer 接线：新组件在桌面UI的既有目录授权内，职责仅选择器展示与临时操作，提交回调走现有 selectRuntime。selected 与 active 分离；方向/Home/End只浏览，提交当前项不调用 onCommit；Escape/外击/Tab/失焦关闭且不提交；动态 aria 关联当前值与临时项；disabled 阻止打开；项目 applyListing 先关层、恢复与 updateControls 同步当前值和禁用。弹层固定定位、边界翻转与可见活动项滚动由组件负责，未新增窗口/配置/env行为。本轮不能把前次仍未提交的缺配修复 diff 当本次新增范围。当前未见实质设计偏离；最终候选哈希、属主行为测试及测试角色真实桌面仍待交付，暂不标 verified。

## 当前候选最终验收

项目管理已复核[测试角色最终桌面记录](../../../测试/docs/fix/2026-10-14_fix_engine-selector-verification.md)、[UI实施记录](../../../桌面UI/docs/change/2026-10-14_change_engine-selector.md)、两方候选清单与全仓原始日志。当前四生产文件 SHA 与属主冻结 manifest 一致：renderer.js `0182f4eb771a9549896234ec81796fc087be6efc462ddd8674f9b30520a7ce2e`，index.html `284b7f3aaed5c31865e16a9313b89197ae97985b1fd82f8d7eac1668cef52741`，styles.css `c8ccb9587b3ed885b8acc11c57824b9e16dd4e885b1a3c35a7fe7d2d08451710`，engine-selector.js `db7d14973461e96663a34ec9f3b0bf6332e65e587d2d7e3c196cbee497dad855`。

正式原生桌面实际验证初始鼠标/Down不可开层、取消导入仍禁用、成功导入解锁；End浏览不改当前值、Esc回焦点、Enter/Space提交、Tab取消并自然移到对应设置、ShiftTab返回；鼠标选择新项与当前项仅收层、层外点击取消且不抢焦，当前Claude勾与临时Codex分离为浅色样式。缺配主条及键盘打开正确Claude设置正常，安全密钥空值/未设置，没有填写或保存。候选清单证明 .env 哈希不变，测试角色核目标跟踪文件未改。

属主单元51/51、实际renderer受控 SELECTOR25/CONFIG20/RUNTIME16通过；允许既有本地回环的全仓1239项为1238 pass、0 fail、1既有Windows skip。测试角色记录最终typecheck通过；项目管理另跑当前diff --check通过。极矮/长名/活动项滚入/失焦/完整草稿附件隔离由受控renderer支持，不冒称全部正式窗口亲测；实际屏读软件与Claude在线连通性未测，字段齐备不等同远程可用。

最终结论：**当前候选 verified**。客户要求的v1设计接入、选择/键盘/导入前禁用/缺配置入口四项真实桌面验证已闭合，无实质范围偏离，无窗口或配置规则变化，未提交、推送或发布。
