---
id: runtime-core-c1-implementation
type: change
created: "2026-10-14"
status: verified
contract: ANS-RUNTIME-V2 revision 1
---

# 核心公共治理工具与会话记录已实现

**历史证据说明（C1R）：** 下述 21/21、typecheck 与哈希保留为原 C1 核心候选结果。随后 Model/tools 增加客户回调取消上下文，且共享凭据注册表加入 CODEX_ACCESS_TOKEN，原候选证据已被变化的依赖取代，不能代表当前代码；当前结果见 [C1R 修复](../fix/2026-10-14_fix_customer-input-cancellation.md)。

用户入口的连接由编排和桌面窗口迁移；它们现在可调用 `src/service/runtime/session.ts::createRuntimeAdapter`，选择指定 runtime，并把统一门禁、客户通道和报告能力装进该引擎。原来公共类型/工具归 Pi；现在唯一中立契约归 `src/model/runtime.ts`，公共工具由 `src/provider/runtime/tools.ts` 执行，schema 归同目录 schema，ANS 隔离记录归 session-store。Pi 的旧 API facade 与生产重复实现删除由 P1 属主接续，核心没有编辑其路径。

代码完成 C1，尚未部署；真实 SDK 和 CLI/桌面用户路径的最终整合验证仍待原属主/测试角色完成。当前行为见 [核心功能](../feature/runtime-core.md)，实施依据与独立影响评估见 [C1 设计](../design/2026-10-14_design_runtime-core.md)。本角色固定为运行时核心，没有角色切换、边界扩张、提交、推送、真实模型请求或真实 .env 写入。

## 原始验证结果

- 基线 HEAD：`906abd3ee275cba82b2f9e54ceef1cd9473c2d5c`；本角色候选是下列未提交新增源码与测试。共享文件由项目管理同时维护，单独列依赖哈希。
- 环境：Node `v24.14.0`，macOS arm64，TypeScript `7.0.2`；测试仅临时目录与 fake env 键，工厂为 SDK-free 注入替身。
- `node --test 'test/runtime-core/**/*.test.ts'`：最终 **21 passed / 0 failed / 0 skipped**，exit 0。四份测试/夹具实际覆盖 Model/schema、Provider 与 Service 组合。前序 15、18、19、20 项阶段测试也通过；后续新增停止与目录校验用例在最终 21 项重新运行。
- `npx tsc --noEmit`：最终 exit 0；npm 输出既有 ELECTRON_MIRROR / ELECTRON_BUILDER_BINARIES_MIRROR user-config 提醒，无编译错误。初次核心 fs-write 的 optional signal 尚无共享 API 时出现类型错误，PM 加入真实 shared API 后消除；新增 hanging-abort 测试曾因 `void|Promise` 入 assert.rejects 类型不符，改为 Promise.resolve 后重新运行并通过。没有删除断言或放宽权限。
- `git diff --check` 与自有新增 TS 的尾空白检查通过。导入审阅：Model 只有类型/共享值的 type-export，无 SDK/运行层调用；Provider 只用 Model、shared 与本角色 common；Service 只组合公开 Provider 并用本角色框架辅助；没有 peer-provider 或他人 private common 导入。
- 所有本角色改动路径均落在已加载 boundary Section 1 的五个精确源码或自有 common/test/docs/API 范围。工作区同时存在他人的治理/共享改动，未吸收到本角色候选。

关键观察是 gate deny/throw/在 gate 内 abort 都不会创建目录/文件，write/edit 保留 BOM/CRLF，symlink 逃逸拒绝；真实 shell deny/throw/超时不执行，allow 才 spawn argv，SIGTERM 被忽略时再 SIGKILL 阻止 400ms 延迟写；固定及实际配置的自定义凭据名从真实子进程 env 剥离。客户等待超过 prompt 时限仍保持等待，abort 后 late confirmed 不变成同意，下一轮可继续。原生 abort 挂住时一次请求、一秒内拒绝、当前会话隔离。报告/派发回执诚实，旧 metadata 只有 turnId 时保留逐字段兼容。

