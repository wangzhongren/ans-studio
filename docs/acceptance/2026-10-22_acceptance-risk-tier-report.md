风险档位：T3｜判定依据：治理文档变更（治理/权限变更即使只改文档也非 T0，依据 references/testing.md「Risk-Based Verification and Change Packages」）｜选定检查：工程法案逐条核对、git diff / diff --name-only / status、候选与基线哈希复算、报告格式核对｜复用证据：无（首次判定）｜全量回归：N/A（本任务无代码/测试面，不虚构测试）

# 独立验收报告：验收先判风险档位（全项目工程法案第 9 条）

- 任务 ID：`2026-10-22-acceptance-risk-tier`
- 阶段：N4 独立验收判定
- 标准版本：`2026-10-22 v1`（实施前冻结）
- 标准文件：`docs/acceptance/2026-10-22_acceptance-risk-tier-criteria.md`；SHA-256：`54c65f3d8bb5f184d6eb74a671627d6c438cb8031d49e66bd1d988da7b373b1d`
- 验收基线：`docs/communication/2026-10-22_intent_acceptance-risk-tier.md`（闸门 0 已确认，2026-10-22）；本轮无闸门 1 策划方案，客户已选择「保持现状」，不补闸门 1
- 变更包来源：`docs/scheduling/2026-10-22-acceptance-risk-tier.md` §10.6
- 结论：**通过**（A1–A9 全部 pass）
- 判定时间：2026-10-22（本地）；环境：Windows / MINGW64_NT-10.0-26300，Git Bash，`git version 2.55.0.windows.5`，`core.autocrlf=true`，cwd `/c/Users/51054/Desktop/work/ans-studio`

## 一、候选与基线

| 项 | 值 |
| --- | --- |
| 候选文件 | `角色卡/项目管理/docs/project-rules.md` |
| 候选 `git hash-object`（Git blob SHA-1，LF） | `fdb738bb01035b9a270aaf5cbbcb89c6d1da2484` |
| 候选工作区 `sha256sum`（CRLF） | `fdc5055906bcbb0f5d57d68cdaae05c4a27af1f13c7225374fbeda1a06ab3d9f` |
| 候选 LF 归一 SHA-256 | `dd27c0a81f577fc4a75ba63d295339bcab7ea7870646453e796ee6a1bef6fd29` |
| 基线 blob（HEAD 中版本） | `6a0511031abe2658c3b0e031a6c6594d62dc9330` |
| 基线工作区 SHA-256（写标准时实测，CRLF） | `e8d452bd0700fa4f11379d4bbb9494f3ef050cdf53484c7ad20a79bbe14ec22f` |
| 基线 LF 归一 SHA-256 | `9fc72056b460becb4e11426ff9a783acc79e2fda4ca8d9bbce9292f6708057ad` |
| HEAD | `713260ed7ae810a7cec5bed92de2a11f132c9f23`（未变） |
| 工作树 | ` M 角色卡/项目管理/docs/project-rules.md` + `?? docs/`；`git diff --cached --name-only` 空 |

候选与基线的两项算法（blob SHA-1 / 文件 SHA-256）均不相同，证明候选确实发生了内容变化；候选哈希与变更包一致。候选已冻结：本报告只对上述候选哈希有效，文件内容一旦变化即需重新判定。

