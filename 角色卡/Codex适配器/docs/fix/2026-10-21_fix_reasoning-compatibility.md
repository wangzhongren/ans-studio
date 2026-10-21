---
id: codex-reasoning-compatibility-20261021
type: fix
title: Codex 思考档位被拒后安全兼容继续
created: "2026-10-21"
status: implemented-awaiting-acceptance
---

# 思考档位被拒时继续当前任务，兼容成功后才保留新请求方式

本记录执行已获用户确认的 [ANS-REASONING-LIGHT D1](../../../项目管理/docs/design/2026-10-21_design_reasoning-effort-lightweight-repairs.md)，设计 SHA-256 为 `30eb803b2482eea9a308ca2bf51507bb2a8d9c56dc2137fdc5749d85a4dcda09`。独立验收标准由 R1 后续扩展为 [R2](../../../独立验收/docs/design/2026-10-21_design_reasoning-light-criteria.md)。所属功能：[Codex 受治理会话](../feature/codex-governed-session.md)。本记录保留实施前范围与 D1 红例；获批 E1 的最终实际结果见末尾，不把原计划或旧红例当作当前通过结论。

## 已确认的问题

四档正常请求及恢复传参正确。失败分支却只根据 reasoning/effort 与 unknown/invalid 等词共现判断，误把模型错误当参数拒绝。非持久重建仅清轮 ID，仍用旧线程查目录，未发送兼容 HTTP 已先提示“按默认执行”。原生 MCP/搜索只在完成通知标记已产出，开始后仍可能重放。原生 `turn/start.effort` 会保留到后续轮，兼容失败也必须恢复最近确认策略。

## 精确实施与测试范围

- 生产：`src/provider/codex/session.ts`、`src/common/codex-adapter/protocol.ts`；预计不改 `config.ts`，确需调整单一编码时才在已授权函数内修改。
- 单元测试：`test/codex-adapter/reasoning.test.ts`、必要的 `test/codex-adapter/session.test.ts`；夹具仅 `test/codex-adapter/fixtures.ts`。PM 同意追加 `web-search.test.ts`，只按真实 source 选取搜索行，保留原断言，避免新 system 提示混入搜索计数。
- 原生回归：新增 `test/codex-adapter/reasoning-loopback.probe.ts`，仅 localhost 假 Responses 服务、假 key、隔离临时目录，真实 CLI 0.162.1 与真实 MCP SDK。
- 说明：本记录、`feature-map.md`、`memo.md`、`api-spec.md` 与 `docs/feature/codex-governed-session.md`。不写根 changelog、其他角色代码、公共契约、UI、依赖或真实配置。

## 预期修复行为

严格识别思考 effort 值/字段拒绝；明确普通故障不触发。值拒绝时精确匹配 CLI `model/list` 的目录默认值，同线程显式覆盖；字段拒绝、目录缺项或默认仍被明确拒绝时，仅安全首轮/持久恢复允许去覆盖重建。最多两个不同候选。重建先保存恢复 ID 再清线程 ID，成功后才使用新 ID，对外 ID 保持同步。

请求原档位与最近确认策略分开。兼容轮最终 completed 才提交新策略；失败/取消/超时后的下一轮显式重新施加最近确认策略，状态未确认的引擎不得复用。保留 SDK 运输重试、工具授权与持久化路径。已有输出或工具启动不重放。提示只在 active prompt 内发普通 system message，区分配置、尝试和成功，不修改保存设置。

## 验证计划与限制

保留四档、off、无配置及推理事实回归；增加结构化拒绝/负例、默认候选/去覆盖、次数界限、原生 started 阻止重试、一次结算、外部 ID 更新、成功后沿用、500/取消/超时后恢复 high。真实 CLI 验证请求体与当前/下一轮结果，不能仅检查 fake 选项。

整个 reasoning 对象被拒仍属于基础协议限制；非持久多轮重建不丢历史强行继续，已有副作用不整轮重放。CLI 目录不是自定义网关能力证明，缺项不猜默认。

## 实施与验证结果

生产改动仅 session/protocol 两文件，config 未改。正常四档和恢复语义保留；精确 effort 字段/值识别取代词共现。目录默认同线程重试与安全去覆盖重建已落地；completed 后才提交策略，默认兼容失败/取消/超时及去覆盖失败后的下一轮真实恢复 high；未确认重建引擎隔离。工具 started 及正常输出阻止重试，对外 ID 动态跟随原线程。

以下是 E1 之前冻结的 D1 结果，彼时 **D1 整体验收尚未满足**，原始日志保留不覆盖：

| 验证 | 结果 | 原始证据 |
| --- | --- | --- |
| 自有 Node 回归 | 74/74，0 fail、0 skip | [单元输出](2026-10-21-reasoning-compatibility-evidence/unit-tests.txt) |
| 真实 CLI localhost 矩阵 | 15 过、1 红；进程退出码 1 | [原始请求字段、事件及结果](2026-10-21-reasoning-compatibility-evidence/native-loopback.json) |
| 全仓 TypeScript | D1冻结刷新通过；前一轮独立 Pi 消费者在飞旧契约错误已同步 | [输出](2026-10-21-reasoning-compatibility-evidence/typecheck.txt) |
| 本角色 diff 空白检查 | 通过 | [命令及候选哈希](2026-10-21-reasoning-compatibility-evidence/manifest.json) |

