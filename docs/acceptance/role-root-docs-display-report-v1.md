风险档位：T2｜判定依据：客户闸门 0/1/2 与实施授权（`docs/communication/2026-10-23_intent_role-root-docs-display.md`，81 行，SHA-256 `a980ea7ab180476a78c317316a91963335cf796ff5cf9595a6d9466638de9182`，含实施授权；验收标准/团队计划引用授权前 73 行快照 `016798a1…`）+ 客户闸门 1 确认的方案 v1（`docs/planning/2026-10-23_design_role-root-docs-display.md`，1023 行，SHA-256 `9b69a7864112eb3df0c1da86b6ce653bb9235d4c655ac4d6f3b979e29080c26d`）+ 验收标准 v1（`docs/acceptance/role-root-docs-display-criteria-v1.md`，784 行，SHA-256 `12981ed44ee1786d4a73d9441b823075b6ed88a23ae10b95d928afb225f6efcb`）+ 团队计划 v1（`docs/scheduling/2026-10-23-role-root-docs-display-team-plan.md`，488 行，SHA-256 `8ec6e0d7f264a89bad3cb081371079dca8e2785750f29df9769704342f895fa8`，仅作范围/写集/阶段/证据口径依据）+ 技能 `references/testing.md` 的 T2 定义 + 客户后续提交指令「修改好了之后提交代码」（由本次验收任务输入转达；未写入 `docs/communication/`，见 §六.6）｜选定检查：17 个产品/测试候选逐路径 `git hash-object` + `sha256sum`（17/17 一致，0 mismatch；整体清单 `f2decbb95ff1e9ca24deb1da9fd00de699e3b7e4377a6bdcec7b4b4eaba8e288`）；S6 受影响套件 UI 209/209、桌面应用 164/164、跨层 10/10 与 13/13、i18n 186/181/5、typecheck/typecheck:renderer/build 0、Phase4A 当前 108 checks（98 pass/10 fail）对干净 HEAD 99 checks（87 pass/12 fail；当前失败全为基线子集，S4 新增 9 项 root-doc 检查全 pass）、真实 Electron `main.mjs` 2/2 `E2E_PASS` + 真实应用 Windows root-doc 探针；本次独立定向复跑 UI 209/209、桌面应用 164/164、跨层 10/10、跨层回归 13/13、i18n 186/181/5、双端 typecheck/build 0；Windows fail-closed 实测；POSIX 实读未执行｜复用证据：S1 基线/重冻（`a6aa70d53e7806baee108973692a460527995c3d041ab1a9e658abf561ccb353` / `9b77fef41a805f9da2897396392b40a7ca7705e7be3f7cd5e607abfc4afa52ac`，上游快照 `36ae8c04…`）、S2/S3 `bf1abed6a12ca4b33b3f1bcebdb068b4e037545a38bd139f686d37d1928f5c16`、S4 `add7e02ce2c5e54f4941fa16dd5d2a45d2ee092bfba547d7996b4b41490f8599`、S5 `1c1881f33e2e717d8a87192b10d5d2790a5f08e19ce659f96dfb30e794dbb9c1`、S6 `65e49491a3f39f6dbeb39378a3cc91e23400b26a4912f5dd9eb792f7b28b9f62` 与 manifest `020776dbd7564c1f7971c035787716013a8da4c45b17ce15c15082f0150c998a`（62/62 OK）、变更包 `6aa05b8b902f7776874d85672fb5a9eeffa1040779333617988e9d094c55afe8`；同候选 17/17 blob、同输入/依赖/命令/环境｜全量回归：N/A（T2 不默认全量 T3；未触发升档；受影响单测/层测试+跨层+真实 Electron+typecheck/build 已覆盖；POSIX 缺口单列）｜结论：证据不足（P5 POSIX 实读未执行；无 fail 行）

# 独立验收报告：角色根文档在详情面板展示（role-root-docs-display）

- 任务 ID / 产品 flowId：`2026-10-23-role-root-docs-display` / `role-root-docs-display`
- 日期：2026-10-24（任务日期 2026-10-23）｜角色：内置独立验收（独立子代理上下文，非沟通/统筹/开发/测试）
- 验收基线：客户闸门 1 确认的方案 v1（1023 行；`9b69a786…`）；判定标准为实施前冻结的标准 v1（784 行；`12981ed4…`）；团队计划 v1 只作范围/写集/阶段/证据口径依据
- 候选：分支 `v1.7.0-work`，HEAD `d64590f35c0531d0e41acd1be32be9f415a06a2b`（tree `6bb0d018cdf9983d96016f75b977d594aee26b69`；父提交 `6407d636b69e3f8eb12fb872e2622172bcbff583`）；候选 = 17 个产品/测试文件（15 改 + 2 新增）
- 结论：**证据不足**（只对当前候选有效；P5 POSIX 实读未执行；无 fail 行；不授权提交、推送、合并、发布，也不声称目标项目已修复/已迁移）
- 报告路径：`docs/acceptance/role-root-docs-display-report-v1.md`（本文件；不是标准，不是客户确认记录）

---

## 一、总体结论

按标准 v1 逐项判定：**P1、P2、P3、P4、P6、P7、P8、P9、P10、G1、G2 为 pass；P5 为 insufficient evidence**。无 fail 行。按标准 v1 §7.2，无 fail 但存在 insufficient evidence 时总体结论为 **证据不足**。

P5 的 Windows 子项已实测通过：索引可列出三个根文档文件名；点击不建立 scope、不铸造 refs、不读字节，显示既有 `UNSUPPORTED_ENVIRONMENT` 结构化文案；fixture 字节/mtime 不变。缺的是 POSIX（macOS/Linux）真实正文读取：`feature-map.md`/`functional-description.md`/`api-spec.md` 的正文、`byteLength`、只读且不改 mtime、`not-applicable` 当普通文本、符号链接/根替换/竞态错误码。当前环境为 Windows 11，无法执行；未用 Windows 列名/文件存在替代 POSIX 实读。标准 §3.6 明确：无 POSIX 环境时 P5 判 `insufficient evidence`，只有客户以书面确认明确收窄本轮平台范围为“仅 Windows 列名 + 不可用提示”时，才可把 POSIX 实读子项按 `not applicable` 处理。

因此：

- **本报告不是通过结论**。统筹不能把本报告当作 v1.7.0 发布前的“通过”依据。
- 要转为 **通过**，最低需要：在 macOS/Linux 对当前候选执行 POSIX 实读与符号链接/竞态断言并记录原始输出；或由客户以书面确认把本轮平台范围收窄为“仅 Windows 列名 + 不可用提示”，使 POSIX 子项成为 `not applicable`，再按标准重判 P5。两种路径都只需补 P5 受影响证据，不需要全量 T3；若客户改为要求 Windows 实读正文/改 Provider/读取模型，则须重开闸门 1/2 并可能升 T3。
- 产品本身未发现 fail：P1–P4、P6–P10、G1、G2 的证据覆盖标准，候选可复算，Windows 行为与真实 Electron 证据成立。

