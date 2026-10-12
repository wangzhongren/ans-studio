---
id: govern-target-boundary-fix
type: fix
title: ans govern <目录> 对没有 .ans 的目标目录报「治理边界解析失败」
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-10-12"
    kind: created
    summary: 复现并确诊 ans govern <空目录> 的治理边界 ENOENT；给出修复落点建议与选装
  - date: "2026-10-12"
    kind: implemented
    summary: 客户批准 M1+M2+O1（经 pm 核验转达）；实施 src/index.ts（loadInjection）与 test/装配/govern-target.test.ts
  - date: "2026-10-12"
    kind: verified
    summary: 两道门 + 无凭据复现对照 + 新回归用例全绿（确定性范围）；真实模型端到端仍属客户跑、未验
  - date: "2026-10-12"
    kind: verified
    summary: 后续轮——编排 arm 创世收口后，本角色测试改注入放行桩 operatorChannel（计次=1）；两道门复跑全绿、全量套件自然退出
  - date: "2026-10-12"
    kind: verified
    summary: 第三轮——A 组确认制（request_confirmation + 发行 writeSet + 自动收尾）替换收口（上一轮证据随之失效）；本角色测试改注入 customerInput 放行桩、保留原断言意图；test/装配 52/52、我方零类型错、全量自然退出
---

# `ans govern <目录>`：对没有 `.ans` 的目标目录报「治理边界解析失败」

> **状态：已实施并验证（确定性范围）。** 客户 2026-10-12 批准 M1 + M2 + O1（经 pm 核验转达），已按本记录实施，证据见「实施与证据」。**本记录的「验证」= 确定性验收**：两道门（全量测试、类型检查）、无凭据复现对照、新回归用例；**真实模型端到端**（su 用真实模型对空目录完成 bootstrap：确认制写盘 + 自动收尾）**仍属「客户跑」，未验、不声称已验**。

## 用户会看到什么

在仓库根执行（`/tmp/ans-pi-e2e` 是一个空目录；本失败发生在**任何模型请求之前**，不消耗凭据、无网络调用，无凭据环境同样复现）：

```bash
mkdir -p /tmp/ans-pi-e2e
node --env-file=.env bin/ans.js govern /tmp/ans-pi-e2e
```

**实际**（实测，退出码 1）：

```text
ans govern 失败：治理边界解析失败：读取边界文件失败：ENOENT: no such file or directory, open '/tmp/ans-pi-e2e/角色卡/门禁引擎/boundary.yaml'
```

**期望**：`ans govern <空目录>` 能对着**目标目录**开起治理会话（README 命令表与 `ans help` 把它描述为「对目标目录发起 bootstrap」）；而不是去目标目录下找一个属于 ans-cli 自己的文件。

**修复后（实测，无凭据环境）**：`node bin/ans.js govern /tmp/ans-pi-e2e` → `ans govern 失败：缺少 base URL：请通过 opts.baseUrl 或环境变量 ANS_PI_BASE_URL 显式提供。…`，退出码 1——边界解析不再失败，会话开启前如实报出真正的缺项。注意：修复后**带 `--env-file=.env`（有凭据）再跑同一条命令会真实开会话、走模型回合**，属「客户跑」，本记录未运行。

对照：`node --env-file=.env bin/ans.js govern`（**不带目录**）是正常的——目标即 ans-cli 自身，同一条相对路径解析到仓库里真实存在的 `角色卡/门禁引擎/boundary.yaml`。实测（进程内探针，只读、无模型调用）：su 的边界来源 = `角色卡/门禁引擎/boundary.yaml`，`accepted=true`，17 条条目，无 `parseError`。

## 根因（已核对到源码）

