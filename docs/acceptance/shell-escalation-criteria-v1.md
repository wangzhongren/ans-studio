# 验收完成标准：shell 判拒后的客户确认通道 + 例行命令白名单扩容 + 回执/开关粒度（T3）——实施前标准 v1

- 风险档位：**T3（治理/权限/审批语义变更）**。本变更改变 shell 审批链在被判拒后的客户升级口径、改判拒回执与「替我审批」的开关粒度，并扩大确定性放行的执行面（例行命令不再经判断 agent 脚本内容审查）；跨门禁引擎/编排/Pipeline/运行时核心/桌面窗口/桌面UI/共享 i18n。不压成 T0–T2；升档不降档。
- 判定依据：客户闸门 0/1/2 记录 `docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`；客户在闸门 1 确认的方案 **v1.3** `docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`（857 行；SHA-256 `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`）的 §4–§7（行为与契约）、§8.1–§8.3（安全与确认点）、§9（不变量）、§10 P1–P12/G1–G5、§11 O1–O12、§12（写集）、§13.2（回滚）、§15 Q1–Q14；闸门 2 确认的团队计划 `docs/scheduling/2026-10-31_team-plan_shell-deny-customer-escalation.md`（575 行；SHA-256 `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203`）§六（证据要求）、§七（验收安排）、§1.2、§2.2、§4、§5、§8、§9。本文件的 AC 不得弱于方案 §10；团队计划只作范围、写集、阶段、证据口径依据，不是标准来源。
- 选定检查：受影响角色层测试（门禁引擎、编排、运行时核心、桌面窗口、桌面UI、项目管理）+ 跨层集成（registry + 运行时工具 + 桌面 presenter 替身 + 审计 sink）+ **T3 全量适用回归**（`node --test --test-concurrency=1`，按基线分类既有环境失败；排除历史 `write-sequencing.test.ts` 须记录理由）+ `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` + **真实 Electron E2E**（含开关开/关、暂停、升级三选项、超时、窗口重开/重启、白名单 0 judge、审计 JSONL）+ 按 2026-10-27 客户规则的**真实应用截图**（关闭 DEBUG 覆盖层、记 sha256/候选版本/拍摄命令/窗口尺寸；最多截图、不得要求或提供录屏）。
- 复用证据：仅同一候选、同一输入/依赖、同一命令、同一配置/夹具的证据可复用；候选、输入、依赖、契约、夹具或配置变化时，受影响证据失效，只补失效部分；不得跨候选复用，也不得用其它变更（含 i18n/目录授权等）的证据替本变更背书。
- 全量回归：**T3 要求执行**（见 §六）。报告首行必须写「已执行（命令/范围/输出）」或按团队计划认可的等价口径；不得以受影响检查替代全量回归，也不得因耗时降档。
- 任务 ID / flowId：`2026-10-31-shell-deny-customer-escalation` / `shell-deny-customer-escalation`。
- 标准路径 / 版本 / 日期：`docs/acceptance/shell-escalation-criteria-v1.md` / **v1** / **2026-10-31**（实施前冻结）。
- 阶段与状态：**实施前完成标准**。本文件只建立标准，不判定候选；截至写盘**未实施、未测试、未验收**，不声称任何能力已具备。
- 验收报告：**另写 `docs/acceptance/shell-escalation-report-v1.md`，本文件不是报告**。报告由独立验收在实施后按本标准与统筹变更包判定，结论只能是通过/返工/证据不足。
- 适用变更：仅本任务（shell 判拒客户确认通道 + 白名单扩容 + 回执/开关粒度）。发布（新小版本）是本任务验收通过后另行授权与执行的独立事实（团队计划 §八），不在本文件判定范围。

---

## 一、基线、版本冻结与范围

### 1.1 客户确认链与冻结版本

| 项 | 状态 | 记录与版本 |
| --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-10-31） | `docs/communication/2026-10-31_intent_shell-deny-customer-escalation.md`「客户原话」：客户指定「把这个方案立为下一轮改进（走闸门 0/1）」 |
| 闸门 1：方案确认 | 已确认（2026-10-31） | 同一文件「闸门 1 记录（2026-10-31）」：客户原话「确认闸门 1 方案 v1.3（857 行 / 6bd12a99）作为实施基线」；方案 v1.3 冻结哈希 `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de` |
| 闸门 2：角色指派/写集/边界/档位/顺序/验收安排/证据口径/发布口径 | 已确认（2026-10-31） | 同一文件「闸门 2 记录（2026-10-31）」：客户原话「确认闸门 2：参与角色、写集与 3 项边界变更」；团队计划 575 行 / `4d52bdf4…` 冻结 |
| 客户实施授权 | **未给**（截至本文件写盘） | 闸门 2 记录明确「实施授权：待客户另行给出（闸门 2 与实施授权分开）」；本文件不构成实施授权 |
| 本验收标准 | 实施前写盘并冻结 | 本文件 v1（2026-10-31） |

本文件的验收基线是客户在闸门 1 确认的**方案 v1.3 内容**与闸门 0 的意图；闸门 2 确认的团队计划只作范围、写集、阶段安排、证据口径依据。方案与团队计划文件头的历史状态字样（写于确认之前）不作为判定依据，以 `docs/communication/` 的确认记录与冻结哈希为准（见 §九.1/§九.2）。

### 1.2 版本冻结与变更规则

- 本文件在实施开始前冻结为 v1；实施开始后，不得为迁就候选而改写标准、放宽或加严实质。
- 确需变更标准（客户改变范围、方案实质变更、发现标准本身不可执行/自相矛盾）时：递增版本（v2…）、记录理由与受影响条目、交沟通/统筹确认，并重新核对受影响证据；未确认前仍按 v1 判定。
- 候选变化不改变标准；只使该候选上的证据失效，需按本文件重取。
- 本文件不是验收结论，也不是实施授权；任何通过/返工/证据不足结论只写在 `docs/acceptance/shell-escalation-report-v1.md`。
- 方案实质变更（例如放宽硬拒、任意 `npm run <script>` 放行、改变 `npm ci` 分档、扩大升级入口、接入「替我决策」、改暂停影响面）按方案 §13.3 重开闸门 1/2，本文件随之重判；不自行放行。

### 1.3 本轮范围（仅列判定边界，不重复方案正文）

本文件判定覆盖（对应方案 §2.3 与闸门 0 三层意图）：

1. **判拒后的客户确认通道（核心）**：申请资格（judge 主动 deny 非 c=deny 档 / `manual/retry-capped`）、三选项（`allow-once`/`allow-session`/`deny`）、无答复默认拒绝、每命令每会话一次、申请上限与去重、卡片仲裁、授权作用域与消费、脚本上下文时效、审计区分、回执措辞。
2. **确定性白名单扩容**：`matchRoutineShellCommand` 唯一谓词；`npm test`、固定脚本名 `npm run test|typecheck|lint|check`、受限路径 `node --test`、`tsc --noEmit`、`npm ci` 在所有角色（含内置治理角色）走 (c) 级确定性放行（0 卡、0 judge）；`npm install` 保留判断与判拒后申请；写目标守卫协同；委托策略只保留原三 id。
3. **回执与开关粒度**：判拒回执「可申请客户确认 + 关闭开关兜底」；「本次运行暂停自动审批」shell-only、应用运行期、跨窗口重开保留、重启清零、不写偏好、不影响治理 approval 组；入口在判拒结果行 + 升级卡页脚。
4. **安全与不变量**：无答复拒绝、硬地板不可翻案、单一判定实现、客户手批与 judge 放行审计可区分、开关关闭路径逐字不变、暂停语义、i18n 中英成对、回滚开关语义、升卡仲裁与不丢/不重放。
5. **证据与回归**：T3 全量回归、真实 Electron E2E、真实截图、审计 JSONL、候选哈希与 diff/status。

**明确不判定为本轮缺陷的边界**（依据闸门 1/2 已确认版本，不是放宽）：

- **O1–O12 全部默认不实施**：允许一次 TTL（O1）、其它 `manual` reasonCode 覆盖（O2）、按项目/角色暂停（O3）、更保守白名单（O4）、聊天内卡（O5）、结果行「转人工确认」按钮（O6）、任意 `npm run <script>`（O7）、规则集数据开关（O8）、升级决定系统行（O9）、撤销「本会话允许」（O10）、后台入口扩展（O11）、脚本变化后重新申请（O12）。未实现这些不判 fail；若实施了任一未确认 O 项，属范围外改动（AC-31）。
- **Q1–Q14 按推荐值执行**（闸门 1 客户确认）：固定脚本名（任意 `npm run <script>` 不放行）、`npm ci` 确定性放行（含生命周期脚本风险已接受）、只 `tsc --noEmit`、暂停作用域为「本次应用运行」、限额 5/1、复用既有 shell 确认卡并接受「升级卡排他、审批卡等待」仲裁、升级入口仅 `run_shell`、自定义规则集被代码级白名单覆盖（已接受）、脚本上下文变化后授权作废且本会话不可再申请。
- **其它 `manual` reasonCode 的判拒不可申请（v1）**：`timeout`/`unavailable`/`parse-failed`/`budget`/`read-denied`/`read-truncated`/`context-too-large`/`context-missing`/`model-manual`/`aborted`/`queue-*`/`row-failed`；不是缺陷。
- **后台入口不开放**：`start_background_task` 判拒不写入可申请台账、不可申请、不消费 `run_shell` 授权（O11 后续）。
- **发布口径**：按方案建议与闸门 2 确认，作为**新小版本**发布，不用 overlay；本任务不写 `package.json`/构建配置/发布配方/`src/common/装配/release-policy.mjs`，发布另行授权与执行（团队计划 §八）。方案 P12 的「发布 overlay 逐文件列名」子项在**本任务**为 N/A（依据：新小版本路线；若发布口径改为 overlay，则该子项适用并按方案 §12 逐文件补证）。
- **真实 E2E 多引擎覆盖边界**（团队计划 §10.2 第 5 项）：至少覆盖默认/一个真实引擎；其余引擎以共享通道测试 + 审计样例覆盖，缺口如实写入证据与验收报告，不静默省略、也不因此判 fail；但 P1/P8 的真实应用证据不能全部以共享通道测试替代。
- **卡片仲裁等待上限的具体数值**：方案要求「建议复用确认超时」并保证 fail-closed；具体值由实现确定并在变更包声明（团队计划 §10.2 第 2 项），验收按语义判定，不按具体数值判定（见 §九.6）。
- **新增 UI 视图测试命名、`recovery-channel.ts` 是否实际改动**：由实现在完成报告/变更包声明（团队计划 §10.2 第 3/4 项）；验收按行为与回归证据判定，不按文件名判定（见 §九.9）。

### 1.4 写标准时的只读基线与输入哈希

| 检查 | 命令 | 结果（2026-10-31 写标准时实测） |
| --- | --- | --- |
| 分支 / HEAD | `git rev-parse HEAD` | `feat/flow-improvements-wave1` / `9f670fb2c7d403baf995071055d697c50714c905`（已含 main `32d8f0d` / v1.8.3） |
| 工作树 | `git status --short` | 仅 `M docs/scheduling/memo.md` 与 4 个未跟踪管理文档（communication/planning/review/team-plan）；**无产品代码/测试改动** |
| 暂存区 | `git diff --cached --name-only` | 空（未暂存） |
| 方案 v1.3 | `sha256sum` / `git hash-object` / `wc -l` | `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de` / `e6d29d9df8e965fd5b59863369a36d5d07fe3573` / 857 行 |
| 团队计划 | 同上 | `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203` / `b14b42b856fffc93e9287149eb60ca601181ec95` / 575 行 |
| 复核记录 | 同上 | `617d9a7f84599ade1837934a5fb86ee93e95cf13dfca2d37911bc11e0de9c586` / `2774a9ff443013ed644987dc9da872ce630a5de3` / 148 行 |
| 沟通记录（当前） | 同上 | `0154eeb0302537662a3e2b8a27223df3dbb418fd1d0e7ee48b3bbff0978e73db` / `70310f014ad2548e6607c535358c448d7933a633` / **65 行**（含闸门 0/1/2 记录） |
| 沟通记录（历史快照，仅引用，不混用） | 方案/团队计划文件头引用 | 49 行 / `74e0596cc757dd773b197e6acf4f572988f4b0a87c31c4b2a60f480bfff06b1d`（闸门 1 前）；57 行 / `51c1a9677cc0d5d8a1fd6d668e44d370556433e5e87ede0be4a8007ac0f57cfc`（团队计划写盘时，闸门 2 前） |
| Node / npm | `node --version` / `npm --version` | `v24.22.1` / `11.19.1`（当前 shell 可用；实施/取证仍须记录实测版本） |
| 既有 i18n 计数 | `test/项目管理/shared/i18n.test.ts` | 钉死 `ui 886 / main 550 / shared 62 / preferences 3 = 1501`（候选新增 key 必须显式更新） |
| 既有审计形状 | `src/common/编排/shell-audit.ts` | `ShellAuditRecord` 必填 `timestamp/toolCallId/command/argv/cwd/conclusion/branch/by/conditions/execution`；可选 `judge`（当前无 `customerGrant`/`event`/`escalation` 字段，待实施加法） |
| 既有分支形状 | `src/common/编排/shell-gate.ts` | `c-allow`、`c-deny`、`b-allow`、`a-allow`、`b-unsure→a-allow` 等升级链；`by` 形如 `operator:<id>` / `judge:<engine>`（与方案 §7.1 区分口径一致） |

以上只读核对用于确认基线与约束；本文件写盘未改方案、计划、沟通记录、角色卡、产品源码或测试，也未启动应用。

