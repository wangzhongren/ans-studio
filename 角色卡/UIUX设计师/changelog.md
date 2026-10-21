# UI/UX 设计师变更记录

## 2026-10-13 — 由 ANS Governance 创建角色

客户明确请求创建 UI/UX 设计师角色并开展产品与设计联合评审。Governance 建立角色卡、同范围的 Markdown/YAML 边界、初始交付导航、备忘录、职责说明、交付约定和本记录，全部位于 `角色卡/UIUX设计师/`。

Section 1 仅授权本角色五份说明文件与 design/change/fix 三个文档目录，design 包含 HTML 设计原型及素材。角色卡和边界仅 Governance 维护；没有正式应用、源码、测试或配置写权。

详细范围与检查记录：[角色创建记录](docs/design/2026-10-13_design_uiux-role-setup.md)。九文件、八项边界、Markdown/YAML 一致性、25 个本地链接与现有角色枚举均检查通过，新角色没有枚举警告。当前尚无桌面设计方案或原型，后续由独立设计师上下文开展；未修改已有角色或业务代码。

## 2026-10-13 — 第一轮页面设计 v1

固定 UI/UX 上下文按产品目标提交 [HTML 原型](docs/design/2026-10-13_design_ans-uiux-prototype-v1.html)与[交互说明](docs/design/2026-10-13_design_ans-uiux-interaction-v1.md)：覆盖1360×860/960×620、工作/轮末/展开/失败未决、空队列/1+3/全文。辅助抽屉避开输入区，异常保持可见，角色工作先于资料。仅本地模拟，HTML脚本语法检查通过，浏览器检查与第二轮评价待PM回传；正式应用未实施、未测试、未部署。同步本角色五份说明文件，没有修改角色卡、边界或其他角色资料。

## 2026-10-13 — 第二轮修订 v2

产品对v1提出三项状态问题；v2仅停止当前轮次并保留队列和阅读，每角色保存聊天/工作/未决/已答/展开/草稿/位置，模拟刷新真实追加未知回放活动并重渲染。方案尺寸保持。原型与说明沿用-v1稳定路径，内部版本为v2；脚本语法已检查；后续PM浏览器结果见下项。无生产代码或真实数据修改。

## 2026-10-13 — v2 原型检查收口

仅补设计说明与本角色元数据，不改HTML、不新增讨论轮次。记录PM两档受控浏览器检查、真实本地刷新条数6→7及展开/全文/草稿保留、停止保留队列、跨角色未决隔离、撤回失败保留；只读链接PM三张截图。没有做精确滚动像素断言，锚点不宣称完全通过。产品推荐设计方向；正式应用未实施，真实Electron/模型/生产接口未测，未部署。详见[实际检查覆盖](docs/design/2026-10-13_design_ans-uiux-interaction-v1.md)。

## 2026-10-13 — 准备v2实现验收

依据用户授权其他角色开发并让UI/产品验收，建立[实现验收记录骨架](docs/design/2026-10-13_design_ans-uiux-implementation-acceptance.md)：21项检查覆盖两档两栏/抽屉/Pi、记录与异常、任务列表和状态保持、焦点键盘及视觉层次。所有结果为待查，等待PM给候选和界面证据；不把原型观察写成生产验收。未修改HTML、业务文件或其他角色资料。

## 2026-10-13 — 实施验收预查与触发精化

只读检查实际源码，接受既有正文13.5px/1.65/680px与既有留白，按最终两档可读性验收；明确显式角色点击保留U-1最新/未决优先，普通更新/抽屉/回放保持阅读。更新Q5/A1/V1口径，旧离线报告仅登记覆盖，不宣称最终候选通过。产品F1/B3等待桌面修复及最终重跑；未改业务或HTML。

## 2026-10-13 — 提高实际体验验收标准

根据客户要求，以可检查的专业工具体验目标审查冻结六源码与独立离线报告，区分功能证据、视觉差距和待覆盖操作；源码hash核对一致，旧报告不混用。记录主次、错误/动作邻近、工作列表扫读、控件密度、两档与键盘要求；待PM截图后签实际验收，不称殿堂级认证、不扩O1–O4、不改业务或原型。

## 2026-10-13 — 提交9e50aac独立重验收

按客户重新验收要求只读当前源码与v2，新增[重验收记录](docs/design/2026-10-13_design_uiux-reacceptance.md)，最多五项，此时收敛四项返工：单份常规说明、队列稳定结构/28px点击区、异常默认可靠目标/原因、撤回就近反馈。R1/R3明确未达承诺，其他视觉严重程度待实际图像；不把功能报告或正文参数取舍当页面通过。未改业务、原型或其他角色资料。

## 2026-10-13 — 当前界面独立重验收不通过

实际查看提交9e50aac真实/同renderer两档九张截图后签[UIUX不通过](docs/design/2026-10-13_design_uiux-reacceptance.md)。收敛五项返工：重复说明、全文横溢出与动作对齐/小点击区、异常默认目标、撤回就近回执、未决优先工作表达。R4仅源码/先前受控证据，本轮没有亲拍，不称实测遮挡；Tab只记录PM完成片段。保留已有功能改善，不扩O1–O4、不靠字体或装饰替代设计，不改生产/原型或其他角色资料。

同轮重验收补R5：图07未决主动作与定位入口半遮为实际证据，不能以允许覆盖历史抵销。返工仍五项，R5合并状态主次与完整可处理，沿既有定位入口收抽屉后定位原卡，保持普通刷新/到达阅读与U-1，不新增会议或面板。

## 2026-10-13 — 五项返工新候选复验准备

建立[独立返工复验](docs/design/2026-10-13_design_uiux-rework-acceptance.md)，实际核对三个新冻结hash与属主76报告；五项源码方向已修，新图像与S1独立重绑待提供，不凭测试数量签。保留旧不通过历史，未改业务或原型；通过后的提交由PM按用户授权安排。

## 2026-10-13 — 五项返工UIUX限定通过

实际查看新两档七张界面图，绑定renderer fc148…/styles f9c4…/最终helper9ffda…，核对S1独立111/11与未变范围14锚点证据，签[本五项UIUX通过](docs/design/2026-10-13_design_uiux-rework-acceptance.md)。报告明确1360开资料全文未亲看、两档几何补证及原生键盘为测试角色执行证据；非真实模型/服务/产品等级认证。旧不通过历史不改写，生产未改，提交交PM按客户既有授权安排。

## 2026-10-14 — 最终候选设计面独立复核通过（含四项澄清裁定）

客户要求按 v2 设计实施后由 UI/产品复核。桌面已拆分为桌面UI/桌面窗口（旧目录只读冻结）。本角色对最终冻结候选（renderer 402e49a7…、styles 69b2ea02…、index 9b542de1…、tool-rows 9ffda4bf…、ui-labels 9f344ebf…，五哈希实测复核）完成独立复核：**自行重跑只读测量夹具**（输出 /tmp，未写仓库），report.json（sha 6523fe78…）与十张 PNG 与 PM 证据逐字节一致；亲看两档十图与全量 rect/样式读数，并只读核源码中的焦点环、记录组、未决卡、定位药丸与空态文案——骨架/760 会话列/色板字阶（14px/1.9 等）/圆角纪律/记录组（42px 时间列·'›' 收纳·42px grid）/异常卡/未决卡/侧栏/抽屉（头·资料组·Pi 表单）/composer 与发送停止/hover-focus 均与设计一致。登记差异 11 条（发送钮 #242624、停止钮 999px 浅底、统一 16px 行距、sticky 定位药丸、队列 28px 按钮、侧栏徽标、窗口钮内嵌焦点环、4/6px 与 10/8px 级微差等）均为后出裁定保留或像素同级，无新增阻塞缺陷。

R1–R5 经测试角色最终复测（119/11/14 全绿、锚点红转绿）与图像确认未回退；漂移修复 CSS/HTML 零改动、设计面无异议。四项澄清一次裁清：助手说话人行与抽屉「此角色的工作」小标题**确认不需要**；统一 16px 行距**确认达成**设计意图；焦点环 #42745E **纳入**设计规范取色表（已增补[交互说明](docs/design/2026-10-13_design_ans-uiux-interaction-v1.md)，该文档状态更新为已实施并复核）。无交回 PM 的后续项。**唯一结论：设计面通过**（[最终候选复核](docs/design/2026-10-14_design_uiux-final-acceptance.md)）；产品独立结论另出；旧 2026-10-13 23:24 签署随两批源码改动失效、旧不通过与各轮历史保留不改写。未改 `app/`、`test/`、其他角色资料；未 commit/push；未发模型或真实服务任务。

## 2026-10-14 — 第二版窄修复补签（设计面结论维持通过）

桌面UI 排查 U1_WINDOWED 偶发时发现并修复一处真实窄缺陷：「脱离文档的 pane 首次读行距（`getComputedStyle().rowGap` 空串）被当 0 缓存」——后台早到/恢复路径下该角色行表行距缓存成 0，挂载后退回旧错口径；修法＝仅 `isConnected` 时读、命中才缓存，另增调试字段。新指纹 renderer `47703d0b…`（取代 `402e49a7`）；styles／index／tool-rows／ui-labels 与夹具实测未变。本角色按惯例做受影响项复核：重跑只读夹具**两遍**——report.json 与第一版/PM 证据**逐字节一致**（两档三状态全量 rect 与计算样式一行未变）、十图 9 张逐字节一致；`B960-role` 唯一差异为 1 个抗锯齿像素（(798,17) 标题栏角标缘，1/255 级、两次重跑同值），放大比对无可见形变。视觉零变化成立；设计值、四项裁定不受影响；R1–R5 与阅读保持无回退（本修复即加固恢复路径记账；属主 uiux-v2 82 两次一致、探针零漂移；测试角色第二版独立复测进行中）。**设计面结论维持通过**，见[复核记录补签节](docs/design/2026-10-14_design_uiux-final-acceptance.md)。U1 偶发定性为既有、非本修复引入。未改 `app/`、`test/`、其他角色资料；未 commit/push。

