# 变更记录：P2 编排——治理卡判断 agent（「替我审批」/「替我决策」）

- 日期：2026-10-18
- 角色：编排
- 依据：`角色卡/项目管理/docs/design/2026-10-18_design_judge-governance-cards-review.md` §五–§七、§十、§十二（status approved）；P1 运行时核心契约已冻结。
- 边界：只改 `src/common/编排/`、`src/pipeline/orchestration/{run-role.ts,govern-session.ts}`、`src/provider/runtime/tools.ts`（仅回执）、`test/编排/`、本角色文档。未碰门禁引擎、运行时核心、适配器、桌面、UI。

## 一、交付内容

### 新增（`src/common/编排/`）

| 文件 | 职责 |
| --- | --- |
| `governance-judge.ts` | `createGovernanceJudge` / `GOVERNANCE_JUDGE_SUPPORTED_RUNTIMES` / `governanceJudgeAuditOf`。复用 shell judge 生命周期骨架（不抽 `judge-session.ts`、不改 `shell-judge.ts`）：合成角色、`persistSession:false`、deny-all、只读能力注入、15s、中止、busy、无防循环。 |
| `governance-judge-prompt.ts` | 稳定系统提示（只读代理、正向代批、不可信数据、`.ans/**` 硬排除、六卡种 rubric、输出契约）＋本次请求提示（卡片/路径/探测/事实/必读物证/`turnText` 截断）。 |
| `governance-judge-verdict.ts` | **唯一规范化点**：严格取值域、accept-quick 不代批、任命恰等推荐集、写根/禁写/来源匹配、`pathProbes`+`pathDecisions` 逐路径复核、required-read、读取损伤/账本错误 fail-closed、模型 `reasonCode` 安全映射、审计有界。 |
| `governance-judge-facts.ts` | 有界账本事实（字符串 ≤128B、数组 ≤50、整体 ≤8KB）、逐卡种规范物证、提名推荐集解析（frontmatter/固定行、缺失/歧义 ⇒ undefined）。 |

### 修改

- `src/pipeline/orchestration/run-role.ts`
  - `AdapterCapabilities.governanceJudge` + 工厂透传。
  - `governedInput` 计算 `judgeContext`（唯一计算点；仅 trio + 允许 cardKind + 合法 flowId；先刷新账本；paths/pathProbes 与 issuer 同一份；错误 ⇒ `unavailableReason` + `ledgerErrors:1`）。
  - `recordCustomerDecision`：`decisionEvidence.kind:"judge"` + 有界 judge；`actorRoleId`/`power` 不变；group 交叉校验只诊断；审计失败诊断。
- `src/common/编排/governance-ledger.ts`：`kind` 增 `"judge"`、增 `judge?: GovernanceJudgeAudit`。
- `src/provider/runtime/tools.ts`：两交互工具的 judge 代批回执（含「不是客户本人点击」）；客户手批文案逐字不变。
- `src/pipeline/orchestration/govern-session.ts`：按 §7.6 薄再导出。

## 二、关键机械门槛（fail-closed）

