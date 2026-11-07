# E1 共享组件目录与共享模块维护：证据

- **任务**：E1 共享模块维护/迁移 + 共享组件目录建立（非 greenfield 重写）
- **角色**：`shared-code`（共享代码维护角色，固定 worker）
- **日期**：2026-11-07
- **检出**：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（worktree；分支 `feat/plan-escalation-card`；HEAD `e71501c`）
- **性质**：本角色自证证据，**不是验收结论**（B2 独立验收按 B1 判定）；不授权/不执行提交、推送、合并、发布；未运行真实模型。
- **自引用声明**：本文件不嵌入自身 SHA-256（落盘后由 E1 完成报告/验收复算）；其余文件 hash 均为写盘后原字节复算。

---

## 1. 输入（冻结契约与只读基线）

| 输入 | 路径 | 版本/哈希（本次实测） |
| --- | --- | --- |
| E0.3 冻结契约 | `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` | 685 行 / `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`（冻结记录 §一 一致） |
| 冻结记录 | `docs/scheduling/2026-11-07_contract-freeze_runtime-gate-role-module.md` | 引用 E0.3；Q1/Q6/Q12 与本任务一致 |
| 团队计划 | `docs/scheduling/2026-11-07_team-plan_runtime-gate-role-modularization.md` | `00e1f76b6a527a1237ac1467bb4100805750606904ce6960bb56a013a4ba565c`（§4.4⑦/§5.1/§6.3–§6.4/§7.4） |
| B1 标准 | `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md` | `a999dc19…`（273 行）+ B1 v1.1 `e5027742…`（137 行） |
| B0 冻结脏基线 | `角色卡/测试/docs/change/2026-11-07_runtime-gate-role-modularization-B0-baseline.md` | `135535055abfe2e4b4f3c4c34d207618272b98fe5b5cfefc7b23e70cec483101`（910 行；4,452/4,221/198/1/32） |
| PM 旧共享组件目录（迁移输入，只读） | `角色卡/项目管理/docs/architecture/shared-components.md` | 216 行 / `dd33fdf7805e1ca08c60cf62b804b4f20b6dd7d5c9d4632431706bbaeeca6339` |
| 技能共享目录规则（修订版） | `C:\Users\51054\.claude\skills\ans-governed-construction\references\shared-directories.md` | `80ece2c55d9392c5cdae19afc637c340b7fd7831e5fc18fadf96e8b08d946ea3`（与冻结记录 G4 一致） |
| 既有共享代码（只读核对对象） | `src/common/shared/**` | 见 §3 清单（18 文件，**本轮零变更**） |
| 既有共享测试（单源） | `test/项目管理/shared/**` | 见 §5/§7；路径历史名保留 |

---

## 2. 产出清单

| # | 产出 | 类型 | 行数 | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | `角色卡/shared-code/docs/architecture/shared-components.md` | 共享组件现行目录（唯一） | 212 | `351b0b3b0f23b7882b550d24d17703f5902c01231853ccc7aaa85ee74801c6ea` |
| 2 | `test/项目管理/shared/intent-entry-contract.test.ts` | 共享专属单测（新增） | 323 | `d4e3343833cc055f4c97db5c2eb2edd92a5a95dade1bcaecd004017133304408` |
| 3 | `角色卡/shared-code/api-spec.md` | public API 实现报告 | 55 | `cacbbdf0c70c4f3da7ba71f149f16e04eda38573e636795623e911df63dc7c1c` |
| 4 | `角色卡/shared-code/memo.md` | 工作备忘录 | 36 | `b662c4cdf640faebb99f744b6233e6321a8f59427f6cb219468c8a24e662850d` |
| 5 | `角色卡/shared-code/docs/change/2026-11-07_E1_shared-catalog-and-maintenance-evidence.md` | 本证据 | 见落盘报告 | 见落盘报告 |
| 6 | 原始日志（本目录 `2026-11-07_E1_shared-catalog-and-maintenance-evidence/`） | 测试/typecheck/写集扫描原始输出 | 见 §7/§8/§9 | 见 §7/§8/§9 |

**迁移输入未被修改**：PM 旧目录未改动（只读输入）；其删除由项目管理按团队计划 §6.4 在 E1 迁移窗口执行（**不在 shared-code 写集**）。

