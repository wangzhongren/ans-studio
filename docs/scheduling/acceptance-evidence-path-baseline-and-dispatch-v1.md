# acceptance-evidence-path 实施：B0 基线与逐角色预留/派发记录 v1

- 任务 ID / flowId：`2026-11-01-acceptance-evidence-path` / `acceptance-evidence-path`
- 记录角色：ANS 统筹调度（Scheduler，独立上下文）
- 日期：2026-11-01
- 性质：统筹的任务记录（非 task_ops 机器状态；无 `.ans/project.json`，未启用 task_ops）
- 依据：客户确认方案 P1.2（396 行 / `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9`）；闸门 2 确认团队计划（431 行 / `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3`）；实施授权（`docs/communication/2026-11-01_intent_acceptance-evidence-path.md`「实施授权记录」）；V1 标准（580 行 / `8f3e4b73d967d0572c2fda2bffb3ff968ba09303a33546e6b16a0c1b48c76179`）。
- 当前状态：**E2b 通过（AC-1–AC-8 8/8，报告 v2：146 行 / `06f142051431dc17fc88a3ec36744bbf29a9d3d65f59dd879eb8304843fda151`）**；E1 已按 E3 重冻；待沟通向客户请示提交授权（提交/推送/合并/发行不在既有授权内）；未 commit/push；不发行。

## 一、派发前置核验（2026-11-01，盘上实测）

| 项 | 状态 | 实测 |
| --- | --- | --- |
| 闸门 2 | 已确认 | 沟通记录「闸门 2 记录（2026-11-01）」：客户「确认闸门 2：参与角色、写集与边界条目」；对象团队计划 431 行 / `94f80cff…`（§九按实际校正为 14 项） |
| 实施授权 | 已给 | 同文件「实施授权记录」：客户「授权开始实施」；提交/推送/合并/发行不在授权内 |
| B-1 边界条目 | 已落地并核验 | 桌面窗口 `boundary.md`+`boundary.yaml` 新增 `test/桌面应用/acceptance-proposal-path.test.ts` 精确条目；3 个治理文件 / 7 行新增；md/yaml 一致；boundary-yaml 测试 17/17 |
| V1 标准 | 已写盘并经沟通确认 | `docs/acceptance/acceptance-evidence-path-criteria-v1.md` 580 行 / `8f3e4b73…`；AC-1–AC-8；AC-8 只以方法 A 为充分证据 |
| 工作树 | 无产品/测试改动 | `git status --porcelain -- src app test` 为空；`git diff --cached` 为空；HEAD `eb77fadafc4df40594938798645da111665027c3` |
| task_ops | 未启用 | 无 `.ans/project.json`；不伪造机器状态 |

## 二、B0 基线（测试角色，独立上下文；节点 B0）

