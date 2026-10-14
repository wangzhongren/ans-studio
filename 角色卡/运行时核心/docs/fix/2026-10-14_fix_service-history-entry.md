---
id: runtime-core-c1h-service-history
type: fix
created: "2026-10-14"
status: verified
contract: ANS-RUNTIME-V2 revision 1
---

# 编排经 Service 读取公共会话历史

**后续候选说明（C1T）：** 本记录的 24/24、当时全仓失败及哈希保留原样。后续 Service/本角色 timeout helper 修改 Pi 有效时限后，当前组合结果见 [C1T](2026-10-14_fix_pi-effective-timeouts.md)；历史读取 API 和实现保持原样。

O1 的 `readRoleSessionHistory` 已冻结为 Pipeline 到 Service 的调用，但 `src/service/runtime/session.ts` 尚无对应 operation，实际新测失败为 `service.readRuntimeSessionHistory is not a function`。已有 Provider 的读取实现足够，不需要另一份存储。

本固定角色按项目管理 C1H 授权，在现有 Service 精确文件增加 `readRuntimeSessionHistory({projectRoot,roleId,runtime})`，调用已有 `src/provider/runtime/session-store.ts::readRuntimeSessionHistory`，只返回 Model 形状 `{record?,entries}`，不把 Provider capability 对象直接转出。客户元数据和写入/停止行为保持 C1R 契约。

Mutation Contract 仅该 Service 文件、`test/runtime-core/session.test.ts` 与本角色 API/功能/历史记录。新测试通过 Service 入口读取临时 Provider fixture，确认精确角色/runtime 的原生状态与 ANS 回放，其他 scope 返回空。核心测试命令 `node --test 'test/runtime-core/**/*.test.ts'` 和核心严格类型检查；全仓未装 SDK 的限制照实记录。原 C1R 23 项结果保留历史，Service 变化后重新验证当前候选。

当前核心 operation 已实施与验证，编排/桌面完整接线由对应属主重测。功能见 [核心功能](../feature/runtime-core.md)，前序证据见 [C1R](2026-10-14_fix_customer-input-cancellation.md)。


## C1H 当前原始证据

本次只改核心 Service 的历史 operation、核心 session 测试和自有文档。Model、C1R metadata、工具、schema、store 没有再改；不增加权限/存储实现，也不编辑其他角色源、package、.env 或 Git。

- 环境：Node v24.14.0 / TypeScript 7.0.2 / macOS arm64，基线 HEAD 906abd3ee275cba82b2f9e54ceef1cd9473c2d5c；全部临时目录、无在线模型。
- `node --test 'test/runtime-core/**/*.test.ts'`：当前 **24 passed / 0 failed / 0 skipped**，exit 0。新增 Service-entry 测试读取 Provider fixture 的精确 Model record/replay，跨角色/runtime 读为空；空目录读取不建 .ans。原 C1R 23 项也在同一次执行重新通过。
- `./node_modules/.bin/tsc --noEmit --project /private/tmp/ans-runtime-core-c1r-fl_60ub8.json`：exit 0；仅 include 核心源码/测试图，extends 原始 strict tsconfig，不修改检查策略。
- `npx tsc --noEmit`：**exit 1，未通过**。Claude 属主 src/common/claude-adapter、src/provider/claude 与 test/claude-adapter 缺 @anthropic-ai/claude-agent-sdk、zod、@modelcontextprotocol/sdk 及相关 implicit-any；另外 `test/编排/runtime-orchestration.test.ts:286` 的 audit.write fixture 返回 Promise<void> 而非 Promise<ShellAuditOutcome>（TS2322）。原样交项目管理路由 O1/装配，没有修 peer，也没有把核心范围检查说成全仓通过。
- `git diff --check` 与两个实际变更 TS 的尾空白/foreign Pi-private 引用检查通过。Service 是自己的 operation，通过合法相邻 Provider 调用得到 Model 值；没有 reexport Provider capability 对象或第二份读取实现。

原 C1R 23/23 与哈希保留在 [C1R](2026-10-14_fix_customer-input-cancellation.md)，已增加后续 Service 候选说明。最终 O1 与桌面历史的入口连接仍需要对应原属主及独立测试的当前证据。

14 个核心源码/测试合成摘要（路径、NUL、内容、NUL，按下列顺序 SHA-256）：`c8ab07c8e55d4c321594f2625b16bfc1359a08af654cd58a73a205aff75683a1`。

| 路径 | SHA-256 |
| --- | --- |
| `src/model/runtime.ts` | `a0e2b0686cf90f76d1736fa6219f3add89ae32c5e485b850a1deab18e2d3eee8` |
| `src/service/runtime/session.ts` | `90a0142e9e8b1af8e9ee355e874111fc44903789c07978c973eac4c6b00bb00b` |
| `src/provider/runtime/tools.ts` | `7b4e5a7975e7733634c6deffd1ac97b0b54b33429010f117d552dd69b12bf245` |
| `src/provider/runtime/schema.ts` | `67df518e52b5821bba617db35eca375779353f86d24e80af8c98aa45ad9f51f0` |
| `src/provider/runtime/session-store.ts` | `9fbdd32e5bb9df0aea64f2c8ac58dbdf3a1b19bd30cd74ace44e3830294548a2` |
| `src/common/runtime-core/event-queue.ts` | `ac3afa2e42fe82c8c49cf574764ae0c69a32fa61380e01a90f21a3effed9538d` |
| `src/common/runtime-core/format-denial.ts` | `6906f6da4a75913072493fc9e5a4a4c2c6832af171806c95cbcaddd104f2d9e8` |
| `src/common/runtime-core/fs-write.ts` | `bc134fc5b803ca30fcf57fda2778420c4a07a73df52f6218080da8ce174eb438` |
| `src/common/runtime-core/timeout.ts` | `fc932d369a9abf82cba56c8e852f2f429f308c3b372edcc4722efb97ea129d61` |
| `test/runtime-core/customer-input-context.test.ts` | `d1228008a479a84daa61dddd0d118d8df591b7884b33caf1edf314a2ba076602` |
| `test/runtime-core/fixtures.ts` | `be1619f77b3f277ca6917a10b4a06653122f46bf08dd7045ab90bf586bc74f22` |
| `test/runtime-core/session-store.test.ts` | `6251094f05e0f01ab35555f11e73e3f5778a88f38d40a94c489b58cab8b2c5b8` |
| `test/runtime-core/session.test.ts` | `3f1f7c672c894818fca9a6d2a1a454358415ab3efca72727fc24c5f8a21fa96d` |
| `test/runtime-core/tools.test.ts` | `4c8a41cda1cffc5a6024a3041b19ad3c281480e5e732f30432205bc0a2d26a23` |
