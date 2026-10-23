# S5 终验记录：治理写卡推进的可重入门禁闭环（T3）

- **任务 ID**：`2026-10-23-governance-advance-redispatch`（产品 flowId `governance-advance-redispatch`）
- **记录角色**：测试（Testing worker，独立角色上下文）
- **日期**：2026-10-23
- **阶段**：S5「终验」（团队计划 §5.1 S5、§6.2「测试」、§6.3）
- **风险档位**：**T3（治理行为与 flow 状态变更）**
- **状态**：**verified-by-tests-only（最终候选；测试证据通过，不是验收通过）**。首轮 S5 曾因 §二 缺陷 blocked；桌面窗口修复后在最终候选重跑全部通过（§十一）。
- **授权依据**：客户闸门 0/1/2 与实施授权（`docs/communication/2026-10-23_intent_governance-advance-redispatch.md`）；团队计划 `docs/scheduling/2026-10-23-governance-advance-redispatch-team-plan.md` §5.1/§6.2/§6.3/§9
- **基线**：`角色卡/测试/docs/change/2026-10-23_change_governance-advance-redispatch-baseline.md`（355 文件 / 3661 / 3633 / 10 / 18；9 项既有 Windows symlink `EPERM` + 1 项桌面时序偶发）
- **候选身份**：HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（tree `1149238a834f31588797016d6ee2289a4ac3e97b`）；工作树包含 S3/S4 实现（`completeRoleCardsStep`、桌面内容指纹/版本化派发键/账本锚/刷新探针/防自激/readiness 文案）与既有 i18n/目录 v3 上下文。53 个 `src/app/test` 改动/新增文件在全部检查前后 SHA-256 逐字节一致（`worktree-hashes-start.txt` vs `worktree-hashes-end.txt`）。

---

## 一、新增 e2e 与覆盖矩阵

新增文件：`test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts`（546 行）
- `sha256` = `48fb0aa8467479904a9b2a7b4498b5f6a3cf200b2782f1eee52c76813ec85e3e`
- `git hash-object` = `cb6f483461815570ef0a18b7fbb251f5cdc0aa5d`
- 全部离线脚本桩；不启动真实 Electron；role-cards 用 **artifact** kind（dispatch kind 由 S3 `test/编排/flow-service.test.ts` 覆盖）。

| # | 用例 | 结果 | 关键断言 |
| --- | --- | --- | --- |
| 1 | 首次通过后 Crew 内容变化重写 ⇒ 新指纹重新校验并再次派 readiness（不被永久运行期键挡住） | **pass** | 两轮 Crew 写卡各一条 `appointment-write`；两条 `dispatch.accepted{stepId:"role-readiness"}`，第二次在第二次写卡账本锚之后；role-cards 仍 done、验证记录恰一条；应用零 `customer.decision`；0 客户卡 |
| 2 | 连续两次不同错误写卡 ⇒ 两次反馈；修正后 role-cards 恰一次 done、readiness 恰一次、无客户卡/无 customer.decision | **pass** | 两次修正任务分别含缺章节/缺工作文档与 boundary 写集问题；`artifact.observed` 恰一条；readiness 恰一次；种子 `customer.decision` 数不变且无 app 写入；无验收决定；0 客户卡 |
| 3 | 同内容重复 settle/refresh 与 mtime-only 变化 ⇒ 不重复反馈/派发/记录 | **pass** | 同内容重写 + `utimes` 改 mtime + 3 次 `listProject`：readiness/`artifact.observed`/Convener 提示均不增加；验证记录仍一条 |
| 4 | boundary 条目逆序 ⇒ 仍通过并收口 role-cards、派 readiness 恰一次 | **pass** | 目录条目在前、工作文档逆序：0 反馈、role-cards done、readiness 恰一次 |
| 5 | 团队计划存在但 flow 缺 role-cards 步骤 ⇒ 反馈 Convener、不派 readiness、无客户卡；同指纹不刷屏 | **fail（确定性缺陷）** | 首条反馈、不派 readiness、无客户卡均正确；**但同内容重复 settle 会反复投递相同 Convener 反馈（1.3 s 内 20 条）**，违反方案 A2「同指纹不重复反馈」——见 §二 |
| 6 | 手工改文件 + `listProject` 刷新 ⇒ 不合格反馈 Crew；修正后收口 + 派 readiness（无 Crew 事件） | **pass** | 空 role-card 手工状态刷新后有且仅一次 Crew 反馈、不派 readiness；补齐六文件后仅刷新即 role-cards done + readiness 恰一次；0 客户卡 |

