# 意图确认：验收物证提案路径缺陷（acceptance evidence proposal path）修复

- 日期：2026-11-01
- 提出人：客户（试跑发现，沟通定位根因后客户指示）
- 记录角色：ANS 沟通（Communication）
- 闸门 0 状态：**已确认**（客户原话：「记录这个验收物证路径 bug 并修复」）
- 变更类型：缺陷修复（验收判断 facts/物证路径构造）；涉及两个角色的代码文件与测试。

## 客户原话

> 记录这个验收物证路径 bug 并修复

## 缺陷现象（真实试跑证据）

试跑项目：`C:\Users\51054\Desktop\work\trial-shell-escalation`（textkit CLI，六角色全流程；「替我审批」「替我决策」均开启）。

- 质检独立核对 **AC-1..AC-5 全部通过（5/5）**（`docs/quality/textkit-cli-report-v1.md`），并如实报告 blocked：「验收卡未能送达客户」。
- 验收卡 `req-ede39454bd1a30e5` 与重提的 `req-ef57716bc74bf1d4` **连续两次被自动决策拒绝**，reason 均为：
  `自动决策未通过：规范物证缺失（物证不可读：docs/proposals/textkit-cli-v1.md；请按上述原因修正后重新提交）。`
- 项目中真实提案文件为 `docs/proposals/textkit-cli-proposal-v1.md`（存在、可读）；被指向的 `docs/proposals/textkit-cli-v1.md` **不存在**。
- 后果：开着「替我决策」时，验收卡因物证路径错误被 fail-closed 拒绝，**永远到不了客户**；质检与运营链路正确，缺陷在产品侧。

## 根因（已核实到行）

同一错误约定出现在两处，均把提案路径写成 `<flowId>-v1.md`，漏掉 `-proposal`：

1. `app/desktop/session.ts:3883`（`enrichAcceptanceJudgeContext` 的 `artifacts`）：
   `proposalPath: \`docs/proposals/${flowId}-v1.md\`` —— 该路径被 `governance-judge-evidence.ts:1101` 作为物证去读取，读不到即 `artifact-missing`「物证不可读」（`:1143`），判断 agent 依 fail-closed 拒绝验收。
2. `src/common/编排/governance-judge-facts.ts:181`（`requiredArtifactPaths`）：
   `expectedProposal = docs/proposals/${flowId}-v1.md` —— 与全仓其他约定路径不一致（`mechanical-rejection.ts`、`run-manifest.ts`、`workflow-preconditions.ts`、判断提示词均为 `docs/proposals/<flowId>-proposal-vN.md`）。

## 意图理解（待修复内容，交由策划细化）

1. 修正验收判断的提案物证路径，使其指向**真实存在的最新提案**（`docs/proposals/<flowId>-proposal-vN.md`，含版本解析；存在 run/manifest 文档时优先用其记录路径），并同步修正 `requiredArtifactPaths` 的约定路径文案。
2. 补充/更新测试：验收卡 judgeContext 的 `proposalPath` 指向真实最新提案；提案缺失时报缺失而非指向不存在路径；不回退到错误约定。
3. 修复后在本试跑项目上重新发起验收复核（真实运行验证缺陷已消除）。

## 非目标

- 不改变验收卡的判断规则、fail-closed 语义、代批口径（替我决策/替我审批语义不变）。
- 不改动产品意图/方案/名单/架构的命名与版本化规则；不做与提案路径无关的重构。
- 不处理本次试跑中质检报告列出的两项低风险观察（O1 双 BOM、O2 `wc <file> -h`），不在本修复范围。

## 已授权边界

- **已授权**：闸门 1——策划（Planning，独立上下文）产出修复方案与可核对验收标准；沟通呈报客户确认。
- **未授权**：实施（需闸门 1 确认 + 闸门 2 角色分配确认 + 实施授权）；提交推送与发布另行授权。

## 下一步

