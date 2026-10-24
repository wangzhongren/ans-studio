风险档位：T2｜判定依据：客户范围收窄确认（`docs/communication/2026-10-23_intent_role-root-docs-display.md`，94 行，SHA-256 `0cefaf94ac172ad347b33f6015ee98c1ab65f696bc29f5ab9f53636dd431acb5`，blob `46fcac1963a26e18d9ba8c41dd804c16ff189e56`，「范围收窄确认（2026-10-24）」）+ 标准 v1.1（`docs/acceptance/role-root-docs-display-criteria-v1.1.md`，76 行，SHA-256 `43b6eb54e35af573ade6d310dfe9ee1e4391690fda36e4f37fb6c12c90367dd8`，blob `dbff0d9d60c62b427a0a3325f9d03fcbc6d062ec`；对标准 v1 784 行 `12981ed44ee1786d4a73d9441b823075b6ed88a23ae10b95d928afb225f6efcb` 仅修订 P5 POSIX 子项）+ 客户闸门 1 确认的方案 v1（1023 行，`9b69a7864112eb3df0c1da86b6ce653bb9235d4c655ac4d6f3b979e29080c26d`）+ 团队计划 v1（488 行，`8ec6e0d7f264a89bad3cb081371079dca8e2785750f29df9769704342f895fa8`，仅作范围/写集/阶段/证据口径）+ 技能 `references/testing.md` 的 T2 定义 + 实施授权 + 客户后续提交指令「修改好了之后提交代码」（未写入 `docs/communication/`，见 §六.6）｜选定检查：当前候选 HEAD `d64590f35c0531d0e41acd1be32be9f415a06a2b`（tree `6bb0d018cdf9983d96016f75b977d594aee26b69`；父 `6407d63`），17 个产品/测试候选逐路径 `git hash-object` + `sha256sum`（17/17 一致，0 mismatch；清单 `f2decbb95ff1e9ca24deb1da9fd00de699e3b7e4377a6bdcec7b4b4eaba8e288`），工作区 17 路径无 diff，`git diff --cached` 0；复用 v1 报告 P1–P4/P6–P10/G1/G2 与 S6 证据（S6 manifest `020776dbd7564c1f7971c035787716013a8da4c45b17ce15c15082f0150c998a` 62/62 OK；UI 209/209、桌面 164/164、跨层 10/10 与 13/13、i18n 186/181/5、双端 typecheck/build 0、Phase4A 当前 108 checks/98 pass/10 fail 对干净 HEAD 99/87/12、真实 Electron `main.mjs` 2/2 `E2E_PASS`、真实应用 Windows root-doc 探针）；本次复核 P5 Windows fail-closed 与候选身份｜全量回归：N/A（T2 不默认全量 T3；未触发升档；同候选复用 S6 证据，只重判 P5）｜结论：**通过**（当前候选，Windows 只列名范围；POSIX 正文实读按客户确认 N/A/延后，不声称 POSIX 可读）

# 独立验收报告（v1.1）：角色根文档在详情面板展示（role-root-docs-display）

- 任务 ID / 产品 flowId：`2026-10-23-role-root-docs-display` / `role-root-docs-display`
- 日期：2026-10-24｜角色：内置独立验收（独立子代理上下文，非沟通/统筹/开发/测试）
- 验收基线：客户闸门 1 确认的方案 v1（1023 行；`9b69a786…`）；标准 **v1.1**（76 行；`43b6eb54…`）——对 v1（784 行；`12981ed4…`）仅修订 P5 POSIX 子项；团队计划 v1 只作范围/写集/阶段/证据口径依据
- 候选：分支 `v1.7.0-work`，HEAD `d64590f35c0531d0e41acd1be32be9f415a06a2b`（tree `6bb0d018cdf9983d96016f75b977d594aee26b69`；父提交 `6407d636b69e3f8eb12fb872e2622172bcbff583`）；与 v1 报告同一候选（17 个产品/测试文件，15 改 + 2 新增），本次复核未变
- 结论：**通过**（只对当前候选与 Windows 只列名范围有效；POSIX 正文实读不在本轮范围，N/A/延后；不授权提交、推送、合并、发布，也不声称目标项目已修复/已迁移）
- 报告路径：`docs/acceptance/role-root-docs-display-report-v1.1.md`（本文件；不是标准，不是客户确认记录）
- 历史报告：`docs/acceptance/role-root-docs-display-report-v1.md`（216 行；SHA-256 `ebc6c8d43137ac8f1295ad7d75fb0352c04112490a69537a283f7eaae2cba32c`；blob `63ebed7a7426687ca0cf6139356e9d6b6ecaddf4`）保留不变；v1 的“证据不足”结论仅因 P5 POSIX 未执行，本 v1.1 按客户范围收窄只重判 P5，不重写 v1 报告。

