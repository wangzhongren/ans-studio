# E1 rapporteur 角色模块：变更证据

- 日期：2026-11-07
- 角色：rapporteur-code（策划代码维护角色）
- 任务：E1 greenfield 开发 `src/common/roles/rapporteur/` 模块 + `test/roles/rapporteur/` 测试/差分，交付 `api-spec.md` / `memo.md` / 本证据。
- 状态：**实现完成并自测；未提交/未推送；未运行真实模型；不判验收（B2 归独立验收）。**
- 工作树：`.claude/worktrees/trunk-amendment`（分支 `feat/plan-escalation-card`；8 角色并行共享工作树）。

## 1. 输入与核对

| 输入 | 版本/哈希 | 核对 |
| --- | --- | --- |
| E0.3 冻结契约 | `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` 685 行 / `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3` | ✅ 与冻结记录一致 |
| 契约冻结记录 | `docs/scheduling/2026-11-07_contract-freeze_runtime-gate-role-module.md` 91 行 / `5439d7c35deb984862ea41204551d1f498c665e9b6f5ab84939db8104b551a07` | ✅ 读取 |
| 团队计划 §4.4③/§7.4 | `docs/scheduling/2026-11-07_team-plan_runtime-gate-role-modularization.md` 687 行 / `00e1f76b6a527a1237ac1467bb4100805750606904ce6960bb56a013a4ba565c` | ✅ 读取 |
| B1 v1 §3.3 E1.1–E1.7 | `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md` 273 行 / `a999dc1961c9ebe4727f0796d6baefd24a23e75b1a6cc1d215a9c0e2f63b4999` | ✅ 读取 |
| B1 v1.1 | `2026-11-07_runtime-gate-role-modularization-criteria-v1.1.md` 137 行 / `e5027742d4ae36b5f71a090d7ceb956ae3046f06da6d9f4252cf60153776e867` | ✅ 读取（E3.1 口径） |
| 角色卡/边界/YAML | `角色卡/rapporteur-code/{role-card.md,boundary.md,boundary.yaml}` | ✅ 只读；未修改；写集仅 Section 1 |

## 2. 写集与旧代码冻结

- 写入路径（全部为新增文件；无修改既有文件）：
  - `src/common/roles/rapporteur/`（模块，7 文件）
  - `test/roles/rapporteur/`（测试 + fixture，8 文件）
  - `角色卡/rapporteur-code/{api-spec.md,memo.md,functional-description.md,feature-map.md,docs/change/…}`
- 未写：`src/model/`、`src/common/shared/`、`src/common/门禁引擎/`、`src/common/gates/`、`src/pipeline/`、`src/service/`、`src/provider/`、`app/`、其他角色模块、角色卡/边界/YAML/changelog、`docs/scheduling|acceptance|communication|planning`。
- 旧 oracle 文件哈希（E1 冻结期未变；`differential.test.ts` 逐文件校验，变动即测试失败）：
  - `governance-roles.ts` 794 行 / `fddda111cb1ea76614f632f931441d45e534e4f9f23297193615fbdf525cd16e`
  - `run-role.ts` 3333 行 / `026f5e995f4f10cf890a94a5e50d9a9317a0ebbcc04a1106bf287c9d6c2823e6`
  - `apply-journal.ts` 3723 行 / `fd778342ff83ebd51582847cd78f8bdfe0861bd6d8b789e829ac2bfaf3255ffb`
  - `schema.ts` 1829 行 / `6f528a88c6f0afbd5db12c27f0826ab5e4b6e29788162c2cea8b9676a11f9ef8`
  - `decision-card.ts` 145 行 / `ef90c2096b2fdaa67c199bcb54d1a6743389914faad2ffae3d0db244c0a945b5`
  - `workflow-preconditions.ts` 1609 行 / `6c2349a5e7766e8c79edcc5c7b465cbf4bf10bae662cbe13f99499e6c8c4dd41`
  - `role-tool-registry.ts` 157 行 / `9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b`

**迁移期数据说明**：`internal/spec.ts` 的卡文本 / Section 1 / 预授权 / 禁写 / 能力位是旧注册表数据的**迁移副本**（契约 §3.2「数据先行」）；E2 门面装配本模块后删除旧内联规格，不留双份。这属于角色规格数据迁移，不是共享逻辑复制（E1.6 反重复针对共享实现）；卡文本字节一致由差分测试保证。

