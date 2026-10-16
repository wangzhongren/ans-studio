---
id: fix-su-notes-preauth
type: fix
title: su 预授权写目录：docs/su/** 与 docs/contracts/** 预置进初始 writeSet（免确认发行）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [kanban-f4-governance-note-fix, confirmed-writes, run-role, govern-session]
---

# su 预授权写目录（客户裁定 2026-10-16）：`docs/su/**` + `docs/contracts/**` 免确认可写

**状态：已实施 / 待验证**（独立验证与真机复验未进行；未 git 提交）。实施轮（2026-10-16）全部落点在**编排**角色 `boundary.yaml` Section 1 内：`src/pipeline/orchestration/run-role.ts`（主改动）、`src/pipeline/orchestration/govern-session.ts`（两处模型可见文案同步）、`test/编排/session-handle.test.ts`（+5 例）、`test/编排/confirmation-gated.test.ts`（+1 例）。

## 一、客户裁定（原文）

1. 2026-10-16（首次）：**「这个 su 可以写 docs/su 的目录，不需要我审批」**。
2. 2026-10-16（追加，经项目管理转达）：**「还有个契约目录也可以给他写。」**——即 `docs/contracts/**`（跨角色契约落盘目录；该约定在 G-1 本体实施时生效，**本预授权先装好**：写入是否放行仍取决于边界是否覆盖该路径——见 §四）。

裁定语义：su 写自己的工作笔记（`docs/su/memo.md`、`docs/su/changelog.md` 等）与契约目录**不应再逐次经确认卡审批**。这是对既有设计（F-5-main/门禁引擎提案所载「**写盘许可按会话生效**；许可只经 `request_confirmation` 的 preview + `confirmed:true` 发行；重建/重开不自动保留」）的**客户例外**——预授权是**初始集合的一部分**，不属于「经确认发行的写权」，因此**不随会话重建作废**。

## 二、范围（严格钉死）

| 维度 | 限定 |
|---|---|
| 角色 | **仅内置治理角色（su）**——判据用代码现状的既有标记 `setup.role.kind === "built-in-governance"`（与 `suppressHandback`/`dispatchTask` 同一判据；本产品内置治理角色即 su，不另硬编码 id）。其他一切角色**零变化**。 |
| 路径 | **仅 `docs/su/**` 与 `docs/contracts/**`**（项目根相对、含子路径）。`docs/` 其它子路径、`角色卡/`、`.ans/`、`src/` 等一切其余写盘**行为不变**：确认制下未确认 = **F4 照拒**。 |
| 判定链 | **只放开 F4 一环**（把目标路径本身视为已在初始 writeSet 内）。F6 接受门、F7 真实路径逃逸复核、边界条目匹配、条件激活**逐字不变**——不在边界内/未接受/逃逸的路径照拒，**fail-closed 不放松**。 |
| 会话形态 | 确认制动态 writeSet（桌面 su 聊天、CLI `ans govern`）与静态 scope（直调治理引擎的形态）**同口径**；`scope === undefined` 的「不做任务收窄」会话**不新增任何收窄/放宽**（原样 boundary-only）。 |

## 三、实现（最小改动）

### 3.1 主改动：`src/pipeline/orchestration/run-role.ts`

- 新增常量 **`SU_PREAUTHORIZED_WRITE_DIRS = ["docs/su", "docs/contracts"]`**（私有；带完整客户裁定注释与回滚指针）。
- 新增两个私有辅助：
  - `suPreauthorizedRelOf(targetPath, projectRoot)`：目标落在预授权目录树内 → 返回其**项目根相对词法路径**（取值规则与 `resolveWrite` **同源**：绝对路径按项目根取相对、相对路径按项目根解释；纯词法、不触盘——真实路径逃逸始终由 `resolveWrite` 的 F7 独立复核）；否则 `undefined`。`isUnderOrEqual` 按**段**比较（`docs/su2` 不被 `docs/su` 覆盖），大小写口径沿用共享原语（Windows 不敏感）。
  - `scopeWithSuPreauthorization(base, targetPath, projectRoot)`：目标在树内 ⇒ `{ writeSet: [...base.writeSet, rel], conditions: base.conditions }`；否则**原样返回 base**（逐字现状）。
- `openRoleSession` 的 gate 构造处（确认制分支 + 静态 scope 分支）经上述辅助求值；新增导入 `absRel / isAbsoluteAny / isUnderOrEqual / normalizeLexical`（**只读**来自 pm 属主共享模块 `src/common/shared/path-primitives.ts`——工程法案 §一.5 消费方名单已含编排，`confirmed-writes.ts` 已有同源先例；不从门禁引擎私有 `common/` 导入）。

**实现口径（如实登记）**：任务口径为「把 `docs/su/`（含子路径）**预置进初始 writeSet**」。因 F4 的 writeSet 是**精确集合**（`resolveWrite::writeSetContains` 逐字相等；同 `govern-session.ts` 既有注释「放目录不覆盖子路径」的同一结论），目录 token 单独放入会被精确匹配**旁路成空转**。故实现为：**求值时把「目标路径本身」的项目根相对路径并入本次 writeSet**——语义等价于「该路径**初始就在**已发行集中」，且不扩任何判定链其余环节。等价性对照：

| 路径 | 预期 | 依据 |
|---|---|---|
| `docs/su/memo.md`（确认制、零 request_confirmation） | **允许** | 预授权并入 writeSet；issued 恒空 ⇒ 放行只可能来自预授权 |
| `docs/su/notes/2026-10-16.md`（子路径） | **允许** | `isUnderOrEqual` 段式覆盖 |
| `<项目根绝对路径>/docs/su/memo.md` | **允许** | 绝对路径按项目根取相对，与相对写法同口径 |
| `docs/contracts/api-v1.md`、`docs/contracts/sub/deep.md` | **允许** | 第二棵预授权树 |
| `docs/other.md`、`docs/su2/x.md`、`docs/contracts2/x.md` | **F4 拒** | 不在两棵树内（按段比较，非字符串前缀） |
| `角色卡/Y/role-card.md`（创世种子边界内） | **F4 拒** | 不预授权，照旧未确认 = 拒 |
| `src/evil.ts` | **拒（未匹配边界条目）** | 边界本身没变 |
| 非 su 角色 + 边界覆盖 `docs/` | **F4 拒** | 预授权不判角色就不成立 |

### 3.2 会话重建（O-1）覆盖

预授权集合在 **`openRoleSession`（会话初始化处的 gate 求值中）计算**，闭包在 `setup.role` 上——**不写入 `issued`、不经发行器、不落任何状态**。每次开会话/会话重建（桌面 O-1「边界陈旧 ⇒ 作废重建」= 旧句柄作废、**重开一次会话**）都按同口径重新获得：**结构上无法随句柄或重建丢失**（测试第 5 例钉住：重建前后两个句柄的 gate 对 `docs/su/**`、`docs/contracts/**` 均放行，对 `docs/other.md` 均 F4 拒）。

### 3.3 不影响 F-5-opt1 重建提示（保持准确）

`REBUILT_SESSION_WRITE_PERMITS_NOTICE`（「……经确认发行的写权不会自动保留，如需写入请重新经 request_confirmation 确认。」）**逐字未动**——它说的是「**经确认发行**的写权」（`issued` 集）确实不自动保留，这一点未变；预授权不属此类、该提示对预授权不构成错误陈述（保守但安全：su 对预授权路径发确认也不会有机械问题，只是多余）。`session-handle.test.ts` 既有 F-5-opt1 两例未动、全绿。

### 3.4 模型可见文案同步：`src/pipeline/orchestration/govern-session.ts`（两处，各加一短句）

- `runGovernSession` 的确认制说明行：补「（预授权目录 docs/su/、docs/contracts/ 除外——属初始写集、无需确认可直接写；客户裁定 2026-10-16）」。
- `buildGovernPrompt` 的 `confirmRule`：补「（例外：`docs/su/`、`docs/contracts/` 为预授权目录——属初始写集，可直接写、无需确认。）」

理由：F-5-main 先例（模型可见文案必须与实现一致、可操作）；若不补，CLI 治理提示会继续要求 su「写盘前必须先经 request_confirmation」，与预授权矛盾，并诱发客户不想要的确认卡。**su 卡文本（`BUILT_IN_ROLE_CARD_TEXT`，门禁引擎文件）的配套修改由门禁引擎另行实施——本角色不做**（任务书明示）。

## 四、未做 / 依赖（如实）

- **未做**：不改 `resolve-write.ts`（F4 语义、拒绝文案、`issuedByRootOf` 全未动）；不改 `confirmed-writes.ts`（发行器零改动）；不改任何 `app/**`、`src/common/门禁引擎/**`、他角色文件；不加任何「自动弹卡/自动发行」。
- **依赖（预授权不制造权利）**：路径仍须**边界覆盖 + F6 已接受**才可能放行——`docs/contracts/**` 在 G-1 契约目录约定落地前，若某项目的治理边界未覆盖 `docs/`（如自定义边界不含 docs），预授权**不会**为其开路（判「未匹配任何边界条目」，照拒）。这正是「先装好、不越界」的含义。
- **跨角色登记（请 pm 转达）**：① **门禁引擎**——su 卡文本「确认制要点」段需补预授权例外（原 F-5-main 段仍说「把每个路径逐条列入 preview」；对两棵预授权树已不必要）。② **桌面窗口**——无需改动（其 su 会话判据 `role.builtIn` 与编排 `kind === "built-in-governance"` 是同一集合；O-1 重建路径无需任何新调用即获得预授权）。③ **G-1（契约目录约定）**——其本体落地时只需确保治理边界覆盖 `docs/`（现状的种子/治理边界文档均覆盖）。

## 五、测试与证据（实跑，2026-10-16）

**新增 6 例**（全部既有无真实模型/不触网风格；假件/桩适配器）：

- `test/编排/session-handle.test.ts` **+5 例**（gate 级，桩适配器捕获 gate；su 用创世态 project 夹具：`roles:{}`、`builtInRoles:["su"]`、`genesisBootstrap` 在场 ⇒ 种子边界 = 普通目录 `角色卡//docs//.ans/`、已接受）：
  1. **开局免确认**：确认制 su 会话、客户通道**零调用**（未发生任何 `request_confirmation` ⇒ issued 恒空）下，`docs/su/memo.md`、`docs/su/changelog.md`、`docs/su/notes/2026-10-16.md`（子路径）、**绝对路径**、`docs/contracts/api-v1.md`、`docs/contracts/sub/deep.md` 全部 `allowed`。
  2. **严格边界**：`docs/other.md`、`docs/su2/x.md`、`docs/contracts2/x.md`、`角色卡/Y/role-card.md` 均 `allowed:false` 且理由含「不在任务 writeSet 内」（F4）；`src/evil.ts` 拒（未匹配边界——边界本身未动）；空路径拒。
  3. **非 su 无预授权**：角色 X（边界覆盖 `docs/` 目录、确认制会话）对 `docs/su/memo.md`、`docs/contracts/x.md` 均 F4 拒——控住变量（放行只与角色判据有关）。
  4. **静态 scope 同口径**：无 customerInput、scope `{writeSet:["角色卡/A/role-card.md"]}` ⇒ scope 内照常放行；`docs/su/**`、`docs/contracts/**` 并入初始集放行；其余仍 F4 拒。
  5. **重建后再开仍可写**：句柄 1 放行 → dispose → 新开句柄 2 放行（初始集合不随句柄丢失），`docs/other.md` 照旧 F4 拒；全程客户通道零调用。
- `test/编排/confirmation-gated.test.ts` **+1 例**（E2E，走 `governCommand` + 假适配器真实落盘）：脚本**不发** `request_confirmation`——`docs/su/memo.md` 与 `docs/contracts/api-v1.md` **真落盘**、客户通道**零调用**；`docs/其他.md`、`角色卡/Y/role-card.md` 被 F4 拒、**零副作用**（不落盘、`角色卡/` 目录都不得建）。

**既有断言零改动**（未为变绿放松任何断言）：`session-handle.test.ts` 其余 8 例、`confirmation-gated.test.ts` 其余 12 例、`govern.test.ts`/`govern-engine.test.ts`/`finalize.test.ts` 等全部原样通过（静态/确认两分支的其余路径行为逐字未变）。

**命令与真实结果**（Node v24.14.0、Darwin 25.6.0）：

- `node --test "test/编排/"*.test.ts` → **274/274 全绿**（基线 268 + 本批净增 6）。
- `npm run typecheck` → **0 错**（全仓）。
- `node --test "test/**/*.test.ts"`（全量）→ **1503 计 / 1502 过 / 0 红 / 1 skipped**（skip 为既有 Windows 专用用例；本次执行未见历史 2 条基线红，其文件已被并行改动覆盖——与 F-5 实施记录同况）。
- 未 git 提交；未碰真机轮目录（`ans-testbed/kanban-live-3`、`/private/tmp/ans-kanban-dev3-ad1bdf3b` 全程只读未写）；未碰 kanban-live 项目与测试角色证据目录。

## 六、风险与回滚

- **风险 1（语义）**：预授权把「su 对这两棵树」的写权与确认流程**解耦**——这是客户明示的例外，范围有界（两棵树、仅内置治理角色）、判定链其余环节不动。**若未来客户收回**：回滚见下。
- **风险 2（文案联动）**：govern 提示与 su 卡文本需并存一致——本侧两处已补；su 卡文本归门禁引擎（已登记）。
- **风险 3（前缀相似）**：已用**段式**比较防 `docs/su2` 类串线（测试钉住）。
- **回滚**：改动集中在一个文件（`run-role.ts`）+ 两句提示文案（`govern-session.ts`）+ 测试；**移除 gate 分支里的 `suPreauthorized` 求值（改回 `{writeSet:[...issued],conditions}` / `buildGate(...)`）即回到旧行为**——无类型、无契约、无数据/状态迁移；`SU_PREAUTHORIZED_WRITE_DIRS`/两个辅助为纯新增、删除即无残余。

## 七、状态

**已实施 / 待验证**：待独立验证上下文复验与真机复跑（空文件夹 bootstrap → su 直接写 `docs/su/memo.md` 应不弹确认卡且落盘；写 `docs/` 其它路径仍弹卡/未确认被拒）。
