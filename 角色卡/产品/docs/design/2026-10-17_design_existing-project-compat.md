---
id: existing-project-compat
type: design
title: 已有角色但无治理记录的项目兼容（设计提案）
created: "2026-10-17"
updated: "2026-10-17"
timezone: Asia/Shanghai
status: approved
revision: 2
related: [post-v1-product-roadmap, contract-workflow-dispatch, role-capability-install, reasoning-and-effort]
events:
  - date: "2026-10-17"
    kind: created
    summary: 客户现场「有项目角色但无 .ans/project.json」导致治理角色 su 被 F6 全拒；只读复核源码与真实现场，提出兼容路径、状态矩阵与验收口径（仅设计，零代码改动）
  - date: "2026-10-17"
    kind: accepted
    summary: 客户裁定：按 B+C 实施；否决「内置常设治理写权」（理由：混同职责与证据、掩盖 S3、接受证据失效、例外不终止）；A 不采用
---

# 已有角色但无治理记录的项目兼容（设计提案）

一句话结论：**这不是「su 坏了」，而是产品设计里一个被默认掉的合法组合——「项目已有角色、但从未建立治理记录（`.ans/project.json`）」——正好落在创世判据（`hasRoles === false`）之外。** 客户 2026-10-17 已裁定采用：在**导入流程 / 项目状态 / su 空态**给一个**显式的一步动作「为已有角色的项目建立治理记录」**：由操作者点击发起，应用侧复用既有 `finalizeBootstrap` 写出 `角色卡/governance-boundary.yaml` + `.ans/project.json`（含 pin）+ `docs/bootstrap-manifest.md`；**不自动、不猜、不由模型触发**。同时把 F6 拒绝回执从「只说未被接受」改为「说明原因并指向这个动作（或已存在的 CLI `ans govern` 路径）」。A（无 `.ans` 即自动创世）**不采用**（仅文档化备选）；「内置常设治理写权」**已否决**（§3.8）。旧 `boundary.md` 的条件目录丢弃问题是**另一个独立问题**，单独处置，不与本问题混为一谈。

本记录原为**设计提案**，客户已于 2026-10-17 裁定**按 B+C 实施**（revision 2 回填）；但**实施尚未开始（未实施、未测试）**，实施须经项目管理评审与派发属主角色。首轮只读源码与真实现场（含只读查看客户项目目录与诊断日志统计），没有改任何 `app/`、`src/`、`test/`、仓库 `docs/`、其他角色文件，也没有改客户项目 `D:\work\vibe-code\codeagent`，没有 git 提交。

## 来源与动机（依据）

- 客户原话（逐字）：「**这种情况，应该多一个路径啊，应该让产品想想怎么兼容这种情况。**」
- 触发场景：客户本机安装的发行版（v1.3.0）打开项目 `D:\work\vibe-code\codeagent`；该项目**已有 7 个项目角色**（artifact-io、assembly、business-agents、orchestration、platform-framework、project-management、testing），每个角色目录**只有 `boundary.md`（旧版 Markdown）**；`.ans/` 下**只有 `sessions/`，没有 `project.json`**。su 每次写 `docs/su/memo.md` 都被拒，回执为：

  ```text
  边界未被接受或缺少证据来源（F6）：拒绝一切写入。
  … project: （无）
  ```

- 已核实的派生事实（本轮只读复核）：
  - 诊断日志中 `write_file` 共 **4 次尝试**（16 条 start/result 记录），全部来自 `roleId:"su"`、路径均为 `D:/work/vibe-code/codeagent/docs/su/memo.md`、全部 `ok:false / TOOL_FAILED`；**没有任何项目角色的写尝试**（不是「角色写了被拒」，而是「角色没有写」）。
  - 客户拿到过 `confirmed:true` 的确认卡，重试仍被一字不差拒绝——确认卡只能发行 writeSet（F4），F6 在 F4 **之前**判定，见 §1.3。
  - 用真实判定链在客户项目上只读模拟：su → 内置边界、`accepted:false` → F6；orchestration/testing → `accepted:true`（桌面运行期同意），写各自代码路径允许。**「7 个角色也全部只读」是误判，真正被卡的只有 su**（项目角色的文档面另有旧格式问题，见 §六）。

## 一、现场与根因（逐层复核）

### 1.1 判定链：su 的四步边界解析

`src/common/门禁引擎/boundary-core.ts:524-563` 的 `resolveBoundarySection` 按顺序求值：

1. **项目角色覆盖**（`:533-543`）：仅当 `gov.acceptance.accepted === true` **且** `project.roles[roleId]` 有 `boundary` 时，加载该角色自己的边界。su 是内置角色，`builtInRoles` 有它、`roles` 映射里没有它——**不适用**。
2. **治理边界覆盖**（`:545-548`）：仅当 `project.governanceBoundary.path` 非空时，加载该文件并按 `gov.acceptance` 校验。本项目没有 `.ans/project.json`，`buildEffectiveProjectConfig` 采纳的 `governanceBoundaryPath` 是空串（`app/desktop/project.ts:169-182`，`:179-180`）——**跳过**。
3. **冷启动创世例外**（`:550-559`）：仅当 `roleId === "su"` **且** `project.genesisBootstrap` 被显式设置时，返回治理种子边界。`buildProjectConfig` 只在 **`listing.hasRoles === false`** 时设置该字段（`app/desktop/project.ts:110-115`）——本项目有 7 个项目角色，**关闭**。
4. **内置边界**（`:561-562` → `builtInBoundarySection()`，`:286-292`）：返回内置边界，`acceptance = { accepted: false, source: "" }`。

于是 `resolveWrite` 的第一道判定（`src/service/gate/resolve-write.ts:120-124`）命中 F6：

```ts
// F6：边界未被接受或缺少证据来源 → 拒绝一切写入
if (!acc || acc.accepted !== true || typeof acc.source !== "string" || acc.source.trim() === "") {
  return deny("边界未被接受或缺少证据来源（F6）：拒绝一切写入。", boundary, scope);
}
```

**根因一句话**：产品设计此前隐含假设「项目有角色 ⇒ 已经 bootstrap」；但「有角色、无 `.ans`」是一个**合法且真实**的组合（导入前已有角色目录、从别的项目拷贝角色卡、`finalize` 两次写入之间崩溃等）。现有代码把这个组合当成「既没有创世、也没有治理边界」的第三种回退，于是 su 被 fail-closed 到死。

### 1.2 为什么自动收尾救不了（自愈路径不存在）

- `run-role.ts` 在每轮 `settled` 后调用 `repinIfBootstrapped`（`src/pipeline/orchestration/run-role.ts:866-889`；默认仅内置治理角色开启，`:653-655`）。
- `repinIfBootstrapped` 在「无 `.ans/project.json`」时走首次收尾 `finalizeBootstrap`（`src/common/编排/finalize.ts:320-327`；创世判定 `:152-154`）。
- `finalizeBootstrap` 的 `precheck` 会把 `.ans/project.json`、`docs/bootstrap-manifest.md`（创世时再加治理边界文档）逐个交给**同一个** `resolveWrite` 求值（`finalize.ts:168-217`，`:201-215`）。su 此刻持有的正是 §1.1 第 4 步的未接受内置边界 ⇒ `.ans/project.json` 被 F6 拒 ⇒ `precheck` 返回 `{ok:false, status:"blocked"}`，**零副作用**。
- 这段调用的返回值被 `run-role.ts` 直接忽略；只有抛错才进 `catch`（`:881-884`）。`finalizeBootstrap` 在 precheck 失败时**不抛错**，只返回结果——所以不仅「失败被吞」，**连诊断事件都没有**。下一轮 settle 用同一份未接受边界重试，结果相同：**`.ans` 永远写不出来**。

