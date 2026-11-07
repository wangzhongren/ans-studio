# 派发与状态记录：运行时派发门与角色模块化（H1 核对 / B0 / P1 / E0）

- **任务 ID**：`2026-11-07-runtime-gate-role-modularization`
- **记录角色**：ANS 统筹调度（Scheduler，独立固定上下文）
- **日期**：2026-11-07
- **性质**：统筹的派发/核对记录，不是 `task_ops` 机器状态，不是验收结论；不授权提交/推送/合并/发布。
- **依据**：团队计划 `docs/scheduling/2026-11-07_team-plan_runtime-gate-role-modularization.md`（687 行 / 82241 bytes / `00e1f76b6a527a1237ac1467bb4100805750606904ce6960bb56a013a4ba565c`）；闸门留痕 `docs/communication/2026-11-07_gate-confirmation_team-plan.md`（`b788072e8553a708a2891bffde8e9a65d08fea4bf2242b2582a61ab1675c48f0`）；B1 标准 `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md`（273 行 / 38456 bytes / `a999dc1961c9ebe4727f0796d6baefd24a23e75b1a6cc1d215a9c0e2f63b4999`）。

---

## 一、H1 交付核对（统筹独立核对，2026-11-07）

### 1.1 结论：**H1 通过；无阻断项；4 项披露已按既有口径处理（无需额外动作）**

| 核对项 | 结果 | 证据 |
| --- | --- | --- |
| 8 个新角色目录/角色卡/边界/YAML/changelog | 存在：`chief-code`、`product-code`、`rapporteur-code`、`nominator-code`、`convener-code`、`verifier-code`、`shared-code`、`gates-code`（各 `role-card.md`+`boundary.md`+`boundary.yaml`+`changelog.md`；工作文档由各角色首轮工作建立） | `ls 角色卡/*-code`；HR memo `角色卡/招募/memo.md` 2026-11-07 条 |
| md/yaml 一致性（8 新角色） | **8/8 一致**（逐行解析 path 集合比较，归一化尾斜杠后 0 差异） | 统筹独立脚本核对 |
| 写集重叠 | **新角色之间 0 重叠、与活跃现有角色 0 重叠**；扫描仅命中冻结归档 `桌面应用`（yaml-only，整目录 `app`/`test/桌面应用`）与 `桌面窗口`/`桌面UI` 的既有重叠——归档不活跃、无写入面，非本变更引入 | 统筹独立扫描（24 个角色目录） |
| B-9（PM 移交/收窄） | 落地：PM `boundary.md`/`boundary.yaml` 已移除 `src/common/shared/`、`test/项目管理/shared/`，注记移交与 E1 迁移窗口删旧副本；`shared-code` 边界取得两目录 + 单文件 `角色卡/shared-code/docs/architecture/shared-components.md` | `角色卡/项目管理/boundary.md:13,21`、`boundary.yaml` 注记；`角色卡/shared-code/boundary.md:7-9` |
| B-10（门禁引擎收窄） | 落地：role-card 注明 `governance-roles.ts` 门面化、E0 扩展 `src/model/role.ts`；Section 1 未动 | `git diff -- 角色卡/门禁引擎/role-card.md` |
| B-11（编排收窄） | 落地：role-card 注明角色策略外移、P1 D-minimal、E2 改调门控、`handback.ts`/`workflow-preconditions.ts` 稳定公开只读入口；Section 1 未动 | `git diff -- 角色卡/编排/role-card.md` |
| B-12（技能参考修订） | 落地：`references/shared-directories.md` 49 行 / `80ece2c55d9392c5cdae19afc637c340b7fd7831e5fc18fadf96e8b08d946ea3`（修订前 `4e43e615…`）；新增 `common/roles/<id>/`、`common/gates/` 根与 `Model ← shared ← {roles, gates} ← engines`；留痕：HR memo + 各角色 changelog + 本计划 §6.3 | 统筹实测 hash |
| 闸门留痕 | `docs/communication/2026-11-07_gate-confirmation_team-plan.md`（31 行 / `b788072e…`）覆盖 P1.6（`24150207…`）、复核（`59b2c81c…`）、团队计划（`00e1f76b…`）与 8 角色 | 实测 hash 一致 |

### 1.2 人事披露项处理

1. **英文 roleId**（目录名即 roleId）：按团队计划 §4.1 建议，**接受**；`listProject` 枚举出全部 8 个新角色。
2. **共享组件目录单文件授权**：`shared-code` 边界 md/yaml 已含该单文件；文件本身在 E1 由该角色建立（当前不存在，符合计划 §6.4 迁移窗口）。
3. **既有 md/yaml 漂移**（本变更未引入）：`产品`/`桌面应用` 仅 yaml；`编排` md 有 `init.ts`、yaml 有 `pm-reviewer.ts`；`项目管理` yaml 多 `docs/audit`；`shell-arming.ts` 用途文字两侧不同。**均不在本变更写集**，按计划「不顺手改」保持现状；后续任何节点若需写这些路径，先停止回报。
4. **招募目录 `listProject` warning**（`角色卡/招募` 缺 role-card.md）：按技能默认路径产生的**预期提示**，`招募` 不是角色，不得为其建卡；**非阻断**。

