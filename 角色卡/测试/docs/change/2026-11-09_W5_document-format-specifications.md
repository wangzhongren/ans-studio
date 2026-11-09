# 变更记录：文档格式权威说明与全员可读（T2）——B5 跨角色集成批次（测试角色）

- 日期：2026-11-09
- 角色：测试（独立验证上下文）；本记录只描述本角色交付与证据，**不判验收**。
- 任务：`2026-11-09-document-format-specifications`；依据团队计划 `4d99586f…` §三/§四、B1 `bec45edf…` §2.1 #11 / §3.9 AC-9 / §3.17 AC-17 / §4.1 TM-13 / §4.3 / §6 EV4、方案 P1.2 `886fef84…` §4.2 注入矩阵 / §4.3 发现机制 / §7.1 跨角色集成。
- 工作目录：`.claude/worktrees/trunk-amendment`；分支 `feat/document-format-specifications`；基线 HEAD `3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`（冻结）。Node v24.22.1 / npm 11.19.1 / win32。
- 状态：实施完成、本地确定性证据齐全；**未提交/未推送/未合并/未发布**。

## 一、本批写集

| 文件 | 性质 | 行/字节 | SHA-256 |
| --- | --- | --- | --- |
| `test/测试/doc-format-all-roles.test.ts` | 新建（B1 §2.1 #11） | 724 / 35,241 | `d992b164fcd0e36d8eea0646d0736a3b5da08e16922d6e248d828a0de543b2e5` |
| `角色卡/测试/docs/change/2026-11-09_W5_doc-format-all-roles.log.txt` | 证据日志（本角色） | 133 / 10,043 | `5160727f430418195a387288c7cbfee65c0981d86aa763cf05e655a68e059d9d` |
| `角色卡/测试/docs/change/2026-11-09_W5_document-format-specifications.md` | 本记录 | 见交付回执 | 见交付回执 |

- 候选（产品写集）只有 1 个新文件；可复算聚合（按路径排序后 `path + "\0" + sha256` 串联的 SHA-256）：`6b1e48919697d0922de9c9b7cd081dec9ea69c5dc8d7b3548d875fbf330d2caf`。
- numstat：新建文件相对不存在 = +724 / −0（未跟踪文件无法用 `git diff --numstat`；以行数/字节/raw SHA-256 记账）。
- 写集外 `src app test` diff = 0（相对冻结在飞基线）：B1–B4b 的 6 个 M + 4 个 untracked 文件 SHA-256 与冻结前缀逐一复核一致（§六），本批未改任何 `app/**`、`src/**`、其它 `test/**`、角色卡/边界/文档；未新增目录/依赖；H1 delta = 0；旧断言改写 = 0（只读回归，未改任何既有测试/断言）。

## 二、注册矩阵（TM-13 / AC-9）

经真实 `SessionManager.open` → 真实 `openRoleSession` → 官方适配器工厂（`createRuntimeAdapterFactory` → `buildGovernedTools`）捕获**真实**工具目录（非手写桩；captured 于 provider 工厂的 `options.tools`）：

| 会话 | 治理模型 | `doc_format` | 目录位置 |
| --- | --- | --- | --- |
| chief / product / rapporteur / nominator / convener / verifier（6 内置） | trio | 各恰 1 只（6/6） | `index(doc_format) = index(contract_check) + 1` |
| `su`（旧 su） | single | 恰 1 只 | 同上 |
| `worker-doc-format-b5`（动态项目角色） | trio | 恰 1 只 | 同上 |

- 共 **8/8** 会话注册；项目角色 id 为动态 id（非内置保留 id、非技能登记名），夹具无 `docs/skills/` —— 注册不依赖技能安装/预登记。
- 注入才注册控制（动态项目角色，直接 `openRoleSession`）：未注入 `docFormat` ⇒ `doc_format` 不存在（CLI/旧调用方 fail-closed）；注入 ⇒ 恰多一只，其余工具名称/描述/schema/guidelines/顺序逐字不变（`toolShape` 深比较）。
- judge 隔离：`buildGovernanceJudgeTools` 恰 `judge_read_file` / `judge_list_dir` / `report_governance_judgement`；`buildShellJudgeTools` 恰 `judge_read_file` / `judge_list_dir` / `report_shell_judgement`；均无 `doc_format`，每只定义与 `describeTool` 单一来源逐字一致，二次构造确定。
- 有界 Chief 隔离：真实 `openRoleSession` + 合法 `chiefDecisionContext`（chief / trio / tools=`decide_pending_request`）**即便调用方同时提供 `docFormat` 能力**，工具集仍恰 `["decide_pending_request"]`（有界分支 capabilities 不含 docFormat，且不走 `buildGovernedTools`）。