### 1.3 为什么确认卡救不了

`request_confirmation` 的 `confirmed:true` 只会把 preview 中逐条列出的**路径**发行进本会话的 `writeSet`（编排 `confirmed-writes.ts`；F4 在 `resolve-write.ts:177-189` 收窄）。而 F6 在 F4 **之前**（`:120-124`）判定：边界尚未接受时，路径连「是否在边界内」都不会进入，确认卡也不产生任何「边界接受」证据。因此客户即使点过 `confirmed:true`，重试仍会被 F6 一字不差拒绝。**确认通道不能、也不应该被用来制造边界接受**（本提案把它列为不可破坏的不变量之一，§四）。

### 1.4 哪些写其实是可以的（不要把「su 被卡」扩大成「全项目只读」）

在无 `.ans` 的项目里，桌面给项目角色的 acceptance 是 `DESKTOP_RUNTIME_CONSENT`（`app/desktop/project.ts:137-140`）——**导入项目即授权该角色按其完整边界工作**的运行期同意，无 pin（设计 §3.3 登记的两个非-pin 例外之一）。因此：

- 项目角色走 `resolveBoundarySection` 第 1 步（`gov.acceptance.accepted === true` 且 `loc.boundary` 存在），加载自己的边界，`accepted:true`；
- 聊天会话 `scope: undefined`（无任务收窄），写入只要命中角色自己的 Section 1 就被允许；
- 但**文档面**另有旧格式问题：客户 7 份 `boundary.md` 的「条件目录」行缺 condition slug，被 legacy 解析器静默丢弃；即使补了 slug，`scope: undefined` 下条件目录也不会激活（`resolve-write.ts:32-38`）。所以项目角色**能写代码/测试路径，写不了自己的 `docs/**`**——这与 su 的 F6 是两件事，见 §六。

| 对象 | 在客户现场的实际状态 | 依据 |
| --- | --- | --- |
| su | 边界 = 内置未接受 → F6，拒绝一切写入；`.ans` 也写不出 | `boundary-core.ts:550-562`；`resolve-write.ts:120-124`；`finalize.ts:201-215` |
| 7 个项目角色 | 边界 = 各自 `boundary.md`，accepted=true（桌面运行期同意）；代码/测试路径可写；`docs/**` 因旧格式被丢行而写不进 | `project.ts:137-140`；`resolve-role.ts:100`；`boundary-parse.ts:117-122`；`resolve-write.ts:32-38` |
| `.ans/project.json` | 不存在；`.ans/sessions/` 存在也不影响 `isGenesisState`（只看 `project.json`） | `finalize.ts:152-154`；`config-loader.ts:75-77` |

### 1.5 代码位置索引（写作时点工作树读数，HEAD `b9d4a3d`）

| 位置 | 事实 |
| --- | --- |
| `src/common/门禁引擎/boundary-core.ts:524-563` | 四步边界解析；第 3 步是唯一给 su 创世种子的地方 |
| `src/common/门禁引擎/boundary-core.ts:286-292` | 内置边界 `accepted:false`；F6 的来源 |
| `src/common/门禁引擎/governance-seed.ts:51-70` | 种子边界＝`角色卡/`、`docs/`、`.ans/` 三个普通目录；`source` 非空才被 F6 认可 |
| `src/service/gate/resolve-write.ts:120-124` | F6 在一切路径判定之前 |
| `src/service/gate/resolve-write.ts:177-189` | F4 writeSet 收窄（确认卡发行面） |
| `app/desktop/project.ts:72-126` | `buildProjectConfig`；`genesisBootstrap` 仅在 `hasRoles === false` 设置（`:110-115`） |
| `app/desktop/project.ts:137-140` | `DESKTOP_RUNTIME_CONSENT`（运行期同意，无 pin） |
| `app/desktop/project.ts:169-182` | 桌面授权链唯一实现；治理边界路径取自 `.ans`（`:179-180`） |
| `src/pipeline/orchestration/run-role.ts:866-889` | 每轮 settle 后 `repinIfBootstrapped`；失败只 `catch` 抛错，返回值被忽略 |
| `src/common/编排/finalize.ts:168-217` | `precheck`：无可 pin / 门禁拒 → `blocked` / `nothing-to-pin`，零副作用 |
| `src/common/编排/finalize.ts:234-309` | `finalizeBootstrap`：写治理边界文档、算 SHA-256、写 `.ans` + manifest |
| `src/common/编排/finalize.ts:320-327` | `repinIfBootstrapped`：创世态写治理文档；非创世态只重 pin |
| `src/service/role/resolve-role.ts:100` | 边界文件枚举顺序 `boundary.yaml` → `.yml` → `.md` |
| `src/service/role/resolve-role.ts:136-270` | `listProject`；`hasRoles` 只看是否枚举到项目角色（`:255-256`） |
| `src/common/门禁引擎/boundary-parse.ts:117-122` | legacy Markdown：条件目录缺合法 slug → `continue`（静默丢弃） |
| `src/common/shared/config-loader.ts:87-104` | `.ans` 的 pin-backed 终态规则：`accepted:true` 无 pin → 降级未接受 |
| `src/common/shared/config-loader.ts:198-215` | `.ans` 不可解析 → `ans-invalid`，不回退导入授权 |
| `src/index.ts:207-222` | CLI `ans govern <目录>` 在无 `.ans` 时设置创世授权（**已存在的恢复路径**） |

> 行号说明：以上为 2026-10-17 写作时点的工作树读数（HEAD `b9d4a3d`，工作树干净）。实施派发前请以当轮基线复核。

## 二、状态矩阵（兼容性讨论的基础）

> 「可写」一律指**命中该对象自己的边界**；`scope: undefined` 的聊天会话不做 F4 收窄。项目角色的「可写」还受旧格式条件目录影响，表中按主状态标注，§六单列。

