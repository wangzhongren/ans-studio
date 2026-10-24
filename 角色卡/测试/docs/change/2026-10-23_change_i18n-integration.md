# I9 集成/真实 Electron 验证记录：i18n（T2）

- **任务 ID**：`2026-10-23-i18n`（变更 A，风险档位 **T2**）
- **记录角色**：测试（Testing worker，独立角色上下文）
- **日期**：2026-10-23
- **阶段**：I9「Reduce（集成）」的跨层集成与真实 Electron 部分（团队计划 §5.1 I9、§6.2/§6.3/§6.4；标准 `docs/acceptance/i18n-criteria-v1.md` P1–P12）
- **状态**：**verified-by-tests-only（2026-10-23 最终候选复跑；三项阻塞已关闭；不是独立验收通过）**。此前 `blocked-by-tests` 的原始记录保留为历史（§二–§六），最终复跑见 §九。
- **最终复跑**：HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（复跑开始时工作树 199 条 status、staged 空；提交候选文件复跑前后哈希一致）；证据 `角色卡/测试/docs/change/2026-10-23-i18n-integration-evidence/rerun-final/`；结论与残留见 §九。
- **候选身份**：HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（tree `1149238a…`）；工作树含 i18n B0–B4、目录 v3 与治理写卡闭环的既有上下文。`app/renderer/dist/` 与当前源码的构建产物**逐文件一致**（`build==dist`，dist 为被忽略构建产物、非候选）。
- **输入**：i18n 方案 v1、标准 `i18n-criteria-v1.md`、团队计划 I9；B0–B4 记录（`角色卡/项目管理/docs/change/2026-10-23_change_i18n-b0.md`、`b1-b2-keys`、两批 key supplement、`b3`、`b4-metadata`、`b4-desktop`、`b4`、`allowlist-tighten`；`角色卡/测试/docs/change/2026-10-23_change_i18n-b4-consumers.md`）。

---

## 一、新增跨层集成测试（不启动 Electron）

文件：`test/测试/i18n-integration.test.ts`（`sha256` = `57aa7ff82e18add312580b17dc2e7e10c6deae12b5f03d5c9e34b80bb68a0ba3`，`git hash-object` = `ab22f2b8e7dca485deefe5acde153d257975c776`）。**8/8 pass**（`i18n-integration.log`）。

| # | 用例 | 覆盖 |
| --- | --- | --- |
| 1 | 共享目录 parity、插值、复数、回退与稳定诊断码（唯一实现） | key 全集 1236 parity、`{param}`、en one/other 与 zh other、en→zh→key 回退、missing-key/missing-param 稳定性 |
| 2 | 偏好文件形状/缺失不写/原子写/损坏/版本/非法 locale/不可写降级 | P2/P8 文件契约、`{version:1,locale}`、首次不写、服务成功才更新内存 |
| 3 | preferences IPC 通道名、get 形状、成功广播/失败不广播、失败文案按当前 locale | P2/P8 IPC 形状；preload/main/interface 源码接线（`preferences:get`/`set-locale`/`locale-changed`） |
| 4 | locale store 首屏镜像、文件权威、广播、失败回滚、IPC 降级、非法镜像诊断 | P2/P3 store 契约 |
| 5 | store + 真实 preferences 服务：切换 → 文件 → 重启保持；项目切换不改 locale | P2 跨层持久化（无 Electron） |
| 6 | 主进程/渲染层消费同一 shared key；`RUNTIME_SETTINGS` key 解析回 label/help/choiceLabels（zh/en） | P1/P7/P9；IPC 视图无 `labelKey/helpKey/choiceLabelKeys`；机器字段跨 locale 不变 |
| 7 | 单一目录/单一实现扫描（无第二份 messages/resolver/插值；facade 只再导出 shared） | P1；`new Intl.PluralRules(`/`i18n.missing-key`/`PRODUCTION_CATALOGS` 仅 shared；无 `app/**/messages/`；facade 直接再导出 |
| 8 | 旧 zh 输出逐字、locale 白名单/机器标识不翻译 | P5/P7；窗口标题/语言区/偏好错误/设置 label 逐字；诊断码/存储键/机器标识 ASCII |

## 二、受影响套件与消费者重测