通过/证据不足都只表示当前候选在标准 v1 下的判定；不授权 commit、push、merge、发布或任何对外操作，也不声称 `ans-gateway` 已修复。

---

## 二、判定依据、检查选择与证据复用

### 2.1 依据版本与冻结哈希

| 项 | 值 |
| --- | --- |
| 闸门 0 意图 | `docs/communication/2026-10-23_intent_role-root-docs-display.md`；当前 **81 行**，SHA-256 `a980ea7a…`，blob `ed256d07…`（含实施授权 +8 行） |
| 闸门 1 方案 v1 | `docs/planning/2026-10-23_design_role-root-docs-display.md`；**1023 行**，SHA-256 `9b69a786…`，blob `e898e65b…` |
| 闸门 2 团队计划 v1 | `docs/scheduling/2026-10-23-role-root-docs-display-team-plan.md`；**488 行**，SHA-256 `8ec6e0d7…`，blob `98f41bd0…` |
| 实施授权 | 同沟通记录「实施授权记录（2026-10-23）」；授权对象为团队计划 v1 + 标准 v1；明确不含 commit/push/发布/目标写入 |
| 验收标准 v1 | `docs/acceptance/role-root-docs-display-criteria-v1.md`；**784 行**，SHA-256 `12981ed4…`，blob `c0239c05…`；实施前冻结 |
| S1 基线 | `角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display-baseline.md`；**271 行**，SHA-256 `a6aa70d5…`，blob `fea5f259…` |
| S1 上游重冻 | `角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display-baseline-upstream-refreeze.md`；**139 行**，SHA-256 `9b77fef4…`，blob `68654706…`；`src app test` 规范快照 `36ae8c04…` |
| S6 测试记录 | `角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display.md`；**185 行**，SHA-256 `65e49491…`，blob `c582394b…`；状态 `verified-by-tests-only`（不是验收） |
| 变更包 | `docs/scheduling/role-root-docs-display-change-v1.md`；**436 行**，SHA-256 `6aa05b8b…`（写盘时本文件未跟踪） |

**版本漂移（只报告，不改写）**：沟通记录当前 81 行（`a980ea7a…`），标准 v1/团队计划引用授权前 73 行快照（`016798a1…`，位于父提交 `6407d63`）；差异仅为实施授权 +8 行，不改变方案/标准内容。方案文件头仍写“草案 v1/闸门 1 待确认”，团队计划文件头仍写“闸门 2 未确认、实施授权未给”；以 `docs/communication/` 确认记录与冻结哈希为授权事实，不把过期状态头当未确认，也不改写方案/团队计划（标准 §九.2/§九.3、变更包 §十.1 已记录同一漂移）。

**客户后续提交指令**：实施授权文本明确“不包含 commit/push/发布/目标写入”；客户随后明确「修改好了之后提交代码」。该指令由本次验收任务输入转达，未写入 `docs/communication/`；`docs/communication/memo.md`（工作树 `M`，+1 行）记录了提交结果但未记录指令原文。按该后续指令，提交 `d64590f` 按客户授权处理为合法；不推送、不合并、不发布。沟通应把该指令补记到 `docs/communication/` 以便追溯（§六.6）。

### 2.2 档位、选定检查与全量回归

- **档位核对：T2 与改动相符**。本变更触及 Model 白名单/候选契约、Service 精确校验、桌面 `RoleView`/`listProject`、渲染层展示与跨层测试；未改 `src/provider/project-document/**`、preload/main、IPC 形状、角色卡/边界、文档归属、权限或治理；未出现标准 §二.4 的升档触发（改 Provider/读取模型、改角色边界/文档归属、新增 IPC/preload/枚举/写路径、正文进入 `RoleView`）。因此不升 T3。
- **选定检查**：17 个候选哈希复算；受影响单测/层测试（`project.test.ts`、`project-document.test.ts`、`interface.test.ts`、`profile-docs.test.ts`/UI 全套、`i18n.test.ts`）；跨层（`p1p7` + `i18n-integration`；以及 `p1p7` + `su-effective-boundary` + `genesis-bootstrap`）；Phase 4A 受控 Electron；真实 Electron `e2e/main.mjs` + 真实应用 root-doc 探针；`typecheck`、`typecheck:renderer`、`build:renderer`；Windows fail-closed；POSIX 实读（未执行）。
- **全量回归：N/A**。理由：T2 不默认全量 T3；本变更不改变治理/权限/角色边界；未触发升档；受影响套件/跨层/真实 Electron/typecheck/build 已覆盖。POSIX 缺口是平台证据缺口，不是“需要全量回归”而是需要补 P5 定向证据。
- **复用证据**：S2–S6 证据绑定的是 HEAD `6407d63` 工作树的 17 个产品/测试 blob；本次复算当前 HEAD `d64590f` 的 17 个 blob 与 SHA-256 逐项一致（17/17），工作区对 17 路径无 diff；`package.json`/锁/tsconfig/vite/electron-builder 零 diff，依赖/夹具/命令/环境未变；提交只把同一候选内容与管理记录入库。因此按标准 §2.3/§4.9 复用 S2–S6 同候选证据，并只补本次定向复跑（§四.5）。未引用 i18n、目录 v3、治理写卡、验收返工路由的验收结论替本变更背书。

---

## 三、候选身份、隔离与写集

### 3.1 仓库身份（判定时实测）

| 检查 | 实测值 |
| --- | --- |
| 分支 / HEAD | `v1.7.0-work` / `d64590f35c0531d0e41acd1be32be9f415a06a2b` |
| 父提交 / tree | `6407d636b69e3f8eb12fb872e2622172bcbff583` / `6bb0d018cdf9983d96016f75b977d594aee26b69` |
| `git diff --cached --name-only` | **0 项**（无暂存） |
| `git status --short` | 4 条：`M docs/communication/memo.md`、`?? .claude/`、`?? demos/`、`?? docs/scheduling/role-root-docs-display-change-v1.md`（变更包自身）；均非产品候选 |
| 17 路径工作区 vs HEAD | `git status --porcelain -- <17>` **空** |
| 提交路径数 | **85** = 17 产品/测试 + 68 管理记录/证据/打印规则；提交不含 `docs/acceptance/`、`docs/scheduling/`、`docs/verification/`、`role-card.md`、`boundary.{md,yaml}` |

### 3.2 17 个产品/测试候选逐路径复算

命令：对变更包 §2.1 的 17 个路径逐个 `git hash-object` + `sha256sum` + `wc -c`，并与变更包、S6 `s6-candidate-hashes.txt` 的 expected blob/sha256 比对。结果：**17/17 一致，mismatches = 0**；17 个 blob 与 HEAD `d64590f` 的 tree 逐项一致；整体候选清单哈希（按路径 C 字节序排序的 17 行 `<sha256>  <path>` 清单取 SHA-256）为 **`f2decbb95ff1e9ca24deb1da9fd00de699e3b7e4377a6bdcec7b4b4eaba8e288`**，与变更包一致。

