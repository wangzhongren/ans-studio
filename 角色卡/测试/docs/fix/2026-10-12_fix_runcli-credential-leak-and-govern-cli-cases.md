---
id: test-runcli-credential-leak-and-govern-cli-cases
type: fix
title: 跑测机器上有 Pi 凭据（或 ANS_RUNTIME=pi）时测试会真发模型请求；并补齐 CLI `ans govern <目录>` 的入口与创世用例
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [govern-target-boundary-fix, cli-govern-finalize-wiring]
events:
  - date: "2026-10-12"
    kind: created
    summary: 第三轮独立复核发现 runCli 继承进程环境可致自动用例真发模型请求，另列同类 ANS_RUNTIME 注入面；连同 CLI govern <目录> 入口/创世拒绝面缺口一并起草，待客户确认后实施
  - date: "2026-10-12"
    kind: implemented
    summary: 客户批准 M1+M2+M3+O1（不含 O2：无消费者，将来真需要再加），并裁定「有 角色卡/ 无 .ans」判据差维持现状（桌面对齐另议）；已按批准范围实施 test/测试 三处改动，另加 1 条擦洗行为钉子（见「实施与证据」）
  - date: "2026-10-12"
    kind: verified
    summary: test/测试 110/110；全量 692/689/2/1（两红为他角色既有环境红）；typecheck 0 错
---

# 跑测机器上有 Pi 凭据时测试会真发模型请求；并补齐 CLI `ans govern <目录>` 的用例

> **状态：已实施并验证（2026-10-12）。** 客户批准 **M1 + M2 + M3 + O1（不含 O2）**，并随 O1 裁定「有 `角色卡/` 无 `.ans`」判据差**维持现状**（见下「客户裁定」节）。下方「改后」即实际行为；实测命令与结果见「实施与证据」。真实模型端到端仍属「客户跑」，不在本文范围。草案阶段的原文按 documentation-fix.md 要求改为实际结果，未实施内容不再保留为计划语气。本角色尚无 `feature-map.md` 与 `docs/feature/`（既有缺口），本文暂无功能文档可回链。

## 用户会看到什么

**场景 1（凭据泄漏）**：开发者机器或 CI 的 shell 里导出过 `ANS_PI_BASE_URL`、`ANS_PI_MODEL`、`ANTHROPIC_AUTH_TOKEN` 一类变量（手跑 `ans govern` 的常见配置；项目 README 的示例命令也用 `--env-file=.env`），此时跑全量测试：

- **实际**：`test/测试/real-entry.test.ts` 的「govern 缺真实 Pi 适配器 provider 配置」一条，会**真的开启治理会话、向真实模型发一轮请求**（耗时、费用、输出都不可控）。而且它断言的是「非 0」（现位于 `real-entry.test.ts:81`）——会话真跑成功反而退出 0，用例当场转红。
- **更坏的边角**：这条会话的 su 在 ans-cli 自身（演示配置）下拿到的边界是门禁引擎的 Section 1（17 条、accepted），且 scope 未收窄（无激活条件、空可写集 ⇒ `undefined`，`src/pipeline/orchestration/govern-session.ts:157-164`）——2026-10-12 我实测该边界下 `src/common/门禁引擎/evil.ts` 这类写入**会被放行**；真模型轮次若决定写这类路径，测试会把文件写进仓库。
- **预期**：自动用例是离线、确定的；**绝不**因跑测机器的环境差异去打扰真实模型、更不写仓库。

**场景 2（运行时开关泄漏，本轮新发现的同类问题）**：机器上若导出过 `ANS_RUNTIME=pi`（`--runtime` 的环境变量兜底，`src/common/装配/runtime.ts:99`）：

- `real-entry.test.ts:14-42` 三条 role run 成功用例会从演示适配器**切到真实 Pi 适配器**——无凭据时全部转红；凭据也齐时同样真发模型请求。
- 触发链：`bin/ans.js` → `main(argv)`（`src/index.ts:378-381`，`env` 缺省 `process.env`）→ `resolveRuntime(flag, env)`。