---

## 3. 共享组件目录核对：11 组件 / 18 源文件（E0 §4.2 对照）

### 3.1 组件清单与源文件 hash（`src/common/shared/**`，本轮零变更）

| # | 组件 | 源文件（相对 `src/common/shared/`） | SHA-256 |
| --- | --- | --- | --- |
| 1 | `config-loader` | `config-loader.ts` | `c59873fd7604f822bb43629b8408fab3ce67e092602ad5add0734b9f0a1bbddb` |
| 2 | `path-primitives` | `path-primitives.ts` | `fbf5cae00728dfacf6ac157bb846c75b1c401d6ddf90b7cb2556280a34bfded5` |
| 3 | `runtime-shared` | `runtime-shared.ts` | `2e01eaa0d137c2e0bd84d0befdbc995d14a81d444f47225ae206d4c155167799` |
| 4 | `argv-primitives` | `argv-primitives.ts` | `ce98c6afb482f80b2d49a96df5ff2d039f2f2b28e59d97e647b22028e61dd024` |
| 5 | `env-file` | `env-file.ts` | `52f7d23921fa24715851f27e099ce13b79db8cfcee290c709ce42133774281b2` |
| 6 | `atomic-write` | `atomic-write.ts` | `1791c134b7a2f0b52df7962646c4eaf3d6d444b8483f1fc7b77dc4d29253b3cd` |
| 7 | `diagnostics` | `diagnostics.ts` | `098d7b1b652382657b7b2a95c23e09ee8510d1d60e0b7a7814adfafebf7df4b9` |
| 8 | `runtime-settings` | `runtime-settings.ts` | `ccf38f0a04b96f86bab5a7109d33a138476832c4cd94f3d750bdf064f71b1175` |
| 9 | `i18n` | `i18n/index.ts` | `7378e0f0ec169c43ef5d92b913ba847c0c4e7d996acedd9c29df9ab716b7f1c3` |
| 9 | `i18n` | `i18n/locales.ts` | `9ba32802d696faeb7fa6550e11ebf5bcaf147a0e8eeff6b0653324f34f28494f` |
| 9 | `i18n` | `i18n/types.ts` | `3535d3f24eb935bdff319072edb47da8824abbb62240dee81f25b52554175afb` |
| 9 | `i18n` | `i18n/keys.ts` | `a2651622d1b0df7522e4beeac98be71f54a399d6ce388859693602ec5fa26cbf` |
| 9 | `i18n` | `i18n/translate.ts` | `3765e14c446c5097e5eaa2d804254470c8a526d8d57b636a33883203d20a4314` |
| 9 | `i18n` | `i18n/format.ts` | `543609a467b017813cb21422c484f635498f020216cf9718fc7845aae8aee069` |
| 9 | `i18n` | `i18n/messages/zh-CN.ts` | `72cf3b15e49e433aac94ea7e924fea4e3d0ca7326094bef744a5c87bef8510b1` |
| 9 | `i18n` | `i18n/messages/en-US.ts` | `b20dd58bd4eed16cf05143c58a27351da825bc1d4395d18ea0591e01371f94e8` |
| 10 | `jsonl-ledger` | `jsonl-ledger.ts` | `b07c8e975e8a7affc6da36953077426806fd5e889bb5f08846ac89da6d6c5322` |
| 11 | `intent-entry-contract` | `intent-entry-contract.ts` | `73478f2ec47cacace72f7a48127fea577ebfa8ceef924d3860da6fd97beb20e8` |

- 组件数：**11**（含 `i18n/` 目录为 1 项）；源文件数：**18**。
- **清单聚合（算法见 §10）**：`fc9bd0cae52d273f3a5085b8061761aa1fec2d8a7c0e8577e0c0f5b19374a329`。
- 与 E0 §4.2 默认清单逐项一致：**无缺失、无未登记组件、无新增 public entry、无伞状 `index.ts`**（E0 Q1）。
- `src/common/shared/**` 相对 HEAD **无 diff**（`git status --porcelain` 无该目录条目；见 §9）。

### 3.2 契约对照与差异说明（非阻断）