## 2026-10-14 — 引擎选择器单一推荐方案 v1

客户要求产品/UIUX重新设计下拉；提交[设计规范](docs/design/2026-10-14_design_engine-selector.md)和[交互HTML](docs/design/2026-10-14_design_engine-selector-prototype.html)：浅色应用内三项、当前勾与临时高亮分离、完整基本键盘操作、未导入禁用、缺配可选与对应既有设置入口。仅复用现tokens，维持原业务。实际IAB检查1360/960画布、键盘/外击/禁用/设置演示，六PNG位于同design目录证据子目录；屏读/生产/真实服务未测，生产代码未改。同步本角色导航和memo；无新增业务选装，待PM评审与实施授权。

## 2026-10-15 — 从真实完整走查到可点击流程v1

交付[完整流规范](docs/design/2026-10-15_design_desktop-complete-flow.md)与[HTML](docs/design/2026-10-15_design_desktop-complete-flow-prototype.html)，覆盖导入/缺配/开启/聊天、su正式派发、普通选择与权限模拟、运行/排队/停止待收尾、报告阅读/失败。本人串行独占真实Electron完成13图与操作证据，分清本人/产品/root和未覆盖；HTML另用独立IAB实际点通两档与焦点/草稿/失败恢复。七项对应产品P1–P7；沿原视觉不加管理页，不扩权限。新增读取与有界诊断/typed持久来源前置已据四属主只读评估明示。同步本角色导航/memo/职责/交付约定，等待产品与PM两轮收束，正式app/src/test/配置未改，生产测试未跑，未部署。

### 同日第二轮限定修订为v2

产品实操及PM/root反馈指出的原型差异均在本轮修复：建议不覆盖非空草稿、保存不重置已有会话、停止保详情展开/位置、无默认不代选、pending按kind及各角色保存视图。状态文字改报告声明而非验收；新增31/32/33复测JSON及最终两档PNG。无新增业务功能、无第三轮、无生产改动；交同v2复核。

## 2026-10-15 — 三接口阶段两项UX差异短评

仅新增[短评](docs/design/2026-10-15_design_complete-flow-interface-ux-review.md)，接受P3“查看来源角色文档→可信refs显选→只读阅读”及C2“重试保存报告/历史”两类只补存状态；给出分因错误、原invoker回焦、同卡单在途及query无副作用口径。明确客户原v2确认不包含这些具体差异，source首次saved可继续原一次回交而不是重跑；未操作桌面、未测不存在API、未改冻结原型/规范与生产。同步自有导航和memo。


## 2026-10-15 — 统一页面布局与视觉层级设计首版

按客户明确授权，交[新方案](docs/design/2026-10-15_design_visual-convergence.md)与独立单文件HTML，首次208/176导航、18/21/15/13/11字阶、32px控件与按需抽屉，报告声明/事实/原文摘录保真、失败截断首层可见。亲自真实桌面只读观察3图与IAB首轮点验，root首读两项问题已修；待产品独立第二轮/PM评审。未改正式应用、旧原型或冻结13件。

2026-10-15 视觉收敛第二轮：V2 dcc614d0…已修普通聊天概览假报告、清单返回资料链、完整summary可达与reading重绘展开；自身IAB实测三档，原型不代产品亲测。规范含逐项回应，待root/PM具体版复核。

2026-10-15 本轮视觉设计V2收口：HTML e95b363d…，root正常IAB已完成分版实际检查（dcc主修/e95状态窄修与最终三档），产品静态最终推荐；本角色不代签产品原型亲测。自身新manifest绑定最终规范、原型和root canonical。正式应用未实施，等待客户确认。

2026-10-15 客户已授权视觉V2实施，新增[落地独立评审](docs/design/2026-10-15_design_visual-v2-implementation-review.md)。仅自身新文档/证据写权；accepted视觉规范/原型与r2冻结不改。当前首轮只读准备、待稳定候选与root串行GUI，未签通过。

2026-10-15 V2正式落地严格UIUX范围通过：renderer5324b786/stylesdf554f87/index7beda，SV1–SV13及真实batch/资料阅读差距均关闭。依据本角色源码/看图与root真实native截图/AX，未冒签亲操作；accepted原件不变，详见[最终评审](docs/design/2026-10-15_design_visual-v2-implementation-review.md)。无新增设计项或明确待修阻点。

## 2026-10-16 — 视觉收敛 v3 审计与提案（聊天松散度 + 运行/思考状态反馈）

客户「界面还是有点乱」、PM 追加「聊天那块感觉太松散」（第一焦点）与「正在思考，没有动画 / 运行中的图标太丑了」。本轮**只审计+提案**：未实施、未测试、未部署，未改 app/src/test，未提交 git。

方法：临时目录自建只读夹具（`/tmp/ans-uiux-v3/ext/audit-v3.mjs`、`indicators5.mjs`，未改仓库 test/ 任何文件）驱动真实 `app/renderer`+`preload.cjs`（受控 IPC、无模型/网络/真实项目），另有界既有 `uiux-v2.mjs` G2/视觉/完整流三模式与 `uiux-design-audit.mjs` 只读运行；产出 38 件证据（截图+度量 JSON+manifest，含 renderer SHA-256、Electron 44.7.0、HEAD `1c8a489`），入 `docs/design/2026-10-16-visual-convergence-v3-evidence/`。非 CUA 亲操作；「after」为夹具内 CSS/DOM 示意。

实况要点（逐值证据在[提案](docs/design/2026-10-16_design_visual-convergence-v3.md)）：行距一律 24px（12/12 实测）、正文 15/27、输入区 165.6px（空框 40px）、1360×860 聊天视口 586px（边框组件占 274px=32%）、同转录完整可见 7 行；工具一次调用=2 行×53.1px；未决状态四处重复（侧栏/尾行/chip/工作概览）；系统行 chip 与正文重复 `[系统·X]` 前缀、chip 脱离阅读列（x240 vs 384）；忙碌呈现全静态（◐ 10px 无动画），全应用唯一动画=开会话 `.spinner` 0.8s。提案：快速赢 W1–W11（16px 行距、10px 段距、输入区 ≤137.6、工具行 ≤47.1、12px SVG 弧线转轮统一三处等，汇总效果 转录 945→823px、可见行 7→9）；结构级 S1–S4（工具调用相位合并、chip 对齐、尾行去重、摘要口径）；reduced-motion 经 CDP 实测 1e-06s 静止弧。需客户逐项勾选（含 v2 基线间距收紧属基线修订）。等 PM 评审后由桌面UI 实施。

## 2026-10-17 — 企业级稳定感设计提案（A 轻量加固 / B 企业化重构）

客户反馈「现在这个页面感觉太轻飘飘的感觉，不稳定的感觉」「没有企业那种稳定的感觉」。本轮仅设计提案与 HTML 原型：**未实施、未测试、未部署**；未改 `app/`、`src/`、`test/`、其他角色或客户项目；未读 `.env`、未跑凭据/网络命令、未 git 提交。

只读实测（1362×862，现实现样式与三张真机截图）：左栏 208px、中栏 1154px；正文 `.chat-pane` 800px 居中（左右各约 177px）；输入区 `.composer` 通栏 1154（内部胶囊/脚注 800 居中，**胶囊与正文已对齐**；问题是通栏容器无边界、无贴底信号）；左/中无 1px 分隔、输入区无上边线、全局无阴影；body 纯白、左栏 `rgb(238,241,235)`；基础 13px、消息 15/27。判断“轻/散/不稳”来自框、网格、贴底与对比缺失，不是字号单点。

交付[设计说明](docs/design/2026-10-17_design_enterprise-stability.md)与[单文件原型](docs/design/2026-10-17_design_enterprise-stability-prototype.html)：

- **方案 A 轻量加固（推荐）**：保留 IA；左/中分隔、标题栏与输入区边线、输入区实底贴底；内容列 800→**900**，会话头/消息/输入/脚注同列；border `#d7ddd4`、control `#8a968b`(3.08:1)、text-3 `#6a756e`(4.8:1)、radius 8/6、极轻阴影；分 A1 结构 / A2 重量 / A3 密度三步、可单独回滚。
- **方案 B 企业化重构（本轮不推荐）**：44px 应用顶栏 + 28px 底部状态栏 + 卡片化消息/表格；净高 +56px、IA 与回归面更大，建议 A 验收后单独提案。
- **实现要点**：现有 `.chat` 右内边距 22px（=32−10）+ 10px 滚动条，使内容盒左右各 32；会话头/输入区左右对称 32，因此胶囊与正文**本来就对齐**。改列宽时保留 `padding-right: calc(32px - var(--scrollbar-w))`（窄档 `calc(24px - var(--scrollbar-w))`），**不要**给会话头/输入区额外加滚动条宽度，否则会反向错位。“输入区与正文不对齐”指通栏容器无边界，不是胶囊错位。