**用户可见入口**：跑测命令（`node --test "test/**/*.test.ts"`）。本改动**不改任何产品行为**——`ans govern` 等 CLI 对使用者的表现不变。

## 根因

1. `test/测试/helpers.ts` 的 `runCli` 调 `spawnSync` 时**没传 `env`**（实施前位于 `:21-27`）⇒ 子进程完整继承跑测进程的环境。
2. 真实入口按环境取值：provider 配置与凭据读 `ANS_PI_*` / 凭据变量（`src/common/pi-adapter/provider-config.ts:119-148`）；运行时选择读 `ANS_RUNTIME`。
3. 于是「本机碰巧有哪些环境变量」决定了用例走演示/缺项失败，还是走真实网络。

## 改后（实际）

- `runCli` 默认从**子进程**环境里剔除三类键：① `PI_CREDENTIAL_ENV_VARS`（单一来源 `src/common/shared/runtime-shared.ts:33`；按工程法案 §一.5 **只读导入、不复制**）；② 所有 `ANS_PI_` 前缀键；③ `ANS_RUNTIME`。其余变量（PATH/HOME 等）原样。
- 既有「govern 缺 provider 配置」用例随之变确定：恒缺 base URL、恒非 0；它的断言**收紧**为「stderr 含『缺少 base URL』」（用例表加可选 `stderrMatch` 字段）——从"仅非 0"升到"非 0 且原因如实"。其余断言一字未动。
- 新增 1 条**擦洗行为钉子**（提案未列、实施时补，如实登记）：在用例内注入哨兵 `ANS_RUNTIME=pi` + 凭据变量后经 `runCli` 跑 `doctor`/`role run`，断言子进程**看不到**这些值（否则这条修复在无凭据的机器上无法被任何用例证明）。哨兵 `ANS_PI_BASE_URL` 置空 ⇒ 即便擦洗失效也只会在网络之前失败，绝不外连。
- 受影响面逐条核对（实施后复核）：只有 govern 这一条既有条目受影响；role run 三条走装配注入的演示适配器（本次擦洗同时修掉它们受 `ANS_RUNTIME` 影响的场景 2）；help/doctor/init 及 t29 两文件（自搭临时 `.env`、不经 `runCli`）不受影响。

## 必做项（均已实施，2026-10-12）

### M1：`runCli` 默认凭据/运行时擦洗 + 收紧既有断言 —— **已实施**

- **加什么**：`runCli` 构造子进程 env 时剔除上述三类键；`FAIL_CASES` 表加可选 `stderrMatch?: RegExp`，给 govern 条目填 `/缺少 base URL/`。
- **为哪种情况准备**：跑测机器环境里存在凭据或 `ANS_RUNTIME=pi`（场景 1/2，均为实测过的确定性行为，不是概率问题）。
- **不修会怎样**：在那类机器上跑全量 = 真发模型请求（费用、时长、不确定性）；成功后该用例反红；极少数情况会经 su 的工具轮次把文件写进仓库。
- **代价**：一处辅助函数 + 一条断言收紧。

### M2：真 CLI 入口用例——`ans govern <空目录>`（`real-entry.test.ts` 追加一条）—— **已实施**

- **夹具**：`mkdtempSync` 建空目录，用例结束清理。
- **断言**：非 0（**不钉具体码**——沿用既有「运行时失败码非稳定契约」纪律，`real-entry.test.ts:46-53`）；stderr **不含**「治理边界解析失败」；stderr **含**「缺少 base URL」；跑完目录仍为空（零副作用）。
- **为什么归 test/测试**：这是从**客户可见入口**（spawn `node bin/ans.js`）完整跑一遍的回归钉子。装配的对应用例走进程内 `main()`/`governCommand`；spawn 出的真实 CLI 属本角色「真实入口/完整流程」职责，且它钉的正是 2026-10-12 两级缺陷（空目录报 ENOENT → 修后如实报缺项）在合并态下的外部行为。

