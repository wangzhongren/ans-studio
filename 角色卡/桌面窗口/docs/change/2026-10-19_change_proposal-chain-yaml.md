---
id: proposal-chain-yaml
type: change
title: 提案接受两段式链路改走流程状态 YAML——Convener 任务写 YAML、followUp 只认 YAML
created: "2026-10-19"
status: implemented
---

# 提案接受两段式链路改走流程状态 YAML

## 背景

客户决定「这些全部改成yaml。」后，自动验收门已改读 `docs/flows/<flowId>.yaml`（见
[acceptance-reads-flow-yaml](2026-10-19_change_acceptance-reads-flow-yaml.md)）。但**提案接受后的两段式
链路**仍停留在旧口径：

- `buildGovernanceAdvanceMessage` 要求 Convener 写 `docs/flows/<flowId>.md`；
- `interface.ts` 的 `followUp:"nomination-after-flow"` 只检查 `.md` 是否存在；
- 发给 Nominator / Proof 的任务文案仍引用 `.md`。

后果：Convener 按旧文本写出没有 YAML 的流程，自动验收门只能落 legacy Markdown 回退——机器状态永远
迁移不到 YAML。本次把该链路收口到 YAML，同时保留 legacy Markdown 回退能力（旧项目零破坏）。

## 改动

### 1. `app/desktop/governance-advance.ts`

- 恢复/启用 `governanceFlowStatePath(flowId)` ⇒ `docs/flows/<flowId>.yaml`（机器状态唯一路径）。
- `governanceFlowPath(flowId)`（`.md`）降级为**人读视图/legacy 回退**专用，注释明确不得再用于要求
  角色写机器状态或门禁核对。
- 任务文案（语义不变，只把载体从 Markdown 改为 YAML）：
  - `proposal accept` 第一段（Convener）：要求写 `docs/flows/<id>.yaml`（唯一机器状态，字段/枚举按
    门禁卡的流程 YAML schema），明确「同名 .md 仅可选人读视图，不得承载门禁状态」；落盘后应用再派提名。
  - 第二段（Nominator）：告知「流程状态 YAML 已落盘于 …」，要求按 YAML 的首个提名步骤读取提案与 YAML。
  - `accept-quick` / `appointment`（Convener）：要求写 YAML 路径并排步骤/派发已批准步骤。
  - 自动验收任务（Proof）：引用「流程状态 YAML：docs/flows/<id>.yaml」；无回交报告时回退文案改为
    「见回交报告与流程状态 YAML」。
- `governanceNominationFollowUpNote`：改为「流程状态 YAML 已落盘，已派发提名任务给 Crew / 组队（工作中）」。
- `governanceAcceptanceBlockedNote` 建议文案中的「流程单」改为「流程状态文件」（路径仍由调用方按
  YAML/legacy 模式传入）。

### 2. `app/desktop/interface.ts`

- `followUp:"nomination-after-flow"` 的落盘检查：
  1. Convener 本轮须按时空闲；
  2. **读取 `docs/flows/<flowId>.yaml`** 并用编排公共出口 `parseFlowStateYaml` 校验；
  3. 缺失（ENOENT）⇒ `Steward / 统筹 未写出流程状态 YAML <path>；未派发提名任务（同名 .md 人读视图不算落盘）`；
  4. 不可读/校验失败 ⇒ 具体原因（`steps[i].字段: message`，≤10 条）经既有 `chainFail` 系统行回给
     当前流/Lead，**不派 Nominator、不循环重试**；
  5. 通过 ⇒ 再派 Nominator（任务文本见上）。
- **只有 `.md` 不再放行**；`.md` 退化为可选人读视图。
- 自动验收门仍保持 YAML 优先（上一变更）：YAML 存在即唯一机器状态，非法不回退；无 YAML 才 legacy。

### 3. 测试（全部在本角色边界内）

- `test/桌面应用/interface.test.ts`（58 → **60** 例）：
  - 既有治理推进/accept-quick/appointment/验收派发断言按 YAML 文案更新（断言不放宽）；
  - Convener 夹具改为写**合法流程状态 YAML**（无 `.md`），并显式断言「仅 YAML 即放行」；
  - 新增：followUp 只有 `.md` 人读视图 ⇒ 不放行（错误含 YAML 路径、不派 Nominator、系统行如实）；
  - 新增：followUp 的 YAML 校验失败 ⇒ 错误含 `steps[0].status` 具体 path/message、不派 Nominator、
    系统行如实。
- `test/桌面应用/operator-wiring.test.ts`：收尾任务消息断言更新为 YAML 路径与回退文案。
- `test/桌面应用/acceptance-dispatch.test.ts`：验收任务消息路径断言更新为 YAML；legacy 回退用例
  （无 YAML 时阻塞行仍指 `.md`）保持不变。

真实输出（2026-10-19，本机 macOS，Node v24.14.0）：

- `node --test "test/桌面应用/interface.test.ts"` ⇒ **60 计 / 60 过 / 0 红**。
- `node --test "test/桌面应用/operator-wiring.test.ts" "test/桌面应用/acceptance-dispatch.test.ts"`
  ⇒ **66 计 / 66 过 / 0 红**（operator-wiring 47 + acceptance 19，含新增「路径单一来源」守卫）。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **636 计 / 635 过 / 1 红**；唯一红＝已知既有
  `test/桌面应用/runtime-ui.test.ts:69`（renderer `localStorage` 钉）。已核对 **HEAD 的
  `app/renderer/renderer.js` 本身含 `window.localStorage`（第 226/231/285/290 行）**，故该红与本次改动无关。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险

- YAML 校验仍是**读时**（Convener settle 后由应用检查）；角色写盘时不会被即时拦截。若编排提供
  写时校验，应复用同一实现（跨角色请求已登记在上一变更记录）。
- 任务文本已明确 YAML，但 Convener 仍可能凭旧习惯同时/只写 `.md`；应用不会替角色写 YAML，只如实
  报错（不循环）。项目内的旧 `.md` 流程继续走 legacy 回退，不受影响。
- 其他角色的文档/卡片若仍写「流程单 .md」，需各自属主同步；本角色只改桌面属主的任务文案与检查。
- 未改变 `governance:next-step` 载荷、去重、自动派 Proof 的任务硬要求与账本语义；未 git 提交。
