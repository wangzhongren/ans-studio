---
id: product-ui-rework-acceptance
type: design
title: 五项返工后的产品独立复验
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: draft
related: [product-ui-reacceptance, desktop-uiux-reacceptance]
events:
  - date: "2026-10-13"
    kind: created
    summary: 客户要求产品/UI均通过后才推GitHub，按新候选实际源码与75条离线记录准备独立复验，等待最终绑定和新图
---

# 五项返工逐项看实际产物，最后才决定是否通过

客户条件为“改完让产品和UI/UX再验收一次，确认通过后提交到GitHub”。产品本轮不沿用上轮结论；[9e50aac不通过记录](2026-10-13_design_product-ui-reacceptance.md)完整保留。**当前已读新候选源码与S1收尾后的76条受控报告，最终版本/新图及受影响独立证据待补，尚未给通过，不满足提交前置条件。**

范围只为上轮产品R1–R5：异常默认上下文、队列/全文、单份规则、撤回就地反馈、未决行动与定位。桌面文档把规则去重称R1、异常称R3，本文仍用产品原编号并列名称，避免把顺序不同当漏项。不纳O1–O4，不召开新会议，不操作用户ANS/模型，不改生产/测试/UIUX文件。

## 已收到与仍等待的证据

已读[桌面返工方案/记录](../../../桌面应用/docs/fix/2026-10-13_fix_uiux-reacceptance.md)、[PM返工与提交条件](../../../项目管理/docs/fix/2026-10-13_fix_ui-reacceptance-rework.md)、三份实际变更源码及关联旧解析，以及[当前76条实际renderer/preload纯离线报告](/private/tmp/ans-uiux-rework-final/report.json)。环境Electron44.7.0/Node24.21.0，数据/IPC受控，不是真实模型或真实队列服务。76条含几何观察与前后锚点记录，不当成76次真实用户任务；首次75条属于S1收尾前阶段。

首次源码核对快照（不是最终签署绑定）：

| 文件 | SHA-256 |
| --- | --- |
| app/renderer/renderer.js | fc148d35bd722271b6bd89efd29a4afb6b45a20bd34e8832259c6ba388cbd375 |
| app/renderer/styles.css | f9c4e41fc88d50c6ecf27794f6861d0736b1c2fa82ab6089e6d962b0b969e953 |
| app/renderer/tool-rows.js | 64283f26d5bdb662abe3be325f41ea1998b0e924c2825bb2222145972bef1f1d |

S1后当前tool-rows hash为`9ffda4bfb13c3786b1af5b50ba57a7ccdf1a371d73029433a68491d36c811648`，renderer/styles未变；属主追加记录62/62定向与76条重跑，隐藏IME报告E2E_DONE=1已读。仍需PM最终六源码及相关测试绑定、新两档截图；包括默认失败、长全文、实际撤回失败、资料/Pi打开时待确认入口、主动定位完整卡片。截图和操作必须来自该候选生产renderer，不引用原型或上轮照片充当新修已验。

[独立105条renderer/14条锚点/10例回放报告](../../../测试/docs/change/2026-10-13_change_ui-reacceptance-regression.md)已读，包含逐片Range边界/末尾哨兵、同项焦点、choice操作、真实Tab/Enter/Space及IME/报告单一展示；但其表当前仍绑定首次tool-rows64283，已交PM核受影响证据。不能将该签署直接称作S1后9ffda同版全部通过。

## 初步源码与报告核对（尚非体验签收）

| 产品要求 | 新候选实际行为和具体记录 | 当前判断 |
| --- | --- | --- |
| R1 默认知道哪里失败 | appendDenied默认summary内有独立目标行，保原可靠原因/exit，不用分号切首句；activityOf新增fullTarget。报告有“default failure shows known path”“known shell exit survives literal semicolon”“full target plus unknown target honest” | 主路径支持；S1已源码收尾并补默认历史断言，最终默认图待看 |
| R2 全文可读/操作稳定 | 真实grid24px位次+可缩内容，来源时间同行，摘要/操作/全文同起点；清掉旧flex100%+48px margin。两档right-body clientWidth=scrollWidth=349，全文宽285；全文/撤回各46×28，gap8 | 几何与源码支持；实际两档长全文/扫读待看 |
| R3 只留一份规则 | 选中角色副句清空且hidden，唯一正文为“实际写入导入项目，角色边界外的写入会被拒绝。”；报告有single brief real write fact | 机制支持；实际首屏待看 |
| R4 条目旁看到失败 | 真实返回按role+id保存反馈，失败/throw用q-feedback就地显示，保条目/全文和重试；普通快照保反馈，迟到返回不写另一角色，换项目guard | 报告覆盖inline/throw/refresh/late、焦点和草稿/附件；本轮失败新图待看 |
| R5 需要我做什么/能完整回答 | open正式请求优先busy，已答/expired后回真实busy；op-chip为原生button，置未覆盖左侧，主动定位先收抽屉/保存阅读再聚焦原卡；被遮卡inert且动作不可见，避免半卡盲点 | 报告有资料/Pi960入口几何、遮卡动作不可用、原生键盘定位/预览/作答链及恢复状态；实际入口/定位前后图待看 |

新报告还保留原文/未知活动、停止留队列、撤回成功来自快照、异步图片/发送隔离、长聊天可见行与增量/全量身份锚点。增量前后同row-118/offset -18.3125，全量前插同内容/offset -18.3515625，这是具体阅读证据，不能概括成“所有位置永不移动”。

## S1：已知首行里有文件路径时，别同时断言目标未记录

首次源码核对发现一种需要复验的既有历史形状：`read_file 失败：lost.md（ENOENT）`来自本仓严格首行模板，但旧JSONL没有details.path或对应调用id。首次版独立target为空；appendDenied在headline已经写出lost.md时仍加“目标未记录”。这不是新功能，而是R1的诚实表述边界：用户不应同时看见明确路径与缺目标断言。

已交PM转桌面收尾，现只在既有严格首行模板中回填read_file失败目标，空结构目标可以回退；不从任意正文/stdout猜目标。产品只读确认该修，当前属主脚本对无callId旧ownHistory默认summary断言lost.md+ENOENT且不含目标未记录。S1源码/属主受控证据已闭合，最终默认图与版本绑定仍需一起签署，不扩大新契约。

## 最终签署待填

- 最终候选、环境、独立/IME绑定：待补。
- 实际新图与操作入口：待补。
- 产品R1–R5逐项结果：待新证据，当前没有整体通过。
- 明确缺陷/证据缺口：S1源码与属主证据已闭合；最终截图/版本绑定及受影响独立记录仍待补。
- 唯一最终结论：尚未形成；证据不足不能满足提交条件。待实际产物复验后只给通过或不通过，若不通过立即返PM。

产品通过仅意味着本轮五项体验返工达到约定条件，不宣称“殿堂级”或替代UI/UX独立签收。PM只有在两角色对同版都通过后才提交/推送；本角色不进行git提交或放宽这项条件。
