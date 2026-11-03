# 独立验收报告（E2）：给内置策划一个可查询的文档 schema（`contract_check` topic）

- **结论：通过（pass）**。**T3**；判定依据：V1 `docs/acceptance/contract-schema-query-criteria-v1.md`（**725 行 / `110018449f43440a841785aa73b6d1be7d0ae60ca4d6b4bcf7b3636723d2768d`**）+ 方案 P1.3（**911 行 / `4d61d376c3bcbf89b8069efcf501f062087f088873d3946b522a6abeaa6f4b85`**）+ 团队计划（**539 行 / `a93bd02f4f2cd3ecfd90b13aa41195e95eaec539277649fbbc9a8b6a91c03f5c`**）+ E1 变更包（**221 行 / `80ef18024740e0a3995b00f083f59a0dd57128142a926fe0cca07c29e1ea8be7`**）+ D1 回归记录（**223 行 / `ab7ffb0796c8ff561e9c6bce5a13024fbd1604808d59f21d8d3b79d86fb6b98e`**）；选定检查：受影响套件 **88/88**（E2 独立复跑）、双端 typecheck **0/0**（E2 独立复跑）、E2 独立行为探针 **55/55**、T3 全量回归复用 D1 同候选证据 **393 文件 / 3478 tests / 3451 pass / 9 fail / 18 skipped / 0 todo**（**排除 `test/pi-adapter/write-sequencing.test.ts`**，排除命令与原因已记录）；不要求真实 Electron E2E（未运行）；候选 HEAD `243d8f6a6db663a383b516aad6320c5110c7f583` + 10 文件哈希 **10/10** 与 E1/D1 一致。
- **任务 / flowId**：`2026-11-03-contract-schema-query` / `contract-schema-query`。
- **验收角色 / 上下文**：**内置独立验收（技能内置管理角色，不是项目 `角色卡/独立验收` worker）的唯一验收主上下文**；本上下文即撰写 V1 的同一主上下文，按 V1 作唯一 B2 判定。未启动 E1–E4 只读取证子上下文（单上下文顺序完成候选核对、独立复跑、行为探针与 D1 证据复核）。
- **候选**：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；分支 `release/v1.8.4-assets`；HEAD `243d8f6`；工作树 10 个产品/测试文件（A0a/A0b/A1/A2/A3），无新增/删除文件、无写集外产品/测试改动、staged 空；候选树 `57fdf6b369aece73ba3f3d4685f9ba3f9c91b95f`、产品 status 快照 `9b410444cd7ad301cd20e9ed0bae2266e09fa3e2f6cc0ddc37e17b50e6181afe`、diff **10 files changed, +780/−13**（均与 E1/D1 一致）。
- **证据复用**：T3 全量回归复用 D1 同候选证据（E2 复核了 D1 原始日志、文件清单、失败集合与哈希；候选在本报告判定时仍与 D1 10/10 一致）；B0 终态只作基线对照，不作为当前候选通过依据；E2 另行独立复跑受影响套件与双端 typecheck，并运行独立行为探针。
- **授权边界**：本报告是唯一 B2，只表示**当前候选满足 V1**；**不授权提交、推送、合并、发布**，不授权修改代码/测试/方案/复核/沟通/E1/角色卡，不替代客户决定；E3 放行/回报另行执行。
- **限制**：AC-18 的真实项目只读抽查按 V1 记 `not applicable`（依据见 §七）；未启动 Electron/E2E；E2 未重跑 393 文件全量（复用 D1 同候选证据并核对原始输出）；P1-CSQ-02 的 topic 专用截断测试落点缺失，记为非阻断过程提示（§六.5/§七）；无 `.ans/project.json`，未伪造 task_ops 状态。

---

## 一、判定依据与候选冻结

### 1.1 输入版本与哈希（本报告判定时实测）

