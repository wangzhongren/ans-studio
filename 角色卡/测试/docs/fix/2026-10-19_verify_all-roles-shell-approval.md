---
id: all-roles-shell-approval-independent-verification
type: fix
title: 五角色 shell 审批档落地后的 test/测试 断言翻转与全仓独立复核（测试角色）
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: verified
related: [all-roles-shell-approval-sync, all-roles-shell-approval-wiring, governance-trio, governance-liaison-review, write-confirm-preview-completeness]
events:
  - date: "2026-10-19"
    kind: created
    summary: 客户新规则「所有角色都有 shell 权限（含读写与任意命令），一律提交审批」由各属主落地后，翻转 test/测试 两文件 3 处旧断言（五角色统一 operator-approve、传审批档即 arm；断言只增强不放宽），并做全仓回归——全量 3050/3044 pass/4 fail/2 skip；4 红经 git archive HEAD 干净基线复跑逐一确认为 HEAD 既有（runtime-ui localStorage、u1-renderer、g-desktop、t29），本批新增红 0；typecheck 0
---

# 五角色 shell 审批档：test/测试 断言翻转与全仓独立复核

## 结论

- 客户 2026-10-19 新规则（原文：「所有的角色，都应该有有运行shell 的权限，包括读写，以及任何的需要命令的权限，只不过都要提交审批，按照原有的流程审批。」）由门禁引擎 / 编排 / 桌面窗口 / 装配各属主落地：五个内置治理角色与 su 统一 `shell: "operator-approve"`。
- 本角色只改 `test/测试/**` 两文件、3 处旧断言（Liaison「无 shell 面」、caps `deepEqual shell:"none"`、trio「误传 approval 不 arm」），**未放宽任何既有断言**；并补强审批档语义断言（arm / allow 0 卡直放 / risky 逐条审批 / 拒绝与不可用 fail-closed）。
- **全仓** `node --test "test/**/*.test.ts"`：**3050 计 / 3044 过 / 4 红 / 2 skip**（27.1s）。4 红全部经 `git archive HEAD`（6d40eee）干净基线**同样复现**，逐一归因 HEAD 既有提交，**本批新增红 0**。2 skip 均为 Windows 平台条件用例。
- `test/测试`：修前 **782/777/5/0**，修后 **782/779/3/0**——3 红即上述 HEAD 既有（u1-renderer:96、g-desktop:65、t29:273）。
- `npm run typecheck`：**exit 0，0 错**。
- 未 git 提交。未改 `src/`、`app/`、其他角色资料；未读 `.env`、未跑真实模型、未启动 Electron。

## 1. 冻结绑定

| 项 | 值 |
| --- | --- |
| 仓库 | `/Users/wangzhongren/code/vibeingcode/解压/ans-runtime` |
| HEAD | **6d40eee6ea0a84ecbad6884141bfe75e28e90a5a**（`main`，`fix: 推理强度恢复下拉并显示中文档位`） |
| 工作树 | 67 条变更（54 M + 13 ??），含五角色 shell 规则、写卡 preview 完整性闸、shell 判断并发池等各属主在途改动 |
| 本角色本批改动 | 仅 `test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts`、`test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts`（＋本记录与 changelog） |
| 干净基线 | `git archive HEAD` → `/tmp/ans-head-clean`，符号链接本仓 `node_modules` |

关键文件 sha256（本机实测；供后续比对工作树是否漂移）：

| sha256 | 文件 |
| --- | --- |
| `58db7a84068ac4b1e07a57987835effb919e2b8f1656af92dd07b74f476699a0` | `src/common/门禁引擎/governance-roles.ts` |
| `cd1fcf66186c9cc8f38331ab81977cde56d84e269b3752520817ed3afa067d0e` | `src/pipeline/orchestration/run-role.ts` |
| `fe1278b6fd393d3d068cd78f59fda711fe595d162369af6c74efdade85ddba12` | `src/pipeline/orchestration/shell-arming.ts` |
| `862697392b520ab8c3813d93611751b27a9124cf8eb385c70f48edbcd0f8c2af` | `src/pipeline/orchestration/govern-session.ts` |
| `356faba43a80806c488d89cfa073965c417db9de21f889cc1f6b26744d20ddbe` | `src/common/编排/confirmed-writes.ts` |
| `66762332a8945f2f6251c6a020c82fbed92ed6c75b5ec058959f4238d19a3800` | `src/common/编排/governance-judge-facts.ts` |
| `fd360458d29dc15a35af8c4dd910124b6dae5d22e9953ea9d8bef2eea95a7a37` | `src/common/编排/shell-judge.ts` |
| `5d9aeb32b590898688acedacb84b07172e111f0354aee53dca2ab2ee26845d05` | `src/provider/runtime/schema.ts` |
| `91a4e5d2c39f09b25aeb2c29c9567f079b0f56bb311153c4bf2e86bb9aedb303` | `src/provider/runtime/tools.ts` |
| `87cd98fe52d814f52bdaa7c6c3dcdff5bd93194355e152212138029b1d0e7109` | `app/desktop/interface.ts` |
| `7f205b490621b6c14631602e0767b423e459d06a515b8ff5fd35bb0f612d20d8` | `app/desktop/operator-channel.ts` |
| `7eef478731555f3a2d7020a0c12b2ce095069e3d72121ae6884b642b0b1fb1ac` | `app/desktop/session.ts` |
| `19ce3ec08a41b787291d8aebdc55af73d066add9da58096bef5ccf4d7281a722` | `app/main.ts` |
| `ef81f3c114a3b1fd8d9280fecd3cd31046361196e06b7fa2e8fa18cb700ef874` | `test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts` |
| `0cfb8c4abdbb6a1a63739d828a77828a8888f3ce683788833458cc97be6db41f` | `test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts` |

