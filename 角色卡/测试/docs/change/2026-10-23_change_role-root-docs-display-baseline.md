# 基线记录：角色根文档在详情面板展示（T2）S1 实施前基线

- **任务 ID**：`2026-10-23-role-root-docs-display`｜**产品 flowId**：`role-root-docs-display`（任务标签）
- **记录角色**：测试（Testing worker，独立子代理上下文）
- **执行者**：测试角色（本记录与证据目录中原始日志均由测试角色执行产生）
- **日期**：2026-10-23
- **阶段**：S1「实施前准备」的基线部分（团队计划 §1.4、§四 4.1 S1、§5.3、§6、§七）
- **风险档位**：**T2（跨角色/接口/契约变更）**；目标版本 **v1.7.0**
- **状态**：**S1 baseline complete；本基线不是实施/验收通过**。本记录只陈述实施前实测，不构成候选、不构成验收结论，不启动 S2。
- **授权与闸门前提**：
  - 团队计划：`docs/scheduling/2026-10-23-role-root-docs-display-team-plan.md`（488 行；SHA-256 `8ec6e0d7f264a89bad3cb081371079dca8e2785750f29df9769704342f895fa8`；git blob `98f41bd0be9c16e1b5556509acc4c581a2c0818c`）。
  - 客户闸门 1 确认的策划方案 v1（只读基线）：`docs/planning/2026-10-23_design_role-root-docs-display.md`（1023 行；SHA-256 `9b69a7864112eb3df0c1da86b6ce653bb9235d4c655ac4d6f3b979e29080c26d`；git blob `e898e65b9b388c2e4fdc529bfbbcf6fbe03fa5b4`）。
  - **客户实施授权未给**：本次只做只读基线，不实施、不派发、不改产品/测试代码/Markdown 记录以外的文件。
  - 基线期间观察到的外部文件：`docs/acceptance/role-root-docs-display-criteria-v1.md`（784 行；SHA-256 `12981ed44ee1786d4a73d9441b823075b6ed88a23ae10b95d928afb225f6efcb`）由独立验收角色在基线运行期间写入。该文件自述「闸门 0/1/2 已确认、实施授权未给、实施前标准冻结、不是验收报告」；测试角色未写、未复核、未背书该文件，只作为外部 S1 事实记录。团队计划文件头/§1.5 仍写「闸门 2 未确认」，与本文件无关；测试角色不裁决该状态差异，也不改写任何管理文档。
- **基线身份**：分支 `main`，HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（tree `1149238a834f31588797016d6ee2289a4ac3e97b`；提交标题 `docs(release): record v1.6.0 published assets and checksums`）。

---

## 一、环境与工作树身份

### 1.1 环境事实