原型检查（Playwright 本地静态服务，宿主 1500×1000，画布 1362×862 / 1280×800 / 1440×900 / 960×620）：A 四档 `.head-inner`/`.pane`/`.capsule`/`.compose-note` 左缘差 **0.0px**；滚动前后会话头/输入区 **0 位移**；宽表 1200px 仅容器内滚、页面无横向溢出；输入增高 138.6→161.6、消息列宽 900 不变；确认卡初始禁用、选择后启用；对比度 14.35/6.39/4.79/6.99/6.21/3.08；reduced-motion 0.001s/1。B 消息视口 531.4 vs A 587.4（-56px）。未验证真实 Electron、真实数据/虚拟窗口、屏读、键盘完整链、640–959 与性能。待客户 D1–D8；正式实施需 PM 审核并交桌面UI，设计稿不构成授权。

## 2026-10-21 — UI 平台化 Phase 0：Nova × 深色石墨规范与静态原型

客户已确认「UI 平台化」方向，PM 评审批准 Phase 0 设计工作。本轮交付[设计规范](docs/design/2026-10-21_design_ui-platform-nova.md)与[单文件静态原型](docs/design/2026-10-21_design_ui-platform-nova-prototype.html)，检查证据在[同目录](docs/design/2026-10-21-nova-prototype-evidence/)。**未实施、未测试、未部署**；未改 `app/`、`src/`、`test/`、其他角色资料或历史设计文档；未 commit。

规范内容：①目标与不可变基线（深色石墨、整页等宽、13px、15/27、900 列、8/6 圆角、极轻浮层阴影、fail-closed、颜色不单独传意）；②shadcn 令牌映射（`--primary`←`--success #6FA08B`、`--primary-foreground`←`--bg #14171A`、`--input`←`--border-control #6B757E`、`--ring`←`--focus-ring #6FA08B`、`--card`←`--bg-soft #1E2328`、`--warning` 自定义 `#C4A15F`；含 16 组对比度与来源）；③Nova 紧凑密度 2/4/6/8/12/16/24、组件高度 24/28/32/36、8/6/4 圆角、图标 12–20px/1.5–1.75；④等宽字阶；⑤组件白名单（Button/Input/Textarea/AlertDialog/Sheet/DropdownMenu/Checkbox/Badge/Resizable/ScrollArea 等）与继续自绘清单（标题栏、聊天虚拟行、卡片族）；⑥状态矩阵与键盘/默认焦点；⑦动效（Motion 唯一、聊天热路径零动效、等待/恢复卡零忙碌动效）；⑧Lucide 唯一；⑨One-shot 五事实源/白名单/页面 DoD/禁止模式；⑩关键屏说明；⑪Q1–Q15 待验证。

原型覆盖 1360×860 与 960×620 两档，自绘标题栏、左栏可拖宽/收起、会话头、聊天空态、2 条消息 + 1 个工具行、输入区（双开关/一次性提示）、右抽屉打开、shell 确认卡（拒绝默认焦点）。headless Chrome 自检：内容列 900/664、四要素左缘差 0.0px、抽屉 424、shell 卡 640 且 `activeElement=sc-deny`、左栏收起 0/拖宽 320、无页面横向溢出、16 组对比度全过（正文 16.32:1、次级 7.96:1、三级 5.64:1、控件边界 3.37:1）；`audit-1360.json`/`audit-960.json` 均 `ok=true`。局限：非真实 Electron、未测 IME/虚拟窗口/屏读/性能/Windows/CSP/Motion；原型内联 SVG 与 CSS 动效仅为示意，生产用 Lucide + Motion。观感门与实施范围由客户/PM 确认；本记录不构成实施授权。

## 2026-10-21 — Phase 2 React 骨架设计对齐评审（needs-work）

桌面UI 已完成新渲染器骨架（`app/renderer/src/`，未替换旧入口），两档截图与真实 Electron `file://` 冒烟全绿。本角色只读评审实现、截图与冒烟报告，输出[评审记录](docs/design/2026-10-21_design_ui-platform-phase2-review.md)。**未改 app 代码**；评审记录不是产品验收或实施授权。

结论 **needs-work**。3 项 Phase 3 前必须：① `@custom-variant dark` 以 `.dark` 为祖先，但 `<html>` 无 `.dark`，所有 `dark:` 工具类不命中；确认卡「放行执行」outline 按钮边框回退到 `--border #2C3238`（对背景 1.39:1），规范要求 `--input #6B757E`（3.83:1）。② Button/Input/Textarea/Checkbox/菜单项焦点环仍为 `ring-3 ring-ring/50`（3px/50%、无 offset），未收敛到 2px solid `--ring` + 3px offset；确认卡默认拒绝焦点（2px/3px）已正确。③ primary hover 用 `bg-primary/80`（变暗），规范为 `--success-hover #7FB29B`（提亮）；active 未用 `--primary-active`。另 1 项 Phase 3/4 前必须的契约决定：引擎触发器用 DropdownMenu radio（`aria-haspopup=menu`），旧契约是 combobox/listbox/option；须恢复语义或经 PM/测试批准契约变更并同步 e2e。

可随 Phase 3/4 处理：960 `#composer-scope` 120 vs 124px 截断（只缺「· 演示」后缀，角色/引擎仍可见）、审批 Checkbox 选中色 primary（启用双开关前改 warning）、Input/Textarea 深色底、确认卡退场/菜单入场 Motion、图标 13px/描边档、ScrollArea thumb、Button 14→13 与 disabled 50→45、树 roving tabindex、Phase 3 空态文案、Phase 5 演示标记移除与最终 dist 入口路径。`--border-strong #3A4148` 为规范漏列，已补入 §2.3；§2.5 新增「深色变体必须生效」「组件库默认环不算规范环」两条规则。同步 feature-map/memo；未改实现、其他角色资料或历史文档；未提交。

## 2026-10-21 — Phase 2b 修正复核（设计对齐 pass）

桌面UI 按 Phase 2 needs-work 完成 Phase 2b 修正；本角色只读实现、[Phase 2b 证据](../桌面UI/docs/change/2026-10-21-phase2b-evidence/)（1360/960 的 default/engine-menu/confirm-allow 截图、`electron-smoke/report.json` 49 项、`cdp-styles.json`）与 CDP 抽查，结论 **pass**。Phase 2 评审的 3 项 Phase 3 前必须与 1 项 Phase 3/4 前契约决定均已关闭；49/49 Electron 冒烟全 true、零 console/did-fail-load/CSP。

实测：`<html class="dark">`；`#sc-allow` 边框 `rgb(107,117,126)` = `--input #6B757E`（对背景 3.83:1），不再是 `--border`（1.39:1）；焦点环 2px/3px solid `rgb(111,160,139)`（Button/Input/Textarea/Checkbox/Switch/DropdownMenu 项统一；Composer Textarea 按规范用胶囊 focus-within）；确认卡默认焦点仍 `sc-deny`；primary hover `rgb(127,178,155)` #7FB29B、active `rgb(94,143,122)` #5E8F7A；Checkbox 选中 `rgb(196,161,95)` warning；`#btn-send` 禁用中性底（#252A30 / #A7ADB5）；960 `#composer-scope` 隐藏「· 演示」后缀后 `scopeFits=true`、pane 664、无横向溢出；自绘 `EngineSelect` 恢复 `role=combobox`/`aria-haspopup=listbox`/`aria-controls`/`aria-expanded`/`aria-activedescendant` + `role=listbox`/`role=option`/`aria-selected`，键盘浏览/选择/Esc/焦点返回通过；CDP 补测 Home→Pi、End→Claude、Space 选中 Pi 并回触发器；菜单 180、触发器 104×32，1360/960 截图未见退化。`src` 零裸色值、零手绘 SVG、Motion 仅 Drawer/ConfirmCard/Sidebar 转轮、无 `transition-all`/`@keyframes`。

剩余项不阻塞 pass：树 roving tabindex（Phase 3）、确认卡退场/菜单入场 Motion（若观感门要求）、空态文案/演示标记/最终 dist 入口（Phase 3/5）、EngineSelect 台账记账行（UIUX 已补入规范 §5.1 自绘清单）、预存在 Switch/披露箭头 transform、未使用 DropdownMenu 14px。评审记录已追加「Phase 2b 复核」小节；同步 feature-map/memo；未改实现、其他角色资料或历史文档；未提交。

## 2026-10-21 — Phase 3A 聊天流核心设计对齐评审（needs-work）

桌面UI 交付新渲染器的真实 listing/会话/历史/虚拟窗口/工具行/状态/operator 卡/IME 最小发送；本角色只读实现、[Phase 3A 证据](../桌面UI/docs/change/2026-10-21-phase3a-evidence/)（Electron 冒烟 16/16、`electron-phase3a.png`、ime 24/24、bench、uiux-v2 新入口报告）与旧基线 `styles.css`，输出[评审记录](docs/design/2026-10-21_design_ui-platform-phase3a-review.md)。**未改 app 代码**；结论 **needs-work**。

已通过：15/27 正文、900 内容列、16px 行距（smoke `ROW_GAP_16`）；虚拟窗口 225 行/61 挂载/2 spacer、滚到顶；operator 锚点 index 226 在 tool 后；状态优先级等待确认 > 工作中 > 错误（四组 smoke 全 true）；Markdown XSS `MARKDOWN_SAFE`；IME 24/24；bench 跑通（scroll 13.4ms < 旧 16.3）；聊天热路径零动画，Motion 仅在 Sidebar 工作转轮/Drawer/ConfirmCard；`src` 零裸色值/零手绘 SVG。

