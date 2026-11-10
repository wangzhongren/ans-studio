# 启动计划：两条固定工作流路径（T3，2026-11-10）

- **任务 ID**：`2026-11-10-two-fixed-workflow-paths`
- **记录角色**：ANS 统筹调度（Scheduler，独立固定上下文）
- **状态**：客户已确认进入开发（2026-11-10「让各自的角色重新开始开发」；设计 v2 第六节四个默认项按默认采纳）。本文件只定判型、路径、分工与顺序；实施判据以 B1 与团队计划为准。
- **依据（唯一产品设计）**：`docs/planning/2026-11-10_design_two-fixed-workflow-paths.md`（95 行 / 8,476 bytes / SHA-256 `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d`，设计草稿 v2）。
- **客户新规则**：**全链跑通前不请求合并/发布**；工作全部在分支上；不打 tag、不发布产物；合并 main 仍需客户逐次确认。

## 一、判型

**T3（产品级重构/高风险）**。理由（同时满足）：

1. 改变内置角色权责与派发权：运营成为生产线唯一派发者；幕僚只派独立验收；幕僚不再派生产线角色（`src/common/roles/chief|convener`、`src/common/gates` 派发父门、`src/provider/runtime/schema.ts` 工具文案/能力）。
2. 改变默认流程状态机：两条固定路径（新增/修改）、3 张客户卡不合并、基线准备 3 件小事、路径 B 轻量流程（编排/运行时/桌面）。
3. 默认路径**取消** trunk ref / bootstrap / 冻结闭包 / 候选 ref / run pin / stable-write 许可；Git 回归普通用法（任务分支提交 + 合并 main 需客户确认）；治理状态改应用账本（`.ans/state/*.jsonl` + 普通文档 `-vN` + 文档哈希入账）。
4. 需要迁移/废弃清单，并保留审计 sidecar、judge 代批、doc_format、文件级写区边界与高风险清单。
5. 验收需确定性测试 + 一次从空项目到出游戏（贪吃蛇）的真机全链，跑通才算完成。

因此走完整治理链：策划实现级方案 → 独立复核（must-fix 闭环）→ B1 验收标准 → 团队计划（按开发侧角色分工）→ 实现 → D1 → 独立 B2 → 真机全链验证。闸门 0/1/2 按客户确认与治理流程执行；不新增客户可见门、不新增角色、不改五个内置角色与项目角色的边界模型（设计 v2 §七）。

## 二、分支与历史

- **新开发分支**：`feat/two-fixed-workflow-paths`，基于 `origin/main` `d9e3e99c160599e5b53a82e105939a359f69992f`（含已合并 #81/#82；`e2b7328` 在主干）。
- **旧分支停用**：`feat/initial-workflow-publication-completion` 暂停留历史（WIP 提交 `4a0bafd…`、`882d84b…`）；不再为旧 trunk 发布机器继续修复；不删除分支。
- **提交/合并**：本变更只在新分支提交；**全链跑通前不请求合并/发布**；`main` 不动；不打 tag、不发布产物。阶段里程碑如实回报客户。

## 三、文档路径（先定路径，内容按阶段产出）

