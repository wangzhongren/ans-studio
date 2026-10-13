---
id: test-ui-reacceptance-regression-result
type: change
title: 五项返工的独立离线验证结果
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [test-ui-reacceptance-regression, test-uiux-v2-offline-regression]
events:
  - date: "2026-10-13"
    kind: verified
    summary: 冻结候选独立S1 renderer111项、replay11例通过；旧renderer14项锚点证据按未变范围保留；真实业务与产品/UI验收不在此结论内
---

# 五项返工在独立离线场景中通过

在本次冻结候选上，用户可以看全普通队列全文、找到同项操作与撤回结果，在异常详情关闭时看见已知目标和原因；正式请求等待作答时，原定位入口可用键盘到达，定位先收抽屉并露出整卡。固定测试角色独立执行[方案](../design/2026-10-13_design_ui-reacceptance-regression.md)：新真实renderer脚本 **111项通过**，真实历史解析与展示映射 **11/11通过**；renderer/styles未变的旧虚拟行/已决锚点 **14项通过证据保留，本次S1未重跑**。新脚本包含IME和回交单一展示回归；没有运行真实模型、网络、业务项目或真实撤回服务，也没有驱动用户ANS。

受测入口为[桌面会话](../../../桌面应用/docs/feature/2026-10-11_feature_desktop-three-pane.md)，返工授权及需求见[PM记录](../../../项目管理/docs/fix/2026-10-13_fix_ui-reacceptance-rework.md)。本报告支持这些输入下的呈现和IPC路径，不能代替产品/UIUX独立签收或客户业务确认。

## 实际观察

| 条件 | 独立观察 |
| --- | --- |
| R1正常说明 | 1360/960均仅一份实际渲染的正常边界说明；普通助手问句和含“失败”的普通正文未造正式请求或异常卡 |
| R2全文与操作 | 两档right-body均scrollWidth=clientWidth=349；全文scrollWidth=clientWidth=283。逐片Range横边界核对及末尾哨兵完整。三项位置1/2/3、来源、原ISO时间、摘要与全文同id；摘要/全文左侧均对齐。全文/撤回按钮实测46×28，动作间8px；派发/回交/进行中无撤回。真实Tab到撤回、Shift+Tab回同项全文 |
| R3默认异常 | details关闭时读到可靠read_file目标/ENOENT、shell命令/exit2、policy目标/未执行；没有执行失败/完成混称。缺目标明确未记录，缺状态回放仍未知。字面含分号的命令printf "ok"; false（exit 2）退出码默认完整，没有运行此命令 |
| R4撤回 | 失败、无返回、throw、切B同id迟到均保留原A条目/全文/资料展开/草稿，原条目下回执实际可见，普通刷新后保留；阅读锚点offset每次169.4375px不变。在途禁重复IPC；成功返回本身不造移除，真实快照才移除该id并将余项排为1/2；停止保余队列。换内存ROOT并重用角色/id后旧Promise结果作废 |
| R5未决优先 | A真实open优先“等待你确认”，B busy无未决仍“正在工作”；回答/expired后恢复真实busy，busy=false撤下工作行。资料/Pi打开时定位入口完整命中，两档rect均154.6328125×30；1360位置left300/top711，960位置left300/top471 |
| R5操作与阅读 | 实际Tab、Enter/Space定位先关抽屉且未发送作答；确认标题、预览入口、确认/不同意整卡可见、可命中并恢复可用。choice标题/问题/预览入口/两选项/提交/取消全部可见；未选submit仍禁用，选后重新覆盖/定位恢复真实可用值；真实Enter只提交所选x。部分遮挡卡inert，原按钮聚焦+Enter未作答；Esc回原入口。普通到达/刷新保资料和阅读内容offset；实际左树点击U1仍优先未决 |
| 受影响回归 | 旧独立renderer验证>150行、展开组子行阅读、追加/重建/prefix前插锚点、换组不继承展开态、已拒卡位于请求/结论锚点、显式角色切换优先未决。自有hidden输入验证IME composition/isComposing/229不发送，草稿/附件/气泡保持，正常Enter仅发一次后清输入。回交未投递不镜像，投递后一份折叠详情+一份主入口答复 |

完整值见[renderer确定性报告](2026-10-13-ui-reacceptance-evidence/renderer-report.json)和[旧锚点报告](2026-10-13-ui-reacceptance-evidence/anchors-report.json)。所有项目键/消息/配置均为独立内存假数据，窗口hidden，userData隔离于/private/tmp。

## 候选与命令

HEAD为9e50aac52a4f9383460b606ab381e00b87200540，受测源码为其上的PM冻结工作树。运行前后哈希一致：