**写标准期间观察到的并发变化（非本验收写入）**：`git status` 显示 `角色卡/桌面窗口/boundary.md`、`boundary.yaml`、`changelog.md`，`角色卡/编排/boundary.md`、`changelog.md`，`角色卡/门禁引擎/boundary.md`、`changelog.md` 被修改，内容与闸门 2 确认的 H1 三项边界条目（B-1 `src/service/gate/shell-rules.ts`、B-2 `src/pipeline/orchestration/shell-arming.ts`、B-3 `test/桌面应用/shell-escalation.test.ts`）及 changelog 记录一致。这些是人事按闸门 2 执行的授权治理变更，**不是本验收写入**，也不纳入本任务产品候选；B0 基线应以其为既有状态记录。`docs/scheduling/memo.md` 的修改为统筹续接记录，同样不纳入候选。

### 1.5 本文件不产生的授权

本文件不授权提交、推送、合并、发布，不授权派发 worker，不授权修改写集、边界或档位，不授权启动应用做「已验收」声明。实施仍按闸门 2 确认的写集与团队计划阶段执行。

---

## 二、判定口径与证据规则

### 2.1 四种判断与报告表

每条验收项（AC）只能判：

| 判断 | 含义 |
| --- | --- |
| `pass` | 当前候选满足该条标准，证据为该候选的原始、可复算证据 |
| `fail` | 已有证据表明不满足标准，或证据显示以弱化断言/超范围改动/绕过标准达到表面通过 |
| `insufficient evidence` | 缺少必要证据、证据属于另一候选/另一输入、无法复算、只给摘要、只凭自述，或关键结论无法成立 |
| `not applicable` | 该条对本轮范围不适用；必须写明依据（如 O1–O12 未实施、overlay 路线未采用） |

验收报告 `docs/acceptance/shell-escalation-report-v1.md` 的核心是逐项验收表，列至少为：

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-01–AC-35 | 对应本文件条目与方案 §10 P1–P12/G1–G5 | 本文件要求的最低证据 | 原始输出/截图/JSONL/哈希路径 | `git hash-object` + `sha256sum` | 门禁引擎/编排/运行时核心/桌面窗口/桌面UI/项目管理/测试/统筹 | 实际观察摘要 | pass/fail/insufficient evidence/not applicable |

### 2.2 行为证据原则（不得以「字段齐全」代替实际行为）

- 文件存在、字段名齐全、测试文件存在、key 数量对，**只是必要条件，不是通过依据**。每条必须观察实际行为：分类结果、judge 是否被调用、卡片是否出现、三选项回包后的实际执行/拒绝、暂停后请求走向、重启/窗口重开后的状态、审计 JSONL 实际字段、真实渲染截图。
- 开发者自述、测试角色转述、工具「成功」、计划文字、截图缩略图、摘要，都不算原始证据；验收读取原始命令输出、文件哈希、diff/status、E2E 日志/截图、审计 JSONL。
- 不得用「只跑了单测」代替跨层集成；不得用「代码看起来已调用」代替实际行为；不得用「只测了一个入口」代替 `run_shell` / `start_background_task` 双向负例。
- 不得修改断言以保绿；不得跳过失败用例或把 `skip`/`todo` 计为通过；不得把失败归为「环境问题」而不做基线对照与分类。
- **客户可见面（P1/P7/P8）必须由当前候选真实运行的截图/记录佐证**；单测只能作辅助，不能替代真实运行截图（详见 §2.3）。

### 2.3 「证据不足」判定口径（不弱化）

出现下列任一情形，对应 AC 判 `insufficient evidence`，不得判 `pass`：

1. 缺少该 AC「最低证据」中的任何一项原始输出/文件（只给摘要、转述、截图缩略图、口头自述）。
2. 证据与候选不匹配：文件哈希/diff 无法复算，或证据来自另一候选、另一 HEAD、另一输入/夹具；变更包候选哈希与工作区不一致。
3. 该 AC 明确要求真实 Electron/真实运行/审计 JSONL，而只提供了单元测试或模拟输出（例如 AC-04/AC-19/AC-21/AC-28 以单测替代真实截图；AC-22 以单测替代 JSONL 样例）。
4. 截图缺少候选版本、sha256、拍摄命令/窗口尺寸，或未关闭 DEBUG 覆盖层，或不是当前候选真实运行。**缺少录屏不构成 fail 或 insufficient evidence**（不得要求或提供录屏）。
5. 真实 Electron 因环境不可用无法执行，且没有该 AC 允许的等价证据；记录环境边界仍不能判 pass。
6. 审计样例缺失/不完整（例如只有 judge 放行记录，没有拒绝/超时/升级决定记录），或审计缺失被当作判定正确。
7. 基线（B0）未记录或失败未分类，导致无法区分既有环境失败与本次新增失败。
8. 只覆盖 AC 的部分路径/角色/档位（如只测 script 路径、只测项目角色、只测默认引擎而无缺口记录），且未说明缺口。
9. T3 全量回归未执行或只执行部分套件，或新增 skip 无理由。
10. 证据自相矛盾或无法复现（同一命令/夹具两次结果不一致且未定位）。
11. 以「代码阅读」代替本应执行的检查（例如声称授权顺序正确但无五路径测试输出）。
12. `not applicable` 未写明依据。
13. 消费者重测缺失（`src/model/runtime.ts`、门禁引擎、编排、shared i18n 实际消费方未按 T3 重测）。
14. 使用其他变更（i18n/目录授权/发布）的通过结论或证据为本变更背书。
15. 实现/测试自评即验收结论，或实施角色自写验收报告。

**不得放宽的具体禁令**：不以时间紧降档；不以单测替代真实运行截图；不以「工具成功」「全部通过」摘要替代原始输出；不把 `skip`/`todo` 计为 pass；不因缺少录屏扣分。

### 2.4 截图与真实运行证据规则

- **最多截图，不得要求或提供录屏/屏幕录像作为验收要求或选项**；缺少录屏不构成 `fail` 或 `insufficient evidence`。
- 截图必须来自**当前候选的真实运行**（真实 Electron、临时 userData、真实 build），**关闭 DEBUG 覆盖层**，并记录：截图 SHA-256、候选版本/候选哈希、拍摄命令/复现步骤、窗口尺寸（必要时 zoom）。
- 截图覆盖至少：升级卡（命令原文/argv/cwd/judge 理由/替代方案/必要性与不可信标注/客户手批声明/三选项）、judge 判拒结果行的暂停按钮、升级卡页脚的暂停动作、暂停徽标与恢复、白名单命令 0 卡（可与审计/日志配合）、开关关闭时的既有客户确认卡（对照）。
- 日志、校验输出、审计 JSONL、哈希可作辅助证据；截图与日志必须绑定同一候选。

### 2.5 T3 与全量回归

- 按 `references/testing.md` 的唯一定义，本变更 T3：受影响角色层测试 + 跨角色集成 + **全量适用回归** + 真实 Electron E2E + 真实截图。
- 全量回归命令与口径见 §六；报告必须记录命令、环境、计数（pass/fail/skip/todo）、失败原文与基线分类。
- 全量回归仅在 T3 或证据不足时要求；本任务为 T3，不适用「T2 不全量」豁免。升档不降档。

### 2.6 无 task_ops

本项目没有 `.ans/project.json` 任务配置，未启用 task_ops（团队计划 §1.4/§九.7）。取证以文件哈希、原始命令输出、diff/status、跨层集成输出、真实 Electron 截图、审计 JSONL 为准；**不得伪造任务令牌、锁、审批、机器预检或 `docs/verification/` 记录**。

### 2.7 候选隔离与管理记录

- 本变更候选只列相对 B0 基线变化的 `app/`、`src/`、`test/` 路径（按闸门 2 确认的写集/边界条目）；管理记录（`docs/planning/`、`docs/scheduling/`、`docs/communication/`、`docs/acceptance/`）与角色卡 `docs/change/` 证据目录不混入产品候选。
- 候选隔离：实施前若出现并发写同一文件（团队计划 §九.12），按候选不可复算处理；不得把他人改动算入本候选，也不得用混入候选的证据判 pass。
- `app/renderer/dist/` 为忽略产物、非候选（团队计划 §九.7）。

---

## 三、验收项（AC）

### 3.0 总表

| AC | 覆盖方案标准 | 主题 | 最低证据 | 产出角色 |
| --- | --- | --- | --- | --- |
| AC-01 | P1（P2 交叉） | 判拒后申请通道的触发与入口资格 | `shell-escalation` 资格矩阵单测、`onReviewed` 记录测试、工具注册测试、diff | 编排、运行时核心 |
| AC-02 | P2（P10 交叉） | 不可申请档矩阵与硬地板 | 五路径授权顺序单测、资格矩阵、readonly 守卫、桌面通道测试、diff | 编排、桌面窗口、门禁引擎 |
| AC-03 | P1、G3 | 申请工具与精确命令匹配 | runtime-core 工具测试、schema、registry 闭包、拒绝回执、diff | 运行时核心、编排 |
| AC-04 | P1、P10 | 升级卡内容与三选项 | presenter/渲染测试、真实截图、payload 形状、必要性超限测试 | 桌面窗口、桌面UI |
| AC-05 | P1、G3 | 客户决定、回执与授权创建 | 桌面核心测试、replay 测试、真实回执截图/记录、diff | 桌面窗口、编排 |
| AC-06 | P1、P10、G1 | 无答复/通道不可用/挂起卡默认拒绝 | 假时钟测试、桌面通道测试、真实超时（可用短超时环境变量）、日志 | 桌面窗口、编排 |
| AC-07 | P3、P10 | 授权作用域、消费与脚本时效 | once/session/键/stale/c=allow 不消费/会话重建单测、真实两次调用、diff | 编排、桌面窗口 |
| AC-08 | P4 | 每命令每会话一次、限流与旧记录清理 | 状态机/矩阵单测、5/1 限流、旧记录清理、跨角色 pending | 编排 |
| AC-09 | P4、G1 | 升级卡与审批卡的仲裁 | 桌面测试、渲染测试、四组时序、真实应用（可行时）、diff | 桌面窗口、桌面UI |
| AC-10 | G1、P5 交叉 | 不丢、不重放与决定审计 | 单测、replay/窗口关闭测试、JSONL 样例 | 编排、桌面窗口 |
| AC-11 | P10、G2 交叉 | judge 不参与升级、onReviewed 只读 | spy/行为测试、无 judge 调用、无「替我决策」读取、diff | 编排、桌面窗口 |
| AC-12 | P7、P10 | 单一谓词与两处消费 | diff、同引用再导出测试、rg 无第二实现、单测 | 门禁引擎、编排 |
| AC-13 | P7 | 白名单命中形态 → c-allow、0 卡、0 judge | 分类器/写守卫/委托单测、judge 调用计数、真实运行 | 门禁引擎、测试 |
| AC-14 | P7 | 非命中形态与 fail-closed | 负例矩阵单测、gate 测试、diff | 门禁引擎、编排 |
| AC-15 | P7、P11 | 委托策略只保留原三 id | 委托策略测试、既有断言变更逐条列明、原始输出 | 门禁引擎、编排 |
| AC-16 | P7、P10 | 自定义规则集与硬拒优先 | 规则集注入测试、gate 测试、diff | 门禁引擎 |
| AC-17 | P6 | 开关关闭路径逐字不变 | `operator-channel` 既有测试全过 + 新回归、真实截图、diff | 桌面窗口、编排 |
| AC-18 | P6、P1 | 开关开启时 manual 仍拒绝、retry-capped 可申请 | operator-channel/desktop 测试、资格测试、真实应用 | 桌面窗口、编排 |
| AC-19 | P8、P9 | 回执措辞 | zh/en 断言、桌面测试、真实截图/记录 | 编排、桌面窗口、项目管理 |
| AC-20 | P8、G4 | 暂停语义与持久化隔离 | interface/desktop 测试、真实窗口重开/重启/治理组、偏好文件不动、截图 | 桌面窗口、桌面UI |
| AC-21 | P8 | 暂停入口与 UI 状态 | 渲染测试、真实截图（行按钮/页脚/徽标/恢复）、i18n | 桌面UI |
| AC-22 | P5 | 审计三类可区分与 escalation-decision 完整 | 当前候选 JSONL 样例、单测、grep/哈希、diff | 编排、测试 |
| AC-23 | P5 | 审计共享 sink 与不丢记录 | diff、fake sink 测试、真实 JSONL、回调测试 | 编排 |
| AC-24 | P9 | i18n 中英成对、计数与零泄漏 | `i18n.test.ts` 原始输出、key diff、渲染消费测试 | 项目管理、桌面UI |
| AC-25 | P11、G2 | 受影响套件与断言不弱化 | 各角色原始输出、`git diff -U0`、B0 基线、失败分类 | 各实施角色、测试 |
| AC-26 | P11 | 跨层集成 | `test/测试/` 集成原始输出、test diff | 测试 |
| AC-27 | P11 | T3 全量回归与失败分类 | 全量原始输出、B0、消费者重测清单与结果 | 测试 |
| AC-28 | P1、P5、P7、P8、P11 | 真实 Electron E2E 与截图证据 | 场景矩阵证据、截图+元数据、E2E 日志、审计样例 | 测试、桌面窗口、桌面UI |
| AC-29 | P11 | typecheck 与构建 | 三条命令原始输出/退出码 | 各角色、测试 |
| AC-30 | 方案 §13.2；团队计划 §九.9 | 回滚开关语义 | 环境开关测试、diff、行为声明 | 编排、运行时核心 |
| AC-31 | P12 | 无越权改动与发布边界 | diff/枚举、package/build/release-policy 零改动、边界三项对比 | 统筹、测试、人事 |
| AC-32 | G3 | 权限不扩张 | diff、对抗注入测试、单测 | 运行时核心、编排、桌面窗口 |
| AC-33 | G2 | judge 既有行为不回归 | 既有 judge 套件原始输出、diff | 编排、测试 |
| AC-34 | G4 | 开关持久化不回归 | interface/preferences 测试、偏好文件不动 | 桌面窗口、测试 |
| AC-35 | G5 | 文档状态与基线可追溯 | 文档链接/哈希、状态行、变更包、diff/status | 统筹、独立验收 |

### 3.1 AC-01 判拒后申请通道的触发与入口资格（覆盖 P1；与 P2 交叉）

**标准（可核对语句）**