| 输入 | 路径 | 行数 | SHA-256 | 核对 |
| --- | --- | --- | --- | --- |
| 实施前验收标准 V1 | `docs/acceptance/contract-schema-query-criteria-v1.md` | 725 | `110018449f43440a841785aa73b6d1be7d0ae60ca4d6b4bcf7b3636723d2768d` | 与沟通「V1 确认记录/核对记录」一致 |
| 客户闸门 1 确认方案 P1.3 | `docs/planning/2026-11-03_design_contract-schema-query.md` | 911 | `4d61d376c3bcbf89b8069efcf501f062087f088873d3946b522a6abeaa6f4b85` | 与闸门 1 记录一致 |
| 独立复核（最终） | `docs/planning/2026-11-03_review_contract-schema-query.md` | 282 | `55a2d2681b29ab4e0a5896ce2a772f0d4fd779159eff8b88c9a39303a8c5459f` | 复核不是客户确认 |
| 闸门 2 确认团队计划 | `docs/scheduling/2026-11-03_team-plan_contract-schema-query.md` | 539 | `a93bd02f4f2cd3ecfd90b13aa41195e95eaec539277649fbbc9a8b6a91c03f5c` | 与闸门 2 记录一致 |
| E1 变更包 | `docs/scheduling/contract-schema-query-change-v1.md` | 221 | `80ef18024740e0a3995b00f083f59a0dd57128142a926fe0cca07c29e1ea8be7` | 与交付说明一致 |
| D1 回归记录 | `角色卡/测试/docs/change/2026-11-03_contract-schema-query-D1-regression.md` | 223 | `ab7ffb0796c8ff561e9c6bce5a13024fbd1604808d59f21d8d3b79d86fb6b98e` | 与交付说明一致 |
| B0 基线（终态） | `角色卡/测试/docs/change/2026-11-03_contract-schema-query-B0-baseline.md` | 189 | `9f5872807fd163c9e47ce5a9b704771a2162f9129114a194f2f3bb53ef20676e` | 终态；171/`314f9941…` 为中间版，仅历史 |
| 沟通记录（当前） | `docs/communication/2026-11-03_intent_contract-schema-query.md` | 200 | `2d8e4f3c22372c0e25b6d4187e77e0c6c85764ccfc89af57bc2ce68f11be1a77` | 含闸门 0/1/2、IA、V1/B0/P1/D1 核对与事故校正；引用小节不引固定行号 |
| P1 有效决定（原版） | `角色卡/项目管理/docs/change/2026-11-03_contract-schema-query-P1-review.md`（原 293 行版本；当前路径为事故版） | 293 | `d547b90d47615ef00556a65558fdcde6ad307e0286d3bd457624c977d46256ea` | 结论 `recommend approval` + P1-CSQ-01–10；沟通裁决为有效 |
| P1 审核恢复版 | `角色卡/项目管理/docs/change/2026-11-03_contract-schema-query-P1-review-approved-recovered.md` | 300 | `1f4b8f3404561b07ee649fade571066f2617096285784e690e4087678982ee19` | 重建版；正文 42,198 B / `f297b267…`；frontmatter+正文复算 = `d547b90d…`（E2 已独立复算） |
| P1 事故版 | `角色卡/项目管理/docs/change/2026-11-03_contract-schema-query-P1-review.md`（当前磁盘） | 272 | `4469ce2d50f0b4117f154288e996e1bdecd1990126c132510e8c26885eaa87b9` | `status: blocked`、`needs revision`；§0 自述以 293 批准版为准；仅事故历史，不作为实施/验收依据 |
| A1 P1 提案（现版） | `角色卡/编排/docs/change/2026-11-03_contract-schema-query-P1-proposal.md` | 90 | `9fe02757d2e90b5848ccb914108bbace7c7f784cf2e6393cf098ba5dc4ab8cfb` | 评审版为 90/`70e36ea4…`（P1-CSQ-03 修订后现版） |
| A1 实施记录 | `角色卡/编排/docs/change/2026-11-03_contract-schema-query-A1-implementation.md` | 62 | `3b7da027852bb677b6004d9b290f40fb88d027812fe531f73ed58ef0e3d40cee` | 记录 P1-CSQ-03/04/05/06 落点与 34/34 自测 |
| A3 实施记录 | `角色卡/门禁引擎/docs/change/2026-11-03_contract-schema-query-A3-implementation.md` | 66 | `1c07f3c3e8f4ce90c8b9bda5b11a5566d4583a2f8a94aad92714a44aaa460242` | 活动路径与 P1-CSQ-10 落点 |

- 其他提案哈希符合 E1：A0 100/`57838e46…`、A2 100/`bb04be77…`、A3 81/`f44f1b98…`（本报告只读核对，不重审提案）。
- 客户实施授权（IA）已按沟通「实施授权记录」给出（原话「授权实施：按团队计划与 P1.3 开始 V1 后的 B0/P1 与各阶段；不含提交/推送/发布。」）；提交/推送/合并/发布仍未授权。

### 1.2 候选身份与写集闭合

- `git status --porcelain -- src app test`：**10 条，全部 `M`**（6 源文件 + 4 测试文件），无新增/删除；`git diff --cached --name-only` **空**；`package.json`/锁/构建配置/README 未改。
- 逐文件 `git hash-object` + `sha256sum` 与 E1 §1.1、D1 §二 **10/10 完全一致**（详见附录 A）；E2 在本次复跑/探针后再次复算仍 10/10，无候选漂移。
- **候选树** `57fdf6b369aece73ba3f3d4685f9ba3f9c91b95f`（E2 以临时 `GIT_INDEX_FILE` 从 HEAD 读树、仅 add 10 路径后 `git write-tree` 独立复算，与 E1 一致）。
- **产品 status 快照** `9b410444cd7ad301cd20e9ed0bae2266e09fa3e2f6cc0ddc37e17b50e6181afe`（E2 独立复算，与 E1 一致）。
- diff 规模 **10 files changed, +780/−13**（与 E1/D1 一致）；测试 diff 4 文件 **+540/−2**，删除行仅 2 条 import（被同文件更完整 import 取代），无断言删除/放宽、无新增 skip/todo、无测试文件删除。
- 写集闭合：10 路径精确匹配团队计划 §4.1/§4.3 与 V1 §七；`test/门禁引擎/{view-image-cards,list-project}.test.ts` 只读回归未写；无写集外产品/测试改动。**无边界变更（B-0）**，无角色卡/边界/YAML/changelog 改动。

### 1.3 证据复用与失效口径

- D1 的受影响套件、双端 typecheck 与 T3 全量均在 E1 §1.1 的同一 10 文件候选上执行；E2 判定时复算 10/10 无差异，满足 V1 §2.5「同候选、同输入/依赖、同命令、同环境」复用条件。
- B0 终态只作对照（3462/3435/9/18）；B0 的通过计数不作为当前候选证据。
- 管理/治理记录（V1/E1/D1/B0/P1/沟通/角色卡 `docs/change/`）不进入产品候选；产品候选树/逐文件哈希不受其追加影响。
- 未使用其它变更（acceptance-return-card、dispatch-guardrail-relax、global-task-state、i18n、shell-escalation 等）的通过结论或证据。

---

## 二、检查方法

### 2.1 T3 档位核对