## 2. 环境与口径

| 项 | 值 |
| --- | --- |
| 平台 | macOS Darwin 25.6.0（arm64） |
| Node | v24.14.0（原生 TS type stripping） |
| TypeScript | 7.0.2（`tsc --noEmit`） |
| 全仓命令 | `node --test "test/**/*.test.ts"`（带引号走 Node 内建 glob） |
| 网络/模型 | 全部离线；会话入口使用确定性桩适配器 |

## 3. 全仓计数与逐红判定

全仓实测：**tests 3050 / pass 3044 / fail 4 / cancelled 0 / skipped 2 / todo 0**（27.1s）。2 个 skip 均为平台条件：`Windows 反斜杠路径也识别为角色边界文件（平台条件）`、`规范化：Windows 大小写不敏感（仅 win32）`。

干净基线复跑（`/tmp/ans-head-clean`，HEAD=6d40eee，无工作树改动；4 个红文件合计）：**33 计 / 29 过 / 4 红 / 0 skip**——与工作树完全相同的 4 红。

| # | 红灯 | 失败点 | 干净 HEAD | 判定 / 归因 |
| --- | --- | --- | --- | --- |
| 1 | `test/桌面应用/runtime-ui.test.ts:65` | 断言 renderer 源码**不得出现** `localStorage` 等；现 `app/renderer/renderer.js` 用 `window.localStorage` 持久化侧栏宽度/折叠 | **同样红** | HEAD 既有。`923206f feat: 左树角色分组折叠`（2026-10-18，HEAD 祖先）引入侧栏 localStorage；测试侧预期未跟进。与本批无关 |
| 2 | `test/测试/g2-verify/u1-renderer.test.ts:96` | 源码钉期望 `inj.label + (inj.sourceRoleId ? " · 来自 " + inj.sourceRoleId : "")`；现 renderer 用 `sourceName` | **同样红** | HEAD 既有。`be3ab2c fix: 聊天与右侧标题使用治理角色显示名`；测试侧预期落后。与本批无关 |
| 3 | `test/测试/g5-reasoning-verify/g-desktop.test.ts:65` | 源码钉期望 `choices.map(function (c) { … esc(String(c)) … })`；现 renderer 为 `choices.map(function (c, index) { … optionText … })` | **同样红** | HEAD 既有。`6d40eee fix: 推理强度恢复下拉并显示中文档位`（HEAD 本身）；测试侧预期落后。与本批无关 |
| 4 | `test/测试/t29-pi-config-roundtrip.test.ts:273` | 错误文案须列出 `off / low / medium / high / xhigh`；现文案为「仅接受 关 / 低 / 中 / 高 / 极高」 | **同样红** | HEAD 既有。可选值标签机制由 `b64d619 feat: Pi 设置滑块档位与整数校验`（2026-10-17）引入，`6d40eee` 换成中文档位；测试仍期望 raw 英文值。与本批无关 |

补充核对：上表涉及的 `app/renderer/renderer.js`、`app/desktop/runtime-config.ts`、`src/common/shared/runtime-settings.ts`、`src/common/runtime-core/reasoning.ts` 及 4 个测试文件在工作树中**均未被修改**（`git status --short -- <files>` 为空）——不存在「本批改动把它们改红」的路径。

**结论：本批（五角色 shell 规则、写卡 preview 完整性闸、shell 判断并发池等）新增红 0。**

## 4. 任务 A：3 处旧断言翻转（只增强、不放宽）

