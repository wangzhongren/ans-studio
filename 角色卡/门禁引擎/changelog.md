# 门禁引擎 变更记录

## 2026-10-12 — 旧快照线索的同步读盘加缓存（mtime+size 短路；转达自桌面的跨角色建议）

背景：桌面侧治理完事件热路径（300 事件风暴最长帧间隔 101ms→18ms）后指出——旧快照线索的**同步小读盘**
落在「每次落入未匹配分支的写尝试」上，一轮数百次写尝试时会是主进程的同步阻塞源。本派工给该读盘加
**按 `mtimeMs`+`size` 的模块级缓存/短路**；语义不变（线索仍只在「盘上覆盖、快照不覆盖」时出现；
失败仍 fail-closed；判定结果从不依赖盘面）。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（`reloadBoundaryEntriesSync` 加缓存 + 可注入
  `StaleBoundaryProbeIo` 桩口）、`test/门禁引擎/stale-snapshot-hint.test.ts`（追加缓存用例 2 例，
  既有 4 例断言未动）、本文件；**未动** `resolve-write.ts`（调用不变、拿到默认 io 即自动走缓存）、
  未碰他角色任何文件。
- **缓存策略**：模块级 `Map<fileAbs, { mtimeMs, size, entries|null }>`——命中（mtime+size 同）⇒
  **只做一次 `stat`，跳过读取与解析**；变更 ⇒ 重读重解析并更新缓存。解析失败的 `null` 也按
  mtime+size 记忆（坏文件不反复解析）；读盘失败（stat 失败 / stat 成功但读不到）**不写缓存**，
  下次重新判定（文件随时可能出现）。内置标签/空串无 I/O 直返 `null`。容量上限 256、超限整体清空
  （进程内边界文件数量级本就很小）。缓存条目**只读**（调用方不得改动返回数组）。
- **如实登记的判定限制**：`mtime+size` 检不出「同尺寸且 mtime 未变」的改动——真实写入都会更新
  mtime，此类碰撞仅可能出现在粗时间粒度的文件系统上；即便漏检，影响的只是**提示句**（可能未显示/
  多显示一次旧快照线索），**判定结果（allowed）从不依赖盘面**（纯函数性不变）。
- **测试**：新增 2 例全绿——① 计数桩：首次读 1 次 → 未变再调**不增加读取**（仅 stat）；**同尺寸
  内容变更（mtime 变，`utimesSync` 固定时刻求确定性）必须被重读检出**；坏文件同状态命中缓存不反复
  解析；内置标签零 I/O；文件不存在无读取。② 端到端：经 `resolveWrite` 连续两次同盘面线索一致
  （缓存透明）；盘面变更后**线索立即失效**、原文案逐字恢复。既有 4 例（触发/条件语义/反向断言/
  F4 不加线索）原样全绿。本角色套件 **148 计 / 147 过 / 0 红 / 1 skipped**；全量 **859 计 / 856 过 /
  2 红（既有环境红）/ 1 skipped**（= 协调者基线 857/854 + 本次 2）；`npm run typecheck` 0 错。
  环境：Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **补偿性度量（如实）**：缓存命中路径仍每次执行一次 `statSync`（廉价系统调用，是变更检测的必要
  成本）；未做 stat 结果本身的高阶缓存（如目录时间戳），如需进一步压榨属后续优化。

## 2026-10-12 — 拒写信息补「旧边界快照」线索（客户派工；真机现象）

真机现象：su 已按流程改好角色边界（盘上文件确含新路径），但角色的**活会话持有开会话时解析的旧边界
快照** ⇒ 写入被拒，拒绝信息只说「目标路径未匹配任何边界条目」，**不提示「会话快照过期」**——排查者
（含模型自己）要绕一圈才反应过来。桌面 O-1（边界变更后自动重建旧快照会话）多能自愈；本线索服务
**残余情形**（轮次正在跑 / 未触达重建时机）。

- **边界**：`src/service/gate/resolve-write.ts`（最末「未匹配」分支追加线索）、
  `src/common/门禁引擎/boundary-core.ts`（新增同步对照重载 `reloadBoundaryEntriesSync`）、
  `test/门禁引擎/stale-snapshot-hint.test.ts`（新，4 例）、本文件；未碰
  `src/provider|pipeline|common/编排|common/pi-adapter|src/service/其余|app/**`、他角色 tests/docs。
- **触发判据（可判定才加，不猜测）**：**同步重读盘上边界**（`boundarySource` → projectRoot 拼接 →
  readFileSync → 与异步加载同一套 parseEntries 语义）成功，且重读结果**按与本次判定同一套语义**
  （root + pathCovers + isActive(e, scope)）**覆盖该路径**——即「盘上含、快照不含」。无法判定
  （内置 `<built-in:…>` 标签 / 空串 / 读盘失败 / 新解析报错）⇒ **原文案逐字不变**。
- **文案**（原文案后追加）：「本会话可能持有旧边界快照（盘上边界现已含该路径）——请重开会话后重试；
  本次判定不变，仍为拒绝。」——末句**防误读为放行**；判定仍拒绝（fail-closed 不变）。
- **触发面最小化**：线索只在**最终「未匹配任何边界条目」分支**——F6（未接受）/ parseError / F4
  （writeSet 收窄）/ 跨根混淆 / 条件缺失等既有拒绝理由均不加；对照只看**条目**（不做接受/pin 校验，
  与「盘上是否含该路径」无关）。
- **测试**：新用例 4 例全绿（触发 → 理由含线索且 allowed=false、allowedByRoot 不变；条件目录按同一
  套 isActive 语义对照——快照重开仍不激活时**不加**；**反向断言**——内置标签/读盘失败/盘上不含/
  新解析报错四种情形 reason **逐字等于**原文案且不含线索；F4 拒绝不加线索）。本角色套件
  **146 计 / 145 过 / 0 红 / 1 skipped**；全量 **851 计 / 848 过 / 2 红（既有环境红：桌面 pi-config
  目录名、pm shared macOS `/var`）/ 1 skipped**（= 协调者基线 847/844 + 本次 4）；`npm run typecheck`
  0 错。环境：Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **如实说明（代价与取舍）**：对照是**每次落入该分支时的同步小读盘**（单文件、拒绝路径上，非热路径）；
  `resolveWrite` 保持**纯函数签名不变**（判定结果不依赖盘面——盘面只影响**文案里的提示句**，故同一
  输入在不同盘面下 allowed 恒同）。线索是**启发式**：盘上覆盖 + 快照不覆盖**可能**另有成因（如接受
  证据变化），故措辞用「可能」并明确「本次判定不变」；若重开后仍被拒，将看到对应真实理由（F6 等）。

## 2026-10-12 — 角色「文档面」固定清单 + 交付纪律：su 卡文本写死（客户原话「各个角色的工作流有问题，为啥不写文档呢」）

真机根因（协调者核过，如实登记）：真实项目里 su 建出的角色边界**只授了代码路径**（如「任务清单实现」
仅 `src/` + `data.json`），**一条文档路径都没有** ⇒ 门禁拒掉一切文档写入 ⇒ 角色**根本不能**维护自己的
文档（不是不写，是不能写）。本派工是**治理文案**：只动 su 内置卡文本（`BUILT_IN_ROLE_CARD_TEXT`）+
其头注；判定逻辑一行未改。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（卡文本 + 头注）、
  `test/门禁引擎/documentation-surface-convention.test.ts`（新，3 例）、本文件；未碰
  `src/provider|pipeline|common/编排|common/pi-adapter|src/service|app/**`、他角色 tests/docs。
- **卡文本要点**：① **固定文档面清单**——建/改每个项目角色时**须随边界一并授予**（逐项标 kind）：
  文件五份（`角色卡/<角色 id>/feature-map.md`、`memo.md`、`changelog.md`、`functional-description.md`、
  `api-spec.md`，kind: file）；目录四个（`角色卡/<角色 id>/docs/{design,feature,change,fix}/`，
  kind: directory）；另加该角色自己的测试目录（如 `test/<角色 id>/`，仅当该角色承担测试）；
  `temp/<角色 id>/` 按 T-1 段一并授予（既有约定保持）。② **交付纪律**——每次交付都要同步自己的文档
  （功能说明/流程、变更记录、memo、api-spec），**代码与文档同批交回**；文档缺口不得靠「下次补」。
  ③ 明示必要性：「不给 ⇒ 角色写不了自己的文档」；**无**「未列即默认可写」式表述（守「未列即只读」）。
- **种子 purpose 未动的判断（同前例）**：清单是「su 往每个角色边界里写什么」的流程文案（卡文本为
  单一来源）；种子 purpose 是创世三目录的描述，不塞流程清单（种子仍恰为三条）。
- **测试**：新用例 3 例全绿（清单**逐项**断言——五文件/四目录/测试目录/temp/kind 标注/根因句；
  交付纪律四条；**反向断言**——凡含「可选/后补/下次补」的小句必须为禁止式，且定向禁用「未列即可写」
  式表述）。本角色套件 **142 计 / 141 过 / 0 红 / 1 skipped**；全量 **839 计 / 836 过 / 2 红（既有
  环境红）/ 1 skipped**（= 协调者基线 836/833 + 本次 3）；`npm run typecheck` 0 错。
  环境：Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **如实说明**：执行面仍是**文案约束**——既有项目里已建角色（只授代码路径）的修补要 su 走治理流程
  重写各自 boundary.yaml（本角色不改任何项目与角色边界文件）；清单只对**此后** su 建/改角色直接生效。

## 2026-10-12 — J-1「确认落盘后自动开工」：su 卡文本写死「落盘后立刻派发第一项开发任务」（客户原话）