## 3. 交付清单（行数 / SHA-256）

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `src/common/roles/rapporteur/index.ts` | 63 | `9fd7f422184f85f04bd45d40e2cac0e668be0cf8a640296958e0bb8de293e8b3` |
| `src/common/roles/rapporteur/internal/spec.ts` | 108 | `9d19d1cebfee154c598063b608b01358f22583ef48a9c72a918299538b28e023` |
| `src/common/roles/rapporteur/internal/tools.ts` | 61 | `5a8323b95e97761cc5d4907d2f2f6b4750caab0242756f48da9c84118217deb3` |
| `src/common/roles/rapporteur/internal/dispatch.ts` | 72 | `099313f8cea820758c30ccbec12190c1fc070a241cb66524b852c45f11b0e305` |
| `src/common/roles/rapporteur/internal/preflight.ts` | 401 | `526cfb88a1fe72eb28705c87974a3abe069e9172cd72c809a846d9493ea1a5c0` |
| `src/common/roles/rapporteur/internal/context.ts` | 85 | `29902ee4b95175b063953514282581ffd80b6c02bc161ae343363d8f672a4560` |
| `src/common/roles/rapporteur/internal/codes.ts` | 65 | `bb724b2260f947e91af10a242e6c376e17e0a7c46f929a08d725012478950113` |
| `test/roles/rapporteur/oracle-fixture.ts` | 531 | `e7256e56b28cdae0b3d4ec7efeeb6f987e8cf532546c305a07a9dcac8333521b` |
| `test/roles/rapporteur/spec.test.ts` | 92 | `65085ff4387ffa0e2461afc138cdcb515a7d05cd7890dbc0d835690e2cc88a0d` |
| `test/roles/rapporteur/tools.test.ts` | 92 | `1e02f729e747a812998108aed6ca556b506311eeaf7afc2b70db19ef1c22703f` |
| `test/roles/rapporteur/dispatch.test.ts` | 109 | `c09880be38bc580bec6cc8849c7683ed2c44b85fc92a73fd40d1be52dcbdb240` |
| `test/roles/rapporteur/preflight.test.ts` | 172 | `01bb382a8c3465f5eb4a9ed7b2a0ebc0b8446afb8af56f7ce4420b8a25d7dc1f` |
| `test/roles/rapporteur/context.test.ts` | 101 | `423d43b5ce09c5102d7d33bb3a5e94986cb4ab4124923335dfa4c0a0d0a38296` |
| `test/roles/rapporteur/differential.test.ts` | 132 | `a5e976e22a31ebd2536425133078f2bf397ccd544c1fb6eb32a237a9f44e604a` |
| `test/roles/rapporteur/module-boundary.test.ts` | 135 | `f7982c55c2c9fffbc2c638b6d5bbe1e3e424b5052c35bf14b948440fc338f7b8` |
| `角色卡/rapporteur-code/api-spec.md` | 207 | `a94ec515dcecb8ceeeac0f0b3e4811e9ec9a6a6a6afa133dd634eb9a2a333cab` |
| `角色卡/rapporteur-code/memo.md` | 40 | `9461595e5bb0e1e689a15d86ddf9403e8646462f363110c4e42c5fa99b04ab22` |
| `角色卡/rapporteur-code/functional-description.md` | 49 | `2dd251465e7647d29ddd2b50901c1d128a7464769190c245dbbe77d35a73b66c` |
| `角色卡/rapporteur-code/feature-map.md` | 23 | `2eec1116c66e82730ebfb104897cf940133ab37347929387e201d625f0b01460` |

> 本证据文件自身的哈希在写盘后由完成报告给出（不自引用）。

## 4. public API