| 核对项 | 结论 | 说明 |
| --- | --- | --- |
| 组件存在性 | 一致 | 11/11 与 §4.2 表逐项对应 |
| public entry | 一致 | 现有导出覆盖 §4.2「主要 public entry」；另有同文件内既有导出（常量/类型），均为既有导出、非本轮新增 |
| 消费者（§4.2 表 vs 实测） | 基本一致；1 项偏旧 | `intent-entry-contract` 的 §4.2 文字为「门禁/Service/角色模块」；**实测消费者**为编排（`governance-judge-intent.ts`/`governance-judge-evidence.ts`）、门禁引擎（`governance-roles.ts`）、Pipeline（`run-role.ts`）、桌面窗口（`session.ts`）。六角色模块为 E1 greenfield，本单元核对时仍在并行建设中（未收敛）；无 Service 直连。该项属契约描述的历史口径，**不构成组件缺失或 API 变更**，按现行目录 §2.11 如实登记 |
| 测试覆盖 | E1 补齐缺口 | 11 组件中 10 项已有专属测试；`intent-entry-contract` 此前只有消费方间接覆盖 → E1 新增专属单测（22 例） |
| 测试路径 | 一致 | 单源 `test/项目管理/shared/`（历史名保留；E0 Q12/团队计划 §6.2） |

---

## 4. 共享变更清单（E1 本单元）

| 类别 | 变更 | 兼容性 | 消费者影响 | 测试 |
| --- | --- | --- | --- | --- |
| 共享实现 | **无**（`src/common/shared/**` 零 diff） | — | 无证据失效 | 既有测试全通过 |
| 共享 public API | **无新增/变更/删除** | — | — | — |
| 共享测试 | 新增 `intent-entry-contract.test.ts`（22 例） | 不改变生产行为 | 无 | 22/22 pass |
| 共享组件目录 | 自 PM 旧目录迁建为 shared-code 现行唯一目录（11 项 + 8 模块 owner/public entry + 消费者观察） | 目录迁移不改运行行为 | 其他角色改链接引用新路径（团队计划 §6.4 后续） | — |
| 编排公开只读入口 | **未触碰** `src/common/编排/handback.ts`、`workflow-preconditions.ts`（E0 §4.3/Q6） | — | — | — |
| 引擎→shared 行为迁移 | **未做**（E2 另议；本轮不迁移） | — | — | — |

**新增共享 public entry 评估（E0 §4.2 允许、§4.4 评审前置）**：截至本证据，**无**角色/门控/引擎 owner 提交共享 API 变更提案；六角色模块的纯策略需求由 `src/model/role.ts` 契约类型 + 既有 shared public entry（如 `MessageKey`、`runtime-shared`、`path-primitives`）覆盖。**不预先扩张 API**，故无新增导出、无接口评审记录。

---

## 5. 接口评审记录

- **本单元：无共享 API 变更 ⇒ 无接口评审记录**（E0 §4.4 第 1 步的提案前置条件未发生；「无记录不得新增」要求未被触发）。
- 后续若有提案：评审记录写入 `角色卡/shared-code/docs/change/`，内容须含语义/兼容性/消费者影响/测试/迁移回滚；并更新现行目录与冻结记录。

---

## 6. 共享测试目录清单（`test/项目管理/shared/`，14 文件）