- 仅当本次 `run_shell` 审核的最终结果为下列之一，应用才记录「可申请判拒记录」并允许同角色会话对该精确命令申请：① judge 主动 `deny`（`judge.verdict === "deny"`，非 `manualAsDeny`；含 `review`/`risky`/`script` 档被判拒，且 branch 不以 `c-deny` 开头）；② `manual` 且 `reasonCode === "retry-capped"`（`manualAsDeny === true`）。
- 申请由角色显式调用 `request_shell_escalation` 发起；判拒本身仍**不自动弹卡、不自动打扰客户**（2026-10-19 裁定保留）。
- 申请资格只读已记录的审核结果（branch、`judge`、`reasonCode`、`tier`、`entry`），**不重新执行风险评估、不调用 judge**。
- 仅 `run_shell` 入口可申请；`start_background_task` 判拒**不进入**可申请台账、不写入/清除 `run_shell` 记录、不消费 `run_shell` 授权。
- 申请匹配键为 `(roleId, projectRoot, cwd, entry, 规范化 argv)`；`roleId` 由每会话 registry 闭包绑定；`cwd` 固定为会话项目根；`argv` 由工具侧 `splitCommand` 生成，模型不提供 argv。
- 其它 `manual` reasonCode（`timeout`/`unavailable`/`parse-failed`/`budget`/`read-denied`/`read-truncated`/`context-too-large`/`context-missing`/`model-manual`/`aborted`/`queue-*`/`row-failed`）在 v1 不可申请。

**判定方法**

1. 逐档构造审核结果（judge deny review/risky/script；manual/retry-capped；其它 manual；judge allow；客户手拒；b-deny；row-failed；background），断言可申请台账写入/不写入与原因。
2. 对可申请记录调用工具：断言弹卡路径；对不可申请/不匹配/后台记录：断言工具拒绝且不弹卡、不调用 judge。
3. 检查 `onReviewed` 调用处的记录内容（command 逐字、argv、cwd、entry、judge 审计、approvalContext 如适用）与键组成。
4. 检查资格判定实现只读已记录结果，无第二份风险判定/重新调用 judge（diff + rg）。
5. 负例：改写参数/路径/大小写后申请，断言不匹配；跨角色/项目申请，断言拒绝。

**最低证据**

- `test/编排/shell-escalation.test.ts`（资格矩阵）原始输出（命令、退出码、计数、失败原文）。
- `test/编排/shell-gate.test.ts`/`shell-operator-only.test.ts` 中 `onReviewed` 记录测试输出。
- `test/runtime-core/` 工具注册/不注册测试输出（与 AC-03 共用）。
- 相关 diff（`shell-escalation.ts`、`shell-gate.ts`、`run-role.ts`、`tools.ts`）与候选哈希。
- 失败分类（相对 B0）。

**失败示例/反例（任一即 fail）**

- 任意命令（未被判拒/不匹配）可申请；`manual/timeout` 可申请；后台启动判拒可申请或写入/清除前台记录。
- 判拒即自动弹卡（绕过角色显式申请）。
- 资格判断重新调用 judge 或重新做风险判定；模型提供 argv 被接受；跨会话/跨角色申请成功。

### 3.2 AC-02 不可申请档矩阵与硬地板不可翻案（覆盖 P2；与 P10 交叉）

**标准（可核对语句）**

- 以下一律不可申请：`c=deny` 硬拒（含内置治理角色审批档 `tier === "deny"` 的 judge 判拒；advisory 非 script 下 branch 以 `c-deny` 开头的 `c-deny→a-*`；**script 路径 c=deny 在所有装配模式下终结**）；确定性前置封堵 `preblock:inline-too-large`/`preblock:unbounded-search`；`write-guard:deny`（含版本化文档只读、写区外目标）；`script:context-unavailable`/`approvalContext.failClosed`；只读档 `readonly-deny`/`script:readonly-deny`；非 judge 拒绝（客户开关关闭手拒、pm `b-deny`、其它 `manual`）；`row-failed`；`start_background_task` 判拒。
- 上述情况下工具拒绝、不弹卡、不调用 judge/客户；不写可申请台账。
- **任何授权（含伪造/陈旧授权）不能越过 preblock/write-guard/c=deny**：script 路径 c=deny 在所有装配模式终结；非 script advisory 下 `detail.decision === "deny"` 时授权一律不消费、不放行（现状 `c-deny→a-*` 保留，本方案不新增 c=deny 终结）。
- 只读档（`readonlyOnly`）不得注入/调用 `takeGrant`（构造期守卫或调用点跳过）；陈旧授权不得越过只读拒绝。
- 五路径（script / advisory / operatorOnly / 三层链 / readonly）至少各有一条「注入匹配 grant 仍拒绝」负例。

**判定方法**

1. 资格矩阵覆盖每个不可申请档，断言工具拒绝、无卡、无 judge/客户调用。
2. 在 `shell-gate` 五条装配路径注入匹配 `takeGrant` 的 grant，断言：preblock/write-guard/c=deny 处仍拒绝且授权不被消费；advisory 非 script 的 `detail.decision === "deny"` 不消费/不放行；readonly 档构造期或调用点不接触 `takeGrant`。
3. 检查 `assembleReadonlyShellGate`/`readonlyOnly` 守卫实现（构造期抛错或调用点跳过）与测试。
4. 检查不可申请记录不写入台账（工具回执如实）。
5. 交叉核对 AC-07：被拒调用后授权仍保留（未消费）或按 `stale` 作废的语义与方案一致。

**最低证据**

- `test/编排/shell-gate.test.ts`/`shell-escalation.test.ts`/`shell-readonly.test.ts` 的五路径授权顺序与负例原始输出。
- 资格矩阵完整表（可申请/不可申请逐项）与输出。
- `test/桌面应用/operator-channel.test.ts`/`shell-escalation.test.ts` 中后台入口与非 judge 拒绝测试输出。
- `readonlyOnly` 守卫的 diff 与测试输出。
- 候选哈希与失败分类。

**失败示例/反例（任一即 fail）**

- 任一不可申请档出现升级卡；`c=deny`/封堵/写守卫拒绝被授权放行；`manual/timeout` 被当作可申请；后台启动判拒可申请；readonly 档被授权放行；陈旧授权越过 `readonly-deny`。

### 3.3 AC-03 申请工具与精确命令匹配（覆盖 P1、G3）

**标准（可核对语句）**

- 工具 `request_shell_escalation` **只在注入 `shellEscalation` 且 shell 已 arm 时注册**；未注入/未 arm 不注册（能力缺席）。
- 入参为 `{ command, necessity? }`（schema 不含 argv、不含任何授权字段）；处理器用自身 `splitCommand` 拆分命令并把 argv 交给 registry，**不做第二份拆分实现**，模型不能提供 argv。
- 工具**只发起申请**：不写盘、不执行命令、不创建/消费授权（授权只由应用在卡回包后创建）。
- 精确匹配失败/不可申请/本会话已申请/会话超限/有 pending → 拒绝并如实回执，不弹卡、不调用 judge/客户。
- 会话总上限默认 **5 次/角色会话**；同一角色会话同时最多 **1 张**待答申请；同一窗口同时最多 **1 张**升级卡（跨角色）；已有待答时新申请直接拒绝、不排队。
- 「会话总上限」的计数口径（哪些工具调用计入 5 次）方案未写明，实施须在完成报告/变更包声明并以测试固定；标准只核对达上限后不弹卡、回执如实（见 §九.11）。

**判定方法**

1. runtime-core 测试：注入/未注入能力时的工具注册；schema 字段；argv 由 `splitCommand` 生成（spy/断言）；entry 填充。
2. registry 测试：roleId 由闭包绑定；`cwd` 固定项目根；键匹配/不匹配；跨角色/项目拒绝。
3. 拒绝回执测试：每条失败路径的 message 如实，且无卡、无 judge 调用。
4. 限流测试：5 次后拒绝；pending 时拒绝；跨角色同窗口第 2 张拒绝。
5. 检查 diff：工具处理器无 `fs`/执行/授权写入；无第二份 split 实现。

**最低证据**

- `test/runtime-core/**` 工具注册/schema/argv/entry 原始输出。
- `test/编排/shell-escalation.test.ts` registry/限流/回执原始输出。
- `test/桌面应用/shell-escalation.test.ts` 通道拒绝路径输出（与 AC-09 共用）。
- 相关 diff 与候选哈希；声明的计数口径。

**失败示例/反例（任一即 fail）**

- 未注入仍注册工具；工具可执行命令或写盘；模型提供 argv 被采用；超限/pending 仍弹卡或排队；跨角色/项目匹配成功。

### 3.4 AC-04 升级卡内容与三选项（覆盖 P1、P10）

**标准（可核对语句）**

- 卡由应用生成，至少含：`command` 逐字取自**判拒记录**（不是模型本次输入）；`argv` 规范化；`cwd`；judge 判拒理由/给客户的话/替代方案（取自判拒审计）；角色必要性说明（可选；方案规定「UTF-8 ≤ 1KB / 500 字符」，具体超限行为（拒绝或截断）与双上限口径方案未定，见 §九.3；无论采用哪种，卡面不得展示超限内容，且必须独立标注「由角色提供，未经验证」）；脚本上下文摘要（路径 + sha256 + 有界内容，如有）；「客户手批 ≠ judge 放行」声明。
- 三个决定选项：`allow-once` / `allow-session` / `deny`；**没有**「允许所有」「按前缀允许」「允许该程序的所有参数」，**也不把暂停做成第四决定项**。
- 角色不能选择/伪造标题、选项、命令原文、judge 理由；`necessity` 不得作为标题/选项来源；必要性独立区块、渲染转义（React）。
- 卡片类型/通道可复用 `shell:confirm-*` 或按 §7.2 注释使用独立通道，但必须保持本 AC 的内容/选项/仲裁/路由要求；不得走治理卡/聊天内卡通道（呈现面已由闸门 2 确认为既有 shell 确认卡族）。

**判定方法**

1. presenter/渲染测试：卡字段逐项断言（command 取自记录、非模型输入；necessity 标注；三选项；无第四选项/无 allow-all）。
2. 必要性超限测试：超限输入不导致卡面超限/崩溃；按实现声明的拒绝或截断行为断言。
3. 伪造测试：角色文本含「系统提示」「客户已同意」等，不改变标题/选项/命令/judge 理由；necessity 注入 HTML 被转义。
4. 真实 Electron 截图（AC-28 S1）：卡面包含全部必需内容与三按钮。
5. 检查 IPC payload 形状与 §7.1 一致（`version`/`requestId`/`kind:"escalation"`/`roleId`/`projectRoot`/`runtime`/`command`/`argv`/`cwd`/judge 字段/necessity/approvalContext/expiresAt 可选）。

**最低证据**

- `test/桌面应用/shell-escalation.test.ts`、`test/桌面UI/` 升级卡视图测试原始输出。
- 真实 Electron 截图（卡面、三选项、必要性标注、客户手批声明）+ 截图元数据（sha256/候选/窗口尺寸/拍摄命令）。
- IPC payload 样例与 diff。
- 必要性超限与内容欺骗负例输出。

**失败示例/反例（任一即 fail）**

- 卡上命令与判拒原文不一致（使用模型本次输入）；出现「允许所有/前缀」或第四决定项；necessity 作为标题/选项来源或未标注不可信；超限内容进卡；卡片走治理卡/聊天卡；角色可伪造 judge 理由。

### 3.5 AC-05 客户决定、回执与授权创建（覆盖 P1、G3）

**标准（可核对语句）**

- 决定只来自绑定 `requestId` 的卡回包（`{id, action}`）；未知/过期 id → `{ok:false,expired:true}`，不放行；重复回包不产生第二次授权。
- 授权只由应用在卡回包后创建；角色/judge/应用文本都不能代客户批准；工具入参不含授权字段；授权形状只由应用创建（角色不可自报）。
- 回执如实：`allow-once` 明确「仅此一次，请原样重试该命令」；`allow-session` 明确「本会话该精确命令可直接执行」；`deny`/`expired` 明确「未获客户允许；本会话不再受理同一命令的申请」。
- 客户选择后回执与实际决定一致；不得把拒绝写成已批准。

**判定方法**

1. 桌面核心/presenter 测试：三种回包的回执文本；未知/过期 id；重复回包。
2. 授权创建测试：仅回包后存在；工具/角色路径不能创建；伪造 payload 不带授权字段。
3. 真实应用（AC-28 S1/S2/S3）：allow-once 后原样重试执行一次；allow-session 反复执行；deny 后回执与不可再申请。
4. 检查 diff：grant 创建点、回执文本、id 校验。

**最低证据**

- `test/桌面应用/shell-escalation.test.ts`、`test/编排/shell-escalation.test.ts` 回执/授权创建原始输出。
- 真实应用回执截图或聊天记录（含候选哈希与操作步骤）。
- 重复回包/未知 id 测试输出；diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 拒绝回执写「已批准」；角色自报授权生效；未知/过期 id 放行；回包不带 id 仍生效。

### 3.6 AC-06 无答复、通道不可用与挂起卡默认拒绝（覆盖 P1、P10、G1）

**标准（可核对语句）**

- 升级卡超时/通道不可用/推达失败 → **默认拒绝**（`expired`/`unavailable`），消耗该命令申请权；不重试、不自动弹第二张。
- 窗口关闭/轮次中止 → 挂起卡中止并默认拒绝；不得永久等待或静默放行。
- 超时沿用既有确认超时链（`ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS` → `ANS_PI_SHELL_REVIEW_TIMEOUT_MS` → 120s）；插槽等待期间不启动确认超时，插槽等待上限/中止按 §7.2 fail-closed（具体数值实现声明，见 §九.6）。
- fail-closed 总则：工具不注入 → 不注册；registry 不可用 → 无授权；挂起卡不放行；任何通道失败不导致放行。
- pending/replay/expire 与既有确认卡同口径（G1 交叉）。

**判定方法**

