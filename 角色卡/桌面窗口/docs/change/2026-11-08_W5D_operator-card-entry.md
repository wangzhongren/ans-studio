# W5-D 证据：审批卡展示 entry / protectedScope / roleId（加法字段，不改判定）

- **任务**：`2026-11-08-session-admission-approval`（flowId `session-admission-approval-based`）W5-D（桌面窗口）
- **记录角色**：桌面窗口（固定 worker 上下文）
- **日期**：2026-11-08
- **检出**：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（worktree；HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`；Node v24.22.1；Windows 11 Pro 10.0.26300）
- **性质**：本角色自证证据，**不是验收结论**（B2 独立验收按 B1 v1 判定）；未提交/未推送/未暂存/未合并/未发布；未运行真实模型、未启动桌面应用；未修改本批次写集外任何文件。
- **自引用声明**：本文件不嵌入自身 SHA-256（落盘后由完成报告/验收复算）；其余文件 hash 均为写盘后原字节复算（`sha256sum`）。

---

## 1. 输入（本批开工时实测，与派发记录一致）

| 输入 | 路径 | 行数 / 字节 / SHA-256 |
| --- | --- | --- |
| 派发与接口评审（I0） | `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md` | 84 / 13909 / `28a9d762a58cf6f25c57ad3641df5636d9ab5ffc48d0f8abca23ce967492a6a3` |
| 设计 **P1.3**（实施基线） | `docs/planning/2026-11-08_design_session-admission-approval-based.md` | 855 / 130013 / `2553b97ac2338c786f17c860153c1b30abc874c4ffc84392954a5d7f949166e3` |
| B1 v1（唯一判据） | `docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md` | 185 / 29020 / `fb88112627c3a5361934a1d3810bea2866b60305d67af6dd8cf39307cce8e1c1` |
| W1b+W2b+W3b 编排证据（只读） | `角色卡/编排/docs/change/2026-11-08_W1bW2bW3b_shell-wiring.md` | 195 / 24660 / `648204a9aedadc7a632b4fd436e69203e18040380128da15624622741c040352` |
| 运行时核心 Model（只读消费） | `src/model/runtime.ts` | 4046 / 203732 / `c4dae5572039f46c8f6e2b09f32d6f7d8982247ed2a44fa336f0bde02c0a0a38` |
| 运行时核心 tools（只读消费） | `src/provider/runtime/tools.ts` | 5387 / 330259 / `c37793ca24b88c21ede9b69c52ee3e6c26416095c187682318bf909698fbe8d8` |
| 编排 run-role（只读消费） | `src/pipeline/orchestration/run-role.ts` | 3647 / 237507 / `dd873dcc6404fc9e2a2014b51371e4e261e88aa47e5f23bf2b26706722782dee` |
| 编排 shell-gate（只读消费） | `src/common/编排/shell-gate.ts` | 1626 / 94817 / `81bafbe56340601d879f8789af1decb803011b36da50827b1686468d9d42c1aa` |
| 编排 shell-arming（只读消费） | `src/pipeline/orchestration/shell-arming.ts` | 474 / 31543 / `b4a121d2631413dc40239fdb140663ae0c58dd6fdfe0642456c5433efee753f5` |
| trunk 只读 Git 执行（只读消费） | `src/provider/trunk/impl/git-command.ts` | 724 / 63945 / `ac723f843fe73270335f0a3f4070fb3dd76ddc1b0ae1fb6222470dd3ad9f8321` |
| trunk 公共出口（只读消费） | `src/provider/trunk/public/trunk-store.ts` | 58 / 3832 / `c89716b58568e9872c80d266a672a7c538fbea9b0ab5581dfd0e6d655a435d8d` |

---

## 2. 写集与逐文件 SHA-256（写盘后复算）

| # | 文件 | 类型 | 行数（前→后） | 字节（后） | SHA-256（后） |
| --- | --- | --- | --- | --- | --- |
| 1 | `app/desktop/operator-channel.ts` | 修改（`ShellConfirmRequest` 加法字段；`buildShellConfirmRequest` 可选第四参；presenter 透传） | 1116 → 1155 | 70985 | `fb6995921b7508b4600f2bf6a7c0e71c21d3510a614b88689d27d969a7b4e919` |
| 2 | `test/桌面应用/operator-channel.test.ts` | 修改（新增 2 个用例：数据面 + presenter 接线） | 1948 → 2028 | 120391 | `0ccc70c5d455c2d4e19a009edfd64727a618ac3aaea1c9863aef3831ef0bebfc` |
| 3 | `app/desktop/session.ts` | **未改**（只读核对，结论见 §5） | 11153（不变） | 721725 | `b92ac8fef31e2e8c3622e05a8430f0bc89c907c88440f518919a44d79a8841cf` |
| 4 | `app/main.ts` | **未改**（IPC 整对象透传，无需加法，见 §3.3） | 1297（不变） | 83599 | `339fcfaa4d0daaf7b79fa8381743ce4ec2eb0f205bd9c5705cc4ac6f4d532bba` |
| 5 | `角色卡/桌面窗口/docs/change/2026-11-08_W5D_operator-card-entry.md` | 新增（本证据） | 见落盘报告 | 见落盘报告 | 见落盘报告 |

**实施前基线哈希**：`app/desktop/operator-channel.ts` = `67cd7be6ba1f3bbb6db21223595ddbfa427f5714eca9471ed8adee3086b1b948`（1116 行）；`test/桌面应用/operator-channel.test.ts` = `639cf8f4dbaab30e4cec12c2909d9632cc53350b00e5d74e43a860d303d0b7cd`（1948 行）。证据运行前后对上述两文件换回基线/换回候选各复算一次，哈希一致（失败名单对照见 §6）。

**写集核对**：`git status --porcelain -- app/` 对本角色仅显示 `M app/desktop/operator-channel.ts`；同目录的 `app/renderer/src/chat/judge.ts`、`app/renderer/src/shell/ConfirmCard.tsx` 属「桌面UI」角色的未提交改动，本批未触碰。未修改 `src/`、其他测试目录、角色卡/边界/方案/验收/沟通/调度文件；**未新建 `test/桌面应用/` 文件**（无 H1 触发）。

---

## 3. 实现摘要

### 3.1 `app/desktop/operator-channel.ts`

- `ShellConfirmRequest`（桌面自有数据面，主进程 → 渲染侧）增加**可选**加法字段：
  - `entry?: "run_shell" | "start_background_task"`——卡片显示「前台命令 / 后台任务」；
  - `protectedScope?: boolean`——仅 `true` 表示「受保护项目：非只读操作需审批并审计」。
  两个字段**仅展示、不参与判定**；`roleId?: string` 既有字段不变（本批补齐其写入路径）。
- `buildShellConfirmRequest(id, display, roleDisplayName?, operator?)` 保持**纯函数**，新增可选第四参
  `ShellConfirmOperatorFacts { entry?; roleId?; protectedScope? }`：
  - 运行时防御：`entry` 仅接受两个已知字面量；`roleId` 仅非空字符串；`protectedScope` 仅 `true` 写入；
  - 缺省/未知值**不写字段**——旧调用方（三参）产出的卡面逐字不变；
  - 既有 `kind/command/summary/reasonPlain/reasonRaw/argvLines/cwd/tier/policy/judgeNotice` 逐字不变。
- `createShellConfirmPresenter.present(prompt, display, metadata)`：
  - `prompt.entry` / `prompt.protectedScope` 写入请求（缺省不写）；
  - `roleId` 以 `prompt.roleId` 优先、`metadata.roleId` 兜底（两者都来自宿主闭包，不信任渲染侧）；
    `metadata` 在场时仍按既有行为写 `roleId/projectRoot/runtime`；
  - **判定不变**：仍「恰 `allow:true` 才放行」，超时/中止/未知 id 语义与诊断事件全部不变。
- **升级卡 presenter 与通道逻辑未改**：`createDesktopOperatorChannel`（「替我审批」/manual/row-failed/
  结果行）、`shell-escalation` 卡片、共享呈现槽仲裁均零改动；本批不改变任何审核/审批结论。

### 3.2 `app/desktop/session.ts`（只读核对，无改动）

见 §5：`readonlyGit`/`roleId`/`auditFailurePolicy` 均由编排 `openRoleSession` 内部构造并经官方工厂
`capabilities` 透传，桌面装配入口已在该路径上；桌面侧无需注入；「装配缺件 = 不 arm」的 fail-closed
语义未触碰。

### 3.3 `app/main.ts`（无需改动，依据）

审批卡经 `createShellConfirmPresenter({ present: (request) => win.webContents.send("shell:confirm-request", request) })`
整对象推达渲染侧（`app/main.ts:663-670`），新字段随结构化克隆原样过桥；主进程无字段白名单/裁剪。
`shell:confirm-response` 路由（`app/main.ts:706-709`）只消费回包的 `id/allow`（及升级卡 `action`），
不读取新字段——**卡面字段不进入任何判定**。故本批对 `app/main.ts` 无加法。

---

## 4. I0 接口约束确认（本批适用项，偏差 = 0）

| # | 结论 | 本批执行情况 |
| --- | --- | --- |
| I0-4 | 只读 Git 采用注入能力对象；由 `run-role`/桌面装配从 `matchReadonlyGit` + `executeReadonlyGit` 构造并注入；工具不得回退通用 spawn | 桌面不自行构造；经 `openRoleSession` → 官方工厂 `capabilities.readonlyGit` 路径获得（§5）。本批未改该链路 |
| I0-6 | `auditFailurePolicy` 默认 observe；受保护由 `assemble*` 启用 `deny-non-readonly`（`run-role` 传保护状态） | 桌面无直接 gate 构造；`openRoleSession` 两装配分支均按 `roleCapabilityProtection.state` 传（§5 锚点）。本批未改 |
| I0-7 | 只读 Git 审计 `readonlyGit:{id,canonicalArgv}`、`by` 前缀、`branch:"c-allow"` | 属编排/门禁；桌面卡面不消费审计字段。本批未改 |
| I0-8 | P1.3 勘误 E1–E4 按实际路径/owner | 本批只写 `app/desktop/operator-channel.ts`、既有桌面测试与自身 `docs/change/`；未触碰其他 owner 文件 |
| I0-9 | 依赖方向：binding 只依赖 model；`ReadonlyGitMatch` 经 shell-rules 再导出；model 侧不透明 | 桌面仅经 `OperatorPrompt`（model）类型消费 `entry/roleId/protectedScope`；未新增第二份定义 |
| I0-10 | 不重开 I0；新增偏差须停止回报 | **无偏差**（见 §8） |

---

## 5. 桌面注入只读核对结论（readonlyGit / roleId / auditFailurePolicy）

**结论：桌面装配入口已在编排的内部构造/透传路径上，本批无需在 `session.ts` 注入；「缺件 = 不 arm」不变。**

调用链（逐锚点，均为当前工作树只读核对）：

1. **桌面默认真实实现**：`app/desktop/interface.ts:997` `openRoleSessionFn = deps.openRoleSessionFn ?? realOpenRoleSession`；
   `:1203-1204` 未注入测试桩时 `runtimeFactory = realCreateRuntimeAdapterFactory`；`:2134-2141`
   `SessionManager({ openRoleSession: openRoleSessionFn, createRuntimeAdapterFactory: runtimeFactory })`。
2. **SessionManager 构造适配器**：`app/desktop/session.ts:4029-4037`——`this.deps.createRuntimeAdapterFactory(project, runtime, {...sessionRuntimeOptions, shellGate})`
   （真实 builder 返回 `officialCoreAdapterFactories` 中的官方工厂）；pi/demo 兼容分支与
   `createRuntimeAdapterFactory` 兜底同样产出官方工厂。
3. **会话开启**：`app/desktop/session.ts:4101-4102`（bounded chief）、`:4241-4247`（普通角色）→
   `openObservedRoleSession(..., { createAdapter })` → `:1589` `this.deps.openRoleSession(input, deps)`。
4. **编排内部构造/透传**（`src/pipeline/orchestration/run-role.ts`）：
   - `:1886-1889` 构造 `readonlyGit = { match: matchReadonlyGit, execute: executeReadonlyGit(projectRoot, ...) }`；
   - `:2133` `capabilities.readonlyGit`、`:2134` `capabilities.roleId = setup.role.id`；
   - `:2142-2147` `const adapter = createAdapter(gate, capabilities)`——桌面传入的官方工厂收到能力面；
   - `:3569-3572` 官方工厂 `readonlyGit: capabilities?.readonlyGit ?? options.readonlyGit` → `createRuntimeAdapter` 选项；
   - `:1838-1840`（审批档）/`:1873-1874`（项目角色三层链）：`auditFailurePolicy: roleCapabilityProtection.state === "required" ? "deny-non-readonly" : "observe"`。
5. **Service 注入 roleId**：`src/service/runtime/session.ts:51` `RuntimeSessionOptions` 已 `Omit` 调用方 `roleId`；
   `:507` `buildGovernedTools(..., { ...options, roleId: role.id, ... })`——官方工厂按真实绑定角色注入，不采用调用方值。
6. **桌面侧无第二套 gate/能力**：`grep -rn "createShellGate|assembleProjectShellGate|assembleOperatorShellGate|buildShellGate" app/`
   只命中注释；`grep -rn "readonlyGit" app/` 零命中。桌面不构造 gate、不构造 matcher/matcher 能力。
7. **fail-closed 语义未变**：`session.ts:3985-3992`（内置角色审批档缺件不传）、
   `run-role.ts:1843/1856/1878`（装配失败 ⇒ `shellGate = undefined` ⇒ `run_shell` 不注册）。

---

## 6. 受影响套件实施前后对照

### 6.1 命令与环境

```
node --test test/桌面应用/operator-channel.test.ts test/桌面应用/shell-escalation.test.ts \
           test/桌面应用/diagnostics.test.ts test/桌面应用/multi-runtime.test.ts