| 状态 | `.ans/project.json` | su 的边界来源 / 判定 | su 可写 | 项目角色可写 | 卡在哪一步 | 现有恢复路径 |
| --- | --- | --- | --- | --- | --- | --- |
| **S0 空项目** | 无 | 创世种子（桌面「导入 + 开启 su」或 CLI `ans govern`；`genesisBootstrap` 已设） | `角色卡/`、`docs/`、`.ans/`；`src/**` 等拒 | 无项目角色 | 无；首次 settle 若有可 pin 之物则自动写出 `.ans` + 治理边界文档 + manifest，然后**结构性自终止** | 现状即可 |
| **S1 有角色、无 `.ans`**（客户现场） | 无 | 第 3 步关闭（`hasRoles === true`）→ 第 4 步内置未接受 → F6 | **零**（连自己的 `docs/su/memo.md` 都不行） | **可写各自边界内的代码/测试路径**（运行期同意 accepted=true）；`docs/**` 受旧格式影响 | 第 3 步判据；`finalize` 的 `.ans` 写入也被同一 F6 拒，且返回值被吞 | **缺失**；CLI `ans govern <目录>` 可走通（§3.4） |
| **S1b 有角色 + 治理边界文档已存在、无 `.ans`** | 无 | 同上：`gov.path` 只从 `.ans` 读取，盘上的 `角色卡/governance-boundary.yaml` 被**忽略** | 零 | 同 S1 | 同上；这是 `finalize` 写 gov doc 与 `.ans` 之间崩溃可能留下的状态 | 显式动作可「采纳既有治理边界文档 + 写 `.ans`」，但不得自动 |
| **S2 `.ans` 有效** | 有，可解析；`gov.path` 非空；`accepted:true` 且 pin 非空、逐条可读且 SHA-256 匹配 | 第 2 步治理边界覆盖 → accepted | 治理边界内（`角色卡/`、`docs/`、`.ans/`）；每轮 settle 自动重 pin | 各自边界内；同样受 pin 校验 | 无（正常态）；新增角色在下次重 pin 前其边界可能「未被任何 pin 覆盖」而暂时未接受 | 现状即可；重 pin 窗口＝到下一次 su settle |
| **S3 `.ans` 存在但无效 / 未 pin-backed** | 有，但 JSON 不可解析 / 顶层非对象 / 无 `governanceBoundary.path` / `accepted:true` 无 pin | 载入器 `ans-invalid` 或终态规则降级 → 未接受、`gov.path=""`；su 第 4 步 F6 | 零 | **也零**：第 1 步要求 accepted=true，失败；第 2 步路径空；第 4 步内置未接受 → F6 | `.ans` 载入即 fail-closed，**不回退导入授权**（设计如此） | 只能由操作者显式修复/重建 `.ans`；不得静默覆盖 |
| **S4 `.ans` 可解析且 accepted=true，但 pin 不符 / 被 pin 文件不可读** | 有 | 第 2 步加载治理边界时 `verifyPins` 遍历**所有** pin，任一不符 → unaccepted | 零 | **也零**：第 1 步虽通过裸 accepted，但 `loadBoundaryFile` 同样跑全部 pin 校验，任一不符 → unaccepted | pin 校验（`boundary-core.ts:344-364`）；注意一个漂移文件会**毒化所有边界** | 若有个在漂移前已开的 su 会话，下一次 settle 可能重 pin 吸收（篡改检测窗口）；否则死局。需操作者显式核对/重新接受（§3.3 修复模式） |

**矩阵要点**：

1. **S1 是唯一的「su 被卡、角色可写」状态**；不要把它描述成「项目只读」。
2. **S3/S4 是「su 与角色都只读」**——这是 fail-closed 的既有设计，不是本提案要放松的对象；本提案只负责给出**显式的操作者恢复路径**，且恢复动作本身也必须先过门禁。
3. **S0 与 S1 的差别不在「有没有角色」，而在「有没有 `.ans/project.json`」**。现有 `hasRoles` 判据把「有角色」误当成「已建立治理记录」，这是根因的结构位置。
4. **旧格式（S5 叠加态）**：S1/S2 下项目角色都可能因 `boundary.md` 条件目录缺 slug 而写不进 `docs/**`；这与主问题独立（§六）。

## 三、候选路径

### 3.0 一条好路径要满足什么

- **不破坏 F6 fail-closed**：未接受就是未接受；不能靠「项目有角色」「客户点过确认卡」之类推断出 accepted。
- **不 blanket**：任何新放行只能是**有界治理产物**（`角色卡/`、`docs/`、`.ans/` 的写入），不能顺手给 `src/**` 或项目内任意文件。
- **有界且自终止**：一旦治理边界文档 + `.ans` 落地并被 pin，创世/迁移授权必须结构性失效。
- **pin 证据由代码算**：人可以发起动作，但 SHA-256 只能由代码在写入后计算（沿用 `finalize.ts` 的既有纪律）。
- **程序不得自判 accepted**：触发必须来自操作者的显式动作，不能由模型、settle、导入枚举或定时器替客户决定。
- **确认卡不得被误用为接受**：F6 仍在 F4 之前；`request_confirmation` 的语义不变。

### 3.1 候选 A：把创世判据从 `hasRoles === false` 改为「无 `.ans/project.json`」

**做法**：`buildEffectiveProjectConfig` 在 `loadEffectiveConfig` 返回 `source.kind === "builtin-fallback"`（无 `.ans/project.json`）时，无论 `hasRoles` 真假，都给 `ProjectConfig` 带上 `genesisBootstrap`。这与 CLI `ans govern <目录>` 的既有判据一致（`src/index.ts:207-222`：`source.kind === "builtin-fallback"` 即设）。`finalize` 的扫描是按盘上角色进行的（`finalize.ts:331-361`），所以 7 个角色会被一并 pin。

- **优点**：改动最小；不需要新 UI/IPC；复用已经验证过的种子边界与 `finalize`；与 CLI 行为对齐；su 立刻可写，`.ans` 可自动补上。
- **代价**：**隐式**——只要项目有角色、无 `.ans`，打开 su 并产生一次 settle，就会在没有专门动作的情况下写出治理边界文档、`.ans`、manifest；`source` 文案必须从「导入空文件夹」改写为「导入项目并开启 su 对话 = 发起 bootstrap」，否则是假陈述。测试也要改：`test/桌面应用/genesis-bootstrap.test.ts:63-68` 现在明确断言「有角色 ⇒ 不带 genesisBootstrap」。
- **风险**：①操作者可能只是打开 su 问一句，却触发了 3 个文件写入与 7 份旧边界的 pin；②项目角色目录里可能有意保留旧格式，自动 pin 会把旧格式「盖章」；③不解决 S3/S4，也不解决旧格式文档面；④如果目录不可写，失败仍会被 `run-role.ts` 吞掉（不抛错），客户看不到原因。
- **被破坏/满足的不变量**：F6 不放松（种子本身 accepted 且有 source，未接受边界仍拒绝）；种子有界（仅三目录）；自终止成立（第 2 步先于第 3 步）；pin 由 `finalize` 计算；**「程序不得自判 accepted」是弱项**——应用按「无 `.ans`」这一状态直接推断出一次 bootstrap，授权来源是推断而非专门动作；确认卡未被误用。
- **结论（客户 2026-10-17 裁定）**：**A 不采用**。客户此前已明确否掉「自动落盘」；A 仅作为**文档化备选/降级**记录在案（零 UI 时不新增入口的退路），**不得作为主路径或默认行为**。

### 3.2 候选 B：导入/项目状态显式呈现「为已有角色的项目建立治理记录」的一步式动作（推荐）

**做法**：检测到 `hasRoles === true` 且无 `.ans/project.json` 时，在**项目状态行**与 **su 聊天空态**呈现一句说明 + 一个动作按钮（不阻断项目角色使用）。点击后进入预览/确认，再由候选 C 的机制执行。