---

## 一、总体结论

按标准 v1.1 判定：

- **P5：pass**。Windows 子项实测通过；POSIX 正文实读子项按客户 2026-10-24 书面范围收窄确认标记为 **N/A/延后**（不是“已验证可读”，也不是证据不足）。
- **P1–P4、P6–P10、G1/G2：pass**。沿用 v1 报告 §五的逐项判定与证据；本次复核当前候选 `d64590f` 的 17 个 blob/SHA-256 与 v1 报告完全一致，工作区 17 路径无 diff，因此这些行的证据仍对应当前候选。
- 全部适用行 pass；P5 的 POSIX 子项是客户确认的 N/A，不计入 insufficient evidence。按标准 v1 §7.2（v1.1 未改该规则），总体结论为 **通过**。

**通过的范围边界（必须同时阅读）：**

- 本结论只覆盖 **Windows 上“列出三个根文档文件名 + 点开显示既有 `UNSUPPORTED_ENVIRONMENT` 结构化提示、不读正文/不建 scope/不铸 refs”**。
- **POSIX（macOS/Linux）正文实读、`byteLength`、mtime、`not-applicable`、符号链接/竞态未验证**，按客户确认留待后续独立变更；本报告不声称 POSIX 可读，也不把 Windows 列名/文件存在当 POSIX 实读。
- 通过只表示当前候选在标准 v1.1 下满足 Windows 列表范围；不授权 commit、push、merge、发布或任何对外操作；不声称 `ans-gateway` 已修复/已迁移。
- v1 报告中“证据不足”的历史结论保留，但已被 v1.1 仅就 P5 POSIX 子项取代；v1 报告的其他行判定与证据继续有效。

---

## 二、客户范围收窄与标准 v1.1

### 2.1 客户确认

- 记录：`docs/communication/2026-10-23_intent_role-root-docs-display.md`「范围收窄确认（2026-10-24）」（当前 **94 行**；SHA-256 `0cefaf94…`；blob `46fcac19…`）。
- 客户原话：「确认 v1.7.0 范围为 Windows 只列名，POSIX 正文实读留待后续；请更新标准/验收按此重判 P5。」
- 口径：v1.7.0 只验收 Windows 列名 + 既有 `UNSUPPORTED_ENVIRONMENT`；POSIX 正文实读不在本轮范围；不伪造 POSIX 证据，不用 Windows 结果冒充 POSIX 可读；不改代码/测试/候选，只更新标准/报告版本；按当前候选 `d64590f` 重判 P5。

### 2.2 标准 v1.1

- 路径：`docs/acceptance/role-root-docs-display-criteria-v1.1.md`（**76 行**；SHA-256 `43b6eb54…`；blob `dbff0d9d…`）。
- 性质：对 v1 的 amendment，不重写 v1；只把 P5 的 POSIX 实读子项改为 N/A/延后，P5 Windows 子项与其余 P1–P4/P6–P10/G1/G2 完全沿用 v1。
- v1 原文与 v1 报告均保留；本报告不修改标准 v1、方案 v1、团队计划 v1、角色卡/边界、沟通记录或候选。

### 2.3 档位与检查面

- **T2 与改动相符**：本变更触及 Model 白名单/候选契约、Service 精确校验、桌面 `RoleView`/`listProject`、渲染层展示与跨层测试；未改 Provider/preload/main/IPC/角色卡/边界/权限/治理；未触发升档。POSIX 的 N/A 是客户范围收窄，不是升档/降档。
- **选定检查**：17 候选哈希复算；复用 v1 报告/S6 的受影响单测、跨层、Phase4A、真实 Electron、typecheck/build 证据；本次只做候选身份复核与 P5 Windows fail-closed 证据复核，不重跑全量 T3。
- **全量回归：N/A**。理由：T2 不默认全量；未触发升档；当前候选与 v1 报告同一 17 blob，S6 证据仍有效；POSIX 实读已按客户确认 N/A，不需要用全量回归补 POSIX 证据。

---

## 三、当前候选复核（d64590f）

