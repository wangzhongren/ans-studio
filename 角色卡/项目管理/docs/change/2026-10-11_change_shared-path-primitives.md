# 项目管理 变更记录

## 2026-10-11 — 建共享路径原语 + 运行时原语模块（T23）

**来源**：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.11（全仓盘点 §6 禁令逼出的跨角色镜像）与派发清单 T23（依赖：无；被 T20/T22/T24/T25 依赖）。
背景：工程法案 §6「不得导入其他角色的私有 `common/`」逼出若干**镜像**（各角色自持一份同义实现）。其中**行 6（路径规范化）安全相关、最高优先**——Pi适配器写入层 `src/common/pi-adapter/fs-write.ts` 与门禁引擎 `src/common/门禁引擎/paths.ts` **各持一套路径规范化**，而**「gate 认为在根内」与「写入层认为在根内」必须一致**（设计 §6 风险 2–3「写根与 gate 同源」）；语义若漂移即留**误放行**空间。

**做了什么（搬迁，非 fork）**
- 新增 `src/common/shared/path-primitives.ts`，把两处**逐字同源**的词法路径原语**整体搬迁**为单一来源：`IS_WINDOWS`、`toPosix`、`isAbsoluteAny`、`normalizeLexical`、`compareKey`、`isUnderOrEqual`、`absRel`、`isWithinReal`，以及真实路径解析 `realResolve`（sync）/`realResolveAsync`（async）。正文与 `/** */` 文档注释**逐字来自旧实现**。
- 新增 `src/common/shared/runtime-shared.ts`，收三类散在小原语：`RuntimeKind`（原 3 处：编排 `args.ts`/装配 `runtime.ts`/桌面 `session.ts`）、`PI_CREDENTIAL_ENV_VARS`（原 2 处，**安全相关**：装配判凭据 / Pi适配器 spawn 时剥离）、`resolveSkillRoot`（原 2 处：装配 `src/index.ts`/桌面 `project.ts`）。
- 登记 `docs/architecture/shared-components.md`：新增**组件 2（path-primitives）**与**组件 3（runtime-shared）**。
- 新增测试 `test/项目管理/shared/path-primitives.test.ts`（21 例）、`test/项目管理/shared/runtime-shared.test.ts`（6 例）。

**`realResolve`（sync）与 `realResolveAsync`（async）：复核结论**
- **实测两处旧实现**：门禁 `realResolve` 用 `realpathSync.native`（失败回退 JS `realpathSync`）；Pi适配器 `realResolveAsync` 用 `await realpath`。二者**算法逐字相同**（对最深存在祖先做 realpath、不存在段按词法拼回），仅 realpath 调用为 sync/async 之别。
- **本机实测（Node v24.11.1 / Windows）**：`realpathSync.native` 与 async `realpath` **结果一致**（均把大小写规范化为磁盘真形），且**均解析 junction/symlink**；唯有 JS `realpathSync`（非 native）**不**规范化大小写——而它只在 `.native` 抛错时才被用作兜底，属罕见错误路径。
- **结论**：**收进共享**（两个变体都在 `path-primitives.ts` 内、算法同源），并**用测试钉死「两处旧实现对同一输入给同一答案」**——覆盖大小写、junction/symlink、不存在尾部、含 `..` 等。测试用例直接**同时导入两处旧实现**并比对，是本次要害的恒真证明。

**当前所处窗口：两处并存（过渡）**。T23 只建共享模块，**不删** Pi适配器/门禁引擎/编排/装配/桌面的本地副本（越界）——故此刻 `fs-write.ts`/`paths.ts`/`args.ts`/`runtime.ts`/`index.ts`/`project.ts`/`session.ts` 的旧实现与 `shared/` 新模块**并存**，取值/语义**逐字相同、行为不分叉**。

**消费方需做的精确动作（供 T20/T21/T22/T24/T25；本任务不改其文件）**
- **T20（Pi适配器）**：`src/common/pi-adapter/fs-write.ts` 删除本地 `IS_WINDOWS`/`toPosix`/`normalizeLexical`/`compareKey`/`absRelLexical`/`isWithinReal`/`realResolveAsync`，改从 `src/common/shared/path-primitives.ts` 导入（`absRelLexical` → `absRel`；`realResolveAsync` 同名）。**保留** `checkRelativePathSafe`（写入层名称安全，门禁无对应物，非镜像）。`src/provider/pi/tools.ts` 删 `PI_CREDENTIAL_ENV_VARS` 本地副本，改从 `runtime-shared.ts` 导入。
- **T25（门禁引擎）**：`src/common/门禁引擎/paths.ts` 删 `IS_WINDOWS`/`toPosix`/`isAbsoluteAny`/`normalizeLexical`/`compareKey`/`isUnderOrEqual`/`absRel`/`realResolve` 本地实现，改从 `path-primitives.ts` 导入（同名）。
- **T21（编排）**：`src/common/编排/args.ts` 的 `RUNTIME_KINDS`/`RuntimeKind` 改从 `runtime-shared.ts` 导入、删本地。
- **T24（装配）**：`src/common/装配/runtime.ts` 的 `RuntimeKind`/`PI_CREDENTIAL_ENV_VARS`/`DEFAULT_RUNTIME` 与 `src/index.ts` 的 `resolveSkillRoot` 改从 `runtime-shared.ts` 导入、删本地。
- **T22（桌面应用）**：`app/desktop/session.ts` 的 `RuntimeKind`、`app/desktop/project.ts` 的 `toPosix`/`resolveSkillRoot` 改从 `runtime-shared.ts`/`path-primitives.ts` 导入、删镜像。
- 均**只读导入、不得复制第二份**（§一.5）。

**顺带收敛**：`RuntimeKind` 与 `resolveSkillRoot` **已一并收进** `runtime-shared.ts`（低优先，改动面小：仅在本任务内新增定义 + 测试，消费方接线归 T21/T22/T24）。

**验证（项目管理独立执行）**
- 本组：`node --test "test/项目管理/**/*.test.ts"` → **39 pass / 0 fail**（12 = 既有 config-loader + **27 新增**）。
- 全量：`node --test "test/**/*.test.ts"`（**带引号**）→ **432 pass / 0 fail**。并存窗口期间**无行为分叉**。
- 注：任务文字 `node --test test/项目管理/*.test.ts` 为**单层** glob，测试实位于 `test/项目管理/shared/` 一层之下，故该字面 glob 命中 0 文件；本任务按**递归** `test/项目管理/**/*.test.ts` 执行本组。

**边界与合规**：仅写 pm Section 1 内路径（`src/common/shared/`、`test/项目管理/shared/`、`角色卡/项目管理/docs/`）。未读 `.env`、未发网络请求、未打印凭据；未改任何其他角色文件。

**记录更新**：本文件 + `memo.md` 追加一行 + `docs/architecture/shared-components.md` 组件 2/3 与变更段。
