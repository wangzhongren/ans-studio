# 变更包（E3 最终版）：运行时门控与角色模块化

- **任务 ID**：`2026-11-07-runtime-gate-role-modularization`
- **记录角色**：ANS 统筹调度（Scheduler）
- **日期**：2026-11-08（E3 终验完成；变更起始 2026-11-07）
- **性质**：E3 终验**最终变更包**，交独立验收按 B1 v1/v1.1 判定 B2；**不是验收结论**；不授权提交/推送/合并/发布。
- **风险档位**：**T3**（P1.6 §10；不压档）。
- **唯一依据**：P1.6 方案 `24150207…`；E0.3 契约 `067e3d2e…`；B1 v1 `a999dc19…` + **B1 v1.1 `e5027742d4ae36b5f71a090d7ceb956ae3046f06da6d9f4252cf60153776e867`**；团队计划 `00e1f76b…`；闸门留痕 `b788072e…`。

## 一、候选身份（冻结）

- **基线与环境**：worktree `.claude/worktrees/trunk-amendment`；HEAD `e71501cae7fc563b63c63944d45d0d3114ec18a5`（tree `6840d1cb2904c2c0f6f45d11625a44c36c4d9fe7`）；分支 `feat/plan-escalation-card`；origin/main `77945d9`；暂存 0；Node v24.22.1 / npm 11.19.1 / Windows 11（Git Bash）。
- **候选 97 文件**（20 M + 77 ??；45 `src/` + 52 `test/`）：`git status --porcelain -- src app test` 100 项 = 候选 97 + T1 只读三文件。
- **聚合身份**：**`7bbff9bd1fa12090590d1bc3a42b70effaa86b42b08ff124ed5ff17924d12a95`**（算法：**按整行（`<sha256>  <path>`）`LC_ALL=C` 排序**，逐行连接后取 SHA-256；逐文件 `sha256sum`+`git hash-object` 见 T3 证据 `07/08`。**2026-11-08 B2 后文字订正**：原文误写为“按仓库相对路径排序”，实际为按整行（哈希前缀）排序；聚合值 `7bbff9bd…` 不变、候选未变）。
- **候选树**：`a93fbcd80a3c9a7eff2fc54b02a1eef1807fdb6d`（临时 index：HEAD read-tree + 97 文件 add + write-tree，7,737 条目）。
- **稳定性**：冻结于 2026-11-07 23:50:27 +0800；`src app test` 1,066 文件 manifest **`5cbdbb9483cbc64d56de7e7649e0466cf956298ff354993b0d6e6d21cb2765fb`**；T3/复跑/扫描后逐文件 diff 0；候选聚合/树/HEAD/暂存不变（E3 扫描复核同一值）。
- **T1 只读基线（不属本变更候选）**：`src/common/claude-adapter/schema.ts`、`test/claude-adapter/schema.test.ts`、`test/claude-adapter/session.test.ts`（哈希与 B0 一致，未改；按 B1 §1.2-6 分离）。
- **阶段证据**：P1 变更包 `docs/scheduling/2026-11-07_change-package_runtime-dispatch-gate.md`（`5c6791af…`）；E0 冻结记录 `docs/scheduling/2026-11-07_contract-freeze_runtime-gate-role-module.md`（`5439d7c3…`）；E2 切换日志 `docs/scheduling/2026-11-07_switch-log_runtime-gate-role-modularization.md`（`0ad6ca45…`）。

## 二、改动面（按阶段，详细逐文件见各阶段证据与 git diff）

| 阶段 | 范围摘要 | 代表证据 |
| --- | --- | --- |
| **P1** 派发门修复（D-minimal + 应用中介证据） | `src/model/runtime.ts`、`src/service/runtime/session.ts`、三适配器（Claude/Codex/Pi 应用面事实）、`src/pipeline/orchestration/trunk-runtime.ts`（D-minimal 单实现→X-G 后调 gates）、`test/runtime-core|claude|codex|pi|编排|测试` 新测试 | P1 变更包 `5c6791af…`；P1-A `6bf1a9d2…`；P1-B 三适配器；P1-C `73c3cbb1…`；P1-D `91e5cbe7…`；P1-RR `c47198f7…` |
| **E0** 契约冻结 | `src/model/role.ts`（14 `RoleToolId`+`RoleToolName`+契约类型）、`src/common/门禁引擎/role-tool-registry.ts`、`governance-roles.ts`（D1–D10） | 冻结记录 `5439d7c3…`；门禁证据 `b640733a…` 及 E2 各单元证据 |
| **E1** 八角色模块 + 共享 | `src/common/roles/{chief,product,rapporteur,nominator,convener,verifier}/`、`src/common/gates/`、`角色卡/shared-code/docs/architecture/shared-components.md`、`test/roles/*`、`test/gates/*`、共享测试 +22 例；PM 旧共享目录删除 | E1 证据各角色；E1 候选 55 文件 `4f30ec66…`；PM 移交 `8268214d…` |
| **E2** 逐单元切换 | 门禁门面 `governance-roles.ts`（六角色 `specOf` + 完整 `builtInRoleModules` + matrix 收口）、`src/service/role/resolve-role.ts`、`trunk-runtime.ts`（调 gates + run-change/team-plan 前置）、`run-role.ts`（工具/卡种/谓词模块化）、`apply-journal.ts`（hub/review/appointment 前置）、`provider/runtime/tools.ts`（requirement-change 工具层前置） | 切换日志 `0ad6ca45…`；7 单元候选聚合（X-G `f0dcf20c…`、X-R1 `649e3ca0…`、X-R2 `9e650ad9…`、X-R3 `6c62fe5c…`、X-R4 `891c92d5…`、X-R5 `47f6b074…`、X-R6 `9ed75ffa…`） |
| **E3** 修复/工具 | rapporteur 未使用导出删除（`7842311f…`）；门禁 `roleToolNameOf` 删除（`ca3b370a…`）；扫描工具 `test/测试/scripts/e3-code-scan.mjs`（`625c62cf…`） | 本次候选已含 |