1. `ans govern <目录>` 走装配入口 `main` 的 govern 分支：先经编排的 §6 安全出口 `resolveGovernTargetDir` 取到目标目录，再调 `loadInjection(targetDir)`（`src/index.ts:396-421`、`:410`），把注入配置的 `project.projectRoot` 设为 `path.resolve(targetDir)`（`src/index.ts:177-184`）。
2. 空目录没有 `.ans/project.json`，共享载入器回退到**内置演示配置**（`src/common/shared/config-loader.ts:254-275`，返回 `opts.fallback`）。这份演示配置是**描述 ans-cli 自己**的：`governanceBoundary.path = "角色卡/门禁引擎/boundary.yaml"`、六个角色的 `card`/`boundary` 全是相对 ans-cli 仓库根的项目相对路径（`src/index.ts:81-124`，治理边界路径在 `:120`）。`loadConfig` 只把 `fallback.projectRoot` 改成目标目录（`src/index.ts:154-164`），**路径本身没有随之改变归属**。
3. 治理会话解析边界：`openGovernanceSession` 发现内置治理角色 su 后调 `resolveRole("su", project)`（`src/pipeline/orchestration/govern-session.ts:146-154`）。su **不在** `project.roles` 里，`resolveBoundarySection` 的分支走向是：
   - **项目覆盖**分支：要求 `loc`（该角色在 `project.roles` 中）存在 → 跳过（`src/common/门禁引擎/boundary-core.ts:214-216`）；
   - **治理边界覆盖**分支：`gov.path` 非空即读 `joinRoot(project.projectRoot, gov.path)`（`boundary-core.ts:219-221`）→ 于是去目标目录下找 `角色卡/门禁引擎/boundary.yaml` → 读不到 → `parseError = "读取边界文件失败：ENOENT…"`（`boundary-core.ts:161-166`）；
   - 创世分支：要求 `project.genesisBootstrap` 被显式设置（`boundary-core.ts:226-232`）——**修复前** CLI 入口从未设它（当时唯一的设置点是桌面，见 `app/desktop/project.ts:110-124`）；修复后由本角色 `loadInjection` 对未 bootstrap 的目标目录设置（见「批准与实施」「实施与证据·同日后续轮」）；
   - 兜底：内置治理边界（未接受）。
4. `govern-session.ts:152-154` 判定 `parseError` 非空即抛错（对齐「改边界致 pin 失配 → 拒一切写」），CLI 前端捕获后以非 0 收口（`govern-session.ts:265-269`）。这就是命令行里那句话的来源。

一句话：**演示回退配置里的路径是「相对 ans-cli 自身」的，而 `projectRoot` 被换成了目标目录，两者错配。**

## 为什么桌面应用不受影响

桌面从不经 `loadInjection`：它用 `listProject` 枚举**目标目录**的角色、用共享载入器读**目标目录**的 `.ans` 构造 `ProjectConfig`（`app/desktop/project.ts:169-182`），**没有 `.ans` 就传 `governanceBoundaryPath = ""`**（`app/desktop/project.ts:76`）→ 治理边界覆盖分支因 `gov.path` 为空自然跳过；未 bootstrap（`hasRoles === false`）时显式设 `genesisBootstrap`（`app/desktop/project.ts:110-124`）→ su 得到「项目根治理种子边界」（普通目录 `角色卡/`、`docs/`、`.ans/`，`src/common/门禁引擎/governance-seed.ts:41-60`）。桌面测试已钉住这两点：`test/桌面应用/su-effective-boundary.test.ts:176`（无 `.ans` → 路径为空、su 回退内置未接受）、`test/测试/t9-block1-bootstrap.test.ts:172-175`（未 bootstrap → 带 `genesisBootstrap`）。

## 爆炸半径盘点：演示回退配置里「相对 ans-cli 自身」的数据

在「目标目录 ≠ ans-cli 根」时逐条判定（依据均已在源码核对；探针实测见括注）：

