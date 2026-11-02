# 变更包 E1：全局任务状态与幕僚版本决策权（global task state / version authority）

- **任务 ID**：`2026-11-02-global-task-state`；**flowId**：`global-task-state`
- **风险档位**：**T3**（方案 §10.3 定档；闸门 2 与实施授权确认；E1 不降档）
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立上下文）
- **日期 / 节点**：2026-11-02 / 团队计划 §五 **E1（变更包）**；入口为 D1 重跑完成
- **状态**：**E1 变更包已写盘**。本文件只汇总当前候选身份、节点 G2–E3、证据链接、T3、复用/失效与披露，**不判验收、不代替 E2、不授权 commit/push/merge/release**。
- **候选**：HEAD `0a123109a6b10e9b60fd1aee5f08f861455c48de`（分支 `feat/acceptance-return-card`，worktree `flow-improvements-wave1`）+ 工作树 A0–A5（D-04 返工后）未提交改动；**32 个产品/测试候选文件 = 30 个 `src/app/test` + README 2**，与团队计划 §4.1/§4.3 写集精确匹配，写集外产品/测试改动 **0**。H1 边界 6 文件与治理/证据记录单列为**非产品候选**。
- **交接**：交内置独立验收（E2）按 V1 v1.1 判定；E2 报告路径 `docs/acceptance/global-task-state-report-v1.md`。E2/E3 未执行、未判定。

## 输入与依据（E1 实测）

| 输入 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| 团队计划（闸门 2 确认对象） | `docs/scheduling/2026-11-02_team-plan_global-task-state.md` | 477 | `06d29aaf940b9b66062420a9926c9c1764b0aaf12757f785383ce5c0d6359d62` |
| 策划方案 P1.3（D-04 窄更正后） | `docs/planning/2026-11-02_design_global-task-state-version-authority.md` | 1303 | `7faa3e8b348612b6151aec4046a169b8810eb2bbcf347c3866675d65f1084dc8` |
| 实施前验收标准 V1 v1.1 | `docs/acceptance/global-task-state-criteria-v1.md` | 915 | `fe48dc326c918bb0c94f353df2bcd55a6d69b9f95b93ec4fdc0e259094a9847f` |
| 独立复核记录（P1.1 再复核） | `docs/planning/2026-11-02_review_global-task-state-version-authority.md` | 148 | `22128e59904ab8de10ede64f7acc478069c752198fc3b87c043f5dab4434c5a8` |
| └ P1.0 复核快照（历史，不与上行混用） | 同上文件历史快照 | 103 | `3b8d3a3ad407a1da71940d9d26b8aaa98665f50fc2759daafc27c57a8ae3fc07` |
| 项目管理 P1 审核（含复审） | `角色卡/项目管理/docs/change/2026-11-02_global-task-state-P1-review.md` | 315 | `339c875b0f032243c77f055f18c70705ab89195fd19878794ee3e1ff2479790a` |
| D1 重跑记录（当前有效） | `角色卡/测试/docs/change/2026-11-02_global-task-state-D1-rerun-regression.md` | 323 | `c36b72776d954323784932d608f770f0642f8f0b42e173c208c73efda107bb96` |
| 沟通记录（闸门 0/2、授权、P1.2/V1、D-04、实施记录） | `docs/communication/2026-11-02_intent_global-task-state.md` | 201 | `fa4a3211d57ae95e56664e52a6e8e17f52a0bbb7f3bf780731ff355fb3c1ed14` |
| P1 提案归档（含修订记录） | `docs/communication/2026-11-02_p1-proposals_global-task-state.md` | 454 | `cf1eb8942fa93932da3c8cf33e63fa53b1e6c914e35ab414c926b91f1ac33dcd` |
| B0 基线（测试） | `角色卡/测试/docs/change/2026-11-02_global-task-state-B0-baseline.md` | 167 | `5c275332f38ba3c8c3f1ad51dcd72df62ef92e2a2523779441d678f6bf02aa58` |
| 旧 D1 记录（**superseded，不得引用**） | `角色卡/测试/docs/change/2026-11-02_global-task-state-D1-regression.md` | — | 当前文件 `4eea8d923ca8c01fbccc2fe38043fd4595fc9151afa76ec8f5143db317cad0f7`（frontmatter `status: superseded`；旧候选结论作废） |

- 沟通记录为并发追加的管理记录，本表记 E1 时点值；其**确认小节**（闸门 0/2、实施授权、H1/B0/P1.2/V1 核对、P1 复审、A0–A5、D1、D-04 裁决）是判定依据，不以文件头历史快照哈希替代当前值。
- 方案 P1.2（1302 行 / `1573e1ef…`）为 R1–R5 实施基线；P1.3（1303 行 / `7faa3e8b…`）仅按 D-04 裁决把 blocker kind 内部 id 改为 `rework-pending`，语义/范围/T3/写权/验收边界不变。V1 v1（907 行 / `b6c23c78…`）由 v1.1 窄更正替代（仅 AC-1.1 枚举 id）。

---

## 一、候选身份

### 1.1 基线、HEAD、分支与状态

| 检查 | 命令 | 实测结果 |
| --- | --- | --- |
| 基线 HEAD | 团队计划 / B0 / V1 记录 | `0a123109a6b10e9b60fd1aee5f08f861455c48de` |
| 当前 HEAD | `git rev-parse HEAD` | `0a123109a6b10e9b60fd1aee5f08f861455c48de`（未前进） |
| 分支 / worktree | `git branch --show-current` | `feat/acceptance-return-card` / worktree `flow-improvements-wave1`（分支名与 worktree 名不同，属既有事实，V1 §九.1 已披露） |
| 产品/测试候选条目 | `git status --porcelain -- src app test` | **30 条**：A0 4 + A1 9 + A2 7 + A3 3 + A4 7（新文件 9、修改 21） |
| README（A5） | `git status --porcelain -- README.md README.en.md` | 2 条（均修改） |
| 产品候选状态快照 | `git -c core.quotePath=false status --porcelain -- src app test README.md README.en.md \| sort \| sha256sum` | `c767983094cadd2948f346ffd66c2de0ad2977dc7248c987ac5853f90e834ea9`（32 行） |
| 暂存区 | `git diff --cached --name-only` | 空 |
| 配置/构建 | `git status --porcelain -- package.json package-lock.json` | 空；`package.json`/锁/构建配置未改 |
| 渲染产物 | `git check-ignore -v app/renderer/dist/index.html` | `.gitignore:9:app/renderer/dist/`；**忽略产物、非候选**；D1 重跑已按当前候选重建（入口 `c6078edf…`） |

### 1.2 产品候选 32 文件逐文件 `git hash-object` + `sha256sum`

> 30 个 `src/app/test` + README 2；全部为工作区字节（D1 记录：LF）。下表为 E1 独立复算值，与 D1 重跑 `00-candidate-identity.txt` 32/32 一致。

