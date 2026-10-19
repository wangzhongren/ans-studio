---
id: auto-dispatch-runtime-resolution
type: change
title: 自动验收派发/冷启动补齐按证据解析项目引擎（不再无凭据默认 claude）
created: "2026-10-19"
status: implemented
---

# 自动验收派发/冷启动补齐：运行时选择解析器

## 真机缺陷

自动验收派发在应用冷启动 / 导入项目时触发，但诊断显示：

```
acceptance.send.failed: Claude SDK 运行失败：Claude 缺少 API key：ANTHROPIC_API_KEY
```

根因：冷启动时没有活跃会话，`governanceRuntimeFor(projectRoot)` 无记录，旧代码在
`dispatchAcceptanceForFlow` 与 `runAcceptanceCheck` 两处都回退桌面默认 `"claude"`；而项目实际使用 Pi。
客户要求「不用客户手动触发」⇒ 自动派发必须选对引擎。

真机证据（只读复算 `ans-testbed/library-lending-live`，2026-10-19）：

```
evidence: pi:latest=2026-10-19T06:31:01.691Z:roles=8
          claude:latest=2026-10-19T06:13:50.602Z:roles=1   ← 失败尝试留下的目录
resolution: {"ok":true,"runtime":"pi","source":"session-history","skipped":[]}
```

即：修复后同一现场按 `.ans/sessions/<role>/<runtime>/` 证据选 `pi`；即使 claude 目录更新，
其凭据缺失也会被如实跳过（不会重演 `ANTHROPIC_API_KEY` 失败）。

## 改动

### 新增 `app/desktop/runtime-resolution.ts`（纯逻辑，可注入测试）

按优先级解析（**每一级候选都须通过凭据可用性检测**，否则如实跳过并继续）：

| 优先级 | 依据 | 实现 |
| --- | --- | --- |
| 1 | 当前活跃会话的 runtime | 调用方传入：真实回交事件 runtime / 最近真实会话事件 / `SessionManager.activeRuntimeFor` |
| 2 | 应用内已选 / 持久化 per-project runtime | `SessionManager.governanceRuntimeFor`（本进程最近治理会话）→ user-data 独立 JSON |
| 3 | 项目磁盘证据 | `.ans/sessions/<roleId>/<runtime>/`（pi/codex/claude）最近使用（目录树最新 mtime）为主、出现角色数次之 |
| 4 | 配置可用性 | 共享注册表必填键经 `getRuntimeConfig` 判定：Pi＝`ANTHROPIC_AUTH_TOKEN`+`ANS_PI_BASE_URL`+`ANS_PI_MODEL`；Codex＝`CODEX_API_KEY`（或 `OPENAI_API_KEY`）+`ANS_CODEX_MODEL`；Claude＝`ANTHROPIC_API_KEY`。多引擎齐全时确定顺序 pi → codex → claude |
| 5 | 无法确定 | `{ok:false, message:"无法确定项目引擎，请先选择引擎；本次自动验收派发已跳过（不会循环重试）。"}` |

- **键集单一来源**：复用 `runtime-config.ts::getRuntimeConfig`（共享注册表 + 共享 `.env` 读取器），
  本模块不复制第二份键集/`.env` 解析。
- **持久化**：`<userData>/ans/runtime-selection.json`（`{version:1, projects:{root:{runtime,updatedAt}}}`；
  原子写复用共享 `atomic-write.ts`，0600；LRU 保留 200 个项目；坏件按「无持久化」处理并可被下次写入重建）。
  **不写项目 `.ans`、不碰治理账本**。`statePath` 缺省 ⇒ 持久化关闭（no-op）。
- 扫描有界：每个 `<runtime>` 目录至多 400 个 stat、深度 ≤3（冷启动补齐不被大历史目录拖住）。
- `demo` 是聊天演示引擎：不参与自动派发（候选被如实跳过）。

### `app/desktop/session.ts`

- 新增 `activeRuntimeFor(projectRoot)`：当前活动会话属于该项目时返回其 runtime（只读；优先级 1 视图）。

### `app/desktop/interface.ts`

- `DesktopDeps` 新增 `runtimeStatePath?` 与 `resolveRuntimeFn?`（测试可注入；缺省真实解析器）。
  `openRoleSessionFn` 入参类型补上实际存在的可选 `runtime`（与编排 `openRoleSession` 同名同义，
  仅类型准确性，无行为变化）。
- `dispatchAcceptanceForFlow`：引擎选择由「`info.runtime ?? 提示 ?? governanceRuntimeFor ?? "claude"`」
  改为统一解析器：
  - 传入优先级 1＝`info.runtime ?? acceptanceRuntimeHints ?? manager.activeRuntimeFor(projectRoot)`，
    优先级 2＝`manager.governanceRuntimeFor` + 持久化值；
  - 无法确定 ⇒ **不打开/不发送**、释放该 flow 的运行期占位（客户之后选定引擎的真实事件可再检查一次，
    无事件不重试）、诊断 `acceptance.runtime.unresolved`、**每项目恰一条**「无法确定项目引擎，请先选择引擎」
    系统行（后续只记诊断，不刷屏）；不写账本派发记录；
  - 解析成功 ⇒ 后续系统行按**实际引擎**路由（Pi 视图能看到「已自动派发验收复核」）；
  - 发送成功后把实际 runtime 写入持久化位置（失败只记诊断，不影响派发/审计）。
