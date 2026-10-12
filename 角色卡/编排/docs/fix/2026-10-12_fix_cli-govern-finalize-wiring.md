---
id: cli-govern-finalize-wiring
type: fix
title: 让 ans govern <目录> 的创世 bootstrap 能收口（.ans + 治理边界文档真落盘）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [govern-target-boundary-fix]
events:
  - date: "2026-10-12"
    kind: created
    summary: 受装配提案（govern-target-boundary-fix）第 150 行请求，评估 O1 对编排侧影响时确诊——CLI govern 的收口链两处入口均不存在（finalizeBootstrap 无人置真、finalize_bootstrap 工具从未注入）；给出最小接线提案，待客户确认后实施
  - date: "2026-10-12"
    kind: implemented
    summary: 客户批准 M1+M2 后实施——govern.ts 创世 arming（genesisBootstrap 在 ⇒ finalizeBootstrap:true）+ GovernDeps.operatorChannel 透传；新增 test/编排/govern-finalize-wiring.test.ts（6 例）
  - date: "2026-10-12"
    kind: verified
    summary: test/编排 145/145（+6）；全量（排除已实测红的装配第 7 例）686 计/683 过/2 红（既有环境红）、typecheck 0 错；装配第 7 例红态与「子进程挂起」已实测并按协调顺序交由装配随后补通道桩
  - date: "2026-10-12"
    kind: superseded
    summary: 客户同日裁定「去掉收口」——本文接线的 finalizeBootstrap arm 随 A-4 下线；收口改「客户确认后自动收尾」，见 change/2026-10-12_change_governed-interaction-a3-a4.md
---

# `ans govern <目录>` 的创世 bootstrap 在 CLI 走不完：收口接线提案

> **⚠ 已被同日改动取代（2026-10-12）**：客户随后裁定「**客户确定了才加，不要有个收口，收口去掉**」——本文接线的 `finalizeBootstrap` arm（`govern.ts`）已随 **A-4 下线**；「提议+确认」整段删除，收口改为「**客户经交互工具确认后，代码自动收尾**」。取代记录见 [`../change/2026-10-12_change_governed-interaction-a3-a4.md`]。本文其余内容保留为**当时**的记录（其时的行为与证据均真实）。
>
> **状态：已实施、已验证（2026-10-12，客户批准 M1+M2 后照本文实施）。** 下方「用户会看到什么」的「改后」段即实际行为；「实际测试与证据」节给出落盘命令与实测结果。**真实模型端到端**（真 su 建角色 → 提议 → 确认）仍属「客户跑」（设计 §12.6 / §13.5），不在本角色自动验收内。
>
> 背景：装配已获客户批准 M1（修复目标目录边界错配）+ M2（回归测试）+ **O1**（给外来目录 + 无 `.ans` 的回退配置补 `genesisBootstrap`，见装配 `docs/fix/2026-10-12_fix_govern-target-boundary.md` §选装 O1）。O1 落地后，`ans govern <空目录>` 里 su **能写出**角色卡等治理产物——但**收口**（写 `.ans/project.json` + `角色卡/governance-boundary.yaml` + `docs/bootstrap-manifest.md`）在 CLI 下**没有任何入口可到达**。本文即补上这一环。
>
> 本角色尚无 `feature-map.md` 与 `docs/feature/`（既有缺口），本文暂无功能文档可回链。

## 用户会看到什么

**改前**（O1 落地后、本接线未落地时）：在空目录上跑 `ans govern <空目录>`，su 真的建出了 `角色卡/X/…`，命令**正常退出（码 0）**——但目录里**没有** `.ans/project.json`、没有 `角色卡/governance-boundary.yaml`、没有 `docs/bootstrap-manifest.md`：

```bash
mkdir -p /tmp/ans-new-proj
node --env-file=.env bin/ans.js govern /tmp/ans-new-proj
# su 写完角色卡 → 命令退出 0
ls /tmp/ans-new-proj/.ans        # 不存在 —— 项目没有 pin、没有正式治理边界文档
```

项目永远停在「创世态」，没有开始、也没有结束。**这比报错更隐蔽**：命令看起来做完了它被记录在案的用途（`ans help` 第 225 行、README 命令表都写着「对目标目录发起 bootstrap」），实际只完成了前半截。

