# 变更包：角色根文档在详情面板展示（role-root-docs-display，T2）v1

- **任务 ID**：`2026-10-23-role-root-docs-display`
- **产品 flowId**：`role-root-docs-display`（任务标签）
- **风险档位**：**T2（跨角色/接口/契约变更）**；目标版本 **v1.7.0**
- **记录角色**：ANS 统筹（Scheduler，内置管理角色，独立子代理上下文）
- **日期**：2026-10-24（任务日期 2026-10-23）
- **状态**：**实施与测试完成，待独立验收（I10）；不是验收报告**。本文件不判定通过/返工/证据不足，不写 `docs/acceptance/`，不改变任何代码/测试/角色卡/边界/方案/标准/验收报告。
- **候选身份**：分支 `v1.7.0-work`，HEAD `d64590f35c0531d0e41acd1be32be9f415a06a2b`（`feat(role-docs): show role root documents in the role detail panel`；tree `6bb0d018cdf9983d96016f75b977d594aee26b69`；父提交 `6407d636b69e3f8eb12fb872e2622172bcbff583`）；**候选 = 已提交内容**（17 个产品/测试文件，见 §二）。
- **工作树**：`git status --short` 实测为 `M docs/communication/memo.md`、`?? .claude/`、`?? demos/`；`git diff --cached --name-only` **为空**（0 项）。产品/测试候选无未提交改动；`memo.md` 是管理记录（1 行新增），不是候选；`.claude/`、`demos/` 为既有未跟踪工作区内容，不计候选。
- **提交事实**：HEAD `d64590f` 共含 85 个路径 = 17 个产品/测试候选 + 68 个管理记录/证据/打印日志规则文档。提交事实不构成验收结论，也不构成提交/发布授权；S6 记录仍为 `verified-by-tests-only`。

## 闸门、标准与冻结版本（哈希为本文件写盘时实测）

| 项 | 状态 | 文件 / 实测身份 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-10-23）** | `docs/communication/2026-10-23_intent_role-root-docs-display.md`：当前 **81 行**；SHA-256 `a980ea7ab180476a78c317316a91963335cf796ff5cf9595a6d9466638de9182`；blob `ed256d07749eac8919ff17c7eaa668393cc5370e`（含 2026-10-23 实施授权 +8 行） |
| 闸门 1：方案确认 | **已确认（2026-10-23，Q1–Q12 推荐 A；Q9 明确 A）** | 方案 v1：`docs/planning/2026-10-23_design_role-root-docs-display.md`：**1023 行**；SHA-256 `9b69a7864112eb3df0c1da86b6ce653bb9235d4c655ac4d6f3b979e29080c26d`；blob `e898e65b9b388c2e4fdc529bfbbcf6fbe03fa5b4` |
| 闸门 2：角色/写集/顺序/验收安排 | **已确认（2026-10-23）** | 团队计划 v1：`docs/scheduling/2026-10-23-role-root-docs-display-team-plan.md`：**488 行**；SHA-256 `8ec6e0d7f264a89bad3cb081371079dca8e2785750f29df9769704342f895fa8`；blob `98f41bd0be9c16e1b5556509acc4c581a2c0818c` |
| 实施授权 | **已给（2026-10-23），不含 commit/push/发布/目标写入** | 同沟通记录「实施授权记录（2026-10-23）」；授权对象为团队计划 v1 + T2 标准 v1 |
| 实施前验收标准 | **已写盘冻结（2026-10-23），不是验收报告** | `docs/acceptance/role-root-docs-display-criteria-v1.md`：**784 行**；SHA-256 `12981ed44ee1786d4a73d9441b823075b6ed88a23ae10b95d928afb225f6efcb`；blob `c0239c051be301c96aa07df1ab33ffc12cbbad33` |
| S1 基线记录 | **baseline complete，不改写** | `角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display-baseline.md`：**271 行**；SHA-256 `a6aa70d53e7806baee108973692a460527995c3d041ab1a9e658abf561ccb353`；blob `fea5f2594992750ee1b288c837d649cba316559e` |
| S1 上游重冻记录 | **supplement，不改写** | `角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display-baseline-upstream-refreeze.md`：**139 行**；SHA-256 `9b77fef41a805f9da2897396392b40a7ca7705e7be3f7cd5e607abfc4afa52ac`；blob `6865470673afca40f9c6121c49673a89adb3e84e`；上游 `src app test` 规范快照 `36ae8c046bf61ec8d87b0c18983c2bc725db184343eacd0eea294f3297a3ec5c` |
| S6 测试记录 | **verified-by-tests-only（不是验收）** | `角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display.md`：**185 行**；SHA-256 `65e49491a3f39f6dbeb39378a3cc91e23400b26a4912f5dd9eb792f7b28b9f62`；blob `c582394b5e36f6b97fdc35206ae38b16e6d9a2d1` |
| S2+S3 记录（桌面窗口） | implemented-unverified | `角色卡/桌面窗口/docs/change/2026-10-23_change_role-root-docs-display.md`：152 行；SHA-256 `bf1abed6a12ca4b33b3f1bcebdb068b4e037545a38bd139f686d37d1928f5c16` |
| S4 记录（桌面UI） | implemented-unverified | `角色卡/桌面UI/docs/change/2026-10-23_change_role-root-docs-display.md`：124 行；SHA-256 `add7e02ce2c5e54f4941fa16dd5d2a45d2ee092bfba547d7996b4b41490f8599` |
| S5 记录（项目管理） | implemented-unverified | `角色卡/项目管理/docs/change/2026-10-23_change_role-root-docs-display.md`：87 行；SHA-256 `1c1881f33e2e717d8a87192b10d5d2790a5f08e19ce659f96dfb30e794dbb9c1` |

> 沟通记录当前 81 行版本含实施授权；验收标准与团队计划引用的是授权前的 **73 行**快照（SHA-256 `016798a1541e232a33d32ec4b3b97a7dce156fdfe580aa527bde23461da4d09a`，位于父提交 `6407d63`）。这是授权追加造成的版本漂移，不是方案/标准内容变化；见 §十。

---

## 一、本变更包的用途与不做的事

1. **用途**：给内置独立验收（I10）提供候选身份、写集/隔离、S1–S7 节点、实现摘要、验证证据、残余/边界、复算命令与 P 编号映射，作为按 `role-root-docs-display-criteria-v1.md` 判定的输入。
2. **不做**：不判定通过/返工/证据不足；不写 `docs/acceptance/`；不修改任何代码、测试、角色卡、边界、方案、团队计划、沟通记录、角色记录或证据；不 commit/push/merge/发布；不写目标项目。
3. **事实口径**：本文件只陈述可复算事实与记录引用；记录中的“pass/通过”是**测试执行结果**，不是验收判断。S6 的 `verified-by-tests-only` 不等于验收。
4. **候选口径**：候选只指 §二列出的 17 个产品/测试文件；管理记录、证据、打印/日志规则文档、`.claude/`、`demos/`、构建产物均不纳入候选，也不为其背书。

---

## 二、候选身份与稳定性

### 2.1 候选文件（17 个：15 改 + 2 新增）

> 哈希为 2026-10-24 在工作区复算；17/17 与 S6 `s6-candidate-hashes.txt` 的 expected blob/sha256 一致（`MISMATCHES=0`），且工作区内容 = HEAD `d64590f` 的 blob。字节数为工作区实测。