| 检查 | 实测值 |
| --- | --- |
| 分支 / HEAD / tree / 父 | `v1.7.0-work` / `d64590f35c0531d0e41acd1be32be9f415a06a2b` / `6bb0d018cdf9983d96016f75b977d594aee26b69` / `6407d636b69e3f8eb12fb872e2622172bcbff583` |
| 17 候选逐路径 | `git hash-object` + `sha256sum` **17/17 一致、mismatches=0**；清单 `f2decbb9…`；与 v1 报告 §3.2 表逐项一致 |
| 工作区 vs HEAD（17 路径） | `git status --porcelain -- <17>` **空** |
| 暂存区 | `git diff --cached --name-only` **0** |
| 提交 | `d64590f` 含 85 路径 = 17 产品/测试 + 68 管理记录/证据/打印规则；未推送（分支无 upstream）、未合并、未发布；提交不含 `docs/acceptance/`、`docs/scheduling/`、`docs/verification/` |
| 禁止路径 | `src/provider/project-document/**`、`app/preload.cjs`、`app/main.ts`、`package.json`/锁/tsconfig/vite/electron-builder 相对父提交与工作区零 diff（沿用 v1 报告 §3.3 并复核） |
| `test/桌面应用/` | 31 tracked、0 untracked、仅既有 3 文件 `M`；`e2e/main.mjs` 未改 |
| 角色卡/边界 | 8/8 SHA-256 与 S1 重冻一致；提交无 `role-card.md`/`boundary.{md,yaml}` |
| 目标项目 | `ans-gateway` 7 角色目录各 6 文件 + `governance-boundary.yaml`（43 文件；manifest `16ecee82…`；最新 mtime 2026-10-23 12:50，早于实现窗口），未见实现窗口内写入；无前后哈希快照（沿用 v1 报告 §3.3/§六.7） |
| 工作树 | `M docs/acceptance/memo.md`、`M docs/communication/2026-10-23_intent_role-root-docs-display.md`（客户范围收窄）、`M docs/communication/memo.md`（既有）、`?? .claude/`、`?? demos/`、`?? docs/acceptance/role-root-docs-display-report-v1.1.md`、`?? docs/scheduling/role-root-docs-display-change-v1.md`；均非产品候选 |

结论：当前候选与 v1 报告完全相同；v1 报告 §三的候选身份、隔离、零改动与写集结论继续成立。未改代码/测试/候选/目标项目。

---

## 四、P5 重判（标准 v1.1）

### 4.1 Windows 子项（pass）

证据（沿用 v1 报告 §四.3，本次复核）：

- `test/桌面应用/project-document.test.ts` 的 `assertWindowsFailClosed`：`updateListing` 返回 `UNSUPPORTED_ENVIRONMENT`；无 scope、无 refs；`serviceReads=0`、`checkpoints=0`；失败结果不含 `text`；fixture 字节/mtime 不变。
- `test/桌面应用/interface.test.ts`：Windows 上 `role.documents=[]`，`rootDocs` 元数据仍列出，`documentReadUnavailable=UNSUPPORTED_ENVIRONMENT`。
- 真实应用探针 `s6-probe-report.txt`：三文件名/固定顺序/root→subdir 分组；`S6_ROOT_DOCS_MEMO_ABSENT=true`；点击 `S6_ROOT_DOCS_CLICK_UNAVAILABLE=true`，`hasBody=false`，错误原文“当前环境暂不支持安全读取项目文档。”；`E2E_PASS=true`，`E2E_FAILURES=` 空。
- `s6-root-doc-fixture-integrity.txt`：真实仓库三个根文档运行后 `git status` 干净、mtime 早于运行；Windows 路径不读字节。
- 未改 Provider；无新 IPC/preload；无 Windows 读取旁路。

Windows 子项满足 v1.1 §2.1.1：**pass**。

### 4.2 POSIX 子项（N/A/延后，按客户确认）

- 客户 2026-10-24 书面收窄：POSIX 正文实读留待后续；v1.7.0 只验收 Windows 列名 + `UNSUPPORTED_ENVIRONMENT`。
- 本轮**未执行** POSIX 正文/`byteLength`/mtime/`not-applicable`/符号链接/竞态；本报告不声称 POSIX 可读，不用 Windows 结果替代。
- 按 v1.1 §2.1.2/§2.2，POSIX 子项为 `not applicable`（依据：客户范围收窄确认），不是 `insufficient evidence`，也不是 `fail`；后续若恢复 POSIX 正文实读，须另立标准/验收。

### 4.3 P5 行结果

**P5 = pass**：Windows 子项实测通过；POSIX 子项按客户确认 N/A/延后；分平台证据仍分开记录；Provider 零改动。