| 文件 | 用途 | SHA-256 |
| --- | --- | --- |
| `argv-primitives.test.ts` | 组件 4 单测 | `6c1f60354032905ec4f6ee5f7502eaf4fcc60e5f9ff3c76d9552d59bba72e827` |
| `atomic-write.test.ts` | 组件 6 单测 | `38e7146112ed5b4ea5cea8babab4329d3812780eaccb33499fd5acbc48e5685c` |
| `config-loader.test.ts` | 组件 1 单测 | `20d00f95930ee54a0577889bf8d5c3c9ccf51902c6627436ed577cefe0acc092` |
| `diagnostics.test.ts` | 组件 7 单测 | `cebc51aac201c3250377b95d6231a6792bb05cc8bf36efd5226b7769d913b522` |
| `env-file.test.ts` | 组件 5 单测 | `278e19a3878a38593f752f4af80f00f8654dd23a5e32bb46b0ab3e980f81b823` |
| `i18n.test.ts` | 组件 9 单测 | `f3137a4f0982aa960c6f1b17efec36b0aaf7a89dd5f44ee14d022491d8d1d4d8` |
| `i18n-guard.test.ts` | 组件 9 硬编码守卫 | `91e8d14323628e9a8d16721f6b059258eb6e6aa312fe8b1d1e16125ca7c6c7b6` |
| `i18n-guard-scanner.ts` | 守卫夹具（扫描器） | `502fe5b4c828b8c76da0d0f1ff94083886f9931eeb56250ebe789a59cf8f8956` |
| `i18n-guard-allowlist.ts` | 守卫夹具（allowlist） | `3c231e8c937e9a82a618dd6a8b94d11e3db2b99654ce34497ec024b7d569de97` |
| `intent-entry-contract.test.ts` | 组件 11 单测（**E1 新增**） | `d4e3343833cc055f4c97db5c2eb2edd92a5a95dade1bcaecd004017133304408` |
| `jsonl-ledger.test.ts` | 组件 10 单测 | `0c0b3962180f9384a16f1d590aee0d0a55654402fb995bb993da6683f616b1a3` |
| `path-primitives.test.ts` | 组件 2 单测 | `ec982d41f38c1c7ea0b0a72f9ec6f2893f3f5034e0e16cc19db79ab1692011c3` |
| `runtime-settings.test.ts` | 组件 8 单测 | `134536e8fe6da4d8b6e8c23dd446083ab4a402e2da0a1d9da3ebbeb9e40ed9b9` |
| `runtime-shared.test.ts` | 组件 3 单测 | `ce44fcb9469dd8a33c4a4870389316707516ca9685dd9084aecd3a11338a0ee8` |

---

## 7. 测试证据（共享测试单源）

- 原始日志：[`test-shared.log`](2026-11-07_E1_shared-catalog-and-maintenance-evidence/test-shared.log)（218 行 / `80405c407025c3f0b46b27c31702d7770d5ba88abe196856352187ab8d944697`）
- 命令：`node --test "test/项目管理/shared/**/*.test.ts"`；cwd = 检出根；Node `v24.22.1`；npm `11.19.1`；OS `win32 / MINGW64_NT-10.0-26300`。
- 终态运行：start `2026-11-07T09:11:05Z` → end `2026-11-07T09:11:11Z`；**exit 0**；**199 tests / 194 pass / 0 fail / 0 cancelled / 5 skipped / 0 todo**（duration 5,041 ms）。
- 基线（本轮改动前同命令，同检出/同 Node/OS；基线运行的精确起止时间未单独记录）：**177 tests / 172 pass / 0 fail / 5 skipped**。差异：**+22 tests / +22 pass**，全部来自新增 `intent-entry-contract.test.ts`；**0 新失败、0 新 skip**。
- 跳过 5 项：`atomic-write.test.ts` 内 Windows 平台按设计跳过的用例（既有基线行为，非本次新增）。

逐文件（终态）：

| 文件 | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- |
| `argv-primitives.test.ts` | 12 | 12 | 0 | 0 |
| `atomic-write.test.ts` | 22 | 17 | 0 | 5 |
| `config-loader.test.ts` | 24 | 24 | 0 | 0 |
| `diagnostics.test.ts` | 10 | 10 | 0 | 0 |
| `env-file.test.ts` | 31 | 31 | 0 | 0 |
| `i18n.test.ts` | 13 | 13 | 0 | 0 |
| `i18n-guard.test.ts` | 6 | 6 | 0 | 0 |
| `intent-entry-contract.test.ts`（新增） | 22 | 22 | 0 | 0 |
| `jsonl-ledger.test.ts` | 16 | 16 | 0 | 0 |
| `path-primitives.test.ts` | 21 | 21 | 0 | 0 |
| `runtime-settings.test.ts` | 14 | 14 | 0 | 0 |
| `runtime-shared.test.ts` | 8 | 8 | 0 | 0 |
| **合计** | **199** | **194** | **0** | **5** |

---

## 8. typecheck 证据

- **基线**（本单元改动前，工作树尚无并行 E1 模块目录时）：`npm run typecheck` **exit 0**。
- **终态全项目**：原始日志 [`typecheck-full.log`](2026-11-07_E1_shared-catalog-and-maintenance-evidence/typecheck-full.log)（11 行 / `2e4ebe9e1b653425cb834b0b403d3583433aed02d435bcf6588d42baa33131d5`）。start `09:11:15Z` → end `09:11:17Z`；**exit 1**；唯一错误：
  - `test/gates/module-graph.test.ts(98,14): error TS2339: Property 'isTypeOnly' does not exist on type 'ImportClause'.`