客户：「这个确认了，写盘之后，要**自动启动开发**啊。」本派工是**治理文案**：只动 su 内置卡文本
（`BUILT_IN_ROLE_CARD_TEXT`）+ 其头注；判定逻辑、工具实装、编排接线一行未改。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（卡文本 + 头注）、
  `test/门禁引擎/dispatch-after-landing-convention.test.ts`（新，4 例）、本文件；未碰
  `src/provider|pipeline|common/编排|common/pi-adapter|src/service|app/**`、他角色 tests/docs。
- **文案要点（与 H-1 指引逐字对齐）**：① 角色与治理产物落盘（客户经 `request_confirmation` 确认、
  写入完成、自动收尾）之后，**立刻**用 `dispatch_task` 把第一项开发任务派发给对应角色——roleId 用
  刚建出的角色，task 文本**自足**（做什么 / 依据哪份文档或契约 / 完成标准），**不等客户手动转达**；
  ② **派发 ≠ 授权**——目标角色的写权仍只来自它自己的 Section 1 与 `request_confirmation` 的
  confirmed:true；不得在任务文本里代授权限（如「已获准写 src/**」）；③ 失败语义——派发失败/被拒
  （回执「未能派发」）→ 如实告知客户原因，**不得假设已开工**；若没有可派发的角色 → 如实说明并停在
  「待客户指示」。
- **措辞与实装对齐（只读核对，未改他角色文件）**：工具名 `dispatch_task` 与参数 roleId/task（自足
  三要素）取自 `src/provider/pi/tools.ts:145` / `session.ts:252`；「派发 ≠ 授权」写权来源措辞逐字
  取自 `src/provider/pi/session.ts:248`（H-1 语义硬约束）；失败/回执语义取自同处与
  `src/common/编排/handback.ts` 的既有单一来源。未发明新词。
- **种子 purpose 未动的判断**：J-1 是**行为流程**、不涉任何目录路径；种子 purpose 是目录描述，
  按其单一来源原则不把流程文案塞进目录描述（种子亦保持三条不变）。
- **测试**：新用例 4 例全绿（「落盘 → 立刻 → dispatch_task → 派发」顺序链 + roleId/自足三要素；
  「派发 ≠ 授权」逐字措辞与「不得代授权限」；失败语义三条；**反向断言**——任何含「授权/获准/放行」
  的小句必须为禁止式/否定义，且定向禁用「派发即授权 / 已放行写盘」类表述）。本角色套件
  **139 计 / 138 过 / 0 红 / 1 skipped**；全量 **806 计 / 803 过 / 2 红（既有环境红：桌面 pi-config
  目录名、pm shared macOS `/var`）/ 1 skipped**（803 = 上轮 799 + 本次 4）；`npm run typecheck` 0 错。
  环境：Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **如实说明**：① 「立刻派发」以卡文本约定表达（模型行为）——闸层无法强制「必须调用 dispatch_task」，
  约束靠文案 + 工具回执（派发与否客户在会话里可见）；② 卡文本未写 handback.ts 注记的「新建角色快照
  可能被前端旧清单误拒」工程细节（不把内部实现细节塞进角色卡；失败语义「如实告知」已覆盖其表现）。

## 2026-10-12 — 派工「shell 规则集公开再导出」：**被边界阻断，如实回报，未动一行**（边界外）

派工要求新增 `src/service/gate/shell-rules.ts`：公开再导出 `classifyShell` 与 `defaultShellRules`
（供编排 I-1 的 (c) 层注入；编排侧 `shell-arming.ts` 头注已登记「合法注入源＝门禁引擎经
`src/service/gate/` 的公开再导出，尚不存在」为跨角色待办）。

- **边界判定：不在本角色 Section 1。** `src/service/gate/` 下白名单只有**单文件**
  `src/service/gate/resolve-write.ts`、**无目录条目**；`shell-rules.ts` 未列 ⇒ 未列即只读——
  **未创建该文件**（纪律：边界更新走 Governance、不自行扩权）。待 Governance 批准后追加条目
  （建议：`- kind: file` / `path: src/service/gate/shell-rules.ts` /
  `purpose: shell 规则集公开再导出（编排 (c) 层注入源）`）再实施；实施内容（逐字转出 + 单一来源头注 +
  同源断言测试）已备妥于本轮回报。
- **核对的编排侧事实（只读，未动他角色文件）**：`src/common/编排/shell-gate.ts:50` 注释允许实件在
  `src/service/gate/` **或** `src/common/门禁引擎/`（未点名 `shell-rules.ts`）；更强的表述在
  `src/pipeline/orchestration/shell-arming.ts` 头注（注入源 = 经 `src/service/gate/` 的公开再导出，
  **尚不存在**）；未获注入 ⇒ (c) 一律拒绝（fail-closed，未因缺件而放宽）。
- **形状核对（注入即通，无需适配器）**：编排 `ClassifyShellFn = (argv, rules) => ShellClass |
  ShellClassifyDetail`；实装 `classifyShell(argv: string[], rules: ShellRules): ShellClass`
  （`src/common/门禁引擎/classify-shell.ts:308`）与 `defaultShellRules(): ShellRules`（:498）逐字可注入，
  名字与注释一致。
- **证据（本轮零代码改动，复核现状未被破坏）**：`node --test "test/门禁引擎/*.test.ts"` → **133 计 /
  132 过 / 0 红 / 1 skipped**（Windows 专用）；全量 `node --test "test/**/*.test.ts"` → **800 计 /
  797 过 / 2 红 / 1 skipped**（两红为既有环境红：桌面 pi-config 目录名、pm shared macOS `/var`；
  计数随他角色并发新增变化）；`npm run typecheck` → 0 错。Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **后续（同日）：边界变更获客户确认并落盘**（Section 1 加行：`src/service/gate/shell-rules.ts`，
  purpose「shell 规则集公开再导出（编排 shell 闸 (c) 层的合法注入源；客户 2026-10-12 确认）」）⇒
  **已按备妥内容逐字落地**：新增 `src/service/gate/shell-rules.ts`（逐字转出 `classifyShell` /
  `defaultShellRules`，同一函数引用、不复制实现；头注写明单一来源）+ `test/门禁引擎/
  shell-rules-public-reexport.test.ts`（引用同一性 + 公开入口四态冒烟 + 公开/私有同输入同输出，2 例）。
  **证据**：本角色套件 **135 计 / 134 过 / 0 红 / 1 skipped**；全量 **802 计 / 799 过 / 2 红（既有环境
  红）/ 1 skipped**（799 = 上轮 797 + 本次 2）；`npm run typecheck` 0 错。编排侧**未动**：
  `shell-arming.ts` / `run-role.ts` 的注入接线属编排/装配（本角色只提供公开出口）。

## 2026-10-12 — T-1「未通过产物」暂存区：su 卡文本与治理种子文案写死 `temp/<角色 id>/` 约定（客户 2026-10-12）

客户原话：「应该增加一个 temp 文件夹，里面存储没有通过的文件，这样审核也方便点」。已裁定：**每角色一个
`<项目>/temp/<角色>/`**；**被门禁拒绝的写入内容不存**（保住「拒绝=零副作用」）。本派工是**治理文案，
不是产品代码**——判定逻辑一行未改，创世种子写集不变（仍恰为三处治理产物）。

- **边界**：`src/common/门禁引擎/boundary-core.ts`（`BUILT_IN_ROLE_CARD_TEXT`）、
  `src/common/门禁引擎/governance-seed.ts`（purpose 交叉提示 + 指引注释）、
  `test/门禁引擎/temp-staging-convention.test.ts`（新，5 例）、本文件。未碰 `src/provider|pipeline|
  common/编排|common/pi-adapter|app/**`、本仓库 `.gitignore`、他人 tests/docs。
- **su 卡文本追加（单一来源）**：① 建/改每个项目角色边界时，Section 1 应包含 `temp/<角色 id>/`
  （`kind: directory`，purpose「未通过/返工产物暂存，供审核对照」）；② 退回/返工流程——被验收退回或
  要求返工的产物**先存档**进 `temp/<角色 id>/`（带日期与版本，如 `2026-10-12_草案-v2.md`），并写
  `REVIEW.md` 记「谁退的 / 为什么 / 要求什么」，然后才改主交付物，且该流程随角色卡写进新角色；
  ③ 红线——**不得**把「被门禁拒绝的写入内容」存进 temp（拒绝即零副作用）；temp 属草稿区、不参与 pin；
  ④ 项目角色建 `.gitignore` 时应忽略 `temp/`（本仓库 `.gitignore` 未动，属装配）。
- **治理种子文案同步**：`角色卡/` 条目 purpose 交叉点明「未通过/返工产物另存项目根 temp/<角色 id>/
  ——草稿区，不参与 pin」；**不加** `temp/` 种子条目（`test/测试/cli-genesis-boundary.test.ts` 钉
  「创世种子仍恰为三处治理产物」，写集不动）；完整退回流程只在 su 卡文本（单一来源，种子不复制）。
- **测试**：新用例 5 例全绿（卡文本三项约定 + 流程/红线原文 + **反向断言**：任何「拒绝 × temp」小句必须
  为禁止式、且无肯定式「把被拒内容存 temp」指令 + 种子 purpose 同步且仍恰为三条）。
  本角色套件 `node --test "test/门禁引擎/*.test.ts"` → **133 计 / 132 过 / 1 skipped**（Windows 专用）；
  全量 `node --test "test/**/*.test.ts"` → **792 计 / 789 过 / 2 红 / 1 skipped**（两红为既有环境红：
  桌面 pi-config 目录名、pm shared macOS `/var`；计数随他角色并发新增变化，本角色零新增失败）；
  `npm run typecheck` 0 错。环境：Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **不符之处/须知悉**：种子未加 `temp/` 条目（被钉死的「恰为三处」约束；temp 目录由各角色在自己的
  accepted 边界下创建，su 创世期无此需求）；su 创世期本身不能写项目根 `.gitignore`（不在其写集），
  故「建 .gitignore 忽略 temp/」以对项目角色的约定落在卡文本（客户派工原话即如此框定）。

