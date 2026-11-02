---
id: acceptance-return-card-d1-regression
type: change
title: acceptance return card D1 跨层回归与 T2 证据
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: verified
related: [acceptance-return-card-b0-baseline]
events:
  - date: "2026-11-02"
    kind: created
    summary: 记录 D1 候选哈希、四组受影响套件、双 typecheck/build 与官方 phase4b Electron E2E 结果
---

# D1 跨层回归与 T2 证据：acceptance return card（验收结果返回卡）

- **任务 ID / flowId**：`2026-11-02-acceptance-return-card` / `acceptance-return-card`
- **记录角色**：测试（worker，独立角色上下文）
- **日期 / 节点**：2026-11-02 / 团队计划 §五 **D1（跨层回归）**，入口为 A5 退出（A5 基线修复后官方 phase4b 独立复跑 PASS 64/64）
- **状态**：**D1 完成——已执行的检查全部通过，新增确定性失败 0**。本记录只记录事实与证据，**不判验收、不判通过/返工**；最终结论由独立验收 E2 按 V1 判定。
- **候选**：HEAD `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9`（分支 `feat/flow-improvements-wave1`）+ 工作树 A1–A5 未提交改动；19 个产品/测试文件与本任务写集**精确匹配**，无写集外产品/测试改动，`package.json` 未改，staged 空。
- **结果摘要**：`npm run typecheck` / `typecheck:renderer` / `build:renderer` 均 exit 0；四组受影响套件 **116 tests / 116 pass / 0 fail / 0 skipped / 0 todo**；官方 `phase4b-electron-smoke.mjs` 自跑 **PHASE4B_SMOKE PASS 64 checks / 0 failures**（exit 0，console 0，CSP 违规 0，13 张截图）；未 commit/push、未接触客户。

---

## 一、候选身份与写集闭合

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| HEAD | `git rev-parse HEAD` | `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9` |
| 分支 | `git branch --show-current` | `feat/flow-improvements-wave1` |
| 排他写集 | `git -c core.quotePath=false status --porcelain -- src app test` | 19 条：11 个产品文件（A1–A4）+ 7 个修改测试 + 1 个新增测试（A4/A5） |
| 写集闭合 | 实测排序路径 vs 期望清单 `diff` | **`WRITE_SET_MATCH=exact`（19/19）**，无写集外产品/测试改动 |
| 暂存区 | `git diff --cached --name-only` | **空** |
| `package.json` | `git diff --stat -- package.json` | **空**（未改） |
| 任务配置 | `test -f .ans/project.json` | **不存在**（无 task_ops） |
| `uiux-v2` | `git status --porcelain -- test/桌面应用/e2e/uiux-v2.mjs` | **空**（未修改） |
| `main.mjs` | `git status --porcelain -- test/桌面应用/e2e/main.mjs` | **空**（未修改） |

候选哈希清单（逐文件 `git hash-object` + `sha256sum`；完整机器可读清单 `13-candidate-manifest.tsv`，20 行 / SHA-256 `738302086dd67ee26356133a2d2319f02682b863d4889e7c63cbec9beb1e810d`）：

