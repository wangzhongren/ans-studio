---
id: desktop-delivery-note-ui
type: fix
created: "2026-10-15"
status: implemented-unverified
revision: 1
---

# 投递进展如实作为系统记录，不伪装新增工具调用

root在真实V2发现worker报告后多出“查看执行记录1条活动/工具目标未记录调用发起”，但Core/native实际10call。只读实际public getSessionHistory返回25rows/1report、20个有名工具phase，与Core10start/9accepted/1denied相符。证据与protected实际历史fixture保在本目录evidence，目标项目未改。

Window原emitDeliveryNote注释系统行，却发tool_call且无工具metadata/turn/call，不进Core/native journal；UI isToolActivity直接信kind tool_call生成了ghost，之后history preserve仍保该live记录。按PM窄包生产者由Window owner改message+detail.source delivery-note，UI只消费；不改Model/API/执行/持久化或按文案去重。

UI将typed delivery-note全文渲为系统记录；旧匿名live tool_call无可信工具metadata/identity时用明确旧/未知系统记录保全文，不送activityOf补造工具/phase。真正known legacy kindtool、真实name/call/turn与failed/result保留。实际10call及20phase须严格不多1/不少真实事实，live+history两序保阅读，不吞未知信息。

root同时授权两项同类视觉窄校正：builtin“内置”第三行移accessible description/title，保r.builtIn和真实角色逻辑；长项目path单行ellipsis且完整title保留。仅原6source/5tests/own docs范围。已按root独占slot完成集中受控Electron验证并全部app.quit；未操作真实应用。

## 验证与交接

严格首红node-red.log与renderer-red.json保留；同一实际protected历史夹具的绿色验证保10个真实call/20phase和失败结果，旧匿名进展全文可达且不按正文去重，新typed note为系统全文，不生成第11个工具。最终9项断言全部为true，Node69/69、typecheck/diff退出0。其余受控renderer各组原业务断言保留，所有false计数0、errors空；records包含非布尔测量，精确布尔数与原值见manifest，不将测量项冒称断言。

本轮只改renderer.js/tool-rows.js/styles.css以及tool-rows.test.ts/e2e/uiux-v2.mjs。原批准13文档、V2规范/原型hash及依赖overlay复核无漂移。manifest记录完整6源5测试、Window最终producer覆盖和RED/GREEN日志。所有自测Electron已退出，生产冻结，root负责重启真实应用并以新正式V2-FIX-1任务验producer，不将旧任务冷回放当新producer证据。

证据：[manifest](2026-10-15-delivery-note-ui-evidence/manifest.json)。此前received中间帧仍排除，不以其宣称最终received布局通过。
