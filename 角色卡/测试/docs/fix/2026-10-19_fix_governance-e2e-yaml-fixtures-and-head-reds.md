---
id: governance-e2e-yaml-fixtures-and-head-reds
type: fix
title: 治理 e2e YAML 夹具迁移 + 两条 HEAD 既有红收口（测试角色）
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: verified
related: [flow-yaml-contract, acceptance-gate, reasoning-effort-localization]
events:
  - date: "2026-10-19"
    kind: fixed
    summary: 收口 5 条红：governance-e2e-auto 夹具迁 Flow YAML（b 两段式文案、i 全链路、c/d 随夹具）；f-acceptance-gate 因产品证据包仍只解析 Markdown 而保留旧版人读视图并登记产品缺口；g-desktop G3 改为对当前「value=raw/文本=choiceLabels」结构的稳定断言；t29 G-5 改为按注册表 choiceLabels 单一来源拼期望文案；test/测试 785/785，全仓 3239/3237/0/2，typecheck 0。
---

# 治理 e2e YAML 夹具迁移 + 两条 HEAD 既有红收口

## 结论

- `test/测试/**` 5 条红全部收口，**未改任何产品源码**。
- 证据包 YAML 缺口由编排修复后，`f-acceptance-gate` 已迁回 **YAML-only**（无 legacy 兜底残留）。
- `node --test "test/测试/**/*.test.ts"`：**786 计 / 786 过 / 0 红 / 0 skip / exit 0**。
- 全仓 `node --test "test/**/*.test.ts"`：**3243 计 / 3241 过 / 0 红 / 2 skip / exit 0**（2 skip 为平台条件用例）。
- `npm run typecheck`：**exit 0**。

## 1. A 组：Flow YAML 迁移（b / c / d / f / i 共用夹具）

产品契约以 `src/common/编排/flow-state.ts` 为唯一依据（2026-10-19 客户「这些全部改成yaml」）：

### 1.1 夹具（`governance-e2e-auto/fixture.ts`）

- `FLOW_REL` 由 `docs/flows/flow-a.md` 改为 **`docs/flows/flow-a.yaml`**（唯一机器状态）。
- `flowDoc()` 改为生成合法 Flow YAML：
  - 顶层 `flowId/version(1)/qualityTier(production)/steps`；
  - 每步 `id/title/owner/kind/status`；保留 id `verification`/`acceptance` 推断 `kind: acceptance`（owner 默认 verifier），其余 `kind: dispatch`（owner 默认 executor）；
  - `status: done` 自动补同 kind 的 `evidence`：dispatch ⇒ `{kind:"dispatch", ref:步骤id}`，acceptance ⇒ `{kind:"acceptance", ref:"acceptance"}`；其他 kind 的 done 必须显式给 evidence（夹具 fail-fast）。
- 该生成结果先经产品 `parseFlowStateYaml` 校验通过，再用于场景。

### 1.2 b-proposal-accept-timing

- 场景 2a：Convener 任务断言改为稳定片段 `/请先写流程状态 YAML docs\/flows\/flow-a\.yaml/`、`/不要把步骤说成已派发/`；Nominator 任务断言改为 `/流程状态 YAML 已落盘于 docs\/flows\/flow-a\.yaml/`；`flowExists` 检查随 `FLOW_REL` 自动指向 YAML。
- 场景 2b：错误断言改为 `/未写出流程状态 YAML docs\/flows\/flow-a\.yaml/`；停住系统行改为 `/自动推进停住：Steward \/ 统筹 未写出流程状态 YAML/`（实际输出：`Steward / 统筹 未写出流程状态 YAML docs/flows/flow-a.yaml；未派发提名任务（同名 .md 人读视图不算落盘）`）。
- 其余语义未变：先 Convener 后 Nominator、当前 pane 不变、缺 YAML 不派/不循环。

### 1.3 i-full-chain

- Convener 第一段分支由 `/请先写流程单/` 改为 `/请先写流程状态 YAML/`；首条任务断言改为 `/请先写流程状态 YAML docs\/flows\/flow-a\.yaml/`。
- 流程产物断言由 Markdown 表格改为 YAML 结构：含 `- id: impl` 且 `status: done`。
- 其余链路（意图确认 → 提案 → 提名 → 任命 → 写卡 → 排程 → 派发、账本顺序、0 手动卡）未变。

### 1.4 c/d

随夹具自动切 YAML，未改断言；两套场景均通过。

### 1.5 f-acceptance-gate：**YAML-only（证据包 YAML 修复后已迁回）**