| 文件 | git hash-object | SHA-256 |
| --- | --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | `4a556b41db0892c8acb049e140fd046d451bd817` | `2bea07fca5adba6bec5a670c99101618c9f568969b998e03340e8596dd295283` |
| `src/common/shared/i18n/messages/en-US.ts` | `b30efc9d48b623698fb182ad0ef8098ebeeea753` | `48e35b824161f5011cdac3696e8d06a6c4285ca5191371cd427bcaf3321b3eb3` |
| `app/renderer/src/chat/role-view.ts` | `b8789c0990765263b6dc6b0c8d102a81f3e199e9` | `05a2225c50b21b4c752564053d1b5947597c4cb4d3b497b93f7e40fd21465843` |
| `app/renderer/src/chat/decision-dialog.ts` | `1548f1d452ce84b2796687afe974e4280f2730fc` | `c62d44b4e34308255ed8217539a4ec3f238429512cfd556c223f7f6c3b4d1679` |
| `app/renderer/src/shell/ReportCard.tsx` | `1ca05b64faef4d1b532ada2788262d6bc751018f` | `787db0208bc370c0c3f5d61348010c21fa413a9f3b84be7cbce48a04e6956285` |
| `app/renderer/src/chat/DecisionDialog.tsx` | `1301ca0f3594a7f079d7fbaf352ec2473632f749` | `f7969e3f1e2f112a3d7b8ec9964ddaa258460f489251a3aafaa22a514e4e4355` |
| `app/renderer/src/shell/shell.css` | `d5c469fc7964ffcc45c05d2240704b7079d64f24` | `12bf211c4a1a18e63c64e11d14956101ecf892efc74a0ea7eeff23d7806d6fb9` |
| `app/renderer/src/shell/phase4a.css` | `7c6ebdf1b72dd96571337f6b8cd118e2e3de1232` | `79fe070362c38ae3e0009a9d5fa8b6f50becaa1278eabdbc3ef9568b22b20cae` |
| `app/renderer/src/shell/phase4b.css` | `87cceeaa7c9acce96ad2a600e55828043a4defc9` | `0c05f4d4dc0ab743ba2916a75209fb3fa07dd60fb034ba418d2ab36fcc00fc60` |
| `app/desktop/session.ts` | `10eb2ce55c10845a05ab02b1c08e7e82bd1b78f6` | `73b1f70e0e567c59b6d7f6c684f62a55c3997f624da360b34ef065f605a4c4ce` |
| `app/desktop/customer-input.ts` | `847ed040f30e510d5fb60dd08201e8ec5ac5033a` | `059f080eb66758ced158c40fccac80f2202b35187b601ddc0ba28c6b07679d2d` |
| `test/项目管理/shared/i18n.test.ts` | `e6e99110ea923c4b4e7bd2d7c83a72d732d86ef4` | `44dba1269878500963dcea81be0c4a38b1756c1034de76e41a27de89d12e6ed1` |
| `test/桌面UI/role-view.test.ts` | `cb0fb324feb561ce33d923bef52b263a765b9b52` | `a8f853e4b72ead394fa2d54837b02c2a8c58165378c0418cea5f6d7fcac2f5ff` |
| `test/桌面UI/decision-dialog.test.ts` | `22049da0c6b8e67aef4680c6ca54de029a3c8ab7` | `50c7797220c2de27f457ac1678fe84c6c63948f429ac3e142282add38a72e062` |
| `test/桌面UI/dialog-a11y.test.ts` | `4c3be9bf59b3e5b46562d2d140c6d48ff69b95bf` | `7ac0d1c1f71e06d5c8cab65ba6f95db80f02c430bdfacfb937e5d2966d29ff35` |
| `test/桌面UI/source-guard.test.ts` | `b2ed60fa0c4d923acedd97eebac20e9a197b4f2f` | `52cbc7a178183900301683f8853dac279e461edb2d38e32703d519ed750f4d67` |
| `test/桌面UI/theme-tokens.test.ts` | `4aedc3a474019ca400c66ead7e821933e36291f0` | `79a4fe443333e8d363ea5965ed0d05e3ed89dcbc9abdb7eca669b3fb699a8a1f` |
| `test/桌面UI/phase4b-electron-smoke.mjs`（A5） | `580745d1d0ffed4ce6eb5221ebf9a3892e97e7e5` | `bc6d1c7eb770023494ad530b1386c35320322bd1a98befd02e026f07b2a86daf` |
| `test/桌面应用/acceptance-return-card.test.ts`（新增，B-1） | `6037d807dda104c0ab00a7009f9fe5a5b01a8fb1` | `0c008cc574563a0a60a6f48b392b471b3464e8b6bf6426adc8123749fd62e9b4` |

工作树整体 `git status --short` 中另有 7 个既有治理/角色记录修改（沟通/策划/调度 memo、桌面窗口 B-1 三文件、桌面UI api-spec/memo）与各角色未跟踪的 A1–A5/B0 证据文档；这些不属于产品候选。D1 新增仅测试角色证据（`角色卡/测试/docs/change/` 内），未写其他路径。

---

## 二、输入与 A5 结论核对

