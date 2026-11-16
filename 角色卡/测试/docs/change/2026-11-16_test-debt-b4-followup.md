# B4 跟进：chief-workflow 平台残差（W29×3、W30×2、W34、W35、W1b、W36）

- 日期：2026-11-16
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/b4fu`（分支 `fix/test-debt-b4-followup`，起点 `82dc180` = `origin/main`）
- 范围：`test/桌面应用/chief-workflow.test.ts` 的目标用例行 + 本记录与 `_evidence/`。**W19/W33 行由并行批次处理，未触碰；该文件清理结构（B1b）未动。**
- 数据源：
  - R5 更新与证据：`角色卡/测试/docs/change/2026-11-16_remediation-plan-r5-update.md`、`_r5-evidence/`（`11-families.json`、`16-platform-diff.tsv`、`01-ci-failures.json`、`03/04` 失败名单、`10-block-codes.json`）；R4 更新。
  - CI 工件（权威）：GitHub Actions run **43829367008**（第四轮三平台；`main @ a0baea2`，含 B3a/B3b/B3c/B4）：
    - `/tmp/r8-art/test-logs-mac-arm64/test-ci-output.log`
    - `/tmp/r8-art/test-logs-mac-x64/test-ci-output.log`
    - `/tmp/r8-art/test-logs-win-x64/test-ci-output.log`
  - 本机：Windows 11 Pro x64，Node v24.22.1（CI 为 Node 24.14.0）。
- 约束遵守：只改上述测试文件的目标用例行 + 本记录/证据；未改产品/其他测试/workflow/release.yml/角色卡/边界；未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占 9222/9223/9224；未动 W19/W33 断言与文件清理结构。

## 0. 摘要

1. **逐名定性（工件）**：W29×3、W30×2 的 macOS 失败不是期望过时，而是**产品 file gate 在 macOS CI 拒绝 product 的 `write_file`**（`file-gate-host-facts-unproven: genuine current stage, roots and Git protection basis are required`），导致意图材料缺失、`request_choice` 未发出、`cards.length===1` 的 `waitFor` 超时。与 Q2 P2（B3c 已定性为 macOS-only 产品候选）同源。
2. **W34/W35** 在 macOS 更早失败于 `git_candidate init` 的 `git-file-final-guard-unproven`。registry 控制台证据显示 init 时存在**前序 W33 遗留的异根 active Core 条目**（macOS W34 init 5 个 active / W35 init 7 个；Windows 同时点仅 own 2 个）。W33 在 macOS 又因同一 file-gate 缺陷在 `:1715` 早失败（`assert.ok(match)`），清理后会话未完全 dispose。**B4 更新的 run-hub 断言（`:1882-1889`）在失败点之后，未被执行**——不是 B4 diff 漏了 macOS，而是平台前置阻断。
3. **W1b（Windows-only）**：工件显示真实循环并非阻塞——退修→补材 `write_file`→同 flow 新卡→独立 chief select 全链**在 ~5.2s 内完成**（child finally binding `dispositions:["revise","select"]`、`missingEvidence:false`），只是超过原 2.5s 挂起守卫。已把共享 helper 的挂起守卫有界值 **2.5s→15s**；语义断言逐字不变。本机改前 3× + 全文件、改后 3× + W1b 组 3 条 + 全文件均绿，零回归。
4. **W36（x64-only）**：工件的失败是测试 mock 的 `TypeError: Cannot read properties of undefined (reading 'name')`（`chief-workflow.test.ts:2111:117`，`body.tools.some(tool => tool.function.name === …)`），即 x64 CI 出现不符合 chat-transport 嵌套 `function` 形状的请求。本机 4× 绿，不可复现 ⇒ **x64 平台候选，未改**（按任务口径）。
5. **本机零回归**：`test/桌面应用/chief-workflow.test.ts` 全文件改前/改后各 1×：**66 tests / 64 pass / 2 fail（W19、W33，逐名相同）**；全部目标名两次全文件均 PASS。`npm run typecheck` **EXIT=0**。
6. **剩余**：macOS 7 名（W29×3、W30×2、W34、W35）为产品/平台链候选（根因同一 file-gate；W34/W35 叠加 W33 清理面），W36 为 x64 平台候选；均需 macOS/x64 CI 或产品修复后复核。本批未改其期望（产品缺陷，非测试假设）。

## 1. 逐名定性（工件引用）

> 工件位置：macOS 两平台的最终 failing section（arm64 起始为日志 L7401 的 `✖ failing tests:`；x64 L7407）；Windows L7317。逐名摘录见 `_evidence/01`–`04`。

### 1.1 W29×3 / W30×2：macOS 产品 file gate 拒绝 product `write_file`

**失败名**（arm64/x64 双平台，逐名相同）：
- `W29 … document-change / document-change-wrong-flow / document-change-source-loss 保专业规划scope不授旧执行pin`
- `W30 … 第二版意图卡确认必须持久同request版本冻结 连续写入后 / 真实重启迁移后`

**工件错误体**（以 arm64 W29 document-change 为例，x64/其余名同形）：
- 最终 section：`AssertionError [ERR_ASSERTION]: Actual retained intent card must appear[...]`，`at waitFor (…:1774:220)`、`at async TestContext.<anonymous> (…:1839:5)`；耗时 7.9–10.2s（平台差异）。
- trace（assertion message 内嵌）显示 **product 的 `write_file` 被拒 5 次**（rows 12/13/24/25/26）：
  `write_file 写入前复核未通过：写入被拒绝：file-gate-host-facts-unproven: genuine current stage, roots and Git protection basis are required`
  （附「允许写入的路径（按根分组）：skill:（无）/ project:（无）（未写入目标文件；可能已创建父目录）」）。
- 随后 chief 的 `request_choice` 回执：`确认卡未发出（未向客户呈现）原因：Write the actual versioned intent …`（材料缺失）。
- 同一 trace 中 rapporteur 的 `write_file` 成功（`write_file 已准备写入：docs/proposals/w21-flow-proposal-v1.md`）——拒绝并非无差别，而是 product 会话的 host/protection facts 不可证。

**影响链**：product 写 `docs/product/w21-flow-intent-v1.md` 被拒 ⇒ W21 draft 的意图材料不存在 ⇒ chief 无法发出保留意图卡 ⇒ `cards.length===1` 在 6.5s `waitFor` 内永不成立 ⇒ 测试失败。W29 `document-change-missing-confirmation` 在同轮 macOS **通过**（arm64 L2478 `✔`），因为它不断言卡片出现；这与「拒绝发生在真实写路径、只影响依赖写入成功的用例」一致。

**定性：产品缺陷（非测试假设）**。代码参考（只读）：`src/pipeline/orchestration/run-role.ts:3722-3743`（`verifiedFileFacts`/`fileFactsDenied`）、`src/provider/trunk/impl/git-command.ts:614`（`checkGitProtectionFactsCurrent`）与 `protectionTopology`（Git protection facts 的拓扑 currency 栅栏）。与 B3c/B5 记录的 Q2 P2（`test/测试/git-role-workflows-e2e.test.ts`，macOS-only `file-gate-host-facts-unproven`，产品候选）同源。
**处置：不改期望/夹具，报告为 macOS 产品候选**（见 §4）。

### 1.2 W34 / W35：macOS `git_candidate init` 被 `git-file-final-guard-unproven` 拒绝（W33 遗留 active 条目）

**工件错误体**（arm64/x64 相同）：
- `AssertionError [ERR_ASSERTION]: ["git_candidate: {\"operationId\":\"w29-owned-init\",\"repoId\":\"uninitialized\",\"status\":\"blocked\",\"code\":\"git-file-final-guard-unproven\",\"message\":\"Actual file/edit handlers do not carry the current canonical metadata roots and link guard\"}"]`
- `at Server.<anonymous> (…:1725:99)`；耗时 207–465ms（init 第一步即失败）。

**registry 证据**（`chief-workflow.test.ts:1724` 的 `W52 init actual Core registry` 控制台，逐次摘录见 `_evidence/02`）：
- macOS arm64（同形于 x64）：W29/W30/W33 每次 init 时 active 恰为 own 2（chief+convener，外加一个 prepared nominator 条目）；**W33 之后**：W34 init（L2509）active=**5** = W33 遗留 chief/convener/product 3 + own 2；W35 init（L2511）active=**7** = W33 遗留 3 + W34 遗留 2 + own 2（W33/W34 的 convener 为 `lifecycleStatus:unknown, providerFinished:false`）。
- Windows 同时点：W34/W35 init 均只有 own 2 个 active ⇒ 同样的 init guard 通过、W34/W35 在 Windows 通过。

**机制**：`src/pipeline/orchestration/trunk-runtime.ts:239-243`（H12/B12）对注册表**全部 active 条目**校验 `fileWriteProtection` 的 `protectedGitRoots` 是否覆盖当前项目根；W33 遗留条目的保护根指向 W33 的临时根，故当前根 `unproven` ⇒ init 被拒。W33 的遗留又源于同一 macOS file-gate 缺陷：W33 工件在 `:1715` 的 `assert.ok(match)` 提前失败（`[应用绑定的原创建者收口依据]` 缺失，因 W21 draft 的 product 写被拒），失败点位于进行中的 chief 回合内；清理链未报告 B1b 保留错误，但 Core 条目保持 active。

**关键结论**：**B4 已更新的 W34 断言（`:1882-1889`，run-hub/purpose/hubRouting 等）在失败点之后，macOS 上从未执行**。因此 R5 owner 项「W34 的期望更新为何未覆盖 macOS」的答案是：不是期望更新不足，而是被平台前置阻断；W34/W35 的期望本身无需再改。

**定性：macOS 平台链候选**（根因同 §1.1 的 file-gate + W33 清理面；W33 由并行批次处理）。
**处置：不改；待 W33/产品修复后下一轮 macOS CI 复核**。

### 1.3 W1b（Windows-only）：夹具挂起守卫过紧（本批唯一测试改动）

**工件错误体**（Windows x64 final section，L7267+）：
- 父测试：`AssertionError [ERR_ASSERTION]: W52 legacy custom case actual Core binding {"dispositions":["revise","select"],"missingEvidence":false,"originRoleId":"rapporteur", ...}`
  → 子进程失败：`Error: Real chief loop did not settle: shown=[] requests=1 worker=[{"ok":false,"message":"request_choice：幕僚要求修订（chief-delegated；原因：请补齐恢复证据再重新提交 …）…"}]`
  `at Timeout.<anonymous> (…:463:39)`（2.5s 竞速）。
- `assert.equal(result.code, 0, result.output)` 失败：`1 !== 0`（`at isolateUnknownCoreCase …:125:60`、`at async TestContext …:512:7`）。
- 子进程 `finally` 的 binding 日志（race 过期后）显示 `dispositions:["revise","select"]`、`missingEvidence:false`——**第二个决定（select）确实完成**：真实循环在 ~5.2s 内结算（child 测试 5248.7ms），只是超过原 2.5s。
- 同轮其它 W1b：`真实SessionManager…` child 828ms、`真实缺材料（B）…` child 1999ms（均通过）——Windows CI 该轮整体偏慢。

**真实语义**：W1b 验证的是「退修释放原 request、原角色补材、同 flow 新卡独立决定、无客户关开救场」的行为，不是 2.5s 的性能上限。工件证明行为全部发生且结算；失败仅是固定时限过紧。延迟的具体内部步骤未被工件证明（本机亦不可复现）；该链上的真实有界等待之一是版本登记锁（`acquireVersionLock` 默认 `timeoutMs=10_000`，`src/provider/version-change/impl/guard-freeze-registry.ts:708`），15s 守卫覆盖该上限并留有余量。
**改法**：`realWaitingChiefLoop` 的 `Promise.race` 挂起守卫 `2500 → 15000`（并更新注释引用 R5 工件）。**行为断言、回执/审计/账本检查、用例数量均不变**；共享该 helper 的三条 W1b 用例一并受益（`真实缺材料（B）` 本机 145ms vs CI 1999ms，已接近 2.5s 边缘）。

### 1.4 W36（x64-only）：测试 mock 的 tools 形状假设（平台候选，未改）

**工件错误体**（macOS x64 final section）：
- `TypeError: Cannot read properties of undefined (reading 'name')`
  `at file:///…/test/…/chief-workflow.test.ts:2111:117`、`at Array.some (<anonymous>)`、`at Server.<anonymous> (…:2111:56)`；测试耗时 4288ms。
