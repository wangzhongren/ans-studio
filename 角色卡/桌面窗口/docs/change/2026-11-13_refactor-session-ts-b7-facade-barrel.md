# B7：session.ts 门面迁入 `session/index.ts` + `session.ts` 改 barrel——第二段（最终结构 + 收口验证）

- 日期：2026-11-13
- 角色：桌面窗口
- 工作树：`.claude/worktrees/refactor-session-ts-b7`（分支 `refactor/session-ts-b7`，起点 `e37da80`）
- 第一段记录：`角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-lifecycle.md`
  （lifecycle 47 方法迁出、8 builder、session.ts 2,662 行门面、R7 全过）
- 方案：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §3.2/§5 B7、§6.2/§6.3（R7/R11）
- 范围：**B7 第二段（最终结构）**——`SessionManager` 类整体迁入 `app/desktop/session/index.ts`（L7）；
  `app/desktop/session.ts` 改 barrel（≤50 行）；结构测试预算收紧（barrel ≤50、index ≤800、每模块 ≤1,500）；
  导出面/导入图/工具面/钉子/类型与定向回归验证。行为零变化；不 commit / 不 push / 不触发 CI / 不 tag / 不碰 main。
- 证据目录：`…_evidence/`（`facade-migration.md`、`barrel-exports.txt`、`failure-name-diff.txt`、`final/`、`baseline/`、`tools/`）

## 1. 结果摘要

| 项 | 值 |
| --- | --- |
| `app/desktop/session.ts` | **2,662 → 30 行**（`wc -l`；barrel，≤50） |
| `app/desktop/session/index.ts` | **新增 790 行**（门面；≤800） |
| `session/**/*.ts` 单模块最大 | **1,477**（`cards/cards.ts`，不变；≤1,500） |
| 类代码等价 | 原类体 15,362 tokens vs 候选 15,362 tokens **0 diff**；候选 vs 最终仅 **2 处** `import("…")` 路径深度适配 |
| 导出面 | **51 = 运行时 6 + 类型 45**（结构测试 8/8；运行时键集合实测恰 6 项） |
| 导入图 | 无环；barrel→index→features 分层/白名单全绿（结构测试） |
| 工具面快照（R7） | 7 角色（chief 22 / product 14 / rapporteur 15 / nominator 19 / convener 17 / verifier 14 / implementer 12）逐字一致 |
| typecheck | `npm run typecheck` **EXIT=0**；`npm run typecheck:renderer` **EXIT=0** |
| 结构测试 | `session-structure.test.ts` **8/8**；`session-source.test.ts` **5/5** |
| 定向回归 | 全部通过或既有失败与干净 e37da80 基线**逐名一致（零新增）**——见 §4 |
| 14 钉子 | 基线 16 个失败名 = 当前 16 个失败名，**缺失 0 / 新增 0** |

## 2. 门面迁移与紧凑化（仅空白/换行）

1. 迁移内容：`SessionManager` 类整体（340 个类成员块：fields / get / set / methods / constructor）与文件头模型说明。
   同名、同签名、同可见性、同 JSDoc 文本；薄委托压成等价单行；constructor 注释保留为独立行、代码按 300 字符宽度
   在 `,`/`;`/`{` 后折行（纯空白/换行）。
2. **等价证明**（`…_evidence/facade-migration.md` §3、`tools/compare-tokens.mjs`、`tools/compare-candidate-final.mjs`）：
   类体 token 流（去空白/注释、字符串整体成 token）原 vs 候选 **15,362/15,362，0 差异**；候选 vs 最终仅 2 处差异——
   `../../src/model/trunk.ts` → `../../../src/model/trunk.ts`、`./runtime-history.ts` → `../runtime-history.ts`
   （两处 `import("…")` 内联类型路径，因文件深一层必须 rebase）。
3. 导入面：原 113 条 import 语句（256 行）→ 保留 65 条（按去注释类代码 token 判定使用），每条压一行；
   64 处相对说明符整体 rebase（`./session/X`→`./X`、`../../src/X`→`../../../src/X`、其余 `./X`→`../X`）。
   B1–B6 遗留的死导入（含 `node:fs`/`node:crypto`/多个纯类型）未迁入；全量清单见 `tools/dropped-imports.mjs`。

## 3. barrel（`app/desktop/session.ts`，30 行）

- 只做显式再导出：`SessionManager`、`MAX_LIVE_SESSIONS`（均自 `./session/index.ts`）；`CAPABILITY_INSTALL_SYSTEM_PREFIX`
  （自 `./session/session-env.ts`）；`desktopProjectExecutionInventory`/`subscribeDesktopExecutionInventory`
  （自 `./session/shared/inventory.ts`）；`shouldSuppressStarTaskReport`（自 `./session/shared/text.ts`）；
  45 个类型自既有来源（`runtime-shared`/`run-manifest`/`contracts/**`）。
- 51 导出逐项清单：`…_evidence/barrel-exports.txt`；运行时键集合实测恰为 6 项（类型名不出现在运行时键）。
- pin7 兼容：保留一行**纯类型** `import type { AssembleOperatorShellGateOptions, AssembleReadonlyShellGateOptions,
  RoutineShellPolicy } from "../../src/pipeline/orchestration/shell-arming.ts";`——`operator-channel.test.ts` 已改读
  `readSessionSource()`（测试角色并行记录），pin1–4 由 `lifecycle/open.ts` 真实实现承载；pin7 正则逐字要求两级路径，
  只有 barrel 层能出现该字面行。运行期擦除、无行为、不增加运行时导出。第一段「B7 迁移指针」注释已删除。

