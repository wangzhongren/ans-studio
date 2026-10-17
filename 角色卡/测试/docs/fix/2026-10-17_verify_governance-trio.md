---
id: governance-trio-independent-verification
type: fix
title: 治理三权分立（Rapporteur / Nominator / Convener）独立端到端验证（测试角色）
created: "2026-10-17"
updated: "2026-10-17"
timezone: Asia/Shanghai
status: verified
related: [governance-trio-review, existing-project-compat, governance-pin-recovery]
events:
  - date: "2026-10-17"
    kind: created
    summary: 按 PM 评审 §5–§9/§十一/§十二独立验证三权 V1+V1b；自建 `test/测试/governance-trio-verify/` 32 例离线端到端（列表/会话/能力/写权/三道门禁/派发五条/快捷路径/账本还原/一卡队列/迁移/旧 single 兼容/UI）；修正本角色 30 条因契约变更失效的既有断言；全量 2660/2630 pass/27 fail/3 skip（新增红 0；27 红均为既有）；typecheck 0 错；发现 1 项 CLI 注入缺陷（ans govern 空目录未注入 governanceModel）
  - date: "2026-10-17"
    kind: reverified
    summary: 属主修复两处缺陷后复审——①装配 `loadInjection` 按 §5.4 注入治理模型（显式优先、不可读 single、无 .ans 且无角色目录 trio、其余 single），real-entry 1 红 + t1-real-cli govern×3 红转绿（装配 govern-target/multi-runtime 同源 7 红亦转绿）；②运行时核心安装/看护类 schema 文案统一为「内置治理角色」；同步本角色两条文案期望（a-tools-surface、c-tools，仅期望值不放宽）。复跑：三权套件 32/32；全量 2669/2650 pass/16 fail/3 skip（新增红 0；剩余 16 红均为既有：本角色 1＝Windows symlink EPERM，其他角色 15）；typecheck 0 错
---

# 治理三权分立独立端到端验证（测试角色）

**验证对象**：PM 评审 [2026-10-17_design_governance-trio-review.md](../../../项目管理/docs/design/2026-10-17_design_governance-trio-review.md)（客户 2026-10-17 拍板 V1 + V1b）已落地的门禁引擎 / 运行时核心 / 编排 / 桌面窗口 / 桌面UI 实现。
**验证范围**：新空项目默认、三人会话与能力矩阵、写权矩阵、三道门禁、派发五条与快捷路径、账本字段/顺序/可还原性、一项目一待决定队列、`su → trio` 迁移（含全部失败分支）、旧 single 逐字兼容、UI 三权左树/副标题/空态/状态行/迁移按钮与预览确认。
**纪律**：只写 `test/测试/` 与 `角色卡/测试/` 自有文档；未改 `src/`、`app/`、其他角色测试或资料；未读取 `.env`、未使用真实凭据、未启动真实模型、未 git 提交。

## 一、环境

| 项 | 值 |
| --- | --- |
| 平台 | Windows 11 Home China（win32） |
| Node | v24.11.1 |
| 基线 | `main` / 工作树含本轮各角色在途改动（`git status` 快照见验证时点） |
| 测试命令 | `node --test "test/**/*.test.ts"`（**三层 glob**） |
| 类型检查 | `npm run typecheck`（TypeScript 7.0.2） |
| 网络/模型 | 全部离线；会话入口使用确定性桩适配器（脚本化工具调用，立即 settled，不触真实模型） |

## 二、夹具

新增目录 `test/测试/governance-trio-verify/`（`fixture.ts` + 5 个用例文件，**32 例**），全部在系统临时目录构造、用后清理：

- `fixture.ts`：临时项目根/角色目录/提案/流程单/账本条目/目录树快照/`waitForLedger`/确定性客户通道/捕获 gate 与能力的假适配器工厂/shell 规则（`classifyShell` + `defaultShellRules`，生产同源）。
- `a-listing-sessions-writes.test.ts`（4 例）：新空项目 `listProject`、三人会话（function 路由）、能力矩阵、写权矩阵。
- `b-gates-dispatch-ledger.test.ts`（7 例）：提案接受门/任命写入门/派发五条/快捷路径边界/账本坏 fail-closed 与 append 失败不翻转/账本契约与完整 flow 还原/一项目一待决定队列。
- `c-migration.test.ts`（6 例）：迁移预览零写入、确认迁移（未知字段/roles/pin 保留 + manifest 留痕 + 账本）、迁移后 su 隐藏/不可开启、already-trio、preview-stale、write-failed。
- `d-single-compat.test.ts`（5 例）：旧项目 single 判据与 S1 旧形状、su 能力集与预授权、su shell 审批档、回交/看护主人（single=su / trio=Convener）、S1 显式 trio。
- `e-ui.test.ts`（10 例）：`ui-labels.js` 纯函数（副标题/空态/状态行/迁移按钮/预览/失败视图）+ renderer 结构钉（三组顺序/数据驱动/迁移入口）+ 假 IPC Interface 契约。

