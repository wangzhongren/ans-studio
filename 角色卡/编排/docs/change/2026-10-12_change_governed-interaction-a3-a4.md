---
id: governed-interaction-a3a4
type: change
title: 客户确认制收窄（A-3）与删收口改自动收尾（A-4）——编排侧
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [governed-interaction-and-chat-ux, cli-govern-finalize-wiring]
events:
  - date: "2026-10-12"
    kind: designed
    summary: 客户确认设计稿 governed-interaction-and-chat-ux（A 组先行；O-A1 不采纳）；本角色只读评估已回收采纳
  - date: "2026-10-12"
    kind: implemented
    summary: 客户批准后实施——run-role 确认制 writeSet 发行（confirmed-writes.ts）+ govern-session/govern 接线 + finalize.ts 删提议-确认、repin 扩含首次 + CLI 数字映射
  - date: "2026-10-12"
    kind: verified
    summary: test/编排 136/136、typecheck（本角色零错）；全量 714 计/698 过，15 红全部可归因于他角色在途与两条既有环境红（本角色零红）
---

# 客户确认制收窄（A-3）与删收口（A-4）：编排侧改动

> 依据：设计稿 `角色卡/项目管理/docs/design/2026-10-12_design_governed-interaction-and-chat-ux.md`（status: approved，客户确认 A+B 全做、A 组先行；**O-A1 内容漂移加固明确不采纳**）。本轮客户原话两要点：「**客户确定了才加，不要有个收口，收口去掉**」。本文只记编排（Pipeline/Interface/编排私有 common）这一层；工具与契约在 Pi适配器、交互卡在桌面应用，另记。
>
> **本角色尚无 `feature-map.md` 与 `docs/feature/`（既有缺口），本文暂无功能文档可回链。**

## 改在哪里（位置 → 改动）

1. **`src/pipeline/orchestration/run-role.ts`（openRoleSession）——确认制收窄**
   - **以前**：`scope` 静态传入（或 undefined = 不收窄）；收口能力挂在句柄上（`genesisFinalize`/`operatorChannel`/`confirmTimeoutMs`，句柄自带 `settled`/`finalize()`）。
   - **现在**：`customerInput` 给出 ⇒ 会话进入**确认制**：writeSet **从空开始**，只有「经 `request_confirmation` 预览、且客户 `confirmed:true`」的路径被**发行**进 writeSet（真状态在编排内存，模型无法重算），写入照旧经 gate，**F4 拒掉一切未确认路径**。`genesisFinalize`/`operatorChannel`/`confirmTimeoutMs`/句柄 `finalize()`/`settled` **删除**（A-4：收口没了）。`autoRepin` 保留。
   - 适配器能力面：`deps.createAdapter(gate, capabilities?)`；`capabilities.customerInput`（发行器包装）→ 适配器据此注册两交互工具（「注入才注册」）；`createPiAdapterFactory` 原样转发。
2. **`src/common/编排/confirmed-writes.ts`（新增）——发行器**
   - 从**呈现给客户的文本**（title/preview/detail）提取「路径样 token」（保守正则：排除 URL/绝对路径/`..`/目录式 token；粗体与反引号包裹同样可提取），逐个用**同一个 `resolveWrite`** 探测（`{writeSet:[p], conditions}`——只问「在边界内吗」），通过者才发行。`choice` 的回答**不**发行（只有 `confirm` + `confirmed:true` 算确认）。`conditionSlugsOf` 供动态 scope 与（既有）`buildGovernScope` 同口径。
3. **`src/common/编排/finalize.ts`——删「提议 + 确认」，保留写入本体，自动收尾含首次**
   - **删除**：`createSessionFinalizer`/`createFinalizeProposer`/`SessionFinalizer`/`confirm()`/`DEFAULT_CONFIRM_TIMEOUT_MS` 及本地超时包装（提议-确认整段）。
   - **保留**：`finalizeBootstrap`（三产物写入本体，逐笔仍经 `resolveWrite`、无可 pin 之物零副作用）、`isGenesisState`、治理边界文档渲染、pin/manifest。
   - **改动**：`repinIfBootstrapped` 由「创世态 no-op」改为**含首次**——创世态 = 首次收尾（写 `.ans` + `角色卡/governance-boundary.yaml` + `docs/bootstrap-manifest.md`）；非创世态 = 重扫更新 pin（不重写治理边界文档，同前）。
4. **`src/pipeline/orchestration/govern-session.ts`——接线与退役**
   - `GovernSessionInput`：删 `finalizeBootstrap`/`operatorChannel`/`confirmTimeoutMs`，增 `customerInput`（透传给 openRoleSession）；句柄删 `settled`/`finalize`；`GovernSessionResult.finalize` 删。
   - `runGovernSession`：删 finalize 调用段；**缺省补 `createCliCustomerInput()`**（原 `createCliOperatorChannel` 的对应物）；提示词（`buildGovernPrompt`）写死确认制流程——「先把预览（角色卡全文 + 边界摘要 + **将要写出的具体路径**）经 `request_confirmation` 请客户确认，获 confirmed:true 后才写」。