| # | 文件 | 变更 | `git hash-object`（候选 blob） | `sha256sum` | 字节 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/model/project-document.ts` | 改 | `e501ff31112a6f6534489102af47be9250135ba9` | `0cc0827309cc66ac152a654c42e082841b5af89bc1ce29a02ef9c6d8158ab2e3` | 2,273 |
| 2 | `src/service/project-document/impl/read-project-document.ts` | 改 | `ef66fa6901ee720ac13efcbcc287e73825971b58` | `1895cac3bc3bff339475a49dec87cd13cf8cf861c346596610163af365e1393f` | 8,928 |
| 3 | `app/desktop/project.ts` | 改 | `47b41f644169e87c6f22fef87906963d6981cbc1` | `06f0480997f0954a08f258638984af90b6c4b28b10310f55c6c0878660f20438` | 27,931 |
| 4 | `app/desktop/interface.ts` | 改 | `b28ba1a5d16540db208e5aca123baf2eeff851a6` | `29c12b331f2412995c232811e54072e4c7c4420f0fa50c4461cc9db99c75e30b` | 337,485 |
| 5 | `app/renderer/src/chat/types.ts` | 改 | `098f4658971f59ae41f421e521dc1bf55ee29600` | `a96cc9dfc0ea0931ed17bf60b9f622db5fe863cf579da5ef86bbeb463b136ecc` | 5,599 |
| 6 | `app/renderer/src/chat/profile-docs.ts` | **新增** | `de20311a7e04139d00ebad383743576536f8115b` | `d4a11e865c577db8b75359f0ee2846c7812cfb11b09b7dde536d4c477dba1d3f` | 6,298 |
| 7 | `app/renderer/src/shell/ProfilePanel.tsx` | 改 | `a67c83a6713729109e933c9cf3314f649bf972e3` | `6b1c83d271afda2b18e4c39b6c0a29ccea8de3adf37313074bf259bdeea8d29b` | 14,768 |
| 8 | `app/renderer/src/stores/drawer-store.ts` | 改 | `8f0b47551af096d6542e445121141816744c9e7d` | `33ad9bfd63e92ff2f6be5252575bd39407212284a7f68b423e31022640904ea0` | 24,765 |
| 9 | `app/renderer/src/shell/phase4a.css` | 改 | `bc235d74c12940e60fe08e7062356a82cec1bf4c` | `944dc3dddbb9cea412cf743ab839590aecea11f6bb84a8399549c5cd8e7d425f` | 21,960 |
| 10 | `test/桌面应用/project.test.ts` | 改 | `2f7bad44dfcbad7e9958325ce73aed56cb8b4d53` | `c476fa95f120dceda66ddf58dd434394f10dbe42a96c9efe7aaa42a672619634` | 24,042 |
| 11 | `test/桌面应用/project-document.test.ts` | 改 | `3699d75248361746f7a0d6fb2efb68000379a8f8` | `b1bf71888e206cab3b28ca73cb359b3c8c6e21c9888b47552042245f15745b9d` | 30,040 |
| 12 | `test/桌面应用/interface.test.ts` | 改 | `5715173679ca724a53e832777bf4c48c7f3fb047` | `4f5f7488ec2ff9fe2f53e6c174dc6a4678f9d30d61573169cc9ce1d8fee7c745` | 362,076 |
| 13 | `test/桌面UI/profile-docs.test.ts` | **新增** | `971778432601f2ce758f66d818a7065a72fa34d5` | `ea393edbb5ac0a3ee1c08a4918b3e2078a46f2681f2dc4063bead9f13d37f386` | 9,319 |
| 14 | `test/桌面UI/phase4a-electron-smoke.mjs` | 改 | `a94a5efcbfd4ec03990cc450fd15fdaa51f9d34d` | `fb32c7ab57809ddd089983ae352087516e8ed04f85e139e030449e9c1ed99479` | 80,875 |
| 15 | `src/common/shared/i18n/messages/zh-CN.ts` | 改 | `5700649eccc1255a3b616073a32f42d23ebeb6cb` | `c37fc29f91b5419595e3a65171ade3cad917c389b53de456a536b6979d7d9255` | 116,252 |
| 16 | `src/common/shared/i18n/messages/en-US.ts` | 改 | `183eddea3473701315b44c6f7be9754705051051` | `37e4ad6c08f8678b2bd3372dd44594f9040a88382f2f99194e363b3b5b4e4d0d` | 123,208 |
| 17 | `test/项目管理/shared/i18n.test.ts` | 改 | `1b8a35c5de5771b179fd66a6f2cd3d5b5b4e6d6c` | `048d2be66863b1f98e147f2111934123371df27f2d363ab3cc84fac9fd7d3c72` | 59,822 |

**候选汇总**：17 文件，+1,335 / −55 行（`git diff --stat 6407d63 d64590f -- <17 paths>`）；15 个修改 + 2 个新增；无删除。

**候选清单整体哈希（本包复算方法）**：将 17 行 `<sha256>  <path>` 按路径 C 字节序排序后对清单文件取 SHA-256，得 `f2decbb95ff1e9ca24deb1da9fd00de699e3b7e4377a6bdcec7b4b4eaba8e288`（17 行）。复算见 §八。

### 2.2 候选稳定性与 S6 对照

- S6 `s6-candidate-hashes.txt`（证据 SHA-256 `cf1277e17b19dfd0281a15b3b77a82b04506c976bce7033a7a772d95ec98598e`）记录 17/17 `YES`、`MISMATCHES=0`。
- 2026-10-24 本包复算：17/17 blob 与 SHA-256 均与 S6 expected 一致；工作区与 HEAD `d64590f` 对这 17 个路径无 diff（`git status --porcelain -- <17>` 为空）。
- 因此 **候选内容身份稳定**：S6 证据绑定的 17 个产品/测试 blob 与当前提交内容逐项一致；S6 记录的 HEAD `6407d63` 与当前 HEAD `d64590f` 的差异只是“同一候选内容被提交 + 管理记录入库”，17 个产品/测试文件内容未变。
- 提交 `d64590f` 对 17 个候选的修改统计：15 改 + 2 增，无删除；提交父 `6407d63` 与 S6 记录一致。

**相对 S1 基线的增量（S6 `s6-s1-snapshot-comparison.txt`）**：与 S1 上游重冻 `36ae8c04…` 的 129 个“当时脏/未跟踪”路径逐文件对照，结果 **119 same / 10 changed / 0 missing**。10 个 changed 都是 S1 时已脏、本变更继续修改的文件（`interface.ts`、`project.ts`、`types.ts`、`ProfilePanel.tsx`、`drawer-store.ts`、`phase4a.css`、`zh-CN.ts`、`en-US.ts`、`interface.test.ts`、`i18n.test.ts`）；5 个候选修改文件在 S1 时是干净文件（Model、Service impl、`project.test.ts`、`project-document.test.ts`、`phase4a-electron-smoke.mjs`），故不在 S1 脏清单；2 个候选是新增文件（`profile-docs.ts`、`profile-docs.test.ts`）。未发现候选之外的 `src app test` 内容变化。

### 2.3 候选之外的内容（不纳入候选）

