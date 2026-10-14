---
id: pi-injected-runtime-p1-change
type: change
title: Pi 生产会话使用核心注入能力
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [pi-injected-runtime-p1, pi-runtime]
events:
  - date: "2026-10-14"
    kind: implemented
    summary: 迁移中立契约、工具注入与 Pi 原生恢复
  - date: "2026-10-14"
    kind: verified
    summary: 原185加新增14共199项Pi检查通过，当前全仓strict tsc通过
---

# Pi 生产会话使用核心注入能力

用户从 CLI/桌面选择 Pi 后，以前 Service 准备的公共工具还没有进入 Pi，Pi 自己另造一套治理工具。现在 `src/provider/pi/session.ts::createPiRuntimeAdapter` 接受中立 RuntimeProviderOptions，`real-adapter.ts::bindRole` 直接注册原注入定义，只把 JSON Schema、描述与执行模式转换成真实 Pi 工具。原 SDK signal、调用 ID 和 Service turn ID 保留；生产使用同一个交互闸。完整实际流程见 [Pi 当前功能](../feature/pi-runtime.md)，接口见 [API](../../api-spec.md)，设计及独立影响见 [P1 设计](../design/2026-10-14_design_pi-injected-runtime.md)。

原 gate factory overload、session.ts 类型路径、tools.ts 名称/helper 和 describeTool/toPiTool 旧输入保持兼容。所有共享处理器及 schema 只由核心维护。实际窄 edge 为 `provider/pi/tools.ts` 显式转出 Core public tools/schema，及 `common/pi-adapter/tool-compat.ts` 显式转出同一 public schema 供旧私有辅助测试；生产完整定义不调用按名称 lookup。没有扩大 Provider 平级调用许可，也没有导入他人 private common。

生产 native builtin 关闭，发现其他扩展关闭，执行前名称白名单拒绝未注入工具，构造后复核实际 active tool names。注入定义在会话建立前固定，避免异步构造和未来输入修改改变正在运行的工具。原 write/edit/确认的 sequential 及真实 SDK批执行回归全部保留。

Pi native 使用 storage 注入的精确 `.ans/sessions/<role>/pi/native/`，read前validate、persist前prepare；native无档才读Pi旧角色目录直接JSONL，先复制到native再SDKopen，旧档不append。有效context+SDK构造成功才resumed；坏档重建recovered+warning；其他runtime目录不解析。Service保存实际fresh/resumed/recovered和native ID，ANS回放始终独立，桌面旧同名词汇要按API显式转换。

production native abort每轮共享一次，900ms失败上抛并隔离；空闲stop不动旧轮。首次明确失败/超时/中止固定，cleanup reject不改名，promise结果已知后恰一settled。legacy direct生命周期helper保留原夹具默认行为，不据此宣称生产可以缺signal或旧轮许可继续有效。

## 原始验证与覆盖

生产者：本固定 Pi适配器上下文。基线 HEAD `906abd3ee275cba82b2f9e54ceef1cd9473c2d5c`，工作区含其他属主并行候选；本角色没有修改这些文件。环境 Node v24.14.0、TypeScript 7.0.2、macOS arm64。SDK实际安装 `@earendil-works/pi-coding-agent@1.1.0`；版本/manifest归装配，未编辑。

- 最终命令 `env ANTHROPIC_AUTH_TOKEN=pi-offline-tests-placeholder node --test 'test/pi-adapter/*.test.ts'`：**199 passed / 0 failed / 0 skipped，exit 0**，约9.47s。原185项保留，新增14项位于 `injected-runtime.test.ts`。`log-noise.test.ts` 只把私有构造夹具改为中立注入输入，保留显式32768及全部原断言；没有删除或放松用例。
- 新增测试穿过真实 Pi SDK/createAgentSession、实际工具execute/hook及核心Service，provider仅为包内faux/in-memory、控制型清理夹具；覆盖注入任意schema/描述/模式/原handler，精确信号引用，strict工具白名单和activeNames，共享gate暂停250ms deadline等待400ms仍有效，中止旧客户signal跨下一轮仍失效，同轮一个terminal，原生恢复/旧档迁移/坏档recovered/目录和文件symlink拒绝，Service保存实际metadata及runtime隔离回放。
- 迁移时限测试用旧env45.9ms→45与构造5000ms，Core outer/Pi inner共同用注入值；实际超时后native仅abort一次，最终恰一个timed_out。清理不响应测试约900ms如实拒绝，两次stop只触发一次nativeabort，下一轮被隔离。
- `./node_modules/.bin/tsc --noEmit`：**exit 0，全仓strict当前通过**。`git diff --check`（Pi源/测试/本角色资料）通过；Production real无Core Provider、Service/Pipeline、peer adapter/private common import，只有已声明schema兼容转出edge。
- 原sandbox首轮185项为179pass/6fail：五项Core外包装抹掉必要中止语义已由原属主C1P修，Pi断言未改；剩一项127.0.0.1 listen EPERM。第二轮196项为195pass/同一EPERM。受管本地回环单项复跑1/1成功（800ms设定，约808ms中止），最终同样受管权限全套199/199。自动批准没有拒绝记录。没有把sandbox失败当跳过。
- 新增迁移时限最初13/14暴露Core outer超时被late内层cleanup终态改写：初为failed，Pi先固定自身明确中止后变为aborted；Core C1O锁住outer决定后为准确timed_out。原失败assert保留并最终通过，不以宽松断言抹平竞态。

