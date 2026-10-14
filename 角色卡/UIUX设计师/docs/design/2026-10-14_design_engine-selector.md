---
id: uiux-engine-selector-v1
type: design
title: 让引擎选择器与浅色工作台一致
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: designed
related: [desktop-runtime-choice]
events:
  - date: "2026-10-14"
    kind: designed
    summary: 交付单一推荐方案、可交互原型与双宽本地浏览检查
---

# 让引擎选择器与浅色工作台一致

用户在 su 会话头选择 Claude 时，当前关闭控件十分紧凑，展开却出现系统深色磨砂菜单、亮蓝选中背景和白勾，视觉与浅白、中性灰、olive-gray 的工作台不一致。推荐保留「引擎」旁的单一紧凑触发器，替换为应用内浅色选择列表。三项仍为 Pi、Codex、Claude；用户选定后走现有引擎切换流程。

这是 v1 设计提案，未实施。交付：[交互原型](2026-10-14_design_engine-selector-prototype.html)。原型打开 URL 为 `http://127.0.0.1:8766/2026-10-14_design_engine-selector-prototype.html`（仅本机预览服务器）；也可直接打开单文件 HTML。顶部模拟控件、项目/记录演示文字、原型设置占位层及底部状态对照都不迁入正式界面。原型不调用 IPC、读写项目或配置，也不发模型任务。

## 输入与判断

源码事实：`app/renderer/index.html:78–84` 是原生 select，`styles.css:476–478` 当前最大宽95px、padding 3px 5px、圆角6px；`renderer.js:316` 的 selectRuntime 先拦未导入/非法值/当前值，再切独立视图并读取配置；缺配入口继续使用 `runtime-config-notice` 和 `runtime-config-settings`。设计令牌见 styles.css 的 :root。

真实窗口观察由 root 在本次会话提供：已导入 p-limit、Claude 缺配；原生菜单深色磨砂、蓝选中/白勾，向上跨会话头且可覆盖缺配条；触发器有系统双边框焦点。原始截图在会话内，未落本角色目录；本角色不把该转述写成自身亲拍。自身实际浏览证据只涉及本 HTML 原型。

产品输入：[选择器产品简报](../../../产品/docs/design/2026-10-14_design_engine-selector-product-brief.md)。运行中的行为契约：[桌面引擎选择](../../../桌面UI/docs/feature/runtime-choice.md)。临时菜单覆盖部分缺配文字是选择列表的正常覆盖，不把完全不遮主条变成新约束；关层后主条和设置入口必须恢复正常。

## 单一推荐：浅色紧凑列表

| 元素 | 取值 | 用途 |
| --- | --- | --- |
| 标签 | 11px，--text-2，与触发器间6px | 保留现有「引擎」上下文 |
| 触发器 | 104×28px，左右10px，字12px，圆角6px，边框1px | Claude 不拥挤；保持会话头轻量 |
| 箭头 | 12×12px，1.5px描边，--text-2 | 展开时向上，装饰图形 aria-hidden |
| 弹层 | 宽160px，padding4px，圆角8px，边框1px | 三项统一排齐，非内容卡片 |
| 行 | 高32px，左右10px，圆角6px，字12px | 单击选定，不加搜索、品牌图标或描述 |
| 层距 | 距触发器6px，视口边缘至少8px | 默认下开；空间不足可上开，横向夹视口 |
| 浮层阴影 | 0 4px 14px rgba(36,38,36,.08) | 只为临时浮层与被覆盖内容分层 |
| 键盘焦点 | 2px --focus-ring，offset2px | 仅触发器一条明确焦点环，无系统双边框 |

颜色直接复用现有令牌：底 `--bg #FFFFFF`；文字 `--text #242624`；次字 `--text-2 #737773`；边 `--border #E5E7E3`、较强边 `--border-strong #DCE1D5`；hover/临时项 `--bg-hover #EEEFEB`；当前选中底 `--bg-selected #E8EBE4`；禁用底 `--bg-side #F4F4F2`；展开触发底 `--bg-soft #FAFAFA`；焦点 `--focus-ring #42745E`。

当前项用浅选中底、600字重和右侧12px深色勾表示；勾才是当前值的稳定标识。鼠标悬停或键盘临时项用 hover底与1px较强边，不移动勾。临时项恰是当前项时仍有勾，当前值不变。没有连接成功/可用/已认证点灯，字段齐备不代表远程验证。

原生 select 仅改 appearance 无法保证系统展开菜单跟随令牌，因此不推荐；三分段按钮会占满更多会话头宽度，因此也不推荐。自定义列表的必要代价是实现者承担键盘、焦点和可访问语义，本规范把这些作为验收范围，不把它们留给默认系统菜单。

## 操作与状态