1. 沟通启动策划上下文，产出闸门 1 修复方案（含写集、测试与风险档位）。
2. 策划按规程做独立只读复核。
3. 沟通向客户呈报，等待闸门 1 确认。

## 闸门 1 记录（2026-11-01）

- **客户确认**：原话「确认闸门 1 修复方案（T2，含方法 A 验证授权）」。
- **确认对象**：`docs/planning/2026-11-01_design_acceptance-evidence-path.md` P1.2（**396 行**，SHA-256 `355cbf1c94148bf9b7646eb4ad24b578d6bc50a57dddc1c0aa4994bac49ec9d9`）；复核记录 `docs/planning/2026-11-01_review_acceptance-evidence-path.md`（**124 行**，SHA-256 `25bc602ec8993c9e4bfa73b07d8cd521d730be875d66d121d662f12fe42ad3b6`；完整复核 F1–F11 与窄复核 F1–F4/N1 均闭合，结论「建议提交客户确认」、无阻断项）。
- **确认内容**：§2.2 取值优先级（pinned manifest 路径 > 最新 `<flowId>-proposal-vN` > 缺失即 fail-closed）与 §2.4 缺证文案；否决「静态 v1 / 永远取最新 / 角色自报路径」三种备选；按 **T2** 实施与验收；写集 **5 文件**（`app/desktop/session.ts`、`src/common/编排/governance-judge-facts.ts`、新增 `test/桌面应用/acceptance-proposal-path.test.ts`、新增 `test/编排/governance-judge-facts.test.ts`、更新 `test/编排/acceptance-judge-minimal.test.ts`），不新增共享助手；**方法 A 验证授权**：临时移走试跑变通别名 `docs/proposals/textkit-cli-v1.md`（记录 sha256，验证后按原字节还原）。
- **知悉项**：R9——历史项目若仅有错误命名 `<flowId>-v1.md` 提案，修复后按缺失 fail-closed（兼容另开需求）；R10——本修复不冻结 `intentId`（最新提案改 intentId 会拒绝而非误放行）；试跑别名属治理侧变通产物，验证后由试跑治理方决定归档/移除。
- **下一步**：统筹判断团队并产出团队计划 → 沟通呈报闸门 2。

## 闸门 2 记录（2026-11-01）

- **客户确认**：原话「确认闸门 2：参与角色、写集与边界条目」。
- **确认对象**：`docs/scheduling/2026-11-01_team-plan_acceptance-evidence-path.md`（**431 行**，SHA-256 `94f80cff3e16edce43887eb42433a2f4e925b3bb9a13d416d7d8cc88e441e0e3`）§九 全部 **14 项**：参与角色（桌面窗口/编排/测试 + 人事边界条目 + 内置独立验收 + 统筹；装配与项目管理 shared 等不参与）、精确写集（5 文件）、边界变更 B-1（桌面窗口 boundary.md+yaml 新增 `test/桌面应用/acceptance-proposal-path.test.ts` 精确条目）、T2、阶段顺序（G2 → H1/V1/B0 → A1/A2 并行 → D1 → D2 方法 A → E1 → E2 → E3）、验收安排（AC-8 只认方法 A 为充分证据）、方法 A 执行口径、证据口径、实施授权分开、基线 `eb77fad`（与 main `a187d59` 目标文件一致）、共享层条件（若需改 `src/common/shared/**` 停止并重开闸门 2）、R9/R10、不发行。
- 方案 §7 的三处角色标签已按真实边界校正（测试文件归属桌面窗口/编排；shared 唯一写入者为项目管理），写集不变。
- **实施授权**：待客户另行给出。
- **下一步**：内置独立验收写 V1（AC-1–AC-8）；人事执行 B-1；实施授权后统筹预留并派发。

## 实施授权记录（2026-11-01）

