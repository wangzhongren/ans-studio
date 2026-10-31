# A2 变更记录：例行命令确定性白名单谓词（`matchRoutineShellCommand`）

- 任务 ID：`2026-10-31-shell-deny-customer-escalation`（T3，节点 A2：确定性白名单谓词）
- 角色：门禁引擎（独立固定上下文）
- 状态：`implemented-unverified`（谓词与两处消费已实施、门禁引擎自测/typecheck 通过；未经独立验收；未 commit/push、未启动应用）
- 基线：worktree `flow-improvements-wave1`，HEAD `9f670fb`（合并 main `32d8f0d` / v1.8.3）；Node v24.22.1 / npm 11.19.1；node_modules 已安装
- 依据：方案 v1.3 `docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`（857 行 / `6bd12a99…`）§5.1/§5.3/§5.4/§6.1/§8.3/§9；团队计划 `docs/scheduling/2026-10-31_team-plan_shell-deny-customer-escalation.md` §4.3（A2）；V1 标准 `docs/acceptance/shell-escalation-criteria-v1.md` AC-12/AC-13/AC-14/AC-16
- 日期：2026-10-31
- 范围：仅白名单谓词 + 两处消费点 + Service 再导出 + 审批档卡文案 + 门禁引擎测试；**不 commit/push、不启动应用、未写写集外路径**

## 1. 结论摘要

- 新增唯一纯函数 `matchRoutineShellCommand(argv: string[]): { id: string } | undefined`（`src/common/门禁引擎/classify-shell.ts`），精确实现方案 §5.1：
  - `["npm","test"]`、`["npm","ci"]`、`["tsc","--noEmit"]`；
  - `["npm","run","test"|"typecheck"|"lint"|"check"]`（固定脚本名，其余脚本名不放行）；
  - `["node","--test"]` 或受限测试路径（`test/` 下、`*.test.{js,ts,mjs,cjs,mts,cts}`、无 flag、无 `..`、无空白/元字符）。
- 分类器 `classifyShellDetailed` 在**硬拒（第 5 步）与记号检查（第 6 步）之后、risky（第 7 步）之前**调用；命中 → `allow` / `ruleId: "allow:routine:<id>"`。
- 写目标守卫 `evaluateShellWriteTargets` 在程序名解析后、`node --test`/npm 脚本分支之前调用**同一函数引用**；命中 → `{ kind: "pass" }`。
- `src/service/gate/shell-rules.ts` 逐字再导出同一函数引用（测试断言 `===`）；未复制实现、未另立规则集。
- 硬拒/记号优先（自定义规则集下仍 deny）、risky 被覆盖（自定义更严格 risky 下仍 allow）均已断言（P7/AC-16）。
- 检查：`node --test "test/门禁引擎/**/*.test.ts"` 288 tests / 287 pass / 0 fail / 1 skip（B0 基线 277/276/0/1；新增 11 个测试、0 新增失败、0 新增 skip）；`npm run typecheck` exit 0。

## 2. 逐文件改动与 before/after 哈希

> `git hash-object` 为 blob SHA-1（40 位）；`sha256sum` 为工作区字节 SHA-256。基线哈希在写前实测，与派发单一致。