**7 项 Phase 3B 前必须**：① Markdown 标题/列表/引用/表格样式缺失（标题会落浏览器默认大字号，表格缺表头实底/完整外框，p margin 8 vs 旧 10）；② `.is-replay` 无 CSS（旧 .88）与 `.msg-handback.is-blocked` 无危险左边线；③ 工具行 42px 时间列空、`timed-out` 无语义色、折叠组摘要不显示失败/未放行、无展开 chevron；④ operator choice 选项无 min-height/padding/hover/accent（旧 56px），中性动作边框 `--border-strong`(1.74) 非 `--input`(3.37)；⑤ `keepEl` 已标记但 VirtualPane 未消费，operator 选项/handback/工具组 details 离屏丢状态；⑥ 空态 `#btn-start-primary` 用旧 `.btn/.btn-primary` 类而新 CSS 无定义；⑦ `sys-config` 打开/历史恢复失败行无 danger 色。可随 Phase 4：`tool-current`/loading 转轮、终局失败色、树方向键即开会话的语义、回交标题/事实、operator 卡物理密度、`status.ts` glyph 未渲染、附件缩略图、uiux-v2 其余等价。uiux-v2 首个失败「routine collapsed; failure direct; assistant untouched」与失败直呈同源，已知在修。同步 feature-map/memo；未改实现、其他角色资料或历史文档；未提交。

## 2026-10-21 — Phase 3A2 修正复核（设计对齐 pass）

桌面UI 按 Phase 3A needs-work 修正 7 项；本角色只读实现、[3A2 证据](../桌面UI/docs/change/2026-10-21-phase3a2-evidence/)（`chat-1360/960.png`、`choice-1360/960.png`、`electron-smoke/report.json` 12 组行为断言、ime/bench/uiux-v2 报告）与旧基线，结论 **pass**。7 项全部关闭；12 组行为断言符合预期，零 console/did-fail；ime 24/24、新纯逻辑 18/18、旧基线 679/679、bench 跑通。

实测：Markdown h1/h2 15、h3 14、margin 16/6、ul 4/18/20、blockquote 2px `--border-strong`、p 10、table outline/th `--card`/cell 6×10；`.is-replay` opacity .88、blocked 左 3px `rgb(201,122,109)`；工具时间 18:00、timed-out/异常摘要 danger、折叠摘要「本轮 1 个调用：run_shell · 含 1 条失败」、records/denied/`.tool-call-record` chevron；choice 选项 40px、选中 `--selected`、accent `--foreground`、取消边 `--input`；离屏重挂 group/reason/handback/selected/checked 全保持（operatorIndex -1 → 重挂 true）；CTA shadcn Button 32/13 primary；`sys-config` danger。另：选中角色副标题去重（`#chat-role-sub` hidden）、输入区写入语义恢复旧文案；`src` 零裸色值/SVG，Motion 仅 Drawer/Sidebar 转轮/ConfirmCard，无 transition-all/keyframes。

剩余不阻塞：三处 disclosure chevron 为 CSS `\203A` 字形 + 0.12s transform（旧基线同款；非 Lucide/热路径微过渡，建议改 Lucide ChevronRight+瞬时或规范登记例外）、table 12.5/1.5 vs 旧 13/20、tool-current/loading 转轮、终局失败色、树方向键语义、operator 确认卡密度、status glyph 清理、uiux-v2 第 9 项/toolfold 第 13 项（3B/4/5）。评审记录已追加「3A2 复核」；同步 feature-map/memo；未改实现、其他角色资料或历史文档；未提交。

## 2026-10-21 — Phase 3B 卡族与输入区设计对齐评审（needs-work）

桌面UI 交付真实 shell/su/恢复确认卡、judge 双开关/结果行、发送/停止/附件/队列/system 完整接线。本角色只读实现、[Phase 3B 证据](../桌面UI/docs/change/2026-10-21-phase3b-evidence/)（39 项 Electron 冒烟、14 张 1360/960 截图、build/bench/ime/uiux-v2）与旧基线 `styles.css`，输出[评审记录](docs/design/2026-10-21_design_ui-platform-phase3b-review.md)。**未改 app 代码**；结论 **needs-work**。

通过：shell 逐字/拒绝默认焦点/Esc deny/仅显式 allow/settled/expiry 收卡；su 档位与命中原因内容；恢复卡逐字/取消焦点/仅执行 allow/expired 定格/通道异常 fail-closed；judge 双开关主进程权威、一次性警告、ack 不重现、single 禁用、结果行锚定/manual judgeNotice；发送 ack/失败恢复草稿/queued 位次；停止三态；队列位次/来源/撤回就地回执；system 注入（看护/收束）；TitleBar 演示角标移除；表格 13px；C1 36px；`--backdrop-strong`；零裸色/SVG；热路径零动画。39/39 冒烟、33/33 新单测、679/679 旧基线、IME 24/24、lazy 10/10、bench 重基线、C1 旧 32→新 16。

**5 项 Phase 4 前必须**：① SU 审批 `is-su-approval` 无 CSS——档位摘要未 600、绕过写边界 warning 仍 `--text-3` 灰（旧基线 amber/600；截图可证）；② shell `#sc-details > summary` 无 Lucide ChevronRight 且 marker 被隐藏——无展开指示（recovery/tool/judge 均有）；③ `.capsule.is-dropping` 无 CSS，拖入无落点反馈（旧基线有 border/bg 变化）；④ `.queue-withdraw` 20px/10.5px 低于 xs 24（旧 28）；⑤ `.attach-chip` 圆角 10（规范 8）、`.attach-rm` 999 圆形可登记例外。可随 Phase 4/5：卡族入退场 Motion、`jw-strong` 字重、缩略图 `onError` 兜底（1360 附件截图的 broken image 是夹具 4 字节 PNG）、attach-rm 18/X 11、发送失败 system 行 danger、原生 checkbox 13 vs 14、`sc-details-trigger` 死 CSS、tool-current/loading 转轮、uiux-v2 默认段第 10/SEND_FACTS/QUEUE_VIEW 余项、main.mjs/uiux-design-audit/打包（Phase 5）。同步 feature-map/memo；未改实现、其他角色资料或历史文档；未提交。

## 2026-10-21 — Phase 3B 修正复核（设计对齐 pass）

桌面UI 按 3B needs-work 修正 5 项；本角色只读实现、[同一 3B 证据目录](../桌面UI/docs/change/2026-10-21-phase3b-evidence/electron-smoke/)（45 项冒烟、18 张 1360/960 截图）与旧基线，结论 **pass**。5 项全部关闭；45/45 冒烟 `ok=true`、`failures=[]`、零 console/CSP。

实测：SU `.sc-overlay.is-su-approval .sc-summary` 600、`.sc-su-warning` = `--warning`、默认提示仍 `--text-3`；shell `#sc-details > summary` 加 Lucide ChevronRight（瞬时旋转、无 `::before`），`1360-shell-details-open` 展开可见 cwd/argv/raw note；`.capsule.is-dropping` border `--text-3`/bg `--hover`，离开清除，`1360-drop-state` 可见；`.queue-withdraw` 28px/11px/`--input`/radius 6，就地回执保留；`.attach-chip` 8px、`.attach-rm` 4px、X 12/1.5，夹具改为完整 1×1 PNG 后三张缩略图正常。`src` 零裸色/SVG，Motion 仅 Drawer/Sidebar 转轮，无 transition-all/keyframes。

剩余不阻塞：attach-rm 18 命中区、`sc-details-trigger` 死 CSS、卡族入退场 Motion、`jw-strong` 字重、发送失败 system 行 danger、原生 checkbox 13 vs 14、tool-current/loading 转轮、uiux-v2 默认段第 10/SEND_FACTS/QUEUE_VIEW 余项（Phase 4/5）。评审记录追加「3B 修正复核」；同步 feature-map/memo；未改实现、其他角色资料或历史文档；未提交。

## 2026-10-21 — Phase 4A 设计附录（引擎/设置/角色资料/工作概览/队列）

客户授权 Phase 4 后先做 4A 设计确认。本角色只读旧渲染器（`renderer.js`/`engine-selector.js`/`runtime-ui.js`/`styles.css`）、主进程 `runtime-settings.ts` 与 2026-10-14 运行时设置/角色抽屉/工作概览证据，产出[设计附录](docs/design/2026-10-21_design_ui-platform-phase4a-design.md)、[静态原型](docs/design/2026-10-21_design_ui-platform-phase4a-prototype.html)与[检查证据](docs/design/2026-10-21-phase4a-prototype-evidence/)。**未改 app/ 代码**，未提交。

覆盖：**① 引擎选择器真实状态**——默认 Claude/已保存显式优先；三引擎已配置/缺配置/配置未知/检查中；缺项条 + 「打开 X 设置」；切换中 12px 转轮与 aria-busy；每引擎独立视图/草稿/待办；迟到结果按 projectRoot/runtime/roleId 匹配，不覆盖当前视图。**② 三引擎设置**——424 抽屉 + 引擎 Tabs（只切配置视图，不切会话）；字段全部来自 `getRuntimeConfig` metadata；Pi 3 必填 + 推理选择 + 高级上下文窗口/看护时限两滑块，Codex 2 必填 + 可选，Claude 1 必填 + 可选；机密不预填、显示仅本次输入；保存 loading/ready/saving/saved-complete/saved-missing/save-error/read-error/no-project 矩阵；固定 64 保存条；缺项/读取失败 Alert；application 文案逐字。**③ 角色资料**——角色头、资料四 Collapsible、待办/队列预览、文档列表/只读阅读子视图、空态/焦点返回。**④ 工作概览**——待处理/当前工作/排队/最近回交，定位/全文/撤回/查看全部队列；建议角标拆分：工作概览=待确认/待选择，角色资料=当前+排队（旧合并口径可回退）。**⑤ 队列抽屉**——工作概览/角色资料的子视图，位次/来源/时间/摘要/全文，仅客户消息且未投递可撤回，就地回执，960 单列。**⑥ 组件/令牌/状态/焦点/动效**——复用白名单；**新增 Slider**（shadcn/base-nova copy-in，Base UI 现有 slider，无新依赖；仅 Pi 两个 7 档 range 字段；轨道 4/thumb 14/output 11；值不在 choices 回退 Input + amber）；2px/3px ring；抽屉 160/菜单 120；聊天热路径零动画。**⑦ 旧界面边界**——逐字文案表；不新造能力（设置不切会话、引擎不改配置、不自动验证凭据、不猜文档、不合并待办/队列、不造报告等）。