## 三、数据源（只读/无副作用）

- 8/8 角色数据源（桌面注入的同一 `docFormatText` 能力）对 `{}` / 空串 / 仅空白均返回**同一静态索引** `docFormatIndexText()`（5,223 B；共享索引 Set 大小 = 1）；`project-intent/v1` 详情与 `part` 裁剪、未知 id（`no-such/v1`）均与注册表 `docFormatSpecText()` 逐字一致（未知为「未知格式 …；可用：…」纯文本，数据源不抛）。
- 零 IO：索引/详情调用期间 `getListing` / `refreshListingNow` 计数不变；`fs.promises.readFile` / `writeFile` / `appendFile` spy 均 0 次。
- 无副作用：会话事件外推数不变；两会话根（trio / single）的 `executionInventoryFacts(...)` 中 `sessions.length`、`queuedDispatches`、`activeDeliveries` 均不变（**未入队**、未改变会话状态）；输出不含项目根/角色 id 等事实（静态公开文本）。

## 四、工具可调用（真实轮次；TM-13）

- 每个角色独立真实会话（demo 适配器脚本 = 5 次 `doc_format`：索引×2、`project-intent/v1`×2、未知×1），经 `sendBackground` 真实轮次执行；8 角色 × 5 = **40 次**工具调用。
- 结果：索引/详情 `ok:true` 且 `message` 与注册表文本逐字一致（含固定头部 `doc_format（只读；不构成放行/授权；doc-format-specs/v1）`）；未知 `ok:false` 且消息 = 注册表未知文本（含全部可用 id）；同输入两次调用同文本。
- 每调用恰 start + result 两条投影事件（8×5×2 = 80 条），无额外诊断/审计事件。
- 调用前后各会话工具目录与其它工具定义（名称/描述/schema/guidelines/executionMode/顺序）逐字不变。
- 落盘：真实轮次会写既有会话基础设施 `.ans/sessions/**`（会话历史）与 `.ans/state/logs/**`（角色运行日志）——轮次事件泵既有行为，与本工具无关；除该基础设施外项目根零新增/修改文件（无诊断/审计产物、无格式说明副本落盘）。测试以文件树快照（路径+大小+SHA-256）前后对照。

## 五、测试计数 / 日志 / 类型

命令与结果（Node v24.22.1；`--test-concurrency=1`；全部 exit 0）：

| 命令 | tests | pass | fail | cancelled | skipped |
| --- | --- | --- | --- | --- | --- |
| `node --test --test-concurrency=1 test/测试/doc-format-all-roles.test.ts` | 5 | 5 | 0 | 0 | 0 |
| `node --test --test-concurrency=1 test/桌面应用/session.test.ts`（只读回归，B4b） | 7 | 7 | 0 | 0 | 0 |
| `node --test --test-concurrency=1 test/runtime-core/doc-format-specs-pin.test.ts`（只读回归，B2） | 11 | 11 | 0 | 0 | 0 |
| `node --test --test-concurrency=1 test/编排/doc-format-specs.test.ts`（只读回归，B1） | 24 | 24 | 0 | 0 | 0 |
| `node --test --test-concurrency=1 test/门禁引擎/doc-format-specs-pin.test.ts`（只读回归，B3） | 19 | 19 | 0 | 0 | 0 |

- `npm run typecheck` exit 0（含本新文件）。
- before（本批开始）：B5 文件不存在（无 before 计数）；after：上述计数。新增确定性失败 = 0；新增 skip = 0；既有测试/产品零修改（只读回归）。
- 证据日志：`角色卡/测试/docs/change/2026-11-09_W5_doc-format-all-roles.log.txt`（133 行 / 10,043 bytes / SHA-256 `5160727f430418195a387288c7cbfee65c0981d86aa763cf05e655a68e059d9d`），含上述全部命令输出与测试诊断行。
- 稳定性复跑：候选定稿后再次运行 B5 测试 5/5、exit 0（同候选；`--test-timeout=60000` 护栏）；证据日志与候选一致。

