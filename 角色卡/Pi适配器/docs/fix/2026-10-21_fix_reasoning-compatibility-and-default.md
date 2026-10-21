---
id: pi-reasoning-compatibility-and-default
type: fix
title: Pi 思考参数不支持时继续回答，清空等级后恢复默认
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: verified
related: [pi-runtime, ans-reasoning-effort-lightweight-repairs]
events:
  - date: "2026-10-21"
    kind: implemented
    summary: 请求级兼容与默认恢复完成；未改保存配置
  - date: "2026-10-21"
    kind: verified
    summary: 所有者本地Pi专项331项全过，定向类型检查0错；独立集成与验收待执行
  - date: "2026-10-21"
    kind: created
    summary: 按客户已批准 D1 准备 Pi 修复范围；等待验收标准就绪后开始代码
---

# 参数不支持时继续当前任务，清空设置后不再继承旧 high

用户选择思考等级后，Pi 应按该选择发请求；接口明确不支持思考参数时，应提示并使用兼容请求继续当前任务，保存设置保持不变。清空等级后恢复旧会话，应采用当前 SDK 新会话默认，而不是继续继承旧 high。

本记录属于[使用 Pi 执行受治理角色任务](../feature/pi-runtime.md)。依据客户已确认并授权实施的[跨平台 D1](../../../项目管理/docs/design/2026-10-21_design_reasoning-effort-lightweight-repairs.md)，SHA-256 为 `30eb803b2482eea9a308ca2bf51507bb2a8d9c56dc2137fdc5749d85a4dcda09`。本上下文固定为 Pi 适配器，已重读本角色 `boundary.md` Section 1；不扩展权限。

## 已复现的问题

本机 Pi 1.1.0、源码基线 `fc1a39c14e119faccf442fc8e22bbbbd978d1a04`，本角色目标源码及测试在准备时无未提交改动。此前纯本地探针确认：

- 设置 high 后持久化，清空设置并恢复同一 nativeSessionId，实际请求仍为 16384；新空会话默认为 medium/8192。原因是字段缺席时不调用 `setThinkingLevel`，SDK 恢复旧档位。
- 含 thinking 的请求遇到普通 500，也会触发会话级删除参数。原因是现行判断只看宽泛 HTTP 状态。
- 兼容路径再次调用 `session.prompt(text)`，导致同一用户输入在原生历史出现两次；未限制工具已执行后的整轮重放。
- high/xhigh 实际预算均为 16384，是现有 SDK 映射。本轮保留，不伪造更高预算。

原始调查材料仅在 `/tmp`：`ans-pi-reasoning-resume-20261021-result.json`、`ans-pi-compat-request-20261021-result.json`。它们不是实施后的验证结果；关键场景将固化到实际处理器测试。

## 已实现的行为

通过 SDK 公开 `ProviderStreams.stream/streamSimple` 与 `StreamOptions.fetch` 接入兼容处理。仅当前请求尚未进入成功响应流、且结构化错误或已验证的明确格式指向实际发送的 thinking 参数时，复制同一请求并只删除 thinking，再请求一次。普通 401/403、408/429、5xx、未知模型和网络故障不触发兼容。

一次 provider 调用内分别管理“已经切换兼容”和“本次去参请求”：SDK 传输重试沿用去参请求，不恢复已被拒字段，也不重新获得兼容次数。正常助手结果确认后才提交本活会话兼容状态；失败、取消不把未确认状态带到后续轮。重建会话及模型/端点配置重建后重新采用保存设置。

旧 prompt 包装层的思考降级重发整体移除。请求中的历史、图片、工具结果和取消信号保持；不重放工具，不重复追加用户输入，不新增终态。

默认选择顺序为显式等级、公开模型级设置、公开全局设置、绑定 Pi 1.1.0 的命名常量 medium；随后统一调用 SDK `setThinkingLevel`，由其正常钳位。测试与无历史真实 SDK 会话独立比较默认，生产不额外构造会话、不导入私有常量。

预算合法性保护覆盖默认及显式档位。ANS 自己钳位或因当前输出空间不足关闭 thinking 时，仅修改本请求并给出系统提示。配置、尝试兼容、确认成功及预算修正消息使用既有 `message` / `detail.source:system`，只在活动 prompt 内发送，不冒充模型思考正文。

## 精确写集