- 变更触及 `src/model/runtime.ts` 共享 Model（`CONTRACT_SCHEMA_TOPICS`/`ContractSchemaTopic`/`ContractCheckInput.topic?`）、`contract_check` 公共工具契约（`src/provider/runtime/{tools,schema}.ts`）与内置策划卡治理文本（`src/common/门禁引擎/governance-roles.ts`）；客户闸门 1 条件与闸门 2/团队计划已确认 **T3**，V1 已定档；本报告按 T3 判定，不降档。
- T3 证据：受影响套件 + T3 全量适用回归 + 双端 typecheck；不要求 Electron E2E；新增确定性失败 0、新增 skip 0。

### 2.2 选定检查与执行

| # | 检查 | 命令 / 方式 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | 运行时/全部 typecheck | `npm run typecheck` | **exit 0**，无诊断 | E2 独立复跑（本报告 §5.3） |
| 2 | 渲染端 typecheck | `npm run typecheck:renderer` | **exit 0**，无诊断 | E2 独立复跑（本报告 §5.3） |
| 3 | 编排受影响套件 | `node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/trio-worker-report.test.ts` | **34 tests / 34 pass / 0 fail / 0 skip / 0 todo** | E2 独立复跑；D1 `03-suite-orchestration.log` |
| 4 | 桌面窗口受影响套件 | `node --test --test-concurrency=1 test/桌面应用/rejection-copy.test.ts test/桌面应用/run-pin.test.ts` | **36 / 36 pass / 0 fail / 0 skip / 0 todo** | E2 独立复跑；D1 `04-suite-desktop-app.log` |
| 5 | 门禁引擎只读回归 | `node --test --test-concurrency=1 test/门禁引擎/view-image-cards.test.ts test/门禁引擎/list-project.test.ts` | **18 / 18 pass / 0 fail / 0 skip / 0 todo** | E2 独立复跑；D1 `05-suite-gate-engine.log` |
| 6 | 独立行为探针 | `node <系统临时目录>/e2-contract-schema-probe.mjs <worktree>` | **55 pass / 0 fail** | E2 独立执行（本报告 §5.4） |
| 7 | T3 全量回归 | D1 同候选：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' \| sort)` | **393 文件 / 3478 tests / 3451 pass / 9 fail / 18 skipped / 0 todo**（exit 1，9 项既有 Windows symlink EPERM） | D1 `07-full-t3.log` 4,580 行 / `e59a4dc9…`；文件清单 393 行 / `a57ec953…`（E2 复核） |
| 8 | B0 对照 | B0 终态同命令重跑 | **393 文件 / 3462 tests / 3435 pass / 9 fail / 18 skipped / 0 todo** | B0 `07-full-t3-rerun.log`（E2 复核 4,564 行 / `388a52a2…`） |
| 9 | Electron/E2E | 未运行 | V1 不要求；D1 仅记录 Electron 44.7.0 与 dist 存在、无进程 | 不写成通过 |

### 2.3 单上下文与唯一结论

- 本报告由唯一验收主上下文完成；未启动并行取证子上下文，故无 E1–E4 分配/冲突记录；所有判断由本上下文自行打开原始日志/哈希/源码后作出。
- 子上下文/开发自述/测试转述/完成报告均未被当作结论；E2 复核的是原始命令输出、文件哈希、D1/B0 原始日志与源码 diff。

### 2.4 判定与证据规则

- 判断值仅 `pass` / `fail` / `insufficient evidence` / `not applicable`（N/A 必须写依据，见 §七.1）。
- 证据复用限同候选、同输入/依赖、同命令、同环境；候选/输入/依赖/契约变化使受影响证据失效。
- 验收通过只表示当前候选满足 V1；不授权提交/推送/合并/发布。

---

## 三、AC-1–AC-18 验收表

