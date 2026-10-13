---
id: test-uiux-v2-offline-regression-results
type: change
title: v2 页面独立离线回归证据
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [test-uiux-v2-offline-regression, desktop-uiux-v2-implementation]
events:
  - date: "2026-10-13"
    kind: implemented
    summary: 准备9个独立解析展示案例和真实renderer独立输入，开始候选验证
  - date: "2026-10-13"
    kind: verified
    summary: 冻结候选独立10例、13项renderer核查及属主36项离线复跑通过
---

# 冻结候选的离线呈现和输入回归通过

测试角色已按[核准方案](../design/2026-10-13_design_uiux-v2-offline-regression.md)准备独立输入，受测功能见[桌面会话](../../../桌面应用/docs/feature/2026-10-11_feature_desktop-three-pane.md)。输入全在内存；真实renderer使用隔离userData、假IPC与不存在的项目标识，不调用模型、会话管理器或真实用户项目。

## 最终候选实际结果

`node --test test/测试/uiux-v2-replay-regression.test.ts` 在最终冻结候选实际10/10通过，exit0。检查JSONL解析→真实工具事实映射→真实回放更新策略，包括未知、交错目标、失败优先、accepted诚实降级、交互锚点、事实更新、shell首行与执行前拒绝不误称执行失败。

`ANS_UIUX_OUTDIR=/private/tmp/ans-uiux-v2-independent-frozen node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs` 在最终冻结候选实际exit0，36项通过，报告 `/private/tmp/ans-uiux-v2-independent-frozen/report.json`。本角色只读审查并复跑属主脚本，没有改其输入/断言。覆盖两档布局、资料/全文、未知/失败、停止保队列、撤回失败/成功与在途、跨角色草稿附件/延迟图片和发送隔离、虚拟行增量/全量、确认定位、可靠失败summary及busy提示。

`ANS_TEST_UIUX_OUTDIR=/private/tmp/ans-uiux-independent-renderer-final4 node_modules/.bin/electron test/测试/uiux-v2-renderer-regression.mjs` 在最终冻结候选实际exit0，报告 `/private/tmp/ans-uiux-independent-renderer-final4/report.json` 含14条记录：1条初始行模型观察、13项行为核查，全部满足断言。独立JSONL进入真实renderer形成182行和40条活动的单组；同组追加40→46时子条目12的offset均为-8.03125px；收起前段177的offset差0.266px，展开恢复原offset；全量前插段落offset差0.047px。不同callId不继承展开、可靠callId前插保持展开、已决拒绝双锚点原位、显式跨角色未决定位均通过。B3严格只读 `.sys-denied summary`，文件不存在/ENOENT和shell exit2默认可见；执行前policy拒绝保留原因/未执行且没有“执行失败”声称。

本角色只读核查属主最终IME报告 `/private/tmp/ans-uiux-v2-ime-final/report.txt`：Electron44.7.0、Node24.21.0，组合态/isComposing/keyCode229均未发送且草稿附件气泡保持，正常Enter单次发送、Shift+Enter原生换行、按钮行为保留；`E2E_DONE=1`。该IME报告是属主执行证据，本角色没有重复执行。

## 初期夹具诊断与证据失效

首次属主33项独立复跑exit0，但后续候选更新使其失效，不能作为最终签署。独立renderer初期两处输入定位错误已纠正：启动上下文正常提示多1行，所以改为需求的“超过150行+单组40条活动”；第12项定位留出正8px会让第11项尾部仍为首可见，改为第12项顶边负8px。没有改变读取身份或2px偏移断言。

第一次收起把展开长组放在聊天末尾，收起后scrollHeight降低使合法max-scroll小于原scrollTop，浏览器夹紧177→170。这是不可实现的夹具位置预期；补组后50条原文后再按同一身份与2px断言验证通过。边界限度：聊天末尾大组收起后，浏览器合法滚动上界会约束位置，不能宣称任何位置都保持绝对offset。

## 版本与环境

HEAD `92348995a25356078156b89f77991e1844314144`，冻结工作树候选；命令行Node v24.14.0，macOS环境，Electron44.7.0内置Node24.21.0。最终36项和本角色动态检查运行前后六源码哈希一致。

最终冻结候选及实际脚本SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| app/renderer/index.html | 687a0591c0f85657d1f9fad8602c1da6846f2e53fc4f24c415893792934dfbef |
| app/renderer/styles.css | c74f2e8f78dc21293cd1e4794d61864913c1b6c298e508d78c65f75ddd64b23d |
| app/renderer/renderer.js | 005b0417028147089b2c264a86d1130de0581829a29db714cfcca842b3e90509 |
| app/renderer/tool-rows.js | b4c6ddf840efb589a2ab44b61411eb0efe1c9b159746611117558ac0bef0c7ef |
| app/renderer/ui-labels.js | 9f344ebffdbc66e6f80fbfce56f6aa93f629f6a3deb8216d37bda2de67e01ca1 |
| app/desktop/session-history.ts | 94417f7b27fc14a3b8a9c9a39642e36e3adb781dee3e3840b00100b099bc941f |
| test/桌面应用/e2e/uiux-v2.mjs | 5f43ea1e0d40fa0fb3e27b908b7f17a0f0ca22a36a1673ae4b7578a78020dc7c |
| test/桌面应用/e2e/ime-enter.mjs | 5fe27540cd4bd3677b51080f0cd302a237c5958124f365b14364d9e78a81a416 |
| test/测试/uiux-v2-replay-regression.test.ts | d8b9bde923595616fb2828dc9ac6534d2cb361d79c7a98bc483ea4f982089aaa |
| test/测试/uiux-v2-renderer-regression.mjs | cbb321792d19f9bc7371baa38f214e10bed6ee4420d2ee7139eaafcef8575213 |

旧9例结果随tool-rows修复失效，最终10例已重新执行。renderer最初哈希为 `c07a02de9e2b17bb16665bacc65541b0b8d7a7b9dd23b665be2c9879229df4c1`，中途 `5c9bcd6d…` 均不是最终候选。

最终结论：本报告范围内离线功能回归通过，没有发现冻结候选缺陷；真实模型、网络、真实队列服务和用户ANS操作未测试，产品/UIUX验收另行进行。属主全桌面205/204/1既有pi-config末目录预期ans-cli基线红按PM通知记录，本角色未重跑整份或修改断言，也不把它算成本轮通过。
