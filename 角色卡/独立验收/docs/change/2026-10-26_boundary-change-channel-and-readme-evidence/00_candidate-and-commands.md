# 候选身份、环境与命令（边界变更通道 + README 独立验收）

## 一、候选身份

| 项 | 值 |
| --- | --- |
| 工作树 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination` |
| 分支 | `feat/scaffold-first-governance` |
| 验收对象 HEAD | `6b7ef386bb3bf773c8b3492c03cceb353f08e2d4`（`feat(governance): boundary-change gate channel and governance-first README`） |
| 对比基线 | `ea0fff0e4a334012a5eef02924fb5e0c3547fa66`（上一轮已验收提交） |
| `main` | `182a631dde83a866416a098faf72700be5472c09`（`Merge pull request #24 …`） |
| 候选范围 | `git diff ea0fff0..6b7ef38`：22 文件，+3801/−271；`--check` exit 0；`--summary` 仅新增文件，无重命名/模式变化 |
| 运行时 | Windows 11 Pro 10.0.26300（win32 x64） |
| Node / npm | v24.22.1 / 11.19.1（`C:\Users\51054\AppData\Local\Programs\nodejs\node.exe`；PATH 前缀方式调用，未用 PowerShell） |

## 二、候选期工作树漂移（重要）

验收期间（2026-10-26 11:11–11:12）工作树出现**非本批、非本角色**的未提交渲染层改动：

- `M app/renderer/src/shell/Sidebar.tsx`
- `M app/renderer/src/shell/shell.css`
- `M app/renderer/src/stores/ui-store.ts`
- `?? app/renderer/src/chat/sidebar-topology.ts`
- `?? app/renderer/src/shell/SidebarTopology.ts`

另有一贯存在的未跟踪 `demos/`。截至 11:17 同一并发工作又新增未跟踪 `test/桌面UI/sidebar-topology.test.ts`（不在本批测试路径内）。以上均不属于候选提交；本批测试套件（runtime-core / 编排 / 门禁引擎 / 桌面应用 / governance-e2e）**不导入**这些渲染层文件；漂移出现后复跑 `npm run typecheck` 仍 exit 0。测试与行为结论绑定产品代码 HEAD `6b7ef38`，不绑定该漂移。

## 三、命令与结果

所有命令在工作树根执行；Node 通过 `PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"` 前缀调用。

| 编号 | 命令 | 结果 | 原始输出 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck` | exit 0（0 错） | `01_typecheck.txt` |
| 2 | `node --test test/runtime-core/request-boundary-change-tool.test.ts` | 9/9 通过 | `02_runtime-core-boundary-tool-test.txt`（首跑尾部 `02b_…`） |
| 3 | `node --test test/编排/request-boundary-change.test.ts` | 3/3 通过 | `03_orchestration-boundary-test.txt`（首跑尾部 `03b_…`） |
| 4 | `node --test "test/门禁引擎/**/*.test.ts"` | 327 tests：326 过 / 0 败 / 1 skip（Windows 平台权限用例），exit 0 | `04_gate-engine-tests.txt` |
| 5 | `node --test "test/桌面应用/**/*.test.ts"`（全量，第 1 次） | 645/645 通过 | `05a_desktop-full-run1-tail.txt` |
| 6 | 同 5（全量，第 2 次） | 645 tests：644 过 / 1 败 —— **既有** `2026-10-23 重派门（verification 进行中）`（`acceptance-dispatch.test.ts:2708`；内存发送与 flow 重开断言通过后，账本 verifier 派发记录读数 0≠1 的时序竞态，见报告 F4） | `05b_desktop-full-run2.txt` |
| 6b | 同 5（全量，第 3 次） | 645/645 通过 | `05c_desktop-full-run3.txt` |
| 7 | `node --test test/桌面应用/acceptance-dispatch.test.ts`（隔离复跑 ×2） | 两次均 72/72 通过（含上述既有用例） | `06_desktop-acceptance-dispatch-rerun.txt`、`06b_desktop-acceptance-dispatch-rerun2.txt` |
| 8 | `node --test "test/测试/governance-e2e-auto/*.test.ts"`（首跑） | 155/155 通过 | `07a_governance-e2e-first-tail.txt` |
| 9 | 同 8（复跑，完整输出） | 155/155 通过 | `07_governance-e2e-rerun.txt` |
| 10 | README Mermaid/围栏独立检查（grok-mermaid 解析器） | 两 README 各 14 个围栏（成对）、各 1 个 mermaid 块；`parseGraph=ok`、`render=ok`、零 warnings | `08_readme-mermaid-check.txt` / `.mjs` |
| 11 | 边界变更纯函数独立探针 | 见报告 A1/A5 与 `09_boundary-change-pure-function-probe.txt` | `09_boundary-change-pure-function-probe.*` |

## 四、复核用 diff 命令

```bash
git diff ea0fff0..6b7ef38 --stat
git diff ea0fff0..6b7ef38 --name-status
git diff ea0fff0..6b7ef38 --check        # exit 0
git diff ea0fff0..6b7ef38 --summary      # 仅 create mode，无改名/权限位变化
git diff ea0fff0..6b7ef38 --numstat
git diff ea0fff0..6b7ef38 -- test/ | grep -E "^-[^-]"   # 空：测试无删除/改写
```

## 五、说明

- 逐文件行数（numstat）：`README.en.md +290/−142`、`README.md +275/−127`、`app/desktop/boundary-change.ts +566`、`app/desktop/interface.ts +697/−1`、`app/desktop/session.ts +32`、`src/common/门禁引擎/governance-roles.ts +37/−1`、`src/model/runtime.ts +46`、`src/pipeline/orchestration/run-role.ts +36`、`src/provider/runtime/schema.ts +57`、`src/provider/runtime/tools.ts +178`；测试 5 文件 +1183/−0；上一轮独立验收文档/证据 5 文件 +401（随本提交一并入库，见报告 §三）。
- 测试文件 diff 为**纯新增**（删除行数为 0），未发现弱化断言、跳过或改测。
- 未执行有副作用的外部操作；未 commit / push。