---

## 二、B0 基线（测试角色；已完成）

- 证据：`角色卡/测试/docs/change/2026-11-07_runtime-gate-role-modularization-B0-baseline.md`（910 行 / `135535055abfe2e4b4f3c4c34d207618272b98fe5b5cfefc7b23e70cec483101`）+ 同名证据目录（67 文件，原始日志/探针/失败逐条清单/索引）。
- HEAD `e71501c…`（tree `6840d1cb…`），分支 `feat/plan-escalation-card`；工作树含 T1 未提交差异（只读）与未跟踪管理文件。
- 受影响套件（串行）：runtime-core 482/445/33/0/4；claude-adapter 116/116/0/0/0；codex-adapter 119/118/0/0/1；pi-adapter（排除 `write-sequencing.test.ts`）352/349/2/0/1；编排 1,017/991/24/0/2；测试（排除 1 个挂起）651/593/39/1/18。
- 全量：464 文件 4,444 tests/4,213 pass/198 fail/1 cancelled/32 skip（674.1s，`--test-force-exit` 批量 + 受影响套件 plain 交叉核对一致）；installed-mcp 隔离 8/8；**合计 4,452/4,221/198/1/32**；6 个挂起文件（write-sequencing 历史 + 5 个本次新发现，其中 `customer-authorization-plane-integration` 等属 checkpoint 在途实现）。
- **统筹决定（登记为「冻结脏基线」）**：P1/E1/E2/E3 的对照规则 = **相对 B0 冻结失败名单（198 fail + 1 cancelled + 6 挂起，逐条）**：
  1. 新增确定性失败必须为 0、新 skip 必须为 0；
  2. 既有失败集合变化（数量/名单/行为）必须逐条说明；
  3. 挂起文件按 B0 登记排除或单独运行并记录，**不得以 force-exit/timeout 冒充自然通过**（B1 §2.2）；
  4. **本变更不修 checkpoint 的既有失败**（不属本变更写集）；若需绿色基线，另立变更。
- **风险（须沟通/验收协调，见 §六）**：B1 E3.1 只显式写了「Windows 既有环境失败按 B0 基线分类」，未覆盖 B0 的 checkpoint 系统性失败与挂起文件；建议独立验收出 **B1 v1.1 增补**（不改验证实质，只补「冻结脏基线分类/挂起处理」口径），在 E3 前完成。

---

## 三、P1 派发与完成状态（全部 `implemented-unverified`，未判验收）

| 节点 | 角色 | 状态 | 主要产物/证据 | 关键计数 |
| --- | --- | --- | --- | --- |
| P1-A | 运行时核心 | 完成 | `src/model/runtime.ts`、`src/service/runtime/session.ts`、`test/runtime-core/application-mediation.test.ts`；证据 `角色卡/运行时核心/docs/change/2026-11-07_P1-A_application-mediation-contract-evidence.md`（311 行 / `6bf1a9d2fe09552e4fa976a2d2fa2eb9e9d830733ee2006f1f5f7a083db595e4`，含 §12 Amendment-1） | runtime-core 482/445/33/4 → 490/453/33/4；新增失败 0；typecheck 0 |
| P1-A Amendment-1 | 运行时核心 | 完成（接口增补） | `applicationMediation.nativeInstanceId`（必填）补齐 P1.6 §4.4 字面谓词所需字段；同一证据文档 §12 | +1 test/+1 pass；失败集/ skip 集哈希不变 |
| P1-B Claude | Claude适配器 | 完成 | `src/provider/claude/session.ts`（+36/−1）、`test/claude-adapter/application-tool-surface.test.ts`（6 例）；证据 108 行 / `b2cbef7e8347146229f1bfdf2f3a029394ac735b0c032b1e7bb611d1586a4970` | claude-adapter 116/116 → 122/122 exit 0；T1 三文件未动；typecheck 0 |
| P1-B Codex | Codex适配器 | 完成 | `src/common/codex-adapter/chat-transport.ts`（+24/−1）、`test/codex-adapter/application-surface.test.ts`（4 例）；证据 175 行 / `023a096ef79a6f2c8b9ee01f2d2a36e3fcc3517f5a0a9d18477f80ee6d98ca05` | 119/118/0/0/1 → 123/122/0/0/1 exit 0；`inspectNativeToolSurface` 未改 |
| P1-B Pi | Pi适配器 | 完成 | `src/common/pi-adapter/real-adapter.ts`（+59）、`test/pi-adapter/application-surface.test.ts`（5 例）；证据 150 行 / `a1694be8732a4eac95360d1f9ddb8f7aceba9689ab31707636e0b76a6e6fe9be` | 352/349/2/0/1 → 357/354/2/0/1（2 项既有 EPERM）；typecheck 0 |
| P1-C | 编排 | 完成 | `src/pipeline/orchestration/trunk-runtime.ts`（D-minimal 单实现 `evaluateChiefDispatchParent`）、`test/编排/trunk-dispatch-parent.test.ts`（19 例）等；证据 443 行 / `73c3cbb1e17b0dc3204d45b85473ecb85c1273d37b5e40d1052c2f65bf3d149a` | 编排 1,017/991/24/0/2 → 1,037/1,011/24/0/2；差分 182 场景/364 比较/56 预期差异/0 非预期；typecheck 0 |
| P1-C Amendment-1 | 编排 | 完成（字面化） | Codex 绑定改为 `native.nativeInstanceId === applicationMediation.nativeInstanceId`（保留附加防御，不放宽）；同一证据文档 Amendment-1 节 | 测试 19/19；失败/skip 集哈希不变 |
| P1-D | 测试 | 完成 | 新增 `test/测试/runtime-dispatch-gate-integration.test.ts`（10 用例，10/10）；证据 `角色卡/测试/docs/change/2026-11-07_P1-D_combined-candidate-verification.md`（293 行 / `91e5cbe7451534f8df3a921643a538a0c0168b489bb014c0ae8470826177caf1`） | 六套件对照 B0：**新增确定性失败 0、新 skip 0**；typecheck 0；`build:renderer` N/A（`app/` 0 改动） |

