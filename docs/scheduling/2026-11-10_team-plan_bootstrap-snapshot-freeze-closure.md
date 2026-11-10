# 团队计划：bootstrap 快照/冻结闭包冲突修复（T3，2026-11-10）

- **任务 ID**：`2026-11-10-bootstrap-snapshot-freeze-closure`
- **产品 flowId（拟）**：`bootstrap-snapshot-freeze-closure`
- **记录角色**：ANS 统筹调度（Scheduler，独立固定上下文）
- **日期**：2026-11-10
- **状态**：团队计划已写盘。闸门 0 由缺陷记录/协调方授权；闸门 1/2 按预授权；T3 已由协调方确认。实施可在当前分支推进，**B1+B2 必须同 PR/同批次**；合并需客户逐 PR「允许我合并」；发布/tag 未授权。
- **风险档位**：**T3**（涉及 `classify-shell.ts` 门禁政策语义；共享抽象+治理判定；冻结保护不弱化、fail-closed 保持）。不可拆成两个各自可通过的批次。
- **唯一实施基线（方案 P1.1）**：`docs/planning/2026-11-10_design_bootstrap-snapshot-freeze-closure.md`（477 行 / 68,367 bytes / `643cb33f9a7ee228e7803b652451c5b0a23554a163edb73a618bd1cd4ef74dc0`；P1.0 `1f6afc15…` 历史）。
- **独立复核**：`docs/planning/2026-11-10_review_bootstrap-snapshot-freeze-closure.md`（R1.0+R1.1 263 行 / 43,407 bytes / `17453813867397bb028c851c8bedbcb1ddf5d479e959f685d3dab3f862e76a0e`；R1.1：M1/M2/G1–G4/S1–S7 全闭合、0 must-fix、建议提交；N1–N6 不阻断）。
- **B1 v1（冻结，唯一判据）**：`docs/acceptance/2026-11-10_bootstrap-snapshot-freeze-closure-criteria-v1.md`（256 行 / 49,013 bytes / `9b7fa81cf4db2bb843691c88e929d49bd193a1f73d0944be3c329b41c6e0bc8b`；BASE-1–8、AC-1–14、T1–T19、RR-1–8、EV1–6；55 条全部 `未取证`）。
- **缺陷记录**：`docs/communication/2026-11-10_defect_bootstrap-snapshot-freeze-closure-conflict.md`（36 行 / 2,733 bytes / `63f6e239…`）；RR19 `角色卡/测试/docs/change/2026-11-10_RR19_snake-full-chain.md`（`a4a90ebe…`）。
- **基线/分支**：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/bootstrap-snapshot-freeze-closure`（基于已提交 `0ab25843a9b2e3e187c47a1c14ef51da187414b9`，含 doc-format #81；#81 未合并）；`src app test` 干净。**实施基线**：`git fetch origin` 后以 `origin/main`（`caabeea…`）+#81（`ecf9ead`）重取；#81 先合并后 rebase，或 stacked PR（base=`feat/document-format-specifications`）后 retarget；不得把两变更压成一个 PR。
- **串行/合并**：B1+B2 同 PR/同批次；`apply-journal.ts` 编排单写者、`classify-shell.ts` 门禁单写者、`test/测试/` 测试单写者；合并前互相 diff；后合并方 rebase 并重跑双方矩阵。方案/缺陷/复核三份记录随实施 PR（或 docs-only 提交）归属，不得孤儿化。

---

## 一、任务（按 P1.1 / B1，不扩大）

1. **bootstrap 快照装配**：direct bootstrap VCA 的完整快照按 targets × 全部 `event:"frozen"` 记录文件（8 frozen 含 intent v1 + versions.jsonl = 9 文件）装配；记录 sha 必须等于磁盘字节；排序/去重；快照 ID/digest 算法不变；两处捕获共用 helper。
2. **冻结闭包谓词精确化**：`classify-shell.ts` 冻结闭包仅对 `event:"frozen"` 行要求 `primary.files`（frozen 强度不变；非 frozen `draft-updated` 旧 sha 不再要求）；未知/漂移/不可读/同 path 冲突 fail-closed。
3. **M1 范围收缩**：bootstrap 每 kind 至多一个当前版本 target（4-target 标准：proposal v2/modules v1/roster v2/architecture v2）；同 kind 多版本单请求明确拒绝（`trunk-item-invalid`→`vca-target-invalid`，不 last-wins/不取最高）；历史 v1 由账本自动装配、不作为 targets。
4. **M2 允许集**：`classify-shell.ts` `appMetadataPaths` 仅把「frozen 记录已在 `primary.files` 同 path 同 sha 证明、表行 kind=`snapshot-content`」的路径加入 `allowed`；不放宽任意路径（T19 负例；N2 选 gitRolePath 不放行路径）。
5. **不变项**：旧调用/非 bootstrap/团队计划快照（仅 directRefs）/initial-workflow 逐字不变；错误码集合不变；不改 schema/数据模型/versions 格式/角色/权限/writeSet/roster；不提升 raw-object 预算；多 flow 逐行 fail-closed；`-vN` 后缀版本服务侧防御、门禁 `:728` 原样；审计不伪造。

## 二、五维判断与角色

| 维度 | 判断 |
| --- | --- |
| 责任独立性 | 保留现有角色，无新增/拆分/合并：编排（`apply-journal.ts` 快照装配/M1/helper）、门禁引擎（`classify-shell.ts` 闭包/允许集）、测试（fixture/集成/RR20）、独立验收（B1/B2）。 |
| 范围归属 | 全部路径在既有 Section 1；**H1 delta=0**；不改角色卡/边界/权限/roster；不改 schema/数据模型/marker。 |
| 契约影响 | 无公共 schema/数据模型 breaking；错误码集合不变；快照 ID/哈希算法不变；行为变更限于 bootstrap 装配与门禁谓词/允许集。 |
| 证据独立性 | L1 服务装配（编排）→ L2 门禁（门禁）→ L3 集成（测试）→ L4 真实运行 RR20；B2 独立验收；统筹不判。 |
| 协调成本 | 高：T3；B1+B2 同 PR；#81 合并/stacked；三文件单写者；已知红多。 |

## 三、写集与 owner（按 P1.1 §4 / B1 §2；零重叠）

| # | 文件 | Owner | 用途 |
| --- | --- | --- | --- |
| W1 | `src/service/trunk/impl/apply-journal.ts` | 编排 | direct bootstrap 快照装配（全部 frozen + versions）、两处捕获 helper、M1 同 kind 多版本拒绝、失败无副作用 |
| W2 | `src/common/门禁引擎/classify-shell.ts` | 门禁引擎 | 冻结闭包仅 `event:"frozen"`；`appMetadataPaths` frozen 证明 snapshot-content 允许集；同函数两 verdict |
| W3 | `test/编排/**`（T1–T19 服务侧） | 编排 | 快照 9 文件/缺失/漂移/不可读/坏行/同 path/无历史/重放/多 flow/后缀/M1 拒绝 |
| W4 | `test/门禁引擎/git-shell-acl.test.ts`（或新测试） | 门禁引擎 | 闭包只 frozen、frozen 缺失仍拒、未知/非法 freeze、非 frozen 不要求、其它 policy 回归、T19 负例 |
| W5 | `test/测试/git-write-chain-fixture.ts`（优先加法导出/独立测试） | 测试 | 集成：bootstrap → VCA → candidate/publication allowed → 9 文件；旧路径回归 |
| W6 | `docs/planning/2026-11-10_design_bootstrap-snapshot-freeze-closure.md`、`…review…`、`docs/communication/2026-11-10_defect_…` | 策划/沟通/协调 | 随实施 PR 提交（或 docs-only），路径/哈希入 B2/D1 |
| — | 各角色 `角色卡/<role>/docs/change/2026-11-10_*bootstrap-snapshot-freeze-closure.md` | 各角色 | 实施记录 |

- **写集外 diff=0**：不改 `run-manifest.ts`/`evidence-check.ts`/`workflow-preconditions.ts`/`boundary-*.ts`/`amendment-validate.ts`/`upgrade-validate.ts`/`version-change/v1`/`complete-snapshot/v1` schema/`versions.jsonl` 格式/角色卡/边界/权限/writeSet/roster；不新增依赖/目录；不提升 raw-object 预算。
- **旧断言**：既有路径逐字不变；新断言按 B1 T1–T19；不得删除/弱化 fail-closed；不新增 skip/force-exit。

## 四、阶段计划

| 节点 | 内容 | 前置 |
| --- | --- | --- |
| G2 | 沟通留痕本计划 + P1.1 + R1.1 + B1（预授权） | 本计划写盘 |
| 基线重取 | `git fetch origin`；#81 先合并后 rebase 或 stacked；确认 `src app test` 干净、无 `.tmp-*`/未跟踪产物进入候选 | #81 状态/协调方 |
| W1/W2 | 编排 + 门禁并行（不同文件）；各自测试/记录 | 基线 |
| W3/W4/W5 | 服务/门禁测试 + 集成 fixture（W5 依赖 W1/W2） | W1/W2 |
| D1 | 受影响套件 before/after、T1–T19、typecheck、候选聚合/manifest、known red | W1–W5 |
| B2 | 同一独立验收按 B1 `9b7fa81c…` 判定（B1+B2 同 PR/批次） | D1 |
| RR20 | round8 干净副本（同根清理/会话剥离/账本重置）、9223、预算按 B1（1 消息+1 合法客户决策、卡 ≤4、派发 ≤8、chief ≤8、convener ≤3、product/impl ≤4、其它 ≤3、Git ≤8、≤45 分钟、首果即停、不重试/不追加）；attestation；预期链 bootstrap→trunk→workflow→团队计划→run pin→D3→激活→实现→游戏/下一门 | B2；**RR20 预算另报协调方** |
| E3-B | 变更包（候选/证据/披露/契约变更） | RR20 |
| B2 终判 | 按 B1 全量判定；B2 不通过不合并 | E3-B |

> 注：B1 文本的「B1∥B2→B3→B5→B4」指实施批次；本表以 W 编号落地，避免与验收 B1/B2 混名。

## 五、验收与证据（要点）

- **候选身份**：`src app test` 逐文件 raw SHA-256 + 可复算聚合 + manifest；只含 W1–W5；写集外 diff=0；运行前后稳定。
- **B1 判据**：BASE-1–8、AC-1–14、T1–T19、RR-1–8、EV1–6；known-red 口径（新增确定性失败=0、新 skip=0、同名不恶化）。
- **关键确定性证据**：bootstrap 快照 9 文件（8 frozen 含 intent v1 + versions）字节/记录 sha 一致；闭包只 frozen；M1 7-target 拒绝（service `trunk-item-invalid`→全链 `vca-target-invalid`）；M2 allowed 只补证明路径（T19 负例）；规模 128/2048/1 MiB/4 MiB/base64≈1.33×/原始 ≤~1.5 MB；多 flow/`-vN` 负例；旧路径逐字不变；typecheck 0。
- **RR20**：真实 Electron + 真实模型 + 真实 UI；隔离 userData/CDP 9223；原 target 只读；round8 同根清理/会话剥离/账本重置（源账本只读、披露）；RR19 残留 draft run/init-source/`s-9fbf9c81…` 保留披露；attestation 绑定 RR19/方案/R1.0–R1.1/授权/prepare-report/manifest/原 target 114/114；严禁伪造 trunk/角色卡/激活/账本；首果即停。
- **披露**：模型 deepseek-v4-flash（非 Anthropic）；7-target 同 kind 多版本不支持（fail-closed）；T15 仅 FS、不宣称 Git policy；raw-object 预算不提升；多 flow 仍 fail-closed；B1+B2 同 PR。

## 六、协调项与默认处置

1. **T3 已确认**；B1+B2 同 PR/同批次；不可拆批独立通过。
2. **#81 合并顺序**：客户放行后先合并 → 本分支 rebase 到 main → 开 PR；或 stacked PR（base=`feat/document-format-specifications`）→ #81 合并后 retarget；不得压成一个 PR。
3. **Q1–Q14/N1–N6**：按 P1.1/R1.1/B1 处置；N1–N6 不阻断，实施/证据按 B1 记录。
4. **记录归属**：方案/缺陷/复核三份随实施 PR（或 docs-only）；不孤儿化。
5. **RR20 预算**：以协调方书面记录为准，仓库内无独立留痕；RR20 记录绑定原文；**RR20 预算另报**（B2 后）。
6. **合并/发布**：合并需客户逐 PR「允许我合并」；发布/tag 未授权；Scheduler 不提交/推送。

## 七、写盘边界与下一步

- 本计划只写 `docs/scheduling/`；不写产品/测试/角色卡/边界/验收判据；不判验收；不实施；不提交/推送/合并/发布。
- 下一步：基线重取 → W1/W2 → W3/W4/W5 → D1 → B2 → RR20（另报预算）→ E3-B → B2 终判。