| # | 路径 | `git hash-object` | `sha256sum` | 变更 |
| --- | --- | --- | --- | --- |
| 1 | `src/model/project-document.ts` | `e501ff31112a6f6534489102af47be9250135ba9` | `0cc0827309cc66ac152a654c42e082841b5af89bc1ce29a02ef9c6d8158ab2e3` | 改 |
| 2 | `src/service/project-document/impl/read-project-document.ts` | `ef66fa6901ee720ac13efcbcc287e73825971b58` | `1895cac3bc3bff339475a49dec87cd13cf8cf861c346596610163af365e1393f` | 改 |
| 3 | `app/desktop/project.ts` | `47b41f644169e87c6f22fef87906963d6981cbc1` | `06f0480997f0954a08f258638984af90b6c4b28b10310f55c6c0878660f20438` | 改 |
| 4 | `app/desktop/interface.ts` | `b28ba1a5d16540db208e5aca123baf2eeff851a6` | `29c12b331f2412995c232811e54072e4c7c4420f0fa50c4461cc9db99c75e30b` | 改 |
| 5 | `app/renderer/src/chat/types.ts` | `098f4658971f59ae41f421e521dc1bf55ee29600` | `a96cc9dfc0ea0931ed17bf60b9f622db5fe863cf579da5ef86bbeb463b136ecc` | 改 |
| 6 | `app/renderer/src/chat/profile-docs.ts` | `de20311a7e04139d00ebad383743576536f8115b` | `d4a11e865c577db8b75359f0ee2846c7812cfb11b09b7dde536d4c477dba1d3f` | **新增** |
| 7 | `app/renderer/src/shell/ProfilePanel.tsx` | `a67c83a6713729109e933c9cf3314f649bf972e3` | `6b1c83d271afda2b18e4c39b6c0a29ccea8de3adf37313074bf259bdeea8d29b` | 改 |
| 8 | `app/renderer/src/stores/drawer-store.ts` | `8f0b47551af096d6542e445121141816744c9e7d` | `33ad9bfd63e92ff2f6be5252575bd39407212284a7f68b423e31022640904ea0` | 改 |
| 9 | `app/renderer/src/shell/phase4a.css` | `bc235d74c12940e60fe08e7062356a82cec1bf4c` | `944dc3dddbb9cea412cf743ab839590aecea11f6bb84a8399549c5cd8e7d425f` | 改 |
| 10 | `test/桌面应用/project.test.ts` | `2f7bad44dfcbad7e9958325ce73aed56cb8b4d53` | `c476fa95f120dceda66ddf58dd434394f10dbe42a96c9efe7aaa42a672619634` | 改 |
| 11 | `test/桌面应用/project-document.test.ts` | `3699d75248361746f7a0d6fb2efb68000379a8f8` | `b1bf71888e206cab3b28ca73cb359b3c8c6e21c9888b47552042245f15745b9d` | 改 |
| 12 | `test/桌面应用/interface.test.ts` | `5715173679ca724a53e832777bf4c48c7f3fb047` | `4f5f7488ec2ff9fe2f53e6c174dc6a4678f9d30d61573169cc9ce1d8fee7c745` | 改 |
| 13 | `test/桌面UI/profile-docs.test.ts` | `971778432601f2ce758f66d818a7065a72fa34d5` | `ea393edbb5ac0a3ee1c08a4918b3e2078a46f2681f2dc4063bead9f13d37f386` | **新增** |
| 14 | `test/桌面UI/phase4a-electron-smoke.mjs` | `a94a5efcbfd4ec03990cc450fd15fdaa51f9d34d` | `fb32c7ab57809ddd089983ae352087516e8ed04f85e139e030449e9c1ed99479` | 改 |
| 15 | `src/common/shared/i18n/messages/zh-CN.ts` | `5700649eccc1255a3b616073a32f42d23ebeb6cb` | `c37fc29f91b5419595e3a65171ade3cad917c389b53de456a536b6979d7d9255` | 改 |
| 16 | `src/common/shared/i18n/messages/en-US.ts` | `183eddea3473701315b44c6f7be9754705051051` | `37e4ad6c08f8678b2bd3372dd44594f9040a88382f2f99194e363b3b5b4e4d0d` | 改 |
| 17 | `test/项目管理/shared/i18n.test.ts` | `1b8a35c5de5771b179fd66a6f2cd3d5b5b4e6d6c` | `048d2be66863b1f98e147f2111934123371df27f2d363ab3cc84fac9fd7d3c72` | 改 |

候选汇总：17 文件，+1,335 / −55 行（`git diff --stat 6407d63 d64590f -- <17 paths>`）；15 改 + 2 新增；无删除。

### 3.3 隔离、零改动与写集