| # | 节点 | 文件 | `git hash-object` | SHA-256 | 行数 |
| --- | --- | --- | --- | --- | --- |
| 1 | A0 | `src/model/project-state.ts`（新，B-1） | `7b8d5ea65ce0486b4496267123f9e933c04dbe17` | `61d7793276bf389770673001dd416e8821a0943faa983e6e80eacf386bf3103a` | 417 |
| 2 | A0 | `src/model/runtime.ts` | `19f4dac4d9343144a8674c23afaa1c053e9c7974` | `014e0b0cf214f765f3b700335976d904109b8facf0d88f3f4323aef117dccc4e` | 2728 |
| 3 | A0 | `src/provider/runtime/tools.ts` | `98b5df46957db795d6466c1dc4d4eace73155d6a` | `dfa3fb4fe1fa58bc92fdceac0d6eef5862c39c2534add372c00662bb78e3bac0` | 3648 |
| 4 | A0 | `src/provider/runtime/schema.ts` | `675dc23532fddbabb64a7aacb0aa5effe946f0cc` | `2da78f7c6462875c6789067ca9cfd7e814dd527f71cd4de993d611c2f6106654` | 1418 |
| 5 | A1 | `src/common/编排/task-state.ts` | `b28ba7e1317ab5aab33f2c3e53b54c20104fa9c2` | `4cb100b1d7c2125731739484e4c6d9b93ccfb44e17bd15c29739fedc6781eed0` | 839 |
| 6 | A1 | `src/common/编排/project-state.ts`（新） | `eeb58f89d65e8d31b83f1bc8270d91fe65a745a8` | `a082f0d220a859d430f421c1225dd9384ade66e3cf5f723bfe8cac652007b6f8` | 1156 |
| 7 | A1 | `src/common/编排/version-decision.ts`（新） | `9fe716ad41c43c153ce6da464f2382b072c54bc8` | `978e6d9fd5d1c6d98eb26c0228a592d329ba74e748ea19622c705d702108e1e6` | 493 |
| 8 | A1 | `src/pipeline/orchestration/run-role.ts` | `c31d676e8496f067ab321bf9f879c90b6adb21e6` | `e8c1cf26dba6eaa3dc06603a3ba5a7e5aff877a70fed57bb5dcd5098da272d17` | 2473 |
| 9 | A1 | `test/编排/project-state.test.ts`（新） | `51edae38a644abe8df925c6080323859e9917e15` | `ba996417a6be036c66c7d55e9b806e0ee7093c07a724a0c2b26507d43928e266` | 465 |
| 10 | A1 | `test/编排/version-decision.test.ts`（新） | `2702ea869156832bfae588c03a5ff73654eb9133` | `6b69f69c620dd8b304eacac848b32625878f84218f30edf7abf7a16052cc5351` | 420 |
| 11 | A1 | `test/编排/task-state.test.ts` | `5a894e8ec3e92a31e42e1b7fb8e65498797e894a` | `61655b859a9ed583045542cef88c78a62174223be6276ccfa9f90fc51988c9e5` | 498 |
| 12 | A1 | `test/编排/run-manifest.test.ts` | `9c32130a3a12fd34c28b02918b75353183ef7293` | `b1594d3175202b344a9eaac9781dc60223bdb8f331e1eb75590c5434bd377cdc` | 196 |
| 13 | A1 | `test/编排/decision-card.test.ts` | `3c88892ce385d614df3a1d88f7bbbffa9376335b` | `674bbaebfe9ba1a2a6cad6f93f9e727e98e68eb59e24092f9bbfe11d3781f032` | 128 |
| 14 | A2 | `app/desktop/session.ts` | `bbf0f9d37031a3d15533d1cd84ca3207f86562a8` | `86c84c4db272209c471d2ad802dee29f85e6afbe9f3609be093dc96ba2acbed3` | 8790 |
| 15 | A2 | `app/desktop/interface.ts` | `0ddc0dcbf921092e37e0b832e0c8d2a5b135a811` | `8d981705dee9baa2e9fd7a879c280993544668ae836dd98cdbc4c826c5b3b8d1` | 2636 |
| 16 | A2 | `app/main.ts` | `3de39c3bdb5d5768a236003c4d4c42328ac4b45b` | `1e5cf23a4c8e0c4a2175474a9c777b8eaadb40c5fc5b2b4aa069f28392965d0e` | 1127 |
| 17 | A2 | `app/preload.cjs` | `523e0c742a9c5d3b220280b8b56666ef484d531f` | `f1c38c1f8c34630598362c82f2c25b4e2cbc11fd549d9c5599db143013af23e9` | 419 |
| 18 | A2 | `test/桌面应用/project-state.test.ts`（新，B-2） | `1304dfdb5ffdfe2c58ca886489bef15c98641d2b` | `104c8fb3862c20df54aa89d2e1cb6de2dc2fd1cbf7f7c29bb9929841978f6c77` | 330 |
| 19 | A2 | `test/桌面应用/version-decision.test.ts`（新，B-2） | `d34cccc5489bdd39cb0d42499c1eecb4e1edb9bf` | `53b85c29d76680a12b5ab0d5b2b87ba8863edd126a6e99a9903a23194f24f40e` | 750 |
| 20 | A2 | `test/桌面应用/chief-workflow.test.ts` | `3f323a0f75cdeca295af088bb6767974234b8027` | `8cc03eacb46442193b80a3e4669a2b1fe78b0cdf62abd0a62350ed00be1c2c54` | 202 |
| 21 | A3 | `src/common/shared/i18n/messages/zh-CN.ts` | `b5cb538ad4942d27058ac8b892998b06299f7994` | `299e619cecf0734d7c9e838b975ad452e1ddb2e458fc5f4b193ba20a1865210b` | 2072 |
| 22 | A3 | `src/common/shared/i18n/messages/en-US.ts` | `aaf3736374a058cccd40ffe1fa4f2f99f56110bc` | `4aa73f8f85f88b9aa66a713895e372d60c45b4b28612455034f45ebb9e907c40` | 2340 |
| 23 | A3 | `test/项目管理/shared/i18n.test.ts` | `86b8855a9d675d0d66a5533f9e8bbf0eabfd04ad` | `711088654dfca62b7536aaea43592af081dc365088b2b7b58f4f3af01aec261b` | 415 |
| 24 | A4 | `app/renderer/src/chat/TaskCenterPanel.tsx` | `6377c0c436f15f3dc8550ad89097dbe847cd6ca2` | `6616d4a8e1d12cc43aee3436c3b42ee359e86b906392ef0a5b43a4fec9d8a136` | 317 |
| 25 | A4 | `app/renderer/src/chat/ProjectStatePanel.tsx`（新） | `4d7e09953f26b1f56e5006d881e2e9ebcf29ee52` | `749d5468d191b8af3e4a4e1cdfc0b0cb8ff91275a171389c243d6865a8741862` | 261 |
| 26 | A4 | `app/renderer/src/lib/platform.ts` | `29069f196d91eb61ce2c7c11492695c249ad44f0` | `604a0aef17628ac335d5a9e428695a2ba565aeae5d1e60774d3b426360e7d7fe` | 590 |
| 27 | A4 | `app/renderer/src/shell/shell.css` | `bec217b80e442b0ef112757cf552f42f46c5734d` | `2b76fa8fc940272c8ace07a460adc202ff2736d014f36598f02efe3246c8e240` | 3506 |
| 28 | A4 | `test/桌面UI/project-state.test.ts`（新） | `fda47ca16f756a25d696ad68369bf754a0334e37` | `d0b6d244c17a0159ca92e1682104ee9e0cb94ec692b356ed01c1bd586adeb743` | 493 |
| 29 | A4 | `test/桌面UI/phase4b-electron-smoke.mjs` | `c71528f695a731aa229c4419e0b0e8897ca0f2ca` | `bd6fdba15954da3e6c689d9fe8028d421e4e59200909a2c1f3a42f6b6bf409eb` | 1294 |
| 30 | A4 | `test/桌面UI/phase4b-smoke-preload.cjs` | `cca75d9cbf480b5df4fc980c64a6b0f20e82c722` | `d1b7612173f0b888f2aa01cdec5e6674fac0efe4699a8988c40ab7550ac8d1b3` | 117 |
| 31 | A5 | `README.md` | `77e259adba7ae455f4cbb5d848b116ddc4629db7` | `d2c77e7864323c888c6b0b8da43f0782dfd44a0a5da2d7443e8627ea0f6f4692` | 339 |
| 32 | A5 | `README.en.md` | `3b0d1a60b9e22640ef4282eae1eef09332fddecf` | `51b1796b7442fc2754030576ae714045944e7255184c0ea8f9ffc8eba4b08315` | 339 |

