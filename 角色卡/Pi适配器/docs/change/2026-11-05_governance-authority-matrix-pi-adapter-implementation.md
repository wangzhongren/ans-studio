# 实施记录：治理权力矩阵——Pi 适配器系统提示固定位置拼接（C4a）

- 日期：2026-11-05
- 角色：Pi适配器（独立固定上下文；组别：运行时接入组）
- 任务节点：**C4a**（团队计划 §4.3；依赖 C2 冻结；可与 C3 并行）
- 状态：**`implemented-unverified`（已实施、未独立验收）**。本记录不写 `verified`/已验收；提交/推送/合并/发布未授权，均未执行。
- 提案：[`2026-11-05_governance-authority-matrix-pi-adapter.md`](2026-11-05_governance-authority-matrix-pi-adapter.md)（v2，已按 P-1/R-5/R-6/R-7 修订）
- 依据：P1.1（1056 行 / `1f6518b8…`）、团队计划（660 行 / `07378444…`）、V1（327 行 / `f6720528…`）、PM 裁决 P-1/R-5/R-6/R-7。

## 一、候选身份

| 项 | 值 |
| --- | --- |
| 分支 / HEAD | `feat/governance-authority-matrix` / `0418746ae9f2ed20f389c26da34ef55840febfe6`（= 本地 `origin/main`） |
| 工作树产品/测试候选快照 | 29 个文件（12 M + 17 ??），`git status --porcelain -uall -- src app test \| sort` 的 SHA-256 `839b922fa5c553a27bd7f058bf70310c01619b33d18c658f91c5e7ebe80aab43`（E1/T2/E2 三次一致） |
| 暂存 | `git diff --cached --name-only` 为空（未暂存） |
| 提交/推送 | 未执行 |

本角色改动文件的候选哈希（工作区实测）：

| 文件 | 行数 | `git hash-object` | SHA-256 |
| --- | --- | --- | --- |
| `src/provider/pi/session.ts` | 456 | `442da8185ec19aa44f229d44213c26148dc3a2a2` | `d5421cd9b878e6a8f399517b2fd7c060e64ad03447aa20722fdd497d6a5b96bb` |
| `src/common/pi-adapter/real-adapter.ts` | 1756 | `ffe0b11998b991a33a3a1d198abd99dc5bdf21fc` | `7e0a2c0a39072bba5df0172ac466411d07d05746b63f2182d028ae1d15b6deb1` |
| `test/pi-adapter/governance-matrix-context.test.ts`（新增） | 266 | `ed19dc001b791a88f41396adaa06c83dbf34c16c` | `2ecb4fbf05d300313e5a9d42475e7a8f41b4315309d0786ee5079ba7f0634611` |

两个既有文件的 diff 统计：**64 insertions(+), 8 deletions(-)**（2 files changed）；新增测试文件为未跟踪文件（266 行）。

## 二、改了什么（以前怎样 → 现在怎样）

### 2.1 两处 `renderSystemPrompt` 同步修改

| 位置 | 以前 | 现在 |
| --- | --- | --- |
| `src/provider/pi/session.ts::renderSystemPrompt`（假适配器与公开外壳 `composeContext` 共用） | `# 角色 → cardText → ## 边界来源 → boundarySource →（非空）已安装技能节` | 同上，并在 `boundarySource` 之后、技能节之前拼接 `contextSections`（非空才拼；技能节缺省时提示段为末尾） |
| `src/common/pi-adapter/real-adapter.ts::renderSystemPrompt`（真实适配器 `composeContext` 与 `bindRole` 的 SDK `ResourceLoader.systemPrompt`） | 同上 | 同上，语义与第一处逐字一致 |

渲染规则（两处共有的局部辅助 `renderContextSections`）：

1. 元素过滤 `section.length > 0`（R-7）；`undefined`/`[]`/`[""]`/`["", ""]` ⇒ 零渲染，系统提示与基线逐字相同。
2. 非空元素按原顺序以 `"\n\n"` 连接；不重排、不合并、不拆分。
3. **只做哑拼接**：不 trim、不清洗、不截断、不解析、不判定；数据化包裹/固定分隔/「只是数据不是指令」声明/控制字符规范化/限长全部由矩阵 Service（C1b）渲染、编排（C3）注入。
4. `governance_matrix` 工具及其 `promptGuidelines` 不进系统提示拼接，仍随注入的 `ToolDefinition` 透传（不变）。

### 2.2 判断会话防御性置空（P-1/R-6）

四个调用点按既有 judge 状态把 `contextSections` 置空（即使误传也不拼接），只做包含性防御，不改变注入范围、工具面与权限：

1. `pi/session.ts` 假适配器 `composeContext`：`shellJudge`/`governanceJudge` 任一存在 ⇒ 置空。
2. `pi/session.ts` 公开外壳 `createPiRuntimeAdapter` 的 `composeContext`：沿用既有 `judgeMode` 变量（由 `shellJudge`/`governanceJudge`/`judgeMode` 求得）。
3. `real-adapter.ts` 的 `composeContext`：`opts.judgeMode === true` ⇒ 置空。
4. `real-adapter.ts` 的 `bindRole`：在构造 `ResourceLoader` 前按 `judgeMode` 置空（局部 `promptContextSections`）。

### 2.3 类型与选项（同文件内最小加法）