- 唯一 public entry `src/common/roles/rapporteur/index.ts` 导出 `rapporteurRoleModule: BuiltInRoleModule`（无 default、无其他导出）。
- 规格：id/displayName/function/card(text/entries/preauthorizedDirs/forbiddenWritePaths)/capabilities/cards，与旧注册表逐字段一致。
- `tools()`：trio ⇒ 3 个稳定 id（requestRequirementChange/submitVersionChange/selectRunChange）；非 trio/未知/畸形 ⇒ 空 + 稳定 reason。
- `dispatch()`：R-2 硬身份/存在性；rapporteur 不是可派发来源 ⇒ 恒 deny、无 `reportToRoleId`；5 个稳定码。
- `preflight.checkAction()`：detail-amendment / run-change / requirement-change 正负例；未覆盖动作 `action-not-covered`；事实键/错误码/messageKey 见 `api-spec.md` §5/§7。
- `context()`：4 个静态 section（角色 / 决策上下文 / 报告期望 / decision 卡数据）；非 trio 单一不可用声明；未登记 context fact 键（非空/非法 facts ⇒ 单一拒绝性 section，不读取内容）。

详见 `角色卡/rapporteur-code/api-spec.md`。

## 5. 差分结果（对照旧 oracle）

差分 fixture：`test/roles/rapporteur/oracle-fixture.ts`。**测试不 import 旧引擎**；fixture 为开发期捕获的静态数据，旧文件哈希由 `differential.test.ts` 校验。

| 差分面 | 用例数 | 差异 | 说明 |
| --- | --- | --- | --- |
| 规格 8 字段 | 8 | **0** | id/displayName/function/entries/preauthorizedDirs/forbiddenWritePaths/capabilities/cards |
| 卡文本 | 1 | **0** | 4676 字符 / 34 行 / SHA-256 `4214c632d0215932ce6ce0dae8f39ae6b8e4a226ce487b58f9e0461552cb5a65` |
| 工具声明 vs 旧注入 probe | 3 | **0** | requestRequirementChange / submitVersionChange / selectRunChange |
| 派发 allow 位 | 6 | **0** | 旧 `evaluateDispatchAuthorization` 对来源 rapporteur 恒 false；新模块恒 false |
| 动作前置 allow 位 | 24 | **0** | detail-amendment 6 + run-change 6 + requirement-change 11 + 未覆盖 2 |
| **合计** | **42** | **0（allow/字段）** | 稳定码差异按 `KNOWN_DELTAS` 6 项列明 |

开发期 live probe（旧 oracle，工作树执行；脚本已删除，输出如下）：

```json
{
  "injected": ["requestRequirementChange", "selectRunChange", "submitVersionChange"],
  "dispatch": [
    { "input": { "fromRoleId": "rapporteur", "targetRoleId": "product", "targetBuiltIn": true, "targetExists": true }, "ok": false, "code": "unknown-source" },
    { "input": { "fromRoleId": "rapporteur", "targetRoleId": "worker-1", "targetBuiltIn": false, "targetExists": true }, "ok": false, "code": "unknown-source" },
    { "input": { "fromRoleId": "rapporteur", "targetRoleId": "verifier", "targetBuiltIn": true, "targetExists": false }, "ok": false, "code": "unknown-source" },
    { "input": { "fromRoleId": "chief", "targetRoleId": "rapporteur", "targetBuiltIn": true, "targetExists": true }, "ok": true, "code": null }
  ]
}
```

> `chief → rapporteur` 旧 allow 属 chief 模块/引擎的目标侧规则；rapporteur 模块只回答本角色作为来源的策略（R-2），已在 `KNOWN_DELTAS.dispatch-scope` 登记。

### 已列明差异（`KNOWN_DELTAS`）

1. `dispatch-code-map`：旧 `unknown-source` → 新条件化 `rapporteur-dispatch-*`；allow 位一致。
2. `dispatch-scope`：旧硬授权同时编码 chief/convener 目标规则；模块只覆盖本角色来源。
3. `preflight-fact-schema`：事实键按 Q13 由本角色 api-spec 登记；旧实现无单一 preflight 函数。
4. `preflight-run-change-stop`：旧 direct stop 返回 `blocked(run-stop-unverified)`；模块 allow ≠ 提交成功（停稳证据归 Service）。
5. `preflight-detail-amendment-legacy`：旧逐项/最终卡是 VCA 历史状态机；模块按卡文本编码拒绝。
6. `tools-declaration-vs-injection`：模块声明最大允许集；实际注入由引擎按会话模式/宿主能力门控。