1. 假时钟测试：超时 → expired；通道不可用/推达失败 → unavailable；均消耗申请权，第二张不弹。
2. 窗口关闭/会话终止测试：挂起卡中止、默认拒绝、无悬挂 Promise/无放行。
3. 真实应用超时场景（AC-28 S4）：用既有超时环境变量缩短超时，观察默认拒绝与回执；记录环境变量与时长。
4. 检查 fail-closed 实现（工具不注册、registry 不可用、卡片中止）。

**最低证据**

- `test/桌面应用/shell-escalation.test.ts`/`test/编排/shell-escalation.test.ts` 超时/不可用/中止原始输出。
- 真实应用超时截图/日志（候选哈希、环境变量、时长）。
- diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 超时后放行；通道失败视为允许；窗口关闭后挂起卡永久等待或放行；超时后可再次弹卡。

### 3.7 AC-07 授权作用域、消费与脚本上下文时效（覆盖 P3、P10）

**标准（可核对语句）**

- `allow-once`：只在**同一角色会话**内有效；由**下一次**完全匹配的 `run_shell` 原子 check-and-consume；消费后失效；若匹配调用在闸的 **preblock/写守卫/c=deny** 处被拒，则不消费（授权保留）。
- `allow-session`：只在**同一角色会话**内有效；同一精确命令（同 cwd、同 argv、`entry=run_shell`）可反复执行；会话结束/重建（含边界刷新重建、dispose、应用重启）即失效；不跨角色、不跨项目、不跨 cwd。
- 派生命令（加参数、改路径、改大小写等）一律视为新命令，回正常审批链；不继承。
- script 类授权消费时**重载同一 `approvalContext` 并比对 sha256**；任一脚本变化/不可读 ⇒ 拒绝（`customer-escalation:stale-context`），授权作废且该命令本会话不可再申请。
- **c=allow 不消费授权**（含一次性）；**任何 c=deny 分类不消费、不放行**。
- 开关关闭后既有授权仍有效（客户已批准），但只限该精确命令，不扩展到任何其它命令。

**判定方法**

1. 单测：once 两次调用（第一次消费、第二次回正常链）；session 反复执行；键各维度（argv/cwd/角色/项目/entry）不匹配不生效；会话重建失效。
2. `c=allow` 不消费一次性授权（先 grant once，再执行 c=allow 命令，再执行目标命令仍可用一次）；preblock/write-guard/c=deny 不消费（被拒后授权仍在）。
3. script 上下文：判拒时保存上下文；消费时脚本改动/不可读 → `stale`，授权作废且不可再申请；未改动 → 放行。
4. 开关关闭后授权仍有效（仅精确命令）测试。
5. 真实应用（AC-28 S1/S2）：两次调用、会话重建。
6. 检查 `takeGrant` 调用位置（classify 后、review/risky 非 deny/非 allow；script 分支 c=deny 检查与上下文重载之后）与 diff。

**最低证据**

- `test/编排/shell-escalation.test.ts`/`shell-gate.test.ts` once/session/键/stale/c=allow 不消费/五路径原始输出。
- `test/桌面应用/shell-escalation.test.ts` 会话重建/两次调用输出。
- 真实应用两次调用/会话重建截图或记录。
- `takeGrant` 位置 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 一次授权被重复使用；会话授权覆盖派生命令；跨角色/项目/cwd 生效；c=allow 吃掉一次性授权；c=deny 分类消费或放行授权；脚本变化后仍放行。

### 3.8 AC-08 每命令每会话一次、限流与旧记录清理（覆盖 P4）

**标准（可核对语句）**

- 同一精确命令每角色会话最多申请 **一次**，无论允许/拒绝/超时/已消费，均消耗该命令申请权；`denied`/`expired`/`consumed` 终态不可再申请；`granted-session` 持续到会话结束。
- 角色会话申请总数达上限（默认 **5**）后拒绝且不弹卡；同一角色会话最多 **1 张**待答申请；同一窗口最多 **1 张**升级卡（跨角色）；已有待答时新申请直接拒绝（不排队）。
- 旧记录清理：同一 key 的后续审核若不再是可申请判拒（judge allow、客户手拒、其它 manual 等）→ **删除该 key 的 `recorded` 记录**；资格只认该 key 最近一次审核（`at`/`seq`）；记录被清除后申请被拒。
- 台账键含 `projectRoot`/`entry`；非 `run_shell` 的 review 只忽略，**不写入/不清除** `run_shell` 记录（N3/F5）。
- 状态机覆盖 `recorded / requested / granted-once / granted-session / denied / expired / consumed` 与 `recorded → cleared` 转移。

**判定方法**

1. 状态机单测：逐转移；同一命令允许/拒绝/超时后再次申请均拒绝。
2. 场景测试：「判拒 → 申请 → deny/expired → 再申请」拒绝；「判拒 → 后续 judge allow → 申请」拒绝（记录已清除）；「判拒 → 后台 review → 申请」不受影响。
3. 限流：第 6 次申请拒绝且无卡；pending 时申请拒绝；跨角色同窗口第 2 张拒绝。
4. 检查 `seq`/`at` 与记录清理实现；`onReviewed` 清理路径测试。
5. 检查键组成（projectRoot/entry）与后台不写入/不清除的负例。

**最低证据**

- `test/编排/shell-escalation.test.ts` 状态机/矩阵/清理/限流原始输出。
- `test/桌面应用/shell-escalation.test.ts` 跨角色 pending 输出。
- diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 同命令反复弹卡；超限后仍弹卡；旧判拒记录在后续 allow 后仍可申请；后台 review 清除/写入前台记录；pending 时排队。

### 3.9 AC-09 升级卡与审批卡的仲裁（覆盖 P4、G1）

**标准（可核对语句）**

- 同一窗口 shell 卡族（审批 + 升级）同时最多 **1 张**待答；**升级卡排他**：升级卡待答时，新到的 shell 审批卡在**主进程呈现端等待**（不推达渲染），直到升级卡决出/过期；等待期间**不启动**操作者确认超时（超时从实际推达开始计时）；等待本身有上限（建议复用确认超时），超限/中止 ⇒ `unavailable`（fail-closed），不得静默放行。
- 有 shell 审批卡待答时，**升级申请直接拒绝**（不排队），回执如实提示「当前有 pending shell 确认卡，请稍后再申请」。
- 回包按 `{id}` 路由；`allow` 与 `action` 由 payload 的 `kind` 区分；渲染单槽不得发生跨类型覆盖。
- 恢复卡既有「等待客户不设限」语义不被破坏；`confirm-card.ts` 既有布尔 `mount/respond` API 保持兼容。
- 补四组时序测试：升级卡先到 / 审批卡先到 / 等待超时 / 轮次中止。

**判定方法**

1. 桌面测试：升级卡待答时新审批卡不推达、升级卡决出后审批卡推达；等待期间超时不启动；等待上限/中止返回 unavailable。
2. 审批卡待答时申请升级 → 直接拒绝（无卡）、回执文案。
3. 渲染 store 测试：单槽按 kind 路由，无覆盖；未知/过期 id 回 `{ok:false,expired:true}`。
4. 恢复卡回归：既有测试全过（等待客户不设限）。
5. 检查 `confirm-card.ts` diff（布尔 API 不变 + 动作投影）与 `recovery-channel.ts` 改/不改声明。

**最低证据**

- `test/桌面应用/shell-escalation.test.ts` 四组时序原始输出。
- `test/桌面UI/` confirm-store/confirm-logic 测试输出。
- 既有恢复卡测试原始输出。
- diff 与候选哈希；恢复卡无回归说明。

**失败示例/反例（任一即 fail）**

- 升级卡覆盖审批卡或反之导致丢结果；审批卡待答时升级卡仍弹出；等待期间启动确认超时；等待超限静默放行；恢复卡等待语义回归。

### 3.10 AC-10 不丢、不重放与决定审计（覆盖 G1；与 P5 交叉）

**标准（可核对语句）**

- 升级卡 pending/replay/expire 与既有确认卡同口径；未知/过期 id 回包不放行；重复回包**不产生第二次授权**；窗口关闭/轮次中止 → 默认拒绝。
- 每次申请决定（允许/拒绝/超时）写 `event:"escalation-decision"` 记录，至少含：`timestamp`、`toolCallId`（可为空串）、`command`/`argv`/`cwd`（判拒原文）、`conclusion`（allow/deny/timeout）、`execution:"未执行"`、`conditions:["shell-gate"]`、稳定 `branch`（`escalation:granted-once|granted-session|denied|expired`）、`by`（`operator:<id>`，不可用/超时可用 `operator:unavailable`）、`escalation:{requestId,action,roleId}`；append-only 同文件。
- 审计记录不得缺失；审计失败不翻转判定但如实 stderr（既有语义）。

**判定方法**

1. 单测/桌面测试：pending/replay/expire；未知/过期 id；重复回包；窗口关闭/轮次中止。
2. 审计测试：三种决定各产生一条完整 `escalation-decision` 记录；字段与 branch/by 形状断言。
3. 真实/受控夹具 JSONL 样例（AC-22 共用）：允许/拒绝/超时均有记录。
4. 检查审计 sink 写入路径与 append-only。

**最低证据**

- `test/编排/shell-escalation.test.ts`/`shell-audit` 测试输出。
- `test/桌面应用/shell-escalation.test.ts` replay/窗口关闭输出。
- `docs/audit/shell-gate.jsonl` 样例（临时 userData/受控夹具；路径 + 哈希）。
- diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 过期卡仍放行；重复回包二次授权；拒绝/超时无审计记录；`escalation-decision` 缺必填字段；窗口关闭后挂起卡永久等待。

### 3.11 AC-11 judge 不参与升级与 onReviewed 只读（覆盖 P10；与 G2 交叉）

**标准（可核对语句）**

- 升级卡**不调用 judge、不读「替我决策」开关、不产生 judge 结果行**；该确认的决策者只能是客户。
- `onReviewed` 只做记录/清理，**不改变判定**；judge 不能自翻判拒；「替我决策」不接入升级卡（不写治理记录、不属于任何判断组）。
- 升级卡与治理 approval 组无关（不改变治理卡代批语义）。

**判定方法**

1. spy/mocks：升级申请/卡呈现全过程 judge 调用次数为 0；「替我决策」开启/关闭时升级卡行为一致。
2. 闸测试：`onReviewed` 抛错/返回值不影响 `ShellReviewResult`；判定与无 `onReviewed` 时一致。
3. 治理测试：升级卡不产生治理记录、不走 `customer-input` 判断组。
4. diff 检查 `onReviewed` 只读使用。

**最低证据**

- 相关单测原始输出（spy 计数、行为对比）。
- `shell-gate` `onReviewed` 只读测试输出。
- 治理记录/客户输入通道零关联检查输出。
- diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 升级卡调用 judge 或受「替我决策」影响；`onReviewed` 改变判定；升级卡写治理记录/走治理判断组；judge 自翻判拒。

### 3.12 AC-12 单一谓词与两处消费（覆盖 P7、P10）

**标准（可核对语句）**

- `matchRoutineShellCommand(argv): { id: string } | undefined` 是**唯一**纯函数（无 IO、无规则集依赖），在 `src/common/门禁引擎/classify-shell.ts` 实现，覆盖 §5.1 全部形态。
- `classifyShellDetailed` 在**硬拒/记号检查之后、risky 判断之前**调用；命中 → `allow`（`ruleId: "allow:routine:<id>"`）。
- `evaluateShellWriteTargets`（`src/common/门禁引擎/shell-write-guard.ts`）在程序名解析后、`node --test`/npm script 分支之前调用**同一函数**；命中 → `{ kind: "pass" }`（不进入脚本审查）。
- `routine-shell-policy.matchesDelegatedRoutineCheck` 经 `src/service/gate/shell-rules.ts` 公开出口消费**同一函数引用**；只接受原委托三 id 并保留项目根/cwd/realpath 校验。
- 不出现第二份白名单/风险判定；`shell-rules.ts` 只逐字再导出（同一函数引用），不复制实现；同引用断言测试通过。

**判定方法**

1. diff 检查谓词实现位置、两处调用点、Service 出口再导出；`rg` 扫描无第二份 routine 白名单/类似判定。
2. `shell-rules-public-reexport.test.ts` 断言同一函数引用。
3. 分类器/写守卫单测：同一 argv 在分类器得 `allow:routine:<id>`、在写守卫得 `pass`。
4. 检查编排未直接导入门禁引擎私有 `common/`（只经 Service 出口）。

**最低证据**

- `test/门禁引擎/` 谓词/分类器/写守卫/同引用测试原始输出。
- diff（`classify-shell.ts`、`shell-write-guard.ts`、`shell-rules.ts`、`routine-shell-policy.ts`）。
- `rg` 扫描输出（无第二份实现）。
- 候选哈希。

**失败示例/反例（任一即 fail）**

- 存在第二份白名单/风险判定；写守卫仍把例行命令判 `script`；编排直接导入门禁私有目录；`shell-rules.ts` 复制实现而非再导出。

### 3.13 AC-13 白名单命中形态 → c-allow、0 卡、0 judge（覆盖 P7）

**标准（可核对语句）**

- 精确形态全部命中：`["npm","test"]`；`["npm","run","test"]`、`["npm","run","typecheck"]`、`["npm","run","lint"]`、`["npm","run","check"]`；`["node","--test"]`；`["node","--test", <paths>...]`（每个 path 必须在 `test/` 下、匹配 `*.test.{js,ts,mjs,cjs,mts,cts}`、无 flag、无 `..`、无空白/元字符）；`["tsc","--noEmit"]`；`["npm","ci"]`。
- 对**所有角色（含内置治理角色）**生效：分类 `c-allow`、**0 卡、0 judge 调用**、审计 `c-allow`；写守卫 `pass`；项目角色原本由宿主委托放行的 `npm test`/`npm run typecheck`/`node --test`（受限路径）分支从委托/`b-allow` 变为 `c-allow`（仍 0 卡）。
- `npm install <新包>` 不在本 AC 命中（保留判断 + 判拒后申请）。

**判定方法**