| 阶段 | 产物 | 作者（角色） | 路径 |
| --- | --- | --- | --- |
| 依据 | 设计 v2（客户确认） | 客户/策划 | `docs/planning/2026-11-10_design_two-fixed-workflow-paths.md` |
| 方案 | 实现级方案（工具面/状态机/账本/基线/卡片/迁移） | 策划（业务内置 rapporteur；模块维护 rapporteur-code） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.md` |
| 复核 | 独立复核（must-fix/G 项/限制） | 独立验收 | `角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths.md` |
| 判据 | B1 验收标准（AC/T/RR/EV） | 独立验收 | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md`（任务精确范围授权） |
| 计划 | 团队计划（角色/模块/写集/批次/证据） | 统筹调度/运营 | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` |
| 实施 | 各角色变更记录 | 各 owner | `角色卡/<role>/docs/change/2026-11-10_*two-fixed-workflow-paths*.md` + `_evidence/` |
| 验收 | D1/B2/真机全链记录 | 编排/测试/独立验收 | 各角色记录 + `docs/acceptance/` |

- 所有实现/复核/B1 文档必须绑定上表依据的字节数与 SHA-256；未落盘不视为完成。
- **边界口径（2026-11-10 实测校正）**：`rapporteur-code` 是角色模块维护角色，角色卡明确禁写 `docs/planning/`；业务策划（内置 `rapporteur`）的合法写区是 `docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/`（`src/common/roles/rapporteur/internal/spec.ts`）。因此实现级方案落 `docs/proposals/`，不由 rapporteur-code 写 `docs/planning/`；独立验收写自己的 `角色卡/独立验收/docs/design/`；B1 落 `docs/acceptance/` 由任务精确范围授权（既有先例）。不修改角色卡/边界；若后续确需扩写区，走人事边界修订+客户确认，不得自行扩围。
- 团队计划只能在 B1 冻结后写；写集按现有开发侧角色分工认领模块，单一 owner、零重叠。

## 四、工作流与角色分工（按设计 v2）

| 工作流 | Owner | 模块/写区（初始认领，最终以团队计划为准） |
| --- | --- | --- |
| 生产线派发权收拢、团队计划、基线准备、集成汇总 | 运营 / convener-code | `src/common/roles/convener/`；`docs/scheduling/` 团队计划；基线准备 3 件小事（git init/哈希入账/计划落盘） |
| 产线调度、3 张卡、派发独立验收、验收强度、专业建议决策；移除生产线派发 | 幕僚 / chief-code | `src/common/roles/chief/`；`src/provider/runtime/schema.ts` 中 chief 工具文案/能力；`src/common/gates/` 派发父门 |
| 意图/方案/名单/模块/架构/契约等角色提示与工具面 | 产品/策划/人事/验收（product-code/rapporteur-code/nominator-code/verifier-code） | 各自 `src/common/roles/<role>/`；角色卡文本、capabilities、decision 卡数据 |
| 流程状态机简化、账本 hash、审计保留、Git 机制默认路径退役 | 编排 | `src/pipeline/orchestration/`、`src/service/`（流程与账本接线；不新增治理型 Git 机制） |
| 卡片呈现、会话/派发/账本 UI 接线、基线准备触发 | 桌面窗口 | `app/desktop/`（沿用现有卡片呈现；不做 UI 改版） |
| 工具面/schema/准入与派发判定、默认路径不触达旧机制 | 运行时核心 / gates-code / shared-code | `src/provider/runtime/`、`src/common/gates/`、`src/common/shared/`（按团队计划拆分） |
| 确定性回归、跨层集成、真机全链 | 测试 | `test/**`（按团队计划分配；真实 Electron/模型验证单独授权与排期） |
| 独立复核、B1、B2 | 独立验收 / verifier-code | `docs/planning/` 复核、`docs/acceptance/` 判据与报告；不实现产品代码 |

- **迁移/废弃清单（方案必须逐项给出）**：trunk ref、bootstrap、冻结闭包、候选 ref、run pin、stable-write 许可、16 MiB 清单预算、发布租约、run 歧义，以及旧状体/门禁/工具面的保留、废弃、仅兼容三种处置；审计 sidecar、judge 代批、doc_format、写区边界、高风险清单保留。
- **不新增角色/客户门**；不改五个内置角色与项目角色的边界模型；发布/tag 仍需客户明确授权。

## 五、顺序与出口

- **进展（2026-11-10）**：方案 v1 `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.md`（`279f55dc…`）已产出；独立复核 v1 结论 **需修订**（MF-1…MF-8，见 `角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths.md`，`df1992df…`）；正在产出方案 v1.1，B1 尚未开始。复核报告已提交分支（`8905a4a`）。

1. **策划实现级方案**：读设计 v2 + 全量清点现有机制/工具面/状态机/账本/卡片/迁移；产出实现级方案；不写代码。
2. **独立复核**：must-fix 闭环；复核结论可提交后进入 B1。
3. **B1**：AC/T/RR/EV 全部可判定；冻结哈希。
4. **团队计划**：Scheduler/运营按 B1 与现有角色分工写模块/写集/批次/证据；单一 owner、零重叠。
5. **实现批次**：按依赖顺序（派发权/状态机 → 角色模块 → 账本/基线 → 桌面/卡片 → 兼容/废弃 → 测试）在分支提交；每批 D1 级自检，最终 D1。
6. **独立 B2**：按 B1 全量判定；不通过不进入真机。
7. **真机全链**：从空项目到出游戏（贪吃蛇），真实 Electron + 真实模型 + 真实 UI；隔离实例；预算另报；跑通才算完成。
8. **交付**：里程碑如实回报；全链跑通前不请求合并/发布；合并 main 需客户逐次确认。

## 六、协调项与默认处置

1. 设计 v2 §六四个默认项按默认采纳：基线失败只回报幕僚/运营；路径 B 由幕僚判断（客户可覆盖）；幕僚暂停/改道具备请求能力、运营执行；合并 main 客户本人确认卡（可 judge 代批，高风险清单不变）。
2. 旧分支/旧 trunk 修复不再推进；现有项目（贪吃蛇 target 历史 trunk t1/t2）按新路径忽略 trunk 概念。
3. 本轮为 T3：任何写集外文件、新依赖、权限/边界变更、客户门变化、预算提升，均先停止并回报；不自行合并/发布。
4. Scheduler 只写 `docs/scheduling/`；方案/复核/B1/实施由对应角色写并回报哈希。
