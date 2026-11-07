# E0 契约冻结记录：运行时门控与角色模块

- **任务 ID**：`2026-11-07-runtime-gate-role-modularization`
- **记录角色**：ANS 统筹调度（Scheduler，独立固定上下文）
- **日期**：2026-11-07
- **状态**：**E0 契约冻结（冻结生效于本记录写盘）**；E1 可在沟通启动后按团队计划派发。本记录不是验收结论（B2）、不授权提交/推送/合并/发布。

## 一、冻结对象与版本映射

| 项 | 值 |
| --- | --- |
| **冻结契约（E0.3）** | `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` **685 行 / 54561 bytes / SHA-256 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`**（E0.3 = E0.2 的纯文本修正：版本文字、Q3/Q13 编号、§8 锚点 7/7→8/8；语义等价） |
| **E0.2（已被 E0.3 取代；可判性判定对象）** | 681 行 / 53674 bytes / `798ce9ce0d23cfd0fcc73c021d0510e517e9a34d6a22c45907605a442550b3fc`——独立验收已按此确认 E0 可判性（见下） |
| E0.1（历史） | 574 行 / 43032 bytes / `3830fe636849a89e5f604546420cffc0e78f862ab1e345cf4904b91ae1ed04b9`；其旧 §5.1/§5.3 文字**不得再引用**（R-3/R-4 已修正） |
| 评审记录（E0.1 评审） | `docs/scheduling/2026-11-07_review_E0-contract_runtime-gate-role-module.md` 71 行 / 12303 bytes / `6905f391b42c95a1cc94bd367fdb4ae23a080e8151cdf21f01e37363337a13f6` |
| 独立验收 E0 可判性确认 | `docs/acceptance/2026-11-07_E0-judgeability_runtime-gate-role-module.md` 136 行 / 22528 bytes / `94c8b0d92aec2f09e1a797069eb8c8dc7f867b4bf4b8da27945941dc35f85327`——结论：E0.2 契约**可判性通过**；当时 E0 冻结条件未满足（G1–G6），本记录关闭 G1–G6 |
| 验收标准 | B1 v1 `a999dc1961c9ebe4727f0796d6baefd24a23e75b1a6cc1d215a9c0e2f63b4999`（273 行）+ **B1 v1.1 `e5027742d4ae36b5f71a090d7ceb956ae3046f06da6d9f4252cf60153776e867`**（137 行；仅补 E3.1 冻结脏基线/挂起口径） |
| 方案/复核/团队计划 | P1.6 `24150207…`；复核 `59b2c81c…`；团队计划 `00e1f76b…` |

## 二、冻结条件关闭（G1–G6）

| 条件 | 状态 | 关闭证据 |
| --- | --- | --- |
| **G1 D1 代码/测试落地（阻断）** | **已关闭** | 门禁引擎按 E0.2/E0.3 §3.1/§10.2 D1 落地：`src/model/role.ts` **409 行 / `d5e550a06514b8a61fc66b517a267343ba95d8aa29050eb6ee3c7b7f9b5f8780`**（`RoleToolId` 14 id + `RoleToolName` 14 snake_case）；唯一来源私有纯模块 `src/common/门禁引擎/role-tool-registry.ts` **157 行 / `9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b`**（`ROLE_TOOL_CATALOG` 14 项 id→name→allowedRoleIds，单一来源；`validateRoleToolDeclaration` 未知/越权/重复 ⇒ 整单 deny、tools:[]、reasons 逐项，不注入不静默）；`src/common/门禁引擎/governance-roles.ts` **794 行 / `fddda111cb1ea76614f632f931441d45e534e4f9f23297193615fbdf525cd16e`**（D2 保留 `builtInRoleModuleDataOf` 零复制 lookup）；契约测试 `test/门禁引擎/role-module-contract.test.ts` **595 行 / `bb0904c90a8dc070d9a8fe4b53031f123c3136aefea0a4e284a164cce6d9d9f1`**（14/14 pass；原断言未删未放宽）；证据 `角色卡/门禁引擎/docs/change/2026-11-07_E0_role-module-contract-types-evidence.md` **399 行 / `b640733ada0f3ae0f86272fdf6f3439b1d23eb78d3f435cf90c31549d47ffeac`**（含 §12 E0.2 对齐）。门禁引擎套件 413/407/5/0/1 → **419/413/5/0/1**（新增确定性失败 0、新 skip 0、既有 5 红逐条不变）；`npm run typecheck` exit 0 |
| **G2 E0.2 陈旧版本文字** | **已关闭** | E0.3 修正 §8/§12 版本文字（E0.1→E0.3）；本记录引用 E0.3 `067e3d2e…` 并映射已判 E0.2 `798ce9ce…` |
| **G3 Q3 编号/语义冲突** | **已关闭** | E0.3 统一编号：**Q3 = dispatch 范围（R-2，硬身份/存在性）**；动作事实键改为 **Q13**（默认 api-spec 登记 + 测试，§3.4）；§11.1 处置表与 §11 问题表一致 |
| **G4 冻结记录要素（shared-directories / B1 v1.1 / 后置证据）** | **已关闭** | 本记录 §一/§二/§四显式引用：`shared-directories.md` 修订 **`4e43e615930a6f7da220c68ee563205ec6836a360b18fffb190e9ab4566fd049` → `80ece2c55d9392c5cdae19afc637c340b7fd7831e5fc18fadf96e8b08d946ea3`**（当前技能文件已复算；修订前 hash 按 H1/人事 memo 记录）；B1 v1.1 `e5027742…`；D1 后置契约测试 **14/14** 与证据 hash 见 G1 |
| **G5 D9/D10/共享与工具排除/逐模块版本** | **已关闭** | D9 无环扫描口径已写入契约 §10.2 D9 与 `role.ts` 注释、契约测试（读源码断言仅 `import type` 互引、无 value import；扫描脚本属 E1 gates-code）；D10 capabilities 单一真源已声明（模块 spec 为唯一真源、`tools()` 输出为派生；类型/运行时断言；E1 接口评审前置）；`provider/runtime/{schema,tools}.ts` **明确留运行时核心、不迁 shared**；handback/workflow-preconditions 既有 public entry 与测试来源本记录 §三补列；**逐模块版本声明：E0.3 契约版本适用于全部 8 模块**（`BuiltInRoleModule`/shared/gates 类型均为 E0.3 冻结口径；E1 模块实现版本随各自 `api-spec.md` 记录，不改变契约版本） |
| **G6 E0.1 旧文字引用纪律** | **已关闭** | 本记录与后续 E1/E2 一律引用 E0.3（映射 E0.2）；E0.1 `3830fe63…` 仅作历史，不再引用其 §5.1/§5.3 文字 |

## 三、评审参与方与结论

| 参与方 | 结论 | 证据 |
| --- | --- | --- |
| 运行时核心 | 无 blocking；4 项文档澄清（import 路径、type-only 环口径、资源根细节、措辞）均已在 E0.2/E0.3/本记录处置 | 评估文档 `ff9c9d0b…`；评审记录 §一 |
| 编排 | 2 项 blocking（Q5 闭集、Q3 dispatch 范围）经 R-1/R-2 关闭；reason 触发文字按 R-4 精确化；Q6 所有权确认 | 评估文档 `3b181122…`；评审记录 §二 |
| 门禁引擎 | D1–D10 落地/记录（D1/D3/D4/D5/D9/D10 已落，D2 零复制 lookup，D6–D8 迁移注记）；Q5 14 项与 E0.3 §3.1 逐项一致 | 证据 `b640733a…` |
| Pi适配器 | P-1/P-2/P-3 落地（server tools 启用即无应用面事实；wrapSession 条件转发；4 新例；Pi 套件 361/358/2/0/1；typecheck 0） | `角色卡/Pi适配器/docs/change/2026-11-07_E0_pi-server-tools-and-wrap-session-evidence.md` 141 行 / `66d80254…` |
| Claude适配器 | 无 blocking；无写集/无变更 | 评估文档 `2bef486e…` |
| Codex适配器 | 无 blocking；无写集/无变更；严格路径逐字保留 | 评估文档 `320939d8…` |
| 测试 | B0 基线 + 22 fixture 清单为 E0.8 输入；P1-D 六套件对照通过 | B0 `13553505…`；P1-D `91e5cbe7…` |
| 独立验收 | **E0 可判性通过**（E0.2）；G1–G6 已于本记录关闭 | `94c8b0d9…` |

**编排公开只读入口（G5 补列）**：
- `src/common/编排/handback.ts`：`isDispatchableRoleId(project, roleId)`（`:456`；测试来源 `test/编排/handback.test.ts`）；
- `src/common/编排/workflow-preconditions.ts`：`evaluateDispatchAuthorization`（`:1530`）、`evaluateDispatchPreflight`（`:1576`）、`reportTargetForTaskCreator`（`:1596`）（测试来源 `test/编排/workflow-preconditions.test.ts`、`test/桌面应用/rejection-copy.test.ts`）；
- 两文件保持编排唯一 writer + 稳定公开只读入口，默认不迁移；消费者清单见评审记录/编排评估 §4（无第二实现/复制；打包与证据副本在 E3 扫描单列）。

## 四、冻结资产哈希清单

| 资产 | 行数/字节 | SHA-256 |
| --- | --- | --- |
| E0.3 契约（冻结） | 685 / 54561 | `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3` |
| E0.2 契约（可判性对象，被取代） | 681 / 53674 | `798ce9ce0d23cfd0fcc73c021d0510e517e9a34d6a22c45907605a442550b3fc` |
| E0.1 契约（历史） | 574 / 43032 | `3830fe636849a89e5f604546420cffc0e78f862ab1e345cf4904b91ae1ed04b9` |
| 评审记录 | 71 / 12303 | `6905f391b42c95a1cc94bd367fdb4ae23a080e8151cdf21f01e37363337a13f6` |
| E0 可判性确认 | 136 / 22528 | `94c8b0d92aec2f09e1a797069eb8c8dc7f867b4bf4b8da27945941dc35f85327` |
| B1 v1 | 273 / 38456 | `a999dc1961c9ebe4727f0796d6baefd24a23e75b1a6cc1d215a9c0e2f63b4999` |
| B1 v1.1 | 137 / 17749 | `e5027742d4ae36b5f71a090d7ceb956ae3046f06da6d9f4252cf60153776e867` |
| `src/model/role.ts`（D1） | 409 | `d5e550a06514b8a61fc66b517a267343ba95d8aa29050eb6ee3c7b7f9b5f8780` |
| `src/common/门禁引擎/role-tool-registry.ts`（D1） | 157 | `9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b` |
| `src/common/门禁引擎/governance-roles.ts`（D2） | 794 | `fddda111cb1ea76614f632f931441d45e534e4f9f23297193615fbdf525cd16e` |
| `test/门禁引擎/role-module-contract.test.ts`（D1，14/14） | 595 | `bb0904c90a8dc070d9a8fe4b53031f123c3136aefea0a4e284a164cce6d9d9f1` |
| 门禁 E0 证据 | 399 | `b640733ada0f3ae0f86272fdf6f3439b1d23eb78d3f435cf90c31549d47ffeac` |
| Pi E0 证据 | 141 | `66d80254308aa9110a33a949e56a4eb85cab364163c8eebb48ba9f910ea3142f` |
| `shared-directories.md` 修订前→后 | — | `4e43e615930a6f7da220c68ee563205ec6836a360b18fffb190e9ab4566fd049` → `80ece2c55d9392c5cdae19afc637c340b7fd7831e5fc18fadf96e8b08d946ea3` |

## 五、Q1–Q13 处置（冻结口径）

Q1 per-component public entry（无伞状 index）；**Q2** `TrustedToolPolicyInput` 维持最小（仅 `governanceModel`，宿主事实留注入层）；**Q3** `dispatch()` 只做硬身份/存在性（hub/legacy/review/run/module/报告时点留引擎；`reportToRoleId` 仅差分期望）；**Q4** 资源根默认应用资源根、本版不增 `root` 字段（loader/装配规则 E1 接口评审）；**Q5** `RoleToolId` 14 id + `RoleToolName` 映射 + 允许角色表（未知/越权 fail-closed）；**Q6** handback/workflow-preconditions 不迁移（编排稳定公开只读入口）；**Q7** Pi server tools 启用即不提供应用面事实（fail-closed，不新增 Model 字段）；**Q8** wrapSession 转发 `inspectApplicationToolSurface`（其他 native 方法不在本 E0 范围）；**Q9** gates 类型放 `src/common/gates/index.ts`，P1 本地类型 E2 删除/别名；**Q10** `applicationMediation.nativeInstanceId` 必填纳入 gate accepted evidence；**Q11** Codex 外来 MCP fail-closed / WebSearch fail-closed / 写发布门 strict observed 不重开；**Q12** shared-components 迁至 `角色卡/shared-code/docs/architecture/shared-components.md`（E1 单写者）、`test/项目管理/shared/` 历史名保留；**Q13** 动作事实键默认按各角色 `api-spec.md` 登记 + 测试冻结（§3.4）。
（详见 E0.3 §11/§11.1 与评审记录 §三。）

## 六、Delta 落地状态（D1–D10、P-1–P-3）

- **已落地**：D1（14 id + 映射 + 允许集 + fail-closed 校验 + 测试）、D3（details 约束注释）、D4（facts 包规则注释）、D5（资源根注释）、D9（type-only 边口径 + 契约测试源码断言；扫描脚本 E1）、D10（capabilities 单一真源声明 + 类型/运行时断言）；Pi P-1/P-2/P-3。
- **E0 接受为过渡**：D2 完整 `builtInRoleModules` map 在 E1 六模块落地后装配、E2 删除内联规格（E0 使用 `builtInRoleModuleDataOf` 零复制 lookup）。
- **迁移注记（E1/E2）**：D6 类型去重（E2）、D7 gates 输入类型与 P1 本地类型删除/别名（E2）、D8 cards legacy 映射（E2）。

## 七、E1 门禁与冻结后变更

- **E1 可以启动**（沟通启动派发后）：shared-code、gates-code、六 `*-code` 并行；上岗前**只读**接收本冻结契约；旧引擎在 E2 切换前保持权威（E1 差分 oracle）；写集见 H1 卡与团队计划 §4.4/§7.4。
- 冻结后变更：走 E0.3 §4.4 接口评审（共享/门/角色 public entry owner + 受影响消费者；不引入客户卡），更新本冻结记录（版本/哈希/消费者影响/测试证据）与受影响证据。
- 本记录只写 `docs/scheduling/`；未改契约/方案/产品/测试/角色卡/边界；不判验收；不提交/推送/合并/发布。

## 八、披露与限制

1. E0.3 相对 E0.2 为纯文本修正（语义等价）；可判性按 E0.2 判定，本记录做版本映射。
2. `shared-directories.md` 修订前副本未在本地保留，`4e43e615…` 以 H1/人事 memo 为据，修订后文件 `80ece2c5…` 已独立复算。
3. D1 门禁引擎套件仍有 5 条 **既有红**（与 B0 冻结脏基线一致，非本变更新增）；不属 E0 冻结阻断。
4. Pi `ANS_PI_SERVER_TOOLS` 真机派发拒绝未实测（离线桩件）；B1/E2 按桩件+代码判，不得声称真实运行已验证。
5. E0 冻结不表示 B1 E0.1–E0.9 已判 pass（B2 判），也不表示 P1/E1 验收结论；各自按 B1/B2 流程取证。
