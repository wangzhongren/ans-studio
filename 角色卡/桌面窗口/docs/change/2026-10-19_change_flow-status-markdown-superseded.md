# 变更记录：流程步骤状态剥离 Markdown 标记 + superseded 作废步骤不阻塞（2026-10-19）

## 1. 真机缺陷与根因

R2（`library-lending-v2`）自动验收派发门被卡：流程单实际写成

```markdown
| delivery-server-v2 | … | backend | **done**（回执齐备：…） |
| delivery-frontend-v2-evidence | （不派）前端落盘证据补充 | frontend | **superseded**：并入 `integration-e2e-v2`，… |
```

两个根因都在 `app/desktop/governance-advance.ts`：

1. **Markdown 强调符未剥离**：旧 `normalizeFlowStepStatus` 只取首词，`**done**（…）` 归一化得到
   `**done**`、`__done__` 得到 `__done__`，与 `done` 不相等 ⇒ `flowCompletionIssue` 把**所有已完成的
   执行步骤判为未完成**，自动验收派发门永远打不开（错误详情把每步的原始 `**done**（…）` 全列出来）。
2. **作废步骤被当成执行步骤**：`delivery-frontend-v2-evidence` 已被约定为
   `**superseded**：并入 integration-e2e-v2`，旧逻辑仍把它算作执行步骤，既要求 `done` 又要求
   `dispatch.accepted` 证据，同样挡门。

本角色写入面仅 `app/desktop/**`、`test/桌面应用/**`、`角色卡/桌面窗口/**`；未改 `src/**`、
`app/renderer/**` 与他角色文件，不 commit。

## 2. 改动（`app/desktop/governance-advance.ts`）

### 2.1 `normalizeFlowStepStatus`（现 91 行）

先去除首尾空白与 Markdown 强调/代码标记（`*`、`_`、反引号），再取首词；取词后再剥掉**紧贴状态词尾**
的闭合标记（`**done**（…）` 的闭合 `**` 位于说明文字之前，不在单元格末尾）。大小写不敏感，
后接空白 / `（` / `(` / `：` / `:` 或结束即截止。示例：

| 原始状态 | 归一化 |
| --- | --- |
| `**done**（有落盘/回交证据）` | `done` |
| `**done**` / `**Done**（…）` | `done` |
| `__done__` / `_done_` | `done` |
| `` `done` `` / `` `done`（证据） `` | `done` |
| `**pending**（等待回交）` | `pending` |
| `**superseded**：并入 …` | `superseded` |
| `**` / ` `` ` / `__` / `""` | `""`（不视为 done） |

`parseFlowStepStatuses` 输出形状与原始 `status` 文本不变（展示仍用原文），只在判定处调用本函数。

### 2.2 `flowCompletionIssue`（现 330 行）

新增常量 `VOIDED_FLOW_STEP_STATUSES = {"superseded", "cancelled"}`（现 164 行）：

- **执行步骤**归一化为 `superseded` / `cancelled` ⇒ 视为已作废的非执行步骤：不参与「未完成」判定，
  也不要求 dispatch / 客户决定 / 产物证据（与验收步骤单列同理）。
- **不算 done**：其他未知状态（`pending`、`dispatched`、`delivered`、`blocked`、空……）照旧阻塞；
  验收步骤的完成判定仍只认 `done`。绝不放宽到「未知状态当 done」。
- 错误详情注明跳过：返回未完成/缺证据错误时追加
  `；已跳过作废步骤（<stepId>=<原始状态>、…）`（最多 10 条），便于诊断区分「真阻塞」与「已作废」。
- 既有错误文案前缀与断言零放宽。

## 3. 影响面

- 只影响 `flowCompletionIssue` 触发门的状态与证据判定；`parseFlowStepStatuses`、证据映射表
  （`FLOW_STEP_EVIDENCE_RULES`）、验收任务文本、派发/去重链**逐字未改**。
- 作废步骤仍按原始文本展示；不会修改流程单、账本或自动批准。
- 未新增 IPC 通道、未新增写权限；single/旧项目零行为变化。

## 4. 测试与真实输出（本机，2026-10-19）

`test/桌面应用/operator-wiring.test.ts` 既有断言零放宽，新增/扩展：

1. **状态规范化矩阵**扩展 Markdown 变体：`**done**（…）`、`**done**`、`**Done**（…）`、`__done__`、
   `_done_`、`` `done` ``、`` `done`（证据） ``、`** done **` 均归一化为 `done`；`**` / ` `` ` / `__`
   不视为 done；`**pending**（…）` ⇒ `pending`、`**superseded**：…` ⇒ `superseded`。
2. **Markdown 强调状态放行**：`**done**（…）` / `__done__` / `` `done` `` + 验收 `pending` ⇒
   `flowCompletionIssue` 返回 `undefined`；验收步骤 `**done**（客户已 accept）` ⇒ 不重复派。
3. **superseded / cancelled 不阻塞**：作废步骤没有 dispatch 证据也不阻塞；`cancelled（客户取消）` 同理；
   同时 `**pending**（…）` / `dispatched（已派发，未见回交）` 仍阻塞，错误详情含「已跳过作废步骤」。
4. **真实 R2 流程单夹具**（只读拷贝 `ans-testbed/library-lending-live/docs/flows/library-lending-v2.md`
   的 10 行步骤表，四列 `stepId|步骤|执行方|状态`，含 `**superseded**：…`）：
   - 表可解析、id 取 stepId 列、所有 `**done**` 归一化为 `done`；
   - 同形账本（治理步骤按任命决定/契约产物证据，交付步骤按 dispatch.accepted）⇒ 门通过
     （`undefined`）——**旧解析在此返回「所有 done 被判未完成」，即缺陷现场**；
   - 去掉 `delivery-frontend-v2` 的 dispatch 记录 ⇒ 只报
     `缺少 dispatch.accepted 记录（delivery-frontend-v2）`，且**不再**出现「流程仍有未完成/阻塞/待派发步骤」。

真实输出：

- `node --test test/桌面应用/operator-wiring.test.ts test/桌面应用/acceptance-dispatch.test.ts`
  ⇒ **55 计 / 55 过 / 0 红**（operator 47 + acceptance-dispatch 8）。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **603 计 / 602 过 / 1 红**
  - 唯一红为**已知既有红** `test/桌面应用/runtime-ui.test.ts`（renderer `localStorage` 钉，断言 at `:69`），
    属桌面UI/渲染域，按要求未触碰；本变更前基线 600 计 / 599 过 / 1 红，本批净增 3 例、红数未增。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 5. 残余风险

1. **状态词形仍靠约定**：`superseded` / `cancelled` 是流程单作者写出的状态词；其他同义写法
   （如 `obsolete`、`void`）不在白名单内，会照旧阻塞（fail-closed）。新增作废词须改
   `VOIDED_FLOW_STEP_STATUSES` 并补测试。
2. **作废判定只作用于执行步骤**：验收步骤写成 `superseded` 时仍按「未 done ⇒ 可派」处理
   （与 `pending`/`in-progress` 同分支）；流程单若确实作废了验收步骤，应由流程单作者移除或替换该步骤，
   本门不猜测其语义。
3. **错误详情追加跳过说明**：依赖错误文本做精确匹配的上游（若有）需容忍前缀不变、后缀追加；
   当前仓库内断言均为非锚定 `assert.match`，已全绿。
4. **编排侧仍为旧口径**：`src/common/runtime-core` 的治理判断事实解析不在本角色写入面；本修复只保证
   桌面验收派发门，编排侧证据口径如需同步由属主角色决定。