## 二、验收表

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | §二「已确认要求」在第 8 条之后新增第 9 条，编号连续（1–9），第 9 条主题为「验收先判风险档位」；不改第 1–8 条编号与内容。 | 候选原文摘录与行号（含第 8、9 条相邻关系）；完整 diff hunk。 | `角色卡/项目管理/docs/project-rules.md` L38（§二标题）、L47（第 8 条）、L48（第 9 条）；`git diff` hunk `@@ -45,6 +45,7 @@`；候选 blob `fdb738bb...` | 候选 `fdb738bb01035b9a270aaf5cbbcb89c6d1da2484` / `fdc5055906bcbb0f5d57d68cdaae05c4a27af1f13c7225374fbeda1a06ab3d9f` | 项目管理 | 第 9 条紧接第 8 条，编号 1–9 连续；§二标题未变；第 1–8 条未被重排或改写。 | **pass** |
| A2 | 第 9 条完整覆盖六项要点（§4.3.1），无遗漏、无弱化。 | 逐项引用候选原文；与建议正文的差异清单及等价性说明（如有差异）。 | L48 第 9 条全文；本报告 §三六项逐项核对；`git diff` 新增行；与计划 §5.3 建议正文比对差异为 0。 | 同上 | 项目管理（原文）／独立验收（核对） | 六项要点全部具备，无弱化；与建议正文逐字一致，差异清单为空。 | **pass** |
| A3 | 档位定义以 `references/testing.md` 的「Risk-Based Verification and Change Packages」为唯一口径；不自创档位；治理或权限变更明确为 T3，不得压成 T0。 | 候选原文；`testing.md` T3 行与「Governance or permission changes are T3, never T0...」对照。 | L48：「档位定义以技能 `references/testing.md` 的「Risk-Based Verification and Change Packages」为唯一口径」「不得为省检查而压低档位」「全量回归只在 T3（发布、共享抽象、治理或权限变更）或证据不足时执行」；`references/testing.md` L13–L18、L23。 | 同上 | 项目管理（原文）／独立验收（对照） | 唯一口径引用明确；治理/权限变更列入 T3；有不得压低档位条款；未自创 T4 或其他档位。 | **pass** |
| A4 | 「变更记录」末尾追加 2026-10-22 条目，注明客户原话来源与只改工程法案。 | 候选原文与行号；客户原话来源路径；完整 diff hunk。 | L87 变更记录 2026-10-22 条目；`git diff` hunk `@@ -83,3 +84,4 @@`；来源 `docs/communication/2026-10-22_intent_acceptance-risk-tier.md` 存在且可读。 | 同上 | 项目管理 | 条目追加在变更记录末尾；含日期、客户原话、只改本工程法案、未改产品代码/测试/角色卡/边界、未改变写权、来源路径。 | **pass** |
| A5 | 只改工程法案：`git diff --name-only` 仅该文件；`git status --short` 除该文件自身已跟踪修改外无其他已跟踪变化；未跟踪项仅 `docs/` 管理记录；无代码/测试/配置/角色卡/边界/`.ans` 变化。 | 原始命令输出（含 HEAD、时间、cwd）；验收复跑。 | 本报告 §四原始输出：`git status --short` = ` M "角色卡/项目管理/docs/project-rules.md"` + `?? docs/`；`git diff --name-only` 仅该文件；`git diff --cached --name-only` 空；`.ans` status/diff 空；`git diff --stat` = 1 file changed, 2 insertions(+)。 | 同上 | 项目管理（原始）／独立验收（复核） | 除授权文件自身外无其他已跟踪变化；未跟踪项仅 `docs/`；无代码/测试/配置/角色卡/边界/`.ans` 变化。 | **pass** |
| A6 | 候选 `git hash-object` 与 `sha256sum` 可复算，并与基线 `6a051103...` / `e8d452...` 对照；候选不同于基线。 | 实施者原始哈希输出；验收复算输出；基线核对命令输出。 | 本报告 §四：候选 blob `fdb738bb...`、候选 CRLF SHA-256 `fdc50559...`、候选 LF SHA-256 `dd27c0a8...`；基线 blob `6a051103...`、基线 CRLF SHA-256 `e8d452...`、基线 LF SHA-256 `9fc72056...`。 | 同上 | 项目管理（原始）／独立验收（复算） | 两套算法均可复算并与变更包一致；候选与基线在 blob、CRLF、LF 三种表示下均不同；CRLF/LF 口径见 §五。 | **pass** |
| A7 | 验收报告首行含风险档位、判定依据、选定检查、复用证据、全量回归理由；本任务写 T3 与全量回归 N/A（无代码/测试面），不虚构测试；第 9 条本身含该首行要求。 | 报告首行原文；第 9 条原文；标准版本链接。 | 本报告第 1 行；L48「验收报告首行必须写明：风险档位、判定依据、选定检查、复用证据、全量回归理由（未执行全量回归时写明 N/A 理由）」；标准 `2026-10-22 v1`。 | 同上 | 独立验收（报告）／项目管理（规则原文） | 报告首行五项齐全；全量回归 N/A 理由写明「无代码/测试面，不虚构测试」；第 9 条含首行要求。 | **pass** |
| A8 | 第 9 条明文「本规则不扩张任何角色的文件写权」；本任务未改 boundary/role-card/角色定义；法案既有不扩张声明未被删除或弱化。 | 候选原文；diff/status；既有声明原文。 | L48 末尾「本规则不扩张任何角色的文件写权」；L5 既有「本文件不扩张任何角色的文件权限」保留；`git diff --name-only` 仅工程法案，无 boundary/role-card。 | 同上 | 项目管理 | 第 9 条明文不扩张写权；既有不扩张声明完整保留；未改任何 boundary/role-card/角色定义。 | **pass** |
| A9 | 工程法案 diff 仅两处：§二第 9 条新增与「变更记录」2026-10-22 条目追加；不重排/改写既有条目、标题、草稿说明、§一/§三/§四，不改变草稿状态；无其他文件变化。 | 完整 `git diff`；diff stat；行号化摘录。 | 本报告 §四完整 `git diff`：2 个 hunk、2 insertions、0 deletions；L1「# 全项目工程法案（草稿）」与 L3 草稿说明未变；§一/§三/§四不在 diff 中。 | 同上 | 项目管理（diff）／独立验收（复核） | 仅两处追加；无重排/改写；草稿状态未变；无其他文件变化。 | **pass** |