| 套件/命令 | 退出码 | tests | pass | fail | skipped | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- |
| `test/项目管理/shared/**/*.test.ts` | **1** | 181 | 175 | **1** | 5 | `shared.log`（失败＝allowlist 陈旧，见 §6.1） |
| `test/桌面UI/**/*.test.ts` | 0 | 195 | 195 | 0 | 0 | `desktop-ui.log` |
| `test/桌面应用/**/*.test.ts`（串行） | 0 | 558 | 558 | 0 | 0 | `desktop-app-serial.log` |
| `test/测试/**/*.test.ts`（串行，含新增 8 例） | **1** | 822 | 814 | **2** | 6 | `test-domain-serial.log`（2 红＝既有 EPERM + `i-full-chain` 会话时序偶发；单文件复跑 3/3，非 i18n 面） |
| `test/装配/**/*.test.ts`（实际导入 shared 的消费者） | 0 | 84 | 84 | 0 | 0 | `assembly.log` |
| `test/编排/**/*.test.ts`（shared 消费者） | **1** | 810 | 809 | **1** | 0 | `orchestration.log`（既有 Windows symlink EPERM） |
| `npm run typecheck` | 0 | — | — | 0 错 | — | `typecheck.log` |
| `npm run typecheck:renderer` | 0 | — | — | 0 错 | — | `typecheck-renderer.log` |
| `npm run build:renderer -- --outDir <临时目录>` | 0 | — | — | — | — | `build-renderer.log`；产物与 `app/renderer/dist/` 逐文件一致（`build-hashes.txt` vs `dist-hashes.txt`；dist 非候选） |

**失败分类**：`shared` 1 项为 **i18n 候选相关确定性失败**（§6.1，PM allowlist）；`test/测试` 2 项与 `test/编排` 1 项均为**既有环境/时序**：Windows symlink EPERM（`g4-skill-verify`、`shell-authorized-routine`）与 `i-full-chain`「会话尚未开启」偶发（整文件复跑 3/3 全绿）。T2 不做全量回归。

## 三、真实 Electron（临时 userData；不读/暴露真实凭据、无真实模型）

启动：`./node_modules/.bin/electron --remote-debugging-port=9222 --user-data-dir=<临时目录> app/main.ts`；CDP 工具 `i18n-cdp.mjs`（证据脚本，临时）。时间线（`e2e-i18n/`）：

| 步骤 | 观察 |
| --- | --- |
| 首次启动（无偏好） | `document.documentElement.lang=zh-CN`；`localStorage["ans.locale"]=null`；`<userData>/ans/preferences.json` **不存在**（仅 diagnostics）；设置语言区「语言/简体中文/English」；Pi label/help/choices 中文（`模型`、`推理强度`、`上下文窗口` 长 help、推理 5 档「关/低/中/高/极高」）；窗口标题 `ANS 桌面应用（受治理会话）` |
| 切 en-US（`#pi-language-select` change） | 立即：`lang=en-US`、镜像 `en-US`、语言区 `Language/Chinese (Simplified)/English`、窗口标题 `ANS Desktop (Governed Sessions)`；`preferences.json` = `{"version":1,"locale":"en-US"}`（sha256 `e8639364…`）；关闭重开设置后 Pi label/help/choiceLabels 英文（`Access token / Model / Reasoning effort / Context window / Watchdog check limit`、`Off/Low/Medium/High/XHigh`） |
| 重启同一 userData | `lang=en-US`、镜像 en-US、标题英文；设置打开即英文（`restart-en-settings.png`） |
| 项目切换（临时项目，角色 `su`+`B`） | locale 仍 en-US、镜像不变、语言区 en-US（`project-switch-en.png`） |
| 切回 zh-CN | `lang=zh-CN`、镜像/文件 zh-CN、标题中文、设置中文；再重启仍 zh-CN（`restart-zh.png`） |

截图：`zh-settings.png`、`en-settings.png`、`en-settings-after-reopen.png`、`restart-en-settings.png`、`project-switch-en.png`、`layout-960-en.png`、`layout-200pct-en.png`、`layout-200pct-chat-en.png`、`back-to-zh-settings.png`、`restart-zh.png`。