**本文件计数：6 tests / 5 pass / 1 fail。** 原始日志：`s5-new-tests-run2.log`/`-run3.log`、`governance-e2e-auto-final.log`。

## 二、确定性缺陷（首轮 S5 阻塞；已在最终候选修复并复验，见 §十一）

- **现象**：团队计划存在但 flow 缺 `role-cards` 步骤时，应用正确反馈 Convener 一次且不派 readiness，但同一内容指纹在每次 settle/refresh 后都会**再次**投递完全相同的 Convener 反馈；测试在 1.3 s 内收到 20 条。
- **根因**：`app/desktop/interface.ts` `runPostWriteAdvanceCheck` 在**写卡产物校验通过后**先执行 `appointmentArtifactFeedback.delete(...)`（`:3670`），随后 `completeRoleCardsStep` 返回 `role-cards-step-missing`，在 flow 缺陷分支重新反馈（`:3705`）；下一次检查再次清空 → 重新反馈，形成循环。同时每次反馈都会置 `performedAction=true` → `emitProjectChanged`，存在刷新回路风险。
- **设计依据**：方案 §3 A2「反馈去重…同指纹不重复反馈…通过后清除」；§3 A4「团队计划存在但 flow 缺 role-cards 步骤 ⇒ 反馈 Convener 修正（不弹客户卡、不新增 cardKind），不派 readiness」；§10.3 防自激。
- **归属**：桌面窗口（`app/desktop/interface.ts`）；测试角色不改产品代码。
- **详情与证据**：`角色卡/测试/docs/change/2026-10-23-governance-advance-redispatch-finding-convener-feedback-loop.md`。

## 三、目标项目只读复算（ans-gateway）

脚本：`test/测试/redispatch-target-recompute.ts`（一次性只读复算；`sha256` = `4bbf858785b2cc0918fedade0ef9ec654484bd3b4147b947ccd7440d9cc7e551`）。只复制 flow/账本/团队计划/角色卡到临时根，仅改临时根的 `.ans/project.json` projectRoot；**目标项目零写入**。

- 目标哈希（复算前后一致，`targetUnchanged=true`）：
  - `docs/flows/ai-governance-pipeline.yaml` = `81526ed62375bfb60b5c31ed86702f234b479746dabfe0db5c7f85f99373dec1`
  - `.ans/governance/ledger.jsonl` = `f8f5e1aaa4d6fb7a7ea9c44d5685e6772d93633c6f9456a2b3e26ae7ed6f4a82`
  - `.ans/project.json` = `b8a5ea5049ff3e9d2e087d4ff269380271d70aa4b35c1fbab046432dae508b11`
  - `docs/scheduling/ai-governance-pipeline-team-v1.md` = `6b437ee01b819ebd250bf67a6ed9cd40bfc675ba8de8026baa56c65f53935f54`
  - `docs/scheduling/ai-governance-pipeline-readiness-v1.md` = `5f8273a4a90852a1aca1eef28cc3abf4eb68bb9a74dc03deaec083d0430e5a7e`
- 目标账本形态：`appointment`（7 角色，索引 14）→ **早期 app→Convener 无 stepId 派发（索引 16，即 entry 17）** → 多次 Crew `appointment-write`（索引 19–81）→ Convener readiness 决定（索引 82）。
- 复算结果：
  - 旧无 stepId 派发**不再挡住收口**：`role-cards` done（artifact，记录 `.ans/governance/role-cards/ai-governance-pipeline/2940431d…json`），`artifact.observed` 恰一条，应用派 `dispatch.accepted{stepId:"role-readiness"}` 恰一次，Crew 反馈 0。
  - 二次刷新（当前指纹通过记录之后已有 readiness 派发）：readiness 派发仍 1、`artifact.observed` 仍 1（跨刷新/重启锚生效）。
  - 原项目 flow/账本/团队计划/readiness/`.ans/project.json` **前后哈希逐项一致**（零写入）。
- **边界**：复算证明「目标账本形态可被新逻辑放行」，**不等于目标项目已被修复**；目标项目未写入、未迁移。

## 四、受影响套件与类型检查

