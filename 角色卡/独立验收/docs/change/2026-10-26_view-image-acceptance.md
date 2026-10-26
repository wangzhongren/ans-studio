---
id: view-image-acceptance
type: change
title: view_image 图片查看（两轮附件）独立验收——客户标准 1–6 逐条判定
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: pass
related: [view-image-two-round-attachment, view-image-orchestration-wiring, view-image-desktop-delivery, view-image-cards, view-image-tool]
events:
  - date: "2026-10-26"
    kind: verified
    summary: 对未提交工作树（worktree lead-governance-coordination、分支 feat/scaffold-first-governance、HEAD 5d21fd8；26 tracked 文件 +986/−15 + 10 个未跟踪批次文件；36 文件候选清单摘要 36c63039…）按客户标准 1–6 独立判定 **pass**（无 needs-work）。逐条核对：view_image 只读/不写盘/不联网、未注入不注册；路径句法/realpath 根内/目录/非普通文件/扩展名/10 MB 校验先于能力且失败不调用能力（本角色用 Windows junction 独立探针验证 symlink 类逃逸被拒、能力零调用）；两轮附件本轮只回「已读取并排队；下一轮以图片附件提供；本轮不要假装已看到」；桌面经既有投递机以 background:true+kind:system 把 PromptImage 原引用排队给同一 projectRoot/roleId/runtime、忙时按序入队、settle 后投递；Proof/Steward/Lead 卡文本钉住必须 view_image、附件未到不得判 pass/fail、工具不可用 insufficient evidence；request_gate_review/request_acceptance/真实客户消息零回归、无 skip/only/弱化断言。独立复跑 typecheck 0/0、desktop 675/675、编排 1007/1005（1 既有 EPERM）/1 skip、runtime-core 344/337（3 既有 EPERM）/4 skip、门禁 340/339/0/1 skip、i18n shared 206/201/0/5 skip（guard scanned=126 allowlisted=21 violations=0）、桌面UI 296/296、装配 85/85。残余风险：图片载荷入队后不落盘（P0-1，重启窗口丢图）、仅扩展名无魔数、stat/readFile TOCTOU、真实模型/Electron 两轮 e2e 未跑；另记录 PM 规则第 14 条「扩展名/声明类型不作数」与扩展名口径需对齐、3 个 i18n key 暂无消费方、三处角色文档时间点陈述已过时。
---

# view_image 图片查看（两轮附件）独立验收

**总体结论：pass（无 needs-work）。** 客户标准 1–6 的确定性实现面与桌面集成面均核对通过；未发现实现缺陷、断言弱化、skip/only 或证据伪造。真实模型是否实际收到图片、真实 Electron/浏览器两轮附件 e2e 未跑，及若干已登记的残余风险见 §六，均不构成客户标准 1–6 的必要证据缺失。

**权限声明**：本结论不授予提交、推送、合并、部署或发布。本角色只写自身 `docs/change/`、`feature-map.md`、`memo.md`；未改产品源码、测试源码、共享 i18n、其他角色文档或断言；未 commit / push；未重启应用。

## 一、标准与依据

本批为实施完成后的独立验收。客户在交接中给出验收标准 1–6（事后标准；本批未见独立设计文档，实施依据为工程法案与各角色 change 记录）。标准固定如下：