- **P1 候选身份（12 文件，P1-A/B/C 实现 + 测试）聚合**：`sha256(排序 "<sha256>  <path>")` = `f1d0d017f057dde5d75a4c83b11206526227b2f07646062d686eb4830e2a1bdb`（逐文件哈希见 P1-D 证据 §4）；另含 P1-D 集成测试 `test/测试/runtime-dispatch-gate-integration.test.ts`（`ede01d45…`）。
- **候选范围裁定（P1-D 披露项）**：当前 `src/app/test` 共 18 项改动 = P1 候选 12 + P1-D 集成测试 1 + T1 三文件 3（只读、不属本变更）+ E0 并发草稿 2（`src/model/role.ts`、`test/门禁引擎/role-module-contract.test.ts`）。**裁定**：E0 两文件作为 E0 阶段输入，不计入 P1 候选；P1-RR/E3 引用候选时按上述集合明示；B1 §2.1「无写集外改动」按**阶段候选集合**判定，不把并发 E0/T1 文件计入 P1。

---

## 四、E0 状态（门禁引擎部分完成；策划文档待沟通启动；冻结未完成）

- **门禁引擎 E0 草案（完成）**：`src/model/role.ts` 加法 `BuiltInRoleId`/`BuiltInRoleModule`/`RolePolicyDecision`/`RoleCardSpec`/`GovernanceCapabilities`（公开投影）/`GovernanceRoleSpec`/`TrustedToolPolicyInput`/`RoleToolPolicy`/`RoleDispatchPolicy*`/`RoleGovernedAction`/`RolePreflight*`/`RoleContext*`（+208/−1，纯类型）；`test/门禁引擎/role-module-contract.test.ts`（337 行）；证据 `角色卡/门禁引擎/docs/change/2026-11-07_E0_role-module-contract-types-evidence.md`（182 行 / `35f4bbfb83bcf52c1ced8ecea69648673cbf2e473f221ca454e8f2ba7408b68b`）。门禁引擎套件 405/399/5/0/1 → 412/406/5/0/1（新增失败 0）；typecheck 0。
- **标注**：`pending reconciliation with planning contract doc`——策划 E0 契约文档 `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` **尚未出现**（开工/收工两次检查均无）。
- **流程口径**：按技能角色规则，**策划（内置管理角色）由沟通启动**，统筹不启动内置管理角色。**请沟通启动策划上下文撰写 E0 契约文档**（8 模块 public API/输入输出/错误码/依赖方向/写集/owner/消费者/版本；与门禁引擎草案逐项对齐；六项契约确认内容不变）。
- **E0 冻结记录**（统筹写 `docs/scheduling/`）待：策划文档到位 → 门禁引擎对齐 → 评审（运行时核心/编排/门禁引擎/三适配器/测试/独立验收可判性）→ 由统筹记录路径/版本/sha256/评审人/消费者清单/测试证据。
- **E0 其他输入已就绪**：行为/测试基线 = B0 文档 + 22 条差分 fixture 清单；写集/owner = H1 卡片与边界；六项契约确认 = `docs/communication/memo.md` 2026-11-07 条。