## 2026-10-12 — 散文式 `boundary.md` 静默解析出 0 条 → **响亮失败**（A）+ 从源头防（C）（客户在批准范围外单独裁定）

真机端到端测试抓到：su 给新角色写**散文式 Markdown** 边界文件（`角色卡/<角色>/boundary.md`，形如
「## 允许写入（白名单，仅此）」+ 反引号路径列表）。文件名白名单接受它（`BOUNDARY_NAMES`），但 legacy
表格解析器静默产出 **0 条**、`parseError` 为空 ⇒ 该角色一切写入被拒，而拒绝信息只说「未匹配任何边界
条目…允许路径：（无）」，**完全不提示「边界文件读不懂」**。`ans-playground2` 只读探针复核（三角色
`entries=0 / parseError=(无) / warnings=[]`）。客户单独裁定修 **A+C**。详见
`docs/fix/2026-10-12_fix_boundary-prose-silent-empty.md`。

- **边界**：全部落在本角色边界内——`src/common/门禁引擎/boundary-core.ts`、
  `src/common/门禁引擎/governance-seed.ts`、`src/service/role/resolve-role.ts`（仅注释）、
  `test/门禁引擎/boundary-empty-and-builtin.test.ts`（新）、本角色 `docs/fix/`、本文件。
  **未动**闸判定（`resolveWrite` 未改）、`src/provider|pipeline|common/编排|common/pi-adapter|app/**`、
  任何他人测试与 docs。
- **A（响亮失败）**：`loadBoundaryFile` 对「文件存在、被读到、但 Section 1 解析出 0 条**且非 YAML**」
  记 `parseError`（`boundary-core.ts:206`），文案含原因 + 出路（「请把该文件改写为 boundary.yaml」）。
  两条链自动随行：`resolveWrite` 既有 parseError 分支的拒绝理由携带原因（经 format-denial 渲染，
  不再只列「允许路径：（无）」）；`listProject` 既有 `parseError` 分支落 **warning**（既有通道）。
- **C（从源头防）**：`BUILT_IN_ROLE_CARD_TEXT` 写死「边界文件必须是 `角色卡/<角色 id>/boundary.yaml`
  （YAML：`role` + `entries`）」+ **最小可抄示例** + 「写 Markdown 散文/表格不会被解析」
  （`boundary-core.ts:41`）；治理种子 `角色卡/` 条目 purpose 同步点名 `boundary.yaml`（`governance-seed.ts:49`，
  格式要求的单一来源仍在 su 卡文本）。
- **合法空集如何区分（结论）**：只针对**文件解析路径**——代码合成边界（内置/治理种子/未接受段）不经
  `loadBoundaryFile`，天然不误伤；**YAML 显式 `entries: []`** 视为作者按声明格式明确表达的空集、
  **不算解析失败**（客户裁定的 O1 角落依赖此类角色仍可枚举）；只有非 YAML 文件解析出 0 条（散文/
  无表格）才是「读不懂」→ parseError；`.md` 带合法 legacy 表格照常解析（未加严）。
- **测试**：新用例 8 例全绿（散文→parseError+出路文案；listProject warning 且无「0 条且无 parseError」
  静默角色；闸链与 format-denial 呈现原因；合成边界不误伤；YAML 显式空集不误伤；legacy 表格兼容；
  su 卡文本/种子 purpose 断言）。全量 `node --test "test/**/*.test.ts"` → **726 计 / 723 过 / 2 红 /
  1 skipped**（两红为既有环境红：桌面 pi-config 目录名、pm shared macOS `/var`；723 = 基线 715 + 新增 8）；
  `npm run typecheck` 0 错。环境：Node v24.14.0 / macOS 26.6.2 / HEAD `d933537`。
- **如实登记的行为后果**：全角色边界都读不懂的项目 `hasRoles` 由 true 变 false——与既有 T14「全无效
  角色」语义一致（含「可发起 bootstrap」提示），桌面据此设 `genesisBootstrap`，su 获得**有界**修复面
  （仅 `角色卡/`、`docs/`、`.ans/`）可把散文边界改写为 boundary.yaml；修复前是死局（su 连边界都改不了）。
  真实模型端到端未验（本改不发真实模型请求）；playground2 未改（修复应由 su 走治理流程完成）。

## 2026-10-11 — T40：shell 闸 (c) 加第四档 `risky`；硬拒不再「危险即拒」（客户 2026-10-11）

客户就 **shell 闸 (c) 的判定**给了新裁定，**部分推翻**设计 §7.3「危险即硬拒终结」。方案见设计
`docs/design/2026-10-11_design_v1-full-implementation.md` **§14（尤其 §14.2/§14.3/§14.4）**、派发清单 **T40**。

### 裁定要点（客户原话）

> 危险命令（`rm` / `sh -c` 这类）**不终结**：先过 (b) pm 审读，**而且无论 pm 怎么判，都还要过 (a) 客户本人确认**
> ——**pm 不是终审，客户才是**。理由：**`rm` 不是永远错的**（删自己刚生成的临时文件合理）；一概硬拒就是
> 「过宽则天天误杀」。**但 PM 已裁（§14.5）**：`sh -c` / `eval` / `node -e` / `awk` 这类「重新引入 shell /
> 内联求值」的形态**仍然硬拒终结**——它们不是「有界的危险命令」，是「任意代码」。

- **边界**：全部落在本角色边界内——`src/model/decision.ts`、`src/common/门禁引擎/classify-shell.ts`、
  `test/门禁引擎/classify-shell.test.ts`。**未动**任何编排文件（`src/common/编排/`、`test/编排/`、`test/测试/`）。

### 改动

- **`ShellClass` 三态 → 四态**（`src/model/decision.ts`）：`"allow" | "deny" | "risky" | "review"`。
  取舍（§14.1）：用**新枚举值**而非「`review` + flag」——次序/终结显式可测。新增 `ShellRiskyRule`
  （与 `ShellHardDenyRule` 同形：`id/programs/onlyWithFlag?/onlyWithSubcommand?`）；`ShellRules` 加
  **`riskyPrograms?: ShellRiskyRule[]`**——**类型标可选、运行时必需**：`validateRules` 对缺失/非数组**一律
  deny**（fail-closed，§7.5）；标可选只为兼容尚未迁移的规则集字面量（如 `test/编排/*` 里手搓的 `ShellRules`），
  不因本档新增而使别角色文件**编不过**。`ShellVerdict.ruleId` 加 `risky:program:<id>`。
- **`classifyShell` 加第 7 步 risky**（在**硬拒之后、白名单之前**）：命中 `riskyPrograms` → 返回 `"risky"`。
  `SHELL_RULES_VERSION` **"2" → "3"**；旧 "2" 规则集因版本不符一律被拒（fail-closed）。
- **硬拒名单重划**（§14.3，原则「**只拒没有正当用途 / 放行即绕过门禁的**」；§7.10 的 `argv-noshell` 前提仍成立，
  **元字符那批仍是空转、不作任何理由**）：
  - **仍硬拒、终结**：① re-shell（`sh`/`bash`/`zsh`/`dash`/`ash`/`ksh`/`fish`/`cmd`/`powershell`/`pwsh`/`wsl`/`busybox`…）；
    ② 求值内建（`eval`/`exec`/`source`/`command`/`.`）；③ 内联求值（`node -e`/`python -c`/`perl -e`/`ruby -e`/`php -r`/`deno eval`…）；
    ④ `awk`/`gawk`（可 `system()`）；⑤ 提权（`sudo`/`doas`/`su`/`runas`/`pkexec`）；
    ⑥ 系统破坏/控制（`mkfs`/`format`/`diskpart`/`wipefs`/`fdisk`/`shutdown`/`reboot`/`halt`/`poweroff`）；
    ⑦ Windows LOLBin（`mshta`/`wscript`/`cscript`/`rundll32`/`regsvr32`/`msiexec`/`certutil`/`bitsadmin`…）。
  - **改判 `risky`**：删除（`rm`/`rmdir`/`del`/`shred`/`truncate`/`dd`…）、原地改写（`sed -i`/`perl -i`/`ruby -i`）、
    编辑器、进程/服务（`kill`/`systemctl`/`reg`…）、网络（`curl`/`wget`/`ssh`…）、**间接执行器**
    （`xargs`/`env`/`nohup`/`timeout`——**程序名在 argv 里可见**）、构建（`make`/`gradle`/`cargo`…）、
    包管理（`npm run/install`/`npx`…）、**文件写**（`cp`/`mv`/`mkdir`/`touch`/`chmod`/`tee`…）、
    `git` 写子命令与 `--output`。

### risky 为何新增

`rm` 这类**不是永远错的**（删自己刚生成的临时文件合理），一概硬拒即设计自认的「**过宽则天天误杀**」；
同时保留「模型不能单独放行」（(b) 判放行后**仍过 (a)**，客户本人看原文）。(c) 不判路径（§7.7/§14.3），
故 `risky` 管的是「危险但正当」，风险交给 **(b) 审读 + (a) 人看原文** 兜。

- **`risky` 的判据**（§14.3-B，落成规则/注释）：**只给「程序名在 argv 里以可读元素出现、语义可判」的形态**——
  因为 (a) 是**客户看命令原文**，得看得懂（`rm -rf build/` 看得懂）。**这是 (a) 能兜住 risky 的前提。**