4A 必须项：真实引擎状态/缺项条/每引擎隔离；三引擎设置；角色资料/文档；工作概览/队列/角标；组件令牌焦点动效 + Slider；旧文案/语义。可随 4B：配置状态预取/缓存、长队列虚拟化/回交分页、字段级错误、200% 文字/极矮窗、driver/e2e/守卫/组件台账、Phase 4B 治理卡、Phase 5 打包。开放问题 10 条见 §9.3。

原型自检（headless Chrome，1360×860/960×620）：抽屉 424、抽屉头 64、Tab/Input 32、保存条 64、队列撤回 28、无横向溢出（scrollWidth=innerWidth）；对比度 foreground/background 16.32、text-2/background 7.96、warning/warning-bg 6.59、input/card 3.37、ring/card 5.34 全过；设置缺配/已保存/失败、工作/角色/队列场景均渲染，零 console 异常；`audit-*.json` `ok:true`。限制：原型为演示数据，未接 Electron/IPC/真实 `.env`、屏读、键盘全链路、200% 文字/缩放；图标为内联 SVG 示意，动效未在原型运行。

同步 feature-map/memo；未改 app/src/test、其他角色资料或历史设计文档；未提交。

## 2026-10-21 — PM §十二 对 Phase 4A 的裁定回填

PM 对 4A 设计作出 10 项裁定，本角色回填[设计附录](docs/design/2026-10-21_design_ui-platform-phase4a-design.md)（revision 3，新增 §十「PM §十二 回填」）并同步 memo/feature-map。**未改 app/ 代码，未提交。**

回填要点：**①** QUEUE_VIEW/operator 排队聚合属 4B，4A 只做抽屉队列；**②** 批准 Slider，新增 shadcn/base-nova copy-in `app/renderer/src/components/ui/slider.tsx`（Base UI Slider，无新依赖），仅 Pi 两个 7 档 range，登记组件台账/状态矩阵；**③** 角标拆分按设计执行（工作=待确认/待选择，角色=当前+排队），设置入口只留左栏底部 + 缺配「打开 X 设置」上下文入口，三引擎 Tabs 属 4A；**④** 配置读取不在导入/恢复时预取三引擎，菜单打开/切换/设置打开/保存成功后按需读取并缓存（菜单打开可并行读三引擎一次），完整预取/缓存优化留 4B；**⑤** 固定 64px 保存条按设计，但须真实 Electron 1360/960（可含 200%）验证，不可用则 4A 内回退流末保存并复核；**⑥** 跨引擎草稿按 runtime×role 内存保留，成功发送/显式移除/切项目才清，不持久化；**⑦** 队列子视图按设计，`#right-queue-body` 唯一，长队列虚拟化留 4B；**⑧** 960 必须真实 Electron 复测（截图、无横向溢出、焦点/Esc/inert、可行时 200%），不可读则 4A 内调整并复核；**⑨** 切换中菜单关闭、aria-busy、不重复提交，失败保留新视图+错误、不自动回退；**⑩** 工作概览「最近回交」4A 只呈现聊天流 handback 行，完整报告/persistence 留 4B。

文档同步修改：§1.1 配置摘要/跨引擎草稿，§1.2 按需读取与 4B 预取边界，§1.3 切换失败不回退，§2.2 固定保存条真机验收，§4.1 角标按裁定，§4.2 最近回交只读 handback 行，§5.1 `#right-queue-body` 唯一与 4B 队列边界，§5.2 960 真机验收，§6.1 Slider 文件/台账，§7.3 改为「PM §十二 已裁定」并增设置入口，§8 增加真机验收边界，§9.1/9.2 更新 4A 必须与 4B 延期，§9.3 标注原开放问题已关闭，新增 §十 10 项裁定表。feature-map 状态更新为 revision 3。

静态原型未改（SHA-256 `a74ded56f1bd91ab46aa75d3884c646ceae41086d30613ae477ef654eede40ad`），仍为演示数据；固定保存条/960 真机验收、屏读、键盘全链路与 200% 文字/缩放未做，故 4A 实施验收仍需真实 Electron 证据。

## 2026-10-21 — Phase 4A 实现设计对齐评审（needs-work）

桌面UI 交付 Phase 4A 真实引擎切换、每引擎视图/草稿、三引擎设置、角色资料/文档、工作概览与队列。本角色只读 [变更记录](../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4a-engine-settings-drawers.md)、[证据](../桌面UI/docs/change/2026-10-21-phase4a-evidence/)（`phase4a-smoke` 70/70、20 张 1360/960 截图、bench/gates/uiux-v2/adjacent）、实现源码、[4A 设计（revision 3）](docs/design/2026-10-21_design_ui-platform-phase4a-design.md)、契约面与组件台账，输出[评审记录](docs/design/2026-10-21_design_ui-platform-phase4a-review.md)。**未改 app 代码**；结论 **needs-work**。

**已通过**：默认 Claude/显式优先、真实切换/不停止后台/每引擎视图与草稿/迟到旧结果不覆盖；metadata 三引擎字段、Pi 3 必填 + 推理 + 高级 Slider（7 档、aria/←→/Home/End、hidden 规范值、非预设 amber 回退）、机密掩码/显示、保存 loading/saved/missing/error/晚到、缺配 Alert/入口；资料四节/内外滚动/文档 opaque 只读/错误重试/焦点返回/迟到失效；工作概览真实待处理/当前/排队/最近回交、角标拆分、唯一 `#right-queue-body`；队列位次/来源/时间/摘要/全文/仅客户消息撤回/失败焦点/960 无横溢；左树 `.ti-count` 唯一数字、状态只表达状态、队列深度 title/aria；失效 operator 卡动作 hidden/原因可见/容器/aria 保留；零裸色/零第二套库、Slider 台账、热路径无新增动画。

**6 项 4B 前必须**：①队列全量内联在「工作概览」，`1360/960-queue.png` 无「A · 队列」标题/返回，`QUEUE_RENDER_LIMIT=50` 且「查看更多」仅 >50（设计 §4.2 为 >3）——需实现 §5.1 子视图，或由 PM/设计书面接受内联并改契约；②`drawer-store.ts:540-554` 成功撤回删除 feedback、失败无 system 行，设计 §5.2 要求成功「已撤回排队消息：…」/失败另落 system 行；③`SettingsPanel.tsx:359-383` Tabs 仅 Tab/Enter，无 ←/→/Home/End、roving tabindex/aria-controls，设计 §6.4 未达；④`.pi-status` `white-space:nowrap` + ellipsis，`1360-settings-saved.png` 截断「必填配置已齐备/下一次输入应用」，需 64px 内两行/短句并复核 1360/960/200%；⑤`ProfilePanel.tsx:197` 仍 `statusBadge(status, queue.length)`，`960-profile.png` 显示「等待你确认 · 2 待办」，与 PM §十三单计数/设计 §3.2 不符，应改为状态-only；⑥960 仅有截图/无横向溢出，焦点/Esc/inert 与 200% 无独立断言（PM §12.3 #8），需补 960 实际 Electron 证据，200% 不可测须记录并由 PM 接受。

**可随 4B/5**：菜单项配置状态文字（设计 §1.4，变更记录 §5.4 归 4B）、当前引擎点语义（绿点当前引擎 vs 状态点）、当前工作行缺「进行中」、队列时间含秒、资料待办预览无定位、抽屉关闭按钮文字 `×`、设置关闭后未保存字段草稿仍保留、Slider 视觉截图未显示 thumb/output、虚拟行定位/judge 跨引擎重放/完整报告/persistence/长队列虚拟化/C2 重锚。所有 4B/5 项不阻塞 4A 门，但 4B 应兑现设计承诺。

同步 feature-map/memo；未改 app/src/test、其他角色或历史设计文档；未重跑测试、未提交。

## 2026-10-21 — Phase 4A M1–M6 修正复核（设计对齐 pass）

桌面UI 已完成 4A 评审的 M1–M6 修正。本角色只读新 [phase4a-smoke 证据](../桌面UI/docs/change/2026-10-21-phase4a-evidence/phase4a-smoke/)（**99/99**、28 张 1360/960/200% 截图、零 console/CSP）、实现与截图，更新[评审记录](docs/design/2026-10-21_design_ui-platform-phase4a-review.md)至 revision 2，追加「4A M1–M6 复核」。**结论：pass**；未改 app/、未重跑测试、未提交。