- **禁止路径零 diff**：`src/provider/project-document/**`、`app/preload.cjs`、`app/main.ts`、`package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`electron-builder.yml`、`.ans/` 相对父提交 `6407d63` 与当前工作区均 **0 diff / 0 状态**。候选 diff 中无新增 `ipcMain`/`ipcRenderer`/`contextBridge`/preload 符号。
- **未改**：`src/service/project-document/{abstract,public}/**`、`src/pipeline/project-document/**`、`src/model/{runtime,boundary,role,decision}.ts`、门禁引擎/编排、依赖/构建配置；`app/renderer/src/chat/document-view.ts`、`shell/DocumentView.tsx`、`test/桌面UI/document-view.test.ts`、`phase4a-smoke-preload.cjs`、`source-guard.test.ts` 保持 HEAD blob（`s6-zero-diff-and-writeset.txt`）。
- **`test/桌面应用/` 逐文件授权**：目录内 tracked **31**、untracked **0**；本变更只改既有 3 文件（`project.test.ts`、`project-document.test.ts`、`interface.test.ts`，均 `M`，无 `A`）；`e2e/main.mjs` **未改**（S6 两次 e2e 使用未改动文件）。
- **角色卡/边界零变更**：4 角色 × `boundary.{md,yaml}` **8/8** SHA-256 与 S1 上游重冻一致（`1d12d0b4…`、`569a0a20…`、`99578261…`、`e1af4d93…`、`6f75bee4…`、`cfdc7408…`、`9a2eba3f…`、`3c8f7e0e…`）；提交不含 `role-card.md`/`boundary.{md,yaml}`。
- **目标项目 `ans-gateway`**：该目录不是 git 仓库；7 个角色目录（`core-domain`、`interface-web`、`llm-providers`、`persistence-store`、`pipeline-runtime`、`platform-foundation`、`qa-verification`）各恰好 6 个根文件（`api-spec.md`、`boundary.yaml`、`feature-map.md`、`functional-description.md`、`memo.md`、`role-card.md`），另加 `角色卡/governance-boundary.yaml`，共 43 个角色区文件；独立只读复算 manifest `16ecee82ed010652842c50d6ba0d621f521742b7e665aed669adc3c8e0f4d345`；**角色区最新 mtime 为 2026-10-23 12:50:48，早于实现窗口（S1 21:48 起），无文件晚于 21:40**。目标项目其他非角色文件在 22:13–22:47 有外部漂移（`.ans/project.json`、`docs/bootstrap-manifest.md`、`data/app.db*` 等），与本变更无关，不能归因本变更写入；S2–S6 记录均称未访问/未写入目标。无目标项目前后哈希快照（见 §六.7）。
- **新增 `test/桌面UI/profile-docs.test.ts` 的写集口径（G2 重点）**：该文件在桌面UI 目录授权 `test/桌面UI/` 内；设计 §7.2 明确“建议新增”，§7.3 列入桌面UI 写集；变更包 §3.4 已列明。团队计划 §3.3 的默认口径是“不新建 `test/桌面UI/` 测试文件”，但同条允许“若确需新增，该目录是目录授权，但须在变更包列明并在 S1 写集确认，不默认扩大”。变更包列明成立；**S1 基线目标表（34 条目）没有单列该新测试文件**，S1 写集确认这一条件只部分满足。本报告按“目录授权内的新增测试文件、设计建议且变更包列明”判定为可接受的流程偏差，不按越界写处理；但记录 S1 目标表遗漏（§六.5）。

### 3.4 提交事实与客户后续指令

- 提交 `d64590f` 含 85 路径 = 17 产品/测试候选 + 68 管理记录/证据/打印规则文档；未推送（分支 `v1.7.0-work` 无 upstream）、未暂存（`git diff --cached` 0）、未合并、未发布。提交不含验收报告/标准/团队计划/变更包。
- 实施授权（2026-10-23）明确排除 commit；客户随后明确「修改好了之后提交代码」。本报告把该后续指令作为最高客户指令，判定提交 `d64590f` 合法；提交不改变验收结论，也不等于发布授权。该指令未写入 `docs/communication/` 是记录缺口，不影响候选身份与产品判断（§六.6）。
- 提交把独立 T1 打印/日志规则（`角色卡/项目管理/docs/project-rules.md`、`角色卡/项目管理/memo.md`、`docs/communication/2026-10-23_intent-print-logging-rule.md`、`角色卡/项目管理/docs/change/2026-10-23_change_print-logging-rule.md`）与角色记录/证据一并入库；这些不是本变更产品候选，变更包 §2.3 已分离，不构成候选混入。产品候选仍严格为 17 个。

---

## 四、证据核对（S6 原始证据 + 本次定向复跑）

### 4.1 受影响套件与构建

S6 证据目录 `角色卡/测试/docs/change/2026-10-23_change_role-root-docs-display-evidence/`；manifest `sha256.txt` 62 行、SHA-256 `020776db…`；判定时 `sha256sum -c` **62/62 OK**。环境：Windows 11 Pro 10.0.26300 / Git Bash 5.3.15；Node `v24.22.1`（`C:/Users/51054/AppData/Local/Programs/nodejs/node.exe`）；npm `11.19.1`；Electron `v44.7.0`；仓库 `C:\Users\51054\Desktop\work\ans-studio`；S6 记录时 HEAD `6407d63`，候选 17 文件与当前 `d64590f` 逐 blob 一致。

| 检查 | 命令（S6 原始） | 结果 | 日志 |
| --- | --- | --- | --- |
| 渲染层全套件 | `node --test "test/桌面UI/**/*.test.ts"` | **209 tests / 209 pass / 0 fail / 0 skip / 0 todo**（含 `profile-docs.test.ts` 14 例） | `s6-test-desktop-ui.log` |
| 桌面应用目标 | `node --test --test-concurrency=1 test/桌面应用/project.test.ts test/桌面应用/project-document.test.ts test/桌面应用/interface.test.ts` | **164 / 164 pass**（23 + 20 + 121） | `s6-test-desktop-app-targets.log` |
| 跨层（两文件） | `node --test --test-concurrency=1 test/测试/p1p7-document-integration.test.ts test/测试/i18n-integration.test.ts` | **10 / 10 pass**（2 + 8） | `s6-test-cross-layer.log` |
| 跨层回归（三文件） | `node --test --test-concurrency=1 test/测试/p1p7-document-integration.test.ts test/桌面应用/su-effective-boundary.test.ts test/桌面应用/genesis-bootstrap.test.ts` | **13 / 13 pass** | `s6-test-cross-layer-regression.log` |
| i18n 单元 | `node --test "test/项目管理/shared/**/*.test.ts"` | **186 tests / 181 pass / 5 skipped / 0 fail**；5 skip 为既有 Windows `atomic-write` 平台跳过 | `s6-test-i18n-unit.log` |
| 根类型检查 | `npm.cmd run typecheck` | exit 0，无诊断 | `s6-typecheck.log` |
| 渲染类型检查 | `npm.cmd run typecheck:renderer` | exit 0，无诊断 | `s6-typecheck-renderer.log` |
| 渲染构建 | `npm.cmd run build:renderer` | exit 0；仅既有 >500 kB chunk 警告 | `s6-build-renderer.log` |

**S6 记录文字的一处口径不一致（只报告）**：S6 记录 §三写“S2/S3 跨层回归（三文件） | 上条 + su + genesis | 13/13”，但“上条”含 `i18n-integration`（2 + 8 = 10），再加两文件不是 13；实际 13/13 命令是 `p1p7` + `su-effective-boundary` + `genesis-bootstrap`（不带 `i18n-integration`），`s6-command-summary.txt` 记录正确。两条命令均 exit 0（10/10 与 13/13），不影响证据效力；文字表述在续接时应以命令汇总为准。

### 4.2 Phase 4A（受控 IPC，真实 Electron）

| 运行 | 来源 | checks | pass | failures | exit | 分类 |
| --- | --- | --- | --- | --- | --- | --- |
| 当前候选 Run 1 | `s6-phase4a-report-current.json`（SHA-256 `24cd1f45…`）/ `s6-phase4a-smoke-current.log` | **108** | **98** | **10** | 1 | 10 项全部是干净 HEAD 基线失败集的子集；新增失败 **0** |
| 当前候选 Run 2 | `s6-phase4a-report-run2.json` / `s6-phase4a-smoke-run2.log` | 108 | 98 | 10 | 1 | 失败集合与 Run 1 **完全相同** |
| 干净 HEAD `6407d63` 基线 | `s6-phase4a-baseline-head.log`（`git archive` + 重建 renderer） | 99 | 87 | 12 | 1 | 既有失败（设置字段/键盘、滑块、队列/抽屉焦点族） |