### 4.1 `test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts`

| 位置（原） | 旧断言 | 新断言 |
| --- | --- | --- |
| 能力矩阵 L265 | `l.shellGate === undefined`（Liaison 无 shell 面，误传审批档也不 arm） | `typeof l.shellGate === "function"`（Liaison 有审批档 shell，客户 2026-10-19） |
| 能力矩阵 L313 | `deepEqual(spec.capabilities, { …, shell: "none" })` | 同结构 `shell: "operator-approve"`（其余 9 项逐字不变） |
| 能力矩阵装配 | 五角色统一只传旧只读档 `shellReadonly` | 五角色统一传**审批档** `shellOperatorOnly`（(c) 分类器 + (a) 操作者通道） |

新增/保留的强度：五角色逐一断言 `shellGate` 已 arm；`ls`（allow）直放且**操作者 0 次调用**；`rm`（risky）经审批后才放行且**恰 1 次调用**；Verifier 也补 `shellGate` 断言。其余能力断言（handOffIntent / requestClarification / dispatch / status / sessionTail / recovery / install / customerInput 的注入面）逐条未动。

### 4.2 `test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts`

| 位置（原） | 旧断言 | 新断言 |
| --- | --- | --- |
| 能力矩阵 L177–179 | `r/n/c.shellGate === undefined`（rapporteur/nominator「无 shell 面」、convener「误传审批档 ⇒ 不 arm」） | 三角色 `typeof shellGate === "function"`（能力位统一 `operator-approve`，传审批档即 arm） |
| 能力矩阵装配 | 三角色传 `shellOperatorOnly`，同时给 convener 另传 `shellReadonly`（两档并存，新逻辑下互斥不 arm） | 三角色只传 `shellOperatorOnly`（与新桌面接线一致）；旧只读档另起独立兼容用例 |

新增强度：三角色逐一验证 allow 直放 0 卡、risky 逐条审批后放行；新增 rapporteur 操作者**拒绝**与 nominator 通道**不可用**两个会话，断言 `allow:false`（审批链 fail-closed）。原来的旧只读档兼容块**断言逐字保留**（allow 放行、risky 一律拒绝），仅把注释从「真实桌面形态」更正为「旧兼容路径（2026-10-19 起桌面不再注入）」。写权矩阵、派发/安装/回交等其余断言未动。

### 4.3 复跑

| 命令 | 修前 | 修后 |
| --- | --- | --- |
| 上述两文件定向 `node --test`（12 例） | 2 红（本批相关） | **12 / 12 过** |
| `node --test "test/测试/**/*.test.ts"` | 782 计 / 777 过 / 5 红 / 0 skip | **782 计 / 779 过 / 3 红 / 0 skip** |
| `node --test "test/**/*.test.ts"`（全仓） | — | **3050 计 / 3044 过 / 4 红 / 2 skip** |
| `npm run typecheck` | — | **exit 0（0 错）** |

## 5. 五角色能力与桌面接线的只读核对

### 5.1 门禁引擎注册表（`src/common/门禁引擎/governance-roles.ts`）

只读脚本实测（直接导入注册表）：

