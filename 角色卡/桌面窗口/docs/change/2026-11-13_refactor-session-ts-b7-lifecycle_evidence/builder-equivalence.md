# B7 `openInternalUnsafe` builder 分解 — 连续块映射与逐行等价

- Source: `git show HEAD:app/desktop/session.ts` lines 1984–3064（e37da80）。
- 主流程：保留原 1986–1993 前置校验 + 顺序调用 8 个 builder（当前主流程 18 行 + 校验段；较方案 §3.4 的 120–150 行估计更短——所有连续块均已整体下沉，剩余仅为编排调用）。
- 每个 builder：入口 `const { … } = ctx;`（同一对象解构为同名局部 const，保持原 `const` 收窄语义）+ 原连续块**逐字** + 块尾把本块产出的变量写回 `ctx`。
- 唯一文本适配（逐步记录）：
  - `assembleToolSurface`：`const manager = this;` → `const manager = this.host;`（下载 presenter 的 `requestIdFor`/`withRequestLifecycle` 门面引用；host=Lifecycle→门面同实例）。
  - `assembleProjectCapabilities`：`caller.handle === handle` → `caller.handle === ctx.handle`（原闭包按运行期读取外层 `handle`；B6 块在成功开会话后才赋值，别名会在入口定格 undefined，故保留 `ctx` 运行期读取）。

| builder | source lines | target block start | contains verbatim block | adaptations |
| --- | --- | --- | --- | --- |
| resolveWorkflowMode | 1994–2060（67 行） | open.ts:262 | YES | — |
| reuseOrRebindEntry | 2061–2134（74 行） | open.ts:337 | YES | — |
| loadAuthorization | 2136–2193（58 行） | open.ts:418 | YES | — |
| assembleGovernanceCapabilities | 2195–2301（107 行） | open.ts:487 | YES | — |
| assembleProjectCapabilities | 2303–2542（240 行） | open.ts:620 | YES | caller.handle === handle -> caller.handle === ctx.handle |
| assembleToolSurface | 2543–2956（414 行） | open.ts:891 | YES | const manager = this; -> const manager = this.host; |
| freezeBindings | 2958–2980（23 行） | open.ts:1316 | YES | — |
| postOpenWiring | 2982–3063（82 行） | open.ts:1347 | YES | — |

## 主流程与前置段

- 原 1986–1993（参数/运行时校验、`key`、`stopped`、`stoppedResult`、`if (stopped()) return stoppedResult();`）留在 `openInternalUnsafe` 主流程，文本逐字。
- 原 1994–3063 全部按上表连续切分，无一行遗漏、无重排；builder 调用顺序与源顺序一致。
- 原始 `return` 语句保持在所属连续块内（值原样返回；主流程以 `!== undefined` 判定早退）。