- 失败子集核对：`comm -23`（当前 10 项 vs 基线 12 项）为空；当前 10 项全部在基线中出现。2 个基线失败在当前候选通过：`DOCUMENT_BACK_ROLE_RESTORES_ENTRY_FOCUS`（S4 queueMicrotask 兜底）与 `QUEUE_SUBVIEW_ESC_RETURNS_WORK_AND_FOCUS`（基线 rAF/时序浮动）。
- **S4 新增的 9 项 root-doc 检查在两次当前运行中全部 pass**：`PROFILE_DOCS_GROUPS_ROOT_AND_SUBDIR`（含 count 103 = 3 + 100、无 memo/role-card）、`PROFILE_ROOT_DOC_BUTTON_TITLE_ARIA`、`ROOT_DOC_WINDOWS_UNAVAILABLE_STRUCTURED_ERROR`、`ROOT_DOC_BACK_ROLE_FOCUSES_ROOT_BUTTON`、`ROOT_DOC_OPENS_DOCUMENT_VIEW_READONLY`、`ROOT_DOC_LIST_APPENDS_REFS_WITHOUT_PREFIX_CHANGE`、`ROOT_DOC_API_SPEC_NOT_APPLICABLE_PLAIN_TEXT`、`PROFILE_EMPTY_DOCS_HONEST_STATE`、`ZOOM_200_ROOT_DOC_BUTTON_REACHABLE`。
- 布局：`WIDTH_960_PROFILE_NO_OVERFLOW` 为 true，detail 中三个根文档按钮均在抽屉内（564–913，drawer 537–960）；`ZOOM_200_PROFILE_NO_OVERFLOW`、`ZOOM_200_ROOT_DOC_BUTTON_REACHABLE` 为 true；`RUNTIME_960_PROFILE_FOCUS_AND_INERT`/`RUNTIME_960_SETTINGS_FOCUS_AND_INERT` 为既有基线失败（当前 10 项内），不属于 root-doc 布局/点击路径。
- 既有失败不因本变更修复，也不据此改测试或产品；S4 记录 108/11 与基线 99/11、S6 最终 108/10 与基线 99/12 属运行间浮动，S6 以两次相同失败集与基线子集分类为最终记录（变更包 §十.8）。

### 4.3 真实 Electron 与 Windows fail-closed

- **未改动的 `test/桌面应用/e2e/main.mjs` 两次**：`./node_modules/.bin/electron --user-data-dir=<fresh temp> test/桌面应用/e2e/main.mjs`，Run 1/Run 2 均 exit 0、`E2E_PASS=true`、`E2E_FAILURES=` 空（`s6-e2e-run1-report.txt`/`s6-e2e-run2-report.txt`；截图 `s6-e2e-run1-04-profile.png` 等）。该文件本身只有 `RIGHT_HAS_DOCS=true`，**没有 root-doc DOM 断言**；两次 e2e 证明既有链路不回归，但不单独证明 root-doc DOM。
- **真实应用 root-doc 探针**：S6 在仓库外用同一 harness 的受控副本（`s6-probe-real-electron-script.mjs`，1999 行；与 `e2e/main.mjs` 的差异 `s6-probe-script.diff`，78 行）运行真实 preload/renderer/`createDesktopInterface`/真实仓库 `角色卡/桌面窗口`。最终 Run 3：`S6_ROOT_DOCS_THREE_NAMES_ORDER=true`（feature-map → functional-description → api-spec）；`S6_ROOT_DOCS_GROUPS_ORDER=true`（root → subdir）；`S6_ROOT_DOCS_MEMO_ABSENT=true`；`S6_ROOT_DOCS_CLICK_UNAVAILABLE=true`（`hasBody=false`，错误原文“当前环境暂不支持安全读取项目文档。”）；`E2E_PASS=true`；`E2E_FAILURES=` 空。计数 311（3 根文档 + 308 docs 文件）；截图 `s6-probe-root-docs-profile.png`/`s6-probe-root-docs-unavailable.png`。该副本不是产品/测试改动、未写仓库，仅作 S6 证据工具（先前两次迭代保留在 `pre-final-probe/`，不作为产品失败）。
- **Windows fail-closed 断言**：`project-document.test.ts` 的 `assertWindowsFailClosed` 断言 `updateListing` 返回 `UNSUPPORTED_ENVIRONMENT`、无 scope、无 refs、`serviceReads=0`、`checkpoints=0`、失败结果不含 `text`、fixture 字节/mtime 不变；`interface.test.ts` 断言 Windows 上 `role.documents=[]`、`rootDocs` 元数据仍列出、`documentReadUnavailable=UNSUPPORTED_ENVIRONMENT`；诊断用例用 `read: throw "must not read"` 桩断言不读正文。真实仓库三个根文档运行后 `git status` 干净、mtime 早于运行（`s6-root-doc-fixture-integrity.txt`；Windows 路径不读字节，未取 pre-run mtime）。
- **POSIX**：**未执行**（Windows 11 环境），无 macOS/Linux 正文/`byteLength`/mtime/`not-applicable`/符号链接/竞态证据；未用 Windows 列名/文件存在替代。P5 因此 insufficient evidence（§五 P5、§六.1）。

### 4.4 候选/证据绑定与本次定向复跑

- S6 `s6-candidate-hashes.txt`：17/17 `YES`、`MISMATCHES=0`；当前复算 17/17 一致；HEAD `d64590f` 的 17 个 blob 与候选表一致；工作区 17 路径无 diff。S6 记录 HEAD `6407d63` 与当前 HEAD 差异仅为“同一候选内容被提交 + 管理记录入库”（变更包 §2.2/§十一）。
- 本次独立定向复跑（当前 HEAD `d64590f`，Node v24.22.1，Git Bash，仓库根）：
  - `node --test --test-concurrency=1 test/桌面应用/project.test.ts test/桌面应用/project-document.test.ts test/桌面应用/interface.test.ts` → **164/164 pass / 0 fail / 0 skip / 0 todo**（33.9 s）。
  - `node --test "test/桌面UI/**/*.test.ts"` → **209/209 pass / 0 fail / 0 skip / 0 todo**（0.3 s）。
  - `node --test --test-concurrency=1 test/测试/p1p7-document-integration.test.ts test/测试/i18n-integration.test.ts` → **10/10 pass**；三文件跨层回归 → **13/13 pass**。
  - `node --test "test/项目管理/shared/**/*.test.ts"` → **186 tests / 181 pass / 5 skipped / 0 fail**。
  - `npm.cmd run typecheck`、`npm.cmd run typecheck:renderer`、`npm.cmd run build:renderer` → 全部 exit 0（build 仅既有 >500 kB chunk 警告）。
  - 未重跑 Phase4A/e2e（同候选、同源码/依赖/夹具/命令，复用 S6 原始日志与报告）；本次 build 从同一候选源码重建 `app/renderer/dist/`（gitignored，非候选），未改源码。
- **断言未弱化**：测试 diff 的删除行仅为 import 调整、`assertWindowsFailClosed` 签名扩展、i18n key 计数更新（`ui` 691→698、总 1242→1249、扣除 B0 后 686→693），无删除既有断言、无 skip/todo 转通过、无 fixture 适配失败；`documents` 数量变化（既有 2→5）已注明“新增根文档 refs，不是回归”，既有 card/changelog/docs `documentId` 前缀/顺序断言保留。

---

## 五、逐项验收表（P1–P10 + G1/G2）