**改后（实际，已实施）**：同一命令在 su 完成一轮之后，会**向操作者提议收口**并读一行 y/n——确认后把 `.ans`（pin）+ 治理边界文档 + 留痕 manifest 写进目标目录，项目由「创世态」进入「正式态」；拒绝 / 超时 / 无人值守（stdin EOF）→ **不完成**、零副作用、命令非 0（fail-closed，不假装成功）。`.ans` 的 acceptance 来源如实记录为「客户确认完成 bootstrap（operator:…）」——确认才是把项目推入正式态的动作（`finalize.ts:280`）。

对照（桌面）：同一件事桌面今天**已经能做完**——桌面在创世 su 会话上带 `genesisFinalize`（`app/desktop/session.ts:274`），界面「完成 bootstrap」按钮显式调 `handle.finalize()`（`app/desktop/interface.ts:280-281` → `app/desktop/session.ts:416`）。CLI 缺的就是这颗按钮的等价物。

## 根因（已核对到源码；两处入口都不存在）

收口链的完整形状（已就位、已测试，无需改）：`runGovernSession` 单轮 settle 后**仅当** `input.finalizeBootstrap === true` 才调 `handle.finalize()`（`src/pipeline/orchestration/govern-session.ts:293-313`，调用点在 `:301-302`）；`finalize()` = 提议收口 → 挂起等客户确认（缺省 `createCliOperatorChannel()`，`:260-261`）→ 恰好 allow 才落盘（`src/common/编排/finalize.ts:238-283`）。

接线前的缺口就出在把它接通的两处入口（下述行号为**接线前**的代码；修复后的落点见「实际改动」）：

1. **前端不传开关。** `governCommand` 调 `runGovernSession` 时只传 `{ taskId, project, targetRoleIds, targetDir }`（`src/interface/cli/govern.ts:84-87`）——**没有** `finalizeBootstrap`。`GovernDeps`（`govern.ts:31-38`）也没有承载它的字段。全仓核对（grep `finalizeBootstrap` 设置点）：`src/**`、`app/**` **无一处**置真，只有 `test/编排/finalize.test.ts:520-548` 直调 `runGovernSession` 时置真——`govern-session.ts:301` 在真实 CLI 里是**死码**。
2. **模型工具从未注册。** 设计 §13.1 的 `finalize_bootstrap` 工具按「能力注入才注册」纪律实现（`src/provider/pi/session.ts:187-190`、`src/provider/pi/tools.ts:607-613`）——**未注入即根本不存在**。而 `createPiAdapterFactory`（`src/pipeline/orchestration/run-role.ts:390-401`）只传 `gate/projectRoot/skillRoot/shellGate`，govern 用它构造适配器（`govern.ts:76`）——故 CLI 下 **su 也无法在轮内主动提议收口**。

两条入口都没有 ⇒ `ans govern <目录>` 的 bootstrap 只能写角色卡、写不了收口产物。旁证：装配提案已在 `:150` 请求本角色评估「CLI 的收口确认通道」。

### 为什么桌面不受影响

桌面不走这两个入口：它经 `openRoleSession` + `genesisFinalize` 开句柄（`app/desktop/session.ts:296-308`），由**界面按钮**触发 `finalize()`，确认走桌面注入的对话框通道。CLI 的缺口是「没有触发面」，不是机制缺失。

## 实际改动（只动 Interface 一个文件，未碰 `pipeline/**`）

**M1（已实施）——`src/interface/cli/govern.ts`：**

1. **arming**：当装配注入的 `deps.project.genesisBootstrap` 存在时，向 `runGovernSession` 传 `finalizeBootstrap: true`（实现 = 条件展开，`govern.ts:113`）。判据取「注入配置带 `genesisBootstrap`」而不是在本层重算「目标目录 ≠ 自身 && 无 `.ans`」——那三个条件正是**装配** M1+O1 设置该字段的全部前提（装配 fix 文 `:82-91`、`:110-118`）；编排重算等于第二份装配逻辑，违背本文件既有的「配置单一来源在装配、编排不自备副本」纪律（`govern.ts:61-68`）。
2. **新增可选 `GovernDeps.operatorChannel`**（`govern.ts:44`；条件透传在 `govern.ts:115`），缺省机制不变——前端仍自动补 `createCliOperatorChannel()`。理由：a) 与既有的 `createAdapter / targetRoleIds / targetDir` 同为「deps 可选字段扩展」的既有先例（`govern.ts:31-38`）；b) 测试要**确定性**验证「确认通过 → 落盘」与「拒绝 → 零副作用」，不能依赖进程 stdin；c) 与桌面把确认通道经 deps 注入 `openRoleSession` 的做法同形（`app/desktop/session.ts:303-308`）。