| ID | 方案 §7.2 标准（摘要） | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1 | 三示例真实 parser 通过；modules/roster 示例 `modules[]` deepEqual | 两 parser `ok:true` + deepEqual 原始断言 | 编排测试 `AC-1/AC-2`；D1 `03-suite-orchestration.log`（34/34）；E2 探针 | 10 文件候选 | 编排（A1） | parser 通过、deepEqual 通过 | **pass** |
| AC-2 | roster 示例与 topology 示例单一来源 | `includes` 断言 | 编排测试 `AC-1/AC-2`；E2 探针 | 同上 | 编排（A1） | `includes === true` | **pass** |
| AC-3 | 三块文本 ≤4 KiB；roster ≤3900 B | 字节数断言/实测 | 编排测试 `AC-3+P1-CSQ-03`；E2 探针 2438/3763/1265 B | 同上 | 编排（A1） | 全部满足 | **pass** |
| AC-4 | topic 透传 | `seenInput.topic` 断言 | `rejection-copy.test.ts` topic 透传用例；E2 探针 | 同上 | 桌面窗口（A2） | 三 topic 透传 | **pass** |
| AC-5 | 未知 topic `ok:false`、列可用值、数据源未调用 | 返回原文 + 调用计数 | `rejection-copy.test.ts` 未知 topic 用例；E2 探针 calls=0 | 同上 | 桌面窗口（A2） | 拒绝且未调用 | **pass** |
| AC-6 | 非字符串 topic `ok:false`、含「应为字符串」 | 返回原文 | `rejection-copy.test.ts` 非字符串用例；E2 探针 | 同上 | 桌面窗口（A2） | 拒绝文案正确 | **pass** |
| AC-7 | 角色隔离 | `{topic,roleId:other}` 返回原文 | `rejection-copy.test.ts` 隔离用例；E2 探针 calls=0 | 同上 | 桌面窗口（A2） | 隔离先于 topic | **pass** |
| AC-8 | topic 模式无 legacy 行；topic+flowId+taskKind 时 topic 优先 | 行断言 + 透传断言 | `run-pin.test.ts` session 用例、`rejection-copy.test.ts` 并存用例、A1 文本无字面 `taskKind`；E2 探针 | 同上 | 桌面窗口（A2）；编排（A1） | 无 legacy 行、topic 优先 | **pass** |
| AC-9 | 四字段逐字段错误矩阵；purpose raw/effective；boolean 收到类型 | 错误码/reason 矩阵原文 | 编排测试 `AC-9` 两侧矩阵；E2 探针（含 publicContract:true→boolean: true） | 同上 | 编排（A1） | 矩阵通过、错误码不变 | **pass** |
| AC-10 | topology management 提示与校验口径一致 | mapping/缺角色/宽容读取/v1 提示原文 | 编排测试 `AC-10+P1-CSQ-05/06`；E2 探针 | 同上 | 编排（A1） | 文案一致、宽容读取不变 | **pass** |
| AC-11 | 策划卡出现四项；卡守卫回归 | 卡文本原文 + 断言/回归输出 | `trio-worker-report.test.ts:200-203`；门禁 18/18；E2 探针卡 4612 B/27 行 | 同上 | 门禁引擎（A3）写卡；编排（A1）断言；测试（D1）回归 | 四项齐全 | **pass** |
| AC-12 | 无新写路径；topic 分支第一句早退；无 run 也可用 | 源码 diff + 空根测试 | `app/desktop/session.ts` diff；`run-pin.test.ts` 空根用例；E2 复核 | 同上 | 桌面窗口（A2） | 首句早退、无 IO | **pass** |
| AC-13 | 旧调用不变 | legacy 输出 + `seenInput` 深比较 | 既有 `rejection-copy`/`run-pin` legacy 用例全过；测试 diff 仅 2 import 删除 | 同上 | 桌面窗口（A2）；测试（D1） | 逐字不变 | **pass** |
| AC-14 | 双端 typecheck；§7.3 套件全过 | 退出码 0 + 六套件计数 + T3 | E2 独立复跑 88/88、typecheck 0/0；D1 T3 3478/3451/9/18 | 同上 | 测试（D1）；运行时核心 | 全部通过 | **pass** |
| AC-15 | `loadLatestRoster` 正/负例 | 正例 ok + 五负例 code | 编排测试 `AC-15+P1-CSQ-04`；E2 探针 | 同上 | 编排（A1） | 正例 ok、五负例命中 | **pass** |
| AC-16 | null/空/空白 legacy；`topic:123` 拒绝 | `seenInput`/输出/错误原文 | `rejection-copy.test.ts` AC-16 用例；E2 探针 | 同上 | 桌面窗口（A2） | 三项 legacy、123 拒绝 | **pass** |
| AC-17 | 每 topic schema 常量恰好 3 行且等于常量期望行 | 逐行数组 deepEqual | 编排测试 `AC-17`；E2 探针 | 同上 | 编排（A1） | 3/3/3 且逐行一致 | **pass** |
| AC-18 | 占位 omissionReason 警告；真实项目文档不含占位符 | 文本断言 + 只读抽查 | 编排测试 `AC-18`；E2 探针；真实项目只读抽查 **not applicable**（§七.1） | 同上 | 编排（A1）；独立验收（E2） | 警告包含；真实项目 N/A 有依据 | **pass**（第 2 子项 N/A 有依据） |

**AC 判定汇总**：AC-1–AC-18 全部 `pass`；无 `fail`、无 `insufficient evidence`。AC-18 第 2 子项按 V1 §3.18 记 `not applicable`（运行项目不在本 worktree/主仓库可见路径；未修改），第 1 子项（schema 文本警告）已 pass，未因 N/A 豁免。

### 3.1 关键 AC 备注

- **AC-8**：session 测试直接断言三 topic 无 `^run：`/`^taskKind .*必填`/`^可写边界：` 行，且 topic+flowId+taskKind 时输出与纯 topic 相同；A1 文本测试与工具层测试另行断言输出不含字面 `taskKind`。V1 §3.8 证据第 3 项由 A1/工具层覆盖；session 输出与 `contractSchemaText` 同源，未把未运行写成通过。
- **AC-11**：卡断言在 `trio-worker-report.test.ts:200-203`（四条正则）；门禁 `view-image-cards`/`list-project` 18/18；E2 探针实测卡 4612 B / 27 行、两行位置在产物说明之后与「名单是人事招人的唯一依据」之前。活动路径：`governanceRoleOf("rapporteur")` 注册表（`:332`）→ `resolve-role.ts:98` 使用 `spec.cardText`，本报告判定时仍成立。
- **AC-12**：`app/desktop/session.ts` diff 仅新增 `contractSchemaText` import 与 `contractCheckText` 第一条可执行语句 `if (input.topic !== undefined) return contractSchemaText(input.topic);`；该语句前无 `getListing`/`refreshListingNow`/`writeFile`/`appendFile`；`run-pin.test.ts` 在无项目文件、无 run 的空临时根调用三 topic 成功。
- **AC-14**：E2 独立复跑的三组受影响套件 88/88 与双端 typecheck 0 与 D1 一致；T3 全量复用 D1 同候选证据（候选哈希 10/10 一致），未把 D1 摘要当结果，已核对原始日志计数、文件清单与失败集合。
- **AC-15**：D1/编排测试正例使用 `PROJECT_ROSTER_SCHEMA_EXAMPLE` 作 roster、`PROJECT_MODULES_SCHEMA_EXAMPLE` 作 modules 文档；E2 探针独立构造临时项目并命中 `roster-modules-drift`、`roster-reference-stale`、`roster-reference-inconsistent`、`roster-reference-missing`、`roster-modules-doc-missing`。
- **AC-18**：schema 文本三条警告均在（含「占位 omissionReason 必须替换，不得原样提交」）；真实运行项目 `ans-work/科研/layer0` 不在本 worktree，也不在主仓库根当前可见路径（`C:\Users\51054\Desktop\work\ans-studio\ans-work` 不存在），按 V1 §3.18 记 `not applicable`，未修改任何运行项目文档。