| 类别 | 路径示例 | 说明 |
| --- | --- | --- |
| 沟通/规则管理记录 | `docs/communication/2026-10-23_intent_role-root-docs-display.md`、`2026-10-23_intent-print-logging-rule.md`、`docs/communication/memo.md` | 闸门/授权/打印日志规则记录；不是产品候选 |
| 角色实施记录 | `角色卡/{桌面窗口,桌面UI,项目管理,测试}/docs/change/2026-10-23_change_role-root-docs-display.md` | S1–S6 记录；不是产品候选 |
| 角色证据 | `角色卡/*/docs/change/2026-10-23_change_role-root-docs-display-*evidence/**` | 原始日志/截图/哈希；不是产品候选 |
| 打印/日志规则 | `角色卡/项目管理/docs/change/2026-10-23_change_print-logging-rule.md`、`角色卡/项目管理/docs/project-rules.md`、`角色卡/项目管理/memo.md` | 独立 T1 工程规则记录（客户 2026-10-23 规则）；不是本变更产品候选 |
| 工作区未跟踪 | `.claude/`、`demos/` | 既有未跟踪内容；不计候选 |
| 构建产物 | `app/renderer/dist/` | `.gitignore:9` 忽略；不计候选 |

> 提交 `d64590f` 含 68 个上述管理/证据路径；本变更包只把其中与 S1–S6 记录/证据相关的路径作为证据引用，不把它们当作产品文件哈希或候选。

---

## 三、候选隔离、写集与零改动

### 3.1 禁止路径零 diff（相对父提交 `6407d63` 与当前工作区）

| 路径 | 提交 `6407d63..d64590f` | 工作区 vs HEAD |
| --- | --- | --- |
| `src/provider/project-document/**` | 0 diff / 0 路径 | 0 diff / 0 状态 |
| `app/preload.cjs`、`app/main.ts` | 0 diff / 0 路径 | 0 diff / 0 状态 |
| `package.json`、`package-lock.json` | 0 diff | 0 状态 |
| `tsconfig.json`、`tsconfig*.json`、`vite.config.ts`、`electron-builder.yml` | 0 diff | 0 状态 |
| `.ans/` | 0 diff | 0 状态 |

- 提交 diff 中**无新增 IPC/preload/contextBridge/`project:document-read` 符号**（对 `interface.ts`、`project.ts`、`drawer-store.ts` 的新增行做符号扫描，0 命中）。
- 未改 `src/service/project-document/{abstract,public}/**`、`src/pipeline/project-document/**`、`src/model/{runtime,boundary,role,decision}.ts`、门禁引擎/编排、依赖/构建配置。
- 目标项目 `ans-gateway`：S2–S6 记录均为只读、未写入；本包未访问目标项目。

### 3.2 `test/桌面应用/` 逐文件授权

- 目录内 tracked 文件 **31** 个；`git ls-files -o --exclude-standard -- test/桌面应用` = **0**（无新建）。
- 本变更只改 3 个既有文件：`project.test.ts`、`project-document.test.ts`、`interface.test.ts`（均 `M`，无 `A`）。
- `test/桌面应用/e2e/main.mjs` **未改**（提交与工作区均无 diff）；S6 的两次真实 Electron 运行使用该未改动文件。

### 3.3 角色卡/边界零变更

- 4 个角色 × 2 个边界文件，共 **8/8** 与 S1 上游重冻记录逐项一致（SHA-256）：

| 文件 | SHA-256 | 对照 |
| --- | --- | --- |
| `角色卡/桌面窗口/boundary.md` | `1d12d0b4aceb293ed0315986ee82b844603d75bdde71589867bb000f5230744e` | UNCHANGED |
| `角色卡/桌面窗口/boundary.yaml` | `569a0a208024883709ba2ce47cbd62349856b5e82377c760bf08a764ca332c2f` | UNCHANGED |
| `角色卡/桌面UI/boundary.md` | `99578261917e2bdb359828aa77dc1a0ff0cf5c31174eeb97f7d666c21cb52cf0` | UNCHANGED |
| `角色卡/桌面UI/boundary.yaml` | `e1af4d93ab5e022ec447c0412743e41974d04be8ef12cc1c5a5914dd90dda093` | UNCHANGED |
| `角色卡/项目管理/boundary.md` | `6f75bee458e672e8b4be78b17e4910ee13ba8f50057ce26e30cee012fba45d5c` | UNCHANGED |
| `角色卡/项目管理/boundary.yaml` | `cfdc7408010bb9da1e3d5e9f723eb7a38956471d13860e8ac5588e7c3693cfff` | UNCHANGED |
| `角色卡/测试/boundary.md` | `9a2eba3fc842f185eb228ef49cd30dfd66ec3933c42cca0202ff2ae26c97859f` | UNCHANGED |
| `角色卡/测试/boundary.yaml` | `3c8f7e0e34d44bcdc55995f2747cd8eccaea7ad0875ad074569f6acc7beea14c` | UNCHANGED |

- 提交 `d64590f` 不含 `角色卡/*/role-card.md` 或 `boundary.{md,yaml}` 变更；角色卡/边界无变更。

### 3.4 写集归属（17/17）

| 所属角色 | 候选文件 | 团队计划依据 |
| --- | --- | --- |
| 桌面窗口（S2+S3） | `src/model/project-document.ts`、`src/service/project-document/impl/read-project-document.ts`、`app/desktop/project.ts`、`app/desktop/interface.ts`、`test/桌面应用/project.test.ts`、`project-document.test.ts`、`interface.test.ts` | §3.2 精确写集；`test/桌面应用/` 逐文件授权 |
| 桌面UI（S4） | `app/renderer/src/chat/types.ts`、`app/renderer/src/chat/profile-docs.ts`（新）、`app/renderer/src/shell/ProfilePanel.tsx`、`app/renderer/src/stores/drawer-store.ts`、`app/renderer/src/shell/phase4a.css`、`test/桌面UI/profile-docs.test.ts`（新）、`test/桌面UI/phase4a-electron-smoke.mjs` | §3.3；`app/renderer/` 目录授权；`test/桌面UI/` 目录授权 |
| 项目管理（S5） | `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`、`test/项目管理/shared/i18n.test.ts` | §3.4 唯一 key 写入者 |
| 测试（S6） | 无产品候选文件（只运行/取证） | §3.5 |

**授权边界说明（供 G2 核对，不作判断）**：`app/renderer/src/chat/profile-docs.ts` 在团队计划 §3.3 写集与设计 §7.2 中列明；`test/桌面UI/profile-docs.test.ts` 为**新增文件**，位于目录授权的 `test/桌面UI/`，设计 §7.2 明确“建议新增”并在 §7.3 列入桌面UI 写集；团队计划 §3.3 的默认口径是“不新建 `test/桌面UI/` 测试文件”，同时允许在该目录授权内新增且须在变更包列明。本包在此列明该新增文件；S1 基线目标表未单列该新测试文件。本包只报告事实，是否满足 G2 写集/边界标准由独立验收按标准原文核对。

### 3.5 与其他变更的隔离