- 代码行为：`const body = JSON.parse(raw), isChief = body.tools.some((tool: { function: { name: string } }) => tool.function.name === "ans_role_activity_log");`
  即某个请求的 `tools` 数组元素没有 `function` 字段（chat-transport 只会发送嵌套 `{type:"function", function:{name…}}`；扁平 `{type:"function", name…}` 形状来自 responses 原生路径）。x64 单轮出现，疑与跨用例泄漏请求/端口复用相关（测试 mock 的强假设被非本项目形状请求触发）。

**处置**：R3 出现、R4 未复现、R5 x64 复现；本机（Windows x64）改前 1× + 改后 3× 全绿，**不可复现 ⇒ 标注 x64 平台候选，未改**（按任务口径）。后续若 x64 复现，建议在 `:2111` 记录异常 `tools` 形状并核对请求来源（跨用例泄漏 vs 原生 responses 路径），再做夹具加固。

## 2. 改法（仅一处，目标用例行）

文件：`test/桌面应用/chief-workflow.test.ts`
- `realWaitingChiefLoop`（`chief-workflow.test.ts:462-464`，仅被三条 W1b 用例使用的 helper）：
  - `setTimeout(…, 2500)` → `setTimeout(…, 15000)`；
  - 注释由「2.5s 竞速」更新为「B4 跟进按 R5 Windows CI 工件把有界值由 2.5s 调为 15s（真实循环 5.2s 内已结算，仅超过原过紧守卫，语义断言不变）」。