| 数据 | 位置 | 判断 | 依据 |
| --- | --- | --- | --- |
| `governanceBoundary.path` | `src/index.ts:120` | **坏（本缺陷，硬失败）** | su 不在 `roles` → 走治理边界覆盖分支 → 目标目录下 ENOENT → `parseError` → `ans govern` 非 0（探针实测） |
| `DEMO_ROLES[*].boundary`（6 条） | `src/index.ts:81-112` | **坏（潜在）** | 若某角色登记在 `roles`（当前 CLI govern 只解析 su，不在 `roles`，未触发），走项目覆盖分支读目标下同名文件 → ENOENT → 该角色一切写入被拒（fail-closed，非安全洞，但报错难懂） |
| `DEMO_ROLES[*].card`（6 条） | `src/index.ts:81-112` | **坏（潜在，直接抛错）** | `resolveRole` 对登记角色读角色卡且**无 try/catch**（`src/service/role/resolve-role.ts:24-26`）→ 目标目录下直接抛 ENOENT（探针实测：`resolveRole("编排", 目标配置)` 抛 `open '/tmp/ans-pi-e2e/角色卡/编排/role-card.md'`） |
| `buildDemoTaskScope().writeSet = ["src/interface/cli/run.ts"]` | `src/index.ts:136-138` | **不坏（今日无消费方跨根）** | 只被 `ans role run` 用（`buildRoleRunDeps`），其 `projectRoot` 恒为 ans-cli 根；潜在：将来若 role run 也接受目标目录，writeSet 会指向目标项目的文件（语义错位，届时另行处理） |
| `skillRoot` | `src/index.ts:117`、`src/common/shared/runtime-shared.ts:45-49` | **不坏** | 绝对路径（`ANS_SKILL_ROOT` 或 `~/.claude/skills/ans-governed-construction`），与 `projectRoot` 无关 |
| `DEMO_ACCEPTANCE`（`accepted=true`、无 pin，登记的非-pin 例外） | `src/index.ts:67-70` | **不坏（对目标目录本不生效）** | 边界解析的第 1/2 步都需要 `loc`/`path`，现状下用于 su 的只剩第 2 步；把 `path` 修空后不再被消费。**注意**：若照弃选项 O2 把路径改成指向 ans-cli 的绝对路径，这份「已接受」就会变成目标项目的边界接受证据（授权错误，见下） |
| `.ans` 落点与 pin 校验 | `src/common/shared/config-loader.ts:75-77`、`src/common/门禁引擎/boundary-core.ts:130-150`、`src/common/编排/finalize.ts:165-175` | **不坏** | `.ans` 载入、pin 比较（`joinRoot(projectRootAbs, p.path)`）、finalize 的 `relPaths` 全部以 `projectRoot` 为根——在目标目录场景下语义正确 |
| finalize 的治理边界落点 | `govern-session.ts:187`、`src/pipeline/orchestration/run-role.ts:218`（都是 `path \|\| DEFAULT_GOVERNANCE_BOUNDARY_REL`） | **今日不坏（fail-closed）** | 现状下 `gov.path` 非空 → 落点会是目标目录下的同名相对路径；但真走到那里时前置预检「无可 pin 之物」会拒绝（`finalize.ts:350-360`），零副作用。**该路径为读码判断，未实测**（需真实模型轮次才会走到） |

## 修复落点判断

**推荐 M1（落点：`src/index.ts` 的 `loadInjection`）。** 当给出目标目录、且解析结果是**内置回退配置**（`configSource.kind === "builtin-fallback"`，即目标目录没有 `.ans/project.json`）时，注入的 `project` 不得携带 ans-cli 自身的演示数据：

- `roles = {}`（ans-cli 的角色表不是目标项目的角色表）；
- `governanceBoundary.path = ""`（目标项目尚未声明治理边界 → 回到既有约定：空串不参与解析，落点由 `|| DEFAULT_GOVERNANCE_BOUNDARY_REL` 给出——与桌面「无 `.ans` 传空串」是同一约定）。

「自身」的判定建议用 `path.resolve(projectRoot) === path.resolve(resolveProjectRoot())`（而不是「是否给了目录」），这样 `ans govern` 与 `ans govern <ans-cli 根>` 两种写法行为一致、都不变。已知边界：符号链接/尾斜杠写法会让比较判为「外来」而走修复路径（方向是收紧/回退到约定，不放松授权；如实登记）。代码草图：