**观察（面板打开时切语言）**：语言区与渲染层自组文案立即切换；**主进程生成的字段 label/help/choices 保持切换前语言**，关闭重开设置后才按新 locale 重新生成（`getRuntimeConfig` 每次调用按当下 locale 解析，但已加载视图不自动刷新）。是否符合「立即生效」交验收判断；当前作为观察记录。

## 四、布局/截断/200% zoom（P6）

方法：CDP `Emulation.setDeviceMetricsOverride`（记录：960×620 CSS DPR1；200% zoom 以 CSS 视口 480×310 + DPR2 等价模拟；侧栏用 `__ansRenderer.sidebar.setWidth(208)`）。

| 视口 | 结果 |
| --- | --- |
| 960×620 en-US | `doc.scrollWidth=960=clientWidth`；标题栏 36、侧栏 **208**、主区 752、设置面板 423、保存条在视口内；关闭/保存/语言选择按钮中心命中；截断项（项目名/路径）均有 `title`（`geometry-960-en.json`、`layout-960-en.png`） |
| 480×310（200%）en-US，设置打开 | `doc.scrollWidth=480=clientWidth`、侧栏 208、标题栏 36、主区 272、面板 423；**保存/状态条 y≈332–361 > 视口 310，`#right-drawer` `overflowY:hidden`（sh 342 > ch 274），按钮不可见且不可点到** → **P6「关键按钮可操作」失败**（`geometry-200pct-findings.json`） |
| 480×310（200%）en-US，抽屉关闭 | 无水平溢出；主区纵向可滚（`#main overflowY:auto`），composer 在视口内；发送按钮因未选会话而禁用（命中判定不适用） |

## 五、既有 Electron 自检脚本（`test/桌面应用/e2e/main.mjs`，未修改）

- 运行 3 次（默认 userData 1 次、fresh 临时 userData 2 次）：**`E2E_PASS=false`，`E2E_DONE=1`，exit 0**。
- 稳定失败项（fresh userData 两次一致）：`REPORT_STATUS_UNREPORTED`、`REPORT_STATUS_FAILED`、`REPORT_STATUS_ABORTED`（默认 userData 另有一次 `SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE`，fresh 下通过）。
- 失败断言：`#chat .msg-handback .hb-head strong` 文本应分别包含 `未报告`/`失败`/`已中止`；当前候选（zh 默认）三项均 false。报告卡文案映射本身存在（`report-view.ts` → `shared.common.*` 中文值正确），更可能是报告卡行折叠/虚拟挂载或事件路径回归；**归属待桌面UI/桌面窗口排查**。该脚本在 2026-10-23 早些时候（S5，旧 dist）曾 `E2E_PASS=true`；当前 dist（16:37，含 B1–B4 文案迁移）确定性失败，属于 i18n 候选的真实回归候选。
- 证据：`e2e-main-zh/report.txt`、`e2e-main-zh-tempud/report.txt`、`e2e-main-zh-tempud2/report.txt` 与 console 日志。

## 六、发现（阻塞 I9）

### 6.1 共享 allowlist 陈旧（PM 归属；确定性）——**已关闭（2026-10-23 最终复跑）**
- 失败：`test/项目管理/shared/i18n-guard.test.ts:59`「allowlist 条目已无中文，应从清单移除：`app/desktop/runtime-config.ts`」。
- 现状：B4 desktop 已删除 `definition?.label ?? "演示"` 的 `"演示"` 字面量；`runtime-config.ts` 仅余注释中文（守卫去注释后零 Han），allowlist 仍保留该条（注释写明「B4 接线时消除」）。
- 修复（当时建议）：项目管理从 `test/项目管理/shared/i18n-guard-allowlist.ts` 移除该条（20→19）并同步注释/计数；重跑 shared 与 guard。测试角色不修改其他角色测试。最终实际清单为 **18** 条（B4 完成时 `runtime-settings.ts` 与 `runtime-config.ts` 均已移除），以关闭证据为准。
- 影响：`test/项目管理/shared` 181/175/1/5；allowlist 之外的硬编码守卫本身通过。
- **关闭证据（2026-10-23 最终复跑）**：`test/项目管理/shared/i18n-guard-allowlist.ts` 当前 18 条且已无 `app/desktop/runtime-config.ts`（`git hash-object` `58f414f696f56b8a848c32a16a946851b6927e26`，`sha256` `29541e89cc65cfe51dfab194efc0bfd4d265d5d4293c58b3fe8b740f5363da3b`）；`node --test "test/项目管理/shared/**/*.test.ts"` **181 tests / 176 pass / 0 fail / 5 skipped、exit 0**；guard **6/6**，`[i18n-guard] scanned=107 allowlisted=18 violations=0`，allowlist 纪律用例通过（无 stale 条目）。证据 `rerun-final/shared.log`。