- 本变更与 i18n、目录 v3、治理写卡、验收返工路由**分别闸门、分别实施、分别验收、分别报告**；本包不引用上述变更的验收结论替本变更背书，也不把它们的改动并入本候选。
- 上游既有候选（i18n、目录 v3、治理写卡、验收返工路由）已由 `6407d63` checkpoint 提交收口（提交标题 `chore(v1.7.0): checkpoint accepted i18n, directory ownership and governance work`，并含验收返工路由文件）；该提交不是本变更候选，S1 基线/重冻记录只把当时工作树作为冻结上下文。
- 本候选只含 §2.1 的 17 个产品/测试文件；共享文件（`interface.ts`、`project.ts`、`ProfilePanel.tsx`、`types.ts`、`drawer-store.ts`、`phase4a.css`、`interface.test.ts`、i18n messages 等）的本次 hunk 均属本变更实现，S2–S6 记录逐文件哈希可核对；未发现其他变更 hunk 混入。

---

## 四、节点 S1–S7

| 节点 | 内容 | 角色 | 状态/记录 | 证据入口 |
| --- | --- | --- | --- | --- |
| **S1** | 闸门 2 + 实施授权 + 实施前标准 + 基线/预检 | 沟通/客户、内置验收、测试、统筹 | 闸门 0/1/2 + 实施授权已记录；标准 v1 已冻结；S1 基线 400/400、typecheck/build 0、Electron 基线 `E2E_PASS=true`；上游重冻快照 `36ae8c04…`；8/8 边界未变 | baseline.md + `2026-10-23-role-root-docs-display-baseline-evidence/`；refreeze.md + `…-baseline-upstream-refreeze-evidence/` |
| **S2** | Model 白名单/候选契约、Service 精确校验、桌面索引/候选、索引测试 | 桌面窗口 | implemented-unverified；7 文件；164/164 连续 3 次、interface 单文件 5 次 121/121；typecheck 0；Provider/preload/main 零 diff | 桌面窗口记录 + `hashes.txt`/`index-sample.txt`/`test-desktop-app-targets*.log` |
| **S3** | `RoleView.rootDocs?`、`listProject` 装配、内置空态、无新 IPC、旧兼容 | 桌面窗口 | implemented-unverified；`interface.test.ts` 121/121（在 164 套件内）；契约 additive | 同 S2 记录 §三/§六 |
| **S4** | 渲染层类型、`profile-docs.ts`、ProfilePanel 两组/空态、drawer-store 精确匹配/焦点、CSS、渲染测试 | 桌面UI | implemented-unverified；UI 209/209；typecheck:renderer/build 0；Phase4A 108 checks（新增 9 项 root-doc 检查） | 桌面UI 记录 + `s4-candidate-hashes.txt`/`s4-candidate.diff`/`s4-test-desktop-ui.log` |
| **S5** | `ui.profile.*` 7 个 key（4 必需 + 3 副标签）、zh/en parity、i18n 测试 | 项目管理 | implemented-unverified；186/181/5 skip/0 fail；typecheck 0；key 数 1249 / `ui.profile.*` 22 | 项目管理记录 + `s5-candidate-hashes.txt`/`s5-key-values.txt`/`s5-i18n-test.log` |
| **S6** | 跨层集成、Phase4A、真实 Electron、真实应用 root-doc 探针、候选/写集核对、打印/日志规则核对 | 桌面UI + 桌面窗口 + 测试 | **verified-by-tests-only（不是验收）**；17 候选 0 mismatch；UI 209/209、桌面 164/164、跨层 10/10 与 13/13、i18n 186/181/5、typecheck/build 0；Phase4A 108/10 对基线 99/12；e2e 2/2 `E2E_PASS`；POSIX 未执行 | 测试记录（185 行）+ `2026-10-23_change_role-root-docs-display-evidence/` |
| **S7** | 变更包 + 独立验收 | 统筹 → 内置独立验收 | **本文件 = S7 变更包；独立验收（I10）待做**，结论只能是通过/返工/证据不足，另写 `docs/acceptance/role-root-docs-display-report-v1.md` | 本文件；标准 v1 |

- S6 的 `verified-by-tests-only` 只表示测试角色在当前 Windows 候选上完成验证；不判 P1–P10，不替代独立验收。
- S6 通过（或本变更包写盘）不授权 commit/push/合并/发布；当前 HEAD `d64590f` 是候选内容容器，不是发布或验收结论。

---

## 五、实现摘要（按记录，不以本包作验收判断）

### 5.1 索引与根文档白名单

- `src/model/project-document.ts`：新增唯一白名单 `ROLE_ROOT_DOC_FILENAMES`（`feature-map.md` → `functional-description.md` → `api-spec.md`，顺序即展示顺序）与 `RoleRootDocName`；`ProjectDocumentRoleCandidates` 增加可选 `rootDocs?: readonly { path: string; kind: "file" }[]`。不读文件、不写盘。
- `app/desktop/project.ts`：`RoleRootDocEntry`/`RoleDocsIndex.rootDocs`；`readRoleDocsIndex` 由 `cardPath` 取角色目录并做词法/`lstat` 校验（非目录/符号链接/非法路径→空索引），只对三个白名单文件名逐个 `lstat`（`isFile()` 且非符号链接），**不对角色根 `readdir`/glob、不 `lstat`/读取 `memo.md`、不读正文**；`changelog`/`docs` 既有逻辑保留；`projectDocumentCandidates` 只透传 `{ path, kind }` 元数据。
- `rootDocs[].path` 为**项目相对**，与 `ProjectDocumentRef.relativePath` 精确匹配；`docs[].path` 仍为**角色相对**；两者不混用。
- `memo.md` 不在白名单；`changelog.md` 仍独立、可选、不进入 `docs`/`rootDocs`；`docs/` 的遍历/排序（`localeCompare(..., "zh-Hans-CN")`）/500 条上限/隐藏文件跳过不回归。

### 5.2 Service 候选与读取

- `src/service/project-document/impl/read-project-document.ts`：`updateListing` 计算精确期望路径 `roleDir + "/" + <白名单文件名>`，只接受 `kind === "file"` 且精确命中的候选；`memo.md`、任意根文件、`../`、绝对路径、反斜杠、冒号、大小写变体、`docs/feature-map.md`、空 `roleDir` 静默拒绝、不铸造、不抛错；合法根路径追加在既有 card/changelog/docs refs 之后，经既有 `eligible()`/`format()`/Set 去重；既有 refs 的 `documentId`/前缀不变。
- Windows 沿用既有 fail-closed：`UNSUPPORTED_ENVIRONMENT`、无 scope、无 refs、不读字节；索引元数据仍可列文件名。Provider `src/provider/project-document/**` 零改动。
- 正文仍只经既有受限 Provider（lstat/realpath/`O_NOFOLLOW`/有界读/UTF-8 校验）与 opaque refs；`api-spec.md` 的 `not-applicable` 当普通 Markdown 文本读取。

### 5.3 Interface 契约

- `app/desktop/interface.ts`：`RoleView.rootDocs?: RoleRootDocEntry[]`（additive）；`listProject` 对非内置且 `cardPath` 非空的角色装配 `idx.rootDocs`（缺省 `[]`），内置角色 `[]`、不读项目根；`documents` 仍由既有 Service 生成。无新 IPC/preload，`project:document-read` 请求/回包形状不变。
- 旧 renderer 忽略未知字段；新 renderer 连旧 main 无 `rootDocs` 时根文档组不显示、不崩。

### 5.4 渲染层