> 结果只使用 `pass` / `fail` / `insufficient evidence` / `not applicable`；本表无 `not applicable`。P5 为 Windows 子项 pass、POSIX 子项未执行，整行 `insufficient evidence`。P 编号与方案 §8.5 的对照见标准 §3.0。

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 实际观察 | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **P1** | `rootDocs` 只含 `feature-map.md`/`functional-description.md`/`api-spec.md` 三精确文件、固定顺序、只存在项；memo 永不入任何字段、不 lstat/读取 memo、不扫描根目录；changelog 独立可选；docs 遍历/排序/500 上限/隐藏跳过不回归；索引只元数据不读正文 | `project.test.ts` 原始输出；索引样例；diff；旧 docs/changelog 测试 | `s6-test-desktop-app-targets.log`（164/164，project.test 23/23）；`index-sample.txt`（真实仓库三文件、memo 未列、docsCount 358/500）；`s6-candidate-hashes.txt`；`app/desktop/project.ts` blob `47b41f64…`；本次复跑 164/164 | `d64590f` 17 候选；`f2decbb9…` | 桌面窗口 | 三文件恰 3 条且顺序 feature-map→functional-description→api-spec；memo/任意根文件不在任何字段且不读正文；changelog 仍在独立字段、缺失为 null；docs 排序/隐藏/500 上限不变；代码只 lstat 角色目录 + 三个白名单文件，无根目录 readdir/glob；`RoleView.rootDocs` 仅 name/path/kind 元数据 | **pass** |
| **P2** | 白名单单一来源 Model；索引只 lstat 角色目录与三个直接普通文件，不扫描根；Service 精确期望路径二次校验，memo/任意根文件/`../`/绝对/反斜杠/冒号/大小写/`docs/feature-map.md`/项目外/重复/空 roleDir 拒绝且不铸造；Provider 零改动；无写路径/第二读取器；读取只经 opaque refs | 负例测试；符号链接/Windows fail-closed；Provider diff；refs 输出 | `s6-test-desktop-app-targets.log`（project-document 20/20 含平台无关注入 reader）；`project-document.test.ts` 负例/去重/空 roleDir/Windows `serviceReads=0`；`s6-zero-diff-and-writeset.txt`（Provider 零 diff）；Model/Service blob `e501ff31…`/`ef66fa69…`；本次复跑 164/164 | 同上 | 桌面窗口、测试 | `expectedRootPaths = roleDir + "/" + 白名单`，非法候选静默拒绝；合法 refs 追加在 card/changelog/docs 之后，既有 `documentId` 前缀稳定；重复去重为一条；`api-spec` 的 `not-applicable` 为普通文本；Provider `lstat`/realpath/`O_NOFOLLOW`/有界读/UTF-8 校验零改动；无新写路径/IPC。POSIX 符号链接/竞态测试代码存在但未在 Windows 执行（见 P5） | **pass** |
| **P3** | `RoleView.rootDocs?`/`Candidates.rootDocs?` additive；`listProject` 装配（内置角色 `[]`，失败如实留空不崩）；`documents` 由既有 Service 生成、根 refs 追加且既有前缀不变；无新 IPC/preload；旧 renderer/旧 main 兼容；`not-applicable` 普通文本；根正文不进入 `RoleView` | 类型/接口 diff；`interface.test.ts`；preload 零 diff；旧夹具；api-spec 测试 | `interface.test.ts` 121/121（在 164 内）；`s6-contract-additive.txt`（4 处可选字段、无新 IPC 行）；`app/preload.cjs` 零 diff；`s6-test-desktop-app-targets.log`；本次复跑 164/164 | 同上 | 桌面窗口 | `RoleView.rootDocs` 恰 3 条项目相对路径；内置角色 `rootDocs=[]`；Windows `documents=[]` 且元数据仍列名；旧 main 无 `rootDocs` 时根组不显示、不崩；`api-spec` `not-applicable` 正常文本；`RoleView` 无根正文；无新通道/方法 | **pass** |
| **P4** | ProfilePanel 根文档/docs 两组、固定顺序、只存在项、count = 根 file 数 + docs file 数、两组都空空态、有根无 docs 不误空；按钮键盘可达、点击经刷新后 `relativePath` 精确匹配进 DocumentView；memo/role-card/boundary 不渲染/不重复；changelog 独立；焦点回归；960/200% 不裁切 | 纯逻辑测试；Phase 4A DOM/截图/几何；空态样例；点击/焦点 | `s6-test-desktop-ui.log`（209/209，`profile-docs.test.ts` 14 例）；`s6-phase4a-report-current.json`（9 项 root-doc 检查全 true；`WIDTH_960_PROFILE_NO_OVERFLOW`、`ZOOM_200_*` true）；`s6-probe-report.txt`（groups/order/memo/hasBody=false、count 311）；截图/几何；本次复跑 209/209 | 同上 | 桌面UI | 两组顺序 root→subdir；3+100 count 103；空态 `（暂无角色文档）`；部分缺失不占位；memo 不显示；role-card/boundary 不重复；点击有 ref 时进只读阅读态、Windows 无 refs 时停留列表并显示结构化错误；返回焦点回根文档按钮；960/200% 按钮可达、无水平溢出 | **pass** |
| **P5** | Windows：索引列名 + 点击既有 `UNSUPPORTED_ENVIRONMENT`，不伪造正文/不读字节/不建 scope/不铸 refs，fixture 字节/mtime 不变；POSIX：真实读取三根文档正文/`byteLength`/`not-applicable`/mtime、符号链接/竞态错误码；Windows/POSIX 分开记录、不互相替代；无 POSIX 环境记未执行/证据不足 | 分平台测试/截图；Provider/Service 输出；fixture 字节/mtime | Windows：`project-document.test.ts`/`interface.test.ts`（164/164 内）、`s6-probe-report.txt`（`hasBody=false`、错误原文）、`s6-root-doc-fixture-integrity.txt`；POSIX：**未执行**（`s6-root-docs-scenarios.txt` #16/#17、S6 记录 §六、变更包 §6.4） | 同上 | 测试、桌面窗口、桌面UI | Windows 子项实测通过：列三名、结构化不可用、无 scope/refs/正文、不读字节、fixture 不变。POSIX 子项无任何真实正文/字节/mtime/符号链接/竞态输出；未用 Windows 结果替代。按标准 §3.6.4 与 §7.1，整行判 insufficient evidence | **insufficient evidence** |
| **P6** | 7 个 `ui.profile.*` key（4 必需 + 3 副标签）zh/en 齐全、parity、默认 zh；无硬编码中文；文件名/路径/`docs/`/`not-applicable` 不翻译；memo 无 key/开关；无第二份 messages/resolver | key parity/值断言；zh/en 输出；源码扫描；diff | `s6-test-i18n-unit.log`（186/181/5；新 2 用例）；messages diff（zh/en 各 +7）；`[i18n-guard] scanned=107 allowlisted=18 violations=0`；`s6-probe-report.txt` zh 标签；本次复跑 186/181/5 | 同上 | 项目管理、桌面UI | zh/en 各 1249 key、`ui.profile.*` 22；4 必需 + 3 副标签逐字齐全、占位符 `{name}` 一致；文件名/路径/`not-applicable` 原样；`docs/` 保留；memo 无 key；桌面UI 只经既有 i18n facade；无第二份目录/resolver | **pass** |
| **P7** | 受影响单测/层测试 + 跨层 + 真实 Electron 对当前候选执行；typecheck/typecheck:renderer/build；T2 不默认全量；断言未弱化；失败分类；候选哈希/原始日志 | 命令/退出码/计数/失败原文；测试 diff；哈希清单；证据清单 | `s6-command-summary.txt`；`s6-test-*.log`；`s6-phase4a-report-current.json`/run2；`s6-e2e-run1/2-report.txt`；`s6-typecheck*.log`/`s6-build-renderer.log`；`s6-candidate-hashes.txt`；本次定向复跑（§四.4） | 同上 | 测试、各实施角色、统筹 | 209/209、164/164、10/10、13/13、186/181/5、双端 typecheck/build 0 均对当前候选成立；Phase4A 当前 10 失败全为基线 99/12 的子集、新增 9 项全过；真实 Electron 2/2 `E2E_PASS` + 真实应用探针；验收定向复跑一致；无删除/放宽断言；T2 未跑全量 T3 并记录理由。真实 root-doc DOM 由仓库外 harness 副本补齐（§六.2） | **pass** |
| **P8** | 无新增角色/角色卡/边界/权限/治理/枚举/依赖；不改 Provider/preload/IPC/`app/main.ts`/Service abstract/public/Pipeline；不改 package/锁/tsconfig/vite/electron-builder/发布配方；不改角色卡/边界/目标项目/迁移；不要求补 changelog/docs；不写 `docs/verification/` | 路径 diff/status；零 diff；角色卡/边界/目标哈希；依赖清单 | `s6-zero-diff-and-writeset.txt`；`s6-boundary-hashes.txt`（8/8）；提交 85 路径分类；目标 7 角色目录 6 文件/目录、最新 mtime 12:50、manifest `16ecee82…`；`git status --short` 4 条；无 `docs/verification/` | 同上 | 桌面窗口、桌面UI、项目管理、测试 | 无新角色/边界/权限/枚举/依赖/写路径；Provider/preload/main/package/锁/构建配置零 diff；角色卡/边界零变更；目标角色区无晚于实现窗口的文件；未迁移/未补 changelog/docs；管理记录与产品候选分离。提交事实按客户后续指令处理（§3.4/§六.6） | **pass** |
| **P9** | 变更包完整（候选哈希/改动路径/S1–S7/证据/T2/复用/环境/未解决/P 对照/隔离）；逐文件 hash-object+sha256sum；命令/cwd/环境/退出码/计数/失败原文；Windows/POSIX 分开；fixture 字节/mtime；截图/几何元数据；目标零写入；证据路径可打开 | 变更包；原始日志；哈希清单；截图/几何；失败分类 | 变更包 436 行 `6aa05b8b…`；17 行清单 `f2decbb9…`；S6 `sha256.txt` 62/62 OK（`020776db…`）；`s6-command-summary.txt`；`s6-phase4a-meta.txt`/`s6-e2e-meta.txt`/`s6-probe-meta.txt`；截图；`s6-failure-classification.txt`；目标 mtime/manifest | 同上 | 统筹、各实施角色、测试 | 变更包字段齐全；17/17 候选可复算；原始日志含命令/计数/退出码/失败原文；Windows/POSIX 分节；临时 userData/outDir、窗口/zoom/几何可定位；目标角色区零写入（mtime/manifest）；无摘要冒充原始输出；无 `docs/verification/`。证据清单文字有一处 13/13 命令表述不一致（§4.1），不影响原始日志 | **pass** |
| **P10** | 实施/测试/验收状态如实（implemented-unverified/verified-by-tests-only ≠ 验收）；标准先于实施并冻结；报告另写；不提前宣称 verified；不改写方案/计划状态头；证据链接有效；未提交/未发布状态如实 | 文档 diff/状态行；标准/报告路径与时间；方案/团队计划状态头 diff；未做/未测声明 | S2/S3 `bf1abed6…`、S4 `add7e02c…`、S5 `1c1881f3…` 均 `implemented-unverified`；S6 `65e49491…` `verified-by-tests-only`；变更包状态“待独立验收”；标准 784 行 `12981ed4…`（实施前冻结）；方案/团队计划状态头未改写（漂移见 §2.1）；本报告另写 | 同上 | 各实施角色、统筹、内置验收 | 实施角色未声称验收通过；S6 只声明测试验证；变更包不判定通过/返工；标准/报告分离；方案/计划状态头保持原文并在报告记录漂移；证据链接可打开；未做 POSIX 如实写“未执行”；无 `docs/verification/` 伪造。提交已完成但未推送/未发布，变更包/本报告均声明提交不等于发布授权 | **pass** |
| **G1** | 变更包完整；候选身份可复算（HEAD/status/diff/stat/cached/逐文件哈希）；S1 基线隔离（只列相对 S1 增量，既有 i18n/目录 v3/治理写卡/返工路由为上下文）；管理记录不混入产品候选；T2/复用/失效说明 | 变更包；S1 基线/重冻；逐文件哈希；diff/status/stat；隔离说明 | 变更包 `6aa05b8b…`；S1 `a6aa70d5…`；重冻 `9b77fef4…`/快照 `36ae8c04…`；17/17 blob；`f2decbb9…`；`s6-s1-snapshot-comparison.txt`（119 same/10 changed/0 missing）；提交路径分类 | 同上 | 统筹 | 变更包字段齐全；候选只 17 个产品/测试文件；相对 S1 的 10 个 changed 均为 S1 时已脏、本变更继续修改的共享文件；上游 i18n/目录 v3/治理写卡/返工路由由 `6407d63` checkpoint 收口，不作为本候选；管理记录/证据不冒充产品哈希；复用/失效说明与同候选依据成立 | **pass** |
| **G2** | 改动在团队计划写集内；`test/桌面应用/` 不新建、只改既有授权文件；Provider/preload/main/package/构建配置零改动；角色卡/边界/YAML/目标项目零写入；无新增依赖/枚举；不暂存/不提交/不推送/不发布；S1 隔离；管理记录写者正确 | `git diff --name-only`/`--stat`/`--cached`/status；逐路径写集对照；`test/桌面应用/` 清单；角色卡/边界/目标哈希；IPC 清单 | `git status --short` 4 条；`git diff --cached` 0；`s6-zero-diff-and-writeset.txt`；`s6-boundary-hashes.txt`；目标 43 角色区文件 manifest `16ecee82…`；提交 85 路径；`test/桌面应用` 31 tracked/0 untracked/3 M；`e2e/main.mjs` 未改 | 同上 | 统筹、各实施角色 | 15 个既有路径在精确写集/目录授权内；2 个新增文件：`app/renderer/src/chat/profile-docs.ts` 在桌面UI 目录授权与团队计划 §3.3 写集内，`test/桌面UI/profile-docs.test.ts` 在桌面UI 目录授权、设计 §7.2 建议且变更包列明，但 S1 目标表未单列（流程记录缺口，§六.5）；`test/桌面应用/` 无新建；Provider/preload/main/package/构建配置零 diff；角色卡/边界 8/8；目标角色区无实现窗口内写入；无暂存/推送/合并/发布；提交 `d64590f` 按客户后续「修改好了之后提交代码」指令处理为合法例外，提交不含 `docs/acceptance/`/`docs/scheduling/`/`docs/verification/`（§六.6） | **pass** |