### 1.3 改动规模（相对 HEAD `0a12310`）

| 节点 | 已跟踪修改（+ / −） | 新增文件行数 | 小计 |
| --- | --- | --- | --- |
| A0 运行时核心 | runtime.ts +134/−2；tools.ts +351；schema.ts +154 = **+639/−2** | project-state.ts **417** | +1056/−2 |
| A1 编排 | task-state.ts +169/−1；run-role.ts +34；test/编排/task-state +98、run-manifest +53、decision-card +49/−1 = **+403/−2** | 编排/project-state.ts 1156、version-decision.ts 493、test 465+420 = **2534** | +2937/−2 |
| A2 桌面窗口 | session.ts +921/−12；interface.ts +44；main.ts +5；preload.cjs +4；chief-workflow.test +40/−1 = **+1014/−13** | 桌面测试 330+750 = **1080** | +2094/−13 |
| A3 项目管理 | zh-CN +101、en-US +101、i18n.test +165/−3 = **+367/−3** | — | +367/−3 |
| A4 桌面UI | TaskCenterPanel +2；platform.ts +334；shell.css +151；phase4b smoke +85；preload.cjs +2 = **+574/−0** | ProjectStatePanel 261、UI 测试 493 = **754** | +1328/−0 |
| A5 装配 | README.md +1/−1、README.en.md +1/−1 = **+2/−2** | — | +2/−2 |
| **合计（产品/测试 32 文件）** | **23 个已跟踪文件：+2999 / −22** | **9 个新文件：4785 行** | — |

- 测试改动不弱化：`git diff --stat -- test` 为 7 个修改测试文件 **+492 / −5**（删除 5 行 = 2 条被超集取代的 import + 3 条 i18n 计数旧值更新）；无测试删除、无新增 `skip`/`todo`、断言未放宽（D1 重跑 §八）。
- README 中英各 1 行事件清单（`project.focus`/`project.note`/`version.decision`），无旧形状；`package.json`/锁/构建配置零改动。

### 1.4 写集闭合核对（团队计划 §4.1/§4.3）

| 检查 | 结果 |
| --- | --- |
| 期望写集 vs 实测 | 期望 32 路径（30 `src/app/test` + README 2）与 `git -c core.quotePath=false ls-files -m -o --exclude-standard -- src app test` + README 状态**精确匹配 32/32**（E1 复算；D1 证据 `12-scope-check.txt` 同结论） |
| 写集外产品/测试改动 | **0**（无额外源文件、无额外 `test/桌面应用/` 文件、无新 e2e 脚本） |
| `app/renderer/src/chat/ipc.ts` | 未改（条件路径未触发；现有刷新钩子足够） |
| `app/renderer/src/chat/project-state-view.ts` | 未创建（P1 审核裁决：走 `lib/platform.ts` 列内替代，不重开闸门 2） |
| 默认只读文件 | `src/common/编排/run-manifest.ts`、`decision-card.ts`、`workflow-preconditions.ts`、`versioned-doc-guard.ts` **零改动**（`git status` 无条目） |
| `package.json`/锁/构建/发布配置 | 零改动 |
| B-1/B-2 | `src/model/project-state.ts`（B-1）、`test/桌面应用/project-state.test.ts`、`version-decision.test.ts`（B-2）均按闸门 2 确认落地；无其它边界变更 |
| H1 边界文件 | 6 文件在 `角色卡/运行时核心/`、`角色卡/桌面窗口/`，属**人事治理记录**，不计入产品候选（见 §1.6） |

### 1.5 相对第一次 D1 的候选增量（D-04 返工，5 文件）

| 文件 | 旧 SHA-256（第一次 D1，已失效） | 新 SHA-256（当前候选） | 变化 |
| --- | --- | --- | --- |
| `src/model/project-state.ts` | `8e5a9145…` | `61d7793276bf389770673001dd416e8821a0943faa983e6e80eacf386bf3103a` | kind `rework-pending` |
| `src/common/编排/project-state.ts` | `6f9e6467…` | `a082f0d220a859d430f421c1225dd9384ade66e3cf5f723bfe8cac652007b6f8` | 白名单/前缀/字面量/注释 |
| `test/编排/project-state.test.ts` | `d7381231…` | `ba996417a6be036c66c7d55e9b806e0ee7093c07a724a0c2b26507d43928e266` | 字面量断言 |
| `app/renderer/src/lib/platform.ts` | `b7c2c7a2…` | `604a0aef17628ac335d5a9e428695a2ba565aeae5d1e60774d3b426360e7d7fe` | id→key 映射 |
| `test/桌面UI/project-state.test.ts` | `e47ea39b…` | `d0b6d244c17a0159ca92e1682104ee9e0cb94ec692b356ed01c1bd586adeb743` | 映射断言 |

- 路径增删 **0**；A2/A3/A5 文件字节未变；旧 D1 的 5 个旧哈希与全部结论**不得沿用**（见 §三.4）。

### 1.6 非产品候选：H1 边界 6 文件（人事治理）