- `app/renderer/src/chat/types.ts`：与 desktop 形状一致的 `RoleRootDocEntry` 与 `RoleView.rootDocs?`。
- `app/renderer/src/chat/profile-docs.ts`（新增）：纯展示分组/过滤/精确匹配；两组、顺序、count、空态、`memo.md`/`role-card`/`boundary` 显示兜底排除、按 `relativePath` 精确匹配；无 DOM/Node/fs/electron/网络。
- `app/renderer/src/shell/ProfilePanel.tsx`：“文档”节两组（角色根文档 / `docs/` 目录）；根文档组仅 ≥1 条时渲染；`docs/` 组仅 `docs.length > 0` 时渲染；count = 根文档 file 数 + docs file 数（目录不计）；两组都空显示 `ui.profile.noRoleDocs`；有根文档无 docs 不显示整节空；`memo.md` 不渲染；`role-card`/`boundary` 不重复；根文档按钮 `data-root-doc-path`、`title`/`aria-label` = `ui.profile.openRootDoc` + 原样文件名。
- `app/renderer/src/stores/drawer-store.ts`：`openDocumentList(roleId, origin, targetRelativePath?)`；刷新 `listProject` 后按 `ref.relativePath === target` 精确匹配，命中且可读才调用既有 `readDocument(ref)`；未命中/无 scope/平台不支持停留列表态显示既有结构化错误；返回角色资料时焦点回根文档按钮（缺失回退 `.role-document-entry`）。
- `app/renderer/src/shell/phase4a.css`：仅分组/行/按钮样式，`min-width: 0`、换行、`overflow-wrap: anywhere`；不新增固定高度/宽度。

### 5.5 i18n

- 项目管理新增 7 个 `ui.profile.*` key（zh-CN/en-US 各一份）：`docsGroupRoot`、`docsGroupSubdir`、`noRoleDocs`、`openRootDoc`（`{name}`）为必需；`rootDoc.featureMap`、`rootDoc.functionalDescription`、`rootDoc.apiSpec` 为可选副标签（本批已实现）。
- 文件名/路径/`docs/`/`not-applicable` 不翻译；`changelog` 既有 key 未改；无 memo key/开关；无第二份 messages/resolver。

### 5.6 打印/日志规则

- 客户 2026-10-23 打印/日志规则作为**独立 T1 工程规则**记录：`docs/communication/2026-10-23_intent-print-logging-rule.md`、`角色卡/项目管理/docs/change/2026-10-23_change_print-logging-rule.md`、`角色卡/项目管理/docs/project-rules.md`、`角色卡/项目管理/memo.md`。这些不是本变更产品候选。
- 本变更代码只复用既有 `createDiagnosticLogger`，新增事件 `role-docs.index`、`role-docs.index.skipped`、`role-docs.root.skipped`、`role-docs.root.inspect-failed`、`role-docs.index.failed`、`project.listing.root-docs`、`project-document.listing(.unavailable)`、`project-document.root.skipped`、`project-document.read(.failed)`；字段只含 `count`/`ok`/`reasonCode`/`errorCode`/白名单文件名，不含正文/文档路径/密钥；候选 diff 无新增 `console.*`/stdout/stderr；渲染层纯模块无打印。

---

## 六、验证证据（测试结果，不是验收判断）

### 6.1 受影响套件与命令（S6 当前候选，原始日志在测试角色证据目录）

环境：Windows 11 Pro 10.0.26300 / Git Bash 5.3.15；Node `v24.22.1`（`C:/Users/51054/AppData/Local/Programs/nodejs/node.exe`）；npm `11.19.1`；Electron `v44.7.0`；仓库 `C:\Users\51054\Desktop\work\ans-studio`；S6 记录时 HEAD `6407d63`；候选 17 文件与当前 `d64590f` 逐 blob 一致。

| 检查 | 命令（原始摘要） | 退出码 | 计数/结果 | 日志 |
| --- | --- | --- | --- | --- |
| 渲染层全套件 | `node --test "test/桌面UI/**/*.test.ts"` | 0 | **209 tests / 209 pass / 0 fail / 0 skip / 0 todo**（含 `profile-docs.test.ts` 14 例） | `s6-test-desktop-ui.log` |
| 桌面应用目标 | `node --test --test-concurrency=1 test/桌面应用/project.test.ts test/桌面应用/project-document.test.ts test/桌面应用/interface.test.ts` | 0 | **164 / 164 pass**（23 + 20 + 121） | `s6-test-desktop-app-targets.log` |
| 跨层（两文件） | `node --test --test-concurrency=1 test/测试/p1p7-document-integration.test.ts test/测试/i18n-integration.test.ts` | 0 | **10 / 10 pass**（2 + 8） | `s6-test-cross-layer.log` |
| 跨层回归（三文件） | 上条 + `test/桌面应用/su-effective-boundary.test.ts` + `test/桌面应用/genesis-bootstrap.test.ts` | 0 | **13 / 13 pass** | `s6-test-cross-layer-regression.log` |
| i18n 单元 | `node --test "test/项目管理/shared/**/*.test.ts"` | 0 | **186 tests / 181 pass / 5 skipped / 0 fail**；5 skip 为既有 Windows `atomic-write` 平台跳过 | `s6-test-i18n-unit.log` |
| 根类型检查 | `npm.cmd run typecheck` | 0 | 无诊断 | `s6-typecheck.log` |
| 渲染类型检查 | `npm.cmd run typecheck:renderer` | 0 | 无诊断 | `s6-typecheck-renderer.log` |
| 渲染构建 | `npm.cmd run build:renderer` | 0 | 构建成功；仅既有 >500 kB chunk 警告 | `s6-build-renderer.log` |

> “p1p7 + i18n-integration = 13/13”的说法与实际文件计数不符：两文件为 2 + 8 = 10；13/13 是加入 `su-effective-boundary` 与 `genesis-bootstrap` 的三文件命令。两条命令均 exit 0。S6 记录已澄清。

### 6.2 Phase 4A（受控 IPC，真实 Electron）

| 运行 | 来源 | checks | failures | exit | 分类 |
| --- | --- | --- | --- | --- | --- |
| 当前候选 Run 1 | `s6-phase4a-smoke-current.log` / `s6-phase4a-report-current.json` | **108** | **10** | 1 | 10 项全部是干净 HEAD 基线失败集的子集；新增失败 **0** |
| 当前候选 Run 2 | `s6-phase4a-smoke-run2.log` / `s6-phase4a-report-run2.json` | **108** | **10** | 1 | 失败集合与 Run 1 完全相同 |
| 干净 HEAD `6407d63` 基线 | `s6-phase4a-baseline-head.log`（`git archive` + 重建 renderer） | 99 | 12 | 1 | 既有失败（设置字段/键盘、滑块、队列/抽屉焦点族） |

- S4 新增的 **9 项 root-doc 检查在两次当前运行中全部 pass**：两组/顺序/count、按钮 `title`/`aria`、Windows 结构化不可用、返回焦点、只读阅读态、refs 追加且前缀不变、`api-spec` 普通文本、空态、200% 可达。
- 2 个基线失败在当前候选通过：`DOCUMENT_BACK_ROLE_RESTORES_ENTRY_FOCUS`（S4 queueMicrotask 兜底）与 `QUEUE_SUBVIEW_ESC_RETURNS_WORK_AND_FOCUS`（基线 rAF/时序浮动）。
- 10 个当前失败集中在既有设置/键盘/滑块/队列/抽屉焦点族；S4 诊断在隐藏窗口 220 ms 内仅 1 个 rAF tick（`rafTicks:1`），解释焦点族；均不在 root-doc 路径。
- S4 记录中的 108/11 与基线 99/11、S6 的 108/10 与基线 99/12 属运行间浮动；S6 以两次相同失败集与基线子集分类为最终记录。

