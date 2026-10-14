---
id: runtime-core-c1t-pi-timing
type: fix
created: "2026-10-14"
status: verified
contract: ANS-RUNTIME-V2 revision 1
---

# Pi 内外两层使用相同有效时限

**后续候选说明（C1P）：** 本记录的 28/28、当时 whole typecheck通过及hash保持历史；公共tools修复工具专属停止失败文案后，当前组合证据见 [C1P](2026-10-14_fix_tool-abort-failure-messages.md)。有效时限契约/实现保持原样。

新 Service 外层在未传 timeout option 时固定 120000ms，而既有 Pi 会读取 `ANS_PI_PROMPT_TIMEOUT_MS` 与 `ANS_PI_CONSTRUCT_TIMEOUT_MS`。用户已有环境配置为 300000ms 时，内层允许继续、外层却在两分钟中止。这是已批准迁移中的实际兼容缺口，C1T 已由项目管理同范围授权。

只读核对 `src/common/pi-adapter/timeout.ts::readTimeoutMs` 与 `real-adapter.ts`：显式 option 使用 `??` 优先，不重新校验或 floor；env 缺失/空白/非有限/非正时回退 120000ms，有限正数才 floor。显式 0/负数/NaN 等值保留原行为，由既有 timer helper 判断不加时限。核心已有自己的 SDK-free timeout helper，直接沿同一现有规则计算，禁止导入 Pi private common。

计划在 `src/common/runtime-core/timeout.ts` 增角色私有有效时限函数，Service provider composition 时计算一次，将同一 cooked values 放入 RuntimeProviderOptions，并让外层 construct/prompt 使用该 provider options。其他 runtime 保持显式值或 120000ms 默认，不读取 Pi 环境变量。现有 AbortSignal.any 正确组合传入原始 call.signal 和会话本轮信号，本次保持原样，不加 provenance 概念。

Mutation Contract 只改上述私有 helper、已授权 `src/service/runtime/session.ts`、`test/runtime-core/**` 与自身 API/功能/历史文档；Model、客户 metadata 和历史入口保持原样。验证用真实 Service 注入 Provider、短运行 prompt 和被记录的实际 setTimeout 调度参数，证明环境 300000ms 同时到内外、explicit 覆盖、非法 env 回退、显式非法保持以及非 Pi 默认不变，不等待数分钟。

验证命令为 `node --test 'test/runtime-core/**/*.test.ts'`、`npx tsc --noEmit` 和当前结构检查。前序 C1H 24/24 与哈希保留为历史，时限 helper/Service 改变后重新验证当前候选。功能见 [核心功能](../feature/runtime-core.md)；旧记录见 [C1H](2026-10-14_fix_service-history-entry.md)。当前核心实现与规定验证已完成，Pi 真实 SDK 消费方的迁移证据由 P1 属主提供。


## C1T 当前原始证据

实际变更为 `src/common/runtime-core/timeout.ts::resolveRuntimeTimeouts`、`src/service/runtime/session.ts` 的内外同值使用、新增 `test/runtime-core/effective-timeouts.test.ts` 与自有 API/功能/历史文档。Model/C1R/C1H保持原样，未改其他角色/真实.env/package/Git，也没有调用在线模型。

- 环境：Node v24.14.0 / TypeScript 7.0.2 / macOS arm64；基线 HEAD 906abd3ee275cba82b2f9e54ceef1cd9473c2d5c。
- `node --test 'test/runtime-core/**/*.test.ts'`：当前 **28 passed / 0 failed / 0 skipped**，exit 0。前序24项全部重测通过，新增4项时限测试。
- 新测试用被记录的真实 `setTimeout` 调用与注入 Provider 参数验证：Pi env 300000.8/310000.9分别floor为300000/310000，两个实际外层timer与两个Provider选项相同，未调度120000；显式400000/410000优先，显式0/-1不调度时限；无效env回退、正小数floor及显式NaN/Infinity/负/0/小数原样保留；demo/Codex/Claude不读取Pi env，两个外层timer与Provider均为120000。所有工厂/轮次立即结束，计时器会清理，未等待120秒或300秒。
- `npx tsc --noEmit`：当前 **exit 0**（工作区SDK依赖现已由装配安装；npm仅既有ELECTRON_MIRROR/ELECTRON_BUILDER_BINARIES_MIRROR配置提醒）。C1H当时未安装依赖/编排test类型错误的失败证据保留历史，不改写为当时通过。
- `git diff --check` 与实际3个变更TS的尾空白/foreign Pi-private引用检查通过。核心不导入Pi private helper：仅只读对照其已有parsebehavior，本角色现有timeout helper提供实际实现。
- 只读核对 Service handler 仍采用 `AbortSignal.any([本轮controller.signal, call.signal])`，没有替换原始call.signal，本次没有追加provenance机制或修改取消契约。