| # | 命令 | 退出码 | tests | pass | fail | skipped | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | **0** | — | — | — | — | `typecheck.log`（0 错误） |
| 2 | `npm run typecheck:renderer` | **0** | — | — | — | — | `typecheck-renderer.log`（0 错误） |
| 3 | `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` | **1** | **129** | **128** | **1** | 0 | `governance-e2e-auto-final.log`（唯一红＝§二 缺陷用例） |
| 4 | `node --test test/编排/flow-service.test.ts` | **0** | 38 | 38 | 0 | 0 | `s5-affected-flow-service.log` |
| 5 | `node --test test/桌面应用/interface.test.ts` | **0** | 116 | 116 | 0 | 0 | `s5-affected-interface.log` |
| 6 | `node --test test/桌面应用/acceptance-dispatch.test.ts` | **0** | 36 | 36 | 0 | 0 | `s5-affected-acceptance-dispatch.log` |

> S3/S4 受影响套件独立复跑全绿（38/116/36），与实施报告一致。`i-full-chain.test.ts` 两处 `dependsOn` 文本格式断言已按 S3/S4 的真实行为改为**结构化解析**断言（见 §六），不是弱化；改后该文件两轮整文件复跑 run1 一次「会话尚未开启」偶发、run2 3/3 全绿（`i-full-chain-isolation-run1.log`/`-run2.log`）。

## 五、T3 串行全量（排除 write-sequencing）

- 命令：`node --test --test-concurrency=1 <356 个文件>`（`find test -name '*.test.ts'` 排除 `test/pi-adapter/write-sequencing.test.ts`；全部 `.test.ts` 357 个）。
- **exit 1；3692 tests / 3663 pass / 11 fail / 18 skipped / 0 todo / 0 cancelled；307 s**（14:23:26–14:28:33；日志 `full-regression-serial-excluding-write-sequencing.log`）。
- **失败分类（11）：**
  - **(A) 既有 Windows symlink `EPERM`：9 项**——与基线清单逐条一致（claude-adapter 1、codex-adapter 1、pi-adapter injected-runtime 2、runtime-core 2、file-write-safety 1、g4-skill-verify 1、编排 1）。
  - **(B) 本变更确定性新增失败：1 项**——§二 的 Convener 反馈循环（`l-redispatch-reentrant-gate` 用例 5）。**不得放行**。
  - **(C) 桌面时序偶发：1 项**——`i-full-chain`「五角色全自动链路…」`会话尚未开启`；同文件隔离复跑 run2 3/3 全绿（run1 亦出现一次偶发），非确定性；终验需按隔离/整文件复跑分类。
- **与基线（3661 / 3633 / 10 / 18）对照**：tests **+31** = S3/S4 新增 25（`flow-service` 24→38、`interface` 105→116；`acceptance-dispatch` 36 不变）+ 本角色新增 e2e 6（文件数 355→356，新增 1 个测试文件）；pass **+30**；fail **+1**（仅 B 项确定性缺陷；C 项为偶发，基线与本轮均有偶发家族）；skip 18 不变。**除 A 类既有失败、B 类缺陷与 C 类偶发外，无其他失败。**
- **结论：不能交验收。** 需 owner 修复 B 后重跑：新增 e2e 文件 → `governance-e2e-auto` 套件 → 受影响角色套件 → T3 全量 → 真实 Electron；复跑结果对同一候选有效。

## 六、测试侧适配（i-full-chain 文本格式）

- S3/S4 的 `completeRoleCardsStep` 会在收口时以 canonical serializer 重写整份 flow YAML：`dependsOn` 由内联数组（`dependsOn: [contract-freeze]`）变为块列表（`dependsOn:\n  - contract-freeze`）。
- `test/测试/governance-e2e-auto/i-full-chain.test.ts` 原有两处正则断言依赖内联文本；改为 `parseFlowStateYaml` 的**结构化断言**（步骤 `parallelGroup` 与 `dependsOn` 数组精确相等），语义强于原正则，不弱化断言。
- 修改文件：`test/测试/governance-e2e-auto/i-full-chain.test.ts`，`sha256` = `c14bd78bc5fc6500706f43031e2bd1a5d7c0143a0ee0e9608ec49fdb28df995f`。
- 证据：`governance-e2e-auto-pre-patch-run3.log`（改前失败：`dependsOn: [contract-freeze]` 不匹配）、`governance-e2e-auto-final.log`（改后与新增用例一起跑，仅 §二 用例红）。

## 七、真实 Electron 自检（既有脚本，未修改）