没有真实模型/外网API请求，没有真实.env/持久凭据读写，没有提交/推送/部署。Pi自有验证不替代装配CLI默认工厂、桌面映射与测试角色的最终合并验收。

## 精确候选与依赖

本角色全部TypeScript源/测试按路径字典序，以“路径UTF-8、NUL、内容、NUL”累加SHA-256；42个文件的合成指纹：`58d888c4b34e0c4aa610908549b91599f8e608f5b0ab1d622b4a53bc00e9a152`。文档不参与这个源码指纹；以下是原文件列表。

| 路径 | SHA-256 |
| --- | --- |
| `src/common/pi-adapter/event-queue.ts` | `393b2e1baeedbf39ecc8e9125237c25fe110b4d868c52ee463939aad7d513d2b` |
| `src/common/pi-adapter/format-denial.ts` | `f58e8e983e20a493f03b3730e21f7b98407dc5f2e69370dd88e8852b92f02e3d` |
| `src/common/pi-adapter/fs-write.ts` | `0f327d3cdf8602ecf07621f9a7ec54db60b3628e0f9d9ed03a7643b59f0d8e81` |
| `src/common/pi-adapter/lifecycle.ts` | `2b578cb33a07d41ac27140fb612aea00def06f9fc21f79b038dfe7961ba0263a` |
| `src/common/pi-adapter/logger.ts` | `adf9ac58f5212027e1a22f05203ce3524726eb7a6f7b81912cac88817accccb3` |
| `src/common/pi-adapter/native-session.ts` | `e082f2d79640c7aa24df5f2c50e5d56dfa51659a595d8c79a41e2976b98f5d1e` |
| `src/common/pi-adapter/provider-config.ts` | `b145f315b4f781d725c2d05ebf335c09870e964c328d675fb5ff8397a34b2a88` |
| `src/common/pi-adapter/real-adapter.ts` | `e4f3490c56017dcab40c13c1da248d704c17cc1f44efbd5920da5205451bd05e` |
| `src/common/pi-adapter/settings.ts` | `c8064d11aca897a80a58899d28e63aca4a825de6713763d4298fb33e79ee3081` |
| `src/common/pi-adapter/timeout.ts` | `dfc5f0922f2f08953032c50a879fab4251ab956efef88d19a035379e483e1c50` |
| `src/common/pi-adapter/tool-compat.ts` | `4086a102aaea1c1d66d91256b68fde33c379ff177d976151f34cefc1de890016` |
| `src/provider/pi/session.ts` | `62633997b102feec52f477d104ae8b835062982356cad763306dd6db40816d3a` |
| `src/provider/pi/tools.ts` | `7c6501431f0cef76e44843fb02739aa8c25a8beb18e7f8084011798304cd1d00` |
| `test/pi-adapter/abort.test.ts` | `6f1d39f5911f109d9f704aa6da8fedfa8eab8032782a0ab58b7b644566413810` |
| `test/pi-adapter/customer-input.test.ts` | `5fdcd1a1b4d267ea544bd3c1d619e277b9c5c846d0b018b202fa880b44cc33e5` |
| `test/pi-adapter/customer-wait-end-to-end.test.ts` | `47175efaebe5732cefdff811a6ef0fa39b24ccaf26b8c6b6d49af7515fe20f60` |
| `test/pi-adapter/diagnostics.test.ts` | `3842959cfbc7485af879e6dbf2adef3b9b1790b70aa6ff89a9c0f11c552807f6` |
| `test/pi-adapter/dispatch-task.test.ts` | `c1e34a8df1d76354032f116beef19d9548e87bacb750584c8974d8dbbbf6e663` |
| `test/pi-adapter/fake-adapter.test.ts` | `32c28ed1d46b534802af03079c34b61c2034cade46df3f756b5597c6539ef51c` |
| `test/pi-adapter/finalize-bootstrap.test.ts` | `cf22c63838d23b79805fa7cdd2395be236b68855546e27f13abff60bd6189ea3` |
| `test/pi-adapter/fixtures.ts` | `e1e8661355a6be062b9cdf9c439ae4d298d6558846a13f471c3b7ab85ecca487` |
| `test/pi-adapter/injected-runtime.test.ts` | `318b4b9935bdbb273d3707a1d557365c43a352dfda9cd14ac8a7cc8c6b102a7e` |
| `test/pi-adapter/interaction-gate.test.ts` | `bbef94261c4d3d43d76552056b211f49728c445c951205fa3a3f04b20b0e4cab` |
| `test/pi-adapter/interactive-execution-mode.test.ts` | `0b421e4c00ffba53a9e610698ad12a980897ef9fd267e6659dcd627fb11123a0` |
| `test/pi-adapter/log-noise.test.ts` | `be8afb5d3f319befdc1abc974cf08a64a26cd6bf438d3a8bbdf55bef93f90a94` |
| `test/pi-adapter/prompt-images.test.ts` | `ecae29dcdd025a5cd096891205ea766a7c1b0fd2a20f41d71e997fb201544f2d` |
| `test/pi-adapter/provider-config.test.ts` | `f941800bc91d1be39e13d3dd500338e638f7a343ff3eaa128845344e2637a717` |
| `test/pi-adapter/real-adapter.smoke.test.ts` | `11c3e9b830ac0466e9118a719f5f0f6abd65956c5fb73d24948dc9d5a4c39dcc` |
| `test/pi-adapter/real-adapter.timeout.test.ts` | `7200661ae7a2fd150bcf88ea9fe5230ab7ef3e76978dad0162c3482f754637d7` |
| `test/pi-adapter/run-shell.test.ts` | `e27788e73e6c1036ac73cf5d316442c6ec398228b2ab4f2c729bfb0a79ff4d22` |
| `test/pi-adapter/runtime-outcome.test.ts` | `47311cf6e9fee0e080bf76266adc94464a3a1057e6a060a3e59bcdb8f4cd27b7` |
| `test/pi-adapter/session-persistence.test.ts` | `3f32d2fb8e1cc5ce0c24329b2b3e85952d7ec081f2f8641aaf5c3539162ddc21` |
| `test/pi-adapter/settings.test.ts` | `ecc6efc362feb1d5edccf36ea5f1eb5fc5f8ea7fe95388b3c29686d1fcf9ddc7` |
| `test/pi-adapter/settled-once.test.ts` | `5d259c6b17f7db4f9739b6d327cdcd0ea5c56a45560465615c101721502dcd43` |
| `test/pi-adapter/shell-verdict.test.ts` | `72c789a1d1d5c7918d00f1ef215c221a0207676e261244a7100e5cd57ace66d6` |
| `test/pi-adapter/shell-wait-lifecycle.test.ts` | `315ca33333e522848fd1eb24b52033c591432cf8055f11a41b09fe7f1733ea55` |
| `test/pi-adapter/submit-report.test.ts` | `6e104bec8fe3ddc5607e1678027b4edd4fea6c8933fdffb608e6f797df37685e` |
| `test/pi-adapter/timeout.test.ts` | `756fa2f998b726dcfd3289ae28db85af72d9b488c34438cbef587722611329bd` |
| `test/pi-adapter/tools.test.ts` | `df95b469f0ab2cbd14c7e0afa5dae5e0a7ca789358e264d07501634a8eb25f9c` |
| `test/pi-adapter/wire-compat-and-legacy.test.ts` | `483985e282b24212c1e0fd896375bc1ff3fbddedc9d2ce76811acdf9ea638d9c` |
| `test/pi-adapter/wire-probe.ts` | `0351ade21627f009231c8ac341378df51a59a4cae2404148fadd55bc4006773e` |
| `test/pi-adapter/write-sequencing.test.ts` | `37359d87fe4b0f77716f0d21a9dac6c86b11938f4733a636e5ce96bbe9caeda6` |

