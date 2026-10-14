---
id: runtime-core-c1o-terminal-priority
type: fix
created: "2026-10-14"
status: verified
contract: ANS-RUNTIME-V2 revision 1
---

# 超时结果不能被中止清理事件改写

**后续候选说明（C1A）：** 本记录33/33、whole typecheck与hash保留历史。后续Model/Service增加prompt实际开始的被动确认，当前组合证据见 [C1A](2026-10-14_fix_prompt-start-acknowledgement.md)；本结论优先级实现保持原样。

Pi P1 实际迁移测试让内外层同为45ms，外层先判 timed_out，随后 requestAbort 导致内层清理发出 settled aborted；`src/service/runtime/session.ts` 的事件pump无条件把外层结论覆盖成aborted。P1已保留该断言，当前13/14新测，原先内层failed优先级问题已由Pi属主修复。

C1O按项目管理同范围授权，只修核心Service的结论优先级：外层catch已经判定的本轮失败/中止/超时结果锁定，后续内层清理terminal不覆盖。未由外层强制结论的正常内层completed/failed/aborted/timed_out仍照实采纳。清理失败仍保留错误信息与隔离行为，每轮一个settled。没有改变时限、gate、权限或Pi测试。

Mutation Contract仅本Service源码、`test/runtime-core/**`及本角色API/功能/历史文档。增加真实Service race fixture：外层短超时触发abort、注入Provider的abort发出inner settled aborted，Service最终仍timed_out且只有一个settled。另验证主动停止后inner清理结果不能重写aborted。命令为 `node --test 'test/runtime-core/**/*.test.ts'` 与 `npx tsc --noEmit`；P1自己的真实Pi测试由原属主重跑。

当前核心修复与规定验证已完成，Pi实际迁移race由P1原属主重跑。前序C1P31/31/hash保留历史；Service变化后当前证据写本记录。功能见 [核心功能](../feature/runtime-core.md)，旧记录见 [C1P](2026-10-14_fix_tool-abort-failure-messages.md)。


## C1O 当前原始证据

实际生产变更只有Service内部Turn的outcomeLocked与outercatch/事件pump结论保护，公共类型/签名/timeouts/gate/tools/store不改。`test/runtime-core/session.test.ts`增加两个实际Service race fixtures，原31项与Pi原断言不改；没有peer/package/.env/Git/在线模型动作。

- 环境：Node v24.14.0 / TypeScript 7.0.2 / macOS arm64；基线HEAD906abd3ee275cba82b2f9e54ceef1cd9473c2d5c。
- `node --test 'test/runtime-core/**/*.test.ts'`：当前 **33 passed / 0 failed / 0 skipped**，exit0。原31项同次重新通过。
- 真实外层Service15ms超时后，Provider.abort发出两次inner settled aborted并结束prompt，pump在abort Promise返回前消费这些事件；最终1个settled outcome为timed_out，abort只调用1次，detail/top轮次相同。这一fixture直接覆盖先outer决策后inner cleanup改写的原竞态。
- 主动停止fixture让inner abort发出failed terminal再抛cleanup错误，Service最终1个aborted，denied事件保留cleanup fixture failed，下一轮仍因cleanup隔离被拒绝。原正常inner failed/其他outcome和boundedabort测例在同轮继续通过，没有隐藏清理错误或删断言。
- `npx tsc --noEmit`：当前 **exit0**，仅既有npm ELECTRON_MIRROR/ELECTRON_BUILDER_BINARIES_MIRROR user-config提醒。
- `git diff --check` 与实际Service/test两文件的尾白/foreign Pi-private引用检查通过。新增字段是私有轮次状态，不扩张角色或工具权限；公共Model/C1R/C1H/C1T/C1P合同形状保持原样。

P1之前实际13/14新tests的timed_out→aborted失败由其原属主报告，当前核心33/33不取代其真实SDK迁移race验证。Pi属主必须重跑它自己的原用例；原C1P31/31/typecheck/hash保持原记录并注明Service后续变化。

16个核心源码/测试合成SHA-256（路径、NUL、内容、NUL，按下列顺序）：`40a9e493254835d9d69bd272f8ff5e318b53f1273f7a87e914f7d54eb0719de8`。

| 路径 | SHA-256 |
| --- | --- |
| `src/model/runtime.ts` | `a0e2b0686cf90f76d1736fa6219f3add89ae32c5e485b850a1deab18e2d3eee8` |
| `src/service/runtime/session.ts` | `800079b88c4a229b24c91b2ff97e218a87ba10254db6e50b489f28b99b12ce1f` |
| `src/provider/runtime/tools.ts` | `752382a5c709893f7331e5cb1a1f2aee2d23f8cd9f7c055f40680f2c3dc958b3` |
| `src/provider/runtime/schema.ts` | `67df518e52b5821bba617db35eca375779353f86d24e80af8c98aa45ad9f51f0` |
| `src/provider/runtime/session-store.ts` | `9fbdd32e5bb9df0aea64f2c8ac58dbdf3a1b19bd30cd74ace44e3830294548a2` |
| `src/common/runtime-core/event-queue.ts` | `ac3afa2e42fe82c8c49cf574764ae0c69a32fa61380e01a90f21a3effed9538d` |
| `src/common/runtime-core/format-denial.ts` | `6906f6da4a75913072493fc9e5a4a4c2c6832af171806c95cbcaddd104f2d9e8` |
| `src/common/runtime-core/fs-write.ts` | `bc134fc5b803ca30fcf57fda2778420c4a07a73df52f6218080da8ce174eb438` |
| `src/common/runtime-core/timeout.ts` | `e73a2c76ede16499c1f7da54725206eef63080fa5e76e33ef8f168c9587bbb47` |
| `test/runtime-core/abort-failure-semantics.test.ts` | `c8a40efbe148e689a5aaad0d3f5a98b3ed8937194a2b46212d369fc4ceb38e99` |
| `test/runtime-core/customer-input-context.test.ts` | `d1228008a479a84daa61dddd0d118d8df591b7884b33caf1edf314a2ba076602` |
| `test/runtime-core/effective-timeouts.test.ts` | `c79e52b9008953f7735b07759336d3df6ff19559a900065623162350dfb16520` |
| `test/runtime-core/fixtures.ts` | `be1619f77b3f277ca6917a10b4a06653122f46bf08dd7045ab90bf586bc74f22` |
| `test/runtime-core/session-store.test.ts` | `6251094f05e0f01ab35555f11e73e3f5778a88f38d40a94c489b58cab8b2c5b8` |
| `test/runtime-core/session.test.ts` | `174f78df6ffcb837b79c461de72d7c44cf1cb9507fea587341a1f39fe124357f` |
| `test/runtime-core/tools.test.ts` | `4c8a41cda1cffc5a6024a3041b19ad3c281480e5e732f30432205bc0a2d26a23` |