| 文件 | 行数 before → after | blob before → after | sha256 before → after |
| --- | --- | --- | --- |
| `src/common/门禁引擎/classify-shell.ts` | 750 → 825 | `dfe7db0f1b98b0f342592ab8ae019df8a9b88d55` → `b7ba987e1d56b9aff543cbbfcb88180f7bb2132e` | `65f50042a9b47c18a205c21a718b849abb02e0a34fafc66ccb8b8cb0b6a15912` → `b14ce0ca3b836eee45aa35292909de06f8a4ac4c02bf80716954cca0bca4ee0a` |
| `src/common/门禁引擎/shell-write-guard.ts` | 667 → 671 | `01bda1cc039143a13bb92969792807325f4b0ec5` → `acb24beb82e2fdd6198911d5d6f02042a145054a` | `f9652564454fb9ea4cb19eb3a68684a44332c609d65d278efaa8f95e2298afeb` → `46749b3e7e3a596b3fc38f4f6dce6bdd2c6d8b376f79c3e259eb622c8cdcfaa4` |
| `src/common/门禁引擎/governance-roles.ts` | 615 → 615 | `204c2e9f8bd422814bf0eac3ab53dc7c90a32ec2` → `21ccc7bec05609cc3e5e0639ebde972b4ba1f988` | `ce5c8a2bb78e5e319dab4ae1a8461788dfb4feca3c1587723cae14dee568ddc1` → `8021761c0e7b767f3a809bb8ffe9a4f799dc6e1738457893cde3541c9439340d` |
| `src/service/gate/shell-rules.ts` | 13 → 17 | `1f5538dd185e83681cc08d4ab7af094dec5bf879` → `40fb3949eab6056413622026f428e3a4397ffe26` | `1335580bc4fc8bf050fd248341ab9ef1927c449f0bd00807a9aa09e1aaec1f97` → `c4ce294f81eaed5b28e32adfb8fb34fe6e3726a39c39b33fb2813363debb3533` |
| `test/门禁引擎/classify-shell.test.ts` | 667 → 685 | `801d99bf2ad1b474f713b688119bc6ded0b0e268` → `90ccf2c19c871025b284161e1f19eee5d43732ca` | `49f33a6ce242959e93eae66cdff191aef5739e4d73987397e14ad12a269aa18b` → `cf167f518d46d4b7b85481c782cb2a140cb3b2117c9ba8344db8e118ec93c88a` |
| `test/门禁引擎/shell-write-guard.test.ts` | 226 → 258 | `6213774e4a2a604bf7a93b211ad0310c897d625b` → `05cdd6f8dfbf322abe97a2d824cf2e80b19f9740` | `360498e44f057bfed8d1706bafa556df066a6a4b090e87979c905af472040ddc` → `03a333bbce0f419135b8cdb219f588520edc4d017952f1f83acd9053afd25850` |
| `test/门禁引擎/shell-rules-public-reexport.test.ts` | 37 → 50 | `70984eba8f895997827432be53e400b7c8a11757` → `e529bd0180a7a24ef0d2bf9552f7a3eb09864165` | `a1f8e43144d2c05300b51212f429484fe97cb2993eb08d72209e5174eeb02ea3` → `dcd2857e36b8f3ac215ceed1378d4462159a9d7cefe4b8c4ba346ac06b2a20da` |
| `test/门禁引擎/shell-routine.test.ts`（新增） | 0 → 235 | 不存在 → `910557bcc4750c826bb47e628e4519093c9d86ba` | 不存在 → `e92b02c883e71849ebc7a2804bd757878681896a9f7a10732b76143fe0d4d283` |
| `角色卡/门禁引擎/docs/change/2026-10-31_change_shell-escalation-A2.md`（本报告） | 新增 | — | — |

实现要点（diff 见证据 `task-diff.patch`，仅含本角色写集 7 个已跟踪文件；新测试文件见工作区 status）：

- `classify-shell.ts`：谓词定义（含 `ROUTINE_NPM_RUN_SCRIPTS` / 路径段正则 / 后缀正则 / `isRoutineNodeTestPath`）；`classifyShellDetailed` 新增第 6.5 步调用。无 IO、无规则集依赖。
- `shell-write-guard.ts`：`import { …, matchRoutineShellCommand }`（同一模块私有源，角色内共用，非第二份实现）；在 `find -exec` 硬拒之后、`node --test` / npm 脚本分支之前 `if (matchRoutineShellCommand(argv) !== undefined) return { kind: "pass" }`。
- `shell-rules.ts`：`export { classifyShell, defaultShellRules, matchRoutineShellCommand } from "../../common/门禁引擎/classify-shell.ts"`（逐字转出；头注补谓词形状与委托三 id）。
- `governance-roles.ts`：`SHELL_APPROVAL_CARD_LINE` 末尾追加「判拒后可申请客户确认（每会话一次）。」（仅文案，判定零变化）。
- 测试：见 §4 与 §5。

## 3. 谓词冻结声明（供 B1 消费）

1. **唯一实现**：`src/common/门禁引擎/classify-shell.ts::matchRoutineShellCommand`。`rg -n "matchRoutineShellCommand" src test` 仅见：1 处定义（classify-shell.ts:341）、1 处分类器调用（:508）、1 处写守卫导入（shell-write-guard.ts:17）与调用（:540）、`shell-rules.ts` 再导出（:17）及测试引用——**无第二份白名单/风险判定**。证据：`rg-matchRoutineShellCommand.txt`。
2. **Service 出口同引用**：`src/service/gate/shell-rules.ts` 只逐字转出；`test/门禁引擎/shell-rules-public-reexport.test.ts` 断言 `public.matchRoutineShellCommand === priv.matchRoutineShellCommand`。
3. **命中 id 冻结**（分类器 ruleId = `allow:routine:<id>`；**不得改名**）：

   | argv 精确形态 | id |
   | --- | --- |
   | `["npm","test"]` | `npm-test` |
   | `["npm","run","test"]` | `npm-run-test` |
   | `["npm","run","typecheck"]` | `npm-run-typecheck` |
   | `["npm","run","lint"]` | `npm-run-lint` |
   | `["npm","run","check"]` | `npm-run-check` |
   | `["node","--test"]` / `["node","--test",<paths>...]` | `node-test` |
   | `["tsc","--noEmit"]` | `tsc-noemit` |
   | `["npm","ci"]` | `npm-ci` |

   **B1 委托策略（`routine-shell-policy`）只接受原委托三 id：`npm-test` / `npm-run-typecheck` / `node-test`**（方案 §5.3/AC-15）；其余 id 属于新增 (c) 级形态，不继承给宿主委托。