- 证据记录：`角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-B0.md`（261 行 / SHA-256 `147c04fddb66a2fd86345a721b8dcd45d323e8bbdc40831fa55ff0b389543fc3`）
- 原始日志：`C:\Users\51054\AppData\Local\Temp\ans-acceptance-evidence-path-evidence\B0\`（manifest 26 行 / `664cd3d4…`）
- 环境：HEAD `eb77fad`（tree `4e4d6dd1…`）；Node v24.22.1 / npm 11.19.1；node_modules 已装；Electron 44.7.0 二进制存在；无 task_ops。
- `npm run typecheck` exit 0；`typecheck:renderer` exit 0；`build:renderer` exit 0（vite 5.07s，`dist/` 忽略产物）。
- 受影响套件基线：
  - `acceptance-evidence` + `run-pin` → **15/15/0/0/0**（exit 0）
  - `acceptance-judge-minimal` + `decision-evidence-packet` + `workflow-preconditions` → **33/33/0/0/0**（exit 0）
  - 五文件串行（D1 既有子集）→ **48/48/0/0/0**
  - `test/桌面应用/*`（49 文件）→ **444/444/0/0/0**
  - `test/编排/**`（51 文件）→ **639/638/1/0/0**（唯一失败 `shell-authorized-routine.test.ts:184` 既有 Windows symlink EPERM）
- 失败分类：唯一红为既有环境失败（EPERM symlink，独立探针 + 上一 B0 同项）；其它确定性失败 0、新增失败 0、新增 skip/todo 0。
- 目标文件写前哈希（均与 HEAD blob 一致）：
  - `app/desktop/session.ts`：blob `b3bfdee7…` / sha `9dace0fb…` / 7785 行
  - `src/common/编排/governance-judge-facts.ts`：blob `6d5d368c…` / sha `72fd06f5…` / 328 行
  - `test/编排/acceptance-judge-minimal.test.ts`：blob `8bdc4db7…` / sha `dc3c33bb…` / 140 行
  - 新文件 `test/桌面应用/acceptance-proposal-path.test.ts`、`test/编排/governance-judge-facts.test.ts` 均 absent
- 试跑现场（只读）：别名 `docs/proposals/textkit-cli-v1.md` 存在 / `d6cad5f2…`；真实提案 `textkit-cli-proposal-v1.md` / `a2bdbee2…`；manifest `run-20261101-textkit-cli-87325f96` `state=pinned`、`documents.proposal.path` 指向真实提案；`docs/proposals/` 无 `-proposal-v2+`；具备 D2 方法 A 区分条件。
- **应用状态与计划基线不一致**：B0 实测 **ANS 应用正在运行**（PID 21192，命令 `electron app/main.ts --remote-debugging-port=9235`，来自本 worktree，启动于 08:53:09，运行修复前代码）。团队计划 §1.4 写「应用当前关闭」为写计划时事实；D2 必须用修复候选重新构建/启动并建立候选身份，当前实例不能作候选证据。B0 未启动/停止任何进程。
- 沟通记录并发追加：B0 记录列明快照（B0 时 83 行 / `f7967434…`；V1 引用 76 行 / `a95baf85…`；团队计划时 61 行 / `47b9b707…`），按管理记录处理，不混产品候选。

## 三、逐角色预留（写集 / 冲突 / 热点单写者）

| 节点 | roleId / 角色 | 预留写集 | 独占/热点 | 冲突结论 | 状态 |
| --- | --- | --- | --- | --- | --- |
| B0 | 测试 | `角色卡/测试/docs/change/` B0 记录 | 自身 docs | 无 | **完成** |
| A1 | 桌面窗口 | `app/desktop/session.ts`、`test/桌面应用/acceptance-proposal-path.test.ts`（H1 已授权）、自身 docs | `app/desktop/session.ts` 单一写者；`test/桌面应用/` 只写该新文件（既有 acceptance-evidence/run-pin 只读回归） | 与 A2 写集不相交；H1 已完成 | **派发中** |
| A2 | 编排 | `src/common/编排/governance-judge-facts.ts`、`test/编排/governance-judge-facts.test.ts`（新）、`test/编排/acceptance-judge-minimal.test.ts`（更新）、自身 docs | `src/common/编排/governance-judge-facts.ts` 单一写者；`test/编排/` 只写上述两文件 | 与 A1 不相交 | **派发中** |
| D1 | 测试 | `test/测试/`（默认不新增）与自身 docs；只读候选 | 不写产品/其他角色测试 | 等 A1+A2 | 排队 |
| D2 | 测试（桌面窗口按需支持构建/启动） | 试跑项目别名移出/还原（非产品写集）；自身 docs；不写产品 | 试跑项目方法 A 需现场授权 | 等 D1 + 现场授权；应用需候选重启 | 排队 |
| E1 | 统筹 | `docs/scheduling/` | 自身写区 | 等 D1+D2 | 排队 |
| E2 | 内置独立验收 | `docs/acceptance/` | 自身写区 | 等 E1 | 排队 |
| E3 | 统筹 → 沟通 | `docs/scheduling/`、`docs/communication/`（沟通） | — | 等 E2 | 排队 |

### 3.1 冲突与热点结论

- A1/A2 写集**完全不相交**，可并行；`app/desktop/session.ts` 与 `src/common/编排/governance-judge-facts.ts` 各自单一写者。
- 当前工作树无产品/测试改动；B-1 边界条目、memo、V1 等为既有状态（非产品候选），worker 不得触碰。
- `test/桌面应用/acceptance-evidence.test.ts`、`run-pin.test.ts`、`test/编排/decision-evidence-packet.test.ts`、`workflow-preconditions.test.ts` 只读回归，不得修改（若因本修复失效，逐条报告，不弱化）。
- 桌面窗口与编排不得写 `src/common/shared/**`；若确需导出 `latestVersioned`，停止并回报统筹（重开闸门 2/项目管理参与）。
- 逐节点启动前再执行 `git status --short -- <写集>` 与哈希核对；发现写集外改动立即停止回报。

### 3.2 A1/A2/D1 完成与候选冻结（2026-11-01）

| 节点 | 完成报告（路径 / 行数 / SHA-256） | 关键结果 | 候选/冻结 |
| --- | --- | --- | --- |
| A1 桌面窗口 | `角色卡/桌面窗口/docs/change/2026-11-01_change_acceptance-evidence-path-A1.md` / 121 行 / `92151e9d…` | `session.ts` 按 pinned manifest > 最新 `-proposal-vN` > 缺失修复（+10/−1）；新增 `test/桌面应用/acceptance-proposal-path.test.ts`（419 行，T1/T1b/T2/T2b/T3/T4/T5 7 项）；required 22/22、桌面目录 451/451；typecheck 0 | `session.ts` blob `ca3d96b3…` / sha `d60ba7c8…`；新测试 `ff2db774…` / `a1be01dd…` |
| A2 编排 | `角色卡/编排/docs/change/2026-11-01_change_acceptance-evidence-path-A2.md` / 147 行 / `7964d5fb…` | `governance-judge-facts.ts` 文案改 `-proposal-v1.md`（+注释）；新增 facts 单测 6 例；minimal 更新；targeted 39/39；编排目录 645/644/1（既有 EPERM）；typecheck 0 | `facts.ts` blob `49b960c3…` / sha `e3ed3ad1…`；新测试 `6346f811…` / `6eb08244…`；minimal `db398766…` / `39a11243…` |
| D1 测试 | `角色卡/测试/docs/change/2026-11-01_change_acceptance-evidence-path-D1.md` / 206 行 / `f3654135…` | 方案 §5.3 七文件 **61/61**；桌面目录 **451/451**；编排目录 **645/644/1**（唯一失败为 B0 同项 EPERM）；typecheck/typecheck:renderer/build 0；AC-1–AC-7 证据映射；新增确定性失败 0、新增 skip 0 | 候选 5 文件哈希与派发一致；写集外改动=无 |

- 应用状态提示（B0 已记录）：当前有旧代码实例（PID 21192）在运行；D2 必须用修复候选重新构建/启动并建立候选身份，不得使用旧实例作为证据。
- D2 前置：先只读确认试跑项目能否再次发起验收卡、方法 A 现场授权与别名可移动性；不允许则停止回报（AC-8 记 insufficient evidence），不得伪造或仅用方法 B/客户手批替代。

## 四、派发顺序与门

- 已完成：G2（闸门 2）→ H1（B-1）→ V1（标准）→ B0（基线）。
- 进行中：**A1 / A2 并行**（写集不相交；均基于同一 HEAD/基线）。
- 后续：D1（跨模块回归）→ D2（真实试跑方法 A；先确认现场能否重发验收卡，不允许则停止回报，不伪造）→ E1（变更包）→ E2（内置独立验收，由沟通启动）→ E3（放行/回报）。
- 每节点入口核对：前置退出条件、写集预留、基线哈希一致、无并发写；缺一不启动。

## 五、环境与现场提示

1. **应用正在运行旧代码**：B0 实测 PID 21192 为修复前实例；D2 前必须构建/启动修复候选并记录候选身份；不得拿旧实例当候选证据。A1/A2/D1 不启动/停止应用。
2. **试跑别名**：D2 方法 A 需临时移出 `textkit-cli-v1.md`（sha `d6cad5f2…`）并验证后按原字节还原；需试跑项目所有者/客户现场确认（闸门 1 已授权方法 A）。
3. **试跑项目生命周期**：第三次验收已 judge accept；D2 先确认能否再次发起验收卡；不允许则 AC-8 insufficient evidence，停止回报。
4. **方法 B/关闭「替我决策」/客户手批**：不能单独判 AC-8 pass，只能补充。
5. **无 task_ops**：不伪造机器状态；证据以文件/原始输出为准。

## 六、状态与下一步

- B0/A1/A2/D1/D2 已完成并取证；D1 通过（仅既有 EPERM）；D2 方法 A 成功。
- **E2b 通过**：`docs/acceptance/acceptance-evidence-path-report-v2.md`（146 行 / `06f14205…`；AC-1–AC-8 全部 pass，8/8）；首次报告 v1（249/`cc274259…`）未改。
- **E1 已按 E3 重冻**：`docs/scheduling/acceptance-evidence-path-change-v1.md`（最终候选 25 路径 = E1 23 + v1 报告 + v2 报告；产品/测试 5 + 治理/记录 20）；最终哈希由统筹回报沟通。
- **下一步**：沟通向客户请示提交授权；未获明示前不 commit/push、不合并、不发行。E3 放行只表示当前候选满足标准。
- 本记录不改变已确认的团队计划/方案/标准；任何范围或写集变化停止并回报沟通/客户，重开对应闸门。