1. 分类器/写守卫/委托单测覆盖每个形态的正例；断言 `ruleId: "allow:routine:<id>"`/`pass`/分支 `c-allow`。
2. judge spy：命中形态不调用 judge；桌面通道：不弹卡。
3. 内置治理角色路径测试：审批档下命中形态仍 `c-allow`（0 卡）。
4. 真实运行（AC-28 S9）：白名单命令无卡、judge 调用计数=0（计数/日志/审计）。
5. 审计样例：`c-allow` 记录无 judge 字段。

**最低证据**

- `test/门禁引擎/classify-shell.test.ts`/`shell-routine.test.ts`/`shell-write-guard.test.ts` 正例原始输出。
- `test/编排/shell-authorized-routine.test.ts` 更新后输出（分支变 `c-allow`）。
- 内置角色路径测试输出。
- 真实运行截图/审计/计数；diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- `npm test`/`npm ci`/`tsc --noEmit` 仍调用 judge 或弹卡；内置角色仍走审批；写守卫仍判 `script`；`node --test` 路径形状未被正确限制（越界也命中）。

### 3.14 AC-14 非命中形态与 fail-closed（覆盖 P7）

**标准（可核对语句）**

- 以下**不命中**：`npm install`（裸/带包）、`npm i ...`、`npm ci <flags>`、`npm test -- <args>`、`npm run build|start|<其它脚本名>`、裸 `tsc`、`npx *`、`node --test` 越界路径/带 flag（如 `--import`/`--loader`/`--experimental-*`）/含 `..`/空白/元字符、`tsc -p tsconfig.json`；均落回既有链（开关开 → judge；关 → 客户卡），fail-closed 不变。
- 硬拒/封堵优先于白名单；自定义规则集不得改变硬拒优先（AC-16 交叉）。
- 负例矩阵必须断言这些形态**不是** `c-allow`。

**判定方法**

1. 分类器负例矩阵逐项断言（review/risky/deny，非 allow）。
2. gate 集成测试：非命中形态在开关开/关下走既有链（judge/客户卡），不执行确定性放行。
3. 负例：越界路径、flag、元字符、`..` 不得命中；`npm install <pkg>` 保留判拒 + 申请路径。
4. 检查谓词边界实现（严格全等/受限形状）。

**最低证据**

- `test/门禁引擎/` 负例矩阵原始输出。
- `test/编排/` gate 集成输出。
- diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 任一非命中形态被确定性放行；`npm install` 被放行；`node --test ../x` 或带 flag 被放行；硬拒被白名单覆盖。

### 3.15 AC-15 委托策略只保留原三 id（覆盖 P7、P11）

**标准（可核对语句）**

- `routine-shell-policy` 复用谓词，但**只接受原委托清单三个 id**（`npm test`、`npm run typecheck`、`node --test` 受限路径），保留项目根/cwd/realpath 校验；**不把新增形态自动继承给委托**（避免扩大既生效的宿主授权面）。
- 现有测试按方案 §5.4 同步：`test/编排/shell-authorized-routine.test.ts` 的 `npm ci` 负例（原为不命中）变为 `c-allow`；`npm test`/`npm run typecheck`/`node --test` 的委托命中分支从 `b-allow`/`b-delegated-routine` 变为 `c-allow`；其它断言不得弱化。
- 断言变更逐条列明理由（在完成报告/变更包中）。

**判定方法**

1. 委托策略单测：原三 id 在项目根/cwd/realpath 条件下命中；`npm ci`/`tsc --noEmit`/`npm run lint` 等新增形态不因委托被放行（即便被 c 白名单放行，委托判定本身不命中）。
2. 检查测试 diff：`shell-authorized-routine.test.ts` 的断言变更逐条对应方案 §5.4；无其它弱化。
3. 检查实现：委托判定调用同一谓词但过滤 id；不出现第二份形状判定。

**最低证据**

- `test/编排/shell-authorized-routine.test.ts` 候选原始输出与逐条变更说明。
- `test/门禁引擎/shell-rules-public-reexport.test.ts`/`shell-routine.test.ts` 委托相关测试输出。
- diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 委托继承 `npm ci`/`tsc --noEmit`/`npm run lint`；删除委托断言或弱化；测试变更未列理由；委托判定出现第二份实现。

### 3.16 AC-16 自定义规则集与硬拒优先（覆盖 P7、P10）

**标准（可核对语句）**

- 注入更严格的自定义规则集（如更宽的 `riskyPrograms`）时，上表白名单形态**仍 `c-allow`**（谓词在 risky 之前命中；客户已在闸门 1 接受并披露）；**硬拒仍优先**。
- 测试显式断言该行为（不是「有意如此」的口头声明）；若未来需按规则集关闭，走 O8（未实施）。

**判定方法**

1. 注入自定义规则集的分类器测试：白名单形态仍 allow；同一规则集下令牌/硬拒形态仍 deny。
2. 检查测试显式命名/断言（P7 要求）。
3. 检查谓词调用位于硬拒/记号检查之后、risky 之前。

**最低证据**

- `test/门禁引擎/shell-routine.test.ts`（自定义规则集 P7）原始输出。
- 分类器 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 自定义规则集改变白名单结果却无断言（不可核对的「有意」说明不算）；硬拒被白名单覆盖。

### 3.17 AC-17 开关关闭路径逐字不变（覆盖 P6）

**标准（可核对语句）**

- 开关关闭时，**非白名单命令**走既有 `presentConfirmed` 路径：命令显示、超时、拒绝、可用性文案与行为**逐字不变**；不调用 judge；不产生判拒记录；不弹升级卡；申请工具如实回「没有可申请的判拒记录」。
- 客户手批的审计形状不变：无 `judge`/`customerGrant`，`branch` 以 `→a-allow` 结尾，`by` 以 `operator:<id>` 结尾（如 `c-review→a-allow`）。
- 说明：白名单形态在开关关闭时仍按 P7 为 `c-allow`（0 卡），不属于「非白名单命令的既有确认路径」；暂停不影响白名单（见 §九.7）。
- 既有 `operator-channel`/确认卡/恢复卡测试全过；新增开关关闭回归。

**判定方法**

1. 运行既有 `test/桌面应用/operator-channel.test.ts`（及受影响精确文件）全部通过，与 B0 对照无新增失败。
2. 新增回归：开关关闭 + 非白名单命令 → 既有卡；无 judge 调用；无升级卡；工具回执如实。
3. 真实应用（AC-28 S11）：开关关闭时既有卡显示/允许/拒绝/超时；审计形状。
4. 检查 diff：presenter/operator-channel 在开关关闭路径的文案与行为未被改写；`shell:confirm-*` 既有载荷形状不变。

**最低证据**

- `operator-channel.test.ts` 与相关既有测试原始输出。
- 新增开关关闭回归输出。
- 真实应用截图/日志（候选哈希）。
- diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 开关关闭出现升级卡；开关关闭时非白名单命令的文案/超时/拒绝/可用性行为变化；开关关闭时调用 judge；客户手批审计形状变化。

### 3.18 AC-18 开关开启时 manual 仍按拒绝、retry-capped 可申请（覆盖 P6、P1）

**标准（可核对语句）**

- 开关开启时，`manual`（除 `retry-capped`）与 `row-failed` 仍按拒绝处理、**不弹卡**（2026-10-19 裁定不变）；`manual/retry-capped` 仍按拒绝处理，但其判拒记录**可申请**。
- retry-capped 的客户面无新增结果行；暂停入口由升级卡页脚覆盖（AC-21）。
- 其它 `manual` reasonCode 不可申请（v1）。

**判定方法**

1. operator-channel/desktop 测试：各 manual reasonCode、row-failed 的客户面（无卡、回执）；retry-capped 记录可申请。
2. 真实应用（AC-28 S5）：第三次判拒 → retry-capped → 角色申请 → 升级卡；页脚暂停可见。
3. 检查 `manualAsDeny`/`reasonCode` 记录与资格判定。

**最低证据**

- `test/桌面应用/operator-channel.test.ts`/`shell-escalation.test.ts` 原始输出。
- `test/编排/shell-escalation.test.ts` retry-capped 资格输出。
- 真实应用截图/记录；diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 其它 manual 弹卡；row-failed 可申请；retry-capped 不产生可申请记录；新增 manual 结果行未经确认。

### 3.19 AC-19 回执措辞（覆盖 P8、P9 部分）

**标准（可核对语句）**

- judge deny 回执（角色可见）含「可调用 `request_shell_escalation` 对这条精确命令申请客户确认（每会话一次）」并保留「关闭『替我审批』后重试」兜底；`manualDenyAdvice.retryCapped` 给出同样出路（不再只写「请重试」）。
- 判拒结果行（客户可见）`retryHint` 改为「可让角色申请客户确认（允许一次 / 本会话允许该命令 / 拒绝），或关闭『替我审批』后重试（改为手动确认）」。
- `containsExitLine` 与 judge 自拟文本兼容；保留「关闭」「替我审批」「重试」子串。
- 中英成对（AC-24）；回执如实，不把未批准写成批准。

**判定方法**

1. zh/en 文案断言（`main.operator.judgeWayOut`、`main.operator.manualDenyAdvice.retryCapped`、`ui.judge.closeAndRetry`、retryHint 相关 key）。
2. `containsExitLine` 单元测试（judge 自拟文本含标准子串 → 视为已给出路）。
3. 桌面测试/真实应用截图（回执行文本）。
4. 检查 i18n 与代码使用点；英文无中文泄漏。

**最低证据**

- 相关文案断言与 `containsExitLine` 测试原始输出。
- 真实应用回执截图/聊天记录。
- i18n diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 回执仍只有「关闭开关」；删掉兜底子串导致 `containsExitLine` 不兼容；拒绝回执措辞错误；英文缺失/中文泄漏。

### 3.20 AC-20 暂停语义与持久化隔离（覆盖 P8、G4）

**标准（可核对语句）**

- `shellSessionPaused` 为主进程**模块级**状态；同一次应用运行内**跨窗口重开保留**；应用重启清零并回到持久化开关值；不写偏好、不持久化。
- 只被 **shell 操作者通道**读取：`isEnabled = 持久化开关 && !shellSessionPaused`；不改变持久化开关值；**不影响治理 approval 组**（该组仍只看全局开关）。
- 暂停后新的**需判断的** shell 请求走客户确认卡（等同关闭开关的降级）；恢复即回到持久化值。
- `shell:judge-state` 推送含可选 `paused`；`shell:judge-set` 字段校验不变。
- 白名单命令仍 `c-allow`（不因暂停而弹卡；见 §九.7）。

**判定方法**

1. interface/desktop 测试：暂停状态读取/恢复、`isEnabled` 有效值、持久化开关不变、治理组不读暂停。
2. 真实应用（AC-28 S6–S8）：暂停 → 非白名单 shell 请求走客户卡；治理 approval 卡仍按全局开关代批；偏好文件哈希不变；重启清零；窗口重开（按 §九.5 程序）保留。
3. 检查 `app/main.ts` 模块级状态、推送字段、`customer-input` 仍读全局开关。
4. 检查偏好文件/existing `shell:judge-set` 校验零改动。

**最低证据**

- `test/桌面应用/interface.test.ts`/`shell-escalation.test.ts` 暂停相关原始输出。
- 真实应用截图与日志（暂停前后、重启前后、窗口重开前后、治理卡对照）；偏好文件哈希。
- diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 暂停写入偏好；重启后仍暂停；治理 approval 组被暂停；窗口重开丢失暂停（在本方案要求保留的范围内）；白名单被暂停改为弹卡；持久化开关值被改。

### 3.21 AC-21 暂停入口与 UI 状态（覆盖 P8）

**标准（可核对语句）**

- 入口①：judge 判拒**结果行**上的「本次运行暂停自动审批」按钮；入口②：**升级卡页脚**次要动作「暂停本次运行自动审批」（覆盖 retry-capped 无结果行场景，**不改变三选项决定**）。
- 渲染显示「本次运行已暂停自动审批（重启后清零、回到持久化开关值）」徽标/状态，并提供恢复按钮；i18n key 中英成对。
- 暂停页脚动作与三选项互不干扰（不产生第四决定项）。

**判定方法**

1. 渲染测试：结果行按钮、卡页脚动作、暂停徽标/恢复按钮；页脚动作不触发 allow/deny。
2. 真实应用截图：上述三类界面；关闭 DEBUG；记录元数据。
3. i18n 断言。

**最低证据**

- `test/桌面UI/` 相关测试原始输出。
- 真实应用截图组 + 元数据。
- i18n diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 缺入口②；页脚动作改变三选项决定或产生第四选项；无暂停状态说明/恢复按钮；中英文缺失。

### 3.22 AC-22 审计三类可区分与 escalation-decision 完整（覆盖 P5）

**标准（可核对语句）**

`docs/audit/shell-gate.jsonl` 中三类记录字段不同、可机读：

- **judge 放行**：含 `judge`，`by` 含 `judge:<engine>`；deny 档放行带 `tier:"deny"` + `hardDenyOverride:true`。
- **客户在开关关闭时手批**：**无** `judge`、**无** `customerGrant`；`branch` 以 `→a-allow` 结尾（如 `c-review→a-allow`）；`by` 以 `operator:<id>` 结尾。
- **客户升级授权放行**：含 `customerGrant`（`requestId`/`scope`/`operatorId`）且无 `judge`；`branch` 为 `customer-escalation:allow-once|allow-session`；`by` 以 `customer:` 开头。
- **申请决定**（允许/拒绝/超时）：完整 `event:"escalation-decision"` 记录（`conclusion`/`execution:"未执行"`/`conditions:["shell-gate"]`/稳定 `branch`/`by`/`escalation`），见 AC-10。
- 新增字段（`necessity`/卡片载荷）不得含凭据；既有 `command`/`argv` 逐字审计行为不变。

**判定方法**

1. 提供的 JSONL 样例（当前候选真实运行或受控夹具，临时 userData）逐条断言三类形状 + 申请决定记录；给出文件路径与哈希。
2. 单测：审计记录字段、`customerGrant` 只由授权放行写入、与 `judge` 不同时出现。
3. grep/检查：新增字段来源仅限命令/necessity/approvalContext/judge 记录，不含环境变量/凭据；样例中不含已知凭据模式/密钥名。
4. 检查既有 `command`/`argv` 逐字审计 diff（不变）。