### `sh -c` 为何仍硬拒（§14.4，核心）

`run_shell` 以 `spawn(argv[0], argv.slice(1), {shell:false})` 执行，但 **`sh -c "…"` 里的 `sh` 自己会解释那段
string ⇒ 该命令的一切影响（含写入）发生在子进程内、完全不经过 `resolveWrite`**。**放行 `sh -c`（及 `eval`/
`node -e`）＝ shell 闸与写边界对那条命令整体失效**——(a) 人虽看得到原文，但**门禁对「那段 string 会写什么」
一无所知、也无法约束**。故 **re-shell/内联求值形态仍硬拒终结、不改判 `risky`**：它们**不是「有界的危险命令」，
是「任意代码」**。同一道理，**`risky` 绝不收「命令藏在 string 里」的形态**。

### 测试与门禁

- **`test/门禁引擎/classify-shell.test.ts`** 重写（**45 例**）：四档**各有一条可达用例**；原硬拒里改判 risky 的
  （`rm`/`dd`/`sed -i`/`git` 写子命令…）现断言 **risky**；仍硬拒的（`sh -c`/`eval`/`node -e`/`awk`/`sudo`/`mkfs`/LOLBin…）
  **逐个钉死**；**反向守卫**（§14.4）：`sh -c` 一类断言 **`deny` 且 `!== risky` 且 `!== allow`**（防后人顺手放宽），
  并对 `eval`/`node -e`/`python -c`/`awk` 同法加守卫；白名单仍 `allow`、未命中仍 `review`；**规则集缺失/非法/
  版本未知/`riskyPrograms` 缺失/形状非法仍 `deny`**（fail-closed 不退化，含新增的「`riskyPrograms` 缺失 → deny」用例）。
- **`test/门禁引擎/`**：`node --test "test/门禁引擎/*.test.ts"` → **120 passed / 0 failed**（其中 `classify-shell.test.ts` 45 例全绿）。
- **`npm run typecheck`**：**零错误**（全仓基线零，改后仍零；`riskyPrograms?` 标可选，故别角色 `ShellRules` 字面量不受影响）。
- **全量**：`node --test "test/**/*.test.ts"`（带引号、Node glob、三层路径）→ **632 passed / 1 failed**（基线 621/0）。

### 回报（跨角色，未动他人文件）

- **`test/测试/t9-block3-pin-shell.test.ts:248`**（属**测试**角色）：断言 `rm -rf build` → **硬拒**（`C_DENY`，
  `(b)/(a)` 不被调用）。现 `rm` 改判 **`risky`**，而**编排（`src/common/编排/shell-gate.ts`）尚未做 T41 改造**——
  它把 `risky` 当 `review` 走 (b) 分支，故 (b) 桩（`{"verdict":"allow"}`）放行 → `allow:true`，用例失败。
  **这正是本条预期、且任务明言「不要越界修」的红**——待 **T41（编排三层次序：`risky` 必过 (a)）** 与
  **T43（测试）** 同步。**本角色未改**（边界外）。
- **`test/编排/*`**（属**编排**角色）：其 `ShellRules` 字面量（`{version:"1", readOnly, hardDenyPrograms, denyTokens}`）
  因 `riskyPrograms?` **标为可选**而**仍能编译**；且这些用例**注入桩 `classifyShell`、不跑真引擎**，故**未失败**——
  如实记录以免误判。

## 2026-10-11 — 空项目不报警：删去无角色目录时的 warning（空项目是**正常状态**）

客户导入一个**没有角色目录的文件夹**后提出：「项目没有角色卡的时候也不用有错误提示啊，**这个是正常的啊**。」
核实：`resolve-role.ts::listProject` 在无 `角色卡/`、`role-cards/` 时**推了一条 warning**，而渲染侧把 warnings
统一按 `--danger`（**错误色**）画在左栏顶部（`app/renderer/styles.css` 的 `.warnings { color: var(--danger) }`）
⇒ **空项目一导入，用户先看到一条红色的「无角色目录」**。但空项目**本就是正常状态**：客户为「空文件夹 → 与 su
对话 → su 建角色」专门做了整套流程，`hasRoles:false` 与界面「项目尚未 bootstrap」提示已把它说清楚。

- **判断（本条核心）**：**warning 的语义是「有东西不对劲」**（某角色目录缺 `boundary.yaml`、边界解析失败、角色
  重复……）——**空项目不属于这一类**。既然「尚未 bootstrap」是**正常初始态**，就**不该报警**：一条红字是纯噪声，
  还会误导用户以为导入出了问题。
- **边界**：全部落在本角色边界内——`src/service/role/resolve-role.ts`、`test/门禁引擎/list-project.test.ts`。

### 改动

- **删去 warning**：`listProject` 在无角色目录时**不再 `warnings.push(...)`**（原「项目根下无角色目录……可发起
  bootstrap」那条整块删除）。**返回值其余部分逐字不动**：照常返回 `[内置 su] + hasRoles:false + primaryRoleId`
  （`roles` 仍只含内置 su 一条；`hasRoles` 仍为 false；`primaryRoleId` 仍为 `BUILT_IN_GOVERNANCE_ROLE_ID`）。
- **改注释**：原注释写「无角色目录**不再抛错**」（理由：不是错误），更新为「无角色目录**是正常状态**：既不抛错、
  **也不报警**——`hasRoles:false` 与界面「项目尚未 bootstrap」已说清，再画红字是噪声；warnings 只留给真异常」。
  函数首部 JSDoc、`ProjectListing.warnings` 字段注释、「有角色目录但无有效角色」那段注释均同步更正。
- **保留全部真异常 warning**（**未动**）：缺 `role-card.md`、缺 `boundary.yaml`、读卡失败、边界解析失败、角色
  重复，以及「**有角色目录却无有效角色**」的汇总提示——后者是真异常（有人建了目录却没建成角色），**继续报警**。

### 测试与门禁

- **`test/门禁引擎/list-project.test.ts`**：T14「导入空目录」用例——删去「warning 含『无角色目录』/『可发起
  bootstrap』」断言，改为**断言 `warnings` 为空**（`deepEqual(listing.warnings, [])`），并加**反向守卫**
  `some(w => /无角色目录/.test(w)) === false`（断言**不含**该警告，而非仅删除断言）。**正面断言全保留**：
  `hasRoles:false`、`roles` 只含内置 su、`primaryRoleId:"su"`、su 的 `builtIn/cardPath/boundaryPath/acceptance`。
  真异常用例（「有角色目录但全无效角色」→ 仍含「缺少 boundary」「未枚举到有效角色」）**逐字保留**。
- **`test/门禁引擎/`**：`node --test "test/门禁引擎/*.test.ts"` → **108 passed / 0 failed**。
- **`npm run typecheck`**：**零错误**（全仓基线零，改后仍零）。
- **全量**：`node --test "test/**/*.test.ts"`（带引号、Node glob、三层路径）→ **597 passed / 1 failed**
  （基线 598/0）。唯一失败见下，**非本角色文件、未改**。

### 回报（跨角色，未动他人文件）

- **`test/测试/t9-block1-bootstrap.test.ts:122`**（属**测试**角色）：断言「导入空文件夹 → `listing.warnings`
  含『bootstrap』或『无角色目录』」，现因本条去掉 warning 而失败（`实际 []`）。这正是本条要求回报的「**别的角色
  仍在断言那条 warning**」——需其属主同步为「warnings 为空 + hasRoles:false」。**本角色未改**（边界外）。
- **`test/桌面应用/interface.test.ts`**（属**桌面应用**角色）：`warnings:["项目根下无角色目录"]` 仅作
  `listProjectFn` 的**桩数据**，不断言真实 `listProject` 输出（其断言只关 `readOnly`/`primaryRoleId` 透传），
  故**未失败、无需改**——如实记录以免误判。

## 2026-10-11 — T31：种子边界迁入门禁引擎 + 条件目录改普通目录（消 §6 违规）

客户要做**真实端到端测试**（空文件夹 → 与 su 对话 → su 建出角色），核实发现**这条路跑不通**：空项目上
su 的 gate 对「项目根治理种子边界」求值，而种子条目**全是条件目录**——条件目录须由 `TaskScope.conditions`
显式声明 slug 才激活，桌面开 su 会话传的是 `scope: undefined`（聊天无预先任务）⇒ 条件恒不激活 ⇒
**su 一切写入被拒**。核心裁决（§12.2）：把创世的「门口」从**条件层**挪到**边界选择层**。方案出处：
设计 `docs/design/2026-10-11_design_v1-full-implementation.md` §12（尤其 §12.2/§12.4）、派发清单 T31。

- **边界**：全部落在本角色边界内——`src/common/门禁引擎/governance-seed.ts`（**新增**）、
  `src/common/门禁引擎/boundary-core.ts`、`src/model/role.ts`、`test/门禁引擎/cold-start-genesis.test.ts`。
  `src/common/编排/bootstrap.ts` **只读、未改**（迁出方属编排，T32 收）。

### 改动

- **消 §6 违规（搬迁非 fork）**：`governanceBoundaryEntries` 与 `buildGovernanceSeedBoundaryForGate` 原在
  编排私有 `src/common/编排/bootstrap.ts`，被 `boundary-core.ts` 以 `import … from "../编排/bootstrap.ts"`
  跨角色导入——**两重违规**（跨角色导入他人私有 `common/` ＋ Service 层反向依赖 Pipeline）。现**搬迁**至
  新文件 `src/common/门禁引擎/governance-seed.ts`（`GOVERNANCE_BOUNDARY_REL` 常量一并带入，供
  `boundarySource` 标签），`boundary-core.ts` 改从本角色内 `./governance-seed.ts` 导入。**编排那份未删**
  （`bootstrap.ts` 属其边界，T32 收）——**并存窗口**内编排侧仍走自身副本，本角色改走新副本。