1. 账本 `ledgerErrors > 0` 或 `unavailableReason` ⇒ 所有 approve → manual。
2. 读取被拒/截断/预算耗尽 ⇒ approve → manual（预算优先）。
3. 规范物证缺失 ⇒ `artifact-missing`；必读物证未实际读取 ⇒ `artifact-not-read`；必读超预算 ⇒ `budget`。
4. confirm 卡：`paths` 非空、`pathProbes` 全 `allowed`、路径在写根内且不在禁写前缀、来源角色写区匹配、`pathDecisions` 精确覆盖且全 ok；任一不满足整卡 manual，不发行 writeSet。
5. `appointment-write` 目标必须在最新任命名单且非内置；`schedule-write` 路径必须匹配 flowId。
6. proposal/acceptance 只接受 `["accept"]`；`accept-quick`/`revise`/`reject`/空选择 → manual。
7. appointment `selected` 恰等于 `recommendedRoleIds`（无重复、⊆ 选项、非内置、多选一致性）。
8. 模型自报 `reasonCode` 仅安全名单透传，其余 `model-manual`。
9. **acceptance 流程完成度（P6 验收观察）**：提示前读流程单 + 账本——所有步骤 `done`、每步都有 `dispatch.accepted`、无 `unclassified`/`none` 未结算决定、无未闭环澄清、账本可读；任一不满足直接 `manual`，不调用模型、不靠模型自报。
10. **write 新文件（P6 真机缺陷）**：`write` 卡 artifacts/required-read 只收**已存在**的相关物证；新建目标不进入 required-read（读必失败），改由 `preview` 正文核对；`preview` 为空 ⇒ `manual/insufficient-evidence`。`appointment-write`/`schedule-write` 的 nomination/flow 要求不变。
11. 双开关后 shell 出路句统一为 `如需执行，请关闭「替我审批」后重试。`（不再写「替我审」）。
12. **治理 judge 超时（P6 真机修复）**：默认 `60_000ms`；`ANS_GOVERNANCE_JUDGE_TIMEOUT_MS`（正整数，非法回默认）覆盖；计时只从模型判断开始（不含排队/等卡），文案带时长（如「判断超时（>60s）」）；shell judge 保持 15s。
13. **物证命名容忍（P6 真机修复）**：`<flowId>-vN.md` 与 `<flowId>.proposal-vN.md` / `<flowId>.nomination-vN.md` 均解析，取最大版本；找不到才 `artifact-missing`。
14. **pathProbes 声明路径（P6 真机修复）**：只取 preview 的「一行一个路径」声明；关键词后可直接跟路径（`将写入 docs/x.md`），关键词与冒号间允许修饰词（`写入路径仅一条：docs/x.md`），列表符/`路径：`标签/反引号容忍；不扫描散文；散文路径不进入候选；越界声明路径仍 `allowed:false` 并整卡回落。
15. **boundary.yaml 写前内容校验（P6 真机修复）**：`write_file`/`edit_file` 目标匹配 `角色卡/<id>/boundary.yaml` 时，用门禁引擎 Service 公共出口 `validateBoundaryYamlText` 校验最终内容；非法 ⇒ 拒绝写入、零文件副作用，回执「boundary.yaml 格式非法：<原因>；顶层只允许 role / entries / archived，请按模板重写」；`role-card.md` 与其他路径不校验内容。
16. 测试：judge **38/38**、boundary 校验 **4/4**、`test/编排` **516 计/515 过**（symlink 环境红）、typecheck 0；全量仍受并行他域改动影响未能取得完成快照（此前完成快照 2900/16 红均他域/环境）。

## 三、证据

- 新增 `test/编排/governance-judge.test.ts` **32/32**。
- 相关既有套件 **74/74**；P6 验收套件 **42/42**。
- `npm run typecheck`：**0 错**。
- 全量三层 glob `node --test "test/**/*.test.ts"`：**2900 计 / 2881 过 / 16 红 / 3 skipped**。16 红逐条归因均为他域/环境既有：9 条 Windows symlink EPERM、5 条桌面 renderer 既有红（`test/桌面应用/`，文件未动）、vendor markdown-it pin 1 条、`test/runtime-core/tools.test.ts` abort shell 1 条（单跑通过，全量负载下时序 flake）。本批零新增红。

## 四、偏离/未做（如实登记）

1. 桌面侧诊断事件（`governance-judge.switch.off`/`row.failed`）与状态机/结果行归 P4；`read.denied` 无逐调用回调，driver 以 `manual/read-denied` 汇总。
2. shell 审计 `group:"approval"` 与桌面 operator-channel 归 P4（§7.1 明示 V1 不改 `shell-judge.ts`）。
3. 回执在 §7.5 金文本基础上增「代审批/代决策」分组标记，以满足 §10.2。
4. required-read 的「confirm 卡已存在目标文件」由 driver 用 `stat` 机械判定（不新增契约字段）。
5. 未 git 提交；未读 `.env`、未跑真实模型/凭据/网络。
