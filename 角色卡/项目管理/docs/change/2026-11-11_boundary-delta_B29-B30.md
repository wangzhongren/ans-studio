# 边界 Delta 记录：B29/B30 派发单点名的 5 个文件补入属主角色卡 Section 1

- 日期：2026-11-11
- 性质：**记录式边界 Delta 补齐**（People-Ops / nominator 职责）；不写代码、不改既有条目、不改其它角色卡。
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`9cce9279b95a50bdb52bb8aee548006c101112cd`（`9cce927`）。
- 状态：**未 commit / 未 push / 未合并 / 未打 tag**（由调度统一提交）；未运行 Electron、未占用 CDP 9224。

## 一、依据

1. **B29/B30 派发单**（客户 2026-11-11 授权）：
   - **B29**：桌面 fixed `complete_team_plan` 回执形状（RR26 接缝事实：fixed A9 计划回执恒被工具层降级「结果未知」）；
   - **B30**：只读 Git `[user]` 白名单（repo-local 默认身份 `user.name`/`user.email` 放行，其余保持 fail-closed）。
2. **团队计划**：`docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md`（T3「两条固定工作流路径」；B 批记录、§三 写集与 owner、§九 写盘边界）。
3. **既有 owner 记录（事实来源）**：
   - `角色卡/桌面窗口/docs/change/2026-11-11_B29_two-fixed-workflow-paths.md`（B29 写集与候选）；
   - `角色卡/运行时核心/docs/change/2026-11-11_B30_two-fixed-workflow-paths.md`（B30 写集与候选）；
   - 接缝事实：`角色卡/测试/docs/change/2026-11-11_RR26_two-fixed-workflow-paths.md`。

本 Delta 只把上述派发单点名、owner 记录已载明的写集补进属主角色卡 Section 1 白名单，使白名单与实际一致；**无目录级授权、不扩其它路径、读取语义不变**（逐文件登记，不改变其它角色的任何授权）。

## 二、补齐的 5 个文件（md 表与 yaml entries 逐条一一对应）

| Delta 编号 | 属主角色卡 | 文件（kind: file） | 用途 |
| --- | --- | --- | --- |
| `Delta-B2930-1` | 桌面窗口 | `test/桌面应用/b3-fixed-baseline-pathb.test.ts` | A9 基线/A12 归档/路径 B 桌面接线测试（B29 触及） |
| `Delta-B2930-1` | 桌面窗口 | `test/测试/fixed-path-full-chain.test.ts` | fixed 两条路径确定性全链集成测试（B29 触及） |
| `Delta-B2930-2` | 运行时核心 | `src/provider/trunk/impl/git-command.ts` | 只读 Git 配置/命令解析与白名单（B30） |
| `Delta-B2930-2` | 运行时核心 | `test/编排/git-command.test.ts` | git-command 配置白名单/安全拒绝测试（B30） |
| `Delta-B2930-2` | 运行时核心 | `test/编排/readonly-git-transport.test.ts` | 只读 Git 传输/执行测试（B30） |

- `角色卡/桌面窗口/boundary.md` Section 1 表追加 2 行、`boundary.yaml` `entries` 追加 2 条（`Delta-B2930-1`）。
- `角色卡/运行时核心/boundary.md` Section 1 表追加 3 行、`boundary.yaml` `entries` 追加 3 条（`Delta-B2930-2`）。
- 两个角色卡均为**逐文件授权，无目录级授权**；原有条目与顺序不变（纯追加，0 删除、0 改写既有行）。

## 三、为何未在初始白名单（B 批新增测试/实现文件）

1. **桌面窗口**的 Section 1 对 `test/桌面应用/` 一律逐文件列白名单（无目录级授权），新测试文件不会自动纳入：
   - `test/桌面应用/b3-fixed-baseline-pathb.test.ts` 为 T3 B3 批次新建的桌面测试（创建提交 `d60d02c`），此前只有 owner `docs/change` 记录，未补边界登记；
   - `test/测试/fixed-path-full-chain.test.ts` 为 T3 B5 批次新建的跨层全链测试（创建提交 `e28923c`），位于 `test/测试/`（测试角色目录级写区）；B29 按派发单修改该文件，但桌面窗口 Section 1 从未列该路径。
