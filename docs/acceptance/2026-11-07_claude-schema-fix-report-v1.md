# Claude schema 兼容窄修复（T1）：B1 标准与 B2 独立验收报告 v1

- 日期：2026-11-07；固定身份：ANS 独立验收唯一主上下文（本报告只做验收判断，不切换角色、不实施、不派发）。
- 判定范围：**仅本窄修复**（Claude 适配器条件 schema 转换）。不判六角色完整闭环、不判产品收口、不改变此前 closeout B2 报告（该报告绑定 935 工作树聚合 `b075334d…`，不覆盖本修复）。
- 本报告不授权提交、推送、合并、发布。

## 0. 来源与 B1 形成说明

本 B1 只从**实施前既有记录**与既有契约推出，不新增需求：

| 来源 | 路径/哈希 | 本 B1 采用的内容 |
| --- | --- | --- |
| 客户授权 | `docs/communication/2026-11-07_authorization_claude-schema-fix.md`，sha256 `f76fd1637caf77816940b5c6e800037b290368cbdbd5b19c319593f221e32209` | 客户原话「A」=「修，并重跑真实测试」；修复真实 Claude 的 `unsupported JSON Schema keyword if` 缺陷；完成标准=修复+覆盖条件语义的定向测试+受影响套件/typecheck+按风险档独立验收+真实 Claude 重跑并如实报告（失败/阻塞原样保留）；不得放宽断言/加 skip/删测试；不含提交/推送/合并/发布 |
| 修复路由 | `docs/scheduling/2026-11-07_fix-routing_claude-schema-if.md`，sha256 `23bb766d7bcb81294454ce6ff57e5bbe39a55f986bae443a28ce4fa0c4142b41` | F1–F9（工作类型=修复、所有者=Claude适配器、T1、适配器侧转换、不改公共 schema）；§派发范围与边界；§修复与验证要求 2–6（语义等价、实际使用点、未知关键字仍拒绝、测试/命令/证据要求、真实重跑交验收） |
| 缺陷事实 | `C:\Users\51054\Desktop\work\ans-dogfood-run-2026-11-07\probe-1\dogfood-probe.jsonl` `5c0f0f25…`、`probe-2\drive-log.jsonl` `c8345bd2…`、诊断 `8ed236bb…` | 真实 Claude 首回合 `MODEL_REQUEST_FAILED`：`tool input.target.allOf: unsupported JSON Schema keyword if`；可观察、可复现（两份独立 probe） |
| 既有契约 | `src/provider/runtime/schema.ts` 条件 schema 使用点（git OID / dispatch reviewOid+resumeController / decide disposition / submit_version_change）；`src/common/claude-adapter/schema.ts` 既有"拒绝未知约束、不静默丢弃"设计 | 条件约束是既有业务契约，适配器须如实转换；不是新增行为 |
| 变更包 v4 | `docs/scheduling/2026-11-07_change-package_direct-role-capabilities-closeout.md`，sha256 `0c316d48a0ddcbb14850b0ec94b8facec9abee209feaabe8aef377689cb8de60` | §10 修复、§10.4 真实重跑、§11 新阻塞（仅作候选/证据索引，不作为验收结论） |

> 时间性说明：B1 条目由上述**先于本修复**的授权/路由记录与既有契约逐条映射而来（路由记录时间 11:10，早于源码改动 11:17）；本轮任务要求"自拟 B1 时写明来源"，故在本报告中先列 B1 再判 B2。修复记录文件的最终 mtime 晚于代码/测试，是因为测试后补写证据链接；"记录先于代码"（F7）属路由/流程核实项，本 B2 不据此改判语义，只在 §6 如实披露。

## 1. B1 标准（冻结用于本 B2）

风险档位：**T1**（单一角色内部实现；不改公共契约/共享抽象/数据模型/跨角色接口）。

