---
id: test-ui-reacceptance-regression
type: design
title: 五项页面返工的独立离线验证
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [test-uiux-v2-offline-regression, uiux-reacceptance]
events:
  - date: "2026-10-13"
    kind: prepared
    summary: 根据已批准五项返工补独立输入和实际可见性断言，等待稳定候选后执行
  - date: "2026-10-13"
    kind: verified
    summary: PM冻结候选后新renderer105项、旧renderer14项和replay10例完成，详细值与限制见结果报告
---

# 能看全、能决定、能知道撤回结果

用户读队列全文时应能看全内容，在原条目旁看到真实撤回结果；正式请求等用户作答时，工作提示与定位入口应帮助他完成这个动作。本次按客户“修改吧”已批准的[PM返工范围](../../../项目管理/docs/fix/2026-10-13_fix_ui-reacceptance-rework.md)、[产品要求](../../../产品/docs/design/2026-10-13_design_product-ui-reacceptance.md)及[UI/UX规范](../../../UIUX设计师/docs/design/2026-10-13_design_uiux-reacceptance.md)，补足上一轮未覆盖的体验条件。受测入口为[桌面会话](../../../桌面应用/docs/feature/2026-10-11_feature_desktop-three-pane.md)。

固定测试角色只写 `test/测试/` 和本角色文档，不修应用、不改他角色断言或配置。工程法案仍是草稿，采用其中已确认的边界、角色隔离和证据要求。本方案属于已批准五项返工的必要验证，无新增选装。准备阶段尚未运行，不记录通过。

## 独立输入与观察

新增自有 `ui-reacceptance-renderer-regression.mjs`，加载生产 index、renderer、styles 与真实 preload；IPC 仅有内存替身，ROOT 是不存在的快照键，隔离 userData、隐藏窗口，不启动 SessionManager/Pi/模型、不读真实项目/凭据、不驱动用户 ANS。夹具与步骤独立编写，不复制生产状态推导。真实服务、真机截图及产品/UI签收由PM协调，替身返回只证明呈现与IPC路径。

| 条件 | 必要独立输入 | 严格观察 |
| --- | --- | --- |
| R1单份说明 | A角色普通助手答复与普通问句 | 两档实际可见文本只有一份正常边界说明；普通问句不造open请求，答复保持原文 |
| R2队列与全文 | 1进行中+3排队；客户长摘要80字以上、中文段落和英文句子；派发/回交各自既有来源标签；每项不同全文与时间 | 各字段、动作、全文都在同一id条目；时间匹配原ISO；摘要允许既有80字截断，全文逐字保留；动作rect≥28；全文/摘要左边对齐；展开后right-body scrollWidth===clientWidth，文本Range横向完全落在可用范围，避免overflow:hidden裁字冒充无溢出；Tab可达动作 |
| R3默认异常 | 原summary无路径，detail有可靠target的实时拒绝；read_file失败，shell exit2，未知回放；普通正文含“失败” | details默认关闭，屏幕可见summary含原因/exit和已知目标；缺目标显示未记录；拒绝不称已执行/执行失败；隐藏sys-detail不计入可见证据 |
| R4撤回 | 同一客户id含NUL；真实preload到受控Promise分别返回ok:false(error)、无返回、抛错、ok:true+快照；迟到失败时切B，再回A；换内存ROOT后重用同role/id | 请求中禁重复且条目保留；反馈在原条目可见，不串B同id；刷新保留提示；失败/无效/异常不清全文、资料展开、草稿和阅读锚点；成功只随真实快照删原项/更新位次；停止保队列；旧项目返回作废 |
| R5未决与定位 | A busy+正式confirm/choice，B忙无未决；作答成功及expired；长历史中上翻再到达正式请求 | open请求优先提示，回答/失效后按真实busy恢复；资料与Pi打开时定位入口完整可见且真实键盘可达；部分遮挡卡inert且不能诱导/触发作答；主动Enter/Space定位先关抽屉，标题/预览入口/选项/全部动作完整可见，不产生operator-response；展开预览可读；确认/不同意恢复可用，choice未选择时submit仍禁用、已选择后开关抽屉恢复其真实可用状态；普通到达/更新不关抽屉抢阅读；显式点role保留U1 |

可见性通过元素实际布局、closed-details祖先、viewport/可滚容器裁切和elementFromPoint联合判定；全文Range逐片核对横边界。仅textContent包含隐藏详情或CSS声明不能算通过。需要纵向滚动的长全文按抽屉滚动阅读，文字完整性要求针对横向裁切；未决卡的标题、预览入口、全部按钮必须同屏完整可操作。

## 候选与执行门

等PM公布稳定候选再执行。先记录HEAD以及生产六文件（index、renderer、styles、tool-rows、ui-labels、preload）、真实历史解析器和脚本SHA-256；运行后再比对，受影响文件变化即invalidate，不沿用旧结果。错误报告附最小输入、观察值与候选hash；失败、无法运行、未测分列。

拟命令：`node --check test/测试/ui-reacceptance-renderer-regression.mjs`；`node --test test/测试/uiux-v2-replay-regression.test.ts`；`node_modules/.bin/electron test/测试/ui-reacceptance-renderer-regression.mjs`。运行隔离输出至 `/private/tmp`。默认sandbox已有SIGABRT历史，仅使用PM已许可的隔离Electron提权启动流程，窗口hidden且不与PM可见窗口抢bundle。最终执行后写本角色change报告，准备时不生成假report。

受影响回归只复用已核查纯离线脚本：自有旧renderer检查虚拟行阅读锚点/交互重建，replay映射检查可靠失败和未知。属主IME脚本固定show:true，故读取其契约后在本角色hidden脚本独立补组合Enter/附件/草稿输入和回交单一展示；必要时只读运行属主uiux-v2的hidden模式检查异步输入/停止。既有pi-config cwd目录预期与ans-cli的基线红不改断言，不做全库反复测试。GUI截图交PM CUA采，本角色给确定性几何/可见/归属报告。

PM已读并核准上述自有写集。独立脚本已准备，代码尚未执行；稳定候选公布后才做语法检查及运行，不把当前在途源码读阅写成验证结果。

以上为准备时的计划记录。PM随后公布稳定hash并释放执行，本角色已独立运行，最终结果、测试辅助观测修正和覆盖限制见[结果报告](../change/2026-10-13_change_ui-reacceptance-regression.md)。它不代替产品/UIUX签收。

最终S1补充仅改变tool-rows的可靠read_file旧首行回退。本角色将在既有夹具中增加无callId/details的read_file 失败：lost.md（ENOENT），及空结构目标仍按该可靠首行回退的输入；默认关闭details时应显示lost.md/ENOENT且不误显示目标未记录。另给未知旧记录正文包含伪失败模板，确认不从正文猜目标或失败。仅重跑受影响replay与新renderer脚本，renderer/styles未变的旧14项锚点不无依据重跑。补充为本返工必要验证，不扩任务范围。

S1实际补证已完成：新增renderer六项随全脚本111项通过，replay新增一例后11/11；旧14项保留其未变renderer范围，不冒充S1新执行。冻结helper哈希和完整可见文本已更新至结果报告及JSON。