关键判据：

- **零写入** = 完整目录树快照（路径 + 类型 + 文件内容 SHA-256）前后 `deepEqual`；迁移预览/失败分支另比对 mtime 之外的字节内容。
- **账本还原** = 只读 `.ans/governance/ledger.jsonl`，按 `artifact.observed` 的 `actorRoleId` 判「谁提案/谁提名/谁排程」，按 `customer.decision` 判「客户批了什么」，按 `dispatch.accepted` 判派发主人与目标。
- **假桌面** = 真实 `SessionManager` + 真实 `openRoleSession`，仅注入假适配器与假 listing/emit；**假 IPC** = 真实 `createDesktopInterface`，仅注入 listing/预览/迁移实现。

## 三、逐项结果

### 3.1 新空项目与三人会话

| # | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 空目录 `listProject`：恰 3 个 `builtIn`、顺序 rapporteur→nominator→convener、`primaryRoleId=rapporteur`、`governanceModel=trio`、无 su、无 warning | **通过** | a-1 |
| 2 | 三人会话可开：`--function proposal/nomination/schedule` 分别解析到三人；显式 `roleId` 一致；缺省 rapporteur；su / 非法组合明确拒绝 | **通过** | a-2 |
| 3 | 能力矩阵：dispatch/status/sessionTail/recovery 仅 Convener；installSkill/installMcp 仅 Nominator；`customerInput` 三人都有；三人均不注入 `reportHandback`（不自我回交）；Rapporteur/Nominator 无 shell 面；Convener 只读档 | **通过** | a-3 |
| 4 | Convener 只读档：allow 命令放行；risky 一律拒绝且不出客户审批卡 | **通过** | a-3 |

### 3.2 写权矩阵

| # | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| 5 | Rapporteur：`docs/proposals|contracts|governance/rapporteur` 放行；`角色卡/**`、`docs/nominations|flows`、`.ans/**`、治理边界、manifest、`src/**` 全拒 | **通过** | a-4 |
| 6 | Nominator 未任命写 `角色卡/**` 被任命门禁拒；技能/MCP/提名/自身记录范围按规矩放行；proposals/flows/应用独占全拒 | **通过** | a-4、b-2 |
| 7 | Convener：`docs/flows|governance/convener` 放行；`角色卡/**`、`.ans/**`、治理边界、manifest、proposals/nominations/skills/mcp、`src/**` 全拒 | **通过** | a-4、b-1 |
| 8 | 三人一致拒写 `.ans/project.json`、`.ans/governance/ledger.jsonl`、`角色卡/governance-boundary.yaml`、`docs/bootstrap-manifest.md`，文案指路「应用治理记录/其他治理角色」 | **通过** | a-4 |

### 3.3 三道门禁与派发

| # | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| 9 | 无提案接受：Convener 写 flow / Nominator 写 nomination 均拒；提案文件自称 `status: accepted` 不改变判定 | **通过** | b-1 |
| 10 | 无任命：Nominator 写 `角色卡/**` 拒；任命名单含目标后放行；名单外目标仍拒 | **通过** | b-2 |
| 11 | 派发五条：目标内置拒、无接受拒、不在任命名单拒、缺 flowId/stepId 拒、流程单无步骤拒、同 flowId+stepId 重复派发去重；拒绝时前端路由零调用 | **通过** | b-3 |
| 12 | 快捷路径：`accept-quick` + 既有项目角色放行；目标无角色目录 ⇒ 拒（新建角色仍须任命 + 写盘确认） | **通过** | b-3、b-4 |
| 13 | 账本坏（坏行）⇒ 四类门禁全部 `ledger-corrupt` 拒绝；`appendGovernanceLedger` fsync 失败只 `ok:false`、不抛、不放宽既有决定 | **通过** | b-5 |

### 3.4 账本与可还原性

| # | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| 14 | `customer.decision`：`flowId/actorRoleId/power=proposal/decisionKind=proposal-accept/customerDecision=accepted/artifactPath/artifactVersion/artifactSha256/decisionEvidence.kind=customer-input` 齐备 | **通过** | b-6 |
| 15 | `artifact.observed`：仅预授权目录、仅新增/变更的 `.md`；作者/职能/路径/版本/应用算哈希正确；顺序为客户决定先、settle 观察后 | **通过** | b-6 |
| 16 | `dispatch.accepted`：成功入队后写；`flowId/stepId/actorRoleId=convener/power=schedule/targetRoleId/runtime/messageSummary≤200` | **通过** | b-6 |
| 17 | 给定完整 flow 可还原「谁提案（rapporteur）、谁提名（nominator）、谁排程（convener + dispatch）、客户批了什么（proposal-accept + appointment targetRoleIds）」 | **通过** | b-6 |

### 3.5 一项目一待决定

| # | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| 18 | 第二张卡不呈现、`onQueued` 显示「等待前一个决定」；第一张结束后按序呈现第二张 | **通过** | b-7 |
| 19 | 不自动批准：无作答时 promise 不 settle（测试以 20ms 哨兵证明未自动通过） | **通过** | b-7 |
| 20 | 排队项 abort/会话失效 ⇒ 出队 + `unavailable` + 清队列；`rejectAllPending` 清空 active+queued | **通过** | b-7 |

### 3.6 迁移（V1b）

| # | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| 21 | 预览零写入；`model/targetModel/writePaths/modelField=null/manifestLine/pinChanges=[]/retainedFiles/snapshotDigest` 如实 | **通过** | c-1 |
| 22 | 确认迁移：`.ans` 仅新增/改 `governanceModel:"trio"`；未知字段、`roles`、pin 路径/哈希/顺序原样；角色卡/边界/历史 `docs/su/**` 字节不变；不建 `角色卡/su/` | **通过** | c-2 |
| 23 | manifest 既有全文保留 + 「治理模型升级（su → trio）」：时间、旧/新模型、变更文件、`.ans` 旧/新 SHA-256、客户确认 | **通过** | c-2 |
| 24 | 账本 `governance.migrated`：`actorRoleId=app/power=app/action=migrate/previewDigest` | **通过** | c-2 |
| 25 | 迁移后 `listProject` 无 su、三内置顺序不变；`resolveRole("su")` / `resolveGovernanceRole(su)` 拒绝；载入器把 `.ans` 的 trio 带进 `ProjectConfig` | **通过** | c-3 |
| 26 | `already-trio` / `no-record` / `preview-stale` / `write-failed`：状态、phase、模型、文案、零写入（write-failed 除已写 `.ans`）均符合 | **通过** | c-4～c-6 |

### 3.7 旧 single 逐字兼容

| # | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| 27 | 旧项目（有角色、无 `.ans`）仍 `single`、仅内置 su、`primaryRoleId=su`、无 warning；S1 旧形状不写 `governanceModel` | **通过** | d-1 |
| 28 | su 能力集（派发/看护/安装/审批档）与预授权四棵（docs/su、contracts、skills、mcp）逐项保留；不自我回交 | **通过** | d-2 |
| 29 | su shell 审批档：只读白名单免审批；risky/deny 弹客户卡，批准才执行、拒绝/不可用不执行 | **通过** | d-3 |
| 30 | 回交/看护主人：single=`su`；trio=`convener`（`watchdogSnapshot.governanceRoleId`） | **通过** | d-4 |
| 31 | S1 显式 trio：预览显示模型、建立写 `governanceModel:"trio"`、之后 su 隐藏；缺省 single 旧行为逐字不变 | **通过** | d-5 |

### 3.8 UI 与 Interface

| # | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| 32 | 三权副标题：报告员提案权 / 提名官提名权 / 召集人编排权，均写「不拥有最终批准权」；`builtinNote` 逐字 | **通过** | e-1 |
| 33 | 空态：Nominator/Convener 专属文案逐字；Rapporteur 沿用既有空态（null） | **通过** | e-2 |
| 34 | 状态行：治理模型（三权/旧模型）· 当前流程 · 四态；模型/状态缺失不猜；旧模型提示与决定徽标/排队文案逐字 | **通过** | e-3 |
| 35 | 左树三组顺序＝主入口 → 治理职能（内置）→ 其他角色；治理行由 `governanceFunction` 派生；renderer 代码不硬编码三人 id | **通过** | e-4 |
| 36 | 迁移按钮：桥齐备启用「查看差异 / 升级」、未接线禁用「升级入口待本版后续」；点击只开预览；确认按钮才调 `migrateGovernanceModel(projectRoot, snapshotDigest)` | **通过** | e-5、e-6 |
| 37 | 迁移预览/成功/失败视图：字段、摘要前 8 位、无摘要不发行；write 阶段失败绝不说「已升级/未写入」；already-trio/no-record 不提供重试 | **通过** | e-6 |
| 38 | 假 IPC：`listProject` 透传 `governanceModel`/`governanceFunction`/`primaryRoleId`；S1 预览/建立透传模型、非法模型 `invalid-request`；迁移预览/写入守卫与透传正确 | **通过** | e-7、e-8 |