| ID | 要求（可观察结果） | 来源 |
| --- | --- | --- |
| C01 | **条件语义等价**：`if/then/else/not/contains` 在任意深度被真实转换与执行；`if` 命中执行 `then`、未命中执行 `else`；`not` 取反；`contains` 按数组语义；覆盖实际使用点（git OID 按 `objectFormat`、dispatch `reviewOid`/`resumeController`、decide `disposition`、submit_version_change 直接提交条件）；不得放宽或静默丢弃约束；无条件的旧 schema 行为不变。 | 授权"修复缺陷"；路由 §修复与验证要求 2；缺陷记录 §2/§5（预期行为来自既有公共工具 schema 与适配器设计） |
| C02 | **未知关键字仍拒绝**：适配器未支持的 JSON Schema 关键字在任何深度（含条件片段内）仍抛错，不静默丢弃；`contains` 只在条件片段内受支持；非法条件片段（空 anyOf、非对象 then、字符串 not 等）仍被拒绝。 | 路由 §修复与验证要求 3；缺陷记录 §4（既有设计意图） |
| C03 | **转换后校验一致**：真实 `describeTool` 工具 schema 经 `toClaudeSchema` 转换后，Zod/Claude 侧正反例与原始 JSON Schema 条件语义一致；无条件 schema 与 `z.fromJSONSchema` 行为一致；公共工具 schema 不被改写。 | 路由要求 2/3；缺陷记录 §5；任务判定范围 1 |
| C04 | **范围与归属**：仅 Claude适配器 Section 1 文件被改；不改 `src/provider/runtime/schema.ts`、共享契约/模型/公共入口、其他角色/边界/治理/验收标准；不新增 Section 1 外文件。 | 授权约束；路由 F3/F4/F5/F8、§派发范围与边界 |
| C05 | **测试完整性**：新增/修改定向测试覆盖条件正反例与未知关键字拒绝；旧断言按新语义改写而不是删除/skip/放宽；受影响套件与 typecheck 实际通过；记录命令/环境/退出/计数/日志 hash。 | 授权约束；路由要求 3/4 |
| C06 | **真实运行缺陷消失**：修复后真实 Claude 会话可建立并执行真实回合/工具调用；probe-1/2 的 `unsupported JSON Schema keyword if` 不再复现；失败/阻塞原样保留，不冒充闭环完成。 | 授权完成标准；路由要求 6；缺陷记录 §1 |
| C07 | **边界与如实报告**：新暴露的下游阻塞（非本修复范围）如实记录、不当作本修复失败或通过；费用控制中止（`turn.abort.forced`）如实记录；未提交/推送/合并/发布。 | 授权；路由 §回退条件；任务判定范围 5 |

## 2. 候选身份复核（独立重算）

| 项 | 声称 | 我的复算 | 结果 |
| --- | --- | --- | --- |
| HEAD | `e71501c` 不变 | `git rev-parse HEAD` = `e71501cae7fc563b63c63944d45d0d3114ec18a5` | 一致 |
| 改动范围 | 3 文件（2 改 + 1 新） | `git status --porcelain -- src app test` 恰为 `M src/common/claude-adapter/schema.ts`、`M test/claude-adapter/session.test.ts`、`?? test/claude-adapter/schema.test.ts` | 一致 |
| `schema.ts` | `afe70c62…` | 工作树 sha256 = `afe70c622786a0a43da8831e3f8a0cd1618af254a21da59555191a780fe7f3b6` | 一致 |
| `schema.test.ts`（新） | `358ac967…` | `358ac967b271a4a026e38b2f463abc44e5086343bfc92fdfe934c79f3cc4f162` | 一致 |
| `session.test.ts` | `f0db260e…` | `f0db260e99c739d7fef889ae0931e574da9aa730f9bafdbb90d1159f87577746` | 一致 |
| 935 替换聚合（不含新测试） | `c96504b8…` | 取 935 冻结清单原条目，替换 `schema.ts`/`session.test.ts` 两文件 hash，按同一算法（path 排序、`path\tsha256\n` UTF-8 拼接取 sha256）= `c96504b862f7c28f9f0c12ba8692c6e5a1b61621a9e30162d664ebb57245cd19` | 一致 |
| 936 源测聚合 | `8d7ab28c…` | 上述 935 条目 + 新 `test/claude-adapter/schema.test.ts` 一条，同算法 = `8d7ab28c2c9b87d88cbd1c3c2fc53c5356ba297d821e581f65723c3c33320da2` | 一致 |
| 基线 935 | 仍 `b075334d…` | 未变（本修复不在 935 清单中；936/8d7ab28c 是增量候选） | 一致 |
| 修复记录/证据 | 记录 `223e2529…`；`fix.diff` `6f5f11b5…`；`evidence-sha256.txt` `21c41f4d…` | 逐一复算一致；`evidence-sha256.txt` 所列 12 个证据文件 hash 与我的重算全部一致 | 一致 |
| `fix.diff` 忠实性 | 修复 diff | 前两文件段与 `git diff` 逐字节一致（diff 退出 0）；新增文件段 277 个 `+` 行（含 1 个 `+++` 头），与 276 行新文件对应 | 一致 |
| 行尾/稳定性 | autocrlf 工作树 | 修复文件在运行前后 sha256 不变（`sha256sum -c` 通过）；`git status` 始终仅 3 文件 | 一致 |