| 项 | 实测 | 与派发/冻结值 |
| --- | --- | --- |
| 团队计划 | 429 行 / `05a94dd054ac408e7a33c29f37cb130aa1de2675547af564abc46ef146bfe9b6` | 一致 |
| V1 | 926 行 / `f0cb94655b3d8ec50196fee7167b2267d59f4213c1f018dc0e32068eb689996b` | 一致 |
| P1.2 | 873 行 / `51057be9bc38575b86711d2c3d98120b7a42f4d75bbb7ece4c75f32796c0f2b2` | 一致 |
| A5 harness | `test/桌面UI/phase4b-electron-smoke.mjs` **1209 行 / `bc6d1c7eb770023494ad530b1386c35320322bd1a98befd02e026f07b2a86daf`** | 一致 |
| A5 记录 | `角色卡/桌面UI/docs/change/2026-11-02_acceptance-return-card-A5-baseline-fix.md` **86 行 / `c5bbe48d7ddd4324688a081e4d5675cb7fefb8cd6631ddf7772d97124ee3665e`** | 一致 |
| A5 断言块指纹 | 326 行 / `b9cac689649ad593ebeec5c7d746eac9e400a7fbae5b0fe2af6fb3742cd82bb0`（A5 记录） | 本次未改该文件，指纹不变 |
| `uiux-v2` | 1554 行 / `f38d919212db6a3252b498922b62ed3f5c2ef54f04c99076bc497d8aa17b8f67`；`git status` 空 | 未修改、未运行 |

---

## 三、门禁命令（typecheck / build）

均在 worktree 根目录执行；每条日志含 command/cwd/start/end/exit_code 与原始输出。

| # | 命令 | 起止（+08:00） | 退出码 | 结果 |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck`（`tsc --noEmit`） | 16:22:14–16:22:16 | **0** | 0 类型错误 |
| 2 | `npm run typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`） | 16:22:20–16:22:21 | **0** | 0 类型错误 |
| 3 | `npm run build:renderer`（`vite build --config vite.config.ts`） | 16:22:24–16:22:26 | **0** | vite 8.3.4，2793 modules，built in 410ms |

构建仅出现两条非致命警告（与 B0 相同）：chunk >500 kB 提示、`decision-center-store.ts` 的 `INEFFECTIVE_DYNAMIC_IMPORT`。构建产物写入被忽略的 `app/renderer/dist/`（`.gitignore:9`；`git ls-files app/renderer/dist` = 0），不是产品候选；E2E 使用本次构建的 `app/renderer/dist/index.html`（597 B / `833b1034467e5629d422806962e8bede587f458a195883cf624586ef34dbc006`）。

产物清单：

| 文件 | 字节 | SHA-256 |
| --- | --- | --- |
| `index.html` | 597 | `833b1034467e5629d422806962e8bede587f458a195883cf624586ef34dbc006` |
| `assets/index-HVgRWhIZ.js` | 1,300,357 | `e9e23dea5aa28c1cef79de9222cf73d869b4fc91daae27a8012da4aa12d1781f` |
| `assets/index-76pNUf-s.css` | 150,740 | `a1c21c57b6c8ab9a0e81ac7c198b06038f9887151b69813970c0b6aceb73f4a6` |
| `assets/ans-studio-ans-icon-DOpmqMAU.png` | 55,057 | `ff88e313c9c6a41fa94f5e34b9e1798169ea7ffece2404e5c9fc6474f788d32c` |

---

## 四、受影响套件（方案 §10.3）

全部 `node --test --test-concurrency=1`，文件清单与派发一致。

| # | 套件（文件组） | 起止（+08:00） | 退出码 | tests | pass | fail | cancelled | skipped | todo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | `test/桌面UI/report-view.test.ts`、`role-view.test.ts`、`decision-dialog.test.ts`、`dialog-a11y.test.ts`、`source-guard.test.ts`、`theme-tokens.test.ts` | 16:21:51–16:21:52 | **0** | 47 | **47** | 0 | 0 | **0** | **0** |
| B | `test/项目管理/shared/i18n.test.ts`、`i18n-guard.test.ts` | 16:21:55–16:21:56 | **0** | 14 | **14** | 0 | 0 | **0** | **0** |
| C | `test/桌面应用/acceptance-return-card.test.ts`、`acceptance-evidence.test.ts`、`optional-acceptance.test.ts` | 16:22:00–16:22:03 | **0** | 19 | **19** | 0 | 0 | **0** | **0** |
| D | `test/runtime-core/tool-display.test.ts`、`report-provenance.test.ts` | 16:22:06–16:22:09 | **0** | 36 | **36** | 0 | 0 | **0** | **0** |
| **合计** | — | 16:21:51–16:22:09 | **0** | **116** | **116** | **0** | **0** | **0** | **0** |

与 B0 基线对照（B0 记录 `2026-11-02_acceptance-return-card-B0-baseline.md`）：