**M2（已实施）**：新增 `test/编排/govern-finalize-wiring.test.ts`（6 例，见「实际测试与证据」）。

**未改 `src/pipeline/**`：** `runGovernSession` 的 `finalizeBootstrap` 开关、收口提案、确认、守卫、fail-closed 已全部就位并各有测试（`test/编排/finalize.test.ts:520-548`、`test/编排/genesis-finalize-reach.test.ts`）；`finalize.ts` 的每笔写仍经 `resolveWrite`（`finalize.ts:367-368`、`:425-427`、`:465-467`），分层与「不绕门」均无需变动。`run-role.ts` 的适配器工厂未动（未走模型工具路线，见「备选做法」）。

**分层检查**：只改 Interface 层一个文件；读的是装配注入的纯值，透传既有开关，不新增任何判定；收口判定/写入全在既有 `finalize.ts`。

## arming 条件（一句话）

**目标目录 ≠ ans-cli 自身、且为内置回退（无 `.ans`）、且装配已带 `genesisBootstrap`**——这三条由装配 M1+O1 在注入时一次性保证；编排侧只认它的呈现：`deps.project.genesisBootstrap !== undefined` 时 arm。三种对照场景（均**不** arm，行为逐字不变）：

- `ans govern`（**不带目录**）：项目 = ans-cli 自身，M1 的「自身判定」不触发重置 ⇒ 演示配置无 `genesisBootstrap` ⇒ 不 arm；
- `ans govern <已有 .ans 的目录>`：配置来自该目录的 `.ans`（`configSource.kind === "ans"`），M1 分支不发生 ⇒ 不 arm；
- `ans govern <ans-cli 根>`：同上「自身」⇒ 不 arm。

**为什么不能无条件 arm（本角色已核对的具体后果）：** 不带目录时，演示配置的 `governanceBoundary.path = "角色卡/门禁引擎/boundary.yaml"`（`src/index.ts:120`）非空，`govern-session.ts:187` 的 `||` 兜底不生效、`govPath` = 门禁引擎边界；若 arm，finalize 会把这本「治理边界文档」的正文**往门禁引擎的边界文件上写**。门禁会在前置全量求值阶段拒掉（`finalize.ts:362-381` 对每条待写路径先求 `resolveWrite`）→ blocked、零副作用——但命令会在 settle 之后**从今天的退出码 0 变成非 0**，把一个当前正常工作的入口弄红。故 arming 必须与「创世」严格同界。

**已登记的尖角（承接装配 fix 文 `:78`）：** 符号链接 / 尾斜杠写法会让「自身」被 M1 判为「外来」⇒ 目标 = ans-cli 根本身时也会 arm。本提案**不新增判定**（不重算），仅如实登记后果：若操作者在这样的命令上确认收口，会在该路径写下 `.ans` / 治理边界文档 / manifest（有界三目录、经确认、非静默）。是否收紧归装配的自身判定，另行处理。

## 行为与失败语义（改后）

- **创世 arm**：单轮 settle → 前端自动提议（「su 提议：可以收口了（完成 bootstrap）」+ 将写出的三个路径）→ CLI 通道读一行 y/n（缺省 120s 硬超时）→ **恰好确认**才落盘；拒绝 / 未识别输入 / EOF / 超时 → **不完成**、零副作用、命令非 0（`govern-session.ts:301-314`；`finalize.ts:266-283`；`operator-channel.ts:74-82`）。
- **su 本轮没产出可 pin 之物**（未写角色边界、也无既存治理边界文档）→ `nothing-to-pin` → **不完成**、非 0（`finalize.ts:350-360`）。这是如实报「bootstrap 没完成」，不是回归。
- **非创世（不 arm）**：逐字不变——包括 `ans govern`（无目录）、有 `.ans` 的目标目录、以及所有直调 `runGovernSession` 的既有测试。
- **跨进程自终止**：一次收口后目标目录出现 `.ans` ⇒ 下一次 `ans govern <同目录>` 装载 `.ans`（`configSource = "ans"`）⇒ 不再 arm。O1 登记的「结构性自终止」在 CLI 语义下随之成立。

