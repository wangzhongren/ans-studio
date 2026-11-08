# 会话创建准入按操作审批：独立验收 B2 报告（v2，补证后复判）

- 日期：2026-11-08；身份：ANS 独立验收唯一主上下文（同一身份；只按 B1 v1 判定，不判方案质量、不改方案/代码/测试/角色卡）。
- 模式：轻量但诚实（独立复算新候选身份/delta；复核 AC-2/AC-4 补证原件；按 B1 复用规则判定其余 33 pass 证据；未运行真实模型/Electron/CDP）。
- 结论：**pass**（35 pass / 0 fail / 0 insufficient evidence / 6 not applicable）。v1 的 AC-2/AC-4 两项证据缺口已由补证关闭；其余证据按 B1 §5.3 复用合规（见 §4）。
- 唯一判据：`docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md`（185 行 / `fb88112627c3a5361934a1d3810bea2866b60305d67af6dd8cf39307cce8e1c1`，未变）。
- 历史：v1 报告 `docs/acceptance/2026-11-08_session-admission-approval-report-v1.md`（198 行 / `d49fa51629fcfc7ced9076c9210e578426638169cff1ded200b9112bf2593c2e`）保留；v2 只取代其结论与 AC-2/AC-4 判定。
- 未授权：提交/推送/合并/发布/tag；本报告只写 `docs/acceptance/`。

## 1. 输入（补证后实测）

| 输入 | 实测 |
| --- | --- |
| 变更包（更新） | `docs/scheduling/2026-11-08_change-package_session-admission-approval.md`；181 行 / `127848cdeb68bd20ff6bb49b6d51503194535de755ade1c1838acec05417201d` |
| 派发/接口评审记录（更新） | `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md`；93 行 / `4fe9ac80aa38cbfee01057ccbc261e17f68db76ffdd86bda799d03981a8903cc` |
| 补证记录 | `角色卡/测试/docs/change/2026-11-08_B2-gap-integration.md`；89 行 / 9,847 bytes / `54c0db31146f24278eae9d15b20cee6513c7a8f57d168f2fea1fe38384a7c0ee` |
| 补证证据索引 | `角色卡/测试/docs/change/2026-11-08_B2-gap-integration-evidence/evidence-index.md`；26 行 / 2,382 bytes / `7121eaa11b4e51ead3f10e1b7b79b5e91ab5db8554af841d0e2fc76202afd206`（20 个文件） |
| 新测试文件 | `test/测试/session-admission-approval-b2-gap-integration.test.ts`；272 行 / 14,266 bytes / `4aa783ad8e967da66df82b890c3ff1d70e7230fc04b3fb50aa68e5eb7ccaaed2` |
| B1 v1 | `fb881126…`（未变） |
| v1 报告 | `d49fa516…`（历史保留） |
| D1/RR/E3/扫描 | 沿用 v1 `1c9f2e8c…` / `cc5968ee…` / `5cba2d54…` / `9b05470f…`；原 38 文件候选 `b62c7c7c…` 上取得 |

## 2. 新候选身份与 delta（独立复算）

- HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`；tree `3aa82fb72ddd80a1c9306b8479e43a342ea60dfa`；分支 `feat/plan-escalation-card`；暂存 0；`git status --porcelain -- src app test` = **42 项 = 候选 39 + T1 3**；候选集合与更新后变更包 39 行**精确相等**（无缺/无多/无写集外）。
- 更新包 39 行逐文件 SHA-256 **39/39 一致**；新候选聚合按 `<raw_sha256>  <path>` + LF、`LC_ALL=C` 整行排序后 SHA-256 = **`e89716bdc7353ec46b2a7e4e3535dc2e2427ca20b107faf439c09e0bc97c6070`**（独立复算一致）。
- 旧 38 文件（剔除新增测试文件）聚合仍为 **`b62c7c7c3b12f7f7d1dd4d39e3f6ed2e9430f19a381dba80905e40b5705d2cd7`**；旧 38 逐文件 hash 未变。
- 稳定性 manifest：**1,078 文件 / `57087b8bd0d2a83af6fc59ab60ddb4be3004eb700187a813bd3401c834b862f5`**（独立复算一致）；与旧 E3 manifest（1,077 / `5308e71a…`）逐路径对照：**added 仅新测试文件 1、removed 0、changed 0**；补证 pre/post diff 0；HEAD/tree/分支/暂存/T1 三文件（`afe70c62…`/`f0db260e…`/`358ac967…`，聚合 `06cc75ca…`）不变。
- 判定：**唯一候选 delta = 新增 1 个测试文件**；产品/既有测试文件零变化；候选身份与稳定性成立。

## 3. AC-2 / AC-4 补证原件核验

### 3.1 新测试文件（独立复跑 3/3 pass，exit 0）

- 3 例：`B2-AC2 Pi + 项目角色 + shellOperatorChannel…`、`B2-AC4 claude 无 shell 工具…`、`B2-AC4 pi 无 shell 工具…`；均在当前新候选上独立复跑 **3/3 pass、0 skip、0 fail**。
- 代码核验：使用真实 `openRoleSession` / `createRuntimeAdapter` / `assembleProjectShellGate` / `createShellGate` / 真实 file sink / 诊断 `session.open.*`；官方 Pi/Claude provider 工厂（显式 fixture 配置），**未注入 fake provider**；bind 只构造会话、未调用 `prompt`，无网络/模型请求。

### 3.2 AC-2（Pi + 项目角色 + shellOperatorChannel）

| B1 要求 | 补证观察 | 判定 |
| --- | --- | --- |
| 受保护 + Pi + 非内置项目角色 + shellOperatorChannel（三层链/advisory 默认 true） | 项目角色 worker；`openRoleSession` runtime pi + `shellOperatorChannel` + `shellArming`（pmRoleId=worker、classifyShell、defaultShellRules）；`markRequired` 构造 required；真实 `assembleProjectShellGate`/`createShellGate`+file sink | 满足 |
| prepareRole observed + token + approvalChain | 同装配 `createRuntimeAdapter`：`status:"observed"`、token、`approvalChain.source:"orchestration-shell-gate"`、`mode:"rules-advisory"`、`operatorChannel:true`、`audit:{file,durable:true,probe:"ok"}`、`projectRoot` 一致；无 `native-factory-*` 阻断 | 满足 |
| bindPreparedRole 成功 + session.open.ready | 真实 `bindPreparedRole` 成功；diagnostics `session.open.ready` roleId=worker、projectRoot 一致（恰 1 次） | 满足 |
| appTools 含 run_shell/start_background_task；Pi strict surface 仍 unknown | `inspectToolSurface` 实测两 shell 工具齐全；`status:"unknown"` | 满足 |
| 未伪造/未注入假 provider | 官方 provider 工厂 + `factoryProvenance:"default-production"`；测试代码与 gap 记录一致；独立 3/3 | 满足 |
| 候选 hash | `4aa783ad…` / 新聚合 `e89716bd…` | 满足 |

### 3.3 AC-4（Claude/Pi 无 shell 工具）

| B1 要求 | 补证观察 | 判定 |
| --- | --- | --- |
| 受保护 + Claude/Pi + 无 shell 工具（不 arm） | 参数化 claude/pi 两例；项目角色 worker；不注入 shellOperatorChannel/shellArming；`markRequired` | 满足 |
| 创建成功 + session.open.ready | diagnostics `session.open.ready` roleId=worker（每例恰 1 次） | 满足 |
| appTools 不含 run_shell/start_background_task | `inspectToolSurface` 两 shell 工具为空；`write_file`/`edit_file` 仍注册 | 满足 |
| 准入 observed+token、无 approvalChain、无 native-factory 阻断、真实 bind | `prepareRole` observed+token；`"approvalChain" in plan === false`；无 `native-factory-*`；`bindPreparedRole` 成功且工具面无 shell | 满足 |
| 写工具仍受边界门 | 新用例断言写工具注册；写门回归由既有 `test/门禁引擎/**`、`test/runtime-core/**` 与 E3 覆盖（gap 记录 §5.3 如实披露） | 满足（回归复用） |
| 候选 hash | `4aa783ad…` / 新聚合 `e89716bd…` | 满足 |

### 3.4 `test/测试` 套件与测试集 delta

- 文件集：101 文件 = 旧 D1 100 文件 + 新测试文件 1；旧 100 文件逐路径不变。
- 套件结果：**673 / 615 / 39 fail / 1 cancelled / 18 skip** = 旧 670/612/39/1/18 + 新文件 3/3。
- 独立对照：套件日志最终失败段解析 **40 条（39 fail + 1 cancelled）与 E3 `test/测试` trusted 失败集合 40/40 完全一致**；18 条 skip 名全部属于 E3 31 条 skip 名集合；新文件 0 skip；未新增失败/cancelled/skip。
- `npm run typecheck` 独立复跑 exit 0（新测试文件含入）。

## 4. 其余 33 pass 证据复用合规判定（B1 §5.3）

### 4.1 复用依据

- **候选关联**：旧 38 文件逐文件 hash 与旧聚合 `b62c7c7c…` 不变；旧 manifest 1,077 文件与当前 1,078 逐路径对照 only added 新测试文件、removed 0、changed 0；HEAD/tree/分支/暂存/T1 不变。E3/D1/RR/扫描证据均绑定旧 38 文件候选，当前候选对旧 38 文件的关联成立。
- **输入/依赖/契约/命令/环境未变**：产品源码、既有测试、依赖锁、夹具、构建配置、测试命令与环境均无变化；唯一 delta 是新增测试文件。
- **影响可界定**：新文件是 `test/测试/` 独立测试文件；E3 T3 对每个文件独立进程运行（`node --test --test-concurrency=1 <file>`），新增文件不影响旧 520 文件；`test/测试` 套件实测失败/cancelled/skip 集合不变，新增 3/3 pass；无共享全局状态/夹具改动。
- **新证据补位**：AC-2/AC-4 由新文件 3/3 单独覆盖；其余 33 项（v1 的 27 AC + 6 EV）不需要重跑产品/既有测试。

### 4.2 E3 T3 组合口径

- 旧 E3 T3（旧 38 候选、520 文件）：4,979 / 4,750 / 196 / 1 / 32 / 0；新增文件 3/3 pass、0 skip；组合推断新候选 T3 = **4,982 / 4,753 / 196 / 1 / 32 / 0**（521 文件 = 520 + 1，删除 0）。
- 新增确定性失败 0、新 skip 0 维持；旧 2 条新增失败（application-line、chief-workflow unmanaged）与 5 条消失的判定不受新增测试文件影响（旧 520 文件逐文件不变）。
- **披露**：未重跑 521 文件全量 T3；按 B1 §5.3 以「旧 520 文件证据 + 新文件 3/3 + `test/测试` 套件 delta」组合复用。若标准要求对 521 文件再跑一次全量 T3，这是唯一未执行的证据形式；不影响当前判定（影响已界定、无失败/skip 变化）。

### 4.3 复用结论

- **其余 33 pass 证据复用合规**；D1/RR/E3/扫描/静态门证据对旧 38 文件继续有效；新候选新增测试文件由 §3 证据覆盖。
- 复用不改变 v1 对 B0 豁免、2 条新增失败非确定性、AC-25 回退、预算偏差披露的判定（见 §6）。

## 5. B1 逐项判定（补证后）

> 判定只用 pass / fail / insufficient evidence / not applicable；N/A 均给依据。当前候选 `e89716bd…`。

### 5.1 B0-1–B0-5（客户豁免）

| ID | 判定 | 依据 |
| --- | --- | --- |
| B0-1–B0-5 | not applicable（5 项） | 客户指令跳过 B0 正式重登记（`d7a699d2…`）；B1 §B0-1–B0-5 豁免；辅助 B0 `31e178b3…`（200 fail）仅参考、不作基线；参照 `d0d67ff4…`（4,872/4,641/198/1/32）使用合规；环境差异披露。 |

### 5.2 AC-1–AC-30

| ID | 判定 | 依据/说明 |
| --- | --- | --- |
| AC-1 | pass | v1 证据复用（RR 真实 Claude product ready+回合；D1-1 Codex plan.approvalChain/appTools）。 |
| AC-2 | **pass** | 补证 §3.2：Pi+项目角色+shellOperatorChannel 真实装配 prepare→bind→session ready、approvalChain、appTools、strict unknown；独立 3/3。 |
| AC-3 | pass | v1 证据复用（D1-1/真值表 Codex native 严格路径、正负例）。 |
| AC-4 | **pass** | 补证 §3.3：Claude/Pi 无 shell ready、appTools 不含 shell、写工具在、无 approvalChain/native 阻断、真实 bind；独立 3/3。 |
| AC-5 | pass | v1 证据复用（classify-shell/shell-readonly/D1-5；c-allow）。 |
| AC-6 | pass | v1 证据复用（matcher/transport/D1-6/RR；固定传输/审计字段）。 |
| AC-7 | pass（限定） | v1 证据复用（D1-5 allow/deny/timeout、operator-channel/judge）；真机卡面未观测，按 AC-24/AC-25 披露。 |
| AC-8 | pass | v1 证据复用（shell-judge/operator-channel；judge allow/deny/manual/row-failed）。 |
| AC-9 | pass | v1 证据复用（shell-escalation 59/59 + 集成/视图套件）。 |
| AC-10 | pass | v1 证据复用（git-capabilities 查询/发布 blocked/observed；git-shell-acl 36/36；唯一失败为既有 team-plan publication 红）。 |
| AC-11 | pass | v1 证据复用（D1-2/真值表无 binding 负例）。 |
| AC-12 | pass | v1 证据复用（D1-3/审计三态；Q4 deny-non-readonly）。 |
| AC-13 | pass | v1 证据复用（D1-5 deny/timeout；operator-channel unavailable/关窗/Esc）。 |
| AC-14 | pass | v1 证据复用（D1-7/攻击矩阵/escalation 负例；writeGuard 注入断言）。 |
| AC-15 | pass | v1 证据复用（Git 角色/策略既有套件）。 |
| AC-16 | pass | v1 证据复用（matcher 攻击矩阵 21/21；不 spawn/无文件变化）。 |
| AC-17 | pass | v1 证据复用（D1-3；Q4 deny-non-readonly；无「allow+无审计」轨迹）。 |
| AC-18 | pass | v1 证据复用（D1-4/真值表 custom/demo/unknown 拒绝）。 |
| AC-19 | pass | v1 证据复用（D1-8 + PR #72 独立 37/37）。 |
| AC-20 | pass | v1 证据复用（E3 T3 + 受影响套件；新增确定性失败 0/新 skip 0）。 |
| AC-21 | pass | v1 证据复用（D1-5 后台 allow/deny；background 套件/dispose）。 |
| AC-22 | pass | v1 证据复用（D1-6/7 后台 Git 拒绝；writeGuard entry）。 |
| AC-23 | pass | v1 证据复用（RR task.created/ready product/delivered/回合）。 |
| AC-24 | pass（限定） | v1 证据复用（只读真机；非只读卡未观测，按 AC-25 回退 D1-5/7；不宣称真机卡）。 |
| AC-25 | pass | v1 证据复用（RR 如实记录卡未观测/预算偏差/未追加预算）。 |
| AC-26 | pass | v1 证据复用（D1-Q9 `git-native-surface-unproven`、零副作用）。 |
| AC-27 | pass（注） | v1 证据复用（`matchesRuntimeApprovalChain` 模块级逐字段；端到端 isCurrent；异常码抛出点存在未被单独触发，B1 允许端到端非必过）。 |
| AC-28 | not applicable | Q4=deny-non-readonly（闸门 2 留痕；run-role 两条受保护装配路径）；按 B1 注记转 AC-12/AC-17。 |
| AC-29 | pass | v1 证据复用（matcher 任意完整 OID/`--all` deny；git_query verifier 限制）。 |
| AC-30 | pass | v1 证据复用（D1-7 源码断言/注入；shell-write-guard-injection 3/3）。 |

### 5.3 B1-EV1–EV6

| ID | 判定 | 依据/说明 |
| --- | --- | --- |
| EV1 | pass | 新候选 39 文件/聚合 `e89716bd…`/manifest 1,078/`57087b8b…`/T1 不变；delta 仅新增测试文件；§2 独立复算。 |
| EV2 | pass（组合复用） | 旧 E3 T3 4,979/4,750/196/1/32/0 + 新文件 3/3 = 4,982/4,753/196/1/32/0；`test/测试` 673/615/39/1/18，失败/cancel/skip 集合不变；typecheck 0；未重跑 521 全量，按 §5.3 复用（§4.2 披露）。 |
| EV3 | pass | v1 证据复用（码表/审计字段/`by` 前缀/readonlyGit/entry/roleId；扫描）。 |
| EV4 | pass | v1 证据复用（Codex 严格路径/demo/PR #72；37/37）。 |
| EV5 | pass（披露） | v1 证据复用（RR 预算偏差/AC-25 回退）；补证不改变 RR 事实。 |
| EV6 | pass | v1 证据复用（R8a 签名/唯一登记；R8b Symbol；R8c probe 语义；I0/测试）。 |

### 5.4 判定统计

| 判定 | 数量 | 条目 |
| --- | --- | --- |
| pass | **35** | AC-1–AC-27（AC-28 除外）、AC-29、AC-30、EV1–EV6 |
| fail | **0** | — |
| insufficient evidence | **0** | — |
| not applicable | **6** | B0-1–B0-5、AC-28 |
| 合计 | 41 | 5 B0 + 30 AC + 6 EV |

## 6. E3 基线口径（复用后复核）

- **B0 豁免/参照基线**：不变，合规。客户豁免 `d7a699d2…`；参照 `d0d67ff4…`（4,872/4,641/198/1/32）；辅助 B0 `31e178b3…`（200 fail）不作基线；变更新增测试文件不影响 B0/参照口径。
- **2 条新增失败非确定性**：不变，可接受。`application-line` 隔离 3/3 pass；`chief-workflow unmanaged` 未复现（ENOTEMPTY 族）；两者参考 E3 已登记；旧 520 文件逐文件不变，新文件 3/3 无失败。
- **AC-25 回退**：不变，成立（限定）。只读真机达成；非只读 `touch` 被 write-guard 硬拒、卡未观测；RR 如实记录并回退 D1-5/D1-7；不宣称真机卡。
- **预算偏差披露**：不变，充分（dispatch 2 次/墙钟 10m04/驱动未停/额外会话/CDP 挂起；无追加预算/重试/伪造）。
- **T3 组合**：4,982/4,753/196/1/32/0；新增确定性失败 0、新 skip 0；未重跑 521 全量（§4.2）。

## 7. 披露与限制

1. 补证新测试使用官方 Pi/Claude provider 的**显式假配置**（baseUrl `127.0.0.1:9`、fixture 凭据），bind-only、无网络/模型请求；不替代 RR 真实模型证据（RR 仍只覆盖 Claude 真机）。
2. AC-4 的「写工具仍受边界门」由既有写门套件/E3 回归覆盖；补证只断言写工具注册。
3. 补证诊断在测试内生成并断言；证据目录保留测试日志/套件日志，未单独归档 diagnostics JSONL（测试断言为确定性观察）。
4. 未重跑 521 文件全量 T3；按 B1 §5.3 组合复用旧 520 文件证据 + 新文件 3/3 + `test/测试` 套件 delta。若标准要求全量重跑，这是唯一残留证据形式差异。
5. 其余披露（B0 豁免/辅助 B0、桌面边界漂移、protectedScope 无生产者、T1 单列、Q9/F1/Q4/Q10、并行变更串行前置、RR 限制）沿用 v1 §4，仍充分。
6. 发布/tag、提交/推送/合并未授权；本报告不替代客户确认/实施授权。

## 8. 结论与状态

- **总体：pass**（35 pass / 0 fail / 0 insufficient / 6 N/A）。
- v1 的 AC-2/AC-4 证据缺口已关闭：新文件 3/3 真实 service/assemble 路径，AC-2 Pi 全链与 AC-4 Claude/Pi 无 shell 创建均满足 B1 形式。
- 新候选 39 文件聚合 `e89716bd…`、manifest 1,078/`57087b8b…`；产品/既有测试零变化；其余 33 pass 证据复用合规。
- 未发现审批/审计/守卫绕过、新确定性失败/新 skip、候选漂移或安全旁路；无代码返工项。
- 本报告只写 `docs/acceptance/`；未修改 B1/方案/代码/测试/角色卡；未 commit/push/merge/release。