---

## 六、残余、证据边界与未解决问题

1. **POSIX 实读未执行（P5 唯一 insufficient evidence 来源，影响总体结论）**：当前 Windows 11 环境无法运行真实 POSIX Provider。缺 `feature-map.md`/`functional-description.md`/`api-spec.md` 正文、`byteLength`、只读且不改 mtime、`not-applicable` 普通文本，以及符号链接/根替换/竞态错误码的真实证据。按标准 §3.6.4 不得用 Windows 列名/文件存在替代，也不得判 N/A（除非客户书面收窄范围）。需要 macOS/Linux 对当前候选执行 `test/测试/p1p7-document-integration.test.ts`/`e2e/main.mjs` 的 POSIX 分支并单独记录；补证后只需重判 P5，不需全量 T3。
2. **真实 root-doc DOM 来自仓库外 harness 副本**：未改动的 `test/桌面应用/e2e/main.mjs` 没有 root-doc DOM 断言，只记录 `RIGHT_HAS_DOCS=true`；两次 `E2E_PASS` 证明既有链路不回归，root-doc 三文件名/分组/顺序/点击不可用由 `s6-probe-real-electron-script.mjs`（真实 preload/renderer/interface/真实仓库）补齐。该副本在证据目录内、可复核，不是产品/测试改动。若客户要求未改动 e2e 直接断言 root-doc，需桌面窗口按团队计划 §3.2/§八.11 最小追加 `e2e/main.mjs` 后复跑；本批未改，作为证据边界记录，不判 fail。
3. **Phase 4A 运行间浮动**：S4 记录 108 checks/11 fail（基线 99/11），S6 最终 108/10（基线 99/12）；两次当前运行失败集完全相同、全部为基线子集、S4 新增 9 项全过。失败集中在既有设置/键盘/滑块/队列/抽屉焦点族，S4 诊断隐藏窗口 220 ms 仅 1 个 rAF tick；不属于 root-doc 路径，不因本变更修复。续接时以 S6 报告 JSON/日志为准，不把浮动当新增失败。
4. **测试命令表述不一致（只报告）**：S6 记录 §三“上条 + su + genesis = 13/13”与实际命令（`p1p7` + `su-effective-boundary` + `genesis-bootstrap`，不含 `i18n-integration`）不符；`s6-command-summary.txt` 正确。10/10 与 13/13 均为原始日志 exit 0，不影响证据；建议续接时以命令汇总为准。
5. **新增 `test/桌面UI/profile-docs.test.ts` 的 S1 写集确认缺口**：文件在目录授权内、设计 §7.2 建议、变更包列明；但 S1 基线 34 条目标表未单列该新测试文件，团队计划 §3.3“须在 S1 写集确认”条件只部分满足。按“目录授权内的新增测试、非 `test/桌面应用/`、未删除/弱化断言”判定为可接受流程偏差；不作为越界写，但沟通/统筹后续应避免同类记录缺口。
6. **客户提交指令未入 `docs/communication/`**：实施授权文本明确不含 commit；客户随后「修改好了之后提交代码」只由本次验收任务输入转达，`docs/communication/memo.md` 工作树 +1 行记录了 commit `d64590f` 的结果但未记录指令原文。提交合法按该后续指令处理；建议沟通补记指令与对象（17 候选 + 管理记录/证据/打印规则），以保持提交/发布授权链可追溯。提交未推送（分支无 upstream），不构成发布授权。
7. **目标项目无前后哈希快照**：`ans-gateway` 不是 git 仓库；S1/S2–S6 记录称未访问/未写入，但没有标准 §4.8 要求的“7 个角色目录前后哈希 + git status”。本次独立只读复算：7 个角色目录各 6 文件 + `governance-boundary.yaml` 共 43 文件、manifest `16ecee82…`、最新 mtime 2026-10-23 12:50（早于实现窗口），未见实现窗口内写入；目标其他文件在 22:13–22:47 的外部漂移与本变更无关，不能归因。若后续要求严格前后哈希，需在下次变更前建立目标快照。
8. **Phase 4A 既有失败不修复**：当前 10 项（设置字段/键盘、滑块、960 focus/inert 等）是干净 HEAD 基线既有失败；本变更不修、不改测试、不据此放宽标准。后续若要清零，应由相应 owner 另开任务。
9. **`ROLE_WORK_DOC_FILES` 是既有 4 文件常量**：`app/desktop/interface.ts:3499` 的既有治理常量含 `memo.md`，用于角色工作文档校验，不参与本变更索引/Service/展示；新白名单单一来源仍是 Model 的 `ROLE_ROOT_DOC_FILENAMES`。不构成 P2 违规，记录以免误读。
10. **S6/变更包不是验收结论**：S6 状态 `verified-by-tests-only`，变更包“待独立验收”；本报告是独立验收结论。S2–S6 记录中的“pass”是测试执行结果，不是验收判断。
11. **无 task_ops / 无 `docs/verification/`**：本项目无 `.ans/project.json`，未启用 task_ops；未伪造任务令牌/锁/审批/机器预检，未写 `docs/verification/`。
12. **T2 全量回归 N/A 的边界**：若后续补 POSIX 证据仍只影响 P5；若客户要求 Windows 实读/改 Provider/读取模型/角色边界，则触发升档与重开闸门 1/2，需按 T3 执行适用全量回归并另写标准/报告，不能沿用本报告。