这些结果证明Service时限兼容和既有核心行为；PiP1仍须提供迁移实际SDK消费相同选项的自身证据。原C1H24/24和hash保留在原fix记录，并标出后续候选说明。

15个核心源码/测试合成SHA-256（路径、NUL、内容、NUL，按下列顺序）：`fb68e652d5f15d66f95b79abcf25b4634307525418a84a596ae275871ca8a312`。

| 路径 | SHA-256 |
| --- | --- |
| `src/model/runtime.ts` | `a0e2b0686cf90f76d1736fa6219f3add89ae32c5e485b850a1deab18e2d3eee8` |
| `src/service/runtime/session.ts` | `0dce396ef040a4d4935c175f267280772609da4e1130477055d72a25166d2cd3` |
| `src/provider/runtime/tools.ts` | `7b4e5a7975e7733634c6deffd1ac97b0b54b33429010f117d552dd69b12bf245` |
| `src/provider/runtime/schema.ts` | `67df518e52b5821bba617db35eca375779353f86d24e80af8c98aa45ad9f51f0` |
| `src/provider/runtime/session-store.ts` | `9fbdd32e5bb9df0aea64f2c8ac58dbdf3a1b19bd30cd74ace44e3830294548a2` |
| `src/common/runtime-core/event-queue.ts` | `ac3afa2e42fe82c8c49cf574764ae0c69a32fa61380e01a90f21a3effed9538d` |
| `src/common/runtime-core/format-denial.ts` | `6906f6da4a75913072493fc9e5a4a4c2c6832af171806c95cbcaddd104f2d9e8` |
| `src/common/runtime-core/fs-write.ts` | `bc134fc5b803ca30fcf57fda2778420c4a07a73df52f6218080da8ce174eb438` |
| `src/common/runtime-core/timeout.ts` | `e73a2c76ede16499c1f7da54725206eef63080fa5e76e33ef8f168c9587bbb47` |
| `test/runtime-core/customer-input-context.test.ts` | `d1228008a479a84daa61dddd0d118d8df591b7884b33caf1edf314a2ba076602` |
| `test/runtime-core/effective-timeouts.test.ts` | `c79e52b9008953f7735b07759336d3df6ff19559a900065623162350dfb16520` |
| `test/runtime-core/fixtures.ts` | `be1619f77b3f277ca6917a10b4a06653122f46bf08dd7045ab90bf586bc74f22` |
| `test/runtime-core/session-store.test.ts` | `6251094f05e0f01ab35555f11e73e3f5778a88f38d40a94c489b58cab8b2c5b8` |
| `test/runtime-core/session.test.ts` | `3f1f7c672c894818fca9a6d2a1a454358415ab3efca72727fc24c5f8a21fa96d` |
| `test/runtime-core/tools.test.ts` | `4c8a41cda1cffc5a6024a3041b19ad3c281480e5e732f30432205bc0a2d26a23` |

当前只读共享/装配依赖输入（非核心写集）：

| 输入 | SHA-256 |
| --- | --- |
| `src/common/shared/runtime-shared.ts` | `fcaa56d7d5e952dc1092b84e34875719d0e2943ae2b00e8ca14b1217b343f9da` |
| `src/common/shared/atomic-write.ts` | `dd51305f2126bca77c462a8db4f3f7effa83f0e9bde3bba765e396d64e5fcf15` |
| `src/common/shared/path-primitives.ts` | `e9915c756f35d70363d9c7d80912a1f7706583f597201b16a5d1de43a246834f` |
| `package.json` | `a3ea68c320c1421fe3c132952a60835995203da0ef62003422b1444f54b9986c` |
| `package-lock.json` | `38b2f2da801bcc0980ecdcdb146f5a723c374cf0a3795e7e16121efced45b749` |