**删除清单（本变更导致不再使用，已逐单元删除；详细符号/行号见切换日志与各单元证据）**：P1 D-minimal 内联判定（X-G 后删除）；六角色内联规格/卡文本（`*_CARD_TEXT`）与门面共享残段（`SHELL_APPROVAL_CARD_LINE`、`CUSTOMER_CARDIFICATION_PRINCIPLE`、`DIRECT_*`、`STRUCTURED_GIT_DISCIPLINE`、`APP_ONLY_WRITE_PREFIXES`、`BUILT_IN_ROLE_DIR_PREFIXES` 等）；`TRIO_CARD_KINDS` 六行中五行（仅 `product` 保留待确认）；D2 过渡投影 `BuiltInRoleModuleData`/`BUILT_IN_ROLE_MODULE_DATA`/`builtInRoleModuleDataOf`；旧谓词 `canRequestRequirementChange`/`canRequestStableWrite`；临时桥接/开关/探针（全部 grep 0）；rapporteur `RapporteurLegacyCardPath`、门禁 `roleToolNameOf`。**Git 历史保留旧实现。**

## 三、T3 全量回归（B1 v1.1 冻结脏基线口径）

- **方法**：510 个 `.test.ts`；逐文件 `node --test --test-concurrency=1 <file>`（≤25 文件/批），**逐文件自然 EXIT/CLOSE**；6 个 B0 登记挂起文件以 90s 隔离 watchdog 处理，状态 `registered-hang-timeout`，不计通过；未改断言/加 skip/使用 force-exit。
- **权威运行 C**（隔离，32m48s）：503 个自然完成 + 6 登记挂起 + 1 非登记 watchdog（`interactive-execution-mode`，隔离复跑 5/5×2 natural pass）。
- **计数**（503 自然完成文件）：**4,872 tests / 4,641 pass / 198 fail / 1 cancelled / 32 skipped / 0 todo**；其中 B0 文件子集 **4,471 / 4,240 / 198 / 1 / 32**；新增 39 测试文件 **401/401 pass**。
- **B0 对照**：199 条失败条目中 **194 条逐条一致**；**新增确定性失败 = 0、新 skip = 0**。新增 4 条均为非确定性运行期现象（`e-pi` Node 原生 CleanupQueue 断言崩溃 1 次，隔离复跑 11/11×2；`chief-workflow` W29/commit-race/selected ENOTEMPTY/AggregateError 清理抖动）；既有失败消失 5 条（`git-shell-acl`、`application-line`、`chief W19 其一`、`W30`、`unmanaged`，均经复跑确认非确定性，非本变更修复声明）。**不能宣称 T3 单次全绿**——B2 按 B1 v1.1 裁定。
- **静态门**：`npm run typecheck` exit 0；`npm run typecheck:renderer` exit 0；`npm run build:renderer` exit 0（`app/renderer` 未被本变更触及，仍按命令实测通过）。
- **证据**：`角色卡/测试/docs/change/2026-11-07_E3-T3-full-regression.md`（326 行 / **`d0d67ff45c740ae802a839a31f5e126e718809d825a778e3344566a1b65b442b`**——B2 后文字订正版，原 `76872622…`；聚合值 `7bbff9bd…` 不变）+ 证据目录（约 11MB；候选清单/哈希/树、稳定性 manifest、逐文件结果 TSV、对照、510 份原始日志）。

## 四、扫描与检查（冻结候选上重跑）

