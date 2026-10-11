# 项目管理 变更记录

## 2026-10-11 — `.ans` 载入器共享化：搬迁 `loadEffectiveConfig`/`enforcePinBackedAcceptance` 到 `src/common/shared/`（T11）

**来源**：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.10 与派发清单 T11（依赖：无）。
背景（T10 回报的阻塞）：裁定要求桌面「带 `.ans` 优先加载（pin 生效），无 `.ans` 回退运行期同意」，但载入器落在**装配私有** `src/common/装配/config-loader.ts`；工程法案 §6 **禁止跨角色导入他人私有 `common/`**，`src/common/shared/` 又无入口，渲染侧自写是明令禁止的「第二份实现」——三条规则叠加使**正当通路为零**。裁决：把能力提到共享位置。

**做了什么（搬迁，非 fork）**
- 新增 `src/common/shared/config-loader.ts`，把装配私有加载器的**全部能力整体搬迁**：`loadEffectiveConfig`、`enforcePinBackedAcceptance`，及其全部依赖——`ANS_DIR_NAME`、`ANS_PROJECT_FILE_NAME`、`ConfigSourceKind`、`ConfigSource`、`LoadedConfig`、`LoadConfigOptions`、`ansProjectPath`，与内部 `parseAcceptance` / `parsePin` / `parseRoles` / `fallbackSource` / `invalidConfig` / `buildFromAns` / `isRecord`。仅重写了顶部 `//` 头注释以如实描述新家（属主 pm、消费方装配/桌面、来历 T11），**代码与 `/** */` 文档注释逐字不变**。
- 新增共享组件目录文档 `docs/architecture/shared-components.md`（本项目**首个**共享组件登记，格式依技能 `references/shared-directories.md`）。
- 核对并更新工程法案 `docs/project-rules.md` §一.5（与实现一致；补记过渡窗口）。
- 新增测试 `test/项目管理/shared/config-loader.test.ts`（12 例）。

**行为等价如何保证**：搬迁文件与源文件做 `diff`（剔除 `//` 注释行）→ **代码逐字相同**（含全部 `/** */` 文档注释）。两条关键 fail-closed 分支原样保留并被测试钉住：
1. `.ans` 存在且 `accepted:true` **无 pin** → **置未接受并清空 `source`**（`{ accepted:false, source:"" }`），并记降级原因；
2. `.ans` 存在但**不可解析**（或顶层非对象）→ **`ans-invalid`：未接受、roles 为空、绝不回退**到（可能是演示 `accepted:true` 的）fallback acceptance。
另：无 `.ans` → 回退 `fallback` **原样**（不经终态规则，行为不放松）。

**当前所处窗口：两处并存（过渡）**。T11 只创建共享模块，**不删**装配的本地文件（那属装配边界，pm 越界）。故此刻 `src/common/装配/config-loader.ts`（旧）与 `src/common/shared/config-loader.ts`（新）**并存**，两份代码**逐字相同、行为不分叉**。已 import 装配副本的仍按原样工作，不受影响。

**T12（装配）需做的精确动作**
- 文件：`src/common/装配/config-loader.ts`。
- 导入：把其**全部消费点改为从共享模块导入** `src/common/shared/config-loader.ts`。当前消费点：`src/index.ts`（`loadEffectiveConfig`、`ConfigSource`、`LoadedConfig`）、`src/interface/cli/init.ts`（`ANS_DIR_NAME`、`ANS_PROJECT_FILE_NAME`），以及测试 `test/装配/config-loader.test.ts`、`test/编排/init.test.ts`。
- 删除：`src/common/装配/config-loader.ts` 的**本地实现**（`loadEffectiveConfig` / `enforcePinBackedAcceptance` / `ansProjectPath` / 常量 / 类型 / 全部私有解析函数）。若为兼容保留该路径，则改为**纯 re-export**（`export * from "../shared/config-loader.ts";`）的薄转发，**不得**留第二份同义实现。
- 验收：行为不变、**全量测试通过**（§3.10 T12）。

**验证（项目管理独立执行）**
- 共享模块测试：`node --test 'test/项目管理/shared/*.test.ts'` → **12 pass / 0 fail**。
- 装配既有加载器测试（对照，未改）：`test/装配/config-loader.test.ts` 通过。
- 全量：`node --test test/*/*.test.ts` → **331 pass / 0 fail**（此 glob 为两层，**不含**本新增的三层测试）；递归 `node --test 'test/**/*.test.ts'` → **343 pass / 0 fail**（=331+12）。迁移期无行为分叉。

**边界与合规**：仅写 pm Section 1 内路径（`src/common/shared/`、`test/项目管理/shared/`、`角色卡/项目管理/docs/`）。未读 `.env`、未发网络请求、未打印凭据；未改任何其他角色文件。

**记录更新**：本文件 + `memo.md` 追加一行 + `docs/project-rules.md` §一.5 与变更记录。