- 命令：`ANS_E2E_OUTDIR=<evidence>/e2e-main ./node_modules/.bin/electron test/桌面应用/e2e/main.mjs`
- **exit 0；`E2E_PASS=true`；`E2E_FAILURES=`（空）；`E2E_DONE=1`**。输出目录：`2026-10-23-governance-advance-redispatch-evidence/e2e-main/`（含 `report.txt` 与截图）；控制台日志 `e2e-main-console.log`。
- 未修改 `test/桌面应用/e2e/main.mjs`（该文件当前工作树改动来自前序变更，非本角色）。

## 八、结论与后续

1. **首轮 S5 未通过（历史）**：新 e2e 6 例中 5 例通过；1 例确定性失败暴露产品缺陷（Convener 反馈循环）。该缺陷已由桌面窗口修复，最终候选复跑见 §十一，结论更新为 `verified-by-tests-only`（仍不是验收通过）。
2. **必须修复**：桌面窗口 owner 按 `2026-10-23-governance-advance-redispatch-finding-convener-feedback-loop.md` 修复去重清空时序；测试角色不改产品代码。
3. **修复后复跑清单**：`node --test test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts` → `governance-e2e-auto` 全目录 → `test/桌面应用/interface.test.ts`/`acceptance-dispatch.test.ts`/`test/编排/flow-service.test.ts` → T3 全量（排除 write-sequencing）→ 真实 Electron `main.mjs`；预期 T3 至少降为 9 EPERM + 偶发（若有），且零确定性新增失败。
4. **已通过且可复用的部分**（同候选、同命令）：目标项目只读复算、typecheck ×2、真实 Electron、其余 5 个新 e2e、全量中除 B/C 外的全部结果；候选变化后按证据失效规则只补失效部分。
5. **边界**：未使用真实模型会话（脚本桩）；目标项目未写入也未修复；未改产品/编排/桌面测试；未 commit/push。

## 九、证据边界声明

- 未启用 task_ops；不伪造任务令牌/审批/锁。
- 不声称验收通过；本记录是 S5 终验结果（blocked），不代表任何变更被接受。
- 未修改产品代码、`test/桌面应用/`、`test/编排/`、`test/门禁引擎/`、`test/runtime-core/`、角色卡/边界；只写 `test/测试/` 与 `角色卡/测试/docs/`。
- 未读真实 `.env`/凭据；Electron 使用临时 OUTDIR 与临时 `.env`（脚本自带，不碰仓库根真实凭据）。
- 未 commit/push/合并/发布；无暂存。

## 十、证据文件

目录：`角色卡/测试/docs/change/2026-10-23-governance-advance-redispatch-evidence/`

| 文件 | 内容 |
| --- | --- |
| `governance-e2e-auto-final.log` | S5 e2e 套件最终输出（129/128/1；唯一红为反馈循环） |
| `s5-new-tests-run1/2/3.log` | 新 e2e 文件逐轮演进原始输出（含 5/6 通过与循环证据） |
| `governance-e2e-auto-pre-patch-run3.log` | i-full-chain 文本格式适配前的失败原文 |
| `i-full-chain-isolation-run1.log` / `-run2.log` | i-full-chain 整文件偶发/复跑（run2 3/3 绿） |
| `full-regression-excluded-file-list.txt` | 全量清单（356 文件，排除 write-sequencing） |
| `full-regression-serial-excluding-write-sequencing.log` | T3 全量原始输出（3692/3663/11/18；exit 1；307 s） |
| `target-recompute.log` | 目标项目只读复算 JSON（旧条目放行、二次刷新不重复、目标零写入） |
| `typecheck.log` / `typecheck-renderer.log` | 类型检查（0 错误） |
| `e2e-main-console.log` / `e2e-main/report.txt` | 真实 Electron 自检与截图目录 |
| `candidate-hashes-s5.txt` | S3/S4 目标文件、新增/修改测试文件哈希 |
| `worktree-hashes-start.txt` / `-end.txt` | 53 个改动/新增文件 SHA-256（前后一致） |
| `worktree-start.txt` / `worktree-end.txt` | 工作树状态快照 |
| `final/`（子目录） | **最终候选（修复后）重跑**：`candidate-start.txt`/`candidate-end.txt`、`worktree-hashes-start/end.txt`、`new-e2e.log`、`governance-e2e-auto.log`、3 个受影响套件日志、`typecheck*.log`、`full-regression-excluded-file-list.txt`、`full-regression-serial-excluding-write-sequencing.log`（3693/3666/9/18）、`e2e-main/report.txt` 与截图、`target-recompute.log` |
| `sha256.txt` | 本证据目录与本记录的 SHA-256 清单（收尾生成；含 `final/`） |

