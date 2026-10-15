---
id: desktop-visual-v2-alignment
type: change
created: "2026-10-15"
status: implemented-unverified
revision: 1
---

# V2逐项落地对照（非新设计）

固定桌面UI，按已accepted原型e95b363d/规范25474437执行；此表不改冻结资料、不新增设计选项。首轮近似版仅tokens/功能自检，未被当作设计验收候选。用户强调完全按产品/UIUX实现，以下真实结构按原型落实并交UIUX独立审核。

| V2定稿位置/数值 | 实际owned位置 | 首查状态与具体接线 |
| --- | --- | --- |
| 导航宽208/176，宽内距16/窄12 | index.html .col-left；styles.css .app/.side-actions | 尺寸已接；旧“项目”分区/大切换按钮必须替换为ans21px+AGENT WORKSPACE11px、紧凑项目icon32px+真实名称14px/本地路径辅助；真实路径保title可达，不硬编码p-limit |
| 角色导航，最少54/56px，名称13px/meta11px，底部导入/设置稳定区 | index.html #role-tree/#btn-import/#tab-pi；renderer.js roleTreeItem/applyListing | 保真实主入口/组别/状态，不用原型3模拟角色；底部放导入/切换与设置，底部角色数来自真实listing；不留旧标题栏入口簇 |
| 会话头72/68px（短窗62），左右32/24；身份18/状态12 | index.html .chat-head；renderer.js setChatHeader/renderContextState | 身份/真实context一组在左；右侧引擎32+工作概览+角色资料，保原引擎aria/disabled与真实工作计数；写入语义辅助移输入区，不制造恢复或就绪 |
| 424px模态抽屉，背景inert、Tab/Esc、actualinvoker | index.html #right-drawer/#drawer-backdrop；renderer.js syncDrawerModal/toggleRightDrawer/documentList | 已接424/遮罩/inert/Tab双向/关闭回焦；工作概览与角色资料按真实现有pending/queue及资料内容分入口，不造报告；保持内外reading与草稿、实际作用域，shell确认仍优先 |
| 最大800px阅读列，正文15/1.8，标题21/20 | styles.css .chat/.chat-pane/.report-title | 已接；既有10px滚动条沟槽补偿使输入/阅读列同宽同位置，不借504画布缩放 |
| 报告浅绿独立report-top：声明/标题/来源分层，正文摘录15 | renderer.js reportBody；styles.css .report-top/.report-body | 必须补report-top分区与20/24/16内距，实际status声明优先、标题缺可靠字段用任务报告，不从正文推标题或通过数 |
| 摘要/事实/来源主次；facts13/meta11，来源实心主按钮 | renderer.js reportBody/updatePersistenceCard/sourceDocumentButton | 真实summary确定性180码点/最多4原始行预览；完整safe summary/evidence独立details；净化/截断/未知/省略首层可见。事实区分真实保存与独立验收未确认，来源按钮主、全文次；目标回执与源保存不混为完成 |
| 输入框：上textarea14px，下role/runtime+键盘提示+发送32；辅助说明在框下 | index.html .composer/#composer-capsule；styles.css .composer-bottom；renderer.js setChatHeader | 旧单行胶囊/圆箭头必须替换为上下分层；原图片入口、IME、Enter/Shift+Enter、停止按钮/真实入队语义均保留，不新增调用或发送限制 |
| 任务原文默认折叠、完整可达，不重排时间线 | renderer.js applyReportedTask/wrapTaskRequest | 仅报告source.actualturn匹配canonical用户输入turn后原位置折叠；普通chat无报告不折叠，不从自然语言判断；保原模型文本/安全副本与所有投递身份 |
| 色彩/控件 | styles.css V2 tokens | #232c29/#5d6862/#747e78/#dde2dc/#eef1eb/#fff；#2d634e/#e5eee7；失败#a1433c、未知#8a5b23；32px动作、7px按钮/10或12容器、2px焦点环+3间隔 |
| 正式应用例外 | index.html .titlebar；现有真实数据 | 原生最小/最大/关闭与拖动条保留；不搬原型演示44px条、假窗按钮/假报告/假路径/假数据、504缩放、模型不连接说明。实际读取/配置/保存/故障据现契约显示 |

待对齐4个结构项均属已接受V2，无新接口/新权限/新业务。完成后由本角色实际双宽测量/截图、自有语义回归及UIUX独立比对；root再原生完整验收。本表当前是实施对照，不能当已完成证据。


## 稳定候选的实际关闭项

上表首查阶段保留原样作为对照，非当前仍有4项未实施。最终index bb5c29a5 / styles56d2ff9e / rendererb5cf95d7已落实上述全部结构及UX后续两项：主入口重复可见badge去除、drawer18px/浅底来源说明/左右文件行动；原生窗口controls例外明确保留。菜单另按e95为180px/32px/right-aligned。工作概览独立内容覆盖真实source与received reports，只按实际reportId避免概览重复，不合并delivery attempts。

SV13已按UX同版live/cold分支：原位实际turn关联；cold中性原文标签不证明Provider结束，live需真实settled；原flags/explicit open/legacy例外全保。source与target共享分层，target回执保batch层；报告facts只显真实可知的两格，不凑原型演示四格。

UX在其独立[实现review](../../../UIUX设计师/docs/design/2026-10-15_design_visual-v2-implementation-review.md)重算当前3hash并查看稳定source及drawer双宽图后，确认主结构与accepted一致、两项差距已关闭，无新明确视觉阻塞。其review是看图+源码而非亲自GUI，不能代root原生验收。controlled received图中间帧被明确排除，不能作通过图；root正接管实际桌面采稳定received图。当前可执行28专项及原全部保护已绿、全部自有Electron退出，详见[实现记录](2026-10-15_change_visual-v2-implementation.md)及machine manifest，状态仍待独立native最终结果。


原生首红补充：此前结构bb5/b5图的设计结论保留，最终仅三指路字符串修正为实际左下角设置/会话头文字入口并保先选角色。当前index7beda47c / renderer5b80a727 / styles56d2ff9e，未变结构或业务。按root独占GUI指令不再启动Electron；当前静态67/语法/diff过，root负责最终native重载。machine manifest逐报告保存实际旧结构字节，不把图冒签到新文字候选。