## 必做项 / 选装

**本轮必做（客户已批准并实施完毕）：**

- [x] **M1：`govern.ts` arming + `GovernDeps.operatorChannel` 可选透传**（见「实际改动」；客户 2026-10-12 批准）。
- [x] **M2：`test/编排/govern-finalize-wiring.test.ts`（6 例，已绿）**。

**选装：无（客户未选任何选装）。** 两处已比较的备选做法如下（本轮均未做）：

| 备选 | 做法 | 结论与理由 |
| --- | --- | --- |
| B | 把 `createFinalizeProposer` 注入 Pi 适配器的 `finalize_bootstrap` 工具（su 在轮内自己决定何时提议，设计 §13.1 的原始形态） | **本轮未做**：须动 `run-role.ts:390-401` 工厂签名或其调用方（`govern.ts:76`；桌面 deps 亦透传），改动面横跨两层；而 CLI 是「一局一轮」的一次性壳，su 的「主动」也要等这轮结束才有落点——与单轮 unit 不匹配。设计 §13.1 的工具主要服务桌面多轮（桌面今天的触发是 UI 按钮，工具在生产也从未注册）。若将来 CLI 要做多轮会话，再单独提。 |
| C | 由 `openGovernanceSession` 内部按 `project.genesisBootstrap` 缺省 arm | **未采纳**：调用方显式开关是既有设计（`govern-session.ts:72-77`：「缺省 false——仅当本次的单位就是一次有界 bootstrap 时由调用方显式置真」）；引擎缺省会改变所有调用方（含测试对「不显式则不收口」的当前形状），且把政策藏进引擎不透明。 |

## 实际测试与证据

**M2 落盘**：`test/编排/govern-finalize-wiring.test.ts`（6 例；全部用系统临时目录、用后清理，不发任何模型请求）：

1. **创世 arm → 确认通过 → 真落盘**：`governCommand(["govern", <空目录>], { project: 创世夹具（roles={}、gov.path=""、genesisBootstrap 在）, createAdapter: 假适配器（脚本写角色三件套）, operatorChannel: 放行桩 })` → `EXIT_OK`；断言 `.ans/project.json`、`角色卡/governance-boundary.yaml`、`docs/bootstrap-manifest.md` **真落盘**，且 `.ans` 为 pin-backed、acceptance 来源 = 「客户确认完成 bootstrap（operator:test-客户）」、角色表含 X。
2. **确认拒绝 → 不完成、零副作用**：非 0；`.ans`/治理边界文档/manifest 均不出现（su 的会话内写入不受影响——这正是「半截」与「完成」的可见边界）。
3. **通道不可用（fail-closed）**：注入「unavailable」桩（确定性模拟无人值守；不依赖测试进程 stdin）→ 非 0、零副作用。
4. **非创世不 arm**：project 不带 `genesisBootstrap`（另带一份可用的 `gov.path` 夹具）→ 确认通道**零调用**、`EXIT_OK`、无收口副作用。
5. **无目录不 arm**：`governCommand(["govern"], …)` → 确认通道**零调用**、`EXIT_OK`。
6. **`--role` 不影响 arm 判定**：创世 + `--role X` → 仍收口（`.ans` 落盘）。

**落盘命令与实测结果（2026-10-12，本机）：**

- `node --test "test/编排/*.test.ts"`（引号带、Node 原生 glob）→ **145 计 / 145 过 / 0 失败**（本角色基线 139 + 新增 6）。
- `npm run typecheck` → **exit 0、0 错**。
- 全量 `node --test "test/**/*.test.ts"`（引号带）：**含装配第 7 例时不能自然跑完**——该例先按预期转红（见「跨角色影响」，120s 确认超时），其后**该文件所在子进程不退出**（默认 CLI 通道的 readline 仍挂着子进程 stdin），其余文件跑完后整套被它拖住（实测 >10 分钟未收敛，已中止）。**复跑**（`--test-skip-pattern "创世授权下 su 骨架写入真落盘"` 排除已实测红的该例）→ **686 计 / 683 过 / 2 红 / 1 skipped / 0 cancelled，exit 1**；**2 红均为既有环境红、与本改动无关**：`test/桌面应用` 面板键用例（本机检出目录名非 `ans-cli`）、`test/项目管理/shared/path-primitives.test.ts`（macOS `/var`→`/private/var`）——**未算入本回归、也未去修**。
- 环境：Node **v24.14.0**、Darwin 25.6.0（macOS）、仓库 HEAD **d933537**（工作区含装配并发改动；本角色改动 = `src/interface/cli/govern.ts` + 新测试文件）。

