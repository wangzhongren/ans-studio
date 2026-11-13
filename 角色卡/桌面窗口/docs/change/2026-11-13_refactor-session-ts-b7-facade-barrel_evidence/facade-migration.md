# B7 第二段证据：门面迁入 session/index.ts + session.ts 改 barrel

日期：2026-11-13
工作树：`.claude/worktrees/refactor-session-ts-b7`（分支 `refactor/session-ts-b7`，起点 `e37da80`）
第一段记录：`角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-lifecycle.md`

## 1. 行数

| 文件 | 本段前（第一段工作树） | 本段后 | 预算 |
| --- | --- | --- | --- |
| `app/desktop/session.ts` | 2,662 | **30**（`wc -l`） | ≤50 |
| `app/desktop/session/index.ts` | 不存在 | **790**（`wc -l`） | ≤800 |
| `app/desktop/session/**/*.ts` 单模块最大 | 1,477（`cards/cards.ts`） | 1,477（不变） | ≤1,500 |

`countLogicalLines`（结构测试口径：去尾换行后按 `\n`）与 `wc -l` 同值：barrel 30、index 790。

## 2. 门面迁移内容

- `SessionManager` 类整体迁入 `app/desktop/session/index.ts`（L7）：字段、同实例状态访问器、constructor 端口注入、
  全部薄委托（340 个类成员块：fields / get / set / methods / constructor）。
- 类成员源码顺序不变；同名/同签名/同可见性不变；JSDoc 文本保留（仅折叠换行为单行）。
- `MAX_LIVE_SESSIONS` 定义随门面迁入 `index.ts`（barrel 不能反向 import index，否则成环）；barrel 原样转出。
- 首段遗留的已死符号**未迁入**（B1–B6 后即无引用，行为中性；见 §5 D3）：
  `GOVERNANCE_SLUG_RE`、`VERSION_DECISION_SYSTEM_PREFIX`、`desktopSessionManagers`（`inventorySessionManagers` 强转别名）。

## 3. 代码等价证明（紧凑化仅空白/换行）

1. **原类体 vs 候选类体**（token 流，去空白/注释；字符串整体成 token）：
   **15,362 tokens vs 15,362 tokens，0 处差异**。工具：`tools/compare-tokens.mjs`。
2. **候选类体 vs 最终 index.ts 类体**：15,362 vs 15,362，**仅 2 处差异**——两处 `import("…")` 内联类型路径
   因文件深一层而改（`../../src/model/trunk.ts` → `../../../src/model/trunk.ts`；
   `./runtime-history.ts` → `../runtime-history.ts`）。工具：`tools/compare-candidate-final.mjs`。
3. 因此：类代码除 relocated 相对路径外**逐 token 不变**；紧凑化只改物理排版（空白/换行/注释折行）。

紧凑化规则（机械应用）：
- 每个薄委托压成单行：`签名 { return this.<module>.<method>(…); }` / `{ this.<module>.<method>(…); }`；
  多行参数列表、多行返回类型一并单行化（仅空白/换行）。
- JSDoc/注释块按原分组折叠为单行（组内换行与 `*` 前后缀折叠；文本内容保留）。
- constructor：注释行保留为独立行；代码按 300 字符宽度在 `,` / `;` / `{` 后换行（仅空白/换行）。
- 文件头模型说明（原 `session.ts` 第 8–60 行）按句号切分为 ≤650 字符注释行，文本逐字保留。

## 4. 导入面处理

- 原 `session.ts` 113 条 import 语句（256 行）→ 保留**65 条**（含 ≥1 个被类代码引用的绑定；按去注释后的类代码
  token 判定），每条压成一行。其余 48 条为 B1–B6 迁出后遗留的死导入，未进入 index.ts。
- 相对说明符整体 rebase（文件深一层）：`./session/X` → `./X`（58 处）、`../../src/X` → `../../../src/X`、
  其余 `./X` → `../X`；共 **64 处**。另 2 处 `import("…")` 内联类型路径同步 rebase。工具：`tools/rewrite-paths.mjs`。
- 全量死导入清单：`tools/dropped-imports.mjs` 输出（39 个模块在本文件层面不再导入；其中值导入所在模块均由
  session/** 其余模块或应用其他模块导入，模块初始化顺序变化仅涉及纯声明模块，无副作用语义）。

## 5. 偏差

- **D1 MAX_LIVE_SESSIONS 定义位置**：由 `session.ts` 迁入 `session/index.ts`（barrel 转出）。barrel ⇄ index
  不可互导（环），而门面 constructor 需要该常量；公开面/值不变（结构测试断言 `MAX_LIVE_SESSIONS === 3`）。
- **D2 pin7 字面 import 行**：`operator-channel.test.ts` 已改读 `readSessionSource()`（测试角色记录
  `2026-11-13_refactor-session-ts-b7-operator-pins.md`），pin1–4 由 `lifecycle/open.ts` 真实实现承载；
  但 pin7 正则逐字要求 `from "../../src/pipeline/orchestration/shell-arming.ts"`（两级路径），只有 barrel 层
  能出现该字面行。故 barrel 保留一行**纯类型** `import type { … } from "../../src/pipeline/orchestration/shell-arming.ts";`
  （运行期擦除、无行为、不增加运行时导出）。第一段的「B7 迁移指针」注释已删除。
- **D3 死符号未迁入**：见 §2；三者在第一段工作树中已无任何引用（grep 仅命中定义行），删除不改行为。
- **D4 未改其他模块/测试**：除本段写区（`session.ts`、`session/index.ts`、`session-structure.test.ts`、本记录/证据）
  外未触碰；`operator-channel.test.ts` 的修改属测试角色并行工作，非本段所为。