**最低证据**

- 当前候选 JSONL 样例（含三类 + escalation-decision；路径 + SHA-256）。
- 审计单测原始输出。
- 凭据检查输出（grep/样例）；diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 客户授权被写成 judge 放行；客户手批形状不成立（如带 `judge`）；拒绝/超时无审计；新增字段含凭据；既有命令/argv 审计被改写。

### 3.23 AC-23 审计共享 sink 与不丢记录（覆盖 P5）

**标准（可核对语句）**

- `onAuditSinkCreated` 把闸创建的 sink 绑定给升级 registry；升级决定与 review 写**同一** `docs/audit/shell-gate.jsonl`（同一 `shell-gate` 条件），append-only。
- 外部注入 sink 也触发回调（共享同一 sink）；若 sink 构造/刷新失败，记录缺失但判定不翻转、如实 stderr（既有语义）。
- 不得另开第二审计文件或丢失升级决定记录。

**判定方法**

1. 检查 `shell-arming.ts`/`run-role.ts`/`shell-gate.ts` 的 `onAuditSinkCreated` 透传与绑定；外部注入 sink 的回调测试。
2. fake sink 测试：review 与 escalation-decision 写同一 sink；失败时判定不变。
3. 真实/夹具 JSONL：两类记录同文件。

**最低证据**

- diff 与 fake sink/外部 sink 测试原始输出。
- 真实/夹具 JSONL 路径与哈希。
- 候选哈希。

**失败示例/反例（任一即 fail）**

- 升级决定写第二个文件或丢失；外部注入 sink 未绑定；审计失败改变判定或静默吞掉。

### 3.24 AC-24 i18n 中英成对、计数与零泄漏（覆盖 P9）

**标准（可核对语句）**

- §7.3 所列新增/修改 key（`main.operator.escalation.*`、`main.operator.manualDenyAdvice.retryCapped`、`main.operator.judgeWayOut`、`ui.judge.closeAndRetry`、`ui.confirm.escalation.*`、`ui.judge.pauseSession/pauseSessionDone/pausedBadge/resume` 等）中英成对。
- `test/项目管理/shared/i18n.test.ts` 分区计数**显式更新**（当前 `ui 886 / main 550 / shared 62 / preferences 3 = 1501`；候选实际计数须在测试 diff 中更新并说明新增 key 数量）；parity、英文零中文泄漏、正常套件无 missing-key 全过。
- 既有 key 语义不变（除方案 §4.6/§7.3 明确改写者）；渲染侧消费正确（升级卡/暂停/回执）。

**判定方法**

1. 运行 `test/项目管理/shared/i18n.test.ts` 与相关渲染测试；记录计数与 parity/零泄漏结果。
2. 检查 key diff 与计数 diff 一致（新增 key 数与计数变化可对账）。
3. grep 英文目录无中文字符；正常套件无 `i18n.missing-key` 输出。
4. 渲染消费测试：升级卡/暂停/回执使用新 key。

**最低证据**

- i18n 测试原始输出（计数、parity、零泄漏）。
- key diff 与计数 diff；渲染消费测试输出；候选哈希。

**失败示例/反例（任一即 fail）**

- 缺英文；计数未更新或计数与 key 数不符；中文泄漏到 en-US；正常套件出现 missing-key；既有 key 被误改。

### 3.25 AC-25 受影响套件与断言不弱化（覆盖 P11、G2）

**标准（可核对语句）**

- 受影响角色层测试全部通过：门禁引擎、编排、运行时核心、桌面窗口、桌面UI、项目管理；测试角色跨层集成见 AC-26。
- 既有断言只在方案 §5.4/影响清单要求处更新（如 `npm ci` 负例、委托分支、`shell-authorized-routine.test.ts` 断言）；更新逐条列明理由；**不得删除断言、放宽比较、新增 skip/todo 以保绿**。
- 失败按 B0 基线分类（既有 Windows EPERM/symlink 等环境失败 vs 本次新增）；本次新增确定性失败为 0。

**判定方法**

1. 运行各角色受影响套件；记录命令、环境、计数、失败原文。
2. `git diff -U0` 检查测试文件：断言变更逐条对应方案/影响清单；无弱化/删除/新增 skip。
3. 与 B0 基线对照，分类失败；新增失败未修复 → fail。
4. 检查测试文件命名/路径在写集内（含 `test/桌面应用/shell-escalation.test.ts` 的 B-3 边界条目）。

**最低证据**

- 各角色原始输出清单（命令/退出码/计数/失败原文）。
- 测试 diff 与逐条变更说明；B0 基线；失败分类表；候选哈希。

**失败示例/反例（任一即 fail）**

- 改断言保绿/删除断言/新增 skip；新增失败未处理；测试文件超出写集/边界；用摘要代替原始输出。

### 3.26 AC-26 跨层集成（覆盖 P11）

**标准（可核对语句）**

- `test/测试/` 新增跨层集成（编排 registry + 运行时工具能力 + 桌面 presenter 替身 + 审计 sink），至少覆盖：授权顺序（五路径）、资格矩阵、限流/去重、审计区分（三类 + escalation-decision）、暂停不影响治理 approval 组、白名单 judge 调用计数=0；使用注入替身，不启动真实 Electron。
- 跨层结论不得由各角色单测拼凑代替。

**判定方法**

1. 运行 `node --test test/测试/<新集成>.test.ts`；记录原始输出。
2. 检查断言覆盖上述六类；检查替身注入方式（不依赖真实 Electron/真实模型）。
3. 与角色单测结果交叉核对（同一候选）。

**最低证据**

- 跨层集成测试原始输出；测试 diff；候选哈希。
- 与角色测试的对应关系说明（变更包）。

**失败示例/反例（任一即 fail）**

- 只有单测无跨层；跨层未覆盖授权顺序/资格/审计/暂停/白名单 0 judge；用真实模型/网络依赖导致不可复算。

### 3.27 AC-27 T3 全量回归与失败分类（覆盖 P11）

**标准（可核对语句）**

- 全量适用回归：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')` 或团队计划认可的等价命令；排除 `write-sequencing.test.ts` 的理由写入证据（历史串行写测试，团队计划 §6.3）。
- 记录命令、环境、计数（pass/fail/skip/todo）、失败原文；与 B0 基线分类；**新增确定性失败 = 0、新增 skip = 0**；既有环境失败不计新增，但不得掩盖新增。
- 共享/契约消费者重测按 T3 覆盖：`src/model/runtime.ts` 实际消费方（编排、运行时核心 tools、桌面窗口、适配器实际导入面）、`src/common/门禁引擎`、`src/common/shared/i18n` 消费方；消费者清单与结果写入变更包。

**判定方法**

1. 执行全量回归；核对命令/计数/失败原文/基线分类。
2. 核对消费者清单（实施前 `rg` 扫描导入）与实际重测结果；缺口记录。
3. 检查新增失败是否修复；新增 skip 是否说明。

**最低证据**

- 全量回归原始输出（命令/环境/计数/失败原文）。
- B0 基线；消费者重测清单与结果；候选哈希/diff/status。

**失败示例/反例（任一即 fail）**

- 只跑受影响套件；全量未执行；新增失败未分类/未修复；新增 skip；消费者重测缺失。

### 3.28 AC-28 真实 Electron E2E 与截图证据（覆盖 P1、P5、P7、P8、P11）

**标准（可核对语句）**

- 真实 Electron（临时 userData、真实 build）至少覆盖 §4.6 场景矩阵 S1–S12：升级三选项/拒绝/超时/retry-capped、暂停与窗口重开/重启清零、治理 approval 组不受影响、白名单 0 judge、审计 JSONL 样例。
- 多引擎覆盖边界按团队计划 §10.2 第 5 项：至少默认/一个真实引擎；其余以共享通道测试 + 审计样例覆盖，缺口如实写入证据与验收报告。
- 截图按 §2.4：当前候选真实运行、关闭 DEBUG、记录 sha256/候选版本/拍摄命令/窗口尺寸；最多截图、不得录屏；缺录屏不构成 fail/insufficient。
- P1/P7/P8 的客户可见面以真实运行证据为准，不得用单测替代。

**判定方法**

1. 对照 §4.6 场景矩阵逐项核对证据（截图/日志/审计）；记录候选哈希、临时 userData、窗口尺寸、环境变量（如短超时）。
2. 截图元数据核对（sha256、候选、拍摄命令、窗口尺寸）；确认 DEBUG 覆盖层关闭。
3. 白名单 judge 调用计数=0 的证明（计数日志/审计/结果行缺失）。
4. 审计 JSONL 样例（AC-22 共用）。
5. 记录多引擎缺口（若有）。

**最低证据**

- 场景矩阵对应截图组 + 元数据；E2E 日志（`E2E_PASS`/phase5a 计数若适用）；审计 JSONL；候选哈希；临时 userData 路径；缺口记录。

**失败示例/反例（任一即 fail）**

- 只跑单测/无真实应用证据；截图含 DEBUG 覆盖层；截图无候选/窗口尺寸/哈希；要求或提供录屏；场景缺失且未记录缺口；白名单 judge 调用未证明为 0。

### 3.29 AC-29 typecheck 与构建（覆盖 P11）

**标准（可核对语句）**

- `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` 全部退出码 0；记录输出与环境。
- 构建产物 `app/renderer/dist/` 为忽略产物、非候选；类型加法不破坏既有消费方（typecheck 全绿）。

**判定方法**

1. 运行三条命令；记录原始输出/退出码。
2. 检查 dist 非候选（git status/路径）；typecheck 失败即 fail。

**最低证据**

- 三条命令原始输出/退出码；候选哈希；dist 非候选说明。

**失败示例/反例（任一即 fail）**

- typecheck/build 失败或未执行；把 dist 当候选；类型加法破坏消费方。

### 3.30 AC-30 回滚开关语义（方案 §13.2；团队计划 §九.9 闸门 2 确认默认纳入）

**标准（可核对语句）**

- `ANS_SHELL_ESCALATION_DISABLED=1` 时：不注册 `request_shell_escalation`；不创建 escalation registry；不注入 `takeGrant`（既有授权全部失效，fail-closed）。
- 白名单扩容**不受该开关控制**，需单独回退代码（方案 §13.2 原文口径）；不声称该开关能回滚白名单。
- 默认（未设置）行为符合本文件全部标准；开关实现为构建期/环境开关（方案 §13.2 口径）。

**判定方法**

1. 测试/运行：设置环境变量后工具不注册、registry 不存在、`takeGrant` 未注入；既有授权不可用。
2. 检查 diff：开关读取位置与 fail-closed 行为；白名单路径不受影响。
3. 变更包声明开关默认纳入与行为。

**最低证据**

- 环境开关测试/运行原始输出；diff；候选哈希。
- 白名单独立回退说明。

**失败示例/反例（任一即 fail）**

- 开关只隐藏 UI 但仍消费/发放授权；开关影响白名单；未实现默认纳入的开关语义。

### 3.31 AC-31 无越权改动与发布边界（覆盖 P12）

**标准（可核对语句）**

- 不改角色写区/角色 id/显示名；不改治理卡「替我决策」；不新增 OS 沙箱；不自动回滚越界写入；不改被治理目标项目（测试新建除外）。
- 不改 `package.json`/`package-lock.json`/构建配置/发布配方；不写 `src/common/装配/release-policy.mjs`（团队计划 §八：新小版本发布，overlay 不用于本任务）。
- 发布 overlay 子项：**N/A（本任务按新小版本、不 overlay；依据闸门 2 确认的团队计划 §八/§九.10）**；若发布口径改为 overlay，则按方案 §12 逐文件列名并补证。
- 边界变更仅限闸门 2 确认的三项（B-1 门禁引擎 `shell-rules.ts` md；B-2 编排 `shell-arming.ts` md；B-3 桌面窗口 `test/桌面应用/shell-escalation.test.ts` md+yaml）；无其它边界改动。
- 管理记录（`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`）不混入产品候选。

**判定方法**

1. 对照 B0 列出候选 diff；逐路径核对在团队计划 §4.1/§4.3 写集内；范围外零改动。
2. 对比 `package.json`/锁/构建配置/`release-policy.mjs` 哈希（零改动）。
3. 核对边界文件 diff 仅三项；角色 id/显示名/写区/治理语义零改动。
4. 检查候选隔离（管理记录/证据目录不混入）。

**最低证据**

- 候选 diff 与逐路径清单；范围外文件哈希对照；package/build/release-policy 零改动；边界 diff 三项；候选哈希。

**失败示例/反例（任一即 fail）**

- 出现未列出的权限变化；写区扩张；边界变动超出三项；改 package/build/release 配方；管理记录混入候选；overlay 路线下未逐文件列名。

### 3.32 AC-32 权限不扩张（覆盖 G3）

**标准（可核对语句）**

- 升级工具只读/只申请：不写盘、不执行命令；授权只影响精确命令；无跨角色/跨项目；post-audit/写守卫/审计边界不变。
- 角色不能伪造卡片内容/授权；伪造卡 id/回包不放行；`necessity` 有界且标注不可信。
- 授权不能成为通用白名单（不能越过 c=deny/preblock/write-guard）。

**判定方法**

1. 对抗注入测试：角色文本伪造客户同意/系统提示/judge 结论；伪造 id/回包；跨角色/项目；均不放行。
2. 检查工具处理器无写盘/执行；授权匹配严格 argv/cwd/role/project/entry。
3. 检查 post-audit/写守卫/审计边界 diff（无扩张）。

**最低证据**

- 对抗注入测试原始输出；diff；候选哈希。

**失败示例/反例（任一即 fail）**

- 工具可执行命令/写盘；授权成通用白名单；伪造回包放行；跨角色/项目生效。

### 3.33 AC-33 judge 既有行为不回归（覆盖 G2）

**标准（可核对语句）**

