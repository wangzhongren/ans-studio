# 写盘确认卡「呈现前 preview 完整性闸」（真机 op-2 修复）

- 日期：2026-10-19
- 角色：编排
- 客户确认来源：本会话客户明确「可以按照你说的修改」（同意在出卡前拒绝不完整证据，让角色补全后重发）。

## 1. 问题

真机测试（op-2）中，一张写盘确认卡同时声明两条新建路径：

- `docs/proposals/ticket-desk-collab-v1.md`
- `docs/governance/rapporteur/ticket-desk-collab.md`

但 `preview` 只有提案正文，第二条路径没有正文/结构。判断 agent 依既有 rubric 回落手动确认：

- `src/common/编排/governance-judge-prompt.ts:90-93`：「preview/detail 必须足以核对**内容**：新文件能看到正文或明确结构；改文件能看到改什么；只有『按提案写』『写入上述文件』⇒ manual。」
- `src/common/编排/governance-judge.ts:303-308`：新建目标的 confirm 卡，preview 为空 ⇒ `insufficient-evidence` 回落手动确认。

安全上 fail-closed 是对的，但产品不应把「证据完整性」留给模型自觉：应在**卡片呈现给客户之前**就拒绝不完整证据，让角色补全后重发。

## 2. 真机证据（逐字）

`test/编排/fixtures/op2-write-confirm-card.json` 逐字摘录自
`ans-testbed/ticket-desk-live/.ans/sessions/rapporteur/pi/native/2026-10-19T01-24-24-825Z_01a151c2-8479-701d-92b3-3fc3acf93075.jsonl`
的 `request_confirmation` 调用（`call_00_T3nMkXIqzJTRTwLtUrZf3276`）：

- `title`：确认写入提案 v1（docs/proposals/ticket-desk-collab-v1.md）与治理记录
- `cardKind`：`write`；`flowId`：`ticket-desk-collab`
- `paths`：上述两条路径
- `preview`：7722 字符的提案 v1 正文（`# 提案 v1：客户工单协作台（ticket-desk-collab）` 起头）

实测：**两条路径名在 preview 中出现次数均为 0**——preview 只是整篇提案正文，没有任何「路径 → 正文/结构」的对应关系。这正是判断 agent 无法核对第二条路径、回落 manual 的原因。

## 3. 修复（限编排边界）

### 3.1 代码

- `src/common/编排/confirmed-writes.ts`
  - 新增 `declaredConfirmPaths(req)`：写盘类确认卡的声明路径——显式 `req.paths` 优先（`explicitConfirmPaths` 既有语义；空数组视为未给），未给时回退 `declaredWritePathsFromPreview`。
  - 新增 `validateConfirmPreviewCompleteness(req)`：对每一条声明路径做**确定性**校验，返回 `{ ok, declaredPaths, missingPaths }`。
- `src/pipeline/orchestration/run-role.ts`
  - `openRoleSession` 的 `governedInput`（客户通道包装）在**调用原始客户通道之前**执行校验；不通过 ⇒ 记录诊断 `confirmation.preview.incomplete`，返回 `outcome:"declined"`（**不呈现卡片**、不进入判断 agent、不发行任何写入路径、不写 `customer.decision` 账本）。
  - 错误文案明确列出缺正文的路径，并要求「把每条路径的完整正文或明确结构放进同一个 preview 后重试（并继续在 paths 中逐条列出）」。
- `src/common/编排/governance-judge-facts.ts`
  - 仅是**纯重构**：把 `declaredWritePathsFromPreview` 的逐行解析抽成 `declaredWritePathOfLine`（行为逐字不变），供完整性闸与判断 agent 的路径口径复用同一份实现；**不改变判断 agent 的判定规则**。

### 3.2 判定规则（确定性、可测试）

对每条声明路径，preview 必须满足：

1. **锚点**：路径以以下任一形式出现——
   - Markdown 标题（`## docs/x.md`，允许反引号/粗体包裹）；
   - 代码围栏说明（```` ```md docs/x.md ```` / ```` ```docs/x.md ````）；
   - 既有「一行一个路径」声明行（`将写入 docs/x.md` / `- docs/x.md` / 裸路径行）。
2. **正文**：从锚点之后到**下一个声明路径锚点**（或 preview 末尾）之间，至少存在一行非空正文/代码行；纯空行、纯装饰行（`---`/表格分隔/围栏行）、仅重复路径名的行不算正文。
3. 围栏内部的路径行不视为声明锚点（代码正文里出现的路径不会误当写入目标）。

未声明任何路径的确认卡与 `request_choice` 选择卡 ⇒ 直接通过（旧行为逐字不变）。

### 3.3 取舍

- **不依赖自然语言理解**：不判断「这段文字像不像第二条路径的正文」，只认结构性锚点 + 非空正文；宁严勿松。
- **整篇文档不算某条路径的正文**：真机 op-2 的 preview 是完整的提案文档，但没有 `## docs/proposals/ticket-desk-collab-v1.md` 这样的锚点。确定性规则无法推断「这整篇属于哪条路径」，因此两条路径都会被列为缺正文。这是有意的取舍：要求模型对每条路径显式标注正文/结构，而不是让系统猜。
- **不自动补写、不放行**：校验失败不生成占位正文、不缩减 `paths`、不发行任何路径；模型补全后重发才可能获得确认。
- **发行语义不变**：确认后仍按既有「已确认路径」发行 writeSet（`createConfirmedWriteIssuer`）；内容漂移（O-A1）残余漏洞仍如实登记、不扩大本次范围。

