# 澄清记录：只读档（readonlyOnly）不适用例行命令白名单（方案 v1.3）

- 日期：2026-10-31
- 角色：ANS 策划（Planning），独立上下文
- 状态：**客户裁定 A 已记录（2026-10-31）；本澄清生效；不重开闸门 1；不修改方案正文**
- 适用基线：`docs/planning/2026-10-31_design_shell-deny-customer-escalation.md` **v1.3**（857 行，SHA-256 `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`；客户闸门 1 已确认，见 `docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md` 85 行 / SHA-256 `ea3965cd21aa9adcfe3e2efd8055bf7d9ef284668e4a5e6e39299cd0ed8ba33a`）
- 客户裁定记录：同一沟通记录 §「方案空白裁定：只读档与例行白名单（2026-10-31）」（第 80–85 行）
- 风险档位：继承方案 v1.3 的 **T3**；本澄清不单独升档
- 标记约定：**[事实]** 已核实代码/测试；**[裁定]** 客户已决定；**[口径]** 本澄清确定的语义；**[实现约束]** 实施必须满足的最小要求；**[验收]** 对验收的影响

---

## 1. 客户裁定与问题事实

### 1.1 [裁定] 客户原话与选项

沟通就「只读档是否适用例行白名单」给出两个选项后，客户选择 **方案 A（保持严格）**，原话「A」：

> **方案 A——保持严格**。只读档不适用例行白名单：`node --test` 等在只读档仍按 `readonly-deny` 拒绝；既有断言原样保留；实现需在只读档对例行白名单命中加过滤，不改动只读档其余语义（不注入 takeGrant，见方案 §9）。

沟通记录同时定性：属方案 v1.3 的**澄清**——不改变已确认文本对普通模式的适用范围，不重开闸门 1；由策划出澄清记录，沟通留档。

### 1.2 [事实] 触发问题：A2 谓词 + 既有只读断言

| # | 事实 | 证据 |
| --- | --- | --- |
| 1-1 | A2 新增例行命令确定性白名单谓词 `matchRoutineShellCommand(argv)`（覆盖 `npm test`、`npm run test\|typecheck\|lint\|check`、受限 `node --test`、`tsc --noEmit`、`npm ci`）。 | `src/common/门禁引擎/classify-shell.ts:341-365` |
| 1-2 | 分类器在 `classifyShellDetailed` 内、**risky 判断之前**调用该谓词；命中返回 `allow`（`ruleId: allow:routine:<id>`）。 | `src/common/门禁引擎/classify-shell.ts:508-514` |
| 1-3 | 服务公开出口再导出同一谓词（同一函数引用），供编排/委托策略合法消费。 | `src/service/gate/shell-rules.ts:17` |
| 1-4 | 写目标守卫也在脚本分支之前调用同一谓词，命中返回 `pass`。 | `src/common/门禁引擎/shell-write-guard.ts:540` |
| 1-5 | **只读档装配不注入写目标守卫**：`run-role` 的 `assembleReadonlyShellGate` 调用只传 project + `input.shellReadonly`，未传 `writeGuard`/`snapshotBefore`/`approvalContextLoader`。 | `src/pipeline/orchestration/run-role.ts:1351` |
| 1-6 | `ShellGate` 在 `detail.decision === "allow"` 时**先于**只读档分支返回 `c-allow`；只读档分支只在 `review`/`risky`（或 `deny` 之后）到达。 | `src/common/编排/shell-gate.ts:727-733`（c-allow 返回）、`:781-807`（deny/readonly 分支） |
| 1-7 | 因此 A2 之后，只读档对 `node --test` 等**例行白名单命中会直接 c-allow**，不再进入 `readonly-deny`——这是问题根因，不是只读档文案或断言的问题。 | 1-2/1-6；`BRANCH_READONLY_DENY` 定义在 `src/common/编排/shell-gate.ts:208` |
| 1-8 | 既有测试断言 `node --test → readonly-deny`（reason 含 `review`）；另有 `openRoleSession` 只读档用例同样断言 `node --test` 拒绝。A2 后这两处失败。 | `test/编排/shell-readonly.test.ts:350-380`（集成断言 `:376-378`）、`:452-470`（run-role 只读档断言 `:464-465`） |
| 1-9 | 只读档其余语义（现状）：只放行 (c) 白名单（`ls`/`cat`/`git status`/`node --version` 等）；`risky`/`review` → `readonly-deny`；`deny` → `c-deny` 终结；不接 (b)/(a)、不弹任何对话框；审计照常。 | `src/common/编排/shell-gate.ts:791-807`；`test/编排/shell-readonly.test.ts:13-16` |

### 1.3 [事实] 方案 v1.3 的文本边界（为何出现空白）