- 既有 judge 测试（allow/deny/manual/retry-capped/并发/读取预算/提示注入）全部通过；判拒结果行仍产生；deny 档放行仍标 `hardDenyOverride`；retry-capped 仍走拒绝路径且 `manualAsDeny` 事实可被记录。
- judge 判定/结果行/deny 档标记无回归。

**判定方法**

1. 运行既有 judge 套件（`test/编排/shell-judge*.test.ts` 等）；记录原始输出。
2. 检查结果行/`hardDenyOverride`/`manualAsDeny` 断言；与 B0 对照。

**最低证据**

- 既有 judge 套件原始输出；diff；候选哈希。

**失败示例/反例（任一即 fail）**

- judge 判定变化；结果行缺失；deny 档标记丢失；retry-capped 路径被改变。

### 3.34 AC-34 开关持久化不回归（覆盖 G4）

**标准（可核对语句）**

- 全局「替我审批」开关的持久化/重载行为不变；暂停不写偏好；`shell:judge-set` 字段校验不变；无新偏好键。
- 既有 interface/preferences 测试全过 + 新增暂停测试。

**判定方法**

1. 运行既有 interface/preferences 测试；新增暂停测试。
2. 检查偏好文件内容/哈希（暂停前后一致）；`shell:judge-set` 校验 diff。
3. 重启后全局开关值保持（既有行为）。

**最低证据**

- 测试原始输出；偏好文件哈希；diff；候选哈希。

**失败示例/反例（任一即 fail）**

- 暂停改偏好；开关字段校验被放宽；全局开关持久化/重载行为变化。

### 3.35 AC-35 文档状态与基线可追溯（覆盖 G5）

**标准（可核对语句）**

- 方案 v1.3、复核记录、闸门 1/2 记录可追溯（链接/哈希）；实施不超出确认版本与写集；实质变更按方案 §13.3 重开闸门。
- 文档状态如实：实现完成未验收标 `implemented-unverified`；不得写 `verified`；验收报告只能由独立验收另写。
- 不 commit/push/merge/release；不伪造 task_ops/verification 记录；证据以文件/原始输出为准。

**判定方法**

1. 核对文档链接/哈希与确认记录；变更包列出方案版本、标准版本、候选哈希、节点、证据。
2. 检查各角色 `docs/change/` 状态行（`implemented-unverified`）；检查无提前 verified。
3. 检查 git 状态（无 commit/push；工作区/暂存区符合团队计划）。
4. 检查无 `docs/verification/` 伪造记录。

**最低证据**

- 文档链接/哈希；状态行原文；变更包；git status/diff；候选哈希。

**失败示例/反例（任一即 fail）**

- 无复核记录/确认记录；实施超出写集不回报；提前写 verified；伪造 verification/task_ops 记录；提交/推送/发布。

### 3.36 覆盖映射

#### 3.36.1 方案 §10 P/G → AC

| 方案标准 | 覆盖 AC |
| --- | --- |
| P1 判拒后申请通道 | AC-01、AC-03、AC-04、AC-05、AC-06、AC-18、AC-28 |
| P2 不可申请档与硬地板 | AC-01、AC-02、AC-07 |
| P3 作用域与消费 | AC-07 |
| P4 每命令每会话一次 + 限流 + 卡片仲裁 | AC-08、AC-09 |
| P5 审计可区分 | AC-10、AC-22、AC-23 |
| P6 开关关闭路径逐字不变 | AC-17、AC-18 |
| P7 白名单扩容 | AC-12、AC-13、AC-14、AC-15、AC-16、AC-28 |
| P8 回执与开关粒度 | AC-19、AC-20、AC-21、AC-28 |
| P9 i18n 完整 | AC-19、AC-24 |
| P10 不变量与安全 | AC-02、AC-04、AC-07、AC-10、AC-11、AC-16、AC-32 |
| P11 测试与证据 | AC-25、AC-26、AC-27、AC-28、AC-29 |
| P12 无越权改动 | AC-31 |
| G1 申请不丢/不重放 | AC-06、AC-09、AC-10 |
| G2 judge 行为不回归 | AC-11、AC-25、AC-33 |
| G3 权限不扩张 | AC-03、AC-05、AC-32 |
| G4 开关持久化不回归 | AC-20、AC-34 |
| G5 文档与基线 | AC-35 |

**自检结论**：P1–P12/G1–G5 每条均至少被一个 AC 覆盖；无方案条目被删除；各 AC 的证据要求不低于方案对应条目的证据口径（截图/真实运行/跨层/审计 JSONL/T3 全量）。

#### 3.36.2 任务关键不变量 → AC

| 关键不变量 | 覆盖 AC |
| --- | --- |
| 无答复拒绝 | AC-06、AC-10、AC-28 |
| 硬地板不可翻案 | AC-02、AC-07 |
| 单一判定实现 | AC-12、AC-16 |
| 每命令每会话一次 | AC-08 |
| 客户手批与 judge 放行审计可区分 | AC-22、AC-23 |
| 开关关闭路径逐字不变 | AC-17 |
| 白名单 0 卡 0 judge | AC-13、AC-28 |
| 暂停 shell-only 且重启清零 | AC-20、AC-21 |
| i18n 中英成对 | AC-19、AC-24 |
| 回滚开关语义 | AC-30 |
| 升卡仲裁与不丢/不重放 | AC-09、AC-10 |

---

## 四、证据计划

### 4.1 候选身份、基线与环境

- 写前基线（B0）：`git rev-parse HEAD`、`git status --short`、目标文件 `git hash-object` + `sha256sum`；实施阶段入口记录一次，每批入口记录受影响文件基线；确认无产品代码改动（除既有未跟踪管理文档）。
- 候选身份：所有新增/改动文件（产品代码、测试、配置）的 `git hash-object` 与 `sha256sum`（工作区；CRLF/LF 差异分别记录）；新增文件同。
- 改动范围：`git diff --name-only` 与 `git status --short` 必须落在闸门 2 确认的写集/边界内；`git diff --cached --name-only` 为空（不暂存）；无授权外已跟踪变化。
- 环境：Node/npm 实测版本、OS/Shell、命令工作目录；Windows 既有失败按 B0 分类；不得伪造输出。
- 候选隔离：管理记录/证据目录不纳入候选；并发写混入按不可复算处理（团队计划 §九.12）。

### 4.2 命令清单（最低要求，实际以仓库脚本/runner 为准）

| 范围 | 命令 | 产出角色 |
| --- | --- | --- |
| 门禁引擎 | `node --test "test/门禁引擎/**/*.test.ts"`；`npm run typecheck` | 门禁引擎 |
| 编排 | `node --test "test/编排/**/*.test.ts"`；`npm run typecheck` | 编排 |
| 运行时核心 | `node --test "test/runtime-core/**/*.test.ts"`；`npm run typecheck` | 运行时核心 |
| 桌面窗口 | `node --test test/桌面应用/operator-channel.test.ts test/桌面应用/shell-escalation.test.ts`（按影响加既有精确文件）；`npm run typecheck`；条件 `node test/桌面应用/e2e/main.mjs` | 桌面窗口 |
| 桌面UI | `node --test "test/桌面UI/**/*.test.ts"`；`npm run typecheck:renderer`；`npm run build:renderer`；真实 Electron 冒烟 | 桌面UI |
| 项目管理 | `node --test "test/项目管理/shared/**/*.test.ts"`；`npm run typecheck` | 项目管理 |
| 跨层集成 | `node --test test/测试/<新集成>.test.ts` | 测试 |
| T3 全量回归 | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')` 或团队计划认可等价 | 测试 |
| 真实 E2E 复跑 | `node test/桌面应用/e2e/main.mjs`（`E2E_PASS`/phase5a 计数若适用） | 测试/桌面窗口 |
| 类型/构建 | `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` | 各角色/测试 |

命令若因仓库实际脚本/runner 不同而调整，须在变更包中记录实际命令、原因与等价性；不得用不可运行的示例命令冒充结果。

### 4.3 原始输出要求

每项检查记录：命令原文、工作目录、环境（Node/npm、OS/Shell）、退出码、测试计数（pass/fail/skip/todo）、失败原文（不截断关键堆栈）、执行时间；跳过项写明原因。只给「全部通过」摘要不算原始证据。截图/JSONL 附生成命令/候选哈希/窗口尺寸/临时 userData 路径。

### 4.4 文件哈希与 diff/status

- 每个候选文件：`git hash-object <path>` + `sha256sum <path>`；新增文件同。
- `git status --short`、`git diff --name-only`、`git diff --cached --name-only`；逐路径核对写集/边界。
- 范围外文件（写集外 `src/`/`app/`/`test/`、`package.json`/锁/构建配置/`release-policy.mjs`、角色卡边界）记录基线/候选哈希对照，证明零改动。
- 测试 diff 用 `git diff -U0` 片段证明无弱化断言。

### 4.5 审计 JSONL 证据

- 提供 `docs/audit/shell-gate.jsonl` 样例（测试/临时 userData 下的真实运行或受控夹具输出；记录路径与 SHA-256），证明：
  - judge 放行：含 `judge`（`by` 含 `judge:<engine>`）；deny 档放行带 `tier:"deny"` + `hardDenyOverride:true`；
  - 客户手批（开关关闭）：无 `judge`/`customerGrant`，`branch` 以 `→a-allow` 结尾，`by` 以 `operator:<id>` 结尾；
  - 客户升级授权放行：含 `customerGrant`（`requestId`/`scope`/`operatorId`）且无 `judge`，`branch` 为 `customer-escalation:allow-once|allow-session`，`by` 以 `customer:` 开头；
  - 申请决定（允许/拒绝/超时）：`event:"escalation-decision"`，含 `conclusion`/`execution`/`conditions` 与稳定 `branch`。
- 新增字段（`necessity`/卡片载荷）不得含凭据；既有 `command`/`argv` 逐字审计行为不变。
- 审计样例必须来自当前候选；缺失或来自另一候选判 `insufficient evidence`。

### 4.6 真实 Electron 场景矩阵（最低覆盖）

| 场景 | 步骤 | 预期观察 | 主要 AC |
| --- | --- | --- | --- |
| S1 | 开关开 → judge 判拒（review/risky 或 script）→ 角色调用 `request_shell_escalation` → 卡显示 → `allow-once` → 原样重试 → 第二次同命令 | 卡内容齐全三选项；回执「仅此一次」；第一次执行、第二次回正常链（若再判拒不可再申请） | AC-04、AC-05、AC-07、AC-28 |
| S2 | `allow-session` → 同命令多次执行 | 本会话内反复执行；改参数/路径不继承 | AC-05、AC-07、AC-28 |
| S3 | `deny` → 再次申请同命令 | 回执「未获客户允许」；不可再申请 | AC-05、AC-08、AC-28 |
| S4 | 超时（用既有超时环境变量缩短） | 默认拒绝（expired）；不可再申请；无第二张卡 | AC-06、AC-28 |
| S5 | 第三次判拒 → `manual/retry-capped` → 角色申请 | 升级卡出现；页脚暂停动作可见；无新增 manual 结果行 | AC-18、AC-21、AC-28 |
| S6 | 判拒结果行点「本次运行暂停自动审批」→ 触发新非白名单 shell 请求；同时触发治理 approval 卡 | 新 shell 请求走客户确认卡；治理卡仍按全局开关代批；偏好文件不变；状态推送 `paused` | AC-20、AC-28 |
| S7 | 重启应用（同一临时 userData） | 暂停清零、回到持久化开关值；徽标消失 | AC-20、AC-28 |
| S8 | 同一次运行内窗口关闭/重开（按 §九.5 程序） | 暂停保留 | AC-20、AC-28 |
| S9 | 执行白名单命令（`npm test`、`npm ci`、`tsc --noEmit`、`node --test`、`npm run lint`）；再执行 `npm install <pkg>` | 白名单：无卡、judge 调用计数=0、审计 `c-allow`；`npm install` 走既有链 | AC-13、AC-14、AC-28 |
| S10 | 触发硬拒/封堵（如长内联/写区外） | 拒绝；无可申请记录；工具回执如实 | AC-02、AC-28 |
| S11 | 关闭全局开关 → 非白名单命令 | 既有客户确认卡；允许后审计无 `judge`/`customerGrant`、`branch` 以 `→a-allow` 结尾、`by` 以 `operator:<id>` 结尾；无升级卡 | AC-17、AC-22、AC-28 |
| S12 | 同一运行导出审计 JSONL 样例 | 三类 + escalation-decision 可区分；字段完整 | AC-22、AC-23、AC-28 |

- 临时 userData、真实 build、记录 Electron 版本/窗口尺寸/候选哈希；截图按 §2.4。
- 多引擎边界：至少默认/一个真实引擎覆盖 S1–S8；其余引擎以共享通道测试 + 审计样例覆盖并记录缺口（团队计划 §10.2 第 5 项）。

### 4.7 证据路径与禁止事项

- 证据路径按团队计划 §6.4：桌面窗口/桌面UI/测试角色各自的 `角色卡/<role>/docs/change/...-evidence/`；`docs/acceptance/` 只放标准与报告；管理记录不混入产品候选。
- 禁止：伪造命令/输出/令牌/锁/审批；改断言保绿；跳过来源；把设计/计划写成已实施；把摘要当原始证据；用其它变更证据替本变更背书；写 `docs/verification/`。

### 4.8 证据失效与复用

- 候选、输入/依赖、契约、IPC/偏好格式、测试夹具、构建配置变化 → 受影响证据失效，只补失效部分；不得跨候选复用。
- 共享文件（`src/model/runtime.ts`、`app/desktop/*`、`app/main.ts`、`preload.cjs`、`src/common/shared/i18n/messages/*`、`src/pipeline/orchestration/*`、`test/桌面应用/*`）按单写者/路径预留；并发写造成的混入按不可复算处理。
- 复用证据必须在变更包中列出「复用理由 + 未失效依据」；验收核对候选哈希一致。

---

## 五、成功、失败与边界情形（判定观察点）