| # | 文件 | `git hash-object` | SHA-256 | 行数 |
| --- | --- | --- | --- | --- |
| 1 | `角色卡/运行时核心/boundary.md` | `f93bc10b8ed16f6174190a9afaf6c5e2bdfe4a30` | `fe66eae23bced83f6faee1ffb3688d9678b43f57ccdaad385019944f91085a40` | 26 |
| 2 | `角色卡/运行时核心/boundary.yaml` | `9c5c0fc1211da0d9dafc8e81c0b4a8c5eddc8477` | `836766a1a9d7e907648390e7a812f7d56a9e400af278790cfb8e75ffcfb773ac` | 54 |
| 3 | `角色卡/运行时核心/changelog.md` | `9d8bd682f3cb547dcf4d85fd5d239adab03e40c0` | `605240bd934d280dbb03bcc6fc3aa0edaa0b8e2efdd5f41ef30da43c61cc12ba` | 260 |
| 4 | `角色卡/桌面窗口/boundary.md` | `6b8b01af3ff075b8c49d7d2a3d32bed99ce86d08` | `ba701add5128d2b3dfaa5ade2ad59c3b6c4f29e9783c4e228ca7169ee73ede4d` | 95 |
| 5 | `角色卡/桌面窗口/boundary.yaml` | `c21c39afd1caf97ef6c59ed29c5e61e500ec4013` | `7ddbf0139ee71c18ce563bb1f27c299907e67e813984fc2665e42c3e9840b730` | 258 |
| 6 | `角色卡/桌面窗口/changelog.md` | `91b687ec30608f2ff2eda65413df126c081c368b` | `7ba73bd31905e2f1e1354d19c1f2f03030bbcd773a907e74b5c228ff510e7cb9` | 201 |

- `git diff --numstat` 实测 6 文件 **+20 / −0**；内容为 B-1（运行时核心新增 `src/model/project-state.ts`）与 B-2（桌面窗口新增两个 `test/桌面应用/*.test.ts`）精确条目；md/yaml/changelog 一致。沟通记录 H1 核对：运行时核心 16/16 条、桌面窗口 79/79 条，`boundary-yaml`/`boundary-yaml-validation` 17/17 通过。**不计入产品候选**（V1 §2.7）。

### 1.7 非产品候选：治理/证据记录（运行期管理记录）

| 记录 | 路径 | 状态/说明 |
| --- | --- | --- |
| 团队计划 | `docs/scheduling/2026-11-02_team-plan_global-task-state.md` | 477 / `06d29aaf…`；文件头状态行写于闸门 2 确认前（历史状态），当前以沟通记录确认小节为准 |
| 方案 P1.3 | `docs/planning/2026-11-02_design_global-task-state-version-authority.md` | 1303 / `7faa3e8b…`；D-04 窄更正；文件头「待沟通核对 P1.3」为历史状态行，D-04 裁决记录为依据 |
| 复核记录 | `docs/planning/2026-11-02_review_global-task-state-version-authority.md` | 148 / `22128e59…`；P1.0 快照 103 / `3b8d3a3a…` 另计；未被改写 |
| V1 v1.1 | `docs/acceptance/global-task-state-criteria-v1.md` | 915 / `fe48dc32…`；v1 907 / `b6c23c78…` 已由 v1.1 窄更正替代 |
| P1 审核 | `角色卡/项目管理/docs/change/2026-11-02_global-task-state-P1-review.md` | 315 / `339c875b…`；初审 271 / `cca102df…` + 复审节；结论 `recommend approval` |
| P1 提案归档 | `docs/communication/2026-11-02_p1-proposals_global-task-state.md` | 454 / `cf1eb894…`；V0 358 / `00e334f7…` + 修订记录 |
| 沟通记录 | `docs/communication/2026-11-02_intent_global-task-state.md` | 201 / `fa4a3211…`；闸门 0/2、实施授权、H1/B0/P1.2/V1/P1、A0–A5、D1、D-04 裁决 |
| B0 基线 | `角色卡/测试/docs/change/2026-11-02_global-task-state-B0-baseline.md`（+证据 23 文件） | 167 / `5c275332…`；只作对照，不作当前候选证据 |
| D1 重跑 | `角色卡/测试/docs/change/2026-11-02_global-task-state-D1-rerun-regression.md`（+证据 40 文件） | 323 / `c36b7277…`；当前有效测试证据 |
| 旧 D1 | `角色卡/测试/docs/change/2026-11-02_global-task-state-D1-regression.md`（+证据） | `status: superseded`；证据目录 `SUPERSEDED.md`；**不得引用** |
| 管理 memo | `docs/communication/memo.md`、`docs/planning/memo.md` | 既有修改（团队计划 §1.4 已记录），非本任务产品候选；统筹 memo `docs/scheduling/memo.md` 在 E1 后追加续接行 |

### 1.8 候选可复算性

- D1 重跑运行结束后复测：HEAD 不变、候选 30 条 + README 2、逐文件 `git hash-object` + `sha256sum` 与快照 **32/32 无差异**、staged 空（`16-post-run-verification.log` / `99b9a785…`）。
- E1 在 D1 之后独立复算：32/32 与 §1.2 表一致；产品候选状态快照 `c7679830…`；无候选外产品/测试改动。
- 证据与候选绑定：D1 重跑的全部测试/E2E 均在该 32 文件候选上执行；候选在运行前后未变化。

---

## 二、节点 G2–E3