- **模块图**（TS Compiler API，`625c62cf…`）：331 文件/1,760 边；依赖方向违例 **0**、value 环 **0**、type-only 环 1（`model/runtime.ts↔role.ts`，D9 Model 内豁免）；角色间 0、角色→引擎/门控 0、门控→角色 0、共享→门/角色 0。
- **未使用导出（范围内）**：**0**（E3 修复后清零）；历史待确认 3（`BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE`、`rosterFileName`、`isSelfReport`）。
- **重复实现**：body hash 重复组 0、≥20 行窗口 0；同形文本 4 组为角色卡私有数据（非共享逻辑复制，已说明）。
- **结构残留**：已删常量 app 残留 0、临时开关 0、D2 投影 0、完整 map 六键、D5 单实现（trunk import gates + 2 调用）；`BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE`（声明 1/代码引用 0/注释 1）与 `TRIO_CARD_KINDS.product`（代码 9/字符串 35/注释 22）列「待确认」。
- **门禁负例矩阵**：`test/gates/**` 29/29、`trunk-dispatch-parent` 19/19、跨层集成 10/10、`workflow-preconditions` 29/29、`direct-role-capabilities` 35/34/1（唯一失败为 B0 既有）——合计 122/121/1；未发现门禁语义放宽；Git 专属负例（`git-shell-acl` 36/36、`application-line` 3/3）引用 T3 运行 C。
- **D1–D9/E-A10**（扫描/证据面）：D1 目录/入口通过（owner 文档面另证）；D2/D3/D5/D7 通过；D4/D6 证据面通过（共享测试单源映射 `351b0b3b…`；接口评审记录 E0 `6905f391…`/`5439d7c3…`、E2 `00bac588…` 等哈希复算一致）；D8 结构面通过（`TRIO_CARD_KINDS.product` 待确认）；D9/E-A10 范围内通过（历史 3 项待确认）。
- **证据**：`角色卡/测试/docs/change/2026-11-08_E3-scans-and-checks.md`（312 行 / `73175db73232f004d3365a3f3f49a3bec1d7bf990c821b10d2729bfb164c7e3b`）+ 44 文件证据目录（`MANIFEST.sha256` 全 OK）。

## 五、真实运行证据（P1-RR，已完成）

- 父门受理 PASS；任务创建成功（`t-mw659tgv-974915bb`）；投递被下游门拒绝：`runtime-creation-admission-unproven:required-scope-unconfined-script-tools,native-factory-plan-unavailable`；如实记录、不宣称闭环；预算与偏差见 P1 变更包 `5c6791af…` 与证据 `c47198f7…`。

## 六、披露（必须让验收/客户知晓）

1. **冻结脏基线**：T3 以 B0（198 fail/1 cancelled/32 skip + 6 挂起）为对照；新增确定性失败 0/新 skip 0；既有失败含非确定性项（Node 原生崩溃、ENOTEMPTY 清理抖动、挂起），**不能以单次全绿表述**。
2. **P1-RR 下游门**：派发父门已修复并真实受理；后续投递/仓库初始化等写/发布门未放宽（Q5 型问题另立变更）。
3. **待确认项**（不盲删，交后续）：`BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE`；`TRIO_CARD_KINDS.product` 残留（product-code fixture/fallback）；历史零引用导出 3；同形文本 4 组（角色私有数据）。
4. **接口评审后续项**：桌面 hub 目标数据化与 version-decision preflight（需 Pipeline 公开只读句柄）；Pi 其他 native 方法 legacy 转发；Git-action preflight（Git Service/宿主单元）；requirement-change 工具层唯一消费点已收敛。
5. **形式缺口**：部分单元 oracle `compare` 因源码锚点删除不可复跑（以只读探针复验 0 差异）；编排全量 post-test 偶发不退出（隔离复跑正常）；`interactive-execution-mode` 为非登记 post-test 泄漏（隔离复跑 natural pass）；`role.*` messageKey 为内部诊断键未登记 i18n（按 E2 评审决定）。
6. **共享工作树**：T1 三文件只读基线；候选冻结后未改源码（E3 修复均在冻结前完成）。

## 七、独立验收输入清单（交 B2）

1. 本变更包（候选身份/聚合/树/稳定性）；2. B1 v1/v1.1；3. P1.6/E0.3；4. T3 证据（`d0d67ff4…`（B2 后文字订正版；原 `76872622…`）+ 日志/对照）；5. 扫描证据（`73175db7…` + `MANIFEST`）；6. E2 切换日志 `0ad6ca45…` 与各单元证据；7. P1 变更包 `5c6791af…` 与 P1-RR `c47198f7…`；8. E0 冻结记录 `5439d7c3…`；9. 接口评审记录（E0 `6905f391…`、E2 `00bac588…`）；10. 角色卡/边界/H1 记录与 shared-directories 修订 `4e43e615…`→`80ece2c5…`；11. **B2 报告** `docs/acceptance/2026-11-08_runtime-gate-role-modularization-report-v1.md`（237 行 / 33574 bytes / `8bbeb459…`）。

## 八、状态

- **E3 终验证据包已齐备；候选冻结、稳定性成立；交独立验收 B2 判定（pass/返工/证据不足）。** 本包不判通过，不授权提交/推送/合并/发布（发布/tag 不在客户委托内）。
- 若 B2 判返工/证据不足：按 B1 与验收报告处理，候选变化后受影响证据失效并重取。