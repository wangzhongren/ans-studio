# 角色直接能力：实施前有界基线

本报告记录新能力开发前的输入和现有检查结果。双类型检查通过；四个指定现有测试文件共 81 项，56 通过、25 失败、0 跳过。失败保留在原始日志中，不表示本轮新能力产生了回归，也不能据此宣称当前产品通过。后续改动需另冻结候选、复测并独立验收。

- 产出角色：固定测试 Q；派发：内置统筹 B0-Q1。按 `ans-governed-construction` 的 test-role/testing/evidence 执行；不切换角色、不修产品。
- 本次仅写本报告、本角色 memo、[原始证据目录](2026-11-05_direct-role-capabilities-evidence/)。未写测试代码、源码、配置或其他角色文档；未启动应用或真实模型。
- 候选：`C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment`；分支 `feat/plan-escalation-card`；HEAD `77945d943ed3c7fdcd9097df2b7bb8d49f8cc5e3`。
- 风险基线 T3（共享契约、角色能力及治理行为）；本节点是实施前有界基线，不是最终 T3 全量验证。统筹已缩为双类型及下表四个文件，完成即交回；全量、流程 E2E、UI E2E 留后续节点。

## 依据与边界

确认输入来自根检出 `C:/Users/51054/Desktop/work/ans-studio`，实际复算：P3.1 `docs/planning/2026-11-05_design_direct-role-capabilities.md` SHA256 `3a0650fc14298dc5a3dfae40d2723386fdd810747692c34ffe9afb2710c6a73c`；T1 `docs/scheduling/2026-11-05_team-plan_direct-role-capabilities.md` SHA256 `caedda31b12f38ed63811d6abfdb7a6cf39447aba614e10a88158b7e52a14f12`；B1 `docs/acceptance/2026-11-05_direct-role-capabilities-criteria-v1.md` SHA256 `24fc2f60bb72779fdf897e6afc890c486b2833a54d4a626ba50ac04f075df161`。统筹转交闸门2及受控无 task_ops 授权，并转交客户“旧任务已停，可以保留现状继续编辑”；本角色不创建调度机器状态。

读取本角色 role-card、boundary.md §1、memo；role-card 中仍称 boundary.yaml/项目管理调度的旧文字不扩权，本轮以技能、实际 boundary.md §1 与统筹更窄派单为准。工程法案实际位于 `角色卡/项目管理/docs/project-rules.md`，不是根 docs/project-rules.md。遵守其二.1–10 的范围、证据与必要日志要求；二.11–12 的独立验收/gate不由本角色代判。根及候选的适用 AGENTS 路径未见实体，T1 已记录祖先核实。

## 原差异与输入身份

写入证据之前采集完整原 status（含 NUL 原件）、HEAD、branch，以及 tracked 的 staged/unstaged `git diff --binary --full-index --no-ext-diff`。原 79 条 changedPaths＝13 tracked 修改＋66 untracked；staged 空。旧差异全保留，不纳入本轮成果、不 stash/reset/clean/删除或提交。详情见 [初始清单](2026-11-05_direct-role-capabilities-evidence/initial-inputs.json)、[原 tracked diff](2026-11-05_direct-role-capabilities-evidence/initial-unstaged.binary.patch)。git 警告仅提示现有 version-change.test.ts 下次 git 触碰的 LF/CRLF 行尾转换；快照按磁盘原字节散列。