---

## 五、其余验收行（沿用 v1 报告 + 当前候选复核）

> 以下行的标准、证据、判定均沿用 v1 报告 §五（该报告 216 行，`ebc6c8d4…`）；本次已复核当前候选 `d64590f` 的 17 个 blob/SHA-256 与 v1 报告一致、工作区 17 路径无 diff，故证据仍对应当前候选。未重新判定或放宽标准。

| ID | 主题 | 结果 | 当前候选复核与证据 |
| --- | --- | --- | --- |
| **P1** | 索引白名单/顺序/memo/changelog/docs 不回归 | **pass** | 17 候选未变；`project.test.ts` 23/23（在 S6 164/164）；`index-sample.txt` 三文件/memo 不列/docsCount 358/500；v1 报告 §五 P1 |
| **P2** | 路径/候选安全、Service 二次校验、Provider 零改动 | **pass** | 17 候选未变；`project-document.test.ts` 20/20（含平台无关注入 reader/负例/Windows fail-closed）；Provider 零 diff；v1 报告 §五 P2 |
| **P3** | Interface/RoleView additive、listProject 装配、无新 IPC、旧兼容、`not-applicable` | **pass** | `interface.test.ts` 121/121；`s6-contract-additive.txt`；preload 零 diff；v1 报告 §五 P3 |
| **P4** | 渲染两组/空态/点击/不重复/布局/焦点 | **pass** | UI 209/209（`profile-docs.test.ts` 14 例）；Phase4A 9 项 root-doc 检查全 pass；960/200 布局 pass；真实应用探针；v1 报告 §五 P4 |
| **P6** | i18n 7 key/parity/不翻译/无硬编码 | **pass** | i18n 186/181/5；`i18n-guard` 0 violations；zh/en 1249 key；v1 报告 §五 P6 |
| **P7** | 测试/跨层/真实 Electron/typecheck/build/T2 | **pass** | 209/209、164/164、10/10、13/13、186/181/5、双端 typecheck/build 0；Phase4A 当前 10 失败全为基线子集、新增 9 项全过；e2e 2/2 `E2E_PASS`；v1 报告 §五 P7 |
| **P8** | 无新角色/权限/枚举/依赖；Provider/preload/角色卡/目标项目零改动 | **pass** | 零 diff/8/8 boundary/目标 mtime 复核；提交按客户后续指令处理；v1 报告 §五 P8 |
| **P9** | 证据完整性/可复算/分平台/夹具/截图 | **pass** | 17/17 哈希、S6 manifest 62/62、原始日志/截图/几何、Windows/POSIX 分开；v1 报告 §五 P9 |
| **P10** | 文档状态如实（implemented-unverified/verified-by-tests-only ≠ 验收） | **pass** | S2/S3/S4/S5 `implemented-unverified`；S6 `verified-by-tests-only`；标准/报告分离；v1 报告 §五 P10 |
| **G1** | 变更包/候选身份/S1 隔离/管理记录不混入 | **pass** | 变更包 `6aa05b8b…`；17/17；S1 `a6aa70d5…`/重冻 `9b77fef4…`；119 same/10 changed/0 missing；v1 报告 §五 G1 |
| **G2** | 写集/边界/零改动/无提交推送发布 | **pass** | 17 路径在写集/目录授权；`test/桌面应用/` 无新建；Provider/preload/main/package/构建配置零 diff；boundary 8/8；目标零写入；staged 0、未推送；提交 `d64590f` 按客户后续「修改好了之后提交代码」处理；新增 `test/桌面UI/profile-docs.test.ts` 的 S1 表遗漏为记录缺口；v1 报告 §五 G2 |

**结论：P1–P10 + G1/G2 全部适用行 pass**（P5 的 POSIX 子项为 N/A，不计入 insufficient evidence）。

---

## 六、残余、证据边界与未解决问题