逐项：**M1** `QueueSubview` 标题「A · 队列」、返回「工作概览」/「角色资料」、Esc 先返回来源、焦点回「查看全部队列」、`#right-queue-body` 唯一（body=1）、工作概览 >3 显示「查看全部队列（4）」、960 单列可读；**M2** 成功 system 行「已撤回排队消息：客户排队消息」，失败/异常内联+system 行，不乐观移除，撤回中禁用/焦点保留；**M3** Tabs `onKeyDown` ←/→ 循环、Home/End、roving tabindex、`aria-controls`/`tabpanel`；**M4** 64px 保存条两行完整状态（含必填齐备/缺项、应用时点），title 全文，1360/960/200% 不截断（`scrollHeight=clientHeight=28`）；**M5** `ProfilePanel` `statusBadge(status,0)`，960-profile 角色头仅「等待你确认」；**M6** 960 焦点进入/背景 inert/Tab 留抽屉/关闭回焦点、设置/资料/队列 Esc 返回、无横溢；200% 设置/资料无横溢且保存条完整；Slider thumb/output 960 可见。

复核后剩余（不阻塞 4A）：菜单项配置状态文字仍留 4B（设计 §1.4/变更记录 §5.4）；当前引擎绿点仍是 current-engine 标记而非状态色；当前工作行缺「进行中」、队列时间含秒；资料待办预览无「定位」；Drawer 关闭按钮仍是文字 `×`；关闭设置抽屉保留未保存字段草稿（设计 §2.3 说丢弃，当前更保守）；保存条字号 10.5 vs 设计 11.5；长队列虚拟化/虚拟行 locator/judge 跨引擎重放/完整报告/persistence/C2 重锚按 4B/5。M1–M6 已关闭，4A 门可按 PM 口径关闭。

同步 feature-map/memo/changelog；未改 app/src/test、其他角色或历史设计文档。

## 2026-10-21 — Phase 4B 设计确认（治理三权/镜像/记录/报告）

按 PM §十四 4B 授权，本角色只读旧渲染器/`ui-labels.js`、旧报告/投递证据、4A 深色证据、契约面/组件台账与 uiux-v2/治理测试，产出[4B 设计附录](docs/design/2026-10-21_design_ui-platform-phase4b-design.md)。**未实施、未测试、未写 app/ 代码、未提交。**

覆盖：**①治理模型/状态**——single「旧模型（su）」、trio「三权 · 五角色」、unknown 不猜；single 迁移条「本项目使用旧治理模型（su）。可升级为三权模型。」+「查看差异 / 升级」/禁用「升级入口待本版后续」；single↔trio 切换清除本会话一次性警告已确认键，single 禁用 decision、trio 重新武装 warning。**②治理卡/镜像**——同一 request id 源面+镜像面，镜像徽标「镜像 · 主入口」+「来自 <角色> 的治理决定 · 客户最终批准」；任一侧作答只一次、双面冻结、动作 hidden/原因可见；镜像不自动滚动/抢焦点；queued 不物化卡，主入口 `#chat .op-queue-aggregate` 显示「还有 N 个决定等待前一个决定」，`queuedDebug()` 返回 id 数组，按 project×runtime 计数/去重/清理、不跨视图复活。**③治理记录预览**——建立/重新接受/迁移共用非模态 `#governance-preview`；建立含模型选择/写入路径/pin 对象及角色数/采纳既有文档/旧格式/授权来源/不扩大声明；重新接受逐文件 modified/missing/unreadable + pin 重算说明 + blockers；迁移含模型/字段/manifest/pin/保留/摘要前 8 位；确认按 canConfirm/模型未知/摘要缺失禁用；phase=write 失败绝不说「未写入/已升级」；预览无 backdrop/无焦点陷阱、Esc 回触发。**④报告/回执**——报告分层 source/turn/task/provenance/保存状态/投递回执；完整摘要/证据/source 文档按钮；persistence saved/failed/unknown/disabled/expired/conflict 等矩阵与重试；delivery 批次「回交投递 · 本批 N 份（不表示全部收齐）」+接收历史/目标输入记录/目标轮次结果；不显示假完整/已持久化/全部收齐。**⑤菜单**——配置状态 208px 两行，按需读取/缓存、不导入预取，缺配仍可选。**⑥queueView**——任何顶层 tab 切换清空并回基础视图（PM §14.2）。**⑦组件**——无新 shadcn 原语；新增 `GovernancePreviewPanel`、`ReportReceiptBlock`、`GovernanceQueueAggregate` 三个项目组合组件登记台账；状态矩阵/2px/3px 焦点/热路径零动画/960/200%/逐字文案与不新造能力。**⑧证据**——不新增静态原型，明确引用旧 renderer/ui-labels、旧报告/投递截图、4A 深色证据、uiux-v2 mirror+queue 测试、治理三权验证。

4B 必须 8 项；可随 Phase 5：全量双端/main.mjs/入口切换/打包/Windows/DPI/屏读/真实模型网络/最终验收，以及 C2 重锚、judge 重放完整证据、极端窗口微调。开放问题 6 条见 §10.3。同步 feature-map/memo；未改 app/src/test、其他角色或历史设计文档。

## 2026-10-21 — Phase 4B 实现设计对齐评审（needs-work）

桌面UI 交付 4B 治理三权/镜像/排队聚合、治理记录预览、报告全文/persistence/delivery、菜单配置状态、queueView、single 警告、judge 重放与 replayAnchorDebug。本角色只读[变更记录](../桌面UI/docs/change/2026-10-21_change_ui-platform-phase4b-governance-receipts.md)、[证据](../桌面UI/docs/change/2026-10-21-phase4b-evidence/)（53/53 冒烟、1360/960/200% 截图、uiux-v2、bench/ime/lazy/gates）、实现与 [4B 设计](docs/design/2026-10-21_design_ui-platform-phase4b-design.md)，输出[评审记录](docs/design/2026-10-21_design_ui-platform-phase4b-review.md)。**未改 app 代码**；结论 **needs-work**。

**已通过**：治理卡源面/镜像同 id、镜像徽标/来源、只答一次/双面冻结、queued 不物化卡；聚合行唯一/不可聚焦/无按钮/切引擎项目清空/不重复计数；治理预览唯一非模态、Esc 回触发、建立/再接受/迁移字段、逐文件 modified/missing/unreadable、pin 重算、canConfirm、phase=write 失败如实、取消零写；报告 source/turn/task/provenance、摘要/证据/来源文档、persistence saved/failed/unknown/disabled/expired/重试、delivery 批次「不表示全部收齐」/接收历史/目标输入/轮次结果/安全副本；菜单 208 两行/按需缓存；queueView tab 清空；single↔trio 警告刷新；judge 跨引擎重放/anchor；1360 治理状态/预览/报告/菜单/交付层级通过；53/53、96/96、679/679、IME/lazy/bench/C1、零 console/CSP。

**4 项 Phase 5 前必须**：①`phase4b-960.png` 五角色左树行重叠——治理行的 power/builtin 内容超过 48px，`.tree` 纵向 flex 子项默认收缩，行压到 48 后内容溢出；需 `flex:0 0 auto`/树自身滚动或 960 显式压缩并补行不重叠断言。②`phase4b-200pct.png` 头部「主理 / Lead」「会话继续使用现有上下文」竖排、操作区挤压、聊天出现横向滚动；`200% text reflow` 仅验 `documentElement.scrollWidth`，漏 `#chat`/`.chat-head`/抽屉内部，属假通过；需 200% 头部换行/内容逐容器无横溢/治理预览/报告/左树截图。③`visual-v2-960.png` 报告 facts「报告存储报告已保存」「独立验收尚未确认」标签值粘连；`.report-facts` inline dt/dd 缺分隔/间距，需冒号/grid/单列并复核 960/1360/200。④`GovernancePanel` 取消按钮只 `cancel()` 未回 `invokerRef` 焦点；需与 Esc 同路径回焦并补断言。

**可随 Phase 5**：200%/镜像/迁移/报告预览截图不足；治理 flow 四态未接（`governanceStatusText` 支持但 GovernancePanel 未使用）；聚合行 `sys-queue` 落 Info 图标而非 Clock；gp 按钮 24/30 vs 设计 28；report 完整 details 无 max-height；delivery 内 blocked 报告无 danger 竖条；C2/Phase 5 既有缺口（树视口/身份/虚拟窗口锚点）。同步 feature-map/memo；未改 app/src/test、其他角色或历史设计文档；未重跑、未提交。

## 2026-10-21 — Phase 4B 返工复核（needs-work，剩余 2 项）

桌面UI 已修 4B 真红与上轮 4 项。本角色只读新 [65/65 冒烟与 9 张截图](../桌面UI/docs/change/2026-10-21-phase4b-evidence/smoke/)、变更记录返工节与实现，更新[评审记录](docs/design/2026-10-21_design_ui-platform-phase4b-review.md)至 revision 2，追加「4B 返工复核」。**未改 app 代码**；结论 **needs-work**（剩余 2 项 Phase 5 前必须）。

**已通过**：960 五角色树行不重叠/树滚动（`phase4b-960-five-role-tree.png`，52/54）；报告 facts `dt::after` 冒号+间距，1360/960 计算断言与 1360 截图（`phase4b-1360-report.png`）可见；治理预览取消 `cancelPreview` 回 invoker（常规/200%）；C2 收起+原因（48）、已答卡 full rebuild 锚点（51）、RUNTIME 17/17、VISUAL 54/54；65/65 冒烟、零 console/CSP。