- **条件目录改普通目录（本次核心，§12.2）**：种子三条目 `角色卡/`、`docs/`、`.ans/` 由
  `kind: "conditional-directory"`（带 `condition` slug）改为 `kind: "directory"`（**无** `condition`）。
  于是 `scope: undefined` 下：`角色卡/…`/`docs/…`/`.ans/…` **命中即 `allowed`**；`src/**` 不匹配 → **拒**。
  **无需 scope、也无需 slug**。复核过协调方否掉「创世 scope」设想的结构性理由：`resolve-write` 的 F4 里
  `writeSet` 是**精确集合**（`compareKey` 逐项相等），表达不了「`角色卡/<对话中才定的角色>/…`」；而空
  `writeSet` 的既有语义是「拒一切」（旧治理占位正是用它 deny-all）——故把门放在**边界选择**层最干净。
- **`src/model/role.ts`**：更新 `genesisBootstrap` 文档注释，如实描述「普通目录、无需 scope/slug」的新语义。
- **`src/common/门禁引擎/boundary-core.ts`**：改 import；同步文件头/分支 3 注释（条件目录 → 普通目录）。

### 有界性复核（未破坏，仍非 blanket）

1. 种子边界**只在 `ProjectConfig.genesisBootstrap` 被显式设置**时出现（构造性事实，非自动推论）；
2. 条目**仍只有** `角色卡/`、`docs/`、`.ans/` 三个（**绝不含 `src/`、不含项目内任意文件**）；
3. **自终止**仍成立：项目自己的治理边界文档写出并经 pin 接受（`governanceBoundary.path` 非空）后，
   **项目覆盖**分支先命中、创世分支永不求值——**即便 `genesisBootstrap` 残留亦然**（结构性，不依赖调用方清除）。

### 测试与门禁

- **`test/门禁引擎/cold-start-genesis.test.ts`**：改写为反映新语义，新增 3 个 T31 用例——**要害**
  （`genesisBootstrap` 设、`scope:undefined` → su 对 `角色卡/<任意新角色>/…`、`docs/…`、`.ans/project.json`
  判 **allowed**，即本次要害）、**负面**（`scope:undefined` → `src/**`、项目根外、`README.md`/`package.json`
  **拒**）、**回归**（不设 `genesisBootstrap` → su 逐字等于内置未接受边界、拒一切写）；去除已失效的
  「条件有界（须声明 slug）」用例。
- **`test/门禁引擎/`**：`node --test test/门禁引擎/*.test.ts` → **108 passed / 0 failed**。
- **`npm run typecheck`**：**零错误**（全仓基线零，改后仍零）。
- **全量**：`node --test "test/**/*.test.ts"`（带引号、Node glob、三层路径）→ **554 passed / 0 failed**
  （与基线 554/0 逐字一致）。
- **并存窗口验证**：编排私有 `bootstrap.ts`（自身条件目录副本）与 `test/编排/bootstrap.test.ts`、
  `test/测试/t9-block1-bootstrap.test.ts`（走编排侧种子/项目覆盖）**全绿**——搬迁对本角色外**行为逐字不变**，
  唯一有意差异即本任务对种子条目 `kind` 的改动。

### 顺带发现（非本角色，仅供协调方）

- **又一处跨角色私有导入**：`src/common/编排/shell-gate.ts:61` `import … from "../../common/pi-adapter/timeout.ts"`
  ——编排私有 `common/` 导入 **Pi适配器**私有 `common/`（同类 §6 风险）。**未动**（非本角色边界），如实回报。

## 2026-10-11 — T25：`paths.ts` 收敛共享路径原语（删本地镜像，改同名转出）+ 修 3 处 typecheck

设计 §3.11 行 5/6 裁决：同一套词法路径语义曾被门禁引擎与 Pi适配器写入层**各自维护**，二者必须逐字同源，
否则「gate 认为在根内」与「写入层认为在根内」漂移会留**误放行**空间。词法原语已整体搬迁至
`src/common/shared/path-primitives.ts`（属主：项目管理）；本任务令门禁引擎侧**删除本地副本、改从共享模块导入**。
方案出处：设计 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.11、派发清单 T25、
`docs/change/2026-10-11_change_shared-path-primitives.md`。

- **边界**：全部落在本角色边界内——`src/common/门禁引擎/paths.ts`、`test/门禁引擎/pin-acceptance.test.ts`。
  `src/common/shared/path-primitives.ts` **只读**导入，未改（属 pm）。

### 改动

- **`src/common/门禁引擎/paths.ts`**：删去八项本地实现——`IS_WINDOWS`、`toPosix`、`isAbsoluteAny`、
  `normalizeLexical`、`compareKey`、`isUnderOrEqual`、`absRel`、`realResolve`；改为
  `export { … } from "../shared/path-primitives.ts";`（**同名转出**）。既有消费方（`io.ts`、`boundary-yaml.ts`、
  `boundary-parse.ts`、`boundary-core.ts`、`src/service/gate/resolve-write.ts`）与共享原语测试
  （`test/项目管理/shared/path-primitives.test.ts` 的「逐字同源」用例从 `paths.ts` 只读导入旧实现）导入路径与名字**均不变**。
- **行为逐字不变**：各函数体本就逐字相同；唯一文本差异是共享 `realResolve`（第 115 行）比旧本地版多包一层
  `toPosix(real)`——`normalizeLexical` 入口首行即对整串 `toPosix`，且 `tail` 片段源自已 `toPosix` 的 `q`，
  故拼接结果恒等，**无输入产生行为差异**（已核，未发现需回报的分歧）。
- **`test/门禁引擎/pin-acceptance.test.ts`（3 处 typecheck）**：原报 `b.parseError`（129/145/154 行）为
  `string | undefined`，`assert.match` 形参要求 `string`。修法：在 `assert.match` 前各补一行
  `assert.ok(typeof …parseError === "string");` 收窄类型（与文件既有 87 行同一手法）。不加长/不改变运行时断言语义。

### 测试与门禁

- **`test/门禁引擎/`**：`node --test test/门禁引擎/*.test.ts` → **108 passed / 0 failed**。
- **`npm run typecheck`**：本角色 3 处**归零**（余 8 处属 `pi-adapter`/桌面应用/编排，**未动**）。
- **全量**：`node --test "test/**/*.test.ts"`（带引号、Node glob、三层路径）→ **445 passed / 0 failed**（全绿）。

## 2026-10-11 — T14/T15：`listProject` 空目录不抛错 + `primaryRoleId`；冷启动「有界创世例外」

客户推翻固定模板 `ans init`（改为「导入空文件夹 + 与内置治理角色 su 对话，由 su 建角色」）后的两项门禁引擎任务。
方案出处：设计 `docs/design/2026-10-11_design_v1-full-implementation.md` §10（尤其 §10.1/§10.2/§10.7）、派发清单 T14/T15。

- **边界**：全部落在本角色边界内——`src/model/role.ts`（`ProjectConfig` 追加可选字段）、
  `src/service/role/resolve-role.ts`、`src/common/门禁引擎/boundary-core.ts`、`test/门禁引擎/`。
  未动 `src/common/编排/bootstrap.ts`（**只读复用**其 `buildGovernanceSeedBoundaryForGate`）、未动 `app/`。

### T14 —— `listProject` 对无角色目录的文件夹不再抛错 + 新增 `hasRoles` / `primaryRoleId`

- **问题**：原 `resolve-role.ts:114` 在无 `角色卡/` 时抛「项目根下未找到角色目录」→ 桌面导入空文件夹只显示
  「导入失败」，**连 su 都看不到**；而 su 是主入口（§10.2）。
- **改法**：无角色目录（`角色卡/`、`role-cards/` 皆无）时**不抛错**——返回 `[内置 su] + warning + hasRoles:false`。
  **项目根不存在 / 不是目录 / 角色目录路径是文件仍抛错**（真错误，非「尚未 bootstrap」）。
- **新增字段**（`ProjectListing`）：`hasRoles: boolean`（有没有枚举到**项目角色**；空项目为 false，界面据此显示
  「尚未 bootstrap」并引导与 su 对话）与 `primaryRoleId: string`（**主入口角色 id = `BUILT_IN_GOVERNANCE_ROLE_ID`**，
  即内置 su）。`primaryRoleId` 由门禁引擎给、**单一来源**——桌面渲染侧据此设主位/默认选中，**不得硬编码 `"su"`**
  （§10.7，与「不硬编码角色 id」既有纪律一致）。warning 文案里的 id 亦取自常量，不写死字面量。
- **`hasRoles` 语义**：`roles.some(r => r.builtIn !== true)`——内置 su 恒在 `roles` 里，故不能只看 `roles.length`；
  有角色目录但一个有效角色都没枚举到（全缺文件/解析失败）同为 false，并补一条同义提示。

### T15 —— 冷启动「有界创世例外」（本次设计核心，机制落实）

- **问题**：su 的 gate 对**项目治理边界**求值；`ans init` 废掉后空项目上无这份边界 → 回退内置（`root:skill`、
  **未接受**）→ su 一个字都写不了。而「导入空文件夹 + 与 su 对话」必须能让 su 把角色建出来。