- `runAcceptanceCheck`（冷启动/导入补齐）不再预先解析并传 runtime；每个 flow 在派发内部统一解析。
- `openSession` 成功（客户显式选定引擎）后异步记住该 per-project 选择（fire-and-forget，失败静默）。
- **未改**：证据门（`flowCompletionIssue`/`flowStepEvidenceKind`）、流程判定、Proof 任务文本
  （`buildAcceptanceTaskMessage`）、账本格式与去重语义。

### `app/main.ts`

- 向 `createDesktopInterface` 传 `runtimeStatePath = <userData>/ans/runtime-selection.json`（独立文件）。

### `角色卡/桌面窗口/boundary.yaml`

- Section 1 增补 `test/桌面应用/acceptance-dispatch.test.ts`（既有未列文件，本次改其 harness）与
  `test/桌面应用/runtime-resolution.test.ts`（新测试）两条。

## 行为矩阵

| 现场 | 旧行为 | 新行为 |
| --- | --- | --- |
| 冷启动、项目 `.ans/sessions` 只有 pi、仅 Pi 配置 | 派 verifier 用 claude → 缺 key 失败 | 选 pi → 派发成功并持久化 pi |
| 冷启动、磁盘证据 claude 更新但无 `ANTHROPIC_API_KEY` | claude → 失败 | 跳过 claude，选有凭据的 pi/codex |
| 冷启动、持久化记录 codex（有凭据） | 忽略 | 选 codex |
| 客户刚打开 pi 会话后 settle | 提示 runtime 优先 | 活跃会话 pi 优先 |
| 完全无凭据/无证据 | 默认 claude → 失败 | 不派发 + 一条系统行「无法确定项目引擎，请先选择引擎」 |
| 回交 settle（Convener 真实 runtime） | 用事件 runtime | 同一 runtime（优先级 1），语义不变 |
| 流程未完成/证据不足 | 不派 | 不派（逐字不变） |

## 测试

新增 `test/桌面应用/runtime-resolution.test.ts` **13 例**：

1. 活跃会话优先（高于已选/持久化/磁盘证据）；
2. 应用内已选先于持久化；
3. 无活跃/已选时用持久化；
4. `.ans/sessions` 取最近使用 / 仅单一引擎存在也能判定；
5. 仅 Pi ⇒ pi、仅 Codex ⇒ codex、仅 Claude ⇒ claude；
6. 活跃会话/磁盘证据指向 claude 但无 key ⇒ 跳过并选有凭据的 pi；无任何凭据 ⇒ 明确失败；
7. 无候选 ⇒ 失败文案含「无法确定项目引擎，请先选择引擎」；
8. 持久化往返、坏件重建、缺省关闭、demo 不落盘；
9. Interface：冷启动无法确定 ⇒ 不派发、Convener 恰一条系统行、不写派发记录、无事件不重试；
10. 解析失败后客户选定引擎 ⇒ 下一次真实 settle 可再检查并成功派发（不永久锁死）；
11. 持久化值进入解析请求；成功派发后用实际 runtime 覆盖持久化；
12. 端到端（真实解析器，仅 Pi 配置）⇒ 自动派发选 pi 并持久化；
13. `openSession` 成功即记住所选引擎。

`test/桌面应用/acceptance-dispatch.test.ts`：既有 8 例断言零放宽，仅 harness 注入固定解析结果
（`pi`），使该文件不再依赖开发机真实 `.env`。

真实输出：

- `node --test test/桌面应用/runtime-resolution.test.ts` ⇒ **13/13 过**；
- `node --test test/桌面应用/acceptance-dispatch.test.ts` ⇒ **8/8 过**；
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **618 计 / 617 过 / 1 红**（改前基线 605 计 /
  604 过 / 1 红；本批净增 13 例、红数未增。唯一红＝已知既有 `test/桌面应用/runtime-ui.test.ts:69`
  「renderer 仅消费 IPC…无持久化」的 `localStorage` 钉，属桌面UI/渲染域，按要求未触碰）；
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险（如实登记）

- **凭据判定按共享注册表的必填键**：若适配器将来支持注册表之外的另一种认证方式，解析器会把它当作
  「不可用」而跳过——方向是 fail-closed（可不自动派发），客户仍可在界面选定该引擎。
- **不做真实探活**：解析只读配置/磁盘，不发起模型调用。凭据存在但实际失效（额度/网络/错 key）时
  仍可能选中该引擎并在派发时如实失败（失败系统行保留，不循环重试）——与旧行为一致。
- **磁盘证据按 mtime**：失败尝试也可能留下 `.ans/sessions/<role>/<runtime>/` 目录；凭据门会挡住
  「无 key 的 claude」，但若多引擎都有凭据且失败引擎目录最新，仍可能优先选它。持久化选择/活跃会话
  会覆盖该推断。
- **多引擎凭据齐全且无其他证据**时按确定顺序 pi → codex → claude 选择；该选择在成功派发后持久化，
  下次冷启动以持久化优先。
- 「无法确定引擎」系统行每项目每进程一条；后续真实事件只记诊断（避免刷屏），不构成循环重试。
- 未改 `src/**`、`app/renderer/**`、治理账本、证据门与 Proof 任务文本；不 commit。