---

## 五、P1-RR（真实 Claude 最小重跑）状态

- **前置已满足**：P1-D 在合并候选上确定性全绿（相对冻结脏基线 0 新增失败）。
- **未执行**：等待真实运行组织与环境决定（真实 Claude 凭据、dogfood 隔离目录/临时 userData、桌面应用驱动）。计划 §8.3 口径：单条客户消息、单 chief 回合、最多 1 次 `dispatch_task`、无自动重试、墙钟上限 10 分钟、失败即中止保留证据；只承诺「派发受理」，后续门如实报告。
- **建议**：由沟通按既有 dogfood/CDP 流程驱动，或由沟通明确授权测试角色按同流程执行；统筹负责记录与变更包，不自行操作真实运行。

---

## 六、等待条件、风险与需协调事项

| # | 事项 | 状态/建议 |
| --- | --- | --- |
| 1 | B1 E3.1 与冻结脏基线的口径衔接 | **需独立验收出 B1 v1.1 增补**（E3 前）：显式登记「冻结脏基线」分类与 6 个挂起文件处理；不改验证实质。由沟通转独立验收 |
| 2 | E0 策划契约文档 | **需沟通启动策划上下文**（统筹不启动内置管理角色）；文档到位后门禁引擎对齐、E0 评审、统筹冻结记录 |
| 3 | P1-RR 组织 | 需沟通决定执行方式（见 §五） |
| 4 | Pi legacy `wrapSession` 未转发可选方法 | 生产路径不受影响（`createPiRuntimeAdapter` 直接返回真实会话）；legacy 面若需事实，由源码属主按接口评审补转出；已记录在 Pi 证据 |
| 5 | Pi `ANS_PI_SERVER_TOOLS`（web_search/web_fetch）不在冻结事实字段内 | 当前不使事实 unknown（MCP 白名单已精确枚举）；若门控要求启用 server tools 即 fail-closed，需 E0 契约决定；不得由适配器自行发明字段 |
| 6 | `start_background_task` 无真实运行证据 | 按 P1.6/B1 L4：只按代码/桩件覆盖，不声称真实运行已验证 |
| 7 | checkpoint 既有 198 fail + 1 cancelled + 6 挂起 | 冻结脏基线登记；本变更不修；如需要绿色基线另立变更 |
| 8 | E0/ P1 并发文件与候选范围 | P1-D 已披露；P1-RR/E3 按 §三候选集合引用；E0 收敛后重取受影响证据（契约变化则重跑） |
| 9 | WebSearch / Codex 外来 MCP / 下游写门 | 客户可见限制（B1 L1–L6）不变；P1 未放宽 |

---

## 七、下一步（顺序）

1. 沟通：启动策划 E0 契约文档；决定 P1-RR 执行；转独立验收出 B1 v1.1 增补（事项 1）。
2. 门禁引擎：待策划文档到位后对齐契约类型（接口评审：运行时核心/编排/三适配器/测试/独立验收），更新证据。
3. 统筹：组织 E0 评审、写冻结记录（`docs/scheduling/`），出口 = B1 E0.1–E0.9 可判。
4. E0 冻结后：按 H1 角色卡派发 E1（shared-code、gates-code、六 `*-code` 并行；写集见角色卡与团队计划 §4.4/§7.4）。
5. P1-RR 后：如实记录派发受理与下一门；进入 E2 前置（E1 产出 + 等价证据）。

---

## 八、本轮纪律与边界

- 统筹只写 `docs/scheduling/`；未实施产品代码、未改测试/角色卡/边界/方案/沟通/验收；未判验收；未提交/推送/合并/发布。
- 各 worker 节点均由独立固定角色上下文执行，证据已归档到各自角色 `docs/change/`；不伪造、不转述为通过。
- 派发记录为当前事实；如与后续证据冲突，以原始证据与独立验收结论为准并更新本记录。

---

## 九、后续进展（2026-11-07 追加）

### 9.1 B1 v1.1（冻结脏基线增补）

- `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.1.md`（137 行 / 17749 bytes / `e5027742d4ae36b5f71a090d7ceb956ae3046f06da6d9f4252cf60153776e867`）；v1（`a999dc19…`）保持冻结；v1.1 仅补充 E3.1 的冻结脏基线分类与 6 个挂起文件处理；E3 时按 v1.1 执行并引用其 hash。

### 9.2 P1-RR（真实 Claude 最小重跑）——已执行（沟通授权测试角色）