---

## 四、K1–K8 验收表

| ID | 核对项 | 结果与证据 | 判断 |
| --- | --- | --- | --- |
| K1 | `contract_check` topic 契约（枚举/零磁盘读/未知/非字符串/空空白/隔离/legacy/4 KiB） | E2 探针 9 项全过；`rejection-copy`/`run-pin` 用例；`session.ts` 首句早退；字节 2438/3763/1265，roster ≤3900；工具描述 `topic.enum` 三值、`required` 不含 topic（K1.9 支持证据） | **pass** |
| K2 | 三示例与加载级 | parser ok/deepEqual；`loadLatestRoster` 正例 + 五负例（E2 探针与编排测试） | **pass** |
| K3 | 逐字段错误矩阵 | 两侧四字段 × 7 值矩阵（missing/null/empty/boolean/number/array/object）；`purpose:true`→`boolean: true`；`purpose:""`+responsibility→`string（空）`；错误码不变 | **pass** |
| K4 | topology management 扁平数组与提示一致 | mapping→`object（mapping）`/写作格式；缺角色含「扁平」；`[convener,implementer,5]`/多余 id 宽容通过；v1 提示不含旧句 | **pass** |
| K5 | 策划卡两行与断言 | 卡文本两行、四条断言、卡守卫回归、活动路径核对、4612 B/27 行 | **pass** |
| K6 | schema 常量单一来源 | 每 topic 恰好 3 行且等于常量期望行；文本用 `PROJECT_*_SCHEMA` 插值 | **pass** |
| K7 | 占位 omissionReason | 三条警告 + 占位符文本；真实项目只读抽查 N/A 有依据 | **pass** |
| K8 | 不变面 | 无新写路径/权限/门禁/边界/新工具/依赖/文件；parser 接受/拒绝集合不变；错误码不变；B-0 | **pass** |

---

## 五、独立核对详情

### 5.1 候选哈希、候选树与写集

- E2 判定时逐文件复算 `git hash-object` + `sha256sum`：**10/10** 与 E1 §1.1、D1 §二一致（附录 A）。
- 候选树 `57fdf6b369aece73ba3f3d4685f9ba3f9c91b95f` 与产品 status 快照 `9b410444…` 由 E2 独立复算，与 E1 一致。
- `git status --porcelain -- src app test`：10 条 `M`，无新增/删除；staged 空；`package.json`/锁/构建配置/README 未改。
- 写集与团队计划 §4.1/§4.3、V1 §七精确匹配；无越界。

### 5.2 源码 diff 与方案一致性（只读）

| 文件 | diff 摘要 | 与方案/AC 核对 |
| --- | --- | --- |
| `src/model/runtime.ts` | +6/−0：`CONTRACT_SCHEMA_TOPICS`、`ContractSchemaTopic`、`ContractCheckInput.topic?` | 与方案 §3.1 一致；既有字段/`ContractCheckFn` 不变 |
| `src/provider/runtime/tools.ts` | +21/−2：读原始 `topic`；非字符串/未知拒绝且不调用数据源；合法 trim 后透传；隔离先于 topic；topic 专用截断标记 `…（已截断）`；legacy 标记逐字不变 | 与方案 §3.1/§3.2/§3.3 一致；错误码/注册条件不变 |
| `src/provider/runtime/schema.ts` | +6/−2：`topic` 参数 `enum:[...CONTRACT_SCHEMA_TOPICS]`；description 与两条 `promptGuidelines` 按方案 §3.7 写入；`required`/`additionalProperties` 不变 | 与 P1-CSQ-01/方案 §3.7 一致 |
| `src/common/编排/workflow-preconditions.ts` | +201/−7：三示例常量、三块文本、`contractSchemaText`、`describeContractValue`、逐字段错误、topology 文案、parser 同步注释 | 与方案 §3.5/§3.6/§4.1/§4.2/§4.3 一致；7 条删除均为旧合并报错/旧 topology 文案，接受/拒绝集合不变 |
| `app/desktop/session.ts` | +4/−0：import + `contractCheckText` 第一条可执行语句早退 | 与方案 §3.3 一致；早退前无 IO；legacy 逻辑未动 |
| `src/common/门禁引擎/governance-roles.ts` | +2/−0：`RAPPORTEUR_CARD_TEXT` 两行（方案 §5.1 原文），位置在产物说明后、名单锚点前 | 与方案 §5.1/A3 一致；`@deprecated` 注释保留（P1-CSQ-10） |

- 未发现 parser 接受/拒绝集合变化：`management` 单字符串兼容/过滤非字符串项/多余 id 不报错、`architectureSource` 非空即通过均保持；错误码 `roster-module-fields-missing`/`modules-doc-fields`/`roster-topology-mismatch` 等不变；无新写路径/权限/依赖/文件。

### 5.3 受影响套件与双端 typecheck（E2 独立复跑）

- `npm run typecheck` → **exit 0**，无诊断。
- `npm run typecheck:renderer` → **exit 0**，无诊断。
- 编排：**34 tests / 34 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**（约 527 ms）。
- 桌面窗口：**36 / 36 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**（约 4.1 s）。
- 门禁引擎：**18 / 18 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**（约 0.4 s）。
- 合计 **88/88**，与 D1 一致；E2 复跑后候选状态仍 10 文件、快照 `9b410444…` 未变。