**候选结论：**身份可复算；改动严格限于 Claude适配器 Section 1（`src/common/claude-adapter/`、`test/claude-adapter/`）；未改 `src/provider/runtime/schema.ts` 或任何其他角色/治理/验收文件。

## 3. 逐项判定（B2）

| ID | 判定 | 核心依据 |
| --- | --- | --- |
| C01 | **pass** | 实现：`check()` 接受并递归校验 `if/then/else/not` 与条件片段内 `contains`；`stripConditionals` 剥离条件后交 `z.fromJSONSchema`；`matches()` 按 draft-07 子集实现条件求值（type/const/enum/长度/数值/properties/required/additionalProperties/items/contains/allOf/anyOf/oneOf/not/if-then-else）；`collectConditionalIssues` 在 `superRefine` 中执行。测试 1–4/6–8 覆盖命中/未命中、无 else、not（含 anyOf/嵌套）、嵌套 properties/items/additionalProperties、真实 git OID、dispatch reviewOid+resumeController、decide disposition、submit_version_change（if 内 contains）。我复跑 10/10 通过。 |
| C02 | **pass** | 测试 9 覆盖 `patternProperties/$ref/dependencies/propertyNames/additionalItems` 拒绝、基础 schema 的 `contains` 拒绝、条件片段内未知关键字拒绝、空 anyOf、非法 required/type/then/not 拒绝；`session.test.ts` 改写后仍断言 malformed `not`（空 anyOf、字符串 required、非对象 then、条件片段未知关键字）在 Query 创建前拒绝、零配置。我复跑套件 116/116。 |
| C03 | **pass** | 测试 5–8 直接使用真实 `describeTool(...).parameters` 转换并给正反例；测试 10 对无条件 schema 与 `z.fromJSONSchema` 逐值比较（含 parse 结果 deepEqual）。我另用独立脚本枚举 `describeTool` 全部名称（43 个 `name ===` 分支 + 5 个 shapes 映射名 + `git_publish`，去重 48 个），**48/48 转换成功、0 失败**；以含全部能力的 chief options 构建的 24/24 工具亦全部转换成功。 |
| C04 | **pass** | Section 1（`角色卡/Claude适配器/boundary.md` / `boundary.yaml`）包含 `src/common/claude-adapter/`、`test/claude-adapter/`、`docs/fix/`、`memo.md`；实际改动恰为三文件；`git status -- src app test` 无其他路径；`src/provider/runtime/schema.ts` 未改（`git diff` 无该文件）；未新增角色/边界/治理/标准。 |
| C05 | **pass** | 我独立复跑：`node --test test/claude-adapter/schema.test.ts` → **exit 0，tests 10 / pass 10 / fail 0 / skipped 0**；`node --test test/claude-adapter/*.test.ts` → **exit 0，tests 116 / pass 116 / fail 0 / skipped 0**；`npm run typecheck` → **exit 0**（stdout 仅 npm banner，退出 0）。`session.test.ts` 测试数 65（与 HEAD 相同，未删测试）；两例旧断言改为"强制执行 + 未知仍拒绝"，且 `forbidden nonce` 仍拒绝（`/保留/`）；无新 skip。 |
| C06 | **pass** | probe-1/2 原件确证修复前缺陷（`tool input.target.allOf: unsupported JSON Schema keyword if`，两独立运行、同一 HEAD `e71501c`）；run-2（CDP 路径）与 run-3（真实 UI 导入）日志/截图/目标 `.ans` 日志中**均无该 schema 错误**；run-2 真实 Claude 回合执行 `project_state`/`list_dir`/`dispatch_task`/`git_query`/`project_note`/`write_file` 等；run-3 真实 UI 显示六内置角色、Claude 会话、`project_state`/`list_dir`/`dispatch_task`/`contract_check`/`role_status`/`git_query` 等工具调用；证据 hash 与变更包一致（probe-1 `5c0f0f25…`、probe-2 `c8345bd2…`、诊断 `8ed236bb…`、run-3 body `0914db95…`、截图 `eeb43452…`、chief.jsonl `63a9ed46…`）。修复使真实 Claude 会话/工具链可用。 |
| C07 | **pass** | 下游 `dispatch_task` 拒绝 `trunk-verify-failed：Repository initialization parent is not the actual active accepted chief dispatch turn` 在 run-2/run-3 均复现，属 `src/pipeline/orchestration/trunk-runtime.ts` 的 parent gate（约 L745–772），超出本 T1 适配器范围；报告如实保留，未算作本修复失败或闭环通过。`turn.abort.forced`（run-2 turnId `4c23abcc…`/`9a60fde8…`、run-3 `8a41a47f…`，reasonCode `abort-requested`）如实记录；未提交/推送/合并/发布（分支仍本地，HEAD 不变）。 |