5. **`src/common/编排/operator-channel.ts`——CLI 终端映射（A-5 的 CLI 面）**
   - 新增 `createCliCustomerInput`（确认 y/n/是；选择数字序号：单选 `1`、多选 `1,3`；空/未识别 → declined；EOF → unavailable——fail-closed）；`parseChoiceInput`（越界/重复/数量不符 → 拒绝）；`formatCustomerInputPrompt`。原 `createCliOperatorChannel` 保留（shell 闸 (a) 的通道实现，未动）。
6. **`src/interface/cli/govern.ts`——收口 arm 下线**
   - 删 `genesisBootstrap ⇒ finalizeBootstrap: true` 的 arm（A-4）；`operatorChannel` 字段改 `customerInput`（透传；缺省由 runGovernSession 补 CLI 终端通道）。**每一次 `ans govern` 都是确认制**。

## 一个触发场景：前后差别

- **以前**（T37 链路）：`ans govern <空目录>`，su 建完角色后命令**退出 0**——产物（`.ans` 等）要么等「su 提议收口 → 客户在终端按 y」（上一轮刚接的线），要么什么都没有；且 su **不确认也能直接写**（写集是静态的）。
- **现在**：su **不确认就写不动**——没经 `request_confirmation` 预览并获同意的路径，写入被 F4 在写之前拒绝（命令仍退出 0，但拒绝逐条如实回给 su，su 可再征询）。客户同意后写入落盘，**settle 时自动收尾**：`.ans`（pin）+ 治理边界文档 + manifest 一次写齐，项目由「创世态」进入「正式态」——**没有「完成 bootstrap」这一步需要谁去按**。

## 不改什么

- 门禁 `resolveWrite`/边界分支/种子边界（`role-cards` 门禁引擎侧）**一行未动**——F4 复用，不造票据。
- `runRole`（`ans role run`）与无 `customerInput` 的会话**逐字不变**（静态 scope 旧语义）。
- shell 闸、`ans init`、调度等无关面未动。

## 如何确认（实际结果）

- `test/编排/*.test.ts` → **136 计 / 136 过 / 0 失败**（含新增 `confirmation-gated.test.ts` 12 例：未确认拒/确认落盘+自动收尾/拒绝、不可用 fail-closed/精确发行/越界不发行/gate 直断言/choice 回传/CLI 映射与提取单元；重写 `finalize.test.ts` 为自动收尾语义）。
- `npm run typecheck` → **本角色目录零错**（剩余 19 处均在在途角色文件：`app/**`、`test/桌面应用/**`、`test/测试/**`、`test/装配/**`——非本角色回归）。
- 全量 `node --test "test/**/*.test.ts"`（引号带）→ **714 计 / 698 过 / 15 红 / 1 skipped**。15 红逐条归因：桌面 `finalize-wiring.test.ts` 8（桌面应用正在按 A-4 删收口面，在途）、`test/测试/{t9-block1-bootstrap,cli-genesis-boundary}` 4（测试角色文件仍在用删掉的 `settled`/`finalize`/`operatorChannel`）、`test/装配/govern-target.test.ts` 1（其第 7 例脚本直接写、无确认——确认制下被 F4 拒；已协调由装配随本改动更新）、既有环境红 2（桌面面板键目录名、pm shared macOS `/var`）。**本角色目录零红**。
- 环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。未发真实模型请求；真实端到端（su 真的先征询再写）属**客户跑**。

## 如实登记：已知残余风险

- **内容漂移（O-A1 未采纳）**：本机制只保证「**路径**已预览且已确认」；「预览内容 A、写出内容 B」**关不住**——客户明确不采纳比对加固。已在 `confirmed-writes.ts` 文件头与 `run-role.ts` 头注如实登记。
- **路径提取是尽力而为**：预览里没写出具体路径 ⇒ 不发行 ⇒ 该写入被 F4 拒（fail-closed、不越界，但会打断流程）。A-2 的工具指引与本角色 CLI 提示词均已写明「列出将要写出的具体路径」。
- **两前端一致性**：CLI 映射（y/n、数字）与桌面交互卡（A-5）行为由**测试角色**做跨前端验收（设计角色表）。

## 需要注意的既有接线变化（他角色待办，不在本角色）

- 装配 `test/装配/govern-target.test.ts` 第 7 例：确认制后其脚本直接写被拒（红）；`GovernDeps` 的 `operatorChannel` 字段已改名 `customerInput`（该文件 :237 处编译错）——随装配更新。
- 测试角色 `test/测试/t9-block1-bootstrap.test.ts`、`cli-genesis-boundary.test.ts` 使用已删除的 `settled`/`finalize`/`operatorChannel`——随测试角色更新。
- 桌面应用按设计「删除顺序」处理其收口卡/「完成 bootstrap」入口——其自有在途工作。