- **谁授权**：**操作者本次显式点击**。不是模型、不是导入枚举的副作用、不是 `request_confirmation` 的 `confirmed:true`。
- **授权来源算什么**：`.ans` 里的 `acceptance.source` 记录为操作者动作（例如 `desktop-app:操作者为已有角色的项目显式建立治理记录`）。它**不是**给 `.ans` 载入新增一个「免 pin」例外——产出的 `.ans` 仍然**必须 pin-backed**（`config-loader.ts:87-104`）；它只是「用来写第一份 `.ans` 的那条一次性边界的 acceptance 来源」，与创世种子、CLI `ans govern` 的「操作者指令」同一类。若客户希望把它正式登记进**既有设计 §3.3（`.ans` 终态规则）**的来源清单，应作为**操作者指令来源**登记，而不是作为第三条非-pin 例外。
- **与既有设计 §3.3 两个非-pin 例外的关系**：桌面的 `DESKTOP_RUNTIME_CONSENT` 仍只负责「导入 = 角色按其边界工作」；**不**用它来直接给 su 边界接受。本动作的点击是**另一个、更窄的**操作者动作，只覆盖「建立治理记录」这一次写入。两者不能互相替代：没有点击时，`DESKTOP_RUNTIME_CONSENT` 不应被解释成「客户同意 bootstrap」。
- **优点**：显式、可解释、可预览；不产生「打开 su 就多出文件」的意外；同一个入口可扩展成 S1b 的「采纳既有治理边界文档」和 S3/S4 的显式修复；给 F6 回执一个**可以指向的真实去处**；对项目角色零影响。
- **代价**：需要新增桌面状态检测、IPC/动作、UI 文案与失败回执；需要决定预览呈现到什么粒度；需要确保动作只由操作者触发。
- **风险**：①如果做成自动弹窗，会打扰（客户口味：常规提示不打扰）——建议做成**状态行 + 空态按钮**，不弹模态；②如果按钮文案说成「授权/放宽权限」，会误导——必须写明「不改变任何角色的写边界」；③如果预览不列 pin 对象，客户不知道会钉哪些文件；④如果实现绕开 `finalize` 自己写文件，会破坏「每笔写先过门禁」。
- **被破坏/满足的不变量**：F6 不变（动作使用一次性有界边界，最终 `.ans` pin-backed）；不 blanket（仅三治理目录）；有界且自终止（`.ans` 的 `gov.path` 落地后第 2 步接管）；pin 由代码算；程序不自判 accepted（显式点击 + 无自动重试）；确认卡未被误用（动作是应用级操作者入口，不是模型工具）。
- **结论（客户 2026-10-17 已批准）**：**主路径**。

### 3.3 候选 C：应用侧迁移机制（操作者动作触发，写出治理边界文档 + `.ans` 含 pin）

**做法**（作为 B 的执行机制，也可单独由 CLI/项目状态调用）：

1. 操作者点击后，应用侧重新 `listProject`/读取现场，确认「有角色、无 `.ans/project.json`」（或进入修复模式，见 S1b/S3/S4）。
2. 构造**一次性** `BoundarySection1`：条目＝治理种子三目录（`角色卡/`、`docs/`、`.ans/`，普通 `directory`），`acceptance = { accepted: true, source: <操作者动作来源> }`。**不持久化这份边界**，只传给本次 `finalizeBootstrap`。
3. 调用既有 `finalizeBootstrap`（`src/common/编排/finalize.ts:234-309`）：正常 S1 传 `writeGovernanceBoundaryDoc: true`；**S1b（已有治理边界文档）传 `false`**——`precheck` 在 `govExists` 为真时会把既有文档计入 pin 目标（`:197-199`），`finalizeBootstrap` 不再重写它，只写 `.ans` + manifest，从而「采纳」既有文档而不是覆盖。落点默认 `角色卡/governance-boundary.yaml`（`DEFAULT_GOVERNANCE_BOUNDARY_REL`，`:72`）。正常 S1 会：先写治理边界文档 → 对落盘后的实际字节算 SHA-256 → 写 `.ans/project.json`（roles map + `governanceBoundary.path` + acceptance/pin）→ 写 `docs/bootstrap-manifest.md`。所有待写路径在 `precheck` 已全部前置求值；任一被拒则整批中止、零副作用（`:168-217`）。
4. 把 `FinalizeResult` **逐字如实**返回给界面；成功后刷新项目枚举，su 边界随下一次会话解析变为 accepted。

- **是否构成「程序自授权」**：**不构成，当且仅当**以下条件全部成立：①只有操作者手势能调用（不是 settle、不是导入自动、不是模型工具）；②来源字符串如实记录这一手势；③一次性边界用完即弃，不写进任何配置、不跨会话复用；④`finalize` 仍然逐路径走 `resolveWrite`，不绕门；⑤失败/取消零副作用；⑥不会自动重试或自动补写。任何一条不满足，就会退化成程序自授权。
- **优点**：确定性、不依赖模型；复用已经承担「写 `.ans` + pin + manifest」的唯一代码路径；天然全有或全无；离线可测；CLI/桌面可共用。
- **代价**：需要把 `finalizeBootstrap` 暴露成一个可被桌面/CLI 显式调用的公开入口（当前主要经 `repinIfBootstrapped` 在 settle 后调用）；需要错误码到 UI 文案的映射；需要处理「已有治理边界文档」与「需要新建」两种分支。
- **风险**：①若预览缺失，操作者看不到将写什么/钉什么；②旧格式边界会被原样 pin（建议在预览中明确标出）；③如果调用方把一次性边界误传成常驻配置，会变成新的 blanket 入口——实现时必须把它限制在单次调用内；④S3/S4 的修复模式语义不同（不是「建立」，而是「核对后重新接受」），不能复用同一句文案。
- **被破坏/满足的不变量**：全部满足（同上）。唯一需要额外注意的是「pin 由代码算」和「不绕门」——复用 `finalizeBootstrap` 正是为了这两条。
- **结论（客户 2026-10-17 已批准）**：**主路径的实现机制**。

### 3.4 候选 D：文档化的人工恢复步骤（登记，接受度低）

**做法**：

- **CLI 路径（已存在，零代码改动）**：`ans govern <项目目录>`。`loadInjection` 在目标目录无 `.ans/project.json` 时设置 `genesisBootstrap`（`src/index.ts:207-222`），su 获得三目录种子边界；settle 后 `repinIfBootstrapped` 按盘上角色扫描并写出治理边界文档 + `.ans` + manifest。对本客户项目（7 个角色、无 `.ans`）**这条路径理论上是通的**，前提是客户能运行 CLI 并已配置模型/凭据。
- **手写 `.ans/project.json`（不推荐）**：必须同时存在治理边界文档、提供正确的 pin（逐文件 SHA-256）、正确的 roles map 与 `governanceBoundary.path`；载入器对无 pin、坏 JSON、pin 不符一律 fail-closed。人手抄错的风险高，且容易把别的项目的 `.ans` 复制过来（pin 必不符）。
- **优点**：零产品改动；CLI 路径已经是真实代码，不是设想的；不需要新 UI。
- **代价**：发现性差（客户不知道有这个路径）；CLI 需要凭据/网络/配置；手写文件不可维护。
- **风险**：客户可能复制 `.ans` 导致 S4；也可能手写 accepted 但无 pin 导致 S3。两者都会让**所有**角色只读。
- **被破坏/满足的不变量**：CLI 路径满足全部（操作者显式发起、种子有界、pin 由代码算）；手写路径只在完全正确时满足 pin，否则 fail-closed——不是产品路径。
- **结论**：**登记为文档化 fallback**；至少应把 CLI 路径写进状态文案/回执，作为「不新增 UI 时的最低恢复手段」。