## 6. 测试、typecheck 与边界扫描

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 模块单测 + 差分 + 边界扫描 | `node --test "test/roles/rapporteur/*.test.ts"` | **67 / 67 pass / 0 fail / 0 skip / 0 todo**（`duration_ms` ≈ 218） |
| 旧契约测试回归 | `node --test test/门禁引擎/role-module-contract.test.ts` | **14 / 14 pass** |
| 旧注入测试回归 | `node --test test/编排/run-role-submit-capabilities.test.ts` | **14 / 14 pass** |
| 隔离 typecheck（模块 + 全部测试） | `npx tsc --ignoreConfig --noEmit … src/common/roles/rapporteur/index.ts test/roles/rapporteur/*.ts` | **exit 0** |
| 仓级 typecheck | `npm run typecheck` | **exit 0**（执行时其他角色模块已就位；见 §8 并发说明） |

模块边界/纯度扫描（`module-boundary.test.ts`，全部 pass）：

- 模块根只有 `index.ts`；内部实现只在 `internal/`；外部不得导入 internal（扫描 `src`/`test`/`app`，0 违规）。
- 模块 namespace 只有 `rapporteurRoleModule`；无 `export default`、无其他值导出。
- 全部 import 只指向模块内部 / `src/model/` / `src/common/shared/`；0 引擎/门控/其他角色导入。
- 无 `node:`/`fs`/`path`/`crypto`/`fetch`/`Date`/`Math.random`/`process`/`console`/定时器/文件读写；无顶层 `let`/`var`。

## 7. 证据限制

- 未运行真实 Claude/Codex/Pi 模型；本证据只覆盖确定性单测/差分/静态扫描。
- 未做仓级全量 `node --test --test-concurrency=1`（E3.1 归测试角色/T3）；只跑了本模块与两个只读 oracle 回归套件。
- 旧实现仍是权威 oracle；E2 切换前模块输出**不驱动生产行为**，preflight 尚未被 Service 调用。
- messageKey 未写入共享 i18n（写集不含 `src/common/shared/`），仅登记。
- 卡文本的「意图入口」段落来自共享 `intentEntryContractText("rapporteur")`；共享文本变更会同时改变旧 oracle 与本模块，`spec.test.ts` 会按 fixture 的 intent 文本哈希报警，需重取差分。
- 差分 fixture 的 provenance 哈希在 E2 删除旧文件后需随删除清单更新（否则该测试会按设计失败）。**已由 §10 落实：E2 X-R2 起改为冻结金样，不再读取旧文件。**

## 8. 并发与工作树说明

- 工作树由 8 个 E1 角色并行使用；开发期间 `src/common/roles/{chief,product,nominator,convener,verifier}/` 由同伴写入。
- 期间仓级 `npm run typecheck` 曾因 `src/common/roles/verifier/index.ts` 的相对路径错误短暂变红（非本模块）；本角色未修改该文件，最终复跑 `npm run typecheck` exit 0。
- 本角色只写 §2 所列路径；未提交/未推送/未清理他人文件。

## 9. 后续（E2 交接）

- 门禁引擎门面装配 `rapporteurRoleModule` 并删除内联规格；编排 `run-role.ts` 改读 `tools()` 并经 registry 校验；Service 接 `preflight`；编排/桌面接 `context()`。
- 每单元双跑差分 + 回滚演练 + 删除清单；切换成功验证后删除旧实现（含本 fixture 的旧文件锚点更新）。
- 报告期望仍由 `workflow-preconditions.ts::reportTargetForTaskCreator` 实际路由，模块只声明期望。

## 10. E2 X-R2 fixture 更新（2026-11-07，rapporteur-code）

### 10.1 触发与结果

- 触发：E2 X-R1 改 `run-role.ts`、X-R2 改 `governance-roles.ts`（rapporteur 门面装配）后，本证据 §2 的 live 旧文件哈希锚点失效；`node --test "test/roles/rapporteur/*.test.ts"` 为 **67 tests / 66 pass / 1 fail**，唯一失败为 `differential.test.ts` 的旧 provenance 测试（实际 `45d331ed… != fddda111…`、`fd65cc4a… != 026f5e99…`；见 X-R2 证据 §6.4）。
- 处置：按 E2 检查单 **G9**（先冻结金样：场景输入+期望输出+来源候选+hash；禁止删断言/整文件）把 live oracle 依赖改为**冻结金样**，不再读取工作树旧文件。
- 结果：**67 / 67 pass / 0 fail / 0 skip / 0 todo**；差分矩阵 42 项比较与 6 项 `KNOWN_DELTAS` 全部保留。