- 桌面UI：36 → **47**（+11，均为本任务新增/更新断言）。
- 项目管理 i18n：13 → **14**（+1）；精确计数由 `ui 907 / 1531` 更新为 **`ui 921 / main 559 / shared 62 / preferences 3，总计 1545`**，与方案 §4.4/团队计划 §4.3 预期一致；守卫 `scanned=131 allowlisted=20 violations=0`。
- 桌面应用：9 → **19**（新增 `acceptance-return-card.test.ts` 10 例；`acceptance-evidence`/`optional-acceptance` 只读回归仍全过）。
- runtime-core：36 → **36**（不变，投影/报告快照前提全过）。
- 无新增 skip/todo；无测试被删除/弱化。

---

## 五、官方 Electron E2E（phase4b）

| 项 | 值 |
| --- | --- |
| 命令 | `node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs app/renderer/dist/index.html C:/Users/51054/AppData/Local/Temp/ans-phase4b-d1-20261102` |
| cwd | worktree 根目录 |
| 起止（+08:00） | 16:22:35–16:22:50 |
| 退出码 | **0** |
| 结论 | **`PHASE4B_SMOKE PASS 64 checks / 0 failures`** |
| console errors | **0**（`CHECK zero console errors=true []`） |
| CSP | 严格 meta、零内联脚本；`CHECK zero csp violations=true []` |
| 截图 | **13 张**（1360×860、960×620、200% 段；含 A5 4 张：`a5-acceptance-handback.png`、`a5-acceptance-delivery.png`、`a5-acceptance-dialog-200pct.png`、`a5-acceptance-report-200pct.png`）；未设置 DEBUG 覆盖层；**不录屏** |
| `report.json` | 64 checks / 0 failures / 13 screenshots / console `[]` / csp `[]`；SHA-256 `07a3c90047a80603a924fafb8ce72d269a349379527155e3ecd139801445e60e`（与 A5 记录的 report.json 哈希相同） |
| 原始日志 | `09-e2e-phase4b.log`（80 行 / `0495fe51d4fca882366e00711816795ed4055ab57609700ea1f700983e543765`） |
| 截图/产物清单 | `10-e2e-artifacts-manifest.txt`（14 行：13 PNG + report.json / `631ba67c39afd9b385a4c4496c7c40dadc3d2fc1a004e9c5b3ee251e38762b93`）；文件在 `e2e-phase4b/` |

A5 专项检查（官方运行全部 true，11 项）：

- `A5 verifier handback: identity/full text/evidence/no fold`
- `A5 verifier handback cold color`
- `A5 verifier blocked: identity kept + danger color priority`
- `A5 ordinary report: no acceptance style; preview + report-complete retained`
- `A5 delivery: acceptance sections + ordinary class unchanged (P1-ARC-02)`
- `A5 P1-ARC-01 unsupported verifier delivery report has no acceptance classes`
- `A5 acceptance dialog: localized badge/report/path/preview visible/options`
- `A5 acceptance dialog cold color`
- `A5 200% acceptance dialog no horizontal overflow`
- `A5 high-risk acceptance danger color priority`
- `A5 200% verifier report no horizontal overflow`

说明：本次截图是新运行产物，PNG 哈希见 `10-e2e-artifacts-manifest.txt`；`report.json` 的检查结果哈希与 A5 记录一致，检查集合与 64/0 结论一致。

---

## 六、失败清单与分类

- **已执行检查的失败数：0**（三条命令、四组套件、官方 phase4b 均 0 fail / 0 skip / 0 todo）。
- **新增确定性失败：0**。
- 本 D1 四组套件与 E2E **未出现** Windows symlink/EPERM 类基线失败。
- **`uiux-v2` 既有基线失败**（`role geometry 1360` 与未注册 IPC handler `session:role-states`/`network:get-state`/`preferences:get`/`background-tasks:list`，见 A5 记录 §四）不在本次写集：文件未修改（`git status` 空）、D1 未运行该 harness，**不计入本次新增失败**。若后续需要该 harness，须另行修复/授权。
- 未修改任何断言以保绿；未跳过失败用例；未把 skip/todo 计为通过。

---

## 七、T2 证据包摘要