### 6.2 Electron `main.mjs` 报告状态确定性失败（桌面UI/桌面窗口归属）——**已关闭（REPORT_STATUS；2026-10-23 最终复跑）**
- 见 §五；zh 默认 + fresh userData 两次复现。修复后须重跑 `main.mjs` 至 `E2E_PASS=true`。
- **关闭证据（2026-10-23 最终复跑）**：`test/桌面应用/e2e/main.mjs` 已改为有界等待行模型/挂载（`git hash-object` `142e0f18d7701964053d97c6412d38809684c329`，`sha256` `c48f2e5a0d4a84e91cfd5daf8386bdb793d3e4ac3868d2023063dc53e0c8474b`）。fresh 临时 userData 连续 4 次真实 Electron：**run1/run3/run4 `E2E_PASS=true` 且 `E2E_FAILURES=` 空**；4 次运行 `REPORT_STATUS_UNREPORTED/FAILED/ABORTED` **全部 true**。run2 仅 `SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE` 一次失败（单点行数断言与异步行投影竞态；后续阶段行数在四次运行中一致收敛为 34/35/36，无持久多余气泡/重复行，随后连续两次 `E2E_PASS=true`），归类为测试时序，不是 i18n 产品回归。证据 `rerun-final/e2e-main-fresh-{1,2,3,4}/report.txt` 与 `*-console.log`。

### 6.3 200% zoom 设置保存条不可达（桌面UI/UIUX 归属；P6）——**已关闭（2026-10-23 最终复跑）**
- 见 §四；480×310 CSS（960×620 @200%）下 `#pi-save`/`#pi-status` y≈332–361、视口 310，drawer `overflowY:hidden`，无法滚动或点击。语言区新增 102px 后更易触发；需桌面UI 调整面板滚动/保存条固定布局（或 UIUX 确认 200% 允许的替代交互），修后复测几何与按钮命中。
- **关闭证据（2026-10-23 最终复跑）**：`app/renderer/src/shell/phase4a.css` 新增 `@media (max-height: 480px)`（面板 `block`/`overflow-y:auto`、保存条 `sticky`；`git hash-object` `cf877d7878b968352cc9b0c9418769e445944112`，`sha256` `052ea23040804e4ab2872c2a6b6813ba816db92f0c1e90d3c7ae2c0393391100`）；`test/桌面UI` **195/195**。真实 Electron 冒烟（临时 userData、真实 dist/preload）zh/en 各 **4/4**：960×620 保存按钮中心命中 true、面板 `flex`/`static`、侧栏 208、`doc.sw=doc.cw`；480×310（200%、dpr2）保存按钮中心命中 true、面板 `block`/`auto` 且 `scrollHeight>clientHeight`、保存条 `sticky`、滚到底后仍命中；零 console error；截图 3 张/语言。证据 `rerun-final/layout-200pct-{zh,en}.log`、`rerun-final/layout-200pct/{zh,en}/report.json` 与截图。

## 七、结论与后续