4. **`node --test` 路径形状**：字面以 `test/` 开头（`./test/…`、绝对路径、`TEST/…` 不命中）；按 `/` 分段后每段仅允许 Unicode 字母/数字与 `._@+-`（中文测试目录合法；空白、引号、反斜杠、`* ? [ ] { } ( ) ; & | < > $ \` ! ^ % # ~ , = :` 等元字符一律不命中）；禁止 `.`、`..` 段与空段；文件后缀 `*.test.{js,ts,mjs,cjs,mts,cts}`（大小写敏感）。`node --test` 裸形态（无路径）命中（cwd=项目根的默认发现）。
5. **判定顺序契约**：硬拒（hardDenyPrograms）→ 危险记号（denyTokens，仅 `executionModel !== "argv-noshell"` 时生效）→ **例行白名单** → risky。因此自定义更严格 `riskyPrograms` **不能**覆盖本白名单（P7/AC-16，客户已在闸门 1 接受）；硬拒/记号仍绝对优先。
6. **调用签名**：`argv: string[]`（按方案/团队计划的字面签名）。B1 若从 `readonly string[]` 调用需 `[...argv]` 或等价复制；不得在编排侧改写/规范化 argv 再传入（精确 argv 全等语义，归一化属于申请键议题，不在本谓词）。
7. **不加入 `ShellRules` 数据**（§5.4）：写守卫拿不到规则集；未新增装配面。

## 4. 检查与证据

| # | 命令 | 退出码 | 结果 | 证据文件（路径 / 行数 / SHA-256） |
| --- | --- | --- | --- | --- |
| 1 | `node --test "test/门禁引擎/**/*.test.ts"`（B0 基线，写前） | 0 | tests 277 / pass 276 / fail 0 / skipped 1 / todo 0 | `…\Temp\ans-shell-escalation-evidence\A2\baseline-gate-tests.log` / 285 / `59072d70…` |
| 2 | `npm run typecheck`（写前） | 0 | tsc --noEmit 无输出 | `…\A2\baseline-typecheck.log` / 4 / `2d13ff10…` |
| 3 | `node --test "test/门禁引擎/**/*.test.ts"`（写后最终） | 0 | **tests 288 / pass 287 / fail 0 / skipped 1 / todo 0**（+11 tests，+11 pass；skip 仍为 `pin-evidence.test.ts` unreadable 权限，未新增） | `…\A2\final-gate-tests.log` / 296 / `2e4a62b1…` |
| 4 | `npm run typecheck`（写后最终） | 0 | tsc --noEmit 无输出 | `…\A2\final-typecheck.log` / 4 / `2d13ff10…` |
| 5 | `rg -n "matchRoutineShellCommand" src test` | 0 | 单一定义 + 两处消费 + Service 再导出 + 测试引用（无第二实现） | `…\A2\rg-matchRoutineShellCommand.txt` / 34 / `147fe66d…` |
| 6 | `git status --short`（全工作区快照） | 0 | 本角色 8 文件 + 其它角色并行改动（见 §6） | `…\A2\git-status.txt` / 32 / `ee7690a5…` |
| 7 | `git status --short -- <本角色写集>` | 0 | 7 个 M + 1 个 `??`（`shell-routine.test.ts`） | `…\A2\write-set-status.txt` / 8 / `0b2b3989…` |
| 8 | `git diff -- <本角色 7 个已跟踪文件>` | 0 | 285 行 diff | `…\A2\task-diff.patch` / 285 / `3cec19dd…` |
| 9 | 跨角色只读复核：`node --test "test/编排/**/*.test.ts"` | 1 | tests 563 / pass 547 / fail 16（15 项因 c-allow 前排、1 项环境 EPERM symlink；分类见 §6） | `…\A2\crossrole-orchestration-full.log` / 1398 / `0bff0953…` |
| 10 | 跨角色只读复核：`node --test "test/编排/shell-authorized-routine.test.ts"`（单独） | 1 | fail 14（同 §6；含 1 项 EPERM） | `…\A2\crossrole-shell-authorized-routine.log` / 282 / `5f087ffc…` |