### M3：CLI 层 su 创世面（允许面 + 拒绝面）跨角色用例（新文件 `test/测试/cli-genesis-boundary.test.ts`，2 例）—— **已实施**

- **例 1（判定面，不经会话）**：`loadInjection(空目录)` 注入 → `resolveRole("su", …)` 边界**恰好 3 条**（`角色卡/`、`docs/`、`.ans/`，accepted、无 parseError）；`resolveWrite` 逐条：`src/index.ts` 拒、`角色卡/../src/x.ts` 拒（词法逃逸）、`../../../etc/passwd` 拒（真实路径逃逸）、根外绝对路径拒；三角色目录放行。
- **例 2（链路面，经真入口链路）**：`governCommand` + 假适配器脚本（先尝试写 `src/evil.ts`，再写 `角色卡/X/role-card.md`；假适配器遇拒**继续跑完整脚本**、以 `settled` 收尾，`src/provider/pi/session.ts` 假适配器实现）→ 断言被拒文件**不落盘**、允许文件**真落盘**、命令以 0 结束。
- **为什么归 test/测试（跨角色联调）**：这条链横跨**装配注入形态（M1+O1）→ 门禁判定 → 编排会话**。三家各有自己的钉子（装配钉注入与落盘、编排钉收口接线、门禁钉单元判定），但「组合后，CLI `<目录>` 创世态下 su 的可写面确实只有三处治理产物、src 与两类逃逸确被拒」没有一家单测覆盖——正是联调缺口。

## 选装（2026-10-12 客户已裁定）

- [x] **O1**（批准并实施）「有 `角色卡/` 但无 `.ans`」角落钉现状：并入 M3 文件加 1 例（见下方「客户裁定」）。
- [ ] **O2**（客户**未采纳**，理由：无消费者，将来真需要再加）：`runCli(argv, { piEnv: "inherit" })` 逃生舱——**不实施**；保留未选状态，不再重提。
- [-] 评估过、建议**不**加：`ANS_SKILL_ROOT` 不进默认擦洗（若注入指向别处，演示配置的 skill 根条目判定可能变化，但未实测到具体失败；不编造防御）；`test/测试/pi-probe.mjs`、`pi-turn-probe.mjs` 两个**手动探针**（不在自动套件内；后者显式设计为真模型轮次，只应知情手跑）不改。

## 客户裁定（2026-10-12）：「有 `角色卡/` 但无 `.ans`」判据差维持现状

- **裁定**：CLI 仍以「无 `.ans`」arm 创世（su 可改既有角色文件）；桌面仍以 `hasRoles` 不 arm。**维持现状。**
- **理由（客户）**：operator 显式发起、创世种子有界（仅 `角色卡/`、`docs/`、`.ans/`）、非静默。
- **登记**：**桌面侧是否对齐另行评估**。
- **落实**：O1 用例按此方向钉住现状——断言该角落 `loadInjection` 仍带 `genesisBootstrap`、`listProject` 的 `hasRoles=true`（呈现差异为何存在）、写入仍只落三处治理产物、`src/**` 仍拒（见 `test/测试/cli-genesis-boundary.test.ts` 第 3 例的用例名与注释）。

## 实际改动文件清单（2026-10-12 实施）

- **改** `test/测试/helpers.ts`：`runCli` 默认擦洗（M1，含 `scrubbedEnv` 私有辅助；按客户裁定**不加** O2 开关）。
- **改** `test/测试/real-entry.test.ts`：`FAIL_CASES` 加可选 `stderrMatch` 并给 govern 条目填 `/缺少 base URL/`（M1）；追加 `govern <空目录>` 用例（M2）；追加「runCli 默认擦洗」哨兵验证用例（实施时增补，见「改后（实际）」）。
- **增** `test/测试/cli-genesis-boundary.test.ts`：M3 两例 + O1 一例。
- **只读引用（未写）**：`src/common/shared/runtime-shared.ts`（凭据变量单一来源）、`src/index.ts`（`loadInjection`）、`src/service/role/resolve-role.ts`、`src/service/gate/resolve-write.ts`、`src/interface/cli/govern.ts`、`src/provider/pi/session.ts`（假适配器）。