1. 原始 177 条清单完整保留，聚合 `c65cf92abe6ce2438fd7603a22f476a068d7b8983cf07617e20a29cca37da96d`。提取器多收命令 glob `test/**/*.test.ts`，作为 missing 记录，未当作实际文件。
2. [修订清单](2026-11-05_direct-role-capabilities-evidence/baseline-inputs.json) 仅排除上述命令 glob，共 176 条；覆盖 T1 全部精确源码/测试、原全部 changedPaths、配置与相关夹具。聚合 `483b94b973eb36d167a89c4f1986b03bdd4a8005c2e37aab2deb3842695bc77d`。7 个本轮计划新测试尚不存在，明确 missing；无既存 tracked 删除项。
3. 为核实实际命令输入稳定性，检查时还散列 `src/app/test` 下全部 ts/tsx/js/mjs/cjs/json/css/html（排除 node_modules/dist/.git）和修订清单，共 995 条输入。[逐命令前后快照](2026-11-05_direct-role-capabilities-evidence/typecheck-before.json)及其余 `*-before.json`/`*-after.json` 均为 `bee8833b0c4e51dfe939cb1a2c831a152aff6ee6cecc4ead7b4ffc467ef6e48c`。六次命令前后逐项一致；不存在把不同候选命令拼为一轮通过的情况。

算法：各文件 SHA256 读取磁盘原字节；路径以相对检出路径、正斜线表示；JS 字符串字典序排序，逐条序列化为 `path<TAB>state<TAB>sha256或-<LF>` 的 UTF-8，再 SHA256。缺失、删除、非文件、敏感排除显式表示，不以空文件代替。未采集密钥、凭据或真实 env 内容。源/配置单独身份和交付前后核对见 `delivery-verification.json`；995 条命令输入身份包含旧文档/memo，之后本角色 memo 的授权附记仅是证据文档 delta。

## 实际执行

环境 Windows x64 / OS 10.0.26300；Node v24.22.1；npm 11.19.1；Git 2.55.0.windows.5。已有 TypeScript 7.0.2、Vite 8.3.4、React 19.3.1、@types/node 26.6.5、yaml 2.9.0、zod 4.6.7；实体路径及包原字节哈希见 [environment.json](2026-11-05_direct-role-capabilities-evidence/environment.json)。package-lock 原字节 SHA256 `d6ee156eeca5e627585ff9f8f44bcccd2c2fcea921b7195b9339ba54388b7685`；未安装或更改依赖。默认 sandbox 临时目录由测试夹具使用；未覆盖 TEMP 或提高权限。

命令均在上述候选检出执行，UTC 2026-11-05 06:33:33–06:33:49（北京时间 14:33:33–14:33:49）。每命令外层上限 90 秒；全部正常退出，无超时、无 test-force-exit。node 测试用 `--test-concurrency=1`，只运行表列单个文件。每行完整参数、精确起止、退出值、计数及 stdout/stderr SHA256 见 [results.json](2026-11-05_direct-role-capabilities-evidence/results.json)，原始日志为各 ID `.stdout.log` / `.stderr.log`；stderr 均原始空文件。

| ID | 实际命令 | exit | tests/pass/fail/skip |
| --- | --- | ---: | --- |
| typecheck | `npm run typecheck` | 0 | 不适用；无类型错误 |
| typecheck-renderer | `npm run typecheck:renderer` | 0 | 不适用；无类型错误 |
| test-1 | `node --test --test-concurrency=1 test/桌面应用/version-change.test.ts` | 1 | 43/23/20/0 |
| test-2 | `node --test --test-concurrency=1 test/桌面应用/decision-service.test.ts` | 0 | 18/18/0/0 |
| test-3 | `node --test --test-concurrency=1 test/编排/trunk-store.test.ts` | 1 | 5/1/4/0 |
| test-4 | `node --test --test-concurrency=1 test/编排/version-change-service.test.ts` | 1 | 15/14/1/0 |

## 失败与后续缺口