### 6.3 真实 Electron

| 运行 | 命令 | 结果 |
| --- | --- | --- |
| `test/桌面应用/e2e/main.mjs` Run 1 | `./node_modules/.bin/electron --user-data-dir=<fresh temp> test/桌面应用/e2e/main.mjs` | exit 0；`E2E_PASS=true`；`E2E_FAILURES=` 空；报告 `s6-e2e-run1-report.txt`，截图 `s6-e2e-run1-04-profile.png` |
| Run 2 | 同上，fresh userData | exit 0；`E2E_PASS=true`；`E2E_FAILURES=` 空；`s6-e2e-run2-report.txt` |
| 真实应用 root-doc 探针 | 仓库外同一 harness 的受控副本（真实 preload/renderer/`createDesktopInterface`/真实仓库 `角色卡/桌面窗口`） | exit 0；`S6_ROOT_DOCS_THREE_NAMES_ORDER=true`（feature-map → functional-description → api-spec）；`S6_ROOT_DOCS_GROUPS_ORDER=true`；`S6_ROOT_DOCS_MEMO_ABSENT=true`；`S6_ROOT_DOCS_CLICK_UNAVAILABLE=true`（`hasBody=false`，错误原文“当前环境暂不支持安全读取项目文档。”）；`E2E_PASS=true`；`E2E_FAILURES=` 空 |

- 未改动的 `e2e/main.mjs` 只记录 `RIGHT_HAS_DOCS=true`，**没有直接 root-doc DOM 断言**；真实 root-doc DOM 由仓库外 harness 副本补齐（`s6-probe-real-electron-script.mjs`、`s6-probe-script.diff`、`s6-probe-report.txt`，截图 `s6-probe-root-docs-profile.png`/`s6-probe-root-docs-unavailable.png`）。该副本不是产品/测试改动，未写仓库。
- 真实仓库三个根文档运行后 `git status` 干净、mtime 早于运行（`s6-root-doc-fixture-integrity.txt`）；Windows fail-closed 测试断言 `serviceReads=0`、`checkpoints=0`、无 scope/refs、fixture 字节/mtime 不变。

### 6.4 Windows / POSIX 分开记录

- **Windows（客户当前环境，已实测）**：索引可列三个文件名；点击不建立 scope/不铸造 refs/不返回正文，显示既有 `UNSUPPORTED_ENVIRONMENT` 文案；探针 `hasBody=false`；不以“文件存在”冒充“正文可读”。
- **POSIX（macOS/Linux，未执行）**：当前环境为 Windows 11，无法运行真实 POSIX Provider 的正文读取、符号链接/竞态与 mtime 断言；`project-document.test.ts` 在 Windows 走 `assertWindowsFailClosed` 分支，POSIX 实读断言未执行。**未用 Windows 结果替代 POSIX 证据。**
- 影响：独立验收按标准 P5 可能对 POSIX 子项判 `insufficient evidence`；由统筹安排补证或客户决定，本包不预判。

### 6.5 证据清单与可复算哈希

| 证据 | SHA-256 | 说明 |
| --- | --- | --- |
| S6 证据目录 `sha256.txt`（manifest） | `020776dbd7564c1f7971c035787716013a8da4c45b17ce15c15082f0150c998a` | 62 行；覆盖 S6 记录 + 证据文件 |
| S6 记录 | `65e49491a3f39f6dbeb39378a3cc91e23400b26a4912f5dd9eb792f7b28b9f62` | 185 行；`verified-by-tests-only` |
| S6 候选哈希证据 | `cf1277e17b19dfd0281a15b3b77a82b04506c976bce7033a7a772d95ec98598e` | 17/17 `YES`，`MISMATCHES=0` |
| S6 命令汇总 | `59306aea86009ae0d9ecea46e08a38caf098981ab9cc4e756704ee8e102ccdb6` | 命令/退出码/计数汇总 |
| S6 失败分类 | `5ddaf8b8364a11b67cc4b431634b49a9e1b26a7d16c3cf00d2de22bba21386a8` | 套件/Phase4A/e2e/探针失败分类与基线对照 |
| Phase4A 当前报告 JSON | `24cd1f45fecec9a88972800de5c8d270f891b01ce00f4fb9ac27f5de55c9a302` | 108 checks / 10 failures |

> 上表只列关键入口；完整 62 项以 S6 `sha256.txt` 与各证据目录为准。S2/S3/S4/S5 记录与证据哈希见各自记录和证据目录；本包未改写任何记录/证据。

---

## 七、残余、边界与未执行项

1. **POSIX 实读未执行（环境限制）**：`feature-map.md`/`functional-description.md`/`api-spec.md` 正文、`byteLength`、mtime、`not-applicable` 的真实 POSIX 读取，以及符号链接/根替换/竞态错误码，均未在当前 Windows 环境执行；不得用 Windows 列名/文件存在替代。P5 POSIX 子项可能构成 `insufficient evidence`，由独立验收按标准判断。
2. **Phase4A 既有失败**：当前 108 checks / 10 failures；干净 HEAD 基线 99 checks / 12 failures；当前 10 项全部是基线失败子集，新增失败 0；集中在设置/键盘/滑块/队列/抽屉焦点族，S4 新增 9 项 root-doc 检查全过。这些既有失败不因本变更修复，也不据此改测试或产品。
3. **真实 root-doc DOM 由仓库外 harness 副本验证**：未改动的 `test/桌面应用/e2e/main.mjs` 没有 root-doc DOM 断言；两次未改动 e2e 均 `E2E_PASS=true`，但“三个文件名 + 点击不可用”的 DOM 证据来自仓库外受控副本。若验收要求未改动 e2e 直接断言 root-doc，需要桌面窗口按团队计划 §3.2/§八.11 最小追加后复跑；本批未改该文件（逐文件授权属桌面窗口）。
4. **`role-docs.index` 日志频率**：e2e 约 5 分钟 139 条（15 角色 × ~9 次 listing），每角色每次 listing 一条；无定时器/重试循环/逐文件刷屏；记录为后续可聚合观察项，非本轮阻塞。
5. **S6 状态**：`verified-by-tests-only`，不是验收；S6 通过不授权 commit/push/合并/发布。
6. **提交事实**：HEAD `d64590f` 已包含候选；实施授权文本（2026-10-23）明确“不包含 commit/push/发布/目标写入”。本包只把 `d64590f` 作为候选内容容器，不把提交解释为提交/发布授权；验收标准 G2 含“无提交/暂存/推送”的字面要求，是否按当前已提交事实调整/解释，由独立验收按标准原文与沟通记录处理。提交 `d64590f` **不改变 Acceptance 结论**。
7. **新增 `test/桌面UI/profile-docs.test.ts`**：在 `test/桌面UI/` 目录授权内、设计 §7.2 明确建议新增、本包已列明；团队计划 §3.3 默认“不新建”，S1 基线目标表未单列该测试文件。见 §3.4 授权边界说明，供 G2 核对。
8. **工作树未提交项**：`M docs/communication/memo.md`（1 行新增，管理记录）、`?? .claude/`、`?? demos/`；均非产品候选。任务说明预期工作树仅 `.claude/`、`demos/` 未跟踪；实际另有 `memo.md` 修改，按实测记录。
9. **`documents` 数量变化**：根文档 refs 追加后，“查看已列文档”清单从既有条目增加 3 条根文档；S4 Phase4A 将既有断言 2→5 并注明“新增根文档 refs，不是回归”；既有 card/changelog/docs `documentId` 前缀/顺序断言保留。
10. **目标项目与依赖**：`ans-gateway` 仅只读样例，未写入；未新增依赖/枚举/写路径；未改 `package.json`/锁/构建配置/发布配方。
11. **无 task_ops**：本项目无 `.ans/project.json`；未伪造任务令牌/锁/审批/机器预检/`docs/verification/`。
12. **管理记录状态**：S1 基线/重冻记录、S2–S6 记录未改写；其文件头中的历史授权/HEAD 状态是写记录时快照，见 §十。