运行环境为 macOS/darwin arm64、Node 24.14.0、CLI 0.162.1。使用假 key、127.0.0.1 假 Responses 服务和隔离临时目录，外部模型调用为 0。原生 HTTP500 自带多次运输重试，最后返回 SDK 固定 high-demand 摘要；测试依据捕获的 HTTP500、最终 failed 以及下一轮真实 high，不假设摘要一定含“500”。

### D1 阶段红例与额外可行性调查

D1 的 `known-model-effort-field-removal-required` 保持正常成功断言并真实失败：`gpt-5.5` 首请求 high，去覆盖后 CLI 仍自动补 medium；只拒 effort 字段、允许普通请求的假网关仍拒绝，因此当时不能宣称满足全部字段兼容承诺。目录外 `probe-model` 的同一流程确实省去 effort，并在持久/非持久首轮继续完成。E1沿用相同成功断言验证红转绿，没有把它改成 expected failure。

PM 仅授权 `/tmp` 一次候选可行性探针：从当前安装原生二进制内嵌 JSON 精确取出 gpt-5.5 单模型元数据，保留模型/端点，通过已有 `model_catalog_json` 临时覆盖取消默认 level 与 summary 支持，出站 `reasoning:{}` 无 effort，假网关正常 completed。[原始可行性结果](2026-10-21-reasoning-compatibility-evidence/temporary-catalog-feasibility.json)。完整模型元数据不是公开 `model/list` 结果；依赖二进制结构存在版本维护成本，不能冒充稳定 API。此额外方案尚未获用户批准，**产品未加入模型目录覆盖**，临时元数据与探针仅在 `/tmp`，入口见 manifest。

没有修改 SDK/依赖、真实 `.env`、模型/网关选择、公共契约、UI 或治理根 changelog；未提交 Git。

## E1 已批准差额：最小实施安排

用户随后明确批准 E1，独立标准升级 R2。新增生产文件仅 `src/common/codex-adapter/reasoning-catalog.ts`，新增测试仅 `test/codex-adapter/reasoning-catalog.test.ts`，并在既有 session 与真实回环接入。固定 0.162.1 包/平台包来源，流式有界寻找内嵌目录、限制目录字节数、精确模型选择，只改变已验证四字段；不读取项目提供的目录。临时副本放本会话 workRoot，文件0600，关闭/恢复原目录/销毁时清理。

E1替代去覆盖候选对已知模型的目录默认，最多两候选不变。原始普通路径不生成文件。成功才确认；失败/取消/超时若临时目录已进入引擎，下一轮先安全重建回原目录并显式恢复最近确认档位；恢复未确认即隔离。原 D1 红日志永久保留，E1实际结果另存，不改写历史失败。本节记录的是已批准执行安排，不预先宣布 E1 通过。

## E1 最终实施与所有者验证

生产仅新增私有 `reasoning-catalog.ts` 并接入原 session；真实目录源固定为已安装 `@openai/codex@0.162.1` 及匹配平台包二进制。读取原生文件上限512MiB，以256KiB块寻找已验证嵌入标记，目录JSON上限4MiB；版本、格式和精确模型验证失败时不猜造。临时副本只有当前模型，完整条目逐项比对，除四个批准字段外均不变。没有从项目配置、任意文件路径或用户输入导入可信模型定义。

目录默认也被明确值拒绝后，第二个无effort候选同样需要E1，避免原CLI再次补同一默认；这属于原第二候选，未增加第三次试探。普通路径无目录覆盖。临时目录归本会话workRoot、文件0600，已确认兼容期间归当前引擎使用，恢复原目录或dispose时清理；失败/取消/超时未确认新策略，下一轮先重建原目录再请求high。重建不确认就隔离。

| 最终验证 | 结果 | 原始证据 |
| --- | --- | --- |
| 自有回归（含真实本机模型元数据/实际临时文件生命周期） | **80/80，0 fail、0 skip** | [测试输出](2026-10-21-reasoning-compatibility-e1-evidence/unit-tests.txt) |
| 真实 CLI 完整 localhost 矩阵 | **20/20，退出码0** | [完整请求摘要/事件/终态](2026-10-21-reasoning-compatibility-e1-evidence/native-loopback.json) |
| 全仓 TypeScript | **退出码0** | [输出](2026-10-21-reasoning-compatibility-e1-evidence/typecheck.txt) |
| diff 空白检查 | 通过 | [命令、版本、设计与源码哈希](2026-10-21-reasoning-compatibility-e1-evidence/manifest.json) |

旧红例现在真实出站 `gpt-5.5 high → 无effort → 下一轮无effort` 并completed；另格验证 `high → medium（仍被值拒绝）→ 无effort → 下一轮无effort`。E1后的HTTP500、取消、超时三格均为下一轮high并恢复原目录；原目录外模型、持久/非持久首轮去覆盖、正常四档、保留历史、工具计数1与单次结算继续通过。所有请求仍是同模型/同localhost端点、假凭据、隔离目录，外部模型调用0；不把本地网关接受当作线上模型采纳的证明。

来源仍是版本耦合的原生内嵌元数据，不是稳定公开API；整个reasoning对象拒绝、已有工具/输出后的整轮重放、非持久后续轮历史恢复限制不变。当前为所有者验证通过，独立测试和验收结论由对应角色给出。没有更改SDK/依赖、用户保存配置、模型/端点、公共schema、UI或治理根changelog，没有提交Git。