## 六、候选与写集隔离（冻结基线复核）

本批开始与结束时逐一复核冻结在飞文件（SHA-256 与任务冻结前缀一致，未被本批修改）：

| 文件 | SHA-256 |
| --- | --- |
| `src/common/编排/doc-format-specs.ts` | `f141e4ba3314f3a67673f83fa70daf8a80ac5fca7270b214eb30aeeba1008871` |
| `test/编排/doc-format-specs.test.ts` | `f9abe8f35fbe920cf14c53c4fb9f2e9df5017f03741200bf2b2050753e1395c4` |
| `src/model/runtime.ts` | `89e5fbc97b3a3f6994cf858696750fe6d3acfbe45ed1d0cf571b8a35037f4959` |
| `src/provider/runtime/tools.ts` | `b07c3f805ab9eb88f13d4a6d4098b001d101e04b59b6162f57eda1e47a06ba79` |
| `src/provider/runtime/schema.ts` | `fd3ee646e07e6d6beb3ba006a5f3079de5fb92c2fc08909dc6c9f4322e7a13a6` |
| `test/runtime-core/doc-format-specs-pin.test.ts` | `f05471e38ca83f626856352ce85d914ec0ff85a1035c111eadc5e43659592003` |
| `test/门禁引擎/doc-format-specs-pin.test.ts` | `45b1ce34ed2d06f460264b252d2d702bebd78d55bf155c2922af1b39f520d369` |
| `src/pipeline/orchestration/run-role.ts` | `d754d767298de61b956b29e6fe8873640d53359765c9dfce45abc548f6003258` |
| `app/desktop/session.ts` | `df5bf7b0315410791e4c58a6c3e3caaac6f1d4312ff4751957d454e7a569fe14` |
| `test/桌面应用/session.test.ts` | `23bc19a723ef6c3c0c19259fee58179e779578ed6fbd726e6b094f1d8ef9085e` |

- `git status --porcelain -- src app test`：`M app/desktop/session.ts`、`M src/model/runtime.ts`、`M src/pipeline/orchestration/run-role.ts`、`M src/provider/runtime/{schema,tools}.ts`（在飞 B2/B4）与 4 个在飞 untracked 测试/注册表文件 + 本批 `test/测试/doc-format-all-roles.test.ts`；本批无其它新增/修改/删除。

## 七、限制与披露

1. **注册 ≠ 真实读取**：本批证明 8/8 会话注册、数据源可调用、工具经真实轮次可调用；**不构成真实模型主动读取**的证据（真实读取见 B1 AC-12/RR，由协调方另行执行）。
2. **Pi/Codex**：不作真实模型行为承诺；本批为确定性覆盖（工具目录/数据源/事件），真实运行只承诺 Claude（RR）。
3. 使用 demo 适配器（`createDemoRuntimeAdapter`）执行工具脚本；未使用真实模型/Electron；未占用/触碰 9222/9223；未读写贪吃蛇运行根。
4. 生产 `MAX_LIVE_SESSIONS = 3`（LRU）会回收旧会话：注册矩阵/数据源测试在同一 manager 中开 8 个会话，以捕获的能力/工具目录为证（会话被回收不影响已捕获对象，数据源为纯静态函数）；可调用测试按角色独立 manager 装配以保证目标会话存活（如实披露该测试装配差异）。
5. 未知 id「注册表未知文本」一致性依赖工具层与注册表同口径（两端均由 `docFormatKnownIds()` 生成）；本批与 B2 各自断言钉住。
6. 真实轮次写 `.ans/sessions/**`、`.ans/state/logs/**` 属既有会话基础设施；本批只证明 `doc_format` 不产生额外落盘/诊断/审计事件，未宣称整个轮次零落盘。
7. 本批未修改 B1–B4 写集；其文件 hash 与冻结前缀一致（§六）。若后续其它批次改动这些文件，按 BASE-5 本批证据失效并重取。

## 八、未提交声明

- 未 `git add` / commit / push / merge / release；HEAD 保持 `3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`，分支 `feat/document-format-specifications` 未变。
- 本记录与证据日志为未跟踪新文件；产品候选仅 `test/测试/doc-format-all-roles.test.ts`（1 个新文件）。