- **机制**（两件东西共同构成，§10.1）：
  1. **工具提供的「项目根」治理种子边界**（不落进项目，只作 gate 求值对象）：把内置边界那几条**条件目录**按
     **project 根**求值——`角色卡/`(role-restructuring)、`docs/`(docs-bootstrap)、`.ans/`(project-init)。
     **单一来源**：`boundary-core.ts` 从编排 `bootstrap.ts` **复用** `buildGovernanceSeedBoundaryForGate`
     （§10.1「改造复用」），**不另写一份**（路径/slug 两处漂移会令 F5 判定失真）。
  2. **「操作者发起的 bootstrap」作为 acceptance**：由调用方经 **`ProjectConfig.genesisBootstrap = { source }`**
     **显式**设置（源为导入空文件夹并开启 su 对话的操作者指令）；`acceptance = { accepted:true, source }`。
     `source` 即该指令，**逐路径留痕**（`docs/bootstrap-manifest.md`）据此可溯。
- **落点**：`resolveBoundarySection` 新增**第 3 步**（在「治理边界覆盖」之后、「内置」之前）；对
  **内置治理角色** + `genesisBootstrap` 存在时返回治理种子边界。**不是** `accepted:true` 的自动推论
  （那样任何已接受项目都会意外获得创世 = blanket）——故用**独立字段显式触发**。
- **两条「导入即授权」的区分（代码注释亦写明）**：
  · **已有角色的项目** = **per-role-boundary**（第 1 步「项目覆盖」，按角色各自边界）；
  · **空项目** = **有界创世**（第 3 步，仅治理产物）。
  **两者都不是空白支票**——共同上界仍是「Section 1 / 治理产物集」。
- **四条「非 blanket」性质如何落地**（每条都有测试）：
  1. **写集有界**：种子只含三项条件目录（`角色卡/`/`docs/`/`.ans/`，全部 `root:project`），**不含 `src/`、
     不含任意文件**。测试正例：`角色卡/<新角色>/{role-card,boundary,memo}`、`角色卡/governance-boundary.yaml`、
     `docs/…`、`.ans/project.json` 放行；负例：`src/**`、`app/**`、`README.md`、`任意文件.txt`、近前缀
     `角色卡_new/x.md` 一律拒（理由「未匹配任何边界条目」）。
  2. **条件有界（F5）**：三项均为 `conditional-directory`，须任务在 `scope.conditions` **显式声明** slug 才激活。
     负例：不声明、或声明**别的** slug → 写前拒，理由含「缺少条件 <slug>」。
  3. **自终止（最关键）**：第 3 步置于第 2 步**之后**——`governanceBoundary.path` 非空（项目边界文档已写出并登记）
     时第 2 步先命中、创世分支**永不求值**。测试：项目边界文档写出 + SHA-256 pin 接受后，**即便 `genesisBootstrap`
     残留**，`resolveBoundarySection` 仍走项目覆盖（`boundarySource` = 项目文件、`acceptance.source` = pin 证据）；
     此时创世能写的 `角色卡/Y/…` **写不了**（项目边界未覆盖），证明授权真的换了。对照测试：同项目**不设**该字段时
     结果一致（创世非放行因素）。**自终止是结构性的，不依赖调用方清除字段。**
  4. **逐路径留痕**：`acceptance.source` 携操作者指令（随 `resolveRole` 贯通到治理会话入口）；
     `docs/bootstrap-manifest.md`（在 `docs/` 条件目录内）在创世下**可写**——留痕路径被授权。
- **fail-closed 不放松**：`genesisBootstrap.source` 为空 → 边界虽 `accepted:true` 但 `source` 空，
  `resolveWrite` 的 **F6 接受门仍拒一切写**（不因「声称创世」而放行无证据写入）；创世**只对内置治理角色生效**，
  项目角色不受益（仍回退内置未接受）。

### 测试

- 新增 `test/门禁引擎/cold-start-genesis.test.ts`（**9 例**）：边界求值/仅作用于内置/source 空 fail-closed/
  写集有界正例/负例/条件有界/自终止/自终止对照/留痕。
- 改写 `test/门禁引擎/list-project.test.ts`：删「无角色目录抛错」断言（T14 已改语义），拆为「真错误仍抛错」
  + 「空目录不抛错（su + warning + hasRoles:false + primaryRoleId）」+「有目录但全无效角色」；真实项目/英文/中文
  三例补 `hasRoles`/`primaryRoleId` 断言。
- **`test/门禁引擎/`**：`node --test "test/门禁引擎/*.test.ts"` → **108 passed / 0 failed**（原 97：list-project +2、genesis +9）。
- **全量**：`node --test "test/**/*.test.ts"`（**带引号，走 Node glob**，三层路径）→ **405 passed / 0 failed**（全绿）。
  基线 393；本角色 +11；其余增量来自**并行施工的其他角色**（以 0 failed 为准）。

### 回报（跨角色）

- **编排（T16）需知情**：`boundary-core.ts` 现从 `src/common/编排/bootstrap.ts` **复用**
  `buildGovernanceSeedBoundaryForGate`。§10.4 提到该库**可改名** `governance-writes.ts`——**若改名，须同步更新本 import**。
- **桌面应用（T17）需知情**：`ProjectListing` 增了**必需**字段 `hasRoles`/`primaryRoleId`；
  `test/桌面应用/interface.test.ts` 等处构造 `ProjectListing` 字面量的用例需随之补齐这两字段
  （本环境未装 TypeScript，`npm run typecheck` 跑不了，故 `node --test` 不报；有类型检查器时会报）。
  另：空项目需由桌面/编排在导入空文件夹并开启 su 时设置 `ProjectConfig.genesisBootstrap`，创世方生效。

## 2026-10-11 — T8a：shell 规则集按「程序 + argv」重述（§7.10）+ 裁 `ShellRules.id?`

PM 复核 T7 第一步后改了两处规格，本条跟着改。方案出处：设计 `docs/design/2026-10-11_design_v1-full-implementation.md`
§7.10（命令解释模型）、§7.3「前提修正」、§7.1/§7.5/§7.7。

- **边界**：全部落在本角色边界内——`src/model/decision.ts`（追加类型，不改既有）、
  `src/common/门禁引擎/classify-shell.ts`、`test/门禁引擎/classify-shell.test.ts`。
- **改动动因（§7.10）**：Pi适配器执行 `spawn(argv[0], argv.slice(1), { shell:false })`——命令**不经 shell 解释**。
  因此原规则集里的**元字符硬拒**（`>` `|` `&` `;` `$(` 反引号 `<<` 换行）在这个模型下**永不以「被解释」形式出现**，
  扫它们是**空转**，更糟——给人**「拦住了重定向」的假安全感**，还误杀 `grep 'a|b'` 一类正常参数。
- **重述后的规则集结构（按「程序 + argv」分类）**：
  1. **`argv[0]` 程序黑名单**（`hardDenyPrograms`，绝对否决）：外壳/解释器 `sh bash cmd pwsh …`；破坏性
     `rm rmdir del shred truncate dd mkfs …`；写入/权限 `cp mv mkdir touch tee chmod …`；编辑器；进程/系统；
     网络；执行包装器 `xargs env eval exec sudo …`；Windows LOLBins；构建/任务运行器 `make gradlew dotnet …`；
     `npx/corepack`；**git 写子命令**（`checkout commit push reset …`）。白名单（`readOnly`）仍按只读程序：
     `ls cat grep git status/log/diff… node --version npm ls`。
  2. **危险 flag**：`ShellHardDenyRule` 的 `onlyWithFlag` 表达「程序 + flag 才判」——`sed -i`/`perl -i`（原地改写；
     普通 `sed` 仍 review）、解释器内联 `node -e`/`python -c`/`perl -e`；**新增 `git --output`**（`git-output-write`，
     `--output`/`--output=<f>` 会把结果写盘）——`git log --output=x` **由 review 改为 deny**。
  3. **写目标——按程序性质判，不看有没有 `>`**：`cp`/`mv`/`tee`/`dd`/`mkdir`/`chmod` 等**自身即写**的程序一律硬拒；
     `git checkout`/`node -e` 照样能写、照样拦。**不因「无 shell」就认为安全**（§7.10 明列）。
- **元字符那批怎么处理（结论：如实改为参数字符，不再硬拒）**：给 `ShellRules` 加可选
  `executionModel: "argv-noshell" | "shell-string"`。引擎**仅在 `executionModel !== "argv-noshell"` 时**才扫
  `denyTokens`（含换行/回车结构性拒绝）。默认规则集标 `"argv-noshell"` ⇒ 元字符**不生效**（真话）；
  **缺省（省略该字段）按最保守处理——假定 shell 会解释 ⇒ 元字符生效**（fail-closed 缺省，兼容旧规则集）。
  `denyTokens` 数据**保留在规则集里**，它是**待恢复集合**而非当前判据。理由：保留硬拒=空转+假安全+误杀；
  如实按参数处理既消除误杀，又用 `executionModel` 把「何时该恢复」编码成**机器可查**的前提。
- **★ 耦合记录（§7.10，逐字钉住）★**：上面「不扫元字符」的前提**绑定 `shell:false`**。**若执行层改回原始命令串
  或 `shell:true`，元字符规则必须恢复**——把 `rules.executionModel` 改为 `"shell-string"`（或删掉该字段走保守缺省），
  否则 `> /path`、`$(...)`、`cmd | sh` 会被**漏掉**，出现「以为拦了、其实没拦」的洞。此耦合同时写进
  `classify-shell.ts` 顶部注释、`defaultDenyTokens()` 注释与 `src/model/decision.ts` 的 `executionModel` 注释。
- **版本**：`SHELL_RULES_VERSION` `"1"`→`"2"`（规则集语义有实质变化：元字符拦截现随 `executionModel` 条件生效；
  版本闸照旧「未来格式被旧引擎误判 → 硬拒」，方向 fail-closed）。**校验新增**：`executionModel` 若存在须为已知取值
  （未知 → deny）；`id` 若存在须为非空字符串（非法 → deny）。