---

## 八、候选复算命令

在仓库根 `C:\Users\51054\Desktop\work\ans-studio`、Git Bash 下执行：

```sh
cd /c/Users/51054/Desktop/work/ans-studio

# 1. 身份/工作树
git rev-parse HEAD                                  # d64590f35c0531d0e41acd1be32be9f415a06a2b
git branch --show-current                           # v1.7.0-work
git status --short                                  # M docs/communication/memo.md; ?? .claude/; ?? demos/
git diff --cached --name-only                       # 空
git show -s --format='%H %T %P %s' HEAD             # tree 6bb0d018...; parent 6407d63...

# 2. 17 个候选逐文件哈希
for f in \
  src/model/project-document.ts \
  src/service/project-document/impl/read-project-document.ts \
  app/desktop/project.ts app/desktop/interface.ts \
  app/renderer/src/chat/types.ts app/renderer/src/chat/profile-docs.ts \
  app/renderer/src/shell/ProfilePanel.tsx \
  app/renderer/src/stores/drawer-store.ts \
  app/renderer/src/shell/phase4a.css \
  test/桌面应用/project.test.ts test/桌面应用/project-document.test.ts test/桌面应用/interface.test.ts \
  test/桌面UI/profile-docs.test.ts test/桌面UI/phase4a-electron-smoke.mjs \
  src/common/shared/i18n/messages/zh-CN.ts src/common/shared/i18n/messages/en-US.ts \
  test/项目管理/shared/i18n.test.ts; do
  printf '%s\t%s\t%s\n' "$(git hash-object "$f")" "$(sha256sum "$f" | cut -d' ' -f1)" "$f"
done
# 与 §2.1 表、S6 s6-candidate-hashes.txt 对照：17/17 MATCH

# 3. 候选清单整体哈希（本包方法）
printf '%s\n' \
  src/model/project-document.ts \
  src/service/project-document/impl/read-project-document.ts \
  app/desktop/project.ts app/desktop/interface.ts \
  app/renderer/src/chat/types.ts app/renderer/src/chat/profile-docs.ts \
  app/renderer/src/shell/ProfilePanel.tsx \
  app/renderer/src/stores/drawer-store.ts \
  app/renderer/src/shell/phase4a.css \
  test/桌面应用/project.test.ts test/桌面应用/project-document.test.ts test/桌面应用/interface.test.ts \
  test/桌面UI/profile-docs.test.ts test/桌面UI/phase4a-electron-smoke.mjs \
  src/common/shared/i18n/messages/zh-CN.ts src/common/shared/i18n/messages/en-US.ts \
  test/项目管理/shared/i18n.test.ts \
| while IFS= read -r f; do printf '%s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$f"; done \
| LC_ALL=C sort -k2 > /tmp/candidate.manifest
sha256sum /tmp/candidate.manifest
# 期望 f2decbb95ff1e9ca24deb1da9fd00de699e3b7e4377a6bdcec7b4b4eaba8e288

# 4. 写集/零改动
git diff --stat 6407d63 d64590f -- <17 paths>        # 17 files, +1335/−55
git diff --stat 6407d63 d64590f -- src/provider/project-document app/preload.cjs app/main.ts \
  package.json package-lock.json 'tsconfig*.json' vite.config.ts electron-builder.yml   # 空
git status --porcelain -- src/provider/project-document app/preload.cjs app/main.ts \
  package.json package-lock.json tsconfig.json vite.config.ts electron-builder.yml      # 空
git ls-files -o --exclude-standard -- test/桌面应用   # 0
git show --name-only --format='' d64590f -- test/桌面应用   # 3 M，无 A

# 5. 边界与记录
sha256sum 角色卡/桌面窗口/boundary.md 角色卡/桌面窗口/boundary.yaml \
  角色卡/桌面UI/boundary.md 角色卡/桌面UI/boundary.yaml \
  角色卡/项目管理/boundary.md 角色卡/项目管理/boundary.yaml \
  角色卡/测试/boundary.md 角色卡/测试/boundary.yaml     # 与 §3.3 / refreeze 8/8
sha256sum 角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display-evidence/sha256.txt
# 期望 020776dbd7564c1f7971c035787716013a8da4c45b17ce15c15082f0150c998a

# 6. 证据重跑（同候选/同输入/同命令；S6 原始命令）
node --test "test/桌面UI/**/*.test.ts"
node --test --test-concurrency=1 test/桌面应用/project.test.ts test/桌面应用/project-document.test.ts test/桌面应用/interface.test.ts
node --test --test-concurrency=1 test/测试/p1p7-document-integration.test.ts test/测试/i18n-integration.test.ts
node --test "test/项目管理/shared/**/*.test.ts"
npm.cmd run typecheck
npm.cmd run typecheck:renderer
npm.cmd run build:renderer
```

> 复跑需沿用团队计划/S6 的 Node/npm/Electron 环境与临时 userData/临时项目根；不得用当前摘要替代原始输出，不得以 Windows 结果替代 POSIX。S6 证据对当前候选的复用依据：17 个产品/测试 blob 逐项一致、测试夹具/命令/依赖/配置未变；提交只增加管理记录与同一候选内容，未改产品/测试内容（见 §2.2、§十一）。

---

## 九、P 编号 / 标准映射（只列对应关系，不作判定）

> 验收标准 `role-root-docs-display-criteria-v1.md` 的 P1–P10/G1/G2 与方案 §8.5 的 P1–P10 编号不同；标准 §3.0 已逐项对照。下表把本变更包提供的证据映射到标准编号，供独立验收填写报告表，不表示任何一行已 pass。