## 三、第 9 条六项要点逐项核对

| 要点 | 候选原文位置与内容 | 结果 |
| --- | --- | --- |
| 1. 统筹标档 | L48：「统筹调度必须在交给独立验收的变更包中标注风险档位 **T0–T3**，档位定义以技能 `references/testing.md` 的「Risk-Based Verification and Change Packages」为唯一口径，不得为省检查而压低档位。」 | 具备 |
| 2. 验收先核对并记录 | L48：「**独立验收必须先核对档位与改动是否相符并记录，再决定证据与检查**。」 | 具备 |
| 3. 不符处理 | L48：「档位与改动不符时，退回统筹，或按更高档位补证。」 | 具备 |
| 4. 检查强度 | L48：「**T0 只查文档；T1 只跑受影响单测；T2 补受影响集成检查；全量回归只在 T3（发布、共享抽象、治理或权限变更）或证据不足时执行**；其余档位只做受影响检查，并复用未受影响且仍有效的证据。」 | 具备 |
| 5. 报告首行 | L48：「验收报告首行必须写明：**风险档位、判定依据、选定检查、复用证据、全量回归理由**（未执行全量回归时写明 N/A 理由）。」 | 具备 |
| 6. 不扩张写权 | L48：「**本规则不扩张任何角色的文件写权。**」 | 具备 |

## 四、证据原始输出（验收在判定时只读复跑）

```text
$ git rev-parse HEAD
713260ed7ae810a7cec5bed92de2a11f132c9f23

$ git rev-parse HEAD:"角色卡/项目管理/docs/project-rules.md"
6a0511031abe2658c3b0e031a6c6594d62dc9330

$ git hash-object -- "角色卡/项目管理/docs/project-rules.md"
fdb738bb01035b9a270aaf5cbbcb89c6d1da2484

$ sha256sum "角色卡/项目管理/docs/project-rules.md"
fdc5055906bcbb0f5d57d68cdaae05c4a27af1f13c7225374fbeda1a06ab3d9f *角色卡/项目管理/docs/project-rules.md

$ git cat-file blob 6a0511031abe2658c3b0e031a6c6594d62dc9330 | sha256sum
9fc72056b460becb4e11426ff9a783acc79e2fda4ca8d9bbce9292f6708057ad *-

$ git cat-file blob 6a0511031abe2658c3b0e031a6c6594d62dc9330 | sed 's/$/\r/' | sha256sum
e8d452bd0700fa4f11379d4bbb9494f3ef050cdf53484c7ad20a79bbe14ec22f *-

$ sed 's/\r$//' "角色卡/项目管理/docs/project-rules.md" | sha256sum
dd27c0a81f577fc4a75ba63d295339bcab7ea7870646453e796ee6a1bef6fd29 *-

$ git status --short
 M "\350\247\222\350\211\262\345\215\241/\351\241\271\347\233\256\347\256\241\347\220\206/docs/project-rules.md"
?? docs/

$ git diff --name-only
"\350\247\222\350\211\262\345\215\241/\351\241\271\347\233\256\347\256\241\347\220\206/docs/project-rules.md"

$ git diff --cached --name-only
（空）

$ git diff --stat
 .../docs/project-rules.md"                                              | 2 ++
 1 file changed, 2 insertions(+)

$ git diff --numstat
2       0       "\350\247\222\350\211\262\345\215\241/\351\241\271\347\233\256\347\256\241\347\220\206/docs/project-rules.md"

$ git status --short -- .ans
（空）

$ git diff --name-only -- .ans
（空）

$ git diff --check -- "角色卡/项目管理/docs/project-rules.md"
（无输出，无空白错误）

$ git --version
git version 2.55.0.windows.5

$ git config --get core.autocrlf
true

$ uname -s
MINGW64_NT-10.0-26300
```