- version-change 的 20 红均在 fixture `writePinnedRun` 写 manifest 时，临时文件 rename 至 manifest.json 返回 EPERM，尚未抵达对应预期业务验证。原始失败位置见 [test-1](2026-11-05_direct-role-capabilities-evidence/test-1.stdout.log)。
- trunk-store 三项直接记录 `io/EPERM`（manifest、amendment/journal、history）；并发项实际是 `results.every(result.ok)` 为 false，日志未给出该项每个结果，不把它强判为已证明的同根因。原件见 [test-3](2026-11-05_direct-role-capabilities-evidence/test-3.stdout.log)。
- version-change-service 唯一红为 C2b/C2c 联合冻结追加：临时 versions.lock 文件 hard-link 至 versions.lock 返回 EPERM。原件见 [test-4](2026-11-05_direct-role-capabilities-evidence/test-4.stdout.log)。
- 这些是本环境当前实施前失败；不能仅凭 EPERM 就断言产品无缺陷，亦未证明与历史某次失败完全相同。本节点不修产品、不改测试、不换临时目录、不豁免断言。后续 owner/装配可据原件调查，最终适用验证仍需可靠环境与当前候选证据。
- `build:renderer` 未执行：现有 Vite 配置写 `app/renderer/dist` 且 `emptyOutDir:true`，超本阶段 Q 写集；统筹确认后续 U owner 在其产物范围执行。本节点不重定向构建冒充原构建。
- 按统筹收窄，未跑 trunk/run-pin 等其他套件、全仓回归、直接能力新测试、流程 E2E/UI E2E、应用启动或真实模型。7 个计划新测试缺失是实施前现状，不是声称新功能完成。

本报告仅交付可复算基线与限制。新能力尚未实施/测试/验收；不形成 B2，也不授权提交、推送、合并或发布。

### 各类首条原错误与精确条件

本轮均是在 Windows sandbox、默认 `os.tmpdir()`、未提权的 Node 测试中观察；操作系统/沙箱/文件系统实际何层导致 EPERM 未作环境对照，不能称 Windows 天然不支持。

- test-1 首红（`test/桌面应用/version-change.test.ts:621`）：`Error: fixture: run manifest 写入失败：run manifest 写入失败：EPERM: operation not permitted, rename`，源绝对路径 `C:/Users/51054/AppData/Local/Packages/sandbox.{7b483818-5a98-43b4-9c18-ed84a6782392}/AC/Temp/ans-trunk-service-dvBvJD/.ans/runs/run-20261104-demo-a1b2c3d4/manifest.json.tmp-25060-1793860417745-02a5a9ee`，目标同目录 `manifest.json`；栈至候选绝对路径 `C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment/test/编排/fixtures/trunk-project.ts:194`。其余19项同操作，原件逐项留有各自绝对临时路径。
- test-3 首红（候选 `test/编排/trunk-store.test.ts:112`）：`AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal`；实际 `{code:'io',message:'EPERM',ok:false}`、预期 `{ok:true}`。该测试使用真实 fs-trunk-store；此行结果没有 errno/syscall/失败文件绝对路径，报告不能补造。另两项同类 error 位置为 :185、:215；并发项 :168 只有 `assert.ok(results.every((result) => result.ok))` 实际 false、预期 true，不记录每项失败原因，单列未知根因。
- test-4 首红（候选 `test/编排/version-change-service.test.ts:746`）：`Error: EPERM: operation not permitted, link`，源绝对路径 `C:/Users/51054/AppData/Local/Packages/sandbox.{7b483818-5a98-43b4-9c18-ed84a6782392}/AC/Temp/c2c-joint-freeze-pyfM4f/.ans/state/versions.lock.tmp-22128-1793860429276-1edbd94a-b321-4baa-86fc-10743a8b8ac5`，目标同目录 `versions.lock`；栈至候选绝对路径 `C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment/src/common/门禁引擎/versioned-doc-guard.ts:1387`，`errno:-4048/code:EPERM/syscall:link`。与 test-1 的 rename 不是同一系统调用。

上述操作/断言与路径是实际日志事实；环境归因仍待后续精确对照。本阶段未提权复跑，首红保持不变。

## Q1：脚本 driver 与早期入口准备（后续节点，不是 B0 基线复跑）

本节点已新增 T1 三个测试文件，并修正指定旧 caller 的两处类型诊断。当前候选仍在 O/G/W/U 并行开发，未冻结；本节点交付可续写的真实入口 driver、失败轨迹与明确缺口，不交付完整流程通过或 UI 验收结论。

