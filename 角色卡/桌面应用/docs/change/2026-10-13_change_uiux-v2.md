---
id: desktop-uiux-v2
type: change
title: 查看资料不遮输入，常规执行按需读，工作抽屉保阅读
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: implemented-unverified
related: [desktop-uiux-v2-implementation, ans-uiux-interaction-v1, desktop-three-pane]
events:
   - date: "2026-10-13"
     kind: implemented
     summary: 按客户v2授权和PM阶段释放完成UI1–UI3候选，离线定向验证已运行，等待独立验收
---

# 读助手答复更直接，查看工作时仍可发送和停止

现在普通工具活动按原时序收在“查看执行记录”中，助手原文、真实问题和确认卡仍直接可读。角色资料抽屉先显示当前工作与一份排队列表，资料全文在下方按需展开；抽屉避开实际输入区，不随开关挤压聊天。只有UI1–UI3，O1–O4没有纳入。

客户通过“让其他的角色开发吧，让UI和产品验收”授权v2开发；PM核查[实施方案](../design/2026-10-13_design_uiux-v2-implementation.md)后释放桌面角色。所属[当前桌面功能](../feature/2026-10-11_feature_desktop-three-pane.md)。应用候选已改，未提交、未部署；独立测试/产品/UIUX验收由PM安排，本记录不代其宣布验收。

## 输入区与辅助资料的边界

`app/renderer/styles.css`保留272px左栏、360px覆盖抽屉，两档1360×860/960×620保持聊天列宽。原关闭面板向右translate即使外层overflow隐藏，`.app.scrollWidth`仍增长；离线真实DOM检查先失败，改为原矩形内clip-path过渡后通过。输入区有多行文字/图片会增长，`renderer.js`用ResizeObserver实际测composer高度写CSS变量，抽屉bottom随之调整。

`index.html`删除Pi内层重复标题/关闭，路径独立换行；外层仍一份标题/关闭，保存、token掩码、原字段和反馈沿既有通道。开关或Esc不保存Pi、不发聊天消息，关闭回入口焦点。既有24小时诊断通道没有改。

## 工具活动与诚实结果

`tool-rows.js::activityOf`供实时/回放共同使用；`renderer.js::appendActivity`把一段同角色、同轮且相邻常规工具活动作为一条虚拟行。用户/助手、系统投递、失败/拒绝、交互/回交、轮末是边界。活动数是原事件条数，不称成功数，不做虚假配对。主动展开存入行数据，增量与轮末保留；展开与重建重新测高度/prefix并恢复当前可见子条目和偏移。可靠callId/时间内容身份用于跨full恢复；缺身份的ephemeral组不把旧open状态误套给另一组。

`app/desktop/session-history.ts`只在桌面内部ReplayRow追加可选activity事实，从既有arguments/details/isError保留工具、目标和结果。交互requestId/anchorKey/request/conclusion原契约不变；失败结论也返回独立虚拟行并登记锚点。`ui-labels.js::replayPlan`把activity纳入判等，避免同文本但真实结果变化被skip；full按稳定内容身份恢复阅读，增量不强制跳底。

accepted本身只表示已接受，缺可靠执行结果写“状态未记录”；明确status=completed且非ok=false才显示执行完成。旧“调用工具”仍写调用发起；isError=false无详细结果仅说明工具返回。read_file失败与run_shell非零exit只从本仓工具确定首行模板识别，文件正文/stdout里的“失败”不影响状态。失败默认summary直接保留原可靠首行原因/退出码，不将原因挪到折叠正文。执行前拒绝保原首句与拒绝语义，只有可靠执行失败字段/自有首行模板才标执行失败；文件正文及大输出不铺入聊天。实时缺命令、退出码、细原因仍诚实降级，不扩src契约。busy只来源role-state，缺当前动作字段时显示“正在工作”，idle撤下。

## 工作、阅读与草稿归属

角色抽屉只有一份当前工作/排队列表，空闲只一行“无进行中或排队消息”。同一role-state提供列表及角标；四份资料默认折叠，完整Markdown/边界/变更/文档保留。资料开关、队列全文和抽屉锚点按roleId保存，正常快照/资料更新保留阅读。