- 证据文档：`角色卡/测试/docs/change/2026-11-07_P1-RR_real-claude-minimal-dispatch-evidence.md`（213 行 / `c47198f79572b2ab834d28fa44d5b756c6c9fa21a040d4bb5341fa16a204c06e`）；证据根（仓库外）`C:\Users\51054\Desktop\work\ans-dogfood-runtime-gate-2026-11-07\rr-p1\evidence\`。
- **结果：父门受理 PASS**（旧 `trunk-verify-failed` 未再出现）；**任务创建成功**（`task.created` `t-mw659tgv-974915bb`，chief→product，`flowId=todo-cli`，run draft；初始化来源 `70a6795e…`）；**投递失败于下游门**：目标 product 会话创建被拒 `runtime-creation-admission-unproven:required-scope-unconfined-script-tools,native-factory-plan-unavailable`（任务 `status=failed`，未入队/未投递；不宣称闭环）。
- 预算：1 条客户消息/1 chief 回合/应用处理器层 `dispatch_task` 恰 1 次/观察 42.5s/启动→退出约 70s；真实 UI `#btn-halt` 中止 + `stopSession` + CDP close，无残留进程。偏差：模型侧同回合有 2 次 `mcp__ans__dispatch_task` tool_use（首次因字段名错误被 MCP 输入校验 `-32602` 拒绝，未进入应用处理器、无 `.ans` 副作用），已如实登记。
- 候选：P1 12 文件聚合 `f1d0d017…` 运行前后一致；`src/app/test` 运行前后 18 行 diff 为空（T1 三文件 + E0 两文件为并发输入，非本候选）。
- 纳入：`docs/scheduling/2026-11-07_change-package_runtime-dispatch-gate.md`（P1 变更包）。

### 9.3 E0 契约文档与评审

- **E0.1 契约文档**：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（574 行 / 43032 bytes / `3830fe636849a89e5f604546420cffc0e78f862ab1e345cf4904b91ae1ed04b9`）。
- **评审记录**：`docs/scheduling/2026-11-07_review_E0-contract_runtime-gate-role-module.md`——参与方：运行时核心（无 blocking，4 项文档澄清）、编排（**2 项 blocking：Q5 闭集不完整；Q3 dispatch 范围**）、门禁引擎（D1–D8 落地：D1/D3/D4/D5 已落，D2 类型+零复制 lookup（完整 map 待 E1/E2），D6–D8 注释；Q5 缺口 8+1 已报）、Pi适配器（P-1/P-2/P-3 落地；42 文件 361/358/2/0/1，typecheck 0）、Claude适配器（无 blocking）、Codex适配器（无 blocking）。
- **E0 未冻结**：需策划出 **E0.2** 修订 5 项（R-1 Q5 RoleToolId 闭集、R-2 Q3 dispatch 范围、R-3 §5.1 import 路径错误、R-4 reason 触发文字、R-5 锚点漂移）；门禁引擎按 E0.2 对齐；独立验收可判性待沟通安排。冻结记录（`2026-11-07_contract-freeze_runtime-gate-role-module.md`）待修订关闭后写。
- **E1**：等待 E0 冻结；派发顺序/写集不变（shared-code、gates-code、六 `*-code` 并行）。

### 9.4 新增/更新的统筹记录

- `docs/scheduling/2026-11-07_change-package_runtime-dispatch-gate.md`（P1 变更包：候选身份、节点证据、P1-RR 结果、冻结脏基线口径）。
- `docs/scheduling/2026-11-07_review_E0-contract_runtime-gate-role-module.md`（E0 评审：参与方结论、R-1～R-5 blocking 修订清单、Q1–Q12 处置建议、E0 出口状态）。

### 9.5 E0 冻结完成（E0.2 → E0.3 → D1 → 可判性 → 冻结记录）

- **E0.2**（681 行 / 53674 bytes / `798ce9ce0d23cfd0fcc73c021d0510e517e9a34d6a22c45907605a442550b3fc`）：处置 R-1（RoleToolId 14 id+映射+允许集）、R-2（dispatch 仅硬身份/存在性）、R-3/R-4/R-5；新增 D9/D10。
- **E0.3**（685 行 / 54561 bytes / `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`）：纯文本修正（版本文字、Q3/Q13 编号、锚点 7/7→8/8），语义等价，取代 E0.2。
- **独立验收 E0 可判性确认**：`docs/acceptance/2026-11-07_E0-judgeability_runtime-gate-role-module.md`（136 行 / 22528 bytes / `94c8b0d92aec2f09e1a797069eb8c8dc7f867b4bf4b8da27945941dc35f85327`）——E0.2 契约可判性**通过**；当时冻结条件未满足（G1 D1 未落地、G2/G3 文本、G4–G6 记录项）。
- **D1 落地（门禁引擎）**：`src/model/role.ts` 409 行 / `d5e550a0…`（14 id + `RoleToolName`）；`src/common/门禁引擎/role-tool-registry.ts` 157 行 / `9aca72a5…`（唯一 `ROLE_TOOL_CATALOG` + `validateRoleToolDeclaration` 未知/越权 fail-closed）；契约测试 595 行 / `bb0904c9…`（14/14）；证据 399 行 / `b640733a…`；门禁套件 419/413/5/0/1（新增失败 0）、typecheck 0。D2 接受 `builtInRoleModuleDataOf` 零复制 lookup；D9/D10 已写入注释/测试。
- **冻结记录**：`docs/scheduling/2026-11-07_contract-freeze_runtime-gate-role-module.md`（**91 行 / 12706 bytes / `5439d7c35deb984862ea41204551d1f498c665e9b6f5ab84939db8104b551a07`**）——覆盖 G1–G6、E0.3/E0.2 映射、B1 v1.1 `e5027742…`、`shared-directories.md` `4e43e615…`→`80ece2c5…`、D1 后置哈希、D9/D10、provider/runtime 归属、handback public entry/测试来源、逐模块版本声明、Q1–Q13 处置、冻结后变更流程。
- **E0 已冻结；E1 可在沟通启动后派发**（shared-code、gates-code、六 `*-code` 并行；上岗前只读接收冻结契约；旧引擎在 E2 前为权威）。