| 情形 | 预期观察 | 判定 |
| --- | --- | --- |
| judge 主动 deny（非 c=deny）+ 角色申请 | 升级卡三选项、命令原文/理由/替代方案/必要性/客户手批声明齐全；无自动弹卡 | 卡内容不符/自动弹卡 → AC-01/AC-04 fail |
| `manual/retry-capped` + 申请 | 可申请；卡出现；页脚暂停可见 | 无记录/不可申请 → AC-01/AC-18 fail |
| 其它 manual / row-failed | 仍拒绝、不弹卡、不可申请 | 弹卡/可申请 → AC-02/AC-18 fail |
| 无答复/超时/通道不可用 | 默认拒绝（expired/unavailable）；消耗申请权；不可再申请 | 放行/再弹卡 → AC-06 fail |
| 客户 deny | 回执「未获客户允许」；本会话不可再申请 | 回执错误/可再申请 → AC-05/AC-08 fail |
| allow-once 后第二次同命令 | 第二次回正常链；再判拒不可申请 | 重复放行 → AC-07 fail |
| allow-session 后派生命令 | 派生命令回正常链 | 继承 → AC-07 fail |
| c=allow 命令在 once 授权之后 | 不消费一次性授权 | 消费 → AC-07 fail |
| 脚本上下文变化 | `stale-context` 拒绝、授权作废、不可再申请 | 放行 → AC-07 fail |
| c=deny / preblock / write-guard / readonly + 陈旧授权 | 仍拒绝；不消费 | 放行 → AC-02 fail |
| 升级卡待答 + 新审批卡 | 审批卡主进程等待；无确认超时启动；不覆盖 | 覆盖/超时/丢结果 → AC-09 fail |
| 审批卡待答 + 升级申请 | 直接拒绝、不排队 | 弹卡/排队 → AC-09 fail |
| 开关关闭 + 非白名单命令 | 既有客户卡逐字不变；无 judge/无升级卡 | 行为变化 → AC-17 fail |
| 开关开 + manual（非 retry-capped） | 拒绝、不弹卡 | 弹卡 → AC-18 fail |
| 暂停后非白名单 shell 请求 | 走客户确认卡 | 仍走 judge/放行 → AC-20 fail |
| 暂停 + 治理 approval 卡 | 治理组仍按全局开关代批 | 一并暂停 → AC-20 fail |
| 暂停 + 重启 | 清零、回到持久化值 | 仍暂停 → AC-20 fail |
| 暂停 + 窗口重开（本方案要求保留的范围） | 保留（按 §九.5 程序） | 丢失 → AC-20 fail/证据不足 |
| 白名单命令（所有角色含内置） | 0 卡、0 judge、审计 c-allow | 调 judge/弹卡 → AC-13 fail |
| `npm install` / 裸 `tsc` / 任意脚本名 / 越界 `node --test` | 仍走既有链 | 被放行 → AC-14 fail |
| 自定义规则集 + 白名单形态 | 仍 c-allow；硬拒仍优先 | 行为未断言/硬拒被覆盖 → AC-16 fail |
| 审计样例 | 三类可区分 + escalation-decision 完整 | 混淆/缺失 → AC-22 fail/insufficient |
| i18n | 中英成对、计数更新、零泄漏 | 缺失/泄漏 → AC-24 fail |
| 全量回归 | 与 B0 分类；新增确定性失败=0、新增 skip=0 | 新增失败/skip → AC-27 fail |
| 真实 Electron 不可用 | 记录环境边界；P1/P7/P8 真实证据缺失 | `insufficient evidence`，不得以单测替代 |
| 发布 overlay 路线 | 本任务 N/A（新小版本）；若改用 overlay 则逐文件列名 | 无依据的 N/A → AC-31 insufficient |

---

## 六、T3 检查面、升档与全量回归

### 6.1 T3 选定检查面

- 受影响角色层测试：门禁引擎（谓词/分类器/写守卫/Service 出口）、编排（registry/闸/审计/回执/委托）、运行时核心（契约/工具/schema）、桌面窗口（presenter/仲裁/暂停/operator-channel）、桌面UI（多动作卡/暂停 UI）、项目管理（i18n）。
- 跨层集成：`test/测试/` 新集成；授权顺序/资格/限流/审计/暂停/白名单 0 judge。
- 真实 UI：真实 Electron 场景矩阵 S1–S12（§4.6）+ 截图/几何/日志/审计 JSONL。
- 构建/类型：`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`。
- 消费者重测：`src/model/runtime.ts`、门禁引擎、编排、shared i18n 的实际消费方按 T3 重测；清单与结果写入变更包。
- 全量回归：见 §6.2。

### 6.2 全量回归口径

- 命令：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')` 或团队计划认可的等价命令；排除 `write-sequencing.test.ts` 的理由记录（历史串行写测试，团队计划 §6.3）。
- 记录：命令/环境/计数（pass/fail/skip/todo）/失败原文/执行时间；与 B0 基线逐类对照。
- 通过要求：新增确定性失败 = 0、新增 skip = 0；既有环境失败（Windows symlink/EPERM 等）不计新增，但不得掩盖新增；任何新增失败未修复 → AC-27 fail。
- 报告首行必须写「全量回归已执行（命令/范围/输出）」或按团队计划认可的等价口径；不得以受影响检查替代。

### 6.3 升档条件与停止条件

- 证据不足/候选不可复算/跨层结论不成立/消费者清单不清 → 停止判定、升档补证（升档不降档）。
- 实施中出现以下任一，停止并回报统筹/沟通，按方案 §13.3 处理：放宽硬拒/确定性封堵；允许 judge 自翻判拒；接入「替我决策」；允许「一键允许所有」或跨角色/跨会话授权；任意 `npm run <script>` 确定性放行或改变 `npm ci` 分档；白名单谓词无法保持单一实现；审计无法区分客户授权与 judge 放行；升级卡无法在既有确认卡机制上安全实现；改写集归属/边界/档位；客户改变闸门 1/2 已确认项。
- 升档后本文件标准不因升档而放宽；标准变更按 §1.2 处理。

---

## 七、与团队计划、写集与发布口径的边界

- 写集以闸门 2 确认的团队计划 §4.1/§4.3 为准；新增文件均在既有目录授权或已确认的精确条目内（含 B-3 `test/桌面应用/shell-escalation.test.ts`）。验收按该写集核对 `git diff --name-only`/`git status --short`；任何角色不得写其他角色路径、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界。
- 边界变更仅限 B-1/B-2/B-3 三项；角色职责描述、id/显示名、权限不变。验收核对边界 diff 与 changelog。
- 发布：按团队计划 §八走新小版本、不用 overlay；本任务不写 `package.json`/构建配置/发布配方/`release-policy.mjs`；发布另行授权与执行。验收通过不授权提交/推送/合并/发布。
- 本文件不改变团队计划确认的参与角色、阶段顺序、档位与证据口径；实施中发现需要变更写集/档位/口径时，按团队计划回报统筹并重开闸门 2，不在验收标准中自行调整。
- 无 task_ops；不伪造机器状态。

---

## 八、版本冻结与报告安排

- 本文件路径固定为 `docs/acceptance/shell-escalation-criteria-v1.md`，版本 **v1**，日期 **2026-10-31**；写盘即冻结，标准先于实施。
- 实施前：沟通确认本文件路径/版本；未确认不派实施（团队计划 V1 出口）。
- 实施后：统筹提交变更包（候选哈希、改动路径、节点、证据链接、T3）；独立验收按本文件判定并**另写** `docs/acceptance/shell-escalation-report-v1.md`；报告首行至少含风险档位、判定依据、选定检查、复用证据、消费者重测结论、全量回归（已执行或 N/A + 理由）。
- 本文件不包含任何候选判定、通过/返工/证据不足结论；不做验收结论的提前预告。
- 标准变更：递增版本、记录理由、交沟通/统筹确认；候选变化不改变标准，只使受影响证据失效并补证。

---

## 九、写标准时发现的待澄清项与只读核对结果（只报告，不修改）

以下为只读核对发现的事实/文档状态/口径问题，供统筹/沟通/策划处理；本文件**未修改**方案、团队计划、沟通记录、角色卡、产品源码或测试，也未自行放宽标准。除明确 N/A 的条目外，这些问题不改变本文件的判定力度；如方案/客户后续澄清与本文件理解不同，按 §1.2 递增版本重判。

1. **文档状态头漂移（方案与团队计划）**：方案 v1.3 文件头与 §2.1 仍写「闸门 1 待客户确认」，团队计划文件头与 §二仍写「闸门 2 未确认、实施授权未给」；沟通记录已含闸门 1/2 确认。判定以 `docs/communication/` 的确认记录与冻结哈希为准，不影响本文件条目；建议策划/统筹在后续版本中校正状态行。
2. **沟通记录版本与哈希引用不混用**：当前沟通记录 65 行 / `0154eeb0…`（含闸门 0/1/2）；方案头引用的 49 行 / `74e0596c…`（闸门 1 前）与团队计划头引用的 57 行 / `51c1a967…`（闸门 2 前）是历史快照。验收引用时以当前文件与对应小节为准，不以旧快照哈希替当前记录，也不把两者混用。
3. **`necessity` 上限口径与超限行为**：方案写「UTF-8 ≤ 1KB / 500 字符」，未明确「1KB 与 500 字符」是并列还是二选一，也未规定超限是拒绝输入还是截断。本文件要求：卡面不得展示超限内容、必要性必须标注「由角色提供，未经验证」；具体超限行为由实现声明并以测试固定（见 AC-04）。验收不自行选定具体口径，也不以未声明行为判 pass。
4. **「客户手批」一词两用**：方案 §1 用「客户手批」指客户升级授权，§7.1/P5 又用「客户手批」指开关关闭时的客户手动批准。本文件按 §7.1 的机读字段区分三类审计（judge 放行/开关关闭手批/升级授权放行，见 AC-22），并在卡片声明处单独核对「客户手批 ≠ judge 放行」；不把两个含义混为一条审计口径。
5. **「窗口重开保留」与「重启清零」的可操作区分（Windows 单窗口）**：方案要求暂停在同一次应用运行内跨窗口重开保留、应用重启清零；但当前应用为单窗口，Windows 上关闭窗口可能直接退出进程，与「重启」难以区分。本文件要求取证时记录平台与操作程序（如 macOS activate 重建窗口或主进程测试夹具）；若平台不能在不重启进程的前提下重开窗口，该子项按环境边界记录，restart-clear 仍必须验证，不得把「只验证重启」当作「窗口重开保留」已通过（见 AC-20）。
6. **卡片仲裁等待上限的具体数值**：方案要求「建议复用确认超时」并保证等待超限 fail-closed；具体值由实现确定并在变更包声明（团队计划 §10.2 第 2 项）。验收按语义判定（等待期间不启动确认超时、超限/中止 ⇒ unavailable、不放行），不按具体数值判定；若实现改变 §7.2 语义，停止并按 §6.3 回报。
7. **暂停与白名单的优先关系未在正文显式说明**：方案 P8 说「暂停后新的 shell 请求逐条走客户确认卡」，P7 又要求白名单形态在所有角色下 c-allow；按判定顺序（preblock → write-guard → classify → 开关/judge），白名单在开关/judge 之前命中，故暂停不影响白名单命令（仍 0 卡）。本文件按此口径明确（AC-17/AC-20），属于消除歧义，不新增要求；若客户意图是暂停也拦截白名单，属方案实质变更，须重开闸门 1。
8. **P12「发布 overlay 逐文件列名」在本任务的适用性**：按闸门 2 确认的团队计划 §八/§九.10，本任务走新小版本、不用 overlay，故该子项在本任务为 N/A（依据写明）；若发布口径改为 overlay 到冻结 tag，则该子项适用，须按方案 §12 逐文件列名并补证。该 N/A 不是放宽「无越权改动」的其它子项（角色写区/id/显示名、治理卡语义、OS 沙箱、目标项目、发布配方零改动仍然适用）。
9. **`recovery-channel.ts` 改/不改与新增 UI 测试命名**：方案/团队计划将其列为条件项（签名变化才最小适配；视图测试命名以实施为准）。验收要求完成报告/变更包明确声明，并以恢复卡既有测试与真实/渲染证据证明无回归；不以「未改文件名」或「改了文件名」判 pass/fail。
10. **真实 E2E 多引擎覆盖边界**：团队计划 §10.2 第 5 项允许至少默认/一个真实引擎，其余以共享通道测试 + 审计样例覆盖；本文件按此作为证据边界，但要求缺口如实记录（AC-28）。P1/P8 的真实应用证据不得全部以共享通道测试替代。
11. **「会话总上限 5 次」的计数口径**：方案未写明哪些工具调用计入 5 次（仅成功受理并弹卡/消耗申请权的申请，还是包括被资格/去重/待答/超限拒绝的调用）。本文件要求实现声明该口径并以测试固定；验收只核对「达上限后不弹卡、回执如实」以及口径与实现/测试一致（AC-03/AC-08）。不自行发明计数规则。
12. **审计样例的来源路径**：团队计划 §6.5 允许「测试/临时 userData 下的真实运行或受控夹具输出」；本文件要求记录路径与 SHA-256，且不得写真实用户目录/仓库根敏感文件、不得伪造。此点为取证规则，不是待客户决定项。
13. **P5 客户手批 `branch` 以 `→a-allow` 结尾的现状核对**：只读核对 `src/common/编排/shell-gate.ts` 的 `BRANCH_A_ALLOW`/`escalateBranch` 与 `operator-channel.ts` 的 `by = operator:<id>` 形状与方案 §7.1 一致；当前代码无 `customerGrant`/`event`/`escalation` 字段（待实施加法）。本文件按方案 §7.1 判定；若实施发现既有路径存在不满足该形状的合法分支，应在完成报告说明并按方案 §13.3 回报，不由验收自行放宽。
14. **Node 环境**：写标准时 `node v24.22.1`/`npm 11.19.1` 可用；实施/取证仍须记录实测版本，且不得以写标准时的版本替代候选运行记录。

---

**本文件状态：标准 v1 已冻结；未判定任何候选；未声称本变更已实施、已测试或已验收。**