| 节点 | 角色 | 状态 | 证据/记录 |
| --- | --- | --- | --- |
| **G2 闸门/计划** | 统筹 → 沟通 → 客户 | **已确认（2026-11-02）** | 团队计划 477/`06d29aaf…`；客户原话「确认闸门 2：团队计划含 B-1/B-2；按该计划与 P1.1 实施；不含提交/推送/发布。」沟通记录「闸门 2 确认与实施授权记录」 |
| **H1 边界** | 人事 | **已完成** | B-1/B-2；6 文件 +20/−0；md/yaml 一致；boundary 测试 17/17；§1.6；`src app test` 无改动 |
| **P1.2 方案收口** | 策划 | **已完成（历史基线）** | 1302 / `1573e1ef…`；R2/R4/R5 窄修订，经沟通核对为实施/V1 基线 |
| **P1.3 D-04 窄更正** | 策划 | **已完成（D-04 后）** | 1303 / `7faa3e8b…`；仅 blocker kind id `acceptance-rework`→`rework-pending`；语义/范围/T3 不变；沟通 D-04 裁决为依据 |
| **V1 实施前标准** | 内置独立验收 | **已完成（v1.1）** | 915 / `fe48dc32…`；AC-1–AC-10 + R1–R5 + T3 + 判定规则；沟通 V1 核对通过；v1.1 仅 AC-1.1 枚举 id 窄更正 |
| **B0 基线** | 测试 | **已完成** | 167 / `5c275332…`；HEAD `0a12310`；`src app test` 空；typecheck 0；受影响 44/44；phase4b smoke 64/0/13 截图；`write-sequencing.test.ts` 排除并记未验证 |
| **P1 提案（V0）** | 运行时核心/编排/桌面窗口/桌面UI | **已提交（V0）** | 归档 358 / `00e334f7…`；A0/A1/A2/A4 只读短提案 |
| **P1 审核** | 项目管理 | **needs revision → 复审 `recommend approval`** | 初审 271 / `cca102df…`；复审 315 / `339c875b…`；PM 技术裁决 31 点采纳；唯一剩余必须项 P1-GTS2-01（A1 统一 `ProjectStateError` import）已在 A1 落实；A4 写集缺口改列内替代 `lib/platform.ts`（不重开闸门 2）；A2 IPC 收窄为仅 `project-state:get` |
| **A0 运行时核心** | 运行时核心 | **已完成** | `src/model/project-state.ts`（新）、`runtime.ts`、tools/schema；事件接口在 runtime、project-state 无反向依赖；三工具注入才注册；typecheck 0 |
| **A1 编排** | 编排 | **已完成** | `task-state.ts`/`project-state.ts`（新）/`version-decision.ts`（新）/`run-role.ts` + 5 测试；**45/45**、typecheck 0；R1 坏+好 manifest、R2 四类、R3 F5、R4 全部活动 run 用例通过；`run-manifest.ts`/`decision-card.ts` 零改动；P1-GTS2-01 已落实 |
| **A2 桌面窗口** | 桌面窗口 | **已完成** | `session.ts`/`interface.ts`/`main.ts`/`preload.cjs` + 3 测试；要求套件 **27/27**、全部桌面应用 **489/489**、typecheck 0；IPC 仅 `project-state:get`；`run-change*.test.ts` 零改动 |
| **A3 项目管理 i18n** | 项目管理 | **已完成** | zh/en 各 +101 行；新增 97 key（62+18+17）；计数 ui 1001 / main 576 / shared 62 / preferences 3 = **1642**；i18n/guard **16/16**、violations 0；typecheck 0 |
| **A4 桌面UI** | 桌面UI | **已完成（D-04 后 11/11）** | `TaskCenterPanel`/`ProjectStatePanel`（新）/`platform.ts`/`shell.css` + UI 测试 + phase4b 夹具；UI 测试 **11/11**；`typecheck:renderer`/`build:renderer` 0；未新建 `project-state-view.ts`、未加 `projectNote?` |
| **A5 装配** | 装配 | **已完成** | README 中英各 1 行事件清单（`project.focus`/`project.note`/`version.decision`）；其余未动；中英一致 |
| **D1 第一次（旧）** | 测试 | **已执行，被替代** | 旧记录 316 / `8a75e599…`（历史）→ 当前 superseded；T3 3461/3433/10/18；发现 **1 项新增确定性失败 D-04**（`acceptance-rework` 命中撤除残留守卫）；状态 `needs-work`；**旧结论/哈希作废** |
| **D-04 裁决与返工** | 项目管理裁决；A0/A1/A4 返工 | **已完成** | 改名 `acceptance-rework`→`rework-pending`；不改守卫/断言/重开闸门；A0/A1/A4 5 文件变化；A2/A3/A5 不改；P1.3/V1.1 窄更正 |
| **D1 重跑（当前）** | 测试 | **已完成** | 323 / `c36b7277…`；typecheck/typecheck:renderer/build:renderer 0；受影响 **99/99**；D-04 守卫 **6/6**；T3 **3462/3434/10/18**（9 既有 symlink EPERM + 1 间歇 cleanup EPERM；**新增确定性失败 0**）；E2E **69/0**、14 截图；证据目录 40 文件 |
| **E1 变更包** | 统筹 | **本文件** | 候选身份/节点/证据/T3/复用失效/披露；不判验收 |
| **E2 独立验收** | 内置独立验收 | **待执行（未判定）** | 将按 V1 v1.1 逐项 AC/R1–R5 判定；报告 `docs/acceptance/global-task-state-report-v1.md`；结论只能通过/返工/证据不足 |
| **E3 放行/回报** | 统筹 → 沟通 | **待 E2** | 只表示当前候选满足 V1；不授权提交/推送/发布 |

---

## 三、证据链接

### 3.1 门禁、计划、标准与方案

- 闸门 0/2、实施授权、P1.2/V1 核对、P1 复审、A0–A5 实施记录、D1/D-04：`docs/communication/2026-11-02_intent_global-task-state.md`（201 / `fa4a3211…`）。
- 团队计划：`docs/scheduling/2026-11-02_team-plan_global-task-state.md`（477 / `06d29aaf…`）；§4.1/§4.3 写集、§5.3 E1 出口、§6 约束、§7.2/§7.3 证据要求。
- 方案：P1.3 1303 / `7faa3e8b…`；P1.2 1302 / `1573e1ef…`（R1–R5 基线）；P1.1 1283 / `369f666a…`（历史）。
- 复核：148 / `22128e59…`；P1.0 快照 103 / `3b8d3a3a…`（两者不混用）。
- V1 v1.1：`docs/acceptance/global-task-state-criteria-v1.md`（915 / `fe48dc32…`）；v1 907 / `b6c23c78…` 已由 v1.1 窄更正替代。
- B0：`角色卡/测试/docs/change/2026-11-02_global-task-state-B0-baseline.md`（167 / `5c275332…`）+ 证据 23 文件。

### 3.2 提案、审核与实施记录

- P1 提案归档：`docs/communication/2026-11-02_p1-proposals_global-task-state.md`（454 / `cf1eb894…`；V0 358 / `00e334f7…`）。
- P1 审核：`角色卡/项目管理/docs/change/2026-11-02_global-task-state-P1-review.md`（315 / `339c875b…`；`recommend approval`；含 P1-GTS2-01–04）。
- A0–A5 实施报告：见沟通记录「实施记录 A0–A5」小节（A0/A1/A2/A3/A4/A5 的路径、行数、哈希、测试计数）；本 E1 已按工作区逐文件复算 32/32。

### 3.3 D1 重跑证据包（当前有效）

目录：`角色卡/测试/docs/change/2026-11-02_global-task-state-D1-rerun-regression-evidence/`（40 文件）。