**边界**：以上为确定性验收（假适配器驱动）。**真实模型端到端**（真 su 建角色 → 提议 → 确认 → 落盘）需凭据 + 真实模型轮次，属「**客户跑**」（设计 §12.6 / §13.5），不在本角色自动验收内。无凭据环境下命令会在会话建立前如实报缺项。

## 跨角色影响

- **装配（前置；一处并发冲突已按协调顺序处理）**：本接线的 arming 完全依赖 M1+O1 提供的 `genesisBootstrap`——两者均已落地。**冲突点（已实测）**：`test/装配/govern-target.test.ts:217-243` 第 7 例（`ans govern <空目录>` 经 `governCommand` + 假适配器）断言 **`EXIT_OK`**；本接线落地后该目录即创世 arm ⇒ settle 后走 finalize ⇒ 无确认通道 → 确认硬超时（>120000ms）→ `unavailable` → **命令非 0**，该例实测转红，stderr 实测为「收口未完成：收口未获确认：客户确认超时（>120000ms）——不完成（fail-closed）」（其骨架落盘断言仍成立）。**附加实测**：该例失败后其 `node --test` 子进程**不退出**（默认 CLI 通道的 readline 仍挂着子进程 stdin），整套收尾被它拖住——装配随后在 deps 加一行 `operatorChannel` 放行桩（依赖本 M1 新增字段）可同时消除「断言红 / 120s 等待 / 子进程挂起」三点。**协调顺序（客户已确认）**：本 M1 先落（已落，新增可选字段向后兼容、未破坏任何既有调用），装配随后调整该例。
- **测试角色**：`test/测试/real-entry.test.ts:63-67` 的 govern 失败用例跑 `["govern"]`（无目录）⇒ 不 arm、不受影响；已核对其 fixture 与判据，无需改动。
- **桌面应用**：不受影响（桌面不设 `finalizeBootstrap`、经 `openRoleSession` + UI 按钮走自己的路）。其 `app/desktop/session.ts:289-292` 的过时注释（见「不在本次范围内」第 2 条）归桌面。
- **门禁引擎**：不受影响；只读使用。收口的多笔写仍逐条先经 `resolveWrite`（`finalize.ts:367-368` 前置全量求值 + `:425-427`/`:465-467` 写前复核），不绕门。

## 不在本次范围内（逐条与归属）

1. **「有 `角色卡/` 无 `.ans`」时两前端判据不一致**（CLI 以「无 `.ans`」arm、桌面以 `hasRoles === false` 不 arm）：归装配 O1 已登记的差异 + pm 决策；本接线**不改变**它（仍只认 `genesisBootstrap`）。在编排侧修它 = 重算装配判据（第二处政策实现），不做。
2. **`app/desktop/session.ts:289-292` 的过时注释**（称 `openGovernanceSession` 会产出 `writeSet: []`，「开会话前先经 `writeGovernanceSkeleton` 落骨架」）：引擎早已改（`govern-session.ts:159-164` 的 `effectiveScope` 收窄、`writeGovernanceSkeleton` 已退役），该注释归**桌面应用**角色更新；本角色只如实指出。
3. **装配 fix 文 `:46`「（全仓设置点只有桌面与测试）」等表述**：O1 落地即失效；归**装配**角色随其实施一并更新。
4. **模型工具 `finalize_bootstrap` 的生产接线（备选 B）**：不在本轮；将来 CLI 需要多轮、或桌面要求「su 轮内主动提议」时再提。
5. **shell 闸 arm**：与本缺陷无关，维持现状（V1 两个入口均未接线）。
6. **README / `ans help` 文案**：`src/index.ts:225` 的「对目标目录发起 bootstrap」在本接线落地后更名副其实；如需精确到「可在 CLI 完成收口」，README 属装配、help 属本角色文案，均不在本提案范围。

## 客户批准与实施记录

- **2026-10-12：客户批准 M1 + M2** 按本文（当时版本）实施，含「M1 先落、装配随后调第 7 例」的协调顺序。
- **2026-10-12：实施并验证完成**（见「实际改动」「实际测试与证据」）。备选 B 未被要求，未做。