- **裁 `ShellRules.id?`（编排悬着的问题）：需要，已加可选 `id?: string`**。理由：§7.6 要求审计记「谁审的」——
  (c) 一层要能追「判决出自**哪一套规则集**」。当前 `classifyShellDetailed.ruleId` 只给**命中的单条规则** id
  （如 `deny:program:git-write`），不含规则集身份；编排此前被迫用调用方另传的 `rulesId` 选项。给规则集自带 `id`
  令其**自我标识、单一来源**（默认规则集 id=`"ans-default-v2"`），编排可取 `rules.id ?? rulesId ?? "default"`，
  不必 fork、不必依赖调用方记得传。**故答复编排：确需，且已由门禁引擎在 `model/decision.ts` 单一来源加上**。
- **仍拦不住（已知缺口，测试继续钉死，不假装新规则集覆盖了）**：① 间接执行类不可穷尽——`node script.js`、
  `python foo.py`、`perl script.pl`、`java -jar app.jar`、项目内 `./deploy.sh`/`./build`、任意 PATH/仓库内二进制
  → `review`；② **git 别名**（`git my-alias`）不解析 → 未知子命令 → `review`；③ 按程序名匹配、不做 PATH 解析
  （同名遮蔽二进制可放行，(c) 职责之外）；④ `sh -c "…"` 这类**在参数里重新引入 shell** 的形态**守住**——外壳本身在
  黑名单，且 `argv[0]` 含空白（整条命令串）也 deny。**（原「git log --output=x 落 review」缺口本条已闭合，改为 deny。）**
- **`test/门禁引擎/classify-shell.test.ts`（33 例，含新增）**：新增「按 argv 判写能力」——`tee`/`dd of=`/`cp`/`mv`/
  `node -e`/`python -c`/`git checkout`/`git --output` 均 deny；新增「执行模型耦合」——argv-noshell 下 `>`/`|`/`$()`/
  换行是参数字符（allow），shell-string 与缺省下恢复拦截（deny）；新增 `executionModel` 未知→deny、`id` 非法→deny。
- **测试**：`node --test "test/门禁引擎/*.test.ts"` → **97 passed / 0 failed**（原 92；classify-shell 由 28 → 33）。
- **全量**：`node --test "test/**/*.test.ts"` → **360 passed / 0 failed**（全绿）。

## 2026-10-11 — T7 第一步：shell 命令级闸 (c) 确定性规则引擎（`classifyShell`）

「给 shell，但执行前必须过 pm 审核」的第一道闸（硬地板）。写类拦截原本靠固定工具名集合 +
**路径判据**（`resolveWrite`），而 shell 里 `echo x > 路径` 的写入不经过 `resolveWrite`（§7.1）；
故 shell 需一道**判据不同**的闸——问「这条命令是否被允许执行」。方案出处：设计 §7.1/§7.2/§7.3/§7.5/§7.7。

- **边界**：`src/model/decision.ts`（**仅追加**共享类型，不改既有类型）、
  `src/common/门禁引擎/classify-shell.ts`（新增）、`test/门禁引擎/classify-shell.test.ts`（新增）。
- **落点与理由**：落在 `src/common/门禁引擎/`（本角色唯一可**新增文件**的代码目录）。**未落 `src/service/gate/`**——
  Section 1 把该目录下的 `resolve-write.ts` 列为**单文件**条目（非目录条目），新增 `classify-shell.ts` 会越界；
  按「越界回报、不动手」取其唯一授权目录。**待协调（回报）**：设计 §7.4 允许 `src/service/gate/`，且按
  「不得导入其他角色私有 common」的约定，装配方（编排）消费 `classifyShell` 需要一个**公开 service 入口**
  （如 `src/service/gate/classify-shell.ts` 再导出）——需 Governance 更新 Section 1；**本角色未自行新增该文件**。
- **接口（冻结契约 §7.4，照做）**：纯函数 `classifyShell(argv, rules) => "allow" | "deny" | "review"`；
  另导出 `classifyShellDetailed(argv, rules) => { decision, reason, ruleId }`（**附加**、非改形状，供审计取规则 id §7.6）、
  `defaultShellRules()`、`SHELL_RULES_VERSION`。
- **三态语义（§7.3）**：白名单命中 → `allow`；硬拒命中 → `deny`（**绝对否决**，不可被 (b)/(a) 翻案）；都不命中 → `review`。
  **硬拒先于白名单**判定（白名单程序带危险记号，如 `echo x > f`、`cat x | sh`，整体 deny）。
- **默认（未命中）判 `review` 而非 `deny`**：理由——(c) 是**硬地板**而非唯一闸；其上 (b) pm 审读 (a) 操作者兜底，
  存在的意义正是裁决「常规命令」；若 (c) 默认 deny，则 (b)/(a) 无立锥之地，且「过宽则天天误杀」。
  **注意**：T7 第一步 (b)/(a) 未接，装配方对 `review` **默认拒绝**（设计 T7 验收）——此「白名单或拒」是**装配方的
  fail-closed 桥接**，不是 (c) 的语义。
- **选定的规则集**（数据驱动，见 `defaultShellRules()`；原则：已知危险就拒、只读就放、其余交 (b)/(a)）：
  - **白名单（只读、非执行）**：`ls pwd cat head tail wc grep rg findstr diff echo date whoami hostname uname which where printenv stat readlink basename dirname`；
    `git`（仅只读子命令 `status/log/diff/show/blame/ls-files/ls-tree/shortlog/whatchanged/describe/rev-parse/rev-list/merge-base/cat-file/grep/show-ref/name-rev/for-each-ref/var/count-objects/fsck`，且 `--output/-o` 列 blockedFlags）；`node --version/-v`；`npm ls/list/--version/-v/view/outdated/root/prefix`。
  - **硬拒程序**：外壳 `sh bash zsh dash ash ksh csh tcsh fish busybox cmd powershell pwsh wsl winpty script expect`；
    破坏性 `rm rmdir del erase rd shred truncate dd mkfs format diskpart fdisk wipefs srm`；写入/权限
    `touch mkdir md cp mv move rename ln mklink install tee patch chmod chown attrib icacls takeown mount umount …`；
    编辑器 `vi vim nvim nano emacs ed notepad`；进程/系统 `kill taskkill shutdown reboot reg schtasks crontab systemctl …`；
    网络 `curl wget scp sftp ftp rsync nc ssh psexec …`；执行包装器 `xargs env nohup nice timeout watch sudo su runas eval exec source command …`；
    解释器内联 `node/python/perl/ruby/php/lua -e/--eval/-c/-r …`；原地改写 `sed/perl/ruby -i/--in-place`；`awk`（可 system()/重定向）；
    Windows LOLBins `osascript wscript cscript mshta rundll32 regsvr32 msiexec certutil bitsadmin …`；构建/任务运行器
    `make just rake gradle gradlew mvn ant msbuild dotnet cargo go`；`npx corepack`；git 写子命令 `commit push pull fetch checkout reset clean merge rebase …`。
  - **硬拒记号（子串，逐 argv 元素扫）**：`>` `|` `&` `;` `$(` 反引号 `<<`（`>` 覆盖 `>>`/`2>`；`&` 覆盖 `&&`/`&>`；`|` 覆盖 `||`/`|&`），
    外加**结构性恒拒**的换行/回车。
- **fail-closed 如何「结构上不可能退化」**（§7.5 第一条）：`classifyShell` **要求显式传入 rules**（无默认参数、无 rules 可选重载）；
  `rules` 缺失/非对象/版本未知/形状非法 → `deny`；`argv` 缺失/为空/含非字符串元素 → `deny`；换行/回车结构性恒拒；
  `argv[0]` 为空或含空白 → `deny`。**唯一通向 `allow` 的分支是「命中一条通过校验的白名单条目」**——无规则 ⇒ 结构上到不了 allow；
  空规则集只到 `review`、绝不到 `allow`（有测试钉死）。
- **`argv` 而非命令串（§7.2）**：(1) 直接 spawn 时 `> | & ;` 本是普通字符，但上层可能按空白切分命令串，故仍**逐元素子串扫**危险记号；
  (2) `sh -c "…"` 把真实命令藏在参数里、无法可靠反推：**外壳/解释器本身就在硬拒名单**，且「`argv[0]` 含空白」（塞进来的是整条命令串而非程序名）也判 `deny`。
- **如实登记的已知缺口**（各以断言钉死在案，不假装不存在）：① 间接执行类不可穷尽——拒了命名的 `npm run`/`make`/`gradlew`/`dotnet run`，
  但 `node script.js`、`python foo.py`、`perl x.pl`、`java -jar`、项目内 `./deploy.sh`/`./build`、任意 PATH/仓库内二进制、git 别名都落 `review`；
  ② 白名单程序冷门写开关（`git log --output=x` 落 `review` 而非 deny）；③ 按程序名匹配、不做 PATH 解析（遮蔽二进制可放行，(c) 职责之外）；
  ④ 有意过头拦截：`grep 'a|b'`、`grep 'a>b'` 判 `deny`（因 `|`/`>` 必须拒，否则 `cat x | sh` 会放行）。
- **与 `GOVERNED_WRITE_TOOLS` 的关系（§7.7）**：`run_shell` **不加入**该写类集合；本引擎走**独立的命令级判据**、不喂 `resolveWrite`。
- **测试**：新增 `test/门禁引擎/classify-shell.test.ts`（**28 例**）。
  `node --test "test/门禁引擎/*.test.ts"` → **92 passed / 0 failed**（原 64 + 本条 28）。