| 项 | 内容 |
| --- | --- |
| 候选哈希 | HEAD `5a35908…` + §一 19 文件 `git hash-object`/`sha256sum`；清单 `13-candidate-manifest.tsv`（`73830208…`） |
| 改动路径 | 11 个产品文件（A1 i18n 2 + A2/A3 渲染 7 + A4 桌面 2）+ 8 个测试文件（7 修改 + 1 新增）；§一 |
| 计数 | 四组套件 116/116 pass；0 fail/skip/todo；分组计数见 §四 |
| 命令 / 环境 / 时间 | Node v24.22.1 / npm 11.19.1；Windows 11 Pro 10.0.26300 / Git Bash；各命令起止与退出码见 §三–§五 |
| E2E | 官方 phase4b PASS 64/64，exit 0，console/CSP 0，13 截图；§五 |
| 证据路径 | 本目录 `02`–`13` 日志/清单 + `e2e-phase4b/`（13 PNG + report.json） |
| 写集外产品/测试改动 | **无**（19/19 精确匹配；`package.json` 未改；staged 空） |
| 全量回归 | **未做**；按 T2 默认口径（团队计划 §1.2/§7.4、V1 §2.3），本次变更未触发升档条件 |
| commit/push | **未 commit、未 push**；HEAD 未前进 |

---

## 八、限制与未做

- 本记录**不是验收结论**；AC-1–AC-14 与 F3/F5/Q5-A/O2 的判定由独立验收 E2 按 V1 作出。
- 未运行 T3 全量回归（T2 默认）；未运行 `uiux-v2` 与 `test/桌面应用/e2e/main.mjs`（后者未修改、非 D1 必跑项）。
- 未启动应用做人工浏览；E2E 证据来自官方 phase4b harness 的真实 Electron 运行。
- 未修改产品/其他测试/角色卡/边界/治理 docs；未 commit/push；未接触客户。

---

## 九、证据清单

原始日志/清单目录：`角色卡/测试/docs/change/2026-11-02_acceptance-return-card-D1-evidence/`

| 文件 | 行数 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| `01-candidate.txt` | 121 | 10,324 | `ebbf9c1fe178911e5aafbd57a2be9909719c3480e8a24d0348b89296a9f08b79` |
| `02-npm-run-typecheck.log` | 12 | 295 | `6b90d6e3b5866f8ffe564d1996b55a07bcbcdb0453248fa9a77af67417cf704a` |
| `03-npm-run-typecheck-renderer.log` | 12 | 334 | `8d54201ad7fa2974d3afa7498e45f926be4719da3ec3894004710952d1223bbd` |
| `04-npm-run-build-renderer.log` | 30 | 1,643 | `81b90197807208f0c93cbf3aac1647c1832a0fd2568e0d4feebd98d046d8f8f4` |
| `05-suite-desktop-ui.log` | 63 | 5,423 | `4a3ab39137e96d640e3dae030f3ab6f6f77bee6de6ec043e55e6d8af8ca1201b` |
| `06-suite-i18n.log` | 31 | 1,789 | `cb6fb588ba4d6b1d08b3662a72d06697dcbce44b85c8c4abfe342142845aa6ab` |
| `07-suite-desktop-app.log` | 35 | 2,601 | `f9526337cb30c341913f6f2bf618a4541117272abf7ec81da53e6a559cd57a46` |
| `08-suite-runtime-core.log` | 52 | 4,690 | `645e125f262a14203d377a9ce33306da8606c3eb4c4b7a3ce92aed257e065b73` |
| `09-e2e-phase4b.log` | 80 | 6,799 | `0495fe51d4fca882366e00711816795ed4055ab57609700ea1f700983e543765` |
| `10-e2e-artifacts-manifest.txt` | 14 | 2,650 | `631ba67c39afd9b385a4c4496c7c40dadc3d2fc1a004e9c5b3ee251e38762b93` |
| `11-post-run-verification.txt` | 157 | 10,553 | `c6d59bfda5d49b6879a6d87d56628f1e634f28316aa4e506c9b8c39fa7b432be` |
| `12-expected-write-set.txt` | 19 | 695 | `7b21cbdd16a72c0608c48371f0eec24fc5f7fc2e02a83b9aab1b2884ab5aa70c` |
| `12a-actual-write-set.txt` | 19 | 695 | `7b21cbdd16a72c0608c48371f0eec24fc5f7fc2e02a83b9aab1b2884ab5aa70c` |
| `13-candidate-manifest.tsv` | 20 | 2,848 | `738302086dd67ee26356133a2d2319f02682b863d4889e7c63cbec9beb1e810d` |

`e2e-phase4b/`：13 张 PNG + `report.json`（14 文件，逐文件哈希见 `10-e2e-artifacts-manifest.txt`）。