**状态再次声明**：本文件是 S5 终验记录，结论为 **blocked-by-tests**；修复后须复跑并以新记录/新证据为准。

---

## 十一、最终候选复跑（修复后，2026-10-23 14:40–14:49）

- **候选身份**：HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（tree `1149238a…`）；桌面窗口修复后 `app/desktop/interface.ts` `git hash-object` = `c3a2adcaf8774f01d2f408f820fcd0344be3b926`（sha256 `5f9b05dfa79d14961fdf7efcbf15ce3c2b154921b7c77d74699b1840fe125352`），`test/桌面应用/interface.test.ts` = `3118a35b9b4f5598f9fa7c78214a44b3bafcb9a8`（sha256 `a97734c3efcc9cc4cf190341bf7a50a0304407e4e483cd022e8371d868b4545a`）。53 个 `src/app/test` 改动/新增文件在全部重跑前后 SHA-256 逐字节一致（`final/worktree-hashes-start.txt` vs `-end.txt`）。
- **修复确认**：`appointmentArtifactFeedback.delete` 只在**完整成功（收口 + 派发/账本）**之后执行（`interface.ts:3822`，`dispatchCommitted` 条件）；flow 缺陷/收口失败分支保留同指纹去重。§二 的 20 条重复反馈不再出现（`final/new-e2e.log` 6/6）。
- **最终计数**：

| 检查 | 结果 |
| --- | --- |
| `l-redispatch-reentrant-gate.test.ts` | **6 / 6 pass**，exit 0 |
| `governance-e2e-auto/**/*.test.ts` | **129 / 129 pass**，exit 0 |
| `test/编排/flow-service.test.ts` | **38 / 38 pass**，exit 0 |
| `test/桌面应用/interface.test.ts` | **117 / 117 pass**，exit 0 |
| `test/桌面应用/acceptance-dispatch.test.ts` | **36 / 36 pass**，exit 0 |
| `npm run typecheck` / `typecheck:renderer` | **均 exit 0，0 错误** |
| T3 串行全量（356 文件，排除 write-sequencing） | **exit 1；3693 tests / 3666 pass / 9 fail / 18 skipped / 0 todo / 0 cancelled；320 s** |
| 真实 Electron `test/桌面应用/e2e/main.mjs` | **exit 0；`E2E_PASS=true`；`E2E_FAILURES=` 空；`E2E_DONE=1`** |
| 目标项目只读复算（ans-gateway） | **通过**：旧无 stepId 派发（索引 16）不挡；role-cards done + `artifact.observed` 恰 1 + readiness 恰 1；二次刷新不重复；**目标零写入**（`targetUnchanged=true`，5 个目标文件哈希与 §三 一致） |

- **失败分类（全量 9 项，全部为既有 Windows symlink `EPERM`）**：claude-adapter 1、codex-adapter 1、pi-adapter injected-runtime 2、runtime-core 2、file-write-safety 1、g4-skill-verify 1、编排 `shell-authorized-routine` 1；错误均为 `EPERM … symlink`。**零确定性新增失败；本轮零桌面时序偶发。**
- **与基线/上轮对照**：基线 3661 / 3633 / 10 / 18；修复前上轮 3692 / 3663 / 11 / 18。最终 **3693 / 3666 / 9 / 18**：tests +32 vs 基线 = S3/S4 新增 25 + 本角色 e2e 新增 6 + 修复轮 `interface.test.ts` 新增 1（116→117）；fail 10→9（基线中的 1 次桌面偶发本轮未出现；§二 缺陷消除；仅余 9 项 EPERM）；skip 18 不变。
- **排除项**：`test/pi-adapter/write-sequencing.test.ts`（已知挂起，3 例）仍不纳入计数，理由与基线一致。
- **结论**：最终候选满足 S5 测试口径（新 e2e、受影响套件、T3 全量、真实 Electron、目标只读复算），状态 `verified-by-tests-only`。该结论只表示测试证据通过，**不代替客户验收/独立验收，不授权提交、推送、合并或发布**；目标项目未被写入或修复；未使用真实模型会话（脚本桩）。

**最终状态**：`verified-by-tests-only`（最终候选）；证据以本记录与 `sha256.txt` 为准。