```

Node `v24.22.1`，Windows 11 Pro（10.0.26300），同一 worktree 现状（含 W1/W2/W3/W4、T1 等其他角色未提交改动）。
**说明（如实）**：派发示例命令中的 `test/桌面应用/operator-wiring.test.ts` 与 `test/桌面应用/session.test.ts`
在本检出**不存在**——二者已于 `4c24149`（test(batch-D3): register D removals and evidence）删除，且
`test/桌面应用/` 逐文件授权、**不得新建**（条件 H1）；本批改用仍存在的、会消费审批卡/presenter 的既有
套件（`operator-channel`、`shell-escalation`、`diagnostics`、`multi-runtime`）做前后对照。
`node --test` 的 `--test-force-exit` 未使用；本组套件无挂起（自然退出）。

### 6.2 计数

| 时点 | tests | pass | fail | cancelled | skipped | todo | 退出码 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **实施前**（批次开工时基线，哈希见 §2） | 126 | 117 | 9 | 0 | 0 | 0 | 1（既有红） |
| **实施后**（本批候选，最终复跑） | 128 | 119 | 9 | 0 | 0 | 0 | 1（同名同数既有红） |
| 增量 | **+2** | **+2** | **0** | 0 | **0** | 0 | — |

（仅两套件时：实施前 79 / 78 pass / 1 fail；实施后 81 / 80 pass / 1 fail——同一既有红。）

### 6.3 失败集合对照（同名同数，diff 空）

实施前/实施后各 9 个失败，按「测试名」排序后 `diff -u` 为空（两条原始日志与名单在本地临时目录，按 B0
豁免口径不入库；名单如下，全部为工作树既有环境/上游事实，与本批写集无调用关系）：

1. `D1 actual Pipeline/Service chooses claude, writes isolated replay and converts native context honestly`
2. `D1 actual Pipeline/Service chooses codex, writes isolated replay and converts native context honestly`
3. `D1 actual Pipeline/Service chooses demo, writes isolated replay and converts native context honestly`
4. `D1 actual Pipeline/Service chooses pi, writes isolated replay and converts native context honestly`
5. `D1 profile success rebuilds same engine after busy old Pi finishes; ambient token remains old until safe; failure is unchanged`
6. `D1R2 actual Pipeline/Service returns original client IDs and real distinct turn IDs for same text`
7. `D1R2 actual ack preserves a failed delayed terminal and the next aborted original client`
8. `I-1 补丁（真正接通核查）：真实 openRoleSession + 真实装配——(c) 实件在场时能力面产出 ShellGate（Pi 适配器 run_shell 注册条件成立）`（`operator-channel.test.ts:271`，断言 `r.ok === true`；批次开工时即红）
9. `actual Core request_choice abort preserves accepted/current facts, expires the old decision and allows one explicit next prompt`

**新增确定性失败 = 0、新增 skip = 0**；未删除/放宽任何既有断言，未加 skip/force-exit。

### 6.4 本批新增用例

| 文件 | 用例 | 覆盖 |
| --- | --- | --- |
| `test/桌面应用/operator-channel.test.ts` | 「审批卡数据面（W5-D 加法）：entry/protectedScope 由构建参数写入；roleId 可选；缺省/未知值不出现」 | 三参旧调用零加法字段；`start_background_task`/`run_shell`/`protectedScope:true`/`roleId` 如实转抄；未知 entry、空 roleId、`false` 不写（运行时防御）；既有字段逐字不变 |
| 同文件 | 「审批卡 presenter（W5-D 接线）：prompt.entry/protectedScope 写入请求；roleId 以 prompt 优先、metadata 兜底；既有字段不变」 | presenter 载荷断言（entry/protectedScope/roleId）；`prompt.roleId` 优先于 `metadata.roleId`；无 prompt.roleId 时 metadata 兜底；无新字段时卡面缺省；`respond` 语义与既有测试一致 |

---

## 7. `npm run typecheck`

```
> ans-cli@1.9.2 typecheck
> tsc --noEmit
```

- 退出码 **0**，无诊断输出（覆盖 `src`/`test`/`app`，`app/renderer` 除外）。实现+测试完成后运行；最终恢复候选后复跑一次仍为 0。

---

## 8. 偏差声明

**I0 偏差 = 0；P1.3 §2.5.2 桌面侧语义按派发落实**。无写集外文件改动；未新建 `test/桌面应用/` 文件（无 H1）；无阻塞。

一项**上游只读观察（不属本批写集，不计偏差）**：编排 `src/common/编排/shell-gate.ts:1096-1104`（`runA`）
构造 `OperatorPrompt` 时未拷贝 `req.entry`/`req.roleId`；`protectedScope` 全仓当前无生产者（仅
`src/model/runtime.ts:767` 的字段声明）。桌面 presenter 已按派发实现消费与兜底：`roleId` 经
`metadata.roleId` 兜底后当前可用；`entry`/`protectedScope` 会在编排补齐 `OperatorPrompt` 取值后自动展示
（桌面无需再改）。见 §9 跨角色待办。

---

## 9. 跨角色待办（不属本写集，均未执行）

1. **编排（W 批次 owner）**：在 `shell-gate.ts` `runA` 构造 `OperatorPrompt` 时透传 `req.entry` 与
   `req.roleId`（`ShellReviewRequest` 已有该两字段；tools 已传入门禁请求），并为 `protectedScope` 提供
   真实来源（如受保护范围判定/装配选项）——桌面卡面消费已就绪，字段一到即展示；不得由渲染侧或模型输入决定。
2. **桌面UI（W5-U，条件参与）**：渲染 `ShellConfirmRequest.entry` → 「前台命令 / 后台任务」、`protectedScope === true`
   → 「受保护项目：非只读操作需审批并审计」提示；仅展示，不参与判定；`entry`/`protectedScope` 缺省保持旧卡面。
3. **测试（D1）**：跨角色集成断言编排 → presenter 的 `entry` 透传（编排补齐后）；`start_background_task` 卡与新字段
   载荷；保持「新增确定性失败 0 / 新 skip 0」。
4. **测试（B0/E3 口径）**：`test/桌面应用/operator-wiring.test.ts`、`test/桌面应用/session.test.ts` 在边界文档中
   仍被列为单文件授权，但本检出已于 `4c24149` 删除——后续 D1/E3/验收引用时按实际存在文件处理（本批不新建）。

---

## 10. 限制（如实）

- 本批只做**受影响套件**前后对照（上列 4 个既有套件）；未跑整个 `test/桌面应用/**`（B0 客户豁免、E3 全量由
  D1/E3 负责），不以局部绿冒充全量通过。
- 未运行真实模型、未启动桌面应用；AC-7/AC-8/AC-9 的卡面真机截图/交互证据属 RR，不在本批。
- 既有 9 个失败如实保留（与本批写集无调用关系；批次开工时即红），未修复、未以其冒充通过。
- 本证据只证明「桌面数据面/presenter 加法字段正确且不破坏既有断言」；不证明编排侧 `entry` 已透传（见 §8/§9）。

---

## 11. 结论

W5-D 桌面侧完成：`ShellConfirmRequest` 增加可选 `entry`/`protectedScope`（`roleId` 既有），
`buildShellConfirmRequest` 以可选第四参纯函数转抄、运行时防御未知值，presenter 将
`prompt.entry`/`prompt.roleId`（metadata 兜底）/`prompt.protectedScope` 写入请求；判定、升级卡与既有
字段零改动；`main.ts` 因整对象 IPC 透传无需加法；`session.ts` 只读核对确认 `readonlyGit`/`roleId`/
`auditFailurePolicy` 已由 `openRoleSession` 内部构造并经官方工厂 `capabilities` 透传、桌面装配入口就在该路径上
（缺件 = 不 arm 的 fail-closed 不变）。受影响套件实施前后 126→128 tests、117→119 pass、失败同名同数
（diff 空），typecheck 退出 0，I0 偏差 0。未 commit/push/merge/发布，未判验收。