**本修复 B2 结论：pass（仅限 C01–C07 所述窄修复与当前候选 `e71501c` + 3 工作树文件 / 936 聚合 `8d7ab28c…`）。**

## 4. 证据复核记录

1. **缺陷原件**：`probe-1/dogfood-probe.jsonl`（`5c0f0f25…`）与 `probe-2/drive-log.jsonl`（`c8345bd2…`）都记录 `session.send` 返回 `ok:false`、`error:"Claude SDK 运行失败：tool input.target.allOf: unsupported JSON Schema keyword if"`、`outcome:"failed"`；probe-1 诊断（`8ed236bb…`）含 `MODEL_REQUEST_FAILED`；probe-2 三张截图 hash 均 `68e1e361…`（窗口未变化，截图相同属预期）；`probe-2/app-error.log` `252d39b3…`。
2. **修复后真实运行**：run-2 `dogfood-run.jsonl`（连通性探针回复「OK」；dogfooding 回合被操作者中止）与目标 `ans-dogfood-2026-11-07-r2\.ans\state\logs\chief.jsonl`（36,341B，工具调用序列见 §3 C06）；run-3 `ui-03-body.txt`（`0914db95…`，UI 显示 `dispatch_task 已拒绝` 与 `trunk-verify-failed…`）、`ui-03-dispatch-denied.jpeg`（`eeb43452…`）、目标 `ans-dogfood-2026-11-07-r3\.ans\state\logs\chief.jsonl`（`63a9ed46…`，turn `8a41a47f…`：`project_state`/`list_dir`/`dispatch_task 拒绝`/`project_state`/`contract_check`/`role_status`/`git_query 拒绝`/`run_shell`/`turn.end 本轮已中止`）。两 run 全目录 grep `unsupported JSON Schema keyword` 均为 0 命中；grep `Repository initialization parent` 命中即为上述下游门。
3. **测试原件**：`targeted-schema-test.txt`（10 pass）与 `.exit`（exit=0）；`claude-adapter-suite.txt`（116 pass）与 `.exit`；`typecheck.txt`（hash `22d52cc9…`，与 closeout typecheck 同 banner）与 `.exit`；`diff-check.txt`（仅 CRLF 警告）与 `.exit`；`tool-schema-conversion.txt`（`tools=45 converted=45 failed=0`）与 `.exit`；`environment.txt`（UTC `2026-11-07T03:22:31Z`、node v24.22.1、npm 11.19.1、win32 x64、HEAD e71501c）。`evidence-sha256.txt`（`21c41f4d…`）覆盖上述文件，我逐一重算一致。
4. **我的复跑环境/命令**：Windows 11 10.0.26300、node v24.22.1、cwd=实施检出、HEAD e71501c；命令与结果见 §3 C05；运行时前后 3 文件 sha256 不变。
5. **我未重跑真实 Claude**（避免费用/状态变化）；C06 基于上述保留原件与 hash 复核。