- **客户授权**：原话「授权开始实施」。
- **授权范围**：按客户确认的 P1.2 方案与团队计划（`355cbf1c…` / `94f80cff…`）实施；不扩大写集、边界与方案默认项；**提交、推送、合并、发行不在本次授权内**（另行授权）。
- **派发前置状态**（团队计划 §九.9）：闸门 2 ✔；实施授权 ✔；V1 标准经沟通确认（进行中）；B-1 边界条目落地（进行中）；逐角色预留由统筹在派发前完成。
- **下一步**：V1/B-1 完成后沟通核验并在本节补记，随后通知统筹开始派发。

## V1/B-1 核验与实施派发（2026-11-01）

- **B-1 核验通过**：桌面窗口 `boundary.md`+`boundary.yaml` 已同步新增 `test/桌面应用/acceptance-proposal-path.test.ts` 精确条目（3 个治理文件、7 行新增；md/yaml 逐字一致；边界解析器测试 17/17 通过；计划外漂移未触碰）。
- **V1 核验通过**：`docs/acceptance/acceptance-evidence-path-criteria-v1.md`（**580 行**，SHA-256 `8f3e4b73d967d0572c2fda2bffb3ff968ba09303a33546e6b16a0c1b48c76179`）由内置独立验收基于 P1.2 编写；AC-1–AC-8 与方案一一对应、未弱化；AC-8 明确只以方法 A 为充分证据（方法 B/单独 accept/客户手批均不判 pass），未执行判 insufficient evidence；12 项待澄清项均由判定口径处理，不扩大范围。
- **派发**：派发前置全部满足（闸门 2 ✔、实施授权 ✔、V1 经沟通确认 ✔、B-1 落地 ✔），已通知统筹按团队计划开始 B0 基线与逐角色预留，并派发 A1（桌面窗口）/A2（编排）并行实施。
- 备注：闸门 2 记录中团队计划 §九 项数已按实际校正为 14 项（验收标准独立成项）。

## 独立验收 E2 启动（2026-11-01）

- B0/A1/A2/D1/D2 全部完成并取证；**D2 真实方法 A 成功**：别名移出后，新验收请求 `req-bbeb75a3009b6c32` 由 judge 判定 `accept`（`judge.evidence` 引用真实 `docs/proposals/textkit-cli-proposal-v1.md`、不含别名、无「物证不可读」）；别名按原字节还原（sha `d6cad5f2…` 与移出前一致）。
- E1 变更包：`docs/scheduling/acceptance-evidence-path-change-v1.md`（**125 行**，SHA-256 `ce66e25a9b356aba54752ddff542eab5c01c4e1a7af4c868ac144735c5442936`）；最终候选 **23 文件** = 产品/测试 5 + 治理/记录 18（含 E1）；22/22 复算一致；候选清单 `c78f66e7…`。
- 沟通已启动**唯一内置独立验收主上下文（E2）**，判据 V1 `8f3e4b73…`（AC-1–AC-8，AC-8 只认方法 A），依据 P1.2 方案 `355cbf1c…`、团队计划 `94f80cff…`、E1 `ce66e25a…` 与证据根 `%TEMP%/ans-acceptance-evidence-path-evidence/`；结论写入 `docs/acceptance/acceptance-evidence-path-report-v1.md`。

## 独立验收 E2 结论：证据不足（2026-11-01）

- **报告**：`docs/acceptance/acceptance-evidence-path-report-v1.md`（**249 行**，SHA-256 `cc274259e008dca7a87997250112dfa27d1e27a95365697826f4a37b1d24b946`）；判定 **AC-1–AC-7 全部 pass（7/7）**；**AC-8 insufficient evidence（E1）**；无返工项。
- **E1（唯一缺口）**：AC-8 缺少「试跑项目所有者/客户现场确认记录」——V1 §2.4 第 9 项/§3.8/§5/§九.7 与团队计划 §九.8 要求方法 A 执行时具备该管理记录；D2 证据本身真实且通过独立复核（请求 `req-bbeb75a3009b6c32` by=judge/choice=accept/reasonCode=sufficient、judge.evidence 含真实提案且不含别名、别名移出/还原 sha 一致、时间线完整）。
- **处理**：由沟通向试跑项目所有者/客户取得并记录现场确认；产品/测试候选与 D2 原始证据不变时，由 E2 按 V1 复判 AC-8，无需重跑 AC-1–AC-7。

