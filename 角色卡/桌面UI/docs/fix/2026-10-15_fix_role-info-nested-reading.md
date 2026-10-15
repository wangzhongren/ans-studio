---
id: desktop-role-info-nested-reading
type: fix
created: "2026-10-15"
updated: "2026-10-15"
status: implemented-unverified
revision: 1
---

# 角色资料返回同时保留内外层阅读位置

root在真实efd候选上复现：角色卡与文档展开、外层底部入口真实可见，卡内滚到“6.协作”；查看来源列表再返回，外层/展开/focus均正确，角色卡独立滚动却退回开头。只采用测试角色可靠`desktop-role-info-visible-opener-before.png`/`-after.png`，不以此前入口离窗的setup证明此缺陷。

源码原因：captureDrawerReading/restoreDrawerReading原来只保存outer scroll、section展开、queue全文及锚点。card/changes/docs三个既有.card-text为max-height:380px、overflow:auto，资料DOM重建后各自scrollTop未恢复。

root按既有批准P3阅读保持授权此窄修：只在原per-runtime/per-role drawerReading中，按稳定data-section记录各section唯一.card-text的scrollTop/scrollLeft，展开态恢复后还原内层，再沿原outer/anchor/focus恢复；不以DOM位置判断role，不引入公共字段/接口/依赖，不改静态正文、C或消息逻辑，项目重置及runtime隔离沿既有通路。

严格测试准备：card/docs/changes三已有容器各scrollTop>100、outer>100、Footer入口真实可见；返回后内外层误差<2px，展开态与等效入口focus均不退。保留原outer/focus断言。当前生产仍efd，等待root退出GUI后集中保RED/修/GREEN；避免同bundle Electron启停影响原生CUA安全守卫。


## 严格首红、窄修与实际结果

root明确“退出GUI可自测”后运行首红，原展开/外层/focus断言全部通过，Footer确实可见；before为outer916/card2086/docs2047/changes2659，返回后outer仍916，三个内层均0。原始报告归档`../change/2026-10-15-complete-flow-ui-evidence/nested-role-reading-red.json`。

仅renderer增加捕获与还原：old.sectionScroll按data-section存既有.card-text位置；仅展开section捕获，避免关闭容器的0覆盖原阅读；恢复展开后还原内层，再沿原outer/anchor逻辑。沿原drawerReading的project reset/per-runtime/per-role，不增加公共字段或DOM序位猜测。

当前renderer SHA256：394a7abb0af61fa3f7a5ee0652238e70883d17d798235c37954cdf41086a5252，其余五产品文件不变。严格GREEN11记录（9true+2实际位置快照）：往返后三个内层和outer精确保持原值，展开/回焦保持；换role、runtime、新项目不串位置，返回原scope仍恢复。额外隔离夹具首轮误点已打开的资料tab致其关闭，保nested-role-fixture-setup-red.json；修正setup仅在未开时点，不放宽严格位置断言，不把此setup错误报为产品缺陷。

集中批次当前字节unit67/67、consumer41/full98/terminalmerge12/sendfacts8/merge12/dup32/runtime16/config20/selector25/project7/P5fresh4/P7terminal10、IME26均exit0，tsc/diff0。13批准文档、48实际依赖hash无差异。全部自有Electron app.quit/exit0后向root发reload信号；之后仅文档，不再启动窗口。最终真实394原生nested/960验收仍属root，不冒用efd原生结果。