存储观察：构造和 read/validate 不创建 .ans；角色/runtime 索引与回放独立；native symlink 在 SDK bind 前拒绝；并发 append 没丢条目；损坏索引在 native bind 分配前失败；损坏回放明确报行号。Service 保存 adapter 在 prompt 后确认的 recovered/native ID，绝不由 ANS replay 推断 resumed；图片附件不存入回放。SDK event top/detail turnId 与报告捕获 ID 一致，重复 SDK settled 收为一次明确 completed/failed/aborted/timed_out。暂时存储失败如实抛错，真正成功重试后下一轮可恢复。

这些结果不证明 Pi/Codex/Claude SDK native 能力或最终连接正确：对应 worker 必须调用注入的实际 handlers，传本轮原始 AbortSignal、落实 sequential 与暂停时限、调用 native 目录回调，并用官方/types 与自身合同测试验证恢复/停止。未运行在线模型轮次或 OS 全面沙箱。

## 核心候选身份

组合摘要（按路径、NUL、内容、NUL 顺序 SHA-256）：`572194d0a7e4dfd5d704daf2515b50533d845433ddea2c62923a970d9000ac06`。

| 核心源码/测试路径 | SHA-256 |
| --- | --- |
| `src/model/runtime.ts` | `8e19cb938ecdb1bcea7e26c9fbf74700129bb9ab8ad4f222155fef6090064a41` |
| `src/service/runtime/session.ts` | `5527dfd6a83d3f0341502ea8294a9644641f71ae264d5519ded83dc719fe4a7f` |
| `src/provider/runtime/tools.ts` | `b82d1ffaafe65baa1f047d17731ef365aa0058586ef17c14e96fe82545402ba5` |
| `src/provider/runtime/schema.ts` | `67df518e52b5821bba617db35eca375779353f86d24e80af8c98aa45ad9f51f0` |
| `src/provider/runtime/session-store.ts` | `9fbdd32e5bb9df0aea64f2c8ac58dbdf3a1b19bd30cd74ace44e3830294548a2` |
| `src/common/runtime-core/event-queue.ts` | `ac3afa2e42fe82c8c49cf574764ae0c69a32fa61380e01a90f21a3effed9538d` |
| `src/common/runtime-core/format-denial.ts` | `6906f6da4a75913072493fc9e5a4a4c2c6832af171806c95cbcaddd104f2d9e8` |
| `src/common/runtime-core/fs-write.ts` | `bc134fc5b803ca30fcf57fda2778420c4a07a73df52f6218080da8ce174eb438` |
| `src/common/runtime-core/timeout.ts` | `fc932d369a9abf82cba56c8e852f2f429f308c3b372edcc4722efb97ea129d61` |
| `test/runtime-core/fixtures.ts` | `be1619f77b3f277ca6917a10b4a06653122f46bf08dd7045ab90bf586bc74f22` |
| `test/runtime-core/session-store.test.ts` | `6251094f05e0f01ab35555f11e73e3f5778a88f38d40a94c489b58cab8b2c5b8` |
| `test/runtime-core/session.test.ts` | `bda888e8d855a14f823583d9b63246dab45610b30fc07b40dcab22e431b40351` |
| `test/runtime-core/tools.test.ts` | `d968a9ea78ea73e7fd1b3a4736b88bb8848a37206e1d3788c21f057d950d2825` |

本次只读共享依赖（不属于核心写集）：

| 依赖 | SHA-256 |
| --- | --- |
| `src/common/shared/runtime-shared.ts` | `c864310167013a4dfea67f89675789543af9e43692012dd511847d7ccdbc4634` |
| `src/common/shared/atomic-write.ts` | `dd51305f2126bca77c462a8db4f3f7effa83f0e9bde3bba765e396d64e5fcf15` |
| `src/common/shared/path-primitives.ts` | `e9915c756f35d70363d9c7d80912a1f7706583f597201b16a5d1de43a246834f` |