| 角色 | `capabilities.shell` | Section 1（可写目录） |
| --- | --- | --- |
| liaison | `operator-approve` | `docs/intents/` |
| rapporteur | `operator-approve` | `docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/` |
| nominator | `operator-approve` | `角色卡/`、`docs/nominations/`、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` |
| convener | `operator-approve` | `docs/flows/`、`docs/workflow.md`、`docs/governance/convener/` |
| verifier | `operator-approve` | `docs/verification/`、`docs/governance/verifier/` |
| su（single 旧行为） | `operator-approve`（`LEGACY_SU_CAPABILITIES`） | 旧四棵预授权不变 |

- 五张内置角色卡均含统一 `SHELL_APPROVAL_CARD_LINE`（只读白名单直接执行，其余含读写与任意命令逐条提交客户/判断 agent 审批；拒绝/超时/不可用不放行；写文件仍优先 `write_file`）。
- 应用专用边界 `appGovernanceEntries()` 恰四项：`角色卡/governance-boundary.yaml`、`.ans/`、`docs/bootstrap-manifest.md`、`docs/audit/`；**五角色的 Section 1 均不含 `docs/audit/`**（审计只由应用写）。

### 5.2 编排（`src/pipeline/orchestration/run-role.ts`）

- 审批档按**能力位**装配：仅当 `shellOperatorOnly` 给出、未同时给 `shellReadonly`、且 `cap?.shell === "operator-approve"` 时 `assembleOperatorShellGate`；任一不满足 ⇒ **不 arm** 并记诊断（项目角色 `cap undefined`、旧 `none/readonly` 误传均被挡，三层链不可被绕过）。
- 旧 `shellReadonly` 兼容路径仍在：`cap.shell === "none"` 才拒；其余（含新五角色）可走只读档——执行集严格 ⊆ 审批档，**更严不放宽**。
- 项目角色仍走原三层链（`shellOperatorChannel` + `shellArming`），代码路径未变。
- `run_shell` 仅在 `shellGate` 注入时注册；执行前必须 `await shellGate(req)` 且**恰好 `allow:true`** 才 spawn（`src/provider/runtime/tools.ts:790/2016`），`cwd` 钉在 `adapterInput.projectRoot`（`src/provider/pi/session.ts:395`）。

### 5.3 桌面窗口（`app/main.ts`、`app/desktop/session.ts`）

- `main.ts`：`shellArming` 与 `shellOperatorChannel` **同备才注入**（`DESKTOP_SHELL_GATE_ARMED`；规则集加载失败 ⇒ 二者皆不注入 ⇒ `run_shell` 不注册，fail-closed）。
- `session.ts`：判据 `role.builtIn === true`（single 的 su 与 trio 五人）⇒
  - `shellArming = undefined`（不走三层链）；
  - `shellOperatorOnly = { classifyShell, rules, operatorChannel }`（与项目角色**同一份** deps 引用，单一来源）；
  - **不注入** `shellOperatorChannel` 字段（内置角色的 (a) 通道在 `shellOperatorOnly` 内），**不再注入** `shellReadonly`。
- 项目角色：`shellOperatorChannel` + `shellArming` 原样保留，走三层链。
- 本机全仓运行中 `test/桌面应用` 仅 `runtime-ui.test.ts:65` 一红（HEAD 既有，见 §3）；属主报告的 585/586 与全仓口径一致。

### 5.4 审计

- 路径单一来源：`SHELL_AUDIT_REL_PATH = "docs/audit/shell-gate.jsonl"`（`src/common/编排/shell-audit.ts:25`）。
- 审计边界在 trio 下映射为应用专用边界（含 `docs/audit/`）；五角色不可写该目录；审计写失败**不翻转判定**（既有语义，本次未改）。

## 6. 残余风险（如实登记）

1. **shell 副作用不受文件写门禁约束，审批链是唯一控制。** `write_file`/`edit_file` 走 `resolveWrite`；`run_shell` 获批命令后以**当前 OS 用户权限**执行，`cwd` 虽钉项目根，但命令可写到 Section 1 之外甚至项目外（如 `sh -c`、重定向）。su 角色卡已完整披露「批准的是这一次命令，不是新的写权；可能写到项目外」；**五张内置角色卡的统一 shell 行只写「审批不改变职责与写边界、写文件仍优先 write_file」，未逐字含「可能写到项目外/当前 OS 用户权限」的升级披露**——是否统一补全属门禁引擎属主/PM 决定，本角色未改产品文本。
2. **只读白名单（(c)=allow）免审批直执行。** 审批链只覆盖 `risky/review/deny`；若 `classifyShell`/`defaultShellRules` 把有副作用的命令误判为 `allow`，将不经任何卡片执行。规则集是门禁引擎数据，测试只验证既有分类样例，不能证明分类完备。
3. **审计是 best-effort 且不翻转判定。** 项目未 bootstrap/边界未接受时审计写被门禁拒（stderr 如实），命令仍可按审批结果执行——存在「已执行但审计缺行」的过渡窗口（既有语义，本批未改）。
4. **桌面 shell 依赖两件同备。** `deps.shellArming` 或 `deps.shellOperatorChannel` 任一缺省（如规则集加载失败）⇒ 内置治理角色无 shell（fail-closed）。这是产品既定取舍，但客户可能感知为「规则说所有角色都有 shell，实际不可用」——需以诊断日志如实解释。
5. **本批其他在途改动（写卡 preview 完整性闸、shell 判断并发池）**不在本记录验证对象内；全仓无新增红可作旁证，但未在本轮做逐项语义复核。

## 7. 未验边界

- 未启动真实 Electron、未跑真实模型/凭据/网络；桌面接线的结论来自源码只读核对与离线测试（`test/桌面应用`、`test/测试`），不代替真机验收。
- 未运行 Windows 平台条件用例（2 skip）。
- 4 个 HEAD 既有红**未修**（测试侧预期落后于 HEAD 产品变更，需另行按属主变更收口）；本记录不宣称全仓全绿。
- 未 git 提交；工作树中其他角色的 54 M + 13 ?? 改动不在本角色边界内，未触碰。