## 实施与证据（2026-10-12 实测）

- `node --test "test/测试/*.test.ts"` → **110/110 通过，exit 0**（实施前基线 105/105；+5 = M2 1 + M3 2 + O1 1 + 擦洗验证 1；比提案预期 109 多 1，即实施时增补的擦洗行为钉子）。
- `node --test "test/**/*.test.ts"`（引号必须带）→ **692 计 / 689 过 / 2 红 / 1 跳，exit 1**（实施前基线 687/684/2/1）。两红为他角色目录**既有环境红**，未修、也未算入本角色回归：`test/桌面应用/pi-config.test.ts:60`（检出目录名须以 ans-cli 结尾）、`test/项目管理/shared/path-primitives.test.ts:254`（macOS `/var`→`/private/var`）。
- `npm run typecheck` → **0 错（exit 0）**。
- 行为面（哨兵实测，在任何无凭据机器上可复现）：把 `ANS_RUNTIME=pi` 与凭据哨兵注入**跑测进程**后，`runCli(["doctor"])` 仍报「运行时: demo（来源：默认）」、`runCli(["role","run","编排","--task","T-1"])` 仍以 0 走演示路径；`govern <空目录>` 恒退出 1 + stderr「缺少 base URL」+ 目录零残留。
- **未验**：真实模型端到端（su 真建角色 → 提议 → 终端 y/n 确认）——属「客户跑」。

## 影响面与风险

- **只在 `test/测试/**`（本角色白名单）内改动**；不碰产品代码、不碰他角色测试/夹具（`test/装配/**`、`test/编排/**`、`src/**`、`app/**` 全不写）。
- **受影响用例**：仅 `real-entry.test.ts` 的 govern 条目（收紧，非放宽——对齐工程法案 §二.6）。
- **擦洗会不会掩盖问题**：会把"在有凭据机器上本可跑到的真实路径"从自动套件里拿掉——这正是目的（自动用例不得发真实请求）；真实模型端到端不属于自动验收。如实登记：擦洗只覆盖 `runCli` 子进程；父测试进程的环境照旧（现无用例消费它）。
- M2/M3 钉的是当前合并态行为（装配 M1+O1 + 编排收口接线，均已客户批准并落地）；这些若被回退或再改，用例会红——属联调钉子应有之义。
- 全量计数以「实施与证据」节的实测为准（他角色并发改动仍可能使它漂移）。

## 明确不在范围内

- 真实模型端到端（su 真建角色 → 提议 → 终端 y/n 确认）——属「客户跑」。
- 「有角色卡无 `.ans`」判据差异的**裁定本身**（O1 只钉现状；怎么裁定属客户）。
- `ANS_SKILL_ROOT` 防御、两个 `.mjs` 探针脚本的改造。
- 任何产品代码 / 他角色文件；`.env` 的任何读写；桌面侧 finalize 接线（他角色既有登记缺口）。

## 批准范围（2026-10-12 客户）

- 批准实施 **M1 + M2 + M3 + O1**；**O2 未采纳**（无消费者，将来真需要再加）。
- 随 O1 一并裁定「有 `角色卡/` 无 `.ans`」判据差**维持现状**（理由与「桌面对齐另议」登记见上方「客户裁定」节）。
- 提案阶段的三问（是否实施 M1+M2+M3、O1 要不要、O2 要不要）至此均已答复，见上。

## 状态

**已实施并验证（确定性范围，2026-10-12）。** 三条门实测见「实施与证据」；两红为他角色既有环境红、不计入本角色回归。**未验**：真实模型端到端（属「客户跑」）。背景实测链：修复前全量 681/678/2/1、`test/测试` 105/105、typecheck 0 错；合并态（含编排收口接线）687/684/2/1；本轮实施后 692/689/2/1、110/110。