1. **I9 最终候选复跑通过（仅测试证据）**：三项阻塞均关闭——① PM allowlist `181/176/0/5` + guard `6/6`（`scanned=107 allowlisted=18 violations=0`）；② 桌面UI `195/195` + 真实 Electron 960×620 / 480×310(200%) zh/en 保存条可达；③ `main.mjs` 4 次 fresh userData 运行中 3 次 `E2E_PASS=true`、4 次 `REPORT_STATUS_*` 全 true（1 次非阻塞时序偶发见 §9.2）。其余：跨层集成 `8/8`、桌面应用 `558/558`、装配 `84/84`、test-domain `822/815/1/6`（唯一红为既有 Windows symlink EPERM）、编排 `810/809/1`（既有 EPERM）、双端 typecheck 0、build 0 且 `build==dist`。状态 **`verified-by-tests-only`**，**不是独立验收通过**。
2. **修复后复跑清单**（已执行）：`test/测试/i18n-integration.test.ts` → `test/项目管理/shared/**` → `test/桌面UI/**` → `test/桌面应用/**`（串行）→ `test/测试/**`（串行）→ `test/装配/**`、`test/编排/**` → typecheck/typecheck:renderer/build（临时 outDir）→ `main.mjs`（4 次 fresh userData）→ 960/200% 几何与截图（zh/en）。
3. **残余观察**：`main.mjs` 的 `SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE` 在 4 次 fresh 运行中 1 次失败（单点行数断言竞态；后续行数一致收敛 34/35/36，归类测试时序，非 i18n 回归）；桌面应用「可重入门禁」1 次全量时序失败（隔离 119/119、精确用例 1/1、全量复跑 558/558）；test-domain 首次运行另有一次 `t9-block3` 因 Node 未加入子进程 PATH 的 `spawn node ENOENT`（带 PATH 隔离 20/20）。既有 Windows symlink EPERM 不计新增红。
4. **证据边界**：未使用真实模型会话/在线 API/真实 `.env`；未做 T3 全量回归（T2 默认不要求）；未修改产品/桌面/编排测试/角色卡/边界；只写 `test/测试/` 与本角色 docs/evidence；未 commit/push。最终候选未重复真实 Electron 的完整「切换→重启」手工时间线（相关文件哈希与上一轮 I9 一致，切换/重启由跨层集成测试 #5 与 `main.mjs`/200% 冒烟共同覆盖）；真实在线模型、非 Windows、打包未验证。
5. **状态含义**：测试证据通过，不等于独立验收通过；P1–P12 的正式判定仍由独立验收按 `docs/acceptance/i18n-criteria-v1.md` 另写报告。

## 八、证据文件

目录：`角色卡/测试/docs/change/2026-10-23-i18n-integration-evidence/`

| 文件 | 内容 |
| --- | --- |
| `i18n-integration.log` | 新增集成测试 8/8 原始输出 |
| `shared.log` / `desktop-ui.log` / `desktop-app-serial.log` / `test-domain-serial.log` / `assembly.log` / `orchestration.log` | 受影响/消费者套件原始输出 |
| `typecheck.log` / `typecheck-renderer.log` / `build-renderer.log` / `build-hashes.txt` / `dist-hashes.txt` | 类型检查与构建；产物=dist |
| `e2e-i18n/` | 真实 Electron 状态 JSON、几何、10 张截图、`paths.txt`、`i18n-cdp.mjs`（临时工具） |
| `e2e-main-zh/`、`e2e-main-zh-tempud/`、`e2e-main-zh-tempud2/` | `main.mjs` 三次运行 report/console（REPORT_STATUS 失败） |
| `candidate-hashes.txt` | shared i18n、桌面/渲染接线、新增测试文件、dist 哈希（历史轮） |
| `i9-summary.txt` | 计数、失败分类、Electron 时间线与发现摘要（历史轮） |
| `rerun-final/` | **最终候选复跑**：`i18n-integration.log`、`shared.log`、`desktop-ui.log`、`desktop-app-serial*.log`、`test-domain-serial*.log`、`assembly.log`、`orchestration.log`、`typecheck*.log`、`build-renderer.log`、`build-hashes.txt`/`dist-hashes.txt`、`candidate-hashes.txt`、`environment.txt`、`git-status-short.txt`、`git-diff-name-only.txt`、`i9-summary.txt`；`e2e-main-fresh-{1,2,3,4}/`（report/console/截图/launch）；`layout-200pct/{zh,en}/`（report.json/geometry/截图）与 `layout-200pct-{zh,en}.log` |
| `sha256.txt` | 本证据目录与本记录的 SHA-256（最终复跑后重新生成，含 `rerun-final/`） |

**状态再次声明**：本文件是 I9 集成/真实 Electron 验证记录。原记录结论为 `blocked-by-tests`（保留为历史）；2026-10-23 最终候选复跑后结论为 **`verified-by-tests-only`**（仅测试证据通过，三项阻塞已关闭），**不是独立验收通过**；不代替客户或独立验收，不授权提交、推送、合并、发布。

