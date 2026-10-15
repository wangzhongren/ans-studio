---
id: desktop-receiver-reply-original
type: fix
created: "2026-10-15"
status: implemented-unverified
revision: 1
---

# SV13覆盖可信回交接收轮的助手原文

root真实native-main-default-after-reload.png显示Main接收结构化回交后，同receiver turn的长助手解说仍铺开压低报告。UX已裁定appendDelivery既有validated inputProvenance/inputPresentation与actual receiver turn是可信关联，不要求等于report.source.turnId。此为accepted报告层级的必要消费者补齐。

renderer仅在已验证结构化输入后按当前pane登记receiver turn。原位复用reply-original details，标签“本轮回交处理回复原文（展开）”；源worker原标签/判据保持。live必须真实settled，冷历史中性折已有可用副本，不声称Provider结束或完整；原flags、原顺序、显式展开与锚点保持。无turn/不同turn的聊天、delivery/input/system/tool/error/terminal均不折。无NLP/邻接/status推断，不改公共契约/全局滚动策略。

静态首红/修绿日志保存在/private/tmp/ans-receiver-fold-node-{red,green}.log，Node71/71；受控visual加入receiver!=source、streaming不折/settled折、后到文本及显式展开、cold flags/legacy/无关chat断言。已按root独占slot完成实际renderer。visual首红观察到receiver已正确折叠，失败为无关assistant经Markdown产生尾换行与新夹具文本===不符；保首红完整observe，仅新增文本比较trim空白，身份/原位/展开/flags断言不减，产品未再改。最终visual33记录（31true+2测量）/consumer41（40true）/full99（89true）/ghost9true，全部0false/errors空；Node71/71、tsc/diff0。全部selftest Electron已quit。

最终6源5测试与RED/GREEN见[manifest](2026-10-15-receiver-reply-original-evidence/manifest.json)。源码冻结，root真实同一batch冷重载验收待其证据，无新模型任务。