未投递客户消息才有撤回，进行中/派发/回交不出撤回控件；请求中保留条目、禁重复操作，失败保全文并可重试，成功由真实快照更新位次。停止仍是既有abort，仅停止当前轮，排队与草稿保留。

每角色保存自己的文本及原有图片附件；异步选图/粘贴/发送返回只更新原请求角色，换项目释放全部ObjectURL。提交立即腾空原角色输入，成功只清已发送附件，失败在原草稿未被新输入占用时恢复文字；新角色或新输入不会被旧返回清空。IME保护不改，既有候选Enter测试保持。所有显式点角色继续跳最新/未决优先（PM与产品精化保留U-1）；普通刷新/展开/抽屉开关不打断阅读。

## 本角色验证与限制

候选环境Electron44.7.0/Node24.21.0。全部离线夹具使用实际index/renderer/preload、受控IPC、独立userData及不存在的项目键，不启用Pi，不操作用户项目或真实ANS窗口。

- 定向单测：`node --test test/桌面应用/session-history.test.ts test/桌面应用/tool-rows.test.ts test/桌面应用/renderer.test.ts test/桌面应用/hot-path.test.ts test/桌面应用/markdown.test.ts`，60/60通过；类型与JS语法检查通过。
- 全桌面单测：205/204/1，唯一既有`pi-config.test.ts:60`硬编码目录名ans-cli，实际checkout为ans-runtime。未改该断言；不声称整套全绿。
- 新离线fixture：`test/桌面应用/e2e/uiux-v2.mjs`完整36项通过，包含两档全窗/动态composer/单Pi/不reflow、独立草稿图片/异步回包、停止保3队列、真实返回撤回成功失败、历史固定首行异常、220行增量和full前插阅读锚点、可靠组open恢复、denied双侧锚点及已决/未决卡定位。报告`/private/tmp/ans-uiux-v2-final/report.json`。初次sandbox启动Electron SIGABRT，提升后隔离运行正常；初期脚本await包装/错误选择器已修，最终无console errors。
- 既有IME：`test/桌面应用/e2e/ime-enter.mjs`报告`/private/tmp/ans-uiux-v2-ime-final/report.txt`，E2E_DONE=1；候选不取消/不发送/不清文字附件，普通Enter、Shift+Enter、按钮行为通过。

源码只改既定六个app文件、本角色测试和资料，无main/preload/src/构建配置写入。新回放解析在主进程加载，正式ANS需要重启，PM统一在空闲无草稿时操作；纯布局重载renderer即可。交互fixture入口 `ANS_UIUX_INTERACTIVE=1 ANS_UIUX_WIDTH=960 node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs`，窗口标题“ANS UI/UX 离线验收”，测试完成后重载并停留短混合活动、未决与1+3队列，供PM截图。截图与独立产品/UI验收仍待PM，不将本角色验证称为客户验收。

## 冻结候选指纹

本角色最终定向60/60、离线36项和IME报告绑定下列六源码SHA-256。独立产品/UI签收与正式ANS重启由PM记录，不能由本角色代签。

| 文件 | SHA-256 |
| --- | --- |
| app/desktop/session-history.ts | 94417f7b27fc14a3b8a9c9a39642e36e3adb781dee3e3840b00100b099bc941f |
| app/renderer/index.html | 687a0591c0f85657d1f9fad8602c1da6846f2e53fc4f24c415893792934dfbef |
| app/renderer/renderer.js | 005b0417028147089b2c264a86d1130de0581829a29db714cfcca842b3e90509 |
| app/renderer/styles.css | c74f2e8f78dc21293cd1e4794d61864913c1b6c298e508d78c65f75ddd64b23d |
| app/renderer/tool-rows.js | b4c6ddf840efb589a2ab44b61411eb0efe1c9b159746611117558ac0bef0c7ef |
| app/renderer/ui-labels.js | 9f344ebffdbc66e6f80fbfce56f6aa93f629f6a3deb8216d37bda2de67e01ca1 |