### 5.4 独立行为探针（55/55）

E2 在系统临时目录执行独立探针（脚本 `C:\Users\51054\AppData\Local\Temp\e2-contract-schema-probe.mjs`，未写入仓库；运行目录为 worktree 根），直接 `import` 候选模块并断言：

- schema 文本 UTF-8 字节 **2438 / 3763 / 1265**，均 ≤4096，roster ≤3900；三块首两行符合方案；三块全文无字面 `taskKind`。
- 三示例常量插值/包含关系正确；`parseProjectModules`/`parseProjectRoster` 均 `ok:true`，`modules[]` deepEqual；schema 常量每 topic **恰好 3 行**且等于期望行。
- 逐字段矩阵：`name`/`purpose`/`publicContract`/`architectureSource` × missing/null/empty/boolean/number/array/object（roster 与 modules 文档两侧）均按预期拒绝、错误码不变、`reason` 含字段与收到类型；`publicContract: true` → `boolean: true`；`purpose:true` → `boolean: true`；`purpose:""`+responsibility → `string（空）`；`responsibility` 别名通过。
- topology：mapping → 写作格式/扁平字符串数组/management.roles/object（mapping）；`[convener]` → 缺项目角色 + 扁平；`[convener,implementer,5]` 宽容通过；v1 提示不含旧句；`management: ""` → `string（空）`。
- `loadLatestRoster`：正例 `ok:true`；`roster-modules-drift`/`roster-reference-stale`/`roster-reference-inconsistent`/`roster-reference-missing`/`roster-modules-doc-missing` 五负例全部命中。
- 工具层：topic 透传、未知/非字符串拒绝且 calls=0、null/空/空白 legacy、角色隔离、并存参数 topic 优先、topic 截断标记 `…（已截断）` 且不含 run manifest、legacy 标记不变；`describeTool` topic enum 三值、required 不含 topic。
- 策划卡：四要素齐全、4612 B / 27 行、两条新行位置正确。
- **结果：55 pass / 0 fail**（原始 JSON：`{"pass":55,"fail":0,"failures":[]}`）。

### 5.5 T3 全量回归复用与 B0 对照