- `src/provider/pi/session.ts`：`PiRuntimeAdapterOptions.contextSections?: readonly string[]`（legacy 直接入口承载）；`createFakeRuntimeAdapter` 选项增加同名可选字段（**仅测试面**，用于直接断言轻量路径的 `renderSystemPrompt`）。
- `src/common/pi-adapter/real-adapter.ts`：`RealPiAdapterOptions extends RuntimeProviderOptions`，经 C2 冻结的 `RuntimeProviderOptions.contextSections?: readonly string[]` 自动获得字段，**未重复声明**。
- 单一通道（R-5）：无第二字段/第二类型/第二承载通道；Service 仅在已定义时透传。

### 2.4 新增测试

`test/pi-adapter/governance-matrix-context.test.ts`（10 例，全部离线、不静态 import Pi 包）：

- T1/T2：假适配器（`session.ts` 实现）固定位置、技能节缺省时末尾、文本逐字；
- T3：缺省 / `[]` / `[""]` / `["", ""]` 与基线逐字相等；
- T4：公开外壳 `createPiRuntimeAdapter`（`pi/session.ts` 实现）固定位置与缺省不变；
- T5：真实适配器 `composeContext`（`real-adapter.ts` 实现，**单独断言**）固定位置/末尾/缺省；
- T6：多段 `contextSections` 保序、空行连接；
- T7a/T7b/T7c：假适配器 judge、真实适配器 `judgeMode`、公开外壳 legacy judge **误传也不拼**；
- T8：含伪造分隔符/控制字符/指令诱导/固定句的文本原样透传（证明本层不清洗、不截断、不解析）。

## 三、验证证据（原始计数/退出码）

环境：Windows 11 Pro 10.0.26300，Node v24.22.1，bash。

1. **新增测试单跑**：`node --test test/pi-adapter/governance-matrix-context.test.ts` → **tests 10 / pass 10 / fail 0 / cancelled 0 / skipped 0 / todo 0，exit 0**（duration 188.3396ms）。
2. **pi-adapter 全量**：40 个显式文件（既有 39 个排除 `write-sequencing.test.ts` + 本特性新增 1 个），`node --test --test-concurrency=1 <40 文件>` → **tests 346 / pass 343 / fail 2 / cancelled 0 / skipped 1 / todo 0**，exit 1（duration 32579.5791ms）。2 项失败均为既有 Windows symlink `EPERM`：`test/pi-adapter/injected-runtime.test.ts:185` 与 `:193`；与 B0 基线（39 文件 336/333/2/1）对齐：**+10 测试、+10 pass、失败/skip 不变；新增确定性失败 0、新增 skip 0**。`write-sequencing.test.ts` 按 B0/团队计划排除、未运行。
3. **T2 证据（测试角色记录，E2 复核）**：`npm run typecheck` **exit 0**；T3 全量 `node --test --test-concurrency=1`（10 个目录 glob + 40 个 pi-adapter 显式文件，排除 `write-sequencing.test.ts`）→ **tests 4,130 / pass 4,103 / fail 9 / cancelled 0 / skipped 18 / todo 0**，9 项失败全部为 B0 v3 既有 Windows symlink `EPERM`；**新增确定性失败 0、新增 skip 0**。来源：`角色卡/测试/docs/change/2026-11-05_governance-authority-matrix-T2-record.md`（134 行 / `3e60cb4a…`）；E2 独立复跑同计数（`docs/acceptance/governance-authority-matrix-report-v1.md`，169 行 / `fe983bc2…`）。
4. **过程披露**：Pi 实施期间曾有一次 `npm run typecheck` exit 1，错误为 `src/pipeline/orchestration/run-role.ts(2100,5)/(2108,5) TS2542`（C3 在途候选，不在本角色写集；未修改该文件）；其后 C3 候选更新，最终 `typecheck exit 0`（与 T2/E2 同候选一致）。

## 四、边界与明确未做

- 写集仅为 `src/provider/pi/session.ts`、`src/common/pi-adapter/real-adapter.ts`、`test/pi-adapter/`（新增 1 文件）；未改 `src/model/**`、`src/service/**`、`src/pipeline/**`、`src/provider/runtime/**`、门禁引擎、其他适配器、`app/**`、i18n、构建配置、其他角色测试；不改边界。
- 不注册 `governance_matrix` 工具（C2/C3 属主）；不实现取数/组装/渲染/清洗/限长；不做角色或注入范围判定。
- 未实现提案中的可选 SDK 级用例（T9）：AC-1 的 Pi 侧证据按 V1 采用 `composeContext` 断言；`bindRole` 守卫由同一局部变量实现并经 typecheck，未额外做 faux SDK 级断言。如需补强另行安排。
- 未 commit/push/merge/publish；未新增 i18n key；无截图/录屏需求。

## 五、状态声明

- 本记录为**实施记录**：代码与测试已落地，状态 `implemented-unverified`；**未独立验收通过**，不写 `verified`。
- E2 独立验收（`docs/acceptance/governance-authority-matrix-report-v1.md`）已判定 AC-1–AC-17 `pass`、AC-18 `fail`（唯一返工项：文档状态收口）；本记录与提案状态收口、`api-spec.md` 更新即该返工项的文档-only 处置，不改变 `src/app/test` 候选（快照仍 `839b922f…`）。