2. **运行时核心**的 Section 1 只列 `src/provider/runtime/*` 三个单文件与 `test/runtime-core/` 目录，不含 trunk Provider 单文件或 `test/编排/` 逐文件条目：
   - `src/provider/trunk/impl/git-command.ts` 与 `test/编排/git-command.test.ts` 在 Git 角色整合检查点（`e71501c`）建立，`test/编排/readonly-git-transport.test.ts` 在会话准入/只读 Git 批次（`2ca434a`）建立，均未按逐文件登记；
   - B30 按派发单修改上述三个文件，owner 记录的候选清单已逐文件载明。
3. 结论：5 个文件属 **B 批（T3 两条固定工作流路径）新增/扩展的测试与实现文件**，在既有白名单建立之后产生；本 Delta 是记录式补齐，不是重新授权或扩大写区。

## 四、写区不相交核对（桌面窗口 vs 运行时核心）

- 桌面窗口新增集 A = {`test/桌面应用/b3-fixed-baseline-pathb.test.ts`、`test/测试/fixed-path-full-chain.test.ts`}。
- 运行时核心新增集 B = {`src/provider/trunk/impl/git-command.ts`、`test/编排/git-command.test.ts`、`test/编排/readonly-git-transport.test.ts`}。
- **A ∩ B = ∅**；A 与 B 之间不存在同路径、文件/目录包含或目录重叠 ⇒ **两角色新增写区不相交**。
- 角色内核对：两个角色卡的 md 表与 yaml `entries` 逐条对应（以产品解析器 `parseBoundarySection1` / `parseBoundaryYamlDoc` 核验：桌面窗口 87 条 = 87 条、运行时核心 24 条 = 24 条；条目身份 root/kind/path 逐条相同，无重复条目；新增 5 条 purpose 在 md/yaml 逐字一致）。既有旧条目的 purpose 文案差异为历史遗留，未在本 Delta 处理。
- **如实披露**：5 个文件中 4 个同时落在其他现役角色的目录级授权内——`src/provider/trunk/`、`test/编排/` 属「编排」角色目录条目；`test/测试/` 属「测试」角色目录条目。本 Delta **不改其它角色卡、不改变其授权范围**；该重叠事实在此登记，若治理上要求单一属主，需另立 Governance 变更处理（不在本任务写集）。

## 五、未改代码声明

- 本任务**未改任何源码、测试、脚本、配置或 i18n**；未改「桌面窗口」「运行时核心」以外的任何角色卡/边界；未改任何既有边界条目（纯追加 26 行：桌面窗口 md +4、yaml +7；运行时核心 md +5、yaml +10）。
- 未 commit / 未 push / 未合并 main / 未打 tag；未运行 Electron、未占用 CDP 9224；未运行产品测试（纯记录 Delta，行为不变）。

## 六、验证（2026-11-11，本工作树）

- 边界解析一致性：`node --experimental-strip-types` 载入产品解析器（`src/common/门禁引擎/boundary-yaml.ts`、`boundary-parse.ts`）核验——桌面窗口 yaml 87 / md 87、运行时核心 yaml 24 / md 24，条目身份逐条相同，新增 5 条 purpose 在 md/yaml 逐字一致，重复条目 0。
- `git diff --stat`：仅上述 4 个边界文件被修改，`4 files changed, 26 insertions(+)`，0 删除。
- 变更后文件 SHA-256（raw）：
  - `角色卡/桌面窗口/boundary.md`：`50c71a892328ab5c7f0892cb9d3fc57fde2e339fd3e03a83d39f70524b867421`
  - `角色卡/桌面窗口/boundary.yaml`：`7ac788a3579dc97de0e112a847183e8fe729896fddc788d7718fb82e70976a00`
  - `角色卡/运行时核心/boundary.md`：`082bede491d5120bef84e53e4314d6cda8dd2be0115bda35970b0aac84f69a0e`
  - `角色卡/运行时核心/boundary.yaml`：`185f225e12db2384b5049f0657086bcd16ce2ac164b02ed924a27f0a39ebb8ff`