- D1 同候选证据：`07-full-t3.log`（4,580 行 / 512,872 B / `e59a4dc9ae61343ec571a60d3a509eab96e8be50229641b6807f7644d54efc22`）原始汇总：
  - `ℹ tests 3478`；`ℹ pass 3451`；`ℹ fail 9`；`ℹ cancelled 0`；`ℹ skipped 18`；`ℹ todo 0`；`ℹ duration_ms 268376.7958`；exit 1。
  - 文件清单 `07-full-t3-file-list.txt` **393 行** / `a57ec953b345c2a2ded73b3c7337bc0477be32de95b0f56167841a731f9a15ce`；与 B0 精确命令文件清单同一哈希。
  - 失败分类 `08-failure-classification.txt` 190 行 / `7c43fae74a9210dc7396d36f2b605ecb1d4ba7aebd6f0693e558ddbe8ae3f1e6`；E2 从 D1 与 B0 重跑日志提取 `✖` 名称（去除耗时）后，9 项失败名称集合完全一致：均既有 Windows symlink `EPERM`（errno -4048），无新增确定性失败。
  - 18 项 skip 与 B0 同集合；0 todo；无新增 skip。
  - 排除项：`test/pi-adapter/write-sequencing.test.ts`（既有已知挂起，历史 39+ 分钟无进展/CPU 约 2339s；依据 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604` 与团队计划 §7.2）；D1/B0 均未运行、未验证；排除命令与原因已记录，未当通过。
- B0 终态对照：`07-full-t3-rerun.log` 汇总 **3462 / 3435 / 9 / 18 / 0**；D1 较 B0 **+16 tests / +16 pass**（编排 +8、桌面 +8），fail 9 同集合、skip 18 同集合；**新增确定性失败 0、新增 skip 0**。
- E2 未重跑 393 文件全量；按 V1 §2.5 复用 D1 同候选证据，并已核对原始日志、文件清单、失败集合、计数与哈希；未把 D1/E1 摘要当作结果。

### 5.6 证据哈希复算

- D1 记录 §十列出的 15 个证据文件：E2 逐文件 `sha256sum` 复算 **15/15 一致、0 不匹配、0 缺失**（产品候选 10 路径不在证据目录，属 §二候选表，另行 10/10 核对）。
- B0 记录 §九列出的 15 个证据文件：**15/15 一致**（含 `06-full-t3.log`、`07-full-t3-rerun.log`、两个文件清单、两份失败分类）。
- 关键证据哈希：D1 候选身份 `00-candidate-identity.txt` `d43afb48…`；D1 运行后核验 `09-post-run-verification.log` `9c3cdca5…`；D1 写集核对 `12-scope-check.txt` `b92ddb50…`；B0 终态记录 `9f587280…`。
- 测试 diff：`10-test-diff-U0.txt` 567 行 / `95597dbc…`；`10b` 19 行 / `828e1508…`；E2 复核工作区 `git diff -U0 -- test` 删除行仅 2 条 import，无断言删除/放宽，无 skip/todo 新增。

---

## 六、事故披露核对

1. **P1 有效版本**：沟通「P1 审核记录」与「并发事故与状态校正」裁决有效决定 = 原 **293 行 / `d547b90d…`、`recommend approval` + P1-CSQ-01–10**。E1 §六.1 已如实披露，并给出原版/恢复版/事故版三者关系；未把事故版当有效决定。
2. **恢复版完整性**：E2 独立复算：恢复版正文（原 H1 至结尾）**42,198 B / `f297b267…`**；frontmatter（521 B）+ 正文复算整文件 **恰为 `d547b90d…`**。恢复版整文件 300 行 / `1f4b8f34…` 与沟通记录一致；E1 已披露这是重建版、非整文件逐字节恢复，审计链缺口如实记录。
3. **事故版**：当前原路径 **272 行 / `4469ce2d…`、`status: blocked`、`needs revision`**；其 §0 自述「不是当前生效的 P1 决定，生效以 293 批准版为准」。E2 只读核对成立；未以事故版判定，也未因事故放宽 AC。
4. **B0 终态**：**189 行 / `9f587280…`**（171/`314f9941…` 为中间版）；E1 §六.2 已披露；E2 复核终态 T3 计数 3462/3435/9/18 与记录一致。
5. **A1 提案版本**：评审版 90/`70e36ea4…`，现版 90/`9fe02757…`（P1-CSQ-03 修订），无单独复审记录；E1 §六.3 已如实披露；A1 实施记录确认 P1-CSQ-03/04/05/06 落点；A1 文本/测试与现版一致。
6. **双会话协调**：E1 §六.4 已披露两路并行导致 B0/P1 记录覆盖、沟通裁决与恢复；沟通记录「并发事故与状态校正」「E2 归属与审核版恢复」「分工确认」已落盘；本 E2 由写 V1 的同一主上下文执行，符合沟通裁决。
7. **未因事故放宽 AC/标准**：V1 未修改（725 / `110018449f…`）；AC-1–AC-18 与 K1–K8 按原文判定；事故只影响 P1/B0 记录版本，不影响产品候选 10 文件哈希与 D1 证据；E2 未把恢复版/事故版自述当证据。
8. **过程提示（非阻断）**：P1-CSQ-02 要求 A2 增加 topic 超长注入的截断标记测试；仓库现有 `rejection-copy.test.ts:193-207` 只覆盖 legacy 超长，未覆盖 topic 分支；实现代码的 topic 标记 `…（已截断）` 已由 E2 独立探针验证（长度 ≤4096、无 run manifest 标记），V1 未把该测试列为 AC/K 通过条件，故不影响 AC 判定；建议统筹安排测试角色补一条测试（不改变当前候选与结论）。

---

## 七、限制、未检查与 N/A 依据

1. **AC-18 真实项目只读抽查**：`ans-work/科研/layer0` 不在本 worktree（`ls ans-work` 不存在），也不在主仓库根当前可见路径（`C:\Users\51054\Desktop\work\ans-studio\ans-work` 不存在）；本验收的只读范围不含运行项目，未修改任何运行项目文档。按 V1 §3.18 记 **`not applicable`**（第 2 子项）；第 1 子项（schema 文本警告）已 `pass`，未因 N/A 豁免。
2. **Electron/E2E**：V1 不要求真实 Electron E2E、截图或录屏；本任务不涉及渲染层/UI；未启动应用、未跑 E2E、未截图/录屏。缺少录屏不构成失败。
3. **T3 全量未由 E2 重跑**：复用 D1 同候选证据（候选 10/10 一致，日志/清单/失败集合/哈希已复核）；E2 另行独立复跑受影响 88/88 与双端 typecheck。该复用符合 V1 §2.5；B0 仅作基线对照。
4. **P1-CSQ-02 测试落点**：见 §六.8；实现行为已由 E2 探针验证，缺专用测试属过程完备性提示，不改 AC 判定；后续补测试后建议重跑受影响套件，但不改变当前候选哈希/结论。
5. **A0/A2 无独立实施记录**：E1 §六.9 已披露；候选由 P1 提案、D1 哈希与证据覆盖，不把缺记录当实现失败，也不当作额外通过依据。
6. **D1 命令的 `| sort`**：D1 §六命令在 `find` 内附加 `| sort`；仅固定文件顺序，与 V1 精确命令同一文件集合（文件清单哈希 `a57ec953…` 与 B0 精确命令一致）；D1 已记录实际命令，不构成排除/覆盖偏差。
7. **无 task_ops**：本项目无 `.ans/project.json`；未伪造任务令牌、锁、审批、预检或验收凭证；证据以文件哈希与原始输出为准。
8. **管理记录会追加**：沟通/E1/D1/B0/P1 记录可能继续追加；本报告引用其确认小节/原始证据哈希；产品候选 10 文件哈希不受管理记录变化影响。
9. **未运行**：未修改代码/测试/方案/复核/沟通/E1/角色卡/边界；未 commit/push/merge/release；未接触客户。

---

## 八、总体结论与授权边界

**总体结论：通过（pass）。**

- **AC-1–AC-18 全部 `pass`**（AC-18 第 2 子项 `not applicable` 有依据）；**K1–K8 全部满足**；**T3 证据口径齐全**（受影响 88/88、双端 typecheck 0/0、T3 全量 3478/3451/9/18 与 B0 对照 0 新增确定性失败/0 新增 skip、排除项记录、Electron 不要求）。
- 候选为 HEAD `243d8f6` + 10 文件，逐文件哈希 10/10 与 E1/D1 一致；候选树 `57fdf6b3…`、status 快照 `9b410444…`、diff `+780/−13`；无写集外改动、无新增文件/依赖、无边界变更（B-0）。
- 事故披露充分：P1 有效 293/`d547b90d…` + 恢复版 `1f4b8f34…`（frontmatter+正文复算 = `d547b90d…`）+ 事故版 272/`4469ce2d…`；B0 终态 189/`9f587280…`；A1 提案 90/`9fe02757…`；双会话协调有沟通记录。未因事故改变 AC 或候选证据。
- 本报告是**唯一 B2**；结论只表示当前候选满足 V1，**不授权提交、推送、合并、发布**，不授权修改产品/测试/方案/复核/沟通/E1/角色卡/边界。E3 可按匹配当前候选的通过结论记录/放行/回报；提交/推送/发布另行授权。

---

## 附录 A：候选 10 文件哈希（E2 判定时实测，与 E1/D1 一致）

| # | 路径 | git hash-object | SHA-256 | 行数 |
| --- | --- | --- | --- | --- |
| 1 | `src/model/runtime.ts` | `90f0a4b4b15d66e41a2c2f9c1333581d7339da50` | `05d6e4e9f4740e88b5616a0e76960b93e936d17466e0dbe1b8d473c30fe7d0f5` | 2734 |
| 2 | `src/provider/runtime/tools.ts` | `8b257fbe2649f8c4538a1a284dcf1d54d886a9cb` | `2d2f8b10cafecb1e9c65871faa5c64862f71a2fa94bc29135bb79812933be159` | 3667 |
| 3 | `src/provider/runtime/schema.ts` | `1683fb406fdabab10afa831770c8b85cd9142672` | `0cb1f6f4dcd7b6a7b6e8ec52c68d5ad593ca0b58f07bc66b15a6a1408bbe987e` | 1422 |
| 4 | `src/common/编排/workflow-preconditions.ts` | `74a60e37ce8931ca282d4fc38e9099cd88642400` | `5fa99f57c2423531bc28784e3561313953f2f134bb6ffa3f6574380ed23fb727` | 1531 |
| 5 | `test/编排/workflow-preconditions.test.ts` | `f1b2d26cce30a72eed6be558ae95063d002c6913` | `9d083a156d0d645b133e299c2fc9f473d2cc36de1bb27d180f9cc1bf6f98e9ad` | 1305 |
| 6 | `test/编排/trio-worker-report.test.ts` | `d2bc956507def345fcff71985b76165c77879af7` | `7ab180eb49c4c94b9dd0a47360c21ec298dee12a71bf34461ea9fd8cd5ab4d2c` | 261 |
| 7 | `src/common/门禁引擎/governance-roles.ts` | `8926ec3faa354ad2716ae01168d2ec46fa741f54` | `e1639969069a90b1aada42850da0bcbf4aac35dbdc4fd1a976f6996ee3842f40` | 617 |
| 8 | `app/desktop/session.ts` | `26aac02aecee060ce0d5c4aa5a5ca2d0102a7978` | `346777afb5dc1e89af5ea89905ddb11a595f9f7cb8cec71099f7d866fb538f82` | 8794 |
| 9 | `test/桌面应用/rejection-copy.test.ts` | `b372d88b8a89859483609c02ada8443237eff2e0` | `71388f9f734309074a8e6bd8a3c5a14853def4309a656b2878274e9c65d3cb91` | 410 |
| 10 | `test/桌面应用/run-pin.test.ts` | `779a2480fb02d9c06e38cc875f3c9e11c8a46be1` | `3344387aada33224e97aae49b157cfd49519a6afa0e62bff90106761cbb075bc` | 889 |

## 附录 B：E2 独立命令与结果

```text
npm run typecheck                         -> exit 0
npm run typecheck:renderer                -> exit 0
node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/trio-worker-report.test.ts
  -> tests 34 / pass 34 / fail 0 / skipped 0 / todo 0