| 文件 | SHA-256 |
| --- | --- |
| app/renderer/renderer.js | fc148d35bd722271b6bd89efd29a4afb6b45a20bd34e8832259c6ba388cbd375 |
| app/renderer/styles.css | f9c4e41fc88d50c6ecf27794f6861d0736b1c2fa82ab6089e6d962b0b969e953 |
| app/renderer/tool-rows.js | 9ffda4bfb13c3786b1af5b50ba57a7ccdf1a371d73029433a68491d36c811648 |
| app/renderer/index.html | 687a0591c0f85657d1f9fad8602c1da6846f2e53fc4f24c415893792934dfbef |
| app/renderer/ui-labels.js | 9f344ebffdbc66e6f80fbfce56f6aa93f629f6a3deb8216d37bda2de67e01ca1 |
| app/preload.cjs | 53fbb3a491845f4189df2781c3f68438f2c85681b852052514a3a022697e6f19 |
| app/desktop/session-history.ts | 94417f7b27fc14a3b8a9c9a39642e36e3adb781dee3e3840b00100b099bc941f |
| test/测试/ui-reacceptance-renderer-regression.mjs | 4071945ef99d6613c4d8472beb86538d339f7d98d11ec7f5934dba6df8a32dab |
| test/测试/uiux-v2-renderer-regression.mjs | cbb321792d19f9bc7371baa38f214e10bed6ee4420d2ee7139eaafcef8575213 |
| test/测试/uiux-v2-replay-regression.test.ts | 4f58944323d6b3714a31e14cb3b96887990c7987a6a17e400db8a70545a9770d |

Node终端v24.14.0；Electron44.7.0内置Node24.21.0；macOS26.6.2/arm64。实际命令：

- node --check test/测试/ui-reacceptance-renderer-regression.mjs：exit0。
- node --test test/测试/uiux-v2-replay-regression.test.ts：11/11、0 skip、exit0。
- ANS_TEST_UI_REACCEPTANCE_OUTDIR=/private/tmp/ans-ui-reacceptance-independent-final-s1-v2 node_modules/.bin/electron test/测试/ui-reacceptance-renderer-regression.mjs：111项、exit0。
- ANS_TEST_UIUX_OUTDIR=/private/tmp/ans-ui-reacceptance-independent-anchor-final node_modules/.bin/electron test/测试/uiux-v2-renderer-regression.mjs：14项、exit0。
- git diff --check -- test/测试 角色卡/测试：exit0；只写本角色测试和文档，未改生产/他角色文件。

Electron按已有隔离启动许可使用require_escalated；实际测试窗口均hidden，未与PM可见窗口抢控制。源码或相关输入改变使本报告对应证据失效，需复跑受影响项。

## 观测修正与限制

首次脚本在圆角药丸bbox四角内2px测命中，落到其透明角，误报定位入口不可命中。测试辅助改为中心和四边中点，保留完整bbox/viewport/elementFromPoint约束，未改产品或降低遮挡要求。第二次末尾回交断言将Markdown额外尾换行当原文差异；改为trim尾换行、记录实际摘要文本和卡数后复跑。两次未作为通过证据；原报告保留在/private/tmp的final和final-v2目录。最终第三次报告无failure、consoleErrors为空、startHashes=endHashes。受控withdraw throw产生的主进程IPC错误日志是必要输入，真实renderer在原条目显示该错误且未吞掉。

未运行全库或真实队列服务；既有pi-config cwd目录预期/ans-cli基线红未改断言。本轮未采GUI截图、未运行属主show:true的IME窗口；本角色自有hidden IME输入提供本次回归证据。真实服务业务、图像审美与客户确认仍由对应角色和客户完成。

## S1最终补证范围

PM再次冻结的helper仅补严格read_file自有失败首行的旧目标回退。新增无callId/details的孤立result与空结构目标result，1360/960默认关闭details均实际显示read_file 失败：lost.md（ENOENT），没有目标未记录；未知旧记录正文含private-body.md/伪失败模板仍保持状态未记录，不造异常或目标。独立replay新增一例包住两种可靠输入及正文反向，11/11通过；新renderer全部旧105项与新增6项一起111项通过。

S1首跑自有夹具向有live拒绝的pane送历史再按第0条读取，实际读到先前policy卡；随后将孤立历史放fresh pane再测，不修改生产。最终report无failure/consoleErrors，startHashes=endHashes。旧14项只保留未变renderer的虚拟锚点范围，不能冒充S1重新执行。原105项报告另存[前一helper证据](2026-10-13-ui-reacceptance-evidence/renderer-pre-s1-report.json)，当前主报告JSON已更新为S1。