- 首次迁移时实测：YAML-only 流程下验收卡恒 manual（证据包 `governance-judge-evidence.ts` 仍用 `parseFlowSteps` 解析 flow 物证，reason「流程单缺少可解析的步骤表」），故曾临时保留 Markdown 人读视图兜底。
- 编排随后修复证据包：`.yaml|.yml` 按文件名 flowId 复用 `parseFlowStateYaml` 提取 `steps`，非法时给 `flow-state-invalid`（具体 path+message）；legacy Markdown 行为不变。
- 本文件现已**迁回 YAML-only**：删除 `flowMarkdownDoc()`/`FLOW_MD_REL` 兜底，全部场景写 `docs/flows/flow-a.yaml`（断言同目录无同名 `.md`）。
- 正向 6e 增守卫：`judgeRows[0].reasonCode === "sufficient"` 且 reason 不含旧「缺少可解析的步骤表」。
- 新增 6f：非法 YAML（done 缺 evidence）⇒ 验收不代批，judgeNotice 含具体 `flow-a.yaml` + `steps[0].evidence` + 「必须提供 evidence」，且不得出现旧 Markdown 缺口文案。
- 负向仍 manual（未 done / 缺 dispatch.accepted / 阻塞 / 未结算），门槛未放宽。

## 2. B 组：两条 HEAD 既有红（只读核对后改断言）

### 2.1 `g5-reasoning-verify/g-desktop.test.ts` G3

- 旧断言逐字匹配 `choices.map(function (c) { return '<option value="' + esc(String(c)) + '">' + esc(String(c)) + "</option>"; })`，与当前 renderer 不一致。
- 只读核对 `app/renderer/renderer.js`：当前实现为
  `choices.map(function (c, index) { var optionText = choiceLabels[index] 非空 ? choiceLabels[index] : String(c); return '<option value="' + esc(String(c)) + '">' + esc(optionText) + "</option>"; })`。
- 行为仍满足原语义：**值域逐项成选项且全部转义**；`value` 仍逐字 raw choices（提交/保存值域不变），仅选项**显示文本**本地化并可回退 raw。
- 断言改为稳定结构式：正则验证 `value=esc(String(c))`、文本 `esc(optionText)`，并单独断言 `optionText` 的单一来源（choiceLabels 非空优先，否则 String(c)）。用例语义未删除。

### 2.2 `t29-pi-config-roundtrip.test.ts` T29 G-5

- 旧断言要求错误含英文值域 `off / low / medium / high / xhigh`；当前产品错误已本地化为
  `推理强度取值无效：仅接受 关 / 低 / 中 / 高 / 极高（或留空维持平台默认）。`
- 只读核对单一来源 `app/desktop/runtime-config.ts`：`field.choiceLabels` 与 `choices` 等长时用标签拼错误；**校验仍以 raw `choices` 为准**，`trim` 后规范形写盘（注释明示 2026-10-17 有意本地化）。
- 断言改为**从同一注册表 `RUNTIME_SETTINGS.pi` 拼出期望文案**（label + choiceLabels/choices），避免第二份值域；同时新增 `choices` 仍逐字为英文值域的断言。安全断言保留：错误不回显提交值原文、被拒不落盘。

## 3. 验证实录

| 命令 | 结果 |
| --- | --- |
| `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` | **31 / 31 过 / 0 红 / exit 0** |
| `node --test "test/测试/**/*.test.ts"` | **786 / 786 过 / 0 红 / 0 skip / exit 0** |
| `node --test "test/**/*.test.ts"`（全仓） | **3243 计 / 3241 过 / 0 红 / 2 skip / exit 0** |
| `npm run typecheck` | **exit 0** |

定向复跑：`governance-e2e-auto` 31/31（含新增 6f）；`g-desktop` 5/5；`t29-pi-config-roundtrip` 11/11。

## 4. 残余风险

1. i 的流程 YAML 不含验收步骤，桌面自动验收门会给出「流程缺少验收步骤」类系统行；旧 Markdown 夹具同样如此，非本批回归，测试未断言其缺席。
2. f 的 YAML-only 覆盖依赖编排的证据包 YAML 解析（已修复并有 6f 反向守卫）；若该实现回退，6e/6f 会立即变红暴露。

## 5. 改动文件（均在 `test/测试/` 边界内）与纪律

- `test/测试/governance-e2e-auto/fixture.ts`
- `test/测试/governance-e2e-auto/b-proposal-accept-timing.test.ts`
- `test/测试/governance-e2e-auto/i-full-chain.test.ts`
- `test/测试/governance-e2e-auto/f-acceptance-gate.test.ts`
- `test/测试/g5-reasoning-verify/g-desktop.test.ts`
- `test/测试/t29-pi-config-roundtrip.test.ts`

未 git 提交；未读 `.env`；未打印凭据；未改产品源码；未改 `test/桌面应用/**` 或其他角色测试；临时调试文件已删除。