- 该值仍是**有限挂起守卫**（15s ≪ CI 300s 测试超时）：「main+worker 必须结算」的判定不变，仅把 CI 运行噪声从判定中剔除；行为/回执/审计断言无一改动。
- 未改任何断言文本/期望、未删用例、未改清理结构；W19/W33 行未触碰；未改产品。

## 3. 验证

| 项 | 结果 |
| --- | --- |
| macOS 目标场景（W29×4 含 missing-confirmation / W30×2 / W34 / W35）定向 3× | 3/3 每轮 8 tests / 8 pass / 0 fail |
| W1b 目标改前 3× | 3/3 EXIT=0（child 350–398ms；父 855–893ms） |
| W1b 目标改后 3× | 3/3 EXIT=0（child 356–407ms；父 867–935ms） |
| W1b 全部三条（共享 helper）改后 1× | 3 tests / 3 pass / 0 fail |
| W36 改前 1× + 改后 3× | 4/4 EXIT=0（1.69–1.95s） |
| 全文件改前基线（`--test-concurrency=1 --test-timeout=300000 --test-force-exit`） | 66 tests / 64 pass / 2 fail（W19、W33） |
| 全文件改后 | 66 tests / 64 pass / 2 fail（W19、W33，**逐名相同、零新增**；目标名全绿） |
| `npm run typecheck` | **EXIT=0** |