- `src/common/pi-adapter/real-adapter.ts`：本轮唯一生产文件，暂不新增 helper。
- `test/pi-adapter/reasoning-effort.test.ts`：替换旧降级预期、验证默认与预算保护。
- `test/pi-adapter/compatibility-loopback.test.ts`：新增真实 SDK 请求兼容、传输重试、工具不重放及负例测试。
- `test/pi-adapter/installed-mcp-servers.test.ts`：调度补充授权，默认保护扩展预期同步，不放宽 MCP 工具断言。
- `test/pi-adapter/real-adapter.timeout.test.ts`：调度补充授权，仅关闭假服务器残留连接并等待 close，不修改超时断言。
- `角色卡/Pi适配器/docs/fix/2026-10-21_fix_reasoning-compatibility-and-default.md`：本记录与实际验证结果。
- `角色卡/Pi适配器/docs/feature/pi-runtime.md`：实现后更新当前流程及历史链接。
- `角色卡/Pi适配器/feature-map.md`、`角色卡/Pi适配器/api-spec.md`、`角色卡/Pi适配器/memo.md`：实现后同步必要说明。

本轮不修改 `reasoning-wire.probe.ts`；现有探针保留为旧观察工具，新增回归不依赖它。若实际实现确需 helper 或其他测试路径，先向调度方报精确文件。治理文件、changelog、其他角色资料、真实 `.env`、UI、依赖、SDK 和模型参数上限均不在写集。

## 验证计划与当前状态

使用真实已安装 Pi SDK，只有 127.0.0.1 假网关、占位凭据、临时存储。首先运行两份本轮测试，再运行 Pi 专项和全仓类型检查；结果按实际候选补录，不将其他角色在飞改动误报为本角色通过或失败。

```sh
node --test test/pi-adapter/reasoning-effort.test.ts test/pi-adapter/compatibility-loopback.test.ts
node --test 'test/pi-adapter/*.test.ts'
npm run typecheck
```

必验：明确不支持后当前任务 completed；同一用户输入、工具效果计数恰一次；去参请求中工具结果保留；普通错误不改变后续档位；SDK 对兼容请求的传输重试仍去参且不重复切换；成功才记忆兼容、失败与取消不粘连；配置重建清除兼容；high→清空→同会话恢复与真实 SDK 新默认一致；默认与显式预算修正均有正确系统消息；思考正文、单终态、停止与超时回归。

## 实施与验证记录

独立标准 R1 就绪后已收到“开始代码”派发。源码实现及本角色说明已更新；未修改 UI、真实配置、SDK、依赖和其他角色测试，未部署。

首轮真实 SDK 窄测 29/29；定向 TypeScript 检查 0 错。低并发专项初跑 331 项、329 通过，两处未完成：旧 MCP 用例要求只有治理扩展，与 D1 默认保护冲突；超时用例断言已过，但 server.close() 后留下 undici 空闲预连接导致子进程不退出。两处均经调度批准精确补测试文件：前者同步扩展集合且保持无 MCP 断言；后者仅关闭连接及等待服务器关闭。

本地对照 `/tmp/ans-pi-abort-request-check.mjs` 显示 SDK 原请求与本轮 fetch 包装都正确接收 abort，二者均可残留一个无请求连接；这不是取消语义失效。首次日志保留 `/tmp/ans-pi-d1-suite.log`，不将该轮记为通过。最后候选的复测与哈希如下。全仓类型及跨角色集成交独立测试角色统一运行。


### 最终候选证据（所有者验证，非独立验收）

环境：macOS/darwin arm64，Node v24.14.0，pi-coding-agent 1.1.0、pi-ai 1.1.0。进程环境清空后仅保留 PATH 与占位 ANTHROPIC_AUTH_TOKEN；新测试另用独立占位键。端点固定 localhost，原生会话/诊断只在测试临时目录，测试结束清理。不请求真实 API，不读取真实配置或会话。

| 检查 | 命令/结果 | 原始输出 |
| --- | --- | --- |
| 最终窄测 | `node --test --test-concurrency=2 test/pi-adapter/reasoning-effort.test.ts test/pi-adapter/compatibility-loopback.test.ts test/pi-adapter/installed-mcp-servers.test.ts test/pi-adapter/real-adapter.timeout.test.ts`；39/39，退出0 | `/tmp/ans-pi-d1-focused-final.log` |
| Pi专项 | `node --test --test-concurrency=2 'test/pi-adapter/*.test.ts'`；331/331，无失败/跳过，退出0，正常退出约19.5秒 | `/tmp/ans-pi-d1-suite-final.log` |
| 定向类型检查 | `node_modules/.bin/tsc -p /tmp/ans-pi-d1-tsconfig.json --pretty false`；继承仓库strict配置，files为本轮生产文件及两份核心测试，覆盖其导入依赖；0错、退出0 | `/tmp/ans-pi-d1-typecheck-final.log` |
| 写集/空白检查 | `git diff --check` 对本角色生产、测试及说明；退出0 | 当前Git差异 |