| 证据 | 行数/大小 | SHA-256 |
| --- | --- | --- |
| `00-candidate-identity.txt` | 185 行 / 15,242 B | `417166423e1fb2b874c22b11a9db6c6844aa9dbcfe700938bb7fa8cb3b6335a6` |
| `00b-candidate-delta.txt`（旧→新 5 文件） | 22 行 / 1,572 B | `ca9b1177f3b3a082ceed295b147bb8944467a4ba69a94efcf1bc2c79d48d4ff3` |
| `01-npm-run-typecheck.log` | 9 行 / 233 B | `6121896fb7b72cc8acd00634234f41a725a0d41d2bb2a26f29533f2b74d7bd83` |
| `02-npm-run-typecheck-renderer.log` | 9 行 / 272 B | `cb5d9a6532cee60804de921761644f0924f9c4c33471f37842e1093b5c9e4b2d` |
| `03-npm-run-build-renderer.log` | 27 行 / 1,581 B | `138cdb2aa09c663aa45114291e0a36a4433f4077a79b38ed22df5e1e80af29ea` |
| `03a-token-check-before-build.txt` | 15 行 / 1,231 B | `8a42ca3ec8894b23049072221c4b69c5fa1bc237b59abbe7f70f17d1edb597a8` |
| `03b-renderer-dist-hashes.txt` | 27 行 / 1,285 B | `842ae61c334c56e44f486eb300698fc04d4d0b07e2802e1064ddc0a1e5153977` |
| `04-suite-orchestration.log` | 58 行 / 5,487 B | `5c2d97af22cb9e701e1df681955e772f6afad5ae7b269b44926adba371820bec` |
| `05-suite-desktop-app.log` | 40 行 / 3,762 B | `e7ccf1d8a5e3b7f05aa4b617430920621d2a44a15af1a5ce73f49751cefd542e` |
| `06-suite-i18n.log` | 30 行 / 1,962 B | `5c542be9f76d2eaeb9a2f53f060c867fa95a3f57f3f2bd47ef767918bb530a84` |
| `07-suite-desktop-ui.log` | 24 行 / 1,505 B | `80189d18af9e57e74a97a3d117059828140ed74409d1c1f5d376c5d785da3271` |
| `08-d04-guard.log` | 19 行 / 907 B | `f7c4078edddb9600dabbef0dff333eec37c46747f05f6010853b153975f3078b` |
| `09-phase4b-electron-smoke.log` | 82 行 / 7,098 B | `38cb55b3c133a127f904fd495c5a9d431d968e08a209221276a01a2b29057357` |
| `10-full-t3-file-list.txt` | 393 行 / 16,684 B | `a57ec953b345c2a2ded73b3c7337bc0477be32de95b0f56167841a731f9a15ce` |
| `10-full-t3.log` | 4,578 行 / 512,124 B | `9f92a5eec5efe9900e65e427e5c5f295273015923b9d1f5fe09728359be83472` |
| `11-test-diff-U0.txt` | 546 行 / 28,549 B | `f3202e62fc1cbff9efa7b47abce23d9cdfda1c610dccef431676d8d8c9e843a7` |
| `11b-test-diff-summary.txt` | 22 行 / 1,138 B | `771ca07cbf55d67837f74503be5d9ae608b128e8268a8d3bae02b54146efee4d` |
| `12-scope-check.txt` | 13 行 / 387 B | `a4dbb2da68a4229b23d2c6a3f583fde4d0ceef310f44ab21448632b1b260751c` |
| `13-readme-checklist.txt` | 13 行 / 1,655 B | `72b126717c0cf5f18b98d3195e290f3b67db3151876a9bed5e3a337c0080e0df` |
| `14b-recheck-background-entry-run1.log` | 25 行 / 1,721 B | `2b1a85408b426d0a45fd88330ecfc4f911834c3d4393ce8a01521e53d1cca2d1` |
| `14b-recheck-background-entry-run2.log` | 41 行 / 2,723 B | `eb7b3c42923782d18cf6301e105e393c9e880731cc2badc40e7bfdda3f2acb89` |
| `15-failure-classification.txt` | 207 行 / 15,150 B | `c54158243e0dc6e4358982b1a3c0768e2ac68610201bd7d6425c4646b6199e28` |
| `16-post-run-verification.log` | 54 行 / 2,663 B | `99b9a785845c5ccc3d28590552fbf865a804e1030f123d063fe1a99c01deba11` |
| `17-inventory.txt` | 44 行 / 4,305 B | `eb20d785f442feb9e7ce75f7588d8dcee4cd4e2c952e72690b4da4b133a965b4` |
| `phase4b-out/SHA256SUMS` | 15 行 / 1,370 B | `ac2329b924e2b183c89e3bb2bdc5970011070ca40f282a019441f33cac0c6cd2` |
| `phase4b-out/report.json` | 822 行 / 18,830 B | `aef95035a366e7a8c25ccd675a4cade2aa2f2abc1b7bdadc14776117205cf4ff` |
| `phase4b-out/phase4b-project-state.png` | 114,979 B | `bb8ee07b9beca13fd60fea363104e4466a5661367256c09c242894307fea9b6b` |

- 其余 13 张截图逐文件哈希见 `phase4b-out/SHA256SUMS` 与重跑记录 §十；E2E 入口 `app/renderer/dist/index.html` SHA-256 `c6078edff986f8cbdff6b56f184e7ac2812b8292fb5f3aac7beca8e7d1c8087f`。

### 3.4 旧 D1（superseded）

- 旧记录 `角色卡/测试/docs/change/2026-11-02_global-task-state-D1-regression.md`：frontmatter `status: superseded`，正文顶部标注「已被替代」，证据目录含 `SUPERSEDED.md`。
- 旧候选（D-04 返工前）、旧 T3 计数（3461/3433/10/18）与 `needs-work` 结论**全部作废**，E2 不得引用；仅可作历史追溯。

### 3.5 证据复用核对

- D1 重跑证据绑定当前 32 文件候选（`00-candidate-identity.txt` + `16-post-run-verification.log` 32/32 一致）；E1 复算一致。
- E2 在分发前与合并后应各核对一次候选快照（V1 §2.7）；若候选变化，D1/E1 证据按 V1 §2.5 失效并补证。

---

## 四、T3 与测试/构建/E2E

### 4.1 门禁命令（D1 重跑，当前候选）

| 命令 | 退出码 | 结果 | 证据 |
| --- | --- | --- | --- |
| `npm run typecheck` | **0** | 0 类型错误 | `01-npm-run-typecheck.log` |
| `npm run typecheck:renderer` | **0** | 0 类型错误 | `02-npm-run-typecheck-renderer.log` |
| `npm run build:renderer` | **0** | vite 8.3.4，2795 modules，382ms；仅既有非致命警告 | `03-npm-run-build-renderer.log` |

- 重建入口 `app/renderer/dist/index.html` `c6078edf…`；重建后 dist 旧 token `acceptance-rework` **0**、新 token `rework-pending` **1**（`03a/03b`）；dist 为忽略产物、非候选。

### 4.2 受影响套件（`node --test --test-concurrency=1`）

| 层 | 文件组 | tests | pass | fail | skip | todo |
| --- | --- | --- | --- | --- | --- | --- |
| 编排 A1 | `test/编排/{project-state,version-decision,task-state,run-manifest,decision-card}.test.ts` | 45 | **45** | 0 | 0 | 0 |
| 桌面窗口 A2 | `test/桌面应用/{project-state,version-decision,chief-workflow,run-change,run-change-entry}.test.ts` | 27 | **27** | 0 | 0 | 0 |
| 项目管理 A3 | `test/项目管理/shared/{i18n,i18n-guard}.test.ts` | 16 | **16** | 0 | 0 | 0 |
| 桌面UI A4 | `test/桌面UI/project-state.test.ts` | 11 | **11** | 0 | 0 | 0 |
| **合计** | — | **99** | **99** | 0 | 0 | 0 |

