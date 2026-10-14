---
id: desktop-live-history-merge
type: fix
title: 同一轮实时消息与可读历史只显示一次
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [desktop-runtime-choice, desktop-runtime-ui-implementation]
events:
  - date: "2026-10-14"
    kind: designed
    summary: 根据真实主进程重复响应证据定位首次历史和实时流没有合并
---

# 同一轮实时消息与可读历史只显示一次

用户发一轮消息后，真实运行时已经推送了回答和拒绝结果。主入口完成回交、触发 `project:changed` 以后，主进程又推送同一轮可读历史，界面把回答和拒绝显示两遍。独立测试的 Claude 一轮只有一条助手事件与一个 settled，但界面行模型为11行，图片上同一回答出现两次。原始独立证据在测试角色的 `docs/change/2026-10-14-t1-runtime-evidence/`，其17项早期检查没有覆盖这一重复，不作为无重复的证明。

根因在 `renderer.js::replayHistory`：`replayState` 只保存上一份历史，不记录实时流。首次非空历史的 plan 为 full，但只有 `full && prev` 才重建，因而直接把已显示的实时内容再追加。后来增量只相对上一份历史去重，仍无法与实时事件合并。直接清空重放又会丢未落盘输出、回交/收尾和确认卡，因此不采用。

## 必要修复与交接

沿用已批准的可用、隔离历史要求，不新增界面功能。窗口角色只透传 Core 已有的 `turnId` 与实际 `event.kind` 为 `ReplayRow` optional `turnId/eventKind`；用户历史行保留 turnId，无eventKind。旧Pi JSONL缺字段继续保持未知，不按相同文本猜测同一事件。UI不改Core、Model、窗口或权限。

渲染层按每个项目、角色和引擎维护真实流和历史的出现次数，匹配键必须带权威turnId，以及事件种类、完整原文。历史已展示的同一出现次数不再次追加实时事件；实时已展示的同一出现次数不再次追加历史。一次轮次内两条相同文本仍保留两次，不按文本去重；不同turnId的相同输入/回答全部保留。只读历史及尚未持久的实时内容分别保留，回交、settled、确认卡不因常规历史刷新消失。

历史覆盖信息随同runtime视图缓存，切项目清零。已有历史重推/增长/重写/错误分支仍按回放策略处理；真实删除/改写不能被当作新增副本。full重建前区分历史行与实时/额外行，按上一条已确证行的身份锚点保存未被新历史覆盖的内容，复用确认卡/回交/系统行；增量只跳过已确证实时出现次数。未知字段的旧替身继续使用既有回放行为，不冒称已知身份。

乐观用户气泡已由PM冻结必要显示关联：`sendSession(text,images?,target?,{clientMessageId})` optional第四参，每次输入生成独立浏览器UUID；窗口从该原始direct/queued投递捕获ID，并随真实event.turnId在信封返回optional clientMessageId。UI只用这个权威配对给原气泡绑定user turn；Core/store不变。没有ID的旧替身不猜latest/相同文本，两个同文输入也不会共用ID。若历史先于事件推达，收到配对后按同一已知user turn重新合并，保留图片说明和原气泡。

## 验证范围

自有写集为 renderer/runtime-ui/ui-labels 和已授权 `runtime-ui.test.ts` / `renderer.test.ts` / `tool-rows.test.ts` / `e2e/uiux-v2.mjs`，以及本角色资料。窗口 ReplayRow与history mapper由其独立角色实现，本侧等待实际字段后接入。测试角色脚本 `test/测试/t1-actual-main.mjs` 对本侧只读，只能运行并把输出写自己的临时目录。

计划先保留失败复现，再跑窄单测与真实Electron离线夹具：实时先到/历史先到、当前轮次后 `project:changed` 重推、历史增长、有既有旧历史、同轮重复文本、两轮完全相同输入/输出、后台runtime、未落盘实时输出、回交/收尾/确认卡保留。最后运行只读真实main夹具供独立测试角色复验。不得靠忽略全部历史或放宽断言通过。

## 渲染阶段实际结果

自有代码已实现：`renderer.js` 给每行记录来源和权威出现次数，full按身份锚点重建并复用未覆盖记录/卡片；增量跳过已显示live次数，history先到的事件不再重复。`runtime-ui.js`提供严格轮次/种类/原文key和计数，`ui-labels.js`回放判等增加实际turn/event字段。本端独立UUID随第四参发送，只按窗口信封clientMessageId+实际turnId绑定原气泡。

当前自有60/60单测与真实Electron离线IPC的9个合并断言通过。覆盖live→history、真实project:changed重推、full保留未持久内容/原确认元素/回交/settled、history→live、同轮重复、不同轮同文、后台engine、两个同文乐观输入和legacy未知。图片、批量/finally、首次贴底/刷新阅读、full重建守卫按新真实接口细化，不删除原保护。[单测](2026-10-14-live-history-evidence/unit-stage-60-of-60.log)、[9项实际界面](2026-10-14-live-history-evidence/merge-stage-nine.json)、[宽窗](2026-10-14-live-history-evidence/merge-1360.png)、[窄窗](2026-10-14-live-history-evidence/merge-960.png)均已保存。