```ts
// loadInjection（拟）：
const projectRoot = targetDir === undefined ? resolveProjectRoot() : path.resolve(targetDir);
const { project, source } = await loadConfig(projectRoot);
if (targetDir !== undefined) {
  project.projectRoot = projectRoot;
  if (source.kind === "builtin-fallback" && projectRoot !== path.resolve(resolveProjectRoot())) {
    project.roles = {};
    project.governanceBoundary = { path: "", acceptance: DEMO_ACCEPTANCE };
    // 若选装 O1 获准，再加一行 genesisBootstrap（见下）
  }
}
```

**为什么是这个落点**：错配发生在**装配注入配置**这一步（谁把 ans-cli 的路径交给了目标目录）；`resolveBoundarySection` 的分支、`gov.path || DEFAULT` 约定、finalize 落点都已正确，不需要动。改动只在「无 `.ans` 的回退」这一支，`.ans` 存在/损坏（`ans`/`ans-invalid`）两支不受影响。

**各选项对既有语义的影响**：

| 选项 | 做法 | 影响 | 结论 |
| --- | --- | --- | --- |
| **A（= M1）** | 目标目录 + 内置回退 → 空角色表 + `gov.path=""` | `ans govern <无 .ans 目录>` 不再硬失败，边界解析落到既有分支；`ans govern`（无目录）与 `ans govern <ans-cli 根>` 逐字不变；不改变任何授权（是把「不该注入的」撤掉） | **推荐为必做** |
| B | 把演示回退的路径改成相对 ans-cli 根的**绝对路径**（`path.resolve(resolveProjectRoot(), …)`） | 目标根上 su 会拿到 ans-cli 的 `角色卡/门禁引擎/boundary.yaml`（门禁引擎角色的 Section 1，17 条）+ `DEMO_ACCEPTANCE`（`accepted=true`）——**把 ans-cli 的身份当成目标项目的治理边界并视为已接受**，且写根是目标目录 ⇒ su 可写目标项目的 `src/model/**` 等。授权语义错误。另会打破 `test/装配/config.test.ts:41-60` 等三处「路径相对仓库根」的既有断言（改测试的成本） | **弃用** |
| C | 在 `loadConfig` 里把「有无 targetDir」而不是「是否自身」当作判据（`ans govern .` 也走空回退） | 会改变 `ans govern <ans-cli 根>` 这一既有写法（su 从演示边界掉到内置未接受） | 弃用（用 M1 的自身判定即可避免） |

**批准与实施（2026-10-12）**：客户批准 M1 + M2 + O1（经 pm 核验转达），已按上表 A（= M1）实施。`src/index.ts` 的 `loadInjection` 现于「`targetDir` 给出、`source.kind === "builtin-fallback"`、且非 ans-cli 自身根」时改写注入：`roles = {}`、`governanceBoundary = { path: "", acceptance: DEMO_ACCEPTANCE }`、`genesisBootstrap = { source: "cli:ans govern <目录> = 操作者发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）" }`；自身根判定为紧邻的私有函数 `isSelfProjectRoot`（`path.resolve` 两侧比较）。对应测试与证据见下两节；B、C 未采纳。

## 必做项 / 可选项

**本轮必做**：

- [x] **M1：修复边界错配**（如上，`src/index.ts`）——**已实施**（客户 2026-10-12 批准，经 pm 核验转达）。
- [x] **M2：回归测试**（`test/装配/govern-target.test.ts`，见下节）——**已实施**（同上批准）。

选装（首提默认勾选为推荐；**勾选不是批准**——下列各项中只有客户明示批准的才实现）：