完整日志：`_evidence/07-local-runs/`（含全文件两次、目标 3×、W1b 组、16-CPU-burner 负载尝试、typecheck）。

## 4. 剩余 / 平台候选与建议

| 类别 | 名 | 依据 | 后续 |
| --- | --- | --- | --- |
| macOS 产品候选（同 Q2 P2） | W29 document-change / source-loss / wrong-flow；W30 连续写入后 / 真实重启迁移后 | §1.1：product `write_file` 被 `file-gate-host-facts-unproven` 拒绝；Q2 P2 同错误码 | 产品侧修 file gate 的 macOS host/protection currency（`run-role.ts`/`git-command.ts` 参考点）；下一轮 macOS CI 复核 |
| macOS 链候选 | W34、W35 | §1.2：`git-file-final-guard-unproven` + W33 遗留 active 条目（macOS 5/7 vs Windows 2）；W33 早失败根因同 §1.1 | 待 W33（并行批次）与 file-gate 修复后 macOS CI 复跑；**无需再改本用例期望** |
| x64 平台候选 | W36 | §1.4：`TypeError` at `:2111`；本机 4× 绿 | x64 复现时记录异常 tools 形状/请求来源，再加固夹具 |
| 已收口（本批） | W1b 真实无退修选项 | §1.3：挂起守卫 2.5s→15s | 若 Windows CI 仍 >15s，需按工件重新定性（链上可见有界等待含版本锁 10s，15s 已留余量） |
| 范围外（并行批次） | W19、W33 | 全文件仍红，逐名相同 | 由 W19/W33 批次处理；本批未触碰 |

**对 R5 owner 项的回答**：W34 的 B4 期望更新没有「漏 macOS」——失败在 `:1725` 的 git init guard，B4 更新的 `:1882-1889` 断言在 macOS 上未执行；根因是 macOS file-gate 缺陷（§1.1）+ W33 清理面（§1.2）。

## 5. 限制与披露

