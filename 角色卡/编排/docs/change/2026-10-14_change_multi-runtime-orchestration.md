# 多运行时编排迁移与确认中止验证

角色执行与治理命令现在都能选择 demo、Pi、Codex 或 Claude，运行时构造走 Service 的统一受治理工具链。中止后的旧确认答复不再发行路径许可；下一轮未确认的实际文件写入仍被门禁拒绝。动态原生上下文属性与按角色/runtime 隔离的 ANS 回放通过 Pipeline 公开入口提供。

本记录属编排 O1、ANS-RUNTIME-V2 revision 1，同范围授权及独立影响见 [设计](../design/2026-10-14_design_multi-runtime-orchestration.md)，当前功能见 [运行时选择](../feature/runtime-selection.md)，内部契约见 [API](../../api-spec.md)。未部署、没有模型调用、没有读取/修改真实 .env、没有提交。

## 实际变化

CLI 明确解析四引擎并拒绝未知值，role run 默认 demo、govern 默认 Pi，显式参数优先。Pipeline 使用 Service 工厂，保留 Pi alias、旧 demo/custom factory 注入。真实引擎 readRoot/writeRoot/shellCwd 钉项目根；demo 默认只判定、不落盘。能力的角色条件保持，shell 审读沿源引擎且不持久化，未 arm 时无 shell 工具。

确认包装给前端原 metadata，并在 await 前保留原 signal 引用；issuer 在任何路径加入 writeSet 前检查它。此保护对直接注入回调同样成立，不依赖桌面卡或工具 raceAbort 能取消消费者 promise。回交使用真实 turnId/runtime，失败终局压过成功声明；CLI failed/aborted/timed_out 返回非0。

历史读取经核心 C1H 实际 Service 操作；不绕到 Provider，也不把 ANS 回放当模型恢复。contextSource/nativeSessionId/contextWarning 为实际句柄动态 getter，prompt 后更新。resumed=原生恢复成功，recovered=恢复失败重建；桌面需要显式转换其旧语义。

## 原始验证

环境：macOS、Node v24.14.0、仓库 TypeScript 7.0.2；当前可见 @anthropic-ai/claude-agent-sdk@0.3.299, @modelcontextprotocol/sdk@1.32.1, zod@4.6.7, @openai/codex@0.162.1；临时夹具假环境，fake external provider 经真实 Service 和 governed handlers，无在线请求。HEAD 基线 `906abd3ee275cba82b2f9e54ceef1cd9473c2d5c`，其他角色并行工作不是本角色候选。

| 层/检查 | 命令 | 实际结果 |
| --- | --- | --- |
| Pipeline/真实 Service 契约 | `node --test test/编排/runtime-orchestration.test.ts test/编排/session-*.test.ts test/编排/shell-*.test.ts test/编排/confirmation-gated.test.ts test/编排/handback-*.test.ts` | 159/159，exit 0 |
| Interface 与本角色回归 | `node --test test/编排/*.test.ts` | 238/238，exit 0；其中新增真实 Service 集16/16 |
| 本角色严格类型检查 | `node_modules/.bin/tsc --ignoreConfig --noEmit --target esnext --lib esnext --module nodenext --moduleResolution nodenext --strict --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax --erasableSyntaxOnly --isolatedModules --resolveJsonModule --types node src/interface/cli/run.ts src/interface/cli/govern.ts src/pipeline/orchestration/*.ts src/common/编排/*.ts test/编排/*.test.ts` | exit 0 |
| 全仓类型检查 | `npm run typecheck` | 最新 exit 0；初次缺依赖产生25项Claude诊断已消失。当前node_modules可见依赖，B0正常依赖清单/安装验收另行完成 |
| diff/结构 | `git diff --check`（本角色路径）与 import 扫描 | exit 0；运行时 Pipeline 无 Provider imports，本角色无 foreign private common imports |

新增测试具体观测四引擎在两命令到达正确 factory；非法选择零构造；实际项目根写入与 demo 零写；确认等待→中止→旧yes→下一轮write_file F4拒绝且文件不存在；Service top/detail/report/handback同turn；三个失败终局非0；role/runtime存储隔离；动态恢复属性与治理getter；shell-arming沿源runtime、verdict注册与无shell/无持久；选择失败不降级。没有skip、没有删除或放松旧断言。

本次仅迁移必要 runtime edges与公开类型；基线 private common 中 gate/收尾辅助的既存Service调用保持，不声称完成全仓五层清理。所有本角色 changed paths 都在 boundary.yaml 接受范围；Model/Provider/Service/shared/index/packages/app 均未修改。

## 待后继实际验证