### 9.6 E1 派发与完成（八角色并行 greenfield）

沟通于 E0 冻结后正式放行 E1。八角色均已上岗并交付（implemented-unverified；未提交/推送；未跑真实模型）：

| 角色 | 交付 | 关键计数 | 证据（路径 / 行数 / SHA-256） |
| --- | --- | --- | --- |
| chief-code | `src/common/roles/chief/`（index+9 internal）+ `test/roles/chief/`（3 文件） | 41/41；差分 13/13 零差异 + 4 项列明；typecheck 0；候选聚合 `56f8c7e9…` | `角色卡/chief-code/docs/change/2026-11-07_E1_chief-module-evidence.md`（127 行 / `0a42a8c2970d2acaf7b72dd84d717495f7ec29fce782ae5931de354e6e68ea1a`） |
| product-code | `src/common/roles/product/`（index+6 internal）+ `test/roles/product/`（3 文件） | 29/29；差分零差异 + 5 项列明；typecheck 0；候选聚合 `9a6fcef3…` | `角色卡/product-code/docs/change/2026-11-07_E1_product-module-evidence.md`（125 行 / `b70dc51cf9c1ffff709498f364e27ba9581ef2abeb14fb7d10ee2bc3988aaf4e`） |
| rapporteur-code | `src/common/roles/rapporteur/`（index+6 internal）+ `test/roles/rapporteur/`（8 文件） | 67/67；差分 42 项零差异 + 6 项列明；typecheck 0 | `角色卡/rapporteur-code/docs/change/2026-11-07_E1_rapporteur-module-evidence.md`（149 行 / `0c655ff96024b45a6f42710e88c98f8de357d9cc953071303ca3a455fa177faa`） |
| nominator-code | `src/common/roles/nominator/index.ts` + `test/roles/nominator/`（3 文件） | 22/22；差分零差异 + 2 项列明；全仓 tsc 0；候选聚合 `4c7b5528…` | `角色卡/nominator-code/docs/change/2026-11-07_E1_nominator-module-evidence.md`（138 行 / `b62a78b442f90acfccba344fabf9f784dbb120199e1b0afcaaec0d95ea27644e`） |
| convener-code | `src/common/roles/convener/index.ts` + `test/roles/convener/`（2 文件） | 30/30；差分零差异 + 6 项更严列明；typecheck 0；候选聚合 `07ada1a5…` | `角色卡/convener-code/docs/change/2026-11-07_E1_convener-module-evidence.md`（143 行 / `394d56132ab4e887576257086888c06ec5bdbadef9ae2133ce726ef1a2912a99`） |
| verifier-code | `src/common/roles/verifier/index.ts` + `test/roles/verifier/`（3 文件） | 23/23；差分零差异 + 4 项列明；scoped tsc 0 | `角色卡/verifier-code/docs/change/2026-11-07_E1_verifier-module-evidence.md`（112 行 / `b37a51bc1398de1da4e3059fd37b005c15fba3e7fa712799e1ef725e8e187832`） |
| gates-code | `src/common/gates/index.ts`（253 行）；`test/gates/`（5 文件） | 29/29；与 P1 D-minimal 差分 134 场景/268 比较/**0 差异**；module-graph 331 文件/1,735 边/**0 违例/0 value 环**（1 type-only 环按 D9 豁免）；typecheck 0；候选聚合 `999f3b45…` | `角色卡/gates-code/docs/change/2026-11-07_E1_gates-module-evidence.md`（257 行 / `74e80c95e6cb76fa1d98d6839c41768ca14bb609a247d3e36b9d2ee7637b159f`） |
| shared-code | 新建 `角色卡/shared-code/docs/architecture/shared-components.md`（212 行 / `351b0b3b…`，11 组件/18 源文件）；共享实现 **0 变更**；新增共享测试 `test/项目管理/shared/intent-entry-contract.test.ts`（+22 例） | 共享套件 199/194/0/5（0 新失败/0 新 skip）；写集内 tsc 0；候选 AGG2 `f722521b…` | `角色卡/shared-code/docs/change/2026-11-07_E1_shared-catalog-and-maintenance-evidence.md`（233 行 / `583f2b40e3f721f898f747cf556c935db0a24471c85dca00c67bfa8da6a6fbed`） |
| 项目管理（移交收尾，计划 §6.4 第 3 步） | 等价核对通过后**删除旧目录副本** `角色卡/项目管理/docs/architecture/shared-components.md`（删除前 216 行 / `dd33fdf7…`）；新目录未改 | 共享测试复核 199/194/0/5；旧文件 ABSENT | `角色卡/项目管理/docs/change/2026-11-07_E1_shared-catalog-handover-evidence.md`（196 行 / `8268214db3ae0032a9124a5a4178c2623e9ecedfa31543dda3e13949a5aea076`） |

**E1 出口自检（统筹在最终合并树实测）**：
- `npm run typecheck` **exit 0**。
- 六角色模块 + 门控测试合计 **241 tests / 241 pass / 0 fail / 0 skip**（`node --test --test-concurrency=1 "test/roles/*/**/*.test.ts" "test/gates/**/*.test.ts"`）。
- 共享套件 **199/194/0/5**（既有 skip 同 B0 口径）。
- 模块根：六个 `src/common/roles/<id>/` 均只有 `index.ts`（+`internal/`）；`src/common/gates/` 只有 `index.ts`；无散放文件。
- 旧引擎冻结：`git status` 对 `run-role.ts`/`apply-journal.ts`/`provider/runtime/`/`src/common/编排/`/桌面主进程 **无改动**；仅 P1/E0 既有文件显示预期修改。
- E1 候选聚合：`src/common/roles/**` + `src/common/gates/**` + `test/roles/**` + `test/gates/**` 共 **55 文件**，聚合 `sha256(排序 "<sha256>  <path>")` = **`4f30ec665053b8d60070909db6fc4ddd19d0402ca525a0a67af71593a2c5ad54`**（逐角色聚合见上表；后续 E2 引用按最终候选重算）。
- 模块图（gates-code，最终树快照）：0 违例、0 value 环、type-only 环 1（`role.ts↔runtime.ts`，D9 豁免）。