- **错误归属**：`test/gates/` 为 `gates-code` 并行 E1 新目录（worktree 未跟踪，本单元未写入）；**shared-code 写集内错误为 0**（`src/common/shared/**`、`test/项目管理/shared/**` 无 error TS）。
- **并行漂移披露**：本工作树同时承载其他 E1 角色的未跟踪模块文件，全项目 typecheck 在数分钟内出现不同错误归属（先前快照：`src/common/roles/verifier/**` 5 条、`test/roles/convener/**` 2 条，均由并行角色随后修改消失/变化）。故全项目 typecheck **不作为本单元独立通过证据**；按 B1 §2.2「不补造、不冒充」，如实记录漂移。
- **本单元定向 typecheck**：原始日志 [`typecheck-targeted.log`](2026-11-07_E1_shared-catalog-and-maintenance-evidence/typecheck-targeted.log)（5 行 / `be5f2d43a012ded5b5ce4541dd93d03b62f9402f0dadbc46c6871a324bbaf912`）。命令：`npx tsc --ignoreConfig --noEmit …（与 tsconfig 相同的编译选项）test/项目管理/shared/intent-entry-contract.test.ts`；start `09:11:24Z` → end `09:11:26Z`；**exit 0**（含其依赖闭包：`src/common/shared/intent-entry-contract.ts`、`src/model/runtime.ts` 等）。
- 结论：**新增测试文件与共享依赖闭包类型通过**；全项目 typecheck 的失败均来自并行 E1 角色的未跟踪文件，**不属本写集**。E1 终验由统筹在并行模块收敛后重跑全项目 typecheck。

---

## 9. 写集扫描

- 白名单（`角色卡/shared-code/boundary.yaml` Section 1）：`src/common/shared/`、`test/项目管理/shared/`、`角色卡/shared-code/**`（含单文件 `docs/architecture/shared-components.md` 及 `docs/change/`）。
- 原始快照：[`write-set-scan.txt`](2026-11-07_E1_shared-catalog-and-maintenance-evidence/write-set-scan.txt)（191 行 / `62b34a2112d8f4118b438de0be2cf1f5eee3a9ef71e8ee8e3dddbe154b769d6c`；`git -c core.quotepath=false status --porcelain`，captured `2026-11-07T09:11:26Z`）。
- 本单元写集命中（全部在白名单内）：
  1. `?? test/项目管理/shared/intent-entry-contract.test.ts`（新增测试）
  2. `?? 角色卡/shared-code/`（本角色目录：H1 卡/边界/YAML/changelog 为既有未跟踪文件；本轮新增 `docs/architecture/shared-components.md`、`api-spec.md`、`memo.md`、`docs/change/`）
  3. `src/common/shared/`：**无条目**（零改动）
- **越界写入：0**。快照共 189 条状态行（另有 2 行头部元数据），其中本单元命中 2 条；其余 **187 条**均为任务开始前已存在或由并行 E1 角色/既有 checkpoint 产生（`docs/*`、其他 `角色卡/*`、`src/model|provider|pipeline|service|common/门禁引擎|装配|pi-adapter`、`test/roles|gates|编排|…`、worktree 根 `.commit-msg-*.txt`）。本单元未创建/修改这些路径（本单元工具写操作仅 §2 列出的文件）。
- 明确未触碰：`src/common/编排/handback.ts`、`workflow-preconditions.ts`（E0 §4.3）、`src/model/**`、`src/common/gates/**`、`src/common/roles/**`、其他角色资料、`docs/scheduling|acceptance|communication|planning`、旧引擎与依赖/构建配置。

---

## 10. 候选聚合

**算法（可复算）**：① 文件清单按 POSIX 相对路径 `LC_ALL=C` 排序；② 每行构造 `<文件 SHA-256>  <POSIX 相对路径>\n`（两个空格）；③ 对全部行拼接字节取 SHA-256。逐文件 SHA-256 用原字节（`sha256sum`）。