---

## 七、放行边界

- 本报告结论为 **证据不足**，只对当前候选（HEAD `d64590f`，17 个产品/测试 blob，清单 `f2decbb9…`）有效。任何 17 文件或相关输入/依赖/夹具/配置变化都会使受影响证据失效，需按标准 v1 重新判定。
- **不授权提交、推送、合并、发布或任何对外操作**。提交 `d64590f` 是客户后续「修改好了之后提交代码」指令下的既有事实，不是本报告授权；本报告不授权新的 commit/push/merge/release。v1.7.0 发布前仍需以本结论（或补 POSIX 后的新结论）作为独立 T2 验收依据，并与 i18n、目录 v3、治理写卡、发布事实分开登记。
- **不声称目标项目已修复/已迁移**：`ans-gateway` 仅只读样例；本报告不改变其角色/文档/账本，也不为其升级背书。
- **不改变客户最终决定权**：客户可以书面收窄平台范围（仅 Windows 列名 + 不可用提示），使 POSIX 子项 N/A；也可以要求在 macOS/Linux 补证。两种决定都不由本报告代替。
- 本报告不改变标准 v1、方案 v1、团队计划 v1、角色卡/边界或任何角色记录；只写 `docs/acceptance/`。

---

**状态声明**：本文件是内置独立验收按标准 v1 对当前候选写出的验收报告，结论为**证据不足**（仅对当前候选有效；P5 POSIX 实读未执行；无 fail 行）。它不是客户确认记录，不是实施/提交/推送/发布授权；不声称目标项目已修复；不改变客户最终 accept/reject 权力；不与 i18n、目录 v3、治理写卡、验收返工路由或 v1.7.0 发布合并结论。