1. **无 macOS 本机环境**：macOS 结论全部来自 R5 三平台工件（run 43829367008）最终 failing section 与内嵌 trace/registry 控制台；未在本机复跑 macOS 行为。
2. **W1b 本机不可复现**：空闲、全文件上下文、16 CPU burner、单 CPU 亲和四种条件均 0.35–0.53s（CI 工件 5.2s）；改法依据工件语义（行为已结算、仅守卫超时），而非本机复现。负载/亲和运行非正式性能证据，仅用于排除简单 CPU 负载解释。
3. **W36 为单轮观测**：x64-only、非本项目 tools 形状请求的来源未在工件中定位（无请求体日志），仅按任务口径标平台候选；未做夹具改动。
4. **产品内部根因是推断**：§1.1/§1.2 的「protection facts currency/拓扑栅栏」依据为工件错误码 + 代码只读分析，未通过产品侧复现实验证明；记录不据此改产品。
5. **单轮 CI 样本**：W29/W30/W33/W34/W35 在 R3/R4/R5 连续 macOS 红，趋势稳定；W36 为 R3/R5 两次 x64 出现、R4 未复现；W1b 为 R5 首次出现。
6. **未做的事**：未改产品/其他测试/配置/workflow/release.yml/角色卡/边界；未 commit/push；未触发 CI；未 tag/碰 main；未读 `.env`；未占 9222/9223/9224；未改 W19/W33 与清理结构。

## 附录 A：证据索引（`角色卡/测试/docs/change/2026-11-16_test-debt-b4-followup_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `01-macos-w29-w30-artifact-excerpts.txt` | W29×3/W30×2 的 arm64/x64 final section 断言、trace 中 `file-gate-host-facts-unproven` 拒绝行（rows 12/13/24/25/26）与栈 |
| `02-macos-w34-w35-and-registry-evidence.txt` | W34/W35 工件错误体；三次平台每次 init 的 Core registry active 条目摘要（含 W33 遗留证据） |
| `03-windows-w1b-artifact-excerpts.txt` | W1b Windows 内嵌子运行 + final section 全文摘录（race 错误、binding、`1 !== 0`） |
| `04-x64-w36-artifact-excerpt.txt` | W36 x64 TypeError 栈 |
| `05-dispositions.tsv` | 9 名逐名处置（平台/工件错误/定性/改法/本机结果） |
| `06-local-verification.txt` | 本机 3×、全文件改前/改后、typecheck、限制 |
| `07-local-runs/` | 全部本机运行原始日志（改前/改后、全文件、目标 3×、W1b 组、负载与单 CPU 亲和尝试、typecheck） |

## 附录 B：复现命令

```bash
# 数据源（原始工件只放 /tmp，不入库）
# /tmp/r8-art/test-logs-mac-arm64/test-ci-output.log
# /tmp/r8-art/test-logs-mac-x64/test-ci-output.log
# /tmp/r8-art/test-logs-win-x64/test-ci-output.log

# macOS 场景目标（本机 Windows 复跑；3×）
node --test --test-timeout=120000 --test-force-exit \
  --test-name-pattern="W29 默认|W30 默认|W34 真实首文档|W35 缺team" \
  "test/桌面应用/chief-workflow.test.ts"

# W1b 目标（3×；重文件加 --test-force-exit）
node --test --test-timeout=120000 --test-force-exit \
  --test-name-pattern="W1b 真实无退修选项" "test/桌面应用/chief-workflow.test.ts"

# W36（3×）
node --test --test-timeout=120000 --test-force-exit \
  --test-name-pattern="W36 真实Chief可无M0" "test/桌面应用/chief-workflow.test.ts"

# 全文件零回归（CI 同口径）
node --test --test-concurrency=1 --test-timeout=300000 --test-force-exit \
  "test/桌面应用/chief-workflow.test.ts"

npm run typecheck
```

## 附录 C：关键结论速览

- **唯一改动**：W1b 共享 helper 的挂起守卫 2500→15000ms（目标用例行；语义断言零变化）。
- **W29×3/W30×2（macOS）**：产品 `file-gate-host-facts-unproven` 拒绝 product `write_file` ⇒ 卡未出现；产品候选（同 Q2 P2），不改期望。
- **W34/W35（macOS）**：`git-file-final-guard-unproven` + W33 遗留 active Core 条目（macOS 5/7 vs Windows 2）；B4 更新的断言未执行；平台链候选，不改期望。
- **W1b（Windows）**：真实循环 ~5.2s 内完成、仅超 2.5s 守卫；守卫已放宽为 15s；本机 3× + 全文件零回归。
- **W36（x64）**：测试 mock 的 tools 形状 TypeError；本机 4× 绿 ⇒ x64 平台候选，未改。
- **本机**：全文件 66/64/2（W19、W33，改前改后逐名相同）；`npm run typecheck` EXIT=0。