**E1 剩余问题（交 E2 处置，不阻断 E1 出口）**：
1. 各模块均有**已列明的更严/边界差异**（如 `targetExists` 缺省 fail-closed、来源角色范围、事实键严格性等），E2 接线前须经接口评审（逐角色 api-spec/证据已登记）。
2. `role.*` i18n messageKey 尚未登记共享 i18n（shared-code/i18n owner），E2 用户可见呈现前登记。
3. E2 未做：`governance-roles.ts` 门面装配 `BuiltInRoleModuleMap`、`run-role.ts`/`apply-journal.ts`/桌面消费者切换、`trunk-runtime.ts` 改调 gates 模块 + 双跑/回滚/删除内联实现；E2 逐单元执行。
4. E0.3 §4.2 对 `intent-entry-contract` 的消费者文字陈旧（编排/门禁/Pipeline/桌面）；shared-code 目录已如实登记，属策划文档非阻断观察。
5. E3 全量 T3 未跑（按 B1 v1.1 在 E3 执行）；E1 阶段证据为模块/门控/共享套件 + typecheck。
6. 全部实现 `implemented-unverified`：未判验收；未提交/推送/合并/发布。

## 十、E2 逐单元切换（全部完成，2026-11-07）

E2 接口评审与处置：`docs/scheduling/2026-11-07_review_E2-interface_runtime-gate-role-module.md`（四项只读评估：编排 `bdd8f482…`、门禁引擎 `9732baec…`、shared-code i18n `f4b6ae0c…`、测试检查单 `ffa763fe…`）；三项前置模块修复（nominator D-1 `184ba882…`、chief C-1 `a81249df…`、verifier P5 `5a8de287…`）。