### 实际改动与职责

- `test/测试/direct-role-capabilities-driver.ts`：通过真实 `createDesktopInterface`、项目枚举与六个真实会话身份启动；只有外部 provider 推理被脚本替换。显式提供四引擎的 providerFactory，只有本测试指定的 pi 标签接脚本，其他引擎全部硬拒；没有 SDK 或真实模型回退。这个 pi 是生产链的引擎标签，**没有真实 Pi 推理**。真实 schema/tool handler、门禁、Pipeline/Service/Provider、客户卡、派发、报告及磁盘事实均保留。
- 起点为 `mkdtemp` 后实际空目录，不写 accepted 配置、D3、三件角色文件、workflow、有效 pin、初始 trunk 或 freeze。六身份只经真实 openSession 打开；只有 chief 接收客户 start，其他角色脚本只在实际内部投递时运行。客户 driver 只答 presenter 实际产生的 requestId，并独立记录 `source:test-customer`。
- `ScriptBudget` 固定 steps/timeout/repeatedFingerprint，支持注入诊断时钟、等待解除者/事件、循环/无人负责等待与无进展诊断；它只记录测试轨迹，不写产品状态。未匹配角色、轮次、工具、引擎、时间或步骤预算直接失败；没有静默跳过或自动扩预算。
- `observeProduction` 从真实任务账本与有效 trunk 只读取事实；等待图/指纹是诊断，不是自造产品状态机。当前仍缺后继场景终态断言，不宣称通用无死锁保证。
- `test/测试/direct-role-capabilities-e2e.test.ts`：包含等待诊断负例、真实六身份/空项目/无脚本回落测试，以及最短新增链的早期用例。后者经实际 chief 写意图入口、客户 intent-confirm、正式 product 派发、product 写意图、submit_report；以真实 R9 查询作为后继首建准备点。
- `test/测试/trunk-stable-write-integration.test.ts::snapshotOfManifest`：仅新增 `assert.ok(manifest.artifacts.workflow, ...)`，证明这个执行夹具真的有 workflow 后再取 path/hash；没有 cast、虚构 ref、默认值或放松既有安全断言。[精确 diff](2026-11-05_direct-role-capabilities-evidence/q1-old-caller.diff)。
- `test/测试/direct-role-capabilities-ui.mjs`：仅准备消费真实已启动页面的 probe；切换六角色，核 chief 顶部唯一委托框、非 chief 文本/附件禁用、stop/任务/历史入口保留，并保存真实页面截图/hash。源文件语法检查不是 UI 运行；D3/验收/阻塞/来源/内部派发与 stop 真正结算还须宿主实际场景补证。未启动 Electron、未注入虚假 IPC 状态，未运行 UI。

`SCENARIO_READINESS` 显式记录后续缺口：null-CAS、真实 D3 零文件写卡/激活、改 live 后重新创建旧 run 会话、三 run 模式/创建者收口、提交故障/恢复/supersede、环境修复、主 chief 忙时独立 chief、revision/旧真实 @预设/退修 Promise、四任务类型及真实 UI。这些条目**未覆盖，不是 skip/pass 占位测试**。

### 实际检查与首个入口观察

本节点继续使用 B0 记录的 Node v24.22.1 / npm 11.19.1 / Windows；不安装依赖、不改环境、不改产品源码。早期检查的完整 transcript 见证据目录 `q1-early-01.log`、`q1-early-02.log`、`q1-early-03-sandbox.log`；它们是控制台合并文本转存。精确提权环境对照保留分开的 stdout/stderr 与 meta：`q1-early-04-elevated.*`、`q1-early-05-elevated.*`。提权由本阶段派单授权交自动审批，未改脚本断言/安全校验来求绿。

