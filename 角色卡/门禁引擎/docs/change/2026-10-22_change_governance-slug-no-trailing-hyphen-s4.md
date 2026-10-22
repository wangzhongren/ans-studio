---
id: governance-slug-no-trailing-hyphen-s4
type: change
title: 收紧共享治理 slug 契约（S4：门禁引擎测试改引用 Model 常量并补尾连字符负例）
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: implemented-pending-verification
role: 门禁引擎
scope: 仅 test/门禁引擎/governance-standard-workflow.test.ts 与角色文档；不改产品代码、Model、其他测试或其他角色文件
related: [governance-slug-no-trailing-hyphen]
events:
  - date: "2026-10-22"
    kind: implemented
    summary: 删除测试侧硬编码旧正则，改为值导入 Model 的 GOVERNANCE_SLUG_PATTERN 并 new RegExp 编译；新增尾连字符负例（flow-/a-/impl-）与合法正例（flow-a/impl）；其他断言未删除未放宽
  - date: "2026-10-22"
    kind: verified
    summary: 定向 governance-standard-workflow.test.ts 16 计/16 过/0 失败/0 skip exit 0；本角色全套 test/门禁引擎/*.test.ts 302 计/301 过/0 失败/1 Windows skip exit 0；npm run typecheck exit 0
---

# 收紧共享治理 slug 契约（S4：门禁引擎测试）

## 背景与范围

客户 2026-10-22 确认按[设计](../../../项目管理/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen.md)的 **S1–S5 实施，O1–O4 全部不选**。S1（Model 常量收紧）已由运行时核心完成：`GOVERNANCE_SLUG_PATTERN` 现为 `"^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$"`（见[运行时核心 S1 变更记录](../../../运行时核心/docs/change/2026-10-22_change_governance-slug-no-trailing-hyphen.md)）。本角色只负责 **S4**：门禁引擎测试侧删除旧正则副本、改引用 Model 常量，并补尾连字符负例。

S2/S3（编排私有副本与 Flow YAML 路径闸）、S5（跨角色端到端）不在本角色范围，本轮未触碰其文件。

## 改动在哪（位置 → 改动）

1. `test/门禁引擎/governance-standard-workflow.test.ts`
   - 新增 `import { GOVERNANCE_SLUG_PATTERN } from "../../src/model/runtime.ts";`（沿用本目录 `.ts` 扩展名的值导入风格）。
   - 新增模块级 `const GOVERNANCE_SLUG_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);`——测试侧不再持有旧正则副本。
   - 原第 230 行硬编码 `/^[a-z0-9][a-z0-9-]{1,63}$/` 的步骤 id 断言改为 `assert.match(id, GOVERNANCE_SLUG_RE, ...)`（Steward YAML 模板用例）；断言未删除、未放宽，随 Model 常量自动收紧。
   - 新增 1 个用例「标准工作流：slug 校验引用 Model 常量（单一来源）——合法正例通过、尾连字符负例被拒绝」：正则 `source` 逐字等于 Model 常量（钉住单一来源）；合法正例 `flow-a`、`impl` 通过；尾连字符负例 `flow-`、`a-`、`impl-` 被拒绝。

## 以前怎样 → 现在怎样

- **以前**：测试侧自带一份与 Model 同值的旧正则 `/^[a-z0-9][a-z0-9-]{1,63}$/`；Model 收紧后两者口径会漂移，测试仍会「证明」旧形状合法。
- **现在**：测试直接编译 Model 常量，Model 单方面收紧即被测试继承；`flow-`/`a-`/`impl-` 这类尾连字符形状在门禁引擎测试中被显式钉死为非法。
- **不变**：Steward YAML 模板的既有步骤 id（`contract-freeze`、`delivery-server`、`verification-evidence`、`verification` 等）均在新正则合法集合内，全部照常通过；本文件其余用例与断言逐字未动。

## 验证（实际运行）

环境：Windows 11，Git Bash，Node v24.22.1，cwd `C:\Users\51054\Desktop\work\ans-studio`；每条命令前已把 `C:\Users\51054\AppData\Local\Programs\nodejs` 加入 PATH。

| 命令 | 结果 |
| --- | --- |
| `node --test --test-timeout=120000 test/门禁引擎/governance-standard-workflow.test.ts` | **exit 0；16 tests / 16 pass / 0 fail / 0 skipped**（改前 15 例，本次 +1） |
| `node --test --test-timeout=120000 test/门禁引擎/*.test.ts`（本角色全套） | **exit 0；302 tests / 301 pass / 0 fail / 1 skipped**（1 skip 为本机 Windows 既有环境 skip；较上批 301/300/1 恰 +1 计 +1 过，无新增红） |
| `npm run typecheck`（`tsc --noEmit`） | **exit 0，0 条错误** |

窄测覆盖：YAML 模板步骤 id 全部经 Model 正则校验；新用例钉住 `GOVERNANCE_SLUG_RE.source === GOVERNANCE_SLUG_PATTERN`、合法正例通过、尾连字符拒绝。

未跑真实模型/凭据/网络；未启动或重启应用；未 git 提交；未触碰 `todo-demo`。

## 未验证项与跨角色依赖

- **编排 S2/S3 未落地（本轮只读核对）**：`src/common/编排/governance-gate.ts`、`governance-handoff.ts`、`governance-judge-facts.ts`、`flow-state.ts`、`flow-service.ts` 与 `src/pipeline/orchestration/run-role.ts` 仍持有旧正则副本（`^[a-z0-9][a-z0-9-]{1,63}$`）。在 S2/S3 落地前，治理门禁、Flow YAML 解析与 `docs/flows/<id>.yaml` 路径闸对尾连字符的拒绝尚未收紧；本角色未越界修改。
- **S5 端到端未验证**：跨角色端到端（工具失败、零呈现/零判断/零账本）属测试角色；真机端到端与独立验收未进行。
- **旧数据兼容**：仓库内无尾连字符存量（设计 §4.1）；O4 只读审计未授权、未实施。

## 相关链接

- 权威设计（项目管理）：[收紧共享治理 slug 契约——禁止尾连字符](../../../项目管理/docs/design/2026-10-22_design_governance-slug-no-trailing-hyphen.md)
- Model 常量与 S1 变更：[运行时核心 S1 变更记录](../../../运行时核心/docs/change/2026-10-22_change_governance-slug-no-trailing-hyphen.md)、[runtime.ts](../../../../src/model/runtime.ts)
- 测试文件：[governance-standard-workflow.test.ts](../../../../test/门禁引擎/governance-standard-workflow.test.ts)
