# W：B23 fixed 权威哈希来源（编排，2026-11-11）

- 角色：ANS 固定 worker「编排」（roleId: 编排），独立上下文。
- 任务：T3「两条固定工作流路径」B23——RR19 失败修复（A9 convener 用 shell 计算名单 hash）。
- 依据：RR19 记录 `角色卡/测试/docs/change/2026-11-11_RR19_two-fixed-workflow-paths.md`（`ec4da98db2413ac01fdc6fbc1c56ea11ae25e4ab33e35518d7a449245c62e613`）；协调方 B23 授权与 RR20 预算批准。
- 基线：HEAD `e45c706`（RR19 记录提交）。

## 一、RR19 失败事实（根因）

- A1–A8 全链完成（B16/B18/B19/B20；A8 1/1 `role.activated` snake-game-dev）；A9 requested 后，convener 于 05:08:49 以 `run_shell` 执行 `certutil -hashfile docs/proposals/snake-game-roster-v1.md SHA256`，应用弹 shell 审批卡（audit `deny`、`execution:"未执行"`），驱动按授权失败即停。
- 机制缺口：团队计划 `teamPlanSchema:3` 必需 `modules`/`roster` 的 `{path, sha256}`；`project_state` 视图**已**计算 `latest.sha256`（`fileSha256` 按真实字节），但文本投影 `renderProjectStateSummary` 的 `[versions]` 行未输出该值；`doc_format` team-plan/v3 指引只写「使用当前权威路径与哈希」，未给应用来源。convener 在 `contract_check`/`evidence_check`/`doc_format` 均取不到 hash，转向 certutil。
- RR18 曾通过 `read_file` 读取 `.ans/state/versions.jsonl` 取得权威 hash 并在 A9 成功；RR19 模型未找到该路径。shell 门禁本身行为正确。

## 二、实施

### 2.1 `src/common/编排/project-state.ts`（M）——B23.1

- `renderProjectStateSummary` 的 `[versions]` 行在 `path=` 后追加 `sha256=${latest.sha256 ?? none}`（应用按真实字节计算；缺失文档输出 `none`，不猜 hash）。视图模型 `ProjectStateLatestVersionPointer.sha256` 既有，不改 schema/校验。

### 2.2 `src/common/编排/doc-format-specs.ts`（M）——B23.2

- team-plan/v3 `plan-base-conflict` 修复指引：`哈希取应用 project_state [versions]（sha256=）或 .ans/state/versions.jsonl，不得用 shell 计算/核验`。
- `plan-hash-drift` 修复指引：`按应用记录读取权威哈希（project_state [versions] / .ans/state/versions.jsonl），不得用 shell 计算`。

### 2.3 convener fixed 上下文（convener-code 业主，见其记录）

- `FIXED_EVIDENCE_SECTION` 补：文档/名单/模块权威哈希只取 `project_state [versions]`/`.ans/state/versions.jsonl`；**convener 自身同样禁止** `run_shell`/`certutil`/`Get-FileHash`/`PowerShell` 计算/核验 hash（RR19 实测会触发 shell 审批卡）。
- `FIXED_BASELINE_SECTION` 补：团队计划 `modules`/`roster` 哈希取应用记录，不得用 shell 计算/核验。

## 三、测试（两侧）

| 文件 | 用例 | 断言 |
| --- | --- | --- |
| `test/编排/project-state.test.ts` | versions 视图测试扩展 | 有最新文档 ⇒ 行内含真实 `sha256=<文件字节哈希>`；缺失文档 ⇒ `latest=none path=none sha256=none` |
| `test/编排/doc-format-specs.test.ts` | 新增 B23 用例 | `plan-base-conflict`/`plan-hash-drift` 的 fix 含 `project_state`/`versions.jsonl`/`不得用 shell`；`doc_format` 渲染文本实际携带来源 |
| `test/roles/convener/convener-fixed.test.ts` | 新增 B23 用例 | evidence/baseline 段含应用来源与自身 shell 禁令；既有 B9.1/B13.2 断言、legacy 三段逐字不变断言保持通过 |

## 四、验证（D1）

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | `_evidence/b23-01-typecheck.txt`（`92ef7d09…`） |
| 受影响集（project-state×2、doc-format-specs、convener fixed/differential/module、convener-module-consumption、runtime-core b2、doc-format-specs-pin、桌面/桌面UI project-state、chief v2 no-shell-hash、role-module-contract、doc-format-all-roles；14 文件） | **166/167 pass**；唯一失败 `TM-5 schema 字面量全仓扫描` = B0/B1 起冻结的 24 known-red 之一 | `_evidence/b23-02-affected.tap`（`fb13cf37…`） |
| 确定性全链 `test/测试/fixed-path-full-chain.test.ts` | **3/3 pass** | `_evidence/b23-03-full-chain.tap`（`ce599794…`） |
| 全量 `test/编排/*.test.ts` | **1340 pass / 24 fail / 2 skip**；24 条失败与 B17 冻结 known-red **逐名一致**（diff 空） | `_evidence/b23-04-orchestration-suite.tap`（`97d001a2…`）、`b23-05-known-red-failnames.txt`（`f9513fb0…`）、`b23-06-known-red-diff.txt`（`e3b0c442…`，空） |

## 五、候选（编排）

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/编排/project-state.ts` | M | 57,569 / 1,313 | `cd614ef963ba117d7143a229e599b6bc0858acc12e9a56965b61ba7fc1e49906` | +2/−1 |
| `src/common/编排/doc-format-specs.ts` | M | 101,443 / 2,297 | `8f5e5d48cd3c51e2de8e59d9b0d26f0e0611d5d92779466489f7df6837b37894` | +2/−2 |
| `test/编排/project-state.test.ts` | M | — | `374c4e219e360d796e4a6c1e04e99726c713b4a014ab7667209dc6d390dda614` | +13/−0 |
| `test/编排/doc-format-specs.test.ts` | M | — | `d0221f7e13d7c0ca9d0b34cc625a118d52d14a8319445394c2dd095ae125b214` | +15/−0 |

- convener 候选见 `角色卡/convener-code/docs/change/2026-11-11_B23_two-fixed-workflow-paths.md`；共同证据在 `角色卡/编排/docs/change/2026-11-11_B23_two-fixed-workflow-paths_evidence/`。

## 六、限制与披露

- 只做确定性实现与测试；**未运行**真实 Electron/模型，不声称 RR/B2 通过；真实效果待 RR20 行使。
- 披露（与本批无关的环境抖动）：`test/门禁引擎/model-and-service.test.ts` 与 4 个桌面/引擎文件同批运行时出现 W5/W10/W22/W23（HEAD 无 B23 时亦复现，且失败集合本身抖动），该文件单独运行 B23 后 **9/9 pass**；判定为批跑环境抖动，不归因 B23。
