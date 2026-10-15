---
id: stop-terminal-send-facts
type: fix
title: 发送拒绝同时保留本轮真实终态与原会话事实
created: "2026-10-15"
status: implemented
---

# 已接受的停止轮次不应被当作未发送

WINDOW-STOP-TERMINAL-FIX-1由PM预留、root可信转发既有客户r2/P7停止收口及问题修复授权。root真实Pi待选择轮次点击停止后，Core公开settled.outcome为aborted，但send IPC只回ok:false/error，旧UI据此清会话、显示错误、回填已接受prompt并禁发送。点同角色实际恢复同一handle可继续。依据[原AX](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/desktop-stop-expired-ax.txt)、[失效单选red](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/desktop-expired-radio-mutates-red-ax.txt)及[原停止截图](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/desktop-stopped-state.png)。UI失效控件修复由其属主另记，本角色不修改renderer。

## 窄修复与事实来源

仅app/desktop/session.ts给既有SendResult增加兼容可选字段，不新增IPC、Model、generation或模型调用：

| 字段 | 唯一事实来源与限制 |
| --- | --- |
| turnId | 原send invocation的真实onTurnStarted ACK，经现role/runtime/非空ID核对；ACK不证明输入已接受 |
| clientMessageId | 原调用显示ID，用于和现session:event关联；不能代替实际turn身份 |
| inputAccepted:true | 已观察到同ACK实际turn的typed prompt-input消息；无证据缺席，不由ACK或发送意图推false/true，也不宣称Provider执行成功 |
| outcome | 同actualturn的公开settled.detail.outcome，限completed/failed/aborted/timed_out，首有效终态保留，不解析summary/error/Error.name |
| sessionCurrent | 返回时sessions表仍为原entry，false可表示已替换；不证明新会话不存在，true也不保证Provider清理已全部结束 |

DeliveryOrigin分别记录这几类事实，直接send成功与拒绝都返回当时快照。source role/runtime或actualturn不匹配的事件不提供事实。重复clientID的不同实际turn仍独立，迟到旧终态不能借给新调用。未ACK、未知元数据仍字段缺席；真正failed/timed_out和原error保留，不把所有拒绝改成正常停止。

不等候终态、不加timer、不据中文错误猜中止。send先拒绝而consume尚未看到终态时，outcome可以缺席；随后现session:event仍携actualturn/clientMessageId及公开终态，UI要把reply与同轮事件合并，不能把字段缺席当failed或aborted。返回对象是不可追改的快照，迟到事件不会偷偷改变已返回结果。队列受理仍沿原queued语义，不伪造尚未建立的实际turn。

## 实施、验证与边界

源码实际只改session.ts；自有测试只在multi-runtime.test.ts新增7项：三种真实终态先到、send拒绝先到、同client不同turn、无ACK/错误文字不能造事实、旧handle更换、外国role/runtime拒关联、首终态不被重复记录改写，以及实际Window→Pipeline→Core request_choice停止链。真实Core用例验证旧决定expired、原handlecurrent、停止不重复prompt、下一次显式prompt成功，模型计数恰为2（停止轮1+显式后续1）。使用临时假环境/受控provider，不冒称在线Pi测试。

专项multi-runtime/p0-halt-and-images/operator-wiring共45/45；窗口角色全部23个授权单测文件214/214；npm run typecheck退出0，git diff --check通过。精确候选与命令输出见[新叠加证据](2026-10-15-stop-terminal-send-facts-evidence/manifest.json)。13份批准文档指纹不变，B/历史/C保存队列逻辑不改；旧final manifest与root所有red证据保留，不覆盖。

source最终可供UI合并reply/stream。真实应用不会热加载这些文件，root将完整重启后核对真实版本并复验普通待选择→停止→旧卡失效→已发送prompt不回填→原会话继续发送。本角色未操作用户窗口、真实凭据或目标项目，未代签GUI已通过。