真实 SDK 请求摘要由测试输出，未记录凭据或完整请求正文：默认/显式拒绝后 thinking 序列为 `[原参数, 无, 无]`，两个用户轮各一次 native.prompt、两个 completed；工具场景是 `[high, high, 无]`、toolEffects=1、nativePrompts=1、userHistory=1；SDK传输重试是 `[high, 无, 无, 无]`，两个 completed；兼容全部失败后为 `[high, 无, 无, high]`，outcomes=`[failed, completed]`，没有伪成功提示。normal answer 消息先于 compatibility-confirmed；HTTP200但流错误不确认兼容。取消、超时、普通错误及重建均有真实生产 handler 断言。

源码与测试 SHA-256：

```text
ef0f8353aa3bb5fd2efcc733cdd41754ff9062447a1d0b47dbdd8809c392e965  src/common/pi-adapter/real-adapter.ts
f16ad58bb5b81031dac2eb8349cd60ca046048eec23c9b511ab1cbf2eeb00259  test/pi-adapter/reasoning-effort.test.ts
9065b6700ac18825a07eb12f8f8a5e96b2735aa50b7eb96177ee2a429427b66c  test/pi-adapter/compatibility-loopback.test.ts
45558a5da153ab335855b216bafbf7ffc4c48b3b914a0d83b044644a4d08b43a  test/pi-adapter/installed-mcp-servers.test.ts
77898276694b1d7336f69230a7436a2ebd84c18d9b01592e1e8bfd71c694fb31  test/pi-adapter/real-adapter.timeout.test.ts
```

当前实现、所有者本地验证已完成；全仓类型检查、跨角色回归和独立验收由对应角色继续。未声称已通过独立验收或所有平台/真实网关验证，未提交、推送或部署。


### QA 全量后的夹具修正（2026-10-21，同版 D1）

QA 的无外部假 token 全量揭示新增 `compatibility-loopback.test.ts` 并不自足：它只设置 `ANS_PI_COMPAT_TEST_KEY`，而当前 Pi provider 模板实际从 `ANTHROPIC_AUTH_TOKEN` 读取认证。因此 18 项先报 `No API key found for local-compat`；取消/超时例随后无界等待第二请求抵达，导致该测试子进程不退出。QA 已保存完整失败日志并仅终止该子进程。

此前所有者 331/331 的命令显式注入了 `ANTHROPIC_AUTH_TOKEN=reasoning-local-placeholder`，所以当时的通过结果真实，但只能证明**外部补齐该假键的环境**，不能证明新增夹具在独立/全量默认环境自足。不是产品接口兼容断言先失败；也不能把挂起只归因为机器负载。100ms 全轮预算先于第二请求到达的时序竞态同样存在，已一并修正。

仅修改该新增测试文件：使用实际认证入口的进程局部假值，并在 after 中恢复原有环境；不读取 `.env` 或用户凭据文件。到达等待与 prompt 提前结束竞速并有 10 秒上限；超时例用现有 InteractionGate 暂停前置阶段，刻意延迟首次拒绝 200ms，确认兼容请求已被 hold 后恢复**原100ms真实最后兜底**，仍断言 TimeoutError/timed_out、参数不粘连、下一轮 completed。恢复轮的等待独立有界。没有改生产代码、放宽接口结果/工具/取消断言或增大被测100ms预算。

复测命令 `env -i PATH="$PATH" node --test test/pi-adapter/compatibility-loopback.test.ts`，**不从命令行提供认证键**：23/23、退出0、约1.26秒；定向 strict 类型检查0错。输出 `/tmp/ans-pi-d1-fixture-self-contained.log`、`/tmp/ans-pi-d1-fixture-typecheck.log`。新夹具 SHA-256 `89b7a2dec5bd4834e96c4008f55c03d4a89f6234b4f7b3676b79d058b69a0879` 取代上表该文件的旧指纹；生产文件仍为 `ef0f8353aa3bb5fd2efcc733cdd41754ff9062447a1d0b47dbdd8809c392e965`。已通知 QA 对新候选重新全量，不把旧全量或旧专项当成新全量通过证据。