| 聚合 | 范围 | 文件数 | 聚合 SHA-256 |
| --- | --- | --- | --- |
| AGG1 共享资产基线清单 | `src/common/shared/**`（18 文件，本轮零变更；§3.1 逐项 hash） | 18 | `fc9bd0cae52d273f3a5085b8061761aa1fec2d8a7c0e8577e0c0f5b19374a329` |
| AGG2 E1 变更集（不含本证据） | `test/项目管理/shared/intent-entry-contract.test.ts` + `角色卡/shared-code/docs/architecture/shared-components.md` + `角色卡/shared-code/api-spec.md` + `角色卡/shared-code/memo.md` | 4 | `f722521bb753862bb9e2c22a05b72b0806561edad774cf00e6f7a33056fa82f2` |

AGG2 明细（排序后）：

```
d4e3343833cc055f4c97db5c2eb2edd92a5a95dade1bcaecd004017133304408  test/项目管理/shared/intent-entry-contract.test.ts
cacbbdf0c70c4f3da7ba71f149f16e04eda38573e636795623e911df63dc7c1c  角色卡/shared-code/api-spec.md
351b0b3b0f23b7882b550d24d17703f5902c01231853ccc7aaa85ee74801c6ea  角色卡/shared-code/docs/architecture/shared-components.md
b662c4cdf640faebb99f744b6233e6321a8f59427f6cb219468c8a24e662850d  角色卡/shared-code/memo.md
```

> 本证据文件与原始日志不进入 AGG2（避免自引用）；其 hash 见文首声明与 §2/§7/§8/§9。

---

## 11. 遗留与移交（非阻断）

| # | 事项 | owner / 去向 | 说明 |
| --- | --- | --- | --- |
| 1 | PM 旧共享组件目录删除 `角色卡/项目管理/docs/architecture/shared-components.md` | 项目管理（团队计划 §6.4） | **不在 shared-code 写集**；删除前冻结只读；删除后本目录为唯一现行 |
| 2 | `feature-map.md` / `functional-description.md` 未建立 | shared-code（下轮） | 角色卡要求首轮建立；本轮任务交付未列 |
| 3 | 共享组件文件头历史 owner 注释（“项目管理”） | shared-code（后续纯文档维护） | 现行 owner 已为 shared-code；本目录 §5.6 已披露；不改行为 |
| 4 | `i18n/keys.ts` 直连（type-only） | 运行时核心 / 桌面UI | 现行目录 §5.2；宜统一经 `i18n/index.ts` |
| 5 | 渲染层本地 `RuntimeKind` 子集 | 桌面UI | 现行目录 §5.3；新增 runtime 须同步 |
| 6 | `versioned-doc-guard.ts` 私有原子写（无瞬时重试） | 门禁引擎 | 现行目录 §5.4；候选收敛，未在本轮迁移 |
| 7 | `role-log.ts` 私有 JSONL 轮转 | 编排 | 现行目录 §5.5；语义含保留天数，收敛需接口评审 |
| 8 | 全项目 typecheck 受并行 E1 模块影响 | 统筹/各角色 | §8；E1 终验在并行模块收敛后重跑 |
| 9 | `intent-entry-contract` §4.2 消费者描述偏旧 | 策划（如需修契约文字） | §3.2；非 API 变更，现行目录已如实登记 |

---

## 12. 出口自检（本角色）

| 检查项 | 结果 |
| --- | --- |
| 写集扫描（越界 0） | 通过（§9） |
| 共享测试计数（`test/项目管理/shared/**`） | 199 tests / 194 pass / 0 fail / 5 skipped（§7） |
| 共享实现零变更（E1 非重写） | 通过（§3.1/§4） |
| 未改 `src/common/编排/` 两文件 | 通过（§4/§9） |
| 未做引擎→shared 行为迁移 | 通过（§4） |
| 未新增 public entry（无记录不得新增） | 通过（§4/§5） |
| 组件目录 11 项 + 8 模块 owner/public entry 关系 | 通过（现行目录 §1/§3） |
| 目录/证据文件 hash 与行数 | 见 §2/§10 |
| typecheck | 定向通过；全项目受并行 E1 影响见 §8 |
| 不提交/推送/合并/发布；不运行真实模型 | 遵守 |
| 不判验收 | 遵守（B2 判） |