真实主进程首跑仍为18检查中的重复guard红，source unchanged=true：[原始红记录](2026-10-14-live-history-evidence/actual-main-before-red.json)。首次自有4项源码位置守卫红、后一次main输入类型守卫红，以及第一次DOM断言未区分Markdown尾部换行的失败都保留；最终检查按可见正文trim比较出现次数，匹配key仍使用完整原文，未按文本集合删行。

渲染阶段候选为 `603a348f4cf9472b14361ddec67becdaa246dcc1734b21b3229829e767f29481`，19文件[manifest](2026-10-14-live-history-evidence/candidate-stage.json)。**当时整体未验收**：窗口首次事件FIFO猜测不足以成为用户气泡权威绑定，PM随后追加Core同步onTurnStarted ack与窗口原投递closure接线；本侧只消费最终clientMessageId/turnId，不猜current/latest。当时9项用的是受控正确metadata，没有冒称真实main用户关联已通过；此后实际组合结果见下节。

当前完整功能见[运行时会话](../feature/runtime-choice.md)。

## 最后一项静态守卫迁移

独立测试的[当前真实main](../../../测试/docs/change/2026-10-14-t1-runtime-evidence/final-2/actual-main-report.json)已23/23、errors为空且生产源码fingerprint未变，包含真实composer两次同文的direct/queued与clientID/actualturn。全仓当前仅剩本角色 `renderer.test.ts` 的旧 `entry.handle.send(text, opts)` 名字钉子为红；它不表示图片行为已失败。

实际窗口调用现在为直接发送→`sendDelivery(entry,origin,text,opts)`→`entry.handle.send(text,promptOptions)`。helper504–521先以原opts作为promptOptions：旧未识别替身无需ack时保持同对象，undefined仍是单参；需要只读ack时用 `{...opts,onTurnStarted}` 浅包装，**该分支整包不是原对象**，原images数组和图片对象引用不变，且不改原opts，继续通知原callback。[窗口实际API](../../../桌面窗口/api-spec.md)明确区分这两条路径。PM已确认按这个必要ack扩展细化守卫，不冒称真实ack分支整包同引用，也不修改窗口源。

仅迁移自有测试：锁住直发到helper、helper两种实际handle调用；legacy条件与原opts起点；ack只能补onTurnStarted、不重造images；原callback通知、角色/runtime/有效turn与当前句柄校验，以及Model只读metadata声明。原图片载荷、主进程类型、Interface重校验、原图保留、入队和撤回保护全部继续保留。动态补充是窗口属主已通过的101项中图片单参/旧整包和队列同引用原图断言，以及T1当前全仓记录；本次不另跑Electron或SDK。

这一步先记录具体差异，再改静态守卫。当前[自有60/60](2026-10-14-live-history-final-evidence/unit-60.txt)、[tsc exit0](2026-10-14-live-history-final-evidence/typecheck.txt)、[scope diff exit0](2026-10-14-live-history-final-evidence/scoped-diff.txt)均通过。静态检查证明的是实际源码调用/参数保护，独立23项证明的是真实main/preload/renderer与离线实际Core/adapter组合行为；两者没有混称。

最终19文件[manifest](2026-10-14-live-history-final-evidence/candidate-final.json)为 `5c85d48bca3060f7847fe20c8dcb87e59a5bb4a476805b64ce2ebf4a872b73ba`。与渲染阶段相比只有自有 `renderer.test.ts` 改变；对照T1当前actual-main全部生产文件fingerprint，当前差异为空，因此23项原实际证据仍有效。本次没有修改产品代码、窗口测试、SDK、env或Git，也没有重跑Electron/全仓测试。

图片/队列动态补充可核对[独立全仓原记录](../../../测试/docs/change/2026-10-14-t1-runtime-evidence/final-full-tests.txt)的P0-1合法图、坏图整条拒发、队列同引用原图和Pipeline opts/单参断言，以及[窗口属主101项](../../../桌面窗口/docs/fix/2026-10-14_fix_client-message-origin.md)。该全仓记录中的旧静态守卫红仍保留；其后只修本条守卫并在当前60项中通过，没有把旧1226项记录改写成全绿。项目最终全仓验收由PM/T1记录。

随后两份旧独立UI夹具出现unknown组/末尾组可见性红项。只读调查与T1诊断确认夹具未注册当前 `session:history-get`，真实preload收到人工NoHandler，改变了原历史输入前置。PM暂停针对这两项的产品修复，T1在自己范围补完整当前假IPC契约、保留原push与断言重跑。桌面UI没有为这两项修改产品字节，也没有加入可选读取错误兼容逻辑；不能把不完整前置的红项当作已证实产品失败或宣称已修复。当前全部生产fingerprint仍匹配上述实际23项。两份旧夹具的最终结果由T1/PM记录。