| 编号 | 客户标准 | 主要判据 |
| --- | --- | --- |
| C1 | 角色可用 `view_image` 查看项目内图片；工具只读、不写盘、不联网 | 工具注册面、`readRoot`＝项目根、仅 fs 读取；无写/网络调用；不改变其他工具 |
| C2 | 两轮附件：本轮只回「已读取并排队；下一轮以图片附件提供；本轮不要假装已看到」；图片作为下一轮同一角色的用户提示附件（PromptImage，原引用）；不得同轮假装看到 | 成功回执逐字；能力收到 `{path,image}`；桌面 `PromptOptions.images` 原引用；排队发生在当前轮内、`settle` 后投递 |
| C3 | 能力未注入 ⇒ 工具不注册（fail-closed）；路径越界/绝对/`..`/symlink 逃逸/目录/非普通文件/不支持类型/超 10MB 均失败且不调用能力；错误如实回执 | `buildGovernedTools` 注入才注册；校验顺序在能力调用之前；失败文案不谎报「已排队」 |
| C4 | 桌面投递目标固定为同一 projectRoot/roleId/runtime；角色忙时按序入队、settle 后投递；`background:true`、`kind:"system"`，不冒充客户消息；失败如实 | `app/desktop/view-image.ts` 闭包定格目标；经既有 `SessionManager.send`；system 类别；失败 `{ok:false,message}` |
| C5 | 门禁卡：Proof 看真实截图/录屏必须 `view_image`，附件未到前不得判 pass/fail、不得把「文件存在」当「已看」；工具不可用 ⇒ insufficient evidence | `VERIFIER_CARD_TEXT` / `CONVENER_CARD_TEXT` / `LIAISON_CARD_TEXT` 数据文本与测试 |
| C6 | 不弱化断言、不新增第二套状态/能力；`request_gate_review`/`request_acceptance`/真实客户消息零回归 | diff 抽查、全量/定向复跑、skip/only 扫描、注册表数据面零变化 |

依据文件：`角色卡/项目管理/docs/project-rules.md` §二第 14 条；各角色 change 记录（§八证据指针）。

## 二、候选身份与环境

