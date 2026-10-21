---
id: reasoning-default-contract
type: fix
title: 思考等级留空交平台默认策略
created: "2026-10-21"
updated: "2026-10-21"
status: implemented-pending-acceptance
---

# 留空恢复平台默认，不把字段缺席解释成原生请求零参数

客户已授权 [ANS-REASONING-LIGHT D1](../../../项目管理/docs/design/2026-10-21_design_reasoning-effort-lightweight-repairs.md) 实施；[独立标准 R1](../../../独立验收/docs/design/2026-10-21_design_reasoning-light-criteria.md) 已就绪。运行时核心本次只同步公共契约注释与说明，没有改变值域、字段、env 归一、Service 行为或 UI。当前功能见 [公共运行时工具](../feature/runtime-core.md)。此前 D3 的写文件改动仍保留，不属于本轮新增范围。

`src/model/runtime.ts` 两处旧“未设＝逐字现状”改为字段缺席交平台默认策略：Pi 新建/恢复须按显式值、模型设置、全局设置、Pi 1.1.0 命名默认 medium 重新应用，默认和显式档均有预算保护；不继承转录旧档、不改保存偏好。平台实现由原适配器承担。明确参数拒绝的兼容状态仅属当前活会话，普通网络/鉴权/限流失败不据此改档。

`src/service/runtime/session.ts` 仅同步三条注释，仍只有 set 态注入字段，unset/invalid 字段缺席。`src/common/runtime-core/reasoning.ts` 已说明留空为平台默认，无直接冲突，本轮未改。

普通配置与兼容提示采用活动 prompt 内的 `kind:message`、`detail.source:system`，可附小型 reasonCode/state，正文放 summary；不加入 Model 新字段，不借 `source:reasoning` 冒充思考事实。代码只读核对显示：核心转发/保存活动轮消息，窗口已有 system 反馈排除，普通 summary 可显示与回放。本轮未改窗口/UI，未用这些代码检查冒充桌面实机验证。

## 当前候选与验证

生产者：固定运行时核心；时间 2026-10-21 10:39–10:40（Asia/Shanghai）。Darwin arm64、Node v24.14.0。HEAD `fc1a39c14e119faccf442fc8e22bbbbd978d1a04`，存在其他角色并行未提交改动。修改仅两份源码注释，以及本报告、api-spec、功能文档和 memo。

| 文件 | SHA-256 |
| --- | --- |
| src/model/runtime.ts | 571e13c6b180ae31b21c4bfcd5804f902365674d75dd2a697040b2a905432d7a |
| src/service/runtime/session.ts | cc4a09df86ab71c8255a5c27d002e10cc479213ce1ec92437cfc8359b8e61717 |
| src/common/runtime-core/reasoning.ts（未改） | e729dbe27ed4c264c47fed3415f9b19d2451c1d989f8db268a3c08eabbb1ad77 |
| test/runtime-core/reasoning-effort.test.ts（未改） | 738f80a7aa7103b10ae501a3a2e5ced0319ff45690ca385a6bdf5541d7d6b42b |
| test/runtime-core/reasoning-facts.test.ts（未改） | 1cac69324f02280c1247f4e7ea3e25d2ea9791ec6ac60ffc6fa896a8a7128277 |

执行 `node --test test/runtime-core/reasoning-effort.test.ts test/runtime-core/reasoning-facts.test.ts`：17/17 通过，0 失败/跳过，退出码 0；[原始日志](/tmp/ans-reasoning-light-core.log)。覆盖原中立值域、三键归一、字段缺席/注入、非法偏好诊断，以及推理事实脱敏、投影和持久化回放。生产代码无行为变更；`git diff --check` 对本轮源码/说明通过。没有修改测试，也没有运行全量或真实 SDK 兼容探针。

该结果仅证明核心既有契约测试保持通过；三平台真实请求、默认恢复与兼容继续由原所有者和独立测试提供，独立验收判定最终完成。Codex 追加方案不属本轮核心范围。未提交、推送或发布。
