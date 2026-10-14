# 保留历史行的真实轮次与事件类型

D1R，同 ANS-RUNTIME-V2 revision 1 的必要修复；沿用客户已批准的多运行时历史结果与开发授权，没有新功能或范围扩张。状态：窗口 metadata 修复及受影响单元已完成；UI合并与真实窗口验收待U1/T1。依据[管理冻结契约](../../../项目管理/docs/design/2026-10-14_design_multi-runtime-integration.md)末尾及[T1 原红复现](../../../测试/docs/fix/2026-10-14_fix_actual-main-live-history-duplication.md)：真实入口只有一个 Claude 输入/终态/回交，第一次非空历史却与实时内容叠加，18 项中 17 通过、重复保护断言失败。

窗口 `runtime-history.ts` 将 Core RuntimeReplayEntry 转成 ReplayRow 时丢掉顶层 turnId，并未提供 eventKind。UI 无法凭实际身份判断某历史行是否已显示，也不能安全区分两次同文输入。这两个字段属于只读呈现 metadata，不改变执行、上下文恢复、权限或存储。

本修复给窗口自己的 ReplayRow 增加可选 `turnId?:string`、`eventKind?:string`。用户行只复制 entry.turnId，不增加 eventKind；事件行 turnId 直接取 `entry.turnId ?? event.turnId`，eventKind 直接取 event.kind；工具 activity.turnId 使用同一有效 turnId，避免与顶层冲突。缺字段的旧 Pi JSONL 保持缺字段，不推造 ID。

窗口 mapper 当前逐事件保留行，没有 assistant_delta 合并步骤，本次不引入跨行压缩：同文本的不同 turnId、相邻 assistant_delta 事件均保留原 ID 和次序。UI 属主若在自己的呈现步骤合并 delta，只能合并同一 turn/eventKind 并保留权威字段，不能合并不同轮次；窗口不改 renderer。

写集仅 `app/desktop/runtime-history.ts`、`app/desktop/session-history.ts`（ReplayRow 类型）、已接受的 `test/桌面应用/multi-runtime.test.ts` 和窗口自有 API/功能/历史资料。Core/Model/storage、U1/T1 源码与测试只读。测试使用临时 ANS replay fixture，经真实 Pipeline 读取，不调用 SDK、真实 .env 或网络。

窄测试覆盖 user/assistant/tool 的原 turnId/eventKind、entry 优先于 event 的实际选择、工具 activity 一致、同文不同轮次及 delta 次序、旧 Pi 缺字段兼容。随后跑受影响窗口单元、strict tsc、scope diff 与候选哈希。D1 原 171 项证据保持历史；D1R 当前结果另记，实际重复保护仍由 U1 修复、T1 独立复测后判断。


## D1R-R1 实际验证与候选

生产者：桌面窗口，节点 D1R，契约 ANS-RUNTIME-V2 revision 1，范围与已接受 boundary.yaml 不变。修改的执行文件仅 runtime-history.ts 与 session-history.ts；新增行为断言只在既有 multi-runtime.test.ts。

- `node --test test/桌面应用/{multi-runtime,session-history,interface}.test.ts`：37/37，exit 0，无跳过；其中multi-runtime17/17包含本修复2项。直接经真实Pipeline读取临时ANS replay，证明user/assistant/tool turn/event身份、entry优先于event且activity一致、两个同文不同turn保留、连续assistant_delta不压缩、legacy Pi缺字段继续缺字段；旧target继承和请求锚点仍通过。
- `./node_modules/.bin/tsc --noEmit --pretty false`：exit 0，无输出。
- `git diff --check -- app/desktop/runtime-history.ts app/desktop/session-history.ts test/桌面应用/multi-runtime.test.ts 角色卡/桌面窗口`：exit 0。

原始[单元输出](2026-10-14_history-turn-metadata-tests.txt)、[类型输出](2026-10-14_history-turn-metadata-typecheck.txt)、[当前候选/消费依赖SHA-256](2026-10-14_history-turn-metadata-manifest.txt)。Node v24.14.0；临时假数据，无SDK或网络、真实env/凭据、Git写入。此前D1的171项与原manifest保持历史，本修复没有宣称全Window重跑。

Window metadata契约已实际就绪并经PM转U1。T1 原红18项17通过/1失败仍保留，不能把Window单元计作actualmain重复显示已解决；U1完成同turn合并后由T1续接独立复测。当前行为见[功能说明](../feature/multi-runtime-desktop.md)。