| 单元 | 结果 | 单元候选聚合 | 出口复核 |
| --- | --- | --- | --- |
| X-G 门控 | 切换 `trunk-runtime` → gates；删除内联/本地类型/开关/shim | 10 文件 `f0dcf20c…` | `510f2a57…` |
| X-R1 product | 门面 + run-role 工具/卡种 + VCA direct 前置；运行时核心/桌面零改动 | 7 文件 `649e3ca0…` | `b5b2dcda…` |
| X-R2 rapporteur | 门面 + run-role/VCA/run-change/工具层 requirement-change；桌面零改动 | 12 文件 `9e650ad9…` | `1cab5d34…` |
| X-R3 nominator | 门面 + D3/角色文档前置 + 工具/卡种；运行时核心/桌面零改动 | 8 文件 `6c62fe5c…` | `0e4d7cef…` |
| X-R4 convener | 门面 + 工具/谓词/team-plan/stable-write/dispatch 来源模块 + 双消费点收敛；桌面零改动 | 16 文件 `891c92d5…` | `8df8212d…` |
| X-R5 verifier | 门面 + 空工具声明/卡种 + review 前置；运行时核心/桌面零改动 | 13 文件 `47f6b074…` | `ea8c8785…` |
| X-R6 chief | 门面 + 完整 map/删除 D2 投影/矩阵收口 + chief 工具/hub 接线；运行时核心/桌面零改动 | 12 文件 `9ed75ffa…` | `3c95a1f8…` |

- **状态**：7 单元全部 completed-unverified；旧实现已删除；逐单元差分/三态回滚/删除清单/受影响套件/typecheck 证据齐备（切换日志 `docs/scheduling/2026-11-07_switch-log_runtime-gate-role-modularization.md`；E2 变更包累积 `docs/scheduling/2026-11-07_change-package_runtime-gate-role-modularization.md`）。
- **E2 期间全部单元对照 B0（冻结脏基线）新增确定性失败 0、新 skip 0**；typecheck 各单元 0。
- **E2 遗留（E3 处置）**：完整 T3 全量回归（B1 v1.1 冻结脏基线口径）、D1–D9/E-A10 扫描、最终变更包、B2 独立验收；`BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE`、`TRIO_CARD_KINDS.product` 残留、桌面 hub 目标数据化/version-decision preflight（接口评审项）列「待确认」。
- **E3 就绪**：P1-RR（真实重跑）已完成并早于大规模切换（E-A7 满足）；E2 全部单元完成；可按 B1 v1.1 启动 E3 终验与 B2。

## 十一、E3 终验（完成，2026-11-08）

1. **候选冻结**：97 文件（20 M + 77 ??；45 src + 52 test）；聚合 `7bbff9bd1fa12090590d1bc3a42b70effaa86b42b08ff124ed5ff17924d12a95`；树 `a93fbcd8…`；`src app test` manifest `5cbdbb94…`（1,066 文件）；T1 三文件只读基线未改；冻结后无源码改动（E3 修复均在冻结前：rapporteur `7842311f…`、门禁 `ca3b370a…`）。
2. **T3 全量**（B1 v1.1 口径，510 文件，逐文件自然 EXIT，6 登记挂起隔离 90s 不计通过）：权威运行 C 503 自然完成 + 6 挂起 + 1 非登记 watchdog（`interactive-execution-mode`，隔离复跑 natural pass）；**4,872/4,641/198 fail/1 cancelled/32 skip**；B0 子集 4,471/4,240/198/1/32；新增 39 测试文件 401/401 pass；**新增确定性失败 0、新 skip 0**；新增 4 条非确定性运行期现象与既有消失 5 条已逐条披露（不宣称单次全绿）。typecheck/typecheck:renderer/build:renderer 均 exit 0。
3. **扫描/检查**（冻结候选）：模块图 0 违例/0 value 环（1 type-only Model 环 D9 豁免）；范围内未使用导出 **0**；重复实现 0；结构残留 0（待确认 3+2 项）；门禁负例 122/121/1（唯一失败 B0 既有）；D1–D9/E-A10 扫描/证据面通过。
4. **最终变更包**：`docs/scheduling/2026-11-07_change-package_runtime-gate-role-modularization.md`（E3 最终版；候选/路径/证据/删除清单/披露/验收输入）。
5. **状态**：E3 证据包齐备，交独立验收 B2；未提交/推送/合并/发布。证据：T3 `角色卡/测试/docs/change/2026-11-07_E3-T3-full-regression.md`（`d0d67ff4…`——B2 后文字订正版；原 `76872622…`）；扫描/检查 `角色卡/测试/docs/change/2026-11-08_E3-scans-and-checks.md`（`73175db7…`）。
6. **B2 结论（2026-11-08）**：**pass（通过，附明确限制）**——报告 `docs/acceptance/2026-11-08_runtime-gate-role-modularization-report-v1.md`（237 行 / 33574 bytes / `8bbeb459…`）；E0 9/9、P1–P7 7/7、N 28/28、RR 3/3（RR2 真实 Pi N/A）、E1 7/7、E2 7 pass + E2.7 N/A、E3 12/12、E-A 10/10、D1–D9 9/9；无 fail/insufficient/阻断返工。放行记录见 `docs/scheduling/2026-11-08_status-e3_runtime-gate-role-modularization.md`。