## 四、既有断言修正（因契约变更，30 条；均未放宽）

只改 `test/测试/` 内本角色文件；其他角色测试未动。逐类说明：

1. **旧 su 空项目断言（t9-block1-bootstrap）**：新空项目默认 trio 后，su 创世只属于旧 single 模型。夹具显式 `governanceModel:"single"`；桌面链注入「旧 single 项目枚举形态」（内置 su + 项目角色）仍走真实 `buildProjectConfig`/`openRoleSession`；首例改为断言新空项目 trio 默认（3 内置/顺序/主入口）。
2. **CLI 创世链（cli-genesis-boundary）**：显式 single 注入（旧模型路径），保留原「恰 3 条种子、越界全拒、确认后落盘并收尾」断言。
3. **E1/E2/E3（existing-project-compat-verify）**：preload/Interface 两方法增可选 `options.governanceModel`——断言改为「同一方法 + 可选透传」，`confirm:true` 仍固定在桥内；渲染侧允许第二参。
4. **C5（existing-project-compat-verify）**：空项目 S0/su 种子用例显式按 single 构造（验旧模型兼容）；trio 默认另由新套件覆盖。
5. **预授权来源迁移（g1-copy-and-nails、g4-skill h-scope-audit）**：`SU_PREAUTHORIZED_WRITE_DIRS` 从 `run-role.ts` 迁到注册表 `LEGACY_SU_PREAUTHORIZED_DIRS`——改读**单一来源**，并反向断言编排不再另写第二份；治理会话预授权句改为「数据驱动或旧 su 字面量（single 分支）」。
6. **能力判据（g2 contract-freeze/scope-audit、g4-skill h、g4v2 k）**：`suppressHandback`/`role.builtIn` 判据改为能力矩阵（`cap.*`）与 `legacyBuiltIn`/`canSchedule`/`canNominate`；桌面三能力改为随 `canSchedule`（single=su / trio=Convener）。
7. **看护快照字段（g2 w1/r1/w3、turn-watch fixture）**：`suRoleId` → `governanceRoleId`（值=回交主人）；typecheck 4 错随之归零。
8. **安装拒绝文案（g4-skill e-handler、g4v2 f-handler）**：桌面 handler 文案由「或为治理角色 su」改为「或为内置治理角色」（trio 三人均适用）。
9. **U1 Esc 行尾（g2 u1-renderer）**：Windows 工作树 CRLF 下正则改 `\r?\n`，结构断言（preventDefault → respond(false) 紧邻）不变。
10. **安装类 schema 文案（g4-skill a-tools-surface、g4v2 c-tools）**：属主把 schema 从「或为治理角色 su」统一为「或为内置治理角色」后，同步两条**文案期望**（仅期望值，不放宽/不删断言）。

## 五、全量数字与红项归因

| 指标 | 基线（本轮开始） | 最终（两处缺陷修复后复审） | 说明 |
| --- | --- | --- | --- |
| `node --test "test/**/*.test.ts"` | 2628 tests / 2568 pass / **57 fail** / 3 skip | **2669 / 2650 pass / 16 fail / 3 skip** | 本角色新增 32 例全通过；两处实现修复另使 CLI/装配 11 条既有红转绿；**新增红 0**；共固定 41 条（本角色断言修正 30 + 实现修复 11） |
| `npm run typecheck` | **4 错**（本角色 4 处 `suRoleId`） | **0 错** | 本角色 4 处已按新字段修正；最终复审仍 0 |

**最终 16 红（全部为既有，非本轮新增；`comm` 比对基线与上轮均无新增）**：

- **本角色 1 红**：`test/测试/g4-skill-verify/b-render-double-check.test.ts` —— Windows 创建符号链接 `EPERM`（环境限制；基线即红）。
- **其他角色 15 红**（未改其文件）：
  - Windows symlink/存储权限环境红 6：runtime-core session-store 2、pi-adapter 2、claude-adapter 1、codex-adapter 1；
  - runtime-core/tools 2（真实写 BOM/CRLF + 中止 shell 子进程竞态）；
  - 编排 shell-authorized-routine 1；
  - 桌面UI renderer 4 + runtime-ui 1（其属主在途源码钉）；
  - 桌面应用 markdown vendor pin 1。