### 3.5 候选 E：把确认卡 `confirmed:true` 当作边界接受 / 把 F6 移到 F4 之后（拒绝）

- **做法**：让 `request_confirmation` 的确认结果产生「边界已接受」，或调整判定顺序让 writeSet 先于 F6。
- **为什么不行**：这正是当前客户已经试过且不可能奏效的路径（§1.3）。确认卡发行的是**路径级 writeSet**，不是边界接受；F6 先于 F4 是刻意的 fail-closed。把二者混同会破坏：
  - **F6 fail-closed**：未接受边界会因一次路径确认而被放行；
  - **pin 证据**：确认卡不产生任何 SHA-256 证据；
  - **程序不得自判 accepted**：模型可以通过请求确认卡间接制造「边界接受」；
  - **确认卡不得被误用为接受**：确认卡的本意是「这次写哪些路径」，不是「接受这份边界」。
- **结论**：**拒绝**（可作为反例，提醒实现不要走捷径）。

### 3.6 候选 F：让 su 采用项目角色边界 / 用角色边界的并集合成 su 边界（拒绝）

- **做法**：把某个项目角色的边界直接给 su，或把所有角色边界的并集当作 su 的治理边界，从而让 su 无需 `.ans`。
- **为什么不行**：①su 会获得跨角色的代码写权（例如所有角色的 `src/**`、`test/**`），这是 **blanket**，破坏角色隔离与最小写权；②没有 pin/接受证据，破坏 F6；③角色边界不是治理边界，通常不含 `.ans/`，也无法合法写 `.ans/project.json`；④会让「导入即按角色边界工作」被误解释成「su 也能按角色边界工作」。
- **结论**：**拒绝**。

### 3.7 候选对比与推荐

| 候选 | 触发 | 写什么 | 主要优点 | 主要代价/风险 | 结论 |
| --- | --- | --- | --- | --- | --- |
| A 无 `.ans` 即创世 | 自动（打开 su + settle） | 治理边界文档 + `.ans` + manifest | 改动最小、与 CLI 对齐 | 隐式落盘；来源文案要改；不解决 S3/S4 | 备选/降级 |
| B 显式一步动作 | 操作者点击 | 同 A，但先预览 | 显式、可解释、可扩展修复 | 需 UI/IPC；文案要谨慎 | **已批准（入口/授权）** |
| C 应用侧迁移 | B 的机制（或 CLI/项目状态调用） | 同上，复用 `finalizeBootstrap` | 确定性、复用既有门禁与 pin | 需公开入口；修复模式文案不同 | **已批准（机制）** |
| D 文档化人工恢复 | 操作者跑 CLI / 手写 | CLI 自动；手写风险高 | 零代码；CLI 已存在 | 发现性差；需凭据；手写易错 | 登记 fallback |
| E 确认卡当接受 | 确认卡 | 无合法产物 | 看似「客户已经点过」 | 破坏 F6/pin/不自判 | 拒绝 |
| F su 采用角色边界 | 自动 | 无 | 看似省事 | blanket、跨角色、无证据 | 拒绝 |
| G 内置常设治理写权 | 永久（改内置边界为 accepted） | 无需任何项目证据 | 看似「天生可治理」 | 混同职责与证据；掩盖 S3；接受证据失效；例外不终止 | **拒绝（客户已否决）** |

**推荐**：**B + C 合体**——在项目状态/su 空态提供显式动作，点击后由应用侧复用 `finalizeBootstrap` 完成「治理边界文档 + `.ans`（含 pin）+ manifest」。理由：

1. 它把「谁授权」写清楚：操作者的一次显式点击，而不是程序从 `hasRoles` 或 `confirmed:true` 推断。
2. 它不改变任何项目角色的写边界；只补上缺失的治理记录。
3. 它复用唯一既有的 pin 计算与逐路径门禁路径，不新造第二个写入器。
4. 它给 F6 回执一个具体、可达的恢复去处，同时保留 fail-closed。
5. **客户 2026-10-17 已裁定采用本路径作为主路径**；A 不采用，仅作文档化备选；D 的 CLI 路径可先作为文档化兜底。

### 3.8 已否决候选 G：把治理写权做成 su 的内置常设权限（拒绝）

**客户原话背景（2026-10-17）**：客户先问「su 写这些文件的权限是不是可以内置、不用从文件读取」，评估后自判：「这个感觉天生就可以治理，也有点问题，这个我觉得他最好能兼容这种情况。」最终决定按 B+C 推进。

**候选做法**：把内置边界（`boundary-core.ts:286-292`）改为 `accepted: true`，并给 su 加入项目根治理条目（`角色卡/`、`docs/`、`.ans/`），使 su 无需任何项目级接受证据即可写治理文档。

**否决理由（如实记录，防止后续实施走偏）**：

1. **混淆了两个不同的事实**：「su 有治理职责」是**产品定义**（所有项目都一样）；「这个项目的治理边界已被接受」是**项目级证据**（逐项目、可 pin、可追溯）。内置常设写权把前者当成后者，等于用一个全局常量替代项目证据。
2. **让 S3 不再 fail-closed、掩盖损坏**：`.ans` 损坏或未 pin-backed 时，内置 accepted 会让 su 继续可写，损坏从「响亮的拒绝」退化为「静默工作」——正好掩盖了需要操作者处理的故障。
3. **接受证据失去意义**：若内置边界天然 accepted，则项目可以永远没有治理记录也照常运转，「接受」不再是任何真实状态的表达，`.ans` 的 pin-backed 终态规则被架空。
4. **例外不终止**：这不是一次性动作，而是**常设**放行面（每个项目、每次会话都生效），与「接受必须是显式证据、创世/迁移必须自终止」的设计相悖；也无法给出「什么时候该失效」的判据。

**结论**：**拒绝**（已否决，不得作为实现捷径）。若未来出现「零 `.ans` 但需要 su 写入」的新场景，仍应走 B+C 的显式动作，而不是恢复内置常设写权。

## 四、安全不变量（不得破坏）

| 不变量 | A | B + C | D（CLI） | E / F |
| --- | --- | --- | --- | --- |
| **F6 fail-closed**：未接受边界拒绝一切写入 | 满足：种子本身 accepted 且有 source；其他未接受边界仍拒 | 满足：一次性边界 accepted 有操作者来源；`.ans` 产出后由 pin-backed 治理边界接管；普通写仍 F6 | 满足（CLI 同 A） | **破坏**（E 把确认当接受；F 无证据） |
| **不得 blanket**：新放行只能是治理产物 | 满足：种子仅 `角色卡/`、`docs/`、`.ans/` | 满足：同左，且只用于一次 finalize | 满足 | **破坏**（F 给 su 角色代码写权） |
| **创世/迁移有界且自终止** | 满足：`.ans` 的 `gov.path` 落地后第 2 步先命中，第 3 步永不求值 | 满足：一次性边界不持久化；`.ans` 落地即自终止 | 满足 | 不适用/破坏 |
| **pin 证据**：`.ans` accepted 必须 pin-backed | 满足：`finalize` 对落盘字节算 SHA-256 | 满足：复用 `finalizeBootstrap` | 满足（CLI）；手写路径靠人，风险高 | **破坏**（E 无 pin；F 无 pin） |
| **程序不得自判 accepted** | **弱项**：按「无 `.ans`」自动推断 | 满足：显式操作者点击；无自动重试；一次性边界 | 满足：操作者显式运行 CLI | **破坏** |
| **确认卡不得被误用为接受** | 满足：不使用确认卡 | 满足：动作是应用级操作者入口，不是 `request_confirmation` | 满足 | **破坏**（E） |
| **角色写边界不变** | 满足：种子只给 su，项目角色仍按各自边界 | 满足：动作不修改任何角色边界文件 | 满足 | **破坏**（F） |