- 测试计数对照：B0 277/276/0/1 → A2 288/287/0/1。**新增确定性失败 0、新增 skip 0、todo 0**。新增 11 个测试：`shell-routine.test.ts` 8 个、`classify-shell.test.ts` 1 个、`shell-write-guard.test.ts` 1 个、`shell-rules-public-reexport.test.ts` 1 个。
- 环境：Node v24.22.1 / npm 11.19.1 / win32（Windows 11 Pro），Git Bash。
- 原始日志目录：`C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\A2\`（每命令一文件；上表记录路径/行数/SHA-256；另有 `after-*.log`、`after-hashes.txt`、`final-hashes.txt`、`git-diff.patch`/`git-diff-stat.txt` 供追溯）。

## 5. 既有断言变更逐条理由

1. `test/门禁引擎/shell-write-guard.test.ts`「脚本审查（v2.3/R2）…」用例：
   - 移除 4 个现已命中例行白名单的 argv：`["node","--test"]`、`["node","--test","test/a.test.ts"]`、`["npm","test"]`、`["npm","ci"]`——理由：方案 §5.3 要求写守卫对例行命令**必须返回 `pass`**（否则 `script` 分支抢先，(c) allow 到不了执行层，0 卡不成立）；它们已移入新增的「例行命令确定性白名单 ⇒ pass」用例（逐条断言谓词 id、`pass`、不调用 `checkWrite`、分类器 `allow:routine:<id>`）。
   - **保留全部原负例**并新增邻近负例：`["npm","run","build"]`、`["npm","run","test:unit"]`、`["npm","install"]`、`["npm","test","--","--ci"]`、`["npm","ci","--ignore-scripts"]`、`["node","--test","../outside.test.ts"]`、`["node","--test","--import","src/setup.ts"]`、`["tsc"]`、`["tsc","-p","tsconfig.json"]`、`["npx","some-cli"]`、`make`/`cargo`/`go`/`bash <script>` 等仍断言 `script`——无弱化。
2. `test/门禁引擎/classify-shell.test.ts`：原文**没有** `npm test`/`npm ci` 的既有断言（包管理用例只断言 `npm run build`/`npm run exec`(exec)/`npm install`/`npx`/`pnpm add`/`npm ls`），因此无需改写旧断言；新增 1 条用例钉住方案 §5.4 的语义变化（`npm test`/`npm ci` → `allow` + `allow:routine:*`），并保留 `npm install`/`npm run build` 仍 `risky`、新增 `npm ci --ignore-scripts`/`npm test -- --ci` 仍 `risky` 的负例。其余断言（四档、硬拒、risky、fail-closed、执行模型等）逐字未动。
3. `test/门禁引擎/shell-rules-public-reexport.test.ts`：标题「两符号」→「三符号」，新增 `matchRoutineShellCommand` 同引用断言与公开出口冒烟；原 `classifyShell`/`defaultShellRules` 同引用与冒烟断言原样保留。
4. `test/门禁引擎/shell-write-guard.test.ts`：新增 1 条 routine pass 用例（10 形态 + classifier 交叉断言，AC-12 第 3 点）；其余用例未改。
5. `test/门禁引擎/shell-routine.test.ts`（新增 8 个测试）：正例矩阵（§5.1 全部形态 + 中文测试目录 + 全后缀）、id 冻结、纯函数/非法输入 fail-closed、负例矩阵（§5.4 误伤面全量）、负例分档（risky/review 精确断言）、自定义规则集 risky 覆盖、硬拒优先、记号优先。**无 skip/todo**。

## 6. 跨角色影响清单（不在本角色写集；由 B1/D1 按方案 §5.4 同步）

只读运行 `test/编排/**`（同一共享 worktree，点快照；A1/A3 并行改动亦在工作区）得 563 tests / 547 pass / **16 fail**。失败分类（原始日志 `crossrole-orchestration-full.log`）：

1. **由本次 c-allow 前排引起（15 项，均可在失败断言看到 `true !== false` / 分支变化）**：
   - `test/编排/shell-authorized-routine.test.ts` **13 项**（不止派发单列的两处）：
     - 5 项「宿主委托+b允许：`npm test`/`npm run typecheck`/`node --test`…」——分支从 `b-allow`/`b-delegated-routine` 变为 `c-allow`（断言旧分支失败）。
     - 「没有宿主委托或 cwd 项目不一致时，pm 允许仍保留 a」「c 硬拒组合即终结；su 只读档…」「常规检查的 b=deny/invalid/unsure/error/timeout」共 7 项——这些用例以 `npm test` 为样本期望「不 allow / 走 b/a」，现为 c-allow（0 卡、0 judge）而失败；**需改用非白名单样本或按 P7 改写期望**。
     - 「openRoleSession 真正把宿主政策传到 shell 装配，su 仍只读」——项目角色与 su 侧 `npm test` 均变为 c-allow。
     - 「shell 诊断明确委托来源与实际审核分支」——不再产生 `shell.routine.delegated` 诊断（c-allow 在委托之前）。
     - 说明：`npm ci` 负例（:63）与「非精确常规检查不继承政策」10 项**仍通过**（它们断言的是委托不命中/等价性，不是 allow=false）；B1 改委托策略后 `npm ci` 仍不继承。
   - `test/编排/shell-readonly.test.ts` **2 项**：`node --test` 原期望 `review → readonly-deny`，现为 c-allow（只读档按 (c) 白名单放行）。这两项按 P7「所有角色 c-allow」需更新期望；**若验收要求只读档不得放行例行命令，属方案未覆盖的设计点，需回统筹/策划确认（本角色不私自加过滤）**。
2. **环境性失败（1 项，与本次改动无关）**：`shell-authorized-routine.test.ts`「node test 外指符号链接路径不获委托」在 `fs.symlinkSync` 处 `EPERM`（Windows 无符号链接权限），在任何实现下都会失败，归环境。

其它需 B1 注意的谓词行为（本报告冻结口径）：

- `["node","--test","test/**/*.test.ts"]`（含通配 `*`）**不**命中例行谓词（§5.1「无元字符」；委托策略复用谓词后该形态将不再获委托，现有 `shell-authorized-routine.test.ts:29` 需同步处理）。
- `./test/…`、绝对路径、`TEST/…`、`node.exe`、`./npm`、`NPM` 等非精确形式均不命中（fail-closed，落回既有链）。
- 未命中形态的分档不变：`npm install`/`npm run build`/`npm test -- args`/`npm ci <flags>`/`npx *` → `risky`；裸 `tsc`/`tsc -p …`/越界或带 flag 的 `node --test` → `review`。
- 写守卫对未命中形态仍在 `node --test`/npm 脚本分支返回 `script`（不改既有脚本审查）。