**复审变化**：属主修复后，`real-entry`（1）与 `t1-real-cli` govern×3 转绿；装配 `govern-target` 2 + `multi-runtime` 5 亦因同一模型注入修复转绿。逐条比对：固定 41、新增 0。

## 六、发现的缺陷（两处均已在复审前由属主修复）

1. **CLI `ans govern <目录>` 未注入治理模型（已修复）** —— 属主：装配（`src/index.ts`），与编排协同。
   - 评审 §5.4 要求：`src/index.ts` 的 `ans govern <dir>` 配置注入同样调用 `readGovernanceModel`；无 `.ans` 且无项目角色 → trio，否则 single。
   - 首轮现状（已消除）：`loadInjection()` 未读/未写 `ProjectConfig.governanceModel`。对**新空目录**（`listProject` 推断 trio），`openGovernanceSession` 从枚举选到 `rapporteur`，但 `resolveRole` 按 `project.governanceModel ?? "single"` 走 single，返回 `parseError: "三权角色在 single 治理模型下不可用"`，CLI 以 `治理边界解析失败` 失败。
   - **复审修复**：`loadInjection` 现对「外来目标目录」调用共享 `readGovernanceModel` 并按与 `listProject` 同口径判定（显式值优先；不可读 → single；无 `.ans` 记录且无项目角色目录 → trio；其余 → single；结构异常保守按有角色处理）；`ans govern` 缺省/ans-cli 自身仍用载入配置。证据：`real-entry`（1）与 `t1-real-cli` govern×3 **转绿**；装配同源 7 红（`govern-target` 2 + `multi-runtime` 5）亦转绿。
2. **安装类工具 schema 文案未数据驱动（已修复）** —— 属主：运行时核心 / 桌面窗口。
   - 首轮现状（已消除）：`src/provider/runtime/schema.ts`（install_skill/uninstall_skill/install_mcp/uninstall_mcp 描述）写「角色不存在或为 su 自身＝…（或为治理角色 su）」，而桌面 handler 已为「（或为内置治理角色）」。
   - **复审修复**：schema 两处统一为「角色不存在或为内置治理角色＝`角色「<roleId>」不是本项目项目角色（或为内置治理角色）——未执行。`」。本角色同步两条**文案期望**（`g4-skill-verify/a-tools-surface`、`g4v2-mcp-verify/c-tools`，仅期望值改为新文案，不放宽、不删断言）。

## 七、未覆盖项（如实声明）

1. **真实模型轮次**：全部会话由确定性桩适配器驱动；未验证真实模型在三人会话中的工具选择、提示词服从与多轮交互。
2. **真实 Electron 目检**：UI 以 `ui-labels.js` 纯函数行为 + renderer 源码结构 + 假 IPC 验证；未启动 Electron 做像素/布局目检（未运行真实环境）。
3. **跨进程并发**：账本追加串行链与迁移/建立互斥均为**进程内**；未验证多进程同时写 `.ans/governance/ledger.jsonl` 或同时迁移（设计亦为进程内约束，V2 再议）。
4. **三人间完整回交投递**：本套件验证了回交/看护**主人**（`governanceRoleId`：single=su / trio=convener）与派发门禁；完整「项目角色 settle → 回交投递进 Convener → Rapporteur 镜像」链路由桌面窗口属主测试覆盖，本套件未重复驱动。
5. **真实凭据/网络**：未读取 `.env`、未发起任何网络请求。

## 八、结论

- 三权 V1 + V1b 的**新空项目默认、三人会话与能力矩阵、写权矩阵、三道门禁、派发五条、快捷路径、账本契约与可还原性、一卡队列、迁移全分支、旧 single 兼容、UI 最小面**在离线确定性夹具下**逐项通过**（32/32；两处缺陷修复后复审仍 32/32）。
- 本角色既有断言修正 30 条，均为契约变更导致的签名/判据/文案/字段迁移，**未放宽、未跳过、未隐藏错误**；两处实现修复另使 11 条既有红转绿；typecheck 由 4 错归零。
- 首轮发现 **1 项阻塞性契约缺口**（CLI 空目录未注入 `governanceModel`）与 **1 项轻度文案偏差**，**均已在复审前由属主修复**并转绿；最终 16 红全部为既有（Windows 环境 7、其他角色在途/竞态 9），**新增红 0**。