| 项 | 值 | 来源 |
| --- | --- | --- |
| 记录时间（本地） | 2026-10-23 21:48:06 +0800（环境段） | `environment.txt` |
| OS | Windows 11 Pro 10.0.26300（`Microsoft Windows [版本 10.0.26300.9711]`）；`MINGW64_NT-10.0-26300 DESKTOP-8MOD9RB 3.6.10-710e5275.x86_64` | `uname -a`、`cmd /c ver` |
| Shell | Git Bash `/usr/bin/bash`，`GNU bash, version 5.3.15(2)-release` | `$BASH_VERSION` |
| 仓库 / 分支 | `C:\Users\51054\Desktop\work\ans-studio` / `main` | `pwd`、`git branch --show-current` |
| HEAD / tree | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1` / `1149238a834f31588797016d6ee2289a4ac3e97b` | `git rev-parse` |
| Node PATH（默认 shell） | **不含 Node**；`node`/`npm` 需显式加入 PATH | 实测 |
| Node（执行用） | **v24.22.1**（`C:/Users/51054/AppData/Local/Programs/nodejs/node.exe`） | `node --version` |
| npm | **11.19.1**（`npm.cmd`） | `npm.cmd --version` |
| Electron | **v44.7.0**（`./node_modules/.bin/electron`） | `electron --version` |
| `package.json` | `ans-cli@1.6.0`；engines `node >=23.6`；测试 runner `node --test`；脚本含 `typecheck`、`typecheck:renderer`、`build:renderer` | `runner-facts.txt` |
| 暂存区 | `git diff --cached --name-only` **为空**（0 项） | `environment.txt` |
| 工作树条目 | 写本证据目录前 **229**；写本记录前 **232**（含本证据目录、外部验收标准、外部沟通记录各 1 条）；写本记录后 **233** | `environment.txt`、`upstream-drift-observation.txt` |
| `src app test` 范围 | `git status --short` **121** 条；展开后 **129** 个改动/新增文件 | `worktree-start-src-app-test-files.txt` |

### 1.2 工作树状态（基线起点）

- `git diff --cached --name-only` 为空，无暂存、无提交。
- `git status --short` 的 229 条（写本证据目录前）包含四项**已验收但未提交**的既有变更候选，以及各角色 docs/memo、`demos/tower-defense`、`.claude/launch.json` 等既有上下文：
  1. **i18n（T2）**：`app/desktop/i18n.ts`、`app/desktop/preferences.ts`、`app/renderer/src/i18n/**`、`src/common/shared/i18n/**`、`test/项目管理/shared/i18n*.test.ts`、`test/桌面UI/i18n-*.test.ts`、`test/测试/i18n-integration.test.ts` 等。
  2. **目录授权 v3（T3）**：`src/common/编排/team-plan.ts`、`src/common/编排/directory-conformance.ts`、桌面 V12/任务文案及相关测试、`test/测试/governance-e2e-auto/**` 目录夹具等。
  3. **治理写卡推进（T3）**：`app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`test/桌面应用/{interface,acceptance-dispatch}.test.ts`、`test/测试/governance-e2e-auto/**` 等。
  4. **验收返工路由（T3）**：`src/common/编排/flow-state.ts`、`src/common/编排/flow-service.ts`、`src/pipeline/orchestration/flow-state.ts`、`app/desktop/customer-input.ts`、`app/main.ts`、`test/编排/**`、`test/桌面应用/operator-wiring.test.ts` 等。
- 以上四项是**既有上下文**，不是本变更候选；本记录不评价、不背书、不把它们并入本变更。完整清单见 `worktree-start-src-app-test-files.txt` / `worktree-start-status-readable.txt`。
- 基线期间另有外部管理文档写入（非本角色、非本变更候选）：`docs/acceptance/role-root-docs-display-criteria-v1.md`（独立验收的实施前标准）与 `docs/communication/2026-10-23_intent_artifact-observation-race.md`（另一个 T2 小变更的意图记录）。后者明确「角色根文档 S1 基线完成后实施，避免在基线快照期间改动 `src/`」；基线期间未观察到该变更对 `src/` 的改动。
- 任务说明的工作树约 228 条与本次实测 229 条（写证据前）相差 1 条；未发现产品/测试目标文件因此漂移，`src app test` 快照在基线期间逐字节稳定（§1.3）。差异按实测记录，不追溯解释。

### 1.3 上游冻结快照

| 快照 | 文件数 | SHA-256 | 文件 |
| --- | --- | --- | --- |
| `src app test` 改动清单整体快照 | 129 | `af53fea60be3efd6ca2f6ef1fdd4cbaabd60b64301e5f4ca7a8e8f2d98b9328e` | `worktree-start-src-app-test-files.txt` / `worktree-start-src-app-test-hashes.txt` |
| 全工作树既有改动（不含本证据目录） | 689 | `af1a98a6b605576325771729159610ef96f4ef1088a23c4ccc0f25133fa3c737` | `worktree-start-all-files.txt` / `worktree-start-all-hashes.txt` |
| 冻结快照（含两份外部管理文档，不含本证据目录与本记录） | 691 | `ace00e17c8473dd330ebc2c1f69e59666d308a9865fe02a0709dfa4722d8b3a9` | `worktree-freeze-all-files.txt` / `worktree-freeze-all-hashes.txt` |

- `src app test` 快照在全部基线命令（typecheck、build、五组测试、Electron e2e）之后**逐字节一致**：文件清单 diff 为空，逐文件 SHA-256 diff 为空（`stability-check.txt`）。
- 目标文件哈希在基线收尾复核时与起点一致（`target-hashes-diff.txt` 为空）。
- 上游漂移（均为外部管理文档，不是产品/测试候选）：基线期间外部写入 `docs/acceptance/role-root-docs-display-criteria-v1.md`（git `c0239c051be301c96aa07df1ab33ffc12cbbad33`；SHA-256 `12981ed4…`；784 行）和 `docs/communication/2026-10-23_intent_artifact-observation-race.md`（git `5c2f1d7c9698ff551d77300133b039ff6cb8c17d`；SHA-256 `3ee1f45a…`；46 行）。两份文件均单独记录在 `upstream-drift-observation.txt`，并纳入冻结快照（`worktree-freeze-all-*`）。

---

## 二、目标文件起始哈希（写前基线，不是候选）

> 列来源：团队计划 §三（§3.2–§3.6）逐文件写集。哈希为 2026-10-23 21:48:29 +0800 工作区内容。`git hash-object` 对已跟踪文件给出工作区 blob；`untracked_not_in_HEAD` 表示该文件不在 HEAD，但工作区已存在（既有 i18n 候选）。

### 2.1 Model / Service / Pipeline / Provider（桌面窗口）

| 文件 | 状态 | `git hash-object` | `sha256sum` | 字节 |
| --- | --- | --- | --- | --- |
| `src/model/project-document.ts` | 等于 HEAD | `980504823f3dd35b48801663d52be6c99d1f7c2f` | `bdae97e739d18bbe3a7da7b79f231fab5954d0c056bc4888e6598dae8e556d72` | 1,843 |
| `src/service/project-document/abstract/document-reader.ts` | 等于 HEAD | `3a3c148c019bd6e315520f145b227c6b840c5a85` | `62fd248bbec7b4f04203e66b521cfdbb7b0bc6464b2438ac43cc2a4e2bf14558` | 513 |
| `src/service/project-document/impl/read-project-document.ts` | 等于 HEAD | `c3109f6bd41c619ab4fcb37da24129b2f0c30ce8` | `6c7037a5bc60b3b7d9574e5a2b8088a7c42ccfd073e01580db72f5fbfff0a373` | 7,454 |
| `src/service/project-document/public/read-project-document.ts` | 等于 HEAD | `b55b39c595ed555d34ba803e7b5d64e93bc5a03d` | `5e43160370c1b07fdce01fac395e4df1a8a92f1f6d2d4e9d82b74395b49a0678` | 497 |
| `src/pipeline/project-document/read-project-document.ts` | 等于 HEAD | `edd6705e09dc2936cae00cee9ffa04403b663228` | `19cdfd532f0d6570d948e6c1252932b93ab36fdd4f36efa5df5f9a82d7c15eec` | 718 |
| `src/provider/project-document/abstract/file-reader.ts` | 等于 HEAD | `6d8f92a8c0a1bf943a6f25894ee42d62d5ee6333` | `45a170632d50ebe9cb125c135c0c937c6d15ed5c64274105f2fac816867a89ff` | 706 |
| `src/provider/project-document/impl/file-reader.ts` | 等于 HEAD | `752e760f95589fbacd0cf0de7552abcae13aaaed` | `977a8d7b71ad53172988caee6b1a99b6f684a4c8989b570d53656ae9a1ba3b61` | 5,284 |
| `src/provider/project-document/public/file-reader.ts` | 等于 HEAD | `23b51e679d42fb090e5e28090c9823a96b7446ae` | `1c228b6a780f9bccfe07e257f331ba4f90de48a1b6f72ecbaf12e8e69cbe5cb6` | 286 |

**Provider 零改动核对**：`git status --short -- src/provider/project-document` 与 `git diff --stat -- src/provider/project-document` 均为空（`boundary-preflight.txt`）。本变更计划不改 Provider（Q9 A）；S6 仍须以 `git diff -- src/provider/project-document` 为空作为验收项。

### 2.2 桌面 Interface / 渲染层 / i18n

| 文件 | 状态 | `git hash-object` | `sha256sum` | 字节 |
| --- | --- | --- | --- | --- |
| `app/desktop/project.ts` | 工作区已改（既有上下文） | `e5d24d22b951ec7152facf62a6e2260073ec45f0` | `d69c79294109ebb2bafa248631be558193a5b421b4249070a9b2abc2a6dd45d2` | 23,615 |
| `app/desktop/interface.ts` | 工作区已改（既有上下文） | `a49a84c85a431648fdd2fa58ea11e07b2ee3bcfb` | `20e9b545eb3a41faa24a4269aad863ec331885173ce9a8d9599f952d719139bf` | 336,550 |
| `app/preload.cjs` | 工作区已改（既有上下文；本变更**不改**） | `247985dabcbae2551c200fc85abfc39827b7002e` | `e4af7435116bcca92e4aa043213194f82d1c5b9f2bd1646a0c523c0bfa89d1f1` | 23,747 |
| `app/main.ts` | 工作区已改（既有上下文；本变更**不改**） | `b7801bc06e83187b35b373ee7986743eea96b1ed` | `cc7982ea7156e2b55d2f434b1e3aa0fb1c61372aeeca50cd8b5a25f771346342` | 63,034 |
| `app/renderer/src/shell/ProfilePanel.tsx` | 工作区已改（既有上下文） | `43225790b26324059edc75173f63443014fe7072` | `3cc118d1c0dd7d99613811e644f72d51c23dddd27d182385f30c18a26e35a20d` | 13,102 |
| `app/renderer/src/shell/DocumentView.tsx` | 工作区已改（既有上下文） | `2305e62ca0f58754f9d2c9cd7d4a3473337dc7f1` | `55d05c5d213dfe01b4a6a78e668f8e9bc44c627325f7d839bceaebdd9bd3ced0` | 9,770 |
| `app/renderer/src/chat/document-view.ts` | 工作区已改（既有上下文） | `902269c10bcc7b02fcefa44c80dc906dda025b71` | `4bf32a9d34f7ded97f2e1a83d7a10f3966d69142aa5178910080c608854be3ff` | 9,593 |
| `app/renderer/src/chat/types.ts` | 工作区已改（既有上下文） | `fb42aae9775b3342d12da3ae5668e2f7b50bd144` | `720c0663bd909e3904ad594eba8025161edd2fc5c01f12f8f0e46bb2663d27b8` | 5,018 |
| `app/renderer/src/stores/drawer-store.ts` | 工作区已改（既有上下文） | `4f40b1507b4cc5650b0c9f604ef7f9586e07830f` | `4cb2431a0e658f54d225f245c98582db71e63cb543ec56e27e2d61579197fda1` | 23,065 |
| `app/renderer/src/shell/phase4a.css` | 工作区已改（既有上下文） | `cf877d7878b968352cc9b0c9418769e445944112` | `052ea23040804e4ab2872c2a6b6813ba816db92f0c1e90d3c7ae2c0393391100` | 20,963 |
| `src/common/shared/i18n/messages/zh-CN.ts` | 未跟踪（i18n 既有上下文） | `c0501469ed8b8631e63ba124f419aa642a034400` | `d487a8d4853004daea619a82b2d760ff3218d6fd1015f1c29623d2ae15953e4e` | 115,558 |
| `src/common/shared/i18n/messages/en-US.ts` | 未跟踪（i18n 既有上下文） | `74ab4a7d654143b20b6614d7508f48da67c211cc` | `05089d70b7b1e0ee720d619efb57aa8d305b7b8f004f4be66144476257e4b373` | 122,490 |
| `app/renderer/src/chat/profile-docs.ts`（计划新增） | **不存在** | – | – | – |

### 2.3 受影响测试

| 文件 | 状态 | `git hash-object` | `sha256sum` | 字节 |
| --- | --- | --- | --- | --- |
| `test/桌面应用/project.test.ts` | 等于 HEAD | `923f2f316cd40a40582b32d406e6805f6ea2f8f8` | `ab72bb57a661de610fcfd4f32c1b5bd3d0e930a0ae0569da6437ec72c6275d8e` | 15,034 |
| `test/桌面应用/project-document.test.ts` | 等于 HEAD | `60857a9790734c57e43618ca956df4f8e3daab6f` | `654b383d8e77773f2d6b597c9e91a45a93c84b5a0afb79cc5566b0862d5d3e75` | 20,617 |
| `test/桌面应用/interface.test.ts` | 工作区已改（既有上下文） | `1e545367e512b3d2cf740ee531eefe2b9757e884` | `c01a060e94703e71e8e043995285ae113151a86b6afe9e24faac4bbd3805a575` | 358,766 |
| `test/桌面应用/e2e/main.mjs` | 工作区已改（既有上下文；逐文件授权） | `142e0f18d7701964053d97c6412d38809684c329` | `c48f2e5a0d4a84e91cfd5daf8386bdb793d3e4ac3868d2023063dc53e0c8474b` | 173,881 |
| `test/桌面UI/document-view.test.ts` | 等于 HEAD | `a7ad14456c3ff627fe5cf86f6ec54d7b7b27abf4` | `683954c016f6604fb6ffb975572aabaca861ff2478442552f8b8abbfdf314ef4` | 6,613 |
| `test/桌面UI/role-view.test.ts` | 等于 HEAD | `7cbccd4a00fca9cc55d42c5badd9e15c95999f72` | `6f98d780213a921cba13402e1f3fa58df8377d95fcd4be5f2f6ed067fc597e3d` | 5,035 |
| `test/桌面UI/phase4a-electron-smoke.mjs` | 等于 HEAD | `f311e2a2f7ba91f736e1d257247677f729bb97e0` | `7f4045274f7a0ec840342a736075923382b7aa0c9e3bcf8e3df3faa940d37421` | 69,601 |
| `test/桌面UI/phase4a-smoke-preload.cjs` | 等于 HEAD | `18ac5d7cf0dc6edaf8913e70ee2c1861696d7076` | `0ac84b5ce7fd73331c1572095622ed3b7a381cfff33ab2ac6688c28761b0457e` | 5,100 |
| `test/桌面UI/source-guard.test.ts` | 工作区已改（既有上下文） | `7e2e654cf4596c982130b7c843645932eb5c7d82` | `6c761264753e2c4e2b2110a53fd41fdd7326a4076423d157f4e69feec90a0e5b` | 12,002 |
| `test/测试/p1p7-document-integration.test.ts` | 等于 HEAD | `9a8d79d6560b8e8f699879bf7a59179ee9f25ea8` | `d1150aa1aab1cbc67314242673e966e7ba1746457a6320d53b98b03192c53683` | 9,184 |
| `test/测试/i18n-integration.test.ts` | 未跟踪（i18n 既有上下文） | `ab22f2b8e7dca485deefe5acde153d257975c776` | `57aa7ff82e18add312580b17dc2e7e10c6deae12b5f03d5c9e34b80bb68a0ba3` | 26,733 |
| `test/项目管理/shared/i18n.test.ts` | 未跟踪（i18n 既有上下文） | `26501c142dbd2c03bd6db6e135a0a29da8d46a3b` | `d8e7567797d9a324e1e2f9889b84758c81ac1b6df76f98b63c2c652f3bebac97` | 54,322 |
| `test/项目管理/shared/i18n-guard.test.ts` | 未跟踪（i18n 既有上下文） | `3358a1428f60b1d115e9a3af5aab39601938eb12` | `05003446fd8973b9954dd10593f8f5df284d68b3d733b8832a83338f949cf7e9` | 6,151 |

**目标文件状态汇总**：34 个条目中，**15 个等于 HEAD**、**13 个已被既有候选修改**、**5 个未跟踪**（i18n 既有上下文）、**1 个计划新增文件不存在**（`profile-docs.ts`）。候选阶段只应包含相对本表变化的路径；既有修改声明为「既有上下文」，不纳入本变更候选，也不为其背书。

---

## 三、边界/写集预检（只读）

`boundary-preflight.txt` 逐项核对团队计划 §三的 owner 覆盖，结论：

- `src/model/project-document.ts`、`src/service/project-document/{abstract/document-reader,impl/read-project-document,public/read-project-document}.ts`、`src/pipeline/project-document/read-project-document.ts`、`src/provider/project-document/{abstract/file-reader,impl/file-reader,public/file-reader}.ts` 均在权威 `角色卡/桌面窗口/boundary.md` Section 1 与 `boundary.yaml` 有精确单文件条目（md 第 12–19 行；yaml 第 18–39 行）。**不是边界缺口**。
- `app/desktop/` 目录、`app/preload.cjs` 单文件在桌面窗口 Section 1（md 第 10–11 行；yaml 第 12–15 行）。`app/desktop/project.ts`、`app/desktop/interface.ts` 在目录授权内；`app/preload.cjs` 本变更**不改**。
- `test/桌面应用/project.test.ts`、`project-document.test.ts`、`interface.test.ts`、`e2e/main.mjs` 各有精确单文件条目（md 第 29/35/41/43 行；yaml 第 69/87/105/111 行）。**`test/桌面应用/e2e/main.mjs` 是逐文件授权**；本变更只允许最小追加，不新建文件、不删除既有断言。
- **`test/桌面应用/` 无新建文件**：目录内 31 个 tracked 文件，`git ls-files -o --exclude-standard -- test/桌面应用` 为 0；与 HEAD 文件数一致（`boundary-preflight.txt`）。
- `app/renderer/` 是桌面UI 目录授权（`角色卡/桌面UI/boundary.md` 第 9 行；yaml 对应目录条目）。计划新增 `app/renderer/src/chat/profile-docs.ts` 在该目录内；S1 实测**不存在**，属正常起点，不需要重写边界。`test/桌面UI/` 是桌面UI 目录授权（md 第 19 行），默认只改既有文件，不新建默认。
- `src/common/shared/` 与 `test/项目管理/shared/` 是项目管理目录授权（`角色卡/项目管理/boundary.md` 第 7–8 行）；i18n messages 由项目管理唯一写入。
- `test/测试/` 在 `角色卡/测试/boundary.yaml` Section 1（第 7 行）；本角色可写。
- 边界文件哈希（只读核对，未修改）：`角色卡/桌面窗口/boundary.md` `1d12d0b4…`（SHA-256）/ `b13881b8…`（git）；`boundary.yaml` `569a0a20…` / `531a500a…`；`角色卡/桌面UI/boundary.md` `99578261…` / `e3812b73…`；`boundary.yaml` `e1af4d93…` / `0bf2a1cb…`；`角色卡/项目管理/boundary.md` `6f75bee4…` / `878e2a41…`；`boundary.yaml` `cfdc7408…` / `6540b1f9…`；`角色卡/测试/boundary.md` `9a2eba3f…` / `dbc5f154…`；`boundary.yaml` `3c8f7e0e…` / `81208f8d…`。完整哈希见 `boundary-preflight.txt`。
- **结论：本变更无角色/边界变更，无未覆盖路径；S1 边界预检通过（只读）。** 若实施发现 Section 1 未覆盖路径、需要新增 `test/桌面应用/` 文件、或需要改 Provider/preload/IPC/角色边界，停止并回报统筹；不自行改边界。

---

## 四、类型检查与渲染构建

| # | 命令 | 退出码 | 错误数 | 开始/结束（本地） | 原始日志 |
| --- | --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | **0** | **0**（`error TS` 0） | 21:49:24 → 21:49:25 | `typecheck.log` |
| 2 | `npm run typecheck:renderer` | **0** | **0**（`error TS` 0） | 21:49:28 → 21:49:29 | `typecheck-renderer.log` |
| 3 | `npm run build:renderer` | **0** | 0（仅有既有 chunk >500 kB 警告） | 21:49:30 → 21:49:32（Vite 自报 315 ms） | `build-renderer.log` |

- 三条命令均在仓库根、按 §1.1 的 PATH 与 Node v24.22.1 执行；日志含命令、起止时间与 `exit_code=`。
- `build:renderer` 输出到 `app/renderer/dist/`；`.gitignore` 第 9 行已忽略 `app/renderer/dist/`（`gitignore-dist-check.txt`），构建产物未进入 git 状态。产物 4 个文件及 SHA-256 见 `runner-facts.txt`（`index.html`、`index-Bp8JeL_K.js`、`index-BEwoJaDj.css`、`ans-studio-ans-icon-DOpmqMAU.png`）。
- 构建警告「Some chunks are larger than 500 kB」是既有构建配置现象，不是失败；本基线不据此改构建配置。

---

## 五、受影响套件基线（T2，不跑全量 T3）

> 命令在仓库根、按 §1.1 的 PATH/Node 执行；五条命令**串行**、互不并发；每个命令单独日志（含命令、起止时间、`exit_code=`、全部用例行与 `ℹ` 计数）。`test/桌面UI` 使用 `**/*.test.ts`，不含 `.mjs` 冒烟脚本；`test/桌面应用` 只跑三个精确受影响文件，不含 `e2e/main.mjs`（S6 项，见 §六）。

| # | 命令 | 退出码 | tests | pass | fail | skipped | todo | 耗时（Node 自报） | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `node --test --test-concurrency=1 test/桌面应用/project.test.ts test/桌面应用/project-document.test.ts test/桌面应用/interface.test.ts` | **0** | 152 | 152 | 0 | 0 | 0 | 33,103.3 ms | `directed-desktop-app-targets.log` |
| 2 | `node --test --test-concurrency=1 "test/桌面UI/**/*.test.ts"` | **0** | 195 | 195 | 0 | 0 | 0 | 2,315.1 ms | `directed-desktop-ui.log` |
| 3 | `node --test --test-concurrency=1 test/测试/p1p7-document-integration.test.ts` | **0** | 2 | 2 | 0 | 0 | 0 | 104.8 ms | `directed-p1p7-document-integration.log` |
| 4 | `node --test --test-concurrency=1 test/测试/i18n-integration.test.ts` | **0** | 8 | 8 | 0 | 0 | 0 | 394.0 ms | `directed-i18n-integration.log` |
| 5 | `node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts test/项目管理/shared/i18n-guard.test.ts` | **0** | 43 | 43 | 0 | 0 | 0 | 293.2 ms | `directed-i18n-unit.log` |

**合计：400 tests / 400 pass / 0 fail / 0 skipped / 0 todo；五条命令全部 exit 0。**

### 5.1 失败分类

- **无失败、无取消、无跳过、无 todo。** 未观察到既有 Windows symlink `EPERM`、桌面时序偶发或环境跳过。
- 与历史基线相比，本轮受影响套件全绿；这不表示本变更已实施或验收通过（本变更尚未实施，无候选代码）。
- `test/装配` / `test/编排` 未运行：受影响测试只从 `src/common/编排/{handback,watchdog}.ts` 导入**类型**（`import-scan.txt`），未导入 `test/装配`/`test/编排` 的测试文件；目标写集也不含这些产品模块。若 S6 发现实际导入扩大，再补精确文件并记录。
- `test/桌面UI/phase4a-electron-smoke.mjs` 未在 S1 运行；它属于 S6 桌面UI 受控冒烟，不属于本 T2 基线命令。

---

## 六、真实 Electron 基线（可选 S1 项）

| 项 | 值 |
| --- | --- |
| 命令 | `./node_modules/.bin/electron --user-data-dir=<fresh temp> test/桌面应用/e2e/main.mjs` |
| Electron | v44.7.0 |
| userData | 全新临时目录（路径见 `e2e-run-meta.txt`，未复用既有用户数据） |
| 项目根 | 仓库根 `C:\Users\51054\Desktop\work\ans-studio`（`ANS_E2E_PROJECT` 缺省） |
| 输出目录 | `角色卡/测试/docs/change/2026-10-23-role-root-docs-display-baseline-evidence/e2e-output/` |
| 开始/结束 | 21:50:50 → 21:52:08（本地，约 78 s） |
| 退出码 | **0** |
| 结论 | `report.txt`：**`E2E_PASS=true`**、`E2E_FAILURES=`（空）、`E2E_DONE=1` |
| 截图/报告 | `e2e-output/report.txt` 与 `00-titlebar.png` … `15-anchor-reanchor.png` 等 |
| 原始日志 | `e2e-main.log` |

- 本次 e2e 验证的是**现有 Windows 行为**：导入项目、点角色、聊天、拒绝写、资料面板、恢复/交接/诊断等既有检查点全部通过。
- **不把正文读取当通过**：本变更尚未实施，e2e 不包含根文档列表/点击/`UNSUPPORTED_ENVIRONMENT` 的新断言；Windows 上也不能用「文件存在」冒充「正文可读」。
- 日志中的 `修复探针：发送异常原文` 是 e2e 自身故意注入的发送异常探针（用于验证恢复路径），最终 `E2E_PASS=true`；`console-message arguments are deprecated` 是 Electron 既有弃用警告，均不是失败。
- 本项为可选基线；未运行 POSIX 实读。POSIX/macOS/Linux 正文读取必须在 S6 单独执行并单独记录，当前环境不具备。

---

## 七、残余、风险与边界声明

1. **本变更尚未实施**：S1 只有基线、环境、哈希与受影响套件结果；没有根文档索引/候选/`RoleView`/渲染层代码。不得把本记录当作实施、候选或验收通过。
2. **客户实施授权未给**：外部验收标准 v1 自述「闸门 0/1/2 已确认、实施授权未给」；团队计划文件头/§1.5 仍写「闸门 2 未确认」。测试角色不裁决状态差异，也不改写任何管理文档；在实施授权与 S1 出口条件齐备前不启动 S2。
3. **Windows-only 基线**：当前环境为 Windows 11；POSIX 实读未执行。S6 必须把 Windows fail-closed（列名 + `UNSUPPORTED_ENVIRONMENT` + 不读字节）与 POSIX 实读（正文/字节/mtime）分开记录；不能用 Windows 结果替代 POSIX。
4. **混合未提交上下文**：i18n、目录 v3、治理写卡、验收返工路由四项既有变更均已验收但未提交；共享文件（`interface.ts`、`project.ts`、`ProfilePanel.tsx`、`DocumentView.tsx`、`document-view.ts`、`types.ts`、`drawer-store.ts`、`phase4a.css`、`interface.test.ts`、`e2e/main.mjs`、i18n messages）已被修改。本变更任何实施只能相对本基线增量，不得混入其他变更的 hunk，也不得与其他变更并发写同一文件。
5. **工作树计数差异**：任务说明约 228 条；实测写证据前 229 条，写本记录前 232 条（含本证据目录与两份外部管理文档），写本记录后 233 条。`src app test` 的 129 个改动/新增文件在基线期间逐字节稳定；若 S2 开始前上游继续变化，以 `worktree-freeze-all-snapshot.sha256` 复算并重新冻结。
6. **外部管理文档与另一变更**：`docs/acceptance/role-root-docs-display-criteria-v1.md`（784 行；SHA-256 `12981ed4…`）在基线期间由独立验收写入；`docs/communication/2026-10-23_intent_artifact-observation-race.md`（46 行；SHA-256 `3ee1f45a…`）是另一个 T2 小变更（`flow_step_update` 的 artifact.observed 时序）的意图记录，明确在本角色根文档 S1 基线完成后实施、基线期间不改 `src/`。两者都不是测试角色产物，测试角色不评价其内容；后者也不是本变更的实施授权。S2 前必须用冻结快照复算；若该小变更已开始写 `src/`，先重排窗口/重新冻结，不把其改动混入本变更。
7. **`app/preload.cjs` / `app/main.ts` 已相对 HEAD 修改**（既有上下文）。本变更不得再改 preload/main，不得新增 IPC 通道；S6 应以基线哈希对照确认零增量。
8. **`documents` 数量变化是实施预期**：根文档加入 Service refs 后，「查看已列文档」清单会从既有条目增加到含 3 条根文档；既有 Phase 4A/e2e 断言可能需更新，必须说明「新增根文档，不是回归」，且既有 `documentId` 前缀不变。
9. **`test/桌面应用/` 逐文件授权**：目录内 31 个 tracked 文件、0 个未跟踪，无新建文件。S2–S6 只允许改 `project.test.ts`、`project-document.test.ts`、`interface.test.ts`、`e2e/main.mjs` 四个既有文件；确需新文件必须停止回报。
10. **`test/桌面UI/` 目录授权**：默认只改既有 `document-view.test.ts`、`phase4a-electron-smoke.mjs`、`phase4a-smoke-preload.cjs`、`source-guard.test.ts` 等；计划新增 `app/renderer/src/chat/profile-docs.ts` 在 `app/renderer/` 目录内，S1 实测不存在是正常起点。
11. **T2 不跑全量 T3**：本基线只跑受影响单测/层测试、跨层集成、typecheck/build 和真实 Electron；若实施触发升档条件（改 Provider/读取模型/边界/权限、证据不足等），按团队计划升档，不降档。
12. **构建/Electron 既有警告**：Vite chunk >500 kB 警告、Electron `console-message` 弃用警告均为既有现象；不影响 exit 0，不据此改构建配置或产品代码。
13. **未使用真实 `.env`/凭据/在线模型**：e2e 使用 `ANS_E2E_OUTDIR` 下的临时 `e2e-pi.env`；未读取/打印/写入仓库真实 `.env` 或任何密钥。
14. **未写目标项目**：`ans-gateway` 未访问、未写入；本基线不建立目标项目快照（本变更不写它）。
15. **无 task_ops**：本项目无 `.ans/project.json`；不伪造任务令牌、锁、审批或机器预检；证据以哈希、原始输出、diff/status 为准。
16. **不提交/不推送/不合并/不发布**：本记录与证据目录不进入 git 暂存；未 commit、未 push。

---

## 八、证据边界声明

- **只写测试角色 Section 1 允许的路径**：本记录在 `角色卡/测试/docs/change/`；证据在 `角色卡/测试/docs/change/2026-10-23-role-root-docs-display-baseline-evidence/`。未改产品源码、测试源码、角色卡、边界、YAML、团队计划、方案、验收标准、沟通记录、目标项目或构建配置。
- **未改既有断言**：受影响套件按原文件运行；未为保绿修改任何断言或夹具。
- **未新建 `test/桌面应用/` 文件**：目录 tracked 31、untracked 0。
- **未写 `src/provider/project-document/**`**：status/diff 均为空。
- **未使用真实凭据**；未访问在线模型。
- **外部文件声明**：`docs/acceptance/role-root-docs-display-criteria-v1.md` 由独立验收在基线期间写入，非本角色产物；已只读记录哈希，不作为本角色证据背书。
- **并发上下文**：工作树中的 i18n、目录 v3、治理写卡、验收返工路由改动均为他角色既有产物，非本角色写入，不纳入本变更候选。

---

## 九、证据文件

目录：`角色卡/测试/docs/change/2026-10-23-role-root-docs-display-baseline-evidence/`

| 文件 | 内容 |
| --- | --- |
| `environment.txt` | 记录时间、OS/Shell、HEAD/tree、完整 `git status --short`、暂存为空、Node/npm/Electron/package 事实、计数 |
| `target-hashes.txt` / `target-hashes-end.txt` / `target-hashes-diff.txt` | 34 个目标文件/计划新增文件的 `git hash-object` + `sha256sum` + 字节 + HEAD 关系；收尾复核 diff 为空 |
| `worktree-start-src-app-test-files.txt` / `worktree-start-src-app-test-hashes.txt` / `worktree-start-src-app-test-snapshot.sha256` | `src app test` 129 个改动/新增文件清单、逐文件 SHA-256、整体快照哈希 `af53fea6…` |
| `worktree-end-src-app-test-files.txt` / `worktree-end-src-app-test-hashes.txt` | 基线结束后 `src app test` 复核（与起点 diff 为空） |
| `worktree-start-all-files.txt` / `worktree-start-all-hashes.txt` / `worktree-start-all-snapshot.sha256` | 全工作树 689 个既有改动/未跟踪文件清单与整体快照 `af1a98a6…`（不含本证据目录） |
| `worktree-freeze-all-files.txt` / `worktree-freeze-all-hashes.txt` / `worktree-freeze-all-snapshot.sha256` | 含两份外部管理文档的冻结快照 691 个文件、整体哈希 `ace00e17…` |
| `worktree-start-status-readable.txt` / `worktree-end-status-readable.txt` / `upstream-freeze.txt` | 可读 `git status` 起点/终点；四项既有候选分类与快照摘要 |
| `upstream-drift-observation.txt` | 外部验收标准与外部沟通记录的观察、哈希、行数；`src app test` 稳定性；沟通记录哈希 |
| `boundary-preflight.txt` | 桌面窗口/桌面UI/项目管理/测试边界条目、Provider 零改动、`test/桌面应用` 无新建、e2e 逐文件授权、边界文件哈希 |
| `runner-facts.txt` | Node/npm/Electron/package、方案 v1/团队计划/测试角色卡与边界的 SHA-256/blob/行数、测试文件计数、构建产物与 SHA-256 |
| `gitignore-dist-check.txt` | `app/renderer/dist/` 已被 `.gitignore` 忽略 |
| `typecheck.log` / `typecheck-renderer.log` / `build-renderer.log` | 三条类型/构建命令原始输出（含起止时间、`exit_code=`） |
| `directed-desktop-app-targets.log` | 三个桌面窗口受影响测试原始输出（152/152/0/0） |
| `directed-desktop-ui.log` | `test/桌面UI/**/*.test.ts` 全部 25 个文件原始输出（195/195/0/0） |
| `directed-p1p7-document-integration.log` | `p1p7` 跨层集成原始输出（2/2/0/0） |
| `directed-i18n-integration.log` | `i18n-integration` 原始输出（8/8/0/0） |
| `directed-i18n-unit.log` | `test/项目管理/shared/i18n{,-guard}.test.ts` 原始输出（43/43/0/0） |
| `affected-suites-summary.txt` | 五组套件计数、退出码、失败分类、e2e 摘要、未跑套件理由 |
| `import-scan.txt` | 受影响测试的 `装配/编排` 导入核对（仅类型导入，无对应测试文件依赖） |
| `e2e-main.log` / `e2e-run-meta.txt` / `e2e-output/report.txt` / `e2e-output/*.png` | 真实 Electron 运行日志、fresh userData 元数据、报告 `E2E_PASS=true`、截图 |
| `stability-check.txt` / `worktree-start-src-app-test-snapshot.sha256` | 基线稳定性核对（清单/hash diff 均空） |
| `sha256.txt` | 本证据目录全部文件与本记录的 SHA-256（收尾生成） |

---

## 十、证据哈希

- 收尾时对 `2026-10-23-role-root-docs-display-baseline-evidence/` 内全部文件与本记录生成 `sha256.txt`（`sha256sum` 原始输出，含本记录文件本身，不含 `sha256.txt` 自身）。
- 本记录与证据文件的身份以该清单为准；调用方回报中的 SHA-256 取自该清单。
- 关键原始证据（同样在清单中）：`environment.txt`、`target-hashes.txt`、`worktree-start-src-app-test-snapshot.sha256`、`worktree-freeze-all-snapshot.sha256`、`affected-suites-summary.txt`、`stability-check.txt`、`e2e-output/report.txt`。

---

**状态再次声明**：本文件是 **S1 实施前基线记录（baseline complete）**，不是候选、不是实施、不是验收报告；不宣布本变更或任何变更验收通过；**客户实施授权未给**；未 commit、未 push、未合并、未发布；未改产品/测试源码、角色卡、边界、方案、团队计划或验收标准；未写目标项目。
