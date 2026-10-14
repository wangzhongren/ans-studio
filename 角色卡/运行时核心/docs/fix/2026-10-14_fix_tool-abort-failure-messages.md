---
id: runtime-core-c1p-abort-message-compatibility
type: fix
created: "2026-10-14"
status: verified
contract: ANS-RUNTIME-V2 revision 1
---

# 停止时保留各工具的失败含义

**后续候选说明（C1O）：** 本记录31/31、whole typecheck与hash保留历史。后续Service增加外层既定结论优先级，组合当前证据见 [C1O](2026-10-14_fix_outer-terminal-outcome.md)；本工具失败文案实现保持原样。

Pi P1 原属主跑既有185项回归时，公共 tools 的统一停止包装覆盖了 handler 已有的失败文案：确认应是“未获客户同意”，报告/审读是“未能交回”，派发是“未能派发”，shell在执行前被停止是“未执行”。五项兼容断言因此失败，断言未改；另一个loopback权限失败与本项无关。

本角色 C1P 在原 `src/provider/runtime/tools.ts` 的入口/await 后取消包装保留这些既有语义：入口中止返回各工具专属失败；await 后已有 `ok:false` 的真实失败保留，只有迟到 `ok:true` 才改为专属失败。这样不谎报同意、交回或派发成功，也不把实际启动后被中止的shell伪装成从未启动。写入/gate/权限/原始signal规则保持原样。

Mutation Contract 仅该公共tools源码、`test/runtime-core/**` 和自身API/功能/历史文档，无peer/依赖配置/.env/Git。新直接工具合同测试分别检查入口已中止和等待时中止的失败短语、`ok:false`、入口不调用注入能力；原28项重跑，并跑当前全仓typecheck。P1的185项原回归仍由Pi原属主重跑。

本项为已批准迁移中具体兼容修复，没有新增功能选装或权限变化。原 C1T28/28及hash保留历史；当前结果更新本记录。功能见 [核心功能](../feature/runtime-core.md)，前序证据见 [C1T](2026-10-14_fix_pi-effective-timeouts.md)。当前核心修复与合同验证完成，Pi全部185项回归由P1原属主重跑。


## C1P 当前原始证据

实际源码变化仅 `src/provider/runtime/tools.ts` 的专属 `abortedToolResult` 与统一包装两处分支；新测试 `test/runtime-core/abort-failure-semantics.test.ts` 直接调用六类公共实际handler。原有28项测试与所有Pi断言没有修改。其他Model/Service/schema/store/helper/C1R信号/C1H/C1T保持原候选。

- 环境：Node v24.14.0 / TypeScript 7.0.2 / macOS arm64；基线HEAD906abd3ee275cba82b2f9e54ceef1cd9473c2d5c；无在线模型/真实.env/package/peer编辑。
- `node --test 'test/runtime-core/**/*.test.ts'`：当前 **31 passed / 0 failed / 0 skipped**，exit0。先30项（原28+入口/等待两个合同）通过后，补迟到成功的直接branch合同并重新跑当前31项。
- 三个新增合同实际检查：preaborted六工具全部返回okfalse+各自失败短语且零能力调用；pending能力中止时实际handler文案保留、不出现旧泛化文案；confirmed/selected/report receipt/dispatch receipt成功到达时触发取消，包装仍返回对应okfalse失败，而非迟到成功。原真实shell中止/写前gate/确认旧signal测试在同轮回归通过。
- `npx tsc --noEmit`：当前 **exit0**，仅既有npm ELECTRON_MIRROR/ELECTRON_BUILDER_BINARIES_MIRROR user-config提醒。
- `git diff --check` 与实际两个源码/测试文件尾白/foreign Pi-private引用检查通过；没有跨角色common导入、权限变化、断言删除或gate放宽。

P1报告的179/185（五项本修复文案、另一个loopback EPERM）是其原属主前序原始证据，不作为核心通过结果。当前核心31/31不证明Pi185全部恢复，P1必须用相同保留断言重跑并单独处理loopback权限。原C1T28/28、whole typecheck与hash保留原fix并注明公共tools依赖后续变化。

16个核心源码/测试合成SHA-256（路径、NUL、内容、NUL，按下列顺序）：`df1eb3f7032d6554cef3bb2e307f1d71bfd6a34e85e2b291ed067cf5c4c2f756`。

| 路径 | SHA-256 |
| --- | --- |
| `src/model/runtime.ts` | `a0e2b0686cf90f76d1736fa6219f3add89ae32c5e485b850a1deab18e2d3eee8` |
| `src/service/runtime/session.ts` | `0dce396ef040a4d4935c175f267280772609da4e1130477055d72a25166d2cd3` |
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
| `test/runtime-core/session.test.ts` | `3f1f7c672c894818fca9a6d2a1a454358415ab3efca72727fc24c5f8a21fa96d` |
| `test/runtime-core/tools.test.ts` | `4c8a41cda1cffc5a6024a3041b19ad3c281480e5e732f30432205bc0a2d26a23` |