## 方法 A 现场确认记录（2026-11-01）

- **客户确认**：原话「确认方法 A 现场执行记录（按报告时间线与哈希）」。
- **确认对象**：试跑项目 `C:\Users\51054\Desktop\work\trial-shell-escalation` 上方法 A 的完整执行——别名 `docs/proposals/textkit-cli-v1.md`（7,035 B，sha `d6cad5f2…`）于 10:17:53 移出；10:22 修复后应用重发验收（`req-bbeb75a3009b6c32` 于 `2026-11-01T02:22:13.112Z`，by=judge、choice=accept、reasonCode=sufficient，`judge.evidence` 含真实 `docs/proposals/textkit-cli-proposal-v1.md`、不含别名、无「物证不可读」）；10:27:21 按原字节还原（sha 一致）；真提案/质检报告/清单哈希未变；未使用方法 B、未关闭「替我决策」、未客户手批。
- **依据**：`docs/acceptance/acceptance-evidence-path-report-v1.md`（249 行 / `cc274259…`）与证据根 `%TEMP%/ans-acceptance-evidence-path-evidence/D2/`。
- **后续**：凭此记录由 E2 按 V1 复判 AC-8；产品/测试候选与 D2 原始证据未变，不重跑 AC-1–AC-7。

## 独立验收 E2b 复判结论：通过（2026-11-01）

- **报告**：`docs/acceptance/acceptance-evidence-path-report-v2.md`（**146 行**，SHA-256 `06f142051431dc17fc88a3ec36744bbf29a9d3d65f59dd879eb8304843fda151`；v1 报告未改，仍为 `cc274259…`）。
- **结论**：**AC-1–AC-8 全部通过（8/8）**，返工 0、证据不足 0；通过仅对当前候选（HEAD `eb77fad` + 5 文件产品/测试候选 + 管理记录）有效，不授权提交/推送/合并/发布。
- **核对**：现场确认记录与 D2 原始证据逐项一致；产品/测试 5/5 blob+sha256 未变；D2 证据、试跑项目、发布/构建面零 diff。
- **下一步**：统筹 E3 收尾（重冻候选清单，纳入 v2 报告与 memo，共 25 路径）并回执提交拆分；**提交/推送需客户另行授权**（本轮尚未授权），不发行。

## 提交授权记录（2026-11-01）

- **客户授权**：原话「把这轮修复提交并推送到 GitHub（不发行）」。
- **授权范围**：E2b 通过后，将本轮全部候选（产品/测试 5 文件 + 治理/记录文档，含 E1 重冻清单）提交并推送到 GitHub；**不发行**：不打 tag、不升版本号、不构建/上传发布包、不写发布说明。
- **执行**：待统筹 E3 回执最终候选清单与拆分建议后，由沟通提交并推送（仓库惯例：分支 + PR + 合并）；提交前核对 staged/写集/发布构建面零 diff。

## 提交与推送记录（2026-11-01）

- 客户授权原话「把这轮修复提交并推送到 GitHub（不发行）」；E2b 通过（8/8）后由沟通执行。
- **提交**（分支 `feat/flow-improvements-wave1`，基线 `eb77fad`）：`fa3b8f9` 实施与测试（5 文件）；`b4dd6bd` 治理与记录（20 文件）；提交后工作树干净。
- **推送**：`origin/feat/flow-improvements-wave1` 已更新；**PR #30** 已创建（base main）：https://github.com/wangzhongren/ans-studio/pull/30
- **合并**：客户指示「把 PR #30 合并到 main」（2026-11-01），已合并：merge commit **`da962b6fabd3b54889f9e1ec0b9079902d00eefc`**（main 已包含 `fa3b8f9`/`b4dd6bd`/`c80f494`）。
- **不发行**：无 tag、无版本号变更、无发布包；`release-policy.mjs` 保持 `v1.8.3`。