B0 完成正常依赖清单与安装后须重跑全仓编译及默认 factory 的离线入口测试；P1 尚未迁移的旧 Pi 工厂不能据本测试称实际兼容。Codex 稳定CLI、Claude native hook与根入口/桌面接线由各原属主验证。上述16项使用真实统一工具链但隔离模型，不证明三引擎在线往返、SDK原生sandbox全面隔离或桌面完整流程。改动这些依赖后本角色消费者证据要重测。

## 本角色候选与路径

源/测试组合 SHA-256（按下表字典序拼 `hash  path\n` 再 SHA-256）：`90e3343607c6f53bed73f554d4a19949eb19a0a3eb0e9cf1f0b6d7444e58babf`。

| 路径 | SHA-256 |
| --- | --- |
| `src/common/编排/args.ts` | `163249811c856b60f9967aea1d074b323a6971965974b865e57abc62dc30dbe5` |
| `src/common/编排/confirmed-writes.ts` | `da8f80c4ba7ba31f1d02035394a700a566ada214b26798c19e9df9e65320080d` |
| `src/common/编排/finalize.ts` | `340a9364dc28509a8647b394865ada937bd080bddbf47b16d73d99731e33536c` |
| `src/common/编排/handback.ts` | `2bcd0a50583d9d1a13bf9671de6f342475d8d2af3e3a3fb32380891446bc8614` |
| `src/common/编排/operator-channel.ts` | `2f3c618fc8311800179b12a6570c745411d6ef2309486e25f851cc84824d82e2` |
| `src/common/编排/shell-audit.ts` | `a9dfa266896186fd667cda8ab1443f682714d235572c25082b26f630d1feef0d` |
| `src/common/编排/shell-deadline.ts` | `d9722b76a2fd6ee1418b57e210298935c5c2f01142b4820bb17b93f8fe1bc4bf` |
| `src/common/编排/shell-gate.ts` | `ee06654394f55e936cca4fe3b76212ca746db1a7bc273d1cc403d0dbef73617d` |
| `src/interface/cli/govern.ts` | `b129abf513cc750aaede9702327951625116df3eb8418b5579e3842de03660d0` |
| `src/interface/cli/run.ts` | `29850399b0ed46688f05ebad16657952487e2df1a6b28331c9a2835672efbcd6` |
| `src/pipeline/orchestration/govern-session.ts` | `b8515abd867b490cc470704b8035356c3ab5930aa084a53c708bd272c20ec625` |
| `src/pipeline/orchestration/pm-reviewer.ts` | `dc015e922675dffb7b3e33c98530ac34665794800d48d0f3af53a75817cea82c` |
| `src/pipeline/orchestration/run-role.ts` | `3a92ac435bce7f007ef9ba2744374d5daf1d84f70d6ec3cd22b4a926cf0feea9` |
| `src/pipeline/orchestration/shell-arming.ts` | `10d4aa93d8d187e8a27d805206559586a9dfff580d6100dd6f5ccc374b69edd6` |
| `test/编排/runtime-orchestration.test.ts` | `c98ae83d4d0e218677ff3456bfdcadb12a4e1c5772602e4f2accfacb29bca4c7` |

本角色文档变化：api-spec.md、functional-description.md、feature-map.md、memo.md、changelog.md、docs/design/2026-10-14_design_multi-runtime-orchestration.md、docs/feature/runtime-selection.md 与本记录。

## 验证时依赖指纹

下列直接核心/共享依赖须匹配本次证据；旧/新 SDK 默认 factories 未纳入假引擎证据。

| 路径 | SHA-256 |
| --- | --- |
| `src/model/runtime.ts` | `a0e2b0686cf90f76d1736fa6219f3add89ae32c5e485b850a1deab18e2d3eee8` |
| `src/service/runtime/session.ts` | `90a0142e9e8b1af8e9ee355e874111fc44903789c07978c973eac4c6b00bb00b` |
| `src/provider/runtime/tools.ts` | `7b4e5a7975e7733634c6deffd1ac97b0b54b33429010f117d552dd69b12bf245` |
| `src/provider/runtime/schema.ts` | `67df518e52b5821bba617db35eca375779353f86d24e80af8c98aa45ad9f51f0` |
| `src/provider/runtime/session-store.ts` | `9fbdd32e5bb9df0aea64f2c8ac58dbdf3a1b19bd30cd74ace44e3830294548a2` |
| `src/common/shared/runtime-shared.ts` | `fcaa56d7d5e952dc1092b84e34875719d0e2943ae2b00e8ca14b1217b343f9da` |
| `src/common/shared/atomic-write.ts` | `dd51305f2126bca77c462a8db4f3f7effa83f0e9bde3bba765e396d64e5fcf15` |
