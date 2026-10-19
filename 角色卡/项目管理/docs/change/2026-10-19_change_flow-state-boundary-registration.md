---
id: flow-state-boundary-registration
type: change
title: 编排边界补登 flow-state.ts Pipeline 公共出口（流程状态 YAML 契约）
created: "2026-10-19"
status: implemented
---

# 编排边界补登：flow-state.ts Pipeline 公共出口

## 依据（客户原话）

2026-10-19 客户决定：「这些全部改成yaml」。

编排角色据此新增流程状态 YAML 契约的 Pipeline 公共出口 `src/pipeline/orchestration/flow-state.ts`（薄再导出 `src/common/编排/flow-state.ts`），桌面自动验收门消费。该文件未登记进 `角色卡/编排/boundary.yaml` Section 1 写入白名单，本批补登。本轮只改边界登记与本角色文档，未改业务源码、未改其他角色 boundary、未 git 提交。

## 为何需要该出口

- **单一实现归编排私有**：flow 契约的实现与 schema 在 `src/common/编排/flow-state.ts`（`parseFlowStateYaml` / `validateFlowEvidence` / `evaluateFlowCompletion` / `flowCompletionIssue` / `flowStatePath` 等）。
- **分层纪律**：桌面不直接 import 其他角色的私有 common。桌面自动验收门（`app/desktop/interface.ts`）只经 `src/pipeline/orchestration/flow-state.ts` 薄再导出消费，避免跨角色私有依赖。
- **薄再导出**：该文件只有 `export ... from`（值导出 + 类型导出），不复制逻辑、不做二次判定；补登的是白名单归属，不是新权限或新实现。

## 改动

`角色卡/编排/boundary.yaml` Section 1（唯一写入白名单）entries 增一条，紧随其他 `src/pipeline/orchestration/*.ts` 条目（`shell-arming.ts` 之后、`src/common/编排/` 目录条目之前）：

```yaml
  - kind: file
    path: src/pipeline/orchestration/flow-state.ts
    purpose: 流程状态 YAML 契约的 Pipeline 公共出口（桌面自动验收门消费；实现同源于 src/common/编排/flow-state.ts）
```

**只登记写入白名单，不改变读写权限**：

- Section 1 是「唯一写入白名单」，未列路径默认只读：补登只是让白名单与该文件的实际归属一致（本批由编排新建、此前漏登），**不新增任何读取面**，读取语义不变。
- 不改变其他角色 boundary；`src/common/编排/` 目录条目与 `test/编排/` 等既有登记未动。
- 不复制/不迁移实现：单一实现仍在 `src/common/编排/flow-state.ts`。

## 核对依据（只读）

- `src/pipeline/orchestration/flow-state.ts` 第 1–35 行：文件存在，确为薄再导出。第 7–19 行为值导出 `parseFlowStateYaml, evaluateFlowCompletion, flowCompletionIssue, validateFlowEvidence, flowStatePath, isReservedAcceptanceStepId, FLOW_QUALITY_TIERS, FLOW_STEP_KINDS, FLOW_STEP_STATUSES, FLOW_EVIDENCE_KINDS, RESERVED_ACCEPTANCE_STEP_IDS`，第 21–35 行为类型导出，均 `from "../../common/编排/flow-state.ts"`；无本地逻辑。
- `src/common/编排/flow-state.ts` 第 1–14 行：文件头声明「Flow YAML 契约（2026-10-19 客户决定『这些全部改成yaml』）」及分层说明（桌面经 `src/pipeline/orchestration/flow-state.ts` 薄再导出消费，不跨角色直接 import 私有 common）。
- `app/desktop/interface.ts` 第 120–128 行：注释（第 120–123 行）声明「只经 Pipeline 公共出口消费（`src/pipeline/orchestration/flow-state.ts` 薄再导出），不直接 import 编排私有 `src/common/编排/`」；第 124–128 行 `import { evaluateFlowCompletion, flowStatePath, parseFlowStateYaml } from "../../src/pipeline/orchestration/flow-state.ts"`。
- `角色卡/编排/boundary.yaml`：Section 1 entries 原已列 `run-role.ts` / `govern-session.ts` / `pm-reviewer.ts` / `shell-arming.ts` 四条 `src/pipeline/orchestration/*.ts`，`flow-state.ts` 为唯一缺失项。

## 验证（2026-10-19，本机 macOS）

- `node -e "require('yaml').parse(require('fs').readFileSync('角色卡/编排/boundary.yaml','utf8'))"` → `YAML_OK role=编排 entries=18`；`flow-state` 条目解析结果为 `{"kind":"file","path":"src/pipeline/orchestration/flow-state.ts","purpose":"流程状态 YAML 契约的 Pipeline 公共出口（桌面自动验收门消费；实现同源于 src/common/编排/flow-state.ts）"}`。
- `git diff --check` → 无输出，退出码 0。
- 未 git 提交；未读 `.env`；未打印凭据。

## 其他边界缺口核查

- `src/pipeline/orchestration/` 共 5 个文件：`flow-state.ts` 本次补登；`run-role.ts` / `govern-session.ts` / `pm-reviewer.ts` / `shell-arming.ts` 均已在册。
- `src/common/编排/flow-state.ts` 为新增文件，已被 `src/common/编排/` 目录级登记覆盖，无需逐文件登记。
- `src/pipeline/project-document/read-project-document.ts` 属桌面窗口边界（`角色卡/桌面窗口/boundary.yaml:21`），非编排职责，无需登记。
- 未发现其他 `src/pipeline/**` 编排文件漏登。