## 7. 无越权改动声明

- 本节点改动仅限：`src/common/门禁引擎/classify-shell.ts`、`src/common/门禁引擎/shell-write-guard.ts`、`src/common/门禁引擎/governance-roles.ts`、`src/service/gate/shell-rules.ts`、`test/门禁引擎/classify-shell.test.ts`、`test/门禁引擎/shell-write-guard.test.ts`、`test/门禁引擎/shell-rules-public-reexport.test.ts`、新增 `test/门禁引擎/shell-routine.test.ts`，以及本角色 `docs/change/` 下本报告。**写集外改动：无**（工作区中 `src/model/runtime.ts`、`src/provider/runtime/**`、i18n、`test/runtime-core/**`、`test/项目管理/**`、`test/测试/**` 等为 A1/A3/H1/B0 等其它节点的并行改动，非本节点所写；未触碰 `test/编排/**`、`src/common/编排/**`、`src/pipeline/**`、`app/**`、角色卡/边界/YAML、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`）。
- 未 commit / push；未启动应用；未改断言保绿（变更均按方案要求并逐条列明）；未新增 skip/todo；未复制第二份白名单实现；未伪造输出（所有计数/日志来自上述原始文件）。

## 8. 偏差、风险与阻塞

- **读写集偏差**：无。
- **谓词与方案的字面差异（均为收紧，fail-closed，非放行扩大）**：①`node --test` 路径额外禁止 `.`/空段与 `./test/…` 前缀（比「在 test/ 下 + 无 ..」更严格）；②路径字符采用「Unicode 字母/数字 + `._@+-`」白名单（允许中文测试目录，拒绝全部空白/元字符）。未命中即落回既有链，不放行任何新形态。
- **风险（需 B1/D1/验收关注）**：只读档（legacy su `readonlyOnly`）按「c=allow 照旧放行」的既有装配语义，现会放行例行命令（`node --test`/`npm test` 等）。方案 P7 表述为「所有角色 c-allow」，但未显式讨论只读档；若客户意图是只读档仍严格只读，需在编排装配层额外过滤（属 B1/设计变更，本节点不实施）。已在 §6 列明两个受影响测试。
- **阻塞**：无。谓词已冻结，B1 可消费（经 `src/service/gate/shell-rules.ts`，原委托三 id：`npm-test` / `npm-run-typecheck` / `node-test`）。
