---
id: desktop-uiux-reacceptance
type: fix
title: 修复重复说明、队列全文、异常目标与未决操作的实际体验缺口
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: implemented-unverified
related: [desktop-uiux-v2, product-ui-reacceptance, uiux-reacceptance, desktop-three-pane]
events:
  - date: "2026-10-13"
    kind: designed
    summary: 按客户“修改吧”和PM五项派发记录返工写集，直接实施
---

# 默认就能知道错在哪里，队列与确认就在操作处可处理

上一候选确有五项体验缺口：聊天头重复规则、队列旧flex令grid失效且普通全文溢出、异常目标藏在详情、撤回失败反馈远离条目、未决时仍提示正在工作且窄窗定位入口被抽屉遮住。客户已批准“修改吧”，PM核查[返工汇总](../../../项目管理/docs/design/2026-10-13_design_ui-reacceptance-summary.md)、[产品要求](../../../产品/docs/design/2026-10-13_design_product-ui-reacceptance.md)、[UIUX要求](../../../UIUX设计师/docs/design/2026-10-13_design_uiux-reacceptance.md)后派发。本角色固定桌面应用，保持既有授权；不再等待客户确认。

## 必要修复与状态来源

- R1：已选角色不再渲染治理副句；唯一11.5–12px写入说明保实际项目写入与边界限制。未选角色指引、临时错误仍保留。
- R2：360px抽屉左右16px，排队改真实grid：24px位次+8px间距+可缩内容，来源时间同行，摘要/动作/全文同起点；当前工作独立块。清旧flex-basis100%和左48px边距；动作≥28px、gap8。全文普通长词换行，不将横滚隐藏当解决。
- R3：默认summary两层保原可靠原因/退出码与完整已知目标，缺目标写目标未记录。拒绝保持拒绝语义，工具大输出不展示，完整边界资料仍详情。
- R4：仅保存真实withdrawQueued返回的roleId+id局部回执，不另造队列；请求中留条目，失败/无效回原动作下方，刷新保留、切角色不串。成功依真实返回及role-state快照；换项目丢弃旧返回。
- R5：轻量运行行由真实open请求优先于role-state busy，普通助手文字不造未决。定位入口改原生button、靠未覆盖聊天左侧；主动点击/键盘定位先保存资料态并收抽屉，再走既有定位/高亮与卡焦点。普通到达/更新不自动关抽屉或抢读；回答后按真实busy恢复提示。

不改后台busy/SessionEvent/IPC/src/边界/构建配置，不新面板，不纳O1–O4。保272左/36头/360覆盖、动态composer、聊天列宽、U-1角色显式点击、普通刷新阅读锚点、IME、图片草稿、24小时诊断、停止保队列和真实回交。

## 写集和验证

源码仅`app/renderer/renderer.js`、`styles.css`、`tool-rows.js`（若必要保完整展示目标）；本角色`test/桌面应用/renderer.test.ts`、`tool-rows.test.ts`与`e2e/uiux-v2.mjs`，补本角色docs/feature、api-spec、functional-description、changelog、memo导航。先前六源码其余文件无需改，不写他角色资料。

定向运行：`node --test test/桌面应用/session-history.test.ts test/桌面应用/tool-rows.test.ts test/桌面应用/renderer.test.ts test/桌面应用/hot-path.test.ts test/桌面应用/markdown.test.ts`、`npm run typecheck`、JS语法/`git diff --check`。离线单窗口用实际renderer/preload+假IPC+隔离userData，补两档right-body scrollWidth/全文和动作rect、默认关闭异常summary中的目标/原因、只有一份说明、withdraw迟到/切角色/刷新行内回执、真实未决优先/作答后busy恢复、960资料/Pi打开定位button无遮挡及完整卡/按钮、真实键盘Tab/Enter链。旧36项数量不充当返工通过。

交互fixture失败返回必须能通过UI动作完成：保原撤回按钮，交互模式受控接口自动明确失败/无效结果；不在正式页面加演示控件。PM统一截图和产品/UI验收，不同时跑多个离线实例，不操作正式ANS或模型。

候选已实施并冻结。旧005b…源码动态结果对改动部分失效；下列证据绑定当前指纹，独立体验签收仍由PM安排。


## 实际完成与验证范围

R1去已选角色副句，唯一说明为“实际写入导入项目，角色边界外的写入会被拒绝。”；未选角色仍有指引。R2实际grid为24px+8px+可缩内容，进行中单块，普通全文不叠加旧100%+48px外边距，操作28px以上；来源/时间、摘要、动作、全文关系由实际rect核对。R3默认summary保原原因/可靠exit和完整已知目标，未知目标明确标注；仅按换行取首行，不被命令字面分号截掉退出码。完整治理细节仍可展开，不展示文件正文/stdout。

R4真实返回按roleId+id存行内回执，普通快照不丢，迟到不更新另一角色；请求中和错误回执定点更新原条目，避免每次操作重建DOM导致键盘焦点消失。真实网络异常曾使disabled按钮失焦；现在仅原请求原角色、焦点仍在body时恢复原重试按钮，新角色/新输入不被抢焦点。队列成员仍只来自快照，成功不自行伪删。项目切换的旧回包不再更新新项目。