### 10.2 改动点

| 文件 | 变更 |
| --- | --- |
| `test/roles/rapporteur/oracle-fixture.ts` | `OLD_ORACLE_PROVENANCE` → `ORACLE_GOLDEN_META`（schema/来源候选/捕获期 `capture` 7 文件/切换后 `switch`/计数/覆盖映射/`payloadSha256`）+ `ORACLE_GOLDEN_PAYLOAD`（冻结期望值）。行数 531 → **653**。 |
| `test/roles/rapporteur/differential.test.ts` | provenance 测试改为「金样·provenance」：元数据自洽、切换前后交叉核对、计数/覆盖映射、载荷 SHA-256、无旧引擎 import/同步读文件扫描。移除 `readFileSync`/`sha256File`/`PROJECT_ROOT`。行数 132 → **223**。 |

**来源候选**：捕获期（E1，X-R1/X-R2 之前）为工作树捕获、未单独提交，候选身份以本证据 §2 的行数+哈希为准（`governance-roles.ts` 794/`fddda111…`、`run-role.ts` 3333/`026f5e99…`、其余五文件见 §2）；切换后实测以 X-R2 证据 §1/§7.1 为准（`run-role.ts` 由 X-R1 改、X-R2 未改）。二者均冻结在 `ORACLE_GOLDEN_META`，运行期不再读取旧文件。

### 10.3 锚点变化（逐条）

| 文件 | 捕获期锚点（历史） | 切换后等价锚点（实测） | 说明 |
| --- | --- | --- | --- |
| `governance-roles.ts` | `404-437`（规格）/ `200-224`（卡文本） | `23`（模块 import）/ `276-288`（`BUILT_IN_ROLE_MATRIX.rapporteur`）/ `377`（`specOf(rapporteurRoleModule)`）/ `532`（`BUILT_IN_ROLE_MODULES` 装配） | X-R2：内联规格/卡文本删除，改由模块 `specOf` 零复制投影；matrix 逐字迁入（D6）。差分期望值不受旧结构影响。 |
| `run-role.ts` | `1808-1825`（工具门控）/ `2859-2878`（`TRIO_CARD_KINDS`）/ `2746-2826`（choice 默认） | `1828-1855`（三提交能力工具门控；rapporteur 旧路径保留）/ `2937-2959`（`TRIO_CARD_KINDS` 回退 + `cardKindsOf` 模块优先）/ `2740`（rapporteur 预授权前缀） | X-R1 S2：product 工具声明改读模块；rapporteur 注入/门控旧路径逐字保留（X-R2 未改本文件）。`TRIO_CARD_KINDS.rapporteur` 仍为回退与迁移前源码 oracle。 |
| 其余五文件（`apply-journal.ts` / `schema.ts` / `decision-card.ts` / `workflow-preconditions.ts` / `role-tool-registry.ts`） | §2 行号 | **不变**（`capture == switch`，测试逐字节交叉核对） | E2 X-R2 时点未改；preflight 接 Service 属后续单元。 |

**结构断言影响**：本差分测试的结构性断言只有 provenance 元数据；期望值均为纯数据 fixture，不依赖旧文件结构，故仅按上表做等价锚点更新，无删除或放宽。

### 10.4 差分矩阵/断言未弱化

- 保留：规格 8 字段、卡文本 sha256/长度/行数、工具集合 3 id、派发 6 用例 allow 位 + 稳定码登记、动作前置 24 用例、`KNOWN_DELTAS` 6 类（合计 42 项比较）。
- 替换（非删除）：1 个 provenance 测试由「live 旧文件哈希必须不变」改为「冻结金样自洽 + 载荷哈希 + 无旧引擎 live 依赖」；断言数不减少（元数据 7 文件 × 4 项 + 切换/未变交叉核对 2+5×3 + 计数 6 + 覆盖 1 + 载荷 1 + 源扫描 ≥2）。
- 覆盖映射记录在 `ORACLE_GOLDEN_META.coverage`；重新捕获须同步更新 `payloadSha256` 并在本证据登记。

### 10.5 测试、typecheck 与哈希

