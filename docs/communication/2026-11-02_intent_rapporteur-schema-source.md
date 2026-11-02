# 意图确认：给策划角色卡加「契约以角色卡/contract_check 为准」纪律

- 日期：2026-11-02
- 提出人：客户
- 记录角色：ANS 沟通（Communication）
- 闸门 0 状态：**待客户确认**
- 变更类型：内置角色提示词/角色卡文本修订；预计风险档位 **T2**（由策划定档）

## 客户原话

> 你应该修改一下策划的提示词吧

（上下文：dogfooding 运行中，策划/rapporteur 为找 roster schema 反复猜读宿主仓库 `src/service/public/roster.ts`、`src/common/shared/roster.ts`、`src/model/roster.ts` 等不存在的文件；实际 schema 在 `src/common/编排/workflow-preconditions.ts`（`PROJECT_ROSTER_SCHEMA = "project-roster/v3"`），预期入口是 `contract_check`。这些读取是只读探索，未写宿主仓库；策划最终完成 roster v8。）

## 意图理解

给内置策划角色的提示词加一条纪律：**契约/schema 以本角色卡与 `contract_check` 的输出为准**；不要读取或猜测宿主仓库 `src/**` 的实现文件（如 `roster.ts`/`topology.ts`）；宿主源码不是本项目的契约来源；缺信息先调用 `contract_check`，仍不足则如实报告或请求澄清，不得靠猜文件路径。

## 建议改动（最小）

- 文件：`src/common/门禁引擎/governance-roles.ts` 的 `RAPPORTEUR_CARD_TEXT`（内置策划角色卡文本）。
- 在产物说明之后、纪律段落中加入一行（最终措辞由策划方案定稿）：
  > 契约/schema 以本卡与 `contract_check` 输出为准；不要读取或猜测宿主仓库 `src/**` 的实现文件（如 `roster.ts`/`topology.ts`）。宿主源码不是本项目的契约；缺信息先调用 `contract_check`，仍不足则如实报告/请求澄清。
- 不改 roster/proposal schema 或机械校验；不改其他角色卡；不改 `contract_check` 实现；不改变写权/边界/验收。

## 根因（2026-11-02 只读核对，新增）

- 角色会话的 `readRoot` / `shellCwd` 已正确钉在目标项目（`src/pipeline/orchestration/run-role.ts:2317/2319`），相对路径不会进入宿主仓库。
- 但 `read_file` 对**绝对路径**直接读取、没有项目根边界检查（`src/provider/runtime/tools.ts:521-523`：`isAbsolute(path) ? path : resolve(readRoot, path)`）；`list_dir` 反而有 `outside-root` 拒绝（`:541-547`）。
- 策划是在 05:52 运行了一条 PowerShell 进程枚举（`Get-Process ... Path`，日志 `dogfood-run.jsonl:206`，被允许），看到宿主 app 路径 `C:\Users\51054\Desktop\work\ans-studio`，随后推理「validator likely in ans-studio source」（`:207`），开始用绝对路径猜读宿主 `src/**`；其中对宿主源码的 shell grep 被 shell judge 拒绝（`:211`）。
- 结论：**只改提示词不能关闭这条路径**；要真正阻止，需要同时收紧 `read_file` 的绝对路径边界（或明确允许/审计宿主源码读取）。这是比提示词更大的改动，需单独定档。

## 范围与待确认

- **Q1**：是否只改策划角色卡？（默认是；如要所有内置角色都加一条通用纪律，请说明。）
- **Q2**：是否同时改进 `contract_check`，在名单不存在时也输出 schema 摘要？（默认否，属独立改动。）
- **Q3**：是否接受「该修改不影响当前正在跑的 dogfooding（已加载的进程/会话），需新 app 运行才生效」？
- **Q4**：是否需要新增/更新角色卡文本测试？（策划方案会给出建议。）
- **Q5（根因相关）**：是否同时收紧 `read_file` 的绝对路径边界——项目外绝对路径默认拒绝（或仅允许显式授权/审计的宿主读取）？默认建议纳入；这会改变角色读取能力，风险档位可能升到 T3，需要策划定档与验收。

## 非目标（默认）

- 不改 roster/proposal 的 schema 或机械校验；不改其他角色职责；不改写权/边界；不重启当前 dogfooding；不 commit/push（提交另行授权）。

## 已授权边界

- **已授权**：闸门 0 意图确认与只读调查。
- **未授权**：方案（闸门 1）、团队计划（闸门 2）、实施、提交/推送/发布。

## 下一步

1. 客户确认/修正本意图（闸门 0）。
2. 沟通启动策划上下文出方案；独立复核 → 闸门 1；统筹团队计划 → 闸门 2；实施授权后派发。