## 4. 验证结果（本段）

| 门槛 | 结果 | 日志 |
| --- | --- | --- |
| `npm run typecheck` / `typecheck:renderer` | **EXIT=0 / EXIT=0** | `final/typecheck.log`、`final/typecheck-renderer.log` |
| `session-structure.test.ts` | **8/8**（导出面 51、无环/分层、barrel ≤50、index ≤800、模块 ≤1,500、7 角色工具面） | `final/session-structure.log` |
| `session-source.test.ts` | **5/5** | `final/session-source.log` |
| boundary-refresh / message-queue / run-change-entry | **14/14 / 20/20 / 5/5** | `final/nails-boundary-message-runchange.log` |
| handback-delivery | **16/18**（2 既有：trio 回交路由、B 星形回交——与 e37da80 基线逐名一致） | `final/targeted-boundary-message-handback.log` |
| run-change-entry / directive-decision / customer-authorization-plane-integration / fixed-path-full-chain / queue-recovery-e2e / network-state-e2e | **5/5、8/8、6/6、3/3、2/2、6/6（合计 30/30）** | `final/targeted-run-change-directive-auth-fixed-queue-network.log` |
| turn-watch-verify（3 文件） | **12/13**（1 既有：B1 检查时限到点不中止——与基线逐名一致） | `final/turn-watch-verify.log` |
| b101 / b111 | **16/16（11+5）** | `final/b101-b111.log` |
| operator-channel（测试角色改指后） | **58/59**（1 既有：I-1 补丁真实装配——链接工作树既有环境失败，与 e37da80 基线逐名一致） | `final/operator-channel.log` |
| 14 钉子失败名 | 基线 16 = 当前 16；**零新增 / 零缺失（NO_DIFF）** | `final/nails-*.log`、`baseline/nails-clean-e37da80.log`、`failure-name-diff.txt` |

14 钉子 = evidence-markers / queue-status / request-status / boundary-refresh / chief-workflow / directive-input /
dispatch-fresh-enum / hot-path / interface / message-queue / run-change-entry / g1-copy-and-nails / h-scope-audit /
governance-matrix-integration。基线为临时 detached 工作树 e37da80（node_modules junction，只读对照，完成后移除）。
chief-workflow 58/66（8 既有）、directive-input 14/19（5 既有）、h-scope-audit 4/7（3 既有），失败名与基线逐名一致。

## 5. 偏差与适配

- **D1 `MAX_LIVE_SESSIONS` 定义位置**：随门面迁入 `session/index.ts`（barrel 原样转出）。barrel ⇄ index 不可互导
  （否则导入图成环），而 constructor 需要该常量；公开面与值不变（结构测试断言 `=== 3`）。
- **D2 pin7 字面 import 行保留在 barrel**：见 §3；纯类型、运行期擦除。测试角色记录
  `角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b7-operator-pins.md` 亦建议此处置。
- **D3 死符号不迁入**：`GOVERNANCE_SLUG_RE`、`VERSION_DECISION_SYSTEM_PREFIX`、`desktopSessionManagers`
  在第一段工作树中已无引用（grep 仅命中定义行）；删除行为中性。
- **D4 并行工作区**：`test/桌面应用/operator-channel.test.ts`（改读 `readSessionSource()`）与
  `角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b7-operator-pins.md` 属测试角色并行改动，本段未触碰；
  本段只写 `app/desktop/session.ts`、`app/desktop/session/index.ts`、`test/桌面应用/session-structure.test.ts`
  与桌面窗口本段记录/证据。
- **D5 结构测试预算**：`SESSION_TS_FROZEN_BASELINE_LINES` 6,954 → **50**；同一体量预算测试内新增
  `session/index.ts ≤800` 断言（用例数保持 8；标题/注释同步）；每模块 ≤1,500 不变。

## 6. 终检

- `wc -l`：barrel **30**（≤50）、`session/index.ts` **790**（≤800）、`session/**` 最大 **1,477**（≤1,500）。
- `git status`：仅预期路径（本段 3 个写区 + 第一段未跟踪/修改文件 + 测试角色并行文件 + 记录/证据）；无临时目录、
  无 junction 留在工作树内。
- 未 commit / 未 push / 未触发 CI / 未 tag / 未读 `.env` / 未占用 9222–9224 / 未启动 Electron 或真实模型。

## 7. 后续（不在本段）

1. 全量测试 / 三套冻结 known-red / 三平台 release 冒烟（方案 §5 B7 波次边界）。
2. `operator-channel.test.ts` pin7 如需永久收口，可按 Q1 扩展把路径前缀改为深度无关正则，然后删除 barrel 的兼容
   类型 import 行（本段边界不允许改该测试）。

> 第三段（全量套件 / 三套 known-red / 桌面全链 / 打包冒烟 / 终检）已完成：
> `角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-final.md`
> （合并 5,824/5,601/188/32/3；三套 known-red 逐名一致；全链零新增；本地 Windows 打包 EXIT=0；唯一 ADDED 为 i18n 守卫 allowlist 缺口，待裁决）。