只读关键共享契约/核心依赖当前指纹（归各原属主，变更后Pi证据需要重测）：

| 路径 | SHA-256 |
| --- | --- |
| `src/model/runtime.ts` | `a0e2b0686cf90f76d1736fa6219f3add89ae32c5e485b850a1deab18e2d3eee8` |
| `src/service/runtime/session.ts` | `800079b88c4a229b24c91b2ff97e218a87ba10254db6e50b489f28b99b12ce1f` |
| `src/provider/runtime/tools.ts` | `752382a5c709893f7331e5cb1a1f2aee2d23f8cd9f7c055f40680f2c3dc958b3` |
| `src/provider/runtime/schema.ts` | `67df518e52b5821bba617db35eca375779353f86d24e80af8c98aa45ad9f51f0` |
| `src/provider/runtime/session-store.ts` | `9fbdd32e5bb9df0aea64f2c8ac58dbdf3a1b19bd30cd74ace44e3830294548a2` |
| `src/common/runtime-core/timeout.ts` | `e73a2c76ede16499c1f7da54725206eef63080fa5e76e33ef8f168c9587bbb47` |
| `src/common/shared/runtime-shared.ts` | `fcaa56d7d5e952dc1092b84e34875719d0e2943ae2b00e8ca14b1217b343f9da` |
| `src/common/shared/atomic-write.ts` | `dd51305f2126bca77c462a8db4f3f7effa83f0e9bde3bba765e396d64e5fcf15` |
| `src/common/shared/path-primitives.ts` | `e9915c756f35d70363d9c7d80912a1f7706583f597201b16a5d1de43a246834f` |
| `src/common/shared/diagnostics.ts` | `acd54eb0064dee857e1a14255cc7b59817a979cd34a7825134d9f35eb68f98f4` |