**剩余 2 项 Phase 5 前必须**：①200% 左树在 `phase4b-200pct-five-role-tree.png` / `phase4b-200pct-governance-preview.png` 为空白，配置提示窄条并出现横向滚动；`treeRowsHealthy` 过滤零高行、200% 容器检查未含 `.runtime-config-notice`/`.governance-status`/`#role-tree`，仍假通过；需左栏可滚动或树 min-height、提示换行、行与 tree viewport 相交断言。②200% `phase4b-200pct-report.png` / `governance-preview.png` 未展示报告卡/预览面板（停在头部/状态），且 `200% containers` offenders 显示 `report-complete-body`(40/32)、`hb-complete-summary`(12/2)、`hb-evidence`(30/18) 内部横溢未断言；需滚到目标/展开 details、逐容器断言，并补 960 report facts 可见截图。两项目前是 Phase 5 前最后阻塞；其余视觉/证据项可随 Phase 5。同步 feature-map/memo；未改 app/src/test、其他角色或历史设计文档；未重跑、未提交。

## 2026-10-21 — Phase 4B 200% 收口复核（设计对齐 pass）

桌面UI 已修上轮剩余 2 项 200% 收口。本角色只读 [70/70 冒烟与 10 张截图](../桌面UI/docs/change/2026-10-21-phase4b-evidence/smoke/)、`phase4b.css`、`GovernancePanel`/`ReportCard` 与 C2/锚点证据，更新[评审记录](docs/design/2026-10-21_design_ui-platform-phase4b-review.md)至 revision 3，追加「4B 200% 收口复核」。**未改 app 代码**；结论 **pass（设计对齐通过）**。

逐项：①200% 左树：`phase4b-200pct-five-role-tree.png` 六角色行可见，`treeCH 643`/`leftSH 923`/first/lastVisible true，行不重叠、树/行无横溢；缺配条「Pi 配置不完整，缺：ANTHROPIC_AUTH_TOKEN、ANS_PI_MODEL。请补齐后保存。」全宽换行（msg 198/198、55/55、按钮首屏内），容器检查扩展至 `.runtime-config-notice/.governance-status/#role-tree/.col-mid/.session-notice/.composer`，offenders 空。②200% 报告/预览：`phase4b-200pct-report.png` 报告卡可见、`phase4b-200pct-report-details.png` 完整摘要+证据可见（card 196/196、complete 166/166、summary 136/136、evidence 146/146），`phase4b-200pct-governance-preview.png` 预览可见、面板内滚动无横溢、取消回触发；960 `phase4b-960-report.png` 滚到 facts 可见「报告存储：报告已保存 独立验收：尚未确认」。③C2 收起+原因（48）、已答卡 full rebuild 锚点（51）、RUNTIME 17/17、VISUAL 54/54；70/70、零 console/CSP；无新裸色/第二图标/热路径动画。

剩余可随 Phase 5：镜像/真实迁移截图、治理 flow 四态、聚合 Clock 图标、gp 按钮 24/30→28、delivery blocked 报告竖条、长报告 details 阈值、`main.mjs`/全量双端/入口/打包/Windows/DPI/屏读/真实模型网络/最终验收。4B 设计对齐通过，Phase 4 完成不等于 Phase 5/最终验收。同步 feature-map/memo；未改 app/src/test、其他角色或历史设计文档；未重跑、未提交。

## 2026-10-21 — Phase 5 最终视觉审计计划

按 PM §十六 Phase 5 授权与 5A→5B 硬顺序，产出[最终视觉审计计划](docs/design/2026-10-21_design_ui-platform-phase5-visual-audit-plan.md)。**未写实现、未执行审计、未提交。**

范围为生产入口候选 1360×860/960×620/200% 的关键面：标题栏、左树、聊天流、工具行、卡族、抽屉、设置、工作概览、队列、治理、报告/交付、空态/错误态、全局纪律；5A 旧入口快照（旧渲染器仍为生产默认）与 5B 新入口最终审计，旧新同场景/同 fixture 对照，允许差异逐条登记（深色 Nova、字阶、900 列、五角色等为已批准差异，不做像素回归）。基线：Nova × 石墨令牌/尺寸/状态矩阵/对比度实测、Lucide、Motion 范围、2px/3px 焦点、无裸色/第二套库/演示标记。方法：真实 Electron、capturePage、computed style/rect/scrollWidth、键盘/activeElement/inert/Esc、200% `setZoomFactor(2)` 逐容器 reflow；证据用 5a-old/5b-new 命名 + manifest/findings/computed/keyboard/environment，记录候选 commit/产物 hashes/Electron/OS/viewport/zoom/fixture；结论逐项 pass/needs-work/missing-evidence，P0/P1/P2；200% 报告需滚到报告/展开 details、治理预览需可见，不能只截头部。分工：UIUX 结论只作设计对齐证据，不代替测试独立验证/PM 门/独立验收；独立验收标准先固定。5A 门通过前不删旧渲染器/vendor；5B 审计通过不宣称 Phase 5 完成或发布。

同步 feature-map/memo；未改 app/src/test、其他角色或历史设计文档；未提交。

## 2026-10-21 — Phase 5A 旧入口视觉快照

按[Phase 5 视觉审计计划](docs/design/2026-10-21_design_ui-platform-phase5-visual-audit-plan.md)启动 5A 旧入口基线。真实 Electron 旧入口（commit `224cf83`、Electron 44.7.0、macOS 26.6.2 arm64）跑 A–L：raw 75 张三档（25 场景×1360/960/200）、raw-standard 17 张未改 e2e 1360、75 份 metrics、11 份 keyboard、manifest/findings/report；证据[目录](docs/design/2026-10-21-phase5a-old-visual-evidence/)与[审计报告](docs/design/2026-10-21_design_ui-platform-phase5a-old-visual-audit.md)。**未改 app、未提交。**

结论：**快照任务 pass**。旧端 1360/960 基本 pass：标题栏 36、左树 248、内容 900、抽屉 424、焦点环 2px/3px、抽屉打开聚焦关闭钮/背景 inert=2/Esc 回 tab-work/tab-card/tab-pi、引擎菜单 End/Esc、报告/交付/设置/operator/work 结构可见。**旧端 200% needs-work**：`#role-tree` h=0/角色不可见；`.chat-head` sw312/cw232、`.composer` sw496/cw232 内部横溢、标题/上下文竖排；治理预览宽 1048>900 且 Esc 不关闭（P1）；1360/960 `.col-left` 251/247 4px（P2）；200 设置抽屉 424 近似全屏；旧 fixture 有「演示运行时」标记。旧 e2e **E2E_PASS=false**（`RECOVERY_SAME_PENDING_CARD_ONCE`，原版 e2e 同样失败，属测试/验收，不冒充视觉 pass）；旧 200 报告/预览截图未到目标（missing-evidence）；04-profile 截图实际为聊天，profile 以 audit-02 补。新端候选冻结后按 A–L 三档重跑，重点 200 左树/头部/报告/预览并对照旧 F1–F9，不沿用旧图作新端通过。

同步 feature-map/memo；未改 app/src/test、其他角色或历史设计文档；未提交。

## 2026-10-21 — Phase 5B 新入口视觉审计与 design audit 裁定

按 PM §十八 对新入口候选（HEAD `224cf83`；index `8d202c2d`、JS `387935a1`、CSS `b3c67401`；Electron 44.7.0、macOS 26.6.2 arm64）做真实 Electron 1360×860/960×620/200% A–L 审计，并对照[5A 旧入口基线](docs/design/2026-10-21_design_ui-platform-phase5a-old-visual-audit.md)。证据：[raw-main](docs/design/2026-10-21-phase5b-new-visual-evidence/raw-main/) 75 PNG+75 metrics+11 keyboard，[raw-phase4b](docs/design/2026-10-21-phase5b-new-visual-evidence/raw-phase4b/) 70/70 冒烟+16 PNG，[manifest/findings](docs/design/2026-10-21-phase5b-new-visual-evidence/)；报告：[Phase 5B 新端视觉审计](docs/design/2026-10-21_design_ui-platform-phase5b-new-visual-audit.md)。**未改 app/src/test、未提交。**

**结论：needs-work（P0 ×1、P1 ×3、P2 ×4、missing ×1、证据注记 ×1）**。P0：200% 下 `#chat` 随虚拟转录总高撑开，composer 被推到 5,075–1,341,790px，长历史输入区实际不可达（`metrics-audit-00-main-200.json` 等）。P1：①200% 无角色/会话失败态中栏横向滚动条（`11-operator-card-200.png`）；②`sys-loading`/`tool-current` 只有文字、缺 12px 工作转轮（v3 W10/W11/Nova）；③`6-可见行` 当前 6 行低于等价阈值 8，且夹具含 2 张 operator 卡（含上一场景未隔离）/57.2+54px 系统行，与旧 9 行不可比。P2：注入盒行高未锁 1.6；1360/960 多层状态条叠压；200% 镜像/交付目标未入镜；`04-profile`/`12-composer` 证据命名与内容不符。

**两条裁定**：①`6-可见行≥9` **不退役**；改为规范化夹具 **1360 无提示条 ≥9、有 57.8px 提示条叠 ≥8、960 有提示条 ≥4**，逐行 16±1/活动行≤48/转录≤850/输入≤140 保留；当前 6 先清残留+规范夹具，再压 chrome，不压正文、不降到 6。②`9-W9-转轮0.9±0.2s` **保留 900ms**；新 `.status-spinner`+Lucide `LoaderCircle` 12px+Motion 0.9s linear infinite 正确，重锚为 `.status-spinner svg`+运行时角速度/source guard+reduced-motion 静止弧；不批准静态默认，W10/W11 必须复用同一枚。

**12 条重锚复核**：W1/S3/W6b/S1/W9/12-reduced/无第二转轮可重锚 pass；S2 chip 批准右对齐阅读列右缘（right≤8）；W6 行高 1.6 为 P2；W10/W11 缺转轮为 P1；10 条“已批准重锚”仅有工作徽标/chip 右对齐有等价 DOM，测试仍用旧 `.spin-arc`，不能记 pass。