- [x] **O1：给「外来目录 + 无 `.ans`」的回退配置补 `genesisBootstrap`，让 `ans govern <空目录>` 真能 bootstrap**（**已批准并实施**）。
   - **加什么**：一行 `project.genesisBootstrap = { source: "cli:ans govern <目录> = 操作者发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）" }`（仅目标目录 ≠ ans-cli 根、且无 `.ans` 时）。
   - **为哪种情况准备**：README 命令表与 `ans help` 把 `ans govern <空目录>` 描述为「对目标目录发起 bootstrap」；设计 §12.3 接受目标目录的裁决理由正是「否则 CLI 连『对任意空文件夹 bootstrap』都办不到」（`角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md:760-762`）。桌面同形在先（`app/desktop/project.ts:110-124`）。
   - **不加会怎样**：M1 之后该命令能开起会话，但 su 拿到的是**内置未接受边界**（实测探针 C：`accepted=false`、5 条条目；且其条件目录需 slug 激活、而可写集为空）→ **su 一个字也写不了**。命令"成功"却完不成它被记录在案的用途——比报错更隐蔽。
   - **实据/概率**：这是确定性行为（探针实测），不是概率问题。
   - **代价**：给 CLI 这条入口增加一次**有界创世授权**（仅由操作者显式 `ans govern <目录>` 触发；种子边界只含 `角色卡/`、`docs/`、`.ans/`，不含 `src/`、不含任意文件；项目自己的治理边界文档一经写出并经 pin 接受即**结构性自终止**）。另有一处如实登记的差异：桌面用 `hasRoles===false`（能枚举角色目录）判定未 bootstrap，装配按分层规则不能导入 Service 层枚举，只能以「无 `.ans`」近似 ⇒ 目标目录「有 `角色卡/` 但无 `.ans`」时 CLI 会 arm 而桌面不会（该差异不造成越界：种子仍只放行三处治理产物）。
- [ ] **O1b（仅当客户不接受 O1 的差异时备选）**：把创世判定放到能枚举角色的层（编排 Interface/Pipeline）。**不推荐**：会与桌面的判据形成第二处政策实现，违背「杜绝两份实现」。
- [ ] **O3（措辞联动，仅在 O1 被否时需做）**：README 第 64 行与命令表第 127 行的「对目标目录发起 bootstrap」措辞须改为与决定一致（如「开治理会话；对空目录的创世授权未接线」）。README 是装配文件，随决定一起做。**未触发**：O1 已获批，README 原措辞与现行为一致，未改。

## 现有测试核对

- **必须随修复一起更新（已更新）**：`test/装配/govern-target.test.ts` 原第 6 例（修复前位于 `:143-155`，「目录存在 → 目录校验放行……缺 Pi 凭据时如实非 0」）。其断言（非 0、且不含目录校验错误）在**修复前后都会通过**——**它没有钉住这个缺陷**；更糟的是它注释里写的失败原因（`:17-18` 同）是「构造真实适配器时缺 Pi 凭据」，**与实测不符**：`createPiAdapterFactory` 只返回闭包（`run-role.ts:390-401`），凭据要到 `bindRole` 时才解析，所以 `env={}` 下它当前真实的非 0 原因就是**治理边界 ENOENT**（探针实测：`main(["govern", "/tmp/ans-pi-e2e"], {})` → 同一条 ENOENT 报错、退出码 1）。**已按此更新**：`main` 侧用例保留原断言（非 0、不含目录校验错误）并新增「不含治理边界解析失败」「如实报出缺 provider 配置」——跑前先清空 Pi 相关环境变量，保证不受 `process.env` 影响、绝不发真实模型请求；另新增 `governCommand` + 假适配器驱动的链路用例（断言 `EXIT_OK` 且创世授权下骨架写入真落盘）。原松断言被换成更严的断言，**未放宽、未删除**。
- **锚定当前缺陷行为的断言：未发现。** 全仓没有任何用例把「对空目录报 ENOENT」当成期望；最接近的第 6 例只是**太松**（锚定不足），不是锚定缺陷。不得为通过而放宽或删除该例既有断言，也不得改 `test/装配/config.test.ts` 的既有断言（推荐方案下它**无需任何改动**——这本身是弃用选项 B 的一条成本证据）。
- 其余相关用例不受影响：`test/编排/govern.test.ts`、`test/编排/govern-engine.test.ts`、`test/测试/*` 等都用自备夹具/注入配置（不经演示回退）；`test/桌面应用/su-effective-boundary.test.ts` 走桌面链。已核对，**无需改**。
- **已新增**（`test/装配/govern-target.test.ts`，本角色白名单内；共 +3 例）：
  1. **注入合同**：`loadInjection(<空目录>)` → `project.roles` 为空、`project.governanceBoundary?.path === ""`（O1 获准则加：`genesisBootstrap` 存在且 source 含 CLI 操作者发起字样）。
  2. **行为（替换原第 6 例的驱动方式）**：直接调 `governCommand(["govern", <空目录>], { ...注入, createAdapter: 假适配器 })` → 断言 `EXIT_OK` 且 stderr 不含「治理边界解析失败」；（O1 获准再断言假适配器脚本写 `角色卡/X/role-card.md` 真落盘——空目录上 bootstrap 真的可用）。
  3. **自根不变**：`loadInjection(resolveProjectRoot())` → 演示配置原样（`roles` 六个、`gov.path` 为门禁引擎边界）——钉住「自身行为逐字不变」。

  以上 3 项均已落地（实际用例名见测试文件）；`test/装配/*.test.ts` 由 49 例增至 52 例。

