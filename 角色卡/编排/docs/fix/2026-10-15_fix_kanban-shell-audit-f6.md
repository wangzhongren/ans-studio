---
id: fix-kanban-shell-audit-f6
type: fix
title: shell 闸审计在创世过渡窗口内未落盘（F6 拒绝一切写入）修复提案
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: proposed
revision: 1
related: [shell-gate, shell-audit, finalize, kanban-runtime-fixes-dispatch]
---

# shell 闸审计在创世过渡窗口内未落盘（F-6）修复提案

> **状态：未实施 / 未测试**。本文只写提案：不改 `src/`、`app/`、`test/` 任何代码；不 git 提交；不改 kanban-live 项目与测试角色证据目录下任何文件。根因定位全部为只读核对；拿不准处标「待确认」。
>
> 来源：派发文档 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-runtime-fixes-dispatch.md` F-6（P1，属主：编排）。

## 一、问题与证据

### 1.1 现象

2026-10-15 kanban-live 真机测试轮应用日志中，「shell 闸审计未落盘：审计写被门禁拒绝（缺少 ``shell-gate`` 条件？）：边界未被接受或缺少证据来源（F6）：拒绝一切写入。」共出现 **17 次**。

证据文件（**实际路径在证据目录顶层**，非任务书写的 `raw/` 之下；`raw/` 内为其它证据）：

- `角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/app-redacted.log` 第 24、31、32、33、45、59、61、75、77、85、93、101、102、110、111、112、120 行（共 17 行，逐字一致）。
- 对照：真机目标项目落盘的审计文件 `/Users/wangzhongren/code/vibeingcode/ans-testbed/kanban-live/docs/audit/shell-gate.jsonl`（**只读引用，未改动**），53 条，时间跨 13:17:05–13:57:17（UTC）。

### 1.2 对差结论（失败=丢条，一一对应）

以三个会话 replay（`kanban-live/.ans/sessions/{su,实现者,测试者}/pi/ans/replay.jsonl`）中 `run_shell` 的 `tool_call` 起点事件（toolCallId）与审计文件条目对差：

| 会话 | run_shell 调用 | 落审计 | 缺失 |
|---|---|---|---|
| su | 12 | 12 | 0 |
| 实现者 | 26 | 9 | **17** |
| 测试者 | 32 | 32 | 0 |
| 合计 | 70 | 53 | 17 |

**缺失的 17 条与 17 行 stderr 完全对应**（数量 17=17，且无「有 stderr 但条目在」或「条目缺却无 stderr」的错位）——每个 stderr 行 = 一条被拒的审计写 = 一条实际丢失的审计条目，失败期间未发生半写或误报。

缺失条目全部来自**实现者会话**，窗口 **13:21:39.359Z – 13:27:23.427Z**（恰为其第一轮全部外壳命令：find/ls/node --test ×6/selfcheck/npm test/grep ×2 等，即产出「第一版」那批命令）。su、测试者全程无缺口。

### 1.3 复现触发条件（时序，全部有据）

| 时刻（UTC） | 事件 | 证据 |
|---|---|---|
| 13:16:24.071 | su 会话创建（空项目，`hasRoles=false`，桌面置 `genesisBootstrap`） | `su/pi/ans/index.json` |
| 13:17:05.46 | su 读 `角色卡/governance-boundary.yaml` → **ENOENT**（当时不存在） | su replay；此时审计仍成功（用创世种子边界，acceptance 已接受） |
| 13:17:53 → 13:21:09.055 | su 请求确认 bootstrap 方案 → 客户接受 | su replay（request_confirmation 执行完成） |
| 13:21:29.49–.54 | su 写出 `角色卡/实现者/boundary.yaml`、`测试者/boundary.yaml`、角色卡、docs（**没有**写治理边界文档） | su replay；两 boundary.yaml mtime 13:21:29 |
| 13:21:38.351 | su `dispatch_task` 派发给实现者（J-1 写入后立即派发） | su replay |
| **13:21:38.390** | **实现者会话创建**（投递目标） | `实现者/pi/ans/index.json` `createdAt` |
| **13:21:39.359** | 实现者第一条 `run_shell` → **第 1 条审计失败** | replay + app 日志行 24 |
| **13:21:42.567** | su 回合 settled → 编排**首次自动收尾**写出 `角色卡/governance-boundary.yaml` + `.ans/project.json`（acceptance+pin）+ manifest | su replay settled；governance-boundary.yaml mtime 13:21:42；finalize 写出物形状与 `.ans/project.json` 逐字段吻合（acceptance.source=创世来源、pins=gov doc+实现者+测试者三份、当前哈希与文件一致：`a19ee561…`/`867520…`/`07b084…`） |
| 13:21:42.973–13:27:23.427 | 实现者 16 条命令继续失败（第 2–17 条） | replay + app 日志 |
| 13:27:42.51 | 实现者回交「第一版完成」到 su | su replay |
| 13:35:35.465 | 第二轮派发（DEF-001 返工）到达实现者 | 实现者 replay |
| 13:39:31.140 起 | 实现者第二批命令**全部落审计**（9 条） | 审计文件 |

即：**实现者会话创建于「su 写完角色边界之后、首次自动收尾写入 `.ans`/治理边界文档并记录验收之前」的约 13 秒创世过渡窗口内**，其取到的边界快照未接受；快照在会话生命周期内保持，直至会话重建（13:35:35 投递或之后、13:39:31 之前——**具体重建触发点属桌面窗口行为，待确认**）才恢复。

### 1.4 影响评估

- **留痕缺口真实存在**：上述 17 条已执行命令在 `docs/audit/shell-gate.jsonl` 中无任何条目；实现者第一轮（交付第一版）的外壳命令历史整体缺失。审计文件对「外壳命令留痕」的可核查性在该窗口内被破坏：事后仅能凭 replay/应用日志间接推断命令存在，审计侧无记录。
- **范围有限且可界定**：仅影响「在创世过渡窗口内首次创建、且随后未重建」的会话（本轮=实现者一个会话、6 分钟）；su/测试者不受影响；已 bootstrap 项目稳定运行时不触发。
- **判定未受损**：审计失败不翻转审核判定（shell-gate.ts:609-610 注释所载既有语义）——命令照常按 (c)/(b)/(a) 链放行/拒绝，只是「审计未落盘」。这不是安全的静默降级，但是**留痕**的静默缺口：stderr 只进应用日志，界面不呈现。

## 二、根因（只读定位，完整判定链）

### 2.1 审计写的通道

1. 每条 shell 审核结束后：`src/common/编排/shell-gate.ts:612` 调 `audit(req, outcome, now())`；`audit()`（同文件 616–635）组装记录后调注入的 `ShellAuditSink.append`（630）。
2. 缺省 sink 由 `buildShellGate`（shell-gate.ts:683–692）构造：`createFileAuditSink({ projectRoot, gate: buildShellAuditGate(pmBoundary, ctx) })`。**`pmBoundary` 是装配时传入的边界对象**（壳外快照）。
3. `createFileAuditSink.append`（`src/common/编排/shell-audit.ts:98–124`）：先经 `opts.gate(abs)` 判定（唯一授权点，调用前不碰文件系统，101–113）；被拒即返回 `{ok:false, reason:"审计写被门禁拒绝（缺少 `shell-gate` 条件？）：…"}`（**112 行**）；放行才 mkdir+appendFile（117–118）。
4. `buildShellAuditGate`（shell-audit.ts:33–43）：以 `resolveWrite(p, pmBoundary, {writeSet:[docs/audit/shell-gate.jsonl], conditions:["shell-gate"]}, ctx)` 判定——授权物 = **pmBoundary 快照** + 声明的条件。
5. 失败上报：`shell-gate.ts:631` `process.stderr.write("shell 闸审计未落盘：…")`——**每条被拒审计打印一次**，无去重、无界面呈现。

### 2.2 为什么是「F6：边界未被接受或缺少证据来源」且没有 parseError

`resolveWrite`（`src/service/gate/resolve-write.ts`）判定次序：先 `parseError`（72–75，文案会是「边界解析失败：…」），再 F6（77–81）：

```ts
const acc = boundary.acceptance;
if (!acc || acc.accepted !== true || typeof acc.source !== "string" || acc.source.trim() === "") {
  return deny("边界未被接受或缺少证据来源（F6）：拒绝一切写入。", boundary, scope);
}
```

现场文案是**F6 且不带「解析失败」前缀** ⇒ 传入的 pmBoundary **无 parseError、acceptance 未接受**。无 parseError 的未接受边界只有两类：

- `builtInBoundarySection()`（`src/common/门禁引擎/boundary-core.ts:161–167`，`acceptance:{accepted:false,source:""}`、无 parseError）——`resolveBoundarySection` 第 4 步（boundary-core.ts:399–438）的回退；**本次即此**（见下）；
- 装配侧 `NO_AUDIT_BOUNDARY`（shell-arming.ts:47–52）——需 `listProject`/`resolveRole` 失败，本次无该迹象（su 会话同刻解析正常），排除。

**快照为何解析到第 4 步**（su 的边界解析路径：装配 `resolveGovernanceBoundary`（shell-arming.ts:204–227）枚举内置角色 su → `resolveRole("su")` → `resolveBoundarySection("su", project)`）：

- 第 1 步（项目角色覆盖）要求 `project.roles["su"]`——su 是内置角色、**从不进 roles 映射**（`app/desktop/project.ts:80–90`），恒跳过；
- 第 2 步（治理边界覆盖）要求 `governanceBoundary.path` 非空——**实现者会话创建时（13:21:38.39）`.ans/project.json` 尚不存在**，桌面 `buildEffectiveProjectConfig`（app/desktop/project.ts:169–182）此时取 `loaded.project.governanceBoundary?.path ?? ""` = **空串**（L179），跳过；
- 第 3 步（有界创世）要求 `project.genesisBootstrap`——桌面**只在 `hasRoles===false` 时设置**（project.ts:110–115）；13:21:29 su 已写出两个角色 ⇒ `hasRoles=true` ⇒ 无 genesis，跳过；
- 落到第 4 步 → `builtInBoundarySection()`：entries=内置技能条目、**acceptance 未接受** → F6 拒一切写入。

对照：实现者角色**自身的写门禁**不受影响（第 1 步对「项目角色」在其 `loc.boundary` 存在且 gov.acceptance 已接受——桌面运行期同意——时走 `loadBoundaryFile(角色卡/实现者/boundary.yaml, …, consent)` 得已接受边界），故实现者能正常写文件、只是**审计通道**（走 su 的治理边界）被拒。这解释了现场「角色工作正常、只有审计未落盘」。

### 2.3 失败的重复由什么触发

- **不是**每个 prompt、**不是**每会话重建本身：是**该会话内每一条被审核的 run_shell 命令**触发一次（审核结束处的 audit append，shell-gate.ts:612→631）。实现者会话在 13:21:39–13:27:23 共 17 条命令 ⇒ 17 行 stderr、17 条记录缺失。
- **根触发**是**会话构造时的一次性快照**（`buildShellGate(pmBoundary=…)` 把边界对象闭包进 sink；shell-gate.ts:683–692、shell-audit.ts:42）。快照解析发生在创建瞬间（13:21:38.39，处于创世过渡窗口），此后判定的依据不再更新。
- 收尾在 13:21:42.567 写出 `.ans` + 治理边界文档 + pin 后，**新**会话（e.g., 测试者 13:28:32 创建）解析正常；但**已存在的**实现者会话快照不刷新 ⇒ 继续失败至会话重建。同类「旧快照」现象在写门禁侧已有登记（resolve-write.ts:164–181 的提示与桌面 O-1 交互时重建注释）；审计通道此前没有等价的恢复机制。

### 2.4 根因一句话

「实现者」会话在 su 首次自动收尾（写 `.ans`+`角色卡/governance-boundary.yaml`+pin，13:21:42.567）之前约 4 秒创建（13:21:38.390），构造快照的 `governanceBoundary.path=""` 使 su 边界解析落到**未接受的内置边界**；审计写门禁经 F6 拒绝一切写入，且该快照在会话生命周期内**无自愈通道**——每条约审命令打印一次「未落盘」并丢失审计条目，直至会话重建。

## 三、最小拟改动（保持安全语义）

### 3.1 F-6-1（必需）：审计写「刷新重试」——被拒时重读盘上验收并重试一次

**不改判定链**：写入仍唯一经 `resolveWrite`；fail-closed 保持——重试只有在「**盘上**治理边界已被接受且过 pin 校验」时才可能放行；重解析失败或仍拒 → 维持拒绝、零副作用（重试发生在触碰文件系统之前，与现状同）。

**文件与落点（均在编排 Section 1 边界内）**：

1. `src/common/编排/shell-audit.ts`（`createFileAuditSink`，89–125）：
   - 新增可选 `refreshGate?: () => Promise<WriteGate | undefined>`；
   - `append()`：首查被拒且提供了 `refreshGate` 时，重解析一次、以新 gate 重试一次；**重试放行 → 落盘并把活跃门禁切换为新 gate**（后续命令直接走新 gate，恢复后零额外开销）；**重试仍拒 → 返回新原因**（如实反映盘上现状）。不改变 `append` 返回形状（`ShellAuditOutcome`）。
   - 拒绝文案（112）去掉错误的「（缺少 ``shell-gate`` 条件？）」猜测（现场即反例：条件已声明、缺的是**接受**）：改为 `审计写被门禁拒绝：<resolveWrite 原文>`。
2. `src/common/编排/shell-gate.ts`：
   - `ShellGateBuildDeps`（650–681）新增可选 `auditBoundaryRefresh?: () => Promise<BoundarySection1>`；
   - `buildShellGate`（683–692）：缺省 sink 构造时把它包装成 `refreshGate`（`buildShellAuditGate(await auditBoundaryRefresh(), ctx)`）。**缺省不传 = 逐字节现状**（旧行为为缺省路径）。
3. `src/pipeline/orchestration/shell-arming.ts`：
   - `assembleProjectShellGate`（95–134）与 `assembleReadonlyShellGate`（171–193）各自注入刷新闭包：`loadEffectiveConfig({ projectRoot, skillRoot, fallback: project })`（**共享载入器只读导入**——工程法案 §一.5 消费方名单已含编排；`src/common/编排/finalize.ts:61` 有同源导入先例）→ 对 `loaded.project` 复用**同一个** `resolveGovernanceBoundary`（含 `roleIdOverride`）→ 返回 boundary。刷新读取的是**盘上 `.ans/project.json` 的最新验收**，而非会话快照。复用既有解析，不造第二份。

**对本次事故的预期效果（分析，未测试）**：17 条中 **16 条可自动恢复**（13:21:42.973 起，`.ans` 已落盘）；仅第 1 条（13:21:39.359，物理上尚不存在任何已接受授权）不可恢复——这是 fail-closed 的应有结果，不改写。

### 3.2 F-6-2（必需）：失败提示去重 + 如实的降级语义

1. `src/common/编排/shell-gate.ts` `audit()`（616–635）：对同一 gate 实例按 reason 去重——首个完整打印一次，相同 reason 重复不再逐条打印；reason 变化后再报一次；恢复落盘后打印一行「已恢复落盘」（可选）。**判定不受影响**（保持「审计失败不翻转判定」的既有语义）。
2. 重试仍失败的提示在 sink 侧如实拼接链式原因（原判 + 重解析后仍拒），不加猜测性归因。
3. 净效果：本次事故的 17 行噪音 → 1 行失败 + 1 行恢复（如实现恢复提示）。

### 3.3 fail-closed 保持清单（改动不得触碰）

- 审核链 (c)/(b)/(a)、四态映射、超时/不可用→拒：**逐字不变**；
- 审计下沉唯一授权点仍是 `resolveWrite`（含 F6/pin/条件/writeSet 全链）；重试**不绕过**任何一步；
- 「审计失败不翻转判定」「gate 拒绝=零副作用（不建目录、不 open）」：不变；
- su 只读档语义：不变（仅审计通道同样获得刷新能力）。

## 四、必需项与可选加固项

| 编号 | 类别 | 内容 | 理由/收益 | 成本/风险 |
|---|---|---|---|---|
| **F-6-1** | 必需 | 审计 sink 刷新重试（§3.1） | 直接消除留痕缺口：过渡窗口后的命令自愈落盘（本次事故 16/17）；恢复无需等会话重建 | 3 文件、2 个可选参数；被拒路径每次多一次盘上重解析（量小、可接受）；安全语义不变 |
| **F-6-2** | 必需 | 提示去重 + 如实话术（§3.2） | 噪音 17→1；文案不再误导排查（缺的是接受不是条件） | 文案变更；日志检索前缀保留 |
| **F-6-opt1** | 可选加固 | 审计失败（去重后）向既有诊断通道记一条 `shell.audit.failed`（`createDiagnosticLogger`，字段用既有白名单如 `ok/reasonCode`；稳定归因码如 `audit-gate-denied`） | 让降级可被诊断存储/未来 UI 消费（当前 stderr 只进应用日志） | 新增事件名与归因码需测试钉住；如要求在 UI 呈现，属桌面窗口 |
| **F-6-opt2** | 可选加固（跨边界，只登记） | 桌面窗口在 `.ans/project.json` 验收变化/首次收尾完成时**主动重建**持有旧快照的会话（现状仅「交互时机」自愈——resolve-write.ts:164–181 注释所载 O-1） | 从根上缩短一切旧快照（写门禁+审计）存活窗口（本轮实现者快照存活约 6–14 分钟） | 属桌面窗口边界；需其属主评估 |
| **F-6-opt3** | 可选（需客户裁定） | su「写入后立即派发」（J-1）与「settle 后自动收尾」的 ~4 秒先后——是否要在产品层消除（如收尾完成后才投递） | 消除窗口本身 | 触碰 J-1 语义与跨角色（Pi适配器/桌面窗口）次序；不建议本轮随 F-6 做 |

**不列入**：任何绕过 F6 或放宽 pin 校验的「便捷写」；任何在审计不可写时改动审核结果/执行语义的改动（见 §六 待裁定 1）。

## 五、测试计划（test/编排/，既有扩展点）

先只读核对了既有用例：`test/编排/shell-gate.test.ts`（审计专节 ~167–259：`makePmBoundary()` 夹具、`buildShellAuditGate`/`createFileAuditSink` 直连、mkdtemp 临时根、负例「缺条件→零副作用」）、`shell-arming.test.ts`（`makeTempProject` 夹具 38–56、装配助手 `assemble()` 72–95、审读桩 `reviewStub`）、`shell-review-chain.test.ts`（memory sink 大批链级用例）、`shell-readonly.test.ts`、`runtime-orchestration.test.ts:290–295`（审计 sink 一条断言）。均为假件、不真跑命令——拟沿此风格。

**拟新增用例（编号稳定）**：

- `shell-gate.test.ts` 扩展：
  - F-6-T1 刷新恢复：未接受 pmBoundary + `refreshGate` 返回已接受边界 → 首查拒 → 重试 → 追加一行；断言文件存在、字段齐备（toolCallId/branch/by/conditions 含 `shell-gate`、execution=未执行）。
  - F-6-T2 缺省无刷新 = 现状：未接受边界、无 `refreshGate` → 拒且零副作用（与既有负例同断言风格：不建目录、无文件）。
  - F-6-T3 刷新仍拒（模拟收尾前）：refreshGate 返回另一份未接受边界 → 拒、零副作用、原因含两段事实（原判+重解析后仍拒）。
  - F-6-T4 去重：连续 N 条同一 reason 失败 → `process.stderr.write` 捕获恰 1 行（临时替换、try/finally 恢复、注意并发测试隔离）；恢复后再失败 → 再报一次。
  - F-6-T5（如做 opt1）诊断事件恰一条、字段在白名单内。
- `shell-arming.test.ts` 扩展（**事故回归 E2E**，复刻 13:21:38 场景）：
  - F-6-T6：项目配置 `governanceBoundary.path=""`（模拟会话在收尾前创建）→ `assembleProjectShellGate` → 审核一条 → 断言审计未落盘（零副作用）；随后在临时根写入 `角色卡/governance-boundary.yaml`（复用 `finalize.ts::renderGovernanceBoundaryDoc()`）与 `.ans/project.json`（pin=当场 sha256，形状对齐 config-loader；可用 `node:crypto` 计算）→ 再审一条 → **断言审计条目落盘**（F-6-1 生效）；对照组：不注入刷新闭包时第二条仍不落盘（旧行为）。
  - F-6-T7：su 只读档同接线（`assembleReadonlyShellGate`）走一遍恢复。
- 回归：`test/编排/` 全量（含 `shell-review-chain`/`shell-readonly`/`runtime-orchestration` 既有审计断言不得变红——缺省路径逐字不变）。
- 命令与口径：`node --test "test/编排/*.test.ts"` + `npm run typecheck`；全量 `node --test "test/**/*.test.ts"`（**已知基线 2 红**：检出目录名 ans-cli 断言、macOS /var 符号链接——非回归）。
- 真机复验（实施后、由测试角色/客户安排）：空文件夹 bootstrap → 在 su 派发后紧接与实现者互动跑一条命令 → 观察应用日志无「未落盘」批量重复、`docs/audit/shell-gate.jsonl` 条目连续。

## 六、跨角色影响（只读定位；不改）

- **门禁引擎**：F-6 判定在 `src/service/gate/resolve-write.ts:72–81`；pin 校验/未接受回退在 `src/common/门禁引擎/boundary-core.ts:193–195、219–239、290–299、399–438`。**无需改动**——F-6-1 消费其既有语义（重试同样过这些判定）。
- **桌面窗口**：会话配置快照与创世切换在 `app/desktop/project.ts:69–126、169–182`（`hasRoles` 切换、`gov path ?? ""`）、调用点 `app/desktop/session.ts:836`；旧快照「交互时重建」的 O-1 行为由桌面持有（resolve-write.ts:164–181 注释登记）。F-6-opt2 属其边界，本角色只登记。另「实现者会话具体在何时被重建」（13:35:35 投递时或其后）**待确认**，需桌面窗口核对。
- **装配/项目管理（共享 config-loader）**：F-6-1 只读导入 `loadEffectiveConfig`（`src/common/shared/config-loader.ts:254`）——该模块消费方名单已含编排（工程法案 §一.5），且 `finalize.ts:61` 已有同源导入先例；不新增共享组件，不改该模块。
- **Pi适配器**：无涉（审计在编排装配的评审收口处；`run_shell` 注册/执行不在本修复内）。
- **测试角色**：证据目录与 kanban-live 项目文件只读引用；真机复验安排归其/客户。

## 七、风险与回滚

- **风险1（实现）**：刷新闭包依赖盘上 `.ans` 读取——被拒路径每次多一次 `loadEffectiveConfig`（含 pin 校验时的少量文件哈希）；仅在降级状态下发生，成功恢复后切活跃门禁不再重读。可接受；如实现评审认为量大，可加「≥1s 节流」微优化（非必需）。
- **风险2（语义）**：恢复落盘的条目其「授权边界」晚于审核时刻（审计条目本身不含边界版本；conditions/branch/by 照录）。「docs/audit/ 是治理边界覆盖的授权路径」这一事实不因验收时间变化；如客户要求审计可反推授权版本，属另案（可在记录中加 boundarySource 摘要——默认不做）。
- **风险3（文案）**：拒绝文案变更影响日志检索习惯——保留「shell 闸审计」前缀；证据文档中的旧文案以本文存档。
- **回滚**：改动集中在 3 个文件、2 个新增可选参数 + 一处文案/去重；移除参数即回到旧行为（缺省路径逐字未动），无数据迁移、无契约变更（`ShellAuditOutcome`/`ShellAuditRecord`/`ShellGate` 形状不变）。

## 八、待客户/协调裁定项

1. **审计不可写时的执行语义**：现设计「审计失败不翻转判定」（命令照常执行）——本次事故因此产生 17 条「已执行但无审计」命令。**保持现状**（本提案默认）还是改为「审计不可写 → 命令不放行」？（后者触碰审核语义与冻结形状，属另案。）——**需客户裁定**。
2. 过渡窗口内的**物理不可恢复条目**（本次 1 条）——接受为 fail-closed 的应有残留？——**请客户知悉确认**。
3. F-6-opt2/opt3 是否随 F-6 一并排期协调给桌面窗口/后续。**待协调**。

## 九、状态

**未实施 / 未测试**。本文档为提案轮交付物；代码改动、测试新增与任何命令运行均未发生。实施须经项目管理评审并呈客户批准，由编排角色在自身 Section 1 边界内落地。