完整 diff（两处 hunk，均为追加）：

```diff
diff --git "a/角色卡/项目管理/docs/project-rules.md" "b/角色卡/项目管理/docs/project-rules.md"
index 6a05110..fdb738b 100644
--- "a/角色卡/项目管理/docs/project-rules.md"
+++ "b/角色卡/项目管理/docs/project-rules.md"
@@ -45,6 +45,7 @@
 6. **不得把失败伪装成成功**：不得为让测试通过而删测试、放松断言、放宽权限或隐藏错误。
 7. **业务代码需在客户确认文档并授意实施后再改**：设计文档先写拟采用方案。
 8. **文档区分"未实施 / 未测试 / 未部署"**三个状态，不把计划写成结果；未确认内容标为候选。
+9. **验收先判风险档位**：统筹调度必须在交给独立验收的变更包中标注风险档位 **T0–T3**，档位定义以技能 `references/testing.md` 的「Risk-Based Verification and Change Packages」为唯一口径，不得为省检查而压低档位。**独立验收必须先核对档位与改动是否相符并记录，再决定证据与检查**；档位与改动不符时，退回统筹，或按更高档位补证。检查强度：**T0 只查文档；T1 只跑受影响单测；T2 补受影响集成检查；全量回归只在 T3（发布、共享抽象、治理或权限变更）或证据不足时执行**；其余档位只做受影响检查，并复用未受影响且仍有效的证据。验收报告首行必须写明：**风险档位、判定依据、选定检查、复用证据、全量回归理由**（未执行全量回归时写明 N/A 理由）。**本规则不扩张任何角色的文件写权。**

 ## 三、方案/待确认（未生效）
 
@@ -83,3 +84,4 @@
 - 2026-10-11：**抽共享原子写原语后核对 §一.5**——补记共享组件 `atomic-write.ts`（跨角色共享**原子写**原语；对 rename 的 **Windows 瞬时 `EPERM`** 做**有界重试**；抽自 `env-file.ts` 与 **Pi适配器** `fs-write.ts` 两处同源写法，消除该处 §6 镜像），并把 §一.5「现有共享组件」清单补为现行**六个**（`config-loader` / `path-primitives` / `runtime-shared` / `argv-primitives` / `env-file` / `atomic-write`）。**atomic-write 消费方**：**`env-file.ts`**（`atomicWriteText` 已改委托 `atomicWrite`，签名/行为不变）与 **Pi适配器**（`fs-write.ts::atomicWriteFile` **待改导入**为 `atomicWrite(abs, data, { mode: 0o600 })`），完成前处**过渡性「两处并存窗口」**（两处 rename-重试语义**逐字同源**、行为不分叉）。依据：`角色卡/Pi适配器/changelog.md`（根因与量化证据）；登记见 `docs/architecture/shared-components.md` 组件 6。来源：本项目任务（pm：抽共享原子写原语）。
 - 2026-10-14：**角色拆分后核对 §一.5 消费方名单**——原「桌面应用」拆分为 **桌面UI**（渲染前端）/ **桌面窗口**（主进程、preload、桌面会话装配），客户确认名称。共享组件（`config-loader`、`argv-primitives`、`env-file`、`atomic-write` 等）的 app 侧消费方现为**桌面窗口**；§一.5 中三处「桌面应用」角色名已同步改为「桌面窗口」，引用文件与模块不变。依据：客户确认的角色拆分（`角色卡/桌面应用/归档说明.md`、`角色卡/桌面UI/`、`角色卡/桌面窗口/`）。
 - 2026-10-21：依 [UI 平台化评审](design/2026-10-21_review_ui-platform-round.md) 在 §三 记录**候选约束**：渲染层 Vite 构建归属（根 `vite.config.ts` 归装配，须先由 Team Formation 更新边界）、tsconfig 拆分与 `typecheck:renderer` 归属、渲染库放 `devDependencies`、依赖宪法（PM 批准、装配落盘、精确锁版）、markdown-it 改 npm 精确版本并删 vendor、测试机制（纯逻辑单测 + Electron e2e）。同条如实记录：v1.4.0 冻结发布配方（`SOURCE_SHA=83eec7e` + overlay 白名单）不接受 `app/` 变更，发布流水线接入属下一次冻结源/新发布轮。边界更新与实施完成前均为候选，不写成现状。
+- 2026-10-22：依客户原话「把验收必须先判断风险档位的口径固化到项目规则或验收角色卡」，在 §二「已确认要求」新增第 9 条「验收先判风险档位」；只改本工程法案，未改产品代码、测试、角色卡、边界，未改变任何角色写权。来源：`docs/communication/2026-10-22_intent_acceptance-risk-tier.md`（闸门 0 已确认；角色指派见 `docs/scheduling/2026-10-22-acceptance-risk-tier.md`）。
```