## 4. 影响面

- 所有启用客户确认制的会话（CLI `ans govern` 与桌面应用均经 `openRoleSession`）中，**声明了写入路径**的 confirm 卡都会先过此闸；无路径确认与选择卡不变。
- 判断 agent：仅在「完整卡」上被调用，减少无效判断；判定规则本身未改。
- 账本：被拒卡不产生 `customer.decision`；写入路径不进入 writeSet。
- 已有卡格式：旧式「只列路径、不给正文」的写盘卡会被拒绝。这是本次产品意图（fail-closed 且把补全责任前置给模型）；相关跨角色测试夹具需要按新格式补正文（见 §6）。

## 5. 测试与验证

- `test/编排/confirm-preview-completeness.test.ts`（新增）：
  - 真机 op-2 卡原文 → 拒绝且列出两条路径；给第一条补标题+正文后 → 精确只缺第二条；
  - 「两条路径只给一条正文」→ 客户通道零调用、不呈现、不发行、零写入，错误文案含缺正文路径与重试要求；
  - 「两条路径都给正文」→ 正常呈现一次、确认后两条路径落盘；
  - 「无路径确认」→ 照常呈现（旧行为不变）；
  - 锚点口径单元：标题/围栏说明/声明行；仅路径名或声明后无正文 → 拒绝。
- 编排既有测试夹具按新格式补正文（`test/编排/{confirmation-gated,govern,govern-engine,governance-session,governance-judge,runtime-orchestration}.test.ts`），断言未放宽。
- 结果：`node --test "test/编排/**/*.test.ts"` → **556 tests / 556 pass / 0 fail**；`npm run typecheck` → 通过（0 错误）。

## 6. 跨角色请求（本次未越界实现）

1. **运行时核心（`src/provider/runtime/`）**：`request_confirmation` 的 description / promptGuidelines 建议同步要求：写盘卡必须同时给出显式 `paths`，并在 preview 中用 `## <路径>` 标题或 ```` ```md <路径> ```` 围栏逐条给出正文/结构。可选（结构性方案）：新增 `writes:[{path,content}]` 结构化入参，由工具层直接生成/核验 preview，彻底移除文本启发式。
2. **测试角色（`test/测试/**`）与装配角色（`test/装配/**`）**：以下既有用例的写盘卡 preview 只有路径名、没有逐路径正文，会按新契约被拒绝，需由属主补正文夹具（本次只读运行、未修改；实测共 **11 个文件 / 16 个用例**，失败原因均为「确认卡未呈现：preview 未包含……可核对正文/结构」，产品行为符合新契约）：
   - `test/测试/cli-genesis-boundary.test.ts:105`（创世链路面，确认桩调用 0 次）；
   - `test/测试/duplicate-input-identity.test.ts:12`（pi/codex/claude ×3，preview 仅 `docs/X/fixture.md`）；
   - `test/测试/g4-skill-verify/c-preauth.test.ts:69`（树外写盘的确认请求 0 次）；
   - `test/测试/g4v2-mcp-verify/d-orchestration.test.ts:60`（同上，preview 仅 `docs/其他.md`）；
   - `test/测试/governance-e2e-auto/c-appointment-timing.test.ts:31`（场景 3）；
   - `test/测试/governance-e2e-auto/i-full-chain.test.ts:34`（五角色全自动链路）；
   - `test/测试/governance-judge-cards-verify/d-audit-ledger.test.ts:196`（写盘代批账本）；
   - `test/测试/governance-trio-verify/b-gates-dispatch-ledger.test.ts:359`（账本契约）；
   - `test/测试/t1-pipeline-integration.test.ts:54`（pi/codex/claude ×3，preview 仅 `src/X/current.txt`）；
   - `test/测试/t9-block1-bootstrap.test.ts:425,465`（su 创世确认制，`confirmPreview()` 三条角色卡路径无正文）；
   - `test/装配/govern-target.test.ts:223`（单路径无正文）。
   - 另测得 3 个**与本改动无关**的既有失败（纯源码钉/UI 配置测试，不引用本批模块）：`test/测试/g2-verify/u1-renderer.test.ts:96`、`test/测试/g5-reasoning-verify/g-desktop.test.ts:65`、`test/测试/t29-pi-config-roundtrip.test.ts:273`。
3. **桌面应用角色**：若其 UI 侧另有直接构造 `CustomerInputRequest` 的路径（不经 `openRoleSession` 的 `governedInput`），需确认是否也要接入同一校验；本仓内未发现此类绕过。

## 7. 残余风险

- **无显式 paths 且无声明行的卡片会绕过本闸**：若模型不给 `paths`，preview 又只用标题/散文提到路径（没有任何「一行一个路径」声明），`declaredConfirmPaths` 为空 ⇒ 完整性闸不介入；而发行器仍会从呈现文本提取路径并发行。建议运行时核心把「写盘卡必须带显式 `paths`」写进工具指引（§6.1），这是根治办法。
- **声明行回退模式的误报**：`declaredWritePathsFromPreview` 会把部分「依据：docs/x.md」式引用行识别为声明路径（既有行为），此类卡片可能被要求补该引用文件的正文；显式 `paths` 可避免。
- **内容漂移（O-A1）**：本修复只保证「每条声明路径都有可核对正文」，不保证写出内容与 preview 一致（客户 2026-10-12 明确不采纳内容哈希比对，残余漏洞仍如实登记）。