补充两条实现纪律：

- **一次性边界不得落进配置**：B/C 的种子式边界只能作为本次 `finalizeBootstrap` 的参数；不得写入 `ProjectConfig` 持久层、不得跨会话复用。否则会变成新的常驻放行面。
- **失败必须可见**：`finalizeBootstrap` 返回 `blocked` / `nothing-to-pin` 时，调用方必须把 `message` 如实回执；不能像 `run-role.ts:881-884` 那样只 `catch` 抛错而忽略返回值。取消与失败都必须明确「零副作用」。
- **禁止把一次性边界做成常设**：任何「把内置边界改为 accepted」「给 su 加项目根常设条目」的实现都等于候选 G——它会同时破坏上表的 F6 不变量、程序不自判 accepted、创世/迁移自终止三条，并让 S3/S4 的 fail-closed 失效。客户已否决，实施中不得以「顺手修一下」为名恢复。

## 五、UX 与文案

### 5.1 入口放哪

推荐三个层次，按上下文递进：

1. **项目状态行**（导入后常驻，不打扰）：当检测到 S1 时，在现有「已导入项目，共 N 个角色…」附近追加一句状态与动作；不要弹模态。
2. **su 聊天空态**（主入口）：客户点开 su 时，这才是「su 为什么写不了」的正确上下文；空态标题/说明/按钮都放这里。
3. **F6 拒绝回执**（模型可见）：在原有 F6 首行之后追加原因与恢复路径；模型转述给客户时有话可说。
4. **导入流程**：只做一次非阻塞提示（例如状态行出现），**不在导入时自动写文件**，也不在导入时弹确认框。

### 5.2 客户看到什么（文案草案）

**项目状态行（S1）**：

```text
本项目有 7 个项目角色，但尚无治理记录（.ans/project.json）。
项目角色可按各自边界工作；治理角色 su 暂时无法写入。 [建立治理记录]
```

**su 空态（S1）**：

```text
治理角色 su 暂时无法写入

这个项目已经有 7 个项目角色，但没有 .ans/project.json（治理记录）。
su 需要一个已接受的治理边界才能写文档；项目角色不受影响，仍可按各自边界工作。

[为已有角色的项目建立治理记录]
也可以在终端运行：ans govern <项目目录>
```

**点击后的预览（不直接写）**：

```text
将为这个项目建立治理记录：

将写入：
  角色卡/governance-boundary.yaml
  .ans/project.json
  docs/bootstrap-manifest.md

将 pin（SHA-256）：
  角色卡/<id>/boundary.md × 7（旧版 Markdown；内容不会改变）
  （新建的治理边界文档 × 1）

授权来源：你（操作者）本次点击。
此操作不会扩大任何角色的写边界，也不会修改任何角色边界文件的内容。

[建立治理记录] [取消]
```

**成功回执**：

```text
已建立治理记录：写入 3 个文件，pin 8 条。
su 现在可以写入治理文档。
注意：7 个项目角色仍使用 boundary.md（旧版格式），其 docs 目录写入仍受限制；
可另行迁移为 boundary.yaml（见 §六）。
```

**失败回执**（逐字取 `FinalizeResult.message`）：

```text
建立失败：<message>
未写入任何文件（finalize 全有或全无）。
[重试] [关闭]
```

**取消**：

```text
已取消，未写入任何文件。
```

### 5.3 点下去发生什么

1. 重新核对现场（有角色、无 `.ans`；或进入对应的修复模式）。
2. 展示预览（要写的路径、要 pin 的对象、授权来源、不会改变角色边界）。
3. 操作者确认后，调用应用侧迁移（候选 C）；**取消则零副作用**。
4. 成功：刷新 `listProject`，su 下一次会话按新治理边界解析；项目角色列表与选择保持不变。
5. 失败：显示 `FinalizeResult.message` 原文；明确是否零副作用；不自动重试。
6. 重复点击：`.ans` 有效时动作隐藏或禁用，文案「治理记录已存在」。

### 5.4 F6 回执是否应直接指出恢复路径

**应该，但只在原因可判定时。** 现状 F6 只说「未被接受或缺少证据来源」，模型与客户都不知道该做什么。建议：

- **保留原首行逐字不变**（既有测试按子串断言），在其后追加原因与恢复段；
- **S1**：说明「有项目角色但缺少 `.ans/project.json`」，指向「建立治理记录」或 `ans govern`，并明确「项目角色不受影响」；
- **S3**：说明 `.ans` 存在但不可用/未 pin-backed，指向「由操作者修复或显式重建」，不自动回退；
- **S4**：说明「边界文件 SHA-256 与 pin 不符」，列出漂移文件，指向「核对并重新接受」；绝不自动 re-pin；
- **未知状态**：不猜测，保留原文（避免把别的原因误报成「没有治理记录」）。

实现注意：`resolveBoundarySection` 目前只能从 `ProjectConfig` 看到 `gov.path` 与 acceptance；「无 `.ans`」与「`.ans` 无效」在桌面都表现为 `gov.path=""` + 未接受。若要区分 S1/S3，需要把载入器的 `source.kind`（`builtin-fallback` / `ans-invalid`）或等价状态传给边界解析/回执层。这是实现决策点（§九-6），产品要求是**回执不得把原因说错**。

### 5.5 文案纪律（对齐客户口味五条与既有措辞守卫）

- 不打扰：状态行即可，不弹模态；只有客户点开 su 或点按钮才进入预览。
- 信息在对的上下文：su 的空态说 su 的事；项目的状态说项目的事。
- 诚实：不说「7 个角色全部只读」；说「su 暂时无法写入，项目角色可按各自边界工作」。
- 不夸大：预览明确「不扩大角色写边界、不修改角色边界文件」。
- 避免把点击描述成「授权给角色」：点击是「操作者发起建立治理记录」，不是给任何角色加权限。
- 失败如实：`blocked` / `nothing-to-pin` / 门禁拒绝原文都要能显示；不能只显示「失败」。
- 旧格式提示单独说：不要把 `boundary.md` 的问题混进 su 的 F6 解释里。

## 六、旧格式兼容（独立问题，单独处置）

### 6.1 事实