| 标准 ID | 主题 | 本包对应内容/证据 |
| --- | --- | --- |
| **P1** | 索引白名单/顺序/memo/changelog/docs 不回归 | §5.1；S2/S6 记录；`test/桌面应用/project.test.ts` 23/23；`index-sample.txt` |
| **P2** | 路径/候选安全、只读、Provider 零改动 | §5.2、§3.1、§3.3；`project-document.test.ts` 20/20；负例/Windows fail-closed；Provider 零 diff |
| **P3** | Interface/RoleView additive、装配、无新 IPC、旧兼容、`not-applicable` | §5.3；S2/S3 记录；`interface.test.ts` 121/121；preload 零 diff；`project-document` 的 `not-applicable` 用例 |
| **P4** | 渲染两组/空态/点击/不重复/布局 | §5.4；S4 记录；UI 209/209；Phase4A 9 项 root-doc 检查；真实应用探针；截图/几何 |
| **P5** | 平台诚实（Windows fail-closed / POSIX 实读分开） | §6.4；e2e 2/2；真实应用探针；Windows fail-closed 断言；**POSIX 未执行** |
| **P6** | i18n key/parity/不翻译/无硬编码 | §5.5；S5 记录；i18n 186/181/5；i18n-integration 8/8（在 10/10 内）；源码扫描 |
| **P7** | 测试/跨层/真实 Electron/typecheck/build/T2 | §6.1–§6.3；全部命令与退出码/计数/原始日志 |
| **P8** | 范围/权限/非目标/零改动 | §3.1–§3.4；零 diff 清单；角色卡/边界 8/8；目标项目未写 |
| **P9** | 证据完整性/可复算/分平台/夹具/截图 | §2、§6、§8；候选哈希/清单；manifest `020776db…`；Windows/POSIX 分开 |
| **P10** | 文档状态如实（实施/测试/验收分离） | 本文件头；S2–S6 记录状态；S6 `verified-by-tests-only`；验收报告另写、尚未写 |
| **G1** | 变更包/候选身份/基线隔离/管理记录不混入 | 本文件 §二/§三/§八/§十一；S1 基线/重冻；管理记录与候选分离 |
| **G2** | 写集/边界/零改动/无提交推送发布 | §三；零 diff；`test/桌面应用/` 31 tracked/0 untracked；**当前 HEAD 已提交的事实**与 `test/桌面UI/profile-docs.test.ts` 新增事实见 §七.6/§七.7，供验收按原文核对 |

---

## 十、已知状态漂移与文档事实（只报告，不修改）

1. **方案/团队计划文件头过期**：方案文件头/§2.1/§14 仍写“草案 v1（待独立只读复核、待闸门 1 方案确认）”“闸门 1：待确认”“闸门 2：未开始”“实施授权：未给”；团队计划文件头/§1.5/§九仍写“闸门 2 未确认、实施授权未给”。沟通记录已确认闸门 0/1/2 与实施授权；本包以 `docs/communication/` 与冻结哈希为授权事实，不改写方案/团队计划。验收标准 §九.2 已记录同一漂移。
2. **方案 §13 复核记录缺失**：`docs/planning/2026-10-23_review_role-root-docs-display.md` 当前不存在；方案 §13 写“尚无复核意见”。客户闸门 1 已确认方案 v1；验收标准 §九.3 已记录，不增加产品验收要求。
3. **沟通记录版本漂移**：当前 81 行（含实施授权，SHA-256 `a980ea7a…`）；验收标准/团队计划引用授权前 73 行快照（`016798a1…`，位于 `6407d63`）。差异为授权追加 8 行，不改变方案/标准内容；引用时须区分版本。
4. **S1 基线记录的历史状态**：S1 记录 §七.2 写“客户实施授权未给”是写记录时快照；沟通记录随后给出实施授权。S1 记录/重冻记录未改写。
5. **S1 证据缺陷已由重冻修正**：S1 `src app test` 129 文件快照 `af53fea6…` 实际是证据文件自身的 SHA-256（47 个非 ASCII 路径为 `DELETED_OR_MISSING` 标记），不是规范内容快照；重冻记录提供规范快照 `36ae8c04…`（129 文件，82 个逐字节一致 + 45 个 mtime 早于冻结 + 2 个 artifact 修复文件）。本变更以 `36ae8c04…` 为上游基准；S1 记录保留不改。
6. **S6 记录 HEAD 与当前 HEAD**：S6 记录写 HEAD `6407d63`；当前 HEAD `d64590f`。17 个产品/测试 blob 逐项一致；差异是提交容器与管理记录入库，不是候选内容变化（§2.2）。
7. **S6 之后工作树**：`M docs/communication/memo.md`（1 行新增，管理记录）、`?? .claude/`、`?? demos/`；非候选。任务说明预期未跟踪仅 `.claude/`、`demos/`，实测另有 `memo.md` 修改，按实测记录。
8. **Phase4A 数值浮动**：S4 记录 108/11（基线 99/11），S6 最终 108/10（基线 99/12）；S6 以两次相同失败集与基线子集分类为最终记录。两者不矛盾，记录口径为 S6。
9. **团队计划基线 HEAD**：团队计划 §1.4 写 `ee59296`（写计划时）；实际实施开工 HEAD 为 `6407d63`（i18n 等上游 checkpoint 提交）；S5 记录已注明。S1/重冻记录的基线 HEAD 仍为 `ee59296`，是历史快照。
10. **验收标准 §1.1** 写“实施授权未给”，是标准冻结前状态；沟通记录随后补充实施授权。标准本身未改写（784 行/`12981ed4…`）。

---

## 十一、证据复用与失效说明

### 11.1 可复用依据

- **同一候选内容**：S2–S6 证据绑定的 17 个产品/测试文件的 `git hash-object` 与 SHA-256 与当前 HEAD `d64590f` 逐项一致（17/17）；工作区与 HEAD 对这 17 个路径无 diff。
- **同一输入/依赖/配置**：`package.json`、锁文件、tsconfig、vite/electron-builder 零 diff；未新增依赖；测试夹具（Phase4A/`e2e`/临时项目根）未因提交变化。
- **同一命令/环境**：S6 记录的命令、Node/npm/Electron 版本与当前环境一致；S6 原始日志保留。
- **提交只增加管理记录**：`6407d63..d64590f` 对 `src app test` 的增量恰好是 17 个候选；管理/证据路径不参与产品测试输入。

### 11.2 失效条件

以下任一变化使对应证据失效，需按标准 v1 重取；不得用旧候选或 i18n/目录 v3/治理写卡/验收返工路由的证据替本变更背书：

- 17 个候选文件的 blob/SHA-256 变化；
- `src app test` 中候选之外的输入/依赖/测试夹具/配置变化；
- Service/Provider 行为、`RoleView`/候选契约、i18n 目录内容变化；
- Phase4A/`e2e`/临时项目根/窗口尺寸/zoom/userData 夹具变化；
- 目标项目只读样例状态漂移（需重新记录只读复算时间，不得冒充本变更写入）；
- 重新构建 renderer 后产物与源码不一致。

---

## 十二、声明

- 本文件是统筹的 S7 变更包，**不是验收报告**；不判定通过/返工/证据不足，不预判 P1–P10/G1/G2 的任何结果。
- 未写 `docs/acceptance/`；未修改任何代码、测试、角色卡、边界、方案、团队计划、沟通记录、角色记录/证据或目标项目；未 commit/push/merge/发布。
- 候选身份以 §二 的 17 个文件为准；管理记录/证据/打印日志规则文档不纳入候选，也不为本变更背书。
- 独立验收应按 `docs/acceptance/role-root-docs-display-criteria-v1.md`（784 行；`12981ed4…`）另写 `docs/acceptance/role-root-docs-display-report-v1.md`；验收通过只表示当前候选满足标准 v1，不授权提交/推送/合并/发布。
- 当前提交 `d64590f` 是候选内容容器，**不改变 Acceptance 结论**；S6 的 `verified-by-tests-only` 仍不是验收。