| 项 | 值 |
| --- | --- |
| 工作树 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination` |
| 分支 | `feat/scaffold-first-governance` |
| HEAD | `5d21fd89db7667d27e4a411a5d0a831a384990c7`（验收期间未变；未新增提交） |
| 候选状态 | **未提交工作树**：26 个 tracked 修改（`git diff --shortstat` = +986/−15）+ 10 个未跟踪批次文件（`app/desktop/view-image.ts`、3 个新测试、6 个角色 change/feature 文档）；`.claude/`、`demos/` 未跟踪，属其他任务，不在候选范围 |
| 候选清单摘要 | 36 个批次文件按路径排序后对每个文件算 `sha256`，再对「哈希 + 两空格 + 路径」清单算 `sha256` = `36c630390c73b25ebc44ee2e8b219e7c85b1a29a8dcc26f1bbc0e630936d5e8b`（可复核清单见证据目录 `candidate-hashes.txt`；验收前后两次复算一致） |
| 关键文件哈希（sha256） | `tools.ts 9a11e84f34bc142ca81f15db350f899715b793c1979ef266dd10dfa5d09a0949`、`runtime.ts 91c204e6ac9eadaae2b0700fa3e8e37c1a2f07a7801b39fd2943417ea98e98e5`、`schema.ts 7dba0508ac46df040989405ff1e528e1b1b7464047c9177c16fa9e8340758efc`、`run-role.ts 7f5051838400febd6b70df5734886116550bd8a80d603eceddf7b7f84f5c431d`、`session.ts 567a4874789a070d5363f864aedf50627cfc3503f6572596e55fd28567885503`、`view-image.ts 385d60f068af327d456d97da00f1d6ada929821c93ff762d7f28ddd5af4df3bc`、`governance-roles.ts bc7e40f4af94761d34c287670fceea17bcfb422237c4c698d9d873f28a2cb655` |
| 新增测试哈希（sha256） | `view-image-tool.test.ts 9d3801533c66b986534a312ad7e1b7d65837b9c211d8461af240823afbbc6d27`、`编排/view-image.test.ts 9a390b5a9b04d5e10cc1d0bdfa266aecebebc9d3d1232331650c953a0a02c324`、`门禁引擎/view-image-cards.test.ts 67ff1aa15ec3c270f9ea3e3a9a6e90d1148b64d468a253ead6a917f86fa71183`、`桌面应用/message-queue.test.ts 85935709f0ef1e4db4bb0b3ff5c7eedd66bb20df9d877886c8a3331f529fd774` |
| 平台 / Node / npm | Windows 11 Pro 10.0.26300 / Node v24.22.1 / npm 11.19.1 |

## 三、客户标准 1–6 逐条结论

### C1 角色可用 view_image 查看项目内图片；只读、不写盘、不联网 —— **pass**

- 工具注册：`src/provider/runtime/tools.ts:3319-3320` 仅 `options.viewImage !== undefined` 时把 `makeViewImageTool` 加入工具集；Service 以 `readRoot = options.readRoot ?? projectRoot` 构造（`src/service/runtime/session.ts:152`），编排工厂固定 `readRoot: project.projectRoot`（`run-role.ts:3567`），即读取面 = 导入项目根。
- 工具实现（`tools.ts:607-723`）只调用 `realpath` / `stat` / `readFile`（node:fs/promises）与注入的 `ViewImageFn`；无 `writeFile`/网络/子进程调用，不经过写门禁、不改变任何写权。`schema.ts:987-1019` 的描述逐字写明「不写盘、不联网、不过写门禁」。
- 桌面侧全部角色会话注入（`session.ts:2212-2219` 构造、`2443-2444` 随 `openRoleSession` 入参注入）；未注入（如 CLI 一次性 `ans role run`）⇒ 工具结构性不存在。
- 证据：`test/runtime-core/view-image-tool.test.ts` 10/10；`test/编排/view-image.test.ts` 3/3；本角色独立复跑均通过（§五）。

### C2 两轮附件：本轮只排队、下一轮同角色图片附件（PromptImage 原引用）、不得同轮假装看到 —— **pass**

- 工具本轮回执逐字为 `view_image: <path> 已读取并排队；下一轮以图片附件提供；本轮不要假装已看到。`（`tools.ts:717-720`；测试钉死）；能力 `message` 只能附在固定句之后，不破坏该句。失败/中止回执分别明确「下一轮不会收到该附件」「排队未获确认，不要当它已提供」。
- 图片不进本轮工具结果：工具把 `raw.toString("base64")` 组为 `PromptImage {type:"image",data,mimeType}`，只交给注入能力（`tools.ts:684-693`）；工具结果无图片数据。
- 桌面能力（`app/desktop/view-image.ts:66-92`）把 `input.image` **原引用**装入 `{ images: [image] }`，以 `background:true` + `kind:"system"` 调既有 `SessionManager.send`；工具在本轮内 ⇒ 角色必然 busy ⇒ 既有投递机按到达序入队，`settle` 后按序投递给**同一角色**。`sendDelivery` 把 `opts.images` 原样交给 `handle.send` → 编排 → provider `prompt(text, opts)`。
- 集成证据：`test/桌面应用/message-queue.test.ts` 新例 1（system 入队、settle 后按序、图片对象 `===` 原引用、不投当前活动角色）与「真实 `openRoleSession` + 真实 `view_image` 工具」集成例（真实 PNG 字节 base64/MIME 原样进入下一轮 `PromptOptions.images`）；本角色复跑该文件 18/18。
- 两轮纪律文本：`schema.ts` 描述/指引、`governance-roles.ts` 三卡均写明「本轮只回已排队、下一轮附件、不得假装已看到」。

### C3 未注入不注册；全部非法路径/类型/大小失败且不调用能力；错误如实 —— **pass**

- 注册：未注入 ⇒ 工具不在集合（`tools.ts:3319-3320`；runtime 测试第 1 例断言基础工具集仍恰为 `write_file/edit_file/read_file/list_dir`；编排测试断言 su/项目角色未提供时 `view_image` 零注册）。
- 校验顺序（全部在触达能力之前，`tools.ts:610-673`）：取 path → 空/NUL/绝对/盘符（含 `C:foo`）/任何 `..` 段句法拒绝 → `realpath(readRoot)` 与 `realpath(resolve(readRoot,path))` 后 `isWithinReal` 复核（挡符号链接/junction 逃逸，Windows 大小写不敏感）→ 不存在/不可访问 → 目录（指路 `list_dir`）→ 非普通文件 → 扩展名（`.png/.jpg/.jpeg/.webp/.gif`，小写化）→ `stat.size > 10 MB`（`VIEW_IMAGE_MAX_BYTES`，`tools.ts:178`）→ 读二进制后按实际字节数再复核上限。
- 失败不调用能力：`test/runtime-core/view-image-tool.test.ts` 的路径矩阵（缺/非字符串/空/空白/NUL/根内绝对/盘符/盘符相对/`..`/反斜杠 `..`/目录伪装 `.png`/不存在）全部 `ok:false` 且 `calls===0`；不支持扩展名、无扩展名、超 10 MB 同样 `calls===0`；失败文案均不含「已读取并排队」。
- **symlink 逃逸独立探针**（本角色，Windows junction）：项目根内建 junction 指向根外含 `evil.png` 的目录，`view_image({path:"escape/evil.png"})` 回 `在读取根之外（已拒绝）——未读取、未排队`，能力调用 +0；同批探针验证 `.`（目录）、`dir/../ok.png`、绝对路径、NUL、空/空白均拒绝且零调用。文件级 symlink 因本机 `EPERM` 无法创建（与既有 Windows 限制一致），其解析路径与 junction 同经 `realpath`+`isWithinReal`，属同一守卫。证据：`docs/change/2026-10-26_view-image-acceptance-evidence/probe-symlink-escape-output.txt`。
- 能力回执：`ok:false`/抛错/契约外回执/缺失 ⇒ 工具 `ok:false` 并如实说明「未排队」「下一轮不会收到该图片附件」「本轮不要假装已看到」；中止时按「排队未获确认」两不谎报（`tools.ts:686-716`、`abortedToolResult`）。
- 能力入口二次防御：桌面 `isPromptImage` 对空 `data`/空 `mimeType`/错 `type` 拒绝且零投递（`view-image.ts:48-58,73-76`）。

### C4 桌面投递目标固定、忙时按序入队、settle 后投递、system 类别、失败如实 —— **pass**

- 目标定格：`session.ts:2216-2219` 在开会话/重建时以 `{projectRoot: req.projectRoot, roleId: req.roleId, runtime: req.runtime}` 构造闭包；测试在把活动角色切到 su 后调用 A 的 `viewImage`，排队与投递仍落在 A，su 队列为空。
- 忙时入队：工具本轮内 `entry.busy === true` ⇒ `send` 走 `enqueueDelivery`（同一投递队列，`deliveryKind:"system"`，摘要不写「你：」，`dedupKey` 含自增序号）；`settle` 后 `drainQueue` 按到达序投递（既有投递机，非第二套）。
- 类别：`background:true` + `kind:"system"`；`send` 仅在 `background && kind==="system"` 时标 system（`session.ts:2767-2770`）；不抢活动 pane、不冒充客户消息。
- 失败如实：空路径/无图片/图片结构非法 ⇒ `{ok:false,message}` 且零文本零投递；`send` 失败/会话未开 ⇒ `{ok:false,message}` 带底层原因；能力抛错被捕获。测试覆盖「发送失败忙态复位」「会话已释放（尚未开启）」「非法载荷零投递」，以及真实客户消息 `images` 原引用/直达语义零回归。
- 备注（非阻断）：入队成功只回 `{ok:true}`（「已交给投递机」）；后续出队投递失败由既有投递机系统行如实呈现并放回队首——工具不预见未来失败，措辞未声称「已送达」。

### C5 门禁卡：Proof 必须 view_image、附件未到不得判 pass/fail、不得以文件存在冒充、工具不可用 insufficient evidence —— **pass**

- `VERIFIER_CARD_TEXT` 新增「## 图片证据核对（view_image，两轮附件，必须）」：gate 复核/验收看真实截图/录屏画面时**必须对项目内证据图片调用 `view_image`**（项目相对路径），不得只凭文件名/摘要/文件存在；收到排队回执后**等下一轮图片附件再判断**，图片未提供时不得假装已看、**不得在排队回执上判 pass/fail**、不得把排队回执写成已看过；附件到达后仍须 UI/游戏关 DEBUG、旧候选/DEBUG ⇒ `insufficient evidence`；记录看到的内容 + 文件哈希（sha256）+ 候选/flow revision + 附件路径；工具不可用/回执失败/下一轮未收到附件 ⇒ 如实 `insufficient evidence`，**不得用「文件存在」冒充看过图**。标准工作流第 4 步与 Gate 复核第 2 步同步加了指针（`governance-roles.ts` 差异）。
- `CONVENER_CARD_TEXT` / `LIAISON_CARD_TEXT` 各加简短规则：需要核对画面证据时用 `view_image`（两轮，附件到达前不下画面结论），不得把「截图路径存在/存在截图」说成「已核对画面」；统筹只判证据完整性、画面/实现质量只由 Proof；Lead「系统消息只汇报、不派任务」逐字保留。
- 测试：`test/门禁引擎/view-image-cards.test.ts` 5/5（含两道反向断言：不得出现「文件存在即视为已看图」等肯定式表述；注册表 entries/preauthorizedDirs/capabilities/角色顺序零变化）；本角色复跑门禁全目录 340/339/0/1 skip。
- **行为约束而非机械强制**：门禁层不解析图片，也无「未调用 view_image 则拒绝 pass」的结构性校验；该标准依赖角色卡文本与 Proof 遵从（与既有规则类批次同口径）。两轮设计对 gate 任务可用性的正面证据：任一角色 `settle` 都会触发 `scheduleAcceptanceCheck` → `runAcceptanceCheck` → `processGateReviewsForFlow`（`interface.ts:4147-4149,8009-8019`），故 Proof 在收到图片附件的第二轮写出的 gate 报告仍会在该轮 settle 时被处置；真实模型行为未验证（见 §六）。

### C6 不弱化断言、不新增第二套状态/能力、三通道零回归 —— **pass**

- 变更全为增量：`git diff` 中仅 `test/桌面应用/message-queue.test.ts` 的 import 行与 i18n 计数/新增断言有改动（计数由 786/514/1365 更新为 787/516/1368 属新增 key 的必然结果）；无删除既有断言、无 `.skip`/`.only`/`todo`（新测试与改动测试扫描为零）。
- 无第二套投递/状态：桌面复用既有 `send`/投递队列/`background+system` 语义；无新 IPC、无新 ledger kind、无新 `FlowStepKind`、无新 cardKind；门禁测试断言注册表数据面零变化。
- `request_gate_review`/`request_acceptance`：runtime 测试「零回归」例断言两工具在注入/不注入 `viewImage` 两种情况下 schema/描述/displayInputRule/executionMode 逐字相同、回执不变；编排 1007/1005（唯一红为既有 EPERM）与门禁 340/339 全绿。
- 真实客户消息：`send` 主路径零 diff；message-queue 新例与既有 14 例（18/18）覆盖客户图片 `images` 原引用与直达语义。

## 四、关键 diff 抽查

| 区域 | 核对点 | 结论 |
| --- | --- | --- |
| `src/model/runtime.ts` | `ViewImageInput{path,image}` / `ViewImageFn` / `GovernedToolsOptions.viewImage?`；仅类型/注释 | 通过；契约单一来源，`RuntimeSessionOptions` 经 `Omit<GovernedToolsOptions,…>` 自动承载 |
| `src/provider/runtime/tools.ts` | 注入才注册；句法/realpath/目录/非普通文件/扩展名/10 MB/读后复核；base64+MIME；回执归一与如实失败；中止语义；`displayInputRule=core-path-v1`；其他工具零变化 | 通过 |
| `src/provider/runtime/schema.ts` | 仅 `{path}`、必填、`additionalProperties:false`；两轮/能力存在性/路径/类型/大小/不假装文案 | 通过 |
| `src/pipeline/orchestration/run-role.ts` | `AdapterCapabilities.viewImage`、`openRoleSession` 输入、`createRuntimeAdapterFactory` 同名透传；不按角色收窄；不改变其他能力矩阵 | 通过；`viewImage: capabilities?.viewImage` 显式写入，能力缺席不因工厂 options 误带而注册 |
| `app/desktop/view-image.ts` | 目标闭包；`send(text,{images},target,{background:true,kind:"system"})`；结构校验；失败如实；不复制契约 | 通过 |
| `app/desktop/session.ts` | 全部角色会话注入；目标定格；经既有投递机；不抢 pane、不改 send 主路径 | 通过 |
| `src/common/门禁引擎/governance-roles.ts` | 仅三卡产品数据文本 + 文件头注；导出函数/注册表数据面零变化 | 通过（门禁全目录 340/339/0/1） |
| i18n（zh-CN/en-US 各 3 key） | 同 key、占位符 `{path}`/`{detail}`/`{path}`、en 无中文；分区计数 787/516/1368；不改既有文案 | 通过；但 3 key 目前无生产消费方（§六 第 6 条） |
| 角色 change 记录 | 各角色写集与实际 diff 一致；自述未验证项与本次独立核对一致 | 通过；个别时间点陈述已过时（§六 第 7 条） |

## 五、测试与证据核对（本角色独立复跑，Windows 11 / Node v24.22.1）

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| `npm run typecheck` | **exit 0** | 无诊断 |
| `npm run typecheck:renderer` | **exit 0** | 无诊断 |
| `node --test test/runtime-core/view-image-tool.test.ts` | **10/10** | 新增用例全过 |
| `node --test "test/编排/view-image.test.ts"` | **3/3** | 新增用例全过 |
| `node --test "test/门禁引擎/view-image-cards.test.ts"` | **5/5** | 新增用例全过 |
| `node --test "test/桌面应用/message-queue.test.ts"` | **18/18** | 含 4 个新例（1 个真实 openRoleSession + 真实工具集成） |
| `node --test "test/runtime-core/**/*.test.ts"` | **344 / 337 pass / 3 fail / 4 skip** | 3 红均为既有 Windows `symlink EPERM`（`file-write-safety` D3 ×1、`session-store` ×2；相关文件 `git status` 无修改，与本批无关） |
| `node --test "test/编排/**/*.test.ts"` | **1007 / 1005 pass / 1 fail / 1 skip** | 唯一红为既有 `shell-authorized-routine.test.ts:103` Windows `symlink EPERM`（文件零 diff） |
| `node --test "test/桌面应用/**/*.test.ts"` | **675 / 675** | 0 fail / 0 skip |
| `node --test "test/门禁引擎/**/*.test.ts"` | **340 / 339 pass / 0 fail / 1 skip** | skip 为既有 Windows 平台用例 |
| `node --test "test/项目管理/shared/**/*.test.ts"` | **206 / 201 pass / 0 fail / 5 skip** | `[i18n-guard] scanned=126 allowlisted=21 violations=0` |
| `node --test "test/桌面UI/**/*.test.ts"` | **296 / 296** | 额外回归 |
| `node --test "test/装配/**/*.test.ts"` | **85 / 85** | 额外回归 |
| `node --test "test/测试/**/*.test.ts"` | **848 / 838 pass / 4 fail / 6 skip** | 额外回归；4 红＝3 个 `t1-pipeline-integration` 既有失败（本角色在 HEAD `5d21fd8` 临时 worktree 复现同样 3 红，非本批引入）＋1 个既有 Windows `symlink EPERM`（`g4-skill-verify`）；不计为本批判据 |
| 独立 symlink/junction 探针 | **9 PASS / 0 FAIL / 1 SKIP(EPERM)** | junction 逃逸被拒且能力零调用；文件 symlink 创建受 Windows 权限限制；见证据目录 |
| `git diff --check` | 1 处 `new blank line at EOF`（`角色卡/运行时核心/docs/feature/runtime-core.md:145`） | 文档空白瑕疵，非阻断（§六 第 10 条） |

**失败归因**：runtime-core 3 红 + 编排 1 红 + `test/测试` 1 红均为 Windows 原生 `symlink` `EPERM`（既有环境限制，相关文件不在本批 diff）；`test/测试` 另有 3 个 T1 既有时序/断言失败，已在候选外 HEAD worktree 复现，与本批 `view_image` 改动无关。skip 全部集中于既有平台/权限用例，未用于掩盖本批行为。候选前后两次清单摘要复算一致（`36c63039…`），测试期间工作树无漂移。

## 六、未覆盖面与残余风险

1. **真实模型/真实 Electron 两轮 e2e 未跑**：没有真实引擎样本证明 `PromptOptions.images` 被各 SDK 实际编码进下一轮请求、也未在真实窗口观察「本轮回执 → 下一轮图片附件」的完整聊天体验。集成测试已覆盖真实桌面投递机 + 真实编排 + 真实 `view_image` 工具直到 provider `prompt(text, opts)` 边界（`message-queue.test.ts` 集成例），引擎/sdk 层属既有 P0-1 图片通道。若客户要求引擎级证据，需补真实模型/Electron 两轮附件 e2e。
2. **图片载荷不持久化（P0-1 既有语义）**：`persistableDeliveryItem` 不包含 `opts`（`session.ts:3332-3355`），应用在「已入队、未投递」之间重启时该条按文本恢复、图片丢失；下一轮提示文本仍写「这是 view_image 请求的图片」，与实际无附件不一致。客户交接已列为已知限制；建议后续在出队时对「view_image 提示但无 images」改写为「附件已丢失，请重新调用 view_image」或重启后重排，避免模型对缺失附件作假设。
3. **类型仅按扩展名、无魔数/内容嗅探**：`.png` 等扩展名文件即便内容不是有效图片也会被排队；引擎大概率在下一轮报坏图，Proof 按卡应写 insufficient evidence。工程法案 §二.14 的措辞「真实类型不受支持（扩展名/声明类型不作数）」若按字面理解要求内容判定，则与实现/PM 变更记录表格的「真实扩展名」口径不一致——建议由项目管理收敛规则文字或在后续批次补魔数校验（客户本次口径未要求魔数，故非阻断）。
4. **TOCTOU**：`stat` 与 `readFile` 之间文件可能被替换/增长；读后按实际字节数复核上限，但不保证内容一致（只读工具，与 `read_file` 同类风险）。
5. **门禁规则无结构强制、未在线验证**：C5 是角色卡行为约束；应用不解析图片、不强制「gate 报告必须伴随 view_image 调用」。模型是否遵从（等附件再判、不把文件存在当看过、记录哈希）无机械保证；本轮无真实 gate/验收流程样本。
6. **i18n 3 key 暂无消费方**：`main.viewImage.queued` / `main.viewImage.failed` / `ui.viewImage.attachmentLabel` 已入共享目录并被契约测试钉住（PM change 已明确为预期）；当前产品代码未引用，工具/桌面实际面向模型的文本是硬编码中文（`app/desktop/view-image.ts` 入 i18n-guard allowlist，classification §4）。模型侧回执逐字与客户要求一致，用户可见排队/失败回执与附件标签待桌面UI 接线后才会使用这些 key。非阻断。
7. **角色文档时间点陈述已过时**：`角色卡/运行时核心/docs/feature/runtime-core.md` 仍写「Service/编排/桌面把图片实际排入下一轮 `PromptOptions.images`……未接线」；`角色卡/编排/api-spec.md` 证据段仍写「全仓 12 红均在桌面窗口属主文件、桌面类型未收敛」；`角色卡/项目管理/docs/project-rules.md` 2026-10-26 登记行仍写「`view_image` 工具实现/接线未在本工作树出现」。这些是各角色写作时的快照，现候选已收敛（typecheck 0、桌面 675/675）；建议属主更新以免误导后续维护者。非阻断。
8. **规模/内存边界**：单文件上限 10 MB，但未限制一轮内排队图片数量/累计字节；base64 后约 13.3 MB/张，多次调用可累积内存与下一轮请求体。引擎请求体上限由适配器/平台承担；建议后续按轮设上限。非阻断。
9. **CLI 一次性 `ans role run` 不注入 `view_image`**：其本就不接受 capabilities（与 customerInput 等一致），工具不注册；桌面全部角色会话均注入。属能力注入架构的既有范围，非缺陷。
10. **文档空白瑕疵**：`git diff --check` 报 `角色卡/运行时核心/docs/feature/runtime-core.md` EOF 新增空行；纯格式问题，建议属主顺手清理。

## 七、最终判定

**pass（无 needs-work）。**

- 客户标准 C1–C6 全部满足，且证据对应当前候选（清单摘要 `36c63039…`、HEAD `5d21fd8`、测试前后无漂移）。
- **结论范围**：确定性实现 + 桌面集成（真实 SessionManager/投递机 + 真实编排 + 真实 `view_image` 工具）直到 provider `prompt(text, opts)` 边界；不含真实引擎/SDK 是否把图片编码进模型请求、真实 Electron 窗口体验（§六第 1 条）。若客户把「真实模型实际收到图片」列为出卡必要条件，则该单项属 missing-evidence，需补真实模型/Electron 两轮附件 e2e；本角色按客户标准 1–6 的文字口径（投递到 PromptImage/PromptOptions）判 pass。
- 未发现实现缺陷、断言弱化、skip/only、第二套状态/能力或三通道回归。
- §六 的 1–4 为实施方自述与客户交接均已明示的残余风险（真实模型/e2e、P0-1 图片不落盘、扩展名无魔数、TOCTOU），未构成本批客户标准的必要证据缺失；5–10 为记录项/文档卫生，建议后续批次处理。
- 本判定不授予提交、推送、合并、部署或发布权限。

## 八、证据指针

- 本报告：`角色卡/独立验收/docs/change/2026-10-26_view-image-acceptance.md`
- 本角色原始证据：`角色卡/独立验收/docs/change/2026-10-26_view-image-acceptance-evidence/`
  - `candidate-hashes.txt`：36 个批次文件 sha256 清单与摘要 `36c63039…`
  - `probe-symlink-escape.mjs`、`probe-symlink-escape-output.txt`：junction 逃逸/路径边界独立探针（9 PASS，1 EPERM skip）
  - `test-run-summary.txt`：§五 各套件复跑的 tests/pass/fail/skip 与失败行摘录
  - `baseline-t1-head-5d21fd8.txt`：`test/测试` 的 3 个 T1 失败在候选外 HEAD 临时 worktree 的复现记录
- 规则：`角色卡/项目管理/docs/project-rules.md` §二第 14 条
- 各角色 change：`角色卡/运行时核心/docs/change/2026-10-26_change_view-image-two-round-attachment.md`、`角色卡/编排/docs/change/2026-10-26_change_view-image-orchestration-wiring.md`、`角色卡/桌面窗口/docs/change/2026-10-26_change_view-image-desktop-delivery.md`、`角色卡/门禁引擎/docs/change/2026-10-26_change_view-image-cards.md`、`角色卡/项目管理/docs/change/2026-10-26_change_view-image-tool.md`；桌面功能：`角色卡/桌面窗口/docs/feature/view-image-delivery.md`
- 测试：`test/runtime-core/view-image-tool.test.ts`、`test/编排/view-image.test.ts`、`test/门禁引擎/view-image-cards.test.ts`、`test/桌面应用/message-queue.test.ts`（新 4 例）、`test/项目管理/shared/i18n.test.ts`（新 3 例）
- 本角色复跑命令与结果：见 §五（日志为本次会话原始输出；本报告表格即汇总指针）