- `resolve-role.ts:100` 与 `finalize.ts:68` 的枚举顺序都是 `boundary.yaml` → `boundary.yml` → `boundary.md`；客户 7 个角色只有 `boundary.md`，所以会被当作旧版 Markdown 解析。
- `src/common/门禁引擎/boundary-parse.ts:75-127` 只解析 Section 1 表格；遇到 `conditional-directory` 时，`extractConditionSlug`（`:53-69`）只从**类型列**与**第 4 列起**收集候选 slug，**不读用途列（第 3 列）**。客户文件中的行形如：

  ```text
  | 条件目录 | `角色卡/testing/docs/` | 测试方案、问题记录与测试报告 |
  ```

  类型列只有「条件目录」，没有合法 slug ⇒ `:117-122` 直接 `continue`，**该行静默消失**。
- 即使补上 slug，`scope: undefined` 的聊天会话没有 `conditions` 声明，条件目录仍然**不激活**（`resolve-write.ts:32-38`）。所以「补 slug」并不能让日常聊天写进 `docs/**`；正确的迁移目标应是**普通 `directory`**（su 新建角色时的文档面指引也是普通目录，见 `boundary-core.ts` 的 `BUILT_IN_ROLE_CARD_TEXT` 文档面段）。
- 影响：S1/S2 下项目角色能写代码/测试路径，但 `角色卡/<id>/docs/**`、`memo.md`、`changelog.md` 等文档面写不进；拒绝文案可能是「目标路径未匹配任何边界条目」（条目被丢）或「命中条件目录但缺少条件」（条目存在但 scope 无 conditions）。

### 6.2 处置选项

| 选项 | 做法 | 优点 | 代价/风险 | 结论 |
| --- | --- | --- | --- | --- |
| 迁移到 `boundary.yaml` | 由角色属主/su 按标准文档面重写：代码/测试路径保留；`docs/design/` 等改为 `kind: directory`；补 `memo.md`/`changelog.md` 等标准文件 | 真正解决日常聊天写文档；格式与新建角色一致 | 需要内容决策（不是机械转写）；需要 pin 重扫；旧 `.md` 去留要定 | **推荐** |
| 加载时告警 | `listProject` 对 `.md` 边界增加 warning：「旧版 Markdown 边界，建议迁移；条件目录行缺 slug 会被忽略」 | 可见、不改变写权 | 需要解析器暴露「被丢弃行数」或至少按扩展名判断；告警可能被忽略 | **推荐（与迁移并行）** |
| 解析器对缺 slug 的条件目录整份报错 | 把静默丢弃改为 parseError，整个边界未接受 | 响亮 | 会把「文档面写不进」升级成「角色全部只读」，对现有项目更糟 | **不推荐** |
| 不使用（现状） | 无提示 | 零成本 | 客户已经踩到；文档面长期不可用 | 不足 |

### 6.3 与主问题的关系

- **独立**：治理记录（`.ans`）解决的是 su 的 F6；旧格式解决的是项目角色的文档面。两者可以分别修，也可以同一入口分两步做。
- **顺序**：先建治理记录再迁移，则 `.ans` 先 pin 旧 `boundary.md`，迁移后下一次 su settle 重 pin 新 `boundary.yaml`；先迁移再建记录，则 pin 直接落在 YAML 上。**推荐先建记录、再迁移**，因为建记录是解除 su 死局的必要步骤，迁移可以按角色逐步做。
- **不要自动转换**：迁移涉及「哪些路径应该是普通目录、哪些需要条件、哪些文档文件要补」，是角色边界内容决策，不能由解析器或迁移动作静默改写。迁移动作可以**生成草稿**供角色属主审阅，但不应直接覆盖原边界。

## 七、验收口径

> 以下为**实施后**的验收条件；本轮未实施、未测试。

### 7.1 主路径（B + C）

| # | 场景 | 操作 | 预期（可观察） |
| --- | --- | --- | --- |
| V1 | 状态识别 | 打开一个「有角色、无 `.ans`」的夹具项目 | 项目状态行/su 空态显示「尚无治理记录」与动作按钮；**导入/列出本身零写入**（前后目录树与文件 mtime 不变） |
| V2 | 成功建立 | 点击动作 → 预览 → 确认 | 写出 `角色卡/governance-boundary.yaml`、`.ans/project.json`、`docs/bootstrap-manifest.md`；`.ans` 可解析、`governanceBoundary.path` 非空、`acceptance.accepted === true`、pin 覆盖治理文档与全部角色边界；manifest 列出实际创建路径与 pin |
| V3 | su 解卡 | 重建/新开 su 会话，写入 `docs/su/memo.md` | `resolveWrite` 返回 allowed；实际落盘一次受控写入成功（或离线 gate 断言 allowed） |
| V4 | 角色不受影响 | 项目角色写各自代码/测试路径 | 与建立前一致 allowed；写 `src/**` 等边界外路径仍拒 |
| V5 | 取消零副作用 | 预览后取消 | 不产生 `.ans/project.json`、治理边界文档、manifest；目录树/mtime 与操作前一致；状态保持 |
| V6 | 失败零副作用 | 注入门禁拒绝（或只读目录）后确认 | 显示 `FinalizeResult.message` 原文；无部分文件；无 manifest；可重试 |
| V7 | 幂等 | `.ans` 已有效时再次打开 | 动作隐藏/禁用，文案「治理记录已存在」；无写入 |
| V8 | 不误用确认卡 | 在未接受边界上走 `request_confirmation` → `confirmed:true` → 重试写 | 仍 F6 拒绝；`.ans` 不因确认卡产生 |

### 7.2 负例与状态边界

| # | 场景 | 预期 |
| --- | --- | --- |
| N1 | `.ans/project.json` 损坏（非法 JSON） | 状态显示「治理记录不可用」；动作**不自动覆盖**；显式修复前零副作用；所有角色仍只读（fail-closed） |
| N2 | `.ans` 合法但 `accepted:true` 无 pin | 载入器降级未接受（`config-loader.ts:87-104`）；不得回退导入授权；修复前只读 |
| N3 | pin 不符 | 状态列出漂移文件；「核对并重新接受」必须显式确认；取消零副作用；不得自动 re-pin |
| N4 | S1b：治理边界文档已存在、无 `.ans` | 预览应显示「采纳既有治理边界文档」并列出其条目（它将成为 su 之后的边界）；不覆盖其内容；只有可解析时才允许采纳，坏 YAML 中止且零副作用；仍须操作者确认 |
| N5 | 角色目录缺 `role-card.md`/边界文件 | `finalize` 扫描跳过该角色（`finalize.ts:331-361`）；预览/回执如实列出实际 pin 的角色数；不凭空造角色 |
| N6 | 无任何可 pin 之物 | `nothing-to-pin`；零写入；回执说明原因 |
| N7 | 空项目 S0 | 既有创世行为逐字不变（导入 + 开启 su → 种子；首次收尾后写 `.ans`） |
| N8 | CLI `ans govern <目录>` | 既有行为逐字不变；可作为 S1 的兜底恢复 |

### 7.3 旧格式验收