## 实施与证据（2026-10-12）

- **改动**：`src/index.ts`（`loadInjection` 改写注入 + 新私有函数 `isSelfProjectRoot`，见「批准与实施」）；`test/装配/govern-target.test.ts`（+3 例、改写原第 6 例为两条更严的用例）。
- **两道门（改后实测）**：
  - `test/装配/*.test.ts` → **52/52 通过**（修复前基线 49/49）；
  - 全量 `node --test "test/**/*.test.ts"`（**引号必须带**，走 Node 原生 glob）→ **681 tests / 678 pass / 2 fail / 1 skipped**，exit 1。较基线 +3 例（即本次新增）；两红与基线**完全相同**、仍为他角色目录内的既有环境红（见下「基线」），**无新增红**；
  - `npm run typecheck` → **0 错**（exit 0）。
- **同日后续轮（编排 arm 创世收口 + 本角色测试通道桩）**：
  > **该节证据已失效（2026-10-12 同日更晚）**：所述「收口提议 + `operatorChannel`」机制已经客户批准的 A 组设计**替换并删除**（改确认制，见「同日第三轮」）；本节保留为当时实录，不再代表现行机制。
  - 背景：编排 2026-10-12 在 `src/interface/cli/govern.ts` 接线——注入配置带 `genesisBootstrap` 时向 `runGovernSession` 传 `finalizeBootstrap: true`，并新增可选 `GovernDeps.operatorChannel`（形状 = 契约家 `provider/pi/session.ts` 的 `OperatorChannelFn`）。
  - 影响（实测）：本文件经 `governCommand` 驱动的那条用例随之进入创世收口——su settle 后**提议收口**、缺省走 CLI 终端通道读 y/n；测试环境无输入 ⇒ **挂起**（45 s 看门狗杀死，退出码 142、转红）。
  - 应对（只动本角色测试）：给该例 deps 注入**放行桩** `operatorChannel`（计次，返回 `{ outcome: "allow", operatorId: "test:装配放行桩" }`），并新增断言「确认通道被挂起**恰好一次**」（加强，非放宽）；原断言（EXIT_OK、stderr 不含边界/目录错、角色文件逐字一致）全部保留。实测 transcript 显示收口完成：写出 `角色卡/governance-boundary.yaml`、`.ans/project.json`、`docs/bootstrap-manifest.md`（pin 2 条、角色 1）。
  - 证据（同日第二遍）：`test/装配/` **52/52**；全量 → **687 tests / 684 pass / 2 fail / 1 skipped**（两红 = 同两条既有环境红），**自然退出、不再挂起**；`npm run typecheck` → **0 错**。未动 `src/interface/**`、`test/编排/**`、`角色卡/编排/**`。