## 5. 需客户/统筹处理的事项

1. **下游新阻塞另案**：`trunk-verify-failed：Repository initialization parent is not the actual active accepted chief dispatch turn`（`trunk-runtime.ts` 约 L745–772）阻断 `dispatch_task`，六角色闭环未进入。该问题超出本 T1 窄修复授权；是否授权根因定位/修复、按何工作类型与闸门，需客户/沟通决定（变更包 v4 §11 已列）。
2. **真实闭环最终结论不在本 B1 内**：本 pass 只证明 schema 修复本身；不能据此宣称六角色闭环、产品收口或此前 closeout B2 通过。此前 closeout B2 报告绑定 935 `b075334d…`，其结论不覆盖本修复。
3. **45/45 计数口径**：证据只保留一行 `tools=45 converted=45 failed=0`，未记录具体枚举；我独立枚举到 48 个 `describeTool` 名称并 48/48 转换成功，方向一致、无失败。若需严格 45 的逐名清单，可由原所有者在后续证据中补列（非阻塞）。
4. **F7 时间性**：修复记录最终 mtime 晚于代码/测试，符合测试后补写证据；"记录先于代码"仅有记录自述与路由核实，无法用 mtime 独立证明。属路由/流程核实项，不影响本 B2 语义判定（已在 §0/§6 披露）。
5. **提交/远端**：未提交/推送/合并/发布；如后续需要远端复核，须另行客户授权。

## 6. 披露与范围限制

1. **下游阻塞不算本修复失败**：按任务判定范围 5，`trunk-verify-failed` 与 `turn.abort.forced` 如实记录，不改变本修复 pass；但也不得把它们当作闭环通过或产品完成。
2. **真实运行的两类结果分开**：schema 缺陷消失（probe→run-2/3 无该错误）与下游门/费用中止分开记录；没有用 run-2/3 的局部工具执行冒充完整闭环。
3. **非阻塞残留观察**：`matches` 对 `oneOf` 的条件分支按整体语义求值，但 `stripConditionals` 会把纯条件分支变为空分支交 `z.fromJSONSchema`；若未来出现"oneOf 分支顶层为纯条件"的 schema，基础转换可能先于 `superRefine` 产生额外拒绝。我扫描当前全部 `describeTool` schema，唯一含条件的 `oneOf` 是 `git_candidate` 的 4 个 action 分支，条件位于其嵌套 `oid` 属性（非分支顶层），现有测试与真实工具正反例均通过；故不构成本修复的实际缺陷，作为后续 schema 变更的注意项记录。
4. **条件求值的子集边界**：`matches` 覆盖适配器支持的既有子集（type/enum/const/pattern/长度/数值/properties/required/additionalProperties/items/contains/allOf/anyOf/oneOf/not/if-then-else）；不支持的关键字仍按适配器既有策略拒绝（C02），不静默忽略。
5. **未覆盖**：渲染器 typecheck（本修复未触及 renderer，按路由不要求）；真实模型的长流程/完整六角色闭环（不在本 B1 内）；多平台（本次仅 Windows x64 实测）。
6. **本 pass 的范围**：仅对候选 HEAD `e71501c` + 三工作树文件（`schema.ts` `afe70c62…`、`schema.test.ts` `358ac967…`、`session.test.ts` `f0db260e…`；936 聚合 `8d7ab28c…`）与上述 B1 有效；任何后续代码/测试/标准变更都可能使本结论失效。本报告不授权提交/推送/合并/发布。

---

**签署：ANS 独立验收唯一主上下文（固定身份）——2026-11-07；本报告仅写于本实施检出 `docs/acceptance/`，未改任何产品/测试/方案/标准/计划。**
