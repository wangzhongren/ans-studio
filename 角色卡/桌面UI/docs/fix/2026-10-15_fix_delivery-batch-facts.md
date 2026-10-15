---
id: desktop-delivery-batch-facts
type: fix
created: "2026-10-15"
status: implemented-unverified
revision: 1
---

# 接收批次回执复用V2事实组件

root真实native-target-received-1360.png与native-target-batch-facts-1360.png证明批次归属正确，UX指出旧松散段落/左竖线未对齐accepted V2。按root窄包只调整target persistence panel：一处dl使用report-facts组件，11px dt、13px dd、gap12/24与上下14px边界。三项分别是接收历史、目标输入记录、目标轮次结果，值仅取既有state/receipt的history、inputSaved、outcome、providerMayHaveStarted；未知、失败、可能开始保真实语义，无message解析。

retry/error保持该批次块下，原source两facts与每份report无改。安全副本、summary与flags均保留。源码仅renderer.js/styles.css，测试仅renderer.test.ts/e2e/uiux-v2.mjs。Node严格RED→GREEN日志保/private/tmp/ans-batch-facts-node-{red,green}.log，70/70，typecheck0。已在root释放slot后集中完成visual29记录（27布尔true与2测量）、consumer41（40true）、full99（89true）、ghost9true，全部0false/errors空。Node70/70、typecheck/diff0。全部自测Electron已quit；不操作真实窗口/Provider。双宽稳定帧已重采，原退出中间帧排除；最终960已人工读图确认三事实和report分层可见，无drawer遮挡。

最终hash及日志/图见[manifest](2026-10-15-delivery-batch-facts-evidence/manifest.json)。root真实hotreload验证待其自有证据，源码冻结不再静默更改。