- §4.2 只读档行（方案第 179 行）只写：只读档不产生 judge 判拒记录、**不得注入/调用 `takeGrant`**；**未写**例行白名单是否适用。
- §9 不变量 2（方案第 625 行）只写：只读档不得注入/调用 `takeGrant`、`readonly-deny`/`script:readonly-deny` 不可申请；**未写**例行白名单是否适用。
- P7（方案第 649 行）写「§5.1 精确形态在**所有角色（含内置治理角色）**→ `c-allow`」——用的是**角色**语言，未提**装配模式**；只读档是旧 su 的**单独装配模式**（`assembleReadonlyShellGate`），不是普通审批模式下的角色类型。
- **结论**：已确认文本对「readonlyOnly × 例行白名单」这一组合**没有明示**；A2 实现按谓词默认行为让只读档也命中，暴露了该空白。客户裁定 A 填的是这个空白，没有改变普通模式（项目角色三层链/advisory、内置角色审批档）的任何行为。

---

## 2. [口径] 澄清后的语义

### 2.1 适用范围

| 装配模式 | 例行白名单是否适用 | 说明 |
| --- | --- | --- |
| 项目角色三层链（含 advisory） | ✅ 适用 | 照方案 v1.3 §5.1/P7：精确形态 `c-allow`（0 卡、0 judge），非命中形态走既有链 |
| 内置治理角色审批档（`operatorOnly` + `approveDeny`） | ✅ 适用 | 同上；`allow` 直放 0 卡，其余逐条审批 |
| **su 只读档（`readonlyOnly`）** | ❌ **不适用** | 本澄清：把例行白名单命中视为**不存在**，按 A2 之前的分类（`review`/`risky`）走既有 `readonly-deny`；**不得 allow** |

### 2.2 只读档的具体判定（[口径]）

- 例行白名单命中在只读档**一律拒绝**，分支为 **`readonly-deny`**（`BRANCH_READONLY_DENY`），不产生 `c-allow`、不执行命令。
- **不得改变既有只读档文案模板**：
  - `node --test`（A2 之前为 `review`）→ `readonly-deny`，reason 仍含 `(c) 判为 review` 与 `su 只读档`；
  - `npm test` / `npm run test|typecheck|lint|check` / `npm ci`（A2 之前为 `risky:pkg-run`）→ `readonly-deny`，reason 按 `risky` 档；
  - `tsc --noEmit`（A2 之前为 `review`，构建工具类）→ `readonly-deny`，reason 按 `review` 档。
  - 既有 reason 模板逐字保留：`su 只读档：本会话仅允许只读白名单命令；该命令未命中白名单（(c) 判为 {tier}），按 su 只读策略拒绝执行——这是策略拒绝，不是环境故障。`
- **其余只读语义不变**：只读白名单（`ls`/`cat`/`git status`/`node --version` 等）照常放行；`rm` 等 `risky`、普通 `review` 照常 `readonly-deny`；`c=deny` 照常终结；不接 (b)/(a)、不弹任何对话框；超时/通道异常 = 拒绝；审计分支/`by` 不变。
- **不得注入/调用 `takeGrant`**：沿用方案 §9 与现有构造期守卫（`shell-gate.ts:487-491`）及调用点跳过；本澄清不改变该约束。
- **普通审批模式不受影响**：P7 的 0 卡/c-allow 行为、白名单形态、判据全部照旧；本澄清只在只读档加一层过滤。

### 2.3 不做什么（防止误解）

- 不把 `node --test` 等从白名单中删除（普通模式仍需要 0 卡）。
- 不放宽或改写 `test/编排/shell-readonly.test.ts` 的既有断言。
- 不改变只读档的允许列表、`c=deny` 终结、无 (b)/(a)、无对话框、审计与 fail-closed 语义。
- 不引入新的权限、白名单类别、卡片或客户确认通道。

---

## 3. 与方案 §4.2/§9/P7 的条款关系（为何是澄清而非变更）

1. **§4.2（第 179 行）**：只读档行的既定义务是「不可申请 + 不得注入/调用 `takeGrant`」。它约束的是**升级授权**边界，并未授权或禁止例行白名单；本澄清不改变该行任何文字。
2. **§9 不变量 2（第 625 行）**：只读档不得被授权越过、`readonly-deny`/`script:readonly-deny` 不可申请。本澄清与该不变量同向：只读档更严，例行白名单命中也不得放行；不改变其文字。
3. **P7（第 649 行）**：其「所有角色（含内置治理角色）」是**角色类型**语言，对应普通审批模式；只读档是 `readonlyOnly` **装配模式**，不是该句所列的角色集合。P7 的验收证据也聚焦普通模式的 c-allow/0 卡/非命中形态。**该句未明示只读档组合，属未覆盖边界，不构成「只读档必须放行」的承诺。**
4. **为何不重开闸门 1**：客户裁定 A 只收紧一个未明示的边界（只读档），不改变普通模式的任何行为、契约、验收标准或范围；沟通已将其定性为澄清（记录第 84 行）。方案 v1.3 的确认版本与哈希保持不变（857 行 / `6bd12a99…`），本记录是实施/验收的解释依据。
5. **诚实说明**：若把 P7 的「所有角色」作**最宽字面**理解（连装配模式也算），A 可被视为对 P7 适用范围的收窄；但已确认文本没有点名只读档，且客户在了解两个选项后明确选择「保持严格」，故按澄清处理；如客户/沟通认为需要改动已确认文本，应按方案版本变更流程另行确认。