| 项 | 结果 | 原始日志（SHA-256） |
| --- | --- | --- |
| `node --test "test/roles/rapporteur/*.test.ts"` | **67 tests / 67 pass / 0 fail / 0 skip / 0 todo**（exit 0） | `docs/change/2026-11-07_E2-XR2_fixture-update/rapporteur-tests.log` 81 行 / `d2fdc55c35b2024b8231042b4be46df8e39247fc23895b47fa8cbb940236d778` |
| `npm run typecheck` | **exit 0** | `docs/change/2026-11-07_E2-XR2_fixture-update/typecheck.log` 4 行 / `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247` |

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `test/roles/rapporteur/oracle-fixture.ts` | 653 | `21c0220a8bc58eb0ef0e50d8169d4cdfa3a14253576a6c9ddf4f5e9cc0100c1b` |
| `test/roles/rapporteur/differential.test.ts` | 223 | `0894dd2acd53aba154c48ef1180e0c4b58d08c21d8dad662fe93b3e40f795ac4` |
| `ORACLE_GOLDEN_META.payloadSha256`（冻结载荷） | — | `c1062fc28db7888114066ef2364a87ed22440c729739609f28fa11137c798315` |

> 本证据 §3 交付清单中的上述两文件哈希为 **E1 交付期**值；E2 X-R2 后的现行值以本节为准。

### 10.6 遗留

1. 旧实现删除后本差分**无需再改**（已与旧文件解耦）；若删除后仍要求更强漂移防护，可另加跨套件金样审计，不建议恢复 live 文件哈希。
2. `run-role.ts` 的 rapporteur 工具注入旧路径仍在（编排 S2/S4 未做）；若 X-R2 后续子步改变注入行为，须重取 fixture 并同步 `payloadSha256`。
3. `TRIO_CARD_KINDS.rapporteur` 回退行尚在（编排 S2 删除）；删除后 `cards` 仍由模块断言，预期无需重取。
4. 本单元未提交/未推送；未运行真实模型；不判验收。

## 11. E3 扫描修复（2026-11-07，rapporteur-code）

### 11.1 触发

- 来源：E3 扫描（`test/测试/scripts/e3-code-scan.mjs`）发现项 **F1**：`src/common/roles/rapporteur/internal/preflight.ts:50` 的导出 `RapporteurLegacyCardPath`（type-only）在 `src/app/test` 零引用，属「范围内新增导出、D9/E-A10 要求范围内零未使用导出」。
- 判定口径：E3 扫描区分「零引用」（声明外总引用 = 0）与「仅文件内引用」（文件内使用、导出面未被外部使用，不属 F1）。本符号为前者。

### 11.2 符号处置

| 项 | 结果 |
| --- | --- |
| 外部引用（`src` / `app` / `test`，含 `index.ts` 再导出） | **0** |
| 文件内引用 | **0**（仅第 50 行声明自身；无内部使用点） |
| 处置 | **删除**该类型别名（完全未使用，不适用「去 `export` 保留内部类型」） |
| 保留 | `RAPPORTEUR_LEGACY_CARD_PATHS` 常量原样保留（`checkDetailAmendment` 第 226–242 行内部用于 `legacyCardPath` 校验与期望值列举）；仅删除由其派生的未使用类型别名 |
| 行为/类型语义 | **不变**：删除的是 type-only 零引用别名，无运行时映射、无调用方、无再导出；preflight 的 allow/deny、稳定码、事实键均不受影响 |
| 测试/模块同步 | 无需同步（`test/roles/rapporteur/` 内对该符号 0 引用） |

### 11.3 测试、typecheck 与哈希

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 模块单测 + 差分 + 边界扫描 | `node --test "test/roles/rapporteur/*.test.ts"` | **67 / 67 pass / 0 fail / 0 skip / 0 todo**（`duration_ms` ≈ 223） |
| 仓级 typecheck | `npm run typecheck` | **exit 0** |

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `src/common/roles/rapporteur/internal/preflight.ts` | 401 → **399** | **`7842311f764d8db3751a7e789155c25bf13a20b854168a7b69c3c3d3880090e1`** |

- 写集内 status：`src/common/roles/rapporteur/`、`test/roles/rapporteur/`、`角色卡/rapporteur-code/` 均为未跟踪（`??`，E1 greenfield 尚未提交）；本次仅改 `preflight.ts` 与本证据。
- 未提交/未推送；未运行真实模型；不判验收（归独立验收）。
