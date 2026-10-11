# 项目管理 变更记录

## 2026-10-11 — 建共享 argv 原语 `normalizeArgv`（T23，§3.11 行 7）

**来源**：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.11 **行 7**（全仓盘点 §6 禁令逼出的跨角色镜像），与派发清单 T23（pm 建 shared；被 T21/T22 依赖）。
背景：工程法案 §6「不得导入其他角色的私有 `common/`」逼出若干**镜像**（各角色自持一份同义实现）。**行 7 是最后一处**——`normalizeArgv`（argv 规范化）在**编排** `src/common/编排/shell-gate.ts` 与**桌面应用** `app/desktop/operator-channel.ts` 各持一份同形实现。**风险**：编排拿它**写进审计记录**（`docs/audit/shell-gate.jsonl` 的 `argv` 字段）、桌面拿**同一结果展示给操作者**（`describeShellCommand` 的逐项 argv 行）；两处若漂移，**「操作者所见到的 argv」与「落进审计的 argv」可能不是同一个**——而审计的意义正是「**审的什么原文**」可查。

**先比对（关键步骤）**：任务要求先比对两处现有实现，**逐字相同则直接搬、有差异则逐条列差异并报告**。
- 用 Node 读取两文件、正则截取 `function normalizeArgv(...) {...}` 函数体做**字节级比对** → **`IDENTICAL: true`**。
- 两处函数体**逐字相同**：`if (!Array.isArray(argv)) return []; return argv.filter((x): x is string => typeof x === "string");`。仅有上方**文档注释**之别（编排侧无注释、桌面侧有一行 `/** 规范化 argv：过滤非字符串项… */`）。
- **故无差异可报，按「逐字相同 → 直接搬到共享模块」执行**。

**做了什么（搬迁，非 fork）**
- 新增 `src/common/shared/argv-primitives.ts`，导出 `normalizeArgv(argv: unknown): string[]`。**正文逐字来自两处旧实现**；补写文档注释（来历、语义、边界）。
- 登记 `docs/architecture/shared-components.md` 新增**组件 4（argv-primitives）** + 本文件变更段。
- 更新工程法案 `docs/project-rules.md` §一.5：共享组件清单补全为现行**四个**（`config-loader`/`path-primitives`/`runtime-shared`/`argv-primitives`）；消费方更新规则扩为「装配/桌面/编排/Pi适配器/门禁引擎只读导入」；补记 **argv-primitives 消费方动作**（T21/T22）。
- 新增测试 `test/项目管理/shared/argv-primitives.test.ts`（12 例）。

**函数语义（逐字搬迁；测试据实际行为钉死）**
- 入参**非数组** → `[]`（`null`/`undefined`/标量/对象一律归空）。
- **仅保留** `typeof === "string"` 的项，其余（数字/布尔/`null`/`undefined`/对象/嵌套数组）**丢弃**。
- **不**去重、**不**裁剪空白、**不**转义——**保序、逐字保留**每项（含空串、含引号/空格/反斜杠的项、Windows 与 POSIX 路径原样）。
- **绝不**抛错。**不含任何治理判定**（分类/白名单/规则逻辑一概无）。

**当前所处窗口：两处并存（过渡）**。T23 只建共享模块，**不删**编排/桌面的本地副本（越界）——故此刻 `shell-gate.ts`/`operator-channel.ts` 的旧实现与 `shared/argv-primitives.ts` **并存**，两份**逐字相同、行为不分叉**。

**消费方需做的精确动作（供 T21/T22；本任务不改其文件）**
- **T21（编排）**：`src/common/编排/shell-gate.ts` 删除本地私有 `normalizeArgv`，改从 `src/common/shared/argv-primitives.ts` 导入。**4 处调用点**：`decide`（`const argv = normalizeArgv(req.argv)`）、`runB`（构造 `PmReviewInput.argv`）、`runA`（构造 `OperatorPrompt.argv`）、`audit`（审计记录 `argv` 字段）。行为不变。
- **T22（桌面应用）**：`app/desktop/operator-channel.ts` 删除本地私有 `normalizeArgv`，改从 `src/common/shared/argv-primitives.ts` 导入。**调用点**：`describeShellCommand`（`const argv = normalizeArgv(prompt.argv)`）。行为不变。
- 二者均**只读导入、不得复制第二份**（§一.5）。

**为何本组测试不做「两处旧实现同导比对」（与 path-primitives 测试的差别）**
- `path-primitives.test.ts` 能**同时导入两处旧实现**逐例比对（那些函数是**导出**的）。
- 而 `normalizeArgv` 在两处**均为私有非导出函数**，无法导入。故**逐字相同**由本任务的**字节级核对**确认（`IDENTICAL: true`），测试只据**共享实现的实际行为**逐条钉死语义；消费方改为从本模块导入后，本组断言即成为它们的口径基准。已在测试抬头注明此点。

**验证（项目管理独立执行）**
- 本组：`node --test "test/项目管理/**/*.test.ts"` → **51 pass / 0 fail**（12 既有 config-loader + 21 path-primitives + 6 runtime-shared + **12 新增** argv-primitives）。
- 全量：`node --test "test/**/*.test.ts"`（**带引号**）→ **460 pass / 0 fail**（基线 448 + 12 新增）。并存窗口期间**无行为分叉**。
- `npm run typecheck`（`tsc --noEmit`）→ **零错误**。
- 注：任务文字 `node --test test/项目管理/*.test.ts` 为**单层** glob，测试实位于 `test/项目管理/shared/` 一层之下，故该字面 glob 命中 0 文件；本任务按**递归** `test/项目管理/**/*.test.ts` 执行本组。

**边界与合规**：仅写 pm Section 1 内路径（`src/common/shared/`、`test/项目管理/shared/`、`角色卡/项目管理/docs/`、`角色卡/项目管理/memo.md`）。未读 `.env`、未发网络请求、未打印凭据；未改任何其他角色文件。

**记录更新**：本文件 + `memo.md` 追加一行 + `docs/architecture/shared-components.md` 组件 4 与变更段 + `docs/project-rules.md` §一.5 与变更记录段。
