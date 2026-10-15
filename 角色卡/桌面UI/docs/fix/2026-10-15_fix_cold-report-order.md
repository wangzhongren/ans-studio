---
id: desktop-cold-report-order
type: fix
created: "2026-10-15"
status: implemented-unverified
revision: 1
---

# 冷报告快照按实际有效时间排列

root真实native-nested-960-close-ax.txt证实Test最新报告08:46先于旧报告08:05，默认尾部因此落旧成果。provider读取报告按hash文件名顺序，公开API未保证时间序；renderer两个冷history分支直接forEach输入列表。

只在renderer冷payload.reports独立快照上copy数组，所有报告at均非空字符串且解析有效时稳定升序；同时间保持wire相对顺序，任一未知或非法时间整表保wire顺序，不猜未知次序。report对象/正文/身份不改，事件rows及实时到达顺序不改。报告原reportId去重逻辑不改。

源码仅renderer.js，测试renderer.test.ts/e2e/uiux-v2.mjs；静态严格首红到72/72绿保/private/tmp/ans-report-order-node-{red,green}.log，typecheck/diff0。受控实际renderer增加reversehash但真实old→new、工具原序、重复快照去重及unknown保wire验证，实际renderer已集中验证。visual首红观察实际排序与工具序均正确，但新legacy工具夹具误用canonical工具选择器；保完整observe，仅新assert校正为精确2条legacy activity首read次shell，不减原业务断言，产品未变。最终visual36记录（34true+2测量）、consumer41（40true）、full99（89true）、ghost9true，0false/errors空；Node72/72与typecheck/diff0。全部selftest Electron已quit，源码冻结。

最终6源5测试及RED/GREEN见[manifest](2026-10-15-cold-report-order-evidence/manifest.json)。root以现有真实报告hotreload复验待其证据，无新模型。