- D-04 守卫单测：`test/测试/entry-role-minimal-d.test.ts` **6/6 pass**（`08-d04-guard.log`），第一次 D1 的新增失败已消失。
- i18n：`[i18n-guard] scanned=132 allowlisted=20 violations=0`；计数 ui 1001 / main 576 / shared 62 / preferences 3 = **1642**。

### 4.3 T3 全量回归

| 项 | 实测值 |
| --- | --- |
| 命令 | `node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts' \| sort)` |
| cwd / 环境 | worktree 根；Node **v24.22.1** / npm **11.19.1** / Windows 11 Pro 10.0.26300（Git Bash）；Electron 44.7.0；Asia/Shanghai |
| 文件数 | **393**（`test/**/*.test.ts` 共 394，排除 `write-sequencing.test.ts`；清单 `10-full-t3-file-list.txt`） |
| 起止 / 耗时 | 20:26:57–20:31:49（+08:00） / **291,225.3082 ms ≈ 4 分 51 秒** |
| 退出码 | **1**（因失败；非运行错误） |
| 计数 | **tests 3462 / pass 3434 / fail 10 / cancelled 0 / skipped 18 / todo 0** |
| 失败分类 | **9 项既有 Windows symlink EPERM + 1 项间歇性 TEMP cleanup EPERM（环境）**；**新增确定性失败 = 0** |
| 新 skip | **0**（18 项与既有平台 skip 分类一致） |
| 与第一次 D1 对比 | 3461→3462（A4 返工新增 1 项 UI 测试）；D-04 新增确定性失败消失；本次多出的 background-entry 失败为间歇性环境 EPERM |