| # | 场景 | 预期 |
| --- | --- | --- |
| L1 | 角色只有 `boundary.md` | `listProject` 显示「旧版 Markdown 边界」告警；不改变该角色写权 |
| L2 | `boundary.md` 条件目录缺 slug | 告警指出「条件目录行被忽略」（若实现能计数）；不得整份边界报错导致角色全只读 |
| L3 | 迁移为 `boundary.yaml`（docs 用普通 `directory`） | scope=undefined 的聊天可写 `角色卡/<id>/docs/design/x.md`；代码/测试路径不变；`src/**` 仍拒 |
| L4 | 迁移后 pin | 下一次 su settle 重 pin；新 `boundary.yaml` 被 pin 覆盖；旧 `boundary.md` 不再被采用（枚举顺序优先 YAML） |
| L5 | 不误伤 | 不把技能内置 `boundary.md` 的合法条件目录行当作错误；不改解析器对内置边界的既有行为 |

### 7.4 回归与证据

- 单测：状态判定（S0/S1/S1b/S3/S4）；`finalizeBootstrap` 成功/blocked/nothing-to-pin；取消零副作用；pin 覆盖；F6 原文保留 + 追加段；确认卡不能产生接受。
- 真机/桌面：用一个与客户同形状的夹具项目（7 个角色、只有 `boundary.md`、无 `.ans`）走完整流程；记录前后目录树、`.ans` 内容、manifest、su 受控写入结果。
- 诊断：成功/失败/取消分别有可区分的事件；不记录凭据；不把失败写成成功。
- 证据卫生：截图/日志/哈希与当轮基线绑定；不以「测试全绿」代替客户现场验证。

## 八、实施归属与分期（客户已批准主路径 B+C；分期建议供项目管理评审后派发，不是实施授权）

| # | 改动 | 内容 | 建议属主 |
| --- | --- | --- | --- |
| I1 | 状态检测 | `listProject`/桌面构造层区分「无 `.ans`」「`.ans` 无效」「pin 不符」；向渲染侧提供状态 | 门禁引擎 + 桌面窗口 |
| I2 | 显式动作入口 | IPC/公开入口；只在操作者点击时调用；取消/失败零副作用 | 桌面窗口 |
| I3 | 迁移机制 | 复用 `finalizeBootstrap`；一次性种子式边界；`FinalizeResult` 逐字回执 | 编排（+ 桌面窗口接线） |
| I4 | 预览与状态 UI | 项目状态行、su 空态、预览面板、成功/失败/取消文案 | 桌面UI |
| I5 | F6 回执 | 原因分类 + 恢复指引；保留首行；未知状态不猜 | 门禁引擎（+ 桌面窗口传状态） |
| I6 | 旧格式可见化 | `.md` 告警；被丢弃条件行计数（若实现）；不整份报错 | 门禁引擎 + 项目管理（文案） |
| I7 | 旧格式迁移 | 角色边界 YAML 草稿/迁移流程；普通目录 vs 条件目录的内容决策 | 治理/su + 各角色属主（按边界） |
| I8 | 测试 | 夹具（S0/S1/S1b/S2/S3/S4 + legacy）、负例、桌面 E2E | 测试角色 |

建议分期（客户 2026-10-17 已批准主路径 B+C；以下分期待项目管理评审定夺）：

- **V1（解除死局，主路径）**：I1（S1 检测）+ I2 + I3 + I4（最小状态行/空态/预览）+ I8 的对应用例。
- **I5（F6 回执指引）**：独立评估项——**由项目管理在评审中定是否并入 V1**；不并入时与 V2 同期跟进。
- **V1b（旧格式，独立授权）**：I6 + I7 + L1–L5；不随主路径自动获批。
- **V2（修复模式，独立）**：S1b 采纳既有治理文档；S3 显式重建；S4 核对并重新接受（必须显式、显示差异、绝不自动 re-pin）。

## 九、待客户决策项 vs 推荐默认

| # | 决策项 | 推荐默认 | 备选/说明 |
| --- | --- | --- | --- |
| 1 | 主路径（**客户 2026-10-17 已裁定**）：B+C 显式一步动作 vs A 自动创世 vs 内置常设治理写权 | **B+C（已批准，按此实施）** | A **不采用**，仅保留为文档化备选/降级（不得写成主路径或默认）；内置常设治理写权**已否决**（理由见 §3.8：混同职责与证据、掩盖 S3、接受证据失效、例外不终止）；实施待项目管理评审并拆发 |
| 1b | 是否把治理写权内置为 su 的常设权限 | **否（已否决）** | 见 §3.8；若未来出现新场景，仍走 B+C 显式动作 |
| 2 | 动作的授权来源如何登记 | 操作者本次点击；`.ans` 的 `source` 如实记录；不新增 `.ans` 免 pin 例外 | 若客户要求正式登记，按「操作者指令来源」登记，不按非-pin 例外 |
| 3 | 旧格式迁移是否并入同一动作 | **分开**；建记录后可给一个可选的「迁移旧边界」后续步骤 | 同一流程两步也可，但预览与授权要分开 |
| 4 | S3/S4 是否提供修复动作 | **提供，但必须显式核对/确认**；显示漂移文件；不自动 re-pin | 也可只文档化，交 CLI/人工 |
| 5 | 入口位置与是否模态 | **项目状态行 + su 空态**；不弹模态 | 导入时只做非阻塞提示 |
| 6 | F6 回执是否全局加恢复指引 | **能判定状态才加**；未知状态保留原文 | 需要把 `source.kind` 等状态传到回执层（实现决策） |
| 7 | 是否把 CLI `ans govern` 写进 UI/README | **写**（已存在的零代码恢复路径） | 需说明它需要 CLI 与模型配置 |
| 8 | 旧格式迁移的内容与属主 | **角色属主/su 按标准文档面迁移**；docs 用普通目录；不自动转换 | 迁移是边界内容决策，不是格式转写 |

## 十、明确边界

- 本提案原稿**未实施、未测试、未部署**（revision 2 仍为设计文档：客户已批准 B+C，但代码实施尚未开始）；没有改任何 `app/`、`src/`、`test/`、仓库 `docs/`、其他角色文件；没有改客户项目 `D:\work\vibe-code\codeagent`；没有运行需要凭据或真实网络的命令；没有 git 提交。
- 本轮只做了只读复核：源码、客户项目目录列表与一份 `boundary.md`、诊断日志的计数/路径统计（未外传日志内容）。
- 实施由项目管理按实际范围评审并派发属主角色（门禁引擎、编排、桌面窗口、桌面UI、测试）；客户对 B+C 的批准不自动等于批准旧格式迁移或其他分期。
- 旧格式迁移与主问题分开授权：主路径 B+C 已获批，但**不**自动等于批准批量改写 7 份 `boundary.md`（I6/I7/V2 仍待各自评审）。

---

本提案为**产品评估**：现场与根因已复核，候选路径与验收口径已成形；客户 2026-10-17 已裁定**按 B+C 实施**（显式一步动作 + 应用侧复用 `finalizeBootstrap`），A 不采用（仅文档化备选）、D 作为文档化兜底，E/F/G 明确拒绝。代码实施尚未开始，待项目管理评审与拆发。相关产品导航见[产品功能导航](../../feature-map.md)；沿用的先例＝[G-1 契约提案](2026-10-16_design_contract-workflow-dispatch.md)（如实口径）、[G-4 提案](2026-10-16_design_role-capability-install.md)（先落盘再激活/不绕门）、[G-5 提案](2026-10-16_design_reasoning-and-effort.md)（默认态与失败面诚实）。