---

## 4. [实现约束] 最小要求（实现位置可由统筹/技术架构细化）

| # | 要求 | 说明 |
| --- | --- | --- |
| S1 | **只读档永不因例行白名单命中而 allow** | 命中必须返回 `readonly-deny`（`BRANCH_READONLY_DENY`），不得返回 `c-allow`；不得执行命令。 |
| S2 | **视为白名单不存在** | 只读档的分类/原因档位应按 A2 之前的分类（`node --test`→`review`；`npm test`/`npm run 例行脚本`/`npm ci`→`risky`；`tsc --noEmit`→`review`）；既有 reason 模板逐字保留。 |
| S3 | **过滤位置自由、单一实现** | 可在 `ShellGate` 的 `c=allow` 返回前按只读档过滤；也可给只读装配提供「关闭例行白名单」的分类器变体，或给分类器加**显式非默认**开关。若编排侧需要导入谓词，必须经 Service 公开出口 `src/service/gate/shell-rules.ts`（同一函数引用），不得直接导入门禁引擎私有 common。 |
| S4 | **不注入/不调用 `takeGrant`** | 保持现有构造期守卫与调用点跳过；本澄清不放宽。 |
| S5 | **只读档其余语义逐字不变** | 允许列表、`risky`/`review` 拒绝、`c=deny` 终结、无 (b)/(a)、无对话框、超时=拒绝、审计 `readonly-deny`/`by` 不变。 |
| S6 | **普通模式不变** | 项目角色/内置审批模式的白名单命中仍 `c-allow`（0 卡、0 judge）；非命中形态仍走既有链；不得因过滤实现而改变普通模式行为。 |
| S7 | **断言不得放宽** | `test/编排/shell-readonly.test.ts` 的 2 项既有断言**原样保留**并通过（`:350-380`、`:452-470`）；不得改断言、跳过、改名或改成「允许后拒绝」等弱化形式。 |
| S8 | **建议补充只读矩阵** | 在不改既有断言的前提下，建议新增/扩展只读档对全部例行白名单家族的负例（`npm test`、`npm run test/typecheck/lint/check`、`node --test`、`tsc --noEmit`、`npm ci`）——断言 `allow:false`、分支 `readonly-deny`、reason 含对应档位；这是验收证据增强，不是方案变更。 |

> 说明：写目标守卫当前**不在**只读装配路径（`run-role.ts:1351` 未传 `writeGuard`）；若未来把守卫接入只读档，守卫也必须遵守 S1/S2（例行命中不得 `pass`）。本澄清约束语义，不规定必须改哪一个文件。

---

## 5. [验收] 对验收的影响

1. **D1/E2 只读档相关 AC 按 A 判**：只读档对例行白名单命中必须拒绝（`readonly-deny`），不得出现 `c-allow`/执行/审计 `c-allow`。
2. **`test/编排/shell-readonly.test.ts` 2 项保持原断言**：`node --test → readonly-deny`（含 reason `/review/`）与 `openRoleSession` 只读档用例的拒绝断言原样运行、原样通过；**断言不得放宽**。
3. **普通模式 AC 不变**：方案 P7/P1 等关于 `npm test`/`npm run`/`node --test`/`tsc --noEmit`/`npm ci` 的 0 卡、c-allow、非命中仍走既有链的验收照旧；本澄清不降低普通模式的覆盖。
4. **证据建议**：在 D1/E2 证据中附「只读档 × 例行白名单五类」的拒绝矩阵（命令、分支 `readonly-deny`、reason 档位、allow:false），并附既有 2 项断言的原始通过输出；截图最多、不要求录屏（沿用方案 §10 证据规则）。
5. **不新增验收项/不重开闸门**：本澄清不改变方案 §10 的 P/G 基线；上述矩阵是对 A 的可核对证据补充，不是新的客户确认对象。
6. **失败判据**：只读档对任一例行白名单形态 allow、出现 `c-allow`、注入 `takeGrant`、改动/跳过既有断言、或普通模式行为变化 ⇒ 按 A 判失败。

---

## 6. 版本、哈希与状态

| 项 | 值 |
| --- | --- |
| 适用方案版本 | **v1.3**（客户闸门 1 确认版本） |
| 方案行数 / SHA-256 | **857 行** / `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`（本澄清不修改方案正文，方案版本与哈希不变） |
| 客户裁定记录 | `docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`（85 行 / `ea3965cd…`）§「方案空白裁定：只读档与例行白名单（2026-10-31）」（第 80–85 行） |
| 本澄清记录 | v1（2026-10-31）；行数/SHA-256 见交付回执（自引用哈希不写入正文） |
| 状态 | **生效（实施与验收依据）**；属方案 v1.3 的澄清，**不重开闸门 1**；未实施、未测试、未验收 |
| 变更规则 | 若客户/沟通认为本澄清需要改动已确认文本或超出「只读档更严」的语义，按方案版本变更流程另行确认并重开相应闸门 |
