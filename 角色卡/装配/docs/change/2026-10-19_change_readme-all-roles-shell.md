---
id: readme-all-roles-shell-20261019
type: change
title: README 同步「所有角色都接 shell、一律经审批」新规则
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-10-19"
    kind: verified
    summary: README 四处旧口径已同步；装配测试 82/82 通过，仅文档改动
---

# README 同步「所有角色都接 shell、一律经审批」新规则

客户新规则原文：「所有的角色，都应该有有运行shell 的权限，包括读写，以及任何的需要命令的权限，只不过都要提交审批，按照原有的流程审批。」

门禁引擎已把五个内置治理角色（`liaison` / `rapporteur` / `nominator` / `convener` / `verifier`）的 shell 能力统一为审批档（`operator-approve`）；桌面接线由桌面窗口角色并行完成。本任务只同步装配所属的 [README](../../../../README.md) 旧口径，不修改任何代码与行为。

## README 改动（四处的旧 → 新）

1. **第 9 行「五个治理角色」引言**：「只读写治理文件与证据」→「文件写入限于治理文件与证据」并补「shell 命令与其他角色一样全部经审批链」。保留「不承担实现与测试」——审批不改变角色职责与文件写边界。
2. **第 17 行角色表 Proof / 验收职责**：「独立只读核对证据」→「独立核对证据」，避免与新的 shell 能力表述冲突；验收职责本身未变。
3. **第 52 行「第一次使用」第 4 步**：「Proof 独立只读核对交付与回交证据」→「Proof 独立核对交付与回交证据」。
4. **第 75 行「角色协作怎样约束修改」原「治理角色只读」条目**：整条改写为「所有角色都具备 shell 能力」——
   - 五个治理角色与项目角色一样可执行读写与任意 shell 命令；
   - 全部走既有审批流程：只读白名单直接执行；risky/review/deny 逐条由客户或判断 agent 审批；拒绝、超时、通道不可用一律不放行；
   - shell 的副作用不受文件写入门禁约束，审批链是唯一控制；文件写入仍优先 `write_file` 并经写盘确认；
   - shell 裁决审计仍落 `docs/audit/shell-gate.jsonl`。

其余内容与文风保持不变。第 76 行「替我审批」、第 77 行「判断 agent 只读」与第 129 行「无操作系统沙箱 / CLI 当前未启用 shell 工具」经核对仍准确，未动。

## 逐条核实依据（只读）

- `src/common/门禁引擎/governance-roles.ts`：五个内置治理角色与 su 均为 `shell: "operator-approve"`；注释明确「shell 可读写、可执行任意命令，但全部经既有审批链（只读白名单直接执行，其余逐条审批）」。
- `src/common/编排/shell-gate.ts`：审批档下 (c) 白名单 `allow` 直接放行；`risky`/`review`/`deny` 交 (a) 客户确认（deny 也可被批准）；拒绝/超时/通道不可用 = 拒绝（fail-closed）。
- `src/pipeline/orchestration/shell-arming.ts`：审计缺省落 `docs/audit/shell-gate.jsonl`（治理边界 + `shell-gate` 条件）。

## `.env.example`

无审批相关环境变量（审批走既有通道与规则集，不新增配置项）；按任务要求不新增，避免范围膨胀。文件未动。

## 测试同步

`test/装配/` 无钉 README 文案的用例：`release-packaging.test.ts` 只把 `README.md` 当作排除路径夹具（断言私有/文档文件不入发布 overlay），不读取或断言其正文。按任务要求不新增测试。

## 验证

- `node --test "test/装配/**/*.test.ts"` → **82 计 / 82 过 / 0 红 / 0 跳过**（工作树含他人未提交改动；本改动为纯文档，结果与当前基线一致）。
- `git diff --check -- README.md` → 通过。
- 未跑全仓测试与 typecheck（本改动仅 README 文档，不触代码）；未读 `.env`、未发真实模型/网络请求；未 git 提交。