- **同日第三轮（A 组「确认制」替换收口；本角色测试再改造）**：
  - 背景（编排交付，客户批准的 A 组）：删 `genesisFinalize` / 句柄 `settled`/`finalize` / `operatorChannel`；新增**交互工具族** `request_confirmation` / `request_choice`（形状在契约家 `provider/pi/session.ts`）；客户 `confirmed:true` 后**编排**把「预览文本里列出且校验在会话边界内」的具体路径**发行进本次会话 writeSet**（未确认路径被 F4 拒，机制见 `src/common/编排/confirmed-writes.ts`）；客户同意且写入后，su 会话 settle 时**自动收尾**（`repinIfBootstrapped` 经 A-4 扩为含首次）写 `.ans` + `角色卡/governance-boundary.yaml` + `docs/bootstrap-manifest.md`——**不再有「收口提议/等待确认」这一步**。
  - 影响（实测）：本文件第 7 例的假适配器脚本**直接写文件、未先确认** ⇒ F4 拒（骨架文件不落盘，该断言转红；进程**自然退出、无挂起**——上一轮的确认超时/挂起随收口删除消失）。
  - 应对（只动本角色测试）：脚本改为**先 `request_confirmation`（预览里列出将写出的具体路径）再写**；deps 注入**放行桩** `GovernDeps.customerInput`（计次，返回 `{ outcome: "answered", value: { confirmed: true }, operatorId: "test:装配放行桩" }`）；适配器工厂改为 `(gate, capabilities) => createFakeRuntimeAdapter({ ...capabilities })`（编排经第二参注入客户通道，「注入才注册」）。新增断言：确认通道被请求**恰好一次**、收尾产物 `.ans/project.json` 存在；原断言（EXIT_OK、stderr 不含边界/目录错、角色文件逐字一致）全部保留。
  - 证据（本轮实测）：`test/装配/` **52/52**；全量 `node --test "test/**/*.test.ts"` → **715 tests / 700 pass / 14 fail / 1 skipped**，**自然退出、无挂起**；14 红如实分列——他人在途：`test/桌面应用/finalize-wiring.test.ts` 8、`test/测试/t9-block1-bootstrap.test.ts` 3、`test/测试/cli-genesis-boundary.test.ts` 1；既有环境红：`test/项目管理/shared/path-primitives.test.ts`（macOS /var）、`test/桌面应用/pi-config.test.ts`（仓库目录名）。**本角色目录零红**。`npm run typecheck` → 全仓 18 错，**全在他人在途改动**（`app/desktop/**`、`test/桌面应用/**`、`test/测试/**`）；**`test/装配/` 与 `src/index.ts` 零错**。未动 `src/**`、他角色 tests/docs。
- **缺陷复现对照（均无需真实模型）**：
  - 修复前（实测）：`node --env-file=.env bin/ans.js govern /tmp/ans-pi-e2e` → `治理边界解析失败……ENOENT`，退出码 1；无凭据时同一条报错（探针实测）。
  - 修复后（实测，**无凭据环境**）：`node bin/ans.js govern /tmp/ans-pi-e2e` → `ans govern 失败：缺少 base URL：请通过 opts.baseUrl 或环境变量 ANS_PI_BASE_URL 显式提供。…`，退出码 1——边界解析不再失败，如实报出真正的缺项。**有凭据环境会真实开会话、走模型回合，属「客户跑」，本记录未运行。**
  - 进程内探针（改后，只读）：空目标目录 → `gov.path = ""`、su 边界来源 = `角色卡/governance-boundary.yaml`（创世种子）、`parseError = undefined`、`accepted=true`、3 条条目（`角色卡/`、`docs/`、`.ans/`）；无目录 / 显式自身根 → 演示配置逐字不变。