- **全量**：`node --test "test/*/*.test.ts"` → **317 passed / 0 failed**（全绿）。注：其它 T7 角色**并行施工**，全量测试数在变
  （本角色开工基线 253 → 交付时 314→317），故以「**0 failed**」为准，不写死数字。本角色相关套件 `test/门禁引擎/` 恒 92/0。
- **未做/待接**：(b) pm 审读、(a) 操作者通道、审计落盘、`run_shell` 工具、扩展 token 兜底——属 T7 其它部分（Pi适配器/编排/pm）与 T8；本角色只交付 (c)。

## 2026-10-11 — T1：`.ans` SHA-256 pin 与 acceptance 链（F6 由「配置自称」升级为「可验证证据」）

把 `Acceptance` 的 `accepted: true` 从**谁都能写的配置自称**升级为**可验证证据**：边界文件被
SHA-256 pin 钉死，篡改即失效、fail-closed。方案出处：设计 §3.3、§5.3（T1）。

- **边界**：全部落在本角色边界内——`src/model/boundary.ts`、`src/common/门禁引擎/io.ts`、
  `src/common/门禁引擎/boundary-core.ts`、`test/门禁引擎/pin-acceptance.test.ts`。
- **Model 形状（本角色定，论证见下）**：`Acceptance` 增可选 `pin?: PinEntry[]`，
  `PinEntry = { path: string; sha256: string }`。
  - **逐文件而非项目级**：一个项目的边界文件不止一份（每角色一份 + 治理边界文档），
    单个项目级 hash 表达不了「接受的是哪几份、各自 hash 是什么」。
  - **数组而非映射**：每条证据自述「哪个文件 → 哪个 hash」，与顺序无关，且失败时能逐条定位是哪条 pin 不符。
  - **硬约束**：声明了 pin 时，`accepted === true` 必须能追到某个固定 hash（见下校验）。
- **校验（`boundary-core.ts::loadBoundaryFile`）**：仅当 `accepted === true && pin !== undefined` 时启用。
  1. 校验 pin 形状（非空数组、每条 `path/sha256` 非空）——非法即未接受；
  2. 对**每一条** pin 指向的文件按**原始字节**算 SHA-256（`io.ts::sha256File`）与声明比对
     （十六进制、大小写不敏感）；**读不到/不存在 → 视为不匹配**（fail-closed）；
  3. 要求**当前加载的边界文件被至少一条 pin 覆盖**——否则不得凭无关 pin 认可。
  任一不过 → 返回 `{ entries: [], acceptance: { accepted: false, source: "" }, parseError: <原因> }`。
- **pin 不匹配时 acceptance 变成什么**：`{ accepted: false, source: "" }`（**未接受**，且 **source 清空**）。
  不采用「带说明性 source」——那会留下一个「有证据来源」的观感，制造「看起来被接受其实没有」的中间态。
  失败原因如实写入既有的 `parseError` 通道；下游 `resolveWrite` 的顺序是 parseError → F6 → …，
  两处都只认 `accepted` 真假，故**仍 fail-closed、拒一切写**，无需改 `resolve-write.ts`。
- **算 hash 读哪个路径 / 读失败的判定**：读 pin 的 `path`（相对项目根解析，或绝对路径），即项目根上的边界文件；
  读失败按**不匹配**处理（已确认 fail-closed 倾向）。哈希对**原始字节**（不剥 BOM）——pin 生成与校验必须同算法，
  否则含 BOM/EOL 差异的文件会得到不一致的哈希（测试 §9 专门验证）。
- **无 pin / 无 `.ans` 不放松**：`pin === undefined` 时沿用旧的 `source` 自称来源（向后兼容——
  `DEMO_ACCEPTANCE`、各角色注入的 `governanceBoundary.acceptance`、既有测试配置均无 pin，行为不变）；
  无 `.ans`（无治理边界）时仍走 `resolveBoundarySection` 分支 3 的**内置未接受**路径。
- **展示路径非绕过口**：`listProject` 对所列边界传 `{ accepted: false, source: "" }`（无 pin），
  故 pin 校验不触发、条目照常返回供展示，但 `accepted` 恒为 false；测试 §8 固定此语义。
- **测试**：新增 `test/门禁引擎/pin-acceptance.test.ts`（9 例）——pin 匹配→accepted；不匹配→未接受→`resolveWrite` 拒一切写；
  无 pin（向后兼容）；无 `.ans`→内置未接受→拒写；pin 指向文件不存在→fail-closed；pin 未覆盖当前文件→未接受；
  pin 形状非法→未接受；展示路径未误接受；按原始字节（含 BOM）求哈希。
- **结果**：`node --test "test/门禁引擎/*.test.ts"` → **64 passed / 0 failed**（原 55 + 本条 9）。
- **全量**：`node --test "test/*/*.test.ts"` 的**失败全部集中在** `test/pi-adapter/tools.test.ts`
  （`未真正落盘` 断言 vs 该角色 T3 已改的「已获准并落盘/写入」真写盘措辞）——**属 Pi适配器 角色 T3 的
  并行改动**（`src/provider/pi/tools.ts` 真写盘），**与本条 T1 无关**（该文件不 import 本条改动的任何模块）。
  除 pi-adapter 外**全部套件 204/204 全绿**；本角色开始前全量基线为 229/229。注：并发期间全量测试数在变
  （229→238→252），故不写死全量数字，只锚定「与本条相关的套件全绿 + 失败全在 pi-adapter」。
  **越界回报、未动手**。

## 2026-10-11 — 内置治理角色 su 补入 listProject 枚举 —— 复核通过（有保留）

客户问「界面里怎么没看到 su」。su = SKILL.md 的内置治理角色 **ANS Governance**，无 `角色卡/` 目录，
故 `listProject`（只枚举 `角色卡/*/` 与 `role-cards/*/`）从不列出它；但 `resolveRole` 本就认它
（不在 `project.roles` 即下沉 `built-in-governance`）。改动由引擎枚举侧合成一条内置角色条目。

- **边界**：全部落在本角色边界内——`src/common/门禁引擎/boundary-core.ts`、
  `src/service/role/resolve-role.ts`、`test/门禁引擎/list-project.test.ts`。
- **来源与流程**：本改动系**顶层会话越过角色边界直接改的**；客户已判定该流程不对，决定
  「代码保留、由负责角色（本角色）复核并补记录」。以下记录为**本角色独立复核并采纳**，非改动人。
- **文件**：新增 `src/common/门禁引擎/boundary-core.ts` 导出 `BUILT_IN_GOVERNANCE_ROLE_ID`（`"su"`）、
  `BUILT_IN_ROLE_CARD_TEXT`（多行说明）、`builtInBoundarySection()`；`resolveBoundarySection` 分支 3
  改为 `return builtInBoundarySection();`。`src/service/role/resolve-role.ts` 的 `resolveRole` 对 su 取
  `BUILT_IN_ROLE_CARD_TEXT`（原为空串），`ProjectRoleSummary` 增可选 `builtIn?`，`listProject` 先合成
  一条 su 条目（`roleId:"su"`、空卡/边界路径、`builtIn:true`、`builtInBoundarySection()`）预置进 `seen`
  并排序后 `unshift` 使其恒排第一。`test/门禁引擎/list-project.test.ts` 三处期望值加 `"su"`。
- **等价性验证（本角色新写）**：`test/门禁引擎/built-in-section-equivalence.test.ts`（5 例全绿）证明
  `builtInBoundarySection()` 与改动前分支 3 内联对象**逐字段一致**（entries 来自 `builtInEntries()`、
  `boundarySource=BUILT_IN_SOURCE`、`acceptance={accepted:false,source:""}`、无 `parseError`），每次调用
  返回全新数组（无共享可变状态），`resolveBoundarySection` 对 su / 任意未知角色仍落同一内置分支。
- **fail-closed 未破坏**：su 由枚举合成的条目 `acceptance.accepted===false`，仅供展示；真实写入路径仍经
  `resolveBoundarySection("su",…)` → 内置未接受 → `resolveWrite` 的 F6 接受门**拒绝一切写入**（契约 §0）。
  等价性测试内含 `resolveWrite` 对 su 边界放行断言全为 false。
- **测试**：`node --test "test/门禁引擎/*.test.ts"` → **53 passed / 0 failed**（原 48 + 本角色新增 5）。
- **语义提示**：`listProject` 对本仓库由 7 条变 8 条（su + 7 项目角色），语义由「枚举有角色目录的角色」
  扩为「枚举引擎可寻址的全部角色」；消费者须认 `builtIn` 与空 `cardPath/boundaryPath`。项目若真存在
  `角色卡/su/` 目录会被 `seen` 预置命中并记 warning 跳过（已知副作用）。

- **保留意见（id `"su"`）**：`"su"` 是客户对内置治理角色的**俗称**，非 SKILL.md 正式名
  （正式名 `ANS Governance`，该节无 id）。以俗称作引擎规范 id，令 id 与角色本体名分裂，
  `BUILT_IN_ROLE_CARD_TEXT` 不得不用「ANS Governance（su）」散文弥合。主张：或改以正式名 slug
  （如 `ans-governance`）为 id、`su` 作别名，或显式记录「`su` 为约定别名」。本角色**暂不改 id**：
  桌面应用及其测试、项目记忆均已使用 `"su"`，改 id 属跨角色联动，超出本角色边界——须走治理流程。
- **旁注（边界外，须回报，本角色未改）**：`src/pipeline/orchestration/run-role.ts::setupRole` 对
  **未登记在 `project.roles`** 的角色一律以 `EXIT_USAGE` 拒绝，故桌面端「点 su 开启聊天」仍会失败；
  修复点在 `src/pipeline/**`（本角色边界外）。见 `角色卡/桌面应用/changelog.md` 同日记事。