R5未决到达、作答、失效和busy快照都刷新同一轻量行：open优先“等待你确认”；回答/失效后只按busy恢复工作或撤下。原定位入口是可键盘激活的button，靠未覆盖聊天左侧。主动定位保存资料态、关闭抽屉，再依既有虚拟行机制显示卡并聚焦；普通到达/刷新不关抽屉。实际被抽屉遮挡的卡用inert且暂隐藏作答区，避免未读全就点确认；不改变审批终态或按钮原disabled，关闭/定位后恢复。

### 当前候选证据

- 环境Electron44.7.0/Node24.21.0，Node单测使用当前宿主。所有UI输入仅受控IPC/虚构ROOT、独立userData；没有调用模型、保存Pi或操作正式ANS。
- 定向62/62通过：`node --test test/桌面应用/session-history.test.ts test/桌面应用/tool-rows.test.ts test/桌面应用/renderer.test.ts test/桌面应用/hot-path.test.ts test/桌面应用/markdown.test.ts`。类型、renderer/tool-rows语法、`git diff --check`通过。
- 全桌面207/206/1，唯一既有`pi-config.test.ts:60`硬编码目录名ans-cli（当前ans-runtime），未改此断言。报告`/private/tmp/ans-uiux-rework-all-unit-s1.txt`。不称整套全绿。
- 单窗口实际renderer离线报告`/private/tmp/ans-uiux-rework-final-s1/report.json`共76条记录通过，含几何记录。1360/960同时核right-body/clientWidth=scrollWidth、全文与摘要/动作同起点、操作区域≥28px，80字以上来源摘要和长普通连续文本；默认summary关闭时读取原因、完整长目标、exit2（含命令字面分号）/执行前拒绝/未知诚实；撤回无效和网络抛错的真实回包、同项反馈距动作6px、全文/资料/草稿图片保持、重试焦点、刷新/迟到/角色切换；open优先busy、被遮卡不可盲答、资料/Pi打开的960定位入口完整可见、主动定位后完整卡/两按钮rect；回答和失效后按true/false busy恢复，普通追问不建未决。
- 键盘实际使用Electron `sendInputEvent` 的Tab及完整Return keyDown/char/keyUp序列：抽屉关闭→全文/撤回，全文Enter收起/展开；原定位button→原卡预览→Enter展开→确认→不同意→Enter受理→保留图片移除→图片入口→输入。初始只有keydown/keyup的脚本不能生成按钮keypress，补char后才建立真实完整链；不是让合成keydown断言代替原生动作。
- 最终既有IME脚本默认隐藏（`ANS_IME_VISIBLE=1`可显式观察），避免与PM可见验收进程同bundle误选；结果`/private/tmp/ans-uiux-rework-ime/report.txt` E2E_DONE=1，候选Enter保文字/附件且不发送，普通Enter/Shift+Enter/按钮保持。

76项是本角色有限受控验证，不等于产品/UI签收，也未证明真实撤回服务/全部内容组合。交互fixture原撤回按钮可通过实际UI调用立即获得明确受控失败，无需手动解Promise；用户可读原项回执。窗口标题“ANS UI/UX 离线验收”，使用`ANS_UIUX_INTERACTIVE=1 ANS_UIUX_WIDTH=960 node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs`，两档由PM分次单实例启动并截图。

### 冻结源码SHA-256

| 文件 | 指纹 |
| --- | --- |
| app/renderer/renderer.js | fc148d35bd722271b6bd89efd29a4afb6b45a20bd34e8832259c6ba388cbd375 |
| app/renderer/styles.css | f9c4e41fc88d50c6ecf27794f6861d0736b1c2fa82ab6089e6d962b0b969e953 |
| app/renderer/tool-rows.js | 9ffda4bfb13c3786b1af5b50ba57a7ccdf1a371d73029433a68491d36c811648 |

只改这三份生产渲染文件；main/preload/session-history/index/ui-labels/src/IPC/busy/角色边界/配置未改。所有他角色原有资料变更保留。本角色同步自己的当前功能/导航与历史，截图、产品/UI独立复验、正式ANS reload和通过后提交GitHub由PM安排；未自行提交或推送。

## 产品S1同范围收尾

产品复核发现孤立旧read_file结果没有调用映射/details.path，但自有确定首行已包含lost.md，显示目标未记录形成矛盾。仅tool-rows的严格自有首行模板保留目标；结构目标为空时允许此可靠fallback，不从任意正文提取。renderer/styles/旧firstLine未改；原64283…helper相关动态签收失效，当前9ffda…已定向62/62及隐藏窗口76条重跑通过。旧ownHistory默认关闭summary现断言lost.md+ENOENT且没有目标未记录，文件正文同词和任意文本反向断言不提取。独立产品/UI最终签收和提交仍归PM。