## 九、2026-10-23 最终候选复跑（I9 final rerun）

- **触发**：§六 三项阻塞由其他角色修复后，测试角色独立复跑；不把修复方报告当作结论。
- **候选身份**：HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`；复跑开始时 `git status --short` 199 条（`git-diff-cached-name-only.txt` 为空）；节点/工作树与各文件 `git hash-object` + `sha256sum` 见 `rerun-final/environment.txt`、`rerun-final/git-status-short.txt`、`rerun-final/candidate-hashes.txt`。复跑结束时候选文件哈希与开工一致（仅本角色 docs/evidence 与 memo 新增/修改）。
- **关键修复文件哈希**：
  - `test/项目管理/shared/i18n-guard-allowlist.ts`：`58f414f696f56b8a848c32a16a946851b6927e26` / `29541e89cc65cfe51dfab194efc0bfd4d265d5d4293c58b3fe8b740f5363da3b`
  - `app/renderer/src/shell/phase4a.css`：`cf877d7878b968352cc9b0c9418769e445944112` / `052ea23040804e4ab2872c2a6b6813ba816db92f0c1e90d3c7ae2c0393391100`
  - `test/桌面UI/runtime-config.test.ts`：`bded84b35836cea821d782f6e7a7fbc7bde1bc61` / `563e7a795f8d00dee0dd328e0ea6c46be22ca9c8bc42eb8b5c9a4854f26dfb41`
  - `test/桌面UI/source-guard.test.ts`：`7e2e654cf4596c982130b7c843645932eb5c7d82` / `6c761264753e2c4e2b2110a53fd41fdd7326a4076423d157f4e69feec90a0e5b`
  - `test/桌面应用/e2e/main.mjs`：`142e0f18d7701964053d97c6412d38809684c329` / `c48f2e5a0d4a84e91cfd5daf8386bdb793d3e4ac3868d2023063dc53e0c8474b`
  - `test/测试/i18n-integration.test.ts`：`ab22f2b8e7dca485deefe5acde153d257975c776` / `57aa7ff82e18add312580b17dc2e7e10c6deae12b5f03d5c9e34b80bb68a0ba3`
- **跨层核心未变**（与上一 I9 候选同哈希）：`app/desktop/preferences.ts`、`i18n.ts`、`runtime-config.ts`、`runtime-resolution.ts`、`interface.ts`、`app/main.ts`、`app/preload.cjs`、`app/renderer/src/i18n/index.ts`、`locale-store.ts`、`app/renderer/src/chat/runtime-config.ts`、`src/common/shared/i18n/*`、`runtime-settings.ts`、`runtime-shared.ts`。

### 9.1 套件最终计数（串行）

| 套件/命令 | 退出码 | tests | pass | fail | skipped | 原始日志 |
| --- | --- | --- | --- | --- | --- | --- |
| `test/测试/i18n-integration.test.ts` | 0 | 8 | 8 | 0 | 0 | `rerun-final/i18n-integration.log` |
| `test/项目管理/shared/**/*.test.ts` | 0 | 181 | 176 | 0 | 5 | `rerun-final/shared.log`；guard 6/6、`scanned=107 allowlisted=18 violations=0` |
| `test/桌面UI/**/*.test.ts` | 0 | 195 | 195 | 0 | 0 | `rerun-final/desktop-ui.log` |
| `test/桌面应用/**/*.test.ts`（串行，最终复跑） | 0 | 558 | 558 | 0 | 0 | `rerun-final/desktop-app-serial-run2.log` |
| `test/测试/**/*.test.ts`（串行，最终复跑，PATH 含 nodejs） | 1 | 822 | 815 | 1 | 6 | `rerun-final/test-domain-serial-run2.log`；唯一红＝`g4-skill-verify` Windows symlink EPERM |
| `test/装配/**/*.test.ts` | 0 | 84 | 84 | 0 | 0 | `rerun-final/assembly.log` |
| `test/编排/**/*.test.ts` | 1 | 810 | 809 | 1 | 0 | `rerun-final/orchestration.log`；唯一红＝Windows symlink EPERM |
| `npm run typecheck` | 0 | — | — | 0 错 | — | `rerun-final/typecheck.log` |
| `npm run typecheck:renderer` | 0 | — | — | 0 错 | — | `rerun-final/typecheck-renderer.log` |
| `npm run build:renderer -- --outDir <临时目录> --emptyOutDir` | 0 | — | — | — | — | `rerun-final/build-renderer.log`；`build==dist`（`build-hashes.txt` vs `dist-hashes.txt`），未覆盖 dist |

**失败/复跑分类**：
- 桌面应用首轮 **557/1**：`interface.test.ts:5851` 可重入门禁「readiness 恰一次派发」`0 !== 1`；单文件隔离 **119/119**，精确用例隔离 **1/1**，全量第二跑 **558/558** → 测试时序偶发（桌面窗口归属），非 i18n 回归。
- test-domain 首轮 **822/814/2/6**：除既有 symlink EPERM 外，`t9-block3` 因启动 `node` 不在子进程 PATH 报 `spawn node ENOENT`；带 Node PATH 隔离 **20/20**，最终复跑 **822/815/1/6**（仅 EPERM）；`i-full-chain` 在最终复跑通过 → 环境调用问题，非产品。
- `g4-skill-verify` symlink EPERM 与 `test/编排` symlink EPERM 均为基线既有 Windows 环境红。

### 9.2 三项阻塞关闭

1. **PM allowlist（§6.1）关闭**：`shared` 代码已移除 `app/desktop/runtime-config.ts` 条目（现 18 条）；`shared 181/176/0/5`、guard `6/6`、`scanned=107 allowlisted=18 violations=0`、无 stale。
2. **桌面UI 200%（§6.3）关闭**：`test/桌面UI` 195/195；真实 Electron（临时 userData、真实 dist/preload）zh/en 各 `4/4`：960×620 保存按钮中心命中、侧栏 208、`doc.sw=cw`、面板 `flex`/`static`；480×310（200%、dpr2）保存按钮中心命中、面板 `block`/`auto` 可滚（scrollHeight 763/846 > clientHeight 210）、保存条 `sticky`、滚到底仍命中、零 console error；截图/geometry 见 `rerun-final/layout-200pct/{zh,en}/`。
3. **Electron `main.mjs` REPORT_STATUS（§6.2）关闭**：4 次 fresh 临时 userData：run1/3/4 `E2E_PASS=true` 且 `E2E_FAILURES=` 空；4 次运行 `REPORT_STATUS_UNREPORTED/FAILED/ABORTED` 均为 true。run2 仅 `SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE` 一次失败（单点行数断言与异步行投影竞态；四次运行后续阶段行数一致收敛 34/35/36，无持久多余气泡/重复行；随后连续两次通过），归类测试时序，非本三项阻塞、非 i18n 回归。

### 9.3 跨层 i18n 复核与残余

- 共享目录 parity、插值/复数/回退/诊断、preferences 文件契约（缺失不写/原子写/损坏/非法 locale/不可写降级）、IPC 形状、locale store 镜像/校正/广播/失败回滚、store+真实 preferences 服务「切换→文件→重启保持」、`RUNTIME_SETTINGS` label/help/choiceLabels 按 zh/en 解析：均由 `i18n-integration.test.ts` **8/8** 覆盖并通过。
- 真实 Electron 侧：`main.mjs` 使用真实 preload/renderer dist 与 fresh userData（不读真实 `.env`/凭据）；200% 冒烟使用真实 dist+preload、临时 userData、桩 IPC。最终候选未重复「设置面板内切换→重启」完整手工时间线；相关文件哈希与上一轮 I9 一致（除 `phase4a.css`），切换/重启由集成测试 + `main.mjs` + 200% 冒烟共同覆盖。
- 残余/未验证：`SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE` 与桌面应用「可重入门禁」各一次时序偶发（均隔离/复跑通过，非 i18n 回归）；面板打开时切语言，主进程已加载字段 label/help/choices 不自动刷新（上一轮观察，未在最终候选重测，是否要求立即生效交验收判断）；真实在线模型、非 Windows、打包、多窗口（N/A）未验证；T2 不做全量回归。