## 五、CRLF/LF 口径记录

仓库 `core.autocrlf=true`：工作区为 CRLF，Git blob 为 LF。两套 SHA-256 不能跨表示直接互比；本报告按「同表示对照」判定 A6：

| 表示 | 基线 | 候选 | 对照结果 |
| --- | --- | --- | --- |
| Git blob（LF）`git hash-object` | `6a0511031abe2658c3b0e031a6c6594d62dc9330` | `fdb738bb01035b9a270aaf5cbbcb89c6d1da2484` | 可直比，不同 |
| Git blob（LF）SHA-256 | `9fc72056b460becb4e11426ff9a783acc79e2fda4ca8d9bbce9292f6708057ad` | `dd27c0a81f577fc4a75ba63d295339bcab7ea7870646453e796ee6a1bef6fd29` | 可直比，不同 |
| 工作区（CRLF）SHA-256 | `e8d452bd0700fa4f11379d4bbb9494f3ef050cdf53484c7ad20a79bbe14ec22f` | `fdc5055906bcbb0f5d57d68cdaae05c4a27af1f13c7225374fbeda1a06ab3d9f` | 可直比，不同 |

说明：

- `git cat-file blob <基线 blob> | sha256sum` 直接得到 `9fc72056...`，不是工作区基线的 `e8d452...`；这是 LF blob 与 CRLF 工作区的表示差异，不是候选不一致。
- 用 `git cat-file blob 6a051103... | sed 's/$/\r/' | sha256sum` 可还原工作区基线 CRLF SHA-256 = `e8d452...`；用 `sed 's/\r$//' 候选文件 | sha256sum` 可得到候选 LF 归一 SHA-256 = `dd27c0a8...`。两者分别与变更包记录一致。
- 本口径不改变候选、标准或判定实质，仅记录检查方法；后续如再复算，应继续使用同表示对照。

## 六、未解决问题与说明

- **未解决问题：无。**
- `git status --short` / `git diff --name-only` 中文件路径显示为 `"\350\247\222..."` 形式，是 Git `core.quotePath` 对非 ASCII 路径的转义显示；它就是唯一的授权文件 `角色卡/项目管理/docs/project-rules.md`，不是额外文件。
- 沟通已确认 A5 口径：除授权文件自身外不得有其他已跟踪变化，未跟踪项仅限 `docs/`；本报告按该口径执行。本轮无闸门 1 策划方案，客户选择「保持现状」，验收基线为闸门 0 意图记录。
- 第 9 条与统筹计划 §5.3 建议正文逐字一致，差异清单为空；A2 的六项逐项核对见 §三。
- 本报告首行同时满足第 9 条对「验收报告首行」的要求（A7）；A7 由验收自检，没有第二个验收角色复核。
- 本任务无代码/测试面，未运行也未虚构任何代码测试或全量回归；全量回归 N/A 的理由已写在首行。
- 本报告只对候选 `fdb738bb01035b9a270aaf5cbbcb89c6d1da2484` / `fdc5055906bcbb0f5d57d68cdaae05c4a27af1f13c7225374fbeda1a06ab3d9f` 有效；候选文件内容一旦变化，本报告过期，需按标准 v1 重新判定受影响部分。

## 七、结论与效力

**总体结论：通过。** A1–A9 全部 pass；候选哈希与变更包一致；仅授权文件发生两处追加；治理变更按 T3 记录；全量回归因无代码/测试面记为 N/A，未虚构测试。

验收通过只表示当前候选满足标准 v1；**不授权提交、推送、合并、发布或任何对外操作**。验收本次只写 `docs/acceptance/` 下的标准与报告，未修改工程法案、标准、角色卡、边界、产品代码或测试；未提交 Git。

统筹可按匹配当前候选的通过结论放行 N4，并由沟通执行 N5 回报客户。