node --test --test-concurrency=1 test/桌面应用/rejection-copy.test.ts test/桌面应用/run-pin.test.ts
  -> tests 36 / pass 36 / fail 0 / skipped 0 / todo 0
node --test --test-concurrency=1 test/门禁引擎/view-image-cards.test.ts test/门禁引擎/list-project.test.ts
  -> tests 18 / pass 18 / fail 0 / skipped 0 / todo 0
node C:\Users\51054\AppData\Local\Temp\e2-contract-schema-probe.mjs <worktree>
  -> {"pass":55,"fail":0,"failures":[]}
```

## 附录 C：D1 T3/B0 对照与关键证据哈希

| 项 | B0 终态（189 / `9f587280…`） | D1（当前候选，223 / `ab7ffb07…`） | 差 |
| --- | --- | --- | --- |
| T3 文件 | 393（排除 `write-sequencing.test.ts`） | 393（同排除） | 0 |
| tests | 3462 | 3478 | +16 |
| pass | 3435 | 3451 | +16 |
| fail | 9（既有 symlink EPERM） | 9（同集合） | 0 新增确定性 |
| skipped | 18 | 18（同集合） | 0 新增 |
| todo | 0 | 0 | 0 |
| 日志 | `07-full-t3-rerun.log` `388a52a2…` | `07-full-t3.log` `e59a4dc9…` | — |

- D1 文件清单 `07-full-t3-file-list.txt` `a57ec953…`（393 行）；D1 失败分类 `08-failure-classification.txt` `7c43fae7…`；D1 候选身份 `00-candidate-identity.txt` `d43afb48…`；D1 运行后核验 `09-post-run-verification.log` `9c3cdca5…`；D1 写集核对 `12-scope-check.txt` `b92ddb50…`。
- D1/B0 证据目录各 15 文件哈希均由 E2 复算一致（D1 15/15、B0 15/15）；D1 记录另列 10 个产品候选路径哈希，E2 按附录 A 10/10 核对。

**报告结束。** 本报告为唯一 B2，结论**通过**；不授权提交/推送/合并/发布。