1. 自身首轮错误分别是 provider 必需展示 profile 未注册、测试误把 send 受理当轮次完成、误写报告工具名 report_handback（实际是 submit_report）、freeze 输入字段类型误读。均在 Q 文件内修正；旧输出保留并归夹具错误，不归产品。最早一次 strip-only 参数属性/错误导入路径诊断仅留工具会话输出，没有原始文件转存，不补造原件；后续文件日志从 `q1-early-01` 起完整保留。
2. 修正后 sandbox 运行 3 项：2 pass、1 fail。正常链在 `write_file` rename 失败：`EPERM`，目标位于 sandbox 临时目录 `.../AC/Temp/q-direct-empty-75METu/docs/intents/direct-e2e.md`。原件 `q1-early-03-sandbox.log`。这不是业务拒绝，也不先验称 Windows 天然失败。
3. 同脚本经精确提权对照，临时根为 `C:/Users/51054/AppData/Local/Temp/q-direct-empty-...`，rename 写入成功，真实 intent-confirm 请求 `req-...` 经客户 driver 合法 confirm，真实 chief→product 任务持创建者/任务号/实际 draft run，product write_file 与 submit_report 成功。`q1-early-05-elevated.stdout.log` 的 `Q1_EARLY_CHAIN` 保存实际工具、请求/答复、任务账本与路径。3 项仍为 **2 pass / 1 fail**：`freeze.entryOf("docs/product/direct-e2e-intent-v1.md",1)` 未返回 intent-confirmed R9，trunk 仍 missing。
4. 此用例当前顺序是**先确认 chief 意图入口，再派 product 生成产品文档**，没有证明这是产品意图冻结的最终合法顺序。因此该红是首建准备/测试协议缺口，已交统筹询问 O/W 当前合法实际入口和必要顺序；不直接判为生产缺陷，不由 Q 直接 freeze 过关。此早期执行没有单独前后全输入 manifest，且其他 source writer 在途，只作中间可复现观察，不能纳作最终验收稳定候选证据。

### 当前检出复核与停点

最后的 [q1-preparation-checks.json](2026-11-05_direct-role-capabilities-evidence/q1-preparation-checks.json) 记录精确命令、时间、stdout/stderr 原字节 SHA256、退出码和每命令前后输入。检查时约 08:54:24–08:54:27 UTC（16:54 北京时间）：

| 检查 | 实际结果 |
| --- | --- |
| `npm run typecheck` | exit 1，仅 `src/pipeline/orchestration/run-role.ts:85/:174` 重复 createTrunkService 导入 TS2300 两条；Q 四个源测文件无诊断，指定旧 caller 的两条 TS 已消除 |
| `node --test --test-concurrency=1 --test-name-pattern=Q driver:\|Q six-identity test/测试/direct-role-capabilities-e2e.test.ts` | exit 1，尚未执行用例：同一生产重复 import 导致 Node SyntaxError；不能套用此前两项 pass |
| `node --check test/测试/direct-role-capabilities-ui.mjs` | exit 0，仅语法通过，UI 未运行 |

这三命令前后各自输入相同，记录算法为 JSON.stringify 有序 `[{path,sha256}]` 的 UTF-8 SHA256，聚合 `932ea7dcb5c1ef2bc2ad68ef6b7b2eab9b0b13044e216ed98475504c8708e4fd`；该算法不同 B0 TSV，清楚分开。相较此前早期运行已经有生产变化，不把不同候选的 pass 拼接。重复 import 已告统筹由 O owner 修正；Q 不改 src，不长驻等待。

四个 Q 代码文件的交付原字节身份见 [q1-delivery.json](2026-11-05_direct-role-capabilities-evidence/q1-delivery.json)，聚合 `835569787fbc4ce064f80cbc8421387bfc25e03c896d9a8fcc1543055811a45b`；原 B0 清单、79 旧差异及全部失败继续保全。接续时先检查生产语法已恢复、取得真实意图→冻结入口协议、冻结相应实际输入，再续首建/D3等场景。没有全量回归、完整确定性 E2E、UI 通过、真实模型、独立验收或交付完成结论。