1. **POSIX 正文实读未验证（本轮明确 N/A/延后）**：客户已确认 v1.7.0 只做 Windows 列名 + `UNSUPPORTED_ENVIRONMENT`；本报告不声称 POSIX 可读，不把 Windows 结果当 POSIX 证据。后续如要做，需另立标准/验收（可能涉及 Provider/读取模型，按届时档位处理）。
2. **真实 root-doc DOM 由仓库外 harness 副本补齐**：未改动的 `test/桌面应用/e2e/main.mjs` 无 root-doc DOM 断言（仅 `RIGHT_HAS_DOCS=true`）；两次 `E2E_PASS` 证明既有链路不回归；root-doc 三文件名/分组/顺序/点击不可用由 `s6-probe-real-electron-script.mjs`（真实 preload/renderer/interface/真实仓库）补齐。若后续要求未改动 e2e 直接断言 root-doc，需桌面窗口按团队计划 §3.2/§八.11 最小追加后复跑；本轮未改，作为证据边界，不判 fail。
3. **Phase 4A 运行间浮动**：S4 108/11 vs S6 108/10；干净 HEAD 基线 99/11 vs 99/12；当前两次运行失败集相同、全部为基线子集、S4 新增 9 项全过；既有设置/键盘/滑块/焦点失败不因本变更修复。以 S6 报告 JSON/日志为准。
4. **S6 记录“13/13=上条+su+genesis”措辞与实际三文件命令不符**：实际 13/13 为 `p1p7` + `su-effective-boundary` + `genesis-bootstrap`（不含 `i18n-integration`）；`s6-command-summary.txt` 正确；10/10 与 13/13 均为 exit 0，不影响证据。
5. **新增 `test/桌面UI/profile-docs.test.ts` 的 S1 写集确认缺口**：目录授权/设计 §7.2 建议/变更包列明，但 S1 目标表（34 条目）未单列该新测试文件；按可接受流程偏差记录，不作为越界写。
6. **客户提交指令未入 `docs/communication/`**：实施授权明确不含 commit；客户随后「修改好了之后提交代码」由本次验收任务输入转达，`docs/communication/memo.md` 工作树记录提交结果但未记录指令原文；提交 `d64590f` 按该后续指令处理为合法，未推送。建议沟通补记授权链。
7. **目标项目无前后哈希快照**：`ans-gateway` 非 git 仓库；本次复核 7 角色目录 43 文件、manifest `16ecee82…`、最新 mtime 2026-10-23 12:50（早于实现窗口），未见实现窗口内写入；目标其他文件的外部漂移与本变更无关，不能归因。
8. **v1 报告的“证据不足”历史**：v1 报告保留不变；v1.1 只按客户范围收窄重判 P5 POSIX 子项，不重写 v1 的其他行。任何引用都必须同时引用 v1.1 的范围边界，不能把 v1.1 的通过写成“POSIX 已可读”或“全平台通过”。
9. **无 task_ops / 无 `docs/verification/`**：本项目无 `.ans/project.json`，未启用 task_ops；未伪造任务令牌/锁/审批/机器预检，未写 `docs/verification/`。
10. **T2 全量回归 N/A 的边界**：本轮未触发升档；若后续恢复 POSIX 实读或要求 Windows 实读/改 Provider/读取模型/角色边界，需另立标准/重开闸门，并视档位执行适用全量回归，不能沿用本报告。

---

## 七、放行边界

- 本报告结论为 **通过**，只对当前候选（HEAD `d64590f`，17 个产品/测试 blob，清单 `f2decbb9…`）与 **Windows 只列名范围**有效。任何 17 文件或相关输入/依赖/夹具/配置变化都会使受影响证据失效，需按标准 v1.1 重新判定。
- **不授权提交、推送、合并、发布或任何对外操作**。提交 `d64590f` 是客户后续「修改好了之后提交代码」指令下的既有事实，不是本报告授权；本报告不授权新的 commit/push/merge/release。v1.7.0 发布前仍需以本结论（或候选变化后的新结论）作为独立 T2 验收依据，并与 i18n、目录 v3、治理写卡、发布事实分开登记。
- **不声称 POSIX 可读**：POSIX 正文实读 N/A/延后；本报告只证明 Windows 列名 + 既有结构化不可用提示；后续 POSIX 变更另立标准/验收。
- **不声称目标项目已修复/已迁移**：`ans-gateway` 仅只读样例；本报告不改变其角色/文档/账本，也不为其升级背书。
- 本报告不改变标准 v1/v1.1、方案 v1、团队计划 v1、角色卡/边界或任何角色记录；只写 `docs/acceptance/`。

---

**状态声明**：本文件是内置独立验收按标准 v1.1 对当前候选写出的验收报告，结论为**通过**（仅对当前候选与 Windows 只列名范围有效；POSIX 正文实读按客户 2026-10-24 确认 N/A/延后）。它不是客户确认记录，不是实施/提交/推送/发布授权；不声称 POSIX 已可读，不声称目标项目已修复；不改变客户最终 accept/reject 权力；不与 i18n、目录 v3、治理写卡、验收返工路由或 v1.7.0 发布合并结论。