**排除项（不得当作通过）**：`test/pi-adapter/write-sequencing.test.ts` —— 仓库既有已知挂起（历史 39+ 分钟无进展、CPU 约 2339s），客户已决定排除；依据 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604`。本轮**未运行、行为未验证**；排除命令即上述 `find ... ! -name 'write-sequencing.test.ts'`。

### 4.4 失败分类明细（T3 全量 10 项）

- **既有环境失败（9，与第一次 D1 相同）**：均为 `EPERM: operation not permitted, symlink`（errno -4048），与 2026-10-30 既有全量基线同类：
  1. `test/claude-adapter/session.test.ts:639` native symlink and storage runtime mismatch fail before SDK query
  2. `test/codex-adapter/session.test.ts:351` native directory symlink rejected before engine…
  3. `test/pi-adapter/injected-runtime.test.ts:185` store validate callback rejects directory symlink…
  4. `test/pi-adapter/injected-runtime.test.ts:193` Pi storage refuses file symlink…
  5. `test/runtime-core/file-write-safety.test.ts:97` D3 linked workspace root remains usable…
  6. `test/runtime-core/session-store.test.ts:46` store: traversal, mismatched scope and symlinked runtime directories rejected
  7. `test/runtime-core/session-store.test.ts:58` store: native validation stays lazy…
  8. `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` 读取器入参防御（对抗）…
  9. `test/编排/shell-authorized-routine.test.ts:184` node test外指符号链接路径不获委托…
- **间歇性环境失败（1，非确定性，单列）**：`test/测试/background-tasks-entry/background-entry.test.ts:292`（F4/CC1 第 9 个并发启动在 ShellGate 前被拒）—— 失败为 `rmSync` 清理阶段 `EPERM`（`fixture.ts:52`），**不是断言失败、不涉及候选代码**；第一次 D1 全量通过、本次失败一次；单文件隔离复跑 2 次：run1 **12/12 pass**、run2 **11/12 fail（同一 cleanup EPERM）**（`14b-…run1/run2.log`）→ **非确定性环境 flake**。
- **新增确定性失败：0**。全量失败集合均归环境，无任何失败指向候选断言/行为；无未知/无法解释失败；无新增 skip/todo；无测试删除；未改断言保绿。

### 4.5 Electron E2E（phase4b，当前候选重建）

| 项 | 实测值 |
| --- | --- |
| 命令 | `./node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs app/renderer/dist/index.html C:/Users/51054/AppData/Local/Temp/ans-phase4b-smoke-d1-rerun` |
| 起止 / 退出码 | 20:26:32–20:26:45（+08:00） / **0** |
| 汇总 | **`PHASE4B_SMOKE PASS 69 checks / 0 failures`** |
| report.json | checks 69/69 true、failures 0、console errors 0、CSP violations 0、截图 **14 张**（含 5 项 project-state 断言全 true） |
| 入口 | 返工后候选重建的 `app/renderer/dist/index.html`，SHA-256 `c6078edff986f8cbdff6b56f184e7ac2812b8292fb5f3aac7beca8e7d1c8087f` |
| 不录屏 | 满足（仅截图）；截图逐文件 SHA-256 见 `phase4b-out/SHA256SUMS` |

- harness 既有行为：`phase4b-960.png` 与 `phase4b-960-five-role-tree.png` 哈希相同；`test/桌面应用/e2e/main.mjs` 未运行（D1 判定非必要），不当作 E2E 证据。

### 4.6 测试完整性 / 构建

- 测试 diff：7 个修改测试文件 **+492 / −5**；删除行仅 5 条（2 条 import 被超集取代、3 条 i18n 计数旧值更新）；断言仍为 `assert.deepEqual`/`assert.equal`；无新增 skip/todo、无测试删除（`11-test-diff-U0.txt`、`11b-test-diff-summary.txt`）。
- README（A5 无后续改动）：中英各 1 行事件清单，含 `project.focus`/`project.note`/`version.decision`，无旧形状（`13-readme-checklist.txt`）。
- 写集核对：32/32 精确匹配、无越界、无 package/构建配置改动（`12-scope-check.txt`）。

---

## 五、复用/失效

### 5.1 可复用（对 E2）

| 证据 | 复用理由 / 未失效依据 |
| --- | --- |
| 闸门 0/2、实施授权、P1 复审、P1.3/V1.1 窄更正记录 | 管理确认记录；D-04 裁决明确不重开闸门；语义/范围/T3/写权/验收边界未变 |
| H1 边界 6 文件 + 沟通 H1 核对 | 治理变更；与产品候选隔离；E1 复算哈希见 §1.6 |
| B0 基线（167 / `5c275332…`） | **只作对照**（既有失败分类、环境、harness 可运行性），**不得作为当前候选证据**（V1 §2.5） |
| D1 重跑记录 + 证据包（323 / `c36b7277…`；40 文件） | 在同一 32 文件候选上执行；运行前后候选 32/32 一致；E1 复算一致；可复用于 E2 的 T3/受影响套件/E2E/失败分类 |
| P1 审核（315 / `339c875b…`）与提案归档（454 / `cf1eb894…`） | 记录契约/写集/测试映射裁决与 P1-GTS2-01 落实；不代替 V1/E2 |
| 方案 P1.3（1303 / `7faa3e8b…`）、V1 v1.1（915 / `fe48dc32…`） | 当前判定基线；窄更正只改枚举 id/语义披露，不降低 AC 强度 |

### 5.2 不可复用（已失效）

| 证据 | 失效原因 |
| --- | --- |
| 旧 D1 记录与证据（所有旧候选哈希、3461/3433/10/18、`needs-work`、旧 E2E 结果） | D-04 返工改变 5 个候选文件；旧候选已不存在；记录已 `superseded` |
| D-04 返工前 5 文件旧哈希（`8e5a9145…`/`6f9e6467…`/`d7381231…`/`b7c2c7a2…`/`e47ea39b…`） | 被当前 §1.2 哈希替代 |
| V1 v1（907 / `b6c23c78…`） | 由 V1 v1.1 窄更正替代（AC-1.1 枚举 id） |
| B0 的 phase4b 截图与 `app/renderer/dist/` 入口 | B0 记录为既有忽略产物；D1 已按当前候选重建并重跑 |
| 其它变更（acceptance-return-card、dispatch-guardrail-relax、i18n、shell-escalation 等）的通过结论/证据 | V1 §2.4/§2.5 禁止替本变更背书 |

### 5.3 E2 复用规则

- 仅同候选、同输入/依赖/夹具、同命令、同环境、同配置的证据可复用；候选变化使受影响证据失效，只补失效部分（V1 §2.5）。
- E2 分发前与合并后各核对一次候选快照（HEAD + 产品状态快照 + 逐文件哈希）；不一致即按证据不足/失效处理。

---

## 六、已知限制与偏差（E1/E2 须核对）

1. **`acceptance-rework` 收窄**：A1 只按机器事实（acceptance request reject；可选 `task.closed(rework)`）派生 `rework-pending` blocker，不实现设计 §3.4「未收口返工任务」文本推断（PM A1-5 裁决）；语义/AC 不变。
2. **A2 `ensureDraftRun` all-or-nothing**：新版本开发创建侧仍经 all-or-nothing `findActiveRun`；无关坏 manifest 时如实 `execution-failed`（PM A2-3 接受）；未新增 partial-aware 助手。
3. **崩溃对账更保守**：A2 对「resolved→executing 崩溃窗口」要求新 flow/run 存在、旧 flow 无 active、且存在 `project.focus(sourceDecisionId)`，否则 `uncertain`；属保守实现，不改变 AC-8.3 语义。
4. **A4 未单列 `notes[]`**：PM §六 冻结的 62 个 `ui.projectState.*` key 无 `section.notes`；notes 信息由 blockers `chief-note` 与 nextStep 覆盖；payload 契约不变。
5. **工具摘要默认标签**：A2 `project_state` 工具文本摘要使用 A1 默认机器可读标签；A3 未冻结摘要标签 key（UI/卡面/系统行已走 A3 key）；不影响 UI/i18n AC。
6. **`projectNote` 回执中文**：沿用既有中文风格并通过 `i18n-guard`；未新增独立 i18n key。
7. **D-04 改名**：blocker kind 内部 id `acceptance-rework` → **`rework-pending`**（`blockers[].id` 前缀同步；UI 文案与 i18n key `ui.projectState.blocker.kind.acceptanceRework` 保留；未改守卫/断言、不重开闸门 1/2）。V1 v1.1 与方案 P1.3 为同一窄更正的验收/方案记录。
8. **文档状态历史行**：方案 P1.3 头「待沟通核对 P1.3/待闸门 1」、团队计划头「闸门 2 未确认」均写于对应确认之前，属历史状态行；当前以沟通记录确认小节、D-04 裁决、V1 v1.1 与冻结哈希为准（同 V1 §九.2/§九.3 口径）。
9. **分支名 vs worktree 名**：实际分支 `feat/acceptance-return-card`，worktree `flow-improvements-wave1`；HEAD 与团队计划/B0/V1 一致；验收以 HEAD + 候选哈希为准。
10. **E2E 形式**：plain `node test/桌面UI/phase4b-electron-smoke.mjs` 不可用（ESM 命名导入 CJS electron 立即 SyntaxError）；D1 按 harness 既有方式用 `./node_modules/.bin/electron` 运行并记录，未新建 e2e 脚本。

- 以上均**不改变范围、T3、写权/边界、验收判定与客户闸门**；如 E2 认为某项与 V1 解释不同，按 V1 §1.2 停止澄清/递增版本，不自行放宽。

---

## 七、未完成事项与未授权

1. **E2 未判**：本文件不代替独立验收；AC-1–AC-10、R1–R5 的 pass/fail/insufficient 由 E2 按 V1 v1.1 判定。
2. **E3 未放行**：待 E2；E3 只表示当前候选满足 V1。
3. **提交/推送/合并/发布未授权、未执行**：客户实施授权明确不含提交/推送/合并/发布（沟通记录闸门 2 确认与实施授权）；本候选仍为 HEAD `0a12310` + 工作树未提交改动。
4. **旧 D1 不得引用**：其结论/哈希/证据作废（superseded）。
5. **T3 排除项未验证**：`test/pi-adapter/write-sequencing.test.ts` 未运行、未验证，不得当作通过。
6. **间歇性环境 flake**：background-entry cleanup EPERM 单次出现；若 E2 需复核，可按仓库既有 EPERM 口径另行观察。
7. **`test/桌面应用/e2e/main.mjs` 未运行**：D1 判定非必要；E2E 证据以 phase4b 为准。
8. **无 task_ops**：未启用 `.ans/project.json`；未伪造任务令牌/锁/审批/验收凭证。

---

## 八、E1 出口核对与声明

- 候选可复算：**是**（§1.1–§1.2；D1 前/后 32/32 一致；E1 独立复算一致）。
- 路径/节点/证据/T3 齐全：**是**（§一–§四）。
- 写集闭合：**32/32 精确匹配，写集外产品/测试改动 0**；H1 边界 6 文件与治理/证据记录单列为非产品候选。
- T3：**3462 / 3434 / 10 / 18**；新增确定性失败 **0**；排除项、既有失败与间歇性环境失败均已单列。
- 复用/失效：已列（§五）；旧 D1 明确作废。
- 本 E1 变更包**不判通过/返工/证据不足**，不代替 E2，不授权 commit/push/merge/release，不接触客户。
- 本文件写盘未修改任何产品/测试/方案/复核/沟通/验收/角色卡/边界文件；仅写 `docs/scheduling/global-task-state-change-v1.md`（及统筹 memo 续接行）。
