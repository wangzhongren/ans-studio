# 意图确认：flow_step_update 的 artifact.observed 时序修复（T2 小变更）

- 日期：2026-10-23
- 提出人：客户
- 记录角色：ANS 沟通（Communication）
- 闸门 0 状态：**已确认**（客户贴出现场错误并明确「这个顺带修复一下」）
- 目标版本：**v1.7.0**；独立 T2 小变更，不与角色根文档展示、i18n、目录 v3、治理写卡门禁、验收返工路由合并验收。
- 排期：角色根文档 S1 基线完成后实施，避免在基线快照期间改动 `src/`；不阻塞角色根文档方案/闸门 2。

## 客户原话

> flow_step_update：操作**未完成**（ok=false；code=insufficient-evidence；revision=1dd21a24…；error=账本缺少 artifact.observed（path=docs/scheduling/ai-governance-pipeline-change-v5.md）；issues=steps[62].evidence: 账本缺少 artifact.observed（path=docs/scheduling/ai-governance-pipeline-change-v5.md））
>
> 这个顺带修复一下

## 现场事实（只读）

- 目标 `ans-gateway/docs/flows/ai-governance-pipeline.yaml`：`change-package-v5` 为 `delivered`，`kind: artifact`；`docs/scheduling/ai-governance-pipeline-change-v5.md` 存在（14,400 B，2026-10-23 21:51 本地）。
- 账本已有 `change-package-v5` 的写盘 `customer.decision`（13:49:21Z、13:51:07Z），但**没有**该路径的 `artifact.observed`；错误在 `steps[62].evidence`。
- `src/common/编排/flow-service.ts` 的 `flow_step_update` 在 `status=done` 时读取账本并用 `validateFlowEvidence` 对账；`src/pipeline/orchestration/run-role.ts:1644` 的 `artifact.observed` 是角色事件/一轮结束后扫描新增/变更文件才追加，存在同一轮“写盘后立刻标 done”的时序竞争。
- 这不是文件没写、权限不足或证据路径错误，而是**账本观测晚于收口调用**；目标步骤后续在观测出现后重试即可成功。

## 意图理解

1. `flow_step_update` 把一个 `kind: artifact` 的步骤标 `done`、且证据文件已存在但账本尚未有同路径 `artifact.observed` 时，由应用**安全地补一次观测**：按现有安全规则读取声明的证据文件、计算 sha256、追加 `artifact.observed`，然后重新对账并完成本次更新。
2. 只在证据路径安全且文件为常规文件时补观测；缺失、符号链接、项目外、`.ans`/`角色卡`/`.git`/`node_modules`、超大/二进制、账本写入失败一律保持 `insufficient-evidence`/失败，**不伪造 done**。
3. 不新增账本字段/枚举/权限/角色工具；不改变 `artifact.observed` 的证据模型；不直接改写 flow YAML 或账本；不自动 accept/reject，不影响客户最终决定权。
4. 目标项目零写入；修复只改 `ans-studio` 产品代码与测试。目标现场仍按“等下一次观测后重试”处理。

## 非目标

- 不把“文件存在”当成“步骤完成”；不绕过 `validateFlowEvidence`。
- 不修改目标 `ans-gateway` 的 flow/账本/报告/角色卡。
- 不改变 Windows 受限文档读取、角色根文档展示、i18n、目录 v3、验收返工路由的范围。
- 不新增角色/边界/权限/依赖/发布配置。

## 风险档位建议

**T2**：修复编排 flow 证据收口时序，涉及 `flow-service.ts` 与测试，不改变治理/权限/角色边界；需要独立测试与验证。若实施发现需要改证据模型/枚举/权限或目标写入，停止并按 T3/重开闸门处理。

## 闸门 1 与实施授权（2026-10-23）

- **客户原话**：「确认 Q1–Q5 A；按方案 A 实施，只改 flow-service 与 flow-service 测试。」
- **确认对象**：`docs/planning/2026-10-23_design_artifact-observation-race.md` **方案 v1**（282 行；SHA-256 `d464fb70d7022daad61f7837f1c6cd3b7ce478cbafca55a79fb747e3b85de2c1`）。
- **确认结论**：Q1 追加失败用既有 `ledger-write-failed`；Q2 沿用 `looksBinaryObserve` 既有二进制口径；Q3 observation 记 `step.owner`/`artifactPowerOf(owner)`；Q4 保留 `issues` 形状、仅在 `error` 增加补观测失败原因；Q5 目标现场在 v1.7.0 后重试同一更新，不自动补历史、不写目标。
- **实施授权范围**：只改 `src/common/编排/flow-service.ts` 与 `test/编排/flow-service.test.ts`；T2；不新增账本字段/枚举/权限/角色工具；不改 Provider/renderer/preload/角色卡/边界/目标项目；不 commit/push/合并/发布。独立小变更，不与角色根文档展示合并验收；实施后测试角色重新冻结角色根文档 S1 上游快照。
- **下一步**：编排实现 + 定向测试；测试角色独立复跑/复算；独立小验收；不声称验收通过。

## 下一步

1. 策划/编排写最小修复方案与测试矩阵（复用 `observeFlowArtifacts` 的安全规则，不嵌套串行队列）。
2. 编排实现 `flow_step_update` done 时的安全补观测与一次重试；测试覆盖存在/缺失/符号链接/项目外/已观测/追加失败。
3. 测试角色跑受影响套件与 fail-closed 负例；独立验收按 T2 小变更判定；不 commit/push/发布。
4. 与角色根文档展示一起纳入 v1.7.0，但保持独立候选/独立结论。