- 环境：Node **v24.14.0**、Darwin 25.6.0（macOS）、仓库 HEAD **d933537**；改动在**未提交**的工作区（另有一处非本任务的 `package-lock.json` 改动）。
- 基线（修复前实测，2026-10-12）：
  - `test/装配/*.test.ts` → **49/49 通过**；
  - 全量 `node --test "test/**/*.test.ts"` → **678 tests / 675 pass / 2 fail / 1 skipped**，exit 1。两红**与本缺陷无关**、均在其它角色目录内（未动，如实列出以免实施轮误判）：
    - `test/桌面应用/pi-config.test.ts:60`——断言 `resolveRepoEnvPath()` 以 `ans-cli/.env` 结尾，本机检出目录名为 `ans-runtime`（环境/目录命名相关）；
    - `test/项目管理/shared/path-primitives.test.ts:251`——macOS `/var` → `/private/var` 符号链接导致 realpath 前缀差异（平台相关）。
    > README「677 用例、677 通过」与本机实测的差异即上面两条环境因素（另 +1 skipped 用例），建议 pm 核实后决定是否随其属主修正——**不在本任务范围**。
  - `npm run typecheck` → **0 错**（exit 0）。

## 跨角色影响评估

- **编排**：不改其任何文件；修复只是让既有约定（`gov.path` 空 → 跳过治理边界覆盖分支；`path || DEFAULT_GOVERNANCE_BOUNDARY_REL` 落点）在 CLI 目标目录场景下第一次真正生效。O1 已获准并实施（su 在 CLI 下第一次真的能写目标目录的治理产物）——「CLI 前端 + 创世 + 模型调 `finalize_bootstrap` 收口」这条链的端到端可达性**本次未验**（需真实模型），编排已于 2026-10-12 自行落地该 arm：`govern.ts` 据注入的 `genesisBootstrap` arm `finalizeBootstrap` 并新增可选 `operatorChannel`（见「同日后续轮」）；其后编排再按 A 组**删除收口机制、改确认制**（见「同日第三轮」），本角色测试相应再改造。本角色始终未动编排文件。
- **测试**：`test/测试/real-entry.test.ts:63-67` 的 govern 失败用例只断言非 0，修复后仍成立、**不必改**；但存在一个**与本缺陷无关的既有隐患**：该用例与本次改写前的第 6 例一样，若跑测试的机器环境里恰好有 `ANS_PI_*` 凭据，`govern` 会真开会话、发起模型回合（真实费用、不确定性）。我已把自己文件里的那两条用例改为假适配器驱动 / 先清空 Pi 环境变量；`test/测试/**` 属测试角色，建议其自查是否同样处理（是否开单请 pm 判断）。
- **桌面应用**：不受影响、无需评估（桌面不走 `loadInjection`；其 `hasRoles` 判据与 CLI 的近似判据差异已登记在 O1 里）。
- **门禁引擎**：只读使用，未动。已记录一个**与本缺陷相邻的既有尖锐边缘**（不属本次范围）：`resolve-role.ts:24-26` 读角色卡无 try/catch——配置里登记但文件缺失时直接抛 ENOENT（而非记为 `parseError`）。本缺陷路径经 M1 后不再经过它。
- **项目管理**：本文档按 `documentation.md` 的方案审核流程（`proposal-review.md`）先行评估，并整理审批摘要交客户——客户已于 2026-10-12 批准 M1 + M2 + O1（经 pm 核验转达），本记录据此更新为实际结果。

## 不在本次范围内

- 不改 `src/service/**`、`src/common/门禁引擎/**`、`src/common/shared/**`、`src/pipeline/**`、`src/interface/**`、`app/**`（含上面提到的角色卡读取防御与桌面侧任何改动）；
- 不改 `.ans` 载入器/终态规则/pin 语义（共享组件，pm 属主）；
- 不为 CLI govern 增加自动化「真实模型端到端」验收（须客户跑，按项目既有 12.6 分列）；
- 不 arm shell 闸（无关，维持 V1 两个入口均未接线）；
- 不动 `test/测试/**`、`test/桌面应用/**`、`test/编排/**`；
- 未改 README（O1 已批准 → 其「对目标目录发起 bootstrap」措辞与现行为一致；O3 未触发）。README「两道门」用例数（677/677）与本机实测（基线 678/675、改后 681/678）的差异属上列他角色环境红，未动。
- 本角色尚无 `feature-map.md` 与 `docs/feature/`（role-card 引用过它们但文件尚未建立）——本记录暂无功能文档可回链，属既有缺口，不随本次一并处理。