1. 未导入文件夹：原生 disabled 加 aria-disabled=true，不可开层、不进入 Tab 序列；原因沿用现有未导入空态，不新增常驻提示。原型中的“导入文件夹后可选择引擎”只是演示说明。导入成功（包括没有角色的文件夹）后启用，不以是否选了角色为门槛。
2. 点击触发器、关闭状态下 Enter/Space/↑/↓：开层，以当前值为临时项，不选新值；关闭时 Home/End 可开层并临时定位首/末项。
3. 展开时 ↑/↓：移动临时项，到首末停止；Home/End：定位 Pi/Claude。只有 Enter/Space 或点击选项才提交。点击当前项只收起，不重复调用 selectRuntime，不请求历史/开启会话。
4. Escape：取消浏览，当前值不变，焦点回触发器。再次点触发器、点击层外、窗口失焦：关闭，不提交；层外点击不抢回用户正点击的目标。
5. Tab/Shift+Tab：先关闭且不提交，浏览器沿自然焦点顺序继续，不阻止默认 Tab，不强行回触发器。缺配时下一项是对应设置按钮；没有缺配条时继续现有下一可操作元素。
6. 缺配引擎仍可选择；确认不同值后沿现有流程查询 metadata/missingKeys，保留现有主条及「打开 Pi/Codex/Claude 设置」，按钮直达对应既有抽屉。加载、失败、迟到响应、草稿/历史/后台工作隔离都沿原流程；原型写死的缺字段仅是演示，不成为生产必填规则。
7. 关闭后只显示当前名称；固定三项全文可见。任何因布局被截断的控件保留全文可获得能力（title/可访问名），不新增引擎枚举或搜索。宽窗和960窄窗使用同一组件尺寸，头部其他内容优先按现有布局收缩，不压缩控件为95px。

## 可访问语义与实现交接

使用 select-only combobox 控制关联 listbox；单一焦点留在触发器，通过 aria-activedescendant 指向临时项。combobox 带 aria-expanded、aria-haspopup=listbox、aria-controls；listbox 的三项 role=option，仅实际当前项 aria-selected=true，临时项不可改 aria-selected。可访问名称显式含「会话引擎，当前 Claude」（随值同步），避免只读“会话引擎”而丢掉当前值；当前值本身也可获得。箭头与勾是装饰，aria-hidden；无多余 Tab 停靠。原型实际AX树读取到 `Description: 会话引擎，当前 Claude` 与 `Value: Claude`，这不等于实际屏读软件验收。

桌面UI 属主实现 `app/renderer/index.html`、`styles.css`、`renderer.js` 对应选择器并更新自身必要测试/文档。本角色仅提供设计，不改上述文件。继续走原 selectRuntime，保留每引擎独立视图和已有 missingKeys/设置按钮，不改窗口API、IPC、运行时、权限或存储。恢复项目/选择角色等程序更新当前引擎时，同步 trigger当前值与选中项；项目卸载、导入状态改变时先关层，避免悬挂可操作菜单。生产验收由属主和独立测试执行，不以本地演示结果替代。

实现时弹层不被现有 overflow/抽屉裁断；具体挂载方式由桌面UI 按实际DOM选择最小可行方式，无须为设计新增框架依赖。默认下开，空间不足上开；视口极矮时可限制列表高度并内部滚动，键盘临时项必须保持可见。此处原型200px极矮视口仅验证翻转/高度约束，实际键盘临时项自动滚入可见范围仍留实现验收，不宣称全覆盖。

## 已检查与待验收

本角色在独立 Codex IAB 中实际打开最终本地 HTML。1360×640画布置于1400×920视口，960×620画布置于1000×900视口，无缩放；窄档实际测到app宽960、trigger104×28、menu160×106，document scrollWidth=1000与视口同宽。截图：

- [宽窗展开：Claude已选、Codex临时浏览](2026-10-14-engine-selector-evidence/1360-open-browse.png)
- [宽窗关闭及Claude缺配](2026-10-14-engine-selector-evidence/1360-closed-missing.png)
- [窄窗展开及缺配入口](2026-10-14-engine-selector-evidence/960-open-missing.png)
- [窄窗未导入禁用](2026-10-14-engine-selector-evidence/960-disabled.png)
- [窄窗模拟字段齐备，无连通标记](2026-10-14-engine-selector-evidence/960-complete-fields.png)
- [200px极矮视口上翻并限高](2026-10-14-engine-selector-evidence/960-edge-flip.png)

实际检查：↑↓移动仍保留Claude当前值；Home指Pi/End指Claude；Escape保持Claude并回触发器；Enter开层及Space确认Codex后名称/缺配/设置文案同步；Tab取消临时Pi后仍Claude且焦点进入settings-open，Shift+Tab返回；外击取消临时Claude且保持Codex；打开Codex设置占位层后关闭回按钮；未导入时disabled=true/aria-disabled=true/expanded=false且无缺配条；模拟字段齐备只隐藏主条，无成功连通声称。原型视觉state板还展示关闭、单焦点环、禁用、当前选中和临时hover同级样式；鼠标精确hover与窗口失焦分支本次仅源码核对，未单独实操。正常两档均保持原型设置入口可见，关闭临时菜单后主条可正常操作。

实际屏读软件、生产Electron键盘全链、真实配置读写、服务连通与正式业务隔离均未测；原型不是生产验收。正式实施待PM评审和客户对具体方案的实施授权。必要范围只有本选择器视觉/操作统一与原业务保持，无选装功能。