**旧端 200% 主要项关闭**：左树可见/滚动；正常态头部/缺配条/输入区无横溢；治理预览 900/654/198 ≤900 且 Esc 回 `gov-action`；报告/完整摘要/治理预览目标可见；镜像/交付 200 仍缺。审计后 18:48 dist 已重建为 `e44c9ca2/8c691c7f/5aa5c24c`，本报告只对审计时 hash 有效，候选冻结后须重跑。评审记录 revision 4 追加「Phase 5B 新端视觉审计与 design audit 裁定」；同步 feature-map/memo；未改 app/src/test、其他角色或历史设计文档；未提交。

## 2026-10-21 — PM §十九 BOOTSTRAP 依据与重锚落地复核

按 PM §十九 给两项书面依据。**未改 app/src/test、未提交。**

**① BOOTSTRAP**：旧「完成 bootstrap」**入口条**删除是 2026-10-12 A-5 有意裁定，**不补回**；但新渲染器把 S0「项目尚未 bootstrap」唯一提及与「开始与 <主入口> 对话」中心 CTA 一并删掉，改为「该项目下未枚举到角色 / 重新导入」，**不是已批准差异**。PM §10.3/§10.7 与 2026-10-18 Liaison §9.2 明确要求 `hasRoles===false` 保留 S0 标题/说明/`#btn-start-primary` CTA；桌面UI 需补回，并把 `hasRoles===false` 与 `roles.length===0` 异常态分开。新区断言：保留 `BOOTSTRAP_CENTER_CTA_PRESENT/MENTION_COUNT/MENTION_IN_CENTER_EMPTY`，新增 `BOOTSTRAP_S0_TITLE/S0_SUB/S0_CTA_TEXT/S0_CTA_STARTS_SESSION/S0_CTA_KEYBOARD/S0_NO_GOVERNANCE_CTA`；`BOOTSTRAP_ACTION_REMOVED` 保持 true。详见[设计依据](docs/design/2026-10-21_design_ui-platform-phase5b-bootstrap-empty-state.md)。

**② 重锚复核**：W1/S3/W6b/W6/W9-12px/W10/W11/reduced-motion 设计口径基本成立，`.mi-body` 1.6 已修；但 **W9/W10/W11 转轮被改成 CSS `@keyframes v3spin`，不是 Motion**，违反 Nova §7.1 与 PM 重锚要求；0.9s 时长/12px/reduced-motion 行为可保留，机制需改回共享 `motion/react`（或 PM 书面修订 Nova）；密度规范化夹具、S2 右缘、旧审计 `.spin-arc`/左缘/24px/9 行选择器未落地，12 条不能记 pass。新候选 `d1f76147…` 只读 5A 冒烟 **19/19、0 failures、零 console/CSP**：200% 长历史 `chatClient=240`/`chatScroll=19396`/composer bottom=430=innerHeight，空/错误态 `mid 422/422`，P0/P1 行为修复有新鲜证据；完整 A–L 待冻结后按新 hash 重跑。详见[重锚复核](docs/design/2026-10-21_design_ui-platform-phase5b-reanchor-review.md)与[证据](docs/design/2026-10-21-phase5b-reanchor-evidence/)。评审记录 revision 5 追加 §10.4；同步 feature-map/memo；未改 app/src/test、其他角色或历史设计文档；未提交。

## 2026-10-21 — Phase 5B 冻结候选最终视觉审计

候选冻结 `c9d13918` / JS `f568e2aa` / CSS `57d9575c`（gzip9 288,262B）后重跑 A–L：**31/31 design audit、32/32 带提示条密度、24/24 5A 冒烟、70/70 4B 冒烟、main E2E_PASS=true、51 张三档截图**；证据 [final-audit-evidence](docs/design/2026-10-21-phase5b-final-audit-evidence/)，报告 [最终审计](docs/design/2026-10-21_design_ui-platform-phase5b-final-audit.md)。**未改 app/src/test、未提交。**

**结论：needs-work（P0 0、P1 1、P2 3）。** P0 与旧 P1 清零：200% 长历史 composer 可达（chatClient 240/scroll 19388/bottom 430）、200% 长会话失败无横滚（ZOOM200_OPERATOR_LONG_FAILURE_NO_H_OVERFLOW=true）、BusySpinner 共享 `motion/react`（非 CSS keyframes）、密度 1360 无提示条 9/带提示条 8（测试夹具 11）/960 ≥4、注入盒 1.6、200% 镜像/交付有 computed/截图；MERGE 12/12、DEFAULT 110/110、RESTORE_NO_SUCCESS_DIVIDER=true。

**新 P1**：200%（480/680 CSS）sticky composer 覆盖内容列——`phase4b-200pct-report.png`/`report-details`/`governance-preview` 只剩顶部，`07-operator-mirror-200pct.png` 确认/拒绝动作被 composer 覆盖，480 CSS S0 CTA bottom 398.6 > 310；现有 computed 检查只验宽度/存在，未验遮挡。**5A 门未通过**。修复方向：≤680 CSS 紧凑/非 sticky composer，或打开报告/预览/镜像卡时暂收起；补「目标 bottom ≤ composer.top」断言；重截 480/680 目标并复跑受影响 C–K。P2：480 S0 CTA 首屏下（同源）、main 3× 200% 截图滚动位/场景命名、smoke harness「窗口控制不可用」注记。评审记录 revision 6 追加 §10.5；同步 feature-map/memo；未改 app/src/test、其他角色或历史设计文档；未提交。

## 2026-10-21 — Phase 5B 最终候选复测通过

最终候选 `f372e111` / JS `f568e2aa` / CSS `b52cfca1` 复测：**5A 36/36、4B 70/70、design audit 31/31、带提示条密度 32/32、main E2E_PASS=true + 51 PNG 三档、S0 480 补充 25/25**。证据 [final4](docs/design/2026-10-21-phase5b-final4-audit-evidence/)，报告 [最终审计](docs/design/2026-10-21_design_ui-platform-phase5b-final-audit.md) §十一。**未改 app/src/test、未提交。**

**结论：pass（P0 0、P1 0、P2 3）。** 200% composer 95 CSS；680/480 遮挡门全过：报告完整摘要/证据、治理预览、镜像卡动作、交付 facts、S0 CTA 均 `bottom <= composer.top`；480 composer/header/col-mid 无横溢（222/222、midOffenders=[]）；长历史 chatClient 240/scroll ~19472/bottom 430；密度 1360 9/613.4、带提示 8/576.4、960 6/381.4；W1 15、S2 右缘 0、S1 截断、W6 1.6、W9-W12 Motion/reduced；MERGE 12/12、DEFAULT 110/110、RESTORE_NO_SUCCESS_DIVIDER=true。**P0/P1 清零，5A 门设计对齐通过。**

**P2（登记，不阻塞）**：①480 镜像卡 chip 覆盖确认/拒绝动作带（gate 通过，但 chip 重叠；滚动可移开）；②480 报告/交付 target 可见但完整卡片标题在视口上缘外；③main 3× 200% 截图常停底部、`04-profile` 为聊天/命名不符；④smoke/4B「窗口控制不可用」harness 标记（非产品）。评审记录 revision 7；同步 feature-map/memo；未改 app/src/test、其他角色或历史设计文档；未提交。

## 2026-10-21 — Phase 5B 唯一生产入口最终审计

5B 已切换唯一入口 `app/renderer/dist/index.html`（HTML `3c4da2a2`、JS `f568e2aa`、CSS `76fad7ce`；gzip9 288,530B；旧渲染器/vendor 已删）。真实 Electron 1360/960/200 全量：**5A 36/36、4B 70/70、design audit 31/31、带提示条密度 32/32、S0 480 25/25、main E2E_PASS=true + 51 PNG 三档**；证据 [production-entry](docs/design/2026-10-21-phase5b-production-entry-audit-evidence/)，报告 [最终审计](docs/design/2026-10-21_design_ui-platform-phase5b-final-audit.md) §十二。**未改 app/src/test、未提交。**

**结论：pass（P0 0、P1 0、P2 5）。** 200% 左树可见/可滚；480/680 composer 95、480 审/决单字、预览 static、无横溢；report/details/preview/mirror/delivery/S0 目标 `bottom<=composer.top`；治理预览 ≤900 + Esc 回 `gov-action`；S0 标题/说明/CTA/单一提及/无治理 CTA；密度 1360 9/613.4、带提示 8/576.4、960 ≥4；W1 15、S2 右缘 0、S1、W6 1.6、W9-W12 Motion/reduced；MERGE 12/12、DEFAULT 110/110、RESTORE_NO_SUCCESS_DIVIDER=true。**与 5A 旧端对照**：200% 树 h=0/头部输入横溢/预览 1048/Esc 不关闭、200% 报告预览缺口均 closed；旧 1360/960 层级/900/424/焦点保持；旧 E2E_PASS=false→生产入口 true。

**P2 5 条**：①480 镜像 chip 与确认/拒绝动作带重叠（滚动可移开）；②480 报告/交付 target 可见但完整卡片/批次标题在视口上缘外；③480 缺配条下半/「打开 Pi 设置」被 composer 覆盖（header/设置仍可恢复）；④main 3× 200 截图位/`04-profile` 命名；⑤smoke/4B「窗口控制不可用」harness 标记。5A 门/5B 设计对齐通过；P2 可随 Phase 5 后续打磨。同步 feature-map/memo；未改 app/src/test、其他角色或历史设计文档；未提交。
